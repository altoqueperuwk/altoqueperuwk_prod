/*
LIMPIEZA OPERATIVA DESDE UNA FECHA DE CORTE

Objetivo:
  Eliminar unicamente la data de pruebas creada desde la fecha indicada,
  conservando toda la informacion anterior.

Fecha de corte actual:
  23/08/2026 17:51:00 America/Lima

La fecha se interpreta explicitamente en hora de Lima y se convierte a
timestamp with time zone para comparar correctamente contra las tablas.

IMPORTANTE:
  - Este bloque elimina datos.
  - Ejecutar un respaldo antes de usarlo en produccion.
  - Cambiar v_fecha_corte_lima si la prueba corresponde a otra fecha.
  - La limpieza conserva catalogos, configuraciones, cajas y KPI anteriores.
*/

BEGIN;

DO $$
DECLARE
  v_fecha_corte_lima timestamp without time zone := TIMESTAMP '2026-08-23 17:51:00';
  v_fecha_corte timestamp with time zone;
  v_mov record;
  v_ruta record;
  v_operaciones bigint;
  v_movimientos bigint;
  v_cargas bigint;
  v_cierres bigint;
  v_lotes bigint;
  v_relaciones bigint;
  v_eliminadas bigint;
  v_cajas bigint;
BEGIN
  v_fecha_corte := v_fecha_corte_lima AT TIME ZONE 'America/Lima';

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

  /* Universo de datos creado o actualizado desde la fecha de corte. */
  CREATE TEMP TABLE tmp_limpieza_operaciones ON COMMIT DROP AS
  SELECT id
  FROM public.tb_operacion_proceso
  WHERE fecha_registro >= v_fecha_corte;

  CREATE UNIQUE INDEX tmp_limpieza_operaciones_pk
    ON tmp_limpieza_operaciones (id);

  CREATE TEMP TABLE tmp_limpieza_cierres ON COMMIT DROP AS
  SELECT id
  FROM public.tb_caja_operativa_cierre
  WHERE fecha_cierre >= v_fecha_corte
     OR fecha_registro >= v_fecha_corte;

  CREATE UNIQUE INDEX tmp_limpieza_cierres_pk
    ON tmp_limpieza_cierres (id);

  CREATE TEMP TABLE tmp_limpieza_cargas ON COMMIT DROP AS
  SELECT id
  FROM public.tb_operacion_carga_excel
  WHERE fecha_carga >= v_fecha_corte
     OR id IN (
       SELECT op.id_carga_excel
       FROM public.tb_operacion_proceso op
       JOIN tmp_limpieza_operaciones x ON x.id = op.id
       WHERE op.id_carga_excel IS NOT NULL
     );

  CREATE UNIQUE INDEX tmp_limpieza_cargas_pk
    ON tmp_limpieza_cargas (id);

  CREATE TEMP TABLE tmp_limpieza_lotes ON COMMIT DROP AS
  SELECT id
  FROM public.tb_recaudacion_lote
  WHERE fecha_registro >= v_fecha_corte
     OR fecha_actualizacion >= v_fecha_corte;

  CREATE UNIQUE INDEX tmp_limpieza_lotes_pk
    ON tmp_limpieza_lotes (id);

  /* Movimientos creados desde el corte o relacionados con la data de prueba. */
  CREATE TEMP TABLE tmp_limpieza_movimientos ON COMMIT DROP AS
  SELECT oc.id
  FROM public.tb_operacion_caja oc
  WHERE oc.fecha_registro >= v_fecha_corte
     OR oc.id_operacion_proceso IN (
       SELECT id FROM tmp_limpieza_operaciones
     );

  CREATE UNIQUE INDEX tmp_limpieza_movimientos_pk
    ON tmp_limpieza_movimientos (id);

  CREATE TEMP TABLE tmp_limpieza_cajas ON COMMIT DROP AS
  SELECT DISTINCT oc.id_caja
  FROM public.tb_operacion_caja oc
  JOIN tmp_limpieza_movimientos x ON x.id = oc.id
  UNION
  SELECT DISTINCT c.id
  FROM public.tb_caja_operativa c
  WHERE c.fecha_apertura >= v_fecha_corte;

  CREATE UNIQUE INDEX tmp_limpieza_cajas_pk
    ON tmp_limpieza_cajas (id_caja);

  /* Rutas que deberan sincronizar sus KPI despues de la limpieza. */
  CREATE TEMP TABLE tmp_limpieza_rutas ON COMMIT DROP AS
  SELECT DISTINCT LOWER(BTRIM(COALESCE(op.ruta_destino, op.ruta_origen))) AS ruta
  FROM public.tb_operacion_proceso op
  JOIN tmp_limpieza_operaciones x ON x.id = op.id
  WHERE COALESCE(op.ruta_destino, op.ruta_origen, '') <> ''
  UNION
  SELECT DISTINCT LOWER(BTRIM(rc.ruta)) AS ruta
  FROM public.tb_ruta_operacion_caja rc
  JOIN public.tb_caja_operativa c
    ON c.id_empresa = rc.id_empresa
   AND c.id_empresa_cuenta_bancaria = rc.id_empresa_cuenta_bancaria
  JOIN tmp_limpieza_cajas x ON x.id_caja = c.id
  WHERE COALESCE(rc.ruta, '') <> '';

  SELECT COUNT(*) INTO v_operaciones FROM tmp_limpieza_operaciones;
  SELECT COUNT(*) INTO v_movimientos FROM tmp_limpieza_movimientos;
  SELECT COUNT(*) INTO v_cargas FROM tmp_limpieza_cargas;
  SELECT COUNT(*) INTO v_cierres FROM tmp_limpieza_cierres;
  SELECT COUNT(*) INTO v_lotes FROM tmp_limpieza_lotes;
  SELECT COUNT(*)
  INTO v_relaciones
  FROM public.tb_recaudacion_lote_operacion rlo
  WHERE rlo.fecha_registro >= v_fecha_corte
     OR rlo.id_operacion_proceso IN (SELECT id FROM tmp_limpieza_operaciones)
     OR rlo.id_operacion_caja IN (SELECT id FROM tmp_limpieza_movimientos)
     OR rlo.id_lote IN (SELECT id FROM tmp_limpieza_lotes);
  SELECT COUNT(*)
  INTO v_eliminadas
  FROM public.tb_operacion_proceso_eliminada ope
  WHERE ope.fecha_eliminacion >= v_fecha_corte
     OR ope.id_operacion_proceso IN (SELECT id FROM tmp_limpieza_operaciones);
  SELECT COUNT(*) INTO v_cajas FROM tmp_limpieza_cajas;

  RAISE NOTICE 'Fecha de corte Lima: %', v_fecha_corte;
  RAISE NOTICE 'Operaciones a eliminar: %', v_operaciones;
  RAISE NOTICE 'Movimientos a eliminar: %', v_movimientos;
  RAISE NOTICE 'Cargas Excel candidatas: %', v_cargas;
  RAISE NOTICE 'Cierres candidatos: %', v_cierres;
  RAISE NOTICE 'Lotes candidatos: %', v_lotes;
  RAISE NOTICE 'Relaciones a eliminar: %', v_relaciones;
  RAISE NOTICE 'Historiales eliminados a eliminar: %', v_eliminadas;
  RAISE NOTICE 'Cajas afectadas: %', v_cajas;

  /*
    Revertir solo movimientos abiertos. Los movimientos cerrados ya forman
    parte de un snapshot historico y no deben alterar la caja viva al borrar
    la data de prueba.
  */
  PERFORM set_config('app.defer_kpi_sync', 'on', true);

  FOR v_mov IN
    SELECT oc.*
    FROM public.tb_operacion_caja oc
    JOIN tmp_limpieza_movimientos x ON x.id = oc.id
    WHERE oc.id_caja_cierre IS NULL
    ORDER BY oc.id DESC
    FOR UPDATE
  LOOP
    PERFORM public.f_apply_tb_operacion_caja_delta(
      p_id_caja := v_mov.id_caja,
      p_tipo_movimiento := v_mov.tipo_movimiento,
      p_nombre_estado := v_mov.nombre_estado,
      p_monto_ingreso := v_mov.monto_ingreso,
      p_monto_gasto := v_mov.monto_gasto,
      p_monto_ganancia := v_mov.monto_ganancia,
      p_monto_salida := v_mov.monto_salida,
      p_flag_contabiliza_operacion := v_mov.flag_contabiliza_operacion,
      p_factor := -1,
      p_id_usuario := NULL
    );
  END LOOP;

  PERFORM set_config('app.defer_kpi_sync', 'off', true);

  /* Relaciones de recaudacion antes de eliminar operaciones y movimientos. */
  DELETE FROM public.tb_recaudacion_lote_operacion rlo
  WHERE rlo.fecha_registro >= v_fecha_corte
     OR rlo.id_operacion_proceso IN (SELECT id FROM tmp_limpieza_operaciones)
     OR rlo.id_operacion_caja IN (SELECT id FROM tmp_limpieza_movimientos)
     OR rlo.id_lote IN (SELECT id FROM tmp_limpieza_lotes);

  /* Historial de operaciones eliminadas asociado al alcance de la limpieza. */
  DELETE FROM public.tb_operacion_proceso_eliminada ope
  WHERE ope.fecha_eliminacion >= v_fecha_corte
     OR ope.id_operacion_proceso IN (SELECT id FROM tmp_limpieza_operaciones);

  /* Romper referencias entre movimientos antes de eliminarlos. */
  UPDATE public.tb_operacion_caja oc
  SET id_operacion_caja_relacionada = NULL
  WHERE oc.id_operacion_caja_relacionada IN (
    SELECT id FROM tmp_limpieza_movimientos
  );

  DELETE FROM public.tb_operacion_caja oc
  WHERE oc.id IN (SELECT id FROM tmp_limpieza_movimientos);

  /* Eliminar las operaciones creadas desde la fecha de corte. */
  DELETE FROM public.tb_operacion_proceso op
  WHERE op.id IN (SELECT id FROM tmp_limpieza_operaciones);

  /* Las cargas y lotes con referencias antiguas se conservan por seguridad. */
  DELETE FROM public.tb_operacion_carga_excel ce
  WHERE ce.id IN (SELECT id FROM tmp_limpieza_cargas)
    AND NOT EXISTS (
      SELECT 1
      FROM public.tb_operacion_proceso op
      WHERE op.id_carga_excel = ce.id
    );

  DELETE FROM public.tb_recaudacion_lote l
  WHERE l.id IN (SELECT id FROM tmp_limpieza_lotes)
    AND NOT EXISTS (
      SELECT 1
      FROM public.tb_recaudacion_lote_operacion rlo
      WHERE rlo.id_lote = l.id
    );

  /*
    Un cierre solo se elimina si no quedan operaciones o movimientos antiguos
    asociados. Asi nunca se rompe la trazabilidad historica previa al corte.
  */
  DELETE FROM public.tb_caja_operativa_cierre ch
  WHERE ch.id IN (SELECT id FROM tmp_limpieza_cierres)
    AND NOT EXISTS (
      SELECT 1
      FROM public.tb_operacion_proceso op
      WHERE op.id_caja_cierre = ch.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tb_operacion_caja oc
      WHERE oc.id_caja_cierre = ch.id
    );

  /* Las cajas abiertas durante la prueba vuelven a cero sin tocar las demas. */
  UPDATE public.tb_caja_operativa c
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
      fuera_horario = 0,
      fecha_apertura = now()
  WHERE c.id IN (SELECT id_caja FROM tmp_limpieza_cajas)
    AND c.fecha_apertura >= v_fecha_corte;

  /* Recalcular KPI solamente para las rutas afectadas. */
  FOR v_ruta IN
    SELECT ruta
    FROM tmp_limpieza_rutas
    WHERE ruta IS NOT NULL
      AND ruta <> ''
  LOOP
    PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(v_ruta.ruta, NULL);
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta.ruta, NULL);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.tb_operacion_proceso
    WHERE fecha_registro >= v_fecha_corte
  ) OR EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja
    WHERE fecha_registro >= v_fecha_corte
  ) THEN
    RAISE EXCEPTION 'La limpieza no quedo completa; se revierte toda la transaccion.';
  END IF;

  RAISE NOTICE 'Limpieza desde la fecha de corte finalizada correctamente.';
END;
$$;

COMMIT;

/* Verificacion de operaciones creadas desde el corte. */
SELECT 'tb_operacion_proceso' AS tabla, COUNT(*) AS registros
FROM public.tb_operacion_proceso
WHERE fecha_registro >= (TIMESTAMP '2026-08-23 17:51:00' AT TIME ZONE 'America/Lima')
UNION ALL
SELECT 'tb_operacion_caja', COUNT(*)
FROM public.tb_operacion_caja
WHERE fecha_registro >= (TIMESTAMP '2026-08-23 17:51:00' AT TIME ZONE 'America/Lima')
UNION ALL
SELECT 'tb_operacion_proceso_eliminada', COUNT(*)
FROM public.tb_operacion_proceso_eliminada
WHERE fecha_eliminacion >= (TIMESTAMP '2026-08-23 17:51:00' AT TIME ZONE 'America/Lima')
UNION ALL
SELECT 'tb_operacion_carga_excel', COUNT(*)
FROM public.tb_operacion_carga_excel
WHERE fecha_carga >= (TIMESTAMP '2026-08-23 17:51:00' AT TIME ZONE 'America/Lima')
UNION ALL
SELECT 'tb_recaudacion_lote', COUNT(*)
FROM public.tb_recaudacion_lote
WHERE fecha_registro >= (TIMESTAMP '2026-08-23 17:51:00' AT TIME ZONE 'America/Lima')
UNION ALL
SELECT 'tb_recaudacion_lote_operacion', COUNT(*)
FROM public.tb_recaudacion_lote_operacion
WHERE fecha_registro >= (TIMESTAMP '2026-08-23 17:51:00' AT TIME ZONE 'America/Lima')
UNION ALL
SELECT 'tb_caja_operativa_cierre', COUNT(*)
FROM public.tb_caja_operativa_cierre
WHERE fecha_registro >= (TIMESTAMP '2026-08-23 17:51:00' AT TIME ZONE 'America/Lima')
ORDER BY tabla;

/* Verificacion: configuraciones que deben permanecer intactas. */
SELECT 'tb_empresa' AS tabla, COUNT(*) AS registros FROM public.tb_empresa
UNION ALL SELECT 'tb_banco', COUNT(*) FROM public.tb_banco
UNION ALL SELECT 'tb_empresa_cuenta_bancaria', COUNT(*) FROM public.tb_empresa_cuenta_bancaria
UNION ALL SELECT 'tb_ruta_operacion_caja', COUNT(*) FROM public.tb_ruta_operacion_caja
UNION ALL SELECT 'tb_reglas_efectivizacion', COUNT(*) FROM public.tb_reglas_efectivizacion
UNION ALL SELECT 'tb_recaudacion_regla_abono', COUNT(*) FROM public.tb_recaudacion_regla_abono
UNION ALL SELECT 'tb_pago_deuda_empresa_comision', COUNT(*) FROM public.tb_pago_deuda_empresa_comision
UNION ALL SELECT 'tb_asignacion_caja_operativa', COUNT(*) FROM public.tb_asignacion_caja_operativa
UNION ALL SELECT 'tb_calendario_habil', COUNT(*) FROM public.tb_calendario_habil
UNION ALL SELECT 'tb_categoria_operacion_caja', COUNT(*) FROM public.tb_categoria_operacion_caja
ORDER BY tabla;
