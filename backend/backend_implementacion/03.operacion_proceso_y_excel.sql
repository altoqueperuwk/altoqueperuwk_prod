-- ============================================================================
-- 12. TB_OPERACION_PROCESO
-- ============================================================================

/*
Tabla: tb_operacion_proceso
Objetivo:
  Registrar la operacion comercial congelando los datos funcionales,
  comerciales y monetarios realmente aplicados al momento del registro.

Justificacion del modelo en la etapa compacta:
  - conserva ids tecnicos necesarios para trazabilidad
  - conserva nombres materializados para auditoria historica
  - conserva reglas y resultados congelados para evitar que cambios futuros
    en catalogos o comisiones alteren la lectura historica
  - no incorpora todavia la capa contable de caja en este archivo
  - `id_usuario` representa al usuario que registra la operacion
  - `id_usuario_gestor` representa al responsable operativo actual
  - `id_usuario_reasignado` representa el ultimo destino de reasignacion
  - `id_usuario_solicitud` representa el origen de la solicitud

Nota de compactacion:
  Aunque existen campos que en el futuro podrian reagruparse o compactarse
  mas aun, en esta etapa se mantiene el detalle que hoy utiliza el frontend
  de Operaciones para:
    1. registro manual
    2. carga Excel
    3. autoguardado inline
    4. auditoria visual de comisiones
*/
CREATE TABLE IF NOT EXISTS public.tb_operacion_proceso (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_codigo_servicio bigint,
  nombre_codigo_servicio character varying,
  id_comunidad bigint,
  nombre_comunidad character varying,
  id_tipo_deposito bigint,
  nombre_tipo_deposito character varying,
  id_cliente bigint,
  dni_cliente character varying,
  nombre_cliente character varying,
  id_banco_cliente bigint,
  nombre_banco_cliente character varying,
  monto_deposito_cliente bigint,
  codigo_operacion_deposito_cliente character varying,
  fecha_deposito_cliente timestamp with time zone,
  id_empresa_ingreso bigint,
  nombre_empresa_ingreso character varying,
  id_empresa_cuenta_ingreso bigint,
  id_banco_empresa_cuenta_ingreso bigint,
  nombre_banco_empresa_cuenta_ingreso character varying,
  flag_por_sol_comision_banco_ingreso boolean,
  comision_banco_ingreso numeric,
  comision_minimo_banco_ingreso numeric,
  comision_igv_banco_ingreso numeric,
  resultado_comision_banco_ingreso numeric,
  monto_itf_ingreso numeric,
  comision_servicio numeric,
  monto_minimo_deposito_servicio numeric,
  comision_minima_servicio numeric,
  comision_monto_extra_servicio bigint,
  resultado_comision_servicio numeric,
  id_empresa_salida bigint,
  nombre_empresa_salida character varying,
  id_empresa_cuenta_salida bigint,
  id_banco_empresa_cuenta_salida bigint,
  nombre_banco_empresa_cuenta_salida character varying,
  comision_transf_banco_salida numeric,
  comision_transf_inter_banco_salida numeric,
  resultado_comision_banco_salida numeric,
  monto_transferencia_cliente numeric,
  monto_itf_salida numeric,
  id_banco_cliente_transferencia bigint,
  nombre_banco_cliente_transferencia character varying,
  id_estado bigint,
  nombre_estado character varying,
  id_usuario bigint,
  nombre_usuario character varying,
  id_usuario_gestor bigint,
  nombre_usuario_gestor character varying,
  id_usuario_reasignado bigint,
  nombre_usuario_reasignado character varying,
  id_usuario_solicitud bigint,
  nombre_usuario_solicitud character varying,
  fecha_pendiente timestamp with time zone,
  fecha_pagado timestamp with time zone,
  error_motivo character varying,
  observacion_tiempo text,
  tipo_facturacion character varying DEFAULT 'Boleta',
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_operacion_proceso_pkey PRIMARY KEY (id)
);

/*
Funcion: f_get_tb_operacion_proceso
Objetivo:
  Consultar operaciones con filtros opcionales sobre los principales campos
  operativos, comerciales, monetarios y de auditoria.

Diseno:
  - responde directamente con los campos congelados de la tabla
  - no recalcula nada
  - sirve tanto para detalle como para datatable
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_proceso(
  p_id bigint DEFAULT NULL,
  p_id_codigo_servicio bigint DEFAULT NULL,
  p_nombre_codigo_servicio character varying DEFAULT NULL,
  p_id_comunidad bigint DEFAULT NULL,
  p_nombre_comunidad character varying DEFAULT NULL,
  p_id_tipo_deposito bigint DEFAULT NULL,
  p_nombre_tipo_deposito character varying DEFAULT NULL,
  p_id_cliente bigint DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_nombre_cliente character varying DEFAULT NULL,
  p_id_banco_cliente bigint DEFAULT NULL,
  p_nombre_banco_cliente character varying DEFAULT NULL,
  p_monto_deposito_cliente bigint DEFAULT NULL,
  p_codigo_operacion_deposito_cliente character varying DEFAULT NULL,
  p_fecha_deposito_desde timestamp with time zone DEFAULT NULL,
  p_fecha_deposito_hasta timestamp with time zone DEFAULT NULL,
  p_id_empresa_ingreso bigint DEFAULT NULL,
  p_nombre_empresa_ingreso character varying DEFAULT NULL,
  p_id_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_nombre_banco_empresa_cuenta_ingreso character varying DEFAULT NULL,
  p_comision_servicio numeric DEFAULT NULL,
  p_comision_monto_extra_servicio bigint DEFAULT NULL,
  p_resultado_comision_servicio numeric DEFAULT NULL,
  p_id_empresa_salida bigint DEFAULT NULL,
  p_nombre_empresa_salida character varying DEFAULT NULL,
  p_id_empresa_cuenta_salida bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_salida bigint DEFAULT NULL,
  p_nombre_banco_empresa_cuenta_salida character varying DEFAULT NULL,
  p_resultado_comision_banco_ingreso numeric DEFAULT NULL,
  p_resultado_comision_banco_salida numeric DEFAULT NULL,
  p_monto_transferencia_cliente numeric DEFAULT NULL,
  p_id_banco_cliente_transferencia bigint DEFAULT NULL,
  p_nombre_banco_cliente_transferencia character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_nombre_estado character varying DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL,
  p_id_usuario_reasignado bigint DEFAULT NULL,
  p_nombre_usuario_reasignado character varying DEFAULT NULL,
  p_id_usuario_solicitud bigint DEFAULT NULL,
  p_nombre_usuario_solicitud character varying DEFAULT NULL,
  p_fecha_pendiente_desde timestamp with time zone DEFAULT NULL,
  p_fecha_pendiente_hasta timestamp with time zone DEFAULT NULL,
  p_fecha_pagado_desde timestamp with time zone DEFAULT NULL,
  p_fecha_pagado_hasta timestamp with time zone DEFAULT NULL,
  p_error_motivo character varying DEFAULT NULL,
  p_observacion_tiempo character varying DEFAULT NULL,
  p_tipo_facturacion character varying DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT to_jsonb(t)
  FROM public.tb_operacion_proceso t
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_id_codigo_servicio IS NULL OR t.id_codigo_servicio = p_id_codigo_servicio)
    AND (p_nombre_codigo_servicio IS NULL OR t.nombre_codigo_servicio ILIKE '%' || p_nombre_codigo_servicio || '%')
    AND (p_id_comunidad IS NULL OR t.id_comunidad = p_id_comunidad)
    AND (p_nombre_comunidad IS NULL OR t.nombre_comunidad ILIKE '%' || p_nombre_comunidad || '%')
    AND (p_id_tipo_deposito IS NULL OR t.id_tipo_deposito = p_id_tipo_deposito)
    AND (p_nombre_tipo_deposito IS NULL OR t.nombre_tipo_deposito ILIKE '%' || p_nombre_tipo_deposito || '%')
    AND (p_id_cliente IS NULL OR t.id_cliente = p_id_cliente)
    AND (p_dni_cliente IS NULL OR t.dni_cliente ILIKE '%' || p_dni_cliente || '%')
    AND (p_nombre_cliente IS NULL OR t.nombre_cliente ILIKE '%' || p_nombre_cliente || '%')
    AND (p_id_banco_cliente IS NULL OR t.id_banco_cliente = p_id_banco_cliente)
    AND (p_nombre_banco_cliente IS NULL OR t.nombre_banco_cliente ILIKE '%' || p_nombre_banco_cliente || '%')
    AND (p_monto_deposito_cliente IS NULL OR t.monto_deposito_cliente = p_monto_deposito_cliente)
    AND (p_codigo_operacion_deposito_cliente IS NULL OR t.codigo_operacion_deposito_cliente ILIKE '%' || p_codigo_operacion_deposito_cliente || '%')
    AND (p_fecha_deposito_desde IS NULL OR t.fecha_deposito_cliente >= p_fecha_deposito_desde)
    AND (p_fecha_deposito_hasta IS NULL OR t.fecha_deposito_cliente <= p_fecha_deposito_hasta)
    AND (p_id_empresa_ingreso IS NULL OR t.id_empresa_ingreso = p_id_empresa_ingreso)
    AND (p_nombre_empresa_ingreso IS NULL OR t.nombre_empresa_ingreso ILIKE '%' || p_nombre_empresa_ingreso || '%')
    AND (p_id_empresa_cuenta_ingreso IS NULL OR t.id_empresa_cuenta_ingreso = p_id_empresa_cuenta_ingreso)
    AND (p_id_banco_empresa_cuenta_ingreso IS NULL OR t.id_banco_empresa_cuenta_ingreso = p_id_banco_empresa_cuenta_ingreso)
    AND (p_nombre_banco_empresa_cuenta_ingreso IS NULL OR t.nombre_banco_empresa_cuenta_ingreso ILIKE '%' || p_nombre_banco_empresa_cuenta_ingreso || '%')
    AND (p_comision_servicio IS NULL OR t.comision_servicio = p_comision_servicio)
    AND (p_comision_monto_extra_servicio IS NULL OR t.comision_monto_extra_servicio = p_comision_monto_extra_servicio)
    AND (p_resultado_comision_servicio IS NULL OR t.resultado_comision_servicio = p_resultado_comision_servicio)
    AND (p_id_empresa_salida IS NULL OR t.id_empresa_salida = p_id_empresa_salida)
    AND (p_nombre_empresa_salida IS NULL OR t.nombre_empresa_salida ILIKE '%' || p_nombre_empresa_salida || '%')
    AND (p_id_empresa_cuenta_salida IS NULL OR t.id_empresa_cuenta_salida = p_id_empresa_cuenta_salida)
    AND (p_id_banco_empresa_cuenta_salida IS NULL OR t.id_banco_empresa_cuenta_salida = p_id_banco_empresa_cuenta_salida)
    AND (p_nombre_banco_empresa_cuenta_salida IS NULL OR t.nombre_banco_empresa_cuenta_salida ILIKE '%' || p_nombre_banco_empresa_cuenta_salida || '%')
    AND (p_resultado_comision_banco_ingreso IS NULL OR t.resultado_comision_banco_ingreso = p_resultado_comision_banco_ingreso)
    AND (p_resultado_comision_banco_salida IS NULL OR t.resultado_comision_banco_salida = p_resultado_comision_banco_salida)
    AND (p_monto_transferencia_cliente IS NULL OR t.monto_transferencia_cliente = p_monto_transferencia_cliente)
    AND (p_id_banco_cliente_transferencia IS NULL OR t.id_banco_cliente_transferencia = p_id_banco_cliente_transferencia)
    AND (p_nombre_banco_cliente_transferencia IS NULL OR t.nombre_banco_cliente_transferencia ILIKE '%' || p_nombre_banco_cliente_transferencia || '%')
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_nombre_estado IS NULL OR t.nombre_estado ILIKE '%' || p_nombre_estado || '%')
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_nombre_usuario IS NULL OR t.nombre_usuario ILIKE '%' || p_nombre_usuario || '%')
    AND (p_id_usuario_gestor IS NULL OR t.id_usuario_gestor = p_id_usuario_gestor)
    AND (p_nombre_usuario_gestor IS NULL OR t.nombre_usuario_gestor ILIKE '%' || p_nombre_usuario_gestor || '%')
    AND (p_id_usuario_reasignado IS NULL OR t.id_usuario_reasignado = p_id_usuario_reasignado)
    AND (p_nombre_usuario_reasignado IS NULL OR t.nombre_usuario_reasignado ILIKE '%' || p_nombre_usuario_reasignado || '%')
    AND (p_id_usuario_solicitud IS NULL OR t.id_usuario_solicitud = p_id_usuario_solicitud)
    AND (p_nombre_usuario_solicitud IS NULL OR t.nombre_usuario_solicitud ILIKE '%' || p_nombre_usuario_solicitud || '%')
    AND (p_fecha_pendiente_desde IS NULL OR t.fecha_pendiente >= p_fecha_pendiente_desde)
    AND (p_fecha_pendiente_hasta IS NULL OR t.fecha_pendiente <= p_fecha_pendiente_hasta)
    AND (p_fecha_pagado_desde IS NULL OR t.fecha_pagado >= p_fecha_pagado_desde)
    AND (p_fecha_pagado_hasta IS NULL OR t.fecha_pagado <= p_fecha_pagado_hasta)
    AND (p_error_motivo IS NULL OR t.error_motivo ILIKE '%' || p_error_motivo || '%')
    AND (p_observacion_tiempo IS NULL OR t.observacion_tiempo ILIKE '%' || p_observacion_tiempo || '%')
    AND (p_tipo_facturacion IS NULL OR t.tipo_facturacion ILIKE '%' || p_tipo_facturacion || '%')
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
  ORDER BY t.id DESC;
$$;

/*
Funcion: f_post_tb_operacion_proceso
Objetivo:
  Crear una operacion manual ya resuelta y con resultados congelados.

Uso esperado:
  - registro manual desde Operaciones
  - insercion programatica cuando el frontend ya resolvio la regla aplicada
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_operacion_proceso(
  p_id_codigo_servicio bigint DEFAULT NULL,
  p_nombre_codigo_servicio character varying DEFAULT NULL,
  p_id_comunidad bigint DEFAULT NULL,
  p_nombre_comunidad character varying DEFAULT NULL,
  p_id_tipo_deposito bigint DEFAULT NULL,
  p_nombre_tipo_deposito character varying DEFAULT NULL,
  p_id_cliente bigint DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_nombre_cliente character varying DEFAULT NULL,
  p_id_banco_cliente bigint DEFAULT NULL,
  p_nombre_banco_cliente character varying DEFAULT NULL,
  p_monto_deposito_cliente bigint DEFAULT NULL,
  p_codigo_operacion_deposito_cliente character varying DEFAULT NULL,
  p_fecha_deposito_cliente timestamp with time zone DEFAULT NULL,
  p_id_empresa_ingreso bigint DEFAULT NULL,
  p_nombre_empresa_ingreso character varying DEFAULT NULL,
  p_id_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_nombre_banco_empresa_cuenta_ingreso character varying DEFAULT NULL,
  p_flag_por_sol_comision_banco_ingreso boolean DEFAULT NULL,
  p_comision_banco_ingreso numeric DEFAULT NULL,
  p_comision_minimo_banco_ingreso numeric DEFAULT NULL,
  p_comision_igv_banco_ingreso numeric DEFAULT NULL,
  p_resultado_comision_banco_ingreso numeric DEFAULT NULL,
  p_monto_itf_ingreso numeric DEFAULT NULL,
  p_comision_servicio numeric DEFAULT NULL,
  p_monto_minimo_deposito_servicio numeric DEFAULT NULL,
  p_comision_minima_servicio numeric DEFAULT NULL,
  p_comision_monto_extra_servicio bigint DEFAULT NULL,
  p_resultado_comision_servicio numeric DEFAULT NULL,
  p_id_empresa_salida bigint DEFAULT NULL,
  p_nombre_empresa_salida character varying DEFAULT NULL,
  p_id_empresa_cuenta_salida bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_salida bigint DEFAULT NULL,
  p_nombre_banco_empresa_cuenta_salida character varying DEFAULT NULL,
  p_comision_transf_banco_salida numeric DEFAULT NULL,
  p_comision_transf_inter_banco_salida numeric DEFAULT NULL,
  p_resultado_comision_banco_salida numeric DEFAULT NULL,
  p_monto_transferencia_cliente numeric DEFAULT NULL,
  p_monto_itf_salida numeric DEFAULT NULL,
  p_id_banco_cliente_transferencia bigint DEFAULT NULL,
  p_nombre_banco_cliente_transferencia character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_nombre_estado character varying DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL,
  p_id_usuario_reasignado bigint DEFAULT NULL,
  p_nombre_usuario_reasignado character varying DEFAULT NULL,
  p_id_usuario_solicitud bigint DEFAULT NULL,
  p_nombre_usuario_solicitud character varying DEFAULT NULL,
  p_fecha_pendiente timestamp with time zone DEFAULT NULL,
  p_fecha_pagado timestamp with time zone DEFAULT NULL,
  p_error_motivo character varying DEFAULT NULL,
  p_observacion_tiempo text DEFAULT NULL,
  p_tipo_facturacion character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id bigint;
  v_cliente_id bigint;
  v_cliente_nombre character varying;
  v_estado_activo_id bigint;
BEGIN
  v_cliente_id := p_id_cliente;
  v_cliente_nombre := p_nombre_cliente;

  IF v_cliente_id IS NULL AND COALESCE(p_dni_cliente, '') <> '' THEN
    SELECT id, nombre
    INTO v_cliente_id, v_cliente_nombre
    FROM public.tb_cliente
    WHERE dni = p_dni_cliente
    LIMIT 1;

    IF v_cliente_id IS NULL THEN
      SELECT id INTO v_estado_activo_id
      FROM public.tb_estado
      WHERE UPPER(nombre) = 'ACTIVO'
      LIMIT 1;

      INSERT INTO public.tb_cliente (
        dni,
        nombre,
        id_comunidad,
        id_estado,
        id_usuario
      )
      VALUES (
        p_dni_cliente,
        COALESCE(p_nombre_cliente, ''),
        p_id_comunidad,
        v_estado_activo_id,
        p_id_usuario
      )
      RETURNING id, nombre INTO v_cliente_id, v_cliente_nombre;
    END IF;
  END IF;

  INSERT INTO public.tb_operacion_proceso (
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
    resultado_comision_banco_ingreso,
    monto_itf_ingreso,
    comision_servicio,
    monto_minimo_deposito_servicio,
    comision_minima_servicio,
    comision_monto_extra_servicio,
    resultado_comision_servicio,
    id_empresa_salida,
    nombre_empresa_salida,
    id_empresa_cuenta_salida,
    id_banco_empresa_cuenta_salida,
    nombre_banco_empresa_cuenta_salida,
    comision_transf_banco_salida,
    comision_transf_inter_banco_salida,
    resultado_comision_banco_salida,
    monto_transferencia_cliente,
    monto_itf_salida,
    id_banco_cliente_transferencia,
    nombre_banco_cliente_transferencia,
    id_estado,
    nombre_estado,
    id_usuario,
    nombre_usuario,
    id_usuario_gestor,
    nombre_usuario_gestor,
    id_usuario_reasignado,
    nombre_usuario_reasignado,
    id_usuario_solicitud,
    nombre_usuario_solicitud,
    fecha_pendiente,
    fecha_pagado,
    error_motivo,
    observacion_tiempo,
    tipo_facturacion
  )
  VALUES (
    p_id_codigo_servicio,
    p_nombre_codigo_servicio,
    p_id_comunidad,
    p_nombre_comunidad,
    p_id_tipo_deposito,
    p_nombre_tipo_deposito,
    v_cliente_id,
    p_dni_cliente,
    COALESCE(v_cliente_nombre, p_nombre_cliente),
    p_id_banco_cliente,
    p_nombre_banco_cliente,
    p_monto_deposito_cliente,
    p_codigo_operacion_deposito_cliente,
    p_fecha_deposito_cliente,
    p_id_empresa_ingreso,
    p_nombre_empresa_ingreso,
    p_id_empresa_cuenta_ingreso,
    p_id_banco_empresa_cuenta_ingreso,
    p_nombre_banco_empresa_cuenta_ingreso,
    p_flag_por_sol_comision_banco_ingreso,
    p_comision_banco_ingreso,
    p_comision_minimo_banco_ingreso,
    p_comision_igv_banco_ingreso,
    p_resultado_comision_banco_ingreso,
    p_monto_itf_ingreso,
    p_comision_servicio,
    p_monto_minimo_deposito_servicio,
    p_comision_minima_servicio,
    p_comision_monto_extra_servicio,
    p_resultado_comision_servicio,
    p_id_empresa_salida,
    p_nombre_empresa_salida,
    p_id_empresa_cuenta_salida,
    p_id_banco_empresa_cuenta_salida,
    p_nombre_banco_empresa_cuenta_salida,
    p_comision_transf_banco_salida,
    p_comision_transf_inter_banco_salida,
    p_resultado_comision_banco_salida,
    p_monto_transferencia_cliente,
    p_monto_itf_salida,
    p_id_banco_cliente_transferencia,
    p_nombre_banco_cliente_transferencia,
    p_id_estado,
    p_nombre_estado,
    p_id_usuario,
    p_nombre_usuario,
    COALESCE(p_id_usuario_gestor, p_id_usuario),
    COALESCE(p_nombre_usuario_gestor, p_nombre_usuario),
    p_id_usuario_reasignado,
    p_nombre_usuario_reasignado,
    p_id_usuario_solicitud,
    p_nombre_usuario_solicitud,
    p_fecha_pendiente,
    p_fecha_pagado,
    p_error_motivo,
    p_observacion_tiempo,
    COALESCE(p_tipo_facturacion, 'Boleta')
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
Funcion: f_patch_tb_operacion_proceso_base
Objetivo:
  Actualizar la base operativa de una operacion sin entrar todavia a acciones
  especiales como pagado, reanudacion o carga masiva.

Casos de uso:
  - editar operacion manual
  - autoguardado inline
  - recalculo posterior a cambios de comunidad, banco, empresa o transferencia
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_base(
  p_id bigint,
  p_id_comunidad bigint DEFAULT NULL,
  p_nombre_comunidad character varying DEFAULT NULL,
  p_id_tipo_deposito bigint DEFAULT NULL,
  p_nombre_tipo_deposito character varying DEFAULT NULL,
  p_id_cliente bigint DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_nombre_cliente character varying DEFAULT NULL,
  p_id_banco_cliente bigint DEFAULT NULL,
  p_nombre_banco_cliente character varying DEFAULT NULL,
  p_monto_deposito_cliente bigint DEFAULT NULL,
  p_codigo_operacion_deposito_cliente character varying DEFAULT NULL,
  p_fecha_deposito_cliente timestamp with time zone DEFAULT NULL,
  p_id_empresa_ingreso bigint DEFAULT NULL,
  p_nombre_empresa_ingreso character varying DEFAULT NULL,
  p_id_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_nombre_banco_empresa_cuenta_ingreso character varying DEFAULT NULL,
  p_flag_por_sol_comision_banco_ingreso boolean DEFAULT NULL,
  p_comision_banco_ingreso numeric DEFAULT NULL,
  p_comision_minimo_banco_ingreso numeric DEFAULT NULL,
  p_comision_igv_banco_ingreso numeric DEFAULT NULL,
  p_resultado_comision_banco_ingreso numeric DEFAULT NULL,
  p_monto_itf_ingreso numeric DEFAULT NULL,
  p_comision_servicio numeric DEFAULT NULL,
  p_monto_minimo_deposito_servicio numeric DEFAULT NULL,
  p_comision_minima_servicio numeric DEFAULT NULL,
  p_comision_monto_extra_servicio bigint DEFAULT NULL,
  p_resultado_comision_servicio numeric DEFAULT NULL,
  p_id_empresa_salida bigint DEFAULT NULL,
  p_nombre_empresa_salida character varying DEFAULT NULL,
  p_id_empresa_cuenta_salida bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_salida bigint DEFAULT NULL,
  p_nombre_banco_empresa_cuenta_salida character varying DEFAULT NULL,
  p_comision_transf_banco_salida numeric DEFAULT NULL,
  p_comision_transf_inter_banco_salida numeric DEFAULT NULL,
  p_resultado_comision_banco_salida numeric DEFAULT NULL,
  p_monto_transferencia_cliente numeric DEFAULT NULL,
  p_monto_itf_salida numeric DEFAULT NULL,
  p_id_banco_cliente_transferencia bigint DEFAULT NULL,
  p_nombre_banco_cliente_transferencia character varying DEFAULT NULL,
  p_tipo_facturacion character varying DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL,
  p_id_usuario_reasignado bigint DEFAULT NULL,
  p_nombre_usuario_reasignado character varying DEFAULT NULL,
  p_id_usuario_solicitud bigint DEFAULT NULL,
  p_nombre_usuario_solicitud character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_operacion_proceso
  SET id_comunidad = COALESCE(p_id_comunidad, id_comunidad),
      nombre_comunidad = COALESCE(p_nombre_comunidad, nombre_comunidad),
      id_tipo_deposito = COALESCE(p_id_tipo_deposito, id_tipo_deposito),
      nombre_tipo_deposito = COALESCE(p_nombre_tipo_deposito, nombre_tipo_deposito),
      id_cliente = COALESCE(p_id_cliente, id_cliente),
      dni_cliente = COALESCE(p_dni_cliente, dni_cliente),
      nombre_cliente = COALESCE(p_nombre_cliente, nombre_cliente),
      id_banco_cliente = COALESCE(p_id_banco_cliente, id_banco_cliente),
      nombre_banco_cliente = COALESCE(p_nombre_banco_cliente, nombre_banco_cliente),
      monto_deposito_cliente = COALESCE(p_monto_deposito_cliente, monto_deposito_cliente),
      codigo_operacion_deposito_cliente = COALESCE(p_codigo_operacion_deposito_cliente, codigo_operacion_deposito_cliente),
      fecha_deposito_cliente = COALESCE(p_fecha_deposito_cliente, fecha_deposito_cliente),
      id_empresa_ingreso = COALESCE(p_id_empresa_ingreso, id_empresa_ingreso),
      nombre_empresa_ingreso = COALESCE(p_nombre_empresa_ingreso, nombre_empresa_ingreso),
      id_empresa_cuenta_ingreso = COALESCE(p_id_empresa_cuenta_ingreso, id_empresa_cuenta_ingreso),
      id_banco_empresa_cuenta_ingreso = COALESCE(p_id_banco_empresa_cuenta_ingreso, id_banco_empresa_cuenta_ingreso),
      nombre_banco_empresa_cuenta_ingreso = COALESCE(p_nombre_banco_empresa_cuenta_ingreso, nombre_banco_empresa_cuenta_ingreso),
      flag_por_sol_comision_banco_ingreso = COALESCE(p_flag_por_sol_comision_banco_ingreso, flag_por_sol_comision_banco_ingreso),
      comision_banco_ingreso = COALESCE(p_comision_banco_ingreso, comision_banco_ingreso),
      comision_minimo_banco_ingreso = COALESCE(p_comision_minimo_banco_ingreso, comision_minimo_banco_ingreso),
      comision_igv_banco_ingreso = COALESCE(p_comision_igv_banco_ingreso, comision_igv_banco_ingreso),
      resultado_comision_banco_ingreso = COALESCE(p_resultado_comision_banco_ingreso, resultado_comision_banco_ingreso),
      monto_itf_ingreso = COALESCE(p_monto_itf_ingreso, monto_itf_ingreso),
      comision_servicio = COALESCE(p_comision_servicio, comision_servicio),
      monto_minimo_deposito_servicio = COALESCE(p_monto_minimo_deposito_servicio, monto_minimo_deposito_servicio),
      comision_minima_servicio = COALESCE(p_comision_minima_servicio, comision_minima_servicio),
      comision_monto_extra_servicio = COALESCE(p_comision_monto_extra_servicio, comision_monto_extra_servicio),
      resultado_comision_servicio = COALESCE(p_resultado_comision_servicio, resultado_comision_servicio),
      id_empresa_salida = COALESCE(p_id_empresa_salida, id_empresa_salida),
      nombre_empresa_salida = COALESCE(p_nombre_empresa_salida, nombre_empresa_salida),
      id_empresa_cuenta_salida = COALESCE(p_id_empresa_cuenta_salida, id_empresa_cuenta_salida),
      id_banco_empresa_cuenta_salida = COALESCE(p_id_banco_empresa_cuenta_salida, id_banco_empresa_cuenta_salida),
      nombre_banco_empresa_cuenta_salida = COALESCE(p_nombre_banco_empresa_cuenta_salida, nombre_banco_empresa_cuenta_salida),
      comision_transf_banco_salida = COALESCE(p_comision_transf_banco_salida, comision_transf_banco_salida),
      comision_transf_inter_banco_salida = COALESCE(p_comision_transf_inter_banco_salida, comision_transf_inter_banco_salida),
      resultado_comision_banco_salida = COALESCE(p_resultado_comision_banco_salida, resultado_comision_banco_salida),
      monto_transferencia_cliente = COALESCE(p_monto_transferencia_cliente, monto_transferencia_cliente),
      monto_itf_salida = COALESCE(p_monto_itf_salida, monto_itf_salida),
      id_banco_cliente_transferencia = COALESCE(p_id_banco_cliente_transferencia, id_banco_cliente_transferencia),
      nombre_banco_cliente_transferencia = COALESCE(p_nombre_banco_cliente_transferencia, nombre_banco_cliente_transferencia),
      tipo_facturacion = COALESCE(p_tipo_facturacion, tipo_facturacion),
      id_usuario = COALESCE(p_id_usuario, id_usuario),
      nombre_usuario = COALESCE(p_nombre_usuario, nombre_usuario),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor),
      id_usuario_reasignado = COALESCE(p_id_usuario_reasignado, id_usuario_reasignado),
      nombre_usuario_reasignado = COALESCE(p_nombre_usuario_reasignado, nombre_usuario_reasignado),
      id_usuario_solicitud = COALESCE(p_id_usuario_solicitud, id_usuario_solicitud),
      nombre_usuario_solicitud = COALESCE(p_nombre_usuario_solicitud, nombre_usuario_solicitud)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_estado
Objetivo:
  Actualizar el estado operativo y sus campos de seguimiento.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_estado(
  p_id bigint,
  p_id_estado bigint DEFAULT NULL,
  p_nombre_estado character varying DEFAULT NULL,
  p_fecha_pendiente timestamp with time zone DEFAULT NULL,
  p_fecha_pagado timestamp with time zone DEFAULT NULL,
  p_error_motivo character varying DEFAULT NULL,
  p_observacion_tiempo text DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_operacion_proceso
  SET id_estado = COALESCE(p_id_estado, id_estado),
      nombre_estado = COALESCE(p_nombre_estado, nombre_estado),
      fecha_pendiente = COALESCE(p_fecha_pendiente, fecha_pendiente),
      fecha_pagado = COALESCE(p_fecha_pagado, fecha_pagado),
      error_motivo = COALESCE(p_error_motivo, error_motivo),
      observacion_tiempo = COALESCE(p_observacion_tiempo, observacion_tiempo),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_comision_extra
Objetivo:
  Aplicar una comision extra ya recalculada por el flujo de negocio.

Nota:
  La funcion persiste tanto el monto extra como los resultados monetarios
  congelados resultantes del nuevo calculo.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_comision_extra(
  p_id bigint,
  p_comision_monto_extra_servicio bigint,
  p_resultado_comision_servicio numeric DEFAULT NULL,
  p_resultado_comision_banco_ingreso numeric DEFAULT NULL,
  p_resultado_comision_banco_salida numeric DEFAULT NULL,
  p_monto_transferencia_cliente numeric DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_operacion_proceso
  SET comision_monto_extra_servicio = p_comision_monto_extra_servicio,
      resultado_comision_servicio = COALESCE(p_resultado_comision_servicio, resultado_comision_servicio),
      resultado_comision_banco_ingreso = COALESCE(p_resultado_comision_banco_ingreso, resultado_comision_banco_ingreso),
      resultado_comision_banco_salida = COALESCE(p_resultado_comision_banco_salida, resultado_comision_banco_salida),
      monto_transferencia_cliente = COALESCE(p_monto_transferencia_cliente, monto_transferencia_cliente),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_usuario
Objetivo:
  Reasignar responsable operativo de una operacion.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_usuario(
  p_id bigint,
  p_id_usuario_gestor bigint,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_operacion_proceso
  SET id_usuario_gestor = p_id_usuario_gestor,
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor),
      id_usuario_reasignado = p_id_usuario_gestor,
      nombre_usuario_reasignado = COALESCE(p_nombre_usuario_gestor, nombre_usuario_reasignado)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_empresa
Objetivo:
  Cambiar la empresa y los datos asociados de ingreso/salida para una operacion
  ya recalculada.

Uso esperado:
  - cambio de empresa desde acciones de datatable
  - ajustes de ruta operativa sin tocar todavia caja
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_empresa(
  p_id bigint,
  p_id_empresa_ingreso bigint DEFAULT NULL,
  p_nombre_empresa_ingreso character varying DEFAULT NULL,
  p_id_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_nombre_banco_empresa_cuenta_ingreso character varying DEFAULT NULL,
  p_id_empresa_salida bigint DEFAULT NULL,
  p_nombre_empresa_salida character varying DEFAULT NULL,
  p_id_empresa_cuenta_salida bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_salida bigint DEFAULT NULL,
  p_nombre_banco_empresa_cuenta_salida character varying DEFAULT NULL,
  p_nombre_codigo_servicio character varying DEFAULT NULL,
  p_resultado_comision_banco_ingreso numeric DEFAULT NULL,
  p_resultado_comision_servicio numeric DEFAULT NULL,
  p_resultado_comision_banco_salida numeric DEFAULT NULL,
  p_monto_transferencia_cliente numeric DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_operacion_proceso
  SET id_empresa_ingreso = COALESCE(p_id_empresa_ingreso, id_empresa_ingreso),
      nombre_empresa_ingreso = COALESCE(p_nombre_empresa_ingreso, nombre_empresa_ingreso),
      id_empresa_cuenta_ingreso = COALESCE(p_id_empresa_cuenta_ingreso, id_empresa_cuenta_ingreso),
      id_banco_empresa_cuenta_ingreso = COALESCE(p_id_banco_empresa_cuenta_ingreso, id_banco_empresa_cuenta_ingreso),
      nombre_banco_empresa_cuenta_ingreso = COALESCE(p_nombre_banco_empresa_cuenta_ingreso, nombre_banco_empresa_cuenta_ingreso),
      id_empresa_salida = COALESCE(p_id_empresa_salida, id_empresa_salida),
      nombre_empresa_salida = COALESCE(p_nombre_empresa_salida, nombre_empresa_salida),
      id_empresa_cuenta_salida = COALESCE(p_id_empresa_cuenta_salida, id_empresa_cuenta_salida),
      id_banco_empresa_cuenta_salida = COALESCE(p_id_banco_empresa_cuenta_salida, id_banco_empresa_cuenta_salida),
      nombre_banco_empresa_cuenta_salida = COALESCE(p_nombre_banco_empresa_cuenta_salida, nombre_banco_empresa_cuenta_salida),
      nombre_codigo_servicio = COALESCE(p_nombre_codigo_servicio, nombre_codigo_servicio),
      resultado_comision_banco_ingreso = COALESCE(p_resultado_comision_banco_ingreso, resultado_comision_banco_ingreso),
      resultado_comision_servicio = COALESCE(p_resultado_comision_servicio, resultado_comision_servicio),
      resultado_comision_banco_salida = COALESCE(p_resultado_comision_banco_salida, resultado_comision_banco_salida),
      monto_transferencia_cliente = COALESCE(p_monto_transferencia_cliente, monto_transferencia_cliente),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_pagado
Objetivo:
  Marcar una operacion como pagada sin acoplarla todavia a contabilidad.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_pagado(
  p_id bigint,
  p_id_estado bigint,
  p_nombre_estado character varying,
  p_fecha_pagado timestamp with time zone DEFAULT now(),
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_operacion_proceso
  SET id_estado = p_id_estado,
      nombre_estado = p_nombre_estado,
      fecha_pagado = COALESCE(p_fecha_pagado, now()),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_reanudar
Objetivo:
  Devolver una operacion pagada al flujo pendiente.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_reanudar(
  p_id bigint,
  p_id_estado bigint,
  p_nombre_estado character varying,
  p_fecha_pendiente timestamp with time zone DEFAULT now(),
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_operacion_proceso
  SET id_estado = p_id_estado,
      nombre_estado = p_nombre_estado,
      fecha_pendiente = COALESCE(p_fecha_pendiente, now()),
      fecha_pagado = NULL,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_get_tb_parse_documento
Objetivo:
  Normalizar un documento desde texto libre y devolver su valor util y tipo.

Uso:
  - cargas Excel
  - procesos de parseo previos a crear cliente u operacion
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_parse_documento(
  p_raw text
)
RETURNS TABLE(valor character varying, tipo character varying)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_digits varchar;
  v_candidate varchar;
  v_clean varchar;
BEGIN
  v_digits := REGEXP_REPLACE(COALESCE(p_raw, ''), '[^0-9]', '', 'g');

  IF LENGTH(v_digits) = 0 THEN
    RETURN QUERY SELECT NULL::varchar, 'DESCONOCIDO'::varchar;
    RETURN;
  END IF;

  v_candidate := RIGHT(v_digits, 11);
  IF LENGTH(v_candidate) = 11 AND LEFT(v_candidate, 1) IN ('1', '2') THEN
    RETURN QUERY SELECT v_candidate::varchar, 'RUC'::varchar;
    RETURN;
  END IF;

  v_clean := RIGHT(v_digits, 8);
  IF LENGTH(v_clean) < 8 THEN
    v_clean := RPAD(v_clean, 8, '0');
  END IF;

  RETURN QUERY SELECT v_clean::varchar, 'DNI'::varchar;
END;
$$;

/*
Funcion: f_get_tb_parsear_fecha
Objetivo:
  Parsear fechas heterogeneas provenientes de flujos manuales o Excel.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_parsear_fecha(
  p_fecha text
)
RETURNS timestamp
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
AS $$
BEGIN
  p_fecha := TRIM(REGEXP_REPLACE(p_fecha, '[\r\n\t' || CHR(160) || ']', ' ', 'g'));

  IF p_fecha IS NULL OR p_fecha = '' THEN
    RETURN NULL;
  END IF;

  IF p_fecha ~ '^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}' THEN
    RETURN p_fecha::timestamp;
  END IF;

  IF p_fecha ~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN p_fecha::timestamp;
  END IF;

  IF p_fecha ~ '^\d{2}/\d{2}/\d{4} \d{2}:\d{2}' THEN
    RETURN TO_TIMESTAMP(p_fecha, 'DD/MM/YYYY HH24:MI:SS');
  END IF;

  IF p_fecha ~ '^\d{2}/\d{2}/\d{4}$' THEN
    RETURN TO_TIMESTAMP(p_fecha, 'DD/MM/YYYY');
  END IF;

  IF p_fecha ~ '^\d{2}-\d{2}-\d{4} \d{2}:\d{2}' THEN
    RETURN TO_TIMESTAMP(p_fecha, 'DD-MM-YYYY HH24:MI:SS');
  END IF;

  IF p_fecha ~ '^\d{2}-\d{2}-\d{4}$' THEN
    RETURN TO_TIMESTAMP(p_fecha, 'DD-MM-YYYY');
  END IF;

  RAISE EXCEPTION 'Formato de fecha no reconocido: %', p_fecha;
END;
$$;

/*
Funcion: f_get_tb_operacion_calculo_comision_servicio
Objetivo:
  Calcular la comision del servicio y el monto neto a transferir al cliente.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_calculo_comision_servicio(
  p_monto_deposito_cliente bigint,
  p_comision_servicio numeric,
  p_monto_minimo_deposito_servicio numeric,
  p_comision_minima_servicio numeric,
  p_comision_monto_extra_servicio bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_resultado numeric;
  v_transferencia numeric;
BEGIN
  IF p_monto_deposito_cliente < p_monto_minimo_deposito_servicio THEN
    v_resultado := COALESCE(p_comision_minima_servicio, 0);
  ELSE
    v_resultado := (COALESCE(p_comision_servicio, 0) / 100) * COALESCE(p_monto_deposito_cliente, 0);
  END IF;

  IF COALESCE(p_comision_monto_extra_servicio, 0) > 0 THEN
    v_resultado := v_resultado + p_comision_monto_extra_servicio;
  END IF;

  v_transferencia := COALESCE(p_monto_deposito_cliente, 0) - COALESCE(v_resultado, 0);

  RETURN jsonb_build_object(
    'resultado_comision_servicio', ROUND(COALESCE(v_resultado, 0), 2),
    'monto_transferencia_cliente', ROUND(COALESCE(v_transferencia, 0), 2)
  );
END;
$$;

/*
Funcion: f_get_tb_operacion_calculo_comision_banco_ingreso
Objetivo:
  Calcular la comision total del banco de ingreso usando ITF de la cuenta
  bancaria y regla aplicada.

Regla de ITF:
  El ITF solo aplica cuando el monto de deposito es mayor o igual a 1000.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_calculo_comision_banco_ingreso(
  p_flag_por_sol_comision_banco_ingreso boolean,
  p_monto_deposito_cliente bigint,
  p_comision_banco_ingreso numeric,
  p_comision_minimo_banco_ingreso numeric DEFAULT 0,
  p_comision_igv_banco_ingreso numeric DEFAULT 0,
  p_monto_itf_ingreso numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_itf numeric;
  v_comision numeric;
  v_resultado numeric;
BEGIN
  IF COALESCE(p_monto_deposito_cliente, 0) >= 1000 THEN
    v_itf := (COALESCE(p_monto_itf_ingreso, 0) / 100) * COALESCE(p_monto_deposito_cliente, 0);
  ELSE
    v_itf := 0;
  END IF;

  IF COALESCE(p_flag_por_sol_comision_banco_ingreso, false) THEN
    v_resultado := v_itf + COALESCE(p_comision_banco_ingreso, 0);
  ELSE
    v_resultado := v_itf;
    v_comision := (COALESCE(p_comision_banco_ingreso, 0) / 100) * COALESCE(p_monto_deposito_cliente, 0);

    IF v_comision <= COALESCE(p_comision_minimo_banco_ingreso, 0) THEN
      v_comision := COALESCE(p_comision_minimo_banco_ingreso, 0);
    END IF;

    v_resultado := v_resultado + v_comision;

    IF COALESCE(p_comision_igv_banco_ingreso, 0) > 0 THEN
      v_resultado := v_resultado + ((p_comision_igv_banco_ingreso / 100) * v_resultado);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'resultado_comision_banco_ingreso', ROUND(COALESCE(v_resultado, 0), 2)
  );
END;
$$;

/*
Funcion: f_get_tb_operacion_calculo_comision_banco_salida
Objetivo:
  Calcular la comision total del banco de salida usando la cuenta y el banco de
  transferencia elegido por el cliente.

Regla de ITF:
  El ITF solo aplica cuando el monto de transferencia es mayor o igual a 1000.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_calculo_comision_banco_salida(
  p_monto_transferencia_cliente numeric,
  p_comision_transf_banco_salida numeric DEFAULT 0,
  p_comision_transf_inter_banco_salida numeric DEFAULT 0,
  p_monto_itf_salida numeric DEFAULT 0,
  p_id_empresa_salida bigint DEFAULT NULL,
  p_id_empresa_cuenta_salida bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_salida bigint DEFAULT NULL,
  p_id_banco_cliente_transferencia bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_itf numeric;
  v_resultado numeric;
  v_comision_transf numeric;
  v_comision_inter numeric;
  v_cuenta record;
BEGIN
  IF COALESCE(p_monto_transferencia_cliente, 0) >= 1000 THEN
    v_itf := (COALESCE(p_monto_itf_salida, 0) / 100) * COALESCE(p_monto_transferencia_cliente, 0);
  ELSE
    v_itf := 0;
  END IF;

  v_comision_transf := COALESCE(p_comision_transf_banco_salida, 0);
  v_comision_inter := COALESCE(p_comision_transf_inter_banco_salida, 0);

  IF p_id_empresa_cuenta_salida IS NOT NULL THEN
    SELECT
      c.comision_transf_banco_salida,
      c.comision_transf_inter_banco_salida
    INTO v_cuenta
    FROM public.tb_empresa_cuenta_bancaria c
    WHERE c.id = p_id_empresa_cuenta_salida
      AND (p_id_empresa_salida IS NULL OR c.id_empresa = p_id_empresa_salida)
      AND (p_id_banco_empresa_cuenta_salida IS NULL OR c.id_banco = p_id_banco_empresa_cuenta_salida)
    LIMIT 1;

    IF COALESCE(p_id_banco_cliente_transferencia, 0) = COALESCE(p_id_banco_empresa_cuenta_salida, 0) THEN
      v_comision_transf := COALESCE(v_cuenta.comision_transf_banco_salida, 0);
      v_comision_inter := 0;
    ELSE
      v_comision_transf := 0;
      v_comision_inter := COALESCE(v_cuenta.comision_transf_inter_banco_salida, 0);
    END IF;
  END IF;

  v_resultado := v_itf + v_comision_transf + v_comision_inter;

  RETURN jsonb_build_object(
    'resultado_comision_banco_salida', ROUND(COALESCE(v_resultado, 0), 2)
  );
END;
$$;

/*
Funcion: f_get_tb_operacion_proceso_calculo
Objetivo:
  Exponer un contrato compacto y semantico para el calculo unificado de una
  operacion antes de guardar.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_proceso_calculo(
  p_monto_deposito_cliente bigint,
  p_comision_servicio numeric,
  p_monto_minimo_deposito_servicio numeric,
  p_comision_minima_servicio numeric,
  p_comision_monto_extra_servicio bigint,
  p_flag_por_sol_comision_banco_ingreso boolean,
  p_comision_banco_ingreso numeric,
  p_comision_minimo_banco_ingreso numeric,
  p_comision_igv_banco_ingreso numeric,
  p_monto_itf_ingreso numeric,
  p_comision_transf_banco_salida numeric,
  p_comision_transf_inter_banco_salida numeric,
  p_monto_itf_salida numeric,
  p_id_empresa_salida bigint,
  p_id_empresa_cuenta_salida bigint,
  p_id_banco_empresa_cuenta_salida bigint,
  p_id_banco_cliente_transferencia bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_calc_serv jsonb;
  v_calc_ing jsonb;
  v_calc_sal jsonb;
BEGIN
  v_calc_serv := public.f_get_tb_operacion_calculo_comision_servicio(
    p_monto_deposito_cliente,
    p_comision_servicio,
    p_monto_minimo_deposito_servicio,
    p_comision_minima_servicio,
    p_comision_monto_extra_servicio
  );

  v_calc_ing := public.f_get_tb_operacion_calculo_comision_banco_ingreso(
    p_flag_por_sol_comision_banco_ingreso,
    p_monto_deposito_cliente,
    p_comision_banco_ingreso,
    p_comision_minimo_banco_ingreso,
    p_comision_igv_banco_ingreso,
    p_monto_itf_ingreso
  );

  v_calc_sal := public.f_get_tb_operacion_calculo_comision_banco_salida(
    (v_calc_serv->>'monto_transferencia_cliente')::numeric,
    p_comision_transf_banco_salida,
    p_comision_transf_inter_banco_salida,
    p_monto_itf_salida,
    p_id_empresa_salida,
    p_id_empresa_cuenta_salida,
    p_id_banco_empresa_cuenta_salida,
    p_id_banco_cliente_transferencia
  );

  RETURN jsonb_build_object(
    'resultado_comision_servicio', (v_calc_serv->>'resultado_comision_servicio')::numeric,
    'monto_transferencia_cliente', (v_calc_serv->>'monto_transferencia_cliente')::numeric,
    'resultado_comision_banco_ingreso', (v_calc_ing->>'resultado_comision_banco_ingreso')::numeric,
    'resultado_comision_banco_salida', (v_calc_sal->>'resultado_comision_banco_salida')::numeric
  );
END;
$$;

/*
Funcion: f_post_tb_operacion_proceso_excel
Objetivo:
  Procesar una carga masiva Excel bajo un contrato compacto orientado al flujo
  de negocio, no al CRUD fila por fila.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_operacion_proceso_excel(
  p_datos_excel_json jsonb,
  p_id_codigo_servicio bigint,
  p_nombre_codigo_servicio character varying,
  p_id_comunidad bigint,
  p_nombre_comunidad character varying,
  p_id_tipo_deposito bigint,
  p_nombre_tipo_deposito character varying,
  p_id_empresa_ingreso bigint,
  p_nombre_empresa_ingreso character varying,
  p_id_banco bigint,
  p_id_usuario bigint,
  p_nombre_usuario character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fila record;
  v_username character varying;
  v_estado_pendiente_id bigint;
  v_estado_pendiente_nombre character varying;
  v_estado_error_id bigint;
  v_id_empresa_cuenta_ingreso bigint;
  v_itf_cuenta numeric := 0;
  v_regla record;
  v_regla_cliente record;
  v_dni_parseado character varying;
  v_tipo_doc character varying;
  v_monto bigint;
  v_fecha_deposito timestamp with time zone;
  v_cliente_id bigint;
  v_cliente_nombre character varying;
  v_cliente_comunidad bigint;
  v_dup_id bigint;
  v_banco_cliente_id bigint;
  v_banco_cliente_nombre character varying;
  v_calc_serv jsonb;
  v_calc_ing jsonb;
  v_calc_sal jsonb;
  v_error_motivo character varying;
  v_new_id bigint;
  v_reglas_candidatas_count integer := 0;
  v_filas_procesadas integer := 0;
  v_filas_omitidas integer := 0;
  v_filas_error integer := 0;
  v_detalle jsonb := '[]'::jsonb;
  v_excel_nombre_codigo_servicio character varying;
BEGIN
  SELECT username INTO v_username
  FROM public.tb_usuario
  WHERE id = p_id_usuario;

  IF NOT FOUND THEN
    v_username := 'Sistema';
  END IF;

  SELECT id, nombre INTO v_estado_pendiente_id, v_estado_pendiente_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PENDIENTE'
  LIMIT 1;

  SELECT id INTO v_estado_error_id
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'ERROR'
  LIMIT 1;

  v_excel_nombre_codigo_servicio := p_nombre_codigo_servicio;
  IF p_id_empresa_ingreso IS NOT NULL THEN
    SELECT COALESCE(e.nombre_codigo_servicio, cs.nombre, p_nombre_codigo_servicio)
    INTO v_excel_nombre_codigo_servicio
    FROM public.tb_empresa e
    CROSS JOIN public.tb_codigo_servicio cs
    WHERE e.id = p_id_empresa_ingreso
      AND cs.id = p_id_codigo_servicio
    LIMIT 1;
  END IF;

  SELECT
    ecb.id,
    ecb.comision_itf_ingreso_salida
  INTO
    v_id_empresa_cuenta_ingreso,
    v_itf_cuenta
  FROM public.tb_empresa_cuenta_bancaria ecb
  WHERE ecb.id_empresa = p_id_empresa_ingreso
    AND ecb.id_banco = p_id_banco
  LIMIT 1;

  IF v_id_empresa_cuenta_ingreso IS NULL THEN
    RETURN jsonb_build_object(
      'filas_procesadas', 0,
      'filas_omitidas', 0,
      'filas_error', 1,
      'detalle', jsonb_build_array(
        jsonb_build_object(
          'fila', 0,
          'estado', 'ERROR',
          'motivo', 'No existe una cuenta bancaria de ingreso para la empresa y banco seleccionados'
        )
      )
    );
  END IF;

  FOR v_fila IN
    SELECT *
    FROM jsonb_to_recordset(p_datos_excel_json) AS x(
      dni text,
      monto text,
      codigo_operacion text,
      fecha_pago text,
      hora_proceso text,
      nombre_cliente_banco_ingreso text,
      estado text
    )
  LOOP
    v_error_motivo := NULL;
    v_dni_parseado := NULL;
    v_monto := 0;
    v_fecha_deposito := NULL;
    v_cliente_id := NULL;
    v_cliente_nombre := NULL;
    v_cliente_comunidad := NULL;
    v_banco_cliente_id := NULL;
    v_banco_cliente_nombre := NULL;

    BEGIN
      SELECT valor, tipo
      INTO v_dni_parseado, v_tipo_doc
      FROM public.f_get_tb_parse_documento(COALESCE(v_fila.dni, ''));
    EXCEPTION WHEN OTHERS THEN
      v_error_motivo := 'DNI invÃ¡lido: ' || COALESCE(v_fila.dni, 'vacÃ­o');
    END;

    IF v_error_motivo IS NULL THEN
      BEGIN
        v_monto := COALESCE(REGEXP_REPLACE(COALESCE(v_fila.monto, '0'), '[^0-9.]', '', 'g')::numeric::bigint, 0);
      EXCEPTION WHEN OTHERS THEN
        v_error_motivo := 'Monto invÃ¡lido: ' || COALESCE(v_fila.monto, 'vacÃ­o');
      END;
    END IF;

    IF v_error_motivo IS NULL THEN
      BEGIN
        v_fecha_deposito := public.f_get_tb_parsear_fecha(v_fila.fecha_pago)::timestamp with time zone;
        IF v_fecha_deposito::time = '00:00:00'::time THEN
          v_fecha_deposito := (v_fecha_deposito::date + current_time)::timestamp with time zone;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_error_motivo := 'Fecha invÃ¡lida: ' || COALESCE(v_fila.fecha_pago, 'vacÃ­a');
      END;
    END IF;

    IF v_error_motivo IS NOT NULL THEN
      v_detalle := v_detalle || jsonb_build_object(
        'fila', v_filas_procesadas + v_filas_omitidas + v_filas_error + 1,
        'dni', v_fila.dni,
        'monto', v_fila.monto,
        'codigo_operacion', v_fila.codigo_operacion,
        'fecha_pago', v_fila.fecha_pago,
        'estado', 'ERROR',
        'error_motivo', v_error_motivo
      );
      v_filas_error := v_filas_error + 1;
      CONTINUE;
    END IF;

    IF COALESCE(v_dni_parseado, '') <> '' THEN
      SELECT id, nombre, id_comunidad
      INTO v_cliente_id, v_cliente_nombre, v_cliente_comunidad
      FROM public.tb_cliente
      WHERE dni = v_dni_parseado
      LIMIT 1;

      IF v_cliente_id IS NULL THEN
        SELECT id, nombre
        INTO v_cliente_id, v_cliente_nombre
        FROM (
          SELECT *
          FROM jsonb_to_record(
            public.f_post_tb_cliente(
              p_dni := v_dni_parseado,
              p_nombre := '',
              p_id_comunidad := p_id_comunidad,
              p_id_estado := (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1),
              p_id_usuario := p_id_usuario
            )
          ) AS x(id bigint, nombre character varying)
        ) z;
        v_cliente_comunidad := p_id_comunidad;
      END IF;
    END IF;

    SELECT id
    INTO v_dup_id
    FROM public.tb_operacion_proceso
    WHERE dni_cliente = v_dni_parseado
      AND codigo_operacion_deposito_cliente = v_fila.codigo_operacion
      AND id_codigo_servicio = p_id_codigo_servicio
      AND id_empresa_cuenta_ingreso = v_id_empresa_cuenta_ingreso
      AND fecha_registro >= NOW() - INTERVAL '7 days'
    LIMIT 1;

    IF v_dup_id IS NOT NULL THEN
      v_detalle := v_detalle || jsonb_build_object(
        'fila', v_filas_procesadas + v_filas_omitidas + v_filas_error + 1,
        'codigo_operacion', v_fila.codigo_operacion,
        'estado', 'OMITIDO',
        'motivo', 'Duplicado en los Ãºltimos 7 dÃ­as',
        'id_operacion', v_dup_id
      );
      v_filas_omitidas := v_filas_omitidas + 1;
      CONTINUE;
    END IF;

    SELECT b.id, b.nombre
    INTO v_banco_cliente_id, v_banco_cliente_nombre
    FROM public.tb_banco b
    WHERE b.id = p_id_banco
       OR UPPER(COALESCE(v_fila.nombre_cliente_banco_ingreso, '')) LIKE '%' || UPPER(COALESCE(b.nombre, '')) || '%'
       OR UPPER(COALESCE(v_fila.nombre_cliente_banco_ingreso, '')) LIKE '%' || UPPER(COALESCE(b.nombre_abreviatura, '')) || '%'
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(COALESCE(b.nombre_equivalencia, '[]'::jsonb)) eq(valor)
         WHERE UPPER(COALESCE(v_fila.nombre_cliente_banco_ingreso, '')) LIKE '%' || UPPER(eq.valor) || '%'
       )
    ORDER BY CASE WHEN b.id = p_id_banco THEN 0 ELSE 1 END, b.id
    LIMIT 1;

    IF v_banco_cliente_id IS NULL THEN
      v_banco_cliente_id := p_id_banco;
      SELECT nombre INTO v_banco_cliente_nombre
      FROM public.tb_banco
      WHERE id = p_id_banco;
    END IF;

    SELECT COUNT(*) INTO v_reglas_candidatas_count
    FROM public.tb_reglas_efectivizacion r
    WHERE r.id_codigo_servicio = p_id_codigo_servicio
      AND r.id_banco = p_id_banco
      AND r.id_comunidad = COALESCE(v_cliente_comunidad, p_id_comunidad)
      AND r.tipo_deposito = p_id_tipo_deposito
      AND r.id_estado = (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1);

    SELECT r.*
    INTO v_regla
    FROM public.tb_reglas_efectivizacion r
    WHERE r.id_codigo_servicio = p_id_codigo_servicio
      AND r.id_banco = p_id_banco
      AND r.id_comunidad = COALESCE(v_cliente_comunidad, p_id_comunidad)
      AND r.tipo_deposito = p_id_tipo_deposito
      AND r.id_estado = (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1)
    LIMIT 1;

    IF v_regla.id IS NULL THEN
      v_detalle := v_detalle || jsonb_build_object(
        'fila', v_filas_procesadas + v_filas_omitidas + v_filas_error + 1,
        'codigo_operacion', v_fila.codigo_operacion,
        'estado', 'ERROR',
        'motivo', 'No se encontrÃ³ una regla activa de efectivizaciÃ³n'
      );
      v_filas_error := v_filas_error + 1;
      CONTINUE;
    END IF;

    v_calc_serv := public.f_get_tb_operacion_calculo_comision_servicio(
      v_monto,
      v_regla.comision_servicio,
      v_regla.monto_minimo_deposito_servicio,
      v_regla.comision_minima_servicio,
      0
    );

    v_calc_ing := public.f_get_tb_operacion_calculo_comision_banco_ingreso(
      false,
      v_monto,
      0,
      0,
      0,
      v_itf_cuenta
    );

    v_calc_sal := public.f_get_tb_operacion_calculo_comision_banco_salida(
      (v_calc_serv->>'monto_transferencia_cliente')::numeric,
      0,
      0,
      v_itf_cuenta,
      p_id_empresa_ingreso,
      v_id_empresa_cuenta_ingreso,
      p_id_banco,
      p_id_banco
    );

    INSERT INTO public.tb_operacion_proceso (
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
      resultado_comision_banco_ingreso,
      monto_itf_ingreso,
      comision_servicio,
      monto_minimo_deposito_servicio,
      comision_minima_servicio,
      comision_monto_extra_servicio,
      resultado_comision_servicio,
      id_empresa_salida,
      nombre_empresa_salida,
      id_empresa_cuenta_salida,
      id_banco_empresa_cuenta_salida,
      nombre_banco_empresa_cuenta_salida,
      comision_transf_banco_salida,
      comision_transf_inter_banco_salida,
      resultado_comision_banco_salida,
      monto_transferencia_cliente,
      monto_itf_salida,
      id_banco_cliente_transferencia,
      nombre_banco_cliente_transferencia,
      id_estado,
      nombre_estado,
      id_usuario,
      nombre_usuario,
      id_usuario_gestor,
      nombre_usuario_gestor,
      fecha_pendiente,
      tipo_facturacion
    )
    VALUES (
      p_id_codigo_servicio,
      v_excel_nombre_codigo_servicio,
      COALESCE(v_cliente_comunidad, p_id_comunidad),
      COALESCE((SELECT nombre FROM public.tb_comunidad WHERE id = COALESCE(v_cliente_comunidad, p_id_comunidad) LIMIT 1), p_nombre_comunidad),
      p_id_tipo_deposito,
      p_nombre_tipo_deposito,
      v_cliente_id,
      v_dni_parseado,
      COALESCE(v_cliente_nombre, ''),
      v_banco_cliente_id,
      v_banco_cliente_nombre,
      v_monto,
      COALESCE(v_fila.codigo_operacion, ''),
      v_fecha_deposito,
      p_id_empresa_ingreso,
      p_nombre_empresa_ingreso,
      v_id_empresa_cuenta_ingreso,
      p_id_banco,
      (SELECT nombre FROM public.tb_banco WHERE id = p_id_banco LIMIT 1),
      false,
      0,
      0,
      0,
      (v_calc_ing->>'resultado_comision_banco_ingreso')::numeric,
      v_itf_cuenta,
      v_regla.comision_servicio,
      v_regla.monto_minimo_deposito_servicio,
      v_regla.comision_minima_servicio,
      0,
      (v_calc_serv->>'resultado_comision_servicio')::numeric,
      p_id_empresa_ingreso,
      p_nombre_empresa_ingreso,
      v_id_empresa_cuenta_ingreso,
      p_id_banco,
      (SELECT nombre FROM public.tb_banco WHERE id = p_id_banco LIMIT 1),
      0,
      0,
      (v_calc_sal->>'resultado_comision_banco_salida')::numeric,
      (v_calc_serv->>'monto_transferencia_cliente')::numeric,
      v_itf_cuenta,
      p_id_banco,
      (SELECT nombre FROM public.tb_banco WHERE id = p_id_banco LIMIT 1),
      v_estado_pendiente_id,
      v_estado_pendiente_nombre,
      p_id_usuario,
      v_username,
      p_id_usuario,
      v_username,
      NOW(),
      'Boleta'
    )
    RETURNING id INTO v_new_id;

    v_detalle := v_detalle || jsonb_build_object(
      'fila', v_filas_procesadas + v_filas_omitidas + v_filas_error + 1,
      'codigo_operacion', v_fila.codigo_operacion,
      'estado', 'PROCESADO',
      'id_operacion', v_new_id
    );
    v_filas_procesadas := v_filas_procesadas + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'filas_procesadas', v_filas_procesadas,
    'filas_omitidas', v_filas_omitidas,
    'filas_error', v_filas_error,
    'detalle', v_detalle
  );
END;
$$;

/*
Funcion: f_post_tb_operacion_proceso_excel_ganancia
Objetivo:
  Procesar la variante de carga masiva cuya entrada viene orientada a ganancia.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_operacion_proceso_excel_ganancia(
  p_datos_excel_json jsonb,
  p_id_codigo_servicio bigint,
  p_nombre_codigo_servicio character varying,
  p_id_comunidad bigint,
  p_nombre_comunidad character varying,
  p_id_tipo_deposito bigint,
  p_nombre_tipo_deposito character varying,
  p_id_empresa_ingreso bigint,
  p_nombre_empresa_ingreso character varying,
  p_id_banco bigint,
  p_id_usuario bigint,
  p_nombre_usuario character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fila record;
  v_username character varying;
  v_estado_pagado_id bigint;
  v_estado_pagado_nombre character varying;
  v_dni_parseado character varying;
  v_tipo_doc character varying;
  v_monto bigint;
  v_fecha_deposito timestamp with time zone;
  v_cliente_id bigint;
  v_cliente_nombre character varying;
  v_dup_id bigint;
  v_id_empresa_cuenta_ingreso bigint;
  v_new_id bigint;
  v_detalle jsonb := '[]'::jsonb;
  v_filas_procesadas integer := 0;
  v_filas_omitidas integer := 0;
  v_filas_error integer := 0;
  v_excel_nombre_codigo_servicio character varying;
BEGIN
  SELECT username INTO v_username
  FROM public.tb_usuario
  WHERE id = p_id_usuario;

  IF NOT FOUND THEN
    v_username := 'Sistema';
  END IF;

  SELECT id, nombre INTO v_estado_pagado_id, v_estado_pagado_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PAGADO'
  LIMIT 1;

  v_excel_nombre_codigo_servicio := p_nombre_codigo_servicio;
  IF p_id_empresa_ingreso IS NOT NULL THEN
    SELECT COALESCE(e.nombre_codigo_servicio, cs.nombre, p_nombre_codigo_servicio)
    INTO v_excel_nombre_codigo_servicio
    FROM public.tb_empresa e
    CROSS JOIN public.tb_codigo_servicio cs
    WHERE e.id = p_id_empresa_ingreso
      AND cs.id = p_id_codigo_servicio
    LIMIT 1;
  END IF;

  SELECT ecb.id
  INTO v_id_empresa_cuenta_ingreso
  FROM public.tb_empresa_cuenta_bancaria ecb
  WHERE ecb.id_empresa = p_id_empresa_ingreso
    AND ecb.id_banco = p_id_banco
  LIMIT 1;

  FOR v_fila IN
    SELECT *
    FROM jsonb_to_recordset(p_datos_excel_json) AS x(
      dni text,
      monto text,
      codigo_operacion text,
      fecha_pago text,
      hora_proceso text,
      nombre_cliente_banco_ingreso text,
      estado text
    )
  LOOP
    BEGIN
      SELECT valor, tipo
      INTO v_dni_parseado, v_tipo_doc
      FROM public.f_get_tb_parse_documento(COALESCE(v_fila.dni, ''));
    EXCEPTION WHEN OTHERS THEN
      v_dni_parseado := '';
    END;

    BEGIN
      v_monto := COALESCE(REGEXP_REPLACE(COALESCE(v_fila.monto, '0'), '[^0-9.]', '', 'g')::numeric::bigint, 0);
    EXCEPTION WHEN OTHERS THEN
      v_monto := 0;
    END;

    BEGIN
      v_fecha_deposito := public.f_get_tb_parsear_fecha(v_fila.fecha_pago)::timestamp with time zone;
    EXCEPTION WHEN OTHERS THEN
      v_fecha_deposito := NOW();
    END;

    v_cliente_id := NULL;
    v_cliente_nombre := '';
    IF COALESCE(v_dni_parseado, '') <> '' THEN
      SELECT id, nombre
      INTO v_cliente_id, v_cliente_nombre
      FROM public.tb_cliente
      WHERE dni = v_dni_parseado
      LIMIT 1;

      IF v_cliente_id IS NULL THEN
        SELECT id, nombre
        INTO v_cliente_id, v_cliente_nombre
        FROM (
          SELECT *
          FROM jsonb_to_record(
            public.f_post_tb_cliente(
              p_dni := v_dni_parseado,
              p_nombre := '',
              p_id_comunidad := p_id_comunidad,
              p_id_estado := (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1),
              p_id_usuario := p_id_usuario
            )
          ) AS x(id bigint, nombre character varying)
        ) z;
      END IF;
    END IF;

    SELECT id
    INTO v_dup_id
    FROM public.tb_operacion_proceso
    WHERE dni_cliente = v_dni_parseado
      AND codigo_operacion_deposito_cliente = v_fila.codigo_operacion
      AND id_codigo_servicio = p_id_codigo_servicio
      AND id_empresa_cuenta_ingreso = v_id_empresa_cuenta_ingreso
      AND fecha_registro >= NOW() - INTERVAL '7 days'
    LIMIT 1;

    IF v_dup_id IS NOT NULL THEN
      v_detalle := v_detalle || jsonb_build_object(
        'fila', v_filas_procesadas + v_filas_omitidas + v_filas_error + 1,
        'codigo_operacion', v_fila.codigo_operacion,
        'estado', 'OMITIDO',
        'motivo', 'Duplicado en los Ãºltimos 7 dÃ­as',
        'id_operacion', v_dup_id
      );
      v_filas_omitidas := v_filas_omitidas + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.tb_operacion_proceso (
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
      codigo_operacion_deposito_cliente,
      fecha_deposito_cliente,
      id_empresa_ingreso,
      nombre_empresa_ingreso,
      id_empresa_cuenta_ingreso,
      id_banco_empresa_cuenta_ingreso,
      nombre_banco_empresa_cuenta_ingreso,
      resultado_comision_banco_ingreso,
      comision_servicio,
      monto_minimo_deposito_servicio,
      comision_minima_servicio,
      comision_monto_extra_servicio,
      resultado_comision_servicio,
      id_empresa_salida,
      nombre_empresa_salida,
      id_empresa_cuenta_salida,
      id_banco_empresa_cuenta_salida,
      nombre_banco_empresa_cuenta_salida,
      resultado_comision_banco_salida,
      monto_transferencia_cliente,
      id_banco_cliente_transferencia,
      nombre_banco_cliente_transferencia,
      id_estado,
      nombre_estado,
      id_usuario,
      nombre_usuario,
      id_usuario_gestor,
      nombre_usuario_gestor,
      fecha_pendiente,
      tipo_facturacion
    )
    VALUES (
      p_id_codigo_servicio,
      v_excel_nombre_codigo_servicio,
      p_id_comunidad,
      p_nombre_comunidad,
      p_id_tipo_deposito,
      p_nombre_tipo_deposito,
      v_cliente_id,
      v_dni_parseado,
      COALESCE(v_cliente_nombre, ''),
      p_id_banco,
      (SELECT nombre FROM public.tb_banco WHERE id = p_id_banco LIMIT 1),
      v_monto,
      COALESCE(v_fila.codigo_operacion, ''),
      v_fecha_deposito,
      p_id_empresa_ingreso,
      p_nombre_empresa_ingreso,
      v_id_empresa_cuenta_ingreso,
      p_id_banco,
      (SELECT nombre FROM public.tb_banco WHERE id = p_id_banco LIMIT 1),
      0,
      0,
      0,
      0,
      0,
      v_monto,
      p_id_empresa_ingreso,
      p_nombre_empresa_ingreso,
      v_id_empresa_cuenta_ingreso,
      p_id_banco,
      (SELECT nombre FROM public.tb_banco WHERE id = p_id_banco LIMIT 1),
      0,
      0,
      p_id_banco,
      (SELECT nombre FROM public.tb_banco WHERE id = p_id_banco LIMIT 1),
      v_estado_pagado_id,
      v_estado_pagado_nombre,
      p_id_usuario,
      v_username,
      p_id_usuario,
      v_username,
      NOW(),
      'Boleta'
    )
    RETURNING id INTO v_new_id;

    v_detalle := v_detalle || jsonb_build_object(
      'fila', v_filas_procesadas + v_filas_omitidas + v_filas_error + 1,
      'codigo_operacion', v_fila.codigo_operacion,
      'estado', 'PROCESADO',
      'id_operacion', v_new_id
    );
    v_filas_procesadas := v_filas_procesadas + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'filas_procesadas', v_filas_procesadas,
    'filas_omitidas', v_filas_omitidas,
    'filas_error', v_filas_error,
    'detalle', v_detalle
  );
END;
$$;




