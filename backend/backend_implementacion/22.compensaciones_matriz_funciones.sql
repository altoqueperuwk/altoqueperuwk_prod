-- ============================================================================
-- COMPENSACIONES - MATRIZ DE PLANES, VERSIONES, CONCEPTOS Y REGLAS
-- ============================================================================
-- Objetivo:
--   Administrar la matriz madre con versiones publicables e inmutables.
--
-- Dependencias:
--   17.compensaciones_personal_configuracion.sql
--   20.compensaciones_seguridad_personal_funciones.sql
-- ============================================================================

-- ============================================================================
-- 1. PLANES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_plan(
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_plan(
  p_codigo character varying,
  p_nombre character varying,
  p_descripcion text DEFAULT NULL,
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
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_plan(
  p_id bigint,
  p_codigo character varying DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_descripcion text DEFAULT NULL,
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
$$;

-- ============================================================================
-- 2. VERSIONES DE PLAN
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_plan_version(
  p_id bigint DEFAULT NULL,
  p_id_plan bigint DEFAULT NULL,
  p_estado_version character varying DEFAULT NULL,
  p_fecha_referencia date DEFAULT NULL
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_plan_version(
  p_id_plan bigint,
  p_fecha_inicio date,
  p_fecha_fin date DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_plan_version(
  p_id bigint,
  p_nombre character varying DEFAULT NULL,
  p_fecha_inicio date DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL,
  p_limpiar_fecha_fin boolean DEFAULT false,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_plan_version_publicar(
  p_id bigint,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
$$;

-- ============================================================================
-- 3. CONCEPTOS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_concepto(
  p_id bigint DEFAULT NULL,
  p_busqueda character varying DEFAULT NULL,
  p_categoria character varying DEFAULT NULL,
  p_naturaleza character varying DEFAULT NULL,
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_concepto(
  p_codigo character varying,
  p_nombre character varying,
  p_categoria character varying,
  p_naturaleza character varying,
  p_unidad character varying DEFAULT 'MONTO',
  p_requiere_evidencia boolean DEFAULT false,
  p_requiere_aprobacion boolean DEFAULT false,
  p_permite_excepcion boolean DEFAULT true,
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
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_concepto(
  p_id bigint,
  p_codigo character varying DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_categoria character varying DEFAULT NULL,
  p_naturaleza character varying DEFAULT NULL,
  p_unidad character varying DEFAULT NULL,
  p_requiere_evidencia boolean DEFAULT NULL,
  p_requiere_aprobacion boolean DEFAULT NULL,
  p_permite_excepcion boolean DEFAULT NULL,
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
$$;

-- ============================================================================
-- 4. REGLAS DE COMPENSACION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_regla(
  p_id bigint DEFAULT NULL,
  p_id_plan_version bigint DEFAULT NULL,
  p_id_concepto bigint DEFAULT NULL,
  p_id_cargo bigint DEFAULT NULL,
  p_id_sucursal bigint DEFAULT NULL,
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
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_regla(
  p_id_plan_version bigint,
  p_id_concepto bigint,
  p_tipo_calculo character varying,
  p_id_cargo bigint DEFAULT NULL,
  p_id_sucursal bigint DEFAULT NULL,
  p_monto numeric DEFAULT NULL,
  p_porcentaje numeric DEFAULT NULL,
  p_valor_minimo numeric DEFAULT NULL,
  p_valor_maximo numeric DEFAULT NULL,
  p_tope_importe numeric DEFAULT NULL,
  p_prioridad integer DEFAULT 0,
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
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_regla(
  p_id bigint,
  p_id_concepto bigint DEFAULT NULL,
  p_id_cargo bigint DEFAULT NULL,
  p_limpiar_cargo boolean DEFAULT false,
  p_id_sucursal bigint DEFAULT NULL,
  p_limpiar_sucursal boolean DEFAULT false,
  p_tipo_calculo character varying DEFAULT NULL,
  p_monto numeric DEFAULT NULL,
  p_porcentaje numeric DEFAULT NULL,
  p_valor_minimo numeric DEFAULT NULL,
  p_valor_maximo numeric DEFAULT NULL,
  p_tope_importe numeric DEFAULT NULL,
  p_prioridad integer DEFAULT NULL,
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
$$;

-- ============================================================================
-- 5. PERMISOS DE EJECUCION
-- ============================================================================

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_plan(
  bigint, character varying, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_plan(
  bigint, character varying, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_plan(
  character varying, character varying, text, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_plan(
  character varying, character varying, text, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_plan(
  bigint, character varying, character varying, text, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_plan(
  bigint, character varying, character varying, text, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_plan_version(
  bigint, bigint, character varying, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_plan_version(
  bigint, bigint, character varying, date
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_plan_version(
  bigint, date, date, character varying, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_plan_version(
  bigint, date, date, character varying, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_plan_version(
  bigint, character varying, date, date, boolean, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_plan_version(
  bigint, character varying, date, date, boolean, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_plan_version_publicar(
  bigint, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_plan_version_publicar(
  bigint, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_concepto(
  bigint, character varying, character varying, character varying, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_concepto(
  bigint, character varying, character varying, character varying, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_concepto(
  character varying, character varying, character varying, character varying,
  character varying, boolean, boolean, boolean, integer, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_concepto(
  character varying, character varying, character varying, character varying,
  character varying, boolean, boolean, boolean, integer, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_concepto(
  bigint, character varying, character varying, character varying,
  character varying, character varying, boolean, boolean, boolean,
  integer, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_concepto(
  bigint, character varying, character varying, character varying,
  character varying, character varying, boolean, boolean, boolean,
  integer, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_regla(
  bigint, bigint, bigint, bigint, bigint, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_regla(
  bigint, bigint, bigint, bigint, bigint, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_regla(
  bigint, bigint, character varying, bigint, bigint,
  numeric, numeric, numeric, numeric, numeric, integer, jsonb, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_regla(
  bigint, bigint, character varying, bigint, bigint,
  numeric, numeric, numeric, numeric, numeric, integer, jsonb, bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_regla(
  bigint, bigint, bigint, boolean, bigint, boolean, character varying,
  numeric, numeric, numeric, numeric, numeric, integer, jsonb, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_regla(
  bigint, bigint, bigint, boolean, bigint, boolean, character varying,
  numeric, numeric, numeric, numeric, numeric, integer, jsonb, bigint
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
  'f_post_tb_compensacion_regla',
  'f_patch_tb_compensacion_regla'
)
ORDER BY n.nspname, p.proname;
