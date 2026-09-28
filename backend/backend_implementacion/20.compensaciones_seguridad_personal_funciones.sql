-- ============================================================================
-- COMPENSACIONES - SEGURIDAD Y FUNCIONES DE PERSONAL
-- ============================================================================
-- Objetivo:
--   Exponer los primeros contratos RPC del modulo con autorizacion por sesion,
--   capacidad y alcance. Este archivo no modifica tablas de Operaciones ni Caja.
--
-- Dependencias:
--   01.core_catalogos_permisos.sql
--   17.compensaciones_personal_configuracion.sql
-- ============================================================================

-- ============================================================================
-- 1. CONTEXTO PRIVADO DE AUTORIZACION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_compensacion_contexto(
  p_recurso character varying,
  p_accion character varying
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor public.tb_usuario%ROWTYPE;
  v_acceso public.tb_compensacion_acceso%ROWTYPE;
  v_id_colaborador bigint;
  v_es_super_admin boolean := false;
  v_permitido boolean := false;
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

  IF v_es_super_admin THEN
    RETURN jsonb_build_object(
      'id_usuario', v_actor.id,
      'id_sucursal_usuario', v_actor.id_sucursal,
      'id_colaborador', v_id_colaborador,
      'es_super_admin', true,
      'recurso', v_recurso,
      'accion', v_accion,
      'alcance', 'GLOBAL',
      'id_sucursal_alcance', NULL
    );
  END IF;

  SELECT a.*
  INTO v_acceso
  FROM public.tb_compensacion_acceso a
  JOIN public.tb_estado e ON e.id = a.id_estado
  WHERE a.id_usuario = v_actor.id
    AND a.recurso = v_recurso
    AND UPPER(e.nombre) = 'ACTIVO'
  LIMIT 1;

  IF v_acceso.id IS NULL THEN
    RAISE EXCEPTION 'No tiene acceso al recurso de compensaciones: %', v_recurso;
  END IF;

  v_permitido := CASE v_accion
    WHEN 'CONSULTAR' THEN v_acceso.puede_consultar
    WHEN 'REGISTRAR' THEN v_acceso.puede_registrar
    WHEN 'EDITAR' THEN v_acceso.puede_editar
    WHEN 'REVISAR' THEN v_acceso.puede_revisar
    WHEN 'APROBAR' THEN v_acceso.puede_aprobar
    WHEN 'PAGAR' THEN v_acceso.puede_pagar
    WHEN 'CERRAR' THEN v_acceso.puede_cerrar
    WHEN 'CONFIGURAR' THEN v_acceso.puede_configurar
    ELSE false
  END;

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
    'alcance', v_acceso.alcance,
    'id_sucursal_alcance', v_acceso.id_sucursal
  );
END;
$$;

REVOKE ALL ON FUNCTION public.f_private_compensacion_contexto(
  character varying,
  character varying
) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. ACCESOS DE COMPENSACIONES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_acceso(
  p_id_usuario bigint DEFAULT NULL,
  p_recurso character varying DEFAULT NULL,
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
$$;

CREATE OR REPLACE FUNCTION public.f_put_tb_compensacion_acceso(
  p_id_usuario bigint,
  p_recurso character varying,
  p_alcance character varying,
  p_id_sucursal bigint DEFAULT NULL,
  p_puede_consultar boolean DEFAULT false,
  p_puede_registrar boolean DEFAULT false,
  p_puede_editar boolean DEFAULT false,
  p_puede_revisar boolean DEFAULT false,
  p_puede_aprobar boolean DEFAULT false,
  p_puede_pagar boolean DEFAULT false,
  p_puede_cerrar boolean DEFAULT false,
  p_puede_configurar boolean DEFAULT false,
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
    'RESUMEN', 'COLABORADORES', 'ASISTENCIA', 'EVIDENCIAS',
    'INCIDENCIAS', 'LIQUIDACIONES', 'CIERRES', 'CONFIGURACION', 'REPORTES'
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
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_usuario_acceso(
  p_busqueda character varying DEFAULT NULL
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
$$;

-- ============================================================================
-- 3. CARGOS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_cargo(
  p_id bigint DEFAULT NULL,
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_cargo(
  p_codigo character varying,
  p_nombre character varying,
  p_descripcion text DEFAULT NULL,
  p_orden integer DEFAULT 0,
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
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_cargo(
  p_id bigint,
  p_codigo character varying DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_descripcion text DEFAULT NULL,
  p_orden integer DEFAULT NULL,
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
$$;

-- ============================================================================
-- 4. JORNADAS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_jornada(
  p_id bigint DEFAULT NULL,
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
  v_contexto := public.f_private_compensacion_contexto(
    'CONFIGURACION',
    'CONSULTAR'
  );

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', j.id,
    'codigo', j.codigo,
    'nombre', j.nombre,
    'modalidad', j.modalidad,
    'hora_entrada', j.hora_entrada,
    'hora_salida', j.hora_salida,
    'minutos_tolerancia', j.minutos_tolerancia,
    'minutos_descanso', j.minutos_descanso,
    'dias_semana', to_jsonb(j.dias_semana),
    'cruza_medianoche', j.cruza_medianoche,
    'id_estado', j.id_estado,
    'estado_nombre', e.nombre,
    'fecha_registro', j.fecha_registro,
    'fecha_actualizacion', j.fecha_actualizacion
  )
  FROM public.tb_compensacion_jornada j
  JOIN public.tb_estado e ON e.id = j.id_estado
  WHERE (p_id IS NULL OR j.id = p_id)
    AND (
      p_busqueda IS NULL
      OR j.codigo ILIKE '%' || TRIM(p_busqueda) || '%'
      OR j.nombre ILIKE '%' || TRIM(p_busqueda) || '%'
    )
    AND (p_id_estado IS NULL OR j.id_estado = p_id_estado)
  ORDER BY j.nombre, j.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_jornada(
  p_codigo character varying,
  p_nombre character varying,
  p_modalidad character varying,
  p_hora_entrada time without time zone,
  p_hora_salida time without time zone,
  p_minutos_tolerancia integer DEFAULT 0,
  p_minutos_descanso integer DEFAULT 0,
  p_dias_semana smallint[] DEFAULT ARRAY[1, 2, 3, 4, 5]::smallint[],
  p_cruza_medianoche boolean DEFAULT false,
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

  SELECT COALESCE(
    p_id_estado,
    (SELECT e.id FROM public.tb_estado e WHERE UPPER(e.nombre) = 'ACTIVO' ORDER BY e.id LIMIT 1)
  ) INTO v_id_estado;

  IF v_id_estado IS NULL THEN
    RAISE EXCEPTION 'No existe un estado ACTIVO para registrar la jornada';
  END IF;

  INSERT INTO public.tb_compensacion_jornada (
    codigo, nombre, modalidad, hora_entrada, hora_salida,
    minutos_tolerancia, minutos_descanso, dias_semana, cruza_medianoche,
    id_estado, id_usuario
  ) VALUES (
    UPPER(TRIM(p_codigo)), TRIM(p_nombre),
    UPPER(TRIM(COALESCE(p_modalidad, 'TIEMPO_COMPLETO'))),
    p_hora_entrada, p_hora_salida, COALESCE(p_minutos_tolerancia, 0),
    COALESCE(p_minutos_descanso, 0),
    COALESCE(p_dias_semana, ARRAY[1, 2, 3, 4, 5]::smallint[]),
    COALESCE(p_cruza_medianoche, false), v_id_estado, v_id_actor
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT to_jsonb(j)
    FROM public.tb_compensacion_jornada j
    WHERE j.id = v_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe una jornada con ese codigo';
END;
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_jornada(
  p_id bigint,
  p_codigo character varying DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_modalidad character varying DEFAULT NULL,
  p_hora_entrada time without time zone DEFAULT NULL,
  p_hora_salida time without time zone DEFAULT NULL,
  p_minutos_tolerancia integer DEFAULT NULL,
  p_minutos_descanso integer DEFAULT NULL,
  p_dias_semana smallint[] DEFAULT NULL,
  p_cruza_medianoche boolean DEFAULT NULL,
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

  IF NOT EXISTS (SELECT 1 FROM public.tb_compensacion_jornada WHERE id = p_id) THEN
    RAISE EXCEPTION 'La jornada no existe';
  END IF;

  UPDATE public.tb_compensacion_jornada
  SET codigo = CASE WHEN p_codigo IS NULL THEN codigo ELSE UPPER(TRIM(p_codigo)) END,
      nombre = CASE WHEN p_nombre IS NULL THEN nombre ELSE TRIM(p_nombre) END,
      modalidad = CASE WHEN p_modalidad IS NULL THEN modalidad ELSE UPPER(TRIM(p_modalidad)) END,
      hora_entrada = COALESCE(p_hora_entrada, hora_entrada),
      hora_salida = COALESCE(p_hora_salida, hora_salida),
      minutos_tolerancia = COALESCE(p_minutos_tolerancia, minutos_tolerancia),
      minutos_descanso = COALESCE(p_minutos_descanso, minutos_descanso),
      dias_semana = COALESCE(p_dias_semana, dias_semana),
      cruza_medianoche = COALESCE(p_cruza_medianoche, cruza_medianoche),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN (
    SELECT to_jsonb(j)
    FROM public.tb_compensacion_jornada j
    WHERE j.id = p_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe una jornada con ese codigo';
END;
$$;

-- ============================================================================
-- 5. COLABORADORES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_colaborador(
  p_id bigint DEFAULT NULL,
  p_busqueda character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_sucursal bigint DEFAULT NULL,
  p_id_cargo bigint DEFAULT NULL,
  p_fecha_referencia date DEFAULT CURRENT_DATE,
  p_pagina integer DEFAULT 1,
  p_tamano_pagina integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
      a.id_jornada,
      j.nombre AS jornada_nombre,
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
    LEFT JOIN public.tb_compensacion_jornada j ON j.id = a.id_jornada
    LEFT JOIN public.tb_compensacion_plan p ON p.id = a.id_plan
    WHERE (p_id IS NULL OR c.id = p_id)
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
  SELECT COUNT(*) INTO v_total FROM base;

  WITH base AS (
    SELECT
      c.*,
      a.id AS id_asignacion,
      a.id_cargo,
      ca.nombre AS cargo_nombre,
      a.id_sucursal,
      s.nombre AS sucursal_nombre,
      a.id_jornada,
      j.nombre AS jornada_nombre,
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
    LEFT JOIN public.tb_compensacion_jornada j ON j.id = a.id_jornada
    LEFT JOIN public.tb_compensacion_plan p ON p.id = a.id_plan
    WHERE (p_id IS NULL OR c.id = p_id)
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
    'total', v_total,
    'pagina', v_pagina,
    'tamano_pagina', v_tamano,
    'total_paginas', CASE
      WHEN v_total = 0 THEN 0
      ELSE CEIL(v_total::numeric / v_tamano)::integer
    END
  );
END;
$$;

-- ============================================================================
-- 5.1 USUARIOS ELEGIBLES PARA FICHA LABORAL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_usuario_elegible(
  p_busqueda character varying DEFAULT NULL,
  p_id_colaborador bigint DEFAULT NULL
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_colaborador(
  p_tipo_documento character varying,
  p_numero_documento character varying,
  p_nombres character varying,
  p_apellido_paterno character varying,
  p_apellido_materno character varying,
  p_nombre_completo character varying,
  p_fecha_ingreso date,
  p_id_cargo bigint,
  p_id_sucursal bigint,
  p_id_jornada bigint,
  p_id_plan bigint,
  p_id_usuario bigint DEFAULT NULL,
  p_email character varying DEFAULT NULL,
  p_celular character varying DEFAULT NULL,
  p_codigo_huellero character varying DEFAULT NULL,
  p_modalidad character varying DEFAULT 'PRESENCIAL',
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

  IF NOT EXISTS (SELECT 1 FROM public.tb_compensacion_jornada WHERE id = p_id_jornada) THEN
    RAISE EXCEPTION 'La jornada seleccionada no existe';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tb_compensacion_plan WHERE id = p_id_plan) THEN
    RAISE EXCEPTION 'El plan seleccionado no existe';
  END IF;

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
    id_sucursal,
    id_jornada,
    id_plan,
    fecha_inicio,
    modalidad,
    id_estado,
    id_usuario
  ) VALUES (
    v_id_colaborador,
    p_id_cargo,
    p_id_sucursal,
    p_id_jornada,
    p_id_plan,
    p_fecha_ingreso,
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
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_colaborador(
  p_id bigint,
  p_id_usuario bigint DEFAULT NULL,
  p_tipo_documento character varying DEFAULT NULL,
  p_numero_documento character varying DEFAULT NULL,
  p_nombres character varying DEFAULT NULL,
  p_apellido_paterno character varying DEFAULT NULL,
  p_apellido_materno character varying DEFAULT NULL,
  p_nombre_completo character varying DEFAULT NULL,
  p_email character varying DEFAULT NULL,
  p_celular character varying DEFAULT NULL,
  p_codigo_huellero character varying DEFAULT NULL,
  p_fecha_ingreso date DEFAULT NULL,
  p_fecha_cese date DEFAULT NULL,
  p_motivo_cese text DEFAULT NULL,
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
  WHERE id = p_id;

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

  UPDATE public.tb_compensacion_colaborador
  SET id_usuario = COALESCE(p_id_usuario, id_usuario),
      tipo_documento = CASE WHEN p_tipo_documento IS NULL THEN tipo_documento ELSE UPPER(TRIM(p_tipo_documento)) END,
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
$$;

-- ============================================================================
-- 6. PERMISOS DE EJECUCION
-- ============================================================================

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_acceso(
  bigint, character varying, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_acceso(
  bigint, character varying, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_put_tb_compensacion_acceso(
  bigint, character varying, character varying, bigint,
  boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_put_tb_compensacion_acceso(
  bigint, character varying, character varying, bigint,
  boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_usuario_acceso(
  character varying
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_usuario_acceso(
  character varying
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_cargo(
  bigint, character varying, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_cargo(
  bigint, character varying, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_cargo(
  character varying, character varying, text, integer, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_cargo(
  character varying, character varying, text, integer, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_cargo(
  bigint, character varying, character varying, text, integer, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_cargo(
  bigint, character varying, character varying, text, integer, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_jornada(
  bigint, character varying, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_jornada(
  bigint, character varying, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_jornada(
  character varying, character varying, character varying,
  time without time zone, time without time zone, integer, integer,
  smallint[], boolean, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_jornada(
  character varying, character varying, character varying,
  time without time zone, time without time zone, integer, integer,
  smallint[], boolean, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_jornada(
  bigint, character varying, character varying, character varying,
  time without time zone, time without time zone, integer, integer,
  smallint[], boolean, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_jornada(
  bigint, character varying, character varying, character varying,
  time without time zone, time without time zone, integer, integer,
  smallint[], boolean, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_colaborador(
  bigint, character varying, bigint, bigint, bigint, date, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_colaborador(
  bigint, character varying, bigint, bigint, bigint, date, integer, integer
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_usuario_elegible(
  character varying, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_usuario_elegible(
  character varying, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_colaborador(
  character varying, character varying, character varying,
  character varying, character varying, character varying, date,
  bigint, bigint, bigint, bigint, bigint, character varying,
  character varying, character varying, character varying, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_colaborador(
  character varying, character varying, character varying,
  character varying, character varying, character varying, date,
  bigint, bigint, bigint, bigint, bigint, character varying,
  character varying, character varying, character varying, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_colaborador(
  bigint, bigint, character varying, character varying, character varying,
  character varying, character varying, character varying,
  character varying, character varying, character varying,
  date, date, text, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_colaborador(
  bigint, bigint, character varying, character varying, character varying,
  character varying, character varying, character varying,
  character varying, character varying, character varying,
  date, date, text, bigint
) TO authenticated;

-- ============================================================================
-- 7. GENERADOR DROP FUNCTION
-- ============================================================================

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_private_compensacion_contexto',
  'f_get_tb_compensacion_acceso',
  'f_get_tb_compensacion_colaborador',
  'f_get_tb_compensacion_usuario_acceso',
  'f_get_tb_compensacion_usuario_elegible',
  'f_post_tb_compensacion_colaborador'
)
ORDER BY n.nspname, p.proname;
