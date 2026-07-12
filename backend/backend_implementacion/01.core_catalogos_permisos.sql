-- ============================================================================
-- MIGRACION SISTEMA COMPACTO - FUNCIONES GET / POST / PATCH
-- ============================================================================
-- Patron aplicado:
--   GET:
--     - request con todos los campos relevantes de la tabla como filtros opcionales
--     - response con PK + campos propios + auditoria + enriquecimiento FK
--
--   POST:
--     - request con todos los campos editables de la tabla
--     - response se obtiene desde su GET por id
--
--   PATCH:
--     - request con PK + todos los campos editables de la tabla
--     - response se obtiene desde su GET por id
--
-- Convenciones adoptadas para el modelo compacto:
--   - campos json conceptuales:
--       tb_cliente.celular                -> jsonb
--       tb_banco.nombre_equivalencia      -> jsonb
--   - campos compactados tipo catalogo:
--       tb_codigo_servicio.tipo           -> character varying
--       tb_banco.tipo                     -> bigint
--       tb_reglas_efectivizacion.tipo_deposito -> bigint
--
-- Nota:
--   Este archivo modela el backend compacto esperado aun si el DDL de tablas
--   sigue evolucionando en `2.compactacion_tabla.sql`.
--
-- Criterio transversal de este archivo:
--   - el frontend no debe hardcodear reglas de negocio, permisos ni estructura
--     navegable
--   - las tablas de backend deben exponer contratos suficientes para que el
--     frontend solo renderice y consulte
--   - en permisos, el backend debe ser la fuente unica de verdad para:
--       1. menu visible
--       2. rutas permitidas
--       3. bypass administrativo
-- ============================================================================

/*
Funcion privada: f_private_append_snapshot_his
Objetivo:
  Insertar automaticamente un snapshot completo de la fila afectada en la tabla
  espejo `<tabla>_his` cada vez que ocurra un INSERT o UPDATE sobre una tabla
  core o de permisos.
*/
CREATE OR REPLACE FUNCTION public.f_private_append_snapshot_his()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE format(
    'INSERT INTO %I.%I_his SELECT ($1).*',
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME
  )
  USING NEW;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 1. TB_ESTADO
-- ============================================================================

/*
Tabla: tb_estado
Objetivo:
  Catalogo transversal de estados del sistema.
*/
CREATE TABLE IF NOT EXISTS public.tb_estado (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_estado_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tb_estado_his AS
TABLE public.tb_estado
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_estado_his ON public.tb_estado;
CREATE TRIGGER trg_tb_estado_his
AFTER INSERT OR UPDATE ON public.tb_estado
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

/*
Funcion: f_get_tb_estado
Objetivo:
  Consultar estados con filtros opcionales.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_estado(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'nombre', t.nombre,
    'id_usuario', t.id_usuario,
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_estado t
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.id;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_estado_his(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT to_jsonb(t)
  FROM public.tb_estado_his t
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.fecha_registro, t.id;
$$;

/*
Funcion: f_post_tb_estado
Objetivo:
  Crear un nuevo estado.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_estado(
  p_nombre character varying,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.tb_estado (nombre, id_usuario)
  VALUES (p_nombre, p_id_usuario)
  RETURNING id INTO v_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_estado(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_estado
Objetivo:
  Actualizar un estado existente.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_estado(
  p_id bigint,
  p_nombre character varying DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_estado
  SET nombre = COALESCE(p_nombre, nombre),
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_estado(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- 2. TB_ROL
-- ============================================================================

/*
Tabla: tb_rol
Objetivo:
  Catalogo de roles funcionales del sistema.
*/
CREATE TABLE IF NOT EXISTS public.tb_rol (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_rol_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tb_rol_his AS
TABLE public.tb_rol
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_rol_his ON public.tb_rol;
CREATE TRIGGER trg_tb_rol_his
AFTER INSERT OR UPDATE ON public.tb_rol
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

/*
Funcion: f_get_tb_rol
Objetivo:
  Consultar roles con estado enriquecido.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_rol(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'nombre', t.nombre,
    'id_estado', t.id_estado,
    'estado_nombre', e.nombre,
    'id_usuario', t.id_usuario,
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_rol t
  LEFT JOIN public.tb_estado e ON t.id_estado = e.id
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.id;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_rol_his(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT to_jsonb(t)
  FROM public.tb_rol_his t
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.fecha_registro, t.id;
$$;

/*
Funcion: f_post_tb_rol
Objetivo:
  Crear un rol nuevo.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_rol(
  p_nombre character varying,
  p_id_estado bigint,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.tb_rol (nombre, id_estado, id_usuario)
  VALUES (p_nombre, p_id_estado, p_id_usuario)
  RETURNING id INTO v_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_rol(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_rol
Objetivo:
  Actualizar un rol existente.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_rol(
  p_id bigint,
  p_nombre character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_rol
  SET nombre = COALESCE(p_nombre, nombre),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_rol(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- 3. TB_SUCURSAL
-- ============================================================================

/*
Tabla: tb_sucursal
Objetivo:
  Registrar sucursales o puntos operativos del sistema.
*/
CREATE TABLE IF NOT EXISTS public.tb_sucursal (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  direccion character varying,
  celular character varying,
  email character varying,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_sucursal_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tb_sucursal_his AS
TABLE public.tb_sucursal
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_sucursal_his ON public.tb_sucursal;
CREATE TRIGGER trg_tb_sucursal_his
AFTER INSERT OR UPDATE ON public.tb_sucursal
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

/*
Funcion: f_get_tb_sucursal
Objetivo:
  Consultar sucursales con filtros y estado enriquecido.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_sucursal(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_direccion character varying DEFAULT NULL,
  p_celular character varying DEFAULT NULL,
  p_email character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'nombre', t.nombre,
    'direccion', t.direccion,
    'celular', t.celular,
    'email', t.email,
    'id_estado', t.id_estado,
    'estado_nombre', e.nombre,
    'id_usuario', t.id_usuario,
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_sucursal t
  LEFT JOIN public.tb_estado e ON t.id_estado = e.id
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_direccion IS NULL OR COALESCE(t.direccion, '') ILIKE '%' || p_direccion || '%')
    AND (p_celular IS NULL OR COALESCE(t.celular, '') ILIKE '%' || p_celular || '%')
    AND (p_email IS NULL OR COALESCE(t.email, '') ILIKE '%' || p_email || '%')
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.id;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_sucursal_his(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_direccion character varying DEFAULT NULL,
  p_celular character varying DEFAULT NULL,
  p_email character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT to_jsonb(t)
  FROM public.tb_sucursal_his t
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_direccion IS NULL OR COALESCE(t.direccion, '') ILIKE '%' || p_direccion || '%')
    AND (p_celular IS NULL OR COALESCE(t.celular, '') ILIKE '%' || p_celular || '%')
    AND (p_email IS NULL OR COALESCE(t.email, '') ILIKE '%' || p_email || '%')
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.fecha_registro, t.id;
$$;

/*
Funcion: f_post_tb_sucursal
Objetivo:
  Crear una sucursal nueva.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_sucursal(
  p_nombre character varying,
  p_direccion character varying DEFAULT NULL,
  p_celular character varying DEFAULT NULL,
  p_email character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.tb_sucursal (nombre, direccion, celular, email, id_estado, id_usuario)
  VALUES (p_nombre, p_direccion, p_celular, p_email, p_id_estado, p_id_usuario)
  RETURNING id INTO v_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_sucursal(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_sucursal
Objetivo:
  Actualizar una sucursal existente.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_sucursal(
  p_id bigint,
  p_nombre character varying DEFAULT NULL,
  p_direccion character varying DEFAULT NULL,
  p_celular character varying DEFAULT NULL,
  p_email character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_sucursal
  SET nombre = COALESCE(p_nombre, nombre),
      direccion = COALESCE(p_direccion, direccion),
      celular = COALESCE(p_celular, celular),
      email = COALESCE(p_email, email),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_sucursal(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- 4. TB_COMUNIDAD
-- ============================================================================

/*
Tabla: tb_comunidad
Objetivo:
  Catalogo de comunidades comerciales y operativas.
*/
CREATE TABLE IF NOT EXISTS public.tb_comunidad (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_comunidad_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tb_comunidad_his AS
TABLE public.tb_comunidad
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_comunidad_his ON public.tb_comunidad;
CREATE TRIGGER trg_tb_comunidad_his
AFTER INSERT OR UPDATE ON public.tb_comunidad
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

/*
Funcion: f_get_tb_comunidad
Objetivo:
  Consultar comunidades con filtros opcionales.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_comunidad(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'nombre', t.nombre,
    'id_estado', t.id_estado,
    'estado_nombre', e.nombre,
    'id_usuario', t.id_usuario,
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_comunidad t
  LEFT JOIN public.tb_estado e ON t.id_estado = e.id
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.id;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_comunidad_his(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT to_jsonb(t)
  FROM public.tb_comunidad_his t
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.fecha_registro, t.id;
$$;

/*
Funcion: f_post_tb_comunidad
Objetivo:
  Crear una comunidad nueva.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_comunidad(
  p_nombre character varying,
  p_id_estado bigint,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.tb_comunidad (nombre, id_estado, id_usuario)
  VALUES (p_nombre, p_id_estado, p_id_usuario)
  RETURNING id INTO v_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_comunidad(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_comunidad
Objetivo:
  Actualizar una comunidad existente.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_comunidad(
  p_id bigint,
  p_nombre character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_comunidad
  SET nombre = COALESCE(p_nombre, nombre),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_comunidad(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- 5. TB_USUARIO
-- ============================================================================

/*
Tabla: tb_usuario
Objetivo:
  Registrar usuarios del sistema y su nivel de acceso.

Detalle:
  `flag_super_admin` centraliza el bypass administrativo desde backend.
*/
CREATE TABLE IF NOT EXISTS public.tb_usuario (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  username character varying NOT NULL UNIQUE,
  password character varying NOT NULL,
  email character varying NOT NULL UNIQUE,
  nombre character varying NOT NULL,
  flag_super_admin boolean NOT NULL DEFAULT false,
  id_rol bigint NOT NULL,
  id_estado bigint NOT NULL,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_usuario_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tb_usuario_his AS
TABLE public.tb_usuario
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_usuario_his ON public.tb_usuario;
CREATE TRIGGER trg_tb_usuario_his
AFTER INSERT OR UPDATE ON public.tb_usuario
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

/*
Funcion: f_get_tb_usuario
Objetivo:
  Obtener usuarios del sistema compacto con sus FK enriquecidas.

Enfoque de autorizacion:
  El campo `flag_super_admin` reemplaza cualquier hardcodeo en frontend como
  "si id = 1 entonces ve todo".

Contrato:
  - request: filtros opcionales por campos propios del usuario
  - response: pk + campos propios + nombres de FK
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_usuario(
  p_id bigint DEFAULT NULL,
  p_username character varying DEFAULT NULL,
  p_password character varying DEFAULT NULL,
  p_email character varying DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_flag_super_admin boolean DEFAULT NULL,
  p_id_rol bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'username', t.username,
    'password', t.password,
    'email', t.email,
    'nombre', t.nombre,
    'flag_super_admin', t.flag_super_admin,
    'id_rol', t.id_rol,
    'rol_nombre', r.nombre,
    'id_estado', t.id_estado,
    'estado_nombre', e.nombre,
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_usuario t
  LEFT JOIN public.tb_rol r ON t.id_rol = r.id
  LEFT JOIN public.tb_estado e ON t.id_estado = e.id
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_username IS NULL OR t.username ILIKE '%' || p_username || '%')
    AND (p_password IS NULL OR t.password = p_password)
    AND (p_email IS NULL OR t.email ILIKE '%' || p_email || '%')
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_flag_super_admin IS NULL OR t.flag_super_admin = p_flag_super_admin)
    AND (p_id_rol IS NULL OR t.id_rol = p_id_rol)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.id;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_usuario_his(
  p_id bigint DEFAULT NULL,
  p_username character varying DEFAULT NULL,
  p_password character varying DEFAULT NULL,
  p_email character varying DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_flag_super_admin boolean DEFAULT NULL,
  p_id_rol bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT to_jsonb(t)
  FROM public.tb_usuario_his t
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_username IS NULL OR t.username ILIKE '%' || p_username || '%')
    AND (p_password IS NULL OR t.password = p_password)
    AND (p_email IS NULL OR t.email ILIKE '%' || p_email || '%')
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_flag_super_admin IS NULL OR t.flag_super_admin = p_flag_super_admin)
    AND (p_id_rol IS NULL OR t.id_rol = p_id_rol)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.fecha_registro, t.id;
$$;

/*
Funcion: f_post_tb_usuario
Objetivo:
  Crear un usuario nuevo incluyendo su condicion administrativa.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_usuario(
  p_username character varying,
  p_password character varying,
  p_email character varying,
  p_nombre character varying,
  p_id_rol bigint,
  p_id_estado bigint,
  p_flag_super_admin boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.tb_usuario (username, password, email, nombre, flag_super_admin, id_rol, id_estado)
  VALUES (p_username, p_password, p_email, p_nombre, COALESCE(p_flag_super_admin, false), p_id_rol, p_id_estado)
  RETURNING id INTO v_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_usuario(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_usuario
Objetivo:
  Actualizar un usuario existente, incluido el flag de super admin.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_usuario(
  p_id bigint,
  p_username character varying DEFAULT NULL,
  p_password character varying DEFAULT NULL,
  p_email character varying DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_flag_super_admin boolean DEFAULT NULL,
  p_id_rol bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_usuario
  SET username = COALESCE(p_username, username),
      password = COALESCE(p_password, password),
      email = COALESCE(p_email, email),
      nombre = COALESCE(p_nombre, nombre),
      flag_super_admin = COALESCE(p_flag_super_admin, flag_super_admin),
      id_rol = COALESCE(p_id_rol, id_rol),
      id_estado = COALESCE(p_id_estado, id_estado)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_usuario(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- 5.1 TB_PERMISO_MENU
-- ============================================================================

/*
Tabla: tb_permiso_menu
Objetivo:
  Catalogo unico de recursos navegables/autorizables del sistema.

Concepto:
  Esta tabla ya no debe entenderse solo como "menu visual".
  Debe representar recursos autorizables por backend:
  - grupos contenedores (ruta NULL)
  - pantallas hoja (ruta con valor)

Regla:
  - si `ruta` es NULL, el registro funciona como grupo visual/logico
  - si `ruta` tiene valor, el registro representa una pantalla accesible
*/
CREATE TABLE IF NOT EXISTS public.tb_permiso_menu (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  id_padre bigint,
  ruta character varying,
  icono character varying,
  orden integer NOT NULL DEFAULT 0,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_permiso_menu_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tb_permiso_menu_his AS
TABLE public.tb_permiso_menu
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_permiso_menu_his ON public.tb_permiso_menu;
CREATE TRIGGER trg_tb_permiso_menu_his
AFTER INSERT OR UPDATE ON public.tb_permiso_menu
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

/*
Funcion: f_get_tb_permiso_menu
Objetivo:
  Obtener el catalogo de recursos autorizables del sistema.

Uso esperado:
  - pantallas administrativas de permisos
  - validaciones de integridad
  - futuros seeds o sincronizaciones de navegacion
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_permiso_menu(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_id_padre bigint DEFAULT NULL,
  p_ruta character varying DEFAULT NULL,
  p_icono character varying DEFAULT NULL,
  p_orden integer DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'nombre', t.nombre,
    'id_padre', t.id_padre,
    'padre_nombre', p.nombre,
    'ruta', t.ruta,
    'icono', t.icono,
    'orden', t.orden,
    'id_estado', t.id_estado,
    'estado_nombre', e.nombre,
    'id_usuario', t.id_usuario,
    'usuario_nombre', u.nombre,
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_permiso_menu t
  LEFT JOIN public.tb_permiso_menu p ON t.id_padre = p.id
  LEFT JOIN public.tb_estado e ON t.id_estado = e.id
  LEFT JOIN public.tb_usuario u ON t.id_usuario = u.id
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_id_padre IS NULL OR t.id_padre = p_id_padre)
    AND (p_ruta IS NULL OR COALESCE(t.ruta, '') ILIKE '%' || p_ruta || '%')
    AND (p_icono IS NULL OR COALESCE(t.icono, '') ILIKE '%' || p_icono || '%')
    AND (p_orden IS NULL OR t.orden = p_orden)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.orden, t.id;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_permiso_menu_his(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_id_padre bigint DEFAULT NULL,
  p_ruta character varying DEFAULT NULL,
  p_icono character varying DEFAULT NULL,
  p_orden integer DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT to_jsonb(t)
  FROM public.tb_permiso_menu_his t
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_id_padre IS NULL OR t.id_padre = p_id_padre)
    AND (p_ruta IS NULL OR COALESCE(t.ruta, '') ILIKE '%' || p_ruta || '%')
    AND (p_icono IS NULL OR COALESCE(t.icono, '') ILIKE '%' || p_icono || '%')
    AND (p_orden IS NULL OR t.orden = p_orden)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.fecha_registro, t.id;
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_permiso_menu(
  p_nombre character varying,
  p_id_padre bigint DEFAULT NULL,
  p_ruta character varying DEFAULT NULL,
  p_icono character varying DEFAULT NULL,
  p_orden integer DEFAULT 0,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.tb_permiso_menu (
    nombre, id_padre, ruta, icono, orden, id_estado, id_usuario
  )
  VALUES (
    p_nombre, p_id_padre, p_ruta, p_icono, COALESCE(p_orden, 0), p_id_estado, p_id_usuario
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_permiso_menu(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_permiso_menu(
  p_id bigint,
  p_nombre character varying DEFAULT NULL,
  p_id_padre bigint DEFAULT NULL,
  p_ruta character varying DEFAULT NULL,
  p_icono character varying DEFAULT NULL,
  p_orden integer DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_permiso_menu
  SET nombre = COALESCE(p_nombre, nombre),
      id_padre = COALESCE(p_id_padre, id_padre),
      ruta = COALESCE(p_ruta, ruta),
      icono = COALESCE(p_icono, icono),
      orden = COALESCE(p_orden, orden),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_permiso_menu(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- 5.2 TB_PERMISO_USUARIO
-- ============================================================================

/*
Tabla: tb_permiso_usuario
Objetivo:
  Relacion simple usuario -> permiso_menu.

Razon de mantenerla:
  Es suficiente para un sistema compacto si:
  - el catalogo de recursos vive en tb_permiso_menu
  - la navegacion autorizada se resuelve por backend
*/
CREATE TABLE IF NOT EXISTS public.tb_permiso_usuario (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_usuario bigint NOT NULL,
  id_permiso_menu bigint NOT NULL,
  id_estado bigint NOT NULL,
  id_usuario_registra bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_permiso_usuario_pkey PRIMARY KEY (id),
  CONSTRAINT tb_permiso_usuario_unique UNIQUE (id_usuario, id_permiso_menu)
);

CREATE TABLE IF NOT EXISTS public.tb_permiso_usuario_his AS
TABLE public.tb_permiso_usuario
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_permiso_usuario_his ON public.tb_permiso_usuario;
CREATE TRIGGER trg_tb_permiso_usuario_his
AFTER INSERT OR UPDATE ON public.tb_permiso_usuario
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

/*
Funcion: f_get_tb_permiso_usuario
Objetivo:
  Obtener asignaciones explicitamente registradas entre usuarios y recursos.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_permiso_usuario(
  p_id bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_id_permiso_menu bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario_registra bigint DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'id_usuario', t.id_usuario,
    'usuario_nombre', u.nombre,
    'id_permiso_menu', t.id_permiso_menu,
    'menu_nombre', pm.nombre,
    'menu_ruta', pm.ruta,
    'id_estado', t.id_estado,
    'estado_nombre', e.nombre,
    'id_usuario_registra', t.id_usuario_registra,
    'usuario_registra_nombre', ur.nombre,
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_permiso_usuario t
  LEFT JOIN public.tb_usuario u ON t.id_usuario = u.id
  LEFT JOIN public.tb_permiso_menu pm ON t.id_permiso_menu = pm.id
  LEFT JOIN public.tb_estado e ON t.id_estado = e.id
  LEFT JOIN public.tb_usuario ur ON t.id_usuario_registra = ur.id
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_id_permiso_menu IS NULL OR t.id_permiso_menu = p_id_permiso_menu)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario_registra IS NULL OR t.id_usuario_registra = p_id_usuario_registra)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.id_usuario, t.id_permiso_menu, t.id;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_permiso_usuario_his(
  p_id bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_id_permiso_menu bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario_registra bigint DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT to_jsonb(t)
  FROM public.tb_permiso_usuario_his t
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_id_permiso_menu IS NULL OR t.id_permiso_menu = p_id_permiso_menu)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario_registra IS NULL OR t.id_usuario_registra = p_id_usuario_registra)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.fecha_registro, t.id;
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_permiso_usuario(
  p_id_usuario bigint,
  p_id_permiso_menu bigint,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario_registra bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.tb_permiso_usuario (
    id_usuario, id_permiso_menu, id_estado, id_usuario_registra
  )
  VALUES (
    p_id_usuario,
    p_id_permiso_menu,
    COALESCE(p_id_estado, (SELECT id FROM public.tb_estado WHERE nombre ILIKE 'activo' LIMIT 1)),
    p_id_usuario_registra
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_permiso_usuario(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_permiso_usuario(
  p_id bigint,
  p_id_usuario bigint DEFAULT NULL,
  p_id_permiso_menu bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario_registra bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_permiso_usuario
  SET id_usuario = COALESCE(p_id_usuario, id_usuario),
      id_permiso_menu = COALESCE(p_id_permiso_menu, id_permiso_menu),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario_registra = COALESCE(p_id_usuario_registra, id_usuario_registra)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_permiso_usuario(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_put_tb_permiso_usuario_lote
Objetivo:
  Reemplazar de una sola vez el set de permisos hoja de un usuario.

Por que mantener esta funcion aunque exista POST/PATCH:
  Porque la pantalla administrativa normalmente no inserta de uno en uno.
  Opera como "sincronizacion completa" del set de permisos del usuario.
*/
CREATE OR REPLACE FUNCTION public.f_put_tb_permiso_usuario_lote(
  p_id_usuario bigint,
  p_ids_permiso_menu bigint[],
  p_id_usuario_registra bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  DELETE FROM public.tb_permiso_usuario
  WHERE id_usuario = p_id_usuario;

  IF p_ids_permiso_menu IS NOT NULL AND array_length(p_ids_permiso_menu, 1) > 0 THEN
    INSERT INTO public.tb_permiso_usuario (id_usuario, id_permiso_menu, id_usuario_registra)
    SELECT p_id_usuario, unnest(p_ids_permiso_menu), p_id_usuario_registra;

    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'id_usuario', p_id_usuario,
    'permisos_asignados', v_count
  );
END;
$$;

/*
Funcion: f_get_tb_navegacion_x_usuario
Objetivo:
  Entregar al frontend el contrato completo de navegacion/autorizacion.

Contrato esperado por frontend:
  - usuario: contexto minimo del usuario autenticado
  - menus: arbol de menu ya filtrado segun permisos
  - rutas_permitidas: lista plana para proteccion de router
  - nombres_permitidos: lista plana para validaciones visuales o acciones

Politica:
  - si flag_super_admin = true, el usuario recibe todo el catalogo ACTIVO
  - si no es super admin, recibe solo los permisos explicitamente asignados
  - los grupos padre se construyen automaticamente desde los hijos autorizados

Con esto el frontend deja de hardcodear:
  - sidebar
  - fallback permisivo
  - admin por id fijo
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_navegacion_x_usuario(
  p_id_usuario bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_es_super_admin boolean := false;
  v_usuario jsonb := '{}'::jsonb;
  v_nombres text[];
  v_rutas text[];
  v_menus jsonb := '[]'::jsonb;
BEGIN
  SELECT jsonb_build_object(
           'id', u.id,
           'nombre', u.nombre,
           'email', u.email,
           'flag_super_admin', u.flag_super_admin
         ),
         COALESCE(u.flag_super_admin, false)
  INTO v_usuario, v_es_super_admin
  FROM public.tb_usuario u
  WHERE u.id = p_id_usuario;

  IF v_usuario = '{}'::jsonb THEN
    RETURN jsonb_build_object(
      'usuario', NULL,
      'menus', '[]'::jsonb,
      'rutas_permitidas', '[]'::jsonb,
      'nombres_permitidos', '[]'::jsonb
    );
  END IF;

  IF v_es_super_admin THEN
    SELECT array_remove(array_agg(pm.nombre ORDER BY pm.orden, pm.id), NULL),
           array_remove(array_agg(pm.ruta ORDER BY pm.orden, pm.id), NULL)
    INTO v_nombres, v_rutas
    FROM public.tb_permiso_menu pm
    WHERE pm.id_estado = (SELECT e.id FROM public.tb_estado e WHERE UPPER(e.nombre) = 'ACTIVO');
  ELSE
    SELECT array_remove(array_agg(pm.nombre ORDER BY pm.orden, pm.id), NULL),
           array_remove(array_agg(pm.ruta ORDER BY pm.orden, pm.id), NULL)
    INTO v_nombres, v_rutas
    FROM public.tb_permiso_usuario pu
    JOIN public.tb_permiso_menu pm ON pu.id_permiso_menu = pm.id
    WHERE pu.id_usuario = p_id_usuario
      AND pm.id_estado = (SELECT e.id FROM public.tb_estado e WHERE UPPER(e.nombre) = 'ACTIVO');
  END IF;

  WITH permitted AS (
    SELECT DISTINCT pm.*
    FROM public.tb_permiso_menu pm
    WHERE pm.id_estado = (SELECT e.id FROM public.tb_estado e WHERE UPPER(e.nombre) = 'ACTIVO')
      AND (
        v_es_super_admin
        OR pm.nombre = ANY(COALESCE(v_nombres, ARRAY[]::text[]))
        OR pm.id IN (
          SELECT child.id_padre
          FROM public.tb_permiso_menu child
          WHERE child.nombre = ANY(COALESCE(v_nombres, ARRAY[]::text[]))
            AND child.id_padre IS NOT NULL
        )
      )
  ),
  roots AS (
    SELECT p.*
    FROM permitted p
    WHERE p.id_padre IS NULL
    ORDER BY p.orden, p.id
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'nombre', r.nombre,
        'ruta', r.ruta,
        'icono', r.icono,
        'orden', r.orden,
        'children', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', c.id,
              'nombre', c.nombre,
              'ruta', c.ruta,
              'icono', c.icono,
              'orden', c.orden
            )
            ORDER BY c.orden, c.id
          )
          FROM permitted c
          WHERE c.id_padre = r.id
        ), '[]'::jsonb)
      )
      ORDER BY r.orden, r.id
    ),
    '[]'::jsonb
  )
  INTO v_menus
  FROM roots r;

  RETURN jsonb_build_object(
    'usuario', v_usuario,
    'menus', COALESCE(v_menus, '[]'::jsonb),
    'rutas_permitidas', to_jsonb(COALESCE(v_rutas, ARRAY[]::text[])),
    'nombres_permitidos', to_jsonb(COALESCE(v_nombres, ARRAY[]::text[]))
  );
END;
$$;

