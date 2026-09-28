-- ============================================================================
-- COMPENSACIONES - CORRECCIONES DE ASISTENCIA
-- ============================================================================
-- Objetivo:
--   Solicitar, revisar y aplicar correcciones sobre jornadas consolidadas sin
--   modificar las marcaciones originales del huellero.
--
-- Dependencias:
--   17.compensaciones_personal_configuracion.sql
--   18.compensaciones_asistencia_evidencias.sql
--   19.compensaciones_liquidaciones_cierres_reportes.sql
--   20.compensaciones_seguridad_personal_funciones.sql
--   25.compensaciones_asistencia_importacion_funciones.sql
-- ============================================================================

-- ============================================================================
-- 1. VALIDACION PRIVADA DE ALCANCE SOBRE ASISTENCIA
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_asistencia_validar_colaborador(
  p_id_colaborador bigint,
  p_accion character varying,
  p_fecha_referencia date DEFAULT CURRENT_DATE
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
  v_fecha date := COALESCE(p_fecha_referencia, CURRENT_DATE);
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_colaborador
    WHERE id = p_id_colaborador
  ) THEN
    RAISE EXCEPTION 'El colaborador no existe';
  END IF;

  v_contexto := public.f_private_compensacion_contexto(
    'ASISTENCIA',
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
    RAISE EXCEPTION 'Solo puede acceder a su propia asistencia';
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

  RETURN v_contexto;
END;
$$;

REVOKE ALL ON FUNCTION public.f_private_asistencia_validar_colaborador(
  bigint, character varying, date
) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. CONSULTA DE SOLICITUDES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_asistencia_solicitud(
  p_id bigint DEFAULT NULL,
  p_id_colaborador bigint DEFAULT NULL,
  p_estado_solicitud character varying DEFAULT NULL,
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
  v_contexto := public.f_private_compensacion_contexto(
    'ASISTENCIA',
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

  WITH base AS (
    SELECT
      so.*,
      aj.fecha,
      aj.entrada_real,
      aj.salida_real,
      aj.estado_dia,
      aj.version AS jornada_version,
      c.nombre_completo AS colaborador_nombre,
      c.numero_documento AS colaborador_documento,
      a.id_sucursal,
      s.nombre AS sucursal_nombre,
      us.nombre AS usuario_solicita_nombre,
      ur.nombre AS usuario_resuelve_nombre
    FROM public.tb_asistencia_solicitud so
    JOIN public.tb_asistencia_jornada aj ON aj.id = so.id_jornada
    JOIN public.tb_compensacion_colaborador c ON c.id = so.id_colaborador
    JOIN public.tb_compensacion_asignacion a ON a.id = aj.id_asignacion
    JOIN public.tb_sucursal s ON s.id = a.id_sucursal
    JOIN public.tb_usuario us ON us.id = so.id_usuario_solicita
    LEFT JOIN public.tb_usuario ur ON ur.id = so.id_usuario_resuelve
    WHERE (p_id IS NULL OR so.id = p_id)
      AND (p_id_colaborador IS NULL OR so.id_colaborador = p_id_colaborador)
      AND (
        p_estado_solicitud IS NULL
        OR so.estado_solicitud = UPPER(TRIM(p_estado_solicitud))
      )
      AND (p_fecha_desde IS NULL OR aj.fecha >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR aj.fecha <= p_fecha_hasta)
      AND (
        p_busqueda IS NULL
        OR c.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR c.numero_documento ILIKE '%' || TRIM(p_busqueda) || '%'
        OR so.motivo ILIKE '%' || TRIM(p_busqueda) || '%'
      )
      AND (
        v_alcance = 'GLOBAL'
        OR (v_alcance = 'SEDE' AND a.id_sucursal = v_id_sucursal_alcance)
        OR (v_alcance = 'PROPIO' AND so.id_colaborador = v_id_colaborador_actor)
      )
  ), conteo AS (
    SELECT COUNT(*) AS total FROM base
  ), resumen AS (
    SELECT jsonb_build_object(
      'pendientes', COUNT(*) FILTER (WHERE estado_solicitud = 'PENDIENTE'),
      'aprobadas', COUNT(*) FILTER (WHERE estado_solicitud = 'APROBADA'),
      'rechazadas', COUNT(*) FILTER (WHERE estado_solicitud = 'RECHAZADA'),
      'anuladas', COUNT(*) FILTER (WHERE estado_solicitud = 'ANULADA')
    ) AS datos
    FROM base
  ), pagina AS (
    SELECT *
    FROM base
    ORDER BY fecha_solicitud DESC, id DESC
    LIMIT v_tamano
    OFFSET (v_pagina - 1) * v_tamano
  )
  SELECT
    conteo.total,
    resumen.datos,
    COALESCE(
      jsonb_agg(to_jsonb(pagina) ORDER BY pagina.fecha_solicitud DESC, pagina.id DESC)
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
-- 3. CREACION DE SOLICITUD
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_asistencia_solicitud(
  p_id_jornada bigint,
  p_valores_solicitados jsonb,
  p_motivo text,
  p_evidencia jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_jornada public.tb_asistencia_jornada%ROWTYPE;
  v_contexto jsonb;
  v_id_actor bigint;
  v_valores_actuales jsonb;
  v_id bigint;
BEGIN
  SELECT * INTO v_jornada
  FROM public.tb_asistencia_jornada
  WHERE id = p_id_jornada
  FOR UPDATE;

  IF v_jornada.id IS NULL THEN
    RAISE EXCEPTION 'La jornada de asistencia no existe';
  END IF;

  v_contexto := public.f_private_asistencia_validar_colaborador(
    v_jornada.id_colaborador,
    'REGISTRAR',
    v_jornada.fecha
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF p_valores_solicitados IS NULL
     OR jsonb_typeof(p_valores_solicitados) <> 'object'
     OR p_valores_solicitados = '{}'::jsonb THEN
    RAISE EXCEPTION 'Debe indicar al menos un valor solicitado';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_valores_solicitados) AS claves(clave)
    WHERE clave NOT IN (
      'entrada_real', 'salida_real', 'estado_dia', 'observacion'
    )
  ) THEN
    RAISE EXCEPTION 'La solicitud contiene campos de asistencia no permitidos';
  END IF;

  IF NULLIF(TRIM(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo de la solicitud es obligatorio';
  END IF;

  IF p_evidencia IS NULL OR jsonb_typeof(p_evidencia) <> 'array' THEN
    RAISE EXCEPTION 'La evidencia debe enviarse como un arreglo JSON';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_compensacion_periodo pe
    WHERE pe.estado_periodo = 'CERRADO'
      AND v_jornada.fecha BETWEEN pe.fecha_inicio AND pe.fecha_fin
  ) THEN
    RAISE EXCEPTION 'No se puede solicitar una correccion sobre un periodo cerrado';
  END IF;

  v_valores_actuales := jsonb_build_object(
    'entrada_real', v_jornada.entrada_real,
    'salida_real', v_jornada.salida_real,
    'estado_dia', v_jornada.estado_dia,
    'minutos_tardanza', v_jornada.minutos_tardanza,
    'minutos_extra', v_jornada.minutos_extra,
    'minutos_trabajados', v_jornada.minutos_trabajados,
    'observacion', v_jornada.observacion,
    'fuente', v_jornada.fuente,
    'version', v_jornada.version
  );

  INSERT INTO public.tb_asistencia_solicitud (
    id_jornada,
    id_colaborador,
    valores_actuales,
    valores_solicitados,
    motivo,
    evidencia,
    estado_solicitud,
    id_usuario_solicita
  ) VALUES (
    p_id_jornada,
    v_jornada.id_colaborador,
    v_valores_actuales,
    p_valores_solicitados,
    TRIM(p_motivo),
    p_evidencia,
    'PENDIENTE',
    v_id_actor
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT to_jsonb(so)
    FROM public.tb_asistencia_solicitud so
    WHERE so.id = v_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'La jornada ya tiene una solicitud pendiente';
END;
$$;

-- ============================================================================
-- 4. RESOLUCION Y APLICACION DE CORRECCION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_asistencia_solicitud_resolver(
  p_id bigint,
  p_decision character varying,
  p_motivo_resolucion text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_solicitud public.tb_asistencia_solicitud%ROWTYPE;
  v_jornada public.tb_asistencia_jornada%ROWTYPE;
  v_horario public.tb_compensacion_jornada%ROWTYPE;
  v_contexto jsonb;
  v_id_actor bigint;
  v_decision character varying := UPPER(TRIM(p_decision));
  v_entrada_real timestamp with time zone;
  v_salida_real timestamp with time zone;
  v_estado_dia character varying;
  v_observacion text;
  v_minutos_tardanza integer;
  v_minutos_trabajados integer;
  v_cambio_horario boolean;
BEGIN
  SELECT * INTO v_solicitud
  FROM public.tb_asistencia_solicitud
  WHERE id = p_id
  FOR UPDATE;

  IF v_solicitud.id IS NULL THEN
    RAISE EXCEPTION 'La solicitud de asistencia no existe';
  END IF;

  IF v_solicitud.estado_solicitud <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'La solicitud ya fue resuelta o anulada';
  END IF;

  IF v_decision IS NULL OR v_decision NOT IN ('APROBADA', 'RECHAZADA') THEN
    RAISE EXCEPTION 'La decision debe ser APROBADA o RECHAZADA';
  END IF;

  IF NULLIF(TRIM(p_motivo_resolucion), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo de resolucion es obligatorio';
  END IF;

  SELECT * INTO v_jornada
  FROM public.tb_asistencia_jornada
  WHERE id = v_solicitud.id_jornada
  FOR UPDATE;

  IF v_jornada.id IS NULL THEN
    RAISE EXCEPTION 'La jornada asociada ya no existe';
  END IF;

  v_contexto := public.f_private_asistencia_validar_colaborador(
    v_solicitud.id_colaborador,
    'APROBAR',
    v_jornada.fecha
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF v_solicitud.id_usuario_solicita = v_id_actor THEN
    RAISE EXCEPTION 'El solicitante no puede resolver su propia correccion';
  END IF;

  IF v_decision = 'APROBADA' AND EXISTS (
    SELECT 1
    FROM public.tb_compensacion_periodo pe
    WHERE pe.estado_periodo = 'CERRADO'
      AND v_jornada.fecha BETWEEN pe.fecha_inicio AND pe.fecha_fin
  ) THEN
    RAISE EXCEPTION 'No se puede aprobar una correccion sobre un periodo cerrado';
  END IF;

  IF v_decision = 'APROBADA'
     AND COALESCE((v_solicitud.valores_actuales ->> 'version')::integer, 0)
         <> v_jornada.version THEN
    RAISE EXCEPTION
      'La jornada cambio despues de crear la solicitud; anule y registre una nueva correccion';
  END IF;

  IF v_decision = 'APROBADA' THEN
    SELECT j.* INTO v_horario
    FROM public.tb_compensacion_asignacion a
    JOIN public.tb_compensacion_jornada j ON j.id = a.id_jornada
    WHERE a.id = v_jornada.id_asignacion;

    IF v_horario.id IS NULL THEN
      RAISE EXCEPTION 'No se encontro el horario de la jornada';
    END IF;

    v_cambio_horario := v_solicitud.valores_solicitados ? 'entrada_real'
      OR v_solicitud.valores_solicitados ? 'salida_real';

    IF v_solicitud.valores_solicitados ? 'entrada_real' THEN
      IF v_solicitud.valores_solicitados ->> 'entrada_real' IS NULL THEN
        v_entrada_real := NULL;
      ELSE
        IF (v_solicitud.valores_solicitados ->> 'entrada_real')
           !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
          RAISE EXCEPTION 'La entrada solicitada debe incluir zona horaria';
        END IF;
        BEGIN
          v_entrada_real := (
            v_solicitud.valores_solicitados ->> 'entrada_real'
          )::timestamp with time zone;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'La entrada solicitada no tiene un formato valido';
        END;
      END IF;
    ELSE
      v_entrada_real := v_jornada.entrada_real;
    END IF;

    IF v_solicitud.valores_solicitados ? 'salida_real' THEN
      IF v_solicitud.valores_solicitados ->> 'salida_real' IS NULL THEN
        v_salida_real := NULL;
      ELSE
        IF (v_solicitud.valores_solicitados ->> 'salida_real')
           !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
          RAISE EXCEPTION 'La salida solicitada debe incluir zona horaria';
        END IF;
        BEGIN
          v_salida_real := (
            v_solicitud.valores_solicitados ->> 'salida_real'
          )::timestamp with time zone;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'La salida solicitada no tiene un formato valido';
        END;
      END IF;
    ELSE
      v_salida_real := v_jornada.salida_real;
    END IF;

    IF v_entrada_real IS NOT NULL
       AND v_salida_real IS NOT NULL
       AND v_salida_real < v_entrada_real THEN
      RAISE EXCEPTION 'La salida corregida no puede ser anterior a la entrada';
    END IF;

    IF v_solicitud.valores_solicitados ? 'estado_dia' THEN
      v_estado_dia := UPPER(NULLIF(TRIM(
        v_solicitud.valores_solicitados ->> 'estado_dia'
      ), ''));

      IF v_estado_dia IS NULL OR v_estado_dia NOT IN (
        'COMPLETO', 'FALTA_ENTRADA', 'FALTA_SALIDA', 'AUSENTE',
        'DESCANSO', 'VACACIONES', 'LICENCIA', 'JUSTIFICADO', 'PENDIENTE'
      ) THEN
        RAISE EXCEPTION 'El estado solicitado para la jornada no es valido';
      END IF;
    ELSIF v_cambio_horario THEN
      v_estado_dia := CASE
        WHEN v_entrada_real IS NOT NULL AND v_salida_real IS NOT NULL THEN 'COMPLETO'
        WHEN v_entrada_real IS NOT NULL THEN 'FALTA_SALIDA'
        WHEN v_salida_real IS NOT NULL THEN 'FALTA_ENTRADA'
        ELSE 'AUSENTE'
      END;
    ELSE
      v_estado_dia := v_jornada.estado_dia;
    END IF;

    IF v_estado_dia = 'COMPLETO'
       AND (v_entrada_real IS NULL OR v_salida_real IS NULL) THEN
      RAISE EXCEPTION 'Una jornada COMPLETO requiere entrada y salida';
    END IF;

    IF v_estado_dia = 'FALTA_ENTRADA'
       AND (v_entrada_real IS NOT NULL OR v_salida_real IS NULL) THEN
      RAISE EXCEPTION 'FALTA_ENTRADA requiere salida y ausencia de entrada';
    END IF;

    IF v_estado_dia = 'FALTA_SALIDA'
       AND (v_entrada_real IS NULL OR v_salida_real IS NOT NULL) THEN
      RAISE EXCEPTION 'FALTA_SALIDA requiere entrada y ausencia de salida';
    END IF;

    IF v_estado_dia IN ('AUSENTE', 'DESCANSO', 'VACACIONES', 'LICENCIA')
       AND (v_entrada_real IS NOT NULL OR v_salida_real IS NOT NULL) THEN
      RAISE EXCEPTION 'El estado % no admite marcaciones de entrada o salida', v_estado_dia;
    END IF;

    IF v_solicitud.valores_solicitados ? 'observacion' THEN
      v_observacion := NULLIF(TRIM(
        v_solicitud.valores_solicitados ->> 'observacion'
      ), '');
    ELSE
      v_observacion := v_jornada.observacion;
    END IF;

    v_minutos_tardanza := CASE
      WHEN v_entrada_real IS NULL THEN 0
      WHEN v_jornada.entrada_programada IS NULL THEN 0
      WHEN v_entrada_real <= v_jornada.entrada_programada
           + make_interval(mins => v_horario.minutos_tolerancia) THEN 0
      ELSE GREATEST(
        FLOOR(EXTRACT(EPOCH FROM (
          v_entrada_real
          - v_jornada.entrada_programada
          - make_interval(mins => v_horario.minutos_tolerancia)
        )) / 60)::integer,
        0
      )
    END;

    v_minutos_trabajados := CASE
      WHEN v_entrada_real IS NULL OR v_salida_real IS NULL THEN 0
      ELSE GREATEST(
        FLOOR(EXTRACT(EPOCH FROM (v_salida_real - v_entrada_real)) / 60)::integer
          - v_horario.minutos_descanso,
        0
      )
    END;

    UPDATE public.tb_asistencia_jornada
    SET entrada_real = v_entrada_real,
        salida_real = v_salida_real,
        minutos_tardanza = v_minutos_tardanza,
        minutos_extra = 0,
        minutos_trabajados = v_minutos_trabajados,
        estado_dia = v_estado_dia,
        fuente = 'CORRECCION',
        version = version + 1,
        observacion = v_observacion,
        id_usuario = v_id_actor,
        fecha_actualizacion = now()
    WHERE id = v_jornada.id;
  END IF;

  UPDATE public.tb_asistencia_solicitud
  SET estado_solicitud = v_decision,
      id_usuario_resuelve = v_id_actor,
      fecha_resolucion = now(),
      motivo_resolucion = TRIM(p_motivo_resolucion),
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (
    SELECT jsonb_build_object(
      'id', so.id,
      'id_jornada', so.id_jornada,
      'estado_solicitud', so.estado_solicitud,
      'id_usuario_resuelve', so.id_usuario_resuelve,
      'fecha_resolucion', so.fecha_resolucion,
      'jornada_version', aj.version,
      'jornada_fuente', aj.fuente,
      'mensaje', CASE
        WHEN v_decision = 'APROBADA' THEN 'Correccion aprobada y aplicada'
        ELSE 'Correccion rechazada'
      END
    )
    FROM public.tb_asistencia_solicitud so
    JOIN public.tb_asistencia_jornada aj ON aj.id = so.id_jornada
    WHERE so.id = p_id
  );
END;
$$;

-- ============================================================================
-- 5. ANULACION DE SOLICITUD PENDIENTE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_asistencia_solicitud_anular(
  p_id bigint,
  p_motivo_anulacion text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_solicitud public.tb_asistencia_solicitud%ROWTYPE;
  v_jornada public.tb_asistencia_jornada%ROWTYPE;
  v_contexto jsonb;
  v_id_actor bigint;
BEGIN
  SELECT * INTO v_solicitud
  FROM public.tb_asistencia_solicitud
  WHERE id = p_id
  FOR UPDATE;

  IF v_solicitud.id IS NULL THEN
    RAISE EXCEPTION 'La solicitud de asistencia no existe';
  END IF;

  IF v_solicitud.estado_solicitud <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo una solicitud pendiente puede anularse';
  END IF;

  IF NULLIF(TRIM(p_motivo_anulacion), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo de anulacion es obligatorio';
  END IF;

  SELECT * INTO v_jornada
  FROM public.tb_asistencia_jornada
  WHERE id = v_solicitud.id_jornada;

  v_contexto := public.f_private_asistencia_validar_colaborador(
    v_solicitud.id_colaborador,
    'EDITAR',
    v_jornada.fecha
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF v_solicitud.id_usuario_solicita <> v_id_actor
     AND (v_contexto ->> 'alcance') = 'PROPIO' THEN
    RAISE EXCEPTION 'Solo puede anular sus propias solicitudes';
  END IF;

  UPDATE public.tb_asistencia_solicitud
  SET estado_solicitud = 'ANULADA',
      id_usuario_resuelve = v_id_actor,
      fecha_resolucion = now(),
      motivo_resolucion = TRIM(p_motivo_anulacion),
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', p_id,
    'estado_solicitud', 'ANULADA',
    'mensaje', 'Solicitud anulada correctamente'
  );
END;
$$;

-- ============================================================================
-- 6. RESOLUCION MASIVA
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_asistencia_solicitud_resolver_lote(
  p_ids bigint[],
  p_decision character varying,
  p_motivo_resolucion text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id bigint;
  v_resultados jsonb := '[]'::jsonb;
  v_total integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RAISE EXCEPTION 'Debe seleccionar al menos una solicitud';
  END IF;

  IF cardinality(p_ids) > 100 THEN
    RAISE EXCEPTION 'Solo se pueden resolver hasta 100 solicitudes por lote';
  END IF;

  SELECT COUNT(DISTINCT id) INTO v_total
  FROM unnest(p_ids) AS ids(id);

  IF v_total <> cardinality(p_ids) THEN
    RAISE EXCEPTION 'La seleccion contiene solicitudes duplicadas';
  END IF;

  FOR v_id IN
    SELECT id
    FROM unnest(p_ids) AS solicitudes(id)
    ORDER BY id
  LOOP
    v_resultados := v_resultados || jsonb_build_array(
      public.f_post_tb_asistencia_solicitud_resolver(
        v_id,
        p_decision,
        p_motivo_resolucion
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'total_resueltas', jsonb_array_length(v_resultados),
    'decision', UPPER(TRIM(p_decision)),
    'resultados', v_resultados
  );
END;
$$;

-- ============================================================================
-- 7. PERMISOS DE EJECUCION
-- ============================================================================

REVOKE ALL ON FUNCTION public.f_get_tb_asistencia_solicitud(
  bigint, bigint, character varying, date, date, character varying,
  integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_asistencia_solicitud(
  bigint, bigint, character varying, date, date, character varying,
  integer, integer
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_asistencia_solicitud(
  bigint, jsonb, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_asistencia_solicitud(
  bigint, jsonb, text, jsonb
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_asistencia_solicitud_resolver(
  bigint, character varying, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_asistencia_solicitud_resolver(
  bigint, character varying, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_asistencia_solicitud_anular(
  bigint, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_asistencia_solicitud_anular(
  bigint, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_asistencia_solicitud_resolver_lote(
  bigint[], character varying, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_asistencia_solicitud_resolver_lote(
  bigint[], character varying, text
) TO authenticated;

-- ============================================================================
-- 8. GENERADOR DROP FUNCTION
-- ============================================================================

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_private_asistencia_validar_colaborador',
  'f_get_tb_asistencia_solicitud',
  'f_post_tb_asistencia_solicitud',
  'f_post_tb_asistencia_solicitud_resolver',
  'f_post_tb_asistencia_solicitud_anular',
  'f_post_tb_asistencia_solicitud_resolver_lote'
)
ORDER BY n.nspname, p.proname;
