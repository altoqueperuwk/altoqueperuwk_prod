-- ============================================================================
-- 6. TB_CLIENTE
-- ============================================================================

/*
Tabla: tb_cliente
Objetivo:
  Registrar clientes del sistema compacto.

Compactacion aplicada:
  El campo `celular` se modela como bigint para conservar un unico Whatsapp.
*/
CREATE TABLE IF NOT EXISTS public.tb_cliente (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  tipo_documento bigint NOT NULL DEFAULT 1,
  numero_documento character varying NOT NULL,
  nombre character varying,
  celular bigint,
  id_comunidad bigint,
  comision_servicio_recurrente numeric,
  comision_monto_extra_servicio_recurrente numeric,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_cliente_pkey PRIMARY KEY (id),
  CONSTRAINT tb_cliente_documento_unique UNIQUE (tipo_documento, numero_documento)
);

-- Soporta la atribucion de clientes nuevos al usuario que los registro y la
-- evaluacion de su primera efectivizacion dentro de la ventana configurada.
CREATE INDEX IF NOT EXISTS idx_tb_cliente_compensacion_usuario_fecha
  ON public.tb_cliente (id_usuario, fecha_registro, id);

-- ============================================================================
-- ALTER TABLE: migracion de dni a tipo_documento + numero_documento
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_cliente' AND column_name = 'dni'
  ) THEN
    ALTER TABLE public.tb_cliente RENAME COLUMN dni TO numero_documento;
  END IF;
END;
$$;

ALTER TABLE public.tb_cliente
  ADD COLUMN IF NOT EXISTS comision_servicio_recurrente numeric,
  ADD COLUMN IF NOT EXISTS comision_monto_extra_servicio_recurrente numeric;

ALTER TABLE public.tb_cliente
  ALTER COLUMN comision_monto_extra_servicio_recurrente TYPE numeric
  USING comision_monto_extra_servicio_recurrente::numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_cliente' AND column_name = 'tipo_documento'
  ) THEN
    ALTER TABLE public.tb_cliente ADD COLUMN tipo_documento bigint NOT NULL DEFAULT 1;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tb_cliente_dni_unique' AND conrelid = 'public.tb_cliente'::regclass
  ) THEN
    ALTER TABLE public.tb_cliente DROP CONSTRAINT tb_cliente_dni_unique;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tb_cliente_documento_unique' AND conrelid = 'public.tb_cliente'::regclass
  ) THEN
    ALTER TABLE public.tb_cliente ADD CONSTRAINT tb_cliente_documento_unique UNIQUE (tipo_documento, numero_documento);
  END IF;
END;
$$;

-- ============================================================================
-- ALTER TABLE: migracion de celular jsonb a Whatsapp unico bigint
-- ============================================================================
DO $$
DECLARE
  v_celular_type text;
BEGIN
  SELECT data_type
  INTO v_celular_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'tb_cliente'
    AND column_name = 'celular';

  IF v_celular_type = 'jsonb' THEN
    ALTER TABLE public.tb_cliente ADD COLUMN IF NOT EXISTS celular_whatsapp_tmp bigint;

    UPDATE public.tb_cliente
    SET celular_whatsapp_tmp = NULLIF(
      regexp_replace(
        CASE
          WHEN jsonb_typeof(celular) = 'array' THEN COALESCE(celular ->> 0, '')
          WHEN jsonb_typeof(celular) = 'string' THEN COALESCE(celular #>> '{}', '')
          ELSE ''
        END,
        '\D',
        '',
        'g'
      ),
      ''
    )::bigint;

    ALTER TABLE public.tb_cliente DROP COLUMN celular;
    ALTER TABLE public.tb_cliente RENAME COLUMN celular_whatsapp_tmp TO celular;
  END IF;
END;
$$;

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

DROP TRIGGER IF EXISTS trg_tb_cliente_his ON public.tb_cliente;
DROP TABLE IF EXISTS public.tb_cliente_his;

CREATE TABLE public.tb_cliente_his AS
TABLE public.tb_cliente
WITH NO DATA;

CREATE TRIGGER trg_tb_cliente_his
AFTER INSERT OR UPDATE ON public.tb_cliente
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

/*
Funcion: f_get_tb_cliente
Objetivo:
  Consultar clientes con enriquecimiento de comunidad, estado y usuario.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_cliente(
  p_id bigint DEFAULT NULL,
  p_tipo_documento bigint DEFAULT NULL,
  p_numero_documento character varying DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_celular bigint DEFAULT NULL,
  p_id_comunidad bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL,
  p_flag_sin_nombre boolean DEFAULT NULL,
  p_flag_sin_celular boolean DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'tipo_documento', t.tipo_documento,
    'numero_documento', t.numero_documento,
    'nombre', t.nombre,
    'celular', t.celular,
    'id_comunidad', t.id_comunidad,
    'comision_servicio_recurrente', t.comision_servicio_recurrente,
    'comision_monto_extra_servicio_recurrente', t.comision_monto_extra_servicio_recurrente,
    'comunidad_nombre', c.nombre,
    'id_estado', t.id_estado,
    'estado_nombre', e.nombre,
    'id_usuario', t.id_usuario,
    'usuario_nombre', u.nombre,
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_cliente t
  LEFT JOIN public.tb_comunidad c ON t.id_comunidad = c.id
  LEFT JOIN public.tb_estado e ON t.id_estado = e.id
  LEFT JOIN public.tb_usuario u ON t.id_usuario = u.id
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_tipo_documento IS NULL OR t.tipo_documento = p_tipo_documento)
    AND (p_numero_documento IS NULL OR t.numero_documento ILIKE '%' || p_numero_documento || '%')
    AND (p_nombre IS NULL OR COALESCE(t.nombre, '') ILIKE '%' || p_nombre || '%')
    AND (p_celular IS NULL OR COALESCE(t.celular::text, '') ILIKE '%' || p_celular::text || '%')
    AND (p_id_comunidad IS NULL OR t.id_comunidad = p_id_comunidad)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
    AND (p_flag_sin_nombre IS NULL OR p_flag_sin_nombre = false OR NULLIF(BTRIM(COALESCE(t.nombre, '')), '') IS NULL)
    AND (p_flag_sin_celular IS NULL OR p_flag_sin_celular = false OR t.celular IS NULL)
  ORDER BY t.id DESC;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_cliente_his(
  p_id bigint DEFAULT NULL,
  p_tipo_documento bigint DEFAULT NULL,
  p_numero_documento character varying DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_celular bigint DEFAULT NULL,
  p_id_comunidad bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL,
  p_flag_sin_nombre boolean DEFAULT NULL,
  p_flag_sin_celular boolean DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT to_jsonb(t)
  FROM public.tb_cliente_his t
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_tipo_documento IS NULL OR t.tipo_documento = p_tipo_documento)
    AND (p_numero_documento IS NULL OR t.numero_documento ILIKE '%' || p_numero_documento || '%')
    AND (p_nombre IS NULL OR COALESCE(t.nombre, '') ILIKE '%' || p_nombre || '%')
    AND (p_celular IS NULL OR COALESCE(t.celular::text, '') ILIKE '%' || p_celular::text || '%')
    AND (p_id_comunidad IS NULL OR t.id_comunidad = p_id_comunidad)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
    AND (p_flag_sin_nombre IS NULL OR p_flag_sin_nombre = false OR NULLIF(BTRIM(COALESCE(t.nombre, '')), '') IS NULL)
    AND (p_flag_sin_celular IS NULL OR p_flag_sin_celular = false OR t.celular IS NULL)
  ORDER BY t.fecha_registro, t.id;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_cliente_atencion_kpi(
  p_tipo_documento bigint DEFAULT NULL,
  p_numero_documento character varying DEFAULT NULL,
  p_celular bigint DEFAULT NULL,
  p_id_comunidad bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_flag_sin_nombre boolean DEFAULT NULL,
  p_flag_sin_celular boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT t.*
    FROM public.tb_cliente t
    WHERE (p_tipo_documento IS NULL OR t.tipo_documento = p_tipo_documento)
      AND (p_numero_documento IS NULL OR t.numero_documento ILIKE '%' || p_numero_documento || '%')
      AND (p_celular IS NULL OR COALESCE(t.celular::text, '') ILIKE '%' || p_celular::text || '%')
      AND (p_id_comunidad IS NULL OR t.id_comunidad = p_id_comunidad)
      AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
      AND (p_flag_sin_nombre IS NULL OR p_flag_sin_nombre = false OR NULLIF(BTRIM(COALESCE(t.nombre, '')), '') IS NULL)
      AND (p_flag_sin_celular IS NULL OR p_flag_sin_celular = false OR t.celular IS NULL)
  ),
  comunidad_totales AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id_comunidad', c.id,
        'comunidad_nombre', c.nombre,
        'total', COALESCE(x.total, 0)
      )
      ORDER BY c.nombre
    ) AS comunidades
    FROM public.tb_comunidad c
    LEFT JOIN (
      SELECT id_comunidad, COUNT(*)::bigint AS total
      FROM base
      WHERE id_comunidad IS NOT NULL
      GROUP BY id_comunidad
    ) x ON x.id_comunidad = c.id
    WHERE c.id_estado = 1
  )
  SELECT jsonb_build_object(
    'total_cliente', COUNT(*)::bigint,
    'total_sin_nombre', COUNT(*) FILTER (WHERE NULLIF(BTRIM(COALESCE(nombre, '')), '') IS NULL)::bigint,
    'total_con_whatsapp', COUNT(*) FILTER (WHERE celular IS NOT NULL)::bigint,
    'total_sin_whatsapp', COUNT(*) FILTER (WHERE celular IS NULL)::bigint,
    'comunidades', COALESCE((SELECT comunidades FROM comunidad_totales), '[]'::jsonb)
  )
  FROM base;
$$;

/*
Funcion: f_post_tb_cliente
Objetivo:
  Crear un cliente con un unico Whatsapp.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_cliente(
  p_tipo_documento bigint,
  p_numero_documento character varying,
  p_nombre character varying DEFAULT NULL,
  p_celular bigint DEFAULT NULL,
  p_id_comunidad bigint DEFAULT NULL,
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
  INSERT INTO public.tb_cliente (tipo_documento, numero_documento, nombre, celular, id_comunidad, id_estado, id_usuario)
  VALUES (p_tipo_documento, p_numero_documento, p_nombre, p_celular, p_id_comunidad, p_id_estado, p_id_usuario)
  RETURNING id INTO v_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_cliente(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_cliente
Objetivo:
  Actualizar un cliente existente.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_cliente(
  p_id bigint,
  p_tipo_documento bigint DEFAULT NULL,
  p_numero_documento character varying DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_celular bigint DEFAULT NULL,
  p_id_comunidad bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_flag_limpiar_celular boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_cliente
  SET tipo_documento = COALESCE(p_tipo_documento, tipo_documento),
      numero_documento = COALESCE(p_numero_documento, numero_documento),
      nombre = COALESCE(p_nombre, nombre),
      celular = CASE WHEN p_flag_limpiar_celular THEN NULL ELSE COALESCE(p_celular, celular) END,
      id_comunidad = COALESCE(p_id_comunidad, id_comunidad),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_cliente(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_cliente_comision_recurrente(
  p_id bigint,
  p_comision_servicio_recurrente numeric DEFAULT NULL,
  p_comision_monto_extra_servicio_recurrente numeric DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_comision_servicio_recurrente IS NOT NULL AND p_comision_servicio_recurrente < 0 THEN
    RETURN jsonb_build_object('error', 'La comision recurrente debe ser mayor o igual a 0.');
  END IF;

  IF p_comision_monto_extra_servicio_recurrente IS NOT NULL
     AND p_comision_monto_extra_servicio_recurrente < 0 THEN
    RETURN jsonb_build_object('error', 'La comision extra recurrente debe ser mayor o igual a 0.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tb_cliente WHERE id = p_id) THEN
    RETURN jsonb_build_object('error', 'El cliente no existe.');
  END IF;

  UPDATE public.tb_cliente
  SET comision_servicio_recurrente = p_comision_servicio_recurrente,
      comision_monto_extra_servicio_recurrente = p_comision_monto_extra_servicio_recurrente,
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_cliente(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_post_tb_cliente_carga_masiva
Objetivo:
  Procesar hasta 10,000 clientes desde una sola carga JSON sin abortar el lote
  cuando una fila individual contiene errores.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_cliente_carga_masiva(
  p_datos_clientes_json jsonb,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item jsonb;
  v_fila bigint;
  v_documento text;
  v_nombre text;
  v_codigo text;
  v_telefono text;
  v_tipo_documento bigint;
  v_id_comunidad bigint;
  v_nombre_comunidad text;
  v_id_comunidad_default bigint;
  v_nombre_comunidad_default text;
  v_id_estado bigint;
  v_celular bigint;
  v_id_cliente bigint;
  v_estado text;
  v_motivo text;
  v_detalle jsonb := '[]'::jsonb;
  v_filas_procesadas bigint := 0;
  v_filas_actualizadas bigint := 0;
  v_filas_omitidas bigint := 0;
  v_filas_error bigint := 0;
  v_normalized_code text;
BEGIN
  IF jsonb_typeof(COALESCE(p_datos_clientes_json, '[]'::jsonb)) <> 'array' THEN
    RETURN jsonb_build_object(
      'filas_procesadas', 0,
      'filas_actualizadas', 0,
      'filas_omitidas', 0,
      'filas_error', 1,
      'detalle', jsonb_build_array(jsonb_build_object('fila', 0, 'estado', 'ERROR', 'motivo', 'El archivo no contiene una lista de filas valida.'))
    );
  END IF;

  IF jsonb_array_length(p_datos_clientes_json) > 10000 THEN
    RETURN jsonb_build_object(
      'filas_procesadas', 0,
      'filas_actualizadas', 0,
      'filas_omitidas', 0,
      'filas_error', 1,
      'detalle', jsonb_build_array(jsonb_build_object('fila', 0, 'estado', 'ERROR', 'motivo', 'La carga no puede superar 10,000 registros.'))
    );
  END IF;

  SELECT e.id
  INTO v_id_estado
  FROM public.tb_estado e
  WHERE UPPER(BTRIM(COALESCE(e.nombre, ''))) = 'ACTIVO'
  ORDER BY e.id
  LIMIT 1;

  SELECT c.id, c.nombre
  INTO v_id_comunidad_default, v_nombre_comunidad_default
  FROM public.tb_comunidad c
  WHERE c.id_estado = v_id_estado
  ORDER BY c.id
  LIMIT 1;

  IF v_id_estado IS NULL THEN
    RETURN jsonb_build_object(
      'filas_procesadas', 0,
      'filas_actualizadas', 0,
      'filas_omitidas', 0,
      'filas_error', 1,
      'detalle', jsonb_build_array(jsonb_build_object('fila', 0, 'estado', 'ERROR', 'motivo', 'No existe un estado Activo configurado.'))
    );
  END IF;

  IF v_id_comunidad_default IS NULL THEN
    RETURN jsonb_build_object(
      'filas_procesadas', 0,
      'filas_actualizadas', 0,
      'filas_omitidas', 0,
      'filas_error', 1,
      'detalle', jsonb_build_array(jsonb_build_object('fila', 0, 'estado', 'ERROR', 'motivo', 'No existe una comunidad activa configurada.'))
    );
  END IF;

  FOR v_item, v_fila IN
    SELECT value, ordinality
    FROM jsonb_array_elements(p_datos_clientes_json) WITH ORDINALITY
  LOOP
    BEGIN
      v_documento := regexp_replace(BTRIM(COALESCE(v_item->>'dni', '')), '\D', '', 'g');
      v_nombre := NULLIF(BTRIM(COALESCE(v_item->>'nombre', '')), '');
      v_codigo := BTRIM(COALESCE(v_item->>'codigo', ''));
      v_telefono := regexp_replace(BTRIM(COALESCE(v_item->>'telefono_whatsapp', v_item->>'telefono', v_item->>'whatsapp', '')), '\D', '', 'g');
      v_tipo_documento := CASE WHEN LENGTH(v_documento) = 8 THEN 1 WHEN LENGTH(v_documento) = 9 THEN 2 ELSE NULL END;

      IF v_tipo_documento IS NULL THEN
        v_filas_error := v_filas_error + 1;
        v_detalle := v_detalle || jsonb_build_array(jsonb_build_object('fila', v_fila, 'estado', 'ERROR', 'motivo', 'El documento debe tener 8 digitos para DNI o 9 digitos para CE.'));
        CONTINUE;
      END IF;

      IF LENGTH(v_telefono) > 9 THEN
        v_telefono := RIGHT(v_telefono, 9);
      END IF;
      v_celular := NULLIF(v_telefono, '')::bigint;

      v_normalized_code := UPPER(BTRIM(v_codigo));
      v_normalized_code := CASE v_normalized_code
        WHEN 'ATK' THEN 'ATK1'
        WHEN 'ATK 0,5' THEN 'ATK50'
        WHEN 'ATK 1' THEN 'ATK1'
        WHEN 'ATK 1%' THEN 'ATK1'
        WHEN 'ATK 30' THEN 'ATK30'
        WHEN 'ATK 50' THEN 'ATK50'
        WHEN 'ATK1' THEN 'ATK1'
        WHEN 'ATK30' THEN 'ATK30'
        WHEN 'ATK50' THEN 'ATK50'
        WHEN 'BETO 30' THEN 'BETO30'
        WHEN 'BETO30' THEN 'BETO30'
        WHEN 'CCFVIP30' THEN 'CCFVIP30'
        WHEN 'JACK 1' THEN 'JACK30'
        WHEN 'JACK 30' THEN 'JACK30'
        WHEN 'JACK30' THEN 'JACK30'
        WHEN 'LUIS 30' THEN 'LUIS30'
        WHEN 'LUIS30' THEN 'LUIS30'
        WHEN 'MARRTIN 30' THEN 'MARTIN30'
        WHEN 'MARRTIN30' THEN 'MARTIN30'
        WHEN 'MARTIN 30' THEN 'MARTIN30'
        WHEN 'MARTIN30' THEN 'MARTIN30'
        WHEN 'REMY' THEN 'REMY'
        WHEN 'REMY 1' THEN 'REMY'
        WHEN 'REMY1' THEN 'REMY'
        ELSE v_normalized_code
      END;

      SELECT c.id, c.nombre
      INTO v_id_comunidad, v_nombre_comunidad
      FROM public.tb_comunidad c
      WHERE c.id_estado = v_id_estado
        AND UPPER(BTRIM(c.nombre)) = v_normalized_code
      ORDER BY c.id
      LIMIT 1;

      IF v_id_comunidad IS NULL THEN
        v_id_comunidad := v_id_comunidad_default;
        v_nombre_comunidad := v_nombre_comunidad_default;
        v_motivo := format('Codigo de comunidad no reconocido; se asigno %s.', v_nombre_comunidad_default);
      ELSE
        v_motivo := NULL;
      END IF;

      SELECT c.id
      INTO v_id_cliente
      FROM public.tb_cliente c
      WHERE c.tipo_documento = v_tipo_documento
        AND c.numero_documento = v_documento
      FOR UPDATE;

      IF v_id_cliente IS NULL THEN
        INSERT INTO public.tb_cliente (tipo_documento, numero_documento, nombre, celular, id_comunidad, id_estado, id_usuario)
        VALUES (v_tipo_documento, v_documento, v_nombre, v_celular, v_id_comunidad, v_id_estado, p_id_usuario)
        RETURNING id INTO v_id_cliente;
        v_estado := 'PROCESADO';
        v_filas_procesadas := v_filas_procesadas + 1;
      ELSE
        UPDATE public.tb_cliente
        SET nombre = v_nombre,
            celular = v_celular,
            id_comunidad = v_id_comunidad,
            id_usuario = COALESCE(p_id_usuario, id_usuario)
        WHERE id = v_id_cliente;
        v_estado := 'ACTUALIZADO';
        v_filas_actualizadas := v_filas_actualizadas + 1;
      END IF;

      v_detalle := v_detalle || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'fila', v_fila,
        'estado', v_estado,
        'numero_documento', v_documento,
        'comunidad', v_nombre_comunidad,
        'motivo', v_motivo
      )));
    EXCEPTION WHEN OTHERS THEN
      v_filas_error := v_filas_error + 1;
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object('fila', v_fila, 'estado', 'ERROR', 'motivo', SQLERRM));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'filas_procesadas', v_filas_procesadas,
    'filas_actualizadas', v_filas_actualizadas,
    'filas_omitidas', v_filas_omitidas,
    'filas_error', v_filas_error,
    'detalle', v_detalle
  );
END;
$$;

-- ============================================================================
-- 7. TB_CODIGO_SERVICIO
-- ============================================================================

/*
Tabla: tb_codigo_servicio
Objetivo:
  Catalogo de servicios del sistema compacto.

Compactacion aplicada:
  Absorbe la semantica de tipo de servicio.
*/
CREATE TABLE IF NOT EXISTS public.tb_codigo_servicio (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  tipo character varying NOT NULL,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_codigo_servicio_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tb_codigo_servicio_his AS
TABLE public.tb_codigo_servicio
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_codigo_servicio_his ON public.tb_codigo_servicio;
CREATE TRIGGER trg_tb_codigo_servicio_his
AFTER INSERT OR UPDATE ON public.tb_codigo_servicio
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

/*
Funcion: f_get_tb_codigo_servicio
Objetivo:
  Consultar codigos de servicio con filtros y estado enriquecido.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_codigo_servicio(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_tipo character varying DEFAULT NULL,
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
    'tipo', t.tipo,
    'id_estado', t.id_estado,
    'estado_nombre', e.nombre,
    'id_usuario', t.id_usuario,
    'usuario_nombre', u.nombre,
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_codigo_servicio t
  LEFT JOIN public.tb_estado e ON t.id_estado = e.id
  LEFT JOIN public.tb_usuario u ON t.id_usuario = u.id
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_tipo IS NULL OR t.tipo ILIKE '%' || p_tipo || '%')
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.id;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_codigo_servicio_his(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_tipo character varying DEFAULT NULL,
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
  FROM public.tb_codigo_servicio_his t
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_tipo IS NULL OR COALESCE(t.tipo, '') ILIKE '%' || p_tipo || '%')
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.fecha_registro, t.id;
$$;

/*
Funcion: f_post_tb_codigo_servicio
Objetivo:
  Crear un servicio nuevo.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_codigo_servicio(
  p_nombre character varying,
  p_tipo character varying,
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
  INSERT INTO public.tb_codigo_servicio (nombre, tipo, id_estado, id_usuario)
  VALUES (p_nombre, p_tipo, p_id_estado, p_id_usuario)
  RETURNING id INTO v_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_codigo_servicio(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_codigo_servicio
Objetivo:
  Actualizar un servicio existente.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_codigo_servicio(
  p_id bigint,
  p_nombre character varying DEFAULT NULL,
  p_tipo character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_codigo_servicio
  SET nombre = COALESCE(p_nombre, nombre),
      tipo = COALESCE(p_tipo, tipo),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_codigo_servicio(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- 8. TB_BANCO
-- ============================================================================

/*
Tabla: tb_banco
Objetivo:
  Catalogo de bancos y medios bancarios del sistema compacto.

Compactacion aplicada:
  `nombre_equivalencia` absorbe alias y equivalencias antes separadas.
*/
CREATE TABLE IF NOT EXISTS public.tb_banco (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  nombre_abreviatura character varying,
  nombre_equivalencia jsonb NOT NULL DEFAULT '[]'::jsonb,
  flag_permite_deposito boolean NOT NULL DEFAULT false,
  tipo character varying NOT NULL,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_banco_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- ALTER TABLE: cambiar tipo de bigint a character varying
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_banco' AND data_type = 'bigint' AND column_name = 'tipo'
  ) THEN
    ALTER TABLE public.tb_banco ALTER COLUMN tipo TYPE character varying USING tipo::text;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.tb_banco_his AS
TABLE public.tb_banco
WITH NO DATA;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_banco_his' AND data_type = 'bigint' AND column_name = 'tipo'
  ) THEN
    ALTER TABLE public.tb_banco_his ALTER COLUMN tipo TYPE character varying USING tipo::text;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_tb_banco_his ON public.tb_banco;
CREATE TRIGGER trg_tb_banco_his
AFTER INSERT OR UPDATE ON public.tb_banco
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

/*
Funcion: f_get_tb_banco
Objetivo:
  Consultar bancos con filtros opcionales.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_banco(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_nombre_abreviatura character varying DEFAULT NULL,
  p_nombre_equivalencia jsonb DEFAULT NULL,
  p_flag_permite_deposito boolean DEFAULT NULL,
  p_tipo character varying DEFAULT NULL,
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
    'nombre_abreviatura', t.nombre_abreviatura,
    'nombre_equivalencia', t.nombre_equivalencia,
    'flag_permite_deposito', t.flag_permite_deposito,
    'tipo', t.tipo,
    'id_estado', t.id_estado,
    'estado_nombre', e.nombre,
    'id_usuario', t.id_usuario,
    'usuario_nombre', u.nombre,
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_banco t
  LEFT JOIN public.tb_estado e ON t.id_estado = e.id
  LEFT JOIN public.tb_usuario u ON t.id_usuario = u.id
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_nombre_abreviatura IS NULL OR COALESCE(t.nombre_abreviatura, '') ILIKE '%' || p_nombre_abreviatura || '%')
    AND (p_nombre_equivalencia IS NULL OR t.nombre_equivalencia = p_nombre_equivalencia)
    AND (p_flag_permite_deposito IS NULL OR t.flag_permite_deposito = p_flag_permite_deposito)
    AND (p_tipo IS NULL OR t.tipo ILIKE '%' || p_tipo || '%')
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.id;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_banco_his(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_nombre_abreviatura character varying DEFAULT NULL,
  p_nombre_equivalencia jsonb DEFAULT NULL,
  p_flag_permite_deposito boolean DEFAULT NULL,
  p_tipo character varying DEFAULT NULL,
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
  FROM public.tb_banco_his t
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_nombre_abreviatura IS NULL OR COALESCE(t.nombre_abreviatura, '') ILIKE '%' || p_nombre_abreviatura || '%')
    AND (p_nombre_equivalencia IS NULL OR t.nombre_equivalencia = p_nombre_equivalencia)
    AND (p_flag_permite_deposito IS NULL OR t.flag_permite_deposito = p_flag_permite_deposito)
    AND (p_tipo IS NULL OR COALESCE(t.tipo, '') ILIKE '%' || p_tipo || '%')
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.fecha_registro, t.id;
$$;

/*
Funcion: f_post_tb_banco
Objetivo:
  Crear un banco nuevo con sus equivalencias compactadas.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_banco(
  p_nombre character varying,
  p_nombre_abreviatura character varying DEFAULT NULL,
  p_nombre_equivalencia jsonb DEFAULT NULL,
  p_flag_permite_deposito boolean DEFAULT false,
  p_tipo character varying DEFAULT NULL,
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
  INSERT INTO public.tb_banco (
    nombre, nombre_abreviatura, nombre_equivalencia,
    flag_permite_deposito, tipo, id_estado, id_usuario
  )
  VALUES (
    p_nombre, p_nombre_abreviatura, COALESCE(p_nombre_equivalencia, '[]'::jsonb),
    COALESCE(p_flag_permite_deposito, false), p_tipo, p_id_estado, p_id_usuario
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_banco(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_banco
Objetivo:
  Actualizar un banco existente.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_banco(
  p_id bigint,
  p_nombre character varying DEFAULT NULL,
  p_nombre_abreviatura character varying DEFAULT NULL,
  p_nombre_equivalencia jsonb DEFAULT NULL,
  p_flag_permite_deposito boolean DEFAULT NULL,
  p_tipo character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_banco
  SET nombre = COALESCE(p_nombre, nombre),
      nombre_abreviatura = COALESCE(p_nombre_abreviatura, nombre_abreviatura),
      nombre_equivalencia = COALESCE(p_nombre_equivalencia, nombre_equivalencia),
      flag_permite_deposito = COALESCE(p_flag_permite_deposito, flag_permite_deposito),
      tipo = COALESCE(p_tipo, tipo),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_banco(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- 9. TB_EMPRESA
-- ============================================================================

/*
Tabla: tb_empresa
Objetivo:
  Registrar empresas operativas del sistema.
*/
CREATE TABLE IF NOT EXISTS public.tb_empresa (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  abreviatura character varying,
  flag_transferencia boolean NOT NULL DEFAULT false,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_empresa_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- ALTER TABLE: eliminar nombre_codigo_servicio
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_empresa' AND column_name = 'nombre_codigo_servicio'
  ) THEN
    ALTER TABLE public.tb_empresa DROP COLUMN nombre_codigo_servicio;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_empresa_his' AND column_name = 'nombre_codigo_servicio'
  ) THEN
    ALTER TABLE public.tb_empresa_his DROP COLUMN nombre_codigo_servicio;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.tb_empresa_his AS
TABLE public.tb_empresa
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_empresa_his ON public.tb_empresa;
CREATE TRIGGER trg_tb_empresa_his
AFTER INSERT OR UPDATE ON public.tb_empresa
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

/*
Funcion: f_get_tb_empresa
Objetivo:
  Consultar empresas con filtros y estado enriquecido.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_empresa(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_abreviatura character varying DEFAULT NULL,
  p_flag_transferencia boolean DEFAULT NULL,
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
    'abreviatura', t.abreviatura,
    'flag_transferencia', t.flag_transferencia,
    'id_estado', t.id_estado,
    'estado_nombre', e.nombre,
    'id_usuario', t.id_usuario,
    'usuario_nombre', u.nombre,
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_empresa t
  LEFT JOIN public.tb_estado e ON t.id_estado = e.id
  LEFT JOIN public.tb_usuario u ON t.id_usuario = u.id
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_abreviatura IS NULL OR COALESCE(t.abreviatura, '') ILIKE '%' || p_abreviatura || '%')
    AND (p_flag_transferencia IS NULL OR t.flag_transferencia = p_flag_transferencia)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.id;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_empresa_his(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_abreviatura character varying DEFAULT NULL,
  p_flag_transferencia boolean DEFAULT NULL,
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
  FROM public.tb_empresa_his t
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_abreviatura IS NULL OR COALESCE(t.abreviatura, '') ILIKE '%' || p_abreviatura || '%')
    AND (p_flag_transferencia IS NULL OR t.flag_transferencia = p_flag_transferencia)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.fecha_registro, t.id;
$$;

/*
Funcion: f_post_tb_empresa
Objetivo:
  Crear una empresa nueva.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_empresa(
  p_nombre character varying,
  p_abreviatura character varying DEFAULT NULL,
  p_flag_transferencia boolean DEFAULT false,
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
  INSERT INTO public.tb_empresa (
    nombre, abreviatura, flag_transferencia,
    id_estado, id_usuario
  )
  VALUES (
    p_nombre, p_abreviatura, COALESCE(p_flag_transferencia, false),
    p_id_estado, p_id_usuario
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_empresa(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_empresa
Objetivo:
  Actualizar una empresa existente.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_empresa(
  p_id bigint,
  p_nombre character varying DEFAULT NULL,
  p_abreviatura character varying DEFAULT NULL,
  p_flag_transferencia boolean DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_empresa
  SET nombre = COALESCE(p_nombre, nombre),
      abreviatura = COALESCE(p_abreviatura, abreviatura),
      flag_transferencia = COALESCE(p_flag_transferencia, flag_transferencia),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_empresa(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- 10. TB_EMPRESA_CUENTA_BANCARIA
-- ============================================================================

/*
Tabla: tb_empresa_cuenta_bancaria
Objetivo:
  Registrar la configuracion bancaria operativa de cada empresa.

Compactacion aplicada:
  `comision_itf_ingreso_salida` reemplaza la dependencia a un catalogo ITF.
*/
CREATE TABLE IF NOT EXISTS public.tb_empresa_cuenta_bancaria (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_empresa bigint NOT NULL,
  id_banco bigint NOT NULL,
  flag_por_sol_comision_banco_ingreso boolean NOT NULL DEFAULT false,
  comision_itf_ingreso_salida numeric NOT NULL DEFAULT 0,
  comision_banco_ingreso numeric NOT NULL DEFAULT 0,
  comision_minimo_banco_ingreso numeric NOT NULL DEFAULT 0,
  comision_igv_banco_ingreso numeric NOT NULL DEFAULT 0,
  comision_transf_banco_salida numeric NOT NULL DEFAULT 0,
  comision_transf_inter_banco_salida numeric NOT NULL DEFAULT 0,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_empresa_cuenta_bancaria_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- ALTER TABLE: agregar id_estado a tb_empresa_cuenta_bancaria
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_empresa_cuenta_bancaria' AND column_name = 'id_estado'
  ) THEN
    ALTER TABLE public.tb_empresa_cuenta_bancaria ADD COLUMN id_estado bigint NOT NULL DEFAULT 1;
  END IF;
END;
$$;

-- ============================================================================
-- DROP COLUMN: quitar flag_retencion / flag_retencion_parcial de tb_empresa_cuenta_bancaria
-- La retencion ahora se gobierna desde tb_recaudacion_regla_abono (archivo 12).
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_empresa_cuenta_bancaria' AND column_name = 'flag_retencion'
  ) THEN
    ALTER TABLE public.tb_empresa_cuenta_bancaria DROP COLUMN flag_retencion;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_empresa_cuenta_bancaria' AND column_name = 'flag_retencion_parcial'
  ) THEN
    ALTER TABLE public.tb_empresa_cuenta_bancaria DROP COLUMN flag_retencion_parcial;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.tb_empresa_cuenta_bancaria_his AS
TABLE public.tb_empresa_cuenta_bancaria
WITH NO DATA;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_empresa_cuenta_bancaria_his' AND column_name = 'id_estado'
  ) THEN
    ALTER TABLE public.tb_empresa_cuenta_bancaria_his ADD COLUMN id_estado bigint NOT NULL DEFAULT 1;
  END IF;
END;
$$;

-- ============================================================================
-- DROP COLUMN: quitar flag_retencion / flag_retencion_parcial de tb_empresa_cuenta_bancaria_his
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_empresa_cuenta_bancaria_his' AND column_name = 'flag_retencion'
  ) THEN
    ALTER TABLE public.tb_empresa_cuenta_bancaria_his DROP COLUMN flag_retencion;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_empresa_cuenta_bancaria_his' AND column_name = 'flag_retencion_parcial'
  ) THEN
    ALTER TABLE public.tb_empresa_cuenta_bancaria_his DROP COLUMN flag_retencion_parcial;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_tb_empresa_cuenta_bancaria_his ON public.tb_empresa_cuenta_bancaria;
CREATE TRIGGER trg_tb_empresa_cuenta_bancaria_his
AFTER INSERT OR UPDATE ON public.tb_empresa_cuenta_bancaria
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

/*
Funcion: f_get_tb_empresa_cuenta_bancaria
Objetivo:
  Consultar cuentas bancarias de empresa con empresa y banco enriquecidos.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_empresa_cuenta_bancaria(
  p_id bigint DEFAULT NULL,
  p_id_empresa bigint DEFAULT NULL,
  p_id_banco bigint DEFAULT NULL,
  p_flag_por_sol_comision_banco_ingreso boolean DEFAULT NULL,
  p_comision_itf_ingreso_salida numeric DEFAULT NULL,
  p_comision_banco_ingreso numeric DEFAULT NULL,
  p_comision_minimo_banco_ingreso numeric DEFAULT NULL,
  p_comision_igv_banco_ingreso numeric DEFAULT NULL,
  p_comision_transf_banco_salida numeric DEFAULT NULL,
  p_comision_transf_inter_banco_salida numeric DEFAULT NULL,
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
    'id_empresa', t.id_empresa,
    'empresa_nombre', e.nombre,
    'id_banco', t.id_banco,
    'banco_nombre', b.nombre,
    'flag_por_sol_comision_banco_ingreso', t.flag_por_sol_comision_banco_ingreso,
    'comision_itf_ingreso_salida', t.comision_itf_ingreso_salida,
    'comision_banco_ingreso', t.comision_banco_ingreso,
    'comision_minimo_banco_ingreso', t.comision_minimo_banco_ingreso,
    'comision_igv_banco_ingreso', t.comision_igv_banco_ingreso,
    'comision_transf_banco_salida', t.comision_transf_banco_salida,
    'comision_transf_inter_banco_salida', t.comision_transf_inter_banco_salida,
    'id_estado', t.id_estado,
    'estado_nombre', es.nombre,
    'id_usuario', t.id_usuario,
    'usuario_nombre', u.nombre,
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_empresa_cuenta_bancaria t
  LEFT JOIN public.tb_empresa e ON t.id_empresa = e.id
  LEFT JOIN public.tb_banco b ON t.id_banco = b.id
  LEFT JOIN public.tb_estado es ON t.id_estado = es.id
  LEFT JOIN public.tb_usuario u ON t.id_usuario = u.id
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_id_empresa IS NULL OR t.id_empresa = p_id_empresa)
    AND (p_id_banco IS NULL OR t.id_banco = p_id_banco)
    AND (p_flag_por_sol_comision_banco_ingreso IS NULL OR t.flag_por_sol_comision_banco_ingreso = p_flag_por_sol_comision_banco_ingreso)
    AND (p_comision_itf_ingreso_salida IS NULL OR t.comision_itf_ingreso_salida = p_comision_itf_ingreso_salida)
    AND (p_comision_banco_ingreso IS NULL OR t.comision_banco_ingreso = p_comision_banco_ingreso)
    AND (p_comision_minimo_banco_ingreso IS NULL OR t.comision_minimo_banco_ingreso = p_comision_minimo_banco_ingreso)
    AND (p_comision_igv_banco_ingreso IS NULL OR t.comision_igv_banco_ingreso = p_comision_igv_banco_ingreso)
    AND (p_comision_transf_banco_salida IS NULL OR t.comision_transf_banco_salida = p_comision_transf_banco_salida)
    AND (p_comision_transf_inter_banco_salida IS NULL OR t.comision_transf_inter_banco_salida = p_comision_transf_inter_banco_salida)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.id;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_empresa_cuenta_bancaria_his(
  p_id bigint DEFAULT NULL,
  p_id_empresa bigint DEFAULT NULL,
  p_id_banco bigint DEFAULT NULL,
  p_flag_por_sol_comision_banco_ingreso boolean DEFAULT NULL,
  p_comision_itf_ingreso_salida numeric DEFAULT NULL,
  p_comision_banco_ingreso numeric DEFAULT NULL,
  p_comision_minimo_banco_ingreso numeric DEFAULT NULL,
  p_comision_igv_banco_ingreso numeric DEFAULT NULL,
  p_comision_transf_banco_salida numeric DEFAULT NULL,
  p_comision_transf_inter_banco_salida numeric DEFAULT NULL,
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
  FROM public.tb_empresa_cuenta_bancaria_his t
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_id_empresa IS NULL OR t.id_empresa = p_id_empresa)
    AND (p_id_banco IS NULL OR t.id_banco = p_id_banco)
    AND (p_flag_por_sol_comision_banco_ingreso IS NULL OR t.flag_por_sol_comision_banco_ingreso = p_flag_por_sol_comision_banco_ingreso)
    AND (p_comision_itf_ingreso_salida IS NULL OR t.comision_itf_ingreso_salida = p_comision_itf_ingreso_salida)
    AND (p_comision_banco_ingreso IS NULL OR t.comision_banco_ingreso = p_comision_banco_ingreso)
    AND (p_comision_minimo_banco_ingreso IS NULL OR t.comision_minimo_banco_ingreso = p_comision_minimo_banco_ingreso)
    AND (p_comision_igv_banco_ingreso IS NULL OR t.comision_igv_banco_ingreso = p_comision_igv_banco_ingreso)
    AND (p_comision_transf_banco_salida IS NULL OR t.comision_transf_banco_salida = p_comision_transf_banco_salida)
    AND (p_comision_transf_inter_banco_salida IS NULL OR t.comision_transf_inter_banco_salida = p_comision_transf_inter_banco_salida)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.fecha_registro, t.id;
$$;

/*
Funcion: f_post_tb_empresa_cuenta_bancaria
Objetivo:
  Crear una cuenta bancaria operativa asociada a una empresa.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_empresa_cuenta_bancaria(
  p_id_empresa bigint,
  p_id_banco bigint,
  p_flag_por_sol_comision_banco_ingreso boolean DEFAULT false,
  p_comision_itf_ingreso_salida numeric DEFAULT 0,
  p_comision_banco_ingreso numeric DEFAULT 0,
  p_comision_minimo_banco_ingreso numeric DEFAULT 0,
  p_comision_igv_banco_ingreso numeric DEFAULT 0,
  p_comision_transf_banco_salida numeric DEFAULT 0,
  p_comision_transf_inter_banco_salida numeric DEFAULT 0,
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
  INSERT INTO public.tb_empresa_cuenta_bancaria (
    id_empresa, id_banco, flag_por_sol_comision_banco_ingreso,
    comision_itf_ingreso_salida, comision_banco_ingreso,
    comision_minimo_banco_ingreso, comision_igv_banco_ingreso,
    comision_transf_banco_salida, comision_transf_inter_banco_salida,
    id_estado, id_usuario
  )
  VALUES (
    p_id_empresa,
    p_id_banco,
    COALESCE(p_flag_por_sol_comision_banco_ingreso, false),
    COALESCE(p_comision_itf_ingreso_salida, 0), COALESCE(p_comision_banco_ingreso, 0),
    COALESCE(p_comision_minimo_banco_ingreso, 0), COALESCE(p_comision_igv_banco_ingreso, 0),
    COALESCE(p_comision_transf_banco_salida, 0), COALESCE(p_comision_transf_inter_banco_salida, 0),
    p_id_estado, p_id_usuario
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_empresa_cuenta_bancaria(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_empresa_cuenta_bancaria
Objetivo:
  Actualizar una cuenta bancaria operativa existente.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_empresa_cuenta_bancaria(
  p_id bigint,
  p_id_empresa bigint DEFAULT NULL,
  p_id_banco bigint DEFAULT NULL,
  p_flag_por_sol_comision_banco_ingreso boolean DEFAULT NULL,
  p_comision_itf_ingreso_salida numeric DEFAULT NULL,
  p_comision_banco_ingreso numeric DEFAULT NULL,
  p_comision_minimo_banco_ingreso numeric DEFAULT NULL,
  p_comision_igv_banco_ingreso numeric DEFAULT NULL,
  p_comision_transf_banco_salida numeric DEFAULT NULL,
  p_comision_transf_inter_banco_salida numeric DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
BEGIN
  SELECT * INTO v_actual FROM public.tb_empresa_cuenta_bancaria WHERE id = p_id LIMIT 1;

  UPDATE public.tb_empresa_cuenta_bancaria
  SET id_empresa = COALESCE(p_id_empresa, id_empresa),
      id_banco = COALESCE(p_id_banco, id_banco),
      flag_por_sol_comision_banco_ingreso = COALESCE(p_flag_por_sol_comision_banco_ingreso, flag_por_sol_comision_banco_ingreso),
      comision_itf_ingreso_salida = COALESCE(p_comision_itf_ingreso_salida, comision_itf_ingreso_salida),
      comision_banco_ingreso = COALESCE(p_comision_banco_ingreso, comision_banco_ingreso),
      comision_minimo_banco_ingreso = COALESCE(p_comision_minimo_banco_ingreso, comision_minimo_banco_ingreso),
      comision_igv_banco_ingreso = COALESCE(p_comision_igv_banco_ingreso, comision_igv_banco_ingreso),
      comision_transf_banco_salida = COALESCE(p_comision_transf_banco_salida, comision_transf_banco_salida),
      comision_transf_inter_banco_salida = COALESCE(p_comision_transf_inter_banco_salida, comision_transf_inter_banco_salida),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_empresa_cuenta_bancaria(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- 11. TB_REGLAS_EFECTIVIZACION
-- ============================================================================

/*
Tabla: tb_reglas_efectivizacion
Objetivo:
  Registrar reglas comerciales por servicio, banco y comunidad.

Compactacion aplicada:
  `tipo_deposito` permanece materializado como campo directo.
  El ITF ya no se define en esta tabla; se toma desde
  `tb_empresa_cuenta_bancaria.comision_itf_ingreso_salida`.
*/
CREATE TABLE IF NOT EXISTS public.tb_reglas_efectivizacion (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_codigo_servicio bigint NOT NULL,
  id_banco bigint,
  id_comunidad bigint,
  tipo_deposito character varying,
  comision_servicio numeric NOT NULL DEFAULT 0,
  monto_minimo_deposito_servicio numeric NOT NULL DEFAULT 0,
  comision_minima_servicio numeric NOT NULL DEFAULT 0,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_reglas_efectivizacion_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- ALTER TABLE: cambiar tipo_deposito de bigint a character varying
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_reglas_efectivizacion'
      AND column_name = 'tipo_deposito' AND data_type = 'bigint'
  ) THEN
    ALTER TABLE public.tb_reglas_efectivizacion ALTER COLUMN tipo_deposito TYPE character varying USING tipo_deposito::text;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_reglas_efectivizacion_his'
      AND column_name = 'tipo_deposito' AND data_type = 'bigint'
  ) THEN
    ALTER TABLE public.tb_reglas_efectivizacion_his ALTER COLUMN tipo_deposito TYPE character varying USING tipo_deposito::text;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.tb_reglas_efectivizacion_his AS
TABLE public.tb_reglas_efectivizacion
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_reglas_efectivizacion_his ON public.tb_reglas_efectivizacion;
CREATE TRIGGER trg_tb_reglas_efectivizacion_his
AFTER INSERT OR UPDATE ON public.tb_reglas_efectivizacion
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

/*
Funcion: f_get_tb_reglas_efectivizacion
Objetivo:
  Consultar reglas de efectivizacion con enriquecimiento de FK.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_reglas_efectivizacion(
  p_id bigint DEFAULT NULL,
  p_id_codigo_servicio bigint DEFAULT NULL,
  p_id_banco bigint DEFAULT NULL,
  p_id_comunidad bigint DEFAULT NULL,
  p_tipo_deposito character varying DEFAULT NULL,
  p_comision_servicio numeric DEFAULT NULL,
  p_monto_minimo_deposito_servicio numeric DEFAULT NULL,
  p_comision_minima_servicio numeric DEFAULT NULL,
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
    'id_codigo_servicio', t.id_codigo_servicio,
    'codigo_servicio_nombre', cs.nombre,
    'id_banco', t.id_banco,
    'banco_nombre', b.nombre,
    'id_comunidad', t.id_comunidad,
    'comunidad_nombre', c.nombre,
    'tipo_deposito', t.tipo_deposito,
    'comision_servicio', t.comision_servicio,
    'monto_minimo_deposito_servicio', t.monto_minimo_deposito_servicio,
    'comision_minima_servicio', t.comision_minima_servicio,
    'id_estado', t.id_estado,
    'estado_nombre', e.nombre,
    'id_usuario', t.id_usuario,
    'usuario_nombre', u.nombre,
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_reglas_efectivizacion t
  LEFT JOIN public.tb_codigo_servicio cs ON t.id_codigo_servicio = cs.id
  LEFT JOIN public.tb_banco b ON t.id_banco = b.id
  LEFT JOIN public.tb_comunidad c ON t.id_comunidad = c.id
  LEFT JOIN public.tb_estado e ON t.id_estado = e.id
  LEFT JOIN public.tb_usuario u ON t.id_usuario = u.id
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_id_codigo_servicio IS NULL OR t.id_codigo_servicio = p_id_codigo_servicio)
    AND (p_id_banco IS NULL OR t.id_banco = p_id_banco)
    AND (p_id_comunidad IS NULL OR t.id_comunidad = p_id_comunidad)
    AND (p_tipo_deposito IS NULL OR t.tipo_deposito = p_tipo_deposito)
    AND (p_comision_servicio IS NULL OR t.comision_servicio = p_comision_servicio)
    AND (p_monto_minimo_deposito_servicio IS NULL OR t.monto_minimo_deposito_servicio = p_monto_minimo_deposito_servicio)
    AND (p_comision_minima_servicio IS NULL OR t.comision_minima_servicio = p_comision_minima_servicio)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.id;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_reglas_efectivizacion_his(
  p_id bigint DEFAULT NULL,
  p_id_codigo_servicio bigint DEFAULT NULL,
  p_id_banco bigint DEFAULT NULL,
  p_id_comunidad bigint DEFAULT NULL,
  p_tipo_deposito character varying DEFAULT NULL,
  p_comision_servicio numeric DEFAULT NULL,
  p_monto_minimo_deposito_servicio numeric DEFAULT NULL,
  p_comision_minima_servicio numeric DEFAULT NULL,
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
  FROM public.tb_reglas_efectivizacion_his t
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_id_codigo_servicio IS NULL OR t.id_codigo_servicio = p_id_codigo_servicio)
    AND (p_id_banco IS NULL OR t.id_banco = p_id_banco)
    AND (p_id_comunidad IS NULL OR t.id_comunidad = p_id_comunidad)
    AND (p_tipo_deposito IS NULL OR t.tipo_deposito = p_tipo_deposito)
    AND (p_comision_servicio IS NULL OR t.comision_servicio = p_comision_servicio)
    AND (p_monto_minimo_deposito_servicio IS NULL OR t.monto_minimo_deposito_servicio = p_monto_minimo_deposito_servicio)
    AND (p_comision_minima_servicio IS NULL OR t.comision_minima_servicio = p_comision_minima_servicio)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.fecha_registro, t.id;
$$;

/*
Funcion: f_post_tb_reglas_efectivizacion
Objetivo:
  Crear una regla nueva de efectivizacion.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_reglas_efectivizacion(
  p_id_codigo_servicio bigint,
  p_id_banco bigint DEFAULT NULL,
  p_id_comunidad bigint DEFAULT NULL,
  p_tipo_deposito character varying DEFAULT NULL,
  p_comision_servicio numeric DEFAULT 0,
  p_monto_minimo_deposito_servicio numeric DEFAULT 0,
  p_comision_minima_servicio numeric DEFAULT 0,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id bigint;
  v_estado_activo bigint;
BEGIN
  SELECT id
  INTO v_estado_activo
  FROM public.tb_estado
  WHERE UPPER(BTRIM(COALESCE(nombre, ''))) = 'ACTIVO'
  ORDER BY id
  LIMIT 1;

  IF COALESCE(p_id_estado, v_estado_activo) = v_estado_activo
     AND EXISTS (
       SELECT 1
       FROM public.tb_reglas_efectivizacion r
       WHERE r.id_codigo_servicio = p_id_codigo_servicio
         AND COALESCE(r.id_banco, 0) = COALESCE(p_id_banco, 0)
         AND COALESCE(r.id_comunidad, 0) = COALESCE(p_id_comunidad, 0)
         AND COALESCE(r.tipo_deposito, '') = COALESCE(p_tipo_deposito, '')
         AND r.id_estado = v_estado_activo
     ) THEN
    RETURN jsonb_build_object('error', 'Ya existe una regla activa para servicio, banco, comunidad y tipo deposito.');
  END IF;

  INSERT INTO public.tb_reglas_efectivizacion (
    id_codigo_servicio, id_banco, id_comunidad, tipo_deposito,
    comision_servicio, monto_minimo_deposito_servicio, comision_minima_servicio,
    id_estado, id_usuario
  )
  VALUES (
    p_id_codigo_servicio, p_id_banco, p_id_comunidad, p_tipo_deposito,
    COALESCE(p_comision_servicio, 0), COALESCE(p_monto_minimo_deposito_servicio, 0),
    COALESCE(p_comision_minima_servicio, 0), p_id_estado, p_id_usuario
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_reglas_efectivizacion(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_reglas_efectivizacion
Objetivo:
  Actualizar una regla de efectivizacion existente.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_reglas_efectivizacion(
  p_id bigint,
  p_id_codigo_servicio bigint DEFAULT NULL,
  p_id_banco bigint DEFAULT NULL,
  p_id_comunidad bigint DEFAULT NULL,
  p_tipo_deposito character varying DEFAULT NULL,
  p_comision_servicio numeric DEFAULT NULL,
  p_monto_minimo_deposito_servicio numeric DEFAULT NULL,
  p_comision_minima_servicio numeric DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_id_codigo_servicio bigint;
  v_id_banco bigint;
  v_id_comunidad bigint;
  v_tipo_deposito character varying;
  v_id_estado bigint;
  v_estado_activo bigint;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_reglas_efectivizacion
  WHERE id = p_id
  LIMIT 1;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La regla de efectivizacion no existe.');
  END IF;

  SELECT id
  INTO v_estado_activo
  FROM public.tb_estado
  WHERE UPPER(BTRIM(COALESCE(nombre, ''))) = 'ACTIVO'
  ORDER BY id
  LIMIT 1;

  v_id_codigo_servicio := COALESCE(p_id_codigo_servicio, v_actual.id_codigo_servicio);
  v_id_banco := COALESCE(p_id_banco, v_actual.id_banco);
  v_id_comunidad := COALESCE(p_id_comunidad, v_actual.id_comunidad);
  v_tipo_deposito := COALESCE(p_tipo_deposito, v_actual.tipo_deposito);
  v_id_estado := COALESCE(p_id_estado, v_actual.id_estado);

  IF v_id_estado = v_estado_activo
     AND EXISTS (
       SELECT 1
       FROM public.tb_reglas_efectivizacion r
       WHERE r.id <> p_id
         AND r.id_codigo_servicio = v_id_codigo_servicio
         AND COALESCE(r.id_banco, 0) = COALESCE(v_id_banco, 0)
         AND COALESCE(r.id_comunidad, 0) = COALESCE(v_id_comunidad, 0)
         AND COALESCE(r.tipo_deposito, '') = COALESCE(v_tipo_deposito, '')
         AND r.id_estado = v_estado_activo
     ) THEN
    RETURN jsonb_build_object('error', 'Ya existe una regla activa para servicio, banco, comunidad y tipo deposito.');
  END IF;

  UPDATE public.tb_reglas_efectivizacion
  SET id_codigo_servicio = COALESCE(p_id_codigo_servicio, id_codigo_servicio),
      id_banco = COALESCE(p_id_banco, id_banco),
      id_comunidad = COALESCE(p_id_comunidad, id_comunidad),
      tipo_deposito = COALESCE(p_tipo_deposito, tipo_deposito),
      comision_servicio = COALESCE(p_comision_servicio, comision_servicio),
      monto_minimo_deposito_servicio = COALESCE(p_monto_minimo_deposito_servicio, monto_minimo_deposito_servicio),
      comision_minima_servicio = COALESCE(p_comision_minima_servicio, comision_minima_servicio),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_reglas_efectivizacion(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Tabla: tb_pos
Objetivo:
  Registrar el catalogo global de terminales/procesadores POS utilizados en
  las solicitudes de la ruta asistida POS.
*/
CREATE TABLE IF NOT EXISTS public.tb_pos (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_pos_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tb_pos_nombre_unico
  ON public.tb_pos (LOWER(BTRIM(nombre)));

CREATE TABLE IF NOT EXISTS public.tb_pos_his AS
TABLE public.tb_pos
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_pos_his ON public.tb_pos;
CREATE TRIGGER trg_tb_pos_his
AFTER INSERT OR UPDATE ON public.tb_pos
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

/*
Funcion: f_get_tb_pos
Objetivo:
  Consultar el catalogo POS con filtros opcionales y estado enriquecido.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_pos(
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
    'usuario_nombre', u.nombre,
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_pos t
  LEFT JOIN public.tb_estado e ON e.id = t.id_estado
  LEFT JOIN public.tb_usuario u ON u.id = t.id_usuario
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.id;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_pos_his(
  p_id bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT to_jsonb(t)
  FROM public.tb_pos_his t
  WHERE p_id IS NULL OR t.id = p_id
  ORDER BY t.fecha_registro DESC, t.id DESC;
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_pos(
  p_nombre character varying,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_nombre character varying := NULLIF(BTRIM(COALESCE(p_nombre, '')), '');
  v_id_estado bigint := COALESCE(
    p_id_estado,
    (SELECT id FROM public.tb_estado WHERE UPPER(BTRIM(COALESCE(nombre, ''))) = 'ACTIVO' ORDER BY id LIMIT 1)
  );
  v_id bigint;
BEGIN
  IF v_nombre IS NULL THEN
    RETURN jsonb_build_object('error', 'El nombre del POS es obligatorio.');
  END IF;

  IF v_id_estado IS NULL OR NOT EXISTS (SELECT 1 FROM public.tb_estado WHERE id = v_id_estado) THEN
    RETURN jsonb_build_object('error', 'El estado seleccionado no es valido.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.tb_pos WHERE LOWER(BTRIM(nombre)) = LOWER(v_nombre)) THEN
    RETURN jsonb_build_object('error', 'Ya existe un POS con ese nombre.');
  END IF;

  INSERT INTO public.tb_pos (nombre, id_estado, id_usuario)
  VALUES (v_nombre, v_id_estado, p_id_usuario)
  RETURNING id INTO v_id;

  RETURN (SELECT x FROM public.f_get_tb_pos(p_id := v_id) AS x LIMIT 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_pos(
  p_id bigint,
  p_nombre character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual public.tb_pos%ROWTYPE;
  v_nombre character varying;
  v_id_estado bigint;
BEGIN
  SELECT * INTO v_actual FROM public.tb_pos WHERE id = p_id LIMIT 1;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'El POS no existe.');
  END IF;

  v_nombre := COALESCE(NULLIF(BTRIM(COALESCE(p_nombre, '')), ''), v_actual.nombre);
  v_id_estado := COALESCE(p_id_estado, v_actual.id_estado);

  IF v_nombre IS NULL THEN
    RETURN jsonb_build_object('error', 'El nombre del POS es obligatorio.');
  END IF;

  IF v_id_estado IS NULL OR NOT EXISTS (SELECT 1 FROM public.tb_estado WHERE id = v_id_estado) THEN
    RETURN jsonb_build_object('error', 'El estado seleccionado no es valido.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_pos
    WHERE id <> p_id
      AND LOWER(BTRIM(nombre)) = LOWER(v_nombre)
  ) THEN
    RETURN jsonb_build_object('error', 'Ya existe un POS con ese nombre.');
  END IF;

  UPDATE public.tb_pos
  SET nombre = v_nombre,
      id_estado = v_id_estado,
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id;

  RETURN (SELECT x FROM public.f_get_tb_pos(p_id := p_id) AS x LIMIT 1);
END;
$$;

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_get_tb_cliente',
  'f_get_tb_cliente_his',
  'f_patch_tb_cliente_comision_recurrente',
  'f_post_tb_reglas_efectivizacion',
  'f_patch_tb_reglas_efectivizacion',
  'f_get_tb_pos',
  'f_get_tb_pos_his',
  'f_post_tb_pos',
  'f_patch_tb_pos'
)
ORDER BY n.nspname, p.proname;

