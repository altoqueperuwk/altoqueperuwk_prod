-- ============================================================================
-- 13. DASHBOARD DE METRICAS BANCARIAS
-- ============================================================================
-- Dominio analitico de solo lectura para /reportes/metricas-bancarias.
-- No modifica las funciones operativas ya cerradas ni escribe tablas.
-- Todos los eventos se agrupan en America/Lima.

/*
Funcion: f_get_dashboard_metricas_bancarias_hechos
Objetivo:
  Construir el libro comun del dashboard. Los flujos se atribuyen a la fecha
  real del evento y los saldos/pendientes aparecen una sola vez en una fila
  CORTE por cuenta.
*/
CREATE OR REPLACE FUNCTION public.f_get_dashboard_metricas_bancarias_hechos(
  p_fecha_desde date,
  p_fecha_hasta date,
  p_rutas character varying[] DEFAULT NULL,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_familias character varying[] DEFAULT NULL,
  p_estados character varying[] DEFAULT NULL
)
RETURNS TABLE (
  fecha_evento date,
  tipo_evento character varying,
  ruta character varying,
  id_empresa bigint,
  empresa character varying,
  id_empresa_cuenta_bancaria bigint,
  id_banco bigint,
  cuenta character varying,
  familia character varying,
  caja_recaudacion numeric,
  ingresos_movimientos numeric,
  salidas numeric,
  gastos_operacionales numeric,
  ganancias numeric,
  operaciones_registradas bigint,
  operaciones_pagadas bigint,
  operaciones_pendientes bigint,
  pendiente_transferencia numeric,
  saldo_banco numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH parametros AS (
  SELECT
    p_fecha_desde::timestamp AT TIME ZONE 'America/Lima' AS desde_ts,
    (p_fecha_hasta + 1)::timestamp AT TIME ZONE 'America/Lima' AS hasta_ts,
    (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date AS hoy
  WHERE p_fecha_desde IS NOT NULL
    AND p_fecha_hasta IS NOT NULL
    AND p_fecha_desde <= p_fecha_hasta
    AND p_fecha_hasta - p_fecha_desde <= 730
),
cuentas AS (
  SELECT DISTINCT
    LOWER(BTRIM(rc.ruta))::character varying AS ruta,
    rc.id_empresa,
    e.nombre::character varying AS empresa,
    rc.id_empresa_cuenta_bancaria,
    ecb.id_banco,
    b.nombre::character varying AS cuenta,
    c.id AS id_caja
  FROM public.tb_ruta_operacion_caja rc
  JOIN public.tb_empresa e ON e.id = rc.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb
    ON ecb.id = rc.id_empresa_cuenta_bancaria
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  LEFT JOIN public.tb_caja_operativa c
    ON c.id_empresa = rc.id_empresa
   AND c.id_empresa_cuenta_bancaria = rc.id_empresa_cuenta_bancaria
  WHERE rc.id_estado = 1
    AND (p_id_empresa IS NULL OR rc.id_empresa = p_id_empresa)
    AND (p_id_empresa_cuenta_bancaria IS NULL OR rc.id_empresa_cuenta_bancaria = p_id_empresa_cuenta_bancaria)
    AND (
      p_rutas IS NULL OR COALESCE(cardinality(p_rutas), 0) = 0
      OR LOWER(BTRIM(rc.ruta)) IN (
        SELECT LOWER(BTRIM(value)) FROM unnest(p_rutas) AS value
      )
    )
),
operaciones_base AS (
  SELECT
    c.ruta, c.id_empresa, c.empresa, c.id_empresa_cuenta_bancaria,
    c.id_banco, c.cuenta, op.*,
    COALESCE(op.fecha_deposito_cliente, op.fecha_registro) AS fecha_operacion,
    CASE
      WHEN UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) = 'DIRECTO_CAJA' THEN 'DIRECTO'
      WHEN UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) = 'PAGO DEUDA' THEN 'PAGO DEUDA'
      WHEN UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) = 'POS' THEN 'POS'
      WHEN UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) IN ('LINK PAGO', 'LINKPAGO') THEN 'LINK PAGO'
      ELSE 'EFECTIVIZACION'
    END::character varying AS familia_dashboard
  FROM cuentas c
  JOIN public.tb_operacion_proceso op
    ON op.id_empresa_ingreso = c.id_empresa
   AND op.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria
   AND (
     op.ruta_origen IS NULL OR LOWER(BTRIM(op.ruta_origen)) = c.ruta
     OR (c.ruta = 'safetypay' AND LOWER(BTRIM(op.ruta_origen)) = 'interbank')
   )
  CROSS JOIN parametros p
  WHERE UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
    AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) NOT IN ('RETORNO', 'RETORNO_DIRECTO')
    AND COALESCE(op.fecha_deposito_cliente, op.fecha_registro) >= p.desde_ts
    AND COALESCE(op.fecha_deposito_cliente, op.fecha_registro) < p.hasta_ts
),
operaciones AS (
  SELECT o.*
  FROM operaciones_base o
  WHERE (
      p_familias IS NULL OR COALESCE(cardinality(p_familias), 0) = 0
      OR o.familia_dashboard IN (
        SELECT UPPER(REPLACE(BTRIM(value), '-', ' ')) FROM unnest(p_familias) AS value
      )
    )
    AND (
      p_estados IS NULL OR COALESCE(cardinality(p_estados), 0) = 0
      OR UPPER(BTRIM(COALESCE(o.nombre_estado, ''))) IN (
        SELECT UPPER(BTRIM(value)) FROM unnest(p_estados) AS value
      )
    )
),
hechos_ingreso AS (
  SELECT
    (o.fecha_operacion AT TIME ZONE 'America/Lima')::date,
    'INGRESO_OPERACION'::character varying,
    o.ruta, o.id_empresa, o.empresa, o.id_empresa_cuenta_bancaria,
    o.id_banco, o.cuenta, o.familia_dashboard,
    CASE
      WHEN o.familia_dashboard <> 'DIRECTO'
       AND NOT COALESCE(o.flag_retenido, false)
       AND NOT COALESCE(o.flag_fuera_horario, false)
       AND UPPER(BTRIM(COALESCE(o.nombre_estado, ''))) IN ('PENDIENTE', 'PAGADO')
      THEN COALESCE(o.monto_deposito_cliente, 0) ELSE 0
    END::numeric,
    CASE
      WHEN o.familia_dashboard = 'DIRECTO'
       AND UPPER(BTRIM(COALESCE(o.nombre_estado, ''))) = 'PAGADO'
      THEN COALESCE(o.monto_deposito_cliente, 0) ELSE 0
    END::numeric,
    0::numeric,
    CASE
      WHEN o.familia_dashboard <> 'DIRECTO'
       AND NOT COALESCE(o.flag_retenido, false)
       AND NOT COALESCE(o.flag_fuera_horario, false)
       AND UPPER(BTRIM(COALESCE(o.nombre_estado, ''))) IN ('PENDIENTE', 'PAGADO')
      THEN COALESCE(o.resultado_comision_banco_ingreso, 0) ELSE 0
    END::numeric,
    CASE
      WHEN o.familia_dashboard = 'DIRECTO'
        OR COALESCE(o.flag_retenido, false)
        OR COALESCE(o.flag_fuera_horario, false) THEN 0
      WHEN UPPER(BTRIM(COALESCE(o.nombre_estado, ''))) IN ('PENDIENTE', 'PAGADO')
      THEN COALESCE(o.monto_deposito_cliente, 0) - COALESCE(o.monto_transferencia_cliente, 0)
        - COALESCE(o.resultado_comision_banco_ingreso, 0) - COALESCE(o.resultado_comision_banco_salida, 0)
      ELSE 0
    END::numeric,
    1::bigint,
    0::bigint,
    0::bigint, 0::numeric, 0::numeric
  FROM operaciones o
),
pagos_base AS (
  SELECT
    c.ruta, c.id_empresa, c.empresa, c.id_empresa_cuenta_bancaria,
    c.id_banco, c.cuenta, op.fecha_pagado, op.nombre_estado,
    CASE
      WHEN UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) = 'DIRECTO_CAJA' THEN 'DIRECTO'
      WHEN UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) = 'PAGO DEUDA' THEN 'PAGO DEUDA'
      WHEN UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) = 'POS' THEN 'POS'
      WHEN UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) IN ('LINK PAGO', 'LINKPAGO') THEN 'LINK PAGO'
      ELSE 'EFECTIVIZACION'
    END::character varying AS familia_dashboard
  FROM cuentas c
  JOIN public.tb_operacion_proceso op
    ON op.id_empresa_ingreso = c.id_empresa
   AND op.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria
   AND (
     op.ruta_origen IS NULL OR LOWER(BTRIM(op.ruta_origen)) = c.ruta
     OR (c.ruta = 'safetypay' AND LOWER(BTRIM(op.ruta_origen)) = 'interbank')
   )
  CROSS JOIN parametros p
  WHERE UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
    AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) NOT IN ('RETORNO', 'RETORNO_DIRECTO')
    AND op.fecha_pagado >= p.desde_ts AND op.fecha_pagado < p.hasta_ts
),
hechos_pago AS (
  SELECT
    (pb.fecha_pagado AT TIME ZONE 'America/Lima')::date,
    'PAGO_OPERACION'::character varying,
    pb.ruta, pb.id_empresa, pb.empresa, pb.id_empresa_cuenta_bancaria,
    pb.id_banco, pb.cuenta, pb.familia_dashboard,
    0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric,
    0::bigint, 1::bigint, 0::bigint, 0::numeric, 0::numeric
  FROM pagos_base pb
  WHERE (
      p_familias IS NULL OR COALESCE(cardinality(p_familias), 0) = 0
      OR pb.familia_dashboard IN (
        SELECT UPPER(REPLACE(BTRIM(value), '-', ' ')) FROM unnest(p_familias) AS value
      )
    )
    AND (
      p_estados IS NULL OR COALESCE(cardinality(p_estados), 0) = 0
      OR 'PAGADO' IN (SELECT UPPER(BTRIM(value)) FROM unnest(p_estados) AS value)
    )
),
movimientos_pago_deuda AS (
  SELECT
    oc.id_operacion_proceso,
    MIN(oc.fecha_registro) AS fecha_movimiento,
    SUM(COALESCE(oc.monto_salida, 0))::numeric AS monto_salida
  FROM public.tb_operacion_caja oc
  WHERE oc.id_operacion_proceso IS NOT NULL
    AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) = 'PAGO_DEUDA'
    AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'SALIDA'
    AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) <> 'ELIMINADO'
  GROUP BY oc.id_operacion_proceso
),
salidas_base AS (
  SELECT
    c.ruta, c.id_empresa, c.empresa, c.id_empresa_cuenta_bancaria,
    c.id_banco, c.cuenta, op.*,
    CASE
      WHEN UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) = 'PAGO DEUDA'
       AND mov.fecha_movimiento IS NOT NULL
      THEN mov.fecha_movimiento
      ELSE op.fecha_pagado
    END AS fecha_operacion,
    COALESCE(mov.monto_salida, op.monto_transferencia_cliente, 0)::numeric AS monto_salida_real,
    CASE
      WHEN UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) = 'PAGO DEUDA' THEN 'PAGO DEUDA'
      WHEN UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) = 'POS' THEN 'POS'
      WHEN UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) IN ('LINK PAGO', 'LINKPAGO') THEN 'LINK PAGO'
      ELSE 'EFECTIVIZACION'
    END::character varying AS familia_dashboard
  FROM public.tb_operacion_proceso op
  LEFT JOIN movimientos_pago_deuda mov ON mov.id_operacion_proceso = op.id
  JOIN cuentas c ON (
    (
      c.ruta = 'safetypay'
      AND op.id_empresa_ingreso = c.id_empresa
      AND op.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria
    )
    OR (
      c.ruta <> 'safetypay'
      AND op.id_empresa_salida = c.id_empresa
      AND op.id_empresa_cuenta_salida = c.id_empresa_cuenta_bancaria
      AND NOT EXISTS (
        SELECT 1
        FROM public.tb_ruta_operacion_caja sx
        WHERE LOWER(BTRIM(sx.ruta)) = 'safetypay'
          AND sx.id_estado = 1
          AND sx.id_empresa = op.id_empresa_ingreso
          AND sx.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_ingreso
      )
    )
  )
  CROSS JOIN parametros p
  WHERE UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
    AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) NOT IN ('DIRECTO_CAJA', 'RETORNO', 'RETORNO_DIRECTO')
    AND (
      UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
      OR (UPPER(BTRIM(COALESCE(op.tipo_servicio, ''))) = 'PAGO DEUDA'
          AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PROCESADO'
          AND mov.fecha_movimiento IS NOT NULL)
    )
    AND CASE
      WHEN UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) = 'PAGO DEUDA'
       AND mov.fecha_movimiento IS NOT NULL
      THEN mov.fecha_movimiento
      ELSE op.fecha_pagado
    END >= p.desde_ts
    AND CASE
      WHEN UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) = 'PAGO DEUDA'
       AND mov.fecha_movimiento IS NOT NULL
      THEN mov.fecha_movimiento
      ELSE op.fecha_pagado
    END < p.hasta_ts
),
salidas_filtradas AS (
  SELECT s.* FROM salidas_base s
  WHERE (
      p_familias IS NULL OR COALESCE(cardinality(p_familias), 0) = 0
      OR s.familia_dashboard IN (
        SELECT UPPER(REPLACE(BTRIM(value), '-', ' ')) FROM unnest(p_familias) AS value
      )
    )
    AND (
      p_estados IS NULL OR COALESCE(cardinality(p_estados), 0) = 0
      OR UPPER(BTRIM(COALESCE(s.nombre_estado, ''))) IN (
        SELECT UPPER(BTRIM(value)) FROM unnest(p_estados) AS value
      )
    )
),
hechos_salida AS (
  SELECT
    (s.fecha_operacion AT TIME ZONE 'America/Lima')::date,
    'SALIDA_OPERACION'::character varying,
    s.ruta, s.id_empresa, s.empresa, s.id_empresa_cuenta_bancaria,
    s.id_banco, s.cuenta, s.familia_dashboard,
    0::numeric, 0::numeric, s.monto_salida_real,
    COALESCE(s.resultado_comision_banco_salida, 0)::numeric,
    0::numeric, 0::bigint, 0::bigint, 0::bigint, 0::numeric, 0::numeric
  FROM salidas_filtradas s
),
hechos_movimientos AS (
  SELECT
    (oc.fecha_registro AT TIME ZONE 'America/Lima')::date,
    'MOVIMIENTO'::character varying,
    c.ruta, c.id_empresa, c.empresa, c.id_empresa_cuenta_bancaria,
    c.id_banco, c.cuenta, 'MOVIMIENTOS'::character varying,
    0::numeric,
    CASE WHEN UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO' THEN COALESCE(oc.monto_ingreso, 0) ELSE 0 END::numeric,
    CASE WHEN UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'SALIDA' THEN COALESCE(oc.monto_salida, 0) ELSE 0 END::numeric,
    COALESCE(oc.monto_gasto, 0)::numeric,
    COALESCE(oc.monto_ganancia, 0)::numeric,
    0::bigint, 0::bigint, 0::bigint, 0::numeric, 0::numeric
  FROM cuentas c
  JOIN public.tb_operacion_caja oc ON oc.id_caja = c.id_caja
  CROSS JOIN parametros p
  WHERE oc.id_operacion_proceso IS NULL
    AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) = 'OTROS'
    AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) <> 'ELIMINADO'
    AND oc.fecha_registro >= p.desde_ts AND oc.fecha_registro < p.hasta_ts
    AND (
      p_familias IS NULL OR COALESCE(cardinality(p_familias), 0) = 0
      OR 'MOVIMIENTOS' IN (
        SELECT UPPER(REPLACE(BTRIM(value), '-', ' ')) FROM unnest(p_familias) AS value
      )
    )
    AND (
      p_estados IS NULL OR COALESCE(cardinality(p_estados), 0) = 0
      OR UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) IN (
        SELECT UPPER(BTRIM(value)) FROM unnest(p_estados) AS value
      )
    )
),
ultimo_cierre AS (
  SELECT c.ruta, c.id_empresa, c.id_empresa_cuenta_bancaria,
         cc.saldo_inicial, cc.total_recaudado, cc.ingresos, cc.salida,
         cc.saldo_actual, cc.fecha_cierre, cc.kpi_snapshot
  FROM cuentas c
  LEFT JOIN LATERAL (
    SELECT cierre.* FROM public.tb_caja_operativa_cierre cierre
    WHERE cierre.id_empresa = c.id_empresa
      AND cierre.id_empresa_cuenta_bancaria = c.id_empresa_cuenta_bancaria
      AND (cierre.fecha_cierre AT TIME ZONE 'America/Lima')::date <= p_fecha_hasta
    ORDER BY cierre.fecha_cierre DESC, cierre.id DESC LIMIT 1
  ) cc ON true
),
cortes AS (
  SELECT
    p_fecha_hasta, 'CORTE'::character varying,
    c.ruta, c.id_empresa, c.empresa, c.id_empresa_cuenta_bancaria,
    c.id_banco, c.cuenta, 'TODOS'::character varying,
    0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric,
    0::bigint, 0::bigint,
    COALESCE(pendientes_op.cantidad, 0)::bigint,
    CASE
      WHEN p_fecha_hasta < p.hoy
       AND (uc.fecha_cierre AT TIME ZONE 'America/Lima')::date = p_fecha_hasta
       AND (p_familias IS NULL OR COALESCE(cardinality(p_familias), 0) = 0)
       AND (p_estados IS NULL OR COALESCE(cardinality(p_estados), 0) = 0)
      THEN COALESCE(
        NULLIF(uc.kpi_snapshot ->> 'pendiente_transferencia', '')::numeric,
        pendiente_transfer.monto,
        0
      )
      ELSE COALESCE(pendiente_transfer.monto, 0)
    END::numeric,
    CASE WHEN p_fecha_hasta >= p.hoy THEN COALESCE(caja.saldo_actual, 0)
         ELSE COALESCE(uc.saldo_actual, 0) END::numeric
  FROM cuentas c
  CROSS JOIN parametros p
  LEFT JOIN public.tb_caja_operativa caja ON caja.id = c.id_caja
  LEFT JOIN ultimo_cierre uc
    ON uc.ruta = c.ruta AND uc.id_empresa = c.id_empresa
   AND uc.id_empresa_cuenta_bancaria = c.id_empresa_cuenta_bancaria
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(COALESCE(op.monto_transferencia_cliente, 0)), 0)::numeric AS monto
    FROM public.tb_operacion_proceso op
    WHERE UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
      AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) NOT IN ('DIRECTO_CAJA', 'RETORNO', 'RETORNO_DIRECTO')
      AND COALESCE(op.fecha_deposito_cliente, op.fecha_registro) < p.hasta_ts
      AND (
        (op.fecha_pagado IS NOT NULL AND op.fecha_pagado >= p.hasta_ts)
        OR (
          op.fecha_pagado IS NULL
          AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) NOT IN ('PAGADO', 'PROCESADO', 'DEVUELTO', 'RECHAZADO')
        )
      )
      AND COALESCE(op.monto_transferencia_cliente, 0) > 0
      AND (
        (c.ruta = 'safetypay' AND op.id_empresa_ingreso = c.id_empresa AND op.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria)
        OR (
          c.ruta <> 'safetypay'
          AND op.id_empresa_salida = c.id_empresa
          AND op.id_empresa_cuenta_salida = c.id_empresa_cuenta_bancaria
          AND NOT EXISTS (
            SELECT 1
            FROM public.tb_ruta_operacion_caja sx
            WHERE LOWER(BTRIM(sx.ruta)) = 'safetypay'
              AND sx.id_estado = 1
              AND sx.id_empresa = op.id_empresa_ingreso
              AND sx.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_ingreso
          )
        )
      )
      AND (
        p_familias IS NULL OR COALESCE(cardinality(p_familias), 0) = 0
        OR CASE
          WHEN UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) = 'PAGO DEUDA' THEN 'PAGO DEUDA'
          WHEN UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) = 'POS' THEN 'POS'
          ELSE 'EFECTIVIZACION'
        END IN (SELECT UPPER(REPLACE(BTRIM(value), '-', ' ')) FROM unnest(p_familias) AS value)
      )
      AND (
        p_estados IS NULL OR COALESCE(cardinality(p_estados), 0) = 0
        OR UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) IN (
          SELECT UPPER(BTRIM(value)) FROM unnest(p_estados) AS value
        )
      )
  ) pendiente_transfer ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS cantidad
    FROM public.tb_operacion_proceso op
    WHERE UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
      AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) NOT IN ('DIRECTO_CAJA', 'RETORNO', 'RETORNO_DIRECTO')
      AND op.id_empresa_ingreso = c.id_empresa
      AND op.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria
      AND COALESCE(op.fecha_deposito_cliente, op.fecha_registro) < p.hasta_ts
      AND (
        (op.fecha_pagado IS NOT NULL AND op.fecha_pagado >= p.hasta_ts)
        OR (
          op.fecha_pagado IS NULL
          AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) NOT IN ('PAGADO', 'PROCESADO', 'DEVUELTO', 'RECHAZADO')
        )
      )
      AND (
        p_familias IS NULL OR COALESCE(cardinality(p_familias), 0) = 0
        OR CASE
          WHEN UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) = 'PAGO DEUDA' THEN 'PAGO DEUDA'
          WHEN UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) = 'POS' THEN 'POS'
          ELSE 'EFECTIVIZACION'
        END IN (SELECT UPPER(REPLACE(BTRIM(value), '-', ' ')) FROM unnest(p_familias) AS value)
      )
      AND (
        p_estados IS NULL OR COALESCE(cardinality(p_estados), 0) = 0
        OR UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) IN (
          SELECT UPPER(BTRIM(value)) FROM unnest(p_estados) AS value
        )
      )
  ) pendientes_op ON true
)
SELECT * FROM hechos_ingreso
UNION ALL SELECT * FROM hechos_pago
UNION ALL SELECT * FROM hechos_salida
UNION ALL SELECT * FROM hechos_movimientos
UNION ALL SELECT * FROM cortes;
$$;

/* Resumen y comparacion contra el periodo anterior equivalente. */
CREATE OR REPLACE FUNCTION public.f_get_dashboard_metricas_bancarias_resumen(
  p_fecha_desde date,
  p_fecha_hasta date,
  p_rutas character varying[] DEFAULT NULL,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_familias character varying[] DEFAULT NULL,
  p_estados character varying[] DEFAULT NULL,
  p_incluir_comparacion boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dias integer;
  v_anterior_desde date;
  v_anterior_hasta date;
  v_resultado jsonb;
BEGIN
  IF p_fecha_desde IS NULL OR p_fecha_hasta IS NULL OR p_fecha_desde > p_fecha_hasta THEN
    RAISE EXCEPTION 'El rango de fechas del dashboard no es valido.';
  END IF;
  IF p_fecha_hasta - p_fecha_desde > 730 THEN
    RAISE EXCEPTION 'El rango maximo permitido es de 731 dias.';
  END IF;

  v_dias := p_fecha_hasta - p_fecha_desde + 1;
  v_anterior_hasta := p_fecha_desde - 1;
  v_anterior_desde := v_anterior_hasta - (v_dias - 1);

  WITH actual AS (
    SELECT
      COALESCE(SUM(caja_recaudacion), 0)::numeric AS recaudacion,
      COALESCE(SUM(ingresos_movimientos), 0)::numeric AS ingresos,
      COALESCE(SUM(salidas), 0)::numeric AS salidas,
      COALESCE(SUM(gastos_operacionales), 0)::numeric AS gastos,
      COALESCE(SUM(ganancias), 0)::numeric AS ganancias,
      COALESCE(SUM(operaciones_registradas), 0)::bigint AS operaciones,
      COALESCE(SUM(operaciones_pagadas), 0)::bigint AS pagadas,
      COALESCE(SUM(operaciones_pendientes), 0)::bigint AS pendientes,
      COALESCE(SUM(pendiente_transferencia), 0)::numeric AS pendiente_transferencia,
      COALESCE(SUM(saldo_banco), 0)::numeric AS saldo_banco
    FROM public.f_get_dashboard_metricas_bancarias_hechos(
      p_fecha_desde, p_fecha_hasta, p_rutas, p_id_empresa,
      p_id_empresa_cuenta_bancaria, p_familias, p_estados
    )
  ),
  anterior AS (
    SELECT
      COALESCE(SUM(caja_recaudacion), 0)::numeric AS recaudacion,
      COALESCE(SUM(ingresos_movimientos), 0)::numeric AS ingresos,
      COALESCE(SUM(salidas), 0)::numeric AS salidas,
      COALESCE(SUM(gastos_operacionales), 0)::numeric AS gastos,
      COALESCE(SUM(ganancias), 0)::numeric AS ganancias,
      COALESCE(SUM(operaciones_registradas), 0)::bigint AS operaciones,
      COALESCE(SUM(operaciones_pagadas), 0)::bigint AS pagadas,
      COALESCE(SUM(operaciones_pendientes), 0)::bigint AS pendientes,
      COALESCE(SUM(pendiente_transferencia), 0)::numeric AS pendiente_transferencia,
      COALESCE(SUM(saldo_banco), 0)::numeric AS saldo_banco
    FROM public.f_get_dashboard_metricas_bancarias_hechos(
      v_anterior_desde, v_anterior_hasta, p_rutas, p_id_empresa,
      p_id_empresa_cuenta_bancaria, p_familias, p_estados
    )
    WHERE p_incluir_comparacion
  ),
  safetypay_grupos AS (
    SELECT
      COALESCE(NULLIF(BTRIM(op.nombre_empresa_salida), ''), '-') AS empresa,
      COALESCE(NULLIF(BTRIM(op.nombre_banco_empresa_cuenta_salida), ''), '-') AS cuenta,
      COUNT(*)::bigint AS operaciones,
      SUM(COALESCE(op.monto_transferencia_cliente, 0))::numeric AS transferencia
    FROM public.tb_operacion_proceso op
    JOIN public.tb_ruta_operacion_caja rc
      ON rc.id_empresa = op.id_empresa_ingreso
     AND rc.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_ingreso
     AND LOWER(BTRIM(rc.ruta)) = 'safetypay' AND rc.id_estado = 1
    WHERE UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
      AND COALESCE(op.flag_derivado, false)
      AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) NOT IN (
        'DIRECTO_CAJA', 'RETORNO', 'RETORNO_DIRECTO'
      )
      AND COALESCE(op.monto_transferencia_cliente, 0) > 0
      AND (op.fecha_pagado AT TIME ZONE 'America/Lima')::date BETWEEN p_fecha_desde AND p_fecha_hasta
      AND (p_id_empresa IS NULL OR rc.id_empresa = p_id_empresa)
      AND (p_id_empresa_cuenta_bancaria IS NULL OR rc.id_empresa_cuenta_bancaria = p_id_empresa_cuenta_bancaria)
      AND (
        p_rutas IS NULL OR COALESCE(cardinality(p_rutas), 0) = 0
        OR 'safetypay' IN (SELECT LOWER(BTRIM(value)) FROM unnest(p_rutas) AS value)
      )
      AND (
        p_familias IS NULL OR COALESCE(cardinality(p_familias), 0) = 0
        OR 'EFECTIVIZACION' IN (
          SELECT UPPER(REPLACE(BTRIM(value), '-', ' ')) FROM unnest(p_familias) AS value
        )
      )
      AND (
        p_estados IS NULL OR COALESCE(cardinality(p_estados), 0) = 0
        OR 'PAGADO' IN (SELECT UPPER(BTRIM(value)) FROM unnest(p_estados) AS value)
      )
    GROUP BY 1, 2
  ),
  safetypay AS (
    SELECT COALESCE(SUM(operaciones), 0)::bigint AS total,
      COALESCE(jsonb_agg(jsonb_build_object(
        'empresa', empresa, 'cuenta', cuenta, 'operaciones', operaciones,
        'transferencia', transferencia
      ) ORDER BY transferencia DESC) FILTER (WHERE empresa IS NOT NULL), '[]'::jsonb) AS empresas
    FROM safetypay_grupos
  )
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_fecha_desde, 'hasta', p_fecha_hasta),
    'comparacion_periodo', CASE WHEN p_incluir_comparacion THEN
      jsonb_build_object('desde', v_anterior_desde, 'hasta', v_anterior_hasta) ELSE NULL END,
    'actual', jsonb_build_object(
      'caja_recaudacion', a.recaudacion, 'ingresos_movimientos', a.ingresos,
      'salidas', a.salidas, 'gastos_operacionales', a.gastos,
      'ganancias', a.ganancias,
      'margen_ganancia', CASE WHEN a.recaudacion <> 0
        THEN ROUND(a.ganancias / a.recaudacion * 100, 2) ELSE 0 END,
      'saldo_banco', a.saldo_banco, 'pendiente_transferencia', a.pendiente_transferencia,
      'operaciones_registradas', a.operaciones, 'operaciones_pagadas', a.pagadas,
      'operaciones_pendientes', a.pendientes,
      'tasa_pago', CASE WHEN a.pagadas + a.pendientes > 0
        THEN ROUND(a.pagadas::numeric / (a.pagadas + a.pendientes) * 100, 2) ELSE 0 END,
      'ticket_promedio', CASE WHEN a.operaciones > 0 THEN ROUND(a.recaudacion / a.operaciones, 2) ELSE 0 END
    ),
    'anterior', CASE WHEN p_incluir_comparacion THEN jsonb_build_object(
      'caja_recaudacion', ant.recaudacion, 'ingresos_movimientos', ant.ingresos,
      'salidas', ant.salidas, 'gastos_operacionales', ant.gastos,
      'ganancias', ant.ganancias,
      'margen_ganancia', CASE WHEN ant.recaudacion <> 0
        THEN ROUND(ant.ganancias / ant.recaudacion * 100, 2) ELSE 0 END,
      'saldo_banco', ant.saldo_banco, 'pendiente_transferencia', ant.pendiente_transferencia,
      'operaciones_registradas', ant.operaciones, 'operaciones_pagadas', ant.pagadas,
      'operaciones_pendientes', ant.pendientes
    ) ELSE NULL END,
    'variacion_porcentual', CASE WHEN p_incluir_comparacion THEN jsonb_build_object(
      'caja_recaudacion', CASE WHEN ant.recaudacion <> 0 THEN ROUND((a.recaudacion - ant.recaudacion) / ABS(ant.recaudacion) * 100, 2) END,
      'salidas', CASE WHEN ant.salidas <> 0 THEN ROUND((a.salidas - ant.salidas) / ABS(ant.salidas) * 100, 2) END,
      'gastos_operacionales', CASE WHEN ant.gastos <> 0 THEN ROUND((a.gastos - ant.gastos) / ABS(ant.gastos) * 100, 2) END,
      'ganancias', CASE WHEN ant.ganancias <> 0 THEN ROUND((a.ganancias - ant.ganancias) / ABS(ant.ganancias) * 100, 2) END,
      'operaciones_registradas', CASE WHEN ant.operaciones <> 0 THEN ROUND((a.operaciones - ant.operaciones)::numeric / ABS(ant.operaciones)::numeric * 100, 2) END,
      'operaciones_pagadas', CASE WHEN ant.pagadas <> 0 THEN ROUND((a.pagadas - ant.pagadas)::numeric / ABS(ant.pagadas)::numeric * 100, 2) END
    ) ELSE NULL END,
    'safetypay', jsonb_build_object('total_transferencia', sp.total, 'empresas_derivadas', sp.empresas)
  ) INTO v_resultado
  FROM actual a CROSS JOIN anterior ant CROSS JOIN safetypay sp;

  RETURN COALESCE(v_resultado, '{}'::jsonb);
END;
$$;

/* Distribucion de operaciones por familia para el grafico del dashboard. */
CREATE OR REPLACE FUNCTION public.f_get_dashboard_metricas_bancarias_distribucion(
  p_fecha_desde date,
  p_fecha_hasta date,
  p_rutas character varying[] DEFAULT NULL,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_estados character varying[] DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT jsonb_build_object(
  'familia', h.familia,
  'operaciones', SUM(
    CASE WHEN h.tipo_evento = 'MOVIMIENTO' THEN 1 ELSE h.operaciones_registradas END
  )::bigint
)
FROM public.f_get_dashboard_metricas_bancarias_hechos(
  p_fecha_desde,
  p_fecha_hasta,
  p_rutas,
  p_id_empresa,
  p_id_empresa_cuenta_bancaria,
  NULL,
  p_estados
) h
WHERE h.tipo_evento IN ('INGRESO_OPERACION', 'MOVIMIENTO')
  AND h.familia IN ('EFECTIVIZACION', 'PAGO DEUDA', 'MOVIMIENTOS', 'DIRECTO')
GROUP BY h.familia
HAVING SUM(CASE WHEN h.tipo_evento = 'MOVIMIENTO' THEN 1 ELSE h.operaciones_registradas END) > 0
ORDER BY SUM(CASE WHEN h.tipo_evento = 'MOVIMIENTO' THEN 1 ELSE h.operaciones_registradas END) DESC, h.familia;
$$;

/* Serie temporal por DIA, SEMANA o MES. */
CREATE OR REPLACE FUNCTION public.f_get_dashboard_metricas_bancarias_serie(
  p_fecha_desde date,
  p_fecha_hasta date,
  p_granularidad character varying DEFAULT 'MES',
  p_rutas character varying[] DEFAULT NULL,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_familias character varying[] DEFAULT NULL,
  p_estados character varying[] DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_granularidad character varying := UPPER(BTRIM(COALESCE(p_granularidad, 'MES')));
BEGIN
  IF p_fecha_desde IS NULL OR p_fecha_hasta IS NULL OR p_fecha_desde > p_fecha_hasta THEN
    RAISE EXCEPTION 'El rango de fechas del dashboard no es valido.';
  END IF;
  IF p_fecha_hasta - p_fecha_desde > 730 THEN RAISE EXCEPTION 'El rango maximo permitido es de 731 dias.'; END IF;
  IF v_granularidad NOT IN ('DIA', 'SEMANA', 'MES') THEN
    RAISE EXCEPTION 'Granularidad no valida. Use DIA, SEMANA o MES.';
  END IF;

  RETURN QUERY
  WITH agregado AS (
    SELECT CASE v_granularidad
        WHEN 'DIA' THEN h.fecha_evento
        WHEN 'SEMANA' THEN DATE_TRUNC('week', h.fecha_evento::timestamp)::date
        ELSE DATE_TRUNC('month', h.fecha_evento::timestamp)::date END AS periodo,
      h.ruta,
      SUM(h.caja_recaudacion)::numeric AS recaudacion,
      SUM(h.ingresos_movimientos)::numeric AS ingresos,
      SUM(h.salidas)::numeric AS salidas,
      SUM(h.gastos_operacionales)::numeric AS gastos,
      SUM(h.ganancias)::numeric AS ganancias,
      SUM(h.operaciones_registradas)::bigint AS operaciones,
      SUM(h.operaciones_pagadas)::bigint AS pagadas
    FROM public.f_get_dashboard_metricas_bancarias_hechos(
      p_fecha_desde, p_fecha_hasta, p_rutas, p_id_empresa,
      p_id_empresa_cuenta_bancaria, p_familias, p_estados
    ) h
    WHERE h.tipo_evento <> 'CORTE'
    GROUP BY 1, h.ruta
  )
  SELECT jsonb_build_object(
    'periodo', periodo, 'granularidad', v_granularidad, 'ruta', ruta,
    'caja_recaudacion', recaudacion, 'ingresos_movimientos', ingresos,
    'salidas', salidas, 'gastos_operacionales', gastos, 'ganancias', ganancias,
    'margen_ganancia', CASE WHEN recaudacion <> 0
      THEN ROUND(ganancias / recaudacion * 100, 2) ELSE 0 END,
    'operaciones_registradas', operaciones, 'operaciones_pagadas', pagadas
  ) FROM agregado ORDER BY periodo, ruta;
END;
$$;

/* Consolidado por ruta, empresa y cuenta. */
CREATE OR REPLACE FUNCTION public.f_get_dashboard_metricas_bancarias_desglose(
  p_fecha_desde date,
  p_fecha_hasta date,
  p_rutas character varying[] DEFAULT NULL,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_familias character varying[] DEFAULT NULL,
  p_estados character varying[] DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_fecha_desde IS NULL OR p_fecha_hasta IS NULL OR p_fecha_desde > p_fecha_hasta THEN
    RAISE EXCEPTION 'El rango de fechas del dashboard no es valido.';
  END IF;
  IF p_fecha_hasta - p_fecha_desde > 730 THEN RAISE EXCEPTION 'El rango maximo permitido es de 731 dias.'; END IF;

  RETURN QUERY
  WITH agregado AS (
    SELECT h.ruta, h.id_empresa, h.empresa, h.id_empresa_cuenta_bancaria,
      h.id_banco, h.cuenta,
      SUM(h.caja_recaudacion)::numeric AS recaudacion,
      SUM(h.ingresos_movimientos)::numeric AS ingresos,
      SUM(h.salidas)::numeric AS salidas,
      SUM(h.gastos_operacionales)::numeric AS gastos,
      SUM(h.ganancias)::numeric AS ganancias,
      SUM(h.operaciones_registradas)::bigint AS operaciones,
      SUM(h.operaciones_pagadas)::bigint AS pagadas,
      SUM(h.operaciones_pendientes)::bigint AS pendientes,
      SUM(h.pendiente_transferencia)::numeric AS pendiente_transferencia,
      SUM(h.saldo_banco)::numeric AS saldo_banco
    FROM public.f_get_dashboard_metricas_bancarias_hechos(
      p_fecha_desde, p_fecha_hasta, p_rutas, p_id_empresa,
      p_id_empresa_cuenta_bancaria, p_familias, p_estados
    ) h
    GROUP BY h.ruta, h.id_empresa, h.empresa, h.id_empresa_cuenta_bancaria, h.id_banco, h.cuenta
  )
  SELECT jsonb_build_object(
    'ruta', ruta, 'id_empresa', id_empresa, 'empresa', empresa,
    'id_empresa_cuenta_bancaria', id_empresa_cuenta_bancaria,
    'id_banco', id_banco, 'cuenta', cuenta,
    'operaciones', operaciones, 'pagadas', pagadas, 'pendientes', pendientes,
    'tasa_pago', CASE WHEN pagadas + pendientes > 0
      THEN ROUND(pagadas::numeric / (pagadas + pendientes) * 100, 2) ELSE 0 END,
    'caja_recaudacion', recaudacion, 'ingresos_movimientos', ingresos,
    'salidas', salidas, 'gastos_operacionales', gastos, 'ganancias', ganancias,
    'margen_ganancia', CASE WHEN recaudacion <> 0
      THEN ROUND(ganancias / recaudacion * 100, 2) ELSE 0 END,
    'pendiente_transferencia', pendiente_transferencia, 'saldo_banco', saldo_banco,
    'ticket_promedio', CASE WHEN operaciones > 0 THEN ROUND(recaudacion / operaciones, 2) ELSE 0 END
  ) FROM agregado ORDER BY recaudacion DESC, ruta, empresa, cuenta;
END;
$$;

-- Ejemplos:
-- SELECT public.f_get_dashboard_metricas_bancarias_resumen(
--   DATE '2026-03-01', DATE '2026-08-31', ARRAY['bcp', 'bbva']
-- );
-- SELECT * FROM public.f_get_dashboard_metricas_bancarias_serie(
--   DATE '2026-03-01', DATE '2026-08-31', 'MES'
-- );
-- SELECT * FROM public.f_get_dashboard_metricas_bancarias_desglose(
--   DATE '2026-08-01', DATE '2026-08-31', ARRAY['safetypay']
-- );

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_get_dashboard_metricas_bancarias_hechos',
  'f_get_dashboard_metricas_bancarias_distribucion'
)
ORDER BY n.nspname, p.proname;
