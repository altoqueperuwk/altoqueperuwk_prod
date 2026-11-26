// Run: set DASHBOARD_PGLITE_PATH to an external @electric-sql/pglite dist/index.js,
// then node --test this file. Uses an in-memory PostgreSQL, never a remote server.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const runtime = process.env.DASHBOARD_PGLITE_PATH || process.env.PGLITE_MODULE ||
    resolve(tmpdir(), "codex-facturacion-auditoria-test/node_modules/@electric-sql/pglite/dist/index.js");
const { PGlite } = await import(pathToFileURL(runtime).href);
const sql59 = readFileSync(new URL("../../../../backend/backend_implementacion/59.compensaciones_mis_bonos_descuentos.sql", import.meta.url), "utf8");
const sql76 = readFileSync(new URL("../../../../backend/backend_implementacion/76.compensaciones_dashboard_filtros.sql", import.meta.url), "utf8");
const db = new PGlite();
after(async () => {
    await db.close();
});
await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;");
await db.exec(sql59).catch((e) => {
    throw new Error(`59: ${e.message} at ${e.position}`);
});
// Legacy signatures already exist: migration must preserve their identity and defaults.
const legacyOid = (await db.query("SELECT 'public.f_get_compensacion_mis_bonos_descuentos(date,text,text,text,integer,integer)'::regprocedure::oid oid"))
    .rows[0].oid;
await db.exec(sql76).catch((e) => {
    throw new Error(`76: ${e.message} at ${e.position}`);
});
// Controlled source fixture only; production authorization function is not replaced in files.
await db.exec(`CREATE OR REPLACE FUNCTION public.f_private_compensacion_mis_bonos_datos(p_mes date,p_vista text)
RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT current_setting('test.dashboard')::jsonb $$;`);
const row = (clave, fecha, importe, extra = {}) => ({
    codigo: "BONO_COLABORADOR_MES",
    concepto_origen: "BONO_COLABORADOR_ATENCIONES",
    clave,
    fecha,
    fecha_filtro: fecha,
    importe,
    cantidad: 1,
    estado: "PROVISIONAL",
    pendiente: false,
    ...extra,
});
const rows = [
    row("before", "2026-10-01T04:59:59Z", 1),
    row("start", "2026-10-01T05:00:00Z", 10),
    row("end", "2026-11-01T04:59:59Z", 20, { concepto_origen: "BONO_COLABORADOR_CALIFICACIONES" }),
    row("after", "2026-11-01T05:00:00Z", 100),
    row("pending", "2026-10-10T12:00:00Z", null, { cantidad: 0, pendiente: true, estado: "PENDIENTE" }),
    row("monthly", "2026-11-10T12:00:00Z", 30, { fecha_filtro: null, estado: "PAGADA" }),
];
const fixture = { registros: rows, perfil_rol: 4, periodo_disponible: true, liquidacion_disponible: true, advertencias: [] };
await db.query("SELECT set_config('test.dashboard',$1,false)", [JSON.stringify(fixture)]);
const list = async (estado = null, desde = "2026-10-01", hasta = "2026-10-31", criterio = null, page = 1) =>
    (
        await db.query(
            "SELECT public.f_get_compensacion_mis_bonos_descuentos('2026-10-01','SEGUIMIENTO',NULL,'BONO_COLABORADOR_MES',$5,20,$1,$2,$3,$4) result",
            [estado, desde, hasta, criterio, page],
        )
    ).rows[0].result;
const detail = async (estado = null, desde = "2026-10-01", hasta = "2026-10-31", criterio = null) =>
    (
        await db.query(
            "SELECT public.f_get_compensacion_mis_bonos_descuentos_detalle('2026-10-01','SEGUIMIENTO','BONO_COLABORADOR_MES',1,20,$1,$2,$3,$4) result",
            [estado, desde, hasta, criterio],
        )
    ).rows[0].result;
test("Lima inclusive start and exclusive next day; list, KPI and detail agree", async () => {
    const l = await list(),
        d = await detail();
    assert.deepEqual(d.items.map((r) => r.clave).sort(), ["end", "monthly", "pending", "start"]);
    assert.equal(l.items[0].importe, 60);
    assert.equal(l.kpis.bonos, 60);
    assert.equal(l.kpis.pendientes, 1);
    assert.equal(
        d.items.filter((r) => !r.pendiente).reduce((sum, r) => sum + r.importe, 0),
        l.kpis.bonos,
    );
});
test("state applies before aggregation and pagination, pending stays null", async () => {
    const l = await list("PENDIENTE"),
        d = await detail("PENDIENTE");
    assert.equal(l.items[0].importe, null);
    assert.equal(l.items[0].pendientes, 1);
    assert.equal(d.total, 1);
    assert.equal((await list("PENDIENTE", undefined, undefined, null, 2)).items.length, 0);
    assert.equal((await list("PENDIENTE", undefined, undefined, null, 2)).kpis.pendientes, 1);
});
test("narrow dates exclude monthly-only lines; out-of-month range is empty", async () => {
    assert.deepEqual(
        (await detail(null, "2026-10-01", "2026-10-01")).items.map((r) => r.clave),
        ["start"],
    );
    const outside = await list(null, "2026-11-01", "2026-11-30");
    assert.equal(outside.total, 0);
    assert.equal(outside.kpis.bonos, 0);
    assert.equal((await detail(null, "2026-09-01", "2026-11-30")).total, 4);
});
test("criteria use existing source concepts, never duplicate combined prize", async () => {
    const a = await list(null, undefined, undefined, "ATENCIONES"),
        b = await list(null, undefined, undefined, "CALIFICACIONES");
    assert.equal(a.kpis.bonos, 40);
    assert.equal(b.kpis.bonos, 20);
    assert.equal(a.kpis.bonos + b.kpis.bonos, (await list()).kpis.bonos);
    assert.equal((await detail(null, undefined, undefined, "CALIFICACIONES")).items[0].concepto_origen, "BONO_COLABORADOR_CALIFICACIONES");
    assert.match(sql59, /j->>'concepto_codigo' concepto_origen/);
    assert.match(sql59, /co.codigo concepto_origen,ev.fecha_evento::text fecha_filtro/);
});
test("invalid range, state, criterion and concept reject", async () => {
    await assert.rejects(list(null, "2026-10-20", "2026-10-01"), /Desde/);
    await assert.rejects(list("INVENTADO"), /Estado/);
    await assert.rejects(list(null, undefined, undefined, "INVENTADO"), /Criterio/);
    await assert.rejects(db.query("SELECT public.f_get_compensacion_mis_bonos_descuentos('2026-10-01',p_concepto=>'INVENTADO')"), /Concepto/);
});
test("legacy calls and role catalogs 3,4,5 remain; legacy defaults and mandatory extended signatures are unambiguous", async () => {
    const l = (await db.query("SELECT public.f_get_compensacion_mis_bonos_descuentos('2026-10-01') r")).rows[0].r;
    assert.equal(l.kpis.bonos, 161); // No new date filter silently applied to legacy callers.
    for (const role of [3, 4, 5]) assert.ok((await db.query("SELECT * FROM public.f_private_compensacion_mis_bonos_catalogo($1)", [role])).rows.length > 0);
    const signatures = (
        await db.query(
            "SELECT proname,count(*)::int n FROM pg_proc WHERE proname IN('f_get_compensacion_mis_bonos_descuentos','f_get_compensacion_mis_bonos_descuentos_detalle') GROUP BY proname",
        )
    ).rows;
    assert.equal(signatures.length, 2);
    assert.ok(signatures.every((r) => r.n === 2));
});
test("private helper denies authenticated; public RPC denies anonymous", async () => {
    const privileges = (
        await db.query(
            "SELECT has_function_privilege('authenticated','public.f_private_compensacion_dashboard_filtrar(jsonb,date,text,date,date,text)','EXECUTE') private,has_function_privilege('anon','public.f_get_compensacion_mis_bonos_descuentos(date,text,text,text,integer,integer,text,date,date,text)','EXECUTE') anon",
        )
    ).rows[0];
    assert.deepEqual(privileges, { private: false, anon: false });
});
test("cache helper detection executes both branches locally with monthly arguments", async () => {
    const block = sql59.slice(
        sql59.indexOf("   IF to_regprocedure('public.f_private_compensacion_seguimiento_consultar"),
        sql59.indexOf("   lineas:=coalesce(simulacion"),
    );
    await db.exec(
        `CREATE FUNCTION public.f_private_compensacion_liquidacion_simular(bigint,bigint) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"source":"legacy"}'::jsonb $$;
 CREATE FUNCTION public.test_cache() RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE periodo bigint:=1; col bigint:=2; simulacion jsonb; BEGIN ` +
            block +
            " RETURN simulacion; END; $$;",
    );
    assert.equal((await db.query("SELECT public.test_cache() r")).rows[0].r.source, "legacy");
    await db.exec(
        `CREATE FUNCTION public.f_private_compensacion_seguimiento_consultar(bigint,bigint) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('source','75','periodo',$1,'col',$2) $$;`,
    );
    assert.deepEqual((await db.query("SELECT public.test_cache() r")).rows[0].r, { source: "75", periodo: 1, col: 2 });
});
test("59 and 76 carry identical affected function bodies", () => {
    for (const name of [
        "f_private_compensacion_mis_bonos_datos",
        "f_private_compensacion_dashboard_filtrar",
        "f_get_compensacion_mis_bonos_descuentos",
        "f_get_compensacion_mis_bonos_descuentos_detalle",
    ]) {
        const extract = (s) => {
            const start = s.indexOf("CREATE OR REPLACE FUNCTION public." + name + "(");
            return s.slice(start, s.indexOf("\n$$;", start) + 4);
        };
        assert.equal(extract(sql59), extract(sql76));
    }
});
test("no DROP and no optional prefix on extended signatures; legacy equals null filters", async () => {
    assert.doesNotMatch(sql76, /^DROP FUNCTION/m);
    assert.equal(
        (await db.query("SELECT 'public.f_get_compensacion_mis_bonos_descuentos(date,text,text,text,integer,integer)'::regprocedure::oid oid")).rows[0].oid,
        legacyOid,
    );
    const signatures = (
        await db.query(
            "SELECT proname,pronargs,pronargdefaults FROM pg_proc WHERE proname IN('f_get_compensacion_mis_bonos_descuentos','f_get_compensacion_mis_bonos_descuentos_detalle')",
        )
    ).rows;
    assert.equal(signatures.filter((r) => r.pronargs >= 9).length, 2);
    assert.ok(signatures.filter((r) => r.pronargs >= 9).every((r) => r.pronargdefaults === 0));
    const l = (await db.query("SELECT public.f_get_compensacion_mis_bonos_descuentos('2026-10-01') r")).rows[0].r;
    const extended = (await db.query("SELECT public.f_get_compensacion_mis_bonos_descuentos('2026-10-01','SEGUIMIENTO',NULL,NULL,1,20,NULL,NULL,NULL,NULL) r"))
        .rows[0].r;
    assert.deepEqual(l, extended);
});
