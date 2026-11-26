import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

describe.runIf(Boolean(process.env.COMPENSACIONES_TEST_PG))("Compensaciones: permisos de Sistema sin habilitación duplicada", () => {
    it("valida rutas, perfiles, alcance y registro/revisión de tarjetas con rollback", async () => {
        const require = createRequire(import.meta.url);
        const { connection } = require("../../../../refactorizacion_compensaciones/scripts/db-development.cjs");
        const c = connection(process.env.COMPENSACIONES_TEST_PG);
        try {
            await c.connect();
            await c.query("BEGIN");
            await c.query("SELECT pg_advisory_xact_lock(hashtext('compensaciones-atc-perfil'))");
            for (const [file, names] of [
                ["01.core_catalogos_permisos.sql", ["f_private_compensacion_atc_ruta_permitida", "f_private_permiso_usuario_atc_validar"]],
                ["20.compensaciones_seguridad_personal_funciones.sql", ["f_private_compensacion_contexto"]],
                ["21.compensaciones_asignaciones_cuentas_funciones.sql", ["f_get_tb_compensacion_colaborador_ficha"]],
                [
                    "27.compensaciones_evidencias_funciones.sql",
                    ["f_get_compensacion_llamada_contexto", "f_get_compensacion_tarjeta_contexto", "f_get_compensacion_calificaciones"],
                ],
                ["37.compensaciones_llamadas_roles.sql", ["f_private_compensacion_llamada_contexto"]],
            ] as const) {
                const source = await readFile(`backend/backend_implementacion/${file}`, "utf8");
                for (const name of names) await c.query(source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))![0]);
            }
            await c.query("DELETE FROM tb_compensacion_acceso WHERE id_usuario IN(15,20,24,30)");
            const actor = async (id: number, role = "postgres") => {
                await c.query("RESET ROLE");
                const uuid = (await c.query("SELECT auth_user_id FROM tb_usuario WHERE id=$1", [id])).rows[0].auth_user_id;
                await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [
                    uuid,
                    JSON.stringify({ sub: uuid, role: "authenticated" }),
                ]);
                if (role === "authenticated") await c.query("SET LOCAL ROLE authenticated");
            };
            const denied = async (sql: string, args: unknown[], message: RegExp) => {
                await c.query("SAVEPOINT denied");
                await expect(c.query(sql, args)).rejects.toThrow(message);
                await c.query("ROLLBACK TO SAVEPOINT denied");
            };
            for (const id of [20, 15, 24, 30]) {
                await actor(id);
                for (const resource of [
                    "RESUMEN",
                    "COLABORADORES",
                    "ASISTENCIA",
                    "EVIDENCIAS",
                    "INCIDENCIAS",
                    "LIQUIDACIONES",
                    "CIERRES",
                    "CONFIGURACION",
                    "REPORTES",
                ]) {
                    if ([24, 30].includes(id) && ["INCIDENCIAS", "CIERRES", "CONFIGURACION", "REPORTES"].includes(resource)) {
                        await denied("SELECT f_private_compensacion_contexto($1,'CONSULTAR')", [resource], /perfil/);
                        continue;
                    }
                    const ctx = (await c.query("SELECT f_private_compensacion_contexto($1,'CONSULTAR') v", [resource])).rows[0].v;
                    expect(ctx.alcance).toBe(id === 20 ? "GLOBAL" : id === 15 ? "SEDE" : "PROPIO");
                    expect(ctx.puede_aprobar).toBe(id === 20 || (id === 15 && ["EVIDENCIAS", "INCIDENCIAS"].includes(resource)));
                }
                await actor(id, "authenticated");
                const ctx = (await c.query("SELECT f_get_compensacion_tarjeta_contexto() v")).rows[0].v;
                expect(ctx.puede_registrar).toBe(true);
                expect(ctx.puede_aprobar).toBe(id === 20 || id === 15);
                await c.query("SELECT f_get_tb_compensacion_evento(p_categoria=>'TARJETA_TERCERO')");
                await c.query("SELECT f_get_compensacion_calificaciones()");
                await c.query("SELECT f_get_tb_compensacion_colaborador_ficha()");
            }
            await actor(24, "authenticated");
            const card = (
                await c.query("SELECT f_post_compensacion_tarjeta_tercero('99990031',$1,CURRENT_DATE,'QA rollback',$2) v", [`QA ${randomUUID()}`, randomUUID()])
            ).rows[0].v;
            expect(card.estado_evento).toBe("PENDIENTE");
            await denied("SELECT f_post_tb_compensacion_evento_resolver($1,'APROBADO','QA',NULL,1)", [card.id], /permiso/);
            await actor(30, "authenticated");
            const otherCard = (
                await c.query("SELECT f_post_compensacion_tarjeta_tercero('99990032',$1,CURRENT_DATE,'QA rollback aislamiento',$2) v", [
                    `QA ${randomUUID()}`,
                    randomUUID(),
                ])
            ).rows[0].v;
            const otherRecord = (await c.query("SELECT f_get_tb_compensacion_evento(p_id=>$1) v", [otherCard.id])).rows[0].v.items[0];
            await actor(24, "authenticated");
            const cardRecord = (await c.query("SELECT f_get_tb_compensacion_evento(p_id=>$1) v", [card.id])).rows[0].v.items[0];
            expect(otherRecord.id_colaborador_beneficiario).toBeTruthy();
            expect(cardRecord.id_colaborador_beneficiario).toBeTruthy();
            expect(otherRecord.id_colaborador_beneficiario).not.toBe(cardRecord.id_colaborador_beneficiario);
            for (const [userId, ownCard, foreignCard] of [
                [24, cardRecord, otherRecord],
                [30, otherRecord, cardRecord],
            ] as const) {
                await actor(userId, "authenticated");
                const own = (await c.query("SELECT f_get_tb_compensacion_evento(p_id=>$1) v", [ownCard.id])).rows[0].v;
                expect(own.items.map((row: { id: number }) => row.id)).toEqual([ownCard.id]);
                const foreign = (await c.query("SELECT f_get_tb_compensacion_evento(p_id=>$1) v", [foreignCard.id])).rows[0].v;
                expect(foreign.items).toEqual([]);
                expect(foreign.total).toBe(0);
                expect(foreign.resumen.pendientes).toBe(0);
                expect(foreign.resumen.importe_aprobado).toBe(0);
                const filtered = (
                    await c.query("SELECT f_get_tb_compensacion_evento(p_categoria=>'TARJETA_TERCERO',p_id_colaborador=>$1,p_id_sucursal=>$2) v", [
                        foreignCard.id_colaborador_beneficiario,
                        foreignCard.id_sucursal_origen,
                    ])
                ).rows[0].v;
                expect(filtered.items).toEqual([]);
                expect(filtered.total).toBe(0);
                const foreignFicha = (await c.query("SELECT f_get_tb_compensacion_colaborador_ficha(p_id=>$1) v", [foreignCard.id_colaborador_beneficiario]))
                    .rows[0].v;
                expect(foreignFicha.items).toEqual([]);
                await denied("SELECT f_post_tb_compensacion_evento_resolver($1,'APROBADO','QA aislamiento',NULL,1)", [foreignCard.id], /permiso|alcance/);
            }
            await actor(15, "authenticated");
            await c.query("SELECT f_post_tb_compensacion_evento_resolver($1,'APROBADO','QA rollback',NULL,1)", [card.id]);
            await c.query("RESET ROLE");
            await denied("SELECT f_private_compensacion_contexto('ASISTENCIA','APROBAR')", [], /permiso/);
            await denied("SELECT f_private_compensacion_contexto('LIQUIDACIONES','PAGAR')", [], /permiso/);
            // Una antigua fila de accesos no puede devolver acceso a una ruta revocada.
            await c.query(
                "DELETE FROM tb_permiso_usuario WHERE id_usuario=24 AND id_permiso_menu IN(SELECT id FROM tb_permiso_menu WHERE ruta IN('/compensaciones/evidencias','/compensaciones/llamadas','/compensaciones/tarjetas-erroneas','/compensaciones/calificaciones'))",
            );
            await c.query(
                "INSERT INTO tb_compensacion_acceso(id_usuario,recurso,alcance,puede_consultar,puede_registrar,id_estado) VALUES(24,'EVIDENCIAS','GLOBAL',true,true,1)",
            );
            await actor(24, "authenticated");
            // El contexto comun es un catalogo para las otras pantallas aun autorizadas.
            // Las consultas de datos deben comprobar la ruta especifica revocada.
            await denied("SELECT f_get_compensacion_calificaciones()", [], /Sistema/);
            await denied("SELECT f_get_compensacion_llamadas_contexto()", [], /Sistema/);
            await denied("SELECT f_get_tb_compensacion_evento(p_categoria=>'TARJETA_TERCERO')", [], /Sistema/);
            await c.query("SET LOCAL ROLE anon");
            await denied("SELECT f_get_compensacion_llamada_contexto()", [], /permission denied/);
        } finally {
            await c.query("ROLLBACK").catch(() => {});
            await c.end();
        }
    }, 60000);
});
