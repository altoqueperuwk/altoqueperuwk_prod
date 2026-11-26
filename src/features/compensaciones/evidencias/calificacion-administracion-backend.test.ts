import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

describe.runIf(Boolean(process.env.CALIFICACIONES_TEST_PG))("Calificaciones: administración PostgreSQL con rollback", () => {
    it("edita, rechaza y reabre sin conservar ganancias; valida identidad, versión, periodo y liquidación", async () => {
        const require = createRequire(import.meta.url);
        const { connection } = require("../../../../refactorizacion_compensaciones/scripts/db-development.cjs");
        const c = connection(process.env.CALIFICACIONES_TEST_PG);
        try {
            await c.connect();
            await c.query("BEGIN");
            await c.query(await readFile("backend/backend_implementacion/36.compensaciones_calificaciones_administracion.sql", "utf8"));
            const source = await readFile("backend/backend_implementacion/27.compensaciones_evidencias_funciones.sql", "utf8");
            const getter = source.match(/CREATE OR REPLACE FUNCTION public\.f_get_compensacion_calificaciones\([\s\S]*?\n\$\$;/)![0];
            await c.query(getter);
            const admin = (await c.query("SELECT id,auth_user_id FROM tb_usuario WHERE id_rol=1 AND auth_user_id IS NOT NULL ORDER BY id LIMIT 1")).rows[0];
            const other = (
                await c.query(
                    "SELECT id,auth_user_id FROM tb_usuario WHERE id_rol<>1 AND NOT coalesce(flag_super_admin,false) AND auth_user_id IS NOT NULL ORDER BY id LIMIT 1",
                )
            ).rows[0];
            const identity = async (user: { auth_user_id: string }) =>
                c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [
                    user.auth_user_id,
                    JSON.stringify({ sub: user.auth_user_id, role: "authenticated" }),
                ]);
            await identity(admin);
            const fixture = (
                await c.query(
                    `INSERT INTO tb_compensacion_evento(id_tipo_evento,id_colaborador_beneficiario,
                fecha_evento,periodo_imputacion,descripcion,datos,criterios_validacion_snapshot,estado_evento,importe_aprobado,id_usuario_registra)
                SELECT t.id,c.id,'2090-01-05 14:00Z','2090-01-01','QA rollback','{"estrellas":5,"cliente_documento":"01234567"}',
                '{"validez_calificacion":{"dni_obligatorio":true},"sentinela":"conservar"}','APROBADO',2,$1
                FROM tb_compensacion_evento_tipo t CROSS JOIN LATERAL(SELECT id FROM tb_compensacion_colaborador ORDER BY id LIMIT 1)c
                WHERE t.codigo='CALIFICACION_PRESENCIAL' RETURNING id,id_colaborador_beneficiario`,
                    [other.id],
                )
            ).rows[0];
            const version = async () => (await c.query("SELECT fecha_actualizacion::text v FROM tb_compensacion_evento WHERE id=$1", [fixture.id])).rows[0].v;
            const invoke = "SELECT f_patch_compensacion_calificacion_administrar($1,$2,$3,$4,$5,$6,$7) v";
            const args = async (action: string) => [fixture.id, action, await version(), "QA rollback", 4, "01234567", "Comentario editado"];
            const denied = async (params: unknown[], message: RegExp) => {
                await c.query("SAVEPOINT negative");
                await expect(c.query(invoke, params)).rejects.toThrow(message);
                await c.query("ROLLBACK TO SAVEPOINT negative");
            };
            const stale = await args("EDITAR");
            await c.query("SET LOCAL ROLE authenticated");
            expect((await c.query("SELECT f_get_compensacion_calificaciones() v")).rows[0].v.puede_administrar).toBe(true);
            await c.query(invoke, stale);
            await c.query("RESET ROLE");
            const edited = (await c.query("SELECT * FROM tb_compensacion_evento WHERE id=$1", [fixture.id])).rows[0];
            expect(edited.estado_evento).toBe("PENDIENTE");
            expect(edited.importe_aprobado).toBeNull();
            expect(edited.datos.estrellas).toBe(4);
            expect(edited.descripcion).toBe("Comentario editado");
            expect(edited.criterios_validacion_snapshot.sentinela).toBe("conservar");
            await denied(stale, /cambió/);
            await denied([fixture.id, "EDITAR", await version(), "QA", 6, "01234567", ""], /Estrellas/);
            await denied([fixture.id, "EDITAR", await version(), "QA", 5, "123", ""], /DNI/);
            await denied([fixture.id, "EDITAR", await version(), " ", 5, "01234567", ""], /motivo/);
            await c.query("UPDATE tb_compensacion_evento SET estado_evento='APROBADO',importe_aprobado=2 WHERE id=$1", [fixture.id]);
            await c.query(invoke, await args("RECHAZADO"));
            expect((await c.query("SELECT estado_evento,importe_aprobado FROM tb_compensacion_evento WHERE id=$1", [fixture.id])).rows[0]).toEqual({
                estado_evento: "RECHAZADO",
                importe_aprobado: null,
            });
            await c.query(invoke, await args("PENDIENTE"));
            const history = (await c.query("SELECT datos_decision FROM tb_compensacion_evento_revision WHERE id_evento=$1 ORDER BY numero_paso", [fixture.id]))
                .rows;
            expect(history).toHaveLength(3);
            expect(history[0].datos_decision.anterior.importe_aprobado).toBe(2);
            expect(history[1].datos_decision.accion).toBe("RECHAZADO");
            const nonAdminArgs = await args("EDITAR");
            await identity(other);
            await c.query("SET LOCAL ROLE authenticated");
            await denied(nonAdminArgs, /administrador|permiso|acceso/i);
            await c.query("RESET ROLE");
            await identity(admin);
            await c.query("UPDATE tb_compensacion_evento SET id_usuario_registra=$1 WHERE id=$2", [admin.id, fixture.id]);
            await denied(await args("RECHAZADO"), /registró/);
            await c.query("UPDATE tb_compensacion_evento SET id_usuario_registra=$1 WHERE id=$2", [other.id, fixture.id]);
            await c.query("UPDATE tb_compensacion_evento SET estado_evento='LIQUIDADO',importe_aprobado=2 WHERE id=$1", [fixture.id]);
            await denied(await args("EDITAR"), /estado actual/);
            await c.query("UPDATE tb_compensacion_evento SET estado_evento='PENDIENTE',importe_aprobado=NULL WHERE id=$1", [fixture.id]);
            const period = (
                await c.query(
                    `INSERT INTO tb_compensacion_periodo(periodo,nombre,fecha_inicio,fecha_fin,id_usuario_abre,estado_periodo,fecha_aprobacion,fecha_cierre)
                VALUES('2090-01-01','QA rollback','2090-01-01','2090-01-31',$1,'CERRADO',now(),now()) RETURNING id`,
                    [admin.id],
                )
            ).rows[0];
            await denied(await args("EDITAR"), /periodo/);
            await c.query("UPDATE tb_compensacion_periodo SET estado_periodo='ABIERTO' WHERE id=$1", [period.id]);
            const liq = (
                await c.query(
                    `INSERT INTO tb_compensacion_liquidacion(id_periodo,id_colaborador,numero_calculo,colaborador_snapshot)
                VALUES($1,$2,1,'{}') RETURNING id`,
                    [period.id, fixture.id_colaborador_beneficiario],
                )
            ).rows[0];
            await c.query(
                `INSERT INTO tb_compensacion_liquidacion_detalle(id_liquidacion,id_concepto,tipo_origen,clave_origen,id_evento,
                concepto_codigo_snapshot,concepto_nombre_snapshot,categoria_snapshot,naturaleza_snapshot,importe)
                SELECT $1,id_concepto,'EVENTO','QA rollback',$2,'QA','QA','BONO','INGRESO',2
                FROM tb_compensacion_evento_tipo WHERE codigo='CALIFICACION_PRESENCIAL'`,
                [liq.id, fixture.id],
            );
            await denied(await args("EDITAR"), /liquidación vigente/);
            const anonArgs = await args("EDITAR");
            await c.query("SET LOCAL ROLE anon");
            await denied(anonArgs, /permission denied/);
        } finally {
            await c.query("ROLLBACK").catch(() => {});
            await c.end();
        }
    }, 60000);
});
