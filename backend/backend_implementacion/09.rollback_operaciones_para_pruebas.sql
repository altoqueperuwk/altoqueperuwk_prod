-- ============================================================================
-- ROLLBACK / RESET OPERACIONES PARA PRUEBAS
-- ============================================================================
--
-- Objetivo:
--   Reiniciar datos transaccionales del modulo Operaciones desde
--   tb_operacion_proceso hacia adelante, sin tocar catalogos base:
--
--   NO toca:
--   - tb_estado
--   - tb_usuario
--   - tb_cliente
--   - tb_codigo_servicio
--   - tb_banco
--   - tb_empresa
--   - tb_empresa_cuenta_bancaria
--   - tb_reglas_efectivizacion
--
-- Modo recomendado:
--   Conserva cajas y rutas configuradas para poder seguir probando Excel,
--   efectivizacion, pago deuda y movimientos sin rehacer bootstrap.
--
-- Seguridad:
--   El script termina en ROLLBACK. Cambiar a COMMIT solo despues de revisar
--   los SELECT finales.

BEGIN;

-- ============================================================================
-- 1. Snapshot previo
-- ============================================================================

SELECT 'ANTES_tb_operacion_proceso' AS tabla, COUNT(*) AS total FROM public.tb_operacion_proceso
UNION ALL
SELECT 'ANTES_tb_operacion_caja', COUNT(*) FROM public.tb_operacion_caja
UNION ALL
SELECT 'ANTES_tb_caja_operativa_cierre', COUNT(*) FROM public.tb_caja_operativa_cierre
UNION ALL
SELECT 'ANTES_tb_caja_operativa', COUNT(*) FROM public.tb_caja_operativa
UNION ALL
SELECT 'ANTES_tb_ruta_operacion_caja', COUNT(*) FROM public.tb_ruta_operacion_caja
UNION ALL
SELECT 'ANTES_tb_ruta_operacion_kpi', COUNT(*) FROM public.tb_ruta_operacion_kpi;

-- ============================================================================
-- 2. Limpiar datos transaccionales
-- ============================================================================
--
-- Orden:
-- - tb_operacion_caja depende de tb_operacion_proceso y tb_caja_operativa.
-- - tb_caja_operativa_cierre depende de tb_caja_operativa.
-- - tb_operacion_proceso es la raiz comercial operativa.

TRUNCATE TABLE
  public.tb_operacion_caja,
  public.tb_caja_operativa_cierre,
  public.tb_operacion_proceso
RESTART IDENTITY;

-- ============================================================================
-- 3. Reiniciar acumulados de cajas conservando bootstrap
-- ============================================================================
--
-- Conserva:
-- - tb_caja_operativa.id
-- - empresa/cuenta
-- - estado
-- - ruta asociada
--
-- Reinicia:
-- - saldos vivos al saldo inicial
-- - ingresos/salidas/gastos/ganancias
-- - contador de operaciones

UPDATE public.tb_caja_operativa
SET saldo_total = saldo_inicial,
    saldo_actual = saldo_inicial,
    total_recaudado = 0,
    ingresos = 0,
    ingresos_retenido = 0,
    gastos = 0,
    ganancia = 0,
    ganancia_retenido = 0,
    salida = 0,
    operaciones = 0;

-- ============================================================================
-- 4. Reiniciar KPI de rutas conservando rutas configuradas
-- ============================================================================

TRUNCATE TABLE public.tb_ruta_operacion_kpi RESTART IDENTITY;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT ruta, id_usuario
    FROM public.tb_ruta_operacion_caja
  LOOP
    PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(r.ruta, r.id_usuario);
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(r.ruta, r.id_usuario);
  END LOOP;
END;
$$;

-- ============================================================================
-- 5. Snapshot posterior
-- ============================================================================

SELECT 'DESPUES_tb_operacion_proceso' AS tabla, COUNT(*) AS total FROM public.tb_operacion_proceso
UNION ALL
SELECT 'DESPUES_tb_operacion_caja', COUNT(*) FROM public.tb_operacion_caja
UNION ALL
SELECT 'DESPUES_tb_caja_operativa_cierre', COUNT(*) FROM public.tb_caja_operativa_cierre
UNION ALL
SELECT 'DESPUES_tb_caja_operativa', COUNT(*) FROM public.tb_caja_operativa
UNION ALL
SELECT 'DESPUES_tb_ruta_operacion_caja', COUNT(*) FROM public.tb_ruta_operacion_caja
UNION ALL
SELECT 'DESPUES_tb_ruta_operacion_kpi', COUNT(*) FROM public.tb_ruta_operacion_kpi;

SELECT
  c.id,
  c.id_empresa,
  e.nombre AS empresa,
  c.id_empresa_cuenta_bancaria,
  b.nombre AS banco,
  c.saldo_inicial,
  c.saldo_actual,
  c.ingresos,
  c.gastos,
  c.ganancia,
  c.salida,
  c.operaciones
FROM public.tb_caja_operativa c
JOIN public.tb_empresa e ON e.id = c.id_empresa
JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = c.id_empresa_cuenta_bancaria
JOIN public.tb_banco b ON b.id = ecb.id_banco
ORDER BY c.id;

-- Cambiar a COMMIT cuando confirmes que el snapshot posterior es correcto.
ROLLBACK;

-- ============================================================================
-- MODO COMPLETO OPCIONAL: borrar tambien bootstrap operativo
-- ============================================================================
--
-- Usar SOLO si quieres eliminar cajas, rutas y asignaciones para rehacer todo
-- desde Sistema. Mantener comentado para evitar borrado accidental.
--
-- BEGIN;
--
-- TRUNCATE TABLE
--   public.tb_operacion_caja,
--   public.tb_caja_operativa_cierre,
--   public.tb_asignacion_caja_operativa,
--   public.tb_operacion_proceso,
--   public.tb_ruta_operacion_kpi,
--   public.tb_ruta_operacion_caja,
--   public.tb_caja_operativa
-- RESTART IDENTITY;
--
-- SELECT 'RESET_COMPLETO_OPERACIONES' AS resultado;
--
-- ROLLBACK;
-- -- Cambiar a COMMIT solo si realmente quieres borrar bootstrap operativo.
