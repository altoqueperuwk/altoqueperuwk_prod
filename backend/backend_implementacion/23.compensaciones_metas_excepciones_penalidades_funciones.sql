-- ============================================================================
-- COMPENSACIONES - METAS, EXCEPCIONES Y CATALOGO DE PENALIDADES
-- ============================================================================
-- Objetivo:
--   Completar la configuracion economica de la matriz madre con metas por sede,
--   excepciones individuales aprobables y tipos de penalidad versionados.
--
-- Dependencias:
--   17.compensaciones_personal_configuracion.sql
--   19.compensaciones_liquidaciones_cierres_reportes.sql
--   20.compensaciones_seguridad_personal_funciones.sql
--   21.compensaciones_asignaciones_cuentas_funciones.sql
-- ============================================================================

-- ============================================================================
-- 1. METAS POR SEDE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_meta_sede(
  p_id bigint DEFAULT NULL,
  p_id_plan_version bigint DEFAULT NULL,
  p_id_sucursal bigint DEFAULT NULL,
  p_codigo_indicador character varying DEFAULT NULL,
  p_periodo date DEFAULT NULL,
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_meta_sede(
  p_id_plan_version bigint,
  p_id_sucursal bigint,
  p_codigo_indicador character varying,
  p_periodo date,
  p_valor_meta numeric,
  p_unidad character varying DEFAULT 'MONTO',
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

  IF p_periodo IS NULL OR p_periodo <> date_trunc('month', p_periodo)::date THEN
    RAISE EXCEPTION 'El periodo debe ser el primer dia del mes';
  END IF;

  IF NULLIF(TRIM(p_codigo_indicador), '') IS NULL THEN
    RAISE EXCEPTION 'El codigo del indicador es obligatorio';
  END IF;

  IF p_valor_meta IS NULL OR p_valor_meta < 0 THEN
    RAISE EXCEPTION 'El valor de la meta debe ser mayor o igual a cero';
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
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_meta_sede(
  p_id bigint,
  p_id_sucursal bigint DEFAULT NULL,
  p_codigo_indicador character varying DEFAULT NULL,
  p_periodo date DEFAULT NULL,
  p_valor_meta numeric DEFAULT NULL,
  p_unidad character varying DEFAULT NULL,
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
$$;

-- ============================================================================
-- 2. EXCEPCIONES INDIVIDUALES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_excepcion(
  p_id bigint DEFAULT NULL,
  p_id_colaborador bigint DEFAULT NULL,
  p_id_concepto bigint DEFAULT NULL,
  p_estado_aprobacion character varying DEFAULT NULL,
  p_fecha_referencia date DEFAULT CURRENT_DATE,
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_excepcion(
  p_id_colaborador bigint,
  p_id_concepto bigint,
  p_tipo_calculo character varying,
  p_fecha_inicio date,
  p_motivo text,
  p_fecha_fin date DEFAULT NULL,
  p_monto numeric DEFAULT NULL,
  p_porcentaje numeric DEFAULT NULL,
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
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_excepcion(
  p_id bigint,
  p_id_concepto bigint DEFAULT NULL,
  p_tipo_calculo character varying DEFAULT NULL,
  p_monto numeric DEFAULT NULL,
  p_porcentaje numeric DEFAULT NULL,
  p_configuracion jsonb DEFAULT NULL,
  p_fecha_inicio date DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL,
  p_limpiar_fecha_fin boolean DEFAULT false,
  p_motivo text DEFAULT NULL,
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_excepcion_decidir(
  p_id bigint,
  p_decision character varying,
  p_motivo_decision text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
$$;

-- ============================================================================
-- 3. CATALOGO VERSIONADO DE PENALIDADES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_penalidad_tipo(
  p_id bigint DEFAULT NULL,
  p_id_plan_version bigint DEFAULT NULL,
  p_busqueda character varying DEFAULT NULL,
  p_id_cargo bigint DEFAULT NULL,
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_penalidad_tipo(
  p_id_plan_version bigint,
  p_codigo character varying,
  p_nombre character varying,
  p_id_concepto_descuento bigint,
  p_monto_referencia numeric,
  p_descripcion text DEFAULT NULL,
  p_id_cargo bigint DEFAULT NULL,
  p_id_concepto_bono_reportante bigint DEFAULT NULL,
  p_monto_bono_reportante numeric DEFAULT NULL,
  p_requiere_respuesta boolean DEFAULT true,
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
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_penalidad_tipo(
  p_id bigint,
  p_codigo character varying DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_descripcion text DEFAULT NULL,
  p_id_cargo bigint DEFAULT NULL,
  p_limpiar_cargo boolean DEFAULT false,
  p_id_concepto_descuento bigint DEFAULT NULL,
  p_id_concepto_bono_reportante bigint DEFAULT NULL,
  p_limpiar_bono_reportante boolean DEFAULT false,
  p_monto_referencia numeric DEFAULT NULL,
  p_monto_bono_reportante numeric DEFAULT NULL,
  p_requiere_respuesta boolean DEFAULT NULL,
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
$$;

-- ============================================================================
-- 4. PERMISOS DE EJECUCION
-- ============================================================================

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_meta_sede(
  bigint, bigint, bigint, character varying, date, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_meta_sede(
  bigint, bigint, bigint, character varying, date, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_meta_sede(
  bigint, bigint, character varying, date, numeric,
  character varying, jsonb, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_meta_sede(
  bigint, bigint, character varying, date, numeric,
  character varying, jsonb, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_meta_sede(
  bigint, bigint, character varying, date, numeric,
  character varying, jsonb, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_meta_sede(
  bigint, bigint, character varying, date, numeric,
  character varying, jsonb, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_excepcion(
  bigint, bigint, bigint, character varying, date, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_excepcion(
  bigint, bigint, bigint, character varying, date, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_excepcion(
  bigint, bigint, character varying, date, text, date,
  numeric, numeric, jsonb, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_excepcion(
  bigint, bigint, character varying, date, text, date,
  numeric, numeric, jsonb, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_excepcion(
  bigint, bigint, character varying, numeric, numeric, jsonb,
  date, date, boolean, text, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_excepcion(
  bigint, bigint, character varying, numeric, numeric, jsonb,
  date, date, boolean, text, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_excepcion_decidir(
  bigint, character varying, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_excepcion_decidir(
  bigint, character varying, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_penalidad_tipo(
  bigint, bigint, character varying, bigint, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_penalidad_tipo(
  bigint, bigint, character varying, bigint, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_penalidad_tipo(
  bigint, character varying, character varying, bigint, numeric,
  text, bigint, bigint, numeric, boolean, jsonb, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_penalidad_tipo(
  bigint, character varying, character varying, bigint, numeric,
  text, bigint, bigint, numeric, boolean, jsonb, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_penalidad_tipo(
  bigint, character varying, character varying, text, bigint, boolean,
  bigint, bigint, boolean, numeric, numeric, boolean, jsonb, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_penalidad_tipo(
  bigint, character varying, character varying, text, bigint, boolean,
  bigint, bigint, boolean, numeric, numeric, boolean, jsonb, bigint
) TO authenticated;

-- ============================================================================
-- 5. GENERADOR DROP FUNCTION
-- ============================================================================

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_get_tb_compensacion_meta_sede',
  'f_post_tb_compensacion_meta_sede',
  'f_patch_tb_compensacion_meta_sede',
  'f_get_tb_compensacion_excepcion',
  'f_post_tb_compensacion_excepcion',
  'f_patch_tb_compensacion_excepcion',
  'f_post_tb_compensacion_excepcion_decidir',
  'f_get_tb_compensacion_penalidad_tipo',
  'f_post_tb_compensacion_penalidad_tipo',
  'f_patch_tb_compensacion_penalidad_tipo'
)
ORDER BY n.nspname, p.proname;
