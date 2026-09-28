-- ============================================================================
-- COMPENSACIONES - IMPORTACION Y CONSOLIDACION DE ASISTENCIA
-- ============================================================================
-- Objetivo:
--   Recibir filas normalizadas de un Excel del huellero, conservar la fuente,
--   validar y deduplicar marcaciones, y consolidar jornadas diarias.
--
-- Nota:
--   La lectura binaria XLS/XLSX ocurre fuera de PostgreSQL. La RPC de validacion
--   recibe un arreglo JSON con las filas ya extraidas, sin perder datos origen.
--
-- Dependencias:
--   17.compensaciones_personal_configuracion.sql
--   18.compensaciones_asistencia_evidencias.sql
--   19.compensaciones_liquidaciones_cierres_reportes.sql
--   20.compensaciones_seguridad_personal_funciones.sql
-- ============================================================================

-- ============================================================================
-- 1. CONSOLIDACION PRIVADA DE JORNADAS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_asistencia_consolidar_carga(
  p_id_carga bigint,
  p_id_usuario bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_carga public.tb_asistencia_carga%ROWTYPE;
  v_registro record;
  v_entrada_programada timestamp with time zone;
  v_salida_programada timestamp with time zone;
  v_entrada_real timestamp with time zone;
  v_salida_real timestamp with time zone;
  v_entrada_tipo timestamp with time zone;
  v_salida_tipo timestamp with time zone;
  v_primera_desconocida timestamp with time zone;
  v_ultima_desconocida timestamp with time zone;
  v_cantidad_desconocidas integer;
  v_total_marcaciones integer;
  v_minutos_tardanza integer;
  v_minutos_trabajados integer;
  v_estado_dia character varying;
  v_observacion text;
  v_insertadas integer := 0;
  v_actualizadas integer := 0;
  v_omitidas integer := 0;
  v_afectadas integer;
BEGIN
  SELECT * INTO v_carga
  FROM public.tb_asistencia_carga
  WHERE id = p_id_carga
  FOR UPDATE;

  IF v_carga.id IS NULL THEN
    RAISE EXCEPTION 'La carga de asistencia no existe';
  END IF;

  IF v_carga.estado_carga <> 'CONFIRMADA' THEN
    RAISE EXCEPTION 'Solo una carga confirmada puede consolidar jornadas';
  END IF;

  IF v_carga.fecha_desde IS NULL OR v_carga.fecha_hasta IS NULL THEN
    RAISE EXCEPTION 'La carga no tiene un rango de fechas valido';
  END IF;

  FOR v_registro IN
    SELECT
      a.id AS id_asignacion,
      a.id_colaborador,
      j.hora_entrada,
      j.hora_salida,
      j.minutos_tolerancia,
      j.minutos_descanso,
      j.cruza_medianoche,
      d.fecha
    FROM public.tb_compensacion_asignacion a
    JOIN public.tb_compensacion_jornada j ON j.id = a.id_jornada
    JOIN public.tb_estado ea ON ea.id = a.id_estado
    CROSS JOIN LATERAL (
      SELECT gs::date AS fecha
      FROM generate_series(
        GREATEST(a.fecha_inicio, v_carga.fecha_desde)::timestamp,
        LEAST(COALESCE(a.fecha_fin, v_carga.fecha_hasta), v_carga.fecha_hasta)::timestamp,
        INTERVAL '1 day'
      ) gs
    ) d
    WHERE UPPER(ea.nombre) = 'ACTIVO'
      AND a.fecha_inicio <= v_carga.fecha_hasta
      AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_carga.fecha_desde)
      AND EXTRACT(ISODOW FROM d.fecha)::smallint = ANY(j.dias_semana)
    ORDER BY d.fecha, a.id_colaborador
  LOOP
    v_entrada_programada := (
      v_registro.fecha + v_registro.hora_entrada
    ) AT TIME ZONE v_carga.zona_horaria;
    v_salida_programada := (
      v_registro.fecha
      + CASE WHEN v_registro.cruza_medianoche THEN 1 ELSE 0 END
      + v_registro.hora_salida
    ) AT TIME ZONE v_carga.zona_horaria;

    SELECT
      MIN(m.fecha_hora_marcacion) FILTER (
        WHERE m.tipo_marcacion = 'ENTRADA'
      ),
      MAX(m.fecha_hora_marcacion) FILTER (
        WHERE m.tipo_marcacion = 'SALIDA'
      ),
      MIN(m.fecha_hora_marcacion) FILTER (
        WHERE m.tipo_marcacion = 'DESCONOCIDA'
      ),
      MAX(m.fecha_hora_marcacion) FILTER (
        WHERE m.tipo_marcacion = 'DESCONOCIDA'
      ),
      COUNT(*) FILTER (
        WHERE m.tipo_marcacion = 'DESCONOCIDA'
      )::integer,
      COUNT(*)::integer
    INTO
      v_entrada_tipo,
      v_salida_tipo,
      v_primera_desconocida,
      v_ultima_desconocida,
      v_cantidad_desconocidas,
      v_total_marcaciones
    FROM public.tb_asistencia_marcacion m
    JOIN public.tb_asistencia_carga ca ON ca.id = m.id_carga
    WHERE m.id_colaborador = v_registro.id_colaborador
      AND m.estado_validacion = 'VALIDA'
      AND ca.estado_carga = 'CONFIRMADA'
      AND (
        (
          NOT v_registro.cruza_medianoche
          AND (m.fecha_hora_marcacion AT TIME ZONE v_carga.zona_horaria)::date
              = v_registro.fecha
        )
        OR (
          v_registro.cruza_medianoche
          AND m.fecha_hora_marcacion >= v_entrada_programada - INTERVAL '6 hours'
          AND m.fecha_hora_marcacion <= v_salida_programada + INTERVAL '6 hours'
        )
      );

    v_entrada_real := COALESCE(
      v_entrada_tipo,
      CASE
        WHEN v_cantidad_desconocidas >= 2 THEN v_primera_desconocida
        ELSE NULL
      END
    );
    v_salida_real := COALESCE(
      v_salida_tipo,
      CASE
        WHEN v_cantidad_desconocidas >= 2 THEN v_ultima_desconocida
        ELSE NULL
      END
    );
    v_estado_dia := NULL;
    v_observacion := NULL;

    IF v_entrada_real IS NOT NULL
       AND v_salida_real IS NOT NULL
       AND v_salida_real < v_entrada_real THEN
      v_salida_real := NULL;
      v_estado_dia := 'PENDIENTE';
      v_observacion := 'La salida identificada es anterior a la entrada';
    END IF;

    IF v_estado_dia = 'PENDIENTE' THEN
      NULL;
    ELSIF v_total_marcaciones = 0 THEN
      v_estado_dia := 'AUSENTE';
      v_observacion := 'Sin marcaciones validas para la jornada programada';
    ELSIF v_entrada_real IS NOT NULL AND v_salida_real IS NOT NULL THEN
      v_estado_dia := 'COMPLETO';
      v_observacion := NULL;
    ELSIF v_entrada_real IS NOT NULL THEN
      v_estado_dia := 'FALTA_SALIDA';
      v_observacion := 'Solo se identifico la marcacion de entrada';
    ELSIF v_salida_real IS NOT NULL THEN
      v_estado_dia := 'FALTA_ENTRADA';
      v_observacion := 'Solo se identifico la marcacion de salida';
    ELSE
      v_estado_dia := 'PENDIENTE';
      v_observacion := 'Marcacion sin tipo que requiere conciliacion manual';
    END IF;

    v_minutos_tardanza := CASE
      WHEN v_entrada_real IS NULL THEN 0
      WHEN v_entrada_real <= v_entrada_programada
           + make_interval(mins => v_registro.minutos_tolerancia) THEN 0
      ELSE GREATEST(
        FLOOR(
          EXTRACT(EPOCH FROM (
            v_entrada_real
            - v_entrada_programada
            - make_interval(mins => v_registro.minutos_tolerancia)
          )) / 60
        )::integer,
        0
      )
    END;

    v_minutos_trabajados := CASE
      WHEN v_entrada_real IS NULL OR v_salida_real IS NULL THEN 0
      ELSE GREATEST(
        FLOOR(EXTRACT(EPOCH FROM (v_salida_real - v_entrada_real)) / 60)::integer
          - v_registro.minutos_descanso,
        0
      )
    END;

    IF EXISTS (
      SELECT 1
      FROM public.tb_asistencia_jornada aj
      WHERE aj.id_colaborador = v_registro.id_colaborador
        AND aj.fecha = v_registro.fecha
        AND aj.fuente NOT IN ('HUELLERO', 'MIGRACION')
    ) THEN
      v_omitidas := v_omitidas + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.tb_asistencia_jornada (
      id_colaborador,
      id_asignacion,
      id_carga,
      fecha,
      entrada_programada,
      salida_programada,
      entrada_real,
      salida_real,
      minutos_tardanza,
      minutos_extra,
      minutos_trabajados,
      estado_dia,
      fuente,
      version,
      observacion,
      id_usuario
    ) VALUES (
      v_registro.id_colaborador,
      v_registro.id_asignacion,
      p_id_carga,
      v_registro.fecha,
      v_entrada_programada,
      v_salida_programada,
      v_entrada_real,
      v_salida_real,
      v_minutos_tardanza,
      0,
      v_minutos_trabajados,
      v_estado_dia,
      'HUELLERO',
      1,
      v_observacion,
      p_id_usuario
    )
    ON CONFLICT (id_colaborador, fecha) DO UPDATE
    SET id_asignacion = EXCLUDED.id_asignacion,
        id_carga = EXCLUDED.id_carga,
        entrada_programada = EXCLUDED.entrada_programada,
        salida_programada = EXCLUDED.salida_programada,
        entrada_real = EXCLUDED.entrada_real,
        salida_real = EXCLUDED.salida_real,
        minutos_tardanza = EXCLUDED.minutos_tardanza,
        minutos_extra = EXCLUDED.minutos_extra,
        minutos_trabajados = EXCLUDED.minutos_trabajados,
        estado_dia = EXCLUDED.estado_dia,
        fuente = EXCLUDED.fuente,
        version = public.tb_asistencia_jornada.version + 1,
        observacion = EXCLUDED.observacion,
        id_usuario = EXCLUDED.id_usuario,
        fecha_actualizacion = now()
    WHERE public.tb_asistencia_jornada.fuente IN ('HUELLERO', 'MIGRACION');

    GET DIAGNOSTICS v_afectadas = ROW_COUNT;
    IF v_afectadas = 0 THEN
      v_omitidas := v_omitidas + 1;
    ELSIF EXISTS (
      SELECT 1
      FROM public.tb_asistencia_jornada aj
      WHERE aj.id_colaborador = v_registro.id_colaborador
        AND aj.fecha = v_registro.fecha
        AND aj.version > 1
    ) THEN
      v_actualizadas := v_actualizadas + 1;
    ELSE
      v_insertadas := v_insertadas + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'jornadas_insertadas', v_insertadas,
    'jornadas_actualizadas', v_actualizadas,
    'jornadas_omitidas', v_omitidas,
    'minutos_extra_calculados', false,
    'observacion', 'Los minutos extra permanecen en cero hasta aprobar su regla funcional'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.f_private_asistencia_consolidar_carga(
  bigint, bigint
) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. CONSULTA Y REGISTRO DE CARGAS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_asistencia_carga(
  p_id bigint DEFAULT NULL,
  p_estado_carga character varying DEFAULT NULL,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL
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
    'ASISTENCIA',
    'CONSULTAR'
  );

  IF (v_contexto ->> 'alcance') = 'PROPIO' THEN
    RAISE EXCEPTION 'La consulta de cargas requiere alcance SEDE o GLOBAL';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', ca.id,
    'nombre_archivo', ca.nombre_archivo,
    'ruta_archivo', CASE
      WHEN (v_contexto ->> 'alcance') = 'GLOBAL' THEN ca.ruta_archivo
      ELSE NULL
    END,
    'hash_archivo', ca.hash_archivo,
    'formato', ca.formato,
    'mime_type', ca.mime_type,
    'tamano_bytes', ca.tamano_bytes,
    'version_plantilla', ca.version_plantilla,
    'nombre_hoja', ca.nombre_hoja,
    'fecha_desde', ca.fecha_desde,
    'fecha_hasta', ca.fecha_hasta,
    'zona_horaria', ca.zona_horaria,
    'estado_carga', ca.estado_carga,
    'total_filas', ca.total_filas,
    'total_validas', ca.total_validas,
    'total_invalidas', ca.total_invalidas,
    'total_duplicadas', ca.total_duplicadas,
    'resumen_error', ca.resumen_error,
    'id_usuario_confirma', ca.id_usuario_confirma,
    'fecha_confirmacion', ca.fecha_confirmacion,
    'id_usuario', ca.id_usuario,
    'fecha_registro', ca.fecha_registro,
    'fecha_actualizacion', ca.fecha_actualizacion
  )
  FROM public.tb_asistencia_carga ca
  WHERE (p_id IS NULL OR ca.id = p_id)
    AND (
      p_estado_carga IS NULL
      OR ca.estado_carga = UPPER(TRIM(p_estado_carga))
    )
    AND (p_fecha_desde IS NULL OR ca.fecha_hasta >= p_fecha_desde)
    AND (p_fecha_hasta IS NULL OR ca.fecha_desde <= p_fecha_hasta)
  ORDER BY ca.fecha_registro DESC, ca.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_asistencia_carga(
  p_nombre_archivo character varying,
  p_ruta_archivo character varying,
  p_hash_archivo character varying,
  p_formato character varying DEFAULT 'XLSX',
  p_mime_type character varying DEFAULT NULL,
  p_tamano_bytes bigint DEFAULT NULL,
  p_version_plantilla character varying DEFAULT NULL,
  p_nombre_hoja character varying DEFAULT NULL,
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
  v_id bigint;
  v_creado boolean := false;
  v_zona_horaria character varying;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'ASISTENCIA',
    'REGISTRAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF (v_contexto ->> 'alcance') <> 'GLOBAL' THEN
    RAISE EXCEPTION 'La importacion del archivo general requiere alcance GLOBAL';
  END IF;

  IF NULLIF(TRIM(p_nombre_archivo), '') IS NULL
     OR NULLIF(TRIM(p_ruta_archivo), '') IS NULL
     OR NULLIF(TRIM(p_hash_archivo), '') IS NULL THEN
    RAISE EXCEPTION 'Nombre, ruta y hash del archivo son obligatorios';
  END IF;

  IF LENGTH(TRIM(p_hash_archivo)) < 32 THEN
    RAISE EXCEPTION 'El hash del archivo no tiene una longitud valida';
  END IF;

  v_zona_horaria := COALESCE(
    NULLIF(TRIM(p_zona_horaria), ''),
    'America/Lima'
  );

  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_zona_horaria) THEN
    RAISE EXCEPTION 'La zona horaria indicada no existe: %', v_zona_horaria;
  END IF;

  INSERT INTO public.tb_asistencia_carga (
    nombre_archivo,
    ruta_archivo,
    hash_archivo,
    formato,
    mime_type,
    tamano_bytes,
    version_plantilla,
    nombre_hoja,
    zona_horaria,
    estado_carga,
    id_usuario
  ) VALUES (
    TRIM(p_nombre_archivo),
    TRIM(p_ruta_archivo),
    LOWER(TRIM(p_hash_archivo)),
    UPPER(TRIM(COALESCE(p_formato, 'XLSX'))),
    NULLIF(TRIM(p_mime_type), ''),
    p_tamano_bytes,
    NULLIF(TRIM(p_version_plantilla), ''),
    NULLIF(TRIM(p_nombre_hoja), ''),
    v_zona_horaria,
    'CARGADA',
    v_id_actor
  )
  ON CONFLICT (hash_archivo) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    v_creado := true;
  ELSE
    SELECT id INTO v_id
    FROM public.tb_asistencia_carga
    WHERE hash_archivo = LOWER(TRIM(p_hash_archivo));
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'id', ca.id,
      'nombre_archivo', ca.nombre_archivo,
      'hash_archivo', ca.hash_archivo,
      'estado_carga', ca.estado_carga,
      'creado', v_creado,
      'mensaje', CASE
        WHEN v_creado THEN 'Carga registrada para validacion'
        ELSE 'El archivo ya fue registrado anteriormente'
      END
    )
    FROM public.tb_asistencia_carga ca
    WHERE ca.id = v_id
  );
END;
$$;

-- ============================================================================
-- 3. VALIDACION DE FILAS NORMALIZADAS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_asistencia_carga_validar(
  p_id_carga bigint,
  p_filas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_carga public.tb_asistencia_carga%ROWTYPE;
  v_fila jsonb;
  v_numero_fila integer;
  v_codigo_huellero character varying;
  v_documento character varying;
  v_nombre character varying;
  v_fecha_hora timestamp with time zone;
  v_fecha_texto character varying;
  v_tipo character varying;
  v_id_codigo bigint;
  v_id_documento bigint;
  v_id_colaborador bigint;
  v_huella character varying;
  v_estado character varying;
  v_codigo_error character varying;
  v_mensaje_error text;
  v_total integer := 0;
  v_validas integer := 0;
  v_invalidas integer := 0;
  v_duplicadas integer := 0;
  v_fecha_desde date;
  v_fecha_hasta date;
  v_errores jsonb := '[]'::jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'ASISTENCIA',
    'REGISTRAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF (v_contexto ->> 'alcance') <> 'GLOBAL' THEN
    RAISE EXCEPTION 'La validacion del archivo general requiere alcance GLOBAL';
  END IF;

  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'Las filas deben enviarse como un arreglo JSON';
  END IF;

  IF jsonb_array_length(p_filas) = 0 THEN
    RAISE EXCEPTION 'El archivo no contiene filas para validar';
  END IF;

  SELECT * INTO v_carga
  FROM public.tb_asistencia_carga
  WHERE id = p_id_carga
  FOR UPDATE;

  IF v_carga.id IS NULL THEN
    RAISE EXCEPTION 'La carga de asistencia no existe';
  END IF;

  IF v_carga.estado_carga <> 'CARGADA' THEN
    RAISE EXCEPTION 'La carga ya fue validada, confirmada, rechazada o anulada';
  END IF;

  FOR v_fila IN SELECT value FROM jsonb_array_elements(p_filas)
  LOOP
    v_total := v_total + 1;
    v_numero_fila := NULL;
    v_codigo_huellero := NULLIF(TRIM(v_fila ->> 'codigo_huellero'), '');
    v_documento := NULLIF(TRIM(v_fila ->> 'documento'), '');
    v_nombre := NULLIF(TRIM(v_fila ->> 'nombre'), '');
    v_fecha_texto := NULLIF(TRIM(v_fila ->> 'fecha_hora'), '');
    v_fecha_hora := NULL;
    v_tipo := UPPER(COALESCE(NULLIF(TRIM(v_fila ->> 'tipo_marcacion'), ''), 'DESCONOCIDA'));
    v_id_codigo := NULL;
    v_id_documento := NULL;
    v_id_colaborador := NULL;
    v_estado := 'VALIDA';
    v_codigo_error := NULL;
    v_mensaje_error := NULL;

    BEGIN
      v_numero_fila := (v_fila ->> 'numero_fila')::integer;
      IF v_numero_fila <= 0 THEN
        RAISE EXCEPTION 'numero de fila invalido';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_numero_fila := 1000000000 + v_total;
      v_estado := 'INVALIDA';
      v_codigo_error := 'FILA_INVALIDA';
      v_mensaje_error := 'El numero de fila no es valido; se asigno un identificador tecnico';
    END;

    IF v_fecha_texto IS NULL
       OR v_fecha_texto !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
      v_estado := 'INVALIDA';
      v_codigo_error := COALESCE(v_codigo_error, 'FECHA_SIN_ZONA');
      v_mensaje_error := COALESCE(
        v_mensaje_error,
        'La fecha debe estar en formato ISO-8601 e incluir zona horaria'
      );
    ELSE
      BEGIN
        v_fecha_hora := v_fecha_texto::timestamp with time zone;
      EXCEPTION WHEN OTHERS THEN
        v_estado := 'INVALIDA';
        v_codigo_error := COALESCE(v_codigo_error, 'FECHA_INVALIDA');
        v_mensaje_error := COALESCE(v_mensaje_error, 'La fecha y hora no se pudo interpretar');
      END;
    END IF;

    IF v_tipo NOT IN ('ENTRADA', 'SALIDA', 'DESCONOCIDA') THEN
      v_tipo := 'DESCONOCIDA';
      v_estado := 'INVALIDA';
      v_codigo_error := COALESCE(v_codigo_error, 'TIPO_INVALIDO');
      v_mensaje_error := COALESCE(v_mensaje_error, 'El tipo de marcacion no es valido');
    END IF;

    IF v_codigo_huellero IS NOT NULL THEN
      SELECT c.id INTO v_id_codigo
      FROM public.tb_compensacion_colaborador c
      WHERE c.codigo_huellero = v_codigo_huellero
      LIMIT 1;
    END IF;

    IF v_documento IS NOT NULL THEN
      SELECT c.id INTO v_id_documento
      FROM public.tb_compensacion_colaborador c
      WHERE c.numero_documento = v_documento
      LIMIT 1;
    END IF;

    IF v_id_codigo IS NOT NULL
       AND v_id_documento IS NOT NULL
       AND v_id_codigo <> v_id_documento THEN
      v_estado := 'INVALIDA';
      v_codigo_error := COALESCE(v_codigo_error, 'COLABORADOR_CONFLICTO');
      v_mensaje_error := COALESCE(
        v_mensaje_error,
        'El codigo de huellero y el documento pertenecen a colaboradores distintos'
      );
    ELSE
      v_id_colaborador := COALESCE(v_id_codigo, v_id_documento);
    END IF;

    IF v_id_colaborador IS NULL THEN
      v_estado := 'INVALIDA';
      v_codigo_error := COALESCE(v_codigo_error, 'COLABORADOR_NO_IDENTIFICADO');
      v_mensaje_error := COALESCE(
        v_mensaje_error,
        'No se encontro un colaborador para el codigo o documento informado'
      );
    END IF;

    IF v_id_colaborador IS NOT NULL AND v_fecha_hora IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.tb_compensacion_asignacion a
         WHERE a.id_colaborador = v_id_colaborador
           AND a.fecha_inicio <= (v_fecha_hora AT TIME ZONE v_carga.zona_horaria)::date
           AND (
             a.fecha_fin IS NULL
             OR a.fecha_fin >= (v_fecha_hora AT TIME ZONE v_carga.zona_horaria)::date
           )
       ) THEN
      v_estado := 'INVALIDA';
      v_codigo_error := COALESCE(v_codigo_error, 'SIN_ASIGNACION');
      v_mensaje_error := COALESCE(
        v_mensaje_error,
        'El colaborador no tiene asignacion vigente para la fecha'
      );
    END IF;

    IF v_fecha_hora IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.tb_compensacion_periodo pe
      WHERE pe.estado_periodo = 'CERRADO'
        AND (v_fecha_hora AT TIME ZONE v_carga.zona_horaria)::date
            BETWEEN pe.fecha_inicio AND pe.fecha_fin
    ) THEN
      v_estado := 'INVALIDA';
      v_codigo_error := COALESCE(v_codigo_error, 'PERIODO_CERRADO');
      v_mensaje_error := COALESCE(
        v_mensaje_error,
        'La marcacion pertenece a un periodo cerrado'
      );
    END IF;

    v_huella := md5(
      COALESCE(v_id_colaborador::text, v_codigo_huellero, v_documento, 'SIN_PERSONA')
      || '|'
      || COALESCE(v_fecha_hora::text, v_fecha_texto, 'SIN_FECHA')
    );

    IF v_estado = 'VALIDA' AND EXISTS (
      SELECT 1
      FROM public.tb_asistencia_marcacion m
      WHERE m.huella_marcacion = v_huella
        AND m.estado_validacion IN ('VALIDA', 'DUPLICADA')
    ) THEN
      v_estado := 'DUPLICADA';
      v_codigo_error := 'MARCACION_DUPLICADA';
      v_mensaje_error := 'La marcacion ya existe en esta u otra carga';
    END IF;

    INSERT INTO public.tb_asistencia_marcacion (
      id_carga,
      id_colaborador,
      numero_fila,
      codigo_huellero,
      documento_origen,
      nombre_origen,
      fecha_hora_marcacion,
      fecha_hora_origen,
      tipo_marcacion,
      huella_marcacion,
      estado_validacion,
      codigo_error,
      mensaje_error,
      datos_origen,
      id_usuario
    ) VALUES (
      p_id_carga,
      v_id_colaborador,
      v_numero_fila,
      v_codigo_huellero,
      v_documento,
      v_nombre,
      v_fecha_hora,
      v_fecha_texto,
      v_tipo,
      v_huella,
      v_estado,
      v_codigo_error,
      v_mensaje_error,
      COALESCE(v_fila -> 'datos_origen', v_fila, '{}'::jsonb),
      v_id_actor
    );

    IF v_estado = 'VALIDA' THEN
      v_validas := v_validas + 1;
      v_fecha_desde := LEAST(
        COALESCE(v_fecha_desde, (v_fecha_hora AT TIME ZONE v_carga.zona_horaria)::date),
        (v_fecha_hora AT TIME ZONE v_carga.zona_horaria)::date
      );
      v_fecha_hasta := GREATEST(
        COALESCE(v_fecha_hasta, (v_fecha_hora AT TIME ZONE v_carga.zona_horaria)::date),
        (v_fecha_hora AT TIME ZONE v_carga.zona_horaria)::date
      );
    ELSIF v_estado = 'DUPLICADA' THEN
      v_duplicadas := v_duplicadas + 1;
    ELSE
      v_invalidas := v_invalidas + 1;
    END IF;

    IF v_estado <> 'VALIDA' AND jsonb_array_length(v_errores) < 500 THEN
      v_errores := v_errores || jsonb_build_array(jsonb_build_object(
        'numero_fila', v_numero_fila,
        'codigo_error', v_codigo_error,
        'mensaje', v_mensaje_error
      ));
    END IF;
  END LOOP;

  UPDATE public.tb_asistencia_carga
  SET fecha_desde = v_fecha_desde,
      fecha_hasta = v_fecha_hasta,
      estado_carga = 'VALIDADA',
      total_filas = v_total,
      total_validas = v_validas,
      total_invalidas = v_invalidas,
      total_duplicadas = v_duplicadas,
      resumen_error = v_errores,
      fecha_actualizacion = now()
  WHERE id = p_id_carga;

  RETURN jsonb_build_object(
    'id_carga', p_id_carga,
    'estado_carga', 'VALIDADA',
    'fecha_desde', v_fecha_desde,
    'fecha_hasta', v_fecha_hasta,
    'total_filas', v_total,
    'total_validas', v_validas,
    'total_invalidas', v_invalidas,
    'total_duplicadas', v_duplicadas,
    'errores', v_errores,
    'errores_truncados', v_invalidas + v_duplicadas > jsonb_array_length(v_errores)
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'El archivo contiene numeros de fila repetidos';
END;
$$;

-- ============================================================================
-- 4. VISTA PREVIA DE MARCACIONES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_asistencia_marcacion(
  p_id_carga bigint,
  p_estado_validacion character varying DEFAULT NULL,
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
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'ASISTENCIA',
    'CONSULTAR'
  );
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(
    v_contexto ->> 'id_sucursal_alcance',
    ''
  )::bigint;

  WITH base AS (
    SELECT
      m.*,
      c.nombre_completo AS colaborador_nombre,
      c.numero_documento AS colaborador_documento
    FROM public.tb_asistencia_marcacion m
    JOIN public.tb_asistencia_carga carga ON carga.id = m.id_carga
    LEFT JOIN public.tb_compensacion_colaborador c ON c.id = m.id_colaborador
    WHERE m.id_carga = p_id_carga
      AND (
        p_estado_validacion IS NULL
        OR m.estado_validacion = UPPER(TRIM(p_estado_validacion))
      )
      AND (
        p_busqueda IS NULL
        OR COALESCE(c.nombre_completo, m.nombre_origen, '')
           ILIKE '%' || TRIM(p_busqueda) || '%'
        OR COALESCE(c.numero_documento, m.documento_origen, '')
           ILIKE '%' || TRIM(p_busqueda) || '%'
        OR COALESCE(m.codigo_huellero, '') ILIKE '%' || TRIM(p_busqueda) || '%'
      )
      AND (
        v_alcance = 'GLOBAL'
        OR (
          v_alcance = 'PROPIO'
          AND m.id_colaborador = v_id_colaborador_actor
        )
        OR (
          v_alcance = 'SEDE'
          AND EXISTS (
            SELECT 1
            FROM public.tb_compensacion_asignacion a
            WHERE a.id_colaborador = m.id_colaborador
              AND a.id_sucursal = v_id_sucursal_alcance
              AND a.fecha_inicio <= COALESCE(
                (m.fecha_hora_marcacion AT TIME ZONE carga.zona_horaria)::date,
                CURRENT_DATE
              )
              AND (
                a.fecha_fin IS NULL
                OR a.fecha_fin >= COALESCE(
                  (m.fecha_hora_marcacion AT TIME ZONE carga.zona_horaria)::date,
                  CURRENT_DATE
                )
              )
          )
        )
      )
  ), conteo AS (
    SELECT COUNT(*) AS total FROM base
  ), pagina AS (
    SELECT *
    FROM base
    ORDER BY numero_fila, id
    LIMIT v_tamano
    OFFSET (v_pagina - 1) * v_tamano
  )
  SELECT
    conteo.total,
    COALESCE(jsonb_agg(to_jsonb(pagina) ORDER BY pagina.numero_fila, pagina.id)
      FILTER (WHERE pagina.id IS NOT NULL), '[]'::jsonb)
  INTO v_total, v_items
  FROM conteo
  LEFT JOIN pagina ON true
  GROUP BY conteo.total;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
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
-- 5. CONFIRMACION Y CONSOLIDACION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_asistencia_carga_confirmar(
  p_id_carga bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_carga public.tb_asistencia_carga%ROWTYPE;
  v_resultado jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'ASISTENCIA',
    'REVISAR'
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF (v_contexto ->> 'alcance') <> 'GLOBAL' THEN
    RAISE EXCEPTION 'La confirmacion del archivo general requiere alcance GLOBAL';
  END IF;

  SELECT * INTO v_carga
  FROM public.tb_asistencia_carga
  WHERE id = p_id_carga
  FOR UPDATE;

  IF v_carga.id IS NULL THEN
    RAISE EXCEPTION 'La carga de asistencia no existe';
  END IF;

  IF v_carga.estado_carga = 'CONFIRMADA' THEN
    RETURN jsonb_build_object(
      'id_carga', v_carga.id,
      'estado_carga', v_carga.estado_carga,
      'confirmada', false,
      'mensaje', 'La carga ya se encontraba confirmada'
    );
  END IF;

  IF v_carga.estado_carga <> 'VALIDADA' THEN
    RAISE EXCEPTION 'Solo una carga validada puede confirmarse';
  END IF;

  IF v_carga.total_validas = 0 THEN
    RAISE EXCEPTION 'La carga no contiene marcaciones validas para confirmar';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_compensacion_periodo pe
    WHERE pe.estado_periodo = 'CERRADO'
      AND daterange(pe.fecha_inicio, pe.fecha_fin, '[]')
          && daterange(v_carga.fecha_desde, v_carga.fecha_hasta, '[]')
  ) THEN
    RAISE EXCEPTION 'La carga alcanza un periodo cerrado';
  END IF;

  UPDATE public.tb_asistencia_carga
  SET estado_carga = 'CONFIRMADA',
      id_usuario_confirma = v_id_actor,
      fecha_confirmacion = now(),
      fecha_actualizacion = now()
  WHERE id = p_id_carga;

  v_resultado := public.f_private_asistencia_consolidar_carga(
    p_id_carga,
    v_id_actor
  );

  RETURN jsonb_build_object(
    'id_carga', p_id_carga,
    'estado_carga', 'CONFIRMADA',
    'confirmada', true,
    'total_validas', v_carga.total_validas,
    'total_invalidas', v_carga.total_invalidas,
    'total_duplicadas', v_carga.total_duplicadas,
    'consolidacion', v_resultado,
    'mensaje', 'Carga confirmada y jornadas consolidadas'
  );
END;
$$;

-- ============================================================================
-- 6. CONSULTA DE JORNADAS CONSOLIDADAS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_asistencia_jornada(
  p_fecha_desde date,
  p_fecha_hasta date,
  p_id_colaborador bigint DEFAULT NULL,
  p_id_sucursal bigint DEFAULT NULL,
  p_estado_dia character varying DEFAULT NULL,
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
  IF p_fecha_desde IS NULL OR p_fecha_hasta IS NULL THEN
    RAISE EXCEPTION 'El rango de fechas es obligatorio';
  END IF;

  IF p_fecha_hasta < p_fecha_desde THEN
    RAISE EXCEPTION 'La fecha hasta no puede ser anterior a la fecha desde';
  END IF;

  v_contexto := public.f_private_compensacion_contexto(
    'ASISTENCIA',
    'CONSULTAR'
  );
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(
    v_contexto ->> 'id_sucursal_alcance',
    ''
  )::bigint;

  IF v_alcance = 'PROPIO'
     AND p_id_colaborador IS NOT NULL
     AND p_id_colaborador IS DISTINCT FROM v_id_colaborador_actor THEN
    RAISE EXCEPTION 'Solo puede consultar su propia asistencia';
  END IF;

  WITH base AS (
    SELECT
      aj.*,
      c.nombre_completo AS colaborador_nombre,
      c.numero_documento AS colaborador_documento,
      a.id_sucursal,
      s.nombre AS sucursal_nombre,
      a.id_cargo,
      ca.nombre AS cargo_nombre
    FROM public.tb_asistencia_jornada aj
    JOIN public.tb_compensacion_colaborador c ON c.id = aj.id_colaborador
    JOIN public.tb_compensacion_asignacion a ON a.id = aj.id_asignacion
    JOIN public.tb_sucursal s ON s.id = a.id_sucursal
    JOIN public.tb_compensacion_cargo ca ON ca.id = a.id_cargo
    WHERE aj.fecha BETWEEN p_fecha_desde AND p_fecha_hasta
      AND (p_id_colaborador IS NULL OR aj.id_colaborador = p_id_colaborador)
      AND (p_id_sucursal IS NULL OR a.id_sucursal = p_id_sucursal)
      AND (p_estado_dia IS NULL OR aj.estado_dia = UPPER(TRIM(p_estado_dia)))
      AND (
        p_busqueda IS NULL
        OR c.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR c.numero_documento ILIKE '%' || TRIM(p_busqueda) || '%'
      )
      AND (
        v_alcance = 'GLOBAL'
        OR (v_alcance = 'SEDE' AND a.id_sucursal = v_id_sucursal_alcance)
        OR (v_alcance = 'PROPIO' AND aj.id_colaborador = v_id_colaborador_actor)
      )
  ), conteo AS (
    SELECT COUNT(*) AS total FROM base
  ), resumen AS (
    SELECT jsonb_build_object(
      'integrantes', COUNT(DISTINCT id_colaborador),
      'jornadas', COUNT(*),
      'tardanzas', COUNT(*) FILTER (WHERE minutos_tardanza > 0),
      'faltas_entrada', COUNT(*) FILTER (WHERE estado_dia = 'FALTA_ENTRADA'),
      'faltas_salida', COUNT(*) FILTER (WHERE estado_dia = 'FALTA_SALIDA'),
      'ausencias', COUNT(*) FILTER (WHERE estado_dia = 'AUSENTE'),
      'dias_completos', COUNT(*) FILTER (WHERE estado_dia = 'COMPLETO'),
      'pendientes', COUNT(*) FILTER (WHERE estado_dia = 'PENDIENTE')
    ) AS datos
    FROM base
  ), pagina AS (
    SELECT *
    FROM base
    ORDER BY fecha DESC, colaborador_nombre, id
    LIMIT v_tamano
    OFFSET (v_pagina - 1) * v_tamano
  )
  SELECT
    conteo.total,
    resumen.datos,
    COALESCE(jsonb_agg(to_jsonb(pagina) ORDER BY pagina.fecha DESC,
      pagina.colaborador_nombre, pagina.id)
      FILTER (WHERE pagina.id IS NOT NULL), '[]'::jsonb)
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
-- 7. PERMISOS DE EJECUCION
-- ============================================================================

REVOKE ALL ON FUNCTION public.f_get_tb_asistencia_carga(
  bigint, character varying, date, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_asistencia_carga(
  bigint, character varying, date, date
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_asistencia_carga(
  character varying, character varying, character varying, character varying,
  character varying, bigint, character varying, character varying,
  character varying
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_asistencia_carga(
  character varying, character varying, character varying, character varying,
  character varying, bigint, character varying, character varying,
  character varying
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_asistencia_carga_validar(
  bigint, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_asistencia_carga_validar(
  bigint, jsonb
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_asistencia_marcacion(
  bigint, character varying, character varying, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_asistencia_marcacion(
  bigint, character varying, character varying, integer, integer
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_asistencia_carga_confirmar(
  bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_asistencia_carga_confirmar(
  bigint
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_asistencia_jornada(
  date, date, bigint, bigint, character varying, character varying,
  integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_asistencia_jornada(
  date, date, bigint, bigint, character varying, character varying,
  integer, integer
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
  'f_private_asistencia_consolidar_carga',
  'f_get_tb_asistencia_carga',
  'f_post_tb_asistencia_carga',
  'f_post_tb_asistencia_carga_validar',
  'f_get_tb_asistencia_marcacion',
  'f_post_tb_asistencia_carga_confirmar',
  'f_get_tb_asistencia_jornada'
)
ORDER BY n.nspname, p.proname;
