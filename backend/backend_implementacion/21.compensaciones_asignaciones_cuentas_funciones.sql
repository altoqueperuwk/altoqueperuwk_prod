-- ============================================================================
-- COMPENSACIONES - ASIGNACIONES LABORALES Y CUENTAS DE PAGO
-- ============================================================================
-- Objetivo:
--   Administrar el historial laboral y las cuentas de deposito respetando
--   alcance propio/sede/global, periodos cerrados y datos sensibles.
--
-- Dependencias:
--   17.compensaciones_personal_configuracion.sql
--   19.compensaciones_liquidaciones_cierres_reportes.sql
--   20.compensaciones_seguridad_personal_funciones.sql
-- ============================================================================

-- ============================================================================
-- 1. VALIDACION PRIVADA DEL ALCANCE SOBRE UN COLABORADOR
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_compensacion_validar_colaborador(
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

  RETURN v_contexto;
END;
$$;

REVOKE ALL ON FUNCTION public.f_private_compensacion_validar_colaborador(
  bigint,
  character varying,
  date
) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. CONSULTA DEL HISTORIAL DE ASIGNACIONES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_asignacion(
  p_id_colaborador bigint,
  p_id bigint DEFAULT NULL,
  p_fecha_referencia date DEFAULT CURRENT_DATE
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
    'id_jornada', a.id_jornada,
    'jornada_nombre', j.nombre,
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
  JOIN public.tb_compensacion_jornada j ON j.id = a.id_jornada
  JOIN public.tb_compensacion_plan p ON p.id = a.id_plan
  JOIN public.tb_estado e ON e.id = a.id_estado
  WHERE a.id_colaborador = p_id_colaborador
    AND (p_id IS NULL OR a.id = p_id)
  ORDER BY a.fecha_inicio DESC, a.id DESC;
END;
$$;

-- ============================================================================
-- 3. CAMBIO DE ASIGNACION LABORAL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_asignacion_cambio(
  p_id_colaborador bigint,
  p_id_cargo bigint,
  p_id_sucursal bigint,
  p_id_jornada bigint,
  p_id_plan bigint,
  p_fecha_inicio date,
  p_modalidad character varying DEFAULT 'PRESENCIAL',
  p_observacion text DEFAULT NULL,
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
    WHERE pe.estado_periodo = 'CERRADO'
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
       WHERE pe.estado_periodo = 'CERRADO'
         AND daterange(pe.fecha_inicio, pe.fecha_fin, '[]')
             && daterange(
               v_actual.fecha_inicio,
               COALESCE(v_actual.fecha_fin, 'infinity'::date),
               '[]'
             )
     ) THEN
    RAISE EXCEPTION 'No se puede corregir una asignacion que alcanza periodos cerrados';
  END IF;

  IF v_alcance = 'SEDE' AND (
    v_actual.id IS NULL
    OR v_actual.id_sucursal IS DISTINCT FROM v_id_sucursal_alcance
    OR p_id_sucursal IS DISTINCT FROM v_id_sucursal_alcance
  ) THEN
    RAISE EXCEPTION 'Un acceso de sede no puede trasladar colaboradores entre sedes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_cargo WHERE id = p_id_cargo
  ) THEN
    RAISE EXCEPTION 'El cargo seleccionado no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_sucursal WHERE id = p_id_sucursal
  ) THEN
    RAISE EXCEPTION 'La sucursal seleccionada no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_jornada WHERE id = p_id_jornada
  ) THEN
    RAISE EXCEPTION 'La jornada seleccionada no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_plan WHERE id = p_id_plan
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
        id_jornada = p_id_jornada,
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
      id_sucursal,
      id_jornada,
      id_plan,
      fecha_inicio,
      modalidad,
      observacion,
      id_estado,
      id_usuario
    ) VALUES (
      p_id_colaborador,
      p_id_cargo,
      p_id_sucursal,
      p_id_jornada,
      p_id_plan,
      p_fecha_inicio,
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
      'id_jornada', a.id_jornada,
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
$$;

-- ============================================================================
-- 4. CONSULTA DE CUENTAS DE PAGO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_cuenta_pago(
  p_id_colaborador bigint,
  p_id bigint DEFAULT NULL,
  p_solo_vigentes boolean DEFAULT false,
  p_incluir_datos_completos boolean DEFAULT false
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
  v_puede_ver_completo boolean := false;
BEGIN
  v_contexto := public.f_private_compensacion_validar_colaborador(
    p_id_colaborador,
    'CONSULTAR',
    CURRENT_DATE
  );
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(
    v_contexto ->> 'id_colaborador',
    ''
  )::bigint;

  IF COALESCE(p_incluir_datos_completos, false) THEN
    IF v_alcance = 'PROPIO'
       AND p_id_colaborador = v_id_colaborador_actor THEN
      v_puede_ver_completo := true;
    ELSE
      PERFORM public.f_private_compensacion_contexto(
        'LIQUIDACIONES',
        'PAGAR'
      );
      v_puede_ver_completo := true;
    END IF;
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', cp.id,
    'id_colaborador', cp.id_colaborador,
    'id_banco', cp.id_banco,
    'banco_nombre', b.nombre,
    'tipo_cuenta', cp.tipo_cuenta,
    'moneda', cp.moneda,
    'numero_cuenta', CASE
      WHEN v_puede_ver_completo THEN cp.numero_cuenta
      ELSE repeat('*', GREATEST(length(cp.numero_cuenta) - 4, 0))
           || right(cp.numero_cuenta, 4)
    END,
    'numero_cci', CASE
      WHEN cp.numero_cci IS NULL THEN NULL
      WHEN v_puede_ver_completo THEN cp.numero_cci
      ELSE repeat('*', GREATEST(length(cp.numero_cci) - 4, 0))
           || right(cp.numero_cci, 4)
    END,
    'titular', cp.titular,
    'es_principal', cp.es_principal,
    'fecha_inicio', cp.fecha_inicio,
    'fecha_fin', cp.fecha_fin,
    'id_estado', cp.id_estado,
    'estado_nombre', e.nombre,
    'fecha_registro', cp.fecha_registro,
    'fecha_actualizacion', cp.fecha_actualizacion
  )
  FROM public.tb_compensacion_cuenta_pago cp
  JOIN public.tb_banco b ON b.id = cp.id_banco
  JOIN public.tb_estado e ON e.id = cp.id_estado
  WHERE cp.id_colaborador = p_id_colaborador
    AND (p_id IS NULL OR cp.id = p_id)
    AND (
      NOT COALESCE(p_solo_vigentes, false)
      OR (
        cp.fecha_inicio <= CURRENT_DATE
        AND (cp.fecha_fin IS NULL OR cp.fecha_fin >= CURRENT_DATE)
      )
    )
  ORDER BY cp.es_principal DESC, cp.fecha_inicio DESC, cp.id DESC;
END;
$$;

-- ============================================================================
-- 5. REGISTRO DE CUENTA DE PAGO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_cuenta_pago(
  p_id_colaborador bigint,
  p_id_banco bigint,
  p_tipo_cuenta character varying,
  p_numero_cuenta character varying,
  p_titular character varying,
  p_fecha_inicio date,
  p_numero_cci character varying DEFAULT NULL,
  p_moneda character varying DEFAULT 'PEN',
  p_es_principal boolean DEFAULT false,
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
  v_contexto := public.f_private_compensacion_validar_colaborador(
    p_id_colaborador,
    'EDITAR',
    CURRENT_DATE
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF v_contexto ->> 'alcance' = 'PROPIO' THEN
    RAISE EXCEPTION 'La cuenta de pago debe ser registrada por un usuario autorizado';
  END IF;

  IF NULLIF(TRIM(p_numero_cuenta), '') IS NULL
     OR NULLIF(TRIM(p_tipo_cuenta), '') IS NULL
     OR NULLIF(TRIM(p_titular), '') IS NULL
     OR p_fecha_inicio IS NULL THEN
    RAISE EXCEPTION 'Numero de cuenta, titular y fecha de inicio son obligatorios';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tb_banco WHERE id = p_id_banco) THEN
    RAISE EXCEPTION 'El banco seleccionado no existe';
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
    RAISE EXCEPTION 'No existe un estado ACTIVO para registrar la cuenta';
  END IF;

  IF COALESCE(p_es_principal, false) THEN
    UPDATE public.tb_compensacion_cuenta_pago
    SET fecha_fin = CASE
          WHEN fecha_inicio < p_fecha_inicio THEN p_fecha_inicio - 1
          ELSE fecha_fin
        END,
        es_principal = CASE
          WHEN fecha_inicio < p_fecha_inicio THEN true
          ELSE false
        END,
        id_usuario = v_id_actor,
        fecha_actualizacion = now()
    WHERE id_colaborador = p_id_colaborador
      AND es_principal
      AND fecha_fin IS NULL;
  END IF;

  INSERT INTO public.tb_compensacion_cuenta_pago (
    id_colaborador,
    id_banco,
    tipo_cuenta,
    moneda,
    numero_cuenta,
    numero_cci,
    titular,
    es_principal,
    fecha_inicio,
    id_estado,
    id_usuario
  ) VALUES (
    p_id_colaborador,
    p_id_banco,
    UPPER(TRIM(p_tipo_cuenta)),
    UPPER(TRIM(COALESCE(p_moneda, 'PEN'))),
    TRIM(p_numero_cuenta),
    NULLIF(TRIM(p_numero_cci), ''),
    TRIM(p_titular),
    COALESCE(p_es_principal, false),
    p_fecha_inicio,
    v_id_estado,
    v_id_actor
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'id_colaborador', p_id_colaborador,
    'es_principal', COALESCE(p_es_principal, false),
    'mensaje', 'Cuenta de pago registrada correctamente'
  );
END;
$$;

-- ============================================================================
-- 6. ACTUALIZACION DE CUENTA DE PAGO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_cuenta_pago(
  p_id bigint,
  p_id_banco bigint DEFAULT NULL,
  p_tipo_cuenta character varying DEFAULT NULL,
  p_numero_cuenta character varying DEFAULT NULL,
  p_numero_cci character varying DEFAULT NULL,
  p_titular character varying DEFAULT NULL,
  p_moneda character varying DEFAULT NULL,
  p_es_principal boolean DEFAULT NULL,
  p_fecha_inicio date DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actual public.tb_compensacion_cuenta_pago%ROWTYPE;
  v_contexto jsonb;
  v_id_actor bigint;
  v_fecha_inicio_final date;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_compensacion_cuenta_pago
  WHERE id = p_id
  FOR UPDATE;

  IF v_actual.id IS NULL THEN
    RAISE EXCEPTION 'La cuenta de pago no existe';
  END IF;

  v_contexto := public.f_private_compensacion_validar_colaborador(
    v_actual.id_colaborador,
    'EDITAR',
    CURRENT_DATE
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF v_contexto ->> 'alcance' = 'PROPIO' THEN
    RAISE EXCEPTION 'La cuenta de pago debe ser actualizada por un usuario autorizado';
  END IF;

  v_fecha_inicio_final := COALESCE(p_fecha_inicio, v_actual.fecha_inicio);

  IF p_fecha_fin IS NOT NULL AND p_fecha_fin < v_fecha_inicio_final THEN
    RAISE EXCEPTION 'La fecha fin no puede ser anterior a la fecha de inicio';
  END IF;

  IF p_id_banco IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tb_banco WHERE id = p_id_banco) THEN
    RAISE EXCEPTION 'El banco seleccionado no existe';
  END IF;

  IF COALESCE(p_es_principal, false) AND p_fecha_fin IS NULL THEN
    UPDATE public.tb_compensacion_cuenta_pago
    SET fecha_fin = CASE
          WHEN fecha_inicio < v_fecha_inicio_final
            THEN v_fecha_inicio_final - 1
          ELSE fecha_fin
        END,
        es_principal = CASE
          WHEN fecha_inicio < v_fecha_inicio_final THEN true
          ELSE false
        END,
        id_usuario = v_id_actor,
        fecha_actualizacion = now()
    WHERE id_colaborador = v_actual.id_colaborador
      AND id <> p_id
      AND es_principal
      AND fecha_fin IS NULL;
  END IF;

  UPDATE public.tb_compensacion_cuenta_pago
  SET id_banco = COALESCE(p_id_banco, id_banco),
      tipo_cuenta = CASE
        WHEN p_tipo_cuenta IS NULL THEN tipo_cuenta
        ELSE UPPER(TRIM(p_tipo_cuenta))
      END,
      moneda = CASE
        WHEN p_moneda IS NULL THEN moneda
        ELSE UPPER(TRIM(p_moneda))
      END,
      numero_cuenta = CASE
        WHEN p_numero_cuenta IS NULL THEN numero_cuenta
        ELSE TRIM(p_numero_cuenta)
      END,
      numero_cci = CASE
        WHEN p_numero_cci IS NULL THEN numero_cci
        ELSE NULLIF(TRIM(p_numero_cci), '')
      END,
      titular = CASE
        WHEN p_titular IS NULL THEN titular
        ELSE TRIM(p_titular)
      END,
      es_principal = CASE
        WHEN p_fecha_fin IS NOT NULL THEN false
        ELSE COALESCE(p_es_principal, es_principal)
      END,
      fecha_inicio = v_fecha_inicio_final,
      fecha_fin = COALESCE(p_fecha_fin, fecha_fin),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', p_id,
    'id_colaborador', v_actual.id_colaborador,
    'mensaje', 'Cuenta de pago actualizada correctamente'
  );
END;
$$;

-- ============================================================================
-- 7. PERMISOS DE EJECUCION
-- ============================================================================

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_asignacion(
  bigint, bigint, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_asignacion(
  bigint, bigint, date
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_asignacion_cambio(
  bigint, bigint, bigint, bigint, bigint, date,
  character varying, text, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_asignacion_cambio(
  bigint, bigint, bigint, bigint, bigint, date,
  character varying, text, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_cuenta_pago(
  bigint, bigint, boolean, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_cuenta_pago(
  bigint, bigint, boolean, boolean
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_cuenta_pago(
  bigint, bigint, character varying, character varying, character varying,
  date, character varying, character varying, boolean, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_cuenta_pago(
  bigint, bigint, character varying, character varying, character varying,
  date, character varying, character varying, boolean, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_cuenta_pago(
  bigint, bigint, character varying, character varying, character varying,
  character varying, character varying, boolean, date, date, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_cuenta_pago(
  bigint, bigint, character varying, character varying, character varying,
  character varying, character varying, boolean, date, date, bigint
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
  'f_private_compensacion_validar_colaborador',
  'f_get_tb_compensacion_asignacion',
  'f_post_tb_compensacion_asignacion_cambio',
  'f_get_tb_compensacion_cuenta_pago',
  'f_post_tb_compensacion_cuenta_pago',
  'f_patch_tb_compensacion_cuenta_pago'
)
ORDER BY n.nspname, p.proname;
