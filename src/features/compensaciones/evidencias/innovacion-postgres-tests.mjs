// PostgreSQL embebido; ejecuta funciones reales sin red ni credenciales.
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(resolve(tmpdir(), 'codex-facturacion-auditoria-test/node_modules/@electric-sql/pglite/dist/index.js')));
const db = new PGlite();
const source = name => readFile(resolve('backend/backend_implementacion', name), 'utf8');
const val = async (sql, args=[]) => (await db.query(sql,args)).rows[0]?.v;
const actor = id => db.query("SELECT set_config('test.actor',$1,false)",[String(id)]);
const fn = (sql,name) => { const found=sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`)); assert.ok(found,name); return found[0]; };
let version, cte;
const approve = id => val("SELECT f_post_tb_compensacion_evento_resolver($1,'APROBADO','Idea util',NULL,NULL) v",[id]);
const context = id => val('SELECT f_get_compensacion_innovacion_implementacion($1) v',[id]);
const implement = (id, v=version, evidence='Resultado verificado en registro operativo', reason='Mejora aplicada y contrastada') =>
  val("SELECT f_post_compensacion_innovacion_implementar($1,$2,(now() AT TIME ZONE 'America/Lima')::date,$3,$4) v",[id,v,evidence,reason]);
before(async () => {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;');
  const files=(await Promise.all(['17.compensaciones_personal_configuracion.sql','18.compensaciones_asistencia_evidencias.sql','19.compensaciones_liquidaciones_cierres_reportes.sql'].map(source))).join('\n');
  for (const name of ['tb_compensacion_colaborador','tb_compensacion_cargo','tb_compensacion_asignacion','tb_compensacion_regla','tb_compensacion_plan_version','tb_compensacion_concepto','tb_compensacion_evento_tipo','tb_compensacion_evento','tb_compensacion_evento_revision','tb_compensacion_evento_referencia','tb_compensacion_periodo']) {
    const match=files.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${name} \\(([\\s\\S]*?)\\n\\);`));
    assert.ok(match,name);
    const columns=match[1].split(/\s+CONSTRAINT /)[0].trim().replace(/,\s*$/,'').replaceAll(' NOT NULL','');
    await db.exec(`CREATE TABLE ${name} (${columns}, PRIMARY KEY(id));`);
  }
  await db.exec(`
    ALTER TABLE tb_compensacion_evento ADD CHECK(estado_evento NOT IN('APROBADO','LIQUIDADO') OR importe_aprobado IS NOT NULL);
    CREATE UNIQUE INDEX ON tb_compensacion_evento_revision(id_evento,numero_paso);
    CREATE TABLE tb_estado(id bigint,nombre varchar); INSERT INTO tb_estado VALUES(1,'ACTIVO');
    CREATE TABLE tb_usuario(id bigint,id_rol bigint,nombre varchar,username varchar); INSERT INTO tb_usuario(id,id_rol) VALUES(1,1),(2,4),(3,3),(4,1);
    CREATE TABLE tb_sucursal(id bigint,nombre varchar);
    CREATE TABLE tb_operacion_proceso(id bigint,comision_servicio numeric,comision_minima_servicio numeric);
    CREATE FUNCTION f_private_compensacion_calificacion_operacion(bigint) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION f_private_compensacion_calificacion_valida(jsonb,text,bigint,jsonb) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    INSERT INTO tb_compensacion_colaborador(id,id_usuario) OVERRIDING SYSTEM VALUE VALUES(1,1),(2,2),(3,3),(4,4);
    INSERT INTO tb_compensacion_cargo(id,codigo) OVERRIDING SYSTEM VALUE VALUES(2,'ATC'),(3,'JEFE_TIENDA');
    INSERT INTO tb_compensacion_asignacion(id,id_colaborador,id_cargo,id_sucursal,id_plan,fecha_inicio) OVERRIDING SYSTEM VALUE VALUES(2,2,2,1,1,'2020-01-01'),(3,3,3,1,1,'2020-01-01');
    INSERT INTO tb_compensacion_plan_version(id,id_plan,estado_version,fecha_inicio,numero_version) OVERRIDING SYSTEM VALUE VALUES(1,1,'PUBLICADA','2020-01-01',1);
    INSERT INTO tb_compensacion_concepto(id,codigo,categoria,naturaleza) OVERRIDING SYSTEM VALUE VALUES(1,'BONO_INNOVACION','BONO','INGRESO');
    INSERT INTO tb_compensacion_evento_tipo(id,codigo,categoria,id_concepto,id_estado) OVERRIDING SYSTEM VALUE VALUES(1,'PROPUESTA_INNOVACION','OTRO',1,1);
    INSERT INTO tb_compensacion_regla(id,id_plan_version,id_concepto,tipo_calculo,monto,id_estado,configuracion)
      OVERRIDING SYSTEM VALUE VALUES(1,1,1,'FIJO',50,1,'{"acumulado_maximo_con_meta":400}');
    INSERT INTO tb_compensacion_periodo(id,periodo,estado_periodo) OVERRIDING SYSTEM VALUE VALUES(1,date_trunc('month',now() AT TIME ZONE 'America/Lima')::date,'ABIERTO');
    CREATE FUNCTION f_private_compensacion_evento_contexto(bigint,varchar) RETURNS jsonb LANGUAGE plpgsql AS $$
      DECLARE u bigint:=current_setting('test.actor')::bigint; BEGIN
      IF u NOT IN(1,2,3,4) THEN RAISE EXCEPTION 'Sin permiso'; END IF;
      RETURN jsonb_build_object('id_usuario',u,'id_colaborador',u,'es_super_admin',u IN(1,4),'alcance',CASE WHEN u IN(1,4) THEN 'GLOBAL' ELSE 'PROPIO' END); END $$;
    CREATE FUNCTION f_private_compensacion_contexto(varchar,varchar) RETURNS jsonb LANGUAGE sql AS $$ SELECT f_private_compensacion_evento_contexto(1,$2) $$;
    CREATE FUNCTION f_private_compensacion_atc_trazabilidad_validar(bigint) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
    CREATE FUNCTION f_private_compensacion_tiktok_validar(bigint) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
    CREATE FUNCTION f_private_compensacion_reglas_colaborador_fecha(bigint,date,bigint) RETURNS SETOF tb_compensacion_regla LANGUAGE sql AS $$ SELECT * FROM tb_compensacion_regla $$;
    CREATE FUNCTION f_private_compensacion_meta_sede_chats(bigint,date) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"pendientes":0,"confirmados":0}'::jsonb $$;
  `);
  const sql27=await source('27.compensaciones_evidencias_funciones.sql');
  for (const name of ['f_private_compensacion_evento_validar_alcance','f_post_tb_compensacion_evento_resolver','f_post_tb_compensacion_evento','f_post_tb_compensacion_evento_enviar','f_private_compensacion_evento_tarifa_registro','f_get_tb_compensacion_evento']) await db.exec(fn(sql27,name));
  const motor=fn(await source('30.compensaciones_preliquidacion_funciones.sql'),'f_private_compensacion_liquidacion_simular');
  // Instala el cuerpo completo real; las tablas de otros conceptos estan fuera de este fixture.
  await db.exec('SET check_function_bodies=false;');
  await db.exec(motor);
  await db.exec(await source('77.compensaciones_innovacion_implementacion.sql'));
  const patched=await val("SELECT pg_get_functiondef('f_private_compensacion_liquidacion_simular(bigint,bigint)'::regprocedure) v");
  assert.ok(patched.includes("AND (te.codigo<>'PROPUESTA_INNOVACION' OR public.f_private_compensacion_innovacion_comprobada(ev.id))"));
  // Ejecuta el CTE monetario real del motor adaptado, sin simular los otros conceptos.
  cte=patched.split('), detalle_eventos AS (')[1].split('), detalle_incidencia_descuento AS (')[0];
  await db.exec('SET check_function_bodies=true;');
  await actor(1);
  for (let id=1;id<=12;id++) await db.query(`INSERT INTO tb_compensacion_evento(id,id_tipo_evento,id_colaborador_beneficiario,id_usuario_registra,titulo,descripcion,fecha_evento,periodo_imputacion,estado_evento)
    OVERRIDING SYSTEM VALUE VALUES($1,1,2,2,$2,'Descripcion completa',now()-interval '1 day',date_trunc('month',now() AT TIME ZONE 'America/Lima')::date,'PENDIENTE')`,[id,`Idea ${id}`]);
  await db.exec("SELECT setval(pg_get_serial_sequence('tb_compensacion_evento','id'),30); UPDATE tb_compensacion_asignacion SET id_estado=1;");
});
after(() => db.close());
test('aprobacion sola sin S/50 y sin linea monetaria en el CTE real; implementacion auditada una sola vez', async () => {
  const approved=await approve(1); assert.equal(approved.importe_aprobado,0);
  const ctx=await context(1); version=ctx.version; assert.equal(ctx.comprobada,false);
  const lines=()=>val(`WITH periodo AS(SELECT * FROM tb_compensacion_periodo WHERE id=1), detalle AS (${cte.replaceAll('p_id_colaborador','2')}) SELECT count(*)::int v FROM detalle`);
  assert.equal(await lines(),0);
  const result=await implement(1); assert.equal(result.importe_aprobado,50);
  assert.equal(await lines(),1);
  const proof=await context(1); assert.equal(proof.comprobada,true);
  assert.equal(proof.constancia.evidencia,'Resultado verificado en registro operativo');
  const count=await val('SELECT count(*)::int v FROM tb_compensacion_evento_revision WHERE id_evento=1');
  await implement(1); assert.equal(await val('SELECT count(*)::int v FROM tb_compensacion_evento_revision WHERE id_evento=1'),count);
  await assert.rejects(implement(1,version,'Otra evidencia'),/no se puede sobrescribir/);
});
test('servidor niega beneficiario, autor y revisor no administrativo; contexto propio',async()=>{
  await actor(2); await assert.rejects(approve(2),/Solo Administracion/);
  await assert.rejects(implement(2),/Solo Administracion/);
  await actor(3); await assert.rejects(context(2),/propias propuestas/);
  await assert.rejects(approve(2),/Solo Administracion/);
  await actor(1);
  await db.exec('UPDATE tb_compensacion_evento SET id_colaborador_beneficiario=1 WHERE id=2');
  await assert.rejects(approve(2),/independiente/);
  await db.exec('UPDATE tb_compensacion_evento SET id_colaborador_beneficiario=2,id_colaborador_responsable=1 WHERE id=2');
  await assert.rejects(approve(2),/independiente/);
  await db.exec('UPDATE tb_compensacion_evento SET id_colaborador_responsable=NULL WHERE id=2');
  await db.exec('UPDATE tb_compensacion_evento SET id_colaborador_beneficiario=2,id_usuario_registra=1 WHERE id=2');
  await assert.rejects(approve(2),/independiente/);
});
test('alta propia requiere titulo y descripcion; envio sin adjunto y borrador sin comision',async()=>{
  const create=(beneficiary,title,description)=>val("SELECT f_post_tb_compensacion_evento(p_id_tipo_evento=>1,p_fecha_evento=>now(),p_id_colaborador_beneficiario=>$1,p_titulo=>$2,p_descripcion=>$3) v",[beneficiary,title,description]);
  await actor(2);
  await assert.rejects(create(2,' ','Detalle'),/titulo y descripcion/);
  await assert.rejects(create(2,'Titulo',' '),/titulo y descripcion/);
  await assert.rejects(create(3,'Titulo','Detalle'),/innovacion propia/);
  const draft=await create(2,'Idea nueva completa','Propuesta distinta documentada');
  assert.equal(draft.estado_evento,'BORRADOR');
  assert.equal(await val('SELECT importe_aprobado v FROM tb_compensacion_evento WHERE id=$1',[draft.id]),null);
  await db.query("UPDATE tb_compensacion_evento SET titulo=' ' WHERE id=$1",[draft.id]);
  await assert.rejects(val('SELECT f_post_tb_compensacion_evento_enviar($1,NULL) v',[draft.id]),/titulo y descripcion/);
  await db.query("UPDATE tb_compensacion_evento SET titulo='Idea nueva completa' WHERE id=$1",[draft.id]);
  await val('SELECT f_post_tb_compensacion_evento_enviar($1,NULL) v',[draft.id]);
  await actor(1);
  await approve(draft.id); const v=(await context(draft.id)).version;
  await implement(draft.id,v); // Tambien ejercita la tarifa real capturada al registrar.
  await assert.rejects(create(1,'Admin','Idea propia'),/no recibe este bono/);
});
test('lista real en servidor filtra propuestas ajenas y aprobaciones historicas sin implementacion',async()=>{
  await db.exec("UPDATE tb_compensacion_evento SET estado_evento='APROBADO',importe_aprobado=50 WHERE id=6");
  await actor(1);
  let result=await val('SELECT f_get_tb_compensacion_evento(p_id_tipo_evento=>1) v');
  assert.equal(result.items.find(row=>row.id===6).importe_aprobado,null);
  assert.equal(result.resumen.importe_aprobado,100);
  assert.equal(await val(`WITH periodo AS(SELECT * FROM tb_compensacion_periodo WHERE id=1), detalle AS (${cte.replaceAll('p_id_colaborador','2')}) SELECT count(*)::int v FROM detalle`),2);
  await actor(3);
  result=await val('SELECT f_get_tb_compensacion_evento(p_id_tipo_evento=>1) v');
  assert.equal(result.total,0);
  await actor(1);
  await db.exec("UPDATE tb_compensacion_evento SET estado_evento='PENDIENTE',importe_aprobado=NULL WHERE id=6");
});
test('fecha/evidencia/motivo/version obligatorios; fraude por JSON no acredita implementacion',async()=>{
  await actor(1); await approve(3); version=(await context(3)).version;
  await assert.rejects(implement(3,null),/propuesta cambio/);
  await assert.rejects(implement(3,version,' '),/evidencia y motivo/);
  await assert.rejects(implement(3,version,'Prueba',' '),/evidencia y motivo/);
  await assert.rejects(val("SELECT f_post_compensacion_innovacion_implementar(3,$1,current_date+1,'Evidencia','Motivo') v",[version]),/fecha.*valida/);
  await db.exec(`UPDATE tb_compensacion_evento SET datos='{"implementada":true}',evidencia='[{"tipo":"IMPLEMENTACION"}]',criterios_validacion_snapshot='{"innovacion_implementacion":{"politica":"INNOVACION_IMPLEMENTADA_V1","fecha":"2026-10-01","evidencia":"falsa","motivo":"falso","id_usuario":1}}' WHERE id=3`);
  assert.equal((await context(3)).comprobada,false);
  await db.exec('UPDATE tb_compensacion_regla SET monto=60');
  await assert.rejects(implement(3,(await context(3)).version),/debe reconocer S\/50/);
  assert.equal((await context(3)).comprobada,false);
  assert.equal(await val("SELECT count(*)::int v FROM tb_compensacion_evento_revision WHERE id_evento=3 AND etapa='IMPLEMENTACION'"),0);
  await db.exec('UPDATE tb_compensacion_regla SET monto=50');
});
test('idea duplicada y periodo bloqueado no crean bono; no hay limite de ocho',async()=>{
  await actor(1);
  await db.exec("UPDATE tb_compensacion_evento SET titulo='  IDEA 1  ' WHERE id=4");
  await approve(4); version=(await context(4)).version;
  await assert.rejects(implement(4),/misma idea/);
  assert.equal((await context(4)).comprobada,false);
  await approve(5); version=(await context(5)).version;
  await db.exec("UPDATE tb_compensacion_periodo SET estado_periodo='CERRADO'");
  await assert.rejects(implement(5),/periodo esta bloqueado/);
  await assert.rejects(approve(6),/periodo esta bloqueado/);
  await db.exec("UPDATE tb_compensacion_periodo SET estado_periodo='ABIERTO'");
  for(let id=5;id<=12;id++) { if(id!==5) await approve(id); version=(await context(id)).version; await implement(id); }
  assert.equal(await val('SELECT count(*)::int v FROM tb_compensacion_evento WHERE importe_aprobado=50'),10);
});
test('Jefatura sin margen conserva constancia auditada con cero; reintento no vuelve a premiar',async()=>{
  await actor(1);
  await db.exec(`INSERT INTO tb_compensacion_evento_tipo(id,codigo,categoria,id_concepto,id_estado)
      OVERRIDING SYSTEM VALUE VALUES(2,'META_SEDE_SAFETYPAY','OTRO',1,1);
    UPDATE tb_compensacion_evento SET id_tipo_evento=2,id_colaborador_beneficiario=3,id_usuario_registra=3,importe_aprobado=400 WHERE id=2;
    UPDATE tb_compensacion_evento SET estado_evento='APROBADO' WHERE id=2;
    UPDATE tb_compensacion_evento SET id_colaborador_beneficiario=3,id_usuario_registra=3 WHERE id=4;
    UPDATE tb_compensacion_evento SET titulo='Idea independiente de Jefatura' WHERE id=4;`);
  version=(await context(4)).version;
  const result=await implement(4);
  assert.equal(result.importe_aprobado,0); assert.equal(result.comprobada,true);
  assert.deepEqual(result.economia,{
    tarifa_regla:50,importe_antes_tope_jefatura:50,tope_regla:null,tope_jefatura:400,
    acumulado_previo:400,margen_disponible:0,importe_habilitado:0,estado:'SIN_MARGEN',
  });
  const ctx=await context(4); assert.equal(ctx.comprobada,true);
  assert.equal(ctx.constancia.evidencia,'Resultado verificado en registro operativo');
  assert.equal(ctx.constancia.motivo,'Mejora aplicada y contrastada');
  assert.equal(ctx.constancia.id_usuario,1); assert.ok(ctx.constancia.fecha); assert.ok(ctx.constancia.fecha_revision);
  assert.equal(await val("SELECT count(*)::int v FROM tb_compensacion_evento_revision WHERE id_evento=4 AND etapa='IMPLEMENTACION' AND datos_decision->>'evidencia'='Resultado verificado en registro operativo'"),1);
  assert.deepEqual((await implement(4)).economia,result.economia);
  assert.equal(await val("SELECT count(*)::int v FROM tb_compensacion_evento_revision WHERE id_evento=4 AND etapa='IMPLEMENTACION'"),1);
  assert.equal(await val("SELECT sum(importe_aprobado) v FROM tb_compensacion_evento WHERE id_colaborador_beneficiario=3 AND estado_evento='APROBADO'"),'400.00');
});
test('Jefatura con remanente S/20 conserva implementacion y limita importe; no completa premio por reintentos u otra solicitud',async()=>{
  await actor(1);
  await db.exec(`UPDATE tb_compensacion_evento SET importe_aprobado=380 WHERE id=2;
    INSERT INTO tb_compensacion_evento(id,id_tipo_evento,id_colaborador_beneficiario,id_usuario_registra,titulo,descripcion,fecha_evento,periodo_imputacion,estado_evento)
    OVERRIDING SYSTEM VALUE VALUES(40,1,3,3,'Segunda idea de Jefatura','Descripcion completa',now()-interval '1 day',date_trunc('month',now() AT TIME ZONE 'America/Lima')::date,'PENDIENTE'),
      (41,1,3,3,'Idea independiente de Jefatura','Descripcion completa',now()-interval '1 day',date_trunc('month',now() AT TIME ZONE 'America/Lima')::date,'PENDIENTE'),
      (43,1,3,3,'Segunda idea de Jefatura','Descripcion completa',now()-interval '1 day',date_trunc('month',now() AT TIME ZONE 'America/Lima')::date,'PENDIENTE');`);
  // La implementacion sin margen permanece en cero aunque posteriormente se libere margen.
  assert.equal((await implement(4)).importe_aprobado,0);
  await approve(40); version=(await context(40)).version;
  const result=await implement(40);
  assert.equal(result.importe_aprobado,20); assert.equal(result.economia.tarifa_regla,50);
  assert.equal(result.economia.margen_disponible,20); assert.equal(result.economia.estado,'LIMITADO_POR_TOPE');
  assert.equal((await context(40)).comprobada,true);
  assert.equal((await implement(40)).importe_aprobado,20);
  assert.equal(await val("SELECT sum(importe_aprobado) v FROM tb_compensacion_evento WHERE id_colaborador_beneficiario=3 AND estado_evento='APROBADO'"),'400.00');
  assert.equal(await val("SELECT count(*)::int v FROM tb_compensacion_evento_revision WHERE id_evento=40 AND etapa='IMPLEMENTACION'"),1);
  assert.equal(Number(await val(`WITH periodo AS(SELECT * FROM tb_compensacion_periodo WHERE id=1), detalle AS (${cte.replaceAll('p_id_colaborador','3')}) SELECT sum((linea->>'importe')::numeric) v FROM detalle`)),400);
  await approve(41); version=(await context(41)).version;
  await assert.rejects(implement(41),/misma idea/); // Tambien reserva la idea comprobada con importe cero.
  await approve(43); version=(await context(43)).version;
  await assert.rejects(implement(43),/misma idea/); // El parcial tampoco se completa con otra solicitud.
});
test('tope de la regla valida puede limitar importe sin inventar tarifa ni revertir constancia',async()=>{
  await actor(1);
  await db.exec(`UPDATE tb_compensacion_regla SET tope_importe=15;
    INSERT INTO tb_compensacion_evento(id,id_tipo_evento,id_colaborador_beneficiario,id_usuario_registra,titulo,descripcion,fecha_evento,periodo_imputacion,estado_evento)
    OVERRIDING SYSTEM VALUE VALUES(42,1,2,2,'Otra propuesta con tope de regla','Descripcion completa',now()-interval '1 day',date_trunc('month',now() AT TIME ZONE 'America/Lima')::date,'PENDIENTE');`);
  await approve(42); version=(await context(42)).version;
  const result=await implement(42);
  assert.equal(result.importe_aprobado,15); assert.equal(result.economia.tarifa_regla,50);
  assert.equal((await context(42)).comprobada,true);
  assert.equal(await val('SELECT tarifa_aplicada v FROM tb_compensacion_evento WHERE id=42'),'50.000000');
  await db.exec('UPDATE tb_compensacion_regla SET tope_importe=NULL');
});
test('helper privado sin permiso RPC y adaptador idempotente, rechaza motor desconocido',async()=>{
  assert.equal(await val("SELECT has_function_privilege('authenticated','f_private_compensacion_innovacion_comprobada(bigint)','EXECUTE') v"),false);
  const sql=await source('77.compensaciones_innovacion_implementacion.sql');
  await db.exec(sql);
  const adapter=sql.match(/DO \$adaptador\$[\s\S]*?\$adaptador\$;/)[0];
  await db.exec('CREATE OR REPLACE FUNCTION f_private_compensacion_liquidacion_simular(p_id_periodo bigint,p_id_colaborador bigint) RETURNS jsonb LANGUAGE sql AS $$ SELECT null::jsonb $$;');
  await assert.rejects(db.exec(adapter),/Contrato del motor desconocido/);
});
