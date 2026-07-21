-- ============================================================================
-- 13. PAGO DEUDA
-- ============================================================================

/*
Funcion: f_get_tb_pago_deuda
Objetivo:
  Listar solo solicitudes raiz para `/operaciones/pagodeuda`. La atencion
  bancaria se consulta desde la fila hija en las rutas de efectivizacion.
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
SECURITY DEFINER
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
  SELECT to_jsonb(op) || jsonb_build_object(
    'id_operacion_banco',
    (
      SELECT h.id
      FROM public.tb_operacion_proceso h
      WHERE h.id_operacion_padre = op.id
        AND UPPER(COALESCE(h.tipo_flujo_pago_deuda, '')) = 'BANCO'
      ORDER BY h.id
      LIMIT 1
    ),
    'flag_comision_registrada',
    EXISTS (
      SELECT 1
      FROM public.tb_operacion_caja c
      WHERE c.id_operacion_proceso = op.id
        AND c.tipo_origen = 'PAGO_DEUDA_COMISION'
    )
  )
  FROM public.tb_operacion_proceso op
  WHERE op.id_codigo_servicio = v_id_codigo_servicio_pago_deuda
    AND op.id_operacion_padre IS NULL
    AND UPPER(COALESCE(op.tipo_flujo_pago_deuda, 'SOLICITUD')) = 'SOLICITUD'
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
  - usa fecha_deposito_cliente como fecha operacional del Excel
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_pago_deuda_match(
  p_id_operacion_pago_deuda bigint DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_monto_deposito_cliente bigint DEFAULT NULL,
  p_id_operacion_efectivizacion bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_id_codigo_servicio_pago_deuda bigint;
  v_dni_cliente character varying;
  v_monto_deposito_cliente bigint;
  v_banco_cliente bigint;
  v_fecha_operacion date;
BEGIN
  SELECT cs.id
  INTO v_id_codigo_servicio_pago_deuda
  FROM public.tb_codigo_servicio cs
  WHERE UPPER(COALESCE(cs.nombre, '')) LIKE '%PAGO%DEUDA%'
  ORDER BY cs.id
  LIMIT 1;

  IF p_id_operacion_efectivizacion IS NOT NULL THEN
    SELECT op.dni_cliente, op.monto_deposito_cliente, op.id_banco_empresa_cuenta_ingreso, op.fecha_deposito_cliente::date
    INTO v_dni_cliente, v_monto_deposito_cliente, v_banco_cliente, v_fecha_operacion
    FROM public.tb_operacion_proceso op
    WHERE op.id = p_id_operacion_efectivizacion
    LIMIT 1;
  ELSIF p_id_operacion_pago_deuda IS NOT NULL THEN
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

  IF p_id_operacion_efectivizacion IS NOT NULL THEN
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
      'fecha_registro', op.fecha_registro,
      'fecha_pendiente', op.fecha_pendiente,
      'tipo_flujo_pago_deuda', op.tipo_flujo_pago_deuda,
      'monto_deposito_cliente', op.monto_deposito_cliente,
      'monto_devuelto', op.monto_devuelto
    )
    FROM public.tb_operacion_proceso op
    WHERE op.dni_cliente = v_dni_cliente
      AND UPPER(COALESCE(op.tipo_servicio, '')) LIKE '%PAGO%DEUDA%'
      AND UPPER(COALESCE(op.tipo_flujo_pago_deuda, '')) = 'BANCO'
      AND UPPER(COALESCE(op.nombre_estado, '')) = 'PROCESADO'
      AND op.id_caja_cierre IS NULL
      AND v_fecha_operacion IS NOT NULL
      AND op.monto_devuelto < op.monto_deposito_cliente
      AND ABS(
        EXTRACT(epoch FROM (COALESCE(op.fecha_pendiente, op.fecha_registro) - v_fecha_operacion))
      ) <= 86400
    ORDER BY op.id DESC
    LIMIT 20;
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
    'fecha_registro', op.fecha_registro,
    'fecha_deposito_cliente', op.fecha_deposito_cliente
  )
  FROM public.tb_operacion_proceso op
  JOIN public.tb_estado e ON op.id_estado = e.id
  WHERE op.dni_cliente = v_dni_cliente
    AND (v_monto_deposito_cliente IS NULL OR op.monto_deposito_cliente = v_monto_deposito_cliente)
    AND (v_id_codigo_servicio_pago_deuda IS NULL OR op.id_codigo_servicio <> v_id_codigo_servicio_pago_deuda)
    AND UPPER(COALESCE(e.nombre, '')) = 'PENDIENTE'
    AND op.id_empresa_ingreso IS NOT NULL
    AND op.id_caja_cierre IS NULL
    AND (
      p_id_operacion_pago_deuda IS NULL
      OR op.fecha_deposito_cliente::date = (
        SELECT COALESCE(pd.fecha_pendiente, pd.fecha_registro)::date
        FROM public.tb_operacion_proceso pd
        WHERE pd.id = p_id_operacion_pago_deuda
        LIMIT 1
      )
    )
  ORDER BY op.fecha_deposito_cliente DESC NULLS LAST, op.fecha_registro DESC
  LIMIT 20;
END;
$$;

/*
Funcion: f_get_tb_pago_deuda_bandeja
Objetivo:
  Listar solo filas BANCO para el tab Pago Deuda dentro de las rutas bancarias
  (bcp, bbva, scotiabank, banbif, interbank). Excluye RETORNO y SOLICITUD.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_pago_deuda_bandeja(
  p_ruta character varying,
  p_id_empresa_salida bigint DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_codigo_operacion character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT to_jsonb(op) || jsonb_build_object(
    'flag_comision_registrada',
    EXISTS (
      SELECT 1
      FROM public.tb_operacion_caja c
      WHERE c.id_operacion_proceso = op.id_operacion_padre
        AND c.tipo_origen = 'PAGO_DEUDA_COMISION'
    )
  )
  FROM public.tb_operacion_proceso op
  WHERE UPPER(COALESCE(op.tipo_flujo_pago_deuda, '')) = 'BANCO'
    AND op.ruta_destino = p_ruta
    AND (p_id_empresa_salida IS NULL OR op.id_empresa_salida = p_id_empresa_salida)
    AND (p_dni_cliente IS NULL OR op.dni_cliente ILIKE '%' || p_dni_cliente || '%')
    AND (p_codigo_operacion IS NULL OR op.codigo_operacion_deposito_cliente ILIKE '%' || p_codigo_operacion || '%')
    AND (p_id_estado IS NULL OR op.id_estado = p_id_estado)
  ORDER BY op.id DESC;
$$;

/*
Funcion: f_sync_tb_pago_deuda_comision_caja
Objetivo:
  Registrar/sincronizar el ingreso de comision de Pago Deuda como un movimiento
  INGRESO diferenciado por tipo_origen = PAGO_DEUDA_COMISION.
*/
CREATE OR REPLACE FUNCTION public.f_sync_tb_pago_deuda_comision_caja(
  p_id_operacion bigint,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL,
  p_id_empresa_ingreso bigint DEFAULT NULL,
  p_id_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_monto_comision numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_op record;
  v_mov record;
  v_caja record;
  v_estado_id bigint;
  v_estado_nombre character varying;
  v_nombre_usuario character varying;
  v_saldo_anterior numeric;
  v_saldo_actual numeric;
  v_monto_comision numeric;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_op
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de Pago Deuda no encontrada.');
  END IF;

  v_monto_comision := COALESCE(p_monto_comision, v_op.resultado_comision_servicio, 0);

  IF v_monto_comision <= 0 THEN
    RETURN jsonb_build_object('omitido', true, 'motivo', 'La comision de servicio no es mayor a cero.');
  END IF;

  SELECT
    c.id,
    c.saldo_actual,
    c.id_empresa,
    e.nombre AS nombre_empresa,
    c.id_empresa_cuenta_bancaria,
    ecb.id_banco,
    b.nombre AS nombre_banco
  INTO v_caja
  FROM public.tb_caja_operativa c
  JOIN public.tb_empresa e ON e.id = c.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = c.id_empresa_cuenta_bancaria
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  WHERE c.id_empresa = COALESCE(p_id_empresa_ingreso, v_op.id_empresa_ingreso)
    AND c.id_empresa_cuenta_bancaria = COALESCE(p_id_empresa_cuenta_ingreso, v_op.id_empresa_cuenta_ingreso)
  LIMIT 1;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No existe caja inicial para registrar la comision de Pago Deuda.');
  END IF;

  v_estado_id := COALESCE(p_id_estado, v_op.id_estado);

  SELECT nombre
  INTO v_estado_nombre
  FROM public.tb_estado
  WHERE id = v_estado_id
  LIMIT 1;

  v_estado_nombre := COALESCE(v_estado_nombre, v_op.nombre_estado);

  IF p_nombre_usuario IS NOT NULL THEN
    v_nombre_usuario := p_nombre_usuario;
  ELSIF p_id_usuario IS NOT NULL THEN
    SELECT nombre
    INTO v_nombre_usuario
    FROM public.tb_usuario
    WHERE id = p_id_usuario
    LIMIT 1;
  ELSE
    v_nombre_usuario := COALESCE(v_op.nombre_usuario_gestor, v_op.nombre_usuario);
  END IF;

  SELECT *
  INTO v_mov
  FROM public.tb_operacion_caja
  WHERE id_operacion_proceso = p_id_operacion
    AND tipo_origen = 'PAGO_DEUDA_COMISION'
  ORDER BY id
  LIMIT 1
  FOR UPDATE;

  IF v_mov.id IS NULL THEN
    RETURN public.f_post_tb_operacion_caja(
      p_id_caja := v_caja.id,
      p_tipo_origen := 'PAGO_DEUDA_COMISION',
      p_tipo_movimiento := 'INGRESO',
      p_id_operacion_proceso := p_id_operacion,
      p_id_codigo_servicio := v_op.id_codigo_servicio,
      p_nombre_codigo_servicio := v_op.nombre_codigo_servicio,
      p_dni_cliente := v_op.dni_cliente,
      p_nombre_cliente := v_op.nombre_cliente,
      p_codigo_operacion := v_op.codigo_operacion_deposito_cliente,
      p_nombre_categoria_movimiento := 'Comision Pago Deuda',
      p_detalle := 'Ingreso de comision Pago Deuda',
      p_id_banco_tercero := v_op.id_banco_cliente,
      p_nombre_banco_tercero := v_op.nombre_banco_cliente,
      p_monto_ingreso := v_monto_comision,
      p_monto_gasto := 0,
      p_monto_ganancia := v_monto_comision,
      p_monto_salida := 0,
      p_flag_contabiliza_operacion := true,
      p_id_estado := v_estado_id,
      p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario),
      p_nombre_usuario := v_nombre_usuario,
      p_tipo_facturacion := COALESCE(v_op.tipo_facturacion, 'Boleta')
    );
  END IF;

  IF v_mov.id_caja_cierre IS NOT NULL THEN
    SELECT x
    INTO v_result
    FROM public.f_get_tb_operacion_caja(p_id := v_mov.id) AS x
    LIMIT 1;

    RETURN v_result || jsonb_build_object('idempotente', true, 'cerrado', true);
  END IF;

  PERFORM public.f_apply_tb_operacion_caja_delta(
    p_id_caja := v_mov.id_caja,
    p_tipo_movimiento := v_mov.tipo_movimiento,
    p_nombre_estado := v_mov.nombre_estado,
    p_monto_ingreso := v_mov.monto_ingreso,
    p_monto_gasto := v_mov.monto_gasto,
    p_monto_ganancia := v_mov.monto_ganancia,
    p_monto_salida := v_mov.monto_salida,
    p_flag_contabiliza_operacion := v_mov.flag_contabiliza_operacion,
    p_factor := -1,
    p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario)
  );

  SELECT saldo_actual
  INTO v_saldo_anterior
  FROM public.tb_caja_operativa
  WHERE id = v_caja.id
  LIMIT 1;

  v_saldo_actual := public.f_apply_tb_operacion_caja_delta(
    p_id_caja := v_caja.id,
    p_tipo_movimiento := 'INGRESO',
    p_nombre_estado := v_estado_nombre,
    p_monto_ingreso := v_monto_comision,
    p_monto_gasto := 0,
    p_monto_ganancia := v_monto_comision,
    p_monto_salida := 0,
    p_flag_contabiliza_operacion := COALESCE(v_mov.flag_contabiliza_operacion, true),
    p_factor := 1,
    p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario)
  );

  UPDATE public.tb_operacion_caja
  SET id_caja = v_caja.id,
      id_codigo_servicio = v_op.id_codigo_servicio,
      nombre_codigo_servicio = v_op.nombre_codigo_servicio,
      dni_cliente = v_op.dni_cliente,
      nombre_cliente = v_op.nombre_cliente,
      codigo_operacion = v_op.codigo_operacion_deposito_cliente,
      nombre_categoria_movimiento = 'Comision Pago Deuda',
      detalle = 'Ingreso de comision Pago Deuda',
      id_empresa = v_caja.id_empresa,
      nombre_empresa = v_caja.nombre_empresa,
      id_empresa_cuenta_bancaria = v_caja.id_empresa_cuenta_bancaria,
      id_banco = v_caja.id_banco,
      nombre_banco = v_caja.nombre_banco,
      id_banco_tercero = v_op.id_banco_cliente,
      nombre_banco_tercero = v_op.nombre_banco_cliente,
      monto_ingreso = v_monto_comision,
      monto_gasto = 0,
      monto_ganancia = v_monto_comision,
      monto_salida = 0,
      saldo_anterior = v_saldo_anterior,
      saldo_actual = v_saldo_actual,
      id_estado = v_estado_id,
      nombre_estado = v_estado_nombre,
      id_usuario = COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario, id_usuario),
      nombre_usuario = COALESCE(v_nombre_usuario, nombre_usuario),
      tipo_facturacion = COALESCE(v_op.tipo_facturacion, tipo_facturacion)
  WHERE id = v_mov.id;

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_caja(p_id := v_mov.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_post_tb_pago_deuda_solicitud
Objetivo:
  Crear una solicitud raiz para atencion al cliente y una operacion hija
  bancaria visible en el tab Pago Deuda de la ruta destino.
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
  v_tipo_documento bigint;
  v_celular_json jsonb;
  v_estado_pendiente_id bigint;
  v_estado_pendiente_nombre character varying;
  v_username character varying;
  v_codigo_servicio_id bigint;
  v_codigo_servicio_nombre character varying;
  v_codigo_operacion character varying;
  v_root_id bigint;
  v_child_id bigint;
  v_calc_serv jsonb;
  v_calc_sal jsonb;
  v_result jsonb;
  v_nombre_usuario_gestor character varying;
  v_nombre_usuario_solicitud character varying;
  v_ruta_banco character varying;
  v_cuenta_salida record;
BEGIN
  SELECT valor, tipo
  INTO v_dni_parseado, v_tipo_doc
  FROM public.f_get_tb_parse_documento(p_dni_cliente);

  v_tipo_documento := public.f_get_tb_documento_tipo_codigo(v_tipo_doc);
  v_celular_json := CASE
    WHEN COALESCE(p_celular_cliente, '') <> '' THEN jsonb_build_array(p_celular_cliente)
    ELSE NULL
  END;

  SELECT id, nombre
  INTO v_cliente_id, v_cliente_nombre
  FROM public.tb_cliente
  WHERE tipo_documento = v_tipo_documento
    AND numero_documento = v_dni_parseado
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    SELECT x.id, x.nombre
    INTO v_cliente_id, v_cliente_nombre
    FROM jsonb_to_record(
      public.f_post_tb_cliente(
        p_tipo_documento := v_tipo_documento,
        p_numero_documento := v_dni_parseado,
        p_nombre := p_nombre_cliente,
        p_celular := v_celular_json,
        p_id_estado := (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1),
        p_id_usuario := p_id_usuario
      )
    ) AS x(id bigint, nombre character varying);
  ELSIF COALESCE(p_celular_cliente, '') <> '' THEN
    PERFORM public.f_patch_tb_cliente(
      p_id := v_cliente_id,
      p_celular := v_celular_json,
      p_id_usuario := p_id_usuario
    );
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

  v_username := COALESCE(v_username, 'Sistema');

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

  SELECT rc.ruta
  INTO v_ruta_banco
  FROM public.tb_ruta_operacion_caja rc
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = rc.id_empresa_cuenta_bancaria
  WHERE rc.id_estado = 1
    AND ecb.id_estado = 1
    AND ecb.id_banco = p_id_banco_cliente
  ORDER BY rc.flag_caja_ingreso_principal DESC, rc.id ASC
  LIMIT 1;

  v_ruta_banco := COALESCE(
    v_ruta_banco,
    p_ruta_destino,
    lower(regexp_replace(COALESCE(p_nombre_banco_cliente, ''), '\s+', '', 'g'))
  );

  SELECT
    rc.ruta,
    rc.id_empresa,
    e.nombre AS nombre_empresa,
    rc.id_empresa_cuenta_bancaria,
    ecb.id_banco,
    b.nombre AS nombre_banco,
    ecb.comision_itf_ingreso_salida,
    ecb.comision_transf_banco_salida,
    ecb.comision_transf_inter_banco_salida
  INTO v_cuenta_salida
  FROM public.tb_ruta_operacion_caja rc
  JOIN public.tb_empresa e ON e.id = rc.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = rc.id_empresa_cuenta_bancaria
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  WHERE rc.ruta = v_ruta_banco
    AND rc.id_estado = 1
    AND ecb.id_estado = 1
  ORDER BY (ecb.id_banco = p_id_banco_cliente) DESC, rc.flag_caja_ingreso_principal DESC, rc.id ASC
  LIMIT 1;

  v_calc_serv := public.f_get_tb_operacion_calculo_comision_servicio(
    p_monto_deposito_cliente,
    v_regla.comision_servicio,
    v_regla.monto_minimo_deposito_servicio,
    v_regla.comision_minima_servicio,
    0
  );

  IF v_cuenta_salida.id_empresa IS NOT NULL THEN
    v_calc_sal := public.f_get_tb_operacion_calculo_comision_banco_salida(
      p_monto_deposito_cliente,
      COALESCE(v_cuenta_salida.comision_transf_banco_salida, 0),
      COALESCE(v_cuenta_salida.comision_transf_inter_banco_salida, 0),
      COALESCE(v_cuenta_salida.comision_itf_ingreso_salida, 0),
      p_id_empresa_salida := v_cuenta_salida.id_empresa,
      p_id_empresa_cuenta_salida := v_cuenta_salida.id_empresa_cuenta_bancaria,
      p_id_banco_empresa_cuenta_salida := v_cuenta_salida.id_banco,
      p_id_banco_cliente_transferencia := p_id_banco_cliente
    );
  END IF;

  IF p_id_operacion IS NULL THEN
    v_codigo_operacion := NULL;

    INSERT INTO public.tb_operacion_proceso (
      codigo_operacion_deposito_cliente, id_codigo_servicio, nombre_codigo_servicio, tipo_servicio,
      id_comunidad, nombre_comunidad, nombre_tipo_deposito, id_cliente, dni_cliente, nombre_cliente,
      id_banco_cliente, nombre_banco_cliente, monto_deposito_cliente, comision_servicio,
      monto_minimo_deposito_servicio, comision_minima_servicio, comision_monto_extra_servicio,
      resultado_comision_servicio, id_banco_cliente_transferencia, nombre_banco_cliente_transferencia,
      id_estado, nombre_estado, id_usuario, nombre_usuario, id_usuario_gestor, nombre_usuario_gestor,
      id_usuario_solicitud, nombre_usuario_solicitud, tipo_flujo_pago_deuda, ruta_origen, ruta_destino,
      fecha_pendiente
    )
    VALUES (
      v_codigo_operacion, v_codigo_servicio_id, v_codigo_servicio_nombre, 'Pago Deuda',
      v_regla.id_comunidad, (SELECT nombre FROM public.tb_comunidad WHERE id = v_regla.id_comunidad LIMIT 1),
      v_regla.tipo_deposito, v_cliente_id, v_dni_parseado, COALESCE(v_cliente_nombre, p_nombre_cliente),
      p_id_banco_cliente, p_nombre_banco_cliente, p_monto_deposito_cliente, v_regla.comision_servicio,
      v_regla.monto_minimo_deposito_servicio, v_regla.comision_minima_servicio, 0,
      (v_calc_serv->>'resultado_comision_servicio')::numeric, p_id_banco_cliente, p_nombre_banco_cliente,
      v_estado_pendiente_id, v_estado_pendiente_nombre, p_id_usuario, v_username,
      COALESCE(p_id_usuario_gestor, p_id_usuario), COALESCE(v_nombre_usuario_gestor, v_username),
      COALESCE(p_id_usuario_solicitud, p_id_usuario), COALESCE(v_nombre_usuario_solicitud, v_username),
      'SOLICITUD', COALESCE(p_ruta_origen, 'deuda'), 'deuda', NOW()
    )
    RETURNING id INTO v_root_id;
  ELSE
    v_root_id := p_id_operacion;
  END IF;

  SELECT id
  INTO v_child_id
  FROM public.tb_operacion_proceso
  WHERE id_operacion_padre = v_root_id
    AND UPPER(COALESCE(tipo_flujo_pago_deuda, '')) = 'BANCO'
  ORDER BY id
  LIMIT 1;

  IF v_child_id IS NULL THEN
    INSERT INTO public.tb_operacion_proceso (
      codigo_operacion_deposito_cliente, id_codigo_servicio, nombre_codigo_servicio, tipo_servicio,
      id_comunidad, nombre_comunidad, nombre_tipo_deposito, id_cliente, dni_cliente, nombre_cliente,
      id_banco_cliente, nombre_banco_cliente, monto_deposito_cliente, comision_servicio,
      monto_minimo_deposito_servicio, comision_minima_servicio, comision_monto_extra_servicio,
      resultado_comision_servicio, id_empresa_salida, nombre_empresa_salida, id_empresa_cuenta_salida,
      id_banco_empresa_cuenta_salida, nombre_banco_empresa_cuenta_salida, comision_transf_banco_salida,
      comision_transf_inter_banco_salida, resultado_comision_banco_salida, monto_transferencia_cliente,
      monto_itf_salida, id_banco_cliente_transferencia, nombre_banco_cliente_transferencia, id_estado,
      nombre_estado, id_usuario, nombre_usuario, id_usuario_gestor, nombre_usuario_gestor,
      id_usuario_solicitud, nombre_usuario_solicitud, id_operacion_padre, tipo_flujo_pago_deuda,
      ruta_origen, ruta_destino, fecha_pendiente
    )
    VALUES (
      v_codigo_operacion, v_codigo_servicio_id, v_codigo_servicio_nombre, 'Pago Deuda',
      v_regla.id_comunidad, (SELECT nombre FROM public.tb_comunidad WHERE id = v_regla.id_comunidad LIMIT 1),
      v_regla.tipo_deposito, v_cliente_id, v_dni_parseado, COALESCE(v_cliente_nombre, p_nombre_cliente),
      p_id_banco_cliente, p_nombre_banco_cliente, p_monto_deposito_cliente, v_regla.comision_servicio,
      v_regla.monto_minimo_deposito_servicio, v_regla.comision_minima_servicio, 0,
      (v_calc_serv->>'resultado_comision_servicio')::numeric, v_cuenta_salida.id_empresa,
      v_cuenta_salida.nombre_empresa, v_cuenta_salida.id_empresa_cuenta_bancaria, v_cuenta_salida.id_banco,
      v_cuenta_salida.nombre_banco, COALESCE(v_cuenta_salida.comision_transf_banco_salida, 0),
      COALESCE(v_cuenta_salida.comision_transf_inter_banco_salida, 0),
      COALESCE((v_calc_sal->>'resultado_comision_banco_salida')::numeric, 0), p_monto_deposito_cliente,
      COALESCE(v_cuenta_salida.comision_itf_ingreso_salida, 0), p_id_banco_cliente, p_nombre_banco_cliente,
      v_estado_pendiente_id, v_estado_pendiente_nombre, p_id_usuario, v_username,
      COALESCE(p_id_usuario_gestor, p_id_usuario), COALESCE(v_nombre_usuario_gestor, v_username),
      COALESCE(p_id_usuario_solicitud, p_id_usuario), COALESCE(v_nombre_usuario_solicitud, v_username),
      v_root_id, 'BANCO', 'deuda', v_ruta_banco, NOW()
    )
    RETURNING id INTO v_child_id;
  END IF;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_banco, p_id_usuario);

  SELECT x
  INTO v_result
  FROM public.f_get_tb_pago_deuda(p_id := v_root_id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_salida
Objetivo:
  Confirmar el deposito al cliente desde la operacion bancaria hija. Cambia a
  Procesado y crea/sincroniza la SALIDA de caja.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_salida(
  p_id_operacion bigint,
  p_id_empresa_salida bigint DEFAULT NULL,
  p_id_empresa_cuenta_salida bigint DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL,
  p_ruta_destino character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_input record;
  v_op record;
  v_cuenta record;
  v_calc_sal jsonb;
  v_result jsonb;
  v_caja_result jsonb;
  v_estado_procesado_id bigint;
  v_estado_procesado_nombre character varying;
  v_ruta_kpi_actual character varying;
  v_ruta_kpi_final character varying;
  v_id_empresa_salida_final bigint;
  v_id_empresa_cuenta_salida_final bigint;
BEGIN
  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1;

  IF v_input.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion no encontrada.');
  END IF;

  IF UPPER(COALESCE(v_input.tipo_flujo_pago_deuda, '')) = 'SOLICITUD' THEN
    SELECT *
    INTO v_op
    FROM public.tb_operacion_proceso
    WHERE id_operacion_padre = v_input.id
      AND UPPER(COALESCE(tipo_flujo_pago_deuda, '')) = 'BANCO'
    ORDER BY id
    LIMIT 1;
  ELSE
    v_op := v_input;
  END IF;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro la operacion bancaria de Pago Deuda.');
  END IF;

  v_ruta_kpi_actual := COALESCE(v_op.ruta_destino, v_op.ruta_origen);
  v_id_empresa_salida_final := COALESCE(p_id_empresa_salida, v_op.id_empresa_salida);
  v_id_empresa_cuenta_salida_final := COALESCE(p_id_empresa_cuenta_salida, v_op.id_empresa_cuenta_salida);

  SELECT id, nombre
  INTO v_estado_procesado_id, v_estado_procesado_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PROCESADO'
  LIMIT 1;

  IF v_estado_procesado_id IS NULL THEN
    INSERT INTO public.tb_estado (nombre, id_usuario)
    VALUES ('Procesado', p_id_usuario_gestor)
    RETURNING id, nombre INTO v_estado_procesado_id, v_estado_procesado_nombre;
  END IF;

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
  WHERE ecb.id = v_id_empresa_cuenta_salida_final
    AND ecb.id_empresa = v_id_empresa_salida_final
  LIMIT 1;

  IF v_cuenta.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Cuenta de salida no encontrada. Selecciona Empresa antes de transferir.');
  END IF;

  v_calc_sal := public.f_get_tb_operacion_calculo_comision_banco_salida(
    COALESCE(v_op.monto_deposito_cliente, 0),
    COALESCE(v_cuenta.comision_transf_banco_salida, 0),
    COALESCE(v_cuenta.comision_transf_inter_banco_salida, 0),
    COALESCE(v_cuenta.comision_itf_ingreso_salida, 0),
    p_id_empresa_salida := v_id_empresa_salida_final,
    p_id_empresa_cuenta_salida := v_id_empresa_cuenta_salida_final,
    p_id_banco_empresa_cuenta_salida := v_cuenta.id_banco,
    p_id_banco_cliente_transferencia := v_op.id_banco_cliente
  );

  UPDATE public.tb_operacion_proceso
  SET id_empresa_salida = v_id_empresa_salida_final,
      nombre_empresa_salida = v_cuenta.empresa_nombre,
      id_empresa_cuenta_salida = v_id_empresa_cuenta_salida_final,
      id_banco_empresa_cuenta_salida = v_cuenta.id_banco,
      nombre_banco_empresa_cuenta_salida = v_cuenta.banco_nombre,
      comision_transf_banco_salida = COALESCE(v_cuenta.comision_transf_banco_salida, 0),
      comision_transf_inter_banco_salida = COALESCE(v_cuenta.comision_transf_inter_banco_salida, 0),
      resultado_comision_banco_salida = (v_calc_sal->>'resultado_comision_banco_salida')::numeric,
      monto_transferencia_cliente = COALESCE(v_op.monto_deposito_cliente, 0),
      monto_itf_salida = COALESCE(v_cuenta.comision_itf_ingreso_salida, 0),
      ruta_destino = COALESCE(p_ruta_destino, ruta_destino),
      id_estado = v_estado_procesado_id,
      nombre_estado = v_estado_procesado_nombre,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_op.id;

  IF v_op.id_operacion_padre IS NOT NULL THEN
    UPDATE public.tb_operacion_proceso
    SET id_estado = v_estado_procesado_id,
        nombre_estado = v_estado_procesado_nombre,
        id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
        nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
    WHERE id = v_op.id_operacion_padre;
  END IF;

  v_caja_result := public.f_post_tb_operacion_caja_desde_proceso(
    p_id_operacion_proceso := v_op.id,
    p_tipo_origen := 'PAGO_DEUDA',
    p_tipo_movimiento := 'SALIDA',
    p_id_usuario := COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
    p_id_estado := v_estado_procesado_id
  );

  IF v_caja_result ? 'error' THEN
    RETURN v_caja_result;
  END IF;

  v_ruta_kpi_final := COALESCE(p_ruta_destino, v_op.ruta_destino, v_op.ruta_origen);

  IF v_ruta_kpi_actual IS NOT NULL THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi_actual, COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario));
  END IF;
  IF v_ruta_kpi_final IS DISTINCT FROM v_ruta_kpi_actual THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi_final, COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario));
  END IF;

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_proceso(p_id := v_op.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_empresa
Objetivo:
  Cambiar la empresa/cuenta de salida de Pago Deuda sin confirmar la
  transferencia ni generar movimientos de caja.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_empresa(
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
  v_input record;
  v_op record;
  v_cuenta record;
  v_calc_sal jsonb;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1;

  IF v_input.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion no encontrada.');
  END IF;

  IF UPPER(COALESCE(v_input.tipo_flujo_pago_deuda, '')) = 'SOLICITUD' THEN
    SELECT *
    INTO v_op
    FROM public.tb_operacion_proceso
    WHERE id_operacion_padre = v_input.id
      AND UPPER(COALESCE(tipo_flujo_pago_deuda, '')) = 'BANCO'
    ORDER BY id
    LIMIT 1;
  ELSE
    v_op := v_input;
  END IF;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro la operacion bancaria de Pago Deuda.');
  END IF;

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
  WHERE id = v_op.id;

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_proceso(p_id := v_op.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_comision_cuenta
Objetivo:
  Guardar la empresa/cuenta donde atencion cobrara la comision separada de
  Pago Deuda, sin generar movimientos de caja.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_comision_cuenta(
  p_id_operacion bigint,
  p_id_empresa_ingreso bigint,
  p_id_empresa_cuenta_ingreso bigint,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_input record;
  v_root record;
  v_cuenta record;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1;

  IF v_input.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de Pago Deuda no encontrada.');
  END IF;

  IF UPPER(COALESCE(v_input.tipo_flujo_pago_deuda, '')) = 'BANCO'
     AND v_input.id_operacion_padre IS NOT NULL THEN
    SELECT *
    INTO v_root
    FROM public.tb_operacion_proceso
    WHERE id = v_input.id_operacion_padre
    LIMIT 1;
  ELSE
    v_root := v_input;
  END IF;

  IF v_root.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Solicitud raiz de Pago Deuda no encontrada.');
  END IF;

  SELECT
    ecb.id,
    ecb.id_banco,
    ecb.id_empresa,
    e.nombre AS empresa_nombre,
    b.nombre AS banco_nombre
  INTO v_cuenta
  FROM public.tb_empresa_cuenta_bancaria ecb
  JOIN public.tb_empresa e ON e.id = ecb.id_empresa
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  WHERE ecb.id = p_id_empresa_cuenta_ingreso
    AND ecb.id_empresa = p_id_empresa_ingreso
    AND ecb.id_estado = 1
  LIMIT 1;

  IF v_cuenta.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Cuenta de comision no encontrada o inactiva.');
  END IF;

  UPDATE public.tb_operacion_proceso
  SET id_empresa_ingreso = p_id_empresa_ingreso,
      nombre_empresa_ingreso = v_cuenta.empresa_nombre,
      id_empresa_cuenta_ingreso = p_id_empresa_cuenta_ingreso,
      id_banco_empresa_cuenta_ingreso = v_cuenta.id_banco,
      nombre_banco_empresa_cuenta_ingreso = v_cuenta.banco_nombre,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_root.id
     OR id_operacion_padre = v_root.id;

  SELECT x
  INTO v_result
  FROM public.f_get_tb_pago_deuda(p_id := v_root.id) AS x
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
  - no crea ni borra movimientos de caja porque reutiliza el ingreso conciliado
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
  v_input record;
  v_op_deuda record;
  v_op_efect record;
  v_estado_pagado_id bigint;
  v_estado_pagado_nombre character varying;
  v_ingreso_result jsonb;
BEGIN
  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_pago_deuda
  LIMIT 1;

  IF v_input.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de Pago Deuda no encontrada.');
  END IF;

  IF UPPER(COALESCE(v_input.tipo_flujo_pago_deuda, '')) = 'SOLICITUD' THEN
    SELECT *
    INTO v_op_deuda
    FROM public.tb_operacion_proceso
    WHERE id_operacion_padre = v_input.id
      AND UPPER(COALESCE(tipo_flujo_pago_deuda, '')) = 'BANCO'
    ORDER BY id
    LIMIT 1;
  ELSE
    v_op_deuda := v_input;
  END IF;

  IF v_op_deuda.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro la operacion bancaria de Pago Deuda.');
  END IF;

  SELECT *
  INTO v_op_efect
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion_efectivizacion
  LIMIT 1;

  IF v_op_efect.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de efectivizacion no encontrada.');
  END IF;

  IF COALESCE(v_op_deuda.dni_cliente, '') <> COALESCE(v_op_efect.dni_cliente, '') THEN
    RETURN jsonb_build_object('error', 'Los DNIs no coinciden.');
  END IF;

  IF v_op_efect.fecha_deposito_cliente IS NULL
     OR ABS(
       EXTRACT(epoch FROM (v_op_efect.fecha_deposito_cliente - COALESCE(v_op_deuda.fecha_pendiente, v_op_deuda.fecha_registro)))
     ) > 86400 THEN
    RETURN jsonb_build_object('error', 'La fecha de deposito excede el rango de 24h con la solicitud Pago Deuda.');
  END IF;

  SELECT id, nombre
  INTO v_estado_pagado_id, v_estado_pagado_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PAGADO'
  LIMIT 1;

  UPDATE public.tb_operacion_proceso
  SET codigo_operacion_deposito_cliente = v_op_efect.codigo_operacion_deposito_cliente,
      fecha_deposito_cliente = v_op_efect.fecha_deposito_cliente,
      id_empresa_ingreso = v_op_efect.id_empresa_ingreso,
      nombre_empresa_ingreso = v_op_efect.nombre_empresa_ingreso,
      id_empresa_cuenta_ingreso = v_op_efect.id_empresa_cuenta_ingreso,
      id_banco_empresa_cuenta_ingreso = v_op_efect.id_banco_empresa_cuenta_ingreso,
      nombre_banco_empresa_cuenta_ingreso = v_op_efect.nombre_banco_empresa_cuenta_ingreso,
      monto_devuelto = COALESCE(v_op_deuda.monto_devuelto, 0) + COALESCE(v_op_efect.monto_deposito_cliente, 0),
      id_operacion_match = CASE
        WHEN (COALESCE(v_op_deuda.monto_devuelto, 0) + COALESCE(v_op_efect.monto_deposito_cliente, 0)) >= COALESCE(v_op_deuda.monto_deposito_cliente, 0)
        THEN COALESCE(id_operacion_match, v_op_efect.id)
        ELSE id_operacion_match
      END,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_op_deuda.id;

  IF (COALESCE(v_op_deuda.monto_devuelto, 0) + COALESCE(v_op_efect.monto_deposito_cliente, 0)) >= COALESCE(v_op_deuda.monto_deposito_cliente, 0) THEN
    UPDATE public.tb_operacion_proceso
    SET id_operacion_match = v_op_efect.id,
        id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
        nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
    WHERE id = v_op_deuda.id_operacion_padre AND id_operacion_match IS NULL;
  END IF;

  UPDATE public.tb_operacion_proceso
  SET tipo_servicio = 'Pago Deuda',
      tipo_flujo_pago_deuda = 'RETORNO',
      id_operacion_match = v_op_deuda.id,
      id_estado = v_estado_pagado_id,
      nombre_estado = v_estado_pagado_nombre,
      fecha_pagado = COALESCE(fecha_pagado, NOW()),
      resultado_comision_servicio = 0,
      monto_transferencia_cliente = monto_deposito_cliente,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_op_efect.id;

  v_ingreso_result := public.f_post_tb_operacion_caja_desde_proceso(
    p_id_operacion_proceso := v_op_efect.id,
    p_tipo_origen := 'PAGO_DEUDA_DEVOLUCION',
    p_tipo_movimiento := 'INGRESO',
    p_id_usuario := COALESCE(p_id_usuario_gestor, v_op_efect.id_usuario_gestor, v_op_efect.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_op_efect.nombre_usuario_gestor, v_op_efect.nombre_usuario),
    p_id_estado := v_estado_pagado_id
  );

  IF v_ingreso_result ? 'error' THEN
    RETURN v_ingreso_result;
  END IF;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := v_op_efect.id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_pagado
Objetivo:
  Finalizar una operacion bancaria de Pago Deuda. Asegura SALIDA, INGRESO de
  retorno e INGRESO de comision sin duplicar movimientos.
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
  v_input record;
  v_op record;
  v_ruta_kpi character varying;
  v_salida_result jsonb;
  v_comision_result jsonb;
BEGIN
  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1;

  IF v_input.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de Pago Deuda no encontrada.');
  END IF;

  IF UPPER(COALESCE(v_input.tipo_flujo_pago_deuda, '')) = 'SOLICITUD' THEN
    SELECT *
    INTO v_op
    FROM public.tb_operacion_proceso
    WHERE id_operacion_padre = v_input.id
      AND UPPER(COALESCE(tipo_flujo_pago_deuda, '')) = 'BANCO'
    ORDER BY id
    LIMIT 1;
  ELSE
    v_op := v_input;
  END IF;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro la operacion bancaria de Pago Deuda.');
  END IF;

  IF v_op.id_empresa_salida IS NULL OR v_op.id_empresa_cuenta_salida IS NULL THEN
    RETURN jsonb_build_object('error', 'Selecciona la empresa y cuenta de salida antes de finalizar Pago Deuda.');
  END IF;

  IF v_op.id_operacion_match IS NULL
     AND COALESCE(v_op.monto_devuelto, 0) < COALESCE(v_op.monto_deposito_cliente, 0) THEN
    RETURN jsonb_build_object('error', 'Primero realiza el match con la efectivizacion de retorno.');
  END IF;

  IF v_op.id_empresa_ingreso IS NULL OR v_op.id_empresa_cuenta_ingreso IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion de Pago Deuda no tiene empresa y cuenta de ingreso configuradas.');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_caja_operativa c
    WHERE c.id_empresa = v_op.id_empresa_ingreso
      AND c.id_empresa_cuenta_bancaria = v_op.id_empresa_cuenta_ingreso
  ) THEN
    RETURN jsonb_build_object('error', 'No existe caja inicial para la empresa y cuenta de ingreso seleccionada.');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_caja_operativa c
    WHERE c.id_empresa = v_op.id_empresa_salida
      AND c.id_empresa_cuenta_bancaria = v_op.id_empresa_cuenta_salida
  ) THEN
    RETURN jsonb_build_object('error', 'No existe caja inicial para la empresa y cuenta de salida seleccionada.');
  END IF;

  SELECT id, nombre
  INTO v_estado_pagado_id, v_estado_pagado_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PAGADO'
  LIMIT 1;

  UPDATE public.tb_operacion_proceso
  SET id_estado = v_estado_pagado_id,
      nombre_estado = v_estado_pagado_nombre,
      resultado_comision_servicio = COALESCE(p_resultado_comision_servicio, resultado_comision_servicio),
      fecha_pagado = COALESCE(fecha_pagado, NOW()),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_op.id;

  IF v_op.id_operacion_padre IS NOT NULL THEN
    UPDATE public.tb_operacion_proceso
    SET id_estado = v_estado_pagado_id,
        nombre_estado = v_estado_pagado_nombre,
        id_operacion_match = COALESCE(id_operacion_match, v_op.id_operacion_match),
        fecha_pagado = COALESCE(fecha_pagado, NOW()),
        id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
        nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
    WHERE id = v_op.id_operacion_padre;
  END IF;

  v_salida_result := public.f_post_tb_operacion_caja_desde_proceso(
    p_id_operacion_proceso := v_op.id,
    p_tipo_origen := 'PAGO_DEUDA',
    p_tipo_movimiento := 'SALIDA',
    p_id_usuario := COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
    p_id_estado := v_estado_pagado_id
  );

  IF v_salida_result ? 'error' THEN
    RETURN v_salida_result;
  END IF;

  v_comision_result := public.f_sync_tb_pago_deuda_comision_caja(
    p_id_operacion := v_op.id_operacion_padre,
    p_id_estado := v_estado_pagado_id,
    p_id_usuario := COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
    p_id_empresa_ingreso := v_op.id_empresa_ingreso,
    p_id_empresa_cuenta_ingreso := v_op.id_empresa_cuenta_ingreso,
    p_monto_comision := v_op.resultado_comision_servicio
  );

  IF v_comision_result ? 'error' THEN
    RETURN v_comision_result;
  END IF;

  v_ruta_kpi := COALESCE(v_op.ruta_destino, v_op.ruta_origen);
  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi, COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario));

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_proceso(p_id := v_op.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_directo
Objetivo:
  Clasificar una efectivizacion como retorno directo de Pago Deuda sin enlazar
  una solicitud. Genera solo INGRESO de caja con gasto bancario de ingreso.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_directo(
  p_id_operacion_efectivizacion bigint,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_op record;
  v_estado_pagado_id bigint;
  v_estado_pagado_nombre character varying;
  v_caja_result jsonb;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_op
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion_efectivizacion
  LIMIT 1;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de efectivizacion no encontrada.');
  END IF;

  SELECT id, nombre
  INTO v_estado_pagado_id, v_estado_pagado_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PAGADO'
  LIMIT 1;

  UPDATE public.tb_operacion_proceso
  SET tipo_servicio = 'Pago Deuda',
      tipo_flujo_pago_deuda = 'RETORNO_DIRECTO',
      id_estado = v_estado_pagado_id,
      nombre_estado = v_estado_pagado_nombre,
      fecha_pagado = COALESCE(fecha_pagado, NOW()),
      resultado_comision_servicio = 0,
      monto_transferencia_cliente = monto_deposito_cliente,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_op.id;

  v_caja_result := public.f_post_tb_operacion_caja_desde_proceso(
    p_id_operacion_proceso := v_op.id,
    p_tipo_origen := 'PAGO_DEUDA_DEVOLUCION',
    p_tipo_movimiento := 'INGRESO',
    p_id_usuario := COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
    p_id_estado := v_estado_pagado_id
  );

  IF v_caja_result ? 'error' THEN
    RETURN v_caja_result;
  END IF;

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_proceso(p_id := v_op.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_post_tb_pago_deuda_comision
Objetivo:
  Registrar la comision separada de Pago Deuda en la empresa/cuenta elegida.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_pago_deuda_comision(
  p_id_operacion bigint,
  p_id_empresa_ingreso bigint,
  p_id_empresa_cuenta_ingreso bigint,
  p_monto_comision numeric DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_op record;
  v_estado_pagado_id bigint;
BEGIN
  SELECT *
  INTO v_op
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de Pago Deuda no encontrada.');
  END IF;

  SELECT id
  INTO v_estado_pagado_id
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PAGADO'
  LIMIT 1;

  RETURN public.f_sync_tb_pago_deuda_comision_caja(
    p_id_operacion := v_op.id,
    p_id_estado := COALESCE(v_estado_pagado_id, v_op.id_estado),
    p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
    p_id_empresa_ingreso := p_id_empresa_ingreso,
    p_id_empresa_cuenta_ingreso := p_id_empresa_cuenta_ingreso,
    p_monto_comision := p_monto_comision
  );
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_reiniciar_transferencia
Objetivo:
  Revertir una transferencia de Pago Deuda aun no cerrada, volviendo del paso
  2 (Procesado) al paso 1 (Pendiente) para corregir empresa/cuenta de salida.

Reglas:
  - solo trabaja sobre la operacion bancaria hija BANCO;
  - no permite reiniciar si ya existe match/devolucion;
  - no modifica movimientos cerrados por caja;
  - revierte el impacto de la SALIDA y elimina el movimiento abierto.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_reiniciar_transferencia(
  p_id_operacion bigint,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_input record;
  v_op record;
  v_mov record;
  v_estado_pendiente_id bigint;
  v_estado_pendiente_nombre character varying;
  v_ruta_kpi character varying;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1;

  IF v_input.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de Pago Deuda no encontrada.');
  END IF;

  IF UPPER(COALESCE(v_input.tipo_flujo_pago_deuda, '')) = 'SOLICITUD' THEN
    SELECT *
    INTO v_op
    FROM public.tb_operacion_proceso
    WHERE id_operacion_padre = v_input.id
      AND UPPER(COALESCE(tipo_flujo_pago_deuda, '')) = 'BANCO'
    ORDER BY id
    LIMIT 1;
  ELSE
    v_op := v_input;
  END IF;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro la operacion bancaria de Pago Deuda.');
  END IF;

  IF v_op.id_operacion_match IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'No se puede reiniciar una Pago Deuda con devolucion enlazada.');
  END IF;

  SELECT *
  INTO v_mov
  FROM public.tb_operacion_caja
  WHERE id_operacion_proceso = v_op.id
    AND UPPER(COALESCE(tipo_movimiento, '')) = 'SALIDA'
    AND UPPER(COALESCE(tipo_origen, '')) = 'PAGO_DEUDA'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_mov.id IS NOT NULL AND v_mov.id_caja_cierre IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'No se puede reiniciar porque la salida ya pertenece a un cierre de caja.');
  END IF;

  SELECT id, nombre
  INTO v_estado_pendiente_id, v_estado_pendiente_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PENDIENTE'
  LIMIT 1;

  IF v_estado_pendiente_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro el estado Pendiente.');
  END IF;

  IF v_mov.id IS NOT NULL THEN
    PERFORM public.f_apply_tb_operacion_caja_delta(
      p_id_caja := v_mov.id_caja,
      p_tipo_movimiento := v_mov.tipo_movimiento,
      p_nombre_estado := v_mov.nombre_estado,
      p_monto_ingreso := v_mov.monto_ingreso,
      p_monto_gasto := v_mov.monto_gasto,
      p_monto_ganancia := v_mov.monto_ganancia,
      p_monto_salida := v_mov.monto_salida,
      p_flag_contabiliza_operacion := v_mov.flag_contabiliza_operacion,
      p_factor := -1,
      p_id_usuario := COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario)
    );

    DELETE FROM public.tb_operacion_caja
    WHERE id = v_mov.id;
  END IF;

  UPDATE public.tb_operacion_proceso
  SET id_estado = v_estado_pendiente_id,
      nombre_estado = v_estado_pendiente_nombre,
      fecha_pendiente = NOW(),
      fecha_pagado = NULL,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_op.id;

  IF v_op.id_operacion_padre IS NOT NULL THEN
    UPDATE public.tb_operacion_proceso
    SET id_estado = v_estado_pendiente_id,
        nombre_estado = v_estado_pendiente_nombre,
        fecha_pendiente = NOW(),
        fecha_pagado = NULL,
        id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
        nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
    WHERE id = v_op.id_operacion_padre;
  END IF;

  v_ruta_kpi := COALESCE(v_op.ruta_destino, v_op.ruta_origen);
  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi, COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario));

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_proceso(p_id := v_op.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_patch_tb_pago_deuda_match',
  'f_patch_tb_pago_deuda_pagado',
  'f_patch_tb_pago_deuda_reiniciar_transferencia'
)
ORDER BY n.nspname, p.proname;
