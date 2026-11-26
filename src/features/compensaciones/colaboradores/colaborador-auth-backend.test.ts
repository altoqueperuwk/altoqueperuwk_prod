import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

describe.runIf(Boolean(process.env.COLABORADORES_TEST_PG))("Colaboradores: vinculación Auth transaccional en desarrollo", () => {
    it("vincula al guardar, conserva permisos e identidad y rechaza inconsistencias", async () => {
        const require = createRequire(import.meta.url);
        const { connection } = require("../../../../refactorizacion_compensaciones/scripts/db-development.cjs");
        const c = connection(process.env.COLABORADORES_TEST_PG);
        try {
            await c.connect();
            await c.query("BEGIN");
            const source = await readFile("backend/backend_implementacion/20.compensaciones_seguridad_personal_funciones.sql", "utf8");
            for (const name of ["f_private_compensacion_usuario_vincular_auth", "f_post_tb_compensacion_colaborador", "f_patch_tb_compensacion_colaborador"])
                await c.query(source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))![0]);
            await c.query("REVOKE ALL ON FUNCTION f_private_compensacion_usuario_vincular_auth(bigint) FROM PUBLIC,anon,authenticated");
            const admin = (await c.query("SELECT auth_user_id FROM tb_usuario WHERE id=20")).rows[0];
            const auth = (await c.query("SELECT id FROM auth.users WHERE lower(email)='atc_ivonne@atk.com'")).rows[0];
            const before = (await c.query("SELECT id_rol,id_estado,id_sucursal,password FROM tb_usuario WHERE id=24")).rows[0];
            await c.query("UPDATE tb_usuario SET auth_user_id=NULL WHERE id=24");
            const identity = async (id: string) => c.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [id]);
            const negative = async (sql: string, args: unknown[], pattern: RegExp) => {
                await c.query("SAVEPOINT negative");
                await expect(c.query(sql, args)).rejects.toThrow(pattern);
                await c.query("ROLLBACK TO SAVEPOINT negative");
            };
            await identity(admin.auth_user_id);
            await c.query("SET LOCAL ROLE authenticated");
            await negative("SELECT f_private_compensacion_usuario_vincular_auth(24)", [], /permission denied/);
            await c.query("SELECT f_patch_tb_compensacion_colaborador(p_id=>15,p_nombre_completo=>'IVONNE MARÍA RUIZ ANGELES')");
            await c.query("RESET ROLE");
            expect((await c.query("SELECT auth_user_id FROM tb_usuario WHERE id=24")).rows[0].auth_user_id).toBe(auth.id);
            expect((await c.query("SELECT id_rol,id_estado,id_sucursal,password FROM tb_usuario WHERE id=24")).rows[0]).toEqual(before);
            await identity(auth.id);
            await c.query("SET LOCAL ROLE authenticated");
            const ctx = (await c.query("SELECT f_get_compensacion_llamadas_contexto() v")).rows[0].v;
            expect(ctx.id_usuario).toBe(24);
            expect(ctx.id_colaborador).toBe(15);
            expect(ctx.alcance).toBe("PROPIO");
            expect(ctx.puede_registrar).toBe(true);
            expect(ctx.puede_aprobar).toBe(false);
            const call = (await c.query("SELECT f_post_compensacion_llamada_registrar('99990201','QA rollback acceso Ivonne',gen_random_uuid(),NULL) v"))
                .rows[0].v;
            expect(call.estado_evento).toBe("PENDIENTE");
            await negative("SELECT f_post_tb_compensacion_evento_resolver($1,'APROBADO','QA')", [call.id], /permiso/);
            await c.query("RESET ROLE");
            expect((await c.query("SELECT f_private_compensacion_usuario_vincular_auth(24) v")).rows[0].v).toBe(auth.id);
            await c.query("UPDATE tb_usuario SET auth_user_id=NULL WHERE id=24");
            await c.query("SAVEPOINT unconfirmed");
            await c.query("UPDATE auth.users SET email_confirmed_at=NULL WHERE id=$1", [auth.id]);
            await negative("SELECT f_private_compensacion_usuario_vincular_auth(24)", [], /confirmar/);
            expect((await c.query("SELECT auth_user_id FROM tb_usuario WHERE id=24")).rows[0].auth_user_id).toBeNull();
            await c.query("ROLLBACK TO SAVEPOINT unconfirmed");
            await c.query("SAVEPOINT missing");
            await c.query("UPDATE tb_usuario SET email='qa-sin-auth@example.invalid' WHERE id=24");
            await negative("SELECT f_private_compensacion_usuario_vincular_auth(24)", [], /no tiene cuenta de acceso/);
            await c.query("ROLLBACK TO SAVEPOINT missing");
            await c.query("SAVEPOINT wrong");
            await c.query("UPDATE tb_usuario SET auth_user_id=NULL WHERE id=30");
            await c.query("UPDATE tb_usuario SET auth_user_id=(SELECT id FROM auth.users WHERE lower(email)='atc_nicolle@atk.com') WHERE id=24");
            await negative("SELECT f_private_compensacion_usuario_vincular_auth(24)", [], /otra cuenta Auth/);
            await c.query("ROLLBACK TO SAVEPOINT wrong");
            await c.query("SAVEPOINT reused");
            await c.query("UPDATE tb_usuario SET auth_user_id=$1 WHERE id=13", [auth.id]);
            await negative("SELECT f_private_compensacion_usuario_vincular_auth(24)", [], /otro usuario operativo/);
            await c.query("ROLLBACK TO SAVEPOINT reused");
            const newAuth = randomUUID();
            const email = `qa-auth-${newAuth}@example.invalid`;
            await c.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())", [newAuth, email]);
            const newUser = (
                await c.query(
                    "INSERT INTO tb_usuario(username,email,nombre,id_rol,id_estado,id_sucursal) VALUES($1,$2,'QA rollback alta',4,1,1) RETURNING id",
                    [`qa-${newAuth}`, email],
                )
            ).rows[0].id;
            const assignment = (
                await c.query(
                    "SELECT id_cargo,id_jornada,id_plan FROM tb_compensacion_asignacion WHERE id_colaborador=15 ORDER BY fecha_inicio DESC,id DESC LIMIT 1",
                )
            ).rows[0];
            await identity(admin.auth_user_id);
            await c.query("SET LOCAL ROLE authenticated");
            const created = (
                await c.query(
                    "SELECT f_post_tb_compensacion_colaborador('DNI','99990202','QA','Alta','Rollback','QA Alta Rollback',(now() AT TIME ZONE 'America/Lima')::date,$1,1,$2,$3,$4) v",
                    [assignment.id_cargo, assignment.id_jornada, assignment.id_plan, newUser],
                )
            ).rows[0].v;
            expect(created.id).toBeTruthy();
            await c.query("RESET ROLE");
            expect((await c.query("SELECT auth_user_id FROM tb_usuario WHERE id=$1", [newUser])).rows[0].auth_user_id).toBe(newAuth);
            await identity(auth.id);
            await c.query("SET LOCAL ROLE authenticated");
            await negative("SELECT f_patch_tb_compensacion_colaborador(p_id=>15,p_nombre_completo=>'No autorizado')", [], /perfil operativo|permiso/);
            await c.query("RESET ROLE");
            expect((await c.query("SELECT auth_user_id FROM tb_usuario WHERE id=24")).rows[0].auth_user_id).toBeNull();
        } finally {
            await c.query("ROLLBACK").catch(() => {});
            await c.end();
        }
    }, 60000);
});
