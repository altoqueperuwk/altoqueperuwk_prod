-- Validacion integral y de solo lectura del modulo de compensaciones.
-- Ejecutar despues de los scripts 17 al 34 con el rol propietario de la base.
-- Ninguna consulta corrige datos. Los ERROR deben devolver cero filas; las
-- ADVERTENCIAS requieren decision operativa antes de cerrar el periodo.

BEGIN;

-- 1. Las firmas de validacion deben existir.
SELECT
  to_regprocedure(
    'public.f_private_compensacion_validacion_hallazgos(bigint,boolean)'
  ) IS NOT NULL AS existe_helper,
  to_regprocedure(
    'public.f_get_tb_compensacion_validacion_integral(bigint,boolean)'
  ) IS NOT NULL AS existe_validacion,
  to_regprocedure(
    'public.f_get_tb_compensacion_conciliacion_periodo(bigint,bigint,bigint,boolean)'
  ) IS NOT NULL AS existe_conciliacion;

-- 2. Resumen global. Debe indicar cero errores.
WITH hallazgos AS (
  SELECT *
  FROM public.f_private_compensacion_validacion_hallazgos(NULL, true)
)
SELECT
  COUNT(*) FILTER (WHERE nivel = 'ERROR') AS errores,
  COUNT(*) FILTER (WHERE nivel = 'ADVERTENCIA') AS advertencias,
  COUNT(*) AS total_hallazgos
FROM hallazgos;

-- 3. Debe devolver cero filas. Es la salida que bloquea un despliegue o cierre.
SELECT *
FROM public.f_private_compensacion_validacion_hallazgos(NULL, false)
WHERE nivel = 'ERROR'
ORDER BY codigo, entidad, id_referencia;

-- 4. Pendientes operativos. Pueden existir en meses abiertos, pero deben
-- resolverse o aceptarse expresamente antes del cierre.
SELECT *
FROM public.f_private_compensacion_validacion_hallazgos(NULL, true)
WHERE nivel = 'ADVERTENCIA'
ORDER BY codigo, entidad, id_referencia;

-- 5. Resumen de integridad por periodo para localizar el mes afectado.
SELECT
  pe.id AS id_periodo,
  pe.periodo,
  pe.estado_periodo,
  COUNT(h.codigo) FILTER (WHERE h.nivel = 'ERROR') AS errores,
  COUNT(h.codigo) FILTER (WHERE h.nivel = 'ADVERTENCIA') AS advertencias
FROM public.tb_compensacion_periodo pe
LEFT JOIN LATERAL public.f_private_compensacion_validacion_hallazgos(
  pe.id,
  true
) h ON true
GROUP BY pe.id, pe.periodo, pe.estado_periodo
ORDER BY pe.periodo DESC;

-- 6. Los helpers privados no deben estar disponibles para roles de API y las
-- RPC publicas no deben ser ejecutables por anon.
SELECT
  p.proname AS funcion,
  p.prosecdef AS security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_puede_ejecutar,
  has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AS authenticated_puede_ejecutar
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'f_private_compensacion_validacion_hallazgos',
    'f_get_tb_compensacion_validacion_integral',
    'f_get_tb_compensacion_conciliacion_periodo'
  )
ORDER BY p.proname;

-- Ejecucion funcional autenticada sugerida:
-- SELECT public.f_get_tb_compensacion_validacion_integral(<id_periodo>, true);
-- SELECT public.f_get_tb_compensacion_conciliacion_periodo(
--   <id_periodo>, NULL, NULL, true
-- );

-- 7. Las fuentes operativas configuradas deben pertenecer al catalogo
-- soportado y utilizar conceptos/tipos de calculo compatibles. Debe devolver
-- cero filas.
SELECT
  r.id AS id_regla,
  r.id_plan_version,
  r.configuracion ->> 'fuente_operacion' AS fuente_operacion,
  r.tipo_calculo,
  c.codigo AS concepto_codigo,
  c.categoria,
  c.naturaleza
FROM public.tb_compensacion_regla r
JOIN public.tb_compensacion_concepto c ON c.id = r.id_concepto
WHERE NULLIF(r.configuracion ->> 'fuente_operacion', '') IS NOT NULL
  AND (
    r.configuracion ->> 'fuente_operacion' NOT IN (
      'OPERACION_PAGADA_GESTOR',
      'CLIENTE_NUEVO_EFECTIVIZADO_7_DIAS'
    )
    OR r.tipo_calculo NOT IN ('FIJO', 'POR_UNIDAD', 'PORCENTAJE')
    OR c.categoria NOT IN ('BONO', 'COMISION')
    OR c.naturaleza <> 'INGRESO'
  )
ORDER BY r.id;

-- 8. Inventario de reglas que convierten actividad de tb_usuario en importes
-- de liquidacion. Permite revisar explicitamente que no se haya activado una
-- fuente por error antes de publicar o cerrar un periodo.
SELECT
  p.codigo AS plan,
  pv.numero_version,
  pv.estado_version,
  c.codigo AS concepto,
  r.configuracion ->> 'fuente_operacion' AS fuente_operacion,
  r.tipo_calculo,
  r.monto,
  r.porcentaje,
  r.valor_minimo,
  r.valor_maximo,
  r.tope_importe,
  r.prioridad
FROM public.tb_compensacion_regla r
JOIN public.tb_compensacion_plan_version pv ON pv.id = r.id_plan_version
JOIN public.tb_compensacion_plan p ON p.id = pv.id_plan
JOIN public.tb_compensacion_concepto c ON c.id = r.id_concepto
WHERE NULLIF(r.configuracion ->> 'fuente_operacion', '') IS NOT NULL
ORDER BY p.codigo, pv.numero_version, c.codigo, r.prioridad DESC;

-- 9. Una liquidacion no debe contener dos veces la misma operacion para la
-- misma regla. Debe devolver cero filas.
SELECT
  d.id_liquidacion,
  d.id_operacion,
  d.id_regla,
  COUNT(*) AS repeticiones
FROM public.tb_compensacion_liquidacion_detalle d
WHERE d.tipo_origen = 'OPERACION'
GROUP BY d.id_liquidacion, d.id_operacion, d.id_regla
HAVING COUNT(*) > 1
ORDER BY d.id_liquidacion, d.id_operacion, d.id_regla;

-- 10. Advertencias especificas de usuarios operativos sin ficha laboral.
-- Deben resolverse vinculando cada tb_usuario con un colaborador; no se debe
-- duplicar ni modificar tb_usuario.
SELECT *
FROM public.f_private_compensacion_validacion_hallazgos(NULL, true)
WHERE codigo IN (
  'USUARIO_GESTOR_SIN_FICHA',
  'USUARIO_REGISTRO_SIN_FICHA'
)
ORDER BY codigo, id_referencia;

ROLLBACK;
