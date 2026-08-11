/*
CONSTATACION PREVIA DE DATOS OPERATIVOS

Objetivo:
  empresas: 5 (Capital Nova S.A.) y 8 (Academia WK S.A.)
  cuentas bancarias: 33 y 7 (Scotiabank)
  cajas operativas: 32 y 4
  ruta: scotiabank

Este archivo contiene unicamente consultas de lectura.
No crea tablas temporales, no actualiza y no elimina informacion.
Cada consulta puede ejecutarse de manera independiente.
*/

/* 1. Empresa, cuenta bancaria, banco, caja y ruta objetivo. */
SELECT
  e.id AS id_empresa,
  e.nombre AS empresa,
  ecb.id AS id_empresa_cuenta_bancaria,
  b.id AS id_banco,
  b.nombre AS banco,
  c.id AS id_caja,
  c.saldo_inicial,
  c.saldo_actual,
  rc.id AS id_ruta_operacion_caja,
  rc.ruta,
  rc.id_estado AS id_estado_ruta
FROM public.tb_empresa e
JOIN public.tb_empresa_cuenta_bancaria ecb
  ON ecb.id_empresa = e.id
LEFT JOIN public.tb_banco b
  ON b.id = ecb.id_banco
LEFT JOIN public.tb_caja_operativa c
  ON c.id_empresa = e.id
 AND c.id_empresa_cuenta_bancaria = ecb.id
LEFT JOIN public.tb_ruta_operacion_caja rc
  ON rc.id_empresa = e.id
 AND rc.id_empresa_cuenta_bancaria = ecb.id
WHERE e.id IN (5, 8)
  AND ecb.id IN (7, 33)
  AND ecb.id_banco = 3
  AND c.id IN (4, 32)
ORDER BY e.id, ecb.id;

/* 2. Resumen de operaciones por empresa, cuenta, flujo y estado. */
SELECT
  relacion.id_empresa,
  empresa.nombre AS empresa,
  relacion.id_empresa_cuenta_bancaria,
  banco.nombre AS banco,
  op.tipo_servicio,
  op.nombre_estado,
  COUNT(DISTINCT op.id) AS cantidad_operaciones
FROM public.tb_operacion_proceso op
CROSS JOIN LATERAL (
  VALUES
    (op.id_empresa_ingreso, op.id_empresa_cuenta_ingreso),
    (op.id_empresa_salida, op.id_empresa_cuenta_salida),
    (op.id_empresa_salida_origen, op.id_empresa_cuenta_salida_origen)
) AS relacion(id_empresa, id_empresa_cuenta_bancaria)
JOIN public.tb_empresa empresa
  ON empresa.id = relacion.id_empresa
JOIN public.tb_empresa_cuenta_bancaria cuenta
  ON cuenta.id = relacion.id_empresa_cuenta_bancaria
LEFT JOIN public.tb_banco banco
  ON banco.id = cuenta.id_banco
WHERE relacion.id_empresa IN (5, 8)
  AND relacion.id_empresa_cuenta_bancaria IN (7, 33)
GROUP BY
  relacion.id_empresa,
  empresa.nombre,
  relacion.id_empresa_cuenta_bancaria,
  banco.nombre,
  op.tipo_servicio,
  op.nombre_estado
ORDER BY empresa.nombre, op.tipo_servicio, op.nombre_estado;

/* 3. Operaciones directas y operaciones relacionadas por padre o match. */
WITH RECURSIVE operaciones_objetivo (
  id,
  id_operacion_padre,
  id_operacion_match
) AS (
  SELECT op.id, op.id_operacion_padre, op.id_operacion_match
  FROM public.tb_operacion_proceso op
  WHERE op.id_empresa_cuenta_ingreso IN (7, 33)
     OR op.id_empresa_cuenta_salida IN (7, 33)
     OR op.id_empresa_cuenta_salida_origen IN (7, 33)
     OR (op.id_empresa_ingreso IN (5, 8) AND op.id_empresa_cuenta_ingreso IS NULL)
     OR (op.id_empresa_salida IN (5, 8) AND op.id_empresa_cuenta_salida IS NULL)
     OR (op.id_empresa_salida_origen IN (5, 8) AND op.id_empresa_cuenta_salida_origen IS NULL)

  UNION

  SELECT op.id, op.id_operacion_padre, op.id_operacion_match
  FROM public.tb_operacion_proceso op
  JOIN operaciones_objetivo rel
    ON op.id_operacion_padre = rel.id
    OR op.id_operacion_match = rel.id
    OR op.id = rel.id_operacion_padre
    OR op.id = rel.id_operacion_match
)
SELECT op.*
FROM public.tb_operacion_proceso op
WHERE op.id IN (SELECT id FROM operaciones_objetivo)
ORDER BY op.id;

/* 4. Historial de eliminacion relacionado con las operaciones objetivo. */
SELECT ope.*
FROM public.tb_operacion_proceso_eliminada ope
JOIN public.tb_operacion_proceso op
  ON op.id = ope.id_operacion_proceso
WHERE op.id_empresa_cuenta_ingreso IN (7, 33)
   OR op.id_empresa_cuenta_salida IN (7, 33)
   OR op.id_empresa_cuenta_salida_origen IN (7, 33)
   OR (op.id_empresa_ingreso IN (5, 8) AND op.id_empresa_cuenta_ingreso IS NULL)
   OR (op.id_empresa_salida IN (5, 8) AND op.id_empresa_cuenta_salida IS NULL)
   OR (op.id_empresa_salida_origen IN (5, 8) AND op.id_empresa_cuenta_salida_origen IS NULL)
ORDER BY ope.id;

/* 5. Movimientos registrados en las cajas objetivo. */
SELECT oc.*
FROM public.tb_operacion_caja oc
WHERE oc.id_caja IN (4, 32)
   OR oc.id_operacion_proceso IN (
     SELECT op.id
     FROM public.tb_operacion_proceso op
     WHERE op.id_empresa_cuenta_ingreso IN (7, 33)
        OR op.id_empresa_cuenta_salida IN (7, 33)
        OR op.id_empresa_cuenta_salida_origen IN (7, 33)
   )
ORDER BY oc.id;

/* 6. Relaciones de recaudacion asociadas. */
SELECT rlo.*
FROM public.tb_recaudacion_lote_operacion rlo
LEFT JOIN public.tb_recaudacion_lote l
  ON l.id = rlo.id_lote
LEFT JOIN public.tb_operacion_proceso op
  ON op.id = rlo.id_operacion_proceso
LEFT JOIN public.tb_operacion_caja oc
  ON oc.id = rlo.id_operacion_caja
WHERE l.id_empresa_cuenta_bancaria IN (7, 33)
   OR op.id_empresa_cuenta_ingreso IN (7, 33)
   OR op.id_empresa_cuenta_salida IN (7, 33)
   OR op.id_empresa_cuenta_salida_origen IN (7, 33)
   OR oc.id_caja IN (4, 32)
ORDER BY rlo.id;

/* 7. Lotes de recaudacion de las cuentas objetivo. */
SELECT l.*
FROM public.tb_recaudacion_lote l
WHERE l.id_empresa_cuenta_bancaria IN (7, 33)
ORDER BY l.id;

/* 8. Cargas Excel asociadas a operaciones de las cuentas objetivo. */
SELECT DISTINCT carga.*
FROM public.tb_operacion_carga_excel carga
JOIN public.tb_operacion_proceso op
  ON op.id_carga_excel = carga.id
WHERE op.id_empresa_cuenta_ingreso IN (7, 33)
   OR op.id_empresa_cuenta_salida IN (7, 33)
   OR op.id_empresa_cuenta_salida_origen IN (7, 33)
ORDER BY carga.id;

/* 9. Cantidad de operaciones objetivo y externas por carga Excel. */
SELECT
  carga.id,
  carga.nombre_archivo,
  COUNT(*) FILTER (
    WHERE op.id_empresa_cuenta_ingreso IN (7, 33)
       OR op.id_empresa_cuenta_salida IN (7, 33)
       OR op.id_empresa_cuenta_salida_origen IN (7, 33)
  ) AS operaciones_objetivo,
  COUNT(*) FILTER (
    WHERE COALESCE(op.id_empresa_cuenta_ingreso, 0) NOT IN (7, 33)
      AND COALESCE(op.id_empresa_cuenta_salida, 0) NOT IN (7, 33)
      AND COALESCE(op.id_empresa_cuenta_salida_origen, 0) NOT IN (7, 33)
  ) AS operaciones_otras_cuentas
FROM public.tb_operacion_carga_excel carga
JOIN public.tb_operacion_proceso op
  ON op.id_carga_excel = carga.id
WHERE carga.id IN (
  SELECT objetivo.id_carga_excel
  FROM public.tb_operacion_proceso objetivo
  WHERE objetivo.id_carga_excel IS NOT NULL
    AND (
      objetivo.id_empresa_cuenta_ingreso IN (7, 33)
      OR objetivo.id_empresa_cuenta_salida IN (7, 33)
      OR objetivo.id_empresa_cuenta_salida_origen IN (7, 33)
    )
)
GROUP BY carga.id, carga.nombre_archivo
ORDER BY carga.id;

/* 10. Cierres historicos de las cajas objetivo. */
SELECT cierre.*
FROM public.tb_caja_operativa_cierre cierre
WHERE cierre.id_caja IN (4, 32)
ORDER BY cierre.id;

/* 11. Valores actuales de las cajas. */
SELECT caja.*
FROM public.tb_caja_operativa caja
WHERE caja.id IN (4, 32)
  AND caja.id_empresa IN (5, 8)
  AND caja.id_empresa_cuenta_bancaria IN (7, 33)
ORDER BY caja.id_empresa, caja.id;

/* 12. KPI de la ruta Scotiabank. */
SELECT kpi.*
FROM public.tb_ruta_operacion_kpi kpi
WHERE LOWER(BTRIM(kpi.ruta)) = 'scotiabank'
ORDER BY kpi.id;
