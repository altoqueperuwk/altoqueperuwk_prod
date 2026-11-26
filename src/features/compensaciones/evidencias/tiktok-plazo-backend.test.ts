import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

describe.runIf(Boolean(process.env.LLAMADAS_TEST_PG))("TikTok Live: validación de operaciones pagadas en PostgreSQL", () => {
    it("exige pago final en siete días y conserva las validaciones de cliente y evidencia del flujo anterior", async () => {
        const require = createRequire(import.meta.url);
        const { connection } = require("../../../../refactorizacion_compensaciones/scripts/db-development.cjs");
        const c = connection(process.env.LLAMADAS_TEST_PG);
        try {
            await c.connect();
            await c.query("BEGIN");
            const source = await readFile("backend/backend_implementacion/27.compensaciones_evidencias_funciones.sql", "utf8");
            for (const name of [
                "f_private_compensacion_tiktok_validar",
                "f_get_compensacion_tiktok_operaciones",
                "f_post_tb_compensacion_evento_enviar",
                "f_post_tb_compensacion_evento_resolver",
            ]) {
                const match = source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`));
                expect(match, `función ${name} encontrada`).toBeTruthy();
                await c.query(match![0]);
            }
            await c.query(await readFile("backend/backend_implementacion/45.compensaciones_tiktok_evidencia_storage.sql", "utf8"));

            const actor = 20;
            const { auth_user_id: authUserId } = (await c.query("SELECT auth_user_id FROM tb_usuario WHERE id=$1", [actor])).rows[0];
            const { collaboratorId } =
                (await c.query('SELECT id AS "collaboratorId" FROM tb_compensacion_colaborador WHERE id_usuario=$1 ORDER BY id LIMIT 1', [actor])).rows[0] ??
                {};
            const { activeState } = (await c.query("SELECT id AS \"activeState\" FROM tb_estado WHERE upper(nombre)='ACTIVO' ORDER BY id LIMIT 1")).rows[0];
            const { typeId } = (await c.query("SELECT id AS \"typeId\" FROM tb_compensacion_evento_tipo WHERE codigo='TIKTOK_LIVE'")).rows[0];
            expect(authUserId).toBeTruthy();
            expect(collaboratorId).toBeTruthy();
            await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [
                authUserId,
                JSON.stringify({ sub: authUserId, role: "authenticated" }),
            ]);

            const baseId = 987000;
            const customerId = -baseId;
            const validOperationId = -baseId - 1;
            const oldOperationId = -baseId - 2;
            const unpaidOperationId = -baseId - 3;
            const mismatchOperationId = -baseId - 4;
            const clientDni = "99998700";
            const createdAt = "2026-10-01T12:00:00Z";
            const evidencePath = `${authUserId}/12345678-1234-1234-1234-123456789abc.png`;
            const evidence = {
                tipo: "IMAGEN_TIKTOK",
                bucket: "compensaciones-tiktok-live",
                path: evidencePath,
                nombre: "captura.png",
                mime_type: "image/png",
                size: 128,
            };
            await c.query("INSERT INTO storage.objects(bucket_id,name,owner,owner_id,metadata) VALUES($1,$2,$3::uuid,$3::text,$4::jsonb)", [
                evidence.bucket,
                evidence.path,
                authUserId,
                JSON.stringify({ mimetype: "image/png", size: 128 }),
            ]);
            await c.query(
                "INSERT INTO tb_cliente(id,tipo_documento,numero_documento,nombre,id_estado,id_usuario,fecha_registro) OVERRIDING SYSTEM VALUE VALUES($1,1,$2,'Cliente TikTok QA',$3,$4,$5)",
                [customerId, clientDni, activeState, actor, createdAt],
            );
            await c.query(
                "INSERT INTO tb_cliente(id,tipo_documento,numero_documento,nombre,id_estado,id_usuario,fecha_registro) OVERRIDING SYSTEM VALUE VALUES($1,1,$2,'Otro cliente TikTok QA',$3,$4,$5)",
                [customerId - 1, "99998701", activeState, actor, createdAt],
            );
            await c.query(
                `INSERT INTO tb_operacion_proceso(id,id_cliente,dni_cliente,nombre_cliente,nombre_estado,tipo_servicio,codigo_operacion_deposito_cliente,fecha_deposito_cliente)
                 OVERRIDING SYSTEM VALUE VALUES
                 ($1,$2,$3,'Cliente TikTok QA','PAGADO','EFECTIVIZACION','TIKTOK-QA-VALID','2026-10-08T12:00:00Z'),
                 ($4,$2,$3,'Cliente TikTok QA','PAGADO','EFECTIVIZACION','TIKTOK-QA-OLD','2025-01-10T12:00:01Z'),
                 ($5,$2,$3,'Cliente TikTok QA','PENDIENTE','EFECTIVIZACION','TIKTOK-QA-UNPAID','2026-10-05T12:00:00Z'),
                 ($6,$2,$3,'Cliente TikTok QA','PAGADO','EFECTIVIZACION','TIKTOK-QA-MISMATCH','2026-10-05T12:00:00Z')`,
                [validOperationId, customerId, clientDni, oldOperationId, unpaidOperationId, mismatchOperationId],
            );
            const createEvent = async (id: number, operationId: number, operationCustomerId = customerId, includeEvidence = true) => {
                await c.query(
                    "INSERT INTO tb_compensacion_evento(id,id_tipo_evento,id_colaborador_beneficiario,fecha_evento,periodo_imputacion,estado_evento,id_usuario_registra,evidencia) OVERRIDING SYSTEM VALUE VALUES($1,$2,$3,$4,'2026-10-01','BORRADOR',$5,$6::jsonb)",
                    [id, typeId, collaboratorId, createdAt, actor, JSON.stringify(includeEvidence ? [evidence] : [])],
                );
                await c.query("INSERT INTO tb_compensacion_evento_referencia(id_evento,tipo_referencia,id_cliente,id_usuario) VALUES($1,'CLIENTE',$2,$3)", [
                    id,
                    operationCustomerId,
                    actor,
                ]);
                await c.query("INSERT INTO tb_compensacion_evento_referencia(id_evento,tipo_referencia,id_operacion,id_usuario) VALUES($1,'OPERACION',$2,$3)", [
                    id,
                    operationId,
                    actor,
                ]);
            };
            const denied = async (query: string, args: unknown[], message: RegExp) => {
                await c.query("SAVEPOINT invalid_tiktok");
                await expect(c.query(query, args)).rejects.toThrow(message);
                await c.query("ROLLBACK TO SAVEPOINT invalid_tiktok");
            };

            const lookup = (await c.query("SELECT f_get_compensacion_tiktok_operaciones($1,$2) v", ["TIKTOK-QA-VALID", clientDni])).rows[0].v;
            expect(lookup.items).toHaveLength(1);
            expect(lookup.items[0], JSON.stringify(lookup.items[0])).toMatchObject({ id: validOperationId, elegible: true });
            const byDni = (await c.query("SELECT f_get_compensacion_tiktok_operaciones(NULL,$1) v", [clientDni])).rows[0].v;
            expect(byDni.items.some((item: { id: number }) => item.id === validOperationId)).toBe(true);
            const byCode = (await c.query("SELECT f_get_compensacion_tiktok_operaciones($1,NULL) v", ["TIKTOK-QA-VALID"])).rows[0].v;
            expect(byCode.items).toHaveLength(1);
            expect(byCode.items[0].id).toBe(validOperationId);
            const oldOperation = (await c.query("SELECT f_get_compensacion_tiktok_operaciones($1,$2) v", ["TIKTOK-QA-OLD", clientDni])).rows[0].v.items[0];
            expect(oldOperation).toMatchObject({ id: oldOperationId, elegible: false });
            const mismatched = (await c.query("SELECT f_get_compensacion_tiktok_operaciones($1,$2) v", ["TIKTOK-QA-VALID", "99998701"])).rows[0].v;
            expect(mismatched.items).toHaveLength(0);
            await denied("SELECT f_get_compensacion_tiktok_operaciones(NULL,NULL)", [], /Ingresa DNI o código/);

            await createEvent(-baseId - 10, validOperationId);
            await createEvent(-baseId - 11, oldOperationId);
            await createEvent(-baseId - 12, unpaidOperationId);
            await createEvent(-baseId - 13, mismatchOperationId, customerId - 1);
            await createEvent(-baseId - 14, validOperationId, customerId, false);
            expect((await c.query("SELECT f_private_compensacion_tiktok_validar($1)", [-baseId - 10])).rowCount).toBe(1);
            await denied("SELECT f_private_compensacion_tiktok_validar($1)", [-baseId - 11], /siete días/);
            expect((await c.query("SELECT f_private_compensacion_tiktok_storage('LEER',$1) v", [evidencePath])).rows[0].v).toBe(true);
            expect((await c.query("SELECT f_private_compensacion_tiktok_storage('SUBIR',$1) v", [evidencePath])).rows[0].v).toBe(true);
            await denied("SELECT f_private_compensacion_tiktok_validar($1)", [-baseId - 12], /pagada/);
            await denied("SELECT f_private_compensacion_tiktok_validar($1)", [-baseId - 13], /pertenecer al cliente/);
            await denied("SELECT f_private_compensacion_tiktok_validar($1)", [-baseId - 14], /Adjunta una imagen/);
            const sent = (await c.query("SELECT f_post_tb_compensacion_evento_enviar($1,'QA') v", [-baseId - 10])).rows[0].v;
            expect(sent.estado_evento).toBe("PENDIENTE");
            await denied("SELECT f_post_tb_compensacion_evento_enviar($1,'QA') v", [-baseId - 11], /siete días/);
        } finally {
            await c.query("ROLLBACK").catch(() => {});
            await c.end();
        }
    }, 60000);
});
