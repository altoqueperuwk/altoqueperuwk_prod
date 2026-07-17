-- 1. Cajas de Scotiabank
SELECT
  c.id,
  c.id_empresa,
  e.nombre AS empresa,
  c.id_empresa_cuenta_bancaria,
  b.nombre AS banco,
  c.fecha_apertura,
  c.saldo_inicial,
  c.saldo_actual,
  c.total_recaudado,
  c.ingresos,
  c.ingresos_retenido,
  c.gastos,
  c.ganancia,
  c.ganancia_retenido,
  c.salida,
  c.operaciones
FROM tb_caja_operativa c
JOIN tb_empresa e ON e.id = c.id_empresa
JOIN tb_empresa_cuenta_bancaria ecb ON ecb.id = c.id_empresa_cuenta_bancaria
JOIN tb_banco b ON b.id = ecb.id_banco
WHERE b.nombre ILIKE '%scotia%';

id|id_empresa|empresa|id_empresa_cuenta_bancaria|banco|fecha_apertura|saldo_inicial|saldo_actual|total_recaudado|ingresos|ingresos_retenido|gastos|ganancia|ganancia_retenido|salida|operaciones
4|8|Academia WK S.A.|7|SCOTIABANK|2026-07-16 17:57:10.042434 +00:00|79275.61|79275.61|0|0|0|0|0|0|0|0


-- 2. Cierres creados para esa caja
SELECT
  ch.id,
  ch.id_caja,
  ch.fecha_apertura,
  ch.fecha_cierre,
  ch.fecha_registro,
  ch.saldo_inicial,
  ch.saldo_actual,
  ch.total_recaudado,
  ch.ingresos,
  ch.ingresos_retenido,
  ch.gastos,
  ch.ganancia,
  ch.salida,
  ch.operaciones
FROM tb_caja_operativa_cierre ch
WHERE ch.id_caja IN (
  SELECT c.id
  FROM tb_caja_operativa c
  JOIN tb_empresa_cuenta_bancaria ecb ON ecb.id = c.id_empresa_cuenta_bancaria
  JOIN tb_banco b ON b.id = ecb.id_banco
  WHERE b.nombre ILIKE '%scotia%'
)
ORDER BY ch.id DESC
LIMIT 10;

id|id_caja|fecha_apertura|fecha_cierre|fecha_registro|saldo_inicial|saldo_actual|total_recaudado|ingresos|ingresos_retenido|gastos|ganancia|salida|operaciones
1|4|2026-07-16 17:56:06.981796 +00:00|2026-07-16 17:57:10.042434 +00:00|2026-07-16 17:57:10.042434 +00:00|100000|79275.61|0|0|67000|39.39|0|20685|10


-- 3. Operaciones Scotiabank del lote
SELECT
  op.id,
  op.codigo_operacion_deposito_cliente,
  op.dni_cliente,
  op.nombre_estado,
  op.tipo_servicio,
  op.flag_retenido,
  op.ruta_origen,
  op.ruta_destino,
  op.id_empresa_ingreso,
  op.id_empresa_cuenta_ingreso,
  op.id_empresa_salida,
  op.id_empresa_cuenta_salida,
  op.fecha_registro,
  op.fecha_deposito_cliente,
  op.fecha_pagado,
  op.fecha_retencion,
  op.id_caja_cierre,
  op.fecha_caja_cierre
FROM tb_operacion_proceso op
WHERE op.ruta_destino = 'scotiabank'
   OR op.ruta_origen = 'scotiabank'
ORDER BY op.id DESC
LIMIT 50;

id|codigo_operacion_deposito_cliente|dni_cliente|nombre_estado|tipo_servicio|flag_retenido|ruta_origen|ruta_destino|id_empresa_ingreso|id_empresa_cuenta_ingreso|id_empresa_salida|id_empresa_cuenta_salida|fecha_registro|fecha_deposito_cliente|fecha_pagado|fecha_retencion|id_caja_cierre|fecha_caja_cierre
7|4656014023|46418628|Pagado|Efectivizacion|true|scotiabank|scotiabank|8|7|8|7|2026-07-16 17:56:35.321668 +00:00|2026-07-15 17:56:35.321668 +00:00|2026-07-16 17:56:41.023612 +00:00|2026-07-16 17:56:35.321668 +00:00||
6|4656015563|47222520|Pagado|Efectivizacion|true|scotiabank|scotiabank|8|7|8|7|2026-07-16 17:56:35.321668 +00:00|2026-07-15 17:56:35.321668 +00:00|2026-07-16 17:56:41.237930 +00:00|2026-07-16 17:56:35.321668 +00:00||
5|4656014761|44206331|Pagado|Efectivizacion|true|scotiabank|scotiabank|8|7|8|7|2026-07-16 17:56:35.321668 +00:00|2026-07-15 17:56:35.321668 +00:00|2026-07-16 17:56:41.446924 +00:00|2026-07-16 17:56:35.321668 +00:00||
4|4651045123|43236020|Pendiente|Efectivizacion|true|scotiabank|scotiabank|8|7|8|7|2026-07-16 17:56:35.321668 +00:00|2026-07-15 17:56:35.321668 +00:00||2026-07-16 17:56:35.321668 +00:00||
3|4656022272|40068750|Pendiente|Efectivizacion|true|scotiabank|scotiabank|8|7|8|7|2026-07-16 17:56:35.321668 +00:00|2026-07-15 17:56:35.321668 +00:00||2026-07-16 17:56:35.321668 +00:00||
2|4656026189|47155715|Pendiente|Efectivizacion|true|scotiabank|scotiabank|8|7|8|7|2026-07-16 17:56:35.321668 +00:00|2026-07-15 17:56:35.321668 +00:00||2026-07-16 17:56:35.321668 +00:00||
1|4656011783|71909021|Pendiente|Efectivizacion|true|scotiabank|scotiabank|8|7|8|7|2026-07-16 17:56:35.321668 +00:00|2026-07-15 17:56:35.321668 +00:00||2026-07-16 17:56:35.321668 +00:00||


-- 4. Movimientos asociados a esas operaciones
SELECT
  oc.id,
  oc.id_operacion_proceso,
  oc.tipo_origen,
  oc.tipo_movimiento,
  oc.nombre_estado,
  oc.id_caja,
  oc.monto_ingreso,
  oc.monto_gasto,
  oc.monto_ganancia,
  oc.monto_salida,
  oc.fecha_registro,
  oc.id_caja_cierre,
  oc.fecha_caja_cierre
FROM tb_operacion_caja oc
WHERE oc.id_operacion_proceso IN (
  SELECT op.id
  FROM tb_operacion_proceso op
  WHERE op.ruta_destino = 'scotiabank'
     OR op.ruta_origen = 'scotiabank'
)
ORDER BY oc.id DESC
LIMIT 100;

id|id_operacion_proceso|tipo_origen|tipo_movimiento|nombre_estado|id_caja|monto_ingreso|monto_gasto|monto_ganancia|monto_salida|fecha_registro|id_caja_cierre|fecha_caja_cierre
10|5|OPERACION_PROCESO|SALIDA|Pagado|4|0|0.3|0|5910|2026-07-16 17:56:41.446924 +00:00||
9|6|OPERACION_PROCESO|SALIDA|Pagado|4|0|0.25|0|4925|2026-07-16 17:56:41.237930 +00:00||
8|7|OPERACION_PROCESO|SALIDA|Pagado|4|0|0.49|0|9850|2026-07-16 17:56:41.023612 +00:00||
7|7|EXCEL|INGRESO|Pagado|4|10000|5.5|144.01|0|2026-07-16 17:56:35.321668 +00:00||
6|6|EXCEL|INGRESO|Pagado|4|5000|5.25|69.5|0|2026-07-16 17:56:35.321668 +00:00||
5|5|EXCEL|INGRESO|Pagado|4|6000|5.3|84.4|0|2026-07-16 17:56:35.321668 +00:00||
4|4|EXCEL|INGRESO|Retenido|4|12000|5.6|113.81|0|2026-07-16 17:56:35.321668 +00:00||
3|3|EXCEL|INGRESO|Retenido|4|8000|5.4|74.2|0|2026-07-16 17:56:35.321668 +00:00||
2|2|EXCEL|INGRESO|Retenido|4|16000|5.8|153.41|0|2026-07-16 17:56:35.321668 +00:00||
1|1|EXCEL|INGRESO|Retenido|4|10000|5.5|94|0|2026-07-16 17:56:35.321668 +00:00||


-- 5. KPI actual de ruta
SELECT *
FROM tb_ruta_operacion_kpi
WHERE ruta = 'scotiabank';

id|ruta|caja_inicial|caja_actual|total_recaudado|ingresos|salidas|gastos_operacionales|ganancias|ingresos_retenidos|pendiente_depositar|total_efectivizacion|total_pago_deuda|id_estado|id_usuario|fecha_registro
7|scotiabank|79275.61|79275.61|0|0|0|0|0|0|0|7|0|1|1|2026-07-16 17:56:07.990421 +00:00


