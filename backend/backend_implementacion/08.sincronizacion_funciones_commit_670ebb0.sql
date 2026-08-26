-- Sincronizacion de funciones del commit 670ebb0
-- Generado desde el codigo fuente versionado en Git.
-- Ejecutar en una transaccion sobre Produccion.
BEGIN;

-- Elimina todas las sobrecargas publicas de las funciones incluidas.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT
            n.nspname AS schema_name,
            p.proname AS function_name,
            pg_get_function_identity_arguments(p.oid) AS function_arguments
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'f_apply_tb_operacion_caja_delta',
              'f_delete_tb_caja_operativa_cierre_ultimo_dia',
              'f_get_reporte_cierre',
              'f_get_tb_operacion_bandeja_unificada',
              'f_get_tb_operacion_saldo_actual_v2',
              'f_get_tb_pago_deuda_match_lote',
              'f_get_tb_ruta_operacion_ganancias_efectivizacion_v2',
              'f_get_tb_ruta_operacion_kpi_cierre_operaciones_v2',
              'f_get_tb_ruta_operacion_kpi_operaciones_v2',
              'f_patch_tb_caja_operativa_saldo_inicial',
              'f_patch_tb_operacion_proceso_devolver_derivacion',
              'f_patch_tb_operacion_proceso_directo_caja',
              'f_patch_tb_operacion_proceso_pagado',
              'f_patch_tb_operacion_proceso_pagado_lote',
              'f_patch_tb_operacion_proceso_reanudar',
              'f_patch_tb_operacion_proceso_reanudar_lote',
              'f_patch_tb_operacion_proceso_reanudar_post_cierre',
              'f_patch_tb_pago_deuda_salida',
              'f_post_tb_caja_operativa_cierre',
              'f_post_tb_caja_operativa_cierre_ruta',
              'f_post_tb_operacion_caja',
              'f_post_tb_operacion_caja_desde_proceso',
              'f_sync_tb_operacion_cierre_atribucion_v2'
          )
        ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
    LOOP
        EXECUTE format(
            'DROP FUNCTION IF EXISTS %I.%I(%s);',
            r.schema_name,
            r.function_name,
            r.function_arguments
        );
    END LOOP;
END $$;

-- Dependencia base: debe existir antes de las funciones SQL que la consultan.
-- f_get_tb_ruta_operacion_kpi_operaciones_v2
CREATE OR REPLACE FUNCTION public.f_get_tb_ruta_operacion_kpi_operaciones_v2(
  p_ruta character varying,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_id_caja bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  ruta character varying,
  caja_inicial numeric,
  caja_actual numeric,
  total_recaudado numeric,
  ingresos numeric,
  salidas numeric,
  gastos_operacionales numeric,
  ganancias numeric,
  ingresos_retenidos numeric,
  fuera_horario numeric,
  pendiente_depositar numeric,
  total_efectivizacion integer,
  total_pago_deuda integer,
  id_estado bigint,
  nombre_estado character varying,
  id_usuario bigint,
  nombre_usuario character varying,
  fecha_registro timestamp with time zone,
  caja_recaudacion numeric,
  pendiente_transferencia numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $$
WITH cajas AS (
  SELECT
    c.id AS id_caja,
    c.id_empresa,
    c.id_empresa_cuenta_bancaria,
    COALESCE(c.saldo_inicial, 0)::numeric AS saldo_inicial,
    COALESCE(c.saldo_actual, 0)::numeric AS saldo_actual,
    c.fecha_apertura,
    rc.ruta,
    c.id_estado,
    c.id_usuario,
    c.fecha_registro AS caja_fecha_registro
  FROM public.tb_ruta_operacion_caja rc
  JOIN public.tb_caja_operativa c
    ON c.id_empresa = rc.id_empresa
   AND c.id_empresa_cuenta_bancaria = rc.id_empresa_cuenta_bancaria
  WHERE rc.ruta = p_ruta
    AND rc.id_estado = 1
    AND c.id_estado = 1
    AND (p_id_empresa IS NULL OR c.id_empresa = p_id_empresa)
    AND (p_id_empresa_cuenta_bancaria IS NULL OR c.id_empresa_cuenta_bancaria = p_id_empresa_cuenta_bancaria)
    AND (p_id_caja IS NULL OR c.id = p_id_caja)
),
por_caja AS (
  SELECT
    c.*,
    COALESCE(a.ingresos, 0)::numeric AS ingresos,
    COALESCE(a.salidas, 0)::numeric AS salidas,
    COALESCE(a.gastos, 0)::numeric AS gastos,
    COALESCE(a.ganancias, 0)::numeric AS ganancias,
    COALESCE(a.recaudacion, 0)::numeric AS recaudacion,
    COALESCE(a.retenidos, 0)::numeric AS retenidos,
    COALESCE(a.pendiente_transferencia, 0)::numeric AS pendiente_transferencia,
    COALESCE(m.manual_ingresos, 0)::numeric AS manual_ingresos,
    COALESCE(m.manual_salidas, 0)::numeric AS manual_salidas,
    COALESCE(m.manual_gastos, 0)::numeric AS manual_gastos,
    COALESCE(a.total_efectivizacion, 0)::integer AS total_efectivizacion,
    COALESCE(a.total_pago_deuda, 0)::integer AS total_pago_deuda,
    COALESCE(a.directos, 0)::numeric AS directos
  FROM cajas c
  LEFT JOIN LATERAL (
    SELECT
      SUM(CASE
        WHEN op.id_caja_cierre_ingreso IS NULL
         AND op.id_caja_cierre IS NULL
         AND op.id_empresa_ingreso = c.id_empresa
         AND op.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria
          AND op.fecha_registro >= COALESCE(c.fecha_apertura, '-infinity'::timestamp with time zone)
          AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) <> 'DIRECTO_CAJA'
          AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) IN ('PENDIENTE', 'PAGADO')
        THEN COALESCE(op.monto_deposito_cliente, 0)
        ELSE 0
      END) AS recaudacion,
      SUM(CASE
        WHEN op.id_caja_cierre_ingreso IS NULL
         AND op.id_caja_cierre IS NULL
         AND op.id_empresa_ingreso = c.id_empresa
         AND op.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria
          AND op.fecha_registro >= COALESCE(c.fecha_apertura, '-infinity'::timestamp with time zone)
          AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) <> 'DIRECTO_CAJA'
          AND NOT (
            COALESCE(op.flag_retenido, false) = true
            AND (
              (op.id_empresa_ingreso = 5 AND op.id_empresa_cuenta_ingreso = 33 AND op.id_banco_empresa_cuenta_ingreso = 3)
              OR (op.id_empresa_ingreso = 7 AND op.id_empresa_cuenta_ingreso = 16 AND op.id_banco_empresa_cuenta_ingreso = 4)
              OR (op.id_empresa_ingreso = 8 AND op.id_empresa_cuenta_ingreso = 7 AND op.id_banco_empresa_cuenta_ingreso = 3)
              OR (op.id_empresa_ingreso = 5 AND op.id_empresa_cuenta_ingreso = 4 AND op.id_banco_empresa_cuenta_ingreso = 2)
              OR (op.id_empresa_ingreso = 6 AND op.id_empresa_cuenta_ingreso = 5 AND op.id_banco_empresa_cuenta_ingreso = 2)
            )
          )
         AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) IN ('PENDIENTE', 'PAGADO')
        THEN COALESCE(op.monto_deposito_cliente, 0)
        ELSE 0
        END) AS ingresos,
      SUM(CASE
        WHEN UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) = 'DIRECTO_CAJA'
         AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
         AND op.id_caja_cierre_ingreso IS NULL
         AND op.id_caja_cierre_salida IS NULL
         AND op.id_caja_cierre IS NULL
         AND op.id_empresa_ingreso = c.id_empresa
         AND op.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria
         AND COALESCE(op.flag_retenido, false) = false
         AND op.fecha_registro >= COALESCE(c.fecha_apertura, '-infinity'::timestamp with time zone)
        THEN COALESCE(op.monto_deposito_cliente, 0)
        ELSE 0
      END) AS directos,
      SUM(CASE
        WHEN op.id_caja_cierre_salida IS NULL
         AND op.id_caja_cierre IS NULL
         AND op.id_empresa_salida = c.id_empresa
         AND op.id_empresa_cuenta_salida = c.id_empresa_cuenta_bancaria
         AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) NOT IN ('DIRECTO_CAJA', 'RETORNO', 'RETORNO_DIRECTO')
         AND (
           (
             UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
             AND op.fecha_pagado IS NOT NULL
             AND op.fecha_pagado >= COALESCE(c.fecha_apertura, '-infinity'::timestamp with time zone)
           )
           OR (
             UPPER(BTRIM(COALESCE(op.tipo_servicio, ''))) = 'PAGO DEUDA'
             AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PROCESADO'
             AND EXISTS (
               SELECT 1
               FROM public.tb_operacion_caja oc_salida
               WHERE oc_salida.id_operacion_proceso = op.id
                 AND oc_salida.id_caja = c.id_caja
                 AND oc_salida.id_caja_cierre IS NULL
                 AND UPPER(BTRIM(COALESCE(oc_salida.tipo_movimiento, ''))) = 'SALIDA'
             )
           )
         )
         THEN COALESCE(op.monto_transferencia_cliente, 0)
        ELSE 0
      END) AS salidas,
      SUM(CASE
        WHEN op.id_caja_cierre_ingreso IS NULL
         AND op.id_caja_cierre IS NULL
         AND op.id_empresa_ingreso = c.id_empresa
         AND op.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria
          AND op.fecha_registro >= COALESCE(c.fecha_apertura, '-infinity'::timestamp with time zone)
          AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) <> 'DIRECTO_CAJA'
          AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) IN ('PENDIENTE', 'PAGADO')
        THEN COALESCE(op.resultado_comision_banco_ingreso, 0)
        ELSE 0
      END)
      + SUM(CASE
        WHEN op.id_caja_cierre_salida IS NULL
         AND op.id_caja_cierre IS NULL
         AND op.id_empresa_salida = c.id_empresa
         AND op.id_empresa_cuenta_salida = c.id_empresa_cuenta_bancaria
         AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) NOT IN ('DIRECTO_CAJA', 'RETORNO', 'RETORNO_DIRECTO')
         AND (
           (
             UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
             AND op.fecha_pagado IS NOT NULL
             AND op.fecha_pagado >= COALESCE(c.fecha_apertura, '-infinity'::timestamp with time zone)
           )
           OR (
             UPPER(BTRIM(COALESCE(op.tipo_servicio, ''))) = 'PAGO DEUDA'
             AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PROCESADO'
             AND EXISTS (
               SELECT 1
               FROM public.tb_operacion_caja oc_salida
               WHERE oc_salida.id_operacion_proceso = op.id
                 AND oc_salida.id_caja = c.id_caja
                 AND oc_salida.id_caja_cierre IS NULL
                 AND UPPER(BTRIM(COALESCE(oc_salida.tipo_movimiento, ''))) = 'SALIDA'
             )
           )
         )
         THEN COALESCE(op.resultado_comision_banco_salida, 0)
        ELSE 0
      END) AS gastos,
      SUM(CASE
        WHEN op.id_caja_cierre_ingreso IS NULL
         AND op.id_caja_cierre IS NULL
         AND op.id_empresa_ingreso = c.id_empresa
         AND op.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria
         AND op.fecha_registro >= COALESCE(c.fecha_apertura, '-infinity'::timestamp with time zone)
         AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) NOT IN ('DIRECTO_CAJA', 'RETORNO', 'RETORNO_DIRECTO')
         AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) IN ('PENDIENTE', 'PAGADO')
        THEN COALESCE(op.monto_deposito_cliente, 0)
           - COALESCE(op.monto_transferencia_cliente, 0)
           - COALESCE(op.resultado_comision_banco_ingreso, 0)
           - COALESCE(op.resultado_comision_banco_salida, 0)
        ELSE 0
      END) AS ganancias,
      SUM(CASE
        WHEN COALESCE(op.flag_retenido, false) = true
         AND op.id_empresa_ingreso = c.id_empresa
         AND op.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria
         AND (
           (op.id_empresa_ingreso = 5 AND op.id_empresa_cuenta_ingreso = 33 AND op.id_banco_empresa_cuenta_ingreso = 3)
           OR (op.id_empresa_ingreso = 7 AND op.id_empresa_cuenta_ingreso = 16 AND op.id_banco_empresa_cuenta_ingreso = 4)
           OR (op.id_empresa_ingreso = 8 AND op.id_empresa_cuenta_ingreso = 7 AND op.id_banco_empresa_cuenta_ingreso = 3)
           OR (op.id_empresa_ingreso = 5 AND op.id_empresa_cuenta_ingreso = 4 AND op.id_banco_empresa_cuenta_ingreso = 2)
           OR (op.id_empresa_ingreso = 6 AND op.id_empresa_cuenta_ingreso = 5 AND op.id_banco_empresa_cuenta_ingreso = 2)
         )
          AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) <> 'DIRECTO_CAJA'
         AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) NOT IN ('ELIMINADO', 'PAGADO', 'DEVUELTO', 'RECHAZADO')
        THEN COALESCE(op.monto_deposito_cliente, 0)
        ELSE 0
      END) AS retenidos,
      SUM(CASE
        WHEN UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) NOT IN ('ELIMINADO', 'PAGADO', 'PROCESADO', 'DEVUELTO', 'RECHAZADO')
         AND op.id_empresa_salida = c.id_empresa
         AND op.id_empresa_cuenta_salida = c.id_empresa_cuenta_bancaria
         AND COALESCE(op.monto_transferencia_cliente, 0) > 0
        THEN COALESCE(op.monto_transferencia_cliente, 0)
        ELSE 0
      END) AS pendiente_transferencia,
      COUNT(*) FILTER (
        WHERE UPPER(BTRIM(COALESCE(op.tipo_servicio, ''))) IN ('EFECTIVIZACION', 'POS')
           OR COALESCE(op.flag_derivado, false) = true
      ) AS total_efectivizacion,
      COUNT(*) FILTER (
        WHERE UPPER(BTRIM(COALESCE(op.tipo_servicio, ''))) = 'PAGO DEUDA'
      ) AS total_pago_deuda
    FROM public.tb_operacion_proceso op
    WHERE UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
      AND (
        (op.id_empresa_ingreso = c.id_empresa AND op.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria)
        OR
        (op.id_empresa_salida = c.id_empresa AND op.id_empresa_cuenta_salida = c.id_empresa_cuenta_bancaria)
      )
      AND (
        op.ruta_origen = c.ruta
        OR op.ruta_destino = c.ruta
        OR (c.ruta = 'safetypay' AND op.ruta_origen = 'interbank')
        OR (c.ruta = 'safetypay' AND op.ruta_destino = 'interbank')
      )
  ) a ON true
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(CASE
        WHEN UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
        THEN COALESCE(oc.monto_ingreso, 0)
        ELSE 0
      END), 0) AS manual_ingresos,
      COALESCE(SUM(CASE
        WHEN UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'SALIDA'
        THEN COALESCE(oc.monto_salida, 0)
        ELSE 0
      END), 0) AS manual_salidas,
      COALESCE(SUM(COALESCE(oc.monto_gasto, 0)), 0) AS manual_gastos
    FROM public.tb_operacion_caja oc
    WHERE oc.id_caja = c.id_caja
      AND oc.id_caja_cierre IS NULL
      AND oc.id_operacion_proceso IS NULL
      AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) = 'OTROS'
      AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) IN ('INGRESO', 'SALIDA')
      AND oc.fecha_registro >= COALESCE(c.fecha_apertura, '-infinity'::timestamp with time zone)
  ) m ON true
),
ruta_kpi AS (
  SELECT
    k.id,
    k.ruta,
    k.id_estado,
    est.nombre AS nombre_estado,
    k.id_usuario,
    u.nombre AS nombre_usuario,
    k.fecha_registro
  FROM public.tb_ruta_operacion_kpi k
  LEFT JOIN public.tb_estado est ON est.id = k.id_estado
  LEFT JOIN public.tb_usuario u ON u.id = k.id_usuario
  WHERE k.ruta = p_ruta
    AND k.id_estado = 1
  ORDER BY k.id
  LIMIT 1
)
SELECT
  COALESCE(rk.id, MAX(pc.id_caja)) AS id,
  p_ruta AS ruta,
  COALESCE(SUM(pc.saldo_inicial), 0) AS caja_inicial,
  COALESCE(SUM(
    CASE
      -- La Caja Inicial es informativa y no forma parte del saldo operativo.
      -- En Capital Nova-BCP y Fluxopay-BCP los depositos estan retenidos,
      -- por lo que Caja Actual solo refleja movimientos manuales.
      WHEN (pc.id_empresa = 5 AND pc.id_empresa_cuenta_bancaria = 4)
        OR (pc.id_empresa = 6 AND pc.id_empresa_cuenta_bancaria = 5)
      THEN pc.manual_ingresos
        - pc.manual_salidas
      ELSE pc.ingresos
        + pc.directos
        + pc.manual_ingresos
        - pc.salidas
        - pc.manual_salidas
    END
  ), 0) AS caja_actual,
  COALESCE(SUM(pc.recaudacion), 0) AS total_recaudado,
  COALESCE(SUM(pc.manual_ingresos), 0) AS ingresos,
  COALESCE(SUM(pc.salidas + pc.manual_salidas), 0) AS salidas,
  COALESCE(SUM(pc.gastos + pc.manual_gastos), 0) AS gastos_operacionales,
  COALESCE(SUM(pc.ganancias), 0) AS ganancias,
  COALESCE(SUM(pc.retenidos), 0) AS ingresos_retenidos,
  0::numeric AS fuera_horario,
  COALESCE(SUM(pc.pendiente_transferencia), 0) AS pendiente_depositar,
  COALESCE(SUM(pc.total_efectivizacion), 0)::integer AS total_efectivizacion,
  COALESCE(SUM(pc.total_pago_deuda), 0)::integer AS total_pago_deuda,
  rk.id_estado,
  rk.nombre_estado,
  rk.id_usuario,
  rk.nombre_usuario,
  COALESCE(rk.fecha_registro, MAX(pc.caja_fecha_registro)) AS fecha_registro,
  COALESCE(SUM(pc.recaudacion), 0) AS caja_recaudacion,
  COALESCE(SUM(pc.pendiente_transferencia), 0) AS pendiente_transferencia
FROM por_caja pc
FULL JOIN ruta_kpi rk ON true
GROUP BY rk.id, rk.ruta, rk.id_estado, rk.nombre_estado, rk.id_usuario, rk.nombre_usuario, rk.fecha_registro;
$$;

-- f_patch_tb_operacion_proceso_devolver_derivacion
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_devolver_derivacion(
  p_id bigint,
  p_id_empresa_actual bigint DEFAULT NULL,
  p_id_empresa_cuenta_actual bigint DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_calc_salida jsonb;
  v_resultado_comision_banco_salida numeric;
  v_ruta_actual character varying;
  v_ruta_origen character varying;
  v_usuario bigint;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1
  FOR UPDATE;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion no existe.');
  END IF;

  IF COALESCE(v_actual.monto_deposito_cliente, 0) <= 0 THEN
    RETURN jsonb_build_object('error', 'La operacion no tiene monto de deposito para caja.');
  END IF;

  IF UPPER(BTRIM(COALESCE(v_actual.tipo_servicio, ''))) <> 'EFECTIVIZACION' THEN
    RETURN jsonb_build_object('error', 'Solo se pueden devolver operaciones de Efectivizacion.');
  END IF;

  IF UPPER(BTRIM(COALESCE(v_actual.nombre_estado, ''))) <> 'PENDIENTE' THEN
    RETURN jsonb_build_object('error', 'Solo se pueden devolver operaciones en estado Pendiente.');
  END IF;

  IF NOT COALESCE(v_actual.flag_derivado, false) THEN
    RETURN jsonb_build_object('error', 'La operacion no se encuentra derivada.');
  END IF;

  IF v_actual.id_empresa_salida_origen IS NULL
     OR v_actual.id_empresa_cuenta_salida_origen IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion no tiene una empresa y cuenta de origen validas.');
  END IF;

  IF p_id_empresa_actual IS NOT NULL
     AND v_actual.id_empresa_salida IS DISTINCT FROM p_id_empresa_actual THEN
    RETURN jsonb_build_object('error', 'La operacion no pertenece a la empresa que intenta devolverla.');
  END IF;

  IF p_id_empresa_cuenta_actual IS NOT NULL
     AND v_actual.id_empresa_cuenta_salida IS DISTINCT FROM p_id_empresa_cuenta_actual THEN
    RETURN jsonb_build_object('error', 'La operacion no pertenece a la cuenta que intenta devolverla.');
  END IF;

  v_calc_salida := public.f_get_tb_operacion_calculo_comision_banco_salida(
    COALESCE(v_actual.monto_transferencia_cliente, 0),
    COALESCE(v_actual.comision_transf_banco_salida, 0),
    COALESCE(v_actual.comision_transf_inter_banco_salida, 0),
    COALESCE(v_actual.monto_itf_salida, 0),
    v_actual.id_empresa_salida_origen,
    v_actual.id_empresa_cuenta_salida_origen,
    v_actual.id_banco_empresa_cuenta_salida_origen,
    v_actual.id_banco_empresa_cuenta_salida_origen
  );
  v_resultado_comision_banco_salida := (v_calc_salida->>'resultado_comision_banco_salida')::numeric;

  v_ruta_actual := LOWER(BTRIM(COALESCE(v_actual.ruta_destino, v_actual.ruta_origen, '')));
  v_ruta_origen := LOWER(BTRIM(COALESCE(v_actual.ruta_origen, v_actual.ruta_destino, '')));
  v_usuario := COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario);

  UPDATE public.tb_operacion_proceso
  SET ruta_destino = COALESCE(v_actual.ruta_origen, v_actual.ruta_destino),
      id_empresa_salida = v_actual.id_empresa_salida_origen,
      nombre_empresa_salida = v_actual.nombre_empresa_salida_origen,
      id_empresa_cuenta_salida = v_actual.id_empresa_cuenta_salida_origen,
      id_banco_empresa_cuenta_salida = v_actual.id_banco_empresa_cuenta_salida_origen,
      nombre_banco_empresa_cuenta_salida = v_actual.nombre_banco_empresa_cuenta_salida_origen,
      id_banco_cliente_transferencia = COALESCE(v_actual.id_banco_empresa_cuenta_salida_origen, v_actual.id_banco_cliente_transferencia),
      nombre_banco_cliente_transferencia = COALESCE(v_actual.nombre_banco_empresa_cuenta_salida_origen, v_actual.nombre_banco_cliente_transferencia),
      resultado_comision_banco_salida = COALESCE(v_resultado_comision_banco_salida, resultado_comision_banco_salida),
      flag_derivado = false,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_actual, v_usuario);
  IF v_ruta_origen IS DISTINCT FROM v_ruta_actual THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_origen, v_usuario);
  END IF;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- f_patch_tb_operacion_proceso_pagado
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
DECLARE
  v_actual record;
  v_ruta_kpi character varying;
  v_ingreso_result jsonb;
  v_salida_result jsonb;
  v_estado_retenido_id bigint;
  v_tiene_ingreso boolean := false;
  v_tiene_salida boolean := false;
  v_es_pos boolean := false;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1
  FOR UPDATE;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion no existe.');
  END IF;

  v_es_pos := UPPER(COALESCE(v_actual.tipo_servicio, '')) = 'POS';

  SELECT id
  INTO v_estado_retenido_id
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'RETENIDO'
  LIMIT 1;

  IF UPPER(BTRIM(COALESCE(p_nombre_estado, ''))) = 'PAGADO'
     AND v_actual.monto_transferencia_cliente IS NOT NULL
     AND v_actual.monto_transferencia_cliente <= 0 THEN
    UPDATE public.tb_operacion_proceso
    SET monto_transferencia_cliente = 0,
        resultado_comision_servicio = 0,
        resultado_comision_banco_salida = 0
    WHERE id = p_id;
  END IF;

  UPDATE public.tb_operacion_proceso
  SET id_estado = p_id_estado,
      nombre_estado = p_nombre_estado,
      fecha_pagado = COALESCE(p_fecha_pagado, now()),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja c
    WHERE c.id_operacion_proceso = p_id
      AND c.tipo_movimiento = 'INGRESO'
      AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
  )
  INTO v_tiene_ingreso;

  SELECT EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja c
    WHERE c.id_operacion_proceso = p_id
      AND c.tipo_movimiento = 'SALIDA'
  )
  INTO v_tiene_salida;

  IF v_es_pos THEN
    IF NOT v_tiene_salida THEN
      v_salida_result := public.f_post_tb_operacion_caja_desde_proceso(
        p_id_operacion_proceso := p_id,
        p_tipo_origen := 'POS',
        p_tipo_movimiento := 'SALIDA',
        p_id_usuario := COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario),
        p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_actual.nombre_usuario_gestor, v_actual.nombre_usuario),
        p_id_estado := p_id_estado
      );

      IF v_salida_result ? 'error' THEN
        RETURN v_salida_result;
      END IF;
    END IF;
  ELSE
    IF COALESCE(v_actual.flag_fuera_horario, false) THEN
      -- Fuera de Horario ya fue reconocido informativamente al cargarlo.
      -- Al pagarse solo debe ejecutar la salida real de la caja; no debe
      -- volver a registrar ingreso, recaudacion ni gasto de ingreso.
      NULL;
    ELSIF COALESCE(v_actual.flag_retenido, false) THEN
      IF NOT v_tiene_ingreso THEN
        v_ingreso_result := public.f_post_tb_operacion_caja_desde_proceso(
          p_id_operacion_proceso := p_id,
          p_tipo_origen := 'EFECTIVIZACION',
          p_tipo_movimiento := 'INGRESO',
          p_id_usuario := COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario),
          p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_actual.nombre_usuario_gestor, v_actual.nombre_usuario),
          p_id_estado := COALESCE(v_estado_retenido_id, p_id_estado)
        );

        IF v_ingreso_result ? 'error' THEN
          RETURN v_ingreso_result;
        END IF;
      END IF;
    ELSE
      v_ingreso_result := public.f_post_tb_operacion_caja_desde_proceso(
        p_id_operacion_proceso := p_id,
        p_tipo_origen := 'EFECTIVIZACION',
        p_tipo_movimiento := 'INGRESO',
        p_id_usuario := COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario),
        p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_actual.nombre_usuario_gestor, v_actual.nombre_usuario),
        p_id_estado := p_id_estado
      );

      IF v_ingreso_result ? 'error' THEN
        RETURN v_ingreso_result;
      END IF;
    END IF;

    v_salida_result := public.f_post_tb_operacion_caja_desde_proceso(
      p_id_operacion_proceso := p_id,
      p_tipo_origen := 'EFECTIVIZACION',
      p_tipo_movimiento := 'SALIDA',
      p_id_usuario := COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario),
      p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_actual.nombre_usuario_gestor, v_actual.nombre_usuario),
      p_id_estado := p_id_estado
    );

    IF v_salida_result ? 'error' THEN
      RETURN v_salida_result;
    END IF;
  END IF;

  v_ruta_kpi := COALESCE(v_actual.ruta_destino, v_actual.ruta_origen);
  -- Los lotes de pago sincronizan el KPI una sola vez al finalizar.
  IF current_setting('app.defer_kpi_sync', true) IS DISTINCT FROM 'on' THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi, COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario));
  END IF;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- f_patch_tb_operacion_proceso_pagado_lote
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_pagado_lote(
  p_ids_operaciones jsonb,
  p_id_estado bigint,
  p_nombre_estado character varying,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ids bigint[];
  v_id bigint;
  v_actual record;
  v_result jsonb;
  v_actualizadas jsonb := '[]'::jsonb;
  v_detalle jsonb := '[]'::jsonb;
  v_ruta character varying;
  v_rutas character varying[];
  v_ruta_sync character varying;
BEGIN
  IF p_ids_operaciones IS NULL OR jsonb_typeof(p_ids_operaciones) <> 'array' THEN
    RETURN jsonb_build_object(
      'error', 'p_ids_operaciones debe ser un arreglo JSON.'
    );
  END IF;

  SELECT array_agg(DISTINCT value::bigint ORDER BY value::bigint)
  INTO v_ids
  FROM jsonb_array_elements_text(p_ids_operaciones) AS item(value);

  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object(
      'error', 'No se recibieron operaciones para pagar.'
    );
  END IF;

  /* Primero se bloquean y validan todas las filas; todavia no se modifica nada. */
  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT *
    INTO v_actual
    FROM public.tb_operacion_proceso
    WHERE id = v_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'id', v_id,
        'motivo', 'La operacion no existe.'
      ));
      CONTINUE;
    END IF;

    v_ruta := LOWER(BTRIM(COALESCE(v_actual.ruta_destino, v_actual.ruta_origen, '')));

    IF UPPER(BTRIM(COALESCE(v_actual.tipo_servicio, ''))) NOT IN ('EFECTIVIZACION', 'POS') THEN
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'id', v_id,
        'motivo', 'La operacion no pertenece a un flujo pagable en lote.'
      ));
    ELSIF (
        UPPER(BTRIM(COALESCE(v_actual.tipo_servicio, ''))) = 'POS'
        AND UPPER(BTRIM(COALESCE(v_actual.nombre_estado, ''))) NOT IN ('PENDIENTE', 'SOLICITADO')
      )
      OR (
        UPPER(BTRIM(COALESCE(v_actual.tipo_servicio, ''))) <> 'POS'
        AND UPPER(BTRIM(COALESCE(v_actual.nombre_estado, ''))) <> 'PENDIENTE'
      )
      OR v_actual.id_estado = 10 THEN
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'id', v_id,
        'motivo', 'La operacion ya no se encuentra en un estado pagable.'
      ));
    ELSIF v_actual.id_caja_cierre IS NOT NULL THEN
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'id', v_id,
        'motivo', 'La operacion ya pertenece a un cierre de caja.'
      ));
    ELSIF v_ruta NOT IN ('bcp', 'bbva', 'scotiabank', 'banbif', 'interbank', 'safetypay') THEN
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'id', v_id,
        'motivo', 'La ruta de la operacion no es una ruta bancaria valida.'
      ));
    ELSIF v_actual.id_empresa_cuenta_salida IS NULL
       AND v_actual.id_empresa_cuenta_ingreso IS NULL THEN
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'id', v_id,
        'motivo', 'La operacion no tiene una cuenta operativa valida.'
      ));
    END IF;
  END LOOP;

  IF jsonb_array_length(v_detalle) > 0 THEN
    RETURN jsonb_build_object(
      'error', 'No se pudo procesar el lote completo.',
      'detalle', v_detalle
    );
  END IF;

  SELECT array_agg(ruta ORDER BY ruta)
  INTO v_rutas
  FROM (
    SELECT DISTINCT LOWER(BTRIM(COALESCE(op.ruta_destino, op.ruta_origen, ''))) AS ruta
    FROM public.tb_operacion_proceso op
    WHERE op.id = ANY(v_ids)
      AND NULLIF(BTRIM(COALESCE(op.ruta_destino, op.ruta_origen, '')), '') IS NOT NULL
  ) rutas;

  -- El lote ya valido todas las operaciones y cajas. Desde aqui se conservan
  -- los movimientos y saldos, pero se difiere el recalculo de KPI.
  PERFORM set_config('app.defer_kpi_sync', 'on', true);

  FOREACH v_id IN ARRAY v_ids LOOP
    v_result := public.f_patch_tb_operacion_proceso_pagado(
      p_id := v_id,
      p_id_estado := p_id_estado,
      p_nombre_estado := p_nombre_estado,
      p_id_usuario_gestor := p_id_usuario_gestor,
      p_nombre_usuario_gestor := p_nombre_usuario_gestor
    );

    IF v_result ? 'error' THEN
      RAISE EXCEPTION 'No se pudo pagar la operacion %: %', v_id, v_result->>'error';
    END IF;

    v_actualizadas := v_actualizadas || jsonb_build_array(v_result);
  END LOOP;

  PERFORM set_config('app.defer_kpi_sync', 'off', true);

  FOREACH v_ruta_sync IN ARRAY COALESCE(v_rutas, ARRAY[]::character varying[]) LOOP
    PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(v_ruta_sync, p_id_usuario_gestor);
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_sync, p_id_usuario_gestor);
  END LOOP;

  RETURN jsonb_build_object(
    'cantidad_procesada', array_length(v_ids, 1),
    'operaciones_actualizadas', v_actualizadas,
    'detalle', '[]'::jsonb
  );
END;
$$;

-- f_patch_tb_operacion_proceso_directo_caja
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_directo_caja(
  p_id bigint,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_estado_pagado_id bigint;
  v_estado_pagado_nombre character varying;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion no existe.');
  END IF;

  IF v_actual.id_caja_cierre IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'La operacion ya pertenece a un cierre de caja.');
  END IF;

  SELECT id, nombre
  INTO v_estado_pagado_id, v_estado_pagado_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PAGADO'
  LIMIT 1;

  IF v_estado_pagado_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro el estado Pagado.');
  END IF;

  UPDATE public.tb_operacion_proceso
  SET tipo_flujo_pago_deuda = 'DIRECTO_CAJA',
      id_estado = v_estado_pagado_id,
      nombre_estado = v_estado_pagado_nombre,
      fecha_pagado = COALESCE(fecha_pagado, NOW()),
      monto_transferencia_cliente = 0,
      comision_servicio = 0,
      resultado_comision_servicio = 0,
      resultado_comision_banco_ingreso = 0,
      resultado_comision_banco_salida = 0,
      monto_itf_ingreso = 0,
      monto_itf_salida = 0,
      flag_retenido = false,
      fecha_retencion = NULL,
      id_usuario_retiene = NULL,
      nombre_usuario_retiene = NULL,
      motivo_retencion = NULL,
      flag_fuera_horario = false,
      fecha_fuera_horario = NULL,
      id_usuario_fuera_horario = NULL,
      motivo_fuera_horario = NULL,
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

-- f_patch_tb_operacion_proceso_reanudar
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
DECLARE
  v_actual record;
  v_mov record;
  v_ruta_kpi character varying;
  v_id_usuario_final bigint;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  FOR UPDATE;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion no existe.');
  END IF;

  IF UPPER(BTRIM(COALESCE(v_actual.nombre_estado, ''))) = 'PAGADO'
     AND UPPER(BTRIM(COALESCE(v_actual.tipo_servicio, ''))) = 'EFECTIVIZACION'
     AND LOWER(BTRIM(COALESCE(v_actual.ruta_destino, v_actual.ruta_origen, ''))) IN ('bcp', 'bbva', 'banbif', 'scotiabank', 'interbank', 'safetypay')
     AND (
       EXISTS (
         SELECT 1
         FROM public.tb_operacion_caja c
         WHERE c.id_operacion_proceso = p_id
           AND UPPER(BTRIM(COALESCE(c.tipo_movimiento, ''))) = 'SALIDA'
           AND c.id_caja_cierre IS NOT NULL
           AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
       )
       OR (
         v_actual.id_caja_cierre_salida IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM public.tb_operacion_caja c
           WHERE c.id_operacion_proceso = p_id
         )
       )
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.tb_operacion_caja c
       WHERE c.id_operacion_proceso = p_id
         AND UPPER(BTRIM(COALESCE(c.tipo_movimiento, ''))) = 'SALIDA'
         AND c.id_caja_cierre IS NULL
         AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
     ) THEN
    RETURN public.f_patch_tb_operacion_proceso_reanudar_post_cierre(
      p_id := p_id,
      p_id_estado := p_id_estado,
      p_nombre_estado := p_nombre_estado,
      p_fecha_pendiente := p_fecha_pendiente,
      p_id_usuario_gestor := p_id_usuario_gestor,
      p_nombre_usuario_gestor := p_nombre_usuario_gestor
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja c
    WHERE c.id_operacion_proceso = p_id
      AND c.id_caja_cierre IS NOT NULL
      AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja c
    WHERE c.id_operacion_proceso = p_id
      AND UPPER(BTRIM(COALESCE(c.tipo_movimiento, ''))) = 'SALIDA'
      AND c.id_caja_cierre IS NULL
      AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
  ) THEN
    RETURN jsonb_build_object('error', 'No se puede reiniciar una operacion con movimientos cerrados por caja.');
  END IF;

  v_id_usuario_final := COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario);

  FOR v_mov IN
    SELECT *
    FROM public.tb_operacion_caja c
    WHERE c.id_operacion_proceso = p_id
      AND UPPER(BTRIM(COALESCE(c.tipo_movimiento, ''))) = 'SALIDA'
      AND c.id_caja_cierre IS NULL
      AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
    ORDER BY c.id
  LOOP
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
      p_id_usuario := v_id_usuario_final
    );

    UPDATE public.tb_operacion_caja
    SET id_operacion_caja_relacionada = NULL
    WHERE id_operacion_caja_relacionada = v_mov.id;

    DELETE FROM public.tb_operacion_caja
    WHERE id = v_mov.id;
  END LOOP;

  UPDATE public.tb_operacion_caja
  SET id_estado = p_id_estado,
      nombre_estado = p_nombre_estado,
      id_usuario = COALESCE(v_id_usuario_final, id_usuario),
      nombre_usuario = COALESCE(p_nombre_usuario_gestor, nombre_usuario)
  WHERE id_operacion_proceso = p_id
    AND UPPER(BTRIM(COALESCE(tipo_movimiento, ''))) = 'INGRESO'
    AND id_caja_cierre IS NULL
    AND tipo_origen <> 'PAGO_DEUDA_COMISION';

  UPDATE public.tb_operacion_proceso
  SET id_estado = p_id_estado,
      nombre_estado = p_nombre_estado,
      fecha_pendiente = COALESCE(p_fecha_pendiente, now()),
      fecha_pagado = NULL,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  v_ruta_kpi := COALESCE(v_actual.ruta_destino, v_actual.ruta_origen);
  IF current_setting('app.defer_kpi_sync', true) IS DISTINCT FROM 'on' THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi, v_id_usuario_final);
    PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(v_ruta_kpi, v_id_usuario_final);
  END IF;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- f_patch_tb_operacion_proceso_reanudar_post_cierre
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_reanudar_post_cierre(
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
DECLARE
  v_actual record;
  v_ruta text;
  v_id_usuario_final bigint;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'La operacion no existe.');
  END IF;

  v_ruta := LOWER(BTRIM(COALESCE(v_actual.ruta_destino, v_actual.ruta_origen, '')));

  IF v_ruta NOT IN ('bcp', 'bbva', 'banbif', 'scotiabank', 'interbank', 'safetypay')
     OR UPPER(BTRIM(COALESCE(v_actual.tipo_servicio, ''))) <> 'EFECTIVIZACION' THEN
    RETURN jsonb_build_object(
      'error', 'El reinicio post cierre solo aplica a Efectivizacion de rutas bancarias.'
    );
  END IF;

  IF UPPER(BTRIM(COALESCE(v_actual.nombre_estado, ''))) <> 'PAGADO' THEN
    RETURN jsonb_build_object('error', 'La operacion no se encuentra en estado Pagado.');
  END IF;

  IF v_actual.id_operacion_match IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'No se puede reiniciar una operacion enlazada a un match de Pago Deuda.');
  END IF;

  IF v_actual.id_caja_cierre_salida IS NULL
     AND NOT EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja c
    WHERE c.id_operacion_proceso = p_id
      AND UPPER(BTRIM(COALESCE(c.tipo_movimiento, ''))) = 'SALIDA'
      AND c.id_caja_cierre IS NOT NULL
      AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
  ) THEN
    RETURN jsonb_build_object('error', 'La operacion no tiene una salida cerrada para reabrir.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja c
    WHERE c.id_operacion_proceso = p_id
      AND UPPER(BTRIM(COALESCE(c.tipo_movimiento, ''))) = 'SALIDA'
      AND c.id_caja_cierre IS NULL
      AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
  ) THEN
    RETURN jsonb_build_object('error', 'La operacion ya tiene una salida abierta en la caja actual.');
  END IF;

  v_id_usuario_final := COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario);

  UPDATE public.tb_operacion_proceso
  SET id_estado = p_id_estado,
      nombre_estado = p_nombre_estado,
      fecha_pendiente = COALESCE(p_fecha_pendiente, now()),
      fecha_pagado = NULL,
      id_caja_cierre = NULL,
      fecha_caja_cierre = NULL,
      id_caja_cierre_salida = NULL,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  IF current_setting('app.defer_kpi_sync', true) IS DISTINCT FROM 'on' THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta, v_id_usuario_final);
    PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(v_ruta, v_id_usuario_final);
  END IF;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- f_patch_tb_operacion_proceso_reanudar_lote
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_reanudar_lote(
  p_ids_operaciones bigint[],
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
DECLARE
  v_ids bigint[];
  v_id bigint;
  v_result jsonb;
  v_actualizadas jsonb := '[]'::jsonb;
  v_errores jsonb := '[]'::jsonb;
  v_rutas character varying[];
  v_ruta character varying;
  v_defer_kpi_sync text;
BEGIN
  SELECT array_agg(item.id ORDER BY item.id)
  INTO v_ids
  FROM (
    SELECT DISTINCT value AS id
    FROM unnest(COALESCE(p_ids_operaciones, ARRAY[]::bigint[])) AS ids(value)
    WHERE value IS NOT NULL
  ) item;

  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object(
      'cantidad_procesada', 0,
      'operaciones_actualizadas', '[]'::jsonb,
      'errores', '[]'::jsonb
    );
  END IF;

  SELECT array_agg(ruta ORDER BY ruta)
  INTO v_rutas
  FROM (
    SELECT DISTINCT LOWER(BTRIM(COALESCE(op.ruta_destino, op.ruta_origen, ''))) AS ruta
    FROM public.tb_operacion_proceso op
    WHERE op.id = ANY(v_ids)
      AND NULLIF(BTRIM(COALESCE(op.ruta_destino, op.ruta_origen, '')), '') IS NOT NULL
  ) rutas;

  v_defer_kpi_sync := current_setting('app.defer_kpi_sync', true);
  PERFORM set_config('app.defer_kpi_sync', 'on', true);

  FOREACH v_id IN ARRAY v_ids LOOP
    v_result := public.f_patch_tb_operacion_proceso_reanudar(
      p_id := v_id,
      p_id_estado := p_id_estado,
      p_nombre_estado := p_nombre_estado,
      p_fecha_pendiente := p_fecha_pendiente,
      p_id_usuario_gestor := p_id_usuario_gestor,
      p_nombre_usuario_gestor := p_nombre_usuario_gestor
    );

    IF v_result IS NULL OR v_result ? 'error' THEN
      v_errores := v_errores || jsonb_build_array(
        jsonb_build_object(
          'id', v_id,
          'error', COALESCE(v_result ->> 'error', 'No se pudo reiniciar la operacion.')
        )
      );
    ELSE
      v_actualizadas := v_actualizadas || jsonb_build_array(v_result);
    END IF;
  END LOOP;

  PERFORM set_config('app.defer_kpi_sync', COALESCE(NULLIF(v_defer_kpi_sync, ''), 'off'), true);

  FOREACH v_ruta IN ARRAY COALESCE(v_rutas, ARRAY[]::character varying[]) LOOP
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta, p_id_usuario_gestor);
    PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(v_ruta, p_id_usuario_gestor);
  END LOOP;

  RETURN jsonb_build_object(
    'cantidad_procesada', jsonb_array_length(v_actualizadas),
    'operaciones_actualizadas', v_actualizadas,
    'errores', v_errores
  );
END;
$$;

-- f_get_tb_pago_deuda_match_lote
CREATE OR REPLACE FUNCTION public.f_get_tb_pago_deuda_match_lote(
  p_ids_operaciones jsonb
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH ids AS (
    SELECT DISTINCT item.value::bigint AS id
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(COALESCE(p_ids_operaciones, '[]'::jsonb)) = 'array'
          THEN p_ids_operaciones
        ELSE '[]'::jsonb
      END
    ) AS item(value)
    WHERE item.value ~ '^[0-9]+$'
  ),
  operaciones_efectivizacion AS (
    SELECT
      op.id,
      op.dni_cliente,
      op.fecha_deposito_cliente
    FROM public.tb_operacion_proceso op
    INNER JOIN ids ON ids.id = op.id
  ),
  candidatos_ranked AS (
    SELECT
      origen.id AS id_operacion_efectivizacion,
      candidato.id AS id_candidato,
      candidato.codigo_operacion_deposito_cliente,
      candidato.dni_cliente,
      candidato.nombre_cliente,
      candidato.monto_deposito_cliente,
      candidato.nombre_banco_cliente,
      candidato.nombre_codigo_servicio,
      candidato.id_estado,
      candidato.nombre_estado,
      candidato.fecha_registro,
      candidato.fecha_pendiente,
      candidato.tipo_flujo_pago_deuda,
      candidato.monto_devuelto,
      ROW_NUMBER() OVER (
        PARTITION BY origen.id
        ORDER BY candidato.id DESC
      ) AS numero_candidato
    FROM operaciones_efectivizacion origen
    INNER JOIN public.tb_operacion_proceso candidato
      ON candidato.dni_cliente = origen.dni_cliente
    WHERE UPPER(COALESCE(candidato.tipo_servicio, '')) LIKE '%PAGO%DEUDA%'
      AND UPPER(COALESCE(candidato.tipo_flujo_pago_deuda, '')) = 'BANCO'
      AND UPPER(COALESCE(candidato.nombre_estado, '')) = 'PROCESADO'
      AND candidato.id_caja_cierre IS NULL
      AND origen.fecha_deposito_cliente IS NOT NULL
      AND candidato.monto_devuelto < candidato.monto_deposito_cliente
      AND ABS(
        EXTRACT(epoch FROM (
          COALESCE(candidato.fecha_pendiente, candidato.fecha_registro)
          - origen.fecha_deposito_cliente
        ))
      ) <= 86400
  ),
  candidatos_agrupados AS (
    SELECT
      id_operacion_efectivizacion,
      jsonb_agg(
        jsonb_build_object(
          'id', id_candidato,
          'codigo_operacion_deposito_cliente', codigo_operacion_deposito_cliente,
          'dni_cliente', dni_cliente,
          'nombre_cliente', nombre_cliente,
          'monto_deposito_cliente', monto_deposito_cliente,
          'nombre_banco_cliente', nombre_banco_cliente,
          'nombre_codigo_servicio', nombre_codigo_servicio,
          'id_estado', id_estado,
          'nombre_estado', nombre_estado,
          'fecha_registro', fecha_registro,
          'fecha_pendiente', fecha_pendiente,
          'tipo_flujo_pago_deuda', tipo_flujo_pago_deuda,
          'monto_devuelto', monto_devuelto
        )
        ORDER BY id_candidato DESC
      ) AS matches
    FROM candidatos_ranked
    WHERE numero_candidato <= 20
    GROUP BY id_operacion_efectivizacion
  )
  SELECT jsonb_build_object(
    'id_operacion_efectivizacion', agrupados.id_operacion_efectivizacion,
    'matches', agrupados.matches
  )
  FROM candidatos_agrupados agrupados
  ORDER BY agrupados.id_operacion_efectivizacion;
$$;

-- f_patch_tb_pago_deuda_salida
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
  v_caja_salida record;
BEGIN
  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1
  FOR UPDATE;

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
    LIMIT 1
    FOR UPDATE;
  ELSE
    v_op := v_input;
  END IF;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro la operacion bancaria de Pago Deuda.');
  END IF;

  v_ruta_kpi_actual := COALESCE(v_op.ruta_destino, v_op.ruta_origen);
  v_id_empresa_salida_final := COALESCE(p_id_empresa_salida, v_op.id_empresa_salida);
  v_id_empresa_cuenta_salida_final := COALESCE(p_id_empresa_cuenta_salida, v_op.id_empresa_cuenta_salida);

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

  /* Mantener el lock y validar que exista la caja, sin bloquear por saldo. */
  SELECT c.id, c.saldo_actual
  INTO v_caja_salida
  FROM public.tb_caja_operativa c
  WHERE c.id_empresa = v_id_empresa_salida_final
    AND c.id_empresa_cuenta_bancaria = v_id_empresa_cuenta_salida_final
  LIMIT 1
  FOR UPDATE;

  IF v_caja_salida.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No existe caja inicial para la empresa y cuenta de salida seleccionada.');
  END IF;

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

-- f_get_tb_ruta_operacion_ganancias_efectivizacion_v2
CREATE OR REPLACE FUNCTION public.f_get_tb_ruta_operacion_ganancias_efectivizacion_v2(
  p_ruta character varying,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_id_caja bigint DEFAULT NULL,
  p_id_caja_cierre bigint DEFAULT NULL,
  p_historico boolean DEFAULT false
)
RETURNS TABLE (
  ganancias numeric,
  id_caja_cierre_referencia bigint,
  fecha_cierre_referencia timestamp with time zone
)
LANGUAGE sql
SECURITY DEFINER
AS $$
WITH cuentas_especiales(ruta, id_empresa, id_empresa_cuenta_bancaria, id_banco) AS (
  VALUES
    ('scotiabank'::character varying, 5::bigint, 33::bigint, 3::bigint),
    ('scotiabank'::character varying, 8::bigint, 7::bigint, 3::bigint),
    ('banbif'::character varying, 7::bigint, 16::bigint, 4::bigint)
), contexto_base AS (
  SELECT
    e.ruta,
    e.id_empresa,
    e.id_empresa_cuenta_bancaria,
    e.id_banco,
    c.id AS id_caja_cierre,
    c.id_caja,
    c.fecha_cierre
  FROM cuentas_especiales e
  LEFT JOIN LATERAL (
    SELECT cc.id, cc.id_caja, cc.fecha_cierre
    FROM public.tb_caja_operativa_cierre cc
    WHERE cc.id_empresa = e.id_empresa
      AND cc.id_empresa_cuenta_bancaria = e.id_empresa_cuenta_bancaria
      AND (p_id_caja IS NULL OR cc.id_caja = p_id_caja)
      AND (
        (COALESCE(p_historico, false) AND cc.id = p_id_caja_cierre)
        OR (
          NOT COALESCE(p_historico, false)
          AND (p_id_caja_cierre IS NULL OR cc.id = p_id_caja_cierre)
        )
      )
    ORDER BY cc.fecha_cierre DESC NULLS LAST, cc.id DESC
    LIMIT 1
  ) c ON true
  WHERE LOWER(BTRIM(COALESCE(p_ruta, ''))) = e.ruta
    AND (p_id_empresa IS NULL OR p_id_empresa = e.id_empresa)
    AND (
      p_id_empresa_cuenta_bancaria IS NULL
      OR p_id_empresa_cuenta_bancaria = e.id_empresa_cuenta_bancaria
    )
), operaciones_base AS (
  SELECT
    op.*,
    ctx.id_caja_cierre AS cierre_referencia,
    ctx.fecha_cierre AS fecha_cierre_referencia,
    (op.fecha_deposito_cliente AT TIME ZONE 'America/Lima')::date AS fecha_deposito_lima,
    (
      op.id_caja_cierre_ingreso = ctx.id_caja_cierre
      OR op.id_caja_cierre_salida = ctx.id_caja_cierre
      OR (
        op.id_caja_cierre_ingreso IS NULL
        AND op.id_caja_cierre_salida IS NULL
        AND op.id_caja_cierre = ctx.id_caja_cierre
      )
    ) AS pertenece_cierre
  FROM public.tb_operacion_proceso op
  JOIN contexto_base ctx
    ON ctx.id_empresa = op.id_empresa_ingreso
   AND ctx.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_ingreso
   AND op.id_banco_empresa_cuenta_ingreso = ctx.id_banco
  WHERE UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) = 'EFECTIVIZACION'
    AND UPPER(BTRIM(COALESCE(op.nombre_tipo_deposito, ''))) IN (
      'MISMO DIA', 'MISMO DÍA', 'DIA SIGUIENTE', 'DÍA SIGUIENTE'
    )
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
    AND op.fecha_deposito_cliente IS NOT NULL
    AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) NOT IN (
      'DIRECTO_CAJA', 'RETORNO', 'RETORNO_DIRECTO'
    )
), fechas_referencia AS (
  SELECT DISTINCT
    o.fecha_deposito_lima
  FROM operaciones_base o
  WHERE o.pertenece_cierre
), operaciones_ganancia AS (
  SELECT o.*
  FROM operaciones_base o
  WHERE UPPER(BTRIM(COALESCE(o.nombre_estado, ''))) = 'PAGADO'
    AND o.fecha_pagado IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM fechas_referencia f
      WHERE f.fecha_deposito_lima = o.fecha_deposito_lima
    )
    AND CASE
      WHEN COALESCE(p_historico, false) THEN
        o.pertenece_cierre
        AND (
          UPPER(BTRIM(COALESCE(o.nombre_tipo_deposito, ''))) IN ('MISMO DIA', 'MISMO DÍA')
          OR o.fecha_pagado <= o.fecha_cierre_referencia
        )
      ELSE
        (
          UPPER(BTRIM(COALESCE(o.nombre_tipo_deposito, ''))) IN ('MISMO DIA', 'MISMO DÍA')
          AND o.pertenece_cierre
        )
        OR (
          UPPER(BTRIM(COALESCE(o.nombre_tipo_deposito, ''))) IN ('DIA SIGUIENTE', 'DÍA SIGUIENTE')
          AND o.fecha_pagado > o.fecha_cierre_referencia
        )
    END
), total AS (
  SELECT
    COALESCE(SUM(
      GREATEST(
        COALESCE(o.monto_deposito_cliente, 0)
        - COALESCE(o.monto_transferencia_cliente, 0)
        - COALESCE(o.resultado_comision_banco_ingreso, 0)
        - COALESCE(o.resultado_comision_banco_salida, 0),
        0
      )
    ), 0)::numeric AS ganancias,
    MAX(o.cierre_referencia) AS id_caja_cierre_referencia,
    MAX(o.fecha_cierre_referencia) AS fecha_cierre_referencia
  FROM operaciones_ganancia o
)
SELECT
  t.ganancias,
  COALESCE(t.id_caja_cierre_referencia, ctx.id_caja_cierre),
  COALESCE(t.fecha_cierre_referencia, ctx.fecha_cierre)
 FROM total t
 LEFT JOIN contexto_base ctx ON true;
$$;

-- f_patch_tb_caja_operativa_saldo_inicial
CREATE OR REPLACE FUNCTION public.f_patch_tb_caja_operativa_saldo_inicial(
  p_id_caja bigint,
  p_saldo_inicial numeric,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caja record;
  v_saldo_anterior numeric;
  v_result jsonb;
BEGIN
  IF p_saldo_inicial IS NULL OR p_saldo_inicial < 0 THEN
    RETURN jsonb_build_object('error', 'El saldo inicial debe ser mayor o igual a cero.');
  END IF;

  SELECT c.*
  INTO v_caja
  FROM public.tb_caja_operativa c
  WHERE c.id = p_id_caja
  LIMIT 1
  FOR UPDATE;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La caja no existe.');
  END IF;

  v_saldo_anterior := COALESCE(v_caja.saldo_inicial, 0);

  UPDATE public.tb_caja_operativa
  SET saldo_inicial = p_saldo_inicial,
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id_caja;

  SELECT to_jsonb(x)
  INTO v_result
  FROM public.f_get_tb_caja_operativa(p_id := p_id_caja) AS x
  LIMIT 1;

  RETURN jsonb_build_object(
    'caja', v_result,
    'saldo_inicial_anterior', v_saldo_anterior,
    'saldo_inicial_nuevo', p_saldo_inicial,
    'movimiento', NULL
  );
END;
$$;

-- f_sync_tb_operacion_cierre_atribucion_v2
CREATE OR REPLACE FUNCTION public.f_sync_tb_operacion_cierre_atribucion_v2(
  p_id_caja bigint,
  p_id_caja_cierre bigint,
  p_fecha_cierre timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caja record;
  v_ingresos integer := 0;
  v_salidas integer := 0;
BEGIN
  SELECT c.id, c.id_empresa, c.id_empresa_cuenta_bancaria
  INTO v_caja
  FROM public.tb_caja_operativa c
  WHERE c.id = p_id_caja
  LIMIT 1;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La caja no existe.');
  END IF;

  IF p_id_caja_cierre IS NULL THEN
    RETURN jsonb_build_object('error', 'El cierre es obligatorio.');
  END IF;

  UPDATE public.tb_operacion_proceso op
  SET id_caja_cierre_ingreso = p_id_caja_cierre
  WHERE op.id_caja_cierre_ingreso IS NULL
    AND op.id_caja_cierre IS NULL
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
    AND op.id_empresa_ingreso = v_caja.id_empresa
    AND op.id_empresa_cuenta_ingreso = v_caja.id_empresa_cuenta_bancaria
    AND op.fecha_registro >= COALESCE(
      (
        SELECT c2.fecha_apertura
        FROM public.tb_caja_operativa c2
        WHERE c2.id = p_id_caja
      ),
      '-infinity'::timestamp with time zone
    );

  GET DIAGNOSTICS v_ingresos = ROW_COUNT;

  UPDATE public.tb_operacion_proceso op
  SET id_caja_cierre_salida = p_id_caja_cierre
  WHERE op.id_caja_cierre_salida IS NULL
    AND op.id_caja_cierre IS NULL
    AND op.id_empresa_salida = v_caja.id_empresa
    AND op.id_empresa_cuenta_salida = v_caja.id_empresa_cuenta_bancaria
    AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) NOT IN ('DIRECTO_CAJA', 'RETORNO', 'RETORNO_DIRECTO')
    AND (
      (
        UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
        AND op.fecha_pagado IS NOT NULL
        AND op.fecha_pagado >= COALESCE(
          (
            SELECT c2.fecha_apertura
            FROM public.tb_caja_operativa c2
            WHERE c2.id = p_id_caja
          ),
          '-infinity'::timestamp with time zone
        )
      )
      OR (
        UPPER(BTRIM(COALESCE(op.tipo_servicio, ''))) = 'PAGO DEUDA'
        AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PROCESADO'
        AND EXISTS (
          SELECT 1
          FROM public.tb_operacion_caja oc
          WHERE oc.id_operacion_proceso = op.id
            AND oc.id_caja = p_id_caja
            AND oc.id_caja_cierre IS NULL
            AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'SALIDA'
        )
      )
    );

  GET DIAGNOSTICS v_salidas = ROW_COUNT;

  RETURN jsonb_build_object(
    'id_caja', p_id_caja,
    'id_caja_cierre', p_id_caja_cierre,
    'fecha_cierre', p_fecha_cierre,
    'operaciones_ingreso_atribuidas', v_ingresos,
    'operaciones_salida_atribuidas', v_salidas
  );
END;
$$;

-- f_post_tb_caja_operativa_cierre
CREATE OR REPLACE FUNCTION public.f_post_tb_caja_operativa_cierre(
  p_id_caja bigint,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_kpi_snapshot jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caja record;
  v_historial_id bigint;
  v_result jsonb;
  v_kpi_snapshot jsonb;
  v_fecha_cierre timestamp with time zone := now();
  v_operaciones_congeladas integer := 0;
  v_operaciones_retenidas_congeladas integer := 0;
  v_movimientos_congelados integer := 0;
  v_movimientos_confirmados integer := 0;
  v_movimientos_abiertos integer := 0;
  v_movimientos_salida_retenidos integer := 0;
  v_total_recaudado numeric := 0;
  v_ingresos_retenidos_abiertos numeric := 0;
  v_fuera_horario_abiertos numeric := 0;
  v_ganancia_retenida_abierta numeric := 0;
  v_gastos_fuera_horario numeric := 0;
  v_ganancias_fuera_horario numeric := 0;
  v_ruta_operacion character varying;
  v_kpi_v2 jsonb;
BEGIN
  SELECT *
  INTO v_caja
  FROM public.tb_caja_operativa
  WHERE id = p_id_caja
  LIMIT 1;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La caja no existe.');
  END IF;

  SELECT LOWER(BTRIM(rc.ruta))
  INTO v_ruta_operacion
  FROM public.tb_ruta_operacion_caja rc
  WHERE rc.id_empresa = v_caja.id_empresa
    AND rc.id_empresa_cuenta_bancaria = v_caja.id_empresa_cuenta_bancaria
    AND rc.id_estado = 1
  ORDER BY rc.id
  LIMIT 1;

  -- Toda retencion no eliminada pertenece al cierre donde fue generada. Su
  -- estado puede seguir pendiente, pero no debe pasar al ciclo siguiente ni
  -- alimentar sus KPI.
  SELECT COALESCE(SUM(op.monto_deposito_cliente), 0)
  INTO v_ingresos_retenidos_abiertos
  FROM public.tb_operacion_proceso op
  WHERE COALESCE(op.flag_retenido, false) = true
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
    AND op.id_caja_cierre IS NULL
    AND op.id_empresa_ingreso = v_caja.id_empresa
    AND op.id_empresa_cuenta_ingreso = v_caja.id_empresa_cuenta_bancaria
    AND EXISTS (
      SELECT 1
      FROM public.tb_ruta_operacion_caja rc
      WHERE rc.id_empresa = v_caja.id_empresa
        AND rc.id_empresa_cuenta_bancaria = v_caja.id_empresa_cuenta_bancaria
        AND LOWER(rc.ruta) = LOWER(COALESCE(op.ruta_destino, op.ruta_origen))
      AND rc.id_estado = 1
    );

  SELECT COALESCE(SUM(op.monto_deposito_cliente), 0)
  INTO v_fuera_horario_abiertos
  FROM public.tb_operacion_proceso op
  WHERE COALESCE(op.flag_fuera_horario, false) = true
    AND COALESCE(op.flag_retenido, false) = false
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
    AND op.id_caja_cierre IS NULL
    AND op.id_empresa_ingreso = v_caja.id_empresa
    AND op.id_empresa_cuenta_ingreso = v_caja.id_empresa_cuenta_bancaria
    AND EXISTS (
      SELECT 1
      FROM public.tb_ruta_operacion_caja rc
      WHERE rc.id_empresa = v_caja.id_empresa
        AND rc.id_empresa_cuenta_bancaria = v_caja.id_empresa_cuenta_bancaria
        AND LOWER(rc.ruta) = LOWER(COALESCE(op.ruta_destino, op.ruta_origen))
       AND rc.id_estado = 1
      );

  SELECT
    COALESCE(SUM(
      GREATEST(
        COALESCE(op.resultado_comision_banco_ingreso, 0)
        + COALESCE(op.resultado_comision_banco_salida, 0)
        - COALESCE(mov.gastos, 0),
        0
      )
    ), 0),
    COALESCE(SUM(
      GREATEST(
        CASE
          WHEN UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) IN (
            'RETORNO', 'RETORNO_DIRECTO', 'DIRECTO_CAJA'
          ) THEN 0
          ELSE GREATEST(
            COALESCE(op.monto_deposito_cliente, 0)
            - COALESCE(
                op.monto_transferencia_cliente,
                GREATEST(
                  COALESCE(op.monto_deposito_cliente, 0)
                  - COALESCE(op.resultado_comision_servicio, 0),
                  0
                )
              )
            - COALESCE(op.resultado_comision_banco_ingreso, 0)
            - COALESCE(op.resultado_comision_banco_salida, 0),
            0
          )
        END
        - COALESCE(mov.ganancias, 0),
        0
      )
    ), 0)
  INTO v_gastos_fuera_horario, v_ganancias_fuera_horario
  FROM public.tb_operacion_proceso op
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(oc.monto_gasto), 0) AS gastos,
      COALESCE(SUM(oc.monto_ganancia), 0) AS ganancias
    FROM public.tb_operacion_caja oc
    WHERE oc.id_operacion_proceso = op.id
      AND oc.id_caja_cierre IS NULL
  ) mov ON true
  WHERE COALESCE(op.flag_fuera_horario, false) = true
    AND COALESCE(op.flag_retenido, false) = false
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
    AND op.id_caja_cierre IS NULL
    AND op.id_empresa_ingreso = v_caja.id_empresa
    AND op.id_empresa_cuenta_ingreso = v_caja.id_empresa_cuenta_bancaria
    AND EXISTS (
      SELECT 1
      FROM public.tb_ruta_operacion_caja rc
      WHERE rc.id_empresa = v_caja.id_empresa
        AND rc.id_empresa_cuenta_bancaria = v_caja.id_empresa_cuenta_bancaria
        AND LOWER(rc.ruta) = LOWER(COALESCE(op.ruta_destino, op.ruta_origen))
        AND rc.id_estado = 1
    )
    ;

  SELECT COALESCE(SUM(oc.monto_ingreso), 0)
  INTO v_total_recaudado
  FROM public.tb_operacion_caja oc
  LEFT JOIN public.tb_operacion_proceso op
    ON op.id = oc.id_operacion_proceso
  WHERE oc.id_caja = p_id_caja
    AND oc.id_caja_cierre IS NULL
    AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
    AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) <> 'RETENIDO'
    AND COALESCE(op.flag_retenido, false) = false
    AND COALESCE(op.flag_fuera_horario, false) = false
    AND NOT (
      op.id IS NOT NULL
      AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) IN ('PENDIENTE', 'RECHAZADO')
    )
    AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) IN (
      'EFECTIVIZACION',
      'PAGO_DEUDA',
      'PAGO_DEUDA_DEVOLUCION',
      'PAGO_DEUDA_COMISION'
    );

  IF COALESCE(v_ruta_operacion, '') IN (
    'bcp', 'bbva', 'scotiabank', 'banbif', 'interbank', 'safetypay'
  ) THEN
    SELECT to_jsonb(k)
    INTO v_kpi_v2
    FROM public.f_get_tb_ruta_operacion_kpi_operaciones_v2(
      p_ruta := v_ruta_operacion,
      p_id_empresa := v_caja.id_empresa,
      p_id_empresa_cuenta_bancaria := v_caja.id_empresa_cuenta_bancaria,
      p_id_caja := p_id_caja
    ) AS k
    LIMIT 1;
  END IF;

  v_kpi_snapshot := COALESCE(
    p_kpi_snapshot,
    jsonb_build_object(
      'saldo_inicial', v_caja.saldo_inicial,
      'saldo_total', v_caja.saldo_total,
      'total_recaudado', v_total_recaudado,
      'ingresos', COALESCE(v_caja.ingresos, 0),
      'ingresos_retenido', COALESCE(v_caja.ingresos_retenido, 0),
      'fuera_horario', v_fuera_horario_abiertos,
       'gastos', COALESCE(v_caja.gastos, 0) + COALESCE(v_gastos_fuera_horario, 0),
       'ganancia', COALESCE(v_caja.ganancia, 0) + COALESCE(v_ganancias_fuera_horario, 0),
      'ganancia_retenido', COALESCE(v_caja.ganancia_retenido, 0),
      'salida', COALESCE(v_caja.salida, 0),
      'operaciones', COALESCE(v_caja.operaciones, 0)
    )
  ) || jsonb_build_object(
    'total_recaudado', v_total_recaudado,
    'ingresos_retenidos', v_ingresos_retenidos_abiertos,
    'ingresos_retenido', v_ingresos_retenidos_abiertos,
     'fuera_horario', v_fuera_horario_abiertos,
     'gastos', COALESCE(v_caja.gastos, 0) + COALESCE(v_gastos_fuera_horario, 0),
     'ganancia', COALESCE(v_caja.ganancia, 0) + COALESCE(v_ganancias_fuera_horario, 0),
     'ganancias', COALESCE(v_caja.ganancia, 0)
       + COALESCE(v_caja.ganancia_retenido, 0)
      + COALESCE(v_ganancias_fuera_horario, 0)
  );

  IF v_kpi_v2 IS NOT NULL THEN
    v_kpi_snapshot := v_kpi_snapshot || jsonb_build_object(
      'saldo_inicial', COALESCE((v_kpi_v2->>'caja_inicial')::numeric, v_caja.saldo_inicial),
      'saldo_total', COALESCE((v_kpi_v2->>'caja_actual')::numeric, v_caja.saldo_total),
      'saldo_actual', COALESCE((v_kpi_v2->>'caja_actual')::numeric, v_caja.saldo_actual),
      'total_recaudado', COALESCE((v_kpi_v2->>'total_recaudado')::numeric, 0),
      'ingresos', COALESCE((v_kpi_v2->>'ingresos')::numeric, 0),
      'ingresos_retenidos', COALESCE((v_kpi_v2->>'ingresos_retenidos')::numeric, 0),
      'ingresos_retenido', COALESCE((v_kpi_v2->>'ingresos_retenidos')::numeric, 0),
      'gastos', COALESCE((v_kpi_v2->>'gastos_operacionales')::numeric, 0),
      'ganancia', COALESCE((v_kpi_v2->>'ganancias')::numeric, 0),
      'ganancias', COALESCE((v_kpi_v2->>'ganancias')::numeric, 0),
      'salida', COALESCE((v_kpi_v2->>'salidas')::numeric, 0),
      'fuera_horario', 0,
      'pendiente_transferencia', COALESCE((v_kpi_v2->>'pendiente_transferencia')::numeric, 0)
    );
  END IF;

  INSERT INTO public.tb_caja_operativa_cierre (
    id_caja,
    id_empresa,
    id_empresa_cuenta_bancaria,
    saldo_inicial,
    saldo_total,
    saldo_actual,
    total_recaudado,
    ingresos,
    ingresos_retenido,
    fuera_horario,
    gastos,
    ganancia,
    ganancia_retenido,
    salida,
    operaciones,
    id_estado,
    id_usuario,
    fecha_apertura,
    fecha_cierre,
    kpi_snapshot
  )
  VALUES (
    v_caja.id,
    v_caja.id_empresa,
    v_caja.id_empresa_cuenta_bancaria,
    COALESCE((v_kpi_v2->>'caja_inicial')::numeric, v_caja.saldo_inicial),
    COALESCE((v_kpi_v2->>'caja_actual')::numeric, v_caja.saldo_total),
    COALESCE((v_kpi_v2->>'caja_actual')::numeric, v_caja.saldo_actual),
    COALESCE((v_kpi_v2->>'total_recaudado')::numeric, v_total_recaudado),
    COALESCE((v_kpi_v2->>'ingresos')::numeric, v_caja.ingresos),
    COALESCE((v_kpi_v2->>'ingresos_retenidos')::numeric, v_ingresos_retenidos_abiertos),
    CASE WHEN v_kpi_v2 IS NULL THEN COALESCE(v_fuera_horario_abiertos, 0) ELSE 0 END,
    COALESCE((v_kpi_v2->>'gastos_operacionales')::numeric, COALESCE(v_caja.gastos, 0) + COALESCE(v_gastos_fuera_horario, 0)),
    COALESCE((v_kpi_v2->>'ganancias')::numeric, COALESCE(v_caja.ganancia, 0) + COALESCE(v_ganancias_fuera_horario, 0)),
    COALESCE(v_caja.ganancia_retenido, 0),
    COALESCE((v_kpi_v2->>'salidas')::numeric, v_caja.salida),
    COALESCE(v_caja.operaciones, 0),
    COALESCE(p_id_estado, v_caja.id_estado),
    COALESCE(p_id_usuario, v_caja.id_usuario),
    v_caja.fecha_apertura,
    v_fecha_cierre,
    v_kpi_snapshot
  )
  RETURNING id INTO v_historial_id;

  -- La nueva via de KPI conserva por separado el ciclo del deposito y el
  -- ciclo de la salida. El snapshot y el cierre legado permanecen intactos.
  PERFORM public.f_sync_tb_operacion_cierre_atribucion_v2(
    p_id_caja := p_id_caja,
    p_id_caja_cierre := v_historial_id,
    p_fecha_cierre := v_fecha_cierre
  );

  UPDATE public.tb_operacion_proceso op
  SET id_caja_cierre = v_historial_id,
      fecha_caja_cierre = v_fecha_cierre
  WHERE op.id_caja_cierre IS NULL
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
    AND COALESCE(op.flag_retenido, false) = false
    AND (
      (
        op.id_empresa_ingreso = v_caja.id_empresa
        AND op.id_empresa_cuenta_ingreso = v_caja.id_empresa_cuenta_bancaria
      )
      OR (
        op.id_empresa_salida = v_caja.id_empresa
        AND op.id_empresa_cuenta_salida = v_caja.id_empresa_cuenta_bancaria
      )
    );

  GET DIAGNOSTICS v_operaciones_congeladas = ROW_COUNT;

  -- Pago Deuda BANCO: el paso 2 permanece abierto para la caja viva siguiente.
  -- Los pasos 3 y 4 ya no requieren atencion del area de pagos y se congelan
  -- en el cierre correspondiente, aunque su estado tecnico siga PROCESADO.
  UPDATE public.tb_operacion_proceso op
  SET id_caja_cierre = v_historial_id,
      fecha_caja_cierre = v_fecha_cierre
  WHERE op.id_caja_cierre IS NULL
    AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) = 'BANCO'
    AND (
      UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'DEVUELTO'
      OR (
        UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PROCESADO'
        AND (
          op.id_operacion_match IS NOT NULL
          OR COALESCE(op.monto_devuelto, 0) >= COALESCE(op.monto_deposito_cliente, 0)
          OR EXISTS (
            SELECT 1
            FROM public.tb_operacion_caja c
            WHERE c.id_operacion_proceso = op.id_operacion_padre
              AND UPPER(BTRIM(COALESCE(c.tipo_origen, ''))) = 'PAGO_DEUDA_COMISION'
          )
        )
      )
    )
    AND (
      (
        op.id_empresa_ingreso = v_caja.id_empresa
        AND op.id_empresa_cuenta_ingreso = v_caja.id_empresa_cuenta_bancaria
      )
      OR (
        op.id_empresa_salida = v_caja.id_empresa
        AND op.id_empresa_cuenta_salida = v_caja.id_empresa_cuenta_bancaria
      )
    );

  GET DIAGNOSTICS v_operaciones_retenidas_congeladas = ROW_COUNT;
  v_operaciones_congeladas := v_operaciones_congeladas + v_operaciones_retenidas_congeladas;

  -- Las retenciones finalizadas pertenecen al cierre. Las operaciones que
  -- aun requieren atencion permanecen abiertas para la caja viva siguiente.
  UPDATE public.tb_operacion_proceso op
  SET id_caja_cierre = v_historial_id,
      fecha_caja_cierre = v_fecha_cierre
  WHERE op.id_caja_cierre IS NULL
    AND COALESCE(op.flag_retenido, false) = true
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) NOT IN (
      'PENDIENTE', 'RECHAZADO', 'SOLICITADO', 'PROCESADO', 'ELIMINADO'
    )
    AND (
      (
        op.id_empresa_ingreso = v_caja.id_empresa
        AND op.id_empresa_cuenta_ingreso = v_caja.id_empresa_cuenta_bancaria
      )
      OR (
        op.id_empresa_salida = v_caja.id_empresa
        AND op.id_empresa_cuenta_salida = v_caja.id_empresa_cuenta_bancaria
      )
    );

  GET DIAGNOSTICS v_operaciones_retenidas_congeladas = ROW_COUNT;
  v_operaciones_congeladas := v_operaciones_congeladas + v_operaciones_retenidas_congeladas;

  UPDATE public.tb_operacion_proceso op
  SET id_caja_cierre = v_historial_id,
      fecha_caja_cierre = v_fecha_cierre
  WHERE op.id_caja_cierre IS NULL
    AND COALESCE(op.flag_fuera_horario, false) = true
    AND COALESCE(op.flag_retenido, false) = false
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) NOT IN (
      'PENDIENTE', 'RECHAZADO', 'SOLICITADO', 'PROCESADO', 'ELIMINADO'
    )
    AND (
      (
        op.id_empresa_ingreso = v_caja.id_empresa
        AND op.id_empresa_cuenta_ingreso = v_caja.id_empresa_cuenta_bancaria
      )
      OR (
        op.id_empresa_salida = v_caja.id_empresa
        AND op.id_empresa_cuenta_salida = v_caja.id_empresa_cuenta_bancaria
      )
    );

  GET DIAGNOSTICS v_operaciones_retenidas_congeladas = ROW_COUNT;
  v_operaciones_congeladas := v_operaciones_congeladas + v_operaciones_retenidas_congeladas;

  UPDATE public.tb_operacion_caja oc
  SET id_caja_cierre = v_historial_id,
      fecha_caja_cierre = v_fecha_cierre
  FROM public.tb_operacion_proceso op
  WHERE oc.id_caja_cierre IS NULL
    AND oc.id_caja = p_id_caja
    AND oc.id_operacion_proceso = op.id
    AND op.id_caja_cierre = v_historial_id
    AND NOT (
      COALESCE(op.flag_retenido, false) = true
      AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
    );

  GET DIAGNOSTICS v_movimientos_congelados = ROW_COUNT;

  UPDATE public.tb_operacion_caja oc
  SET id_caja_cierre = v_historial_id,
      fecha_caja_cierre = v_fecha_cierre
  WHERE oc.id_caja_cierre IS NULL
    AND oc.id_caja = p_id_caja
    AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) = 'CONFIRMADO';

  GET DIAGNOSTICS v_movimientos_confirmados = ROW_COUNT;
  v_movimientos_congelados := v_movimientos_congelados + v_movimientos_confirmados;

  -- El movimiento de ingreso de una retencion pertenece al cierre donde se
  -- genero, aunque la operacion continue pendiente. La operacion permanece
  -- abierta para atencion, pero su ingreso no pasa a la caja viva siguiente.
  UPDATE public.tb_operacion_caja oc
  SET id_caja_cierre = v_historial_id,
      fecha_caja_cierre = v_fecha_cierre
  FROM public.tb_operacion_proceso op
  WHERE oc.id_caja_cierre IS NULL
    AND oc.id_caja = p_id_caja
    AND oc.id_operacion_proceso = op.id
    AND COALESCE(op.flag_retenido, false) = true
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
    AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO';

  GET DIAGNOSTICS v_movimientos_salida_retenidos = ROW_COUNT;
  v_movimientos_congelados := v_movimientos_congelados + v_movimientos_salida_retenidos;

  -- El ingreso de una efectivizacion pendiente tambien pertenece al cierre
  -- donde fue registrado. La operacion queda abierta para ser atendida en el
  -- siguiente ciclo, pero el movimiento no debe alimentar su recaudacion.
  UPDATE public.tb_operacion_caja oc
  SET id_caja_cierre = v_historial_id,
      fecha_caja_cierre = v_fecha_cierre
  FROM public.tb_operacion_proceso op
  WHERE oc.id_caja_cierre IS NULL
    AND oc.id_caja = p_id_caja
    AND oc.id_operacion_proceso = op.id
    AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) = 'EFECTIVIZACION'
    AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) IN ('PENDIENTE', 'RECHAZADO')
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO';

  GET DIAGNOSTICS v_movimientos_abiertos = ROW_COUNT;
  v_movimientos_congelados := v_movimientos_congelados + v_movimientos_abiertos;

  -- Congelar cualquier movimiento abierto restante de la caja, incluidos
  -- movimientos manuales OTROS y TRANSFERENCIA INTERNA sin proceso asociado.
  -- Los ingresos retenidos ya fueron congelados en el bloque anterior.
  UPDATE public.tb_operacion_caja oc
  SET id_caja_cierre = v_historial_id,
      fecha_caja_cierre = v_fecha_cierre
  WHERE oc.id_caja_cierre IS NULL
    AND oc.id_caja = p_id_caja
    AND NOT (
      UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
      AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) = 'RETENIDO'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tb_operacion_proceso op
      WHERE op.id = oc.id_operacion_proceso
        AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) IN ('PENDIENTE', 'RECHAZADO')
    );

  GET DIAGNOSTICS v_movimientos_abiertos = ROW_COUNT;
  v_movimientos_congelados := v_movimientos_congelados + v_movimientos_abiertos;

  SELECT
    COALESCE(SUM(COALESCE(oc.monto_ingreso, 0)), 0),
    COALESCE(SUM(COALESCE(oc.monto_ganancia, 0)), 0)
  INTO v_ingresos_retenidos_abiertos, v_ganancia_retenida_abierta
  FROM public.tb_operacion_caja oc
  WHERE oc.id_caja = p_id_caja
    AND oc.id_caja_cierre IS NULL
    AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
    AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) = 'RETENIDO';

  UPDATE public.tb_caja_operativa
  SET saldo_inicial = 0,
      saldo_actual = 0,
      saldo_total = 0,
      total_recaudado = 0,
      ingresos = 0,
      ingresos_retenido = 0,
      fuera_horario = 0,
      gastos = 0,
      ganancia = 0,
      ganancia_retenido = 0,
      salida = 0,
      operaciones = 0,
      id_usuario = COALESCE(p_id_usuario, id_usuario),
      fecha_apertura = now()
  WHERE id = p_id_caja;

  SELECT to_jsonb(x)
  INTO v_result
  FROM public.f_get_tb_caja_operativa_cierre(p_id := v_historial_id) AS x
  LIMIT 1;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(r.ruta, COALESCE(p_id_usuario, v_caja.id_usuario))
  FROM (
    SELECT DISTINCT rc.ruta
    FROM public.tb_ruta_operacion_caja rc
    WHERE rc.id_empresa = v_caja.id_empresa
      AND rc.id_empresa_cuenta_bancaria = v_caja.id_empresa_cuenta_bancaria
  ) r;

  RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object(
    'operaciones_congeladas', v_operaciones_congeladas,
    'movimientos_congelados', v_movimientos_congelados
  );
END;
$$;

-- f_post_tb_caja_operativa_cierre_ruta
CREATE OR REPLACE FUNCTION public.f_post_tb_caja_operativa_cierre_ruta(
  p_rutas character varying[],
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caja record;
  v_cierre jsonb;
  v_cierres jsonb := '[]'::jsonb;
  v_cajas_cerradas integer := 0;
BEGIN
  IF COALESCE(array_length(p_rutas, 1), 0) = 0 THEN
    RETURN jsonb_build_object('error', 'No se especificaron rutas para cerrar.');
  END IF;

  FOR v_caja IN
    SELECT c.id AS id_caja
    FROM public.tb_caja_operativa c
    JOIN public.tb_ruta_operacion_caja rc
      ON rc.id_empresa = c.id_empresa
     AND rc.id_empresa_cuenta_bancaria = c.id_empresa_cuenta_bancaria
    WHERE c.id_estado = 1
      AND rc.id_estado = 1
      AND LOWER(BTRIM(rc.ruta)) IN (
        SELECT LOWER(BTRIM(ruta))
        FROM unnest(p_rutas) AS rutas(ruta)
      )
    GROUP BY c.id
    ORDER BY c.id
  LOOP
    v_cierre := public.f_post_tb_caja_operativa_cierre(
      p_id_caja := v_caja.id_caja,
      p_id_usuario := p_id_usuario,
      p_kpi_snapshot := NULL
    );

    IF v_cierre ? 'error' THEN
      RAISE EXCEPTION 'No se pudo cerrar la caja %: %', v_caja.id_caja, v_cierre->>'error';
    END IF;

    v_cierres := v_cierres || jsonb_build_array(v_cierre);
    v_cajas_cerradas := v_cajas_cerradas + 1;
  END LOOP;

  IF v_cajas_cerradas = 0 THEN
    RETURN jsonb_build_object(
      'error', 'No existen cajas operativas activas para las rutas indicadas.'
    );
  END IF;

  RETURN jsonb_build_object(
    'rutas', to_jsonb(p_rutas),
    'cajas_cerradas', v_cajas_cerradas,
    'cierres', v_cierres
  );
END;
$$;

-- f_delete_tb_caja_operativa_cierre_ultimo_dia
CREATE OR REPLACE FUNCTION public.f_delete_tb_caja_operativa_cierre_ultimo_dia(
  p_id_caja bigint,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cierre record;
  v_caja record;
  v_operaciones_reabiertas integer := 0;
  v_movimientos_reabiertos integer := 0;
  v_retenciones_revertidas integer := 0;
BEGIN
  SELECT ch.*
  INTO v_cierre
  FROM public.tb_caja_operativa_cierre ch
  WHERE ch.id_caja = p_id_caja
  ORDER BY ch.fecha_cierre DESC, ch.id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_cierre.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No existe un cierre para reabrir.');
  END IF;

  IF (v_cierre.fecha_cierre AT TIME ZONE 'America/Lima')::date
      <> (now() AT TIME ZONE 'America/Lima')::date THEN
    RETURN jsonb_build_object('error', 'Solo se puede reabrir el ultimo cierre del dia actual.');
  END IF;

  SELECT *
  INTO v_caja
  FROM public.tb_caja_operativa
  WHERE id = p_id_caja
  LIMIT 1
  FOR UPDATE;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La caja no existe.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja oc
    WHERE oc.id_caja = p_id_caja
      AND oc.id_caja_cierre IS NULL
      AND oc.fecha_registro > v_cierre.fecha_cierre
      AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) <> 'GASTO OPERACIONAL CIERRE'
  ) THEN
    RETURN jsonb_build_object('error', 'No se puede reabrir el cierre porque existen movimientos posteriores en la caja.');
  END IF;

  -- El movimiento administrativo se elimina junto con el ultimo cierre,
  -- despues de validar que no existan movimientos operativos posteriores.
  DELETE FROM public.tb_operacion_caja
  WHERE id_caja = p_id_caja
    AND id_caja_cierre IS NULL
    AND UPPER(BTRIM(COALESCE(tipo_origen, ''))) = 'GASTO OPERACIONAL CIERRE'
    AND fecha_registro >= v_cierre.fecha_cierre;

  v_retenciones_revertidas := 0;

  UPDATE public.tb_operacion_proceso
  SET id_caja_cierre = NULL,
      fecha_caja_cierre = NULL,
      id_caja_cierre_ingreso = NULL,
      id_caja_cierre_salida = NULL
  WHERE id_caja_cierre = v_cierre.id
     OR id_caja_cierre_ingreso = v_cierre.id
     OR id_caja_cierre_salida = v_cierre.id;

  GET DIAGNOSTICS v_operaciones_reabiertas = ROW_COUNT;

  UPDATE public.tb_operacion_caja
  SET id_caja_cierre = NULL,
      fecha_caja_cierre = NULL
  WHERE id_caja_cierre = v_cierre.id;

  GET DIAGNOSTICS v_movimientos_reabiertos = ROW_COUNT;

  UPDATE public.tb_caja_operativa
  SET saldo_inicial = v_cierre.saldo_inicial,
      saldo_total = v_cierre.saldo_total,
      saldo_actual = v_cierre.saldo_actual,
      total_recaudado = v_cierre.total_recaudado,
      ingresos = v_cierre.ingresos,
      ingresos_retenido = v_cierre.ingresos_retenido,
      fuera_horario = COALESCE(v_cierre.fuera_horario, 0),
      gastos = v_cierre.gastos,
      ganancia = v_cierre.ganancia,
      ganancia_retenido = v_cierre.ganancia_retenido,
      salida = v_cierre.salida,
      operaciones = v_cierre.operaciones,
      id_usuario = COALESCE(p_id_usuario, id_usuario),
      fecha_apertura = v_cierre.fecha_apertura
  WHERE id = p_id_caja;

  DELETE FROM public.tb_caja_operativa_cierre
  WHERE id = v_cierre.id;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(r.ruta, COALESCE(p_id_usuario, v_cierre.id_usuario))
  FROM (
    SELECT DISTINCT rc.ruta
    FROM public.tb_ruta_operacion_caja rc
    WHERE rc.id_empresa = v_cierre.id_empresa
      AND rc.id_empresa_cuenta_bancaria = v_cierre.id_empresa_cuenta_bancaria
  ) r;

  RETURN jsonb_build_object(
    'id_cierre_reabierto', v_cierre.id,
    'id_caja', p_id_caja,
    'operaciones_reabiertas', v_operaciones_reabiertas,
    'movimientos_reabiertos', v_movimientos_reabiertos,
    'retenciones_revertidas', v_retenciones_revertidas
  );
END;
$$;

-- f_get_reporte_cierre
CREATE OR REPLACE FUNCTION public.f_get_reporte_cierre(
  p_id_caja bigint,
  p_id_empresa bigint DEFAULT NULL,
  p_ruta character varying DEFAULT NULL,
  p_id_caja_cierre bigint DEFAULT NULL,
  p_fecha_cierre date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caja record;
  v_ruta character varying;
  v_nombre_empresa character varying;
  v_nombre_banco character varying;
  v_result jsonb;
  v_efectivizacion jsonb;
  v_efectivizacion_todas jsonb;
  v_efectivizacion_pendientes jsonb;
  v_derivados jsonb;
  v_derivados_todos jsonb;
  v_derivados_pendientes jsonb;
  v_pago_deuda jsonb;
  v_pago_deuda_todos jsonb;
  v_pago_deuda_pendientes jsonb;
  v_pos jsonb;
  v_pos_todas jsonb;
  v_pos_pendientes jsonb;
  v_movimientos jsonb;
  v_retenciones jsonb;
  v_retenciones_pagadas jsonb;
  v_retenciones_pendientes jsonb;
  v_kpi jsonb;
  v_fecha_cierre_ts timestamp with time zone;
  v_cierre_id bigint;
  v_reporte_desde timestamp with time zone;
  v_reporte_hasta timestamp with time zone;
BEGIN
  SELECT *
  INTO v_caja
  FROM public.tb_caja_operativa
  WHERE id = p_id_caja
  LIMIT 1;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La caja no existe.');
  END IF;

  SELECT rc.ruta, e.nombre, b.nombre
  INTO v_ruta, v_nombre_empresa, v_nombre_banco
  FROM public.tb_ruta_operacion_caja rc
  JOIN public.tb_empresa e ON e.id = v_caja.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = v_caja.id_empresa_cuenta_bancaria
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  WHERE rc.id_empresa = v_caja.id_empresa
    AND rc.id_empresa_cuenta_bancaria = v_caja.id_empresa_cuenta_bancaria
  LIMIT 1;

  v_ruta := COALESCE(p_ruta, v_ruta);

  SELECT id, fecha_cierre
  INTO v_cierre_id, v_fecha_cierre_ts
  FROM public.tb_caja_operativa_cierre
  WHERE (p_id_caja_cierre IS NOT NULL AND id = p_id_caja_cierre)
     OR (
       p_id_caja_cierre IS NULL
       AND id_caja = p_id_caja
       AND (fecha_cierre AT TIME ZONE 'America/Lima')::date = p_fecha_cierre
     )
  ORDER BY fecha_cierre DESC
  LIMIT 1;

  IF v_cierre_id IS NOT NULL THEN
    v_reporte_desde := (
      COALESCE(p_fecha_cierre, (v_fecha_cierre_ts AT TIME ZONE 'America/Lima')::date)::timestamp
      AT TIME ZONE 'America/Lima'
    );
    v_reporte_hasta := v_reporte_desde + interval '1 day' - interval '1 microsecond';
  END IF;

  -- EFECTIVIZACION: la bandeja unificada es la fuente de filas para evitar
  -- mezclar operaciones de otros cierres. Se conserva el calculo historico
  -- de gastos y ganancias del reporte.
  SELECT COALESCE(jsonb_agg(x ORDER BY operacion), '[]'::jsonb)
  INTO v_efectivizacion_todas
  FROM (
    SELECT
      op.tipo_facturacion AS facturacion,
      op.codigo_operacion_deposito_cliente AS operacion,
      op.dni_cliente AS dni,
      op.nombre_comunidad AS comunidad,
      COALESCE(op.monto_deposito_cliente, 0) AS deposito,
      COALESCE(op.comision_servicio, 0) AS porcentaje_comision,
      COALESCE(op.resultado_comision_servicio, 0) AS soles_comision,
      CASE
        WHEN COALESCE(caja.movimientos, 0) > 0 THEN COALESCE(caja.monto_gasto, 0)
        WHEN UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) IN ('DIRECTO_CAJA', 'RETORNO', 'RETORNO_DIRECTO') THEN 0
        ELSE COALESCE(op.resultado_comision_banco_ingreso, 0)
          + CASE
              WHEN UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
               AND (
                 v_cierre_id IS NULL
                 OR op.id_caja_cierre_salida = v_cierre_id
                 OR (op.id_caja_cierre = v_cierre_id AND op.id_caja_cierre_ingreso IS NULL)
               )
              THEN COALESCE(op.resultado_comision_banco_salida, 0)
              ELSE 0
            END
      END AS gastos,
      CASE
        WHEN COALESCE(caja.movimientos, 0) > 0 THEN COALESCE(caja.monto_ganancia, 0)
        WHEN UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) IN ('DIRECTO_CAJA', 'RETORNO', 'RETORNO_DIRECTO') THEN 0
        ELSE COALESCE(op.monto_deposito_cliente, 0)
          - COALESCE(op.monto_transferencia_cliente, 0)
          - COALESCE(op.resultado_comision_banco_ingreso, 0)
          - COALESCE(op.resultado_comision_banco_salida, 0)
      END AS ganancia,
      CASE
        WHEN op.flag_derivado = true
         AND LOWER(COALESCE(op.ruta_origen, '')) = LOWER(COALESCE(p_ruta, v_ruta))
        THEN 0
        ELSE COALESCE(op.monto_transferencia_cliente, 0)
      END AS transferencia,
      (
        op.flag_derivado = true
        AND LOWER(COALESCE(op.ruta_origen, '')) = LOWER(COALESCE(p_ruta, v_ruta))
      ) AS derivada_congelada,
      COALESCE(op.flag_fuera_horario, false) AS fuera_horario,
      op.nombre_estado AS estado,
      op.fecha_deposito_cliente AS fecha
    FROM public.f_get_tb_operacion_bandeja_unificada(
      p_tab := 'UNIFICADO',
      p_ruta := COALESCE(p_ruta, v_ruta),
      p_id_empresa := p_id_empresa,
      p_id_empresa_cuenta_bancaria := v_caja.id_empresa_cuenta_bancaria,
      p_filtro_estado := 'TODOS',
      p_fecha_caja_cierre_desde := v_reporte_desde,
      p_fecha_caja_cierre_hasta := v_reporte_hasta
    ) AS unified(operation_json)
    JOIN public.tb_operacion_proceso op
      ON op.id = NULLIF(unified.operation_json->>'id', '')::bigint
    LEFT JOIN LATERAL (
      SELECT
        COUNT(oc.id) AS movimientos,
        SUM(COALESCE(oc.monto_gasto, 0)) AS monto_gasto,
        SUM(COALESCE(oc.monto_ganancia, 0)) AS monto_ganancia
      FROM public.tb_operacion_caja oc
      WHERE oc.id_operacion_proceso = op.id
        AND UPPER(COALESCE(oc.tipo_origen, '')) <> 'PAGO_DEUDA_COMISION'
    ) caja ON true
    WHERE UPPER(COALESCE(op.tipo_servicio, '')) = 'EFECTIVIZACION'
      AND (
        v_cierre_id IS NULL
        OR op.id_caja_cierre = v_cierre_id
        OR op.id_caja_cierre_ingreso = v_cierre_id
        OR op.id_caja_cierre_salida = v_cierre_id
      )
  ) x;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'operacion'), '[]'::jsonb)
  INTO v_efectivizacion
  FROM jsonb_array_elements(v_efectivizacion_todas) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) = 'PAGADO';

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'operacion'), '[]'::jsonb)
  INTO v_efectivizacion_pendientes
  FROM jsonb_array_elements(v_efectivizacion_todas) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) <> 'PAGADO';

  -- DERIVADOS: operaciones que la ruta actual debe atender
  SELECT COALESCE(jsonb_agg(x ORDER BY operacion), '[]'::jsonb)
  INTO v_derivados_todos
  FROM (
    SELECT
      op.tipo_facturacion AS facturacion,
      op.ruta_origen AS derivo,
      op.codigo_operacion_deposito_cliente AS operacion,
      op.dni_cliente AS dni,
      op.nombre_comunidad AS comunidad,
      op.nombre_banco_empresa_cuenta_salida AS cuenta_cliente,
      COALESCE(op.monto_deposito_cliente, 0) AS monto,
      COALESCE(op.resultado_comision_servicio, 0) AS soles_comision,
      COALESCE(op.comision_servicio, 0) AS porcentaje_comision,
      COALESCE(op.monto_transferencia_cliente, 0) AS transferencia,
      COALESCE(op.flag_fuera_horario, false) AS fuera_horario,
      op.nombre_estado AS estado,
      op.fecha_deposito_cliente AS fecha
    FROM public.tb_operacion_proceso op
    WHERE UPPER(COALESCE(op.tipo_servicio, '')) = 'EFECTIVIZACION'
      AND op.id_estado <> 10
      AND op.flag_derivado = true
      AND LOWER(COALESCE(op.ruta_destino, '')) = LOWER(COALESCE(p_ruta, v_ruta))
      AND (p_id_empresa IS NULL OR op.id_empresa_salida = p_id_empresa)
      AND (v_caja.id_empresa_cuenta_bancaria IS NULL OR op.id_empresa_cuenta_salida = v_caja.id_empresa_cuenta_bancaria)
      AND (
        (p_fecha_cierre IS NULL AND op.id_caja_cierre IS NULL)
        OR (v_cierre_id IS NOT NULL AND (
          op.id_caja_cierre_ingreso = v_cierre_id
          OR op.id_caja_cierre_salida = v_cierre_id
          OR op.id_caja_cierre IN (
          SELECT id FROM public.tb_caja_operativa_cierre
          WHERE id_caja = p_id_caja
            AND (fecha_cierre AT TIME ZONE 'America/Lima')::date = p_fecha_cierre
          )
        ))
      )
  ) x;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'operacion'), '[]'::jsonb)
  INTO v_derivados
  FROM jsonb_array_elements(v_derivados_todos) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) = 'PAGADO';

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'operacion'), '[]'::jsonb)
  INTO v_derivados_pendientes
  FROM jsonb_array_elements(v_derivados_todos) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) <> 'PAGADO';

  -- PAGO DEUDA: operaciones de tipo pago deuda
  SELECT COALESCE(jsonb_agg(x ORDER BY operacion), '[]'::jsonb)
  INTO v_pago_deuda_todos
  FROM (
    SELECT
      op.codigo_operacion_deposito_cliente AS operacion,
      op.dni_cliente AS dni,
      op.nombre_empresa_salida AS empresa_salida,
      op.nombre_banco_empresa_cuenta_salida AS cuenta_salida,
      COALESCE(op.monto_transferencia_cliente, op.monto_deposito_cliente, 0) AS monto_transferencia,
      COALESCE(op.monto_transferencia_cliente, op.monto_deposito_cliente, 0) AS transferencia,
      COALESCE(pago_retorno.nombre_empresa_ingreso, op.nombre_empresa_ingreso) AS empresa_ingreso,
      COALESCE(pago_retorno.nombre_banco_empresa_cuenta_ingreso, op.nombre_banco_empresa_cuenta_ingreso) AS cuenta_ingreso,
      COALESCE(pago_retorno.monto_devolucion, op.monto_devuelto, 0) AS deposito,
      COALESCE(op.comision_servicio, 0) AS porcentaje_comision,
      COALESCE(op.resultado_comision_servicio, 0) AS soles_comision,
      COALESCE(op.flag_fuera_horario, false) AS fuera_horario,
      op.nombre_estado AS estado,
      COALESCE(op.fecha_pagado, op.fecha_registro) AS fecha
    FROM public.tb_operacion_proceso op
    LEFT JOIN LATERAL (
      SELECT
        (ARRAY_AGG(r.nombre_empresa_ingreso ORDER BY r.fecha_deposito_cliente NULLS LAST, r.fecha_registro NULLS LAST, r.id))[1] AS nombre_empresa_ingreso,
        (ARRAY_AGG(r.nombre_banco_empresa_cuenta_ingreso ORDER BY r.fecha_deposito_cliente NULLS LAST, r.fecha_registro NULLS LAST, r.id))[1] AS nombre_banco_empresa_cuenta_ingreso,
        SUM(COALESCE(r.monto_deposito_cliente, r.monto_transferencia_cliente, 0)) AS monto_devolucion
      FROM public.tb_operacion_proceso r
      WHERE UPPER(COALESCE(r.tipo_flujo_pago_deuda, '')) = 'RETORNO'
        AND (
          r.id = op.id_operacion_match
          OR r.id_operacion_match = op.id
          OR r.id_operacion_padre = op.id
        )
    ) pago_retorno ON true
    WHERE UPPER(COALESCE(op.tipo_servicio, '')) = 'PAGO DEUDA'
      AND COALESCE(op.flag_retenido, false) = false
      AND (COALESCE(op.tipo_flujo_pago_deuda, '') = '' OR UPPER(op.tipo_flujo_pago_deuda) <> 'RETORNO')
      AND (p_id_empresa IS NULL OR op.id_empresa_salida = p_id_empresa)
      AND (
        v_caja.id_empresa_cuenta_bancaria IS NULL
        OR op.id_empresa_cuenta_salida = v_caja.id_empresa_cuenta_bancaria
      )
      AND (p_ruta IS NULL OR op.ruta_destino = p_ruta)
      AND (
        (p_fecha_cierre IS NULL AND op.id_caja_cierre IS NULL)
        OR (v_cierre_id IS NOT NULL AND (
          op.id_caja_cierre_ingreso = v_cierre_id
          OR op.id_caja_cierre_salida = v_cierre_id
          OR op.id_caja_cierre IN (
          SELECT id FROM public.tb_caja_operativa_cierre
          WHERE id_caja = p_id_caja
            AND (fecha_cierre AT TIME ZONE 'America/Lima')::date = p_fecha_cierre
          )
        ))
      )
  ) x;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'operacion'), '[]'::jsonb)
  INTO v_pago_deuda
  FROM jsonb_array_elements(v_pago_deuda_todos) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) = 'PAGADO';

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'operacion'), '[]'::jsonb)
  INTO v_pago_deuda_pendientes
  FROM jsonb_array_elements(v_pago_deuda_todos) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) <> 'PAGADO';

  -- POS: operaciones originadas en POS y atendidas por la caja/ruta bancaria
  SELECT COALESCE(jsonb_agg(x ORDER BY operacion), '[]'::jsonb)
  INTO v_pos_todas
  FROM (
    SELECT
      op.codigo_operacion_deposito_cliente AS operacion,
      op.dni_cliente AS dni,
      op.nombre_empresa_salida AS empresa,
      op.nombre_banco_empresa_cuenta_salida AS cuenta,
      COALESCE(op.monto_deposito_cliente, 0) AS deposito,
      COALESCE(op.comision_servicio, 0) AS porcentaje_comision,
      COALESCE(op.resultado_comision_servicio, 0) AS soles_comision,
      COALESCE(op.monto_transferencia_cliente, 0) AS transferencia,
      COALESCE(op.flag_fuera_horario, false) AS fuera_horario,
      op.nombre_estado AS estado,
      COALESCE(op.fecha_deposito_cliente, op.fecha_registro) AS fecha
    FROM public.tb_operacion_proceso op
    WHERE LOWER(COALESCE(op.ruta_origen, '')) = 'pos'
      AND op.id_estado <> 10
      AND (p_ruta IS NULL OR op.ruta_destino = p_ruta)
      AND (p_id_empresa IS NULL OR op.id_empresa_salida = p_id_empresa)
      AND (
        v_caja.id_empresa_cuenta_bancaria IS NULL
        OR op.id_empresa_cuenta_salida = v_caja.id_empresa_cuenta_bancaria
      )
      AND (
        (p_fecha_cierre IS NULL AND op.id_caja_cierre IS NULL)
        OR (v_cierre_id IS NOT NULL AND (
          op.id_caja_cierre_ingreso = v_cierre_id
          OR op.id_caja_cierre_salida = v_cierre_id
          OR op.id_caja_cierre IN (
          SELECT id FROM public.tb_caja_operativa_cierre
          WHERE id_caja = p_id_caja
            AND (fecha_cierre AT TIME ZONE 'America/Lima')::date = p_fecha_cierre
          )
        ))
      )
  ) x;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'operacion'), '[]'::jsonb)
  INTO v_pos
  FROM jsonb_array_elements(v_pos_todas) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) = 'PAGADO';

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'operacion'), '[]'::jsonb)
  INTO v_pos_pendientes
  FROM jsonb_array_elements(v_pos_todas) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) <> 'PAGADO';

  -- MOVIMIENTOS: solo devolucion de pago deuda, otros y movimiento saldo
  SELECT COALESCE(jsonb_agg(x ORDER BY fecha_registro), '[]'::jsonb)
  INTO v_movimientos
  FROM (
    SELECT
      oc.tipo_origen,
      oc.tipo_movimiento,
      oc.dni_cliente,
      oc.codigo_operacion,
      oc.monto_ingreso,
      oc.monto_salida,
      oc.monto_gasto,
      oc.monto_ganancia,
      oc.detalle,
      oc.tipo_facturacion,
      oc.nombre_empresa,
      oc.nombre_banco,
      related.nombre_empresa AS nombre_empresa_relacionada,
      related.nombre_banco AS nombre_banco_relacionada,
      oc.fecha_registro
    FROM public.tb_operacion_caja oc
    LEFT JOIN public.tb_operacion_caja related
      ON related.id = oc.id_operacion_caja_relacionada
    WHERE oc.id_caja = p_id_caja
      AND REPLACE(UPPER(COALESCE(oc.tipo_origen, '')), '_', ' ') IN (
        'PAGO DEUDA COMISION',
        'OTROS',
        'TRANSFERENCIA INTERNA',
        'GASTO OPERACIONAL CIERRE'
      )
      AND UPPER(COALESCE(oc.nombre_estado, '')) <> 'RETENIDO'
      AND (
        (p_fecha_cierre IS NULL AND oc.id_caja_cierre IS NULL)
        OR (v_fecha_cierre_ts IS NOT NULL AND oc.id_caja_cierre IN (
          SELECT id FROM public.tb_caja_operativa_cierre
          WHERE id_caja = p_id_caja
            AND (fecha_cierre AT TIME ZONE 'America/Lima')::date = p_fecha_cierre
        ))
      )
  ) x;

  -- RETENCIONES: operaciones con flag_retenido = true.
  -- Se conserva el arreglo completo por compatibilidad y se separa por estado
  -- para que los reportes puedan distinguir pagadas de pendientes.
  SELECT COALESCE(jsonb_agg(x ORDER BY codigo_operacion_deposito_cliente), '[]'::jsonb)
  INTO v_retenciones
  FROM (
    SELECT
      op.codigo_operacion_deposito_cliente,
      op.dni_cliente,
      op.nombre_cliente,
      COALESCE(op.monto_transferencia_cliente, op.monto_deposito_cliente, 0) AS monto,
      op.nombre_estado AS estado,
      op.fecha_deposito_cliente,
      rl.fecha_corte AS fecha_corte_recaudacion,
      rl.fecha_estimada_abono,
      rl.fecha_liberacion AS fecha_liberacion_abono,
      false AS flag_liberable_abono,
      op.motivo_retencion,
      op.nombre_usuario_retiene,
      op.fecha_retencion,
      op.fecha_registro
    FROM public.tb_operacion_proceso op
    LEFT JOIN public.tb_recaudacion_lote_operacion rlo ON rlo.id_operacion_proceso = op.id
    LEFT JOIN public.tb_recaudacion_lote rl ON rl.id = rlo.id_lote
    WHERE op.flag_retenido = true
      AND op.id_estado <> 10
      AND (p_id_empresa IS NULL OR op.id_empresa_salida = p_id_empresa)
      AND (p_ruta IS NULL OR op.ruta_destino = p_ruta)
      AND (
        (p_fecha_cierre IS NULL AND op.id_caja_cierre IS NULL)
        OR (v_cierre_id IS NOT NULL AND (
          op.id_caja_cierre_ingreso = v_cierre_id
          OR op.id_caja_cierre_salida = v_cierre_id
          OR op.id_caja_cierre IN (
          SELECT id FROM public.tb_caja_operativa_cierre
          WHERE id_caja = p_id_caja
            AND (fecha_cierre AT TIME ZONE 'America/Lima')::date = p_fecha_cierre
          )
        ))
      )
  ) x;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'codigo_operacion_deposito_cliente'), '[]'::jsonb)
  INTO v_retenciones_pagadas
  FROM jsonb_array_elements(v_retenciones) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) = 'PAGADO';

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'codigo_operacion_deposito_cliente'), '[]'::jsonb)
  INTO v_retenciones_pendientes
  FROM jsonb_array_elements(v_retenciones) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) <> 'PAGADO';

  -- KPI: la descarga debe usar la misma via V2 que la pantalla bancaria.
  IF v_cierre_id IS NOT NULL THEN
    SELECT to_jsonb(k)
    INTO v_kpi
    FROM public.f_get_tb_ruta_operacion_kpi_cierre_operaciones_v2(
      p_id_caja_cierre := v_cierre_id,
      p_ruta := COALESCE(p_ruta, v_ruta),
      p_id_empresa := p_id_empresa,
      p_id_empresa_cuenta_bancaria := v_caja.id_empresa_cuenta_bancaria
    ) AS k;
  ELSE
    SELECT to_jsonb(k)
    INTO v_kpi
    FROM public.f_get_tb_ruta_operacion_kpi_operaciones_v2(
      p_ruta := COALESCE(p_ruta, v_ruta),
      p_id_empresa := p_id_empresa,
      p_id_empresa_cuenta_bancaria := v_caja.id_empresa_cuenta_bancaria,
      p_id_caja := p_id_caja
    ) AS k;
  END IF;

  v_result := jsonb_build_object(
    'empresa', v_nombre_empresa,
    'banco', v_nombre_banco,
    'fecha_cierre', COALESCE(
      v_fecha_cierre_ts,
      (SELECT fecha_cierre FROM public.tb_caja_operativa_cierre WHERE id = p_id_caja_cierre LIMIT 1),
      v_caja.fecha_apertura
    ),
    'kpi', COALESCE(v_kpi, '{}'::jsonb),
    'efectivizacion', v_efectivizacion,
    'efectivizacion_pendientes', COALESCE(v_efectivizacion_pendientes, '[]'::jsonb),
    'derivados', v_derivados,
    'derivados_pendientes', COALESCE(v_derivados_pendientes, '[]'::jsonb),
    'pago_deuda', v_pago_deuda,
    'pago_deuda_pendientes', COALESCE(v_pago_deuda_pendientes, '[]'::jsonb),
    'pos', v_pos,
    'pos_pendientes', COALESCE(v_pos_pendientes, '[]'::jsonb),
    'movimientos', v_movimientos,
    'retenciones', v_retenciones,
    'retenciones_pagadas', COALESCE(v_retenciones_pagadas, '[]'::jsonb),
    'retenciones_pendientes', COALESCE(v_retenciones_pendientes, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

-- f_post_tb_operacion_caja
CREATE OR REPLACE FUNCTION public.f_post_tb_operacion_caja(
  p_id_caja bigint,
  p_tipo_origen character varying,
  p_tipo_movimiento character varying,
  p_id_operacion_caja_relacionada bigint DEFAULT NULL,
  p_id_operacion_proceso bigint DEFAULT NULL,
  p_id_codigo_servicio bigint DEFAULT NULL,
  p_nombre_codigo_servicio character varying DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_nombre_cliente character varying DEFAULT NULL,
  p_codigo_operacion character varying DEFAULT NULL,
  p_id_categoria_movimiento bigint DEFAULT NULL,
  p_nombre_categoria_movimiento character varying DEFAULT NULL,
  p_detalle character varying DEFAULT NULL,
  p_id_banco_tercero bigint DEFAULT NULL,
  p_nombre_banco_tercero character varying DEFAULT NULL,
  p_monto_ingreso numeric DEFAULT 0,
  p_monto_gasto numeric DEFAULT 0,
  p_monto_ganancia numeric DEFAULT 0,
  p_monto_salida numeric DEFAULT 0,
  p_flag_contabiliza_operacion boolean DEFAULT true,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL,
  p_tipo_facturacion character varying DEFAULT 'Boleta'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caja record;
  v_estado_id bigint;
  v_estado_nombre character varying;
  v_estado_retenido_id bigint;
  v_nombre_usuario character varying;
  v_saldo_anterior numeric;
  v_saldo_nuevo numeric;
  v_delta_ingresos numeric := 0;
  v_delta_ingresos_retenido numeric := 0;
  v_delta_total_recaudado numeric := 0;
  v_delta_gastos numeric := 0;
  v_delta_ganancia numeric := 0;
  v_delta_ganancia_retenido numeric := 0;
  v_delta_salida numeric := 0;
  v_delta_operaciones integer := 0;
  v_monto_requerido numeric := 0;
  v_new_id bigint;
BEGIN
  SELECT
    c.id,
    c.id_empresa,
    c.id_empresa_cuenta_bancaria,
    c.saldo_actual,
    e.nombre AS nombre_empresa,
    ecb.id_banco,
    b.nombre AS nombre_banco
  INTO v_caja
  FROM public.tb_caja_operativa c
  JOIN public.tb_empresa e ON e.id = c.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = c.id_empresa_cuenta_bancaria
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  WHERE c.id = p_id_caja
  LIMIT 1
  FOR UPDATE;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La caja no existe.');
  END IF;

  IF p_id_estado IS NOT NULL THEN
    SELECT id, nombre INTO v_estado_id, v_estado_nombre
    FROM public.tb_estado
    WHERE id = p_id_estado
    LIMIT 1;
  ELSE
    SELECT id, nombre INTO v_estado_id, v_estado_nombre
    FROM public.tb_estado
    WHERE UPPER(BTRIM(nombre)) IN ('CONFIRMADO', 'PAGADO', 'PROCESADO', 'ACTIVO')
    ORDER BY CASE UPPER(BTRIM(nombre))
      WHEN 'CONFIRMADO' THEN 1
      WHEN 'PAGADO' THEN 2
      WHEN 'PROCESADO' THEN 3
      WHEN 'ACTIVO' THEN 4
      ELSE 5
    END
    LIMIT 1;
  END IF;

  IF v_estado_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro un estado valido para registrar el movimiento de caja.');
  END IF;

  SELECT id INTO v_estado_retenido_id
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'RETENIDO'
  LIMIT 1;

  IF p_nombre_usuario IS NOT NULL THEN
    v_nombre_usuario := p_nombre_usuario;
  ELSIF p_id_usuario IS NOT NULL THEN
    SELECT nombre INTO v_nombre_usuario
    FROM public.tb_usuario
    WHERE id = p_id_usuario
    LIMIT 1;
  END IF;

  v_saldo_anterior := COALESCE(v_caja.saldo_actual, 0);

  IF UPPER(BTRIM(COALESCE(p_tipo_origen, ''))) = 'GASTO OPERACIONAL CIERRE' THEN
    v_monto_requerido := COALESCE(p_monto_salida, 0);
    v_saldo_nuevo := v_saldo_anterior - v_monto_requerido;
    v_delta_ingresos := 0;
    v_delta_ingresos_retenido := 0;
    v_delta_total_recaudado := 0;
    v_delta_gastos := 0;
    v_delta_ganancia := 0;
    v_delta_ganancia_retenido := 0;
    v_delta_salida := 0;
    ELSIF UPPER(p_tipo_movimiento) = 'INGRESO' THEN
      IF UPPER(BTRIM(COALESCE(p_tipo_origen, ''))) = 'EDICION SALDO INICIAL CAJA' THEN
        v_saldo_nuevo := v_saldo_anterior + COALESCE(p_monto_ingreso, 0);
      ELSIF v_estado_retenido_id IS NOT NULL AND v_estado_id = v_estado_retenido_id THEN
        v_saldo_nuevo := v_saldo_anterior;
        v_delta_ingresos_retenido := COALESCE(p_monto_ingreso, 0);
        v_delta_ganancia_retenido := COALESCE(p_monto_ganancia, 0);
      ELSE
        v_saldo_nuevo := v_saldo_anterior + COALESCE(p_monto_ingreso, 0);
        IF UPPER(BTRIM(COALESCE(p_tipo_origen, ''))) IN (
          'EFECTIVIZACION',
          'PAGO_DEUDA',
          'PAGO_DEUDA_DEVOLUCION',
          'PAGO_DEUDA_COMISION'
        )
        AND UPPER(BTRIM(COALESCE(p_tipo_origen, ''))) <> 'EDICION SALDO INICIAL CAJA' THEN
          v_delta_total_recaudado := COALESCE(p_monto_ingreso, 0);
          v_delta_ingresos := 0;
        ELSE
          v_delta_total_recaudado := 0;
          v_delta_ingresos := COALESCE(p_monto_ingreso, 0);
        END IF;
        v_delta_ganancia := COALESCE(p_monto_ganancia, 0);
      END IF;
    IF UPPER(BTRIM(COALESCE(p_tipo_origen, ''))) NOT IN ('GASTO OPERACIONAL CIERRE', 'EDICION SALDO INICIAL CAJA') THEN
      v_delta_gastos := COALESCE(p_monto_gasto, 0);
    END IF;
  ELSIF UPPER(p_tipo_movimiento) = 'SALIDA' THEN
    v_monto_requerido := COALESCE(p_monto_salida, 0);
    v_saldo_nuevo := v_saldo_anterior - v_monto_requerido;
    IF UPPER(BTRIM(COALESCE(p_tipo_origen, ''))) NOT IN ('GASTO OPERACIONAL CIERRE', 'EDICION SALDO INICIAL CAJA') THEN
      v_delta_gastos := COALESCE(p_monto_gasto, 0);
      v_delta_salida := COALESCE(p_monto_salida, 0);
    END IF;
  ELSE
    RETURN jsonb_build_object('error', 'tipo_movimiento debe ser INGRESO o SALIDA.');
  END IF;

  IF COALESCE(p_flag_contabiliza_operacion, true) THEN
    v_delta_operaciones := 1;
  END IF;

  INSERT INTO public.tb_operacion_caja (
    id_caja,
    id_operacion_caja_relacionada,
    id_operacion_proceso,
    tipo_origen,
    tipo_movimiento,
    id_codigo_servicio,
    nombre_codigo_servicio,
    dni_cliente,
    nombre_cliente,
    codigo_operacion,
    id_categoria_movimiento,
    nombre_categoria_movimiento,
    detalle,
    id_empresa,
    nombre_empresa,
    id_empresa_cuenta_bancaria,
    id_banco,
    nombre_banco,
    id_banco_tercero,
    nombre_banco_tercero,
    monto_ingreso,
    monto_gasto,
    monto_ganancia,
    monto_salida,
    flag_contabiliza_operacion,
    saldo_anterior,
    saldo_actual,
    id_estado,
    nombre_estado,
    id_usuario,
    nombre_usuario,
    tipo_facturacion
  )
  VALUES (
    p_id_caja,
    p_id_operacion_caja_relacionada,
    p_id_operacion_proceso,
    p_tipo_origen,
    UPPER(p_tipo_movimiento),
    p_id_codigo_servicio,
    p_nombre_codigo_servicio,
    p_dni_cliente,
    p_nombre_cliente,
    p_codigo_operacion,
    p_id_categoria_movimiento,
    p_nombre_categoria_movimiento,
    p_detalle,
    v_caja.id_empresa,
    v_caja.nombre_empresa,
    v_caja.id_empresa_cuenta_bancaria,
    v_caja.id_banco,
    v_caja.nombre_banco,
    p_id_banco_tercero,
    p_nombre_banco_tercero,
    COALESCE(p_monto_ingreso, 0),
    COALESCE(p_monto_gasto, 0),
    COALESCE(p_monto_ganancia, 0),
    COALESCE(p_monto_salida, 0),
    COALESCE(p_flag_contabiliza_operacion, true),
    v_saldo_anterior,
    v_saldo_nuevo,
    v_estado_id,
    v_estado_nombre,
    p_id_usuario,
    v_nombre_usuario,
    COALESCE(p_tipo_facturacion, 'Boleta')
  )
  RETURNING id INTO v_new_id;

  UPDATE public.tb_caja_operativa
  SET saldo_actual = v_saldo_nuevo,
      saldo_total = v_saldo_nuevo,
      total_recaudado = COALESCE(total_recaudado, 0) + v_delta_total_recaudado,
      ingresos = COALESCE(ingresos, 0) + v_delta_ingresos,
      ingresos_retenido = COALESCE(ingresos_retenido, 0) + v_delta_ingresos_retenido,
      gastos = COALESCE(gastos, 0) + v_delta_gastos,
      ganancia = COALESCE(ganancia, 0) + v_delta_ganancia,
      ganancia_retenido = COALESCE(ganancia_retenido, 0) + v_delta_ganancia_retenido,
      salida = COALESCE(salida, 0) + v_delta_salida,
      operaciones = COALESCE(operaciones, 0) + v_delta_operaciones,
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id_caja;

  -- Las cargas Excel difieren esta sincronizacion y la ejecutan una vez al final.
  IF current_setting('app.defer_kpi_sync', true) IS DISTINCT FROM 'on' THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(rc.ruta, p_id_usuario)
    FROM public.tb_ruta_operacion_caja rc
    WHERE rc.id_empresa = v_caja.id_empresa
      AND rc.id_empresa_cuenta_bancaria = v_caja.id_empresa_cuenta_bancaria
      AND rc.id_estado = 1;
  END IF;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_caja(p_id := v_new_id) AS x
    LIMIT 1
  );
END;
$$;

-- f_apply_tb_operacion_caja_delta
CREATE OR REPLACE FUNCTION public.f_apply_tb_operacion_caja_delta(
  p_id_caja bigint,
  p_tipo_movimiento character varying,
  p_nombre_estado character varying DEFAULT NULL,
  p_monto_ingreso numeric DEFAULT 0,
  p_monto_gasto numeric DEFAULT 0,
  p_monto_ganancia numeric DEFAULT 0,
  p_monto_salida numeric DEFAULT 0,
  p_flag_contabiliza_operacion boolean DEFAULT true,
  p_factor integer DEFAULT 1,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caja record;
  v_tipo_movimiento character varying;
  v_nombre_estado character varying;
  v_saldo_delta numeric := 0;
  v_delta_ingresos numeric := 0;
  v_delta_ingresos_retenido numeric := 0;
  v_delta_total_recaudado numeric := 0;
  v_delta_gastos numeric := 0;
  v_delta_ganancia numeric := 0;
  v_delta_ganancia_retenido numeric := 0;
  v_delta_salida numeric := 0;
  v_delta_operaciones integer := 0;
  v_saldo_nuevo numeric;
  v_factor integer;
BEGIN
  SELECT c.id, c.saldo_actual, c.id_empresa, c.id_empresa_cuenta_bancaria
  INTO v_caja
  FROM public.tb_caja_operativa c
  WHERE c.id = p_id_caja
  LIMIT 1
  FOR UPDATE;

  IF v_caja.id IS NULL THEN
    RAISE EXCEPTION 'La caja no existe.';
  END IF;

  v_tipo_movimiento := UPPER(COALESCE(p_tipo_movimiento, ''));
  v_nombre_estado := UPPER(COALESCE(p_nombre_estado, ''));

  IF v_tipo_movimiento = 'INGRESO' THEN
    IF v_nombre_estado = 'RETENIDO' THEN
      v_saldo_delta := 0;
      v_delta_ingresos_retenido := COALESCE(p_monto_ingreso, 0);
      v_delta_ganancia_retenido := COALESCE(p_monto_ganancia, 0);
    ELSE
      v_saldo_delta := COALESCE(p_monto_ingreso, 0);
      v_delta_ingresos := COALESCE(p_monto_ingreso, 0);
      v_delta_total_recaudado := COALESCE(p_monto_ingreso, 0);
      v_delta_ganancia := COALESCE(p_monto_ganancia, 0);
    END IF;
    v_delta_gastos := COALESCE(p_monto_gasto, 0);
  ELSIF v_tipo_movimiento = 'SALIDA' THEN
    v_saldo_delta := -COALESCE(p_monto_salida, 0);
    v_delta_gastos := COALESCE(p_monto_gasto, 0);
    v_delta_salida := COALESCE(p_monto_salida, 0);
  ELSE
    RAISE EXCEPTION 'tipo_movimiento debe ser INGRESO o SALIDA.';
  END IF;

  IF COALESCE(p_flag_contabiliza_operacion, true) THEN
    v_delta_operaciones := 1;
  END IF;

  v_factor := COALESCE(p_factor, 1);
  v_saldo_nuevo := COALESCE(v_caja.saldo_actual, 0) + (v_factor * v_saldo_delta);

  UPDATE public.tb_caja_operativa
  SET saldo_actual = v_saldo_nuevo,
      saldo_total = v_saldo_nuevo,
      total_recaudado = GREATEST(COALESCE(total_recaudado, 0) + (v_factor * v_delta_total_recaudado), 0),
      ingresos = GREATEST(COALESCE(ingresos, 0) + (v_factor * v_delta_ingresos), 0),
      ingresos_retenido = GREATEST(COALESCE(ingresos_retenido, 0) + (v_factor * v_delta_ingresos_retenido), 0),
      gastos = GREATEST(COALESCE(gastos, 0) + (v_factor * v_delta_gastos), 0),
      ganancia = GREATEST(COALESCE(ganancia, 0) + (v_factor * v_delta_ganancia), 0),
      ganancia_retenido = GREATEST(COALESCE(ganancia_retenido, 0) + (v_factor * v_delta_ganancia_retenido), 0),
      salida = GREATEST(COALESCE(salida, 0) + (v_factor * v_delta_salida), 0),
      operaciones = GREATEST(COALESCE(operaciones, 0) + (v_factor * v_delta_operaciones), 0),
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id_caja;

  -- Los lotes de pago sincronizan el KPI una sola vez al finalizar.
  IF current_setting('app.defer_kpi_sync', true) IS DISTINCT FROM 'on' THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(rc.ruta, p_id_usuario)
    FROM public.tb_ruta_operacion_caja rc
    WHERE rc.id_empresa = v_caja.id_empresa
      AND rc.id_empresa_cuenta_bancaria = v_caja.id_empresa_cuenta_bancaria
      AND rc.id_estado = 1;
  END IF;

  RETURN v_saldo_nuevo;
END;
$$;

-- f_get_tb_operacion_saldo_actual_v2
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_saldo_actual_v2(
  p_ruta character varying,
  p_id_empresa bigint,
  p_id_empresa_cuenta_bancaria bigint,
  p_id_caja bigint DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE((
    SELECT k.caja_actual
    FROM public.f_get_tb_ruta_operacion_kpi_operaciones_v2(
      p_ruta := p_ruta,
      p_id_empresa := p_id_empresa,
      p_id_empresa_cuenta_bancaria := p_id_empresa_cuenta_bancaria,
      p_id_caja := p_id_caja
    ) AS k
    LIMIT 1
  ), 0);
$$;

-- f_post_tb_operacion_caja_desde_proceso
CREATE OR REPLACE FUNCTION public.f_post_tb_operacion_caja_desde_proceso(
  p_id_operacion_proceso bigint,
  p_tipo_origen character varying DEFAULT 'EFECTIVIZACION',
  p_tipo_movimiento character varying DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_op record;
  v_mov record;
  v_caja_destino record;
  v_existente jsonb;
  v_relacionada jsonb;
  v_tipo_movimiento character varying;
  v_id_caja bigint;
  v_id_movimiento bigint;
  v_id_relacionada bigint;
  v_estado_id bigint;
  v_estado_nombre character varying;
  v_estado_retenido_id bigint;
  v_estado_retenido_nombre character varying;
  v_nombre_usuario character varying;
  v_saldo_anterior_nuevo numeric;
  v_saldo_actual_nuevo numeric;
  v_monto_ingreso numeric := 0;
  v_monto_transferencia numeric := 0;
  v_monto_gasto numeric := 0;
  v_monto_ganancia numeric := 0;
  v_monto_salida numeric := 0;
  v_saldo_delta_anterior numeric := 0;
  v_saldo_delta_nuevo numeric := 0;
  v_delta_ingresos_anterior numeric := 0;
  v_delta_ingresos_nuevo numeric := 0;
  v_delta_ingresos_retenido_anterior numeric := 0;
  v_delta_ingresos_retenido_nuevo numeric := 0;
  v_delta_total_recaudado_anterior numeric := 0;
  v_delta_total_recaudado_nuevo numeric := 0;
  v_delta_gastos_anterior numeric := 0;
  v_delta_gastos_nuevo numeric := 0;
  v_delta_ganancia_anterior numeric := 0;
  v_delta_ganancia_nuevo numeric := 0;
  v_delta_ganancia_retenido_anterior numeric := 0;
  v_delta_ganancia_retenido_nuevo numeric := 0;
  v_delta_operaciones_anterior integer := 0;
  v_delta_operaciones_nuevo integer := 0;
  v_tipo_servicio character varying;
  v_tipo_flujo_pago_deuda character varying;
  v_flag_retencion boolean := false;
  v_flag_fuera_horario boolean := false;
  v_es_pagado boolean := false;
  v_reactivada_post_cierre boolean := false;
  v_detalle character varying;
  v_result jsonb;
BEGIN
  -- Serializa la comprobacion y la creacion del movimiento para una misma
  -- operacion sin alterar la semantica del movimiento ni del saldo.
  SELECT *
  INTO v_op
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion_proceso
  LIMIT 1
  FOR UPDATE;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion comercial no existe.');
  END IF;

  SELECT UPPER(BTRIM(COALESCE(e.nombre, ''))) = 'PAGADO'
  INTO v_es_pagado
  FROM public.tb_estado e
  WHERE e.id = COALESCE(p_id_estado, v_op.id_estado)
  LIMIT 1;

  v_es_pagado := COALESCE(v_es_pagado, false)
    OR UPPER(BTRIM(COALESCE(v_op.nombre_estado, ''))) = 'PAGADO';

  -- Los depositos fuera de horario son informativos mientras la operacion
  -- siga abierta. Al pasar a Pagado deben volver al flujo financiero normal:
  -- ingreso, salida, gastos y ganancia, igual que una operacion retenida.
  -- Si una version anterior ya habia creado un movimiento abierto, se retira
  -- aqui para que la reclasificacion no deje saldo ni KPI inflados.
  IF COALESCE(v_op.flag_fuera_horario, false) AND NOT v_es_pagado THEN
    v_result := public.f_patch_tb_operacion_caja_revertir_informativa(
      p_id_operacion_proceso := p_id_operacion_proceso,
      p_id_usuario := p_id_usuario
    );

    RETURN v_result || jsonb_build_object(
      'informativo', true,
      'flag_fuera_horario', true,
      'id_operacion_proceso', p_id_operacion_proceso
    );
  END IF;

  v_tipo_servicio := UPPER(COALESCE(v_op.tipo_servicio, v_op.nombre_codigo_servicio, ''));
  v_tipo_flujo_pago_deuda := UPPER(COALESCE(v_op.tipo_flujo_pago_deuda, ''));
  v_tipo_movimiento := UPPER(
    COALESCE(
      p_tipo_movimiento,
      CASE
        WHEN v_tipo_servicio LIKE '%PAGO%DEUDA%' THEN 'SALIDA'
        ELSE 'INGRESO'
      END
    )
  );

  -- Corte controlado de la relacion comercial: las operaciones bancarias
  -- nuevas se contabilizan desde tb_operacion_proceso/KPI V2 y no vuelven a
  -- crear filas en tb_operacion_caja. Si existe un movimiento legacy, se
  -- conserva el camino anterior para no romper historial ni reversas.
  IF LOWER(BTRIM(COALESCE(v_op.ruta_destino, v_op.ruta_origen, ''))) IN (
       'bcp', 'bbva', 'scotiabank', 'banbif', 'interbank', 'safetypay'
     )
     AND v_tipo_servicio IN ('EFECTIVIZACION', 'POS')
     AND NOT EXISTS (
       SELECT 1
       FROM public.tb_operacion_caja c
       WHERE c.id_operacion_proceso = p_id_operacion_proceso
     ) THEN
    RETURN jsonb_build_object(
      'id_operacion_proceso', v_op.id,
      'tipo_movimiento', v_tipo_movimiento,
      'monto_ingreso', CASE WHEN v_tipo_movimiento = 'INGRESO' THEN COALESCE(v_op.monto_deposito_cliente, 0) ELSE 0 END,
      'monto_salida', CASE WHEN v_tipo_movimiento = 'SALIDA' THEN GREATEST(COALESCE(v_op.monto_transferencia_cliente, 0), 0) ELSE 0 END,
      'monto_gasto', CASE
        WHEN v_tipo_movimiento = 'INGRESO' THEN COALESCE(v_op.resultado_comision_banco_ingreso, 0)
        ELSE COALESCE(v_op.resultado_comision_banco_salida, 0)
      END,
      'monto_ganancia', 0,
      'sin_movimiento', true,
      'desconectado', true
    );
  END IF;

  v_reactivada_post_cierre :=
    v_op.id_caja_cierre IS NULL
    AND LOWER(BTRIM(COALESCE(v_op.ruta_destino, v_op.ruta_origen, ''))) IN ('banbif', 'scotiabank', 'interbank')
    AND v_tipo_servicio = 'EFECTIVIZACION'
    AND EXISTS (
      SELECT 1
      FROM public.tb_operacion_caja c
      WHERE c.id_operacion_proceso = p_id_operacion_proceso
        AND UPPER(BTRIM(COALESCE(c.tipo_movimiento, ''))) = 'SALIDA'
        AND c.id_caja_cierre IS NOT NULL
        AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
    );

  SELECT to_jsonb(c)
  INTO v_existente
  FROM public.tb_operacion_caja c
  WHERE c.id_operacion_proceso = p_id_operacion_proceso
    AND c.tipo_movimiento = v_tipo_movimiento
    AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
    AND NOT (
      v_reactivada_post_cierre
      AND UPPER(BTRIM(COALESCE(c.tipo_movimiento, ''))) = 'SALIDA'
      AND c.id_caja_cierre IS NOT NULL
    )
  ORDER BY c.id
  LIMIT 1;

  SELECT to_jsonb(c)
  INTO v_relacionada
  FROM public.tb_operacion_caja c
  WHERE c.id_operacion_proceso = p_id_operacion_proceso
    AND c.tipo_movimiento = CASE WHEN v_tipo_movimiento = 'INGRESO' THEN 'SALIDA' ELSE 'INGRESO' END
    AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
  ORDER BY c.id
  LIMIT 1;

  v_estado_id := COALESCE(p_id_estado, v_op.id_estado);
  v_estado_nombre := v_op.nombre_estado;

  IF v_estado_id IS NOT NULL THEN
    SELECT nombre
    INTO v_estado_nombre
    FROM public.tb_estado
    WHERE id = v_estado_id
    LIMIT 1;
  END IF;

  SELECT id, nombre
  INTO v_estado_retenido_id, v_estado_retenido_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'RETENIDO'
  LIMIT 1;

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

  IF v_tipo_movimiento = 'INGRESO' THEN
    SELECT
      c.id,
      c.saldo_actual,
      c.id_empresa,
      e.nombre AS nombre_empresa,
      c.id_empresa_cuenta_bancaria,
      ecb.id_banco,
      b.nombre AS nombre_banco
    INTO v_caja_destino
    FROM public.tb_caja_operativa c
    JOIN public.tb_empresa e ON e.id = c.id_empresa
    JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = c.id_empresa_cuenta_bancaria
    JOIN public.tb_banco b ON b.id = ecb.id_banco
    WHERE c.id_empresa = v_op.id_empresa_ingreso
      AND c.id_empresa_cuenta_bancaria = v_op.id_empresa_cuenta_ingreso
    LIMIT 1;

    IF v_caja_destino.id IS NULL THEN
      RETURN jsonb_build_object('error', 'No existe caja inicial para la empresa y cuenta de ingreso de la operacion.');
    END IF;

    v_id_caja := v_caja_destino.id;
    v_flag_retencion := COALESCE(v_op.flag_retenido, false);
    IF v_flag_retencion AND v_estado_retenido_id IS NOT NULL THEN
      v_estado_id := v_estado_retenido_id;
      v_estado_nombre := v_estado_retenido_nombre;
    END IF;
    v_monto_ingreso := COALESCE(v_op.monto_deposito_cliente, 0);
    IF v_tipo_flujo_pago_deuda IN ('RETORNO', 'RETORNO_DIRECTO', 'DIRECTO_CAJA') THEN
      v_monto_transferencia := 0;
    ELSE
      v_monto_transferencia := GREATEST(
        COALESCE(
          v_op.monto_transferencia_cliente,
          GREATEST(COALESCE(v_op.monto_deposito_cliente, 0) - COALESCE(v_op.resultado_comision_servicio, 0), 0),
          0
        ),
        0
      );
    END IF;
    v_monto_gasto := COALESCE(v_op.resultado_comision_banco_ingreso, 0);
    IF v_tipo_flujo_pago_deuda IN ('RETORNO', 'RETORNO_DIRECTO', 'DIRECTO_CAJA') THEN
      v_monto_ganancia := 0;
      v_detalle := CASE
        WHEN v_tipo_flujo_pago_deuda = 'DIRECTO_CAJA' THEN 'Ingreso directo a caja'
        WHEN v_tipo_flujo_pago_deuda = 'RETORNO_DIRECTO' THEN 'Retorno directo Pago Deuda'
        ELSE 'Retorno Pago Deuda'
      END;
    ELSE
      v_monto_ganancia := GREATEST(
        v_monto_ingreso -
        v_monto_transferencia -
        v_monto_gasto -
        COALESCE(v_op.resultado_comision_banco_salida, 0),
        0
      );
      v_detalle := 'Operacion comercial de ingreso';
    END IF;
  ELSIF v_tipo_movimiento = 'SALIDA' THEN
    SELECT
      c.id,
      c.saldo_actual,
      c.id_empresa,
      e.nombre AS nombre_empresa,
      c.id_empresa_cuenta_bancaria,
      ecb.id_banco,
      b.nombre AS nombre_banco
    INTO v_caja_destino
    FROM public.tb_caja_operativa c
    JOIN public.tb_empresa e ON e.id = c.id_empresa
    JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = c.id_empresa_cuenta_bancaria
    JOIN public.tb_banco b ON b.id = ecb.id_banco
    WHERE c.id_empresa = v_op.id_empresa_salida
      AND c.id_empresa_cuenta_bancaria = v_op.id_empresa_cuenta_salida
    LIMIT 1;

    IF v_caja_destino.id IS NULL THEN
      RETURN jsonb_build_object('error', 'No existe caja inicial para la empresa y cuenta de salida de la operacion.');
    END IF;

    v_id_caja := v_caja_destino.id;
    v_monto_salida := GREATEST(
      COALESCE(v_op.monto_transferencia_cliente, v_op.monto_deposito_cliente, 0),
      0
    );
    v_monto_gasto := COALESCE(v_op.resultado_comision_banco_salida, 0);
    v_detalle := 'Operacion comercial de salida';
  ELSE
    RETURN jsonb_build_object('error', 'tipo_movimiento debe ser INGRESO o SALIDA.');
  END IF;

  IF v_tipo_movimiento = 'INGRESO' AND v_monto_ingreso <= 0 THEN
    RETURN jsonb_build_object('error', 'La operacion no tiene monto de ingreso para caja.');
  END IF;

  IF v_tipo_movimiento = 'SALIDA' AND v_monto_salida <= 0 THEN
    IF v_existente IS NULL THEN
      -- Una transferencia cero es un pago valido sin salida financiera.
      RETURN jsonb_build_object(
        'id_operacion_proceso', v_op.id,
        'tipo_movimiento', 'SALIDA',
        'monto_salida', 0,
        'monto_gasto', 0,
        'monto_ganancia', 0,
        'sin_movimiento', true
      );
    END IF;
  END IF;

  IF v_existente IS NOT NULL THEN
    v_id_movimiento := (v_existente->>'id')::bigint;
    v_id_relacionada := NULLIF(v_relacionada->>'id', '')::bigint;

    SELECT *
    INTO v_mov
    FROM public.tb_operacion_caja
    WHERE id = v_id_movimiento
    FOR UPDATE;

    IF v_mov.id_caja_cierre IS NOT NULL THEN
      RETURN v_existente || jsonb_build_object('idempotente', true, 'cerrado', true);
    END IF;

    IF v_tipo_movimiento = 'SALIDA' THEN
    END IF;

    IF v_tipo_movimiento = 'INGRESO'
       AND UPPER(BTRIM(COALESCE(v_mov.tipo_movimiento, ''))) = 'INGRESO'
       AND v_mov.id_caja = v_id_caja THEN
      -- Reemplazar un ingreso abierto mediante diferencias evita una reversa
      -- intermedia negativa cuando el importe ya fue utilizado en salidas.
      SELECT saldo_actual
      INTO v_saldo_anterior_nuevo
      FROM public.tb_caja_operativa
      WHERE id = v_id_caja
      LIMIT 1
      FOR UPDATE;

      IF UPPER(BTRIM(COALESCE(v_mov.nombre_estado, ''))) = 'RETENIDO' THEN
        v_saldo_delta_anterior := 0;
        v_delta_ingresos_retenido_anterior := COALESCE(v_mov.monto_ingreso, 0);
        v_delta_ganancia_retenido_anterior := COALESCE(v_mov.monto_ganancia, 0);
      ELSE
        v_saldo_delta_anterior := COALESCE(v_mov.monto_ingreso, 0);
        v_delta_ingresos_anterior := COALESCE(v_mov.monto_ingreso, 0);
        v_delta_total_recaudado_anterior := COALESCE(v_mov.monto_ingreso, 0);
        v_delta_ganancia_anterior := COALESCE(v_mov.monto_ganancia, 0);
      END IF;
      v_delta_gastos_anterior := COALESCE(v_mov.monto_gasto, 0);
      IF COALESCE(v_mov.flag_contabiliza_operacion, true) THEN
        v_delta_operaciones_anterior := 1;
      END IF;

      IF UPPER(BTRIM(COALESCE(v_estado_nombre, v_op.nombre_estado, v_mov.nombre_estado))) = 'RETENIDO' THEN
        v_saldo_delta_nuevo := 0;
        v_delta_ingresos_retenido_nuevo := COALESCE(v_monto_ingreso, 0);
        v_delta_ganancia_retenido_nuevo := COALESCE(v_monto_ganancia, 0);
      ELSE
        v_saldo_delta_nuevo := COALESCE(v_monto_ingreso, 0);
        v_delta_ingresos_nuevo := COALESCE(v_monto_ingreso, 0);
        v_delta_total_recaudado_nuevo := COALESCE(v_monto_ingreso, 0);
        v_delta_ganancia_nuevo := COALESCE(v_monto_ganancia, 0);
      END IF;
      v_delta_gastos_nuevo := COALESCE(v_monto_gasto, 0);
      IF COALESCE(v_mov.flag_contabiliza_operacion, true) THEN
        v_delta_operaciones_nuevo := 1;
      END IF;

      v_saldo_actual_nuevo := COALESCE(v_saldo_anterior_nuevo, 0)
        - v_saldo_delta_anterior
        + v_saldo_delta_nuevo;

      UPDATE public.tb_caja_operativa
      SET saldo_actual = v_saldo_actual_nuevo,
          saldo_total = v_saldo_actual_nuevo,
          total_recaudado = GREATEST(
            COALESCE(total_recaudado, 0)
              - v_delta_total_recaudado_anterior
              + v_delta_total_recaudado_nuevo,
            0
          ),
          ingresos = GREATEST(
            COALESCE(ingresos, 0)
              - v_delta_ingresos_anterior
              + v_delta_ingresos_nuevo,
            0
          ),
          ingresos_retenido = GREATEST(
            COALESCE(ingresos_retenido, 0)
              - v_delta_ingresos_retenido_anterior
              + v_delta_ingresos_retenido_nuevo,
            0
          ),
          gastos = GREATEST(
            COALESCE(gastos, 0)
              - v_delta_gastos_anterior
              + v_delta_gastos_nuevo,
            0
          ),
          ganancia = GREATEST(
            COALESCE(ganancia, 0)
              - v_delta_ganancia_anterior
              + v_delta_ganancia_nuevo,
            0
          ),
          ganancia_retenido = GREATEST(
            COALESCE(ganancia_retenido, 0)
              - v_delta_ganancia_retenido_anterior
              + v_delta_ganancia_retenido_nuevo,
            0
          ),
          operaciones = GREATEST(
            COALESCE(operaciones, 0)
              - v_delta_operaciones_anterior
              + v_delta_operaciones_nuevo,
            0
          ),
          id_usuario = COALESCE(p_id_usuario, id_usuario)
      WHERE id = v_id_caja;

      IF current_setting('app.defer_kpi_sync', true) IS DISTINCT FROM 'on' THEN
        PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(rc.ruta, p_id_usuario)
        FROM public.tb_ruta_operacion_caja rc
        WHERE rc.id_empresa = v_caja_destino.id_empresa
          AND rc.id_empresa_cuenta_bancaria = v_caja_destino.id_empresa_cuenta_bancaria
          AND rc.id_estado = 1;
      END IF;
    ELSE
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
      INTO v_saldo_anterior_nuevo
      FROM public.tb_caja_operativa
      WHERE id = v_id_caja
      LIMIT 1;

      v_saldo_actual_nuevo := public.f_apply_tb_operacion_caja_delta(
        p_id_caja := v_id_caja,
        p_tipo_movimiento := v_tipo_movimiento,
        p_nombre_estado := COALESCE(v_estado_nombre, v_op.nombre_estado, v_mov.nombre_estado),
        p_monto_ingreso := v_monto_ingreso,
        p_monto_gasto := v_monto_gasto,
        p_monto_ganancia := v_monto_ganancia,
        p_monto_salida := v_monto_salida,
        p_flag_contabiliza_operacion := COALESCE(v_mov.flag_contabiliza_operacion, true),
        p_factor := 1,
        p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario)
      );
    END IF;

    UPDATE public.tb_operacion_caja
    SET id_caja = v_id_caja,
        id_operacion_caja_relacionada = v_id_relacionada,
        tipo_origen = CASE
          WHEN v_tipo_movimiento = 'INGRESO' AND v_flag_retencion THEN tipo_origen
          ELSE COALESCE(p_tipo_origen, tipo_origen)
        END,
        id_codigo_servicio = v_op.id_codigo_servicio,
        nombre_codigo_servicio = v_op.nombre_codigo_servicio,
        dni_cliente = v_op.dni_cliente,
        nombre_cliente = v_op.nombre_cliente,
        codigo_operacion = v_op.codigo_operacion_deposito_cliente,
        detalle = v_detalle,
        id_empresa = v_caja_destino.id_empresa,
        nombre_empresa = v_caja_destino.nombre_empresa,
        id_empresa_cuenta_bancaria = v_caja_destino.id_empresa_cuenta_bancaria,
        id_banco = v_caja_destino.id_banco,
        nombre_banco = v_caja_destino.nombre_banco,
        id_banco_tercero = COALESCE(v_op.id_banco_cliente_transferencia, v_op.id_banco_cliente),
        nombre_banco_tercero = COALESCE(v_op.nombre_banco_cliente_transferencia, v_op.nombre_banco_cliente),
        monto_ingreso = v_monto_ingreso,
        monto_gasto = v_monto_gasto,
        monto_ganancia = v_monto_ganancia,
        monto_salida = v_monto_salida,
        saldo_anterior = v_saldo_anterior_nuevo,
        saldo_actual = v_saldo_actual_nuevo,
        id_estado = COALESCE(v_estado_id, id_estado),
        nombre_estado = COALESCE(v_estado_nombre, nombre_estado),
        id_usuario = COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario, id_usuario),
        nombre_usuario = COALESCE(v_nombre_usuario, nombre_usuario),
        tipo_facturacion = COALESCE(v_op.tipo_facturacion, 'Boleta')
    WHERE id = v_id_movimiento;

    IF v_id_relacionada IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.tb_operacion_caja c
         WHERE c.id = v_id_relacionada
           AND c.id_caja_cierre IS NOT NULL
       ) THEN
      PERFORM public.f_patch_tb_operacion_caja(
        p_id := v_id_relacionada,
        p_id_operacion_caja_relacionada := v_id_movimiento,
        p_id_estado := p_id_estado,
        p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario),
        p_nombre_usuario := COALESCE(p_nombre_usuario, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
        p_tipo_facturacion := COALESCE(v_op.tipo_facturacion, 'Boleta')
      );
    END IF;

    SELECT x
    INTO v_result
    FROM public.f_get_tb_operacion_caja(p_id := v_id_movimiento) AS x
    LIMIT 1;

    RETURN v_result || jsonb_build_object('idempotente', true);
  END IF;

  v_result := public.f_post_tb_operacion_caja(
    p_id_caja := v_id_caja,
    p_tipo_origen := COALESCE(p_tipo_origen, 'EFECTIVIZACION'),
    p_tipo_movimiento := v_tipo_movimiento,
    p_id_operacion_proceso := v_op.id,
    p_id_codigo_servicio := v_op.id_codigo_servicio,
    p_nombre_codigo_servicio := v_op.nombre_codigo_servicio,
    p_dni_cliente := v_op.dni_cliente,
    p_nombre_cliente := v_op.nombre_cliente,
    p_codigo_operacion := v_op.codigo_operacion_deposito_cliente,
    p_detalle := v_detalle,
    p_id_banco_tercero := COALESCE(v_op.id_banco_cliente_transferencia, v_op.id_banco_cliente),
    p_nombre_banco_tercero := COALESCE(v_op.nombre_banco_cliente_transferencia, v_op.nombre_banco_cliente),
    p_monto_ingreso := v_monto_ingreso,
    p_monto_gasto := v_monto_gasto,
    p_monto_ganancia := v_monto_ganancia,
    p_monto_salida := v_monto_salida,
    p_flag_contabiliza_operacion := true,
    p_id_estado := COALESCE(v_estado_id, p_id_estado, v_op.id_estado),
    p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
    p_tipo_facturacion := COALESCE(v_op.tipo_facturacion, 'Boleta')
  );

  IF v_result ? 'error' THEN
    RETURN v_result;
  END IF;

  v_id_movimiento := (v_result->>'id')::bigint;
  v_id_relacionada := NULLIF(v_relacionada->>'id', '')::bigint;

  IF v_id_relacionada IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.tb_operacion_caja c
       WHERE c.id = v_id_relacionada
         AND c.id_caja_cierre IS NOT NULL
     ) THEN
    v_result := public.f_patch_tb_operacion_caja(
      p_id := v_id_movimiento,
      p_id_operacion_caja_relacionada := v_id_relacionada,
      p_id_estado := p_id_estado,
      p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario),
      p_nombre_usuario := COALESCE(p_nombre_usuario, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
      p_tipo_facturacion := COALESCE(v_op.tipo_facturacion, 'Boleta')
    );

    PERFORM public.f_patch_tb_operacion_caja(
      p_id := v_id_relacionada,
      p_id_operacion_caja_relacionada := v_id_movimiento,
      p_id_estado := p_id_estado,
      p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario),
      p_nombre_usuario := COALESCE(p_nombre_usuario, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
      p_tipo_facturacion := COALESCE(v_op.tipo_facturacion, 'Boleta')
    );
  END IF;

  RETURN v_result;
END;
$$;


-- f_get_tb_operacion_bandeja_unificada
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_bandeja_unificada(
  p_tab character varying,
  p_ruta character varying,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_filtro_estado character varying DEFAULT NULL,
  p_codigo_operacion character varying DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_fecha_deposito_desde timestamp with time zone DEFAULT NULL,
  p_fecha_deposito_hasta timestamp with time zone DEFAULT NULL,
  p_fecha_caja_cierre_desde timestamp with time zone DEFAULT NULL,
  p_fecha_caja_cierre_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH args AS (
    SELECT
      LOWER(BTRIM(COALESCE(p_ruta, ''))) AS ruta,
      UPPER(BTRIM(COALESCE(p_filtro_estado, 'TODOS'))) AS filtro_estado,
      (p_fecha_caja_cierre_desde IS NOT NULL OR p_fecha_caja_cierre_hasta IS NOT NULL) AS historico
  )
  SELECT to_jsonb(op)
  FROM public.tb_operacion_proceso op
  CROSS JOIN args a
  WHERE
    (
      (
        NOT a.historico
        AND COALESCE(op.id_estado, 0) <> 10
        AND op.id_caja_cierre IS NULL
      )
      OR (
        a.historico
        AND op.id_caja_cierre IS NOT NULL
        AND (p_fecha_caja_cierre_desde IS NULL OR op.fecha_caja_cierre >= p_fecha_caja_cierre_desde)
        AND (p_fecha_caja_cierre_hasta IS NULL OR op.fecha_caja_cierre <= p_fecha_caja_cierre_hasta)
        AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) NOT IN (
          'PENDIENTE', 'RECHAZADO', 'SOLICITADO', 'PROCESADO'
        )
      )
    )
    AND (
      p_codigo_operacion IS NULL
      OR COALESCE(op.codigo_operacion_deposito_cliente, '') ILIKE '%' || p_codigo_operacion || '%'
    )
    AND (
      p_dni_cliente IS NULL
      OR COALESCE(op.dni_cliente, '') ILIKE '%' || p_dni_cliente || '%'
    )
    AND (p_fecha_deposito_desde IS NULL OR op.fecha_deposito_cliente >= p_fecha_deposito_desde)
    AND (p_fecha_deposito_hasta IS NULL OR op.fecha_deposito_cliente <= p_fecha_deposito_hasta)
    AND (
      a.filtro_estado = 'TODOS'
      OR UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = a.filtro_estado
    )
    AND (
      (
        UPPER(COALESCE(op.tipo_servicio, '')) = 'EFECTIVIZACION'
        AND COALESCE(op.flag_derivado, false) = false
        AND LOWER(COALESCE(op.ruta_destino, '')) = a.ruta
        AND (p_id_empresa IS NULL OR op.id_empresa_salida = p_id_empresa)
        AND (p_id_empresa_cuenta_bancaria IS NULL OR op.id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      )
      OR (
        COALESCE(op.flag_derivado, false) = true
        AND LOWER(COALESCE(op.ruta_destino, '')) = a.ruta
        AND (p_id_empresa IS NULL OR op.id_empresa_salida = p_id_empresa)
        AND (p_id_empresa_cuenta_bancaria IS NULL OR op.id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      )
      OR (
        COALESCE(op.flag_derivado, false) = true
        AND LOWER(COALESCE(op.ruta_origen, '')) = a.ruta
        AND (p_id_empresa IS NULL OR COALESCE(op.id_empresa_salida_origen, op.id_empresa_salida) = p_id_empresa)
        AND (p_id_empresa_cuenta_bancaria IS NULL OR COALESCE(op.id_empresa_cuenta_salida_origen, op.id_empresa_cuenta_salida) = p_id_empresa_cuenta_bancaria)
      )
      OR (
        LOWER(COALESCE(op.ruta_origen, '')) = 'pos'
        AND LOWER(COALESCE(op.ruta_destino, '')) = a.ruta
        AND (p_id_empresa IS NULL OR op.id_empresa_salida = p_id_empresa)
        AND (p_id_empresa_cuenta_bancaria IS NULL OR op.id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      )
    )
  ORDER BY
    COALESCE(op.fecha_deposito_cliente, op.fecha_registro) ASC,
    op.fecha_registro ASC,
    op.id ASC;
$$;


-- f_get_tb_ruta_operacion_kpi_cierre_operaciones_v2
CREATE OR REPLACE FUNCTION public.f_get_tb_ruta_operacion_kpi_cierre_operaciones_v2(
  p_id_caja_cierre bigint,
  p_ruta character varying DEFAULT NULL,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  ruta character varying,
  caja_inicial numeric,
  caja_actual numeric,
  total_recaudado numeric,
  ingresos numeric,
  salidas numeric,
  gastos_operacionales numeric,
  ganancias numeric,
  ingresos_retenidos numeric,
  fuera_horario numeric,
  pendiente_depositar numeric,
  total_efectivizacion integer,
  total_pago_deuda integer,
  id_estado bigint,
  nombre_estado character varying,
  id_usuario bigint,
  nombre_usuario character varying,
  fecha_registro timestamp with time zone,
  caja_recaudacion numeric,
  pendiente_transferencia numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $$
WITH cierre AS (
  SELECT
    cc.id,
    cc.id_caja,
    cc.id_empresa,
    cc.id_empresa_cuenta_bancaria,
    cc.saldo_inicial,
    cc.saldo_actual,
    cc.id_estado,
    cc.id_usuario,
    cc.fecha_registro,
    COALESCE(rc.ruta, p_ruta) AS ruta
  FROM public.tb_caja_operativa_cierre cc
  LEFT JOIN public.tb_ruta_operacion_caja rc
    ON rc.id_empresa = cc.id_empresa
   AND rc.id_empresa_cuenta_bancaria = cc.id_empresa_cuenta_bancaria
  WHERE cc.id = p_id_caja_cierre
    AND (p_ruta IS NULL OR rc.ruta = p_ruta OR p_ruta = 'safetypay' AND rc.ruta = 'interbank')
    AND (p_id_empresa IS NULL OR cc.id_empresa = p_id_empresa)
    AND (p_id_empresa_cuenta_bancaria IS NULL OR cc.id_empresa_cuenta_bancaria = p_id_empresa_cuenta_bancaria)
),
operaciones AS (
  SELECT
    c.id AS closure_id,
    c.ruta AS closure_ruta,
    c.id_caja,
    c.id_empresa,
    c.id_empresa_cuenta_bancaria,
    c.saldo_inicial,
    c.saldo_actual,
    c.id_estado,
    c.id_usuario,
    c.fecha_registro AS closure_fecha_registro,
    op.*,
    (
      op.id_caja_cierre_ingreso = c.id
      OR (
        op.id_caja_cierre_ingreso IS NULL
        AND op.id_caja_cierre_salida IS NULL
        AND op.id_caja_cierre = c.id
        AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'PAGADO'
      )
    ) AS atribucion_ingreso,
    (
      op.id_caja_cierre_salida = c.id
      OR (
        op.id_caja_cierre_ingreso IS NULL
        AND op.id_caja_cierre_salida IS NULL
        AND op.id_caja_cierre = c.id
        AND (
          UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
          OR (
            UPPER(BTRIM(COALESCE(op.tipo_servicio, ''))) = 'PAGO DEUDA'
            AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PROCESADO'
          )
        )
      )
    ) AS atribucion_salida
  FROM cierre c
  JOIN public.tb_operacion_proceso op
    ON UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
   AND (
     (op.id_empresa_ingreso = c.id_empresa AND op.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria)
     OR
     (op.id_empresa_salida = c.id_empresa AND op.id_empresa_cuenta_salida = c.id_empresa_cuenta_bancaria)
   )
   AND (
     op.ruta_origen = c.ruta
     OR op.ruta_destino = c.ruta
     OR (c.ruta = 'safetypay' AND op.ruta_origen = 'interbank')
     OR (c.ruta = 'safetypay' AND op.ruta_destino = 'interbank')
   )
),
manuales AS (
  SELECT
    c.id AS closure_id,
    COALESCE(SUM(CASE
      WHEN UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
      THEN COALESCE(oc.monto_ingreso, 0)
      ELSE 0
    END), 0)::numeric AS manual_ingresos,
    COALESCE(SUM(CASE
      WHEN UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'SALIDA'
      THEN COALESCE(oc.monto_salida, 0)
      ELSE 0
    END), 0)::numeric AS manual_salidas,
    COALESCE(SUM(COALESCE(oc.monto_gasto, 0)), 0)::numeric AS manual_gastos
  FROM cierre c
  LEFT JOIN public.tb_operacion_caja oc
    ON oc.id_caja = c.id_caja
   AND oc.id_caja_cierre = c.id
   AND oc.id_operacion_proceso IS NULL
   AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) = 'OTROS'
   AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) IN ('INGRESO', 'SALIDA')
  GROUP BY c.id
),
agregado AS (
  SELECT
    c.id,
    c.ruta,
    c.saldo_inicial,
    c.saldo_actual,
    c.id_estado,
    c.id_usuario,
    c.fecha_registro,
    COALESCE(m.manual_ingresos, 0) AS manual_ingresos,
    COALESCE(m.manual_salidas, 0) AS manual_salidas,
    COALESCE(m.manual_gastos, 0) AS manual_gastos,
    COALESCE(SUM(CASE WHEN o.atribucion_ingreso AND o.id_empresa_ingreso = c.id_empresa AND o.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria AND UPPER(BTRIM(COALESCE(o.tipo_flujo_pago_deuda, ''))) <> 'DIRECTO_CAJA' AND UPPER(BTRIM(COALESCE(o.nombre_estado, ''))) IN ('PENDIENTE', 'PAGADO') THEN COALESCE(o.monto_deposito_cliente, 0) ELSE 0 END), 0) AS recaudacion,
    COALESCE(SUM(CASE WHEN o.atribucion_ingreso AND o.id_empresa_ingreso = c.id_empresa AND o.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria AND UPPER(BTRIM(COALESCE(o.tipo_flujo_pago_deuda, ''))) <> 'DIRECTO_CAJA' AND UPPER(BTRIM(COALESCE(o.nombre_estado, ''))) IN ('PENDIENTE', 'PAGADO') AND NOT (
      COALESCE(o.flag_retenido, false) = true
      AND (
        (o.id_empresa_ingreso = 5 AND o.id_empresa_cuenta_ingreso = 33 AND o.id_banco_empresa_cuenta_ingreso = 3)
        OR (o.id_empresa_ingreso = 7 AND o.id_empresa_cuenta_ingreso = 16 AND o.id_banco_empresa_cuenta_ingreso = 4)
        OR (o.id_empresa_ingreso = 8 AND o.id_empresa_cuenta_ingreso = 7 AND o.id_banco_empresa_cuenta_ingreso = 3)
        OR (o.id_empresa_ingreso = 5 AND o.id_empresa_cuenta_ingreso = 4 AND o.id_banco_empresa_cuenta_ingreso = 2)
        OR (o.id_empresa_ingreso = 6 AND o.id_empresa_cuenta_ingreso = 5 AND o.id_banco_empresa_cuenta_ingreso = 2)
      )
    ) THEN COALESCE(o.monto_deposito_cliente, 0) ELSE 0 END), 0) AS ingresos,
    COALESCE(SUM(CASE WHEN o.atribucion_salida AND o.id_empresa_salida = c.id_empresa AND o.id_empresa_cuenta_salida = c.id_empresa_cuenta_bancaria AND UPPER(BTRIM(COALESCE(o.tipo_flujo_pago_deuda, ''))) NOT IN ('DIRECTO_CAJA', 'RETORNO', 'RETORNO_DIRECTO') AND (UPPER(BTRIM(COALESCE(o.nombre_estado, ''))) = 'PAGADO' OR (UPPER(BTRIM(COALESCE(o.tipo_servicio, ''))) = 'PAGO DEUDA' AND UPPER(BTRIM(COALESCE(o.nombre_estado, ''))) = 'PROCESADO')) THEN COALESCE(o.monto_transferencia_cliente, 0) ELSE 0 END), 0) AS salidas,
    COALESCE(SUM(CASE WHEN o.atribucion_ingreso AND o.id_empresa_ingreso = c.id_empresa AND o.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria AND UPPER(BTRIM(COALESCE(o.tipo_flujo_pago_deuda, ''))) <> 'DIRECTO_CAJA' AND UPPER(BTRIM(COALESCE(o.nombre_estado, ''))) IN ('PENDIENTE', 'PAGADO') THEN COALESCE(o.resultado_comision_banco_ingreso, 0) ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN o.atribucion_salida AND o.id_empresa_salida = c.id_empresa AND o.id_empresa_cuenta_salida = c.id_empresa_cuenta_bancaria AND UPPER(BTRIM(COALESCE(o.tipo_flujo_pago_deuda, ''))) NOT IN ('DIRECTO_CAJA', 'RETORNO', 'RETORNO_DIRECTO') AND (UPPER(BTRIM(COALESCE(o.nombre_estado, ''))) = 'PAGADO' OR (UPPER(BTRIM(COALESCE(o.tipo_servicio, ''))) = 'PAGO DEUDA' AND UPPER(BTRIM(COALESCE(o.nombre_estado, ''))) = 'PROCESADO')) THEN COALESCE(o.resultado_comision_banco_salida, 0) ELSE 0 END), 0) AS gastos,
    COALESCE(SUM(
      CASE
        WHEN (
          (LOWER(BTRIM(COALESCE(c.ruta, ''))) = 'scotiabank' AND c.id_empresa = 5 AND c.id_empresa_cuenta_bancaria = 33 AND o.id_banco_empresa_cuenta_ingreso = 3)
          OR (LOWER(BTRIM(COALESCE(c.ruta, ''))) = 'scotiabank' AND c.id_empresa = 8 AND c.id_empresa_cuenta_bancaria = 7 AND o.id_banco_empresa_cuenta_ingreso = 3)
          OR (LOWER(BTRIM(COALESCE(c.ruta, ''))) = 'banbif' AND c.id_empresa = 7 AND c.id_empresa_cuenta_bancaria = 16 AND o.id_banco_empresa_cuenta_ingreso = 4)
        ) THEN
          CASE
            WHEN o.atribucion_ingreso
             AND UPPER(BTRIM(COALESCE(o.tipo_servicio, o.nombre_codigo_servicio, ''))) = 'EFECTIVIZACION'
             AND UPPER(BTRIM(COALESCE(o.nombre_estado, ''))) = 'PAGADO'
             AND UPPER(BTRIM(COALESCE(o.tipo_flujo_pago_deuda, ''))) NOT IN ('DIRECTO_CAJA', 'RETORNO', 'RETORNO_DIRECTO')
            THEN GREATEST(
              COALESCE(o.monto_deposito_cliente, 0)
              - COALESCE(o.monto_transferencia_cliente, 0)
              - COALESCE(o.resultado_comision_banco_ingreso, 0)
              - COALESCE(o.resultado_comision_banco_salida, 0),
              0
            )
            ELSE 0
          END
        WHEN o.atribucion_ingreso
         AND o.id_empresa_ingreso = c.id_empresa
         AND o.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria
         AND UPPER(BTRIM(COALESCE(o.tipo_flujo_pago_deuda, ''))) NOT IN ('DIRECTO_CAJA', 'RETORNO', 'RETORNO_DIRECTO')
         AND UPPER(BTRIM(COALESCE(o.nombre_estado, ''))) IN ('PENDIENTE', 'PAGADO')
        THEN COALESCE(o.monto_deposito_cliente, 0)
          - COALESCE(o.monto_transferencia_cliente, 0)
          - COALESCE(o.resultado_comision_banco_ingreso, 0)
          - COALESCE(o.resultado_comision_banco_salida, 0)
        ELSE 0
      END
    ), 0) AS ganancias,
    COALESCE(SUM(CASE WHEN o.atribucion_ingreso AND o.id_empresa_ingreso = c.id_empresa AND o.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria AND UPPER(BTRIM(COALESCE(o.tipo_flujo_pago_deuda, ''))) <> 'DIRECTO_CAJA' AND COALESCE(o.flag_retenido, false) = true AND (
      (o.id_empresa_ingreso = 5 AND o.id_empresa_cuenta_ingreso = 33 AND o.id_banco_empresa_cuenta_ingreso = 3)
      OR (o.id_empresa_ingreso = 7 AND o.id_empresa_cuenta_ingreso = 16 AND o.id_banco_empresa_cuenta_ingreso = 4)
      OR (o.id_empresa_ingreso = 8 AND o.id_empresa_cuenta_ingreso = 7 AND o.id_banco_empresa_cuenta_ingreso = 3)
      OR (o.id_empresa_ingreso = 5 AND o.id_empresa_cuenta_ingreso = 4 AND o.id_banco_empresa_cuenta_ingreso = 2)
      OR (o.id_empresa_ingreso = 6 AND o.id_empresa_cuenta_ingreso = 5 AND o.id_banco_empresa_cuenta_ingreso = 2)
    ) THEN COALESCE(o.monto_deposito_cliente, 0) ELSE 0 END), 0) AS retenidos,
    COUNT(*) FILTER (WHERE UPPER(BTRIM(COALESCE(o.tipo_servicio, ''))) IN ('EFECTIVIZACION', 'POS') OR COALESCE(o.flag_derivado, false) = true)::integer AS total_efectivizacion,
    COUNT(*) FILTER (WHERE UPPER(BTRIM(COALESCE(o.tipo_servicio, ''))) = 'PAGO DEUDA')::integer AS total_pago_deuda
  FROM cierre c
  LEFT JOIN operaciones o ON o.closure_id = c.id
  LEFT JOIN manuales m ON m.closure_id = c.id
  GROUP BY c.id, c.ruta, c.saldo_inicial, c.saldo_actual, c.id_estado, c.id_usuario, c.fecha_registro,
           m.manual_ingresos, m.manual_salidas, m.manual_gastos
)
SELECT
  a.id,
  a.ruta,
  COALESCE(a.saldo_inicial, 0),
  COALESCE(a.saldo_actual, 0),
  a.recaudacion,
  a.manual_ingresos,
  a.salidas + a.manual_salidas,
  a.gastos + a.manual_gastos,
  a.ganancias,
  a.recaudacion,
  0::numeric,
  0::numeric,
  a.total_efectivizacion,
  a.total_pago_deuda,
  a.id_estado,
  est.nombre,
  a.id_usuario,
  u.nombre,
  a.fecha_registro,
  a.retenidos,
  0::numeric
FROM agregado a
LEFT JOIN public.tb_estado est ON est.id = a.id_estado
LEFT JOIN public.tb_usuario u ON u.id = a.id_usuario;
$$;

-- Verificacion final: genera los DROP de las funciones sincronizadas.
SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'f_apply_tb_operacion_caja_delta',
      'f_delete_tb_caja_operativa_cierre_ultimo_dia',
      'f_get_reporte_cierre',
      'f_get_tb_operacion_bandeja_unificada',
      'f_get_tb_operacion_saldo_actual_v2',
      'f_get_tb_pago_deuda_match_lote',
      'f_get_tb_ruta_operacion_ganancias_efectivizacion_v2',
      'f_get_tb_ruta_operacion_kpi_cierre_operaciones_v2',
      'f_get_tb_ruta_operacion_kpi_operaciones_v2',
      'f_patch_tb_caja_operativa_saldo_inicial',
      'f_patch_tb_operacion_proceso_devolver_derivacion',
      'f_patch_tb_operacion_proceso_directo_caja',
      'f_patch_tb_operacion_proceso_pagado',
      'f_patch_tb_operacion_proceso_pagado_lote',
      'f_patch_tb_operacion_proceso_reanudar',
      'f_patch_tb_operacion_proceso_reanudar_lote',
      'f_patch_tb_operacion_proceso_reanudar_post_cierre',
      'f_patch_tb_pago_deuda_salida',
      'f_post_tb_caja_operativa_cierre',
      'f_post_tb_caja_operativa_cierre_ruta',
      'f_post_tb_operacion_caja',
      'f_post_tb_operacion_caja_desde_proceso',
      'f_sync_tb_operacion_cierre_atribucion_v2'
  )
ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid);

COMMIT;
