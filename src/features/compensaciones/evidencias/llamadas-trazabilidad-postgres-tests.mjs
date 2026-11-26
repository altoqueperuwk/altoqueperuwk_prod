import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE || resolve(tmpdir(),'codex-facturacion-auditoria-test/node_modules/@electric-sql/pglite/dist/index.js')));
const db = new PGlite();
const q = async (sql,args=[]) => (await db.query(sql,args)).rows;
const actor = async id => q("SELECT set_config('test.actor',$1,false)",[String(id)]);
const proof = (id,url='https://example.test/proof',code=null) => q('SELECT f_post_compensacion_atc_sustento($1,$2,$3)',[id,url,code]);
const validate = id => q('SELECT f_private_compensacion_atc_trazabilidad_validar($1)',[id]);
before(async()=> {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
  CREATE TABLE tb_compensacion_evento_tipo(id bigint,categoria text,codigo text);
  INSERT INTO tb_compensacion_evento_tipo VALUES(1,'LLAMADA','LLAMADA_CONTACTO'),(2,'TARJETA_TERCERO','SEGURIDAD_TARJETA'),(3,'OTRO','OTRO');
  CREATE TABLE tb_compensacion_evento(id bigint PRIMARY KEY,id_tipo_evento bigint,id_usuario_registra bigint,
    id_colaborador_beneficiario bigint,estado_evento text,periodo_imputacion date,datos jsonb,evidencia jsonb,descripcion text,fecha_actualizacion timestamptz);
  CREATE TABLE tb_compensacion_periodo(id bigint,periodo date,estado_periodo text);
  INSERT INTO tb_compensacion_periodo VALUES(1,'2026-10-01','ABIERTO');
  CREATE TABLE tb_compensacion_evento_referencia(id bigint GENERATED ALWAYS AS IDENTITY,id_evento bigint,tipo_referencia text,id_operacion bigint,identificador_externo text,datos_snapshot jsonb,id_usuario bigint);
  CREATE TABLE tb_operacion_proceso(id bigint,id_operacion_padre bigint,codigo_operacion_deposito_cliente text,dni_cliente text);
  INSERT INTO tb_operacion_proceso VALUES(10,NULL,'OP-1','12345678'),(11,NULL,'OP-2','87654321');
  CREATE TABLE tb_operacion_proceso_eliminada(id_operacion_proceso bigint);
  CREATE TABLE tb_usuario(id bigint,id_rol bigint); CREATE TABLE tb_compensacion_colaborador(id bigint,id_usuario bigint);
  CREATE FUNCTION f_private_compensacion_atencion_operacion(bigint) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
  -- Se aisla el autorizador existente de 27: no se sustituye en produccion.
  CREATE FUNCTION f_private_compensacion_evento_validar_alcance(bigint,varchar,boolean) RETURNS jsonb LANGUAGE plpgsql AS $$
  BEGIN
    IF current_setting('test.actor')::bigint=0 THEN RAISE EXCEPTION 'Sin permiso'; END IF;
    PERFORM id FROM tb_compensacion_evento WHERE id=$1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No existe'; END IF;
    RETURN jsonb_build_object('id_usuario',current_setting('test.actor')::bigint); END $$;
  `);
  await db.exec(await readFile('backend/backend_implementacion/78.compensaciones_trazabilidad_atc.sql','utf8'));
  // Los registradores de 27/50 se aislan; el parche 78 se ejecuta completo.
  await db.exec(`CREATE TABLE test_registros(clave uuid PRIMARY KEY,id bigint);
  CREATE FUNCTION f_post_compensacion_llamada_contacto(varchar,varchar,uuid,text,bigint) RETURNS jsonb LANGUAGE plpgsql AS $$
  DECLARE nuevo bigint; BEGIN
    SELECT id INTO nuevo FROM test_registros WHERE clave=$3;
    IF nuevo IS NULL THEN
      SELECT coalesce(max(id),100)+1 INTO nuevo FROM tb_compensacion_evento;
      INSERT INTO tb_compensacion_evento VALUES(nuevo,1,current_setting('test.actor')::bigint,1,'PENDIENTE','2026-10-01',jsonb_build_object('cliente_documento',$1),'[]',NULL,now());
      INSERT INTO test_registros VALUES($3,nuevo);
    END IF;
    RETURN jsonb_build_object('id',nuevo,'estado_evento','PENDIENTE'); END $$;
  CREATE FUNCTION f_post_compensacion_tarjeta_tercero(varchar,varchar,date,varchar,uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
  DECLARE res jsonb; BEGIN
    res:=f_post_compensacion_llamada_contacto($1,$2,$5,NULL,NULL);
    UPDATE tb_compensacion_evento SET id_tipo_evento=2,descripcion=$4 WHERE id=(res->>'id')::bigint;
    RETURN res; END $$;`);
  await actor(1);
  for(let id=1;id<=20;id++) await q(`INSERT INTO tb_compensacion_evento VALUES($1,$2,1,1,'PENDIENTE','2026-10-01','{"cliente_documento":"12345678"}','[]','Intento bloqueado documentado',now())`,[id,id===1?1:2]);
});
after(()=>db.close());
test('contacto probado es valido sin operacion ni pago',async()=>{await proof(1);await validate(1);assert.equal((await q('SELECT count(*) n FROM tb_compensacion_evento_referencia WHERE id_evento=1'))[0].n,0);});
test('intento bloqueado probado es valido sin operacion',async()=>{await proof(2);await validate(2);});
test('sin prueba externa la declaracion no permite aprobar',async()=>{await assert.rejects(validate(3),/Adjunta evidencia/);});
test('HTTP y evidencia vacia no son validas',async()=>{for(const url of [null,'','http://example.test','https://a b']) await assert.rejects(proof(3,url),/HTTPS/);});
test('DNI distinto o codigo inexistente no vinculan',async()=>{await assert.rejects(proof(3,undefined,'OP-2'),/inexistente/);await assert.rejects(proof(3,undefined,'NO'),/inexistente/);});
test('operacion pendiente valida se vincula una vez y reintento es idempotente',async()=>{await proof(4,undefined,'OP-1');await proof(4,undefined,'OP-1');await validate(4);assert.equal((await q('SELECT count(*) n FROM tb_compensacion_evento_referencia WHERE id_evento=4'))[0].n,1);});
test('clave/sustento existente no se sobrescribe',async()=>{await assert.rejects(proof(4,'https://example.test/other','OP-1'),/otro sustento/);});
test('otro usuario o no autorizado no aporta evidencia',async()=>{await actor(2);await assert.rejects(proof(5),/Solo el autor/);await actor(0);await assert.rejects(proof(5),/Sin permiso/);await actor(1);});
test('estado aprobado y periodo cerrado bloquean cambios',async()=>{await q("UPDATE tb_compensacion_evento SET estado_evento='APROBADO' WHERE id=6");await assert.rejects(proof(6),/pendientes/);await q("UPDATE tb_compensacion_periodo SET estado_periodo='CERRADO'");await assert.rejects(proof(7),/no esta abierto/);await q("UPDATE tb_compensacion_periodo SET estado_periodo='ABIERTO'");});
test('notas opcionales no sustituyen ni bloquean una evidencia valida',async()=>{await q("UPDATE tb_compensacion_evento SET descripcion=' ' WHERE id=8");await proof(8);await validate(8);});
test('operacion eliminada despues del enlace bloquea aprobacion',async()=>{await q('INSERT INTO tb_operacion_proceso_eliminada VALUES(10)');await assert.rejects(validate(4),/no esta disponible/);await q('DELETE FROM tb_operacion_proceso_eliminada');});
test('codigo ambiguo se rechaza',async()=>{await q("INSERT INTO tb_operacion_proceso VALUES(12,NULL,'OP-1','12345678')");await assert.rejects(proof(9,undefined,'OP-1'),/ambigua/);});
test('otros conceptos no aceptan este RPC',async()=>{await q('UPDATE tb_compensacion_evento SET id_tipo_evento=3 WHERE id=10');await assert.rejects(proof(10),/no admite/);});
test('RPC publicas solo autenticados y validador privado',async()=>{assert.equal((await q("SELECT has_function_privilege('anon','f_post_compensacion_atc_sustento(bigint,text,text)','EXECUTE') ok"))[0].ok,false);assert.equal((await q("SELECT has_function_privilege('authenticated','f_private_compensacion_atc_trazabilidad_validar(bigint)','EXECUTE') ok"))[0].ok,false);});

test('RPC compuesta es atomica: prueba invalida revierte registro',async()=>{
  const count=(await q('SELECT count(*) n FROM tb_compensacion_evento'))[0].n;
  await assert.rejects(q("SELECT f_post_compensacion_llamada_trazable('12345678','Cliente','00000000-0000-0000-0000-000000000001',NULL,NULL,'http://no')"),/HTTPS/);
  assert.equal((await q('SELECT count(*) n FROM tb_compensacion_evento'))[0].n,count);
});
test('RPC tarjeta conserva clave e idempotencia sin aprobar',async()=>{
  const sql="SELECT f_post_compensacion_tarjeta_trazable('12345678','Cliente','2026-10-01','Intento bloqueado','00000000-0000-0000-0000-000000000002','https://example.test/card',NULL) v";
  const first=(await q(sql))[0].v; const retry=(await q(sql))[0].v;
  assert.equal(first.id,retry.id); assert.equal(retry.estado_evento,'PENDIENTE');
  assert.equal((await q('SELECT jsonb_array_length(evidencia) n FROM tb_compensacion_evento WHERE id=$1',[first.id]))[0].n,1);
});

test('calificacion vinculada a pago no exige el input Pancake retirado',async()=>{
 await db.exec(`CREATE OR REPLACE FUNCTION f_private_compensacion_atencion_operacion(bigint) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"pagada":true,"dni":"12345678"}'::jsonb $$;
 INSERT INTO tb_usuario VALUES(1,4); INSERT INTO tb_compensacion_colaborador VALUES(1,1);
 INSERT INTO tb_compensacion_evento_tipo VALUES(4,'CALIFICACION','CALIFICACION_PRESENCIAL');
 INSERT INTO tb_compensacion_evento VALUES(200,4,1,1,'PENDIENTE','2026-10-01','{"cliente_documento":"12345678"}','[]',NULL,now());
 INSERT INTO tb_compensacion_evento_referencia(id_evento,tipo_referencia,id_operacion) VALUES(200,'OPERACION',10);`);
 await validate(200);
});
