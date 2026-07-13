-- ============================================================================
-- 13. PAGO DEUDA
-- ============================================================================

/*
Funcion: f_get_tb_pago_deuda
Objetivo:
  Listar operaciones del flujo Pago Deuda directamente desde
  `tb_operacion_proceso`, usando el servicio configurado para ese
  modulo.

Diseno compacto:
  - no usa tablas intermedias
  - no usa cajas
  - reutiliza el snapshot ya congelado en `tb_operacion_proceso`
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_pago_deuda(
  p_id bigint DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_codigo_operacion character varying DEFAULT NULL,
  p_fecha_desde timestamp with time zone DEFAULT NULL,
  p_fecha_hasta timestamp with time zone DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_id_usuario_solicitud bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_id_codigo_servicio_pago_deuda bigint;
BEGIN
  SELECT cs.id
  INTO v_id_codigo_servicio_pago_deuda
  FROM public.tb_codigo_servicio cs
  WHERE UPPER(COALESCE(cs.nombre, '')) LIKE '%PAGO%DEUDA%'
  ORDER BY cs.id
  LIMIT 1;

  IF v_id_codigo_servicio_pago_deuda IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', op.id,
    'codigo_operacion_deposito_cliente', op.codigo_operacion_deposito_cliente,
    'id_codigo_servicio', op.id_codigo_servicio,
    'nombre_codigo_servicio', op.nombre_codigo_servicio,
    'id_cliente', op.id_cliente,
    'dni_cliente', op.dni_cliente,
    'nombre_cliente', op.nombre_cliente,
    'id_banco_cliente', op.id_banco_cliente,
    'nombre_banco_cliente', op.nombre_banco_cliente,
    'monto_deposito_cliente', op.monto_deposito_cliente,
    'id_empresa_ingreso', op.id_empresa_ingreso,
    'nombre_empresa_ingreso', op.nombre_empresa_ingreso,
    'id_empresa_cuenta_ingreso', op.id_empresa_cuenta_ingreso,
    'id_empresa_salida', op.id_empresa_salida,
    'nombre_empresa_salida', op.nombre_empresa_salida,
    'id_empresa_cuenta_salida', op.id_empresa_cuenta_salida,
    'id_banco_empresa_cuenta_salida', op.id_banco_empresa_cuenta_salida,
    'nombre_banco_empresa_cuenta_salida', op.nombre_banco_empresa_cuenta_salida,
    'resultado_comision_banco_ingreso', op.resultado_comision_banco_ingreso,
    'resultado_comision_banco_salida', op.resultado_comision_banco_salida,
    'comision_servicio', op.comision_servicio,
    'monto_minimo_deposito_servicio', op.monto_minimo_deposito_servicio,
    'comision_minima_servicio', op.comision_minima_servicio,
    'comision_monto_extra_servicio', op.comision_monto_extra_servicio,
    'resultado_comision_servicio', op.resultado_comision_servicio,
    'monto_transferencia_cliente', op.monto_transferencia_cliente,
    'id_estado', op.id_estado,
    'nombre_estado', op.nombre_estado,
    'id_usuario', op.id_usuario,
    'nombre_usuario', op.nombre_usuario,
    'id_usuario_gestor', op.id_usuario_gestor,
    'nombre_usuario_gestor', op.nombre_usuario_gestor,
    'id_usuario_reasignado', op.id_usuario_reasignado,
    'nombre_usuario_reasignado', op.nombre_usuario_reasignado,
    'id_usuario_solicitud', op.id_usuario_solicitud,
    'nombre_usuario_solicitud', op.nombre_usuario_solicitud,
    'fecha_pendiente', op.fecha_pendiente,
    'fecha_pagado', op.fecha_pagado,
    'error_motivo', op.error_motivo,
    'observacion_tiempo', op.observacion_tiempo,
    'fecha_registro', op.fecha_registro
  )
  FROM public.tb_operacion_proceso op
  WHERE op.id_codigo_servicio = v_id_codigo_servicio_pago_deuda
    AND (p_id IS NULL OR op.id = p_id)
    AND (p_dni_cliente IS NULL OR op.dni_cliente ILIKE '%' || p_dni_cliente || '%')
    AND (p_id_estado IS NULL OR op.id_estado = p_id_estado)
    AND (p_codigo_operacion IS NULL OR op.codigo_operacion_deposito_cliente ILIKE '%' || p_codigo_operacion || '%')
    AND (p_fecha_desde IS NULL OR op.fecha_registro >= p_fecha_desde)
    AND (p_fecha_hasta IS NULL OR op.fecha_registro <= p_fecha_hasta)
    AND (p_id_usuario_gestor IS NULL OR op.id_usuario_gestor = p_id_usuario_gestor)
    AND (p_id_usuario_solicitud IS NULL OR op.id_usuario_solicitud = p_id_usuario_solicitud)
  ORDER BY op.id DESC;
END;
$$;

/*
Funcion: f_get_tb_pago_deuda_match
Objetivo:
  Buscar candidatos de efectivizacion para hacer match con una solicitud de
  Pago Deuda.

Reglas:
  - excluye operaciones que ya son Pago Deuda
  - busca por DNI y monto
  - por defecto privilegia la fecha actual
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_pago_deuda_match(
  p_id_operacion_pago_deuda bigint DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_monto_deposito_cliente bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_id_codigo_servicio_pago_deuda bigint;
  v_dni_cliente character varying;
  v_monto_deposito_cliente bigint;
BEGIN
  SELECT cs.id
  INTO v_id_codigo_servicio_pago_deuda
  FROM public.tb_codigo_servicio cs
  WHERE UPPER(COALESCE(cs.nombre, '')) LIKE '%PAGO%DEUDA%'
  ORDER BY cs.id
  LIMIT 1;

  IF p_id_operacion_pago_deuda IS NOT NULL THEN
    SELECT op.dni_cliente, op.monto_deposito_cliente
    INTO v_dni_cliente, v_monto_deposito_cliente
    FROM public.tb_operacion_proceso op
    WHERE op.id = p_id_operacion_pago_deuda
    LIMIT 1;
  ELSE
    v_dni_cliente := p_dni_cliente;
    v_monto_deposito_cliente := p_monto_deposito_cliente;
  END IF;

  IF COALESCE(v_dni_cliente, '') = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', op.id,
    'codigo_operacion_deposito_cliente', op.codigo_operacion_deposito_cliente,
    'dni_cliente', op.dni_cliente,
    'nombre_cliente', op.nombre_cliente,
    'monto_deposito_cliente', op.monto_deposito_cliente,
    'nombre_banco_cliente', op.nombre_banco_cliente,
    'nombre_codigo_servicio', op.nombre_codigo_servicio,
    'id_estado', op.id_estado,
    'nombre_estado', op.nombre_estado,
    'fecha_registro', op.fecha_registro
  )
  FROM public.tb_operacion_proceso op
  JOIN public.tb_estado e ON op.id_estado = e.id
  WHERE op.dni_cliente = v_dni_cliente
    AND (v_monto_deposito_cliente IS NULL OR op.monto_deposito_cliente = v_monto_deposito_cliente)
    AND (v_id_codigo_servicio_pago_deuda IS NULL OR op.id_codigo_servicio <> v_id_codigo_servicio_pago_deuda)
    AND UPPER(COALESCE(e.nombre, '')) = 'PENDIENTE'
    AND op.id_empresa_ingreso IS NOT NULL
  ORDER BY
    CASE WHEN op.fecha_registro::date = CURRENT_DATE THEN 0 ELSE 1 END,
    op.fecha_registro DESC
  LIMIT 20;
END;
$$;

/*
Funcion: f_post_tb_pago_deuda_solicitud
Objetivo:
  Crear o actualizar la solicitud inicial de Pago Deuda.

Snapshot:
  - `id_usuario` registra quien crea el registro
  - `id_usuario_solicitud` marca el origen de la solicitud
  - `id_usuario_gestor` marca el responsable actual de bandeja
  - `ruta_origen` conserva el modulo donde nacio la solicitud
  - `ruta_destino` queda disponible para congelar la ruta que finalmente la
    atiende cuando se seleccione la salida
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_pago_deuda_solicitud(
  p_id_usuario bigint,
  p_dni_cliente character varying,
  p_nombre_cliente character varying,
  p_id_banco_cliente bigint,
  p_nombre_banco_cliente character varying,
  p_monto_deposito_cliente bigint,
  p_celular_cliente character varying DEFAULT NULL,
  p_id_operacion bigint DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL,
  p_id_usuario_solicitud bigint DEFAULT NULL,
  p_nombre_usuario_solicitud character varying DEFAULT NULL,
  p_ruta_origen character varying DEFAULT NULL,
  p_ruta_destino character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_regla record;
  v_cliente_id bigint;
  v_cliente_nombre character varying;
  v_dni_parseado character varying;
  v_tipo_doc character varying;
  v_estado_pendiente_id bigint;
  v_estado_pendiente_nombre character varying;
  v_username character varying;
  v_codigo_servicio_id bigint;
  v_codigo_servicio_nombre character varying;
  v_codigo_operacion character varying;
  v_new_id bigint;
  v_calc_serv jsonb;
  v_result jsonb;
  v_nombre_usuario_gestor character varying;
  v_nombre_usuario_solicitud character varying;
  v_ruta_kpi_actual character varying;
  v_ruta_kpi_final character varying;
BEGIN
  SELECT valor, tipo
  INTO v_dni_parseado, v_tipo_doc
  FROM public.f_get_tb_parse_documento(p_dni_cliente);

  SELECT id, nombre
  INTO v_cliente_id, v_cliente_nombre
  FROM public.tb_cliente
  WHERE dni = v_dni_parseado
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    SELECT x.id, x.nombre
    INTO v_cliente_id, v_cliente_nombre
    FROM jsonb_to_record(
      public.f_post_tb_cliente(
        p_dni := v_dni_parseado,
        p_nombre := p_nombre_cliente,
        p_celular := p_celular_cliente,
        p_id_estado := (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1),
        p_id_usuario := p_id_usuario
      )
    ) AS x(id bigint, nombre character varying);
  ELSIF COALESCE(p_celular_cliente, '') <> '' THEN
    UPDATE public.tb_cliente
    SET celular = p_celular_cliente
    WHERE id = v_cliente_id;
  END IF;

  SELECT cs.id, cs.nombre
  INTO v_codigo_servicio_id, v_codigo_servicio_nombre
  FROM public.tb_codigo_servicio cs
  WHERE UPPER(COALESCE(cs.nombre, '')) LIKE '%PAGO%DEUDA%'
  ORDER BY cs.id
  LIMIT 1;

  IF v_codigo_servicio_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro el servicio Pago Deuda.');
  END IF;

  SELECT r.*
  INTO v_regla
  FROM public.tb_reglas_efectivizacion r
  WHERE r.id_codigo_servicio = v_codigo_servicio_id
    AND r.id_banco = p_id_banco_cliente
    AND r.id_estado = (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1)
  ORDER BY r.id
  LIMIT 1;

  IF v_regla.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro una regla activa de Pago Deuda para el banco seleccionado.');
  END IF;

  SELECT id, nombre
  INTO v_estado_pendiente_id, v_estado_pendiente_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PENDIENTE'
  LIMIT 1;

  SELECT username
  INTO v_username
  FROM public.tb_usuario
  WHERE id = p_id_usuario;

  IF v_username IS NULL THEN
    v_username := 'Sistema';
  END IF;

  IF p_id_usuario_gestor IS NOT NULL AND p_nombre_usuario_gestor IS NULL THEN
    SELECT username
    INTO v_nombre_usuario_gestor
    FROM public.tb_usuario
    WHERE id = p_id_usuario_gestor;
  ELSE
    v_nombre_usuario_gestor := p_nombre_usuario_gestor;
  END IF;

  IF p_id_usuario_solicitud IS NOT NULL AND p_nombre_usuario_solicitud IS NULL THEN
    SELECT username
    INTO v_nombre_usuario_solicitud
    FROM public.tb_usuario
    WHERE id = p_id_usuario_solicitud;
  ELSE
    v_nombre_usuario_solicitud := p_nombre_usuario_solicitud;
  END IF;

  v_calc_serv := public.f_get_tb_operacion_calculo_comision_servicio(
    p_monto_deposito_cliente,
    v_regla.comision_servicio,
    v_regla.monto_minimo_deposito_servicio,
    v_regla.comision_minima_servicio,
    0
  );

  IF p_id_operacion IS NULL THEN
    v_codigo_operacion := LPAD(FLOOR(RANDOM() * 100000)::text, 5, '0');

    INSERT INTO public.tb_operacion_proceso (
      codigo_operacion_deposito_cliente,
      id_codigo_servicio,
      nombre_codigo_servicio,
      id_comunidad,
      nombre_comunidad,
      id_tipo_deposito,
      nombre_tipo_deposito,
      id_cliente,
      dni_cliente,
      nombre_cliente,
      id_banco_cliente,
      nombre_banco_cliente,
      monto_deposito_cliente,
      comision_servicio,
      monto_minimo_deposito_servicio,
      comision_minima_servicio,
      comision_monto_extra_servicio,
      resultado_comision_servicio,
      id_banco_cliente_transferencia,
      nombre_banco_cliente_transferencia,
      id_estado,
      nombre_estado,
      id_usuario,
      nombre_usuario,
      id_usuario_gestor,
      nombre_usuario_gestor,
      id_usuario_solicitud,
      nombre_usuario_solicitud,
      ruta_origen,
      ruta_destino,
      fecha_pendiente
    )
    VALUES (
      v_codigo_operacion,
      v_codigo_servicio_id,
      v_codigo_servicio_nombre,
      v_regla.id_comunidad,
      (SELECT nombre FROM public.tb_comunidad WHERE id = v_regla.id_comunidad LIMIT 1),
      v_regla.tipo_deposito,
      NULL,
      v_cliente_id,
      v_dni_parseado,
      COALESCE(v_cliente_nombre, p_nombre_cliente),
      p_id_banco_cliente,
      p_nombre_banco_cliente,
      p_monto_deposito_cliente,
      v_regla.comision_servicio,
      v_regla.monto_minimo_deposito_servicio,
      v_regla.comision_minima_servicio,
      0,
      (v_calc_serv->>'resultado_comision_servicio')::numeric,
      p_id_banco_cliente,
      p_nombre_banco_cliente,
      v_estado_pendiente_id,
      v_estado_pendiente_nombre,
      p_id_usuario,
      v_username,
      COALESCE(p_id_usuario_gestor, p_id_usuario),
      COALESCE(v_nombre_usuario_gestor, v_username),
      COALESCE(p_id_usuario_solicitud, p_id_usuario),
      COALESCE(v_nombre_usuario_solicitud, v_username),
      p_ruta_origen,
      p_ruta_destino,
      NOW()
    )
    RETURNING id INTO v_new_id;

    v_ruta_kpi_final := COALESCE(p_ruta_destino, p_ruta_origen);
  ELSE
    SELECT COALESCE(op.ruta_destino, op.ruta_origen)
    INTO v_ruta_kpi_actual
    FROM public.tb_operacion_proceso op
    WHERE op.id = p_id_operacion
    LIMIT 1;

    UPDATE public.tb_operacion_proceso
    SET id_comunidad = v_regla.id_comunidad,
        nombre_comunidad = (SELECT nombre FROM public.tb_comunidad WHERE id = v_regla.id_comunidad LIMIT 1),
        id_tipo_deposito = v_regla.tipo_deposito,
        id_cliente = v_cliente_id,
        dni_cliente = v_dni_parseado,
        nombre_cliente = COALESCE(v_cliente_nombre, p_nombre_cliente),
        id_banco_cliente = p_id_banco_cliente,
        nombre_banco_cliente = p_nombre_banco_cliente,
        monto_deposito_cliente = p_monto_deposito_cliente,
        comision_servicio = v_regla.comision_servicio,
        monto_minimo_deposito_servicio = v_regla.monto_minimo_deposito_servicio,
        comision_minima_servicio = v_regla.comision_minima_servicio,
        resultado_comision_servicio = (v_calc_serv->>'resultado_comision_servicio')::numeric,
        id_banco_cliente_transferencia = p_id_banco_cliente,
        nombre_banco_cliente_transferencia = p_nombre_banco_cliente,
        id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
        nombre_usuario_gestor = COALESCE(v_nombre_usuario_gestor, nombre_usuario_gestor),
        id_usuario_solicitud = COALESCE(p_id_usuario_solicitud, id_usuario_solicitud),
        nombre_usuario_solicitud = COALESCE(v_nombre_usuario_solicitud, nombre_usuario_solicitud),
        ruta_origen = COALESCE(p_ruta_origen, ruta_origen),
        ruta_destino = COALESCE(p_ruta_destino, ruta_destino)
    WHERE id = p_id_operacion;

    v_new_id := p_id_operacion;
    v_ruta_kpi_final := COALESCE(p_ruta_destino, p_ruta_origen, v_ruta_kpi_actual);
  END IF;

  IF v_ruta_kpi_actual IS NOT NULL THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi_actual, p_id_usuario);
  END IF;
  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi_final, p_id_usuario);

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_proceso(p_id := v_new_id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_salida
Objetivo:
  Asignar la empresa/cuenta de salida y congelar el snapshot de salida para
  Pago Deuda, sin tocar caja ni movimientos contables. En esta fase tambien
  puede congelar la ruta operativa final que atendera la salida.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_salida(
  p_id_operacion bigint,
  p_id_empresa_salida bigint,
  p_id_empresa_cuenta_salida bigint,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL,
  p_ruta_destino character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_op record;
  v_cuenta record;
  v_calc_sal jsonb;
  v_result jsonb;
  v_ruta_kpi_actual character varying;
  v_ruta_kpi_final character varying;
BEGIN
  SELECT *
  INTO v_op
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion no encontrada.');
  END IF;

  v_ruta_kpi_actual := COALESCE(v_op.ruta_destino, v_op.ruta_origen);

  SELECT
    ecb.id,
    ecb.id_banco,
    ecb.id_empresa,
    e.nombre AS empresa_nombre,
    b.nombre AS banco_nombre,
    ecb.comision_itf_ingreso_salida,
    ecb.comision_transf_banco_salida,
    ecb.comision_transf_inter_banco_salida
  INTO v_cuenta
  FROM public.tb_empresa_cuenta_bancaria ecb
  JOIN public.tb_empresa e ON ecb.id_empresa = e.id
  JOIN public.tb_banco b ON ecb.id_banco = b.id
  WHERE ecb.id = p_id_empresa_cuenta_salida
    AND ecb.id_empresa = p_id_empresa_salida
  LIMIT 1;

  IF v_cuenta.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Cuenta de salida no encontrada.');
  END IF;

  v_calc_sal := public.f_get_tb_operacion_calculo_comision_banco_salida(
    COALESCE(v_op.monto_deposito_cliente, 0),
    COALESCE(v_cuenta.comision_transf_banco_salida, 0),
    COALESCE(v_cuenta.comision_transf_inter_banco_salida, 0),
    COALESCE(v_cuenta.comision_itf_ingreso_salida, 0),
    p_id_empresa_salida := p_id_empresa_salida,
    p_id_empresa_cuenta_salida := p_id_empresa_cuenta_salida,
    p_id_banco_empresa_cuenta_salida := v_cuenta.id_banco,
    p_id_banco_cliente_transferencia := v_op.id_banco_cliente
  );

  UPDATE public.tb_operacion_proceso
  SET id_empresa_salida = p_id_empresa_salida,
      nombre_empresa_salida = v_cuenta.empresa_nombre,
      id_empresa_cuenta_salida = p_id_empresa_cuenta_salida,
      id_banco_empresa_cuenta_salida = v_cuenta.id_banco,
      nombre_banco_empresa_cuenta_salida = v_cuenta.banco_nombre,
      comision_transf_banco_salida = COALESCE(v_cuenta.comision_transf_banco_salida, 0),
      comision_transf_inter_banco_salida = COALESCE(v_cuenta.comision_transf_inter_banco_salida, 0),
      resultado_comision_banco_salida = (v_calc_sal->>'resultado_comision_banco_salida')::numeric,
      monto_transferencia_cliente = COALESCE(v_op.monto_deposito_cliente, 0),
      monto_itf_salida = COALESCE(v_cuenta.comision_itf_ingreso_salida, 0),
      ruta_destino = COALESCE(p_ruta_destino, ruta_destino),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id_operacion;

  v_ruta_kpi_final := COALESCE(p_ruta_destino, v_op.ruta_destino, v_op.ruta_origen);

  IF v_ruta_kpi_actual IS NOT NULL THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi_actual, COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario));
  END IF;
  IF v_ruta_kpi_final IS DISTINCT FROM v_ruta_kpi_actual THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi_final, COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario));
  END IF;

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_proceso(p_id := p_id_operacion) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_match
Objetivo:
  Confirmar el match de una solicitud Pago Deuda contra una operacion de
  efectivizacion, copiando el snapshot de ingreso a la solicitud.

Diseno compacto:
  - no crea ni borra movimientos de caja
  - no anula la efectivizacion original
  - solo congela el snapshot que necesita la solicitud de pago de deuda
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_match(
  p_id_pago_deuda bigint,
  p_id_operacion_efectivizacion bigint,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_op_deuda record;
  v_op_efect record;
  v_estado_confirmado_id bigint;
  v_estado_confirmado_nombre character varying;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_op_deuda
  FROM public.tb_operacion_proceso
  WHERE id = p_id_pago_deuda
  LIMIT 1;

  IF v_op_deuda.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de Pago Deuda no encontrada.');
  END IF;

  SELECT *
  INTO v_op_efect
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion_efectivizacion
  LIMIT 1;

  IF v_op_efect.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de efectivizacion no encontrada.');
  END IF;

  IF COALESCE(v_op_deuda.monto_deposito_cliente, 0) <> COALESCE(v_op_efect.monto_deposito_cliente, 0) THEN
    RETURN jsonb_build_object('error', 'Los montos no coinciden.');
  END IF;

  IF COALESCE(v_op_deuda.dni_cliente, '') <> COALESCE(v_op_efect.dni_cliente, '') THEN
    RETURN jsonb_build_object('error', 'Los DNIs no coinciden.');
  END IF;

  SELECT id, nombre
  INTO v_estado_confirmado_id, v_estado_confirmado_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'CONFIRMADO'
  LIMIT 1;

  UPDATE public.tb_operacion_proceso
  SET codigo_operacion_deposito_cliente = v_op_efect.codigo_operacion_deposito_cliente,
      fecha_deposito_cliente = v_op_efect.fecha_deposito_cliente,
      id_empresa_ingreso = v_op_efect.id_empresa_ingreso,
      nombre_empresa_ingreso = v_op_efect.nombre_empresa_ingreso,
      id_empresa_cuenta_ingreso = v_op_efect.id_empresa_cuenta_ingreso,
      id_banco_empresa_cuenta_ingreso = v_op_efect.id_banco_empresa_cuenta_ingreso,
      nombre_banco_empresa_cuenta_ingreso = v_op_efect.nombre_banco_empresa_cuenta_ingreso,
      flag_por_sol_comision_banco_ingreso = v_op_efect.flag_por_sol_comision_banco_ingreso,
      comision_banco_ingreso = v_op_efect.comision_banco_ingreso,
      comision_minimo_banco_ingreso = v_op_efect.comision_minimo_banco_ingreso,
      comision_igv_banco_ingreso = v_op_efect.comision_igv_banco_ingreso,
      resultado_comision_banco_ingreso = v_op_efect.resultado_comision_banco_ingreso,
      monto_itf_ingreso = v_op_efect.monto_itf_ingreso,
      id_estado = v_estado_confirmado_id,
      nombre_estado = v_estado_confirmado_nombre,
      fecha_pagado = NOW(),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id_pago_deuda;

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_proceso(p_id := p_id_pago_deuda) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_pagado
Objetivo:
  Marcar una solicitud de Pago Deuda como pagada y, si aplica, congelar el
  monto final de comision del servicio.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_pagado(
  p_id_operacion bigint,
  p_resultado_comision_servicio numeric DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_estado_pagado_id bigint;
  v_estado_pagado_nombre character varying;
  v_result jsonb;
  v_op record;
  v_ruta_kpi character varying;
BEGIN
  SELECT *
  INTO v_op
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1;

  SELECT id, nombre
  INTO v_estado_pagado_id, v_estado_pagado_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PAGADO'
  LIMIT 1;

  UPDATE public.tb_operacion_proceso
  SET id_estado = v_estado_pagado_id,
      nombre_estado = v_estado_pagado_nombre,
      resultado_comision_servicio = COALESCE(p_resultado_comision_servicio, resultado_comision_servicio),
      fecha_pagado = NOW(),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id_operacion;

  v_ruta_kpi := COALESCE(v_op.ruta_destino, v_op.ruta_origen);
  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi, COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario));

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_proceso(p_id := p_id_operacion) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

