-- Preflight de solo lectura para habilitar pruebas del frontend de Compensaciones.
-- Ejecutar despues de los scripts 17 al 35. La primera consulta debe devolver
-- cero filas y las columnas "listo" deben devolver true.

BEGIN;

-- 1. Contratos RPC indispensables para recorrer todas las pantallas.
WITH contratos(firma) AS (
  VALUES
    ('public.f_get_tb_compensacion_periodo(bigint,date,date,character varying)'::text),
    ('public.f_get_tb_compensacion_colaborador(bigint,character varying,bigint,bigint,bigint,date,integer,integer)'::text),
    ('public.f_get_tb_compensacion_usuario_elegible(character varying,bigint)'::text),
    ('public.f_get_tb_compensacion_usuario_acceso(character varying)'::text),
    ('public.f_get_tb_compensacion_jornada(bigint,character varying,bigint)'::text),
    ('public.f_get_tb_compensacion_evento_tipo(bigint,character varying,character varying,bigint)'::text),
    ('public.f_get_tb_asistencia_jornada(date,date,bigint,bigint,character varying,character varying,integer,integer)'::text),
    ('public.f_get_tb_compensacion_evento(bigint,character varying,character varying,bigint,bigint,bigint,date,date,character varying,integer,integer)'::text),
    ('public.f_get_tb_compensacion_incidencia(bigint,character varying,character varying,character varying,bigint,bigint,bigint,date,date,character varying,integer,integer)'::text),
    ('public.f_get_tb_compensacion_liquidacion(bigint,bigint,bigint,character varying,character varying,integer,integer)'::text),
    ('public.f_get_tb_compensacion_cierre(bigint,bigint,boolean)'::text),
    ('public.f_get_tb_compensacion_reporte_financiero(bigint,bigint,bigint)'::text),
    ('public.f_get_tb_compensacion_validacion_integral(bigint,boolean)'::text)
)
SELECT firma AS contrato_faltante
FROM contratos
WHERE to_regprocedure(firma) IS NULL
ORDER BY firma;

-- 2. La ficha laboral debe extender exactamente a un usuario del sistema.
SELECT
  NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_colaborador
    WHERE id_usuario IS NULL
  ) AS colaboradores_vinculados,
  NOT EXISTS (
    SELECT id_usuario
    FROM public.tb_compensacion_colaborador
    GROUP BY id_usuario
    HAVING COUNT(*) > 1
  ) AS usuarios_sin_ficha_duplicada;

-- 3. Funciones publicas disponibles para authenticated y privadas cerradas.
SELECT
  p.proname AS funcion,
  p.proname !~ '^f_private_' OR NOT has_function_privilege(
    'authenticated', p.oid, 'EXECUTE'
  ) AS seguridad_correcta,
  CASE
    WHEN p.proname ~ '^f_private_' THEN true
    ELSE has_function_privilege('authenticated', p.oid, 'EXECUTE')
  END AS ejecucion_correcta
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname LIKE 'f_%compensacion%'
ORDER BY p.proname;

-- 4. Preparacion funcional. No todos los indicadores tienen que estar listos
-- en una base vacia: muestran exactamente lo que debe configurarse desde el
-- frontend antes de probar calculo y cierre.
SELECT
  EXISTS (SELECT 1 FROM public.tb_usuario u JOIN public.tb_estado e ON e.id = u.id_estado WHERE UPPER(e.nombre) = 'ACTIVO') AS hay_usuarios_activos,
  EXISTS (SELECT 1 FROM public.tb_compensacion_cargo) AS hay_cargos,
  EXISTS (SELECT 1 FROM public.tb_compensacion_jornada) AS hay_jornadas,
  EXISTS (SELECT 1 FROM public.tb_compensacion_plan) AS hay_planes,
  EXISTS (SELECT 1 FROM public.tb_compensacion_concepto) AS hay_conceptos,
  EXISTS (SELECT 1 FROM public.tb_compensacion_evento_tipo) AS hay_tipos_evidencia,
  EXISTS (SELECT 1 FROM public.tb_compensacion_plan_version WHERE estado_version = 'PUBLICADA') AS hay_matriz_publicada,
  EXISTS (SELECT 1 FROM public.tb_compensacion_periodo WHERE estado_periodo <> 'CERRADO') AS hay_periodo_disponible;

-- 5. Hallazgos que deben resolverse antes de probar un cierre real.
SELECT *
FROM public.f_private_compensacion_validacion_hallazgos(NULL, true)
ORDER BY nivel, codigo, entidad, id_referencia;

ROLLBACK;
