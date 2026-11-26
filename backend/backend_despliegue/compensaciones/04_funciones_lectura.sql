-- 04_funciones_lectura.sql
-- Baseline de Compensaciones (22/11/2026), generado desde la base de desarrollo. 106 funciones. Funciones de lectura (f_get_*).
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

CREATE OR REPLACE FUNCTION public.f_get_compensacion_admin_registros_validacion(p_clientes bigint[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb;
BEGIN
 ctx := public.f_private_compensacion_contexto('RESUMEN', 'CONSULTAR');
 IF NOT coalesce((ctx->>'es_super_admin')::boolean, false) THEN RAISE EXCEPTION 'Consulta exclusiva de Administracion'; END IF;
 IF p_clientes IS NULL OR cardinality(p_clientes) > 100 THEN RAISE EXCEPTION 'Consulta invalida'; END IF;
 RETURN jsonb_build_object('items', coalesce((
  SELECT jsonb_agg(jsonb_build_object('id_cliente', v.id_cliente, 'id_evento', v.id, 'estado', v.estado_evento, 'importe', v.importe_aprobado))
  FROM (
   -- La ultima validacion de cada cliente: un rechazo permite que el Jefe Superior vuelva a validar.
   SELECT DISTINCT ON (r.id_cliente) r.id_cliente, e.id, e.estado_evento, e.importe_aprobado
   FROM public.tb_compensacion_evento e
   JOIN public.tb_compensacion_evento_referencia r ON r.id_evento = e.id AND r.tipo_referencia = 'CLIENTE'
   WHERE r.id_cliente = ANY(p_clientes) AND e.datos->>'flujo' = 'PAGOS_AUDITAR_NUEVOS_V1' AND e.estado_evento <> 'ANULADO'
   ORDER BY r.id_cliente, e.id DESC) v), '[]'::jsonb));
END; $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_administracion_auditoria(p_tipo text DEFAULT NULL::text, p_perfil text DEFAULT NULL::text, p_estado text DEFAULT NULL::text, p_busqueda text DEFAULT NULL::text, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20, p_grupo text DEFAULT 'OPERACIONES'::text, p_concepto text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; resultado jsonb; v_busqueda text := nullif(btrim(coalesce(p_busqueda, '')), '');
BEGIN
 ctx := public.f_private_compensacion_contexto('RESUMEN', 'CONSULTAR');
 IF NOT coalesce((ctx->>'es_super_admin')::boolean, false) THEN RAISE EXCEPTION 'Consulta exclusiva de Administracion'; END IF;
 IF p_grupo IS NULL OR p_grupo NOT IN ('OPERACIONES', 'INDISCIPLINA', 'ESCALONADA')
   OR (p_concepto IS NOT NULL AND (p_grupo <> 'INDISCIPLINA' OR p_concepto NOT IN ('UNIFORME', 'INDISCIPLINA', 'QUEJA_TARDIA'))) THEN
  RAISE EXCEPTION 'Filtro o paginacion invalidos';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(
        public.f_get_tb_navegacion_x_usuario((ctx->>'id_usuario')::bigint)->'rutas_permitidas') r
      WHERE r = CASE p_grupo WHEN 'INDISCIPLINA' THEN '/compensaciones/indisciplina-colaborador'
        WHEN 'ESCALONADA' THEN '/compensaciones/penalidad-escalonada-bonos' ELSE '/compensaciones/auditoria-operaciones' END) THEN
  RAISE EXCEPTION 'Opcion no asignada';
 END IF;
 IF p_pagina IS NULL OR p_pagina < 1 OR p_tamano IS NULL OR p_tamano NOT IN (20, 50, 100)
   OR (p_tipo IS NOT NULL AND p_tipo NOT IN ('BONO', 'PENALIDAD'))
   OR (p_perfil IS NOT NULL AND p_perfil NOT IN ('ATC', 'JEFE', 'FACTURACION', 'PAGOS', 'MARKETING'))
   OR (p_estado IS NOT NULL AND p_estado NOT IN ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'ANULADO')) THEN
  RAISE EXCEPTION 'Filtro o paginacion invalidos';
 END IF;
 WITH eventos AS (
  SELECT e.id, e.fecha_evento, e.estado_evento, e.importe_aprobado, e.descripcion, e.datos,
   t.codigo AS codigo_tipo, t.nombre AS nombre_tipo,
   coalesce(e.datos->'penalidad_tipo_snapshot'->>'codigo', pt.codigo) AS codigo_penalidad,
   coalesce(e.datos->'penalidad_tipo_snapshot'->>'nombre', pt.nombre) AS nombre_penalidad,
   CASE
    WHEN t.codigo = 'REPORTE_PENALIDAD' THEN 'PENALIDAD'
    WHEN t.codigo = 'AUDITORIA_ACTIVA' AND e.datos->>'consecuencia' IS DISTINCT FROM 'COMISION_JEFE' THEN 'PENALIDAD'
    ELSE 'BONO' END AS tipo,
   CASE
    WHEN t.codigo IN ('REPORTE_PENALIDAD', 'AUDITORIA_ACTIVA') THEN 'INCIDENCIA'
    WHEN e.datos->>'flujo' = 'FACTURACION_AUDITORIA_V1' THEN 'FACTURACION'
    WHEN t.codigo = 'ALERTA_TEMPRANA' THEN 'ALERTA'
    ELSE 'EVIDENCIA' END AS origen,
   e.id_colaborador_beneficiario, e.id_colaborador_responsable, e.id_usuario_registra, e.id_sucursal_responsable,
   coalesce((e.datos->'penalidad_tipo_snapshot'->>'requiere_respuesta')::boolean, pt.requiere_respuesta, false) AS requiere_descargo
  FROM public.tb_compensacion_evento e
  JOIN public.tb_compensacion_evento_tipo t ON t.id = e.id_tipo_evento
  LEFT JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id = e.id_penalidad_tipo
  WHERE e.estado_evento <> 'BORRADOR'
   AND CASE WHEN p_grupo = 'ESCALONADA' THEN
        coalesce(e.datos->'penalidad_tipo_snapshot'->>'codigo', pt.codigo, '') ~ 'ERROR_CUADRO$'
       WHEN p_grupo = 'INDISCIPLINA' THEN
        coalesce(e.datos->'penalidad_tipo_snapshot'->>'codigo', pt.codigo, '') ~ ('(' || coalesce(p_concepto, 'UNIFORME|INDISCIPLINA|QUEJA_TARDIA') || ')$')
       ELSE
        (t.codigo IN ('REPORTE_PENALIDAD', 'AUDITORIA_ACTIVA', 'DETECCION_ERROR_PAGO', 'OPERACION_EXTRA',
           'DETECCION_ERROR_MANUAL', 'REPORTE_ABANDONO', 'ALERTA_TEMPRANA') OR t.categoria = 'TARJETA_TERCERO')
        AND coalesce(e.datos->'penalidad_tipo_snapshot'->>'codigo', pt.codigo, '')
            !~ '(UNIFORME|INDISCIPLINA|DESCUADRE|CIERRE_INCOMPLETO|ERROR_CUADRO|QUEJA_TARDIA)$'
       END
 ), filas AS (
  SELECT ev.*,
   col.nombre_completo AS colaborador,
   cargo.nombre AS cargo,
   CASE
    WHEN cargo.codigo = 'ATENCION_CLIENTE' THEN 'ATC'
    WHEN cargo.codigo = 'JEFE_TIENDA' THEN 'JEFE'
    WHEN cargo.codigo = 'FACTURACION' THEN 'FACTURACION'
    WHEN cargo.codigo = 'DISENO_MARKETING' THEN 'MARKETING'
    WHEN cargo.codigo IN ('JEFE_SUPERIOR_PAGOS', 'OPERADOR_ALTA_DEMANDA', 'ENCARGADO_CARTERA_MEDIA', 'ASISTENTE_VIRTUAL_PAGOS') THEN 'PAGOS'
   END AS perfil,
   u.nombre AS registrado_por,
   (SELECT su.nombre FROM public.tb_sucursal su WHERE su.id = ev.id_sucursal_responsable) AS sede,
   CASE
    WHEN NOT ev.requiere_descargo THEN NULL
    WHEN EXISTS(SELECT 1 FROM public.tb_compensacion_evento_revision rv WHERE rv.id_evento = ev.id AND rv.etapa = 'DESCARGO') THEN 'PRESENTADO'
    ELSE 'PENDIENTE' END AS descargo,
   CASE
    WHEN ev.datos->>'flujo' = 'PAGOS_DETECCION_V1' THEN coalesce((SELECT rv.decision FROM public.tb_compensacion_evento_revision rv
      WHERE rv.id_evento = ev.id AND rv.etapa = 'JEFE_LINCE' ORDER BY rv.numero_paso DESC LIMIT 1), 'SIN_VALIDAR')
    WHEN ev.origen = 'ALERTA' THEN coalesce((SELECT rv.decision FROM public.tb_compensacion_evento_revision rv
      WHERE rv.id_evento = ev.id AND rv.etapa = 'JEFE_TIENDA' ORDER BY rv.numero_paso DESC LIMIT 1), 'SIN_VALIDAR')
   END AS validacion_jefe
  FROM eventos ev
  LEFT JOIN public.tb_compensacion_colaborador col ON col.id = CASE WHEN ev.tipo = 'PENALIDAD'
    THEN ev.id_colaborador_responsable ELSE coalesce(ev.id_colaborador_beneficiario, ev.id_colaborador_responsable) END
  LEFT JOIN LATERAL (
    SELECT ca.codigo, ca.nombre FROM public.tb_compensacion_asignacion a
    JOIN public.tb_compensacion_cargo ca ON ca.id = a.id_cargo
    WHERE a.id_colaborador = col.id
     AND (ev.fecha_evento AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin, 'infinity'::date)
    ORDER BY a.fecha_inicio DESC, a.id DESC LIMIT 1) cargo ON true
  JOIN public.tb_usuario u ON u.id = ev.id_usuario_registra
 ), base AS (
  SELECT * FROM filas f
  WHERE (p_tipo IS NULL OR f.tipo = p_tipo)
   AND (p_perfil IS NULL OR f.perfil = p_perfil)
   AND CASE
        WHEN p_estado IS NULL THEN f.estado_evento <> 'ANULADO'
        WHEN p_estado = 'APROBADO' THEN f.estado_evento IN ('APROBADO', 'LIQUIDADO')
        ELSE f.estado_evento = p_estado END
   AND (v_busqueda IS NULL OR strpos(lower(coalesce(f.colaborador, '')), lower(v_busqueda)) > 0
        OR strpos(lower(coalesce(f.registrado_por, '')), lower(v_busqueda)) > 0)
 ), pagina AS (
  SELECT * FROM base ORDER BY fecha_evento DESC, id DESC LIMIT p_tamano OFFSET (p_pagina::bigint - 1) * p_tamano
 )
 SELECT jsonb_build_object(
  'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', p.id, 'tipo', p.tipo, 'origen', p.origen,
      'concepto', CASE
         WHEN p.codigo_tipo = 'AUDITORIA_ACTIVA' AND p.tipo = 'BONO' THEN 'Bono de Auditoría Activa'
         ELSE coalesce(p.nombre_penalidad, p.nombre_tipo) END,
      'descripcion', p.descripcion, 'colaborador', p.colaborador, 'cargo', p.cargo, 'perfil', p.perfil,
      'registrado_por', p.registrado_por, 'fecha_evento', p.fecha_evento, 'estado_evento', p.estado_evento,
      'importe_aprobado', p.importe_aprobado, 'documento', p.datos->>'cliente_documento',
      'validacion_jefe', p.validacion_jefe, 'sede', p.sede, 'descargo', p.descargo) ORDER BY p.fecha_evento DESC, p.id DESC) FROM pagina p), '[]'::jsonb),
  'total', (SELECT count(*) FROM base),
  'total_paginas', (SELECT greatest(1, ceil(count(*)::numeric / p_tamano))::integer FROM base),
  'resumen', (SELECT jsonb_build_object(
      'pendientes', count(*) FILTER (WHERE estado_evento = 'PENDIENTE'),
      'penalidades_confirmadas', count(*) FILTER (WHERE tipo = 'PENALIDAD' AND estado_evento IN ('APROBADO', 'LIQUIDADO')),
      'bonos_aprobados', coalesce(sum(importe_aprobado) FILTER (WHERE tipo = 'BONO' AND estado_evento IN ('APROBADO', 'LIQUIDADO')), 0),
      'penalidades_aprobadas', coalesce(sum(importe_aprobado) FILTER (WHERE tipo = 'PENALIDAD' AND estado_evento IN ('APROBADO', 'LIQUIDADO')), 0))
    FROM base)
 ) INTO resultado;
 RETURN resultado;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_administracion_panel(p_mes date, p_sede bigint DEFAULT NULL::bigint, p_rol bigint DEFAULT NULL::bigint, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; actor bigint; col bigint; rutas text[]; mes date; resultado jsonb;
BEGIN
 ctx:=public.f_private_compensacion_contexto('RESUMEN','CONSULTAR');
 IF NOT coalesce((ctx->>'es_super_admin')::boolean,false) THEN RAISE EXCEPTION 'Consulta exclusiva de Administracion'; END IF;
 actor:=(ctx->>'id_usuario')::bigint;col:=nullif(ctx->>'id_colaborador','')::bigint;
 SELECT coalesce(array_agg(r),'{}'::text[]) INTO rutas FROM jsonb_array_elements_text(public.f_get_tb_navegacion_x_usuario(actor)->'rutas_permitidas') r;
 IF NOT '/compensaciones/resumen'=ANY(rutas) THEN RAISE EXCEPTION 'Dashboard no asignado'; END IF;
 IF p_mes IS NULL OR p_pagina IS NULL OR p_pagina<1 OR p_tamano IS NULL OR p_tamano NOT IN(20,50,100) THEN RAISE EXCEPTION 'Periodo o paginacion invalidos'; END IF;
 IF p_sede IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tb_sucursal s JOIN public.tb_estado es ON es.id=s.id_estado AND upper(btrim(es.nombre))='ACTIVO' WHERE s.id=p_sede) THEN RAISE EXCEPTION 'Sede invalida'; END IF;
 IF p_rol IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tb_rol r JOIN public.tb_estado es ON es.id=r.id_estado AND upper(btrim(es.nombre))='ACTIVO' WHERE r.id=p_rol) THEN RAISE EXCEPTION 'Rol invalido'; END IF;
 mes:=date_trunc('month',p_mes)::date;
 WITH eventos_base AS MATERIALIZED(
  SELECT e.id,e.id_usuario_registra,e.id_colaborador_beneficiario,e.id_colaborador_responsable,
   t.nombre tipo,u.id_rol,coalesce(a.id_sucursal,e.id_sucursal_origen,u.id_sucursal) id_sede,
   public.f_private_compensacion_admin_destino(t.codigo::text,t.categoria::text,e.id_penalidad_tipo IS NOT NULL,
    (SELECT coalesce(e.datos->'penalidad_tipo_snapshot'->>'codigo',pt.codigo) FROM public.tb_compensacion_penalidad_tipo pt WHERE pt.id=e.id_penalidad_tipo)) destino,
   e.id_usuario_registra=actor OR coalesce(col IN(e.id_colaborador_beneficiario,e.id_colaborador_responsable),false) otro
  FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
  LEFT JOIN public.tb_compensacion_colaborador c ON c.id=CASE WHEN e.id_penalidad_tipo IS NOT NULL THEN e.id_colaborador_responsable ELSE coalesce(e.id_colaborador_beneficiario,e.id_colaborador_responsable) END
  LEFT JOIN public.tb_usuario u ON u.id=c.id_usuario
  LEFT JOIN LATERAL(SELECT ax.id_sucursal FROM public.tb_compensacion_asignacion ax
   WHERE ax.id_colaborador=c.id AND (e.fecha_evento AT TIME ZONE 'America/Lima')::date BETWEEN ax.fecha_inicio AND coalesce(ax.fecha_fin,'infinity'::date)
   ORDER BY ax.fecha_inicio DESC,ax.id DESC LIMIT 1) a ON true
  WHERE e.estado_evento='PENDIENTE' AND e.periodo_imputacion=mes
   -- Alta LIVE en seguimiento no equivale a una solicitud de aprobacion manual.
   AND e.datos->>'flujo' IS DISTINCT FROM 'TIKTOK_CLIENTE_NUEVO_7_DIAS'
   -- Las calificaciones de clientes se evaluan solas: Administracion no las puede resolver.
   AND NOT(e.fuente='CLIENTE' AND t.codigo NOT IN('TIKTOK_LIVE','REFERIDO'))
 ), eventos AS MATERIALIZED(
  SELECT e.*,CASE WHEN e.destino=ANY(rutas) THEN e.destino ELSE '/compensaciones/evidencias' END enlace
  FROM eventos_base e WHERE (e.destino=ANY(rutas) OR '/compensaciones/evidencias'=ANY(rutas))
   AND (p_sede IS NULL OR e.id_sede=p_sede) AND (p_rol IS NULL OR e.id_rol=p_rol)
 ), tareas AS(
  SELECT tipo,id_rol,id_sede,enlace destino,count(*) pendientes,count(*) FILTER(WHERE otro) otro_revisor FROM eventos GROUP BY tipo,id_rol,id_sede,enlace
  ), pagina AS(SELECT * FROM tareas ORDER BY pendientes DESC,tipo,id_rol NULLS LAST,id_sede NULLS LAST LIMIT p_tamano OFFSET (p_pagina::bigint-1)*p_tamano)
 SELECT jsonb_build_object('ambito','GLOBAL','periodo',jsonb_build_object('mes',mes,'estado',coalesce((SELECT estado_periodo FROM public.tb_compensacion_periodo WHERE periodo=mes),'SIN_ABRIR')),
 'catalogos',jsonb_build_object('sedes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'nombre',s.nombre) ORDER BY s.nombre),'[]') FROM public.tb_sucursal s JOIN public.tb_estado es ON es.id=s.id_estado AND upper(btrim(es.nombre))='ACTIVO'),
 'roles',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'nombre',r.nombre) ORDER BY r.nombre),'[]') FROM public.tb_rol r JOIN public.tb_estado es ON es.id=r.id_estado AND upper(btrim(es.nombre))='ACTIVO')),
 'kpis',jsonb_build_object('eventos_pendientes',(SELECT count(*) FROM eventos),
  'correcciones_pendientes',NULL::bigint,
  'liquidaciones_pendientes',NULL::bigint,
  'otro_revisor',(SELECT count(*) FROM eventos WHERE otro)),
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',tipo||':'||coalesce(id_rol::text,'0')||':'||coalesce(id_sede::text,'0'),'tipo',tipo,'rol',coalesce(r.nombre,'Sin Rol'),'sede',coalesce(s.nombre,'Sin Sede'),
  'pendientes',p.pendientes,'otro_revisor',p.otro_revisor,'destino',p.destino) ORDER BY p.pendientes DESC,p.tipo,p.id_rol NULLS LAST,p.id_sede NULLS LAST) FROM pagina p LEFT JOIN public.tb_rol r ON r.id=p.id_rol LEFT JOIN public.tb_sucursal s ON s.id=p.id_sede),'[]'),
 'total',(SELECT count(*) FROM tareas),'total_paginas',(SELECT greatest(1,ceil(count(*)::numeric/p_tamano)) FROM tareas)) INTO resultado;
 RETURN resultado;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_administracion_revision(p_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
 SELECT public.f_private_compensacion_administracion_revision(p_id);
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_atc_bono_seguimiento(p_codigo text, p_mes date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  ctx jsonb; a public.tb_compensacion_asignacion%ROWTYPE;
  mes date; fin date; meta jsonb; calculo jsonb; periodo_id bigint;
  codigo text := upper(btrim(p_codigo));
BEGIN
  IF codigo IS NULL OR codigo NOT IN ('META_SEDE_SAFETYPAY','COLABORADOR_MES_ATENCIONES') THEN
    RAISE EXCEPTION 'Bono de seguimiento no permitido';
  END IF;
  IF p_mes IS NULL THEN RAISE EXCEPTION 'Selecciona un mes'; END IF;
  mes := date_trunc('month',p_mes)::date;
  fin := (mes + interval '1 month - 1 day')::date;
  ctx := public.f_private_compensacion_contexto(('BONO:'||codigo)::varchar,'CONSULTAR');
  IF ctx->>'alcance' <> 'PROPIO' OR NOT EXISTS (
    SELECT 1 FROM public.tb_usuario WHERE id=(ctx->>'id_usuario')::bigint AND id_rol=4
  ) THEN RAISE EXCEPTION 'Esta consulta corresponde al perfil personal ATC'; END IF;
  SELECT ax.* INTO a FROM public.tb_compensacion_asignacion ax
    JOIN public.tb_estado e ON e.id=ax.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE ax.id_colaborador=(ctx->>'id_colaborador')::bigint
      AND ax.fecha_inicio<=fin AND (ax.fecha_fin IS NULL OR ax.fecha_fin>=fin)
    ORDER BY ax.fecha_inicio DESC,ax.id DESC LIMIT 1;
  IF a.id IS NULL THEN RETURN jsonb_build_object('estado','SIN_ASIGNACION','mes',mes); END IF;
  IF codigo='COLABORADOR_MES_ATENCIONES' THEN
    RETURN jsonb_build_object('estado','SEGUIMIENTO','mes',mes,
      'fuente','ATENCIONES_WEB_OPERACIONES_V1',
      'atenciones_validas',(SELECT count(*) FROM public.tb_compensacion_atencion atn
        CROSS JOIN LATERAL public.f_private_compensacion_atencion_operacion(atn.id_operacion_raiz) op
        WHERE atn.id_usuario_asesor=(ctx->>'id_usuario')::bigint AND atn.estado='VIGENTE'
          AND (op->>'pagada')::boolean
          AND (atn.fecha_atencion AT TIME ZONE 'America/Lima')::date BETWEEN mes AND fin),
      'mensaje','Se cuentan tus atenciones registradas en la web con operaciones pagadas y vinculacion vigente. El reconocimiento mensual requiere validar puntualidad y disciplina; este contador no asigna un ganador ni un pago.');
  END IF;
  meta := public.f_private_compensacion_meta_evaluar(a.id_plan,a.id_sucursal,mes);
  SELECT id INTO periodo_id FROM public.tb_compensacion_periodo WHERE periodo=mes;
  IF periodo_id IS NOT NULL THEN
    calculo := public.f_private_compensacion_meta_area_calcular(periodo_id,a.id_colaborador);
  END IF;
  -- No devolver meta_snapshot, reglas ni poblacion con identidades de terceros.
  RETURN jsonb_build_object('mes',mes,'estado',CASE
      WHEN (meta->>'valor_meta')::numeric IS NULL OR (meta->>'valor_meta')::numeric<=0 THEN 'SIN_META'
      WHEN periodo_id IS NULL THEN 'SIN_PERIODO' ELSE 'PROVISIONAL' END,
    'fuente',meta->>'fuente', 'meta',jsonb_build_object(
      'objetivo',meta->'valor_meta','acumulado',meta->'acumulado',
      'operaciones',meta->'operaciones','porcentaje',meta->'porcentaje',
      'heredada',meta->'meta_heredada','periodo_origen',meta->'periodo_origen'),
    'importe_provisional',calculo#>'{detalles,0,importe}',
    'pendientes',COALESCE((SELECT jsonb_agg(jsonb_build_object('codigo',b->>'codigo','mensaje',b->>'mensaje'))
      FROM jsonb_array_elements(COALESCE(calculo->'bloqueos','[]'::jsonb)) b),'[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_atc_descuentos(p_codigo text, p_mes date, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE ctx jsonb; items jsonb; total bigint;
BEGIN
  ctx:=public.f_private_compensacion_contexto('MIS_BONOS','CONSULTAR');
  IF ctx->>'alcance'<>'PROPIO' OR NOT EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=(ctx->>'id_usuario')::bigint AND id_rol=4)
    THEN RAISE EXCEPTION 'Consulta exclusiva del perfil personal ATC'; END IF;
  IF p_codigo IS NULL OR p_codigo NOT IN('ATC_ERROR_DATOS','ATC_ABANDONO_CHAT','ATC_MAL_FLUJO','ATC_PROCESO_AIRE','ATC_ERROR_REGISTRO','ATC_UNIFORME','ATC_INDISCIPLINA','ATC_FRAUDE_DIGITAL')
    THEN RAISE EXCEPTION 'Concepto de descuento no permitido'; END IF;
  IF p_mes IS NULL OR p_pagina IS NULL OR p_pagina<1 OR p_tamano IS NULL OR p_tamano NOT IN(20,50,100)
    THEN RAISE EXCEPTION 'Periodo o paginacion invalida'; END IF;
  SELECT count(*) INTO total FROM public.tb_compensacion_evento ev
    JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id=ev.id_penalidad_tipo
    WHERE ev.id_colaborador_responsable=(ctx->>'id_colaborador')::bigint AND pt.codigo=p_codigo
      AND ev.estado_evento<>'BORRADOR'
      AND ev.fecha_evento>=date_trunc('month',p_mes)::timestamp AT TIME ZONE 'America/Lima'
      AND ev.fecha_evento<(date_trunc('month',p_mes)+interval '1 month')::timestamp AT TIME ZONE 'America/Lima';
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.fecha DESC,q.id DESC),'[]'::jsonb) INTO items FROM (
    SELECT ev.id,ev.fecha_evento fecha,ev.descripcion motivo,ev.estado_evento estado,
      CASE WHEN ev.estado_evento IN('APROBADO','LIQUIDADO') THEN ev.importe_aprobado END importe
    FROM public.tb_compensacion_evento ev JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id=ev.id_penalidad_tipo
    WHERE ev.id_colaborador_responsable=(ctx->>'id_colaborador')::bigint AND pt.codigo=p_codigo
      AND ev.estado_evento<>'BORRADOR'
      AND ev.fecha_evento>=date_trunc('month',p_mes)::timestamp AT TIME ZONE 'America/Lima'
      AND ev.fecha_evento<(date_trunc('month',p_mes)+interval '1 month')::timestamp AT TIME ZONE 'America/Lima'
    ORDER BY ev.fecha_evento DESC,ev.id DESC LIMIT p_tamano OFFSET ((p_pagina::bigint-1)*p_tamano)
  ) q;
  RETURN jsonb_build_object('items',items,'total',total);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_atc_operaciones_cliente(p_documento text, p_dias integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_doc text := btrim(coalesce(p_documento, ''));
  v_dias integer := least(greatest(coalesce(p_dias, 7), 1), 31);
  v_desde timestamptz;
  v_items jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tb_usuario u
    WHERE u.auth_user_id = auth.uid()
      AND (coalesce(u.flag_super_admin, false) OR u.id_rol = 1
        OR EXISTS (SELECT 1 FROM public.tb_permiso_usuario pu JOIN public.tb_permiso_menu pm ON pm.id = pu.id_permiso_menu
                   WHERE pu.id_usuario = u.id AND pm.ruta = '/compensaciones/tarjetas-erroneas'))
  ) THEN
    RAISE EXCEPTION 'Sin permiso para consultar operaciones del cliente';
  END IF;
  IF v_doc !~ '^[0-9]{8,9}$' THEN
    RAISE EXCEPTION 'Ingresa un documento valido';
  END IF;
  v_desde := (((now() AT TIME ZONE 'America/Lima')::date - (v_dias - 1))::timestamp) AT TIME ZONE 'America/Lima';
  -- Efectivizacion de cualquier banco o ruta, y Pago de deuda reutilizando f_get_tb_pago_deuda.
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.fecha DESC, x.id DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT op.id, coalesce(op.fecha_deposito_cliente, op.fecha_registro) AS fecha,
      jsonb_build_object(
        'id', op.id,
        'flujo', 'EFECTIVIZACION',
        'codigo', nullif(btrim(op.codigo_operacion_deposito_cliente), ''),
        'referencia', coalesce(nullif(btrim(op.codigo_operacion_deposito_cliente), ''), 'ID:' || op.id),
        'monto', op.monto_deposito_cliente,
        'comision', op.resultado_comision_servicio,
        'estado', op.nombre_estado,
        'fecha', coalesce(op.fecha_deposito_cliente, op.fecha_registro)
      ) AS item
    FROM public.tb_operacion_proceso op
    WHERE op.id_operacion_padre IS NULL
      AND upper(btrim(coalesce(op.tipo_servicio, ''))) = 'EFECTIVIZACION'
      AND btrim(coalesce(op.dni_cliente, '')) = v_doc
      AND coalesce(op.id_estado, 0) <> 10
      AND coalesce(op.fecha_deposito_cliente, op.fecha_registro) >= v_desde
      AND NOT EXISTS (SELECT 1 FROM public.tb_operacion_proceso_eliminada e WHERE e.id_operacion_proceso = op.id)
    UNION ALL
    SELECT (pd.j ->> 'id')::bigint, (pd.j ->> 'fecha_registro')::timestamptz,
      jsonb_build_object(
        'id', (pd.j ->> 'id')::bigint,
        'flujo', 'PAGO_DEUDA',
        'codigo', NULL,
        'referencia', 'ID:' || (pd.j ->> 'id'),
        'monto', greatest(coalesce((pd.j ->> 'monto_deposito_cliente')::numeric, 0), coalesce((pd.j ->> 'monto_transferencia_cliente')::numeric, 0)),
        'comision', (pd.j ->> 'resultado_comision_servicio')::numeric,
        'estado', pd.j ->> 'nombre_estado',
        'fecha', (pd.j ->> 'fecha_registro')::timestamptz
      )
    FROM public.f_get_tb_pago_deuda(p_dni_cliente => v_doc, p_fecha_desde => v_desde) AS pd(j)
    WHERE btrim(coalesce(pd.j ->> 'dni_cliente', '')) = v_doc
      AND coalesce((pd.j ->> 'id_estado')::bigint, 0) <> 10
      AND NOT EXISTS (SELECT 1 FROM public.tb_operacion_proceso_eliminada e WHERE e.id_operacion_proceso = (pd.j ->> 'id')::bigint)
  ) x;
  RETURN jsonb_build_object('documento', v_doc, 'dias', v_dias, 'desde', v_desde, 'items', v_items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_atc_safetypay_panel(p_mes date, p_busqueda text DEFAULT ''::text, p_banco text DEFAULT ''::text, p_codigo text DEFAULT ''::text, p_duplicados boolean DEFAULT false, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; asignacion public.tb_compensacion_asignacion%ROWTYPE; sede text; resultado jsonb;
  inicio date:=date_trunc('month',p_mes)::date; fin date:=(date_trunc('month',p_mes)+interval '1 month - 1 day')::date; meta jsonb;
  chats jsonb; revision_chats boolean:=false; estado_bono text;
BEGIN
  IF p_mes IS NULL OR p_pagina IS NULL OR p_pagina<1 OR p_tamano IS NULL OR p_tamano NOT IN(20,50,100) THEN RAISE EXCEPTION 'Consulta o paginacion invalida'; END IF;
  IF p_desde IS NOT NULL AND p_hasta IS NOT NULL AND p_desde>p_hasta THEN
    RAISE EXCEPTION 'La fecha Desde no puede ser posterior a Hasta'; END IF;
  ctx:=public.f_private_compensacion_safetypay_panel_contexto();
  SELECT a.* INTO asignacion FROM public.tb_compensacion_asignacion a
    JOIN public.tb_estado e ON e.id=a.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE a.id_colaborador=(ctx->>'id_colaborador')::bigint AND (ctx->>'alcance'<>'SEDE' OR a.id_sucursal=(ctx->>'id_sucursal_alcance')::bigint) AND a.fecha_inicio<=fin AND (a.fecha_fin IS NULL OR a.fecha_fin>=fin)
    ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1;
  SELECT s.nombre INTO sede FROM public.tb_sucursal s WHERE s.id=asignacion.id_sucursal;
  IF ctx->>'alcance'='GLOBAL' THEN sede:='Todas las Sedes'; END IF;
  IF ctx->>'alcance'<>'GLOBAL' AND asignacion.id IS NOT NULL THEN meta:=public.f_private_compensacion_meta_evaluar(asignacion.id_plan,asignacion.id_sucursal,inicio); END IF;
  IF ctx->>'alcance'='SEDE' AND EXISTS(SELECT 1 FROM public.tb_compensacion_cargo WHERE id=asignacion.id_cargo AND codigo='JEFE_TIENDA') THEN
    chats:=public.f_private_compensacion_meta_sede_chats(asignacion.id_sucursal,inicio);
    SELECT EXISTS(SELECT 1 FROM public.tb_compensacion_evento ev
      JOIN public.tb_compensacion_evento_tipo t ON t.id=ev.id_tipo_evento AND t.codigo='META_SEDE_SAFETYPAY'
      WHERE ev.id_colaborador_beneficiario=asignacion.id_colaborador AND ev.periodo_imputacion=inicio
        AND ev.estado_evento IN('APROBADO','LIQUIDADO')
        AND ev.criterios_validacion_snapshot#>>'{revision_meta_jefatura,sin_chats_descuidados}'='true'
        AND (ev.criterios_validacion_snapshot->>'id_asignacion')::bigint=asignacion.id) INTO revision_chats;
    estado_bono:=CASE WHEN (chats->>'confirmados')::bigint>0 THEN 'NO_APLICA'
      WHEN (chats->>'pendientes')::bigint>0 THEN 'EN_REVISION'
      WHEN meta->>'porcentaje' IS NULL THEN 'POR_EVALUAR'
      WHEN (meta->>'porcentaje')::numeric<100 THEN 'META_PENDIENTE'
      WHEN revision_chats THEN 'HABILITADO' ELSE 'PENDIENTE_REVISION_CHATS' END;
  END IF;
  WITH base AS MATERIALIZED (SELECT * FROM public.f_private_compensacion_atc_safetypay_filas(inicio)),
  filtradas AS (SELECT * FROM base b WHERE (coalesce(p_banco,'')='' OR b.banco=p_banco)
    AND (p_desde IS NULL OR (b.fecha AT TIME ZONE 'America/Lima')::date>=p_desde)
    AND (p_hasta IS NULL OR (b.fecha AT TIME ZONE 'America/Lima')::date<=p_hasta)
    AND (coalesce(p_codigo,'')='' OR b.codigo=p_codigo) AND (NOT coalesce(p_duplicados,false) OR b.duplicado)
    AND (coalesce(btrim(p_busqueda),'')='' OR strpos(lower(concat_ws(' ',b.cliente,b.documento,b.codigo_cliente,b.tarjeta,b.operacion,b.colaborador)),lower(btrim(p_busqueda)))>0)),
  pagina AS (SELECT * FROM filtradas ORDER BY fecha DESC,id DESC LIMIT p_tamano OFFSET (p_pagina::bigint-1)*p_tamano)
  SELECT jsonb_build_object('sede',sede,'mes',inicio,'alcance',ctx->>'alcance',
    'estado',CASE WHEN ctx->>'alcance'<>'GLOBAL' AND asignacion.id IS NULL THEN 'SIN_ASIGNACION' ELSE 'OK' END,
    'meta',jsonb_build_object('objetivo',meta->'valor_meta','acumulado',meta->'acumulado','porcentaje',meta->'porcentaje',
      'operaciones',meta->'operaciones','heredada',meta->'meta_heredada','periodo_origen',meta->'periodo_origen'),
    'resumen',jsonb_build_object('codigos',(SELECT count(*) FROM base),'monto_registrado',(SELECT coalesce(sum(monto),0) FROM base),
      'duplicados',(SELECT count(*) FROM base WHERE duplicado),'sin_codigo_cliente',(SELECT count(*) FROM base WHERE codigo_cliente IS NULL)),
    'bancos',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.monto DESC,x.nombre) FROM (SELECT banco nombre,sum(monto) monto,count(*) cantidad FROM base GROUP BY banco) x),'[]'::jsonb),
    'codigos',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.monto DESC,x.nombre) FROM (SELECT codigo nombre,sum(monto) monto,count(*) cantidad FROM base GROUP BY codigo) x),'[]'::jsonb),
    'ranking',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.cantidad DESC,x.nombre) FROM (SELECT colaborador nombre,count(*) cantidad,sum(monto) monto FROM base GROUP BY colaborador) x),'[]'::jsonb),
    'items',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object(
      'id_comunidad',r.id_comunidad,'tipo_documento',r.tipo_documento,
      'puede_modificar',r.id_usuario=(ctx->>'id_usuario')::bigint AND r.estado='REGISTRADO'
      ) ORDER BY p.fecha DESC,p.id DESC) FROM pagina p JOIN public.tb_compensacion_safetypay_registro r ON r.id=p.id),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtradas),'pagina',p_pagina,'tamano',p_tamano) INTO resultado;
  RETURN resultado||jsonb_build_object('bono_jefatura',CASE WHEN chats IS NOT NULL THEN
    chats||jsonb_build_object('estado',estado_bono,'revision_confirmada',revision_chats) ELSE NULL END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_atc_safetypay_panel_filtros(p_mes date, p_documento text DEFAULT ''::text, p_nombre_cliente text DEFAULT ''::text, p_colaborador text DEFAULT ''::text, p_banco text DEFAULT ''::text, p_codigo text DEFAULT ''::text, p_duplicados boolean DEFAULT false, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; asignacion public.tb_compensacion_asignacion%ROWTYPE; sede text; resultado jsonb;
  inicio date:=date_trunc('month',p_mes)::date; fin date:=(date_trunc('month',p_mes)+interval '1 month - 1 day')::date; meta jsonb;
  chats jsonb; revision_chats boolean:=false; estado_bono text;
BEGIN
  IF p_mes IS NULL OR p_pagina IS NULL OR p_pagina<1 OR p_tamano IS NULL OR p_tamano NOT IN(20,50,100) THEN RAISE EXCEPTION 'Consulta o paginacion invalida'; END IF;
  IF p_desde IS NOT NULL AND p_hasta IS NOT NULL AND p_desde>p_hasta THEN
    RAISE EXCEPTION 'La fecha Desde no puede ser posterior a Hasta'; END IF;
  ctx:=public.f_private_compensacion_safetypay_panel_contexto();
  SELECT a.* INTO asignacion FROM public.tb_compensacion_asignacion a
    JOIN public.tb_estado e ON e.id=a.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE a.id_colaborador=(ctx->>'id_colaborador')::bigint AND (ctx->>'alcance'<>'SEDE' OR a.id_sucursal=(ctx->>'id_sucursal_alcance')::bigint) AND a.fecha_inicio<=fin AND (a.fecha_fin IS NULL OR a.fecha_fin>=fin)
    ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1;
  SELECT s.nombre INTO sede FROM public.tb_sucursal s WHERE s.id=asignacion.id_sucursal;
  IF ctx->>'alcance'='GLOBAL' THEN sede:='Todas las Sedes'; END IF;
  IF ctx->>'alcance'<>'GLOBAL' AND asignacion.id IS NOT NULL THEN meta:=public.f_private_compensacion_meta_evaluar(asignacion.id_plan,asignacion.id_sucursal,inicio); END IF;
  IF ctx->>'alcance'='SEDE' AND EXISTS(SELECT 1 FROM public.tb_compensacion_cargo WHERE id=asignacion.id_cargo AND codigo='JEFE_TIENDA') THEN
    chats:=public.f_private_compensacion_meta_sede_chats(asignacion.id_sucursal,inicio);
    SELECT EXISTS(SELECT 1 FROM public.tb_compensacion_evento ev
      JOIN public.tb_compensacion_evento_tipo t ON t.id=ev.id_tipo_evento AND t.codigo='META_SEDE_SAFETYPAY'
      WHERE ev.id_colaborador_beneficiario=asignacion.id_colaborador AND ev.periodo_imputacion=inicio
        AND ev.estado_evento IN('APROBADO','LIQUIDADO')
        AND ev.criterios_validacion_snapshot#>>'{revision_meta_jefatura,sin_chats_descuidados}'='true'
        AND (ev.criterios_validacion_snapshot->>'id_asignacion')::bigint=asignacion.id) INTO revision_chats;
    estado_bono:=CASE WHEN (chats->>'confirmados')::bigint>0 THEN 'NO_APLICA'
      WHEN (chats->>'pendientes')::bigint>0 THEN 'EN_REVISION'
      WHEN meta->>'porcentaje' IS NULL THEN 'POR_EVALUAR'
      WHEN (meta->>'porcentaje')::numeric<100 THEN 'META_PENDIENTE'
      WHEN revision_chats THEN 'HABILITADO' ELSE 'PENDIENTE_REVISION_CHATS' END;
  END IF;
  WITH base AS MATERIALIZED (SELECT * FROM public.f_private_compensacion_atc_safetypay_filas(inicio)),
  filtradas AS (SELECT * FROM base b WHERE (coalesce(p_banco,'')='' OR b.banco=p_banco)
    AND (p_desde IS NULL OR (b.fecha AT TIME ZONE 'America/Lima')::date>=p_desde)
    AND (p_hasta IS NULL OR (b.fecha AT TIME ZONE 'America/Lima')::date<=p_hasta)
    AND (coalesce(p_codigo,'')='' OR b.codigo=p_codigo) AND (NOT coalesce(p_duplicados,false) OR b.duplicado)
    AND (coalesce(btrim(p_documento),'')='' OR (regexp_replace(btrim(p_documento),'[^0-9]','','g')<>'' AND regexp_replace(coalesce(b.documento,''),'[^0-9]','','g')=regexp_replace(btrim(p_documento),'[^0-9]','','g')))
    AND (coalesce(btrim(p_nombre_cliente),'')='' OR lower(coalesce(b.cliente,'')) LIKE '%'||lower(btrim(p_nombre_cliente))||'%')
    AND (coalesce(btrim(p_colaborador),'')='' OR lower(coalesce(b.colaborador,'')) LIKE '%'||lower(btrim(p_colaborador))||'%'
      OR (regexp_replace(btrim(p_colaborador),'[^0-9]','','g')<>'' AND regexp_replace(coalesce(b.colaborador,''),'[^0-9]','','g')=regexp_replace(btrim(p_colaborador),'[^0-9]','','g')))),
  pagina AS (SELECT * FROM filtradas ORDER BY fecha DESC,id DESC LIMIT p_tamano OFFSET (p_pagina::bigint-1)*p_tamano)
  SELECT jsonb_build_object('sede',sede,'mes',inicio,'alcance',ctx->>'alcance',
    'estado',CASE WHEN ctx->>'alcance'<>'GLOBAL' AND asignacion.id IS NULL THEN 'SIN_ASIGNACION' ELSE 'OK' END,
    'meta',jsonb_build_object('objetivo',meta->'valor_meta','acumulado',meta->'acumulado','porcentaje',meta->'porcentaje',
      'operaciones',meta->'operaciones','heredada',meta->'meta_heredada','periodo_origen',meta->'periodo_origen'),
    'resumen',jsonb_build_object('codigos',(SELECT count(*) FROM base),'monto_registrado',(SELECT coalesce(sum(monto),0) FROM base),
      'duplicados',(SELECT count(*) FROM base WHERE duplicado),'sin_codigo_cliente',(SELECT count(*) FROM base WHERE codigo_cliente IS NULL)),
    'bancos',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.monto DESC,x.nombre) FROM (SELECT banco nombre,sum(monto) monto,count(*) cantidad FROM base GROUP BY banco) x),'[]'::jsonb),
    'codigos',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.monto DESC,x.nombre) FROM (SELECT codigo nombre,sum(monto) monto,count(*) cantidad FROM base GROUP BY codigo) x),'[]'::jsonb),
    'ranking',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.cantidad DESC,x.nombre) FROM (SELECT colaborador nombre,count(*) cantidad,sum(monto) monto FROM base GROUP BY colaborador) x),'[]'::jsonb),
    'items',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object(
      'id_comunidad',r.id_comunidad,'tipo_documento',r.tipo_documento,
      'puede_modificar',r.id_usuario=(ctx->>'id_usuario')::bigint AND r.estado='REGISTRADO'
      ) ORDER BY p.fecha DESC,p.id DESC) FROM pagina p JOIN public.tb_compensacion_safetypay_registro r ON r.id=p.id),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtradas),'pagina',p_pagina,'tamano',p_tamano) INTO resultado;
  RETURN resultado||jsonb_build_object('bono_jefatura',CASE WHEN chats IS NOT NULL THEN
    chats||jsonb_build_object('estado',estado_bono,'revision_confirmada',revision_chats) ELSE NULL END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_atencion_contexto()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$ SELECT public.f_private_compensacion_atencion_contexto(); $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_atencion_operaciones(p_codigo text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$ SELECT public.f_get_compensacion_atencion_operaciones(p_codigo,NULL::text); $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_atencion_operaciones(p_codigo text, p_dni text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE ctx jsonb; items jsonb;
  codigo text:=nullif(btrim(p_codigo),''); dni text:=nullif(btrim(p_dni),'');
BEGIN
  ctx:=public.f_private_compensacion_atencion_contexto();
  IF codigo IS NULL AND dni IS NULL THEN RAISE EXCEPTION 'Ingresa DNI o codigo de operacion'; END IF;
  IF codigo IS NOT NULL AND (length(codigo)<3 OR length(codigo)>100) THEN RAISE EXCEPTION 'El codigo debe tener entre 3 y 100 caracteres'; END IF;
  IF dni IS NOT NULL AND dni !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'El DNI debe tener 8 digitos'; END IF;
  SELECT coalesce(jsonb_agg(q.d),'[]'::jsonb) INTO items FROM (
    SELECT DISTINCT ON((d->>'raiz')::bigint) d FROM public.tb_operacion_proceso op
    CROSS JOIN LATERAL public.f_private_compensacion_atencion_operacion(op.id) d
    WHERE op.id_operacion_padre IS NULL
      AND (codigo IS NULL OR strpos(lower(coalesce(op.codigo_operacion_deposito_cliente,'')),lower(codigo))>0
        OR strpos(lower(coalesce(d->>'codigo','')),lower(codigo))>0)
      AND (dni IS NULL OR d->>'dni'=dni)
      AND (d->>'pagada')::boolean
      AND d->>'fecha' IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_atencion a
        WHERE a.id_operacion_raiz=(d->>'raiz')::bigint AND a.estado='VIGENTE')
    ORDER BY (d->>'raiz')::bigint LIMIT 30
  ) q;
  RETURN items;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_atenciones(p_mes date, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE ctx jsonb; resultado jsonb;
BEGIN
  ctx:=public.f_private_compensacion_atencion_contexto();
  IF p_mes IS NULL THEN RAISE EXCEPTION 'Selecciona un mes'; END IF;
  WITH base AS (
    SELECT a.*,u.nombre asesor,ul.nombre usuario_libera,coalesce((d->>'pagada')::boolean,false) operacion_pagada,
      a.estado='VIGENTE' AND coalesce((d->>'pagada')::boolean,false) contabiliza
    FROM public.tb_compensacion_atencion a JOIN public.tb_usuario u ON u.id=a.id_usuario_asesor
    LEFT JOIN public.tb_usuario ul ON ul.id=a.id_usuario_libera
    CROSS JOIN LATERAL public.f_private_compensacion_atencion_operacion(a.id_operacion_raiz) d
    WHERE ((ctx->>'es_admin')::boolean OR a.id_usuario_asesor=(ctx->>'id_usuario')::bigint)
      AND (a.fecha_atencion AT TIME ZONE 'America/Lima')::date>=date_trunc('month',p_mes)::date
      AND (a.fecha_atencion AT TIME ZONE 'America/Lima')::date<(date_trunc('month',p_mes)+interval '1 month')::date
  ), pagina AS (SELECT * FROM base ORDER BY fecha_atencion DESC,id DESC
    LIMIT least(greatest(p_tamano,1),100) OFFSET (greatest(p_pagina,1)-1)*least(greatest(p_tamano,1),100))
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM pagina p),'[]'::jsonb),
    'total',(SELECT count(*) FROM base),'validas',(SELECT count(*) FROM base WHERE contabiliza),
    'liberadas',(SELECT count(*) FROM base WHERE estado='LIBERADA')) INTO resultado;
  RETURN resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_bonos_mes(p_id_periodo bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_busqueda text DEFAULT NULL::text, p_limite integer DEFAULT 100, p_desplazamiento integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_rep public.tb_compensacion_reporte_mes%ROWTYPE;
  v_filas jsonb;
  v_total integer;
  v_busq text := nullif(btrim(coalesce(p_busqueda, '')), '');
BEGIN
  PERFORM public.f_private_compensacion_bonos_mes_admin();
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 500 OR p_desplazamiento IS NULL OR p_desplazamiento < 0 THEN
    RAISE EXCEPTION 'Paginación inválida';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_compensacion_periodo WHERE id = p_id_periodo) THEN RAISE EXCEPTION 'Periodo inexistente'; END IF;
  SELECT * INTO v_rep FROM public.tb_compensacion_reporte_mes WHERE id_periodo = p_id_periodo;
  IF v_rep.estado = 'CONFIRMADO' THEN
    -- Reporte confirmado: se muestra lo fijado, no el cálculo vivo.
    SELECT coalesce(jsonb_agg(f - 'detalles' ORDER BY f->>'nombre_completo'), '[]'::jsonb) INTO v_filas
    FROM jsonb_array_elements(v_rep.snapshot->'colaboradores') f
    WHERE (p_id_sucursal IS NULL OR (f->>'id_sucursal')::bigint = p_id_sucursal)
      AND (v_busq IS NULL OR f->>'nombre_completo' ILIKE '%' || v_busq || '%' OR f->>'numero_documento' ILIKE '%' || v_busq || '%');
  ELSE
    SELECT coalesce(jsonb_agg(f - 'detalles' ORDER BY f->>'nombre_completo'), '[]'::jsonb) INTO v_filas
    FROM public.f_private_compensacion_bonos_mes_colaboradores(p_id_periodo) c
    CROSS JOIN LATERAL public.f_private_compensacion_bonos_mes_fila(p_id_periodo, c.id_colaborador) f
    WHERE (p_id_sucursal IS NULL OR (f->>'id_sucursal')::bigint = p_id_sucursal)
      AND (v_busq IS NULL OR f->>'nombre_completo' ILIKE '%' || v_busq || '%' OR f->>'numero_documento' ILIKE '%' || v_busq || '%');
  END IF;
  v_total := jsonb_array_length(v_filas);
  RETURN jsonb_build_object(
    'id_periodo', p_id_periodo,
    'estado_reporte', coalesce(v_rep.estado, 'BORRADOR'),
    'confirmado_en', v_rep.confirmado_en, 'hash_contenido', v_rep.hash_contenido,
    'total_filas', v_total,
    'totales', jsonb_build_object(
      'total_bonos', coalesce((SELECT sum((x->>'total_bonos')::numeric) FROM jsonb_array_elements(v_filas) x), 0),
      'total_comisiones', coalesce((SELECT sum((x->>'total_comisiones')::numeric) FROM jsonb_array_elements(v_filas) x), 0),
      'total_descuentos', coalesce((SELECT sum((x->>'total_descuentos')::numeric) FROM jsonb_array_elements(v_filas) x), 0),
      'total_neto', coalesce((SELECT sum((x->>'total_neto')::numeric) FROM jsonb_array_elements(v_filas) x), 0)),
    'filas', coalesce((SELECT jsonb_agg(x) FROM (SELECT x FROM jsonb_array_elements(v_filas) WITH ORDINALITY t(x, n)
        ORDER BY n OFFSET p_desplazamiento LIMIT p_limite) q), '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_bonos_mes_detalle(p_id_periodo bigint, p_id_colaborador bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_rep public.tb_compensacion_reporte_mes%ROWTYPE;
  v_fila jsonb;
BEGIN
  PERFORM public.f_private_compensacion_bonos_mes_admin();
  IF NOT EXISTS (SELECT 1 FROM public.tb_compensacion_periodo WHERE id = p_id_periodo) THEN RAISE EXCEPTION 'Periodo inexistente'; END IF;
  SELECT * INTO v_rep FROM public.tb_compensacion_reporte_mes WHERE id_periodo = p_id_periodo;
  IF v_rep.estado = 'CONFIRMADO' THEN
    SELECT f INTO v_fila FROM jsonb_array_elements(v_rep.snapshot->'colaboradores') f
    WHERE (f->>'id_colaborador')::bigint = p_id_colaborador;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.f_private_compensacion_bonos_mes_colaboradores(p_id_periodo) c WHERE c.id_colaborador = p_id_colaborador) THEN
      RAISE EXCEPTION 'El colaborador no tiene asignación en el periodo';
    END IF;
    v_fila := public.f_private_compensacion_bonos_mes_fila(p_id_periodo, p_id_colaborador);
  END IF;
  IF v_fila IS NULL THEN RAISE EXCEPTION 'El colaborador no figura en el reporte confirmado'; END IF;
  RETURN v_fila || jsonb_build_object('estado_reporte', coalesce(v_rep.estado, 'BORRADOR'), 'id_periodo', p_id_periodo);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_bonos_mes_periodos()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
  PERFORM public.f_private_compensacion_bonos_mes_admin();
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'periodo', p.periodo, 'nombre', p.nombre,
      'estado_reporte', coalesce(r.estado, 'BORRADOR')) ORDER BY p.periodo DESC, p.id DESC)
    FROM public.tb_compensacion_periodo p
    LEFT JOIN public.tb_compensacion_reporte_mes r ON r.id_periodo = p.id), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_calidad_diaria(p_fecha date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; miembros jsonb; filas jsonb;
BEGIN
 ctx:=public.f_private_compensacion_contexto('BONO:META_SEDE_SAFETYPAY','CONSULTAR');
 IF NOT coalesce((ctx->>'es_super_admin')::boolean,false) AND NOT EXISTS(
   SELECT 1 FROM public.tb_usuario WHERE id=(ctx->>'id_usuario')::bigint AND id_rol=3
 ) THEN RAISE EXCEPTION 'Control exclusivo de Jefatura y Administracion'; END IF;
 IF p_fecha IS NULL THEN RAISE EXCEPTION 'Fecha obligatoria'; END IF;
 WITH personas AS (
   SELECT c.id,c.nombre_completo nombre,a.id_sucursal,s.nombre sede,q.meta_mensajes,q.meta_respuestas
   FROM public.tb_compensacion_colaborador c
   JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=4 AND NOT coalesce(u.flag_super_admin,false)
   JOIN public.tb_estado ec ON ec.id=c.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
   JOIN public.tb_estado eu ON eu.id=u.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
   JOIN LATERAL (SELECT aa.* FROM public.tb_compensacion_asignacion aa JOIN public.tb_estado ea ON ea.id=aa.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
     WHERE aa.id_colaborador=c.id AND p_fecha BETWEEN aa.fecha_inicio AND coalesce(aa.fecha_fin,'infinity'::date)
     ORDER BY aa.fecha_inicio DESC,aa.id DESC LIMIT 1) a ON true
   JOIN public.tb_sucursal s ON s.id=a.id_sucursal
   JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='ATENCION_CLIENTE'
   CROSS JOIN LATERAL (SELECT
     (SELECT round(m.valor_meta)::integer FROM public.tb_compensacion_meta_sede m
       JOIN public.tb_compensacion_plan_version pv ON pv.id=m.id_plan_version
       JOIN public.tb_estado em ON em.id=m.id_estado AND upper(btrim(em.nombre))='ACTIVO'
       WHERE pv.id_plan=a.id_plan AND pv.estado_version IN('BORRADOR','PUBLICADA') AND m.id_sucursal=a.id_sucursal
         AND m.codigo_indicador='CALIDAD_MENSAJES_DIA' AND m.unidad='UNIDAD' AND m.periodo<=date_trunc('month',p_fecha)::date
       ORDER BY m.periodo DESC,(pv.estado_version='BORRADOR') DESC,pv.numero_version DESC,m.id DESC LIMIT 1) meta_mensajes,
     (SELECT round(m.valor_meta)::integer FROM public.tb_compensacion_meta_sede m
       JOIN public.tb_compensacion_plan_version pv ON pv.id=m.id_plan_version
       JOIN public.tb_estado em ON em.id=m.id_estado AND upper(btrim(em.nombre))='ACTIVO'
       WHERE pv.id_plan=a.id_plan AND pv.estado_version IN('BORRADOR','PUBLICADA') AND m.id_sucursal=a.id_sucursal
         AND m.codigo_indicador='CALIDAD_RESPUESTAS_DIA' AND m.unidad='UNIDAD' AND m.periodo<=date_trunc('month',p_fecha)::date
       ORDER BY m.periodo DESC,(pv.estado_version='BORRADOR') DESC,pv.numero_version DESC,m.id DESC LIMIT 1) meta_respuestas
   ) q
   WHERE p_fecha BETWEEN c.fecha_ingreso AND coalesce(c.fecha_cese,'infinity'::date)
     AND (coalesce((ctx->>'es_super_admin')::boolean,false) OR public.f_private_compensacion_equipo_visible(ctx,c.id,p_fecha,false))
 ) SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY nombre),'[]') INTO miembros FROM personas p;
 SELECT coalesce(jsonb_agg(to_jsonb(d)-'historial' || jsonb_build_object('nombre',m->>'nombre','sede',m->>'sede',
   'cumple',CASE WHEN d.meta_mensajes IS NULL OR d.meta_respuestas IS NULL THEN NULL ELSE d.calidad_conforme AND d.mensajes>=d.meta_mensajes AND d.respuestas>=d.meta_respuestas END)
   ORDER BY m->>'nombre'),'[]') INTO filas
 FROM public.tb_compensacion_calidad_diaria d JOIN jsonb_array_elements(miembros) m ON (m->>'id')::bigint=d.id_colaborador
 WHERE d.fecha=p_fecha;
 RETURN jsonb_build_object('miembros',miembros,'items',filas,'fuente','CAPTURA_MANUAL_AUDITADA','margen_aplicado',0);
END $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_calificacion_asesores()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE ctx jsonb;
BEGIN
  ctx := public.f_private_compensacion_contexto('CALIFICACIONES','REGISTRAR');
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'nombre',c.nombre_completo,'sede',s.nombre) ORDER BY c.nombre_completo)
    FROM public.tb_compensacion_colaborador c
    JOIN public.tb_estado e ON e.id=c.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    JOIN public.tb_usuario u ON u.id=c.id_usuario
    JOIN public.tb_estado eu ON eu.id=u.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
    JOIN LATERAL (SELECT a.id_sucursal FROM public.tb_compensacion_asignacion a
      JOIN public.tb_estado ae ON ae.id=a.id_estado AND upper(btrim(ae.nombre))='ACTIVO'
      WHERE a.id_colaborador=c.id AND a.fecha_inicio<=(now() AT TIME ZONE 'America/Lima')::date
      AND (a.fecha_fin IS NULL OR a.fecha_fin>=(now() AT TIME ZONE 'America/Lima')::date)
      ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1) a ON true
    JOIN public.tb_sucursal s ON s.id=a.id_sucursal
    WHERE c.fecha_ingreso<=(now() AT TIME ZONE 'America/Lima')::date
      AND (c.fecha_cese IS NULL OR c.fecha_cese>=(now() AT TIME ZONE 'America/Lima')::date)
      AND (ctx->>'alcance'='GLOBAL' OR (ctx->>'alcance'='PROPIO' AND c.id=(ctx->>'id_colaborador')::bigint)
        OR (ctx->>'alcance'='SEDE' AND a.id_sucursal=(ctx->>'id_sucursal_alcance')::bigint))), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_calificacion_comunidades()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE v_contexto jsonb; v_lista jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('CONFIGURACION', 'CONSULTAR');
  SELECT t.configuracion->'comunidades_elegibles' INTO v_lista
  FROM public.tb_compensacion_evento_tipo t WHERE t.codigo = 'CALIFICACION_PRESENCIAL';
  RETURN jsonb_build_object(
    'configurado', coalesce(jsonb_typeof(v_lista) = 'array', false),
    'comunidades', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre,
        'elegible', CASE WHEN jsonb_typeof(v_lista) = 'array'
          THEN c.id::text IN (SELECT jsonb_array_elements_text(v_lista)) ELSE true END)
        ORDER BY c.nombre, c.id)
      FROM public.tb_comunidad c
      JOIN public.tb_estado e ON e.id = c.id_estado AND upper(btrim(e.nombre)) = 'ACTIVO'
    ), '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_calificacion_operaciones(p_id_evento bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE ctx jsonb; ev public.tb_compensacion_evento%ROWTYPE; dni text; items jsonb; vinculadas jsonb;
BEGIN
  ctx:=public.f_private_compensacion_evento_validar_alcance(p_id_evento,'CONSULTAR',false);
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id_evento;
  IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_tipo WHERE id=ev.id_tipo_evento AND categoria='CALIFICACION')
    THEN RAISE EXCEPTION 'El registro no es una calificacion'; END IF;
  dni:=ev.datos->>'cliente_documento';
  IF dni IS NULL OR dni !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'La calificacion no tiene un DNI valido'; END IF;
  SELECT coalesce(jsonb_agg(r.datos_snapshot||jsonb_build_object('id',r.id_operacion,'vinculada',true) ORDER BY r.id),'[]')
    INTO vinculadas FROM public.tb_compensacion_evento_referencia r WHERE r.id_evento=ev.id AND r.tipo_referencia='OPERACION';
  IF jsonb_array_length(vinculadas)>0 THEN items:=vinculadas;
  ELSE
    SELECT coalesce(jsonb_agg(d||jsonb_build_object('vinculada',false) ORDER BY (d->>'id')::bigint DESC),'[]') INTO items
    FROM public.tb_operacion_proceso o CROSS JOIN LATERAL public.f_private_compensacion_calificacion_operacion(o.id) d
    WHERE o.id_operacion_padre IS NULL AND btrim(o.dni_cliente)=dni AND d->>'dni'=dni AND d IS NOT NULL;
  END IF;
  RETURN jsonb_build_object('items',items,'dni',dni,'guardadas',jsonb_array_length(vinculadas)>0,
    'puede_guardar',ev.estado_evento IN('BORRADOR','PENDIENTE') AND
      NOT EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=ev.periodo_imputacion AND estado_periodo='CERRADO') AND
      (coalesce((ctx->>'es_super_admin')::boolean,false) OR EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=(ctx->>'id_usuario')::bigint
        AND (id_rol IN(1,2,4) OR (id_rol=3 AND ev.id_colaborador_beneficiario=(ctx->>'id_colaborador')::bigint)))),
    'pancake',(SELECT identificador_externo FROM public.tb_compensacion_evento_referencia WHERE id_evento=ev.id AND tipo_referencia='PANCAKE' ORDER BY id LIMIT 1));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_calificacion_propia_contexto()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.f_private_compensacion_calificacion_propia()-'id_colaborador'-'id_usuario';
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_calificacion_publica(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE resultado jsonb;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Enlace no disponible'; END IF;
  SELECT jsonb_build_object('asesor',c.nombre_completo,'sede',s.nombre,
    'politica',coalesce(t.configuracion->'validez_calificacion',
      '{"dni_obligatorio":true,"comentario_obligatorio":false,"asesor_obligatorio":true}'::jsonb)) INTO resultado
  FROM public.tb_compensacion_calificacion_enlace l
  JOIN public.tb_compensacion_colaborador c ON c.id=l.id_colaborador
  JOIN public.tb_estado ce ON ce.id=c.id_estado AND upper(btrim(ce.nombre))='ACTIVO'
  JOIN public.tb_usuario u ON u.id=c.id_usuario
  JOIN public.tb_estado ue ON ue.id=u.id_estado AND upper(btrim(ue.nombre))='ACTIVO'
  JOIN LATERAL (SELECT a.id_sucursal FROM public.tb_compensacion_asignacion a
    JOIN public.tb_estado ae ON ae.id=a.id_estado AND upper(btrim(ae.nombre))='ACTIVO'
    WHERE a.id_colaborador=c.id AND a.fecha_inicio<=(now() AT TIME ZONE 'America/Lima')::date
      AND (a.fecha_fin IS NULL OR a.fecha_fin>=(now() AT TIME ZONE 'America/Lima')::date)
    ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1) a ON true
  JOIN public.tb_sucursal s ON s.id=a.id_sucursal
  JOIN public.tb_compensacion_evento_tipo t ON t.codigo='CALIFICACION_PRESENCIAL'
  JOIN public.tb_estado te ON te.id=t.id_estado AND upper(btrim(te.nombre))='ACTIVO'
  WHERE l.token_hash=sha256(convert_to(p_token,'UTF8')) AND l.fecha_revocacion IS NULL AND l.fecha_expiracion>now()
    AND c.fecha_ingreso<=(now() AT TIME ZONE 'America/Lima')::date
    AND (c.fecha_cese IS NULL OR c.fecha_cese>=(now() AT TIME ZONE 'America/Lima')::date);
  IF resultado IS NULL THEN RAISE EXCEPTION 'Enlace no disponible'; END IF;
  RETURN resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_calificaciones(p_busqueda character varying DEFAULT NULL::character varying, p_id_asesor bigint DEFAULT NULL::bigint, p_estrellas integer DEFAULT NULL::integer, p_estado character varying DEFAULT NULL::character varying, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_contexto jsonb; v_policy jsonb; v_configurar boolean; v_result jsonb;
  v_page integer:=greatest(coalesce(p_pagina,1),1); v_size integer:=least(greatest(coalesce(p_tamano,20),1),100);
BEGIN
  v_contexto:=public.f_private_compensacion_contexto('CALIFICACIONES','CONSULTAR');
  IF p_estrellas IS NOT NULL AND p_estrellas NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Estrellas entre 1 y 5'; END IF;
  IF p_desde>p_hasta THEN RAISE EXCEPTION 'Rango de fechas inválido'; END IF;
  SELECT coalesce(configuracion->'validez_calificacion','{"dni_obligatorio":true,"comentario_obligatorio":false,"asesor_obligatorio":false}'::jsonb)
    INTO v_policy FROM public.tb_compensacion_evento_tipo WHERE codigo='CALIFICACION_PRESENCIAL';
  v_configurar:=coalesce((v_contexto->>'es_super_admin')::boolean,false);
  WITH visibles AS MATERIALIZED (
    SELECT ev.*,cb.nombre_completo beneficiario_nombre,cb.numero_documento beneficiario_documento,
      so.nombre sucursal_origen_nombre,ur.nombre usuario_registra_nombre,
      te.codigo tipo_codigo,te.nombre tipo_nombre,te.categoria,co.nombre concepto_nombre,
      public.f_private_compensacion_calificacion_valida(ev.datos,ev.descripcion,ev.id_colaborador_beneficiario,
        ev.criterios_validacion_snapshot->'validez_calificacion') valida
    FROM public.tb_compensacion_evento ev JOIN public.tb_compensacion_evento_tipo te ON te.id=ev.id_tipo_evento
    LEFT JOIN public.tb_compensacion_colaborador cb ON cb.id=ev.id_colaborador_beneficiario
    LEFT JOIN public.tb_sucursal so ON so.id=ev.id_sucursal_origen
    LEFT JOIN public.tb_compensacion_concepto co ON co.id=te.id_concepto
    JOIN public.tb_usuario ur ON ur.id=ev.id_usuario_registra
    WHERE (public.f_private_compensacion_equipo_visible(v_contexto,coalesce(ev.id_colaborador_beneficiario,ev.id_colaborador_responsable),(ev.fecha_evento AT TIME ZONE 'America/Lima')::date) OR coalesce((v_contexto->>'id_colaborador')::bigint IN(ev.id_colaborador_beneficiario,ev.id_colaborador_responsable),false))
      AND te.codigo IN('CALIFICACION_PRESENCIAL','REGISTRO_PRESENCIAL')
      AND (v_contexto->>'alcance'='GLOBAL'
        OR (v_contexto->>'alcance'='PROPIO' AND (v_contexto->>'id_colaborador')::bigint IN(ev.id_colaborador_beneficiario,ev.id_colaborador_responsable))
        OR (v_contexto->>'alcance'='SEDE' AND ((v_contexto->>'id_sucursal_alcance')::bigint IN(ev.id_sucursal_origen,ev.id_sucursal_responsable)
          OR EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion a WHERE a.id_colaborador IN(ev.id_colaborador_beneficiario,ev.id_colaborador_responsable)
            AND a.id_sucursal=(v_contexto->>'id_sucursal_alcance')::bigint
            AND a.fecha_inicio<=(ev.fecha_evento AT TIME ZONE 'America/Lima')::date
            AND (a.fecha_fin IS NULL OR a.fecha_fin>=(ev.fecha_evento AT TIME ZONE 'America/Lima')::date)))))
  ), asesores AS (
    SELECT DISTINCT id_colaborador_beneficiario id,beneficiario_nombre nombre FROM visibles WHERE id_colaborador_beneficiario IS NOT NULL
  ), filtradas AS MATERIALIZED (
    SELECT * FROM visibles WHERE (p_id_asesor IS NULL OR id_colaborador_beneficiario=p_id_asesor)
      AND (p_estrellas IS NULL OR datos->>'estrellas'=p_estrellas::text)
      AND (p_desde IS NULL OR (fecha_evento AT TIME ZONE 'America/Lima')::date>=p_desde)
      AND (p_hasta IS NULL OR (fecha_evento AT TIME ZONE 'America/Lima')::date<=p_hasta)
      AND (p_busqueda IS NULL OR beneficiario_nombre ILIKE '%'||btrim(p_busqueda)||'%'
        OR datos->>'cliente_documento' ILIKE '%'||btrim(p_busqueda)||'%' OR descripcion ILIKE '%'||btrim(p_busqueda)||'%')
      AND (p_estado IS NULL OR (p_estado='NO_VALIDA' AND NOT valida)
        OR (p_estado='APROBADO' AND estado_evento IN('APROBADO','LIQUIDADO')) OR estado_evento=p_estado)
  ), ranking AS (
    SELECT id_colaborador_beneficiario id,beneficiario_nombre nombre,count(*) cantidad FROM filtradas
    WHERE estado_evento IN('APROBADO','LIQUIDADO') GROUP BY id_colaborador_beneficiario,beneficiario_nombre
    ORDER BY cantidad DESC,beneficiario_nombre,id_colaborador_beneficiario LIMIT 10
  ), distribucion AS (
    SELECT s estrellas,count(f.id) cantidad FROM generate_series(1,5) s LEFT JOIN filtradas f ON f.datos->>'estrellas'=s::text GROUP BY s
  ), pagina AS (
    SELECT * FROM filtradas ORDER BY fecha_evento DESC,id DESC LIMIT v_size OFFSET (v_page-1)*v_size
  )
  SELECT jsonb_build_object(
    'politica',v_policy,'puede_configurar',v_configurar,
    'puede_administrar',coalesce((v_contexto->>'es_super_admin')::boolean,false),
    'asesores',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY nombre,id) FROM asesores a),'[]'::jsonb),
    'ranking',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY cantidad DESC,nombre,id) FROM ranking r),'[]'::jsonb),
    'distribucion',(SELECT jsonb_agg(to_jsonb(d) ORDER BY estrellas DESC) FROM distribucion d),
    'total',(SELECT count(*) FROM filtradas),'pagina',v_page,'tamano_pagina',v_size,
    'total_paginas',(SELECT ceil(count(*)::numeric/v_size)::integer FROM filtradas),
    'resumen',(SELECT jsonb_build_object('pendientes',count(*) FILTER(WHERE estado_evento='PENDIENTE'),
      'aprobados',count(*) FILTER(WHERE estado_evento IN('APROBADO','LIQUIDADO')),
      'no_validas',count(*) FILTER(WHERE NOT valida),
      'importe_aprobado',coalesce(sum(importe_aprobado) FILTER(WHERE estado_evento IN('APROBADO','LIQUIDADO')),0)) FROM filtradas),
    'items',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object(
      'referencias',coalesce((SELECT jsonb_agg(to_jsonb(ref)) FROM public.tb_compensacion_evento_referencia ref WHERE ref.id_evento=p.id),'[]'::jsonb),
      'revisiones',coalesce((SELECT jsonb_agg(to_jsonb(rev)||jsonb_build_object('usuario_revisor_nombre',u.nombre) ORDER BY numero_paso)
        FROM public.tb_compensacion_evento_revision rev JOIN public.tb_usuario u ON u.id=rev.id_usuario_revisor WHERE rev.id_evento=p.id),'[]'::jsonb))
      ORDER BY p.fecha_evento DESC,p.id DESC) FROM pagina p),'[]'::jsonb)) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_calificaciones_filtradas(p_busqueda character varying DEFAULT NULL::character varying, p_id_asesor bigint DEFAULT NULL::bigint, p_estrellas integer DEFAULT NULL::integer, p_estado character varying DEFAULT NULL::character varying, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20, p_documento_cliente text DEFAULT NULL::text, p_nombre_cliente text DEFAULT NULL::text, p_colaborador text DEFAULT NULL::text, p_comentario text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_contexto jsonb;
  v_policy jsonb;
  v_configurar boolean;
  v_result jsonb;
  v_page integer := greatest(coalesce(p_pagina, 1), 1);
  v_size integer := least(greatest(coalesce(p_tamano, 20), 1), 100);
BEGIN
  v_contexto := public.f_private_compensacion_contexto('CALIFICACIONES', 'CONSULTAR');
  IF p_estrellas IS NOT NULL AND p_estrellas NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Estrellas entre 1 y 5';
  END IF;
  IF p_desde > p_hasta THEN
    RAISE EXCEPTION 'Rango de fechas inválido';
  END IF;

  SELECT coalesce(configuracion->'validez_calificacion', '{"dni_obligatorio":true,"comentario_obligatorio":false,"asesor_obligatorio":false}'::jsonb)
  INTO v_policy
  FROM public.tb_compensacion_evento_tipo
  WHERE codigo = 'CALIFICACION_PRESENCIAL';
  v_configurar := coalesce((v_contexto->>'es_super_admin')::boolean, false);

  WITH visibles AS MATERIALIZED (
    SELECT ev.*, cb.nombre_completo beneficiario_nombre, cb.numero_documento beneficiario_documento,
      so.nombre sucursal_origen_nombre, ur.nombre usuario_registra_nombre,
      te.codigo tipo_codigo, te.nombre tipo_nombre, te.categoria, co.nombre concepto_nombre,
      public.f_private_compensacion_calificacion_valida(ev.datos, ev.descripcion, ev.id_colaborador_beneficiario,
        ev.criterios_validacion_snapshot->'validez_calificacion') valida
    FROM public.tb_compensacion_evento ev
    JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
    LEFT JOIN public.tb_compensacion_colaborador cb ON cb.id = ev.id_colaborador_beneficiario
    LEFT JOIN public.tb_sucursal so ON so.id = ev.id_sucursal_origen
    LEFT JOIN public.tb_compensacion_concepto co ON co.id = te.id_concepto
    JOIN public.tb_usuario ur ON ur.id = ev.id_usuario_registra
    WHERE (public.f_private_compensacion_equipo_visible(v_contexto,
        coalesce(ev.id_colaborador_beneficiario, ev.id_colaborador_responsable),
        (ev.fecha_evento AT TIME ZONE 'America/Lima')::date)
        OR coalesce((v_contexto->>'id_colaborador')::bigint IN(ev.id_colaborador_beneficiario, ev.id_colaborador_responsable), false))
      AND te.codigo IN ('CALIFICACION_PRESENCIAL', 'REGISTRO_PRESENCIAL')
      AND (v_contexto->>'alcance' = 'GLOBAL'
        OR (v_contexto->>'alcance' = 'PROPIO' AND (v_contexto->>'id_colaborador')::bigint IN(ev.id_colaborador_beneficiario, ev.id_colaborador_responsable))
        OR (v_contexto->>'alcance' = 'SEDE' AND ((v_contexto->>'id_sucursal_alcance')::bigint IN(ev.id_sucursal_origen, ev.id_sucursal_responsable)
          OR EXISTS (
            SELECT 1
            FROM public.tb_compensacion_asignacion a
            WHERE a.id_colaborador IN(ev.id_colaborador_beneficiario, ev.id_colaborador_responsable)
              AND a.id_sucursal = (v_contexto->>'id_sucursal_alcance')::bigint
              AND a.fecha_inicio <= (ev.fecha_evento AT TIME ZONE 'America/Lima')::date
              AND (a.fecha_fin IS NULL OR a.fecha_fin >= (ev.fecha_evento AT TIME ZONE 'America/Lima')::date)
          ))))
  ), asesores AS (
    SELECT DISTINCT id_colaborador_beneficiario id, beneficiario_nombre nombre
    FROM visibles
    WHERE id_colaborador_beneficiario IS NOT NULL
  ), filtradas AS MATERIALIZED (
    SELECT *
    FROM visibles
    WHERE (p_id_asesor IS NULL OR id_colaborador_beneficiario = p_id_asesor)
      AND (p_estrellas IS NULL OR datos->>'estrellas' = p_estrellas::text)
      AND (p_desde IS NULL OR (fecha_evento AT TIME ZONE 'America/Lima')::date >= p_desde)
      AND (p_hasta IS NULL OR (fecha_evento AT TIME ZONE 'America/Lima')::date <= p_hasta)
      AND (p_busqueda IS NULL OR beneficiario_nombre ILIKE '%' || btrim(p_busqueda) || '%'
        OR datos->>'cliente_documento' ILIKE '%' || btrim(p_busqueda) || '%' OR descripcion ILIKE '%' || btrim(p_busqueda) || '%')
      AND (NULLIF(btrim(p_documento_cliente), '') IS NULL OR datos->>'cliente_documento' = btrim(p_documento_cliente))
      AND (NULLIF(btrim(p_nombre_cliente), '') IS NULL OR datos->>'cliente_nombre' ILIKE '%' || btrim(p_nombre_cliente) || '%')
      AND (NULLIF(btrim(p_colaborador), '') IS NULL OR beneficiario_nombre ILIKE '%' || btrim(p_colaborador) || '%'
        OR beneficiario_documento = btrim(p_colaborador))
      AND (NULLIF(btrim(p_comentario), '') IS NULL OR descripcion ILIKE '%' || btrim(p_comentario) || '%'
        OR titulo ILIKE '%' || btrim(p_comentario) || '%')
      AND (p_estado IS NULL OR (p_estado = 'NO_VALIDA' AND NOT valida)
        OR (p_estado = 'APROBADO' AND estado_evento IN ('APROBADO', 'LIQUIDADO')) OR estado_evento = p_estado)
  ), ranking AS (
    SELECT id_colaborador_beneficiario id, beneficiario_nombre nombre, count(*) cantidad
    FROM filtradas
    WHERE estado_evento IN ('APROBADO', 'LIQUIDADO')
    GROUP BY id_colaborador_beneficiario, beneficiario_nombre
    ORDER BY cantidad DESC, beneficiario_nombre, id_colaborador_beneficiario
    LIMIT 10
  ), distribucion AS (
    SELECT s estrellas, count(f.id) cantidad
    FROM generate_series(1, 5) s
    LEFT JOIN filtradas f ON f.datos->>'estrellas' = s::text
    GROUP BY s
  ), pagina AS (
    SELECT * FROM filtradas
    ORDER BY fecha_evento DESC, id DESC
    LIMIT v_size OFFSET (v_page - 1) * v_size
  )
  SELECT jsonb_build_object(
    'politica', v_policy,
    'puede_configurar', v_configurar,
    'puede_administrar', coalesce((v_contexto->>'es_super_admin')::boolean, false),
    'asesores', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY nombre, id) FROM asesores a), '[]'::jsonb),
    'ranking', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY cantidad DESC, nombre, id) FROM ranking r), '[]'::jsonb),
    'distribucion', (SELECT jsonb_agg(to_jsonb(d) ORDER BY estrellas DESC) FROM distribucion d),
    'total', (SELECT count(*) FROM filtradas),
    'pagina', v_page,
    'tamano_pagina', v_size,
    'total_paginas', (SELECT ceil(count(*)::numeric / v_size)::integer FROM filtradas),
    'resumen', (SELECT jsonb_build_object(
      'pendientes', count(*) FILTER (WHERE estado_evento = 'PENDIENTE'),
      'aprobados', count(*) FILTER (WHERE estado_evento IN ('APROBADO', 'LIQUIDADO')),
      'no_validas', count(*) FILTER (WHERE NOT valida),
      'importe_aprobado', coalesce(sum(importe_aprobado) FILTER (WHERE estado_evento IN ('APROBADO', 'LIQUIDADO')), 0)
    ) FROM filtradas),
    'items', coalesce((
      SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object(
        'referencias', coalesce((SELECT jsonb_agg(to_jsonb(ref)) FROM public.tb_compensacion_evento_referencia ref WHERE ref.id_evento = p.id), '[]'::jsonb),
        'revisiones', coalesce((SELECT jsonb_agg(to_jsonb(rev) || jsonb_build_object('usuario_revisor_nombre', u.nombre) ORDER BY numero_paso)
          FROM public.tb_compensacion_evento_revision rev
          JOIN public.tb_usuario u ON u.id = rev.id_usuario_revisor
          WHERE rev.id_evento = p.id), '[]'::jsonb))
        ORDER BY p.fecha_evento DESC, p.id DESC)
      FROM pagina p), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_captacion_revision(p_cliente bigint, p_colaborador bigint)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$ SELECT public.f_get_compensacion_captacion_revision_concepto(p_cliente,p_colaborador,'COMISION_REGISTRO_EFECTIVIZACION'); $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_captacion_revision_concepto(p_cliente bigint, p_colaborador bigint, p_concepto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE j jsonb; u public.tb_usuario%ROWTYPE; ruta text;
BEGIN
 SELECT u1.* INTO u FROM public.tb_usuario u1 JOIN public.tb_estado s ON s.id=u1.id_estado AND upper(btrim(s.nombre))='ACTIVO' WHERE u1.auth_user_id=auth.uid();
 IF u.id IS NULL OR NOT(coalesce(u.flag_super_admin,false) OR u.id_rol=1) THEN RAISE EXCEPTION 'Revision exclusiva de Administracion'; END IF;
 j:=public.f_private_compensacion_captacion_fuente_concepto(p_cliente,p_colaborador,p_concepto);
 IF j IS NULL THEN RAISE EXCEPTION 'La captacion no existe o cambio de responsable'; END IF;
 ruta:=CASE WHEN p_concepto='COMISION_TIKTOK_LIVE' THEN '/compensaciones/otros-bonos/tiktok_live' ELSE '/compensaciones/atenciones' END;
 IF NOT coalesce(u.flag_super_admin,false) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(public.f_get_tb_navegacion_x_usuario(u.id)->'rutas_permitidas') x WHERE x=ruta) THEN RAISE EXCEPTION 'No tiene permiso para esta opcion'; END IF;
 RETURN j||public.f_private_compensacion_captacion_revision(j)||jsonb_build_object('historial',
  (SELECT coalesce(jsonb_agg(jsonb_build_object('decision',r.decision,'motivo',r.motivo,'fecha',r.fecha_revision,'usuario',autor.nombre) ORDER BY r.id DESC),'[]') FROM public.tb_compensacion_captacion_revision r JOIN public.tb_usuario autor ON autor.id=r.id_usuario_revisa WHERE r.id_cliente=p_cliente AND r.id_colaborador=p_colaborador AND r.concepto_codigo=p_concepto),
  'notas',(SELECT coalesce(jsonb_agg(jsonb_build_object('nota',n.nota,'fecha',n.fecha_registro,'usuario',autor.nombre) ORDER BY n.id DESC),'[]') FROM public.tb_compensacion_captacion_nota n JOIN public.tb_usuario autor ON autor.id=n.id_usuario WHERE n.id_cliente=p_cliente AND n.id_colaborador=p_colaborador));
END; $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_caza_errores_consecuencias(p_id_evento_origen bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_contexto jsonb; v_actor bigint; v_colaborador bigint; v_admin boolean;
BEGIN
  v_contexto:=public.f_private_compensacion_contexto('INCIDENCIAS','CONSULTAR');
  v_actor:=(v_contexto->>'id_usuario')::bigint;
  v_colaborador:=nullif(v_contexto->>'id_colaborador','')::bigint;
  v_admin:=coalesce((v_contexto->>'es_super_admin')::boolean,false);
  IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento e WHERE e.id=p_id_evento_origen
    AND e.datos->>'flujo'='CAZA_ERRORES_V1'
    AND (v_admin OR e.id_usuario_registra=v_actor
      OR e.id_colaborador_beneficiario=v_colaborador OR e.id_colaborador_responsable=v_colaborador)) THEN
    RAISE EXCEPTION 'No tiene acceso a las consecuencias de este hallazgo';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('tipo',v.tipo_consecuencia,'id',e.id,'codigo',p.codigo,
    'concepto',CASE WHEN v.tipo_consecuencia='COMISION_JEFE' THEN 'Comisión de Auditoría Activa' ELSE p.nombre END,
    'estado',e.estado_evento,'importe_aprobado',CASE WHEN v.tipo_consecuencia='COMISION_JEFE'
      THEN (e.criterios_validacion_snapshot->>'importe_bono_reportante')::numeric ELSE e.importe_aprobado END) ORDER BY v.id)
    FROM public.tb_compensacion_caza_errores_vinculo v
    JOIN public.tb_compensacion_evento e ON e.id=v.id_evento_consecuencia
    JOIN public.tb_compensacion_penalidad_tipo p ON p.id=e.id_penalidad_tipo
    WHERE v.id_evento_origen=p_id_evento_origen
      AND (v_admin OR e.id_colaborador_beneficiario=v_colaborador OR e.id_colaborador_responsable=v_colaborador)),'[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_caza_errores_personal()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_contexto jsonb; v_colaborador bigint;
BEGIN
  v_contexto:=public.f_private_compensacion_contexto('RESUMEN','CONSULTAR');
  v_colaborador:=nullif(v_contexto->>'id_colaborador','')::bigint;
  IF v_colaborador IS NULL THEN RAISE EXCEPTION 'No se encontró la ficha del colaborador'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',h.id,'tipo_consecuencia',v.tipo_consecuencia,'concepto',CASE WHEN v.tipo_consecuencia='COMISION_JEFE' THEN 'Comisión de Auditoría Activa' ELSE p.nombre END,
    'concepto_origen',o.titulo,'fecha_evento',h.fecha_evento,'estado',h.estado_evento,
    'importe',CASE WHEN h.estado_evento IN('APROBADO','LIQUIDADO') THEN CASE WHEN v.tipo_consecuencia='COMISION_JEFE'
      THEN coalesce((h.criterios_validacion_snapshot->>'importe_bono_reportante')::numeric,0) ELSE h.importe_aprobado END ELSE NULL END,
    'id_evento_origen',o.id) ORDER BY h.fecha_evento DESC,h.id DESC)
    FROM public.tb_compensacion_caza_errores_vinculo v
    JOIN public.tb_compensacion_evento o ON o.id=v.id_evento_origen
    JOIN public.tb_compensacion_evento h ON h.id=v.id_evento_consecuencia
    JOIN public.tb_compensacion_penalidad_tipo p ON p.id=h.id_penalidad_tipo
    WHERE h.estado_evento<>'BORRADOR'
      AND (h.id_colaborador_beneficiario=v_colaborador OR h.id_colaborador_responsable=v_colaborador)),'[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_cliente_nuevo_validar(p_documento text, p_tipo_documento bigint DEFAULT 1, p_id_excluir bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE yo bigint; cli public.tb_cliente%ROWTYPE; rol_dueno bigint; existe boolean;
BEGIN
  yo:=public.f_private_compensacion_cliente_nuevo_usuario();
  IF p_id_excluir IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tb_cliente WHERE id=p_id_excluir AND id_usuario=public.f_private_compensacion_cliente_nuevo_usuario()) THEN RAISE EXCEPTION 'Cliente no disponible'; END IF;
  IF p_tipo_documento NOT IN(1,2) OR p_tipo_documento IS NULL OR p_documento IS NULL
    OR (p_tipo_documento=1 AND p_documento !~ '^[0-9]{8}$') OR (p_tipo_documento=2 AND p_documento !~ '^[0-9]{9}$') THEN
    RAISE EXCEPTION 'Documento invalido'; END IF;
  existe:=(
      EXISTS(SELECT 1 FROM public.tb_cliente WHERE tipo_documento=p_tipo_documento AND numero_documento=p_documento AND (p_id_excluir IS NULL OR id<>p_id_excluir))
      OR EXISTS(SELECT 1 FROM public.tb_cliente_his h WHERE h.tipo_documento=p_tipo_documento AND h.numero_documento=p_documento AND (p_id_excluir IS NULL OR h.id<>p_id_excluir)
        AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_cliente_nuevo_baja b WHERE b.id_cliente=h.id))
      -- Operaciones anteriores sin cliente maestro tambien prueban historia.
      -- El contrato DNI8/CE9 permite determinar el tipo de este snapshot legacy.
      OR EXISTS(SELECT 1 FROM public.tb_operacion_proceso o
        WHERE regexp_replace(coalesce(o.dni_cliente,''),'[^0-9]','','g')=p_documento
          AND (p_id_excluir IS NULL OR o.id_cliente IS DISTINCT FROM p_id_excluir)));
  -- Regla de negocio ATC: un DNI existente se puede registrar si el cliente se creo dentro de los ultimos 7 dias
  -- y no pertenece a otro usuario con registro en este modulo (ATC, Jefe, Pagos, Marketing).
  IF existe AND p_id_excluir IS NULL THEN
    SELECT * INTO cli FROM public.tb_cliente WHERE tipo_documento=p_tipo_documento AND numero_documento=p_documento ORDER BY id LIMIT 1;
    IF FOUND THEN
      IF cli.id_usuario IS NOT DISTINCT FROM yo THEN
        RETURN jsonb_build_object('existe',true,'motivo','PROPIO','id_cliente',cli.id);
      END IF;
      SELECT id_rol INTO rol_dueno FROM public.tb_usuario WHERE id=cli.id_usuario;
      IF now()>cli.fecha_registro+interval '168 hours' THEN
        RETURN jsonb_build_object('existe',true,'motivo','VENCIDO','id_cliente',cli.id);
      ELSIF rol_dueno IN(2,3,4,6) THEN
        RETURN jsonb_build_object('existe',true,'motivo','OTRO_USUARIO','id_cliente',cli.id);
      ELSE
        RETURN jsonb_build_object('existe',false,'reclamable',true,'id_cliente',cli.id);
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('existe',existe);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_clientes_nuevos(p_mes date, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20, p_tipo_documento bigint DEFAULT NULL::bigint, p_documento text DEFAULT ''::text, p_estado text DEFAULT ''::text, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_nombre_cliente text DEFAULT ''::text, p_colaborador text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE es_admin boolean; usuario bigint; resultado jsonb; ctx jsonb; es_jefe boolean; es_pagos boolean;
BEGIN
  ctx:=public.f_private_compensacion_atencion_contexto();
 IF coalesce((ctx->>'es_admin')::boolean,false) THEN usuario:=(ctx->>'id_usuario')::bigint;
 ELSE usuario:=public.f_private_compensacion_cliente_nuevo_usuario(); END IF;
 SELECT id_rol=1 OR coalesce(flag_super_admin,false) INTO es_admin FROM public.tb_usuario WHERE id=usuario;
  ctx:=public.f_private_compensacion_atencion_contexto()||jsonb_build_object('id_colaborador',
    (SELECT id FROM public.tb_compensacion_colaborador WHERE id_usuario=usuario LIMIT 1));
  SELECT id_rol=3 AND NOT coalesce(flag_super_admin,false) INTO es_jefe FROM public.tb_usuario WHERE id=usuario;
  SELECT id_rol=2 INTO es_pagos FROM public.tb_usuario WHERE id=usuario;
  IF p_mes IS NULL OR p_pagina IS NULL OR p_pagina<1 OR p_tamano IS NULL OR p_tamano NOT IN(20,50,100) THEN RAISE EXCEPTION 'Consulta o paginacion invalida'; END IF;
  IF p_tipo_documento IS NOT NULL AND p_tipo_documento NOT IN(1,2) THEN RAISE EXCEPTION 'Tipo de documento invalido'; END IF;
  IF coalesce(p_estado,'') NOT IN('','ESPERANDO_OPERACION','OPERACION_PENDIENTE','BONO_HABILITADO','BLOQUEADO','EN_REVISION','PENDIENTE_APROBACION','APROBADO','RECHAZADO','REQUIERE_REVISION') THEN RAISE EXCEPTION 'Estado invalido'; END IF;
  IF p_desde IS NOT NULL AND p_hasta IS NOT NULL AND p_desde>p_hasta THEN RAISE EXCEPTION 'Desde no puede ser posterior a Hasta'; END IF;
  WITH clientes AS MATERIALIZED (
    SELECT c.id,(SELECT id FROM public.tb_compensacion_colaborador WHERE id_usuario=c.id_usuario LIMIT 1) id_colaborador,c.nombre,c.numero_documento documento,c.tipo_documento,c.celular,c.id_comunidad,c.fecha_registro,
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
    WHERE ((es_admin AND EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador captador WHERE captador.id_usuario=c.id_usuario)) OR c.id_usuario=usuario OR (es_pagos AND coalesce(pagada.id_usuario_gestor,pagada.id_usuario,pendiente.id_usuario_gestor,pendiente.id_usuario)=usuario) OR (es_jefe AND EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador propietario
        WHERE propietario.id_usuario=c.id_usuario AND public.f_private_compensacion_equipo_visible(ctx,propietario.id,(c.fecha_registro AT TIME ZONE 'America/Lima')::date))))
      AND (c.fecha_registro AT TIME ZONE 'America/Lima')::date>=date_trunc('month',p_mes)::date
      AND (c.fecha_registro AT TIME ZONE 'America/Lima')::date<(date_trunc('month',p_mes)+interval '1 month')::date
  ), evaluadas AS(SELECT c.*,CASE WHEN es_pagos THEN '{}'::jsonb ELSE public.f_private_compensacion_captacion_revision(to_jsonb(c)) END revision FROM clientes c), filtradas AS(SELECT * FROM evaluadas c WHERE (p_tipo_documento IS NULL OR c.tipo_documento=p_tipo_documento)
    AND (coalesce(btrim(p_documento),'')='' OR strpos(c.documento,btrim(p_documento))>0
      OR strpos(lower(coalesce(c.nombre,'')),lower(btrim(p_documento)))>0)
    AND (coalesce(btrim(p_nombre_cliente),'')='' OR strpos(lower(coalesce(c.nombre,'')),lower(btrim(p_nombre_cliente)))>0)
    AND (coalesce(btrim(p_colaborador),'')='' OR strpos(lower(coalesce(c.registrado_por,'')),lower(btrim(p_colaborador)))>0 OR EXISTS (SELECT 1 FROM public.tb_compensacion_colaborador k WHERE k.id=c.id_colaborador AND k.numero_documento=btrim(p_colaborador)))
    AND (coalesce(p_estado,'')='' OR c.estado=p_estado OR c.revision->>'estado_aprobacion'=p_estado)
    AND (p_desde IS NULL OR (c.fecha_registro AT TIME ZONE 'America/Lima')::date>=p_desde)
    AND (p_hasta IS NULL OR (c.fecha_registro AT TIME ZONE 'America/Lima')::date<=p_hasta)),
  pagina AS(SELECT * FROM filtradas ORDER BY fecha_registro DESC,id DESC LIMIT p_tamano OFFSET (p_pagina::bigint-1)*p_tamano)
  SELECT jsonb_build_object('asOf',now(),'dataState',CASE WHEN EXISTS(SELECT 1 FROM clientes WHERE estado='EN_REVISION') THEN 'partial' ELSE 'complete' END,
    'en_revision',(SELECT count(*) FROM clientes WHERE estado='EN_REVISION'),'items',coalesce((SELECT jsonb_agg(to_jsonb(p)||p.revision ORDER BY fecha_registro DESC,id DESC) FROM pagina p),'[]'::jsonb),
    'total_comision',(SELECT coalesce(sum(CASE WHEN es_pagos THEN ganancia ELSE (revision->>'ganancia')::numeric END),0) FROM evaluadas WHERE CASE WHEN es_pagos THEN estado='BONO_HABILITADO' ELSE revision->>'estado_aprobacion'='APROBADO' END),
    'total',(SELECT count(*) FROM filtradas),'habilitados',(SELECT count(*) FROM clientes WHERE estado='BONO_HABILITADO'),
    'esperando',(SELECT count(*) FROM clientes WHERE estado IN('ESPERANDO_OPERACION','OPERACION_PENDIENTE')),
    'bloqueados',(SELECT count(*) FROM clientes WHERE estado='BLOQUEADO')) INTO resultado;
  RETURN resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_colaborador_mes_admin(p_mes date, p_codigo text DEFAULT 'COLABORADOR_MES_ATENCIONES'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  ctx jsonb; mes date; fin date; v_codigo text:=upper(btrim(p_codigo)); resultado jsonb;
BEGIN
  IF p_mes IS NULL THEN RAISE EXCEPTION 'Selecciona un mes'; END IF;
  IF v_codigo NOT IN ('COLABORADOR_MES_ATENCIONES','COLABORADOR_MES_CALIFICACIONES') THEN
    RAISE EXCEPTION 'Reconocimiento mensual no permitido';
  END IF;
  ctx:=public.f_private_compensacion_contexto('EVIDENCIAS','CONSULTAR');
  IF NOT coalesce((ctx->>'es_super_admin')::boolean,false)
     AND NOT EXISTS(SELECT 1 FROM public.tb_usuario u WHERE u.id=(ctx->>'id_usuario')::bigint AND u.id_rol=1) THEN
    RAISE EXCEPTION 'Solo administración puede validar la selección mensual';
  END IF;
  mes:=date_trunc('month',p_mes)::date;
  fin:=(mes+interval '1 month - 1 day')::date;
  WITH asignaciones AS (
    SELECT DISTINCT ON(c.id) c.id id_colaborador,c.id_usuario,c.nombre_completo,c.numero_documento,
      s.nombre sede,a.id id_asignacion,a.id_plan,a.id_sucursal,a.id_cargo,a.modalidad
    FROM public.tb_compensacion_colaborador c
    JOIN public.tb_estado ce ON ce.id=c.id_estado AND upper(btrim(ce.nombre))='ACTIVO'
    JOIN public.tb_compensacion_asignacion a ON a.id_colaborador=c.id
    JOIN public.tb_estado ae ON ae.id=a.id_estado AND upper(btrim(ae.nombre))='ACTIVO'
    JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='ATENCION_CLIENTE'
    JOIN public.tb_sucursal s ON s.id=a.id_sucursal
    WHERE a.fecha_inicio<=fin AND (a.fecha_fin IS NULL OR a.fecha_fin>=mes)
      AND c.fecha_ingreso<=fin AND (c.fecha_cese IS NULL OR c.fecha_cese>=mes)
    ORDER BY c.id,a.fecha_inicio DESC,a.id DESC
  ), fuente AS (
    SELECT a.*,
      (SELECT count(*)::int FROM public.tb_compensacion_atencion atn
       CROSS JOIN LATERAL public.f_private_compensacion_atencion_operacion(atn.id_operacion_raiz) op
       WHERE atn.id_usuario_asesor=a.id_usuario AND atn.estado='VIGENTE'
         AND (op->>'pagada')::boolean
         AND (op->>'fecha') IS NOT NULL
         AND (atn.fecha_atencion AT TIME ZONE 'America/Lima')::date BETWEEN mes AND fin) atenciones,
      (SELECT count(*)::int FROM public.tb_compensacion_evento ev
       JOIN public.tb_compensacion_evento_tipo te ON te.id=ev.id_tipo_evento AND te.codigo='CALIFICACION_PRESENCIAL'
       WHERE ev.id_colaborador_beneficiario=a.id_colaborador
         AND ev.periodo_imputacion=mes AND ev.estado_evento IN('APROBADO','LIQUIDADO')
         AND coalesce((ev.datos->>'estrellas')::int,0) BETWEEN 4 AND 5) calificaciones,
      0::int minutos_tardanza_real,
      public.f_private_compensacion_puntualidad_condicion(mes,a.id_colaborador) puntualidad,
      regla.monto importe
    FROM asignaciones a
    LEFT JOIN LATERAL (
      SELECT rx.monto FROM public.f_private_compensacion_reglas_colaborador_fecha(a.id_plan,fin,a.id_colaborador) rx
      JOIN public.tb_compensacion_concepto co ON co.id=rx.id_concepto
        AND co.codigo=CASE WHEN v_codigo='COLABORADOR_MES_ATENCIONES' THEN 'BONO_COLABORADOR_ATENCIONES' ELSE 'BONO_COLABORADOR_CALIFICACIONES' END
      JOIN public.tb_estado ec ON ec.id=co.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
      JOIN public.tb_estado er ON er.id=rx.id_estado AND upper(btrim(er.nombre))='ACTIVO'
      WHERE rx.tipo_calculo='FIJO' AND rx.monto>0
        AND (rx.id_cargo IS NULL OR rx.id_cargo=a.id_cargo)
        AND (rx.id_sucursal IS NULL OR rx.id_sucursal=a.id_sucursal)
      ORDER BY ((rx.id_cargo IS NOT NULL)::int+(rx.id_sucursal IS NOT NULL)::int) DESC,rx.prioridad DESC,rx.id DESC
      LIMIT 1
    ) regla ON true
    WHERE a.modalidad='PRESENCIAL'
  ), elegibles AS (
    SELECT *,CASE WHEN v_codigo='COLABORADOR_MES_ATENCIONES' THEN atenciones ELSE calificaciones END metrica,
      CASE WHEN v_codigo='COLABORADOR_MES_ATENCIONES' THEN calificaciones ELSE atenciones END metrica_desempate
    FROM fuente WHERE puntualidad->>'estado'='CONSERVA'
  ), orden AS (
    SELECT *, dense_rank() OVER(ORDER BY metrica DESC,metrica_desempate DESC,minutos_tardanza_real ASC) puesto,
      count(*) OVER(PARTITION BY metrica,metrica_desempate,
        minutos_tardanza_real) empate_total
    FROM elegibles WHERE metrica>0
  ), candidatos AS (
    SELECT jsonb_build_object('id_colaborador',f.id_colaborador,'nombre',f.nombre_completo,
      'documento',f.numero_documento,'sede',f.sede,'atenciones',f.atenciones,'calificaciones_4_5',f.calificaciones,
      'minutos_tarde',f.minutos_tardanza_real,
      'importe_referencia',f.importe,
      'estado_puntualidad',f.puntualidad->>'estado','motivo_elegibilidad',f.puntualidad->>'motivo',
      'elegible',f.puntualidad->>'estado'='CONSERVA','puesto',o.puesto,
      'es_preseleccionado',o.puesto=1 AND o.empate_total=1,
      'requiere_desempate',o.puesto=1 AND o.empate_total>1) fila,
      o.puesto,o.empate_total,o.metrica
    FROM fuente f LEFT JOIN orden o ON o.id_colaborador=f.id_colaborador
  )
  SELECT jsonb_build_object('periodo',mes,'codigo',v_codigo,
    'estado',CASE WHEN count(*) FILTER(WHERE fila->>'estado_puntualidad' IN('SIN_DATOS','REVISAR','SIN_TARIFA'))>0 THEN 'ASISTENCIA_PENDIENTE'
      WHEN count(*) FILTER(WHERE puesto=1)=0 THEN 'SIN_CANDIDATOS'
      WHEN bool_or(puesto=1 AND empate_total>1) THEN 'DESEMPATE_ADMINISTRATIVO'
      ELSE 'PRESELECCION_VALIDABLE' END,
    'criterio_principal',CASE WHEN v_codigo='COLABORADOR_MES_ATENCIONES'
      THEN 'Mayor número de atenciones efectivas registradas y pagadas en el mes'
      ELSE 'Mayor número de calificaciones presenciales de 4 o 5 estrellas en el mes' END,
    'desempate','Mayor resultado en el otro indicador mensual; luego menor cantidad de minutos tarde dentro de tolerancia. Si persiste igualdad, requiere decisión administrativa justificada.',
    'elegibilidad','Solo candidatos con bono de puntualidad conservado; asistencia pendiente no se declara ganadora.',
    'importe_referencia',(SELECT fila->'importe_referencia' FROM candidatos WHERE puesto=1 ORDER BY empate_total LIMIT 1),
    'candidatos',coalesce(jsonb_agg(fila ORDER BY puesto,(fila->>'nombre')),'[]'::jsonb))
  INTO resultado FROM candidatos;
  RETURN resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_equipo_incidencias(p_direccion text DEFAULT NULL::text, p_estado text DEFAULT NULL::text, p_fecha_desde date DEFAULT NULL::date, p_fecha_hasta date DEFAULT NULL::date, p_busqueda text DEFAULT NULL::text, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20, p_dni text DEFAULT NULL::text, p_codigo text DEFAULT NULL::text, p_grupo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; usuario bigint; colaborador bigint; dir text:=upper(nullif(btrim(coalesce(p_direccion,'')),'')); grupo text:=upper(nullif(btrim(coalesce(p_grupo,'')),''));
  pagina integer:=greatest(coalesce(p_pagina,1),1); tamano integer:=least(greatest(coalesce(p_tamano,20),1),100); total bigint; items jsonb; resumen jsonb;
BEGIN
  IF dir IS NOT NULL AND dir NOT IN('ENVIADAS','RECIBIDAS') THEN RAISE EXCEPTION 'La direccion debe ser ENVIADAS o RECIBIDAS'; END IF;
  IF grupo IS NOT NULL AND grupo NOT IN('AUDITORIA','PERSONAL','ESCALONADA') THEN RAISE EXCEPTION 'Grupo de incidencias invalido'; END IF;
  ctx:=public.f_private_compensacion_contexto('INCIDENCIAS','CONSULTAR');
  IF (ctx->>'alcance')<>'SEDE' THEN RAISE EXCEPTION 'Esta consulta corresponde a Jefatura de sede'; END IF;
  usuario:=(ctx->>'id_usuario')::bigint; colaborador:=nullif(ctx->>'id_colaborador','')::bigint;
  WITH todo AS (
    SELECT ev.*,te.codigo tipo_evento_codigo,te.nombre tipo_evento_nombre,te.categoria,
      coalesce(ev.datos->'penalidad_tipo_snapshot'->>'codigo',pt.codigo) penalidad_codigo,
      coalesce(ev.datos->'penalidad_tipo_snapshot'->>'nombre',pt.nombre) penalidad_nombre,
      coalesce((ev.criterios_validacion_snapshot->>'importe_descuento')::numeric,(ev.datos->'penalidad_tipo_snapshot'->>'monto_referencia')::numeric,pt.monto_referencia) monto_referencia,
      coalesce((ev.criterios_validacion_snapshot->>'importe_bono_reportante')::numeric,
        CASE WHEN ev.datos->'penalidad_tipo_snapshot' ? 'monto_bono_reportante' THEN (ev.datos->'penalidad_tipo_snapshot'->>'monto_bono_reportante')::numeric ELSE pt.monto_bono_reportante END) monto_bono_reportante,
      coalesce((ev.datos->'penalidad_tipo_snapshot'->>'requiere_respuesta')::boolean,pt.requiere_respuesta) requiere_respuesta,
      reportante.nombre_completo reportante_nombre,reportante.numero_documento reportante_documento,
      responsable.nombre_completo responsable_nombre,responsable.numero_documento responsable_documento,
      so.nombre sucursal_origen_nombre,sr.nombre sucursal_responsable_nombre,ur.nombre usuario_registra_nombre,
      CASE WHEN ev.id_usuario_registra=usuario THEN 'ENVIADAS' ELSE 'RECIBIDAS' END direccion,
      coalesce((SELECT jsonb_agg(to_jsonb(ref) ORDER BY ref.id) FROM public.tb_compensacion_evento_referencia ref WHERE ref.id_evento=ev.id),'[]'::jsonb) referencias,
      coalesce((SELECT jsonb_agg(to_jsonb(rev)||jsonb_build_object('usuario_revisor_nombre',uv.nombre) ORDER BY rev.numero_paso)
        FROM public.tb_compensacion_evento_revision rev JOIN public.tb_usuario uv ON uv.id=rev.id_usuario_revisor WHERE rev.id_evento=ev.id),'[]'::jsonb) revisiones
    FROM public.tb_compensacion_evento ev
    JOIN public.tb_compensacion_evento_tipo te ON te.id=ev.id_tipo_evento
    JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id=ev.id_penalidad_tipo
    LEFT JOIN public.tb_compensacion_colaborador reportante ON reportante.id=ev.id_colaborador_beneficiario
    JOIN public.tb_compensacion_colaborador responsable ON responsable.id=ev.id_colaborador_responsable
    LEFT JOIN public.tb_sucursal so ON so.id=ev.id_sucursal_origen
    LEFT JOIN public.tb_sucursal sr ON sr.id=ev.id_sucursal_responsable
    JOIN public.tb_usuario ur ON ur.id=ev.id_usuario_registra
    WHERE te.codigo IN('REPORTE_PENALIDAD','AUDITORIA_ACTIVA')
      AND coalesce(ev.datos->>'consecuencia','')=''
      AND coalesce(ev.datos->'penalidad_tipo_snapshot'->>'codigo',pt.codigo)<>'ATC_FRAUDE_DIGITAL'
      AND (p_fecha_desde IS NULL OR (ev.fecha_evento AT TIME ZONE 'America/Lima')::date>=p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR (ev.fecha_evento AT TIME ZONE 'America/Lima')::date<=p_fecha_hasta)
      AND (
        ev.id_usuario_registra=usuario
        OR (ev.id_colaborador_responsable IS DISTINCT FROM colaborador
            AND public.f_private_compensacion_equipo_visible(ctx,ev.id_colaborador_responsable,(ev.fecha_evento AT TIME ZONE 'America/Lima')::date,false))
      )
  ), base AS (
    SELECT * FROM todo WHERE (dir IS NULL OR direccion=dir)
      AND (grupo IS NULL
        OR (grupo='AUDITORIA' AND penalidad_codigo IN('ATC_ERROR_DATOS','ATC_ERROR_REGISTRO','ATC_MAL_FLUJO','ATC_PROCESO_AIRE','ATC_ABANDONO_CHAT'))
        OR (grupo='PERSONAL' AND (upper(penalidad_codigo) LIKE '%UNIFORME%' OR upper(penalidad_codigo) LIKE '%INDISCIPLINA%'))
        OR (grupo='ESCALONADA' AND upper(penalidad_codigo) LIKE '%ERROR_CUADRO%'))
      AND (nullif(btrim(coalesce(p_estado,'')),'') IS NULL OR estado_evento=upper(btrim(p_estado)))
      AND (nullif(btrim(coalesce(p_dni,'')),'') IS NULL OR responsable_documento = btrim(p_dni)
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(referencias) r WHERE r->>'tipo_referencia'='CLIENTE' AND coalesce(r->>'identificador_externo',r->'datos_snapshot'->>'documento') = btrim(p_dni)))
      AND (nullif(btrim(coalesce(p_codigo,'')),'') IS NULL
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(referencias) r WHERE r->>'tipo_referencia'='OPERACION' AND r->'datos_snapshot'->>'codigo' ILIKE '%'||btrim(p_codigo)||'%'))
      AND (nullif(btrim(coalesce(p_busqueda,'')),'') IS NULL OR titulo ILIKE '%'||btrim(p_busqueda)||'%' OR descripcion ILIKE '%'||btrim(p_busqueda)||'%'
        OR penalidad_nombre ILIKE '%'||btrim(p_busqueda)||'%'
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(referencias) r WHERE r->'datos_snapshot'->>'nombre' ILIKE '%'||btrim(p_busqueda)||'%') OR responsable_nombre ILIKE '%'||btrim(p_busqueda)||'%' OR responsable_documento = btrim(p_busqueda))
  ), pag AS (SELECT * FROM base ORDER BY fecha_evento DESC,id DESC LIMIT tamano OFFSET (pagina-1)*tamano)
  SELECT (SELECT count(*) FROM base),
    jsonb_build_object(
      'recibidas_pendientes',(SELECT count(*) FROM todo WHERE direccion='RECIBIDAS' AND estado_evento='PENDIENTE' AND (grupo IS NULL
        OR (grupo='AUDITORIA' AND penalidad_codigo IN('ATC_ERROR_DATOS','ATC_ERROR_REGISTRO','ATC_MAL_FLUJO','ATC_PROCESO_AIRE','ATC_ABANDONO_CHAT'))
        OR (grupo='PERSONAL' AND (upper(penalidad_codigo) LIKE '%UNIFORME%' OR upper(penalidad_codigo) LIKE '%INDISCIPLINA%'))
        OR (grupo='ESCALONADA' AND upper(penalidad_codigo) LIKE '%ERROR_CUADRO%'))),
      'enviadas_pendientes',(SELECT count(*) FROM todo WHERE direccion='ENVIADAS' AND estado_evento='PENDIENTE' AND (grupo IS NULL
        OR (grupo='AUDITORIA' AND penalidad_codigo IN('ATC_ERROR_DATOS','ATC_ERROR_REGISTRO','ATC_MAL_FLUJO','ATC_PROCESO_AIRE','ATC_ABANDONO_CHAT'))
        OR (grupo='PERSONAL' AND (upper(penalidad_codigo) LIKE '%UNIFORME%' OR upper(penalidad_codigo) LIKE '%INDISCIPLINA%'))
        OR (grupo='ESCALONADA' AND upper(penalidad_codigo) LIKE '%ERROR_CUADRO%'))),
      'aprobadas',(SELECT count(*) FROM todo WHERE estado_evento IN('APROBADO','LIQUIDADO') AND (grupo IS NULL
        OR (grupo='AUDITORIA' AND penalidad_codigo IN('ATC_ERROR_DATOS','ATC_ERROR_REGISTRO','ATC_MAL_FLUJO','ATC_PROCESO_AIRE','ATC_ABANDONO_CHAT'))
        OR (grupo='PERSONAL' AND (upper(penalidad_codigo) LIKE '%UNIFORME%' OR upper(penalidad_codigo) LIKE '%INDISCIPLINA%'))
        OR (grupo='ESCALONADA' AND upper(penalidad_codigo) LIKE '%ERROR_CUADRO%'))),
      'rechazadas',(SELECT count(*) FROM todo WHERE estado_evento='RECHAZADO' AND (grupo IS NULL
        OR (grupo='AUDITORIA' AND penalidad_codigo IN('ATC_ERROR_DATOS','ATC_ERROR_REGISTRO','ATC_MAL_FLUJO','ATC_PROCESO_AIRE','ATC_ABANDONO_CHAT'))
        OR (grupo='PERSONAL' AND (upper(penalidad_codigo) LIKE '%UNIFORME%' OR upper(penalidad_codigo) LIKE '%INDISCIPLINA%'))
        OR (grupo='ESCALONADA' AND upper(penalidad_codigo) LIKE '%ERROR_CUADRO%')))),
    coalesce((SELECT jsonb_agg(to_jsonb(pag) ORDER BY pag.fecha_evento DESC,pag.id DESC) FROM pag),'[]'::jsonb)
  INTO total,resumen,items;
  RETURN jsonb_build_object('items',items,'resumen',resumen,'total',total,'pagina',pagina,'tamano_pagina',tamano,
    'total_paginas',CASE WHEN total=0 THEN 0 ELSE ceil(total::numeric/tamano)::integer END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_evento_operaciones(p_id_evento bigint, p_codigo text, p_dni text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE ctx jsonb; ev public.tb_compensacion_evento%ROWTYPE; tipo public.tb_compensacion_evento_tipo%ROWTYPE;
  dni text; items jsonb;
BEGIN
  ctx:=public.f_private_compensacion_evento_validar_alcance(p_id_evento,'CONSULTAR',false);
  SELECT * INTO ev FROM public.tb_compensacion_evento WHERE id=p_id_evento;
  SELECT * INTO tipo FROM public.tb_compensacion_evento_tipo WHERE id=ev.id_tipo_evento;
  IF tipo.categoria NOT IN('TARJETA_TERCERO','CALIFICACION','REFERIDO') AND tipo.codigo<>'TIKTOK_LIVE'
    THEN RAISE EXCEPTION 'Este concepto no admite vinculacion operativa'; END IF;
  IF NOT coalesce((ctx->>'es_super_admin')::boolean,false) AND (
    NOT EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=(ctx->>'id_usuario')::bigint AND id_rol=4)
    OR ctx->>'alcance'<>'PROPIO' OR ev.id_colaborador_beneficiario IS DISTINCT FROM (ctx->>'id_colaborador')::bigint)
    THEN RAISE EXCEPTION 'Solo puedes vincular tus propios registros'; END IF;
  dni:=coalesce(nullif(ev.datos->>'cliente_documento',''),nullif(ev.datos->>'numero_documento',''),
    (SELECT identificador_externo FROM public.tb_compensacion_evento_referencia WHERE id_evento=ev.id AND tipo_referencia='CLIENTE' ORDER BY id LIMIT 1));
  IF dni IS NULL OR dni !~ '^[0-9]{8}$' OR p_dni IS DISTINCT FROM dni THEN RAISE EXCEPTION 'El DNI debe coincidir con el cliente del registro'; END IF;
  IF nullif(btrim(p_codigo),'') IS NOT NULL AND (length(btrim(p_codigo))<3 OR length(btrim(p_codigo))>100)
    THEN RAISE EXCEPTION 'El codigo debe tener entre 3 y 100 caracteres'; END IF;
  SELECT coalesce(jsonb_agg(q.d),'[]'::jsonb) INTO items FROM (
    SELECT d FROM public.tb_operacion_proceso op
    CROSS JOIN LATERAL public.f_private_compensacion_atencion_operacion(op.id) d
    WHERE op.id_operacion_padre IS NULL AND d->>'dni'=dni AND (d->>'pagada')::boolean
      AND (nullif(btrim(p_codigo),'') IS NULL OR strpos(lower(coalesce(d->>'codigo','')),lower(btrim(p_codigo)))>0)
    ORDER BY op.id DESC LIMIT 30
  ) q;
  RETURN jsonb_build_object('items',items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_evidencia_colaboradores()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE ctx jsonb;
BEGIN
  ctx:=public.f_private_compensacion_contexto('CATALOGO_EVIDENCIAS','CONSULTAR');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'id_usuario',c.id_usuario,'nombre_completo',c.nombre_completo,
    'numero_documento',c.numero_documento) ORDER BY c.nombre_completo,c.id)
    FROM public.tb_compensacion_colaborador c
    JOIN public.tb_estado e ON e.id=c.id_estado AND upper(btrim(e.nombre))='ACTIVO'
    WHERE public.f_private_compensacion_equipo_visible(ctx,c.id,(now() AT TIME ZONE 'America/Lima')::date) AND (ctx->>'alcance'='GLOBAL'
      OR (ctx->>'alcance'='PROPIO' AND c.id=(ctx->>'id_colaborador')::bigint)
      OR (ctx->>'alcance'='SEDE' AND EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion a
        JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
        WHERE a.id_colaborador=c.id AND a.id_sucursal=(ctx->>'id_sucursal_alcance')::bigint
          AND a.fecha_inicio<=CURRENT_DATE AND (a.fecha_fin IS NULL OR a.fecha_fin>=CURRENT_DATE))))
  ),'[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_expediente(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; elegido public.tb_compensacion_evento%ROWTYPE; origen public.tb_compensacion_evento%ROWTYPE;
 penalidad public.tb_compensacion_penalidad_tipo%ROWTYPE;
 actor bigint; colaborador bigint; admin boolean; autor boolean; afectado boolean; cerrado boolean; id_origen bigint;
 consecuencias jsonb; historial jsonb; correccion jsonb; permite_descargo boolean;
BEGIN
 SELECT (u.id_rol=1 OR coalesce(u.flag_super_admin,false)) INTO admin FROM public.tb_usuario u
 JOIN public.tb_estado e ON e.id=u.id_estado AND upper(btrim(e.nombre))='ACTIVO' WHERE u.auth_user_id=auth.uid();
 IF coalesce(admin,false) THEN ctx:=public.f_private_compensacion_contexto('INCIDENCIAS','CONSULTAR');
 ELSE ctx:=public.f_private_compensacion_contexto('RESUMEN','CONSULTAR'); END IF;
 actor:=(ctx->>'id_usuario')::bigint;colaborador:=nullif(ctx->>'id_colaborador','')::bigint;
 SELECT * INTO elegido FROM public.tb_compensacion_evento WHERE id=p_id;
 SELECT v.id_evento_origen INTO id_origen FROM public.tb_compensacion_caza_errores_vinculo v WHERE v.id_evento_consecuencia=p_id;
 SELECT * INTO origen FROM public.tb_compensacion_evento WHERE id=coalesce(id_origen,p_id);
 autor:=coalesce(origen.id_usuario_registra=actor,false);
 afectado:=coalesce(elegido.id_colaborador_responsable=colaborador,false);
 IF elegido.id IS NULL OR NOT coalesce(admin,false) AND NOT coalesce((
   elegido.id_colaborador_responsable=colaborador OR elegido.id_colaborador_beneficiario=colaborador OR (autor AND elegido.id=origen.id)
 ),false) THEN RAISE EXCEPTION 'Expediente fuera de tu alcance'; END IF;
 IF autor AND NOT coalesce(admin,false) AND origen.datos->>'flujo'='CAZA_ERRORES_V1' THEN
   PERFORM public.f_private_compensacion_incidencia_validar_alcance(origen.id,'CONSULTAR',false);
 END IF;
 cerrado:=EXISTS(SELECT 1 FROM public.tb_compensacion_periodo WHERE periodo=elegido.periodo_imputacion AND estado_periodo IN('APROBADO','CERRADO'))
   OR EXISTS(SELECT 1 FROM public.tb_compensacion_reporte_mes rm JOIN public.tb_compensacion_periodo rp ON rp.id=rm.id_periodo WHERE rp.periodo=elegido.periodo_imputacion AND rm.estado='CONFIRMADO');
 SELECT to_jsonb(c)-'historial' || jsonb_build_object('colaborador',(SELECT nombre_completo FROM public.tb_compensacion_colaborador WHERE id=c.id_colaborador_corrige)) INTO correccion FROM public.tb_compensacion_hallazgo_correccion c WHERE id_evento=origen.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'titulo',e.titulo,'estado',e.estado_evento,'importe',e.importe_aprobado,
   'tipo',CASE WHEN EXISTS(SELECT 1 FROM public.tb_compensacion_caza_errores_vinculo v WHERE v.id_evento_consecuencia=e.id AND v.tipo_consecuencia='COMISION_JEFE') OR e.id_penalidad_tipo IS NULL THEN 'Comision' ELSE 'Penalidad' END) ORDER BY e.id),'[]') INTO consecuencias
 FROM public.tb_compensacion_evento e WHERE (e.id=origen.id OR e.id IN(SELECT id_evento_consecuencia FROM public.tb_compensacion_caza_errores_vinculo WHERE id_evento_origen=origen.id))
   AND (coalesce(admin,false) OR CASE WHEN EXISTS(SELECT 1 FROM public.tb_compensacion_caza_errores_vinculo v WHERE v.id_evento_consecuencia=e.id AND v.tipo_consecuencia='COMISION_JEFE') OR e.id_penalidad_tipo IS NULL THEN e.id_colaborador_beneficiario=colaborador ELSE e.id_colaborador_responsable=colaborador END);
 SELECT coalesce(jsonb_agg(jsonb_build_object('fecha',r.fecha_revision,'etapa',r.etapa,'decision',r.decision,'comentario',r.comentario,
   'usuario',(SELECT u.nombre FROM public.tb_usuario u WHERE u.id=r.id_usuario_revisor)) ORDER BY r.fecha_revision,r.numero_paso),'[]') INTO historial
 FROM public.tb_compensacion_evento_revision r WHERE r.id_evento=elegido.id;
 penalidad:=public.f_private_compensacion_incidencia_penalidad_registrada(elegido.id);
 permite_descargo:=afectado AND elegido.estado_evento='PENDIENTE' AND NOT cerrado
   AND coalesce(penalidad.requiere_respuesta,false)
   AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_caza_errores_vinculo v WHERE v.id_evento_consecuencia=elegido.id AND v.tipo_consecuencia='COMISION_JEFE')
   AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_revision r WHERE r.id_evento=elegido.id AND r.etapa='DESCARGO'
     AND r.numero_paso>coalesce((SELECT max(numero_paso) FROM public.tb_compensacion_evento_revision WHERE id_evento=elegido.id AND decision='ENVIADO'),0));
 RETURN jsonb_build_object('id',elegido.id,'id_origen',origen.id,'titulo',origen.titulo,'motivo',origen.descripcion,'fecha',origen.fecha_evento,'estado',elegido.estado_evento,
   'reportante',(SELECT nombre_completo FROM public.tb_compensacion_colaborador WHERE id=origen.id_colaborador_beneficiario),
   'colaborador',(SELECT nombre_completo FROM public.tb_compensacion_colaborador WHERE id=origen.id_colaborador_responsable),
   'es_hallazgo',coalesce(origen.datos->>'flujo'='CAZA_ERRORES_V1',false),'correccion',correccion,'consecuencias',consecuencias,'historial',historial,'puede_descargo',permite_descargo,
   'puede_corregir',autor AND origen.datos->>'flujo'='CAZA_ERRORES_V1' AND origen.estado_evento IN('BORRADOR','PENDIENTE') AND NOT cerrado,
   'id_responsable',origen.id_colaborador_responsable,'id_reportante',origen.id_colaborador_beneficiario);
END $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_facturacion(p_mes date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; sede bigint; col bigint; asignacion public.tb_compensacion_asignacion%ROWTYPE; version public.tb_compensacion_plan_version%ROWTYPE;
 rutas jsonb; reglas jsonb; penalidades jsonb; mes date:=date_trunc('month',p_mes)::date;
 referencia date; efectiva bigint;
BEGIN
 IF p_mes IS NULL THEN RAISE EXCEPTION 'Selecciona el periodo'; END IF;
 ctx:=public.f_private_compensacion_contexto('RESUMEN','CONSULTAR');
 IF NOT EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=(ctx->>'id_usuario')::bigint AND id_rol=5 AND NOT coalesce(flag_super_admin,false))
   THEN RAISE EXCEPTION 'Consulta exclusiva de Facturacion'; END IF;
 sede:=(ctx->>'id_sucursal_usuario')::bigint; col:=nullif(ctx->>'id_colaborador','')::bigint;
 referencia:=least((mes+interval '1 month - 1 day')::date,(now() AT TIME ZONE 'America/Lima')::date);
 SELECT a.* INTO asignacion FROM public.tb_compensacion_asignacion a
 JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='FACTURACION'
 JOIN public.tb_estado e ON e.id=a.id_estado AND upper(btrim(e.nombre))='ACTIVO'
 WHERE a.id_colaborador=col AND a.fecha_inicio<mes+interval '1 month'
   AND (a.fecha_fin IS NULL OR a.fecha_fin>=mes) ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1;
 -- La configuracion efectiva es la fuente vigente del motor aunque su version
 -- de origen permanezca BORRADOR; no se modifica ni se publica esa version.
 sede:=asignacion.id_sucursal;
 SELECT ce.id_plan_version_origen INTO efectiva FROM public.tb_compensacion_configuracion_efectiva ce
 WHERE ce.id_plan=asignacion.id_plan AND ce.fecha_desde<=referencia ORDER BY ce.fecha_desde DESC,ce.id DESC LIMIT 1;
 IF efectiva IS NOT NULL THEN
   SELECT * INTO version FROM public.tb_compensacion_plan_version WHERE id=efectiva;
 ELSE
   SELECT v.* INTO version FROM public.tb_compensacion_plan_version v WHERE v.id_plan=asignacion.id_plan
     AND v.fecha_inicio<mes+interval '1 month' AND (v.fecha_fin IS NULL OR v.fecha_fin>=mes)
   ORDER BY (v.estado_version='PUBLICADA') DESC,v.numero_version DESC,v.id DESC LIMIT 1;
 END IF;
 SELECT coalesce(jsonb_agg(DISTINCT pm.ruta),'[]') INTO rutas FROM public.tb_permiso_usuario pu
 JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
 JOIN public.tb_estado eu ON eu.id=pu.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
 JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
 WHERE pu.id_usuario=(ctx->>'id_usuario')::bigint AND public.f_private_compensacion_facturacion_ruta_permitida(pm.ruta);
 SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO reglas FROM (
   SELECT DISTINCT ON(co.codigo) co.codigo,co.nombre,r.tipo_calculo,r.monto,r.porcentaje,r.configuracion
   FROM (
     SELECT r.* FROM public.f_private_compensacion_reglas_colaborador_fecha(asignacion.id_plan,referencia,col) r
     WHERE efectiva IS NOT NULL OR version.estado_version='PUBLICADA'
     UNION ALL SELECT r.* FROM public.tb_compensacion_regla r
     WHERE efectiva IS NULL AND version.estado_version IS DISTINCT FROM 'PUBLICADA' AND r.id_plan_version=version.id
   ) r JOIN public.tb_compensacion_concepto co ON co.id=r.id_concepto
   JOIN public.tb_estado e ON e.id=r.id_estado AND upper(btrim(e.nombre))='ACTIVO'
   WHERE (r.id_cargo IS NULL OR r.id_cargo=asignacion.id_cargo) AND (r.id_sucursal IS NULL OR r.id_sucursal=sede)
   ORDER BY co.codigo,((r.id_cargo IS NOT NULL)::int+(r.id_sucursal IS NOT NULL)::int) DESC,r.prioridad DESC,r.id DESC
 ) r;
 SELECT coalesce(jsonb_agg(jsonb_build_object('codigo',p.codigo,'nombre',p.nombre,'monto',p.monto_referencia,'configuracion',p.configuracion)),'[]')
 INTO penalidades FROM (
   SELECT p.* FROM public.f_private_compensacion_penalidades_fecha(asignacion.id_plan,referencia) p
   WHERE efectiva IS NOT NULL OR version.estado_version='PUBLICADA'
   UNION ALL SELECT p.* FROM public.tb_compensacion_penalidad_tipo p
   WHERE efectiva IS NULL AND version.estado_version IS DISTINCT FROM 'PUBLICADA' AND p.id_plan_version=version.id
 ) p WHERE p.id_cargo=asignacion.id_cargo;
 RETURN jsonb_build_object('mes',mes,'sede',(SELECT nombre FROM public.tb_sucursal WHERE id=sede),'id_colaborador',col,
   'estado',CASE WHEN asignacion.id IS NULL THEN 'SIN_ASIGNACION' WHEN efectiva IS NULL AND version.estado_version IS DISTINCT FROM 'PUBLICADA' THEN 'MATRIZ_PENDIENTE' ELSE 'OK' END,
   'estado_matriz',CASE WHEN efectiva IS NOT NULL THEN 'CONFIGURACION_EFECTIVA' ELSE version.estado_version END,'rutas',rutas,'reglas',reglas,'penalidades',penalidades,
   'auditorias_pendientes',(SELECT count(*) FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
     WHERE e.id_colaborador_beneficiario=col AND e.periodo_imputacion=mes AND e.estado_evento='PENDIENTE' AND t.codigo IN('DETECCION_ERROR_PAGO','OPERACION_EXTRA')),
   'registros_propios',(SELECT count(*) FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
     WHERE e.id_colaborador_beneficiario=col AND e.periodo_imputacion=mes AND e.estado_evento<>'ANULADO' AND t.codigo IN('PROPUESTA_INNOVACION','REFERIDO')),
   'incidencias_propias',(SELECT count(*) FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
     WHERE e.id_colaborador_responsable=col AND e.periodo_imputacion=mes AND e.estado_evento='PENDIENTE' AND t.categoria='PENALIDAD'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_facturacion_auditoria(p_desde date, p_hasta date, p_estado character varying DEFAULT NULL::character varying, p_dni character varying DEFAULT NULL::character varying, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE ctx jsonb; resultado jsonb;
BEGIN
  ctx:=public.f_private_compensacion_facturacion_auditoria_contexto('CONSULTAR');
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta<p_desde OR p_hasta-p_desde>366 THEN RAISE EXCEPTION 'Rango de fechas invalido (maximo 366 dias)'; END IF;
  IF p_dni IS NOT NULL AND p_dni !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'DNI invalido'; END IF;
  IF p_pagina IS NULL OR p_pagina<1 OR p_tamano IS NULL OR p_tamano NOT IN(20,50,100)
    OR (p_estado IS NOT NULL AND p_estado NOT IN('PENDIENTE','APROBADO','RECHAZADO','LIQUIDADO')) THEN
    RAISE EXCEPTION 'Estado o paginacion invalida'; END IF;
  WITH base AS (
    SELECT e.*,t.codigo tipo,c.nombre_completo beneficiario,
      (e.estado_evento='APROBADO' AND NOT public.f_private_compensacion_facturacion_auditoria_vigente(e.id)) requiere_revision,
      coalesce(e.datos->'operacion'->>'cliente','Sin operacion vinculada') cliente,
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.numero_paso) FROM public.tb_compensacion_evento_revision r WHERE r.id_evento=e.id) revisiones
    FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
    JOIN public.tb_compensacion_colaborador c ON c.id=e.id_colaborador_beneficiario
    WHERE e.datos->>'flujo'='FACTURACION_AUDITORIA_V1' AND t.categoria='AUDITORIA_PAGO'
      AND t.codigo IN('DETECCION_ERROR_PAGO','OPERACION_EXTRA')
      AND ((ctx->>'es_admin')::boolean OR (e.id_colaborador_beneficiario=(ctx->>'id_colaborador')::bigint AND e.id_usuario_registra=(ctx->>'id_usuario')::bigint))
      AND e.fecha_evento>=(p_desde::timestamp AT TIME ZONE 'America/Lima') AND e.fecha_evento<((p_hasta+1)::timestamp AT TIME ZONE 'America/Lima')
      AND (p_estado IS NULL OR e.estado_evento=p_estado) AND (p_dni IS NULL OR e.datos->>'cliente_documento'=p_dni)
  ), pag AS (SELECT base.*,
      public.f_private_compensacion_facturacion_auditoria_operacion(
        (datos->'operacion'->>'id')::bigint,datos->>'cliente_documento') operacion_actual FROM base ORDER BY fecha_evento DESC,id DESC
    LIMIT least(greatest(coalesce(p_tamano,20),1),100) OFFSET (greatest(coalesce(p_pagina,1),1)-1)*least(greatest(coalesce(p_tamano,20),1),100))
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(pag) ORDER BY fecha_evento DESC,id DESC) FROM pag),'[]'::jsonb),
    'total',(SELECT count(*) FROM base),'pendientes',(SELECT count(*) FROM base WHERE estado_evento='PENDIENTE' OR requiere_revision),
    'aprobado',(SELECT coalesce(sum(importe_aprobado),0) FROM base WHERE estado_evento IN('APROBADO','LIQUIDADO') AND NOT requiere_revision)) INTO resultado;
  RETURN resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_facturacion_auditoria_contexto()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT public.f_private_compensacion_facturacion_auditoria_contexto('CONSULTAR');
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_facturacion_auditoria_operaciones(p_dni character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE ctx jsonb; items jsonb;
BEGIN
  ctx:=public.f_private_compensacion_facturacion_auditoria_contexto('CONSULTAR');
  IF p_dni IS NULL OR p_dni !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'Ingresa un DNI de 8 digitos'; END IF;
  SELECT coalesce(jsonb_agg(q.d ORDER BY q.fecha_registro DESC,q.id DESC),'[]'::jsonb) INTO items FROM (
    SELECT o.id,o.fecha_registro,d FROM public.tb_operacion_proceso o
    CROSS JOIN LATERAL public.f_private_compensacion_facturacion_auditoria_operacion(o.id,p_dni) d
    WHERE btrim(o.dni_cliente)=p_dni AND d IS NOT NULL
    ORDER BY o.fecha_registro DESC,o.id DESC LIMIT 100
  ) q;
  RETURN jsonb_build_object('dni',p_dni,'items',items,'limite',100);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_incidencia_revision_admin(p_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
 SELECT public.f_private_compensacion_incidencia_revision_admin(p_id);
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_innovacion_implementacion(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE ctx jsonb; e public.tb_compensacion_evento%ROWTYPE; independiente boolean;
BEGIN
  ctx:=public.f_private_compensacion_evento_validar_alcance(p_id,'CONSULTAR',false);
  SELECT * INTO STRICT e FROM public.tb_compensacion_evento WHERE id=p_id;
  IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_tipo WHERE id=e.id_tipo_evento AND codigo='PROPUESTA_INNOVACION') THEN
    RAISE EXCEPTION 'No corresponde a una propuesta de innovacion';
  END IF;
  independiente:=(ctx->>'id_usuario')::bigint<>e.id_usuario_registra AND NOT EXISTS(
    SELECT 1 FROM public.tb_compensacion_colaborador WHERE id IN(e.id_colaborador_beneficiario,e.id_colaborador_responsable)
      AND id_usuario=(ctx->>'id_usuario')::bigint);
  RETURN jsonb_build_object('version',e.fecha_actualizacion,
    -- SQL120: Administracion fija el importe de la innovacion de Jefatura al comprobar la implementacion.
    'importe_variable',EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion a
      JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='JEFE_TIENDA'
      JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
      WHERE a.id_colaborador=e.id_colaborador_beneficiario
        AND (e.fecha_evento AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)),
    'importe_fijado',e.criterios_validacion_snapshot->'innovacion_importe_fijado',
    'comprobada',public.f_private_compensacion_innovacion_comprobada(p_id),
    'constancia',e.criterios_validacion_snapshot->'innovacion_implementacion',
    'economia',e.criterios_validacion_snapshot->'innovacion_economia',
    'puede_revisar',COALESCE((ctx->>'es_super_admin')::boolean,false) AND independiente,
    'bloqueado',e.estado_evento='LIQUIDADO' OR EXISTS(SELECT 1 FROM public.tb_compensacion_periodo
      WHERE periodo=e.periodo_imputacion AND estado_periodo IN('APROBADO','CERRADO')));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_jefatura(p_mes date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; sede bigint; col bigint; asignacion public.tb_compensacion_asignacion%ROWTYPE; version public.tb_compensacion_plan_version%ROWTYPE;
 rutas jsonb; reglas jsonb; penalidades jsonb; mes date:=date_trunc('month',p_mes)::date;
 referencia date; efectiva bigint;
BEGIN
 IF p_mes IS NULL THEN RAISE EXCEPTION 'Selecciona el periodo'; END IF;
 ctx:=public.f_private_compensacion_contexto('RESUMEN','CONSULTAR');
 IF NOT EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=(ctx->>'id_usuario')::bigint AND id_rol=3 AND NOT coalesce(flag_super_admin,false))
   THEN RAISE EXCEPTION 'Consulta exclusiva de Jefe de Tienda'; END IF;
 sede:=(ctx->>'id_sucursal_usuario')::bigint; col:=nullif(ctx->>'id_colaborador','')::bigint;
 referencia:=least((mes+interval '1 month - 1 day')::date,(now() AT TIME ZONE 'America/Lima')::date);
 SELECT a.* INTO asignacion FROM public.tb_compensacion_asignacion a
 JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo AND ca.codigo='JEFE_TIENDA'
 JOIN public.tb_estado e ON e.id=a.id_estado AND upper(btrim(e.nombre))='ACTIVO'
 WHERE a.id_colaborador=col AND a.id_sucursal=sede AND a.fecha_inicio<mes+interval '1 month'
   AND (a.fecha_fin IS NULL OR a.fecha_fin>=mes) ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1;
 -- La configuracion efectiva es la fuente vigente del motor aunque su version
 -- de origen permanezca BORRADOR; no se modifica ni se publica esa version.
 SELECT ce.id_plan_version_origen INTO efectiva FROM public.tb_compensacion_configuracion_efectiva ce
 WHERE ce.id_plan=asignacion.id_plan AND ce.fecha_desde<=referencia ORDER BY ce.fecha_desde DESC,ce.id DESC LIMIT 1;
 IF efectiva IS NOT NULL THEN
   SELECT * INTO version FROM public.tb_compensacion_plan_version WHERE id=efectiva;
 ELSE
   SELECT v.* INTO version FROM public.tb_compensacion_plan_version v WHERE v.id_plan=asignacion.id_plan
     AND v.fecha_inicio<mes+interval '1 month' AND (v.fecha_fin IS NULL OR v.fecha_fin>=mes)
   ORDER BY (v.estado_version='PUBLICADA') DESC,v.numero_version DESC,v.id DESC LIMIT 1;
 END IF;
 SELECT coalesce(jsonb_agg(DISTINCT pm.ruta),'[]') INTO rutas FROM public.tb_permiso_usuario pu
 JOIN public.tb_permiso_menu pm ON pm.id=pu.id_permiso_menu
 JOIN public.tb_estado eu ON eu.id=pu.id_estado AND upper(btrim(eu.nombre))='ACTIVO'
 JOIN public.tb_estado em ON em.id=pm.id_estado AND upper(btrim(em.nombre))='ACTIVO'
 WHERE pu.id_usuario=(ctx->>'id_usuario')::bigint AND public.f_private_compensacion_jefatura_ruta_permitida(pm.ruta);
 SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO reglas FROM (
   SELECT DISTINCT ON(co.codigo) co.codigo,co.nombre,r.tipo_calculo,r.monto,r.porcentaje,r.configuracion
   FROM (
     SELECT r.* FROM public.f_private_compensacion_reglas_colaborador_fecha(asignacion.id_plan,referencia,col) r
     WHERE efectiva IS NOT NULL OR version.estado_version='PUBLICADA'
     UNION ALL SELECT r.* FROM public.tb_compensacion_regla r
     WHERE efectiva IS NULL AND version.estado_version IS DISTINCT FROM 'PUBLICADA' AND r.id_plan_version=version.id
   ) r JOIN public.tb_compensacion_concepto co ON co.id=r.id_concepto
   JOIN public.tb_estado e ON e.id=r.id_estado AND upper(btrim(e.nombre))='ACTIVO'
   WHERE (r.id_cargo IS NULL OR r.id_cargo=asignacion.id_cargo) AND (r.id_sucursal IS NULL OR r.id_sucursal=sede)
   ORDER BY co.codigo,((r.id_cargo IS NOT NULL)::int+(r.id_sucursal IS NOT NULL)::int) DESC,r.prioridad DESC,r.id DESC
 ) r;
 SELECT coalesce(jsonb_agg(jsonb_build_object('codigo',p.codigo,'nombre',p.nombre,'monto',p.monto_referencia,'configuracion',p.configuracion)),'[]')
 INTO penalidades FROM (
   SELECT p.* FROM public.f_private_compensacion_penalidades_fecha(asignacion.id_plan,referencia) p
   WHERE efectiva IS NOT NULL OR version.estado_version='PUBLICADA'
   UNION ALL SELECT p.* FROM public.tb_compensacion_penalidad_tipo p
   WHERE efectiva IS NULL AND version.estado_version IS DISTINCT FROM 'PUBLICADA' AND p.id_plan_version=version.id
 ) p WHERE p.id_cargo=asignacion.id_cargo;
 RETURN jsonb_build_object('mes',mes,'sede',(SELECT nombre FROM public.tb_sucursal WHERE id=sede),'id_colaborador',col,
   'estado',CASE WHEN asignacion.id IS NULL THEN 'SIN_ASIGNACION' WHEN efectiva IS NULL AND version.estado_version IS DISTINCT FROM 'PUBLICADA' THEN 'MATRIZ_PENDIENTE' ELSE 'OK' END,
   'estado_matriz',CASE WHEN efectiva IS NOT NULL THEN 'CONFIGURACION_EFECTIVA' ELSE version.estado_version END,'rutas',rutas,'reglas',reglas,'penalidades',penalidades,
   'equipo',(SELECT count(*) FROM public.tb_usuario u JOIN public.tb_estado e ON e.id=u.id_estado AND upper(btrim(e.nombre))='ACTIVO' WHERE u.id_rol=4 AND public.f_private_compensacion_equipo_visible(ctx,
     (SELECT c.id FROM public.tb_compensacion_colaborador c WHERE c.id_usuario=u.id),referencia,false)),
   'revisiones',(SELECT count(*) FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
     WHERE e.estado_evento='PENDIENTE' AND e.periodo_imputacion=mes AND sede IN(e.id_sucursal_origen,e.id_sucursal_responsable)
       AND public.f_private_compensacion_equipo_visible(ctx,e.id_colaborador_beneficiario,
         (e.fecha_evento AT TIME ZONE 'America/Lima')::date,false)
       AND e.id_colaborador_responsable IS DISTINCT FROM col
       AND e.id_colaborador_beneficiario IS DISTINCT FROM col AND e.id_usuario_registra IS DISTINCT FROM (ctx->>'id_usuario')::bigint
       AND EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador c JOIN public.tb_usuario u ON u.id=c.id_usuario
         WHERE c.id=e.id_colaborador_beneficiario AND u.id_rol=4)
       AND t.categoria IN('LLAMADA','CALIFICACION','TARJETA_TERCERO','PENALIDAD','AUDITORIA_PAGO','OTRO')
       AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_penalidad_tipo ptz WHERE ptz.id=e.id_penalidad_tipo AND ptz.codigo='ATC_FRAUDE_DIGITAL')),
   'correcciones',0,
   'incidencias_propias',(SELECT count(*) FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
     WHERE e.id_colaborador_responsable=col AND e.periodo_imputacion=mes AND e.estado_evento='PENDIENTE' AND t.categoria IN('PENALIDAD','AUDITORIA_PAGO')),
   -- Aviso informativo: el Jefe no revisa ni pierde comisiones por este hecho.
   'tolerancia_cero',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'colaborador',c.nombre_completo,
       'fecha',(e.fecha_evento AT TIME ZONE 'America/Lima')::date,
       'estado',CASE WHEN e.estado_evento IN('APROBADO','LIQUIDADO') THEN 'CONFIRMADO' ELSE 'EN_REVISION' END)
       ORDER BY e.fecha_evento DESC,e.id DESC),'[]'::jsonb)
     FROM public.tb_compensacion_evento e
     JOIN public.tb_compensacion_penalidad_tipo pz ON pz.id=e.id_penalidad_tipo AND pz.codigo='ATC_FRAUDE_DIGITAL'
     JOIN public.tb_compensacion_colaborador c ON c.id=e.id_colaborador_responsable
     WHERE e.periodo_imputacion=mes AND e.id_sucursal_responsable=sede AND e.estado_evento IN('PENDIENTE','APROBADO','LIQUIDADO')));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_llamada_contexto()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_contexto jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('CATALOGO_EVIDENCIAS', 'CONSULTAR');
  RETURN jsonb_build_object(
    'id_usuario', (v_contexto->>'id_usuario')::bigint,
    'id_colaborador', NULLIF(v_contexto->>'id_colaborador','')::bigint,
    'puede_registrar', COALESCE((v_contexto->>'puede_registrar')::boolean,false),
    'puede_aprobar', COALESCE((v_contexto->>'puede_aprobar')::boolean,false),
    'puede_revisar', COALESCE((v_contexto->>'puede_revisar')::boolean,false)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_llamadas_contexto()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_ctx jsonb; v_opciones jsonb;
BEGIN
  v_ctx:=public.f_private_compensacion_llamada_contexto('CONSULTAR');
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'nombre',c.nombre_completo,'sede',s.nombre) ORDER BY c.nombre_completo),'[]'::jsonb)
  INTO v_opciones FROM public.tb_compensacion_colaborador c
    JOIN public.tb_estado ec ON ec.id=c.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
    JOIN LATERAL(SELECT a.id_sucursal FROM public.tb_compensacion_asignacion a
      JOIN public.tb_estado ea ON ea.id=a.id_estado AND upper(btrim(ea.nombre))='ACTIVO'
      WHERE a.id_colaborador=c.id AND a.fecha_inicio<=(now() AT TIME ZONE 'America/Lima')::date
        AND (a.fecha_fin IS NULL OR a.fecha_fin>=(now() AT TIME ZONE 'America/Lima')::date)
      ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1) a ON true
    JOIN public.tb_sucursal s ON s.id=a.id_sucursal
  WHERE (v_ctx->>'alcance'='GLOBAL' OR (v_ctx->>'alcance'='SEDE' AND a.id_sucursal=(v_ctx->>'id_sucursal_alcance')::bigint)
    OR (v_ctx->>'alcance'='PROPIO' AND c.id=(v_ctx->>'id_colaborador')::bigint));
  RETURN v_ctx||jsonb_build_object('colaboradores',v_opciones);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_llamadas_filtradas(p_id bigint DEFAULT NULL::bigint, p_categoria character varying DEFAULT 'LLAMADA'::character varying, p_estado_evento character varying DEFAULT NULL::character varying, p_id_tipo_evento bigint DEFAULT NULL::bigint, p_id_colaborador bigint DEFAULT NULL::bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_fecha_desde date DEFAULT NULL::date, p_fecha_hasta date DEFAULT NULL::date, p_busqueda character varying DEFAULT NULL::character varying, p_pagina integer DEFAULT 1, p_tamano_pagina integer DEFAULT 50, p_documento_cliente text DEFAULT NULL::text, p_nombre_cliente text DEFAULT NULL::text, p_colaborador text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_contexto jsonb;
  v_alcance character varying;
  v_id_colaborador_actor bigint;
  v_id_sucursal_alcance bigint;
  v_pagina integer := GREATEST(COALESCE(p_pagina, 1), 1);
  v_tamano integer := LEAST(GREATEST(COALESCE(p_tamano_pagina, 50), 1), 200);
  v_total bigint;
  v_items jsonb;
  v_resumen jsonb;
BEGIN
  IF coalesce(p_categoria,'LLAMADA') <> 'LLAMADA' THEN RAISE EXCEPTION 'Esta consulta corresponde a Llamadas'; END IF;
  p_categoria := 'LLAMADA';
  IF p_categoria='LLAMADA' THEN
    v_contexto:=public.f_private_compensacion_llamada_contexto('CONSULTAR');
  ELSIF p_id IS NOT NULL THEN
    v_contexto:=public.f_private_compensacion_evento_contexto(
      (SELECT id_tipo_evento FROM public.tb_compensacion_evento WHERE id=p_id),'CONSULTAR');
  ELSIF p_id_tipo_evento IS NOT NULL THEN
    v_contexto:=public.f_private_compensacion_evento_contexto(p_id_tipo_evento,'CONSULTAR');
  ELSIF p_categoria IS NOT NULL THEN
    v_contexto:=public.f_private_compensacion_contexto((CASE upper(btrim(p_categoria))
      WHEN 'CALIFICACION' THEN 'CALIFICACIONES' WHEN 'TARJETA_TERCERO' THEN 'TARJETAS'
      WHEN 'REFERIDO' THEN 'REFERIDOS' ELSE 'EVIDENCIAS' END)::varchar,'CONSULTAR');
  ELSE
    v_contexto := public.f_private_compensacion_contexto('EVIDENCIAS', 'CONSULTAR');
  END IF;
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  WITH base AS (
    SELECT
      ev.*,
      te.codigo AS tipo_codigo,
      te.nombre AS tipo_nombre,
      te.categoria,
      co.codigo AS concepto_codigo,
      co.nombre AS concepto_nombre,
      cb.nombre_completo AS beneficiario_nombre,
      cb.numero_documento AS beneficiario_documento,
      cr.nombre_completo AS responsable_nombre,
      so.nombre AS sucursal_origen_nombre,
      sr.nombre AS sucursal_responsable_nombre,
      ur.nombre AS usuario_registra_nombre,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(ref) ORDER BY ref.id)
        FROM public.tb_compensacion_evento_referencia ref
        WHERE ref.id_evento = ev.id
      ), '[]'::jsonb) AS referencias,
      COALESCE((
        SELECT jsonb_agg(
          to_jsonb(rev) || jsonb_build_object('usuario_revisor_nombre', uv.nombre)
          ORDER BY rev.numero_paso
        )
        FROM public.tb_compensacion_evento_revision rev
        JOIN public.tb_usuario uv ON uv.id = rev.id_usuario_revisor
        WHERE rev.id_evento = ev.id
      ), '[]'::jsonb) AS revisiones
    FROM public.tb_compensacion_evento ev
    JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
    LEFT JOIN public.tb_compensacion_concepto co ON co.id = te.id_concepto
    LEFT JOIN public.tb_compensacion_colaborador cb ON cb.id = ev.id_colaborador_beneficiario
    LEFT JOIN public.tb_compensacion_colaborador cr ON cr.id = ev.id_colaborador_responsable
    LEFT JOIN public.tb_sucursal so ON so.id = ev.id_sucursal_origen
    LEFT JOIN public.tb_sucursal sr ON sr.id = ev.id_sucursal_responsable
    JOIN public.tb_usuario ur ON ur.id = ev.id_usuario_registra
    WHERE (public.f_private_compensacion_equipo_visible(v_contexto,coalesce(ev.id_colaborador_beneficiario,ev.id_colaborador_responsable),(ev.fecha_evento AT TIME ZONE 'America/Lima')::date) OR coalesce((v_contexto->>'id_colaborador')::bigint IN(ev.id_colaborador_beneficiario,ev.id_colaborador_responsable),false))
      AND te.categoria IN ('CALIFICACION', 'LLAMADA', 'TARJETA_TERCERO', 'REFERIDO', 'OTRO')
      AND (te.codigo<>'PROPUESTA_INNOVACION' OR COALESCE((v_contexto->>'es_super_admin')::boolean,false)
        OR ev.id_colaborador_beneficiario=v_id_colaborador_actor)
      AND (p_id IS NULL OR ev.id = p_id)
      AND (p_id_tipo_evento IS NULL OR ev.id_tipo_evento = p_id_tipo_evento)
      AND (p_categoria IS NULL OR te.categoria = UPPER(TRIM(p_categoria)))
      AND ((p_estado_evento IS NULL AND ev.estado_evento <> 'ANULADO') OR ev.estado_evento = UPPER(TRIM(p_estado_evento)))
      AND (
        p_id_colaborador IS NULL
        OR ev.id_colaborador_beneficiario = p_id_colaborador
        OR ev.id_colaborador_responsable = p_id_colaborador
      )
      AND (
        p_id_sucursal IS NULL
        OR ev.id_sucursal_origen = p_id_sucursal
        OR ev.id_sucursal_responsable = p_id_sucursal
      )
      AND (p_fecha_desde IS NULL OR (ev.fecha_evento AT TIME ZONE 'America/Lima')::date >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR (ev.fecha_evento AT TIME ZONE 'America/Lima')::date <= p_fecha_hasta)
      AND (
        p_busqueda IS NULL
        OR te.nombre ILIKE '%' || TRIM(p_busqueda) || '%'
        OR ev.titulo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR ev.descripcion ILIKE '%' || TRIM(p_busqueda) || '%'
        OR CASE WHEN te.categoria IN ('LLAMADA', 'TARJETA_TERCERO') THEN (ev.datos->>'cliente_documento') = btrim(p_busqueda) ELSE ev.datos->>'cliente_documento' ILIKE '%' || TRIM(p_busqueda) || '%' END
        OR ev.datos->>'cliente_nombre' ILIKE '%' || TRIM(p_busqueda) || '%'
        OR cb.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR CASE WHEN te.categoria IN ('LLAMADA', 'TARJETA_TERCERO') THEN (cb.numero_documento) = btrim(p_busqueda) ELSE cb.numero_documento ILIKE '%' || TRIM(p_busqueda) || '%' END
        OR (te.categoria='LLAMADA' AND (ur.nombre ILIKE '%' || TRIM(p_busqueda) || '%' OR ur.username ILIKE '%' || TRIM(p_busqueda) || '%'))
      )
      AND (NULLIF(btrim(p_documento_cliente),'') IS NULL OR ev.datos->>'cliente_documento' = btrim(p_documento_cliente))
      AND (NULLIF(btrim(p_nombre_cliente),'') IS NULL OR ev.datos->>'cliente_nombre' ILIKE '%' || btrim(p_nombre_cliente) || '%')
      AND (NULLIF(btrim(p_colaborador),'') IS NULL OR cb.nombre_completo ILIKE '%' || btrim(p_colaborador) || '%' OR cb.numero_documento = btrim(p_colaborador))
      AND (
        v_alcance = 'GLOBAL'
        OR (
          v_alcance = 'PROPIO'
          AND v_id_colaborador_actor IN (
            ev.id_colaborador_beneficiario,
            ev.id_colaborador_responsable
          )
        )
        OR (
          v_alcance = 'SEDE'
          AND (
            v_id_sucursal_alcance IN (
              ev.id_sucursal_origen,
              ev.id_sucursal_responsable
            )
            OR EXISTS (
              SELECT 1
              FROM public.tb_compensacion_asignacion a
              WHERE a.id_colaborador IN (
                  ev.id_colaborador_beneficiario,
                  ev.id_colaborador_responsable
                )
                AND a.id_sucursal = v_id_sucursal_alcance
                AND a.fecha_inicio <= ev.fecha_evento::date
                AND (a.fecha_fin IS NULL OR a.fecha_fin >= ev.fecha_evento::date)
            )
          )
        )
      )
  ), conteo AS (
    SELECT COUNT(*) AS total FROM base
  ), resumen AS (
    SELECT jsonb_build_object(
      'borradores', COUNT(*) FILTER (WHERE estado_evento = 'BORRADOR'),
      'pendientes', COUNT(*) FILTER (WHERE estado_evento = 'PENDIENTE'),
      'aprobados', COUNT(*) FILTER (WHERE estado_evento = 'APROBADO'),
      'rechazados', COUNT(*) FILTER (WHERE estado_evento = 'RECHAZADO'),
      'anulados', COUNT(*) FILTER (WHERE estado_evento = 'ANULADO'),
      'importe_aprobado', COALESCE(SUM(importe_aprobado) FILTER (
        WHERE estado_evento IN ('APROBADO', 'LIQUIDADO')
          AND (tipo_codigo<>'PROPUESTA_INNOVACION' OR public.f_private_compensacion_innovacion_comprobada(id))
      ), 0)
    ) AS datos
    FROM base
  ), pagina AS (
    SELECT * FROM base
    ORDER BY fecha_evento DESC, id DESC
    LIMIT v_tamano OFFSET (v_pagina - 1) * v_tamano
  )
  SELECT conteo.total, resumen.datos,
         COALESCE(
           jsonb_agg((to_jsonb(pagina) || CASE WHEN pagina.tipo_codigo='PROPUESTA_INNOVACION'
             AND NOT public.f_private_compensacion_innovacion_comprobada(pagina.id)
             THEN jsonb_build_object('importe_aprobado',NULL) ELSE '{}'::jsonb END)
             ORDER BY pagina.fecha_evento DESC, pagina.id DESC)
             FILTER (WHERE pagina.id IS NOT NULL),
           '[]'::jsonb
         )
  INTO v_total, v_resumen, v_items
  FROM conteo
  CROSS JOIN resumen
  LEFT JOIN pagina ON true
  GROUP BY conteo.total, resumen.datos;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'resumen', COALESCE(v_resumen, '{}'::jsonb),
    'total', COALESCE(v_total, 0),
    'pagina', v_pagina,
    'tamano_pagina', v_tamano,
    'total_paginas', CASE
      WHEN COALESCE(v_total, 0) = 0 THEN 0
      ELSE CEIL(v_total::numeric / v_tamano)::integer
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_marketing(p_tipo text, p_mes date, p_buscar text DEFAULT ''::text, p_estado text DEFAULT ''::text, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; admin boolean; actor bigint; col bigint; resultado jsonb;
BEGIN
 IF p_tipo IS NULL OR p_tipo NOT IN('VIDEO_VIRAL','RECUPERACION_CLIENTE','ALERTA_TEMPRANA') OR p_mes IS NULL OR p_pagina IS NULL OR p_pagina<1 OR p_tamano IS NULL OR p_tamano NOT IN(20,50,100)
 OR coalesce(p_estado,'') NOT IN('','BORRADOR','PENDIENTE','APROBADO','RECHAZADO','ANULADO','LIQUIDADO') THEN RAISE EXCEPTION 'Consulta invalida'; END IF;
 ctx:=public.f_private_compensacion_contexto('BONO:'||p_tipo,'CONSULTAR');admin:=coalesce((ctx->>'es_super_admin')::boolean,false);actor:=(ctx->>'id_usuario')::bigint;col:=(ctx->>'id_colaborador')::bigint;
 WITH casos AS MATERIALIZED(SELECT e.* FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento AND t.codigo=p_tipo
 WHERE public.f_private_compensacion_marketing_visible(e.id,ctx) AND e.datos->>'flujo'='MARKETING_CAPTURA_V1' AND e.periodo_imputacion=date_trunc('month',p_mes)::date),
 filtrados AS(SELECT e.* FROM casos e WHERE (coalesce(p_estado,'')='' OR e.estado_evento=p_estado) AND (coalesce(btrim(p_buscar),'')='' OR strpos(lower(e.titulo||' '||coalesce(e.descripcion,'')||' '||coalesce(e.datos#>>'{captura,dni}','')),lower(btrim(p_buscar)))>0)),
 pagina AS(SELECT * FROM filtrados ORDER BY fecha_evento DESC,id DESC LIMIT p_tamano OFFSET (p_pagina::bigint-1)*p_tamano)
 SELECT jsonb_build_object('es_admin',admin,'es_revisor',admin OR ctx->>'alcance'='SEDE','puede_registrar',NOT admin AND ctx->>'alcance'='PROPIO','id_colaborador',col,'total',(SELECT count(*) FROM filtrados),'total_paginas',(SELECT greatest(1,ceil(count(*)::numeric/p_tamano)) FROM filtrados),
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'fecha',e.fecha_evento,'titulo',e.titulo,'descripcion',e.descripcion,'estado',e.estado_evento,'importe',e.importe_aprobado,
 'captura',e.datos->'captura','evidencia',e.evidencia->0->>'url','usuario',c.nombre_completo,'responsable',r.nombre_completo,
 'id_colaborador_responsable',e.id_colaborador_responsable,'vinculo_penalidad',CASE WHEN t.codigo='ALERTA_TEMPRANA' THEN jsonb_build_object('importe_bono',e.importe_aprobado,'id_colaborador_responsable',e.id_colaborador_responsable,'asesor_responsable',r.nombre_completo,'id_penalidad_tipo',nullif(e.datos#>>'{revision_marketing,id_penalidad_tipo}','')::bigint,'codigo_penalidad',e.datos#>>'{revision_marketing,codigo_penalidad}','nombre_penalidad',(SELECT pt.nombre FROM public.tb_compensacion_penalidad_tipo pt WHERE pt.id=nullif(e.datos#>>'{revision_marketing,id_penalidad_tipo}','')::bigint),'importe_descuento',nullif(e.datos#>>'{revision_marketing,importe_descuento}','')::numeric,'penalidad_propia_previa',CASE WHEN e.estado_evento IN('APROBADO','LIQUIDADO') THEN public.f_private_compensacion_marketing_alerta_cubierta(e.id) END) END,
 'puede_editar',NOT admin AND e.id_usuario_registra=actor AND e.estado_evento IN('BORRADOR','PENDIENTE') AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_revision jr WHERE jr.id_evento=e.id AND jr.etapa='JEFE_TIENDA'),
 'validacion',(SELECT jr.decision FROM public.tb_compensacion_evento_revision jr WHERE jr.id_evento=e.id AND jr.etapa='JEFE_TIENDA' ORDER BY jr.numero_paso DESC LIMIT 1),
 'operacion',e.datos#>>'{fuente_operacion,codigo}','dias_inactivo',(e.datos#>>'{fuente_operacion,dias_inactivo}')::integer,'puede_revisar',(admin OR ctx->>'alcance'='SEDE') AND e.id_usuario_registra<>actor AND e.estado_evento='PENDIENTE' AND (t.codigo<>'RECUPERACION_CLIENTE' OR admin) AND (t.codigo<>'ALERTA_TEMPRANA' OR (admin AND EXISTS(SELECT 1 FROM public.tb_compensacion_evento_revision jr WHERE jr.id_evento=e.id AND jr.etapa='JEFE_TIENDA' AND jr.decision='APROBADO'))) AND (e.id_colaborador_responsable IS NULL OR col IS DISTINCT FROM e.id_colaborador_responsable) AND col IS DISTINCT FROM e.id_colaborador_beneficiario,
 'puede_anular',admin AND e.id_usuario_registra<>actor AND e.estado_evento='APROBADO' AND NOT public.f_private_compensacion_marketing_consolidado(e.id),
 'estado_calculo',CASE WHEN public.f_private_compensacion_marketing_consolidado(e.id) THEN 'CONSOLIDADO' WHEN e.estado_evento IN('APROBADO','LIQUIDADO') THEN CASE WHEN public.f_private_compensacion_marketing_evento_vigente(e.id) THEN 'HABILITADO' ELSE 'EN_REVISION' END ELSE 'PENDIENTE' END,
 'motivo_calculo',CASE WHEN public.f_private_compensacion_marketing_consolidado(e.id) THEN 'Importe historico conservado; correcciones mediante ajuste autorizado' WHEN e.estado_evento='APROBADO' AND NOT public.f_private_compensacion_marketing_evento_vigente(e.id) THEN 'La fuente cambio o no cumple las reglas; se requiere revision antes de consolidar' ELSE 'Sujeto a la revision y aprobacion del bono' END,
 'aviso_fecha',(SELECT min((rv.datos_decision->>'fecha')::timestamptz) FROM public.tb_compensacion_evento_revision rv WHERE rv.id_evento=e.id AND rv.etapa='AVISO_JEFATURA'),
 'resultado',(SELECT comentario FROM public.tb_compensacion_evento_revision WHERE id_evento=e.id AND decision IN('APROBADO','RECHAZADO') ORDER BY numero_paso DESC LIMIT 1)) ORDER BY e.fecha_evento DESC,e.id DESC)
 FROM pagina e JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento LEFT JOIN public.tb_compensacion_colaborador c ON c.id=e.id_colaborador_beneficiario LEFT JOIN public.tb_compensacion_colaborador r ON r.id=e.id_colaborador_responsable),'[]'),
 'campanas',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'fecha_inicio',fecha_inicio,'fecha_registro',fecha_registro) ORDER BY id DESC) FROM public.tb_compensacion_marketing_campana WHERE admin OR (ctx->>'alcance'='PROPIO' AND id_colaborador=col)),'[]'),
 'responsables',CASE WHEN p_tipo='ALERTA_TEMPRANA' AND NOT admin AND ctx->>'alcance'='PROPIO' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'nombre',c.nombre_completo,'sede',s.nombre) ORDER BY c.nombre_completo)
 FROM public.tb_compensacion_colaborador c JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=4 JOIN public.tb_estado ec ON ec.id=c.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
 JOIN public.tb_sucursal s ON s.id=u.id_sucursal WHERE c.id<>col),'[]') ELSE '[]'::jsonb END,
 'kpis',jsonb_build_object('pendientes',(SELECT count(*) FROM casos WHERE estado_evento='PENDIENTE'),'aprobados',(SELECT count(*) FROM casos WHERE estado_evento IN('APROBADO','LIQUIDADO')),'rechazados',(SELECT count(*) FROM casos WHERE estado_evento='RECHAZADO')))
 INTO resultado;
 RETURN resultado;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_marketing_alertas_validacion()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb;
BEGIN
 ctx:=public.f_private_compensacion_contexto('BONO:ALERTA_TEMPRANA','CONSULTAR');
 IF coalesce((ctx->>'es_super_admin')::boolean,false) OR ctx->>'alcance' IS DISTINCT FROM 'SEDE' THEN RAISE EXCEPTION 'Validacion exclusiva de la Jefatura de la sede'; END IF;
 RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(x.item ORDER BY x.fecha DESC,x.id DESC) FROM (
  SELECT e.id,e.fecha_evento fecha,jsonb_build_object('id',e.id,'fecha',e.fecha_evento,'titulo',e.titulo,'descripcion',e.descripcion,'estado',e.estado_evento,
   'beneficiario',b.nombre_completo,'responsable',r.nombre_completo,'motivo',e.datos#>>'{captura,motivo_tipo}','conversacion',e.datos#>>'{captura,conversacion}',
   'operacion',e.datos#>>'{fuente_operacion,codigo}','evidencia',e.evidencia->0->>'url',
   'decision',(SELECT jr.decision FROM public.tb_compensacion_evento_revision jr WHERE jr.id_evento=e.id AND jr.etapa='JEFE_TIENDA' ORDER BY jr.numero_paso DESC LIMIT 1)) item
  FROM public.tb_compensacion_evento e
  JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento AND t.codigo='ALERTA_TEMPRANA'
  LEFT JOIN public.tb_compensacion_colaborador b ON b.id=e.id_colaborador_beneficiario
  LEFT JOIN public.tb_compensacion_colaborador r ON r.id=e.id_colaborador_responsable
  WHERE e.datos->>'flujo'='MARKETING_CAPTURA_V1' AND e.estado_evento NOT IN('BORRADOR','ANULADO')
   AND e.id_sucursal_origen=(ctx->>'id_sucursal_alcance')::bigint
   AND (e.estado_evento='PENDIENTE' OR EXISTS(SELECT 1 FROM public.tb_compensacion_evento_revision jr WHERE jr.id_evento=e.id AND jr.etapa='JEFE_TIENDA'))
   AND public.f_private_compensacion_marketing_visible(e.id,ctx)
  ORDER BY e.fecha_evento DESC,e.id DESC LIMIT 100) x),'[]'::jsonb));
END; $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_marketing_operaciones(p_dni text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
 PERFORM public.f_private_compensacion_contexto('BONO:RECUPERACION_CLIENTE','CONSULTAR');
 IF p_dni IS NULL OR p_dni !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'Ingresa un DNI de ocho digitos'; END IF;
 RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(d ORDER BY (d->>'fecha_pago')::timestamptz DESC,(d->>'id')::bigint DESC)
 FROM (SELECT d||public.f_private_compensacion_marketing_inactividad(o.id) d FROM public.tb_operacion_proceso o JOIN public.tb_cliente c ON c.id=o.id_cliente AND c.numero_documento=p_dni
 CROSS JOIN LATERAL public.f_private_compensacion_marketing_operacion(o.id,p_dni) d WHERE d->>'pagada'='true'
 ORDER BY (d->>'fecha_pago')::timestamptz DESC,o.id DESC LIMIT 50) s),'[]'));
END; $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_mes_ranking(p_mes date, p_criterio text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN PERFORM public.f_private_compensacion_pancake_actor();
 RETURN public.f_private_compensacion_mes_ranking(p_mes,p_criterio); END $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_meta_sede_revisiones(p_mes date, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; usuario bigint; resultado jsonb;
BEGIN
  usuario:=public.f_private_compensacion_safetypay_usuario();
  IF NOT EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=usuario AND id_rol=3) THEN
    RAISE EXCEPTION 'El resultado de revision corresponde a Jefatura'; END IF;
  ctx:=public.f_private_compensacion_contexto('BONO:META_SEDE_SAFETYPAY','CONSULTAR');
  IF p_mes IS NULL OR p_pagina IS NULL OR p_pagina<1 OR p_tamano IS NULL OR p_tamano NOT IN(20,50,100) THEN
    RAISE EXCEPTION 'Mes o paginacion invalida'; END IF;
  WITH propias AS MATERIALIZED (
    SELECT ev.id,ev.estado_evento estado,ev.descripcion motivo,ev.fecha_registro fecha_solicitud,
      ev.importe_aprobado,rev.comentario respuesta,rev.decision,rev.fecha_revision fecha_respuesta,u.nombre revisor
    FROM public.tb_compensacion_evento ev
    JOIN public.tb_compensacion_evento_tipo t ON t.id=ev.id_tipo_evento AND t.codigo='META_SEDE_SAFETYPAY'
    LEFT JOIN LATERAL(SELECT r.* FROM public.tb_compensacion_evento_revision r
      WHERE r.id_evento=ev.id AND r.decision IN('APROBADO','RECHAZADO','OBSERVADO','ANULADO')
      ORDER BY r.numero_paso DESC,r.id DESC LIMIT 1) rev ON true
    LEFT JOIN public.tb_usuario u ON u.id=rev.id_usuario_revisor
    WHERE ev.id_colaborador_beneficiario=(ctx->>'id_colaborador')::bigint
      AND ev.periodo_imputacion=date_trunc('month',p_mes)::date
  ), pagina AS(SELECT * FROM propias ORDER BY fecha_solicitud DESC,id DESC LIMIT p_tamano OFFSET (p_pagina::bigint-1)*p_tamano)
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY fecha_solicitud DESC,id DESC) FROM pagina p),'[]'::jsonb),
    'total',(SELECT count(*) FROM propias),'pagina',p_pagina,'tamano',p_tamano) INTO resultado;
  RETURN resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_mis_bonos_descuentos(p_mes date, p_vista text DEFAULT 'SEGUIMIENTO'::text, p_tipo text DEFAULT NULL::text, p_concepto text DEFAULT NULL::text, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
 SELECT public.f_get_compensacion_mis_bonos_descuentos(p_mes,p_vista,p_tipo,p_concepto,p_pagina,p_tamano,
   NULL::text,NULL::date,NULL::date,NULL::text);
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_mis_bonos_descuentos(p_mes date, p_vista text, p_tipo text, p_concepto text, p_pagina integer, p_tamano integer, p_estado text, p_desde date, p_hasta date, p_criterio text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE datos jsonb; resultado jsonb; disponible boolean;
BEGIN
 IF p_pagina IS NULL OR p_pagina<1 OR p_tamano IS NULL OR p_tamano NOT IN(20,50,100)
   OR (p_tipo IS NOT NULL AND p_tipo NOT IN('BONO','COMISION','DESCUENTO')) THEN RAISE EXCEPTION 'Filtro o paginacion invalida'; END IF;
 datos:=public.f_private_compensacion_dashboard_filtrar(
   public.f_private_compensacion_mis_bonos_datos(p_mes,p_vista),p_mes,p_estado,p_desde,p_hasta,p_criterio);
 disponible:=(datos->>'periodo_disponible')::boolean AND (p_vista='SEGUIMIENTO' OR (datos->>'liquidacion_disponible')::boolean);
 IF p_concepto IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.f_private_compensacion_mis_bonos_catalogo((datos->>'perfil_rol')::bigint) WHERE codigo=p_concepto)
 THEN RAISE EXCEPTION 'Concepto invalido'; END IF;
 WITH filas AS (
   SELECT ca.codigo,ca.concepto,ca.tipo,coalesce(sum((r->>'cantidad')::numeric) FILTER(WHERE NOT (r->>'pendiente')::boolean),0) cantidad,
     count(*) FILTER(WHERE (r->>'pendiente')::boolean) pendientes,
     CASE WHEN (datos->>'periodo_disponible')::boolean AND (p_vista='SEGUIMIENTO' OR (datos->>'liquidacion_disponible')::boolean)
       THEN CASE WHEN count(*) FILTER(WHERE (r->>'pendiente')::boolean)>0 AND count(*) FILTER(WHERE NOT (r->>'pendiente')::boolean)=0 THEN NULL ELSE coalesce(sum((r->>'importe')::numeric) FILTER(WHERE NOT (r->>'pendiente')::boolean),0) END END importe
   FROM public.f_private_compensacion_mis_bonos_catalogo((datos->>'perfil_rol')::bigint) ca LEFT JOIN jsonb_array_elements(datos->'registros') r ON r->>'codigo'=ca.codigo
   WHERE (p_tipo IS NULL OR ca.tipo=p_tipo) AND (p_concepto IS NULL OR ca.codigo=p_concepto)
     AND (p_criterio IS NULL OR ca.codigo='BONO_COLABORADOR_MES')
     AND ((p_estado IS NULL AND p_desde IS NULL AND p_hasta IS NULL AND p_criterio IS NULL) OR r IS NOT NULL)
   GROUP BY ca.codigo,ca.concepto,ca.tipo
 ), pagina AS(SELECT * FROM filas ORDER BY tipo,codigo LIMIT p_tamano OFFSET (p_pagina::bigint-1)*p_tamano)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY tipo,codigo) FROM pagina p),'[]'),
   'total',(SELECT count(*) FROM filas),'pagina',p_pagina,'tamano_pagina',p_tamano,
   'total_paginas',ceil((SELECT count(*) FROM filas)::numeric/p_tamano),
   'conceptos',(SELECT jsonb_agg(jsonb_build_object('codigo',codigo,'concepto',concepto,'tipo',tipo) ORDER BY concepto) FROM public.f_private_compensacion_mis_bonos_catalogo((datos->>'perfil_rol')::bigint)),
   'kpis',(SELECT jsonb_build_object('bonos',CASE WHEN disponible THEN coalesce(sum(importe) FILTER(WHERE tipo='BONO'),0) END,'comisiones',CASE WHEN disponible THEN coalesce(sum(importe) FILTER(WHERE tipo='COMISION'),0) END,
     'descuentos',CASE WHEN disponible THEN coalesce(sum(importe) FILTER(WHERE tipo='DESCUENTO'),0) END,'neto',CASE WHEN disponible THEN coalesce(sum(CASE WHEN tipo='DESCUENTO' THEN -importe ELSE importe END),0) END,'pendientes',coalesce(sum(pendientes),0)) FROM filas)) INTO resultado;
 RETURN (datos-ARRAY['registros','perfil_rol'])||resultado||jsonb_build_object('disponible',(datos->>'periodo_disponible')::boolean AND (p_vista='SEGUIMIENTO' OR (datos->>'liquidacion_disponible')::boolean),'aviso',CASE WHEN NOT (datos->>'periodo_disponible')::boolean THEN 'No existe un periodo configurado para este mes.' WHEN p_vista='LIQUIDADO' AND NOT (datos->>'liquidacion_disponible')::boolean THEN 'Aún no existe una liquidación vigente aprobada para este periodo.' WHEN p_vista='SEGUIMIENTO' AND coalesce((datos->>'seguimiento_consolidado')::boolean,false) THEN
 'Periodo consolidado: se conservan los importes aprobados. Cambios posteriores requieren revision y ajuste autorizado; no se recalcula el pago.'
 WHEN p_vista='SEGUIMIENTO' THEN 'Importes provisionales del motor de preliquidación. Los registros pendientes no generan importes; esta vista no acredita un pago.' || CASE WHEN jsonb_array_length(coalesce(datos->'advertencias','[]'))>0 THEN ' El motor tiene observaciones: '||(SELECT string_agg(b->>'mensaje','; ') FROM jsonb_array_elements(datos->'advertencias') b) ELSE '' END END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_mis_bonos_descuentos_detalle(p_mes date, p_vista text, p_concepto text, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
 SELECT public.f_get_compensacion_mis_bonos_descuentos_detalle(p_mes,p_vista,p_concepto,p_pagina,p_tamano,
   NULL::text,NULL::date,NULL::date,NULL::text);
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_mis_bonos_descuentos_detalle(p_mes date, p_vista text, p_concepto text, p_pagina integer, p_tamano integer, p_estado text, p_desde date, p_hasta date, p_criterio text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE datos jsonb; resultado jsonb; nombre text;
BEGIN
 IF p_pagina IS NULL OR p_pagina<1 OR p_tamano IS NULL OR p_tamano NOT IN(20,50,100) THEN RAISE EXCEPTION 'Paginacion invalida'; END IF;
 datos:=public.f_private_compensacion_dashboard_filtrar(
   public.f_private_compensacion_mis_bonos_datos(p_mes,p_vista),p_mes,p_estado,p_desde,p_hasta,p_criterio);
 SELECT concepto INTO nombre FROM public.f_private_compensacion_mis_bonos_catalogo((datos->>'perfil_rol')::bigint) WHERE codigo=p_concepto;
 IF nombre IS NULL THEN RAISE EXCEPTION 'Concepto invalido'; END IF;
 WITH filas AS(SELECT r||jsonb_build_object('id',r->>'clave') r FROM jsonb_array_elements(datos->'registros') r WHERE r->>'codigo'=p_concepto),
 pagina AS(SELECT r FROM filas ORDER BY r->>'fecha' DESC,r->>'clave' LIMIT p_tamano OFFSET (p_pagina::bigint-1)*p_tamano)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(r ORDER BY r->>'fecha' DESC,r->>'clave') FROM pagina),'[]'),
   'total',(SELECT count(*) FROM filas),'pagina',p_pagina,'tamano_pagina',p_tamano,'total_paginas',ceil((SELECT count(*) FROM filas)::numeric/p_tamano),
   'codigo',p_concepto,'concepto',nombre) INTO resultado;
 RETURN (datos-ARRAY['registros','perfil_rol'])||resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_mis_dashboard(p_mes date, p_vista text DEFAULT 'SEGUIMIENTO'::text, p_tipo text DEFAULT NULL::text, p_concepto text DEFAULT NULL::text, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20, p_estado text DEFAULT NULL::text, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_criterio text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE datos jsonb; resultado jsonb; disponible boolean;
BEGIN
  IF p_pagina IS NULL OR p_pagina < 1 OR p_tamano IS NULL OR p_tamano NOT IN (20, 50, 100)
     OR p_vista IS NULL OR p_vista NOT IN ('SEGUIMIENTO', 'LIQUIDADO')
     OR (p_tipo IS NOT NULL AND p_tipo NOT IN ('BONO', 'PENALIDAD')) THEN
    RAISE EXCEPTION 'Filtro o paginacion invalida';
  END IF;
  datos := public.f_private_compensacion_dashboard_filtrar(
    public.f_private_compensacion_mis_bonos_datos(p_mes, p_vista), p_mes, p_estado, p_desde, p_hasta, p_criterio);
  disponible := (datos->>'periodo_disponible')::boolean AND (p_vista = 'SEGUIMIENTO' OR (datos->>'liquidacion_disponible')::boolean);
  IF p_concepto IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.f_private_compensacion_mis_bonos_catalogo((datos->>'perfil_rol')::bigint) WHERE codigo = p_concepto
  ) THEN RAISE EXCEPTION 'Concepto invalido'; END IF;

  WITH filas AS (
    SELECT r || jsonb_build_object(
             'id', r->>'clave',
             'concepto_codigo', ca.codigo,
             'concepto_nombre', ca.concepto,
             'tipo_servidor', ca.tipo,
             'tipo', CASE WHEN ca.tipo = 'DESCUENTO' THEN 'PENALIDAD' ELSE 'BONO' END
           ) AS r
    FROM jsonb_array_elements(datos->'registros') r
    JOIN public.f_private_compensacion_mis_bonos_catalogo((datos->>'perfil_rol')::bigint) ca ON ca.codigo = r->>'codigo'
    WHERE disponible
      AND (p_concepto IS NULL OR ca.codigo = p_concepto)
      AND (p_tipo IS NULL OR (p_tipo = 'PENALIDAD' AND ca.tipo = 'DESCUENTO') OR (p_tipo = 'BONO' AND ca.tipo IN ('BONO', 'COMISION')))
  ), pagina AS (
    SELECT r FROM filas ORDER BY r->>'fecha' DESC, r->>'clave' LIMIT p_tamano OFFSET (p_pagina::bigint - 1) * p_tamano
  ), por_concepto AS (
    -- Mismo agregado por concepto que f_get_compensacion_mis_bonos_descuentos, con el filtro de tipo Bono/Penalidad.
    SELECT ca.tipo,
           count(*) FILTER (WHERE (r->>'pendiente')::boolean) AS pendientes,
           CASE WHEN disponible THEN
             CASE WHEN count(*) FILTER (WHERE (r->>'pendiente')::boolean) > 0 AND count(*) FILTER (WHERE NOT (r->>'pendiente')::boolean) = 0 THEN NULL
                  ELSE coalesce(sum((r->>'importe')::numeric) FILTER (WHERE NOT (r->>'pendiente')::boolean), 0) END
           END AS importe
    FROM public.f_private_compensacion_mis_bonos_catalogo((datos->>'perfil_rol')::bigint) ca
    LEFT JOIN jsonb_array_elements(datos->'registros') r ON r->>'codigo' = ca.codigo
    WHERE (p_tipo IS NULL OR (p_tipo = 'PENALIDAD' AND ca.tipo = 'DESCUENTO') OR (p_tipo = 'BONO' AND ca.tipo IN ('BONO', 'COMISION')))
      AND (p_concepto IS NULL OR ca.codigo = p_concepto)
      AND (p_criterio IS NULL OR ca.codigo = 'BONO_COLABORADOR_MES')
      AND ((p_estado IS NULL AND p_desde IS NULL AND p_hasta IS NULL AND p_criterio IS NULL) OR r IS NOT NULL)
    GROUP BY ca.codigo, ca.tipo
  )
  SELECT jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(r ORDER BY r->>'fecha' DESC, r->>'clave') FROM pagina), '[]'::jsonb),
    'total', (SELECT count(*) FROM filas),
    'pagina', p_pagina,
    'tamano_pagina', p_tamano,
    'total_paginas', ceil((SELECT count(*) FROM filas)::numeric / p_tamano),
    'disponible', disponible,
    'conceptos', (SELECT jsonb_agg(jsonb_build_object('codigo', codigo, 'concepto', concepto, 'tipo', tipo) ORDER BY concepto)
                  FROM public.f_private_compensacion_mis_bonos_catalogo((datos->>'perfil_rol')::bigint)
                  WHERE codigo <> 'PENALIDAD_TARDANZA'),
    'kpis', (SELECT jsonb_build_object(
               'bonos', CASE WHEN disponible THEN coalesce(sum(importe) FILTER (WHERE tipo = 'BONO'), 0) END,
               'comisiones', CASE WHEN disponible THEN coalesce(sum(importe) FILTER (WHERE tipo = 'COMISION'), 0) END,
               'descuentos', CASE WHEN disponible THEN coalesce(sum(importe) FILTER (WHERE tipo = 'DESCUENTO'), 0) END,
               'neto', CASE WHEN disponible THEN coalesce(sum(CASE WHEN tipo = 'DESCUENTO' THEN -importe ELSE importe END), 0) END,
               'pendientes', coalesce(sum(pendientes), 0))
             FROM por_concepto),
    'aviso', CASE
      WHEN NOT (datos->>'periodo_disponible')::boolean THEN 'No existe un periodo configurado para este mes.'
      WHEN p_vista = 'LIQUIDADO' AND NOT (datos->>'liquidacion_disponible')::boolean THEN 'Aún no existe una liquidación vigente aprobada para este periodo.'
      WHEN p_vista = 'SEGUIMIENTO' AND coalesce((datos->>'seguimiento_consolidado')::boolean, false) THEN
        'Periodo consolidado: se conservan los importes aprobados. Cambios posteriores requieren revision y ajuste autorizado; no se recalcula el pago.'
      WHEN p_vista = 'SEGUIMIENTO' THEN
        'Importes provisionales del motor de preliquidación. Los registros pendientes no generan importes; esta vista no acredita un pago.'
        || CASE WHEN jsonb_array_length(coalesce(datos->'advertencias', '[]')) > 0
                THEN ' El motor tiene observaciones: ' || (SELECT string_agg(b->>'mensaje', '; ') FROM jsonb_array_elements(datos->'advertencias') b)
                ELSE '' END
    END
  ) INTO resultado;
  RETURN (datos - ARRAY['registros', 'perfil_rol']) || resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_mis_expedientes(p_mes date, p_estado text DEFAULT NULL::text, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; col bigint; resultado jsonb;
BEGIN
 ctx:=public.f_private_compensacion_contexto('RESUMEN','CONSULTAR');col:=(ctx->>'id_colaborador')::bigint;
 IF col IS NULL OR NOT EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=(ctx->>'id_usuario')::bigint AND id_rol=3 AND NOT coalesce(flag_super_admin,false)) THEN RAISE EXCEPTION 'Consulta personal exclusiva de Jefatura'; END IF;
 IF p_mes IS NULL OR p_pagina IS NULL OR p_tamano IS NULL OR p_pagina<1 OR p_tamano NOT IN(20,50,100)
   OR p_estado IS NOT NULL AND p_estado NOT IN('PENDIENTE','APROBADO','RECHAZADO','OBSERVADO','ANULADO','LIQUIDADO') THEN RAISE EXCEPTION 'Filtros de expediente invalidos'; END IF;
 WITH propios AS (
   SELECT e.id,e.titulo,e.descripcion motivo,e.fecha_evento fecha,e.estado_evento estado,e.importe_aprobado importe,
     coalesce(o.titulo,e.titulo) origen,CASE WHEN v.tipo_consecuencia='COMISION_JEFE' THEN coalesce((SELECT nombre FROM public.tb_compensacion_concepto WHERE id=pt.id_concepto_bono_reportante),co.nombre,'Comisión de Auditoría Activa') ELSE coalesce(pt.nombre,co.nombre,e.titulo) END concepto,
     CASE WHEN v.tipo_consecuencia='COMISION_JEFE' THEN 'Comisión' ELSE 'Penalidad' END tipo
   FROM public.tb_compensacion_evento e
   LEFT JOIN public.tb_compensacion_caza_errores_vinculo v ON v.id_evento_consecuencia=e.id
   LEFT JOIN public.tb_compensacion_evento o ON o.id=v.id_evento_origen
   LEFT JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id=e.id_penalidad_tipo
   LEFT JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
   LEFT JOIN public.tb_compensacion_concepto co ON co.id=t.id_concepto
   WHERE e.periodo_imputacion=date_trunc('month',p_mes)::date AND e.estado_evento<>'BORRADOR'
    AND (p_estado IS NULL OR e.estado_evento=p_estado)
    AND CASE WHEN v.tipo_consecuencia='COMISION_JEFE' THEN e.id_colaborador_beneficiario=col ELSE e.id_penalidad_tipo IS NOT NULL AND e.id_colaborador_responsable=col END
 ), pagina AS(SELECT * FROM propios ORDER BY fecha DESC,id DESC LIMIT p_tamano OFFSET (p_pagina::bigint-1)*p_tamano)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM propios),'items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY fecha DESC,id DESC) FROM pagina p),'[]')) INTO resultado;
 RETURN resultado;
END $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_mis_registros(p_mes date, p_vista text DEFAULT 'SEGUIMIENTO'::text, p_tipo text DEFAULT NULL::text, p_concepto text DEFAULT NULL::text, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20, p_estado text DEFAULT NULL::text, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_criterio text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE datos jsonb; resultado jsonb; disponible boolean;
BEGIN
  IF p_pagina IS NULL OR p_pagina < 1 OR p_tamano IS NULL OR p_tamano NOT IN (20, 50, 100)
     OR p_vista IS NULL OR p_vista NOT IN ('SEGUIMIENTO', 'LIQUIDADO')
     OR (p_tipo IS NOT NULL AND p_tipo NOT IN ('BONO', 'PENALIDAD')) THEN
    RAISE EXCEPTION 'Filtro o paginacion invalida';
  END IF;
  datos := public.f_private_compensacion_dashboard_filtrar(
    public.f_private_compensacion_mis_bonos_datos(p_mes, p_vista), p_mes, p_estado, p_desde, p_hasta, p_criterio);
  disponible := (datos->>'periodo_disponible')::boolean AND (p_vista = 'SEGUIMIENTO' OR (datos->>'liquidacion_disponible')::boolean);
  IF p_concepto IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.f_private_compensacion_mis_bonos_catalogo((datos->>'perfil_rol')::bigint) WHERE codigo = p_concepto
  ) THEN RAISE EXCEPTION 'Concepto invalido'; END IF;

  WITH filas AS (
    SELECT r || jsonb_build_object(
             'id', r->>'clave',
             'concepto_codigo', ca.codigo,
             'concepto_nombre', ca.concepto,
             'tipo_servidor', ca.tipo,
             'tipo', CASE WHEN ca.tipo = 'DESCUENTO' THEN 'PENALIDAD' ELSE 'BONO' END
           ) AS r
    FROM jsonb_array_elements(datos->'registros') r
    JOIN public.f_private_compensacion_mis_bonos_catalogo((datos->>'perfil_rol')::bigint) ca ON ca.codigo = r->>'codigo'
    WHERE disponible
      AND (p_concepto IS NULL OR ca.codigo = p_concepto)
      AND (p_tipo IS NULL OR (p_tipo = 'PENALIDAD' AND ca.tipo = 'DESCUENTO') OR (p_tipo = 'BONO' AND ca.tipo IN ('BONO', 'COMISION')))
  ), pagina AS (
    SELECT r FROM filas ORDER BY r->>'fecha' DESC, r->>'clave' LIMIT p_tamano OFFSET (p_pagina::bigint - 1) * p_tamano
  )
  SELECT jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(r ORDER BY r->>'fecha' DESC, r->>'clave') FROM pagina), '[]'::jsonb),
    'total', (SELECT count(*) FROM filas),
    'pagina', p_pagina,
    'tamano_pagina', p_tamano,
    'total_paginas', ceil((SELECT count(*) FROM filas)::numeric / p_tamano),
    'disponible', disponible
  ) INTO resultado;
  RETURN (datos - ARRAY['registros', 'perfil_rol']) || resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_montos_referencia()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE actor public.tb_usuario%ROWTYPE; col bigint; cargo bigint; resultado jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesion autenticada'; END IF;
 SELECT u.* INTO actor FROM public.tb_usuario u JOIN public.tb_estado e ON e.id=u.id_estado AND upper(btrim(e.nombre))='ACTIVO' WHERE u.auth_user_id=auth.uid() LIMIT 1;
 IF actor.id IS NULL THEN RAISE EXCEPTION 'El usuario autenticado no tiene un perfil operativo activo'; END IF;
 IF actor.id_rol IS DISTINCT FROM 2 THEN RETURN '{}'::jsonb; END IF;
 SELECT c.id INTO col FROM public.tb_compensacion_colaborador c JOIN public.tb_estado e ON e.id=c.id_estado AND upper(btrim(e.nombre))='ACTIVO' WHERE c.id_usuario=actor.id LIMIT 1;
 SELECT a.id_cargo INTO cargo FROM public.tb_compensacion_asignacion a JOIN public.tb_estado es ON es.id=a.id_estado AND upper(btrim(es.nombre))='ACTIVO'
  WHERE a.id_colaborador=col AND (now() AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)
  ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1;
 IF cargo IS NULL THEN RETURN '{}'::jsonb; END IF;
 SELECT coalesce(jsonb_object_agg(x.concepto,x.monto),'{}'::jsonb) INTO resultado FROM (
  SELECT 'PAG_'||substring(p.codigo FROM '(RETRASO_VOUCHER|CIERRE_INCOMPLETO|DESCUADRE|UNIFORME|INDISCIPLINA|ERROR_CUADRO|ERROR_PAGO_CRITICO)$') concepto, max(p.monto_referencia) monto
  FROM public.tb_compensacion_penalidad_tipo p JOIN public.tb_estado ep ON ep.id=p.id_estado AND upper(btrim(ep.nombre))='ACTIVO'
  WHERE p.id_cargo=cargo AND p.codigo LIKE 'PAG\_%' AND p.monto_referencia>0
   AND substring(p.codigo FROM '(RETRASO_VOUCHER|CIERRE_INCOMPLETO|DESCUADRE|UNIFORME|INDISCIPLINA|ERROR_CUADRO|ERROR_PAGO_CRITICO)$') IS NOT NULL
  GROUP BY 1) x;
 RETURN resultado;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_operaciones_cliente(p_documento text, p_codigo text DEFAULT NULL::text, p_limite integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; doc text:=btrim(coalesce(p_documento,'')); cod text:=nullif(btrim(coalesce(p_codigo,'')),''); lim integer:=least(greatest(coalesce(p_limite,20),1),50); cliente_id bigint; cliente_nombre text; items jsonb;
BEGIN
  ctx:=public.f_private_compensacion_contexto('INCIDENCIAS','REGISTRAR');
  IF (ctx->>'alcance') NOT IN('SEDE','GLOBAL') THEN RAISE EXCEPTION 'No tiene alcance para consultar operaciones de clientes'; END IF;
  IF doc !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'Ingresa un DNI de 8 digitos'; END IF;
  SELECT c.id,nullif(btrim(c.nombre),'') INTO cliente_id,cliente_nombre
  FROM public.tb_cliente c JOIN public.tb_estado e ON e.id=c.id_estado AND upper(btrim(e.nombre))='ACTIVO'
  WHERE c.numero_documento=doc ORDER BY c.id LIMIT 1;
  IF cliente_id IS NULL THEN RAISE EXCEPTION 'El DNI no pertenece a un cliente registrado y activo'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'tipo',x.tipo,'codigo',x.codigo,'monto',x.monto,'fecha',x.fecha,'estado',x.estado) ORDER BY x.fecha DESC,x.id DESC),'[]')
  INTO items FROM (
    SELECT o.id,
      CASE WHEN upper(regexp_replace(btrim(o.tipo_servicio),'[^a-zA-Z0-9]+','_','g'))='EFECTIVIZACION' THEN 'Efectivización' ELSE 'Pago de Deuda' END tipo,
      nullif(btrim(o.codigo_operacion_deposito_cliente),'') codigo,o.monto_deposito_cliente monto,
      coalesce(o.fecha_deposito_cliente,o.fecha_registro) fecha,nullif(btrim(o.nombre_estado),'') estado
    FROM public.tb_operacion_proceso o
    WHERE o.id_operacion_padre IS NULL AND btrim(o.dni_cliente)=doc
      AND upper(regexp_replace(btrim(o.tipo_servicio),'[^a-zA-Z0-9]+','_','g')) IN('EFECTIVIZACION','PAGO_DEUDA','PAGO_DE_DEUDA')
      AND (cod IS NULL OR o.codigo_operacion_deposito_cliente ILIKE '%'||cod||'%')
    ORDER BY coalesce(o.fecha_deposito_cliente,o.fecha_registro) DESC,o.id DESC LIMIT lim
  ) x;
  RETURN jsonb_build_object('documento',doc,'id_cliente',cliente_id,'cliente',cliente_nombre,'items',items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_pagos_actividad(p_periodo date, p_id_usuario bigint DEFAULT NULL::bigint, p_detalle_limite integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
 SET "TimeZone" TO 'America/Lima'
AS $function$
DECLARE ctx jsonb; admin boolean; jefe boolean:=false; propio_col bigint; propio_usr bigint; mes date; fin date; res jsonb;
BEGIN
 IF p_periodo IS NULL THEN RAISE EXCEPTION 'Periodo requerido'; END IF;
 IF p_detalle_limite IS NULL OR p_detalle_limite<1 OR p_detalle_limite>500 THEN RAISE EXCEPTION 'Limite de detalle invalido (1 a 500)'; END IF;
 ctx:=public.f_private_compensacion_contexto('RESUMEN','CONSULTAR');
 admin:=coalesce((ctx->>'es_super_admin')::boolean,false);
 propio_col:=(ctx->>'id_colaborador')::bigint; propio_usr:=(ctx->>'id_usuario')::bigint;
 IF NOT admin THEN
  jefe:=(public.f_private_compensacion_pagos_perfil(propio_col)->>'codigo')='JEFE_SUPERIOR_PAGOS';
  IF NOT jefe AND p_id_usuario IS NOT NULL AND p_id_usuario IS DISTINCT FROM propio_usr THEN
   RAISE EXCEPTION 'Consulta exclusiva de tu actividad'; END IF;
 END IF;
 mes:=date_trunc('month',p_periodo)::date; fin:=(mes+interval '1 month')::date;
 IF p_id_usuario IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tb_usuario u JOIN public.tb_compensacion_colaborador c ON c.id_usuario=u.id
   WHERE u.id=p_id_usuario AND u.id_rol=2) THEN RAISE EXCEPTION 'Selecciona un colaborador de Pagos'; END IF;

 WITH objetivo AS MATERIALIZED(
  SELECT c.id id_colaborador,u.id id_usuario,c.nombre_completo nombre,
   (SELECT ca.codigo FROM public.tb_compensacion_asignacion a JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo
     WHERE a.id_colaborador=c.id AND (now() AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)
     ORDER BY a.fecha_inicio DESC,a.id DESC LIMIT 1) cargo
  FROM public.tb_compensacion_colaborador c JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=2
  JOIN public.tb_estado ec ON ec.id=c.id_estado AND upper(btrim(ec.nombre))='ACTIVO'
  WHERE CASE WHEN p_id_usuario IS NOT NULL THEN u.id=p_id_usuario WHEN admin OR jefe THEN true ELSE u.id=propio_usr END),
 pagadas AS MATERIALIZED(
  SELECT o.id,coalesce(o.id_usuario_gestor,o.id_usuario) id_usuario,o.fecha_pagado,
   (o.fecha_pagado AT TIME ZONE 'America/Lima')::date dia,o.tipo_servicio servicio,
   coalesce(nullif(btrim(o.nombre_banco_empresa_cuenta_salida),''),'Sin banco') banco,
   coalesce(o.monto_transferencia_cliente,o.monto_deposito_cliente,0) monto,
   ch.fecha_cierre,o.fecha_pagado+interval '48 hours' limite
  FROM public.tb_operacion_proceso o
  LEFT JOIN public.tb_caja_operativa_cierre ch ON ch.id=coalesce(o.id_caja_cierre_salida,o.id_caja_cierre) AND ch.fecha_cierre>=o.fecha_pagado
  WHERE upper(btrim(o.nombre_estado))='PAGADO' AND o.fecha_pagado IS NOT NULL
   AND o.fecha_pagado>=(mes::timestamp AT TIME ZONE 'America/Lima') AND o.fecha_pagado<(fin::timestamp AT TIME ZONE 'America/Lima')
   AND coalesce(o.id_usuario_gestor,o.id_usuario) IN(SELECT id_usuario FROM objetivo)
   AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso h WHERE h.id_operacion_padre=o.id)
   AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada e WHERE e.id_operacion_proceso IN(o.id,coalesce(o.id_operacion_padre,o.id)))),
 pagadas_e AS(
  SELECT p.*,CASE WHEN p.fecha_cierre IS NOT NULL THEN CASE WHEN p.fecha_cierre<=p.limite THEN 'A_TIEMPO' ELSE 'TARDIO' END
    WHEN now()>p.limite THEN 'TARDIO' ELSE 'PENDIENTE' END cierre_estado FROM pagadas p),
 dias AS(
  SELECT id_usuario,dia,CASE WHEN bool_or(cierre_estado='TARDIO') THEN 'TARDIO' WHEN bool_or(cierre_estado='PENDIENTE') THEN 'PENDIENTE' ELSE 'A_TIEMPO' END estado
  FROM pagadas_e GROUP BY id_usuario,dia),
 derivaciones AS MATERIALIZED(
  SELECT o.id,o.id_usuario_deriva,coalesce(o.id_usuario_gestor,o.id_usuario_reasignado) id_destino,o.fecha_derivacion,o.tipo_servicio servicio,
   coalesce(nullif(btrim(o.nombre_banco_empresa_cuenta_salida),''),'Sin banco') banco,
   coalesce(o.monto_transferencia_cliente,o.monto_deposito_cliente,0) monto
  FROM public.tb_operacion_proceso o
  WHERE o.flag_derivado AND o.fecha_derivacion>=(mes::timestamp AT TIME ZONE 'America/Lima') AND o.fecha_derivacion<(fin::timestamp AT TIME ZONE 'America/Lima')
   AND (o.id_usuario_deriva IN(SELECT id_usuario FROM objetivo) OR coalesce(o.id_usuario_gestor,o.id_usuario_reasignado) IN(SELECT id_usuario FROM objetivo))
   AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada e WHERE e.id_operacion_proceso IN(o.id,coalesce(o.id_operacion_padre,o.id)))),
 detalle AS(
  SELECT p.id_usuario,p.id id_operacion_ref,'PAGADA'::text tipo,p.fecha_pagado fecha,p.servicio,p.banco,p.monto,p.cierre_estado,p.fecha_cierre,p.limite FROM pagadas_e p
  UNION ALL SELECT d.id_usuario_deriva,d.id,'DERIVADA',d.fecha_derivacion,d.servicio,d.banco,d.monto,NULL,NULL,NULL
   FROM derivaciones d WHERE d.id_usuario_deriva IN(SELECT id_usuario FROM objetivo)
  UNION ALL SELECT d.id_destino,d.id,'RECIBIDA',d.fecha_derivacion,d.servicio,d.banco,d.monto,NULL,NULL,NULL
   FROM derivaciones d WHERE d.id_destino IN(SELECT id_usuario FROM objetivo) AND d.id_usuario_deriva IS DISTINCT FROM d.id_destino),
 colab AS(
  SELECT t.*,
   (SELECT count(*) FROM pagadas_e p WHERE p.id_usuario=t.id_usuario) operaciones_pagadas,
   (SELECT coalesce(sum(p.monto),0) FROM pagadas_e p WHERE p.id_usuario=t.id_usuario) monto_pagado,
   (SELECT count(*) FROM detalle d WHERE d.id_usuario=t.id_usuario AND d.tipo='DERIVADA') derivadas,
   (SELECT count(*) FROM detalle d WHERE d.id_usuario=t.id_usuario AND d.tipo='RECIBIDA') recibidas,
   (SELECT count(*) FROM dias d WHERE d.id_usuario=t.id_usuario) dias_con_pagos,
   (SELECT count(*) FROM dias d WHERE d.id_usuario=t.id_usuario AND d.estado='A_TIEMPO') dias_cierre_a_tiempo,
   (SELECT count(*) FROM dias d WHERE d.id_usuario=t.id_usuario AND d.estado='TARDIO') dias_cierre_tardio,
   (SELECT count(*) FROM dias d WHERE d.id_usuario=t.id_usuario AND d.estado='PENDIENTE') dias_cierre_pendiente,
   coalesce((SELECT jsonb_agg(jsonb_build_object('banco',b.banco,'operaciones',b.n,'monto',b.m) ORDER BY b.n DESC,b.banco)
     FROM(SELECT p.banco,count(*) n,sum(p.monto) m FROM pagadas_e p WHERE p.id_usuario=t.id_usuario GROUP BY p.banco) b),'[]'::jsonb) carga_cartera
  FROM objetivo t),
 tope AS(SELECT d.*,row_number() OVER(ORDER BY d.fecha DESC,d.id_operacion_ref DESC,d.tipo) rn FROM detalle d)
 SELECT jsonb_build_object('periodo',mes,'zona','America/Lima','plazo_horas',48,'es_admin',admin,'es_jefe_superior',jefe,
  'colaboradores',coalesce((SELECT jsonb_agg(jsonb_build_object('id_usuario',c.id_usuario,'id_colaborador',c.id_colaborador,'nombre',c.nombre,'cargo',c.cargo,
     'operaciones_pagadas',c.operaciones_pagadas,'monto_pagado',c.monto_pagado,'derivadas',c.derivadas,'recibidas',c.recibidas,
     'dias_con_pagos',c.dias_con_pagos,'dias_cierre_a_tiempo',c.dias_cierre_a_tiempo,'dias_cierre_tardio',c.dias_cierre_tardio,
     'dias_cierre_pendiente',c.dias_cierre_pendiente,'carga_cartera',c.carga_cartera) ORDER BY c.nombre) FROM colab c),'[]'::jsonb),
  'total_detalle',(SELECT count(*) FROM detalle),
  'detalle_truncado',(SELECT count(*) FROM detalle)>p_detalle_limite,
  'detalle',coalesce((SELECT jsonb_agg(jsonb_build_object('id_usuario',t.id_usuario,'id_operacion_ref',t.id_operacion_ref,'tipo',t.tipo,'fecha',t.fecha,
     'servicio',t.servicio,'banco',t.banco,'monto',t.monto,'cierre_estado',t.cierre_estado,'fecha_cierre',t.fecha_cierre,'limite_cierre',t.limite) ORDER BY t.rn)
     FROM tope t WHERE t.rn<=p_detalle_limite),'[]'::jsonb)) INTO res;
 RETURN res;
END; $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_pagos_colaboradores()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb;
BEGIN
  ctx:=public.f_private_compensacion_contexto('RESUMEN','CONSULTAR');
  IF NOT coalesce((ctx->>'es_super_admin')::boolean,false) THEN RAISE EXCEPTION 'Consulta exclusiva de Administracion'; END IF;
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'nombre',c.nombre_completo,'documento',c.numero_documento,
      'cargo',ca.codigo,'cargo_nombre',ca.nombre) ORDER BY c.nombre_completo)
    FROM public.tb_compensacion_colaborador c
    JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=2 AND NOT coalesce(u.flag_super_admin,false)
    JOIN public.tb_compensacion_asignacion a ON a.id_colaborador=c.id
    JOIN public.tb_estado es ON es.id=a.id_estado AND upper(btrim(es.nombre))='ACTIVO'
    JOIN public.tb_compensacion_cargo ca ON ca.id=a.id_cargo
    WHERE (now() AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date)),'[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_pagos_control(p_mes date, p_colaborador bigint DEFAULT NULL::bigint, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20, p_inc_pagina integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; col bigint; mes date; resultado jsonb; admin boolean; jefe boolean:=false; propio bigint;
BEGIN
 ctx:=public.f_private_compensacion_contexto('RESUMEN','CONSULTAR');
 IF coalesce((ctx->>'es_super_admin')::boolean,false) THEN PERFORM public.f_private_compensacion_contexto('AUDITORIA','CONSULTAR'); END IF;admin:=coalesce((ctx->>'es_super_admin')::boolean,false);
 col:=coalesce(p_colaborador,(ctx->>'id_colaborador')::bigint);mes:=date_trunc('month',p_mes)::date;
 propio:=(ctx->>'id_colaborador')::bigint;
 IF NOT admin THEN
  jefe:=(public.f_private_compensacion_pagos_perfil(propio)->>'codigo')='JEFE_SUPERIOR_PAGOS';
  IF col IS DISTINCT FROM propio AND NOT jefe THEN RAISE EXCEPTION 'Consulta exclusiva de tus controles'; END IF;
 END IF;
 IF p_mes IS NULL OR p_pagina IS NULL OR p_pagina<1 OR p_inc_pagina IS NULL OR p_inc_pagina<1 OR p_tamano IS NULL OR p_tamano NOT IN(20,50,100) THEN RAISE EXCEPTION 'Periodo o paginacion invalida'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador c JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=2 WHERE c.id=col) THEN
  IF NOT admin OR p_colaborador IS NOT NULL THEN RAISE EXCEPTION 'Selecciona un colaborador de Pagos'; END IF;
  col:=NULL;
 END IF;
 WITH fuentes AS MATERIALIZED(SELECT d FROM public.f_private_compensacion_pagos_fuentes(col,mes) d),
 pagina AS(SELECT d FROM fuentes ORDER BY (d->>'fecha')::timestamptz DESC,(d->>'id')::bigint DESC LIMIT p_tamano OFFSET (p_pagina::bigint-1)*p_tamano)
 SELECT jsonb_build_object('id_colaborador',col,'es_admin',admin,'es_jefe_superior',jefe,'mes',mes,'plazo_horas',48,
 'total',(SELECT count(*) FROM fuentes),'total_paginas',(SELECT greatest(1,ceil(count(*)::numeric/p_tamano)) FROM fuentes),
 'items',coalesce((SELECT jsonb_agg(d) FROM pagina),'[]'),
 'resumen',public.f_private_compensacion_pagos_cuadre_fuente(col,mes),
 'incidencias_paginas',(SELECT greatest(1,ceil(count(*)::numeric/p_tamano)) FROM public.tb_compensacion_evento ex WHERE ex.id_colaborador_responsable=col AND ex.id_penalidad_tipo IS NOT NULL AND ex.periodo_imputacion=mes AND ex.estado_evento NOT IN('BORRADOR','ANULADO')),
 'colaboradores',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'nombre',c.nombre_completo) ORDER BY c.nombre_completo)
  FROM public.tb_compensacion_colaborador c JOIN public.tb_usuario u ON u.id=c.id_usuario AND u.id_rol=2
  WHERE (admin OR jefe OR c.id=col) AND EXISTS(SELECT 1 FROM public.tb_estado e WHERE e.id=c.id_estado AND upper(btrim(e.nombre))='ACTIVO')),'[]'),
 'incidencias',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'concepto',pt.nombre,'fecha',e.fecha_evento,'estado',e.estado_evento,
  'motivo',e.descripcion,'importe',CASE WHEN e.estado_evento IN('APROBADO','LIQUIDADO') THEN e.importe_aprobado END,
  'puede_descargo',NOT admin AND col IS NOT DISTINCT FROM propio AND e.estado_evento='PENDIENTE' AND pt.requiere_respuesta AND NOT EXISTS(
   SELECT 1 FROM public.tb_compensacion_evento_revision r WHERE r.id_evento=e.id AND r.etapa='DESCARGO'
    AND r.numero_paso>coalesce((SELECT max(numero_paso) FROM public.tb_compensacion_evento_revision re WHERE re.id_evento=e.id AND re.decision='ENVIADO'),0))) ORDER BY e.fecha_evento DESC,e.id DESC)
  FROM (SELECT ex.* FROM public.tb_compensacion_evento ex WHERE ex.id_colaborador_responsable=col AND ex.id_penalidad_tipo IS NOT NULL AND ex.periodo_imputacion=mes AND ex.estado_evento NOT IN('BORRADOR','ANULADO') ORDER BY ex.fecha_evento DESC,ex.id DESC LIMIT p_tamano OFFSET (p_inc_pagina::bigint-1)*p_tamano) e JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id=e.id_penalidad_tipo
  WHERE e.id_colaborador_responsable=col AND e.periodo_imputacion=mes AND e.estado_evento NOT IN('BORRADOR','ANULADO')),'[]'),
 'cuadre',coalesce((SELECT jsonb_build_object('estado',CASE WHEN e.estado_evento='APROBADO' AND NOT public.f_private_compensacion_pagos_evento_vigente(e.id) AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_reporte_mes rm JOIN public.tb_compensacion_periodo rp ON rp.id=rm.id_periodo WHERE rp.periodo=mes AND rm.estado='CONFIRMADO') THEN 'EN_REVISION' ELSE e.estado_evento END,
 'importe',CASE WHEN e.estado_evento='APROBADO' AND NOT public.f_private_compensacion_pagos_evento_vigente(e.id) AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_reporte_mes rm JOIN public.tb_compensacion_periodo rp ON rp.id=rm.id_periodo WHERE rp.periodo=mes AND rm.estado='CONFIRMADO') THEN NULL ELSE e.importe_aprobado END,'motivo',e.descripcion)
  FROM public.tb_compensacion_evento e WHERE e.clave_origen='PAGOS_CUADRE:'||col||':'||mes ORDER BY e.id DESC LIMIT 1),'{}')) INTO resultado;
 RETURN resultado;
END; 
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_pagos_es_validador()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
 SELECT public.f_private_compensacion_pagos_registro_validador() IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_pagos_operaciones(p_dni text, p_tipo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; items jsonb;
BEGIN
 IF p_tipo IS NULL OR p_tipo NOT IN('REPORTE_ABANDONO','DETECCION_ERROR_MANUAL') OR coalesce(p_dni,'') !~ '^[0-9]{8}$' THEN
   RAISE EXCEPTION 'Indica concepto y DNI de ocho digitos'; END IF;
 ctx:=public.f_private_compensacion_contexto(CASE WHEN p_tipo='REPORTE_ABANDONO' THEN 'BONO:REPORTE_ABANDONO' ELSE 'AUDITORIA' END,'CONSULTAR');
 PERFORM public.f_private_compensacion_pagos_perfil((ctx->>'id_colaborador')::bigint);
 SELECT coalesce(jsonb_agg(q.d),'[]') INTO items FROM (
   SELECT d FROM public.tb_operacion_proceso o
   CROSS JOIN LATERAL public.f_private_compensacion_pagos_operacion(o.id,(ctx->>'id_usuario')::bigint) d
   WHERE btrim(o.dni_cliente)=p_dni AND d IS NOT NULL
     AND (p_tipo<>'DETECCION_ERROR_MANUAL' OR (upper(d->>'estado')='PENDIENTE' AND NOT(d->>'pagada')::boolean AND NOT(d->>'transferida')::boolean))
   ORDER BY o.fecha_registro DESC,o.id DESC LIMIT 20) q;
 RETURN jsonb_build_object('items',items);
END; $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_pagos_registros_nuevos(p_mes date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE v jsonb; mes date:=date_trunc('month',p_mes)::date; items jsonb;
BEGIN
  v:=public.f_private_compensacion_pagos_registro_validador();
  IF v IS NULL THEN RAISE EXCEPTION 'Validacion exclusiva del Jefe Superior de Pagos'; END IF;
  IF p_mes IS NULL THEN RAISE EXCEPTION 'Indica el periodo'; END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'fecha_registro' DESC),'[]'::jsonb) INTO items FROM (
    SELECT jsonb_build_object('id',c.id,'documento',c.numero_documento,'nombre',c.nombre,'fecha_registro',c.fecha_registro,
      'registrado_por',(SELECT nombre_completo FROM public.tb_compensacion_colaborador WHERE id_usuario=c.id_usuario LIMIT 1),
      'sede',(SELECT s.nombre FROM public.tb_compensacion_colaborador k JOIN public.tb_compensacion_asignacion a ON a.id_colaborador=k.id
         JOIN public.tb_sucursal s ON s.id=a.id_sucursal
         WHERE k.id_usuario=c.id_usuario AND (c.fecha_registro AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date) LIMIT 1),
      'operacion',el->>'codigo','monto',(el->>'monto')::numeric,'fecha_pago',el->>'fecha_pago',
      'area_pagos',(SELECT nombre_completo FROM public.tb_compensacion_colaborador WHERE id_usuario=(el->>'gestor')::bigint LIMIT 1),
      'validacion',(SELECT jsonb_build_object('id',e.id,'estado',e.estado_evento,'importe',e.importe_aprobado)
         FROM public.tb_compensacion_evento e WHERE e.datos->>'hecho'='AUDITAR_NUEVOS:'||c.id AND e.estado_evento NOT IN('ANULADO','RECHAZADO') LIMIT 1)) x
    FROM public.tb_cliente c
    CROSS JOIN LATERAL public.f_private_compensacion_pagos_registro_elegible(c.id) el
    WHERE el IS NOT NULL AND EXISTS(SELECT 1 FROM public.tb_compensacion_colaborador k WHERE k.id_usuario=c.id_usuario)
      AND (c.fecha_registro AT TIME ZONE 'America/Lima')::date>=mes AND (c.fecha_registro AT TIME ZONE 'America/Lima')::date<(mes+interval '1 month')::date
    ORDER BY c.fecha_registro DESC LIMIT 300) q;
  RETURN jsonb_build_object('items',items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_pagos_validacion()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE v jsonb; items jsonb;
BEGIN
  v:=public.f_private_compensacion_pagos_validador();
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'fecha_evento' DESC),'[]'::jsonb) INTO items FROM (
    SELECT jsonb_build_object('id',e.id,'tipo_codigo',t.codigo,'tipo_nombre',t.nombre,'estado_evento',e.estado_evento,
      'fecha_evento',e.fecha_evento,'beneficiario',co.nombre_completo,'descripcion',e.descripcion,'captura',e.datos->'captura',
      'operacion',e.datos->'operacion','evidencia',e.evidencia->0->>'url',
      'validacion',(SELECT jsonb_build_object('decision',rv.decision,'comentario',rv.comentario,'fecha',rv.fecha_revision)
         FROM public.tb_compensacion_evento_revision rv WHERE rv.id_evento=e.id AND rv.etapa='JEFE_LINCE' ORDER BY rv.numero_paso DESC LIMIT 1)) x
    FROM public.tb_compensacion_evento e
    JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento AND t.codigo IN('REPORTE_ABANDONO','DETECCION_ERROR_MANUAL')
    JOIN public.tb_compensacion_colaborador co ON co.id=e.id_colaborador_beneficiario
    WHERE e.datos->>'flujo'='PAGOS_DETECCION_V1' AND e.estado_evento<>'ANULADO'
      AND EXISTS(SELECT 1 FROM public.tb_compensacion_asignacion a JOIN public.tb_estado es ON es.id=a.id_estado AND upper(btrim(es.nombre))='ACTIVO'
        WHERE a.id_colaborador=e.id_colaborador_beneficiario AND a.id_sucursal=(v->>'id_sucursal')::bigint
          AND (e.fecha_evento AT TIME ZONE 'America/Lima')::date BETWEEN a.fecha_inicio AND coalesce(a.fecha_fin,'infinity'::date))
    ORDER BY e.fecha_evento DESC LIMIT 100) q;
  RETURN jsonb_build_object('items',items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_pancake_estado(p_mes date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
 PERFORM public.f_private_compensacion_contexto('RESUMEN','CONSULTAR');
 IF p_mes IS NULL OR p_mes<>date_trunc('month',p_mes)::date THEN RAISE EXCEPTION 'Periodo mensual obligatorio'; END IF;
 RETURN jsonb_build_object('periodo',p_mes,
 'fuente',CASE WHEN EXISTS(SELECT 1 FROM public.tb_compensacion_pancake_mes WHERE periodo=p_mes) THEN 'PANCAKE' WHEN EXISTS(SELECT 1 FROM public.tb_compensacion_chat_dni cd WHERE cd.periodo=p_mes AND cd.estado='ACTIVO') THEN 'CHATS_DNI' ELSE NULL END,
 'estado',CASE
 WHEN EXISTS(SELECT 1 FROM public.tb_compensacion_pancake_mes WHERE periodo=p_mes) THEN
 CASE WHEN EXISTS(SELECT 1 FROM public.tb_compensacion_pancake_mes WHERE periodo=p_mes AND certificacion IS NOT NULL) THEN 'CERTIFICADA' ELSE 'EN_REVISION' END
 WHEN EXISTS(SELECT 1 FROM public.tb_compensacion_chat_dni_mes WHERE periodo=p_mes) THEN 'CERTIFICADA'
 WHEN EXISTS(SELECT 1 FROM public.tb_compensacion_chat_dni cd WHERE cd.periodo=p_mes AND cd.estado='ACTIVO') THEN 'EN_REVISION'
 ELSE 'SIN_FUENTE' END);
END $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_personal_catalogos()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; rutas text[];
BEGIN
  -- Catalogos laborales: dependencia tanto de Colaboradores como de Configuracion.
  SELECT array_agg(x) INTO rutas FROM jsonb_array_elements_text(public.f_get_tb_navegacion_x_usuario((SELECT id FROM public.tb_usuario WHERE auth_user_id=auth.uid() AND id_estado IN(SELECT id FROM public.tb_estado WHERE upper(btrim(nombre))='ACTIVO') LIMIT 1))->'rutas_permitidas') x;
  IF '/compensaciones/colaboradores'=ANY(rutas) THEN ctx:=public.f_private_compensacion_contexto('COLABORADORES','CONSULTAR');
  ELSE ctx:=public.f_private_compensacion_contexto('CONFIGURACION','CONSULTAR'); END IF;
  IF NOT coalesce((ctx->>'es_super_admin')::boolean,false) THEN RAISE EXCEPTION 'Catalogos de gestion exclusivos de Administracion'; END IF;
  RETURN jsonb_build_object(
    'cargos',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'codigo',codigo,'nombre',nombre,'id_estado',id_estado) ORDER BY nombre),'[]') FROM public.tb_compensacion_cargo WHERE id_estado IN(SELECT id FROM public.tb_estado WHERE upper(btrim(nombre))='ACTIVO')),
    'jornadas','[]'::jsonb,
    'planes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'codigo',codigo,'nombre',nombre,'id_estado',id_estado) ORDER BY nombre),'[]') FROM public.tb_compensacion_plan WHERE id_estado IN(SELECT id FROM public.tb_estado WHERE upper(btrim(nombre))='ACTIVO')),
    'sedes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'id_estado',id_estado) ORDER BY nombre),'[]') FROM public.tb_sucursal WHERE id_estado IN(SELECT id FROM public.tb_estado WHERE upper(btrim(nombre))='ACTIVO')));
END; $function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_referido_contexto()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_ctx jsonb; v_admin boolean;
BEGIN
 v_ctx:=public.f_private_compensacion_contexto('REFERIDOS','CONSULTAR');
 v_admin:=COALESCE((v_ctx->>'es_super_admin')::boolean,false);
 RETURN jsonb_build_object('id_usuario',(v_ctx->>'id_usuario')::bigint,
   'id_colaborador',NULLIF(v_ctx->>'id_colaborador','')::bigint,
   'puede_registrar',COALESCE((v_ctx->>'puede_registrar')::boolean,false),
   'puede_agregar_efectivizacion',v_admin,'puede_revertir',v_admin,
   'puede_aprobar',COALESCE((v_ctx->>'puede_aprobar')::boolean,false),
   'puede_revisar',COALESCE((v_ctx->>'puede_revisar')::boolean,false));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_referido_efectivizaciones(p_id bigint, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_ref public.tb_compensacion_referido%ROWTYPE; v_items jsonb; v_total bigint; v_tamano integer:=LEAST(GREATEST(COALESCE(p_tamano,20),1),100);
BEGIN
 SELECT * INTO v_ref FROM public.tb_compensacion_referido WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'El referido no existe'; END IF;
 PERFORM public.f_private_compensacion_evento_validar_alcance(v_ref.id_evento,'CONSULTAR',false);
 WITH base AS (
   SELECT e.id,e.estado_evento,e.periodo_imputacion,e.id_usuario_registra,e.importe_aprobado,e.fecha_evento,
     COALESCE(ro.banco_snapshot,er.datos_snapshot->>'nombre_banco') banco,
     COALESCE(ro.monto_operacion_snapshot,(er.datos_snapshot->>'monto_deposito')::numeric) monto,
     ro.tasa_referido
   FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento AND t.categoria='REFERIDO'
   LEFT JOIN public.tb_compensacion_referido_operacion ro ON ro.id_evento=e.id
   LEFT JOIN LATERAL(SELECT er.datos_snapshot FROM public.tb_compensacion_evento_referencia er WHERE er.id_evento=e.id AND er.id_operacion IS NOT NULL ORDER BY er.id LIMIT 1) er ON true
   WHERE e.id=v_ref.id_evento OR e.datos->>'id_referido'=p_id::text
 ), pagina AS (SELECT * FROM base ORDER BY fecha_evento DESC,id DESC LIMIT v_tamano OFFSET (GREATEST(COALESCE(p_pagina,1),1)-1)*v_tamano)
 SELECT (SELECT count(*) FROM base),COALESCE(jsonb_agg(to_jsonb(pagina) ORDER BY fecha_evento DESC,id DESC),'[]'::jsonb)
 INTO v_total,v_items FROM pagina;
 RETURN jsonb_build_object('items',v_items,'total',v_total,'total_paginas',ceil(v_total::numeric/v_tamano));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_referido_operacion(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_referido public.tb_compensacion_referido%ROWTYPE; v_config jsonb; v_resultado jsonb; v_tasa numeric;
BEGIN
  SELECT * INTO v_referido FROM public.tb_compensacion_referido WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El referido no existe'; END IF;
  PERFORM public.f_private_compensacion_evento_validar_alcance(v_referido.id_evento,'CONSULTAR',false);
  IF v_referido.estado_referido NOT IN ('PENDIENTE','VALIDADO') THEN RETURN NULL; END IF;
  IF v_referido.estado_referido='PENDIENTE' THEN
    RETURN public.f_private_compensacion_referido_match(p_id)->'operacion';
  END IF;
  SELECT t.configuracion INTO v_config FROM public.tb_compensacion_evento e
  JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento WHERE e.id=v_referido.id_evento;
  IF COALESCE(v_config->>'porcentaje_operacion_requerido',v_config->>'tasa_operacion_requerida','') !~ '^[0-9]+([.][0-9]+)?$' THEN
    RAISE EXCEPTION 'Falta configurar el porcentaje requerido del referido';
  END IF;
  v_tasa := COALESCE(v_config->>'porcentaje_operacion_requerido',v_config->>'tasa_operacion_requerida')::numeric;
  SELECT jsonb_build_object('id',op.id,'codigo',op.codigo_operacion_deposito_cliente,
    'banco',op.nombre_banco_cliente,'monto',op.monto_deposito_cliente,
    'conversacion',(SELECT identificador_externo FROM public.tb_compensacion_evento_referencia WHERE id_evento=v_referido.id_evento AND tipo_referencia='PANCAKE' ORDER BY id LIMIT 1),
    'fecha',COALESCE(op.fecha_pagado,op.fecha_deposito_cliente,op.fecha_registro))
  INTO v_resultado FROM public.tb_operacion_proceso op
  WHERE public.f_private_compensacion_referido_elegible(op,v_referido.id_cliente,v_referido.fecha_referencia,v_tasa)
    AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_referido_operacion ro WHERE ro.id_operacion=op.id AND (ro.id_evento IS DISTINCT FROM v_referido.id_evento OR v_referido.estado_referido<>'PENDIENTE'))
    AND NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia er JOIN public.tb_compensacion_evento e ON e.id=er.id_evento
      JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
      WHERE er.id_operacion=op.id AND t.categoria='REFERIDO' AND (er.id_evento<>v_referido.id_evento OR v_referido.estado_referido<>'PENDIENTE'))
    AND (v_referido.estado_referido<>'PENDIENTE' OR NOT EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia er WHERE er.id_evento=v_referido.id_evento AND er.id_operacion IS NOT NULL)
      OR EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia er WHERE er.id_evento=v_referido.id_evento AND er.id_operacion=op.id))
  ORDER BY COALESCE(op.fecha_pagado,op.fecha_deposito_cliente,op.fecha_registro),op.id LIMIT 1;
  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_referido_operaciones(p_id bigint DEFAULT NULL::bigint, p_dni character varying DEFAULT NULL::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_ctx jsonb; v_ref public.tb_compensacion_referido%ROWTYPE;
 v_dni varchar; v_candidate jsonb; v_items jsonb;
BEGIN
 v_ctx:=public.f_private_compensacion_contexto('REFERIDOS','CONSULTAR');
 IF NOT COALESCE((v_ctx->>'es_super_admin')::boolean,false) AND (v_ctx->>'alcance'<>'SEDE' OR p_id IS NULL) THEN
   RAISE EXCEPTION 'Abre un referido autorizado; la consulta general requiere Administracion';
 END IF;
 IF p_id IS NOT NULL THEN
   SELECT * INTO v_ref FROM public.tb_compensacion_referido WHERE id=p_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'El referido no existe'; END IF;
   PERFORM public.f_private_compensacion_evento_validar_alcance(v_ref.id_evento,'CONSULTAR',false);
   v_dni:=v_ref.documento_referido_snapshot;
   v_candidate:=public.f_get_compensacion_referido_operacion(p_id);
 ELSE
   v_dni:=btrim(p_dni);
 END IF;
 IF v_dni IS NULL OR v_dni !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'Ingresa un DNI de 8 digitos'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.fecha DESC,q.id DESC),'[]'::jsonb) INTO v_items FROM (
   SELECT op.id,op.tipo_servicio servicio,op.nombre_banco_cliente banco,
     op.monto_deposito_cliente monto,op.nombre_estado estado,op.comision_servicio porcentaje,
     COALESCE(op.fecha_pagado,op.fecha_deposito_cliente,op.fecha_registro) fecha,
     op.codigo_operacion_deposito_cliente codigo,
     COALESCE((v_candidate->>'id')::bigint=op.id,false) seleccionable,
     CASE WHEN (v_candidate->>'id')::bigint=op.id THEN 'Siguiente operacion elegible para validar'
       WHEN upper(btrim(op.nombre_estado)) IS DISTINCT FROM 'PAGADO' THEN 'No esta pagada; no acredita una efectivizacion completada'
       WHEN p_id IS NULL THEN 'Consulta informativa; registra o abre el referido para evaluar el bono'
       ELSE 'No es la siguiente operacion elegible: revisar tipo, tasa del 1% o vinculacion previa'
     END motivo
   FROM public.tb_operacion_proceso op
   WHERE op.dni_cliente=v_dni AND (p_id IS NULL OR op.id_cliente=v_ref.id_cliente)
     AND (p_id IS NOT NULL OR v_ctx->>'alcance'='GLOBAL' OR EXISTS (
       SELECT 1 FROM public.tb_usuario u WHERE u.id IN (op.id_usuario,op.id_usuario_gestor)
         AND ((v_ctx->>'alcance'='SEDE' AND u.id_sucursal=(v_ctx->>'id_sucursal_alcance')::bigint)
           OR (v_ctx->>'alcance'='PROPIO' AND u.id=(v_ctx->>'id_usuario')::bigint))
     ))
   ORDER BY COALESCE(op.fecha_pagado,op.fecha_deposito_cliente,op.fecha_registro) DESC,op.id DESC LIMIT 100
 ) q;
 RETURN jsonb_build_object('dni',v_dni,'items',v_items,'limite',100);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_referidos_filtrados(p_id bigint DEFAULT NULL::bigint, p_id_colaborador_referente bigint DEFAULT NULL::bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_estado_referido character varying DEFAULT NULL::character varying, p_fecha_desde date DEFAULT NULL::date, p_fecha_hasta date DEFAULT NULL::date, p_busqueda character varying DEFAULT NULL::character varying, p_pagina integer DEFAULT 1, p_tamano_pagina integer DEFAULT 50, p_documento_cliente text DEFAULT NULL::text, p_nombre_cliente text DEFAULT NULL::text, p_colaborador text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_contexto jsonb;
  v_alcance character varying;
  v_id_colaborador_actor bigint;
  v_id_sucursal_alcance bigint;
  v_pagina integer := GREATEST(COALESCE(p_pagina, 1), 1);
  v_tamano integer := LEAST(GREATEST(COALESCE(p_tamano_pagina, 50), 1), 200);
  v_total bigint;
  v_items jsonb;
  v_resumen jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('REFERIDOS', 'CONSULTAR');
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  WITH base AS (
    SELECT
      r.*,
      public.f_private_compensacion_referido_match(r.id) AS coincidencia,
      ev.estado_evento,
      ev.periodo_imputacion,
      ev.fecha_actualizacion AS version_evento,
      (ev.datos->'declaracion_referido'->>'monto')::numeric AS monto_declarado,
      ev.datos->'declaracion_referido'->>'banco' AS banco_declarado,
      CASE WHEN r.estado_referido='VALIDADO' THEN COALESCE((SELECT sum(ro.importe_comision)
        FROM public.tb_compensacion_referido_operacion ro JOIN public.tb_compensacion_evento e ON e.id=ro.id_evento
        WHERE ro.id_referido=r.id AND e.estado_evento IN ('APROBADO','LIQUIDADO')),0) ELSE ev.importe_aprobado END AS importe_aprobado,
      ev.id_regla_aplicada,
      ev.id_sucursal_origen,
      ev.id_usuario_registra,
      s.nombre AS sucursal_nombre,
      c.nombre_completo AS referente_nombre,
      c.numero_documento AS referente_documento,
      cl.nombre AS cliente_nombre_actual,
      cl.numero_documento AS cliente_documento_actual,
      (SELECT count(*) FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
        WHERE t.categoria='REFERIDO' AND e.datos->>'id_referido'=r.id::text AND e.estado_evento='PENDIENTE') AS efectivizaciones_pendientes,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(ro) ORDER BY ro.fecha_operacion_snapshot, ro.id)
        FROM public.tb_compensacion_referido_operacion ro
        WHERE ro.id_referido = r.id
      ), '[]'::jsonb) AS operaciones
    FROM public.tb_compensacion_referido r
    JOIN public.tb_compensacion_evento ev ON ev.id = r.id_evento
    JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
    JOIN public.tb_compensacion_colaborador c ON c.id = r.id_colaborador_referente
    JOIN public.tb_cliente cl ON cl.id = r.id_cliente
    LEFT JOIN public.tb_sucursal s ON s.id = ev.id_sucursal_origen
    WHERE public.f_private_compensacion_equipo_visible(v_contexto,r.id_colaborador_referente,(r.fecha_referencia AT TIME ZONE 'America/Lima')::date)
      AND te.categoria = 'REFERIDO'
      AND (p_id IS NULL OR r.id = p_id)
      AND (
        p_id_colaborador_referente IS NULL
        OR r.id_colaborador_referente = p_id_colaborador_referente
      )
      AND (p_id_sucursal IS NULL OR ev.id_sucursal_origen = p_id_sucursal)
      AND (
        (p_estado_referido IS NULL AND r.estado_referido <> 'ANULADO' AND COALESCE(ev.estado_evento,'') <> 'ANULADO')
        OR r.estado_referido = UPPER(TRIM(p_estado_referido))
      )
      AND (p_fecha_desde IS NULL OR (r.fecha_referencia AT TIME ZONE 'America/Lima')::date >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR (r.fecha_referencia AT TIME ZONE 'America/Lima')::date <= p_fecha_hasta)
      AND (
        p_busqueda IS NULL
        OR r.nombre_referido_snapshot ILIKE '%' || TRIM(p_busqueda) || '%'
        OR r.documento_referido_snapshot = btrim(p_busqueda)
        OR c.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR c.numero_documento = btrim(p_busqueda)
      )
      AND (NULLIF(btrim(p_documento_cliente),'') IS NULL OR r.documento_referido_snapshot = btrim(p_documento_cliente))
      AND (NULLIF(btrim(p_nombre_cliente),'') IS NULL OR r.nombre_referido_snapshot ILIKE '%' || btrim(p_nombre_cliente) || '%')
      AND (NULLIF(btrim(p_colaborador),'') IS NULL OR c.nombre_completo ILIKE '%' || btrim(p_colaborador) || '%' OR c.numero_documento = btrim(p_colaborador))
      AND (
        v_alcance = 'GLOBAL'
        OR (
          v_alcance = 'PROPIO'
          AND r.id_colaborador_referente = v_id_colaborador_actor
        )
        OR (
          v_alcance = 'SEDE'
          AND (
            ev.id_sucursal_origen = v_id_sucursal_alcance
            OR EXISTS (
              SELECT 1
              FROM public.tb_compensacion_asignacion a
              WHERE a.id_colaborador = r.id_colaborador_referente
                AND a.id_sucursal = v_id_sucursal_alcance
                AND a.fecha_inicio <= r.fecha_referencia::date
                AND (a.fecha_fin IS NULL OR a.fecha_fin >= r.fecha_referencia::date)
            )
          )
        )
      )
  ), conteo AS (
    SELECT COUNT(*) AS total FROM base
  ), resumen AS (
    SELECT jsonb_build_object(
      'pendientes', COUNT(*) FILTER (WHERE estado_referido = 'PENDIENTE'),
      'validados', COUNT(*) FILTER (WHERE estado_referido = 'VALIDADO'),
      'rechazados', COUNT(*) FILTER (WHERE estado_referido = 'RECHAZADO'),
      'anulados', COUNT(*) FILTER (WHERE estado_referido = 'ANULADO'),
      'efectivizaciones_pendientes', COALESCE(SUM(efectivizaciones_pendientes),0),
      'importe_validado', COALESCE(SUM(importe_aprobado) FILTER (
        WHERE estado_referido = 'VALIDADO'
      ), 0)
    ) AS datos
    FROM base
  ), pagina AS (
    SELECT * FROM base
    ORDER BY fecha_referencia DESC, id DESC
    LIMIT v_tamano OFFSET (v_pagina - 1) * v_tamano
  )
  SELECT conteo.total, resumen.datos,
         COALESCE(
           jsonb_agg(to_jsonb(pagina) ORDER BY pagina.fecha_referencia DESC, pagina.id DESC)
             FILTER (WHERE pagina.id IS NOT NULL),
           '[]'::jsonb
         )
  INTO v_total, v_resumen, v_items
  FROM conteo
  CROSS JOIN resumen
  LEFT JOIN pagina ON true
  GROUP BY conteo.total, resumen.datos;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'resumen', COALESCE(v_resumen, '{}'::jsonb),
    'total', COALESCE(v_total, 0),
    'pagina', v_pagina,
    'tamano_pagina', v_tamano,
    'total_paginas', CASE
      WHEN COALESCE(v_total, 0) = 0 THEN 0
      ELSE CEIL(v_total::numeric / v_tamano)::integer
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_reporte_mes_exportar(p_id_periodo bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_rep public.tb_compensacion_reporte_mes%ROWTYPE;
  v_pe public.tb_compensacion_periodo%ROWTYPE;
BEGIN
  PERFORM public.f_private_compensacion_bonos_mes_admin();
  SELECT * INTO v_pe FROM public.tb_compensacion_periodo WHERE id = p_id_periodo;
  IF v_pe.id IS NULL THEN RAISE EXCEPTION 'Periodo inexistente'; END IF;
  SELECT * INTO v_rep FROM public.tb_compensacion_reporte_mes WHERE id_periodo = p_id_periodo;
  IF v_rep.estado IS DISTINCT FROM 'CONFIRMADO' THEN RAISE EXCEPTION 'El reporte del mes aún no está confirmado'; END IF;
  RETURN jsonb_build_object(
    'periodo', v_pe.periodo, 'nombre_periodo', v_pe.nombre,
    'confirmado_en', v_rep.confirmado_en, 'hash_contenido', v_rep.hash_contenido, 'nota', v_rep.nota,
    'confirmado_por', (SELECT u.nombre FROM public.tb_usuario u WHERE u.id = v_rep.confirmado_por),
    'totales', v_rep.snapshot->'totales',
    'colaboradores', v_rep.snapshot->'colaboradores');
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_safetypay_registro_contexto()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
  SELECT jsonb_build_object('comunidades',public.f_private_compensacion_safetypay_registro_configuracion()->'comunidades');
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_tarjeta_contexto()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE ctx jsonb; puede_capturar boolean; tipo bigint;
BEGIN
  ctx := public.f_private_compensacion_contexto('TARJETAS','CONSULTAR');
  puede_capturar:=COALESCE((ctx->>'puede_registrar')::boolean,false);
  IF EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=(ctx->>'id_usuario')::bigint AND id_rol=3 AND NOT coalesce(flag_super_admin,false)) THEN
    SELECT id INTO tipo FROM public.tb_compensacion_evento_tipo WHERE codigo='SEGURIDAD_TARJETA';
    BEGIN
      PERFORM public.f_private_compensacion_evento_tarifa_registro(tipo,(ctx->>'id_colaborador')::bigint,now());
    EXCEPTION WHEN raise_exception THEN puede_capturar:=false;
    END;
  END IF;
  RETURN jsonb_build_object(
    'id_usuario',(ctx->>'id_usuario')::bigint,
    'id_colaborador',NULLIF(ctx->>'id_colaborador','')::bigint,
    'puede_registrar',puede_capturar,
    'puede_aprobar',COALESCE((ctx->>'puede_aprobar')::boolean,false),
    'puede_revisar',COALESCE((ctx->>'puede_revisar')::boolean,false)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_tarjetas_filtradas(p_id bigint DEFAULT NULL::bigint, p_categoria character varying DEFAULT 'TARJETA_TERCERO'::character varying, p_estado_evento character varying DEFAULT NULL::character varying, p_id_tipo_evento bigint DEFAULT NULL::bigint, p_id_colaborador bigint DEFAULT NULL::bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_fecha_desde date DEFAULT NULL::date, p_fecha_hasta date DEFAULT NULL::date, p_busqueda character varying DEFAULT NULL::character varying, p_pagina integer DEFAULT 1, p_tamano_pagina integer DEFAULT 50, p_documento_cliente text DEFAULT NULL::text, p_nombre_cliente text DEFAULT NULL::text, p_colaborador text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_contexto jsonb;
  v_alcance character varying;
  v_id_colaborador_actor bigint;
  v_id_sucursal_alcance bigint;
  v_pagina integer := GREATEST(COALESCE(p_pagina, 1), 1);
  v_tamano integer := LEAST(GREATEST(COALESCE(p_tamano_pagina, 50), 1), 200);
  v_total bigint;
  v_items jsonb;
  v_resumen jsonb;
BEGIN
  IF coalesce(p_categoria,'TARJETA_TERCERO') <> 'TARJETA_TERCERO' THEN RAISE EXCEPTION 'Esta consulta corresponde a Tarjetas Erróneas'; END IF;
  p_categoria := 'TARJETA_TERCERO';
  v_contexto := public.f_private_compensacion_contexto('TARJETAS','CONSULTAR');
  IF p_categoria='LLAMADA' THEN
    v_contexto:=public.f_private_compensacion_llamada_contexto('CONSULTAR');
  ELSIF p_id IS NOT NULL THEN
    v_contexto:=public.f_private_compensacion_evento_contexto(
      (SELECT id_tipo_evento FROM public.tb_compensacion_evento WHERE id=p_id),'CONSULTAR');
  ELSIF p_id_tipo_evento IS NOT NULL THEN
    v_contexto:=public.f_private_compensacion_evento_contexto(p_id_tipo_evento,'CONSULTAR');
  ELSIF p_categoria IS NOT NULL THEN
    v_contexto:=public.f_private_compensacion_contexto((CASE upper(btrim(p_categoria))
      WHEN 'CALIFICACION' THEN 'CALIFICACIONES' WHEN 'TARJETA_TERCERO' THEN 'TARJETAS'
      WHEN 'REFERIDO' THEN 'REFERIDOS' ELSE 'EVIDENCIAS' END)::varchar,'CONSULTAR');
  ELSE
    v_contexto := public.f_private_compensacion_contexto('EVIDENCIAS', 'CONSULTAR');
  END IF;
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  WITH base AS (
    SELECT
      ev.*,
      te.codigo AS tipo_codigo,
      te.nombre AS tipo_nombre,
      te.categoria,
      co.codigo AS concepto_codigo,
      co.nombre AS concepto_nombre,
      cb.nombre_completo AS beneficiario_nombre,
      cb.numero_documento AS beneficiario_documento,
      cr.nombre_completo AS responsable_nombre,
      so.nombre AS sucursal_origen_nombre,
      sr.nombre AS sucursal_responsable_nombre,
      ur.nombre AS usuario_registra_nombre,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(ref) ORDER BY ref.id)
        FROM public.tb_compensacion_evento_referencia ref
        WHERE ref.id_evento = ev.id
      ), '[]'::jsonb) AS referencias,
      COALESCE((
        SELECT jsonb_agg(
          to_jsonb(rev) || jsonb_build_object('usuario_revisor_nombre', uv.nombre)
          ORDER BY rev.numero_paso
        )
        FROM public.tb_compensacion_evento_revision rev
        JOIN public.tb_usuario uv ON uv.id = rev.id_usuario_revisor
        WHERE rev.id_evento = ev.id
      ), '[]'::jsonb) AS revisiones
    FROM public.tb_compensacion_evento ev
    JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
    LEFT JOIN public.tb_compensacion_concepto co ON co.id = te.id_concepto
    LEFT JOIN public.tb_compensacion_colaborador cb ON cb.id = ev.id_colaborador_beneficiario
    LEFT JOIN public.tb_compensacion_colaborador cr ON cr.id = ev.id_colaborador_responsable
    LEFT JOIN public.tb_sucursal so ON so.id = ev.id_sucursal_origen
    LEFT JOIN public.tb_sucursal sr ON sr.id = ev.id_sucursal_responsable
    JOIN public.tb_usuario ur ON ur.id = ev.id_usuario_registra
    WHERE (public.f_private_compensacion_equipo_visible(v_contexto,coalesce(ev.id_colaborador_beneficiario,ev.id_colaborador_responsable),(ev.fecha_evento AT TIME ZONE 'America/Lima')::date) OR coalesce((v_contexto->>'id_colaborador')::bigint IN(ev.id_colaborador_beneficiario,ev.id_colaborador_responsable),false))
      AND te.categoria IN ('CALIFICACION', 'LLAMADA', 'TARJETA_TERCERO', 'REFERIDO', 'OTRO')
      AND (te.codigo<>'PROPUESTA_INNOVACION' OR COALESCE((v_contexto->>'es_super_admin')::boolean,false)
        OR ev.id_colaborador_beneficiario=v_id_colaborador_actor)
      AND (p_id IS NULL OR ev.id = p_id)
      AND (p_id_tipo_evento IS NULL OR ev.id_tipo_evento = p_id_tipo_evento)
      AND (p_categoria IS NULL OR te.categoria = UPPER(TRIM(p_categoria)))
      AND ((p_estado_evento IS NULL AND ev.estado_evento <> 'ANULADO') OR ev.estado_evento = UPPER(TRIM(p_estado_evento)))
      AND (
        p_id_colaborador IS NULL
        OR ev.id_colaborador_beneficiario = p_id_colaborador
        OR ev.id_colaborador_responsable = p_id_colaborador
      )
      AND (
        p_id_sucursal IS NULL
        OR ev.id_sucursal_origen = p_id_sucursal
        OR ev.id_sucursal_responsable = p_id_sucursal
      )
      AND (p_fecha_desde IS NULL OR (ev.fecha_evento AT TIME ZONE 'America/Lima')::date >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR (ev.fecha_evento AT TIME ZONE 'America/Lima')::date <= p_fecha_hasta)
      AND (
        p_busqueda IS NULL
        OR te.nombre ILIKE '%' || TRIM(p_busqueda) || '%'
        OR ev.titulo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR ev.descripcion ILIKE '%' || TRIM(p_busqueda) || '%'
        OR CASE WHEN te.categoria IN ('LLAMADA', 'TARJETA_TERCERO') THEN (ev.datos->>'cliente_documento') = btrim(p_busqueda) ELSE ev.datos->>'cliente_documento' ILIKE '%' || TRIM(p_busqueda) || '%' END
        OR ev.datos->>'cliente_nombre' ILIKE '%' || TRIM(p_busqueda) || '%'
        OR cb.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR CASE WHEN te.categoria IN ('LLAMADA', 'TARJETA_TERCERO') THEN (cb.numero_documento) = btrim(p_busqueda) ELSE cb.numero_documento ILIKE '%' || TRIM(p_busqueda) || '%' END
        OR (te.categoria='LLAMADA' AND (ur.nombre ILIKE '%' || TRIM(p_busqueda) || '%' OR ur.username ILIKE '%' || TRIM(p_busqueda) || '%'))
      )
      AND (NULLIF(btrim(p_documento_cliente),'') IS NULL OR ev.datos->>'cliente_documento' = btrim(p_documento_cliente))
      AND (NULLIF(btrim(p_nombre_cliente),'') IS NULL OR ev.datos->>'cliente_nombre' ILIKE '%' || btrim(p_nombre_cliente) || '%')
      AND (NULLIF(btrim(p_colaborador),'') IS NULL OR cb.nombre_completo ILIKE '%' || btrim(p_colaborador) || '%' OR cb.numero_documento = btrim(p_colaborador))
      AND (
        v_alcance = 'GLOBAL'
        OR (
          v_alcance = 'PROPIO'
          AND v_id_colaborador_actor IN (
            ev.id_colaborador_beneficiario,
            ev.id_colaborador_responsable
          )
        )
        OR (
          v_alcance = 'SEDE'
          AND (
            v_id_sucursal_alcance IN (
              ev.id_sucursal_origen,
              ev.id_sucursal_responsable
            )
            OR EXISTS (
              SELECT 1
              FROM public.tb_compensacion_asignacion a
              WHERE a.id_colaborador IN (
                  ev.id_colaborador_beneficiario,
                  ev.id_colaborador_responsable
                )
                AND a.id_sucursal = v_id_sucursal_alcance
                AND a.fecha_inicio <= ev.fecha_evento::date
                AND (a.fecha_fin IS NULL OR a.fecha_fin >= ev.fecha_evento::date)
            )
          )
        )
      )
  ), conteo AS (
    SELECT COUNT(*) AS total FROM base
  ), resumen AS (
    SELECT jsonb_build_object(
      'borradores', COUNT(*) FILTER (WHERE estado_evento = 'BORRADOR'),
      'pendientes', COUNT(*) FILTER (WHERE estado_evento = 'PENDIENTE'),
      'aprobados', COUNT(*) FILTER (WHERE estado_evento = 'APROBADO'),
      'rechazados', COUNT(*) FILTER (WHERE estado_evento = 'RECHAZADO'),
      'anulados', COUNT(*) FILTER (WHERE estado_evento = 'ANULADO'),
      'importe_aprobado', COALESCE(SUM(importe_aprobado) FILTER (
        WHERE estado_evento IN ('APROBADO', 'LIQUIDADO')
          AND (tipo_codigo<>'PROPUESTA_INNOVACION' OR public.f_private_compensacion_innovacion_comprobada(id))
      ), 0)
    ) AS datos
    FROM base
  ), pagina AS (
    SELECT * FROM base
    ORDER BY fecha_evento DESC, id DESC
    LIMIT v_tamano OFFSET (v_pagina - 1) * v_tamano
  )
  SELECT conteo.total, resumen.datos,
         COALESCE(
           jsonb_agg((to_jsonb(pagina) || CASE WHEN pagina.tipo_codigo='PROPUESTA_INNOVACION'
             AND NOT public.f_private_compensacion_innovacion_comprobada(pagina.id)
             THEN jsonb_build_object('importe_aprobado',NULL) ELSE '{}'::jsonb END)
             ORDER BY pagina.fecha_evento DESC, pagina.id DESC)
             FILTER (WHERE pagina.id IS NOT NULL),
           '[]'::jsonb
         )
  INTO v_total, v_resumen, v_items
  FROM conteo
  CROSS JOIN resumen
  LEFT JOIN pagina ON true
  GROUP BY conteo.total, resumen.datos;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'resumen', COALESCE(v_resumen, '{}'::jsonb),
    'total', COALESCE(v_total, 0),
    'pagina', v_pagina,
    'tamano_pagina', v_tamano,
    'total_paginas', CASE
      WHEN COALESCE(v_total, 0) = 0 THEN 0
      ELSE CEIL(v_total::numeric / v_tamano)::integer
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_tiktok_clientes(p_mes date, p_pagina integer DEFAULT 1, p_tamano integer DEFAULT 20, p_tipo_documento bigint DEFAULT NULL::bigint, p_documento text DEFAULT ''::text, p_estado text DEFAULT ''::text, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_nombre_cliente text DEFAULT ''::text, p_colaborador text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; resultado jsonb;
BEGIN
 ctx:=public.f_private_compensacion_contexto('BONO:TIKTOK_LIVE','CONSULTAR');
 IF p_mes IS NULL OR p_pagina IS NULL OR p_pagina<1 OR p_tamano IS NULL OR p_tamano NOT IN(20,50,100) THEN RAISE EXCEPTION 'Consulta o paginación inválida'; END IF;
 IF p_tipo_documento IS NOT NULL AND p_tipo_documento NOT IN(1,2) THEN RAISE EXCEPTION 'Tipo de documento invalido'; END IF;
 IF coalesce(p_estado,'') NOT IN('','ESPERANDO_OPERACION','OPERACION_PENDIENTE','BONO_HABILITADO','BLOQUEADO','EN_REVISION','PENDIENTE_APROBACION','APROBADO','RECHAZADO','REQUIERE_REVISION') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
 IF p_desde>p_hasta THEN RAISE EXCEPTION 'Desde no puede ser posterior a Hasta'; END IF;
 WITH clientes AS MATERIALIZED (
   SELECT j FROM public.f_private_compensacion_tiktok_clientes(NULL) j
   WHERE (ctx->>'alcance'='GLOBAL' OR (ctx->>'alcance'='PROPIO' AND (j->>'id_usuario')::bigint=(ctx->>'id_usuario')::bigint)
     OR (ctx->>'alcance'='SEDE' AND (j->>'id_sucursal')::bigint=(ctx->>'id_sucursal_alcance')::bigint))
     AND public.f_private_compensacion_equipo_visible(ctx,(j->>'id_colaborador')::bigint,
       ((j->>'fecha_registro')::timestamptz AT TIME ZONE 'America/Lima')::date)
     AND ((j->>'fecha_registro')::timestamptz AT TIME ZONE 'America/Lima')::date>=date_trunc('month',p_mes)::date
     AND ((j->>'fecha_registro')::timestamptz AT TIME ZONE 'America/Lima')::date<(date_trunc('month',p_mes)+interval '1 month')::date
 ), evaluadas AS (SELECT j||jsonb_build_object('canal','TIKTOK_LIVE','concepto_codigo','COMISION_TIKTOK_LIVE','registrado_por',(SELECT nombre_completo FROM public.tb_compensacion_colaborador WHERE id=(j->>'id_colaborador')::bigint))||public.f_private_compensacion_captacion_revision(j||jsonb_build_object('canal','TIKTOK_LIVE','concepto_codigo','COMISION_TIKTOK_LIVE')) j FROM clientes), filtradas AS (
   SELECT j FROM evaluadas WHERE (p_tipo_documento IS NULL OR (j->>'tipo_documento')::bigint=p_tipo_documento)
     AND (coalesce(btrim(p_documento),'')='' OR strpos(j->>'documento',btrim(p_documento))>0 OR strpos(lower(j->>'nombre'),lower(btrim(p_documento)))>0)
     AND (coalesce(btrim(p_nombre_cliente),'')='' OR strpos(lower(coalesce(j->>'nombre','')),lower(btrim(p_nombre_cliente)))>0)
     AND (coalesce(btrim(p_colaborador),'')='' OR strpos(lower(coalesce(j->>'registrado_por','')),lower(btrim(p_colaborador)))>0 OR EXISTS (SELECT 1 FROM public.tb_compensacion_colaborador k WHERE k.id=(j->>'id_colaborador')::bigint AND k.numero_documento=btrim(p_colaborador)))
     AND (coalesce(p_estado,'')='' OR j->>'estado'=p_estado OR j->>'estado_aprobacion'=p_estado)
     AND (p_desde IS NULL OR ((j->>'fecha_registro')::timestamptz AT TIME ZONE 'America/Lima')::date>=p_desde)
     AND (p_hasta IS NULL OR ((j->>'fecha_registro')::timestamptz AT TIME ZONE 'America/Lima')::date<=p_hasta)
 ), pagina AS (SELECT j FROM filtradas ORDER BY (j->>'fecha_registro')::timestamptz DESC,(j->>'id')::bigint DESC LIMIT p_tamano OFFSET (p_pagina::bigint-1)*p_tamano)
 SELECT jsonb_build_object('asOf',now(),'dataState',CASE WHEN EXISTS(SELECT 1 FROM clientes WHERE j->>'estado'='EN_REVISION') THEN 'partial' ELSE 'complete' END,
   'en_revision',(SELECT count(*) FROM clientes WHERE j->>'estado'='EN_REVISION'),'items',coalesce((SELECT jsonb_agg(j ORDER BY (j->>'fecha_registro')::timestamptz DESC,(j->>'id')::bigint DESC) FROM pagina),'[]'::jsonb),
   'total',(SELECT count(*) FROM filtradas),'total_comision',(SELECT coalesce(sum((j->>'ganancia')::numeric),0) FROM evaluadas WHERE j->>'estado_aprobacion'='APROBADO'),
   'esperando',(SELECT count(*) FROM clientes WHERE j->>'estado' IN('ESPERANDO_OPERACION','OPERACION_PENDIENTE')),
   'habilitados',(SELECT count(*) FROM clientes WHERE j->>'estado'='BONO_HABILITADO'),
   'bloqueados',(SELECT count(*) FROM clientes WHERE j->>'estado'='BLOQUEADO')) INTO resultado;
 RETURN resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_tiktok_cuota(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE ctx jsonb; resultado jsonb;
BEGIN
 ctx:=public.f_private_compensacion_evento_validar_alcance(p_id,'CONSULTAR',false);
 IF NOT coalesce((ctx->>'es_super_admin')::boolean,false) THEN
   RAISE EXCEPTION 'Solo administración puede consultar la revisión de cuota TikTok'; END IF;
 SELECT jsonb_build_object('requiere_cuota',j->'requiere_cuota','revision',j->'revision_cuota','motivo',j->'motivo')
 INTO resultado FROM public.f_private_compensacion_tiktok_clientes(
   (SELECT id_colaborador_beneficiario FROM public.tb_compensacion_evento WHERE id=p_id)) j
 WHERE (j->>'id_evento')::bigint=p_id;
 IF resultado IS NULL THEN RAISE EXCEPTION 'Selecciona un registro automático TikTok con cliente y evidencia existentes'; END IF;
 RETURN resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_compensacion_tiktok_operaciones(p_codigo text, p_dni text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_items jsonb;
  v_codigo text:=nullif(btrim(p_codigo),'');
  v_dni text:=nullif(btrim(p_dni),'');
BEGIN
  v_contexto:=public.f_private_compensacion_contexto('BONO:TIKTOK_LIVE','CONSULTAR');
  IF v_codigo IS NULL AND v_dni IS NULL THEN RAISE EXCEPTION 'Ingresa DNI o código de operación'; END IF;
  IF v_codigo IS NOT NULL AND (length(v_codigo)<3 OR length(v_codigo)>100) THEN
    RAISE EXCEPTION 'El código debe tener entre 3 y 100 caracteres';
  END IF;
  IF v_dni IS NOT NULL AND v_dni !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'Ingresa un DNI de 8 dígitos'; END IF;
  SELECT COALESCE(jsonb_agg(q.item ORDER BY q.fecha_deposito DESC,q.id DESC),'[]'::jsonb)
  INTO v_items
  FROM (
    SELECT op.id,op.fecha_deposito_cliente AS fecha_deposito,
      jsonb_build_object(
        'id',op.id,'codigo',op.codigo_operacion_deposito_cliente,'id_cliente',c.id,
        'dni',c.numero_documento,'cliente',c.nombre,
        'servicio',op.tipo_servicio,'monto',op.monto_deposito_cliente,
        'fecha_deposito',op.fecha_deposito_cliente,
        'estado',op.nombre_estado,
        'elegible',upper(btrim(coalesce(op.nombre_estado,'')))='PAGADO'
          AND op.fecha_deposito_cliente IS NOT NULL
          AND coalesce((public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'pagada')::boolean,false)
          AND (public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'fecha_pago')::timestamptz BETWEEN c.fecha_registro AND c.fecha_registro+interval '168 hours'
          AND NOT EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada x WHERE x.id_operacion_proceso=op.id)
          AND NOT EXISTS(
            SELECT 1 FROM public.tb_compensacion_evento_referencia er
            JOIN public.tb_compensacion_evento ev ON ev.id=er.id_evento
            JOIN public.tb_compensacion_evento_tipo et ON et.id=ev.id_tipo_evento
            WHERE er.id_operacion=op.id AND et.codigo='TIKTOK_LIVE'
              AND ev.estado_evento NOT IN ('RECHAZADO','ANULADO')
          ),
        'motivo',CASE
          WHEN upper(btrim(coalesce(op.nombre_estado,'')))<>'PAGADO' THEN 'La operación todavía no está pagada'
          WHEN op.fecha_deposito_cliente IS NULL THEN 'La operación no tiene fecha de depósito'
          WHEN NOT coalesce((public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'pagada')::boolean,false)
            OR (public.f_private_compensacion_cliente_nuevo_operacion_estado(op.id)->>'fecha_pago')::timestamptz NOT BETWEEN c.fecha_registro AND c.fecha_registro+interval '168 hours'
            THEN 'La operación final debe pagarse dentro de siete días del registro del cliente'
          WHEN EXISTS(SELECT 1 FROM public.tb_operacion_proceso_eliminada x WHERE x.id_operacion_proceso=op.id) THEN 'La operación fue eliminada'
          WHEN EXISTS(SELECT 1 FROM public.tb_compensacion_evento_referencia er JOIN public.tb_compensacion_evento ev ON ev.id=er.id_evento JOIN public.tb_compensacion_evento_tipo et ON et.id=ev.id_tipo_evento WHERE er.id_operacion=op.id AND et.codigo='TIKTOK_LIVE' AND ev.estado_evento NOT IN ('RECHAZADO','ANULADO')) THEN 'La operación ya está vinculada a otro registro TikTok'
          ELSE NULL END
      ) AS item
    FROM public.tb_operacion_proceso op
    JOIN public.tb_cliente c ON c.id=op.id_cliente
    WHERE (v_dni IS NULL OR c.numero_documento=v_dni)
      AND (v_codigo IS NULL OR strpos(lower(coalesce(op.codigo_operacion_deposito_cliente,'')),lower(v_codigo))>0)
      AND (v_dni IS NULL OR op.dni_cliente IS NULL OR op.dni_cliente=v_dni)
      AND upper(btrim(coalesce(op.nombre_estado,'')))='PAGADO'
      AND op.fecha_deposito_cliente IS NOT NULL
    ORDER BY op.fecha_deposito_cliente DESC NULLS LAST,op.id DESC
    LIMIT 10
  ) q;
  RETURN jsonb_build_object('items',v_items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_acceso(p_id_usuario bigint DEFAULT NULL::bigint, p_recurso character varying DEFAULT NULL::character varying, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONSULTAR'
  );

  IF NOT COALESCE((v_contexto ->> 'es_super_admin')::boolean, false)
     AND v_contexto ->> 'alcance' <> 'GLOBAL' THEN
    RAISE EXCEPTION 'Solo un acceso global puede consultar permisos de compensaciones';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', a.id,
    'id_usuario', a.id_usuario,
    'usuario_nombre', u.nombre,
    'recurso', a.recurso,
    'alcance', a.alcance,
    'id_sucursal', a.id_sucursal,
    'sucursal_nombre', s.nombre,
    'puede_consultar', a.puede_consultar,
    'puede_registrar', a.puede_registrar,
    'puede_editar', a.puede_editar,
    'puede_revisar', a.puede_revisar,
    'puede_aprobar', a.puede_aprobar,
    'puede_pagar', a.puede_pagar,
    'puede_cerrar', a.puede_cerrar,
    'puede_configurar', a.puede_configurar,
    'id_estado', a.id_estado,
    'estado_nombre', e.nombre,
    'id_usuario_registra', a.id_usuario_registra,
    'fecha_registro', a.fecha_registro,
    'fecha_actualizacion', a.fecha_actualizacion
  )
  FROM public.tb_compensacion_acceso a
  JOIN public.tb_usuario u ON u.id = a.id_usuario
  JOIN public.tb_estado e ON e.id = a.id_estado
  LEFT JOIN public.tb_sucursal s ON s.id = a.id_sucursal
  WHERE (p_id_usuario IS NULL OR a.id_usuario = p_id_usuario)
    AND (p_recurso IS NULL OR a.recurso = UPPER(TRIM(p_recurso)))
    AND (p_id_estado IS NULL OR a.id_estado = p_id_estado)
  ORDER BY u.nombre, a.recurso;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_asignacion(p_id_colaborador bigint, p_id bigint DEFAULT NULL::bigint, p_fecha_referencia date DEFAULT CURRENT_DATE)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_validar_colaborador(
    p_id_colaborador,
    'CONSULTAR',
    p_fecha_referencia
  );

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', a.id,
    'id_colaborador', a.id_colaborador,
    'colaborador_nombre', c.nombre_completo,
    'id_cargo', a.id_cargo,
    'cargo_nombre', ca.nombre,
    'id_sucursal', a.id_sucursal,
    'sucursal_nombre', s.nombre,
    'id_jornada', NULL,
    'jornada_nombre', NULL,
    'id_plan', a.id_plan,
    'plan_nombre', p.nombre,
    'fecha_inicio', a.fecha_inicio,
    'fecha_fin', a.fecha_fin,
    'modalidad', a.modalidad,
    'observacion', a.observacion,
    'id_estado', a.id_estado,
    'estado_nombre', e.nombre,
    'es_vigente', (
      a.fecha_inicio <= COALESCE(p_fecha_referencia, CURRENT_DATE)
      AND (
        a.fecha_fin IS NULL
        OR a.fecha_fin >= COALESCE(p_fecha_referencia, CURRENT_DATE)
      )
    ),
    'id_usuario', a.id_usuario,
    'fecha_registro', a.fecha_registro,
    'fecha_actualizacion', a.fecha_actualizacion
  )
  FROM public.tb_compensacion_asignacion a
  JOIN public.tb_compensacion_colaborador c ON c.id = a.id_colaborador
  JOIN public.tb_compensacion_cargo ca ON ca.id = a.id_cargo
  JOIN public.tb_sucursal s ON s.id = a.id_sucursal
  
  JOIN public.tb_compensacion_plan p ON p.id = a.id_plan
  JOIN public.tb_estado e ON e.id = a.id_estado
  WHERE a.id_colaborador = p_id_colaborador
    AND (p_id IS NULL OR a.id = p_id)
  ORDER BY a.fecha_inicio DESC, a.id DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_cargo(p_id bigint DEFAULT NULL::bigint, p_busqueda character varying DEFAULT NULL::character varying, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONSULTAR'
  );

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', c.id,
    'codigo', c.codigo,
    'nombre', c.nombre,
    'descripcion', c.descripcion,
    'orden', c.orden,
    'id_estado', c.id_estado,
    'estado_nombre', e.nombre,
    'id_usuario', c.id_usuario,
    'fecha_registro', c.fecha_registro,
    'fecha_actualizacion', c.fecha_actualizacion
  )
  FROM public.tb_compensacion_cargo c
  JOIN public.tb_estado e ON e.id = c.id_estado
  WHERE (p_id IS NULL OR c.id = p_id)
    AND (
      p_busqueda IS NULL
      OR c.codigo ILIKE '%' || TRIM(p_busqueda) || '%'
      OR c.nombre ILIKE '%' || TRIM(p_busqueda) || '%'
    )
    AND (p_id_estado IS NULL OR c.id_estado = p_id_estado)
  ORDER BY c.orden, c.nombre, c.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_colaborador(p_id bigint DEFAULT NULL::bigint, p_busqueda character varying DEFAULT NULL::character varying, p_id_estado bigint DEFAULT NULL::bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_id_cargo bigint DEFAULT NULL::bigint, p_fecha_referencia date DEFAULT CURRENT_DATE, p_pagina integer DEFAULT 1, p_tamano_pagina integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_id_colaborador_actor bigint;
  v_alcance character varying;
  v_id_sucursal_alcance bigint;
  v_pagina integer := GREATEST(COALESCE(p_pagina, 1), 1);
  v_tamano integer := LEAST(GREATEST(COALESCE(p_tamano_pagina, 20), 1), 100);
  v_fecha_referencia date := COALESCE(p_fecha_referencia, CURRENT_DATE);
  v_total bigint;
  v_items jsonb;
  v_resumen jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'COLABORADORES',
    'CONSULTAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_alcance := v_contexto ->> 'alcance';
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  IF v_alcance = 'PROPIO' AND v_id_colaborador_actor IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'resumen', jsonb_build_object('colaboradores',0,'activos',0,'inactivos',0,'sedes',0),
      'pagina', v_pagina,
      'tamano_pagina', v_tamano,
      'total_paginas', 0
    );
  END IF;

  WITH base AS (
    SELECT
      c.*,
      a.id AS id_asignacion,
      a.id_cargo,
      ca.nombre AS cargo_nombre,
      a.id_sucursal,
      s.nombre AS sucursal_nombre,
      NULL::bigint AS id_jornada,
      NULL::text AS jornada_nombre,
      a.id_plan,
      p.nombre AS plan_nombre,
      a.fecha_inicio AS asignacion_fecha_inicio,
      a.fecha_fin AS asignacion_fecha_fin,
      e.nombre AS estado_nombre,
      u.nombre AS usuario_nombre,
      u.username AS usuario_username
    FROM public.tb_compensacion_colaborador c
    JOIN public.tb_estado e ON e.id = c.id_estado
    LEFT JOIN public.tb_usuario u ON u.id = c.id_usuario
    LEFT JOIN LATERAL (
      SELECT ax.*
      FROM public.tb_compensacion_asignacion ax
      WHERE ax.id_colaborador = c.id
        AND ax.fecha_inicio <= v_fecha_referencia
        AND (ax.fecha_fin IS NULL OR ax.fecha_fin >= v_fecha_referencia)
      ORDER BY ax.fecha_inicio DESC, ax.id DESC
      LIMIT 1
    ) a ON true
    LEFT JOIN public.tb_compensacion_cargo ca ON ca.id = a.id_cargo
    LEFT JOIN public.tb_sucursal s ON s.id = a.id_sucursal
    
    LEFT JOIN public.tb_compensacion_plan p ON p.id = a.id_plan
    WHERE public.f_private_compensacion_equipo_visible(v_contexto,c.id,v_fecha_referencia)
      AND (p_id IS NULL OR c.id = p_id)
      AND (p_id_estado IS NULL OR c.id_estado = p_id_estado)
      AND (p_id_sucursal IS NULL OR a.id_sucursal = p_id_sucursal)
      AND (p_id_cargo IS NULL OR a.id_cargo = p_id_cargo)
      AND (
        p_busqueda IS NULL
        OR c.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR c.numero_documento ILIKE '%' || TRIM(p_busqueda) || '%'
        OR COALESCE(c.codigo_huellero, '') ILIKE '%' || TRIM(p_busqueda) || '%'
      )
      AND (
        v_alcance = 'GLOBAL'
        OR (v_alcance = 'SEDE' AND a.id_sucursal = v_id_sucursal_alcance)
        OR (v_alcance = 'PROPIO' AND c.id = v_id_colaborador_actor)
      )
  )
  SELECT COUNT(*), jsonb_build_object(
    'colaboradores', COUNT(*),
    'activos', COUNT(*) FILTER (WHERE upper(btrim(estado_nombre)) = 'ACTIVO'),
    'inactivos', COUNT(*) FILTER (WHERE upper(btrim(estado_nombre)) = 'INACTIVO'),
    'sedes', COUNT(DISTINCT id_sucursal))
  INTO v_total, v_resumen FROM base;

  WITH base AS (
    SELECT
      c.*,
      a.id AS id_asignacion,
      a.id_cargo,
      ca.nombre AS cargo_nombre,
      a.id_sucursal,
      s.nombre AS sucursal_nombre,
      NULL::bigint AS id_jornada,
      NULL::text AS jornada_nombre,
      a.id_plan,
      p.nombre AS plan_nombre,
      a.fecha_inicio AS asignacion_fecha_inicio,
      a.fecha_fin AS asignacion_fecha_fin,
      e.nombre AS estado_nombre,
      u.nombre AS usuario_nombre,
      u.username AS usuario_username
    FROM public.tb_compensacion_colaborador c
    JOIN public.tb_estado e ON e.id = c.id_estado
    LEFT JOIN public.tb_usuario u ON u.id = c.id_usuario
    LEFT JOIN LATERAL (
      SELECT ax.*
      FROM public.tb_compensacion_asignacion ax
      WHERE ax.id_colaborador = c.id
        AND ax.fecha_inicio <= v_fecha_referencia
        AND (ax.fecha_fin IS NULL OR ax.fecha_fin >= v_fecha_referencia)
      ORDER BY ax.fecha_inicio DESC, ax.id DESC
      LIMIT 1
    ) a ON true
    LEFT JOIN public.tb_compensacion_cargo ca ON ca.id = a.id_cargo
    LEFT JOIN public.tb_sucursal s ON s.id = a.id_sucursal
    
    LEFT JOIN public.tb_compensacion_plan p ON p.id = a.id_plan
    WHERE public.f_private_compensacion_equipo_visible(v_contexto,c.id,v_fecha_referencia)
      AND (p_id IS NULL OR c.id = p_id)
      AND (p_id_estado IS NULL OR c.id_estado = p_id_estado)
      AND (p_id_sucursal IS NULL OR a.id_sucursal = p_id_sucursal)
      AND (p_id_cargo IS NULL OR a.id_cargo = p_id_cargo)
      AND (
        p_busqueda IS NULL
        OR c.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR c.numero_documento ILIKE '%' || TRIM(p_busqueda) || '%'
        OR COALESCE(c.codigo_huellero, '') ILIKE '%' || TRIM(p_busqueda) || '%'
      )
      AND (
        v_alcance = 'GLOBAL'
        OR (v_alcance = 'SEDE' AND a.id_sucursal = v_id_sucursal_alcance)
        OR (v_alcance = 'PROPIO' AND c.id = v_id_colaborador_actor)
      )
  ), paginada AS (
    SELECT *
    FROM base
    ORDER BY nombre_completo, id
    OFFSET (v_pagina - 1) * v_tamano
    LIMIT v_tamano
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'id_usuario', x.id_usuario,
        'usuario_nombre', x.usuario_nombre,
        'usuario_username', x.usuario_username,
        'tipo_documento', x.tipo_documento,
        'numero_documento', x.numero_documento,
        'nombres', x.nombres,
        'apellido_paterno', x.apellido_paterno,
        'apellido_materno', x.apellido_materno,
        'nombre_completo', x.nombre_completo,
        'email', x.email,
        'celular', x.celular,
        'codigo_huellero', x.codigo_huellero,
        'fecha_ingreso', x.fecha_ingreso,
        'fecha_cese', x.fecha_cese,
        'motivo_cese', x.motivo_cese,
        'id_estado', x.id_estado,
        'estado_nombre', x.estado_nombre,
        'asignacion', CASE
          WHEN x.id_asignacion IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', x.id_asignacion,
            'id_cargo', x.id_cargo,
            'cargo_nombre', x.cargo_nombre,
            'id_sucursal', x.id_sucursal,
            'sucursal_nombre', x.sucursal_nombre,
            'id_jornada', x.id_jornada,
            'jornada_nombre', x.jornada_nombre,
            'id_plan', x.id_plan,
            'plan_nombre', x.plan_nombre,
            'fecha_inicio', x.asignacion_fecha_inicio,
            'fecha_fin', x.asignacion_fecha_fin
          )
        END,
        'fecha_registro', x.fecha_registro,
        'fecha_actualizacion', x.fecha_actualizacion
      )
      ORDER BY x.nombre_completo, x.id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM paginada x;

  RETURN jsonb_build_object(
    'items', v_items,
    'resumen', v_resumen,
    'total', v_total,
    'pagina', v_pagina,
    'tamano_pagina', v_tamano,
    'total_paginas', CASE
      WHEN v_total = 0 THEN 0
      ELSE CEIL(v_total::numeric / v_tamano)::integer
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_colaborador_ficha(p_id bigint DEFAULT NULL::bigint, p_busqueda character varying DEFAULT NULL::character varying, p_id_estado bigint DEFAULT NULL::bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_id_cargo bigint DEFAULT NULL::bigint, p_fecha_referencia date DEFAULT CURRENT_DATE, p_pagina integer DEFAULT 1, p_tamano_pagina integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_base jsonb;
  v_items jsonb;
  v_fecha date := COALESCE(p_fecha_referencia, CURRENT_DATE);
  v_admin boolean;
  v_editar boolean;
  v_crear boolean;
  v_financiero jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('COLABORADORES', 'CONSULTAR');
  v_admin := COALESCE((v_contexto ->> 'es_super_admin')::boolean, false);
  v_editar:=coalesce((v_contexto->>'puede_editar')::boolean,false);
  v_crear:=coalesce((v_contexto->>'puede_registrar')::boolean,false);

  IF v_admin THEN
    v_financiero := jsonb_build_object('alcance', 'GLOBAL');
  ELSE
    BEGIN
      v_financiero:=public.f_private_compensacion_contexto('CONFIGURACION','CONSULTAR');
      v_financiero:=v_financiero||jsonb_build_object('id_sucursal',v_financiero->'id_sucursal_alcance');
    EXCEPTION WHEN raise_exception THEN v_financiero:=NULL;
    END;
  END IF;

  -- Reutiliza filtros, paginacion y alcance del contrato existente, sin ampliarlos.
  v_base := public.f_get_tb_compensacion_colaborador(p_id, p_busqueda, p_id_estado,
    p_id_sucursal, p_id_cargo, v_fecha, p_pagina, p_tamano_pagina);

  SELECT COALESCE(jsonb_agg(x.item || jsonb_build_object(
    'jornada', NULL,
    'compensacion', CASE WHEN NOT permisos.monetario THEN jsonb_build_object(
      'estado', 'DATOS_RESTRINGIDOS', 'es_importe_liquidado', false,
      'sueldo_mensual_referencia', NULL, 'sueldo_regla', NULL,
      'reglas_referencia', '[]'::jsonb) ELSE jsonb_build_object(
      'estado', CASE WHEN a.id IS NULL THEN 'SIN_ASIGNACION'
        WHEN UPPER(ea.nombre) <> 'ACTIVO' THEN 'ASIGNACION_INACTIVA'
        WHEN pv.id IS NULL THEN 'SIN_MATRIZ_PUBLICADA'
        ELSE 'REFERENCIA_MATRIZ' END,
      'es_importe_liquidado', false,
      'id_plan_version', pv.id, 'numero_version', pv.numero_version,
      'fecha_inicio_version', pv.fecha_inicio, 'fecha_fin_version', pv.fecha_fin,
      'sueldo_regla', sueldo.regla,
      'sueldo_mensual_referencia', CASE WHEN sueldo.regla ->> 'tipo_calculo' = 'FIJO'
        THEN (sueldo.regla ->> 'monto')::numeric ELSE NULL END,
      'requiere_revision_excepcion', EXISTS (
        SELECT 1 FROM public.tb_compensacion_excepcion ex
        JOIN public.tb_estado ee ON ee.id = ex.id_estado AND UPPER(ee.nombre) = 'ACTIVO'
        WHERE ex.id_colaborador = (x.item ->> 'id')::bigint
          AND ex.estado_aprobacion = 'APROBADA' AND ex.fecha_inicio <= v_fecha
          AND (ex.fecha_fin IS NULL OR ex.fecha_fin >= v_fecha)),
      'reglas_referencia', COALESCE(reglas.items, '[]'::jsonb)) END,
    'cuentas_deposito', jsonb_build_object(
      'datos_enmascarados', true, 'total', COALESCE(cuentas.total, 0),
      'items', COALESCE(cuentas.items, '[]'::jsonb), 'principal', principal.cuenta),
    'permisos_accion', jsonb_build_object(
      'puede_ver_ficha', true,
      'puede_ver_compensacion', permisos.monetario,
      'puede_editar_ficha', v_editar AND (v_contexto ->> 'alcance' = 'GLOBAL'
        OR (v_contexto ->> 'alcance' = 'SEDE' AND EXISTS (
          SELECT 1 FROM public.tb_compensacion_asignacion ax
          WHERE ax.id_colaborador = (x.item ->> 'id')::bigint
            AND ax.id_sucursal = (v_contexto ->> 'id_sucursal_alcance')::bigint
            AND ax.fecha_inicio <= CURRENT_DATE
            AND (ax.fecha_fin IS NULL OR ax.fecha_fin >= CURRENT_DATE)))),
      'puede_ver_cuentas_completas', false)
  ) ORDER BY x.orden), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(v_base -> 'items') WITH ORDINALITY x(item, orden)
  LEFT JOIN public.tb_compensacion_asignacion a ON a.id = (x.item #>> '{asignacion,id}')::bigint
  LEFT JOIN public.tb_estado ea ON ea.id = a.id_estado
  
  CROSS JOIN LATERAL (
    SELECT COALESCE(v_financiero ->> 'alcance' = 'GLOBAL'
      OR (v_financiero ->> 'alcance' = 'SEDE'
        AND a.id_sucursal = (v_financiero ->> 'id_sucursal')::bigint)
      OR (v_financiero ->> 'alcance' = 'PROPIO'
        AND (x.item ->> 'id')::bigint = (v_contexto ->> 'id_colaborador')::bigint), false) AS monetario
  ) permisos
  LEFT JOIN LATERAL (
    SELECT vx.* FROM public.f_private_compensacion_configuracion_tramos(a.id_plan) vx
    WHERE UPPER(ea.nombre) = 'ACTIVO' AND permisos.monetario
      AND vx.fecha_inicio <= v_fecha AND (vx.fecha_fin IS NULL OR vx.fecha_fin >= v_fecha)
    ORDER BY vx.fecha_inicio DESC, vx.numero_version DESC, vx.id DESC LIMIT 1
  ) pv ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('id_regla', r.id, 'codigo', co.codigo,
      'nombre', co.nombre, 'categoria', co.categoria, 'naturaleza', co.naturaleza,
      'unidad', co.unidad, 'tipo_calculo', r.tipo_calculo, 'monto', r.monto,
      'prioridad', r.prioridad,
      'especificidad', ((r.id_cargo IS NOT NULL)::integer + (r.id_sucursal IS NOT NULL)::integer),
      'porcentaje', r.porcentaje, 'configuracion', r.configuracion)
      ORDER BY co.orden, co.id) AS items
    FROM (
      SELECT DISTINCT ON (rx.id_concepto) rx.*
      FROM public.f_private_compensacion_reglas_colaborador_fecha(a.id_plan,v_fecha,(x.item ->> 'id')::bigint) rx
      JOIN public.tb_estado er ON er.id = rx.id_estado AND UPPER(er.nombre) = 'ACTIVO'
      WHERE pv.id IS NOT NULL
        AND (rx.id_cargo IS NULL OR rx.id_cargo = a.id_cargo)
        AND (rx.id_sucursal IS NULL OR rx.id_sucursal = a.id_sucursal)
      ORDER BY rx.id_concepto,
        ((rx.id_cargo IS NOT NULL)::integer + (rx.id_sucursal IS NOT NULL)::integer) DESC,
        rx.prioridad DESC, rx.id DESC
    ) r
    JOIN public.tb_compensacion_concepto co ON co.id = r.id_concepto
    JOIN public.tb_estado ec ON ec.id = co.id_estado
      AND (UPPER(ec.nombre) = 'ACTIVO' OR co.categoria = 'SUELDO')
  ) reglas ON true
  LEFT JOIN LATERAL (
    SELECT value AS regla FROM jsonb_array_elements(COALESCE(reglas.items, '[]'::jsonb))
    WHERE value ->> 'categoria' = 'SUELDO'
    ORDER BY (value ->> 'especificidad')::integer DESC,
      (value ->> 'prioridad')::integer DESC, (value ->> 'id_regla')::bigint DESC LIMIT 1
  ) sueldo ON true
  LEFT JOIN LATERAL (
    SELECT 0::bigint AS total, NULL::jsonb AS items
  ) cuentas ON true
  LEFT JOIN LATERAL (
    SELECT value AS cuenta FROM jsonb_array_elements(COALESCE(cuentas.items, '[]'::jsonb))
    WHERE (value ->> 'es_principal')::boolean LIMIT 1
  ) principal ON true;

  RETURN v_base || jsonb_build_object('items', v_items,
    'version_contrato', 'B2_01', 'fecha_referencia', v_fecha,
    'permisos_accion', jsonb_build_object('puede_crear', v_crear AND v_contexto ->> 'alcance' <> 'PROPIO',
      'datos_bancarios_enmascarados', true));
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_concepto(p_id bigint DEFAULT NULL::bigint, p_busqueda character varying DEFAULT NULL::character varying, p_categoria character varying DEFAULT NULL::character varying, p_naturaleza character varying DEFAULT NULL::character varying, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONSULTAR'
  );

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', c.id,
    'codigo', c.codigo,
    'nombre', c.nombre,
    'categoria', c.categoria,
    'naturaleza', c.naturaleza,
    'unidad', c.unidad,
    'requiere_evidencia', c.requiere_evidencia,
    'requiere_aprobacion', c.requiere_aprobacion,
    'permite_excepcion', c.permite_excepcion,
    'orden', c.orden,
    'id_estado', c.id_estado,
    'estado_nombre', e.nombre,
    'fecha_registro', c.fecha_registro,
    'fecha_actualizacion', c.fecha_actualizacion
  )
  FROM public.tb_compensacion_concepto c
  JOIN public.tb_estado e ON e.id = c.id_estado
  WHERE (p_id IS NULL OR c.id = p_id)
    AND (p_id_estado IS NULL OR c.id_estado = p_id_estado)
    AND (
      p_categoria IS NULL
      OR c.categoria = UPPER(TRIM(p_categoria))
    )
    AND (
      p_naturaleza IS NULL
      OR c.naturaleza = UPPER(TRIM(p_naturaleza))
    )
    AND (
      p_busqueda IS NULL
      OR c.codigo ILIKE '%' || TRIM(p_busqueda) || '%'
      OR c.nombre ILIKE '%' || TRIM(p_busqueda) || '%'
    )
  ORDER BY c.orden, c.nombre, c.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_evento(p_id bigint DEFAULT NULL::bigint, p_categoria character varying DEFAULT NULL::character varying, p_estado_evento character varying DEFAULT NULL::character varying, p_id_tipo_evento bigint DEFAULT NULL::bigint, p_id_colaborador bigint DEFAULT NULL::bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_fecha_desde date DEFAULT NULL::date, p_fecha_hasta date DEFAULT NULL::date, p_busqueda character varying DEFAULT NULL::character varying, p_pagina integer DEFAULT 1, p_tamano_pagina integer DEFAULT 50)
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
  v_pagina integer := GREATEST(COALESCE(p_pagina, 1), 1);
  v_tamano integer := LEAST(GREATEST(COALESCE(p_tamano_pagina, 50), 1), 200);
  v_total bigint;
  v_items jsonb;
  v_resumen jsonb;
BEGIN
  IF p_categoria='LLAMADA' THEN
    v_contexto:=public.f_private_compensacion_llamada_contexto('CONSULTAR');
  ELSIF p_id IS NOT NULL THEN
    v_contexto:=public.f_private_compensacion_evento_contexto(
      (SELECT id_tipo_evento FROM public.tb_compensacion_evento WHERE id=p_id),'CONSULTAR');
  ELSIF p_id_tipo_evento IS NOT NULL THEN
    v_contexto:=public.f_private_compensacion_evento_contexto(p_id_tipo_evento,'CONSULTAR');
  ELSIF p_categoria IS NOT NULL THEN
    v_contexto:=public.f_private_compensacion_contexto((CASE upper(btrim(p_categoria))
      WHEN 'CALIFICACION' THEN 'CALIFICACIONES' WHEN 'TARJETA_TERCERO' THEN 'TARJETAS'
      WHEN 'REFERIDO' THEN 'REFERIDOS' ELSE 'EVIDENCIAS' END)::varchar,'CONSULTAR');
  ELSE
    v_contexto := public.f_private_compensacion_contexto('EVIDENCIAS', 'CONSULTAR');
  END IF;
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  WITH base AS (
    SELECT
      ev.*,
      te.codigo AS tipo_codigo,
      te.nombre AS tipo_nombre,
      te.categoria,
      co.codigo AS concepto_codigo,
      co.nombre AS concepto_nombre,
      cb.nombre_completo AS beneficiario_nombre,
      cb.numero_documento AS beneficiario_documento,
      cr.nombre_completo AS responsable_nombre,
      so.nombre AS sucursal_origen_nombre,
      sr.nombre AS sucursal_responsable_nombre,
      ur.nombre AS usuario_registra_nombre,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(ref) ORDER BY ref.id)
        FROM public.tb_compensacion_evento_referencia ref
        WHERE ref.id_evento = ev.id
      ), '[]'::jsonb) AS referencias,
      COALESCE((
        SELECT jsonb_agg(
          to_jsonb(rev) || jsonb_build_object('usuario_revisor_nombre', uv.nombre)
          ORDER BY rev.numero_paso
        )
        FROM public.tb_compensacion_evento_revision rev
        JOIN public.tb_usuario uv ON uv.id = rev.id_usuario_revisor
        WHERE rev.id_evento = ev.id
      ), '[]'::jsonb) AS revisiones
    FROM public.tb_compensacion_evento ev
    JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
    LEFT JOIN public.tb_compensacion_concepto co ON co.id = te.id_concepto
    LEFT JOIN public.tb_compensacion_colaborador cb ON cb.id = ev.id_colaborador_beneficiario
    LEFT JOIN public.tb_compensacion_colaborador cr ON cr.id = ev.id_colaborador_responsable
    LEFT JOIN public.tb_sucursal so ON so.id = ev.id_sucursal_origen
    LEFT JOIN public.tb_sucursal sr ON sr.id = ev.id_sucursal_responsable
    JOIN public.tb_usuario ur ON ur.id = ev.id_usuario_registra
    WHERE (public.f_private_compensacion_equipo_visible(v_contexto,coalesce(ev.id_colaborador_beneficiario,ev.id_colaborador_responsable),(ev.fecha_evento AT TIME ZONE 'America/Lima')::date) OR coalesce((v_contexto->>'id_colaborador')::bigint IN(ev.id_colaborador_beneficiario,ev.id_colaborador_responsable),false))
      AND (te.categoria IN ('CALIFICACION', 'LLAMADA', 'TARJETA_TERCERO', 'REFERIDO', 'OTRO')
        OR (te.codigo = 'DETECCION_ERROR_MANUAL' AND ev.datos->>'flujo' = 'PAGOS_DETECCION_V1')
        OR (te.codigo = 'CUADRE_PERFECTO' AND (p_id IS NOT NULL OR p_id_tipo_evento IS NOT NULL))
        OR (te.codigo = 'AUDITAR_NUEVOS' AND p_id IS NOT NULL))
      AND (te.codigo<>'PROPUESTA_INNOVACION' OR COALESCE((v_contexto->>'es_super_admin')::boolean,false)
        OR ev.id_colaborador_beneficiario=v_id_colaborador_actor)
      AND (p_id IS NULL OR ev.id = p_id)
      AND (p_id_tipo_evento IS NULL OR ev.id_tipo_evento = p_id_tipo_evento)
      AND (p_categoria IS NULL OR te.categoria = UPPER(TRIM(p_categoria)))
      AND ((p_estado_evento IS NULL AND ev.estado_evento <> 'ANULADO') OR ev.estado_evento = UPPER(TRIM(p_estado_evento)))
      AND (
        p_id_colaborador IS NULL
        OR ev.id_colaborador_beneficiario = p_id_colaborador
        OR ev.id_colaborador_responsable = p_id_colaborador
      )
      AND (
        p_id_sucursal IS NULL
        OR ev.id_sucursal_origen = p_id_sucursal
        OR ev.id_sucursal_responsable = p_id_sucursal
      )
      AND (p_fecha_desde IS NULL OR (ev.fecha_evento AT TIME ZONE 'America/Lima')::date >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR (ev.fecha_evento AT TIME ZONE 'America/Lima')::date <= p_fecha_hasta)
      AND (
        p_busqueda IS NULL
        OR te.nombre ILIKE '%' || TRIM(p_busqueda) || '%'
        OR ev.titulo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR ev.descripcion ILIKE '%' || TRIM(p_busqueda) || '%'
        OR CASE WHEN te.categoria IN ('LLAMADA', 'TARJETA_TERCERO') THEN (ev.datos->>'cliente_documento') = btrim(p_busqueda) ELSE ev.datos->>'cliente_documento' ILIKE '%' || TRIM(p_busqueda) || '%' END
        OR ev.datos->>'cliente_nombre' ILIKE '%' || TRIM(p_busqueda) || '%'
        OR cb.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR CASE WHEN te.categoria IN ('LLAMADA', 'TARJETA_TERCERO') THEN (cb.numero_documento) = btrim(p_busqueda) ELSE cb.numero_documento ILIKE '%' || TRIM(p_busqueda) || '%' END
        OR (te.categoria='LLAMADA' AND (ur.nombre ILIKE '%' || TRIM(p_busqueda) || '%' OR ur.username ILIKE '%' || TRIM(p_busqueda) || '%'))
      )
      AND (
        v_alcance = 'GLOBAL'
        OR (
          v_alcance = 'PROPIO'
          AND v_id_colaborador_actor IN (
            ev.id_colaborador_beneficiario,
            ev.id_colaborador_responsable
          )
        )
        OR (
          v_alcance = 'SEDE'
          AND (
            v_id_sucursal_alcance IN (
              ev.id_sucursal_origen,
              ev.id_sucursal_responsable
            )
            OR EXISTS (
              SELECT 1
              FROM public.tb_compensacion_asignacion a
              WHERE a.id_colaborador IN (
                  ev.id_colaborador_beneficiario,
                  ev.id_colaborador_responsable
                )
                AND a.id_sucursal = v_id_sucursal_alcance
                AND a.fecha_inicio <= ev.fecha_evento::date
                AND (a.fecha_fin IS NULL OR a.fecha_fin >= ev.fecha_evento::date)
            )
          )
        )
      )
  ), conteo AS (
    SELECT COUNT(*) AS total FROM base
  ), resumen AS (
    SELECT jsonb_build_object(
      'borradores', COUNT(*) FILTER (WHERE estado_evento = 'BORRADOR'),
      'pendientes', COUNT(*) FILTER (WHERE estado_evento = 'PENDIENTE'),
      'aprobados', COUNT(*) FILTER (WHERE estado_evento = 'APROBADO'),
      'rechazados', COUNT(*) FILTER (WHERE estado_evento = 'RECHAZADO'),
      'anulados', COUNT(*) FILTER (WHERE estado_evento = 'ANULADO'),
      'importe_aprobado', COALESCE(SUM(importe_aprobado) FILTER (
        WHERE estado_evento IN ('APROBADO', 'LIQUIDADO')
          AND (tipo_codigo<>'PROPUESTA_INNOVACION' OR public.f_private_compensacion_innovacion_comprobada(id))
      ), 0)
    ) AS datos
    FROM base
  ), pagina AS (
    SELECT * FROM base
    ORDER BY fecha_evento DESC, id DESC
    LIMIT v_tamano OFFSET (v_pagina - 1) * v_tamano
  )
  SELECT conteo.total, resumen.datos,
         COALESCE(
           jsonb_agg((to_jsonb(pagina) || CASE WHEN pagina.tipo_codigo='PROPUESTA_INNOVACION'
             AND NOT public.f_private_compensacion_innovacion_comprobada(pagina.id)
             THEN jsonb_build_object('importe_aprobado',NULL) ELSE '{}'::jsonb END)
             ORDER BY pagina.fecha_evento DESC, pagina.id DESC)
             FILTER (WHERE pagina.id IS NOT NULL),
           '[]'::jsonb
         )
  INTO v_total, v_resumen, v_items
  FROM conteo
  CROSS JOIN resumen
  LEFT JOIN pagina ON true
  GROUP BY conteo.total, resumen.datos;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'resumen', COALESCE(v_resumen, '{}'::jsonb),
    'total', COALESCE(v_total, 0),
    'pagina', v_pagina,
    'tamano_pagina', v_tamano,
    'total_paginas', CASE
      WHEN COALESCE(v_total, 0) = 0 THEN 0
      ELSE CEIL(v_total::numeric / v_tamano)::integer
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_evento_tipo(p_id bigint DEFAULT NULL::bigint, p_categoria character varying DEFAULT NULL::character varying, p_busqueda character varying DEFAULT NULL::character varying, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
BEGIN
  BEGIN
    v_contexto := public.f_private_compensacion_contexto(
      'CATALOGO_EVIDENCIAS',
      'CONSULTAR'
    );
  EXCEPTION
    WHEN raise_exception THEN
      v_contexto := public.f_private_compensacion_contexto(
        'CONFIGURACION',
        'CONSULTAR'
      );
  END;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', t.id,
    'codigo', t.codigo,
    'nombre', t.nombre,
    'categoria', t.categoria,
    'id_concepto', t.id_concepto,
    'concepto_codigo', c.codigo,
    'concepto_nombre', c.nombre,
    'requiere_beneficiario', t.requiere_beneficiario,
    'requiere_responsable', t.requiere_responsable,
    'requiere_cliente', t.requiere_cliente,
    'requiere_operacion', t.requiere_operacion,
    'configuracion', t.configuracion,
    'id_estado', t.id_estado,
    'estado_nombre', es.nombre,
    'fecha_registro', t.fecha_registro,
    'fecha_actualizacion', t.fecha_actualizacion
  )
  FROM public.tb_compensacion_evento_tipo t
  LEFT JOIN public.tb_compensacion_concepto c ON c.id = t.id_concepto
  JOIN public.tb_estado es ON es.id = t.id_estado
  WHERE (NOT EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=(v_contexto->>'id_usuario')::bigint AND id_rol=2)
    OR t.codigo IN('PROPUESTA_INNOVACION','REFERIDO','REGISTRO_PRESENCIAL','CALIFICACION_PRESENCIAL','TIKTOK_LIVE','REPORTE_ABANDONO','DETECCION_ERROR_MANUAL'))
    AND (NOT EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=(v_contexto->>'id_usuario')::bigint AND id_rol=6)
      OR t.codigo IN('PROPUESTA_INNOVACION','TIKTOK_LIVE','REFERIDO','VIDEO_VIRAL','RECUPERACION_CLIENTE','ALERTA_TEMPRANA'))
    AND (p_id IS NULL OR t.id = p_id)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_categoria IS NULL OR t.categoria = UPPER(TRIM(p_categoria)))
    AND (
      p_busqueda IS NULL
      OR t.codigo ILIKE '%' || TRIM(p_busqueda) || '%'
      OR t.nombre ILIKE '%' || TRIM(p_busqueda) || '%'
    )
  ORDER BY t.categoria, t.nombre, t.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_excepcion(p_id bigint DEFAULT NULL::bigint, p_id_colaborador bigint DEFAULT NULL::bigint, p_id_concepto bigint DEFAULT NULL::bigint, p_estado_aprobacion character varying DEFAULT NULL::character varying, p_fecha_referencia date DEFAULT CURRENT_DATE, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS SETOF jsonb
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
  v_contexto := public.f_private_compensacion_contexto(
    'COLABORADORES',
    'CONSULTAR'
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

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', x.id,
    'id_colaborador', x.id_colaborador,
    'colaborador_nombre', c.nombre_completo,
    'colaborador_documento', c.numero_documento,
    'id_concepto', x.id_concepto,
    'concepto_codigo', co.codigo,
    'concepto_nombre', co.nombre,
    'concepto_naturaleza', co.naturaleza,
    'tipo_calculo', x.tipo_calculo,
    'monto', x.monto,
    'porcentaje', x.porcentaje,
    'configuracion', x.configuracion,
    'fecha_inicio', x.fecha_inicio,
    'fecha_fin', x.fecha_fin,
    'motivo', x.motivo,
    'estado_aprobacion', x.estado_aprobacion,
    'id_usuario_aprueba', x.id_usuario_aprueba,
    'fecha_aprobacion', x.fecha_aprobacion,
    'id_estado', x.id_estado,
    'estado_nombre', e.nombre,
    'es_vigente', (
      x.estado_aprobacion = 'APROBADA'
      AND x.fecha_inicio <= v_fecha
      AND (x.fecha_fin IS NULL OR x.fecha_fin >= v_fecha)
    ),
    'fecha_registro', x.fecha_registro,
    'fecha_actualizacion', x.fecha_actualizacion
  )
  FROM public.tb_compensacion_excepcion x
  JOIN public.tb_compensacion_colaborador c ON c.id = x.id_colaborador
  JOIN public.tb_compensacion_concepto co ON co.id = x.id_concepto
  JOIN public.tb_estado e ON e.id = x.id_estado
  WHERE (p_id IS NULL OR x.id = p_id)
    AND (p_id_colaborador IS NULL OR x.id_colaborador = p_id_colaborador)
    AND (p_id_concepto IS NULL OR x.id_concepto = p_id_concepto)
    AND (
      p_estado_aprobacion IS NULL
      OR x.estado_aprobacion = UPPER(TRIM(p_estado_aprobacion))
    )
    AND (p_id_estado IS NULL OR x.id_estado = p_id_estado)
    AND (
      v_alcance = 'GLOBAL'
      OR (
        v_alcance = 'PROPIO'
        AND x.id_colaborador = v_id_colaborador_actor
      )
      OR (
        v_alcance = 'SEDE'
        AND EXISTS (
          SELECT 1
          FROM public.tb_compensacion_asignacion a
          WHERE a.id_colaborador = x.id_colaborador
            AND a.id_sucursal = v_id_sucursal_alcance
            AND a.fecha_inicio <= v_fecha
            AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_fecha)
        )
      )
    )
  ORDER BY x.fecha_inicio DESC, c.nombre_completo, co.orden, x.id DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_exportacion(p_id_periodo bigint, p_tipo_reporte character varying DEFAULT NULL::character varying, p_formato character varying DEFAULT NULL::character varying, p_estado_exportacion character varying DEFAULT NULL::character varying, p_pagina integer DEFAULT 1, p_limite integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_usuario bigint;
  v_alcance text;
  v_id_sucursal bigint;
  v_total bigint;
  v_items jsonb;
  v_pagina integer := GREATEST(COALESCE(p_pagina, 1), 1);
  v_limite integer := LEAST(GREATEST(COALESCE(p_limite, 50), 1), 200);
BEGIN
  v_contexto := public.f_private_compensacion_reporte_contexto(
    p_id_periodo, 'CONSULTAR', NULL, NULL
  );
  v_id_usuario := (v_contexto ->> 'id_usuario')::bigint;
  v_alcance := v_contexto ->> 'alcance';
  v_id_sucursal := NULLIF(v_contexto ->> 'id_sucursal_efectiva', '')::bigint;

  WITH base AS (
    SELECT e.*
    FROM public.tb_compensacion_exportacion e
    WHERE e.id_periodo = p_id_periodo
      AND (p_tipo_reporte IS NULL OR e.tipo_reporte = UPPER(TRIM(p_tipo_reporte)))
      AND (p_formato IS NULL OR e.formato = UPPER(TRIM(p_formato)))
      AND (
        p_estado_exportacion IS NULL
        OR e.estado_exportacion = UPPER(TRIM(p_estado_exportacion))
      )
      AND (
        v_alcance = 'GLOBAL'
        OR (v_alcance = 'SEDE'
            AND NULLIF(e.filtros ->> 'id_sucursal', '')::bigint = v_id_sucursal)
        OR (v_alcance = 'PROPIO' AND e.id_usuario = v_id_usuario)
      )
  ), pagina AS (
    SELECT * FROM base
    ORDER BY fecha_registro DESC, id DESC
    OFFSET (v_pagina - 1) * v_limite
    LIMIT v_limite
  )
  SELECT
    (SELECT COUNT(*) FROM base),
    COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY fecha_registro DESC, id DESC)
              FROM pagina p), '[]'::jsonb)
  INTO v_total, v_items;

  RETURN jsonb_build_object(
    'pagina', v_pagina,
    'limite', v_limite,
    'total', v_total,
    'total_paginas', CASE WHEN v_total = 0 THEN 0
      ELSE CEIL(v_total::numeric / v_limite)::integer
    END,
    'items', v_items
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_incidencia(p_id bigint DEFAULT NULL::bigint, p_bandeja character varying DEFAULT 'TODOS'::character varying, p_categoria character varying DEFAULT NULL::character varying, p_estado_evento character varying DEFAULT NULL::character varying, p_id_penalidad_tipo bigint DEFAULT NULL::bigint, p_id_colaborador bigint DEFAULT NULL::bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_fecha_desde date DEFAULT NULL::date, p_fecha_hasta date DEFAULT NULL::date, p_busqueda character varying DEFAULT NULL::character varying, p_pagina integer DEFAULT 1, p_tamano_pagina integer DEFAULT 50, p_excluir_codigos text[] DEFAULT NULL::text[])
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
  v_id_sucursal_usuario bigint;
  v_bandeja character varying := UPPER(TRIM(COALESCE(p_bandeja, 'TODOS')));
  v_pagina integer := GREATEST(COALESCE(p_pagina, 1), 1);
  v_tamano integer := LEAST(GREATEST(COALESCE(p_tamano_pagina, 50), 1), 200);
  v_total bigint;
  v_items jsonb;
  v_resumen jsonb;
BEGIN
  IF v_bandeja NOT IN ('TODOS', 'RECIBIDOS', 'ENVIADOS', 'HISTORIAL') THEN
    RAISE EXCEPTION 'La bandeja debe ser TODOS, RECIBIDOS, ENVIADOS o HISTORIAL';
  END IF;

  v_contexto := public.f_private_compensacion_incidencias_contexto_lectura();
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;
  v_id_sucursal_usuario := NULLIF(v_contexto ->> 'id_sucursal_usuario', '')::bigint;

  WITH base AS (
    SELECT
      ev.*,
      te.codigo AS tipo_evento_codigo,
      te.nombre AS tipo_evento_nombre,
      te.categoria,
      COALESCE(ev.datos->'penalidad_tipo_snapshot'->>'codigo', pt.codigo) AS penalidad_codigo,
      COALESCE(ev.datos->'penalidad_tipo_snapshot'->>'nombre', pt.nombre) AS penalidad_nombre,
      COALESCE((ev.criterios_validacion_snapshot->>'importe_descuento')::numeric,
        (ev.datos->'penalidad_tipo_snapshot'->>'monto_referencia')::numeric, pt.monto_referencia) AS monto_referencia,
      COALESCE((ev.criterios_validacion_snapshot->>'importe_bono_reportante')::numeric,
        CASE WHEN ev.datos->'penalidad_tipo_snapshot' ? 'monto_bono_reportante'
          THEN (ev.datos->'penalidad_tipo_snapshot'->>'monto_bono_reportante')::numeric
          ELSE pt.monto_bono_reportante END) AS monto_bono_reportante,
      COALESCE((ev.datos->'penalidad_tipo_snapshot'->>'requiere_respuesta')::boolean, pt.requiere_respuesta) AS requiere_respuesta,
      reportante.nombre_completo AS reportante_nombre,
      reportante.numero_documento AS reportante_documento,
      responsable.nombre_completo AS responsable_nombre,
      responsable.numero_documento AS responsable_documento,
      so.nombre AS sucursal_origen_nombre,
      sr.nombre AS sucursal_responsable_nombre,
      ur.nombre AS usuario_registra_nombre,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(ref) ORDER BY ref.id)
        FROM public.tb_compensacion_evento_referencia ref
        WHERE ref.id_evento = ev.id
      ), '[]'::jsonb) AS referencias,
      COALESCE((
        SELECT jsonb_agg(
          to_jsonb(rev) || jsonb_build_object('usuario_revisor_nombre', uv.nombre)
          ORDER BY rev.numero_paso
        )
        FROM public.tb_compensacion_evento_revision rev
        JOIN public.tb_usuario uv ON uv.id = rev.id_usuario_revisor
        WHERE rev.id_evento = ev.id
      ), '[]'::jsonb) AS revisiones
    FROM public.tb_compensacion_evento ev
    JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
    JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id = ev.id_penalidad_tipo
    LEFT JOIN public.tb_compensacion_colaborador reportante
      ON reportante.id = ev.id_colaborador_beneficiario
    JOIN public.tb_compensacion_colaborador responsable
      ON responsable.id = ev.id_colaborador_responsable
    LEFT JOIN public.tb_sucursal so ON so.id = ev.id_sucursal_origen
    LEFT JOIN public.tb_sucursal sr ON sr.id = ev.id_sucursal_responsable
    JOIN public.tb_usuario ur ON ur.id = ev.id_usuario_registra
    WHERE public.f_private_compensacion_equipo_visible(v_contexto,ev.id_colaborador_responsable,(ev.fecha_evento AT TIME ZONE 'America/Lima')::date)
      AND te.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
      AND te.codigo NOT IN('DETECCION_ERROR_PAGO','OPERACION_EXTRA')
      AND (v_alcance<>'SEDE' OR (te.codigo='AUDITORIA_ACTIVA' AND ev.id_usuario_registra=(v_contexto->>'id_usuario')::bigint AND ev.id_colaborador_beneficiario=v_id_colaborador_actor))
      AND (p_id IS NULL OR ev.id = p_id)
      AND (p_categoria IS NULL OR te.categoria = UPPER(TRIM(p_categoria)))
      AND (p_estado_evento IS NULL OR ev.estado_evento = UPPER(TRIM(p_estado_evento)))
      AND (p_id_penalidad_tipo IS NULL OR ev.id_penalidad_tipo = p_id_penalidad_tipo)
      AND (p_excluir_codigos IS NULL OR NOT (COALESCE(ev.datos->'penalidad_tipo_snapshot'->>'codigo', pt.codigo) = ANY(p_excluir_codigos)))
      AND (
        p_id_colaborador IS NULL
        OR ev.id_colaborador_beneficiario = p_id_colaborador
        OR ev.id_colaborador_responsable = p_id_colaborador
      )
      AND (
        p_id_sucursal IS NULL
        OR ev.id_sucursal_origen = p_id_sucursal
        OR ev.id_sucursal_responsable = p_id_sucursal
      )
      AND (p_fecha_desde IS NULL OR ev.fecha_evento::date >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR ev.fecha_evento::date <= p_fecha_hasta)
      AND (
        p_busqueda IS NULL
        OR ev.titulo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR ev.descripcion ILIKE '%' || TRIM(p_busqueda) || '%'
        OR pt.nombre ILIKE '%' || TRIM(p_busqueda) || '%'
        OR reportante.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR responsable.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR responsable.numero_documento ILIKE '%' || TRIM(p_busqueda) || '%'
      )
      AND (
        v_alcance = 'GLOBAL'
        OR (v_alcance = 'PROPIO' AND (v_id_colaborador_actor = ev.id_colaborador_responsable
          OR (NOT coalesce((v_contexto->>'solo_responsable')::boolean,false) AND v_id_colaborador_actor = ev.id_colaborador_beneficiario)))
        OR (v_alcance = 'SEDE' AND v_id_sucursal_alcance IN (
          ev.id_sucursal_origen, ev.id_sucursal_responsable
        ))
      )
      AND (
        v_bandeja = 'TODOS'
        OR (v_bandeja = 'HISTORIAL' AND ev.estado_evento IN (
          'APROBADO', 'RECHAZADO', 'ANULADO', 'LIQUIDADO'
        ))
        OR (
          v_bandeja = 'RECIBIDOS'
          AND ev.estado_evento = 'PENDIENTE'
          AND (
            v_alcance = 'GLOBAL'
            OR ev.id_sucursal_responsable = COALESCE(
              v_id_sucursal_alcance, v_id_sucursal_usuario
            )
          )
        )
        OR (
          v_bandeja = 'ENVIADOS'
          AND ev.estado_evento = 'PENDIENTE'
          AND (
            v_alcance = 'GLOBAL'
            OR ev.id_sucursal_origen = COALESCE(
              v_id_sucursal_alcance, v_id_sucursal_usuario
            )
          )
        )
      )
  ), conteo AS (
    SELECT COUNT(*) AS total FROM base
  ), resumen AS (
    SELECT jsonb_build_object(
      'recibidos_pendientes', COUNT(*) FILTER (WHERE estado_evento = 'PENDIENTE'),
      'aprobados', COUNT(*) FILTER (WHERE estado_evento IN ('APROBADO', 'LIQUIDADO')),
      'rechazados', COUNT(*) FILTER (WHERE estado_evento = 'RECHAZADO'),
      'anulados', COUNT(*) FILTER (WHERE estado_evento = 'ANULADO'),
      'total_descuentos_aprobados', COALESCE(SUM(importe_aprobado) FILTER (
        WHERE estado_evento IN ('APROBADO', 'LIQUIDADO')
      ), 0),
      'total_bonos_reportantes', COALESCE(SUM(
        NULLIF(criterios_validacion_snapshot ->> 'importe_bono_reportante', '')::numeric
      ) FILTER (WHERE estado_evento IN ('APROBADO', 'LIQUIDADO')), 0)
    ) AS datos
    FROM base
  ), pagina AS (
    SELECT * FROM base
    ORDER BY fecha_evento DESC, id DESC
    LIMIT v_tamano OFFSET (v_pagina - 1) * v_tamano
  )
  SELECT conteo.total, resumen.datos,
         COALESCE(
           jsonb_agg(to_jsonb(pagina) ORDER BY pagina.fecha_evento DESC, pagina.id DESC)
             FILTER (WHERE pagina.id IS NOT NULL),
           '[]'::jsonb
         )
  INTO v_total, v_resumen, v_items
  FROM conteo
  CROSS JOIN resumen
  LEFT JOIN pagina ON true
  GROUP BY conteo.total, resumen.datos;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'resumen', COALESCE(v_resumen, '{}'::jsonb),
    'total', COALESCE(v_total, 0),
    'pagina', v_pagina,
    'tamano_pagina', v_tamano,
    'total_paginas', CASE
      WHEN COALESCE(v_total, 0) = 0 THEN 0
      ELSE CEIL(v_total::numeric / v_tamano)::integer
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_incidencia_catalogo(p_id_colaborador_responsable bigint DEFAULT NULL::bigint, p_fecha_evento date DEFAULT CURRENT_DATE)
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
  v_fecha date := COALESCE(p_fecha_evento, CURRENT_DATE);
  v_tipos jsonb;
  v_reportantes jsonb;
  v_responsables jsonb;
  v_penalidades jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_incidencias_contexto_lectura();
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'codigo', t.codigo,
    'nombre', t.nombre,
    'categoria', t.categoria,
    'requiere_cliente', t.requiere_cliente,
    'requiere_operacion', t.requiere_operacion
  ) ORDER BY t.categoria, t.nombre), '[]'::jsonb)
  INTO v_tipos
  FROM public.tb_compensacion_evento_tipo t
  JOIN public.tb_estado et ON et.id = t.id_estado
  WHERE t.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
    AND (v_alcance<>'SEDE' OR t.codigo='AUDITORIA_ACTIVA')
    AND (NOT EXISTS(SELECT 1 FROM public.tb_usuario u WHERE u.auth_user_id=auth.uid() AND u.id_rol=5 AND NOT coalesce(u.flag_super_admin,false)) OR t.codigo='REPORTE_PENALIDAD')
    AND UPPER(et.nombre) = 'ACTIVO';

  WITH vigentes AS (
    SELECT DISTINCT ON (a.id_colaborador)
      a.id_colaborador, a.id_sucursal, a.id_cargo
    FROM public.tb_compensacion_asignacion a
    JOIN public.tb_estado ea ON ea.id = a.id_estado
    WHERE a.fecha_inicio <= v_fecha
      AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_fecha)
      AND UPPER(ea.nombre) = 'ACTIVO'
    ORDER BY a.id_colaborador, a.fecha_inicio DESC, a.id DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'nombre', c.nombre_completo,
    'documento', c.numero_documento,
    'id_sucursal', v.id_sucursal,
    'sucursal', s.nombre
  ) ORDER BY c.nombre_completo), '[]'::jsonb)
  INTO v_reportantes
  FROM vigentes v
  JOIN public.tb_compensacion_colaborador c ON c.id = v.id_colaborador
  JOIN public.tb_estado ec ON ec.id = c.id_estado
  JOIN public.tb_sucursal s ON s.id = v.id_sucursal
  WHERE UPPER(ec.nombre) = 'ACTIVO'
    AND (v_alcance<>'SEDE' OR c.id=v_id_colaborador_actor)
    AND (
      v_alcance = 'GLOBAL'
      OR (v_alcance = 'SEDE' AND v.id_sucursal = v_id_sucursal_alcance)
      OR (v_alcance = 'PROPIO' AND c.id = v_id_colaborador_actor)
    );

  WITH vigentes AS (
    SELECT DISTINCT ON (a.id_colaborador)
      a.id_colaborador, a.id_sucursal, a.id_cargo
    FROM public.tb_compensacion_asignacion a
    JOIN public.tb_estado ea ON ea.id = a.id_estado
    WHERE a.fecha_inicio <= v_fecha
      AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_fecha)
      AND UPPER(ea.nombre) = 'ACTIVO'
    ORDER BY a.id_colaborador, a.fecha_inicio DESC, a.id DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'nombre', c.nombre_completo,
    'documento', c.numero_documento,
    'id_sucursal', v.id_sucursal,
    'sucursal', s.nombre
  ) ORDER BY c.nombre_completo), '[]'::jsonb)
  INTO v_responsables
  FROM vigentes v
  JOIN public.tb_compensacion_colaborador c ON c.id = v.id_colaborador
  JOIN public.tb_estado ec ON ec.id = c.id_estado
  JOIN public.tb_sucursal s ON s.id = v.id_sucursal
  WHERE UPPER(ec.nombre) = 'ACTIVO'
    AND public.f_private_compensacion_equipo_visible(v_contexto,c.id,v_fecha,false)
    AND (v_alcance<>'SEDE' OR (v.id_sucursal=v_id_sucursal_alcance AND (c.id=v_id_colaborador_actor
      OR EXISTS(SELECT 1 FROM public.tb_usuario u WHERE u.id=c.id_usuario AND u.id_rol NOT IN (1,3)))));

  IF p_id_colaborador_responsable IS NOT NULL AND NOT public.f_private_compensacion_equipo_visible(v_contexto,p_id_colaborador_responsable,v_fecha,false) THEN
    RAISE EXCEPTION 'El responsable no pertenece a su equipo vigente';
  END IF;
  WITH asignacion_responsable AS (
    SELECT a.id_cargo, a.id_plan
    FROM public.tb_compensacion_asignacion a
    WHERE a.id_colaborador = p_id_colaborador_responsable
      AND a.fecha_inicio <= v_fecha
      AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_fecha)
    ORDER BY a.fecha_inicio DESC, a.id DESC
    LIMIT 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pt.id,
    'codigo', pt.codigo,
    'nombre', pt.nombre,
    'descripcion', pt.descripcion,
    'monto_referencia', pt.monto_referencia,
    'monto_bono_reportante', pt.monto_bono_reportante,
    'requiere_respuesta', pt.requiere_respuesta
  ) ORDER BY pt.nombre), '[]'::jsonb)
  INTO v_penalidades
  FROM asignacion_responsable ar
  JOIN LATERAL public.f_private_compensacion_penalidades_fecha(ar.id_plan, v_fecha) pt
    ON (pt.id_cargo IS NULL OR pt.id_cargo = ar.id_cargo)
  JOIN public.tb_estado ep ON ep.id = pt.id_estado
  WHERE UPPER(ep.nombre) = 'ACTIVO'
    AND (v_alcance<>'SEDE' OR (pt.codigo NOT LIKE 'JEFE_%' AND CASE WHEN pt.codigo ~ '(UNIFORME|INDISCIPLINA)$'
      THEN p_id_colaborador_responsable IS DISTINCT FROM v_id_colaborador_actor ELSE pt.monto_bono_reportante IS NOT NULL END))
    AND (NOT EXISTS(SELECT 1 FROM public.tb_usuario WHERE id=(v_contexto->>'id_usuario')::bigint AND id_rol=5 AND NOT coalesce(flag_super_admin,false))
      OR public.f_private_compensacion_facturacion_concepto_operativo(pt.codigo));

  RETURN jsonb_build_object(
    'tipos', v_tipos,
    'reportantes', v_reportantes,
    'responsables', v_responsables,
    'penalidades', v_penalidades
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_incidencia_personal(p_id bigint DEFAULT NULL::bigint, p_bandeja character varying DEFAULT 'TODOS'::character varying, p_categoria character varying DEFAULT NULL::character varying, p_estado_evento character varying DEFAULT NULL::character varying, p_id_penalidad_tipo bigint DEFAULT NULL::bigint, p_id_colaborador bigint DEFAULT NULL::bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_fecha_desde date DEFAULT NULL::date, p_fecha_hasta date DEFAULT NULL::date, p_busqueda character varying DEFAULT NULL::character varying, p_pagina integer DEFAULT 1, p_tamano_pagina integer DEFAULT 50, p_concepto character varying DEFAULT NULL::character varying)
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
  v_id_sucursal_usuario bigint;
  v_bandeja character varying := UPPER(TRIM(COALESCE(p_bandeja, 'TODOS')));
  v_pagina integer := GREATEST(COALESCE(p_pagina, 1), 1);
  v_tamano integer := LEAST(GREATEST(COALESCE(p_tamano_pagina, 50), 1), 200);
  v_total bigint;
  v_items jsonb;
  v_resumen jsonb;
BEGIN
  IF v_bandeja NOT IN ('TODOS', 'RECIBIDOS', 'ENVIADOS', 'HISTORIAL') THEN
    RAISE EXCEPTION 'La bandeja debe ser TODOS, RECIBIDOS, ENVIADOS o HISTORIAL';
  END IF;

  v_contexto := public.f_private_compensacion_incidencias_contexto_lectura();
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;
  v_id_sucursal_usuario := NULLIF(v_contexto ->> 'id_sucursal_usuario', '')::bigint;

  WITH base AS (
    SELECT
      ev.*,
      te.codigo AS tipo_evento_codigo,
      te.nombre AS tipo_evento_nombre,
      te.categoria,
      COALESCE(ev.datos->'penalidad_tipo_snapshot'->>'codigo', pt.codigo) AS penalidad_codigo,
      COALESCE(ev.datos->'penalidad_tipo_snapshot'->>'nombre', pt.nombre) AS penalidad_nombre,
      COALESCE((ev.criterios_validacion_snapshot->>'importe_descuento')::numeric,
        (ev.datos->'penalidad_tipo_snapshot'->>'monto_referencia')::numeric, pt.monto_referencia) AS monto_referencia,
      COALESCE((ev.criterios_validacion_snapshot->>'importe_bono_reportante')::numeric,
        CASE WHEN ev.datos->'penalidad_tipo_snapshot' ? 'monto_bono_reportante'
          THEN (ev.datos->'penalidad_tipo_snapshot'->>'monto_bono_reportante')::numeric
          ELSE pt.monto_bono_reportante END) AS monto_bono_reportante,
      COALESCE((ev.datos->'penalidad_tipo_snapshot'->>'requiere_respuesta')::boolean, pt.requiere_respuesta) AS requiere_respuesta,
      reportante.nombre_completo AS reportante_nombre,
      reportante.numero_documento AS reportante_documento,
      responsable.nombre_completo AS responsable_nombre,
      responsable.numero_documento AS responsable_documento,
      so.nombre AS sucursal_origen_nombre,
      sr.nombre AS sucursal_responsable_nombre,
      ur.nombre AS usuario_registra_nombre,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(ref) ORDER BY ref.id)
        FROM public.tb_compensacion_evento_referencia ref
        WHERE ref.id_evento = ev.id
      ), '[]'::jsonb) AS referencias,
      COALESCE((
        SELECT jsonb_agg(
          to_jsonb(rev) || jsonb_build_object('usuario_revisor_nombre', uv.nombre)
          ORDER BY rev.numero_paso
        )
        FROM public.tb_compensacion_evento_revision rev
        JOIN public.tb_usuario uv ON uv.id = rev.id_usuario_revisor
        WHERE rev.id_evento = ev.id
      ), '[]'::jsonb) AS revisiones
    FROM public.tb_compensacion_evento ev
    JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
    JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id = ev.id_penalidad_tipo
    LEFT JOIN public.tb_compensacion_colaborador reportante
      ON reportante.id = ev.id_colaborador_beneficiario
    JOIN public.tb_compensacion_colaborador responsable
      ON responsable.id = ev.id_colaborador_responsable
    LEFT JOIN public.tb_sucursal so ON so.id = ev.id_sucursal_origen
    LEFT JOIN public.tb_sucursal sr ON sr.id = ev.id_sucursal_responsable
    JOIN public.tb_usuario ur ON ur.id = ev.id_usuario_registra
    WHERE ((p_concepto IN ('UNIFORME','INDISCIPLINA') AND upper(pt.codigo) LIKE '%' || p_concepto || '%') OR (p_concepto = 'ESCALONADA' AND upper(pt.codigo) LIKE '%ERROR_CUADRO%') OR (p_concepto = 'TODOS' AND (upper(pt.codigo) LIKE '%UNIFORME%' OR upper(pt.codigo) LIKE '%INDISCIPLINA%')))
      AND public.f_private_compensacion_equipo_visible(v_contexto,ev.id_colaborador_responsable,(ev.fecha_evento AT TIME ZONE 'America/Lima')::date)
      AND te.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
      AND te.codigo NOT IN('DETECCION_ERROR_PAGO','OPERACION_EXTRA')
      AND (v_alcance<>'SEDE' OR te.codigo IN('REPORTE_PENALIDAD','AUDITORIA_ACTIVA'))
      AND (p_id IS NULL OR ev.id = p_id)
      AND (p_categoria IS NULL OR te.categoria = UPPER(TRIM(p_categoria)))
      AND (p_estado_evento IS NULL OR ev.estado_evento = UPPER(TRIM(p_estado_evento)))
      AND (p_id_penalidad_tipo IS NULL OR ev.id_penalidad_tipo = p_id_penalidad_tipo)
      AND (
        p_id_colaborador IS NULL
        OR ev.id_colaborador_beneficiario = p_id_colaborador
        OR ev.id_colaborador_responsable = p_id_colaborador
      )
      AND (
        p_id_sucursal IS NULL
        OR ev.id_sucursal_origen = p_id_sucursal
        OR ev.id_sucursal_responsable = p_id_sucursal
      )
      AND (p_fecha_desde IS NULL OR ev.fecha_evento::date >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR ev.fecha_evento::date <= p_fecha_hasta)
      AND (
        p_busqueda IS NULL
        OR ev.titulo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR ev.descripcion ILIKE '%' || TRIM(p_busqueda) || '%'
        OR pt.nombre ILIKE '%' || TRIM(p_busqueda) || '%'
        OR reportante.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR responsable.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR responsable.numero_documento ILIKE '%' || TRIM(p_busqueda) || '%'
      )
      AND (
        v_alcance = 'GLOBAL'
        OR (v_alcance = 'PROPIO' AND (v_id_colaborador_actor = ev.id_colaborador_responsable
          OR (NOT coalesce((v_contexto->>'solo_responsable')::boolean,false) AND v_id_colaborador_actor = ev.id_colaborador_beneficiario)))
        OR (v_alcance = 'SEDE' AND v_id_sucursal_alcance IN (
          ev.id_sucursal_origen, ev.id_sucursal_responsable
        ))
      )
      AND (
        v_bandeja = 'TODOS'
        OR (v_bandeja = 'HISTORIAL' AND ev.estado_evento IN (
          'APROBADO', 'RECHAZADO', 'ANULADO', 'LIQUIDADO'
        ))
        OR (
          v_bandeja = 'RECIBIDOS'
          AND ev.estado_evento = 'PENDIENTE'
          AND (
            v_alcance = 'GLOBAL'
            OR ev.id_sucursal_responsable = COALESCE(
              v_id_sucursal_alcance, v_id_sucursal_usuario
            )
          )
        )
        OR (
          v_bandeja = 'ENVIADOS'
          AND ev.estado_evento = 'PENDIENTE'
          AND (
            v_alcance = 'GLOBAL'
            OR ev.id_sucursal_origen = COALESCE(
              v_id_sucursal_alcance, v_id_sucursal_usuario
            )
          )
        )
      )
  ), conteo AS (
    SELECT COUNT(*) AS total FROM base
  ), resumen AS (
    SELECT jsonb_build_object(
      'recibidos_pendientes', COUNT(*) FILTER (WHERE estado_evento = 'PENDIENTE'),
      'aprobados', COUNT(*) FILTER (WHERE estado_evento IN ('APROBADO', 'LIQUIDADO')),
      'rechazados', COUNT(*) FILTER (WHERE estado_evento = 'RECHAZADO'),
      'anulados', COUNT(*) FILTER (WHERE estado_evento = 'ANULADO'),
      'total_descuentos_aprobados', COALESCE(SUM(importe_aprobado) FILTER (
        WHERE estado_evento IN ('APROBADO', 'LIQUIDADO')
      ), 0),
      'total_bonos_reportantes', COALESCE(SUM(
        NULLIF(criterios_validacion_snapshot ->> 'importe_bono_reportante', '')::numeric
      ) FILTER (WHERE estado_evento IN ('APROBADO', 'LIQUIDADO')), 0)
    ) AS datos
    FROM base
  ), pagina AS (
    SELECT * FROM base
    ORDER BY fecha_evento DESC, id DESC
    LIMIT v_tamano OFFSET (v_pagina - 1) * v_tamano
  )
  SELECT conteo.total, resumen.datos,
         COALESCE(
           jsonb_agg(to_jsonb(pagina) ORDER BY pagina.fecha_evento DESC, pagina.id DESC)
             FILTER (WHERE pagina.id IS NOT NULL),
           '[]'::jsonb
         )
  INTO v_total, v_resumen, v_items
  FROM conteo
  CROSS JOIN resumen
  LEFT JOIN pagina ON true
  GROUP BY conteo.total, resumen.datos;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'resumen', COALESCE(v_resumen, '{}'::jsonb),
    'total', COALESCE(v_total, 0),
    'pagina', v_pagina,
    'tamano_pagina', v_tamano,
    'total_paginas', CASE
      WHEN COALESCE(v_total, 0) = 0 THEN 0
      ELSE CEIL(v_total::numeric / v_tamano)::integer
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_meta_sede(p_id bigint DEFAULT NULL::bigint, p_id_plan_version bigint DEFAULT NULL::bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_codigo_indicador character varying DEFAULT NULL::character varying, p_periodo date DEFAULT NULL::date, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONSULTAR'
  );

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', m.id,
    'id_plan_version', m.id_plan_version,
    'id_plan', pv.id_plan,
    'plan_nombre', p.nombre,
    'numero_version', pv.numero_version,
    'estado_version', pv.estado_version,
    'id_sucursal', m.id_sucursal,
    'sucursal_nombre', s.nombre,
    'codigo_indicador', m.codigo_indicador,
    'periodo', m.periodo,
    'valor_meta', m.valor_meta,
    'unidad', m.unidad,
    'configuracion', m.configuracion,
    'id_estado', m.id_estado,
    'estado_nombre', e.nombre,
    'fecha_registro', m.fecha_registro,
    'fecha_actualizacion', m.fecha_actualizacion
  )
  FROM public.tb_compensacion_meta_sede m
  JOIN public.tb_compensacion_plan_version pv ON pv.id = m.id_plan_version
  JOIN public.tb_compensacion_plan p ON p.id = pv.id_plan
  JOIN public.tb_sucursal s ON s.id = m.id_sucursal
  JOIN public.tb_estado e ON e.id = m.id_estado
  WHERE (p_id IS NULL OR m.id = p_id)
    AND (p_id_plan_version IS NULL OR m.id_plan_version = p_id_plan_version)
    AND (p_id_sucursal IS NULL OR m.id_sucursal = p_id_sucursal)
    AND (
      p_codigo_indicador IS NULL
      OR m.codigo_indicador = UPPER(TRIM(p_codigo_indicador))
    )
    AND (p_periodo IS NULL OR m.periodo = date_trunc('month', p_periodo)::date)
    AND (p_id_estado IS NULL OR m.id_estado = p_id_estado)
  ORDER BY m.periodo DESC, p.nombre, s.nombre, m.codigo_indicador;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_penalidad_tipo(p_id bigint DEFAULT NULL::bigint, p_id_plan_version bigint DEFAULT NULL::bigint, p_busqueda character varying DEFAULT NULL::character varying, p_id_cargo bigint DEFAULT NULL::bigint, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONSULTAR'
  );

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', t.id,
    'id_plan_version', t.id_plan_version,
    'id_plan', pv.id_plan,
    'plan_nombre', p.nombre,
    'numero_version', pv.numero_version,
    'estado_version', pv.estado_version,
    'codigo', t.codigo,
    'nombre', t.nombre,
    'descripcion', t.descripcion,
    'id_cargo', t.id_cargo,
    'cargo_nombre', ca.nombre,
    'id_concepto_descuento', t.id_concepto_descuento,
    'concepto_descuento_nombre', cd.nombre,
    'id_concepto_bono_reportante', t.id_concepto_bono_reportante,
    'concepto_bono_reportante_nombre', cb.nombre,
    'monto_referencia', t.monto_referencia,
    'monto_bono_reportante', t.monto_bono_reportante,
    'requiere_respuesta', t.requiere_respuesta,
    'configuracion', t.configuracion,
    'id_estado', t.id_estado,
    'estado_nombre', e.nombre,
    'fecha_registro', t.fecha_registro,
    'fecha_actualizacion', t.fecha_actualizacion
  )
  FROM public.tb_compensacion_penalidad_tipo t
  JOIN public.tb_compensacion_plan_version pv ON pv.id = t.id_plan_version
  JOIN public.tb_compensacion_plan p ON p.id = pv.id_plan
  LEFT JOIN public.tb_compensacion_cargo ca ON ca.id = t.id_cargo
  JOIN public.tb_compensacion_concepto cd ON cd.id = t.id_concepto_descuento
  LEFT JOIN public.tb_compensacion_concepto cb
    ON cb.id = t.id_concepto_bono_reportante
  JOIN public.tb_estado e ON e.id = t.id_estado
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_id_plan_version IS NULL OR t.id_plan_version = p_id_plan_version)
    AND (p_id_cargo IS NULL OR t.id_cargo = p_id_cargo)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (
      p_busqueda IS NULL
      OR t.codigo ILIKE '%' || TRIM(p_busqueda) || '%'
      OR t.nombre ILIKE '%' || TRIM(p_busqueda) || '%'
    )
  ORDER BY p.nombre, pv.numero_version DESC, t.nombre, t.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_periodo(p_id bigint DEFAULT NULL::bigint, p_periodo_desde date DEFAULT NULL::date, p_periodo_hasta date DEFAULT NULL::date, p_estado_periodo character varying DEFAULT NULL::character varying)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_alcance character varying;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION', 'CONSULTAR'
  );
  v_alcance := v_contexto ->> 'alcance';
  PERFORM public.f_private_compensacion_periodo_actual_asegurar();

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', pe.id,
    'periodo', pe.periodo,
    'nombre', pe.nombre,
    'fecha_inicio', pe.fecha_inicio,
    'fecha_fin', pe.fecha_fin,
    'zona_horaria', pe.zona_horaria,
    'estado_periodo', pe.estado_periodo,
    'numero_calculo', pe.numero_calculo,
    'fecha_apertura', pe.fecha_apertura,
    'fecha_aprobacion', pe.fecha_aprobacion,
    'fecha_cierre', pe.fecha_cierre,
    'id_usuario_abre', pe.id_usuario_abre,
    'apertura_automatica', pe.apertura_automatica,
    'id_usuario_actualiza', pe.id_usuario_actualiza,
    'fecha_actualizacion', pe.fecha_actualizacion,
    'eventos_pendientes', CASE WHEN v_alcance = 'GLOBAL' THEN (
        SELECT COUNT(*)
        FROM public.tb_compensacion_evento ev
        WHERE ev.fecha_evento::date BETWEEN pe.fecha_inicio AND pe.fecha_fin
          AND ev.estado_evento = 'PENDIENTE'
      )
      ELSE NULL
    END,
    'tiene_cierre_vigente', EXISTS (
      SELECT 1 FROM public.tb_compensacion_reporte_mes rm WHERE rm.id_periodo = pe.id AND rm.estado = 'CONFIRMADO'
    )
  )
  FROM public.tb_compensacion_periodo pe
  WHERE (p_id IS NULL OR pe.id = p_id)
    AND (
      p_periodo_desde IS NULL
      OR pe.periodo >= date_trunc('month', p_periodo_desde)::date
    )
    AND (
      p_periodo_hasta IS NULL
      OR pe.periodo <= date_trunc('month', p_periodo_hasta)::date
    )
    AND (
      p_estado_periodo IS NULL
      OR pe.estado_periodo = UPPER(TRIM(p_estado_periodo))
    )
  ORDER BY pe.periodo DESC, pe.id DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_plan(p_id bigint DEFAULT NULL::bigint, p_busqueda character varying DEFAULT NULL::character varying, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONSULTAR'
  );

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', p.id,
    'codigo', p.codigo,
    'nombre', p.nombre,
    'descripcion', p.descripcion,
    'id_estado', p.id_estado,
    'estado_nombre', e.nombre,
    'versiones', (
      SELECT COUNT(*)
      FROM public.tb_compensacion_plan_version pv
      WHERE pv.id_plan = p.id
    ),
    'version_publicada_actual', (
      SELECT jsonb_build_object(
        'id', pv.id,
        'numero_version', pv.numero_version,
        'fecha_inicio', pv.fecha_inicio,
        'fecha_fin', pv.fecha_fin
      )
      FROM public.tb_compensacion_plan_version pv
      WHERE pv.id_plan = p.id
        AND pv.estado_version = 'PUBLICADA'
        AND pv.fecha_inicio <= CURRENT_DATE
        AND (pv.fecha_fin IS NULL OR pv.fecha_fin >= CURRENT_DATE)
      ORDER BY pv.fecha_inicio DESC, pv.numero_version DESC
      LIMIT 1
    ),
    'id_usuario', p.id_usuario,
    'fecha_registro', p.fecha_registro,
    'fecha_actualizacion', p.fecha_actualizacion
  )
  FROM public.tb_compensacion_plan p
  JOIN public.tb_estado e ON e.id = p.id_estado
  WHERE (p_id IS NULL OR p.id = p_id)
    AND (p_id_estado IS NULL OR p.id_estado = p_id_estado)
    AND (
      p_busqueda IS NULL
      OR p.codigo ILIKE '%' || TRIM(p_busqueda) || '%'
      OR p.nombre ILIKE '%' || TRIM(p_busqueda) || '%'
    )
  ORDER BY p.nombre, p.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_plan_version(p_id bigint DEFAULT NULL::bigint, p_id_plan bigint DEFAULT NULL::bigint, p_estado_version character varying DEFAULT NULL::character varying, p_fecha_referencia date DEFAULT NULL::date)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONSULTAR'
  );

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', pv.id,
    'id_plan', pv.id_plan,
    'plan_codigo', p.codigo,
    'plan_nombre', p.nombre,
    'numero_version', pv.numero_version,
    'nombre', pv.nombre,
    'fecha_inicio', pv.fecha_inicio,
    'fecha_fin', pv.fecha_fin,
    'estado_version', pv.estado_version,
    'observacion', pv.observacion,
    'fecha_publicacion', pv.fecha_publicacion,
    'id_usuario_publica', pv.id_usuario_publica,
    'cantidad_reglas', (
      SELECT COUNT(*)
      FROM public.tb_compensacion_regla r
      WHERE r.id_plan_version = pv.id
    ),
    'es_vigente', (
      pv.estado_version = 'PUBLICADA'
      AND pv.fecha_inicio <= COALESCE(p_fecha_referencia, CURRENT_DATE)
      AND (
        pv.fecha_fin IS NULL
        OR pv.fecha_fin >= COALESCE(p_fecha_referencia, CURRENT_DATE)
      )
    ),
    'id_usuario', pv.id_usuario,
    'fecha_registro', pv.fecha_registro,
    'fecha_actualizacion', pv.fecha_actualizacion
  )
  FROM public.tb_compensacion_plan_version pv
  JOIN public.tb_compensacion_plan p ON p.id = pv.id_plan
  WHERE (p_id IS NULL OR pv.id = p_id)
    AND (p_id_plan IS NULL OR pv.id_plan = p_id_plan)
    AND (
      p_estado_version IS NULL
      OR pv.estado_version = UPPER(TRIM(p_estado_version))
    )
    AND (
      p_fecha_referencia IS NULL
      OR (
        pv.fecha_inicio <= p_fecha_referencia
        AND (pv.fecha_fin IS NULL OR pv.fecha_fin >= p_fecha_referencia)
      )
    )
  ORDER BY p.nombre, pv.numero_version DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_referido(p_id bigint DEFAULT NULL::bigint, p_id_colaborador_referente bigint DEFAULT NULL::bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_estado_referido character varying DEFAULT NULL::character varying, p_fecha_desde date DEFAULT NULL::date, p_fecha_hasta date DEFAULT NULL::date, p_busqueda character varying DEFAULT NULL::character varying, p_pagina integer DEFAULT 1, p_tamano_pagina integer DEFAULT 50)
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
  v_pagina integer := GREATEST(COALESCE(p_pagina, 1), 1);
  v_tamano integer := LEAST(GREATEST(COALESCE(p_tamano_pagina, 50), 1), 200);
  v_total bigint;
  v_items jsonb;
  v_resumen jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('REFERIDOS', 'CONSULTAR');
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  WITH base AS (
    SELECT
      r.*,
      public.f_private_compensacion_referido_match(r.id) AS coincidencia,
      ev.estado_evento,
      ev.periodo_imputacion,
      ev.fecha_actualizacion AS version_evento,
      (ev.datos->'declaracion_referido'->>'monto')::numeric AS monto_declarado,
      ev.datos->'declaracion_referido'->>'banco' AS banco_declarado,
      CASE WHEN r.estado_referido='VALIDADO' THEN COALESCE((SELECT sum(ro.importe_comision)
        FROM public.tb_compensacion_referido_operacion ro JOIN public.tb_compensacion_evento e ON e.id=ro.id_evento
        WHERE ro.id_referido=r.id AND e.estado_evento IN ('APROBADO','LIQUIDADO')),0) ELSE ev.importe_aprobado END AS importe_aprobado,
      ev.id_regla_aplicada,
      ev.id_sucursal_origen,
      ev.id_usuario_registra,
      s.nombre AS sucursal_nombre,
      c.nombre_completo AS referente_nombre,
      c.numero_documento AS referente_documento,
      cl.nombre AS cliente_nombre_actual,
      cl.numero_documento AS cliente_documento_actual,
      (SELECT count(*) FROM public.tb_compensacion_evento e JOIN public.tb_compensacion_evento_tipo t ON t.id=e.id_tipo_evento
        WHERE t.categoria='REFERIDO' AND e.datos->>'id_referido'=r.id::text AND e.estado_evento='PENDIENTE') AS efectivizaciones_pendientes,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(ro) ORDER BY ro.fecha_operacion_snapshot, ro.id)
        FROM public.tb_compensacion_referido_operacion ro
        WHERE ro.id_referido = r.id
      ), '[]'::jsonb) AS operaciones
    FROM public.tb_compensacion_referido r
    JOIN public.tb_compensacion_evento ev ON ev.id = r.id_evento
    JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
    JOIN public.tb_compensacion_colaborador c ON c.id = r.id_colaborador_referente
    JOIN public.tb_cliente cl ON cl.id = r.id_cliente
    LEFT JOIN public.tb_sucursal s ON s.id = ev.id_sucursal_origen
    WHERE public.f_private_compensacion_equipo_visible(v_contexto,r.id_colaborador_referente,(r.fecha_referencia AT TIME ZONE 'America/Lima')::date)
      AND te.categoria = 'REFERIDO'
      AND (p_id IS NULL OR r.id = p_id)
      AND (
        p_id_colaborador_referente IS NULL
        OR r.id_colaborador_referente = p_id_colaborador_referente
      )
      AND (p_id_sucursal IS NULL OR ev.id_sucursal_origen = p_id_sucursal)
      AND (
        p_estado_referido IS NULL
        OR r.estado_referido = UPPER(TRIM(p_estado_referido))
      )
      AND (p_fecha_desde IS NULL OR (r.fecha_referencia AT TIME ZONE 'America/Lima')::date >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR (r.fecha_referencia AT TIME ZONE 'America/Lima')::date <= p_fecha_hasta)
      AND (
        p_busqueda IS NULL
        OR r.nombre_referido_snapshot ILIKE '%' || TRIM(p_busqueda) || '%'
        OR r.documento_referido_snapshot = btrim(p_busqueda)
        OR c.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR c.numero_documento = btrim(p_busqueda)
      )
      AND (
        v_alcance = 'GLOBAL'
        OR (
          v_alcance = 'PROPIO'
          AND r.id_colaborador_referente = v_id_colaborador_actor
        )
        OR (
          v_alcance = 'SEDE'
          AND (
            ev.id_sucursal_origen = v_id_sucursal_alcance
            OR EXISTS (
              SELECT 1
              FROM public.tb_compensacion_asignacion a
              WHERE a.id_colaborador = r.id_colaborador_referente
                AND a.id_sucursal = v_id_sucursal_alcance
                AND a.fecha_inicio <= r.fecha_referencia::date
                AND (a.fecha_fin IS NULL OR a.fecha_fin >= r.fecha_referencia::date)
            )
          )
        )
      )
  ), conteo AS (
    SELECT COUNT(*) AS total FROM base
  ), resumen AS (
    SELECT jsonb_build_object(
      'pendientes', COUNT(*) FILTER (WHERE estado_referido = 'PENDIENTE'),
      'validados', COUNT(*) FILTER (WHERE estado_referido = 'VALIDADO'),
      'rechazados', COUNT(*) FILTER (WHERE estado_referido = 'RECHAZADO'),
      'anulados', COUNT(*) FILTER (WHERE estado_referido = 'ANULADO'),
      'efectivizaciones_pendientes', COALESCE(SUM(efectivizaciones_pendientes),0),
      'importe_validado', COALESCE(SUM(importe_aprobado) FILTER (
        WHERE estado_referido = 'VALIDADO'
      ), 0)
    ) AS datos
    FROM base
  ), pagina AS (
    SELECT * FROM base
    ORDER BY fecha_referencia DESC, id DESC
    LIMIT v_tamano OFFSET (v_pagina - 1) * v_tamano
  )
  SELECT conteo.total, resumen.datos,
         COALESCE(
           jsonb_agg(to_jsonb(pagina) ORDER BY pagina.fecha_referencia DESC, pagina.id DESC)
             FILTER (WHERE pagina.id IS NOT NULL),
           '[]'::jsonb
         )
  INTO v_total, v_resumen, v_items
  FROM conteo
  CROSS JOIN resumen
  LEFT JOIN pagina ON true
  GROUP BY conteo.total, resumen.datos;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'resumen', COALESCE(v_resumen, '{}'::jsonb),
    'total', COALESCE(v_total, 0),
    'pagina', v_pagina,
    'tamano_pagina', v_tamano,
    'total_paginas', CASE
      WHEN COALESCE(v_total, 0) = 0 THEN 0
      ELSE CEIL(v_total::numeric / v_tamano)::integer
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_regla(p_id bigint DEFAULT NULL::bigint, p_id_plan_version bigint DEFAULT NULL::bigint, p_id_concepto bigint DEFAULT NULL::bigint, p_id_cargo bigint DEFAULT NULL::bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_id_estado bigint DEFAULT NULL::bigint)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONSULTAR'
  );

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', r.id,
    'id_plan_version', r.id_plan_version,
    'plan_nombre', p.nombre,
    'numero_version', pv.numero_version,
    'estado_version', pv.estado_version,
    'id_concepto', r.id_concepto,
    'concepto_codigo', c.codigo,
    'concepto_nombre', c.nombre,
    'categoria', c.categoria,
    'naturaleza', c.naturaleza,
    'id_cargo', r.id_cargo,
    'cargo_nombre', ca.nombre,
    'id_sucursal', r.id_sucursal,
    'sucursal_nombre', s.nombre,
    'tipo_calculo', r.tipo_calculo,
    'monto', r.monto,
    'porcentaje', r.porcentaje,
    'valor_minimo', r.valor_minimo,
    'valor_maximo', r.valor_maximo,
    'tope_importe', r.tope_importe,
    'prioridad', r.prioridad,
    'configuracion', r.configuracion,
    'id_estado', r.id_estado,
    'estado_nombre', e.nombre,
    'fecha_registro', r.fecha_registro,
    'fecha_actualizacion', r.fecha_actualizacion
  )
  FROM public.tb_compensacion_regla r
  JOIN public.tb_compensacion_plan_version pv ON pv.id = r.id_plan_version
  JOIN public.tb_compensacion_plan p ON p.id = pv.id_plan
  JOIN public.tb_compensacion_concepto c ON c.id = r.id_concepto
  LEFT JOIN public.tb_compensacion_cargo ca ON ca.id = r.id_cargo
  LEFT JOIN public.tb_sucursal s ON s.id = r.id_sucursal
  JOIN public.tb_estado e ON e.id = r.id_estado
  WHERE (p_id IS NULL OR r.id = p_id)
    AND (p_id_plan_version IS NULL OR r.id_plan_version = p_id_plan_version)
    AND (p_id_concepto IS NULL OR r.id_concepto = p_id_concepto)
    AND (p_id_cargo IS NULL OR r.id_cargo = p_id_cargo)
    AND (p_id_sucursal IS NULL OR r.id_sucursal = p_id_sucursal)
    AND (p_id_estado IS NULL OR r.id_estado = p_id_estado)
  ORDER BY p.nombre, pv.numero_version DESC, c.orden, r.prioridad, r.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_reporte_conceptos(p_id_periodo bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_id_colaborador bigint DEFAULT NULL::bigint, p_categoria character varying DEFAULT NULL::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_sucursal bigint;
  v_id_colaborador bigint;
  v_items jsonb;
  v_total_ingresos numeric;
  v_total_descuentos numeric;
BEGIN
  v_contexto := public.f_private_compensacion_reporte_contexto(
    p_id_periodo, 'CONSULTAR', p_id_sucursal, p_id_colaborador
  );
  v_id_sucursal := NULLIF(v_contexto ->> 'id_sucursal_efectiva', '')::bigint;
  v_id_colaborador := NULLIF(v_contexto ->> 'id_colaborador_efectivo', '')::bigint;

  WITH base AS (
    SELECT *
    FROM public.f_private_compensacion_reporte_detalles(p_id_periodo)
    WHERE (v_id_sucursal IS NULL OR id_sucursal = v_id_sucursal)
      AND (v_id_colaborador IS NULL OR id_colaborador = v_id_colaborador)
      AND (
        NULLIF(BTRIM(p_categoria), '') IS NULL
        OR categoria = UPPER(TRIM(p_categoria))
      )
  ), agrupado AS (
    SELECT
      id_concepto,
      concepto_codigo,
      concepto_nombre,
      categoria,
      naturaleza,
      COUNT(*) AS total_lineas,
      COUNT(DISTINCT id_colaborador) AS total_colaboradores,
      SUM(importe) AS importe_total
    FROM base
    GROUP BY id_concepto, concepto_codigo, concepto_nombre, categoria, naturaleza
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(agrupado) ORDER BY categoria, concepto_nombre), '[]'::jsonb),
    COALESCE(SUM(importe_total) FILTER (WHERE naturaleza = 'INGRESO'), 0),
    COALESCE(SUM(importe_total) FILTER (WHERE naturaleza = 'DESCUENTO'), 0)
  INTO v_items, v_total_ingresos, v_total_descuentos
  FROM agrupado;

  RETURN jsonb_build_object(
    'periodo', v_contexto -> 'periodo',
    'fuente', v_contexto -> 'fuente_reporte',
    'filtros', jsonb_build_object(
      'id_sucursal', v_id_sucursal,
      'id_colaborador', v_id_colaborador,
      'categoria', NULLIF(UPPER(TRIM(p_categoria)), '')
    ),
    'total_ingresos', v_total_ingresos,
    'total_descuentos', v_total_descuentos,
    'total_neto', v_total_ingresos - v_total_descuentos,
    'items', v_items
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_reporte_financiero(p_id_periodo bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_id_colaborador bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_sucursal bigint;
  v_id_colaborador bigint;
  v_resumen jsonb;
  v_items jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_reporte_contexto(
    p_id_periodo, 'CONSULTAR', p_id_sucursal, p_id_colaborador
  );
  v_id_sucursal := NULLIF(v_contexto ->> 'id_sucursal_efectiva', '')::bigint;
  v_id_colaborador := NULLIF(v_contexto ->> 'id_colaborador_efectivo', '')::bigint;

  WITH base AS (
    SELECT *
    FROM public.f_private_compensacion_reporte_liquidaciones(p_id_periodo)
    WHERE (v_id_sucursal IS NULL OR id_sucursal = v_id_sucursal)
      AND (v_id_colaborador IS NULL OR id_colaborador = v_id_colaborador)
  )
  SELECT jsonb_build_object(
    'total_colaboradores', COUNT(*),
    'total_bonos', COALESCE(SUM(total_bonos), 0),
    'total_comisiones', COALESCE(SUM(total_comisiones), 0),
    'total_ingresos', COALESCE(SUM(total_bonos + total_comisiones), 0),
    'total_descuentos', COALESCE(SUM(total_descuentos), 0),
    'total_pagar', COALESCE(SUM(total_pagar), 0)
  ), COALESCE(jsonb_agg((to_jsonb(base) - 'id_liquidacion' - 'total_sueldo' - 'total_pagado' - 'total_pendiente') ORDER BY colaborador_nombre, id_colaborador), '[]'::jsonb)
  INTO v_resumen, v_items
  FROM base;

  RETURN jsonb_build_object(
    'periodo', v_contexto -> 'periodo',
    'estado_periodo', v_contexto -> 'estado_periodo',
    'fuente', v_contexto -> 'fuente_reporte',
    'id_cierre', v_contexto -> 'id_cierre_vigente',
    'filtros', jsonb_build_object(
      'id_sucursal', v_id_sucursal,
      'id_colaborador', v_id_colaborador
    ),
    'resumen', v_resumen,
    'items', v_items
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_reporte_productividad(p_id_periodo bigint, p_id_sucursal bigint DEFAULT NULL::bigint, p_id_colaborador bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_sucursal bigint;
  v_id_colaborador bigint;
  v_id_cierre bigint;
  v_periodo date;
  v_fecha_inicio date;
  v_fecha_fin date;
  v_zona_horaria text;
  v_items jsonb;
  v_resumen jsonb;
  v_resumen_sedes jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_reporte_contexto(
    p_id_periodo, 'CONSULTAR', p_id_sucursal, p_id_colaborador
  );
  v_id_sucursal := NULLIF(v_contexto ->> 'id_sucursal_efectiva', '')::bigint;
  v_id_colaborador := NULLIF(v_contexto ->> 'id_colaborador_efectivo', '')::bigint;
  v_id_cierre := NULLIF(v_contexto ->> 'id_cierre_vigente', '')::bigint;
  v_periodo := (v_contexto ->> 'periodo')::date;
  v_fecha_inicio := (v_contexto ->> 'fecha_inicio')::date;
  v_fecha_fin := (v_contexto ->> 'fecha_fin')::date;
  v_zona_horaria := v_contexto ->> 'zona_horaria';

  WITH base AS (
    SELECT
      b.*,
      co.id_usuario
    FROM public.f_private_compensacion_reporte_liquidaciones(p_id_periodo) b
    JOIN public.tb_compensacion_colaborador co ON co.id = b.id_colaborador
    WHERE (v_id_sucursal IS NULL OR b.id_sucursal = v_id_sucursal)
      AND (v_id_colaborador IS NULL OR b.id_colaborador = v_id_colaborador)
  ), metricas AS (
    SELECT
      b.id_colaborador,
      b.colaborador_nombre,
      b.colaborador_documento,
      b.id_sucursal,
      b.sucursal_nombre,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'clientes_registrados')::integer, 0)
        ELSE COALESCE(cli.clientes_registrados, 0)
      END AS clientes_registrados,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'clientes_convertidos_7_dias')::integer, 0)
        ELSE COALESCE(cli.clientes_convertidos_7_dias, 0)
      END AS clientes_convertidos_7_dias,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'clientes_solo_registro')::integer, 0)
        ELSE COALESCE(cli.clientes_registrados, 0)
             - COALESCE(cli.clientes_convertidos_7_dias, 0)
      END AS clientes_solo_registro,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'porcentaje_conversion_7_dias')::numeric, 0)
        WHEN COALESCE(cli.clientes_registrados, 0) = 0 THEN 0
        ELSE ROUND(
          cli.clientes_convertidos_7_dias::numeric
          / cli.clientes_registrados * 100,
          2
        )
      END AS porcentaje_conversion_7_dias,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'operaciones_pagadas_atribuidas')::integer, 0)
        ELSE COALESCE(op.operaciones_pagadas_atribuidas, 0)
      END AS operaciones_pagadas_atribuidas,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'calificaciones_aprobadas')::integer, 0)
        ELSE COALESCE(cal.calificaciones_aprobadas, 0)
      END AS calificaciones_aprobadas
    FROM base b
    LEFT JOIN LATERAL (
      SELECT NULL::jsonb AS item WHERE false
    ) s ON v_id_cierre IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::integer AS clientes_registrados,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1
          FROM public.tb_operacion_proceso opp
          WHERE opp.id_cliente = cliente.id AND (public.f_private_compensacion_cliente_nuevo_operacion_estado(opp.id)->>'pagada')::boolean
            AND UPPER(BTRIM(COALESCE(opp.nombre_estado, ''))) = 'PAGADO'
            AND NOT EXISTS (
              SELECT 1 FROM public.tb_operacion_proceso_eliminada oe
              WHERE oe.id_operacion_proceso = opp.id
            )
            AND (public.f_private_compensacion_cliente_nuevo_operacion_estado(opp.id)->>'fecha_pago')::timestamptz >= cliente.fecha_registro
            AND (public.f_private_compensacion_cliente_nuevo_operacion_estado(opp.id)->>'fecha_pago')::timestamptz <= cliente.fecha_registro + INTERVAL '7 days'
        ))::integer AS clientes_convertidos_7_dias
      FROM public.tb_cliente cliente
      WHERE cliente.id_usuario = b.id_usuario
        AND (cliente.fecha_registro AT TIME ZONE v_zona_horaria)::date
          BETWEEN v_fecha_inicio AND v_fecha_fin
    ) cli ON v_id_cierre IS NULL
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::integer AS operaciones_pagadas_atribuidas
      FROM public.tb_operacion_proceso opp
      WHERE COALESCE(opp.id_usuario_gestor, opp.id_usuario) = b.id_usuario
        AND UPPER(BTRIM(COALESCE(opp.nombre_estado, ''))) = 'PAGADO'
        AND NOT EXISTS (
          SELECT 1 FROM public.tb_operacion_proceso_eliminada oe
          WHERE oe.id_operacion_proceso = opp.id
        )
        AND (
          COALESCE(opp.fecha_pagado, opp.fecha_deposito_cliente, opp.fecha_registro)
          AT TIME ZONE v_zona_horaria
        )::date BETWEEN v_fecha_inicio AND v_fecha_fin
    ) op ON v_id_cierre IS NULL
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::integer AS calificaciones_aprobadas
      FROM public.tb_compensacion_evento ev
      JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
      WHERE ev.id_colaborador_beneficiario = b.id_colaborador
        AND ev.periodo_imputacion = v_periodo
        AND ev.estado_evento IN ('APROBADO', 'LIQUIDADO')
        AND te.categoria = 'CALIFICACION'
    ) cal ON v_id_cierre IS NULL
  ), sedes AS (
    SELECT
      id_sucursal,
      COALESCE(sucursal_nombre, 'Sin sede') AS sucursal_nombre,
      COUNT(*) AS total_colaboradores,
      SUM(clientes_registrados) AS clientes_registrados,
      SUM(clientes_convertidos_7_dias) AS clientes_convertidos_7_dias,
      SUM(clientes_solo_registro) AS clientes_solo_registro,
      SUM(operaciones_pagadas_atribuidas) AS operaciones_pagadas_atribuidas,
      SUM(calificaciones_aprobadas) AS calificaciones_aprobadas
    FROM metricas
    GROUP BY id_sucursal, sucursal_nombre
  )
  SELECT
    COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY colaborador_nombre) FROM metricas m), '[]'::jsonb),
    (SELECT jsonb_build_object(
      'total_colaboradores', COUNT(*),
      'clientes_registrados', COALESCE(SUM(clientes_registrados), 0),
      'clientes_convertidos_7_dias', COALESCE(SUM(clientes_convertidos_7_dias), 0),
      'clientes_solo_registro', COALESCE(SUM(clientes_solo_registro), 0),
      'porcentaje_conversion_7_dias', CASE
        WHEN COALESCE(SUM(clientes_registrados), 0) = 0 THEN 0
        ELSE ROUND(
          SUM(clientes_convertidos_7_dias)::numeric
          / SUM(clientes_registrados) * 100,
          2
        )
      END,
      'operaciones_pagadas_atribuidas', COALESCE(SUM(operaciones_pagadas_atribuidas), 0),
      'calificaciones_aprobadas', COALESCE(SUM(calificaciones_aprobadas), 0)
    ) FROM metricas),
    COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY sucursal_nombre) FROM sedes s), '[]'::jsonb)
  INTO v_items, v_resumen, v_resumen_sedes;

  RETURN jsonb_build_object(
    'periodo', v_contexto -> 'periodo',
    'fuente', v_contexto -> 'fuente_reporte',
    'definiciones', jsonb_build_object(
      'clientes_registrados', 'Clientes creados por el usuario durante el periodo',
      'clientes_convertidos_7_dias', 'Clientes con al menos una operacion pagada dentro de siete dias desde su registro',
      'operaciones_pagadas_atribuidas', 'Operaciones pagadas en el periodo atribuidas al gestor',
      'calificaciones_aprobadas', 'Calificaciones aprobadas o liquidadas imputadas al periodo'
    ),
    'resumen', v_resumen,
    'resumen_sedes', v_resumen_sedes,
    'items', v_items
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_reporte_sedes(p_id_periodo bigint, p_id_sucursal bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_id_sucursal bigint;
  v_items jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_reporte_contexto(
    p_id_periodo, 'CONSULTAR', p_id_sucursal, NULL
  );
  v_id_sucursal := NULLIF(v_contexto ->> 'id_sucursal_efectiva', '')::bigint;

  WITH base AS (
    SELECT *
    FROM public.f_private_compensacion_reporte_liquidaciones(p_id_periodo)
    WHERE (v_id_sucursal IS NULL OR id_sucursal = v_id_sucursal)
  ), agrupado AS (
    SELECT
      id_sucursal,
      COALESCE(sucursal_nombre, 'Sin sede') AS sucursal_nombre,
      COUNT(*) AS total_colaboradores,
      SUM(total_bonos) AS total_bonos,
      SUM(total_comisiones) AS total_comisiones,
      SUM(total_descuentos) AS total_descuentos,
      SUM(total_pagar) AS total_pagar
    FROM base
    GROUP BY id_sucursal, sucursal_nombre
  )
  SELECT COALESCE(
    jsonb_agg(to_jsonb(agrupado) ORDER BY sucursal_nombre),
    '[]'::jsonb
  ) INTO v_items
  FROM agrupado;

  RETURN jsonb_build_object(
    'periodo', v_contexto -> 'periodo',
    'fuente', v_contexto -> 'fuente_reporte',
    'regla_atribucion_sede', 'Ultima asignacion vigente dentro del periodo',
    'items', v_items
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_usuario_acceso(p_busqueda character varying DEFAULT NULL::character varying)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONSULTAR'
  );

  IF NOT COALESCE((v_contexto ->> 'es_super_admin')::boolean, false)
     AND v_contexto ->> 'alcance' <> 'GLOBAL' THEN
    RAISE EXCEPTION 'Solo un acceso global puede consultar usuarios para permisos';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', u.id,
    'nombre', u.nombre,
    'username', u.username,
    'rol_nombre', r.nombre,
    'id_sucursal', u.id_sucursal,
    'sucursal_nombre', s.nombre
  )
  FROM public.tb_usuario u
  JOIN public.tb_estado e ON e.id = u.id_estado
  LEFT JOIN public.tb_rol r ON r.id = u.id_rol
  LEFT JOIN public.tb_sucursal s ON s.id = u.id_sucursal
  WHERE UPPER(BTRIM(e.nombre)) = 'ACTIVO'
    AND (
      p_busqueda IS NULL
      OR u.nombre ILIKE '%' || BTRIM(p_busqueda) || '%'
      OR u.username ILIKE '%' || BTRIM(p_busqueda) || '%'
      OR u.email ILIKE '%' || BTRIM(p_busqueda) || '%'
    )
  ORDER BY u.nombre, u.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_usuario_elegible(p_busqueda character varying DEFAULT NULL::character varying, p_id_colaborador bigint DEFAULT NULL::bigint)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contexto jsonb;
  v_alcance character varying;
  v_id_usuario_actor bigint;
  v_id_sucursal_alcance bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'COLABORADORES',
    CASE WHEN p_id_colaborador IS NULL THEN 'REGISTRAR' ELSE 'EDITAR' END
  );
  v_alcance := v_contexto ->> 'alcance';
  v_id_usuario_actor := (v_contexto ->> 'id_usuario')::bigint;
  v_id_sucursal_alcance := NULLIF(
    v_contexto ->> 'id_sucursal_alcance',
    ''
  )::bigint;

  IF p_id_colaborador IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.tb_compensacion_colaborador
       WHERE id = p_id_colaborador
     ) THEN
    RAISE EXCEPTION 'El colaborador indicado no existe';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'nombre', u.nombre,
    'email', u.email,
    'id_rol', u.id_rol,
    'rol_nombre', r.nombre,
    'id_sucursal', u.id_sucursal,
    'sucursal_nombre', s.nombre,
    'id_estado', u.id_estado,
    'estado_nombre', e.nombre,
    'id_colaborador', c.id
  )
  FROM public.tb_usuario u
  JOIN public.tb_estado e ON e.id = u.id_estado
  LEFT JOIN public.tb_rol r ON r.id = u.id_rol
  LEFT JOIN public.tb_sucursal s ON s.id = u.id_sucursal
  LEFT JOIN public.tb_compensacion_colaborador c ON c.id_usuario = u.id
  WHERE (c.id IS NULL OR c.id = p_id_colaborador)
    AND (
      v_alcance = 'GLOBAL'
      OR (v_alcance = 'SEDE' AND u.id_sucursal = v_id_sucursal_alcance)
      OR (v_alcance = 'PROPIO' AND u.id = v_id_usuario_actor)
    )
    AND (
      UPPER(BTRIM(e.nombre)) = 'ACTIVO'
      OR c.id = p_id_colaborador
    )
    AND (
      p_busqueda IS NULL
      OR u.nombre ILIKE '%' || BTRIM(p_busqueda) || '%'
      OR u.username ILIKE '%' || BTRIM(p_busqueda) || '%'
      OR u.email ILIKE '%' || BTRIM(p_busqueda) || '%'
    )
  ORDER BY u.nombre, u.id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
