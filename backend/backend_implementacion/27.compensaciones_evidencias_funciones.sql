-- ============================================================================
-- COMPENSACIONES - EVIDENCIAS, EVENTOS Y REVISIONES
-- ============================================================================
-- Objetivo:
--   Administrar la bandeja comun de calificaciones, llamadas, tarjetas de
--   terceros y referidos. El importe se congela al aprobar usando una regla
--   publicada; las referencias y revisiones permanecen como trazabilidad.
--
-- Dependencias:
--   17.compensaciones_personal_configuracion.sql
--   18.compensaciones_asistencia_evidencias.sql
--   20.compensaciones_seguridad_personal_funciones.sql
--   22.compensaciones_matriz_funciones.sql
-- ============================================================================

-- ============================================================================
-- 1. VALIDACION PRIVADA DE ALCANCE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_compensacion_evento_validar_alcance(
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
    RAISE EXCEPTION 'El evento de compensacion no existe';
  END IF;

  v_contexto := public.f_private_compensacion_contexto(
    'EVIDENCIAS',
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
$$;

REVOKE ALL ON FUNCTION public.f_private_compensacion_evento_validar_alcance(
  bigint, character varying, boolean
) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. TIPOS DE EVENTO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_evento_tipo(
  p_id bigint DEFAULT NULL,
  p_categoria character varying DEFAULT NULL,
  p_busqueda character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
BEGIN
  BEGIN
    v_contexto := public.f_private_compensacion_contexto(
      'EVIDENCIAS',
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
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_categoria IS NULL OR t.categoria = UPPER(TRIM(p_categoria)))
    AND (
      p_busqueda IS NULL
      OR t.codigo ILIKE '%' || TRIM(p_busqueda) || '%'
      OR t.nombre ILIKE '%' || TRIM(p_busqueda) || '%'
    )
  ORDER BY t.categoria, t.nombre, t.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_evento_tipo(
  p_codigo character varying,
  p_nombre character varying,
  p_categoria character varying,
  p_id_concepto bigint DEFAULT NULL,
  p_requiere_beneficiario boolean DEFAULT true,
  p_requiere_responsable boolean DEFAULT false,
  p_requiere_cliente boolean DEFAULT false,
  p_requiere_operacion boolean DEFAULT false,
  p_configuracion jsonb DEFAULT '{}'::jsonb,
  p_id_estado bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_evento_tipo(
  p_id bigint,
  p_codigo character varying DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_categoria character varying DEFAULT NULL,
  p_id_concepto bigint DEFAULT NULL,
  p_limpiar_concepto boolean DEFAULT false,
  p_requiere_beneficiario boolean DEFAULT NULL,
  p_requiere_responsable boolean DEFAULT NULL,
  p_requiere_cliente boolean DEFAULT NULL,
  p_requiere_operacion boolean DEFAULT NULL,
  p_configuracion jsonb DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
$$;

-- ============================================================================
-- 3. BANDEJA DE EVENTOS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_evento(
  p_id bigint DEFAULT NULL,
  p_categoria character varying DEFAULT NULL,
  p_estado_evento character varying DEFAULT NULL,
  p_id_tipo_evento bigint DEFAULT NULL,
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
  v_pagina integer := GREATEST(COALESCE(p_pagina, 1), 1);
  v_tamano integer := LEAST(GREATEST(COALESCE(p_tamano_pagina, 50), 1), 200);
  v_total bigint;
  v_items jsonb;
  v_resumen jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('EVIDENCIAS', 'CONSULTAR');
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
    WHERE te.categoria IN ('CALIFICACION', 'LLAMADA', 'TARJETA_TERCERO', 'REFERIDO', 'OTRO')
      AND (p_id IS NULL OR ev.id = p_id)
      AND (p_id_tipo_evento IS NULL OR ev.id_tipo_evento = p_id_tipo_evento)
      AND (p_categoria IS NULL OR te.categoria = UPPER(TRIM(p_categoria)))
      AND (p_estado_evento IS NULL OR ev.estado_evento = UPPER(TRIM(p_estado_evento)))
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
        OR te.nombre ILIKE '%' || TRIM(p_busqueda) || '%'
        OR ev.titulo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR ev.descripcion ILIKE '%' || TRIM(p_busqueda) || '%'
        OR cb.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR cb.numero_documento ILIKE '%' || TRIM(p_busqueda) || '%'
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
-- 4. REGISTRO Y EDICION DE EVENTOS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_evento(
  p_id_tipo_evento bigint,
  p_fecha_evento timestamp with time zone,
  p_id_colaborador_beneficiario bigint DEFAULT NULL,
  p_id_colaborador_responsable bigint DEFAULT NULL,
  p_id_sucursal_origen bigint DEFAULT NULL,
  p_id_sucursal_responsable bigint DEFAULT NULL,
  p_periodo_imputacion date DEFAULT NULL,
  p_fuente character varying DEFAULT 'MANUAL',
  p_clave_origen character varying DEFAULT NULL,
  p_titulo character varying DEFAULT NULL,
  p_descripcion text DEFAULT NULL,
  p_datos jsonb DEFAULT '{}'::jsonb,
  p_evidencia jsonb DEFAULT '[]'::jsonb,
  p_referencias jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
BEGIN
  v_contexto := public.f_private_compensacion_contexto('EVIDENCIAS', 'REGISTRAR');
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

  IF v_tipo.categoria NOT IN ('CALIFICACION', 'LLAMADA', 'TARJETA_TERCERO', 'REFERIDO', 'OTRO') THEN
    RAISE EXCEPTION 'El tipo corresponde a otro flujo funcional';
  END IF;

  IF p_fecha_evento IS NULL THEN
    RAISE EXCEPTION 'La fecha del evento es obligatoria';
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

  IF v_alcance = 'SEDE' AND v_id_sucursal_origen IS DISTINCT FROM v_id_sucursal_alcance
     AND p_id_sucursal_responsable IS DISTINCT FROM v_id_sucursal_alcance THEN
    RAISE EXCEPTION 'Solo puede registrar eventos de su sede autorizada';
  END IF;

  INSERT INTO public.tb_compensacion_evento (
    id_tipo_evento, id_colaborador_beneficiario, id_colaborador_responsable,
    id_sucursal_origen, id_sucursal_responsable, fecha_evento,
    periodo_imputacion, fuente, clave_origen, titulo, descripcion,
    datos, evidencia, estado_evento, id_usuario_registra
  ) VALUES (
    p_id_tipo_evento, p_id_colaborador_beneficiario, p_id_colaborador_responsable,
    v_id_sucursal_origen, p_id_sucursal_responsable, p_fecha_evento,
    COALESCE(p_periodo_imputacion, date_trunc('month', p_fecha_evento)::date),
    UPPER(TRIM(COALESCE(p_fuente, 'MANUAL'))), NULLIF(TRIM(p_clave_origen), ''),
    NULLIF(TRIM(p_titulo), ''), NULLIF(TRIM(p_descripcion), ''),
    p_datos, p_evidencia, 'BORRADOR', v_id_actor
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
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_evento(
  p_id bigint,
  p_titulo character varying DEFAULT NULL,
  p_descripcion text DEFAULT NULL,
  p_datos jsonb DEFAULT NULL,
  p_evidencia jsonb DEFAULT NULL,
  p_periodo_imputacion date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_evento_referencia(
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
$$;

-- ============================================================================
-- 5. WORKFLOW DE REVISION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_evento_enviar(
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
    WHERE id_evento = p_id AND id_cliente IS NOT NULL
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

  IF EXISTS (
    SELECT 1
    FROM public.tb_compensacion_concepto c
    WHERE c.id = v_tipo.id_concepto
      AND c.requiere_evidencia
      AND jsonb_array_length(v_evento.evidencia) = 0
  ) THEN
    RAISE EXCEPTION 'El concepto requiere evidencia antes de enviar';
  END IF;

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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_evento_resolver(
  p_id bigint,
  p_decision character varying,
  p_comentario text DEFAULT NULL,
  p_base_calculo numeric DEFAULT NULL,
  p_cantidad numeric DEFAULT NULL
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

  IF v_id_actor = v_evento.id_usuario_registra THEN
    RAISE EXCEPTION 'El usuario que registro el evento no puede resolverlo';
  END IF;

  IF v_decision = 'RECHAZADO' AND NULLIF(TRIM(p_comentario), '') IS NULL THEN
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

  IF v_decision = 'APROBADO' THEN
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

    IF v_regla.id IS NULL THEN
      RAISE EXCEPTION 'No existe una regla activa aplicable al evento';
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

    v_snapshot := jsonb_build_object(
      'id_tipo_evento', v_tipo.id,
      'tipo_codigo', v_tipo.codigo,
      'configuracion_tipo', v_tipo.configuracion,
      'id_asignacion', v_id_asignacion,
      'id_plan_version', v_id_plan_version,
      'id_regla', v_regla.id,
      'tipo_calculo', v_regla.tipo_calculo,
      'configuracion_regla', v_regla.configuracion,
      'tope_importe', v_regla.tope_importe,
      'fecha_calculo', now()
    );

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
      'motivo', TRIM(p_comentario)
    );

    UPDATE public.tb_compensacion_evento
    SET estado_evento = 'RECHAZADO',
        fecha_actualizacion = now()
    WHERE id = p_id;
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_evento_observar(
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_evento_anular(
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
        'f_get_tb_compensacion_evento_tipo',
        'f_post_tb_compensacion_evento_tipo',
        'f_patch_tb_compensacion_evento_tipo',
        'f_get_tb_compensacion_evento',
        'f_post_tb_compensacion_evento',
        'f_patch_tb_compensacion_evento',
        'f_post_tb_compensacion_evento_referencia',
        'f_post_tb_compensacion_evento_enviar',
        'f_post_tb_compensacion_evento_resolver',
        'f_post_tb_compensacion_evento_observar',
        'f_post_tb_compensacion_evento_anular'
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
  'f_get_tb_compensacion_evento_tipo',
  'f_post_tb_compensacion_evento_tipo',
  'f_patch_tb_compensacion_evento_tipo',
  'f_get_tb_compensacion_evento',
  'f_post_tb_compensacion_evento',
  'f_patch_tb_compensacion_evento',
  'f_post_tb_compensacion_evento_referencia',
  'f_post_tb_compensacion_evento_enviar',
  'f_post_tb_compensacion_evento_resolver',
  'f_post_tb_compensacion_evento_observar',
  'f_post_tb_compensacion_evento_anular'
)
ORDER BY n.nspname, p.proname;
