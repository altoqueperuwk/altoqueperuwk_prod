-- ============================================================================
-- COMPENSACIONES - MOTOR DE PRELIQUIDACION
-- ============================================================================
-- Objetivo:
--   Simular y persistir preliquidaciones versionadas y explicables. Consume
--   asignaciones, reglas publicadas, asistencia, eventos aprobados, incidencias
--   y ajustes, sin crear movimientos en caja.
--
-- Dependencias:
--   17.compensaciones_personal_configuracion.sql
--   18.compensaciones_asistencia_evidencias.sql
--   19.compensaciones_liquidaciones_cierres_reportes.sql
--   20.compensaciones_seguridad_personal_funciones.sql
--   24.compensaciones_periodos_funciones.sql
--   27.compensaciones_evidencias_funciones.sql
--   28.compensaciones_referidos_funciones.sql
--   29.compensaciones_incidencias_funciones.sql
-- ============================================================================

-- ============================================================================
-- 1. ALCANCE DE LIQUIDACIONES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_compensacion_liquidacion_validar_alcance(
  p_id_colaborador bigint,
  p_accion character varying,
  p_fecha_referencia date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_alcance character varying;
  v_id_colaborador_actor bigint;
  v_id_sucursal_alcance bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_colaborador WHERE id = p_id_colaborador
  ) THEN
    RAISE EXCEPTION 'El colaborador no existe';
  END IF;

  v_contexto := public.f_private_compensacion_contexto('LIQUIDACIONES', p_accion);
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  IF v_alcance = 'PROPIO'
     AND p_id_colaborador IS DISTINCT FROM v_id_colaborador_actor THEN
    RAISE EXCEPTION 'Solo puede consultar su propia liquidacion';
  END IF;

  IF v_alcance = 'SEDE' AND NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_asignacion a
    WHERE a.id_colaborador = p_id_colaborador
      AND a.id_sucursal = v_id_sucursal_alcance
      AND a.fecha_inicio <= (
        date_trunc('month', p_fecha_referencia)::date + INTERVAL '1 month - 1 day'
      )::date
      AND (
        a.fecha_fin IS NULL
        OR a.fecha_fin >= date_trunc('month', p_fecha_referencia)::date
      )
  ) THEN
    RAISE EXCEPTION 'El colaborador no pertenece a su sede autorizada';
  END IF;

  RETURN v_contexto;
END;
$$;

REVOKE ALL ON FUNCTION public.f_private_compensacion_liquidacion_validar_alcance(
  bigint, character varying, date
) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. SIMULADOR PRIVADO (FUENTE UNICA DEL CALCULO)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_compensacion_liquidacion_simular(
  p_id_periodo bigint,
  p_id_colaborador bigint
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
WITH periodo AS (
  SELECT *
  FROM public.tb_compensacion_periodo
  WHERE id = p_id_periodo
), colaborador AS (
  SELECT *
  FROM public.tb_compensacion_colaborador
  WHERE id = p_id_colaborador
), tramos_base AS (
  SELECT
    a.id AS id_asignacion,
    a.id_cargo,
    a.id_sucursal,
    a.id_jornada,
    a.id_plan,
    pv.id AS id_plan_version,
    GREATEST(a.fecha_inicio, pv.fecha_inicio, pe.fecha_inicio, c.fecha_ingreso) AS fecha_inicio,
    LEAST(
      COALESCE(a.fecha_fin, pe.fecha_fin),
      COALESCE(pv.fecha_fin, pe.fecha_fin),
      pe.fecha_fin,
      COALESCE(c.fecha_cese, pe.fecha_fin)
    ) AS fecha_fin,
    ca.codigo AS cargo_codigo,
    ca.nombre AS cargo_nombre,
    s.nombre AS sucursal_nombre,
    j.codigo AS jornada_codigo,
    j.nombre AS jornada_nombre,
    pl.codigo AS plan_codigo,
    pl.nombre AS plan_nombre,
    pv.numero_version
  FROM periodo pe
  JOIN colaborador c ON true
  JOIN public.tb_compensacion_asignacion a
    ON a.id_colaborador = c.id
   AND a.fecha_inicio <= pe.fecha_fin
   AND (a.fecha_fin IS NULL OR a.fecha_fin >= pe.fecha_inicio)
  JOIN public.tb_compensacion_plan_version pv
    ON pv.id_plan = a.id_plan
   AND pv.estado_version = 'PUBLICADA'
   AND pv.fecha_inicio <= pe.fecha_fin
   AND (pv.fecha_fin IS NULL OR pv.fecha_fin >= pe.fecha_inicio)
  JOIN public.tb_compensacion_cargo ca ON ca.id = a.id_cargo
  JOIN public.tb_sucursal s ON s.id = a.id_sucursal
  JOIN public.tb_compensacion_jornada j ON j.id = a.id_jornada
  JOIN public.tb_compensacion_plan pl ON pl.id = a.id_plan
), tramos AS (
  SELECT
    tb.*,
    (tb.fecha_fin - tb.fecha_inicio + 1)::integer AS dias_calendario,
    COALESCE((
      SELECT COUNT(*)::numeric
      FROM public.tb_asistencia_jornada aj
      WHERE aj.id_colaborador = p_id_colaborador
        AND aj.id_asignacion = tb.id_asignacion
        AND aj.fecha BETWEEN tb.fecha_inicio AND tb.fecha_fin
        AND aj.estado_dia IN (
          'COMPLETO', 'JUSTIFICADO', 'VACACIONES', 'LICENCIA'
        )
    ), 0) AS dias_pagables
  FROM tramos_base tb
  WHERE tb.fecha_fin >= tb.fecha_inicio
), reglas_sueldo AS (
  SELECT
    t.*,
    r.id AS id_regla,
    r.id_concepto,
    r.tipo_calculo,
    r.monto,
    r.configuracion AS regla_configuracion,
    co.codigo AS concepto_codigo,
    co.nombre AS concepto_nombre,
    co.categoria,
    co.naturaleza
  FROM tramos t
  LEFT JOIN LATERAL (
    SELECT regla.*
    FROM public.tb_compensacion_regla regla
    JOIN public.tb_compensacion_concepto concepto
      ON concepto.id = regla.id_concepto
    JOIN public.tb_estado es ON es.id = regla.id_estado
    WHERE regla.id_plan_version = t.id_plan_version
      AND concepto.categoria = 'SUELDO'
      AND (regla.id_cargo IS NULL OR regla.id_cargo = t.id_cargo)
      AND (regla.id_sucursal IS NULL OR regla.id_sucursal = t.id_sucursal)
      AND UPPER(es.nombre) = 'ACTIVO'
    ORDER BY
      ((regla.id_cargo IS NOT NULL)::integer +
       (regla.id_sucursal IS NOT NULL)::integer) DESC,
      regla.prioridad DESC,
      regla.id DESC
    LIMIT 1
  ) r ON true
  LEFT JOIN public.tb_compensacion_concepto co ON co.id = r.id_concepto
), detalle_sueldo AS (
  SELECT jsonb_build_object(
    'id_asignacion', rs.id_asignacion,
    'id_plan_version', rs.id_plan_version,
    'fecha_inicio_tramo', rs.fecha_inicio,
    'fecha_fin_tramo', rs.fecha_fin,
    'id_concepto', rs.id_concepto,
    'id_regla', rs.id_regla,
    'tipo_origen', 'ASIGNACION',
    'clave_origen', 'SUELDO:' || rs.id_asignacion || ':' || rs.id_plan_version || ':' || rs.fecha_inicio,
    'id_evento', NULL,
    'id_jornada', NULL,
    'id_operacion', NULL,
    'id_excepcion', NULL,
    'concepto_codigo', rs.concepto_codigo,
    'concepto_nombre', rs.concepto_nombre,
    'categoria', rs.categoria,
    'naturaleza', rs.naturaleza,
    'regla_snapshot', jsonb_build_object(
      'tipo_calculo', rs.tipo_calculo,
      'monto', rs.monto,
      'configuracion', rs.regla_configuracion,
      'id_plan_version', rs.id_plan_version
    ),
    'formula_snapshot', CASE
      WHEN rs.tipo_calculo = 'POR_DIA' THEN 'monto * dias_pagables'
      WHEN COALESCE(rs.regla_configuracion ->> 'metodo_prorrateo', 'DIAS_CALENDARIO') = 'DIAS_PAGABLES'
        THEN 'monto / divisor_dias * dias_pagables'
      ELSE 'monto * dias_calendario_tramo / dias_calendario_periodo'
    END,
    'base_calculo', rs.monto,
    'cantidad', CASE
      WHEN rs.tipo_calculo = 'POR_DIA' THEN rs.dias_pagables
      WHEN COALESCE(rs.regla_configuracion ->> 'metodo_prorrateo', 'DIAS_CALENDARIO') = 'DIAS_PAGABLES'
        THEN rs.dias_pagables
      ELSE rs.dias_calendario
    END,
    'tarifa', CASE
      WHEN rs.tipo_calculo = 'POR_DIA' THEN rs.monto
      WHEN COALESCE(rs.regla_configuracion ->> 'metodo_prorrateo', 'DIAS_CALENDARIO') = 'DIAS_PAGABLES'
        THEN rs.monto / NULLIF(COALESCE(
          CASE
            WHEN rs.regla_configuracion ->> 'divisor_dias' ~ '^[0-9]+([.][0-9]+)?$'
              THEN (rs.regla_configuracion ->> 'divisor_dias')::numeric
            ELSE NULL
          END,
          EXTRACT(day FROM pe.fecha_fin)::numeric
        ), 0)
      ELSE rs.monto / EXTRACT(day FROM pe.fecha_fin)::numeric
    END,
    'importe', ROUND(CASE
      WHEN rs.tipo_calculo = 'POR_DIA' THEN rs.monto * rs.dias_pagables
      WHEN COALESCE(rs.regla_configuracion ->> 'metodo_prorrateo', 'DIAS_CALENDARIO') = 'DIAS_PAGABLES'
        THEN rs.monto / NULLIF(COALESCE(
          CASE
            WHEN rs.regla_configuracion ->> 'divisor_dias' ~ '^[0-9]+([.][0-9]+)?$'
              THEN (rs.regla_configuracion ->> 'divisor_dias')::numeric
            ELSE NULL
          END,
          EXTRACT(day FROM pe.fecha_fin)::numeric
        ), 0) * rs.dias_pagables
      ELSE rs.monto * rs.dias_calendario / EXTRACT(day FROM pe.fecha_fin)::numeric
    END, 2),
    'datos_origen', jsonb_build_object(
      'dias_calendario', rs.dias_calendario,
      'dias_pagables', rs.dias_pagables,
      'cargo', rs.cargo_nombre,
      'sucursal', rs.sucursal_nombre,
      'plan', rs.plan_nombre
    )
  ) AS linea
  FROM reglas_sueldo rs
  CROSS JOIN periodo pe
  WHERE rs.id_regla IS NOT NULL
    AND rs.tipo_calculo IN ('FIJO', 'POR_DIA')
    AND COALESCE(
      rs.regla_configuracion ->> 'metodo_prorrateo',
      'DIAS_CALENDARIO'
    ) IN ('DIAS_CALENDARIO', 'DIAS_PAGABLES')
), reglas_asistencia AS (
  SELECT DISTINCT ON (aj.id, co.id)
    t.id_asignacion,
    t.id_plan_version,
    t.fecha_inicio,
    t.fecha_fin,
    aj.id AS id_jornada_asistencia,
    aj.fecha,
    aj.minutos_tardanza,
    aj.minutos_extra,
    aj.estado_dia,
    r.id,
    r.id_concepto,
    r.id_cargo,
    r.id_sucursal,
    r.tipo_calculo,
    r.monto,
    r.porcentaje,
    r.valor_minimo,
    r.valor_maximo,
    r.tope_importe,
    r.prioridad,
    r.configuracion,
    r.id_estado,
    co.codigo AS concepto_codigo,
    co.nombre AS concepto_nombre,
    co.categoria,
    co.naturaleza,
    CASE r.configuracion ->> 'fuente_asistencia'
      WHEN 'MINUTOS_TARDANZA' THEN aj.minutos_tardanza::numeric
      WHEN 'MINUTOS_EXTRA' THEN aj.minutos_extra::numeric
      ELSE 0::numeric
    END AS cantidad_origen
  FROM tramos t
  JOIN public.tb_asistencia_jornada aj
    ON aj.id_asignacion = t.id_asignacion
   AND aj.id_colaborador = p_id_colaborador
   AND aj.fecha BETWEEN t.fecha_inicio AND t.fecha_fin
  JOIN public.tb_compensacion_regla r ON r.id_plan_version = t.id_plan_version
  JOIN public.tb_compensacion_concepto co ON co.id = r.id_concepto
  JOIN public.tb_estado es ON es.id = r.id_estado
  WHERE r.configuracion ->> 'fuente_asistencia' IN (
      'MINUTOS_TARDANZA', 'MINUTOS_EXTRA'
    )
    AND (r.id_cargo IS NULL OR r.id_cargo = t.id_cargo)
    AND (r.id_sucursal IS NULL OR r.id_sucursal = t.id_sucursal)
    AND UPPER(es.nombre) = 'ACTIVO'
  ORDER BY aj.id, co.id,
    ((r.id_cargo IS NOT NULL)::integer + (r.id_sucursal IS NOT NULL)::integer) DESC,
    r.prioridad DESC, r.id DESC
), detalle_asistencia AS (
  SELECT jsonb_build_object(
    'id_asignacion', ra.id_asignacion,
    'id_plan_version', ra.id_plan_version,
    'fecha_inicio_tramo', ra.fecha_inicio,
    'fecha_fin_tramo', ra.fecha_fin,
    'id_concepto', ra.id_concepto,
    'id_regla', ra.id,
    'tipo_origen', 'ASISTENCIA',
    'clave_origen', 'ASISTENCIA:' || ra.id_jornada_asistencia || ':' || ra.id_concepto,
    'id_evento', NULL,
    'id_jornada', ra.id_jornada_asistencia,
    'id_operacion', NULL,
    'id_excepcion', NULL,
    'concepto_codigo', ra.concepto_codigo,
    'concepto_nombre', ra.concepto_nombre,
    'categoria', ra.categoria,
    'naturaleza', ra.naturaleza,
    'regla_snapshot', jsonb_build_object(
      'tipo_calculo', ra.tipo_calculo,
      'monto', ra.monto,
      'configuracion', ra.configuracion
    ),
    'formula_snapshot', 'monto * cantidad_asistencia',
    'base_calculo', ra.cantidad_origen,
    'cantidad', ra.cantidad_origen,
    'tarifa', ra.monto,
    'importe', ROUND(CASE
      WHEN ra.tipo_calculo = 'FIJO' THEN ra.monto
      ELSE ra.monto * ra.cantidad_origen
    END, 2),
    'datos_origen', jsonb_build_object(
      'fecha', ra.fecha,
      'estado_dia', ra.estado_dia,
      'minutos_tardanza', ra.minutos_tardanza,
      'minutos_extra', ra.minutos_extra
    )
  ) AS linea
  FROM reglas_asistencia ra
  WHERE ra.cantidad_origen > 0
    AND ra.tipo_calculo IN ('FIJO', 'POR_MINUTO', 'POR_UNIDAD')
), operaciones_pagadas AS (
  SELECT
    op.*,
    COALESCE(op.fecha_pagado, op.fecha_deposito_cliente, op.fecha_registro)
      AS fecha_atribucion,
    GREATEST(COALESCE(op.monto_deposito_cliente, 0), 0)::numeric
      AS base_operacion
  FROM periodo pe
  JOIN public.tb_operacion_proceso op
    ON UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
   AND (
     COALESCE(op.fecha_pagado, op.fecha_deposito_cliente, op.fecha_registro)
     AT TIME ZONE pe.zona_horaria
   )::date BETWEEN pe.fecha_inicio AND pe.fecha_fin
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.tb_operacion_proceso_eliminada oe
    WHERE oe.id_operacion_proceso = op.id
  )
), fuentes_operacion AS (
  SELECT
    op.id AS id_operacion,
    op.fecha_atribucion,
    op.base_operacion,
    op.codigo_operacion_deposito_cliente,
    op.id_cliente,
    op.dni_cliente,
    op.nombre_cliente,
    op.tipo_servicio,
    'OPERACION_PAGADA_GESTOR'::text AS fuente_operacion
  FROM operaciones_pagadas op
  JOIN colaborador c
    ON COALESCE(op.id_usuario_gestor, op.id_usuario) = c.id_usuario

  UNION ALL

  SELECT
    primera.id AS id_operacion,
    primera.fecha_atribucion,
    GREATEST(COALESCE(primera.monto_deposito_cliente, 0), 0)::numeric,
    primera.codigo_operacion_deposito_cliente,
    primera.id_cliente,
    primera.dni_cliente,
    primera.nombre_cliente,
    primera.tipo_servicio,
    'CLIENTE_NUEVO_EFECTIVIZADO_7_DIAS'::text
  FROM periodo pe
  JOIN colaborador c ON c.id_usuario IS NOT NULL
  JOIN public.tb_cliente cli ON cli.id_usuario = c.id_usuario
  JOIN LATERAL (
    SELECT
      op.*,
      COALESCE(op.fecha_pagado, op.fecha_deposito_cliente, op.fecha_registro)
        AS fecha_atribucion
    FROM public.tb_operacion_proceso op
    WHERE op.id_cliente = cli.id
      AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
      AND NOT EXISTS (
        SELECT 1
        FROM public.tb_operacion_proceso_eliminada oe
        WHERE oe.id_operacion_proceso = op.id
      )
      AND COALESCE(op.fecha_pagado, op.fecha_deposito_cliente, op.fecha_registro)
        >= cli.fecha_registro
      AND COALESCE(op.fecha_pagado, op.fecha_deposito_cliente, op.fecha_registro)
        <= cli.fecha_registro + INTERVAL '7 days'
    ORDER BY
      COALESCE(op.fecha_pagado, op.fecha_deposito_cliente, op.fecha_registro),
      op.id
    LIMIT 1
  ) primera ON true
  WHERE (
    primera.fecha_atribucion AT TIME ZONE pe.zona_horaria
  )::date BETWEEN pe.fecha_inicio AND pe.fecha_fin
), reglas_operacion AS (
  SELECT DISTINCT ON (fo.id_operacion, r.id_concepto)
    t.id_asignacion,
    t.id_plan_version,
    t.fecha_inicio,
    t.fecha_fin,
    fo.*,
    r.id AS id_regla,
    r.id_concepto,
    r.tipo_calculo,
    r.monto,
    r.porcentaje,
    r.tope_importe,
    r.configuracion,
    co.codigo AS concepto_codigo,
    co.nombre AS concepto_nombre,
    co.categoria,
    co.naturaleza
  FROM fuentes_operacion fo
  JOIN tramos t
    ON (fo.fecha_atribucion AT TIME ZONE (
      SELECT zona_horaria FROM periodo LIMIT 1
    ))::date BETWEEN t.fecha_inicio AND t.fecha_fin
  JOIN public.tb_compensacion_regla r
    ON r.id_plan_version = t.id_plan_version
   AND r.configuracion ->> 'fuente_operacion' = fo.fuente_operacion
   AND (r.id_cargo IS NULL OR r.id_cargo = t.id_cargo)
   AND (r.id_sucursal IS NULL OR r.id_sucursal = t.id_sucursal)
  JOIN public.tb_compensacion_concepto co ON co.id = r.id_concepto
  JOIN public.tb_estado es ON es.id = r.id_estado
  WHERE UPPER(BTRIM(es.nombre)) = 'ACTIVO'
    AND co.naturaleza = 'INGRESO'
    AND co.categoria IN ('BONO', 'COMISION')
    AND r.tipo_calculo IN ('FIJO', 'POR_UNIDAD', 'PORCENTAJE')
    AND (r.valor_minimo IS NULL OR fo.base_operacion >= r.valor_minimo)
    AND (r.valor_maximo IS NULL OR fo.base_operacion <= r.valor_maximo)
  ORDER BY
    fo.id_operacion,
    r.id_concepto,
    ((r.id_cargo IS NOT NULL)::integer +
     (r.id_sucursal IS NOT NULL)::integer) DESC,
    r.prioridad DESC,
    r.id DESC
), detalle_operaciones AS (
  SELECT jsonb_build_object(
    'id_asignacion', ro.id_asignacion,
    'id_plan_version', ro.id_plan_version,
    'fecha_inicio_tramo', ro.fecha_inicio,
    'fecha_fin_tramo', ro.fecha_fin,
    'id_concepto', ro.id_concepto,
    'id_regla', ro.id_regla,
    'tipo_origen', 'OPERACION',
    'clave_origen', 'OPERACION:' || ro.id_operacion || ':REGLA:' || ro.id_regla,
    'id_evento', NULL,
    'id_jornada', NULL,
    'id_operacion', ro.id_operacion,
    'id_excepcion', NULL,
    'concepto_codigo', ro.concepto_codigo,
    'concepto_nombre', ro.concepto_nombre,
    'categoria', ro.categoria,
    'naturaleza', ro.naturaleza,
    'regla_snapshot', jsonb_build_object(
      'tipo_calculo', ro.tipo_calculo,
      'monto', ro.monto,
      'porcentaje', ro.porcentaje,
      'tope_importe', ro.tope_importe,
      'configuracion', ro.configuracion
    ),
    'formula_snapshot', CASE ro.tipo_calculo
      WHEN 'PORCENTAJE' THEN 'monto_deposito_cliente * porcentaje / 100'
      ELSE 'monto fijo por operacion elegible'
    END,
    'base_calculo', ro.base_operacion,
    'cantidad', 1,
    'tarifa', CASE
      WHEN ro.tipo_calculo = 'PORCENTAJE' THEN ro.porcentaje
      ELSE ro.monto
    END,
    'importe', ROUND(LEAST(
      calculo.importe_calculado,
      COALESCE(ro.tope_importe, calculo.importe_calculado)
    ), 2),
    'datos_origen', jsonb_build_object(
      'fuente_operacion', ro.fuente_operacion,
      'fecha_atribucion', ro.fecha_atribucion,
      'codigo_operacion', ro.codigo_operacion_deposito_cliente,
      'id_cliente', ro.id_cliente,
      'dni_cliente', ro.dni_cliente,
      'nombre_cliente', ro.nombre_cliente,
      'tipo_servicio', ro.tipo_servicio,
      'monto_deposito_cliente', ro.base_operacion
    )
  ) AS linea
  FROM reglas_operacion ro
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN ro.tipo_calculo = 'PORCENTAJE'
        THEN ro.base_operacion * COALESCE(ro.porcentaje, 0) / 100
      ELSE COALESCE(ro.monto, 0)
    END AS importe_calculado
  ) calculo
  WHERE calculo.importe_calculado > 0
), detalle_eventos AS (
  SELECT jsonb_build_object(
    'id_asignacion', NULL,
    'id_plan_version', NULL,
    'fecha_inicio_tramo', NULL,
    'fecha_fin_tramo', NULL,
    'id_concepto', co.id,
    'id_regla', ev.id_regla_aplicada,
    'tipo_origen', 'EVENTO',
    'clave_origen', 'EVENTO:' || ev.id,
    'id_evento', ev.id,
    'id_jornada', NULL,
    'id_operacion', NULL,
    'id_excepcion', NULL,
    'concepto_codigo', co.codigo,
    'concepto_nombre', co.nombre,
    'categoria', co.categoria,
    'naturaleza', co.naturaleza,
    'regla_snapshot', ev.criterios_validacion_snapshot,
    'formula_snapshot', 'importe aprobado del evento',
    'base_calculo', COALESCE(ev.base_calculo, 0),
    'cantidad', COALESCE(ev.cantidad, 1),
    'tarifa', COALESCE(ev.tarifa_aplicada, ev.importe_aprobado, 0),
    'importe', ev.importe_aprobado,
    'datos_origen', jsonb_build_object(
      'tipo_evento', te.codigo,
      'categoria_evento', te.categoria,
      'fecha_evento', ev.fecha_evento,
      'evidencia', ev.evidencia
    )
  ) AS linea
  FROM periodo pe
  JOIN public.tb_compensacion_evento ev
    ON ev.periodo_imputacion = pe.periodo
   AND ev.id_colaborador_beneficiario = p_id_colaborador
   AND ev.estado_evento = 'APROBADO'
  JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
  JOIN public.tb_compensacion_concepto co ON co.id = te.id_concepto
  WHERE te.categoria NOT IN ('PENALIDAD', 'AUDITORIA_PAGO')
), detalle_incidencia_descuento AS (
  SELECT jsonb_build_object(
    'id_asignacion', NULL, 'id_plan_version', NULL,
    'fecha_inicio_tramo', NULL, 'fecha_fin_tramo', NULL,
    'id_concepto', (ev.criterios_validacion_snapshot ->> 'id_concepto_descuento')::bigint,
    'id_regla', NULL, 'tipo_origen', 'EVENTO',
    'clave_origen', 'INCIDENCIA_DESCUENTO:' || ev.id,
    'id_evento', ev.id, 'id_jornada', NULL, 'id_operacion', NULL, 'id_excepcion', NULL,
    'concepto_codigo', co.codigo, 'concepto_nombre', co.nombre,
    'categoria', co.categoria, 'naturaleza', co.naturaleza,
    'regla_snapshot', ev.criterios_validacion_snapshot,
    'formula_snapshot', 'descuento aprobado de incidencia',
    'base_calculo', 1, 'cantidad', 1,
    'tarifa', ev.importe_aprobado, 'importe', ev.importe_aprobado,
    'datos_origen', jsonb_build_object('id_penalidad_tipo', ev.id_penalidad_tipo)
  ) AS linea
  FROM periodo pe
  JOIN public.tb_compensacion_evento ev
    ON ev.periodo_imputacion = pe.periodo
   AND ev.id_colaborador_responsable = p_id_colaborador
   AND ev.estado_evento = 'APROBADO'
  JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
  JOIN public.tb_compensacion_concepto co
    ON co.id = (ev.criterios_validacion_snapshot ->> 'id_concepto_descuento')::bigint
  WHERE te.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
), detalle_incidencia_bono AS (
  SELECT jsonb_build_object(
    'id_asignacion', NULL, 'id_plan_version', NULL,
    'fecha_inicio_tramo', NULL, 'fecha_fin_tramo', NULL,
    'id_concepto', (ev.criterios_validacion_snapshot ->> 'id_concepto_bono_reportante')::bigint,
    'id_regla', NULL, 'tipo_origen', 'EVENTO',
    'clave_origen', 'INCIDENCIA_BONO:' || ev.id,
    'id_evento', ev.id, 'id_jornada', NULL, 'id_operacion', NULL, 'id_excepcion', NULL,
    'concepto_codigo', co.codigo, 'concepto_nombre', co.nombre,
    'categoria', co.categoria, 'naturaleza', co.naturaleza,
    'regla_snapshot', ev.criterios_validacion_snapshot,
    'formula_snapshot', 'bono aprobado al reportante',
    'base_calculo', 1, 'cantidad', 1,
    'tarifa', (ev.criterios_validacion_snapshot ->> 'importe_bono_reportante')::numeric,
    'importe', (ev.criterios_validacion_snapshot ->> 'importe_bono_reportante')::numeric,
    'datos_origen', jsonb_build_object('id_penalidad_tipo', ev.id_penalidad_tipo)
  ) AS linea
  FROM periodo pe
  JOIN public.tb_compensacion_evento ev
    ON ev.periodo_imputacion = pe.periodo
   AND ev.id_colaborador_beneficiario = p_id_colaborador
   AND ev.estado_evento = 'APROBADO'
  JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
  JOIN public.tb_compensacion_concepto co
    ON co.id = (ev.criterios_validacion_snapshot ->> 'id_concepto_bono_reportante')::bigint
  WHERE te.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
    AND COALESCE(
      NULLIF(ev.criterios_validacion_snapshot ->> 'importe_bono_reportante', '')::numeric,
      0
    ) > 0
), detalle_ajustes AS (
  SELECT jsonb_build_object(
    'id_asignacion', NULL, 'id_plan_version', NULL,
    'fecha_inicio_tramo', NULL, 'fecha_fin_tramo', NULL,
    'id_concepto', aj.id_concepto, 'id_regla', NULL,
    'tipo_origen', 'AJUSTE', 'clave_origen', 'AJUSTE:' || aj.id,
    'id_evento', NULL, 'id_jornada', NULL, 'id_operacion', NULL, 'id_excepcion', NULL,
    'concepto_codigo', co.codigo, 'concepto_nombre', co.nombre,
    'categoria', co.categoria, 'naturaleza', aj.naturaleza,
    'regla_snapshot', '{}'::jsonb, 'formula_snapshot', 'ajuste aprobado',
    'base_calculo', aj.monto, 'cantidad', 1, 'tarifa', aj.monto, 'importe', aj.monto,
    'datos_origen', jsonb_build_object('motivo', aj.motivo, 'evidencia', aj.evidencia)
  ) AS linea
  FROM public.tb_compensacion_ajuste aj
  JOIN public.tb_compensacion_concepto co ON co.id = aj.id_concepto
  WHERE aj.id_periodo_destino = p_id_periodo
    AND aj.id_colaborador = p_id_colaborador
    AND aj.estado_ajuste = 'APROBADO'
), detalles AS (
  SELECT linea FROM detalle_sueldo
  UNION ALL SELECT linea FROM detalle_asistencia
  UNION ALL SELECT linea FROM detalle_operaciones
  UNION ALL SELECT linea FROM detalle_eventos
  UNION ALL SELECT linea FROM detalle_incidencia_descuento
  UNION ALL SELECT linea FROM detalle_incidencia_bono
  UNION ALL SELECT linea FROM detalle_ajustes
), bloqueos AS (
  SELECT jsonb_build_object(
    'codigo', 'SIN_ASIGNACION',
    'mensaje', 'El colaborador no tiene tramos de asignacion con matriz publicada'
  ) AS bloqueo
  WHERE NOT EXISTS (SELECT 1 FROM tramos)

  UNION ALL
  SELECT jsonb_build_object(
    'codigo', 'SIN_REGLA_SUELDO',
    'mensaje', 'Un tramo no tiene regla de sueldo FIJO o POR_DIA',
    'id_asignacion', id_asignacion,
    'id_plan_version', id_plan_version
  )
  FROM reglas_sueldo
  WHERE id_regla IS NULL
     OR tipo_calculo NOT IN ('FIJO', 'POR_DIA')
     OR COALESCE(
       regla_configuracion ->> 'metodo_prorrateo',
       'DIAS_CALENDARIO'
     ) NOT IN ('DIAS_CALENDARIO', 'DIAS_PAGABLES')
     OR (
       COALESCE(
         regla_configuracion ->> 'metodo_prorrateo',
         'DIAS_CALENDARIO'
       ) = 'DIAS_PAGABLES'
       AND regla_configuracion ? 'divisor_dias'
       AND (
         regla_configuracion ->> 'divisor_dias' !~ '^[0-9]+([.][0-9]+)?$'
         OR CASE
           WHEN regla_configuracion ->> 'divisor_dias' ~ '^[0-9]+([.][0-9]+)?$'
             THEN (regla_configuracion ->> 'divisor_dias')::numeric <= 0
           ELSE true
         END
       )
     )

  UNION ALL
  SELECT jsonb_build_object(
    'codigo', 'ASISTENCIA_INCOMPLETA',
    'mensaje', 'Faltan jornadas consolidadas para un tramo con prorrateo por dias pagables',
    'id_asignacion', rs.id_asignacion,
    'jornadas_esperadas', esperado.jornadas_esperadas,
    'jornadas_registradas', esperado.jornadas_registradas
  )
  FROM reglas_sueldo rs
  JOIN LATERAL (
    SELECT
      (
        SELECT COUNT(*)
        FROM generate_series(rs.fecha_inicio, rs.fecha_fin, INTERVAL '1 day') gs
        JOIN public.tb_compensacion_jornada jo ON jo.id = rs.id_jornada
        WHERE EXTRACT(isodow FROM gs)::smallint = ANY(jo.dias_semana)
      ) AS jornadas_esperadas,
      (
        SELECT COUNT(*)
        FROM public.tb_asistencia_jornada aj
        WHERE aj.id_asignacion = rs.id_asignacion
          AND aj.id_colaborador = p_id_colaborador
          AND aj.fecha BETWEEN rs.fecha_inicio AND rs.fecha_fin
      ) AS jornadas_registradas
  ) esperado ON true
  WHERE COALESCE(
      rs.regla_configuracion ->> 'metodo_prorrateo',
      'DIAS_CALENDARIO'
    ) = 'DIAS_PAGABLES'
    AND esperado.jornadas_registradas < esperado.jornadas_esperadas

  UNION ALL
  SELECT jsonb_build_object(
    'codigo', 'REGLA_ASISTENCIA_NO_SOPORTADA',
    'mensaje', 'Una regla automatica de asistencia usa un tipo de calculo no soportado',
    'id_regla', id,
    'tipo_calculo', tipo_calculo
  )
  FROM reglas_asistencia
  WHERE tipo_calculo NOT IN ('FIJO', 'POR_MINUTO', 'POR_UNIDAD')

  UNION ALL
  SELECT jsonb_build_object(
    'codigo', 'ASISTENCIA_PENDIENTE',
    'mensaje', 'Existen solicitudes de asistencia pendientes'
  )
  WHERE EXISTS (
    SELECT 1
    FROM public.tb_asistencia_solicitud so
    JOIN public.tb_asistencia_jornada aj ON aj.id = so.id_jornada
    JOIN periodo pe ON true
    WHERE so.id_colaborador = p_id_colaborador
      AND so.estado_solicitud = 'PENDIENTE'
      AND aj.fecha BETWEEN pe.fecha_inicio AND pe.fecha_fin
  )

  UNION ALL
  SELECT jsonb_build_object(
    'codigo', 'EVENTO_PENDIENTE',
    'mensaje', 'Existen eventos monetarios pendientes de decision'
  )
  WHERE EXISTS (
    SELECT 1
    FROM public.tb_compensacion_evento ev
    JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
    JOIN periodo pe ON true
    WHERE ev.periodo_imputacion = pe.periodo
      AND ev.estado_evento IN ('BORRADOR', 'PENDIENTE')
      AND p_id_colaborador IN (
        ev.id_colaborador_beneficiario,
        ev.id_colaborador_responsable
      )
      AND (
        te.id_concepto IS NOT NULL
        OR te.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
      )
  )

  UNION ALL
  SELECT jsonb_build_object(
    'codigo', 'EXCEPCION_NO_IMPLEMENTADA',
    'mensaje', 'Existe una excepcion aprobada que requiere definir modo ADICION o REEMPLAZO',
    'id_excepcion', ex.id
  )
  FROM public.tb_compensacion_excepcion ex
  JOIN periodo pe ON true
  WHERE ex.id_colaborador = p_id_colaborador
    AND ex.estado_aprobacion = 'APROBADA'
    AND ex.fecha_inicio <= pe.fecha_fin
    AND (ex.fecha_fin IS NULL OR ex.fecha_fin >= pe.fecha_inicio)
), totales AS (
  SELECT
    COALESCE(SUM((linea ->> 'importe')::numeric) FILTER (
      WHERE linea ->> 'categoria' = 'SUELDO' AND linea ->> 'naturaleza' = 'INGRESO'
    ), 0) AS total_sueldo,
    COALESCE(SUM((linea ->> 'importe')::numeric) FILTER (
      WHERE linea ->> 'categoria' = 'BONO' AND linea ->> 'naturaleza' = 'INGRESO'
    ), 0) AS total_bonos,
    COALESCE(SUM((linea ->> 'importe')::numeric) FILTER (
      WHERE linea ->> 'categoria' = 'COMISION' AND linea ->> 'naturaleza' = 'INGRESO'
    ), 0) AS total_comisiones,
    COALESCE(SUM((linea ->> 'importe')::numeric) FILTER (
      WHERE linea ->> 'naturaleza' = 'DESCUENTO'
    ), 0) AS total_descuentos
  FROM detalles
)
SELECT jsonb_build_object(
  'periodo', (SELECT to_jsonb(pe) FROM periodo pe),
  'colaborador', (SELECT jsonb_build_object(
    'id', c.id,
    'tipo_documento', c.tipo_documento,
    'numero_documento', c.numero_documento,
    'nombre_completo', c.nombre_completo
  ) FROM colaborador c),
  'tramos', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id_asignacion', t.id_asignacion,
    'id_plan_version', t.id_plan_version,
    'fecha_inicio', t.fecha_inicio,
    'fecha_fin', t.fecha_fin,
    'dias_calendario', t.dias_calendario,
    'dias_pagables', t.dias_pagables,
    'asignacion_snapshot', jsonb_build_object(
      'id_cargo', t.id_cargo, 'cargo_codigo', t.cargo_codigo, 'cargo_nombre', t.cargo_nombre,
      'id_sucursal', t.id_sucursal, 'sucursal_nombre', t.sucursal_nombre,
      'id_jornada', t.id_jornada, 'jornada_codigo', t.jornada_codigo,
      'jornada_nombre', t.jornada_nombre, 'id_plan', t.id_plan,
      'plan_codigo', t.plan_codigo, 'plan_nombre', t.plan_nombre,
      'numero_version', t.numero_version
    )
  ) ORDER BY t.fecha_inicio, t.id_asignacion) FROM tramos t), '[]'::jsonb),
  'detalles', COALESCE((SELECT jsonb_agg(linea ORDER BY linea ->> 'clave_origen') FROM detalles), '[]'::jsonb),
  'bloqueos', COALESCE((SELECT jsonb_agg(bloqueo) FROM bloqueos), '[]'::jsonb),
  'puede_calcular', NOT EXISTS (SELECT 1 FROM bloqueos),
  'total_sueldo', ROUND(t.total_sueldo, 2),
  'total_bonos', ROUND(t.total_bonos, 2),
  'total_comisiones', ROUND(t.total_comisiones, 2),
  'total_descuentos', ROUND(t.total_descuentos, 2),
  'total_pagar', ROUND(
    t.total_sueldo + t.total_bonos + t.total_comisiones - t.total_descuentos,
    2
  )
)
FROM totales t;
$$;

REVOKE ALL ON FUNCTION public.f_private_compensacion_liquidacion_simular(
  bigint, bigint
) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. SIMULACION PUBLICA
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_liquidacion_simular(
  p_id_periodo bigint,
  p_id_colaborador bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_periodo public.tb_compensacion_periodo%ROWTYPE;
  v_contexto jsonb;
BEGIN
  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = p_id_periodo;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'El periodo no existe';
  END IF;

  v_contexto := public.f_private_compensacion_liquidacion_validar_alcance(
    p_id_colaborador, 'CONSULTAR', v_periodo.fecha_fin
  );

  RETURN public.f_private_compensacion_liquidacion_simular(
    p_id_periodo, p_id_colaborador
  );
END;
$$;

-- ============================================================================
-- 4. CALCULO PERSISTIDO Y VERSIONADO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_liquidacion_calcular(
  p_id_periodo bigint,
  p_id_colaborador bigint,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_periodo public.tb_compensacion_periodo%ROWTYPE;
  v_colaborador public.tb_compensacion_colaborador%ROWTYPE;
  v_contexto jsonb;
  v_id_actor bigint;
  v_simulacion jsonb;
  v_actual public.tb_compensacion_liquidacion%ROWTYPE;
  v_numero integer;
  v_id_liquidacion bigint;
  v_id_tramo bigint;
  v_tramo jsonb;
  v_linea jsonb;
  v_total_pagar numeric(14, 2);
BEGIN
  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = p_id_periodo
  FOR UPDATE;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'El periodo no existe';
  END IF;

  IF v_periodo.estado_periodo NOT IN ('ABIERTO', 'REABIERTO', 'OBSERVADO', 'EN_CALCULO') THEN
    RAISE EXCEPTION 'El periodo no admite calculos en su estado actual';
  END IF;

  v_contexto := public.f_private_compensacion_liquidacion_validar_alcance(
    p_id_colaborador, 'REGISTRAR', v_periodo.fecha_fin
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  SELECT * INTO v_colaborador
  FROM public.tb_compensacion_colaborador
  WHERE id = p_id_colaborador
  FOR UPDATE;

  SELECT * INTO v_actual
  FROM public.tb_compensacion_liquidacion
  WHERE id_periodo = p_id_periodo
    AND id_colaborador = p_id_colaborador
    AND estado_liquidacion NOT IN ('REEMPLAZADA', 'ANULADA')
  FOR UPDATE;

  IF v_actual.id IS NOT NULL
     AND v_actual.estado_liquidacion NOT IN ('BORRADOR', 'CALCULADA', 'OBSERVADA') THEN
    RAISE EXCEPTION 'La liquidacion vigente ya fue aprobada o tiene pagos';
  END IF;

  v_simulacion := public.f_private_compensacion_liquidacion_simular(
    p_id_periodo, p_id_colaborador
  );

  IF NOT COALESCE((v_simulacion ->> 'puede_calcular')::boolean, false) THEN
    RAISE EXCEPTION 'La preliquidacion tiene bloqueos: %', v_simulacion -> 'bloqueos';
  END IF;

  v_total_pagar := (v_simulacion ->> 'total_pagar')::numeric;
  IF v_total_pagar < 0 THEN
    RAISE EXCEPTION 'Los descuentos superan los ingresos de la preliquidacion';
  END IF;

  IF v_actual.id IS NOT NULL THEN
    UPDATE public.tb_compensacion_liquidacion
    SET estado_liquidacion = 'REEMPLAZADA',
        id_usuario_actualiza = v_id_actor,
        fecha_actualizacion = now()
    WHERE id = v_actual.id;
  END IF;

  SELECT COALESCE(MAX(numero_calculo), 0) + 1 INTO v_numero
  FROM public.tb_compensacion_liquidacion
  WHERE id_periodo = p_id_periodo
    AND id_colaborador = p_id_colaborador;

  INSERT INTO public.tb_compensacion_liquidacion (
    id_periodo, id_colaborador, numero_calculo, estado_liquidacion,
    colaborador_snapshot, total_sueldo, total_bonos, total_comisiones,
    total_descuentos, total_pagar, total_pagado, observacion,
    fecha_calculo, id_usuario_calcula, id_usuario_actualiza
  ) VALUES (
    p_id_periodo, p_id_colaborador, v_numero, 'CALCULADA',
    v_simulacion -> 'colaborador',
    (v_simulacion ->> 'total_sueldo')::numeric,
    (v_simulacion ->> 'total_bonos')::numeric,
    (v_simulacion ->> 'total_comisiones')::numeric,
    (v_simulacion ->> 'total_descuentos')::numeric,
    v_total_pagar, 0, NULLIF(TRIM(p_observacion), ''),
    now(), v_id_actor, v_id_actor
  ) RETURNING id INTO v_id_liquidacion;

  FOR v_tramo IN SELECT value FROM jsonb_array_elements(v_simulacion -> 'tramos')
  LOOP
    INSERT INTO public.tb_compensacion_liquidacion_tramo (
      id_liquidacion, id_asignacion, id_plan_version,
      fecha_inicio, fecha_fin, dias_calendario, dias_pagables,
      asignacion_snapshot, total_sueldo, total_bonos,
      total_comisiones, total_descuentos, total_pagar
    ) VALUES (
      v_id_liquidacion,
      (v_tramo ->> 'id_asignacion')::bigint,
      (v_tramo ->> 'id_plan_version')::bigint,
      (v_tramo ->> 'fecha_inicio')::date,
      (v_tramo ->> 'fecha_fin')::date,
      (v_tramo ->> 'dias_calendario')::integer,
      (v_tramo ->> 'dias_pagables')::numeric,
      v_tramo -> 'asignacion_snapshot', 0, 0, 0, 0, 0
    ) RETURNING id INTO v_id_tramo;
  END LOOP;

  FOR v_linea IN SELECT value FROM jsonb_array_elements(v_simulacion -> 'detalles')
  LOOP
    v_id_tramo := NULL;
    IF NULLIF(v_linea ->> 'id_asignacion', '') IS NOT NULL THEN
      SELECT id INTO v_id_tramo
      FROM public.tb_compensacion_liquidacion_tramo
      WHERE id_liquidacion = v_id_liquidacion
        AND id_asignacion = (v_linea ->> 'id_asignacion')::bigint
        AND id_plan_version = (v_linea ->> 'id_plan_version')::bigint
        AND fecha_inicio = (v_linea ->> 'fecha_inicio_tramo')::date
        AND fecha_fin = (v_linea ->> 'fecha_fin_tramo')::date;

      IF v_id_tramo IS NULL THEN
        RAISE EXCEPTION
          'No se encontro el tramo correspondiente a la linea %',
          v_linea ->> 'clave_origen';
      END IF;
    END IF;

    INSERT INTO public.tb_compensacion_liquidacion_detalle (
      id_liquidacion, id_tramo, id_concepto, id_regla,
      tipo_origen, clave_origen, id_evento, id_jornada,
      id_operacion, id_excepcion, concepto_codigo_snapshot,
      concepto_nombre_snapshot, categoria_snapshot, naturaleza_snapshot,
      regla_snapshot, formula_snapshot, base_calculo, cantidad,
      tarifa, importe, datos_origen_snapshot
    ) VALUES (
      v_id_liquidacion, v_id_tramo,
      (v_linea ->> 'id_concepto')::bigint,
      NULLIF(v_linea ->> 'id_regla', '')::bigint,
      v_linea ->> 'tipo_origen', v_linea ->> 'clave_origen',
      NULLIF(v_linea ->> 'id_evento', '')::bigint,
      NULLIF(v_linea ->> 'id_jornada', '')::bigint,
      NULLIF(v_linea ->> 'id_operacion', '')::bigint,
      NULLIF(v_linea ->> 'id_excepcion', '')::bigint,
      v_linea ->> 'concepto_codigo', v_linea ->> 'concepto_nombre',
      v_linea ->> 'categoria', v_linea ->> 'naturaleza',
      COALESCE(v_linea -> 'regla_snapshot', '{}'::jsonb),
      v_linea ->> 'formula_snapshot',
      COALESCE((v_linea ->> 'base_calculo')::numeric, 0),
      COALESCE((v_linea ->> 'cantidad')::numeric, 1),
      COALESCE((v_linea ->> 'tarifa')::numeric, 0),
      (v_linea ->> 'importe')::numeric,
      COALESCE(v_linea -> 'datos_origen', '{}'::jsonb)
    );
  END LOOP;

  UPDATE public.tb_compensacion_liquidacion_tramo t
  SET total_sueldo = x.total_sueldo,
      total_bonos = x.total_bonos,
      total_comisiones = x.total_comisiones,
      total_descuentos = x.total_descuentos,
      total_pagar = x.total_sueldo + x.total_bonos + x.total_comisiones - x.total_descuentos
  FROM (
    SELECT
      d.id_tramo,
      COALESCE(SUM(d.importe) FILTER (
        WHERE d.categoria_snapshot = 'SUELDO' AND d.naturaleza_snapshot = 'INGRESO'
      ), 0) AS total_sueldo,
      COALESCE(SUM(d.importe) FILTER (
        WHERE d.categoria_snapshot = 'BONO' AND d.naturaleza_snapshot = 'INGRESO'
      ), 0) AS total_bonos,
      COALESCE(SUM(d.importe) FILTER (
        WHERE d.categoria_snapshot = 'COMISION' AND d.naturaleza_snapshot = 'INGRESO'
      ), 0) AS total_comisiones,
      COALESCE(SUM(d.importe) FILTER (
        WHERE d.naturaleza_snapshot = 'DESCUENTO'
      ), 0) AS total_descuentos
    FROM public.tb_compensacion_liquidacion_detalle d
    WHERE d.id_liquidacion = v_id_liquidacion
      AND d.id_tramo IS NOT NULL
    GROUP BY d.id_tramo
  ) x
  WHERE t.id = x.id_tramo;

  RETURN jsonb_build_object(
    'id', v_id_liquidacion,
    'numero_calculo', v_numero,
    'estado_liquidacion', 'CALCULADA',
    'total_sueldo', v_simulacion -> 'total_sueldo',
    'total_bonos', v_simulacion -> 'total_bonos',
    'total_comisiones', v_simulacion -> 'total_comisiones',
    'total_descuentos', v_simulacion -> 'total_descuentos',
    'total_pagar', v_simulacion -> 'total_pagar',
    'mensaje', 'Preliquidacion calculada y versionada'
  );
END;
$$;

-- ============================================================================
-- 5. CALCULO POR LOTE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_liquidacion_calcular_lote(
  p_id_periodo bigint,
  p_ids_colaborador bigint[] DEFAULT NULL,
  p_detener_si_error boolean DEFAULT true,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_periodo public.tb_compensacion_periodo%ROWTYPE;
  v_contexto jsonb;
  v_alcance character varying;
  v_id_sucursal_alcance bigint;
  v_id_colaborador bigint;
  v_resultado jsonb;
  v_resultados jsonb := '[]'::jsonb;
  v_errores jsonb := '[]'::jsonb;
  v_procesados integer := 0;
BEGIN
  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = p_id_periodo;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'El periodo no existe';
  END IF;

  v_contexto := public.f_private_compensacion_contexto(
    'LIQUIDACIONES', 'REGISTRAR'
  );
  v_alcance := v_contexto ->> 'alcance';
  v_id_sucursal_alcance := NULLIF(
    v_contexto ->> 'id_sucursal_alcance',
    ''
  )::bigint;

  IF v_alcance = 'PROPIO' THEN
    RAISE EXCEPTION 'El calculo por lote requiere alcance de sede o global';
  END IF;

  IF p_ids_colaborador IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(p_ids_colaborador) ids(id)
    GROUP BY ids.id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'La lista de colaboradores contiene IDs repetidos';
  END IF;

  FOR v_id_colaborador IN
    SELECT DISTINCT a.id_colaborador
    FROM public.tb_compensacion_asignacion a
    WHERE a.fecha_inicio <= v_periodo.fecha_fin
      AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_periodo.fecha_inicio)
      AND (
        p_ids_colaborador IS NULL
        OR a.id_colaborador = ANY(p_ids_colaborador)
      )
      AND (
        v_alcance = 'GLOBAL'
        OR a.id_sucursal = v_id_sucursal_alcance
      )
    ORDER BY a.id_colaborador
  LOOP
    BEGIN
      v_resultado := public.f_post_tb_compensacion_liquidacion_calcular(
        p_id_periodo,
        v_id_colaborador,
        p_observacion
      );
      v_resultados := v_resultados || jsonb_build_array(v_resultado);
      v_procesados := v_procesados + 1;
    EXCEPTION
      WHEN OTHERS THEN
        IF COALESCE(p_detener_si_error, true) THEN
          RAISE;
        END IF;

        v_errores := v_errores || jsonb_build_array(jsonb_build_object(
          'id_colaborador', v_id_colaborador,
          'error', SQLERRM,
          'sqlstate', SQLSTATE
        ));
    END;
  END LOOP;

  IF p_ids_colaborador IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(p_ids_colaborador) solicitado(id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.tb_compensacion_asignacion a
      WHERE a.id_colaborador = solicitado.id
        AND a.fecha_inicio <= v_periodo.fecha_fin
        AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_periodo.fecha_inicio)
        AND (
          v_alcance = 'GLOBAL'
          OR a.id_sucursal = v_id_sucursal_alcance
        )
    )
  ) THEN
    RAISE EXCEPTION 'La lista contiene colaboradores sin asignacion o fuera del alcance autorizado';
  END IF;

  RETURN jsonb_build_object(
    'id_periodo', p_id_periodo,
    'procesados', v_procesados,
    'errores', jsonb_array_length(v_errores),
    'resultados', v_resultados,
    'detalle_errores', v_errores,
    'modo_atomico', COALESCE(p_detener_si_error, true)
  );
END;
$$;

-- ============================================================================
-- 6. CONSULTA DE PRELIQUIDACIONES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_liquidacion(
  p_id bigint DEFAULT NULL,
  p_id_periodo bigint DEFAULT NULL,
  p_id_colaborador bigint DEFAULT NULL,
  p_estado_liquidacion character varying DEFAULT NULL,
  p_busqueda character varying DEFAULT NULL,
  p_pagina integer DEFAULT 1,
  p_tamano_pagina integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_alcance character varying;
  v_id_colaborador_actor bigint;
  v_id_sucursal_alcance bigint;
  v_pagina integer := GREATEST(COALESCE(p_pagina, 1), 1);
  v_tamano integer := LEAST(GREATEST(COALESCE(p_tamano_pagina, 50), 1), 200);
  v_total bigint;
  v_items jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('LIQUIDACIONES', 'CONSULTAR');
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  WITH base AS (
    SELECT
      l.*,
      pe.periodo,
      pe.nombre AS periodo_nombre,
      c.nombre_completo AS colaborador_nombre,
      c.numero_documento AS colaborador_documento,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(t) ORDER BY t.fecha_inicio, t.id)
        FROM public.tb_compensacion_liquidacion_tramo t
        WHERE t.id_liquidacion = l.id
      ), '[]'::jsonb) AS tramos,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(d) ORDER BY d.categoria_snapshot, d.id)
        FROM public.tb_compensacion_liquidacion_detalle d
        WHERE d.id_liquidacion = l.id
      ), '[]'::jsonb) AS detalles
    FROM public.tb_compensacion_liquidacion l
    JOIN public.tb_compensacion_periodo pe ON pe.id = l.id_periodo
    JOIN public.tb_compensacion_colaborador c ON c.id = l.id_colaborador
    WHERE (p_id IS NULL OR l.id = p_id)
      AND (p_id_periodo IS NULL OR l.id_periodo = p_id_periodo)
      AND (p_id_colaborador IS NULL OR l.id_colaborador = p_id_colaborador)
      AND (
        p_estado_liquidacion IS NULL
        OR l.estado_liquidacion = UPPER(TRIM(p_estado_liquidacion))
      )
      AND (
        p_busqueda IS NULL
        OR c.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR c.numero_documento ILIKE '%' || TRIM(p_busqueda) || '%'
      )
      AND (
        v_alcance = 'GLOBAL'
        OR (v_alcance = 'PROPIO' AND l.id_colaborador = v_id_colaborador_actor)
        OR (v_alcance = 'SEDE' AND EXISTS (
          SELECT 1
          FROM public.tb_compensacion_liquidacion_tramo lt
          WHERE lt.id_liquidacion = l.id
            AND (lt.asignacion_snapshot ->> 'id_sucursal')::bigint = v_id_sucursal_alcance
        ))
      )
  ), conteo AS (
    SELECT COUNT(*) AS total FROM base
  ), pagina AS (
    SELECT * FROM base
    ORDER BY periodo DESC, numero_calculo DESC, id DESC
    LIMIT v_tamano OFFSET (v_pagina - 1) * v_tamano
  )
  SELECT conteo.total,
         COALESCE(
           jsonb_agg(to_jsonb(pagina) ORDER BY pagina.periodo DESC, pagina.id DESC)
             FILTER (WHERE pagina.id IS NOT NULL),
           '[]'::jsonb
         )
  INTO v_total, v_items
  FROM conteo
  LEFT JOIN pagina ON true
  GROUP BY conteo.total;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'pagina', v_pagina,
    'tamano_pagina', v_tamano,
    'total_paginas', CASE
      WHEN COALESCE(v_total, 0) = 0 THEN 0
      ELSE CEIL(v_total::numeric / v_tamano)::integer
    END
  );
END;
$$;

-- ============================================================================
-- PERMISOS DE EJECUCION
-- ============================================================================

DO $permissions$
DECLARE
  v_function regprocedure;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'f_get_tb_compensacion_liquidacion_simular',
        'f_post_tb_compensacion_liquidacion_calcular',
        'f_post_tb_compensacion_liquidacion_calcular_lote',
        'f_get_tb_compensacion_liquidacion'
      ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_function);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_function);
  END LOOP;
END;
$permissions$;

-- ============================================================================
-- DROP DE FIRMAS AFECTADAS PARA DESPLIEGUE CONTROLADO
-- ============================================================================

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_private_compensacion_liquidacion_simular',
  'f_get_tb_compensacion_liquidacion_simular',
  'f_post_tb_compensacion_liquidacion_calcular',
  'f_post_tb_compensacion_liquidacion_calcular_lote',
  'f_get_tb_compensacion_liquidacion'
)
ORDER BY n.nspname, p.proname;
