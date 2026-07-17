-- ============================================================================
-- BACKFILL CONTROLADO: INGRESO + SALIDA PARA OPERACIONES HISTORICAS
-- ============================================================================
--
-- Uso:
-- 1. Ejecutar primero la vista previa.
-- 2. Ejecutar el bloque transaccional completo.
-- 3. Revisar el resultado.
-- 4. Cambiar ROLLBACK por COMMIT solo cuando la revision sea correcta.
--
-- Este script NO debe ejecutarse como parte del despliegue normal.

-- ============================================================================
-- 1. Vista previa de operaciones pagadas con INGRESO pero sin SALIDA
-- ============================================================================

SELECT
  op.id AS id_operacion,
  op.nombre_estado,
  op.tipo_servicio,
  op.nombre_codigo_servicio,
  op.id_empresa_ingreso,
  op.id_empresa_cuenta_ingreso,
  ingreso.id AS id_movimiento_ingreso,
  ingreso.id_caja AS id_caja_ingreso,
  op.id_empresa_salida,
  op.id_empresa_cuenta_salida,
  caja_salida.id AS id_caja_salida,
  op.monto_deposito_cliente,
  op.monto_transferencia_cliente,
  ingreso.monto_gasto AS gasto_actual_ingreso,
  (
    COALESCE(op.resultado_comision_banco_ingreso, 0) +
    COALESCE(op.monto_itf_ingreso, 0)
  ) AS gasto_ingreso_esperado,
  (
    COALESCE(op.resultado_comision_banco_salida, 0) +
    COALESCE(op.monto_itf_salida, 0)
  ) AS gasto_salida_esperado
FROM public.tb_operacion_proceso op
JOIN public.tb_operacion_caja ingreso
  ON ingreso.id_operacion_proceso = op.id
 AND UPPER(ingreso.tipo_movimiento) = 'INGRESO'
LEFT JOIN public.tb_operacion_caja salida
  ON salida.id_operacion_proceso = op.id
 AND UPPER(salida.tipo_movimiento) = 'SALIDA'
LEFT JOIN public.tb_caja_operativa caja_salida
  ON caja_salida.id_empresa = op.id_empresa_salida
 AND caja_salida.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_salida
WHERE UPPER(COALESCE(op.nombre_estado, '')) = 'PAGADO'
  AND salida.id IS NULL
ORDER BY op.id;

-- ============================================================================
-- 2. Backfill transaccional
-- ============================================================================

BEGIN;

DO $$
DECLARE
  r record;
  v_id_salida bigint;
  v_transferencia numeric;
  v_gasto_ingreso numeric;
  v_gasto_salida numeric;
  v_ganancia numeric;
  v_ingreso_saldo_actual numeric;
  v_salida_saldo_anterior numeric;
  v_salida_saldo_actual numeric;
BEGIN
  FOR r IN
    SELECT
      op.*,
      ingreso.id AS id_movimiento_ingreso,
      ingreso.id_caja AS id_caja_ingreso,
      ingreso.saldo_anterior AS ingreso_saldo_anterior,
      ingreso.saldo_actual AS ingreso_saldo_actual_original,
      caja_salida.id AS id_caja_salida,
      caja_salida.saldo_actual AS caja_salida_saldo_actual
    FROM public.tb_operacion_proceso op
    JOIN public.tb_operacion_caja ingreso
      ON ingreso.id_operacion_proceso = op.id
     AND UPPER(ingreso.tipo_movimiento) = 'INGRESO'
    LEFT JOIN public.tb_operacion_caja salida
      ON salida.id_operacion_proceso = op.id
     AND UPPER(salida.tipo_movimiento) = 'SALIDA'
    JOIN public.tb_caja_operativa caja_salida
      ON caja_salida.id_empresa = op.id_empresa_salida
     AND caja_salida.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_salida
    WHERE UPPER(COALESCE(op.nombre_estado, '')) = 'PAGADO'
      AND salida.id IS NULL
    ORDER BY op.id
  LOOP
    v_transferencia := COALESCE(r.monto_transferencia_cliente, r.monto_deposito_cliente, 0);
    v_gasto_ingreso := COALESCE(r.resultado_comision_banco_ingreso, 0) + COALESCE(r.monto_itf_ingreso, 0);
    v_gasto_salida := COALESCE(r.resultado_comision_banco_salida, 0) + COALESCE(r.monto_itf_salida, 0);
    v_ganancia := GREATEST(COALESCE(r.monto_deposito_cliente, 0) - v_transferencia - v_gasto_ingreso - v_gasto_salida, 0);
    v_ingreso_saldo_actual := COALESCE(r.ingreso_saldo_anterior, 0) + COALESCE(r.monto_deposito_cliente, 0) - v_gasto_ingreso;

    IF r.id_caja_ingreso = r.id_caja_salida THEN
      v_salida_saldo_anterior := v_ingreso_saldo_actual;
    ELSE
      v_salida_saldo_anterior := COALESCE(r.caja_salida_saldo_actual, 0);
    END IF;

    v_salida_saldo_actual := v_salida_saldo_anterior - v_transferencia - v_gasto_salida;

    IF v_salida_saldo_actual < 0 THEN
      RAISE EXCEPTION 'Backfill cancelado: la operacion % deja saldo negativo en caja de salida %', r.id, r.id_caja_salida;
    END IF;

    UPDATE public.tb_operacion_caja
    SET monto_gasto = v_gasto_ingreso,
        monto_ganancia = v_ganancia,
        saldo_actual = v_ingreso_saldo_actual,
        id_estado = r.id_estado,
        nombre_estado = r.nombre_estado,
        id_usuario = COALESCE(r.id_usuario_gestor, r.id_usuario),
        nombre_usuario = COALESCE(r.nombre_usuario_gestor, r.nombre_usuario)
    WHERE id = r.id_movimiento_ingreso;

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
    SELECT
      c.id,
      r.id_movimiento_ingreso,
      r.id,
      'BACKFILL',
      'SALIDA',
      r.id_codigo_servicio,
      r.nombre_codigo_servicio,
      r.dni_cliente,
      r.nombre_cliente,
      r.codigo_operacion_deposito_cliente,
      'Backfill salida comercial',
      c.id_empresa,
      e.nombre,
      c.id_empresa_cuenta_bancaria,
      ecb.id_banco,
      b.nombre,
      COALESCE(r.id_banco_cliente_transferencia, r.id_banco_cliente),
      COALESCE(r.nombre_banco_cliente_transferencia, r.nombre_banco_cliente),
      0,
      v_gasto_salida,
      0,
      v_transferencia,
      true,
      v_salida_saldo_anterior,
      v_salida_saldo_actual,
      r.id_estado,
      r.nombre_estado,
      COALESCE(r.id_usuario_gestor, r.id_usuario),
      COALESCE(r.nombre_usuario_gestor, r.nombre_usuario),
      COALESCE(r.tipo_facturacion, 'Boleta')
    FROM public.tb_caja_operativa c
    JOIN public.tb_empresa e ON e.id = c.id_empresa
    JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = c.id_empresa_cuenta_bancaria
    JOIN public.tb_banco b ON b.id = ecb.id_banco
    WHERE c.id = r.id_caja_salida
    RETURNING id INTO v_id_salida;

    UPDATE public.tb_operacion_caja
    SET id_operacion_caja_relacionada = v_id_salida
    WHERE id = r.id_movimiento_ingreso;

    UPDATE public.tb_caja_operativa
    SET gastos = GREATEST(COALESCE(gastos, 0) - v_transferencia - v_gasto_salida, 0),
        saldo_actual = CASE
          WHEN id = r.id_caja_salida THEN saldo_actual
          ELSE COALESCE(saldo_actual, 0) + v_transferencia + v_gasto_salida
        END,
        saldo_total = CASE
          WHEN id = r.id_caja_salida THEN saldo_total
          ELSE COALESCE(saldo_actual, 0) + v_transferencia + v_gasto_salida
        END
    WHERE id = r.id_caja_ingreso;

    UPDATE public.tb_caja_operativa
    SET gastos = COALESCE(gastos, 0) + v_gasto_salida,
        salida = COALESCE(salida, 0) + v_transferencia,
        operaciones = COALESCE(operaciones, 0) + 1,
        saldo_actual = v_salida_saldo_actual,
        saldo_total = v_salida_saldo_actual
    WHERE id = r.id_caja_salida;
  END LOOP;
END;
$$;

SELECT
  op.id AS id_operacion,
  COUNT(*) FILTER (WHERE UPPER(oc.tipo_movimiento) = 'INGRESO') AS ingresos,
  COUNT(*) FILTER (WHERE UPPER(oc.tipo_movimiento) = 'SALIDA') AS salidas
FROM public.tb_operacion_proceso op
JOIN public.tb_operacion_caja oc ON oc.id_operacion_proceso = op.id
WHERE UPPER(COALESCE(op.nombre_estado, '')) = 'PAGADO'
GROUP BY op.id
HAVING COUNT(*) FILTER (WHERE UPPER(oc.tipo_movimiento) = 'INGRESO') > 0
   AND COUNT(*) FILTER (WHERE UPPER(oc.tipo_movimiento) = 'SALIDA') = 0
ORDER BY op.id;

-- Cambiar a COMMIT cuando la revision sea correcta.
ROLLBACK;
