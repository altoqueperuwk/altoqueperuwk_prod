SELECT
    c.*,
    c.fecha_apertura AT TIME ZONE 'America/Lima' AS apertura_lima,
    c.fecha_cierre AT TIME ZONE 'America/Lima' AS cierre_lima
FROM public.tb_caja_operativa_cierre c
WHERE c.id = 37;

id|id_caja|id_empresa|id_empresa_cuenta_bancaria|saldo_inicial|saldo_actual|total_recaudado|ingresos|ingresos_retenido|gastos|ganancia|ganancia_retenido|salida|operaciones|id_estado|id_usuario|fecha_apertura|fecha_cierre|kpi_snapshot|fecha_registro|saldo_total|fuera_horario|apertura_lima|cierre_lima
37|4|8|7|0|8900|0|0|15998|21.15|78.25|148.53|0|4|1|1|2026-08-21 04:16:37.846007 +00:00|2026-08-21 04:19:39.244703 +00:00|"{""id"": 5, ""ruta"": ""scotiabank"", ""gastos"": 21.15, ""salidas"": 0, ""ganancia"": 78.25, ""ingresos"": 0, ""ganancias"": 226.78, ""id_estado"": 1, ""id_usuario"": 1, ""caja_actual"": 8900, ""caja_inicial"": 0, ""fuera_horario"": 0, ""nombre_estado"": ""Activo"", ""fecha_registro"": ""2026-08-08T11:56:59.612947+00:00"", ""nombre_usuario"": ""jhon"", ""total_recaudado"": 0, ""total_pago_deuda"": 0, ""ingresos_retenido"": 15998.00, ""ingresos_retenidos"": 15998.00, ""pendiente_depositar"": 8811, ""gastos_operacionales"": 21.15, ""total_efectivizacion"": 4}"|2026-08-21 04:19:39.244703 +00:00|8900|0|2026-08-20 23:16:37.846007|2026-08-20 23:19:39.244703


SELECT
    c.id AS id_cierre,
    c.id_caja,
    c.id_empresa,
    e.nombre AS empresa,
    c.id_empresa_cuenta_bancaria,
    b.nombre AS banco,
    ca.saldo_inicial,
    ca.saldo_actual,
    ca.saldo_total
FROM public.tb_caja_operativa_cierre c
JOIN public.tb_caja_operativa ca
    ON ca.id = c.id_caja
JOIN public.tb_empresa e
    ON e.id = c.id_empresa
JOIN public.tb_empresa_cuenta_bancaria ecb
    ON ecb.id = c.id_empresa_cuenta_bancaria
JOIN public.tb_banco b
    ON b.id = ecb.id_banco
WHERE c.id = 37;
id_cierre|id_caja|id_empresa|empresa|id_empresa_cuenta_bancaria|banco|saldo_inicial|saldo_actual|saldo_total
37|4|8|Academia WK S.A.|7|Scotiabank|0|0|0


SELECT
    id,
    fecha_cierre,
    saldo_inicial,
    saldo_actual,
    saldo_total,
    total_recaudado,
    ingresos,
    ingresos_retenido,
    fuera_horario,
    gastos,
    ganancia,
    ganancia_retenido,
    salida,
    operaciones,
    jsonb_pretty(kpi_snapshot) AS kpi_snapshot
FROM public.tb_caja_operativa_cierre
WHERE id = 37;
id|fecha_cierre|saldo_inicial|saldo_actual|saldo_total|total_recaudado|ingresos|ingresos_retenido|fuera_horario|gastos|ganancia|ganancia_retenido|salida|operaciones
37|2026-08-21 04:19:39.244703 +00:00|0|8900|8900|0|0|15998|0|21.15|78.25|148.53|0|4


SELECT
    op.id,
    op.id_caja_cierre,
    op.fecha_caja_cierre,
    op.id_codigo_servicio,
    op.nombre_codigo_servicio,
    op.tipo_servicio,
    op.dni_cliente,
    op.codigo_operacion_deposito_cliente,
    op.monto_deposito_cliente,
    op.monto_transferencia_cliente,
    op.nombre_estado,
    op.flag_retenido,
    op.flag_fuera_horario,
    op.fecha_deposito_cliente,
    op.fecha_pagado
FROM public.tb_operacion_proceso op
WHERE op.id_caja_cierre = 37
ORDER BY op.id;


SELECT
    m.id,
    m.id_caja,
    m.id_caja_cierre,
    m.fecha_caja_cierre,
    m.id_operacion_proceso,
    m.tipo_origen,
    m.tipo_movimiento,
    m.detalle,
    m.dni_cliente,
    m.codigo_operacion,
    m.monto_ingreso,
    m.monto_salida,
    m.monto_gasto,
    m.monto_ganancia,
    m.saldo_anterior,
    m.saldo_actual,
    m.flag_contabiliza_operacion,
    m.fecha_registro
FROM public.tb_operacion_caja m
WHERE m.id_caja_cierre = 37
ORDER BY m.id;
id|id_caja|id_caja_cierre|fecha_caja_cierre|id_operacion_proceso|tipo_origen|tipo_movimiento|detalle|dni_cliente|codigo_operacion|monto_ingreso|monto_salida|monto_gasto|monto_ganancia|saldo_anterior|saldo_actual|flag_contabiliza_operacion|fecha_registro
14549|4|37|2026-08-21 04:19:39.244703 +00:00|14184|EFECTIVIZACION|INGRESO|Operacion comercial de ingreso|07969460|4651049158|3900|0|5.15|33.7|0|3900|true|2026-08-21 04:17:28.568774 +00:00
14550|4|37|2026-08-21 04:19:39.244703 +00:00|14185|EFECTIVIZACION|INGRESO|Operacion comercial de ingreso|73933624|4651045190|5000|0|5.25|44.55|3900|8900|true|2026-08-21 04:17:28.568774 +00:00
14551|4|37|2026-08-21 04:19:39.244703 +00:00|14186|EFECTIVIZACION|INGRESO|Operacion comercial de ingreso|41111635|4651038071|10000|0|5.5|94.05|8900|8900|true|2026-08-21 04:17:28.568774 +00:00
14552|4|37|2026-08-21 04:19:39.244703 +00:00|14187|EFECTIVIZACION|INGRESO|Operacion comercial de ingreso|06132627|4651031510|5998|0|5.25|54.48|8900|8900|true|2026-08-21 04:17:28.568774 +00:00


SELECT DISTINCT
    op.id,
    op.nombre_estado,
    op.id_caja_cierre AS cierre_en_operacion,
    op.fecha_caja_cierre AS fecha_cierre_en_operacion,
    op.flag_retenido,
    op.flag_fuera_horario,
    m.id AS id_movimiento,
    m.tipo_movimiento,
    m.tipo_origen,
    m.id_caja_cierre AS cierre_en_movimiento,
    m.monto_ingreso,
    m.monto_salida,
    m.monto_gasto,
    m.monto_ganancia
FROM public.tb_operacion_proceso op
JOIN public.tb_operacion_caja m
    ON m.id_operacion_proceso = op.id
WHERE m.id_caja_cierre = 37
ORDER BY op.id, m.id;
id|nombre_estado|cierre_en_operacion|fecha_cierre_en_operacion|flag_retenido|flag_fuera_horario|id_movimiento|tipo_movimiento|tipo_origen|cierre_en_movimiento|monto_ingreso|monto_salida|monto_gasto|monto_ganancia
14184|Pendiente|||false|false|14549|INGRESO|EFECTIVIZACION|37|3900|0|5.15|33.7
14185|Pendiente|||false|false|14550|INGRESO|EFECTIVIZACION|37|5000|0|5.25|44.55
14186|Pendiente|||true|false|14551|INGRESO|EFECTIVIZACION|37|10000|0|5.5|94.05
14187|Pendiente|||true|false|14552|INGRESO|EFECTIVIZACION|37|5998|0|5.25|54.48


SELECT
    COALESCE(op.nombre_estado, 'SIN ESTADO') AS estado,
    COUNT(*) AS cantidad,
    COALESCE(SUM(op.monto_deposito_cliente), 0) AS monto_deposito,
    COALESCE(SUM(op.monto_transferencia_cliente), 0) AS monto_transferencia,
    COUNT(*) FILTER (WHERE op.flag_retenido) AS retenidas,
    COUNT(*) FILTER (WHERE op.flag_fuera_horario) AS fuera_horario
FROM public.tb_operacion_proceso op
WHERE op.id_caja_cierre = 37
GROUP BY op.nombre_estado
ORDER BY op.nombre_estado;

SELECT
    m.tipo_origen,
    m.tipo_movimiento,
    COUNT(*) AS cantidad,
    SUM(m.monto_ingreso) AS total_ingreso,
    SUM(m.monto_salida) AS total_salida,
    SUM(m.monto_gasto) AS total_gasto,
    SUM(m.monto_ganancia) AS total_ganancia
FROM public.tb_operacion_caja m
WHERE m.id_caja_cierre = 37
GROUP BY m.tipo_origen, m.tipo_movimiento
ORDER BY m.tipo_origen, m.tipo_movimiento;
tipo_origen|tipo_movimiento|cantidad|total_ingreso|total_salida|total_gasto|total_ganancia
EFECTIVIZACION|INGRESO|4|24898|0|21.15|226.78


SELECT DISTINCT
    op.id,
    op.nombre_estado,
    op.dni_cliente,
    op.monto_deposito_cliente,
    op.monto_transferencia_cliente,
    op.flag_retenido,
    op.flag_fuera_horario,
    op.id_caja_cierre,
    m.id AS id_movimiento,
    m.tipo_movimiento,
    m.id_caja_cierre AS id_cierre_movimiento
FROM public.tb_operacion_proceso op
JOIN public.tb_operacion_caja m
    ON m.id_operacion_proceso = op.id
WHERE m.id_caja_cierre = 37
  AND UPPER(BTRIM(COALESCE(op.nombre_estado, '')))
      IN ('PENDIENTE', 'RECHAZADO', 'SOLICITADO', 'PROCESADO')
ORDER BY op.id;
id|nombre_estado|dni_cliente|monto_deposito_cliente|monto_transferencia_cliente|flag_retenido|flag_fuera_horario|id_caja_cierre|id_movimiento|tipo_movimiento|id_cierre_movimiento
14184|Pendiente|07969460|3900.00|3861|false|false||14549|INGRESO|37
14185|Pendiente|73933624|5000.00|4950|false|false||14550|INGRESO|37
14186|Pendiente|41111635|10000.00|9900|true|false||14551|INGRESO|37
14187|Pendiente|06132627|5998.00|5938.02|true|false||14552|INGRESO|37

SELECT
    op.id,
    op.nombre_estado,
    op.id_caja_cierre,
    op.fecha_caja_cierre,
    COUNT(m.id) AS movimientos_cerrados
FROM public.tb_operacion_proceso op
LEFT JOIN public.tb_operacion_caja m
    ON m.id_operacion_proceso = op.id
   AND m.id_caja_cierre = 37
WHERE op.id_caja_cierre = 37
GROUP BY op.id, op.nombre_estado, op.id_caja_cierre, op.fecha_caja_cierre
HAVING COUNT(m.id) = 0;

SELECT
    m.*
FROM public.tb_operacion_caja m
WHERE m.id_caja_cierre = 37
  AND m.id_operacion_proceso IS NULL
ORDER BY m.id;


SELECT
    m.id,
    m.id_caja,
    m.id_operacion_proceso,
    m.tipo_origen,
    m.tipo_movimiento,
    m.monto_ingreso,
    m.monto_salida,
    m.monto_gasto,
    m.monto_ganancia,
    m.id_caja_cierre,
    m.fecha_registro
FROM public.tb_operacion_caja m
JOIN public.tb_caja_operativa_cierre c
    ON c.id_caja = m.id_caja
WHERE c.id = 37
  AND m.id_caja_cierre IS NULL
ORDER BY m.id;


SELECT
    ca.*,
    ca.fecha_apertura AT TIME ZONE 'America/Lima' AS apertura_lima
FROM public.tb_caja_operativa ca
WHERE ca.id = (
    SELECT id_caja
    FROM public.tb_caja_operativa_cierre
    WHERE id = 37
);
id|id_empresa|id_empresa_cuenta_bancaria|saldo_inicial|saldo_actual|total_recaudado|ingresos|ingresos_retenido|gastos|ganancia|ganancia_retenido|salida|operaciones|flag_retencion|id_estado|id_usuario|fecha_apertura|fecha_registro|saldo_total|fuera_horario|apertura_lima
4|8|7|0|0|0|0|0|0|0|0|0|0|false|1|1|2026-08-21 04:19:39.244703 +00:00|2026-07-15 20:45:57.454115 +00:00|0|0|2026-08-20 23:19:39.244703


SELECT
    c.id AS id_cierre,
    c.saldo_actual AS saldo_historico,
    ca.saldo_actual AS saldo_vivo,
    c.gastos AS gastos_historicos,
    ca.gastos AS gastos_vivos,
    c.ganancia AS ganancia_historica,
    ca.ganancia AS ganancia_viva,
    c.salida AS salida_historica,
    ca.salida AS salida_viva,
    c.operaciones AS operaciones_historicas,
    ca.operaciones AS operaciones_vivas
FROM public.tb_caja_operativa_cierre c
JOIN public.tb_caja_operativa ca
    ON ca.id = c.id_caja
WHERE c.id = 37;
id_cierre|saldo_historico|saldo_vivo|gastos_historicos|gastos_vivos|ganancia_historica|ganancia_viva|salida_historica|salida_viva|operaciones_historicas|operaciones_vivas
37|8900|0|21.15|0|78.25|0|0|0|4|0


SELECT *
FROM public.f_get_tb_caja_operativa_cierre(
    p_id_caja := (
        SELECT id_caja
        FROM public.tb_caja_operativa_cierre
        WHERE id = 37
    )
);
id|id_caja|id_empresa|nombre_empresa|id_empresa_cuenta_bancaria|id_banco|nombre_banco|saldo_inicial|saldo_total|saldo_actual|total_recaudado|ingresos|ingresos_retenido|gastos|ganancia|ganancia_retenido|salida|operaciones|id_estado|nombre_estado|id_usuario|nombre_usuario|fecha_apertura|fecha_cierre|kpi_snapshot|fecha_registro
37|4|8|Academia WK S.A.|7|3|Scotiabank|0|8900|8900|8900|0|15998|21.15|78.25|148.53|0|4|1|Activo|1|jhon|2026-08-21 04:16:37.846007 +00:00|2026-08-21 04:19:39.244703 +00:00|"{""id"": 5, ""ruta"": ""scotiabank"", ""gastos"": 21.15, ""salidas"": 0, ""ganancia"": 78.25, ""ingresos"": 0, ""ganancias"": 226.78, ""id_estado"": 1, ""id_usuario"": 1, ""caja_actual"": 8900, ""caja_inicial"": 0, ""fuera_horario"": 0, ""nombre_estado"": ""Activo"", ""fecha_registro"": ""2026-08-08T11:56:59.612947+00:00"", ""nombre_usuario"": ""jhon"", ""total_recaudado"": 0, ""total_pago_deuda"": 0, ""ingresos_retenido"": 15998.00, ""ingresos_retenidos"": 15998.00, ""pendiente_depositar"": 8811, ""gastos_operacionales"": 21.15, ""total_efectivizacion"": 4}"|2026-08-21 04:19:39.244703 +00:00


SELECT *
FROM public.f_get_tb_operacion_caja(
    p_id_caja := (
        SELECT id_caja
        FROM public.tb_caja_operativa_cierre
        WHERE id = 37
    )
);


