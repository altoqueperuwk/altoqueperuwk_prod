-- 91_reversa_clientes.sql
-- Las 5 funciones de clientes tal como estaban en producción antes del pase (leídas el 25/11).

BEGIN;
DO $guard$
BEGIN
    IF coalesce(current_setting('app.confirmar_reversa_compensaciones', true), '') <> 'si' THEN
        RAISE EXCEPTION 'Confirma la reversa con: SET app.confirmar_reversa_compensaciones = ''si'';';
    END IF;
END
$guard$;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.f_post_tb_cliente(p_tipo_documento bigint, p_numero_documento character varying, p_nombre character varying DEFAULT NULL::character varying, p_celular bigint DEFAULT NULL::bigint, p_id_comunidad bigint DEFAULT NULL::bigint, p_id_estado bigint DEFAULT NULL::bigint, p_id_usuario bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '10min'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_cliente(p_id bigint, p_tipo_documento bigint DEFAULT NULL::bigint, p_numero_documento character varying DEFAULT NULL::character varying, p_nombre character varying DEFAULT NULL::character varying, p_celular bigint DEFAULT NULL::bigint, p_id_comunidad bigint DEFAULT NULL::bigint, p_id_estado bigint DEFAULT NULL::bigint, p_id_usuario bigint DEFAULT NULL::bigint, p_flag_limpiar_celular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '10min'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.f_post_tb_cliente_carga_masiva(p_datos_clientes_json jsonb, p_id_usuario bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '10min'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_cliente_comision_recurrente(p_id bigint, p_comision_servicio_recurrente numeric DEFAULT NULL::numeric, p_comision_monto_extra_servicio_recurrente numeric DEFAULT NULL::numeric, p_id_usuario bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '10min'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_comision_recurrente(p_id bigint, p_tipo_comision character varying, p_valor numeric DEFAULT NULL::numeric, p_limpiar boolean DEFAULT false, p_ruta_actual character varying DEFAULT NULL::character varying, p_id_usuario_gestor bigint DEFAULT NULL::bigint, p_nombre_usuario_gestor character varying DEFAULT NULL::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '10min'
AS $function$
DECLARE
  v_op record;
  v_cliente_id bigint;
  v_regla record;
  v_calc jsonb;
  v_calc_ing jsonb;
  v_calc_sal jsonb;
  v_sync_result jsonb;
  v_tipo character varying := LOWER(BTRIM(COALESCE(p_tipo_comision, '')));
BEGIN
  SELECT * INTO v_op FROM public.tb_operacion_proceso WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'La operacion no existe.'); END IF;
  IF UPPER(BTRIM(COALESCE(v_op.tipo_servicio, ''))) <> 'EFECTIVIZACION'
     OR LOWER(BTRIM(COALESCE(v_op.ruta_origen, v_op.ruta_destino, ''))) NOT IN ('bcp','bbva','scotiabank','banbif','interbank','safetypay') THEN
    RETURN jsonb_build_object('error', 'La comision recurrente solo aplica a Efectivizacion bancaria.');
  END IF;
  IF UPPER(BTRIM(COALESCE(v_op.nombre_estado, ''))) IN ('PAGADO','ELIMINADO') OR COALESCE(v_op.flag_retenido, false) THEN
    RETURN jsonb_build_object('error', 'La operacion no permite modificar comisiones recurrentes.');
  END IF;
  IF COALESCE(v_op.flag_derivado, false) AND p_ruta_actual IS NOT NULL
     AND LOWER(BTRIM(COALESCE(v_op.ruta_origen, ''))) = LOWER(BTRIM(p_ruta_actual))
     AND LOWER(BTRIM(COALESCE(v_op.ruta_destino, ''))) <> LOWER(BTRIM(p_ruta_actual)) THEN
    RETURN jsonb_build_object('error', 'La operacion derivada esta congelada en la ruta de origen.');
  END IF;
  IF v_tipo NOT IN ('especial','extra') THEN RETURN jsonb_build_object('error', 'Tipo de comision recurrente invalido.'); END IF;
  IF NOT p_limpiar AND p_valor IS NULL THEN RETURN jsonb_build_object('error', 'Ingresa un valor o utiliza la opcion de limpiar.'); END IF;
  IF NOT p_limpiar AND p_valor < 0 THEN RETURN jsonb_build_object('error', 'La comision recurrente debe ser mayor o igual a 0.'); END IF;
  IF v_tipo = 'extra' AND NOT p_limpiar AND p_valor <> trunc(p_valor) THEN RETURN jsonb_build_object('error', 'La comision extra recurrente debe ser un monto entero en soles.'); END IF;
  v_cliente_id := v_op.id_cliente;
  IF v_cliente_id IS NULL THEN
    SELECT c.id INTO v_cliente_id
    FROM public.tb_cliente c
    WHERE c.numero_documento = REGEXP_REPLACE(COALESCE(v_op.dni_cliente, ''), '[^0-9]', '', 'g')
      AND c.tipo_documento = CASE WHEN LENGTH(REGEXP_REPLACE(COALESCE(v_op.dni_cliente, ''), '[^0-9]', '', 'g')) = 9 THEN 2 ELSE 1 END
    LIMIT 1;
  END IF;
  IF v_cliente_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.tb_cliente WHERE id = v_cliente_id) THEN
    RETURN jsonb_build_object('error', 'La operacion no tiene un cliente relacionado.');
  END IF;

  SELECT r.* INTO v_regla
  FROM public.tb_reglas_efectivizacion r
  WHERE r.id_codigo_servicio = v_op.id_codigo_servicio
    AND r.id_banco = v_op.id_banco_empresa_cuenta_ingreso
    AND r.id_comunidad = v_op.id_comunidad
    AND (v_op.nombre_tipo_deposito IS NULL OR r.tipo_deposito = v_op.nombre_tipo_deposito)
    AND r.id_estado = (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1)
  LIMIT 1;
  IF v_regla.id IS NULL THEN RETURN jsonb_build_object('error', 'No se encontro una regla activa para recalcular la operacion.'); END IF;

  IF v_tipo = 'especial' THEN
    UPDATE public.tb_cliente SET comision_servicio_recurrente = CASE WHEN p_limpiar THEN NULL ELSE p_valor END, id_usuario = COALESCE(p_id_usuario_gestor, id_usuario) WHERE id = v_cliente_id;
  ELSE
    UPDATE public.tb_cliente SET comision_monto_extra_servicio_recurrente = CASE WHEN p_limpiar THEN NULL ELSE p_valor END, id_usuario = COALESCE(p_id_usuario_gestor, id_usuario) WHERE id = v_cliente_id;
  END IF;

  v_calc := public.f_get_tb_operacion_comision_efectivizacion_cliente(v_cliente_id, COALESCE(v_op.monto_deposito_cliente,0), v_regla.comision_servicio, v_regla.monto_minimo_deposito_servicio, v_regla.comision_minima_servicio);
  v_calc_ing := public.f_get_tb_operacion_calculo_comision_banco_ingreso(COALESCE(v_op.flag_por_sol_comision_banco_ingreso,false), COALESCE(v_op.monto_deposito_cliente,0), COALESCE(v_op.comision_banco_ingreso,0), COALESCE(v_op.comision_minimo_banco_ingreso,0), COALESCE(v_op.comision_igv_banco_ingreso,0), COALESCE(v_op.monto_itf_ingreso,0));
  v_calc_sal := public.f_get_tb_operacion_calculo_comision_banco_salida((v_calc->>'monto_transferencia_cliente')::numeric, COALESCE(v_op.comision_transf_banco_salida,0), COALESCE(v_op.comision_transf_inter_banco_salida,0), COALESCE(v_op.monto_itf_salida,0), v_op.id_empresa_salida, v_op.id_empresa_cuenta_salida, v_op.id_banco_empresa_cuenta_salida, v_op.id_banco_cliente_transferencia);
  UPDATE public.tb_operacion_proceso SET
    comision_servicio = (v_calc->>'comision_servicio')::numeric,
    monto_minimo_deposito_servicio = (v_calc->>'monto_minimo_deposito_servicio')::numeric,
    comision_minima_servicio = (v_calc->>'comision_minima_servicio')::numeric,
    comision_monto_extra_servicio = (v_calc->>'comision_monto_extra_servicio')::numeric,
    resultado_comision_servicio = (v_calc->>'resultado_comision_servicio')::numeric,
    monto_transferencia_cliente = (v_calc->>'monto_transferencia_cliente')::numeric,
    resultado_comision_banco_ingreso = (v_calc_ing->>'resultado_comision_banco_ingreso')::numeric,
    resultado_comision_banco_salida = (v_calc_sal->>'resultado_comision_banco_salida')::numeric,
    id_usuario = COALESCE(p_id_usuario_gestor,id_usuario), nombre_usuario = COALESCE(p_nombre_usuario_gestor,nombre_usuario)
  WHERE id = p_id;

  v_sync_result := public.f_post_tb_operacion_caja_desde_proceso(
    p_id_operacion_proceso := p_id,
    p_tipo_origen := NULL,
    p_tipo_movimiento := 'INGRESO',
    p_id_usuario := COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
    p_id_estado := v_op.id_estado
  );
  IF v_sync_result ? 'error' THEN
    RAISE EXCEPTION '%', v_sync_result->>'error';
  END IF;

  IF UPPER(COALESCE(v_op.nombre_estado, '')) = 'PAGADO'
     OR EXISTS (SELECT 1 FROM public.tb_operacion_caja c WHERE c.id_operacion_proceso = p_id AND c.tipo_movimiento = 'SALIDA') THEN
    v_sync_result := public.f_post_tb_operacion_caja_desde_proceso(
      p_id_operacion_proceso := p_id,
      p_tipo_origen := NULL,
      p_tipo_movimiento := 'SALIDA',
      p_id_usuario := COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario),
      p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
      p_id_estado := v_op.id_estado
    );
    IF v_sync_result ? 'error' THEN
      RAISE EXCEPTION '%', v_sync_result->>'error';
    END IF;
  END IF;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(COALESCE(v_op.ruta_destino, v_op.ruta_origen), COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario));
  RETURN (SELECT x FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x LIMIT 1);
END;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
