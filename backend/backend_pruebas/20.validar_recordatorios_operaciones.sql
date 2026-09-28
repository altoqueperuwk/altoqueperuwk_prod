-- Validacion de solo lectura para la bandeja de recordatorios operativos.
-- Ejecutar despues de 36.recordatorios_operaciones_pendientes.sql.

BEGIN;

-- 1. Contratos requeridos por el frontend. Debe devolver cero filas.
WITH contratos(firma) AS (
  VALUES
    ('public.f_get_tb_operacion_recordatorio_contexto(bigint)'::text),
    ('public.f_post_tb_operacion_recordatorio(bigint,smallint)'::text),
    ('public.f_get_tb_operacion_recordatorio_resumen()'::text),
    ('public.f_get_tb_operacion_recordatorio_bandeja(character varying,smallint,character varying,character varying,integer,integer)'::text),
    ('public.f_patch_tb_operacion_recordatorio_lectura(bigint)'::text)
)
SELECT firma AS contrato_faltante
FROM contratos
WHERE to_regprocedure(firma) IS NULL
ORDER BY firma;

-- 2. Las funciones publicas deben estar disponibles para authenticated y las
-- auxiliares privadas deben permanecer cerradas.
SELECT
  p.proname AS funcion,
  CASE
    WHEN p.proname LIKE 'f_private_%'
      THEN NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ELSE has_function_privilege('authenticated', p.oid, 'EXECUTE')
  END AS seguridad_correcta
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname LIKE '%operacion_recordatorio%'
ORDER BY p.proname;

-- 2.1. Los administradores y superadministradores activos deben superar la
-- autorizacion aun cuando no tengan una asignacion redundante de la ruta.
SELECT u.id, u.username, u.id_rol, u.flag_super_admin
FROM public.tb_usuario u
JOIN public.tb_estado e ON e.id = u.id_estado
WHERE UPPER(BTRIM(e.nombre)) = 'ACTIVO'
  AND (u.id_rol = 1 OR COALESCE(u.flag_super_admin, false))
  AND NOT public.f_private_operacion_recordatorio_puede_enviar(u.id);

-- 3. Integridad de recordatorios activos. Ambas consultas deben devolver cero filas.
SELECT id_operacion_proceso, id_usuario_destinatario, COUNT(*) AS activos
FROM public.tb_operacion_recordatorio
WHERE estado = 'PENDIENTE'
GROUP BY id_operacion_proceso, id_usuario_destinatario
HAVING COUNT(*) > 1;

SELECT r.id, r.id_operacion_proceso
FROM public.tb_operacion_recordatorio r
LEFT JOIN public.tb_operacion_proceso op ON op.id = r.id_operacion_proceso
WHERE op.id IS NULL;

-- 4. Coherencia entre nivel, estado y fechas. Debe devolver cero filas.
SELECT id, nivel_alerta, estado, fecha_cierre
FROM public.tb_operacion_recordatorio
WHERE nivel_alerta NOT BETWEEN 1 AND 3
   OR (estado = 'PENDIENTE' AND fecha_cierre IS NOT NULL)
   OR (estado IN ('CERRADO', 'ANULADO') AND fecha_cierre IS NULL);

-- 5. Diagnostico de recordatorios que se cerraran en la proxima lectura de
-- resumen o bandeja porque su operacion ya no esta pendiente.
SELECT id, id_operacion_proceso, servicio, nivel_alerta
FROM public.tb_operacion_recordatorio
WHERE estado = 'PENDIENTE'
  AND NOT public.f_private_operacion_recordatorio_pendiente(id_operacion_proceso)
ORDER BY id;

ROLLBACK;
