-- Validacion estructural y de solo lectura del modulo de compensaciones.
-- Ejecutar despues de los scripts 17 al 34.

BEGIN;

WITH esperadas(nombre) AS (
  VALUES
    ('tb_compensacion_cargo'),
    ('tb_compensacion_jornada'),
    ('tb_compensacion_colaborador'),
    ('tb_compensacion_plan'),
    ('tb_compensacion_plan_version'),
    ('tb_compensacion_concepto'),
    ('tb_compensacion_regla'),
    ('tb_compensacion_meta_sede'),
    ('tb_compensacion_asignacion'),
    ('tb_compensacion_cuenta_pago'),
    ('tb_compensacion_excepcion'),
    ('tb_compensacion_acceso'),
    ('tb_compensacion_penalidad_tipo'),
    ('tb_asistencia_carga'),
    ('tb_asistencia_marcacion'),
    ('tb_asistencia_jornada'),
    ('tb_asistencia_solicitud'),
    ('tb_compensacion_evento_tipo'),
    ('tb_compensacion_evento'),
    ('tb_compensacion_evento_revision'),
    ('tb_compensacion_evento_referencia'),
    ('tb_compensacion_referido'),
    ('tb_compensacion_referido_operacion'),
    ('tb_compensacion_periodo'),
    ('tb_compensacion_liquidacion'),
    ('tb_compensacion_liquidacion_tramo'),
    ('tb_compensacion_liquidacion_detalle'),
    ('tb_compensacion_cierre'),
    ('tb_compensacion_cierre_liquidacion'),
    ('tb_compensacion_aprobacion'),
    ('tb_compensacion_pago'),
    ('tb_compensacion_ajuste'),
    ('tb_compensacion_exportacion')
)
SELECT
  e.nombre,
  CASE WHEN c.oid IS NULL THEN 'FALTA' ELSE 'OK' END AS estado
FROM esperadas e
LEFT JOIN pg_class c
  ON c.relname = e.nombre
 AND c.relnamespace = 'public'::regnamespace
 AND c.relkind IN ('r', 'p')
ORDER BY e.nombre;

WITH esperadas(nombre) AS (
  VALUES
    ('f_private_compensacion_contexto'),
    ('f_get_tb_compensacion_acceso'),
    ('f_put_tb_compensacion_acceso'),
    ('f_get_tb_compensacion_cargo'),
    ('f_post_tb_compensacion_cargo'),
    ('f_patch_tb_compensacion_cargo'),
    ('f_get_tb_compensacion_jornada'),
    ('f_post_tb_compensacion_jornada'),
    ('f_patch_tb_compensacion_jornada'),
    ('f_get_tb_compensacion_colaborador'),
    ('f_post_tb_compensacion_colaborador'),
    ('f_patch_tb_compensacion_colaborador'),
    ('f_private_compensacion_validar_colaborador'),
    ('f_get_tb_compensacion_asignacion'),
    ('f_post_tb_compensacion_asignacion_cambio'),
    ('f_get_tb_compensacion_cuenta_pago'),
    ('f_post_tb_compensacion_cuenta_pago'),
    ('f_patch_tb_compensacion_cuenta_pago'),
    ('f_get_tb_compensacion_plan'),
    ('f_post_tb_compensacion_plan'),
    ('f_patch_tb_compensacion_plan'),
    ('f_get_tb_compensacion_plan_version'),
    ('f_post_tb_compensacion_plan_version'),
    ('f_patch_tb_compensacion_plan_version'),
    ('f_post_tb_compensacion_plan_version_publicar'),
    ('f_get_tb_compensacion_concepto'),
    ('f_post_tb_compensacion_concepto'),
    ('f_patch_tb_compensacion_concepto'),
    ('f_get_tb_compensacion_regla'),
    ('f_post_tb_compensacion_regla'),
    ('f_patch_tb_compensacion_regla'),
    ('f_get_tb_compensacion_meta_sede'),
    ('f_post_tb_compensacion_meta_sede'),
    ('f_patch_tb_compensacion_meta_sede'),
    ('f_get_tb_compensacion_excepcion'),
    ('f_post_tb_compensacion_excepcion'),
    ('f_patch_tb_compensacion_excepcion'),
    ('f_post_tb_compensacion_excepcion_decidir'),
    ('f_get_tb_compensacion_penalidad_tipo'),
    ('f_post_tb_compensacion_penalidad_tipo'),
    ('f_patch_tb_compensacion_penalidad_tipo'),
    ('f_private_compensacion_validar_periodo'),
    ('f_get_tb_compensacion_periodo'),
    ('f_post_tb_compensacion_periodo_abrir'),
    ('f_patch_tb_compensacion_periodo'),
    ('f_private_asistencia_consolidar_carga'),
    ('f_get_tb_asistencia_carga'),
    ('f_post_tb_asistencia_carga'),
    ('f_post_tb_asistencia_carga_validar'),
    ('f_get_tb_asistencia_marcacion'),
    ('f_post_tb_asistencia_carga_confirmar'),
    ('f_get_tb_asistencia_jornada'),
    ('f_private_asistencia_validar_colaborador'),
    ('f_get_tb_asistencia_solicitud'),
    ('f_post_tb_asistencia_solicitud'),
    ('f_post_tb_asistencia_solicitud_resolver'),
    ('f_post_tb_asistencia_solicitud_anular'),
    ('f_post_tb_asistencia_solicitud_resolver_lote'),
    ('f_private_compensacion_evento_validar_alcance'),
    ('f_get_tb_compensacion_evento_tipo'),
    ('f_post_tb_compensacion_evento_tipo'),
    ('f_patch_tb_compensacion_evento_tipo'),
    ('f_get_tb_compensacion_evento'),
    ('f_post_tb_compensacion_evento'),
    ('f_patch_tb_compensacion_evento'),
    ('f_post_tb_compensacion_evento_referencia'),
    ('f_post_tb_compensacion_evento_enviar'),
    ('f_post_tb_compensacion_evento_resolver'),
    ('f_post_tb_compensacion_evento_observar'),
    ('f_post_tb_compensacion_evento_anular'),
    ('f_get_tb_compensacion_referido'),
    ('f_post_tb_compensacion_referido'),
    ('f_post_tb_compensacion_referido_resolver'),
    ('f_post_tb_compensacion_referido_anular'),
    ('f_private_compensacion_incidencia_validar_alcance'),
    ('f_get_tb_compensacion_incidencia'),
    ('f_post_tb_compensacion_incidencia'),
    ('f_post_tb_compensacion_incidencia_referencia'),
    ('f_patch_tb_compensacion_incidencia'),
    ('f_post_tb_compensacion_incidencia_enviar'),
    ('f_post_tb_compensacion_incidencia_descargo'),
    ('f_post_tb_compensacion_incidencia_resolver'),
    ('f_post_tb_compensacion_incidencia_observar'),
    ('f_post_tb_compensacion_incidencia_anular'),
    ('f_private_compensacion_liquidacion_validar_alcance'),
    ('f_private_compensacion_liquidacion_simular'),
    ('f_get_tb_compensacion_liquidacion_simular'),
    ('f_post_tb_compensacion_liquidacion_calcular'),
    ('f_post_tb_compensacion_liquidacion_calcular_lote'),
    ('f_get_tb_compensacion_liquidacion'),
    ('f_private_compensacion_pago_resumen'),
    ('f_private_compensacion_pago_sincronizar'),
    ('f_private_compensacion_liquidacion_decidir'),
    ('f_patch_tb_compensacion_liquidacion_aprobar'),
    ('f_patch_tb_compensacion_liquidacion_observar'),
    ('f_patch_tb_compensacion_liquidacion_rechazar'),
    ('f_patch_tb_compensacion_liquidacion_reabrir_revision'),
    ('f_get_tb_compensacion_liquidacion_aprobacion'),
    ('f_post_tb_compensacion_pago'),
    ('f_post_tb_compensacion_pago_reversar'),
    ('f_get_tb_compensacion_pago'),
    ('f_get_tb_compensacion_pago_pendiente'),
    ('f_private_compensacion_liquidacion_snapshot'),
    ('f_private_compensacion_cierre_prevalidar'),
    ('f_get_tb_compensacion_cierre_prevalidar'),
    ('f_post_tb_compensacion_cierre'),
    ('f_post_tb_compensacion_cierre_reabrir'),
    ('f_get_tb_compensacion_cierre'),
    ('f_get_tb_compensacion_cierre_validar_integridad'),
    ('f_get_tb_compensacion_ajuste'),
    ('f_post_tb_compensacion_ajuste'),
    ('f_post_tb_compensacion_ajuste_decidir'),
    ('f_post_tb_compensacion_ajuste_anular'),
    ('f_private_compensacion_reporte_contexto'),
    ('f_private_compensacion_reporte_liquidaciones'),
    ('f_private_compensacion_reporte_detalles'),
    ('f_get_tb_compensacion_reporte_financiero'),
    ('f_get_tb_compensacion_reporte_conceptos'),
    ('f_get_tb_compensacion_reporte_sedes'),
    ('f_get_tb_compensacion_reporte_asistencia'),
    ('f_get_tb_compensacion_reporte_productividad'),
    ('f_get_tb_compensacion_reporte_pagos'),
    ('f_post_tb_compensacion_exportacion'),
    ('f_get_tb_compensacion_exportacion'),
    ('f_patch_tb_compensacion_exportacion_anular'),
    ('f_private_compensacion_validacion_hallazgos'),
    ('f_get_tb_compensacion_validacion_integral'),
    ('f_get_tb_compensacion_conciliacion_periodo')
)
SELECT
  e.nombre,
  CASE WHEN p.oid IS NULL THEN 'FALTA' ELSE 'OK' END AS estado,
  COALESCE(p.prosecdef, false) AS security_definer
FROM esperadas e
LEFT JOIN pg_proc p
  ON p.proname = e.nombre
 AND p.pronamespace = 'public'::regnamespace
ORDER BY e.nombre;

SELECT
  conrelid::regclass AS tabla,
  conname AS restriccion,
  contype AS tipo,
  convalidated AS validada
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND (
    conrelid::regclass::text LIKE 'tb\_%compensacion%' ESCAPE '\'
    OR conrelid::regclass::text LIKE 'tb\_asistencia%' ESCAPE '\'
  )
  AND NOT convalidated
ORDER BY conrelid::regclass::text, conname;

SELECT
  conrelid::regclass AS tabla_origen,
  conname AS clave_foranea,
  confrelid::regclass AS tabla_destino
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND contype = 'f'
  AND (
    conrelid::regclass::text LIKE 'tb\_%compensacion%' ESCAPE '\'
    OR conrelid::regclass::text LIKE 'tb\_asistencia%' ESCAPE '\'
  )
ORDER BY conrelid::regclass::text, conname;

-- Debe devolver cero filas: eventos enviados sin sus referencias obligatorias.
SELECT
  ev.id AS id_evento,
  te.codigo AS tipo_evento,
  ev.estado_evento,
  te.requiere_cliente,
  te.requiere_operacion
FROM public.tb_compensacion_evento ev
JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
WHERE ev.estado_evento IN ('PENDIENTE', 'APROBADO', 'LIQUIDADO')
  AND (
    (
      te.requiere_cliente
      AND NOT EXISTS (
        SELECT 1
        FROM public.tb_compensacion_evento_referencia r
        WHERE r.id_evento = ev.id
          AND r.id_cliente IS NOT NULL
      )
    )
    OR (
      te.requiere_operacion
      AND (te.categoria <> 'REFERIDO' OR ev.estado_evento IN ('APROBADO', 'LIQUIDADO'))
      AND NOT EXISTS (
        SELECT 1
        FROM public.tb_compensacion_evento_referencia r
        WHERE r.id_evento = ev.id
          AND r.id_operacion IS NOT NULL
      )
    )
  );

-- Debe devolver cero filas: aprobados sin regla, importe o snapshot congelado.
SELECT
  ev.id AS id_evento,
  ev.estado_evento,
  ev.id_regla_aplicada,
  ev.importe_aprobado,
  ev.criterios_validacion_snapshot
FROM public.tb_compensacion_evento ev
JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
WHERE ev.estado_evento IN ('APROBADO', 'LIQUIDADO')
  AND te.categoria NOT IN ('PENALIDAD', 'AUDITORIA_PAGO')
  AND (
    ev.id_regla_aplicada IS NULL
    OR ev.importe_aprobado IS NULL
    OR ev.criterios_validacion_snapshot = '{}'::jsonb
  );

-- Debe devolver cero filas: una misma operacion valorizada dos veces para el
-- mismo tipo de evento.
SELECT
  ev.id_tipo_evento,
  r.id_operacion,
  COUNT(DISTINCT ev.id) AS eventos_valorizados
FROM public.tb_compensacion_evento ev
JOIN public.tb_compensacion_evento_referencia r ON r.id_evento = ev.id
WHERE ev.estado_evento IN ('APROBADO', 'LIQUIDADO')
  AND r.id_operacion IS NOT NULL
GROUP BY ev.id_tipo_evento, r.id_operacion
HAVING COUNT(DISTINCT ev.id) > 1;

-- Debe devolver cero filas: referidos validados sin una unica operacion
-- elegible o con un importe distinto al congelado en el evento.
SELECT
  r.id AS id_referido,
  r.id_evento,
  COUNT(ro.id) AS operaciones,
  MAX(ro.importe_comision) AS importe_operacion,
  ev.importe_aprobado AS importe_evento
FROM public.tb_compensacion_referido r
JOIN public.tb_compensacion_evento ev ON ev.id = r.id_evento
LEFT JOIN public.tb_compensacion_referido_operacion ro
  ON ro.id_referido = r.id
 AND ro.es_elegible
WHERE r.estado_referido = 'VALIDADO'
GROUP BY r.id, r.id_evento, ev.importe_aprobado
HAVING COUNT(ro.id) <> 1
   OR MAX(ro.importe_comision) IS DISTINCT FROM ev.importe_aprobado;

-- Debe devolver cero filas: incidencias aprobadas sin descuento congelado o
-- cuyo importe principal no coincide con el snapshot.
SELECT
  ev.id AS id_evento,
  te.categoria,
  ev.importe_aprobado,
  ev.criterios_validacion_snapshot
FROM public.tb_compensacion_evento ev
JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
WHERE te.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
  AND ev.estado_evento IN ('APROBADO', 'LIQUIDADO')
  AND (
    NULLIF(
      ev.criterios_validacion_snapshot ->> 'id_concepto_descuento',
      ''
    ) IS NULL
    OR NULLIF(
      ev.criterios_validacion_snapshot ->> 'importe_descuento',
      ''
    )::numeric IS DISTINCT FROM ev.importe_aprobado
  );

-- Debe devolver cero filas: auditorias aprobadas sin el efecto positivo para
-- el reportante dentro del mismo snapshot.
SELECT
  ev.id AS id_evento,
  ev.criterios_validacion_snapshot
FROM public.tb_compensacion_evento ev
JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
WHERE te.categoria = 'AUDITORIA_PAGO'
  AND ev.estado_evento IN ('APROBADO', 'LIQUIDADO')
  AND (
    NULLIF(
      ev.criterios_validacion_snapshot ->> 'id_concepto_bono_reportante',
      ''
    ) IS NULL
    OR COALESCE(NULLIF(
      ev.criterios_validacion_snapshot ->> 'importe_bono_reportante',
      ''
    )::numeric, 0) <= 0
  );

-- Debe devolver cero filas: el mismo usuario registro y decidio la incidencia.
SELECT
  ev.id AS id_evento,
  ev.id_usuario_registra,
  rev.id_usuario_revisor
FROM public.tb_compensacion_evento ev
JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
JOIN public.tb_compensacion_evento_revision rev ON rev.id_evento = ev.id
WHERE te.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
  AND rev.decision IN ('APROBADO', 'RECHAZADO')
  AND rev.id_usuario_revisor = ev.id_usuario_registra;

-- Debe devolver cero filas: penalidades aprobadas que exigian respuesta pero
-- no conservaron el descargo del responsable.
SELECT
  ev.id AS id_evento,
  pt.codigo AS penalidad
FROM public.tb_compensacion_evento ev
JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
JOIN public.tb_compensacion_penalidad_tipo pt ON pt.id = ev.id_penalidad_tipo
WHERE te.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
  AND ev.estado_evento IN ('APROBADO', 'LIQUIDADO')
  AND pt.requiere_respuesta
  AND NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_evento_revision rev
    WHERE rev.id_evento = ev.id
      AND rev.etapa = 'DESCARGO'
      AND rev.numero_paso > COALESCE((
        SELECT MAX(enviado.numero_paso)
        FROM public.tb_compensacion_evento_revision enviado
        WHERE enviado.id_evento = ev.id
          AND enviado.decision = 'ENVIADO'
      ), 0)
  );

-- Debe devolver cero filas: cabeceras de liquidacion cuyos totales no concilian
-- con el detalle persistido.
SELECT
  l.id AS id_liquidacion,
  l.total_sueldo,
  l.total_bonos,
  l.total_comisiones,
  l.total_descuentos,
  l.total_pagar
FROM public.tb_compensacion_liquidacion l
LEFT JOIN LATERAL (
  SELECT
    COALESCE(SUM(d.importe) FILTER (
      WHERE d.categoria_snapshot = 'SUELDO' AND d.naturaleza_snapshot = 'INGRESO'
    ), 0) AS sueldo,
    COALESCE(SUM(d.importe) FILTER (
      WHERE d.categoria_snapshot = 'BONO' AND d.naturaleza_snapshot = 'INGRESO'
    ), 0) AS bonos,
    COALESCE(SUM(d.importe) FILTER (
      WHERE d.categoria_snapshot = 'COMISION' AND d.naturaleza_snapshot = 'INGRESO'
    ), 0) AS comisiones,
    COALESCE(SUM(d.importe) FILTER (
      WHERE d.naturaleza_snapshot = 'DESCUENTO'
    ), 0) AS descuentos
  FROM public.tb_compensacion_liquidacion_detalle d
  WHERE d.id_liquidacion = l.id
) x ON true
WHERE l.estado_liquidacion <> 'BORRADOR'
  AND (
    l.total_sueldo IS DISTINCT FROM x.sueldo
    OR l.total_bonos IS DISTINCT FROM x.bonos
    OR l.total_comisiones IS DISTINCT FROM x.comisiones
    OR l.total_descuentos IS DISTINCT FROM x.descuentos
    OR l.total_pagar IS DISTINCT FROM (
      x.sueldo + x.bonos + x.comisiones - x.descuentos
    )
  );

-- Debe devolver cero filas: mas de una version vigente por colaborador/periodo.
SELECT
  id_periodo,
  id_colaborador,
  COUNT(*) AS versiones_vigentes
FROM public.tb_compensacion_liquidacion
WHERE estado_liquidacion NOT IN ('REEMPLAZADA', 'ANULADA')
GROUP BY id_periodo, id_colaborador
HAVING COUNT(*) > 1;

-- Debe devolver cero filas: liquidaciones aprobadas o pagadas sin una decision
-- aprobatoria congelada o con el mismo usuario como calculador y aprobador.
SELECT
  l.id AS id_liquidacion,
  l.id_usuario_calcula,
  a.id_usuario_aprueba
FROM public.tb_compensacion_liquidacion l
LEFT JOIN public.tb_compensacion_aprobacion a
  ON a.id_liquidacion = l.id
 AND a.decision = 'APROBADO'
WHERE l.estado_liquidacion IN ('APROBADA', 'PAGO_PARCIAL', 'PAGADA')
  AND (
    a.id IS NULL
    OR l.fecha_aprobacion IS NULL
    OR a.id_usuario_aprueba = l.id_usuario_calcula
  );

-- Debe devolver cero filas: total pagado que no concilia con movimientos o con
-- el estado financiero de la liquidacion.
SELECT
  l.id AS id_liquidacion,
  l.estado_liquidacion,
  l.total_pagar,
  l.total_pagado,
  COALESCE(x.pagado, 0) AS pagado_movimientos
FROM public.tb_compensacion_liquidacion l
LEFT JOIN LATERAL (
  SELECT SUM(
    CASE p.tipo_movimiento
      WHEN 'PAGO' THEN p.monto
      WHEN 'REVERSA' THEN -p.monto
    END
  ) AS pagado
  FROM public.tb_compensacion_pago p
  WHERE p.id_liquidacion = l.id
) x ON true
WHERE l.total_pagado IS DISTINCT FROM COALESCE(x.pagado, 0)
   OR (l.total_pagado = 0 AND l.estado_liquidacion IN ('PAGO_PARCIAL', 'PAGADA'))
   OR (
     l.total_pagado > 0
     AND l.total_pagado < l.total_pagar
     AND l.estado_liquidacion <> 'PAGO_PARCIAL'
   )
   OR (
     l.total_pagar > 0
     AND l.total_pagado = l.total_pagar
     AND l.estado_liquidacion <> 'PAGADA'
   );

-- Debe devolver cero filas: reversas que no replican liquidacion, componente,
-- moneda y monto del pago original.
SELECT
  r.id AS id_reversa,
  r.id_pago_origen
FROM public.tb_compensacion_pago r
JOIN public.tb_compensacion_pago p ON p.id = r.id_pago_origen
WHERE r.tipo_movimiento = 'REVERSA'
  AND (
    p.tipo_movimiento <> 'PAGO'
    OR r.id_liquidacion IS DISTINCT FROM p.id_liquidacion
    OR r.componente IS DISTINCT FROM p.componente
    OR r.moneda IS DISTINCT FROM p.moneda
    OR r.monto IS DISTINCT FROM p.monto
  );

-- Debe devolver cero filas: una liquidacion con pagos efectivos por TOTAL y
-- por componentes al mismo tiempo.
SELECT p.id_liquidacion
FROM public.tb_compensacion_pago p
GROUP BY p.id_liquidacion
HAVING SUM(
  CASE WHEN p.componente = 'TOTAL'
    THEN CASE p.tipo_movimiento WHEN 'PAGO' THEN p.monto ELSE -p.monto END
    ELSE 0
  END
) > 0
AND SUM(
  CASE WHEN p.componente IN ('SUELDO', 'COMISIONES')
    THEN CASE p.tipo_movimiento WHEN 'PAGO' THEN p.monto ELSE -p.monto END
    ELSE 0
  END
) > 0;

-- Debe devolver cero filas: saldos por componente negativos o pagos separados
-- que exceden la distribucion neta aprobada.
WITH movimientos AS (
  SELECT
    p.id_liquidacion,
    SUM(CASE WHEN p.componente = 'SUELDO'
      THEN CASE p.tipo_movimiento WHEN 'PAGO' THEN p.monto ELSE -p.monto END
      ELSE 0 END
    ) AS pagado_sueldo,
    SUM(CASE WHEN p.componente = 'COMISIONES'
      THEN CASE p.tipo_movimiento WHEN 'PAGO' THEN p.monto ELSE -p.monto END
      ELSE 0 END
    ) AS pagado_comisiones
  FROM public.tb_compensacion_pago p
  GROUP BY p.id_liquidacion
)
SELECT
  l.id AS id_liquidacion,
  m.pagado_sueldo,
  m.pagado_comisiones
FROM movimientos m
JOIN public.tb_compensacion_liquidacion l ON l.id = m.id_liquidacion
WHERE m.pagado_sueldo < 0
   OR m.pagado_comisiones < 0
   OR m.pagado_sueldo > GREATEST(l.total_sueldo - l.total_descuentos, 0)
   OR m.pagado_comisiones > (
     l.total_pagar - GREATEST(l.total_sueldo - l.total_descuentos, 0)
   );

-- Debe devolver cero filas: reversas fechadas antes de su pago original.
SELECT
  r.id AS id_reversa,
  r.id_pago_origen,
  r.fecha_pago AS fecha_reversa,
  p.fecha_pago AS fecha_pago_original
FROM public.tb_compensacion_pago r
JOIN public.tb_compensacion_pago p ON p.id = r.id_pago_origen
WHERE r.tipo_movimiento = 'REVERSA'
  AND r.fecha_pago < p.fecha_pago;

-- Debe devolver cero filas: periodos cerrados sin cierre vigente o periodos no
-- cerrados que todavia conservan uno.
SELECT
  pe.id AS id_periodo,
  pe.estado_periodo,
  COUNT(ci.id) FILTER (WHERE ci.estado_cierre = 'VIGENTE') AS cierres_vigentes
FROM public.tb_compensacion_periodo pe
LEFT JOIN public.tb_compensacion_cierre ci ON ci.id_periodo = pe.id
GROUP BY pe.id, pe.estado_periodo
HAVING (
  pe.estado_periodo = 'CERRADO'
  AND COUNT(ci.id) FILTER (WHERE ci.estado_cierre = 'VIGENTE') <> 1
) OR (
  pe.estado_periodo <> 'CERRADO'
  AND COUNT(ci.id) FILTER (WHERE ci.estado_cierre = 'VIGENTE') <> 0
);

-- Debe devolver cero filas: cabeceras de cierre cuyos totales no concilian con
-- las liquidaciones congeladas.
SELECT
  ci.id AS id_cierre,
  ci.total_colaboradores,
  ci.total_pagar,
  ci.total_pagado,
  ci.total_pendiente
FROM public.tb_compensacion_cierre ci
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS colaboradores,
    COALESCE(SUM(cl.total_sueldo), 0) AS sueldo,
    COALESCE(SUM(cl.total_bonos), 0) AS bonos,
    COALESCE(SUM(cl.total_comisiones), 0) AS comisiones,
    COALESCE(SUM(cl.total_descuentos), 0) AS descuentos,
    COALESCE(SUM(cl.total_pagar), 0) AS pagar,
    COALESCE(SUM(cl.total_pagado), 0) AS pagado
  FROM public.tb_compensacion_cierre_liquidacion cl
  WHERE cl.id_cierre = ci.id
) x ON true
WHERE ci.total_colaboradores IS DISTINCT FROM x.colaboradores
   OR ci.total_sueldo IS DISTINCT FROM x.sueldo
   OR ci.total_bonos IS DISTINCT FROM x.bonos
   OR ci.total_comisiones IS DISTINCT FROM x.comisiones
   OR ci.total_descuentos IS DISTINCT FROM x.descuentos
   OR ci.total_pagar IS DISTINCT FROM x.pagar
   OR ci.total_pagado IS DISTINCT FROM x.pagado
   OR ci.total_pendiente IS DISTINCT FROM x.pagar - x.pagado;

-- Debe devolver cero filas: hashes de cierre o de liquidaciones congeladas que
-- no coinciden con sus snapshots almacenados.
SELECT 'CIERRE' AS alcance, ci.id
FROM public.tb_compensacion_cierre ci
WHERE ci.hash_integridad IS DISTINCT FROM md5(ci.snapshot_resumen::text)
UNION ALL
SELECT 'LIQUIDACION' AS alcance, cl.id
FROM public.tb_compensacion_cierre_liquidacion cl
WHERE cl.hash_integridad IS DISTINCT FROM md5(cl.detalle_snapshot::text);

-- Debe devolver cero filas: eventos marcados como liquidados que no aparecen
-- en un cierre vigente.
SELECT ev.id AS id_evento
FROM public.tb_compensacion_evento ev
WHERE ev.estado_evento = 'LIQUIDADO'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_cierre ci
    JOIN public.tb_compensacion_cierre_liquidacion cl ON cl.id_cierre = ci.id
    JOIN public.tb_compensacion_liquidacion_detalle d
      ON d.id_liquidacion = cl.id_liquidacion
    WHERE ci.estado_cierre = 'VIGENTE'
      AND d.id_evento = ev.id
  );

-- Debe devolver cero filas: ajustes aplicados que no aparecen en un cierre
-- vigente del periodo destino.
SELECT a.id AS id_ajuste
FROM public.tb_compensacion_ajuste a
WHERE a.estado_ajuste = 'APLICADO'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_cierre ci
    JOIN public.tb_compensacion_cierre_liquidacion cl ON cl.id_cierre = ci.id
    JOIN public.tb_compensacion_liquidacion_detalle d
      ON d.id_liquidacion = cl.id_liquidacion
    WHERE ci.id_periodo = a.id_periodo_destino
      AND ci.estado_cierre = 'VIGENTE'
      AND d.tipo_origen = 'AJUSTE'
      AND d.clave_origen = 'AJUSTE:' || a.id
  );

-- Debe devolver cero filas: pagos creados despues de un cierre cuya politica
-- no permite conservar cuentas por pagar.
SELECT
  p.id AS id_pago,
  ci.id AS id_cierre
FROM public.tb_compensacion_pago p
JOIN public.tb_compensacion_liquidacion l ON l.id = p.id_liquidacion
JOIN public.tb_compensacion_cierre ci
  ON ci.id_periodo = l.id_periodo
 AND ci.estado_cierre = 'VIGENTE'
WHERE p.tipo_movimiento = 'PAGO'
  AND p.fecha_registro > ci.fecha_cierre
  AND ci.snapshot_resumen ->> 'politica_pago'
    IS DISTINCT FROM 'PERMITIR_CUENTAS_POR_PAGAR';

-- Debe devolver cero filas: reversas posteriores al cierre aplicadas sobre un
-- pago que ya estaba congelado dentro de ese snapshot.
SELECT
  r.id AS id_reversa,
  r.id_pago_origen,
  ci.id AS id_cierre
FROM public.tb_compensacion_pago r
JOIN public.tb_compensacion_pago p ON p.id = r.id_pago_origen
JOIN public.tb_compensacion_liquidacion l ON l.id = r.id_liquidacion
JOIN public.tb_compensacion_cierre ci
  ON ci.id_periodo = l.id_periodo
 AND ci.estado_cierre = 'VIGENTE'
WHERE r.tipo_movimiento = 'REVERSA'
  AND r.fecha_registro > ci.fecha_cierre
  AND p.fecha_registro <= ci.fecha_cierre;

-- Debe devolver cero filas: cierres vigentes sin snapshots de asistencia y
-- productividad requeridos por los reportes historicos.
SELECT ci.id AS id_cierre
FROM public.tb_compensacion_cierre ci
WHERE ci.estado_cierre = 'VIGENTE'
  AND (
    jsonb_typeof(ci.snapshot_resumen -> 'asistencia') IS DISTINCT FROM 'array'
    OR jsonb_typeof(ci.snapshot_resumen -> 'productividad' -> 'items')
      IS DISTINCT FROM 'array'
  );

-- Debe devolver cero filas: metricas congeladas imposibles o negativas.
SELECT
  ci.id AS id_cierre,
  p.value ->> 'id_colaborador' AS id_colaborador
FROM public.tb_compensacion_cierre ci
CROSS JOIN LATERAL jsonb_array_elements(
  ci.snapshot_resumen -> 'productividad' -> 'items'
) p(value)
WHERE COALESCE((p.value ->> 'clientes_registrados')::integer, 0) < 0
   OR COALESCE((p.value ->> 'clientes_convertidos_7_dias')::integer, 0) < 0
   OR COALESCE((p.value ->> 'clientes_convertidos_7_dias')::integer, 0)
      > COALESCE((p.value ->> 'clientes_registrados')::integer, 0)
   OR COALESCE((p.value ->> 'operaciones_pagadas_atribuidas')::integer, 0) < 0
   OR COALESCE((p.value ->> 'calificaciones_aprobadas')::integer, 0) < 0;

-- Debe devolver cero filas: exportaciones asociadas a un cierre de otro
-- periodo o con evidencia incoherente respecto de su estado.
SELECT e.id AS id_exportacion
FROM public.tb_compensacion_exportacion e
LEFT JOIN public.tb_compensacion_cierre ci ON ci.id = e.id_cierre
WHERE (e.id_cierre IS NOT NULL AND ci.id_periodo IS DISTINCT FROM e.id_periodo)
   OR (e.estado_exportacion = 'GENERADA'
       AND BTRIM(COALESCE(e.hash_archivo, '')) = '')
   OR (e.estado_exportacion = 'ERROR'
       AND BTRIM(COALESCE(e.mensaje_error, '')) = '')
   OR (e.estado_exportacion = 'ANULADA' AND (
       e.id_usuario_anula IS NULL
       OR e.fecha_anulacion IS NULL
       OR BTRIM(COALESCE(e.motivo_anulacion, '')) = ''
   ));

-- Debe devolver cero filas: una misma clave idempotente registrada mas de una
-- vez por actor, periodo, reporte y formato.
SELECT
  e.id_usuario,
  e.id_periodo,
  e.tipo_reporte,
  e.formato,
  e.clave_idempotencia,
  COUNT(*) AS repeticiones
FROM public.tb_compensacion_exportacion e
WHERE e.clave_idempotencia IS NOT NULL
GROUP BY
  e.id_usuario,
  e.id_periodo,
  e.tipo_reporte,
  e.formato,
  e.clave_idempotencia
HAVING COUNT(*) > 1;

SELECT
  p.proname AS funcion,
  p.prosecdef AS security_definer,
  has_function_privilege(
    'anon',
    p.oid,
    'EXECUTE'
  ) AS anon_puede_ejecutar,
  has_function_privilege(
    'authenticated',
    p.oid,
    'EXECUTE'
  ) AS authenticated_puede_ejecutar
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname LIKE 'f\_%compensacion%' ESCAPE '\'
ORDER BY p.proname;

ROLLBACK;
