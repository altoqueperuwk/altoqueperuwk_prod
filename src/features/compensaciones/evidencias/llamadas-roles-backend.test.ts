import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

describe.runIf(Boolean(process.env.LLAMADAS_TEST_PG))("Llamadas: permisos reales PostgreSQL con rollback", () => {
    it("registra, aísla por sede, impide autoaprobación y permite revisión por otro jefe o administrador", async () => {
        const require = createRequire(import.meta.url);
        const { connection } = require("../../../../refactorizacion_compensaciones/scripts/db-development.cjs");
        const c = connection(process.env.LLAMADAS_TEST_PG);
        try {
            await c.connect();
            await c.query("BEGIN");
            await c.query(await readFile("backend/backend_implementacion/37.compensaciones_llamadas_roles.sql", "utf8"));
            const source = await readFile("backend/backend_implementacion/27.compensaciones_evidencias_funciones.sql", "utf8");
            for (const name of ["f_private_compensacion_evento_validar_alcance", "f_get_tb_compensacion_evento", "f_post_tb_compensacion_evento"])
                await c.query(source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))![0]);
            const actor = async (id: number) => {
                await c.query("RESET ROLE");
                const u = (await c.query("SELECT auth_user_id FROM tb_usuario WHERE id=$1", [id])).rows[0];
                expect(u.auth_user_id).toBeTruthy();
                await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [
                    u.auth_user_id,
                    JSON.stringify({ sub: u.auth_user_id, role: "authenticated" }),
                ]);
                await c.query("SET LOCAL ROLE authenticated");
            };
            const denied = async (sql: string, args: unknown[], message: RegExp) => {
                await c.query("SAVEPOINT negative");
                await expect(c.query(sql, args)).rejects.toThrow(message);
                await c.query("ROLLBACK TO SAVEPOINT negative");
            };
            const context = async () => (await c.query("SELECT f_get_compensacion_llamadas_contexto() v")).rows[0].v;
            const register = "SELECT f_post_compensacion_llamada_registrar($1,$2,$3,$4) v";
            const resolve = "SELECT f_post_tb_compensacion_evento_resolver($1,$2,$3,NULL,1) v";
            const list = "SELECT f_get_tb_compensacion_evento(p_categoria=>'LLAMADA',p_busqueda=>$1) v";
            const marker = `QA rollback llamadas ${randomUUID()}`;
            const newDni = String(90000000 + Math.floor(Math.random() * 4000000));
            const existingDni = String(95000000 + Math.floor(Math.random() * 4000000));
            expect(
                Number(
                    (await c.query("SELECT count(*) FROM tb_cliente WHERE tipo_documento=1 AND numero_documento IN($1,$2)", [newDni, existingDni])).rows[0]
                        .count,
                ),
            ).toBe(0);
            const existingClient = (await c.query("SELECT f_post_tb_cliente(1,$1,'Nombre anterior',999888777,NULL,1,20) v", [existingDni])).rows[0].v;
            const type = (await c.query("SELECT id FROM tb_compensacion_evento_tipo WHERE codigo='LLAMADA_CONTACTO'")).rows[0].id;
            await actor(30);
            const atc = await context();
            expect(atc.alcance).toBe("PROPIO");
            expect(atc.puede_aprobar).toBe(false);
            expect(atc.puede_elegir_colaborador).toBe(false);
            await denied(register, ["99990011", marker, randomUUID(), 7], /propias llamadas/);
            await denied(
                "SELECT f_post_tb_compensacion_evento(p_id_tipo_evento=>$1,p_fecha_evento=>now(),p_id_colaborador_beneficiario=>7,p_id_colaborador_responsable=>14)",
                [type],
                /propias llamadas/,
            );
            const key = randomUUID();
            const sur = (await c.query(register, [newDni, marker, key, null])).rows[0].v;
            expect(sur.estado_evento).toBe("PENDIENTE");
            expect((await c.query(register, [newDni, marker, key, null])).rows[0].v.id).toBe(sur.id);
            await denied(register, ["99990099", marker, key, null], /clave/);
            await denied(resolve, [sur.id, "APROBADO", "QA"], /permiso/);
            await denied(resolve, [sur.id, "RECHAZADO", "QA"], /permiso/);
            // El permiso de Sistema habilita todas las categorías; el alcance sigue siendo propio.
            const ratings = (await c.query("SELECT f_get_tb_compensacion_evento(p_categoria=>'CALIFICACION') v")).rows[0].v;
            expect(
                ratings.items.every(
                    (row: { id_colaborador_beneficiario: number; id_colaborador_responsable: number }) =>
                        Number(row.id_colaborador_beneficiario) === 14 || Number(row.id_colaborador_responsable) === 14,
                ),
            ).toBe(true);
            await actor(15);
            const jefe = await context();
            expect(jefe.alcance).toBe("SEDE");
            expect(jefe.puede_aprobar).toBe(true);
            expect(jefe.colaboradores.every((r: { sede: string }) => r.sede === "Sede Lince")).toBe(true);
            expect((await c.query(list, [marker])).rows[0].v.items).toHaveLength(0);
            await denied(resolve, [sur.id, "APROBADO", "QA"], /sede/);
            await denied(register, ["99990012", marker, randomUUID(), 14], /sede/);
            const own = (await c.query(register, [existingDni, marker, randomUUID(), null])).rows[0].v;
            await denied(resolve, [own.id, "APROBADO", "QA"], /registro/);
            await actor(20);
            const admin = await context();
            expect(admin.alcance).toBe("GLOBAL");
            expect(admin.puede_elegir_colaborador).toBe(true);
            expect(admin.id_colaborador === null || Number.isInteger(Number(admin.id_colaborador))).toBe(true);
            await c.query(resolve, [own.id, "APROBADO", "QA rollback"]);
            await c.query(resolve, [sur.id, "RECHAZADO", "QA rollback"]);
            const delegated = (await c.query(register, ["99990013", marker, randomUUID(), 7])).rows[0].v;
            await denied(resolve, [delegated.id, "APROBADO", "QA"], /registro/);
            await actor(15);
            await c.query(resolve, [delegated.id, "APROBADO", "QA rollback"]);
            await c.query("RESET ROLE");
            const updatedClient = (await c.query("SELECT nombre,celular,id_usuario FROM tb_cliente WHERE id=$1", [existingClient.id])).rows[0];
            expect(updatedClient.nombre).toBe(marker);
            expect(String(updatedClient.celular)).toBe("999888777");
            expect(Number(updatedClient.id_usuario)).toBe(20);
            const createdClient = (await c.query("SELECT id,nombre,id_usuario FROM tb_cliente WHERE tipo_documento=1 AND numero_documento=$1", [newDni])).rows;
            expect(createdClient).toHaveLength(1);
            expect(createdClient[0].nombre).toBe(marker);
            expect(Number(createdClient[0].id_usuario)).toBe(30);
            // Un reintento no debe revertir una edición de cliente posterior al registro.
            await c.query("SELECT f_patch_tb_cliente(p_id=>$1,p_nombre=>'Edición posterior')", [createdClient[0].id]);
            await actor(30);
            expect((await c.query(register, [newDni, marker, key, null])).rows[0].v.id).toBe(sur.id);
            await c.query("RESET ROLE");
            expect((await c.query("SELECT nombre FROM tb_cliente WHERE id=$1", [createdClient[0].id])).rows[0].nombre).toBe("Edición posterior");
            const ownApproved = (
                await c.query("SELECT id_colaborador_beneficiario,estado_evento,importe_aprobado FROM tb_compensacion_evento WHERE id=$1", [own.id])
            ).rows[0];
            expect(Number(ownApproved.id_colaborador_beneficiario)).toBe(7);
            expect(ownApproved.estado_evento).toBe("APROBADO");
            expect(Number(ownApproved.importe_aprobado)).toBeGreaterThan(0);
            const approved = (await c.query("SELECT estado_evento,importe_aprobado FROM tb_compensacion_evento WHERE id=$1", [delegated.id])).rows[0];
            expect(approved.estado_evento).toBe("APROBADO");
            expect(Number(approved.importe_aprobado)).toBeGreaterThan(0);
            const failedDni = String(85000000 + Math.floor(Math.random() * 4000000));
            expect(Number((await c.query("SELECT count(*) FROM tb_cliente WHERE tipo_documento=1 AND numero_documento=$1", [failedDni])).rows[0].count)).toBe(
                0,
            );
            await c.query("SAVEPOINT simulated_failure");
            await c.query(`CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_evento_enviar(p_id bigint,p_comentario text DEFAULT NULL)
                RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$ BEGIN RAISE EXCEPTION 'QA fallo de envío'; END; $$;`);
            await actor(30);
            await denied(register, [failedDni, marker, randomUUID(), null], /QA fallo de envío/);
            await denied(register, [existingDni, "Nombre que debe revertirse", randomUUID(), null], /QA fallo de envío/);
            await c.query("RESET ROLE");
            expect(Number((await c.query("SELECT count(*) FROM tb_cliente WHERE tipo_documento=1 AND numero_documento=$1", [failedDni])).rows[0].count)).toBe(
                0,
            );
            expect((await c.query("SELECT nombre FROM tb_cliente WHERE id=$1", [existingClient.id])).rows[0].nombre).toBe(marker);
            await c.query("ROLLBACK TO SAVEPOINT simulated_failure");
            await c.query("UPDATE tb_usuario SET id_rol=2 WHERE id=30");
            await actor(30);
            await denied("SELECT f_get_compensacion_llamadas_contexto()", [], /rol no tiene acceso/);
            await c.query("SET LOCAL ROLE anon");
            await denied("SELECT f_get_compensacion_llamadas_contexto()", [], /permission denied/);
        } finally {
            await c.query("ROLLBACK").catch(() => {});
            await c.end();
        }
    }, 60000);
});
