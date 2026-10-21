-- ============================================================================
-- 11. OPERACIONES ASISTIDAS POS / LINK PAGO
-- ============================================================================

/*
Funcion: f_get_tb_operacion_asistida_kpi
Objetivo:
  Consultar KPIs informativos para rutas asistidas sin caja operativa propia.

Reglas:
  - solo aplica para pos y linkpago;
  - filtra estrictamente por fecha_registro cuando se recibe un intervalo;
  - suma solo operaciones Pagado;
  - comisiones refleja lo cobrado al cliente;
  - ganancia refleja comisiones menos gastos operativos;
  - no consulta ni modifica cajas.
*/
DROP FUNCTION IF EXISTS public.f_get_tb_operacion_asistida_kpi(
  character varying, timestamp with time zone, timestamp with time zone, bigint
);

CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_asistida_kpi(
  p_ruta character varying,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL,
  p_id_usuario_solicitud bigint DEFAULT NULL,
  p_id_usuario_consulta bigint DEFAULT NULL
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
  WITH consulta AS (
    SELECT
      COALESCE(u.flag_super_admin, false)
        OR u.id_rol = 1
        OR UPPER(BTRIM(COALESCE(r.nombre, ''))) = 'ADMINISTRADOR' AS es_administrador,
      u.id_rol = 3
        OR UPPER(BTRIM(COALESCE(r.nombre, ''))) = 'JEFE DE TIENDA' AS es_jefe_tienda
    FROM public.tb_usuario u
    LEFT JOIN public.tb_rol r ON r.id = u.id_rol
    WHERE u.id = p_id_usuario_consulta
  ), base AS (
    SELECT *
    FROM public.tb_operacion_proceso op
    LEFT JOIN consulta c ON true
    WHERE LOWER(COALESCE(p_ruta, '')) IN ('pos', 'linkpago')
      AND LOWER(COALESCE(op.ruta_origen, '')) = LOWER(p_ruta)
      AND (
        (
          p_id_usuario_consulta IS NULL
          AND (p_id_usuario_solicitud IS NULL OR op.id_usuario_solicitud = p_id_usuario_solicitud)
        )
        OR (
          p_id_usuario_consulta IS NOT NULL
          AND (
            COALESCE(c.es_administrador, false)
            OR COALESCE(c.es_jefe_tienda, false)
            OR op.id_usuario_solicitud = p_id_usuario_consulta
          )
          AND (p_id_usuario_solicitud IS NULL OR op.id_usuario_solicitud = p_id_usuario_solicitud)
        )
      )
      AND COALESCE(op.id_estado, 0) <> 10
      AND (
        (p_fecha_registro_desde IS NULL AND p_fecha_registro_hasta IS NULL)
        OR (
          (p_fecha_registro_desde IS NULL OR op.fecha_registro >= p_fecha_registro_desde)
          AND (p_fecha_registro_hasta IS NULL OR op.fecha_registro <= p_fecha_registro_hasta)
        )
      )
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
  sin depender de caja, cierre o movimientos financieros. El intervalo se
  aplica estrictamente, incluidos los estados pendientes.
*/
DROP FUNCTION IF EXISTS public.f_get_tb_operacion_asistida_bandeja(
  character varying, timestamp with time zone, timestamp with time zone,
  character varying, character varying, character varying, bigint, bigint, bigint
);

DROP FUNCTION IF EXISTS public.f_get_tb_operacion_asistida_bandeja(
  character varying, timestamp with time zone, timestamp with time zone,
  character varying, character varying, character varying, bigint, bigint, bigint,
  character varying, numeric
);

CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_asistida_bandeja(p_ruta character varying, p_fecha_registro_desde timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fecha_registro_hasta timestamp with time zone DEFAULT NULL::timestamp with time zone, p_nombre_estado character varying DEFAULT NULL::character varying, p_dni_cliente character varying DEFAULT NULL::character varying, p_codigo_operacion character varying DEFAULT NULL::character varying, p_id_banco_cliente bigint DEFAULT NULL::bigint, p_id_usuario_solicitud bigint DEFAULT NULL::bigint, p_id_usuario_consulta bigint DEFAULT NULL::bigint, p_numero_tarjeta character varying DEFAULT NULL::character varying, p_monto_deposito_cliente numeric DEFAULT NULL::numeric)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT to_jsonb(op)
  FROM public.tb_operacion_proceso op
  LEFT JOIN public.tb_usuario consulta_usuario ON consulta_usuario.id = p_id_usuario_consulta
  LEFT JOIN public.tb_rol consulta_rol ON consulta_rol.id = consulta_usuario.id_rol
  WHERE LOWER(COALESCE(p_ruta, '')) IN ('pos', 'linkpago')
    AND LOWER(COALESCE(op.ruta_origen, '')) = LOWER(p_ruta)
    AND (
      (
        p_id_usuario_consulta IS NULL
        AND (p_id_usuario_solicitud IS NULL OR op.id_usuario_solicitud = p_id_usuario_solicitud)
      )
      OR (
        p_id_usuario_consulta IS NOT NULL
        AND (
          COALESCE(consulta_usuario.flag_super_admin, false)
          OR consulta_usuario.id_rol = 1
          OR UPPER(BTRIM(COALESCE(consulta_rol.nombre, ''))) = 'ADMINISTRADOR'
          OR consulta_usuario.id_rol = 3
          OR UPPER(BTRIM(COALESCE(consulta_rol.nombre, ''))) = 'JEFE DE TIENDA'
          OR op.id_usuario_solicitud = p_id_usuario_consulta
        )
        AND (p_id_usuario_solicitud IS NULL OR op.id_usuario_solicitud = p_id_usuario_solicitud)
      )
    )
    AND (
      op.id_estado IN (3, 4, 7)
      OR (
        UPPER(BTRIM(COALESCE(p_nombre_estado, ''))) = 'ELIMINADO'
        AND op.id_estado = 10
      )
    )
    AND (
      (p_fecha_registro_desde IS NULL AND p_fecha_registro_hasta IS NULL)
      OR (
        (p_fecha_registro_desde IS NULL OR op.fecha_registro >= p_fecha_registro_desde)
        AND (p_fecha_registro_hasta IS NULL OR op.fecha_registro <= p_fecha_registro_hasta)
      )
    )
    AND (
      p_nombre_estado IS NULL
      OR CASE UPPER(BTRIM(p_nombre_estado))
        WHEN 'PENDIENTE' THEN op.id_estado = 3
        WHEN 'SOLICITADO' THEN op.id_estado = 7
        WHEN 'PAGADO' THEN op.id_estado = 4
        WHEN 'ELIMINADO' THEN op.id_estado = 10
        ELSE false
      END
    )
    AND (p_dni_cliente IS NULL OR COALESCE(op.dni_cliente, '') ILIKE '%' || p_dni_cliente || '%')
    AND (
      NULLIF(BTRIM(COALESCE(p_codigo_operacion, '')), '') IS NULL
      OR COALESCE(op.codigo_operacion_deposito_cliente, '') ILIKE '%' || BTRIM(p_codigo_operacion) || '%'
    )
    AND (p_id_banco_cliente IS NULL OR op.id_banco_cliente = p_id_banco_cliente)
    AND (
      NULLIF(BTRIM(COALESCE(p_numero_tarjeta, '')), '') IS NULL
      OR COALESCE(op.numero_tarjeta, '') ILIKE '%' || BTRIM(p_numero_tarjeta) || '%'
    )
    AND (p_monto_deposito_cliente IS NULL OR op.monto_deposito_cliente = p_monto_deposito_cliente)
  ORDER BY op.fecha_registro DESC, op.id DESC;
$function$

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
DROP FUNCTION IF EXISTS public.f_post_tb_operacion_asistida(
  character varying, bigint, character varying, character varying,
  bigint, character varying, character varying, numeric, character varying,
  bigint, character varying, bigint, character varying, bigint,
  character varying, bigint, character varying, bigint, bigint,
  timestamp with time zone, bigint, character varying, character varying,
  character varying, bigint
);

DROP FUNCTION IF EXISTS public.f_post_tb_operacion_asistida(
  character varying, bigint, character varying, character varying,
  bigint, character varying, character varying, numeric, character varying,
  bigint, character varying, bigint, character varying, bigint,
  character varying, bigint, character varying, bigint, bigint,
  timestamp with time zone, bigint, character varying, character varying,
  character varying, bigint, timestamp with time zone
);

DROP FUNCTION IF EXISTS public.f_post_tb_operacion_asistida(
  character varying, bigint, character varying, character varying,
  bigint, character varying, character varying, numeric, character varying,
  bigint, character varying, bigint, character varying, bigint,
  character varying, bigint, character varying, bigint, bigint,
  timestamp with time zone, bigint, character varying, character varying,
  character varying, bigint, timestamp with time zone, character varying
);

DROP FUNCTION IF EXISTS public.f_post_tb_operacion_asistida(
  character varying, bigint, character varying, character varying,
  bigint, character varying, character varying, numeric, character varying,
  bigint, character varying, bigint, character varying, bigint,
  character varying, bigint, character varying, bigint, bigint,
  timestamp with time zone, bigint, character varying, character varying,
  character varying, bigint, timestamp with time zone, character varying,
  bigint, character varying, bigint, character varying
);

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
  p_fecha_registro timestamp with time zone DEFAULT NULL,
  p_tipo_documento_cliente bigint DEFAULT NULL,
  p_nombre_cliente character varying DEFAULT NULL,
  p_celular_cliente character varying DEFAULT NULL,
  p_email_cliente character varying DEFAULT NULL,
  p_id_empresa_destino bigint DEFAULT NULL,
  p_fecha_deposito_cliente timestamp with time zone DEFAULT NULL,
  p_numero_tarjeta character varying DEFAULT NULL,
  p_id_empresa_pos bigint DEFAULT NULL,
  p_nombre_empresa_pos character varying DEFAULT NULL,
  p_id_pos bigint DEFAULT NULL,
  p_nombre_pos character varying DEFAULT NULL
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
  v_celular_cliente bigint;
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
  v_id_empresa_pos bigint;
  v_nombre_empresa_pos character varying;
  v_id_pos bigint;
  v_nombre_pos character varying;
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

  IF v_ruta = 'pos' THEN
    SELECT e.id, e.nombre
    INTO v_id_empresa_pos, v_nombre_empresa_pos
    FROM public.tb_empresa e
    WHERE e.id = p_id_empresa_pos
      AND e.id_estado = 1
    LIMIT 1;

    IF v_id_empresa_pos IS NULL THEN
      RETURN jsonb_build_object('error', 'La Empresa POS seleccionada no esta activa.');
    END IF;

    SELECT p.id, p.nombre
    INTO v_id_pos, v_nombre_pos
    FROM public.tb_pos p
    WHERE p.id = p_id_pos
      AND p.id_estado = 1
    LIMIT 1;

    IF v_id_pos IS NULL THEN
      RETURN jsonb_build_object('error', 'El POS seleccionado no esta activo.');
    END IF;
  END IF;

  p_codigo_operacion_deposito_cliente := NULLIF(BTRIM(COALESCE(p_codigo_operacion_deposito_cliente, '')), '');
  p_numero_tarjeta := NULLIF(BTRIM(COALESCE(p_numero_tarjeta, '')), '');

  IF p_numero_tarjeta IS NOT NULL AND p_numero_tarjeta !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('error', 'El numero de tarjeta debe contener exactamente 4 digitos.');
  END IF;

  IF v_ruta = 'pos'
     AND p_codigo_operacion_deposito_cliente IS NOT NULL
     AND LENGTH(p_codigo_operacion_deposito_cliente) > 30 THEN
    RETURN jsonb_build_object('error', 'El codigo de operacion POS no puede superar los 30 caracteres.');
  END IF;

  IF v_ruta = 'pos' AND p_id_banco_destino IS NULL THEN
    RETURN jsonb_build_object('error', 'Selecciona el banco destino para la solicitud POS.');
  END IF;

  IF v_ruta = 'linkpago' AND p_id_banco_cliente IS NULL THEN
    RETURN jsonb_build_object('error', 'Selecciona la entidad tarjeta para Link Pago.');
  END IF;

  p_dni_cliente := REGEXP_REPLACE(COALESCE(p_dni_cliente, ''), '[^0-9]', '', 'g');
  v_celular_cliente := NULLIF(REGEXP_REPLACE(COALESCE(p_celular_cliente, ''), '[^0-9]', '', 'g'), '')::bigint;

  IF v_ruta = 'pos' AND p_id_banco_destino IS NOT NULL THEN
    SELECT rc.ruta, rc.id_empresa, e.nombre AS nombre_empresa,
           rc.id_empresa_cuenta_bancaria, ecb.id_banco, b.nombre AS nombre_banco
    INTO v_ruta_caja
    FROM public.tb_ruta_operacion_caja rc
    JOIN public.tb_empresa e ON e.id = rc.id_empresa
    JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = rc.id_empresa_cuenta_bancaria
    JOIN public.tb_banco b ON b.id = ecb.id_banco
    WHERE ecb.id_banco = p_id_banco_destino
      AND rc.id_estado = 1
      AND ecb.id_estado = 1
      AND e.id_estado = 1
      AND LOWER(COALESCE(rc.ruta, '')) <> 'safetypay'
      AND (p_id_empresa_destino IS NULL OR rc.id_empresa = p_id_empresa_destino)
      AND (p_id_empresa_destino IS NOT NULL OR rc.flag_caja_ingreso_principal = true)
    ORDER BY e.nombre ASC, rc.id ASC
    LIMIT 1;

    IF v_ruta_caja.ruta IS NULL THEN
      RETURN jsonb_build_object(
        'error', CASE
          WHEN p_id_empresa_destino IS NOT NULL
            THEN 'La empresa seleccionada no tiene una cuenta activa configurada para el banco seleccionado.'
          ELSE 'No existe caja de ingreso principal configurada para el banco seleccionado.'
        END
      );
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

  IF p_tipo_documento_cliente IS NOT NULL THEN
    IF p_tipo_documento_cliente NOT IN (1, 2) THEN
      RETURN jsonb_build_object('error', 'Tipo de documento invalido.');
    END IF;

    v_tipo_documento := p_tipo_documento_cliente;

    IF v_tipo_documento = 1 AND LENGTH(p_dni_cliente) <> 8 THEN
      RETURN jsonb_build_object('error', 'El DNI debe tener exactamente 8 dígitos.');
    END IF;

    IF v_tipo_documento = 2 AND LENGTH(p_dni_cliente) <> 9 THEN
      RETURN jsonb_build_object('error', 'El CE debe tener exactamente 9 dígitos.');
    END IF;
  ELSE
    v_tipo_documento := public.f_get_tb_documento_tipo_codigo('DNI');

    IF LENGTH(p_dni_cliente) = 11 THEN
      v_tipo_documento := public.f_get_tb_documento_tipo_codigo('RUC');
    END IF;
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
      celular,
      id_comunidad,
      id_estado,
      id_usuario
    )
    VALUES (
      v_tipo_documento,
      p_dni_cliente,
      NULLIF(BTRIM(COALESCE(p_nombre_cliente, '')), ''),
      v_celular_cliente,
      p_id_comunidad,
      (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1),
      p_id_usuario
    )
    RETURNING id, nombre INTO v_cliente_id, v_cliente_nombre;
  ELSIF NULLIF(BTRIM(COALESCE(p_nombre_cliente, '')), '') IS NOT NULL
     OR NULLIF(BTRIM(COALESCE(p_celular_cliente, '')), '') IS NOT NULL THEN
    PERFORM public.f_patch_tb_cliente(
      p_id := v_cliente_id,
      p_nombre := NULLIF(BTRIM(COALESCE(p_nombre_cliente, '')), ''),
      p_celular := v_celular_cliente,
      p_id_comunidad := p_id_comunidad,
      p_id_usuario := p_id_usuario
    );
    v_cliente_nombre := COALESCE(NULLIF(BTRIM(COALESCE(p_nombre_cliente, '')), ''), v_cliente_nombre);
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
    ROUND(COALESCE(p_monto_deposito_cliente, 0)::numeric, 2),
    v_regla.comision_servicio,
    v_regla.monto_minimo_deposito_servicio,
    v_regla.comision_minima_servicio,
    0::numeric
  );

  v_calc_ing := public.f_get_tb_operacion_calculo_comision_banco_ingreso(
    v_flag_por_sol_comision_banco_ingreso,
    ROUND(COALESCE(p_monto_deposito_cliente, 0)::numeric, 2),
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
    email_cliente,
    numero_tarjeta,
    id_empresa_pos,
    nombre_empresa_pos,
    id_pos,
    nombre_pos,
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
    COALESCE(NULLIF(BTRIM(COALESCE(v_cliente_nombre, '')), ''), NULLIF(BTRIM(COALESCE(p_nombre_cliente, '')), ''), ''),
    NULLIF(BTRIM(COALESCE(p_email_cliente, '')), ''),
    p_numero_tarjeta,
    CASE WHEN v_ruta = 'pos' THEN v_id_empresa_pos ELSE NULL END,
    CASE WHEN v_ruta = 'pos' THEN v_nombre_empresa_pos ELSE NULL END,
    CASE WHEN v_ruta = 'pos' THEN v_id_pos ELSE NULL END,
    CASE WHEN v_ruta = 'pos' THEN v_nombre_pos ELSE NULL END,
    ROUND(COALESCE(p_monto_deposito_cliente, 0)::numeric, 2),
    p_codigo_operacion_deposito_cliente,
    NULL,
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
    COALESCE(p_fecha_deposito_cliente, p_fecha_registro, now())
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_post_tb_operacion_asistida_pos_sin_envio
Objetivo:
  Registrar un POS directamente como Pagado cuando no se enviara una
  solicitud bancaria.

Reglas:
  - no resuelve empresa/cuenta de destino;
  - no calcula comisiones ni transferencia;
  - no crea movimientos de caja;
  - conserva el banco seleccionado como entidad bancaria del cliente;
  - reutiliza la misma logica de cliente del flujo POS asistido.
*/
DROP FUNCTION IF EXISTS public.f_post_tb_operacion_asistida_pos_sin_envio(
  bigint, character varying, character varying, bigint, character varying,
  character varying, numeric, bigint, character varying, bigint,
  character varying, character varying, character varying, bigint,
  character varying, bigint, character varying, bigint, character varying,
  timestamp with time zone
);

DROP FUNCTION IF EXISTS public.f_post_tb_operacion_asistida_pos_sin_envio(
  bigint, character varying, character varying, bigint, character varying,
  character varying, numeric, bigint, character varying, bigint,
  character varying, character varying, character varying, bigint,
  character varying, bigint, character varying, bigint, character varying,
  timestamp with time zone, character varying
);

DROP FUNCTION IF EXISTS public.f_post_tb_operacion_asistida_pos_sin_envio(
  bigint, character varying, character varying, bigint, character varying,
  character varying, numeric, bigint, character varying, bigint,
  character varying, character varying, character varying, bigint,
  character varying, bigint, character varying, bigint, character varying,
  timestamp with time zone, character varying, bigint, character varying,
  bigint, character varying
);

CREATE OR REPLACE FUNCTION public.f_post_tb_operacion_asistida_pos_sin_envio(
  p_id_codigo_servicio bigint,
  p_nombre_codigo_servicio character varying,
  p_tipo_servicio character varying,
  p_id_comunidad bigint,
  p_nombre_comunidad character varying,
  p_dni_cliente character varying,
  p_monto_deposito_cliente numeric,
  p_id_banco_cliente bigint,
  p_codigo_operacion_deposito_cliente character varying DEFAULT NULL,
  p_tipo_documento_cliente bigint DEFAULT NULL,
  p_nombre_cliente character varying DEFAULT NULL,
  p_celular_cliente character varying DEFAULT NULL,
  p_email_cliente character varying DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL,
  p_id_usuario_solicitud bigint DEFAULT NULL,
  p_nombre_usuario_solicitud character varying DEFAULT NULL,
  p_fecha_registro timestamp with time zone DEFAULT NULL,
  p_numero_tarjeta character varying DEFAULT NULL,
  p_id_empresa_pos bigint DEFAULT NULL,
  p_nombre_empresa_pos character varying DEFAULT NULL,
  p_id_pos bigint DEFAULT NULL,
  p_nombre_pos character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id bigint;
  v_cliente_id bigint;
  v_cliente_nombre character varying;
  v_tipo_documento bigint;
  v_celular_cliente bigint;
  v_nombre_banco_cliente character varying;
  v_id_empresa_pos bigint;
  v_nombre_empresa_pos character varying;
  v_id_pos bigint;
  v_nombre_pos character varying;
  v_id_estado bigint;
  v_nombre_estado character varying;
  v_fecha_registro timestamp with time zone := COALESCE(p_fecha_registro, now());
  v_monto numeric := ROUND(COALESCE(p_monto_deposito_cliente, 0)::numeric, 2);
BEGIN
  IF v_monto <= 0 THEN
    RETURN jsonb_build_object('error', 'El monto debe ser mayor a cero.');
  END IF;

  p_codigo_operacion_deposito_cliente := NULLIF(BTRIM(COALESCE(p_codigo_operacion_deposito_cliente, '')), '');
  p_numero_tarjeta := NULLIF(BTRIM(COALESCE(p_numero_tarjeta, '')), '');

  IF p_numero_tarjeta IS NOT NULL AND p_numero_tarjeta !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('error', 'El numero de tarjeta debe contener exactamente 4 digitos.');
  END IF;

  IF p_codigo_operacion_deposito_cliente IS NOT NULL
     AND LENGTH(p_codigo_operacion_deposito_cliente) > 30 THEN
    RETURN jsonb_build_object('error', 'El codigo de operacion POS no puede superar los 30 caracteres.');
  END IF;

  SELECT e.id, e.nombre
  INTO v_id_empresa_pos, v_nombre_empresa_pos
  FROM public.tb_empresa e
  WHERE e.id = p_id_empresa_pos
    AND e.id_estado = 1
  LIMIT 1;

  IF v_id_empresa_pos IS NULL THEN
    RETURN jsonb_build_object('error', 'La Empresa POS seleccionada no esta activa.');
  END IF;

  SELECT p.id, p.nombre
  INTO v_id_pos, v_nombre_pos
  FROM public.tb_pos p
  WHERE p.id = p_id_pos
    AND p.id_estado = 1
  LIMIT 1;

  IF v_id_pos IS NULL THEN
    RETURN jsonb_build_object('error', 'El POS seleccionado no esta activo.');
  END IF;

  SELECT b.nombre
  INTO v_nombre_banco_cliente
  FROM public.tb_banco b
  WHERE b.id = p_id_banco_cliente
    AND b.id_estado = 1;

  IF v_nombre_banco_cliente IS NULL THEN
    RETURN jsonb_build_object('error', 'La entidad tarjeta seleccionada no esta activa.');
  END IF;

  SELECT id, nombre
  INTO v_id_estado, v_nombre_estado
  FROM public.tb_estado
  WHERE UPPER(BTRIM(COALESCE(nombre, ''))) = 'PAGADO'
  LIMIT 1;

  IF v_id_estado IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro el estado Pagado.');
  END IF;

  p_dni_cliente := REGEXP_REPLACE(COALESCE(p_dni_cliente, ''), '[^0-9]', '', 'g');
  v_celular_cliente := NULLIF(REGEXP_REPLACE(COALESCE(p_celular_cliente, ''), '[^0-9]', '', 'g'), '')::bigint;

  IF p_tipo_documento_cliente IS NOT NULL THEN
    IF p_tipo_documento_cliente NOT IN (1, 2) THEN
      RETURN jsonb_build_object('error', 'Tipo de documento invalido.');
    END IF;

    v_tipo_documento := p_tipo_documento_cliente;

    IF v_tipo_documento = 1 AND LENGTH(p_dni_cliente) <> 8 THEN
      RETURN jsonb_build_object('error', 'El DNI debe tener exactamente 8 digitos.');
    END IF;

    IF v_tipo_documento = 2 AND LENGTH(p_dni_cliente) <> 9 THEN
      RETURN jsonb_build_object('error', 'El CE debe tener exactamente 9 digitos.');
    END IF;
  ELSE
    v_tipo_documento := public.f_get_tb_documento_tipo_codigo('DNI');

    IF LENGTH(p_dni_cliente) = 11 THEN
      v_tipo_documento := public.f_get_tb_documento_tipo_codigo('RUC');
    END IF;
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
      celular,
      id_comunidad,
      id_estado,
      id_usuario
    )
    VALUES (
      v_tipo_documento,
      p_dni_cliente,
      NULLIF(BTRIM(COALESCE(p_nombre_cliente, '')), ''),
      v_celular_cliente,
      p_id_comunidad,
      (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1),
      p_id_usuario
    )
    RETURNING id, nombre INTO v_cliente_id, v_cliente_nombre;
  ELSIF v_cliente_id IS NOT NULL
     AND (
       NULLIF(BTRIM(COALESCE(p_nombre_cliente, '')), '') IS NOT NULL
       OR NULLIF(BTRIM(COALESCE(p_celular_cliente, '')), '') IS NOT NULL
     ) THEN
    PERFORM public.f_patch_tb_cliente(
      p_id := v_cliente_id,
      p_nombre := NULLIF(BTRIM(COALESCE(p_nombre_cliente, '')), ''),
      p_celular := v_celular_cliente,
      p_id_comunidad := p_id_comunidad,
      p_id_usuario := p_id_usuario
    );
    v_cliente_nombre := COALESCE(NULLIF(BTRIM(COALESCE(p_nombre_cliente, '')), ''), v_cliente_nombre);
  END IF;

  INSERT INTO public.tb_operacion_proceso (
    id_codigo_servicio,
    nombre_codigo_servicio,
    tipo_servicio,
    id_comunidad,
    nombre_comunidad,
    id_cliente,
    dni_cliente,
    nombre_cliente,
    email_cliente,
    numero_tarjeta,
    id_empresa_pos,
    nombre_empresa_pos,
    id_pos,
    nombre_pos,
    monto_deposito_cliente,
    codigo_operacion_deposito_cliente,
    id_banco_cliente,
    nombre_banco_cliente,
    flag_por_sol_comision_banco_ingreso,
    comision_banco_ingreso,
    comision_minimo_banco_ingreso,
    comision_igv_banco_ingreso,
    resultado_comision_banco_ingreso,
    monto_itf_ingreso,
    comision_servicio,
    monto_minimo_deposito_servicio,
    comision_minima_servicio,
    comision_monto_extra_servicio,
    resultado_comision_servicio,
    comision_transf_banco_salida,
    comision_transf_inter_banco_salida,
    resultado_comision_banco_salida,
    monto_transferencia_cliente,
    monto_itf_salida,
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
    fecha_pagado,
    tipo_facturacion,
    tipo_recaudacion_sf,
    fecha_registro
  )
  VALUES (
    p_id_codigo_servicio,
    p_nombre_codigo_servicio,
    COALESCE(NULLIF(BTRIM(COALESCE(p_tipo_servicio, '')), ''), 'POS'),
    p_id_comunidad,
    p_nombre_comunidad,
    v_cliente_id,
    p_dni_cliente,
    COALESCE(NULLIF(BTRIM(COALESCE(v_cliente_nombre, '')), ''), NULLIF(BTRIM(COALESCE(p_nombre_cliente, '')), ''), ''),
    NULLIF(BTRIM(COALESCE(p_email_cliente, '')), ''),
    p_numero_tarjeta,
    v_id_empresa_pos,
    v_nombre_empresa_pos,
    v_id_pos,
    v_nombre_pos,
    v_monto,
    p_codigo_operacion_deposito_cliente,
    p_id_banco_cliente,
    v_nombre_banco_cliente,
    false,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    v_id_estado,
    v_nombre_estado,
    p_id_usuario,
    p_nombre_usuario,
    COALESCE(p_id_usuario_gestor, p_id_usuario),
    COALESCE(p_nombre_usuario_gestor, p_nombre_usuario),
    COALESCE(p_id_usuario_solicitud, p_id_usuario),
    COALESCE(p_nombre_usuario_solicitud, p_nombre_usuario),
    'pos',
    'pos',
    false,
    v_fecha_registro,
    'Boleta',
    NULL,
    v_fecha_registro
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
-- Funcion: f_patch_tb_operacion_asistida_fecha_deposito
-- Objetivo:
--   Actualizar solo la fecha de registro de una operacion Link Pago.
--   La hora se toma del momento actual en hora de Lima.
--
-- Reglas:
--   - no recalcula comisiones;
--   - no modifica estados, caja ni movimientos;
--   - en pendientes respeta el permiso del usuario de la operacion;
--   - en pagadas permite la correccion de fecha a cualquier usuario habilitado.
-- ============================================================================
DROP FUNCTION IF EXISTS public.f_patch_tb_operacion_asistida_fecha_deposito(
  bigint, date, bigint
);

CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_asistida_fecha_deposito(
  p_id bigint,
  p_fecha_deposito_cliente date,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_fecha_registro timestamp with time zone;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  FOR UPDATE;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion no encontrada.');
  END IF;

  IF LOWER(COALESCE(v_actual.ruta_origen, '')) NOT IN ('linkpago', 'pos') THEN
    RETURN jsonb_build_object('error', 'La operacion no pertenece a Link Pago o POS.');
  END IF;

  IF p_fecha_deposito_cliente IS NULL THEN
    RETURN jsonb_build_object('error', 'La fecha de registro es obligatoria.');
  END IF;

  IF UPPER(BTRIM(COALESCE(v_actual.nombre_estado, ''))) <> 'PAGADO'
  AND EXISTS (
    SELECT 1
    FROM public.tb_usuario u
    LEFT JOIN public.tb_rol r ON r.id = u.id_rol
    WHERE u.id = p_id_usuario
      AND (
        u.id_rol = 3
        OR UPPER(BTRIM(COALESCE(r.nombre, ''))) = 'JEFE DE TIENDA'
      )
  )
  AND (
    v_actual.id_usuario_solicitud IS NULL
    OR v_actual.id_usuario_solicitud IS DISTINCT FROM p_id_usuario
  ) THEN
    RETURN jsonb_build_object('error', 'Solo el usuario que registro la operacion puede editarla.');
  END IF;

  v_fecha_registro := (
    p_fecha_deposito_cliente::timestamp
    + ((now() AT TIME ZONE 'America/Lima')::time)
  ) AT TIME ZONE 'America/Lima';

  UPDATE public.tb_operacion_proceso
  SET fecha_registro = v_fecha_registro
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
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
--   - en POS pagado permite corregir Empresa/POS, pero conserva monto y destino;
--   - no crea movimientos de caja;
--   - no cambia estado ni fechas de control.
-- ============================================================================
DROP FUNCTION IF EXISTS public.f_patch_tb_operacion_asistida(
  bigint, bigint, character varying, character varying, bigint,
  character varying, numeric, bigint, character varying, bigint, bigint,
  character varying
);

DROP FUNCTION IF EXISTS public.f_patch_tb_operacion_asistida(
  bigint, bigint, character varying, character varying, bigint,
  character varying, numeric, bigint, character varying, bigint, bigint,
  character varying, bigint, character varying
);

DROP FUNCTION IF EXISTS public.f_patch_tb_operacion_asistida(
  bigint, bigint, character varying, character varying, bigint,
  character varying, numeric, bigint, character varying, bigint, bigint,
  character varying, bigint, character varying, boolean
);

DROP FUNCTION IF EXISTS public.f_patch_tb_operacion_asistida(
  bigint, bigint, character varying, character varying, bigint,
  character varying, numeric, bigint, character varying, bigint, bigint,
  character varying, bigint, character varying, boolean,
  bigint, character varying, bigint, character varying
);

DROP FUNCTION IF EXISTS public.f_patch_tb_operacion_asistida(
  bigint, bigint, character varying, character varying, bigint,
  character varying, numeric, bigint, character varying, bigint, bigint,
  character varying, bigint, character varying, boolean,
  bigint, character varying, bigint, character varying, character varying
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
  p_nombre_usuario character varying DEFAULT NULL,
  p_tipo_documento_cliente bigint DEFAULT NULL,
  p_id_banco_destino bigint DEFAULT NULL,
  p_email_cliente character varying DEFAULT NULL,
  p_id_ruta_operacion_caja_destino bigint DEFAULT NULL,
  p_numero_tarjeta character varying DEFAULT NULL,
  p_sin_envio_solicitud boolean DEFAULT NULL,
  p_id_empresa_pos bigint DEFAULT NULL,
  p_nombre_empresa_pos character varying DEFAULT NULL,
  p_id_pos bigint DEFAULT NULL,
  p_nombre_pos character varying DEFAULT NULL,
  p_codigo_operacion_deposito_cliente character varying DEFAULT NULL
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
  v_id_empresa_pos bigint;
  v_nombre_empresa_pos character varying;
  v_id_pos bigint;
  v_nombre_pos character varying;
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
  v_ruta_destino_resolved character varying;
  v_regla record;
  v_calc_serv jsonb;
  v_calc_ing jsonb;
  v_calc_sal jsonb;
  v_id_estado_pagado bigint;
  v_nombre_estado_pagado character varying;
  v_id_estado_solicitado bigint;
  v_nombre_estado_solicitado character varying;
  v_reactivar_solicitud boolean := false;
BEGIN
  p_numero_tarjeta := NULLIF(BTRIM(COALESCE(p_numero_tarjeta, '')), '');
  p_codigo_operacion_deposito_cliente := NULLIF(BTRIM(COALESCE(p_codigo_operacion_deposito_cliente, '')), '');

  IF p_numero_tarjeta IS NOT NULL AND p_numero_tarjeta !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('error', 'El numero de tarjeta debe contener exactamente 4 digitos.');
  END IF;

  SELECT * INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion no encontrada.');
  END IF;

  IF LOWER(COALESCE(v_actual.ruta_origen, '')) = 'pos'
     AND UPPER(BTRIM(COALESCE(v_actual.nombre_estado, ''))) = 'PAGADO' THEN
    IF p_monto_deposito_cliente IS NOT NULL
       AND ROUND(p_monto_deposito_cliente::numeric, 2)
         IS DISTINCT FROM ROUND(COALESCE(v_actual.monto_deposito_cliente, 0)::numeric, 2) THEN
      RETURN jsonb_build_object('error', 'No se puede modificar el monto de una operacion POS pagada.');
    END IF;

    IF p_id_banco_destino IS NOT NULL
       AND p_id_banco_destino IS DISTINCT FROM v_actual.id_banco_cliente_transferencia THEN
      RETURN jsonb_build_object('error', 'No se puede modificar el banco de transferencia de una operacion POS pagada.');
    END IF;

    IF p_id_ruta_operacion_caja_destino IS NOT NULL THEN
      RETURN jsonb_build_object('error', 'No se puede modificar el destino de una operacion POS pagada.');
    END IF;

    IF p_sin_envio_solicitud IS NOT NULL
       AND p_sin_envio_solicitud IS DISTINCT FROM (
         v_actual.id_empresa_salida IS NULL
         AND v_actual.id_empresa_cuenta_salida IS NULL
         AND v_actual.id_banco_cliente_transferencia IS NULL
         AND COALESCE(v_actual.monto_transferencia_cliente, 0) = 0
       ) THEN
      RETURN jsonb_build_object('error', 'No se puede cambiar el modo de envio de una operacion POS pagada.');
    END IF;
  END IF;

  IF LOWER(COALESCE(v_actual.ruta_origen, '')) = 'pos' THEN
    IF p_codigo_operacion_deposito_cliente IS NOT NULL
       AND LENGTH(p_codigo_operacion_deposito_cliente) > 30 THEN
      RETURN jsonb_build_object('error', 'El codigo de operacion no puede superar los 30 caracteres.');
    END IF;

    p_id_empresa_pos := COALESCE(p_id_empresa_pos, v_actual.id_empresa_pos);
    p_id_pos := COALESCE(p_id_pos, v_actual.id_pos);

    IF p_id_empresa_pos IS NULL
       AND p_id_pos IS NULL
       AND v_actual.id_empresa_pos IS NULL
       AND v_actual.id_pos IS NULL THEN
      v_id_empresa_pos := NULL;
      v_nombre_empresa_pos := NULL;
      v_id_pos := NULL;
      v_nombre_pos := NULL;
    ELSE
      SELECT e.id, e.nombre
      INTO v_id_empresa_pos, v_nombre_empresa_pos
      FROM public.tb_empresa e
      WHERE e.id = p_id_empresa_pos
        AND e.id_estado = 1
      LIMIT 1;

      IF v_id_empresa_pos IS NULL THEN
        RETURN jsonb_build_object('error', 'La Empresa POS seleccionada no esta activa.');
      END IF;

      SELECT p.id, p.nombre
      INTO v_id_pos, v_nombre_pos
      FROM public.tb_pos p
      WHERE p.id = p_id_pos
        AND p.id_estado = 1
      LIMIT 1;

      IF v_id_pos IS NULL THEN
        RETURN jsonb_build_object('error', 'El POS seleccionado no esta activo.');
      END IF;
    END IF;
  END IF;

  v_reactivar_solicitud := LOWER(COALESCE(v_actual.ruta_origen, '')) = 'pos'
    AND p_sin_envio_solicitud IS FALSE
    AND UPPER(BTRIM(COALESCE(v_actual.nombre_estado, ''))) = 'PAGADO'
    AND v_actual.id_empresa_salida IS NULL
    AND v_actual.id_empresa_cuenta_salida IS NULL
    AND v_actual.id_banco_cliente_transferencia IS NULL
    AND COALESCE(v_actual.monto_transferencia_cliente, 0) = 0
    AND COALESCE(v_actual.resultado_comision_servicio, 0) = 0
    AND COALESCE(v_actual.resultado_comision_banco_salida, 0) = 0;

  IF LOWER(COALESCE(v_actual.ruta_origen, '')) NOT IN ('pos', 'linkpago') THEN
    RETURN jsonb_build_object('error', 'La operacion no pertenece a una ruta asistida.');
  END IF;

  IF UPPER(BTRIM(COALESCE(v_actual.nombre_estado, ''))) <> 'PAGADO'
  AND EXISTS (
    SELECT 1
    FROM public.tb_usuario u
    LEFT JOIN public.tb_rol r ON r.id = u.id_rol
    WHERE u.id = p_id_usuario
      AND (
        u.id_rol = 3
        OR UPPER(BTRIM(COALESCE(r.nombre, ''))) = 'JEFE DE TIENDA'
      )
  )
  AND (
    v_actual.id_usuario_solicitud IS NULL
    OR v_actual.id_usuario_solicitud IS DISTINCT FROM p_id_usuario
  ) THEN
    RETURN jsonb_build_object('error', 'Solo el usuario que registro la operacion puede editarla.');
  END IF;

  p_dni_cliente := COALESCE(p_dni_cliente, v_actual.dni_cliente);
  p_dni_cliente := REGEXP_REPLACE(COALESCE(p_dni_cliente, ''), '[^0-9]', '', 'g');
  p_nombre_cliente := COALESCE(p_nombre_cliente, v_actual.nombre_cliente);
  p_email_cliente := NULLIF(BTRIM(COALESCE(p_email_cliente, '')), '');
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

  IF p_sin_envio_solicitud IS TRUE AND LOWER(COALESCE(v_actual.ruta_origen, '')) = 'pos' THEN
    v_ruta_destino_resolved := 'pos';
    v_id_empresa_salida := NULL;
    v_nombre_empresa_salida := NULL;
    v_id_empresa_cuenta_salida := NULL;
    v_id_banco_empresa_cuenta_salida := NULL;
    v_nombre_banco_empresa_cuenta_salida := NULL;
  ELSIF LOWER(COALESCE(v_actual.ruta_origen, '')) = 'pos' AND p_id_ruta_operacion_caja_destino IS NOT NULL THEN
    SELECT
      rc.ruta,
      rc.id_empresa,
      e.nombre,
      rc.id_empresa_cuenta_bancaria,
      ecb.id_banco,
      b.nombre
    INTO
      v_ruta_destino_resolved,
      v_id_empresa_salida,
      v_nombre_empresa_salida,
      v_id_empresa_cuenta_salida,
      v_id_banco_empresa_cuenta_salida,
      v_nombre_banco_empresa_cuenta_salida
    FROM public.tb_ruta_operacion_caja rc
    JOIN public.tb_empresa e ON e.id = rc.id_empresa
    JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = rc.id_empresa_cuenta_bancaria
    JOIN public.tb_banco b ON b.id = ecb.id_banco
    WHERE rc.id = p_id_ruta_operacion_caja_destino
      AND rc.id_estado = 1
      AND e.id_estado = 1
      AND ecb.id_estado = 1
      AND LOWER(COALESCE(rc.ruta, '')) <> 'safetypay'
    LIMIT 1
    FOR UPDATE OF rc;

    IF v_id_empresa_salida IS NULL THEN
      RETURN jsonb_build_object('error', 'La empresa y cuenta destino no tienen una asociacion operativa activa.');
    END IF;

    IF p_id_banco_destino IS NOT NULL AND v_id_banco_empresa_cuenta_salida IS DISTINCT FROM p_id_banco_destino THEN
      RETURN jsonb_build_object('error', 'La empresa y cuenta destino no pertenecen al banco seleccionado.');
    END IF;
  ELSIF LOWER(COALESCE(v_actual.ruta_origen, '')) = 'pos' THEN
    SELECT
      rc.ruta,
      rc.id_empresa,
      e.nombre,
      rc.id_empresa_cuenta_bancaria,
      ecb.id_banco,
      b.nombre
    INTO
      v_ruta_destino_resolved,
      v_id_empresa_salida,
      v_nombre_empresa_salida,
      v_id_empresa_cuenta_salida,
      v_id_banco_empresa_cuenta_salida,
      v_nombre_banco_empresa_cuenta_salida
    FROM public.tb_ruta_operacion_caja rc
    JOIN public.tb_empresa e ON e.id = rc.id_empresa
    JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = rc.id_empresa_cuenta_bancaria
    JOIN public.tb_banco b ON b.id = ecb.id_banco
    WHERE rc.id_estado = 1
      AND ecb.id_estado = 1
      AND ecb.id_banco = COALESCE(p_id_banco_destino, v_actual.id_banco_cliente_transferencia)
      AND rc.flag_caja_ingreso_principal = true
      AND LOWER(COALESCE(rc.ruta, '')) <> 'safetypay'
    LIMIT 1;

    IF v_id_empresa_salida IS NULL THEN
      RETURN jsonb_build_object('error', 'No existe una cuenta activa para el banco de transferencia seleccionado.');
    END IF;
  END IF;

  IF p_tipo_documento_cliente IS NOT NULL THEN
    IF p_tipo_documento_cliente NOT IN (1, 2) THEN
      RETURN jsonb_build_object('error', 'Tipo de documento invalido.');
    END IF;

    v_tipo_documento := p_tipo_documento_cliente;

    IF v_tipo_documento = 1 AND LENGTH(p_dni_cliente) <> 8 THEN
      RETURN jsonb_build_object('error', 'El DNI debe tener exactamente 8 dígitos.');
    END IF;

    IF v_tipo_documento = 2 AND LENGTH(p_dni_cliente) <> 9 THEN
      RETURN jsonb_build_object('error', 'El CE debe tener exactamente 9 dígitos.');
    END IF;
  ELSE
    v_tipo_documento := public.f_get_tb_documento_tipo_codigo('DNI');
    IF LENGTH(p_dni_cliente) = 11 THEN
      v_tipo_documento := public.f_get_tb_documento_tipo_codigo('RUC');
    END IF;
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

  IF p_sin_envio_solicitud IS TRUE AND LOWER(COALESCE(v_actual.ruta_origen, '')) = 'pos' THEN
    SELECT id, nombre
    INTO v_id_estado_pagado, v_nombre_estado_pagado
    FROM public.tb_estado
    WHERE UPPER(BTRIM(COALESCE(nombre, ''))) = 'PAGADO'
    LIMIT 1;

    IF v_id_estado_pagado IS NULL THEN
      RETURN jsonb_build_object('error', 'No se encontro el estado Pagado.');
    END IF;

    UPDATE public.tb_operacion_proceso
    SET id_cliente = COALESCE(v_cliente_id, id_cliente),
        dni_cliente = p_dni_cliente,
        nombre_cliente = COALESCE(v_cliente_nombre, p_nombre_cliente, ''),
        email_cliente = COALESCE(p_email_cliente, email_cliente),
        codigo_operacion_deposito_cliente = COALESCE(p_codigo_operacion_deposito_cliente, codigo_operacion_deposito_cliente),
        numero_tarjeta = p_numero_tarjeta,
        id_comunidad = p_id_comunidad,
        nombre_comunidad = p_nombre_comunidad,
        monto_deposito_cliente = ROUND(COALESCE(p_monto_deposito_cliente, 0)::numeric, 2),
        id_banco_cliente = v_id_banco_cliente_resolved,
        nombre_banco_cliente = v_nombre_banco_cliente_resolved,
        id_empresa_ingreso = NULL,
        nombre_empresa_ingreso = NULL,
        id_empresa_cuenta_ingreso = NULL,
        id_banco_empresa_cuenta_ingreso = NULL,
        nombre_banco_empresa_cuenta_ingreso = NULL,
        flag_por_sol_comision_banco_ingreso = NULL,
        id_banco_cliente_transferencia = NULL,
        nombre_banco_cliente_transferencia = NULL,
        id_empresa_salida = NULL,
        nombre_empresa_salida = NULL,
        id_empresa_cuenta_salida = NULL,
        id_banco_empresa_cuenta_salida = NULL,
        nombre_banco_empresa_cuenta_salida = NULL,
        comision_banco_ingreso = 0,
        comision_minimo_banco_ingreso = 0,
        comision_igv_banco_ingreso = 0,
        resultado_comision_banco_ingreso = 0,
        monto_itf_ingreso = 0,
        comision_servicio = 0,
        monto_minimo_deposito_servicio = 0,
        comision_minima_servicio = 0,
        comision_monto_extra_servicio = 0,
        resultado_comision_servicio = 0,
        comision_transf_banco_salida = 0,
        comision_transf_inter_banco_salida = 0,
        resultado_comision_banco_salida = 0,
        monto_transferencia_cliente = 0,
        monto_itf_salida = 0,
        id_estado = v_id_estado_pagado,
        nombre_estado = v_nombre_estado_pagado,
        fecha_pagado = COALESCE(v_actual.fecha_pagado, now()),
        ruta_destino = 'pos',
        id_usuario = COALESCE(p_id_usuario, id_usuario),
        nombre_usuario = COALESCE(p_nombre_usuario, nombre_usuario)
    WHERE id = p_id;

    RETURN (
      SELECT x
      FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
      LIMIT 1
    );
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
    ROUND(COALESCE(p_monto_deposito_cliente, 0)::numeric, 2),
    v_regla.comision_servicio,
    v_regla.monto_minimo_deposito_servicio,
    v_regla.comision_minima_servicio,
    0::numeric
  );

  v_calc_ing := public.f_get_tb_operacion_calculo_comision_banco_ingreso(
    v_flag_por_sol_comision_banco_ingreso,
    ROUND(COALESCE(p_monto_deposito_cliente, 0)::numeric, 2),
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

  IF v_reactivar_solicitud THEN
    SELECT id, nombre
    INTO v_id_estado_solicitado, v_nombre_estado_solicitado
    FROM public.tb_estado
    WHERE UPPER(BTRIM(COALESCE(nombre, ''))) IN ('SOLICITADO', 'PENDIENTE')
    ORDER BY CASE WHEN UPPER(BTRIM(COALESCE(nombre, ''))) = 'SOLICITADO' THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_id_estado_solicitado IS NULL THEN
      RETURN jsonb_build_object('error', 'No se encontro el estado Solicitud.');
    END IF;
  END IF;

  UPDATE public.tb_operacion_proceso
  SET id_cliente = COALESCE(v_cliente_id, id_cliente),
      dni_cliente = p_dni_cliente,
      nombre_cliente = COALESCE(v_cliente_nombre, p_nombre_cliente, ''),
      email_cliente = COALESCE(p_email_cliente, email_cliente),
      codigo_operacion_deposito_cliente = COALESCE(p_codigo_operacion_deposito_cliente, codigo_operacion_deposito_cliente),
      numero_tarjeta = p_numero_tarjeta,
      id_comunidad = p_id_comunidad,
      nombre_comunidad = p_nombre_comunidad,
      monto_deposito_cliente = ROUND(COALESCE(p_monto_deposito_cliente, 0)::numeric, 2),
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
      id_estado = CASE WHEN v_reactivar_solicitud THEN v_id_estado_solicitado ELSE id_estado END,
      nombre_estado = CASE WHEN v_reactivar_solicitud THEN v_nombre_estado_solicitado ELSE nombre_estado END,
      fecha_pagado = CASE WHEN v_reactivar_solicitud THEN NULL ELSE fecha_pagado END,
      fecha_pendiente = CASE WHEN v_reactivar_solicitud THEN now() ELSE fecha_pendiente END,
      id_usuario = COALESCE(p_id_usuario, id_usuario),
      nombre_usuario = COALESCE(p_nombre_usuario, nombre_usuario),
      id_empresa_pos = COALESCE(v_id_empresa_pos, id_empresa_pos),
      nombre_empresa_pos = COALESCE(v_nombre_empresa_pos, nombre_empresa_pos),
      id_pos = COALESCE(v_id_pos, id_pos),
      nombre_pos = COALESCE(v_nombre_pos, nombre_pos),
      ruta_destino = COALESCE(v_ruta_destino_resolved, ruta_destino)
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
WHERE p.proname IN ('f_get_tb_operacion_asistida_bandeja')
ORDER BY n.nspname, p.proname;
