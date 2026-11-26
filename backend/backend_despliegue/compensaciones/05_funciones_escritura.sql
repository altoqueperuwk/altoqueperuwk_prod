-- 05_funciones_escritura.sql
-- Baseline de Compensaciones (22/11/2026), generado desde la base de desarrollo. 139 funciones. Funciones de escritura (f_post_*, f_patch_*, f_put_*, f_delete_*).
-- Requiere Core y Operaciones ya instalados. No ejecutar los archivos históricos.


BEGIN;
-- Guarda: este script solo corre si quien lo ejecuta lo confirma de forma explícita.
--   SET app.confirmar_despliegue_compensaciones = 'si';
DO $guard$
BEGIN
    IF coalesce(current_setting('app.confirmar_despliegue_compensaciones', true), '') <> 'si' THEN
        RAISE EXCEPTION 'Confirma el despliegue con: SET app.confirmar_despliegue_compensaciones = ''si'';';
    END IF;
END
$guard$;
SET LOCAL check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.f_delete_compensacion_atc_safetypay_codigo(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE usuario bigint;
BEGIN
  usuario:=public.f_private_compensacion_safetypay_usuario();
  DELETE FROM public.tb_compensacion_safetypay_registro WHERE id=p_id AND id_usuario=usuario AND estado='REGISTRADO';
  IF NOT FOUND THEN RAISE EXCEPTION 'Solo puedes eliminar tus registros SafetyPay en estado Registrado'; END IF;
  RETURN jsonb_build_object('id',p_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_delete_compensacion_cliente_nuevo(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE usuario bigint; cli public.tb_cliente%ROWTYPE; v_tt bigint; v_paso integer;
BEGIN
  usuario := public.f_private_compensacion_cliente_nuevo_usuario();
  SELECT * INTO cli FROM public.tb_cliente WHERE id=p_id FOR UPDATE;
  IF cli.id IS NULL OR cli.id_usuario IS DISTINCT FROM usuario THEN RAISE EXCEPTION 'Cliente no disponible'; END IF;
  IF now()>cli.fecha_registro+interval '168 hours' THEN RAISE EXCEPTION 'El plazo de siete dias para eliminar ha vencido'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_operacion_proceso o WHERE o.id_cliente=cli.id
      OR regexp_replace(coalesce(o.dni_cliente,''),'[^0-9]','','g')=cli.numero_documento) THEN
    RAISE EXCEPTION 'El cliente ya tiene operaciones y no puede eliminarse'; END IF;
  -- TikTok Live: el registro propio aun pendiente de revision se anula (con trazabilidad) y no impide eliminar al cliente.
  SELECT e.id INTO v_tt FROM public.tb_compensacion_evento e WHERE e.fuente='CLIENTE' AND e.clave_origen='TIKTOK_REGISTRO:'||cli.id
    AND e.id_usuario_registra=usuario AND e.estado_evento IN('BORRADOR','PENDIENTE') FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia WHERE id_cliente=cli.id AND id_evento IS DISTINCT FROM v_tt)
    OR EXISTS(SELECT 1 FROM public.tb_compensacion_referido WHERE id_cliente=cli.id)
    OR EXISTS(SELECT 1 FROM public.tb_compensacion_captacion_revision WHERE id_cliente=cli.id)
    OR EXISTS(SELECT 1 FROM public.tb_compensacion_captacion_nota WHERE id_cliente=cli.id)
    OR EXISTS(SELECT 1 FROM public.tb_compensacion_chat_dni WHERE id_cliente=cli.id) THEN
    RAISE EXCEPTION 'El cliente tiene registros asociados (TikTok, referidos o revisiones) y no puede eliminarse'; END IF;
  -- La baja queda registrada (auditoria) y el documento puede volver a registrarse.
  IF v_tt IS NOT NULL THEN
    SELECT COALESCE(MAX(numero_paso),0)+1 INTO v_paso FROM public.tb_compensacion_evento_revision WHERE id_evento=v_tt;
    INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
      VALUES(v_tt,v_paso,'ANULACION','ANULADO','Registro TikTok Live eliminado por quien lo registro',usuario,
        jsonb_build_object('estado_anterior','PENDIENTE','cliente_documento',cli.numero_documento,'cliente_nombre',cli.nombre));
    UPDATE public.tb_compensacion_evento SET estado_evento='ANULADO',fecha_actualizacion=now(),
      datos=datos||jsonb_build_object('baja_cliente',jsonb_build_object('documento',cli.numero_documento,'nombre',cli.nombre)) WHERE id=v_tt;
    DELETE FROM public.tb_compensacion_evento_referencia WHERE id_evento=v_tt AND id_cliente=cli.id;
  END IF;
  INSERT INTO public.tb_compensacion_cliente_nuevo_baja(id_cliente,tipo_documento,numero_documento,nombre,id_usuario,fecha_registro_cliente)
    VALUES(cli.id,cli.tipo_documento,cli.numero_documento,cli.nombre,usuario,cli.fecha_registro);
  DELETE FROM public.tb_cliente WHERE id=cli.id;
  RETURN jsonb_build_object('id',p_id,'eliminado',true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_compensacion_atc_innovacion_pendiente(p_id bigint, p_titulo text, p_descripcion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE ev public.tb_compensacion_evento%ROWTYPE; v_ctx jsonb; v_actor bigint; v_paso integer; v_codigo text;
BEGIN
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id;
  IF ev.id IS NULL THEN RAISE EXCEPTION 'La propuesta no existe'; END IF;
  SELECT t.codigo INTO v_codigo FROM public.tb_compensacion_evento_tipo t WHERE t.id=ev.id_tipo_evento;
  IF v_codigo IS DISTINCT FROM 'PROPUESTA_INNOVACION' THEN RAISE EXCEPTION 'Este registro no es una propuesta de innovacion'; END IF;
  v_ctx := public.f_private_compensacion_evento_validar_alcance(p_id,'EDITAR',true);
  v_actor := (v_ctx->>'id_usuario')::bigint;
  IF ev.id_usuario_registra IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'Solo quien registro puede editarla'; END IF;
  IF ev.estado_evento NOT IN('BORRADOR','PENDIENTE') THEN RAISE EXCEPTION 'Solo se edita una propuesta pendiente de revision'; END IF;
  IF p_titulo IS NULL OR length(btrim(p_titulo)) NOT BETWEEN 1 AND 250 THEN RAISE EXCEPTION 'El titulo requiere hasta 250 caracteres'; END IF;
  IF p_descripcion IS NULL OR length(btrim(p_descripcion)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'La descripcion requiere hasta 2000 caracteres'; END IF;
  SELECT COALESCE(MAX(numero_paso),0)+1 INTO v_paso FROM public.tb_compensacion_evento_revision WHERE id_evento=p_id;
  INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
  VALUES(p_id,v_paso,'REGISTRO','ENVIADO','Edicion de la propuesta por quien la registro',v_actor,
    jsonb_build_object('accion','EDICION','antes',jsonb_build_object('titulo',ev.titulo,'descripcion',ev.descripcion)));
  UPDATE public.tb_compensacion_evento SET titulo=btrim(p_titulo),descripcion=btrim(p_descripcion),fecha_actualizacion=now() WHERE id=p_id;
  RETURN jsonb_build_object('id',p_id,'estado_evento',ev.estado_evento,'mensaje','Propuesta actualizada');
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_compensacion_atc_safetypay_codigo(p_id bigint, p_codigo text, p_documento text, p_tipo_documento bigint, p_monto numeric, p_id_comunidad bigint, p_fecha_deposito date, p_codigo_cliente text, p_tarjeta text, p_banco text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE config jsonb; comunidad jsonb; usuario bigint; fecha timestamptz; actual public.tb_compensacion_safetypay_registro%ROWTYPE;
BEGIN
  usuario:=public.f_private_compensacion_safetypay_usuario();
  SELECT * INTO actual FROM public.tb_compensacion_safetypay_registro WHERE id=p_id AND id_usuario=usuario FOR UPDATE;
  IF actual.id IS NULL OR actual.estado<>'REGISTRADO' THEN
    RAISE EXCEPTION 'Solo puedes modificar tus registros SafetyPay en estado Registrado'; END IF;
  config:=public.f_private_compensacion_safetypay_registro_configuracion();
  IF nullif(btrim(p_codigo),'') IS NULL OR length(btrim(p_codigo))>100 THEN RAISE EXCEPTION 'Ingresa el codigo de operacion de hasta 100 caracteres'; END IF;
  IF p_tipo_documento IS NULL OR p_tipo_documento NOT IN(1,2) OR p_documento IS NULL
    OR (p_tipo_documento=1 AND p_documento !~ '^[0-9]{8}$') OR (p_tipo_documento=2 AND p_documento !~ '^[0-9]{9}$') THEN RAISE EXCEPTION 'Documento invalido'; END IF;
  IF p_monto IS NULL OR p_monto::text IN('NaN','Infinity','-Infinity') OR p_monto<=0 OR p_monto>=100000 OR round(p_monto,2)<>p_monto THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero y menor a S/ 100,000.00, con hasta dos decimales'; END IF;
  IF p_codigo_cliente IS NULL OR p_codigo_cliente !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'El codigo cliente requiere 6 digitos'; END IF;
  IF p_tarjeta IS NULL OR p_tarjeta !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'La tarjeta requiere sus ultimos 4 digitos'; END IF;
  IF p_banco IS NULL OR p_banco NOT IN('CMR','IBK','IO') THEN RAISE EXCEPTION 'Banco SafetyPay no valido'; END IF;
  IF p_fecha_deposito IS NULL THEN RAISE EXCEPTION 'La fecha de deposito es obligatoria'; END IF;
  SELECT x INTO comunidad FROM jsonb_array_elements(config->'comunidades') x WHERE (x->>'id')::bigint=p_id_comunidad;
  IF comunidad IS NULL THEN RAISE EXCEPTION 'Comunidad no disponible para SafetyPay'; END IF;
  fecha:=(p_fecha_deposito+(actual.fecha_deposito AT TIME ZONE 'America/Lima')::time) AT TIME ZONE 'America/Lima';
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|','safetypay',p_banco,p_codigo_cliente,round(p_monto,2)::text),0));
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_safetypay_registro x WHERE x.id<>p_id AND x.banco=p_banco AND x.codigo_cliente=p_codigo_cliente
      AND x.monto=round(p_monto,2) AND (x.fecha_deposito AT TIME ZONE 'America/Lima')::date BETWEEN p_fecha_deposito-7 AND p_fecha_deposito+7)
    THEN RAISE EXCEPTION 'Registro duplicado por codigo cliente, banco, monto y fecha de deposito'; END IF;
  UPDATE public.tb_compensacion_safetypay_registro SET codigo_operacion=btrim(p_codigo),tipo_documento=p_tipo_documento,documento=p_documento,
    monto=round(p_monto,2),id_comunidad=p_id_comunidad,nombre_comunidad=comunidad->>'nombre',fecha_deposito=fecha,
    codigo_cliente=p_codigo_cliente,tarjeta=p_tarjeta,banco=p_banco,fecha_actualizacion=now()
    WHERE id=p_id;
  PERFORM public.f_private_compensacion_safetypay_conciliar(p_id);
  RETURN jsonb_build_object('id',p_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_compensacion_atencion_liberar(p_id bigint, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE ctx jsonb; r bigint; a public.tb_compensacion_atencion%ROWTYPE;
BEGIN
  ctx:=public.f_private_compensacion_atencion_contexto();
  IF NOT (ctx->>'es_admin')::boolean THEN RAISE EXCEPTION 'Solo el administrador puede liberar una operacion'; END IF;
  IF length(btrim(coalesce(p_motivo,'')))<5 OR length(p_motivo)>1000 THEN RAISE EXCEPTION 'Indica un motivo de 5 a 1000 caracteres'; END IF;
  SELECT id_operacion_raiz INTO r FROM public.tb_compensacion_atencion WHERE id=p_id;
  PERFORM 1 FROM public.tb_operacion_proceso WHERE id=r FOR UPDATE;
  SELECT * INTO a FROM public.tb_compensacion_atencion WHERE id=p_id FOR UPDATE;
  IF a.id IS NULL OR a.estado<>'VIGENTE' THEN RAISE EXCEPTION 'La atencion ya no esta vigente'; END IF;
  UPDATE public.tb_compensacion_atencion SET estado='LIBERADA',id_usuario_libera=(ctx->>'id_usuario')::bigint,
    fecha_liberacion=now(),motivo_liberacion=btrim(p_motivo) WHERE id=p_id RETURNING * INTO a;
  RETURN to_jsonb(a);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_compensacion_calificacion_administrar(p_id bigint, p_accion text, p_version timestamp with time zone, p_motivo text, p_estrellas integer DEFAULT NULL::integer, p_dni text DEFAULT NULL::text, p_comentario text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_ctx jsonb; v_evento public.tb_compensacion_evento%ROWTYPE;
  v_accion text:=upper(btrim(p_accion)); v_actor bigint; v_paso integer;
  v_estado text; v_datos jsonb; v_descripcion text;
BEGIN
  v_ctx:=public.f_private_compensacion_evento_validar_alcance(p_id,'APROBAR',true);
  IF NOT coalesce((v_ctx->>'es_super_admin')::boolean,false) THEN
    RAISE EXCEPTION 'Solo el administrador puede modificar calificaciones';
  END IF;
  v_actor:=(v_ctx->>'id_usuario')::bigint;
  SELECT * INTO v_evento FROM public.tb_compensacion_evento WHERE id=p_id;
  IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_tipo
    WHERE id=v_evento.id_tipo_evento AND codigo='CALIFICACION_PRESENCIAL') THEN
    RAISE EXCEPTION 'El registro no es una calificación presencial';
  END IF;
  IF p_version IS NULL OR p_version IS DISTINCT FROM v_evento.fecha_actualizacion THEN
    RAISE EXCEPTION 'La calificación cambió. Actualice la lista antes de continuar';
  END IF;
  IF v_accion IS NULL OR v_accion NOT IN('EDITAR','PENDIENTE','RECHAZADO') THEN
    RAISE EXCEPTION 'Acción de calificación no válida';
  END IF;
  IF v_evento.estado_evento NOT IN('PENDIENTE','APROBADO','RECHAZADO') THEN
    RAISE EXCEPTION 'La calificación no admite modificaciones en su estado actual';
  END IF;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_periodo
    WHERE periodo=v_evento.periodo_imputacion AND estado_periodo IN('APROBADO','CERRADO')) THEN
    RAISE EXCEPTION 'El periodo está aprobado o cerrado';
  END IF;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento e2 WHERE e2.id=p_id AND EXISTS(SELECT 1 FROM public.tb_compensacion_reporte_mes rm JOIN public.tb_compensacion_periodo rp ON rp.id=rm.id_periodo WHERE rp.periodo=e2.periodo_imputacion AND rm.estado='CONFIRMADO')) THEN
    RAISE EXCEPTION 'La calificación pertenece a un reporte confirmado';
  END IF;
  IF v_accion<>'RECHAZADO' AND nullif(btrim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'Indique el motivo del cambio'; END IF;
  IF v_accion<>'EDITAR' AND v_actor=v_evento.id_usuario_registra THEN
    RAISE EXCEPTION 'El usuario que registró la calificación no puede resolverla';
  END IF;
  IF (v_accion='PENDIENTE' AND v_evento.estado_evento='PENDIENTE')
    OR (v_accion='RECHAZADO' AND v_evento.estado_evento='RECHAZADO') THEN
    RAISE EXCEPTION 'La calificación ya tiene ese estado';
  END IF;
  v_datos:=v_evento.datos; v_descripcion:=v_evento.descripcion;
  IF v_accion='EDITAR' THEN
    IF p_estrellas IS NULL OR p_estrellas NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Estrellas entre 1 y 5'; END IF;
    IF nullif(btrim(p_dni),'') IS NOT NULL AND btrim(p_dni)!~'^[0-9]{8}$' THEN RAISE EXCEPTION 'El DNI debe tener 8 dígitos'; END IF;
    IF length(coalesce(p_comentario,''))>2000 THEN RAISE EXCEPTION 'Comentario máximo de 2000 caracteres'; END IF;
    v_datos:=v_datos||jsonb_build_object('estrellas',p_estrellas,'cliente_documento',nullif(btrim(p_dni),''));
    v_descripcion:=nullif(btrim(p_comentario),'');
  END IF;
  v_estado:=CASE WHEN v_accion='RECHAZADO' THEN 'RECHAZADO' ELSE 'PENDIENTE' END;
  SELECT coalesce(max(numero_paso),0)+1 INTO v_paso FROM public.tb_compensacion_evento_revision WHERE id_evento=p_id;
  INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
  VALUES(p_id,v_paso,'ADMIN_CALIFICACION',CASE WHEN v_estado='RECHAZADO' THEN 'RECHAZADO' ELSE 'ENVIADO' END,
    nullif(btrim(p_motivo),''),v_actor,jsonb_build_object('accion',v_accion,'anterior',to_jsonb(v_evento),
      'origen_decision','REVISION_DIRECTA_PLAN_74','nota_humana_opcional',v_accion='RECHAZADO',
      'nuevo',jsonb_build_object('datos',v_datos,'descripcion',v_descripcion,'estado_evento',v_estado)));
  UPDATE public.tb_compensacion_evento SET datos=v_datos,descripcion=v_descripcion,estado_evento=v_estado,
    id_regla_aplicada=NULL,base_calculo=NULL,cantidad=NULL,tarifa_aplicada=NULL,importe_aprobado=NULL,
    fecha_actualizacion=clock_timestamp() WHERE id=p_id;
  -- El snapshot de tarifa/validez de registro se conserva: no se recalcula con reglas actuales.
  RETURN jsonb_build_object('id',p_id,'estado_evento',v_estado);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_compensacion_captura(p_id bigint, p_dni text, p_nombre text, p_fecha date DEFAULT NULL::date, p_notas text DEFAULT NULL::text, p_celular text DEFAULT NULL::text, p_tarjeta_ultimos4 text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
 SET "TimeZone" TO 'America/Lima'
AS $function$
DECLARE
  ev public.tb_compensacion_evento%ROWTYPE; v_cat text; v_ctx jsonb; v_actor bigint; v_paso integer;
  v_datos jsonb; v_celular text := nullif(btrim(coalesce(p_celular,'')),''); v_periodo date;
BEGIN
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id;
  IF ev.id IS NULL THEN RAISE EXCEPTION 'El registro no existe'; END IF;
  SELECT t.categoria INTO v_cat FROM public.tb_compensacion_evento_tipo t WHERE t.id=ev.id_tipo_evento;
  IF v_cat IS NULL OR v_cat NOT IN('LLAMADA','TARJETA_TERCERO') THEN RAISE EXCEPTION 'Este registro no admite edicion'; END IF;
  v_ctx := public.f_private_compensacion_evento_validar_alcance(p_id,'EDITAR',true);
  v_actor := (v_ctx->>'id_usuario')::bigint;
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id;
  IF ev.id_usuario_registra IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'Solo quien registro puede editarlo'; END IF;
  IF ev.estado_evento NOT IN('BORRADOR','PENDIENTE') THEN RAISE EXCEPTION 'Solo se edita un registro pendiente de revision'; END IF;
  IF p_dni IS NULL OR btrim(p_dni) !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'Ingresa un DNI de 8 digitos'; END IF;
  IF p_nombre IS NULL OR length(btrim(p_nombre)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Ingresa el nombre del cliente (maximo 200 caracteres)'; END IF;
  IF length(coalesce(p_notas,''))>2000 THEN RAISE EXCEPTION 'Las notas admiten maximo 2000 caracteres'; END IF;
  v_datos := ev.datos || jsonb_build_object('cliente_documento',btrim(p_dni),'cliente_nombre',btrim(p_nombre));
  IF v_cat='TARJETA_TERCERO' THEN
    IF p_fecha IS NULL OR p_fecha>(now() AT TIME ZONE 'America/Lima')::date THEN RAISE EXCEPTION 'Ingresa una fecha de deteccion valida, no futura'; END IF;
    v_periodo := date_trunc('month',p_fecha)::date;
    IF EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=v_periodo AND estado_periodo IN('APROBADO','CERRADO')) THEN
      RAISE EXCEPTION 'El periodo de esa fecha esta bloqueado'; END IF;
    v_datos := v_datos || jsonb_build_object('fecha_detectada',p_fecha,'tarjeta_ultimos4',public.f_private_compensacion_tarjeta_ultimos4(p_tarjeta_ultimos4));
  ELSE
    IF v_celular IS NOT NULL AND v_celular !~ '^[0-9]{7,15}$' THEN RAISE EXCEPTION 'Ingresa un celular de 7 a 15 digitos o dejalo vacio'; END IF;
    IF v_celular IS NOT NULL THEN v_datos := v_datos || jsonb_build_object('cliente_celular',v_celular); END IF;
  END IF;
  SELECT COALESCE(MAX(numero_paso),0)+1 INTO v_paso FROM public.tb_compensacion_evento_revision WHERE id_evento=p_id;
  INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
  VALUES(p_id,v_paso,'REGISTRO','ENVIADO','Edicion del registro por quien lo registro',v_actor,
    jsonb_build_object('accion','EDICION','antes',jsonb_build_object('cliente_documento',ev.datos->>'cliente_documento','cliente_nombre',ev.datos->>'cliente_nombre',
      'fecha_detectada',ev.datos->>'fecha_detectada','cliente_celular',ev.datos->>'cliente_celular','tarjeta_ultimos4',ev.datos->>'tarjeta_ultimos4','descripcion',ev.descripcion)));
  UPDATE public.tb_compensacion_evento SET datos=v_datos,
    descripcion=CASE WHEN v_cat='TARJETA_TERCERO' THEN nullif(btrim(coalesce(p_notas,'')),'') ELSE descripcion END,
    fecha_evento=CASE WHEN v_cat='TARJETA_TERCERO' THEN p_fecha::timestamp AT TIME ZONE 'America/Lima' ELSE fecha_evento END,
    periodo_imputacion=CASE WHEN v_cat='TARJETA_TERCERO' THEN v_periodo ELSE periodo_imputacion END,
    fecha_actualizacion=now()
  WHERE id=p_id;
  UPDATE public.tb_compensacion_evento_referencia SET identificador_externo=btrim(p_dni),
    datos_snapshot=jsonb_build_object('documento',btrim(p_dni),'nombre',btrim(p_nombre))
  WHERE id_evento=p_id AND tipo_referencia='CLIENTE';
  RETURN jsonb_build_object('id',p_id,'estado_evento',ev.estado_evento,'mensaje','Registro actualizado');
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_compensacion_cliente_nuevo(p_id bigint, p_documento text, p_nombre text, p_tipo_documento bigint DEFAULT 1, p_celular text DEFAULT NULL::text, p_id_comunidad bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE usuario bigint; cliente public.tb_cliente%ROWTYPE;
BEGIN
  usuario:=public.f_private_compensacion_cliente_nuevo_usuario();
  IF EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=usuario AND id_rol=6) AND NOT EXISTS(
    SELECT 1 FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_referencia r ON r.id_evento=e.id AND r.id_cliente=p_id
    WHERE e.id_usuario_registra=usuario AND e.datos->>'flujo'='TIKTOK_CLIENTE_NUEVO_7_DIAS') THEN RAISE EXCEPTION 'Solo puedes editar tu cliente TikTok elegible'; END IF;
  -- Sin bloqueo de tabla: la operativa nunca espera a Compensaciones.
  SET LOCAL lock_timeout='3s';
  SELECT * INTO cliente FROM public.tb_cliente WHERE id=p_id FOR UPDATE;
  IF cliente.id IS NULL OR cliente.id_usuario IS DISTINCT FROM usuario THEN RAISE EXCEPTION 'Solo puedes editar tus propios clientes'; END IF;
  IF clock_timestamp()>cliente.fecha_registro+interval '168 hours' THEN RAISE EXCEPTION 'El plazo de siete dias para editar ha vencido'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_operacion_proceso o WHERE o.id_cliente=p_id OR regexp_replace(coalesce(o.dni_cliente,''),'[^0-9]','','g') IN(cliente.numero_documento,p_documento)) THEN
    RAISE EXCEPTION 'El cliente ya tiene una operacion vinculada y no puede editarse'; END IF;
  IF coalesce(length(btrim(p_nombre)),0)<3 OR length(btrim(p_nombre))>200 THEN RAISE EXCEPTION 'Ingresa el nombre completo (3 a 200 caracteres)'; END IF;
  IF coalesce(p_celular,'')<>'' AND p_celular !~ '^[0-9]{9}$' THEN RAISE EXCEPTION 'El celular requiere 9 digitos'; END IF;
  IF p_id_comunidad IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tb_comunidad co JOIN public.tb_estado e ON e.id=co.id_estado WHERE co.id=p_id_comunidad AND upper(e.nombre)='ACTIVO') THEN RAISE EXCEPTION 'Comunidad no disponible'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cliente-nuevo:'||p_tipo_documento||':'||p_documento,0));
  -- Revalidar DESPUES del bloqueo: una alta/edicion puede haber ganado la carrera.
  IF (public.f_get_compensacion_cliente_nuevo_validar(p_documento,p_tipo_documento,p_id)->>'existe')::boolean THEN RAISE EXCEPTION 'El documento ya pertenece a otro cliente'; END IF;
  IF clock_timestamp()>cliente.fecha_registro+interval '168 hours' THEN RAISE EXCEPTION 'El plazo de siete dias para editar ha vencido'; END IF;
  UPDATE public.tb_cliente SET tipo_documento=p_tipo_documento,numero_documento=p_documento,nombre=btrim(p_nombre),celular=nullif(p_celular,'')::bigint,id_comunidad=p_id_comunidad WHERE id=p_id;
  RETURN jsonb_build_object('id',p_id,'fecha_registro',cliente.fecha_registro);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'El documento ya pertenece a otro cliente';
  WHEN lock_not_available THEN RAISE EXCEPTION 'El cliente se esta editando. Intenta nuevamente';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_compensacion_descuento_mes_anular(p_id_descuento bigint, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_actor bigint;
  v_d public.tb_compensacion_descuento_mes%ROWTYPE;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  v_actor := public.f_private_compensacion_bonos_mes_admin();
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'El motivo de anulación es obligatorio'; END IF;
  SELECT * INTO v_d FROM public.tb_compensacion_descuento_mes WHERE id = p_id_descuento FOR UPDATE;
  IF v_d.id IS NULL THEN RAISE EXCEPTION 'Descuento inexistente'; END IF;
  PERFORM 1 FROM public.tb_compensacion_periodo WHERE id = v_d.id_periodo FOR UPDATE;
  IF public.f_private_compensacion_reporte_mes_confirmado(v_d.id_periodo) THEN
    RAISE EXCEPTION 'El reporte del mes está confirmado; reabrirlo antes de cambiar descuentos';
  END IF;
  IF v_d.estado <> 'ACTIVO' THEN RAISE EXCEPTION 'El descuento ya está anulado'; END IF;
  UPDATE public.tb_compensacion_descuento_mes
     SET estado = 'ANULADO', id_usuario_anula = v_actor, fecha_anulacion = now(), motivo_anulacion = v_motivo, fecha_actualizacion = now()
   WHERE id = p_id_descuento;
  RETURN jsonb_build_object('id', p_id_descuento, 'estado', 'ANULADO');
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_compensacion_referido_captura(p_id bigint, p_notas text, p_nombre text, p_monto numeric, p_id_banco bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  r public.tb_compensacion_referido%ROWTYPE; ev public.tb_compensacion_evento%ROWTYPE; v_ctx jsonb; v_actor bigint; v_banco varchar; v_paso integer;
BEGIN
  SELECT * INTO r FROM public.tb_compensacion_referido WHERE id=p_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'El referido no existe'; END IF;
  v_ctx := public.f_private_compensacion_evento_validar_alcance(r.id_evento,'EDITAR',true);
  v_actor := (v_ctx->>'id_usuario')::bigint;
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=r.id_evento;
  IF ev.id_usuario_registra IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'Solo quien registro puede editarlo'; END IF;
  IF r.estado_referido<>'PENDIENTE' OR ev.estado_evento<>'PENDIENTE' THEN RAISE EXCEPTION 'Solo se edita un referido pendiente de validacion'; END IF;
  IF length(coalesce(p_notas,''))>2000 THEN RAISE EXCEPTION 'Las notas admiten hasta 2000 caracteres'; END IF;
  IF nullif(btrim(coalesce(p_nombre,'')),'') IS NULL OR length(btrim(p_nombre))>250 THEN RAISE EXCEPTION 'Ingresa el nombre del referido (hasta 250 caracteres)'; END IF;
  IF p_monto IS NULL OR p_monto::text IN('NaN','Infinity','-Infinity') OR p_monto<=0 OR p_monto<>round(p_monto,2) OR p_monto>999999999999.99 THEN
    RAISE EXCEPTION 'Ingresa un monto mayor a cero, con hasta dos decimales'; END IF;
  SELECT nombre INTO v_banco FROM public.tb_banco WHERE id=p_id_banco AND id_estado=1;
  IF v_banco IS NULL THEN RAISE EXCEPTION 'Selecciona un banco activo'; END IF;
  SELECT COALESCE(MAX(numero_paso),0)+1 INTO v_paso FROM public.tb_compensacion_evento_revision WHERE id_evento=r.id_evento;
  INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
  VALUES(r.id_evento,v_paso,'REGISTRO','ENVIADO','Edicion del referido por quien lo registro',v_actor,
    jsonb_build_object('accion','EDICION','antes',jsonb_build_object('notas',ev.descripcion,'declaracion_referido',ev.datos->'declaracion_referido')));
  UPDATE public.tb_compensacion_evento SET descripcion=nullif(btrim(coalesce(p_notas,'')),''),
    datos=datos||jsonb_build_object('declaracion_referido',coalesce(datos->'declaracion_referido','{}'::jsonb)||
      jsonb_build_object('nombre',btrim(p_nombre),'monto',p_monto,'id_banco',p_id_banco,'banco',v_banco)),
    fecha_actualizacion=now()
  WHERE id=r.id_evento;
  UPDATE public.tb_compensacion_referido SET nombre_referido_snapshot=btrim(p_nombre),fecha_actualizacion=now() WHERE id=p_id;
  RETURN jsonb_build_object('id',p_id,'id_evento',r.id_evento,'mensaje','Referido actualizado');
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_cargo(p_id bigint, p_codigo character varying DEFAULT NULL::character varying, p_nombre character varying DEFAULT NULL::character varying, p_descripcion text DEFAULT NULL::text, p_orden integer DEFAULT NULL::integer, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF NOT EXISTS (SELECT 1 FROM public.tb_compensacion_cargo WHERE id = p_id) THEN
    RAISE EXCEPTION 'El cargo no existe';
  END IF;

  IF p_codigo IS NOT NULL AND NULLIF(TRIM(p_codigo), '') IS NULL THEN
    RAISE EXCEPTION 'El codigo no puede quedar vacio';
  END IF;

  IF p_nombre IS NOT NULL AND NULLIF(TRIM(p_nombre), '') IS NULL THEN
    RAISE EXCEPTION 'El nombre no puede quedar vacio';
  END IF;

  UPDATE public.tb_compensacion_cargo
  SET codigo = CASE WHEN p_codigo IS NULL THEN codigo ELSE UPPER(TRIM(p_codigo)) END,
      nombre = CASE WHEN p_nombre IS NULL THEN nombre ELSE TRIM(p_nombre) END,
      descripcion = CASE WHEN p_descripcion IS NULL THEN descripcion ELSE NULLIF(TRIM(p_descripcion), '') END,
      orden = COALESCE(p_orden, orden),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (
    SELECT jsonb_build_object(
      'id', c.id,
      'codigo', c.codigo,
      'nombre', c.nombre,
      'descripcion', c.descripcion,
      'orden', c.orden,
      'id_estado', c.id_estado,
      'fecha_actualizacion', c.fecha_actualizacion
    )
    FROM public.tb_compensacion_cargo c
    WHERE c.id = p_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe un cargo con ese codigo';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_colaborador(p_id bigint, p_id_usuario bigint DEFAULT NULL::bigint, p_tipo_documento character varying DEFAULT NULL::character varying, p_numero_documento character varying DEFAULT NULL::character varying, p_nombres character varying DEFAULT NULL::character varying, p_apellido_paterno character varying DEFAULT NULL::character varying, p_apellido_materno character varying DEFAULT NULL::character varying, p_nombre_completo character varying DEFAULT NULL::character varying, p_email character varying DEFAULT NULL::character varying, p_celular character varying DEFAULT NULL::character varying, p_codigo_huellero character varying DEFAULT NULL::character varying, p_fecha_ingreso date DEFAULT NULL::date, p_fecha_cese date DEFAULT NULL::date, p_motivo_cese text DEFAULT NULL::text, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_alcance character varying;
  v_id_sucursal_alcance bigint;
  v_actual public.tb_compensacion_colaborador%ROWTYPE;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'COLABORADORES',
    'EDITAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;
  v_alcance := v_contexto ->> 'alcance';
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  SELECT * INTO v_actual
  FROM public.tb_compensacion_colaborador
  WHERE id = p_id FOR UPDATE;

  IF v_actual.id IS NULL THEN
    RAISE EXCEPTION 'El colaborador no existe';
  END IF;

  IF v_alcance = 'PROPIO' THEN
    RAISE EXCEPTION 'La edicion de la ficha laboral requiere alcance de sede o global';
  END IF;

  IF v_alcance = 'SEDE' AND NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_asignacion a
    WHERE a.id_colaborador = p_id
      AND a.id_sucursal = v_id_sucursal_alcance
      AND a.fecha_inicio <= CURRENT_DATE
      AND (a.fecha_fin IS NULL OR a.fecha_fin >= CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'El colaborador no pertenece a su sede autorizada';
  END IF;

  IF p_numero_documento IS NOT NULL
     AND NULLIF(TRIM(p_numero_documento), '') IS NULL THEN
    RAISE EXCEPTION 'El numero de documento no puede quedar vacio';
  END IF;

  IF p_nombre_completo IS NOT NULL
     AND NULLIF(TRIM(p_nombre_completo), '') IS NULL THEN
    RAISE EXCEPTION 'El nombre completo no puede quedar vacio';
  END IF;

  IF p_fecha_cese IS NOT NULL
     AND p_fecha_cese < COALESCE(p_fecha_ingreso, v_actual.fecha_ingreso) THEN
    RAISE EXCEPTION 'La fecha de cese no puede ser anterior a la fecha de ingreso';
  END IF;

  IF EXISTS(WITH cambios AS(
    SELECT least(p_fecha_ingreso,v_actual.fecha_ingreso) desde,greatest(p_fecha_ingreso,v_actual.fecha_ingreso)-1 hasta
     WHERE p_fecha_ingreso IS NOT NULL AND p_fecha_ingreso<>v_actual.fecha_ingreso
    UNION ALL SELECT least(p_fecha_cese,coalesce(v_actual.fecha_cese,'infinity'::date))+1,
      greatest(p_fecha_cese,coalesce(v_actual.fecha_cese,'infinity'::date))
     WHERE p_fecha_cese IS NOT NULL AND p_fecha_cese IS DISTINCT FROM v_actual.fecha_cese
   ) SELECT 1 FROM cambios d JOIN public.tb_compensacion_periodo pe ON daterange(pe.fecha_inicio,pe.fecha_fin,'[]') && daterange(d.desde,greatest(d.desde,d.hasta),'[]')
    WHERE pe.estado_periodo IN('APROBADO','CERRADO') OR EXISTS(SELECT 1 FROM public.tb_compensacion_reporte_mes rm WHERE rm.id_periodo=pe.id AND rm.estado='CONFIRMADO')) THEN
    RAISE EXCEPTION 'La fecha laboral afecta un periodo o sueldo aprobado';
  END IF;
  IF p_id_usuario IS NOT NULL AND p_id_usuario IS DISTINCT FROM v_actual.id_usuario THEN
    RAISE EXCEPTION 'El usuario vinculado al colaborador no se puede cambiar';
  END IF;
  PERFORM public.f_private_compensacion_usuario_vincular_auth(COALESCE(p_id_usuario,v_actual.id_usuario));

  UPDATE public.tb_compensacion_colaborador
  SET tipo_documento = CASE WHEN p_tipo_documento IS NULL THEN tipo_documento ELSE UPPER(TRIM(p_tipo_documento)) END,
      numero_documento = CASE WHEN p_numero_documento IS NULL THEN numero_documento ELSE TRIM(p_numero_documento) END,
      nombres = CASE WHEN p_nombres IS NULL THEN nombres ELSE TRIM(p_nombres) END,
      apellido_paterno = CASE WHEN p_apellido_paterno IS NULL THEN apellido_paterno ELSE NULLIF(TRIM(p_apellido_paterno), '') END,
      apellido_materno = CASE WHEN p_apellido_materno IS NULL THEN apellido_materno ELSE NULLIF(TRIM(p_apellido_materno), '') END,
      nombre_completo = CASE WHEN p_nombre_completo IS NULL THEN nombre_completo ELSE TRIM(p_nombre_completo) END,
      email = CASE WHEN p_email IS NULL THEN email ELSE NULLIF(LOWER(TRIM(p_email)), '') END,
      celular = CASE WHEN p_celular IS NULL THEN celular ELSE NULLIF(TRIM(p_celular), '') END,
      codigo_huellero = CASE WHEN p_codigo_huellero IS NULL THEN codigo_huellero ELSE NULLIF(TRIM(p_codigo_huellero), '') END,
      fecha_ingreso = COALESCE(p_fecha_ingreso, fecha_ingreso),
      fecha_cese = COALESCE(p_fecha_cese, fecha_cese),
      motivo_cese = CASE WHEN p_motivo_cese IS NULL THEN motivo_cese ELSE NULLIF(TRIM(p_motivo_cese), '') END,
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario_registra = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (
    SELECT jsonb_build_object(
      'id', c.id,
      'id_usuario', c.id_usuario,
      'tipo_documento', c.tipo_documento,
      'numero_documento', c.numero_documento,
      'nombre_completo', c.nombre_completo,
      'email', c.email,
      'celular', c.celular,
      'codigo_huellero', c.codigo_huellero,
      'fecha_ingreso', c.fecha_ingreso,
      'fecha_cese', c.fecha_cese,
      'motivo_cese', c.motivo_cese,
      'id_estado', c.id_estado,
      'fecha_actualizacion', c.fecha_actualizacion
    )
    FROM public.tb_compensacion_colaborador c
    WHERE c.id = p_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'El documento, usuario o codigo de huellero ya pertenece a otro colaborador';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_concepto(p_id bigint, p_codigo character varying DEFAULT NULL::character varying, p_nombre character varying DEFAULT NULL::character varying, p_categoria character varying DEFAULT NULL::character varying, p_naturaleza character varying DEFAULT NULL::character varying, p_unidad character varying DEFAULT NULL::character varying, p_requiere_evidencia boolean DEFAULT NULL::boolean, p_requiere_aprobacion boolean DEFAULT NULL::boolean, p_permite_excepcion boolean DEFAULT NULL::boolean, p_orden integer DEFAULT NULL::integer, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_concepto WHERE id = p_id
  ) THEN
    RAISE EXCEPTION 'El concepto no existe';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT r.id_plan_version
      FROM public.tb_compensacion_regla r
      WHERE r.id_concepto = p_id

      UNION ALL

      SELECT t.id_plan_version
      FROM public.tb_compensacion_penalidad_tipo t
      WHERE t.id_concepto_descuento = p_id
         OR t.id_concepto_bono_reportante = p_id
    ) uso
    JOIN public.tb_compensacion_plan_version pv
      ON pv.id = uso.id_plan_version
    WHERE pv.estado_version IN ('PUBLICADA', 'RETIRADA')
  ) THEN
    RAISE EXCEPTION 'No se puede editar un concepto utilizado por configuraciones publicadas';
  END IF;

  UPDATE public.tb_compensacion_concepto
  SET codigo = CASE WHEN p_codigo IS NULL THEN codigo ELSE UPPER(TRIM(p_codigo)) END,
      nombre = CASE WHEN p_nombre IS NULL THEN nombre ELSE TRIM(p_nombre) END,
      categoria = CASE WHEN p_categoria IS NULL THEN categoria ELSE UPPER(TRIM(p_categoria)) END,
      naturaleza = CASE WHEN p_naturaleza IS NULL THEN naturaleza ELSE UPPER(TRIM(p_naturaleza)) END,
      unidad = CASE WHEN p_unidad IS NULL THEN unidad ELSE UPPER(TRIM(p_unidad)) END,
      requiere_evidencia = COALESCE(p_requiere_evidencia, requiere_evidencia),
      requiere_aprobacion = COALESCE(p_requiere_aprobacion, requiere_aprobacion),
      permite_excepcion = COALESCE(p_permite_excepcion, permite_excepcion),
      orden = COALESCE(p_orden, orden),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (
    SELECT to_jsonb(c)
    FROM public.tb_compensacion_concepto c
    WHERE c.id = p_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe un concepto con ese codigo';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_evento(p_id bigint, p_titulo character varying DEFAULT NULL::character varying, p_descripcion text DEFAULT NULL::text, p_datos jsonb DEFAULT NULL::jsonb, p_evidencia jsonb DEFAULT NULL::jsonb, p_periodo_imputacion date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_evento public.tb_compensacion_evento%ROWTYPE;
BEGIN
  v_contexto := public.f_private_compensacion_evento_validar_alcance(
    p_id, 'EDITAR', true
  );

  SELECT * INTO v_evento FROM public.tb_compensacion_evento WHERE id = p_id;

  IF v_evento.estado_evento <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se pueden editar eventos en borrador';
  END IF;

  IF p_datos IS NOT NULL AND jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'Los datos deben enviarse como un objeto JSON';
  END IF;

  IF p_evidencia IS NOT NULL AND jsonb_typeof(p_evidencia) <> 'array' THEN
    RAISE EXCEPTION 'La evidencia debe enviarse como un arreglo JSON';
  END IF;

  UPDATE public.tb_compensacion_evento
  SET titulo = CASE WHEN p_titulo IS NULL THEN titulo ELSE NULLIF(TRIM(p_titulo), '') END,
      descripcion = CASE WHEN p_descripcion IS NULL THEN descripcion ELSE NULLIF(TRIM(p_descripcion), '') END,
      datos = COALESCE(p_datos, datos),
      evidencia = COALESCE(p_evidencia, evidencia),
      periodo_imputacion = COALESCE(p_periodo_imputacion, periodo_imputacion),
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (SELECT to_jsonb(ev) FROM public.tb_compensacion_evento ev WHERE ev.id = p_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_evento_tipo(p_id bigint, p_codigo character varying DEFAULT NULL::character varying, p_nombre character varying DEFAULT NULL::character varying, p_categoria character varying DEFAULT NULL::character varying, p_id_concepto bigint DEFAULT NULL::bigint, p_limpiar_concepto boolean DEFAULT false, p_requiere_beneficiario boolean DEFAULT NULL::boolean, p_requiere_responsable boolean DEFAULT NULL::boolean, p_requiere_cliente boolean DEFAULT NULL::boolean, p_requiere_operacion boolean DEFAULT NULL::boolean, p_configuracion jsonb DEFAULT NULL::jsonb, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF NOT EXISTS (SELECT 1 FROM public.tb_compensacion_evento_tipo WHERE id = p_id) THEN
    RAISE EXCEPTION 'El tipo de evento no existe';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento
    WHERE id_tipo_evento = p_id
      AND estado_evento IN ('PENDIENTE', 'APROBADO', 'LIQUIDADO')
  ) THEN
    RAISE EXCEPTION 'No se puede editar un tipo usado por eventos enviados o valorizados';
  END IF;

  IF p_configuracion IS NOT NULL AND jsonb_typeof(p_configuracion) <> 'object' THEN
    RAISE EXCEPTION 'La configuracion debe ser un objeto JSON';
  END IF;

  IF p_id_concepto IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_concepto WHERE id = p_id_concepto
  ) THEN
    RAISE EXCEPTION 'El concepto seleccionado no existe';
  END IF;

  UPDATE public.tb_compensacion_evento_tipo
  SET codigo = CASE WHEN p_codigo IS NULL THEN codigo ELSE UPPER(TRIM(p_codigo)) END,
      nombre = CASE WHEN p_nombre IS NULL THEN nombre ELSE TRIM(p_nombre) END,
      categoria = CASE WHEN p_categoria IS NULL THEN categoria ELSE UPPER(TRIM(p_categoria)) END,
      id_concepto = CASE
        WHEN COALESCE(p_limpiar_concepto, false) THEN NULL
        ELSE COALESCE(p_id_concepto, id_concepto)
      END,
      requiere_beneficiario = COALESCE(p_requiere_beneficiario, requiere_beneficiario),
      requiere_responsable = COALESCE(p_requiere_responsable, requiere_responsable),
      requiere_cliente = COALESCE(p_requiere_cliente, requiere_cliente),
      requiere_operacion = COALESCE(p_requiere_operacion, requiere_operacion),
      configuracion = COALESCE(p_configuracion, configuracion),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (SELECT to_jsonb(t) FROM public.tb_compensacion_evento_tipo t WHERE t.id = p_id);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe un tipo de evento con ese codigo';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_excepcion(p_id bigint, p_id_concepto bigint DEFAULT NULL::bigint, p_tipo_calculo character varying DEFAULT NULL::character varying, p_monto numeric DEFAULT NULL::numeric, p_porcentaje numeric DEFAULT NULL::numeric, p_configuracion jsonb DEFAULT NULL::jsonb, p_fecha_inicio date DEFAULT NULL::date, p_fecha_fin date DEFAULT NULL::date, p_limpiar_fecha_fin boolean DEFAULT false, p_motivo text DEFAULT NULL::text, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_actual public.tb_compensacion_excepcion%ROWTYPE;
  v_fecha_inicio date;
  v_fecha_fin date;
  v_tipo_calculo character varying;
  v_monto numeric;
  v_porcentaje numeric;
  v_configuracion jsonb;
BEGIN
  SELECT * INTO v_actual
  FROM public.tb_compensacion_excepcion
  WHERE id = p_id
  FOR UPDATE;

  IF v_actual.id IS NULL THEN
    RAISE EXCEPTION 'La excepcion no existe';
  END IF;

  IF v_actual.estado_aprobacion <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo se puede editar una excepcion pendiente';
  END IF;

  v_fecha_inicio := COALESCE(p_fecha_inicio, v_actual.fecha_inicio);
  v_fecha_fin := CASE
    WHEN COALESCE(p_limpiar_fecha_fin, false) THEN NULL
    ELSE COALESCE(p_fecha_fin, v_actual.fecha_fin)
  END;
  v_tipo_calculo := COALESCE(
    NULLIF(UPPER(TRIM(p_tipo_calculo)), ''),
    v_actual.tipo_calculo
  );
  v_monto := CASE
    WHEN v_tipo_calculo IN ('PORCENTAJE', 'FORMULA') THEN NULL
    ELSE COALESCE(p_monto, v_actual.monto)
  END;
  v_porcentaje := CASE
    WHEN v_tipo_calculo = 'PORCENTAJE' THEN COALESCE(
      p_porcentaje,
      v_actual.porcentaje
    )
    ELSE NULL
  END;
  v_configuracion := COALESCE(p_configuracion, v_actual.configuracion);

  v_contexto := public.f_private_compensacion_validar_colaborador(
    v_actual.id_colaborador,
    'EDITAR',
    v_fecha_inicio
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF v_tipo_calculo NOT IN (
    'FIJO', 'PORCENTAJE', 'POR_MINUTO', 'POR_HORA', 'POR_DIA',
    'POR_UNIDAD', 'FORMULA'
  ) THEN
    RAISE EXCEPTION 'El tipo de calculo de la excepcion no es valido';
  END IF;

  IF v_tipo_calculo IN (
    'FIJO', 'POR_MINUTO', 'POR_HORA', 'POR_DIA', 'POR_UNIDAD'
  ) AND v_monto IS NULL THEN
    RAISE EXCEPTION 'El monto es obligatorio para el tipo de calculo seleccionado';
  END IF;

  IF v_tipo_calculo = 'PORCENTAJE' AND v_porcentaje IS NULL THEN
    RAISE EXCEPTION 'El porcentaje es obligatorio';
  END IF;

  IF v_tipo_calculo = 'FORMULA' AND v_configuracion = '{}'::jsonb THEN
    RAISE EXCEPTION 'La configuracion de la formula es obligatoria';
  END IF;

  IF v_fecha_fin IS NOT NULL AND v_fecha_fin < v_fecha_inicio THEN
    RAISE EXCEPTION 'La fecha fin no puede ser anterior a la fecha de inicio';
  END IF;

  IF p_motivo IS NOT NULL AND NULLIF(TRIM(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo de la excepcion no puede estar vacio';
  END IF;

  IF p_id_concepto IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_concepto
    WHERE id = p_id_concepto
      AND permite_excepcion
  ) THEN
    RAISE EXCEPTION 'El concepto no existe o no permite excepciones';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_compensacion_periodo pe
    WHERE pe.estado_periodo = 'CERRADO'
      AND daterange(pe.fecha_inicio, pe.fecha_fin, '[]')
          && daterange(
            v_fecha_inicio,
            COALESCE(v_fecha_fin, 'infinity'::date),
            '[]'
          )
  ) THEN
    RAISE EXCEPTION 'La excepcion no puede alcanzar un periodo cerrado';
  END IF;

  UPDATE public.tb_compensacion_excepcion
  SET id_concepto = COALESCE(p_id_concepto, id_concepto),
      tipo_calculo = v_tipo_calculo,
      monto = v_monto,
      porcentaje = v_porcentaje,
      configuracion = v_configuracion,
      fecha_inicio = v_fecha_inicio,
      fecha_fin = v_fecha_fin,
      motivo = CASE
        WHEN p_motivo IS NULL THEN motivo
        ELSE TRIM(p_motivo)
      END,
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (
    SELECT to_jsonb(x)
    FROM public.tb_compensacion_excepcion x
    WHERE x.id = p_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_exportacion_anular(p_id_exportacion bigint, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_exportacion public.tb_compensacion_exportacion%ROWTYPE;
  v_contexto jsonb;
  v_id_usuario bigint;
  v_alcance text;
BEGIN
  SELECT * INTO v_exportacion
  FROM public.tb_compensacion_exportacion
  WHERE id = p_id_exportacion
  FOR UPDATE;

  IF v_exportacion.id IS NULL THEN
    RAISE EXCEPTION 'La exportacion no existe';
  END IF;
  IF BTRIM(COALESCE(p_motivo, '')) = '' THEN
    RAISE EXCEPTION 'El motivo de anulacion es obligatorio';
  END IF;

  v_contexto := public.f_private_compensacion_reporte_contexto(
    v_exportacion.id_periodo,
    'EDITAR',
    NULLIF(v_exportacion.filtros ->> 'id_sucursal', '')::bigint,
    NULLIF(v_exportacion.filtros ->> 'id_colaborador', '')::bigint
  );
  v_id_usuario := (v_contexto ->> 'id_usuario')::bigint;
  v_alcance := v_contexto ->> 'alcance';

  IF v_alcance <> 'GLOBAL' AND v_exportacion.id_usuario <> v_id_usuario THEN
    RAISE EXCEPTION 'Solo puede anular sus propias exportaciones';
  END IF;
  IF v_exportacion.estado_exportacion = 'ANULADA' THEN
    RETURN to_jsonb(v_exportacion) || jsonb_build_object('actualizado', false);
  END IF;

  UPDATE public.tb_compensacion_exportacion
  SET estado_exportacion = 'ANULADA',
      id_usuario_anula = v_id_usuario,
      fecha_anulacion = now(),
      motivo_anulacion = BTRIM(p_motivo)
  WHERE id = p_id_exportacion
  RETURNING * INTO v_exportacion;

  RETURN to_jsonb(v_exportacion) || jsonb_build_object('actualizado', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_incidencia(p_id bigint, p_titulo character varying DEFAULT NULL::character varying, p_motivo text DEFAULT NULL::text, p_evidencia jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_estado character varying;
BEGIN
  v_contexto := public.f_private_compensacion_incidencia_validar_alcance(
    p_id, 'EDITAR', true
  );
  SELECT estado_evento INTO v_estado
  FROM public.tb_compensacion_evento WHERE id = p_id;

  IF v_estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se pueden editar incidencias en borrador';
  END IF;

  IF p_motivo IS NOT NULL AND NULLIF(TRIM(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo no puede estar vacio';
  END IF;

  IF p_evidencia IS NOT NULL AND jsonb_typeof(p_evidencia) <> 'array' THEN
    RAISE EXCEPTION 'La evidencia debe ser un arreglo JSON';
  END IF;

  UPDATE public.tb_compensacion_evento
  SET titulo = CASE
        WHEN p_titulo IS NULL THEN titulo
        ELSE COALESCE(NULLIF(TRIM(p_titulo), ''), titulo)
      END,
      descripcion = CASE
        WHEN p_motivo IS NULL THEN descripcion
        ELSE TRIM(p_motivo)
      END,
      evidencia = COALESCE(p_evidencia, evidencia),
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (
    SELECT to_jsonb(ev)
    FROM public.tb_compensacion_evento ev
    WHERE ev.id = p_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_meta_sede(p_id bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_codigo_indicador character varying DEFAULT NULL::character varying, p_periodo date DEFAULT NULL::date, p_valor_meta numeric DEFAULT NULL::numeric, p_unidad character varying DEFAULT NULL::character varying, p_configuracion jsonb DEFAULT NULL::jsonb, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_actual public.tb_compensacion_meta_sede%ROWTYPE;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  SELECT m.* INTO v_actual
  FROM public.tb_compensacion_meta_sede m
  JOIN public.tb_compensacion_plan_version pv ON pv.id = m.id_plan_version
  WHERE m.id = p_id
    AND pv.estado_version = 'BORRADOR'
  FOR UPDATE OF m;

  IF v_actual.id IS NULL THEN
    RAISE EXCEPTION 'La meta no existe o su version ya no es editable';
  END IF;

  IF p_id_sucursal IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tb_sucursal WHERE id = p_id_sucursal) THEN
    RAISE EXCEPTION 'La sucursal seleccionada no existe';
  END IF;

  IF p_codigo_indicador IS NOT NULL
     AND NULLIF(TRIM(p_codigo_indicador), '') IS NULL THEN
    RAISE EXCEPTION 'El codigo del indicador no puede estar vacio';
  END IF;

  IF p_periodo IS NOT NULL
     AND p_periodo <> date_trunc('month', p_periodo)::date THEN
    RAISE EXCEPTION 'El periodo debe ser el primer dia del mes';
  END IF;

  IF p_valor_meta IS NOT NULL AND p_valor_meta < 0 THEN
    RAISE EXCEPTION 'El valor de la meta debe ser mayor o igual a cero';
  END IF;

  -- Protege tanto el mes original como el destino si se mueve la meta.
  PERFORM 1 FROM public.tb_compensacion_periodo
  WHERE periodo IN (v_actual.periodo,COALESCE(p_periodo,v_actual.periodo))
  ORDER BY periodo FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.tb_compensacion_periodo
    WHERE periodo IN (v_actual.periodo,COALESCE(p_periodo,v_actual.periodo))
      AND estado_periodo IN ('APROBADO','CERRADO')) THEN
    RAISE EXCEPTION 'No se pueden cambiar metas de un mes aprobado o cerrado';
  END IF;

  UPDATE public.tb_compensacion_meta_sede
  SET id_sucursal = COALESCE(p_id_sucursal, id_sucursal),
      codigo_indicador = CASE
        WHEN p_codigo_indicador IS NULL THEN codigo_indicador
        ELSE UPPER(TRIM(p_codigo_indicador))
      END,
      periodo = COALESCE(p_periodo, periodo),
      valor_meta = COALESCE(p_valor_meta, valor_meta),
      unidad = CASE
        WHEN p_unidad IS NULL THEN unidad
        ELSE UPPER(TRIM(p_unidad))
      END,
      configuracion = COALESCE(p_configuracion, configuracion),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (
    SELECT to_jsonb(m)
    FROM public.tb_compensacion_meta_sede m
    WHERE m.id = p_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe esa meta para la version, sede, indicador y periodo';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_penalidad_tipo(p_id bigint, p_codigo character varying DEFAULT NULL::character varying, p_nombre character varying DEFAULT NULL::character varying, p_descripcion text DEFAULT NULL::text, p_id_cargo bigint DEFAULT NULL::bigint, p_limpiar_cargo boolean DEFAULT false, p_id_concepto_descuento bigint DEFAULT NULL::bigint, p_id_concepto_bono_reportante bigint DEFAULT NULL::bigint, p_limpiar_bono_reportante boolean DEFAULT false, p_monto_referencia numeric DEFAULT NULL::numeric, p_monto_bono_reportante numeric DEFAULT NULL::numeric, p_requiere_respuesta boolean DEFAULT NULL::boolean, p_configuracion jsonb DEFAULT NULL::jsonb, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_actual public.tb_compensacion_penalidad_tipo%ROWTYPE;
  v_id_concepto_bono bigint;
  v_monto_bono numeric;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  SELECT t.* INTO v_actual
  FROM public.tb_compensacion_penalidad_tipo t
  JOIN public.tb_compensacion_plan_version pv ON pv.id = t.id_plan_version
  WHERE t.id = p_id
    AND pv.estado_version = 'BORRADOR'
  FOR UPDATE OF t;

  IF v_actual.id IS NULL THEN
    RAISE EXCEPTION 'La penalidad no existe o su version ya no es editable';
  END IF;

  IF p_codigo IS NOT NULL AND NULLIF(TRIM(p_codigo), '') IS NULL THEN
    RAISE EXCEPTION 'El codigo no puede estar vacio';
  END IF;

  IF p_nombre IS NOT NULL AND NULLIF(TRIM(p_nombre), '') IS NULL THEN
    RAISE EXCEPTION 'El nombre no puede estar vacio';
  END IF;

  IF p_id_cargo IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tb_compensacion_cargo WHERE id = p_id_cargo) THEN
    RAISE EXCEPTION 'El cargo seleccionado no existe';
  END IF;

  IF p_id_concepto_descuento IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_concepto
    WHERE id = p_id_concepto_descuento
      AND naturaleza = 'DESCUENTO'
  ) THEN
    RAISE EXCEPTION 'El concepto de penalidad debe tener naturaleza DESCUENTO';
  END IF;

  IF p_id_concepto_bono_reportante IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_concepto
    WHERE id = p_id_concepto_bono_reportante
      AND naturaleza = 'INGRESO'
  ) THEN
    RAISE EXCEPTION 'El concepto de bono del reportante debe tener naturaleza INGRESO';
  END IF;

  IF p_monto_referencia IS NOT NULL AND p_monto_referencia < 0 THEN
    RAISE EXCEPTION 'El monto de referencia debe ser mayor o igual a cero';
  END IF;

  IF p_monto_bono_reportante IS NOT NULL AND p_monto_bono_reportante < 0 THEN
    RAISE EXCEPTION 'El bono del reportante no puede ser negativo';
  END IF;

  v_id_concepto_bono := CASE
    WHEN COALESCE(p_limpiar_bono_reportante, false) THEN NULL
    ELSE COALESCE(
      p_id_concepto_bono_reportante,
      v_actual.id_concepto_bono_reportante
    )
  END;
  v_monto_bono := CASE
    WHEN COALESCE(p_limpiar_bono_reportante, false) THEN NULL
    ELSE COALESCE(p_monto_bono_reportante, v_actual.monto_bono_reportante)
  END;

  IF (v_monto_bono IS NULL) <> (v_id_concepto_bono IS NULL) THEN
    RAISE EXCEPTION 'El concepto y el monto del bono del reportante deben informarse juntos';
  END IF;

  UPDATE public.tb_compensacion_penalidad_tipo
  SET codigo = CASE
        WHEN p_codigo IS NULL THEN codigo
        ELSE UPPER(TRIM(p_codigo))
      END,
      nombre = CASE WHEN p_nombre IS NULL THEN nombre ELSE TRIM(p_nombre) END,
      descripcion = CASE
        WHEN p_descripcion IS NULL THEN descripcion
        ELSE NULLIF(TRIM(p_descripcion), '')
      END,
      id_cargo = CASE
        WHEN COALESCE(p_limpiar_cargo, false) THEN NULL
        ELSE COALESCE(p_id_cargo, id_cargo)
      END,
      id_concepto_descuento = COALESCE(
        p_id_concepto_descuento,
        id_concepto_descuento
      ),
      id_concepto_bono_reportante = v_id_concepto_bono,
      monto_referencia = COALESCE(p_monto_referencia, monto_referencia),
      monto_bono_reportante = v_monto_bono,
      requiere_respuesta = COALESCE(p_requiere_respuesta, requiere_respuesta),
      configuracion = COALESCE(p_configuracion, configuracion),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (
    SELECT to_jsonb(t)
    FROM public.tb_compensacion_penalidad_tipo t
    WHERE t.id = p_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe una penalidad con ese codigo en la version';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_periodo(p_id bigint, p_nombre character varying DEFAULT NULL::character varying, p_zona_horaria character varying DEFAULT NULL::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_zona_horaria character varying;
BEGIN
  v_contexto := public.f_private_compensacion_validar_periodo(
    p_id,
    'CONFIGURACION',
    'EDITAR',
    ARRAY['ABIERTO']::character varying[],
    true,
    true
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF p_nombre IS NOT NULL AND NULLIF(TRIM(p_nombre), '') IS NULL THEN
    RAISE EXCEPTION 'El nombre del periodo no puede estar vacio';
  END IF;

  v_zona_horaria := NULLIF(TRIM(p_zona_horaria), '');

  IF p_zona_horaria IS NOT NULL AND v_zona_horaria IS NULL THEN
    RAISE EXCEPTION 'La zona horaria no puede estar vacia';
  END IF;

  IF v_zona_horaria IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_timezone_names
    WHERE name = v_zona_horaria
  ) THEN
    RAISE EXCEPTION 'La zona horaria indicada no existe: %', v_zona_horaria;
  END IF;

  IF EXISTS ( SELECT 1 FROM public.tb_compensacion_reporte_mes WHERE id_periodo = p_id AND estado = 'CONFIRMADO' ) THEN
    RAISE EXCEPTION 'No se puede editar un periodo con reporte confirmado';
  END IF;

  UPDATE public.tb_compensacion_periodo
  SET nombre = CASE
        WHEN p_nombre IS NULL THEN nombre
        ELSE TRIM(p_nombre)
      END,
      zona_horaria = COALESCE(v_zona_horaria, zona_horaria),
      id_usuario_actualiza = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (
    SELECT to_jsonb(pe)
    FROM public.tb_compensacion_periodo pe
    WHERE pe.id = p_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_plan(p_id bigint, p_codigo character varying DEFAULT NULL::character varying, p_nombre character varying DEFAULT NULL::character varying, p_descripcion text DEFAULT NULL::text, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF NOT EXISTS (SELECT 1 FROM public.tb_compensacion_plan WHERE id = p_id) THEN
    RAISE EXCEPTION 'El plan no existe';
  END IF;

  UPDATE public.tb_compensacion_plan
  SET codigo = CASE
        WHEN p_codigo IS NULL THEN codigo
        ELSE UPPER(TRIM(p_codigo))
      END,
      nombre = CASE
        WHEN p_nombre IS NULL THEN nombre
        ELSE TRIM(p_nombre)
      END,
      descripcion = CASE
        WHEN p_descripcion IS NULL THEN descripcion
        ELSE NULLIF(TRIM(p_descripcion), '')
      END,
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (
    SELECT to_jsonb(p)
    FROM public.tb_compensacion_plan p
    WHERE p.id = p_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe un plan con ese codigo';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_plan_version(p_id bigint, p_nombre character varying DEFAULT NULL::character varying, p_fecha_inicio date DEFAULT NULL::date, p_fecha_fin date DEFAULT NULL::date, p_limpiar_fecha_fin boolean DEFAULT false, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_actual public.tb_compensacion_plan_version%ROWTYPE;
  v_fecha_inicio date;
  v_fecha_fin date;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  SELECT * INTO v_actual
  FROM public.tb_compensacion_plan_version
  WHERE id = p_id
  FOR UPDATE;

  IF v_actual.id IS NULL THEN
    RAISE EXCEPTION 'La version del plan no existe';
  END IF;

  IF v_actual.estado_version <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se puede editar una version en borrador';
  END IF;

  v_fecha_inicio := COALESCE(p_fecha_inicio, v_actual.fecha_inicio);
  v_fecha_fin := CASE
    WHEN COALESCE(p_limpiar_fecha_fin, false) THEN NULL
    ELSE COALESCE(p_fecha_fin, v_actual.fecha_fin)
  END;

  IF v_fecha_fin IS NOT NULL AND v_fecha_fin < v_fecha_inicio THEN
    RAISE EXCEPTION 'La fecha fin no puede ser anterior a la fecha de inicio';
  END IF;

  UPDATE public.tb_compensacion_plan_version
  SET nombre = CASE
        WHEN p_nombre IS NULL THEN nombre
        ELSE NULLIF(TRIM(p_nombre), '')
      END,
      fecha_inicio = v_fecha_inicio,
      fecha_fin = v_fecha_fin,
      observacion = CASE
        WHEN p_observacion IS NULL THEN observacion
        ELSE NULLIF(TRIM(p_observacion), '')
      END,
      id_usuario = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (
    SELECT to_jsonb(pv)
    FROM public.tb_compensacion_plan_version pv
    WHERE pv.id = p_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_regla(p_id bigint, p_id_concepto bigint DEFAULT NULL::bigint, p_id_cargo bigint DEFAULT NULL::bigint, p_limpiar_cargo boolean DEFAULT false, p_id_sucursal bigint DEFAULT NULL::bigint, p_limpiar_sucursal boolean DEFAULT false, p_tipo_calculo character varying DEFAULT NULL::character varying, p_monto numeric DEFAULT NULL::numeric, p_porcentaje numeric DEFAULT NULL::numeric, p_valor_minimo numeric DEFAULT NULL::numeric, p_valor_maximo numeric DEFAULT NULL::numeric, p_tope_importe numeric DEFAULT NULL::numeric, p_prioridad integer DEFAULT NULL::integer, p_configuracion jsonb DEFAULT NULL::jsonb, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_actual public.tb_compensacion_regla%ROWTYPE;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  SELECT r.* INTO v_actual
  FROM public.tb_compensacion_regla r
  JOIN public.tb_compensacion_plan_version pv ON pv.id = r.id_plan_version
  WHERE r.id = p_id
    AND pv.estado_version = 'BORRADOR'
  FOR UPDATE OF r;

  IF v_actual.id IS NULL THEN
    RAISE EXCEPTION 'La regla no existe o su version ya no es editable';
  END IF;

  IF p_id_concepto IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tb_compensacion_concepto WHERE id = p_id_concepto) THEN
    RAISE EXCEPTION 'El concepto seleccionado no existe';
  END IF;

  IF p_id_cargo IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tb_compensacion_cargo WHERE id = p_id_cargo) THEN
    RAISE EXCEPTION 'El cargo seleccionado no existe';
  END IF;

  IF p_id_sucursal IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tb_sucursal WHERE id = p_id_sucursal) THEN
    RAISE EXCEPTION 'La sucursal seleccionada no existe';
  END IF;

  IF NULLIF(
       COALESCE(p_configuracion, v_actual.configuracion) ->> 'fuente_operacion',
       ''
     ) IS NOT NULL
     AND COALESCE(p_configuracion, v_actual.configuracion) ->> 'fuente_operacion' NOT IN (
       'OPERACION_PAGADA_GESTOR',
       'CLIENTE_NUEVO_EFECTIVIZADO_7_DIAS'
     ) THEN
    RAISE EXCEPTION 'La fuente operativa de la regla no es valida';
  END IF;

  IF NULLIF(
       COALESCE(p_configuracion, v_actual.configuracion) ->> 'fuente_operacion',
       ''
     ) IS NOT NULL
     AND COALESCE(
       NULLIF(UPPER(TRIM(p_tipo_calculo)), ''),
       v_actual.tipo_calculo
     ) NOT IN ('FIJO', 'POR_UNIDAD', 'PORCENTAJE') THEN
    RAISE EXCEPTION 'Una regla operativa solo admite calculo FIJO, POR_UNIDAD o PORCENTAJE';
  END IF;

  IF NULLIF(
       COALESCE(p_configuracion, v_actual.configuracion) ->> 'fuente_operacion',
       ''
     ) IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.tb_compensacion_concepto c
       WHERE c.id = COALESCE(p_id_concepto, v_actual.id_concepto)
         AND c.categoria IN ('BONO', 'COMISION')
         AND c.naturaleza = 'INGRESO'
     ) THEN
    RAISE EXCEPTION 'Una regla operativa requiere un concepto de bono o comision de ingreso';
  END IF;

  PERFORM public.f_private_compensacion_validar_configuracion_asistencia(
    COALESCE(p_configuracion, v_actual.configuracion)
  );

  UPDATE public.tb_compensacion_regla
  SET id_concepto = COALESCE(p_id_concepto, id_concepto),
      id_cargo = CASE
        WHEN COALESCE(p_limpiar_cargo, false) THEN NULL
        ELSE COALESCE(p_id_cargo, id_cargo)
      END,
      id_sucursal = CASE
        WHEN COALESCE(p_limpiar_sucursal, false) THEN NULL
        ELSE COALESCE(p_id_sucursal, id_sucursal)
      END,
      tipo_calculo = COALESCE(
        NULLIF(UPPER(TRIM(p_tipo_calculo)), ''),
        tipo_calculo
      ),
      monto = CASE
        WHEN COALESCE(
          NULLIF(UPPER(TRIM(p_tipo_calculo)), ''),
          tipo_calculo
        ) IN ('PORCENTAJE', 'FORMULA') THEN NULL
        ELSE COALESCE(p_monto, monto)
      END,
      porcentaje = CASE
        WHEN COALESCE(
          NULLIF(UPPER(TRIM(p_tipo_calculo)), ''),
          tipo_calculo
        ) = 'PORCENTAJE' THEN COALESCE(p_porcentaje, porcentaje)
        ELSE NULL
      END,
      valor_minimo = COALESCE(p_valor_minimo, valor_minimo),
      valor_maximo = COALESCE(p_valor_maximo, valor_maximo),
      tope_importe = COALESCE(p_tope_importe, tope_importe),
      prioridad = COALESCE(p_prioridad, prioridad),
      configuracion = COALESCE(p_configuracion, configuracion),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (
    SELECT to_jsonb(r)
    FROM public.tb_compensacion_regla r
    WHERE r.id = p_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe una regla para esa version, concepto, cargo, sede y prioridad';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_administracion_revision(p_id bigint, p_version text, p_accion text, p_motivo text, p_base numeric DEFAULT NULL::numeric, p_cantidad numeric DEFAULT NULL::numeric, p_chats_revisados boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE antes jsonb; actual jsonb; v_periodo date; tipo text; accion text:=upper(btrim(p_accion));
BEGIN
 antes:=public.f_private_compensacion_administracion_revision(p_id);
 SELECT periodo_imputacion INTO v_periodo FROM public.tb_compensacion_evento WHERE id=p_id;
 PERFORM id FROM public.tb_compensacion_periodo WHERE periodo=v_periodo ORDER BY id FOR UPDATE;
 PERFORM id FROM public.tb_compensacion_evento WHERE id=p_id FOR UPDATE;
 -- Mantener estable la fuente operativa mientras se registra la decision.
 PERFORM r.id FROM public.tb_compensacion_evento_referencia r WHERE r.id_evento=p_id ORDER BY r.id FOR SHARE;
 PERFORM o.id FROM public.tb_operacion_proceso o WHERE coalesce(o.id_operacion_padre,o.id) IN(
  SELECT coalesce(s.id_operacion_padre,s.id) FROM public.tb_compensacion_evento_referencia r JOIN public.tb_operacion_proceso s ON s.id=r.id_operacion WHERE r.id_evento=p_id)
 ORDER BY o.id FOR SHARE;
 PERFORM c.id FROM public.tb_operacion_caja c WHERE c.id_operacion_proceso IN(
  SELECT coalesce(s.id_operacion_padre,s.id) FROM public.tb_compensacion_evento_referencia r JOIN public.tb_operacion_proceso s ON s.id=r.id_operacion WHERE r.id_evento=p_id)
 ORDER BY c.id FOR SHARE;
 actual:=public.f_private_compensacion_administracion_revision(p_id);
 IF p_version IS NULL OR actual->>'version' IS DISTINCT FROM p_version OR actual->>'version' IS DISTINCT FROM antes->>'version' THEN RAISE EXCEPTION 'El expediente o su operacion cambiaron; actualiza el detalle antes de decidir'; END IF;
 IF (accion='APROBADO' AND NOT(actual->>'puede_aprobar')::boolean) OR
  (accion='RECHAZADO' AND NOT(actual->>'puede_revisar')::boolean) OR
  (accion='OBSERVADO' AND NOT(actual->>'puede_observar')::boolean) OR
  (accion='ANULADO' AND NOT(actual->>'puede_anular')::boolean) THEN
  RAISE EXCEPTION '%',coalesce(nullif(actual->>'motivo',''),'El expediente no admite esta decision'); END IF;
 SELECT t.codigo INTO tipo FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento WHERE e.id=p_id;
 -- Solo las decisiones de las rutas del plan 74 admiten nota humana opcional.
 IF NOT (accion IN('APROBADO','RECHAZADO') AND EXISTS(
  SELECT 1 FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
  WHERE e.id=p_id AND (t.categoria IN('LLAMADA','CALIFICACION','REFERIDO','TARJETA_TERCERO')
   OR t.codigo IN('TIKTOK_LIVE','PROPUESTA_INNOVACION'))))
  AND length(btrim(coalesce(p_motivo,'')))<10 THEN
  RAISE EXCEPTION 'Explica el motivo de la decision (minimo diez caracteres)'; END IF;
 IF accion='APROBADO' AND actual->>'estado'<>'PENDIENTE' THEN RAISE EXCEPTION 'La propuesta ya fue aprobada; comprueba su implementacion por el flujo especifico'; END IF;
 IF accion='APROBADO' AND tipo='META_SEDE_SAFETYPAY' THEN RETURN public.f_post_compensacion_meta_jefatura_resolver(p_id,p_motivo,NULL,NULL,p_chats_revisados); END IF;
 IF accion IN('APROBADO','RECHAZADO') THEN RETURN public.f_post_tb_compensacion_evento_resolver(p_id,accion::varchar,p_motivo,p_base,p_cantidad); END IF;
 IF accion='OBSERVADO' THEN RETURN public.f_post_tb_compensacion_evento_observar(p_id,p_motivo); END IF;
 IF accion='ANULADO' THEN RETURN public.f_post_tb_compensacion_evento_anular(p_id,p_motivo); END IF;
 RAISE EXCEPTION 'Decision no valida';
END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_atc_innovacion_registrar(p_fecha date, p_titulo text, p_descripcion text, p_clave uuid, p_enviar boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; actor bigint; colaborador bigint; tipo bigint; clave text;
  evento public.tb_compensacion_evento%ROWTYPE; resultado jsonb; fecha timestamptz;
BEGIN
  ctx:=public.f_private_compensacion_contexto('BONO:PROPUESTA_INNOVACION','REGISTRAR');
  actor:=(ctx->>'id_usuario')::bigint; colaborador:=(ctx->>'id_colaborador')::bigint;
  IF colaborador IS NULL OR coalesce((ctx->>'es_super_admin')::boolean,false)
    OR NOT EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=actor AND id_rol IN(2,3,4,5,6) AND auth_user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Esta captura corresponde al colaborador ATC, Jefatura o Facturacion autenticado';
  END IF;
  IF p_clave IS NULL OR p_enviar IS NULL THEN RAISE EXCEPTION 'Falta la clave de registro o la acción'; END IF;
  IF p_fecha IS NULL OR p_fecha>(now() AT TIME ZONE 'America/Lima')::date THEN
    RAISE EXCEPTION 'Ingresa una fecha válida, no futura'; END IF;
  IF coalesce(length(btrim(p_titulo)),0) NOT BETWEEN 1 AND 250
    OR coalesce(length(btrim(p_descripcion)),0) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Título (hasta 250) y descripción (hasta 2000) son obligatorios'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=actor AND id_rol=3)
    AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion a
      JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='JEFE_TIENDA'
      JOIN public.tb_estado e ON e.id=a.id_estado AND upper(btrim(e.nombre))='ACTIVO'
      WHERE a.id_colaborador=colaborador AND a.fecha_inicio<=p_fecha AND (a.fecha_fin IS NULL OR a.fecha_fin>=p_fecha)) THEN
    RAISE EXCEPTION 'No tienes asignación de Jefatura para la fecha de la propuesta'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=actor AND id_rol=5) AND NOT EXISTS(
    SELECT 1 FROM public.tb_compensacion_asignacion a
    JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='FACTURACION'
    JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
    WHERE a.id_colaborador=colaborador AND p_fecha BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)
      AND (now() AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)) THEN
    RAISE EXCEPTION 'Requiere cargo FACTURACION vigente en la fecha de la propuesta y al registrar'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=actor AND id_rol=2) AND NOT EXISTS(
    SELECT 1 FROM public.tb_compensacion_asignacion a JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo
    JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
    WHERE a.id_colaborador=colaborador AND ca.codigo IN('JEFE_SUPERIOR_PAGOS','OPERADOR_ALTA_DEMANDA','ENCARGADO_CARTERA_MEDIA','ASISTENTE_VIRTUAL_PAGOS')
    AND p_fecha BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)) THEN
    RAISE EXCEPTION 'Requiere cargo de Pagos vigente en la fecha de la propuesta'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=actor AND id_rol=6) AND NOT EXISTS(
    SELECT 1 FROM public.tb_compensacion_asignacion a JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='DISENO_MARKETING'
    JOIN public.tb_estado es ON es.id=a.id_estado AND upper(btrim(es.nombre))='ACTIVO' WHERE a.id_colaborador=colaborador AND p_fecha BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)) THEN
    RAISE EXCEPTION 'Requiere cargo de Marketing para la fecha'; END IF;
  SELECT t.id INTO STRICT tipo FROM public.tb_compensacion_evento_tipo t
    JOIN public.tb_estado e ON e.id=t.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE t.codigo='PROPUESTA_INNOVACION';
  clave:='INNOVACION_ATC:'||actor||':'||p_clave;
  PERFORM pg_advisory_xact_lock(hashtextextended(clave,0));
  SELECT * INTO evento FROM public.tb_compensacion_evento
    WHERE fuente='MANUAL' AND clave_origen=clave FOR UPDATE;
  IF FOUND THEN
    IF evento.id_usuario_registra IS DISTINCT FROM actor OR evento.id_colaborador_beneficiario IS DISTINCT FROM colaborador
      OR evento.id_tipo_evento IS DISTINCT FROM tipo OR evento.titulo IS DISTINCT FROM btrim(p_titulo)
      OR evento.descripcion IS DISTINCT FROM btrim(p_descripcion)
      OR (evento.fecha_evento AT TIME ZONE 'America/Lima')::date IS DISTINCT FROM p_fecha THEN
      RAISE EXCEPTION 'La clave de registro corresponde a otra propuesta'; END IF;
    IF evento.estado_evento NOT IN('BORRADOR','PENDIENTE') THEN
      RAISE EXCEPTION 'La propuesta ya fue resuelta; actualiza el listado'; END IF;
  ELSE
    fecha:=(p_fecha+(clock_timestamp() AT TIME ZONE 'America/Lima')::time) AT TIME ZONE 'America/Lima';
    resultado:=public.f_post_tb_compensacion_evento(
      p_id_tipo_evento=>tipo,p_fecha_evento=>fecha,p_id_colaborador_beneficiario=>colaborador,
      p_clave_origen=>clave::varchar,p_titulo=>btrim(p_titulo)::varchar,p_descripcion=>btrim(p_descripcion));
    SELECT * INTO STRICT evento FROM public.tb_compensacion_evento WHERE id=(resultado->>'id')::bigint;
  END IF;
  IF p_enviar AND evento.estado_evento='BORRADOR' THEN
    PERFORM public.f_post_tb_compensacion_evento_enviar(evento.id);
    SELECT * INTO STRICT evento FROM public.tb_compensacion_evento WHERE id=evento.id;
  END IF;
  RETURN jsonb_build_object('id',evento.id,'estado_evento',evento.estado_evento);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_atc_safetypay_codigo(p_codigo text, p_documento text, p_tipo_documento bigint, p_monto numeric, p_id_comunidad bigint, p_fecha_deposito date, p_codigo_cliente text, p_tarjeta text, p_banco text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE config jsonb; comunidad jsonb; usuario bigint; fecha timestamptz; nuevo public.tb_compensacion_safetypay_registro%ROWTYPE;
BEGIN
  usuario:=public.f_private_compensacion_safetypay_usuario();
  config:=public.f_private_compensacion_safetypay_registro_configuracion();
  IF nullif(btrim(p_codigo),'') IS NULL OR length(btrim(p_codigo))>100 THEN RAISE EXCEPTION 'Ingresa el codigo de operacion de hasta 100 caracteres'; END IF;
  IF p_tipo_documento IS NULL OR p_tipo_documento NOT IN(1,2) OR p_documento IS NULL
    OR (p_tipo_documento=1 AND p_documento !~ '^[0-9]{8}$') OR (p_tipo_documento=2 AND p_documento !~ '^[0-9]{9}$') THEN RAISE EXCEPTION 'Documento invalido'; END IF;
  IF p_monto IS NULL OR p_monto::text IN('NaN','Infinity','-Infinity') OR p_monto<=0 OR p_monto>=100000 OR round(p_monto,2)<>p_monto THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero y menor a S/ 100,000.00, con hasta dos decimales'; END IF;
  IF p_codigo_cliente IS NULL OR p_codigo_cliente !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'El codigo cliente requiere 6 digitos'; END IF;
  IF p_tarjeta IS NULL OR p_tarjeta !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'La tarjeta requiere sus ultimos 4 digitos'; END IF;
  IF p_banco IS NULL OR p_banco NOT IN('CMR','IBK','IO') THEN RAISE EXCEPTION 'Banco SafetyPay no valido'; END IF;
  IF p_fecha_deposito IS NULL THEN RAISE EXCEPTION 'La fecha de deposito es obligatoria'; END IF;
  SELECT x INTO comunidad FROM jsonb_array_elements(config->'comunidades') x WHERE (x->>'id')::bigint=p_id_comunidad;
  IF comunidad IS NULL THEN RAISE EXCEPTION 'Comunidad no disponible para SafetyPay'; END IF;
  fecha:=(p_fecha_deposito+(now() AT TIME ZONE 'America/Lima')::time) AT TIME ZONE 'America/Lima';
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|','safetypay',p_banco,p_codigo_cliente,round(p_monto,2)::text),0));
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_safetypay_registro x WHERE x.banco=p_banco AND x.codigo_cliente=p_codigo_cliente
      AND x.monto=round(p_monto,2) AND (x.fecha_deposito AT TIME ZONE 'America/Lima')::date BETWEEN p_fecha_deposito-7 AND p_fecha_deposito+7)
    THEN RAISE EXCEPTION 'Registro duplicado por codigo cliente, banco, monto y fecha de deposito'; END IF;
  INSERT INTO public.tb_compensacion_safetypay_registro(id_usuario,codigo_operacion,tipo_documento,documento,monto,id_comunidad,nombre_comunidad,
    fecha_deposito,codigo_cliente,tarjeta,banco)
  VALUES(usuario,btrim(p_codigo),p_tipo_documento,p_documento,round(p_monto,2),p_id_comunidad,comunidad->>'nombre',fecha,p_codigo_cliente,p_tarjeta,p_banco)
  RETURNING * INTO nuevo;
  PERFORM public.f_private_compensacion_safetypay_conciliar(nuevo.id);
  SELECT * INTO nuevo FROM public.tb_compensacion_safetypay_registro WHERE id=nuevo.id;
  RETURN jsonb_build_object('id',nuevo.id,'estado',nuevo.estado);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_atc_sustento(p_id bigint, p_evidencia text, p_codigo_operacion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; ev public.tb_compensacion_evento%ROWTYPE;
  categoria text; op bigint; total integer; prueba jsonb;
BEGIN
  ctx:=public.f_private_compensacion_evento_validar_alcance(p_id,'CONSULTAR',true);
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id FOR UPDATE;
  SELECT t.categoria INTO categoria FROM public.tb_compensacion_evento_tipo t WHERE t.id=ev.id_tipo_evento;
  IF categoria NOT IN('LLAMADA','TARJETA_TERCERO') OR categoria IS NULL THEN
    RAISE EXCEPTION 'Este registro no admite sustento de contacto o tarjeta'; END IF;
  IF ev.id_usuario_registra IS DISTINCT FROM (ctx->>'id_usuario')::bigint THEN
    RAISE EXCEPTION 'Solo el autor puede completar el sustento'; END IF;
  IF ev.estado_evento NOT IN('BORRADOR','PENDIENTE') THEN
    RAISE EXCEPTION 'Solo puedes completar registros pendientes o en borrador'; END IF;
  PERFORM 1 FROM public.tb_compensacion_periodo
    WHERE periodo=ev.periodo_imputacion AND estado_periodo='ABIERTO' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El periodo no esta abierto'; END IF;
  IF nullif(btrim(p_evidencia),'') IS NOT NULL AND (btrim(p_evidencia) !~ '^https://[^[:space:]]+$'
    OR length(btrim(p_evidencia))>2000) THEN
    RAISE EXCEPTION 'Ingresa un enlace HTTPS de evidencia (hasta 2000 caracteres)'; END IF;
  IF nullif(btrim(p_codigo_operacion),'') IS NOT NULL THEN
    IF length(btrim(p_codigo_operacion))>100 THEN RAISE EXCEPTION 'Codigo demasiado largo'; END IF;
    -- DNI y codigo exactos, sin exigir pago ni exponer catalogos generales.
    -- "ID:<id>" identifica una operacion sin codigo (Pago de deuda o Efectivizacion pendiente de codigo); otro valor es el codigo.
    SELECT count(*),min(o.id) INTO total,op FROM public.tb_operacion_proceso o
    WHERE o.id_operacion_padre IS NULL
      AND CASE WHEN btrim(p_codigo_operacion) ~ '^ID:[0-9]+$'
            THEN o.id=substr(btrim(p_codigo_operacion),4)::bigint
              AND (upper(btrim(coalesce(o.tipo_servicio,'')))='EFECTIVIZACION'
                OR o.id_codigo_servicio=(SELECT cs.id FROM public.tb_codigo_servicio cs WHERE upper(coalesce(cs.nombre,'')) LIKE '%PAGO%DEUDA%' ORDER BY cs.id LIMIT 1))
            ELSE btrim(o.codigo_operacion_deposito_cliente)=btrim(p_codigo_operacion) END
      AND btrim(o.dni_cliente)=ev.datos->>'cliente_documento'
      AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada x WHERE x.id_operacion_proceso=o.id);
    IF total<>1 THEN RAISE EXCEPTION 'Operacion inexistente o ambigua para este DNI; verifica el codigo'; END IF;
  END IF;
  prueba:=jsonb_build_object('tipo','SUSTENTO_ATC','url',btrim(p_evidencia),
    'codigo_operacion',nullif(btrim(p_codigo_operacion),''),'id_usuario',(ctx->>'id_usuario')::bigint);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(ev.evidencia) e WHERE e->>'tipo'='SUSTENTO_ATC') THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(ev.evidencia) e
      WHERE e->>'tipo'='SUSTENTO_ATC' AND e IS DISTINCT FROM prueba) THEN
      RAISE EXCEPTION 'El registro ya tiene otro sustento; requiere revision'; END IF;
    RETURN jsonb_build_object('id',ev.id,'estado_evento',ev.estado_evento);
  END IF;
  IF op IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia r
      WHERE r.id_evento=ev.id AND r.tipo_referencia='OPERACION' AND r.id_operacion IS DISTINCT FROM op) THEN
      RAISE EXCEPTION 'Ya existe otra operacion vinculada'; END IF;
    INSERT INTO public.tb_compensacion_evento_referencia(id_evento,tipo_referencia,id_operacion,datos_snapshot,id_usuario)
      SELECT ev.id,'OPERACION',op,jsonb_build_object('codigo',btrim(p_codigo_operacion)),(ctx->>'id_usuario')::bigint
      WHERE NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia r
        WHERE r.id_evento=ev.id AND r.tipo_referencia='OPERACION' AND r.id_operacion=op);
  END IF;
  UPDATE public.tb_compensacion_evento SET evidencia=evidencia||CASE WHEN nullif(btrim(p_evidencia),'') IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(prueba) END,
    fecha_actualizacion=clock_timestamp() WHERE id=ev.id;
  RETURN jsonb_build_object('id',ev.id,'estado_evento',ev.estado_evento);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_atencion(p_id_operacion bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE ctx jsonb; d jsonb; r bigint; a public.tb_compensacion_atencion%ROWTYPE;
BEGIN
  ctx:=public.f_private_compensacion_atencion_contexto();
  SELECT coalesce(id_operacion_padre,id) INTO r FROM public.tb_operacion_proceso WHERE id=p_id_operacion;
  IF NOT coalesce((ctx->>'puede_registrar')::boolean,false) THEN RAISE EXCEPTION 'El registro corresponde al asesor; administracion puede consultar y liberar'; END IF;
  IF r IS NULL THEN RAISE EXCEPTION 'Operacion no disponible'; END IF;
  PERFORM 1 FROM public.tb_operacion_proceso WHERE id=r FOR UPDATE;
  d:=public.f_private_compensacion_atencion_operacion(r);
  PERFORM 1 FROM public.tb_operacion_proceso WHERE id=(d->>'id')::bigint FOR UPDATE;
  d:=public.f_private_compensacion_atencion_operacion(r);
  -- El usuario operativo no identifica al asesor de Pancake. La vinculacion manual
  -- pertenece al asesor autenticado y mantiene una sola atencion vigente por raiz.
  IF NOT coalesce((d->>'pagada')::boolean,false) THEN
    RAISE EXCEPTION 'La operacion debe estar pagada y disponible';
  END IF;
  IF d->>'fecha' IS NULL THEN
    RAISE EXCEPTION 'La operacion no tiene fecha_deposito_cliente; solicita corregir el archivo de origen';
  END IF;
  SELECT * INTO a FROM public.tb_compensacion_atencion WHERE id_operacion_raiz=r AND estado='VIGENTE';
  IF a.id IS NOT NULL THEN
    IF a.id_usuario_asesor=(ctx->>'id_usuario')::bigint THEN RETURN to_jsonb(a); END IF;
    RAISE EXCEPTION 'La operacion ya tiene una atencion vigente';
  END IF;
  INSERT INTO public.tb_compensacion_atencion(id_operacion_raiz,id_operacion_pagada,id_usuario_asesor,fecha_atencion,operacion_snapshot)
    VALUES(r,(d->>'id')::bigint,(ctx->>'id_usuario')::bigint,(d->>'fecha')::timestamptz,d) RETURNING * INTO a;
  RETURN to_jsonb(a);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_atencion_trazable(p_id_operacion bigint, p_pancake text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE resultado jsonb;
BEGIN
  IF nullif(btrim(p_pancake),'') IS NULL OR length(btrim(p_pancake))>250 OR btrim(p_pancake) !~ '^https://[^[:space:]]+$'
    THEN RAISE EXCEPTION 'Ingresa el enlace HTTPS de la conversacion de Pancake'; END IF;
  resultado:=public.f_post_compensacion_atencion(p_id_operacion);
  IF resultado#>>'{operacion_snapshot,pancake}' IS NOT NULL AND resultado#>>'{operacion_snapshot,pancake}' IS DISTINCT FROM btrim(p_pancake)
    THEN RAISE EXCEPTION 'La atencion ya tiene otra conversacion vinculada'; END IF;
  UPDATE public.tb_compensacion_atencion SET operacion_snapshot=operacion_snapshot||jsonb_build_object('pancake',btrim(p_pancake))
    WHERE id=(resultado->>'id')::bigint;
  RETURN (SELECT to_jsonb(a) FROM public.tb_compensacion_atencion a WHERE a.id=(resultado->>'id')::bigint);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_auditoria_revision(p_id bigint, p_version timestamp with time zone, p_decision character varying, p_comentario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE e public.tb_compensacion_evento%ROWTYPE;
BEGIN
 PERFORM public.f_private_compensacion_facturacion_auditoria_contexto('APROBAR');
 e:=public.f_private_compensacion_facturacion_auditoria_bloquear(p_id);
 IF p_version IS NULL OR e.fecha_actualizacion IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'El reporte cambio; actualiza antes de decidir'; END IF;
 RETURN public.f_post_compensacion_facturacion_auditoria_resolver(p_id,p_decision,p_comentario);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_calificacion_enlace(p_id_colaborador bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE ctx jsonb; token text;
BEGIN
  ctx := public.f_private_compensacion_contexto('CALIFICACIONES','REGISTRAR');
  -- Bloqueo por persona: dos generaciones concurrentes no dejan dos enlaces activos.
  PERFORM 1 FROM public.tb_compensacion_colaborador WHERE id=p_id_colaborador FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.f_get_compensacion_calificacion_asesores()) a
    WHERE (a->>'id')::bigint=p_id_colaborador) THEN
    RAISE EXCEPTION 'Colaborador no disponible en su alcance';
  END IF;
  -- No distribuir un QR que promete registrar sin configuración de compensación.
  PERFORM public.f_private_compensacion_evento_tarifa_registro(
    (SELECT id FROM public.tb_compensacion_evento_tipo WHERE codigo='CALIFICACION_PRESENCIAL'),p_id_colaborador,now());
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
  UPDATE public.tb_compensacion_calificacion_enlace SET fecha_revocacion=now()
    WHERE id_colaborador=p_id_colaborador AND fecha_revocacion IS NULL;
  INSERT INTO public.tb_compensacion_calificacion_enlace(id_colaborador,token_hash,token_value,id_usuario_genera)
    VALUES(p_id_colaborador,sha256(convert_to(token,'UTF8')),token,(ctx->>'id_usuario')::bigint);
  RETURN jsonb_build_object('token',token);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_calificacion_operaciones(p_id_evento bigint, p_ids bigint[], p_pancake text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE ctx jsonb; ev public.tb_compensacion_evento%ROWTYPE; listado jsonb; d jsonb; ids bigint[]; anteriores bigint[]; snapshots jsonb:='[]'; operacion bigint; dni text; enlace text;
BEGIN
  ctx:=public.f_private_compensacion_evento_validar_alcance(p_id_evento,'CONSULTAR',true);
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id_evento FOR UPDATE;
  listado:=public.f_get_compensacion_calificacion_operaciones(p_id_evento);
  IF NOT coalesce((listado->>'puede_guardar')::boolean,false) THEN RAISE EXCEPTION 'La calificacion no admite cambios'; END IF;
  IF p_ids IS NULL OR cardinality(p_ids)=0 OR array_position(p_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Selecciona al menos una operacion'; END IF;
  SELECT array_agg(DISTINCT n ORDER BY n) INTO ids FROM unnest(p_ids) n;
  SELECT array_agg(DISTINCT id_operacion ORDER BY id_operacion) INTO anteriores FROM public.tb_compensacion_evento_referencia WHERE id_evento=ev.id AND tipo_referencia='OPERACION';
  IF anteriores IS NOT NULL AND anteriores IS DISTINCT FROM ids THEN RAISE EXCEPTION 'Las operaciones ya fueron guardadas; consulta Visualizar'; END IF;
  dni:=listado->>'dni'; enlace:=nullif(btrim(p_pancake),'');
  IF enlace IS NOT NULL AND (length(enlace)>250 OR enlace !~ '^https://[^[:space:]]+$') THEN RAISE EXCEPTION 'Ingresa un enlace HTTPS valido de Pancake'; END IF;
  IF enlace IS NOT NULL AND listado->>'pancake' IS NOT NULL AND enlace IS DISTINCT FROM listado->>'pancake' THEN RAISE EXCEPTION 'Ya existe una conversacion vinculada'; END IF;
  -- Serializa la seleccion y revalida cada operacion antes de insertar cualquiera.
  PERFORM 1 FROM public.tb_operacion_proceso WHERE id IN(SELECT unnest(ids)) OR id IN(SELECT coalesce(id_operacion_padre,id) FROM public.tb_operacion_proceso WHERE id=ANY(ids)) ORDER BY id FOR UPDATE;
  FOREACH operacion IN ARRAY ids LOOP
    d:=public.f_private_compensacion_calificacion_operacion(operacion);
    IF d IS NULL OR (d->>'id')::bigint IS DISTINCT FROM operacion OR d->>'dni' IS DISTINCT FROM dni THEN
      RAISE EXCEPTION 'Operacion no disponible: debe ser del mismo DNI, Efectivizacion pagada o Pago Deuda con paso 4 completado'; END IF;
    snapshots:=snapshots||jsonb_build_array(d);
  END LOOP;
  INSERT INTO public.tb_compensacion_evento_referencia(id_evento,tipo_referencia,id_operacion,datos_snapshot,id_usuario)
    SELECT ev.id,'OPERACION',(s->>'id')::bigint,s,(ctx->>'id_usuario')::bigint FROM jsonb_array_elements(snapshots) s
    WHERE NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia WHERE id_evento=ev.id AND tipo_referencia='OPERACION' AND id_operacion=(s->>'id')::bigint);
  IF enlace IS NOT NULL THEN
    INSERT INTO public.tb_compensacion_evento_referencia(id_evento,tipo_referencia,identificador_externo,id_usuario)
      SELECT ev.id,'PANCAKE',enlace,(ctx->>'id_usuario')::bigint
      WHERE NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia WHERE id_evento=ev.id AND tipo_referencia='PANCAKE');
  END IF;
  UPDATE public.tb_compensacion_evento SET fecha_actualizacion=clock_timestamp(),datos=datos||jsonb_build_object(
    'trazabilidad_operacion',snapshots->0,'trazabilidad_operaciones',snapshots,'trazabilidad_usuario',(ctx->>'id_usuario')::bigint) WHERE id=ev.id;
  RETURN jsonb_build_object('guardadas',true,'cantidad',cardinality(ids));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_calificacion_propia(p_regenerar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE ctx jsonb; enlace public.tb_compensacion_calificacion_enlace%ROWTYPE; token text;
BEGIN
  ctx:=public.f_private_compensacion_calificacion_propia();
  IF ctx IS NULL THEN RAISE EXCEPTION 'Solo asesores activos de Atención al Cliente pueden acceder a su enlace'; END IF;
  PERFORM 1 FROM public.tb_compensacion_colaborador WHERE id=(ctx->>'id_colaborador')::bigint FOR UPDATE;
  ctx:=public.f_private_compensacion_calificacion_propia();
  IF ctx IS NULL THEN RAISE EXCEPTION 'Asesor no disponible'; END IF;
  SELECT * INTO enlace FROM public.tb_compensacion_calificacion_enlace
    WHERE id_colaborador=(ctx->>'id_colaborador')::bigint AND fecha_revocacion IS NULL;
  IF coalesce(p_regenerar,false) OR enlace.id IS NULL OR enlace.fecha_expiracion<=now() OR enlace.token_value IS NULL THEN
    token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
    UPDATE public.tb_compensacion_calificacion_enlace SET fecha_revocacion=now()
      WHERE id_colaborador=(ctx->>'id_colaborador')::bigint AND fecha_revocacion IS NULL;
    INSERT INTO public.tb_compensacion_calificacion_enlace(id_colaborador,token_hash,token_value,id_usuario_genera)
      VALUES((ctx->>'id_colaborador')::bigint,sha256(convert_to(token,'UTF8')),token,(ctx->>'id_usuario')::bigint)
      RETURNING * INTO enlace;
  END IF;
  RETURN (ctx-'id_colaborador'-'id_usuario')||jsonb_build_object('token',enlace.token_value,'expira',enlace.fecha_expiracion);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_calificacion_publica(p_token text, p_clave uuid, p_estrellas integer, p_dni text, p_comentario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE l public.tb_compensacion_calificacion_enlace%ROWTYPE; previo public.tb_compensacion_calificacion_envio%ROWTYPE;
  info jsonb; huella bytea; tipo bigint; actor bigint; sede bigint; evento bigint; captura jsonb;
  fecha timestamptz:=now(); periodo date:=(date_trunc('month',now() AT TIME ZONE 'America/Lima'))::date;
BEGIN
  info:=public.f_get_compensacion_calificacion_publica(p_token);
  IF p_clave IS NULL OR p_estrellas IS NULL OR p_estrellas NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Calificación inválida'; END IF;
  p_dni:=btrim(coalesce(p_dni,'')); p_comentario:=btrim(coalesce(p_comentario,''));
  IF length(p_comentario)>1000 OR (p_dni<>'' AND p_dni !~ '^[0-9]{8}$')
    OR (coalesce((info#>>'{politica,dni_obligatorio}')::boolean,true) AND p_dni='')
    OR (coalesce((info#>>'{politica,comentario_obligatorio}')::boolean,false) AND p_comentario='') THEN
    RAISE EXCEPTION 'Revisa el DNI y comentario';
  END IF;
  SELECT * INTO l FROM public.tb_compensacion_calificacion_enlace
    WHERE token_hash=sha256(convert_to(p_token,'UTF8')) FOR UPDATE;
  IF l.id IS NULL OR l.fecha_revocacion IS NOT NULL OR l.fecha_expiracion<=now() THEN
    RAISE EXCEPTION 'Enlace no disponible';
  END IF;
  -- Revalidar tras esperar un bloqueo: la regeneración puede haber revocado el enlace.
  info:=public.f_get_compensacion_calificacion_publica(p_token);
  huella:=sha256(convert_to(jsonb_build_array(p_estrellas,p_dni,p_comentario)::text,'UTF8'));
  SELECT * INTO previo FROM public.tb_compensacion_calificacion_envio WHERE id_enlace=l.id AND clave=p_clave;
  IF FOUND THEN
    IF previo.contenido_hash<>huella THEN RAISE EXCEPTION 'Identificador de envío reutilizado'; END IF;
    RETURN jsonb_build_object('recibido',true);
  END IF;
  IF (SELECT count(*) FROM public.tb_compensacion_calificacion_envio WHERE id_enlace=l.id
      AND fecha_registro>now()-interval '1 hour')>=60 THEN RAISE EXCEPTION 'Límite de envíos alcanzado'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_periodo pe
    WHERE pe.periodo=date_trunc('month',fecha AT TIME ZONE 'America/Lima')::date AND pe.estado_periodo='CERRADO') THEN
    RAISE EXCEPTION 'El periodo está cerrado';
  END IF;
  SELECT id INTO tipo FROM public.tb_compensacion_evento_tipo WHERE codigo=CASE WHEN EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador c JOIN public.tb_usuario u ON u.id=c.id_usuario
    WHERE c.id=l.id_colaborador AND u.id_rol=2) THEN 'REGISTRO_PRESENCIAL' ELSE 'CALIFICACION_PRESENCIAL' END;
  SELECT id_usuario INTO actor FROM public.tb_compensacion_colaborador WHERE id=l.id_colaborador;
  SELECT (public.f_private_compensacion_evento_tarifa_registro(tipo,l.id_colaborador,fecha)) INTO captura;
  SELECT id_sucursal INTO sede FROM public.tb_compensacion_asignacion WHERE id=(captura->>'id_asignacion_registro')::bigint;
  -- El usuario vinculado es el custodio interno, NO una sesión del cliente.
  -- El origen CLIENTE y los metadatos distinguen al autor externo del generador.
  INSERT INTO public.tb_compensacion_evento(id_tipo_evento,id_colaborador_beneficiario,id_colaborador_responsable,
    id_sucursal_origen,id_sucursal_responsable,fecha_evento,periodo_imputacion,fuente,clave_origen,titulo,
    descripcion,datos,evidencia,estado_evento,id_usuario_registra,criterios_validacion_snapshot)
  VALUES(tipo,l.id_colaborador,l.id_colaborador,sede,sede,fecha,periodo,'CLIENTE','CALIFICACION:'||l.id||':'||p_clave,
    'Calificación del cliente',nullif(p_comentario,''),jsonb_build_object('estrellas',p_estrellas,
      'cliente_documento',p_dni,'origen','FORMULARIO_PUBLICO','autor_externo',true,
      'id_enlace',l.id,'id_usuario_genera_enlace',l.id_usuario_genera),
    jsonb_build_array(jsonb_build_object('tipo','FORMULARIO_PUBLICO','fecha',fecha)),
    'PENDIENTE',actor,captura) RETURNING id INTO evento;
  INSERT INTO public.tb_compensacion_calificacion_envio(id_enlace,clave,contenido_hash,id_evento)
    VALUES(l.id,p_clave,huella,evento);
  RETURN jsonb_build_object('recibido',true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_captacion_nota(p_cliente bigint, p_colaborador bigint, p_nota text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$ SELECT public.f_post_compensacion_captacion_nota_concepto(p_cliente,p_colaborador,'COMISION_REGISTRO_EFECTIVIZACION',p_nota); $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_captacion_nota_concepto(p_cliente bigint, p_colaborador bigint, p_concepto text, p_nota text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
 PERFORM public.f_get_compensacion_captacion_revision_concepto(p_cliente,p_colaborador,p_concepto);
 IF p_nota IS NULL OR length(btrim(p_nota)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Escribe una nota de 1 a 2000 caracteres'; END IF;
 INSERT INTO public.tb_compensacion_captacion_nota(id_cliente,id_colaborador,nota,id_usuario)
 VALUES(p_cliente,p_colaborador,btrim(p_nota),(SELECT id FROM public.tb_usuario WHERE auth_user_id=auth.uid()));
 RETURN public.f_get_compensacion_captacion_revision_concepto(p_cliente,p_colaborador,p_concepto);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_captacion_resolver(p_cliente bigint, p_colaborador bigint, p_version text, p_decision text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$ SELECT public.f_post_compensacion_captacion_resolver_concepto(p_cliente,p_colaborador,'COMISION_REGISTRO_EFECTIVIZACION',p_version,p_decision,p_motivo); $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_captacion_resolver_concepto(p_cliente bigint, p_colaborador bigint, p_concepto text, p_version text, p_decision text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE j jsonb; fuente jsonb; revision jsonb; periodo_pago date;
BEGIN
 j:=public.f_get_compensacion_captacion_revision_concepto(p_cliente,p_colaborador,p_concepto);
 IF p_decision IS NULL OR p_decision NOT IN('APROBADO','RECHAZADO') THEN RAISE EXCEPTION 'Decision invalida'; END IF;
 -- Confirmacion simple: registra la accion sin exigir una nota escrita por el usuario.
 p_motivo:=coalesce(nullif(btrim(p_motivo),''),CASE WHEN p_decision='APROBADO' THEN 'Aprobado mediante confirmacion administrativa' ELSE 'Rechazado mediante confirmacion administrativa' END);
 IF length(btrim(coalesce(p_motivo,'')))<10 THEN RAISE EXCEPTION 'Indica el motivo de la decision (minimo diez caracteres)'; END IF;
 periodo_pago:=date_trunc('month',(j->>'fecha_efectiva')::timestamptz AT TIME ZONE 'America/Lima')::date;
 PERFORM id FROM public.tb_compensacion_periodo WHERE periodo=periodo_pago ORDER BY id FOR UPDATE;
 PERFORM id FROM public.tb_cliente WHERE id=p_cliente FOR UPDATE;
 PERFORM id FROM public.tb_operacion_proceso WHERE id_cliente=p_cliente OR id_operacion_padre=(j->>'id_operacion')::bigint ORDER BY id FOR SHARE;
 PERFORM id FROM public.tb_compensacion_regla WHERE id=(j->>'id_regla')::bigint FOR SHARE;
 j:=public.f_get_compensacion_captacion_revision_concepto(p_cliente,p_colaborador,p_concepto);
 IF p_version IS NULL OR p_version IS DISTINCT FROM j->>'revision_version' THEN RAISE EXCEPTION 'La captacion o su operacion cambiaron; actualiza antes de decidir'; END IF;
 IF NOT coalesce((j->>'puede_resolver')::boolean,false) THEN RAISE EXCEPTION '%',coalesce(nullif(j->>'bloqueo_revision',''),'La captacion ya fue resuelta o no admite decision'); END IF;
 fuente:=public.f_private_compensacion_captacion_fuente_concepto(p_cliente,p_colaborador,p_concepto);
 INSERT INTO public.tb_compensacion_captacion_revision(id_cliente,id_colaborador,concepto_codigo,decision,motivo,huella,fuente_snapshot,id_usuario_revisa)
 VALUES(p_cliente,p_colaborador,p_concepto,p_decision,btrim(p_motivo),public.f_private_compensacion_captacion_huella(fuente),fuente,(SELECT id FROM public.tb_usuario WHERE auth_user_id=auth.uid()));
 PERFORM public.f_private_compensacion_seguimiento_encolar(periodo_pago,'Decision administrativa de captacion');
 RETURN public.f_get_compensacion_captacion_revision_concepto(p_cliente,p_colaborador,p_concepto);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_caza_errores(p_ruta text, p_id_tipo_evento bigint, p_id_penalidad_tipo bigint, p_id_colaborador_responsable bigint, p_fecha_evento timestamp with time zone, p_motivo text, p_titulo text, p_evidencia jsonb, p_referencias jsonb, p_clave_origen text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_usuario bigint;
  v_id_colaborador bigint;
  v_codigo text;
  v_codigos text[];
  v_id_cliente bigint;
  v_documento text;
  v_tipo public.tb_compensacion_evento_tipo%ROWTYPE;
  v_penalidad public.tb_compensacion_penalidad_tipo%ROWTYPE;
  v_evento public.tb_compensacion_evento%ROWTYPE;
  v_resultado jsonb;
  v_id_evento bigint;
  v_id_comision bigint;
BEGIN
  IF p_ruta NOT IN(
    '/compensaciones/mal-flujo-safetypay',
    '/compensaciones/conversacion-al-aire',
    '/compensaciones/error-registro-codigo'
  ) THEN RAISE EXCEPTION 'La opcion de Caza de Errores no es valida'; END IF;

  v_contexto:=public.f_private_compensacion_contexto('INCIDENCIAS','REGISTRAR');
  IF (v_contexto->>'alcance')<>'SEDE' THEN RAISE EXCEPTION 'Solo Jefatura puede registrar Caza de Errores'; END IF;
  v_id_usuario:=(v_contexto->>'id_usuario')::bigint;
  v_id_colaborador:=(v_contexto->>'id_colaborador')::bigint;
  IF NOT EXISTS(
    SELECT 1 FROM public.tb_permiso_usuario pu
    JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
    JOIN public.tb_estado ep ON ep.id=pu.id_estado AND upper(btrim(ep.nombre))='ACTIVO'
    JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
    WHERE pu.id_usuario=v_id_usuario AND pm.ruta IN(p_ruta,'/compensaciones/auditoria-operaciones')
  ) THEN RAISE EXCEPTION 'No tiene permiso para esta opcion de registro'; END IF;

  v_codigos:=CASE p_ruta
    WHEN '/compensaciones/mal-flujo-safetypay' THEN ARRAY['ATC_MAL_FLUJO']::text[]
    WHEN '/compensaciones/conversacion-al-aire' THEN ARRAY['ATC_ABANDONO_CHAT','ATC_PROCESO_AIRE']::text[]
    WHEN '/compensaciones/error-registro-codigo' THEN ARRAY['ATC_ERROR_DATOS','ATC_ERROR_REGISTRO']::text[]
  END;
  SELECT pt.codigo INTO v_codigo
  FROM public.tb_compensacion_penalidad_tipo pt
  JOIN public.tb_estado ep ON ep.id=pt.id_estado AND upper(btrim(ep.nombre))='ACTIVO'
  WHERE pt.id=p_id_penalidad_tipo AND pt.codigo=ANY(v_codigos) AND pt.monto_bono_reportante IS NOT NULL;
  IF v_codigo IS NULL THEN RAISE EXCEPTION 'El concepto no corresponde a la opcion o fecha seleccionada'; END IF;

  SELECT t.* INTO v_tipo FROM public.tb_compensacion_evento_tipo t
  JOIN public.tb_estado et ON et.id=t.id_estado AND upper(btrim(et.nombre))='ACTIVO'
  WHERE t.id=p_id_tipo_evento AND t.codigo='AUDITORIA_ACTIVA';
  IF v_tipo.id IS NULL THEN RAISE EXCEPTION 'El reporte debe ser de Auditoria Activa'; END IF;

  IF jsonb_typeof(p_referencias)<>'array' THEN RAISE EXCEPTION 'Debe incluir la referencia validada del cliente'; END IF;
  SELECT nullif(r->>'id_cliente','')::bigint, nullif(btrim(r->>'identificador_externo'),'')
    INTO v_id_cliente,v_documento
  FROM jsonb_array_elements(p_referencias) r
  WHERE r->>'tipo_referencia'='CLIENTE' LIMIT 1;
  IF v_id_cliente IS NULL OR v_documento !~ '^[0-9]{8}$' OR NOT EXISTS(
    SELECT 1 FROM public.tb_cliente c JOIN public.tb_estado ec ON ec.id=c.id_estado
    WHERE c.id=v_id_cliente AND c.numero_documento=v_documento AND upper(btrim(ec.nombre))='ACTIVO'
  ) THEN RAISE EXCEPTION 'El DNI debe pertenecer a un cliente registrado y activo'; END IF;
  IF p_fecha_evento IS NULL OR coalesce(length(btrim(p_motivo)),0)<5
     OR coalesce(length(btrim(p_titulo)),0)=0 OR coalesce(length(btrim(p_clave_origen)),0)=0 THEN
    RAISE EXCEPTION 'Completa observaciones, fecha y clave del reporte';
  END IF;
  -- Concepto, observaciones y Notas sustentan la captura; adjuntos opcionales.
  IF p_evidencia IS NULL OR jsonb_typeof(p_evidencia)<>'array' THEN
    RAISE EXCEPTION 'La evidencia debe ser un arreglo JSON';
  END IF;
  IF NOT public.f_private_compensacion_equipo_visible(v_contexto,p_id_colaborador_responsable,(p_fecha_evento AT TIME ZONE 'America/Lima')::date,false)
     OR p_id_colaborador_responsable=v_id_colaborador THEN
    RAISE EXCEPTION 'Selecciona un colaborador ATC vigente de tu sede';
  END IF;

  SELECT * INTO v_penalidad FROM public.tb_compensacion_penalidad_tipo WHERE id=p_id_penalidad_tipo;
  v_resultado:=public.f_post_tb_compensacion_incidencia(
    p_id_tipo_evento,p_id_penalidad_tipo,p_id_colaborador_responsable,p_fecha_evento,p_motivo,
    v_id_colaborador,p_titulo::varchar,p_evidencia,p_referencias,p_clave_origen::varchar,'MANUAL'
  );
  v_id_evento:=(v_resultado->>'id')::bigint;
  SELECT * INTO v_evento FROM public.tb_compensacion_evento WHERE id=v_id_evento FOR UPDATE;
  UPDATE public.tb_compensacion_evento
  SET datos=datos||jsonb_build_object(
    'flujo','CAZA_ERRORES_V1','ruta_captura',p_ruta,'codigo_concepto',v_codigo,
    'penalidad_tipo_snapshot',coalesce(datos->'penalidad_tipo_snapshot','{}'::jsonb)||jsonb_build_object('monto_bono_reportante',0)
  )
  WHERE id=v_id_evento;

  -- La comisión es una decisión administrativa y un evento económico independiente.
  IF coalesce(v_penalidad.monto_bono_reportante,0)>0 AND NOT EXISTS(
    SELECT 1 FROM public.tb_compensacion_caza_errores_vinculo v
    WHERE v.id_evento_origen=v_id_evento AND v.tipo_consecuencia='COMISION_JEFE'
  ) THEN
    INSERT INTO public.tb_compensacion_evento(
      id_tipo_evento,id_colaborador_beneficiario,id_colaborador_responsable,
      id_sucursal_origen,id_sucursal_responsable,id_penalidad_tipo,
      fecha_evento,periodo_imputacion,fuente,clave_origen,titulo,descripcion,datos,evidencia,
      estado_evento,id_usuario_registra
    ) VALUES(
      v_evento.id_tipo_evento,v_id_colaborador,v_id_colaborador,
      v_evento.id_sucursal_origen,v_evento.id_sucursal_responsable,v_penalidad.id,
      v_evento.fecha_evento,v_evento.periodo_imputacion,'MANUAL','CAZA_COMISION:'||v_id_evento::text,
      'Comisión de Auditoría Activa','Comisión prevista por el hallazgo '||v_id_evento::text,
      jsonb_build_object('flujo','CAZA_ERRORES_V1','consecuencia','COMISION_JEFE','id_evento_origen',v_id_evento,
        'penalidad_tipo_snapshot',to_jsonb(v_penalidad)||jsonb_build_object(
          'codigo','COMISION_AUDITORIA_ACTIVA','nombre','Comisión de Auditoría Activa',
          'monto_referencia',0,'monto_bono_reportante',v_penalidad.monto_bono_reportante,'requiere_respuesta',false)),
      v_evento.evidencia,'BORRADOR',v_id_usuario
    ) RETURNING id INTO v_id_comision;
    INSERT INTO public.tb_compensacion_caza_errores_vinculo(
      id_evento_origen,id_evento_consecuencia,tipo_consecuencia,id_usuario_registra
    ) VALUES(v_id_evento,v_id_comision,'COMISION_JEFE',v_id_usuario);
    -- El borrador no es una decision de revision; ENVIADO se registra al enviar.
  END IF;
  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_caza_errores_enviar(p_ruta text, p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_usuario bigint;
  v_codigo text;
  v_codigo_evento text;
  v_resultado jsonb;
  v_hijo bigint;
  v_paso integer;
BEGIN
  v_contexto:=public.f_private_compensacion_contexto('INCIDENCIAS','REGISTRAR');
  v_id_usuario:=(v_contexto->>'id_usuario')::bigint;
  IF p_ruta NOT IN('/compensaciones/mal-flujo-safetypay','/compensaciones/conversacion-al-aire','/compensaciones/error-registro-codigo')
     OR NOT EXISTS(SELECT 1 FROM public.tb_permiso_usuario pu JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
       JOIN public.tb_estado ep ON ep.id=pu.id_estado AND upper(btrim(ep.nombre))='ACTIVO'
       WHERE pu.id_usuario=v_id_usuario AND pm.ruta IN(p_ruta,'/compensaciones/auditoria-operaciones')) THEN
    RAISE EXCEPTION 'No tiene permiso para enviar esta opcion';
  END IF;
  -- Orden de bloqueo compartido: periodo antes que evento.
  PERFORM public.f_private_compensacion_incidencia_validar_alcance(p_id,'REGISTRAR',true);
  SELECT pt.codigo,te.codigo INTO v_codigo,v_codigo_evento
  FROM public.tb_compensacion_evento ev
  JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id=ev.id_penalidad_tipo
  JOIN public.tb_compensacion_evento_tipo te ON te.id=ev.id_tipo_evento
  WHERE ev.id=p_id AND ev.id_usuario_registra=v_id_usuario AND ev.estado_evento IN('BORRADOR','PENDIENTE')
  FOR UPDATE OF ev;
  IF v_codigo_evento IS DISTINCT FROM 'AUDITORIA_ACTIVA' THEN RAISE EXCEPTION 'El borrador no corresponde a un hallazgo propio de Caza de Errores'; END IF;
  IF NOT ((p_ruta='/compensaciones/mal-flujo-safetypay' AND v_codigo='ATC_MAL_FLUJO')
      OR (p_ruta='/compensaciones/conversacion-al-aire' AND v_codigo IN('ATC_ABANDONO_CHAT','ATC_PROCESO_AIRE'))
      OR (p_ruta='/compensaciones/error-registro-codigo' AND v_codigo IN('ATC_ERROR_DATOS','ATC_ERROR_REGISTRO'))) THEN
    RAISE EXCEPTION 'El concepto del borrador no corresponde a esta ruta';
  END IF;
  v_resultado:=public.f_post_tb_compensacion_incidencia_enviar(p_id,NULL);
  SELECT id_evento_consecuencia INTO v_hijo FROM public.tb_compensacion_caza_errores_vinculo
    WHERE id_evento_origen=p_id AND tipo_consecuencia='COMISION_JEFE';
  IF v_hijo IS NOT NULL THEN
    UPDATE public.tb_compensacion_evento SET estado_evento='PENDIENTE',fecha_actualizacion=now() WHERE id=v_hijo AND estado_evento='BORRADOR';
    -- Un reintento sobre PENDIENTE no agrega otro paso ENVIADO.
    IF FOUND THEN
    SELECT coalesce(max(numero_paso),0)+1 INTO v_paso FROM public.tb_compensacion_evento_revision WHERE id_evento=v_hijo;
    INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,id_usuario_revisor,datos_decision)
    VALUES(v_hijo,v_paso,'REPORTE','ENVIADO',v_id_usuario,jsonb_build_object('id_evento_origen',p_id,'tipo_consecuencia','COMISION_JEFE'));
    END IF;
  END IF;
  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_caza_errores_penalidad_jefe(p_id_evento_origen bigint, p_codigo_penalidad text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_usuario bigint;
  v_origen public.tb_compensacion_evento%ROWTYPE;
  v_penalidad public.tb_compensacion_penalidad_tipo%ROWTYPE;
  v_id_evento bigint;
  v_paso integer;
BEGIN
  v_contexto:=public.f_private_compensacion_contexto('INCIDENCIAS','REGISTRAR');
  v_id_usuario:=(v_contexto->>'id_usuario')::bigint;
  IF NOT EXISTS(SELECT 1 FROM public.tb_usuario u WHERE u.id=v_id_usuario AND (u.id_rol=1 OR coalesce(u.flag_super_admin,false))) THEN
    RAISE EXCEPTION 'Solo Administración puede vincular una penalidad de Jefatura';
  END IF;
  IF nullif(btrim(p_motivo),'') IS NULL OR length(btrim(p_motivo))<10 THEN
    RAISE EXCEPTION 'Explica por qué corresponde la penalidad de Jefatura (mínimo 10 caracteres)';
  END IF;
  SELECT * INTO v_origen FROM public.tb_compensacion_evento e
  WHERE e.id=p_id_evento_origen AND e.estado_evento IN('PENDIENTE','APROBADO')
    AND e.datos->>'flujo'='CAZA_ERRORES_V1' FOR UPDATE;
  IF v_origen.id IS NULL OR v_origen.id_colaborador_beneficiario IS NULL THEN
    RAISE EXCEPTION 'El hallazgo no tiene un Jefe de Sede reportante válido';
  END IF;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_caza_errores_vinculo v
    WHERE v.id_evento_origen=p_id_evento_origen AND v.tipo_consecuencia='PENALIDAD_JEFE') THEN
    RAISE EXCEPTION 'Este hallazgo ya tiene una penalidad de Jefatura vinculada';
  END IF;
  SELECT p.* INTO v_penalidad
  FROM public.tb_compensacion_asignacion a
  JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='JEFE_TIENDA'
  JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
  CROSS JOIN LATERAL public.f_private_compensacion_penalidades_fecha(a.id_plan,(v_origen.fecha_evento AT TIME ZONE 'America/Lima')::date) p
  WHERE a.id_colaborador=v_origen.id_colaborador_beneficiario
    AND a.fecha_inicio<=(v_origen.fecha_evento AT TIME ZONE 'America/Lima')::date
    AND (a.fecha_fin IS NULL OR a.fecha_fin>=(v_origen.fecha_evento AT TIME ZONE 'America/Lima')::date)
    AND p.codigo=p_codigo_penalidad
    AND p.codigo=ANY(ARRAY['JEFE_ERROR_SUPERVISION','JEFE_ABANDONO_SOLIDARIO','JEFE_QUEJA_TARDIA','JEFE_UNIFORME','JEFE_ERROR_CUADRO','JEFE_INDISCIPLINA']::text[])
  ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1;
  IF v_penalidad.id IS NULL THEN RAISE EXCEPTION 'La penalidad no está configurada para la asignación vigente del Jefe'; END IF;

  INSERT INTO public.tb_compensacion_evento(
    id_tipo_evento,id_colaborador_beneficiario,id_colaborador_responsable,
    id_sucursal_origen,id_sucursal_responsable,id_penalidad_tipo,
    fecha_evento,periodo_imputacion,fuente,clave_origen,titulo,descripcion,datos,evidencia,
    estado_evento,id_usuario_registra
  ) VALUES(
    v_origen.id_tipo_evento,NULL,v_origen.id_colaborador_beneficiario,
    v_origen.id_sucursal_origen,v_origen.id_sucursal_origen,v_penalidad.id,
    v_origen.fecha_evento,v_origen.periodo_imputacion,'MANUAL','CAZA_PENALIDAD_JEFE:'||p_id_evento_origen::text,
    v_penalidad.nombre,btrim(p_motivo),
    jsonb_build_object('flujo','CAZA_ERRORES_V1','consecuencia','PENALIDAD_JEFE','id_evento_origen',p_id_evento_origen,
      'penalidad_tipo_snapshot',to_jsonb(v_penalidad)),v_origen.evidencia,'PENDIENTE',v_origen.id_usuario_registra
  ) RETURNING id INTO v_id_evento;
  INSERT INTO public.tb_compensacion_caza_errores_vinculo(
    id_evento_origen,id_evento_consecuencia,tipo_consecuencia,id_usuario_registra
  ) VALUES(p_id_evento_origen,v_id_evento,'PENALIDAD_JEFE',v_id_usuario);
  INSERT INTO public.tb_compensacion_evento_referencia(
    id_evento,tipo_referencia,id_cliente,id_operacion,identificador_externo,datos_snapshot,id_usuario
  ) SELECT v_id_evento,tipo_referencia,id_cliente,id_operacion,identificador_externo,datos_snapshot,v_id_usuario
    FROM public.tb_compensacion_evento_referencia WHERE id_evento=p_id_evento_origen;
  SELECT coalesce(max(numero_paso),0)+1 INTO v_paso FROM public.tb_compensacion_evento_revision WHERE id_evento=v_id_evento;
  INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,id_usuario_revisor,comentario,datos_decision)
  VALUES(v_id_evento,v_paso,'REPORTE','ENVIADO',v_id_usuario,btrim(p_motivo),
    jsonb_build_object('id_evento_origen',p_id_evento_origen,'tipo_consecuencia','PENALIDAD_JEFE'));
  RETURN jsonb_build_object('id',v_id_evento,'id_evento_origen',p_id_evento_origen,'estado_evento','PENDIENTE');
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_chat_dni(p_dni text, p_fecha date, p_clave uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE act jsonb; mes date; hoy date:=(now() AT TIME ZONE 'America/Lima')::date; dni text:=btrim(coalesce(p_dni,'')); cli bigint; ex record; r public.tb_compensacion_chat_dni%ROWTYPE;
BEGIN
  act:=public.f_private_compensacion_chat_dni_actor();
  IF (act->>'admin')::boolean THEN RAISE EXCEPTION 'Solo atención al cliente registra chats'; END IF;
  IF p_clave IS NULL OR p_fecha IS NULL THEN RAISE EXCEPTION 'Fecha y clave de registro obligatorias'; END IF;
  IF dni !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'El DNI debe tener 8 dígitos'; END IF;
  IF p_fecha>hoy THEN RAISE EXCEPTION 'La fecha de atención no puede ser futura'; END IF;
  mes:=date_trunc('month',p_fecha)::date;
  SELECT * INTO r FROM public.tb_compensacion_chat_dni WHERE id_usuario=(act->>'id_usuario')::bigint AND clave=p_clave;
  IF r.id IS NOT NULL THEN
    RETURN jsonb_build_object('id',r.id,'periodo',r.periodo,'documento',r.documento,'idempotente',true);
  END IF;
  PERFORM public.f_private_compensacion_chat_dni_editable(mes);
  SELECT cl.id INTO cli FROM public.tb_cliente cl JOIN public.tb_estado e ON e.id=cl.id_estado AND upper(btrim(e.nombre))='ACTIVO'
  WHERE cl.numero_documento=dni ORDER BY cl.id LIMIT 1;
  IF cli IS NULL THEN RAISE EXCEPTION 'El DNI no está registrado como cliente activo. Registra primero al cliente'; END IF;
  SELECT cd.id_colaborador,c.nombre_completo INTO ex FROM public.tb_compensacion_chat_dni cd
  JOIN public.tb_compensacion_colaborador c ON c.id=cd.id_colaborador WHERE cd.periodo=mes AND cd.documento=dni AND cd.estado='ACTIVO';
  IF ex.id_colaborador IS NOT NULL THEN
    IF ex.id_colaborador=(act->>'id_colaborador')::bigint THEN RAISE EXCEPTION 'Ya registraste este DNI en el mes'; END IF;
    RAISE EXCEPTION 'Este DNI ya fue registrado en el mes por %', ex.nombre_completo;
  END IF;
  INSERT INTO public.tb_compensacion_chat_dni(periodo,id_colaborador,id_cliente,documento,fecha_atencion,clave,id_usuario)
  VALUES(mes,(act->>'id_colaborador')::bigint,cli,dni,p_fecha,p_clave,(act->>'id_usuario')::bigint) RETURNING * INTO r;
  RETURN jsonb_build_object('id',r.id,'periodo',r.periodo,'documento',r.documento,'idempotente',false);
END $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_chat_dni_anular(p_id bigint, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE act jsonb; r public.tb_compensacion_chat_dni%ROWTYPE;
BEGIN
  act:=public.f_private_compensacion_chat_dni_actor();
  IF length(btrim(coalesce(p_motivo,'')))<5 THEN RAISE EXCEPTION 'Indica el motivo de la anulación'; END IF;
  SELECT * INTO r FROM public.tb_compensacion_chat_dni WHERE id=p_id;
  IF r.id IS NULL OR (NOT (act->>'admin')::boolean AND r.id_colaborador IS DISTINCT FROM (act->>'id_colaborador')::bigint) THEN
    RAISE EXCEPTION 'Registro no encontrado'; END IF;
  IF r.estado='ANULADO' THEN RETURN jsonb_build_object('id',r.id,'idempotente',true); END IF;
  PERFORM public.f_private_compensacion_chat_dni_editable(r.periodo);
  UPDATE public.tb_compensacion_chat_dni SET estado='ANULADO',motivo_anulacion=btrim(p_motivo),
    id_usuario_anula=(act->>'id_usuario')::bigint,fecha_anulacion=now() WHERE id=p_id;
  RETURN jsonb_build_object('id',p_id,'idempotente',false);
END $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_chat_dni_certificar(p_mes date, p_justificacion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE act jsonb; mes date; n integer;
BEGIN
  act:=public.f_private_compensacion_chat_dni_actor();
  IF NOT (act->>'admin')::boolean THEN RAISE EXCEPTION 'Solo administración certifica el mes'; END IF;
  IF p_mes IS NULL THEN RAISE EXCEPTION 'Selecciona un mes'; END IF;
  mes:=date_trunc('month',p_mes)::date;
  PERFORM public.f_private_compensacion_chat_dni_editable(mes);
  IF (now() AT TIME ZONE 'America/Lima')::date<mes+interval '1 month' OR length(btrim(coalesce(p_justificacion,'')))<20 THEN
    RAISE EXCEPTION 'Certifica después del fin del mes y sustenta la revisión (mínimo 20 caracteres)'; END IF;
  SELECT count(*) INTO n FROM public.tb_compensacion_chat_dni WHERE periodo=mes AND estado='ACTIVO';
  IF n=0 THEN RAISE EXCEPTION 'No hay chats activos para certificar'; END IF;
  INSERT INTO public.tb_compensacion_chat_dni_mes(periodo,certificacion,id_usuario)
  VALUES(mes,jsonb_build_object('actor',(act->>'id_usuario')::bigint,'fecha',now(),'justificacion',btrim(p_justificacion),'chats_activos',n),(act->>'id_usuario')::bigint);
  RETURN jsonb_build_object('periodo',mes,'estado','CERTIFICADA','chats_activos',n);
END $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_chat_dni_reabrir(p_mes date, p_justificacion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE act jsonb; mes date;
BEGIN
  act:=public.f_private_compensacion_chat_dni_actor();
  IF NOT (act->>'admin')::boolean THEN RAISE EXCEPTION 'Solo administración reabre el mes'; END IF;
  IF p_mes IS NULL OR length(btrim(coalesce(p_justificacion,'')))<10 THEN RAISE EXCEPTION 'Indica mes y justificación (mínimo 10 caracteres)'; END IF;
  mes:=date_trunc('month',p_mes)::date;
  PERFORM pg_advisory_xact_lock(hashtextextended('PANCAKE:'||mes::text,0));
  PERFORM public.f_private_compensacion_pancake_abierto(mes);
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_mes_adjudicacion WHERE periodo=mes AND criterio='ATENCIONES') THEN
    RAISE EXCEPTION 'El mes ya fue adjudicado'; END IF;
  DELETE FROM public.tb_compensacion_chat_dni_mes WHERE periodo=mes;
  IF NOT FOUND THEN RAISE EXCEPTION 'El mes no está certificado'; END IF;
  RETURN jsonb_build_object('periodo',mes,'estado','EN_REVISION');
END $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_cliente_nuevo(p_documento text, p_nombre text, p_tipo_documento bigint DEFAULT 1, p_celular text DEFAULT NULL::text, p_id_comunidad bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE usuario bigint; activo bigint; nuevo public.tb_cliente%ROWTYPE; v jsonb;
BEGIN
  PERFORM public.f_private_compensacion_bono_no_admin();
  IF EXISTS(SELECT 1 FROM public.tb_usuario WHERE auth_user_id=auth.uid() AND id_rol=6 AND NOT coalesce(flag_super_admin,false)) THEN RAISE EXCEPTION 'Marketing registra clientes mediante TikTok Live con evidencia'; END IF;
  usuario:=public.f_private_compensacion_cliente_nuevo_usuario();
  PERFORM public.f_get_compensacion_cliente_nuevo_validar(p_documento,p_tipo_documento);
  IF coalesce(length(btrim(p_nombre)),0)<3 OR length(btrim(p_nombre))>200 THEN RAISE EXCEPTION 'Ingresa el nombre completo (3 a 200 caracteres)'; END IF;
  IF coalesce(p_celular,'')<>'' AND p_celular !~ '^[0-9]{9}$' THEN RAISE EXCEPTION 'El celular requiere 9 digitos'; END IF;
  IF p_id_comunidad IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tb_comunidad co JOIN public.tb_estado e ON e.id=co.id_estado WHERE co.id=p_id_comunidad AND upper(e.nombre)='ACTIVO') THEN RAISE EXCEPTION 'Comunidad no disponible'; END IF;
  -- Sin bloqueo de tabla: serializa por documento; la restriccion unica de tb_cliente cubre el alta operativa.
  SET LOCAL lock_timeout='3s';
  PERFORM pg_advisory_xact_lock(hashtextextended('cliente-nuevo:'||p_tipo_documento||':'||p_documento,0));
  v:=public.f_get_compensacion_cliente_nuevo_validar(p_documento,p_tipo_documento);
  IF coalesce((v->>'reclamable')::boolean,false) THEN
    -- Cliente creado hace menos de 7 dias fuera de este modulo: se vincula al registro del usuario sin reiniciar su plazo.
    UPDATE public.tb_cliente SET id_usuario=usuario WHERE id=(v->>'id_cliente')::bigint RETURNING * INTO nuevo;
    RETURN jsonb_build_object('id',nuevo.id,'fecha_registro',nuevo.fecha_registro,'vence',nuevo.fecha_registro+interval '168 hours','estado','ESPERANDO_OPERACION','vinculado',true);
  END IF;
  IF (v->>'existe')::boolean THEN
    RAISE EXCEPTION '%', CASE v->>'motivo'
      WHEN 'PROPIO' THEN 'Este cliente ya esta registrado a tu nombre'
      WHEN 'OTRO_USUARIO' THEN 'Este cliente ya pertenece al registro de otro usuario'
      WHEN 'VENCIDO' THEN 'El cliente ya existe y paso su plazo de siete dias'
      ELSE 'El cliente ya existe. No corresponde un nuevo registro' END; END IF;
  SELECT id INTO activo FROM public.tb_estado WHERE upper(btrim(nombre))='ACTIVO' ORDER BY id LIMIT 1;
  IF activo IS NULL THEN RAISE EXCEPTION 'Falta configurar el estado Activo'; END IF;
  INSERT INTO public.tb_cliente(tipo_documento,numero_documento,nombre,celular,id_comunidad,id_estado,id_usuario)
    VALUES(p_tipo_documento,p_documento,btrim(p_nombre),nullif(p_celular,'')::bigint,p_id_comunidad,activo,usuario) RETURNING * INTO nuevo;
  RETURN jsonb_build_object('id',nuevo.id,'fecha_registro',nuevo.fecha_registro,'vence',nuevo.fecha_registro+interval '168 hours','estado','ESPERANDO_OPERACION');
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'El cliente ya existe. No corresponde un nuevo registro';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_colaborador_ficha(p_datos jsonb, p_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE resultado jsonb; colaborador bigint; desde date; actor bigint; clave text; valor numeric;
  asignacion public.tb_compensacion_asignacion%ROWTYPE; concepto text;
  
  cuenta jsonb; cuenta_id bigint; estado_inactivo bigint;
BEGIN
  IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Datos de ficha invalidos'; END IF;
  PERFORM public.f_private_compensacion_contexto('COLABORADORES',CASE WHEN p_id IS NULL THEN 'REGISTRAR' ELSE 'EDITAR' END);
  desde:=CASE WHEN p_id IS NULL THEN (p_datos->>'p_fecha_ingreso')::date ELSE (now() AT TIME ZONE 'America/Lima')::date END;
  PERFORM id FROM public.tb_compensacion_periodo WHERE fecha_fin>=desde ORDER BY id FOR UPDATE;
  IF p_id IS NOT NULL THEN PERFORM id FROM public.tb_compensacion_colaborador WHERE id=p_id FOR UPDATE; END IF;
  IF p_id IS NULL THEN
    resultado:=public.f_post_tb_compensacion_colaborador(
      p_tipo_documento:=p_datos->>'p_tipo_documento',p_numero_documento:=p_datos->>'p_numero_documento',
      p_nombres:=p_datos->>'p_nombres',p_apellido_paterno:=p_datos->>'p_apellido_paterno',p_apellido_materno:=p_datos->>'p_apellido_materno',
      p_nombre_completo:=p_datos->>'p_nombre_completo',p_fecha_ingreso:=(p_datos->>'p_fecha_ingreso')::date,
      p_id_cargo:=(p_datos->>'p_id_cargo')::bigint,p_id_sucursal:=(p_datos->>'p_id_sucursal')::bigint,
      p_id_plan:=(p_datos->>'p_id_plan')::bigint,
      p_id_usuario:=(p_datos->>'p_id_usuario')::bigint,p_codigo_huellero:=p_datos->>'p_numero_documento',
      p_modalidad:=p_datos->>'p_modalidad',p_id_estado:=(p_datos->>'p_id_estado')::bigint);
    desde:=(p_datos->>'p_fecha_ingreso')::date;
  ELSE
    resultado:=public.f_patch_tb_compensacion_colaborador(p_id:=p_id,
      p_id_usuario:=(p_datos->>'p_id_usuario')::bigint,p_tipo_documento:=p_datos->>'p_tipo_documento',
      p_numero_documento:=p_datos->>'p_numero_documento',p_nombre_completo:=p_datos->>'p_nombre_completo',
      p_codigo_huellero:=p_datos->>'p_numero_documento',p_fecha_ingreso:=(p_datos->>'p_fecha_ingreso')::date,
      p_fecha_cese:=(p_datos->>'p_fecha_cese')::date,p_motivo_cese:=p_datos->>'p_motivo_cese',p_id_estado:=(p_datos->>'p_id_estado')::bigint);
    desde:=(now() AT TIME ZONE 'America/Lima')::date;
  END IF;
  colaborador:=(resultado->>'id')::bigint;
  -- Una ficha: datos, asignacion y cuentas se confirman en la misma transaccion.
  IF p_id IS NOT NULL AND p_datos ? 'p_id_cargo' THEN
    SELECT * INTO asignacion FROM public.tb_compensacion_asignacion a WHERE a.id_colaborador=colaborador
      AND a.fecha_inicio<=desde AND (a.fecha_fin IS NULL OR a.fecha_fin>=desde)
      ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1;
    IF asignacion.id IS NULL OR ROW(asignacion.id_cargo,asignacion.id_sucursal,asignacion.id_plan,asignacion.modalidad)
      IS DISTINCT FROM ROW((p_datos->>'p_id_cargo')::bigint,(p_datos->>'p_id_sucursal')::bigint,(p_datos->>'p_id_plan')::bigint,(p_datos->>'p_modalidad')::varchar) THEN
      PERFORM public.f_post_tb_compensacion_asignacion_cambio(
        p_id_colaborador:=colaborador,p_id_cargo:=(p_datos->>'p_id_cargo')::bigint,
        p_id_sucursal:=(p_datos->>'p_id_sucursal')::bigint,
        p_id_plan:=(p_datos->>'p_id_plan')::bigint,p_fecha_inicio:=desde,
        p_modalidad:=(p_datos->>'p_modalidad')::varchar);
    END IF;
  END IF;
  -- Cuentas de depósito, sueldo, jornada e importes individuales ya no existen.
  RETURN resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_colaborador_mes_validar(p_mes date, p_codigo text, p_id_colaborador bigint, p_justificacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  ctx jsonb; evaluacion jsonb; candidato jsonb; mes date; fin date; v_codigo text:=upper(btrim(p_codigo));
  asignacion public.tb_compensacion_asignacion%ROWTYPE; regla public.tb_compensacion_regla%ROWTYPE;
  concepto bigint; tipo bigint; actor bigint; clave text; existente public.tb_compensacion_evento%ROWTYPE;
  nuevo public.tb_compensacion_evento%ROWTYPE; razon text:=nullif(btrim(p_justificacion),'');
BEGIN
  IF p_mes IS NULL OR p_id_colaborador IS NULL THEN RAISE EXCEPTION 'Mes y colaborador obligatorios'; END IF;
  IF v_codigo NOT IN ('COLABORADOR_MES_ATENCIONES','COLABORADOR_MES_CALIFICACIONES') THEN RAISE EXCEPTION 'Reconocimiento no permitido'; END IF;
  ctx:=public.f_private_compensacion_contexto('EVIDENCIAS','CONSULTAR');
  actor:=(ctx->>'id_usuario')::bigint;
  IF NOT coalesce((ctx->>'es_super_admin')::boolean,false)
     AND NOT EXISTS(SELECT 1 FROM public.tb_usuario u WHERE u.id=actor AND u.id_rol=1) THEN
    RAISE EXCEPTION 'Solo administración puede validar la selección mensual';
  END IF;
  mes:=date_trunc('month',p_mes)::date; fin:=(mes+interval '1 month - 1 day')::date;
  clave:='COLABORADOR_MES:'||v_codigo||':'||mes::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(clave,0));
  SELECT * INTO existente FROM public.tb_compensacion_evento WHERE fuente='MANUAL' AND clave_origen=clave FOR UPDATE;
  IF existente.id IS NOT NULL THEN
    IF existente.id_colaborador_beneficiario=p_id_colaborador AND existente.estado_evento IN('APROBADO','LIQUIDADO') THEN
      RETURN jsonb_build_object('id_evento',existente.id,'estado',existente.estado_evento,
        'importe',existente.importe_aprobado,'idempotente',true);
    END IF;
    RAISE EXCEPTION 'Ya existe una decisión para este reconocimiento y mes; solicita una corrección auditada';
  END IF;

  evaluacion:=public.f_get_compensacion_colaborador_mes_admin(mes,v_codigo);
  IF evaluacion->>'estado' NOT IN ('PRESELECCION_VALIDABLE','DESEMPATE_ADMINISTRATIVO') THEN
    RAISE EXCEPTION 'No se valida el reconocimiento: completa la asistencia y revisa los datos del mes';
  END IF;
  SELECT value INTO candidato FROM jsonb_array_elements(evaluacion->'candidatos')
    WHERE (value->>'id_colaborador')::bigint=p_id_colaborador;
  IF candidato IS NULL OR coalesce((candidato->>'elegible')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'El colaborador no cumple la elegibilidad por puntualidad y disciplina';
  END IF;
  IF coalesce((candidato->>'es_preseleccionado')::boolean,false) IS NOT TRUE
     AND coalesce((candidato->>'requiere_desempate')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Solo se puede validar la preselección o resolver un empate del primer puesto';
  END IF;
  IF coalesce((candidato->>'requiere_desempate')::boolean,false) AND length(coalesce(razon,''))<10 THEN
    RAISE EXCEPTION 'Justifica la resolución del empate (mínimo 10 caracteres)';
  END IF;
  SELECT a.* INTO asignacion FROM public.tb_compensacion_asignacion a
    JOIN public.tb_estado e ON e.id=a.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE a.id_colaborador=p_id_colaborador AND a.fecha_inicio<=fin AND (a.fecha_fin IS NULL OR a.fecha_fin>=mes)
    ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1;
  SELECT c.id INTO concepto FROM public.tb_compensacion_concepto c WHERE c.codigo=
    CASE WHEN v_codigo='COLABORADOR_MES_ATENCIONES' THEN 'BONO_COLABORADOR_ATENCIONES' ELSE 'BONO_COLABORADOR_CALIFICACIONES' END;
  SELECT rx.* INTO regla FROM public.f_private_compensacion_reglas_colaborador_fecha(asignacion.id_plan,fin,p_id_colaborador) rx
    JOIN public.tb_estado e ON e.id=rx.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE rx.id_concepto=concepto AND rx.tipo_calculo='FIJO' AND rx.monto>0
      AND (rx.id_cargo IS NULL OR rx.id_cargo=asignacion.id_cargo)
      AND (rx.id_sucursal IS NULL OR rx.id_sucursal=asignacion.id_sucursal)
    ORDER BY ((rx.id_cargo IS NOT NULL)::int+(rx.id_sucursal IS NOT NULL)::int) DESC,rx.prioridad DESC,rx.id DESC LIMIT 1;
  IF regla.id IS NULL OR concepto IS NULL THEN RAISE EXCEPTION 'No hay tarifa fija vigente para este reconocimiento'; END IF;
  SELECT t.id INTO tipo FROM public.tb_compensacion_evento_tipo t
    JOIN public.tb_estado e ON e.id=t.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE t.codigo=v_codigo AND t.id_concepto=concepto;
  IF tipo IS NULL THEN RAISE EXCEPTION 'No está habilitado el tipo de reconocimiento mensual'; END IF;
  INSERT INTO public.tb_compensacion_evento(
    id_tipo_evento,id_colaborador_beneficiario,id_sucursal_origen,fecha_evento,periodo_imputacion,
    fuente,clave_origen,titulo,descripcion,datos,evidencia,criterios_validacion_snapshot,
    estado_evento,id_regla_aplicada,base_calculo,cantidad,tarifa_aplicada,importe_aprobado,id_usuario_registra
  ) VALUES(
    tipo,p_id_colaborador,asignacion.id_sucursal,(fin::timestamp+interval '12 hours') AT TIME ZONE 'America/Lima',mes,
    'MANUAL',clave,'Colaborador del mes',razon,
    jsonb_build_object('codigo',v_codigo,'mes',mes,'candidato',candidato,'criterio',evaluacion->>'criterio_principal',
      'desempate',evaluacion->>'desempate','puntualidad',candidato->>'estado_puntualidad'),
    jsonb_build_array(jsonb_build_object('tipo','CALCULO_MENSUAL','fuente',
      CASE WHEN v_codigo='COLABORADOR_MES_ATENCIONES' THEN 'ATENCIONES_WEB_Y_ASISTENCIA' ELSE 'CALIFICACIONES_PRESENCIALES_Y_ASISTENCIA' END)),
    to_jsonb(regla)||jsonb_build_object('seleccion_snapshot',evaluacion,'justificacion_desempate',razon),
    'APROBADO',regla.id,1,1,regla.monto,regla.monto,actor
  ) RETURNING * INTO nuevo;
  INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
    VALUES(nuevo.id,1,'VALIDACION_COLABORADOR_MES','APROBADO',razon,actor,
      jsonb_build_object('candidato',candidato,'criterios',evaluacion,'regla',to_jsonb(regla)));
  RETURN jsonb_build_object('id_evento',nuevo.id,'estado',nuevo.estado_evento,'importe',nuevo.importe_aprobado,'idempotente',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_condicion_mes(p_id_periodo bigint, p_id_colaborador bigint, p_codigo_condicion text, p_cumple boolean, p_nota text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_actor bigint;
  v_codigo text := upper(btrim(coalesce(p_codigo_condicion, '')));
BEGIN
  v_actor := public.f_private_compensacion_bonos_mes_admin();
  IF v_codigo NOT IN ('PUNTUALIDAD','META_AREA_15_DIAS') THEN RAISE EXCEPTION 'Condición inválida'; END IF;
  IF p_cumple IS NULL THEN RAISE EXCEPTION 'Indica si cumple la condición'; END IF;
  PERFORM 1 FROM public.tb_compensacion_periodo WHERE id = p_id_periodo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Periodo inexistente'; END IF;
  IF public.f_private_compensacion_reporte_mes_confirmado(p_id_periodo) THEN
    RAISE EXCEPTION 'El reporte del mes está confirmado; reabrirlo antes de cambiar condiciones';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.f_private_compensacion_bonos_mes_colaboradores(p_id_periodo) c WHERE c.id_colaborador = p_id_colaborador) THEN
    RAISE EXCEPTION 'El colaborador no tiene asignación en el periodo';
  END IF;
  INSERT INTO public.tb_compensacion_condicion_mes(id_periodo, id_colaborador, codigo_condicion, cumple, nota, id_usuario_registra)
  VALUES (p_id_periodo, p_id_colaborador, v_codigo, p_cumple, nullif(btrim(coalesce(p_nota, '')), ''), v_actor)
  ON CONFLICT (id_periodo, id_colaborador, codigo_condicion) DO UPDATE
    SET cumple = EXCLUDED.cumple, nota = EXCLUDED.nota, id_usuario_registra = EXCLUDED.id_usuario_registra, fecha_actualizacion = now();
  RETURN jsonb_build_object('id_periodo', p_id_periodo, 'id_colaborador', p_id_colaborador, 'codigo_condicion', v_codigo, 'cumple', p_cumple);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_configuracion_guardar(p_id_plan_version bigint, p_cambios jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_contexto jsonb; v_plan bigint; v_resultado jsonb; v_reglas jsonb;
  v_penalidades jsonb;
  v_desde date := (statement_timestamp() AT TIME ZONE 'America/Lima')::date;
  v_id bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('CONFIGURACION', 'CONFIGURAR');
  SELECT p.id INTO v_plan FROM public.tb_compensacion_plan p
  JOIN public.tb_compensacion_plan_version pv ON pv.id_plan = p.id
  WHERE pv.id = p_id_plan_version AND p.codigo = 'PLAN_COMPENSACIONES_GENERAL'
  FOR UPDATE OF p;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'Configuracion no disponible'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.tb_compensacion_periodo pe
    WHERE v_desde BETWEEN pe.fecha_inicio AND pe.fecha_fin
      AND pe.estado_periodo IN ('APROBADO', 'CERRADO')
  ) THEN RAISE EXCEPTION 'El periodo de aplicacion ya esta aprobado o cerrado'; END IF;
  v_resultado := public.f_post_compensacion_parametros_guardar(p_id_plan_version, p_cambios);
  -- SQL207: «Auditoria Activa» es el bono a quien reporta. Se copia a las penalidades antes de tomar la foto;
  -- lo ya registrado conserva su importe.
  UPDATE public.tb_compensacion_penalidad_tipo pt
  SET monto_bono_reportante = x.monto, fecha_actualizacion = now()
  FROM (
    SELECT r.monto FROM public.tb_compensacion_regla r
    JOIN public.tb_compensacion_concepto co ON co.id = r.id_concepto AND co.codigo = 'COMISION_AUDITORIA_ACTIVA'
    JOIN public.tb_compensacion_cargo ca ON ca.id = r.id_cargo AND ca.codigo = 'JEFE_TIENDA'
    JOIN public.tb_estado er ON er.id = r.id_estado AND UPPER(er.nombre) = 'ACTIVO'
    WHERE r.id_plan_version = p_id_plan_version AND r.monto IS NOT NULL
    ORDER BY r.prioridad DESC, r.id DESC LIMIT 1
  ) x, public.tb_compensacion_concepto cb
  WHERE cb.codigo = 'BONO_REPORTE_INCIDENCIA' AND pt.id_concepto_bono_reportante = cb.id
    AND pt.id_plan_version = p_id_plan_version AND pt.monto_bono_reportante IS NOT NULL
    AND pt.monto_bono_reportante IS DISTINCT FROM x.monto;
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb) INTO v_reglas
  FROM public.tb_compensacion_regla r
  JOIN public.tb_estado er ON er.id = r.id_estado AND UPPER(er.nombre) = 'ACTIVO'
  WHERE r.id_plan_version = p_id_plan_version;
  SELECT COALESCE(jsonb_agg(to_jsonb(pt) ORDER BY pt.id), '[]'::jsonb) INTO v_penalidades
  FROM public.tb_compensacion_penalidad_tipo pt WHERE pt.id_plan_version = p_id_plan_version;
  IF NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_regla r JOIN public.tb_estado e ON e.id = r.id_estado
    WHERE r.id_plan_version = p_id_plan_version AND UPPER(e.nombre) = 'ACTIVO'
  ) THEN RAISE EXCEPTION 'Agrega tarifas antes de guardar la configuracion'; END IF;
  SELECT ce.id INTO v_id FROM public.tb_compensacion_configuracion_efectiva ce
  WHERE ce.id_plan = v_plan AND ce.fecha_desde = v_desde AND ce.reglas_snapshot = v_reglas
    AND ce.penalidades_snapshot = v_penalidades
  ORDER BY ce.id DESC LIMIT 1;
  IF v_id IS NULL OR EXISTS (
    SELECT 1 FROM public.tb_compensacion_configuracion_efectiva ce
    WHERE ce.id_plan = v_plan AND ce.fecha_desde = v_desde AND ce.id > v_id
  ) THEN
    INSERT INTO public.tb_compensacion_configuracion_efectiva
      (id_plan, id_plan_version_origen, fecha_desde, reglas_snapshot, penalidades_snapshot, id_usuario)
    VALUES (v_plan, p_id_plan_version, v_desde, v_reglas, v_penalidades, (v_contexto->>'id_usuario')::bigint)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_resultado || jsonb_build_object('tarifas_desde', v_desde, 'id_guardado', v_id,
    'horarios_desde', CASE WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_cambios) x
      WHERE x->>'tipo' IN ('ENTRADA','SALIDA','TOLERANCIA','REFRIGERIO')
    ) THEN v_desde ELSE NULL END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_configuracion_preparar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_contexto jsonb; v_plan bigint; v_origen bigint; v_destino bigint; v_actor bigint;
BEGIN
  v_contexto:=public.f_private_compensacion_contexto('CONFIGURACION','CONFIGURAR');
  v_actor:=(v_contexto->>'id_usuario')::bigint;
  SELECT p.id INTO v_plan FROM public.tb_compensacion_plan p
  JOIN public.tb_estado e ON e.id=p.id_estado AND upper(e.nombre)='ACTIVO'
  WHERE p.codigo='PLAN_COMPENSACIONES_GENERAL' FOR UPDATE OF p;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'No hay configuracion general disponible'; END IF;
  SELECT id INTO v_destino FROM public.tb_compensacion_plan_version
  WHERE id_plan=v_plan AND estado_version='BORRADOR' ORDER BY numero_version DESC,id DESC LIMIT 1;
  IF v_destino IS NOT NULL THEN RETURN jsonb_build_object('id_configuracion',v_destino,'creada',false); END IF;
  SELECT ce.id_plan_version_origen INTO v_origen FROM public.tb_compensacion_configuracion_efectiva ce
  WHERE ce.id_plan=v_plan ORDER BY ce.fecha_desde DESC,ce.id DESC LIMIT 1;
  IF v_origen IS NULL THEN
    SELECT id INTO v_origen FROM public.tb_compensacion_plan_version
    WHERE id_plan=v_plan AND estado_version='PUBLICADA'
      AND fecha_inicio<=(statement_timestamp() AT TIME ZONE 'America/Lima')::date
      AND (fecha_fin IS NULL OR fecha_fin>=(statement_timestamp() AT TIME ZONE 'America/Lima')::date)
    ORDER BY numero_version DESC,id DESC LIMIT 1;
  END IF;
  IF v_origen IS NULL THEN RAISE EXCEPTION 'Falta una configuracion inicial para copiar'; END IF;
  INSERT INTO public.tb_compensacion_plan_version(id_plan,numero_version,nombre,fecha_inicio,estado_version,observacion,id_usuario)
  SELECT v_plan,COALESCE(max(numero_version),0)+1,'Parametros de la empresa',
    (statement_timestamp() AT TIME ZONE 'America/Lima')::date,'BORRADOR','Catalogo interno de configuracion simple',v_actor
  FROM public.tb_compensacion_plan_version WHERE id_plan=v_plan RETURNING id INTO v_destino;
  INSERT INTO public.tb_compensacion_regla(id_plan_version,id_concepto,id_cargo,id_sucursal,tipo_calculo,monto,porcentaje,valor_minimo,valor_maximo,tope_importe,prioridad,configuracion,id_estado,id_usuario)
  SELECT v_destino,id_concepto,id_cargo,id_sucursal,tipo_calculo,monto,porcentaje,valor_minimo,valor_maximo,tope_importe,prioridad,configuracion,id_estado,v_actor
  FROM public.tb_compensacion_regla WHERE id_plan_version=v_origen;
  INSERT INTO public.tb_compensacion_penalidad_tipo(id_plan_version,codigo,nombre,descripcion,id_cargo,id_concepto_descuento,id_concepto_bono_reportante,monto_referencia,monto_bono_reportante,requiere_respuesta,configuracion,id_estado,id_usuario)
  SELECT v_destino,codigo,nombre,descripcion,id_cargo,id_concepto_descuento,id_concepto_bono_reportante,monto_referencia,monto_bono_reportante,requiere_respuesta,configuracion,id_estado,v_actor
  FROM public.tb_compensacion_penalidad_tipo WHERE id_plan_version=v_origen;
  INSERT INTO public.tb_compensacion_meta_sede(id_plan_version,id_sucursal,codigo_indicador,periodo,valor_meta,unidad,configuracion,id_estado,id_usuario)
  SELECT v_destino,id_sucursal,codigo_indicador,periodo,valor_meta,unidad,configuracion,id_estado,v_actor
  FROM public.tb_compensacion_meta_sede WHERE id_plan_version=v_origen;
  RETURN jsonb_build_object('id_configuracion',v_destino,'creada',true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_descuento_mes(p_id_periodo bigint, p_id_colaborador bigint, p_tipo_origen text, p_tipo text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_actor bigint;
  v_origen text := upper(btrim(coalesce(p_tipo_origen, '')));
  v_tipo text := upper(btrim(coalesce(p_tipo, '')));
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_pct numeric;
  v_base numeric;
  v_concepto bigint;
  v_id bigint;
BEGIN
  v_actor := public.f_private_compensacion_bonos_mes_admin();
  IF v_origen NOT IN ('ERROR_CUADRO','TOLERANCIA_CERO_DIGITAL') THEN RAISE EXCEPTION 'Origen de descuento inválido'; END IF;
  IF v_tipo NOT IN ('BLOQUE_30','BLOQUE_60','BLOQUE_90','TOTAL') THEN RAISE EXCEPTION 'Tipo de descuento inválido'; END IF;
  IF v_origen = 'TOLERANCIA_CERO_DIGITAL' AND v_tipo <> 'TOTAL' THEN RAISE EXCEPTION 'Tolerancia Cero Digital solo admite descuento total'; END IF;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'El motivo es obligatorio'; END IF;
  PERFORM 1 FROM public.tb_compensacion_periodo WHERE id = p_id_periodo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Periodo inexistente'; END IF;
  IF public.f_private_compensacion_reporte_mes_confirmado(p_id_periodo) THEN
    RAISE EXCEPTION 'El reporte del mes está confirmado; reabrirlo antes de cambiar descuentos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.f_private_compensacion_bonos_mes_colaboradores(p_id_periodo) c WHERE c.id_colaborador = p_id_colaborador) THEN
    RAISE EXCEPTION 'El colaborador no tiene asignación en el periodo';
  END IF;
  IF v_tipo <> 'TOTAL' AND EXISTS (SELECT 1 FROM public.tb_compensacion_descuento_mes d
      WHERE d.id_periodo = p_id_periodo AND d.id_colaborador = p_id_colaborador AND d.estado = 'ACTIVO' AND d.tipo = 'TOTAL') THEN
    RAISE EXCEPTION 'Ya existe un descuento total; el total prevalece. Anúlalo antes de aplicar un bloque';
  END IF;
  IF v_tipo = 'TOTAL' AND EXISTS (SELECT 1 FROM public.tb_compensacion_descuento_mes d
      WHERE d.id_periodo = p_id_periodo AND d.id_colaborador = p_id_colaborador AND d.estado = 'ACTIVO' AND d.tipo = 'TOTAL') THEN
    RAISE EXCEPTION 'Ya existe un descuento total activo para el colaborador en el periodo';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tb_compensacion_descuento_mes d
      WHERE d.id_periodo = p_id_periodo AND d.id_colaborador = p_id_colaborador AND d.estado = 'ACTIVO' AND d.tipo_origen = v_origen) THEN
    RAISE EXCEPTION 'Ya existe un descuento activo de este origen; anúlalo para registrar otro';
  END IF;
  v_pct := CASE v_tipo WHEN 'BLOQUE_30' THEN 30 WHEN 'BLOQUE_60' THEN 60 WHEN 'BLOQUE_90' THEN 90 ELSE 100 END;
  SELECT coalesce(sum((l->>'importe')::numeric), 0) INTO v_base
  FROM jsonb_array_elements(public.f_private_compensacion_bonos_mes_calcular(p_id_periodo, p_id_colaborador)->'detalles') l
  WHERE l->>'categoria' = 'COMISION' AND l->>'naturaleza' = 'INGRESO';
  SELECT pt.id_concepto_descuento INTO v_concepto FROM public.tb_compensacion_penalidad_tipo pt
  WHERE pt.codigo = CASE v_origen WHEN 'TOLERANCIA_CERO_DIGITAL' THEN 'ATC_FRAUDE_DIGITAL' ELSE 'JEFE_ERROR_CUADRO' END
  ORDER BY pt.id DESC LIMIT 1;
  IF v_concepto IS NULL THEN
    SELECT id INTO v_concepto FROM public.tb_compensacion_concepto WHERE codigo = 'PENALIDAD_GENERICA' AND naturaleza = 'DESCUENTO';
  END IF;
  IF v_concepto IS NULL THEN RAISE EXCEPTION 'Falta el concepto de descuento'; END IF;
  INSERT INTO public.tb_compensacion_descuento_mes(id_periodo, id_colaborador, tipo_origen, tipo, porcentaje, importe_base,
      importe_descuento, id_concepto, motivo, id_usuario_registra)
  VALUES (p_id_periodo, p_id_colaborador, v_origen, v_tipo, v_pct, round(v_base, 2), round(v_base * v_pct / 100, 2),
      v_concepto, v_motivo, v_actor)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'tipo_origen', v_origen, 'tipo', v_tipo, 'porcentaje', v_pct,
    'importe_base', round(v_base, 2), 'importe_descuento', round(v_base * v_pct / 100, 2));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_equipo_incidencia_respuesta(p_id bigint, p_postura text, p_comentario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; usuario bigint; colaborador bigint; ev public.tb_compensacion_evento%ROWTYPE; texto text:=btrim(coalesce(p_comentario,''));
BEGIN
  ctx:=public.f_private_compensacion_contexto('INCIDENCIAS','REGISTRAR');
  IF (ctx->>'alcance')<>'SEDE' THEN RAISE EXCEPTION 'Esta respuesta corresponde a Jefatura de sede'; END IF;
  usuario:=(ctx->>'id_usuario')::bigint; colaborador:=nullif(ctx->>'id_colaborador','')::bigint;
  IF p_postura IS NULL OR p_postura NOT IN('CONFORME','DESCARGO') THEN RAISE EXCEPTION 'La postura debe ser CONFORME o DESCARGO'; END IF;
  IF length(texto)<10 THEN RAISE EXCEPTION 'Explica tu respuesta con al menos 10 caracteres'; END IF;
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id FOR UPDATE;
  IF ev.id IS NULL THEN RAISE EXCEPTION 'La incidencia no existe'; END IF;
  IF ev.estado_evento<>'PENDIENTE' THEN RAISE EXCEPTION 'Solo se responde una incidencia pendiente'; END IF;
  IF ev.id_usuario_registra=usuario OR ev.id_colaborador_responsable IS NOT DISTINCT FROM colaborador
     OR NOT public.f_private_compensacion_equipo_visible(ctx,ev.id_colaborador_responsable,(ev.fecha_evento AT TIME ZONE 'America/Lima')::date,false) THEN
    RAISE EXCEPTION 'Esta incidencia no esta dirigida a tu equipo';
  END IF;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=ev.periodo_imputacion AND estado_periodo='CERRADO') THEN
    RAISE EXCEPTION 'El periodo esta cerrado';
  END IF;
  UPDATE public.tb_compensacion_evento
  SET datos=datos||jsonb_build_object('respuesta_jefe_sede',jsonb_build_object('postura',p_postura,'comentario',texto,'id_usuario',usuario,'fecha',now()))
  WHERE id=ev.id;
  RETURN jsonb_build_object('id',ev.id,'postura',p_postura,'estado_evento',ev.estado_evento);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_evento_operacion_vincular(p_id_evento bigint, p_id_operacion bigint, p_pancake text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE ctx jsonb; ev public.tb_compensacion_evento%ROWTYPE; d jsonb; dni text;
BEGIN
  ctx:=public.f_private_compensacion_evento_validar_alcance(p_id_evento,'CONSULTAR',true);
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id_evento;
  IF ev.estado_evento NOT IN('BORRADOR','PENDIENTE') THEN RAISE EXCEPTION 'Solo se vinculan registros pendientes o en borrador'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=ev.periodo_imputacion AND estado_periodo='CERRADO')
    THEN RAISE EXCEPTION 'El periodo esta cerrado'; END IF;
  IF nullif(btrim(p_pancake),'') IS NULL OR length(btrim(p_pancake))>250 OR btrim(p_pancake) !~ '^https://[^[:space:]]+$'
    THEN RAISE EXCEPTION 'Ingresa el enlace HTTPS de la conversacion de Pancake (hasta 250 caracteres)'; END IF;
  dni:=coalesce(nullif(ev.datos->>'cliente_documento',''),nullif(ev.datos->>'numero_documento',''),
    (SELECT identificador_externo FROM public.tb_compensacion_evento_referencia WHERE id_evento=ev.id AND tipo_referencia='CLIENTE' ORDER BY id LIMIT 1));
  -- Reutiliza exactamente la misma autorizacion y elegibilidad que el buscador.
  d:=public.f_private_compensacion_atencion_operacion(p_id_operacion);
  PERFORM public.f_get_compensacion_evento_operaciones(ev.id,NULL,dni);
  IF d IS NULL OR NOT coalesce((d->>'pagada')::boolean,false) OR (d->>'id')::bigint IS DISTINCT FROM p_id_operacion OR d->>'dni' IS DISTINCT FROM dni
    THEN RAISE EXCEPTION 'La operacion no esta pagada, disponible o no corresponde al cliente'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia WHERE id_evento=ev.id AND tipo_referencia='OPERACION' AND id_operacion<>p_id_operacion)
    THEN RAISE EXCEPTION 'El registro ya tiene otra operacion vinculada; requiere revision administrativa'; END IF;
  INSERT INTO public.tb_compensacion_evento_referencia(id_evento,tipo_referencia,id_operacion,datos_snapshot,id_usuario)
    SELECT ev.id,'OPERACION',p_id_operacion,d,(ctx->>'id_usuario')::bigint
    WHERE NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia WHERE id_evento=ev.id AND tipo_referencia='OPERACION' AND id_operacion=p_id_operacion);
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia WHERE id_evento=ev.id AND tipo_referencia='PANCAKE' AND identificador_externo<>btrim(p_pancake))
    THEN RAISE EXCEPTION 'Ya existe una conversacion de Pancake vinculada'; END IF;
  INSERT INTO public.tb_compensacion_evento_referencia(id_evento,tipo_referencia,identificador_externo,datos_snapshot,id_usuario)
    SELECT ev.id,'PANCAKE',btrim(p_pancake),'{}',(ctx->>'id_usuario')::bigint
    WHERE NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia WHERE id_evento=ev.id AND tipo_referencia='PANCAKE' AND identificador_externo=btrim(p_pancake));
  UPDATE public.tb_compensacion_evento SET fecha_actualizacion=clock_timestamp(),
    datos=datos||jsonb_build_object('trazabilidad_operacion',d,'trazabilidad_usuario',(ctx->>'id_usuario')::bigint)
    WHERE id=ev.id;
  RETURN jsonb_build_object('id_evento',ev.id,'operacion',d,'pancake',btrim(p_pancake));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_facturacion_auditoria_anular(p_id bigint, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE ctx jsonb; ev public.tb_compensacion_evento%ROWTYPE; actor bigint; col bigint; paso integer;
BEGIN
  ctx:=public.f_private_compensacion_facturacion_auditoria_contexto('EDITAR');
  actor:=(ctx->>'id_usuario')::bigint; col:=(ctx->>'id_colaborador')::bigint;
  IF coalesce((ctx->>'es_admin')::boolean,false) THEN RAISE EXCEPTION 'Solo Facturacion anula sus propios reportes'; END IF;
  IF nullif(btrim(p_motivo),'') IS NULL OR length(btrim(p_motivo))<10 THEN
    RAISE EXCEPTION 'Explica el motivo de la anulacion con al menos 10 caracteres';
  END IF;
  ev:=public.f_private_compensacion_facturacion_auditoria_bloquear(p_id);
  IF ev.id_usuario_registra<>actor OR ev.id_colaborador_beneficiario IS DISTINCT FROM col THEN
    RAISE EXCEPTION 'Solo puedes anular tus reportes';
  END IF;
  SELECT coalesce(max(numero_paso),0)+1 INTO paso FROM public.tb_compensacion_evento_revision WHERE id_evento=p_id;
  INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
  VALUES(p_id,paso,'ANULACION','ANULADO',btrim(p_motivo),actor,jsonb_build_object('estado_anterior',ev.estado_evento));
  UPDATE public.tb_compensacion_evento SET estado_evento='ANULADO',fecha_actualizacion=clock_timestamp() WHERE id=p_id;
  RETURN (SELECT to_jsonb(e) FROM public.tb_compensacion_evento e WHERE e.id=p_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_facturacion_auditoria_guardar(p_tipo character varying, p_dni character varying, p_codigo_externo character varying, p_evidencia character varying, p_descripcion text, p_error character varying DEFAULT NULL::character varying, p_id_operacion bigint DEFAULT NULL::bigint, p_id bigint DEFAULT NULL::bigint, p_clave uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE ctx jsonb; ev public.tb_compensacion_evento%ROWTYPE; tipo public.tb_compensacion_evento_tipo%ROWTYPE;
  op jsonb; snap jsonb; asig public.tb_compensacion_asignacion%ROWTYPE;
  actor bigint; col bigint; mes date; instante timestamptz:=statement_timestamp(); clave text; datos_reporte jsonb;
BEGIN
  ctx:=public.f_private_compensacion_facturacion_auditoria_contexto(CASE WHEN p_id IS NULL THEN 'REGISTRAR' ELSE 'EDITAR' END);
  actor:=(ctx->>'id_usuario')::bigint; col:=(ctx->>'id_colaborador')::bigint;
  IF p_tipo IS NULL OR p_tipo NOT IN('DETECCION_ERROR_PAGO','OPERACION_EXTRA') OR p_dni IS NULL OR p_dni !~ '^[0-9]{8}$'
    OR nullif(btrim(p_descripcion),'') IS NULL OR length(p_descripcion)>4000
    OR length(coalesce(p_evidencia,''))>2000 THEN
    RAISE EXCEPTION 'Tipo, DNI y descripcion son obligatorios';
  END IF;
  IF p_tipo='DETECCION_ERROR_PAGO' AND (p_error IS NULL OR p_error NOT IN('MONTO','CUENTA') OR p_id_operacion IS NULL) THEN
    RAISE EXCEPTION 'Selecciona error de monto/cuenta y una operacion real';
  END IF;
  IF p_tipo='OPERACION_EXTRA' AND (public.f_private_compensacion_facturacion_auditoria_codigo(p_codigo_externo) IS NULL OR length(p_codigo_externo)>200) THEN
    RAISE EXCEPTION 'Operacion extra requiere codigo del comprobante externo';
  END IF;
  SELECT t.* INTO tipo FROM public.tb_compensacion_evento_tipo t JOIN public.tb_estado e ON e.id=t.id_estado
  WHERE t.codigo=p_tipo AND t.categoria='AUDITORIA_PAGO' AND upper(btrim(e.nombre))='ACTIVO';
  IF tipo.id_concepto IS NULL THEN RAISE EXCEPTION 'Tipo o concepto no configurado'; END IF;
  IF p_id IS NULL THEN
    IF (ctx->>'es_admin')::boolean THEN RAISE EXCEPTION 'El reporte debe registrarlo Facturacion en su propio nombre'; END IF;
    IF p_clave IS NULL THEN RAISE EXCEPTION 'Falta clave de registro'; END IF;
    clave:='FACTURACION_AUDITORIA:'||actor||':'||p_clave;
    PERFORM pg_advisory_xact_lock(hashtextextended(clave,0));
    SELECT * INTO ev FROM public.tb_compensacion_evento WHERE fuente='MANUAL' AND clave_origen=clave;
    IF ev.id IS NOT NULL THEN
      IF ev.datos->'solicitud' IS DISTINCT FROM jsonb_build_object('tipo',p_tipo,'dni',p_dni,'codigo',btrim(p_codigo_externo),
        'evidencia',btrim(p_evidencia),'descripcion',btrim(p_descripcion),'error',p_error,'operacion',p_id_operacion) THEN
        RAISE EXCEPTION 'La clave ya corresponde a otro reporte';
      END IF;
      RETURN to_jsonb(ev);
    END IF;
    mes:=date_trunc('month',instante AT TIME ZONE 'America/Lima')::date;
    PERFORM id FROM public.tb_compensacion_periodo WHERE periodo=mes ORDER BY id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=mes AND estado_periodo='CERRADO') THEN RAISE EXCEPTION 'Periodo cerrado'; END IF;
    SELECT * INTO asig FROM public.tb_compensacion_asignacion WHERE id=(ctx->>'id_asignacion')::bigint;
    snap:=public.f_private_compensacion_evento_tarifa_registro(tipo.id,col,instante);
    IF (snap->>'id_asignacion_registro')::bigint IS DISTINCT FROM asig.id THEN RAISE EXCEPTION 'La tarifa requiere la asignacion vigente de Facturacion'; END IF;
    IF snap#>>'{regla_registro,tipo_calculo}' NOT IN('FIJO','POR_UNIDAD') THEN RAISE EXCEPTION 'Tarifa de auditoria incompatible'; END IF;
    datos_reporte:=jsonb_build_object('flujo','FACTURACION_AUDITORIA_V1','cliente_documento',p_dni,'codigo_externo',btrim(p_codigo_externo),
      'error',p_error,'solicitud',jsonb_build_object('tipo',p_tipo,'dni',p_dni,'codigo',btrim(p_codigo_externo),
        'evidencia',btrim(p_evidencia),'descripcion',btrim(p_descripcion),'error',p_error,'operacion',p_id_operacion));
    IF p_tipo='OPERACION_EXTRA' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('facturacion:externo:'||p_dni||':'||public.f_private_compensacion_facturacion_auditoria_codigo(p_codigo_externo),0));
      IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento e WHERE e.datos->>'flujo'='FACTURACION_AUDITORIA_V1'
        AND e.datos->>'cliente_documento'=p_dni
        AND public.f_private_compensacion_facturacion_auditoria_codigo(e.datos->>'codigo_externo')=public.f_private_compensacion_facturacion_auditoria_codigo(p_codigo_externo)
        AND e.estado_evento NOT IN('RECHAZADO','ANULADO')) THEN RAISE EXCEPTION 'Comprobante ya reportado'; END IF;
      IF p_id_operacion IS NOT NULL THEN RAISE EXCEPTION 'Reporta la operacion extra antes de ingresarla al sistema'; END IF;
      IF EXISTS(SELECT 1 FROM public.tb_operacion_proceso o
        WHERE btrim(o.dni_cliente)=p_dni
          AND public.f_private_compensacion_facturacion_auditoria_codigo(o.codigo_operacion_deposito_cliente)=public.f_private_compensacion_facturacion_auditoria_codigo(p_codigo_externo)
          AND coalesce((public.f_private_compensacion_cliente_nuevo_operacion_estado(o.id)->>'es_final')::boolean,false)
          AND upper(btrim(o.nombre_estado)) IN('PENDIENTE','PAGADO')
          AND upper(btrim(coalesce(o.tipo_flujo_pago_deuda,''))) NOT IN('SOLICITUD','RETORNO','RETORNO_DIRECTO')
          AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso h WHERE h.id_operacion_padre=o.id)) THEN
        RAISE EXCEPTION 'El comprobante ya tiene una operacion real registrada; no es operacion extra';
      END IF;
    END IF;
    INSERT INTO public.tb_compensacion_evento(id_tipo_evento,id_colaborador_beneficiario,id_sucursal_origen,
      fecha_evento,periodo_imputacion,fuente,clave_origen,titulo,descripcion,datos,evidencia,criterios_validacion_snapshot,
      estado_evento,id_usuario_registra,fecha_registro)
    VALUES(tipo.id,col,asig.id_sucursal,instante,mes,'MANUAL',clave,tipo.nombre,btrim(p_descripcion),datos_reporte,
      jsonb_build_array(jsonb_build_object('evidencia',btrim(p_evidencia),'codigo_externo',btrim(p_codigo_externo),'fecha',instante)),
      snap,'PENDIENTE',actor,instante) RETURNING * INTO ev;
    INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,id_usuario_revisor)
      VALUES(ev.id,1,'FACTURACION_REGISTRO','ENVIADO',actor);
  ELSE
    ev:=public.f_private_compensacion_facturacion_auditoria_bloquear(p_id);
    IF NOT (ctx->>'es_admin')::boolean AND (ev.id_usuario_registra<>actor OR ev.id_colaborador_beneficiario IS DISTINCT FROM col) THEN
      RAISE EXCEPTION 'Solo puedes editar tus reportes';
    END IF;
    IF ev.id_tipo_evento<>tipo.id OR ev.datos->>'cliente_documento' IS DISTINCT FROM p_dni
      OR ev.datos->>'codigo_externo' IS DISTINCT FROM btrim(p_codigo_externo)
      OR ev.evidencia->0->>'evidencia' IS DISTINCT FROM btrim(p_evidencia)
      OR ev.datos->>'error' IS DISTINCT FROM p_error THEN RAISE EXCEPTION 'La identidad y evidencia inicial son inmutables'; END IF;
    IF (ctx->>'es_admin')::boolean AND ev.descripcion IS DISTINCT FROM btrim(p_descripcion) THEN
      RAISE EXCEPTION 'Administracion vincula y revisa; no reescribe la declaracion';
    END IF;
    UPDATE public.tb_compensacion_evento SET descripcion=btrim(p_descripcion),fecha_actualizacion=now() WHERE id=ev.id;
  END IF;
  IF p_id_operacion IS NOT NULL THEN
    -- Bloquear operacion y raiz antes de releer su estado real.
    PERFORM id FROM public.tb_operacion_proceso WHERE id=p_id_operacion OR id=(SELECT id_operacion_padre FROM public.tb_operacion_proceso WHERE id=p_id_operacion) ORDER BY id FOR UPDATE;
    op:=public.f_private_compensacion_facturacion_auditoria_operacion(p_id_operacion,p_dni);
    IF op IS NULL THEN RAISE EXCEPTION 'Operacion inexistente, intermedia o de otro cliente'; END IF;
    IF p_tipo='OPERACION_EXTRA' AND (op->>'fecha_registro')::timestamptz<ev.fecha_registro THEN
      RAISE EXCEPTION 'La operacion extra debe registrarse despues del reporte';
    END IF;
    IF p_tipo='OPERACION_EXTRA' AND public.f_private_compensacion_facturacion_auditoria_codigo(op->>'codigo')
      IS DISTINCT FROM public.f_private_compensacion_facturacion_auditoria_codigo(ev.datos->>'codigo_externo') THEN
      RAISE EXCEPTION 'El codigo de la operacion debe coincidir con el comprobante externo';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('facturacion:operacion:'||p_tipo||':'||p_id_operacion,0));
    IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia r JOIN public.tb_compensacion_evento e ON e.id=r.id_evento
      WHERE r.id_operacion=p_id_operacion AND e.id_tipo_evento=tipo.id AND e.id<>ev.id
      AND e.estado_evento NOT IN('RECHAZADO','ANULADO')) THEN RAISE EXCEPTION 'Operacion ya reportada para este concepto'; END IF;
    IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia WHERE id_evento=ev.id AND id_operacion IS NOT NULL AND id_operacion<>p_id_operacion) THEN
      RAISE EXCEPTION 'La operacion vinculada no se puede sustituir';
    END IF;
    INSERT INTO public.tb_compensacion_evento_referencia(id_evento,tipo_referencia,id_cliente,id_operacion,datos_snapshot,id_usuario)
      VALUES(ev.id,'OPERACION',(op->>'id_cliente')::bigint,p_id_operacion,op,actor) ON CONFLICT DO NOTHING;
    UPDATE public.tb_compensacion_evento SET datos=datos||jsonb_build_object('operacion',op,
      'momento_reporte',CASE WHEN p_tipo='OPERACION_EXTRA' THEN 'ANTES_REGISTRO' WHEN (op->>'pagada')::boolean THEN 'DESPUES_PAGO' ELSE 'ANTES_PAGO' END),
      fecha_actualizacion=now() WHERE id=ev.id AND NOT (datos ? 'operacion');
  END IF;
  RETURN (SELECT to_jsonb(e) FROM public.tb_compensacion_evento e WHERE e.id=ev.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_facturacion_auditoria_reabrir(p_id bigint, p_version timestamp with time zone, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE ctx jsonb; ev public.tb_compensacion_evento%ROWTYPE; mes date; paso integer;
BEGIN
 ctx:=public.f_private_compensacion_facturacion_auditoria_contexto('REVISAR');
 IF NOT coalesce((ctx->>'es_admin')::boolean,false) OR nullif(btrim(p_motivo),'') IS NULL THEN
   RAISE EXCEPTION 'Solo Administracion reabre con motivo obligatorio'; END IF;
 SELECT periodo_imputacion INTO mes FROM public.tb_compensacion_evento WHERE id=p_id;
 PERFORM id FROM public.tb_compensacion_periodo WHERE periodo=mes ORDER BY id FOR UPDATE;
 SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id FOR UPDATE;
 IF ev.id IS NULL OR ev.datos->>'flujo' IS DISTINCT FROM 'FACTURACION_AUDITORIA_V1' OR ev.estado_evento<>'APROBADO' THEN
   RAISE EXCEPTION 'Solo se reabre una auditoria aprobada no liquidada'; END IF;
 IF p_version IS NULL OR p_version IS DISTINCT FROM ev.fecha_actualizacion THEN RAISE EXCEPTION 'El reporte cambio; actualiza el listado'; END IF;
 IF ev.id_usuario_registra=(ctx->>'id_usuario')::bigint OR (ctx->>'id_colaborador')::bigint IN(ev.id_colaborador_beneficiario,ev.id_colaborador_responsable) THEN
   RAISE EXCEPTION 'La revision debe ser independiente del reportante y beneficiario'; END IF;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=mes AND estado_periodo IN('APROBADO','CERRADO')) OR EXISTS(SELECT 1 FROM public.tb_compensacion_reporte_mes rm JOIN public.tb_compensacion_periodo rp ON rp.id=rm.id_periodo WHERE rp.periodo=mes AND rm.estado='CONFIRMADO') THEN
   RAISE EXCEPTION 'El periodo esta consolidado; corresponde ajuste autorizado'; END IF;
 SELECT coalesce(max(numero_paso),0)+1 INTO paso FROM public.tb_compensacion_evento_revision WHERE id_evento=p_id;
 INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
 VALUES(p_id,paso,'ADMIN_FACTURACION','OBSERVADO',btrim(p_motivo),(ctx->>'id_usuario')::bigint,
   jsonb_build_object('accion','REAPERTURA','importe_aprobado_anterior',ev.importe_aprobado,'estado_anterior',ev.estado_evento));
 UPDATE public.tb_compensacion_evento SET estado_evento='PENDIENTE',importe_aprobado=NULL,id_regla_aplicada=NULL,
   base_calculo=NULL,cantidad=NULL,tarifa_aplicada=NULL,fecha_actualizacion=clock_timestamp() WHERE id=p_id;
 RETURN (SELECT to_jsonb(e) FROM public.tb_compensacion_evento e WHERE id=p_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_facturacion_auditoria_resolver(p_id bigint, p_decision character varying, p_comentario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE ctx jsonb; ev public.tb_compensacion_evento%ROWTYPE; tipo public.tb_compensacion_evento_tipo%ROWTYPE;
  regla public.tb_compensacion_regla%ROWTYPE; op jsonb; idop bigint; importe numeric; paso integer;
BEGIN
  ctx:=public.f_private_compensacion_facturacion_auditoria_contexto(CASE WHEN p_decision='APROBADO' THEN 'APROBAR' ELSE 'REVISAR' END);
  IF NOT (ctx->>'es_admin')::boolean THEN RAISE EXCEPTION 'Solo administracion revisa estos reportes'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN('APROBADO','RECHAZADO') OR coalesce(length(btrim(p_comentario)),0)<10 THEN
    RAISE EXCEPTION 'Decision y justificacion son obligatorias';
  END IF;
  ev:=public.f_private_compensacion_facturacion_auditoria_bloquear(p_id);
  IF ev.id_usuario_registra=(ctx->>'id_usuario')::bigint OR ev.id_colaborador_beneficiario=(ctx->>'id_colaborador')::bigint OR ev.id_colaborador_responsable=(ctx->>'id_colaborador')::bigint THEN
    RAISE EXCEPTION 'La revision debe ser independiente del reportante y beneficiario';
  END IF;
  SELECT * INTO tipo FROM public.tb_compensacion_evento_tipo WHERE id=ev.id_tipo_evento;
  IF p_decision='APROBADO' THEN
    SELECT id_operacion INTO idop FROM public.tb_compensacion_evento_referencia WHERE id_evento=ev.id AND tipo_referencia='OPERACION';
    IF idop IS NULL THEN RAISE EXCEPTION 'Vincula una operacion real antes de aprobar'; END IF;
    PERFORM id FROM public.tb_operacion_proceso WHERE id=idop OR id=(SELECT id_operacion_padre FROM public.tb_operacion_proceso WHERE id=idop) ORDER BY id FOR UPDATE;
    op:=public.f_private_compensacion_facturacion_auditoria_operacion(idop,ev.datos->>'cliente_documento');
    IF op IS NULL OR (tipo.codigo='OPERACION_EXTRA' AND (op->>'fecha_registro')::timestamptz<ev.fecha_registro) THEN
      RAISE EXCEPTION 'La operacion ya no acredita el reporte';
    END IF;
    IF tipo.codigo='OPERACION_EXTRA' AND public.f_private_compensacion_facturacion_auditoria_codigo(op->>'codigo')
      IS DISTINCT FROM public.f_private_compensacion_facturacion_auditoria_codigo(ev.datos->>'codigo_externo') THEN
      RAISE EXCEPTION 'El codigo de la operacion debe coincidir con el comprobante externo';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('facturacion:operacion:'||tipo.codigo||':'||idop,0));
    IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia r JOIN public.tb_compensacion_evento e ON e.id=r.id_evento
      WHERE r.id_operacion=idop AND e.id_tipo_evento=tipo.id AND e.id<>ev.id AND e.estado_evento IN('APROBADO','LIQUIDADO')) THEN
      RAISE EXCEPTION 'Operacion ya remunerada por este concepto';
    END IF;
    IF tipo.codigo='OPERACION_EXTRA' AND EXISTS(SELECT 1 FROM public.tb_operacion_proceso previa
      WHERE btrim(previa.dni_cliente)=ev.datos->>'cliente_documento' AND previa.id<>idop
        AND previa.fecha_registro<ev.fecha_registro
        AND public.f_private_compensacion_facturacion_auditoria_codigo(previa.codigo_operacion_deposito_cliente)
          =public.f_private_compensacion_facturacion_auditoria_codigo(ev.datos->>'codigo_externo')
        AND coalesce((public.f_private_compensacion_cliente_nuevo_operacion_estado(previa.id)->>'es_final')::boolean,false)
        AND upper(btrim(previa.nombre_estado)) IN('PENDIENTE','PAGADO')
        AND upper(btrim(coalesce(previa.tipo_flujo_pago_deuda,''))) NOT IN('SOLICITUD','RETORNO','RETORNO_DIRECTO')
        AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso h WHERE h.id_operacion_padre=previa.id)) THEN
      RAISE EXCEPTION 'El comprobante ya tenia una operacion antes del reporte; requiere regularizacion'; END IF;
    IF ev.criterios_validacion_snapshot->>'politica_tarifa' IS DISTINCT FROM 'REGISTRO_V1'
      OR (ev.criterios_validacion_snapshot->>'id_tipo_evento_registro')::bigint IS DISTINCT FROM tipo.id
      OR (ev.criterios_validacion_snapshot->>'id_beneficiario_registro')::bigint IS DISTINCT FROM ev.id_colaborador_beneficiario THEN
      RAISE EXCEPTION 'Snapshot de tarifa invalido';
    END IF;
    SELECT * INTO regla FROM jsonb_populate_record(NULL::public.tb_compensacion_regla,ev.criterios_validacion_snapshot->'regla_registro');
    IF regla.id IS NULL OR regla.id_concepto IS DISTINCT FROM tipo.id_concepto OR regla.tipo_calculo NOT IN('FIJO','POR_UNIDAD')
      OR regla.monto IS NULL OR regla.monto<0 OR (regla.valor_minimo IS NOT NULL AND regla.valor_minimo>1)
      OR (regla.valor_maximo IS NOT NULL AND regla.valor_maximo<1) THEN RAISE EXCEPTION 'Regla congelada incompatible'; END IF;
    importe:=round(least(regla.monto,coalesce(regla.tope_importe,regla.monto)),2);
  END IF;
  UPDATE public.tb_compensacion_evento SET estado_evento=p_decision,
    id_regla_aplicada=CASE WHEN p_decision='APROBADO' THEN regla.id END,
    base_calculo=CASE WHEN p_decision='APROBADO' THEN 0 END,cantidad=CASE WHEN p_decision='APROBADO' THEN 1 END,
    tarifa_aplicada=CASE WHEN p_decision='APROBADO' THEN regla.monto END,importe_aprobado=importe,
    fecha_actualizacion=now() WHERE id=ev.id;
  SELECT coalesce(max(numero_paso),0)+1 INTO paso FROM public.tb_compensacion_evento_revision WHERE id_evento=ev.id;
  INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
    VALUES(ev.id,paso,'ADMIN_FACTURACION',p_decision,btrim(p_comentario),(ctx->>'id_usuario')::bigint,
      jsonb_build_object('operacion_verificada',op,'importe_aprobado',importe,'pago_ejecutado',false));
  RETURN (SELECT to_jsonb(e) FROM public.tb_compensacion_evento e WHERE e.id=ev.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_incidencia_revision_admin(p_id bigint, p_version text, p_decision text, p_comentario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; mes date;
BEGIN
 ctx:=public.f_private_compensacion_incidencia_revision_admin(p_id);
 SELECT periodo_imputacion INTO mes FROM public.tb_compensacion_evento WHERE id=p_id;
 PERFORM id FROM public.tb_compensacion_periodo WHERE periodo=mes ORDER BY id FOR UPDATE;
 PERFORM id FROM public.tb_compensacion_evento WHERE id=p_id FOR UPDATE;
 PERFORM r.id FROM public.tb_compensacion_evento_referencia r WHERE r.id_evento=p_id ORDER BY r.id FOR SHARE;
 PERFORM o.id FROM public.tb_operacion_proceso o WHERE coalesce(o.id_operacion_padre,o.id) IN(SELECT coalesce(s.id_operacion_padre,s.id) FROM public.tb_compensacion_evento_referencia r JOIN public.tb_operacion_proceso s ON s.id=r.id_operacion WHERE r.id_evento=p_id) ORDER BY o.id FOR SHARE;
 ctx:=public.f_private_compensacion_incidencia_revision_admin(p_id);
 IF p_version IS NULL OR p_version IS DISTINCT FROM ctx->>'version' THEN RAISE EXCEPTION 'El expediente, descargo o fuente cambio; actualiza antes de decidir'; END IF;
 IF coalesce(length(btrim(p_comentario)),0)<10 THEN RAISE EXCEPTION 'Explica el motivo de la decision (minimo diez caracteres)'; END IF;
 IF p_decision NOT IN('APROBADO','RECHAZADO','OBSERVADO') OR p_decision IS NULL THEN RAISE EXCEPTION 'Decision invalida'; END IF;
 IF NOT (ctx->>'puede_revisar')::boolean OR (p_decision='APROBADO' AND NOT(ctx->>'puede_aprobar')::boolean) THEN RAISE EXCEPTION '%',ctx->>'motivo'; END IF;
 IF p_decision='OBSERVADO' THEN RETURN public.f_post_tb_compensacion_incidencia_observar(p_id,p_comentario); END IF;
 RETURN public.f_post_tb_compensacion_incidencia_resolver(p_id,p_decision::varchar,p_comentario);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_innovacion_implementar(p_id bigint, p_version timestamp with time zone, p_fecha date, p_evidencia text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE ctx jsonb; e public.tb_compensacion_evento%ROWTYPE; prueba jsonb; resultado jsonb;
BEGIN
  ctx:=public.f_private_compensacion_evento_validar_alcance(p_id,'APROBAR',true);
  SELECT * INTO STRICT e FROM public.tb_compensacion_evento WHERE id=p_id;
  IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_tipo WHERE id=e.id_tipo_evento AND codigo='PROPUESTA_INNOVACION') THEN
    RAISE EXCEPTION 'No corresponde a una propuesta de innovacion';
  END IF;
  PERFORM public.f_private_compensacion_innovacion_actor(e,ctx,'APROBAR');
  IF e.estado_evento<>'APROBADO' THEN RAISE EXCEPTION 'Primero debe aprobarse la propuesta'; END IF;
  IF p_fecha IS NULL OR p_fecha<(e.fecha_evento AT TIME ZONE 'America/Lima')::date
    OR p_fecha>(clock_timestamp() AT TIME ZONE 'America/Lima')::date THEN
    RAISE EXCEPTION 'Indique una fecha de implementacion valida';
  END IF;
  IF NULLIF(btrim(p_motivo),'') IS NULL THEN
    RAISE EXCEPTION 'La implementacion requiere motivo';
  END IF;
  -- Reintento exacto: devuelve el mismo resultado sin crear otra revision ni bono.
  IF public.f_private_compensacion_innovacion_comprobada(p_id) THEN
    prueba:=e.criterios_validacion_snapshot->'innovacion_implementacion';
    IF prueba->>'fecha'=p_fecha::text AND prueba->>'evidencia'=btrim(p_evidencia)
      AND prueba->>'motivo'=btrim(p_motivo) AND prueba->>'id_usuario'=ctx->>'id_usuario' THEN
      RETURN jsonb_build_object('id',p_id,'importe_aprobado',e.importe_aprobado,'comprobada',true,
        'economia',e.criterios_validacion_snapshot->'innovacion_economia');
    END IF;
    RAISE EXCEPTION 'La implementacion ya fue comprobada; no se puede sobrescribir';
  END IF;
  IF p_version IS NULL OR p_version IS DISTINCT FROM e.fecha_actualizacion THEN
    RAISE EXCEPTION 'La propuesta cambio; vuelva a abrir el detalle';
  END IF;
  prueba:=jsonb_build_object('politica','INNOVACION_IMPLEMENTADA_V1','fecha',p_fecha,
    'evidencia',btrim(p_evidencia),'motivo',btrim(p_motivo),'id_usuario',(ctx->>'id_usuario')::bigint,
    'fecha_revision',clock_timestamp());
  INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
    SELECT p_id,COALESCE(MAX(numero_paso),0)+1,'IMPLEMENTACION','APROBADO',btrim(p_motivo),
      (ctx->>'id_usuario')::bigint,prueba FROM public.tb_compensacion_evento_revision WHERE id_evento=p_id;
  UPDATE public.tb_compensacion_evento SET criterios_validacion_snapshot=criterios_validacion_snapshot ||
    jsonb_build_object('innovacion_implementacion',prueba),
    evidencia=evidencia || jsonb_build_array(jsonb_build_object('tipo','IMPLEMENTACION_INNOVACION','descripcion',btrim(p_evidencia),'fecha',p_fecha)),
    estado_evento='PENDIENTE' WHERE id=p_id;
  -- Reutiliza tarifa, regla, tope de Jefatura y auditoria del resolver existente.
  resultado:=public.f_post_tb_compensacion_evento_resolver(p_id,'APROBADO',p_motivo,0,1);
  -- El resolver valida la regla y aplica sus topes. Cero/parcial no deshace la
  -- constancia real ni autoriza completar el premio mediante otra solicitud.
  RETURN resultado || jsonb_build_object('comprobada',true,'economia',
    (SELECT criterios_validacion_snapshot->'innovacion_economia' FROM public.tb_compensacion_evento WHERE id=p_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_innovacion_implementar(p_id bigint, p_version timestamp with time zone, p_fecha date, p_evidencia text, p_motivo text, p_importe numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE ctx jsonb; e public.tb_compensacion_evento%ROWTYPE; prueba jsonb; resultado jsonb;
BEGIN
  ctx:=public.f_private_compensacion_evento_validar_alcance(p_id,'APROBAR',true);
  SELECT * INTO STRICT e FROM public.tb_compensacion_evento WHERE id=p_id;
  IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_tipo WHERE id=e.id_tipo_evento AND codigo='PROPUESTA_INNOVACION') THEN
    RAISE EXCEPTION 'No corresponde a una propuesta de innovacion';
  END IF;
  PERFORM public.f_private_compensacion_innovacion_actor(e,ctx,'APROBAR');
  -- SQL120: importe variable solo para Jefatura, positivo y con maximo dos decimales. Los topes de la regla
  -- y el acumulado mensual de Jefatura (meta + innovacion) los aplica el resolver.
  IF p_importe IS NOT NULL THEN
    IF p_importe<=0 OR p_importe>100000 OR round(p_importe,2)<>p_importe THEN
      RAISE EXCEPTION 'El importe debe ser mayor que cero y tener como maximo dos decimales';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion a
      JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='JEFE_TIENDA'
      JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
      WHERE a.id_colaborador=e.id_colaborador_beneficiario
        AND (e.fecha_evento AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)) THEN
      RAISE EXCEPTION 'El importe variable corresponde a la innovacion de Jefatura';
    END IF;
  END IF;
  IF e.estado_evento<>'APROBADO' THEN RAISE EXCEPTION 'Primero debe aprobarse la propuesta'; END IF;
  IF p_fecha IS NULL OR p_fecha<(e.fecha_evento AT TIME ZONE 'America/Lima')::date
    OR p_fecha>(clock_timestamp() AT TIME ZONE 'America/Lima')::date THEN
    RAISE EXCEPTION 'Indique una fecha de implementacion valida';
  END IF;
  IF NULLIF(btrim(p_motivo),'') IS NULL THEN
    RAISE EXCEPTION 'La implementacion requiere motivo';
  END IF;
  -- Reintento exacto: devuelve el mismo resultado sin crear otra revision ni bono.
  IF public.f_private_compensacion_innovacion_comprobada(p_id) THEN
    prueba:=e.criterios_validacion_snapshot->'innovacion_implementacion';
    IF prueba->>'fecha'=p_fecha::text AND prueba->>'evidencia'=btrim(p_evidencia)
      AND prueba->>'motivo'=btrim(p_motivo) AND prueba->>'id_usuario'=ctx->>'id_usuario'
      AND (prueba->>'importe_fijado')::numeric IS NOT DISTINCT FROM p_importe THEN
      RETURN jsonb_build_object('id',p_id,'importe_aprobado',e.importe_aprobado,'comprobada',true,
        'economia',e.criterios_validacion_snapshot->'innovacion_economia');
    END IF;
    RAISE EXCEPTION 'La implementacion ya fue comprobada; no se puede sobrescribir';
  END IF;
  IF p_version IS NULL OR p_version IS DISTINCT FROM e.fecha_actualizacion THEN
    RAISE EXCEPTION 'La propuesta cambio; vuelva a abrir el detalle';
  END IF;
  prueba:=jsonb_build_object('politica','INNOVACION_IMPLEMENTADA_V1','fecha',p_fecha,
    'evidencia',btrim(p_evidencia),'motivo',btrim(p_motivo),'id_usuario',(ctx->>'id_usuario')::bigint,
    'fecha_revision',clock_timestamp(),'importe_fijado',p_importe);
  INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
    SELECT p_id,COALESCE(MAX(numero_paso),0)+1,'IMPLEMENTACION','APROBADO',btrim(p_motivo),
      (ctx->>'id_usuario')::bigint,prueba FROM public.tb_compensacion_evento_revision WHERE id_evento=p_id;
  UPDATE public.tb_compensacion_evento SET criterios_validacion_snapshot=criterios_validacion_snapshot ||
    jsonb_build_object('innovacion_implementacion',prueba) ||
      CASE WHEN p_importe IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('innovacion_importe_fijado',p_importe) END,
    evidencia=evidencia || jsonb_build_array(jsonb_build_object('tipo','IMPLEMENTACION_INNOVACION','descripcion',btrim(p_evidencia),'fecha',p_fecha)),
    estado_evento='PENDIENTE' WHERE id=p_id;
  -- Reutiliza tarifa, regla, tope de Jefatura y auditoria del resolver existente.
  resultado:=public.f_post_tb_compensacion_evento_resolver(p_id,'APROBADO',p_motivo,0,1);
  -- El resolver valida la regla y aplica sus topes. Cero/parcial no deshace la
  -- constancia real ni autoriza completar el premio mediante otra solicitud.
  RETURN resultado || jsonb_build_object('comprobada',true,'economia',
    (SELECT criterios_validacion_snapshot->'innovacion_economia' FROM public.tb_compensacion_evento WHERE id=p_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_jefatura_incidencia_personal(p_id_responsable bigint, p_id_penalidad_tipo bigint, p_concepto character varying, p_fecha_evento timestamp with time zone, p_motivo text, p_evidencia jsonb, p_clave uuid, p_enviar boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  ctx jsonb; actor bigint; tipo bigint; clave text; solicitud jsonb; evento public.tb_compensacion_evento%ROWTYPE;
  resultado jsonb;
BEGIN
  ctx:=public.f_private_compensacion_contexto('INCIDENCIAS','REGISTRAR');
  actor:=(ctx->>'id_usuario')::bigint;
  IF NOT EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=actor AND id_rol=3 AND NOT coalesce(flag_super_admin,false)) THEN
    RAISE EXCEPTION 'Este registro corresponde exclusivamente a Jefatura';
  END IF;
  IF p_clave IS NULL OR p_concepto IS NULL OR p_concepto NOT IN('UNIFORME','INDISCIPLINA')
    OR p_fecha_evento IS NULL OR nullif(btrim(p_motivo),'') IS NULL THEN
    RAISE EXCEPTION 'Clave, concepto, fecha y motivo obligatorios';
  END IF;
  IF p_evidencia IS NULL OR jsonb_typeof(p_evidencia)<>'array' THEN RAISE EXCEPTION 'Evidencia invalida'; END IF;
  IF NOT public.f_private_compensacion_equipo_visible(ctx,p_id_responsable,(p_fecha_evento AT TIME ZONE 'America/Lima')::date,false) THEN
    RAISE EXCEPTION 'El responsable no pertenece a su equipo vigente';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_penalidad_tipo WHERE id=p_id_penalidad_tipo AND upper(codigo) LIKE '%'||p_concepto||'%') THEN
    RAISE EXCEPTION 'La penalidad no corresponde al concepto';
  END IF;
  clave:='JEFATURA_PERSONAL:'||actor::text||':'||p_clave::text;
  solicitud:=jsonb_build_object('responsable',p_id_responsable,'penalidad',p_id_penalidad_tipo,'concepto',p_concepto,
    'fecha',extract(epoch from p_fecha_evento),'motivo',btrim(p_motivo),'evidencia',p_evidencia);
  PERFORM pg_advisory_xact_lock(hashtextextended(clave,0));
  SELECT * INTO evento FROM public.tb_compensacion_evento WHERE fuente='MANUAL' AND clave_origen=clave AND id_usuario_registra=actor FOR UPDATE;
  IF evento.id IS NOT NULL THEN
    IF evento.datos->'solicitud_jefatura_personal' IS DISTINCT FROM solicitud THEN
      RAISE EXCEPTION 'La clave ya pertenece a otro contenido; consulta el reporte registrado';
    END IF;
  ELSE
    SELECT t.id INTO tipo FROM public.tb_compensacion_evento_tipo t JOIN public.tb_estado e ON e.id=t.id_estado
      WHERE t.codigo='REPORTE_PENALIDAD' AND upper(btrim(e.nombre))='ACTIVO' ORDER BY t.id LIMIT 1;
    IF tipo IS NULL THEN RAISE EXCEPTION 'El reporte personal no esta habilitado'; END IF;
    resultado:=public.f_post_tb_compensacion_incidencia(tipo,p_id_penalidad_tipo,p_id_responsable,p_fecha_evento,
      btrim(p_motivo),(ctx->>'id_colaborador')::bigint,NULL,p_evidencia,'[]'::jsonb,clave,'MANUAL');
    UPDATE public.tb_compensacion_evento SET datos=datos||jsonb_build_object('solicitud_jefatura_personal',solicitud)
      WHERE id=(resultado->>'id')::bigint RETURNING * INTO evento;
  END IF;
  IF coalesce(p_enviar,true) AND evento.estado_evento='BORRADOR' THEN
    PERFORM public.f_post_tb_compensacion_incidencia_enviar(evento.id,NULL);
    SELECT * INTO evento FROM public.tb_compensacion_evento WHERE id=evento.id;
  END IF;
  RETURN jsonb_build_object('id',evento.id,'estado_evento',evento.estado_evento);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_llamada(p_dni character varying, p_nombre character varying, p_clave uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
 SET "TimeZone" TO 'America/Lima'
AS $function$
DECLARE v_contexto jsonb; v_colaborador bigint; v_tipo bigint; v_evento jsonb;
  v_fecha timestamptz := now(); v_clave text; v_existente public.tb_compensacion_evento%ROWTYPE;
BEGIN
  v_contexto := public.f_private_compensacion_llamada_contexto('REGISTRAR');
  v_colaborador := NULLIF(v_contexto->>'id_colaborador','')::bigint;
  IF v_colaborador IS NULL THEN
    RAISE EXCEPTION 'Tu usuario no tiene un colaborador activo asociado. Solicita que vinculen tu cuenta.';
  END IF;
  IF p_dni IS NULL OR btrim(p_dni) !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'Ingresa un DNI de 8 dígitos'; END IF;
  IF p_nombre IS NULL OR length(btrim(p_nombre)) = 0 OR length(btrim(p_nombre)) > 200 THEN
    RAISE EXCEPTION 'Ingresa el nombre del cliente (máximo 200 caracteres)';
  END IF;
  IF p_clave IS NULL THEN RAISE EXCEPTION 'Falta la clave de registro'; END IF;
  v_clave := 'LLAMADA:' || (v_contexto->>'id_usuario') || ':' || p_clave::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_clave,0));
  SELECT * INTO v_existente FROM public.tb_compensacion_evento WHERE fuente='MANUAL' AND clave_origen=v_clave;
  IF FOUND THEN
    IF v_existente.datos->>'cliente_documento' IS DISTINCT FROM btrim(p_dni)
       OR v_existente.datos->>'cliente_nombre' IS DISTINCT FROM btrim(p_nombre) THEN
      RAISE EXCEPTION 'La clave de registro ya corresponde a otra llamada';
    END IF;
    RETURN jsonb_build_object('id',v_existente.id,'estado_evento',v_existente.estado_evento);
  END IF;
  SELECT t.id INTO v_tipo FROM public.tb_compensacion_evento_tipo t
    JOIN public.tb_estado e ON e.id=t.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE t.codigo='LLAMADA_CONTACTO' AND t.categoria='LLAMADA';
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'El registro de llamadas no está habilitado'; END IF;
  v_evento := public.f_post_tb_compensacion_evento(
    p_id_tipo_evento => v_tipo, p_fecha_evento => v_fecha,
    p_id_colaborador_beneficiario => v_colaborador,
    p_periodo_imputacion => date_trunc('month',v_fecha AT TIME ZONE 'America/Lima')::date,
    p_clave_origen => v_clave::varchar,
    p_datos => jsonb_build_object('cliente_documento',btrim(p_dni),'cliente_nombre',btrim(p_nombre)),
    -- Sustento estructurado de captura, no prueba externa ni aprobación automática.
    p_evidencia => jsonb_build_array(jsonb_build_object('tipo','REGISTRO_LLAMADA',
      'documento',btrim(p_dni),'nombre',btrim(p_nombre),'fecha',v_fecha,
      'id_usuario_registra',(v_contexto->>'id_usuario')::bigint)),
    p_referencias => jsonb_build_array(jsonb_build_object('tipo_referencia','CLIENTE',
      'identificador_externo',btrim(p_dni),'datos_snapshot',jsonb_build_object('documento',btrim(p_dni),'nombre',btrim(p_nombre))))
  );
  -- Ambas funciones se ejecutan dentro de la misma transacción RPC.
  RETURN public.f_post_tb_compensacion_evento_enviar((v_evento->>'id')::bigint);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_llamada_contacto(p_dni character varying, p_nombre character varying, p_clave uuid, p_celular text DEFAULT NULL::text, p_id_colaborador bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_ctx jsonb;
  v_key text;
  v_phone text := nullif(btrim(p_celular),'');
  v_old public.tb_compensacion_evento%ROWTYPE;
  v_result jsonb;
  v_cliente bigint;
BEGIN
  v_ctx:=public.f_private_compensacion_llamada_contexto('REGISTRAR');
  IF v_phone IS NOT NULL AND v_phone !~ '^[0-9]{7,15}$' THEN
    RAISE EXCEPTION 'Ingresa un celular de 7 a 15 digitos o dejalo vacio';
  END IF;
  IF p_clave IS NULL THEN RAISE EXCEPTION 'Falta la clave de registro'; END IF;
  v_key:='LLAMADA:'||(v_ctx->>'id_usuario')||':'||p_clave::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_key,0));
  SELECT * INTO v_old FROM public.tb_compensacion_evento WHERE fuente='MANUAL' AND clave_origen=v_key;
  -- La RPC existente valida identidad, beneficiario, sede, DNI, nombre e
  -- idempotencia, crea/actualiza tb_cliente y envía la llamada a revisión.
  v_result:=public.f_post_compensacion_llamada_registrar(p_dni,p_nombre,p_clave,p_id_colaborador);
  IF v_old.id IS NOT NULL THEN
    IF nullif(v_old.datos->>'cliente_celular','') IS DISTINCT FROM v_phone THEN
      RAISE EXCEPTION 'La clave ya corresponde a otra llamada o celular';
    END IF;
    RETURN v_result;
  END IF;
  SELECT ref.id_cliente INTO v_cliente FROM public.tb_compensacion_evento_referencia ref
  WHERE ref.id_evento=(v_result->>'id')::bigint AND ref.tipo_referencia='CLIENTE' ORDER BY ref.id LIMIT 1;
  IF v_cliente IS NULL THEN RAISE EXCEPTION 'No se pudo vincular el cliente de la llamada'; END IF;
  -- Vacío significa no informado: no elimina un celular existente.
  IF v_phone IS NOT NULL THEN
    PERFORM public.f_patch_tb_cliente(p_id=>v_cliente,p_celular=>v_phone::bigint);
  END IF;
  UPDATE public.tb_compensacion_evento SET datos=datos||jsonb_build_object('cliente_celular',v_phone)
  WHERE id=(v_result->>'id')::bigint;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_llamada_registrar(p_dni character varying, p_nombre character varying, p_clave uuid, p_id_colaborador bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
 SET "TimeZone" TO 'America/Lima'
AS $function$
DECLARE v_ctx jsonb; v_colaborador bigint; v_sede bigint; v_tipo bigint; v_clave text;
  v_cliente jsonb; v_cliente_id bigint; v_estado_cliente bigint;
  v_existente public.tb_compensacion_evento%ROWTYPE; v_evento jsonb; v_fecha timestamptz:=now();
BEGIN
  v_ctx:=public.f_private_compensacion_llamada_contexto('REGISTRAR');
  v_colaborador:=coalesce(p_id_colaborador,(v_ctx->>'id_colaborador')::bigint);
  IF v_colaborador IS NULL THEN RAISE EXCEPTION 'Selecciona el colaborador al que corresponde la llamada'; END IF;
  IF v_ctx->>'alcance'='PROPIO' AND v_colaborador IS DISTINCT FROM (v_ctx->>'id_colaborador')::bigint THEN
    RAISE EXCEPTION 'Solo puede registrar sus propias llamadas';
  END IF;
  IF p_dni IS NULL OR btrim(p_dni)!~'^[0-9]{8}$' THEN RAISE EXCEPTION 'Ingresa un DNI de 8 dígitos'; END IF;
  IF p_nombre IS NULL OR length(btrim(p_nombre)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Ingresa el nombre del cliente (máximo 200 caracteres)'; END IF;
  IF p_clave IS NULL THEN RAISE EXCEPTION 'Falta la clave de registro'; END IF;
  v_clave:='LLAMADA:'||(v_ctx->>'id_usuario')||':'||p_clave::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_clave,0));
  SELECT * INTO v_existente FROM public.tb_compensacion_evento WHERE fuente='MANUAL' AND clave_origen=v_clave;
  IF FOUND THEN
    IF v_existente.id_colaborador_beneficiario IS DISTINCT FROM v_colaborador
      OR v_existente.datos->>'cliente_documento' IS DISTINCT FROM btrim(p_dni)
      OR v_existente.datos->>'cliente_nombre' IS DISTINCT FROM btrim(p_nombre) THEN RAISE EXCEPTION 'La clave ya corresponde a otra llamada'; END IF;
    RETURN jsonb_build_object('id',v_existente.id,'estado_evento',v_existente.estado_evento);
  END IF;
  SELECT a.id_sucursal INTO v_sede FROM public.tb_compensacion_asignacion a
    JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
    JOIN public.tb_compensacion_colaborador c ON c.id=a.id_colaborador
    JOIN public.tb_estado ec ON ec.id=c.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
    WHERE a.id_colaborador=v_colaborador AND a.fecha_inicio<=v_fecha::date AND (a.fecha_fin IS NULL OR a.fecha_fin>=v_fecha::date)
    ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1;
  IF v_sede IS NULL THEN RAISE EXCEPTION 'El colaborador no tiene asignación laboral activa'; END IF;
  IF v_ctx->>'alcance'<>'GLOBAL' AND v_sede IS DISTINCT FROM (v_ctx->>'id_sucursal_alcance')::bigint THEN
    RAISE EXCEPTION 'Solo puede registrar llamadas de su sede';
  END IF;
  SELECT t.id INTO v_tipo FROM public.tb_compensacion_evento_tipo t JOIN public.tb_estado e ON e.id=t.id_estado
    WHERE t.codigo='LLAMADA_CONTACTO' AND t.categoria='LLAMADA' AND upper(btrim(e.nombre))='ACTIVO';
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'El registro de llamadas no está habilitado'; END IF;
  -- Cliente y llamada se guardan en la misma transacción. No modificar datos en un reintento ya registrado.
  PERFORM pg_advisory_xact_lock(hashtextextended('CLIENTE:DNI:'||btrim(p_dni),0));
  SELECT x INTO v_cliente FROM public.f_get_tb_cliente(p_tipo_documento=>1::bigint,p_numero_documento=>btrim(p_dni)::varchar) x
    WHERE x->>'numero_documento'=btrim(p_dni) LIMIT 1;
  IF v_cliente IS NULL THEN
    SELECT id INTO v_estado_cliente FROM public.tb_estado WHERE upper(btrim(nombre))='ACTIVO' ORDER BY id LIMIT 1;
    IF v_estado_cliente IS NULL THEN RAISE EXCEPTION 'Falta configurar el estado activo de clientes'; END IF;
    BEGIN
      v_cliente:=public.f_post_tb_cliente(p_tipo_documento=>1::bigint,p_numero_documento=>btrim(p_dni)::varchar,
        p_nombre=>btrim(p_nombre)::varchar,p_id_estado=>v_estado_cliente,p_id_usuario=>(v_ctx->>'id_usuario')::bigint);
    EXCEPTION WHEN unique_violation THEN
      -- Otro módulo puede haber creado el mismo documento sin tomar este bloqueo.
      SELECT x INTO v_cliente FROM public.f_get_tb_cliente(p_tipo_documento=>1::bigint,p_numero_documento=>btrim(p_dni)::varchar) x
        WHERE x->>'numero_documento'=btrim(p_dni) LIMIT 1;
      IF v_cliente IS NULL THEN RAISE; END IF;
    END;
  END IF;
  v_cliente_id:=(v_cliente->>'id')::bigint;
  IF v_cliente_id IS NULL THEN RAISE EXCEPTION 'No se pudo guardar el cliente'; END IF;
  IF v_cliente->>'nombre' IS DISTINCT FROM btrim(p_nombre) THEN
    PERFORM public.f_patch_tb_cliente(p_id=>v_cliente_id,p_nombre=>btrim(p_nombre)::varchar);
  END IF;
  v_evento:=public.f_post_tb_compensacion_evento(p_id_tipo_evento=>v_tipo,p_fecha_evento=>v_fecha,
    p_id_colaborador_beneficiario=>v_colaborador,p_id_sucursal_origen=>v_sede,p_clave_origen=>v_clave::varchar,
    p_datos=>jsonb_build_object('cliente_documento',btrim(p_dni),'cliente_nombre',btrim(p_nombre)),
    p_evidencia=>jsonb_build_array(jsonb_build_object('tipo','REGISTRO_LLAMADA','documento',btrim(p_dni),'nombre',btrim(p_nombre),'fecha',v_fecha)),
    p_referencias=>jsonb_build_array(jsonb_build_object('tipo_referencia','CLIENTE','id_cliente',v_cliente_id,'identificador_externo',btrim(p_dni),
      'datos_snapshot',jsonb_build_object('documento',btrim(p_dni),'nombre',btrim(p_nombre)))));
  RETURN public.f_post_tb_compensacion_evento_enviar((v_evento->>'id')::bigint);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_llamada_trazable(p_dni character varying, p_nombre character varying, p_clave uuid, p_celular text, p_id_colaborador bigint, p_evidencia text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE resultado jsonb;
BEGIN
 resultado:=public.f_post_compensacion_llamada_contacto(p_dni,p_nombre,p_clave,p_celular,p_id_colaborador);
 -- Compatibilidad con clientes antiguos que aun envian un enlace voluntariamente.
 IF nullif(btrim(p_evidencia),'') IS NOT NULL THEN
  PERFORM public.f_post_compensacion_atc_sustento((resultado->>'id')::bigint,p_evidencia,NULL);
 END IF;
 RETURN resultado;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_marketing_alerta_validar(p_id bigint, p_decision text, p_comentario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; e public.tb_compensacion_evento%ROWTYPE; actor bigint; col bigint; paso integer;
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN('APROBADO','RECHAZADO') THEN RAISE EXCEPTION 'Decision invalida'; END IF;
 IF length(btrim(coalesce(p_comentario,'')))<10 THEN RAISE EXCEPTION 'Explica tu decision con al menos 10 caracteres'; END IF;
 ctx:=public.f_private_compensacion_marketing_revisor(p_id,'CONSULTAR');
 IF coalesce((ctx->>'es_super_admin')::boolean,false) OR ctx->>'alcance' IS DISTINCT FROM 'SEDE' THEN RAISE EXCEPTION 'Validacion exclusiva de la Jefatura de la sede'; END IF;
 actor:=(ctx->>'id_usuario')::bigint;col:=nullif(ctx->>'id_colaborador','')::bigint;
 SELECT * INTO e FROM public.tb_compensacion_evento WHERE id=p_id FOR UPDATE;
 IF (SELECT codigo FROM public.tb_compensacion_evento_tipo WHERE id=e.id_tipo_evento)<>'ALERTA_TEMPRANA' THEN RAISE EXCEPTION 'Solo se valida Alerta Temprana'; END IF;
 IF e.id_usuario_registra=actor OR col IS NOT DISTINCT FROM e.id_colaborador_beneficiario OR col IS NOT DISTINCT FROM e.id_colaborador_responsable THEN RAISE EXCEPTION 'El hecho requiere un revisor independiente'; END IF;
 IF e.estado_evento<>'PENDIENTE' THEN RAISE EXCEPTION 'La alerta ya no esta pendiente'; END IF;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento_revision jr WHERE jr.id_evento=p_id AND jr.etapa='JEFE_TIENDA') THEN RAISE EXCEPTION 'La alerta ya fue validada'; END IF;
 IF p_decision='APROBADO' THEN PERFORM public.f_private_compensacion_marketing_validar(p_id); END IF;
 SELECT coalesce(max(numero_paso),0)+1 INTO paso FROM public.tb_compensacion_evento_revision WHERE id_evento=p_id;
 INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
 VALUES(p_id,paso,'JEFE_TIENDA',p_decision,btrim(p_comentario),actor,'{}'::jsonb);
 UPDATE public.tb_compensacion_evento SET estado_evento=CASE WHEN p_decision='RECHAZADO' THEN 'RECHAZADO' ELSE estado_evento END,fecha_actualizacion=clock_timestamp() WHERE id=p_id;
 RETURN jsonb_build_object('id',p_id,'decision',p_decision,'estado_evento',CASE WHEN p_decision='RECHAZADO' THEN 'RECHAZADO' ELSE 'PENDIENTE' END);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_marketing_campana(p_valores jsonb, p_clave uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; r public.tb_compensacion_marketing_campana%ROWTYPE; datos jsonb;
BEGIN
 BEGIN ctx:=public.f_private_compensacion_contexto('BONO:VIDEO_VIRAL','REGISTRAR');
 EXCEPTION WHEN raise_exception THEN ctx:=public.f_private_compensacion_contexto('BONO:RECUPERACION_CLIENTE','REGISTRAR'); END;
 IF coalesce((ctx->>'es_super_admin')::boolean,false) OR (ctx->>'id_colaborador') IS NULL THEN RAISE EXCEPTION 'Registra desde tu perfil de Marketing'; END IF;
 IF p_clave IS NULL OR jsonb_typeof(p_valores) IS DISTINCT FROM 'object' OR length(p_valores::text)>8000
 OR coalesce(length(btrim(p_valores->>'nombre')),0) NOT BETWEEN 3 AND 200
 OR coalesce(length(btrim(p_valores->>'descripcion')),0) NOT BETWEEN 3 AND 2000
 OR coalesce(p_valores->>'canal','') NOT IN('TIKTOK','INSTAGRAM','FACEBOOK','YOUTUBE','WHATSAPP','OTRO')
 OR coalesce(p_valores->>'fecha_inicio','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Completa nombre, descripcion, canal y fecha de inicio'; END IF;
 IF nullif(btrim(p_valores->>'evidencia'),'') IS NOT NULL AND (length(p_valores->>'evidencia')>2000 OR p_valores->>'evidencia' !~ '^https://[^[:space:]]+$') THEN RAISE EXCEPTION 'Evidencia HTTPS invalida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('MKT_CAMPANA:'||p_clave,0));
 SELECT * INTO r FROM public.tb_compensacion_marketing_campana WHERE clave=p_clave;
 datos:=jsonb_build_object('nombre',btrim(p_valores->>'nombre'),'descripcion',btrim(p_valores->>'descripcion'),'canal',p_valores->>'canal',
 'fecha_inicio',(p_valores->>'fecha_inicio')::date,'evidencia',nullif(btrim(p_valores->>'evidencia'),''));
 IF r.id IS NOT NULL THEN
  IF r.id_usuario<>(ctx->>'id_usuario')::bigint OR (to_jsonb(r)-ARRAY['id','id_usuario','id_colaborador','clave','fecha_registro']) IS DISTINCT FROM datos THEN RAISE EXCEPTION 'La clave pertenece a otra campana'; END IF;
 ELSE
  INSERT INTO public.tb_compensacion_marketing_campana(id_colaborador,id_usuario,clave,nombre,descripcion,canal,fecha_inicio,evidencia)
  VALUES((ctx->>'id_colaborador')::bigint,(ctx->>'id_usuario')::bigint,p_clave,datos->>'nombre',datos->>'descripcion',datos->>'canal',(datos->>'fecha_inicio')::date,datos->>'evidencia') RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('id',r.id,'nombre',r.nombre,'fecha_inicio',r.fecha_inicio,'fecha_registro',r.fecha_registro);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_marketing_captura(p_tipo text, p_valores jsonb, p_clave uuid, p_enviar boolean DEFAULT true, p_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$ DECLARE r jsonb; BEGIN
 r:=public.f_private_compensacion_marketing_captura_base(p_tipo,p_valores,p_clave,p_enviar,p_id);
 IF p_tipo='ALERTA_TEMPRANA' AND p_enviar THEN PERFORM public.f_private_compensacion_marketing_avisar((r->>'id')::bigint); END IF;
 RETURN r; END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_marketing_captura_eliminar(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; e public.tb_compensacion_evento%ROWTYPE; tipo text; actor bigint; paso integer;
BEGIN
 SELECT t.codigo INTO tipo FROM public.tb_compensacion_evento v JOIN public.tb_compensacion_evento_tipo t ON t.id=v.id_tipo_evento
  WHERE v.id=p_id AND v.datos->>'flujo'='MARKETING_CAPTURA_V1';
 IF tipo IS NULL THEN RAISE EXCEPTION 'El registro no existe'; END IF;
 ctx:=public.f_private_compensacion_contexto('BONO:'||tipo,'EDITAR');
 actor:=(ctx->>'id_usuario')::bigint;
 SELECT * INTO e FROM public.tb_compensacion_evento WHERE id=p_id FOR UPDATE;
 IF coalesce((ctx->>'es_super_admin')::boolean,false) OR e.id_usuario_registra IS DISTINCT FROM actor
  OR e.estado_evento NOT IN('BORRADOR','PENDIENTE') OR EXISTS(SELECT 1 FROM public.tb_compensacion_evento_revision jr WHERE jr.id_evento=p_id AND jr.etapa='JEFE_TIENDA') THEN RAISE EXCEPTION 'Solo puedes eliminar tu registro pendiente sin validar'; END IF;
 SELECT coalesce(max(numero_paso),0)+1 INTO paso FROM public.tb_compensacion_evento_revision WHERE id_evento=p_id;
 INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
 VALUES(p_id,paso,'ANULACION','ANULADO','Eliminado por su autor',actor,jsonb_build_object('estado_anterior',e.estado_evento));
 UPDATE public.tb_compensacion_evento SET estado_evento='ANULADO',fecha_actualizacion=clock_timestamp() WHERE id=p_id;
 RETURN jsonb_build_object('id',p_id,'estado_evento','ANULADO');
END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_marketing_revision(p_id bigint, p_decision text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; e public.tb_compensacion_evento%ROWTYPE; paso integer;
BEGIN
 ctx:=public.f_private_compensacion_marketing_revisor(p_id,'REVISAR');
 IF length(btrim(coalesce(p_motivo,'')))<10 THEN RAISE EXCEPTION 'Explica el motivo de revision (minimo diez caracteres)'; END IF;
 SELECT * INTO e FROM public.tb_compensacion_evento WHERE id=p_id;
 IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=e.periodo_imputacion) THEN RAISE EXCEPTION 'Abre el periodo antes de revisar'; END IF;
 PERFORM public.f_private_compensacion_pagos_periodo_editable(e.id_colaborador_beneficiario,e.periodo_imputacion);
 IF e.id_colaborador_responsable IS NOT NULL THEN PERFORM public.f_private_compensacion_pagos_periodo_editable(e.id_colaborador_responsable,e.periodo_imputacion); END IF;
 SELECT * INTO e FROM public.tb_compensacion_evento WHERE id=p_id FOR UPDATE;
 IF p_decision='ANULADO' THEN
  IF NOT coalesce((ctx->>'es_super_admin')::boolean,false) OR e.estado_evento NOT IN('APROBADO','PENDIENTE') THEN RAISE EXCEPTION 'Solo Administracion puede anular un caso no consolidado'; END IF;
  SELECT coalesce(max(numero_paso),0)+1 INTO paso FROM public.tb_compensacion_evento_revision WHERE id_evento=p_id;
  INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
  VALUES(p_id,paso,'ANULACION','ANULADO',btrim(p_motivo),(ctx->>'id_usuario')::bigint,jsonb_build_object('estado_anterior',e.estado_evento,'importe_anterior',e.importe_aprobado,'consecuencias_enlazadas',true));
  UPDATE public.tb_compensacion_evento SET estado_evento='ANULADO',fecha_actualizacion=clock_timestamp() WHERE id=p_id;
  RETURN jsonb_build_object('id',p_id,'estado_evento','ANULADO');
 END IF;
 IF p_decision NOT IN('APROBADO','RECHAZADO') THEN RAISE EXCEPTION 'Decision invalida'; END IF;
 RETURN public.f_post_tb_compensacion_evento_resolver(p_id,p_decision,p_motivo,0,1);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_mes_adjudicar(p_mes date, p_criterio text, p_version text, p_justificacion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE actor bigint; r jsonb; a public.tb_compensacion_mes_adjudicacion%ROWTYPE; c jsonb; n integer; i integer:=0;
 cent integer; tipo bigint; concepto bigint; eid bigint; BEGIN
 actor:=public.f_private_compensacion_pancake_actor();
 PERFORM pg_advisory_xact_lock(hashtextextended('PANCAKE:'||p_mes::text,0));
 SELECT * INTO a FROM public.tb_compensacion_mes_adjudicacion WHERE periodo=p_mes AND criterio=p_criterio;
 IF a.id IS NOT NULL THEN
 IF a.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Ya existe otra decisión mensual'; END IF;
 RETURN jsonb_build_object('id_adjudicacion',a.id,'idempotente',true,'snapshot',a.snapshot); END IF;
 PERFORM public.f_private_compensacion_pancake_abierto(p_mes);
 IF (now() AT TIME ZONE 'America/Lima')::date<p_mes+interval '1 month' OR length(btrim(coalesce(p_justificacion,'')))<10 THEN RAISE EXCEPTION 'Mes en curso o falta justificación'; END IF;
 -- Mantener las fuentes SQL estables hasta publicar la bolsa de diez mil céntimos.
 -- SHARE bloquea mutaciones concurrentes durante este corto cierre administrativo.
 LOCK TABLE public.tb_compensacion_evento,public.tb_compensacion_evento_referencia,
 public.tb_compensacion_asignacion,public.tb_compensacion_reporte_mes IN SHARE ROW EXCLUSIVE MODE;
 PERFORM public.f_private_compensacion_pancake_abierto(p_mes);
 r:=public.f_private_compensacion_mes_ranking(p_mes,p_criterio);
 IF r->>'estado'<>'LISTO' OR r->>'version' IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Fuentes pendientes o versión cambió; actualizar ranking'; END IF;
 SELECT t.id,t.id_concepto INTO tipo,concepto FROM public.tb_compensacion_evento_tipo t
 JOIN public.tb_compensacion_concepto co ON co.id=t.id_concepto
 WHERE t.codigo=CASE p_criterio WHEN 'ATENCIONES' THEN 'COLABORADOR_MES_ATENCIONES' ELSE 'COLABORADOR_MES_CALIFICACIONES' END
 AND co.codigo=CASE p_criterio WHEN 'ATENCIONES' THEN 'BONO_COLABORADOR_ATENCIONES' ELSE 'BONO_COLABORADOR_CALIFICACIONES' END;
 IF tipo IS NULL THEN RAISE EXCEPTION 'Falta catálogo del premio'; END IF;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento WHERE periodo_imputacion=p_mes AND id_tipo_evento=tipo) THEN
 RAISE EXCEPTION 'Hay premio previo, incluso anulado: conciliar antes de adjudicar'; END IF;
 SELECT count(*) INTO n FROM jsonb_array_elements(r->'candidatos') x WHERE x->>'puesto'='1';
 IF n<1 OR n>10000 THEN RAISE EXCEPTION 'Cantidad de ganadores inválida'; END IF;
 INSERT INTO public.tb_compensacion_mes_adjudicacion(periodo,criterio,version,snapshot,justificacion,id_usuario)
 VALUES(p_mes,p_criterio,p_version,r,p_justificacion,actor) RETURNING * INTO a;
 FOR c IN SELECT value FROM jsonb_array_elements(r->'candidatos') WHERE value->>'puesto'='1' ORDER BY (value->>'id_colaborador')::bigint LOOP
 cent:=10000/n+CASE WHEN i<10000%n THEN 1 ELSE 0 END; i:=i+1;
 INSERT INTO public.tb_compensacion_mes_premio VALUES(a.id,(c->>'id_colaborador')::bigint,cent);
 INSERT INTO public.tb_compensacion_evento(id_tipo_evento,id_colaborador_beneficiario,id_sucursal_origen,
 fecha_evento,periodo_imputacion,fuente,clave_origen,titulo,descripcion,datos,evidencia,criterios_validacion_snapshot,
 estado_evento,base_calculo,cantidad,tarifa_aplicada,importe_aprobado,id_usuario_registra)
 VALUES(tipo,(c->>'id_colaborador')::bigint,(c->>'id_sucursal')::bigint,
 ((p_mes+interval '1 month - 1 day')::timestamp+interval '12 hours') AT TIME ZONE 'America/Lima',p_mes,'IMPORTACION',
 'COLABORADOR_MES_79:'||a.id||':'||(c->>'id_colaborador'),'Colaborador del Mes',p_justificacion,
 jsonb_build_object('id_adjudicacion',a.id,'criterio',p_criterio),jsonb_build_array(jsonb_build_object('tipo','ADJUDICACION_MENSUAL','id',a.id)),r,
 'APROBADO',1,1,cent/100.0,cent/100.0,actor) RETURNING id INTO eid;
 INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
 VALUES(eid,1,'ADJUDICACION_MENSUAL','APROBADO',p_justificacion,actor,jsonb_build_object('id_adjudicacion',a.id,'centimos',cent));
 END LOOP;
 RETURN jsonb_build_object('id_adjudicacion',a.id,'ganadores',n,'total_centimos',10000,'estado','ADJUDICADO_NO_PAGADO');
END $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_meta_jefatura_resolver(p_id bigint, p_comentario text, p_cuotas_cumplidas boolean DEFAULT NULL::boolean, p_calidad_cumplida boolean DEFAULT NULL::boolean, p_sin_chats_descuidados boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_contexto jsonb;
BEGIN
  v_contexto:=public.f_private_compensacion_evento_validar_alcance(p_id,'APROBAR',true);
  IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento ev JOIN public.tb_compensacion_evento_tipo t ON t.id=ev.id_tipo_evento
    WHERE ev.id=p_id AND t.codigo='META_SEDE_SAFETYPAY' AND ev.estado_evento='PENDIENTE') THEN
    RAISE EXCEPTION 'Selecciona una evidencia pendiente de meta de jefatura';
  END IF;
  -- Parametros antiguos conservados por compatibilidad; no validan ni acreditan cuotas/calidad.
  IF p_sin_chats_descuidados IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Confirma ausencia de descuido de chats';
  END IF;
  UPDATE public.tb_compensacion_evento SET criterios_validacion_snapshot=criterios_validacion_snapshot||jsonb_build_object(
    'revision_meta_jefatura',jsonb_build_object('id_usuario',(v_contexto->>'id_usuario')::bigint,'fecha',now(),
      'politica','META_100_CHATS_V2','sin_chats_descuidados',p_sin_chats_descuidados,
      'metodo','DECLARACION_REVISOR_CON_EVIDENCIA')) WHERE id=p_id;
  RETURN public.f_post_tb_compensacion_evento_resolver(p_id,'APROBADO',p_comentario);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_meta_sede_revision(p_mes date, p_motivo text, p_enlace text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; usuario bigint; asignacion public.tb_compensacion_asignacion%ROWTYPE;
  mes date:=date_trunc('month',p_mes)::date; fecha date; tipo bigint; creado jsonb; evidencia jsonb;
BEGIN
  usuario:=public.f_private_compensacion_safetypay_usuario();
  IF NOT EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=usuario AND id_rol=3) THEN
    RAISE EXCEPTION 'La solicitud de revision corresponde a Jefatura'; END IF;
  ctx:=public.f_private_compensacion_contexto('BONO:META_SEDE_SAFETYPAY','REGISTRAR');
  IF mes IS NULL OR nullif(btrim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'Indica el mes y el motivo de revision'; END IF;
  IF nullif(btrim(p_enlace),'') IS NOT NULL AND btrim(p_enlace)!~ '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'El enlace de sustento debe ser HTTPS'; END IF;
  fecha:=least((now() AT TIME ZONE 'America/Lima')::date,(mes+interval '1 month - 1 day')::date);
  IF fecha<mes THEN RAISE EXCEPTION 'No se puede solicitar revision de un mes futuro'; END IF;
  SELECT a.* INTO asignacion FROM public.tb_compensacion_asignacion a
    JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='JEFE_TIENDA'
    JOIN public.tb_estado e ON e.id=a.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE a.id_colaborador=(ctx->>'id_colaborador')::bigint AND a.id_sucursal=(ctx->>'id_sucursal_alcance')::bigint
      AND a.fecha_inicio<=fecha AND (a.fecha_fin IS NULL OR a.fecha_fin>=fecha)
    ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1;
  IF asignacion.id IS NULL THEN RAISE EXCEPTION 'No tienes asignacion de Jefatura para este mes'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('meta-sede-revision:'||asignacion.id_colaborador||':'||mes,0));
  SELECT id INTO tipo FROM public.tb_compensacion_evento_tipo WHERE codigo='META_SEDE_SAFETYPAY';
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento WHERE id_tipo_evento=tipo
    AND id_colaborador_beneficiario=asignacion.id_colaborador AND periodo_imputacion=mes
    AND estado_evento IN('BORRADOR','PENDIENTE','APROBADO','LIQUIDADO')) THEN
    RAISE EXCEPTION 'Ya tienes una solicitud en curso o un bono aprobado para este mes; consulta Resultado'; END IF;
  -- El motivo es una declaracion del solicitante, nunca una verificacion de chats.
  evidencia:=jsonb_build_array(jsonb_build_object('tipo','SOLICITUD_REVISION','descripcion',btrim(p_motivo)));
  IF nullif(btrim(p_enlace),'') IS NOT NULL THEN evidencia:=evidencia||jsonb_build_array(jsonb_build_object('tipo','ENLACE','url',btrim(p_enlace))); END IF;
  creado:=public.f_post_tb_compensacion_evento(
    p_id_tipo_evento:=tipo,p_fecha_evento:=(fecha+time '12:00') AT TIME ZONE 'America/Lima',
    p_id_colaborador_beneficiario:=asignacion.id_colaborador,p_id_sucursal_origen:=asignacion.id_sucursal,
    p_periodo_imputacion:=mes,p_titulo:='Solicitud de Revision del Bono SafetyPay',
    p_descripcion:=btrim(p_motivo),p_datos:=jsonb_build_object('flujo','SOLICITUD_META_SEDE_V1'),
    p_evidencia:=evidencia);
  PERFORM public.f_post_tb_compensacion_evento_enviar((creado->>'id')::bigint,btrim(p_motivo));
  RETURN jsonb_build_object('id',creado->'id','estado','PENDIENTE');
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_pagos_cuadre(p_mes date, p_colaborador bigint, p_accion text, p_evidencia text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; mes date; actor bigint; col bigint; ev public.tb_compensacion_evento%ROWTYPE; usuario bigint; sede bigint; tipo bigint; v_fuente jsonb; tarifa jsonb; clave text;
BEGIN
 ctx:=public.f_private_compensacion_contexto('RESUMEN','CONSULTAR');
 IF coalesce((ctx->>'es_super_admin')::boolean,false) THEN PERFORM public.f_private_compensacion_contexto('AUDITORIA','CONSULTAR'); END IF;actor:=(ctx->>'id_usuario')::bigint;
 mes:=date_trunc('month',p_mes)::date;col:=p_colaborador;
 IF p_accion IS NULL OR p_accion NOT IN('SOLICITAR','APROBAR','RECHAZAR') OR mes IS NULL OR mes>date_trunc('month',now() AT TIME ZONE 'America/Lima')::date
  OR coalesce(length(btrim(p_motivo)),0) NOT BETWEEN 10 AND 2000 OR length(coalesce(p_evidencia,''))>2000 OR (nullif(p_evidencia,'') IS NOT NULL AND p_evidencia !~ '^https://[^[:space:]]+$') THEN
   RAISE EXCEPTION 'Accion, periodo, motivo obligatorios'; END IF;
 IF p_accion='SOLICITAR' THEN
  IF col IS DISTINCT FROM (ctx->>'id_colaborador')::bigint THEN RAISE EXCEPTION 'Solicita solamente tu cuadre'; END IF;
  PERFORM public.f_private_compensacion_pagos_perfil(col);
 ELSE
  IF NOT coalesce((ctx->>'es_super_admin')::boolean,false) THEN RAISE EXCEPTION 'La conciliacion requiere Administracion'; END IF;
 END IF;
 SELECT c.id_usuario INTO usuario FROM public.tb_compensacion_colaborador c JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=2 WHERE c.id=col;
 IF usuario IS NULL OR (p_accion<>'SOLICITAR' AND usuario=actor) THEN RAISE EXCEPTION 'Colaborador de Pagos o revisor independiente requerido'; END IF;
 PERFORM pe.id FROM public.tb_compensacion_periodo pe WHERE pe.periodo=mes ORDER BY pe.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=mes AND estado_periodo IN('APROBADO','CERRADO')) THEN RAISE EXCEPTION 'Periodo consolidado; requiere ajuste autorizado'; END IF;
 clave:='PAGOS_CUADRE:'||col||':'||mes;
 PERFORM public.f_private_compensacion_pagos_periodo_editable(col,mes);
 PERFORM pg_advisory_xact_lock(hashtextextended(clave,0));
 SELECT * INTO ev FROM public.tb_compensacion_evento WHERE clave_origen=clave FOR UPDATE;
 IF p_accion='SOLICITAR' THEN
  IF ev.id IS NOT NULL THEN RETURN jsonb_build_object('id',ev.id,'estado',ev.estado_evento); END IF;
  SELECT id INTO STRICT tipo FROM public.tb_compensacion_evento_tipo WHERE codigo='CUADRE_PERFECTO';
  tarifa:=public.f_private_compensacion_evento_tarifa_registro(tipo,col,(least((mes+interval '1 month - 1 day')::date,(now() AT TIME ZONE 'America/Lima')::date)::timestamp+interval '12 hours') AT TIME ZONE 'America/Lima');
  SELECT id_sucursal INTO sede FROM public.tb_compensacion_asignacion WHERE id=(tarifa->>'id_asignacion_registro')::bigint;
  INSERT INTO public.tb_compensacion_evento(id_tipo_evento,id_colaborador_beneficiario,id_sucursal_origen,fecha_evento,periodo_imputacion,fuente,clave_origen,titulo,descripcion,datos,evidencia,estado_evento,id_usuario_registra,criterios_validacion_snapshot)
  VALUES(tipo,col,sede,now(),mes,'MANUAL',clave,'Cuadre Perfecto',btrim(p_motivo),jsonb_build_object('flujo','PAGOS_CUADRE_V1'),CASE WHEN nullif(p_evidencia,'') IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('url',p_evidencia)) END,'PENDIENTE',actor,tarifa) RETURNING * INTO ev;
  RETURN jsonb_build_object('id',ev.id,'estado',ev.estado_evento);
 END IF;
 IF ev.id IS NULL OR ev.estado_evento<>'PENDIENTE' THEN RAISE EXCEPTION 'No hay solicitud pendiente para resolver'; END IF;
 IF p_accion='APROBAR' THEN
  v_fuente:=public.f_private_compensacion_pagos_cuadre_fuente(col,mes);
  -- SQL208: registro manual de Administracion; no se exigen operaciones ni vouchers.
  IF v_fuente->>'mes_cerrado'<>'true' OR v_fuente->>'sin_descuadre'<>'true' THEN
    RAISE EXCEPTION 'Requiere mes terminado y ningun Descuadre pendiente o confirmado'; END IF;
  UPDATE public.tb_compensacion_evento SET datos=datos||jsonb_build_object('revision_bancaria',jsonb_build_object('manual',true,'id_usuario',actor,'fecha',clock_timestamp())),
   evidencia=evidencia||CASE WHEN nullif(p_evidencia,'') IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('url',p_evidencia,'tipo','CONCILIACION_BANCARIA')) END WHERE id=ev.id;
 END IF;
 RETURN public.f_post_tb_compensacion_evento_resolver(ev.id,CASE WHEN p_accion='APROBAR' THEN 'APROBADO' ELSE 'RECHAZADO' END,btrim(p_motivo),0,1);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_pagos_cuadre_registrar(p_mes date, p_colaborador bigint, p_evidencia text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; mes date; actor bigint; usuario bigint; ev public.tb_compensacion_evento%ROWTYPE; tipo bigint; sede bigint; tarifa jsonb; clave text;
BEGIN
  ctx:=public.f_private_compensacion_contexto('RESUMEN','CONSULTAR');
  IF NOT coalesce((ctx->>'es_super_admin')::boolean,false) THEN RAISE EXCEPTION 'El cuadre perfecto lo registra Administracion'; END IF;
  PERFORM public.f_private_compensacion_contexto('AUDITORIA','CONSULTAR');
  actor:=(ctx->>'id_usuario')::bigint;
  mes:=date_trunc('month',p_mes)::date;
  IF mes IS NULL OR mes>date_trunc('month',now() AT TIME ZONE 'America/Lima')::date OR coalesce(length(btrim(p_motivo)),0) NOT BETWEEN 10 AND 2000
     OR length(coalesce(p_evidencia,''))>2000 OR (nullif(p_evidencia,'') IS NOT NULL AND p_evidencia !~ '^https://[^[:space:]]+$') THEN
    RAISE EXCEPTION 'Periodo, motivo obligatorios'; END IF;
  SELECT c.id_usuario INTO usuario FROM public.tb_compensacion_colaborador c JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=2 WHERE c.id=p_colaborador;
  IF usuario IS NULL OR usuario=actor THEN RAISE EXCEPTION 'Colaborador de Pagos o revisor independiente requerido'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion a JOIN public.tb_estado es ON es.id=a.id_estado AND upper(btrim(es.nombre))='ACTIVO'
      JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo IN('JEFE_SUPERIOR_PAGOS','OPERADOR_ALTA_DEMANDA','ENCARGADO_CARTERA_MEDIA','ASISTENTE_VIRTUAL_PAGOS')
      WHERE a.id_colaborador=p_colaborador AND (now() AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)) THEN
    RAISE EXCEPTION 'El colaborador no tiene una asignacion vigente del area de Pagos'; END IF;
  PERFORM pe.id FROM public.tb_compensacion_periodo pe WHERE pe.periodo=mes ORDER BY pe.id FOR UPDATE;
  clave:='PAGOS_CUADRE:'||p_colaborador||':'||mes;
  PERFORM pg_advisory_xact_lock(hashtextextended(clave,0));
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE clave_origen=clave FOR UPDATE;
  IF ev.id IS NOT NULL AND ev.estado_evento<>'PENDIENTE' THEN RAISE EXCEPTION 'El cuadre de ese mes ya fue resuelto'; END IF;
  IF ev.id IS NULL THEN
    SELECT id INTO STRICT tipo FROM public.tb_compensacion_evento_tipo WHERE codigo='CUADRE_PERFECTO';
    tarifa:=public.f_private_compensacion_evento_tarifa_registro(tipo,p_colaborador,(least((mes+interval '1 month - 1 day')::date,(now() AT TIME ZONE 'America/Lima')::date)::timestamp+interval '12 hours') AT TIME ZONE 'America/Lima');
    SELECT id_sucursal INTO sede FROM public.tb_compensacion_asignacion WHERE id=(tarifa->>'id_asignacion_registro')::bigint;
    INSERT INTO public.tb_compensacion_evento(id_tipo_evento,id_colaborador_beneficiario,id_sucursal_origen,fecha_evento,periodo_imputacion,fuente,clave_origen,titulo,descripcion,datos,evidencia,estado_evento,id_usuario_registra,criterios_validacion_snapshot)
    VALUES(tipo,p_colaborador,sede,now(),mes,'MANUAL',clave,'Cuadre Perfecto',btrim(p_motivo),jsonb_build_object('flujo','PAGOS_CUADRE_V1'),CASE WHEN nullif(p_evidencia,'') IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('url',p_evidencia)) END,'PENDIENTE',actor,tarifa);
  END IF;
  RETURN public.f_post_compensacion_pagos_cuadre(mes,p_colaborador,'APROBAR',p_evidencia,p_motivo);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_pagos_deteccion(p_tipo text, p_id_operacion bigint, p_datos jsonb, p_evidencia text, p_clave uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; op jsonb; actor bigint; col bigint; tipo bigint; evento bigint; sede bigint;
   clave text; hecho text; previo public.tb_compensacion_evento%ROWTYPE; tarifa jsonb;
   dni text; dia date; instante timestamptz; mes date;
BEGIN
  PERFORM public.f_private_compensacion_bono_no_admin();
 IF p_tipo IS NULL OR p_tipo NOT IN('REPORTE_ABANDONO','DETECCION_ERROR_MANUAL') OR p_clave IS NULL
   OR p_datos IS NULL OR jsonb_typeof(p_datos)<>'object' OR pg_column_size(p_datos)>8192 THEN RAISE EXCEPTION 'Captura incompleta o demasiado extensa'; END IF;
 ctx:=public.f_private_compensacion_contexto(CASE WHEN p_tipo='REPORTE_ABANDONO' THEN 'BONO:REPORTE_ABANDONO' ELSE 'AUDITORIA' END,'REGISTRAR');
 actor:=(ctx->>'id_usuario')::bigint; col:=(ctx->>'id_colaborador')::bigint;
 PERFORM public.f_private_compensacion_pagos_perfil(col);
 dni:=btrim(coalesce(p_datos->>'dni',''));
 dia:=coalesce(nullif(p_datos->>'fecha','')::date,(now() AT TIME ZONE 'America/Lima')::date);
 IF coalesce(length(btrim(p_datos->>'motivo')),0) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Describe en las notas que paso'; END IF;
 IF dni !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'Indica el DNI de ocho digitos'; END IF;
 IF dia>(now() AT TIME ZONE 'America/Lima')::date THEN RAISE EXCEPTION 'La fecha no puede ser futura'; END IF;
 instante:=(dia+(now() AT TIME ZONE 'America/Lima')::time) AT TIME ZONE 'America/Lima';
 mes:=date_trunc('month',dia)::date;
 clave:='PAGOS_DETECCION:'||actor||':'||p_clave;
 PERFORM pg_advisory_xact_lock(hashtextextended(clave,0));
 SELECT * INTO previo FROM public.tb_compensacion_evento WHERE fuente='MANUAL' AND clave_origen=clave FOR UPDATE;
 IF FOUND THEN
   IF previo.id_usuario_registra IS DISTINCT FROM actor OR previo.datos->'captura' IS DISTINCT FROM p_datos
     OR previo.datos->>'tipo' IS DISTINCT FROM p_tipo
     OR (previo.datos->>'id_operacion')::bigint IS DISTINCT FROM p_id_operacion THEN
     RAISE EXCEPTION 'La clave corresponde a otra captura'; END IF;
   RETURN jsonb_build_object('id',previo.id,'estado_evento',previo.estado_evento,'reintento',true);
 END IF;
 PERFORM 1 FROM public.tb_operacion_proceso WHERE id=p_id_operacion OR id=(SELECT id_operacion_padre FROM public.tb_operacion_proceso WHERE id=p_id_operacion) ORDER BY id FOR UPDATE;
 IF p_id_operacion IS NOT NULL THEN
   op:=public.f_private_compensacion_pagos_operacion(p_id_operacion,actor);
   IF op IS NULL THEN RAISE EXCEPTION 'Operacion no disponible en tu cartera autorizada'; END IF;
   IF btrim(op->>'dni') IS DISTINCT FROM dni THEN RAISE EXCEPTION 'La operacion no corresponde al DNI'; END IF;
 END IF;
 IF p_tipo='DETECCION_ERROR_MANUAL' THEN
   IF p_id_operacion IS NOT NULL AND (upper(op->>'estado')<>'PENDIENTE' OR (op->>'pagada')::boolean OR op->>'fecha_pago' IS NOT NULL OR (op->>'transferida')::boolean) THEN
     RAISE EXCEPTION 'El error debe corregirse antes del pago o transferencia'; END IF;
   hecho:='PAGOS_ERROR_MANUAL:'||coalesce(p_id_operacion::text,'SIN_OP:'||actor||':'||dni||':'||dia);
 ELSE
   hecho:='PAGOS_ABANDONO:'||coalesce('OP:'||p_id_operacion,actor||':'||dni||':'||dia);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(hecho,0));
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento e WHERE e.datos->>'hecho'=hecho AND e.estado_evento NOT IN('ANULADO','RECHAZADO')) THEN
   RAISE EXCEPTION 'Este hecho ya tiene un expediente; no corresponde duplicar el bono'; END IF;
 SELECT id INTO STRICT tipo FROM public.tb_compensacion_evento_tipo t WHERE t.codigo=p_tipo
   AND EXISTS(SELECT 1 FROM public.tb_estado e WHERE e.id=t.id_estado AND upper(btrim(e.nombre))='ACTIVO');
 SELECT a.id_sucursal INTO sede FROM public.tb_compensacion_asignacion a JOIN public.tb_estado e ON e.id=a.id_estado AND upper(btrim(e.nombre))='ACTIVO'
   WHERE a.id_colaborador=col AND dia BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date);
 PERFORM pe.id FROM public.tb_compensacion_periodo pe WHERE pe.periodo=mes ORDER BY pe.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=mes AND estado_periodo IN('APROBADO','CERRADO')) THEN
   RAISE EXCEPTION 'El periodo esta bloqueado; corresponde un ajuste autorizado'; END IF;
 tarifa:=public.f_private_compensacion_evento_tarifa_registro(tipo,col,instante);
 INSERT INTO public.tb_compensacion_evento(id_tipo_evento,id_colaborador_beneficiario,id_sucursal_origen,fecha_evento,periodo_imputacion,
   fuente,clave_origen,titulo,descripcion,datos,evidencia,estado_evento,id_usuario_registra,criterios_validacion_snapshot)
 VALUES(tipo,col,sede,instante,mes,'MANUAL',clave,
   CASE WHEN p_tipo='REPORTE_ABANDONO' THEN 'Abandono Comercial' ELSE 'Error en Registro Manual o Codigo' END,btrim(p_datos->>'motivo'),
   jsonb_build_object('flujo','PAGOS_DETECCION_V1','tipo',p_tipo,'hecho',hecho,'captura',p_datos,'id_operacion',p_id_operacion,'operacion',op,
     'cliente_documento',dni,'cliente_nombre',op->>'cliente'),
   '[]'::jsonb,'PENDIENTE',actor,tarifa) RETURNING id INTO evento;
 IF p_id_operacion IS NOT NULL THEN
   INSERT INTO public.tb_compensacion_evento_referencia(id_evento,tipo_referencia,id_operacion,datos_snapshot,id_usuario)
     VALUES(evento,'OPERACION',p_id_operacion,op,actor);
   INSERT INTO public.tb_compensacion_evento_referencia(id_evento,tipo_referencia,id_cliente,id_usuario)
     VALUES(evento,'CLIENTE',(op->>'id_cliente')::bigint,actor);
 END IF;
 INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
   VALUES(evento,1,'REGISTRO','ENVIADO','Sustento sujeto a revision independiente',actor,'{}');
 RETURN jsonb_build_object('id',evento,'estado_evento','PENDIENTE');
END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_pagos_deteccion_anular(p_id bigint, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE ctx jsonb; ev public.tb_compensacion_evento%ROWTYPE; actor bigint; col bigint; paso integer;
BEGIN
  ctx:=public.f_private_compensacion_contexto('AUDITORIA','REGISTRAR');
  actor:=(ctx->>'id_usuario')::bigint; col:=(ctx->>'id_colaborador')::bigint;
  PERFORM public.f_private_compensacion_pagos_perfil(col);
  IF nullif(btrim(p_motivo),'') IS NULL OR length(btrim(p_motivo))<10 THEN
    RAISE EXCEPTION 'Explica el motivo de la anulacion con al menos 10 caracteres';
  END IF;
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR ev.datos->>'flujo' IS DISTINCT FROM 'PAGOS_DETECCION_V1' THEN RAISE EXCEPTION 'Reporte no disponible'; END IF;
  IF ev.id_usuario_registra<>actor OR ev.id_colaborador_beneficiario IS DISTINCT FROM col THEN
    RAISE EXCEPTION 'Solo puedes anular tus reportes';
  END IF;
  IF ev.estado_evento<>'PENDIENTE' THEN RAISE EXCEPTION 'Solo se anula un reporte pendiente de revision'; END IF;
  SELECT coalesce(max(numero_paso),0)+1 INTO paso FROM public.tb_compensacion_evento_revision WHERE id_evento=p_id;
  INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
  VALUES(p_id,paso,'ANULACION','ANULADO',btrim(p_motivo),actor,jsonb_build_object('estado_anterior',ev.estado_evento));
  UPDATE public.tb_compensacion_evento SET estado_evento='ANULADO',fecha_actualizacion=clock_timestamp() WHERE id=p_id;
  RETURN jsonb_build_object('id',p_id,'estado_evento','ANULADO');
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_pagos_perdida(p_values jsonb, p_enviar boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; r jsonb; previo public.tb_compensacion_evento%ROWTYPE; clave text; monto numeric; actor bigint;
BEGIN
 ctx:=public.f_private_compensacion_contexto('INCIDENCIAS','REGISTRAR');actor:=(ctx->>'id_usuario')::bigint;
 IF NOT EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=actor AND id_rol IN(1,5)) THEN RAISE EXCEPTION 'La perdida la reporta Facturacion o Administracion'; END IF;
 IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' OR coalesce(p_values->>'monto_perdido','') !~ '^[0-9]+(\.[0-9]{1,2})?$'
  OR (p_values->>'monto_perdido')::numeric<=0 OR coalesce(p_values->>'p_clave_origen','') !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'Perdida y clave de reporte obligatorias'; END IF;
 monto:=(p_values->>'monto_perdido')::numeric;clave:='PAGOS_PERDIDA:'||actor||':'||(p_values->>'p_clave_origen');
 PERFORM pg_advisory_xact_lock(hashtextextended(clave,0));
 SELECT * INTO previo FROM public.tb_compensacion_evento WHERE clave_origen=clave FOR UPDATE;
 IF previo.id IS NOT NULL THEN
  IF previo.datos->'captura_perdida' IS DISTINCT FROM p_values THEN RAISE EXCEPTION 'La clave corresponde a otro reporte'; END IF;
  r:=jsonb_build_object('id',previo.id,'estado_evento',previo.estado_evento);
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_penalidad_tipo WHERE id=(p_values->>'p_id_penalidad_tipo')::bigint AND codigo ~ '^PAG_[A-Z_]+_ERROR_PAGO_CRITICO$') THEN RAISE EXCEPTION 'Concepto de perdida invalido'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_values->'p_referencias') ref JOIN public.tb_operacion_proceso op ON op.id=(ref->>'id_operacion')::bigint
    JOIN public.tb_compensacion_colaborador c ON c.id=(p_values->>'p_id_colaborador_responsable')::bigint
    WHERE ref->>'tipo_referencia'='OPERACION' AND coalesce(op.id_usuario_gestor,op.id_usuario)=c.id_usuario
      AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada x WHERE x.id_operacion_proceso=op.id)) THEN RAISE EXCEPTION 'Vincula la operacion real del gestor responsable'; END IF;
  r:=public.f_post_tb_compensacion_incidencia((p_values->>'p_id_tipo_evento')::bigint,(p_values->>'p_id_penalidad_tipo')::bigint,
    (p_values->>'p_id_colaborador_responsable')::bigint,(p_values->>'p_fecha_evento')::timestamptz,p_values->>'p_motivo',
    (p_values->>'p_id_colaborador_reportante')::bigint,(p_values->>'p_titulo')::varchar,p_values->'p_evidencia',p_values->'p_referencias',clave::varchar,'MANUAL');
  UPDATE public.tb_compensacion_evento SET datos=datos||jsonb_build_object('monto_perdido',monto,'cuotas',1,'captura_perdida',p_values) WHERE id=(r->>'id')::bigint;
 END IF;
 IF p_enviar AND r->>'estado_evento'='BORRADOR' THEN r:=public.f_post_tb_compensacion_incidencia_enviar((r->>'id')::bigint,NULL); END IF;
 RETURN r;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_pagos_registro_validar(p_cliente bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE v jsonb; actor bigint; col bigint; c public.tb_cliente%ROWTYPE; el jsonb; tipo bigint; tarifa jsonb; sede bigint; evento bigint; hecho text; mes date;
BEGIN
  PERFORM public.f_private_compensacion_bono_no_admin();
  v:=public.f_private_compensacion_pagos_registro_validador();
  IF v IS NULL THEN RAISE EXCEPTION 'Validacion exclusiva del Jefe Superior de Pagos'; END IF;
  actor:=(v->>'id_usuario')::bigint; col:=(v->>'id_colaborador')::bigint;
  SELECT * INTO c FROM public.tb_cliente WHERE id=p_cliente;
  IF c.id IS NULL OR c.id_usuario=actor OR NOT EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador k WHERE k.id_usuario=c.id_usuario) THEN
    RAISE EXCEPTION 'Registro nuevo no disponible para validar'; END IF;
  el:=public.f_private_compensacion_pagos_registro_elegible(p_cliente);
  IF el IS NULL THEN RAISE EXCEPTION 'El cliente no tiene una operacion pagada dentro de los siete dias'; END IF;
  hecho:='AUDITAR_NUEVOS:'||p_cliente;
  PERFORM pg_advisory_xact_lock(hashtextextended(hecho,0));
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento e WHERE e.datos->>'hecho'=hecho AND e.estado_evento NOT IN('ANULADO','RECHAZADO')) THEN
    RAISE EXCEPTION 'Este registro ya fue validado'; END IF;
  mes:=date_trunc('month',(el->>'fecha_pago')::timestamptz AT TIME ZONE 'America/Lima')::date;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=mes AND estado_periodo IN('APROBADO','CERRADO')) THEN
    RAISE EXCEPTION 'El periodo esta bloqueado; corresponde un ajuste autorizado'; END IF;
  SELECT id INTO STRICT tipo FROM public.tb_compensacion_evento_tipo t WHERE t.codigo='AUDITAR_NUEVOS'
    AND EXISTS(SELECT 1 FROM public.tb_estado e WHERE e.id=t.id_estado AND upper(btrim(e.nombre))='ACTIVO');
  tarifa:=public.f_private_compensacion_evento_tarifa_registro(tipo,col,now());
  SELECT a.id_sucursal INTO sede FROM public.tb_compensacion_asignacion a WHERE a.id=(tarifa->>'id_asignacion_registro')::bigint;
  INSERT INTO public.tb_compensacion_evento(id_tipo_evento,id_colaborador_beneficiario,id_sucursal_origen,fecha_evento,periodo_imputacion,
    fuente,clave_origen,titulo,descripcion,datos,evidencia,estado_evento,id_usuario_registra,criterios_validacion_snapshot)
  VALUES(tipo,col,sede,now(),mes,'MANUAL','PAGOS_AUDITAR_NUEVOS:'||p_cliente,'Auditar Registro Nuevo',
    'Validacion del registro nuevo '||c.numero_documento||' y su primera operacion pagada',
    jsonb_build_object('flujo','PAGOS_AUDITAR_NUEVOS_V1','hecho',hecho,'cliente_documento',c.numero_documento,'cliente_nombre',c.nombre,'operacion',el),
    '[]'::jsonb,'PENDIENTE',actor,tarifa) RETURNING id INTO evento;
  INSERT INTO public.tb_compensacion_evento_referencia(id_evento,tipo_referencia,id_cliente,id_usuario) VALUES(evento,'CLIENTE',p_cliente,actor);
  INSERT INTO public.tb_compensacion_evento_referencia(id_evento,tipo_referencia,id_operacion,datos_snapshot,id_usuario)
    VALUES(evento,'OPERACION',(el->>'id')::bigint,el,actor);
  INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
    VALUES(evento,1,'REGISTRO','ENVIADO','Validacion del Jefe Superior de Pagos',actor,'{}');
  RETURN jsonb_build_object('id',evento,'estado_evento','PENDIENTE');
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_pagos_validar(p_id bigint, p_decision text, p_comentario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE v jsonb; ev public.tb_compensacion_evento%ROWTYPE; dec text:=upper(btrim(coalesce(p_decision,''))); paso integer; actor bigint;
BEGIN
  v:=public.f_private_compensacion_pagos_validador();
  actor:=(v->>'id_usuario')::bigint;
  IF dec NOT IN('APROBADO','RECHAZADO') THEN RAISE EXCEPTION 'La decision debe ser APROBADO o RECHAZADO'; END IF;
  IF coalesce(length(btrim(p_comentario)),0)<10 THEN RAISE EXCEPTION 'Explica tu decision con al menos 10 caracteres'; END IF;
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR ev.datos->>'flujo' IS DISTINCT FROM 'PAGOS_DETECCION_V1'
     OR NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_tipo t WHERE t.id=ev.id_tipo_evento AND t.codigo IN('REPORTE_ABANDONO','DETECCION_ERROR_MANUAL'))
  THEN RAISE EXCEPTION 'Reporte no disponible'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion a JOIN public.tb_estado es ON es.id=a.id_estado AND upper(btrim(es.nombre))='ACTIVO'
      WHERE a.id_colaborador=ev.id_colaborador_beneficiario AND a.id_sucursal=(v->>'id_sucursal')::bigint
        AND (ev.fecha_evento AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date))
  THEN RAISE EXCEPTION 'El reporte no pertenece al equipo de tu sede'; END IF;
  IF ev.id_usuario_registra=actor OR ev.id_colaborador_beneficiario=(v->>'id_colaborador')::bigint THEN
    RAISE EXCEPTION 'El hecho requiere un revisor independiente'; END IF;
  IF ev.estado_evento<>'PENDIENTE' THEN RAISE EXCEPTION 'Solo se valida un reporte pendiente'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento_revision WHERE id_evento=p_id AND etapa='JEFE_LINCE') THEN
    RAISE EXCEPTION 'El reporte ya fue validado'; END IF;
  SELECT coalesce(max(numero_paso),0)+1 INTO paso FROM public.tb_compensacion_evento_revision WHERE id_evento=p_id;
  INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
  VALUES(p_id,paso,'JEFE_LINCE',dec,btrim(p_comentario),actor,jsonb_build_object('id_sucursal',v->>'id_sucursal'));
  IF dec='RECHAZADO' THEN
    UPDATE public.tb_compensacion_evento SET estado_evento='RECHAZADO',fecha_actualizacion=clock_timestamp() WHERE id=p_id;
  END IF;
  RETURN jsonb_build_object('id',p_id,'decision',dec,'estado_evento',CASE WHEN dec='RECHAZADO' THEN 'RECHAZADO' ELSE 'PENDIENTE' END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_pagos_voucher(p_operacion bigint, p_evidencia text, p_clave uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; op jsonb; col bigint; actor bigint; r public.tb_compensacion_pagos_entrega%ROWTYPE;
BEGIN
 ctx:=public.f_private_compensacion_contexto('RESUMEN','CONSULTAR');col:=(ctx->>'id_colaborador')::bigint;actor:=(ctx->>'id_usuario')::bigint;
 PERFORM public.f_private_compensacion_pagos_perfil(col);
 IF p_clave IS NULL OR p_evidencia IS NULL OR length(p_evidencia)>2000 OR p_evidencia !~ '^https://[^[:space:]]+$' THEN RAISE EXCEPTION 'Adjunta evidencia HTTPS y clave de entrega'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pagos:voucher:'||p_operacion,0));
 PERFORM public.f_private_compensacion_pagos_periodo_editable(col,(SELECT (fecha_pagado AT TIME ZONE 'America/Lima')::date FROM public.tb_operacion_proceso WHERE id=p_operacion));
 PERFORM 1 FROM public.tb_operacion_proceso WHERE id=p_operacion FOR UPDATE;
 op:=public.f_private_compensacion_pagos_operacion(p_operacion,actor);
 IF op IS NULL OR NOT coalesce((op->>'pagada')::boolean,false) OR coalesce((op->>'id_usuario_gestor')::bigint,(op->>'id_usuario_registro')::bigint) IS DISTINCT FROM actor THEN
  RAISE EXCEPTION 'Solo puedes entregar el voucher de tu operacion final pagada'; END IF;
 PERFORM pe.id FROM public.tb_compensacion_periodo pe WHERE pe.periodo=date_trunc('month',(op->>'fecha_pago')::timestamptz AT TIME ZONE 'America/Lima')::date ORDER BY pe.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=date_trunc('month',(op->>'fecha_pago')::timestamptz AT TIME ZONE 'America/Lima')::date AND estado_periodo IN('APROBADO','CERRADO')) THEN RAISE EXCEPTION 'El periodo esta consolidado; requiere ajuste autorizado'; END IF;
 SELECT * INTO r FROM public.tb_compensacion_pagos_entrega WHERE id_operacion=p_operacion;
 IF FOUND THEN
  IF r.id_usuario<>actor THEN RAISE EXCEPTION 'La operacion ya tiene otra entrega'; END IF;
  IF r.evidencia<>p_evidencia THEN
    IF r.estado<>'OBSERVADO' OR r.clave=p_clave THEN RAISE EXCEPTION 'La entrega esta en revision o validada; no puedes reemplazarla'; END IF;
    UPDATE public.tb_compensacion_pagos_entrega SET historial=historial||jsonb_build_array(to_jsonb(r)-'historial'),
     evidencia=p_evidencia,clave=p_clave,fecha_entrega=clock_timestamp(),operacion_snapshot=op,estado='PENDIENTE',id_usuario_revisa=NULL,fecha_revision=NULL,motivo_revision=NULL WHERE id=r.id RETURNING * INTO r;
  END IF;
  RETURN jsonb_build_object('id',r.id,'estado',r.estado,'fecha_entrega',r.fecha_entrega);
 END IF;
 INSERT INTO public.tb_compensacion_pagos_entrega(id_operacion,id_colaborador,id_usuario,clave,evidencia,operacion_snapshot)
 VALUES(p_operacion,col,actor,p_clave,p_evidencia,op) RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'estado',r.estado,'fecha_entrega',r.fecha_entrega);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_pagos_voucher_revisar(p_id bigint, p_estado text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; r public.tb_compensacion_pagos_entrega%ROWTYPE; op jsonb;
BEGIN
 ctx:=public.f_private_compensacion_contexto('AUDITORIA','APROBAR');
 IF NOT coalesce((ctx->>'es_super_admin')::boolean,false) OR p_estado IS NULL OR p_estado NOT IN('VALIDADO','OBSERVADO') OR coalesce(length(btrim(p_motivo)),0)<10 THEN RAISE EXCEPTION 'Requiere revision administrativa motivada'; END IF;
 SELECT * INTO r FROM public.tb_compensacion_pagos_entrega WHERE id=p_id;
 PERFORM public.f_private_compensacion_pagos_periodo_editable(r.id_colaborador,((r.operacion_snapshot->>'fecha_pago')::timestamptz AT TIME ZONE 'America/Lima')::date);
 PERFORM 1 FROM public.tb_operacion_proceso WHERE id=r.id_operacion FOR UPDATE;
 SELECT * INTO r FROM public.tb_compensacion_pagos_entrega WHERE id=p_id FOR UPDATE;
 IF r.id IS NULL OR r.id_usuario=(ctx->>'id_usuario')::bigint THEN RAISE EXCEPTION 'Entrega inexistente o revisor implicado'; END IF;
 op:=public.f_private_compensacion_pagos_operacion(r.id_operacion,r.id_usuario);
 IF p_estado='VALIDADO' AND (op IS NULL OR NOT coalesce((op->>'pagada')::boolean,false) OR op->>'dni' IS DISTINCT FROM r.operacion_snapshot->>'dni'
  OR op->>'monto' IS DISTINCT FROM r.operacion_snapshot->>'monto') THEN RAISE EXCEPTION 'La operacion cambio o fue revertida'; END IF;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=date_trunc('month',(r.operacion_snapshot->>'fecha_pago')::timestamptz AT TIME ZONE 'America/Lima')::date AND estado_periodo IN('APROBADO','CERRADO')) THEN RAISE EXCEPTION 'Periodo consolidado'; END IF;
 IF r.estado=p_estado AND r.id_usuario_revisa=(ctx->>'id_usuario')::bigint AND r.motivo_revision=btrim(p_motivo) THEN RETURN jsonb_build_object('id',r.id,'estado',r.estado); END IF;
 UPDATE public.tb_compensacion_pagos_entrega SET historial=historial||jsonb_build_array(to_jsonb(r)-'historial'),estado=p_estado,id_usuario_revisa=(ctx->>'id_usuario')::bigint,fecha_revision=clock_timestamp(),motivo_revision=btrim(p_motivo) WHERE id=r.id;
 RETURN jsonb_build_object('id',r.id,'estado',p_estado);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_pancake_certificar(p_mes date, p_justificacion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE actor bigint; r public.tb_compensacion_pancake_mes%ROWTYPE; BEGIN
 actor:=public.f_private_compensacion_pancake_actor();
 PERFORM pg_advisory_xact_lock(hashtextextended('PANCAKE:'||p_mes::text,0));
 PERFORM public.f_private_compensacion_pancake_abierto(p_mes);
 IF (now() AT TIME ZONE 'America/Lima')::date<p_mes+interval '1 month' OR length(btrim(coalesce(p_justificacion,'')))<20 THEN
 RAISE EXCEPTION 'Certifica después del fin del mes y sustenta cobertura completa'; END IF;
 SELECT * INTO r FROM public.tb_compensacion_pancake_mes WHERE periodo=p_mes FOR UPDATE;
 IF r.periodo IS NULL OR EXISTS(SELECT 1 FROM unnest(r.paginas) pg WHERE NOT EXISTS(
 SELECT 1 FROM public.tb_compensacion_pancake_importacion i WHERE i.periodo=p_mes AND i.pagina=pg)) THEN
 RAISE EXCEPTION 'Falta exportación original de alguna página'; END IF;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_mes_adjudicacion WHERE periodo=p_mes) THEN RAISE EXCEPTION 'Mes adjudicado'; END IF;
 UPDATE public.tb_compensacion_pancake_mes SET certificacion=jsonb_build_object('actor',actor,'fecha',now(),
 'justificacion',p_justificacion,'revision',revision),revision=revision+1 WHERE periodo=p_mes;
 RETURN jsonb_build_object('periodo',p_mes,'estado','CERTIFICADO_POR_ADMINISTRACION');
END $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_pancake_configurar(p_mes date, p_paginas text[], p_identidades jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE actor bigint; r jsonb; BEGIN
 actor:=public.f_private_compensacion_pancake_actor();
 PERFORM pg_advisory_xact_lock(hashtextextended('PANCAKE:'||p_mes::text,0));
 PERFORM public.f_private_compensacion_pancake_abierto(p_mes);
 IF coalesce(cardinality(p_paginas),0)=0 OR cardinality(p_paginas)>100
 OR EXISTS(SELECT 1 FROM unnest(p_paginas) x WHERE x IS NULL OR btrim(x)='' OR length(x)>200)
 OR (SELECT count(DISTINCT x) FROM unnest(p_paginas) x)<>cardinality(p_paginas)
 OR jsonb_typeof(p_identidades) IS DISTINCT FROM 'array' OR jsonb_array_length(p_identidades)>10000 THEN RAISE EXCEPTION 'Páginas e identidades inválidas'; END IF;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_pancake_importacion WHERE periodo=p_mes)
 OR EXISTS(SELECT 1 FROM public.tb_compensacion_mes_adjudicacion WHERE periodo=p_mes) THEN
 RAISE EXCEPTION 'Fuente utilizada: no se cambia el alcance o las identidades'; END IF;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_chat_dni cd WHERE cd.periodo=p_mes AND cd.estado='ACTIVO') OR EXISTS(SELECT 1 FROM public.tb_compensacion_chat_dni_mes WHERE periodo=p_mes) THEN
 RAISE EXCEPTION 'El mes ya usa el registro de chats por DNI; no se mezcla con Pancake'; END IF;
 INSERT INTO public.tb_compensacion_pancake_mes(periodo,paginas,id_usuario) VALUES(p_mes,p_paginas,actor)
 ON CONFLICT(periodo) DO UPDATE SET paginas=excluded.paginas,id_usuario=actor,revision=tb_compensacion_pancake_mes.revision+1,certificacion=NULL;
 DELETE FROM public.tb_compensacion_pancake_identidad WHERE periodo=p_mes;
 FOR r IN SELECT value FROM jsonb_array_elements(p_identidades) LOOP
 IF NOT coalesce(r->>'pagina'=ANY(p_paginas),false) OR length(btrim(coalesce(r->>'usuario_externo','')))=0
 OR NOT EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador c
 JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=4
 JOIN public.tb_compensacion_asignacion a ON a.id_colaborador=c.id
 JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='ATENCION_CLIENTE'
 JOIN public.tb_estado e ON e.id=a.id_estado AND upper(btrim(e.nombre))='ACTIVO'
 WHERE c.id=(r->>'id_colaborador')::bigint AND a.fecha_inicio<(p_mes+interval '1 month')
 AND (a.fecha_fin IS NULL OR a.fecha_fin>=p_mes)) THEN RAISE EXCEPTION 'Identidad sin asignación ATC válida'; END IF;
 INSERT INTO public.tb_compensacion_pancake_identidad VALUES(p_mes,r->>'pagina',r->>'usuario_externo',(r->>'id_colaborador')::bigint);
 END LOOP;
 RETURN jsonb_build_object('periodo',p_mes,'estado','FUENTE_PENDIENTE');
END $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_pancake_importar(p_mes date, p_pagina text, p_archivo text, p_original text, p_mapeo jsonb, p_justificacion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE actor bigint; doc jsonb; filas jsonb; r jsonb; cid text; uid text; f timestamptz; ef boolean;
 col bigint; imp bigint; previo public.tb_compensacion_pancake_conversacion%ROWTYPE; n integer:=0; h text; k text;
BEGIN
 actor:=public.f_private_compensacion_pancake_actor();
 PERFORM pg_advisory_xact_lock(hashtextextended('PANCAKE:'||p_mes::text,0));
 PERFORM public.f_private_compensacion_pancake_abierto(p_mes);
 IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_pancake_mes WHERE periodo=p_mes AND p_pagina=ANY(paginas)) THEN RAISE EXCEPTION 'Página no configurada'; END IF;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_mes_adjudicacion WHERE periodo=p_mes) THEN RAISE EXCEPTION 'Mes adjudicado: fuente congelada'; END IF;
 IF p_original IS NULL OR octet_length(p_original)>10000000 OR length(btrim(coalesce(p_archivo,'')))=0
 OR length(btrim(coalesce(p_justificacion,'')))<10 THEN RAISE EXCEPTION 'Archivo original y revisión obligatorios (máximo 10 MB)'; END IF;
 FOREACH k IN ARRAY ARRAY['conversacion','usuario','fecha','efectiva','valor_efectiva'] LOOP
 IF nullif(btrim(p_mapeo->>k),'') IS NULL THEN RAISE EXCEPTION 'Falta mapeo explícito: %',k; END IF; END LOOP;
 IF coalesce(p_mapeo->>'formato','JSON') NOT IN('JSON','CSV') THEN RAISE EXCEPTION 'Formato de exportación no soportado'; END IF;
 doc:=CASE WHEN p_mapeo->>'formato'='CSV' THEN public.f_private_compensacion_pancake_csv(p_original,coalesce(p_mapeo->>'separador',',')) ELSE p_original::jsonb END;
 filas:=CASE WHEN nullif(p_mapeo->>'raiz','') IS NULL THEN doc ELSE doc->(p_mapeo->>'raiz') END;
 IF jsonb_typeof(filas) IS DISTINCT FROM 'array' OR jsonb_array_length(filas)>20000 THEN RAISE EXCEPTION 'Exportación debe contener array de hasta 20000 conversaciones'; END IF;
 h:=md5(p_original||p_mapeo::text);
 SELECT id INTO imp FROM public.tb_compensacion_pancake_importacion WHERE periodo=p_mes AND pagina=p_pagina AND huella=h;
 IF imp IS NOT NULL THEN RETURN jsonb_build_object('id_importacion',imp,'idempotente',true); END IF;
 INSERT INTO public.tb_compensacion_pancake_importacion(periodo,pagina,archivo,huella,original,mapeo,justificacion,id_usuario)
 VALUES(p_mes,p_pagina,p_archivo,h,p_original,p_mapeo,p_justificacion,actor) RETURNING id INTO imp;
 FOR r IN SELECT value FROM jsonb_array_elements(filas) LOOP
 cid:=nullif(btrim(r->>(p_mapeo->>'conversacion')),''); uid:=nullif(btrim(r->>(p_mapeo->>'usuario')),'');
 IF cid IS NULL OR uid IS NULL OR length(cid)>250 OR length(uid)>250 OR r->>(p_mapeo->>'efectiva') IS NULL
 OR coalesce(r->>(p_mapeo->>'fecha'),'') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RAISE EXCEPTION 'Conversación sin identidad, estado o fecha ISO con zona'; END IF;
 f:=(r->>(p_mapeo->>'fecha'))::timestamptz;
 IF date_trunc('month',f AT TIME ZONE 'America/Lima')::date<>p_mes THEN RAISE EXCEPTION 'Conversación fuera del mes Lima'; END IF;
 ef:=r->>(p_mapeo->>'efectiva')=p_mapeo->>'valor_efectiva';
 SELECT id_colaborador INTO col FROM public.tb_compensacion_pancake_identidad WHERE periodo=p_mes AND pagina=p_pagina AND usuario_externo=uid;
 IF col IS NULL THEN RAISE EXCEPTION 'Identidad externa no vinculada; revisar fuente'; END IF;
 -- Serializa IDs globales incluso si dos administradores importan meses distintos.
 PERFORM pg_advisory_xact_lock(hashtextextended('PC:'||p_pagina||':'||cid,0));
 SELECT * INTO previo FROM public.tb_compensacion_pancake_conversacion WHERE pagina=p_pagina AND conversacion=cid;
 IF previo.conversacion IS NOT NULL THEN
 IF previo.periodo<>p_mes OR previo.id_colaborador<>col OR previo.usuario_externo<>uid OR previo.fecha_efectiva<>f OR previo.efectiva<>ef THEN
 RAISE EXCEPTION 'Conversación duplicada con datos distintos: requiere conciliación'; END IF;
 ELSE
 INSERT INTO public.tb_compensacion_pancake_conversacion VALUES(p_pagina,cid,p_mes,col,uid,f,ef,imp); n:=n+1;
 END IF;
 END LOOP;
 UPDATE public.tb_compensacion_pancake_mes SET revision=revision+1,certificacion=NULL WHERE periodo=p_mes;
 RETURN jsonb_build_object('id_importacion',imp,'nuevas',n,'estado','PENDIENTE_CERTIFICACION');
END $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_parametros_guardar(p_id_plan_version bigint, p_cambios jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_item jsonb;
  v_id bigint;
  v_tipo text;
  v_estado text;
  v_actual text;
  v_valor text;
  v_anterior text;
  v_calculo text;
  v_cantidad integer := 0;
BEGIN
  PERFORM public.f_private_compensacion_contexto('CONFIGURACION', 'CONFIGURAR');
  IF p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'array' THEN
    RAISE EXCEPTION 'Los cambios deben ser una lista';
  END IF;
  IF jsonb_array_length(p_cambios) > 1000 THEN
    RAISE EXCEPTION 'Demasiados parametros en una solicitud';
  END IF;

  SELECT pv.estado_version INTO v_estado
  FROM public.tb_compensacion_plan_version pv
  JOIN public.tb_compensacion_plan p ON p.id = pv.id_plan
  WHERE pv.id = p_id_plan_version
    AND p.codigo = 'PLAN_COMPENSACIONES_GENERAL'
  FOR UPDATE OF pv;
  IF NOT FOUND OR v_estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'La configuracion ya no es editable. Actualiza la pantalla';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_cambios) x
    GROUP BY x->>'tipo', x->>'id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Un parametro no puede enviarse dos veces';
  END IF;

  FOR v_item IN
    SELECT x FROM jsonb_array_elements(p_cambios) x
    ORDER BY x->>'tipo', (x->>'id')::bigint
  LOOP
    v_tipo := v_item->>'tipo';
    v_id := (v_item->>'id')::bigint;
    v_valor := NULLIF(btrim(v_item->>'valor'), '');
    v_anterior := NULLIF(btrim(v_item->>'anterior'), '');
    v_actual := NULL;
    IF v_id IS NULL OR v_valor IS NULL OR v_anterior IS NULL THEN
      RAISE EXCEPTION 'Completa el valor y su referencia anterior';
    END IF;

    CASE v_tipo
      WHEN 'REGLA' THEN
        SELECT CASE WHEN r.tipo_calculo = 'PORCENTAJE' THEN r.porcentaje ELSE r.monto END::text,
               r.tipo_calculo INTO v_actual, v_calculo
        FROM public.tb_compensacion_regla r
        WHERE r.id = v_id AND r.id_plan_version = p_id_plan_version
          AND r.tipo_calculo <> 'FORMULA'
          AND COALESCE(r.configuracion->>'metodo_extra', '') <> 'RECARGO_TRAMOS'
        FOR UPDATE;
      WHEN 'META' THEN
        SELECT m.valor_meta::text INTO v_actual
        FROM public.tb_compensacion_meta_sede m
        WHERE m.id = v_id AND m.id_plan_version = p_id_plan_version FOR UPDATE;
      WHEN 'PENALIDAD' THEN
        SELECT p.monto_referencia::text INTO v_actual
        FROM public.tb_compensacion_penalidad_tipo p
        WHERE p.id = v_id AND p.id_plan_version = p_id_plan_version
          AND p.monto_referencia > 0 FOR UPDATE;
      ELSE
        RAISE EXCEPTION 'Parametro no permitido';
    END CASE;
    IF v_actual IS NULL THEN
      RAISE EXCEPTION 'El parametro no existe o no pertenece a esta configuracion';
    END IF;

    IF v_tipo IN ('ENTRADA','SALIDA','TOLERANCIA','REFRIGERIO','TOLERANCIA_CARGO') THEN
      RAISE EXCEPTION 'Parametro no permitido';
    ELSE
      IF v_valor !~ '^[0-9]+([.][0-9]+)?$' OR v_anterior !~ '^[0-9]+([.][0-9]+)?$' THEN
        RAISE EXCEPTION 'El importe debe ser un numero no negativo';
      END IF;
      IF v_actual::numeric <> v_anterior::numeric THEN
        RAISE EXCEPTION 'Otro usuario cambio este parametro. Actualiza antes de guardar';
      END IF;
      IF v_actual::numeric = v_valor::numeric THEN CONTINUE; END IF;
      CASE v_tipo
        WHEN 'REGLA' THEN
          IF v_calculo = 'PORCENTAJE' AND v_valor::numeric > 100 THEN
            RAISE EXCEPTION 'El porcentaje no puede superar 100';
          END IF;
          PERFORM public.f_patch_tb_compensacion_regla(
            p_id => v_id,
            p_monto => CASE WHEN v_calculo <> 'PORCENTAJE' THEN v_valor::numeric ELSE NULL END,
            p_porcentaje => CASE WHEN v_calculo = 'PORCENTAJE' THEN v_valor::numeric ELSE NULL END
          );
        WHEN 'META' THEN
          PERFORM public.f_patch_tb_compensacion_meta_sede(p_id => v_id, p_valor_meta => v_valor::numeric);
        WHEN 'PENALIDAD' THEN
          PERFORM public.f_patch_tb_compensacion_penalidad_tipo(p_id => v_id, p_monto_referencia => v_valor::numeric);
        ELSE
          RAISE EXCEPTION 'Parametro no permitido';
      END CASE;
    END IF;
    v_cantidad := v_cantidad + 1;
  END LOOP;
  RETURN jsonb_build_object('parametros_guardados', v_cantidad);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_referido(p_dni character varying, p_notas character varying, p_clave uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
 SET "TimeZone" TO 'America/Lima'
AS $function$
DECLARE
  v_contexto jsonb; v_colaborador bigint; v_cliente bigint; v_tipo bigint;
  v_clave text; v_resultado jsonb; v_existente record;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('REFERIDOS','REGISTRAR');
  v_colaborador := NULLIF(v_contexto->>'id_colaborador','')::bigint;
  IF v_colaborador IS NULL THEN RAISE EXCEPTION 'Tu usuario no tiene un colaborador activo asociado'; END IF;
  IF p_dni IS NULL OR btrim(p_dni) !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'Ingresa un DNI de 8 dígitos'; END IF;
  IF length(COALESCE(p_notas,'')) > 2000 THEN RAISE EXCEPTION 'Las notas admiten hasta 2000 caracteres'; END IF;
  IF p_clave IS NULL THEN RAISE EXCEPTION 'Falta la clave de registro'; END IF;
  v_clave := 'REFERIDO:' || (v_contexto->>'id_usuario') || ':' || p_clave::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_clave,0));
  SELECT r.id,r.id_evento,r.documento_referido_snapshot,e.descripcion,e.estado_evento
  INTO v_existente FROM public.tb_compensacion_referido r
  JOIN public.tb_compensacion_evento e ON e.id=r.id_evento
  WHERE e.fuente='CLIENTE' AND e.clave_origen=v_clave;
  IF FOUND THEN
    IF v_existente.documento_referido_snapshot IS DISTINCT FROM btrim(p_dni)
      OR COALESCE(v_existente.descripcion,'') IS DISTINCT FROM btrim(COALESCE(p_notas,'')) THEN
      RAISE EXCEPTION 'La clave de registro corresponde a otro referido';
    END IF;
    RETURN jsonb_build_object('id',v_existente.id,'id_evento',v_existente.id_evento,'estado_evento',v_existente.estado_evento);
  END IF;
  SELECT id INTO v_cliente FROM public.tb_cliente
  WHERE tipo_documento=1 AND numero_documento=btrim(p_dni);
  IF v_cliente IS NULL THEN RAISE EXCEPTION 'El DNI debe pertenecer a un cliente registrado en Operaciones'; END IF;
  -- Esquema 12, ATC: un mismo cliente no puede figurar como referido de dos usuarios distintos en esta opcion.
  PERFORM pg_advisory_xact_lock(hashtextextended('REFERIDO:CLIENTE:'||v_cliente,0));
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_referido r JOIN public.tb_compensacion_evento e ON e.id=r.id_evento
    WHERE r.id_cliente=v_cliente AND r.id_colaborador_referente IS DISTINCT FROM v_colaborador
      AND e.estado_evento NOT IN('ANULADO','RECHAZADO')) THEN
    RAISE EXCEPTION 'Este cliente ya fue registrado como referido por otro usuario';
  END IF;
  SELECT t.id INTO v_tipo FROM public.tb_compensacion_evento_tipo t
  JOIN public.tb_estado e ON e.id=t.id_estado AND upper(btrim(e.nombre))='ACTIVO'
  WHERE t.codigo='REFERIDO' AND t.categoria='REFERIDO';
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'El registro de referidos no está habilitado'; END IF;
  v_resultado := public.f_post_tb_compensacion_referido(v_tipo,v_cliente,v_colaborador,now(),
    NULLIF(btrim(p_notas),''),jsonb_build_array(jsonb_build_object('tipo','DECLARACION_REFERIDO',
      'documento',btrim(p_dni),'fecha',now(),'id_usuario_registra',(v_contexto->>'id_usuario')::bigint)),v_clave::varchar);
  PERFORM public.f_post_tb_compensacion_evento_enviar((v_resultado->>'id_evento')::bigint);
  RETURN v_resultado || jsonb_build_object('estado_evento','PENDIENTE','mensaje','Referido guardado. Pendiente de validación.');
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_referido_declaracion(p_dni character varying, p_notas character varying, p_clave uuid, p_nombre character varying, p_monto numeric, p_id_banco bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_resultado jsonb; v_banco varchar; v_declaracion jsonb; v_anterior jsonb; v_ctx jsonb; v_nuevo boolean:=false; v_cliente bigint;
BEGIN
  v_ctx:=public.f_private_compensacion_contexto('REFERIDOS','REGISTRAR');
  IF btrim(coalesce(p_dni,'')) !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'Ingresa un DNI de 8 digitos'; END IF;
  IF NULLIF(btrim(p_nombre),'') IS NULL OR length(btrim(p_nombre))>250 THEN
    RAISE EXCEPTION 'Ingresa el nombre del referido (hasta 250 caracteres)';
  END IF;
  IF p_monto IS NULL OR p_monto::text IN ('NaN','Infinity','-Infinity') OR p_monto<=0
    OR p_monto<>round(p_monto,2) OR p_monto>999999999999.99 THEN
    RAISE EXCEPTION 'Ingresa un monto mayor a cero, con hasta dos decimales';
  END IF;
  SELECT nombre INTO v_banco FROM public.tb_banco WHERE id=p_id_banco AND id_estado=1;
  IF v_banco IS NULL THEN RAISE EXCEPTION 'Selecciona un banco activo'; END IF;
  -- Serializa altas por documento; un cliente antiguo nunca cambia de captador.
  PERFORM pg_advisory_xact_lock(hashtextextended('CLIENTE:DNI:'||btrim(p_dni),0));
  SELECT id INTO v_cliente FROM public.tb_cliente WHERE tipo_documento=1 AND numero_documento=btrim(p_dni);
  IF v_cliente IS NULL THEN
    BEGIN
      PERFORM public.f_post_tb_cliente(1,btrim(p_dni),btrim(p_nombre),NULL,
       (SELECT id FROM public.tb_comunidad WHERE upper(btrim(nombre))='ATK1' LIMIT 1),
       (SELECT id FROM public.tb_estado WHERE upper(btrim(nombre))='ACTIVO' LIMIT 1),(v_ctx->>'id_usuario')::bigint);
      v_nuevo:=true;
    EXCEPTION WHEN unique_violation THEN
      IF NOT EXISTS(SELECT 1 FROM public.tb_cliente WHERE tipo_documento=1 AND numero_documento=btrim(p_dni)) THEN RAISE; END IF;
    END;
  END IF;
  -- La función base serializa por usuario/clave y conserva la autorización y el estado pendiente.
  v_resultado := public.f_post_compensacion_referido(p_dni,p_notas,p_clave);
  v_declaracion := jsonb_build_object('nombre',btrim(p_nombre),'monto',p_monto,'id_banco',p_id_banco,'banco',v_banco);
  SELECT datos->'declaracion_referido' INTO v_anterior FROM public.tb_compensacion_evento
    WHERE id=(v_resultado->>'id_evento')::bigint FOR UPDATE;
  IF v_anterior IS NOT NULL THEN
    IF (v_anterior - 'banco') IS DISTINCT FROM (v_declaracion - 'banco') THEN
      RAISE EXCEPTION 'La clave de registro corresponde a otra declaración';
    END IF;
    RETURN v_resultado;
  END IF;
  UPDATE public.tb_compensacion_evento SET datos=COALESCE(datos,'{}'::jsonb)||jsonb_build_object('declaracion_referido',v_declaracion,'cliente_creado_en_referido',v_nuevo,'flujo_referido','MATCH_7_DIAS_V2')
    WHERE id=(v_resultado->>'id_evento')::bigint AND estado_evento='PENDIENTE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Solo se puede declarar un referido pendiente'; END IF;
  UPDATE public.tb_compensacion_referido SET nombre_referido_snapshot=btrim(p_nombre)
    WHERE id=(v_resultado->>'id')::bigint;
  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_referido_efectivizacion(p_id bigint, p_id_operacion bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
 SET "TimeZone" TO 'America/Lima'
AS $function$ BEGIN RAISE EXCEPTION 'Registra un nuevo referido para otra visita u operacion; cada declaracion tiene su plazo de siete dias'; END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_referido_efectivizacion_resolver(p_id bigint, p_decision character varying, p_comentario text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_base numeric;
BEGIN
 PERFORM public.f_private_compensacion_evento_validar_alcance(p_id,
   CASE WHEN upper(btrim(p_decision))='APROBADO' THEN 'APROBAR' ELSE 'REVISAR' END,true);
 IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
   WHERE e.id=p_id AND t.categoria='REFERIDO' AND e.datos ? 'id_referido') THEN RAISE EXCEPTION 'Selecciona una efectivizacion adicional'; END IF;
 SELECT op.monto_deposito_cliente INTO v_base FROM public.tb_operacion_proceso op JOIN public.tb_compensacion_evento_referencia er ON er.id_operacion=op.id WHERE er.id_evento=p_id;
 RETURN public.f_post_tb_compensacion_evento_resolver(p_id,p_decision,p_comentario,v_base,1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_referido_revertir(p_id bigint, p_version timestamp with time zone, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
 v_ctx jsonb; v_ref public.tb_compensacion_referido%ROWTYPE;
 v_event public.tb_compensacion_evento%ROWTYPE; v_ids bigint[]; v_actual bigint[]; v_actor bigint; v_count integer:=0;
BEGIN
 v_ctx:=public.f_private_compensacion_contexto('REFERIDOS','REVISAR');
 IF NOT COALESCE((v_ctx->>'es_super_admin')::boolean,false) THEN RAISE EXCEPTION 'Solo el administrador puede revertir referidos'; END IF;
 IF NULLIF(btrim(p_motivo),'') IS NULL OR length(btrim(p_motivo))>2000 THEN RAISE EXCEPTION 'Indica el motivo de la reversión (hasta 2000 caracteres)'; END IF;
 v_actor:=(v_ctx->>'id_usuario')::bigint;
 SELECT * INTO v_ref FROM public.tb_compensacion_referido WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'El referido no existe'; END IF;
 SELECT array_agg(id ORDER BY id) INTO v_ids FROM public.tb_compensacion_evento
 WHERE id=v_ref.id_evento OR datos->>'id_referido'=p_id::text;
 -- Orden compartido con Cierres y resoluciones: periodos -> eventos -> referido.
 PERFORM p.id FROM public.tb_compensacion_periodo p WHERE p.periodo IN
   (SELECT periodo_imputacion FROM public.tb_compensacion_evento WHERE id=ANY(v_ids)) ORDER BY p.id FOR UPDATE;
 PERFORM e.id FROM public.tb_compensacion_evento e WHERE id=ANY(v_ids) ORDER BY e.id FOR UPDATE;
 SELECT * INTO v_ref FROM public.tb_compensacion_referido WHERE id=p_id FOR UPDATE;
 SELECT array_agg(id ORDER BY id) INTO v_actual FROM public.tb_compensacion_evento
 WHERE id=v_ref.id_evento OR datos->>'id_referido'=p_id::text;
 IF v_actual IS DISTINCT FROM v_ids THEN RAISE EXCEPTION 'El referido cambió. Actualiza la lista e intenta nuevamente'; END IF;
 PERFORM public.f_private_compensacion_evento_validar_alcance(v_ref.id_evento,'REVISAR',false);
 SELECT * INTO v_event FROM public.tb_compensacion_evento WHERE id=v_ref.id_evento;
 IF p_version IS NULL OR p_version IS DISTINCT FROM v_event.fecha_actualizacion THEN RAISE EXCEPTION 'El referido cambió. Actualiza la lista e intenta nuevamente'; END IF;
 IF v_ref.estado_referido<>'VALIDADO' OR v_event.estado_evento<>'APROBADO' THEN RAISE EXCEPTION 'Solo se puede revertir un referido validado y no liquidado'; END IF;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento e WHERE e.id=ANY(v_ids) AND e.estado_evento='LIQUIDADO')
   OR EXISTS(SELECT 1 FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_periodo p ON p.periodo=e.periodo_imputacion
     WHERE e.id=ANY(v_ids) AND p.estado_periodo IN ('APROBADO','CERRADO'))
   OR EXISTS(SELECT 1 FROM public.tb_compensacion_evento e2 WHERE e2.id=ANY(v_ids) AND EXISTS(SELECT 1 FROM public.tb_compensacion_reporte_mes rm JOIN public.tb_compensacion_periodo rp ON rp.id=rm.id_periodo WHERE rp.periodo=e2.periodo_imputacion AND rm.estado='CONFIRMADO')) THEN
   RAISE EXCEPTION 'El referido pertenece a un reporte confirmado o a un periodo aprobado/cerrado; requiere un ajuste, no una reversión';
 END IF;
 FOR v_event IN SELECT * FROM public.tb_compensacion_evento WHERE id=ANY(v_ids) AND estado_evento='APROBADO' ORDER BY id LOOP
   INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
   SELECT v_event.id,COALESCE(max(numero_paso),0)+1,'ADMIN_REFERIDO_REVERSION','OBSERVADO',btrim(p_motivo),v_actor,
     jsonb_build_object('accion','REVERTIR_VALIDACION','anterior',to_jsonb(v_event),'nuevo_estado','PENDIENTE',
       'operaciones',COALESCE((SELECT jsonb_agg(to_jsonb(ro)) FROM public.tb_compensacion_referido_operacion ro WHERE ro.id_evento=v_event.id),'[]'::jsonb))
   FROM public.tb_compensacion_evento_revision WHERE id_evento=v_event.id;
   UPDATE public.tb_compensacion_evento SET estado_evento='PENDIENTE',id_regla_aplicada=NULL,base_calculo=NULL,
     cantidad=NULL,tarifa_aplicada=NULL,importe_aprobado=NULL,fecha_actualizacion=clock_timestamp() WHERE id=v_event.id;
   v_count:=v_count+1;
 END LOOP;
 UPDATE public.tb_compensacion_referido SET estado_referido='PENDIENTE',fecha_actualizacion=clock_timestamp() WHERE id=p_id;
 RETURN jsonb_build_object('id',p_id,'estado_referido','PENDIENTE','validaciones_revertidas',v_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_referido_validar(p_id bigint, p_id_operacion bigint, p_conversacion text DEFAULT NULL::text, p_comentario text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE caso public.tb_compensacion_referido%ROWTYPE; ctx jsonb; existente text; enlace text:=nullif(btrim(p_conversacion),'');
  fecha_operacion timestamptz; periodo_original date;
BEGIN
  SELECT * INTO caso FROM public.tb_compensacion_referido WHERE id=p_id;
  IF caso.id IS NULL THEN RAISE EXCEPTION 'El referido no existe'; END IF;
  IF p_id_operacion IS NULL THEN p_id_operacion:=(public.f_private_compensacion_referido_match(p_id)#>>'{operacion,id}')::bigint; END IF;
  IF p_id_operacion IS NULL THEN RAISE EXCEPTION 'No hay una coincidencia unica; revisa la declaracion'; END IF;
  SELECT periodo_imputacion INTO periodo_original FROM public.tb_compensacion_evento WHERE id=caso.id_evento;
  SELECT coalesce(fecha_pagado,fecha_deposito_cliente,fecha_registro) INTO fecha_operacion FROM public.tb_operacion_proceso WHERE id=p_id_operacion;
  PERFORM id FROM public.tb_compensacion_periodo WHERE periodo IN(periodo_original,date_trunc('month',fecha_operacion AT TIME ZONE 'America/Lima')::date) ORDER BY id FOR UPDATE;
  ctx:=public.f_private_compensacion_evento_validar_alcance(caso.id_evento,'APROBAR',true);
  SELECT * INTO caso FROM public.tb_compensacion_referido WHERE id=p_id FOR UPDATE;
  PERFORM id FROM public.tb_operacion_proceso WHERE id=p_id_operacion FOR SHARE;
  IF periodo_original IS DISTINCT FROM (SELECT periodo_imputacion FROM public.tb_compensacion_evento WHERE id=caso.id_evento)
    OR fecha_operacion IS DISTINCT FROM (SELECT coalesce(fecha_pagado,fecha_deposito_cliente,fecha_registro) FROM public.tb_operacion_proceso WHERE id=p_id_operacion) THEN
    RAISE EXCEPTION 'El referido o la operacion cambiaron; actualiza antes de validar';
  END IF;
  IF caso.estado_referido<>'PENDIENTE' THEN RAISE EXCEPTION 'Solo se valida un referido pendiente'; END IF;
  SELECT identificador_externo INTO existente FROM public.tb_compensacion_evento_referencia
    WHERE id_evento=caso.id_evento AND tipo_referencia='PANCAKE' ORDER BY id LIMIT 1;
  IF enlace IS NULL THEN enlace:=existente; END IF;
  IF enlace IS NOT NULL AND (length(enlace)>250 OR enlace !~ '^https://[^[:space:]]+$') THEN
    RAISE EXCEPTION 'Adjunta el enlace HTTPS de la conversacion que sustenta el referido';
  END IF;
  IF existente IS NOT NULL AND existente IS DISTINCT FROM enlace THEN RAISE EXCEPTION 'El referido ya tiene otra conversacion vinculada'; END IF;
  IF existente IS NULL AND enlace IS NOT NULL THEN
    INSERT INTO public.tb_compensacion_evento_referencia(id_evento,tipo_referencia,identificador_externo,id_usuario)
    VALUES(caso.id_evento,'PANCAKE',enlace,(ctx->>'id_usuario')::bigint);
  END IF;
  RETURN public.f_post_tb_compensacion_referido_resolver(p_id,'APROBADO',p_id_operacion,p_comentario);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_reporte_mes_confirmar(p_id_periodo bigint, p_nota text DEFAULT NULL::text, p_incluir_bloqueados boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_actor bigint;
  v_rep public.tb_compensacion_reporte_mes%ROWTYPE;
  v_filas jsonb;
  v_snapshot jsonb;
  v_hash text;
  v_bloqueados integer;
  v_pasada integer := 0;
BEGIN
  v_actor := public.f_private_compensacion_bonos_mes_admin();
  PERFORM 1 FROM public.tb_compensacion_periodo WHERE id = p_id_periodo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Periodo inexistente'; END IF;
  SELECT * INTO v_rep FROM public.tb_compensacion_reporte_mes WHERE id_periodo = p_id_periodo FOR UPDATE;
  IF v_rep.estado = 'CONFIRMADO' THEN RAISE EXCEPTION 'El reporte del mes ya está confirmado'; END IF;
  -- Dejar al día el seguimiento antes de fijar el reporte, para que Dashboard y Mis Bonos coincidan con lo confirmado.
  WHILE v_pasada < 10 AND EXISTS (SELECT 1 FROM public.tb_compensacion_seguimiento_invalidacion i
      JOIN public.tb_compensacion_periodo p ON p.periodo = i.periodo WHERE p.id = p_id_periodo AND NOT i.procesada) LOOP
    PERFORM public.f_private_compensacion_seguimiento_procesar(100);
    v_pasada := v_pasada + 1;
  END LOOP;
  SELECT coalesce(jsonb_agg(public.f_private_compensacion_bonos_mes_fila(p_id_periodo, c.id_colaborador) ORDER BY c.id_colaborador), '[]'::jsonb)
    INTO v_filas FROM public.f_private_compensacion_bonos_mes_colaboradores(p_id_periodo) c;
  SELECT count(*) INTO v_bloqueados FROM jsonb_array_elements(v_filas) f WHERE NOT (f->>'puede_calcular')::boolean;
  IF v_bloqueados > 0 AND NOT coalesce(p_incluir_bloqueados, false) THEN
    RAISE EXCEPTION 'No se puede confirmar: % colaborador(es) tienen bloqueos pendientes de resolver', v_bloqueados;
  END IF;
  v_snapshot := jsonb_build_object(
    'colaboradores', v_filas, 'bloqueados_incluidos', v_bloqueados,
    'totales', jsonb_build_object(
      'total_bonos', coalesce((SELECT sum((f->>'total_bonos')::numeric) FROM jsonb_array_elements(v_filas) f), 0),
      'total_comisiones', coalesce((SELECT sum((f->>'total_comisiones')::numeric) FROM jsonb_array_elements(v_filas) f), 0),
      'total_descuentos', coalesce((SELECT sum((f->>'total_descuentos')::numeric) FROM jsonb_array_elements(v_filas) f), 0),
      'total_neto', coalesce((SELECT sum((f->>'total_neto')::numeric) FROM jsonb_array_elements(v_filas) f), 0)));
  v_hash := encode(sha256(convert_to(v_snapshot::text, 'UTF8')), 'hex');
  INSERT INTO public.tb_compensacion_reporte_mes(id_periodo, estado, nota, snapshot, hash_contenido, confirmado_por, confirmado_en, veces_confirmado)
  VALUES (p_id_periodo, 'CONFIRMADO', nullif(btrim(coalesce(p_nota, '')), ''), v_snapshot, v_hash, v_actor, now(), 1)
  ON CONFLICT (id_periodo) DO UPDATE
    SET estado = 'CONFIRMADO', nota = EXCLUDED.nota, snapshot = EXCLUDED.snapshot, hash_contenido = EXCLUDED.hash_contenido,
        confirmado_por = EXCLUDED.confirmado_por, confirmado_en = EXCLUDED.confirmado_en,
        veces_confirmado = public.tb_compensacion_reporte_mes.veces_confirmado + 1, fecha_actualizacion = now();
  RETURN jsonb_build_object('id_periodo', p_id_periodo, 'estado', 'CONFIRMADO', 'hash_contenido', v_hash,
    'totales', v_snapshot->'totales', 'colaboradores', jsonb_array_length(v_filas));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_reporte_mes_reabrir(p_id_periodo bigint, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_actor bigint;
  v_rep public.tb_compensacion_reporte_mes%ROWTYPE;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_mes date;
  v_pasada integer := 0;
BEGIN
  v_actor := public.f_private_compensacion_bonos_mes_admin();
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'El motivo de reapertura es obligatorio'; END IF;
  SELECT periodo INTO v_mes FROM public.tb_compensacion_periodo WHERE id = p_id_periodo FOR UPDATE;
  IF v_mes IS NULL THEN RAISE EXCEPTION 'Periodo inexistente'; END IF;
  SELECT * INTO v_rep FROM public.tb_compensacion_reporte_mes WHERE id_periodo = p_id_periodo FOR UPDATE;
  IF v_rep.estado IS DISTINCT FROM 'CONFIRMADO' THEN RAISE EXCEPTION 'El reporte del mes no está confirmado'; END IF;
  UPDATE public.tb_compensacion_reporte_mes
     SET estado = 'BORRADOR', snapshot = NULL, hash_contenido = NULL, confirmado_por = NULL, confirmado_en = NULL,
         reabierto_por = v_actor, reabierto_en = now(), motivo_reapertura = v_motivo, fecha_actualizacion = now()
   WHERE id_periodo = p_id_periodo;
  -- Descongelar y recalcular el seguimiento del mes (el historial _his conserva lo confirmado antes).
  UPDATE public.tb_compensacion_seguimiento_resultado SET congelado = false, requiere_revision = false WHERE periodo = v_mes;
  INSERT INTO public.tb_compensacion_seguimiento_invalidacion(periodo, id_colaborador, motivo)
  SELECT v_mes, r.id_colaborador, 'reporte_mes_reabierto' FROM public.tb_compensacion_seguimiento_resultado r WHERE r.periodo = v_mes;
  WHILE v_pasada < 10 AND EXISTS (SELECT 1 FROM public.tb_compensacion_seguimiento_invalidacion i WHERE i.periodo = v_mes AND NOT i.procesada) LOOP
    PERFORM public.f_private_compensacion_seguimiento_procesar(100);
    v_pasada := v_pasada + 1;
  END LOOP;
  RETURN jsonb_build_object('id_periodo', p_id_periodo, 'estado', 'BORRADOR');
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_safetypay_conciliar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
  PERFORM public.f_private_compensacion_safetypay_panel_contexto();
  RETURN jsonb_build_object('actualizados',public.f_private_compensacion_safetypay_conciliar(NULL));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_tarjeta_archivo_sustento(p_id bigint, p_evidencia jsonb, p_codigo_operacion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; ev public.tb_compensacion_evento%ROWTYPE;
  categoria text; op bigint; total integer; prueba jsonb;
BEGIN
  ctx:=public.f_private_compensacion_evento_validar_alcance(p_id,'CONSULTAR',true);
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id FOR UPDATE;
  SELECT t.categoria INTO categoria FROM public.tb_compensacion_evento_tipo t WHERE t.id=ev.id_tipo_evento;
  IF categoria<>'TARJETA_TERCERO' OR categoria IS NULL THEN
    RAISE EXCEPTION 'Este registro no admite sustento de contacto o tarjeta'; END IF;
  IF ev.id_usuario_registra IS DISTINCT FROM (ctx->>'id_usuario')::bigint THEN
    RAISE EXCEPTION 'Solo el autor puede completar el sustento'; END IF;
  IF ev.estado_evento NOT IN('BORRADOR','PENDIENTE') THEN
    RAISE EXCEPTION 'Solo puedes completar registros pendientes o en borrador'; END IF;
  PERFORM 1 FROM public.tb_compensacion_periodo
    WHERE periodo=ev.periodo_imputacion AND estado_periodo='ABIERTO' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El periodo no esta abierto'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('tarjeta:archivo:'||(p_evidencia->>'path'),0));
  PERFORM id FROM storage.objects WHERE bucket_id='compensaciones-tarjetas-erroneas' AND name=p_evidencia->>'path' FOR SHARE;
  IF NOT public.f_private_compensacion_tarjeta_archivo_valido(p_evidencia,ev.id_usuario_registra) THEN
    RAISE EXCEPTION 'Archivo de tarjeta inexistente, ajeno o con metadatos invalidos'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento otro CROSS JOIN LATERAL jsonb_array_elements(otro.evidencia) a
    WHERE otro.id<>ev.id AND a->>'bucket'=p_evidencia->>'bucket' AND a->>'path'=p_evidencia->>'path') THEN
    RAISE EXCEPTION 'El archivo ya esta vinculado a otro registro'; END IF;
  IF nullif(btrim(p_codigo_operacion),'') IS NOT NULL THEN
    IF length(btrim(p_codigo_operacion))>100 THEN RAISE EXCEPTION 'Codigo demasiado largo'; END IF;
    -- DNI y codigo exactos, sin exigir pago ni exponer catalogos generales.
    SELECT count(*),min(o.id) INTO total,op FROM public.tb_operacion_proceso o
    WHERE o.id_operacion_padre IS NULL
      AND btrim(o.codigo_operacion_deposito_cliente)=btrim(p_codigo_operacion)
      AND btrim(o.dni_cliente)=ev.datos->>'cliente_documento'
      AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada x WHERE x.id_operacion_proceso=o.id);
    IF total<>1 THEN RAISE EXCEPTION 'Operacion inexistente o ambigua para este DNI; verifica el codigo'; END IF;
  END IF;
  prueba:=p_evidencia||jsonb_build_object(
    'codigo_operacion',nullif(btrim(p_codigo_operacion),''),'id_usuario',(ctx->>'id_usuario')::bigint);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(ev.evidencia) e WHERE e->>'tipo' IN('SUSTENTO_ATC','IMAGEN_TARJETA')) THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(ev.evidencia) e
      WHERE e->>'tipo' IN('SUSTENTO_ATC','IMAGEN_TARJETA') AND e IS DISTINCT FROM prueba) THEN
      RAISE EXCEPTION 'El registro ya tiene otro sustento; requiere revision'; END IF;
    RETURN jsonb_build_object('id',ev.id,'estado_evento',ev.estado_evento);
  END IF;
  IF op IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia r
      WHERE r.id_evento=ev.id AND r.tipo_referencia='OPERACION' AND r.id_operacion IS DISTINCT FROM op) THEN
      RAISE EXCEPTION 'Ya existe otra operacion vinculada'; END IF;
    INSERT INTO public.tb_compensacion_evento_referencia(id_evento,tipo_referencia,id_operacion,datos_snapshot,id_usuario)
      SELECT ev.id,'OPERACION',op,jsonb_build_object('codigo',btrim(p_codigo_operacion)),(ctx->>'id_usuario')::bigint
      WHERE NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia r
        WHERE r.id_evento=ev.id AND r.tipo_referencia='OPERACION' AND r.id_operacion=op);
  END IF;
  UPDATE public.tb_compensacion_evento SET evidencia=evidencia||jsonb_build_array(prueba),
    fecha_actualizacion=clock_timestamp() WHERE id=ev.id;
  RETURN jsonb_build_object('id',ev.id,'estado_evento',ev.estado_evento);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_tarjeta_archivo_trazable(p_dni character varying, p_nombre character varying, p_fecha date, p_notas character varying, p_clave uuid, p_evidencia jsonb, p_codigo_operacion text, p_tarjeta_ultimos4 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE resultado jsonb; v_u4 text := public.f_private_compensacion_tarjeta_ultimos4(p_tarjeta_ultimos4);
BEGIN
  resultado:=public.f_post_compensacion_tarjeta_tercero(p_dni,p_nombre,p_fecha,p_notas,p_clave);
  UPDATE public.tb_compensacion_evento SET datos=datos||jsonb_build_object('tarjeta_ultimos4',v_u4)
   WHERE id=(resultado->>'id')::bigint AND estado_evento IN('BORRADOR','PENDIENTE');
  PERFORM public.f_post_compensacion_tarjeta_archivo_sustento((resultado->>'id')::bigint,p_evidencia,p_codigo_operacion);
  RETURN resultado;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_tarjeta_tercero(p_dni character varying, p_nombre character varying, p_fecha date, p_notas character varying, p_clave uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
 SET "TimeZone" TO 'America/Lima'
AS $function$
DECLARE v_contexto jsonb; v_colaborador bigint; v_tipo bigint; v_evento jsonb;
  v_clave text; v_existente public.tb_compensacion_evento%ROWTYPE;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('TARJETAS', 'REGISTRAR');
  v_colaborador := NULLIF(v_contexto->>'id_colaborador','')::bigint;
  IF v_colaborador IS NULL THEN
    RAISE EXCEPTION 'Tu usuario no tiene un colaborador activo asociado. Solicita que vinculen tu cuenta.';
  END IF;
  IF p_dni IS NULL OR btrim(p_dni) !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'Ingresa un DNI de 8 dígitos'; END IF;
  IF p_nombre IS NULL OR length(btrim(p_nombre)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Ingresa el nombre del cliente (máximo 200 caracteres)';
  END IF;
  IF p_fecha IS NULL OR p_fecha > (now() AT TIME ZONE 'America/Lima')::date THEN
    RAISE EXCEPTION 'Ingresa una fecha de detección válida, no futura';
  END IF;
  IF length(COALESCE(p_notas,'')) > 2000 THEN RAISE EXCEPTION 'Las notas admiten máximo 2000 caracteres'; END IF;
  IF p_clave IS NULL THEN RAISE EXCEPTION 'Falta la clave de registro'; END IF;
  v_clave := 'TARJETA_TERCERO:' || (v_contexto->>'id_usuario') || ':' || p_clave::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_clave,0));
  SELECT * INTO v_existente FROM public.tb_compensacion_evento WHERE fuente='MANUAL' AND clave_origen=v_clave;
  IF FOUND THEN
    IF v_existente.datos->>'cliente_documento' IS DISTINCT FROM btrim(p_dni)
       OR v_existente.datos->>'cliente_nombre' IS DISTINCT FROM btrim(p_nombre)
       OR v_existente.datos->>'fecha_detectada' IS DISTINCT FROM p_fecha::text
       OR COALESCE(v_existente.descripcion,'') IS DISTINCT FROM btrim(COALESCE(p_notas,'')) THEN
      RAISE EXCEPTION 'La clave de registro ya corresponde a otra tarjeta';
    END IF;
    RETURN jsonb_build_object('id',v_existente.id,'estado_evento',v_existente.estado_evento);
  END IF;
  SELECT t.id INTO v_tipo FROM public.tb_compensacion_evento_tipo t
    JOIN public.tb_estado e ON e.id=t.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE t.codigo='SEGURIDAD_TARJETA' AND t.categoria='TARJETA_TERCERO';
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'El registro de tarjetas no está habilitado'; END IF;
  v_evento := public.f_post_tb_compensacion_evento(
    p_id_tipo_evento => v_tipo,
    p_fecha_evento => p_fecha::timestamp AT TIME ZONE 'America/Lima',
    p_id_colaborador_beneficiario => v_colaborador,
    p_periodo_imputacion => date_trunc('month',p_fecha)::date,
    p_clave_origen => v_clave::varchar,
    p_descripcion => NULLIF(btrim(COALESCE(p_notas,'')),''),
    p_datos => jsonb_build_object('cliente_documento',btrim(p_dni),'cliente_nombre',btrim(p_nombre),'fecha_detectada',p_fecha),
    -- Registro declarado por el operador: no simula foto, tarjeta ni verificación externa.
    p_evidencia => jsonb_build_array(jsonb_build_object('tipo','REGISTRO_TARJETA_TERCERO',
      'documento',btrim(p_dni),'nombre',btrim(p_nombre),'fecha_detectada',p_fecha,
      'id_usuario_registra',(v_contexto->>'id_usuario')::bigint)),
    p_referencias => jsonb_build_array(jsonb_build_object('tipo_referencia','CLIENTE',
      'identificador_externo',btrim(p_dni),'datos_snapshot',jsonb_build_object('documento',btrim(p_dni),'nombre',btrim(p_nombre))))
  );
  RETURN public.f_post_tb_compensacion_evento_enviar((v_evento->>'id')::bigint);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_tarjeta_trazable(p_dni character varying, p_nombre character varying, p_fecha date, p_notas character varying, p_clave uuid, p_evidencia text, p_codigo_operacion text, p_tarjeta_ultimos4 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE resultado jsonb; v_u4 text := public.f_private_compensacion_tarjeta_ultimos4(p_tarjeta_ultimos4);
BEGIN
  resultado:=public.f_post_compensacion_tarjeta_tercero(p_dni,p_nombre,p_fecha,p_notas,p_clave);
  UPDATE public.tb_compensacion_evento SET datos=datos||jsonb_build_object('tarjeta_ultimos4',v_u4)
   WHERE id=(resultado->>'id')::bigint AND estado_evento IN('BORRADOR','PENDIENTE');
  PERFORM public.f_post_compensacion_atc_sustento((resultado->>'id')::bigint,p_evidencia,p_codigo_operacion);
  RETURN resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_tiktok_cliente(p_documento text, p_nombre text, p_tipo_documento bigint, p_celular text, p_id_comunidad bigint, p_evidencia jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; usuario bigint; cliente jsonb; tipo bigint; col bigint; sede bigint; evento bigint;
BEGIN
 ctx:=public.f_private_compensacion_contexto('BONO:TIKTOK_LIVE','REGISTRAR');
 usuario:=public.f_private_compensacion_cliente_nuevo_usuario();
 col:=(ctx->>'id_colaborador')::bigint;
 IF col IS NULL THEN RAISE EXCEPTION 'No tienes colaborador activo'; END IF;
 IF p_evidencia->>'tipo' IS DISTINCT FROM 'IMAGEN_TIKTOK' OR p_evidencia->>'bucket' IS DISTINCT FROM 'compensaciones-tiktok-live'
   OR NOT coalesce(public.f_private_compensacion_tiktok_storage('SUBIR',p_evidencia->>'path'),false)
   OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=p_evidencia->>'bucket' AND o.name=p_evidencia->>'path'
     AND o.metadata->>'mimetype' IN('image/jpeg','image/png','image/webp')
     AND (o.metadata->>'size')::numeric BETWEEN 1 AND 5242880) THEN
   RAISE EXCEPTION 'Adjunta una captura de evidencia propia de TikTok Live (hasta 5 MB)'; END IF;
 SELECT t.id INTO tipo FROM public.tb_compensacion_evento_tipo t JOIN public.tb_estado e ON e.id=t.id_estado
   WHERE t.codigo='TIKTOK_LIVE' AND upper(btrim(e.nombre))='ACTIVO';
 IF tipo IS NULL THEN RAISE EXCEPTION 'TikTok Live no disponible'; END IF;
 SELECT a.id_sucursal INTO sede FROM public.tb_compensacion_asignacion a JOIN public.tb_estado e ON e.id=a.id_estado
   WHERE a.id_colaborador=col AND upper(btrim(e.nombre))='ACTIVO'
     AND (now() AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)
   ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1;
 IF sede IS NULL THEN RAISE EXCEPTION 'No tienes asignación vigente'; END IF;
 IF EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=usuario AND id_rol=6) THEN
  cliente:=public.f_private_compensacion_marketing_cliente_crear(p_documento,p_nombre,p_tipo_documento,p_celular,p_id_comunidad);
 ELSE cliente:=public.f_post_compensacion_cliente_nuevo(p_documento,p_nombre,p_tipo_documento,p_celular,p_id_comunidad); END IF;
 INSERT INTO public.tb_compensacion_evento(id_tipo_evento,id_colaborador_beneficiario,id_sucursal_origen,fecha_evento,periodo_imputacion,fuente,clave_origen,titulo,datos,evidencia,estado_evento,id_usuario_registra)
 VALUES(tipo,col,sede,(cliente->>'fecha_registro')::timestamptz,date_trunc('month',(cliente->>'fecha_registro')::timestamptz AT TIME ZONE 'America/Lima')::date,
   'CLIENTE','TIKTOK_REGISTRO:'||(cliente->>'id'),'Registro TikTok Live',jsonb_build_object('flujo','TIKTOK_CLIENTE_NUEVO_7_DIAS'),jsonb_build_array(p_evidencia),'PENDIENTE',usuario) RETURNING id INTO evento;
 INSERT INTO public.tb_compensacion_evento_referencia(id_evento,tipo_referencia,id_cliente,id_usuario)
   VALUES(evento,'CLIENTE',(cliente->>'id')::bigint,usuario);
 RETURN cliente||jsonb_build_object('id_evento',evento);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_compensacion_tiktok_cuota_resolver(p_id bigint, p_comentario text, p_cuota_cumplida boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
 PERFORM public.f_private_compensacion_evento_validar_alcance(p_id,'APROBAR',true);
 RAISE EXCEPTION 'La cuota manual TikTok fue retirada; la conversion depende del pago real y evidencia al alta';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_asignacion_cambio(p_id_colaborador bigint, p_id_cargo bigint, p_id_sucursal bigint, p_id_plan bigint, p_fecha_inicio date, p_modalidad character varying DEFAULT 'PRESENCIAL'::character varying, p_observacion text DEFAULT NULL::text, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_alcance character varying;
  v_id_sucursal_alcance bigint;
  v_colaborador public.tb_compensacion_colaborador%ROWTYPE;
  v_actual public.tb_compensacion_asignacion%ROWTYPE;
  v_id_estado bigint;
  v_id bigint;
BEGIN
  IF p_fecha_inicio IS NULL THEN
    RAISE EXCEPTION 'La fecha de inicio es obligatoria';
  END IF;

  SELECT *
  INTO v_colaborador
  FROM public.tb_compensacion_colaborador
  WHERE id = p_id_colaborador
  FOR UPDATE;

  IF v_colaborador.id IS NULL THEN
    RAISE EXCEPTION 'El colaborador no existe';
  END IF;

  v_contexto := public.f_private_compensacion_contexto(
    'COLABORADORES',
    'EDITAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;
  v_alcance := v_contexto ->> 'alcance';
  v_id_sucursal_alcance := NULLIF(
    v_contexto ->> 'id_sucursal_alcance',
    ''
  )::bigint;

  IF v_alcance = 'PROPIO' THEN
    RAISE EXCEPTION 'Un acceso propio no puede modificar asignaciones laborales';
  END IF;

  IF p_fecha_inicio < v_colaborador.fecha_ingreso THEN
    RAISE EXCEPTION 'La asignacion no puede iniciar antes del ingreso del colaborador';
  END IF;

  IF v_colaborador.fecha_cese IS NOT NULL
     AND p_fecha_inicio > v_colaborador.fecha_cese THEN
    RAISE EXCEPTION 'La asignacion no puede iniciar despues del cese del colaborador';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_compensacion_periodo pe
    WHERE pe.estado_periodo IN('APROBADO','CERRADO')
      AND p_fecha_inicio BETWEEN pe.fecha_inicio AND pe.fecha_fin
  ) THEN
    RAISE EXCEPTION 'No se puede modificar una asignacion dentro de un periodo cerrado';
  END IF;

  SELECT a.*
  INTO v_actual
  FROM public.tb_compensacion_asignacion a
  WHERE a.id_colaborador = p_id_colaborador
    AND a.fecha_inicio <= p_fecha_inicio
    AND (a.fecha_fin IS NULL OR a.fecha_fin >= p_fecha_inicio)
  ORDER BY a.fecha_inicio DESC, a.id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_actual.id IS NOT NULL
     AND v_actual.fecha_inicio = p_fecha_inicio
     AND EXISTS (
       SELECT 1
       FROM public.tb_compensacion_periodo pe
       WHERE pe.estado_periodo IN('APROBADO','CERRADO')
         AND daterange(pe.fecha_inicio, pe.fecha_fin, '[]')
             && daterange(
               v_actual.fecha_inicio,
               COALESCE(v_actual.fecha_fin, 'infinity'::date),
               '[]'
             )
     ) THEN
    RAISE EXCEPTION 'No se puede corregir una asignacion que alcanza periodos cerrados';
  END IF;

  IF EXISTS(SELECT 1 FROM public.tb_compensacion_reporte_mes rm JOIN public.tb_compensacion_periodo pe ON pe.id=rm.id_periodo WHERE rm.estado='CONFIRMADO' AND pe.fecha_fin>=p_fecha_inicio) THEN
    RAISE EXCEPTION 'La asignacion afecta un reporte confirmado; usa una vigencia posterior';
  END IF;
  
  IF v_alcance = 'SEDE' AND (
    v_actual.id IS NULL
    OR v_actual.id_sucursal IS DISTINCT FROM v_id_sucursal_alcance
    OR p_id_sucursal IS DISTINCT FROM v_id_sucursal_alcance
  ) THEN
    RAISE EXCEPTION 'Un acceso de sede no puede trasladar colaboradores entre sedes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_cargo WHERE id = p_id_cargo AND id_estado IN(SELECT id FROM public.tb_estado WHERE upper(btrim(nombre))='ACTIVO')
  ) THEN
    RAISE EXCEPTION 'El cargo seleccionado no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_sucursal WHERE id = p_id_sucursal AND id_estado IN(SELECT id FROM public.tb_estado WHERE upper(btrim(nombre))='ACTIVO')
  ) THEN
    RAISE EXCEPTION 'La sucursal seleccionada no existe';
  END IF;

  

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_plan WHERE id = p_id_plan AND id_estado IN(SELECT id FROM public.tb_estado WHERE upper(btrim(nombre))='ACTIVO')
  ) THEN
    RAISE EXCEPTION 'El plan seleccionado no existe';
  END IF;

  SELECT COALESCE(
    p_id_estado,
    (
      SELECT e.id
      FROM public.tb_estado e
      WHERE UPPER(e.nombre) = 'ACTIVO'
      ORDER BY e.id
      LIMIT 1
    )
  )
  INTO v_id_estado;

  IF v_id_estado IS NULL THEN
    RAISE EXCEPTION 'No existe un estado ACTIVO para registrar la asignacion';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_compensacion_asignacion a
    WHERE a.id_colaborador = p_id_colaborador
      AND a.id IS DISTINCT FROM v_actual.id
      AND daterange(
        a.fecha_inicio,
        COALESCE(a.fecha_fin, 'infinity'::date),
        '[]'
      ) && daterange(p_fecha_inicio, 'infinity'::date, '[]')
  ) THEN
    RAISE EXCEPTION 'Existe otra asignacion que se superpone con la nueva vigencia';
  END IF;

  IF v_actual.id IS NOT NULL AND v_actual.fecha_inicio = p_fecha_inicio THEN
    UPDATE public.tb_compensacion_asignacion
    SET id_cargo = p_id_cargo,
        id_sucursal = p_id_sucursal,
        
        id_plan = p_id_plan,
        modalidad = UPPER(TRIM(COALESCE(p_modalidad, modalidad))),
        observacion = NULLIF(TRIM(p_observacion), ''),
        id_estado = v_id_estado,
        id_usuario = v_id_actor,
        fecha_actualizacion = now()
    WHERE id = v_actual.id
    RETURNING id INTO v_id;
  ELSE
    IF v_actual.id IS NOT NULL THEN
      UPDATE public.tb_compensacion_asignacion
      SET fecha_fin = p_fecha_inicio - 1,
          id_usuario = v_id_actor,
          fecha_actualizacion = now()
      WHERE id = v_actual.id;
    END IF;

    INSERT INTO public.tb_compensacion_asignacion (
      id_colaborador,
      id_cargo,
      id_sucursal, id_plan, fecha_inicio,
      modalidad,
      observacion,
      id_estado,
      id_usuario
    ) VALUES (
      p_id_colaborador,
      p_id_cargo,
      p_id_sucursal, p_id_plan, p_fecha_inicio,
      UPPER(TRIM(COALESCE(p_modalidad, 'PRESENCIAL'))),
      NULLIF(TRIM(p_observacion), ''),
      v_id_estado,
      v_id_actor
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'id', a.id,
      'id_colaborador', a.id_colaborador,
      'id_cargo', a.id_cargo,
      'id_sucursal', a.id_sucursal,
      'id_jornada', NULL,
      'id_plan', a.id_plan,
      'fecha_inicio', a.fecha_inicio,
      'fecha_fin', a.fecha_fin,
      'modalidad', a.modalidad,
      'id_estado', a.id_estado,
      'mensaje', CASE
        WHEN v_actual.id IS NOT NULL AND v_actual.fecha_inicio = p_fecha_inicio
          THEN 'Asignacion corregida correctamente'
        ELSE 'Cambio de asignacion registrado correctamente'
      END
    )
    FROM public.tb_compensacion_asignacion a
    WHERE a.id = v_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_cargo(p_codigo character varying, p_nombre character varying, p_descripcion text DEFAULT NULL::text, p_orden integer DEFAULT 0, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_id_estado bigint;
  v_id bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF NULLIF(TRIM(p_codigo), '') IS NULL OR NULLIF(TRIM(p_nombre), '') IS NULL THEN
    RAISE EXCEPTION 'Codigo y nombre son obligatorios';
  END IF;

  SELECT COALESCE(
    p_id_estado,
    (SELECT e.id FROM public.tb_estado e WHERE UPPER(e.nombre) = 'ACTIVO' ORDER BY e.id LIMIT 1)
  ) INTO v_id_estado;

  IF v_id_estado IS NULL THEN
    RAISE EXCEPTION 'No existe un estado ACTIVO para registrar el cargo';
  END IF;

  INSERT INTO public.tb_compensacion_cargo (
    codigo, nombre, descripcion, orden, id_estado, id_usuario
  ) VALUES (
    UPPER(TRIM(p_codigo)), TRIM(p_nombre), NULLIF(TRIM(p_descripcion), ''),
    COALESCE(p_orden, 0), v_id_estado, v_id_actor
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT jsonb_build_object(
      'id', c.id,
      'codigo', c.codigo,
      'nombre', c.nombre,
      'descripcion', c.descripcion,
      'orden', c.orden,
      'id_estado', c.id_estado,
      'fecha_registro', c.fecha_registro
    )
    FROM public.tb_compensacion_cargo c
    WHERE c.id = v_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe un cargo con ese codigo';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_colaborador(p_tipo_documento character varying, p_numero_documento character varying, p_nombres character varying, p_apellido_paterno character varying, p_apellido_materno character varying, p_nombre_completo character varying, p_fecha_ingreso date, p_id_cargo bigint, p_id_sucursal bigint, p_id_plan bigint, p_id_usuario bigint DEFAULT NULL::bigint, p_email character varying DEFAULT NULL::character varying, p_celular character varying DEFAULT NULL::character varying, p_codigo_huellero character varying DEFAULT NULL::character varying, p_modalidad character varying DEFAULT 'PRESENCIAL'::character varying, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_alcance character varying;
  v_id_sucursal_alcance bigint;
  v_id_estado bigint;
  v_id_colaborador bigint;
  v_id_asignacion bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'COLABORADORES',
    'REGISTRAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;
  v_alcance := v_contexto ->> 'alcance';
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  IF v_alcance = 'PROPIO' THEN
    RAISE EXCEPTION 'Un acceso propio no puede registrar colaboradores';
  END IF;

  IF v_alcance = 'SEDE' AND p_id_sucursal IS DISTINCT FROM v_id_sucursal_alcance THEN
    RAISE EXCEPTION 'Solo puede registrar colaboradores en su sede autorizada';
  END IF;

  IF NULLIF(TRIM(p_numero_documento), '') IS NULL
     OR NULLIF(TRIM(p_nombres), '') IS NULL
     OR NULLIF(TRIM(p_nombre_completo), '') IS NULL
     OR p_fecha_ingreso IS NULL
     OR p_id_usuario IS NULL THEN
    RAISE EXCEPTION 'Usuario, documento, nombres, nombre completo y fecha de ingreso son obligatorios';
  END IF;

  SELECT COALESCE(
    p_id_estado,
    (SELECT e.id FROM public.tb_estado e WHERE UPPER(e.nombre) = 'ACTIVO' ORDER BY e.id LIMIT 1)
  ) INTO v_id_estado;

  IF v_id_estado IS NULL THEN
    RAISE EXCEPTION 'No existe un estado ACTIVO para registrar el colaborador';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tb_usuario WHERE id = p_id_usuario) THEN
    RAISE EXCEPTION 'El usuario vinculado no existe';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tb_compensacion_cargo WHERE id = p_id_cargo) THEN
    RAISE EXCEPTION 'El cargo seleccionado no existe';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tb_sucursal WHERE id = p_id_sucursal) THEN
    RAISE EXCEPTION 'La sucursal seleccionada no existe';
  END IF;

  

  IF NOT EXISTS (SELECT 1 FROM public.tb_compensacion_plan WHERE id = p_id_plan) THEN
    RAISE EXCEPTION 'El plan seleccionado no existe';
  END IF;

  PERFORM public.f_private_compensacion_usuario_vincular_auth(p_id_usuario);

  INSERT INTO public.tb_compensacion_colaborador (
    id_usuario,
    tipo_documento,
    numero_documento,
    nombres,
    apellido_paterno,
    apellido_materno,
    nombre_completo,
    email,
    celular,
    codigo_huellero,
    fecha_ingreso,
    id_estado,
    id_usuario_registra
  ) VALUES (
    p_id_usuario,
    UPPER(TRIM(COALESCE(p_tipo_documento, 'DNI'))),
    TRIM(p_numero_documento),
    TRIM(p_nombres),
    NULLIF(TRIM(p_apellido_paterno), ''),
    NULLIF(TRIM(p_apellido_materno), ''),
    TRIM(p_nombre_completo),
    NULLIF(LOWER(TRIM(p_email)), ''),
    NULLIF(TRIM(p_celular), ''),
    NULLIF(TRIM(p_codigo_huellero), ''),
    p_fecha_ingreso,
    v_id_estado,
    v_id_actor
  )
  RETURNING id INTO v_id_colaborador;

  INSERT INTO public.tb_compensacion_asignacion (
    id_colaborador,
    id_cargo,
    id_sucursal, id_plan, fecha_inicio,
    modalidad,
    id_estado,
    id_usuario
  ) VALUES (
    v_id_colaborador,
    p_id_cargo,
    p_id_sucursal, p_id_plan, p_fecha_ingreso,
    UPPER(TRIM(COALESCE(p_modalidad, 'PRESENCIAL'))),
    v_id_estado,
    v_id_actor
  )
  RETURNING id INTO v_id_asignacion;

  RETURN jsonb_build_object(
    'id', v_id_colaborador,
    'id_asignacion', v_id_asignacion,
    'mensaje', 'Colaborador y asignacion inicial registrados correctamente'
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'El documento, usuario o codigo de huellero ya pertenece a otro colaborador';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_concepto(p_codigo character varying, p_nombre character varying, p_categoria character varying, p_naturaleza character varying, p_unidad character varying DEFAULT 'MONTO'::character varying, p_requiere_evidencia boolean DEFAULT false, p_requiere_aprobacion boolean DEFAULT false, p_permite_excepcion boolean DEFAULT true, p_orden integer DEFAULT 0, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_id_estado bigint;
  v_id bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF NULLIF(TRIM(p_codigo), '') IS NULL OR NULLIF(TRIM(p_nombre), '') IS NULL THEN
    RAISE EXCEPTION 'Codigo y nombre son obligatorios';
  END IF;

  SELECT COALESCE(
    p_id_estado,
    (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' ORDER BY id LIMIT 1)
  ) INTO v_id_estado;

  IF v_id_estado IS NULL THEN
    RAISE EXCEPTION 'No existe un estado ACTIVO para registrar el concepto';
  END IF;

  INSERT INTO public.tb_compensacion_concepto (
    codigo,
    nombre,
    categoria,
    naturaleza,
    unidad,
    requiere_evidencia,
    requiere_aprobacion,
    permite_excepcion,
    orden,
    id_estado,
    id_usuario
  ) VALUES (
    UPPER(TRIM(p_codigo)),
    TRIM(p_nombre),
    UPPER(TRIM(p_categoria)),
    UPPER(TRIM(p_naturaleza)),
    UPPER(TRIM(COALESCE(p_unidad, 'MONTO'))),
    COALESCE(p_requiere_evidencia, false),
    COALESCE(p_requiere_aprobacion, false),
    COALESCE(p_permite_excepcion, true),
    COALESCE(p_orden, 0),
    v_id_estado,
    v_id_actor
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT to_jsonb(c)
    FROM public.tb_compensacion_concepto c
    WHERE c.id = v_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe un concepto con ese codigo';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_evento(p_id_tipo_evento bigint, p_fecha_evento timestamp with time zone, p_id_colaborador_beneficiario bigint DEFAULT NULL::bigint, p_id_colaborador_responsable bigint DEFAULT NULL::bigint, p_id_sucursal_origen bigint DEFAULT NULL::bigint, p_id_sucursal_responsable bigint DEFAULT NULL::bigint, p_periodo_imputacion date DEFAULT NULL::date, p_fuente character varying DEFAULT 'MANUAL'::character varying, p_clave_origen character varying DEFAULT NULL::character varying, p_titulo character varying DEFAULT NULL::character varying, p_descripcion text DEFAULT NULL::text, p_datos jsonb DEFAULT '{}'::jsonb, p_evidencia jsonb DEFAULT '[]'::jsonb, p_referencias jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_tipo public.tb_compensacion_evento_tipo%ROWTYPE;
  v_id_actor bigint;
  v_alcance character varying;
  v_id_colaborador_actor bigint;
  v_id_sucursal_alcance bigint;
  v_id_sucursal_origen bigint := p_id_sucursal_origen;
  v_id bigint;
  v_ref jsonb;
  v_tarifa_registro jsonb;
BEGIN
  PERFORM public.f_private_compensacion_bono_no_admin();
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento_tipo WHERE id=p_id_tipo_evento AND categoria='LLAMADA') THEN
    v_contexto:=public.f_private_compensacion_llamada_contexto('REGISTRAR');
  ELSE
    v_contexto := public.f_private_compensacion_evento_contexto(p_id_tipo_evento, 'REGISTRAR');
  END IF;
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  SELECT t.* INTO v_tipo
  FROM public.tb_compensacion_evento_tipo t
  JOIN public.tb_estado es ON es.id = t.id_estado
  WHERE t.id = p_id_tipo_evento
    AND UPPER(es.nombre) = 'ACTIVO';

  IF v_tipo.id IS NULL THEN
    RAISE EXCEPTION 'El tipo de evento no existe o esta inactivo';
  END IF;

  IF v_tipo.codigo = 'BONO_PUNTUALIDAD' THEN
    RAISE EXCEPTION 'El bono de puntualidad se calcula automaticamente desde Asistencia; no se registra manualmente';
  END IF;

  IF v_tipo.codigo = 'TIKTOK_LIVE' THEN
    RAISE EXCEPTION 'TikTok Live requiere el registro automático de cliente nuevo con captura';
  END IF;
  IF v_tipo.codigo='REGISTRO_PRESENCIAL' AND EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador c
    JOIN public.tb_compensacion_asignacion a ON a.id_colaborador=c.id JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='JEFE_TIENDA'
    WHERE c.id=p_id_colaborador_beneficiario AND a.fecha_inicio<=p_fecha_evento::date AND (a.fecha_fin IS NULL OR a.fecha_fin>=p_fecha_evento::date)) THEN
    RAISE EXCEPTION 'El registro presencial de Jefatura se calcula desde sus calificaciones aprobadas';
  END IF;

  IF v_tipo.categoria NOT IN ('CALIFICACION', 'LLAMADA', 'TARJETA_TERCERO', 'REFERIDO', 'OTRO') THEN
    RAISE EXCEPTION 'El tipo corresponde a otro flujo funcional';
  END IF;

  IF p_fecha_evento IS NULL THEN
    RAISE EXCEPTION 'La fecha del evento es obligatoria';
  END IF;

  IF v_tipo.codigo='PROPUESTA_INNOVACION' THEN
    IF NULLIF(btrim(p_titulo),'') IS NULL OR NULLIF(btrim(p_descripcion),'') IS NULL THEN
      RAISE EXCEPTION 'La propuesta requiere titulo y descripcion';
    END IF;
    IF v_id_colaborador_actor IS NULL OR p_id_colaborador_beneficiario IS DISTINCT FROM v_id_colaborador_actor
      OR (p_id_colaborador_responsable IS NOT NULL AND p_id_colaborador_responsable IS DISTINCT FROM v_id_colaborador_actor) THEN
      RAISE EXCEPTION 'Solo puede proponer una innovacion propia';
    END IF;
    IF COALESCE((v_contexto->>'es_super_admin')::boolean,false) THEN
      RAISE EXCEPTION 'Administracion evalua propuestas; no recibe este bono';
    END IF;
  END IF;

  IF v_tipo.requiere_beneficiario AND p_id_colaborador_beneficiario IS NULL THEN
    RAISE EXCEPTION 'El tipo de evento requiere un colaborador beneficiario';
  END IF;

  IF v_tipo.requiere_responsable AND p_id_colaborador_responsable IS NULL THEN
    RAISE EXCEPTION 'El tipo de evento requiere un colaborador responsable';
  END IF;

  IF p_id_colaborador_beneficiario IS NULL AND p_id_colaborador_responsable IS NULL THEN
    RAISE EXCEPTION 'Debe indicar al menos un colaborador vinculado';
  END IF;

  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'Los datos deben enviarse como un objeto JSON';
  END IF;

  IF p_evidencia IS NULL OR jsonb_typeof(p_evidencia) <> 'array' THEN
    RAISE EXCEPTION 'La evidencia debe enviarse como un arreglo JSON';
  END IF;

  IF p_referencias IS NULL OR jsonb_typeof(p_referencias) <> 'array' THEN
    RAISE EXCEPTION 'Las referencias deben enviarse como un arreglo JSON';
  END IF;

  SELECT COALESCE(
    v_id_sucursal_origen,
    (
      SELECT a.id_sucursal
      FROM public.tb_compensacion_asignacion a
      WHERE a.id_colaborador = COALESCE(
          p_id_colaborador_beneficiario,
          p_id_colaborador_responsable
        )
        AND a.fecha_inicio <= p_fecha_evento::date
        AND (a.fecha_fin IS NULL OR a.fecha_fin >= p_fecha_evento::date)
      ORDER BY a.fecha_inicio DESC, a.id DESC
      LIMIT 1
    )
  ) INTO v_id_sucursal_origen;

  IF v_alcance = 'PROPIO'
     AND v_id_colaborador_actor IS DISTINCT FROM p_id_colaborador_beneficiario
     AND v_id_colaborador_actor IS DISTINCT FROM p_id_colaborador_responsable THEN
    RAISE EXCEPTION 'Solo puede registrar eventos propios';
  END IF;

  -- Un responsable propio no autoriza atribuir un bono manual a otra persona.
  IF v_alcance='PROPIO' AND v_tipo.categoria='OTRO' AND (
    p_id_colaborador_beneficiario IS DISTINCT FROM v_id_colaborador_actor
    OR (p_id_colaborador_responsable IS NOT NULL AND p_id_colaborador_responsable IS DISTINCT FROM v_id_colaborador_actor)
  ) THEN RAISE EXCEPTION 'Solo puede registrar bonos con beneficiario propio'; END IF;

  IF NOT public.f_private_compensacion_equipo_visible(v_contexto,coalesce(p_id_colaborador_beneficiario,p_id_colaborador_responsable),(p_fecha_evento AT TIME ZONE 'America/Lima')::date) THEN
    RAISE EXCEPTION 'El beneficiario no pertenece a su equipo vigente';
  END IF;
  IF v_alcance = 'SEDE' AND v_id_sucursal_origen IS DISTINCT FROM v_id_sucursal_alcance
     AND p_id_sucursal_responsable IS DISTINCT FROM v_id_sucursal_alcance THEN
    RAISE EXCEPTION 'Solo puede registrar eventos de su sede autorizada';
  END IF;
  IF v_alcance='SEDE' AND v_tipo.categoria='OTRO' AND p_id_colaborador_beneficiario IS DISTINCT FROM v_id_colaborador_actor THEN
    RAISE EXCEPTION 'Los bonos personales de Jefatura deben tener beneficiario propio';
  END IF;

  IF v_tipo.categoria='LLAMADA' THEN
    IF v_alcance='PROPIO' AND (p_id_colaborador_beneficiario IS DISTINCT FROM v_id_colaborador_actor
      OR (p_id_colaborador_responsable IS NOT NULL AND p_id_colaborador_responsable IS DISTINCT FROM v_id_colaborador_actor)) THEN
      RAISE EXCEPTION 'Solo puede registrar sus propias llamadas';
    END IF;
    IF v_alcance<>'GLOBAL' AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion a
      JOIN public.tb_estado e ON e.id=a.id_estado AND upper(btrim(e.nombre))='ACTIVO'
      WHERE a.id_colaborador=p_id_colaborador_beneficiario AND a.id_sucursal=(v_contexto->>'id_sucursal_alcance')::bigint
        AND a.id_sucursal IS NOT DISTINCT FROM v_id_sucursal_origen
        AND (p_id_sucursal_responsable IS NULL OR p_id_sucursal_responsable=a.id_sucursal)
        AND a.fecha_inicio<=(p_fecha_evento AT TIME ZONE 'America/Lima')::date
        AND (a.fecha_fin IS NULL OR a.fecha_fin>=(p_fecha_evento AT TIME ZONE 'America/Lima')::date)) THEN
      RAISE EXCEPTION 'Solo puede registrar llamadas de su sede';
    END IF;
  END IF;
  -- Sin tarifa no se registra una promesa de pago ambigua. No se publica nada.
  IF p_id_colaborador_beneficiario IS NOT NULL AND v_tipo.id_concepto IS NOT NULL THEN
    v_tarifa_registro := public.f_private_compensacion_evento_tarifa_registro(
      p_id_tipo_evento, p_id_colaborador_beneficiario, p_fecha_evento
    );
  END IF;

  INSERT INTO public.tb_compensacion_evento (
    id_tipo_evento, id_colaborador_beneficiario, id_colaborador_responsable,
    id_sucursal_origen, id_sucursal_responsable, fecha_evento,
    periodo_imputacion, fuente, clave_origen, titulo, descripcion,
    datos, evidencia, estado_evento, id_usuario_registra, criterios_validacion_snapshot
  ) VALUES (
    p_id_tipo_evento, p_id_colaborador_beneficiario, p_id_colaborador_responsable,
    v_id_sucursal_origen, p_id_sucursal_responsable, p_fecha_evento,
    COALESCE(p_periodo_imputacion, date_trunc('month', p_fecha_evento)::date),
    UPPER(TRIM(COALESCE(p_fuente, 'MANUAL'))), NULLIF(TRIM(p_clave_origen), ''),
    NULLIF(TRIM(p_titulo), ''), NULLIF(TRIM(p_descripcion), ''),
    p_datos, p_evidencia, 'BORRADOR', v_id_actor, COALESCE(v_tarifa_registro, '{}'::jsonb)
  ) RETURNING id INTO v_id;

  FOR v_ref IN SELECT value FROM jsonb_array_elements(p_referencias)
  LOOP
    IF jsonb_typeof(v_ref) <> 'object' THEN
      RAISE EXCEPTION 'Cada referencia debe ser un objeto JSON';
    END IF;

    INSERT INTO public.tb_compensacion_evento_referencia (
      id_evento, tipo_referencia, id_cliente, id_operacion,
      identificador_externo, datos_snapshot, id_usuario
    ) VALUES (
      v_id,
      UPPER(TRIM(COALESCE(v_ref ->> 'tipo_referencia', 'OTRA'))),
      NULLIF(v_ref ->> 'id_cliente', '')::bigint,
      NULLIF(v_ref ->> 'id_operacion', '')::bigint,
      NULLIF(TRIM(v_ref ->> 'identificador_externo'), ''),
      COALESCE(v_ref -> 'datos_snapshot', '{}'::jsonb),
      v_id_actor
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_id,
    'estado_evento', 'BORRADOR',
    'mensaje', 'Evento registrado como borrador'
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'La clave de origen o alguna referencia ya fue registrada';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_evento_anular(p_id bigint, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_estado character varying;
  v_paso integer;
BEGIN
  IF NULLIF(TRIM(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Debe indicar el motivo de anulacion';
  END IF;

  v_contexto := public.f_private_compensacion_evento_validar_alcance(
    p_id, 'EDITAR', true
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  SELECT estado_evento INTO v_estado
  FROM public.tb_compensacion_evento
  WHERE id = p_id;

  IF v_estado NOT IN ('BORRADOR', 'PENDIENTE', 'RECHAZADO') THEN
    RAISE EXCEPTION 'El evento ya fue valorizado o anulado y no puede modificarse';
  END IF;

  SELECT COALESCE(MAX(numero_paso), 0) + 1 INTO v_paso
  FROM public.tb_compensacion_evento_revision
  WHERE id_evento = p_id;

  INSERT INTO public.tb_compensacion_evento_revision (
    id_evento, numero_paso, etapa, decision, comentario,
    id_usuario_revisor, datos_decision
  ) VALUES (
    p_id, v_paso, 'ANULACION', 'ANULADO', TRIM(p_motivo),
    v_id_actor, jsonb_build_object('estado_anterior', v_estado)
  );

  UPDATE public.tb_compensacion_evento
  SET estado_evento = 'ANULADO',
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', p_id,
    'estado_evento', 'ANULADO',
    'mensaje', 'Evento anulado con trazabilidad'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_evento_enviar(p_id bigint, p_comentario text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_evento public.tb_compensacion_evento%ROWTYPE;
  v_tipo public.tb_compensacion_evento_tipo%ROWTYPE;
  v_id_actor bigint;
  v_paso integer;
BEGIN
  v_contexto := public.f_private_compensacion_evento_validar_alcance(
    p_id, 'REGISTRAR', true
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  SELECT * INTO v_evento FROM public.tb_compensacion_evento WHERE id = p_id;
  SELECT * INTO v_tipo FROM public.tb_compensacion_evento_tipo WHERE id = v_evento.id_tipo_evento;

  IF v_evento.estado_evento <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se pueden enviar eventos en borrador';
  END IF;

  IF v_tipo.requiere_beneficiario AND v_evento.id_colaborador_beneficiario IS NULL THEN
    RAISE EXCEPTION 'Falta el colaborador beneficiario';
  END IF;

  IF v_tipo.requiere_responsable AND v_evento.id_colaborador_responsable IS NULL THEN
    RAISE EXCEPTION 'Falta el colaborador responsable';
  END IF;

  IF v_tipo.requiere_cliente AND NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento_referencia
    WHERE id_evento = p_id AND tipo_referencia = 'CLIENTE'
      AND (id_cliente IS NOT NULL OR (
        v_tipo.codigo IN ('LLAMADA_CONTACTO', 'SEGURIDAD_TARJETA')
        AND identificador_externo ~ '^[0-9]{8}$'
        AND length(btrim(COALESCE(datos_snapshot->>'nombre',''))) > 0
      ))
  ) THEN
    RAISE EXCEPTION 'El evento requiere una referencia de cliente';
  END IF;

  -- En REFERIDO la operacion aun no existe necesariamente al registrar; el
  -- resolver especializado la exige y la vincula antes de aprobar.
  IF v_tipo.requiere_operacion
     AND v_tipo.categoria <> 'REFERIDO'
     AND NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento_referencia
    WHERE id_evento = p_id AND id_operacion IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'El evento requiere una referencia de operacion';
  END IF;

  PERFORM public.f_private_compensacion_tiktok_validar(p_id);


  SELECT COALESCE(MAX(numero_paso), 0) + 1 INTO v_paso
  FROM public.tb_compensacion_evento_revision
  WHERE id_evento = p_id;

  INSERT INTO public.tb_compensacion_evento_revision (
    id_evento, numero_paso, etapa, decision, comentario,
    id_usuario_revisor, datos_decision
  ) VALUES (
    p_id, v_paso, 'REGISTRO', 'ENVIADO', NULLIF(TRIM(p_comentario), ''),
    v_id_actor, jsonb_build_object('estado_anterior', 'BORRADOR')
  );

  UPDATE public.tb_compensacion_evento
  SET estado_evento = 'PENDIENTE',
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', p_id,
    'estado_evento', 'PENDIENTE',
    'mensaje', 'Evento enviado a revision'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_evento_observar(p_id bigint, p_comentario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_estado character varying;
  v_paso integer;
BEGIN
  IF NULLIF(TRIM(p_comentario), '') IS NULL THEN
    RAISE EXCEPTION 'Debe indicar la observacion';
  END IF;

  v_contexto := public.f_private_compensacion_evento_validar_alcance(
    p_id, 'REVISAR', true
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  SELECT estado_evento INTO v_estado
  FROM public.tb_compensacion_evento
  WHERE id = p_id;

  IF v_estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo se pueden observar eventos pendientes';
  END IF;

  SELECT COALESCE(MAX(numero_paso), 0) + 1 INTO v_paso
  FROM public.tb_compensacion_evento_revision
  WHERE id_evento = p_id;

  INSERT INTO public.tb_compensacion_evento_revision (
    id_evento, numero_paso, etapa, decision, comentario,
    id_usuario_revisor, datos_decision
  ) VALUES (
    p_id, v_paso, 'REVISION', 'OBSERVADO', TRIM(p_comentario),
    v_id_actor, jsonb_build_object('estado_nuevo', 'BORRADOR')
  );

  UPDATE public.tb_compensacion_evento
  SET estado_evento = 'BORRADOR',
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', p_id,
    'estado_evento', 'BORRADOR',
    'mensaje', 'Evento devuelto con observaciones'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_evento_referencia(p_id_evento bigint, p_tipo_referencia character varying, p_id_cliente bigint DEFAULT NULL::bigint, p_id_operacion bigint DEFAULT NULL::bigint, p_identificador_externo character varying DEFAULT NULL::character varying, p_datos_snapshot jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_estado character varying;
  v_id bigint;
BEGIN
  v_contexto := public.f_private_compensacion_evento_validar_alcance(
    p_id_evento, 'EDITAR', true
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  SELECT estado_evento INTO v_estado
  FROM public.tb_compensacion_evento
  WHERE id = p_id_evento;

  IF v_estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se pueden agregar referencias a eventos en borrador';
  END IF;

  IF p_id_cliente IS NULL
     AND p_id_operacion IS NULL
     AND NULLIF(TRIM(p_identificador_externo), '') IS NULL THEN
    RAISE EXCEPTION 'Debe indicar un cliente, operacion o identificador externo';
  END IF;

  IF p_datos_snapshot IS NULL OR jsonb_typeof(p_datos_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'El snapshot debe enviarse como un objeto JSON';
  END IF;

  INSERT INTO public.tb_compensacion_evento_referencia (
    id_evento, tipo_referencia, id_cliente, id_operacion,
    identificador_externo, datos_snapshot, id_usuario
  ) VALUES (
    p_id_evento, UPPER(TRIM(p_tipo_referencia)), p_id_cliente, p_id_operacion,
    NULLIF(TRIM(p_identificador_externo), ''), p_datos_snapshot, v_id_actor
  ) RETURNING id INTO v_id;

  RETURN (
    SELECT to_jsonb(r)
    FROM public.tb_compensacion_evento_referencia r
    WHERE r.id = v_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'La referencia ya esta vinculada al evento';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_evento_resolver(p_id bigint, p_decision character varying, p_comentario text DEFAULT NULL::text, p_base_calculo numeric DEFAULT NULL::numeric, p_cantidad numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_evento public.tb_compensacion_evento%ROWTYPE;
  v_tipo public.tb_compensacion_evento_tipo%ROWTYPE;
  v_regla public.tb_compensacion_regla%ROWTYPE;
  v_id_actor bigint;
  v_decision character varying := UPPER(TRIM(COALESCE(p_decision, '')));
  v_id_asignacion bigint;
  v_id_plan_version bigint;
  v_id_cargo bigint;
  v_id_sucursal bigint;
  v_base numeric(16, 4);
  v_cantidad numeric(16, 4);
  v_valor_rango numeric(16, 4);
  v_tarifa numeric(16, 6);
  v_importe numeric(14, 2);
  v_paso integer;
  v_snapshot jsonb;
  v_meta jsonb;
  v_meta_plan bigint;
  v_tope_jefatura numeric;
  v_acumulado_jefatura numeric;
  v_economia_innovacion jsonb;
  v_chats_meta jsonb;
BEGIN
  IF v_decision NOT IN ('APROBADO', 'RECHAZADO') THEN
    RAISE EXCEPTION 'La decision debe ser APROBADO o RECHAZADO';
  END IF;

  v_contexto := public.f_private_compensacion_evento_validar_alcance(
    p_id,
    CASE WHEN v_decision = 'APROBADO' THEN 'APROBAR' ELSE 'REVISAR' END,
    true
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  SELECT * INTO v_evento FROM public.tb_compensacion_evento WHERE id = p_id;
  SELECT * INTO v_tipo FROM public.tb_compensacion_evento_tipo WHERE id = v_evento.id_tipo_evento;

  IF v_evento.estado_evento <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo se pueden resolver eventos pendientes';
  END IF;

  -- SQL208: Cuadre Perfecto lo registra y aprueba la misma Administracion.
  IF v_id_actor = v_evento.id_usuario_registra AND NOT (v_tipo.codigo='CUADRE_PERFECTO' AND coalesce((v_contexto->>'es_super_admin')::boolean,false)) THEN
    RAISE EXCEPTION 'El usuario que registro el evento no puede resolverlo';
  END IF;

  IF v_decision = 'RECHAZADO' AND NULLIF(TRIM(p_comentario), '') IS NULL
     AND NOT (v_tipo.categoria IN('LLAMADA','CALIFICACION','REFERIDO','TARJETA_TERCERO')
       OR v_tipo.codigo IN('TIKTOK_LIVE','PROPUESTA_INNOVACION')) THEN
    RAISE EXCEPTION 'Debe indicar el motivo del rechazo';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_compensacion_periodo pe
    WHERE pe.periodo = v_evento.periodo_imputacion
      AND pe.estado_periodo = 'CERRADO'
  ) THEN
    RAISE EXCEPTION 'El periodo de imputacion ya se encuentra cerrado';
  END IF;

  IF v_tipo.codigo IN('VIDEO_VIRAL','RECUPERACION_CLIENTE','ALERTA_TEMPRANA') THEN
    PERFORM public.f_private_compensacion_marketing_revisor(p_id,'REVISAR');
    IF coalesce(length(btrim(p_comentario)),0)<10 THEN RAISE EXCEPTION 'Requiere revision independiente con motivo'; END IF;
    IF coalesce(p_cantidad,1)<>1 OR coalesce(p_base_calculo,0)<>0 THEN RAISE EXCEPTION 'El caso reconoce una sola unidad'; END IF;
    PERFORM public.f_private_compensacion_pagos_periodo_editable(v_evento.id_colaborador_beneficiario,v_evento.periodo_imputacion);
    IF v_decision='APROBADO' THEN
      PERFORM public.f_private_compensacion_marketing_validar(p_id);
      IF v_tipo.codigo='ALERTA_TEMPRANA' AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_revision jr WHERE jr.id_evento=p_id AND jr.etapa='JEFE_TIENDA' AND jr.decision='APROBADO') THEN
        RAISE EXCEPTION 'Falta la validacion del Jefe de Tienda'; END IF;
      IF v_tipo.codigo='VIDEO_VIRAL' AND EXISTS(SELECT 1 FROM public.tb_compensacion_evento x WHERE x.id<>p_id AND x.estado_evento IN('APROBADO','LIQUIDADO') AND x.id_tipo_evento=v_tipo.id
        AND public.f_private_compensacion_marketing_publicacion(x.datos#>>'{captura,publicacion}')=public.f_private_compensacion_marketing_publicacion(v_evento.datos#>>'{captura,publicacion}')) THEN RAISE EXCEPTION 'La publicacion ya obtuvo este bono'; END IF;
      IF v_tipo.codigo='ALERTA_TEMPRANA' AND EXISTS(SELECT 1 FROM public.tb_compensacion_evento x WHERE x.id<>p_id AND x.estado_evento IN('APROBADO','LIQUIDADO') AND x.id_tipo_evento=v_tipo.id
        AND x.id_colaborador_responsable=v_evento.id_colaborador_responsable AND (x.fecha_evento AT TIME ZONE 'America/Lima')::date=(v_evento.fecha_evento AT TIME ZONE 'America/Lima')::date
        AND lower(btrim(x.datos#>>'{captura,conversacion}'))=lower(btrim(v_evento.datos#>>'{captura,conversacion}'))) THEN RAISE EXCEPTION 'La conversacion ya tiene una alerta reconocida para ese asesor y dia'; END IF;
      IF v_evento.id_colaborador_responsable IS NOT NULL THEN PERFORM public.f_private_compensacion_pagos_periodo_editable(v_evento.id_colaborador_responsable,v_evento.periodo_imputacion); END IF;
    END IF;
  END IF;
  IF v_tipo.codigo='PROPUESTA_INNOVACION' AND v_decision='APROBADO' THEN
    IF NOT public.f_private_compensacion_innovacion_comprobada(p_id) THEN
      -- El CHECK vigente exige un importe: cero conserva la aprobacion sin abono.
      UPDATE public.tb_compensacion_evento SET estado_evento='APROBADO', importe_aprobado=0,
        criterios_validacion_snapshot=criterios_validacion_snapshot || jsonb_build_object('innovacion_aprobacion',
          jsonb_build_object('id_usuario',v_id_actor,'fecha',clock_timestamp(),'motivo',btrim(p_comentario))),
        fecha_actualizacion=clock_timestamp() WHERE id=p_id;
      INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
        SELECT p_id,COALESCE(MAX(numero_paso),0)+1,'APROBACION_PROPUESTA','APROBADO',btrim(p_comentario),v_id_actor,
          jsonb_build_object('implementacion_pendiente',true) FROM public.tb_compensacion_evento_revision WHERE id_evento=p_id;
      RETURN jsonb_build_object('id',p_id,'estado_evento','APROBADO','importe_aprobado',0,
        'mensaje','Propuesta aprobada; comision pendiente de implementacion comprobada');
    END IF;
    PERFORM public.f_private_compensacion_innovacion_distinta(p_id);
    IF COALESCE(p_cantidad,1)<>1 OR COALESCE(p_base_calculo,0)<>0 THEN
      RAISE EXCEPTION 'La innovacion reconoce una sola propuesta';
    END IF;
  END IF;

  IF v_evento.datos->>'flujo'='PAGOS_DETECCION_V1' THEN
    IF NOT coalesce((v_contexto->>'es_super_admin')::boolean,false) OR (v_tipo.categoria<>'TARJETA_TERCERO' AND nullif(btrim(p_comentario),'') IS NULL) THEN
      RAISE EXCEPTION 'La deteccion requiere revision independiente de Administracion y motivo'; END IF;
    IF coalesce(p_cantidad,1)<>1 OR coalesce(p_base_calculo,0)<>0 THEN
      RAISE EXCEPTION 'Un hecho acredita como maximo una unidad'; END IF;
    IF v_decision='APROBADO' AND v_tipo.codigo IN('REPORTE_ABANDONO','DETECCION_ERROR_MANUAL') AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_revision rv
      WHERE rv.id_evento=p_id AND rv.etapa='JEFE_LINCE' AND rv.decision='APROBADO') THEN
      RAISE EXCEPTION 'Falta la validacion del Jefe de Sede'; END IF;
    IF v_decision='APROBADO' AND v_evento.datos->>'id_operacion' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia r
      JOIN public.tb_operacion_proceso o ON o.id=r.id_operacion
      WHERE r.id_evento=p_id AND r.tipo_referencia='OPERACION'
        AND btrim(o.dni_cliente)=v_evento.datos#>>'{operacion,dni}'
        AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada x WHERE x.id_operacion_proceso=o.id)) THEN
      RAISE EXCEPTION 'La fuente operativa fue retirada o cambio de cliente'; END IF;
  END IF;
  IF v_tipo.codigo='REGISTRO_PRESENCIAL' AND EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador c
    JOIN public.tb_usuario u ON u.id=c.id_usuario WHERE c.id=v_evento.id_colaborador_beneficiario AND u.id_rol=2)
    AND v_decision='APROBADO' THEN
    IF NOT public.f_private_compensacion_calificacion_valida(v_evento.datos,v_evento.descripcion,v_evento.id_colaborador_beneficiario,
       v_evento.criterios_validacion_snapshot->'validez_calificacion') OR NOT EXISTS(
      SELECT 1 FROM public.tb_compensacion_evento_referencia r
      CROSS JOIN LATERAL public.f_private_compensacion_calificacion_operacion(r.id_operacion) d
      WHERE r.id_evento=p_id AND r.tipo_referencia='OPERACION' AND d->>'dni'=v_evento.datos->>'cliente_documento') THEN
      RAISE EXCEPTION 'La atencion requiere calificacion valida y operacion final pagada del cliente'; END IF;
  END IF;
  IF v_tipo.codigo='CUADRE_PERFECTO' AND v_decision='APROBADO' THEN
    IF v_evento.datos->>'flujo' IS DISTINCT FROM 'PAGOS_CUADRE_V1'
      OR v_evento.datos#>>'{revision_bancaria,id_usuario}' IS DISTINCT FROM v_id_actor::text
      OR coalesce(p_cantidad,1)<>1 OR coalesce(p_base_calculo,0)<>0 THEN
      RAISE EXCEPTION 'Cuadre Perfecto se registra desde Auditoria Cuadre y Cierre, una sola unidad'; END IF;
  END IF;
  IF v_decision = 'APROBADO' THEN
    IF v_tipo.codigo='CALIFICACION_PRESENCIAL' AND EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador c
      JOIN public.tb_usuario u ON u.id=c.id_usuario WHERE c.id=v_evento.id_colaborador_beneficiario AND u.id_rol IN(3,4)) AND NOT EXISTS(
        SELECT 1 FROM public.tb_compensacion_evento_referencia ref
        CROSS JOIN LATERAL public.f_private_compensacion_calificacion_operacion(ref.id_operacion) d
        WHERE ref.id_evento=v_evento.id AND ref.tipo_referencia='OPERACION' AND d->>'dni'=v_evento.datos->>'cliente_documento'
          -- SQL119: Pago Deuda, o efectivizacion general de 1 o 2 por ciento sin tasa fija y de una comunidad elegible (Jefatura y ATC).
          AND public.f_private_compensacion_calificacion_elegible((d->>'id')::bigint)) THEN
      RAISE EXCEPTION 'La calificacion requiere Pago Deuda final o efectivizacion general de 1%% o 2%%, sin tasa fija/preferencial y de una comunidad elegible';
    END IF;
    IF v_tipo.categoria='CALIFICACION' AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia r
      CROSS JOIN LATERAL public.f_private_compensacion_calificacion_operacion(r.id_operacion) d
      WHERE r.id_evento=p_id AND r.tipo_referencia='OPERACION' AND d->>'dni'=v_evento.datos->>'cliente_documento') THEN
      RAISE EXCEPTION 'Vincula Efectivizacion pagada o Pago Deuda final con comision cobrada del mismo cliente'; END IF;
    PERFORM public.f_private_compensacion_atc_trazabilidad_validar(p_id);
    PERFORM public.f_private_compensacion_tiktok_validar(p_id);
    IF v_tipo.categoria='REFERIDO' THEN
      PERFORM public.f_private_compensacion_referido_validar(p_id,p_base_calculo,p_cantidad);
    END IF;
    IF v_tipo.codigo = 'CALIFICACION_PRESENCIAL' AND NOT public.f_private_compensacion_calificacion_valida(
      v_evento.datos, v_evento.descripcion, v_evento.id_colaborador_beneficiario,
      v_evento.criterios_validacion_snapshot->'validez_calificacion'
    ) THEN
      RAISE EXCEPTION 'La calificación no cumple los requisitos de validez (4 o 5 estrellas y campos requeridos)';
    END IF;
    IF v_evento.id_colaborador_beneficiario IS NULL THEN
      RAISE EXCEPTION 'No se puede aprobar un evento sin beneficiario';
    END IF;

    IF v_tipo.id_concepto IS NULL THEN
      RAISE EXCEPTION 'El tipo de evento no tiene un concepto de compensacion configurado';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.tb_compensacion_evento_referencia actual
      JOIN public.tb_compensacion_evento_referencia otra
        ON otra.id_evento <> actual.id_evento
       AND (
         (actual.id_operacion IS NOT NULL AND otra.id_operacion = actual.id_operacion)
         OR (
           actual.identificador_externo IS NOT NULL
           AND otra.tipo_referencia = actual.tipo_referencia
           AND otra.identificador_externo = actual.identificador_externo
         )
       )
      JOIN public.tb_compensacion_evento ev_otra ON ev_otra.id = otra.id_evento
      WHERE actual.id_evento = p_id
        AND ev_otra.id_tipo_evento = v_evento.id_tipo_evento
        AND ev_otra.estado_evento IN ('APROBADO', 'LIQUIDADO')
    ) THEN
      RAISE EXCEPTION 'La evidencia ya fue aprobada para este tipo de evento';
    END IF;

    IF v_evento.criterios_validacion_snapshot ->> 'politica_tarifa' = 'REGISTRO_V1' THEN
      IF (v_evento.criterios_validacion_snapshot ->> 'id_tipo_evento_registro')::bigint IS DISTINCT FROM v_tipo.id
         OR (v_evento.criterios_validacion_snapshot ->> 'id_beneficiario_registro')::bigint IS DISTINCT FROM v_evento.id_colaborador_beneficiario THEN
        RAISE EXCEPTION 'La tarifa registrada no corresponde a esta evidencia';
      END IF;
      SELECT * INTO v_regla FROM jsonb_populate_record(
        NULL::public.tb_compensacion_regla, v_evento.criterios_validacion_snapshot -> 'regla_registro'
      );
      IF v_regla.id_concepto IS DISTINCT FROM v_tipo.id_concepto THEN
        RAISE EXCEPTION 'El concepto cambio desde el registro. Revise la evidencia';
      END IF;
      v_id_asignacion := (v_evento.criterios_validacion_snapshot ->> 'id_asignacion_registro')::bigint;
      v_id_plan_version := v_regla.id_plan_version;
    ELSE
      -- Compatibilidad explicita: no inventar snapshots de registros antiguos.
      SELECT a.id, a.id_cargo, a.id_sucursal, pv.id
      INTO v_id_asignacion, v_id_cargo, v_id_sucursal, v_id_plan_version
      FROM public.tb_compensacion_asignacion a
      JOIN public.tb_compensacion_plan_version pv
        ON pv.id_plan = a.id_plan
       AND pv.estado_version = 'PUBLICADA'
       AND pv.fecha_inicio <= v_evento.fecha_evento::date
       AND (pv.fecha_fin IS NULL OR pv.fecha_fin >= v_evento.fecha_evento::date)
      WHERE a.id_colaborador = v_evento.id_colaborador_beneficiario
        AND a.fecha_inicio <= v_evento.fecha_evento::date
        AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_evento.fecha_evento::date)
      ORDER BY a.fecha_inicio DESC, pv.numero_version DESC, a.id DESC
      LIMIT 1;

      IF v_id_asignacion IS NULL THEN
        RAISE EXCEPTION 'El beneficiario no tiene asignacion y matriz publicada para la fecha del evento';
      END IF;

      SELECT r.* INTO v_regla
      FROM public.tb_compensacion_regla r
      JOIN public.tb_estado es ON es.id = r.id_estado
      WHERE r.id_plan_version = v_id_plan_version
        AND r.id_concepto = v_tipo.id_concepto
        AND (r.id_cargo IS NULL OR r.id_cargo = v_id_cargo)
        AND (r.id_sucursal IS NULL OR r.id_sucursal = v_id_sucursal)
        AND UPPER(es.nombre) = 'ACTIVO'
      ORDER BY
        ((r.id_cargo IS NOT NULL)::integer + (r.id_sucursal IS NOT NULL)::integer) DESC,
        r.prioridad DESC,
        r.id DESC
      LIMIT 1;
    END IF;

    IF v_regla.id IS NULL THEN
      RAISE EXCEPTION 'No existe una regla activa aplicable al evento';
    END IF;

    IF v_tipo.codigo='PROPUESTA_INNOVACION' AND
      (v_regla.tipo_calculo NOT IN ('FIJO','POR_UNIDAD') OR coalesce(v_regla.monto,0) <= 0) THEN
      -- SQL207: el importe es el configurado; solo se exige que exista un monto por propuesta.
      RAISE EXCEPTION 'La regla de innovacion debe reconocer un importe por propuesta implementada';
    END IF;

    IF v_tipo.codigo='META_AREA' THEN
      RAISE EXCEPTION 'La bolsa de sede se calcula automaticamente en Bonos del mes';
    END IF;
    IF v_tipo.codigo='META_SEDE_SAFETYPAY' THEN
      -- Eventos distintos del mismo beneficiario/mes comparten un lock transaccional.
      -- La consulta de duplicados se ejecuta despues de esperar al primer revisor.
      PERFORM pg_advisory_xact_lock(hashtextextended(
        'compensacion:jefatura:'||v_evento.id_colaborador_beneficiario::text||':'||
        v_evento.periodo_imputacion::text||':'||v_tipo.id_concepto::text,0));
      SELECT a.id_plan,a.id_sucursal,a.id_cargo INTO v_meta_plan,v_id_sucursal,v_id_cargo
      FROM public.tb_compensacion_asignacion a WHERE a.id=v_id_asignacion;
      IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_cargo WHERE id=v_id_cargo AND codigo='JEFE_TIENDA') THEN
        RAISE EXCEPTION 'El bono de jefatura requiere cargo Jefe de Tienda';
      END IF;
      IF v_regla.tipo_calculo<>'FIJO' OR COALESCE(p_cantidad,1)<>1 THEN
        RAISE EXCEPTION 'El bono de jefatura es un importe mensual fijo';
      END IF;
      v_meta:=public.f_private_compensacion_meta_evaluar(v_meta_plan,v_id_sucursal,v_evento.periodo_imputacion);
      IF COALESCE((v_meta->>'valor_meta')::numeric,0)<=0 OR
        COALESCE((v_meta->>'porcentaje')::numeric,0)<100 THEN
        RAISE EXCEPTION 'La sede no alcanzo la meta requerida para jefatura';
      END IF;
      v_chats_meta:=public.f_private_compensacion_meta_sede_chats(v_id_sucursal,v_evento.periodo_imputacion);
      IF (v_chats_meta->>'confirmados')::bigint>0 THEN
        RAISE EXCEPTION 'El bono no aplica: existe descuido de chats confirmado en la sede y mes';
      END IF;
      IF (v_chats_meta->>'pendientes')::bigint>0 THEN
        RAISE EXCEPTION 'El bono sigue en revision: hay reportes de chats pendientes; no esta anulado';
      END IF;
      IF jsonb_array_length(v_evento.evidencia)=0 OR NULLIF(btrim(p_comentario),'') IS NULL OR
        v_evento.criterios_validacion_snapshot#>>'{revision_meta_jefatura,id_usuario}' IS DISTINCT FROM v_id_actor::text OR
        v_evento.criterios_validacion_snapshot#>>'{revision_meta_jefatura,politica}' IS DISTINCT FROM 'META_100_CHATS_V2' OR
        v_evento.criterios_validacion_snapshot#>'{revision_meta_jefatura,sin_chats_descuidados}' IS DISTINCT FROM 'true'::jsonb THEN
        RAISE EXCEPTION 'Confirma ausencia de descuido de chats con evidencia y comentario';
      END IF;
      IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento ev JOIN public.tb_compensacion_evento_tipo t ON t.id=ev.id_tipo_evento
        WHERE ev.id<>p_id AND ev.id_colaborador_beneficiario=v_evento.id_colaborador_beneficiario
          AND ev.periodo_imputacion=v_evento.periodo_imputacion AND t.id_concepto=v_tipo.id_concepto
          AND ev.estado_evento IN('APROBADO','LIQUIDADO')) THEN
        RAISE EXCEPTION 'El bono de jefatura ya fue aprobado para este mes';
      END IF;
    END IF;

    v_base := COALESCE(p_base_calculo, 0);
    v_cantidad := COALESCE(p_cantidad, 1);

    IF v_regla.tipo_calculo = 'PORCENTAJE' AND p_base_calculo IS NULL THEN
      RAISE EXCEPTION 'La regla porcentual requiere una base de calculo explicita';
    END IF;

    IF v_base < 0 OR v_cantidad < 0 THEN
      RAISE EXCEPTION 'La base y la cantidad no pueden ser negativas';
    END IF;

    v_valor_rango := CASE
      WHEN v_regla.tipo_calculo = 'PORCENTAJE' THEN v_base
      ELSE v_cantidad
    END;

    IF v_regla.valor_minimo IS NOT NULL
       AND v_valor_rango < v_regla.valor_minimo THEN
      RAISE EXCEPTION 'El valor de calculo no alcanza el minimo de la regla';
    END IF;

    IF v_regla.valor_maximo IS NOT NULL
       AND v_valor_rango > v_regla.valor_maximo THEN
      RAISE EXCEPTION 'El valor de calculo supera el maximo de la regla';
    END IF;

    CASE v_regla.tipo_calculo
      WHEN 'FIJO' THEN
        v_tarifa := v_regla.monto;
        v_importe := ROUND(v_regla.monto, 2);
      WHEN 'PORCENTAJE' THEN
        v_tarifa := v_regla.porcentaje;
        v_importe := ROUND(v_base * v_regla.porcentaje / 100, 2);
      WHEN 'POR_MINUTO' THEN
        v_tarifa := v_regla.monto;
        v_importe := ROUND(v_cantidad * v_regla.monto, 2);
      WHEN 'POR_HORA' THEN
        v_tarifa := v_regla.monto;
        v_importe := ROUND(v_cantidad * v_regla.monto, 2);
      WHEN 'POR_DIA' THEN
        v_tarifa := v_regla.monto;
        v_importe := ROUND(v_cantidad * v_regla.monto, 2);
      WHEN 'POR_UNIDAD' THEN
        v_tarifa := v_regla.monto;
        v_importe := ROUND(v_cantidad * v_regla.monto, 2);
      ELSE
        RAISE EXCEPTION 'Las reglas FORMULA requieren un calculador especializado';
    END CASE;

    IF v_regla.tope_importe IS NOT NULL THEN
      v_importe := LEAST(v_importe, v_regla.tope_importe);
    END IF;
    IF v_tipo.codigo='PROPUESTA_INNOVACION' THEN
      -- La tarifa procede de la regla validada; el importe puede quedar limitado.
      v_economia_innovacion := jsonb_build_object('tarifa_regla',v_tarifa,
        'importe_antes_tope_jefatura',v_importe,'tope_regla',v_regla.tope_importe);
    END IF;
    -- SQL120: importe de innovacion fijado por Administracion (solo Jefatura). Mantiene el tope de la regla y el
    -- acumulado mensual con la meta; el estado LIMITADO_POR_TOPE compara contra el importe fijado.
    IF v_tipo.codigo='PROPUESTA_INNOVACION'
      AND jsonb_typeof(v_evento.criterios_validacion_snapshot->'innovacion_importe_fijado')='number'
      AND EXISTS(SELECT 1 FROM public.tb_compensacion_cargo WHERE id=(SELECT id_cargo FROM public.tb_compensacion_asignacion WHERE id=v_id_asignacion) AND codigo='JEFE_TIENDA') THEN
      v_tarifa := ROUND((v_evento.criterios_validacion_snapshot->>'innovacion_importe_fijado')::numeric,2);
      v_importe := v_tarifa;
      IF v_regla.tope_importe IS NOT NULL THEN
        v_importe := LEAST(v_importe, v_regla.tope_importe);
      END IF;
      v_economia_innovacion := v_economia_innovacion || jsonb_build_object(
        'importe_fijado_por_administracion',v_tarifa,'importe_antes_tope_jefatura',v_importe);
    END IF;
    IF v_tipo.codigo IN('PROPUESTA_INNOVACION','META_SEDE_SAFETYPAY') AND EXISTS(
      SELECT 1 FROM public.tb_compensacion_cargo WHERE id=(SELECT id_cargo FROM public.tb_compensacion_asignacion WHERE id=v_id_asignacion) AND codigo='JEFE_TIENDA') THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('jefatura:meta-innovacion:'||v_evento.id_colaborador_beneficiario||':'||v_evento.periodo_imputacion,0));
      SELECT coalesce((v_regla.configuracion->>'acumulado_maximo_con_meta')::numeric,
        (SELECT (r.configuracion->>'acumulado_maximo_con_meta')::numeric
           FROM public.f_private_compensacion_reglas_colaborador_fecha(
             (SELECT id_plan FROM public.tb_compensacion_asignacion WHERE id=v_id_asignacion),
             (v_evento.fecha_evento AT TIME ZONE 'America/Lima')::date,v_evento.id_colaborador_beneficiario) r
          JOIN public.tb_compensacion_concepto co ON co.id=r.id_concepto AND co.codigo='BONO_INNOVACION'
          WHERE r.id_plan_version=v_id_plan_version AND r.id_cargo=(SELECT id_cargo FROM public.tb_compensacion_asignacion WHERE id=v_id_asignacion)
            AND (r.id_sucursal IS NULL OR r.id_sucursal=(SELECT id_sucursal FROM public.tb_compensacion_asignacion WHERE id=v_id_asignacion))
          ORDER BY r.prioridad DESC,r.id DESC LIMIT 1)) INTO v_tope_jefatura;
      SELECT coalesce(sum(e.importe_aprobado),0) INTO v_acumulado_jefatura FROM public.tb_compensacion_evento e
        JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
        WHERE e.id<>v_evento.id AND e.id_colaborador_beneficiario=v_evento.id_colaborador_beneficiario
          AND e.periodo_imputacion=v_evento.periodo_imputacion AND t.codigo IN('PROPUESTA_INNOVACION','META_SEDE_SAFETYPAY')
          AND e.estado_evento IN('APROBADO','LIQUIDADO');
      IF v_tipo.codigo='PROPUESTA_INNOVACION' AND v_tope_jefatura IS NOT NULL THEN
        -- Comprobar una implementacion real no depende del margen economico.
        -- El mismo lock serializa meta e innovaciones del beneficiario/mes.
        v_importe := LEAST(v_importe,GREATEST(0,v_tope_jefatura-v_acumulado_jefatura));
        v_economia_innovacion := v_economia_innovacion || jsonb_build_object(
          'tope_jefatura',v_tope_jefatura,'acumulado_previo',v_acumulado_jefatura,
          'margen_disponible',GREATEST(0,v_tope_jefatura-v_acumulado_jefatura));
      ELSIF v_tope_jefatura IS NOT NULL AND v_importe+v_acumulado_jefatura>v_tope_jefatura THEN
        RAISE EXCEPTION 'La suma de meta e innovacion supera el tope mensual configurado de %',v_tope_jefatura;
      END IF;
    END IF;

    v_snapshot := v_evento.criterios_validacion_snapshot || jsonb_build_object(
      'id_tipo_evento', v_tipo.id,
      'tipo_codigo', v_tipo.codigo,
      'configuracion_tipo', v_tipo.configuracion,
      'id_asignacion', v_id_asignacion,
      'id_plan_version', v_id_plan_version,
      'id_regla', v_regla.id,
      'tipo_calculo', v_regla.tipo_calculo,
      'configuracion_regla', v_regla.configuracion,
      'tope_importe', v_regla.tope_importe,
      'meta_sede_aprobacion',v_meta,
      'fecha_calculo', now()
    );
    IF v_tipo.codigo='PROPUESTA_INNOVACION' THEN
      v_snapshot := v_snapshot || jsonb_build_object('innovacion_economia',v_economia_innovacion ||
        jsonb_build_object('importe_habilitado',v_importe,'estado',CASE WHEN v_importe=0 THEN 'SIN_MARGEN'
          WHEN v_importe<v_tarifa THEN 'LIMITADO_POR_TOPE' ELSE 'HABILITADO' END));
    END IF;

    UPDATE public.tb_compensacion_evento
    SET estado_evento = 'APROBADO',
        id_regla_aplicada = v_regla.id,
        base_calculo = v_base,
        cantidad = v_cantidad,
        tarifa_aplicada = v_tarifa,
        importe_aprobado = v_importe,
        criterios_validacion_snapshot = v_snapshot,
        fecha_actualizacion = now()
    WHERE id = p_id;
  ELSE
    v_snapshot := jsonb_build_object(
      'estado_anterior', 'PENDIENTE',
      'motivo', NULLIF(TRIM(p_comentario), ''),
      'origen_decision', 'REVISION_DIRECTA_PLAN_74',
      'nota_humana_opcional', v_tipo.categoria IN('LLAMADA','CALIFICACION','REFERIDO','TARJETA_TERCERO')
        OR v_tipo.codigo IN('TIKTOK_LIVE','PROPUESTA_INNOVACION')
    );

    UPDATE public.tb_compensacion_evento
    SET estado_evento = 'RECHAZADO',
        fecha_actualizacion = now()
    WHERE id = p_id;
  END IF;

  IF v_tipo.codigo IN('VIDEO_VIRAL','RECUPERACION_CLIENTE','ALERTA_TEMPRANA') AND v_decision='APROBADO' THEN
    PERFORM public.f_private_compensacion_marketing_confirmar(p_id);
  END IF;
  IF v_tipo.categoria='REFERIDO' THEN
    PERFORM public.f_private_compensacion_referido_confirmar(p_id);
  END IF;
  SELECT COALESCE(MAX(numero_paso), 0) + 1 INTO v_paso
  FROM public.tb_compensacion_evento_revision
  WHERE id_evento = p_id;

  INSERT INTO public.tb_compensacion_evento_revision (
    id_evento, numero_paso, etapa, decision, comentario,
    id_usuario_revisor, datos_decision
  ) VALUES (
    p_id, v_paso, 'REVISION', v_decision, NULLIF(TRIM(p_comentario), ''),
    v_id_actor, COALESCE(v_snapshot, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'id', p_id,
    'estado_evento', v_decision,
    'importe_aprobado', CASE WHEN v_decision = 'APROBADO' THEN v_importe ELSE NULL END,
    'mensaje', CASE
      WHEN v_decision = 'APROBADO' THEN 'Evento aprobado y valorizado'
      ELSE 'Evento rechazado'
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_evento_tipo(p_codigo character varying, p_nombre character varying, p_categoria character varying, p_id_concepto bigint DEFAULT NULL::bigint, p_requiere_beneficiario boolean DEFAULT true, p_requiere_responsable boolean DEFAULT false, p_requiere_cliente boolean DEFAULT false, p_requiere_operacion boolean DEFAULT false, p_configuracion jsonb DEFAULT '{}'::jsonb, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_id_estado bigint;
  v_id bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF NULLIF(TRIM(p_codigo), '') IS NULL OR NULLIF(TRIM(p_nombre), '') IS NULL THEN
    RAISE EXCEPTION 'Codigo y nombre son obligatorios';
  END IF;

  IF p_configuracion IS NULL OR jsonb_typeof(p_configuracion) <> 'object' THEN
    RAISE EXCEPTION 'La configuracion debe ser un objeto JSON';
  END IF;

  IF p_id_concepto IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_concepto WHERE id = p_id_concepto
  ) THEN
    RAISE EXCEPTION 'El concepto seleccionado no existe';
  END IF;

  SELECT COALESCE(
    p_id_estado,
    (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' ORDER BY id LIMIT 1)
  ) INTO v_id_estado;

  IF v_id_estado IS NULL THEN
    RAISE EXCEPTION 'No existe un estado ACTIVO para registrar el tipo de evento';
  END IF;

  INSERT INTO public.tb_compensacion_evento_tipo (
    codigo, nombre, categoria, id_concepto,
    requiere_beneficiario, requiere_responsable,
    requiere_cliente, requiere_operacion,
    configuracion, id_estado, id_usuario
  ) VALUES (
    UPPER(TRIM(p_codigo)), TRIM(p_nombre), UPPER(TRIM(p_categoria)), p_id_concepto,
    COALESCE(p_requiere_beneficiario, true),
    COALESCE(p_requiere_responsable, false),
    COALESCE(p_requiere_cliente, false),
    COALESCE(p_requiere_operacion, false),
    p_configuracion, v_id_estado, v_id_actor
  )
  RETURNING id INTO v_id;

  RETURN (SELECT to_jsonb(t) FROM public.tb_compensacion_evento_tipo t WHERE t.id = v_id);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe un tipo de evento con ese codigo';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_excepcion(p_id_colaborador bigint, p_id_concepto bigint, p_tipo_calculo character varying, p_fecha_inicio date, p_motivo text, p_fecha_fin date DEFAULT NULL::date, p_monto numeric DEFAULT NULL::numeric, p_porcentaje numeric DEFAULT NULL::numeric, p_configuracion jsonb DEFAULT '{}'::jsonb, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_id_estado bigint;
  v_id bigint;
  v_tipo_calculo character varying := UPPER(TRIM(p_tipo_calculo));
BEGIN
  IF p_fecha_inicio IS NULL THEN
    RAISE EXCEPTION 'La fecha de inicio es obligatoria';
  END IF;

  v_contexto := public.f_private_compensacion_validar_colaborador(
    p_id_colaborador,
    'REGISTRAR',
    p_fecha_inicio
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF v_tipo_calculo IS NULL OR v_tipo_calculo NOT IN (
    'FIJO', 'PORCENTAJE', 'POR_MINUTO', 'POR_HORA', 'POR_DIA',
    'POR_UNIDAD', 'FORMULA'
  ) THEN
    RAISE EXCEPTION 'El tipo de calculo de la excepcion no es valido';
  END IF;

  IF v_tipo_calculo IN (
    'FIJO', 'POR_MINUTO', 'POR_HORA', 'POR_DIA', 'POR_UNIDAD'
  ) AND p_monto IS NULL THEN
    RAISE EXCEPTION 'El monto es obligatorio para el tipo de calculo seleccionado';
  END IF;

  IF v_tipo_calculo = 'PORCENTAJE' AND p_porcentaje IS NULL THEN
    RAISE EXCEPTION 'El porcentaje es obligatorio';
  END IF;

  IF v_tipo_calculo = 'FORMULA'
     AND COALESCE(p_configuracion, '{}'::jsonb) = '{}'::jsonb THEN
    RAISE EXCEPTION 'La configuracion de la formula es obligatoria';
  END IF;

  IF p_fecha_fin IS NOT NULL AND p_fecha_fin < p_fecha_inicio THEN
    RAISE EXCEPTION 'La fecha fin no puede ser anterior a la fecha de inicio';
  END IF;

  IF NULLIF(TRIM(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo de la excepcion es obligatorio';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_concepto
    WHERE id = p_id_concepto
      AND permite_excepcion
  ) THEN
    RAISE EXCEPTION 'El concepto no existe o no permite excepciones';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_compensacion_periodo pe
    WHERE pe.estado_periodo = 'CERRADO'
      AND daterange(pe.fecha_inicio, pe.fecha_fin, '[]')
          && daterange(
            p_fecha_inicio,
            COALESCE(p_fecha_fin, 'infinity'::date),
            '[]'
          )
  ) THEN
    RAISE EXCEPTION 'La excepcion no puede alcanzar un periodo cerrado';
  END IF;

  SELECT COALESCE(
    p_id_estado,
    (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' ORDER BY id LIMIT 1)
  ) INTO v_id_estado;

  IF v_id_estado IS NULL THEN
    RAISE EXCEPTION 'No existe un estado ACTIVO para registrar la excepcion';
  END IF;

  INSERT INTO public.tb_compensacion_excepcion (
    id_colaborador,
    id_concepto,
    tipo_calculo,
    monto,
    porcentaje,
    configuracion,
    fecha_inicio,
    fecha_fin,
    motivo,
    estado_aprobacion,
    id_estado,
    id_usuario
  ) VALUES (
    p_id_colaborador,
    p_id_concepto,
    v_tipo_calculo,
    CASE
      WHEN v_tipo_calculo IN ('PORCENTAJE', 'FORMULA') THEN NULL
      ELSE p_monto
    END,
    CASE
      WHEN v_tipo_calculo = 'PORCENTAJE' THEN p_porcentaje
      ELSE NULL
    END,
    COALESCE(p_configuracion, '{}'::jsonb),
    p_fecha_inicio,
    p_fecha_fin,
    TRIM(p_motivo),
    'PENDIENTE',
    v_id_estado,
    v_id_actor
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT to_jsonb(x)
    FROM public.tb_compensacion_excepcion x
    WHERE x.id = v_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_excepcion_decidir(p_id bigint, p_decision character varying, p_motivo_decision text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_actual public.tb_compensacion_excepcion%ROWTYPE;
  v_decision character varying := UPPER(TRIM(p_decision));
BEGIN
  SELECT * INTO v_actual
  FROM public.tb_compensacion_excepcion
  WHERE id = p_id
  FOR UPDATE;

  IF v_actual.id IS NULL THEN
    RAISE EXCEPTION 'La excepcion no existe';
  END IF;

  v_contexto := public.f_private_compensacion_validar_colaborador(
    v_actual.id_colaborador,
    'APROBAR',
    v_actual.fecha_inicio
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF v_decision IS NULL
     OR v_decision NOT IN ('APROBADA', 'RECHAZADA', 'ANULADA') THEN
    RAISE EXCEPTION 'La decision debe ser APROBADA, RECHAZADA o ANULADA';
  END IF;

  IF v_decision IN ('APROBADA', 'RECHAZADA')
     AND v_actual.estado_aprobacion <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo una excepcion pendiente puede aprobarse o rechazarse';
  END IF;

  IF v_decision = 'ANULADA'
     AND v_actual.estado_aprobacion NOT IN ('PENDIENTE', 'APROBADA') THEN
    RAISE EXCEPTION 'Solo una excepcion pendiente o aprobada puede anularse';
  END IF;

  IF v_decision IN ('RECHAZADA', 'ANULADA')
     AND NULLIF(TRIM(p_motivo_decision), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo de la decision es obligatorio';
  END IF;

  IF v_decision IN ('APROBADA', 'RECHAZADA')
     AND v_actual.id_usuario = v_id_actor THEN
    RAISE EXCEPTION 'El solicitante no puede aprobar ni rechazar su propia excepcion';
  END IF;

  -- Serializa decisiones del mismo colaborador para evitar aprobar dos
  -- excepciones superpuestas en transacciones concurrentes.
  PERFORM 1
  FROM public.tb_compensacion_colaborador
  WHERE id = v_actual.id_colaborador
  FOR UPDATE;

  IF v_decision = 'APROBADA' AND EXISTS (
    SELECT 1
    FROM public.tb_compensacion_excepcion otra
    WHERE otra.id <> v_actual.id
      AND otra.id_colaborador = v_actual.id_colaborador
      AND otra.id_concepto = v_actual.id_concepto
      AND otra.estado_aprobacion = 'APROBADA'
      AND daterange(
        otra.fecha_inicio,
        COALESCE(otra.fecha_fin, 'infinity'::date),
        '[]'
      ) && daterange(
        v_actual.fecha_inicio,
        COALESCE(v_actual.fecha_fin, 'infinity'::date),
        '[]'
      )
  ) THEN
    RAISE EXCEPTION 'La vigencia se superpone con otra excepcion aprobada';
  END IF;

  IF v_decision = 'APROBADA' AND EXISTS (
    SELECT 1
    FROM public.tb_compensacion_periodo pe
    WHERE pe.estado_periodo = 'CERRADO'
      AND daterange(pe.fecha_inicio, pe.fecha_fin, '[]')
          && daterange(
            v_actual.fecha_inicio,
            COALESCE(v_actual.fecha_fin, 'infinity'::date),
            '[]'
          )
  ) THEN
    RAISE EXCEPTION 'No se puede aprobar una excepcion que alcance un periodo cerrado';
  END IF;

  UPDATE public.tb_compensacion_excepcion
  SET estado_aprobacion = v_decision,
      id_usuario_aprueba = v_id_actor,
      fecha_aprobacion = now(),
      configuracion = configuracion || jsonb_build_object(
        'ultima_decision', v_decision,
        'motivo_decision', NULLIF(TRIM(p_motivo_decision), ''),
        'fecha_decision', now()
      ),
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (
    SELECT jsonb_build_object(
      'id', x.id,
      'estado_aprobacion', x.estado_aprobacion,
      'id_usuario_aprueba', x.id_usuario_aprueba,
      'fecha_aprobacion', x.fecha_aprobacion,
      'mensaje', CASE v_decision
        WHEN 'APROBADA' THEN 'Excepcion aprobada correctamente'
        WHEN 'RECHAZADA' THEN 'Excepcion rechazada correctamente'
        ELSE 'Excepcion anulada correctamente'
      END
    )
    FROM public.tb_compensacion_excepcion x
    WHERE x.id = p_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_exportacion(p_id_periodo bigint, p_tipo_reporte character varying, p_formato character varying, p_nombre_archivo character varying, p_filtros jsonb DEFAULT '{}'::jsonb, p_hash_archivo character varying DEFAULT NULL::character varying, p_total_registros integer DEFAULT 0, p_total_reportado numeric DEFAULT NULL::numeric, p_estado_exportacion character varying DEFAULT 'GENERADA'::character varying, p_mensaje_error text DEFAULT NULL::text, p_clave_idempotencia character varying DEFAULT NULL::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_usuario bigint;
  v_id_cierre bigint;
  v_tipo character varying := UPPER(TRIM(COALESCE(p_tipo_reporte, '')));
  v_formato character varying := UPPER(TRIM(COALESCE(p_formato, '')));
  v_estado character varying := UPPER(TRIM(COALESCE(p_estado_exportacion, 'GENERADA')));
  v_filtros jsonb := COALESCE(p_filtros, '{}'::jsonb);
  v_existente public.tb_compensacion_exportacion%ROWTYPE;
  v_nuevo public.tb_compensacion_exportacion%ROWTYPE;
BEGIN
  IF jsonb_typeof(v_filtros) <> 'object' THEN
    RAISE EXCEPTION 'Los filtros de exportacion deben ser un objeto JSON';
  END IF;

  v_contexto := public.f_private_compensacion_reporte_contexto(
    p_id_periodo,
    'REGISTRAR',
    NULLIF(v_filtros ->> 'id_sucursal', '')::bigint,
    NULLIF(v_filtros ->> 'id_colaborador', '')::bigint
  );
  v_id_usuario := (v_contexto ->> 'id_usuario')::bigint;
  

  IF v_tipo NOT IN (
    'GENERAL_FINANCIERO', 'DETALLE_COLABORADOR', 'RESUMEN_SEDE',
    'PRODUCTIVIDAD', 'OTRO'
  ) THEN
    RAISE EXCEPTION 'El tipo de reporte no es valido';
  END IF;
  IF v_formato NOT IN ('PDF', 'XLSX', 'CSV') THEN
    RAISE EXCEPTION 'El formato de exportacion no es valido';
  END IF;
  IF v_estado NOT IN ('GENERADA', 'ERROR') THEN
    RAISE EXCEPTION 'El estado inicial debe ser GENERADA o ERROR';
  END IF;
  IF BTRIM(COALESCE(p_nombre_archivo, '')) = '' THEN
    RAISE EXCEPTION 'El nombre del archivo es obligatorio';
  END IF;
  IF COALESCE(p_total_registros, -1) < 0
     OR (p_total_reportado IS NOT NULL AND p_total_reportado < 0) THEN
    RAISE EXCEPTION 'Los totales de la exportacion no pueden ser negativos';
  END IF;
  IF v_estado = 'GENERADA' AND BTRIM(COALESCE(p_hash_archivo, '')) = '' THEN
    RAISE EXCEPTION 'Una exportacion generada requiere hash del archivo';
  END IF;
  IF v_estado = 'ERROR' AND BTRIM(COALESCE(p_mensaje_error, '')) = '' THEN
    RAISE EXCEPTION 'Una exportacion con error requiere el mensaje correspondiente';
  END IF;

  IF BTRIM(COALESCE(p_clave_idempotencia, '')) <> '' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      FORMAT(
        'compensacion-exportacion:%s:%s:%s:%s:%s',
        v_id_usuario, p_id_periodo, v_tipo, v_formato,
        BTRIM(p_clave_idempotencia)
      ),
      0
    ));

    SELECT * INTO v_existente
    FROM public.tb_compensacion_exportacion e
    WHERE e.id_usuario = v_id_usuario
      AND e.id_periodo = p_id_periodo
      AND e.tipo_reporte = v_tipo
      AND e.formato = v_formato
      AND e.clave_idempotencia = BTRIM(p_clave_idempotencia)
    ORDER BY e.id DESC
    LIMIT 1;

    IF v_existente.id IS NOT NULL THEN
      RETURN to_jsonb(v_existente) || jsonb_build_object('creado', false);
    END IF;
  END IF;

  v_filtros := v_filtros || jsonb_build_object(
    'id_sucursal', NULLIF(v_contexto ->> 'id_sucursal_efectiva', '')::bigint,
    'id_colaborador', NULLIF(v_contexto ->> 'id_colaborador_efectivo', '')::bigint,
    'alcance', v_contexto ->> 'alcance',
    'fuente', v_contexto ->> 'fuente_reporte'
  );
  IF BTRIM(COALESCE(p_clave_idempotencia, '')) <> '' THEN
    v_filtros := v_filtros || jsonb_build_object(
      'clave_idempotencia', BTRIM(p_clave_idempotencia)
    );
  END IF;

  INSERT INTO public.tb_compensacion_exportacion (
    id_periodo, tipo_reporte, formato, filtros, nombre_archivo,
    hash_archivo, total_registros, total_reportado, estado_exportacion,
    mensaje_error, clave_idempotencia, id_usuario
  ) VALUES (
    p_id_periodo, v_tipo, v_formato, v_filtros,
    BTRIM(p_nombre_archivo), NULLIF(BTRIM(p_hash_archivo), ''),
    p_total_registros, p_total_reportado, v_estado,
    NULLIF(BTRIM(p_mensaje_error), ''),
    NULLIF(BTRIM(p_clave_idempotencia), ''), v_id_usuario
  )
  RETURNING * INTO v_nuevo;

  RETURN to_jsonb(v_nuevo) || jsonb_build_object('creado', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_incidencia(p_id_tipo_evento bigint, p_id_penalidad_tipo bigint, p_id_colaborador_responsable bigint, p_fecha_evento timestamp with time zone, p_motivo text, p_id_colaborador_reportante bigint DEFAULT NULL::bigint, p_titulo character varying DEFAULT NULL::character varying, p_evidencia jsonb DEFAULT '[]'::jsonb, p_referencias jsonb DEFAULT '[]'::jsonb, p_clave_origen character varying DEFAULT NULL::character varying, p_fuente character varying DEFAULT 'MANUAL'::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_alcance character varying;
  v_id_colaborador_actor bigint;
  v_id_sucursal_alcance bigint;
  v_id_reportante bigint;
  v_id_sucursal_origen bigint;
  v_id_sucursal_responsable bigint;
  v_id_plan bigint;
  v_id_cargo_responsable bigint;
  v_tipo public.tb_compensacion_evento_tipo%ROWTYPE;
  v_penalidad public.tb_compensacion_penalidad_tipo%ROWTYPE;
  v_id bigint;
  v_ref jsonb;
  v_solicitud jsonb; v_previo public.tb_compensacion_evento%ROWTYPE;
  v_fecha date := (p_fecha_evento AT TIME ZONE 'America/Lima')::date;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('INCIDENCIAS', 'REGISTRAR');
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;
  v_id_reportante := COALESCE(p_id_colaborador_reportante, v_id_colaborador_actor);

  IF NOT public.f_private_compensacion_equipo_visible(v_contexto,p_id_colaborador_responsable,v_fecha,false) THEN
    RAISE EXCEPTION 'Solo puede reportar sobre su equipo vigente; su propio caso corresponde a Administracion';
  END IF;
  IF v_id_reportante IS NULL THEN
    RAISE EXCEPTION 'Debe indicar el colaborador reportante';
  END IF;

  IF p_fecha_evento IS NULL OR NULLIF(TRIM(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'La fecha y el motivo de la incidencia son obligatorios';
  END IF;

  IF v_id_reportante = p_id_colaborador_responsable THEN
    RAISE EXCEPTION 'El reportante y el responsable no pueden ser la misma persona';
  END IF;

  IF p_evidencia IS NULL OR jsonb_typeof(p_evidencia) <> 'array'
     OR p_referencias IS NULL OR jsonb_typeof(p_referencias) <> 'array' THEN
    RAISE EXCEPTION 'La evidencia y las referencias deben ser arreglos JSON';
  END IF;

  SELECT t.* INTO v_tipo
  FROM public.tb_compensacion_evento_tipo t
  JOIN public.tb_estado es ON es.id = t.id_estado
  WHERE t.id = p_id_tipo_evento
    AND t.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
    AND UPPER(es.nombre) = 'ACTIVO';

  IF v_tipo.id IS NULL THEN
    RAISE EXCEPTION 'El tipo de incidencia no existe o esta inactivo';
  END IF;
  IF EXISTS(SELECT 1 FROM public.tb_usuario u WHERE u.id=v_id_actor AND u.id_rol=5 AND NOT coalesce(u.flag_super_admin,false))
     AND v_tipo.codigo<>'REPORTE_PENALIDAD' THEN
    RAISE EXCEPTION 'Los bonos de deteccion y operacion extra usan Auditoria de Facturacion, no penalidades';
  END IF;

  SELECT a.id_sucursal
  INTO v_id_sucursal_origen
  FROM public.tb_compensacion_asignacion a
  WHERE a.id_colaborador = v_id_reportante
    AND a.fecha_inicio <= v_fecha
    AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_fecha)
  ORDER BY a.fecha_inicio DESC, a.id DESC
  LIMIT 1;

  SELECT a.id_sucursal, a.id_cargo, a.id_plan
  INTO v_id_sucursal_responsable, v_id_cargo_responsable, v_id_plan
  FROM public.tb_compensacion_asignacion a
  WHERE a.id_colaborador = p_id_colaborador_responsable
    AND a.fecha_inicio <= v_fecha
    AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_fecha)
  ORDER BY a.fecha_inicio DESC, a.id DESC
  LIMIT 1;

  IF v_id_sucursal_origen IS NULL THEN
    RAISE EXCEPTION 'El reportante no tiene asignacion vigente para la fecha';
  END IF;

  IF v_id_sucursal_responsable IS NULL THEN
    RAISE EXCEPTION 'El responsable no tiene asignacion vigente para la fecha';
  END IF;

  IF v_alcance = 'PROPIO' AND v_id_reportante IS DISTINCT FROM v_id_colaborador_actor THEN
    RAISE EXCEPTION 'Solo puede registrar incidencias como reportante';
  END IF;

  IF v_alcance = 'SEDE' AND v_id_sucursal_origen IS DISTINCT FROM v_id_sucursal_alcance THEN
    RAISE EXCEPTION 'El reportante no pertenece a su sede autorizada';
  END IF;
  IF v_alcance='SEDE' AND (v_id_reportante IS DISTINCT FROM v_id_colaborador_actor
     OR v_id_sucursal_responsable IS DISTINCT FROM v_id_sucursal_alcance
     OR (p_id_colaborador_responsable IS DISTINCT FROM v_id_colaborador_actor AND NOT EXISTS(
       SELECT 1 FROM public.tb_compensacion_colaborador c JOIN public.tb_usuario u ON u.id=c.id_usuario
       WHERE c.id=p_id_colaborador_responsable AND u.id_rol NOT IN (1,3)))) THEN
    RAISE EXCEPTION 'Jefatura reporta como titular y solo sobre su personal ATC o sobre si misma';
  END IF;
  IF v_alcance='SEDE' AND v_tipo.codigo NOT IN('REPORTE_PENALIDAD','AUDITORIA_ACTIVA') THEN
    RAISE EXCEPTION 'El tipo de incidencia no corresponde a Jefatura';
  END IF;

  SELECT pt.* INTO v_penalidad
  FROM public.f_private_compensacion_penalidades_fecha(v_id_plan, v_fecha) pt
  JOIN public.tb_estado es ON es.id = pt.id_estado
  WHERE pt.id = p_id_penalidad_tipo
    AND (pt.id_cargo IS NULL OR pt.id_cargo = v_id_cargo_responsable)
    AND UPPER(es.nombre) = 'ACTIVO';

  -- Jefatura: hallazgos de Auditoria Activa, o Uniforme e Indisciplina de su equipo como reporte de penalidad.
  IF v_alcance='SEDE' AND NOT coalesce(v_penalidad.codigo NOT LIKE 'JEFE_%' AND CASE WHEN v_tipo.codigo='REPORTE_PENALIDAD'
       THEN v_penalidad.codigo ~ '(UNIFORME|INDISCIPLINA)$'
       ELSE v_penalidad.monto_bono_reportante IS NOT NULL AND v_penalidad.codigo !~ '(UNIFORME|INDISCIPLINA)$' END, false) THEN
    RAISE EXCEPTION 'Jefatura solo registra hallazgos de Auditoria Activa, no penalidades';
  END IF;
  IF v_penalidad.codigo ~ '(UNIFORME|INDISCIPLINA)$' AND NOT EXISTS (
      SELECT 1 FROM public.tb_usuario u WHERE u.id=v_id_actor
        AND (u.id_rol IN(1,3) OR coalesce(u.flag_super_admin,false))) THEN
    RAISE EXCEPTION 'Uniforme e indisciplina se registran por Jefatura o Administracion';
  END IF;
  IF v_penalidad.id IS NULL THEN
    RAISE EXCEPTION 'La penalidad no aplica a la fecha o cargo del responsable';
  END IF;
  IF v_penalidad.codigo = 'ATC_FRAUDE_DIGITAL' AND NOT EXISTS (
      SELECT 1 FROM public.tb_usuario u WHERE u.id=v_id_actor AND (u.id_rol=1 OR coalesce(u.flag_super_admin,false))) THEN
    RAISE EXCEPTION 'Tolerancia Cero Digital solo la registra Administracion';
  END IF;

  IF EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=v_id_actor AND id_rol=5 AND NOT coalesce(flag_super_admin,false)) THEN
    PERFORM pe.id FROM public.tb_compensacion_periodo pe WHERE pe.periodo=date_trunc('month',v_fecha)::date ORDER BY pe.id FOR UPDATE;
    IF NOT public.f_private_compensacion_facturacion_concepto_operativo(v_penalidad.codigo) THEN
      RAISE EXCEPTION 'Este concepto requiere Jefatura o Administracion; Facturacion reporta hallazgos operativos'; END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_referencias) ref
      JOIN public.tb_operacion_proceso o ON o.id=nullif(ref->>'id_operacion','')::bigint
      WHERE ref->>'tipo_referencia'='OPERACION'
        AND public.f_private_compensacion_facturacion_auditoria_operacion(o.id,btrim(o.dni_cliente)) IS NOT NULL) THEN
      RAISE EXCEPTION 'El hallazgo de Facturacion requiere una operacion real autorizada'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_referencias) cli
      WHERE cli->>'tipo_referencia'='CLIENTE' AND NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(p_referencias) ref
        JOIN public.tb_operacion_proceso o ON o.id=nullif(ref->>'id_operacion','')::bigint
        WHERE ref->>'tipo_referencia'='OPERACION'
          AND (nullif(cli->>'id_cliente','') IS NULL OR o.id_cliente=(cli->>'id_cliente')::bigint)
          AND (nullif(btrim(cli->>'identificador_externo'),'') IS NULL OR btrim(o.dni_cliente)=btrim(cli->>'identificador_externo')))) THEN
      RAISE EXCEPTION 'El cliente no corresponde a las operaciones del hallazgo'; END IF;
    -- Un expediente por concepto y operacion, incluso si se cambia la clave de captura.
    FOR v_ref IN SELECT value FROM jsonb_array_elements(p_referencias) WHERE value->>'tipo_referencia'='OPERACION'
      ORDER BY (value->>'id_operacion')::bigint LOOP
      IF NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso o WHERE o.id=(v_ref->>'id_operacion')::bigint
        AND public.f_private_compensacion_facturacion_auditoria_operacion(o.id,btrim(o.dni_cliente)) IS NOT NULL) THEN
        RAISE EXCEPTION 'La referencia operativa no esta autorizada'; END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended('facturacion:incidencia:'||v_penalidad.codigo||':'||(v_ref->>'id_operacion'),0));
      IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia r
        JOIN public.tb_compensacion_evento e ON e.id=r.id_evento
        LEFT JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id=e.id_penalidad_tipo
        WHERE r.id_operacion=(v_ref->>'id_operacion')::bigint
          AND coalesce(e.datos#>>'{penalidad_tipo_snapshot,codigo}',e.criterios_validacion_snapshot->>'codigo_penalidad',pt.codigo)=v_penalidad.codigo
          AND e.estado_evento IN('BORRADOR','PENDIENTE','APROBADO','LIQUIDADO')) THEN
        RAISE EXCEPTION 'Ya existe un expediente de este concepto para la operacion'; END IF;
    END LOOP;
  END IF;

  IF v_tipo.categoria = 'AUDITORIA_PAGO'
     AND (
       v_penalidad.id_concepto_bono_reportante IS NULL
       OR v_penalidad.monto_bono_reportante IS NULL
     ) THEN
    RAISE EXCEPTION 'La auditoria de pagos requiere concepto y monto de bono al reportante';
  END IF;

  PERFORM public.f_private_compensacion_pagos_periodo_editable(p_id_colaborador_responsable,date_trunc('month',v_fecha)::date);
  IF nullif(btrim(p_clave_origen),'') IS NOT NULL THEN
    v_solicitud:=jsonb_build_object('tipo',p_id_tipo_evento,'penalidad',p_id_penalidad_tipo,'responsable',p_id_colaborador_responsable,'reportante',v_id_reportante,'fecha',p_fecha_evento,'motivo',p_motivo,'titulo',p_titulo,'evidencia',p_evidencia,'referencias',p_referencias);
    PERFORM pg_advisory_xact_lock(hashtextextended('incidencia:captura:'||v_id_actor||':'||p_clave_origen,0));
    SELECT * INTO v_previo FROM public.tb_compensacion_evento WHERE fuente=p_fuente AND clave_origen=p_clave_origen FOR UPDATE;
    IF v_previo.id IS NOT NULL THEN
      IF v_previo.id_usuario_registra IS DISTINCT FROM v_id_actor OR v_previo.datos->'solicitud_admin_b4' IS DISTINCT FROM v_solicitud THEN RAISE EXCEPTION 'La clave ya pertenece a otra captura'; END IF;
      RETURN jsonb_build_object('id',v_previo.id,'estado_evento',v_previo.estado_evento);
    END IF;
  END IF;
  FOR v_ref IN SELECT value FROM jsonb_array_elements(p_referencias) WHERE value->>'tipo_referencia'='OPERACION' ORDER BY (value->>'id_operacion')::bigint LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('incidencia:hecho:'||v_penalidad.codigo||':'||p_id_colaborador_responsable||':'||(v_ref->>'id_operacion'),0));
    IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_referencia r ON r.id_evento=e.id
      LEFT JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id=e.id_penalidad_tipo
      WHERE r.id_operacion=(v_ref->>'id_operacion')::bigint AND e.id_colaborador_responsable=p_id_colaborador_responsable
        AND coalesce(e.datos#>>'{penalidad_tipo_snapshot,codigo}',pt.codigo)=v_penalidad.codigo AND e.estado_evento IN('BORRADOR','PENDIENTE','APROBADO','LIQUIDADO')) THEN RAISE EXCEPTION 'Ya existe un expediente de este concepto, responsable y operacion'; END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM public.tb_compensacion_periodo pe
    WHERE pe.periodo = date_trunc('month', v_fecha)::date
      AND pe.estado_periodo = 'CERRADO'
  ) THEN
    RAISE EXCEPTION 'No se pueden registrar incidencias en un periodo cerrado';
  END IF;

  INSERT INTO public.tb_compensacion_evento (
    id_tipo_evento, id_colaborador_beneficiario, id_colaborador_responsable,
    id_sucursal_origen, id_sucursal_responsable, id_penalidad_tipo,
    fecha_evento, periodo_imputacion, fuente, clave_origen,
    titulo, descripcion, datos, evidencia, estado_evento, id_usuario_registra
  ) VALUES (
    v_tipo.id, v_id_reportante, p_id_colaborador_responsable,
    v_id_sucursal_origen, v_id_sucursal_responsable, v_penalidad.id,
    p_fecha_evento, date_trunc('month', v_fecha)::date,
    UPPER(TRIM(COALESCE(p_fuente, 'MANUAL'))), NULLIF(TRIM(p_clave_origen), ''),
    COALESCE(NULLIF(TRIM(p_titulo), ''), v_penalidad.nombre), TRIM(p_motivo),
    jsonb_build_object(
      'penalidad_tipo_snapshot', to_jsonb(v_penalidad),
      'rol_reportante_registro', (SELECT u.id_rol FROM public.tb_compensacion_colaborador c
        JOIN public.tb_usuario u ON u.id=c.id_usuario WHERE c.id=v_id_reportante),
      'politica_penalidad', 'REGISTRO_V1'
    ),
    p_evidencia, 'BORRADOR', v_id_actor
  ) RETURNING id INTO v_id;

  FOR v_ref IN SELECT value FROM jsonb_array_elements(p_referencias)
  LOOP
    IF jsonb_typeof(v_ref) <> 'object' THEN
      RAISE EXCEPTION 'Cada referencia debe ser un objeto JSON';
    END IF;

    INSERT INTO public.tb_compensacion_evento_referencia (
      id_evento, tipo_referencia, id_cliente, id_operacion,
      identificador_externo, datos_snapshot, id_usuario
    ) VALUES (
      v_id, UPPER(TRIM(COALESCE(v_ref ->> 'tipo_referencia', 'OTRA'))),
      NULLIF(v_ref ->> 'id_cliente', '')::bigint,
      NULLIF(v_ref ->> 'id_operacion', '')::bigint,
      NULLIF(TRIM(v_ref ->> 'identificador_externo'), ''),
      COALESCE(v_ref -> 'datos_snapshot', '{}'::jsonb), v_id_actor
    );
  END LOOP;

  IF v_solicitud IS NOT NULL THEN UPDATE public.tb_compensacion_evento SET datos=datos||jsonb_build_object('solicitud_admin_b4',v_solicitud) WHERE id=v_id; END IF;
  RETURN jsonb_build_object(
    'id', v_id,
    'estado_evento', 'BORRADOR',
    'categoria', v_tipo.categoria,
    'mensaje', 'Incidencia registrada como borrador'
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'La incidencia o alguna referencia ya fue registrada';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_incidencia_anular(p_id bigint, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_evento public.tb_compensacion_evento%ROWTYPE;
  v_id_actor bigint;
  v_alcance character varying;
  v_id_sucursal_alcance bigint;
  v_id_colaborador_actor bigint;
  v_paso integer;
BEGIN
  IF NULLIF(TRIM(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Debe indicar el motivo de anulacion';
  END IF;

  v_contexto := public.f_private_compensacion_incidencia_validar_alcance(
    p_id, 'EDITAR', true
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;
  v_alcance := v_contexto ->> 'alcance';
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  SELECT * INTO v_evento FROM public.tb_compensacion_evento WHERE id = p_id;

  IF v_evento.estado_evento NOT IN ('BORRADOR', 'PENDIENTE', 'RECHAZADO') THEN
    RAISE EXCEPTION 'La incidencia valorizada o anulada no puede modificarse';
  END IF;

  IF v_alcance = 'PROPIO'
     AND v_id_colaborador_actor IS DISTINCT FROM v_evento.id_colaborador_beneficiario THEN
    RAISE EXCEPTION 'Solo el reportante puede anular la incidencia';
  END IF;

  IF v_alcance = 'SEDE'
     AND v_id_sucursal_alcance IS DISTINCT FROM v_evento.id_sucursal_origen THEN
    RAISE EXCEPTION 'Solo la sede reportante puede anular la incidencia';
  END IF;

  SELECT COALESCE(MAX(numero_paso), 0) + 1 INTO v_paso
  FROM public.tb_compensacion_evento_revision WHERE id_evento = p_id;

  INSERT INTO public.tb_compensacion_evento_revision (
    id_evento, numero_paso, etapa, decision, comentario,
    id_usuario_revisor, datos_decision
  ) VALUES (
    p_id, v_paso, 'ANULACION', 'ANULADO', TRIM(p_motivo),
    v_id_actor, jsonb_build_object('estado_anterior', v_evento.estado_evento)
  );

  UPDATE public.tb_compensacion_evento
  SET estado_evento = 'ANULADO', fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', p_id,
    'estado_evento', 'ANULADO',
    'mensaje', 'Incidencia anulada con trazabilidad'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_incidencia_descargo(p_id bigint, p_comentario text, p_evidencia jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_evento public.tb_compensacion_evento%ROWTYPE;
  v_penalidad public.tb_compensacion_penalidad_tipo%ROWTYPE;
  v_id_actor bigint;
  v_id_colaborador_actor bigint;
  v_paso integer;
BEGIN
  IF NULLIF(TRIM(p_comentario), '') IS NULL THEN
    RAISE EXCEPTION 'El comentario del descargo es obligatorio';
  END IF;

  IF EXISTS(SELECT 1 FROM public.tb_compensacion_caza_errores_vinculo v WHERE v.id_evento_consecuencia=p_id AND v.tipo_consecuencia='COMISION_JEFE') THEN
    RAISE EXCEPTION 'Una comision no admite descargo de penalidad';
  END IF;

  IF p_evidencia IS NULL OR jsonb_typeof(p_evidencia) <> 'array' THEN
    RAISE EXCEPTION 'La evidencia del descargo debe ser un arreglo JSON';
  END IF;

  IF EXISTS(SELECT 1 FROM public.tb_usuario WHERE auth_user_id=auth.uid() AND id_rol IN(2,3,4,5,6) AND NOT coalesce(flag_super_admin,false)) THEN
    v_contexto:=public.f_private_compensacion_contexto('RESUMEN','CONSULTAR');
    IF EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=(v_contexto->>'id_usuario')::bigint AND id_rol=6) THEN
      PERFORM public.f_private_compensacion_marketing_perfil((v_contexto->>'id_colaborador')::bigint);
    ELSIF EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=(v_contexto->>'id_usuario')::bigint AND id_rol=2) THEN PERFORM public.f_private_compensacion_pagos_perfil((v_contexto->>'id_colaborador')::bigint); END IF;
  ELSE v_contexto:=public.f_private_compensacion_contexto('INCIDENCIAS','REGISTRAR'); END IF;
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;

  SELECT * INTO v_evento FROM public.tb_compensacion_evento WHERE id=p_id;
  IF v_evento.id IS NULL THEN RAISE EXCEPTION 'La incidencia no existe'; END IF;
  PERFORM public.f_private_compensacion_pagos_periodo_editable(v_evento.id_colaborador_responsable,v_evento.periodo_imputacion);
  SELECT * INTO v_evento FROM public.tb_compensacion_evento WHERE id=p_id FOR UPDATE;

  IF v_evento.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento_tipo t
    WHERE t.id = v_evento.id_tipo_evento
      AND t.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
  ) THEN
    RAISE EXCEPTION 'La incidencia no existe';
  END IF;

  PERFORM public.f_private_compensacion_pagos_periodo_editable(v_evento.id_colaborador_responsable,v_evento.periodo_imputacion);
  IF v_evento.estado_evento <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo se puede responder una incidencia pendiente';
  END IF;

  IF v_id_colaborador_actor IS DISTINCT FROM v_evento.id_colaborador_responsable THEN
    RAISE EXCEPTION 'Solo el colaborador responsable puede presentar su descargo';
  END IF;

  v_penalidad := public.f_private_compensacion_incidencia_penalidad_registrada(p_id);

  IF NOT v_penalidad.requiere_respuesta THEN
    RAISE EXCEPTION 'Este tipo de penalidad no requiere descargo';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento_revision
    WHERE id_evento = p_id
      AND etapa = 'DESCARGO'
      AND numero_paso > COALESCE((
        SELECT MAX(enviado.numero_paso)
        FROM public.tb_compensacion_evento_revision enviado
        WHERE enviado.id_evento = p_id
          AND enviado.decision = 'ENVIADO'
      ), 0)
  ) THEN
    RAISE EXCEPTION 'La incidencia ya tiene un descargo para el envio vigente';
  END IF;

  SELECT COALESCE(MAX(numero_paso), 0) + 1 INTO v_paso
  FROM public.tb_compensacion_evento_revision WHERE id_evento = p_id;

  INSERT INTO public.tb_compensacion_evento_revision (
    id_evento, numero_paso, etapa, decision, comentario,
    id_usuario_revisor, datos_decision
  ) VALUES (
    p_id, v_paso, 'DESCARGO', 'OBSERVADO', TRIM(p_comentario),
    v_id_actor, jsonb_build_object(
      'tipo', 'DESCARGO_RESPONSABLE',
      'evidencia', p_evidencia,
      'id_colaborador_responsable', v_evento.id_colaborador_responsable
    )
  );

  RETURN jsonb_build_object(
    'id', p_id,
    'estado_evento', 'PENDIENTE',
    'mensaje', 'Descargo registrado para revision de la sede'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_incidencia_enviar(p_id bigint, p_comentario text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_evento public.tb_compensacion_evento%ROWTYPE;
  v_tipo public.tb_compensacion_evento_tipo%ROWTYPE;
  v_id_actor bigint;
  v_paso integer;
BEGIN
  v_contexto := public.f_private_compensacion_incidencia_validar_alcance(
    p_id, 'REGISTRAR', true
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;
  SELECT * INTO v_evento FROM public.tb_compensacion_evento WHERE id = p_id;
  SELECT * INTO v_tipo FROM public.tb_compensacion_evento_tipo WHERE id = v_evento.id_tipo_evento;

  IF v_evento.estado_evento='PENDIENTE' AND v_evento.id_usuario_registra=v_id_actor THEN RETURN jsonb_build_object('id',p_id,'estado_evento','PENDIENTE'); END IF;
  IF v_evento.estado_evento <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se pueden enviar incidencias en borrador';
  END IF;


  IF v_tipo.requiere_cliente AND NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento_referencia
    WHERE id_evento = p_id AND id_cliente IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'La incidencia requiere una referencia de cliente';
  END IF;

  IF v_tipo.requiere_operacion AND NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento_referencia
    WHERE id_evento = p_id AND id_operacion IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'La incidencia requiere una referencia de operacion';
  END IF;

  SELECT COALESCE(MAX(numero_paso), 0) + 1 INTO v_paso
  FROM public.tb_compensacion_evento_revision WHERE id_evento = p_id;

  INSERT INTO public.tb_compensacion_evento_revision (
    id_evento, numero_paso, etapa, decision, comentario,
    id_usuario_revisor, datos_decision
  ) VALUES (
    p_id, v_paso, 'REPORTE', 'ENVIADO', NULLIF(TRIM(p_comentario), ''),
    v_id_actor, jsonb_build_object(
      'id_sucursal_origen', v_evento.id_sucursal_origen,
      'id_sucursal_responsable', v_evento.id_sucursal_responsable
    )
  );

  UPDATE public.tb_compensacion_evento
  SET estado_evento = 'PENDIENTE', fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', p_id,
    'estado_evento', 'PENDIENTE',
    'mensaje', 'Incidencia enviada a la sede responsable'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_incidencia_observar(p_id bigint, p_comentario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_estado character varying;
  v_paso integer;
BEGIN
  IF NULLIF(TRIM(p_comentario), '') IS NULL THEN
    RAISE EXCEPTION 'Debe indicar la observacion';
  END IF;

  v_contexto := public.f_private_compensacion_incidencia_validar_alcance(
    p_id, 'REVISAR', true
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;
  SELECT estado_evento INTO v_estado FROM public.tb_compensacion_evento WHERE id = p_id;

  IF v_estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo se pueden observar incidencias pendientes';
  END IF;

  SELECT COALESCE(MAX(numero_paso), 0) + 1 INTO v_paso
  FROM public.tb_compensacion_evento_revision WHERE id_evento = p_id;

  INSERT INTO public.tb_compensacion_evento_revision (
    id_evento, numero_paso, etapa, decision, comentario,
    id_usuario_revisor, datos_decision
  ) VALUES (
    p_id, v_paso, 'DECISION_SEDE', 'OBSERVADO', TRIM(p_comentario),
    v_id_actor, jsonb_build_object('estado_nuevo', 'BORRADOR')
  );

  UPDATE public.tb_compensacion_evento
  SET estado_evento = 'BORRADOR', fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', p_id,
    'estado_evento', 'BORRADOR',
    'mensaje', 'Incidencia devuelta con observaciones'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_incidencia_referencia(p_id_evento bigint, p_tipo_referencia character varying, p_id_cliente bigint DEFAULT NULL::bigint, p_id_operacion bigint DEFAULT NULL::bigint, p_identificador_externo character varying DEFAULT NULL::character varying, p_datos_snapshot jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_estado character varying;
  v_id bigint;
BEGIN
  v_contexto := public.f_private_compensacion_incidencia_validar_alcance(
    p_id_evento, 'EDITAR', true
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  SELECT estado_evento INTO v_estado
  FROM public.tb_compensacion_evento WHERE id = p_id_evento;

  IF v_estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se agregan referencias a incidencias en borrador';
  END IF;

  IF p_id_cliente IS NULL AND p_id_operacion IS NULL
     AND NULLIF(TRIM(p_identificador_externo), '') IS NULL THEN
    RAISE EXCEPTION 'Debe indicar un cliente, operacion o identificador externo';
  END IF;

  IF p_datos_snapshot IS NULL OR jsonb_typeof(p_datos_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'El snapshot debe ser un objeto JSON';
  END IF;

  INSERT INTO public.tb_compensacion_evento_referencia (
    id_evento, tipo_referencia, id_cliente, id_operacion,
    identificador_externo, datos_snapshot, id_usuario
  ) VALUES (
    p_id_evento, UPPER(TRIM(p_tipo_referencia)), p_id_cliente, p_id_operacion,
    NULLIF(TRIM(p_identificador_externo), ''), p_datos_snapshot, v_id_actor
  ) RETURNING id INTO v_id;

  RETURN (SELECT to_jsonb(r) FROM public.tb_compensacion_evento_referencia r WHERE r.id = v_id);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'La referencia ya esta vinculada a la incidencia';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_incidencia_resolver(p_id bigint, p_decision character varying, p_comentario text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_evento public.tb_compensacion_evento%ROWTYPE;
  v_tipo public.tb_compensacion_evento_tipo%ROWTYPE;
  v_penalidad public.tb_compensacion_penalidad_tipo%ROWTYPE;
  v_id_actor bigint;
  v_id_colaborador_actor bigint;
  v_decision character varying := UPPER(TRIM(COALESCE(p_decision, '')));
  v_paso integer;
  v_snapshot jsonb;
  v_importe_descuento numeric;
  v_revision_admin boolean := false;
  v_excepcion boolean := false;
BEGIN
  IF v_decision NOT IN ('APROBADO', 'RECHAZADO') THEN
    RAISE EXCEPTION 'La decision debe ser APROBADO o RECHAZADO';
  END IF;

  v_contexto := public.f_private_compensacion_incidencia_validar_alcance(
    p_id,
    CASE WHEN v_decision = 'APROBADO' THEN 'APROBAR' ELSE 'REVISAR' END,
    true
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;

  SELECT * INTO v_evento FROM public.tb_compensacion_evento WHERE id = p_id;
  SELECT * INTO v_tipo FROM public.tb_compensacion_evento_tipo WHERE id = v_evento.id_tipo_evento;
  v_penalidad := public.f_private_compensacion_incidencia_penalidad_registrada(p_id);

  IF v_evento.estado_evento <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo se pueden resolver incidencias pendientes';
  END IF;

  -- SQL117: la excepcion de Queja Tardia solo exime al registrador administrativo; el responsable y el reportante siguen excluidos.
  v_excepcion := v_id_actor = v_evento.id_usuario_registra
    AND public.f_private_compensacion_queja_tardia_excepcion(p_id, v_id_actor);
  IF (v_id_actor = v_evento.id_usuario_registra AND NOT v_excepcion)
     OR v_id_colaborador_actor IN (
       v_evento.id_colaborador_beneficiario,
       v_evento.id_colaborador_responsable
     ) THEN
    RAISE EXCEPTION 'El reportante, el responsable o el registrador no pueden resolver la incidencia';
  END IF;

  IF coalesce(length(btrim(p_comentario)),0)<10 THEN RAISE EXCEPTION 'Explica el motivo de la decision (minimo diez caracteres)'; END IF;
  IF v_decision = 'RECHAZADO' AND NULLIF(TRIM(p_comentario), '') IS NULL THEN
    RAISE EXCEPTION 'Debe indicar el motivo del rechazo';
  END IF;


  IF v_decision='APROBADO' AND EXISTS(SELECT 1 FROM public.tb_compensacion_caza_errores_vinculo v WHERE v.id_evento_consecuencia=p_id AND v.tipo_consecuencia='COMISION_JEFE')
    AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_caza_errores_vinculo v JOIN public.tb_compensacion_hallazgo_correccion c ON c.id_evento=v.id_evento_origen
      WHERE v.id_evento_consecuencia=p_id AND c.estado='CORREGIDO' AND c.antes_escalamiento)
  THEN RAISE EXCEPTION 'La comision requiere correccion documentada antes de escalar'; END IF;

  IF v_decision = 'APROBADO'
     AND v_penalidad.requiere_respuesta
     AND NOT EXISTS (
       SELECT 1 FROM public.tb_compensacion_evento_revision
       WHERE id_evento = p_id
         AND etapa = 'DESCARGO'
         AND numero_paso > COALESCE((
           SELECT MAX(enviado.numero_paso)
           FROM public.tb_compensacion_evento_revision enviado
           WHERE enviado.id_evento = p_id
             AND enviado.decision = 'ENVIADO'
         ), 0)
     ) THEN
    RAISE EXCEPTION 'La penalidad requiere el descargo previo del responsable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tb_compensacion_periodo pe
    WHERE pe.periodo = v_evento.periodo_imputacion
      AND pe.estado_periodo = 'CERRADO'
  ) THEN
    RAISE EXCEPTION 'El periodo de imputacion ya esta cerrado';
  END IF;

  IF v_decision = 'APROBADO' THEN
    -- Orden fijo: tipo (evidencia compartida), despues persona/mes
    -- (uniforme/indisciplina entre tipos o versiones). Antes de leer confirmados.
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'compensacion:incidencia:tipo:'||v_evento.id_penalidad_tipo::text,0));
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'compensacion:incidencia:persona:'||v_evento.id_colaborador_responsable::text
      ||':'||v_evento.periodo_imputacion::text,0));
  END IF;

  IF v_decision = 'APROBADO' AND EXISTS (
    SELECT 1
    FROM public.tb_compensacion_evento_referencia actual
    JOIN public.tb_compensacion_evento_referencia otra
      ON otra.id_evento <> actual.id_evento
     AND (
       (actual.id_operacion IS NOT NULL AND otra.id_operacion = actual.id_operacion)
       OR (
         actual.identificador_externo IS NOT NULL
         AND otra.tipo_referencia = actual.tipo_referencia
         AND otra.identificador_externo = actual.identificador_externo
       )
     )
    JOIN public.tb_compensacion_evento ev_otra ON ev_otra.id = otra.id_evento
    WHERE actual.id_evento = p_id
      AND ev_otra.id_penalidad_tipo = v_evento.id_penalidad_tipo
      AND ev_otra.estado_evento IN ('APROBADO', 'LIQUIDADO')
  ) THEN
    RAISE EXCEPTION 'La evidencia ya tiene una penalidad aprobada del mismo tipo';
  END IF;

  IF v_decision = 'APROBADO' THEN
    v_importe_descuento := v_penalidad.monto_referencia;
    IF v_penalidad.codigo IN ('JEFE_UNIFORME','JEFE_INDISCIPLINA') THEN
      v_importe_descuento := public.f_private_compensacion_jefatura_descuento_incidente(p_id);
    ELSIF v_penalidad.codigo = 'JEFE_ERROR_CUADRO' THEN
      SELECT EXISTS (SELECT 1 FROM public.tb_usuario u WHERE u.id=v_id_actor
        AND (u.id_rol=1 OR coalesce(u.flag_super_admin,false))) INTO v_revision_admin;
      IF NOT v_revision_admin OR NULLIF(TRIM(p_comentario),'') IS NULL THEN
        RAISE EXCEPTION 'El error de cuadro requiere confirmacion administrativa explicita y comentario';
      END IF;
      -- Confirma el hecho; el importe mensual depende de todas las comisiones.
      v_importe_descuento := 0;
    ELSIF v_penalidad.codigo = 'ATC_FRAUDE_DIGITAL' THEN
      SELECT EXISTS (SELECT 1 FROM public.tb_usuario u WHERE u.id=v_id_actor
        AND (u.id_rol=1 OR coalesce(u.flag_super_admin,false))) INTO v_revision_admin;
      IF NOT v_revision_admin OR NULLIF(TRIM(p_comentario),'') IS NULL THEN
        RAISE EXCEPTION 'Tolerancia Cero Digital requiere confirmacion administrativa explicita y comentario';
      END IF;
      -- Confirma el hecho; la perdida del 100 por ciento de comisiones se calcula en la liquidacion del mes del hecho.
      v_importe_descuento := 0;
    END IF;
    v_snapshot := jsonb_build_object(
      'id_penalidad_tipo', v_penalidad.id,
      'codigo_penalidad', v_penalidad.codigo,
      'id_plan_version', v_penalidad.id_plan_version,
      'id_concepto_descuento', v_penalidad.id_concepto_descuento,
      'importe_descuento', v_importe_descuento,
      'id_colaborador_responsable', v_evento.id_colaborador_responsable,
      'id_concepto_bono_reportante', v_penalidad.id_concepto_bono_reportante,
      'importe_bono_reportante', CASE WHEN v_evento.datos->>'rol_reportante_registro'='5'
        THEN 0 ELSE COALESCE(v_penalidad.monto_bono_reportante, 0) END,
      'id_colaborador_reportante', v_evento.id_colaborador_beneficiario,
      'categoria', v_tipo.categoria,
      'configuracion_penalidad', v_penalidad.configuracion,
      'fecha_decision', now()
    );
    IF v_penalidad.codigo IN ('JEFE_UNIFORME','JEFE_INDISCIPLINA') THEN
      v_snapshot := v_snapshot || jsonb_build_object(
        'politica_descuento','JEFE_CRONOLOGICO_V1','pierde_bono_puntualidad',true,
        'orden_hechos','fecha_evento,id','recalcular_en_preliquidacion',true);
    ELSIF v_penalidad.codigo = 'JEFE_ERROR_CUADRO' THEN
      v_snapshot := v_snapshot || jsonb_build_object('revision_admin_confirmada',true,
        'id_usuario_revision_admin',v_id_actor,'calculo_mensual','JEFE_ERROR_CUADRO');
    ELSIF v_penalidad.codigo = 'ATC_FRAUDE_DIGITAL' THEN
      v_snapshot := v_snapshot || jsonb_build_object('revision_admin_confirmada',true,
        'id_usuario_revision_admin',v_id_actor,'calculo_mensual','ATC_FRAUDE_DIGITAL');
    END IF;
    IF v_penalidad.codigo ~ '^PAG_[A-Z_]+_(CIERRE_INCOMPLETO|RETRASO_VOUCHER|DESCUADRE|ERROR_PAGO_CRITICO)$' THEN
      IF NOT coalesce((v_contexto->>'es_super_admin')::boolean,false) OR nullif(btrim(p_comentario),'') IS NULL THEN
        RAISE EXCEPTION 'El control de Pagos requiere revision administrativa independiente'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia ref JOIN public.tb_operacion_proceso o ON o.id=ref.id_operacion
        JOIN public.tb_compensacion_colaborador responsable ON responsable.id=v_evento.id_colaborador_responsable
        WHERE ref.id_evento=p_id AND ref.tipo_referencia='OPERACION' AND coalesce(o.id_usuario_gestor,o.id_usuario)=responsable.id_usuario) THEN
        RAISE EXCEPTION 'Vincula la operacion del gestor responsable'; END IF;
    END IF;
    IF v_penalidad.codigo ~ '^PAG_[A-Z_]+_(CIERRE_INCOMPLETO|RETRASO_VOUCHER)$' AND NOT EXISTS(
      SELECT 1 FROM public.tb_compensacion_evento_referencia ref JOIN public.tb_operacion_proceso o ON o.id=ref.id_operacion
      CROSS JOIN LATERAL public.f_private_compensacion_pagos_fuentes(v_evento.id_colaborador_responsable,(o.fecha_pagado AT TIME ZONE 'America/Lima')::date) f
      WHERE ref.id_evento=p_id AND (f->>'id')::bigint=o.id AND f->>'pagada'='true' AND v_evento.fecha_evento>(f->>'limite')::timestamptz
        AND CASE WHEN v_penalidad.codigo ~ '_CIERRE_INCOMPLETO$' THEN f->>'cierre_estado' IN('POR_REVISAR','FUERA_DE_PLAZO')
          ELSE f->>'entrega_tardia'='true' OR (f->>'entrega_id' IS NULL AND now()>(f->>'limite')::timestamptz) END) THEN
      RAISE EXCEPTION 'No se acredita incumplimiento del plazo de 48 horas'; END IF;
    IF v_penalidad.codigo ~ '^PAG_[A-Z_]+_(UNIFORME|INDISCIPLINA)$' THEN
      v_importe_descuento:=public.f_private_compensacion_pagos_descuento_incidente(p_id);
      v_snapshot:=v_snapshot||jsonb_build_object('importe_descuento',v_importe_descuento,'politica_descuento','PAGOS_CRONOLOGICO_V1','recalcular_en_preliquidacion',true);
    END IF;
    IF v_penalidad.codigo ~ '^PAG_[A-Z_]+_ERROR_CUADRO$' THEN
      IF NOT coalesce((v_contexto->>'es_super_admin')::boolean,false) OR nullif(btrim(p_comentario),'') IS NULL THEN
        RAISE EXCEPTION 'Cuadro de Pagos requiere revision administrativa motivada'; END IF;
      v_importe_descuento:=0;
      v_snapshot:=v_snapshot||jsonb_build_object('importe_descuento',0,'revision_admin_confirmada',true,'id_usuario_revision_admin',v_id_actor,'calculo_mensual','PAGOS_ERROR_CUADRO');
    END IF;
    IF v_penalidad.codigo ~ '^PAG_[A-Z_]+_ERROR_PAGO_CRITICO$' THEN
      IF NOT coalesce((v_contexto->>'es_super_admin')::boolean,false) OR nullif(btrim(p_comentario),'') IS NULL
        OR coalesce(v_evento.datos->>'monto_perdido','') !~ '^[0-9]+(\.[0-9]{1,2})?$'
        OR (v_evento.datos->>'monto_perdido')::numeric<=0 THEN
        RAISE EXCEPTION 'Error critico requiere perdida monetaria sustentada y revision administrativa'; END IF;
      IF coalesce((v_evento.datos->>'cuotas')::integer,1)<>1 THEN
        RAISE EXCEPTION 'El fraccionamiento requiere plan de ajustes mensual autorizado, no un descuento total automatico'; END IF;
      v_importe_descuento:=greatest(v_penalidad.monto_referencia,(v_evento.datos->>'monto_perdido')::numeric);
      v_snapshot:=v_snapshot||jsonb_build_object('importe_descuento',v_importe_descuento,'monto_perdido',(v_evento.datos->>'monto_perdido')::numeric,'base_calculo','MONTO_PERDIDO','revision_admin_confirmada',true);
    END IF;
    IF v_penalidad.codigo IN('MKT_UNIFORME','MKT_INDISCIPLINA') THEN
      PERFORM public.f_private_compensacion_pagos_periodo_editable(v_evento.id_colaborador_responsable,v_evento.periodo_imputacion);
      v_importe_descuento:=public.f_private_compensacion_marketing_descuento_incidente(p_id);
      v_snapshot:=v_snapshot||jsonb_build_object('importe_descuento',v_importe_descuento,'politica_descuento','MARKETING_CRONOLOGICO_V1','recalcular_en_preliquidacion',true);
    END IF;
    IF v_penalidad.codigo IN('ATC_ERROR_DATOS','ATC_ABANDONO_CHAT') AND EXISTS(SELECT 1 FROM public.tb_compensacion_evento x
      WHERE x.datos->>'flujo'='MARKETING_CAPTURA_V1' AND x.estado_evento IN('APROBADO','LIQUIDADO') AND x.id_colaborador_responsable=v_evento.id_colaborador_responsable
        AND x.datos#>>'{revision_marketing,codigo_penalidad}'=v_penalidad.codigo
        AND (x.fecha_evento AT TIME ZONE 'America/Lima')::date=(v_evento.fecha_evento AT TIME ZONE 'America/Lima')::date
        AND lower(btrim(x.datos#>>'{captura,conversacion}'))=lower(btrim(coalesce(v_evento.datos->>'conversacion',v_evento.datos->>'pancake_conversacion_id',v_evento.datos#>>'{captura,conversacion}',v_evento.datos#>>'{operacion,conversacion}')))) THEN
      PERFORM public.f_private_compensacion_pagos_periodo_editable(v_evento.id_colaborador_responsable,v_evento.periodo_imputacion);
    END IF;
    IF v_penalidad.codigo IN('ATC_UNIFORME','ATC_INDISCIPLINA') THEN
      v_importe_descuento:=public.f_private_compensacion_atc_descuento_incidente(p_id);
      v_snapshot:=v_snapshot||jsonb_build_object('importe_descuento',v_importe_descuento,'politica_descuento','ATC_CRONOLOGICO_V1','recalcular_en_preliquidacion',true);
    END IF;
    IF v_penalidad.codigo IN('FAC_UNIFORME','FAC_INDISCIPLINA') THEN
      v_importe_descuento:=public.f_private_compensacion_facturacion_descuento_incidente(p_id);
      v_snapshot:=v_snapshot||jsonb_build_object('importe_descuento',v_importe_descuento,
        'politica_descuento','FACTURACION_CRONOLOGICO_V1','recalcular_en_preliquidacion',true);
    END IF;

    IF v_excepcion THEN
      v_snapshot := v_snapshot || jsonb_build_object('excepcion_independencia','QUEJA_TARDIA_ADMIN','id_usuario_registra',v_evento.id_usuario_registra);
    END IF;

    UPDATE public.tb_compensacion_evento
    SET estado_evento = 'APROBADO',
        base_calculo = 1,
        cantidad = 1,
        tarifa_aplicada = v_importe_descuento,
        importe_aprobado = v_importe_descuento,
        criterios_validacion_snapshot = v_snapshot,
        fecha_actualizacion = now()
    WHERE id = p_id;
  ELSE
    v_snapshot := jsonb_build_object(
      'estado_anterior', 'PENDIENTE',
      'motivo', TRIM(p_comentario),
      'fecha_decision', now()
    );

    UPDATE public.tb_compensacion_evento
    SET estado_evento = 'RECHAZADO', fecha_actualizacion = now()
    WHERE id = p_id;
  END IF;

  IF v_excepcion THEN
    v_snapshot := v_snapshot || jsonb_build_object('excepcion_independencia','QUEJA_TARDIA_ADMIN','id_usuario_registra',v_evento.id_usuario_registra);
  END IF;

  SELECT COALESCE(MAX(numero_paso), 0) + 1 INTO v_paso
  FROM public.tb_compensacion_evento_revision WHERE id_evento = p_id;

  INSERT INTO public.tb_compensacion_evento_revision (
    id_evento, numero_paso, etapa, decision, comentario,
    id_usuario_revisor, datos_decision
  ) VALUES (
    p_id, v_paso, 'DECISION_SEDE', v_decision,
    NULLIF(TRIM(p_comentario), ''), v_id_actor, v_snapshot
  );

  RETURN jsonb_build_object(
    'id', p_id,
    'estado_evento', v_decision,
    'importe_descuento', CASE
      WHEN v_decision = 'APROBADO' THEN v_importe_descuento ELSE NULL
    END,
    'importe_bono_reportante', CASE
      WHEN v_decision = 'APROBADO' THEN COALESCE((v_snapshot->>'importe_bono_reportante')::numeric,0)
      ELSE NULL
    END,
    'mensaje', CASE
      WHEN v_decision = 'APROBADO' THEN 'Incidencia aprobada con efectos congelados'
      ELSE 'Incidencia rechazada'
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_meta_sede(p_id_plan_version bigint, p_id_sucursal bigint, p_codigo_indicador character varying, p_periodo date, p_valor_meta numeric, p_unidad character varying DEFAULT 'MONTO'::character varying, p_configuracion jsonb DEFAULT '{}'::jsonb, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_id_estado bigint;
  v_id bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF p_periodo IS NULL OR p_periodo <> date_trunc('month', p_periodo)::date THEN
    RAISE EXCEPTION 'El periodo debe ser el primer dia del mes';
  END IF;

  IF NULLIF(TRIM(p_codigo_indicador), '') IS NULL THEN
    RAISE EXCEPTION 'El codigo del indicador es obligatorio';
  END IF;

  IF p_valor_meta IS NULL OR p_valor_meta < 0 THEN
    RAISE EXCEPTION 'El valor de la meta debe ser mayor o igual a cero';
  END IF;

  PERFORM 1 FROM public.tb_compensacion_periodo
  WHERE periodo = p_periodo FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.tb_compensacion_periodo
    WHERE periodo = p_periodo AND estado_periodo IN ('APROBADO','CERRADO')) THEN
    RAISE EXCEPTION 'No se pueden cambiar metas de un mes aprobado o cerrado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_plan_version
    WHERE id = p_id_plan_version
      AND estado_version = 'BORRADOR'
  ) THEN
    RAISE EXCEPTION 'Las metas solo se pueden agregar a versiones en borrador';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tb_sucursal WHERE id = p_id_sucursal) THEN
    RAISE EXCEPTION 'La sucursal seleccionada no existe';
  END IF;

  SELECT COALESCE(
    p_id_estado,
    (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' ORDER BY id LIMIT 1)
  ) INTO v_id_estado;

  IF v_id_estado IS NULL THEN
    RAISE EXCEPTION 'No existe un estado ACTIVO para registrar la meta';
  END IF;

  INSERT INTO public.tb_compensacion_meta_sede (
    id_plan_version,
    id_sucursal,
    codigo_indicador,
    periodo,
    valor_meta,
    unidad,
    configuracion,
    id_estado,
    id_usuario
  ) VALUES (
    p_id_plan_version,
    p_id_sucursal,
    UPPER(TRIM(p_codigo_indicador)),
    p_periodo,
    p_valor_meta,
    UPPER(TRIM(COALESCE(p_unidad, 'MONTO'))),
    COALESCE(p_configuracion, '{}'::jsonb),
    v_id_estado,
    v_id_actor
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT to_jsonb(m)
    FROM public.tb_compensacion_meta_sede m
    WHERE m.id = v_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe esa meta para la version, sede, indicador y periodo';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_penalidad_tipo(p_id_plan_version bigint, p_codigo character varying, p_nombre character varying, p_id_concepto_descuento bigint, p_monto_referencia numeric, p_descripcion text DEFAULT NULL::text, p_id_cargo bigint DEFAULT NULL::bigint, p_id_concepto_bono_reportante bigint DEFAULT NULL::bigint, p_monto_bono_reportante numeric DEFAULT NULL::numeric, p_requiere_respuesta boolean DEFAULT true, p_configuracion jsonb DEFAULT '{}'::jsonb, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_id_estado bigint;
  v_id bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF NULLIF(TRIM(p_codigo), '') IS NULL OR NULLIF(TRIM(p_nombre), '') IS NULL THEN
    RAISE EXCEPTION 'Codigo y nombre son obligatorios';
  END IF;

  IF p_monto_referencia IS NULL OR p_monto_referencia < 0 THEN
    RAISE EXCEPTION 'El monto de referencia debe ser mayor o igual a cero';
  END IF;

  IF p_monto_bono_reportante IS NOT NULL AND p_monto_bono_reportante < 0 THEN
    RAISE EXCEPTION 'El bono del reportante no puede ser negativo';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_plan_version
    WHERE id = p_id_plan_version
      AND estado_version = 'BORRADOR'
  ) THEN
    RAISE EXCEPTION 'Las penalidades solo se pueden agregar a versiones en borrador';
  END IF;

  IF p_id_cargo IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tb_compensacion_cargo WHERE id = p_id_cargo) THEN
    RAISE EXCEPTION 'El cargo seleccionado no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_concepto
    WHERE id = p_id_concepto_descuento
      AND naturaleza = 'DESCUENTO'
  ) THEN
    RAISE EXCEPTION 'El concepto de penalidad debe tener naturaleza DESCUENTO';
  END IF;

  IF p_id_concepto_bono_reportante IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_concepto
    WHERE id = p_id_concepto_bono_reportante
      AND naturaleza = 'INGRESO'
  ) THEN
    RAISE EXCEPTION 'El concepto de bono del reportante debe tener naturaleza INGRESO';
  END IF;

  IF (p_monto_bono_reportante IS NULL)
     <> (p_id_concepto_bono_reportante IS NULL) THEN
    RAISE EXCEPTION 'El concepto y el monto del bono del reportante deben informarse juntos';
  END IF;

  SELECT COALESCE(
    p_id_estado,
    (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' ORDER BY id LIMIT 1)
  ) INTO v_id_estado;

  IF v_id_estado IS NULL THEN
    RAISE EXCEPTION 'No existe un estado ACTIVO para registrar la penalidad';
  END IF;

  INSERT INTO public.tb_compensacion_penalidad_tipo (
    id_plan_version,
    codigo,
    nombre,
    descripcion,
    id_cargo,
    id_concepto_descuento,
    id_concepto_bono_reportante,
    monto_referencia,
    monto_bono_reportante,
    requiere_respuesta,
    configuracion,
    id_estado,
    id_usuario
  ) VALUES (
    p_id_plan_version,
    UPPER(TRIM(p_codigo)),
    TRIM(p_nombre),
    NULLIF(TRIM(p_descripcion), ''),
    p_id_cargo,
    p_id_concepto_descuento,
    p_id_concepto_bono_reportante,
    p_monto_referencia,
    p_monto_bono_reportante,
    COALESCE(p_requiere_respuesta, true),
    COALESCE(p_configuracion, '{}'::jsonb),
    v_id_estado,
    v_id_actor
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT to_jsonb(t)
    FROM public.tb_compensacion_penalidad_tipo t
    WHERE t.id = v_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe una penalidad con ese codigo en la version';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_periodo_abrir(p_periodo date, p_nombre character varying DEFAULT NULL::character varying, p_zona_horaria character varying DEFAULT 'America/Lima'::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_periodo date;
  v_fecha_fin date;
  v_nombre character varying;
  v_zona_horaria character varying;
  v_id bigint;
  v_creado boolean := false;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'REGISTRAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF (v_contexto ->> 'alcance') <> 'GLOBAL' THEN
    RAISE EXCEPTION 'La apertura de periodos requiere alcance GLOBAL';
  END IF;

  IF p_periodo IS NULL THEN
    RAISE EXCEPTION 'El mes del periodo es obligatorio';
  END IF;

  v_periodo := date_trunc('month', p_periodo)::date;
  v_fecha_fin := (v_periodo + INTERVAL '1 month - 1 day')::date;
  v_zona_horaria := COALESCE(
    NULLIF(TRIM(p_zona_horaria), ''),
    'America/Lima'
  );
  v_nombre := COALESCE(
    NULLIF(TRIM(p_nombre), ''),
    to_char(v_periodo, 'TMMonth YYYY')
  );

  IF NOT EXISTS (
    SELECT 1
    FROM pg_timezone_names
    WHERE name = v_zona_horaria
  ) THEN
    RAISE EXCEPTION 'La zona horaria indicada no existe: %', v_zona_horaria;
  END IF;

  INSERT INTO public.tb_compensacion_periodo (
    periodo,
    nombre,
    fecha_inicio,
    fecha_fin,
    zona_horaria,
    estado_periodo,
    numero_calculo,
    id_usuario_abre,
    id_usuario_actualiza
  ) VALUES (
    v_periodo,
    v_nombre,
    v_periodo,
    v_fecha_fin,
    v_zona_horaria,
    'ABIERTO',
    0,
    v_id_actor,
    v_id_actor
  )
  ON CONFLICT (periodo) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    v_creado := true;
  ELSE
    SELECT id INTO v_id
    FROM public.tb_compensacion_periodo
    WHERE periodo = v_periodo;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'id', pe.id,
      'periodo', pe.periodo,
      'nombre', pe.nombre,
      'fecha_inicio', pe.fecha_inicio,
      'fecha_fin', pe.fecha_fin,
      'zona_horaria', pe.zona_horaria,
      'estado_periodo', pe.estado_periodo,
      'numero_calculo', pe.numero_calculo,
      'creado', v_creado,
      'mensaje', CASE
        WHEN v_creado THEN 'Periodo abierto correctamente'
        ELSE 'El periodo ya se encontraba registrado'
      END
    )
    FROM public.tb_compensacion_periodo pe
    WHERE pe.id = v_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_plan(p_codigo character varying, p_nombre character varying, p_descripcion text DEFAULT NULL::text, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_id_estado bigint;
  v_id bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF NULLIF(TRIM(p_codigo), '') IS NULL OR NULLIF(TRIM(p_nombre), '') IS NULL THEN
    RAISE EXCEPTION 'Codigo y nombre son obligatorios';
  END IF;

  SELECT COALESCE(
    p_id_estado,
    (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' ORDER BY id LIMIT 1)
  ) INTO v_id_estado;

  IF v_id_estado IS NULL THEN
    RAISE EXCEPTION 'No existe un estado ACTIVO para registrar el plan';
  END IF;

  INSERT INTO public.tb_compensacion_plan (
    codigo, nombre, descripcion, id_estado, id_usuario
  ) VALUES (
    UPPER(TRIM(p_codigo)),
    TRIM(p_nombre),
    NULLIF(TRIM(p_descripcion), ''),
    v_id_estado,
    v_id_actor
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT to_jsonb(p)
    FROM public.tb_compensacion_plan p
    WHERE p.id = v_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe un plan con ese codigo';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_plan_version(p_id_plan bigint, p_fecha_inicio date, p_fecha_fin date DEFAULT NULL::date, p_nombre character varying DEFAULT NULL::character varying, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_numero_version integer;
  v_id bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF p_fecha_inicio IS NULL THEN
    RAISE EXCEPTION 'La fecha de inicio es obligatoria';
  END IF;

  IF p_fecha_fin IS NOT NULL AND p_fecha_fin < p_fecha_inicio THEN
    RAISE EXCEPTION 'La fecha fin no puede ser anterior a la fecha de inicio';
  END IF;

  PERFORM 1
  FROM public.tb_compensacion_plan
  WHERE id = p_id_plan
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El plan no existe';
  END IF;

  SELECT COALESCE(MAX(numero_version), 0) + 1
  INTO v_numero_version
  FROM public.tb_compensacion_plan_version
  WHERE id_plan = p_id_plan;

  INSERT INTO public.tb_compensacion_plan_version (
    id_plan,
    numero_version,
    nombre,
    fecha_inicio,
    fecha_fin,
    estado_version,
    observacion,
    id_usuario
  ) VALUES (
    p_id_plan,
    v_numero_version,
    NULLIF(TRIM(p_nombre), ''),
    p_fecha_inicio,
    p_fecha_fin,
    'BORRADOR',
    NULLIF(TRIM(p_observacion), ''),
    v_id_actor
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT to_jsonb(pv)
    FROM public.tb_compensacion_plan_version pv
    WHERE pv.id = v_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_plan_version_publicar(p_id bigint, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_actual public.tb_compensacion_plan_version%ROWTYPE;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  SELECT * INTO v_actual
  FROM public.tb_compensacion_plan_version
  WHERE id = p_id
  FOR UPDATE;

  IF v_actual.id IS NULL THEN
    RAISE EXCEPTION 'La version del plan no existe';
  END IF;

  IF v_actual.estado_version <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se puede publicar una version en borrador';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_regla r
    JOIN public.tb_estado e ON e.id = r.id_estado
    WHERE r.id_plan_version = p_id
      AND UPPER(e.nombre) = 'ACTIVO'
  ) THEN
    RAISE EXCEPTION 'La version debe contener al menos una regla activa';
  END IF;

  -- Serializa publicaciones del mismo plan. Sin este bloqueo, dos borradores
  -- concurrentes podrian superar la validacion de solapamiento a la vez.
  PERFORM 1
  FROM public.tb_compensacion_plan
  WHERE id = v_actual.id_plan
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.tb_compensacion_plan_version otra
    WHERE otra.id_plan = v_actual.id_plan
      AND otra.id <> v_actual.id
      AND otra.estado_version = 'PUBLICADA'
      AND daterange(
        otra.fecha_inicio,
        COALESCE(otra.fecha_fin, 'infinity'::date),
        '[]'
      ) && daterange(
        v_actual.fecha_inicio,
        COALESCE(v_actual.fecha_fin, 'infinity'::date),
        '[]'
      )
  ) THEN
    RAISE EXCEPTION 'La vigencia se superpone con otra version publicada del plan';
  END IF;

  UPDATE public.tb_compensacion_plan_version
  SET estado_version = 'PUBLICADA',
      observacion = COALESCE(NULLIF(TRIM(p_observacion), ''), observacion),
      fecha_publicacion = now(),
      id_usuario_publica = v_id_actor,
      id_usuario = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (
    SELECT jsonb_build_object(
      'id', pv.id,
      'id_plan', pv.id_plan,
      'numero_version', pv.numero_version,
      'estado_version', pv.estado_version,
      'fecha_inicio', pv.fecha_inicio,
      'fecha_fin', pv.fecha_fin,
      'fecha_publicacion', pv.fecha_publicacion,
      'mensaje', 'Version publicada correctamente'
    )
    FROM public.tb_compensacion_plan_version pv
    WHERE pv.id = p_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_referido(p_id_tipo_evento bigint, p_id_cliente bigint, p_id_colaborador_referente bigint, p_fecha_referencia timestamp with time zone DEFAULT now(), p_observacion text DEFAULT NULL::text, p_evidencia jsonb DEFAULT '[]'::jsonb, p_clave_origen character varying DEFAULT NULL::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_tipo public.tb_compensacion_evento_tipo%ROWTYPE;
  v_cliente public.tb_cliente%ROWTYPE;
  v_evento jsonb;
  v_id_evento bigint;
  v_id bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('REFERIDOS', 'REGISTRAR');
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;
  p_fecha_referencia:=now(); -- El plazo nace al registrar, no de una fecha elegida por el cliente.

  SELECT t.* INTO v_tipo
  FROM public.tb_compensacion_evento_tipo t
  JOIN public.tb_estado es ON es.id = t.id_estado
  WHERE t.id = p_id_tipo_evento
    AND t.categoria = 'REFERIDO'
    AND UPPER(es.nombre) = 'ACTIVO';

  IF v_tipo.id IS NULL THEN
    RAISE EXCEPTION 'El tipo de evento de referido no existe o esta inactivo';
  END IF;

  SELECT * INTO v_cliente
  FROM public.tb_cliente
  WHERE id = p_id_cliente;

  IF v_cliente.id IS NULL THEN
    RAISE EXCEPTION 'El cliente referido no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_colaborador
    WHERE id = p_id_colaborador_referente
  ) THEN
    RAISE EXCEPTION 'El colaborador referente no existe';
  END IF;

  v_evento := public.f_post_tb_compensacion_evento(
    p_id_tipo_evento => p_id_tipo_evento,
    p_fecha_evento => COALESCE(p_fecha_referencia, now()),
    p_id_colaborador_beneficiario => p_id_colaborador_referente,
    p_periodo_imputacion => date_trunc(
      'month', COALESCE(p_fecha_referencia, now())
    )::date,
    p_fuente => 'CLIENTE',
    p_clave_origen => p_clave_origen,
    p_titulo => 'Referido: ' || COALESCE(v_cliente.nombre, v_cliente.numero_documento),
    p_descripcion => p_observacion,
    p_datos => jsonb_build_object(
      'flujo_referido','MATCH_7_DIAS_V2',
      'id_cliente', v_cliente.id,
      'tipo_documento', v_cliente.tipo_documento,
      'numero_documento', v_cliente.numero_documento,
      'nombre', v_cliente.nombre
    ),
    p_evidencia => COALESCE(p_evidencia, '[]'::jsonb),
    p_referencias => jsonb_build_array(
      jsonb_build_object(
        'tipo_referencia', 'CLIENTE',
        'id_cliente', v_cliente.id,
        'datos_snapshot', jsonb_build_object(
          'tipo_documento', v_cliente.tipo_documento,
          'numero_documento', v_cliente.numero_documento,
          'nombre', v_cliente.nombre
        )
      )
    )
  );
  v_id_evento := (v_evento ->> 'id')::bigint;

  INSERT INTO public.tb_compensacion_referido (
    id_evento, id_cliente, id_colaborador_referente,
    nombre_referido_snapshot, documento_referido_snapshot,
    fecha_referencia, estado_referido, observacion, id_usuario
  ) VALUES (
    v_id_evento, v_cliente.id, p_id_colaborador_referente,
    COALESCE(NULLIF(TRIM(v_cliente.nombre), ''), v_cliente.numero_documento),
    v_cliente.numero_documento, COALESCE(p_fecha_referencia, now()),
    'PENDIENTE', NULLIF(TRIM(p_observacion), ''), v_id_actor
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'id_evento', v_id_evento,
    'estado_referido', 'PENDIENTE',
    'estado_evento', 'BORRADOR',
    'mensaje', 'Referido registrado como borrador'
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'El cliente ya fue atribuido a un referente o la clave de origen esta duplicada';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_referido_anular(p_id bigint, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_referido public.tb_compensacion_referido%ROWTYPE;
  v_resultado jsonb;
BEGIN
  SELECT * INTO v_referido
  FROM public.tb_compensacion_referido
  WHERE id = p_id
  FOR UPDATE;

  IF v_referido.id IS NULL THEN
    RAISE EXCEPTION 'El referido no existe';
  END IF;

  PERFORM public.f_private_compensacion_evento_validar_alcance(
    v_referido.id_evento, 'EDITAR', false
  );

  IF v_referido.estado_referido NOT IN ('PENDIENTE', 'RECHAZADO') THEN
    RAISE EXCEPTION 'El referido validado o anulado no puede anularse por este flujo';
  END IF;

  v_resultado := public.f_post_tb_compensacion_evento_anular(
    v_referido.id_evento,
    p_motivo
  );

  UPDATE public.tb_compensacion_referido
  SET estado_referido = 'ANULADO',
      observacion = TRIM(p_motivo),
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN v_resultado || jsonb_build_object('id_referido', p_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_referido_resolver(p_id bigint, p_decision character varying, p_id_operacion bigint DEFAULT NULL::bigint, p_comentario text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_referido public.tb_compensacion_referido%ROWTYPE; v_contexto jsonb; v_resultado jsonb;
 v_periodo_original date; v_periodo_operacion date; v_fecha_operacion timestamptz;
BEGIN
  SELECT * INTO v_referido FROM public.tb_compensacion_referido WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El referido no existe'; END IF;
  SELECT periodo_imputacion INTO v_periodo_original FROM public.tb_compensacion_evento WHERE id=v_referido.id_evento;
  IF upper(btrim(p_decision))='APROBADO' THEN
    SELECT COALESCE(fecha_pagado,fecha_deposito_cliente,fecha_registro) INTO v_fecha_operacion FROM public.tb_operacion_proceso WHERE id=p_id_operacion;
    v_periodo_operacion:=date_trunc('month',v_fecha_operacion AT TIME ZONE 'America/Lima')::date;
  END IF;
  PERFORM id FROM public.tb_compensacion_periodo WHERE periodo IN (v_periodo_original,v_periodo_operacion) ORDER BY id FOR UPDATE;
  -- Orden consistente con Cierres: periodo -> evento -> referido -> operacion.
  v_contexto:=public.f_private_compensacion_evento_validar_alcance(v_referido.id_evento,
    CASE WHEN upper(btrim(p_decision))='APROBADO' THEN 'APROBAR' ELSE 'REVISAR' END,true);
  SELECT * INTO v_referido FROM public.tb_compensacion_referido WHERE id=p_id FOR UPDATE;
  IF v_referido.estado_referido<>'PENDIENTE' OR v_contexto->>'estado_evento'<>'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo se pueden resolver referidos pendientes y enviados';
  END IF;
  IF upper(btrim(p_decision))='APROBADO' THEN
    IF p_id_operacion IS NULL THEN RAISE EXCEPTION 'Debe indicar la primera operacion elegible para aprobar'; END IF;
    IF v_fecha_operacion IS NULL THEN RAISE EXCEPTION 'La operacion indicada no existe o no tiene fecha'; END IF;
    IF v_periodo_original IS DISTINCT FROM (SELECT periodo_imputacion FROM public.tb_compensacion_evento WHERE id=v_referido.id_evento) THEN RAISE EXCEPTION 'El periodo cambio. Intenta nuevamente'; END IF;
    IF EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=v_periodo_original AND estado_periodo='CERRADO') THEN RAISE EXCEPTION 'El periodo original ya se encuentra cerrado'; END IF;
    PERFORM id FROM public.tb_operacion_proceso WHERE id=p_id_operacion FOR SHARE;
    IF v_fecha_operacion IS DISTINCT FROM (SELECT COALESCE(fecha_pagado,fecha_deposito_cliente,fecha_registro) FROM public.tb_operacion_proceso WHERE id=p_id_operacion) THEN RAISE EXCEPTION 'La fecha de operacion cambio. Intenta nuevamente'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('REFERIDO:OPERACION:'||p_id_operacion,0));
    IF NOT EXISTS(SELECT 1 FROM public.f_private_compensacion_referido_coincidencias(p_id) j WHERE (j->>'id')::bigint=p_id_operacion) THEN
      RAISE EXCEPTION 'No coincide: requiere DNI, monto, banco y efectivizacion pagada al 1%% dentro de los siete dias posteriores al registro'; END IF;
    UPDATE public.tb_compensacion_evento SET datos=datos||jsonb_build_object('flujo_referido','MATCH_7_DIAS_V2') WHERE id=v_referido.id_evento;
    -- Solo pendientes: la referencia y la tarifa capturada permanecen intactas.
    UPDATE public.tb_compensacion_evento SET fecha_evento=v_fecha_operacion,periodo_imputacion=v_periodo_operacion
    WHERE id=v_referido.id_evento;
    IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia WHERE id_evento=v_referido.id_evento AND id_operacion IS NOT NULL AND id_operacion<>p_id_operacion) THEN
      RAISE EXCEPTION 'El referido ya tiene una operacion vinculada';
    END IF;
    INSERT INTO public.tb_compensacion_evento_referencia(id_evento,tipo_referencia,id_operacion,id_usuario)
    VALUES(v_referido.id_evento,'OPERACION',p_id_operacion,(v_contexto->>'id_usuario')::bigint)
    ON CONFLICT (id_evento,id_operacion) WHERE id_operacion IS NOT NULL DO NOTHING;
    v_resultado:=public.f_post_tb_compensacion_evento_resolver(v_referido.id_evento,'APROBADO',p_comentario,
      (SELECT monto_deposito_cliente FROM public.tb_operacion_proceso WHERE id=p_id_operacion),1);
  ELSE
    v_resultado:=public.f_post_tb_compensacion_evento_resolver(v_referido.id_evento,p_decision,p_comentario);
  END IF;
  RETURN v_resultado||jsonb_build_object('id_referido',p_id,'id_operacion',p_id_operacion);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_regla(p_id_plan_version bigint, p_id_concepto bigint, p_tipo_calculo character varying, p_id_cargo bigint DEFAULT NULL::bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_monto numeric DEFAULT NULL::numeric, p_porcentaje numeric DEFAULT NULL::numeric, p_valor_minimo numeric DEFAULT NULL::numeric, p_valor_maximo numeric DEFAULT NULL::numeric, p_tope_importe numeric DEFAULT NULL::numeric, p_prioridad integer DEFAULT 0, p_configuracion jsonb DEFAULT '{}'::jsonb, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_id_estado bigint;
  v_id bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_plan_version
    WHERE id = p_id_plan_version
      AND estado_version = 'BORRADOR'
  ) THEN
    RAISE EXCEPTION 'Las reglas solo se pueden agregar a versiones en borrador';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_concepto WHERE id = p_id_concepto
  ) THEN
    RAISE EXCEPTION 'El concepto seleccionado no existe';
  END IF;

  IF p_id_cargo IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tb_compensacion_cargo WHERE id = p_id_cargo) THEN
    RAISE EXCEPTION 'El cargo seleccionado no existe';
  END IF;

  IF p_id_sucursal IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tb_sucursal WHERE id = p_id_sucursal) THEN
    RAISE EXCEPTION 'La sucursal seleccionada no existe';
  END IF;

  IF NULLIF(p_configuracion ->> 'fuente_operacion', '') IS NOT NULL
     AND p_configuracion ->> 'fuente_operacion' NOT IN (
       'OPERACION_PAGADA_GESTOR',
       'CLIENTE_NUEVO_EFECTIVIZADO_7_DIAS'
     ) THEN
    RAISE EXCEPTION 'La fuente operativa de la regla no es valida';
  END IF;

  IF NULLIF(p_configuracion ->> 'fuente_operacion', '') IS NOT NULL
     AND UPPER(TRIM(p_tipo_calculo)) NOT IN ('FIJO', 'POR_UNIDAD', 'PORCENTAJE') THEN
    RAISE EXCEPTION 'Una regla operativa solo admite calculo FIJO, POR_UNIDAD o PORCENTAJE';
  END IF;

  IF NULLIF(p_configuracion ->> 'fuente_operacion', '') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.tb_compensacion_concepto c
       WHERE c.id = p_id_concepto
         AND c.categoria IN ('BONO', 'COMISION')
         AND c.naturaleza = 'INGRESO'
     ) THEN
    RAISE EXCEPTION 'Una regla operativa requiere un concepto de bono o comision de ingreso';
  END IF;

  SELECT COALESCE(
    p_id_estado,
    (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' ORDER BY id LIMIT 1)
  ) INTO v_id_estado;

  IF v_id_estado IS NULL THEN
    RAISE EXCEPTION 'No existe un estado ACTIVO para registrar la regla';
  END IF;

  PERFORM public.f_private_compensacion_validar_configuracion_asistencia(p_configuracion);

  INSERT INTO public.tb_compensacion_regla (
    id_plan_version,
    id_concepto,
    id_cargo,
    id_sucursal,
    tipo_calculo,
    monto,
    porcentaje,
    valor_minimo,
    valor_maximo,
    tope_importe,
    prioridad,
    configuracion,
    id_estado,
    id_usuario
  ) VALUES (
    p_id_plan_version,
    p_id_concepto,
    p_id_cargo,
    p_id_sucursal,
    UPPER(TRIM(p_tipo_calculo)),
    p_monto,
    p_porcentaje,
    p_valor_minimo,
    p_valor_maximo,
    p_tope_importe,
    COALESCE(p_prioridad, 0),
    COALESCE(p_configuracion, '{}'::jsonb),
    v_id_estado,
    v_id_actor
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT to_jsonb(r)
    FROM public.tb_compensacion_regla r
    WHERE r.id = v_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe una regla para esa version, concepto, cargo, sede y prioridad';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_put_compensacion_calidad_diaria(p_colaborador bigint, p_fecha date, p_mensajes integer, p_respuestas integer, p_calidad boolean, p_notas text, p_version integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; catalogo jsonb; persona jsonb; anterior public.tb_compensacion_calidad_diaria%ROWTYPE; resultado public.tb_compensacion_calidad_diaria%ROWTYPE; cambio jsonb;
BEGIN
 catalogo:=public.f_get_compensacion_calidad_diaria(p_fecha);
 ctx:=public.f_private_compensacion_contexto('BONO:META_SEDE_SAFETYPAY','CONSULTAR');
 SELECT m INTO persona FROM jsonb_array_elements(catalogo->'miembros') m WHERE (m->>'id')::bigint=p_colaborador;
 IF persona IS NULL THEN RAISE EXCEPTION 'Colaborador fuera del equipo autorizado'; END IF;
 IF p_fecha>(now() AT TIME ZONE 'America/Lima')::date OR p_mensajes IS NULL OR p_respuestas IS NULL
   OR p_mensajes NOT BETWEEN 0 AND 100000 OR p_respuestas NOT BETWEEN 0 AND 100000 OR p_calidad IS NULL
   OR coalesce(length(btrim(p_notas)),0) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Completa fecha, cantidades y sustento del control'; END IF;
 PERFORM public.f_private_compensacion_pagos_periodo_editable(p_colaborador,date_trunc('month',p_fecha)::date);
 PERFORM pg_advisory_xact_lock(hashtextextended('calidad:'||p_colaborador||':'||p_fecha,0));
 SELECT * INTO anterior FROM public.tb_compensacion_calidad_diaria WHERE id_colaborador=p_colaborador AND fecha=p_fecha FOR UPDATE;
 IF coalesce(anterior.version,0) IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'El control cambio; actualiza antes de guardar'; END IF;
 cambio:=jsonb_build_object('fecha',now(),'id_usuario',(ctx->>'id_usuario')::bigint,'anterior',to_jsonb(anterior)-'historial',
   'mensajes',p_mensajes,'respuestas',p_respuestas,'calidad',p_calidad,'notas',btrim(p_notas));
 INSERT INTO public.tb_compensacion_calidad_diaria(id_colaborador,id_sucursal,fecha,mensajes,respuestas,calidad_conforme,notas,meta_mensajes,meta_respuestas,id_usuario,historial)
 VALUES(p_colaborador,(persona->>'id_sucursal')::bigint,p_fecha,p_mensajes,p_respuestas,p_calidad,btrim(p_notas),(persona->>'meta_mensajes')::integer,(persona->>'meta_respuestas')::integer,(ctx->>'id_usuario')::bigint,jsonb_build_array(cambio))
 ON CONFLICT(id_colaborador,fecha) DO UPDATE SET mensajes=excluded.mensajes,respuestas=excluded.respuestas,calidad_conforme=excluded.calidad_conforme,notas=excluded.notas,
   id_usuario=excluded.id_usuario,actualizado_en=now(),version=anterior.version+1,historial=anterior.historial||jsonb_build_array(cambio)
 RETURNING * INTO resultado;
 RETURN to_jsonb(resultado)-'historial';
END $function$;

CREATE OR REPLACE FUNCTION public.f_put_compensacion_calificacion_comunidades(p_ids bigint[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE v_contexto jsonb; v_ids bigint[];
BEGIN
  v_contexto := public.f_private_compensacion_contexto('CONFIGURACION', 'CONFIGURAR');
  IF p_ids IS NULL OR array_position(p_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Indica la lista de comunidades elegibles';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_ids FROM unnest(p_ids) x;
  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) x
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tb_comunidad c JOIN public.tb_estado e ON e.id = c.id_estado
      WHERE c.id = x AND upper(btrim(e.nombre)) = 'ACTIVO')
  ) THEN
    RAISE EXCEPTION 'La lista incluye una comunidad inexistente o inactiva';
  END IF;
  UPDATE public.tb_compensacion_evento_tipo
  SET configuracion = configuracion || jsonb_build_object('comunidades_elegibles', to_jsonb(v_ids)),
      id_usuario = (v_contexto->>'id_usuario')::bigint, fecha_actualizacion = now()
  WHERE codigo = 'CALIFICACION_PRESENCIAL';
  IF NOT FOUND THEN RAISE EXCEPTION 'No está habilitada la calificación presencial'; END IF;
  RETURN public.f_get_compensacion_calificacion_comunidades();
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_put_compensacion_calificacion_validez(p_dni_obligatorio boolean, p_comentario_obligatorio boolean, p_asesor_obligatorio boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_contexto jsonb; v_policy jsonb;
BEGIN
  v_contexto:=public.f_private_compensacion_contexto('CONFIGURACION','CONFIGURAR');
  IF p_dni_obligatorio IS NULL OR p_comentario_obligatorio IS NULL OR p_asesor_obligatorio IS NULL THEN
    RAISE EXCEPTION 'Indica los tres requisitos de validez';
  END IF;
  v_policy:=jsonb_build_object('dni_obligatorio',p_dni_obligatorio,
    'comentario_obligatorio',p_comentario_obligatorio,'asesor_obligatorio',p_asesor_obligatorio);
  UPDATE public.tb_compensacion_evento_tipo SET configuracion=configuracion||jsonb_build_object('validez_calificacion',v_policy),
    id_usuario=(v_contexto->>'id_usuario')::bigint,fecha_actualizacion=now()
    WHERE codigo='CALIFICACION_PRESENCIAL';
  IF NOT FOUND THEN RAISE EXCEPTION 'No está habilitada la calificación presencial'; END IF;
  RETURN v_policy;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_put_compensacion_hallazgo_correccion(p_id bigint, p_estado text, p_fecha timestamp with time zone, p_antes boolean, p_corrige bigint, p_nota text, p_version integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; e public.tb_compensacion_evento%ROWTYPE; previo public.tb_compensacion_hallazgo_correccion%ROWTYPE; salida public.tb_compensacion_hallazgo_correccion%ROWTYPE;
BEGIN
 ctx:=public.f_private_compensacion_incidencia_validar_alcance(p_id,'REGISTRAR',true);
 SELECT * INTO e FROM public.tb_compensacion_evento WHERE id=p_id;
 IF e.id_usuario_registra IS DISTINCT FROM (ctx->>'id_usuario')::bigint OR e.datos->>'flujo' IS DISTINCT FROM 'CAZA_ERRORES_V1'
   OR e.estado_evento NOT IN('BORRADOR','PENDIENTE') THEN RAISE EXCEPTION 'Solo el autor puede actualizar la correccion pendiente'; END IF;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_caza_errores_vinculo v JOIN public.tb_compensacion_evento c ON c.id=v.id_evento_consecuencia WHERE v.id_evento_origen=p_id AND c.estado_evento IN('APROBADO','LIQUIDADO')) THEN RAISE EXCEPTION 'La consecuencia ya fue aprobada'; END IF;
 IF p_estado NOT IN('PENDIENTE','CORREGIDO') OR p_estado IS NULL OR coalesce(length(btrim(p_nota)),0) NOT BETWEEN 5 AND 2000 OR p_antes IS NULL THEN RAISE EXCEPTION 'Completa estado y detalle de correccion'; END IF;
 IF p_estado='CORREGIDO' AND (p_fecha IS NULL OR p_fecha<e.fecha_evento OR p_fecha>now() OR p_corrige IS NULL OR p_corrige NOT IN(e.id_colaborador_responsable,e.id_colaborador_beneficiario)) THEN RAISE EXCEPTION 'Indica quien corrigio y una fecha posterior al hallazgo, no futura'; END IF;
 SELECT * INTO previo FROM public.tb_compensacion_hallazgo_correccion WHERE id_evento=p_id FOR UPDATE;
 IF coalesce(previo.version,0) IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'La correccion cambio; actualiza antes de guardar'; END IF;
 INSERT INTO public.tb_compensacion_hallazgo_correccion(id_evento,estado,fecha_correccion,antes_escalamiento,id_colaborador_corrige,nota,id_usuario,historial)
 VALUES(p_id,p_estado,CASE WHEN p_estado='CORREGIDO' THEN p_fecha END,p_antes,CASE WHEN p_estado='CORREGIDO' THEN p_corrige END,btrim(p_nota),(ctx->>'id_usuario')::bigint,
   jsonb_build_array(jsonb_build_object('fecha',now(),'id_usuario',(ctx->>'id_usuario')::bigint,'anterior',to_jsonb(previo)-'historial','estado',p_estado,'nota',btrim(p_nota),'antes_escalamiento',p_antes,'fecha_correccion',p_fecha,'id_corrige',p_corrige)))
 ON CONFLICT(id_evento) DO UPDATE SET estado=excluded.estado,fecha_correccion=excluded.fecha_correccion,antes_escalamiento=excluded.antes_escalamiento,id_colaborador_corrige=excluded.id_colaborador_corrige,
   nota=excluded.nota,id_usuario=excluded.id_usuario,version=previo.version+1,historial=previo.historial||excluded.historial RETURNING * INTO salida;
 RETURN to_jsonb(salida)-'historial';
END $function$;

CREATE OR REPLACE FUNCTION public.f_put_tb_compensacion_acceso(p_id_usuario bigint, p_recurso character varying, p_alcance character varying, p_id_sucursal bigint DEFAULT NULL::bigint, p_puede_consultar boolean DEFAULT false, p_puede_registrar boolean DEFAULT false, p_puede_editar boolean DEFAULT false, p_puede_revisar boolean DEFAULT false, p_puede_aprobar boolean DEFAULT false, p_puede_pagar boolean DEFAULT false, p_puede_cerrar boolean DEFAULT false, p_puede_configurar boolean DEFAULT false, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_id_estado bigint;
  v_id bigint;
  v_recurso character varying := UPPER(TRIM(COALESCE(p_recurso, '')));
  v_alcance character varying := UPPER(TRIM(COALESCE(p_alcance, '')));
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONFIGURAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF NOT COALESCE((v_contexto ->> 'es_super_admin')::boolean, false)
     AND v_contexto ->> 'alcance' <> 'GLOBAL' THEN
    RAISE EXCEPTION 'Solo un acceso global puede administrar permisos de compensaciones';
  END IF;

  IF v_recurso NOT IN (
    'RESUMEN', 'COLABORADORES', 'EVIDENCIAS',
    'INCIDENCIAS', 'CONFIGURACION', 'REPORTES'
  ) THEN
    RAISE EXCEPTION 'El recurso de compensaciones no es valido';
  END IF;

  IF v_alcance NOT IN ('PROPIO', 'SEDE', 'GLOBAL') THEN
    RAISE EXCEPTION 'El alcance debe ser PROPIO, SEDE o GLOBAL';
  END IF;

  IF (v_alcance = 'SEDE' AND p_id_sucursal IS NULL)
     OR (v_alcance IN ('PROPIO', 'GLOBAL') AND p_id_sucursal IS NOT NULL) THEN
    RAISE EXCEPTION 'La sucursal informada no corresponde al alcance seleccionado';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tb_usuario WHERE id = p_id_usuario) THEN
    RAISE EXCEPTION 'El usuario seleccionado no existe';
  END IF;

  IF p_id_sucursal IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tb_sucursal WHERE id = p_id_sucursal) THEN
    RAISE EXCEPTION 'La sucursal seleccionada no existe';
  END IF;

  IF p_id_estado IS NULL THEN
    SELECT e.id INTO v_id_estado
    FROM public.tb_estado e
    WHERE UPPER(e.nombre) = 'ACTIVO'
    ORDER BY e.id
    LIMIT 1;
  ELSE
    v_id_estado := p_id_estado;
  END IF;

  IF v_id_estado IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.tb_estado WHERE id = v_id_estado) THEN
    RAISE EXCEPTION 'El estado seleccionado no existe';
  END IF;

  INSERT INTO public.tb_compensacion_acceso (
    id_usuario,
    recurso,
    alcance,
    id_sucursal,
    puede_consultar,
    puede_registrar,
    puede_editar,
    puede_revisar,
    puede_aprobar,
    puede_pagar,
    puede_cerrar,
    puede_configurar,
    id_estado,
    id_usuario_registra
  ) VALUES (
    p_id_usuario,
    v_recurso,
    v_alcance,
    p_id_sucursal,
    COALESCE(p_puede_consultar, false),
    COALESCE(p_puede_registrar, false),
    COALESCE(p_puede_editar, false),
    COALESCE(p_puede_revisar, false),
    COALESCE(p_puede_aprobar, false),
    COALESCE(p_puede_pagar, false),
    COALESCE(p_puede_cerrar, false),
    COALESCE(p_puede_configurar, false),
    v_id_estado,
    v_id_actor
  )
  ON CONFLICT (id_usuario, recurso)
  DO UPDATE SET
    alcance = EXCLUDED.alcance,
    id_sucursal = EXCLUDED.id_sucursal,
    puede_consultar = EXCLUDED.puede_consultar,
    puede_registrar = EXCLUDED.puede_registrar,
    puede_editar = EXCLUDED.puede_editar,
    puede_revisar = EXCLUDED.puede_revisar,
    puede_aprobar = EXCLUDED.puede_aprobar,
    puede_pagar = EXCLUDED.puede_pagar,
    puede_cerrar = EXCLUDED.puede_cerrar,
    puede_configurar = EXCLUDED.puede_configurar,
    id_estado = EXCLUDED.id_estado,
    id_usuario_registra = EXCLUDED.id_usuario_registra,
    fecha_actualizacion = now()
  RETURNING id INTO v_id;

  RETURN (
    SELECT jsonb_build_object(
      'id', a.id,
      'id_usuario', a.id_usuario,
      'recurso', a.recurso,
      'alcance', a.alcance,
      'id_sucursal', a.id_sucursal,
      'puede_consultar', a.puede_consultar,
      'puede_registrar', a.puede_registrar,
      'puede_editar', a.puede_editar,
      'puede_revisar', a.puede_revisar,
      'puede_aprobar', a.puede_aprobar,
      'puede_pagar', a.puede_pagar,
      'puede_cerrar', a.puede_cerrar,
      'puede_configurar', a.puede_configurar,
      'id_estado', a.id_estado,
      'fecha_actualizacion', a.fecha_actualizacion
    )
    FROM public.tb_compensacion_acceso a
    WHERE a.id = v_id
  );
END;
$function$;

-- Triggers (usan funciones de 03 y la función de historial de Core).
DROP TRIGGER IF EXISTS trg_tb_compensacion_acceso_his ON public.tb_compensacion_acceso;
CREATE TRIGGER trg_tb_compensacion_acceso_his AFTER INSERT OR UPDATE ON public.tb_compensacion_acceso FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_tb_compensacion_cargo_his ON public.tb_compensacion_cargo;
CREATE TRIGGER trg_tb_compensacion_cargo_his AFTER INSERT OR UPDATE ON public.tb_compensacion_cargo FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_tb_compensacion_colaborador_his ON public.tb_compensacion_colaborador;
CREATE TRIGGER trg_tb_compensacion_colaborador_his AFTER INSERT OR UPDATE ON public.tb_compensacion_colaborador FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_tb_compensacion_concepto_his ON public.tb_compensacion_concepto;
CREATE TRIGGER trg_tb_compensacion_concepto_his AFTER INSERT OR UPDATE ON public.tb_compensacion_concepto FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_compensacion_seguimiento ON public.tb_compensacion_periodo;
CREATE TRIGGER trg_compensacion_seguimiento AFTER INSERT OR DELETE OR UPDATE ON public.tb_compensacion_periodo FOR EACH ROW EXECUTE FUNCTION f_private_compensacion_seguimiento_evento();
DROP TRIGGER IF EXISTS trg_tb_compensacion_periodo_his ON public.tb_compensacion_periodo;
CREATE TRIGGER trg_tb_compensacion_periodo_his AFTER INSERT OR UPDATE ON public.tb_compensacion_periodo FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_tb_compensacion_plan_his ON public.tb_compensacion_plan;
CREATE TRIGGER trg_tb_compensacion_plan_his AFTER INSERT OR UPDATE ON public.tb_compensacion_plan FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_compensacion_seguimiento ON public.tb_compensacion_asignacion;
CREATE TRIGGER trg_compensacion_seguimiento AFTER INSERT OR DELETE OR UPDATE ON public.tb_compensacion_asignacion FOR EACH ROW EXECUTE FUNCTION f_private_compensacion_seguimiento_evento();
DROP TRIGGER IF EXISTS trg_tb_compensacion_asignacion_his ON public.tb_compensacion_asignacion;
CREATE TRIGGER trg_tb_compensacion_asignacion_his AFTER INSERT OR UPDATE ON public.tb_compensacion_asignacion FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_compensacion_condicion_mes_seguimiento ON public.tb_compensacion_condicion_mes;
CREATE TRIGGER trg_compensacion_condicion_mes_seguimiento AFTER INSERT OR UPDATE ON public.tb_compensacion_condicion_mes FOR EACH ROW EXECUTE FUNCTION f_private_compensacion_bonos_mes_invalidar();
DROP TRIGGER IF EXISTS trg_tb_compensacion_condicion_mes_his ON public.tb_compensacion_condicion_mes;
CREATE TRIGGER trg_tb_compensacion_condicion_mes_his AFTER INSERT OR UPDATE ON public.tb_compensacion_condicion_mes FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_compensacion_descuento_mes_seguimiento ON public.tb_compensacion_descuento_mes;
CREATE TRIGGER trg_compensacion_descuento_mes_seguimiento AFTER INSERT OR UPDATE ON public.tb_compensacion_descuento_mes FOR EACH ROW EXECUTE FUNCTION f_private_compensacion_bonos_mes_invalidar();
DROP TRIGGER IF EXISTS trg_tb_compensacion_descuento_mes_his ON public.tb_compensacion_descuento_mes;
CREATE TRIGGER trg_tb_compensacion_descuento_mes_his AFTER INSERT OR UPDATE ON public.tb_compensacion_descuento_mes FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_tb_compensacion_evento_tipo_his ON public.tb_compensacion_evento_tipo;
CREATE TRIGGER trg_tb_compensacion_evento_tipo_his AFTER INSERT OR UPDATE ON public.tb_compensacion_evento_tipo FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_tb_compensacion_excepcion_his ON public.tb_compensacion_excepcion;
CREATE TRIGGER trg_tb_compensacion_excepcion_his AFTER INSERT OR UPDATE ON public.tb_compensacion_excepcion FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_tb_compensacion_plan_version_his ON public.tb_compensacion_plan_version;
CREATE TRIGGER trg_tb_compensacion_plan_version_his AFTER INSERT OR UPDATE ON public.tb_compensacion_plan_version FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_tb_compensacion_reporte_mes_his ON public.tb_compensacion_reporte_mes;
CREATE TRIGGER trg_tb_compensacion_reporte_mes_his AFTER INSERT OR UPDATE ON public.tb_compensacion_reporte_mes FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_tb_compensacion_meta_sede_his ON public.tb_compensacion_meta_sede;
CREATE TRIGGER trg_tb_compensacion_meta_sede_his AFTER INSERT OR UPDATE ON public.tb_compensacion_meta_sede FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_tb_compensacion_penalidad_tipo_his ON public.tb_compensacion_penalidad_tipo;
CREATE TRIGGER trg_tb_compensacion_penalidad_tipo_his AFTER INSERT OR UPDATE ON public.tb_compensacion_penalidad_tipo FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_compensacion_seguimiento ON public.tb_compensacion_regla;
CREATE TRIGGER trg_compensacion_seguimiento AFTER INSERT OR DELETE OR UPDATE ON public.tb_compensacion_regla FOR EACH ROW EXECUTE FUNCTION f_private_compensacion_seguimiento_evento();
DROP TRIGGER IF EXISTS trg_tb_compensacion_regla_his ON public.tb_compensacion_regla;
CREATE TRIGGER trg_tb_compensacion_regla_his AFTER INSERT OR UPDATE ON public.tb_compensacion_regla FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_compensacion_mes_premio_79 ON public.tb_compensacion_evento;
CREATE TRIGGER trg_compensacion_mes_premio_79 BEFORE INSERT OR DELETE OR UPDATE ON public.tb_compensacion_evento FOR EACH ROW EXECUTE FUNCTION f_private_compensacion_mes_premio_guard();
DROP TRIGGER IF EXISTS trg_compensacion_seguimiento ON public.tb_compensacion_evento;
CREATE TRIGGER trg_compensacion_seguimiento AFTER INSERT OR DELETE OR UPDATE ON public.tb_compensacion_evento FOR EACH ROW EXECUTE FUNCTION f_private_compensacion_seguimiento_evento();
DROP TRIGGER IF EXISTS trg_tb_compensacion_evento_his ON public.tb_compensacion_evento;
CREATE TRIGGER trg_tb_compensacion_evento_his AFTER INSERT OR UPDATE ON public.tb_compensacion_evento FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_compensacion_seguimiento ON public.tb_compensacion_evento_referencia;
CREATE TRIGGER trg_compensacion_seguimiento AFTER INSERT OR DELETE OR UPDATE ON public.tb_compensacion_evento_referencia FOR EACH ROW EXECUTE FUNCTION f_private_compensacion_seguimiento_evento();
DROP TRIGGER IF EXISTS trg_tb_compensacion_referido_his ON public.tb_compensacion_referido;
CREATE TRIGGER trg_tb_compensacion_referido_his AFTER INSERT OR UPDATE ON public.tb_compensacion_referido FOR EACH ROW EXECUTE FUNCTION f_private_append_snapshot_his();
DROP TRIGGER IF EXISTS trg_compensacion_seguimiento ON public.tb_compensacion_referido_operacion;
CREATE TRIGGER trg_compensacion_seguimiento AFTER INSERT OR DELETE OR UPDATE ON public.tb_compensacion_referido_operacion FOR EACH ROW EXECUTE FUNCTION f_private_compensacion_seguimiento_evento();

NOTIFY pgrst, 'reload schema';
COMMIT;
