-- ============================================================================
-- COMPENSACIONES - REPORTES, CONCILIACION Y EXPORTACIONES
-- ============================================================================
-- Objetivo:
--   Proveer una fuente unica para pantalla, PDF, XLSX y CSV. Los periodos
--   cerrados leen snapshots; los periodos abiertos leen la version vigente.
--   Las metricas operativas usan nombres explicitos y no generan dinero.
--
-- Dependencias:
--   17.compensaciones_personal_configuracion.sql
--   18.compensaciones_asistencia_evidencias.sql
--   19.compensaciones_liquidaciones_cierres_reportes.sql
--   20.compensaciones_seguridad_personal_funciones.sql
--   24.compensaciones_periodos_funciones.sql
--   32.compensaciones_cierres_ajustes_funciones.sql
-- ============================================================================

-- ============================================================================
-- 1. CONTEXTO Y ALCANCE DE REPORTES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_compensacion_reporte_contexto(
  p_id_periodo bigint,
  p_accion character varying,
  p_id_sucursal bigint DEFAULT NULL,
  p_id_colaborador bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_periodo public.tb_compensacion_periodo%ROWTYPE;
  v_alcance character varying;
  v_id_sucursal_alcance bigint;
  v_id_colaborador_actor bigint;
  v_id_sucursal_efectiva bigint := p_id_sucursal;
  v_id_colaborador_efectivo bigint := p_id_colaborador;
  v_id_cierre bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'REPORTES', UPPER(TRIM(COALESCE(p_accion, 'CONSULTAR')))
  );
  v_alcance := v_contexto ->> 'alcance';
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;

  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = p_id_periodo;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'El periodo no existe';
  END IF;

  IF v_alcance = 'SEDE' THEN
    IF p_id_sucursal IS NOT NULL
       AND p_id_sucursal IS DISTINCT FROM v_id_sucursal_alcance THEN
      RAISE EXCEPTION 'No puede consultar reportes de otra sede';
    END IF;
    v_id_sucursal_efectiva := v_id_sucursal_alcance;
  ELSIF v_alcance = 'PROPIO' THEN
    IF v_id_colaborador_actor IS NULL THEN
      RAISE EXCEPTION 'El usuario no tiene colaborador vinculado';
    END IF;
    IF p_id_colaborador IS NOT NULL
       AND p_id_colaborador IS DISTINCT FROM v_id_colaborador_actor THEN
      RAISE EXCEPTION 'Solo puede consultar sus propios reportes';
    END IF;
    v_id_colaborador_efectivo := v_id_colaborador_actor;
  END IF;

  IF v_id_sucursal_efectiva IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.tb_sucursal WHERE id = v_id_sucursal_efectiva
     ) THEN
    RAISE EXCEPTION 'La sede seleccionada no existe';
  END IF;

  IF v_id_colaborador_efectivo IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.tb_compensacion_colaborador
       WHERE id = v_id_colaborador_efectivo
     ) THEN
    RAISE EXCEPTION 'El colaborador seleccionado no existe';
  END IF;

  SELECT c.id INTO v_id_cierre
  FROM public.tb_compensacion_cierre c
  WHERE c.id_periodo = p_id_periodo
    AND c.estado_cierre = 'VIGENTE';

  RETURN v_contexto || jsonb_build_object(
    'id_periodo', v_periodo.id,
    'periodo', v_periodo.periodo,
    'fecha_inicio', v_periodo.fecha_inicio,
    'fecha_fin', v_periodo.fecha_fin,
    'zona_horaria', v_periodo.zona_horaria,
    'estado_periodo', v_periodo.estado_periodo,
    'id_sucursal_efectiva', v_id_sucursal_efectiva,
    'id_colaborador_efectivo', v_id_colaborador_efectivo,
    'id_cierre_vigente', v_id_cierre,
    'fuente_reporte', CASE WHEN v_id_cierre IS NULL THEN 'VIGENTE' ELSE 'CIERRE' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.f_private_compensacion_reporte_contexto(
  bigint, character varying, bigint, bigint
) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. REPORTE DE ASISTENCIA
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_reporte_asistencia(
  p_id_periodo bigint,
  p_id_sucursal bigint DEFAULT NULL,
  p_id_colaborador bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_id_sucursal bigint;
  v_id_colaborador bigint;
  v_id_cierre bigint;
  v_fecha_inicio date;
  v_fecha_fin date;
  v_items jsonb;
  v_resumen jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_reporte_contexto(
    p_id_periodo, 'CONSULTAR', p_id_sucursal, p_id_colaborador
  );
  v_id_sucursal := NULLIF(v_contexto ->> 'id_sucursal_efectiva', '')::bigint;
  v_id_colaborador := NULLIF(v_contexto ->> 'id_colaborador_efectivo', '')::bigint;
  v_id_cierre := NULLIF(v_contexto ->> 'id_cierre_vigente', '')::bigint;
  v_fecha_inicio := (v_contexto ->> 'fecha_inicio')::date;
  v_fecha_fin := (v_contexto ->> 'fecha_fin')::date;

  WITH base AS (
    SELECT *
    FROM public.f_private_compensacion_reporte_liquidaciones(p_id_periodo)
    WHERE (v_id_sucursal IS NULL OR id_sucursal = v_id_sucursal)
      AND (v_id_colaborador IS NULL OR id_colaborador = v_id_colaborador)
  ), metricas AS (
    SELECT
      b.id_colaborador,
      b.colaborador_nombre,
      b.colaborador_documento,
      b.id_sucursal,
      b.sucursal_nombre,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'dias_pagables')::integer, 0)
        ELSE COALESCE(j.dias_pagables, 0)
      END AS dias_pagables,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'dias_completos')::integer, 0)
        ELSE COALESCE(j.dias_completos, 0)
      END AS dias_completos,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'dias_con_tardanza')::integer, 0)
        ELSE COALESCE(j.dias_con_tardanza, 0)
      END AS dias_con_tardanza,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'minutos_tardanza')::integer, 0)
        ELSE COALESCE(j.minutos_tardanza, 0)
      END AS minutos_tardanza,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'dias_con_horas_extra')::integer, 0)
        ELSE COALESCE(j.dias_con_horas_extra, 0)
      END AS dias_con_horas_extra,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'minutos_extra')::integer, 0)
        ELSE COALESCE(j.minutos_extra, 0)
      END AS minutos_extra,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'dias_incompletos')::integer, 0)
        ELSE COALESCE(j.dias_incompletos, 0)
      END AS dias_incompletos
    FROM base b
    LEFT JOIN LATERAL (
      SELECT a.value AS item
      FROM public.tb_compensacion_cierre c
      CROSS JOIN LATERAL jsonb_array_elements(c.snapshot_resumen -> 'asistencia') a(value)
      WHERE c.id = v_id_cierre
        AND (a.value ->> 'id_colaborador')::bigint = b.id_colaborador
      LIMIT 1
    ) s ON v_id_cierre IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT
        COUNT(aj.id) FILTER (
          WHERE aj.estado_dia NOT IN (
            'DESCANSO', 'VACACIONES', 'LICENCIA', 'PENDIENTE'
          )
        )::integer AS dias_pagables,
        COUNT(aj.id) FILTER (WHERE aj.estado_dia = 'COMPLETO')::integer
          AS dias_completos,
        COUNT(aj.id) FILTER (WHERE aj.minutos_tardanza > 0)::integer
          AS dias_con_tardanza,
        COALESCE(SUM(aj.minutos_tardanza), 0)::integer AS minutos_tardanza,
        COUNT(aj.id) FILTER (WHERE aj.minutos_extra > 0)::integer
          AS dias_con_horas_extra,
        COALESCE(SUM(aj.minutos_extra), 0)::integer AS minutos_extra,
        COUNT(aj.id) FILTER (
          WHERE aj.estado_dia IN ('FALTA_ENTRADA', 'FALTA_SALIDA', 'AUSENTE')
        )::integer AS dias_incompletos
      FROM public.tb_asistencia_jornada aj
      WHERE aj.id_colaborador = b.id_colaborador
        AND aj.fecha BETWEEN v_fecha_inicio AND v_fecha_fin
    ) j ON v_id_cierre IS NULL
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(metricas) ORDER BY colaborador_nombre), '[]'::jsonb),
    jsonb_build_object(
      'total_colaboradores', COUNT(*),
      'dias_pagables', COALESCE(SUM(dias_pagables), 0),
      'dias_completos', COALESCE(SUM(dias_completos), 0),
      'dias_con_tardanza', COALESCE(SUM(dias_con_tardanza), 0),
      'minutos_tardanza', COALESCE(SUM(minutos_tardanza), 0),
      'dias_con_horas_extra', COALESCE(SUM(dias_con_horas_extra), 0),
      'minutos_extra', COALESCE(SUM(minutos_extra), 0),
      'dias_incompletos', COALESCE(SUM(dias_incompletos), 0)
    )
  INTO v_items, v_resumen
  FROM metricas;

  RETURN jsonb_build_object(
    'periodo', v_contexto -> 'periodo',
    'fuente', v_contexto -> 'fuente_reporte',
    'definiciones', jsonb_build_object(
      'dias_pagables', 'Jornadas distintas de descanso, vacaciones, licencia o pendiente',
      'dias_incompletos', 'Jornadas con falta de entrada, falta de salida o ausencia'
    ),
    'resumen', v_resumen,
    'items', v_items
  );
END;
$$;

-- ============================================================================
-- 3. REPORTE DE PRODUCTIVIDAD
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_reporte_productividad(
  p_id_periodo bigint,
  p_id_sucursal bigint DEFAULT NULL,
  p_id_colaborador bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_id_sucursal bigint;
  v_id_colaborador bigint;
  v_id_cierre bigint;
  v_periodo date;
  v_fecha_inicio date;
  v_fecha_fin date;
  v_zona_horaria text;
  v_items jsonb;
  v_resumen jsonb;
  v_resumen_sedes jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_reporte_contexto(
    p_id_periodo, 'CONSULTAR', p_id_sucursal, p_id_colaborador
  );
  v_id_sucursal := NULLIF(v_contexto ->> 'id_sucursal_efectiva', '')::bigint;
  v_id_colaborador := NULLIF(v_contexto ->> 'id_colaborador_efectivo', '')::bigint;
  v_id_cierre := NULLIF(v_contexto ->> 'id_cierre_vigente', '')::bigint;
  v_periodo := (v_contexto ->> 'periodo')::date;
  v_fecha_inicio := (v_contexto ->> 'fecha_inicio')::date;
  v_fecha_fin := (v_contexto ->> 'fecha_fin')::date;
  v_zona_horaria := v_contexto ->> 'zona_horaria';

  WITH base AS (
    SELECT
      b.*,
      co.id_usuario
    FROM public.f_private_compensacion_reporte_liquidaciones(p_id_periodo) b
    JOIN public.tb_compensacion_colaborador co ON co.id = b.id_colaborador
    WHERE (v_id_sucursal IS NULL OR b.id_sucursal = v_id_sucursal)
      AND (v_id_colaborador IS NULL OR b.id_colaborador = v_id_colaborador)
  ), metricas AS (
    SELECT
      b.id_colaborador,
      b.colaborador_nombre,
      b.colaborador_documento,
      b.id_sucursal,
      b.sucursal_nombre,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'clientes_registrados')::integer, 0)
        ELSE COALESCE(cli.clientes_registrados, 0)
      END AS clientes_registrados,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'clientes_convertidos_7_dias')::integer, 0)
        ELSE COALESCE(cli.clientes_convertidos_7_dias, 0)
      END AS clientes_convertidos_7_dias,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'clientes_solo_registro')::integer, 0)
        ELSE COALESCE(cli.clientes_registrados, 0)
             - COALESCE(cli.clientes_convertidos_7_dias, 0)
      END AS clientes_solo_registro,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'porcentaje_conversion_7_dias')::numeric, 0)
        WHEN COALESCE(cli.clientes_registrados, 0) = 0 THEN 0
        ELSE ROUND(
          cli.clientes_convertidos_7_dias::numeric
          / cli.clientes_registrados * 100,
          2
        )
      END AS porcentaje_conversion_7_dias,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'operaciones_pagadas_atribuidas')::integer, 0)
        ELSE COALESCE(op.operaciones_pagadas_atribuidas, 0)
      END AS operaciones_pagadas_atribuidas,
      CASE WHEN v_id_cierre IS NOT NULL
        THEN COALESCE((s.item ->> 'calificaciones_aprobadas')::integer, 0)
        ELSE COALESCE(cal.calificaciones_aprobadas, 0)
      END AS calificaciones_aprobadas
    FROM base b
    LEFT JOIN LATERAL (
      SELECT p.value AS item
      FROM public.tb_compensacion_cierre c
      CROSS JOIN LATERAL jsonb_array_elements(
        c.snapshot_resumen -> 'productividad' -> 'items'
      ) p(value)
      WHERE c.id = v_id_cierre
        AND (p.value ->> 'id_colaborador')::bigint = b.id_colaborador
      LIMIT 1
    ) s ON v_id_cierre IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::integer AS clientes_registrados,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1
          FROM public.tb_operacion_proceso opp
          WHERE opp.id_cliente = cliente.id
            AND UPPER(BTRIM(COALESCE(opp.nombre_estado, ''))) = 'PAGADO'
            AND NOT EXISTS (
              SELECT 1 FROM public.tb_operacion_proceso_eliminada oe
              WHERE oe.id_operacion_proceso = opp.id
            )
            AND COALESCE(
              opp.fecha_pagado, opp.fecha_deposito_cliente, opp.fecha_registro
            ) >= cliente.fecha_registro
            AND COALESCE(
              opp.fecha_pagado, opp.fecha_deposito_cliente, opp.fecha_registro
            ) <= cliente.fecha_registro + INTERVAL '7 days'
        ))::integer AS clientes_convertidos_7_dias
      FROM public.tb_cliente cliente
      WHERE cliente.id_usuario = b.id_usuario
        AND (cliente.fecha_registro AT TIME ZONE v_zona_horaria)::date
          BETWEEN v_fecha_inicio AND v_fecha_fin
    ) cli ON v_id_cierre IS NULL
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::integer AS operaciones_pagadas_atribuidas
      FROM public.tb_operacion_proceso opp
      WHERE COALESCE(opp.id_usuario_gestor, opp.id_usuario) = b.id_usuario
        AND UPPER(BTRIM(COALESCE(opp.nombre_estado, ''))) = 'PAGADO'
        AND NOT EXISTS (
          SELECT 1 FROM public.tb_operacion_proceso_eliminada oe
          WHERE oe.id_operacion_proceso = opp.id
        )
        AND (
          COALESCE(opp.fecha_pagado, opp.fecha_deposito_cliente, opp.fecha_registro)
          AT TIME ZONE v_zona_horaria
        )::date BETWEEN v_fecha_inicio AND v_fecha_fin
    ) op ON v_id_cierre IS NULL
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::integer AS calificaciones_aprobadas
      FROM public.tb_compensacion_evento ev
      JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
      WHERE ev.id_colaborador_beneficiario = b.id_colaborador
        AND ev.periodo_imputacion = v_periodo
        AND ev.estado_evento IN ('APROBADO', 'LIQUIDADO')
        AND te.categoria = 'CALIFICACION'
    ) cal ON v_id_cierre IS NULL
  ), sedes AS (
    SELECT
      id_sucursal,
      COALESCE(sucursal_nombre, 'Sin sede') AS sucursal_nombre,
      COUNT(*) AS total_colaboradores,
      SUM(clientes_registrados) AS clientes_registrados,
      SUM(clientes_convertidos_7_dias) AS clientes_convertidos_7_dias,
      SUM(clientes_solo_registro) AS clientes_solo_registro,
      SUM(operaciones_pagadas_atribuidas) AS operaciones_pagadas_atribuidas,
      SUM(calificaciones_aprobadas) AS calificaciones_aprobadas
    FROM metricas
    GROUP BY id_sucursal, sucursal_nombre
  )
  SELECT
    COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY colaborador_nombre) FROM metricas m), '[]'::jsonb),
    (SELECT jsonb_build_object(
      'total_colaboradores', COUNT(*),
      'clientes_registrados', COALESCE(SUM(clientes_registrados), 0),
      'clientes_convertidos_7_dias', COALESCE(SUM(clientes_convertidos_7_dias), 0),
      'clientes_solo_registro', COALESCE(SUM(clientes_solo_registro), 0),
      'porcentaje_conversion_7_dias', CASE
        WHEN COALESCE(SUM(clientes_registrados), 0) = 0 THEN 0
        ELSE ROUND(
          SUM(clientes_convertidos_7_dias)::numeric
          / SUM(clientes_registrados) * 100,
          2
        )
      END,
      'operaciones_pagadas_atribuidas', COALESCE(SUM(operaciones_pagadas_atribuidas), 0),
      'calificaciones_aprobadas', COALESCE(SUM(calificaciones_aprobadas), 0)
    ) FROM metricas),
    COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY sucursal_nombre) FROM sedes s), '[]'::jsonb)
  INTO v_items, v_resumen, v_resumen_sedes;

  RETURN jsonb_build_object(
    'periodo', v_contexto -> 'periodo',
    'fuente', v_contexto -> 'fuente_reporte',
    'definiciones', jsonb_build_object(
      'clientes_registrados', 'Clientes creados por el usuario durante el periodo',
      'clientes_convertidos_7_dias', 'Clientes con al menos una operacion pagada dentro de siete dias desde su registro',
      'operaciones_pagadas_atribuidas', 'Operaciones pagadas en el periodo atribuidas al gestor',
      'calificaciones_aprobadas', 'Calificaciones aprobadas o liquidadas imputadas al periodo'
    ),
    'resumen', v_resumen,
    'resumen_sedes', v_resumen_sedes,
    'items', v_items
  );
END;
$$;

-- ============================================================================
-- 4. REPORTE DE PAGOS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_reporte_pagos(
  p_id_periodo bigint,
  p_id_sucursal bigint DEFAULT NULL,
  p_id_colaborador bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_id_sucursal bigint;
  v_id_colaborador bigint;
  v_id_cierre bigint;
  v_items jsonb;
  v_resumen jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_reporte_contexto(
    p_id_periodo, 'CONSULTAR', p_id_sucursal, p_id_colaborador
  );
  v_id_sucursal := NULLIF(v_contexto ->> 'id_sucursal_efectiva', '')::bigint;
  v_id_colaborador := NULLIF(v_contexto ->> 'id_colaborador_efectivo', '')::bigint;
  v_id_cierre := NULLIF(v_contexto ->> 'id_cierre_vigente', '')::bigint;

  WITH liquidaciones AS (
    SELECT *
    FROM public.f_private_compensacion_reporte_liquidaciones(p_id_periodo)
    WHERE (v_id_sucursal IS NULL OR id_sucursal = v_id_sucursal)
      AND (v_id_colaborador IS NULL OR id_colaborador = v_id_colaborador)
  ), movimientos AS (
    SELECT
      l.id_liquidacion,
      l.id_colaborador,
      l.colaborador_nombre,
      l.id_sucursal,
      l.sucursal_nombre,
      (p.value ->> 'id')::bigint AS id_pago,
      p.value ->> 'tipo_movimiento' AS tipo_movimiento,
      p.value ->> 'componente' AS componente,
      (p.value ->> 'monto')::numeric AS monto,
      CASE WHEN p.value ->> 'tipo_movimiento' = 'REVERSA'
        THEN -(p.value ->> 'monto')::numeric
        ELSE (p.value ->> 'monto')::numeric
      END AS monto_neto,
      p.value ->> 'moneda' AS moneda,
      (p.value ->> 'fecha_pago')::timestamp with time zone AS fecha_pago,
      p.value ->> 'medio_pago' AS medio_pago,
      p.value ->> 'referencia' AS referencia,
      NULLIF(p.value ->> 'id_cuenta_pago', '')::bigint AS id_cuenta_pago,
      NULLIF(p.value ->> 'id_pago_origen', '')::bigint AS id_pago_origen,
      p.value ->> 'observacion' AS observacion,
      'CIERRE'::text AS fuente
    FROM liquidaciones l
    JOIN public.tb_compensacion_cierre_liquidacion cl
      ON cl.id_cierre = v_id_cierre
     AND cl.id_liquidacion = l.id_liquidacion
    CROSS JOIN LATERAL jsonb_array_elements(cl.detalle_snapshot -> 'pagos') p(value)
    WHERE v_id_cierre IS NOT NULL

    UNION ALL

    SELECT
      l.id_liquidacion,
      l.id_colaborador,
      l.colaborador_nombre,
      l.id_sucursal,
      l.sucursal_nombre,
      p.id,
      p.tipo_movimiento::text,
      p.componente::text,
      p.monto,
      CASE WHEN p.tipo_movimiento = 'REVERSA' THEN -p.monto ELSE p.monto END,
      p.moneda::text,
      p.fecha_pago,
      p.medio_pago::text,
      p.referencia::text,
      p.id_cuenta_pago,
      p.id_pago_origen,
      p.observacion,
      'VIGENTE'::text
    FROM liquidaciones l
    JOIN public.tb_compensacion_pago p ON p.id_liquidacion = l.id_liquidacion
    WHERE v_id_cierre IS NULL
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(movimientos) ORDER BY fecha_pago, id_pago), '[]'::jsonb),
    jsonb_build_object(
      'total_movimientos', COUNT(*),
      'total_pagos', COALESCE(SUM(monto) FILTER (WHERE tipo_movimiento = 'PAGO'), 0),
      'total_reversas', COALESCE(SUM(monto) FILTER (WHERE tipo_movimiento = 'REVERSA'), 0),
      'total_neto', COALESCE(SUM(monto_neto), 0)
    )
  INTO v_items, v_resumen
  FROM movimientos;

  RETURN jsonb_build_object(
    'periodo', v_contexto -> 'periodo',
    'fuente', v_contexto -> 'fuente_reporte',
    'nota_cierre', CASE WHEN v_id_cierre IS NULL THEN NULL
      ELSE 'Los movimientos corresponden al snapshot del cierre y no cambian por pagos posteriores'
    END,
    'resumen', v_resumen,
    'items', v_items
  );
END;
$$;

-- ============================================================================
-- 5. REGISTRO AUDITABLE DE UNA EXPORTACION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_exportacion(
  p_id_periodo bigint,
  p_tipo_reporte character varying,
  p_formato character varying,
  p_nombre_archivo character varying,
  p_filtros jsonb DEFAULT '{}'::jsonb,
  p_hash_archivo character varying DEFAULT NULL,
  p_total_registros integer DEFAULT 0,
  p_total_reportado numeric DEFAULT NULL,
  p_estado_exportacion character varying DEFAULT 'GENERADA',
  p_mensaje_error text DEFAULT NULL,
  p_clave_idempotencia character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_id_usuario bigint;
  v_id_cierre bigint;
  v_tipo character varying := UPPER(TRIM(COALESCE(p_tipo_reporte, '')));
  v_formato character varying := UPPER(TRIM(COALESCE(p_formato, '')));
  v_estado character varying := UPPER(TRIM(COALESCE(p_estado_exportacion, 'GENERADA')));
  v_filtros jsonb := COALESCE(p_filtros, '{}'::jsonb);
  v_existente public.tb_compensacion_exportacion%ROWTYPE;
  v_nuevo public.tb_compensacion_exportacion%ROWTYPE;
BEGIN
  IF jsonb_typeof(v_filtros) <> 'object' THEN
    RAISE EXCEPTION 'Los filtros de exportacion deben ser un objeto JSON';
  END IF;

  v_contexto := public.f_private_compensacion_reporte_contexto(
    p_id_periodo,
    'REGISTRAR',
    NULLIF(v_filtros ->> 'id_sucursal', '')::bigint,
    NULLIF(v_filtros ->> 'id_colaborador', '')::bigint
  );
  v_id_usuario := (v_contexto ->> 'id_usuario')::bigint;
  v_id_cierre := NULLIF(v_contexto ->> 'id_cierre_vigente', '')::bigint;

  IF v_tipo NOT IN (
    'GENERAL_FINANCIERO', 'DETALLE_COLABORADOR', 'RESUMEN_SEDE',
    'PRODUCTIVIDAD', 'PAGOS', 'ASISTENCIA', 'OTRO'
  ) THEN
    RAISE EXCEPTION 'El tipo de reporte no es valido';
  END IF;
  IF v_formato NOT IN ('PDF', 'XLSX', 'CSV') THEN
    RAISE EXCEPTION 'El formato de exportacion no es valido';
  END IF;
  IF v_estado NOT IN ('GENERADA', 'ERROR') THEN
    RAISE EXCEPTION 'El estado inicial debe ser GENERADA o ERROR';
  END IF;
  IF BTRIM(COALESCE(p_nombre_archivo, '')) = '' THEN
    RAISE EXCEPTION 'El nombre del archivo es obligatorio';
  END IF;
  IF COALESCE(p_total_registros, -1) < 0
     OR (p_total_reportado IS NOT NULL AND p_total_reportado < 0) THEN
    RAISE EXCEPTION 'Los totales de la exportacion no pueden ser negativos';
  END IF;
  IF v_estado = 'GENERADA' AND BTRIM(COALESCE(p_hash_archivo, '')) = '' THEN
    RAISE EXCEPTION 'Una exportacion generada requiere hash del archivo';
  END IF;
  IF v_estado = 'ERROR' AND BTRIM(COALESCE(p_mensaje_error, '')) = '' THEN
    RAISE EXCEPTION 'Una exportacion con error requiere el mensaje correspondiente';
  END IF;

  IF BTRIM(COALESCE(p_clave_idempotencia, '')) <> '' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      FORMAT(
        'compensacion-exportacion:%s:%s:%s:%s:%s',
        v_id_usuario, p_id_periodo, v_tipo, v_formato,
        BTRIM(p_clave_idempotencia)
      ),
      0
    ));

    SELECT * INTO v_existente
    FROM public.tb_compensacion_exportacion e
    WHERE e.id_usuario = v_id_usuario
      AND e.id_periodo = p_id_periodo
      AND e.tipo_reporte = v_tipo
      AND e.formato = v_formato
      AND e.clave_idempotencia = BTRIM(p_clave_idempotencia)
    ORDER BY e.id DESC
    LIMIT 1;

    IF v_existente.id IS NOT NULL THEN
      RETURN to_jsonb(v_existente) || jsonb_build_object('creado', false);
    END IF;
  END IF;

  v_filtros := v_filtros || jsonb_build_object(
    'id_sucursal', NULLIF(v_contexto ->> 'id_sucursal_efectiva', '')::bigint,
    'id_colaborador', NULLIF(v_contexto ->> 'id_colaborador_efectivo', '')::bigint,
    'alcance', v_contexto ->> 'alcance',
    'fuente', v_contexto ->> 'fuente_reporte'
  );
  IF BTRIM(COALESCE(p_clave_idempotencia, '')) <> '' THEN
    v_filtros := v_filtros || jsonb_build_object(
      'clave_idempotencia', BTRIM(p_clave_idempotencia)
    );
  END IF;

  INSERT INTO public.tb_compensacion_exportacion (
    id_periodo, id_cierre, tipo_reporte, formato, filtros, nombre_archivo,
    hash_archivo, total_registros, total_reportado, estado_exportacion,
    mensaje_error, clave_idempotencia, id_usuario
  ) VALUES (
    p_id_periodo, v_id_cierre, v_tipo, v_formato, v_filtros,
    BTRIM(p_nombre_archivo), NULLIF(BTRIM(p_hash_archivo), ''),
    p_total_registros, p_total_reportado, v_estado,
    NULLIF(BTRIM(p_mensaje_error), ''),
    NULLIF(BTRIM(p_clave_idempotencia), ''), v_id_usuario
  )
  RETURNING * INTO v_nuevo;

  RETURN to_jsonb(v_nuevo) || jsonb_build_object('creado', true);
END;
$$;

-- ============================================================================
-- 6. CONSULTA DE EXPORTACIONES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_exportacion(
  p_id_periodo bigint,
  p_tipo_reporte character varying DEFAULT NULL,
  p_formato character varying DEFAULT NULL,
  p_estado_exportacion character varying DEFAULT NULL,
  p_pagina integer DEFAULT 1,
  p_limite integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_id_usuario bigint;
  v_alcance text;
  v_id_sucursal bigint;
  v_total bigint;
  v_items jsonb;
  v_pagina integer := GREATEST(COALESCE(p_pagina, 1), 1);
  v_limite integer := LEAST(GREATEST(COALESCE(p_limite, 50), 1), 200);
BEGIN
  v_contexto := public.f_private_compensacion_reporte_contexto(
    p_id_periodo, 'CONSULTAR', NULL, NULL
  );
  v_id_usuario := (v_contexto ->> 'id_usuario')::bigint;
  v_alcance := v_contexto ->> 'alcance';
  v_id_sucursal := NULLIF(v_contexto ->> 'id_sucursal_efectiva', '')::bigint;

  WITH base AS (
    SELECT e.*
    FROM public.tb_compensacion_exportacion e
    WHERE e.id_periodo = p_id_periodo
      AND (p_tipo_reporte IS NULL OR e.tipo_reporte = UPPER(TRIM(p_tipo_reporte)))
      AND (p_formato IS NULL OR e.formato = UPPER(TRIM(p_formato)))
      AND (
        p_estado_exportacion IS NULL
        OR e.estado_exportacion = UPPER(TRIM(p_estado_exportacion))
      )
      AND (
        v_alcance = 'GLOBAL'
        OR (v_alcance = 'SEDE'
            AND NULLIF(e.filtros ->> 'id_sucursal', '')::bigint = v_id_sucursal)
        OR (v_alcance = 'PROPIO' AND e.id_usuario = v_id_usuario)
      )
  ), pagina AS (
    SELECT * FROM base
    ORDER BY fecha_registro DESC, id DESC
    OFFSET (v_pagina - 1) * v_limite
    LIMIT v_limite
  )
  SELECT
    (SELECT COUNT(*) FROM base),
    COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY fecha_registro DESC, id DESC)
              FROM pagina p), '[]'::jsonb)
  INTO v_total, v_items;

  RETURN jsonb_build_object(
    'pagina', v_pagina,
    'limite', v_limite,
    'total', v_total,
    'total_paginas', CASE WHEN v_total = 0 THEN 0
      ELSE CEIL(v_total::numeric / v_limite)::integer
    END,
    'items', v_items
  );
END;
$$;

-- ============================================================================
-- 7. ANULACION LOGICA DE UNA EXPORTACION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_exportacion_anular(
  p_id_exportacion bigint,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_exportacion public.tb_compensacion_exportacion%ROWTYPE;
  v_contexto jsonb;
  v_id_usuario bigint;
  v_alcance text;
BEGIN
  SELECT * INTO v_exportacion
  FROM public.tb_compensacion_exportacion
  WHERE id = p_id_exportacion
  FOR UPDATE;

  IF v_exportacion.id IS NULL THEN
    RAISE EXCEPTION 'La exportacion no existe';
  END IF;
  IF BTRIM(COALESCE(p_motivo, '')) = '' THEN
    RAISE EXCEPTION 'El motivo de anulacion es obligatorio';
  END IF;

  v_contexto := public.f_private_compensacion_reporte_contexto(
    v_exportacion.id_periodo,
    'EDITAR',
    NULLIF(v_exportacion.filtros ->> 'id_sucursal', '')::bigint,
    NULLIF(v_exportacion.filtros ->> 'id_colaborador', '')::bigint
  );
  v_id_usuario := (v_contexto ->> 'id_usuario')::bigint;
  v_alcance := v_contexto ->> 'alcance';

  IF v_alcance <> 'GLOBAL' AND v_exportacion.id_usuario <> v_id_usuario THEN
    RAISE EXCEPTION 'Solo puede anular sus propias exportaciones';
  END IF;
  IF v_exportacion.estado_exportacion = 'ANULADA' THEN
    RETURN to_jsonb(v_exportacion) || jsonb_build_object('actualizado', false);
  END IF;

  UPDATE public.tb_compensacion_exportacion
  SET estado_exportacion = 'ANULADA',
      id_usuario_anula = v_id_usuario,
      fecha_anulacion = now(),
      motivo_anulacion = BTRIM(p_motivo)
  WHERE id = p_id_exportacion
  RETURNING * INTO v_exportacion;

  RETURN to_jsonb(v_exportacion) || jsonb_build_object('actualizado', true);
END;
$$;

-- ============================================================================
-- 8. FUENTE CANONICA DE LIQUIDACIONES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_compensacion_reporte_liquidaciones(
  p_id_periodo bigint
)
RETURNS TABLE (
  id_liquidacion bigint,
  id_colaborador bigint,
  colaborador_nombre text,
  colaborador_documento text,
  id_sucursal bigint,
  sucursal_nombre text,
  estado_liquidacion text,
  total_sueldo numeric,
  total_bonos numeric,
  total_comisiones numeric,
  total_descuentos numeric,
  total_pagar numeric,
  total_pagado numeric,
  total_pendiente numeric,
  id_cierre bigint,
  fuente text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_cierre bigint;
BEGIN
  SELECT c.id INTO v_id_cierre
  FROM public.tb_compensacion_cierre c
  WHERE c.id_periodo = p_id_periodo
    AND c.estado_cierre = 'VIGENTE';

  IF v_id_cierre IS NOT NULL THEN
    RETURN QUERY
    SELECT
      cl.id_liquidacion,
      cl.id_colaborador,
      cl.colaborador_snapshot ->> 'nombre_completo',
      cl.colaborador_snapshot ->> 'numero_documento',
      sede.id_sucursal,
      sede.sucursal_nombre,
      cl.detalle_snapshot -> 'liquidacion' ->> 'estado_liquidacion',
      cl.total_sueldo,
      cl.total_bonos,
      cl.total_comisiones,
      cl.total_descuentos,
      cl.total_pagar,
      cl.total_pagado,
      cl.total_pagar - cl.total_pagado,
      cl.id_cierre,
      'CIERRE'::text
    FROM public.tb_compensacion_cierre_liquidacion cl
    LEFT JOIN LATERAL (
      SELECT
        NULLIF(t.value -> 'asignacion_snapshot' ->> 'id_sucursal', '')::bigint
          AS id_sucursal,
        t.value -> 'asignacion_snapshot' ->> 'sucursal_nombre'
          AS sucursal_nombre
      FROM jsonb_array_elements(cl.detalle_snapshot -> 'tramos') t(value)
      ORDER BY (t.value ->> 'fecha_fin')::date DESC,
               (t.value ->> 'fecha_inicio')::date DESC
      LIMIT 1
    ) sede ON true
    WHERE cl.id_cierre = v_id_cierre;
  ELSE
    RETURN QUERY
    SELECT
      l.id,
      l.id_colaborador,
      c.nombre_completo::text,
      c.numero_documento::text,
      sede.id_sucursal,
      sede.sucursal_nombre,
      l.estado_liquidacion::text,
      l.total_sueldo,
      l.total_bonos,
      l.total_comisiones,
      l.total_descuentos,
      l.total_pagar,
      l.total_pagado,
      l.total_pagar - l.total_pagado,
      NULL::bigint,
      'VIGENTE'::text
    FROM public.tb_compensacion_liquidacion l
    JOIN public.tb_compensacion_colaborador c ON c.id = l.id_colaborador
    LEFT JOIN LATERAL (
      SELECT
        (t.asignacion_snapshot ->> 'id_sucursal')::bigint AS id_sucursal,
        t.asignacion_snapshot ->> 'sucursal_nombre' AS sucursal_nombre
      FROM public.tb_compensacion_liquidacion_tramo t
      WHERE t.id_liquidacion = l.id
      ORDER BY t.fecha_fin DESC, t.fecha_inicio DESC, t.id DESC
      LIMIT 1
    ) sede ON true
    WHERE l.id_periodo = p_id_periodo
      AND l.estado_liquidacion NOT IN ('REEMPLAZADA', 'ANULADA');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.f_private_compensacion_reporte_liquidaciones(bigint)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 9. FUENTE CANONICA DE DETALLES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_compensacion_reporte_detalles(
  p_id_periodo bigint
)
RETURNS TABLE (
  id_liquidacion bigint,
  id_colaborador bigint,
  id_sucursal bigint,
  sucursal_nombre text,
  id_concepto bigint,
  concepto_codigo text,
  concepto_nombre text,
  categoria text,
  naturaleza text,
  tipo_origen text,
  clave_origen text,
  cantidad numeric,
  tarifa numeric,
  importe numeric,
  fuente text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_cierre bigint;
BEGIN
  SELECT c.id INTO v_id_cierre
  FROM public.tb_compensacion_cierre c
  WHERE c.id_periodo = p_id_periodo
    AND c.estado_cierre = 'VIGENTE';

  IF v_id_cierre IS NOT NULL THEN
    RETURN QUERY
    SELECT
      cl.id_liquidacion,
      cl.id_colaborador,
      sede.id_sucursal,
      sede.sucursal_nombre,
      (d.value ->> 'id_concepto')::bigint,
      d.value ->> 'concepto_codigo_snapshot',
      d.value ->> 'concepto_nombre_snapshot',
      d.value ->> 'categoria_snapshot',
      d.value ->> 'naturaleza_snapshot',
      d.value ->> 'tipo_origen',
      d.value ->> 'clave_origen',
      (d.value ->> 'cantidad')::numeric,
      (d.value ->> 'tarifa')::numeric,
      (d.value ->> 'importe')::numeric,
      'CIERRE'::text
    FROM public.tb_compensacion_cierre_liquidacion cl
    CROSS JOIN LATERAL jsonb_array_elements(cl.detalle_snapshot -> 'detalles') d(value)
    LEFT JOIN LATERAL (
      SELECT
        NULLIF(t.value -> 'asignacion_snapshot' ->> 'id_sucursal', '')::bigint
          AS id_sucursal,
        t.value -> 'asignacion_snapshot' ->> 'sucursal_nombre'
          AS sucursal_nombre
      FROM jsonb_array_elements(cl.detalle_snapshot -> 'tramos') t(value)
      ORDER BY (t.value ->> 'fecha_fin')::date DESC,
               (t.value ->> 'fecha_inicio')::date DESC
      LIMIT 1
    ) sede ON true
    WHERE cl.id_cierre = v_id_cierre;
  ELSE
    RETURN QUERY
    SELECT
      d.id_liquidacion,
      l.id_colaborador,
      sede.id_sucursal,
      sede.sucursal_nombre,
      d.id_concepto,
      d.concepto_codigo_snapshot::text,
      d.concepto_nombre_snapshot::text,
      d.categoria_snapshot::text,
      d.naturaleza_snapshot::text,
      d.tipo_origen::text,
      d.clave_origen::text,
      d.cantidad,
      d.tarifa,
      d.importe,
      'VIGENTE'::text
    FROM public.tb_compensacion_liquidacion_detalle d
    JOIN public.tb_compensacion_liquidacion l ON l.id = d.id_liquidacion
    LEFT JOIN LATERAL (
      SELECT
        (t.asignacion_snapshot ->> 'id_sucursal')::bigint AS id_sucursal,
        t.asignacion_snapshot ->> 'sucursal_nombre' AS sucursal_nombre
      FROM public.tb_compensacion_liquidacion_tramo t
      WHERE t.id_liquidacion = l.id
      ORDER BY t.fecha_fin DESC, t.fecha_inicio DESC, t.id DESC
      LIMIT 1
    ) sede ON true
    WHERE l.id_periodo = p_id_periodo
      AND l.estado_liquidacion NOT IN ('REEMPLAZADA', 'ANULADA');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.f_private_compensacion_reporte_detalles(bigint)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 10. REPORTE FINANCIERO GENERAL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_reporte_financiero(
  p_id_periodo bigint,
  p_id_sucursal bigint DEFAULT NULL,
  p_id_colaborador bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_id_sucursal bigint;
  v_id_colaborador bigint;
  v_resumen jsonb;
  v_items jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_reporte_contexto(
    p_id_periodo, 'CONSULTAR', p_id_sucursal, p_id_colaborador
  );
  v_id_sucursal := NULLIF(v_contexto ->> 'id_sucursal_efectiva', '')::bigint;
  v_id_colaborador := NULLIF(v_contexto ->> 'id_colaborador_efectivo', '')::bigint;

  WITH base AS (
    SELECT *
    FROM public.f_private_compensacion_reporte_liquidaciones(p_id_periodo)
    WHERE (v_id_sucursal IS NULL OR id_sucursal = v_id_sucursal)
      AND (v_id_colaborador IS NULL OR id_colaborador = v_id_colaborador)
  )
  SELECT jsonb_build_object(
    'total_colaboradores', COUNT(*),
    'total_sueldo_bruto', COALESCE(SUM(total_sueldo), 0),
    'total_bonos', COALESCE(SUM(total_bonos), 0),
    'total_comisiones', COALESCE(SUM(total_comisiones), 0),
    'total_ingresos', COALESCE(SUM(total_sueldo + total_bonos + total_comisiones), 0),
    'total_descuentos', COALESCE(SUM(total_descuentos), 0),
    'total_pagar', COALESCE(SUM(total_pagar), 0),
    'total_pagado', COALESCE(SUM(total_pagado), 0),
    'total_pendiente', COALESCE(SUM(total_pendiente), 0)
  ), COALESCE(jsonb_agg(to_jsonb(base) ORDER BY colaborador_nombre, id_colaborador), '[]'::jsonb)
  INTO v_resumen, v_items
  FROM base;

  RETURN jsonb_build_object(
    'periodo', v_contexto -> 'periodo',
    'estado_periodo', v_contexto -> 'estado_periodo',
    'fuente', v_contexto -> 'fuente_reporte',
    'id_cierre', v_contexto -> 'id_cierre_vigente',
    'filtros', jsonb_build_object(
      'id_sucursal', v_id_sucursal,
      'id_colaborador', v_id_colaborador
    ),
    'resumen', v_resumen,
    'items', v_items
  );
END;
$$;

-- ============================================================================
-- 11. DESGLOSE POR CONCEPTO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_reporte_conceptos(
  p_id_periodo bigint,
  p_id_sucursal bigint DEFAULT NULL,
  p_id_colaborador bigint DEFAULT NULL,
  p_categoria character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_id_sucursal bigint;
  v_id_colaborador bigint;
  v_items jsonb;
  v_total_ingresos numeric;
  v_total_descuentos numeric;
BEGIN
  v_contexto := public.f_private_compensacion_reporte_contexto(
    p_id_periodo, 'CONSULTAR', p_id_sucursal, p_id_colaborador
  );
  v_id_sucursal := NULLIF(v_contexto ->> 'id_sucursal_efectiva', '')::bigint;
  v_id_colaborador := NULLIF(v_contexto ->> 'id_colaborador_efectivo', '')::bigint;

  WITH base AS (
    SELECT *
    FROM public.f_private_compensacion_reporte_detalles(p_id_periodo)
    WHERE (v_id_sucursal IS NULL OR id_sucursal = v_id_sucursal)
      AND (v_id_colaborador IS NULL OR id_colaborador = v_id_colaborador)
      AND (
        NULLIF(BTRIM(p_categoria), '') IS NULL
        OR categoria = UPPER(TRIM(p_categoria))
      )
  ), agrupado AS (
    SELECT
      id_concepto,
      concepto_codigo,
      concepto_nombre,
      categoria,
      naturaleza,
      COUNT(*) AS total_lineas,
      COUNT(DISTINCT id_colaborador) AS total_colaboradores,
      SUM(importe) AS importe_total
    FROM base
    GROUP BY id_concepto, concepto_codigo, concepto_nombre, categoria, naturaleza
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(agrupado) ORDER BY categoria, concepto_nombre), '[]'::jsonb),
    COALESCE(SUM(importe_total) FILTER (WHERE naturaleza = 'INGRESO'), 0),
    COALESCE(SUM(importe_total) FILTER (WHERE naturaleza = 'DESCUENTO'), 0)
  INTO v_items, v_total_ingresos, v_total_descuentos
  FROM agrupado;

  RETURN jsonb_build_object(
    'periodo', v_contexto -> 'periodo',
    'fuente', v_contexto -> 'fuente_reporte',
    'filtros', jsonb_build_object(
      'id_sucursal', v_id_sucursal,
      'id_colaborador', v_id_colaborador,
      'categoria', NULLIF(UPPER(TRIM(p_categoria)), '')
    ),
    'total_ingresos', v_total_ingresos,
    'total_descuentos', v_total_descuentos,
    'total_neto', v_total_ingresos - v_total_descuentos,
    'items', v_items
  );
END;
$$;

-- ============================================================================
-- 12. RESUMEN FINANCIERO POR SEDE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_reporte_sedes(
  p_id_periodo bigint,
  p_id_sucursal bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_id_sucursal bigint;
  v_items jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_reporte_contexto(
    p_id_periodo, 'CONSULTAR', p_id_sucursal, NULL
  );
  v_id_sucursal := NULLIF(v_contexto ->> 'id_sucursal_efectiva', '')::bigint;

  WITH base AS (
    SELECT *
    FROM public.f_private_compensacion_reporte_liquidaciones(p_id_periodo)
    WHERE (v_id_sucursal IS NULL OR id_sucursal = v_id_sucursal)
  ), agrupado AS (
    SELECT
      id_sucursal,
      COALESCE(sucursal_nombre, 'Sin sede') AS sucursal_nombre,
      COUNT(*) AS total_colaboradores,
      SUM(total_sueldo) AS total_sueldo,
      SUM(total_bonos) AS total_bonos,
      SUM(total_comisiones) AS total_comisiones,
      SUM(total_descuentos) AS total_descuentos,
      SUM(total_pagar) AS total_pagar,
      SUM(total_pagado) AS total_pagado,
      SUM(total_pendiente) AS total_pendiente
    FROM base
    GROUP BY id_sucursal, sucursal_nombre
  )
  SELECT COALESCE(
    jsonb_agg(to_jsonb(agrupado) ORDER BY sucursal_nombre),
    '[]'::jsonb
  ) INTO v_items
  FROM agrupado;

  RETURN jsonb_build_object(
    'periodo', v_contexto -> 'periodo',
    'fuente', v_contexto -> 'fuente_reporte',
    'regla_atribucion_sede', 'Ultima asignacion vigente dentro del periodo',
    'items', v_items
  );
END;
$$;

-- ============================================================================
-- PERMISOS
-- ============================================================================

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_reporte_financiero(
  bigint, bigint, bigint
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_reporte_conceptos(
  bigint, bigint, bigint, character varying
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_reporte_sedes(
  bigint, bigint
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_reporte_asistencia(
  bigint, bigint, bigint
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_reporte_productividad(
  bigint, bigint, bigint
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_reporte_pagos(
  bigint, bigint, bigint
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_exportacion(
  bigint, character varying, character varying, character varying, jsonb,
  character varying, integer, numeric, character varying, text,
  character varying
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_exportacion(
  bigint, character varying, character varying, character varying,
  integer, integer
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_exportacion_anular(
  bigint, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_reporte_financiero(
  bigint, bigint, bigint
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_reporte_conceptos(
  bigint, bigint, bigint, character varying
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_reporte_sedes(
  bigint, bigint
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_reporte_asistencia(
  bigint, bigint, bigint
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_reporte_productividad(
  bigint, bigint, bigint
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_reporte_pagos(
  bigint, bigint, bigint
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_exportacion(
  bigint, character varying, character varying, character varying, jsonb,
  character varying, integer, numeric, character varying, text,
  character varying
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_exportacion(
  bigint, character varying, character varying, character varying,
  integer, integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_exportacion_anular(
  bigint, text
) TO authenticated;

-- El backend de documentos genera el binario y calcula su hash. PostgreSQL
-- entrega el payload canonico y conserva la evidencia de cada exportacion.

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_private_compensacion_reporte_contexto',
  'f_private_compensacion_reporte_liquidaciones',
  'f_private_compensacion_reporte_detalles',
  'f_get_tb_compensacion_reporte_financiero',
  'f_get_tb_compensacion_reporte_conceptos',
  'f_get_tb_compensacion_reporte_sedes',
  'f_get_tb_compensacion_reporte_asistencia',
  'f_get_tb_compensacion_reporte_productividad',
  'f_get_tb_compensacion_reporte_pagos',
  'f_post_tb_compensacion_exportacion',
  'f_get_tb_compensacion_exportacion',
  'f_patch_tb_compensacion_exportacion_anular'
)
ORDER BY n.nspname, p.proname;
