-- 99_verificacion.sql
-- Baseline de Compensaciones (22/11/2026), generado desde la base de desarrollo. Solo lectura. Cada fila debe decir OK.
-- Requiere Core y Operaciones ya instalados. No ejecutar los archivos históricos.


SELECT 'tablas' AS prueba, count(*) AS encontrado, 65 AS esperado, CASE WHEN count(*) = 65 THEN 'OK' ELSE 'REVISAR' END AS estado
FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'tb\_compensacion%'
UNION ALL
SELECT 'funciones', count(*), 388, CASE WHEN count(*) = 388 THEN 'OK' ELSE 'REVISAR' END
FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname ILIKE '%compensacion%'
UNION ALL
SELECT 'tablas sin RLS', count(*), 0, CASE WHEN count(*) = 0 THEN 'OK' ELSE 'REVISAR' END
FROM pg_class WHERE relname LIKE 'tb\_compensacion%' AND relkind = 'r' AND NOT relrowsecurity
UNION ALL
SELECT 'funciones ejecutables por anon o PUBLIC', count(*), 0, CASE WHEN count(*) = 0 THEN 'OK' ELSE 'REVISAR' END
FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname ILIKE '%compensacion%'
  AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('public', p.oid, 'EXECUTE'))
UNION ALL
SELECT 'menús de Compensaciones', count(*), 26, CASE WHEN count(*) = 26 THEN 'OK' ELSE 'REVISAR' END
FROM public.tb_permiso_menu WHERE ruta LIKE '/compensaciones%'
UNION ALL
SELECT 'rutas retiradas aún en menú', count(*), 0, CASE WHEN count(*) = 0 THEN 'OK' ELSE 'REVISAR' END
FROM public.tb_permiso_menu WHERE ruta IN ('/compensaciones/asistencia','/compensaciones/liquidaciones','/compensaciones/cierres')
UNION ALL
SELECT 'conceptos retirados aún en catálogo', count(*), 0, CASE WHEN count(*) = 0 THEN 'OK' ELSE 'REVISAR' END
FROM public.tb_compensacion_concepto WHERE codigo IN ('SUELDO_BASE','BONO_HORAS_EXTRA','BONO_PUNTUALIDAD','PENALIDAD_TARDANZA','BONO_LIDERAZGO')
UNION ALL
SELECT 'funciones que citan tablas inexistentes', count(*), 0, CASE WHEN count(*) = 0 THEN 'OK' ELSE 'REVISAR' END
FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname ILIKE '%compensacion%'
  AND prosrc ~ 'tb_(asistencia|compensacion_(jornada|liquidacion|cierre|pago|aprobacion|ajuste|cuenta_pago|colaborador_importe))([^a-z_]|$)'
UNION ALL
SELECT 'llaves hacia operaciones', count(*), 0, CASE WHEN count(*) = 0 THEN 'OK' ELSE 'REVISAR' END
FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.tb_operacion_proceso'::regclass AND conrelid::regclass::text LIKE '%tb_compensacion%'
UNION ALL
SELECT 'rol Marketing con id 6', count(*), 1, CASE WHEN count(*) = 1 THEN 'OK' ELSE 'REVISAR' END
FROM public.tb_rol WHERE id = 6 AND upper(btrim(nombre)) = 'MARKETING';
