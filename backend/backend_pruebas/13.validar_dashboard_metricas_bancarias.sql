-- Validacion de solo lectura para 13.dashboard_metricas_bancarias.sql.
-- Ejecutar despues de desplegar las cuatro funciones en Supabase.

-- 1. Las cuatro firmas deben existir.
SELECT
  to_regprocedure(
    'public.f_get_dashboard_metricas_bancarias_hechos(date,date,character varying[],bigint,bigint,character varying[],character varying[])'
  ) IS NOT NULL AS existe_hechos,
  to_regprocedure(
    'public.f_get_dashboard_metricas_bancarias_resumen(date,date,character varying[],bigint,bigint,character varying[],character varying[],boolean)'
  ) IS NOT NULL AS existe_resumen,
  to_regprocedure(
    'public.f_get_dashboard_metricas_bancarias_serie(date,date,character varying,character varying[],bigint,bigint,character varying[],character varying[])'
  ) IS NOT NULL AS existe_serie,
  to_regprocedure(
    'public.f_get_dashboard_metricas_bancarias_desglose(date,date,character varying[],bigint,bigint,character varying[],character varying[])'
  ) IS NOT NULL AS existe_desglose;

-- 2. Resumen del mes vigente y comparacion automatica.
SELECT public.f_get_dashboard_metricas_bancarias_resumen(
  p_fecha_desde := DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date,
  p_fecha_hasta := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date,
  p_rutas := NULL,
  p_incluir_comparacion := true
) AS resumen;

-- 3. Serie mensual de los ultimos seis meses.
SELECT *
FROM public.f_get_dashboard_metricas_bancarias_serie(
  p_fecha_desde := (DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima') - interval '5 months')::date,
  p_fecha_hasta := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date,
  p_granularidad := 'MES'
);

-- 4. Consolidado del mes por ruta, empresa y cuenta.
SELECT *
FROM public.f_get_dashboard_metricas_bancarias_desglose(
  p_fecha_desde := DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date,
  p_fecha_hasta := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date
);

-- 5. Caso SafetyPay del mes. Debe incluir total_transferencia y
-- empresas_derivadas dentro del objeto safetypay.
SELECT public.f_get_dashboard_metricas_bancarias_resumen(
  p_fecha_desde := DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date,
  p_fecha_hasta := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date,
  p_rutas := ARRAY['safetypay']::character varying[],
  p_incluir_comparacion := false
) AS resumen_safetypay;

-- 6. Filtros de familia. DIRECTO solo debe producir ingresos informativos y
-- no Caja Recaudacion, Salidas, Gastos ni Ganancias.
SELECT public.f_get_dashboard_metricas_bancarias_resumen(
  p_fecha_desde := DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date,
  p_fecha_hasta := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date,
  p_familias := ARRAY['directo']::character varying[],
  p_incluir_comparacion := false
) AS resumen_directo;

-- 7. El contrato analitico usa margen de ganancia. Ganancias ya descuenta las
-- comisiones bancarias, por lo que no debe existir un segundo resultado que
-- vuelva a restar Gastos Operacionales.
WITH resultado AS (
  SELECT public.f_get_dashboard_metricas_bancarias_resumen(
    p_fecha_desde := DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date,
    p_fecha_hasta := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date,
    p_incluir_comparacion := false
  ) AS data
)
SELECT
  data -> 'actual' ? 'margen_ganancia' AS incluye_margen_ganancia,
  NOT (data -> 'actual' ? 'resultado_operativo') AS evita_doble_deduccion
FROM resultado;

-- 8. La funcion base tambien protege su consulta directa. Un rango superior a
-- 731 dias debe devolver cero hechos; las RPC publicas generan una excepcion.
SELECT COUNT(*) = 0 AS rango_directo_protegido
FROM public.f_get_dashboard_metricas_bancarias_hechos(
  p_fecha_desde := DATE '2024-01-01',
  p_fecha_hasta := DATE '2026-12-31'
);
