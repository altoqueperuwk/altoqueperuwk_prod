/*
LIMPIEZA GLOBAL DE DATOS OPERATIVOS

Objetivo:
  Eliminar toda la informacion transaccional y reiniciar las cajas sin
  modificar catalogos ni configuraciones del sistema.

Se eliminan:
  - operaciones de efectivizacion, POS, LinkPago y Pago Deuda;
  - operaciones eliminadas e historiales de carga Excel;
  - movimientos de caja y relaciones de recaudacion;
  - lotes de abono;
  - cierres historicos de caja;
  - KPI materializados de operacion.

Se conservan:
  - empresas, bancos, cuentas bancarias y usuarios;
  - rutas y asociaciones de cajas;
  - reglas de efectivizacion;
  - reglas de abono y configuracion de retenciones;
  - configuracion de comisiones de Pago Deuda;
  - estados, permisos, calendarios y categorias.

IMPORTANTE:
  Este bloque elimina datos. Revisar el alcance y ejecutar un respaldo antes
  de ejecutarlo en el ambiente correspondiente. No se ejecuta desde la
  aplicacion ni desde este repositorio.
*/

BEGIN;

DO $$
DECLARE
  v_operaciones bigint;
  v_movimientos bigint;
  v_cargas bigint;
  v_cierres bigint;
  v_lotes bigint;
  v_relaciones bigint;
  v_eliminadas bigint;
BEGIN
  /* Evitar escrituras concurrentes durante la limpieza. */
  LOCK TABLE public.tb_recaudacion_lote_operacion IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.tb_recaudacion_lote IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.tb_operacion_proceso_eliminada IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.tb_operacion_caja IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.tb_operacion_proceso IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.tb_operacion_carga_excel IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.tb_caja_operativa_cierre IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.tb_caja_operativa IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.tb_ruta_operacion_kpi IN SHARE ROW EXCLUSIVE MODE;

  SELECT COUNT(*) INTO v_relaciones
  FROM public.tb_recaudacion_lote_operacion;

  SELECT COUNT(*) INTO v_lotes
  FROM public.tb_recaudacion_lote;

  SELECT COUNT(*) INTO v_eliminadas
  FROM public.tb_operacion_proceso_eliminada;

  SELECT COUNT(*) INTO v_movimientos
  FROM public.tb_operacion_caja;

  SELECT COUNT(*) INTO v_operaciones
  FROM public.tb_operacion_proceso;

  SELECT COUNT(*) INTO v_cargas
  FROM public.tb_operacion_carga_excel;

  SELECT COUNT(*) INTO v_cierres
  FROM public.tb_caja_operativa_cierre;

  RAISE NOTICE 'Relaciones de recaudacion a eliminar: %', v_relaciones;
  RAISE NOTICE 'Lotes de recaudacion a eliminar: %', v_lotes;
  RAISE NOTICE 'Historiales de operaciones eliminadas: %', v_eliminadas;
  RAISE NOTICE 'Movimientos de caja a eliminar: %', v_movimientos;
  RAISE NOTICE 'Operaciones a eliminar: %', v_operaciones;
  RAISE NOTICE 'Cargas Excel a eliminar: %', v_cargas;
  RAISE NOTICE 'Cierres historicos a eliminar: %', v_cierres;

  /*
    Las relaciones de recaudacion dependen de operaciones, movimientos y
    lotes. Se eliminan primero para liberar esas referencias.
  */
  DELETE FROM public.tb_recaudacion_lote_operacion;

  /* El historial de eliminadas depende de la operacion principal. */
  DELETE FROM public.tb_operacion_proceso_eliminada;

  /*
    Romper referencias circulares de movimientos antes de eliminarlos.
    Esto permite limpiar pares ingreso/salida sin tocar configuraciones.
  */
  UPDATE public.tb_operacion_caja
  SET id_operacion_caja_relacionada = NULL;

  DELETE FROM public.tb_operacion_caja;

  /*
    Romper referencias de operaciones padre, match, carga y cierre antes de
    eliminar los registros transaccionales.
  */
  UPDATE public.tb_operacion_proceso
  SET id_operacion_padre = NULL,
      id_operacion_match = NULL,
      id_caja_cierre = NULL,
      id_carga_excel = NULL;

  DELETE FROM public.tb_operacion_proceso;

  /* Las cargas ya no tienen operaciones que las referencien. */
  DELETE FROM public.tb_operacion_carga_excel;

  /* Los lotes ya no tienen relaciones que los referencien. */
  DELETE FROM public.tb_recaudacion_lote;

  /* Los cierres historicos se eliminan; las cajas y su configuracion quedan. */
  DELETE FROM public.tb_caja_operativa_cierre;

  /* Reinicio financiero de todas las cajas operativas existentes. */
  UPDATE public.tb_caja_operativa
  SET saldo_inicial = 0,
      saldo_total = 0,
      saldo_actual = 0,
      total_recaudado = 0,
      ingresos = 0,
      ingresos_retenido = 0,
      gastos = 0,
      ganancia = 0,
      ganancia_retenido = 0,
      salida = 0,
      operaciones = 0,
      fecha_apertura = now();

  /* Reinicio del cache KPI sin modificar rutas, estados ni usuarios. */
  UPDATE public.tb_ruta_operacion_kpi
  SET caja_inicial = 0,
      caja_actual = 0,
      total_recaudado = 0,
      ingresos = 0,
      salidas = 0,
      gastos_operacionales = 0,
      ganancias = 0,
      ingresos_retenidos = 0,
      pendiente_depositar = 0,
      total_efectivizacion = 0,
      total_pago_deuda = 0;

  IF EXISTS (SELECT 1 FROM public.tb_operacion_proceso)
     OR EXISTS (SELECT 1 FROM public.tb_operacion_caja)
     OR EXISTS (SELECT 1 FROM public.tb_caja_operativa_cierre)
     OR EXISTS (SELECT 1 FROM public.tb_operacion_carga_excel)
     OR EXISTS (SELECT 1 FROM public.tb_recaudacion_lote)
     OR EXISTS (SELECT 1 FROM public.tb_recaudacion_lote_operacion) THEN
    RAISE EXCEPTION 'La limpieza no quedo completa; se revierte toda la transaccion.';
  END IF;

  RAISE NOTICE 'Limpieza global de datos operativos finalizada correctamente.';
END;
$$;

COMMIT;

/* Verificacion: las tablas operativas deben quedar vacias. */
SELECT 'tb_operacion_proceso' AS tabla, COUNT(*) AS registros
FROM public.tb_operacion_proceso
UNION ALL
SELECT 'tb_operacion_caja', COUNT(*)
FROM public.tb_operacion_caja
UNION ALL
SELECT 'tb_operacion_proceso_eliminada', COUNT(*)
FROM public.tb_operacion_proceso_eliminada
UNION ALL
SELECT 'tb_operacion_carga_excel', COUNT(*)
FROM public.tb_operacion_carga_excel
UNION ALL
SELECT 'tb_recaudacion_lote', COUNT(*)
FROM public.tb_recaudacion_lote
UNION ALL
SELECT 'tb_recaudacion_lote_operacion', COUNT(*)
FROM public.tb_recaudacion_lote_operacion
UNION ALL
SELECT 'tb_caja_operativa_cierre', COUNT(*)
FROM public.tb_caja_operativa_cierre
ORDER BY tabla;

/* Verificacion: cajas operativas reiniciadas, sin tocar sus asociaciones. */
SELECT id,
       id_empresa,
       id_empresa_cuenta_bancaria,
       saldo_inicial,
       saldo_total,
       saldo_actual,
       total_recaudado,
       ingresos,
       ingresos_retenido,
       gastos,
       ganancia,
       ganancia_retenido,
       salida,
       operaciones,
       fecha_apertura
FROM public.tb_caja_operativa
ORDER BY id;

/* Verificacion: KPI materializados en cero, conservando ruta y estado. */
SELECT id,
       ruta,
       caja_inicial,
       caja_actual,
       total_recaudado,
       ingresos,
       salidas,
       gastos_operacionales,
       ganancias,
       ingresos_retenidos,
       pendiente_depositar,
       total_efectivizacion,
       total_pago_deuda,
       id_estado,
       id_usuario
FROM public.tb_ruta_operacion_kpi
ORDER BY ruta;

/* Verificacion: configuraciones que deben permanecer intactas. */
SELECT 'tb_empresa' AS tabla, COUNT(*) AS registros
FROM public.tb_empresa
UNION ALL
SELECT 'tb_banco', COUNT(*)
FROM public.tb_banco
UNION ALL
SELECT 'tb_empresa_cuenta_bancaria', COUNT(*)
FROM public.tb_empresa_cuenta_bancaria
UNION ALL
SELECT 'tb_ruta_operacion_caja', COUNT(*)
FROM public.tb_ruta_operacion_caja
UNION ALL
SELECT 'tb_reglas_efectivizacion', COUNT(*)
FROM public.tb_reglas_efectivizacion
UNION ALL
SELECT 'tb_recaudacion_regla_abono', COUNT(*)
FROM public.tb_recaudacion_regla_abono
UNION ALL
SELECT 'tb_pago_deuda_empresa_comision', COUNT(*)
FROM public.tb_pago_deuda_empresa_comision
UNION ALL
SELECT 'tb_asignacion_caja_operativa', COUNT(*)
FROM public.tb_asignacion_caja_operativa
UNION ALL
SELECT 'tb_calendario_habil', COUNT(*)
FROM public.tb_calendario_habil
UNION ALL
SELECT 'tb_categoria_operacion_caja', COUNT(*)
FROM public.tb_categoria_operacion_caja
ORDER BY tabla;
