/*
LIMPIEZA CONTROLADA DE OPERACIONES SCOTIABANK

Objetivo:
  - Capital Nova S.A.: empresa 5, cuenta 33, caja 32.
  - Academia WK S.A.: empresa 8, cuenta 7, caja 4.
  - Ruta: scotiabank.

Operaciones protegidas:
  864, 865, 979, 1230, 1231, 1254.

La proteccion se extiende a:
  - operaciones padre, hijas y match;
  - movimientos de caja relacionados;
  - relaciones de recaudacion;
  - cargas Excel compartidas;
  - cierres de caja que continuen referenciados.

IMPORTANTE:
  Este bloque elimina datos. Ejecutarlo solo despues de revisar
  07.respuesta_consultas_selects.sql y con respaldo de la base de datos.
*/

DO $$
DECLARE
  v_filas integer;
  v_ids_faltantes bigint[];
  v_total_protegidas integer;
  v_total_eliminar integer;
  v_total_movimientos_protegidos integer;
  v_total_movimientos_eliminar integer;
BEGIN
  /* Evitar escrituras concurrentes mientras se resuelve y ejecuta la limpieza. */
  LOCK TABLE public.tb_operacion_proceso IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.tb_operacion_caja IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.tb_recaudacion_lote_operacion IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.tb_recaudacion_lote IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.tb_operacion_proceso_eliminada IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.tb_operacion_carga_excel IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.tb_caja_operativa_cierre IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.tb_caja_operativa IN SHARE ROW EXCLUSIVE MODE;

  /* Validar que las cuentas y cajas correspondan a las empresas indicadas. */
  IF (
    SELECT COUNT(*)
    FROM public.tb_empresa_cuenta_bancaria ecb
    WHERE (ecb.id = 33 AND ecb.id_empresa = 5 AND ecb.id_banco = 3)
       OR (ecb.id = 7 AND ecb.id_empresa = 8 AND ecb.id_banco = 3)
  ) <> 2 THEN
    RAISE EXCEPTION 'Las cuentas 33 y 7 no coinciden con las empresas y banco esperados.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.tb_caja_operativa caja
    WHERE (caja.id = 32 AND caja.id_empresa = 5 AND caja.id_empresa_cuenta_bancaria = 33)
       OR (caja.id = 4 AND caja.id_empresa = 8 AND caja.id_empresa_cuenta_bancaria = 7)
  ) <> 2 THEN
    RAISE EXCEPTION 'Las cajas 32 y 4 no coinciden con las empresas y cuentas esperadas.';
  END IF;

  /* Detener la limpieza si falta alguna operacion que debe conservarse. */
  SELECT ARRAY_AGG(ids.id ORDER BY ids.id) FILTER (WHERE op.id IS NULL)
  INTO v_ids_faltantes
  FROM (
    VALUES
      (864::bigint),
      (865::bigint),
      (979::bigint),
      (1230::bigint),
      (1231::bigint),
      (1254::bigint)
  ) AS ids(id)
  LEFT JOIN public.tb_operacion_proceso op
    ON op.id = ids.id;

  IF COALESCE(array_length(v_ids_faltantes, 1), 0) > 0 THEN
    RAISE EXCEPTION 'No se ejecuta la limpieza. Faltan operaciones protegidas: %', v_ids_faltantes;
  END IF;

  DROP TABLE IF EXISTS pg_temp._proteccion_operaciones;
  DROP TABLE IF EXISTS pg_temp._limpieza_operaciones;
  DROP TABLE IF EXISTS pg_temp._proteccion_movimientos;
  DROP TABLE IF EXISTS pg_temp._limpieza_movimientos;
  DROP TABLE IF EXISTS pg_temp._limpieza_lotes;
  DROP TABLE IF EXISTS pg_temp._limpieza_cargas;

  CREATE TEMP TABLE _proteccion_operaciones (
    id bigint PRIMARY KEY
  ) ON COMMIT DROP;

  CREATE TEMP TABLE _limpieza_operaciones (
    id bigint PRIMARY KEY
  ) ON COMMIT DROP;

  CREATE TEMP TABLE _proteccion_movimientos (
    id bigint PRIMARY KEY
  ) ON COMMIT DROP;

  CREATE TEMP TABLE _limpieza_movimientos (
    id bigint PRIMARY KEY
  ) ON COMMIT DROP;

  CREATE TEMP TABLE _limpieza_lotes (
    id bigint PRIMARY KEY
  ) ON COMMIT DROP;

  CREATE TEMP TABLE _limpieza_cargas (
    id bigint PRIMARY KEY
  ) ON COMMIT DROP;

  /* Operaciones protegidas informadas por el usuario. */
  INSERT INTO _proteccion_operaciones (id)
  VALUES (864), (865), (979), (1230), (1231), (1254);

  /* Proteger toda la cadena padre, hija y match. */
  LOOP
    INSERT INTO _proteccion_operaciones (id)
    SELECT op.id
    FROM public.tb_operacion_proceso op
    WHERE op.id_operacion_padre IN (SELECT id FROM _proteccion_operaciones)
       OR op.id_operacion_match IN (SELECT id FROM _proteccion_operaciones)
       OR op.id IN (
         SELECT relacionado.id_operacion_padre
         FROM public.tb_operacion_proceso relacionado
         WHERE relacionado.id IN (SELECT id FROM _proteccion_operaciones)
           AND relacionado.id_operacion_padre IS NOT NULL
       )
       OR op.id IN (
         SELECT relacionado.id_operacion_match
         FROM public.tb_operacion_proceso relacionado
         WHERE relacionado.id IN (SELECT id FROM _proteccion_operaciones)
           AND relacionado.id_operacion_match IS NOT NULL
       )
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS v_filas = ROW_COUNT;
    EXIT WHEN v_filas = 0;
  END LOOP;

  /* Operaciones de ambas empresas/cuentas que pueden eliminarse. */
  INSERT INTO _limpieza_operaciones (id)
  SELECT op.id
  FROM public.tb_operacion_proceso op
  WHERE (
       op.id_empresa_cuenta_ingreso IN (7, 33)
    OR op.id_empresa_cuenta_salida IN (7, 33)
    OR op.id_empresa_cuenta_salida_origen IN (7, 33)
    OR (op.id_empresa_ingreso IN (5, 8) AND op.id_empresa_cuenta_ingreso IS NULL)
    OR (op.id_empresa_salida IN (5, 8) AND op.id_empresa_cuenta_salida IS NULL)
    OR (op.id_empresa_salida_origen IN (5, 8) AND op.id_empresa_cuenta_salida_origen IS NULL)
  )
  AND op.id NOT IN (SELECT id FROM _proteccion_operaciones);

  /* Completar relaciones sin incorporar ninguna operacion protegida. */
  LOOP
    INSERT INTO _limpieza_operaciones (id)
    SELECT op.id
    FROM public.tb_operacion_proceso op
    WHERE (
         op.id_operacion_padre IN (SELECT id FROM _limpieza_operaciones)
      OR op.id_operacion_match IN (SELECT id FROM _limpieza_operaciones)
      OR op.id IN (
        SELECT relacionado.id_operacion_padre
        FROM public.tb_operacion_proceso relacionado
        WHERE relacionado.id IN (SELECT id FROM _limpieza_operaciones)
          AND relacionado.id_operacion_padre IS NOT NULL
      )
      OR op.id IN (
        SELECT relacionado.id_operacion_match
        FROM public.tb_operacion_proceso relacionado
        WHERE relacionado.id IN (SELECT id FROM _limpieza_operaciones)
          AND relacionado.id_operacion_match IS NOT NULL
      )
    )
    AND op.id NOT IN (SELECT id FROM _proteccion_operaciones)
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS v_filas = ROW_COUNT;
    EXIT WHEN v_filas = 0;
  END LOOP;

  /* Proteger movimientos de las operaciones conservadas y todos sus pares. */
  INSERT INTO _proteccion_movimientos (id)
  SELECT oc.id
  FROM public.tb_operacion_caja oc
  WHERE oc.id_operacion_proceso IN (SELECT id FROM _proteccion_operaciones)
  ON CONFLICT (id) DO NOTHING;

  LOOP
    INSERT INTO _proteccion_movimientos (id)
    SELECT oc.id
    FROM public.tb_operacion_caja oc
    WHERE oc.id_operacion_caja_relacionada IN (SELECT id FROM _proteccion_movimientos)
       OR oc.id IN (
         SELECT protegido.id_operacion_caja_relacionada
         FROM public.tb_operacion_caja protegido
         WHERE protegido.id IN (SELECT id FROM _proteccion_movimientos)
           AND protegido.id_operacion_caja_relacionada IS NOT NULL
       )
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS v_filas = ROW_COUNT;
    EXIT WHEN v_filas = 0;
  END LOOP;

  /* Movimientos de ambas cajas y operaciones eliminables. */
  INSERT INTO _limpieza_movimientos (id)
  SELECT oc.id
  FROM public.tb_operacion_caja oc
  WHERE (
       oc.id_caja IN (4, 32)
    OR oc.id_operacion_proceso IN (SELECT id FROM _limpieza_operaciones)
  )
  AND oc.id NOT IN (SELECT id FROM _proteccion_movimientos)
  ON CONFLICT (id) DO NOTHING;

  LOOP
    INSERT INTO _limpieza_movimientos (id)
    SELECT oc.id
    FROM public.tb_operacion_caja oc
    WHERE (
         oc.id_operacion_caja_relacionada IN (SELECT id FROM _limpieza_movimientos)
      OR oc.id IN (
        SELECT relacionado.id_operacion_caja_relacionada
        FROM public.tb_operacion_caja relacionado
        WHERE relacionado.id IN (SELECT id FROM _limpieza_movimientos)
          AND relacionado.id_operacion_caja_relacionada IS NOT NULL
      )
    )
    AND oc.id NOT IN (SELECT id FROM _proteccion_movimientos)
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS v_filas = ROW_COUNT;
    EXIT WHEN v_filas = 0;
  END LOOP;

  /* Lotes y cargas potencialmente afectados. */
  INSERT INTO _limpieza_lotes (id)
  SELECT DISTINCT lote.id
  FROM public.tb_recaudacion_lote lote
  LEFT JOIN public.tb_recaudacion_lote_operacion relacion
    ON relacion.id_lote = lote.id
  WHERE lote.id_empresa_cuenta_bancaria IN (7, 33)
     OR relacion.id_operacion_proceso IN (SELECT id FROM _limpieza_operaciones)
     OR relacion.id_operacion_caja IN (SELECT id FROM _limpieza_movimientos)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO _limpieza_cargas (id)
  SELECT DISTINCT op.id_carga_excel
  FROM public.tb_operacion_proceso op
  WHERE op.id IN (SELECT id FROM _limpieza_operaciones)
    AND op.id_carga_excel IS NOT NULL
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO v_total_protegidas FROM _proteccion_operaciones;
  SELECT COUNT(*) INTO v_total_eliminar FROM _limpieza_operaciones;
  SELECT COUNT(*) INTO v_total_movimientos_protegidos FROM _proteccion_movimientos;
  SELECT COUNT(*) INTO v_total_movimientos_eliminar FROM _limpieza_movimientos;

  IF EXISTS (
    SELECT 1
    FROM _limpieza_operaciones eliminar
    JOIN _proteccion_operaciones proteger
      ON proteger.id = eliminar.id
  ) THEN
    RAISE EXCEPTION 'Se detecto una operacion protegida dentro del conjunto de eliminacion.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _limpieza_movimientos eliminar
    JOIN _proteccion_movimientos proteger
      ON proteger.id = eliminar.id
  ) THEN
    RAISE EXCEPTION 'Se detecto un movimiento protegido dentro del conjunto de eliminacion.';
  END IF;

  RAISE NOTICE 'Operaciones protegidas: %', v_total_protegidas;
  RAISE NOTICE 'Operaciones a eliminar: %', v_total_eliminar;
  RAISE NOTICE 'Movimientos protegidos: %', v_total_movimientos_protegidos;
  RAISE NOTICE 'Movimientos a eliminar: %', v_total_movimientos_eliminar;

  /* Eliminar solo relaciones vinculadas al conjunto eliminable. */
  DELETE FROM public.tb_recaudacion_lote_operacion relacion
  WHERE relacion.id_operacion_proceso IN (SELECT id FROM _limpieza_operaciones)
     OR relacion.id_operacion_caja IN (SELECT id FROM _limpieza_movimientos);

  /* Eliminar un lote afectado solamente cuando ya no tenga operaciones. */
  DELETE FROM public.tb_recaudacion_lote lote
  WHERE lote.id IN (SELECT id FROM _limpieza_lotes)
    AND NOT EXISTS (
      SELECT 1
      FROM public.tb_recaudacion_lote_operacion relacion
      WHERE relacion.id_lote = lote.id
    );

  /* Evitar referencias a movimientos que seran eliminados. */
  UPDATE public.tb_operacion_caja oc
  SET id_operacion_caja_relacionada = NULL
  WHERE oc.id NOT IN (SELECT id FROM _limpieza_movimientos)
    AND oc.id_operacion_caja_relacionada IN (SELECT id FROM _limpieza_movimientos);

  DELETE FROM public.tb_operacion_proceso_eliminada historial
  WHERE historial.id_operacion_proceso IN (SELECT id FROM _limpieza_operaciones);

  DELETE FROM public.tb_operacion_caja oc
  WHERE oc.id IN (SELECT id FROM _limpieza_movimientos);

  DELETE FROM public.tb_operacion_proceso op
  WHERE op.id IN (SELECT id FROM _limpieza_operaciones);

  IF (
    SELECT COUNT(*)
    FROM public.tb_operacion_proceso op
    WHERE op.id IN (864, 865, 979, 1230, 1231, 1254)
  ) <> 6 THEN
    RAISE EXCEPTION 'La validacion posterior detecto una operacion protegida faltante. Se revierte toda la limpieza.';
  END IF;

  /* Una carga compartida se conserva mientras otra operacion la referencie. */
  DELETE FROM public.tb_operacion_carga_excel carga
  WHERE carga.id IN (SELECT id FROM _limpieza_cargas)
    AND NOT EXISTS (
      SELECT 1
      FROM public.tb_operacion_proceso op
      WHERE op.id_carga_excel = carga.id
    );

  /* Conservar cierres que sigan referenciados por operaciones protegidas. */
  DELETE FROM public.tb_caja_operativa_cierre cierre
  WHERE cierre.id_caja IN (4, 32)
    AND NOT EXISTS (
      SELECT 1
      FROM public.tb_operacion_proceso op
      WHERE op.id_caja_cierre = cierre.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tb_operacion_caja oc
      WHERE oc.id_caja_cierre = cierre.id
    );

  /* Reiniciar todos los saldos y acumulados de ambas cajas. */
  UPDATE public.tb_caja_operativa caja
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
      flag_retencion = false,
      fecha_apertura = now()
  WHERE caja.id IN (4, 32)
    AND caja.id_empresa IN (5, 8)
    AND caja.id_empresa_cuenta_bancaria IN (7, 33);

  /* Recalcular los KPI financieros y operativos de Scotiabank. */
  PERFORM public.f_sync_tb_ruta_operacion_kpi_caja('scotiabank', NULL);
  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion('scotiabank', NULL);

  RAISE NOTICE 'Limpieza finalizada para las cuentas 7 y 33. Operaciones protegidas intactas.';
END;
$$;

/* Verificacion posterior: deben existir los seis IDs y sus dependencias. */
SELECT op.*
FROM public.tb_operacion_proceso op
WHERE op.id IN (864, 865, 979, 1230, 1231, 1254)
ORDER BY op.id;

/* Solo deben quedar operaciones protegidas o sus relaciones en las cuentas objetivo. */
SELECT op.*
FROM public.tb_operacion_proceso op
WHERE op.id_empresa_cuenta_ingreso IN (7, 33)
   OR op.id_empresa_cuenta_salida IN (7, 33)
   OR op.id_empresa_cuenta_salida_origen IN (7, 33)
   OR (op.id_empresa_ingreso IN (5, 8) AND op.id_empresa_cuenta_ingreso IS NULL)
   OR (op.id_empresa_salida IN (5, 8) AND op.id_empresa_cuenta_salida IS NULL)
   OR (op.id_empresa_salida_origen IN (5, 8) AND op.id_empresa_cuenta_salida_origen IS NULL)
ORDER BY op.id;

/* Las cajas deben quedar reiniciadas, salvo retenciones abiertas protegidas recalculadas. */
SELECT caja.*
FROM public.tb_caja_operativa caja
WHERE caja.id IN (4, 32)
ORDER BY caja.id;
