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
--       tb_cliente.celular                -> bigint
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
  password character varying,
  email character varying NOT NULL UNIQUE,
  nombre character varying NOT NULL,
  auth_user_id uuid,
  flag_super_admin boolean NOT NULL DEFAULT false,
  id_rol bigint NOT NULL,
  id_estado bigint NOT NULL,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_usuario_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tb_usuario_his AS
TABLE public.tb_usuario
WITH NO DATA;

ALTER TABLE public.tb_usuario
  ADD COLUMN IF NOT EXISTS id_sucursal bigint;

ALTER TABLE public.tb_usuario
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

ALTER TABLE public.tb_usuario
  ALTER COLUMN password DROP NOT NULL;

ALTER TABLE public.tb_usuario_his
  ADD COLUMN IF NOT EXISTS id_sucursal bigint;

ALTER TABLE public.tb_usuario_his
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS tb_usuario_auth_user_id_uidx
  ON public.tb_usuario (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Vinculacion inicial para usuarios que ya existen en ambas fuentes.
UPDATE public.tb_usuario u
SET auth_user_id = a.id
FROM auth.users a
WHERE u.auth_user_id IS NULL
  AND LOWER(u.email) = LOWER(a.email)
  AND 1 = (
    SELECT COUNT(*)
    FROM public.tb_usuario candidate
    WHERE LOWER(candidate.email) = LOWER(a.email)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tb_usuario_fk_sucursal'
      AND conrelid = 'public.tb_usuario'::regclass
  ) THEN
    ALTER TABLE public.tb_usuario
      ADD CONSTRAINT tb_usuario_fk_sucursal
      FOREIGN KEY (id_sucursal) REFERENCES public.tb_sucursal(id);
  END IF;
END;
$$;

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
DROP FUNCTION IF EXISTS public.f_get_tb_usuario(
  bigint, character varying, character varying, character varying,
  character varying, boolean, bigint, bigint,
  timestamp with time zone, timestamp with time zone
);
DROP FUNCTION IF EXISTS public.f_get_tb_usuario(
  bigint, character varying, character varying, character varying,
  character varying, boolean, bigint, bigint,
  timestamp with time zone, timestamp with time zone, bigint
);

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
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL,
  p_id_sucursal bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'username', t.username,
    'email', t.email,
    'nombre', t.nombre,
    'auth_user_id', t.auth_user_id,
    'flag_super_admin', t.flag_super_admin,
    'id_rol', t.id_rol,
    'rol_nombre', r.nombre,
    'id_sucursal', t.id_sucursal,
    'nombre_sucursal', s.nombre,
    'id_estado', t.id_estado,
    'estado_nombre', e.nombre,
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_usuario t
  LEFT JOIN public.tb_rol r ON t.id_rol = r.id
  LEFT JOIN public.tb_estado e ON t.id_estado = e.id
  LEFT JOIN public.tb_sucursal s ON t.id_sucursal = s.id
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
    AND (p_id_sucursal IS NULL OR t.id_sucursal = p_id_sucursal)
  ORDER BY t.id;
$$;

DROP FUNCTION IF EXISTS public.f_get_tb_usuario_his(
  bigint, character varying, character varying, character varying,
  character varying, boolean, bigint, bigint,
  timestamp with time zone, timestamp with time zone
);
DROP FUNCTION IF EXISTS public.f_get_tb_usuario_his(
  bigint, character varying, character varying, character varying,
  character varying, boolean, bigint, bigint,
  timestamp with time zone, timestamp with time zone, bigint
);

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
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL,
  p_id_sucursal bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT to_jsonb(t) - 'password'
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
    AND (p_id_sucursal IS NULL OR t.id_sucursal = p_id_sucursal)
  ORDER BY t.fecha_registro, t.id;
$$;

/*
Funcion: f_post_tb_usuario_auth
Objetivo:
  Registrar el perfil operativo de una identidad previamente invitada en
  Supabase Auth. Solo la Edge Function (service_role) puede ejecutarla.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_usuario_auth(
  p_auth_user_id_creador uuid,
  p_email_creador character varying,
  p_auth_user_id uuid,
  p_username character varying,
  p_email character varying,
  p_nombre character varying,
  p_id_rol bigint,
  p_id_estado bigint,
  p_id_sucursal bigint,
  p_flag_super_admin boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creador public.tb_usuario%ROWTYPE;
  v_es_administrador boolean;
  v_es_jefe_tienda boolean;
  v_id bigint;
BEGIN
  SELECT u.* INTO v_creador
  FROM public.tb_usuario u
  JOIN public.tb_estado eu ON eu.id = u.id_estado
  WHERE UPPER(eu.nombre) = 'ACTIVO'
    AND (
      u.auth_user_id = p_auth_user_id_creador
      OR (u.auth_user_id IS NULL AND LOWER(u.email) = LOWER(TRIM(p_email_creador)))
    )
  ORDER BY (u.auth_user_id = p_auth_user_id_creador) DESC
  LIMIT 1;

  IF v_creador.id IS NULL THEN
    RAISE EXCEPTION 'El usuario autenticado no tiene un perfil operativo activo';
  END IF;

  v_es_administrador := COALESCE(v_creador.flag_super_admin, false) OR v_creador.id_rol = 1;
  v_es_jefe_tienda := v_creador.id_rol = 3 AND NOT v_es_administrador;

  IF NOT v_es_administrador AND NOT EXISTS (
    SELECT 1
    FROM public.tb_permiso_usuario pu
    JOIN public.tb_permiso_menu pm ON pm.id = pu.id_permiso_menu
    JOIN public.tb_estado ep ON ep.id = pu.id_estado
    JOIN public.tb_estado em ON em.id = pm.id_estado
    WHERE pu.id_usuario = v_creador.id
      AND pm.ruta = '/sistema/usuario'
      AND UPPER(ep.nombre) = 'ACTIVO'
      AND UPPER(em.nombre) = 'ACTIVO'
  ) THEN
    RAISE EXCEPTION 'No tiene permiso para gestionar usuarios';
  END IF;

  IF NOT v_es_administrador
     AND (p_id_rol NOT IN (2, 3, 4) OR COALESCE(p_flag_super_admin, false)) THEN
    RAISE EXCEPTION 'Solo puede crear usuarios de Area de Pagos, Jefe de Tienda o Atencion al Cliente';
  END IF;

  IF v_es_jefe_tienda
     AND (p_id_rol <> 4 OR p_id_sucursal IS DISTINCT FROM v_creador.id_sucursal) THEN
    RAISE EXCEPTION 'El Jefe de Tienda solo puede crear usuarios de Atencion al Cliente de su propia sucursal';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_rol r
    JOIN public.tb_estado e ON e.id = r.id_estado
    WHERE r.id = p_id_rol AND UPPER(e.nombre) = 'ACTIVO'
  ) THEN
    RAISE EXCEPTION 'El rol seleccionado no existe o esta inactivo';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tb_estado e WHERE e.id = p_id_estado) THEN
    RAISE EXCEPTION 'El estado seleccionado no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_sucursal s
    JOIN public.tb_estado e ON e.id = s.id_estado
    WHERE s.id = p_id_sucursal AND UPPER(e.nombre) = 'ACTIVO'
  ) THEN
    RAISE EXCEPTION 'La sucursal seleccionada no existe o esta inactiva';
  END IF;

  IF NULLIF(TRIM(p_username), '') IS NULL
     OR NULLIF(TRIM(p_email), '') IS NULL
     OR NULLIF(TRIM(p_nombre), '') IS NULL THEN
    RAISE EXCEPTION 'Username, email y nombre son obligatorios';
  END IF;

  UPDATE public.tb_usuario SET auth_user_id = p_auth_user_id_creador
  WHERE id = v_creador.id AND auth_user_id IS NULL;

  INSERT INTO public.tb_usuario (
    auth_user_id, username, password, email, nombre, flag_super_admin,
    id_rol, id_estado, id_sucursal
  ) VALUES (
    p_auth_user_id, TRIM(p_username), NULL, LOWER(TRIM(p_email)), TRIM(p_nombre),
    CASE WHEN v_es_administrador THEN COALESCE(p_flag_super_admin, false) ELSE false END,
    p_id_rol, p_id_estado, p_id_sucursal
  ) RETURNING id INTO v_id;

  RETURN (SELECT x FROM public.f_get_tb_usuario(p_id := v_id) AS x LIMIT 1);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'El email, username o usuario de Auth ya se encuentra registrado';
END;
$$;

/*
Funcion: f_patch_tb_usuario_auth
Objetivo:
  Actualizar un perfil desde la Edge Function y revalidar permisos, rol y sede.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_usuario_auth(
  p_auth_user_id_creador uuid,
  p_email_creador character varying,
  p_id bigint,
  p_username character varying DEFAULT NULL,
  p_email character varying DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_flag_super_admin boolean DEFAULT NULL,
  p_id_rol bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_sucursal bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creador public.tb_usuario%ROWTYPE;
  v_objetivo public.tb_usuario%ROWTYPE;
  v_es_administrador boolean;
  v_es_jefe_tienda boolean;
  v_rol_final bigint;
  v_super_final boolean;
  v_sucursal_final bigint;
BEGIN
  SELECT u.* INTO v_creador
  FROM public.tb_usuario u
  JOIN public.tb_estado eu ON eu.id = u.id_estado
  WHERE UPPER(eu.nombre) = 'ACTIVO'
    AND (
      u.auth_user_id = p_auth_user_id_creador
      OR (u.auth_user_id IS NULL AND LOWER(u.email) = LOWER(TRIM(p_email_creador)))
    )
  ORDER BY (u.auth_user_id = p_auth_user_id_creador) DESC
  LIMIT 1;

  IF v_creador.id IS NULL THEN
    RAISE EXCEPTION 'El usuario autenticado no tiene un perfil operativo activo';
  END IF;

  v_es_administrador := COALESCE(v_creador.flag_super_admin, false) OR v_creador.id_rol = 1;
  v_es_jefe_tienda := v_creador.id_rol = 3 AND NOT v_es_administrador;

  IF NOT v_es_administrador AND NOT EXISTS (
    SELECT 1
    FROM public.tb_permiso_usuario pu
    JOIN public.tb_permiso_menu pm ON pm.id = pu.id_permiso_menu
    JOIN public.tb_estado ep ON ep.id = pu.id_estado
    JOIN public.tb_estado em ON em.id = pm.id_estado
    WHERE pu.id_usuario = v_creador.id
      AND pm.ruta = '/sistema/usuario'
      AND UPPER(ep.nombre) = 'ACTIVO'
      AND UPPER(em.nombre) = 'ACTIVO'
  ) THEN
    RAISE EXCEPTION 'No tiene permiso para gestionar usuarios';
  END IF;

  SELECT * INTO v_objetivo FROM public.tb_usuario WHERE id = p_id;
  IF v_objetivo.id IS NULL THEN
    RAISE EXCEPTION 'El usuario a actualizar no existe';
  END IF;

  v_rol_final := COALESCE(p_id_rol, v_objetivo.id_rol);
  v_super_final := COALESCE(p_flag_super_admin, v_objetivo.flag_super_admin);
  v_sucursal_final := COALESCE(p_id_sucursal, v_objetivo.id_sucursal);

  IF NOT v_es_administrador
     AND (v_objetivo.id_rol NOT IN (2, 3, 4)
          OR COALESCE(v_objetivo.flag_super_admin, false)
          OR v_rol_final NOT IN (2, 3, 4)
          OR v_super_final) THEN
    RAISE EXCEPTION 'No puede administrar usuarios con privilegios elevados';
  END IF;

  IF v_es_jefe_tienda
     AND (
       v_objetivo.id_rol <> 4
       OR v_objetivo.id_sucursal IS DISTINCT FROM v_creador.id_sucursal
       OR v_rol_final <> 4
       OR v_sucursal_final IS DISTINCT FROM v_creador.id_sucursal
     ) THEN
    RAISE EXCEPTION 'El Jefe de Tienda solo puede administrar usuarios de Atencion al Cliente de su propia sucursal';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_rol r
    JOIN public.tb_estado e ON e.id = r.id_estado
    WHERE r.id = v_rol_final AND UPPER(e.nombre) = 'ACTIVO'
  ) THEN
    RAISE EXCEPTION 'El rol seleccionado no existe o esta inactivo';
  END IF;

  IF p_id_estado IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tb_estado e WHERE e.id = p_id_estado) THEN
    RAISE EXCEPTION 'El estado seleccionado no existe';
  END IF;

  IF v_sucursal_final IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tb_sucursal s
    JOIN public.tb_estado e ON e.id = s.id_estado
    WHERE s.id = v_sucursal_final AND UPPER(e.nombre) = 'ACTIVO'
  ) THEN
    RAISE EXCEPTION 'La sucursal seleccionada no existe o esta inactiva';
  END IF;

  UPDATE public.tb_usuario
  SET username = COALESCE(NULLIF(TRIM(p_username), ''), username),
      email = COALESCE(NULLIF(LOWER(TRIM(p_email)), ''), email),
      nombre = COALESCE(NULLIF(TRIM(p_nombre), ''), nombre),
      flag_super_admin = CASE
        WHEN v_es_administrador THEN COALESCE(p_flag_super_admin, flag_super_admin)
        ELSE false
      END,
      id_rol = v_rol_final,
      id_estado = COALESCE(p_id_estado, id_estado),
      id_sucursal = v_sucursal_final
  WHERE id = p_id;

  UPDATE public.tb_usuario SET auth_user_id = p_auth_user_id_creador
  WHERE id = v_creador.id AND auth_user_id IS NULL;

  RETURN (SELECT x FROM public.f_get_tb_usuario(p_id := p_id) AS x LIMIT 1);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'El email o username ya se encuentra registrado';
END;
$$;

REVOKE ALL ON FUNCTION public.f_post_tb_usuario_auth(
  uuid, character varying, uuid, character varying, character varying,
  character varying, bigint, bigint, bigint, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_post_tb_usuario_auth(
  uuid, character varying, uuid, character varying, character varying,
  character varying, bigint, bigint, bigint, boolean
) TO service_role;

REVOKE ALL ON FUNCTION public.f_patch_tb_usuario_auth(
  uuid, character varying, bigint, character varying, character varying,
  character varying, boolean, bigint, bigint, bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_usuario_auth(
  uuid, character varying, bigint, character varying, character varying,
  character varying, boolean, bigint, bigint, bigint
) TO service_role;

/*
Funcion: f_post_tb_usuario
Objetivo:
  Crear un usuario nuevo incluyendo su condicion administrativa.
*/
DROP FUNCTION IF EXISTS public.f_post_tb_usuario(
  character varying, character varying, character varying, character varying,
  bigint, bigint, boolean
);
DROP FUNCTION IF EXISTS public.f_post_tb_usuario(
  character varying, character varying, character varying, character varying,
  bigint, bigint, boolean, bigint
);

CREATE OR REPLACE FUNCTION public.f_post_tb_usuario(
  p_username character varying,
  p_password character varying,
  p_email character varying,
  p_nombre character varying,
  p_id_rol bigint,
  p_id_estado bigint,
  p_flag_super_admin boolean DEFAULT false,
  p_id_sucursal bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.tb_usuario (username, password, email, nombre, flag_super_admin, id_rol, id_estado, id_sucursal)
  VALUES (p_username, p_password, p_email, p_nombre, COALESCE(p_flag_super_admin, false), p_id_rol, p_id_estado, p_id_sucursal)
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
DROP FUNCTION IF EXISTS public.f_patch_tb_usuario(
  bigint, character varying, character varying, character varying,
  character varying, boolean, bigint, bigint
);
DROP FUNCTION IF EXISTS public.f_patch_tb_usuario(
  bigint, character varying, character varying, character varying,
  character varying, boolean, bigint, bigint, bigint
);

CREATE OR REPLACE FUNCTION public.f_patch_tb_usuario(
  p_id bigint,
  p_username character varying DEFAULT NULL,
  p_password character varying DEFAULT NULL,
  p_email character varying DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_flag_super_admin boolean DEFAULT NULL,
  p_id_rol bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_sucursal bigint DEFAULT NULL
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
      id_estado = COALESCE(p_id_estado, id_estado),
      id_sucursal = COALESCE(p_id_sucursal, id_sucursal)
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

REVOKE ALL ON FUNCTION public.f_post_tb_usuario(
  character varying, character varying, character varying, character varying,
  bigint, bigint, boolean, bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_post_tb_usuario(
  character varying, character varying, character varying, character varying,
  bigint, bigint, boolean, bigint
) TO service_role;

REVOKE ALL ON FUNCTION public.f_patch_tb_usuario(
  bigint, character varying, character varying, character varying,
  character varying, boolean, bigint, bigint, bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_usuario(
  bigint, character varying, character varying, character varying,
  character varying, boolean, bigint, bigint, bigint
) TO service_role;

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
SET search_path = public, auth
AS $$
DECLARE
  v_id bigint;
  v_actor public.tb_usuario%ROWTYPE;
  v_target public.tb_usuario%ROWTYPE;
  v_usuario_registra bigint := p_id_usuario_registra;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT u.* INTO v_actor
    FROM public.tb_usuario u
    JOIN public.tb_estado e ON e.id = u.id_estado
    WHERE UPPER(e.nombre) = 'ACTIVO'
      AND (
        u.auth_user_id = auth.uid()
        OR (u.auth_user_id IS NULL AND LOWER(u.email) = LOWER(auth.jwt() ->> 'email'))
      )
    ORDER BY (u.auth_user_id = auth.uid()) DESC
    LIMIT 1;

    IF v_actor.id IS NULL THEN
      RAISE EXCEPTION 'No se pudo validar el usuario autenticado';
    END IF;
    IF p_id_usuario_registra IS NOT NULL AND p_id_usuario_registra <> v_actor.id THEN
      RAISE EXCEPTION 'El usuario que registra el permiso no coincide con la sesion';
    END IF;
    v_usuario_registra := v_actor.id;

    IF v_actor.id_rol = 3 AND NOT COALESCE(v_actor.flag_super_admin, false) THEN
      SELECT * INTO v_target FROM public.tb_usuario WHERE id = p_id_usuario;
      IF v_target.id IS NULL
         OR v_target.id_rol <> 4
         OR v_target.id_sucursal IS DISTINCT FROM v_actor.id_sucursal THEN
        RAISE EXCEPTION 'El Jefe de Tienda solo puede asignar permisos a usuarios de Atencion al Cliente de su propia sucursal';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.tb_permiso_menu pm
        JOIN public.tb_estado em ON em.id = pm.id_estado
        WHERE pm.id = p_id_permiso_menu
          AND UPPER(em.nombre) = 'ACTIVO'
          AND NOT EXISTS (
            SELECT 1
            FROM public.tb_permiso_menu child
            JOIN public.tb_estado ec ON ec.id = child.id_estado
            WHERE child.id_padre = pm.id AND UPPER(ec.nombre) = 'ACTIVO'
          )
      ) THEN
        RAISE EXCEPTION 'Solo puede asignar permisos de menus activos';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.tb_permiso_usuario (
    id_usuario, id_permiso_menu, id_estado, id_usuario_registra
  )
  VALUES (
    p_id_usuario,
    p_id_permiso_menu,
    COALESCE(p_id_estado, (SELECT id FROM public.tb_estado WHERE nombre ILIKE 'activo' LIMIT 1)),
    v_usuario_registra
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
SET search_path = public, auth
AS $$
DECLARE
  v_actor public.tb_usuario%ROWTYPE;
  v_current public.tb_permiso_usuario%ROWTYPE;
  v_current_target public.tb_usuario%ROWTYPE;
  v_target public.tb_usuario%ROWTYPE;
  v_target_id bigint;
  v_usuario_registra bigint := p_id_usuario_registra;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT u.* INTO v_actor
    FROM public.tb_usuario u
    JOIN public.tb_estado e ON e.id = u.id_estado
    WHERE UPPER(e.nombre) = 'ACTIVO'
      AND (
        u.auth_user_id = auth.uid()
        OR (u.auth_user_id IS NULL AND LOWER(u.email) = LOWER(auth.jwt() ->> 'email'))
      )
    ORDER BY (u.auth_user_id = auth.uid()) DESC
    LIMIT 1;

    IF v_actor.id IS NULL THEN
      RAISE EXCEPTION 'No se pudo validar el usuario autenticado';
    END IF;
    IF p_id_usuario_registra IS NOT NULL AND p_id_usuario_registra <> v_actor.id THEN
      RAISE EXCEPTION 'El usuario que registra el permiso no coincide con la sesion';
    END IF;
    v_usuario_registra := v_actor.id;

    IF v_actor.id_rol = 3 AND NOT COALESCE(v_actor.flag_super_admin, false) THEN
      SELECT * INTO v_current FROM public.tb_permiso_usuario WHERE id = p_id;
      IF v_current.id IS NULL THEN
        RAISE EXCEPTION 'El permiso de usuario no existe';
      END IF;
      SELECT * INTO v_current_target FROM public.tb_usuario WHERE id = v_current.id_usuario;
      IF v_current_target.id IS NULL
         OR v_current_target.id_rol <> 4
         OR v_current_target.id_sucursal IS DISTINCT FROM v_actor.id_sucursal THEN
        RAISE EXCEPTION 'El Jefe de Tienda solo puede modificar permisos de usuarios de su propia sucursal';
      END IF;
      v_target_id := COALESCE(p_id_usuario, v_current.id_usuario);
      SELECT * INTO v_target FROM public.tb_usuario WHERE id = v_target_id;
      IF v_target.id IS NULL
         OR v_target.id_rol <> 4
         OR v_target.id_sucursal IS DISTINCT FROM v_actor.id_sucursal THEN
        RAISE EXCEPTION 'El Jefe de Tienda solo puede actualizar permisos de usuarios de Atencion al Cliente de su propia sucursal';
      END IF;
      IF p_id_permiso_menu IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.tb_permiso_menu pm
        JOIN public.tb_estado em ON em.id = pm.id_estado
        WHERE pm.id = p_id_permiso_menu
          AND UPPER(em.nombre) = 'ACTIVO'
          AND NOT EXISTS (
            SELECT 1
            FROM public.tb_permiso_menu child
            JOIN public.tb_estado ec ON ec.id = child.id_estado
            WHERE child.id_padre = pm.id AND UPPER(ec.nombre) = 'ACTIVO'
          )
      ) THEN
        RAISE EXCEPTION 'Solo puede asignar permisos de menus activos';
      END IF;
    END IF;
  END IF;

  UPDATE public.tb_permiso_usuario
  SET id_usuario = COALESCE(p_id_usuario, id_usuario),
      id_permiso_menu = COALESCE(p_id_permiso_menu, id_permiso_menu),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario_registra = COALESCE(v_usuario_registra, id_usuario_registra)
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
SET search_path = public, auth
AS $$
DECLARE
  v_count integer := 0;
  v_estado_activo_id bigint;
  v_actor public.tb_usuario%ROWTYPE;
  v_target public.tb_usuario%ROWTYPE;
  v_usuario_registra bigint := p_id_usuario_registra;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT u.* INTO v_actor
    FROM public.tb_usuario u
    JOIN public.tb_estado e ON e.id = u.id_estado
    WHERE UPPER(e.nombre) = 'ACTIVO'
      AND (
        u.auth_user_id = auth.uid()
        OR (u.auth_user_id IS NULL AND LOWER(u.email) = LOWER(auth.jwt() ->> 'email'))
      )
    ORDER BY (u.auth_user_id = auth.uid()) DESC
    LIMIT 1;

    IF v_actor.id IS NULL THEN
      RAISE EXCEPTION 'No se pudo validar el usuario autenticado';
    END IF;
    IF p_id_usuario_registra IS NOT NULL AND p_id_usuario_registra <> v_actor.id THEN
      RAISE EXCEPTION 'El usuario que registra los permisos no coincide con la sesion';
    END IF;
    v_usuario_registra := v_actor.id;

    IF v_actor.id_rol = 3 AND NOT COALESCE(v_actor.flag_super_admin, false) THEN
      SELECT * INTO v_target FROM public.tb_usuario WHERE id = p_id_usuario;
      IF v_target.id IS NULL
         OR v_target.id_rol <> 4
         OR v_target.id_sucursal IS DISTINCT FROM v_actor.id_sucursal THEN
        RAISE EXCEPTION 'El Jefe de Tienda solo puede administrar permisos de usuarios de Atencion al Cliente de su propia sucursal';
      END IF;
    END IF;
  END IF;

  SELECT id
  INTO v_estado_activo_id
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'ACTIVO'
  LIMIT 1;

  v_estado_activo_id := COALESCE(v_estado_activo_id, 1);

  DELETE FROM public.tb_permiso_usuario
  WHERE id_usuario = p_id_usuario;

  IF p_ids_permiso_menu IS NOT NULL AND array_length(p_ids_permiso_menu, 1) > 0 THEN
    INSERT INTO public.tb_permiso_usuario (
      id_usuario,
      id_permiso_menu,
      id_estado,
      id_usuario_registra
    )
    SELECT
      p_id_usuario,
      pm.id,
      v_estado_activo_id,
      v_usuario_registra
    FROM public.tb_permiso_menu pm
    WHERE pm.id = ANY(p_ids_permiso_menu)
      AND pm.id_estado = v_estado_activo_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.tb_permiso_menu child
        WHERE child.id_padre = pm.id
          AND child.id_estado = v_estado_activo_id
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'id_usuario', p_id_usuario,
    'permisos_asignados', v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.f_post_tb_permiso_usuario(
  bigint, bigint, bigint, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_permiso_usuario(
  bigint, bigint, bigint, bigint
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.f_patch_tb_permiso_usuario(
  bigint, bigint, bigint, bigint, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_permiso_usuario(
  bigint, bigint, bigint, bigint, bigint
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.f_put_tb_permiso_usuario_lote(
  bigint, bigint[], bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_put_tb_permiso_usuario_lote(
  bigint, bigint[], bigint
) TO authenticated, service_role;

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
  v_es_jefe_tienda boolean := false;
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
         COALESCE(u.flag_super_admin, false),
         (u.id_rol = 3 AND NOT COALESCE(u.flag_super_admin, false))
  INTO v_usuario, v_es_super_admin, v_es_jefe_tienda
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
    FROM public.tb_permiso_menu pm
    LEFT JOIN public.tb_permiso_usuario pu
      ON pu.id_permiso_menu = pm.id
     AND pu.id_usuario = p_id_usuario
     AND pu.id_estado = (SELECT e.id FROM public.tb_estado e WHERE UPPER(e.nombre) = 'ACTIVO')
    WHERE pm.id_estado = (SELECT e.id FROM public.tb_estado e WHERE UPPER(e.nombre) = 'ACTIVO')
      AND (
        pu.id IS NOT NULL
        OR (v_es_jefe_tienda AND pm.ruta = '/sistema/permiso-usuario')
      );
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

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
    'f_get_tb_usuario',
    'f_get_tb_usuario_his',
    'f_post_tb_usuario',
    'f_patch_tb_usuario',
    'f_post_tb_usuario_auth',
    'f_patch_tb_usuario_auth',
    'f_post_tb_permiso_usuario',
    'f_patch_tb_permiso_usuario',
    'f_put_tb_permiso_usuario_lote',
    'f_get_tb_navegacion_x_usuario'
)
ORDER BY n.nspname, p.proname;

