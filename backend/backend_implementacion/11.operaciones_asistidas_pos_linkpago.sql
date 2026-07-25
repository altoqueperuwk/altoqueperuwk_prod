-- ============================================================================
-- 11. OPERACIONES ASISTIDAS POS / LINK PAGO
-- ============================================================================

/*
Funcion: f_get_tb_operacion_asistida_kpi
Objetivo:
  Consultar KPIs informativos para rutas asistidas sin caja operativa propia.

Reglas:
  - solo aplica para pos y linkpago;
  - filtra por fecha_registro;
  - suma solo operaciones Pagado;
  - comisiones refleja lo cobrado al cliente;
  - ganancia refleja comisiones menos gastos operativos;
  - no consulta ni modifica cajas.
*/
DROP FUNCTION IF EXISTS public.f_get_tb_operacion_asistida_kpi(
  character varying,
  timestamp with time zone,
  timestamp with time zone
);

CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_asistida_kpi(
  p_ruta character varying,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL
)
RETURNS TABLE (
  ruta character varying,
  comisiones numeric,
  gastos numeric,
  ganancia numeric,
  salidas numeric,
  total_operaciones integer,
  total_pagadas integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT *
    FROM public.tb_operacion_proceso op
    WHERE LOWER(COALESCE(p_ruta, '')) IN ('pos', 'linkpago')
      AND LOWER(COALESCE(op.ruta_origen, '')) = LOWER(p_ruta)
      AND (p_fecha_registro_desde IS NULL OR op.fecha_registro >= p_fecha_registro_desde)
      AND (p_fecha_registro_hasta IS NULL OR op.fecha_registro <= p_fecha_registro_hasta)
  )
  SELECT
    LOWER(p_ruta)::character varying AS ruta,
    COALESCE(SUM(
      CASE
        WHEN UPPER(BTRIM(COALESCE(nombre_estado, ''))) = 'PAGADO'
        THEN COALESCE(resultado_comision_servicio, 0)
        ELSE 0
      END
    ), 0)::numeric AS comisiones,
    COALESCE(SUM(
      CASE
        WHEN UPPER(BTRIM(COALESCE(nombre_estado, ''))) = 'PAGADO'
        THEN COALESCE(resultado_comision_banco_ingreso, 0) + COALESCE(resultado_comision_banco_salida, 0)
        ELSE 0
      END
    ), 0)::numeric AS gastos,
    COALESCE(SUM(
      CASE
        WHEN UPPER(BTRIM(COALESCE(nombre_estado, ''))) = 'PAGADO'
        THEN COALESCE(resultado_comision_servicio, 0)
          - COALESCE(resultado_comision_banco_ingreso, 0)
          - COALESCE(resultado_comision_banco_salida, 0)
        ELSE 0
      END
    ), 0)::numeric AS ganancia,
    COALESCE(SUM(
      CASE
        WHEN UPPER(BTRIM(COALESCE(nombre_estado, ''))) = 'PAGADO'
        THEN COALESCE(monto_transferencia_cliente, monto_deposito_cliente, 0)
        ELSE 0
      END
    ), 0)::numeric AS salidas,
    COUNT(*)::integer AS total_operaciones,
    COUNT(*) FILTER (WHERE UPPER(BTRIM(COALESCE(nombre_estado, ''))) = 'PAGADO')::integer AS total_pagadas
  FROM base
  HAVING LOWER(COALESCE(p_ruta, '')) IN ('pos', 'linkpago');
$$;

/*
Funcion: f_get_tb_operacion_asistida_bandeja
Objetivo:
  Consultar la bandeja operativa de POS y Link Pago por fecha de registro,
  sin depender de caja, cierre o movimientos financieros.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_asistida_bandeja(
  p_ruta character varying,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL,
  p_nombre_estado character varying DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_codigo_operacion character varying DEFAULT NULL,
  p_id_banco_cliente bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT to_jsonb(op)
  FROM public.tb_operacion_proceso op
  WHERE LOWER(COALESCE(p_ruta, '')) IN ('pos', 'linkpago')
    AND LOWER(COALESCE(op.ruta_origen, '')) = LOWER(p_ruta)
    AND (p_fecha_registro_desde IS NULL OR op.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR op.fecha_registro <= p_fecha_registro_hasta)
    AND (p_nombre_estado IS NULL OR UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = UPPER(BTRIM(p_nombre_estado)))
    AND (p_dni_cliente IS NULL OR COALESCE(op.dni_cliente, '') ILIKE '%' || p_dni_cliente || '%')
    AND (p_codigo_operacion IS NULL OR COALESCE(op.codigo_operacion_deposito_cliente, '') ILIKE '%' || p_codigo_operacion || '%')
    AND (p_id_banco_cliente IS NULL OR op.id_banco_cliente = p_id_banco_cliente)
  ORDER BY op.fecha_registro DESC, op.id DESC;
$$;

/*
Funcion: f_post_tb_operacion_asistida
Objetivo:
  Registrar operaciones POS o Link Pago sin impacto contable en caja.

Reglas:
  - POS debe informar p_id_banco_destino; el backend resuelve automaticamente
    la ruta_destino y empresa/cuenta de salida usando tb_ruta_operacion_caja;
  - Link Pago queda en la misma ruta y no requiere destino bancario;
  - busca regla de efectivizacion por id_codigo_servicio + id_comunidad;
  - POS resuelve su cuenta principal como ingreso informativo para calcular
    comision/ITF cobrado por la entidad POS;
  - calcula comisiones automaticamente usando las funciones de calculo;
  - no llama a funciones de tb_operacion_caja.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_operacion_asistida(
  p_ruta character varying,
  p_id_codigo_servicio bigint,
  p_nombre_codigo_servicio character varying,
  p_tipo_servicio character varying,
  p_id_comunidad bigint,
  p_nombre_comunidad character varying,
  p_dni_cliente character varying,
  p_monto_deposito_cliente numeric,
  p_codigo_operacion_deposito_cliente character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_nombre_estado character varying DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL,
  p_id_usuario_solicitud bigint DEFAULT NULL,
  p_nombre_usuario_solicitud character varying DEFAULT NULL,
  p_id_banco_destino bigint DEFAULT NULL,
  p_id_banco_cliente bigint DEFAULT NULL,
  p_fecha_registro timestamp with time zone DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ruta character varying;
  v_id bigint;
  v_cliente_id bigint;
  v_cliente_nombre character varying;
  v_tipo_documento bigint;
  v_id_banco_cliente bigint;
  v_nombre_banco_cliente character varying;
  v_ruta_destino character varying;
  v_id_empresa_salida bigint;
  v_nombre_empresa_salida character varying;
  v_id_empresa_cuenta_salida bigint;
  v_id_banco_empresa_cuenta_salida bigint;
  v_nombre_banco_empresa_cuenta_salida character varying;
  v_id_empresa_ingreso bigint;
  v_nombre_empresa_ingreso character varying;
  v_id_empresa_cuenta_ingreso bigint;
  v_id_banco_empresa_cuenta_ingreso bigint;
  v_nombre_banco_empresa_cuenta_ingreso character varying;
  v_flag_por_sol_comision_banco_ingreso boolean := false;
  v_comision_banco_ingreso numeric := 0;
  v_comision_minimo_banco_ingreso numeric := 0;
  v_comision_igv_banco_ingreso numeric := 0;
  v_monto_itf_ingreso numeric := 0;
  v_ruta_caja record;
  v_regla record;
  v_calc_serv jsonb;
  v_calc_ing jsonb;
  v_calc_sal jsonb;
BEGIN
  v_ruta := LOWER(BTRIM(COALESCE(p_ruta, '')));

  IF v_ruta NOT IN ('pos', 'linkpago') THEN
    RETURN jsonb_build_object('error', 'La ruta asistida no es valida.');
  END IF;

  IF v_ruta = 'pos' AND p_id_banco_destino IS NULL THEN
    RETURN jsonb_build_object('error', 'Selecciona el banco destino para la solicitud POS.');
  END IF;

  IF v_ruta = 'linkpago' AND p_id_banco_cliente IS NULL THEN
    RETURN jsonb_build_object('error', 'Selecciona la entidad tarjeta para Link Pago.');
  END IF;

  IF v_ruta = 'pos' AND p_id_banco_destino IS NOT NULL THEN
    SELECT rc.ruta, rc.id_empresa, e.nombre AS nombre_empresa,
           rc.id_empresa_cuenta_bancaria, ecb.id_banco, b.nombre AS nombre_banco
    INTO v_ruta_caja
    FROM public.tb_ruta_operacion_caja rc
    JOIN public.tb_empresa e ON e.id = rc.id_empresa
    JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = rc.id_empresa_cuenta_bancaria
    JOIN public.tb_banco b ON b.id = ecb.id_banco
    WHERE ecb.id_banco = p_id_banco_destino
      AND rc.flag_caja_ingreso_principal = true
      AND rc.id_estado = 1
    LIMIT 1;

    IF v_ruta_caja.ruta IS NULL THEN
      RETURN jsonb_build_object('error', 'No existe caja de ingreso principal configurada para el banco seleccionado.');
    END IF;

    v_ruta_destino := v_ruta_caja.ruta;
    v_id_empresa_salida := v_ruta_caja.id_empresa;
    v_nombre_empresa_salida := v_ruta_caja.nombre_empresa;
    v_id_empresa_cuenta_salida := v_ruta_caja.id_empresa_cuenta_bancaria;
    v_id_banco_empresa_cuenta_salida := v_ruta_caja.id_banco;
    v_nombre_banco_empresa_cuenta_salida := v_ruta_caja.nombre_banco;
  END IF;

  IF v_ruta = 'pos' THEN
    SELECT
      rc.id_empresa,
      e.nombre,
      rc.id_empresa_cuenta_bancaria,
      ecb.id_banco,
      b.nombre,
      COALESCE(ecb.flag_por_sol_comision_banco_ingreso, false),
      COALESCE(ecb.comision_banco_ingreso, 0),
      COALESCE(ecb.comision_minimo_banco_ingreso, 0),
      COALESCE(ecb.comision_igv_banco_ingreso, 0),
      COALESCE(ecb.comision_itf_ingreso_salida, 0)
    INTO
      v_id_empresa_ingreso,
      v_nombre_empresa_ingreso,
      v_id_empresa_cuenta_ingreso,
      v_id_banco_empresa_cuenta_ingreso,
      v_nombre_banco_empresa_cuenta_ingreso,
      v_flag_por_sol_comision_banco_ingreso,
      v_comision_banco_ingreso,
      v_comision_minimo_banco_ingreso,
      v_comision_igv_banco_ingreso,
      v_monto_itf_ingreso
    FROM public.tb_ruta_operacion_caja rc
    JOIN public.tb_empresa e ON e.id = rc.id_empresa
    JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = rc.id_empresa_cuenta_bancaria
    JOIN public.tb_banco b ON b.id = ecb.id_banco
    WHERE LOWER(COALESCE(rc.ruta, '')) = 'pos'
      AND rc.flag_caja_ingreso_principal = true
      AND rc.id_estado = 1
      AND ecb.id_estado = 1
    LIMIT 1;

    IF v_id_empresa_ingreso IS NULL THEN
      RETURN jsonb_build_object('error', 'Configura la cuenta principal POS antes de registrar solicitudes.');
    END IF;
  END IF;

  IF v_ruta = 'linkpago' AND p_id_banco_cliente IS NOT NULL THEN
    SELECT
      rc.id_empresa,
      e.nombre,
      rc.id_empresa_cuenta_bancaria,
      ecb.id_banco,
      b.nombre,
      COALESCE(ecb.flag_por_sol_comision_banco_ingreso, false),
      COALESCE(ecb.comision_banco_ingreso, 0),
      COALESCE(ecb.comision_minimo_banco_ingreso, 0),
      COALESCE(ecb.comision_igv_banco_ingreso, 0),
      COALESCE(ecb.comision_itf_ingreso_salida, 0)
    INTO
      v_id_empresa_ingreso,
      v_nombre_empresa_ingreso,
      v_id_empresa_cuenta_ingreso,
      v_id_banco_empresa_cuenta_ingreso,
      v_nombre_banco_empresa_cuenta_ingreso,
      v_flag_por_sol_comision_banco_ingreso,
      v_comision_banco_ingreso,
      v_comision_minimo_banco_ingreso,
      v_comision_igv_banco_ingreso,
      v_monto_itf_ingreso
    FROM public.tb_ruta_operacion_caja rc
    JOIN public.tb_empresa e ON e.id = rc.id_empresa
    JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = rc.id_empresa_cuenta_bancaria
    JOIN public.tb_banco b ON b.id = ecb.id_banco
    WHERE LOWER(COALESCE(rc.ruta, '')) = 'linkpago'
      AND rc.id_estado = 1
      AND ecb.id_estado = 1
      AND ecb.id_banco = p_id_banco_cliente
    LIMIT 1;

    IF v_id_empresa_ingreso IS NULL THEN
      RETURN jsonb_build_object('error', 'Configura la cuenta de Link Pago para la entidad seleccionada antes de registrar.');
    END IF;

    v_id_empresa_salida := v_id_empresa_ingreso;
    v_nombre_empresa_salida := v_nombre_empresa_ingreso;
    v_id_empresa_cuenta_salida := v_id_empresa_cuenta_ingreso;
    v_id_banco_empresa_cuenta_salida := v_id_banco_empresa_cuenta_ingreso;
    v_nombre_banco_empresa_cuenta_salida := v_nombre_banco_empresa_cuenta_ingreso;

    SELECT id, nombre
    INTO p_id_estado, p_nombre_estado
    FROM public.tb_estado
    WHERE UPPER(nombre) = 'PAGADO'
    LIMIT 1;
  END IF;

  v_monto_itf_ingreso := 0;

  IF p_id_banco_cliente IS NOT NULL THEN
    SELECT b.id, b.nombre
    INTO v_id_banco_cliente, v_nombre_banco_cliente
    FROM public.tb_banco b
    WHERE b.id = p_id_banco_cliente AND b.id_estado = 1;
  END IF;

  v_tipo_documento := public.f_get_tb_documento_tipo_codigo('DNI');

  IF LENGTH(REGEXP_REPLACE(COALESCE(p_dni_cliente, ''), '[^0-9]', '', 'g')) = 11 THEN
    v_tipo_documento := public.f_get_tb_documento_tipo_codigo('RUC');
  END IF;

  SELECT id, nombre
  INTO v_cliente_id, v_cliente_nombre
  FROM public.tb_cliente
  WHERE tipo_documento = v_tipo_documento
    AND numero_documento = p_dni_cliente
  LIMIT 1;

  IF v_cliente_id IS NULL AND COALESCE(p_dni_cliente, '') <> '' THEN
    INSERT INTO public.tb_cliente (
      tipo_documento,
      numero_documento,
      nombre,
      id_comunidad,
      id_estado,
      id_usuario
    )
    VALUES (
      v_tipo_documento,
      p_dni_cliente,
      '',
      p_id_comunidad,
      (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1),
      p_id_usuario
    )
    RETURNING id, nombre INTO v_cliente_id, v_cliente_nombre;
  END IF;

  SELECT r.*
  INTO v_regla
  FROM public.tb_reglas_efectivizacion r
  WHERE r.id_codigo_servicio = p_id_codigo_servicio
    AND r.id_comunidad = p_id_comunidad
    AND r.id_estado = (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1)
  LIMIT 1;

  IF v_regla.id IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'No se encontro una regla activa de efectivizacion para el servicio y comunidad seleccionados.'
    );
  END IF;

  v_calc_serv := public.f_get_tb_operacion_calculo_comision_servicio(
    COALESCE(p_monto_deposito_cliente, 0)::bigint,
    v_regla.comision_servicio,
    v_regla.monto_minimo_deposito_servicio,
    v_regla.comision_minima_servicio,
    0::bigint
  );

  v_calc_ing := public.f_get_tb_operacion_calculo_comision_banco_ingreso(
    v_flag_por_sol_comision_banco_ingreso,
    COALESCE(p_monto_deposito_cliente, 0)::bigint,
    v_comision_banco_ingreso,
    v_comision_minimo_banco_ingreso,
    v_comision_igv_banco_ingreso,
    v_monto_itf_ingreso
  );

  v_calc_sal := public.f_get_tb_operacion_calculo_comision_banco_salida(
    (v_calc_serv->>'monto_transferencia_cliente')::numeric,
    0,
    0,
    0,
    v_id_empresa_salida,
    v_id_empresa_cuenta_salida,
    v_id_banco_empresa_cuenta_salida,
    v_id_banco_empresa_cuenta_salida
  );

  INSERT INTO public.tb_operacion_proceso (
    id_codigo_servicio,
    nombre_codigo_servicio,
    tipo_servicio,
    id_comunidad,
    nombre_comunidad,
    id_cliente,
    dni_cliente,
    nombre_cliente,
    monto_deposito_cliente,
    codigo_operacion_deposito_cliente,
    fecha_deposito_cliente,
    id_empresa_ingreso,
    nombre_empresa_ingreso,
    id_empresa_cuenta_ingreso,
    id_banco_empresa_cuenta_ingreso,
    nombre_banco_empresa_cuenta_ingreso,
    flag_por_sol_comision_banco_ingreso,
    comision_banco_ingreso,
    comision_minimo_banco_ingreso,
    comision_igv_banco_ingreso,
    monto_itf_ingreso,
    comision_servicio,
    monto_minimo_deposito_servicio,
    comision_minima_servicio,
    resultado_comision_servicio,
    resultado_comision_banco_ingreso,
    resultado_comision_banco_salida,
    monto_transferencia_cliente,
    id_empresa_salida,
    nombre_empresa_salida,
    id_empresa_cuenta_salida,
    id_banco_empresa_cuenta_salida,
    nombre_banco_empresa_cuenta_salida,
    id_banco_cliente,
    nombre_banco_cliente,
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
    flag_derivado,
    fecha_pendiente,
    tipo_facturacion,
    fecha_registro
  )
  VALUES (
    p_id_codigo_servicio,
    p_nombre_codigo_servicio,
    p_tipo_servicio,
    p_id_comunidad,
    p_nombre_comunidad,
    v_cliente_id,
    p_dni_cliente,
    COALESCE(v_cliente_nombre, ''),
    ROUND(COALESCE(p_monto_deposito_cliente, 0))::bigint,
    p_codigo_operacion_deposito_cliente,
    COALESCE(p_fecha_registro, now()),
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_id_empresa_ingreso ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_nombre_empresa_ingreso ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_id_empresa_cuenta_ingreso ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_id_banco_empresa_cuenta_ingreso ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_nombre_banco_empresa_cuenta_ingreso ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_flag_por_sol_comision_banco_ingreso ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_comision_banco_ingreso ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_comision_minimo_banco_ingreso ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_comision_igv_banco_ingreso ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_monto_itf_ingreso ELSE NULL END,
    v_regla.comision_servicio,
    v_regla.monto_minimo_deposito_servicio,
    v_regla.comision_minima_servicio,
    (v_calc_serv->>'resultado_comision_servicio')::numeric,
    (v_calc_ing->>'resultado_comision_banco_ingreso')::numeric,
    (v_calc_sal->>'resultado_comision_banco_salida')::numeric,
    (v_calc_serv->>'monto_transferencia_cliente')::numeric,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_id_empresa_salida ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_nombre_empresa_salida ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_id_empresa_cuenta_salida ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_id_banco_empresa_cuenta_salida ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_nombre_banco_empresa_cuenta_salida ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_id_banco_cliente ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_nombre_banco_cliente ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_id_banco_empresa_cuenta_salida ELSE NULL END,
    CASE WHEN v_ruta IN ('pos', 'linkpago') THEN v_nombre_banco_empresa_cuenta_salida ELSE NULL END,
    p_id_estado,
    p_nombre_estado,
    p_id_usuario,
    p_nombre_usuario,
    COALESCE(p_id_usuario_gestor, p_id_usuario),
    COALESCE(p_nombre_usuario_gestor, p_nombre_usuario),
    COALESCE(p_id_usuario_solicitud, p_id_usuario),
    COALESCE(p_nombre_usuario_solicitud, p_nombre_usuario),
    v_ruta,
    CASE WHEN v_ruta = 'pos' THEN v_ruta_destino ELSE v_ruta END,
    false,
    COALESCE(p_fecha_registro, now()),
    'Boleta',
    COALESCE(p_fecha_registro, now())
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- Funcion: f_patch_tb_operacion_asistida
-- Objetivo:
--   Editar una operacion asistida (linkpago/pos) y recalcular comisiones.
--
-- Reglas:
--   - solo modifica campos enviados (COALESCE con valor actual);
--   - si se cambia entidad tarjeta, resuelve empresa_ingreso y recalcula;
--   - no crea movimientos de caja;
--   - no cambia estado ni fechas de control.
-- ============================================================================
DROP FUNCTION IF EXISTS public.f_patch_tb_operacion_asistida(
  bigint, bigint, character varying, character varying, bigint,
  character varying, numeric, bigint, character varying
);

CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_asistida(
  p_id bigint,
  p_id_banco_cliente bigint DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_nombre_cliente character varying DEFAULT NULL,
  p_id_comunidad bigint DEFAULT NULL,
  p_nombre_comunidad character varying DEFAULT NULL,
  p_monto_deposito_cliente numeric DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_cliente_id bigint;
  v_cliente_nombre character varying;
  v_tipo_documento bigint;
  v_id_banco_cliente_resolved bigint;
  v_nombre_banco_cliente_resolved character varying;
  v_id_empresa_ingreso bigint;
  v_nombre_empresa_ingreso character varying;
  v_id_empresa_cuenta_ingreso bigint;
  v_id_banco_empresa_cuenta_ingreso bigint;
  v_nombre_banco_empresa_cuenta_ingreso character varying;
  v_flag_por_sol_comision_banco_ingreso boolean := false;
  v_comision_banco_ingreso numeric := 0;
  v_comision_minimo_banco_ingreso numeric := 0;
  v_comision_igv_banco_ingreso numeric := 0;
  v_monto_itf_ingreso numeric := 0;
  v_id_empresa_salida bigint;
  v_nombre_empresa_salida character varying;
  v_id_empresa_cuenta_salida bigint;
  v_id_banco_empresa_cuenta_salida bigint;
  v_nombre_banco_empresa_cuenta_salida character varying;
  v_regla record;
  v_calc_serv jsonb;
  v_calc_ing jsonb;
  v_calc_sal jsonb;
BEGIN
  SELECT * INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion no encontrada.');
  END IF;

  IF LOWER(COALESCE(v_actual.ruta_origen, '')) NOT IN ('pos', 'linkpago') THEN
    RETURN jsonb_build_object('error', 'La operacion no pertenece a una ruta asistida.');
  END IF;

  p_dni_cliente := COALESCE(p_dni_cliente, v_actual.dni_cliente);
  p_nombre_cliente := COALESCE(p_nombre_cliente, v_actual.nombre_cliente);
  p_id_comunidad := COALESCE(p_id_comunidad, v_actual.id_comunidad);
  p_nombre_comunidad := COALESCE(p_nombre_comunidad, v_actual.nombre_comunidad);
  p_monto_deposito_cliente := COALESCE(p_monto_deposito_cliente, v_actual.monto_deposito_cliente);

  IF p_id_banco_cliente IS NOT NULL THEN
    SELECT b.id, b.nombre
    INTO v_id_banco_cliente_resolved, v_nombre_banco_cliente_resolved
    FROM public.tb_banco b
    WHERE b.id = p_id_banco_cliente AND b.id_estado = 1;
  ELSE
    v_id_banco_cliente_resolved := v_actual.id_banco_cliente;
    v_nombre_banco_cliente_resolved := v_actual.nombre_banco_cliente;
    p_id_banco_cliente := v_actual.id_banco_cliente;
  END IF;

  SELECT
    rc.id_empresa, e.nombre, rc.id_empresa_cuenta_bancaria,
    ecb.id_banco, b.nombre,
    COALESCE(ecb.flag_por_sol_comision_banco_ingreso, false),
    COALESCE(ecb.comision_banco_ingreso, 0),
    COALESCE(ecb.comision_minimo_banco_ingreso, 0),
    COALESCE(ecb.comision_igv_banco_ingreso, 0),
    COALESCE(ecb.comision_itf_ingreso_salida, 0)
  INTO
    v_id_empresa_ingreso, v_nombre_empresa_ingreso,
    v_id_empresa_cuenta_ingreso, v_id_banco_empresa_cuenta_ingreso,
    v_nombre_banco_empresa_cuenta_ingreso,
    v_flag_por_sol_comision_banco_ingreso, v_comision_banco_ingreso,
    v_comision_minimo_banco_ingreso, v_comision_igv_banco_ingreso,
    v_monto_itf_ingreso
  FROM public.tb_ruta_operacion_caja rc
  JOIN public.tb_empresa e ON e.id = rc.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = rc.id_empresa_cuenta_bancaria
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  WHERE LOWER(COALESCE(rc.ruta, '')) = LOWER(COALESCE(v_actual.ruta_origen, ''))
    AND rc.id_estado = 1
    AND ecb.id_estado = 1
    AND ecb.id_banco = COALESCE(p_id_banco_cliente, v_actual.id_banco_cliente)
  LIMIT 1;

  v_id_empresa_salida := COALESCE(v_id_empresa_ingreso, v_actual.id_empresa_salida);
  v_nombre_empresa_salida := COALESCE(v_nombre_empresa_ingreso, v_actual.nombre_empresa_salida);
  v_id_empresa_cuenta_salida := COALESCE(v_id_empresa_cuenta_ingreso, v_actual.id_empresa_cuenta_salida);
  v_id_banco_empresa_cuenta_salida := COALESCE(v_id_banco_empresa_cuenta_ingreso, v_actual.id_banco_empresa_cuenta_salida);
  v_nombre_banco_empresa_cuenta_salida := COALESCE(v_nombre_banco_empresa_cuenta_ingreso, v_actual.nombre_banco_empresa_cuenta_salida);

  v_tipo_documento := public.f_get_tb_documento_tipo_codigo('DNI');
  IF LENGTH(REGEXP_REPLACE(COALESCE(p_dni_cliente, ''), '[^0-9]', '', 'g')) = 11 THEN
    v_tipo_documento := public.f_get_tb_documento_tipo_codigo('RUC');
  END IF;

  SELECT id, nombre INTO v_cliente_id, v_cliente_nombre
  FROM public.tb_cliente
  WHERE tipo_documento = v_tipo_documento AND numero_documento = p_dni_cliente
  LIMIT 1;

  IF v_cliente_id IS NULL AND COALESCE(p_dni_cliente, '') <> '' THEN
    INSERT INTO public.tb_cliente (
      tipo_documento, numero_documento, nombre, id_comunidad, id_estado, id_usuario
    ) VALUES (
      v_tipo_documento, p_dni_cliente, '', p_id_comunidad,
      (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1),
      p_id_usuario
    )
    RETURNING id, nombre INTO v_cliente_id, v_cliente_nombre;
  END IF;

  SELECT r.* INTO v_regla
  FROM public.tb_reglas_efectivizacion r
  WHERE r.id_codigo_servicio = v_actual.id_codigo_servicio
    AND r.id_comunidad = p_id_comunidad
    AND r.id_estado = (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1)
  LIMIT 1;

  IF v_regla.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro una regla activa de efectivizacion para el servicio y comunidad.');
  END IF;

  v_monto_itf_ingreso := 0;

  v_calc_serv := public.f_get_tb_operacion_calculo_comision_servicio(
    COALESCE(p_monto_deposito_cliente, 0)::bigint,
    v_regla.comision_servicio,
    v_regla.monto_minimo_deposito_servicio,
    v_regla.comision_minima_servicio,
    0::bigint
  );

  v_calc_ing := public.f_get_tb_operacion_calculo_comision_banco_ingreso(
    v_flag_por_sol_comision_banco_ingreso,
    COALESCE(p_monto_deposito_cliente, 0)::bigint,
    v_comision_banco_ingreso,
    v_comision_minimo_banco_ingreso,
    v_comision_igv_banco_ingreso,
    v_monto_itf_ingreso
  );

  v_calc_sal := public.f_get_tb_operacion_calculo_comision_banco_salida(
    (v_calc_serv->>'monto_transferencia_cliente')::numeric,
    0, 0, 0,
    v_id_empresa_salida,
    v_id_empresa_cuenta_salida,
    v_id_banco_empresa_cuenta_salida,
    v_id_banco_empresa_cuenta_salida
  );

  UPDATE public.tb_operacion_proceso
  SET id_cliente = COALESCE(v_cliente_id, id_cliente),
      dni_cliente = p_dni_cliente,
      nombre_cliente = COALESCE(v_cliente_nombre, p_nombre_cliente, ''),
      id_comunidad = p_id_comunidad,
      nombre_comunidad = p_nombre_comunidad,
      monto_deposito_cliente = ROUND(COALESCE(p_monto_deposito_cliente, 0))::bigint,
      id_banco_cliente = v_id_banco_cliente_resolved,
      nombre_banco_cliente = v_nombre_banco_cliente_resolved,
      id_banco_cliente_transferencia = v_id_banco_empresa_cuenta_salida,
      nombre_banco_cliente_transferencia = v_nombre_banco_empresa_cuenta_salida,
      id_empresa_ingreso = v_id_empresa_ingreso,
      nombre_empresa_ingreso = v_nombre_empresa_ingreso,
      id_empresa_cuenta_ingreso = v_id_empresa_cuenta_ingreso,
      id_banco_empresa_cuenta_ingreso = v_id_banco_empresa_cuenta_ingreso,
      nombre_banco_empresa_cuenta_ingreso = v_nombre_banco_empresa_cuenta_ingreso,
      id_empresa_salida = v_id_empresa_salida,
      nombre_empresa_salida = v_nombre_empresa_salida,
      id_empresa_cuenta_salida = v_id_empresa_cuenta_salida,
      id_banco_empresa_cuenta_salida = v_id_banco_empresa_cuenta_salida,
      nombre_banco_empresa_cuenta_salida = v_nombre_banco_empresa_cuenta_salida,
      flag_por_sol_comision_banco_ingreso = v_flag_por_sol_comision_banco_ingreso,
      comision_banco_ingreso = v_comision_banco_ingreso,
      comision_minimo_banco_ingreso = v_comision_minimo_banco_ingreso,
      comision_igv_banco_ingreso = v_comision_igv_banco_ingreso,
      monto_itf_ingreso = v_monto_itf_ingreso,
      comision_servicio = v_regla.comision_servicio,
      monto_minimo_deposito_servicio = v_regla.monto_minimo_deposito_servicio,
      comision_minima_servicio = v_regla.comision_minima_servicio,
      resultado_comision_servicio = (v_calc_serv->>'resultado_comision_servicio')::numeric,
      resultado_comision_banco_ingreso = (v_calc_ing->>'resultado_comision_banco_ingreso')::numeric,
      resultado_comision_banco_salida = (v_calc_sal->>'resultado_comision_banco_salida')::numeric,
      monto_transferencia_cliente = (v_calc_serv->>'monto_transferencia_cliente')::numeric,
      id_usuario = COALESCE(p_id_usuario, id_usuario),
      nombre_usuario = COALESCE(p_nombre_usuario, nombre_usuario)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- DROP FUNCTIONS GENERATOR
-- ============================================================================

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_get_tb_operacion_asistida_kpi',
  'f_get_tb_operacion_asistida_bandeja',
  'f_post_tb_operacion_asistida',
  'f_patch_tb_operacion_asistida'
)
ORDER BY n.nspname, p.proname;
