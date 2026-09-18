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

SELECT *
FROM public.f_get_dashboard_metricas_servicios_desglose(
    'linkpago', DATE '2026-09-01', DATE '2026-09-30', 1
)
ORDER BY monto_procesado DESC, operaciones DESC;

-- Verifica que los tres servicios respondan con la misma firma de filtros.
SELECT servicio, resumen
FROM (
    VALUES
        ('pago-deuda', public.f_get_dashboard_metricas_servicios_resumen('pago-deuda', DATE '2026-09-01', DATE '2026-09-30', 1)),
        ('pos', public.f_get_dashboard_metricas_servicios_resumen('pos', DATE '2026-09-01', DATE '2026-09-30', 1)),
        ('linkpago', public.f_get_dashboard_metricas_servicios_resumen('linkpago', DATE '2026-09-01', DATE '2026-09-30', 1))
) AS validacion(servicio, resumen);

ROLLBACK;
