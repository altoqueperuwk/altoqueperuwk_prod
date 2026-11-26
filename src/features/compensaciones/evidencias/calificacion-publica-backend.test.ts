import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

describe.runIf(Boolean(process.env.CALIFICACIONES_TEST_PG))("Calificaciones públicas: PostgreSQL con rollback", () => {
    it("asesor sin EVIDENCIAS recupera solo su enlace estable, rota con revocación y deniega otros cargos", async () => {
        const require = createRequire(import.meta.url);
        const { connection } = require("../../../../refactorizacion_compensaciones/scripts/db-development.cjs");
        const c = connection(process.env.CALIFICACIONES_TEST_PG);
        try {
            await c.connect();
            await c.query("BEGIN");
            const source = await readFile("backend/backend_implementacion/35.compensaciones_calificaciones_publicas.sql", "utf8");
            await c.query(source.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, ""));
            // Fixture de identidad SOLO transaccional: asesores migrados aún sin vínculo Auth.
            await c.query(`UPDATE tb_usuario u SET auth_user_id=a.id FROM auth.users a
                WHERE u.auth_user_id IS NULL AND lower(u.email)=lower(a.email)
                AND u.username='atc_nicolle'`);
            const users = (await c.query("SELECT id,auth_user_id FROM tb_usuario WHERE auth_user_id IS NOT NULL ORDER BY id")).rows;
            let advisor: { id: unknown; auth_user_id: string } | undefined;
            for (const user of users) {
                await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [
                    user.auth_user_id,
                    JSON.stringify({ sub: user.auth_user_id, role: "authenticated" }),
                ]);
                if ((await c.query("SELECT f_private_compensacion_calificacion_propia() v")).rows[0].v) {
                    advisor = user;
                    break;
                }
            }
            expect(advisor).toBeDefined();
            // El acceso propio no depende de permisos generales de registrar evidencias.
            await c.query("DELETE FROM tb_compensacion_acceso WHERE id_usuario=$1 AND recurso='EVIDENCIAS'", [advisor!.id]);
            await c.query("SET LOCAL ROLE authenticated");
            const ctx = (await c.query("SELECT f_get_compensacion_calificacion_propia_contexto() v")).rows[0].v;
            expect(Object.keys(ctx).sort()).toEqual(["asesor", "sede"]);
            const get = "SELECT f_post_compensacion_calificacion_propia($1) v";
            const first = (await c.query(get, [false])).rows[0].v;
            const second = (await c.query(get, [false])).rows[0].v;
            expect(first).toEqual(second);
            expect(first.token).toMatch(/^[a-f0-9]{64}$/);
            const rotated = (await c.query(get, [true])).rows[0].v;
            expect(rotated.token).not.toBe(first.token);
            expect((await c.query(get, [false])).rows[0].v.token).toBe(rotated.token);
            const denied = async (sql: string, params: unknown[], message: RegExp) => {
                await c.query("SAVEPOINT negative");
                await expect(c.query(sql, params)).rejects.toThrow(message);
                await c.query("ROLLBACK TO SAVEPOINT negative");
            };
            await denied("SELECT token_value FROM tb_compensacion_calificacion_enlace", [], /permission denied/);
            await denied("SELECT f_private_compensacion_calificacion_propia()", [], /permission denied/);
            await c.query("RESET ROLE");
            await denied("SELECT f_get_compensacion_calificacion_publica($1)", [first.token], /no disponible/);
            expect((await c.query("SELECT f_get_compensacion_calificacion_publica($1) v", [rotated.token])).rows[0].v.asesor).toBe(ctx.asesor);
            const admin = (await c.query("SELECT auth_user_id FROM tb_usuario WHERE id_rol=1 AND auth_user_id IS NOT NULL LIMIT 1")).rows[0];
            await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [
                admin.auth_user_id,
                JSON.stringify({ sub: admin.auth_user_id, role: "authenticated" }),
            ]);
            await c.query("SET LOCAL ROLE authenticated");
            expect((await c.query("SELECT f_get_compensacion_calificacion_propia_contexto() v")).rows[0].v).toBeNull();
            await denied(get, [false], /Solo asesores/);
            await c.query("SET LOCAL ROLE anon");
            await denied(get, [false], /permission denied/);
            await denied("SELECT f_get_compensacion_calificacion_propia_contexto()", [], /permission denied/);
        } finally {
            await c.query("ROLLBACK").catch(() => {});
            await c.end();
        }
    }, 60000);
    it("valida ACL, generación, atribución, idempotencia y revocación en desarrollo", async () => {
        const require = createRequire(import.meta.url);
        const { connection } = require("../../../../refactorizacion_compensaciones/scripts/db-development.cjs");
        const c = connection(process.env.CALIFICACIONES_TEST_PG);
        try {
            await c.connect();
            await c.query("BEGIN");
            const source = await readFile("backend/backend_implementacion/35.compensaciones_calificaciones_publicas.sql", "utf8");
            await c.query(source.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, ""));
            const actor = (
                await c.query("SELECT auth_user_id FROM tb_usuario WHERE (id_rol=1 OR flag_super_admin) AND auth_user_id IS NOT NULL ORDER BY id LIMIT 1")
            ).rows[0];
            await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [
                actor.auth_user_id,
                JSON.stringify({ sub: actor.auth_user_id, role: "authenticated" }),
            ]);
            await c.query("SET LOCAL ROLE authenticated");
            const asesores = (await c.query("SELECT f_get_compensacion_calificacion_asesores() v")).rows[0].v;
            expect(asesores.length).toBeGreaterThan(0);
            const id = asesores[0].id;
            await c.query("RESET ROLE");
            // Tarifa sintética SOLO dentro de esta transacción; no cambia pagos reales.
            const fixture = (
                await c.query(
                    `SELECT a.id_plan,pv.id version,u.id actor FROM tb_compensacion_asignacion a
                JOIN tb_compensacion_plan_version pv ON pv.id_plan=a.id_plan
                CROSS JOIN LATERAL (SELECT id FROM tb_usuario WHERE auth_user_id=$2 LIMIT 1) u
                WHERE a.id_colaborador=$1 ORDER BY a.fecha_inicio DESC,pv.numero_version DESC LIMIT 1`,
                    [id, actor.auth_user_id],
                )
            ).rows[0];
            const rule = (
                await c.query(
                    `INSERT INTO tb_compensacion_regla(id_plan_version,id_concepto,tipo_calculo,monto,prioridad,id_estado,id_usuario)
                SELECT $1,t.id_concepto,'POR_UNIDAD',2,999999,t.id_estado,$2 FROM tb_compensacion_evento_tipo t WHERE codigo='CALIFICACION_PRESENCIAL' RETURNING *`,
                    [fixture.version, fixture.actor],
                )
            ).rows[0];
            await c.query(
                `INSERT INTO tb_compensacion_configuracion_efectiva(id_plan,id_plan_version_origen,fecha_desde,reglas_snapshot,id_usuario)
                VALUES($1,$2,(now() AT TIME ZONE 'America/Lima')::date,$3::jsonb,$4)`,
                [fixture.id_plan, fixture.version, JSON.stringify([rule]), fixture.actor],
            );
            await c.query("SET LOCAL ROLE authenticated");
            const token = (await c.query("SELECT f_post_compensacion_calificacion_enlace($1) v", [id])).rows[0].v.token;
            expect(token).toMatch(/^[a-f0-9]{64}$/);
            await c.query("RESET ROLE");
            const grants = (
                await c.query(`SELECT has_function_privilege('anon','public.f_post_compensacion_calificacion_publica(text,uuid,integer,text,text)','EXECUTE') anon,
                has_function_privilege('authenticated','public.f_post_compensacion_calificacion_publica(text,uuid,integer,text,text)','EXECUTE') auth,
                has_function_privilege('service_role','public.f_post_compensacion_calificacion_publica(text,uuid,integer,text,text)','EXECUTE') server`)
            ).rows[0];
            expect(grants).toEqual({ anon: false, auth: false, server: true });
            await c.query("SET LOCAL ROLE service_role");
            const info = (await c.query("SELECT f_get_compensacion_calificacion_publica($1) v", [token])).rows[0].v;
            expect(Object.keys(info).sort()).toEqual(["asesor", "politica", "sede"]);
            const key = randomUUID();
            const args = [token, key, 5, "01234567", "QA transaccional rollback"];
            const post = "SELECT f_post_compensacion_calificacion_publica($1,$2,$3,$4,$5) v";
            expect((await c.query(post, args)).rows[0].v).toEqual({ recibido: true });
            expect((await c.query(post, args)).rows[0].v).toEqual({ recibido: true });
            await c.query("RESET ROLE");
            const event = (
                await c.query(`SELECT e.* FROM tb_compensacion_evento e JOIN tb_compensacion_calificacion_envio x ON x.id_evento=e.id WHERE x.clave=$1`, [key])
            ).rows;
            expect(event).toHaveLength(1);
            expect(String(event[0].id_colaborador_beneficiario)).toBe(String(id));
            expect(event[0].estado_evento).toBe("PENDIENTE");
            expect(event[0].importe_aprobado).toBeNull();
            expect(event[0].fuente).toBe("CLIENTE");
            expect(event[0].datos.autor_externo).toBe(true);
            expect(event[0].criterios_validacion_snapshot.politica_tarifa).toBe("REGISTRO_V1");
            const denied = async (sql: string, params: unknown[], message: RegExp) => {
                await c.query("SAVEPOINT negative");
                await expect(c.query(sql, params)).rejects.toThrow(message);
                await c.query("ROLLBACK TO SAVEPOINT negative");
            };
            await denied(post, [token, key, 4, "01234567", "QA transaccional rollback"], /reutilizado/);
            await denied(post, [token, randomUUID(), 6, "01234567", ""], /inválida/);
            await denied(post, [token, randomUUID(), 5, "123", ""], /DNI/);
            const listed = (await c.query("SELECT f_get_compensacion_calificaciones(p_busqueda:='QA transaccional rollback') v")).rows[0].v;
            expect(listed.items.some((row: { id: unknown }) => String(row.id) === String(event[0].id))).toBe(true);
            await c.query("SELECT f_post_tb_compensacion_evento_resolver($1,'APROBADO','QA rollback',NULL,1)", [event[0].id]);
            const approved = (await c.query("SELECT estado_evento,importe_aprobado FROM tb_compensacion_evento WHERE id=$1", [event[0].id])).rows[0];
            expect(approved.estado_evento).toBe("APROBADO");
            expect(Number(approved.importe_aprobado)).toBe(2);
            const lowKey = randomUUID();
            await c.query(post, [token, lowKey, 1, "01234567", "QA calificación baja rollback"]);
            const low = (await c.query("SELECT id_evento FROM tb_compensacion_calificacion_envio WHERE clave=$1", [lowKey])).rows[0];
            await denied("SELECT f_post_tb_compensacion_evento_resolver($1,'APROBADO','QA rollback',NULL,1)", [low.id_evento], /validez/);
            await c.query("SET LOCAL ROLE anon");
            await denied(post, args, /permission denied/);
            await denied("SELECT * FROM tb_compensacion_calificacion_enlace", [], /permission denied/);
            await c.query("RESET ROLE");
            await c.query("SET LOCAL ROLE authenticated");
            await denied(post, args, /permission denied/);
            await c.query("RESET ROLE");
            await c.query("SELECT f_post_compensacion_calificacion_enlace($1)", [id]);
            await denied("SELECT f_get_compensacion_calificacion_publica($1)", [token], /no disponible/);
        } finally {
            await c.query("ROLLBACK").catch(() => {});
            await c.end();
        }
    }, 60000);
});
