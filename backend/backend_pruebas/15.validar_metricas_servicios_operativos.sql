-- Validacion manual y de solo lectura del dashboard de servicios operativos.
-- Ajustar las fechas y el usuario de consulta a datos existentes del ambiente.

BEGIN;

SELECT public.f_get_dashboard_metricas_servicios_resumen(
    'pago-deuda', DATE '2026-09-01', DATE '2026-09-30', 1
);

SELECT *
FROM public.f_get_dashboard_metricas_servicios_serie(
    'pago-deuda', DATE '2026-09-01', DATE '2026-09-30', 1
)
ORDER BY fecha;

SELECT *
FROM public.f_get_dashboard_metricas_servicios_sedes(
    'pago-deuda', DATE '2026-09-01', DATE '2026-09-30', 1
);

SELECT item
FROM public.f_get_dashboard_metricas_servicios_distribucion(
    'pos', DATE '2026-09-01', DATE '2026-09-30', 1
) AS d(item)
WHERE item->>'dimension' = 'entidad-tarjeta';

SELECT item
FROM public.f_get_dashboard_metricas_servicios_distribucion(
    'pos', DATE '2026-09-01', DATE '2026-09-30', 1
) AS d(item)
WHERE item->>'dimension' = 'banco-destino';

-- Verifica que POS y Link Pago devuelvan el detalle homologado por dimension.
WITH distribuciones AS (
    SELECT 'pos' AS servicio, item
    FROM public.f_get_dashboard_metricas_servicios_distribucion(
        'pos', DATE '2026-09-01', DATE '2026-09-30', 1
    ) AS d(item)
    WHERE item->>'dimension' IN ('entidad-tarjeta', 'banco-destino', 'pos')
    UNION ALL
    SELECT 'linkpago', item
    FROM public.f_get_dashboard_metricas_servicios_distribucion(
        'linkpago', DATE '2026-09-01', DATE '2026-09-30', 1
    ) AS d(item)
    WHERE item->>'dimension' = 'entidad-tarjeta'
)
SELECT
    servicio,
    item->>'dimension' AS dimension,
    item ?& ARRAY[
        'operaciones', 'pagadas', 'pendientes', 'monto_procesado',
        'salidas', 'ganancias', 'clientes_nuevos', 'tasa_exito'
    ] AS tiene_detalle_completo
FROM distribuciones;

SELECT *
FROM public.f_get_dashboard_metricas_servicios_desglose(
    'linkpago', DATE '2026-09-01', DATE '2026-09-30', 1
)
ORDER BY monto_procesado DESC, operaciones DESC;

SELECT public.f_get_dashboard_metricas_pago_deuda_analitica(
    DATE '2026-09-01', DATE '2026-09-30', 1, NULL, NULL, NULL
);

SELECT public.f_get_dashboard_metricas_pago_deuda_analitica(
    DATE '2026-09-01', DATE '2026-09-30', 1, NULL, NULL, NULL
)->'mejor_sede' AS mejor_sede;

SELECT public.f_get_dashboard_metricas_pago_deuda_analitica(
    DATE '2026-09-01', DATE '2026-09-30', 1, NULL, NULL, 1
)->'distribucion_bancos' AS bancos_de_sede;

-- Verifica el detalle homologado en las distribuciones analiticas.
WITH dashboard AS (
    SELECT public.f_get_dashboard_metricas_pago_deuda_analitica(
        DATE '2026-09-01', DATE '2026-09-30', 1, NULL, NULL, NULL
    ) AS data
), muestras AS (
    SELECT 'comisiones' AS distribucion, data->'comisiones'->0 AS fila FROM dashboard
    UNION ALL
    SELECT 'comunidades', data->'comunidades'->0 FROM dashboard
    UNION ALL
    SELECT 'clientes', data->'clientes'->0 FROM dashboard
)
SELECT
    distribucion,
    fila ?& ARRAY[
        'operaciones', 'atendidas', 'pendientes', 'recaudacion',
        'salida', 'ganancias', 'clientes_nuevos', 'tasa_atencion'
    ] AS tiene_detalle_completo
FROM muestras;

SELECT to_regprocedure(
    'public.f_get_dashboard_metricas_pago_deuda_analitica(date,date,bigint,bigint,bigint,bigint)'
) IS NOT NULL AS existe_pago_deuda_analitica;

-- Verifica que los tres servicios respondan con la misma firma de filtros.
SELECT servicio, resumen
FROM (
    VALUES
        ('pago-deuda', public.f_get_dashboard_metricas_servicios_resumen('pago-deuda', DATE '2026-09-01', DATE '2026-09-30', 1)),
        ('pos', public.f_get_dashboard_metricas_servicios_resumen('pos', DATE '2026-09-01', DATE '2026-09-30', 1)),
        ('linkpago', public.f_get_dashboard_metricas_servicios_resumen('linkpago', DATE '2026-09-01', DATE '2026-09-30', 1))
) AS validacion(servicio, resumen);

ROLLBACK;
