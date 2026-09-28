-- ============================================================================
-- COMPENSACIONES - INCIDENCIAS CRUZADAS Y AUDITORIA DE PAGOS
-- ============================================================================
-- Objetivo:
--   Gestionar reportes entre sedes y auditorias de pagos sobre el evento comun.
--   Una aprobacion congela atomicamente el descuento del responsable y, cuando
--   corresponda, el bono del reportante. No crea movimientos de caja.
--
-- Dependencias:
--   17.compensaciones_personal_configuracion.sql
--   18.compensaciones_asistencia_evidencias.sql
--   20.compensaciones_seguridad_personal_funciones.sql
--   23.compensaciones_metas_excepciones_penalidades_funciones.sql
-- ============================================================================

-- ============================================================================
-- 1. VALIDACION PRIVADA DE ALCANCE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_compensacion_incidencia_validar_alcance(
  p_id_evento bigint,
  p_accion character varying,
  p_bloquear boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_evento public.tb_compensacion_evento%ROWTYPE;
  v_contexto jsonb;
  v_alcance character varying;
  v_accion character varying := UPPER(TRIM(COALESCE(p_accion, '')));
  v_id_colaborador_actor bigint;
  v_id_sucursal_alcance bigint;
BEGIN
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

  IF v_accion IN ('REVISAR', 'APROBAR') THEN
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
$$;

REVOKE ALL ON FUNCTION public.f_private_compensacion_incidencia_validar_alcance(
  bigint, character varying, boolean
) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. CATALOGOS DISPONIBLES PARA EL FLUJO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_incidencia_catalogo(
  p_id_colaborador_responsable bigint DEFAULT NULL,
  p_fecha_evento date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
  v_contexto := public.f_private_compensacion_contexto('INCIDENCIAS', 'CONSULTAR');
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
    AND (
      v_alcance = 'GLOBAL'
      OR (v_alcance = 'SEDE' AND v.id_sucursal = v_id_sucursal_alcance)
      OR (v_alcance = 'PROPIO' AND c.id = v_id_colaborador_actor)
    );

  WITH vigentes AS (
    SELECT DISTINCT ON (a.id_colaborador)
      a.id_colaborador, a.id_sucursal, a.id_cargo, pv.id AS id_plan_version
    FROM public.tb_compensacion_asignacion a
    JOIN public.tb_estado ea ON ea.id = a.id_estado
    JOIN public.tb_compensacion_plan_version pv
      ON pv.id_plan = a.id_plan
     AND pv.estado_version = 'PUBLICADA'
     AND pv.fecha_inicio <= v_fecha
     AND (pv.fecha_fin IS NULL OR pv.fecha_fin >= v_fecha)
    WHERE a.fecha_inicio <= v_fecha
      AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_fecha)
      AND UPPER(ea.nombre) = 'ACTIVO'
    ORDER BY a.id_colaborador, a.fecha_inicio DESC, pv.numero_version DESC, a.id DESC
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
  WHERE UPPER(ec.nombre) = 'ACTIVO';

  WITH asignacion_responsable AS (
    SELECT a.id_cargo, pv.id AS id_plan_version
    FROM public.tb_compensacion_asignacion a
    JOIN public.tb_compensacion_plan_version pv
      ON pv.id_plan = a.id_plan
     AND pv.estado_version = 'PUBLICADA'
     AND pv.fecha_inicio <= v_fecha
     AND (pv.fecha_fin IS NULL OR pv.fecha_fin >= v_fecha)
    WHERE a.id_colaborador = p_id_colaborador_responsable
      AND a.fecha_inicio <= v_fecha
      AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_fecha)
    ORDER BY a.fecha_inicio DESC, pv.numero_version DESC, a.id DESC
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
  JOIN public.tb_compensacion_penalidad_tipo pt
    ON pt.id_plan_version = ar.id_plan_version
   AND (pt.id_cargo IS NULL OR pt.id_cargo = ar.id_cargo)
  JOIN public.tb_estado ep ON ep.id = pt.id_estado
  WHERE UPPER(ep.nombre) = 'ACTIVO';

  RETURN jsonb_build_object(
    'tipos', v_tipos,
    'reportantes', v_reportantes,
    'responsables', v_responsables,
    'penalidades', v_penalidades
  );
END;
$$;

-- ============================================================================
-- 3. BANDEJAS RECIBIDOS, ENVIADOS E HISTORIAL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_incidencia(
  p_id bigint DEFAULT NULL,
  p_bandeja character varying DEFAULT 'TODOS',
  p_categoria character varying DEFAULT NULL,
  p_estado_evento character varying DEFAULT NULL,
  p_id_penalidad_tipo bigint DEFAULT NULL,
  p_id_colaborador bigint DEFAULT NULL,
  p_id_sucursal bigint DEFAULT NULL,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL,
  p_busqueda character varying DEFAULT NULL,
  p_pagina integer DEFAULT 1,
  p_tamano_pagina integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
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

  v_contexto := public.f_private_compensacion_contexto('INCIDENCIAS', 'CONSULTAR');
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
      pt.codigo AS penalidad_codigo,
      pt.nombre AS penalidad_nombre,
      pt.monto_referencia,
      pt.monto_bono_reportante,
      pt.requiere_respuesta,
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
    WHERE te.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
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
        OR (v_alcance = 'PROPIO' AND v_id_colaborador_actor IN (
          ev.id_colaborador_beneficiario, ev.id_colaborador_responsable
        ))
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
$$;

-- ============================================================================
-- 4. REGISTRO DE INCIDENCIA
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_incidencia(
  p_id_tipo_evento bigint,
  p_id_penalidad_tipo bigint,
  p_id_colaborador_responsable bigint,
  p_fecha_evento timestamp with time zone,
  p_motivo text,
  p_id_colaborador_reportante bigint DEFAULT NULL,
  p_titulo character varying DEFAULT NULL,
  p_evidencia jsonb DEFAULT '[]'::jsonb,
  p_referencias jsonb DEFAULT '[]'::jsonb,
  p_clave_origen character varying DEFAULT NULL,
  p_fuente character varying DEFAULT 'MANUAL'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_alcance character varying;
  v_id_colaborador_actor bigint;
  v_id_sucursal_alcance bigint;
  v_id_reportante bigint;
  v_id_sucursal_origen bigint;
  v_id_sucursal_responsable bigint;
  v_id_plan_version bigint;
  v_id_cargo_responsable bigint;
  v_tipo public.tb_compensacion_evento_tipo%ROWTYPE;
  v_penalidad public.tb_compensacion_penalidad_tipo%ROWTYPE;
  v_id bigint;
  v_ref jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('INCIDENCIAS', 'REGISTRAR');
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;
  v_id_reportante := COALESCE(p_id_colaborador_reportante, v_id_colaborador_actor);

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

  SELECT a.id_sucursal
  INTO v_id_sucursal_origen
  FROM public.tb_compensacion_asignacion a
  WHERE a.id_colaborador = v_id_reportante
    AND a.fecha_inicio <= p_fecha_evento::date
    AND (a.fecha_fin IS NULL OR a.fecha_fin >= p_fecha_evento::date)
  ORDER BY a.fecha_inicio DESC, a.id DESC
  LIMIT 1;

  SELECT a.id_sucursal, a.id_cargo, pv.id
  INTO v_id_sucursal_responsable, v_id_cargo_responsable, v_id_plan_version
  FROM public.tb_compensacion_asignacion a
  JOIN public.tb_compensacion_plan_version pv
    ON pv.id_plan = a.id_plan
   AND pv.estado_version = 'PUBLICADA'
   AND pv.fecha_inicio <= p_fecha_evento::date
   AND (pv.fecha_fin IS NULL OR pv.fecha_fin >= p_fecha_evento::date)
  WHERE a.id_colaborador = p_id_colaborador_responsable
    AND a.fecha_inicio <= p_fecha_evento::date
    AND (a.fecha_fin IS NULL OR a.fecha_fin >= p_fecha_evento::date)
  ORDER BY a.fecha_inicio DESC, pv.numero_version DESC, a.id DESC
  LIMIT 1;

  IF v_id_sucursal_origen IS NULL THEN
    RAISE EXCEPTION 'El reportante no tiene asignacion vigente para la fecha';
  END IF;

  IF v_id_sucursal_responsable IS NULL THEN
    RAISE EXCEPTION 'El responsable no tiene asignacion y matriz publicada para la fecha';
  END IF;

  IF v_alcance = 'PROPIO' AND v_id_reportante IS DISTINCT FROM v_id_colaborador_actor THEN
    RAISE EXCEPTION 'Solo puede registrar incidencias como reportante';
  END IF;

  IF v_alcance = 'SEDE' AND v_id_sucursal_origen IS DISTINCT FROM v_id_sucursal_alcance THEN
    RAISE EXCEPTION 'El reportante no pertenece a su sede autorizada';
  END IF;

  SELECT pt.* INTO v_penalidad
  FROM public.tb_compensacion_penalidad_tipo pt
  JOIN public.tb_estado es ON es.id = pt.id_estado
  WHERE pt.id = p_id_penalidad_tipo
    AND pt.id_plan_version = v_id_plan_version
    AND (pt.id_cargo IS NULL OR pt.id_cargo = v_id_cargo_responsable)
    AND UPPER(es.nombre) = 'ACTIVO';

  IF v_penalidad.id IS NULL THEN
    RAISE EXCEPTION 'La penalidad no aplica a la matriz o cargo vigente del responsable';
  END IF;

  IF v_tipo.categoria = 'AUDITORIA_PAGO'
     AND (
       v_penalidad.id_concepto_bono_reportante IS NULL
       OR v_penalidad.monto_bono_reportante IS NULL
     ) THEN
    RAISE EXCEPTION 'La auditoria de pagos requiere concepto y monto de bono al reportante';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tb_compensacion_periodo pe
    WHERE pe.periodo = date_trunc('month', p_fecha_evento)::date
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
    p_fecha_evento, date_trunc('month', p_fecha_evento)::date,
    UPPER(TRIM(COALESCE(p_fuente, 'MANUAL'))), NULLIF(TRIM(p_clave_origen), ''),
    COALESCE(NULLIF(TRIM(p_titulo), ''), v_penalidad.nombre), TRIM(p_motivo),
    jsonb_build_object(
      'penalidad_tipo_snapshot', jsonb_build_object(
        'id', v_penalidad.id,
        'codigo', v_penalidad.codigo,
        'nombre', v_penalidad.nombre,
        'id_plan_version', v_penalidad.id_plan_version,
        'id_concepto_descuento', v_penalidad.id_concepto_descuento,
        'monto_referencia', v_penalidad.monto_referencia,
        'id_concepto_bono_reportante', v_penalidad.id_concepto_bono_reportante,
        'monto_bono_reportante', v_penalidad.monto_bono_reportante,
        'configuracion', v_penalidad.configuracion
      )
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_incidencia_referencia(
  p_id_evento bigint,
  p_tipo_referencia character varying,
  p_id_cliente bigint DEFAULT NULL,
  p_id_operacion bigint DEFAULT NULL,
  p_identificador_externo character varying DEFAULT NULL,
  p_datos_snapshot jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_incidencia(
  p_id bigint,
  p_titulo character varying DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_evidencia jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
$$;

-- ============================================================================
-- 5. ENVIO Y DECISION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_incidencia_enviar(
  p_id bigint,
  p_comentario text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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

  IF v_evento.estado_evento <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se pueden enviar incidencias en borrador';
  END IF;

  IF jsonb_array_length(v_evento.evidencia) = 0 THEN
    RAISE EXCEPTION 'La incidencia requiere evidencia antes de enviarse';
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_incidencia_descargo(
  p_id bigint,
  p_comentario text,
  p_evidencia jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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

  IF p_evidencia IS NULL OR jsonb_typeof(p_evidencia) <> 'array' THEN
    RAISE EXCEPTION 'La evidencia del descargo debe ser un arreglo JSON';
  END IF;

  v_contexto := public.f_private_compensacion_contexto('INCIDENCIAS', 'REGISTRAR');
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;

  SELECT * INTO v_evento
  FROM public.tb_compensacion_evento
  WHERE id = p_id
  FOR UPDATE;

  IF v_evento.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_evento_tipo t
    WHERE t.id = v_evento.id_tipo_evento
      AND t.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
  ) THEN
    RAISE EXCEPTION 'La incidencia no existe';
  END IF;

  IF v_evento.estado_evento <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo se puede responder una incidencia pendiente';
  END IF;

  IF v_id_colaborador_actor IS DISTINCT FROM v_evento.id_colaborador_responsable THEN
    RAISE EXCEPTION 'Solo el colaborador responsable puede presentar su descargo';
  END IF;

  SELECT * INTO v_penalidad
  FROM public.tb_compensacion_penalidad_tipo
  WHERE id = v_evento.id_penalidad_tipo;

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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_incidencia_resolver(
  p_id bigint,
  p_decision character varying,
  p_comentario text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
  SELECT * INTO v_penalidad FROM public.tb_compensacion_penalidad_tipo WHERE id = v_evento.id_penalidad_tipo;

  IF v_evento.estado_evento <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo se pueden resolver incidencias pendientes';
  END IF;

  IF v_id_actor = v_evento.id_usuario_registra
     OR v_id_colaborador_actor IN (
       v_evento.id_colaborador_beneficiario,
       v_evento.id_colaborador_responsable
     ) THEN
    RAISE EXCEPTION 'El reportante, el responsable o el registrador no pueden resolver la incidencia';
  END IF;

  IF v_decision = 'RECHAZADO' AND NULLIF(TRIM(p_comentario), '') IS NULL THEN
    RAISE EXCEPTION 'Debe indicar el motivo del rechazo';
  END IF;

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
    v_snapshot := jsonb_build_object(
      'id_penalidad_tipo', v_penalidad.id,
      'codigo_penalidad', v_penalidad.codigo,
      'id_plan_version', v_penalidad.id_plan_version,
      'id_concepto_descuento', v_penalidad.id_concepto_descuento,
      'importe_descuento', v_penalidad.monto_referencia,
      'id_colaborador_responsable', v_evento.id_colaborador_responsable,
      'id_concepto_bono_reportante', v_penalidad.id_concepto_bono_reportante,
      'importe_bono_reportante', COALESCE(v_penalidad.monto_bono_reportante, 0),
      'id_colaborador_reportante', v_evento.id_colaborador_beneficiario,
      'categoria', v_tipo.categoria,
      'configuracion_penalidad', v_penalidad.configuracion,
      'fecha_decision', now()
    );

    UPDATE public.tb_compensacion_evento
    SET estado_evento = 'APROBADO',
        base_calculo = 1,
        cantidad = 1,
        tarifa_aplicada = v_penalidad.monto_referencia,
        importe_aprobado = v_penalidad.monto_referencia,
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
      WHEN v_decision = 'APROBADO' THEN v_penalidad.monto_referencia ELSE NULL
    END,
    'importe_bono_reportante', CASE
      WHEN v_decision = 'APROBADO' THEN COALESCE(v_penalidad.monto_bono_reportante, 0)
      ELSE NULL
    END,
    'mensaje', CASE
      WHEN v_decision = 'APROBADO' THEN 'Incidencia aprobada con efectos congelados'
      ELSE 'Incidencia rechazada'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_incidencia_observar(
  p_id bigint,
  p_comentario text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_incidencia_anular(
  p_id bigint,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
$$;

-- ============================================================================
-- PERMISOS DE EJECUCION
-- ============================================================================

DO $permissions$
DECLARE
  v_function regprocedure;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'f_get_tb_compensacion_incidencia_catalogo',
        'f_get_tb_compensacion_incidencia',
        'f_post_tb_compensacion_incidencia',
        'f_post_tb_compensacion_incidencia_referencia',
        'f_patch_tb_compensacion_incidencia',
        'f_post_tb_compensacion_incidencia_enviar',
        'f_post_tb_compensacion_incidencia_descargo',
        'f_post_tb_compensacion_incidencia_resolver',
        'f_post_tb_compensacion_incidencia_observar',
        'f_post_tb_compensacion_incidencia_anular'
      ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_function);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_function);
  END LOOP;
END;
$permissions$;

-- ============================================================================
-- DROP DE FIRMAS AFECTADAS PARA DESPLIEGUE CONTROLADO
-- ============================================================================

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_get_tb_compensacion_incidencia_catalogo',
  'f_get_tb_compensacion_incidencia',
  'f_post_tb_compensacion_incidencia',
  'f_post_tb_compensacion_incidencia_referencia',
  'f_patch_tb_compensacion_incidencia',
  'f_post_tb_compensacion_incidencia_enviar',
  'f_post_tb_compensacion_incidencia_descargo',
  'f_post_tb_compensacion_incidencia_resolver',
  'f_post_tb_compensacion_incidencia_observar',
  'f_post_tb_compensacion_incidencia_anular'
)
ORDER BY n.nspname, p.proname;
