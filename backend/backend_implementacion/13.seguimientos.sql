-- ============================================================================
-- 13. SEGUIMIENTOS GLOBALES
-- ============================================================================

/*
  Consultas globales de seguimiento para jefaturas.
  Estas funciones no modifican operaciones y no aplican aislamiento por usuario,
  empresa, caja o ruta activa.
*/

CREATE OR REPLACE FUNCTION public.f_get_tb_seguimiento_efectivizacion_kpi(
  p_filtro_estado character varying DEFAULT 'Todos'
)
RETURNS TABLE (
  total_operaciones_pendientes integer,
  total_operaciones_pagados integer,
  total_monto_depositos numeric,
  total_monto_comisiones numeric,
  total_monto_transferencia numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH operaciones AS (
    SELECT DISTINCT ON (op.id)
      op.id,
      op.nombre_estado,
      op.monto_deposito_cliente,
      op.resultado_comision_servicio,
      op.monto_transferencia_cliente
    FROM public.tb_operacion_proceso op
    WHERE COALESCE(op.id_estado, 0) <> 10
      AND COALESCE(op.flag_retenido, false) = false
      AND (
        (
          UPPER(COALESCE(op.tipo_servicio, '')) = 'EFECTIVIZACION'
          AND (
            (
              COALESCE(op.flag_derivado, false) = false
              AND LOWER(COALESCE(op.ruta_destino, '')) IN ('bcp', 'bbva', 'scotiabank', 'banbif', 'interbank', 'safetypay')
            )
            OR (
              COALESCE(op.flag_derivado, false) = true
              AND LOWER(COALESCE(op.ruta_origen, '')) IN ('bcp', 'bbva', 'scotiabank', 'banbif', 'interbank', 'safetypay')
            )
          )
        )
        OR (
          LOWER(COALESCE(op.ruta_origen, '')) = 'pos'
          AND LOWER(COALESCE(op.ruta_destino, '')) IN ('bcp', 'bbva', 'scotiabank', 'banbif', 'interbank', 'safetypay')
        )
      )
      AND (
        UPPER(COALESCE(p_filtro_estado, 'TODOS')) = 'TODOS'
        OR (
          UPPER(COALESCE(p_filtro_estado, '')) = 'PENDIENTE'
          AND UPPER(COALESCE(op.nombre_estado, '')) <> 'PAGADO'
        )
        OR (
          UPPER(COALESCE(p_filtro_estado, '')) = 'PAGADO'
          AND UPPER(COALESCE(op.nombre_estado, '')) = 'PAGADO'
        )
      )
    ORDER BY op.id
  )
  SELECT
    COUNT(*) FILTER (WHERE UPPER(COALESCE(nombre_estado, '')) <> 'PAGADO')::integer,
    COUNT(*) FILTER (WHERE UPPER(COALESCE(nombre_estado, '')) = 'PAGADO')::integer,
    COALESCE(SUM(COALESCE(monto_deposito_cliente, 0)), 0),
    COALESCE(SUM(COALESCE(resultado_comision_servicio, 0)), 0),
    COALESCE(SUM(COALESCE(monto_transferencia_cliente, 0)), 0)
  FROM operaciones;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_seguimiento_efectivizacion_bandeja(
  p_tab character varying DEFAULT 'Efectivizacion',
  p_filtro_estado character varying DEFAULT 'Todos',
  p_dni_cliente character varying DEFAULT NULL,
  p_codigo_operacion character varying DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT to_jsonb(op) || jsonb_build_object(
    'seguimiento_tab', p_tab,
    'seguimiento_ruta_origen', op.ruta_origen,
    'seguimiento_transferencia', CASE
      WHEN LOWER(COALESCE(p_tab, '')) = 'efectivizacion'
        AND COALESCE(op.flag_derivado, false) = true
        AND LOWER(COALESCE(op.ruta_origen, '')) IN ('bcp', 'bbva', 'scotiabank', 'banbif', 'interbank', 'safetypay')
      THEN 0
      ELSE COALESCE(op.monto_transferencia_cliente, 0)
    END,
    'seguimiento_derivada', (
      COALESCE(op.flag_derivado, false) = true
      AND LOWER(COALESCE(p_tab, '')) = 'efectivizacion'
      AND LOWER(COALESCE(op.ruta_origen, '')) IN ('bcp', 'bbva', 'scotiabank', 'banbif', 'interbank', 'safetypay')
    )
  )
  FROM public.tb_operacion_proceso op
  WHERE COALESCE(op.id_estado, 0) <> 10
    AND COALESCE(op.flag_retenido, false) = false
    AND (p_dni_cliente IS NULL OR COALESCE(op.dni_cliente, '') ILIKE '%' || p_dni_cliente || '%')
    AND (p_codigo_operacion IS NULL OR COALESCE(op.codigo_operacion_deposito_cliente, '') ILIKE '%' || p_codigo_operacion || '%')
    AND (
      (
        LOWER(COALESCE(p_tab, '')) = 'efectivizacion'
        AND UPPER(COALESCE(op.tipo_servicio, '')) = 'EFECTIVIZACION'
        AND (
          (
            COALESCE(op.flag_derivado, false) = false
            AND LOWER(COALESCE(op.ruta_destino, '')) IN ('bcp', 'bbva', 'scotiabank', 'banbif', 'interbank', 'safetypay')
          )
          OR (
            COALESCE(op.flag_derivado, false) = true
            AND LOWER(COALESCE(op.ruta_origen, '')) IN ('bcp', 'bbva', 'scotiabank', 'banbif', 'interbank', 'safetypay')
          )
        )
      )
      OR (
        LOWER(COALESCE(p_tab, '')) = 'derivados'
        AND UPPER(COALESCE(op.tipo_servicio, '')) = 'EFECTIVIZACION'
        AND COALESCE(op.flag_derivado, false) = true
        AND LOWER(COALESCE(op.ruta_destino, '')) IN ('bcp', 'bbva', 'scotiabank', 'banbif', 'interbank', 'safetypay')
      )
      OR (
        LOWER(COALESCE(p_tab, '')) = 'pos'
        AND LOWER(COALESCE(op.ruta_origen, '')) = 'pos'
        AND LOWER(COALESCE(op.ruta_destino, '')) IN ('bcp', 'bbva', 'scotiabank', 'banbif', 'interbank', 'safetypay')
      )
    )
    AND (
      UPPER(COALESCE(p_filtro_estado, 'TODOS')) = 'TODOS'
      OR (UPPER(COALESCE(p_filtro_estado, '')) = 'PENDIENTE' AND UPPER(COALESCE(op.nombre_estado, '')) <> 'PAGADO')
      OR (UPPER(COALESCE(p_filtro_estado, '')) = 'PAGADO' AND UPPER(COALESCE(op.nombre_estado, '')) = 'PAGADO')
    )
  ORDER BY op.fecha_registro DESC, op.id DESC;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_seguimiento_pago_deuda_kpi()
RETURNS TABLE (
  total_operaciones_pendientes integer,
  total_operaciones_pagados integer,
  total_monto_solicitados numeric,
  total_comisiones numeric,
  total_monto_devueltos numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH solicitudes AS (
    SELECT
      op.*,
      EXISTS (
        SELECT 1
        FROM public.tb_operacion_caja c
        WHERE c.id_operacion_proceso = op.id
          AND c.tipo_origen = 'PAGO_DEUDA_COMISION'
      ) AS flag_comision,
      (
        COALESCE(op.id_operacion_match, 0) <> 0
        OR COALESCE(op.monto_devuelto, 0) >= COALESCE(op.monto_deposito_cliente, 0)
      ) AS flag_devolucion
    FROM public.tb_operacion_proceso op
    WHERE op.id_operacion_padre IS NULL
      AND UPPER(COALESCE(op.tipo_flujo_pago_deuda, '')) = 'SOLICITUD'
      AND COALESCE(op.id_estado, 0) <> 10
  )
  SELECT
    COUNT(*) FILTER (WHERE NOT flag_comision)::integer,
    COUNT(*) FILTER (WHERE flag_comision)::integer,
    COALESCE(SUM(COALESCE(monto_deposito_cliente, 0)), 0),
    COALESCE(SUM(COALESCE(resultado_comision_servicio, 0)) FILTER (WHERE flag_comision), 0),
    COALESCE(SUM(CASE
      WHEN flag_devolucion THEN COALESCE(monto_deposito_cliente, 0)
      ELSE COALESCE(monto_devuelto, 0)
    END), 0)
  FROM solicitudes;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_seguimiento_pago_deuda_bandeja(
  p_filtro_estado character varying DEFAULT 'Todos',
  p_dni_cliente character varying DEFAULT NULL,
  p_codigo_operacion character varying DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH solicitudes AS (
    SELECT
      op.*,
      EXISTS (
        SELECT 1
        FROM public.tb_operacion_caja c
        WHERE c.id_operacion_proceso = op.id
          AND c.tipo_origen = 'PAGO_DEUDA_COMISION'
      ) AS flag_comision,
      (
        COALESCE(op.id_operacion_match, 0) <> 0
        OR COALESCE(op.monto_devuelto, 0) >= COALESCE(op.monto_deposito_cliente, 0)
      ) AS flag_devolucion
    FROM public.tb_operacion_proceso op
    WHERE op.id_operacion_padre IS NULL
      AND UPPER(COALESCE(op.tipo_flujo_pago_deuda, '')) = 'SOLICITUD'
      AND COALESCE(op.id_estado, 0) <> 10
      AND (p_dni_cliente IS NULL OR COALESCE(op.dni_cliente, '') ILIKE '%' || p_dni_cliente || '%')
      AND (p_codigo_operacion IS NULL OR COALESCE(op.codigo_operacion_deposito_cliente, '') ILIKE '%' || p_codigo_operacion || '%')
  )
  SELECT COALESCE(pd.payload, to_jsonb(s)) || jsonb_build_object(
    'seguimiento_estado', CASE
      WHEN s.flag_comision THEN 'Pagado'
      WHEN s.flag_devolucion AND (
        UPPER(COALESCE(s.nombre_estado, '')) IN ('PROCESADO', 'PAGADO')
        OR COALESCE(s.id_operacion_match, 0) <> 0
      ) THEN 'Pendiente Comision'
      WHEN UPPER(COALESCE(s.nombre_estado, '')) IN ('PROCESADO', 'PAGADO') THEN 'Pendiente Devolucion'
      ELSE 'Pendiente Transferencia'
    END,
    'flag_comision_registrada', s.flag_comision,
    'seguimiento_flag_devolucion', s.flag_devolucion
  )
  FROM solicitudes s
  LEFT JOIN LATERAL public.f_get_tb_pago_deuda(p_id := s.id) AS pd(payload) ON true
  WHERE UPPER(COALESCE(p_filtro_estado, 'TODOS')) = 'TODOS'
    OR (
      UPPER(COALESCE(p_filtro_estado, '')) = 'PENDIENTE TRANSFERENCIA'
      AND NOT s.flag_comision
      AND NOT s.flag_devolucion
      AND UPPER(COALESCE(s.nombre_estado, '')) NOT IN ('PROCESADO', 'PAGADO')
    )
    OR (
      UPPER(COALESCE(p_filtro_estado, '')) = 'PENDIENTE DEVOLUCION'
      AND NOT s.flag_comision
      AND NOT s.flag_devolucion
      AND UPPER(COALESCE(s.nombre_estado, '')) IN ('PROCESADO', 'PAGADO')
    )
    OR (
      UPPER(COALESCE(p_filtro_estado, '')) = 'PENDIENTE COMISION'
      AND NOT s.flag_comision
      AND s.flag_devolucion
    )
  ORDER BY s.fecha_registro DESC, s.id DESC;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_seguimiento_efectivizacion_paginado(
  p_tab character varying DEFAULT 'Efectivizacion',
  p_ruta character varying DEFAULT NULL,
  p_filtro_estado character varying DEFAULT 'Todos',
  p_dni_cliente character varying DEFAULT NULL,
  p_codigo_operacion character varying DEFAULT NULL,
  p_filtro_tiempo character varying DEFAULT 'Todos',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      op.*,
      (
        EXTRACT(EPOCH FROM (
          COALESCE(
            CASE WHEN UPPER(COALESCE(op.nombre_estado, '')) = 'PAGADO' THEN op.fecha_pagado END,
            now()
          ) - op.fecha_registro
        ))
      )::bigint AS tiempo_atencion_segundos
    FROM public.tb_operacion_proceso op
    WHERE COALESCE(op.id_estado, 0) <> 10
      AND COALESCE(op.flag_retenido, false) = false
      AND (p_dni_cliente IS NULL OR COALESCE(op.dni_cliente, '') ILIKE '%' || p_dni_cliente || '%')
      AND (p_codigo_operacion IS NULL OR COALESCE(op.codigo_operacion_deposito_cliente, '') ILIKE '%' || p_codigo_operacion || '%')
      AND (
        p_ruta IS NULL
        OR (
          LOWER(COALESCE(p_tab, '')) = 'efectivizacion'
          AND (
            LOWER(COALESCE(op.ruta_destino, '')) = LOWER(p_ruta)
            OR (COALESCE(op.flag_derivado, false) = true AND LOWER(COALESCE(op.ruta_origen, '')) = LOWER(p_ruta))
          )
        )
        OR (
          LOWER(COALESCE(p_tab, '')) IN ('derivados', 'pos')
          AND LOWER(COALESCE(op.ruta_destino, '')) = LOWER(p_ruta)
        )
      )
      AND (
        (LOWER(COALESCE(p_tab, '')) = 'efectivizacion'
          AND UPPER(COALESCE(op.tipo_servicio, '')) = 'EFECTIVIZACION'
          AND ((COALESCE(op.flag_derivado, false) = false AND LOWER(COALESCE(op.ruta_destino, '')) IN ('bcp','bbva','scotiabank','banbif','interbank','safetypay'))
            OR (COALESCE(op.flag_derivado, false) = true AND LOWER(COALESCE(op.ruta_origen, '')) IN ('bcp','bbva','scotiabank','banbif','interbank','safetypay'))))
        OR (LOWER(COALESCE(p_tab, '')) = 'derivados'
          AND UPPER(COALESCE(op.tipo_servicio, '')) = 'EFECTIVIZACION'
          AND COALESCE(op.flag_derivado, false) = true
          AND LOWER(COALESCE(op.ruta_destino, '')) IN ('bcp','bbva','scotiabank','banbif','interbank','safetypay'))
        OR (LOWER(COALESCE(p_tab, '')) = 'pos'
          AND LOWER(COALESCE(op.ruta_origen, '')) = 'pos'
          AND LOWER(COALESCE(op.ruta_destino, '')) IN ('bcp','bbva','scotiabank','banbif','interbank','safetypay'))
      )
      -- Filtro de estado original conservado para reactivar la vista de pagados:
      -- AND (
      --   UPPER(COALESCE(p_filtro_estado, 'TODOS')) = 'TODOS'
      --   OR (UPPER(COALESCE(p_filtro_estado, '')) = 'PENDIENTE' AND UPPER(COALESCE(op.nombre_estado, '')) <> 'PAGADO')
      --   OR (UPPER(COALESCE(p_filtro_estado, '')) = 'PAGADO' AND UPPER(COALESCE(op.nombre_estado, '')) = 'PAGADO')
      -- )
      AND UPPER(COALESCE(op.nombre_estado, '')) <> 'PAGADO'
  ), filtered AS (
    SELECT *
    FROM base
    WHERE UPPER(COALESCE(p_filtro_tiempo, 'TODOS')) = 'TODOS'
      OR (UPPER(p_filtro_tiempo) = 'MENOR_1_HORA' AND tiempo_atencion_segundos < 3600)
      OR (UPPER(p_filtro_tiempo) = 'ENTRE_1_Y_2_HORAS' AND tiempo_atencion_segundos >= 3600 AND tiempo_atencion_segundos < 7200)
      OR (UPPER(p_filtro_tiempo) = 'MAYOR_IGUAL_2_HORAS' AND tiempo_atencion_segundos >= 7200)
  ), page_rows AS (
    SELECT to_jsonb(filtered) || jsonb_build_object(
      'seguimiento_tab', p_tab,
      'seguimiento_ruta_origen', ruta_origen,
      'seguimiento_tiempo_atencion_segundos', tiempo_atencion_segundos,
      'seguimiento_transferencia', CASE WHEN LOWER(COALESCE(p_tab, '')) = 'efectivizacion' AND COALESCE(flag_derivado, false) = true AND LOWER(COALESCE(ruta_origen, '')) IN ('bcp','bbva','scotiabank','banbif','interbank','safetypay') THEN 0 ELSE COALESCE(monto_transferencia_cliente, 0) END,
      'seguimiento_derivada', (COALESCE(flag_derivado, false) = true AND LOWER(COALESCE(p_tab, '')) = 'efectivizacion' AND LOWER(COALESCE(ruta_origen, '')) IN ('bcp','bbva','scotiabank','banbif','interbank','safetypay'))
    ) AS payload
    FROM filtered
    ORDER BY fecha_registro DESC, id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100)
    OFFSET (GREATEST(COALESCE(p_page, 1), 1) - 1) * LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100)
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((SELECT jsonb_agg(payload) FROM page_rows), '[]'::jsonb),
    'total', COUNT(*)::integer,
    'total_paginas', CEIL(COUNT(*)::numeric / LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100))::integer,
    'tiempo_menor_una_hora', COUNT(*) FILTER (WHERE tiempo_atencion_segundos < 3600)::integer,
    'tiempo_entre_una_y_dos_horas', COUNT(*) FILTER (WHERE tiempo_atencion_segundos >= 3600 AND tiempo_atencion_segundos < 7200)::integer,
    'tiempo_mayor_igual_dos_horas', COUNT(*) FILTER (WHERE tiempo_atencion_segundos >= 7200)::integer,
    'total_pendientes', COUNT(*) FILTER (WHERE UPPER(COALESCE(nombre_estado, '')) <> 'PAGADO')::integer
  )
  FROM filtered;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_seguimiento_pago_deuda_paginado(
  p_tab character varying DEFAULT 'Pago Deuda',
  p_ruta character varying DEFAULT NULL,
  p_filtro_estado character varying DEFAULT 'Todos',
  p_dni_cliente character varying DEFAULT NULL,
  p_codigo_operacion character varying DEFAULT NULL,
  p_filtro_tiempo character varying DEFAULT 'Todos',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH solicitudes AS (
    SELECT op.*,
      EXISTS (SELECT 1 FROM public.tb_operacion_caja c WHERE c.id_operacion_proceso = op.id AND c.tipo_origen = 'PAGO_DEUDA_COMISION') AS flag_comision,
      (COALESCE(op.id_operacion_match, 0) <> 0 OR COALESCE(op.monto_devuelto, 0) >= COALESCE(op.monto_deposito_cliente, 0)) AS flag_devolucion
    FROM public.tb_operacion_proceso op
    WHERE op.id_operacion_padre IS NULL
      AND UPPER(COALESCE(op.tipo_flujo_pago_deuda, '')) = 'SOLICITUD'
      AND COALESCE(op.id_estado, 0) <> 10
      AND (p_dni_cliente IS NULL OR COALESCE(op.dni_cliente, '') ILIKE '%' || p_dni_cliente || '%')
      AND (p_codigo_operacion IS NULL OR COALESCE(op.codigo_operacion_deposito_cliente, '') ILIKE '%' || p_codigo_operacion || '%')
      AND (
        p_ruta IS NULL
        OR LOWER(COALESCE(op.ruta_destino, '')) = LOWER(p_ruta)
        OR EXISTS (
          SELECT 1
          FROM public.tb_operacion_proceso banco
          WHERE banco.id_operacion_padre = op.id
            AND UPPER(COALESCE(banco.tipo_flujo_pago_deuda, '')) = 'BANCO'
            AND LOWER(COALESCE(banco.ruta_destino, '')) = LOWER(p_ruta)
        )
      )
  ), base AS (
    SELECT s.*, pd.payload,
      CASE WHEN s.flag_comision THEN 'Pagado'
        WHEN s.flag_devolucion AND (UPPER(COALESCE(s.nombre_estado, '')) IN ('PROCESADO', 'PAGADO') OR COALESCE(s.id_operacion_match, 0) <> 0) THEN 'Pendiente Comision'
        WHEN UPPER(COALESCE(s.nombre_estado, '')) IN ('PROCESADO', 'PAGADO') THEN 'Pendiente Devolucion'
        ELSE 'Pendiente Transferencia' END AS seguimiento_estado,
      EXTRACT(EPOCH FROM (COALESCE(CASE WHEN s.flag_comision THEN s.fecha_pagado END, now()) - s.fecha_registro))::bigint AS tiempo_atencion_segundos
    FROM solicitudes s
    LEFT JOIN LATERAL public.f_get_tb_pago_deuda(p_id := s.id) AS pd(payload) ON true
  ), filtered AS (
    SELECT * FROM base
    WHERE (
      -- Filtro de estado original conservado para reactivar otros estados:
      -- UPPER(COALESCE(p_filtro_estado, 'TODOS')) = 'TODOS'
      -- OR UPPER(seguimiento_estado) = UPPER(COALESCE(p_filtro_estado, ''))
      UPPER(seguimiento_estado) <> 'PAGADO'
    )
      AND (UPPER(COALESCE(p_filtro_tiempo, 'TODOS')) = 'TODOS'
        OR (UPPER(p_filtro_tiempo) = 'MENOR_1_HORA' AND tiempo_atencion_segundos < 3600)
        OR (UPPER(p_filtro_tiempo) = 'ENTRE_1_Y_2_HORAS' AND tiempo_atencion_segundos >= 3600 AND tiempo_atencion_segundos < 7200)
        OR (UPPER(p_filtro_tiempo) = 'MAYOR_IGUAL_2_HORAS' AND tiempo_atencion_segundos >= 7200))
  ), page_rows AS (
    SELECT COALESCE(payload, to_jsonb(filtered)) || jsonb_build_object('seguimiento_estado', seguimiento_estado, 'seguimiento_flag_devolucion', flag_devolucion, 'flag_comision_registrada', flag_comision, 'seguimiento_tiempo_atencion_segundos', tiempo_atencion_segundos) AS payload
    FROM filtered
    ORDER BY fecha_registro DESC, id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100)
    OFFSET (GREATEST(COALESCE(p_page, 1), 1) - 1) * LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100)
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((SELECT jsonb_agg(payload) FROM page_rows), '[]'::jsonb),
    'total', COUNT(*)::integer,
    'total_paginas', CEIL(COUNT(*)::numeric / LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100))::integer,
    'tiempo_menor_una_hora', COUNT(*) FILTER (WHERE tiempo_atencion_segundos < 3600)::integer,
    'tiempo_entre_una_y_dos_horas', COUNT(*) FILTER (WHERE tiempo_atencion_segundos >= 3600 AND tiempo_atencion_segundos < 7200)::integer,
    'tiempo_mayor_igual_dos_horas', COUNT(*) FILTER (WHERE tiempo_atencion_segundos >= 7200)::integer,
    'total_pendientes', COUNT(*) FILTER (WHERE UPPER(seguimiento_estado) <> 'PAGADO')::integer
  )
  FROM filtered;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_seguimiento_operaciones_paginado(
  p_ruta character varying DEFAULT NULL,
  p_flujo character varying DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_codigo_operacion character varying DEFAULT NULL,
  p_filtro_tiempo character varying DEFAULT 'Todos',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH source_rows AS (
    SELECT
      op.id,
      'Efectivizacion'::text AS flujo,
      NULL::integer AS pasos,
      op.tipo_facturacion::text AS facturacion,
      NULL::text AS derivo,
      op.codigo_operacion_deposito_cliente::text AS codigo_operacion,
      NULL::text AS codigo_devolucion,
      NULL::text AS codigo_comision,
      op.dni_cliente::text AS dni,
      op.nombre_cliente::text AS cliente,
      op.nombre_comunidad::text AS comunidad,
      COALESCE(op.nombre_empresa_salida, op.nombre_empresa_ingreso)::text AS empresa_cuenta_empresa,
      COALESCE(op.nombre_banco_empresa_cuenta_salida, op.nombre_banco_empresa_cuenta_ingreso)::text AS empresa_cuenta_cuenta,
      op.nombre_banco_cliente::text AS cuenta_cliente,
      COALESCE(op.monto_deposito_cliente, 0)::numeric AS monto,
      COALESCE(op.resultado_comision_servicio, 0)::numeric AS comision_importe,
      op.comision_servicio::numeric AS comision_porcentaje,
      COALESCE(op.monto_transferencia_cliente, 0)::numeric AS transferencia,
      NULL::numeric AS monto_devolucion,
      NULL::text AS cuenta_comision_empresa,
      NULL::text AS cuenta_comision_cuenta,
      op.nombre_estado::text AS estado,
      op.fecha_registro,
      NULL::jsonb AS retorno_datos
    FROM public.tb_operacion_proceso op
    WHERE UPPER(COALESCE(op.tipo_servicio, '')) = 'EFECTIVIZACION'
      AND COALESCE(op.flag_derivado, false) = false
      AND COALESCE(op.flag_retenido, false) = false
      AND COALESCE(op.id_estado, 0) <> 10
      AND UPPER(COALESCE(op.nombre_estado, '')) <> 'PAGADO'
      AND LOWER(COALESCE(op.ruta_destino, '')) IN ('bcp','bbva','scotiabank','banbif','interbank','safetypay')
      AND (p_ruta IS NULL OR LOWER(op.ruta_destino) = LOWER(p_ruta))

    UNION ALL

    SELECT
      op.id,
      'Efectivizacion'::text,
      NULL::integer,
      op.tipo_facturacion::text,
      op.ruta_origen::text,
      op.codigo_operacion_deposito_cliente::text,
      NULL::text,
      NULL::text,
      op.dni_cliente::text,
      op.nombre_cliente::text,
      op.nombre_comunidad::text,
      COALESCE(op.nombre_empresa_salida, op.nombre_empresa_ingreso)::text,
      COALESCE(op.nombre_banco_empresa_cuenta_salida, op.nombre_banco_empresa_cuenta_ingreso)::text,
      op.nombre_banco_cliente::text,
      COALESCE(op.monto_deposito_cliente, 0)::numeric,
      COALESCE(op.resultado_comision_servicio, 0)::numeric,
      op.comision_servicio::numeric,
      COALESCE(op.monto_transferencia_cliente, 0)::numeric,
      NULL::numeric,
      NULL::text,
      NULL::text,
      op.nombre_estado::text,
      op.fecha_registro,
      NULL::jsonb
    FROM public.tb_operacion_proceso op
    WHERE UPPER(COALESCE(op.tipo_servicio, '')) = 'EFECTIVIZACION'
      AND COALESCE(op.flag_derivado, false) = true
      AND COALESCE(op.flag_retenido, false) = false
      AND COALESCE(op.id_estado, 0) <> 10
      AND UPPER(COALESCE(op.nombre_estado, '')) <> 'PAGADO'
      AND LOWER(COALESCE(op.ruta_destino, '')) IN ('bcp','bbva','scotiabank','banbif','interbank','safetypay')
      AND (p_ruta IS NULL OR LOWER(op.ruta_destino) = LOWER(p_ruta))

    UNION ALL

    SELECT
      op.id,
      'POS'::text,
      NULL::integer,
      op.tipo_facturacion::text,
      NULL::text,
      op.codigo_operacion_deposito_cliente::text,
      NULL::text,
      NULL::text,
      op.dni_cliente::text,
      op.nombre_cliente::text,
      op.nombre_comunidad::text,
      COALESCE(op.nombre_empresa_salida, op.nombre_empresa_ingreso)::text,
      COALESCE(op.nombre_banco_empresa_cuenta_salida, op.nombre_banco_empresa_cuenta_ingreso)::text,
      op.nombre_banco_cliente::text,
      COALESCE(op.monto_deposito_cliente, 0)::numeric,
      COALESCE(op.resultado_comision_servicio, 0)::numeric,
      op.comision_servicio::numeric,
      COALESCE(op.monto_transferencia_cliente, 0)::numeric,
      NULL::numeric,
      NULL::text,
      NULL::text,
      op.nombre_estado::text,
      op.fecha_registro,
      NULL::jsonb
    FROM public.tb_operacion_proceso op
    WHERE LOWER(COALESCE(op.ruta_origen, '')) = 'pos'
      AND COALESCE(op.flag_retenido, false) = false
      AND COALESCE(op.id_estado, 0) <> 10
      AND UPPER(COALESCE(op.nombre_estado, '')) <> 'PAGADO'
      AND LOWER(COALESCE(op.ruta_destino, '')) IN ('bcp','bbva','scotiabank','banbif','interbank','safetypay')
      AND (p_ruta IS NULL OR LOWER(op.ruta_destino) = LOWER(p_ruta))

    UNION ALL

    SELECT
      op.id,
      'Pago Deuda'::text,
      CASE
        WHEN flag_comision THEN 4
        WHEN flag_devolucion AND UPPER(COALESCE(op.nombre_estado, '')) IN ('PROCESADO', 'PAGADO') THEN 3
        WHEN UPPER(COALESCE(op.nombre_estado, '')) IN ('PROCESADO', 'PAGADO') THEN 2
        ELSE 1
      END,
      op.tipo_facturacion::text,
      NULL::text,
      NULLIF(BTRIM(COALESCE(banco.codigo_operacion_deposito_cliente, '')), ''),
      retorno.codigos_operacion,
      NULLIF(BTRIM(COALESCE(op.codigo_operacion_deposito_cliente, '')), ''),
      op.dni_cliente::text,
      op.nombre_cliente::text,
      op.nombre_comunidad::text,
      banco.nombre_empresa_salida::text,
      banco.nombre_banco_empresa_cuenta_salida::text,
      op.nombre_banco_cliente::text,
      COALESCE(op.monto_deposito_cliente, 0)::numeric,
      COALESCE(op.resultado_comision_servicio, 0)::numeric,
      op.comision_servicio::numeric,
      COALESCE(banco.monto_transferencia_cliente, 0)::numeric,
      retorno.monto_devolucion::numeric,
      comision.nombre_empresa::text,
      comision.nombre_banco::text,
      CASE
        WHEN flag_devolucion AND UPPER(COALESCE(op.nombre_estado, '')) IN ('PROCESADO', 'PAGADO') THEN 'Pendiente Comision'
        WHEN UPPER(COALESCE(op.nombre_estado, '')) IN ('PROCESADO', 'PAGADO') THEN 'Pendiente Devolucion'
        ELSE 'Pendiente Transferencia'
      END,
      op.fecha_registro,
      NULL::jsonb
    FROM public.tb_operacion_proceso op
    LEFT JOIN LATERAL (
      SELECT b.*
      FROM public.tb_operacion_proceso b
      WHERE b.id_operacion_padre = op.id
        AND UPPER(COALESCE(b.tipo_flujo_pago_deuda, '')) = 'BANCO'
      ORDER BY b.id DESC
      LIMIT 1
    ) banco ON true
    LEFT JOIN LATERAL (
      SELECT
        SUM(COALESCE(r.monto_deposito_cliente, r.monto_transferencia_cliente, 0)) AS monto_devolucion,
        STRING_AGG(NULLIF(BTRIM(COALESCE(r.codigo_operacion_deposito_cliente, '')), ''), E'\n' ORDER BY r.fecha_deposito_cliente NULLS LAST, r.fecha_registro NULLS LAST, r.id) AS codigos_operacion
      FROM public.tb_operacion_proceso r
      WHERE UPPER(COALESCE(r.tipo_flujo_pago_deuda, '')) = 'RETORNO'
        AND (r.id = op.id_operacion_match OR r.id_operacion_match = op.id OR r.id_operacion_padre = op.id)
    ) retorno ON true
    LEFT JOIN LATERAL (
      SELECT c.nombre_empresa, c.nombre_banco
      FROM public.tb_operacion_caja c
      WHERE c.id_operacion_proceso = op.id
        AND c.tipo_origen = 'PAGO_DEUDA_COMISION'
      ORDER BY c.id DESC
      LIMIT 1
    ) comision ON true
    CROSS JOIN LATERAL (
      SELECT
        EXISTS (
          SELECT 1
          FROM public.tb_operacion_caja c
          WHERE c.id_operacion_proceso = op.id
            AND c.tipo_origen = 'PAGO_DEUDA_COMISION'
        ) AS flag_comision,
        (COALESCE(op.id_operacion_match, 0) <> 0 OR COALESCE(op.monto_devuelto, 0) >= COALESCE(op.monto_deposito_cliente, 0)) AS flag_devolucion
    ) flags
    WHERE op.id_operacion_padre IS NULL
      AND UPPER(COALESCE(op.tipo_flujo_pago_deuda, '')) = 'SOLICITUD'
      AND COALESCE(op.flag_retenido, false) = false
      AND COALESCE(op.id_estado, 0) <> 10
      AND UPPER(COALESCE(op.nombre_estado, '')) <> 'PAGADO'
      AND NOT flags.flag_comision
      AND (p_ruta IS NULL OR LOWER(COALESCE(banco.ruta_destino, op.ruta_destino, '')) = LOWER(p_ruta))
  ), base AS (
    SELECT source_rows.*, EXTRACT(EPOCH FROM (now() - fecha_registro))::bigint AS tiempo_atencion_segundos
    FROM source_rows
  ), filtered AS (
    SELECT *
    FROM base
    WHERE (p_flujo IS NULL OR BTRIM(p_flujo) = '' OR UPPER(p_flujo) = 'TODOS' OR UPPER(flujo) = UPPER(p_flujo))
      AND (p_dni_cliente IS NULL OR dni ILIKE '%' || p_dni_cliente || '%')
      AND (
        p_codigo_operacion IS NULL
        OR codigo_operacion ILIKE '%' || p_codigo_operacion || '%'
        OR codigo_devolucion ILIKE '%' || p_codigo_operacion || '%'
        OR codigo_comision ILIKE '%' || p_codigo_operacion || '%'
      )
      AND (
        UPPER(COALESCE(p_filtro_tiempo, 'TODOS')) = 'TODOS'
        OR (UPPER(p_filtro_tiempo) = 'MENOR_1_HORA' AND tiempo_atencion_segundos < 3600)
        OR (UPPER(p_filtro_tiempo) = 'ENTRE_1_Y_2_HORAS' AND tiempo_atencion_segundos >= 3600 AND tiempo_atencion_segundos < 7200)
        OR (UPPER(p_filtro_tiempo) = 'MAYOR_IGUAL_2_HORAS' AND tiempo_atencion_segundos >= 7200)
      )
  ), page_rows AS (
    SELECT jsonb_build_object(
      'id', id,
      'seguimiento_flujo', flujo,
      'seguimiento_pasos', pasos,
      'seguimiento_facturacion', facturacion,
      'seguimiento_derivo', derivo,
      'seguimiento_codigo_operacion', codigo_operacion,
      'seguimiento_codigo_devolucion', codigo_devolucion,
      'seguimiento_codigo_comision', codigo_comision,
      'dni_cliente', dni,
      'nombre_cliente', cliente,
      'nombre_comunidad', comunidad,
      'seguimiento_empresa_cuenta_empresa', empresa_cuenta_empresa,
      'seguimiento_empresa_cuenta_cuenta', empresa_cuenta_cuenta,
      'seguimiento_cuenta_cliente', cuenta_cliente,
      'seguimiento_monto', monto,
      'seguimiento_comision_importe', comision_importe,
      'seguimiento_comision_porcentaje', comision_porcentaje,
      'seguimiento_transferencia', transferencia,
      'seguimiento_monto_devolucion', monto_devolucion,
      'seguimiento_cuenta_comision_empresa', cuenta_comision_empresa,
      'seguimiento_cuenta_comision_cuenta', cuenta_comision_cuenta,
      'seguimiento_estado', estado,
      'fecha_registro', fecha_registro,
      'seguimiento_tiempo_atencion_segundos', tiempo_atencion_segundos
    ) AS payload
    FROM filtered
    ORDER BY fecha_registro DESC, id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100)
    OFFSET (GREATEST(COALESCE(p_page, 1), 1) - 1) * LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100)
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((SELECT jsonb_agg(payload) FROM page_rows), '[]'::jsonb),
    'total', COUNT(*)::integer,
    'total_paginas', CEIL(COUNT(*)::numeric / LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100))::integer,
    'tiempo_menor_una_hora', COUNT(*) FILTER (WHERE tiempo_atencion_segundos < 3600)::integer,
    'tiempo_entre_una_y_dos_horas', COUNT(*) FILTER (WHERE tiempo_atencion_segundos >= 3600 AND tiempo_atencion_segundos < 7200)::integer,
    'tiempo_mayor_igual_dos_horas', COUNT(*) FILTER (WHERE tiempo_atencion_segundos >= 7200)::integer,
    'total_pendientes', COUNT(*)::integer
  )
  FROM filtered;
$$;

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
    'f_get_tb_seguimiento_operaciones_paginado',
    'f_get_tb_seguimiento_efectivizacion_paginado',
    'f_get_tb_seguimiento_pago_deuda_paginado'
)
ORDER BY n.nspname, p.proname;
