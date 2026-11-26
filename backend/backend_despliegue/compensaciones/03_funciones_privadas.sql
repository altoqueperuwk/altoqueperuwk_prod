-- 03_funciones_privadas.sql
-- Baseline de Compensaciones (22/11/2026), generado desde la base de desarrollo. 143 funciones. Funciones privadas (motor de bonos y penalidades, helpers).
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

CREATE OR REPLACE FUNCTION public.f_private_compensacion_admin_destino(p_tipo text, p_categoria text, p_es_penalidad boolean, p_penalidad text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT CASE
  WHEN p_es_penalidad THEN CASE
    WHEN coalesce(p_penalidad,'') ~ '(UNIFORME|INDISCIPLINA|QUEJA_TARDIA)$' THEN '/compensaciones/indisciplina-colaborador'
    WHEN coalesce(p_penalidad,'') ~ 'ERROR_CUADRO$' THEN '/compensaciones/penalidad-escalonada-bonos'
    WHEN coalesce(p_penalidad,'') ~ '(DESCUADRE|CIERRE_INCOMPLETO)$' THEN '/compensaciones/auditoria-cuadre-cierre'
    ELSE '/compensaciones/auditoria-operaciones' END
  WHEN p_tipo='CUADRE_PERFECTO' THEN '/compensaciones/auditoria-cuadre-cierre'
  WHEN p_tipo IN('AUDITAR_NUEVOS','REGISTRO_NUEVO_EFECTIVIZADO') THEN '/compensaciones/atenciones'
  WHEN p_tipo IN('AUDITORIA_ACTIVA','DETECCION_ERROR_PAGO','OPERACION_EXTRA','DETECCION_ERROR_MANUAL','REPORTE_ABANDONO','ALERTA_TEMPRANA')
    OR p_categoria='TARJETA_TERCERO' THEN '/compensaciones/auditoria-operaciones'
  WHEN p_categoria='LLAMADA' THEN '/compensaciones/llamadas'
  WHEN p_categoria='REFERIDO' THEN '/compensaciones/referidos'
  WHEN p_tipo IN('CALIFICACION_PRESENCIAL','REGISTRO_PRESENCIAL') THEN '/compensaciones/calificaciones'
  WHEN p_categoria IN('OTRO','CALIFICACION') THEN '/compensaciones/otros-bonos/'||lower(p_tipo)
  ELSE '/compensaciones/evidencias' END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_administracion_revision(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE actor public.tb_usuario%ROWTYPE; e public.tb_compensacion_evento%ROWTYPE; t public.tb_compensacion_evento_tipo%ROWTYPE;
 rutas text[]; destino text; fuentes jsonb; huella text; propio boolean; protegido boolean; automatico boolean; disponible boolean; permiso boolean; fuente_valida boolean:=true; motivo text:='';
BEGIN
 SELECT u.* INTO actor FROM public.tb_usuario u JOIN public.tb_estado es ON es.id=u.id_estado AND upper(btrim(es.nombre))='ACTIVO'
 WHERE u.auth_user_id=auth.uid();
 IF actor.id IS NULL OR NOT(coalesce(actor.flag_super_admin,false) OR actor.id_rol=1) THEN RAISE EXCEPTION 'Revision exclusiva de Administracion'; END IF;
 SELECT * INTO e FROM public.tb_compensacion_evento WHERE id=p_id;
 IF e.id IS NULL THEN RAISE EXCEPTION 'El expediente no existe'; END IF;
 SELECT * INTO t FROM public.tb_compensacion_evento_tipo WHERE id=e.id_tipo_evento;
 SELECT coalesce(array_agg(x),'{}'::text[]) INTO rutas FROM jsonb_array_elements_text(public.f_get_tb_navegacion_x_usuario(actor.id)->'rutas_permitidas') x;
 destino:=public.f_private_compensacion_admin_destino(t.codigo::text,t.categoria::text,e.id_penalidad_tipo IS NOT NULL,
    (SELECT coalesce(e.datos->'penalidad_tipo_snapshot'->>'codigo',pt.codigo) FROM public.tb_compensacion_penalidad_tipo pt WHERE pt.id=e.id_penalidad_tipo));
 permiso:=coalesce(actor.flag_super_admin,false) OR destino=ANY(rutas);
 IF NOT permiso AND NOT '/compensaciones/evidencias'=ANY(rutas) THEN RAISE EXCEPTION 'No tiene acceso al expediente de esta opcion'; END IF;
 -- SQL208: el cuadre manual no cuenta como expediente propio por haberlo registrado.
 propio:=(e.id_usuario_registra=actor.id AND t.codigo<>'CUADRE_PERFECTO') OR EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador WHERE id_usuario=actor.id AND id IN(e.id_colaborador_beneficiario,e.id_colaborador_responsable));
 protegido:=e.estado_evento='LIQUIDADO' OR EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=e.periodo_imputacion AND estado_periodo IN('APROBADO','CERRADO'))
  OR EXISTS(SELECT 1 FROM public.tb_compensacion_reporte_mes rm JOIN public.tb_compensacion_periodo rp ON rp.id=rm.id_periodo WHERE rp.periodo=e.periodo_imputacion AND rm.estado='CONFIRMADO');
 automatico:=coalesce(e.datos->>'flujo'='TIKTOK_CLIENTE_NUEVO_7_DIAS',false) OR t.codigo IN('BONO_PUNTUALIDAD','LIDERAZGO_SUBORDINADO','COLABORADOR_MES_ATENCIONES','COLABORADOR_MES_CALIFICACIONES')
  OR e.fuente='CLIENTE' AND t.codigo NOT IN('TIKTOK_LIVE','REFERIDO');
 disponible:=permiso AND NOT propio AND NOT protegido AND NOT automatico;
 IF NOT permiso THEN motivo:='La consulta conjunta no permite decidir sin el permiso de la opcion';
 ELSIF propio THEN motivo:='El expediente requiere otro revisor: eres autor, beneficiario o responsable';
 ELSIF protegido THEN motivo:='Periodo o sueldo consolidado; corresponde un ajuste auditado';
 ELSIF automatico THEN motivo:='Seguimiento automatico: se evalua desde sus fuentes, sin aprobacion manual';
 ELSIF e.estado_evento NOT IN('PENDIENTE','APROBADO') THEN motivo:='El estado actual no admite aprobacion'; END IF;
 IF disponible AND e.estado_evento='PENDIENTE' THEN
  BEGIN
   PERFORM public.f_private_compensacion_atc_trazabilidad_validar(p_id);
   IF t.categoria='CALIFICACION' AND NOT public.f_private_compensacion_calificacion_valida(e.datos,e.descripcion,e.id_colaborador_beneficiario,e.criterios_validacion_snapshot->'validez_calificacion') THEN
    RAISE EXCEPTION 'La calificacion no cumple estrellas o requisitos de validez'; END IF;
   IF t.categoria='CALIFICACION' AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia r
    CROSS JOIN LATERAL public.f_private_compensacion_calificacion_operacion(r.id_operacion) d
    WHERE r.id_evento=p_id AND r.tipo_referencia='OPERACION' AND d->>'dni'=e.datos->>'cliente_documento') THEN
    RAISE EXCEPTION 'Vincula Efectivizacion pagada o Pago Deuda final con comision cobrada del mismo cliente'; END IF;
   -- SQL119: elegibilidad de la comision de Jefatura y ATC (tasa general y comunidad elegible).
   IF t.codigo='CALIFICACION_PRESENCIAL' AND EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador c JOIN public.tb_usuario u ON u.id=c.id_usuario
      WHERE c.id=e.id_colaborador_beneficiario AND u.id_rol IN(3,4)) AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia r
      CROSS JOIN LATERAL public.f_private_compensacion_calificacion_operacion(r.id_operacion) d
      WHERE r.id_evento=p_id AND r.tipo_referencia='OPERACION' AND d->>'dni'=e.datos->>'cliente_documento'
        AND public.f_private_compensacion_calificacion_elegible((d->>'id')::bigint)) THEN
    RAISE EXCEPTION 'La calificacion requiere Pago Deuda final o efectivizacion general de 1%% o 2%%, sin tasa fija/preferencial y de una comunidad elegible'; END IF;
   IF e.datos->>'flujo'='MARKETING_CAPTURA_V1' THEN PERFORM public.f_private_compensacion_marketing_validar(p_id); END IF;
  EXCEPTION WHEN raise_exception THEN fuente_valida:=false;motivo:=SQLERRM;
  END;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',coalesce(o.tipo_servicio,r.tipo_referencia),'codigo',coalesce(nullif(o.codigo_operacion_deposito_cliente,''),r.identificador_externo,'Sin codigo'),
  'estado',CASE WHEN o.id IS NULL THEN 'Sin operacion enlazada' ELSE coalesce(s.valor->>'estado','Pendiente') END,'monto',o.monto_deposito_cliente) ORDER BY r.id),'[]'),
  md5(coalesce(string_agg(to_jsonb(r)::text||coalesce(to_jsonb(o)::text,'')||coalesce(s.valor::text,''),'|' ORDER BY r.id),''))
 INTO fuentes,huella FROM public.tb_compensacion_evento_referencia r LEFT JOIN public.tb_operacion_proceso o ON o.id=r.id_operacion
 LEFT JOIN LATERAL(SELECT public.f_private_compensacion_cliente_nuevo_operacion_estado(o.id) valor) s ON o.id IS NOT NULL
 WHERE r.id_evento=p_id;
 RETURN jsonb_build_object('id',e.id,'version',md5(to_jsonb(e)::text||huella),'estado',e.estado_evento,'destino',destino,
  'puede_revisar',disponible AND e.estado_evento='PENDIENTE','puede_aprobar',disponible AND fuente_valida AND (e.estado_evento='PENDIENTE' OR t.codigo='PROPUESTA_INNOVACION' AND e.estado_evento='APROBADO'),
  'puede_observar',disponible AND e.estado_evento='PENDIENTE','puede_anular',permiso AND NOT propio AND NOT protegido AND NOT automatico AND t.categoria<>'LLAMADA' AND t.codigo<>'PROPUESTA_INNOVACION' AND e.estado_evento IN('BORRADOR','PENDIENTE','RECHAZADO'),
  'bloqueado',NOT permiso OR propio OR protegido OR automatico,'permiso_decision',permiso,'protegido',protegido,'propio',propio,'motivo',motivo,'automatico',automatico,
  'requiere_implementacion',t.codigo='PROPUESTA_INNOVACION' AND NOT public.f_private_compensacion_innovacion_comprobada(p_id),'fuentes',fuentes);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_atc_descuento_incidente(p_id_evento bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  ev public.tb_compensacion_evento%ROWTYPE;
  pt public.tb_compensacion_penalidad_tipo%ROWTYPE;
  dia date;
  mes date;
  perdio boolean;
BEGIN
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id_evento;
  IF ev.id IS NULL THEN RAISE EXCEPTION 'Incidencia inexistente'; END IF;
  pt:=public.f_private_compensacion_incidencia_penalidad_registrada(p_id_evento);
  IF pt.codigo IS NULL OR pt.codigo NOT IN ('ATC_UNIFORME','ATC_INDISCIPLINA') THEN
    RAISE EXCEPTION 'El calculo cronologico solo aplica a uniforme e indisciplina de ATC';
  END IF;
  dia:=(ev.fecha_evento AT TIME ZONE 'America/Lima')::date;
  mes:=date_trunc('month',dia)::date;
  IF ev.periodo_imputacion IS DISTINCT FROM mes THEN
    RAISE EXCEPTION 'La incidencia debe imputarse al mes del hecho';
  END IF;
  IF ev.estado_evento NOT IN ('PENDIENTE','APROBADO','LIQUIDADO') THEN RETURN 0::numeric; END IF;

  -- Validar el cargo del responsable a la fecha del hecho, no el rol del actor
  -- administrativo que resuelve ni la sede actual del usuario de ATC.
  -- La ultima asignacion activa vigente debe corresponder a la penalidad registrada.
  IF NOT EXISTS (
    SELECT 1 FROM (
      SELECT a.id_cargo FROM public.tb_compensacion_asignacion a
      JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
      WHERE a.id_colaborador=ev.id_colaborador_responsable
        AND dia BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)
      ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1
    ) vigente
    JOIN public.tb_compensacion_cargo ca ON ca.id=vigente.id_cargo
    WHERE ca.codigo='ATENCION_CLIENTE' AND ca.id=pt.id_cargo
  ) THEN RAISE EXCEPTION 'La incidencia requiere cargo ATENCION_CLIENTE vigente para el responsable'; END IF;

  -- Orden cronologico (fecha_evento,id), no orden de aprobacion. El candidato
  -- puede estar PENDIENTE; los antecedentes solo APROBADO/LIQUIDADO, excluyendo self.
  -- Uniforme: una sola multa por persona/dia, incluso entre versiones de PT.
  IF pt.codigo='ATC_UNIFORME' AND EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento ant
    LEFT JOIN public.tb_compensacion_penalidad_tipo ap ON ap.id=ant.id_penalidad_tipo
    WHERE ant.id<>ev.id AND ant.id_colaborador_responsable=ev.id_colaborador_responsable
      AND ant.estado_evento IN ('APROBADO','LIQUIDADO')
      AND coalesce(ant.criterios_validacion_snapshot->>'codigo_penalidad',
        ant.datos#>>'{penalidad_tipo_snapshot,codigo}',ap.codigo)='ATC_UNIFORME'
      AND (ant.fecha_evento AT TIME ZONE 'America/Lima')::date=dia
      AND (ant.fecha_evento,ant.id)<(ev.fecha_evento,ev.id)
  ) THEN RETURN 0::numeric; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento ant
    LEFT JOIN public.tb_compensacion_penalidad_tipo ap ON ap.id=ant.id_penalidad_tipo
    WHERE ant.id<>ev.id AND ant.id_colaborador_responsable=ev.id_colaborador_responsable
      AND ant.estado_evento IN ('APROBADO','LIQUIDADO')
      AND ant.periodo_imputacion=mes
      AND (ant.fecha_evento AT TIME ZONE 'America/Lima')::date>=mes
      AND (ant.fecha_evento,ant.id)<(ev.fecha_evento,ev.id)
      AND coalesce(ant.criterios_validacion_snapshot->>'codigo_penalidad',
        ant.datos#>>'{penalidad_tipo_snapshot,codigo}',ap.codigo)
          IN ('ATC_UNIFORME','ATC_INDISCIPLINA')
  ) OR EXISTS (
    -- La puntualidad la confirma el administrador en Bonos del mes (tb_compensacion_condicion_mes).
    SELECT 1 FROM public.tb_compensacion_condicion_mes cm
    JOIN public.tb_compensacion_periodo cp ON cp.id=cm.id_periodo AND cp.periodo=mes
    WHERE cm.id_colaborador=ev.id_colaborador_responsable AND cm.codigo_condicion='PUNTUALIDAD' AND NOT cm.cumple
  ) INTO perdio;
  -- Importe de la PT registrada (snapshot), nunca una tarifa fija nueva.
  RETURN CASE WHEN perdio THEN pt.monto_referencia ELSE 0::numeric END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_atc_fraude_digital(p_id_periodo bigint, p_colaborador bigint, p_base_comisiones numeric)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT public.f_private_compensacion_descuento_mes_lineas(p_id_periodo, p_colaborador, p_base_comisiones, 'TOLERANCIA_CERO_DIGITAL');
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_atc_ruta_permitida(p_ruta text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((p_ruta NOT LIKE '/compensaciones/%' AND p_ruta<>'/compensaciones')
    OR p_ruta = ANY(ARRAY[
    '/compensaciones/resumen','/compensaciones/calificaciones','/compensaciones/mis-bonos-descuentos',
    '/compensaciones/referidos','/compensaciones/auditoria-operaciones','/compensaciones/indisciplina-colaborador',
    '/compensaciones/llamadas','/compensaciones/tarjetas-erroneas','/compensaciones/atenciones',
    '/compensaciones/otros-bonos/propuesta_innovacion','/compensaciones/otros-bonos/tiktok_live'
  ]::text[]), false);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_atc_safetypay_filas(p_mes date)
 RETURNS TABLE(id bigint, cliente text, documento text, codigo_cliente text, tarjeta text, banco text, codigo text, monto numeric, operacion text, colaborador text, fecha timestamp with time zone, estado text, duplicado boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; asignacion public.tb_compensacion_asignacion%ROWTYPE;
  inicio date:=date_trunc('month',p_mes)::date; fin date:=(date_trunc('month',p_mes)+interval '1 month')::date;
BEGIN
  IF p_mes IS NULL THEN RAISE EXCEPTION 'Selecciona un mes'; END IF;
  ctx:=public.f_private_compensacion_safetypay_panel_contexto();
  SELECT a.* INTO asignacion FROM public.tb_compensacion_asignacion a
    JOIN public.tb_estado e ON e.id=a.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE a.id_colaborador=(ctx->>'id_colaborador')::bigint AND (ctx->>'alcance'<>'SEDE' OR a.id_sucursal=(ctx->>'id_sucursal_alcance')::bigint) AND a.fecha_inicio<fin
      AND (a.fecha_fin IS NULL OR a.fecha_fin>=fin-1)
    ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1;
  IF ctx->>'alcance'<>'GLOBAL' AND asignacion.id IS NULL THEN RETURN; END IF;
  -- Los codigos viven en el pre-registro de Compensaciones; su estado sigue a la operacion de Operaciones.
  RETURN QUERY WITH base AS (
    SELECT public.f_private_compensacion_equipo_visible(ctx,c.id,(r.fecha_deposito AT TIME ZONE 'America/Lima')::date) visible_equipo,
      r.id,coalesce(cl.nombre,'')::text cliente,r.documento::text documento,r.codigo_cliente::text codigo_cliente,
      -- Solo last4 se propaga al CTE: busqueda, orden y JSON nunca usan el PAN.
      nullif(right(regexp_replace(coalesce(r.tarjeta,''),'[^0-9]','','g'),4),'')::text tarjeta,
      coalesce(nullif(r.banco,''),'Sin banco')::text banco,
      coalesce(r.nombre_comunidad,'Sin codigo')::text codigo,r.monto,
      r.codigo_operacion::text operacion,
      coalesce(c.nombre_completo,u.nombre,'Sin colaborador')::text colaborador,
      r.fecha_deposito fecha,r.estado::text estado
    FROM public.tb_compensacion_safetypay_registro r
    JOIN public.tb_usuario u ON u.id=r.id_usuario
    JOIN public.tb_compensacion_colaborador c ON c.id_usuario=r.id_usuario
    JOIN LATERAL (
      SELECT ax.id_sucursal,ax.id_plan FROM public.tb_compensacion_asignacion ax
      JOIN public.tb_estado ex ON ex.id=ax.id_estado AND upper(btrim(ex.nombre))='ACTIVO'
      WHERE ax.id_colaborador=c.id
        AND ax.fecha_inicio<=(r.fecha_deposito AT TIME ZONE 'America/Lima')::date
        AND (ax.fecha_fin IS NULL OR ax.fecha_fin>=(r.fecha_deposito AT TIME ZONE 'America/Lima')::date)
      ORDER BY ax.fecha_inicio DESC,ax.id DESC LIMIT 1
    ) sede ON (ctx->>'alcance'='GLOBAL' OR sede.id_sucursal=asignacion.id_sucursal)
    LEFT JOIN LATERAL (SELECT k.nombre FROM public.tb_cliente k WHERE k.tipo_documento=r.tipo_documento AND k.numero_documento=r.documento ORDER BY k.id LIMIT 1) cl ON true
    WHERE (ctx->>'alcance'<>'PROPIO' OR r.id_usuario=(ctx->>'id_usuario')::bigint)
      AND (r.fecha_deposito AT TIME ZONE 'America/Lima')::date>=inicio
      AND (r.fecha_deposito AT TIME ZONE 'America/Lima')::date<fin
  ) SELECT b.id,b.cliente,b.documento,b.codigo_cliente,b.tarjeta,b.banco,b.codigo,b.monto,b.operacion,b.colaborador,b.fecha,b.estado,b.duplicado
  FROM (SELECT base.*,base.codigo_cliente IS NOT NULL AND count(*) OVER(PARTITION BY base.banco,base.codigo_cliente)>1 duplicado FROM base) b
  WHERE b.visible_equipo;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_atc_trazabilidad_validar(p_id_evento bigint)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ev public.tb_compensacion_evento%ROWTYPE; tipo public.tb_compensacion_evento_tipo%ROWTYPE; dni text;
BEGIN
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id_evento;
  SELECT * INTO tipo FROM public.tb_compensacion_evento_tipo WHERE id=ev.id_tipo_evento;
  IF tipo.categoria IN('LLAMADA','TARJETA_TERCERO') THEN
    IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia r
      LEFT JOIN public.tb_operacion_proceso o ON o.id=r.id_operacion
      WHERE r.id_evento=ev.id AND r.tipo_referencia='OPERACION' AND
        (o.id IS NULL OR btrim(o.dni_cliente) IS DISTINCT FROM ev.datos->>'cliente_documento'
         OR EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada x WHERE x.id_operacion_proceso=o.id))) THEN
      RAISE EXCEPTION 'La operacion vinculada no esta disponible o no corresponde al cliente'; END IF;
    RETURN;
  END IF;
  IF (tipo.categoria NOT IN('TARJETA_TERCERO','CALIFICACION','REFERIDO') AND tipo.codigo<>'TIKTOK_LIVE')
    OR NOT EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador c JOIN public.tb_usuario u ON u.id=c.id_usuario WHERE c.id=ev.id_colaborador_beneficiario AND u.id_rol=4)
    THEN RETURN; END IF;
  dni:=coalesce(nullif(ev.datos->>'cliente_documento',''),nullif(ev.datos->>'numero_documento',''),
    (SELECT identificador_externo FROM public.tb_compensacion_evento_referencia WHERE id_evento=ev.id AND tipo_referencia='CLIENTE' ORDER BY id LIMIT 1));
  IF dni IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.tb_compensacion_evento_referencia r
    CROSS JOIN LATERAL public.f_private_compensacion_atencion_operacion(r.id_operacion) d
    WHERE r.id_evento=ev.id AND r.tipo_referencia='OPERACION' AND (d->>'pagada')::boolean AND d->>'dni'=dni)
    THEN RAISE EXCEPTION 'Vincula una operacion pagada del cliente antes de aprobar el bono'; END IF;
  IF tipo.categoria='REFERIDO' AND ev.datos->>'flujo_referido'='MATCH_7_DIAS_V2' THEN
    IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_referido rr
      CROSS JOIN LATERAL public.f_private_compensacion_referido_coincidencias(rr.id) j
      JOIN public.tb_compensacion_evento_referencia er ON er.id_operacion=(j->>'id')::bigint AND er.id_evento=ev.id
      WHERE rr.id_evento=ev.id) THEN RAISE EXCEPTION 'El referido no coincide con su efectivizacion dentro de siete dias'; END IF;
    RETURN;
  END IF;
  IF tipo.categoria<>'CALIFICACION' AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia WHERE id_evento=ev.id AND tipo_referencia='PANCAKE' AND identificador_externo ~ '^https://[^[:space:]]+$')
    THEN RAISE EXCEPTION 'Vincula la conversacion de Pancake antes de aprobar el bono'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_atencion_contexto()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE u public.tb_usuario%ROWTYPE; admin boolean;
BEGIN
  SELECT x.* INTO u FROM public.tb_usuario x JOIN public.tb_estado e ON e.id=x.id_estado
    WHERE x.auth_user_id=auth.uid() AND upper(btrim(e.nombre))='ACTIVO';
  IF u.id IS NULL THEN RAISE EXCEPTION 'Sesion operativa requerida'; END IF;
  admin:=coalesce(u.flag_super_admin,false) OR coalesce(u.id_rol=1,false);
  IF NOT admin AND (u.id_rol NOT IN(2,3,4) OR NOT EXISTS (
    SELECT 1 FROM public.tb_permiso_usuario pu JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
    JOIN public.tb_estado ep ON ep.id=pu.id_estado JOIN public.tb_estado em ON em.id=pm.id_estado
    WHERE pu.id_usuario=u.id AND pm.ruta='/compensaciones/atenciones'
      AND upper(btrim(ep.nombre))='ACTIVO' AND upper(btrim(em.nombre))='ACTIVO'
  )) THEN RAISE EXCEPTION 'Sin acceso a Atenciones en Sistema'; END IF;
  IF NOT admin AND u.id_rol=3 AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador c
    JOIN public.tb_compensacion_asignacion a ON a.id_colaborador=c.id
    JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='JEFE_TIENDA'
    JOIN public.tb_estado e ON e.id=a.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE c.id_usuario=u.id AND a.id_sucursal=u.id_sucursal AND a.fecha_inicio<=(now() AT TIME ZONE 'America/Lima')::date
      AND (a.fecha_fin IS NULL OR a.fecha_fin>=(now() AT TIME ZONE 'America/Lima')::date)) THEN
    RAISE EXCEPTION 'Jefatura requiere una asignacion laboral vigente en su sede'; END IF;
  IF NOT admin AND u.id_rol=2 THEN
    PERFORM public.f_private_compensacion_pagos_perfil((SELECT id FROM public.tb_compensacion_colaborador WHERE id_usuario=u.id));
  END IF;
  RETURN jsonb_build_object('id_usuario',u.id,'es_admin',admin,'puede_registrar',NOT admin AND u.id_rol IN(2,3,4));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_atencion_operacion(p_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('id',op.id,'raiz',raiz.id,
    'asesor',COALESCE(raiz.id_usuario_solicitud,raiz.id_usuario),
    'codigo',coalesce(nullif(btrim(op.codigo_operacion_deposito_cliente),''),raiz.codigo_operacion_deposito_cliente),
    'cliente',coalesce(nullif(btrim(op.nombre_cliente),''),raiz.nombre_cliente),
    'dni',coalesce(nullif(btrim(op.dni_cliente),''),btrim(raiz.dni_cliente)),
    'servicio',op.tipo_servicio,'monto',op.monto_deposito_cliente,
    -- La fecha del archivo original determina el mes de la atencion, no su pago.
    'fecha',COALESCE(raiz.fecha_deposito_cliente,op.fecha_deposito_cliente),
    'fuente_fecha','FECHA_DEPOSITO_CLIENTE_V1',
    'pagada',upper(btrim(coalesce(op.nombre_estado,'')))='PAGADO'
      AND upper(regexp_replace(btrim(op.tipo_servicio),'[^a-zA-Z0-9]+','_','g')) IN('EFECTIVIZACION','POS','LINKPAGO','LINK_PAGO','PAGO_DEUDA','PAGO_DE_DEUDA')
      AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada e WHERE e.id_operacion_proceso IN(op.id,raiz.id)))
  FROM public.tb_operacion_proceso solicitada
  JOIN public.tb_operacion_proceso raiz ON raiz.id=coalesce(solicitada.id_operacion_padre,solicitada.id)
  CROSS JOIN LATERAL (SELECT p.* FROM public.tb_operacion_proceso p
    WHERE p.id=raiz.id OR p.id_operacion_padre=raiz.id
    ORDER BY (p.id_operacion_padre IS NOT NULL) DESC,p.id DESC LIMIT 1) op
  WHERE solicitada.id=p_id;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_bono_no_admin()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
 IF EXISTS(SELECT 1 FROM public.tb_usuario WHERE auth_user_id=auth.uid() AND (id_rol=1 OR coalesce(flag_super_admin,false))) THEN
  RAISE EXCEPTION 'Administracion no registra bonos: solo penalidades y el Cuadre Perfecto';
 END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_bonos_mes_admin()
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE v_id bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesion autenticada'; END IF;
  SELECT u.id INTO v_id
  FROM public.tb_usuario u
  JOIN public.tb_estado e ON e.id = u.id_estado AND upper(btrim(e.nombre)) = 'ACTIVO'
  WHERE u.auth_user_id = auth.uid() AND (u.id_rol = 1 OR coalesce(u.flag_super_admin, false))
  LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Solo Administración puede gestionar los bonos del mes'; END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_bonos_mes_calcular(p_id_periodo bigint, p_id_colaborador bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
WITH periodo AS (

  SELECT *
  FROM public.tb_compensacion_periodo
  WHERE id = p_id_periodo
), colaborador AS (
  SELECT *
  FROM public.tb_compensacion_colaborador
  WHERE id = p_id_colaborador
), tramos_base AS (
SELECT
    a.id AS id_asignacion,
    a.id_cargo,
    a.id_sucursal,
    a.id_plan,
    pv.id AS id_plan_version,
    GREATEST(a.fecha_inicio, pv.fecha_inicio, pe.fecha_inicio, c.fecha_ingreso) AS fecha_inicio,
    LEAST(
      COALESCE(a.fecha_fin, pe.fecha_fin),
      COALESCE(pv.fecha_fin, pe.fecha_fin),
      pe.fecha_fin,
      COALESCE(c.fecha_cese, pe.fecha_fin)
    ) AS fecha_fin,
    ca.codigo AS cargo_codigo,
    ca.nombre AS cargo_nombre,
    s.nombre AS sucursal_nombre,
    pl.codigo AS plan_codigo,
    pl.nombre AS plan_nombre,
    pv.numero_version
  FROM periodo pe
  JOIN colaborador c ON true
  JOIN public.tb_compensacion_asignacion a
    ON a.id_colaborador = c.id
   AND a.fecha_inicio <= pe.fecha_fin
   AND (a.fecha_fin IS NULL OR a.fecha_fin >= pe.fecha_inicio)
  JOIN LATERAL public.f_private_compensacion_configuracion_tramos(a.id_plan) pv
    ON true
   AND pv.fecha_inicio <= pe.fecha_fin
   AND (pv.fecha_fin IS NULL OR pv.fecha_fin >= pe.fecha_inicio)
  JOIN public.tb_compensacion_cargo ca ON ca.id = a.id_cargo
  JOIN public.tb_sucursal s ON s.id = a.id_sucursal
  JOIN public.tb_compensacion_plan pl ON pl.id = a.id_plan
), tramos AS (
SELECT tb.* FROM tramos_base tb WHERE tb.fecha_fin >= tb.fecha_inicio
), operaciones_pagadas AS (
  SELECT
    op.*,
    COALESCE(op.fecha_pagado, op.fecha_deposito_cliente, op.fecha_registro)
      AS fecha_atribucion,
    GREATEST(COALESCE(op.monto_deposito_cliente, 0), 0)::numeric
      AS base_operacion
  FROM periodo pe
  JOIN public.tb_operacion_proceso op
    ON UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
   AND (
     COALESCE(op.fecha_pagado, op.fecha_deposito_cliente, op.fecha_registro)
     AT TIME ZONE pe.zona_horaria
   )::date BETWEEN pe.fecha_inicio AND pe.fecha_fin
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.tb_operacion_proceso_eliminada oe
    WHERE oe.id_operacion_proceso = op.id
  )
), fuentes_operacion AS (
  SELECT
    op.id AS id_operacion,
    op.fecha_atribucion,
    op.base_operacion,
    op.codigo_operacion_deposito_cliente,
    op.id_cliente,
    op.dni_cliente,
    op.nombre_cliente,
    op.tipo_servicio,
    'OPERACION_PAGADA_GESTOR'::text AS fuente_operacion
  FROM operaciones_pagadas op
  JOIN colaborador c
    ON COALESCE(op.id_usuario_gestor, op.id_usuario) = c.id_usuario

  UNION ALL

  SELECT
    primera.id AS id_operacion,
    primera.fecha_atribucion,
    GREATEST(COALESCE(primera.monto_deposito_cliente, 0), 0)::numeric,
    primera.codigo_operacion_deposito_cliente,
    primera.id_cliente,
    primera.dni_cliente,
    primera.nombre_cliente,
    primera.tipo_servicio,
    'CLIENTE_NUEVO_EFECTIVIZADO_7_DIAS'::text
  FROM periodo pe
  JOIN colaborador c ON c.id_usuario IS NOT NULL
  JOIN public.tb_cliente cli ON cli.id_usuario = c.id_usuario
  JOIN LATERAL (
    SELECT
      op.*,
      (public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'fecha_pago')::timestamptz
        AS fecha_atribucion
    FROM public.tb_operacion_proceso op
    WHERE op.id_cliente = cli.id
      AND (public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'pagada')::boolean
      AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
      AND NOT EXISTS (
        SELECT 1
        FROM public.tb_operacion_proceso_eliminada oe
        WHERE oe.id_operacion_proceso = op.id
      )
      AND (public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'fecha_pago')::timestamptz
        >= cli.fecha_registro
      AND (public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'fecha_pago')::timestamptz
        <= cli.fecha_registro + INTERVAL '7 days'
    ORDER BY
      (public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'fecha_pago')::timestamptz,
      op.id
    LIMIT 1
  ) primera ON true
  WHERE (
    primera.fecha_atribucion AT TIME ZONE pe.zona_horaria
  )::date BETWEEN pe.fecha_inicio AND pe.fecha_fin
), reglas_operacion AS (
  SELECT DISTINCT ON (fo.id_operacion, r.id_concepto)
    t.id_asignacion,
    t.id_plan_version,
    t.fecha_inicio,
    t.fecha_fin,
    fo.*,
    r.id AS id_regla,
    r.id_concepto,
    r.tipo_calculo,
    r.monto,
    r.porcentaje,
    r.tope_importe,
    r.configuracion,
    co.codigo AS concepto_codigo,
    co.nombre AS concepto_nombre,
    co.categoria,
    co.naturaleza
  FROM fuentes_operacion fo
  JOIN tramos t
    ON (fo.fecha_atribucion AT TIME ZONE (
      SELECT zona_horaria FROM periodo LIMIT 1
    ))::date BETWEEN t.fecha_inicio AND t.fecha_fin
  JOIN LATERAL public.f_private_compensacion_reglas_colaborador_fecha(t.id_plan, t.fecha_inicio, p_id_colaborador) r
    ON r.configuracion ->> 'fuente_operacion' = fo.fuente_operacion
   AND (r.id_cargo IS NULL OR r.id_cargo = t.id_cargo)
   AND (r.id_sucursal IS NULL OR r.id_sucursal = t.id_sucursal)
  JOIN public.tb_compensacion_concepto co ON co.id = r.id_concepto
  JOIN public.tb_estado es ON es.id = r.id_estado
  WHERE UPPER(BTRIM(es.nombre)) = 'ACTIVO'
    AND co.naturaleza = 'INGRESO'
    AND (co.codigo NOT IN('COMISION_REGISTRO_EFECTIVIZACION','COMISION_AUDITAR_NUEVOS') OR t.cargo_codigo NOT IN('JEFE_SUPERIOR_PAGOS','OPERADOR_ALTA_DEMANDA','ENCARGADO_CARTERA_MEDIA','ASISTENTE_VIRTUAL_PAGOS') OR EXISTS(
      SELECT 1 FROM public.tb_cliente cn WHERE cn.id=fo.id_cliente
      AND fo.fecha_atribucion BETWEEN cn.fecha_registro AND cn.fecha_registro+interval '168 hours'
      AND fo.id_operacion=(SELECT first_op.id FROM public.tb_operacion_proceso first_op
        CROSS JOIN LATERAL public.f_private_compensacion_cliente_nuevo_operacion_estado(first_op.id) st
        WHERE first_op.id_cliente=cn.id AND st->>'pagada'='true'
          AND (st->>'fecha_pago')::timestamptz BETWEEN cn.fecha_registro AND cn.fecha_registro+interval '168 hours'
        ORDER BY (st->>'fecha_pago')::timestamptz,first_op.id LIMIT 1)))
    AND co.categoria IN ('BONO', 'COMISION')
    AND r.tipo_calculo IN ('FIJO', 'POR_UNIDAD', 'PORCENTAJE')
    AND (r.valor_minimo IS NULL OR fo.base_operacion >= r.valor_minimo)
    AND (r.valor_maximo IS NULL OR fo.base_operacion <= r.valor_maximo)
  ORDER BY
    fo.id_operacion,
    r.id_concepto,
    ((r.id_cargo IS NOT NULL)::integer +
     (r.id_sucursal IS NOT NULL)::integer) DESC,
    r.prioridad DESC,
    r.id DESC
), detalle_operaciones AS (
  SELECT jsonb_build_object(
    'id_asignacion', ro.id_asignacion,
    'id_plan_version', ro.id_plan_version,
    'fecha_inicio_tramo', ro.fecha_inicio,
    'fecha_fin_tramo', ro.fecha_fin,
    'id_concepto', ro.id_concepto,
    'id_regla', ro.id_regla,
    'tipo_origen', 'OPERACION',
    'clave_origen', CASE WHEN ro.fuente_operacion='CLIENTE_NUEVO_EFECTIVIZADO_7_DIAS'
 THEN 'CAPTACION:COMISION_REGISTRO_EFECTIVIZACION:'||ro.id_cliente||':'||p_id_colaborador
 ELSE 'OPERACION:' || ro.id_operacion || ':REGLA:' || ro.id_regla END,
    'id_evento', NULL,
    'id_jornada', NULL,
    'id_operacion', ro.id_operacion,
    'id_excepcion', NULL,
    'concepto_codigo', ro.concepto_codigo,
    'concepto_nombre', ro.concepto_nombre,
    'categoria', ro.categoria,
    'naturaleza', ro.naturaleza,
    'regla_snapshot', jsonb_build_object(
      'tipo_calculo', ro.tipo_calculo,
      'monto', ro.monto,
      'porcentaje', ro.porcentaje,
      'tope_importe', ro.tope_importe,
      'configuracion', ro.configuracion
    ),
    'formula_snapshot', CASE ro.tipo_calculo
      WHEN 'PORCENTAJE' THEN 'monto_deposito_cliente * porcentaje / 100'
      ELSE 'monto fijo por operacion elegible'
    END,
    'base_calculo', ro.base_operacion,
    'cantidad', 1,
    'tarifa', CASE
      WHEN ro.tipo_calculo = 'PORCENTAJE' THEN ro.porcentaje
      ELSE ro.monto
    END,
    'importe', ROUND(LEAST(
      calculo.importe_calculado,
      COALESCE(ro.tope_importe, calculo.importe_calculado)
    ), 2),
    'datos_origen', jsonb_build_object(
      'fuente_operacion', ro.fuente_operacion,
      'fecha_atribucion', ro.fecha_atribucion,
      'codigo_operacion', ro.codigo_operacion_deposito_cliente,
      'id_cliente', ro.id_cliente,
      'dni_cliente', ro.dni_cliente,
      'nombre_cliente', ro.nombre_cliente,
      'tipo_servicio', ro.tipo_servicio,
      'monto_deposito_cliente', ro.base_operacion
    )
  ) AS linea
  FROM reglas_operacion ro
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN ro.tipo_calculo = 'PORCENTAJE'
        THEN ro.base_operacion * COALESCE(ro.porcentaje, 0) / 100
      ELSE COALESCE(ro.monto, 0)
    END AS importe_calculado
  ) calculo
  WHERE calculo.importe_calculado > 0
), detalle_eventos AS (
  SELECT jsonb_build_object(
    'id_asignacion', NULL,
    'id_plan_version', NULL,
    'fecha_inicio_tramo', NULL,
    'fecha_fin_tramo', NULL,
    'id_concepto', co.id,
    'id_regla', ev.id_regla_aplicada,
    'tipo_origen', 'EVENTO',
    'clave_origen', 'EVENTO:' || ev.id,
    'id_evento', ev.id,
    'id_jornada', NULL,
    'id_operacion', CASE WHEN ev.datos->>'flujo'='MARKETING_CAPTURA_V1' OR EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion ma JOIN public.tb_compensacion_cargo mc ON mc.id=ma.id_cargo AND mc.codigo='DISENO_MARKETING'
      WHERE ma.id_colaborador=ev.id_colaborador_beneficiario AND (ev.fecha_evento AT TIME ZONE 'America/Lima')::date BETWEEN ma.fecha_inicio AND coalesce(ma.fecha_fin,'infinity'::date))
      THEN (SELECT min(mr.id_operacion) FROM public.tb_compensacion_evento_referencia mr WHERE mr.id_evento=ev.id AND mr.id_operacion IS NOT NULL) END,
    'id_excepcion', NULL,
    'concepto_codigo', co.codigo,
    'concepto_nombre', co.nombre,
    'categoria', co.categoria,
    'naturaleza', co.naturaleza,
    'regla_snapshot', ev.criterios_validacion_snapshot,
    'formula_snapshot', 'importe aprobado del evento',
    'base_calculo', COALESCE(ev.base_calculo, 0),
    'cantidad', COALESCE(ev.cantidad, 1),
    'tarifa', COALESCE(ev.tarifa_aplicada, ev.importe_aprobado, 0),
    'importe', ev.importe_aprobado,
    'datos_origen', jsonb_build_object(
      'tipo_evento', te.codigo,
      'categoria_evento', te.categoria,
      'fecha_evento', ev.fecha_evento,
      'evidencia', ev.evidencia,
      'referencias_marketing',CASE WHEN ev.datos->>'flujo'='MARKETING_CAPTURA_V1' THEN ev.datos->'fuente_operacion' ELSE NULL END
    )
  ) AS linea
  FROM periodo pe
  JOIN public.tb_compensacion_evento ev
    ON ev.periodo_imputacion = pe.periodo
   AND ev.id_colaborador_beneficiario = p_id_colaborador
   AND ev.estado_evento = 'APROBADO'
  JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
  JOIN public.tb_compensacion_concepto co ON co.id = te.id_concepto
  WHERE te.categoria NOT IN ('PENALIDAD', 'AUDITORIA_PAGO')
    AND public.f_private_compensacion_marketing_evento_vigente(ev.id)
    AND (NOT EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador cp JOIN public.tb_usuario up ON up.id=cp.id_usuario WHERE cp.id=p_id_colaborador AND up.id_rol=2)
      OR public.f_private_compensacion_pagos_evento_vigente(ev.id))
    AND ev.datos->>'flujo' IS DISTINCT FROM 'TIKTOK_CLIENTE_NUEVO_7_DIAS'
    AND co.codigo NOT IN ('BONO_PUNTUALIDAD','BONO_LIDERAZGO')
    -- Una incidencia posterior a la revision afecta el bono todavia no liquidado.
    -- Pendiente: retener para revisar; confirmado: no aplica. Sin alterar pagos historicos.
    AND (te.codigo<>'META_SEDE_SAFETYPAY' OR NOT EXISTS(
      SELECT 1 FROM public.tb_compensacion_asignacion a
      CROSS JOIN LATERAL public.f_private_compensacion_meta_sede_chats(a.id_sucursal,ev.periodo_imputacion) ch
      WHERE a.id=(ev.criterios_validacion_snapshot->>'id_asignacion')::bigint
        AND ((ch->>'pendientes')::bigint>0 OR (ch->>'confirmados')::bigint>0)))
), detalle_incidencia_descuento AS (
  SELECT jsonb_build_object(
    'id_asignacion', NULL, 'id_plan_version', NULL,
    'fecha_inicio_tramo', NULL, 'fecha_fin_tramo', NULL,
    'id_concepto', (ev.criterios_validacion_snapshot ->> 'id_concepto_descuento')::bigint,
    'id_regla', NULL, 'tipo_origen', 'EVENTO',
    'clave_origen', 'INCIDENCIA_DESCUENTO:' || ev.id,
    'id_evento', ev.id, 'id_jornada', NULL, 'id_operacion', NULL, 'id_excepcion', NULL,
    'concepto_codigo', co.codigo, 'concepto_nombre', co.nombre,
    'categoria', co.categoria, 'naturaleza', co.naturaleza,
    'regla_snapshot', ev.criterios_validacion_snapshot,
    'formula_snapshot', CASE WHEN efectivo.cronologico THEN 'Incidencia confirmada posterior a perdida de puntualidad; orden cronologico del hecho' ELSE 'descuento aprobado de incidencia' END,
    'base_calculo', 1, 'cantidad', 1,
    'tarifa', efectivo.importe, 'importe', efectivo.importe,
    'datos_origen', jsonb_build_object('id_penalidad_tipo', ev.id_penalidad_tipo,
      'importe_snapshot_original',ev.importe_aprobado,'evaluacion_cronologica',efectivo.cronologico)
  ) AS linea
  FROM periodo pe
  JOIN public.tb_compensacion_evento ev
    ON ev.periodo_imputacion = pe.periodo
   AND ev.id_colaborador_responsable = p_id_colaborador
   AND ev.estado_evento = 'APROBADO'
  JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
  JOIN public.tb_compensacion_concepto co
    ON co.id = (ev.criterios_validacion_snapshot ->> 'id_concepto_descuento')::bigint
  CROSS JOIN LATERAL (
    SELECT coalesce(ev.criterios_validacion_snapshot->>'codigo_penalidad',
      (SELECT pt.codigo FROM public.tb_compensacion_penalidad_tipo pt WHERE pt.id=ev.id_penalidad_tipo),'') AS codigo
  ) penalidad
  CROSS JOIN LATERAL (
    SELECT CASE WHEN penalidad.codigo IN('JEFE_UNIFORME','JEFE_INDISCIPLINA')
      THEN public.f_private_compensacion_jefatura_descuento_incidente(ev.id)
      WHEN penalidad.codigo ~ '^PAG_[A-Z_]+_(UNIFORME|INDISCIPLINA)$' THEN public.f_private_compensacion_pagos_descuento_incidente(ev.id)
      WHEN penalidad.codigo IN('MKT_UNIFORME','MKT_INDISCIPLINA') THEN public.f_private_compensacion_marketing_descuento_incidente(ev.id)
      WHEN penalidad.codigo IN('ATC_UNIFORME','ATC_INDISCIPLINA') THEN public.f_private_compensacion_atc_descuento_incidente(ev.id)
      WHEN penalidad.codigo IN('FAC_UNIFORME','FAC_INDISCIPLINA')
      THEN public.f_private_compensacion_facturacion_descuento_incidente(ev.id)
      ELSE ev.importe_aprobado END AS importe,
      penalidad.codigo IN('ATC_UNIFORME','ATC_INDISCIPLINA','JEFE_UNIFORME','JEFE_INDISCIPLINA','FAC_UNIFORME','FAC_INDISCIPLINA','MKT_UNIFORME','MKT_INDISCIPLINA') AS cronologico
  ) efectivo
  WHERE te.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
    AND penalidad.codigo <> 'JEFE_ERROR_CUADRO' AND penalidad.codigo <> 'ATC_FRAUDE_DIGITAL' AND penalidad.codigo !~ '^PAG_[A-Z_]+_ERROR_CUADRO$'
), detalle_incidencia_bono AS (
  SELECT jsonb_build_object(
    'id_asignacion', NULL, 'id_plan_version', NULL,
    'fecha_inicio_tramo', NULL, 'fecha_fin_tramo', NULL,
    'id_concepto', (ev.criterios_validacion_snapshot ->> 'id_concepto_bono_reportante')::bigint,
    'id_regla', NULL, 'tipo_origen', 'EVENTO',
    'clave_origen', 'INCIDENCIA_BONO:' || ev.id,
    'id_evento', ev.id, 'id_jornada', NULL, 'id_operacion', NULL, 'id_excepcion', NULL,
    'concepto_codigo', co.codigo, 'concepto_nombre', co.nombre,
    'categoria', co.categoria, 'naturaleza', co.naturaleza,
    'regla_snapshot', ev.criterios_validacion_snapshot,
    'formula_snapshot', 'bono aprobado al reportante',
    'base_calculo', 1, 'cantidad', 1,
    'tarifa', (ev.criterios_validacion_snapshot ->> 'importe_bono_reportante')::numeric,
    'importe', (ev.criterios_validacion_snapshot ->> 'importe_bono_reportante')::numeric,
    'datos_origen', jsonb_build_object('id_penalidad_tipo', ev.id_penalidad_tipo)
  ) AS linea
  FROM periodo pe
  JOIN public.tb_compensacion_evento ev
    ON ev.periodo_imputacion = pe.periodo
   AND ev.id_colaborador_beneficiario = p_id_colaborador
   AND ev.estado_evento = 'APROBADO'
  JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
  JOIN public.tb_compensacion_concepto co
    ON co.id = (ev.criterios_validacion_snapshot ->> 'id_concepto_bono_reportante')::bigint
  WHERE te.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
    AND COALESCE(
      NULLIF(ev.criterios_validacion_snapshot ->> 'importe_bono_reportante', '')::numeric,
      0
    ) > 0
    AND ev.datos->>'rol_reportante_registro' IS DISTINCT FROM '5'
), metas_auto AS (
  SELECT public.f_private_compensacion_meta_area_calcular(p_id_periodo,p_id_colaborador) AS datos
), detalles_base AS (
  SELECT linea FROM detalle_operaciones WHERE public.f_private_compensacion_captacion_linea_aprobada(linea,p_id_colaborador)
  UNION ALL SELECT linea FROM detalle_eventos
  UNION ALL SELECT j FROM public.f_private_compensacion_marketing_descuentos(p_id_periodo,p_id_colaborador) j
  UNION ALL SELECT j FROM public.f_private_compensacion_pagos_detalles(p_id_periodo,p_id_colaborador) j
  UNION ALL SELECT j FROM public.f_private_compensacion_jefatura_registro_presencial(p_id_periodo,p_id_colaborador) j
    UNION ALL SELECT j FROM public.f_private_compensacion_facturacion_auditoria_detalles(p_id_periodo,p_id_colaborador) j
  UNION ALL SELECT j FROM public.f_private_compensacion_tiktok_detalles(p_id_periodo,p_id_colaborador) j WHERE public.f_private_compensacion_captacion_linea_aprobada(j,p_id_colaborador)
  UNION ALL SELECT linea FROM detalle_incidencia_descuento
  UNION ALL SELECT linea FROM detalle_incidencia_bono
  
  UNION ALL SELECT x FROM metas_auto m CROSS JOIN LATERAL jsonb_array_elements(m.datos->'detalles') x
  
), detalles AS (
    SELECT linea FROM detalles_base
    UNION ALL SELECT x FROM public.f_private_compensacion_pagos_cuadro(p_id_periodo,p_id_colaborador,
      coalesce((SELECT sum((linea->>'importe')::numeric) FROM detalles_base WHERE linea->>'categoria'='COMISION' AND linea->>'naturaleza'='INGRESO'),0)) x
    UNION ALL
    SELECT x FROM public.f_private_compensacion_atc_fraude_digital(p_id_periodo,p_id_colaborador,
      coalesce((SELECT sum((linea->>'importe')::numeric) FROM detalles_base
        WHERE linea->>'categoria'='COMISION' AND linea->>'naturaleza'='INGRESO'),0)) x
), bloqueos AS (
  SELECT jsonb_build_object('codigo','MARKETING_FUENTE_EN_REVISION','mensaje','Fuente de Marketing aprobada requiere revision o ajuste autorizado','id_evento',e.id) bloqueo
  FROM public.tb_compensacion_evento e JOIN periodo pe ON pe.periodo=e.periodo_imputacion
  WHERE (e.id_colaborador_beneficiario=p_id_colaborador OR e.id_colaborador_responsable=p_id_colaborador) AND e.estado_evento='APROBADO' AND NOT public.f_private_compensacion_marketing_evento_vigente(e.id)
  UNION ALL
  SELECT jsonb_build_object('codigo','PAGOS_FUENTE_EN_REVISION','mensaje','Una fuente aprobada de Pagos requiere nueva revision','id_evento',e.id) bloqueo
  FROM public.tb_compensacion_evento e JOIN periodo pe ON pe.periodo=e.periodo_imputacion
  JOIN public.tb_compensacion_colaborador c ON c.id=e.id_colaborador_beneficiario JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=2
  WHERE c.id=p_id_colaborador AND e.estado_evento='APROBADO' AND e.id_penalidad_tipo IS NULL AND NOT public.f_private_compensacion_pagos_evento_vigente(e.id)
  UNION ALL
  SELECT jsonb_build_object('codigo','FACTURACION_AUDITORIA_EN_REVISION','mensaje','Una fuente de auditoria aprobada requiere nueva revision antes de consolidar','id_evento',e.id) AS bloqueo
  FROM public.tb_compensacion_evento e JOIN periodo pe ON pe.periodo=e.periodo_imputacion
  WHERE e.id_colaborador_beneficiario=p_id_colaborador AND e.estado_evento='APROBADO' AND e.datos->>'flujo'='FACTURACION_AUDITORIA_V1'
    AND NOT public.f_private_compensacion_facturacion_auditoria_vigente(e.id)
  UNION ALL
  SELECT jsonb_build_object('codigo','FACTURACION_INNOVACION_EN_IMPLEMENTACION','mensaje','La propuesta requiere implementacion comprobada antes de consolidar','id_evento',e.id)
  FROM public.tb_compensacion_evento e JOIN periodo pe ON pe.periodo=e.periodo_imputacion
  JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento AND t.codigo='PROPUESTA_INNOVACION'
  JOIN public.tb_compensacion_colaborador c ON c.id=e.id_colaborador_beneficiario
  JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=5
  WHERE c.id=p_id_colaborador AND e.estado_evento='APROBADO' AND NOT public.f_private_compensacion_innovacion_comprobada(e.id)
  UNION ALL
  SELECT jsonb_build_object(
    'codigo', 'SIN_ASIGNACION',
    'mensaje', 'El colaborador no tiene tramos de asignacion con matriz publicada'
  ) AS bloqueo
  WHERE NOT EXISTS (SELECT 1 FROM tramos)
  UNION ALL
  SELECT jsonb_build_object(
    'codigo', 'EVENTO_PENDIENTE',
    'mensaje', 'Existen eventos monetarios pendientes de decision'
  )
  WHERE EXISTS (
    SELECT 1
    FROM public.tb_compensacion_evento ev
    JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
    JOIN periodo pe ON true
    WHERE ev.periodo_imputacion = pe.periodo
      AND te.codigo <> 'BONO_PUNTUALIDAD'
      -- El evento de captura TikTok sigue pendiente: la conversion se calcula
      -- desde operaciones finales y la cuota de jefatura tiene revision propia.
      AND NOT (te.codigo='TIKTOK_LIVE' AND ev.fuente='CLIENTE'
        AND ev.datos->>'flujo'='TIKTOK_CLIENTE_NUEVO_7_DIAS')
      AND ev.estado_evento IN ('BORRADOR', 'PENDIENTE')
      AND p_id_colaborador IN (
        ev.id_colaborador_beneficiario,
        ev.id_colaborador_responsable
      )
      AND (
        te.id_concepto IS NOT NULL
        OR te.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
      )
  )
  UNION ALL
  SELECT jsonb_build_object('codigo','META_SEDE_CHATS_EN_REVISION',
    'mensaje','El bono de meta de sede requiere revisar reportes de chats; un pendiente no lo anula')
  WHERE EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento ev
    JOIN public.tb_compensacion_evento_tipo te ON te.id=ev.id_tipo_evento AND te.codigo='META_SEDE_SAFETYPAY'
    JOIN periodo pe ON pe.periodo=ev.periodo_imputacion
    JOIN public.tb_compensacion_asignacion a ON a.id=(ev.criterios_validacion_snapshot->>'id_asignacion')::bigint
    CROSS JOIN LATERAL public.f_private_compensacion_meta_sede_chats(a.id_sucursal,ev.periodo_imputacion) ch
    WHERE ev.id_colaborador_beneficiario=p_id_colaborador AND ev.estado_evento='APROBADO'
      AND (ch->>'pendientes')::bigint>0)
  UNION ALL
  SELECT jsonb_build_object('codigo','CUOTA_TIKTOK_PENDIENTE',
    'mensaje','Hay conversiones TikTok de Jefatura pagadas cuya cuota de sede aun no tiene revision administrativa')
  WHERE EXISTS (
    SELECT 1 FROM public.f_private_compensacion_tiktok_clientes(p_id_colaborador) j
    JOIN periodo pe ON ((j->>'fecha_efectiva')::timestamptz AT TIME ZONE pe.zona_horaria)::date BETWEEN pe.fecha_inicio AND pe.fecha_fin
    WHERE j->'requiere_cuota'='true'::jsonb AND j->>'estado_operacion'='Pagado'
      AND j#>'{revision_cuota,cuota_cumplida}' IS NULL
  )
  UNION ALL
  SELECT jsonb_build_object(
    'codigo', 'EXCEPCION_NO_IMPLEMENTADA',
    'mensaje', 'Existe una excepcion aprobada que requiere definir modo ADICION o REEMPLAZO',
    'id_excepcion', ex.id
  )
  FROM public.tb_compensacion_excepcion ex
  JOIN periodo pe ON true
  WHERE ex.id_colaborador = p_id_colaborador
    AND ex.estado_aprobacion = 'APROBADA'
    AND ex.fecha_inicio <= pe.fecha_fin
    AND (ex.fecha_fin IS NULL OR ex.fecha_fin >= pe.fecha_inicio)
  UNION ALL
  SELECT x FROM metas_auto m CROSS JOIN LATERAL jsonb_array_elements(m.datos->'bloqueos') x
), totales AS (
  SELECT
    COALESCE(SUM((linea ->> 'importe')::numeric) FILTER (
      WHERE linea ->> 'categoria' = 'BONO' AND linea ->> 'naturaleza' = 'INGRESO'
    ), 0) AS total_bonos,
    COALESCE(SUM((linea ->> 'importe')::numeric) FILTER (
      WHERE linea ->> 'categoria' = 'COMISION' AND linea ->> 'naturaleza' = 'INGRESO'
    ), 0) AS total_comisiones,
    COALESCE(SUM((linea ->> 'importe')::numeric) FILTER (
      WHERE linea ->> 'naturaleza' = 'DESCUENTO'
    ), 0) AS total_descuentos
  FROM detalles
)
SELECT jsonb_build_object(
  'periodo', (SELECT to_jsonb(pe) FROM periodo pe),
  'colaborador', (SELECT jsonb_build_object(
    'id', c.id,
    'tipo_documento', c.tipo_documento,
    'numero_documento', c.numero_documento,
    'nombre_completo', c.nombre_completo
  ) FROM colaborador c),
  'tramos', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id_asignacion', t.id_asignacion,
    'id_plan_version', t.id_plan_version,
    'fecha_inicio', t.fecha_inicio,
    'fecha_fin', t.fecha_fin,
    'asignacion_snapshot', jsonb_build_object(
      'id_cargo', t.id_cargo, 'cargo_codigo', t.cargo_codigo, 'cargo_nombre', t.cargo_nombre,
      'id_sucursal', t.id_sucursal, 'sucursal_nombre', t.sucursal_nombre,
      'id_plan', t.id_plan, 'plan_codigo', t.plan_codigo, 'plan_nombre', t.plan_nombre,
      'numero_version', t.numero_version
    )
  ) ORDER BY t.fecha_inicio, t.id_asignacion) FROM tramos t), '[]'::jsonb),
  'detalles', COALESCE((SELECT jsonb_agg(linea ORDER BY linea ->> 'clave_origen') FROM detalles), '[]'::jsonb),
  'bloqueos', COALESCE((SELECT jsonb_agg(bloqueo) FROM bloqueos), '[]'::jsonb),
  'puede_calcular', NOT EXISTS (SELECT 1 FROM bloqueos),
  'total_bonos', ROUND(t.total_bonos, 2),
  'total_comisiones', ROUND(t.total_comisiones, 2),
  'total_descuentos', ROUND(t.total_descuentos, 2),
  'total_neto', ROUND(t.total_bonos + t.total_comisiones - t.total_descuentos, 2)
)
FROM totales t;

$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_bonos_mes_colaboradores(p_id_periodo bigint)
 RETURNS TABLE(id_colaborador bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT c.id
  FROM public.tb_compensacion_periodo pe
  JOIN public.tb_compensacion_colaborador c ON true
  JOIN public.tb_estado ec ON ec.id = c.id_estado AND upper(btrim(ec.nombre)) = 'ACTIVO'
  WHERE pe.id = p_id_periodo
    AND EXISTS (SELECT 1 FROM public.tb_compensacion_asignacion a
      JOIN public.tb_estado ea ON ea.id = a.id_estado AND upper(btrim(ea.nombre)) = 'ACTIVO'
      WHERE a.id_colaborador = c.id AND a.fecha_inicio <= pe.fecha_fin AND coalesce(a.fecha_fin, 'infinity'::date) >= pe.fecha_inicio)
  ORDER BY c.nombre_completo, c.id;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_bonos_mes_fila(p_id_periodo bigint, p_id_colaborador bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v jsonb;
  tr jsonb;
BEGIN
  v := public.f_private_compensacion_bonos_mes_calcular(p_id_periodo, p_id_colaborador);
  tr := coalesce(v->'tramos'->0->'asignacion_snapshot', '{}'::jsonb);
  RETURN jsonb_build_object(
    'id_colaborador', p_id_colaborador,
    'nombre_completo', v->'colaborador'->>'nombre_completo',
    'tipo_documento', v->'colaborador'->>'tipo_documento',
    'numero_documento', v->'colaborador'->>'numero_documento',
    'cargo', tr->>'cargo_nombre', 'id_sucursal', tr->'id_sucursal', 'sucursal', tr->>'sucursal_nombre',
    'total_bonos', coalesce((v->>'total_bonos')::numeric, 0),
    'total_comisiones', coalesce((v->>'total_comisiones')::numeric, 0),
    'total_descuentos', coalesce((v->>'total_descuentos')::numeric, 0),
    'total_neto', coalesce((v->>'total_neto')::numeric, 0),
    'puede_calcular', coalesce((v->>'puede_calcular')::boolean, false),
    'bloqueos', coalesce(v->'bloqueos', '[]'::jsonb),
    'descuentos_mes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'tipo_origen', d.tipo_origen, 'tipo', d.tipo,
        'porcentaje', d.porcentaje, 'importe_base', d.importe_base, 'importe_descuento', d.importe_descuento,
        'motivo', d.motivo, 'estado', d.estado, 'fecha_registro', d.fecha_registro,
        'motivo_anulacion', d.motivo_anulacion) ORDER BY d.id)
      FROM public.tb_compensacion_descuento_mes d WHERE d.id_periodo = p_id_periodo AND d.id_colaborador = p_id_colaborador), '[]'::jsonb),
    'condiciones', coalesce((SELECT jsonb_agg(jsonb_build_object('codigo_condicion', c.codigo_condicion, 'cumple', c.cumple,
        'nota', c.nota, 'fecha_actualizacion', c.fecha_actualizacion) ORDER BY c.id)
      FROM public.tb_compensacion_condicion_mes c WHERE c.id_periodo = p_id_periodo AND c.id_colaborador = p_id_colaborador), '[]'::jsonb),
    'detalles', coalesce(v->'detalles', '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_bonos_mes_invalidar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_mes date;
BEGIN
  SELECT p.periodo INTO v_mes FROM public.tb_compensacion_periodo p WHERE p.id = NEW.id_periodo;
  IF v_mes IS NOT NULL THEN
    INSERT INTO public.tb_compensacion_seguimiento_invalidacion(periodo, id_colaborador, motivo)
    VALUES (v_mes, NEW.id_colaborador, left(TG_TABLE_NAME, 120));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_calendario_asignacion(p_id_asignacion bigint, p_fecha date)
 RETURNS date[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT public.f_private_compensacion_fechas_no_laborables(r.configuracion)
    FROM public.tb_compensacion_asignacion a
    CROSS JOIN LATERAL public.f_private_compensacion_reglas_fecha(a.id_plan, p_fecha) r
    JOIN public.tb_compensacion_concepto co ON co.id = r.id_concepto AND co.categoria = 'SUELDO'
    JOIN public.tb_estado e ON e.id = r.id_estado AND UPPER(e.nombre) = 'ACTIVO'
    WHERE a.id = p_id_asignacion
      AND (r.id_cargo IS NULL OR r.id_cargo = a.id_cargo)
      AND (r.id_sucursal IS NULL OR r.id_sucursal = a.id_sucursal)
    ORDER BY ((r.id_cargo IS NOT NULL)::integer + (r.id_sucursal IS NOT NULL)::integer) DESC,
      r.prioridad DESC, r.id DESC LIMIT 1
  ), ARRAY[]::date[]);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_calificacion_comunidad_elegible(p_id_comunidad bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT coalesce((
    SELECT CASE
      WHEN p_id_comunidad IS NULL THEN true
      WHEN jsonb_typeof(t.configuracion->'comunidades_elegibles') IS DISTINCT FROM 'array' THEN true
      ELSE p_id_comunidad::text IN (SELECT jsonb_array_elements_text(t.configuracion->'comunidades_elegibles'))
    END
    FROM public.tb_compensacion_evento_tipo t
    WHERE t.codigo = 'CALIFICACION_PRESENCIAL'
  ), true);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_calificacion_elegible(p_id_operacion bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT coalesce((
    SELECT CASE
      WHEN d->>'servicio' = 'Pago Deuda' THEN true
      ELSE op.comision_servicio IN (1, 2)
        AND coalesce(op.comision_minima_servicio, 0) = 0
        AND public.f_private_compensacion_calificacion_comunidad_elegible(coalesce(op.id_comunidad,
          (SELECT raiz.id_comunidad FROM public.tb_operacion_proceso raiz WHERE raiz.id = (d->>'raiz')::bigint)))
    END
    FROM public.tb_operacion_proceso op
    CROSS JOIN LATERAL public.f_private_compensacion_calificacion_operacion(op.id) d
    WHERE op.id = p_id_operacion
  ), false);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_calificacion_operacion(p_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH raiz AS (
    SELECT r.* FROM public.tb_operacion_proceso o
    JOIN public.tb_operacion_proceso r ON r.id=coalesce(o.id_operacion_padre,o.id)
    WHERE o.id=p_id
  ), final AS (
    SELECT r.id raiz,r.dni_cliente dni_raiz,r.nombre_cliente cliente_raiz,r.codigo_operacion_deposito_cliente codigo_raiz,
      upper(regexp_replace(btrim(r.tipo_servicio),'[^a-zA-Z0-9]+','_','g')) servicio_raiz,o.*
    FROM raiz r CROSS JOIN LATERAL (
      SELECT op.* FROM public.tb_operacion_proceso op
      WHERE (op.id=r.id OR op.id_operacion_padre=r.id)
        AND coalesce(upper(btrim(op.tipo_flujo_pago_deuda)),'') NOT IN('RETORNO','RETORNO_DIRECTO','SOLICITUD')
      ORDER BY (op.id_operacion_padre IS NOT NULL) DESC,op.id DESC LIMIT 1
    ) o
  )
  SELECT jsonb_build_object('id',o.id,'raiz',o.raiz,
    'codigo',coalesce(nullif(btrim(o.codigo_operacion_deposito_cliente),''),o.codigo_raiz),'dni',coalesce(nullif(btrim(o.dni_cliente),''),btrim(o.dni_raiz)),
    'cliente',coalesce(nullif(btrim(o.nombre_cliente),''),o.cliente_raiz),
    'servicio',CASE WHEN o.servicio_raiz='EFECTIVIZACION' THEN 'Efectivización' ELSE 'Pago Deuda' END,
    'monto',o.monto_deposito_cliente,'fecha',coalesce(o.fecha_deposito_cliente,o.fecha_registro),
    'pagada',true,'estado','Pagado','paso',CASE WHEN o.servicio_raiz='EFECTIVIZACION' THEN NULL ELSE 4 END)
  FROM final o
  WHERE o.servicio_raiz IN('EFECTIVIZACION','PAGO_DEUDA','PAGO_DE_DEUDA')
    AND coalesce((public.f_private_compensacion_cliente_nuevo_operacion_estado(o.id)->>'pagada')::boolean,false)
    AND (o.servicio_raiz='EFECTIVIZACION' OR EXISTS(
      SELECT 1 FROM public.tb_operacion_caja c WHERE c.id_operacion_proceso=o.raiz AND c.tipo_origen='PAGO_DEUDA_COMISION'));
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_calificacion_propia()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object('id_colaborador',c.id,'id_usuario',u.id,'asesor',c.nombre_completo,'sede',s.nombre)
  FROM public.tb_usuario u
  JOIN public.tb_estado ue ON ue.id=u.id_estado AND upper(btrim(ue.nombre))='ACTIVO'
  JOIN public.tb_compensacion_colaborador c ON c.id_usuario=u.id
  JOIN public.tb_estado ce ON ce.id=c.id_estado AND upper(btrim(ce.nombre))='ACTIVO'
  JOIN LATERAL (SELECT a.id_cargo,a.id_sucursal FROM public.tb_compensacion_asignacion a
    JOIN public.tb_estado ae ON ae.id=a.id_estado AND upper(btrim(ae.nombre))='ACTIVO'
    WHERE a.id_colaborador=c.id AND a.fecha_inicio<=(now() AT TIME ZONE 'America/Lima')::date
      AND (a.fecha_fin IS NULL OR a.fecha_fin>=(now() AT TIME ZONE 'America/Lima')::date)
    ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1) a ON true
  JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo IN('ATENCION_CLIENTE','JEFE_TIENDA','JEFE_SUPERIOR_PAGOS','OPERADOR_ALTA_DEMANDA','ENCARGADO_CARTERA_MEDIA','ASISTENTE_VIRTUAL_PAGOS')
  JOIN public.tb_estado cae ON cae.id=ca.id_estado AND upper(btrim(cae.nombre))='ACTIVO'
  JOIN public.tb_sucursal s ON s.id=a.id_sucursal
  WHERE (u.id_rol<>2 OR public.f_private_compensacion_pagos_perfil(c.id) IS NOT NULL) AND u.auth_user_id=auth.uid() AND c.fecha_ingreso<=(now() AT TIME ZONE 'America/Lima')::date
    -- Solo ATC: Mi Enlace y QR depende de Calificaciones, no del permiso legacy.
    AND (u.id_rol NOT IN(2,4) OR coalesce(u.flag_super_admin,false) OR EXISTS (
      SELECT 1 FROM public.tb_permiso_usuario pu
      JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu AND pm.ruta='/compensaciones/calificaciones'
      JOIN public.tb_estado ep ON ep.id=pu.id_estado AND upper(btrim(ep.nombre))='ACTIVO'
      JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
      WHERE pu.id_usuario=u.id))
    AND (c.fecha_cese IS NULL OR c.fecha_cese>=(now() AT TIME ZONE 'America/Lima')::date);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_calificacion_valida(p_datos jsonb, p_comentario text, p_asesor bigint, p_politica jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(p_datos->>'estrellas' IN ('4','5'),false)
    AND (NOT COALESCE((p_politica->>'dni_obligatorio')::boolean,true)
      OR COALESCE(p_datos->>'cliente_documento' ~ '^[0-9]{8}$',false))
    AND (NOT COALESCE((p_politica->>'comentario_obligatorio')::boolean,false)
      OR length(btrim(COALESCE(p_comentario,'')))>0)
    AND (NOT COALESCE((p_politica->>'asesor_obligatorio')::boolean,false) OR p_asesor IS NOT NULL);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_captacion_fuente(p_cliente bigint, p_colaborador bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE usuario bigint; es_pagos boolean:=false; resultado jsonb;
BEGIN
 SELECT id_usuario INTO usuario FROM public.tb_compensacion_colaborador WHERE id=p_colaborador;
 WITH clientes AS MATERIALIZED (
    SELECT c.id,p_colaborador id_colaborador,c.nombre,c.numero_documento documento,c.tipo_documento,c.celular,c.id_comunidad,c.fecha_registro,
      (SELECT nombre_completo FROM public.tb_compensacion_colaborador WHERE id_usuario=c.id_usuario LIMIT 1) registrado_por,
      c.id_usuario=usuario propio,
      c.id_usuario=usuario AND now()<=c.fecha_registro+interval '168 hours' AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso o WHERE o.id_cliente=c.id OR regexp_replace(coalesce(o.dni_cliente,''),'[^0-9]','','g')=c.numero_documento) puede_editar,
      c.fecha_registro+interval '168 hours' vence,
      CASE WHEN pagada.id IS NOT NULL AND bono.id_regla IS NULL THEN 'EN_REVISION'
        WHEN pagada.id IS NOT NULL THEN 'BONO_HABILITADO'
        WHEN EXISTS(SELECT 1 FROM public.tb_operacion_proceso x
          WHERE x.id_cliente=c.id AND x.fecha_pagado IS NULL AND upper(btrim(x.nombre_estado))='PAGADO'
            AND (public.f_private_compensacion_cliente_nuevo_operacion_estado(x.id)->>'es_final')::boolean) THEN 'EN_REVISION'
        WHEN now()>c.fecha_registro+interval '168 hours' THEN 'BLOQUEADO'
        WHEN pendiente.id IS NOT NULL THEN 'OPERACION_PENDIENTE' ELSE 'ESPERANDO_OPERACION' END estado,
      coalesce(pagada.codigo_operacion_deposito_cliente,pendiente.codigo_operacion_deposito_cliente) operacion,
      coalesce(pagada.id,pendiente.id) id_operacion,
      coalesce(pagada.tipo_servicio,pendiente.tipo_servicio) servicio,
      coalesce(pagada.monto_deposito_cliente,pendiente.monto_deposito_cliente) monto,
      coalesce(pagada.estado_operacion,pendiente.estado_operacion,'Sin operación') estado_operacion,
      pagada.fecha_efectiva,
      CASE WHEN pagada.id IS NULL THEN 0::numeric ELSE bono.ganancia END ganancia,
      CASE WHEN canal.es_live THEN 'TIKTOK_LIVE' WHEN EXISTS(
 SELECT 1 FROM public.tb_compensacion_referido r JOIN public.tb_compensacion_evento e ON e.id=r.id_evento
 WHERE r.id_cliente=c.id AND e.datos->>'cliente_creado_en_referido'='true'
 AND e.id_usuario_registra=c.id_usuario) THEN 'REFERIDO' ELSE 'GENERAL' END canal,
      bono.id_regla, 'COMISION_REGISTRO_EFECTIVIZACION'::text concepto_codigo
    FROM public.tb_cliente c
    CROSS JOIN LATERAL (SELECT EXISTS(
      SELECT 1 FROM public.tb_compensacion_evento ev
      JOIN public.tb_compensacion_evento_referencia ref ON ref.id_evento=ev.id AND ref.id_cliente=c.id
      JOIN public.tb_compensacion_colaborador col ON col.id=ev.id_colaborador_beneficiario AND col.id_usuario=c.id_usuario
      WHERE ev.fuente='CLIENTE' AND ev.datos->>'flujo'='TIKTOK_CLIENTE_NUEVO_7_DIAS'
    ) es_live) canal
    LEFT JOIN LATERAL (
      SELECT op.*,(public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'fecha_pago')::timestamptz fecha_efectiva,
        public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'estado' estado_operacion
      FROM public.tb_operacion_proceso op WHERE op.id_cliente=c.id
        AND upper(btrim(coalesce(op.nombre_estado,'')))='PAGADO'
        AND (public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'pagada')::boolean
        AND (public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'fecha_pago')::timestamptz BETWEEN c.fecha_registro AND c.fecha_registro+interval '168 hours'
        AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada e WHERE e.id_operacion_proceso=op.id)
      ORDER BY (public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'fecha_pago')::timestamptz,op.id LIMIT 1
    ) pagada ON true
    LEFT JOIN LATERAL (
      SELECT op.*,public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'estado' estado_operacion
      FROM public.tb_operacion_proceso op WHERE op.id_cliente=c.id
        AND (public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'es_final')::boolean
        AND NOT (public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'pagada')::boolean
        AND op.fecha_registro BETWEEN c.fecha_registro AND c.fecha_registro+interval '168 hours'
        AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada e WHERE e.id_operacion_proceso=op.id)
      ORDER BY op.fecha_registro,op.id LIMIT 1
    ) pendiente ON true
    LEFT JOIN LATERAL (
      SELECT r.id id_regla,round(least(
        CASE WHEN r.tipo_calculo='PORCENTAJE' THEN greatest(coalesce(pagada.monto_deposito_cliente,0),0)*coalesce(r.porcentaje,0)/100
          ELSE coalesce(r.monto,0) END,
        coalesce(r.tope_importe,CASE WHEN r.tipo_calculo='PORCENTAJE' THEN greatest(coalesce(pagada.monto_deposito_cliente,0),0)*coalesce(r.porcentaje,0)/100
          ELSE coalesce(r.monto,0) END)),2) ganancia
      FROM public.tb_compensacion_colaborador col
      JOIN public.tb_compensacion_asignacion a ON a.id_colaborador=col.id
      JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
      CROSS JOIN LATERAL public.f_private_compensacion_reglas_colaborador_fecha(a.id_plan,(pagada.fecha_efectiva AT TIME ZONE 'America/Lima')::date,col.id) r
      JOIN public.tb_compensacion_concepto co ON co.id=r.id_concepto
      JOIN public.tb_estado er ON er.id=r.id_estado AND upper(btrim(er.nombre))='ACTIVO'
      WHERE pagada.id IS NOT NULL AND col.id_usuario=CASE WHEN es_pagos THEN usuario ELSE c.id_usuario END
        AND a.fecha_inicio<=(pagada.fecha_efectiva AT TIME ZONE 'America/Lima')::date
        AND (a.fecha_fin IS NULL OR a.fecha_fin>=(pagada.fecha_efectiva AT TIME ZONE 'America/Lima')::date)
        AND (co.codigo='COMISION_REGISTRO_EFECTIVIZACION' OR (es_pagos AND co.codigo='COMISION_AUDITAR_NUEVOS'))
        AND ((NOT es_pagos AND r.configuracion->>'fuente_operacion'='CLIENTE_NUEVO_EFECTIVIZADO_7_DIAS') OR
         (es_pagos AND r.configuracion->>'fuente_operacion'='OPERACION_PAGADA_GESTOR' AND coalesce(pagada.id_usuario_gestor,pagada.id_usuario)=usuario))
        AND (r.id_cargo IS NULL OR r.id_cargo=a.id_cargo) AND (r.id_sucursal IS NULL OR r.id_sucursal=a.id_sucursal)
        AND r.tipo_calculo IN('FIJO','POR_UNIDAD','PORCENTAJE')
        AND (r.valor_minimo IS NULL OR greatest(coalesce(pagada.monto_deposito_cliente,0),0)>=r.valor_minimo)
        AND (r.valor_maximo IS NULL OR greatest(coalesce(pagada.monto_deposito_cliente,0),0)<=r.valor_maximo)
      ORDER BY ((r.id_cargo IS NOT NULL)::integer+(r.id_sucursal IS NOT NULL)::integer) DESC,r.prioridad DESC,r.id DESC
      LIMIT 1
    ) bono ON true
    WHERE c.id=p_cliente AND c.id_usuario=usuario
  ) SELECT to_jsonb(c) INTO resultado FROM clientes c;
 RETURN resultado;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_captacion_fuente_concepto(p_cliente bigint, p_colaborador bigint, p_concepto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE j jsonb;
BEGIN
 IF p_concepto='COMISION_REGISTRO_EFECTIVIZACION' THEN RETURN public.f_private_compensacion_captacion_fuente(p_cliente,p_colaborador); END IF;
 IF p_concepto IS DISTINCT FROM 'COMISION_TIKTOK_LIVE' THEN RAISE EXCEPTION 'Concepto de captacion invalido'; END IF;
 SELECT x INTO j FROM public.f_private_compensacion_tiktok_clientes(p_colaborador) x WHERE (x->>'id')::bigint=p_cliente;
 RETURN j||jsonb_build_object('concepto_codigo',p_concepto,'canal','TIKTOK_LIVE');
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_captacion_huella(j jsonb)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT md5(jsonb_build_object('cliente',j->'id','documento',j->'documento','nombre',j->'nombre',
 'registro',j->'fecha_registro','canal',j->'canal','operacion',j->'id_operacion',
 'pago',j->'fecha_efectiva','monto',j->'monto','regla',j->'id_regla','importe',j->'ganancia',
 'parametros',(SELECT to_jsonb(r) FROM public.tb_compensacion_regla r WHERE r.id=(j->>'id_regla')::bigint),
 'evidencias',CASE WHEN j->>'concepto_codigo'='COMISION_TIKTOK_LIVE' THEN (SELECT jsonb_agg(jsonb_build_object('id',e.id,'estado',e.estado_evento,'evidencia',e.evidencia) ORDER BY e.id)
  FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_referencia ref ON ref.id_evento=e.id
  WHERE ref.id_cliente=(j->>'id')::bigint AND e.datos->>'flujo'='TIKTOK_CLIENTE_NUEVO_7_DIAS') ELSE NULL END)::text);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_captacion_linea_aprobada(linea jsonb, p_colaborador bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE fuente jsonb; revision jsonb; cliente bigint;
BEGIN
 IF linea#>>'{datos_origen,fuente_operacion}' IS DISTINCT FROM 'CLIENTE_NUEVO_EFECTIVIZADO_7_DIAS' AND linea->>'concepto_codigo' IS DISTINCT FROM 'COMISION_TIKTOK_LIVE' THEN RETURN true; END IF;
 cliente:=coalesce(linea#>>'{datos_origen,id_cliente}',linea#>>'{datos_origen,id}')::bigint;
 fuente:=public.f_private_compensacion_captacion_fuente_concepto(cliente,p_colaborador,linea->>'concepto_codigo');
 IF fuente IS NULL THEN RETURN false; END IF;
 revision:=public.f_private_compensacion_captacion_revision(fuente||jsonb_build_object('id_colaborador',p_colaborador));
 RETURN revision->>'estado_aprobacion'='APROBADO' AND fuente->>'id_operacion'=linea->>'id_operacion' AND fuente->>'id_regla'=linea->>'id_regla' AND (fuente->>'ganancia')::numeric=(linea->>'importe')::numeric;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_captacion_revision(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE r public.tb_compensacion_captacion_revision%ROWTYPE; u public.tb_usuario%ROWTYPE;
 h text; estado text; elegible boolean; protegido boolean; propio boolean; permiso boolean; periodo_pago date;
BEGIN
 h:=public.f_private_compensacion_captacion_huella(j);
 SELECT * INTO r FROM public.tb_compensacion_captacion_revision WHERE id_cliente=(j->>'id')::bigint AND id_colaborador=(j->>'id_colaborador')::bigint AND concepto_codigo=coalesce(j->>'concepto_codigo','COMISION_REGISTRO_EFECTIVIZACION') ORDER BY id DESC LIMIT 1;
 SELECT * INTO u FROM public.tb_usuario WHERE auth_user_id=auth.uid();
 elegible:=j->>'estado'='BONO_HABILITADO' AND (j->>'ganancia')::numeric>0
  AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada WHERE id_operacion_proceso=(j->>'id_operacion')::bigint)
  AND coalesce((public.f_private_compensacion_cliente_nuevo_operacion_estado((j->>'id_operacion')::bigint)->>'pagada')::boolean,false);
 estado:=CASE WHEN NOT coalesce(elegible,false) THEN 'NO_ELEGIBLE' WHEN r.id IS NULL THEN 'PENDIENTE_APROBACION'
  WHEN r.huella IS DISTINCT FROM h THEN 'REQUIERE_REVISION' ELSE r.decision END;
 periodo_pago:=date_trunc('month',(j->>'fecha_efectiva')::timestamptz AT TIME ZONE 'America/Lima')::date;
 protegido:=EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=periodo_pago AND estado_periodo IN('APROBADO','CERRADO')) OR EXISTS(SELECT 1 FROM public.tb_compensacion_reporte_mes rm JOIN public.tb_compensacion_periodo rp ON rp.id=rm.id_periodo WHERE rp.periodo=periodo_pago AND rm.estado='CONFIRMADO');
 propio:=EXISTS(SELECT 1 FROM public.tb_cliente WHERE id=(j->>'id')::bigint AND id_usuario=u.id)
  OR EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador WHERE id=(j->>'id_colaborador')::bigint AND id_usuario=u.id);
 permiso:=coalesce(u.flag_super_admin,false) OR u.id_rol=1 AND EXISTS(
  SELECT 1 FROM jsonb_array_elements_text(public.f_get_tb_navegacion_x_usuario(u.id)->'rutas_permitidas') x
  WHERE x=CASE WHEN j->>'concepto_codigo'='COMISION_TIKTOK_LIVE' THEN '/compensaciones/otros-bonos/tiktok_live' ELSE '/compensaciones/atenciones' END);
 RETURN jsonb_build_object('concepto_codigo',coalesce(j->>'concepto_codigo','COMISION_REGISTRO_EFECTIVIZACION'),'estado_aprobacion',estado,'comision_propuesta',j->'ganancia',
  'ganancia',CASE WHEN estado='APROBADO' THEN (j->>'ganancia')::numeric ELSE 0 END,
  'revision_version',md5(h||coalesce(r.id::text,'')),'motivo_revision',r.motivo,'fecha_revision',r.fecha_revision,
  'revisado_por',(SELECT nombre FROM public.tb_usuario WHERE id=r.id_usuario_revisa),
  'puede_resolver',coalesce(permiso AND NOT propio AND NOT protegido AND elegible AND estado IN('PENDIENTE_APROBACION','REQUIERE_REVISION'),false),
  'bloqueo_revision',CASE WHEN propio THEN 'Requiere un revisor independiente' WHEN protegido THEN 'Periodo o sueldo consolidado: requiere ajuste auditado' WHEN NOT coalesce(elegible,false) THEN 'Primero debe cumplir pago, plazo y regla vigente' ELSE '' END);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_caza_errores_sin_evidencia(p_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento e
    WHERE e.id=p_id AND e.datos->>'flujo'='CAZA_ERRORES_V1'
      AND EXISTS (
        SELECT 1 FROM public.tb_compensacion_evento o
        WHERE o.datos->>'flujo'='CAZA_ERRORES_V1'
          AND o.datos->>'ruta_captura' IN (
            '/compensaciones/mal-flujo-safetypay','/compensaciones/conversacion-al-aire','/compensaciones/error-registro-codigo',
            '/compensaciones/auditoria-activa/mal-flujo-safetypay',
            '/compensaciones/auditoria-activa/conversacion-proceso',
            '/compensaciones/auditoria-activa/error-registro'
          ) AND (o.id=e.id OR EXISTS (
            SELECT 1 FROM public.tb_compensacion_caza_errores_vinculo v
            WHERE v.id_evento_origen=o.id AND v.id_evento_consecuencia=e.id
          ))
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_chat_dni_actor()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE u record; col bigint;
BEGIN
  SELECT us.id,us.id_rol,coalesce(us.flag_super_admin,false) sa INTO u FROM public.tb_usuario us
  JOIN public.tb_estado e ON e.id=us.id_estado AND upper(btrim(e.nombre))='ACTIVO' WHERE us.auth_user_id=auth.uid();
  IF u.id IS NULL THEN RAISE EXCEPTION 'Usuario no autorizado'; END IF;
  IF u.id_rol=1 OR u.sa THEN RETURN jsonb_build_object('id_usuario',u.id,'admin',true,'id_colaborador',NULL); END IF;
  IF u.id_rol<>4 THEN RAISE EXCEPTION 'Solo atención al cliente o administración'; END IF;
  SELECT c.id INTO col FROM public.tb_compensacion_colaborador c
  JOIN public.tb_estado ec ON ec.id=c.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
  WHERE c.id_usuario=u.id AND EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion a
    JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='ATENCION_CLIENTE'
    JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
    WHERE a.id_colaborador=c.id AND a.fecha_inicio<=(now() AT TIME ZONE 'America/Lima')::date
      AND (a.fecha_fin IS NULL OR a.fecha_fin>=(now() AT TIME ZONE 'America/Lima')::date))
  ORDER BY c.id LIMIT 1;
  IF col IS NULL THEN RAISE EXCEPTION 'No tienes una asignación vigente de atención al cliente'; END IF;
  RETURN jsonb_build_object('id_usuario',u.id,'admin',false,'id_colaborador',col);
END $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_chat_dni_editable(p_mes date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('PANCAKE:'||p_mes::text,0));
  PERFORM public.f_private_compensacion_pancake_abierto(p_mes);
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_pancake_mes WHERE periodo=p_mes) THEN
    RAISE EXCEPTION 'Este mes usa la fuente Pancake; el registro por DNI no aplica'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_chat_dni_mes WHERE periodo=p_mes) THEN
    RAISE EXCEPTION 'El mes ya fue certificado por administración'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_mes_adjudicacion WHERE periodo=p_mes AND criterio='ATENCIONES') THEN
    RAISE EXCEPTION 'El Colaborador del Mes por atenciones de este mes ya fue adjudicado'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_cliente_nuevo_operacion_estado(p_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 WITH datos AS (
   SELECT o.*,r.id raiz,r.nombre_estado estado_raiz,r.fecha_pagado fecha_pago_raiz,
     upper(regexp_replace(btrim(coalesce(o.tipo_servicio,'')),'[^a-zA-Z0-9]+','_','g')) servicio,
     upper(btrim(coalesce(o.tipo_flujo_pago_deuda,''))) flujo,
     upper(regexp_replace(btrim(coalesce(o.tipo_servicio,'')),'[^a-zA-Z0-9]+','_','g')) IN('PAGO_DEUDA','PAGO_DE_DEUDA') deuda
   FROM public.tb_operacion_proceso o
   JOIN public.tb_operacion_proceso r ON r.id=coalesce(o.id_operacion_padre,o.id)
   WHERE o.id=p_id
 ), candidata AS (
   SELECT d.*,
     servicio IN('EFECTIVIZACION','POS','LINKPAGO','LINK_PAGO','LINK_WEB','PAGO_DEUDA','PAGO_DE_DEUDA')
     AND flujo NOT IN('RETORNO','RETORNO_DIRECTO')
     AND CASE WHEN deuda THEN id=coalesce((SELECT max(b.id) FROM public.tb_operacion_proceso b
         WHERE b.id_operacion_padre=d.raiz AND upper(btrim(coalesce(b.tipo_flujo_pago_deuda,'')))='BANCO'),raiz)
       ELSE id=(SELECT f.id FROM public.tb_operacion_proceso f WHERE f.id=d.raiz OR f.id_operacion_padre=d.raiz
         ORDER BY (f.id_operacion_padre IS NOT NULL) DESC,f.id DESC LIMIT 1) END
     AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada e WHERE e.id_operacion_proceso IN(d.id,d.raiz)) es_final
   FROM datos d
 ), resultado AS (
   SELECT c.*,es_final AND upper(btrim(coalesce(nombre_estado,'')))='PAGADO'
     AND fecha_pagado IS NOT NULL
     AND (NOT deuda OR (flujo='BANCO' AND fecha_pago_raiz IS NOT NULL
       AND upper(btrim(coalesce(estado_raiz,'')))='PAGADO'
       AND coalesce(resultado_comision_servicio,0)>0
       AND (SELECT coalesce(sum(m.monto_ingreso),0) FROM public.tb_operacion_caja m
         WHERE m.id_operacion_proceso=c.raiz AND upper(btrim(m.tipo_origen))='PAGO_DEUDA_COMISION'
           AND upper(btrim(m.tipo_movimiento))='INGRESO' AND m.monto_ingreso>0
           AND m.fecha_registro IS NOT NULL)>=resultado_comision_servicio
       AND EXISTS(SELECT 1 FROM public.tb_operacion_caja m
         WHERE m.id_operacion_proceso=c.raiz AND upper(btrim(m.tipo_origen))='PAGO_DEUDA_COMISION'
           AND upper(btrim(m.tipo_movimiento))='INGRESO' AND m.monto_ingreso>0
           AND m.fecha_registro IS NOT NULL))) pagada
   FROM candidata c
 )
 SELECT jsonb_build_object('es_final',es_final,'pagada',pagada,
   'fecha_pago',CASE WHEN NOT pagada THEN NULL WHEN deuda THEN greatest(fecha_pagado,fecha_pago_raiz,
     (SELECT max(m.fecha_registro) FROM public.tb_operacion_caja m WHERE m.id_operacion_proceso=resultado.raiz
       AND upper(btrim(m.tipo_origen))='PAGO_DEUDA_COMISION' AND upper(btrim(m.tipo_movimiento))='INGRESO' AND m.monto_ingreso>0))
     ELSE fecha_pagado END,
   'estado',CASE WHEN pagada THEN 'Pagado' WHEN deuda AND upper(btrim(coalesce(nombre_estado,'')))='PAGADO'
     THEN 'Pendiente comisión' ELSE coalesce(nullif(nombre_estado,''),'Pendiente') END)
 FROM resultado;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_cliente_nuevo_usuario()
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM public.tb_usuario WHERE auth_user_id=auth.uid() AND id_rol=6 AND NOT coalesce(flag_super_admin,false)) THEN
    ctx:=public.f_private_compensacion_contexto('BONO:TIKTOK_LIVE','REGISTRAR');
    RETURN (ctx->>'id_usuario')::bigint;
  END IF;
  ctx:=public.f_private_compensacion_atencion_contexto();
  -- 44 valida sesion y permiso de Atenciones; aqui se limita el perfil de
  -- captura y se exige colaborador activo tambien para los consumidores 56/58.
  IF NOT coalesce((ctx->>'puede_registrar')::boolean,false) OR coalesce((ctx->>'es_admin')::boolean,false)
    OR NOT EXISTS (
      SELECT 1 FROM public.tb_usuario u
      JOIN public.tb_estado eu ON eu.id=u.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
      JOIN public.tb_compensacion_colaborador c ON c.id_usuario=u.id
      JOIN public.tb_estado ec ON ec.id=c.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
      WHERE u.id=(ctx->>'id_usuario')::bigint AND u.auth_user_id=auth.uid()
        AND NOT coalesce(u.flag_super_admin,false)
        AND (u.id_rol IN(2,4) OR (u.id_rol=3 AND EXISTS (
          SELECT 1 FROM public.tb_compensacion_asignacion a
          JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
          JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='JEFE_TIENDA'
          JOIN public.tb_estado ect ON ect.id=ca.id_estado AND upper(btrim(ect.nombre))='ACTIVO'
          WHERE a.id_colaborador=c.id
            AND (now() AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)
        )))
    ) THEN
    RAISE EXCEPTION 'Registro exclusivo de ATC o Jefe de Tienda con colaborador activo'; END IF;
  RETURN (ctx->>'id_usuario')::bigint;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_configuracion_tramos(p_id_plan bigint)
 RETURNS TABLE(id bigint, numero_version integer, fecha_inicio date, fecha_fin date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH guardados AS (
    SELECT DISTINCT ON (ce.fecha_desde) ce.*
    FROM public.tb_compensacion_configuracion_efectiva ce
    WHERE ce.id_plan = p_id_plan
    ORDER BY ce.fecha_desde, ce.id DESC
  ), limites AS (
    SELECT g.*, lead(g.fecha_desde) OVER (ORDER BY g.fecha_desde) - 1 AS hasta
    FROM guardados g
  ), primero AS (SELECT min(fecha_desde) AS desde FROM guardados)
  SELECT l.id_plan_version_origen, pv.numero_version, l.fecha_desde, l.hasta
  FROM limites l JOIN public.tb_compensacion_plan_version pv ON pv.id = l.id_plan_version_origen
  UNION ALL
  SELECT pv.id, pv.numero_version, pv.fecha_inicio,
    CASE WHEN pr.desde IS NULL THEN pv.fecha_fin
         ELSE LEAST(COALESCE(pv.fecha_fin, pr.desde - 1), pr.desde - 1) END
  FROM public.tb_compensacion_plan_version pv CROSS JOIN primero pr
  WHERE pv.id_plan = p_id_plan AND pv.estado_version = 'PUBLICADA'
    AND (pr.desde IS NULL OR pv.fecha_inicio < pr.desde);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_contexto(p_recurso character varying, p_accion character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_actor public.tb_usuario%ROWTYPE;
  v_id_colaborador bigint;
  v_es_super_admin boolean := false;
  v_permitido boolean := false;
  v_ruta text;
  v_jefe boolean;
  v_alias_atc boolean := false;
  v_capacidades jsonb;
  v_es_evidencia boolean;
  v_recurso character varying := UPPER(TRIM(COALESCE(p_recurso, '')));
  v_accion character varying := UPPER(TRIM(COALESCE(p_accion, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesion autenticada';
  END IF;

  SELECT u.*
  INTO v_actor
  FROM public.tb_usuario u
  JOIN public.tb_estado e ON e.id = u.id_estado
  WHERE u.auth_user_id = auth.uid()
    AND UPPER(e.nombre) = 'ACTIVO'
  LIMIT 1;

  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION 'El usuario autenticado no tiene un perfil operativo activo';
  END IF;

  SELECT c.id
  INTO v_id_colaborador
  FROM public.tb_compensacion_colaborador c
  JOIN public.tb_estado e ON e.id = c.id_estado
  WHERE c.id_usuario = v_actor.id
    AND UPPER(e.nombre) = 'ACTIVO'
  LIMIT 1;

  -- Mantener la misma semantica administrativa del sistema actual:
  -- el rol Administrador (id_rol = 1) tambien tiene alcance global aunque
  -- su flag_super_admin no haya sido marcado de forma individual.
  v_es_super_admin := COALESCE(v_actor.flag_super_admin, false)
    OR v_actor.id_rol = 1;
  v_es_evidencia := v_recurso IN ('EVIDENCIAS','CATALOGO_EVIDENCIAS','LLAMADAS','REFERIDOS','CALIFICACIONES','TARJETAS','AUDITORIA')
    OR (v_recurso LIKE 'BONO:%' AND EXISTS (
      SELECT 1 FROM public.tb_compensacion_evento_tipo t
      JOIN public.tb_estado e ON e.id=t.id_estado AND upper(btrim(e.nombre))='ACTIVO'
      WHERE t.categoria='OTRO' AND t.codigo=substring(v_recurso FROM 6) AND t.codigo<>'META_AREA'));
  IF (v_recurso NOT IN('RESUMEN','MIS_BONOS','COLABORADORES','ASISTENCIA','INCIDENCIAS','LIQUIDACIONES','CIERRES','CONFIGURACION','REPORTES') AND NOT v_es_evidencia)
    OR v_accion NOT IN('CONSULTAR','REGISTRAR','EDITAR','REVISAR','APROBAR','PAGAR','CERRAR','CONFIGURAR') THEN
    RAISE EXCEPTION 'Recurso o acción de compensaciones inválido';
  END IF;
  IF NOT v_es_super_admin AND v_actor.id_rol=3 AND v_actor.id_sucursal IS NULL THEN
    RAISE EXCEPTION 'El jefe de sede debe tener una sede asignada';
  END IF;

  -- Bloque 2: el rol administrativo no sustituye la asignacion del modulo.
  IF v_es_super_admin AND NOT coalesce(v_actor.flag_super_admin,false) AND (v_recurso IN('COLABORADORES','CONFIGURACION','ASISTENCIA','EVIDENCIAS','CATALOGO_EVIDENCIAS','LLAMADAS','REFERIDOS','CALIFICACIONES','TARJETAS','AUDITORIA','INCIDENCIAS') OR v_recurso LIKE 'BONO:%') THEN
    v_ruta:=CASE v_recurso WHEN 'COLABORADORES' THEN '/compensaciones/colaboradores' WHEN 'CONFIGURACION' THEN '/compensaciones/configuracion'
      WHEN 'INCIDENCIAS' THEN '/compensaciones/incidencias' WHEN 'ASISTENCIA' THEN '/compensaciones/asistencia' WHEN 'LLAMADAS' THEN '/compensaciones/llamadas' WHEN 'REFERIDOS' THEN '/compensaciones/referidos'
      WHEN 'CALIFICACIONES' THEN '/compensaciones/calificaciones' WHEN 'TARJETAS' THEN '/compensaciones/tarjetas-erroneas' WHEN 'AUDITORIA' THEN '/compensaciones/auditoria-activa'
      WHEN 'EVIDENCIAS' THEN '/compensaciones/evidencias' WHEN 'CATALOGO_EVIDENCIAS' THEN '/compensaciones/evidencias'
      ELSE '/compensaciones/otros-bonos/'||lower(substring(v_recurso FROM 6)) END;
    IF v_recurso='BONO:CUADRE_PERFECTO' THEN v_ruta:='/compensaciones/auditoria-activa'; END IF;
    IF v_recurso='BONO:RECUPERACION_CLIENTE' AND EXISTS(SELECT 1 FROM public.tb_permiso_usuario pu JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
      JOIN public.tb_estado eu ON eu.id=pu.id_estado AND upper(btrim(eu.nombre))='ACTIVO' JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
      WHERE pu.id_usuario=v_actor.id AND pm.ruta='/compensaciones/otros-bonos/video_viral') THEN v_ruta:='/compensaciones/otros-bonos/video_viral'; END IF;
    IF v_recurso='CATALOGO_EVIDENCIAS' AND v_accion='CONSULTAR' THEN
      SELECT pm.ruta INTO v_ruta FROM public.tb_permiso_usuario pu JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
      JOIN public.tb_estado eu ON eu.id=pu.id_estado AND upper(btrim(eu.nombre))='ACTIVO' JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
      WHERE pu.id_usuario=v_actor.id AND (pm.ruta IN('/compensaciones/evidencias','/compensaciones/calificaciones','/compensaciones/llamadas','/compensaciones/referidos','/compensaciones/tarjetas-erroneas') OR pm.ruta LIKE '/compensaciones/otros-bonos/%') ORDER BY pm.id LIMIT 1;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.tb_permiso_usuario pu JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
      JOIN public.tb_estado eu ON eu.id=pu.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
      JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
      WHERE pu.id_usuario=v_actor.id AND pm.ruta=v_ruta) THEN RAISE EXCEPTION 'No tiene acceso administrativo a la opcion %',v_ruta; END IF;
  END IF;
  -- SQL98: exact menu permission also for administrative salaries/closing.
  IF v_es_super_admin AND NOT coalesce(v_actor.flag_super_admin,false)
     AND v_recurso IN('LIQUIDACIONES','CIERRES') THEN
    v_ruta:=CASE v_recurso WHEN 'LIQUIDACIONES' THEN '/compensaciones/liquidaciones' ELSE '/compensaciones/cierres' END;
    IF NOT EXISTS(SELECT 1 FROM public.tb_permiso_usuario pu
      JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
      JOIN public.tb_estado eu ON eu.id=pu.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
      JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
      WHERE pu.id_usuario=v_actor.id AND pm.ruta=v_ruta) THEN
      RAISE EXCEPTION 'No tiene acceso administrativo a la opcion %',v_ruta;
    END IF;
  END IF;
  IF v_es_super_admin THEN
    RETURN jsonb_build_object(
      'id_usuario', v_actor.id,
      'id_sucursal_usuario', v_actor.id_sucursal,
      'id_colaborador', v_id_colaborador,
      'es_super_admin', true,
      'recurso', v_recurso,
      'accion', v_accion,
      'alcance', 'GLOBAL',
      'id_sucursal_alcance', NULL,
      'puede_consultar',true,'puede_registrar',true,'puede_editar',true,
      'puede_revisar',true,'puede_aprobar',true,'puede_pagar',true,'puede_cerrar',true,'puede_configurar',true
    );
  END IF;

  IF v_actor.id_rol=6 THEN
    PERFORM public.f_private_compensacion_marketing_perfil(v_id_colaborador);
    IF v_recurso NOT IN('RESUMEN','MIS_BONOS','ASISTENCIA','CATALOGO_EVIDENCIAS','REFERIDOS','BONO:BONO_PUNTUALIDAD','BONO:TIKTOK_LIVE','BONO:PROPUESTA_INNOVACION','BONO:VIDEO_VIRAL','BONO:RECUPERACION_CLIENTE','BONO:ALERTA_TEMPRANA') OR v_accion NOT IN('CONSULTAR','REGISTRAR','EDITAR') THEN
      RAISE EXCEPTION 'Marketing: capturas propias con revision independiente';
    END IF;
  END IF;
  IF v_actor.id_rol=2 THEN
    PERFORM public.f_private_compensacion_pagos_perfil(v_id_colaborador);
    IF v_recurso NOT IN('RESUMEN','MIS_BONOS','ASISTENCIA','CATALOGO_EVIDENCIAS','REFERIDOS','CALIFICACIONES','AUDITORIA',
      'BONO:BONO_PUNTUALIDAD','BONO:TIKTOK_LIVE','BONO:PROPUESTA_INNOVACION','BONO:REPORTE_ABANDONO') OR
      v_accion NOT IN('CONSULTAR','REGISTRAR','EDITAR') THEN
      RAISE EXCEPTION 'Pagos: captura y consulta propias, sin gestion administrativa';
    END IF;
  END IF;
  IF v_recurso='LIQUIDACIONES' THEN RAISE EXCEPTION 'Liquidaciones es exclusiva de administracion'; END IF;
  IF v_actor.id_rol=3 AND v_recurso IN('CIERRES','CONFIGURACION','REPORTES') THEN
    RAISE EXCEPTION 'La administracion de planillas, cierres y configuracion no corresponde a Jefatura';
  END IF;
  v_ruta := CASE v_recurso
    WHEN 'RESUMEN' THEN '/compensaciones/resumen'
    WHEN 'MIS_BONOS' THEN '/compensaciones/mis-bonos-descuentos'
    WHEN 'COLABORADORES' THEN '/compensaciones/colaboradores'
    WHEN 'ASISTENCIA' THEN '/compensaciones/asistencia'
    WHEN 'EVIDENCIAS' THEN '/compensaciones/evidencias'
    WHEN 'CATALOGO_EVIDENCIAS' THEN '/compensaciones/evidencias'
    WHEN 'LLAMADAS' THEN '/compensaciones/llamadas'
    WHEN 'REFERIDOS' THEN '/compensaciones/referidos'
    WHEN 'CALIFICACIONES' THEN '/compensaciones/calificaciones'
    WHEN 'TARJETAS' THEN '/compensaciones/tarjetas-erroneas'
    WHEN 'INCIDENCIAS' THEN '/compensaciones/incidencias'
    WHEN 'AUDITORIA' THEN '/compensaciones/auditoria-activa'
    WHEN 'LIQUIDACIONES' THEN '/compensaciones/liquidaciones'
    WHEN 'CIERRES' THEN '/compensaciones/cierres'
    WHEN 'CONFIGURACION' THEN '/compensaciones/configuracion'
    WHEN 'REPORTES' THEN '/compensaciones/reportes'
    ELSE CASE WHEN v_recurso LIKE 'BONO:%' THEN '/compensaciones/otros-bonos/'||lower(substring(v_recurso FROM 6)) END END;
  IF v_actor.id_rol IN(2,6) AND v_recurso='MIS_BONOS' THEN v_ruta:='/compensaciones/resumen'; END IF;
  IF v_actor.id_rol=6 AND v_recurso='BONO:ALERTA_TEMPRANA' THEN v_ruta:='/compensaciones/auditoria-operaciones'; END IF;
  IF v_ruta IS NULL THEN RAISE EXCEPTION 'Recurso de compensaciones inválido: %',v_recurso; END IF;
  -- Alias internos de lectura: la antigua asignacion nunca es autoridad.
  -- Colaboradores y EVIDENCIAS NO son aliases: siguen denegados a ATC.
  IF v_actor.id_rol=4 THEN
    IF v_id_colaborador IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.tb_compensacion_colaborador c
      JOIN public.tb_compensacion_asignacion a ON a.id_colaborador=c.id
      JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
      JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='ATENCION_CLIENTE'
      JOIN public.tb_estado ec ON ec.id=ca.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
      WHERE c.id=v_id_colaborador AND c.fecha_ingreso<=(now() AT TIME ZONE 'America/Lima')::date
        AND (c.fecha_cese IS NULL OR c.fecha_cese>=(now() AT TIME ZONE 'America/Lima')::date)
        AND a.fecha_inicio<=(now() AT TIME ZONE 'America/Lima')::date
        AND (a.fecha_fin IS NULL OR a.fecha_fin>=(now() AT TIME ZONE 'America/Lima')::date)
    ) THEN RAISE EXCEPTION 'ATC requiere colaborador y asignacion vigentes'; END IF;
    v_alias_atc := v_recurso IN ('MIS_BONOS','BONO:BONO_PUNTUALIDAD',
      'BONO:LIDERAZGO_SUBORDINADO','BONO:COLABORADOR_MES_ATENCIONES');
    IF v_alias_atc THEN
      IF v_accion<>'CONSULTAR' THEN RAISE EXCEPTION 'Alias ATC exclusivo de lectura propia'; END IF;
      v_ruta := '/compensaciones/resumen';
    END IF;
    -- La URL legacy LIVE es alias; el recurso conserva captura/edicion propias
    -- con evidencia en Todos los Registros y permiso canonico para toda accion.
    -- ATC_LIVE_OPCION_80: conserva la ruta exacta BONO:TIKTOK_LIVE.
  END IF;
  -- JEFATURA_PDF_110: dependencias internas de lectura y captura Caza-Errores.
  IF v_actor.id_rol=3 THEN
    IF v_recurso='INCIDENCIAS' THEN
      -- Las capturas independientes autorizan el recurso compartido.
      SELECT pm.ruta INTO v_ruta FROM public.tb_permiso_usuario pu
      JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
      JOIN public.tb_estado ep ON ep.id=pu.id_estado AND upper(btrim(ep.nombre))='ACTIVO'
      JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
      WHERE pu.id_usuario=v_actor.id AND pm.ruta IN (
        '/compensaciones/incidencias','/compensaciones/auditoria-activa',
        '/compensaciones/auditoria-operaciones','/compensaciones/indisciplina-colaborador','/compensaciones/penalidad-escalonada-bonos',
        '/compensaciones/mal-flujo-safetypay','/compensaciones/conversacion-al-aire','/compensaciones/error-registro-codigo'
      ) ORDER BY pm.id LIMIT 1;
      IF v_ruta IS NULL THEN RAISE EXCEPTION 'No tiene acceso a las capturas de hallazgos'; END IF;
    END IF;
    IF v_recurso IN('MIS_BONOS','BONO:BONO_PUNTUALIDAD') THEN
      IF v_accion<>'CONSULTAR' THEN RAISE EXCEPTION 'El concepto automatico solo se consulta desde el resumen'; END IF;
      v_ruta:='/compensaciones/resumen';
    END IF;
    IF v_recurso='CATALOGO_EVIDENCIAS' AND v_accion='CONSULTAR' THEN
      SELECT pm.ruta INTO v_ruta FROM public.tb_permiso_usuario pu
      JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
      JOIN public.tb_estado eu ON eu.id=pu.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
      JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
      WHERE pu.id_usuario=v_actor.id AND public.f_private_compensacion_jefatura_ruta_permitida(pm.ruta)
        AND pm.ruta IN('/compensaciones/llamadas','/compensaciones/referidos','/compensaciones/calificaciones',
          '/compensaciones/otros-bonos/tiktok_live','/compensaciones/otros-bonos/propuesta_innovacion') ORDER BY pm.id LIMIT 1;
      IF v_ruta IS NULL THEN RAISE EXCEPTION 'No tiene acceso al catalogo de capturas'; END IF;
    END IF;
  END IF;
  IF v_actor.id_rol=3 AND NOT public.f_private_compensacion_jefatura_ruta_permitida(v_ruta) THEN
    RAISE EXCEPTION 'La opcion no corresponde a las responsabilidades de Jefatura';
  END IF;
  -- PAGOS_184: Auditoria Operaciones es la opcion unica de Pagos para Reporte de Abandono y Error en Datos Manuales.
  IF v_actor.id_rol=2 AND v_recurso IN('AUDITORIA','BONO:REPORTE_ABANDONO') THEN
    v_ruta:='/compensaciones/auditoria-operaciones';
  END IF;
  -- FACTURACION_182: Auditoria Operaciones e Indisciplina Colaborador son las opciones unicas de Facturacion.
  IF v_actor.id_rol=5 THEN
    IF v_recurso='AUDITORIA' THEN v_ruta:='/compensaciones/auditoria-operaciones'; END IF;
    IF v_recurso='INCIDENCIAS' THEN
      SELECT pm.ruta INTO v_ruta FROM public.tb_permiso_usuario pu
      JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
      JOIN public.tb_estado ep ON ep.id=pu.id_estado AND upper(btrim(ep.nombre))='ACTIVO'
      JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
      WHERE pu.id_usuario=v_actor.id AND pm.ruta IN('/compensaciones/auditoria-operaciones','/compensaciones/indisciplina-colaborador')
      ORDER BY pm.id LIMIT 1;
      IF v_ruta IS NULL THEN RAISE EXCEPTION 'No tiene acceso a las incidencias de Facturacion'; END IF;
    END IF;
  END IF;
  IF v_actor.id_rol=5 AND NOT public.f_private_compensacion_facturacion_ruta_permitida(v_ruta) THEN
    RAISE EXCEPTION 'La opcion no corresponde a las responsabilidades de Facturacion';
  END IF;
  -- El catálogo es una dependencia de las capturas específicas, no una entrada
  -- a Todos los Registros. Resolverlo desde una ruta vigente realmente asignada.
  IF v_actor.id_rol IN(2,4,6) AND v_recurso='CATALOGO_EVIDENCIAS' AND v_accion='CONSULTAR' THEN
    SELECT pm.ruta INTO v_ruta FROM public.tb_permiso_usuario pu
    JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
    JOIN public.tb_estado eu ON eu.id=pu.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
    JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
    WHERE pu.id_usuario=v_actor.id AND CASE WHEN v_actor.id_rol=6 THEN public.f_private_compensacion_marketing_ruta_permitida(pm.ruta::text) WHEN v_actor.id_rol=2 THEN public.f_private_compensacion_pagos_ruta_permitida(pm.ruta::text)
        ELSE public.f_private_compensacion_atc_ruta_permitida(pm.ruta::text) END
      AND (pm.ruta IN('/compensaciones/auditoria-activa','/compensaciones/llamadas','/compensaciones/referidos','/compensaciones/calificaciones','/compensaciones/tarjetas-erroneas')
        OR pm.ruta LIKE '/compensaciones/otros-bonos/%')
    ORDER BY pm.id LIMIT 1;
    IF v_ruta IS NULL THEN RAISE EXCEPTION 'No tiene acceso a los catalogos de capturas ATC'; END IF;
  END IF;
  IF v_actor.id_rol=4 AND NOT public.f_private_compensacion_atc_ruta_permitida(v_ruta) THEN
    RAISE EXCEPTION 'La ruta de Compensaciones no corresponde al perfil Atencion al Cliente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tb_permiso_usuario pu
    JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
    JOIN public.tb_estado eu ON eu.id=pu.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
    JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
    WHERE pu.id_usuario=v_actor.id AND (pm.ruta=v_ruta OR (
      v_recurso='CATALOGO_EVIDENCIAS' AND (
        pm.ruta IN('/compensaciones/llamadas','/compensaciones/referidos','/compensaciones/calificaciones','/compensaciones/tarjetas-erroneas')
        OR pm.ruta LIKE '/compensaciones/otros-bonos/%')))
  ) THEN RAISE EXCEPTION 'No tiene acceso a la opción de Sistema: %',v_ruta; END IF;

  -- Sistema controla la entrada al módulo; el perfil controla acciones y alcance.
  -- No se requiere una segunda fila en tb_compensacion_acceso.
  v_jefe := coalesce(v_actor.id_rol=3,false);
  v_capacidades := jsonb_build_object(
    'puede_consultar',true,
    'puede_registrar',v_es_evidencia OR v_recurso IN('ASISTENCIA','INCIDENCIAS'),
    'puede_editar',v_es_evidencia OR v_recurso IN('ASISTENCIA','INCIDENCIAS'),
    'puede_revisar',v_jefe AND (v_es_evidencia OR v_recurso='INCIDENCIAS'),
    'puede_aprobar',v_jefe AND (v_es_evidencia OR v_recurso IN('INCIDENCIAS','ASISTENCIA')),
    'puede_pagar',false,'puede_cerrar',false,'puede_configurar',false);
  IF v_actor.id_rol=3 AND v_recurso IN('INCIDENCIAS','AUDITORIA') THEN
    v_capacidades:=v_capacidades||jsonb_build_object('puede_registrar',true,'puede_editar',true,
      'puede_revisar',false,'puede_aprobar',false);
  END IF;
  IF v_actor.id_rol=4 THEN
    -- Consulta no equivale a registro: premios automaticos, calificaciones y bandeja conjunta son solo lectura.
    v_capacidades := v_capacidades || jsonb_build_object(
      'puede_registrar',v_recurso IN('ASISTENCIA','INCIDENCIAS','LLAMADAS','REFERIDOS','TARJETAS','BONO:PROPUESTA_INNOVACION','BONO:TIKTOK_LIVE'),
      'puede_editar',v_recurso IN('ASISTENCIA','INCIDENCIAS','LLAMADAS','REFERIDOS','TARJETAS','BONO:PROPUESTA_INNOVACION','BONO:TIKTOK_LIVE'),
      'puede_revisar',false,'puede_aprobar',false,'puede_pagar',false,'puede_cerrar',false,'puede_configurar',false
    );
  END IF;
  IF v_alias_atc THEN
    v_capacidades := jsonb_build_object('puede_consultar',true,'puede_registrar',false,
      'puede_editar',false,'puede_revisar',false,'puede_aprobar',false,
      'puede_pagar',false,'puede_cerrar',false,'puede_configurar',false);
  END IF;
  IF v_actor.id_rol=5 THEN
    v_capacidades:=v_capacidades||jsonb_build_object(
      'puede_registrar',v_recurso IN('ASISTENCIA','INCIDENCIAS','REFERIDOS','AUDITORIA','BONO:PROPUESTA_INNOVACION'),
      'puede_editar',v_recurso IN('ASISTENCIA','INCIDENCIAS','REFERIDOS','AUDITORIA','BONO:PROPUESTA_INNOVACION'),
      'puede_revisar',false,'puede_aprobar',false,'puede_pagar',false,'puede_cerrar',false,'puede_configurar',false);
  END IF;
  IF v_actor.id_rol=2 THEN
    v_capacidades:=jsonb_build_object('puede_consultar',true,
      'puede_registrar',v_recurso IN('ASISTENCIA','REFERIDOS','AUDITORIA','BONO:TIKTOK_LIVE','BONO:PROPUESTA_INNOVACION','BONO:REPORTE_ABANDONO'),
      'puede_editar',v_recurso IN('REFERIDOS','BONO:PROPUESTA_INNOVACION'),'puede_revisar',false,'puede_aprobar',false,'puede_pagar',false,'puede_cerrar',false,'puede_configurar',false);
  END IF;
  IF v_actor.id_rol=6 THEN
    v_capacidades:=jsonb_build_object('puede_consultar',true,'puede_registrar',v_recurso IN('ASISTENCIA','REFERIDOS','BONO:TIKTOK_LIVE','BONO:PROPUESTA_INNOVACION','BONO:VIDEO_VIRAL','BONO:RECUPERACION_CLIENTE','BONO:ALERTA_TEMPRANA'),
      'puede_editar',v_recurso IN('REFERIDOS','BONO:PROPUESTA_INNOVACION','BONO:VIDEO_VIRAL','BONO:RECUPERACION_CLIENTE','BONO:ALERTA_TEMPRANA'),'puede_revisar',false,'puede_aprobar',false,'puede_pagar',false,'puede_cerrar',false,'puede_configurar',false);
  END IF;
  v_permitido := coalesce((v_capacidades->>('puede_'||lower(v_accion)))::boolean,false);

  IF NOT COALESCE(v_permitido, false) THEN
    RAISE EXCEPTION
      'No tiene permiso para la accion % en el recurso %',
      v_accion,
      v_recurso;
  END IF;

  RETURN jsonb_build_object(
    'id_usuario', v_actor.id,
    'id_sucursal_usuario', v_actor.id_sucursal,
    'id_colaborador', v_id_colaborador,
    'es_super_admin', false,
    'recurso', v_recurso,
    'accion', v_accion,
    'alcance', CASE WHEN v_jefe AND v_recurso<>'MIS_BONOS' THEN 'SEDE' ELSE 'PROPIO' END,
    'id_sucursal_alcance', CASE WHEN v_jefe AND v_recurso<>'MIS_BONOS' THEN v_actor.id_sucursal END
  ) || v_capacidades;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_dashboard_filtrar(p_datos jsonb, p_mes date, p_estado text DEFAULT NULL::text, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_criterio text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
 SET "TimeZone" TO 'America/Lima'
AS $function$
DECLARE mes date:=date_trunc('month',p_mes)::date; fin date; desde date; hasta date; registros jsonb;
BEGIN
 fin:=(mes+interval '1 month')::date;
 IF p_desde>p_hasta THEN RAISE EXCEPTION 'Desde no puede ser posterior a Hasta'; END IF;
 IF p_estado IS NOT NULL AND p_estado NOT IN('GRUPO_PENDIENTE','GRUPO_APROBADO','GRUPO_RECHAZADO','PENDIENTE','PROVISIONAL','HABILITADO','APROBADA','PAGO_PARCIAL','PAGADA','ESPERANDO_OPERACION','OPERACION_PENDIENTE')
 THEN RAISE EXCEPTION 'Estado de origen invalido'; END IF;
 IF p_criterio IS NOT NULL AND p_criterio NOT IN('ATENCIONES','CALIFICACIONES') THEN RAISE EXCEPTION 'Criterio invalido'; END IF;
 desde:=greatest(mes,coalesce(p_desde,mes)); hasta:=least(fin,coalesce(p_hasta+1,fin));
 SELECT coalesce(jsonb_agg(r ORDER BY r->>'codigo',r->>'clave'),'[]') INTO registros
 FROM jsonb_array_elements(p_datos->'registros') r
 WHERE (p_estado IS NULL OR r->>'estado'=p_estado
        OR (p_estado LIKE 'GRUPO_%' AND public.f_private_compensacion_estado_grupo(r->>'estado',(r->>'pendiente')::boolean)=substr(p_estado,7)))
   AND (p_criterio IS NULL OR (r->>'codigo'='BONO_COLABORADOR_MES' AND r->>'concepto_origen'=
     CASE p_criterio WHEN 'ATENCIONES' THEN 'BONO_COLABORADOR_ATENCIONES' ELSE 'BONO_COLABORADOR_CALIFICACIONES' END))
   AND ((p_desde IS NULL AND p_hasta IS NULL) OR (desde<hasta
   AND (CASE WHEN nullif(r->>'fecha_filtro','') IS NULL THEN desde=mes AND hasta=fin
     WHEN length(r->>'fecha_filtro')=10 THEN (r->>'fecha_filtro')::date>=desde AND (r->>'fecha_filtro')::date<hasta
     ELSE (r->>'fecha_filtro')::timestamptz>=(desde::timestamp AT TIME ZONE 'America/Lima')
       AND (r->>'fecha_filtro')::timestamptz<(hasta::timestamp AT TIME ZONE 'America/Lima') END)));
 RETURN p_datos||jsonb_build_object('registros',registros,'filtros',jsonb_build_object(
   'estado',p_estado,'desde',desde,'hasta_exclusivo',hasta,'criterio',p_criterio,'zona','America/Lima'),
   'nota_fechas','Rango intersectado con el mes de imputación en Lima. Líneas sin fecha diaria verificable solo se incluyen al consultar el mes completo.');
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_descuento_mes_lineas(p_id_periodo bigint, p_colaborador bigint, p_base_comisiones numeric, p_origen text)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  d public.tb_compensacion_descuento_mes%ROWTYPE;
  co public.tb_compensacion_concepto%ROWTYPE;
  mes date;
  total_activo boolean;
  base numeric := greatest(coalesce(p_base_comisiones, 0), 0);
BEGIN
  SELECT periodo INTO mes FROM public.tb_compensacion_periodo WHERE id = p_id_periodo;
  IF mes IS NULL OR p_colaborador IS NULL THEN RETURN; END IF;
  -- El descuento total (100%) prevalece sobre los bloques, sea cual sea su origen.
  SELECT EXISTS (SELECT 1 FROM public.tb_compensacion_descuento_mes x
    WHERE x.id_periodo = p_id_periodo AND x.id_colaborador = p_colaborador AND x.estado = 'ACTIVO' AND x.tipo = 'TOTAL')
    INTO total_activo;
  FOR d IN
    SELECT * FROM public.tb_compensacion_descuento_mes x
    WHERE x.id_periodo = p_id_periodo AND x.id_colaborador = p_colaborador AND x.estado = 'ACTIVO'
      AND x.tipo_origen = p_origen AND (NOT total_activo OR x.tipo = 'TOTAL')
    ORDER BY x.id
  LOOP
    SELECT * INTO co FROM public.tb_compensacion_concepto WHERE id = d.id_concepto;
    RETURN NEXT jsonb_build_object(
      'id_asignacion', NULL, 'id_plan_version', NULL,
      'fecha_inicio_tramo', mes, 'fecha_fin_tramo', (mes + interval '1 month - 1 day')::date,
      'id_concepto', co.id, 'id_regla', NULL, 'tipo_origen', 'DESCUENTO_MES',
      'clave_origen', 'DESCUENTO_MES:' || d.id,
      'id_evento', NULL, 'id_jornada', NULL, 'id_operacion', NULL, 'id_excepcion', NULL,
      'concepto_codigo', co.codigo,
      'concepto_nombre', CASE d.tipo_origen WHEN 'TOLERANCIA_CERO_DIGITAL' THEN 'Tolerancia Cero Digital' ELSE 'Error en cuadro de comisiones' END,
      'categoria', co.categoria, 'naturaleza', 'DESCUENTO',
      'base_calculo', base, 'cantidad', 1, 'tarifa', d.porcentaje,
      'importe', round(base * d.porcentaje / 100, 2),
      'regla_snapshot', jsonb_build_object('tipo', d.tipo, 'tipo_origen', d.tipo_origen, 'porcentaje', d.porcentaje),
      'formula_snapshot', 'Comisiones del mes * porcentaje del descuento aplicado por Administración / 100',
      'datos_origen', jsonb_build_object('id_descuento_mes', d.id, 'tipo', d.tipo, 'tipo_origen', d.tipo_origen,
        'porcentaje', d.porcentaje, 'base_comisiones', base, 'motivo', d.motivo, 'prevalece_total', total_activo));
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_dias_laborables(p_fecha_inicio date, p_fecha_fin date, p_dias_semana smallint[])
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT COUNT(*)::integer
  FROM generate_series(p_fecha_inicio::timestamp, p_fecha_fin::timestamp, INTERVAL '1 day') dia
  WHERE EXTRACT(isodow FROM dia)::smallint = ANY(p_dias_semana);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_dias_programados(p_inicio date, p_fin date, p_dias smallint[], p_excluidos date[])
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT COUNT(*)::integer
  FROM generate_series(p_inicio::timestamp, p_fin::timestamp, INTERVAL '1 day') d
  WHERE EXTRACT(isodow FROM d)::smallint = ANY(p_dias)
    AND NOT (d::date = ANY(COALESCE(p_excluidos, ARRAY[]::date[])));
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_equipo_visible(p_contexto jsonb, p_colaborador bigint, p_fecha date, p_incluir_propio boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH actor AS (
    SELECT u.id,c.id colaborador
    FROM public.tb_usuario u
    LEFT JOIN public.tb_compensacion_colaborador c ON c.id_usuario=u.id
    WHERE u.id=(p_contexto->>'id_usuario')::bigint
      AND u.id_rol=3 AND NOT coalesce(u.flag_super_admin,false)
  ), fecha AS (
    SELECT coalesce(p_fecha,(now() AT TIME ZONE 'America/Lima')::date) dia
  ), asignaciones AS (
    -- Elegir la ultima asignacion vigente antes de comparar sede/cargo: un
    -- traslado o cambio de cargo no debe rescatar una asignacion anterior.
    SELECT DISTINCT ON (a.id_colaborador) a.id_colaborador,a.id_sucursal,a.id_cargo
    FROM public.tb_compensacion_asignacion a
    JOIN public.tb_estado e ON e.id=a.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    CROSS JOIN fecha f
    WHERE f.dia BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)
      AND a.id_colaborador IN ((p_contexto->>'id_colaborador')::bigint,p_colaborador)
    ORDER BY a.id_colaborador,a.fecha_inicio DESC,a.id DESC
  )
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM actor) THEN true ELSE coalesce(
    (coalesce(p_incluir_propio,false) AND p_colaborador=(p_contexto->>'id_colaborador')::bigint)
    OR EXISTS (
      SELECT 1 FROM actor j
      JOIN public.tb_compensacion_colaborador jefe ON jefe.id=j.colaborador
        AND jefe.id=(p_contexto->>'id_colaborador')::bigint
      JOIN public.tb_estado ej ON ej.id=jefe.id_estado AND upper(btrim(ej.nombre))='ACTIVO'
      JOIN public.tb_usuario uj ON uj.id=j.id
      JOIN public.tb_estado euj ON euj.id=uj.id_estado AND upper(btrim(euj.nombre))='ACTIVO'
      JOIN asignaciones aj ON aj.id_colaborador=jefe.id
      JOIN public.tb_compensacion_cargo cj ON cj.id=aj.id_cargo AND cj.codigo='JEFE_TIENDA'
      JOIN public.tb_estado ecj ON ecj.id=cj.id_estado AND upper(btrim(ecj.nombre))='ACTIVO'
      JOIN asignaciones ac ON ac.id_sucursal=aj.id_sucursal AND ac.id_colaborador=p_colaborador
      JOIN public.tb_compensacion_colaborador c ON c.id=ac.id_colaborador AND c.id<>jefe.id
      JOIN public.tb_estado ec ON ec.id=c.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
      JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol NOT IN(1,3) AND NOT coalesce(u.flag_super_admin,false)
      JOIN public.tb_estado eu ON eu.id=u.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
      JOIN public.tb_compensacion_cargo ca ON ca.id=ac.id_cargo AND ca.codigo<>'JEFE_TIENDA'
      JOIN public.tb_estado eca ON eca.id=ca.id_estado AND upper(btrim(eca.nombre))='ACTIVO'
      CROSS JOIN fecha f
      WHERE aj.id_sucursal=(p_contexto->>'id_sucursal_alcance')::bigint
        AND f.dia BETWEEN jefe.fecha_ingreso AND coalesce(jefe.fecha_cese,'infinity'::date)
        AND f.dia BETWEEN c.fecha_ingreso AND coalesce(c.fecha_cese,'infinity'::date)
    ),false) END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_estado_grupo(p_estado text, p_pendiente boolean DEFAULT NULL::boolean)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT CASE
    WHEN p_estado IN ('HABILITADO','APROBADA','APROBADO','PAGO_PARCIAL','PAGADA','ELEGIBLE','BONO_HABILITADO','LIQUIDADO','VALIDADO','APLICADO','CONSERVA') THEN 'APROBADO'
    WHEN p_estado IN ('PROVISIONAL','EN_IMPLEMENTACION') AND p_pendiente IS NOT DISTINCT FROM false THEN 'APROBADO'
    WHEN p_estado IN ('RECHAZADO','RECHAZADA','ANULADO','ANULADA','NO_ELEGIBLE','BLOQUEADO','PERDIDO') THEN 'RECHAZADO'
    ELSE 'PENDIENTE' END
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_evento_contexto(p_id_tipo bigint, p_accion character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_tipo public.tb_compensacion_evento_tipo%ROWTYPE; v_recurso varchar;
BEGIN
  SELECT * INTO v_tipo FROM public.tb_compensacion_evento_tipo WHERE id=p_id_tipo;
  IF v_tipo.id IS NULL THEN RAISE EXCEPTION 'El tipo de evento no existe'; END IF;
  IF v_tipo.codigo IN('DETECCION_ERROR_PAGO','OPERACION_EXTRA') AND p_accion<>'CONSULTAR' THEN
    RAISE EXCEPTION 'Los reportes de Facturacion se gestionan exclusivamente en su auditoria especializada';
  END IF;
  IF EXISTS(SELECT 1 FROM public.tb_usuario u WHERE u.auth_user_id=auth.uid() AND u.id_rol=3 AND NOT coalesce(u.flag_super_admin,false))
    AND v_tipo.codigo NOT IN('BONO_PUNTUALIDAD','PROPUESTA_INNOVACION','SEGURIDAD_TARJETA','META_SEDE_SAFETYPAY',
      'REGISTRO_PRESENCIAL','LIDERAZGO_SUBORDINADO','CALIFICACION_PRESENCIAL','REFERIDO','LLAMADA_CONTACTO','TIKTOK_LIVE','AUDITORIA_ACTIVA') THEN
    RAISE EXCEPTION 'El concepto no corresponde a las responsabilidades de Jefatura';
  END IF;
  IF v_tipo.codigo='LIDERAZGO_SUBORDINADO' AND p_accion<>'CONSULTAR' THEN
    RAISE EXCEPTION 'El bono de liderazgo es automatico; configura el equipo y consulta el mes anterior';
  END IF;
  IF EXISTS(SELECT 1 FROM public.tb_usuario u WHERE u.auth_user_id=auth.uid() AND u.id_rol=5 AND NOT coalesce(u.flag_super_admin,false))
    AND v_tipo.codigo NOT IN('BONO_PUNTUALIDAD','PROPUESTA_INNOVACION','REFERIDO','DETECCION_ERROR_PAGO','OPERACION_EXTRA') THEN
    RAISE EXCEPTION 'El concepto no corresponde al perfil de Facturacion';
  END IF;
  IF EXISTS(SELECT 1 FROM public.tb_usuario u WHERE u.auth_user_id=auth.uid() AND u.id_rol=2 AND NOT coalesce(u.flag_super_admin,false)) THEN
    IF v_tipo.codigo NOT IN('PROPUESTA_INNOVACION','REFERIDO','CALIFICACION_PRESENCIAL','TIKTOK_LIVE','REPORTE_ABANDONO','DETECCION_ERROR_MANUAL','CUADRE_PERFECTO') THEN
      RAISE EXCEPTION 'El concepto no corresponde al perfil de Pagos'; END IF;
    IF v_tipo.codigo='CUADRE_PERFECTO' AND p_accion<>'CONSULTAR' THEN
      RAISE EXCEPTION 'El cuadre perfecto lo registra Administracion'; END IF;
    IF v_tipo.codigo IN('REPORTE_ABANDONO','DETECCION_ERROR_MANUAL') AND p_accion<>'CONSULTAR' THEN
      RAISE EXCEPTION 'Las detecciones requieren la captura operativa especializada'; END IF;
  END IF;
  IF v_tipo.codigo IN('VIDEO_VIRAL','RECUPERACION_CLIENTE','ALERTA_TEMPRANA') AND upper(p_accion) IN('REGISTRAR','EDITAR') THEN
    RAISE EXCEPTION 'Utiliza la captura especializada de Marketing'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_usuario WHERE auth_user_id=auth.uid() AND id_rol=6 AND NOT coalesce(flag_super_admin,false)) AND v_tipo.codigo NOT IN('PROPUESTA_INNOVACION','TIKTOK_LIVE','REFERIDO','VIDEO_VIRAL','RECUPERACION_CLIENTE','ALERTA_TEMPRANA') THEN
    RAISE EXCEPTION 'El concepto no corresponde a Marketing'; END IF;
  -- La bandeja conjunta permite abrir el detalle; sus permisos no habilitan escritura.
  IF p_accion='CONSULTAR' THEN
    BEGIN
      RETURN public.f_private_compensacion_contexto('EVIDENCIAS','CONSULTAR');
    EXCEPTION WHEN raise_exception THEN
      NULL;
    END;
  END IF;
  IF v_tipo.categoria='LLAMADA' THEN
    RETURN public.f_private_compensacion_llamada_contexto(p_accion::text);
  END IF;
  v_recurso:=CASE v_tipo.categoria
    WHEN 'LLAMADA' THEN 'LLAMADAS' WHEN 'REFERIDO' THEN 'REFERIDOS'
    WHEN 'CALIFICACION' THEN 'CALIFICACIONES' WHEN 'TARJETA_TERCERO' THEN 'TARJETAS'
    WHEN 'AUDITORIA_PAGO' THEN CASE WHEN v_tipo.codigo IN('AUDITORIA_ACTIVA','DETECCION_ERROR_PAGO','OPERACION_EXTRA','DETECCION_ERROR_MANUAL','CUADRE_PERFECTO') THEN 'AUDITORIA' ELSE 'INCIDENCIAS' END
    WHEN 'OTRO' THEN 'BONO:'||v_tipo.codigo ELSE 'EVIDENCIAS' END;
  RETURN public.f_private_compensacion_contexto(v_recurso,p_accion);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_evento_tarifa_registro(p_id_tipo_evento bigint, p_id_colaborador bigint, p_fecha timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_fecha date := (p_fecha AT TIME ZONE 'America/Lima')::date;
  v_asignacion public.tb_compensacion_asignacion%ROWTYPE;
  v_regla public.tb_compensacion_regla%ROWTYPE;
  v_concepto bigint;
BEGIN
  SELECT id_concepto INTO v_concepto
  FROM public.tb_compensacion_evento_tipo WHERE id = p_id_tipo_evento;
  SELECT a.* INTO v_asignacion
  FROM public.tb_compensacion_asignacion a
  JOIN public.tb_estado es ON es.id = a.id_estado AND UPPER(es.nombre) = 'ACTIVO'
  WHERE a.id_colaborador = p_id_colaborador
    AND a.fecha_inicio <= v_fecha AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_fecha)
  ORDER BY a.fecha_inicio DESC, a.id DESC LIMIT 1;
  SELECT r.* INTO v_regla
  FROM public.f_private_compensacion_reglas_colaborador_fecha(v_asignacion.id_plan, v_fecha, p_id_colaborador) r
  JOIN public.tb_estado es ON es.id = r.id_estado AND UPPER(es.nombre) = 'ACTIVO'
  WHERE r.id_concepto = v_concepto
    AND (r.id_cargo IS NULL OR r.id_cargo = v_asignacion.id_cargo)
    AND (r.id_sucursal IS NULL OR r.id_sucursal = v_asignacion.id_sucursal)
  ORDER BY ((r.id_cargo IS NOT NULL)::integer + (r.id_sucursal IS NOT NULL)::integer) DESC,
    r.prioridad DESC, r.id DESC LIMIT 1;
  IF v_regla.id IS NULL OR v_regla.tipo_calculo = 'FORMULA' THEN
    RAISE EXCEPTION 'No hay una tarifa aplicable para registrar esta evidencia';
  END IF;
  RETURN jsonb_build_object(
    'politica_tarifa', 'REGISTRO_V1',
    'validez_calificacion', (SELECT configuracion->'validez_calificacion' FROM public.tb_compensacion_evento_tipo WHERE id=p_id_tipo_evento),
    'fecha_captura_tarifa', statement_timestamp(),
    'id_tipo_evento_registro', p_id_tipo_evento,
    'id_beneficiario_registro', p_id_colaborador,
    'id_asignacion_registro', v_asignacion.id,
    'regla_registro', to_jsonb(v_regla)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_evento_validar_alcance(p_id_evento bigint, p_accion character varying, p_bloquear boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_evento public.tb_compensacion_evento%ROWTYPE;
  v_contexto jsonb;
  v_alcance character varying;
  v_id_colaborador_actor bigint;
  v_id_sucursal_alcance bigint;
  v_periodo_bloqueado date;
  v_revision_admin jsonb;
BEGIN
  IF coalesce(p_bloquear,false) AND upper(p_accion) IN('APROBAR','REVISAR') AND EXISTS(SELECT 1 FROM public.tb_compensacion_evento WHERE id=p_id_evento AND datos->>'flujo'='MARKETING_CAPTURA_V1')
    AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_periodo p ON p.periodo=e.periodo_imputacion WHERE e.id=p_id_evento) THEN
    RAISE EXCEPTION 'Abre el periodo antes de revisar'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento ev JOIN public.tb_compensacion_evento_tipo t ON t.id=ev.id_tipo_evento
    WHERE ev.id=p_id_evento AND t.codigo IN('ALERTA_TEMPRANA','RECUPERACION_CLIENTE') AND ev.datos->>'flujo'='MARKETING_CAPTURA_V1')
    AND upper(p_accion) IN('APROBAR','REVISAR','CONSULTAR')
    AND EXISTS(SELECT 1 FROM public.tb_usuario WHERE auth_user_id=auth.uid() AND id_rol=3 AND NOT coalesce(flag_super_admin,false)) THEN
    v_contexto:=public.f_private_compensacion_marketing_revisor(p_id_evento,upper(p_accion));
    IF p_bloquear THEN
      SELECT periodo_imputacion INTO v_periodo_bloqueado FROM public.tb_compensacion_evento WHERE id=p_id_evento;
      PERFORM pe.id FROM public.tb_compensacion_periodo pe WHERE pe.periodo=v_periodo_bloqueado ORDER BY pe.id FOR UPDATE;
      PERFORM id FROM public.tb_compensacion_evento WHERE id=p_id_evento FOR UPDATE;
    END IF;
    RETURN v_contexto;
  END IF;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento ev JOIN public.tb_compensacion_evento_tipo t ON t.id=ev.id_tipo_evento
    WHERE ev.id=p_id_evento AND t.categoria='LLAMADA') THEN
    v_contexto:=public.f_private_compensacion_llamada_contexto(p_accion);
  ELSE
    v_contexto := public.f_private_compensacion_evento_contexto(
      (SELECT id_tipo_evento FROM public.tb_compensacion_evento WHERE id=p_id_evento), p_accion);
  END IF;
  IF COALESCE(p_bloquear, false) THEN
    -- Mismo orden que Cierres: periodo antes del evento, evitando inversion de locks.
    SELECT periodo_imputacion INTO v_periodo_bloqueado
    FROM public.tb_compensacion_evento WHERE id=p_id_evento;
    PERFORM pe.id FROM public.tb_compensacion_periodo pe
    WHERE pe.periodo=v_periodo_bloqueado ORDER BY pe.id FOR UPDATE;
    SELECT * INTO v_evento
    FROM public.tb_compensacion_evento
    WHERE id = p_id_evento
    FOR UPDATE;
    IF v_evento.periodo_imputacion IS DISTINCT FROM v_periodo_bloqueado THEN
      RAISE EXCEPTION 'El periodo del evento cambio durante la revision. Intente nuevamente';
    END IF;
  ELSE
    SELECT * INTO v_evento
    FROM public.tb_compensacion_evento
    WHERE id = p_id_evento;
  END IF;

  IF v_evento.id IS NULL THEN
    RAISE EXCEPTION 'El evento de compensacion no existe';
  END IF;

  IF coalesce((v_contexto->>'es_super_admin')::boolean,false) THEN
    v_revision_admin:=public.f_private_compensacion_administracion_revision(p_id_evento);
    IF upper(p_accion)<>'CONSULTAR' AND NOT(v_revision_admin->>'permiso_decision')::boolean THEN RAISE EXCEPTION 'La consulta conjunta no permite decidir sin permiso de la opcion'; END IF;
    IF upper(p_accion)<>'CONSULTAR' AND (v_revision_admin->>'protegido')::boolean THEN RAISE EXCEPTION 'Periodo o sueldo consolidado; corresponde un ajuste auditado'; END IF;
    IF upper(p_accion) IN('APROBAR','REVISAR') AND ((v_revision_admin->>'propio')::boolean OR (v_revision_admin->>'automatico')::boolean) THEN RAISE EXCEPTION '%',v_revision_admin->>'motivo'; END IF;
  END IF;
  IF upper(btrim(p_accion)) IN ('REGISTRAR','APROBAR') AND EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento_tipo t WHERE t.id=v_evento.id_tipo_evento AND t.codigo='BONO_PUNTUALIDAD'
  ) THEN
    RAISE EXCEPTION 'El bono de puntualidad se calcula automaticamente desde Asistencia';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tb_compensacion_evento_tipo
    WHERE id=v_evento.id_tipo_evento AND codigo='PROPUESTA_INNOVACION') THEN
    PERFORM public.f_private_compensacion_innovacion_actor(v_evento, v_contexto, p_accion);
  END IF;

  -- Jefatura revisa la primera operacion del equipo; adicionales y reversas son administrativos.
  -- Se aplica tambien a RPC genericas para impedir saltarse la pantalla especializada.
  IF upper(btrim(p_accion)) IN ('APROBAR','REVISAR')
     AND NOT COALESCE((v_contexto->>'es_super_admin')::boolean,false)
     AND v_evento.datos ? 'id_referido'
     AND EXISTS (SELECT 1 FROM public.tb_compensacion_evento_tipo t
       WHERE t.id=v_evento.id_tipo_evento AND t.categoria='REFERIDO') THEN
    RAISE EXCEPTION 'Las operaciones adicionales del referido requieren Administracion';
  END IF;

  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(
    v_contexto ->> 'id_colaborador',
    ''
  )::bigint;
  v_id_sucursal_alcance := NULLIF(
    v_contexto ->> 'id_sucursal_alcance',
    ''
  )::bigint;

  IF NOT public.f_private_compensacion_equipo_visible(v_contexto,coalesce(v_evento.id_colaborador_beneficiario,v_evento.id_colaborador_responsable),(v_evento.fecha_evento AT TIME ZONE 'America/Lima')::date) THEN
    IF NOT coalesce(v_id_colaborador_actor IN(v_evento.id_colaborador_beneficiario,v_evento.id_colaborador_responsable),false) THEN
      RAISE EXCEPTION 'El registro no pertenece a su equipo vigente';
    END IF;
  END IF;
  IF v_alcance='SEDE' AND upper(btrim(p_accion)) IN('REGISTRAR','EDITAR')
    AND v_evento.id_usuario_registra IS DISTINCT FROM (v_contexto->>'id_usuario')::bigint
    AND v_evento.id_colaborador_beneficiario IS DISTINCT FROM v_id_colaborador_actor THEN
    RAISE EXCEPTION 'Solo puede modificar registros propios; la supervision no concede edicion del equipo';
  END IF;
  IF v_alcance='SEDE' AND upper(btrim(p_accion)) IN('APROBAR','REVISAR') THEN
    IF v_id_colaborador_actor IN(v_evento.id_colaborador_beneficiario,v_evento.id_colaborador_responsable) OR v_evento.id_usuario_registra=(v_contexto->>'id_usuario')::bigint THEN
      RAISE EXCEPTION 'Jefatura no puede resolver ingresos propios ni registros que ella misma creo';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion a
      JOIN public.tb_compensacion_colaborador c ON c.id=a.id_colaborador JOIN public.tb_usuario u ON u.id=c.id_usuario
      WHERE a.id_colaborador=v_evento.id_colaborador_beneficiario AND a.id_sucursal=v_id_sucursal_alcance
        AND u.id_rol=4 AND a.fecha_inicio<=(v_evento.fecha_evento AT TIME ZONE 'America/Lima')::date
        AND (a.fecha_fin IS NULL OR a.fecha_fin>=(v_evento.fecha_evento AT TIME ZONE 'America/Lima')::date)) THEN
      RAISE EXCEPTION 'Jefatura solo puede resolver registros del personal ATC de su sede';
    END IF;
  END IF;

  IF v_alcance = 'PROPIO'
     AND v_id_colaborador_actor IS DISTINCT FROM v_evento.id_colaborador_beneficiario
     AND v_id_colaborador_actor IS DISTINCT FROM v_evento.id_colaborador_responsable THEN
    RAISE EXCEPTION 'Solo puede acceder a sus propios eventos';
  END IF;

  IF v_alcance = 'SEDE'
     AND v_evento.id_sucursal_origen IS DISTINCT FROM v_id_sucursal_alcance
     AND v_evento.id_sucursal_responsable IS DISTINCT FROM v_id_sucursal_alcance
     AND NOT EXISTS (
       SELECT 1
       FROM public.tb_compensacion_asignacion a
       WHERE a.id_colaborador IN (
           v_evento.id_colaborador_beneficiario,
           v_evento.id_colaborador_responsable
         )
         AND a.id_sucursal = v_id_sucursal_alcance
         AND a.fecha_inicio <= v_evento.fecha_evento::date
         AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_evento.fecha_evento::date)
     ) THEN
    RAISE EXCEPTION 'El evento no pertenece a su sede autorizada';
  END IF;

  RETURN v_contexto || jsonb_build_object(
    'id_evento', v_evento.id,
    'estado_evento', v_evento.estado_evento
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_facturacion_auditoria_bloquear(p_id bigint)
 RETURNS tb_compensacion_evento
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE ev public.tb_compensacion_evento%ROWTYPE; mes date;
BEGIN
  SELECT periodo_imputacion INTO mes FROM public.tb_compensacion_evento WHERE id=p_id;
  PERFORM id FROM public.tb_compensacion_periodo WHERE periodo=mes ORDER BY id FOR UPDATE;
  SELECT e.* INTO ev FROM public.tb_compensacion_evento e
  JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
  WHERE e.id=p_id AND e.datos->>'flujo'='FACTURACION_AUDITORIA_V1'
    AND t.categoria='AUDITORIA_PAGO' AND t.codigo IN('DETECCION_ERROR_PAGO','OPERACION_EXTRA') FOR UPDATE OF e;
  IF ev.id IS NULL THEN RAISE EXCEPTION 'Reporte inexistente'; END IF;
  IF ev.periodo_imputacion IS DISTINCT FROM mes THEN RAISE EXCEPTION 'El periodo cambio; vuelve a intentar'; END IF;
  PERFORM public.f_private_compensacion_pagos_periodo_editable(ev.id_colaborador_beneficiario,mes);
  IF ev.estado_evento<>'PENDIENTE' THEN RAISE EXCEPTION 'Solo se modifican reportes pendientes'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=mes AND estado_periodo='CERRADO') THEN
    RAISE EXCEPTION 'El periodo esta cerrado';
  END IF;
  RETURN ev;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_facturacion_auditoria_codigo(p_codigo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT nullif(upper(regexp_replace(btrim(coalesce(p_codigo,'')),'[[:space:]]+','','g')),'');
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_facturacion_auditoria_contexto(p_accion character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; rol bigint; asignacion bigint; admin boolean;
BEGIN
  ctx:=public.f_private_compensacion_contexto('AUDITORIA',p_accion);
  SELECT id_rol INTO rol FROM public.tb_usuario WHERE id=(ctx->>'id_usuario')::bigint;
  admin:=rol=1 OR coalesce((ctx->>'es_super_admin')::boolean,false);
  IF admin THEN
    IF ctx->>'alcance'<>'GLOBAL' THEN RAISE EXCEPTION 'Administracion requiere alcance global'; END IF;
  ELSE
    IF rol IS DISTINCT FROM 5 OR ctx->>'alcance' IS DISTINCT FROM 'PROPIO'
      OR p_accion NOT IN('CONSULTAR','REGISTRAR','EDITAR') THEN
      RAISE EXCEPTION 'Solo Facturacion registra sus reportes; solo administracion los revisa';
    END IF;
    SELECT a.id INTO asignacion FROM public.tb_compensacion_asignacion a
    JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='FACTURACION'
    JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
    JOIN public.tb_estado ec ON ec.id=ca.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
    WHERE a.id_colaborador=(ctx->>'id_colaborador')::bigint
      AND a.fecha_inicio<=(statement_timestamp() AT TIME ZONE 'America/Lima')::date
      AND (a.fecha_fin IS NULL OR a.fecha_fin>=(statement_timestamp() AT TIME ZONE 'America/Lima')::date)
    ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1;
    IF asignacion IS NULL THEN RAISE EXCEPTION 'Facturacion requiere una asignacion vigente y activa'; END IF;
  END IF;
  RETURN ctx||jsonb_build_object('es_admin',admin,'puede_registrar',rol=5 AND NOT admin,'id_asignacion',asignacion);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_facturacion_auditoria_detalles(p_id_periodo bigint, p_id_colaborador bigint)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT jsonb_build_object('id_asignacion',NULL,
    'id_plan_version',NULL,
    'fecha_inicio_tramo',NULL,'fecha_fin_tramo',NULL,'id_concepto',c.id,'id_regla',e.id_regla_aplicada,
    'tipo_origen','EVENTO','clave_origen','EVENTO:'||e.id,'id_evento',e.id,'id_jornada',NULL,
    'id_operacion',(e.datos->'operacion'->>'id')::bigint,'id_excepcion',NULL,
    'concepto_codigo',c.codigo,'concepto_nombre',c.nombre,'categoria',c.categoria,'naturaleza',c.naturaleza,
    'regla_snapshot',e.criterios_validacion_snapshot,'formula_snapshot','importe aprobado del evento',
    'base_calculo',e.base_calculo,'cantidad',e.cantidad,'tarifa',e.tarifa_aplicada,'importe',e.importe_aprobado,
    'datos_origen',jsonb_build_object('id_evento',e.id,'tipo_evento',t.codigo,'categoria_evento',t.categoria,
      'fecha_evento',e.fecha_evento,'id_asignacion_registro',e.criterios_validacion_snapshot->'id_asignacion_registro','evidencia',e.evidencia,'flujo','FACTURACION_AUDITORIA_V1'))
  FROM public.tb_compensacion_periodo p JOIN public.tb_compensacion_evento e ON e.periodo_imputacion=p.periodo
  JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
  JOIN public.tb_compensacion_concepto c ON c.id=t.id_concepto
  WHERE p.id=p_id_periodo AND e.id_colaborador_beneficiario=p_id_colaborador AND e.estado_evento='APROBADO'
    AND e.datos->>'flujo'='FACTURACION_AUDITORIA_V1' AND t.categoria='AUDITORIA_PAGO'
    AND t.codigo IN('DETECCION_ERROR_PAGO','OPERACION_EXTRA')
    AND public.f_private_compensacion_facturacion_auditoria_vigente(e.id);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_facturacion_auditoria_operacion(p_id bigint, p_dni character varying)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT jsonb_build_object('id',o.id,'id_cliente',o.id_cliente,'dni',btrim(o.dni_cliente),
    'cliente',o.nombre_cliente,'codigo',o.codigo_operacion_deposito_cliente,
    'monto',o.monto_deposito_cliente,'estado',s->>'estado','pagada',(s->>'pagada')::boolean,
    'fecha_registro',o.fecha_registro,'fecha_pago',s->>'fecha_pago','servicio',o.tipo_servicio)
  FROM public.tb_operacion_proceso o
  CROSS JOIN LATERAL public.f_private_compensacion_cliente_nuevo_operacion_estado(o.id) s
  CROSS JOIN LATERAL public.f_private_compensacion_facturacion_auditoria_contexto('CONSULTAR') ctx
  WHERE o.id=p_id AND btrim(o.dni_cliente)=p_dni AND o.id_cliente IS NOT NULL
    AND (coalesce((ctx->>'es_admin')::boolean,false) OR nullif(ctx->>'id_asignacion','')::bigint IS NOT NULL OR EXISTS(
      SELECT 1 FROM public.tb_permiso_usuario pu JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
      JOIN public.tb_estado eu ON eu.id=pu.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
      JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
      WHERE pu.id_usuario=(ctx->>'id_usuario')::bigint
        AND pm.ruta='/operaciones/'||CASE lower(btrim(coalesce(nullif(o.ruta_destino,''),nullif(o.ruta_origen,''),
          CASE WHEN upper(o.tipo_servicio) LIKE '%DEUDA%' THEN 'pagodeuda'
            WHEN upper(o.tipo_servicio) LIKE '%POS%' THEN 'pos'
            WHEN upper(o.tipo_servicio) LIKE '%LINK%' THEN 'linkpago' END)))
          WHEN 'safetypay' THEN 'interbank' WHEN 'link_pago' THEN 'linkpago'
          ELSE lower(btrim(coalesce(nullif(o.ruta_destino,''),nullif(o.ruta_origen,''),
            CASE WHEN upper(o.tipo_servicio) LIKE '%DEUDA%' THEN 'pagodeuda'
              WHEN upper(o.tipo_servicio) LIKE '%POS%' THEN 'pos'
              WHEN upper(o.tipo_servicio) LIKE '%LINK%' THEN 'linkpago' END))) END
    ))
    AND coalesce((s->>'es_final')::boolean,false)
    AND upper(btrim(o.nombre_estado)) IN('PENDIENTE','PAGADO')
    AND upper(btrim(coalesce(o.tipo_flujo_pago_deuda,''))) NOT IN('SOLICITUD','RETORNO','RETORNO_DIRECTO')
    AND upper(coalesce(o.tipo_servicio,'')) NOT LIKE '%CUOTA%'
    AND upper(coalesce(o.tipo_servicio,'')) NOT LIKE '%PLAN%'
    AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso h WHERE h.id_operacion_padre=o.id)
    AND EXISTS(SELECT 1 FROM public.tb_cliente c WHERE c.id=o.id_cliente AND btrim(c.numero_documento)=p_dni);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_facturacion_auditoria_vigente(p_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 RETURN EXISTS(SELECT 1 FROM public.tb_compensacion_evento e
   JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento AND t.codigo IN('DETECCION_ERROR_PAGO','OPERACION_EXTRA')
   JOIN public.tb_compensacion_evento_referencia r ON r.id_evento=e.id AND r.tipo_referencia='OPERACION'
   JOIN public.tb_operacion_proceso o ON o.id=r.id_operacion
   JOIN public.tb_cliente c ON c.id=o.id_cliente AND btrim(c.numero_documento)=e.datos->>'cliente_documento'
   CROSS JOIN LATERAL public.f_private_compensacion_cliente_nuevo_operacion_estado(o.id) st
   WHERE e.id=p_id AND e.estado_evento='APROBADO' AND e.datos->>'flujo'='FACTURACION_AUDITORIA_V1'
     AND (e.datos->'operacion'->>'id')::bigint=o.id AND btrim(o.dni_cliente)=e.datos->>'cliente_documento'
     AND (SELECT count(*) FROM public.tb_compensacion_evento_referencia x WHERE x.id_evento=e.id AND x.tipo_referencia='OPERACION')=1
     AND coalesce((st->>'es_final')::boolean,false) AND upper(btrim(o.nombre_estado)) IN('PENDIENTE','PAGADO')
     AND upper(btrim(coalesce(o.tipo_flujo_pago_deuda,''))) NOT IN('SOLICITUD','RETORNO','RETORNO_DIRECTO')
     AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso h WHERE h.id_operacion_padre=o.id)
     AND e.importe_aprobado IS NOT NULL AND e.importe_aprobado>=0
     AND e.criterios_validacion_snapshot->>'politica_tarifa'='REGISTRO_V1'
     AND e.importe_aprobado=round(least((e.criterios_validacion_snapshot#>>'{regla_registro,monto}')::numeric,
       coalesce((e.criterios_validacion_snapshot#>>'{regla_registro,tope_importe}')::numeric,(e.criterios_validacion_snapshot#>>'{regla_registro,monto}')::numeric)),2)
     AND EXISTS(SELECT 1 FROM public.tb_compensacion_evento_revision rev WHERE rev.id_evento=e.id
       AND rev.etapa='ADMIN_FACTURACION' AND rev.decision='APROBADO' AND rev.id_usuario_revisor<>e.id_usuario_registra
       AND (rev.datos_decision->>'importe_aprobado')::numeric=e.importe_aprobado
       AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador co
         WHERE co.id IN(e.id_colaborador_beneficiario,e.id_colaborador_responsable) AND co.id_usuario=rev.id_usuario_revisor))
     AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia rr JOIN public.tb_compensacion_evento ee ON ee.id=rr.id_evento
       WHERE rr.id_operacion=o.id AND ee.id<>e.id AND ee.id_tipo_evento=e.id_tipo_evento AND ee.estado_evento IN('APROBADO','LIQUIDADO'))
     AND (t.codigo<>'OPERACION_EXTRA' OR (o.fecha_registro>=e.fecha_registro
       AND public.f_private_compensacion_facturacion_auditoria_codigo(o.codigo_operacion_deposito_cliente)
         =public.f_private_compensacion_facturacion_auditoria_codigo(e.datos->>'codigo_externo')
       AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso previa WHERE previa.id<>o.id
         AND btrim(previa.dni_cliente)=e.datos->>'cliente_documento' AND previa.fecha_registro<e.fecha_registro
         AND public.f_private_compensacion_facturacion_auditoria_codigo(previa.codigo_operacion_deposito_cliente)
           =public.f_private_compensacion_facturacion_auditoria_codigo(e.datos->>'codigo_externo')
         AND coalesce((public.f_private_compensacion_cliente_nuevo_operacion_estado(previa.id)->>'es_final')::boolean,false)
         AND upper(btrim(previa.nombre_estado)) IN('PENDIENTE','PAGADO')
         AND upper(btrim(coalesce(previa.tipo_flujo_pago_deuda,''))) NOT IN('SOLICITUD','RETORNO','RETORNO_DIRECTO')
         AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso h WHERE h.id_operacion_padre=previa.id))))) ;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_facturacion_concepto_operativo(p_codigo text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT coalesce(p_codigo IN('ATC_ERROR_DATOS','ATC_ERROR_REGISTRO','ATC_MAL_FLUJO','JEFE_ERROR_SUPERVISION','JEFE_ERROR_CUADRO')
   OR p_codigo ~ '^PAG_[A-Z_]+_(DESCUADRE|ERROR_CUADRO|ERROR_PAGO_CRITICO|RETRASO_VOUCHER|CIERRE_INCOMPLETO)$',false);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_facturacion_descuento_incidente(p_id_evento bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  ev public.tb_compensacion_evento%ROWTYPE;
  pt public.tb_compensacion_penalidad_tipo%ROWTYPE;
  dia date;
  mes date;
  perdio boolean;
BEGIN
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id_evento;
  IF ev.id IS NULL THEN RAISE EXCEPTION 'Incidencia inexistente'; END IF;
  pt:=public.f_private_compensacion_incidencia_penalidad_registrada(p_id_evento);
  IF pt.codigo IS NULL OR pt.codigo NOT IN ('FAC_UNIFORME','FAC_INDISCIPLINA') THEN
    RAISE EXCEPTION 'El calculo cronologico solo aplica a uniforme e indisciplina de Facturacion';
  END IF;
  dia:=(ev.fecha_evento AT TIME ZONE 'America/Lima')::date;
  mes:=date_trunc('month',dia)::date;
  IF ev.periodo_imputacion IS DISTINCT FROM mes THEN
    RAISE EXCEPTION 'La incidencia debe imputarse al mes del hecho';
  END IF;
  IF ev.estado_evento NOT IN ('PENDIENTE','APROBADO','LIQUIDADO') THEN RETURN 0::numeric; END IF;

  -- Validar el cargo del responsable a la fecha del hecho, no el rol del actor
  -- administrativo que resuelve ni la sede actual del usuario de Facturacion.
  -- La ultima asignacion activa vigente debe corresponder a la penalidad registrada.
  IF NOT EXISTS (
    SELECT 1 FROM (
      SELECT a.id_cargo FROM public.tb_compensacion_asignacion a
      JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
      WHERE a.id_colaborador=ev.id_colaborador_responsable
        AND dia BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)
      ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1
    ) vigente
    JOIN public.tb_compensacion_cargo ca ON ca.id=vigente.id_cargo
    WHERE ca.codigo='FACTURACION' AND ca.id=pt.id_cargo
  ) THEN RAISE EXCEPTION 'La incidencia requiere cargo FACTURACION vigente para el responsable'; END IF;

  -- Orden cronologico (fecha_evento,id), no orden de aprobacion. El candidato
  -- puede estar PENDIENTE; los antecedentes solo APROBADO/LIQUIDADO, excluyendo self.
  -- Uniforme: una sola multa por persona/dia, incluso entre versiones de PT.
  IF pt.codigo='FAC_UNIFORME' AND EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento ant
    LEFT JOIN public.tb_compensacion_penalidad_tipo ap ON ap.id=ant.id_penalidad_tipo
    WHERE ant.id<>ev.id AND ant.id_colaborador_responsable=ev.id_colaborador_responsable
      AND ant.estado_evento IN ('APROBADO','LIQUIDADO')
      AND coalesce(ant.criterios_validacion_snapshot->>'codigo_penalidad',
        ant.datos#>>'{penalidad_tipo_snapshot,codigo}',ap.codigo)='FAC_UNIFORME'
      AND (ant.fecha_evento AT TIME ZONE 'America/Lima')::date=dia
      AND (ant.fecha_evento,ant.id)<(ev.fecha_evento,ev.id)
  ) THEN RETURN 0::numeric; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento ant
    LEFT JOIN public.tb_compensacion_penalidad_tipo ap ON ap.id=ant.id_penalidad_tipo
    WHERE ant.id<>ev.id AND ant.id_colaborador_responsable=ev.id_colaborador_responsable
      AND ant.estado_evento IN ('APROBADO','LIQUIDADO')
      AND ant.periodo_imputacion=mes
      AND (ant.fecha_evento AT TIME ZONE 'America/Lima')::date>=mes
      AND (ant.fecha_evento,ant.id)<(ev.fecha_evento,ev.id)
      AND coalesce(ant.criterios_validacion_snapshot->>'codigo_penalidad',
        ant.datos#>>'{penalidad_tipo_snapshot,codigo}',ap.codigo)
          IN ('FAC_UNIFORME','FAC_INDISCIPLINA')
  ) OR EXISTS (
    -- La puntualidad la confirma el administrador en Bonos del mes (tb_compensacion_condicion_mes).
    SELECT 1 FROM public.tb_compensacion_condicion_mes cm
    JOIN public.tb_compensacion_periodo cp ON cp.id=cm.id_periodo AND cp.periodo=mes
    WHERE cm.id_colaborador=ev.id_colaborador_responsable AND cm.codigo_condicion='PUNTUALIDAD' AND NOT cm.cumple
  ) INTO perdio;
  -- Importe de la PT registrada (snapshot), nunca una tarifa fija nueva.
  RETURN CASE WHEN perdio THEN pt.monto_referencia ELSE 0::numeric END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_facturacion_ruta_permitida(p_ruta text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT coalesce(p_ruta NOT LIKE '/compensaciones/%' OR p_ruta=ANY(ARRAY['/compensaciones/resumen','/compensaciones/referidos','/compensaciones/auditoria-operaciones','/compensaciones/indisciplina-colaborador','/compensaciones/mis-bonos-descuentos','/compensaciones/otros-bonos/propuesta_innovacion' ]::text[]),false);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_fechas_no_laborables(p_configuracion jsonb)
 RETURNS date[]
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_fecha jsonb; v_texto text; v_fechas date[] := ARRAY[]::date[];
BEGIN
  IF NOT COALESCE(p_configuracion ? 'fechas_no_laborables', false) THEN RETURN v_fechas; END IF;
  IF jsonb_typeof(p_configuracion -> 'fechas_no_laborables') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'fechas_no_laborables debe ser un arreglo de fechas YYYY-MM-DD';
  END IF;
  FOR v_fecha IN SELECT value FROM jsonb_array_elements(p_configuracion -> 'fechas_no_laborables') LOOP
    v_texto := v_fecha #>> '{}';
    IF jsonb_typeof(v_fecha) <> 'string' OR v_texto !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'Fecha no laborable invalida: %', v_fecha;
    END IF;
    BEGIN v_fechas := array_append(v_fechas, v_texto::date);
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Fecha no laborable inexistente: %', v_texto;
    END;
  END LOOP;
  RETURN ARRAY(SELECT DISTINCT fecha FROM unnest(v_fechas) fecha ORDER BY fecha);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_incidencia_penalidad_registrada(p_id_evento bigint)
 RETURNS tb_compensacion_penalidad_tipo
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_evento public.tb_compensacion_evento%ROWTYPE;
  v_base public.tb_compensacion_penalidad_tipo%ROWTYPE; v_datos jsonb;
BEGIN
  SELECT * INTO v_evento FROM public.tb_compensacion_evento WHERE id = p_id_evento;
  SELECT * INTO v_base FROM public.tb_compensacion_penalidad_tipo WHERE id = v_evento.id_penalidad_tipo;
  v_datos := v_evento.datos->'penalidad_tipo_snapshot';
  IF jsonb_typeof(v_datos) = 'object' THEN
    IF (v_datos->>'id')::bigint IS DISTINCT FROM v_evento.id_penalidad_tipo THEN
      RAISE EXCEPTION 'La penalidad registrada no corresponde a esta incidencia';
    END IF;
    SELECT * INTO v_base FROM jsonb_populate_record(NULL::public.tb_compensacion_penalidad_tipo,
      to_jsonb(v_base) || v_datos);
  END IF;
  IF v_base.id IS NULL THEN RAISE EXCEPTION 'La penalidad registrada no esta disponible'; END IF;
  RETURN v_base;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_incidencia_revision_admin(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; e public.tb_compensacion_evento%ROWTYPE; pt public.tb_compensacion_penalidad_tipo%ROWTYPE;
propio boolean; excepcion boolean; protegido boolean; especializado boolean; descargo boolean; disponible boolean; importe numeric; efecto text; motivo text:=''; fuentes jsonb; huella text; historial text; evidencia_valida boolean;
BEGIN
 ctx:=public.f_private_compensacion_contexto('INCIDENCIAS','CONSULTAR');
 IF NOT coalesce((ctx->>'es_super_admin')::boolean,false) THEN RAISE EXCEPTION 'Revision exclusiva de Administracion'; END IF;
 PERFORM public.f_private_compensacion_incidencia_validar_alcance(p_id,'CONSULTAR',false);
 SELECT * INTO e FROM public.tb_compensacion_evento WHERE id=p_id;
 pt:=public.f_private_compensacion_incidencia_penalidad_registrada(p_id);
 -- SQL117: Queja Tardia registrada y aprobada por Administracion es la unica excepcion al revisor independiente.
 excepcion:=coalesce(e.id_usuario_registra=(ctx->>'id_usuario')::bigint AND public.f_private_compensacion_queja_tardia_excepcion(p_id,(ctx->>'id_usuario')::bigint),false);
 propio:=(e.id_usuario_registra=(ctx->>'id_usuario')::bigint AND NOT excepcion) OR (ctx->>'id_colaborador')::bigint IN(e.id_colaborador_beneficiario,e.id_colaborador_responsable);
 propio:=coalesce(propio,false);
 protegido:=e.estado_evento='LIQUIDADO' OR EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=e.periodo_imputacion AND estado_periodo IN('APROBADO','CERRADO'))
 OR EXISTS(SELECT 1 FROM public.tb_compensacion_reporte_mes rm JOIN public.tb_compensacion_periodo rp ON rp.id=rm.id_periodo WHERE rp.periodo=e.periodo_imputacion AND rm.estado='CONFIRMADO');
 especializado:=e.datos->>'flujo'='FACTURACION_AUDITORIA_V1';especializado:=coalesce(especializado,false);
 SELECT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_revision r WHERE r.id_evento=p_id AND r.etapa='DESCARGO' AND r.numero_paso>coalesce((SELECT max(numero_paso) FROM public.tb_compensacion_evento_revision WHERE id_evento=p_id AND decision='ENVIADO'),0)) INTO descargo;
 evidencia_valida:=public.f_private_compensacion_caza_errores_sin_evidencia(p_id) OR EXISTS(SELECT 1 FROM jsonb_array_elements(e.evidencia) x WHERE x->>'url' ~ '^https://[^[:space:]]+$');
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_caza_errores_vinculo v WHERE v.id_evento_consecuencia=p_id AND v.tipo_consecuencia='COMISION_JEFE') THEN
   evidencia_valida:=evidencia_valida AND EXISTS(SELECT 1 FROM public.tb_compensacion_caza_errores_vinculo v JOIN public.tb_compensacion_hallazgo_correccion c ON c.id_evento=v.id_evento_origen WHERE v.id_evento_consecuencia=p_id AND c.estado='CORREGIDO' AND c.antes_escalamiento);
 END IF;
 disponible:=NOT propio AND NOT protegido AND NOT especializado AND e.estado_evento='PENDIENTE';
 IF propio THEN motivo:='Requiere otro revisor: participas como autor, reportante o responsable';
 ELSIF protegido THEN motivo:='Periodo o sueldo consolidado; corresponde un ajuste auditado';
 ELSIF especializado THEN motivo:='Este reporte se revisa desde Auditoria de Pagos';
 ELSIF e.estado_evento<>'PENDIENTE' THEN motivo:='El expediente no esta pendiente de decision';
 ELSIF pt.requiere_respuesta AND NOT descargo THEN motivo:='Falta el descargo del responsable para aprobar';
 ELSIF NOT evidencia_valida THEN motivo:='Completa evidencia o correccion previa al escalamiento antes de aprobar'; END IF;
 importe:=pt.monto_referencia;
 BEGIN
 IF pt.codigo IN('ATC_UNIFORME','ATC_INDISCIPLINA') THEN importe:=public.f_private_compensacion_atc_descuento_incidente(p_id);
 ELSIF pt.codigo IN('FAC_UNIFORME','FAC_INDISCIPLINA') THEN importe:=public.f_private_compensacion_facturacion_descuento_incidente(p_id);
 ELSIF pt.codigo IN('JEFE_UNIFORME','JEFE_INDISCIPLINA') THEN importe:=public.f_private_compensacion_jefatura_descuento_incidente(p_id);
 ELSIF pt.codigo IN('MKT_UNIFORME','MKT_INDISCIPLINA') THEN importe:=public.f_private_compensacion_marketing_descuento_incidente(p_id);
 ELSIF pt.codigo ~ '^PAG_.*_(UNIFORME|INDISCIPLINA)$' THEN importe:=public.f_private_compensacion_pagos_descuento_incidente(p_id);
 END IF;
 EXCEPTION WHEN raise_exception THEN importe:=NULL;motivo:=SQLERRM;disponible:=false; END;
 IF pt.codigo ~ '^PAG_.*_ERROR_PAGO_CRITICO$' THEN
   IF coalesce(e.datos->>'monto_perdido','') ~ '^[0-9]+(\.[0-9]{1,2})?$' AND (e.datos->>'monto_perdido')::numeric>0 THEN
     importe:=greatest(pt.monto_referencia,(e.datos->>'monto_perdido')::numeric);
   ELSE importe:=NULL;motivo:='Falta la perdida monetaria sustentada'; END IF;
 END IF;
 IF e.estado_evento IN('APROBADO','LIQUIDADO') THEN importe:=e.importe_aprobado; END IF;
 efecto:=CASE WHEN pt.codigo ~ '(UNIFORME|INDISCIPLINA)$' THEN CASE WHEN importe=0 THEN 'Afecta el bono de puntualidad; sin descuento adicional para este hecho' ELSE 'Descuento por hecho posterior a la perdida del bono; sujeto a confirmacion' END
 WHEN pt.codigo='ATC_FRAUDE_DIGITAL' THEN 'Confirmar el hecho hace perder el 100 % de las comisiones del mes del hecho; el monto se calcula en la liquidacion. No afecta al Jefe de la sede'
 WHEN pt.codigo ~ 'ERROR_CUADRO$' THEN 'El importe se determina en el calculo mensual; confirmar el hecho no paga ni descuenta por si solo'
 ELSE 'Confirmar el hecho habilita su consecuencia; el monto se confirma en Bonos del mes' END;
 SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',r.tipo_referencia,'codigo',coalesce(o.codigo_operacion_deposito_cliente,r.identificador_externo,'Sin codigo'),'estado',coalesce(o.nombre_estado,'Referencia del expediente'),'monto',o.monto_deposito_cliente) ORDER BY r.id),'[]'),
 md5(coalesce(string_agg(to_jsonb(r)::text||coalesce(to_jsonb(o)::text,'')||coalesce(public.f_private_compensacion_cliente_nuevo_operacion_estado(o.id)::text,''),'|' ORDER BY r.id),''))
 INTO fuentes,huella FROM public.tb_compensacion_evento_referencia r LEFT JOIN public.tb_operacion_proceso o ON o.id=r.id_operacion WHERE r.id_evento=p_id;
 SELECT coalesce(string_agg(to_jsonb(r)::text,'|' ORDER BY numero_paso),'') INTO historial FROM public.tb_compensacion_evento_revision r WHERE id_evento=p_id;
 RETURN jsonb_build_object('id',p_id,'estado',e.estado_evento,'version',md5(to_jsonb(e)::text||huella||historial||coalesce(importe::text,'')||coalesce((SELECT to_jsonb(c)::text FROM public.tb_compensacion_hallazgo_correccion c WHERE c.id_evento IN(SELECT id_evento_origen FROM public.tb_compensacion_caza_errores_vinculo WHERE id_evento_consecuencia=p_id)),'')),'motivo',motivo,'bloqueado',NOT disponible,
 'puede_revisar',disponible,'puede_observar',disponible,'puede_aprobar',disponible AND evidencia_valida AND (NOT pt.requiere_respuesta OR descargo),'excepcion_independencia',excepcion,'descuento_estimado',importe,'efecto',efecto,'requiere_descargo',pt.requiere_respuesta,'descargo_presentado',descargo,'fuentes',fuentes);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_incidencia_validar_alcance(p_id_evento bigint, p_accion character varying, p_bloquear boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_evento public.tb_compensacion_evento%ROWTYPE;
  v_contexto jsonb;
  v_alcance character varying;
  v_accion character varying := UPPER(TRIM(COALESCE(p_accion, '')));
  v_id_colaborador_actor bigint;
  v_id_sucursal_alcance bigint;
BEGIN
  IF COALESCE(p_bloquear,false) THEN
    PERFORM pe.id FROM public.tb_compensacion_periodo pe WHERE pe.periodo=(SELECT periodo_imputacion FROM public.tb_compensacion_evento WHERE id=p_id_evento) ORDER BY pe.id FOR UPDATE;
  END IF;
  IF COALESCE(p_bloquear, false) THEN
    SELECT * INTO v_evento
    FROM public.tb_compensacion_evento
    WHERE id = p_id_evento
    FOR UPDATE;
  ELSE
    SELECT * INTO v_evento
    FROM public.tb_compensacion_evento
    WHERE id = p_id_evento;
  END IF;

  IF v_evento.id IS NULL THEN
    RAISE EXCEPTION 'La incidencia no existe';
  END IF;

  IF v_evento.datos->>'flujo'='FACTURACION_AUDITORIA_V1' AND v_accion<>'CONSULTAR' THEN
    RAISE EXCEPTION 'El reporte se modifica y revisa exclusivamente en Auditoria de Facturacion';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_evento_tipo t
    WHERE t.id = v_evento.id_tipo_evento
      AND t.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
  ) THEN
    RAISE EXCEPTION 'El evento no corresponde al flujo de incidencias';
  END IF;

  v_contexto := public.f_private_compensacion_contexto('INCIDENCIAS', v_accion);
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  IF v_alcance='SEDE' THEN
    IF v_accion IN('REVISAR','APROBAR') THEN RAISE EXCEPTION 'La revision de incidencias corresponde a Administracion'; END IF;
    IF v_accion<>'CONSULTAR' AND NOT EXISTS(
      SELECT 1 FROM public.tb_compensacion_evento_tipo t
      JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id=v_evento.id_penalidad_tipo
      WHERE t.id=v_evento.id_tipo_evento AND pt.codigo NOT LIKE 'JEFE_%'
        AND ((t.codigo='AUDITORIA_ACTIVA' AND pt.monto_bono_reportante IS NOT NULL AND pt.codigo !~ '(UNIFORME|INDISCIPLINA)$')
          OR (t.codigo='REPORTE_PENALIDAD' AND pt.codigo ~ '(UNIFORME|INDISCIPLINA)$'))
        AND v_evento.id_usuario_registra=(v_contexto->>'id_usuario')::bigint
        AND v_evento.id_colaborador_beneficiario=v_id_colaborador_actor
    ) THEN RAISE EXCEPTION 'Jefatura solo modifica sus propios reportes'; END IF;
  END IF;
  IF NOT public.f_private_compensacion_equipo_visible(v_contexto,v_evento.id_colaborador_responsable,(v_evento.fecha_evento AT TIME ZONE 'America/Lima')::date) THEN
    RAISE EXCEPTION 'La incidencia no corresponde a su equipo vigente';
  END IF;
  IF v_alcance='SEDE' AND v_accion IN ('EDITAR','REGISTRAR')
      AND v_evento.id_usuario_registra IS DISTINCT FROM (v_contexto->>'id_usuario')::bigint THEN
    RAISE EXCEPTION 'Solo el registrador puede modificar o enviar el reporte';
  END IF;
  IF v_accion<>'CONSULTAR' THEN
    PERFORM public.f_private_compensacion_pagos_periodo_editable(v_evento.id_colaborador_responsable,v_evento.periodo_imputacion);
    IF v_evento.id_colaborador_beneficiario IS NOT NULL THEN PERFORM public.f_private_compensacion_pagos_periodo_editable(v_evento.id_colaborador_beneficiario,v_evento.periodo_imputacion); END IF;
  END IF;
  -- SQL117: unica excepcion de independencia, Queja Tardia registrada y aprobada por Administracion.
  IF v_accion IN('REVISAR','APROBAR') AND (((v_contexto->>'id_usuario')::bigint=v_evento.id_usuario_registra AND NOT public.f_private_compensacion_queja_tardia_excepcion(p_id_evento,(v_contexto->>'id_usuario')::bigint)) OR v_id_colaborador_actor IN(v_evento.id_colaborador_beneficiario,v_evento.id_colaborador_responsable)) THEN
    RAISE EXCEPTION 'La incidencia requiere un revisor independiente del autor, reportante y responsable'; END IF;
  IF v_accion IN ('REVISAR', 'APROBAR') THEN
    IF v_alcance='SEDE' AND (v_id_colaborador_actor IN(v_evento.id_colaborador_beneficiario,v_evento.id_colaborador_responsable)
       OR v_evento.id_usuario_registra=(v_contexto->>'id_usuario')::bigint) THEN
      RAISE EXCEPTION 'Una incidencia propia o reportada por Jefatura requiere revision administrativa';
    END IF;
    IF v_alcance = 'PROPIO' THEN
      RAISE EXCEPTION 'La revision de incidencias requiere alcance de sede o global';
    END IF;

    IF v_alcance = 'SEDE'
       AND v_evento.id_sucursal_responsable IS DISTINCT FROM v_id_sucursal_alcance THEN
      RAISE EXCEPTION 'Solo la sede responsable puede resolver la incidencia';
    END IF;
  ELSE
    IF v_alcance = 'PROPIO'
       AND v_id_colaborador_actor IS DISTINCT FROM v_evento.id_colaborador_beneficiario
       AND v_id_colaborador_actor IS DISTINCT FROM v_evento.id_colaborador_responsable THEN
      RAISE EXCEPTION 'Solo puede acceder a incidencias donde participa';
    END IF;

    IF v_alcance = 'SEDE'
       AND v_evento.id_sucursal_origen IS DISTINCT FROM v_id_sucursal_alcance
       AND v_evento.id_sucursal_responsable IS DISTINCT FROM v_id_sucursal_alcance THEN
      RAISE EXCEPTION 'La incidencia no pertenece a su sede autorizada';
    END IF;

    IF v_accion IN ('REGISTRAR', 'EDITAR')
       AND v_alcance = 'PROPIO'
       AND v_id_colaborador_actor IS DISTINCT FROM v_evento.id_colaborador_beneficiario THEN
      RAISE EXCEPTION 'Solo el reportante puede modificar o enviar la incidencia';
    END IF;

    IF v_accion IN ('REGISTRAR', 'EDITAR')
       AND v_alcance = 'SEDE'
       AND v_evento.id_sucursal_origen IS DISTINCT FROM v_id_sucursal_alcance THEN
      RAISE EXCEPTION 'Solo la sede reportante puede modificar o enviar la incidencia';
    END IF;
  END IF;

  RETURN v_contexto || jsonb_build_object(
    'id_evento', v_evento.id,
    'estado_evento', v_evento.estado_evento
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_incidencias_contexto_lectura()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE v_rol bigint; v_super boolean; v_ctx jsonb; v_col bigint; v_usr bigint;
BEGIN
 SELECT u.id_rol,coalesce(u.flag_super_admin,false),u.id INTO v_rol,v_super,v_usr FROM public.tb_usuario u
  JOIN public.tb_estado e ON e.id=u.id_estado AND upper(btrim(e.nombre))='ACTIVO' WHERE u.auth_user_id=auth.uid() LIMIT 1;
 IF v_rol IS NULL OR v_rol NOT IN(2,4,6) OR v_super THEN
  RETURN public.f_private_compensacion_contexto('INCIDENCIAS','CONSULTAR');
 END IF;
 v_ctx:=public.f_private_compensacion_contexto('RESUMEN','CONSULTAR');
 v_col:=(v_ctx->>'id_colaborador')::bigint;
 IF v_rol=2 THEN PERFORM public.f_private_compensacion_pagos_perfil(v_col);
 ELSIF v_rol=6 THEN PERFORM public.f_private_compensacion_marketing_perfil(v_col); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tb_permiso_usuario pu JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
   JOIN public.tb_estado eu ON eu.id=pu.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
   JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
   WHERE pu.id_usuario=v_usr AND ((v_rol=6 AND pm.ruta='/compensaciones/indisciplina-colaborador') OR (v_rol=4 AND pm.ruta IN('/compensaciones/auditoria-operaciones','/compensaciones/indisciplina-colaborador')) OR (v_rol=2 AND pm.ruta IN('/compensaciones/auditoria-operaciones','/compensaciones/auditoria-cuadre-cierre','/compensaciones/indisciplina-colaborador','/compensaciones/penalidad-escalonada-bonos')))) THEN
  RAISE EXCEPTION 'No tiene acceso a las incidencias de su perfil'; END IF;
 RETURN v_ctx||jsonb_build_object('recurso','INCIDENCIAS','accion','CONSULTAR','alcance','PROPIO','solo_responsable',true,
  'id_sucursal_alcance',NULL,'puede_consultar',true,'puede_registrar',false,'puede_editar',false,'puede_revisar',false,
  'puede_aprobar',false,'puede_pagar',false,'puede_cerrar',false,'puede_configurar',false);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_innovacion_actor(p_evento tb_compensacion_evento, p_contexto jsonb, p_accion character varying)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  actor bigint := (p_contexto->>'id_usuario')::bigint;
  colaborador bigint := (p_contexto->>'id_colaborador')::bigint;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Identidad no valida'; END IF;
  IF upper(p_accion)='CONSULTAR' AND NOT COALESCE((p_contexto->>'es_super_admin')::boolean,false)
    AND (colaborador IS NULL OR p_evento.id_colaborador_beneficiario IS DISTINCT FROM colaborador) THEN
    RAISE EXCEPTION 'Solo puede consultar sus propias propuestas';
  END IF;
  IF upper(p_accion) IN ('APROBAR','REGISTRAR') THEN
    IF NULLIF(btrim(p_evento.titulo),'') IS NULL OR NULLIF(btrim(p_evento.descripcion),'') IS NULL THEN
      RAISE EXCEPTION 'La propuesta requiere titulo y descripcion';
    END IF;
  END IF;
  IF upper(p_accion) IN ('APROBAR','REVISAR') THEN
    IF NOT COALESCE((p_contexto->>'es_super_admin')::boolean,false) THEN
      RAISE EXCEPTION 'Solo Administracion puede evaluar la implementacion';
    END IF;
    IF actor=p_evento.id_usuario_registra OR EXISTS (
      SELECT 1 FROM public.tb_compensacion_colaborador c
      WHERE c.id IN (p_evento.id_colaborador_beneficiario,p_evento.id_colaborador_responsable) AND c.id_usuario=actor
    ) THEN RAISE EXCEPTION 'Se requiere un revisor independiente'; END IF;
  ELSIF upper(p_accion) IN ('REGISTRAR','EDITAR','ANULAR') THEN
    IF colaborador IS NULL OR p_evento.id_colaborador_beneficiario IS DISTINCT FROM colaborador
      OR p_evento.id_usuario_registra IS DISTINCT FROM actor THEN
      RAISE EXCEPTION 'Solo puede modificar su propia propuesta';
    END IF;
  END IF;
  IF upper(p_accion)<>'CONSULTAR' AND EXISTS (
    SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=p_evento.periodo_imputacion
      AND estado_periodo IN ('APROBADO','CERRADO')
  ) THEN RAISE EXCEPTION 'El periodo esta bloqueado; corresponde un ajuste auditado'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_innovacion_comprobada(p_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento e
    JOIN public.tb_compensacion_evento_revision r ON r.id_evento=e.id AND r.etapa='IMPLEMENTACION'
      AND r.decision='APROBADO' AND r.datos_decision=e.criterios_validacion_snapshot->'innovacion_implementacion'
    WHERE e.id=p_id AND r.id_usuario_revisor<>e.id_usuario_registra
      AND NOT EXISTS (SELECT 1 FROM public.tb_compensacion_colaborador c
        WHERE c.id IN(e.id_colaborador_beneficiario,e.id_colaborador_responsable) AND c.id_usuario=r.id_usuario_revisor)
      AND r.datos_decision->>'politica'='INNOVACION_IMPLEMENTADA_V1'
      AND NULLIF(btrim(r.datos_decision->>'motivo'),'') IS NOT NULL
      AND NULLIF(r.datos_decision->>'fecha','') IS NOT NULL
      AND r.datos_decision->>'id_usuario'=r.id_usuario_revisor::text
  );
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_innovacion_distinta(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE e public.tb_compensacion_evento%ROWTYPE; huella text;
BEGIN
  SELECT * INTO STRICT e FROM public.tb_compensacion_evento WHERE id=p_id;
  IF NULLIF(btrim(e.titulo),'') IS NULL OR NULLIF(btrim(e.descripcion),'') IS NULL THEN
    RAISE EXCEPTION 'La propuesta requiere titulo y descripcion';
  END IF;
  huella:=lower(regexp_replace(btrim(e.titulo)||' '||btrim(e.descripcion),'[[:space:]]+',' ','g'));
  -- Una misma idea no se paga de nuevo en otro periodo o mediante otra solicitud.
  PERFORM pg_advisory_xact_lock(hashtextextended('innovacion:'||huella,0));
  IF EXISTS (SELECT 1 FROM public.tb_compensacion_evento otra
    JOIN public.tb_compensacion_evento_tipo t ON t.id=otra.id_tipo_evento AND t.codigo='PROPUESTA_INNOVACION'
    WHERE otra.id<>p_id AND otra.estado_evento IN('APROBADO','LIQUIDADO')
      AND (otra.importe_aprobado>0 OR public.f_private_compensacion_innovacion_comprobada(otra.id))
      AND lower(regexp_replace(btrim(otra.titulo)||' '||btrim(otra.descripcion),'[[:space:]]+',' ','g'))=huella
  ) THEN RAISE EXCEPTION 'La misma idea ya tiene un bono reconocido'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_jefatura_descuento_incidente(p_id_evento bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  ev public.tb_compensacion_evento%ROWTYPE;
  pt public.tb_compensacion_penalidad_tipo%ROWTYPE;
  dia date;
  mes date;
  perdio boolean;
BEGIN
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id_evento;
  IF ev.id IS NULL THEN RAISE EXCEPTION 'Incidencia inexistente'; END IF;
  pt:=public.f_private_compensacion_incidencia_penalidad_registrada(p_id_evento);
  IF pt.codigo NOT IN ('JEFE_UNIFORME','JEFE_INDISCIPLINA') THEN
    RAISE EXCEPTION 'El calculo cronologico solo aplica a uniforme e indisciplina de Jefatura';
  END IF;
  dia:=(ev.fecha_evento AT TIME ZONE 'America/Lima')::date;
  mes:=date_trunc('month',dia)::date;
  IF ev.periodo_imputacion IS DISTINCT FROM mes THEN
    RAISE EXCEPTION 'La incidencia debe imputarse al mes del hecho';
  END IF;
  IF ev.estado_evento NOT IN ('PENDIENTE','APROBADO','LIQUIDADO') THEN RETURN 0::numeric; END IF;

  -- Una sola ocurrencia de uniforme por persona y dia, aun entre versiones
  -- de penalidad. La primera cronologica es la representativa del dia.
  IF pt.codigo='JEFE_UNIFORME' AND EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento ant
    LEFT JOIN public.tb_compensacion_penalidad_tipo ap ON ap.id=ant.id_penalidad_tipo
    WHERE ant.id<>ev.id AND ant.id_colaborador_responsable=ev.id_colaborador_responsable
      AND ant.estado_evento IN ('APROBADO','LIQUIDADO')
      AND coalesce(ant.criterios_validacion_snapshot->>'codigo_penalidad',
        ant.datos#>>'{penalidad_tipo_snapshot,codigo}',ap.codigo)='JEFE_UNIFORME'
      AND (ant.fecha_evento AT TIME ZONE 'America/Lima')::date=dia
      AND (ant.fecha_evento,ant.id)<(ev.fecha_evento,ev.id)
  ) THEN RETURN 0::numeric; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento ant
    LEFT JOIN public.tb_compensacion_penalidad_tipo ap ON ap.id=ant.id_penalidad_tipo
    WHERE ant.id<>ev.id AND ant.id_colaborador_responsable=ev.id_colaborador_responsable
      AND ant.estado_evento IN ('APROBADO','LIQUIDADO')
      AND ant.periodo_imputacion=mes
      AND (ant.fecha_evento AT TIME ZONE 'America/Lima')::date>=mes
      AND (ant.fecha_evento,ant.id)<(ev.fecha_evento,ev.id)
      AND coalesce(ant.criterios_validacion_snapshot->>'codigo_penalidad',
        ant.datos#>>'{penalidad_tipo_snapshot,codigo}',ap.codigo)
          IN ('JEFE_UNIFORME','JEFE_INDISCIPLINA')
  ) OR EXISTS (
    -- La puntualidad la confirma el administrador en Bonos del mes (tb_compensacion_condicion_mes).
    SELECT 1 FROM public.tb_compensacion_condicion_mes cm
    JOIN public.tb_compensacion_periodo cp ON cp.id=cm.id_periodo AND cp.periodo=mes
    WHERE cm.id_colaborador=ev.id_colaborador_responsable AND cm.codigo_condicion='PUNTUALIDAD' AND NOT cm.cumple
  ) INTO perdio;
  -- 20/dia y 15/hecho proceden de la penalidad registrada, no de constantes.
  RETURN CASE WHEN perdio THEN pt.monto_referencia ELSE 0::numeric END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_jefatura_registro_presencial(p_id_periodo bigint, p_colaborador bigint)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT jsonb_build_object('id_concepto',co.id,'concepto_codigo',co.codigo,'concepto_nombre',co.nombre,
   'categoria',co.categoria,'naturaleza',co.naturaleza,'tipo_origen','EVENTO','clave_origen','REGISTRO_PRESENCIAL_AUTO:'||ev.id,
   'id_evento',ev.id,'id_regla',r.id,'id_plan_version',r.id_plan_version,'id_asignacion',a.id,
   'base_calculo',1,'cantidad',1,'tarifa',r.monto,'importe',least(r.monto,coalesce(r.tope_importe,r.monto)),
   'regla_snapshot',to_jsonb(r),'formula_snapshot','Una atencion presencial calificada aprobada; tarifa efectiva del cargo',
   'datos_origen',jsonb_build_object('tipo_evento','REGISTRO_PRESENCIAL','calificacion_origen',ev.id))
 FROM public.tb_compensacion_periodo pe JOIN public.tb_compensacion_evento ev ON ev.periodo_imputacion=pe.periodo AND ev.estado_evento='APROBADO'
 JOIN public.tb_compensacion_evento_tipo t ON t.id=ev.id_tipo_evento AND t.codigo='CALIFICACION_PRESENCIAL'
 CROSS JOIN LATERAL (
   SELECT a.* FROM public.tb_compensacion_asignacion a
   JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
   WHERE a.id_colaborador=p_colaborador AND a.fecha_inicio<=(ev.fecha_evento AT TIME ZONE 'America/Lima')::date
     AND (a.fecha_fin IS NULL OR a.fecha_fin>=(ev.fecha_evento AT TIME ZONE 'America/Lima')::date)
   ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1
 ) a
 JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='JEFE_TIENDA'
 JOIN public.tb_compensacion_concepto co ON co.codigo='BONO_REGISTRO_PRESENCIAL'
 CROSS JOIN LATERAL(
   SELECT r.* FROM public.f_private_compensacion_reglas_colaborador_fecha(a.id_plan,
     (ev.fecha_evento AT TIME ZONE 'America/Lima')::date,p_colaborador) r
   JOIN public.tb_estado e ON e.id=r.id_estado AND upper(btrim(e.nombre))='ACTIVO'
   WHERE r.id_concepto=co.id
     AND (r.id_cargo IS NULL OR r.id_cargo=a.id_cargo) AND (r.id_sucursal IS NULL OR r.id_sucursal=a.id_sucursal)
     AND r.tipo_calculo IN('FIJO','POR_UNIDAD') AND r.monto>0
   ORDER BY ((r.id_cargo IS NOT NULL)::int+(r.id_sucursal IS NOT NULL)::int) DESC,r.prioridad DESC,r.id DESC LIMIT 1
 ) r
 WHERE pe.id=p_id_periodo AND ev.id_colaborador_beneficiario=p_colaborador
   AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento previo JOIN public.tb_compensacion_evento_tipo pt ON pt.id=previo.id_tipo_evento AND pt.codigo='REGISTRO_PRESENCIAL'
     WHERE previo.id_colaborador_beneficiario=p_colaborador AND previo.estado_evento IN('APROBADO','LIQUIDADO')
       AND previo.datos->>'cliente_documento'=ev.datos->>'cliente_documento'
       AND (previo.fecha_evento AT TIME ZONE 'America/Lima')::date=(ev.fecha_evento AT TIME ZONE 'America/Lima')::date);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_jefatura_ruta_permitida(p_ruta text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT coalesce(p_ruta NOT LIKE '/compensaciones/%' OR p_ruta=ANY(ARRAY[
    '/compensaciones/resumen','/compensaciones/colaboradores','/compensaciones/calificaciones',
    '/compensaciones/llamadas','/compensaciones/atenciones','/compensaciones/referidos',
    '/compensaciones/mis-bonos-descuentos','/compensaciones/incidencias',
    '/compensaciones/auditoria-operaciones','/compensaciones/indisciplina-colaborador','/compensaciones/penalidad-escalonada-bonos',
    '/compensaciones/otros-bonos/propuesta_innovacion','/compensaciones/otros-bonos/tiktok_live',
    '/compensaciones/otros-bonos/alerta_temprana'
  ]::text[]),false);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_llamada_contexto(p_accion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_actor public.tb_usuario%ROWTYPE; v_colaborador bigint; v_admin boolean; v_jefe boolean; v_base jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada'; END IF;
  SELECT u.* INTO v_actor FROM public.tb_usuario u JOIN public.tb_estado e ON e.id=u.id_estado
    WHERE u.auth_user_id=auth.uid() AND upper(btrim(e.nombre))='ACTIVO';
  IF v_actor.id IS NULL THEN RAISE EXCEPTION 'El usuario no tiene un perfil operativo activo'; END IF;
  -- Catálogo vigente: 1 Administrador, 3 Jefe de Tienda, 4 Atención al Cliente.
  v_admin:=coalesce(v_actor.flag_super_admin,false) OR coalesce(v_actor.id_rol=1,false); v_jefe:=coalesce(v_actor.id_rol=3,false);
  IF NOT v_admin AND NOT v_jefe AND coalesce(v_actor.id_rol,0)<>4 THEN RAISE EXCEPTION 'Su rol no tiene acceso a Llamadas'; END IF;
  IF p_accion IS NULL OR p_accion NOT IN('CONSULTAR','REGISTRAR','APROBAR','REVISAR','EDITAR')
    OR (p_accion IN('APROBAR','REVISAR') AND NOT (v_admin OR v_jefe))
    -- Editar o anular una llamada propia (Esquema 12): ATC, Jefe de Sede y Administracion; el validador de alcance limita al Jefe a sus propios registros.
    OR (p_accion='EDITAR' AND NOT (v_admin OR v_jefe OR coalesce(v_actor.id_rol,0)=4)) THEN
    RAISE EXCEPTION 'No tiene permiso para % en Llamadas',p_accion;
  END IF;
  IF NOT v_admin AND v_actor.id_sucursal IS NULL THEN RAISE EXCEPTION 'El usuario debe tener una sede asignada'; END IF;
  v_base:=public.f_private_compensacion_contexto('LLAMADAS',p_accion::varchar);
  SELECT c.id INTO v_colaborador FROM public.tb_compensacion_colaborador c
    JOIN public.tb_estado e ON e.id=c.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE c.id_usuario=v_actor.id ORDER BY c.id LIMIT 1;
  RETURN jsonb_build_object('id_usuario',v_actor.id,'id_sucursal_usuario',v_actor.id_sucursal,
    'id_colaborador',v_colaborador,'es_super_admin',v_admin,'recurso','LLAMADAS','accion',p_accion,
    'alcance',CASE WHEN v_admin THEN 'GLOBAL' WHEN v_jefe THEN 'SEDE' ELSE 'PROPIO' END,
    'id_sucursal_alcance',CASE WHEN NOT v_admin THEN v_actor.id_sucursal END,
    'puede_registrar',true,'puede_aprobar',v_admin OR v_jefe,'puede_revisar',v_admin OR v_jefe,
    'puede_elegir_colaborador',v_admin OR v_jefe);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_alerta_cubierta(p_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento x ON x.id<>e.id
  AND x.id_colaborador_responsable=e.id_colaborador_responsable AND x.estado_evento IN('APROBADO','LIQUIDADO') AND x.id_penalidad_tipo IS NOT NULL
  AND (x.fecha_evento AT TIME ZONE 'America/Lima')::date=(e.fecha_evento AT TIME ZONE 'America/Lima')::date
 WHERE e.id=p_id AND nullif(lower(btrim(e.datos#>>'{captura,conversacion}')),'') IS NOT NULL
 AND coalesce(x.criterios_validacion_snapshot->>'codigo_penalidad',x.datos#>>'{penalidad_tipo_snapshot,codigo}',(SELECT codigo FROM public.tb_compensacion_penalidad_tipo WHERE id=x.id_penalidad_tipo))=e.datos#>>'{revision_marketing,codigo_penalidad}'
 AND lower(btrim(coalesce(x.datos->>'conversacion',x.datos->>'pancake_conversacion_id',x.datos#>>'{captura,conversacion}',x.datos#>>'{operacion,conversacion}')))=lower(btrim(e.datos#>>'{captura,conversacion}'))
 AND coalesce((x.criterios_validacion_snapshot->>'importe_descuento')::numeric,x.importe_aprobado,0)>0);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_avisar(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE e public.tb_compensacion_evento%ROWTYPE; jefe record; paso integer;
BEGIN
 SELECT * INTO e FROM public.tb_compensacion_evento WHERE id=p_id FOR UPDATE;
 IF e.estado_evento<>'PENDIENTE' OR (SELECT codigo FROM public.tb_compensacion_evento_tipo WHERE id=e.id_tipo_evento)<>'ALERTA_TEMPRANA' THEN RETURN; END IF;
 FOR jefe IN SELECT DISTINCT c.id FROM public.tb_compensacion_asignacion a JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo LIKE 'JEFE%'
 JOIN public.tb_compensacion_colaborador c ON c.id=a.id_colaborador JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=3
 JOIN public.tb_estado es ON es.id=a.id_estado AND upper(btrim(es.nombre))='ACTIVO'
 WHERE a.id_sucursal=e.id_sucursal_origen AND (e.fecha_evento AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)
 LOOP
  IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_revision WHERE id_evento=e.id AND etapa='AVISO_JEFATURA' AND datos_decision->>'id_colaborador_destino'=jefe.id::text) THEN
   SELECT coalesce(max(numero_paso),0)+1 INTO paso FROM public.tb_compensacion_evento_revision WHERE id_evento=e.id;
   INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
   VALUES(e.id,paso,'AVISO_JEFATURA','ENVIADO','Alerta disponible en la bandeja de Jefatura',e.id_usuario_registra,jsonb_build_object('id_colaborador_destino',jefe.id,'canal','BANDEJA_INTERNA','fecha',clock_timestamp()));
  END IF;
 END LOOP;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_captura_base(p_tipo text, p_valores jsonb, p_clave uuid, p_enviar boolean DEFAULT true, p_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; actor bigint; col bigint; r public.tb_compensacion_evento%ROWTYPE;
 tipo bigint; sede bigint; responsable bigint; cliente bigint; fecha timestamptz; clave text; hecho text; url text; snapshot jsonb; op jsonb; payload jsonb;
BEGIN
 IF p_tipo IS NULL OR p_tipo NOT IN('VIDEO_VIRAL','RECUPERACION_CLIENTE','ALERTA_TEMPRANA') OR p_enviar IS NULL OR p_clave IS NULL
 OR jsonb_typeof(p_valores) IS DISTINCT FROM 'object' OR length(p_valores::text)>16000 THEN RAISE EXCEPTION 'Captura o clave invalida'; END IF;
 ctx:=public.f_private_compensacion_contexto('BONO:'||p_tipo,CASE WHEN p_id IS NULL THEN 'REGISTRAR' ELSE 'EDITAR' END);
 actor:=(ctx->>'id_usuario')::bigint;col:=(ctx->>'id_colaborador')::bigint;
 IF coalesce((ctx->>'es_super_admin')::boolean,false) OR col IS NULL THEN RAISE EXCEPTION 'Registra desde tu propio perfil de Marketing'; END IF;
 IF coalesce(length(btrim(p_valores->>'titulo')),0) NOT BETWEEN 3 AND 250 OR coalesce(length(btrim(p_valores->>'descripcion')),0) NOT BETWEEN 3 AND 2000
  OR coalesce(p_valores->>'fecha','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Completa titulo, descripcion y fecha'; END IF;
 fecha:=((p_valores->>'fecha')::date+(clock_timestamp() AT TIME ZONE 'America/Lima')::time) AT TIME ZONE 'America/Lima';
 IF (p_valores->>'fecha')::date>(now() AT TIME ZONE 'America/Lima')::date OR NOT EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion a
 JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='DISENO_MARKETING' JOIN public.tb_estado es ON es.id=a.id_estado AND upper(btrim(es.nombre))='ACTIVO'
 WHERE a.id_colaborador=col AND (p_valores->>'fecha')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)) THEN RAISE EXCEPTION 'Requiere asignacion de Marketing para la fecha indicada'; END IF;
 url:=nullif(btrim(p_valores->>'evidencia'),'');
 IF (url IS NOT NULL AND (length(url)>2000 OR url !~ '^https://[^[:space:]]+$')) THEN RAISE EXCEPTION 'Adjunta evidencia HTTPS valida'; END IF;
 SELECT t.id INTO STRICT tipo FROM public.tb_compensacion_evento_tipo t JOIN public.tb_estado es ON es.id=t.id_estado AND upper(btrim(es.nombre))='ACTIVO' WHERE t.codigo=p_tipo;
 SELECT id_sucursal INTO sede FROM public.tb_compensacion_asignacion WHERE id_colaborador=col AND (p_valores->>'fecha')::date BETWEEN fecha_inicio AND coalesce(fecha_fin,'infinity'::date) ORDER BY fecha_inicio DESC,id DESC LIMIT 1;
 IF p_tipo='VIDEO_VIRAL' THEN
  IF coalesce(p_valores->>'red_social','') NOT IN('TIKTOK','INSTAGRAM','FACEBOOK','YOUTUBE','OTRO') THEN RAISE EXCEPTION 'Selecciona la red social'; END IF;
  IF date_trunc('month',(p_valores->>'fecha')::date) IS DISTINCT FROM date_trunc('month',(now() AT TIME ZONE 'America/Lima')::date) THEN RAISE EXCEPTION 'La medicion debe corresponder al mes de publicacion'; END IF;
  IF coalesce(p_valores->>'publicacion','') !~ '^https://[^[:space:]]+$' OR length(p_valores->>'publicacion')>2000 THEN RAISE EXCEPTION 'Enlace de publicacion HTTPS obligatorio'; END IF;
  IF coalesce(p_valores->>'vistas','') !~ '^[0-9]{1,12}$' OR coalesce(p_valores->>'likes','') !~ '^[0-9]{1,12}$' OR coalesce(p_valores->>'comentarios','') !~ '^[0-9]{1,12}$' THEN RAISE EXCEPTION 'Ingresa metricas enteras no negativas'; END IF;
  hecho:='VIDEO:'||public.f_private_compensacion_marketing_publicacion(p_valores->>'publicacion');
 ELSIF p_tipo='RECUPERACION_CLIENTE' THEN
  IF coalesce(p_valores->>'dni','') !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'Ingresa el DNI de ocho digitos'; END IF;
  op:=public.f_private_compensacion_marketing_operacion(nullif(p_valores->>'operacion_id','')::bigint,p_valores->>'dni');
  IF op IS NULL OR op->>'pagada'<>'true' THEN RAISE EXCEPTION 'Selecciona la operacion final pagada del DNI'; END IF;
  IF date_trunc('month',(p_valores->>'fecha')::date) IS DISTINCT FROM date_trunc('month',(op->>'fecha_pago')::timestamptz AT TIME ZONE 'America/Lima') THEN RAISE EXCEPTION 'La recuperacion debe imputarse al mes del pago'; END IF;
  op:=op||public.f_private_compensacion_marketing_inactividad((op->>'id')::bigint);
  IF op->>'recuperable'<>'true' THEN RAISE EXCEPTION 'Requiere historial previo y mas de 60 dias sin operar'; END IF;
  cliente:=(op->>'id_cliente')::bigint;hecho:='RECUPERACION:'||(op->>'id');
 ELSE
  responsable:=(p_valores->>'responsable_id')::bigint;
  SELECT a.id_sucursal INTO sede FROM public.tb_compensacion_colaborador c JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=4
   JOIN public.tb_compensacion_asignacion a ON a.id_colaborador=c.id JOIN public.tb_estado es ON es.id=a.id_estado AND upper(btrim(es.nombre))='ACTIVO'
   WHERE c.id=responsable AND c.id<>col AND (p_valores->>'fecha')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date) ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1;
  IF sede IS NULL OR coalesce(p_valores->>'motivo_tipo','') NOT IN('ERROR_DATOS','CHAT_SIN_RESPUESTA') OR coalesce(length(btrim(p_valores->>'conversacion')),0) NOT BETWEEN 3 AND 250 THEN RAISE EXCEPTION 'Selecciona asesor, motivo y referencia de conversacion'; END IF;
  IF p_tipo='ALERTA_TEMPRANA' AND p_id IS NULL AND (p_valores->>'fecha')::date<>(now() AT TIME ZONE 'America/Lima')::date THEN RAISE EXCEPTION 'La alerta debe registrarse al detectar el hecho'; END IF;
  IF p_valores->>'motivo_tipo'='CHAT_SIN_RESPUESTA' AND ((p_valores->>'desde')::timestamptz IS NULL OR (p_valores->>'desde')::timestamptz>now()) THEN RAISE EXCEPTION 'Indica desde cuando no tiene respuesta'; END IF;
  IF nullif(p_valores->>'operacion_id','') IS NOT NULL THEN
   op:=public.f_private_compensacion_marketing_operacion((p_valores->>'operacion_id')::bigint,p_valores->>'dni');
   IF op IS NULL THEN RAISE EXCEPTION 'Selecciona una operacion del DNI indicado'; END IF;
   cliente:=(op->>'id_cliente')::bigint;
  END IF;
  hecho:='ALERTA:'||responsable||':'||lower(btrim(p_valores->>'conversacion'))||':'||(p_valores->>'fecha');
 END IF;
 clave:='MKT_CAPTURA:'||actor||':'||p_clave;
 PERFORM public.f_private_compensacion_pagos_periodo_editable(col,(p_valores->>'fecha')::date);
 PERFORM pg_advisory_xact_lock(hashtextextended('MKT_HECHO:'||hecho,0));
 SELECT * INTO r FROM public.tb_compensacion_evento WHERE clave_origen=clave;
 IF r.id IS NOT NULL THEN
  IF r.id_usuario_registra<>actor OR r.datos->'captura' IS DISTINCT FROM p_valores OR r.id_tipo_evento<>tipo THEN RAISE EXCEPTION 'La clave corresponde a otra captura'; END IF;
 ELSE
  IF p_id IS NOT NULL THEN
   SELECT * INTO r FROM public.tb_compensacion_evento WHERE id=p_id FOR UPDATE;
   IF r.id IS NULL OR r.id_usuario_registra<>actor OR r.estado_evento NOT IN('BORRADOR','PENDIENTE') OR EXISTS(SELECT 1 FROM public.tb_compensacion_evento_revision jr WHERE jr.id_evento=r.id AND jr.etapa='JEFE_TIENDA') OR r.datos->>'flujo' IS DISTINCT FROM 'MARKETING_CAPTURA_V1' OR r.id_tipo_evento<>tipo THEN RAISE EXCEPTION 'Solo puedes editar tu registro pendiente sin validar'; END IF;
   IF p_tipo='ALERTA_TEMPRANA' THEN
    IF (r.fecha_evento AT TIME ZONE 'America/Lima')::date<>(p_valores->>'fecha')::date THEN RAISE EXCEPTION 'Conserva la fecha en que detectaste el hecho'; END IF;
    fecha:=r.fecha_evento;
   END IF;
   IF r.periodo_imputacion<>date_trunc('month',(p_valores->>'fecha')::date)::date THEN RAISE EXCEPTION 'Conserva el mes del registro; registra otro expediente para un periodo distinto'; END IF;
  END IF;
  IF p_tipo='ALERTA_TEMPRANA' AND EXISTS(SELECT 1 FROM public.tb_compensacion_evento e WHERE e.id IS DISTINCT FROM r.id AND e.id_tipo_evento=tipo AND e.id_colaborador_responsable=responsable AND e.estado_evento NOT IN('RECHAZADO','ANULADO')
    AND (e.fecha_evento AT TIME ZONE 'America/Lima')::date=(p_valores->>'fecha')::date AND lower(btrim(e.datos#>>'{captura,conversacion}'))=lower(btrim(p_valores->>'conversacion'))) THEN RAISE EXCEPTION 'La conversacion ya tiene un expediente para ese asesor y dia'; END IF;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento e WHERE e.datos->>'hecho_clave'=hecho AND e.id IS DISTINCT FROM r.id AND e.estado_evento NOT IN('RECHAZADO','ANULADO')) THEN RAISE EXCEPTION 'Este hecho ya tiene un expediente; no dupliques el reporte'; END IF;
  snapshot:=public.f_private_compensacion_evento_tarifa_registro(tipo,col,fecha);
  IF p_tipo='VIDEO_VIRAL' AND (p_enviar OR r.estado_evento='PENDIENTE') THEN PERFORM public.f_private_compensacion_marketing_minimos(p_valores,snapshot#>'{regla_registro,configuracion}'); END IF;
  payload:=jsonb_build_object('flujo','MARKETING_CAPTURA_V1','captura',p_valores,'hecho_clave',hecho,'fecha_medicion',clock_timestamp(),'fuente_operacion',op);
  IF r.id IS NULL THEN
   INSERT INTO public.tb_compensacion_evento(id_tipo_evento,id_colaborador_beneficiario,id_colaborador_responsable,id_sucursal_origen,fecha_evento,periodo_imputacion,fuente,clave_origen,titulo,descripcion,datos,evidencia,criterios_validacion_snapshot,estado_evento,id_usuario_registra)
   VALUES(tipo,col,responsable,sede,fecha,date_trunc('month',fecha AT TIME ZONE 'America/Lima')::date,'MANUAL',clave,btrim(p_valores->>'titulo'),btrim(p_valores->>'descripcion'),payload,CASE WHEN url IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('url',url)) END,snapshot,'BORRADOR',actor) RETURNING * INTO r;
  ELSE
   payload:=payload||jsonb_build_object('historial',coalesce(r.datos->'historial','[]')||jsonb_build_array(jsonb_build_object('captura',r.datos->'captura','fecha',r.fecha_actualizacion)));
   UPDATE public.tb_compensacion_evento SET fecha_evento=fecha,periodo_imputacion=date_trunc('month',fecha AT TIME ZONE 'America/Lima')::date,id_colaborador_responsable=responsable,id_sucursal_origen=sede,titulo=btrim(p_valores->>'titulo'),descripcion=btrim(p_valores->>'descripcion'),datos=payload,evidencia=CASE WHEN url IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('url',url)) END,criterios_validacion_snapshot=snapshot,clave_origen=clave,fecha_actualizacion=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
   DELETE FROM public.tb_compensacion_evento_referencia WHERE id_evento=r.id;
  END IF;
  IF cliente IS NOT NULL THEN INSERT INTO public.tb_compensacion_evento_referencia(id_evento,tipo_referencia,id_cliente,id_usuario) VALUES(r.id,'CLIENTE',cliente,actor);
   INSERT INTO public.tb_compensacion_evento_referencia(id_evento,tipo_referencia,id_operacion,id_usuario) VALUES(r.id,'OPERACION',(op->>'id')::bigint,actor); END IF;
 END IF;
 IF p_enviar AND r.estado_evento='BORRADOR' THEN
  UPDATE public.tb_compensacion_evento SET estado_evento='PENDIENTE',fecha_actualizacion=clock_timestamp() WHERE id=r.id;
  INSERT INTO public.tb_compensacion_evento_revision(id_evento,numero_paso,etapa,decision,comentario,id_usuario_revisor,datos_decision)
   SELECT r.id,coalesce(max(numero_paso),0)+1,'REGISTRO','ENVIADO','Captura Marketing para revision',actor,'{}' FROM public.tb_compensacion_evento_revision WHERE id_evento=r.id;
 END IF;
 RETURN jsonb_build_object('id',r.id,'estado',CASE WHEN p_enviar AND r.estado_evento='BORRADOR' THEN 'PENDIENTE' ELSE r.estado_evento END);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_cliente_crear(p_documento text, p_nombre text, p_tipo_documento bigint DEFAULT 1, p_celular text DEFAULT NULL::text, p_id_comunidad bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE usuario bigint; activo bigint; nuevo public.tb_cliente%ROWTYPE;
BEGIN
  usuario:=public.f_private_compensacion_cliente_nuevo_usuario();
  PERFORM public.f_get_compensacion_cliente_nuevo_validar(p_documento,p_tipo_documento);
  IF coalesce(length(btrim(p_nombre)),0)<3 OR length(btrim(p_nombre))>200 THEN RAISE EXCEPTION 'Ingresa el nombre completo (3 a 200 caracteres)'; END IF;
  IF coalesce(p_celular,'')<>'' AND p_celular !~ '^[0-9]{9}$' THEN RAISE EXCEPTION 'El celular requiere 9 digitos'; END IF;
  IF p_id_comunidad IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tb_comunidad co JOIN public.tb_estado e ON e.id=co.id_estado WHERE co.id=p_id_comunidad AND upper(e.nombre)='ACTIVO') THEN RAISE EXCEPTION 'Comunidad no disponible'; END IF;
  -- Sin bloqueo de tabla: serializa por documento; la restriccion unica de tb_cliente cubre el alta operativa.
  SET LOCAL lock_timeout='3s';
  PERFORM pg_advisory_xact_lock(hashtextextended('cliente-nuevo:'||p_tipo_documento||':'||p_documento,0));
  IF (public.f_get_compensacion_cliente_nuevo_validar(p_documento,p_tipo_documento)->>'existe')::boolean THEN
    RAISE EXCEPTION 'El cliente ya existe. No corresponde un nuevo registro ni cambiar su creador'; END IF;
  SELECT id INTO activo FROM public.tb_estado WHERE upper(btrim(nombre))='ACTIVO' ORDER BY id LIMIT 1;
  IF activo IS NULL THEN RAISE EXCEPTION 'Falta configurar el estado Activo'; END IF;
  INSERT INTO public.tb_cliente(tipo_documento,numero_documento,nombre,celular,id_comunidad,id_estado,id_usuario)
    VALUES(p_tipo_documento,p_documento,btrim(p_nombre),nullif(p_celular,'')::bigint,p_id_comunidad,activo,usuario) RETURNING * INTO nuevo;
  RETURN jsonb_build_object('id',nuevo.id,'fecha_registro',nuevo.fecha_registro,'vence',nuevo.fecha_registro+interval '168 hours','estado','ESPERANDO_OPERACION');
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'El cliente ya existe. No corresponde un nuevo registro';
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_confirmar(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE e public.tb_compensacion_evento%ROWTYPE; pt public.tb_compensacion_penalidad_tipo%ROWTYPE; validacion jsonb;
BEGIN
 SELECT * INTO e FROM public.tb_compensacion_evento WHERE id=p_id FOR UPDATE;
 validacion:=public.f_private_compensacion_marketing_validar(p_id);
 IF (SELECT codigo FROM public.tb_compensacion_evento_tipo WHERE id=e.id_tipo_evento)='ALERTA_TEMPRANA' THEN
  PERFORM public.f_private_compensacion_pagos_periodo_editable(e.id_colaborador_responsable,e.periodo_imputacion);
  SELECT p.* INTO STRICT pt FROM (SELECT ax.* FROM public.tb_compensacion_asignacion ax JOIN public.tb_estado es ON es.id=ax.id_estado AND upper(btrim(es.nombre))='ACTIVO'
    WHERE ax.id_colaborador=e.id_colaborador_responsable AND (e.fecha_evento AT TIME ZONE 'America/Lima')::date BETWEEN ax.fecha_inicio AND coalesce(ax.fecha_fin,'infinity'::date)
    ORDER BY ax.fecha_inicio DESC,ax.id DESC LIMIT 1) a
  CROSS JOIN LATERAL public.f_private_compensacion_penalidades_fecha(a.id_plan,(e.fecha_evento AT TIME ZONE 'America/Lima')::date) p
  JOIN public.tb_estado es ON es.id=p.id_estado AND upper(btrim(es.nombre))='ACTIVO'
  WHERE p.id_cargo=a.id_cargo AND p.codigo=CASE WHEN e.datos#>>'{captura,motivo_tipo}'='ERROR_DATOS' THEN 'ATC_ERROR_DATOS' ELSE 'ATC_ABANDONO_CHAT' END
  ORDER BY p.id DESC LIMIT 1;
  validacion:=validacion||jsonb_build_object('id_penalidad_tipo',pt.id,'id_concepto_descuento',pt.id_concepto_descuento,'importe_descuento',e.importe_aprobado,'codigo_penalidad',pt.codigo,'deduplicacion','CONVERSACION_RESPONSABLE_DIA');
 END IF;
 UPDATE public.tb_compensacion_evento SET datos=datos||jsonb_build_object('revision_marketing',validacion||jsonb_build_object('fecha',clock_timestamp(),'id_usuario',(SELECT id FROM public.tb_usuario WHERE auth_user_id=auth.uid()))) WHERE id=e.id;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_consolidado(p_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT coalesce((SELECT EXISTS(SELECT 1 FROM public.tb_compensacion_reporte_mes rm JOIN public.tb_compensacion_periodo rp ON rp.id=rm.id_periodo WHERE rp.periodo=ev.periodo_imputacion AND rm.estado='CONFIRMADO') FROM public.tb_compensacion_evento ev WHERE ev.id=p_id),false);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_descuento_incidente(p_id_evento bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  ev public.tb_compensacion_evento%ROWTYPE;
  pt public.tb_compensacion_penalidad_tipo%ROWTYPE;
  dia date;
  mes date;
  perdio boolean;
BEGIN
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id_evento;
  IF ev.id IS NULL THEN RAISE EXCEPTION 'Incidencia inexistente'; END IF;
  pt:=public.f_private_compensacion_incidencia_penalidad_registrada(p_id_evento);
  IF pt.codigo IS NULL OR pt.codigo NOT IN ('MKT_UNIFORME','MKT_INDISCIPLINA') THEN
    RAISE EXCEPTION 'El calculo cronologico solo aplica a uniforme e indisciplina de Marketing';
  END IF;
  dia:=(ev.fecha_evento AT TIME ZONE 'America/Lima')::date;
  mes:=date_trunc('month',dia)::date;
  IF ev.periodo_imputacion IS DISTINCT FROM mes THEN
    RAISE EXCEPTION 'La incidencia debe imputarse al mes del hecho';
  END IF;
  IF ev.estado_evento NOT IN ('PENDIENTE','APROBADO','LIQUIDADO') THEN RETURN 0::numeric; END IF;

  -- Validar el cargo del responsable a la fecha del hecho, no el rol del actor
  -- administrativo que resuelve ni la sede actual del usuario de Marketing.
  -- La ultima asignacion activa vigente debe corresponder a la penalidad registrada.
  IF NOT EXISTS (
    SELECT 1 FROM (
      SELECT a.id_cargo FROM public.tb_compensacion_asignacion a
      JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
      WHERE a.id_colaborador=ev.id_colaborador_responsable
        AND dia BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)
      ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1
    ) vigente
    JOIN public.tb_compensacion_cargo ca ON ca.id=vigente.id_cargo
    WHERE ca.codigo='DISENO_MARKETING' AND ca.id=pt.id_cargo
  ) THEN RAISE EXCEPTION 'La incidencia requiere cargo DISENO_MARKETING vigente para el responsable'; END IF;

  -- Orden cronologico (fecha_evento,id), no orden de aprobacion. El candidato
  -- puede estar PENDIENTE; los antecedentes solo APROBADO/LIQUIDADO, excluyendo self.
  -- Uniforme: una sola multa por persona/dia, incluso entre versiones de PT.
  IF pt.codigo='MKT_UNIFORME' AND EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento ant
    LEFT JOIN public.tb_compensacion_penalidad_tipo ap ON ap.id=ant.id_penalidad_tipo
    WHERE ant.id<>ev.id AND ant.id_colaborador_responsable=ev.id_colaborador_responsable
      AND ant.estado_evento IN ('APROBADO','LIQUIDADO')
      AND coalesce(ant.criterios_validacion_snapshot->>'codigo_penalidad',
        ant.datos#>>'{penalidad_tipo_snapshot,codigo}',ap.codigo)='MKT_UNIFORME'
      AND (ant.fecha_evento AT TIME ZONE 'America/Lima')::date=dia
      AND (ant.fecha_evento,ant.id)<(ev.fecha_evento,ev.id)
  ) THEN RETURN 0::numeric; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento ant
    LEFT JOIN public.tb_compensacion_penalidad_tipo ap ON ap.id=ant.id_penalidad_tipo
    WHERE ant.id<>ev.id AND ant.id_colaborador_responsable=ev.id_colaborador_responsable
      AND ant.estado_evento IN ('APROBADO','LIQUIDADO')
      AND ant.periodo_imputacion=mes
      AND (ant.fecha_evento AT TIME ZONE 'America/Lima')::date>=mes
      AND (ant.fecha_evento,ant.id)<(ev.fecha_evento,ev.id)
      AND coalesce(ant.criterios_validacion_snapshot->>'codigo_penalidad',
        ant.datos#>>'{penalidad_tipo_snapshot,codigo}',ap.codigo)
          IN ('MKT_UNIFORME','MKT_INDISCIPLINA')
  ) OR EXISTS (
    -- La puntualidad la confirma el administrador en Bonos del mes (tb_compensacion_condicion_mes).
    SELECT 1 FROM public.tb_compensacion_condicion_mes cm
    JOIN public.tb_compensacion_periodo cp ON cp.id=cm.id_periodo AND cp.periodo=mes
    WHERE cm.id_colaborador=ev.id_colaborador_responsable AND cm.codigo_condicion='PUNTUALIDAD' AND NOT cm.cumple
  ) INTO perdio;
  -- Importe de la PT registrada (snapshot), nunca una tarifa fija nueva.
  RETURN CASE WHEN perdio THEN pt.monto_referencia ELSE 0::numeric END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_descuentos(p_periodo bigint, p_col bigint)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT jsonb_build_object('id_asignacion',NULL,'id_plan_version',NULL,'id_concepto',co.id,'id_regla',NULL,'tipo_origen','EVENTO',
 'clave_origen','MARKETING_ALERTA_DESCUENTO:'||e.id,'id_evento',e.id,'id_jornada',NULL,'id_operacion',NULL,'id_excepcion',NULL,
 'concepto_codigo',co.codigo,'concepto_nombre','Alerta Temprana Confirmada','categoria',co.categoria,'naturaleza','DESCUENTO',
 'regla_snapshot',e.datos->'revision_marketing','formula_snapshot','Contrapartida unica del bono al detector del mismo expediente',
 'base_calculo',1,'cantidad',1,'tarifa',e.importe_aprobado,'importe',e.importe_aprobado,
 'datos_origen',jsonb_build_object('id_penalidad_tipo',e.datos#>'{revision_marketing,id_penalidad_tipo}','codigo_penalidad',e.datos#>>'{revision_marketing,codigo_penalidad}','fecha_evento',e.fecha_evento,'hecho_clave',e.datos->>'hecho_clave'))
 FROM public.tb_compensacion_periodo pe JOIN public.tb_compensacion_evento e ON e.periodo_imputacion=pe.periodo AND e.id_colaborador_responsable=p_col
 JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento AND t.codigo='ALERTA_TEMPRANA'
 JOIN public.tb_compensacion_concepto co ON co.id=(e.datos#>>'{revision_marketing,id_concepto_descuento}')::bigint
 WHERE pe.id=p_periodo AND e.estado_evento='APROBADO' AND public.f_private_compensacion_marketing_evento_vigente(e.id)
 AND NOT public.f_private_compensacion_marketing_alerta_cubierta(e.id);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_evento_vigente(p_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE e public.tb_compensacion_evento%ROWTYPE; tipo text;
BEGIN
 SELECT * INTO e FROM public.tb_compensacion_evento WHERE id=p_id;
 IF e.id IS NULL THEN RETURN false; END IF;
 IF e.datos->>'flujo' IS DISTINCT FROM 'MARKETING_CAPTURA_V1' AND NOT EXISTS(
  SELECT 1 FROM public.tb_compensacion_asignacion a JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='DISENO_MARKETING'
  WHERE a.id_colaborador=e.id_colaborador_beneficiario AND (e.fecha_evento AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)) THEN RETURN true; END IF;
 SELECT codigo INTO tipo FROM public.tb_compensacion_evento_tipo WHERE id=e.id_tipo_evento;
 IF tipo IN('VIDEO_VIRAL','RECUPERACION_CLIENTE','ALERTA_TEMPRANA') THEN
  PERFORM public.f_private_compensacion_marketing_validar(e.id);
  IF tipo='ALERTA_TEMPRANA' AND e.estado_evento IN('APROBADO','LIQUIDADO') AND e.datos#>>'{revision_marketing,id_concepto_descuento}' IS NULL THEN RETURN false; END IF;
  IF tipo='VIDEO_VIRAL' AND EXISTS(SELECT 1 FROM public.tb_compensacion_evento x WHERE x.id<>e.id AND x.id_tipo_evento=e.id_tipo_evento AND x.estado_evento IN('APROBADO','LIQUIDADO')
    AND public.f_private_compensacion_marketing_publicacion(x.datos#>>'{captura,publicacion}')=public.f_private_compensacion_marketing_publicacion(e.datos#>>'{captura,publicacion}') AND (x.fecha_registro,x.id)<(e.fecha_registro,e.id)) THEN RETURN false; END IF;
  IF tipo='ALERTA_TEMPRANA' AND EXISTS(SELECT 1 FROM public.tb_compensacion_evento x WHERE x.id<>e.id AND x.id_tipo_evento=e.id_tipo_evento AND x.estado_evento IN('APROBADO','LIQUIDADO') AND x.id_colaborador_responsable=e.id_colaborador_responsable
    AND (x.fecha_evento AT TIME ZONE 'America/Lima')::date=(e.fecha_evento AT TIME ZONE 'America/Lima')::date
    AND lower(btrim(x.datos#>>'{captura,conversacion}'))=lower(btrim(e.datos#>>'{captura,conversacion}')) AND (x.fecha_registro,x.id)<(e.fecha_registro,e.id)) THEN RETURN false; END IF;
  RETURN true;
 ELSIF tipo='PROPUESTA_INNOVACION' THEN RETURN public.f_private_compensacion_innovacion_comprobada(p_id);
 ELSIF tipo='REFERIDO' THEN
  RETURN EXISTS(SELECT 1 FROM public.tb_compensacion_referido_operacion ro JOIN public.tb_compensacion_referido r ON r.id=ro.id_referido
    JOIN public.tb_operacion_proceso o ON o.id=ro.id_operacion JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
    WHERE ro.id_evento=e.id AND r.estado_referido='VALIDADO' AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada x WHERE x.id_operacion_proceso=o.id)
      AND public.f_private_compensacion_cliente_nuevo_operacion_estado(o.id)->>'pagada'='true' AND public.f_private_compensacion_referido_elegible(o,r.id_cliente,r.fecha_referencia,
      coalesce(t.configuracion->>'porcentaje_operacion_requerido',t.configuracion->>'tasa_operacion_requerida')::numeric)
      AND ro.monto_operacion_snapshot IS NOT DISTINCT FROM o.monto_deposito_cliente AND ro.porcentaje_operacion_snapshot IS NOT DISTINCT FROM o.comision_servicio
      AND ro.banco_snapshot IS NOT DISTINCT FROM o.nombre_banco_cliente AND ro.fecha_operacion_snapshot IS NOT DISTINCT FROM coalesce(o.fecha_pagado,o.fecha_deposito_cliente,o.fecha_registro));
 ELSIF tipo='TIKTOK_LIVE' AND e.datos->>'flujo' IS DISTINCT FROM 'TIKTOK_CLIENTE_NUEVO_7_DIAS' THEN RETURN false;
 END IF;
 RETURN true;
EXCEPTION WHEN raise_exception OR data_exception THEN RETURN false;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_inactividad(p_operacion bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 WITH actual AS (
   SELECT o.id,o.id_cliente,(d->>'fecha_pago')::timestamptz pago FROM public.tb_operacion_proceso o
   CROSS JOIN LATERAL public.f_private_compensacion_cliente_nuevo_operacion_estado(o.id) d WHERE o.id=p_operacion
 ), previo AS (
   SELECT a.pago,(SELECT max((d->>'fecha_pago')::timestamptz) FROM public.tb_operacion_proceso o
     CROSS JOIN LATERAL public.f_private_compensacion_cliente_nuevo_operacion_estado(o.id) d
     WHERE o.id_cliente=a.id_cliente AND o.id<>a.id AND d->>'pagada'='true' AND (d->>'fecha_pago')::timestamptz<a.pago) anterior
   FROM actual a
 )
 SELECT jsonb_build_object('pago_anterior',anterior,'dias_inactivo',floor(extract(epoch from pago-anterior)/86400)::integer,
   'recuperable',coalesce(pago-anterior>interval '60 days',false)) FROM previo;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_minimos(p_captura jsonb, p_config jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 IF p_config->>'vistas_minimas' IS NULL OR p_config->>'reacciones_minimas' IS NULL OR p_config->>'comentarios_minimos' IS NULL THEN RAISE EXCEPTION 'Falta la configuracion de metricas'; END IF;
 IF coalesce((p_captura->>'vistas')::bigint,0)<(p_config->>'vistas_minimas')::bigint OR coalesce((p_captura->>'likes')::bigint,0)<(p_config->>'reacciones_minimas')::bigint
   OR coalesce((p_captura->>'comentarios')::bigint,0)<(p_config->>'comentarios_minimos')::bigint THEN
   RAISE EXCEPTION 'El video aun no cumple los minimos: % vistas, % reacciones y % comentarios',p_config->>'vistas_minimas',p_config->>'reacciones_minimas',p_config->>'comentarios_minimos'; END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_operacion(p_id bigint, p_dni text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT jsonb_build_object('id',o.id,'dni',o.dni_cliente,'cliente',c.nombre,'id_cliente',c.id,'codigo',o.codigo_operacion_deposito_cliente,
  'servicio',o.tipo_servicio,'monto',o.monto_deposito_cliente,'estado',d->>'estado','pagada',d->>'pagada','fecha_pago',d->>'fecha_pago')
 FROM public.tb_operacion_proceso o JOIN public.tb_cliente c ON c.id=o.id_cliente
 CROSS JOIN LATERAL public.f_private_compensacion_cliente_nuevo_operacion_estado(o.id) d
 WHERE o.id=p_id AND c.numero_documento=p_dni AND o.dni_cliente=p_dni AND d->>'es_final'='true'
 AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada x WHERE x.id_operacion_proceso=o.id);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_perfil(p_col bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE r jsonb; n integer;
BEGIN
 SELECT count(*),jsonb_agg(jsonb_build_object('codigo',ca.codigo,'nombre',ca.nombre,'fecha_inicio',a.fecha_inicio,'fecha_fin',a.fecha_fin))->0 INTO n,r
 FROM public.tb_usuario u JOIN public.tb_estado eu ON eu.id=u.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
 JOIN public.tb_compensacion_colaborador c ON c.id_usuario=u.id
 JOIN public.tb_estado ec ON ec.id=c.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
 JOIN public.tb_compensacion_asignacion a ON a.id_colaborador=c.id
 JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
 JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo
 JOIN public.tb_estado ect ON ect.id=ca.id_estado AND upper(btrim(ect.nombre))='ACTIVO'
 WHERE u.auth_user_id=auth.uid() AND u.id_rol=6 AND NOT coalesce(u.flag_super_admin,false) AND c.id=p_col
 AND ca.codigo='DISENO_MARKETING'
 AND (now() AT TIME ZONE 'America/Lima')::date BETWEEN c.fecha_ingreso AND coalesce(c.fecha_cese,'infinity'::date)
 AND (now() AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date);
 IF n<>1 THEN RAISE EXCEPTION 'Marketing requiere una asignacion laboral activa, unica y vigente del area'; END IF;
 RETURN r;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_publicacion(p_url text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE u text:=regexp_replace(btrim(p_url),'#.*$',''); ident text;
BEGIN
 IF u ~* '^https://(www\.)?(youtube\.com|youtu\.be)/' THEN
  ident:=coalesce(substring(u from '(?:[?&]v=|youtu\.be/|/shorts/)([A-Za-z0-9_-]+)'),'');
  IF ident<>'' THEN RETURN 'youtube:'||ident; END IF;
 ELSIF u ~* '^https://([a-z]+\.)?tiktok\.com/' THEN
  ident:=substring(u from '/video/([0-9]+)'); IF ident IS NOT NULL THEN RETURN 'tiktok:'||ident; END IF;
 ELSIF u ~* '^https://(www\.)?instagram\.com/' THEN
  ident:=substring(u from '/(?:reel|p|tv)/([A-Za-z0-9_-]+)'); IF ident IS NOT NULL THEN RETURN 'instagram:'||ident; END IF;
 END IF;
 RETURN regexp_replace(regexp_replace(u,'([?&])(utm_[^=&]+|fbclid)=[^&]*','\1','gi'),'[?&]+$','');
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_revisor(p_id bigint, p_accion text DEFAULT 'CONSULTAR'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE e public.tb_compensacion_evento%ROWTYPE; ctx jsonb; actor bigint; col bigint; rol bigint; sede bigint; dia date; tipo text;
BEGIN
 SELECT * INTO e FROM public.tb_compensacion_evento WHERE id=p_id;
 IF e.id IS NULL OR e.datos->>'flujo' IS DISTINCT FROM 'MARKETING_CAPTURA_V1' THEN RAISE EXCEPTION 'Caso de Marketing inexistente'; END IF;
 SELECT id,id_rol INTO actor,rol FROM public.tb_usuario WHERE auth_user_id=auth.uid();
 tipo:=(SELECT codigo FROM public.tb_compensacion_evento_tipo WHERE id=e.id_tipo_evento);
 ctx:=public.f_private_compensacion_contexto('BONO:'||tipo,'CONSULTAR');
 col:=nullif(ctx->>'id_colaborador','')::bigint;
 IF NOT coalesce((ctx->>'es_super_admin')::boolean,false) THEN
  IF rol<>3 OR tipo NOT IN('ALERTA_TEMPRANA','RECUPERACION_CLIENTE') OR e.estado_evento='BORRADOR' THEN RAISE EXCEPTION 'Revision exclusiva de Administracion o Jefatura de la sede'; END IF;
  dia:=(e.fecha_evento AT TIME ZONE 'America/Lima')::date;sede:=(ctx->>'id_sucursal_alcance')::bigint;
  IF tipo='ALERTA_TEMPRANA' AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion a JOIN public.tb_estado es ON es.id=a.id_estado AND upper(btrim(es.nombre))='ACTIVO'
     JOIN public.tb_compensacion_colaborador c ON c.id=a.id_colaborador JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=4
     WHERE a.id_colaborador=e.id_colaborador_responsable AND a.id_sucursal=sede AND dia BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)) THEN
   RAISE EXCEPTION 'La alerta no pertenece al equipo historico de su sede'; END IF;
  IF tipo='RECUPERACION_CLIENTE' AND e.id_sucursal_origen IS DISTINCT FROM sede THEN RAISE EXCEPTION 'La recuperacion no pertenece a su sede'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion a JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo
     JOIN public.tb_estado es ON es.id=a.id_estado AND upper(btrim(es.nombre))='ACTIVO'
     WHERE a.id_colaborador=col AND a.id_sucursal=sede AND ca.codigo LIKE 'JEFE%' AND dia BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date))
   THEN RAISE EXCEPTION 'El caso no pertenece al equipo historico de su sede'; END IF;
 END IF;
 IF p_accion<>'CONSULTAR' AND (e.id_usuario_registra=actor OR col IN(e.id_colaborador_beneficiario,e.id_colaborador_responsable)
    OR EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador WHERE id IN(e.id_colaborador_beneficiario,e.id_colaborador_responsable) AND id_usuario=actor)) THEN RAISE EXCEPTION 'El hecho requiere un revisor independiente'; END IF;
 IF p_accion<>'CONSULTAR' AND tipo IN('ALERTA_TEMPRANA','RECUPERACION_CLIENTE') AND NOT coalesce((ctx->>'es_super_admin')::boolean,false) THEN RAISE EXCEPTION '%',CASE WHEN tipo='ALERTA_TEMPRANA' THEN 'La alerta la aprueba Administracion' ELSE 'La recuperacion la aprueba Administracion' END; END IF;
 RETURN ctx||jsonb_build_object('id_evento',p_id,'estado_evento',e.estado_evento);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_ruta_permitida(p_ruta text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT CASE WHEN p_ruta IS NULL THEN false
 WHEN split_part(split_part(rtrim(p_ruta,'/'),'?',1),'#',1) IN('/sistema','/reportes','/dashboard')
   OR p_ruta LIKE '/sistema/%' OR p_ruta LIKE '/reportes/%' THEN false
 WHEN p_ruta='/compensaciones' OR p_ruta LIKE '/compensaciones/%' THEN split_part(split_part(rtrim(p_ruta,'/'),'?',1),'#',1)
   IN('/compensaciones/resumen','/compensaciones/referidos','/compensaciones/otros-bonos/tiktok_live','/compensaciones/otros-bonos/propuesta_innovacion','/compensaciones/otros-bonos/video_viral','/compensaciones/otros-bonos/recuperacion_cliente',
   '/compensaciones/auditoria-operaciones','/compensaciones/indisciplina-colaborador')
 ELSE true END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_validar(p_evento bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE e public.tb_compensacion_evento%ROWTYPE; t text; cfg jsonb; op jsonb; pago timestamptz;
BEGIN
 SELECT * INTO e FROM public.tb_compensacion_evento WHERE id=p_evento;
 SELECT codigo INTO t FROM public.tb_compensacion_evento_tipo WHERE id=e.id_tipo_evento;
 IF e.id IS NULL OR e.datos->>'flujo' IS DISTINCT FROM 'MARKETING_CAPTURA_V1' THEN RAISE EXCEPTION 'El caso requiere captura de Marketing trazable'; END IF;
 IF t='VIDEO_VIRAL' THEN
  cfg:=e.criterios_validacion_snapshot#>'{regla_registro,configuracion}';
  IF date_trunc('month',e.fecha_evento AT TIME ZONE 'America/Lima') IS DISTINCT FROM date_trunc('month',(e.datos->>'fecha_medicion')::timestamptz AT TIME ZONE 'America/Lima') THEN RAISE EXCEPTION 'La medicion debe corresponder al mes de publicacion'; END IF;
  PERFORM public.f_private_compensacion_marketing_minimos(e.datos->'captura',cfg);
  RETURN jsonb_build_object('tipo',t,'metricas',cfg);
 ELSIF t='RECUPERACION_CLIENTE' THEN
  op:=public.f_private_compensacion_marketing_operacion((e.datos#>>'{captura,operacion_id}')::bigint,e.datos#>>'{captura,dni}');
  IF op IS NULL OR op->>'pagada'<>'true' THEN RAISE EXCEPTION 'La operacion final debe estar pagada'; END IF;
  pago:=(op->>'fecha_pago')::timestamptz;
  IF date_trunc('month',e.fecha_evento AT TIME ZONE 'America/Lima') IS DISTINCT FROM date_trunc('month',pago AT TIME ZONE 'America/Lima') THEN RAISE EXCEPTION 'La recuperacion debe imputarse al mes del pago'; END IF;
  cfg:=public.f_private_compensacion_marketing_inactividad((op->>'id')::bigint);
  IF cfg->>'recuperable'<>'true' THEN RAISE EXCEPTION 'Requiere historial previo y mas de 60 dias sin operar'; END IF;
  RETURN jsonb_build_object('tipo',t,'operacion',op,'pago_anterior',cfg->'pago_anterior','dias_inactivo',cfg->'dias_inactivo');
 ELSIF t='ALERTA_TEMPRANA' THEN
  IF e.datos#>>'{captura,motivo_tipo}'='CHAT_SIN_RESPUESTA' AND e.fecha_registro-(e.datos#>>'{captura,desde}')::timestamptz<=interval '20 minutes' THEN RAISE EXCEPTION 'El chat debe superar veinte minutos sin respuesta al reportar'; END IF;
  RETURN jsonb_build_object('tipo',t,'responsable',e.id_colaborador_responsable,'requiere_confirmacion_humana',true);
 ELSE RAISE EXCEPTION 'Concepto de Marketing invalido'; END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_marketing_visible(p_id bigint, p_ctx jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF coalesce((p_ctx->>'es_super_admin')::boolean,false) OR EXISTS(SELECT 1 FROM public.tb_compensacion_evento e WHERE e.id=p_id AND e.id_colaborador_beneficiario=nullif(p_ctx->>'id_colaborador','')::bigint) THEN RETURN true; END IF;
 PERFORM public.f_private_compensacion_marketing_revisor(p_id);RETURN true;
EXCEPTION WHEN raise_exception THEN RETURN false;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_mes_premio_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE ev record; codigo text; BEGIN
 IF TG_OP='UPDATE' AND OLD.id_tipo_evento IS DISTINCT FROM NEW.id_tipo_evento AND EXISTS(
 SELECT 1 FROM public.tb_compensacion_evento_tipo t WHERE t.id=OLD.id_tipo_evento AND t.codigo IN('COLABORADOR_MES_ATENCIONES','COLABORADOR_MES_CALIFICACIONES')) THEN
 RAISE EXCEPTION 'No se cambia el tipo de un premio mensual'; END IF;
 IF TG_OP='DELETE' THEN ev:=OLD; ELSE ev:=NEW; END IF;
 SELECT codigo_tipo.codigo INTO codigo FROM public.tb_compensacion_evento_tipo codigo_tipo WHERE id=ev.id_tipo_evento;
 IF codigo NOT IN('COLABORADOR_MES_ATENCIONES','COLABORADOR_MES_CALIFICACIONES') THEN
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Premio mensual inmutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_mes_premio p JOIN public.tb_compensacion_mes_adjudicacion a ON a.id=p.id_adjudicacion
 WHERE a.id=nullif(ev.datos->>'id_adjudicacion','')::bigint AND a.periodo=ev.periodo_imputacion
 AND p.id_colaborador=ev.id_colaborador_beneficiario AND ev.importe_aprobado=p.centimos/100.0
 AND codigo=CASE a.criterio WHEN 'ATENCIONES' THEN 'COLABORADOR_MES_ATENCIONES' ELSE 'COLABORADOR_MES_CALIFICACIONES' END
 AND ev.clave_origen='COLABORADOR_MES_79:'||a.id||':'||p.id_colaborador) THEN
 RAISE EXCEPTION 'Usa adjudicación mensual certificada; no premio manual'; END IF;
 IF TG_OP='UPDATE' AND ((to_jsonb(OLD)-'estado_evento'-'fecha_actualizacion') IS DISTINCT FROM (to_jsonb(NEW)-'estado_evento'-'fecha_actualizacion')
 OR (OLD.estado_evento IS DISTINCT FROM NEW.estado_evento AND NOT(OLD.estado_evento='APROBADO' AND NEW.estado_evento='LIQUIDADO'))) THEN
 RAISE EXCEPTION 'Premio sellado; corrección mediante ajuste auditado'; END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_mes_ranking(p_mes date, p_criterio text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE resultado jsonb; BEGIN
 IF p_mes IS NULL OR p_mes<>date_trunc('month',p_mes)::date OR p_criterio NOT IN('ATENCIONES','CALIFICACIONES') OR p_criterio IS NULL THEN RAISE EXCEPTION 'Criterio o mes inválido'; END IF;
 WITH equipo AS (
 SELECT DISTINCT ON(c.id) c.id,c.nombre_completo,a.id_sucursal,
 public.f_private_compensacion_puntualidad_condicion(p_mes,c.id) puntualidad
 FROM public.tb_compensacion_colaborador c JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=4
 JOIN public.tb_estado ec ON ec.id=c.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
 JOIN public.tb_compensacion_asignacion a ON a.id_colaborador=c.id
 JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='ATENCION_CLIENTE'
 JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
 WHERE a.fecha_inicio<p_mes+interval '1 month' AND (a.fecha_fin IS NULL OR a.fecha_fin>=p_mes)
 AND c.fecha_ingreso<p_mes+interval '1 month' AND (c.fecha_cese IS NULL OR c.fecha_cese>=p_mes)
 ORDER BY c.id,a.fecha_inicio DESC,a.id DESC
 ), fuente AS (
 SELECT eq.*,
 CASE WHEN EXISTS(SELECT 1 FROM public.tb_compensacion_pancake_mes WHERE periodo=p_mes)
 THEN (SELECT count(*) FROM public.tb_compensacion_pancake_conversacion pc WHERE pc.periodo=p_mes AND pc.id_colaborador=eq.id AND pc.efectiva)
 ELSE (SELECT count(*) FROM public.tb_compensacion_chat_dni cd WHERE cd.periodo=p_mes AND cd.id_colaborador=eq.id AND cd.estado='ACTIVO') END atenciones,
 (SELECT count(*) FROM public.tb_compensacion_evento ev JOIN public.tb_compensacion_evento_tipo te ON te.id=ev.id_tipo_evento
 WHERE te.codigo='CALIFICACION_PRESENCIAL' AND ev.id_colaborador_beneficiario=eq.id AND ev.periodo_imputacion=p_mes
 AND ev.estado_evento IN('APROBADO','LIQUIDADO')
 AND public.f_private_compensacion_calificacion_valida(ev.datos,ev.descripcion,eq.id,ev.criterios_validacion_snapshot->'validez_calificacion')
 AND EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia ref
 CROSS JOIN LATERAL public.f_private_compensacion_calificacion_operacion(ref.id_operacion) op
 WHERE ref.id_evento=ev.id AND ref.tipo_referencia='OPERACION' AND (op->>'pagada')::boolean)) estrellas,
 (SELECT count(DISTINCT coalesce(op->>'raiz',op->>'id')) FROM public.tb_compensacion_evento ev
 JOIN public.tb_compensacion_evento_tipo te ON te.id=ev.id_tipo_evento
 JOIN public.tb_compensacion_evento_referencia ref ON ref.id_evento=ev.id AND ref.tipo_referencia='OPERACION'
 CROSS JOIN LATERAL public.f_private_compensacion_calificacion_operacion(ref.id_operacion) op
 WHERE te.codigo='CALIFICACION_PRESENCIAL' AND ev.id_colaborador_beneficiario=eq.id AND ev.periodo_imputacion=p_mes
 AND ev.estado_evento IN('APROBADO','LIQUIDADO') AND (op->>'pagada')::boolean
 AND public.f_private_compensacion_calificacion_valida(ev.datos,ev.descripcion,eq.id,ev.criterios_validacion_snapshot->'validez_calificacion')) presenciales,
 (NOT EXISTS(SELECT 1 FROM public.tb_compensacion_pancake_mes WHERE periodo=p_mes)
 OR EXISTS(SELECT 1 FROM public.tb_compensacion_pancake_identidad pi WHERE pi.periodo=p_mes AND pi.id_colaborador=eq.id)) vinculada
 FROM equipo eq
 ), orden AS (
 SELECT id,dense_rank() OVER(ORDER BY CASE WHEN p_criterio='ATENCIONES' THEN atenciones ELSE estrellas END DESC,
 CASE WHEN p_criterio='CALIFICACIONES' THEN presenciales ELSE 0 END DESC) puesto
 FROM fuente WHERE puntualidad->>'estado'='CONSERVA' AND CASE WHEN p_criterio='ATENCIONES' THEN atenciones ELSE estrellas END>0
 ) SELECT jsonb_build_object('periodo',p_mes,'criterio',p_criterio,'bolsa_centimos',10000,
 'fuente',CASE WHEN EXISTS(SELECT 1 FROM public.tb_compensacion_pancake_mes WHERE periodo=p_mes) THEN 'PANCAKE' WHEN EXISTS(SELECT 1 FROM public.tb_compensacion_chat_dni cd WHERE cd.periodo=p_mes AND cd.estado='ACTIVO') THEN 'CHATS_DNI' ELSE NULL END,
 'revision_fuente',(SELECT revision FROM public.tb_compensacion_pancake_mes WHERE periodo=p_mes),
 'certificada',EXISTS(SELECT 1 FROM public.tb_compensacion_pancake_mes WHERE periodo=p_mes AND certificacion IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.tb_compensacion_chat_dni_mes WHERE periodo=p_mes),
 'estado',CASE WHEN p_criterio='ATENCIONES' AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_pancake_mes WHERE periodo=p_mes) AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_chat_dni cd WHERE cd.periodo=p_mes AND cd.estado='ACTIVO') THEN 'SIN_FUENTE'
 WHEN count(*)=0 OR bool_or((p_criterio='ATENCIONES' AND NOT vinculada) OR coalesce(puntualidad->>'estado','SIN_DATOS') NOT IN('CONSERVA','PERDIDO'))
 OR (p_criterio='ATENCIONES' AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_pancake_mes WHERE periodo=p_mes AND certificacion IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_chat_dni_mes WHERE periodo=p_mes)) THEN 'EN_REVISION'
 WHEN count(*) FILTER(WHERE o.puesto=1)=0 THEN 'SIN_CANDIDATOS' ELSE 'LISTO' END,
 'candidatos',coalesce(jsonb_agg(jsonb_build_object('id_colaborador',f.id,'nombre',f.nombre_completo,'id_sucursal',f.id_sucursal,
 'atenciones',atenciones,'calificaciones',estrellas,'presenciales',presenciales,'puntualidad',puntualidad,'puesto',o.puesto)
 ORDER BY f.id),'[]')) INTO resultado FROM fuente f LEFT JOIN orden o ON o.id=f.id;
 RETURN resultado||jsonb_build_object('version',md5(resultado::text));
END $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_meta_area_calcular(p_id_periodo bigint, p_id_colaborador bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE pe public.tb_compensacion_periodo%ROWTYPE; a public.tb_compensacion_asignacion%ROWTYPE;
  r public.tb_compensacion_regla%ROWTYPE; m jsonb; v_poblacion jsonb; v_n integer; v_rango integer;
  v_pendiente boolean; v_importe numeric; v_dias integer; v_umbral numeric;
BEGIN
  SELECT * INTO pe FROM public.tb_compensacion_periodo WHERE id=p_id_periodo;
  SELECT ax.* INTO a FROM public.tb_compensacion_asignacion ax
  JOIN public.tb_estado e ON e.id=ax.id_estado AND upper(e.nombre)='ACTIVO'
  WHERE ax.id_colaborador=p_id_colaborador AND ax.fecha_inicio<=pe.fecha_fin
    AND (ax.fecha_fin IS NULL OR ax.fecha_fin>=pe.fecha_fin)
  ORDER BY ax.fecha_inicio DESC,ax.id DESC LIMIT 1;
  IF a.id IS NULL OR a.modalidad<>'PRESENCIAL'
    OR NOT EXISTS(SELECT 1 FROM public.tb_compensacion_cargo WHERE id=a.id_cargo AND codigo='ATENCION_CLIENTE') THEN
    RETURN jsonb_build_object('detalles','[]'::jsonb,'bloqueos','[]'::jsonb);
  END IF;
  SELECT rx.* INTO r FROM public.f_private_compensacion_reglas_fecha(a.id_plan,pe.fecha_fin) rx
  JOIN public.tb_compensacion_concepto co ON co.id=rx.id_concepto AND co.codigo='BONO_META_AREA'
  JOIN public.tb_estado ec ON ec.id=co.id_estado AND upper(ec.nombre)='ACTIVO'
  JOIN public.tb_estado e ON e.id=rx.id_estado AND upper(e.nombre)='ACTIVO'
  WHERE (rx.id_cargo IS NULL OR rx.id_cargo=a.id_cargo) AND (rx.id_sucursal IS NULL OR rx.id_sucursal=a.id_sucursal)
  ORDER BY ((rx.id_cargo IS NOT NULL)::int+(rx.id_sucursal IS NOT NULL)::int) DESC,rx.prioridad DESC,rx.id DESC LIMIT 1;
  IF r.id IS NULL THEN RETURN jsonb_build_object('detalles','[]'::jsonb,'bloqueos','[]'::jsonb); END IF;
  IF r.tipo_calculo<>'FIJO' OR r.monto IS NULL OR r.monto<0 THEN RAISE EXCEPTION 'La bolsa de meta requiere un importe fijo no negativo'; END IF;
  IF r.tope_importe IS NOT NULL THEN r.monto:=LEAST(r.monto,r.tope_importe); END IF;
  v_umbral:=COALESCE((r.configuracion->>'umbral_porcentaje')::numeric,80);
  IF v_umbral<=0 OR v_umbral>100 THEN RAISE EXCEPTION 'El umbral de meta debe estar entre 0 y 100'; END IF;
  m:=public.f_private_compensacion_meta_evaluar(a.id_plan,a.id_sucursal,pe.periodo);
  IF (m->>'valor_meta')::numeric IS NULL OR (m->>'valor_meta')::numeric<=0 THEN
    RETURN jsonb_build_object('detalles','[]'::jsonb,'bloqueos',jsonb_build_array(jsonb_build_object(
      'codigo','META_SEDE_PENDIENTE','mensaje','Falta una meta SafetyPay positiva para la sede','id_sucursal',a.id_sucursal)),'meta',m);
  END IF;
  IF (m->>'porcentaje')::numeric<v_umbral OR r.monto=0 THEN
    RETURN jsonb_build_object('detalles','[]'::jsonb,'bloqueos','[]'::jsonb,'meta',m);
  END IF;
  WITH finales AS (
    SELECT DISTINCT ON(ax.id_colaborador) ax.*,c.fecha_ingreso,c.fecha_cese
    FROM public.tb_compensacion_asignacion ax
    JOIN public.tb_compensacion_colaborador c ON c.id=ax.id_colaborador
    JOIN public.tb_estado ec ON ec.id=c.id_estado AND upper(ec.nombre)='ACTIVO'
    JOIN public.tb_estado ea ON ea.id=ax.id_estado AND upper(ea.nombre)='ACTIVO'
    WHERE ax.fecha_inicio<=pe.fecha_fin AND (ax.fecha_fin IS NULL OR ax.fecha_fin>=pe.fecha_fin)
      AND c.fecha_ingreso<=pe.fecha_fin AND (c.fecha_cese IS NULL OR c.fecha_cese>=pe.fecha_fin)
    ORDER BY ax.id_colaborador,ax.fecha_inicio DESC,ax.id DESC
  ), candidatos AS (
    SELECT f.* FROM finales f JOIN public.tb_compensacion_cargo ca ON ca.id=f.id_cargo
    WHERE f.id_plan=a.id_plan AND f.id_sucursal=a.id_sucursal AND f.modalidad='PRESENCIAL' AND ca.codigo='ATENCION_CLIENTE'
      AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento ev
        LEFT JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id=ev.id_penalidad_tipo
        WHERE ev.id_colaborador_responsable=f.id_colaborador AND ev.periodo_imputacion=pe.periodo
          AND ev.estado_evento IN('APROBADO','LIQUIDADO')
          AND COALESCE(ev.datos#>>'{penalidad_tipo_snapshot,codigo}',pt.codigo)='ATC_FRAUDE_DIGITAL')
  ), dias AS (
    -- El administrador confirma en Bonos del mes si cada colaborador trabajó 15 días o más (META_AREA_15_DIAS).
    SELECT f.id_colaborador,CASE WHEN cm.cumple THEN 15 ELSE 0 END AS pagables,(cm.id IS NULL) AS pendiente
    FROM candidatos f
    LEFT JOIN public.tb_compensacion_condicion_mes cm ON cm.id_periodo=p_id_periodo AND cm.id_colaborador=f.id_colaborador
      AND cm.codigo_condicion='META_AREA_15_DIAS'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id_colaborador',id_colaborador,'dias_pagables',pagables,'pendiente',pendiente) ORDER BY id_colaborador),'[]'::jsonb),COALESCE(bool_or(pendiente),false)
  INTO v_poblacion,v_pendiente FROM dias;
  IF v_pendiente THEN RETURN jsonb_build_object('detalles','[]'::jsonb,'meta',m,'poblacion',v_poblacion,
    'bloqueos',jsonb_build_array(jsonb_build_object('codigo','META_POBLACION_PENDIENTE','mensaje','Confirma en Bonos del mes quién trabajó 15 días o más en la sede antes de repartir el bono'))); END IF;
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'id_colaborador')::bigint),'[]'::jsonb) INTO v_poblacion
  FROM jsonb_array_elements(v_poblacion) x WHERE (x->>'dias_pagables')::int>=15;
  v_n:=jsonb_array_length(v_poblacion);
  SELECT pos::int,(x->>'dias_pagables')::int INTO v_rango,v_dias FROM jsonb_array_elements(v_poblacion) WITH ORDINALITY q(x,pos)
  WHERE (x->>'id_colaborador')::bigint=p_id_colaborador;
  IF v_rango IS NULL THEN RETURN jsonb_build_object('detalles','[]'::jsonb,'bloqueos','[]'::jsonb,'meta',m,'poblacion',v_poblacion); END IF;
  IF EXISTS(SELECT 1 FROM public.tb_compensacion_evento ev JOIN public.tb_compensacion_evento_tipo te ON te.id=ev.id_tipo_evento
    WHERE ev.id_colaborador_beneficiario=p_id_colaborador AND ev.periodo_imputacion=pe.periodo
      AND ev.estado_evento IN('APROBADO','LIQUIDADO') AND te.id_concepto=r.id_concepto) THEN
    RETURN jsonb_build_object('detalles','[]'::jsonb,'meta',m,'bloqueos',jsonb_build_array(jsonb_build_object(
      'codigo','META_BONO_MANUAL_DUPLICADO','mensaje','Revisa el bono de meta manual antes del reparto automatico')));
  END IF;
  -- Centavos sobrantes por orden de id: suma exacta de la bolsa, sin inflarla.
  v_importe:=public.f_private_compensacion_meta_repartir_bolsa(r.monto,v_n,v_rango);
  RETURN jsonb_build_object('bloqueos','[]'::jsonb,'meta',m,'poblacion',v_poblacion,'detalles',jsonb_build_array(jsonb_build_object(
    'id_asignacion',NULL,'id_plan_version',r.id_plan_version,'fecha_inicio_tramo',NULL,'fecha_fin_tramo',NULL,
    'id_concepto',r.id_concepto,'id_regla',r.id,'tipo_origen','ASIGNACION',
    'clave_origen','META_AREA:'||a.id_plan||':'||a.id_sucursal||':'||pe.periodo||':'||p_id_colaborador,
    'id_evento',NULL,'id_jornada',NULL,'id_operacion',NULL,'id_excepcion',NULL,
    'concepto_codigo','BONO_META_AREA','concepto_nombre','Bono compartido de sede','categoria','BONO','naturaleza','INGRESO',
    'regla_snapshot',to_jsonb(r),'formula_snapshot','bolsa / asesores elegibles; resto de centavos por id',
    'base_calculo',(m->>'acumulado')::numeric,'cantidad',1,'tarifa',v_importe,'importe',v_importe,
    'datos_origen',jsonb_build_object('meta',m,'poblacion',v_poblacion,'bolsa',r.monto,'umbral',v_umbral,'dias_pagables',v_dias))));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_meta_evaluar(p_id_plan bigint, p_id_sucursal bigint, p_periodo date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_meta public.tb_compensacion_meta_sede%ROWTYPE;
  v_fin date := (date_trunc('month',p_periodo)+interval '1 month - 1 day')::date;
  v_inicio date := date_trunc('month',p_periodo)::date; v_monto numeric; v_ops bigint;
BEGIN
  SELECT m.* INTO v_meta FROM public.tb_compensacion_meta_sede m
  JOIN public.tb_compensacion_plan_version pv ON pv.id=m.id_plan_version
  JOIN public.tb_estado e ON e.id=m.id_estado AND upper(e.nombre)='ACTIVO'
  WHERE pv.id_plan=p_id_plan AND pv.estado_version IN('BORRADOR','PUBLICADA')
    AND m.id_sucursal=p_id_sucursal AND m.codigo_indicador='SAFETYPAY_MONTO'
    AND m.periodo<=v_inicio AND m.unidad='MONTO'
  ORDER BY m.periodo DESC,(pv.estado_version='BORRADOR') DESC,pv.numero_version DESC,m.id DESC LIMIT 1;

  WITH pagadas AS (
    SELECT DISTINCT ON (COALESCE(op.id_operacion_padre,op.id)) op.*,
      COALESCE(op.fecha_pagado,op.fecha_deposito_cliente,op.fecha_registro) AS fecha_efectiva
    FROM public.tb_operacion_proceso op
    WHERE upper(btrim(COALESCE(op.nombre_estado,'')))='PAGADO'
      AND upper(btrim(COALESCE(op.tipo_servicio,'')))='EFECTIVIZACION'
      AND lower(btrim(COALESCE(NULLIF(btrim(op.ruta_destino),''),op.ruta_origen,'')))='safetypay'
      AND (COALESCE(op.fecha_pagado,op.fecha_deposito_cliente,op.fecha_registro) AT TIME ZONE 'America/Lima')::date BETWEEN v_inicio AND v_fin
      AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada x WHERE x.id_operacion_proceso=op.id)
    ORDER BY COALESCE(op.id_operacion_padre,op.id),(op.id_operacion_padre IS NOT NULL) DESC,
      COALESCE(op.fecha_pagado,op.fecha_deposito_cliente,op.fecha_registro) DESC,op.id DESC
  )
  SELECT COALESCE(sum(GREATEST(COALESCE(op.monto_deposito_cliente,0),0)),0),count(*) INTO v_monto,v_ops
  FROM pagadas op
  -- La meta de sede sigue al asesor que hizo el pre-registro cruzado con la
  -- operacion; quien sube el Excel o la paga no cambia la sede atribuida.
  JOIN public.tb_compensacion_safetypay_registro sr ON sr.id_operacion_proceso=COALESCE(op.id_operacion_padre,op.id)
  JOIN public.tb_compensacion_colaborador c ON c.id_usuario=sr.id_usuario
  JOIN LATERAL (
    SELECT a.* FROM public.tb_compensacion_asignacion a
    JOIN public.tb_estado e ON e.id=a.id_estado AND upper(e.nombre)='ACTIVO'
    WHERE a.id_colaborador=c.id AND a.fecha_inicio<=(op.fecha_efectiva AT TIME ZONE 'America/Lima')::date
      AND (a.fecha_fin IS NULL OR a.fecha_fin>=(op.fecha_efectiva AT TIME ZONE 'America/Lima')::date)
    ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1
  ) a ON a.id_plan=p_id_plan AND a.id_sucursal=p_id_sucursal;
  RETURN jsonb_build_object('id_meta',v_meta.id,'meta_snapshot',to_jsonb(v_meta),
    'periodo',v_inicio,'periodo_origen',v_meta.periodo,'meta_heredada',v_meta.periodo<v_inicio,
    'valor_meta',v_meta.valor_meta,'acumulado',v_monto,'operaciones',v_ops,
    'porcentaje',CASE WHEN v_meta.valor_meta>0 THEN v_monto*100/v_meta.valor_meta ELSE NULL END,
    'fuente','OPERACIONES_PAGADAS_SAFETYPAY_V1','zona_horaria','America/Lima');
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_meta_repartir_bolsa(p_bolsa numeric, p_poblacion integer, p_posicion integer)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE centavos bigint; base bigint; sobrantes bigint;
BEGIN
  IF p_bolsa IS NULL OR p_bolsa<0 OR p_poblacion IS NULL OR p_poblacion<1
     OR p_posicion IS NULL OR p_posicion<1 OR p_posicion>p_poblacion THEN
    RAISE EXCEPTION 'Bolsa o posición de reparto inválida';
  END IF;
  centavos:=round(p_bolsa*100)::bigint;
  base:=centavos/p_poblacion;
  sobrantes:=mod(centavos,p_poblacion);
  RETURN (base+CASE WHEN p_posicion<=sobrantes THEN 1 ELSE 0 END)::numeric/100;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_meta_sede_chats(p_id_sucursal bigint, p_mes date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT jsonb_build_object(
    'pendientes',count(*) FILTER(WHERE ev.estado_evento='PENDIENTE'),
    'confirmados',count(*) FILTER(WHERE ev.estado_evento IN('APROBADO','LIQUIDADO')),
    'politica','META_100_CHATS_V2')
  FROM public.tb_compensacion_evento ev
  JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id=ev.id_penalidad_tipo
  WHERE p_id_sucursal IS NOT NULL AND p_mes IS NOT NULL
    AND ev.periodo_imputacion=date_trunc('month',p_mes)::date
    AND ev.estado_evento IN('PENDIENTE','APROBADO','LIQUIDADO')
    -- Tipos existentes que acreditan especificamente abandono de chats.
    -- Otros errores operativos, filtrado y textos libres no se infieren como descuido.
    AND coalesce(ev.criterios_validacion_snapshot->>'codigo_penalidad',pt.codigo)
      IN('ATC_ABANDONO_CHAT','JEFE_ABANDONO_SOLIDARIO')
    AND ev.id_sucursal_responsable=p_id_sucursal;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_mis_bonos_catalogo()
 RETURNS TABLE(codigo text, concepto text, tipo text, fuentes text[])
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 VALUES
  ('BONO_INNOVACION','Bono por Propuesta de Innovación','BONO',ARRAY['BONO_INNOVACION']),
 ('BONO_SEGURIDAD_TARJETA','Seguridad Tarjeta','BONO',ARRAY['BONO_SEGURIDAD_TARJETA']),
 ('COMISION_REGISTRO_EFECTIVIZACION','Registro Nuevo','COMISION',ARRAY['COMISION_REGISTRO_EFECTIVIZACION']),
 ('COMISION_CALIFICACION_PRESENCIAL','Atención Calificada','COMISION',ARRAY['COMISION_CALIFICACION_PRESENCIAL','BONO_REGISTRO_PRESENCIAL']),
 ('COMISION_REFERIDO','Referido','COMISION',ARRAY['COMISION_REFERIDO']),
 ('COMISION_LLAMADA','Llamada / Contacto','COMISION',ARRAY['COMISION_LLAMADA']),
 ('COMISION_TIKTOK_LIVE','TIKTOK LIVE','COMISION',ARRAY['COMISION_TIKTOK_LIVE']),
  ('ATC_ERROR_DATOS','Error de Datos','DESCUENTO',ARRAY['ATC_ERROR_DATOS']),
 ('ATC_ABANDONO_CHAT','Abandono Chat','DESCUENTO',ARRAY['ATC_ABANDONO_CHAT']),
 ('ATC_MAL_FLUJO','Mal Flujo CMR / Safety','DESCUENTO',ARRAY['ATC_MAL_FLUJO']),
 ('ATC_PROCESO_AIRE','Dejar Conversación / Proceso al Aire','DESCUENTO',ARRAY['ATC_PROCESO_AIRE']),
 ('ATC_ERROR_REGISTRO','Error en Registro Manual o Código','DESCUENTO',ARRAY['ATC_ERROR_REGISTRO']),
 ('ATC_UNIFORME','Falta de Uniforme Completo','DESCUENTO',ARRAY['ATC_UNIFORME']),
 ('ATC_INDISCIPLINA','Indisciplina Recurrente Activa','DESCUENTO',ARRAY['ATC_INDISCIPLINA']),
 ('ATC_FRAUDE_DIGITAL','Tolerancia Cero Digital','DESCUENTO',ARRAY['ATC_FRAUDE_DIGITAL']);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_mis_bonos_catalogo(p_id_rol bigint)
 RETURNS TABLE(codigo text, concepto text, tipo text, fuentes text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT ca.* FROM public.f_private_compensacion_mis_bonos_catalogo() ca WHERE p_id_rol=4
 UNION ALL
 SELECT j.* FROM (VALUES
 ('BONO_INNOVACION','Bono por Aporte e Innovación Operativa (Extra)','BONO',ARRAY['BONO_INNOVACION']),
  ('COMISION_REGISTRO_EFECTIVIZACION','Registro Nuevo','COMISION',ARRAY['COMISION_REGISTRO_EFECTIVIZACION']),
 ('COMISION_CALIFICACION_PRESENCIAL','Atención Calificada','COMISION',ARRAY['COMISION_CALIFICACION_PRESENCIAL']),
 ('COMISION_AUDITORIA_ACTIVA','Comisión de Auditoría Activa (Caza-Errores)','COMISION',ARRAY['COMISION_AUDITORIA_ACTIVA','BONO_REPORTE_INCIDENCIA']),
 ('COMISION_LLAMADA','Llamada / Contacto','COMISION',ARRAY['COMISION_LLAMADA']),
 ('COMISION_REFERIDO','Referido','COMISION',ARRAY['COMISION_REFERIDO']),
 ('COMISION_TIKTOK_LIVE','TIKTOK LIVE','COMISION',ARRAY['COMISION_TIKTOK_LIVE']),
  ('JEFE_ERROR_SUPERVISION','Error Supervisión','DESCUENTO',ARRAY['JEFE_ERROR_SUPERVISION']),
 ('JEFE_ABANDONO_SOLIDARIO','Abandono Chat (Solidario)','DESCUENTO',ARRAY['JEFE_ABANDONO_SOLIDARIO']),
 ('JEFE_QUEJA_TARDIA','Queja Tardía / Omisión de Reporte','DESCUENTO',ARRAY['JEFE_QUEJA_TARDIA']),
 ('JEFE_UNIFORME','Falta de Uniforme (Jefatura)','DESCUENTO',ARRAY['JEFE_UNIFORME']),
 ('JEFE_ERROR_CUADRO','Error en Cuadro de Comisiones','DESCUENTO',ARRAY['JEFE_ERROR_CUADRO']),
 ('JEFE_INDISCIPLINA','Indisciplina Recurrente Activa','DESCUENTO',ARRAY['JEFE_INDISCIPLINA'])
 ) j(codigo,concepto,tipo,fuentes) WHERE p_id_rol=3
 UNION ALL
 -- ESQUEMA 12 p.4: solo clasificacion. Importes y condiciones provienen del motor.
 SELECT f.* FROM (VALUES
  ('BONO_DETECCION_ERROR_PAGO','Detección de Error de Monto o Cuenta Antes / Después del Pago','BONO',ARRAY['BONO_DETECCION_ERROR_PAGO']),
 ('BONO_OPERACION_EXTRA','Operación Real No Registrada por Tienda / Pagos','BONO',ARRAY['BONO_OPERACION_EXTRA']),
 ('BONO_INNOVACION','Bono por Propuesta de Innovación','BONO',ARRAY['BONO_INNOVACION']),
 ('COMISION_REFERIDO','Referido','COMISION',ARRAY['COMISION_REFERIDO']),
  ('FAC_ERROR_SOLUCION','Error con Solución','DESCUENTO',ARRAY['FAC_ERROR_SOLUCION']),
 ('FAC_ERROR_SIN_SOLUCION','Error sin Solución','DESCUENTO',ARRAY['FAC_ERROR_SIN_SOLUCION']),
 ('FAC_UNIFORME','Falta de Uniforme Completo','DESCUENTO',ARRAY['FAC_UNIFORME']),
 ('FAC_INDISCIPLINA','Indisciplina Recurrente Activa','DESCUENTO',ARRAY['FAC_INDISCIPLINA'])
 ) f(codigo,concepto,tipo,fuentes) WHERE p_id_rol=5
 UNION ALL
 SELECT p.* FROM (VALUES
  ('BONO_CUADRE_PERFECTO','Cuadre Perfecto','BONO',ARRAY['BONO_CUADRE_PERFECTO']),
 ('BONO_REPORTE_ABANDONO','Bono por Reporte de Abandono Comercial','BONO',ARRAY['BONO_REPORTE_ABANDONO']),
 ('BONO_DETECCION_ERROR_MANUAL','Deteccion de Error en Datos Manuales / Codigos','BONO',ARRAY['BONO_DETECCION_ERROR_MANUAL']),
 ('BONO_INNOVACION','Bono por Propuesta de Innovación','BONO',ARRAY['BONO_INNOVACION']),
 ('COMISION_REFERIDO','Referido','COMISION',ARRAY['COMISION_REFERIDO']),
 ('COMISION_TIKTOK_LIVE','TIKTOK LIVE','COMISION',ARRAY['COMISION_TIKTOK_LIVE']),
 ('COMISION_REGISTRO_EFECTIVIZACION','Registro Nuevo','COMISION',ARRAY['COMISION_REGISTRO_EFECTIVIZACION','COMISION_AUDITAR_NUEVOS'])
 ) p(codigo,concepto,tipo,fuentes) WHERE p_id_rol=2
 UNION ALL
 SELECT 'PAG_'||x.sufijo,x.nombre,'DESCUENTO',array_agg(DISTINCT x.codigo ORDER BY x.codigo) FROM (
 SELECT pt.codigo,
 CASE WHEN pt.codigo LIKE '%_CIERRE_INCOMPLETO' THEN 'CIERRE_INCOMPLETO'
 WHEN pt.codigo LIKE '%_RETRASO_VOUCHER' THEN 'RETRASO_VOUCHER'
 WHEN pt.codigo LIKE '%_ERROR_PAGO_CRITICO' THEN 'ERROR_PAGO_CRITICO'
 WHEN pt.codigo LIKE '%_DESCUADRE' THEN 'DESCUADRE'
 WHEN pt.codigo LIKE '%_UNIFORME' THEN 'UNIFORME'
 WHEN pt.codigo LIKE '%_INDISCIPLINA' THEN 'INDISCIPLINA'
 WHEN pt.codigo LIKE '%_ERROR_CUADRO' THEN 'ERROR_CUADRO' END sufijo,
 CASE WHEN pt.codigo LIKE '%_CIERRE_INCOMPLETO' THEN 'Cierre Diario Incompleto'
 WHEN pt.codigo LIKE '%_RETRASO_VOUCHER' THEN 'Retraso de Vouchers'
 WHEN pt.codigo LIKE '%_ERROR_PAGO_CRITICO' THEN 'Error de Pago Crítico'
 WHEN pt.codigo LIKE '%_DESCUADRE' THEN 'Descuadre'
 WHEN pt.codigo LIKE '%_UNIFORME' THEN 'Falta de Uniforme Completo'
 WHEN pt.codigo LIKE '%_INDISCIPLINA' THEN 'Indisciplina Recurrente Activa'
 WHEN pt.codigo LIKE '%_ERROR_CUADRO' THEN 'Error en Cuadro de Comisiones' END nombre
 FROM public.tb_compensacion_penalidad_tipo pt JOIN public.tb_compensacion_cargo ca ON ca.id=pt.id_cargo
 WHERE ca.codigo IN('JEFE_SUPERIOR_PAGOS','OPERADOR_ALTA_DEMANDA','ENCARGADO_CARTERA_MEDIA','ASISTENTE_VIRTUAL_PAGOS') AND pt.codigo LIKE 'PAG_%' AND p_id_rol=2
 ) x WHERE x.sufijo IS NOT NULL GROUP BY x.sufijo,x.nombre
 UNION ALL
 SELECT m.* FROM (VALUES
  ('BONO_VIDEO_VIRAL','Bono por Video Viral','BONO',ARRAY['BONO_VIDEO_VIRAL']),
 ('BONO_INNOVACION','Bono por Propuesta de Innovación','BONO',ARRAY['BONO_INNOVACION']),
 ('BONO_RECUPERACION','Recuperación','BONO',ARRAY['BONO_RECUPERACION']),
 ('COMISION_ALERTA_TEMPRANA','Bono Co-Fiscalización / Alerta Temprana','COMISION',ARRAY['COMISION_ALERTA_TEMPRANA']),
 ('COMISION_REFERIDO','Referido','COMISION',ARRAY['COMISION_REFERIDO']),
 ('COMISION_TIKTOK_LIVE','TikTok Live','COMISION',ARRAY['COMISION_TIKTOK_LIVE']),
 ('MKT_UNIFORME','Falta de Uniforme Completo','DESCUENTO',ARRAY['MKT_UNIFORME']),
 ('MKT_INDISCIPLINA','Indisciplina Recurrente Activa','DESCUENTO',ARRAY['MKT_INDISCIPLINA'])
 ) m(codigo,concepto,tipo,fuentes) WHERE p_id_rol=6;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_mis_bonos_datos(p_mes date, p_vista text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; col bigint; usuario bigint; rol bigint; mes date; periodo bigint; liquidacion bigint;
 lineas jsonb:='[]'; registros jsonb; simulacion jsonb:='{}';
BEGIN
 ctx:=public.f_private_compensacion_contexto('MIS_BONOS','CONSULTAR');
 col:=nullif(ctx->>'id_colaborador','')::bigint;usuario:=nullif(ctx->>'id_usuario','')::bigint;
 SELECT u.id_rol INTO rol FROM public.tb_usuario u
   JOIN public.tb_estado eu ON eu.id=u.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
   JOIN public.tb_compensacion_colaborador c ON c.id_usuario=u.id
   JOIN public.tb_estado ec ON ec.id=c.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
   WHERE u.id=usuario AND u.auth_user_id=auth.uid() AND c.id=col AND NOT coalesce(u.flag_super_admin,false);
 IF ctx->>'alcance' IS DISTINCT FROM 'PROPIO' OR col IS NULL OR rol IS NULL OR rol NOT IN(2,3,4,5,6)
 THEN RAISE EXCEPTION 'Consulta exclusiva de un perfil personal de Compensaciones'; END IF;
 -- El rol de Facturacion no habilita administracion ni sustituye el cargo vigente.
 IF rol=5 AND (coalesce((ctx->>'es_admin')::boolean,false)
   OR coalesce((ctx->>'es_super_admin')::boolean,false) OR NOT EXISTS(
   SELECT 1 FROM public.tb_compensacion_asignacion a
   JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
   JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='FACTURACION'
   JOIN public.tb_estado ect ON ect.id=ca.id_estado AND upper(btrim(ect.nombre))='ACTIVO'
   WHERE a.id_colaborador=col AND (now() AT TIME ZONE 'America/Lima')::date
     BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)))
 THEN RAISE EXCEPTION 'Facturacion requiere cargo activo y vigente sin administracion'; END IF;
 IF rol=2 THEN PERFORM public.f_private_compensacion_pagos_perfil(col); END IF;
 IF rol=6 THEN PERFORM public.f_private_compensacion_marketing_perfil(col); END IF;
 IF p_mes IS NULL OR p_vista IS NULL OR p_vista NOT IN('SEGUIMIENTO','LIQUIDADO') THEN RAISE EXCEPTION 'Periodo o vista invalida'; END IF;
 mes:=date_trunc('month',p_mes)::date;
 PERFORM public.f_private_compensacion_periodo_actual_asegurar();
 SELECT id INTO periodo FROM public.tb_compensacion_periodo WHERE tb_compensacion_periodo.periodo=mes;
 -- Sin liquidación: el estado confirmado vendrá del reporte del mes (Fase 1B).
 liquidacion:=NULL;
 IF p_vista='SEGUIMIENTO' AND periodo IS NOT NULL AND NOT (rol IN(2,5,6) AND liquidacion IS NOT NULL) THEN
   -- 73/74 y 75 son dependencias opcionales del cache privado mensual.
   -- Detectar 75 conserva instalaciones legacy; los filtros NO integran su clave.
   IF rol NOT IN(2,5,6) AND to_regprocedure('public.f_private_compensacion_seguimiento_consultar(bigint,bigint)') IS NOT NULL THEN
     EXECUTE 'SELECT public.f_private_compensacion_seguimiento_consultar($1,$2)' INTO simulacion USING periodo,col;
   ELSE
     simulacion:=public.f_private_compensacion_bonos_mes_calcular(periodo,col);
   END IF;
   lineas:=coalesce(simulacion->'detalles','[]');
 END IF;
 WITH confirmadas AS (
   SELECT ca.codigo, j->>'concepto_codigo' concepto_origen,
     coalesce(j->'datos_origen'->>'fecha_atribucion',j->'datos_origen'->>'fecha_efectiva',j->'datos_origen'->>'fecha_evento',
       CASE WHEN p_vista='SEGUIMIENTO' THEN ev.fecha_evento::text END) fecha_filtro,
     j->>'clave_origen' clave,
     coalesce(j->'datos_origen'->>'fecha_atribucion',j->'datos_origen'->>'fecha_efectiva',j->'datos_origen'->>'fecha_evento',ev.fecha_evento::text,j->>'fecha',mes::text) fecha,
     CASE WHEN rol IN(2,5,6) OR (rol=3 AND (ca.tipo='DESCUENTO' OR ca.codigo IN('COMISION_AUDITORIA_ACTIVA'))) THEN ca.concepto
       ELSE coalesce(nullif(ev.titulo,''),j->>'concepto_nombre',ca.concepto) END descripcion,
     coalesce(j->>'estado','PROVISIONAL') estado,coalesce((j->>'cantidad')::numeric,1) cantidad,
     (j->>'importe')::numeric importe,false pendiente,j->>'tipo_origen' origen,
     CASE WHEN rol IN(2,5,6) OR (rol=3 AND (ca.tipo='DESCUENTO' OR ca.codigo IN('COMISION_AUDITORIA_ACTIVA'))) THEN NULL
       ELSE coalesce(j->'datos_origen'->>'dni_cliente',j->'datos_origen'->>'documento') END documento,
     CASE WHEN rol IN(2,5,6) OR (rol=3 AND (ca.tipo='DESCUENTO' OR ca.codigo IN('COMISION_AUDITORIA_ACTIVA'))) THEN NULL
       ELSE coalesce(j->'datos_origen'->>'nombre_cliente',j->'datos_origen'->>'nombre') END cliente,
     CASE WHEN rol IN(2,5,6) OR (rol=3 AND (ca.tipo='DESCUENTO' OR ca.codigo IN('COMISION_AUDITORIA_ACTIVA'))) THEN NULL
       ELSE coalesce(j->'datos_origen'->>'codigo_operacion',j->'datos_origen'->>'codigo',j->>'id_operacion') END operacion
   FROM jsonb_array_elements(lineas) j
   LEFT JOIN public.tb_compensacion_evento ev ON ev.id=nullif(j->>'id_evento','')::bigint
   LEFT JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id=coalesce(nullif(j->'datos_origen'->>'id_penalidad_tipo','')::bigint,ev.id_penalidad_tipo)
   JOIN public.f_private_compensacion_mis_bonos_catalogo(rol) ca ON
     CASE WHEN j->>'naturaleza'='DESCUENTO' AND pt.codigo IS NOT NULL THEN pt.codigo ELSE j->>'concepto_codigo' END=ANY(ca.fuentes)
   WHERE j->>'categoria'<>'SUELDO'
     AND NOT(rol=5 AND liquidacion IS NULL AND coalesce(ev.estado_evento='APROBADO',false) AND (
       (coalesce(ev.datos->>'flujo','')='FACTURACION_AUDITORIA_V1' AND NOT public.f_private_compensacion_facturacion_auditoria_vigente(ev.id))
       OR (EXISTS(SELECT 1 FROM public.tb_compensacion_evento_tipo tipo WHERE tipo.id=ev.id_tipo_evento AND tipo.codigo='PROPUESTA_INNOVACION')
         AND NOT public.f_private_compensacion_innovacion_comprobada(ev.id))))
 ), pendientes_evento AS (
   SELECT ca.codigo,co.codigo concepto_origen,ev.fecha_evento::text fecha_filtro,'EVENTO_PENDIENTE:'||ev.id clave,ev.fecha_evento::text fecha,
     CASE WHEN rol IN(2,3,5,6) THEN ca.concepto ELSE coalesce(nullif(ev.titulo,''),ca.concepto) END descripcion,ev.estado_evento::text estado,
     0::numeric cantidad,NULL::numeric importe,true pendiente,'EVENTO'::text origen,
     NULL::text documento,NULL::text cliente,NULL::text operacion
   FROM public.tb_compensacion_evento ev JOIN public.tb_compensacion_evento_tipo te ON te.id=ev.id_tipo_evento
   LEFT JOIN public.tb_compensacion_concepto co ON co.id=te.id_concepto
   LEFT JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id=ev.id_penalidad_tipo
   JOIN public.f_private_compensacion_mis_bonos_catalogo(rol) ca ON
     (CASE WHEN pt.codigo IS NOT NULL AND ev.id_colaborador_responsable=col THEN pt.codigo ELSE co.codigo END)=ANY(ca.fuentes)
   WHERE p_vista='SEGUIMIENTO' AND ev.estado_evento='PENDIENTE'
     AND CASE WHEN pt.codigo IS NOT NULL THEN ev.id_colaborador_responsable=col ELSE ev.id_colaborador_beneficiario=col END
     AND coalesce(ev.periodo_imputacion,date_trunc('month',ev.fecha_evento AT TIME ZONE 'America/Lima')::date)=mes
     AND ev.datos->>'flujo' IS DISTINCT FROM 'TIKTOK_CLIENTE_NUEVO_7_DIAS'
 ), pendientes_facturacion AS (
   SELECT ca.codigo,co.codigo concepto_origen,ev.fecha_evento::text fecha_filtro,'FACTURACION_REVISION:'||ev.id clave,ev.fecha_evento::text fecha,
     ca.concepto descripcion,CASE WHEN te.codigo='PROPUESTA_INNOVACION' THEN 'EN_IMPLEMENTACION' ELSE 'EN_REVISION' END estado,
     0::numeric cantidad,NULL::numeric importe,true pendiente,'EVENTO'::text origen,NULL::text documento,NULL::text cliente,NULL::text operacion
   FROM public.tb_compensacion_evento ev JOIN public.tb_compensacion_evento_tipo te ON te.id=ev.id_tipo_evento
   JOIN public.tb_compensacion_concepto co ON co.id=te.id_concepto
   JOIN public.f_private_compensacion_mis_bonos_catalogo(rol) ca ON co.codigo=ANY(ca.fuentes)
   WHERE rol IN(2,5,6) AND liquidacion IS NULL AND p_vista='SEGUIMIENTO' AND ev.estado_evento='APROBADO'
     AND ev.id_colaborador_beneficiario=col AND ev.periodo_imputacion=mes
     AND ((coalesce(ev.datos->>'flujo','')='FACTURACION_AUDITORIA_V1' AND NOT public.f_private_compensacion_facturacion_auditoria_vigente(ev.id))
       OR (te.codigo='PROPUESTA_INNOVACION' AND NOT public.f_private_compensacion_innovacion_comprobada(ev.id)) OR (rol=2 AND NOT public.f_private_compensacion_pagos_evento_vigente(ev.id)) OR (rol=6 AND NOT public.f_private_compensacion_marketing_evento_vigente(ev.id)))
 ), pendientes_auditoria AS (
   -- Un reporte puede descontar al responsable y premiar al reportante. Aqui
   -- solo se cuenta la expectativa propia del jefe, sin importe ni datos ajenos.
   SELECT ca.codigo,co.codigo concepto_origen,ev.fecha_evento::text fecha_filtro,'AUDITORIA_PENDIENTE:'||ev.id clave,ev.fecha_evento::text fecha,
     ca.concepto descripcion,ev.estado_evento::text estado,0::numeric cantidad,NULL::numeric importe,
     true pendiente,'EVENTO'::text origen,NULL::text documento,NULL::text cliente,NULL::text operacion
   FROM public.tb_compensacion_evento ev
   JOIN public.tb_compensacion_evento_tipo te ON te.id=ev.id_tipo_evento AND te.categoria IN('PENALIDAD','AUDITORIA_PAGO')
   JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id=ev.id_penalidad_tipo
   JOIN public.tb_compensacion_concepto co ON co.id=pt.id_concepto_bono_reportante
   JOIN public.f_private_compensacion_mis_bonos_catalogo(rol) ca ON co.codigo=ANY(ca.fuentes)
   WHERE rol=3 AND ca.codigo='COMISION_AUDITORIA_ACTIVA' AND p_vista='SEGUIMIENTO'
     AND ev.estado_evento='PENDIENTE' AND ev.id_colaborador_beneficiario=col
     AND ev.id_colaborador_responsable IS DISTINCT FROM col AND pt.monto_bono_reportante>0
     AND coalesce(ev.periodo_imputacion,date_trunc('month',ev.fecha_evento AT TIME ZONE 'America/Lima')::date)=mes
 ), pendientes_tiktok AS (
   SELECT 'COMISION_TIKTOK_LIVE'::text codigo,'COMISION_TIKTOK_LIVE'::text concepto_origen,t->>'fecha_registro' fecha_filtro,'TIKTOK_PENDIENTE:'||(t->>'id') clave,t->>'fecha_registro' fecha,
     'Registro de cliente TikTok Live'::text descripcion,t->>'estado' estado,0::numeric cantidad,NULL::numeric importe,
     true pendiente,'CLIENTE'::text origen,t->>'documento' documento,t->>'nombre' cliente,t->>'id_operacion' operacion
   FROM public.f_private_compensacion_tiktok_clientes(col) t WHERE p_vista='SEGUIMIENTO' AND rol IN(2,3,4,6)
     AND t->>'estado' IN('ESPERANDO_OPERACION','OPERACION_PENDIENTE')
     AND date_trunc('month',(t->>'fecha_registro')::timestamptz AT TIME ZONE 'America/Lima')::date=mes
 ), pendientes_cliente AS (
   SELECT 'COMISION_REGISTRO_EFECTIVIZACION'::text codigo,'COMISION_REGISTRO_EFECTIVIZACION'::text concepto_origen,c.fecha_registro::text fecha_filtro,'CLIENTE_PENDIENTE:'||c.id clave,c.fecha_registro::text fecha,
     'Registro de cliente nuevo'::text descripcion,'ESPERANDO_OPERACION'::text estado,0::numeric cantidad,NULL::numeric importe,
     true pendiente,'CLIENTE'::text origen,c.numero_documento::text documento,c.nombre::text cliente,NULL::text operacion
   FROM public.tb_cliente c WHERE p_vista='SEGUIMIENTO' AND c.id_usuario=usuario AND rol IN(2,3,4)
     AND date_trunc('month',c.fecha_registro AT TIME ZONE 'America/Lima')::date=mes AND now()<=c.fecha_registro+interval '168 hours'
     AND NOT EXISTS(
       -- Acotar por cliente antes de resolver el estado financiero. Sin esta
       -- barrera el plan puede evaluar el helper para operaciones de toda la tabla.
       WITH candidatas AS MATERIALIZED (
         SELECT op.id FROM public.tb_operacion_proceso op WHERE op.id_cliente=c.id
           AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada e WHERE e.id_operacion_proceso=op.id)
       ), estados AS MATERIALIZED (
         SELECT public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id) estado FROM candidatas op
       )
       SELECT 1 FROM estados WHERE (estado->>'pagada')::boolean
         AND (estado->>'fecha_pago')::timestamptz BETWEEN c.fecha_registro AND c.fecha_registro+interval '168 hours')
 ), todas AS(SELECT * FROM confirmadas UNION ALL SELECT * FROM pendientes_evento UNION ALL SELECT * FROM pendientes_facturacion UNION ALL SELECT * FROM pendientes_auditoria UNION ALL SELECT * FROM pendientes_tiktok UNION ALL SELECT * FROM pendientes_cliente)
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY codigo,clave),'[]') INTO registros FROM todas t;
 -- Proyectar campos operativos, nunca devolver simulacion, datos_origen,
 -- miembros de liderazgo, tramos, sueldos ni snapshots completos al navegador.
 RETURN jsonb_build_object('registros',registros,'perfil_rol',rol,'periodo',mes,'vista',p_vista,'periodo_disponible',periodo IS NOT NULL,
   'liquidacion_disponible',liquidacion IS NOT NULL,
   'estado_liquidacion',NULL::text,
   'cargo_actual',CASE WHEN rol=2 THEN public.f_private_compensacion_pagos_perfil(col) WHEN rol=6 THEN public.f_private_compensacion_marketing_perfil(col) END,
   'seguimiento_consolidado',rol IN(2,5,6) AND liquidacion IS NOT NULL AND p_vista='SEGUIMIENTO','advertencias',CASE WHEN rol IN(2,3,5,6) THEN
     (SELECT coalesce(jsonb_agg(jsonb_build_object('codigo',b->>'codigo','mensaje',
       CASE WHEN rol IN(2,5,6) THEN 'El motor tiene una observacion en el periodo propio.' ELSE b->>'mensaje' END)),'[]')
      FROM jsonb_array_elements(coalesce(simulacion->'bloqueos','[]')) b)
     ELSE coalesce(simulacion->'bloqueos','[]') END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pagos_cuadre_fuente(p_col bigint, p_mes date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT jsonb_build_object('operaciones',count(*),'pagadas',count(*) FILTER(WHERE d->>'pagada'='true'),
 'cerradas',count(*) FILTER(WHERE d->>'cierre_id' IS NOT NULL),
 'vouchers_validados',count(*) FILTER(WHERE d->>'voucher_estado'='VALIDADO'),
 'total',coalesce(sum((d->>'monto')::numeric) FILTER(WHERE d->>'pagada'='true'),0),
 'huella',md5(coalesce(string_agg(jsonb_build_array(d->>'id',d->>'dni',d->>'monto',d->>'transferencia',d->>'pagada',d->>'fecha_pago',d->>'cierre_id',d->>'voucher_estado')::text,'|' ORDER BY (d->>'id')::bigint),'')),
 'mes_cerrado',(now() AT TIME ZONE 'America/Lima')::date>=(date_trunc('month',p_mes)+interval '1 month')::date,
 'sin_descuadre',NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento e LEFT JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id=e.id_penalidad_tipo
  WHERE e.id_colaborador_responsable=p_col AND e.periodo_imputacion=date_trunc('month',p_mes)::date AND e.estado_evento IN('PENDIENTE','APROBADO','LIQUIDADO')
  AND coalesce(e.criterios_validacion_snapshot->>'codigo_penalidad',e.datos#>>'{penalidad_tipo_snapshot,codigo}',pt.codigo) ~ '^PAG_[A-Z_]+_DESCUADRE$'))
 FROM public.f_private_compensacion_pagos_fuentes(p_col,p_mes) d;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pagos_cuadro(p_id_periodo bigint, p_colaborador bigint, p_base_comisiones numeric)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- Error en cuadro de comisiones: ya no depende de eventos ni de ajustes; lo aplica Administración en Bonos del mes.
  SELECT public.f_private_compensacion_descuento_mes_lineas(p_id_periodo, p_colaborador, p_base_comisiones, 'ERROR_CUADRO');
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pagos_descuento_incidente(p_id_evento bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  ev public.tb_compensacion_evento%ROWTYPE;
  pt public.tb_compensacion_penalidad_tipo%ROWTYPE;
  dia date;
  mes date;
  perdio boolean;
BEGIN
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id_evento;
  IF ev.id IS NULL THEN RAISE EXCEPTION 'Incidencia inexistente'; END IF;
  pt:=public.f_private_compensacion_incidencia_penalidad_registrada(p_id_evento);
  IF pt.codigo IS NULL OR pt.codigo !~ '^PAG_[A-Z_]+_(UNIFORME|INDISCIPLINA)$' THEN
    RAISE EXCEPTION 'El calculo cronologico solo aplica a uniforme e indisciplina de Pagos';
  END IF;
  dia:=(ev.fecha_evento AT TIME ZONE 'America/Lima')::date;
  mes:=date_trunc('month',dia)::date;
  IF ev.periodo_imputacion IS DISTINCT FROM mes THEN
    RAISE EXCEPTION 'La incidencia debe imputarse al mes del hecho';
  END IF;
  IF ev.estado_evento NOT IN ('PENDIENTE','APROBADO','LIQUIDADO') THEN RETURN 0::numeric; END IF;

  -- Validar el cargo del responsable a la fecha del hecho, no el rol del actor
  -- administrativo que resuelve ni la sede actual del usuario de Pagos.
  -- La ultima asignacion activa vigente debe corresponder a la penalidad registrada.
  IF NOT EXISTS (
    SELECT 1 FROM (
      SELECT a.id_cargo FROM public.tb_compensacion_asignacion a
      JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
      WHERE a.id_colaborador=ev.id_colaborador_responsable
        AND dia BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)
      ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1
    ) vigente
    JOIN public.tb_compensacion_cargo ca ON ca.id=vigente.id_cargo
    WHERE ca.codigo IN('JEFE_SUPERIOR_PAGOS','OPERADOR_ALTA_DEMANDA','ENCARGADO_CARTERA_MEDIA','ASISTENTE_VIRTUAL_PAGOS') AND ca.id=pt.id_cargo
  ) THEN RAISE EXCEPTION 'La incidencia requiere cargo Pagos vigente para el responsable'; END IF;

  -- Orden cronologico (fecha_evento,id), no orden de aprobacion. El candidato
  -- puede estar PENDIENTE; los antecedentes solo APROBADO/LIQUIDADO, excluyendo self.
  -- Uniforme: una sola multa por persona/dia, incluso entre versiones de PT.
  IF pt.codigo ~ '_UNIFORME$' AND EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento ant
    LEFT JOIN public.tb_compensacion_penalidad_tipo ap ON ap.id=ant.id_penalidad_tipo
    WHERE ant.id<>ev.id AND ant.id_colaborador_responsable=ev.id_colaborador_responsable
      AND ant.estado_evento IN ('APROBADO','LIQUIDADO')
      AND coalesce(ant.criterios_validacion_snapshot->>'codigo_penalidad',
        ant.datos#>>'{penalidad_tipo_snapshot,codigo}',ap.codigo) ~ '^PAG_[A-Z_]+_UNIFORME$'
      AND (ant.fecha_evento AT TIME ZONE 'America/Lima')::date=dia
      AND (ant.fecha_evento,ant.id)<(ev.fecha_evento,ev.id)
  ) THEN RETURN 0::numeric; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento ant
    LEFT JOIN public.tb_compensacion_penalidad_tipo ap ON ap.id=ant.id_penalidad_tipo
    WHERE ant.id<>ev.id AND ant.id_colaborador_responsable=ev.id_colaborador_responsable
      AND ant.estado_evento IN ('APROBADO','LIQUIDADO')
      AND ant.periodo_imputacion=mes
      AND (ant.fecha_evento AT TIME ZONE 'America/Lima')::date>=mes
      AND (ant.fecha_evento,ant.id)<(ev.fecha_evento,ev.id)
      AND coalesce(ant.criterios_validacion_snapshot->>'codigo_penalidad',
        ant.datos#>>'{penalidad_tipo_snapshot,codigo}',ap.codigo)
          ~ '^PAG_[A-Z_]+_(UNIFORME|INDISCIPLINA)$'
  ) OR EXISTS (
    -- La puntualidad la confirma el administrador en Bonos del mes (tb_compensacion_condicion_mes).
    SELECT 1 FROM public.tb_compensacion_condicion_mes cm
    JOIN public.tb_compensacion_periodo cp ON cp.id=cm.id_periodo AND cp.periodo=mes
    WHERE cm.id_colaborador=ev.id_colaborador_responsable AND cm.codigo_condicion='PUNTUALIDAD' AND NOT cm.cumple
  ) INTO perdio;
  -- Importe de la PT registrada (snapshot), nunca una tarifa fija nueva.
  RETURN CASE WHEN perdio THEN pt.monto_referencia ELSE 0::numeric END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pagos_detalles(p_periodo bigint, p_col bigint)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT jsonb_build_object('id_asignacion',NULL,'id_plan_version',NULL,'id_concepto',co.id,'id_regla',e.id_regla_aplicada,
 'tipo_origen','EVENTO','clave_origen','EVENTO:'||e.id,'id_evento',e.id,'id_operacion',(e.datos->>'id_operacion')::bigint,
 'concepto_codigo',co.codigo,'concepto_nombre',co.nombre,'categoria',co.categoria,'naturaleza',co.naturaleza,
 'regla_snapshot',e.criterios_validacion_snapshot,'formula_snapshot','Evento de Pagos confirmado con fuente vigente',
 'base_calculo',e.base_calculo,'cantidad',e.cantidad,'tarifa',e.tarifa_aplicada,'importe',e.importe_aprobado,
 'datos_origen',jsonb_build_object('fecha_evento',e.fecha_evento,'tipo_evento',t.codigo))
 FROM public.tb_compensacion_periodo p JOIN public.tb_compensacion_evento e ON e.periodo_imputacion=p.periodo AND e.id_colaborador_beneficiario=p_col AND e.estado_evento='APROBADO'
 JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento AND t.categoria='AUDITORIA_PAGO'
 JOIN public.tb_compensacion_concepto co ON co.id=t.id_concepto
 JOIN public.tb_compensacion_colaborador c ON c.id=p_col JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=2
 WHERE p.id=p_periodo AND e.id_penalidad_tipo IS NULL AND t.codigo IN('DETECCION_ERROR_MANUAL','CUADRE_PERFECTO')
 AND public.f_private_compensacion_pagos_evento_vigente(e.id);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pagos_evento_vigente(p_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE e public.tb_compensacion_evento%ROWTYPE; t public.tb_compensacion_evento_tipo%ROWTYPE; fuente jsonb;
BEGIN
 SELECT * INTO e FROM public.tb_compensacion_evento WHERE id=p_id;
 SELECT * INTO t FROM public.tb_compensacion_evento_tipo WHERE id=e.id_tipo_evento;
 IF e.id IS NULL OR e.estado_evento<>'APROBADO' THEN RETURN false; END IF;
 IF t.codigo='PROPUESTA_INNOVACION' THEN RETURN public.f_private_compensacion_innovacion_comprobada(e.id); END IF;
 IF t.codigo='CUADRE_PERFECTO' THEN
  fuente:=public.f_private_compensacion_pagos_cuadre_fuente(e.id_colaborador_beneficiario,e.periodo_imputacion);
  -- SQL208: manual; Administracion registra y aprueba. Un Descuadre del mes lo sigue anulando.
  RETURN e.datos->>'flujo'='PAGOS_CUADRE_V1' AND e.datos#>>'{revision_bancaria,id_usuario}' IS NOT NULL
   AND fuente->>'mes_cerrado'='true' AND fuente->>'sin_descuadre'='true'
   AND EXISTS(SELECT 1 FROM public.tb_compensacion_evento_revision r JOIN public.tb_usuario u ON u.id=r.id_usuario_revisor AND (u.id_rol=1 OR coalesce(u.flag_super_admin,false))
    WHERE r.id_evento=e.id AND r.decision='APROBADO');
 END IF;
 IF e.datos->>'flujo'='PAGOS_DETECCION_V1' THEN
  RETURN EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia r JOIN public.tb_operacion_proceso o ON o.id=r.id_operacion
   WHERE r.id_evento=e.id AND r.tipo_referencia='OPERACION' AND o.id=(e.datos->>'id_operacion')::bigint
    AND btrim(o.dni_cliente)=e.datos#>>'{operacion,dni}' AND o.monto_deposito_cliente=(e.datos#>>'{operacion,monto}')::numeric
    AND upper(btrim(o.nombre_estado)) IN('PENDIENTE','PAGADO')
    AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada x WHERE x.id_operacion_proceso IN(o.id,coalesce(o.id_operacion_padre,o.id))))
   AND EXISTS(SELECT 1 FROM public.tb_compensacion_evento_revision r JOIN public.tb_usuario u ON u.id=r.id_usuario_revisor AND (u.id_rol=1 OR coalesce(u.flag_super_admin,false))
     WHERE r.id_evento=e.id AND r.decision='APROBADO' AND r.id_usuario_revisor<>e.id_usuario_registra)
   AND e.cantidad=1 AND e.importe_aprobado=least((e.criterios_validacion_snapshot#>>'{regla_registro,monto}')::numeric,
     coalesce((e.criterios_validacion_snapshot#>>'{regla_registro,tope_importe}')::numeric,(e.criterios_validacion_snapshot#>>'{regla_registro,monto}')::numeric));
 END IF;
 IF t.codigo IN('REGISTRO_PRESENCIAL','CALIFICACION_PRESENCIAL') THEN
  RETURN public.f_private_compensacion_calificacion_valida(e.datos,e.descripcion,e.id_colaborador_beneficiario,e.criterios_validacion_snapshot->'validez_calificacion')
   AND EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia r CROSS JOIN LATERAL public.f_private_compensacion_calificacion_operacion(r.id_operacion) op
    WHERE r.id_evento=e.id AND r.tipo_referencia='OPERACION' AND op->>'dni'=e.datos->>'cliente_documento');
 END IF;
 RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pagos_fuentes(p_col bigint, p_mes date)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT d||jsonb_build_object('fecha',coalesce((d->>'fecha_pago')::timestamptz,o.fecha_registro),'transferencia',o.monto_transferencia_cliente,
  'cierre_id',ch.id,'fecha_cierre',ch.fecha_cierre,
  'limite',(d->>'fecha_pago')::timestamptz+interval '48 hours',
  'cierre_estado',CASE WHEN NOT coalesce((d->>'pagada')::boolean,false) THEN 'OPERACION_PENDIENTE'
    WHEN ch.id IS NULL THEN CASE WHEN now()>(d->>'fecha_pago')::timestamptz+interval '48 hours' THEN 'POR_REVISAR' ELSE 'PENDIENTE' END
    WHEN ch.fecha_cierre>(d->>'fecha_pago')::timestamptz+interval '48 hours' THEN 'FUERA_DE_PLAZO' ELSE 'CERRADO' END,
  'entrega_id',v.id,'voucher_estado',CASE WHEN v.id IS NULL THEN 'SIN_ENTREGA' ELSE v.estado END,
  'fecha_entrega',v.fecha_entrega,'entrega_tardia',CASE WHEN v.id IS NULL THEN NULL ELSE v.fecha_entrega>(d->>'fecha_pago')::timestamptz+interval '48 hours' END,
  'voucher_evidencia',v.evidencia,'motivo_revision',v.motivo_revision)
 FROM public.tb_compensacion_colaborador c JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=2
 JOIN public.tb_operacion_proceso o ON coalesce(o.id_usuario_gestor,o.id_usuario)=u.id
 CROSS JOIN LATERAL public.f_private_compensacion_pagos_operacion(o.id,u.id) d
 LEFT JOIN public.tb_caja_operativa_cierre ch ON ch.id=coalesce(o.id_caja_cierre_salida,o.id_caja_cierre)
  AND ch.id_empresa=o.id_empresa_salida AND ch.id_empresa_cuenta_bancaria=o.id_empresa_cuenta_salida AND ch.fecha_cierre>=(d->>'fecha_pago')::timestamptz
 LEFT JOIN public.tb_compensacion_pagos_entrega v ON v.id_operacion=o.id AND v.id_colaborador=c.id
 WHERE c.id=p_col AND d IS NOT NULL
 AND (coalesce((d->>'fecha_pago')::timestamptz,o.fecha_registro) AT TIME ZONE 'America/Lima')::date>=date_trunc('month',p_mes)::date
 AND (coalesce((d->>'fecha_pago')::timestamptz,o.fecha_registro) AT TIME ZONE 'America/Lima')::date<(date_trunc('month',p_mes)+interval '1 month')::date;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pagos_operacion(p_id bigint, p_actor bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT jsonb_build_object('id',o.id,'id_cliente',o.id_cliente,'dni',btrim(o.dni_cliente),'cliente',o.nombre_cliente,
   'codigo',o.codigo_operacion_deposito_cliente,'monto',o.monto_deposito_cliente,'estado',o.nombre_estado,
   'pagada',coalesce((s->>'pagada')::boolean,false),'fecha_pago',s->>'fecha_pago','servicio',o.tipo_servicio,
   'id_usuario_registro',o.id_usuario,'id_usuario_gestor',o.id_usuario_gestor,
   'transferida',EXISTS(SELECT 1 FROM public.tb_operacion_caja m WHERE upper(btrim(m.tipo_movimiento))='SALIDA' AND m.monto_salida>0
     AND (m.id_operacion_proceso=coalesce(o.id_operacion_padre,o.id) OR m.id_operacion_proceso=o.id
       OR m.id_operacion_proceso IN(SELECT h.id FROM public.tb_operacion_proceso h WHERE h.id_operacion_padre=coalesce(o.id_operacion_padre,o.id)))))
 FROM public.tb_operacion_proceso o
 CROSS JOIN LATERAL public.f_private_compensacion_cliente_nuevo_operacion_estado(o.id) s
 WHERE o.id=p_id AND o.id_cliente IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.tb_cliente c WHERE c.id=o.id_cliente AND btrim(c.numero_documento)=btrim(o.dni_cliente))
 AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada e WHERE e.id_operacion_proceso IN(o.id,coalesce(o.id_operacion_padre,o.id)))
 AND coalesce((s->>'es_final')::boolean,false)
 AND upper(btrim(o.nombre_estado)) IN('PENDIENTE','PAGADO')
 AND EXISTS(SELECT 1 FROM public.tb_permiso_usuario pu JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
   JOIN public.tb_estado ep ON ep.id=pu.id_estado AND upper(btrim(ep.nombre))='ACTIVO'
   JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
   WHERE pu.id_usuario=p_actor AND pm.ruta='/operaciones/'||CASE lower(btrim(coalesce(nullif(o.ruta_destino,''),nullif(o.ruta_origen,''),
     CASE WHEN upper(o.tipo_servicio) LIKE '%DEUDA%' THEN 'pagodeuda' WHEN upper(o.tipo_servicio) LIKE '%POS%' THEN 'pos'
       WHEN upper(o.tipo_servicio) LIKE '%LINK%' THEN 'linkpago' END)))
     WHEN 'safetypay' THEN 'interbank' WHEN 'link_pago' THEN 'linkpago'
     ELSE lower(btrim(coalesce(nullif(o.ruta_destino,''),nullif(o.ruta_origen,''),
       CASE WHEN upper(o.tipo_servicio) LIKE '%DEUDA%' THEN 'pagodeuda' WHEN upper(o.tipo_servicio) LIKE '%POS%' THEN 'pos'
       WHEN upper(o.tipo_servicio) LIKE '%LINK%' THEN 'linkpago' END))) END);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pagos_perfil(p_col bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE r jsonb; n integer;
BEGIN
 SELECT count(*),jsonb_agg(jsonb_build_object('codigo',ca.codigo,'nombre',ca.nombre,'fecha_inicio',a.fecha_inicio,'fecha_fin',a.fecha_fin))->0 INTO n,r
 FROM public.tb_usuario u JOIN public.tb_estado eu ON eu.id=u.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
 JOIN public.tb_compensacion_colaborador c ON c.id_usuario=u.id
 JOIN public.tb_estado ec ON ec.id=c.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
 JOIN public.tb_compensacion_asignacion a ON a.id_colaborador=c.id
 JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
 JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo
 JOIN public.tb_estado ect ON ect.id=ca.id_estado AND upper(btrim(ect.nombre))='ACTIVO'
 WHERE u.auth_user_id=auth.uid() AND u.id_rol=2 AND NOT coalesce(u.flag_super_admin,false) AND c.id=p_col
 AND ca.codigo IN('JEFE_SUPERIOR_PAGOS','OPERADOR_ALTA_DEMANDA','ENCARGADO_CARTERA_MEDIA','ASISTENTE_VIRTUAL_PAGOS')
 AND (now() AT TIME ZONE 'America/Lima')::date BETWEEN c.fecha_ingreso AND coalesce(c.fecha_cese,'infinity'::date)
 AND (now() AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date);
 IF n<>1 THEN RAISE EXCEPTION 'Pagos requiere una asignacion laboral activa, unica y vigente del area'; END IF;
 RETURN r;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pagos_periodo_editable(p_col bigint, p_mes date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 PERFORM pe.id FROM public.tb_compensacion_periodo pe WHERE pe.periodo=date_trunc('month',p_mes)::date ORDER BY pe.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_periodo pe WHERE pe.periodo=date_trunc('month',p_mes)::date AND
  (pe.estado_periodo IN('APROBADO','CERRADO') OR EXISTS(SELECT 1 FROM public.tb_compensacion_reporte_mes rm WHERE rm.id_periodo=pe.id AND rm.estado='CONFIRMADO'))) THEN
  RAISE EXCEPTION 'Periodo o reporte confirmado: corresponde un ajuste autorizado'; END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pagos_registro_elegible(p_cliente bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT jsonb_build_object('id',op.id,'codigo',op.codigo_operacion_deposito_cliente,'monto',op.monto_deposito_cliente,
   'fecha_pago',st->>'fecha_pago','gestor',coalesce(op.id_usuario_gestor,op.id_usuario))
 FROM public.tb_cliente c
 JOIN public.tb_operacion_proceso op ON op.id_cliente=c.id
 CROSS JOIN LATERAL public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id) st
 WHERE c.id=p_cliente AND upper(btrim(coalesce(op.nombre_estado,'')))='PAGADO' AND (st->>'pagada')::boolean
   AND (st->>'fecha_pago')::timestamptz BETWEEN c.fecha_registro AND c.fecha_registro+interval '168 hours'
   AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada e WHERE e.id_operacion_proceso=op.id)
 ORDER BY (st->>'fecha_pago')::timestamptz,op.id LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pagos_registro_validador()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE u public.tb_usuario%ROWTYPE; col bigint;
BEGIN
  SELECT * INTO u FROM public.tb_usuario WHERE auth_user_id=auth.uid();
  IF u.id IS NULL OR u.id_rol IS DISTINCT FROM 2 OR coalesce(u.flag_super_admin,false) THEN RETURN NULL; END IF;
  SELECT c.id INTO col FROM public.tb_compensacion_colaborador c
    JOIN public.tb_compensacion_asignacion a ON a.id_colaborador=c.id
    JOIN public.tb_estado es ON es.id=a.id_estado AND upper(btrim(es.nombre))='ACTIVO'
    JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='JEFE_SUPERIOR_PAGOS'
    WHERE c.id_usuario=u.id AND (now() AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)
    ORDER BY a.id DESC LIMIT 1;
  IF col IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id_usuario',u.id,'id_colaborador',col);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pagos_ruta_permitida(p_ruta text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT CASE WHEN p_ruta IS NULL THEN false
 WHEN p_ruta='/sistema' OR p_ruta LIKE '/sistema/%' THEN false
 WHEN p_ruta LIKE '/compensaciones/%' THEN split_part(split_part(rtrim(p_ruta,'/'), '?',1),'#',1)
 IN('/compensaciones/resumen','/compensaciones/atenciones','/compensaciones/referidos',
 '/compensaciones/otros-bonos/tiktok_live','/compensaciones/otros-bonos/propuesta_innovacion',
 '/compensaciones/auditoria-operaciones','/compensaciones/auditoria-cuadre-cierre',
 '/compensaciones/indisciplina-colaborador','/compensaciones/penalidad-escalonada-bonos')
 ELSE true END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pagos_validador()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE u public.tb_usuario%ROWTYPE; col bigint; sede bigint;
BEGIN
  SELECT * INTO u FROM public.tb_usuario WHERE auth_user_id=auth.uid();
  IF u.id IS NULL OR u.id_rol IS DISTINCT FROM 3 OR coalesce(u.flag_super_admin,false) THEN
    RAISE EXCEPTION 'Validacion exclusiva de la Jefatura de la sede'; END IF;
  SELECT c.id,a.id_sucursal INTO col,sede FROM public.tb_compensacion_colaborador c
    JOIN public.tb_compensacion_asignacion a ON a.id_colaborador=c.id
    JOIN public.tb_estado es ON es.id=a.id_estado AND upper(btrim(es.nombre))='ACTIVO'
    JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='JEFE_TIENDA'
    WHERE c.id_usuario=u.id AND (now() AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)
    ORDER BY a.id DESC LIMIT 1;
  IF col IS NULL THEN RAISE EXCEPTION 'No tienes una jefatura de sede vigente'; END IF;
  RETURN jsonb_build_object('id_usuario',u.id,'id_colaborador',col,'id_sucursal',sede);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pancake_abierto(p_mes date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE s text; pid bigint; BEGIN
 IF p_mes IS NULL OR p_mes<>date_trunc('month',p_mes)::date THEN RAISE EXCEPTION 'Periodo mensual obligatorio'; END IF;
 SELECT id,estado_periodo INTO pid,s FROM public.tb_compensacion_periodo WHERE periodo=p_mes FOR SHARE;
 IF pid IS NULL OR s NOT IN('ABIERTO','REABIERTO','OBSERVADO') THEN RAISE EXCEPTION 'Periodo ausente, en cálculo o cerrado'; END IF;
 IF public.f_private_compensacion_reporte_mes_confirmado(pid) THEN
 RAISE EXCEPTION 'El reporte del mes está confirmado; reábrelo para cambiar'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pancake_actor()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE c jsonb; u bigint; BEGIN
 c:=public.f_private_compensacion_contexto('EVIDENCIAS','CONSULTAR'); u:=(c->>'id_usuario')::bigint;
 IF u IS NULL OR NOT (coalesce((c->>'es_super_admin')::boolean,false)
 OR EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=u AND id_rol=1)) THEN
 RAISE EXCEPTION 'Solo Administración puede importar o adjudicar'; END IF;
 RETURN u;
END $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pancake_csv(p_original text, p_separador text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE s text:=p_original; i integer:=1; n integer; ch text; token text:=''; quoted boolean:=false;
 closed boolean:=false; row_data text[]:='{}'; headers text[]; result jsonb:='[]'; obj jsonb; j integer;
BEGIN
 IF p_separador IS NULL OR p_separador NOT IN(',', ';',E'\t') THEN RAISE EXCEPTION 'Separador CSV inválido'; END IF;
 IF left(s,1)=chr(65279) THEN s:=substr(s,2); END IF; n:=length(s);
 WHILE i<=n+1 LOOP
 ch:=CASE WHEN i=n+1 THEN E'\n' ELSE substr(s,i,1) END;
 IF quoted THEN
 IF i>n THEN RAISE EXCEPTION 'CSV con comillas sin cerrar'; END IF;
 IF ch='"' THEN
 IF substr(s,i+1,1)='"' THEN token:=token||'"'; i:=i+1;
 ELSE quoted:=false; closed:=true; END IF;
 ELSE token:=token||ch; END IF;
 ELSE
 IF ch='"' AND token='' AND NOT closed THEN quoted:=true;
 ELSIF ch=p_separador OR ch IN(E'\n',E'\r') THEN
 row_data:=array_append(row_data,token); token:=''; closed:=false;
 IF cardinality(row_data)>100 THEN RAISE EXCEPTION 'CSV supera 100 columnas'; END IF;
 IF ch<>p_separador THEN
 IF NOT(cardinality(row_data)=1 AND row_data[1]='') THEN
 IF headers IS NULL THEN
 headers:=row_data;
 IF EXISTS(SELECT 1 FROM unnest(headers) h WHERE btrim(h)='') OR (SELECT count(DISTINCT h) FROM unnest(headers) h)<>cardinality(headers) THEN
 RAISE EXCEPTION 'Cabeceras CSV vacías o repetidas'; END IF;
 ELSE
 IF cardinality(row_data)<>cardinality(headers) THEN RAISE EXCEPTION 'Fila CSV con columnas distintas'; END IF;
 obj:='{}'; FOR j IN 1..cardinality(headers) LOOP obj:=obj||jsonb_build_object(headers[j],row_data[j]); END LOOP;
 result:=result||jsonb_build_array(obj);
 IF jsonb_array_length(result)>20000 THEN RAISE EXCEPTION 'CSV supera 20000 conversaciones'; END IF;
 END IF;
 END IF;
 row_data:='{}';
 IF ch=E'\r' AND substr(s,i+1,1)=E'\n' THEN i:=i+1; END IF;
 END IF;
 ELSIF closed OR ch='"' THEN RAISE EXCEPTION 'Comillas CSV mal ubicadas';
 ELSE token:=token||ch; END IF;
 END IF;
 IF length(token)>100000 THEN RAISE EXCEPTION 'Campo CSV demasiado largo'; END IF;
 i:=i+1;
 END LOOP;
 IF headers IS NULL THEN RAISE EXCEPTION 'CSV sin cabeceras'; END IF;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_penalidades_fecha(p_id_plan bigint, p_fecha date)
 RETURNS SETOF tb_compensacion_penalidad_tipo
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_snapshot jsonb; v_version bigint;
BEGIN
  SELECT ce.penalidades_snapshot INTO v_snapshot
  FROM public.tb_compensacion_configuracion_efectiva ce
  WHERE ce.id_plan = p_id_plan AND ce.fecha_desde <= p_fecha
  ORDER BY ce.fecha_desde DESC, ce.id DESC LIMIT 1;
  IF v_snapshot IS NOT NULL THEN
    RETURN QUERY SELECT * FROM jsonb_populate_recordset(NULL::public.tb_compensacion_penalidad_tipo, v_snapshot);
    RETURN;
  END IF;
  -- No inventar tarifas de penalidades para guardados antiguos sin captura.
  SELECT pv.id INTO v_version FROM public.tb_compensacion_plan_version pv
  WHERE pv.id_plan = p_id_plan AND pv.estado_version = 'PUBLICADA'
    AND pv.fecha_inicio <= p_fecha AND (pv.fecha_fin IS NULL OR pv.fecha_fin >= p_fecha)
  ORDER BY pv.numero_version DESC LIMIT 1;
  RETURN QUERY SELECT pt.* FROM public.tb_compensacion_penalidad_tipo pt WHERE pt.id_plan_version = v_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_periodo_actual_asegurar()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_mes date := date_trunc('month', statement_timestamp() AT TIME ZONE 'America/Lima')::date;
  v_id bigint;
BEGIN
  SELECT id INTO v_id FROM public.tb_compensacion_periodo WHERE periodo=v_mes;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO public.tb_compensacion_periodo
    (periodo,nombre,fecha_inicio,fecha_fin,zona_horaria,estado_periodo,numero_calculo,
     id_usuario_abre,id_usuario_actualiza,apertura_automatica)
  VALUES (v_mes,to_char(v_mes,'YYYY-MM'),v_mes,(v_mes+interval '1 month - 1 day')::date,
          'America/Lima','ABIERTO',0,NULL,NULL,true)
  ON CONFLICT (periodo) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.tb_compensacion_periodo WHERE periodo=v_mes;
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_puntualidad_condicion(p_mes date, p_id_colaborador bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT CASE
    WHEN cm.id IS NULL THEN jsonb_build_object('estado','SIN_DATOS','motivo','Falta confirmar la puntualidad en Bonos del mes')
    WHEN cm.cumple THEN jsonb_build_object('estado','CONSERVA','motivo',coalesce(nullif(btrim(cm.nota),''),'Confirmada por Administración'))
    ELSE jsonb_build_object('estado','PERDIDO','motivo',coalesce(nullif(btrim(cm.nota),''),'Perdida según Administración')) END
  FROM (SELECT 1) x
  LEFT JOIN public.tb_compensacion_periodo pe ON pe.periodo = date_trunc('month', p_mes)::date
  LEFT JOIN public.tb_compensacion_condicion_mes cm ON cm.id_periodo = pe.id AND cm.id_colaborador = p_id_colaborador AND cm.codigo_condicion = 'PUNTUALIDAD';
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_queja_tardia_excepcion(p_id_evento bigint, p_id_usuario bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS(
    SELECT 1
    FROM public.tb_compensacion_evento e
    JOIN public.tb_usuario registrador ON registrador.id=e.id_usuario_registra
      AND (registrador.id_rol=1 OR coalesce(registrador.flag_super_admin,false))
    JOIN public.tb_usuario decisor ON decisor.id=p_id_usuario
      AND (decisor.id_rol=1 OR coalesce(decisor.flag_super_admin,false))
    WHERE e.id=p_id_evento
      AND (public.f_private_compensacion_incidencia_penalidad_registrada(e.id)).codigo='JEFE_QUEJA_TARDIA'
  );
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_referido_coincidencias(p_id bigint)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT jsonb_build_object('id',op.id,'codigo',op.codigo_operacion_deposito_cliente,'banco',op.nombre_banco_cliente,
 'monto',op.monto_deposito_cliente,'fecha',op.fecha_pagado,'porcentaje',op.comision_servicio)
 FROM public.tb_compensacion_referido r JOIN public.tb_compensacion_evento ev ON ev.id=r.id_evento
 JOIN public.tb_operacion_proceso op ON op.id_cliente=r.id_cliente
 WHERE r.id=p_id AND public.f_private_compensacion_referido_elegible(op,r.id_cliente,r.fecha_referencia,1)
 AND op.fecha_pagado BETWEEN r.fecha_referencia AND r.fecha_referencia+interval '168 hours'
 AND op.monto_deposito_cliente=(ev.datos#>>'{declaracion_referido,monto}')::numeric
 AND op.id_banco_cliente=(ev.datos#>>'{declaracion_referido,id_banco}')::bigint
 AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada el WHERE el.id_operacion_proceso=op.id)
 AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_referido_operacion ro WHERE ro.id_operacion=op.id AND ro.id_evento<>r.id_evento)
 AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia er JOIN public.tb_compensacion_evento e ON e.id=er.id_evento
 JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento WHERE er.id_operacion=op.id AND t.categoria='REFERIDO'
 AND er.id_evento<>r.id_evento AND e.estado_evento IN('PENDIENTE','APROBADO','LIQUIDADO'))
 ORDER BY op.fecha_pagado,op.id;
 $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_referido_confirmar(p_evento bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_ev public.tb_compensacion_evento%ROWTYPE; v_ref bigint; v_op public.tb_operacion_proceso%ROWTYPE;
BEGIN
 SELECT * INTO v_ev FROM public.tb_compensacion_evento WHERE id=p_evento;
 IF v_ev.estado_evento='RECHAZADO' THEN
   UPDATE public.tb_compensacion_referido SET estado_referido='RECHAZADO',fecha_actualizacion=now() WHERE id_evento=p_evento;
   RETURN;
 END IF;
 IF v_ev.estado_evento<>'APROBADO' THEN RAISE EXCEPTION 'El evento no esta aprobado'; END IF;
 IF v_ev.criterios_validacion_snapshot->>'tipo_calculo' IS DISTINCT FROM 'PORCENTAJE' THEN RAISE EXCEPTION 'La regla del referido debe ser porcentual'; END IF;
 v_ref:=public.f_private_compensacion_referido_validar(p_evento,v_ev.base_calculo,v_ev.cantidad);
 SELECT op.* INTO v_op FROM public.tb_operacion_proceso op JOIN public.tb_compensacion_evento_referencia er ON er.id_operacion=op.id WHERE er.id_evento=p_evento;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_referido_operacion ro WHERE ro.id_evento=p_evento
   AND (ro.base_comision IS DISTINCT FROM v_ev.base_calculo OR ro.tasa_referido IS DISTINCT FROM v_ev.tarifa_aplicada
     OR ro.importe_comision IS DISTINCT FROM v_ev.importe_aprobado)) THEN
   RAISE EXCEPTION 'La comisión cambió respecto de su validación original; requiere un ajuste';
 END IF;
 INSERT INTO public.tb_compensacion_referido_operacion(id_referido,id_operacion,id_evento,fecha_operacion_snapshot,banco_snapshot,
   monto_operacion_snapshot,porcentaje_operacion_snapshot,base_comision,tasa_referido,importe_comision,id_usuario)
 VALUES(v_ref,v_op.id,p_evento,COALESCE(v_op.fecha_pagado,v_op.fecha_deposito_cliente,v_op.fecha_registro),v_op.nombre_banco_cliente,
   v_op.monto_deposito_cliente,v_op.comision_servicio,v_ev.base_calculo,v_ev.tarifa_aplicada,v_ev.importe_aprobado,
   (public.f_private_compensacion_contexto('REFERIDOS','APROBAR')->>'id_usuario')::bigint)
 ON CONFLICT (id_operacion) DO NOTHING;
 IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_referido_operacion WHERE id_operacion=v_op.id AND id_evento=p_evento) THEN
  RAISE EXCEPTION 'La operacion ya fue consumida por otro referido'; END IF;
 UPDATE public.tb_compensacion_referido SET estado_referido='VALIDADO',fecha_actualizacion=now() WHERE id=v_ref AND id_evento=p_evento;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_referido_elegible(p_op tb_operacion_proceso, p_cliente bigint, p_fecha timestamp with time zone, p_tasa numeric)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
 SELECT COALESCE(p_op.id_cliente=p_cliente AND upper(btrim(p_op.nombre_estado))='PAGADO'
   AND p_op.monto_deposito_cliente>0 AND p_tasa=1 AND p_op.comision_servicio=1
   AND COALESCE(p_op.comision_monto_extra_servicio,0)=0
   AND NOT COALESCE(p_op.flag_derivado,false) AND p_op.id_operacion_padre IS NULL
   -- Se permite registrar el referido después del pago; la aprobación sigue siendo administrativa.
   -- Criterio conservador: solo efectivizaciones identificadas. No POS/Link ni Pago Deuda.
   AND upper(btrim(p_op.tipo_servicio)) IN ('EFECTIVIZACION','EFECTIVIZACIÓN')
   AND NULLIF(btrim(p_op.tipo_flujo_pago_deuda),'') IS NULL
   AND lower(COALESCE(p_op.ruta_origen,'')) NOT IN ('pagodeuda','pago-deuda','pos','linkpago')
   AND lower(COALESCE(p_op.ruta_destino,'')) NOT IN ('pagodeuda','pago-deuda','pos','linkpago')
   AND upper(COALESCE(p_op.nombre_codigo_servicio,'')) !~ '(PAGO.*(DEUDA|TARJETA)|COMERCIAL)',false);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_referido_match(p_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 WITH candidatos AS MATERIALIZED(SELECT j FROM public.f_private_compensacion_referido_coincidencias(p_id) j),
 resumen AS(SELECT count(*) n,coalesce(jsonb_agg(j),'[]') items FROM candidatos)
 SELECT jsonb_build_object('estado',CASE WHEN ev.datos->'declaracion_referido' IS NULL THEN 'REQUIERE_DATOS'
 WHEN n=1 THEN 'ENCONTRADO' WHEN n>1 THEN 'AMBIGUO' WHEN now()>r.fecha_referencia+interval '168 hours' THEN 'VENCIDO' ELSE 'ESPERANDO' END,
 'cantidad',n,'operacion',CASE WHEN n=1 THEN items->0 ELSE NULL END)
 FROM resumen CROSS JOIN public.tb_compensacion_referido r JOIN public.tb_compensacion_evento ev ON ev.id=r.id_evento WHERE r.id=p_id;
 $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_referido_validar(p_evento bigint, p_base numeric, p_cantidad numeric)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_ev public.tb_compensacion_evento%ROWTYPE; v_ref public.tb_compensacion_referido%ROWTYPE;
 v_op public.tb_operacion_proceso%ROWTYPE; v_config jsonb; v_tasa numeric; v_id bigint;
BEGIN
 SELECT * INTO v_ev FROM public.tb_compensacion_evento WHERE id=p_evento;
 SELECT * INTO v_ref FROM public.tb_compensacion_referido WHERE id_evento=p_evento FOR UPDATE;
 IF NOT FOUND THEN
   IF COALESCE(v_ev.datos->>'id_referido','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Falta el referido vinculado'; END IF;
   SELECT * INTO v_ref FROM public.tb_compensacion_referido WHERE id=(v_ev.datos->>'id_referido')::bigint FOR UPDATE;
   IF NOT FOUND OR v_ref.estado_referido<>'VALIDADO' THEN RAISE EXCEPTION 'Primero valida el referido'; END IF;
 ELSIF v_ref.estado_referido<>'PENDIENTE' THEN RAISE EXCEPTION 'El referido no esta pendiente';
 END IF;
 PERFORM public.f_private_compensacion_evento_validar_alcance(v_ref.id_evento,'CONSULTAR',false);
 IF v_ev.id_colaborador_beneficiario IS DISTINCT FROM v_ref.id_colaborador_referente THEN RAISE EXCEPTION 'El beneficiario no corresponde al referido'; END IF;
 IF v_ev.id_tipo_evento IS DISTINCT FROM (SELECT id_tipo_evento FROM public.tb_compensacion_evento WHERE id=v_ref.id_evento) THEN RAISE EXCEPTION 'El tipo no corresponde al referido'; END IF;
 IF (SELECT count(*) FROM public.tb_compensacion_evento_referencia WHERE id_evento=p_evento AND id_operacion IS NOT NULL)<>1 THEN
   RAISE EXCEPTION 'El referido requiere exactamente una operacion por evento';
 END IF;
 SELECT id_operacion INTO v_id FROM public.tb_compensacion_evento_referencia WHERE id_evento=p_evento AND id_operacion IS NOT NULL;
 SELECT * INTO v_op FROM public.tb_operacion_proceso WHERE id=v_id FOR SHARE;
 SELECT configuracion INTO v_config FROM public.tb_compensacion_evento_tipo WHERE id=v_ev.id_tipo_evento;
 IF COALESCE(v_config->>'porcentaje_operacion_requerido',v_config->>'tasa_operacion_requerida','') !~ '^[0-9]+([.][0-9]+)?$' THEN RAISE EXCEPTION 'Falta configurar el porcentaje requerido'; END IF;
 v_tasa:=COALESCE(v_config->>'porcentaje_operacion_requerido',v_config->>'tasa_operacion_requerida')::numeric;
 IF NOT public.f_private_compensacion_referido_elegible(v_op,v_ref.id_cliente,v_ref.fecha_referencia,v_tasa) THEN
   RAISE EXCEPTION 'Operacion no elegible: debe ser una efectivizacion pagada, del mismo cliente y con porcentaje de 1%%';
 END IF;
 IF p_base IS DISTINCT FROM v_op.monto_deposito_cliente OR COALESCE(p_cantidad,1)<>1 THEN RAISE EXCEPTION 'La base debe coincidir con el monto de la operacion'; END IF;
 IF (v_ev.periodo_imputacion IS DISTINCT FROM date_trunc('month',COALESCE(v_op.fecha_pagado,v_op.fecha_deposito_cliente,v_op.fecha_registro) AT TIME ZONE 'America/Lima')::date
   OR v_ev.fecha_evento IS DISTINCT FROM COALESCE(v_op.fecha_pagado,v_op.fecha_deposito_cliente,v_op.fecha_registro)) THEN RAISE EXCEPTION 'El evento debe conservar la fecha y el periodo de la operacion'; END IF;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_referido_operacion WHERE id_operacion=v_op.id AND id_evento IS DISTINCT FROM p_evento) THEN RAISE EXCEPTION 'La operacion ya fue consumida por un referido'; END IF;
 IF EXISTS(SELECT 1 FROM public.tb_compensacion_referido_operacion ro WHERE ro.id_operacion=v_op.id AND ro.id_evento=p_evento
   AND (ro.monto_operacion_snapshot IS DISTINCT FROM v_op.monto_deposito_cliente
     OR ro.porcentaje_operacion_snapshot IS DISTINCT FROM v_op.comision_servicio
     OR ro.banco_snapshot IS DISTINCT FROM v_op.nombre_banco_cliente
     OR ro.fecha_operacion_snapshot IS DISTINCT FROM COALESCE(v_op.fecha_pagado,v_op.fecha_deposito_cliente,v_op.fecha_registro))) THEN
   RAISE EXCEPTION 'La operacion cambió respecto de su validación original; requiere revisión';
 END IF;
 IF v_ev.datos->>'flujo_referido'='MATCH_7_DIAS_V2' OR NOT EXISTS(SELECT 1 FROM public.tb_compensacion_referido_operacion WHERE id_evento=p_evento) THEN
   IF NOT EXISTS(SELECT 1 FROM public.f_private_compensacion_referido_coincidencias(v_ref.id) j WHERE (j->>'id')::bigint=v_op.id) THEN RAISE EXCEPTION 'La operacion no coincide con la declaracion dentro de siete dias'; END IF;
 ELSIF v_ref.id_evento=p_evento AND EXISTS(SELECT 1 FROM public.tb_operacion_proceso op
   WHERE public.f_private_compensacion_referido_elegible(op,v_ref.id_cliente,v_ref.fecha_referencia,v_tasa)
   AND (COALESCE(op.fecha_pagado,op.fecha_deposito_cliente,op.fecha_registro),op.id)
      < (COALESCE(v_op.fecha_pagado,v_op.fecha_deposito_cliente,v_op.fecha_registro),v_op.id)) THEN
   RAISE EXCEPTION 'Selecciona la primera operacion elegible para validar el referido';
 END IF;
 RETURN v_ref.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_reglas_colaborador_fecha(p_id_plan bigint, p_fecha date, p_id_colaborador bigint)
 RETURNS SETOF tb_compensacion_regla
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.tb_compensacion_regla%ROWTYPE; codigo text;
BEGIN
  FOR r IN SELECT * FROM public.f_private_compensacion_reglas_fecha(p_id_plan,p_fecha) LOOP
    SELECT co.codigo INTO codigo FROM public.tb_compensacion_concepto co WHERE co.id=r.id_concepto;
    IF codigo IN('COMISION_REGISTRO_EFECTIVIZACION','COMISION_AUDITAR_NUEVOS') AND EXISTS(
      SELECT 1 FROM public.tb_compensacion_asignacion a JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo
      JOIN public.tb_compensacion_colaborador c ON c.id=a.id_colaborador JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=2
      JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
      WHERE a.id_colaborador=p_id_colaborador AND p_fecha BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)
       AND ca.codigo IN('JEFE_SUPERIOR_PAGOS','OPERADOR_ALTA_DEMANDA','ENCARGADO_CARTERA_MEDIA','ASISTENTE_VIRTUAL_PAGOS')
       -- PAGOS_188: el Auditar Nuevos del Jefe Superior nace de su validacion (evento), no del calculo automatico por gestor.
       AND NOT (r.id_concepto=(SELECT x.id FROM public.tb_compensacion_concepto x WHERE x.codigo='COMISION_AUDITAR_NUEVOS') AND ca.codigo='JEFE_SUPERIOR_PAGOS')
       AND (r.id_cargo IS NULL OR r.id_cargo=a.id_cargo)) THEN
      r.configuracion:=coalesce(r.configuracion,'{}')||jsonb_build_object('fuente_operacion','OPERACION_PAGADA_GESTOR','politica_atribucion','PAGOS_GESTOR_7D_V1','dias_maximos_operacion',7);
    END IF;
    RETURN NEXT r;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_reglas_fecha(p_id_plan bigint, p_fecha date)
 RETURNS SETOF tb_compensacion_regla
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_snapshot jsonb; v_version bigint;
BEGIN
  SELECT ce.reglas_snapshot INTO v_snapshot
  FROM public.tb_compensacion_configuracion_efectiva ce
  WHERE ce.id_plan = p_id_plan AND ce.fecha_desde <= p_fecha
  ORDER BY ce.fecha_desde DESC, ce.id DESC LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT * FROM jsonb_populate_recordset(NULL::public.tb_compensacion_regla, v_snapshot);
    RETURN;
  END IF;
  SELECT pv.id INTO v_version FROM public.tb_compensacion_plan_version pv
  WHERE pv.id_plan = p_id_plan AND pv.estado_version = 'PUBLICADA'
    AND pv.fecha_inicio <= p_fecha AND (pv.fecha_fin IS NULL OR pv.fecha_fin >= p_fecha)
  ORDER BY pv.numero_version DESC LIMIT 1;
  RETURN QUERY SELECT r.* FROM public.tb_compensacion_regla r WHERE r.id_plan_version = v_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_reporte_contexto(p_id_periodo bigint, p_accion character varying, p_id_sucursal bigint DEFAULT NULL::bigint, p_id_colaborador bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_periodo public.tb_compensacion_periodo%ROWTYPE;
  v_alcance character varying;
  v_id_sucursal_alcance bigint;
  v_id_colaborador_actor bigint;
  v_id_sucursal_efectiva bigint := p_id_sucursal;
  v_id_colaborador_efectivo bigint := p_id_colaborador;
  v_id_cierre bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'REPORTES', UPPER(TRIM(COALESCE(p_accion, 'CONSULTAR')))
  );
  v_alcance := v_contexto ->> 'alcance';
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;

  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = p_id_periodo;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'El periodo no existe';
  END IF;

  IF v_alcance = 'SEDE' THEN
    IF p_id_sucursal IS NOT NULL
       AND p_id_sucursal IS DISTINCT FROM v_id_sucursal_alcance THEN
      RAISE EXCEPTION 'No puede consultar reportes de otra sede';
    END IF;
    v_id_sucursal_efectiva := v_id_sucursal_alcance;
  ELSIF v_alcance = 'PROPIO' THEN
    IF v_id_colaborador_actor IS NULL THEN
      RAISE EXCEPTION 'El usuario no tiene colaborador vinculado';
    END IF;
    IF p_id_colaborador IS NOT NULL
       AND p_id_colaborador IS DISTINCT FROM v_id_colaborador_actor THEN
      RAISE EXCEPTION 'Solo puede consultar sus propios reportes';
    END IF;
    v_id_colaborador_efectivo := v_id_colaborador_actor;
  END IF;

  IF v_id_sucursal_efectiva IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.tb_sucursal WHERE id = v_id_sucursal_efectiva
     ) THEN
    RAISE EXCEPTION 'La sede seleccionada no existe';
  END IF;

  IF v_id_colaborador_efectivo IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.tb_compensacion_colaborador
       WHERE id = v_id_colaborador_efectivo
     ) THEN
    RAISE EXCEPTION 'El colaborador seleccionado no existe';
  END IF;

  v_id_cierre := NULL;

  RETURN v_contexto || jsonb_build_object(
    'id_periodo', v_periodo.id,
    'periodo', v_periodo.periodo,
    'fecha_inicio', v_periodo.fecha_inicio,
    'fecha_fin', v_periodo.fecha_fin,
    'zona_horaria', v_periodo.zona_horaria,
    'estado_periodo', v_periodo.estado_periodo,
    'id_sucursal_efectiva', v_id_sucursal_efectiva,
    'id_colaborador_efectivo', v_id_colaborador_efectivo,
    'id_cierre_vigente', v_id_cierre,
    'fuente_reporte', CASE WHEN public.f_private_compensacion_reporte_mes_confirmado(v_periodo.id) THEN 'CIERRE' ELSE 'VIGENTE' END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_reporte_detalles(p_id_periodo bigint)
 RETURNS TABLE(id_liquidacion bigint, id_colaborador bigint, id_sucursal bigint, sucursal_nombre text, id_concepto bigint, concepto_codigo text, concepto_nombre text, categoria text, naturaleza text, tipo_origen text, clave_origen text, cantidad numeric, tarifa numeric, importe numeric, fuente text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT NULL::bigint, (r.fila->>'id_colaborador')::bigint, (r.fila->>'id_sucursal')::bigint, r.fila->>'sucursal',
    (d->>'id_concepto')::bigint, d->>'concepto_codigo', d->>'concepto_nombre', d->>'categoria', d->>'naturaleza',
    d->>'tipo_origen', d->>'clave_origen', (d->>'cantidad')::numeric, (d->>'tarifa')::numeric, (d->>'importe')::numeric, r.fuente
  FROM public.f_private_compensacion_reporte_filas(p_id_periodo) r
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.fila->'detalles', '[]'::jsonb)) d;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_reporte_filas(p_id_periodo bigint)
 RETURNS TABLE(fila jsonb, fuente text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_rep public.tb_compensacion_reporte_mes%ROWTYPE;
BEGIN
  SELECT * INTO v_rep FROM public.tb_compensacion_reporte_mes WHERE id_periodo = p_id_periodo;
  IF v_rep.estado = 'CONFIRMADO' THEN
    RETURN QUERY SELECT f, 'CIERRE'::text FROM jsonb_array_elements(v_rep.snapshot->'colaboradores') f;
  ELSE
    RETURN QUERY SELECT public.f_private_compensacion_bonos_mes_fila(p_id_periodo, c.id_colaborador), 'VIGENTE'::text
      FROM public.f_private_compensacion_bonos_mes_colaboradores(p_id_periodo) c;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_reporte_liquidaciones(p_id_periodo bigint)
 RETURNS TABLE(id_liquidacion bigint, id_colaborador bigint, colaborador_nombre text, colaborador_documento text, id_sucursal bigint, sucursal_nombre text, estado_liquidacion text, total_sueldo numeric, total_bonos numeric, total_comisiones numeric, total_descuentos numeric, total_pagar numeric, total_pagado numeric, total_pendiente numeric, id_cierre bigint, fuente text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT NULL::bigint, (r.fila->>'id_colaborador')::bigint, r.fila->>'nombre_completo', r.fila->>'numero_documento',
    (r.fila->>'id_sucursal')::bigint, r.fila->>'sucursal',
    CASE WHEN r.fuente = 'CIERRE' THEN 'CONFIRMADO' ELSE 'BORRADOR' END,
    0::numeric, coalesce((r.fila->>'total_bonos')::numeric, 0), coalesce((r.fila->>'total_comisiones')::numeric, 0),
    coalesce((r.fila->>'total_descuentos')::numeric, 0), coalesce((r.fila->>'total_neto')::numeric, 0),
    0::numeric, 0::numeric, NULL::bigint, r.fuente
  FROM public.f_private_compensacion_reporte_filas(p_id_periodo) r;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_reporte_mes_confirmado(p_id_periodo bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT coalesce((SELECT r.estado = 'CONFIRMADO' FROM public.tb_compensacion_reporte_mes r WHERE r.id_periodo = p_id_periodo), false);
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_safetypay_conciliar(p_id bigint DEFAULT NULL::bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE r public.tb_compensacion_safetypay_registro%ROWTYPE; op public.tb_operacion_proceso%ROWTYPE; d jsonb; nuevo text; n integer:=0;
BEGIN
  FOR r IN SELECT * FROM public.tb_compensacion_safetypay_registro
    WHERE estado<>'PAGADO' AND (p_id IS NULL OR id=p_id) ORDER BY id FOR UPDATE
  LOOP
    op:=NULL;
    IF r.id_operacion_proceso IS NOT NULL THEN
      SELECT * INTO op FROM public.tb_operacion_proceso WHERE id=r.id_operacion_proceso;
    ELSIF r.codigo_cliente IS NOT NULL THEN
      SELECT x.* INTO op FROM public.tb_operacion_proceso x
      WHERE x.id_operacion_padre IS NULL
        AND lower(btrim(coalesce(x.ruta_origen,'')))='safetypay'
        AND upper(btrim(coalesce(x.tipo_servicio,'')))='EFECTIVIZACION'
        AND btrim(coalesce(x.codigo_operacion_deposito_cliente,''))=r.codigo_cliente
        AND round(coalesce(x.monto_deposito_cliente,0),2)=r.monto
        AND (coalesce(x.fecha_deposito_cliente,x.fecha_registro) AT TIME ZONE 'America/Lima')::date
            BETWEEN (r.fecha_deposito AT TIME ZONE 'America/Lima')::date-7 AND (r.fecha_deposito AT TIME ZONE 'America/Lima')::date+7
        AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada e WHERE e.id_operacion_proceso=x.id)
        AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_safetypay_registro y WHERE y.id_operacion_proceso=x.id)
      ORDER BY x.id LIMIT 1;
    END IF;
    IF op.id IS NULL THEN CONTINUE; END IF;
    d:=public.f_private_compensacion_atencion_operacion(op.id);
    nuevo:=CASE WHEN coalesce((d->>'pagada')::boolean,false) THEN 'PAGADO' ELSE 'PENDIENTE' END;
    UPDATE public.tb_compensacion_safetypay_registro SET estado=nuevo,id_operacion_proceso=op.id,
      fecha_cruce=coalesce(fecha_cruce,now()),fecha_actualizacion=now()
      WHERE id=r.id AND (estado IS DISTINCT FROM nuevo OR id_operacion_proceso IS DISTINCT FROM op.id);
    IF FOUND THEN n:=n+1; END IF;
    -- La atencion sigue acreditando al asesor que hizo el pre-registro (meta de sede, Colaborador del Mes).
    INSERT INTO public.tb_compensacion_atencion(id_operacion_raiz,id_operacion_pagada,id_usuario_asesor,fecha_atencion,operacion_snapshot)
    VALUES(op.id,op.id,r.id_usuario,r.fecha_deposito,jsonb_build_object('id',op.id,'raiz',op.id,'asesor',r.id_usuario,
      'codigo',op.codigo_operacion_deposito_cliente,'cliente',op.nombre_cliente,'dni',op.dni_cliente,'servicio',op.tipo_servicio,
      'monto',op.monto_deposito_cliente,'fecha',r.fecha_deposito,'fuente_fecha','FECHA_DEPOSITO_REGISTRO_V1',
      'fuente_vinculo','SAFETYPAY_PREREGISTRO_V1','pagada',coalesce((d->>'pagada')::boolean,false),
      'safetypay',jsonb_build_object('codigo_cliente',r.codigo_cliente,'banco',r.banco,'fuente','PREREGISTRO_ATC_SAFETYPAY_V1','id_registro',r.id)))
    ON CONFLICT (id_operacion_raiz) WHERE estado='VIGENTE' DO NOTHING;
  END LOOP;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_safetypay_panel_contexto()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; actor public.tb_usuario%ROWTYPE; col bigint; alcance text;
BEGIN
  ctx:=public.f_private_compensacion_contexto('BONO:META_SEDE_SAFETYPAY','CONSULTAR');
  alcance:=ctx->>'alcance';
  SELECT u.* INTO actor FROM public.tb_usuario u
    JOIN public.tb_estado e ON e.id=u.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE u.id=(ctx->>'id_usuario')::bigint AND u.auth_user_id=auth.uid();
  IF actor.id IS NULL OR NOT coalesce((ctx->>'puede_consultar')::boolean,false)
    OR alcance IS NULL OR alcance NOT IN('PROPIO','SEDE','GLOBAL') THEN
    RAISE EXCEPTION 'Consulta SafetyPay no autorizada'; END IF;
  IF alcance='GLOBAL' THEN
    IF NOT coalesce((ctx->>'es_super_admin')::boolean,false)
      OR NOT coalesce(actor.id_rol=1 OR actor.flag_super_admin,false) THEN
      RAISE EXCEPTION 'Alcance global SafetyPay no autorizado'; END IF;
  ELSE
    IF coalesce(actor.flag_super_admin,false) OR actor.id_rol IS NULL
      OR (alcance='PROPIO' AND actor.id_rol<>4)
      OR (alcance='SEDE' AND (actor.id_rol<>3 OR actor.id_sucursal IS NULL
        OR actor.id_sucursal IS DISTINCT FROM (ctx->>'id_sucursal_alcance')::bigint)) THEN
      RAISE EXCEPTION 'Alcance personal o de sede SafetyPay no autorizado'; END IF;
    SELECT c.id INTO col FROM public.tb_compensacion_colaborador c
      JOIN public.tb_estado e ON e.id=c.id_estado AND upper(btrim(e.nombre))='ACTIVO'
      WHERE c.id=(ctx->>'id_colaborador')::bigint AND c.id_usuario=actor.id;
    IF col IS NULL OR public.f_private_compensacion_safetypay_usuario() IS DISTINCT FROM actor.id THEN
      RAISE EXCEPTION 'Identidad SafetyPay no autorizada'; END IF;
  END IF;
  RETURN ctx;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_safetypay_registro_configuracion()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE usuario bigint; caja jsonb; servicio record; comunidades jsonb;
BEGIN
  usuario:=public.f_private_compensacion_safetypay_usuario();
  caja:=public.f_get_tb_ruta_operacion_caja_ingreso_principal('safetypay');
  SELECT cs.id,cs.nombre INTO servicio FROM public.tb_codigo_servicio cs
    JOIN public.tb_estado e ON e.id=cs.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE upper(btrim(cs.tipo))='EFECTIVIZACION' AND cs.nombre ILIKE '%SafetyPay%'
    ORDER BY cs.id LIMIT 1;
  IF caja IS NULL OR servicio.id IS NULL THEN RAISE EXCEPTION 'SafetyPay no tiene caja o servicio configurados'; END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x.nombre),'[]'::jsonb) INTO comunidades FROM (
    SELECT DISTINCT c.id,c.nombre FROM public.tb_comunidad c
    JOIN public.tb_estado e ON e.id=c.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    JOIN public.tb_reglas_efectivizacion r ON r.id_comunidad=c.id
    JOIN public.tb_estado er ON er.id=r.id_estado AND upper(btrim(er.nombre))='ACTIVO'
    WHERE r.id_codigo_servicio=servicio.id AND r.id_banco=(caja->>'id_banco')::bigint
  ) x;
  IF jsonb_array_length(comunidades)=0 THEN RAISE EXCEPTION 'SafetyPay no tiene comunidades con reglas activas'; END IF;
  RETURN jsonb_build_object('id_usuario',usuario,'caja',caja,'servicio',to_jsonb(servicio),'comunidades',comunidades);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_safetypay_usuario()
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE usuario bigint;
BEGIN
  SELECT u.id INTO usuario FROM public.tb_usuario u
    JOIN public.tb_estado e ON e.id=u.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE u.auth_user_id=auth.uid() AND u.id_rol IN(3,4) AND (u.id_rol=4 OR EXISTS(
      SELECT 1 FROM public.tb_compensacion_colaborador c JOIN public.tb_compensacion_asignacion a ON a.id_colaborador=c.id
      JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='JEFE_TIENDA'
      JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
      WHERE c.id_usuario=u.id AND a.id_sucursal=u.id_sucursal AND a.fecha_inicio<=(now() AT TIME ZONE 'America/Lima')::date
        AND (a.fecha_fin IS NULL OR a.fecha_fin>=(now() AT TIME ZONE 'America/Lima')::date))) AND EXISTS(
      SELECT 1 FROM public.tb_permiso_usuario pu
      JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
      JOIN public.tb_estado ep ON ep.id=pu.id_estado AND upper(btrim(ep.nombre))='ACTIVO'
      JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
      WHERE pu.id_usuario=u.id AND pm.ruta='/compensaciones/otros-bonos/meta_sede_safetypay');
  IF usuario IS NULL THEN RAISE EXCEPTION 'Sin acceso ATC a Meta SafetyPay'; END IF;
  RETURN usuario;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_seguimiento_ciclo(p_limite integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('compensacion-seguimiento-ciclo',0)) THEN
   RETURN jsonb_build_object('procesados',0,'errores',0,'ocupado',true);
 END IF;
 PERFORM public.f_private_compensacion_seguimiento_recuperar(p_limite);
 RETURN public.f_private_compensacion_seguimiento_procesar(p_limite);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_seguimiento_consultar(p_id_periodo bigint, p_id_colaborador bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE pe record; r public.tb_compensacion_seguimiento_resultado%ROWTYPE; q record;
BEGIN
 SELECT * INTO pe FROM public.tb_compensacion_periodo WHERE id=p_id_periodo;
 SELECT * INTO r FROM public.tb_compensacion_seguimiento_resultado WHERE periodo=pe.periodo AND id_colaborador=p_id_colaborador;
 SELECT * INTO q FROM public.tb_compensacion_seguimiento_cola WHERE periodo=pe.periodo AND id_colaborador=p_id_colaborador;
 IF public.f_private_compensacion_reporte_mes_confirmado(p_id_periodo) OR coalesce(r.congelado,false) THEN
   RETURN coalesce(r.resultado,jsonb_build_object('detalles','[]'::jsonb,'bloqueos',jsonb_build_array(jsonb_build_object(
     'codigo','PERIODO_CONGELADO','mensaje','Periodo consolidado: consulta el reporte confirmado.'))));
 END IF;
 IF r.resultado IS NOT NULL AND r.revision=q.revision AND q.revision=q.revision_procesada
   AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_seguimiento_invalidacion i
     WHERE i.periodo=pe.periodo AND i.id_colaborador=p_id_colaborador AND NOT i.procesada)
   AND r.fecha_calculo>=now()-interval '60 seconds' THEN RETURN r.resultado; END IF;
 -- Lectura sin mutaciones. El cron recupera el trabajo; no depender de una pagina abierta.
 RETURN public.f_private_compensacion_bonos_mes_calcular(p_id_periodo,p_id_colaborador);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_seguimiento_encolar(p_periodo date, p_motivo text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE filas integer;
BEGIN
 IF p_periodo IS NULL THEN RETURN 0; END IF;
 INSERT INTO public.tb_compensacion_seguimiento_invalidacion(periodo,id_colaborador,motivo)
 SELECT DISTINCT date_trunc('month',p_periodo)::date,c.id,left(p_motivo,120)
 FROM public.tb_compensacion_colaborador c
 JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=4 AND NOT coalesce(u.flag_super_admin,false)
 JOIN public.tb_estado ec ON ec.id=c.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
 JOIN public.tb_estado eu ON eu.id=u.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
 WHERE EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion a
   JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
   WHERE a.id_colaborador=c.id AND a.fecha_inicio<(date_trunc('month',p_periodo)+interval '1 month')::date
     AND coalesce(a.fecha_fin,'infinity'::date)>=date_trunc('month',p_periodo)::date)
 ORDER BY c.id;
 -- Append-only: un pago no toca filas que el worker mantiene bloqueadas.
 -- La agrupacion por colaborador/mes ocurre al consumir, no al registrar el pago.
 GET DIAGNOSTICS filas=ROW_COUNT;
 RETURN filas;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_seguimiento_evento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_evento_datos jsonb; meses date[]:=ARRAY[]::date[]; fecha date; op bigint; c record;
BEGIN
 FOR v_evento_datos IN SELECT x FROM jsonb_array_elements(
   CASE WHEN TG_OP='INSERT' THEN jsonb_build_array(to_jsonb(NEW))
     WHEN TG_OP='DELETE' THEN jsonb_build_array(to_jsonb(OLD))
     ELSE jsonb_build_array(to_jsonb(OLD),to_jsonb(NEW)) END) x LOOP
   fecha:=coalesce(nullif(v_evento_datos->>'periodo_imputacion','')::date,nullif(v_evento_datos->>'periodo','')::date,
     nullif(v_evento_datos->>'fecha','')::date,
     (nullif(v_evento_datos->>'fecha_pagado','')::timestamptz AT TIME ZONE 'America/Lima')::date,
     (nullif(v_evento_datos->>'fecha_evento','')::timestamptz AT TIME ZONE 'America/Lima')::date,
     (nullif(v_evento_datos->>'fecha_registro','')::timestamptz AT TIME ZONE 'America/Lima')::date);
   IF fecha IS NOT NULL THEN meses:=array_append(meses,date_trunc('month',fecha)::date); END IF;
   IF TG_TABLE_NAME IN('tb_operacion_proceso','tb_operacion_caja','tb_operacion_proceso_eliminada') THEN
     op:=CASE WHEN TG_TABLE_NAME='tb_operacion_proceso' THEN (v_evento_datos->>'id')::bigint
       ELSE (v_evento_datos->>'id_operacion_proceso')::bigint END;
     -- La comision pertenece al mes del alta, incluso si se cobra el mes siguiente.
     FOR c IN SELECT DISTINCT cli.fecha_registro FROM public.tb_cliente cli
       WHERE cli.id=nullif(v_evento_datos->>'id_cliente','')::bigint
          OR cli.numero_documento=nullif(regexp_replace(coalesce(v_evento_datos->>'dni_cliente',''),'[^0-9]','','g'),'')
          OR EXISTS(SELECT 1 FROM public.tb_operacion_proceso o
            LEFT JOIN public.tb_operacion_proceso raiz ON raiz.id=o.id_operacion_padre
            WHERE o.id IN(op,nullif(v_evento_datos->>'id_operacion_padre','')::bigint) AND (cli.id IN(o.id_cliente,raiz.id_cliente)
              OR cli.numero_documento=nullif(regexp_replace(coalesce(o.dni_cliente,raiz.dni_cliente,''),'[^0-9]','','g'),'')))
     LOOP meses:=array_append(meses,date_trunc('month',c.fecha_registro AT TIME ZONE 'America/Lima')::date); END LOOP;
   ELSIF TG_TABLE_NAME='tb_compensacion_evento_referencia' THEN
     SELECT periodo_imputacion INTO fecha FROM public.tb_compensacion_evento WHERE id=(v_evento_datos->>'id_evento')::bigint;
     IF fecha IS NOT NULL THEN meses:=array_append(meses,date_trunc('month',fecha)::date); END IF;
   END IF;
 END LOOP;
 IF TG_TABLE_NAME IN('tb_compensacion_regla','tb_compensacion_asignacion') THEN
   -- Un parametro no provoca revisiones retroactivas de periodos ya cerrados.
   SELECT array_agg(p.periodo) INTO meses FROM public.tb_compensacion_periodo p
   WHERE p.estado_periodo IN('ABIERTO','EN_CALCULO','EN_REVISION','OBSERVADO','REABIERTO');
 END IF;
 FOR fecha IN SELECT DISTINCT m FROM unnest(meses) m WHERE m IS NOT NULL ORDER BY m LOOP
   PERFORM public.f_private_compensacion_seguimiento_encolar(fecha,TG_TABLE_NAME);
 END LOOP;
 RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_seguimiento_procesar(p_limite integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE tarea record; pe record; anterior public.tb_compensacion_seguimiento_resultado%ROWTYPE;
 ids bigint[]; version_trabajo bigint;
 datos jsonb; huella text; cerrada boolean; revision_manual boolean; ok integer:=0; errores integer:=0;
BEGIN
 IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Limite invalido'; END IF;
 FOR tarea IN WITH candidatas AS (
   SELECT periodo,id_colaborador,min(fecha_evento) disponible FROM public.tb_compensacion_seguimiento_invalidacion
     WHERE NOT procesada GROUP BY periodo,id_colaborador
   UNION ALL SELECT periodo,id_colaborador,disponible_desde FROM public.tb_compensacion_seguimiento_cola
     WHERE revision>revision_procesada
 ) SELECT c.periodo,c.id_colaborador,min(c.disponible) disponible
   FROM candidatas c LEFT JOIN public.tb_compensacion_seguimiento_cola q USING(periodo,id_colaborador)
   WHERE q.disponible_desde IS NULL OR q.disponible_desde<=now()
   GROUP BY c.periodo,c.id_colaborador ORDER BY disponible,c.periodo,c.id_colaborador LIMIT p_limite LOOP
   -- No retener bloqueo de la cola durante el calculo: el pago bancario no espera al motor.
   IF NOT pg_try_advisory_xact_lock(hashtextextended('ATC_SEGUIMIENTO:'||tarea.periodo||':'||tarea.id_colaborador,0)) THEN CONTINUE; END IF;
   SELECT array_agg(id ORDER BY id) INTO ids FROM public.tb_compensacion_seguimiento_invalidacion
     WHERE periodo=tarea.periodo AND id_colaborador=tarea.id_colaborador AND NOT procesada;
   INSERT INTO public.tb_compensacion_seguimiento_cola(periodo,id_colaborador,motivo)
     VALUES(tarea.periodo,tarea.id_colaborador,'INVALIDACION')
     ON CONFLICT(periodo,id_colaborador) DO UPDATE SET
       revision=CASE WHEN tb_compensacion_seguimiento_cola.revision=tb_compensacion_seguimiento_cola.revision_procesada
         THEN tb_compensacion_seguimiento_cola.revision+1 ELSE tb_compensacion_seguimiento_cola.revision END
     RETURNING revision INTO version_trabajo;
   BEGIN
     -- Cierres/aprobaciones que actualizan el periodo esperan al consumidor,
     -- nunca al reves respecto de la captura bancaria (outbox solo INSERT).
     SELECT * INTO pe FROM public.tb_compensacion_periodo WHERE periodo=tarea.periodo FOR SHARE;
     IF pe.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Periodo no configurado'; END IF;
     SELECT * INTO anterior FROM public.tb_compensacion_seguimiento_resultado
       WHERE periodo=tarea.periodo AND id_colaborador=tarea.id_colaborador;
     cerrada:=public.f_private_compensacion_reporte_mes_confirmado(pe.id);
     revision_manual:=coalesce(anterior.requiere_revision,false)
       OR (cerrada AND EXISTS(SELECT 1 FROM public.tb_compensacion_seguimiento_invalidacion
         WHERE id=ANY(ids) AND motivo<>'tb_compensacion_periodo'));
     IF cerrada THEN datos:=anterior.resultado;
     ELSE datos:=public.f_private_compensacion_bonos_mes_calcular(pe.id,tarea.id_colaborador);
       IF datos IS NULL OR jsonb_typeof(datos->'detalles') IS DISTINCT FROM 'array'
         OR jsonb_typeof(datos->'bloqueos') IS DISTINCT FROM 'array' THEN
         RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Respuesta incompleta del motor'; END IF;
     END IF;
     -- Defensa ante intercalados de la misma transaccion o funciones del motor
     -- que alteren estado: nunca publicar un calculo nuevo despues del cierre.
     IF NOT cerrada AND public.f_private_compensacion_reporte_mes_confirmado(pe.id) THEN
       cerrada:=true; datos:=anterior.resultado; revision_manual:=true;
     END IF;
     huella:=md5(coalesce(datos::text,'null')||cerrada::text||revision_manual::text);
     INSERT INTO public.tb_compensacion_seguimiento_resultado(periodo,id_colaborador,revision,resultado,huella,congelado,requiere_revision)
       VALUES(tarea.periodo,tarea.id_colaborador,version_trabajo,datos,huella,cerrada,revision_manual)
       ON CONFLICT(periodo,id_colaborador) DO UPDATE SET revision=excluded.revision,resultado=excluded.resultado,
         huella=excluded.huella,fecha_calculo=now(),congelado=excluded.congelado,requiere_revision=excluded.requiere_revision;
     IF anterior.huella IS DISTINCT FROM huella THEN
       INSERT INTO public.tb_compensacion_seguimiento_historial(periodo,id_colaborador,revision,resultado,huella,congelado,requiere_revision)
       VALUES(tarea.periodo,tarea.id_colaborador,version_trabajo,datos,huella,cerrada,revision_manual)
       ON CONFLICT(periodo,id_colaborador,revision) DO NOTHING;
     END IF;
     UPDATE public.tb_compensacion_seguimiento_cola SET revision_procesada=version_trabajo,intentos=0,error_codigo=NULL
       WHERE periodo=tarea.periodo AND id_colaborador=tarea.id_colaborador AND revision=version_trabajo;
     -- No usar max(id) como watermark: una transaccion mas antigua puede confirmar tarde.
     UPDATE public.tb_compensacion_seguimiento_invalidacion SET procesada=true WHERE id=ANY(ids);
     ok:=ok+1;
   EXCEPTION WHEN OTHERS THEN
     UPDATE public.tb_compensacion_seguimiento_cola SET intentos=intentos+1,error_codigo=SQLSTATE,
       disponible_desde=now()+make_interval(secs=>least(300,5*power(2,least(intentos,6)))::integer)
       WHERE periodo=tarea.periodo AND id_colaborador=tarea.id_colaborador AND revision=version_trabajo;
     errores:=errores+1;
   END;
 END LOOP;
 RETURN jsonb_build_object('procesados',ok,'errores',errores);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_seguimiento_recuperar(p_limite integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE filas integer;
BEGIN
 IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Limite invalido'; END IF;
 INSERT INTO public.tb_compensacion_seguimiento_cola(periodo,id_colaborador,motivo)
 SELECT p.periodo,c.id,'RECUPERACION'
 FROM public.tb_compensacion_periodo p CROSS JOIN public.tb_compensacion_colaborador c
 JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=4 AND NOT coalesce(u.flag_super_admin,false)
 JOIN public.tb_estado ec ON ec.id=c.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
 JOIN public.tb_estado eu ON eu.id=u.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
 LEFT JOIN public.tb_compensacion_seguimiento_resultado r ON r.periodo=p.periodo AND r.id_colaborador=c.id
 LEFT JOIN public.tb_compensacion_seguimiento_cola q ON q.periodo=p.periodo AND q.id_colaborador=c.id
 WHERE p.estado_periodo IN('ABIERTO','EN_CALCULO','EN_REVISION','OBSERVADO','REABIERTO')
   AND (q.periodo IS NULL OR q.revision=q.revision_procesada)
   AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_seguimiento_invalidacion i
     WHERE i.periodo=p.periodo AND i.id_colaborador=c.id AND NOT i.procesada)
   AND (r.fecha_calculo IS NULL OR r.fecha_calculo<now()-interval '60 seconds')
   AND EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion a
     JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
     WHERE a.id_colaborador=c.id AND a.fecha_inicio<p.periodo+interval '1 month'
       AND coalesce(a.fecha_fin,'infinity'::date)>=p.periodo)
 ORDER BY r.fecha_calculo NULLS FIRST,p.periodo,c.id LIMIT p_limite
 ON CONFLICT(periodo,id_colaborador) DO UPDATE SET revision=tb_compensacion_seguimiento_cola.revision+1,
   motivo='RECUPERACION',disponible_desde=now(),ultima_transaccion=txid_current(),fecha_evento=now();
 GET DIAGNOSTICS filas=ROW_COUNT;
 RETURN filas;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_tarjeta_archivo_valido(p_evidencia jsonb, p_autor bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
DECLARE propietario uuid; objeto storage.objects%ROWTYPE;
BEGIN
 SELECT auth_user_id INTO propietario FROM public.tb_usuario WHERE id=p_autor;
 IF propietario IS NULL OR p_evidencia->>'tipo' IS DISTINCT FROM 'IMAGEN_TARJETA'
  OR p_evidencia->>'bucket' IS DISTINCT FROM 'compensaciones-tarjetas-erroneas'
  OR split_part(coalesce(p_evidencia->>'path',''),'/',1)<>propietario::text
  OR coalesce(p_evidencia->>'path','') !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  OR coalesce(length(btrim(p_evidencia->>'nombre')),0) NOT BETWEEN 1 AND 255 THEN RETURN false; END IF;
 SELECT * INTO objeto FROM storage.objects WHERE bucket_id='compensaciones-tarjetas-erroneas' AND name=p_evidencia->>'path';
 IF objeto.id IS NULL OR coalesce(objeto.owner_id,objeto.owner::text) IS DISTINCT FROM propietario::text
  OR coalesce(objeto.metadata->>'mimetype','') NOT IN('image/jpeg','image/png','image/webp')
  OR objeto.metadata->>'mimetype' IS DISTINCT FROM p_evidencia->>'mime_type'
  OR coalesce(objeto.metadata->>'size','') !~ '^[0-9]+$'
  OR objeto.metadata->>'size' IS DISTINCT FROM p_evidencia->>'size' THEN RETURN false; END IF;
 RETURN (objeto.metadata->>'size')::bigint BETWEEN 1 AND 5242880;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_tarjeta_storage(p_accion text, p_ruta text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth', 'storage'
AS $function$
DECLARE registro record; vinculado boolean:=false; contexto jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_ruta IS NULL THEN RETURN false; END IF;
 -- Serializar limpieza/vinculacion. VOLATILE obtiene snapshot nuevo tras esperar.
 IF p_accion='ELIMINAR_HUERFANO' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('tarjeta:archivo:'||p_ruta,0));
 END IF;
 FOR registro IN SELECT e.id,e.id_usuario_registra,a AS archivo FROM public.tb_compensacion_evento e
  JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
  CROSS JOIN LATERAL jsonb_array_elements(e.evidencia) a
  WHERE t.categoria='TARJETA_TERCERO' AND a->>'bucket'='compensaciones-tarjetas-erroneas' AND a->>'path'=p_ruta
 LOOP
  vinculado:=true;
  IF p_accion='LEER' AND public.f_private_compensacion_tarjeta_archivo_valido(registro.archivo,registro.id_usuario_registra) THEN
   BEGIN
    PERFORM public.f_private_compensacion_evento_validar_alcance(registro.id,'CONSULTAR',false);
    RETURN true;
   EXCEPTION WHEN raise_exception THEN NULL;
   END;
  END IF;
 END LOOP;
 IF vinculado OR p_accion NOT IN('SUBIR','ELIMINAR_HUERFANO','LEER') THEN RETURN false; END IF;
 contexto:=public.f_private_compensacion_contexto('TARJETAS','REGISTRAR');
 RETURN split_part(p_ruta,'/',1)=auth.uid()::text
  AND p_ruta ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$';
EXCEPTION WHEN raise_exception THEN RETURN false;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_tarjeta_ultimos4(p_valor text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF p_valor IS NULL OR btrim(p_valor) !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Ingresa los 4 últimos dígitos de la tarjeta';
  END IF;
  RETURN btrim(p_valor);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_tiktok_clientes(p_colaborador bigint DEFAULT NULL::bigint)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
 SELECT DISTINCT ON(c.id,ev.id_colaborador_beneficiario) jsonb_build_object(
   'id',c.id,'id_evento',ev.id,'id_colaborador',ev.id_colaborador_beneficiario,'id_usuario',c.id_usuario,
   'id_sucursal',ev.id_sucursal_origen,'nombre',c.nombre,'documento',c.numero_documento,
   'tipo_documento',c.tipo_documento,'celular',c.celular,'id_comunidad',c.id_comunidad,
   'fecha_registro',c.fecha_registro,'vence',c.fecha_registro+interval '168 hours',
   'estado',CASE WHEN pagada.id IS NOT NULL AND regla.id IS NULL THEN 'EN_REVISION'
     WHEN pagada.id IS NOT NULL THEN 'BONO_HABILITADO'
     WHEN EXISTS(SELECT 1 FROM public.tb_operacion_proceso x
       WHERE x.id_cliente=c.id AND x.fecha_pagado IS NULL AND upper(btrim(x.nombre_estado))='PAGADO'
         AND (public.f_private_compensacion_cliente_nuevo_operacion_estado(x.id)->>'es_final')::boolean) THEN 'EN_REVISION'
     WHEN now()>c.fecha_registro+interval '168 hours' THEN 'BLOQUEADO'
     WHEN pendiente.id IS NOT NULL THEN 'OPERACION_PENDIENTE' ELSE 'ESPERANDO_OPERACION' END,
   'requiere_cuota',false,'revision_cuota',ev.criterios_validacion_snapshot->'revision_cuota_tiktok',
   'motivo',NULL,
   'puede_editar',EXISTS(SELECT 1 FROM public.tb_usuario u WHERE u.id=c.id_usuario AND u.auth_user_id=auth.uid()) AND now()<=c.fecha_registro+interval '168 hours' AND NOT EXISTS(
     SELECT 1 FROM public.tb_operacion_proceso o WHERE o.id_cliente=c.id OR regexp_replace(coalesce(o.dni_cliente,''),'[^0-9]','','g')=c.numero_documento),
   'id_operacion',coalesce(pagada.id,pendiente.id),
   'operacion',coalesce(pagada.codigo_operacion_deposito_cliente,pendiente.codigo_operacion_deposito_cliente),
   'servicio',coalesce(pagada.tipo_servicio,pendiente.tipo_servicio),
   'monto',coalesce(pagada.monto_deposito_cliente,pendiente.monto_deposito_cliente),
   'estado_operacion',coalesce(pagada.estado_operacion,pendiente.estado_operacion,'Sin operación'),
   'fecha_efectiva',pagada.fecha_efectiva,'ganancia',CASE WHEN pagada.id IS NULL THEN 0 ELSE regla.importe END,
   'id_regla',regla.id,'id_concepto',tipo.id_concepto,'id_asignacion',regla.id_asignacion,
   'id_plan_version',regla.id_plan_version,'regla_snapshot',regla.snapshot,'evidencia',ev.evidencia)
 FROM public.tb_compensacion_evento ev
 JOIN public.tb_compensacion_evento_tipo tipo ON tipo.id=ev.id_tipo_evento AND tipo.codigo='TIKTOK_LIVE'
 JOIN public.tb_compensacion_evento_referencia ref ON ref.id_evento=ev.id AND ref.tipo_referencia='CLIENTE'
 JOIN public.tb_cliente c ON c.id=ref.id_cliente AND c.id_usuario=ev.id_usuario_registra
 LEFT JOIN LATERAL (
   SELECT op.*, (s.estado->>'fecha_pago')::timestamptz fecha_efectiva,s.estado->>'estado' estado_operacion
   FROM public.tb_operacion_proceso op
   CROSS JOIN LATERAL (SELECT public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id) estado) s
   WHERE op.id_cliente=c.id AND (s.estado->>'pagada')::boolean
     AND (NOT EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=c.id_usuario AND id_rol=2)
       OR coalesce(op.id_usuario_gestor,op.id_usuario)=c.id_usuario)
     AND (s.estado->>'fecha_pago')::timestamptz BETWEEN c.fecha_registro AND c.fecha_registro+interval '168 hours'
   ORDER BY (s.estado->>'fecha_pago')::timestamptz,op.id LIMIT 1
 ) pagada ON true
 LEFT JOIN LATERAL (
   SELECT op.*,s.estado->>'estado' estado_operacion FROM public.tb_operacion_proceso op
   CROSS JOIN LATERAL (SELECT public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id) estado) s
   WHERE op.id_cliente=c.id AND (s.estado->>'es_final')::boolean AND NOT (s.estado->>'pagada')::boolean
     AND op.fecha_registro BETWEEN c.fecha_registro AND c.fecha_registro+interval '168 hours'
   ORDER BY op.fecha_registro,op.id LIMIT 1
 ) pendiente ON true
 LEFT JOIN LATERAL (
   SELECT r.id,a.id id_asignacion,r.id_plan_version,to_jsonb(r) snapshot,
     round(least(CASE WHEN r.tipo_calculo='PORCENTAJE' THEN greatest(coalesce(pagada.monto_deposito_cliente,0),0)*coalesce(r.porcentaje,0)/100 ELSE coalesce(r.monto,0) END,
       coalesce(r.tope_importe,CASE WHEN r.tipo_calculo='PORCENTAJE' THEN greatest(coalesce(pagada.monto_deposito_cliente,0),0)*coalesce(r.porcentaje,0)/100 ELSE coalesce(r.monto,0) END)),2) importe
   FROM public.tb_compensacion_asignacion a JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
   CROSS JOIN LATERAL public.f_private_compensacion_reglas_colaborador_fecha(a.id_plan,(pagada.fecha_efectiva AT TIME ZONE 'America/Lima')::date,ev.id_colaborador_beneficiario) r
   JOIN public.tb_estado er ON er.id=r.id_estado AND upper(btrim(er.nombre))='ACTIVO'
   WHERE pagada.id IS NOT NULL AND a.id_colaborador=ev.id_colaborador_beneficiario
     AND a.fecha_inicio<=(pagada.fecha_efectiva AT TIME ZONE 'America/Lima')::date
     AND (a.fecha_fin IS NULL OR a.fecha_fin>=(pagada.fecha_efectiva AT TIME ZONE 'America/Lima')::date)
     AND r.id_concepto=tipo.id_concepto AND r.tipo_calculo IN('FIJO','POR_UNIDAD','PORCENTAJE')
     AND (r.id_cargo IS NULL OR r.id_cargo=a.id_cargo) AND (r.id_sucursal IS NULL OR r.id_sucursal=a.id_sucursal)
     AND (r.valor_minimo IS NULL OR pagada.monto_deposito_cliente>=r.valor_minimo)
     AND (r.valor_maximo IS NULL OR pagada.monto_deposito_cliente<=r.valor_maximo)
   ORDER BY ((r.id_cargo IS NOT NULL)::integer+(r.id_sucursal IS NOT NULL)::integer) DESC,r.prioridad DESC,r.id DESC LIMIT 1
 ) regla ON true
 WHERE ev.fuente='CLIENTE' AND ev.clave_origen='TIKTOK_REGISTRO:'||c.id
   AND ev.datos->>'flujo'='TIKTOK_CLIENTE_NUEVO_7_DIAS'
   AND ev.estado_evento NOT IN('RECHAZADO','ANULADO')
   AND (p_colaborador IS NULL OR ev.id_colaborador_beneficiario=p_colaborador)
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(ev.evidencia) e JOIN storage.objects o
     ON o.bucket_id=e->>'bucket' AND o.name=e->>'path' WHERE e->>'tipo'='IMAGEN_TIKTOK' AND o.bucket_id='compensaciones-tiktok-live')
 ORDER BY c.id,ev.id_colaborador_beneficiario,ev.id;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_tiktok_detalles(p_periodo bigint, p_colaborador bigint)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT jsonb_build_object('id_asignacion',j->'id_asignacion','id_plan_version',j->'id_plan_version',
   'fecha_inicio_tramo',pe.fecha_inicio,'fecha_fin_tramo',pe.fecha_fin,
   'id_concepto',co.id,'id_regla',j->'id_regla','tipo_origen','OPERACION',
   'clave_origen','CAPTACION:COMISION_TIKTOK_LIVE:'||(j->>'id')||':'||p_colaborador,
   'id_evento',NULL,'id_jornada',NULL,'id_operacion',j->'id_operacion','id_excepcion',NULL,
   'concepto_codigo',co.codigo,'concepto_nombre',co.nombre,'categoria',co.categoria,'naturaleza',co.naturaleza,
   'regla_snapshot',j->'regla_snapshot','formula_snapshot','primera operación final pagada en 168 horas desde el registro TikTok',
   'base_calculo',j->'monto','cantidad',1,'tarifa',j->'ganancia','importe',j->'ganancia',
   'datos_origen',j||jsonb_build_object('fuente_operacion','TIKTOK_CLIENTE_NUEVO_7_DIAS'))
 FROM public.tb_compensacion_periodo pe CROSS JOIN LATERAL public.f_private_compensacion_tiktok_clientes(p_colaborador) j
 JOIN public.tb_compensacion_concepto co ON co.id=(j->>'id_concepto')::bigint
 WHERE pe.id=p_periodo AND j->>'estado'='BONO_HABILITADO' AND (j->>'ganancia')::numeric IS NOT NULL
   AND ((j->>'fecha_efectiva')::timestamptz AT TIME ZONE pe.zona_horaria)::date BETWEEN pe.fecha_inicio AND pe.fecha_fin;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_tiktok_storage(p_accion character varying, p_ruta text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'storage'
AS $function$
DECLARE
  v_contexto jsonb;
  v_usuario uuid := auth.uid();
  v_id_usuario bigint;
  v_id_colaborador bigint;
  v_sucursal bigint;
  v_alcance text;
BEGIN
  IF v_usuario IS NULL OR p_ruta IS NULL OR btrim(p_ruta) = '' THEN RETURN false; END IF;

  IF p_accion IN ('SUBIR','ELIMINAR_HUERFANO') THEN
    BEGIN
      PERFORM public.f_private_compensacion_contexto('BONO:TIKTOK_LIVE','REGISTRAR');
    EXCEPTION WHEN OTHERS THEN
      RETURN false;
    END;
    IF split_part(p_ruta,'/',1) <> v_usuario::text
       OR array_length(string_to_array(p_ruta,'/'),1) <> 2
       OR split_part(p_ruta,'/',2) !~* '^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$' THEN
      RETURN false;
    END IF;
    IF p_accion='SUBIR' THEN RETURN true; END IF;
    RETURN NOT EXISTS (
      SELECT 1
      FROM public.tb_compensacion_evento ev
      JOIN public.tb_compensacion_evento_tipo tipo ON tipo.id=ev.id_tipo_evento
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(ev.evidencia)='array' THEN ev.evidencia ELSE '[]'::jsonb END
      ) evidencia(item)
      WHERE tipo.codigo='TIKTOK_LIVE'
        AND evidencia.item->>'bucket'='compensaciones-tiktok-live'
        AND evidencia.item->>'path'=p_ruta
    );
  END IF;

  IF p_accion <> 'LEER' THEN RETURN false; END IF;
  BEGIN
    v_contexto:=public.f_private_compensacion_contexto('BONO:TIKTOK_LIVE','CONSULTAR');
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  v_id_usuario:=(v_contexto->>'id_usuario')::bigint;
  v_id_colaborador:=NULLIF(v_contexto->>'id_colaborador','')::bigint;
  v_sucursal:=NULLIF(v_contexto->>'id_sucursal_alcance','')::bigint;
  v_alcance:=v_contexto->>'alcance';

  RETURN EXISTS (
    SELECT 1
    FROM public.tb_compensacion_evento ev
    JOIN public.tb_compensacion_evento_tipo tipo ON tipo.id=ev.id_tipo_evento
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(ev.evidencia)='array' THEN ev.evidencia ELSE '[]'::jsonb END
    ) evidencia(item)
    WHERE tipo.codigo='TIKTOK_LIVE'
      AND evidencia.item->>'bucket'='compensaciones-tiktok-live'
      AND evidencia.item->>'path'=p_ruta
      AND public.f_private_compensacion_equipo_visible(v_contexto,ev.id_colaborador_beneficiario,
        (ev.fecha_evento AT TIME ZONE 'America/Lima')::date)
      AND (
        COALESCE((v_contexto->>'es_super_admin')::boolean,false)
        OR ev.id_usuario_registra=v_id_usuario
        OR ev.id_colaborador_beneficiario=v_id_colaborador
        OR ev.id_colaborador_responsable=v_id_colaborador
        OR (v_alcance='SEDE' AND (
          ev.id_sucursal_origen=v_sucursal
          OR ev.id_sucursal_responsable=v_sucursal
          OR EXISTS (
            SELECT 1 FROM public.tb_compensacion_colaborador colaborador
            JOIN public.tb_usuario usuario ON usuario.id=colaborador.id_usuario
            WHERE colaborador.id=ev.id_colaborador_beneficiario
              AND usuario.id_sucursal=v_sucursal
          )
        ))
      )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_tiktok_validar(p_id_evento bigint)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_evento public.tb_compensacion_evento%ROWTYPE;
  v_tipo public.tb_compensacion_evento_tipo%ROWTYPE;
  v_cliente public.tb_cliente%ROWTYPE;
  v_operacion public.tb_operacion_proceso%ROWTYPE;
BEGIN
  SELECT * INTO v_evento FROM public.tb_compensacion_evento WHERE id=p_id_evento;
  SELECT * INTO v_tipo FROM public.tb_compensacion_evento_tipo WHERE id=v_evento.id_tipo_evento;
  IF v_evento.id IS NULL OR v_tipo.codigo<>'TIKTOK_LIVE' THEN RETURN; END IF;
  IF v_evento.datos->>'flujo'='TIKTOK_CLIENTE_NUEVO_7_DIAS' THEN
    RAISE EXCEPTION 'TikTok Live se evalúa automáticamente por cliente nuevo; no admite aprobación manual';
  END IF;

  IF (SELECT count(*) FROM public.tb_compensacion_evento_referencia
      WHERE id_evento=p_id_evento AND tipo_referencia='CLIENTE' AND id_cliente IS NOT NULL)<>1
     OR (SELECT count(*) FROM public.tb_compensacion_evento_referencia
      WHERE id_evento=p_id_evento AND tipo_referencia='OPERACION' AND id_operacion IS NOT NULL)<>1 THEN
    RAISE EXCEPTION 'TikTok Live requiere vincular exactamente un cliente y una operación';
  END IF;

  SELECT c.* INTO v_cliente
  FROM public.tb_cliente c
  JOIN public.tb_compensacion_evento_referencia r ON r.id_cliente=c.id
  WHERE r.id_evento=p_id_evento AND r.tipo_referencia='CLIENTE';
  SELECT op.* INTO v_operacion
  FROM public.tb_operacion_proceso op
  JOIN public.tb_compensacion_evento_referencia r ON r.id_operacion=op.id
  WHERE r.id_evento=p_id_evento AND r.tipo_referencia='OPERACION';
  IF v_cliente.id IS NULL OR v_operacion.id IS NULL OR v_operacion.id_cliente IS DISTINCT FROM v_cliente.id THEN
    RAISE EXCEPTION 'La operación debe pertenecer al cliente vinculado';
  END IF;
  IF upper(btrim(coalesce(v_operacion.nombre_estado,'')))<>'PAGADO' THEN
    RAISE EXCEPTION 'La operación de TikTok Live debe estar pagada';
  END IF;
  IF v_operacion.fecha_deposito_cliente IS NULL THEN
    RAISE EXCEPTION 'La operación no tiene fecha de depósito';
  END IF;
  IF NOT coalesce((public.f_private_compensacion_cliente_nuevo_operacion_estado(v_operacion.id)->>'pagada')::boolean,false)
    OR (public.f_private_compensacion_cliente_nuevo_operacion_estado(v_operacion.id)->>'fecha_pago')::timestamptz
      NOT BETWEEN v_cliente.fecha_registro AND v_cliente.fecha_registro+interval '168 hours' THEN
    RAISE EXCEPTION 'TikTok Live requiere una operación final pagada dentro de siete días del registro del cliente';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tb_operacion_proceso_eliminada x WHERE x.id_operacion_proceso=v_operacion.id) THEN
    RAISE EXCEPTION 'La operación de TikTok Live fue eliminada';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_evento.evidencia) AS evidencia(item)
    JOIN storage.objects objeto
      ON objeto.bucket_id=evidencia.item->>'bucket'
     AND objeto.name=evidencia.item->>'path'
    WHERE evidencia.item->>'tipo'='IMAGEN_TIKTOK'
      AND objeto.bucket_id='compensaciones-tiktok-live'
  ) THEN
    RAISE EXCEPTION 'Adjunta una imagen de evidencia de TikTok Live antes de enviar';
  END IF;

END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_usuario_vincular_auth(p_id_usuario bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_usuario public.tb_usuario%ROWTYPE; v_auth uuid; v_total bigint;
BEGIN
  SELECT * INTO v_usuario FROM public.tb_usuario WHERE id=p_id_usuario FOR UPDATE;
  IF v_usuario.id IS NULL THEN RAISE EXCEPTION 'El usuario vinculado no existe'; END IF;
  IF nullif(btrim(v_usuario.email),'') IS NULL THEN RAISE EXCEPTION 'Configura el correo del usuario antes de guardar su ficha'; END IF;
  SELECT count(*) INTO v_total FROM public.tb_usuario WHERE lower(btrim(email))=lower(btrim(v_usuario.email));
  IF v_total<>1 THEN RAISE EXCEPTION 'El correo corresponde a varios usuarios operativos; corrige el duplicado antes de vincular'; END IF;
  SELECT count(*), (array_agg(id))[1] INTO v_total,v_auth FROM auth.users
    WHERE lower(btrim(email))=lower(btrim(v_usuario.email)) AND deleted_at IS NULL;
  IF v_total=0 THEN RAISE EXCEPTION 'El usuario % no tiene cuenta de acceso en Supabase Auth. Completa su alta de acceso antes de guardar la ficha',v_usuario.username; END IF;
  IF v_total<>1 THEN RAISE EXCEPTION 'El correo tiene varias cuentas de acceso; revisa la identidad antes de vincular'; END IF;
  PERFORM id FROM auth.users WHERE id=v_auth AND email_confirmed_at IS NOT NULL
    AND lower(btrim(email))=lower(btrim(v_usuario.email)) AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El usuario % debe confirmar su correo de acceso antes de vincular la ficha',v_usuario.username;
  END IF;
  IF v_usuario.auth_user_id IS NOT NULL AND v_usuario.auth_user_id IS DISTINCT FROM v_auth THEN
    RAISE EXCEPTION 'El usuario ya está vinculado a otra cuenta Auth; revisa la identidad sin reemplazarla automáticamente';
  END IF;
  IF EXISTS(SELECT 1 FROM public.tb_usuario WHERE auth_user_id=v_auth AND id<>p_id_usuario) THEN
    RAISE EXCEPTION 'La cuenta Auth ya está vinculada a otro usuario operativo';
  END IF;
  IF v_usuario.auth_user_id IS NULL THEN
    UPDATE public.tb_usuario SET auth_user_id=v_auth WHERE id=p_id_usuario;
  END IF;
  RETURN v_auth;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_validar_colaborador(p_id_colaborador bigint, p_accion character varying, p_fecha_referencia date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_alcance character varying;
  v_id_colaborador_actor bigint;
  v_id_sucursal_alcance bigint;
  v_fecha date := COALESCE(p_fecha_referencia, CURRENT_DATE);
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_colaborador c
    WHERE c.id = p_id_colaborador
  ) THEN
    RAISE EXCEPTION 'El colaborador no existe';
  END IF;

  v_contexto := public.f_private_compensacion_contexto(
    'COLABORADORES',
    p_accion
  );
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(
    v_contexto ->> 'id_colaborador',
    ''
  )::bigint;
  v_id_sucursal_alcance := NULLIF(
    v_contexto ->> 'id_sucursal_alcance',
    ''
  )::bigint;

  IF v_alcance = 'PROPIO'
     AND p_id_colaborador IS DISTINCT FROM v_id_colaborador_actor THEN
    RAISE EXCEPTION 'Solo puede acceder a su propia ficha laboral';
  END IF;

  IF v_alcance = 'SEDE' AND NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_asignacion a
    WHERE a.id_colaborador = p_id_colaborador
      AND a.id_sucursal = v_id_sucursal_alcance
      AND a.fecha_inicio <= v_fecha
      AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_fecha)
  ) THEN
    RAISE EXCEPTION 'El colaborador no pertenece a su sede autorizada';
  END IF;

  IF NOT public.f_private_compensacion_equipo_visible(v_contexto,p_id_colaborador,v_fecha) THEN
    RAISE EXCEPTION 'El colaborador no pertenece a su equipo vigente';
  END IF;
  RETURN v_contexto;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_validar_configuracion_asistencia(p_configuracion jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_clave text; v_valor numeric;
BEGIN
  IF p_configuracion IS NOT NULL AND jsonb_typeof(p_configuracion) <> 'object' THEN
    RAISE EXCEPTION 'La configuracion de regla debe ser un objeto JSON';
  END IF;
  PERFORM public.f_private_compensacion_fechas_no_laborables(p_configuracion);
  -- Las horas extra por asistencia se retiraron; solo se valida la forma y las fechas no laborables.
  END;
$function$;

CREATE OR REPLACE FUNCTION public.f_private_compensacion_validar_periodo(p_id_periodo bigint, p_recurso character varying, p_accion character varying, p_estados_permitidos character varying[] DEFAULT NULL::character varying[], p_bloquear boolean DEFAULT false, p_requiere_global boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_periodo public.tb_compensacion_periodo%ROWTYPE;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    p_recurso,
    p_accion
  );

  IF COALESCE(p_requiere_global, false)
     AND (v_contexto ->> 'alcance') <> 'GLOBAL' THEN
    RAISE EXCEPTION 'Esta operacion sobre el periodo requiere alcance GLOBAL';
  END IF;

  IF COALESCE(p_bloquear, false) THEN
    SELECT * INTO v_periodo
    FROM public.tb_compensacion_periodo
    WHERE id = p_id_periodo
    FOR UPDATE;
  ELSE
    SELECT * INTO v_periodo
    FROM public.tb_compensacion_periodo
    WHERE id = p_id_periodo;
  END IF;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'El periodo de compensaciones no existe';
  END IF;

  IF p_estados_permitidos IS NOT NULL
     AND NOT v_periodo.estado_periodo = ANY(p_estados_permitidos) THEN
    RAISE EXCEPTION
      'El periodo se encuentra en estado %; estados permitidos: %',
      v_periodo.estado_periodo,
      array_to_string(p_estados_permitidos, ', ');
  END IF;

  RETURN jsonb_build_object(
    'id_usuario', (v_contexto ->> 'id_usuario')::bigint,
    'es_super_admin', (v_contexto ->> 'es_super_admin')::boolean,
    'alcance', v_contexto ->> 'alcance',
    'id_periodo', v_periodo.id,
    'periodo', v_periodo.periodo,
    'fecha_inicio', v_periodo.fecha_inicio,
    'fecha_fin', v_periodo.fecha_fin,
    'estado_periodo', v_periodo.estado_periodo,
    'numero_calculo', v_periodo.numero_calculo,
    'zona_horaria', v_periodo.zona_horaria
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
