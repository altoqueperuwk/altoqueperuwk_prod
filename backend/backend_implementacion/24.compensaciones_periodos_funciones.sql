-- ============================================================================
-- COMPENSACIONES - PERIODOS MENSUALES
-- ============================================================================
-- Objetivo:
--   Administrar la apertura y consulta de periodos, y centralizar la validacion
--   de estado que reutilizaran liquidaciones, pagos y cierres.
--
-- Dependencias:
--   19.compensaciones_liquidaciones_cierres_reportes.sql
--   20.compensaciones_seguridad_personal_funciones.sql
-- ============================================================================

-- ============================================================================
-- 1. VALIDACION PRIVADA DE PERIODO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_compensacion_validar_periodo(
  p_id_periodo bigint,
  p_recurso character varying,
  p_accion character varying,
  p_estados_permitidos character varying[] DEFAULT NULL,
  p_bloquear boolean DEFAULT false,
  p_requiere_global boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.f_private_compensacion_validar_periodo(
  bigint, character varying, character varying, character varying[], boolean,
  boolean
) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. CONSULTA DE PERIODOS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_periodo(
  p_id bigint DEFAULT NULL,
  p_periodo_desde date DEFAULT NULL,
  p_periodo_hasta date DEFAULT NULL,
  p_estado_periodo character varying DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_alcance character varying;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'LIQUIDACIONES',
    'CONSULTAR'
  );
  v_alcance := v_contexto ->> 'alcance';

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
    'id_usuario_actualiza', pe.id_usuario_actualiza,
    'fecha_actualizacion', pe.fecha_actualizacion,
    'total_liquidaciones', CASE WHEN v_alcance = 'GLOBAL' THEN (
        SELECT COUNT(*)
        FROM public.tb_compensacion_liquidacion l
        WHERE l.id_periodo = pe.id
          AND l.estado_liquidacion NOT IN ('REEMPLAZADA', 'ANULADA')
      )
      ELSE NULL
    END,
    'liquidaciones_pendientes', CASE WHEN v_alcance = 'GLOBAL' THEN (
        SELECT COUNT(*)
        FROM public.tb_compensacion_liquidacion l
        WHERE l.id_periodo = pe.id
          AND l.estado_liquidacion IN (
            'BORRADOR', 'CALCULADA', 'OBSERVADA', 'APROBADA', 'PAGO_PARCIAL'
          )
      )
      ELSE NULL
    END,
    'total_pagar', CASE WHEN v_alcance = 'GLOBAL' THEN (
        SELECT COALESCE(SUM(l.total_pagar), 0)
        FROM public.tb_compensacion_liquidacion l
        WHERE l.id_periodo = pe.id
          AND l.estado_liquidacion NOT IN ('REEMPLAZADA', 'ANULADA')
      )
      ELSE NULL
    END,
    'total_pagado', CASE WHEN v_alcance = 'GLOBAL' THEN (
        SELECT COALESCE(SUM(l.total_pagado), 0)
        FROM public.tb_compensacion_liquidacion l
        WHERE l.id_periodo = pe.id
          AND l.estado_liquidacion NOT IN ('REEMPLAZADA', 'ANULADA')
      )
      ELSE NULL
    END,
    'solicitudes_asistencia_pendientes', CASE WHEN v_alcance = 'GLOBAL' THEN (
        SELECT COUNT(*)
        FROM public.tb_asistencia_solicitud sa
        JOIN public.tb_asistencia_jornada aj ON aj.id = sa.id_jornada
        WHERE aj.fecha BETWEEN pe.fecha_inicio AND pe.fecha_fin
          AND sa.estado_solicitud = 'PENDIENTE'
      )
      ELSE NULL
    END,
    'eventos_pendientes', CASE WHEN v_alcance = 'GLOBAL' THEN (
        SELECT COUNT(*)
        FROM public.tb_compensacion_evento ev
        WHERE ev.fecha_evento::date BETWEEN pe.fecha_inicio AND pe.fecha_fin
          AND ev.estado_evento = 'PENDIENTE'
      )
      ELSE NULL
    END,
    'tiene_cierre_vigente', EXISTS (
      SELECT 1
      FROM public.tb_compensacion_cierre ci
      WHERE ci.id_periodo = pe.id
        AND ci.estado_cierre = 'VIGENTE'
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
$$;

-- ============================================================================
-- 3. APERTURA IDEMPOTENTE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_periodo_abrir(
  p_periodo date,
  p_nombre character varying DEFAULT NULL,
  p_zona_horaria character varying DEFAULT 'America/Lima'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
    'LIQUIDACIONES',
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
$$;

-- ============================================================================
-- 4. EDICION PREVIA AL CALCULO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_periodo(
  p_id bigint,
  p_nombre character varying DEFAULT NULL,
  p_zona_horaria character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_zona_horaria character varying;
BEGIN
  v_contexto := public.f_private_compensacion_validar_periodo(
    p_id,
    'LIQUIDACIONES',
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

  IF EXISTS (
    SELECT 1
    FROM public.tb_compensacion_liquidacion
    WHERE id_periodo = p_id
  ) THEN
    RAISE EXCEPTION 'No se puede editar un periodo que ya tiene liquidaciones';
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
$$;

-- ============================================================================
-- 5. PERMISOS DE EJECUCION
-- ============================================================================

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_periodo(
  bigint, date, date, character varying
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_periodo(
  bigint, date, date, character varying
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_periodo_abrir(
  date, character varying, character varying
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_periodo_abrir(
  date, character varying, character varying
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_periodo(
  bigint, character varying, character varying
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_periodo(
  bigint, character varying, character varying
) TO authenticated;

-- ============================================================================
-- 6. GENERADOR DROP FUNCTION
-- ============================================================================

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_private_compensacion_validar_periodo',
  'f_get_tb_compensacion_periodo',
  'f_post_tb_compensacion_periodo_abrir',
  'f_patch_tb_compensacion_periodo'
)
ORDER BY n.nspname, p.proname;
