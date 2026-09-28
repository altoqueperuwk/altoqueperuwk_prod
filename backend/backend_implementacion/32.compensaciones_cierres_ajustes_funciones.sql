-- ============================================================================
-- COMPENSACIONES - CIERRE MENSUAL, REAPERTURA Y AJUSTES POSTERIORES
-- ============================================================================
-- Objetivo:
--   Prevalidar y congelar un periodo mediante snapshots con huella de
--   integridad, permitir una reapertura global auditada y gestionar ajustes
--   que se aplican en un periodo posterior. No crea movimientos de Caja.
--
-- Dependencias:
--   17.compensaciones_personal_configuracion.sql
--   18.compensaciones_asistencia_evidencias.sql
--   19.compensaciones_liquidaciones_cierres_reportes.sql
--   20.compensaciones_seguridad_personal_funciones.sql
--   24.compensaciones_periodos_funciones.sql
--   30.compensaciones_preliquidacion_funciones.sql
--   31.compensaciones_aprobaciones_pagos_funciones.sql
-- ============================================================================

-- ============================================================================
-- 1. SNAPSHOT PRIVADO E INMUTABLE DE UNA LIQUIDACION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_compensacion_liquidacion_snapshot(
  p_id_liquidacion bigint
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'liquidacion', jsonb_build_object(
      'id', l.id,
      'id_periodo', l.id_periodo,
      'id_colaborador', l.id_colaborador,
      'numero_calculo', l.numero_calculo,
      'estado_liquidacion', l.estado_liquidacion,
      'colaborador_snapshot', l.colaborador_snapshot,
      'total_sueldo', l.total_sueldo,
      'total_bonos', l.total_bonos,
      'total_comisiones', l.total_comisiones,
      'total_descuentos', l.total_descuentos,
      'total_pagar', l.total_pagar,
      'total_pagado', l.total_pagado,
      'fecha_calculo', l.fecha_calculo,
      'fecha_aprobacion', l.fecha_aprobacion
    ),
    'tramos', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.fecha_inicio, t.id)
      FROM public.tb_compensacion_liquidacion_tramo t
      WHERE t.id_liquidacion = l.id
    ), '[]'::jsonb),
    'detalles', COALESCE((
      SELECT jsonb_agg(to_jsonb(d) ORDER BY d.clave_origen, d.id)
      FROM public.tb_compensacion_liquidacion_detalle d
      WHERE d.id_liquidacion = l.id
    ), '[]'::jsonb),
    'aprobaciones', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.numero_paso, a.id)
      FROM public.tb_compensacion_aprobacion a
      WHERE a.id_liquidacion = l.id
    ), '[]'::jsonb),
    'pagos', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.fecha_pago, p.id)
      FROM public.tb_compensacion_pago p
      WHERE p.id_liquidacion = l.id
    ), '[]'::jsonb)
  )
  FROM public.tb_compensacion_liquidacion l
  WHERE l.id = p_id_liquidacion;
$$;

REVOKE ALL ON FUNCTION public.f_private_compensacion_liquidacion_snapshot(bigint)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. PREVALIDACION PRIVADA DEL CIERRE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_compensacion_cierre_prevalidar(
  p_id_periodo bigint,
  p_exigir_pago_total boolean DEFAULT true,
  p_accion character varying DEFAULT 'CONSULTAR'
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
  v_bloqueos jsonb := '[]'::jsonb;
  v_advertencias jsonb := '[]'::jsonb;
  v_cantidad bigint;
  v_totales jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto(
    'CIERRES',
    UPPER(TRIM(COALESCE(p_accion, 'CONSULTAR')))
  );

  IF (v_contexto ->> 'alcance') <> 'GLOBAL' THEN
    RAISE EXCEPTION 'La prevalidacion del cierre requiere alcance GLOBAL';
  END IF;

  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = p_id_periodo;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'El periodo no existe';
  END IF;

  IF v_periodo.estado_periodo NOT IN ('EN_REVISION', 'APROBADO', 'REABIERTO') THEN
    v_bloqueos := v_bloqueos || jsonb_build_array(jsonb_build_object(
      'codigo', 'ESTADO_PERIODO_INVALIDO',
      'mensaje', 'El periodo debe estar EN_REVISION, APROBADO o REABIERTO',
      'estado_actual', v_periodo.estado_periodo
    ));
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tb_compensacion_cierre c
    WHERE c.id_periodo = p_id_periodo AND c.estado_cierre = 'VIGENTE'
  ) THEN
    v_bloqueos := v_bloqueos || jsonb_build_array(jsonb_build_object(
      'codigo', 'CIERRE_VIGENTE',
      'mensaje', 'El periodo ya tiene un cierre vigente'
    ));
  END IF;

  SELECT COUNT(*) INTO v_cantidad
  FROM public.tb_compensacion_liquidacion l
  WHERE l.id_periodo = p_id_periodo
    AND l.estado_liquidacion NOT IN ('REEMPLAZADA', 'ANULADA');

  IF v_cantidad = 0 THEN
    v_bloqueos := v_bloqueos || jsonb_build_array(jsonb_build_object(
      'codigo', 'SIN_LIQUIDACIONES',
      'mensaje', 'El periodo no tiene liquidaciones vigentes'
    ));
  END IF;

  SELECT COUNT(*) INTO v_cantidad
  FROM (
    SELECT DISTINCT a.id_colaborador
    FROM public.tb_compensacion_asignacion a
    WHERE a.fecha_inicio <= v_periodo.fecha_fin
      AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_periodo.fecha_inicio)
      AND NOT EXISTS (
        SELECT 1
        FROM public.tb_compensacion_liquidacion l
        WHERE l.id_periodo = p_id_periodo
          AND l.id_colaborador = a.id_colaborador
          AND l.estado_liquidacion NOT IN ('REEMPLAZADA', 'ANULADA')
      )
  ) faltantes;

  IF v_cantidad > 0 THEN
    v_bloqueos := v_bloqueos || jsonb_build_array(jsonb_build_object(
      'codigo', 'COLABORADORES_SIN_LIQUIDACION',
      'mensaje', 'Existen colaboradores asignados sin liquidacion vigente',
      'cantidad', v_cantidad
    ));
  END IF;

  SELECT COUNT(*) INTO v_cantidad
  FROM public.tb_compensacion_liquidacion l
  WHERE l.id_periodo = p_id_periodo
    AND l.estado_liquidacion NOT IN (
      'APROBADA', 'PAGO_PARCIAL', 'PAGADA', 'REEMPLAZADA', 'ANULADA'
    );

  IF v_cantidad > 0 THEN
    v_bloqueos := v_bloqueos || jsonb_build_array(jsonb_build_object(
      'codigo', 'LIQUIDACIONES_SIN_APROBAR',
      'mensaje', 'Existen liquidaciones vigentes pendientes de aprobacion',
      'cantidad', v_cantidad
    ));
  END IF;

  SELECT COUNT(*) INTO v_cantidad
  FROM public.tb_asistencia_solicitud s
  JOIN public.tb_asistencia_jornada j ON j.id = s.id_jornada
  WHERE j.fecha BETWEEN v_periodo.fecha_inicio AND v_periodo.fecha_fin
    AND s.estado_solicitud = 'PENDIENTE';

  IF v_cantidad > 0 THEN
    v_bloqueos := v_bloqueos || jsonb_build_array(jsonb_build_object(
      'codigo', 'ASISTENCIA_PENDIENTE',
      'mensaje', 'Existen solicitudes de asistencia pendientes',
      'cantidad', v_cantidad
    ));
  END IF;

  SELECT COUNT(*) INTO v_cantidad
  FROM public.tb_compensacion_evento ev
  JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
  WHERE ev.periodo_imputacion = v_periodo.periodo
    AND ev.estado_evento IN ('BORRADOR', 'PENDIENTE')
    AND (
      te.id_concepto IS NOT NULL
      OR te.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
    );

  IF v_cantidad > 0 THEN
    v_bloqueos := v_bloqueos || jsonb_build_array(jsonb_build_object(
      'codigo', 'EVENTOS_PENDIENTES',
      'mensaje', 'Existen eventos monetarios pendientes de decision',
      'cantidad', v_cantidad
    ));
  END IF;

  SELECT COUNT(*) INTO v_cantidad
  FROM public.tb_compensacion_evento ev
  JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
  WHERE ev.periodo_imputacion = v_periodo.periodo
    AND ev.estado_evento = 'APROBADO'
    AND (
      (
        te.categoria NOT IN ('PENALIDAD', 'AUDITORIA_PAGO')
        AND NOT EXISTS (
          SELECT 1
          FROM public.tb_compensacion_liquidacion l
          JOIN public.tb_compensacion_liquidacion_detalle d
            ON d.id_liquidacion = l.id
          WHERE l.id_periodo = p_id_periodo
            AND l.estado_liquidacion IN ('APROBADA', 'PAGO_PARCIAL', 'PAGADA')
            AND d.id_evento = ev.id
        )
      )
      OR (
        te.categoria IN ('PENALIDAD', 'AUDITORIA_PAGO')
        AND COALESCE(ev.importe_aprobado, 0) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM public.tb_compensacion_liquidacion l
          JOIN public.tb_compensacion_liquidacion_detalle d
            ON d.id_liquidacion = l.id
          WHERE l.id_periodo = p_id_periodo
            AND l.id_colaborador = ev.id_colaborador_responsable
            AND l.estado_liquidacion IN ('APROBADA', 'PAGO_PARCIAL', 'PAGADA')
            AND d.id_evento = ev.id
            AND d.naturaleza_snapshot = 'DESCUENTO'
        )
      )
      OR (
        te.categoria = 'AUDITORIA_PAGO'
        AND COALESCE(NULLIF(
          ev.criterios_validacion_snapshot ->> 'importe_bono_reportante',
          ''
        )::numeric, 0) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM public.tb_compensacion_liquidacion l
          JOIN public.tb_compensacion_liquidacion_detalle d
            ON d.id_liquidacion = l.id
          WHERE l.id_periodo = p_id_periodo
            AND l.id_colaborador = ev.id_colaborador_beneficiario
            AND l.estado_liquidacion IN ('APROBADA', 'PAGO_PARCIAL', 'PAGADA')
            AND d.id_evento = ev.id
            AND d.naturaleza_snapshot = 'INGRESO'
        )
      )
    );

  IF v_cantidad > 0 THEN
    v_bloqueos := v_bloqueos || jsonb_build_array(jsonb_build_object(
      'codigo', 'EVENTOS_APROBADOS_NO_LIQUIDADOS',
      'mensaje', 'Existen eventos aprobados que no forman parte de una liquidacion aprobada',
      'cantidad', v_cantidad
    ));
  END IF;

  SELECT COUNT(*) INTO v_cantidad
  FROM public.tb_compensacion_ajuste a
  WHERE a.id_periodo_destino = p_id_periodo
    AND a.estado_ajuste = 'PENDIENTE';

  IF v_cantidad > 0 THEN
    v_bloqueos := v_bloqueos || jsonb_build_array(jsonb_build_object(
      'codigo', 'AJUSTES_PENDIENTES',
      'mensaje', 'Existen ajustes pendientes de decision',
      'cantidad', v_cantidad
    ));
  END IF;

  SELECT COUNT(*) INTO v_cantidad
  FROM public.tb_compensacion_ajuste a
  WHERE a.id_periodo_destino = p_id_periodo
    AND a.estado_ajuste = 'APROBADO'
    AND NOT EXISTS (
      SELECT 1
      FROM public.tb_compensacion_liquidacion l
      JOIN public.tb_compensacion_liquidacion_detalle d
        ON d.id_liquidacion = l.id
      WHERE l.id_periodo = p_id_periodo
        AND l.id_colaborador = a.id_colaborador
        AND l.estado_liquidacion IN ('APROBADA', 'PAGO_PARCIAL', 'PAGADA')
        AND d.tipo_origen = 'AJUSTE'
        AND d.clave_origen = 'AJUSTE:' || a.id
    );

  IF v_cantidad > 0 THEN
    v_bloqueos := v_bloqueos || jsonb_build_array(jsonb_build_object(
      'codigo', 'AJUSTES_APROBADOS_NO_APLICADOS',
      'mensaje', 'Existen ajustes aprobados que no forman parte de una liquidacion aprobada',
      'cantidad', v_cantidad
    ));
  END IF;

  SELECT COUNT(*) INTO v_cantidad
  FROM public.tb_compensacion_liquidacion l
  WHERE l.id_periodo = p_id_periodo
    AND l.estado_liquidacion IN ('APROBADA', 'PAGO_PARCIAL')
    AND l.total_pagado < l.total_pagar;

  IF v_cantidad > 0 THEN
    IF COALESCE(p_exigir_pago_total, true) THEN
      v_bloqueos := v_bloqueos || jsonb_build_array(jsonb_build_object(
        'codigo', 'PAGOS_PENDIENTES',
        'mensaje', 'La politica seleccionada exige pagar todas las liquidaciones',
        'cantidad', v_cantidad
      ));
    ELSE
      v_advertencias := v_advertencias || jsonb_build_array(jsonb_build_object(
        'codigo', 'CUENTAS_POR_PAGAR',
        'mensaje', 'El cierre conservara saldos pendientes como cuentas por pagar',
        'cantidad', v_cantidad
      ));
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'total_colaboradores', COUNT(*),
    'total_sueldo', COALESCE(SUM(l.total_sueldo), 0),
    'total_bonos', COALESCE(SUM(l.total_bonos), 0),
    'total_comisiones', COALESCE(SUM(l.total_comisiones), 0),
    'total_descuentos', COALESCE(SUM(l.total_descuentos), 0),
    'total_pagar', COALESCE(SUM(l.total_pagar), 0),
    'total_pagado', COALESCE(SUM(l.total_pagado), 0),
    'total_pendiente', COALESCE(SUM(l.total_pagar - l.total_pagado), 0)
  ) INTO v_totales
  FROM public.tb_compensacion_liquidacion l
  WHERE l.id_periodo = p_id_periodo
    AND l.estado_liquidacion IN ('APROBADA', 'PAGO_PARCIAL', 'PAGADA');

  RETURN jsonb_build_object(
    'id_periodo', v_periodo.id,
    'periodo', v_periodo.periodo,
    'estado_periodo', v_periodo.estado_periodo,
    'politica_pago', CASE
      WHEN COALESCE(p_exigir_pago_total, true) THEN 'EXIGIR_PAGO_TOTAL'
      ELSE 'PERMITIR_CUENTAS_POR_PAGAR'
    END,
    'puede_cerrar', jsonb_array_length(v_bloqueos) = 0,
    'bloqueos', v_bloqueos,
    'advertencias', v_advertencias,
    'totales', v_totales
  );
END;
$$;

REVOKE ALL ON FUNCTION public.f_private_compensacion_cierre_prevalidar(
  bigint, boolean, character varying
) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. PREVALIDACION PUBLICA
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_cierre_prevalidar(
  p_id_periodo bigint,
  p_exigir_pago_total boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.f_private_compensacion_cierre_prevalidar(
    p_id_periodo, p_exigir_pago_total, 'CONSULTAR'
  );
$$;

-- ============================================================================
-- 4. CIERRE TRANSACCIONAL E IDEMPOTENTE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_cierre(
  p_id_periodo bigint,
  p_exigir_pago_total boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_periodo public.tb_compensacion_periodo%ROWTYPE;
  v_cierre_vigente public.tb_compensacion_cierre%ROWTYPE;
  v_prevalidacion jsonb;
  v_totales jsonb;
  v_lineas_resumen jsonb;
  v_asistencia_resumen jsonb;
  v_productividad_resumen jsonb;
  v_snapshot jsonb;
  v_hash text;
  v_numero_version integer;
  v_id_cierre_anterior bigint;
  v_id_cierre bigint;
BEGIN
  v_contexto := public.f_private_compensacion_validar_periodo(
    p_id_periodo,
    'CIERRES',
    'CERRAR',
    NULL,
    true,
    true
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = p_id_periodo;

  SELECT * INTO v_cierre_vigente
  FROM public.tb_compensacion_cierre
  WHERE id_periodo = p_id_periodo
    AND estado_cierre = 'VIGENTE'
  FOR UPDATE;

  IF v_cierre_vigente.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id_cierre', v_cierre_vigente.id,
      'numero_version', v_cierre_vigente.numero_version,
      'hash_integridad', v_cierre_vigente.hash_integridad,
      'creado', false,
      'mensaje', 'El periodo ya se encontraba cerrado'
    );
  END IF;

  PERFORM 1
  FROM public.tb_compensacion_liquidacion l
  WHERE l.id_periodo = p_id_periodo
    AND l.estado_liquidacion NOT IN ('REEMPLAZADA', 'ANULADA')
  FOR UPDATE;

  PERFORM 1
  FROM public.tb_compensacion_evento ev
  WHERE ev.periodo_imputacion = v_periodo.periodo
  FOR UPDATE;

  PERFORM 1
  FROM public.tb_compensacion_ajuste a
  WHERE a.id_periodo_destino = p_id_periodo
  FOR UPDATE;

  PERFORM 1
  FROM public.tb_asistencia_solicitud s
  JOIN public.tb_asistencia_jornada j ON j.id = s.id_jornada
  WHERE j.fecha BETWEEN v_periodo.fecha_inicio AND v_periodo.fecha_fin
  FOR UPDATE OF s;

  v_prevalidacion := public.f_private_compensacion_cierre_prevalidar(
    p_id_periodo, p_exigir_pago_total, 'CERRAR'
  );

  IF NOT COALESCE((v_prevalidacion ->> 'puede_cerrar')::boolean, false) THEN
    RAISE EXCEPTION 'El periodo no puede cerrarse: %', v_prevalidacion -> 'bloqueos';
  END IF;

  v_totales := v_prevalidacion -> 'totales';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id_liquidacion', l.id,
    'id_colaborador', l.id_colaborador,
    'numero_calculo', l.numero_calculo,
    'hash', md5(public.f_private_compensacion_liquidacion_snapshot(l.id)::text)
  ) ORDER BY l.id_colaborador, l.id), '[]'::jsonb)
  INTO v_lineas_resumen
  FROM public.tb_compensacion_liquidacion l
  WHERE l.id_periodo = p_id_periodo
    AND l.estado_liquidacion IN ('APROBADA', 'PAGO_PARCIAL', 'PAGADA');

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.colaborador_nombre, x.id_colaborador), '[]'::jsonb)
  INTO v_asistencia_resumen
  FROM (
    SELECT
      l.id_colaborador,
      co.nombre_completo AS colaborador_nombre,
      COUNT(j.id) FILTER (
        WHERE j.estado_dia NOT IN ('DESCANSO', 'VACACIONES', 'LICENCIA', 'PENDIENTE')
      )::integer AS dias_pagables,
      COUNT(j.id) FILTER (WHERE j.estado_dia = 'COMPLETO')::integer AS dias_completos,
      COUNT(j.id) FILTER (WHERE j.minutos_tardanza > 0)::integer AS dias_con_tardanza,
      COALESCE(SUM(j.minutos_tardanza), 0)::integer AS minutos_tardanza,
      COUNT(j.id) FILTER (WHERE j.minutos_extra > 0)::integer AS dias_con_horas_extra,
      COALESCE(SUM(j.minutos_extra), 0)::integer AS minutos_extra,
      COUNT(j.id) FILTER (
        WHERE j.estado_dia IN ('FALTA_ENTRADA', 'FALTA_SALIDA', 'AUSENTE')
      )::integer AS dias_incompletos
    FROM public.tb_compensacion_liquidacion l
    JOIN public.tb_compensacion_colaborador co ON co.id = l.id_colaborador
    LEFT JOIN public.tb_asistencia_jornada j
      ON j.id_colaborador = l.id_colaborador
     AND j.fecha BETWEEN v_periodo.fecha_inicio AND v_periodo.fecha_fin
    WHERE l.id_periodo = p_id_periodo
      AND l.estado_liquidacion IN ('APROBADA', 'PAGO_PARCIAL', 'PAGADA')
    GROUP BY l.id_colaborador, co.nombre_completo
  ) x;

  WITH colaboradores AS (
    SELECT DISTINCT
      l.id_colaborador,
      co.id_usuario,
      co.nombre_completo AS colaborador_nombre
    FROM public.tb_compensacion_liquidacion l
    JOIN public.tb_compensacion_colaborador co ON co.id = l.id_colaborador
    WHERE l.id_periodo = p_id_periodo
      AND l.estado_liquidacion IN ('APROBADA', 'PAGO_PARCIAL', 'PAGADA')
  ), metricas AS (
    SELECT
      c.id_colaborador,
      c.colaborador_nombre,
      sede.id_sucursal,
      sede.sucursal_nombre,
      COALESCE(clientes.clientes_registrados, 0)::integer AS clientes_registrados,
      COALESCE(clientes.clientes_convertidos_7_dias, 0)::integer
        AS clientes_convertidos_7_dias,
      (COALESCE(clientes.clientes_registrados, 0)
        - COALESCE(clientes.clientes_convertidos_7_dias, 0))::integer
        AS clientes_solo_registro,
      CASE
        WHEN COALESCE(clientes.clientes_registrados, 0) = 0 THEN 0
        ELSE ROUND(
          clientes.clientes_convertidos_7_dias::numeric
          / clientes.clientes_registrados * 100,
          2
        )
      END AS porcentaje_conversion_7_dias,
      COALESCE(operaciones.operaciones_pagadas_atribuidas, 0)::integer
        AS operaciones_pagadas_atribuidas,
      COALESCE(calificaciones.calificaciones_aprobadas, 0)::integer
        AS calificaciones_aprobadas
    FROM colaboradores c
    LEFT JOIN LATERAL (
      SELECT
        a.id_sucursal,
        s.nombre AS sucursal_nombre
      FROM public.tb_compensacion_asignacion a
      JOIN public.tb_sucursal s ON s.id = a.id_sucursal
      WHERE a.id_colaborador = c.id_colaborador
        AND a.fecha_inicio <= v_periodo.fecha_fin
        AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_periodo.fecha_inicio)
      ORDER BY LEAST(COALESCE(a.fecha_fin, v_periodo.fecha_fin), v_periodo.fecha_fin) DESC,
               a.fecha_inicio DESC,
               a.id DESC
      LIMIT 1
    ) sede ON true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::integer AS clientes_registrados,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1
          FROM public.tb_operacion_proceso op
          WHERE op.id_cliente = cli.id
            AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
            AND NOT EXISTS (
              SELECT 1 FROM public.tb_operacion_proceso_eliminada oe
              WHERE oe.id_operacion_proceso = op.id
            )
            AND COALESCE(op.fecha_pagado, op.fecha_deposito_cliente, op.fecha_registro)
              >= cli.fecha_registro
            AND COALESCE(op.fecha_pagado, op.fecha_deposito_cliente, op.fecha_registro)
              <= cli.fecha_registro + INTERVAL '7 days'
        ))::integer AS clientes_convertidos_7_dias
      FROM public.tb_cliente cli
      WHERE cli.id_usuario = c.id_usuario
        AND (cli.fecha_registro AT TIME ZONE v_periodo.zona_horaria)::date
          BETWEEN v_periodo.fecha_inicio AND v_periodo.fecha_fin
    ) clientes ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::integer AS operaciones_pagadas_atribuidas
      FROM public.tb_operacion_proceso op
      WHERE COALESCE(op.id_usuario_gestor, op.id_usuario) = c.id_usuario
        AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
        AND NOT EXISTS (
          SELECT 1 FROM public.tb_operacion_proceso_eliminada oe
          WHERE oe.id_operacion_proceso = op.id
        )
        AND (
          COALESCE(op.fecha_pagado, op.fecha_deposito_cliente, op.fecha_registro)
          AT TIME ZONE v_periodo.zona_horaria
        )::date BETWEEN v_periodo.fecha_inicio AND v_periodo.fecha_fin
    ) operaciones ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::integer AS calificaciones_aprobadas
      FROM public.tb_compensacion_evento ev
      JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
      WHERE ev.id_colaborador_beneficiario = c.id_colaborador
        AND ev.periodo_imputacion = v_periodo.periodo
        AND ev.estado_evento IN ('APROBADO', 'LIQUIDADO')
        AND te.categoria = 'CALIFICACION'
    ) calificaciones ON true
  )
  SELECT jsonb_build_object(
    'definiciones', jsonb_build_object(
      'clientes_registrados', 'Clientes creados por el usuario durante el periodo',
      'clientes_convertidos_7_dias', 'Clientes con al menos una operacion pagada antes de siete dias desde su registro',
      'operaciones_pagadas_atribuidas', 'Operaciones pagadas en el periodo cuyo gestor corresponde al colaborador',
      'calificaciones_aprobadas', 'Eventos de calificacion aprobados e imputados al periodo'
    ),
    'items', COALESCE(jsonb_agg(to_jsonb(metricas) ORDER BY colaborador_nombre, id_colaborador), '[]'::jsonb)
  )
  INTO v_productividad_resumen
  FROM metricas;

  SELECT COALESCE(MAX(c.numero_version), 0) + 1,
         (ARRAY_AGG(c.id ORDER BY c.numero_version DESC))[1]
  INTO v_numero_version, v_id_cierre_anterior
  FROM public.tb_compensacion_cierre c
  WHERE c.id_periodo = p_id_periodo;

  v_snapshot := jsonb_build_object(
    'id_periodo', v_periodo.id,
    'periodo', v_periodo.periodo,
    'nombre', v_periodo.nombre,
    'fecha_inicio', v_periodo.fecha_inicio,
    'fecha_fin', v_periodo.fecha_fin,
    'zona_horaria', v_periodo.zona_horaria,
    'numero_version', v_numero_version,
    'id_cierre_anterior', v_id_cierre_anterior,
    'politica_pago', v_prevalidacion -> 'politica_pago',
    'totales', v_totales,
    'advertencias', v_prevalidacion -> 'advertencias',
    'liquidaciones', v_lineas_resumen,
    'asistencia', v_asistencia_resumen,
    'productividad', v_productividad_resumen
  );
  v_hash := md5(v_snapshot::text);

  INSERT INTO public.tb_compensacion_cierre (
    id_periodo, numero_version, estado_cierre, total_colaboradores,
    total_sueldo, total_bonos, total_comisiones, total_descuentos,
    total_pagar, total_pagado, total_pendiente, snapshot_resumen,
    hash_integridad, id_cierre_anterior, id_usuario_cierra
  ) VALUES (
    p_id_periodo, v_numero_version, 'VIGENTE',
    (v_totales ->> 'total_colaboradores')::integer,
    (v_totales ->> 'total_sueldo')::numeric,
    (v_totales ->> 'total_bonos')::numeric,
    (v_totales ->> 'total_comisiones')::numeric,
    (v_totales ->> 'total_descuentos')::numeric,
    (v_totales ->> 'total_pagar')::numeric,
    (v_totales ->> 'total_pagado')::numeric,
    (v_totales ->> 'total_pendiente')::numeric,
    v_snapshot, v_hash, v_id_cierre_anterior, v_id_actor
  ) RETURNING id INTO v_id_cierre;

  INSERT INTO public.tb_compensacion_cierre_liquidacion (
    id_cierre, id_liquidacion, id_colaborador, colaborador_snapshot,
    total_sueldo, total_bonos, total_comisiones, total_descuentos,
    total_pagar, total_pagado, detalle_snapshot, hash_integridad
  )
  SELECT
    v_id_cierre, l.id, l.id_colaborador, l.colaborador_snapshot,
    l.total_sueldo, l.total_bonos, l.total_comisiones, l.total_descuentos,
    l.total_pagar, l.total_pagado,
    public.f_private_compensacion_liquidacion_snapshot(l.id),
    md5(public.f_private_compensacion_liquidacion_snapshot(l.id)::text)
  FROM public.tb_compensacion_liquidacion l
  WHERE l.id_periodo = p_id_periodo
    AND l.estado_liquidacion IN ('APROBADA', 'PAGO_PARCIAL', 'PAGADA')
  ORDER BY l.id_colaborador, l.id;

  INSERT INTO public.tb_compensacion_aprobacion (
    alcance, id_cierre, numero_paso, etapa, decision, comentario,
    id_usuario_aprueba, datos_decision
  ) VALUES (
    'CIERRE', v_id_cierre, 1, 'CIERRE_MENSUAL', 'APROBADO', NULL,
    v_id_actor, jsonb_build_object(
      'politica_pago', v_prevalidacion -> 'politica_pago',
      'hash_integridad', v_hash,
      'totales', v_totales
    )
  );

  UPDATE public.tb_compensacion_evento ev
  SET estado_evento = 'LIQUIDADO',
      fecha_actualizacion = now()
  WHERE ev.periodo_imputacion = v_periodo.periodo
    AND ev.estado_evento = 'APROBADO'
    AND EXISTS (
      SELECT 1
      FROM public.tb_compensacion_cierre_liquidacion cl
      JOIN public.tb_compensacion_liquidacion_detalle d
        ON d.id_liquidacion = cl.id_liquidacion
      WHERE cl.id_cierre = v_id_cierre
        AND d.id_evento = ev.id
    );

  UPDATE public.tb_compensacion_ajuste a
  SET estado_ajuste = 'APLICADO',
      fecha_actualizacion = now()
  WHERE a.id_periodo_destino = p_id_periodo
    AND a.estado_ajuste = 'APROBADO'
    AND EXISTS (
      SELECT 1
      FROM public.tb_compensacion_cierre_liquidacion cl
      JOIN public.tb_compensacion_liquidacion_detalle d
        ON d.id_liquidacion = cl.id_liquidacion
      WHERE cl.id_cierre = v_id_cierre
        AND d.tipo_origen = 'AJUSTE'
        AND d.clave_origen = 'AJUSTE:' || a.id
    );

  UPDATE public.tb_compensacion_periodo
  SET estado_periodo = 'CERRADO',
      fecha_aprobacion = COALESCE(fecha_aprobacion, now()),
      fecha_cierre = now(),
      id_usuario_actualiza = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id_periodo;

  RETURN jsonb_build_object(
    'id_cierre', v_id_cierre,
    'numero_version', v_numero_version,
    'hash_integridad', v_hash,
    'totales', v_totales,
    'creado', true,
    'mensaje', 'Periodo cerrado con snapshot inmutable'
  );
END;
$$;

-- ============================================================================
-- 5. REAPERTURA GLOBAL Y AUDITADA
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_cierre_reabrir(
  p_id_periodo bigint,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_cierre public.tb_compensacion_cierre%ROWTYPE;
  v_motivo text := NULLIF(TRIM(p_motivo), '');
BEGIN
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'El motivo de reapertura es obligatorio';
  END IF;

  v_contexto := public.f_private_compensacion_validar_periodo(
    p_id_periodo,
    'CIERRES',
    'CERRAR',
    ARRAY['CERRADO']::character varying[],
    true,
    true
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  SELECT * INTO v_cierre
  FROM public.tb_compensacion_cierre
  WHERE id_periodo = p_id_periodo
    AND estado_cierre = 'VIGENTE'
  FOR UPDATE;

  IF v_cierre.id IS NULL THEN
    RAISE EXCEPTION 'El periodo no tiene un cierre vigente';
  END IF;

  PERFORM 1
  FROM public.tb_compensacion_liquidacion l
  WHERE l.id_periodo = p_id_periodo
    AND l.estado_liquidacion NOT IN ('REEMPLAZADA', 'ANULADA')
  FOR UPDATE;

  UPDATE public.tb_compensacion_evento ev
  SET estado_evento = 'APROBADO',
      fecha_actualizacion = now()
  WHERE ev.estado_evento = 'LIQUIDADO'
    AND EXISTS (
      SELECT 1
      FROM public.tb_compensacion_cierre_liquidacion cl
      JOIN public.tb_compensacion_liquidacion_detalle d
        ON d.id_liquidacion = cl.id_liquidacion
      WHERE cl.id_cierre = v_cierre.id
        AND d.id_evento = ev.id
    );

  UPDATE public.tb_compensacion_ajuste a
  SET estado_ajuste = 'APROBADO',
      fecha_actualizacion = now()
  WHERE a.estado_ajuste = 'APLICADO'
    AND EXISTS (
      SELECT 1
      FROM public.tb_compensacion_cierre_liquidacion cl
      JOIN public.tb_compensacion_liquidacion_detalle d
        ON d.id_liquidacion = cl.id_liquidacion
      WHERE cl.id_cierre = v_cierre.id
        AND d.tipo_origen = 'AJUSTE'
        AND d.clave_origen = 'AJUSTE:' || a.id
    );

  UPDATE public.tb_compensacion_cierre
  SET estado_cierre = 'REVERTIDO',
      motivo_reapertura = v_motivo,
      id_usuario_revierte = v_id_actor,
      fecha_reversion = now()
  WHERE id = v_cierre.id;

  UPDATE public.tb_compensacion_periodo
  SET estado_periodo = 'REABIERTO',
      fecha_aprobacion = NULL,
      fecha_cierre = NULL,
      id_usuario_actualiza = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id_periodo;

  RETURN jsonb_build_object(
    'id_periodo', p_id_periodo,
    'id_cierre_revertido', v_cierre.id,
    'numero_version_revertida', v_cierre.numero_version,
    'estado_periodo', 'REABIERTO',
    'motivo', v_motivo,
    'mensaje', 'Periodo reabierto; el snapshot anterior permanece auditable'
  );
END;
$$;

-- ============================================================================
-- 6. CONSULTA E INTEGRIDAD DE CIERRES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_cierre(
  p_id bigint DEFAULT NULL,
  p_id_periodo bigint DEFAULT NULL,
  p_incluir_detalle boolean DEFAULT false
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('CIERRES', 'CONSULTAR');

  IF (v_contexto ->> 'alcance') <> 'GLOBAL' THEN
    RAISE EXCEPTION 'La consulta de cierres mensuales requiere alcance GLOBAL';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', c.id,
    'id_periodo', c.id_periodo,
    'periodo', pe.periodo,
    'periodo_nombre', pe.nombre,
    'numero_version', c.numero_version,
    'estado_cierre', c.estado_cierre,
    'total_colaboradores', c.total_colaboradores,
    'total_sueldo', c.total_sueldo,
    'total_bonos', c.total_bonos,
    'total_comisiones', c.total_comisiones,
    'total_descuentos', c.total_descuentos,
    'total_pagar', c.total_pagar,
    'total_pagado', c.total_pagado,
    'total_pendiente', c.total_pendiente,
    'snapshot_resumen', c.snapshot_resumen,
    'hash_integridad', c.hash_integridad,
    'motivo_reapertura', c.motivo_reapertura,
    'id_cierre_anterior', c.id_cierre_anterior,
    'id_usuario_cierra', c.id_usuario_cierra,
    'fecha_cierre', c.fecha_cierre,
    'id_usuario_revierte', c.id_usuario_revierte,
    'fecha_reversion', c.fecha_reversion,
    'liquidaciones', CASE WHEN COALESCE(p_incluir_detalle, false) THEN (
      SELECT COALESCE(jsonb_agg(to_jsonb(cl) ORDER BY cl.id_colaborador, cl.id), '[]'::jsonb)
      FROM public.tb_compensacion_cierre_liquidacion cl
      WHERE cl.id_cierre = c.id
    ) ELSE NULL END
  )
  FROM public.tb_compensacion_cierre c
  JOIN public.tb_compensacion_periodo pe ON pe.id = c.id_periodo
  WHERE (p_id IS NULL OR c.id = p_id)
    AND (p_id_periodo IS NULL OR c.id_periodo = p_id_periodo)
  ORDER BY pe.periodo DESC, c.numero_version DESC, c.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_cierre_validar_integridad(
  p_id_cierre bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_cierre public.tb_compensacion_cierre%ROWTYPE;
  v_lineas_invalidas bigint;
  v_hash_resumen text;
  v_lineas_resumen_actual jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('CIERRES', 'CONSULTAR');

  IF (v_contexto ->> 'alcance') <> 'GLOBAL' THEN
    RAISE EXCEPTION 'La validacion de integridad requiere alcance GLOBAL';
  END IF;

  SELECT * INTO v_cierre
  FROM public.tb_compensacion_cierre
  WHERE id = p_id_cierre;

  IF v_cierre.id IS NULL THEN
    RAISE EXCEPTION 'El cierre no existe';
  END IF;

  v_hash_resumen := md5(v_cierre.snapshot_resumen::text);

  SELECT COUNT(*) INTO v_lineas_invalidas
  FROM public.tb_compensacion_cierre_liquidacion cl
  WHERE cl.id_cierre = p_id_cierre
    AND cl.hash_integridad IS DISTINCT FROM md5(cl.detalle_snapshot::text);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id_liquidacion', cl.id_liquidacion,
    'id_colaborador', cl.id_colaborador,
    'numero_calculo', l.numero_calculo,
    'hash', cl.hash_integridad
  ) ORDER BY cl.id_colaborador, cl.id_liquidacion), '[]'::jsonb)
  INTO v_lineas_resumen_actual
  FROM public.tb_compensacion_cierre_liquidacion cl
  JOIN public.tb_compensacion_liquidacion l ON l.id = cl.id_liquidacion
  WHERE cl.id_cierre = p_id_cierre;

  RETURN jsonb_build_object(
    'id_cierre', v_cierre.id,
    'hash_almacenado', v_cierre.hash_integridad,
    'hash_recalculado', v_hash_resumen,
    'resumen_integro', v_cierre.hash_integridad = v_hash_resumen,
    'lineas_invalidas', v_lineas_invalidas,
    'indice_lineas_integro',
      v_cierre.snapshot_resumen -> 'liquidaciones' = v_lineas_resumen_actual,
    'integro', v_cierre.hash_integridad = v_hash_resumen
      AND v_lineas_invalidas = 0
      AND v_cierre.snapshot_resumen -> 'liquidaciones' = v_lineas_resumen_actual
  );
END;
$$;

-- ============================================================================
-- 7. CATALOGO DE AJUSTES SEGUN PERIODO Y ALCANCE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_ajuste_catalogo(
  p_id_periodo_destino bigint
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
  v_id_colaborador_actor bigint;
  v_id_sucursal_alcance bigint;
  v_colaboradores jsonb;
  v_conceptos jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('LIQUIDACIONES', 'CONSULTAR');
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = p_id_periodo_destino;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'El periodo destino no existe';
  END IF;

  WITH vigentes AS (
    SELECT DISTINCT ON (a.id_colaborador)
      a.id_colaborador, a.id_sucursal
    FROM public.tb_compensacion_asignacion a
    WHERE a.fecha_inicio <= v_periodo.fecha_fin
      AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_periodo.fecha_inicio)
    ORDER BY a.id_colaborador, a.fecha_inicio DESC, a.id DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'nombre', c.nombre_completo,
    'documento', c.numero_documento,
    'id_sucursal', v.id_sucursal,
    'sucursal', s.nombre
  ) ORDER BY c.nombre_completo), '[]'::jsonb)
  INTO v_colaboradores
  FROM vigentes v
  JOIN public.tb_compensacion_colaborador c ON c.id = v.id_colaborador
  JOIN public.tb_sucursal s ON s.id = v.id_sucursal
  JOIN public.tb_estado ec ON ec.id = c.id_estado
  WHERE UPPER(ec.nombre) = 'ACTIVO'
    AND (
      v_alcance = 'GLOBAL'
      OR (v_alcance = 'SEDE' AND v.id_sucursal = v_id_sucursal_alcance)
      OR (v_alcance = 'PROPIO' AND c.id = v_id_colaborador_actor)
    );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'codigo', c.codigo,
    'nombre', c.nombre,
    'categoria', c.categoria,
    'naturaleza', c.naturaleza
  ) ORDER BY c.categoria, c.nombre), '[]'::jsonb)
  INTO v_conceptos
  FROM public.tb_compensacion_concepto c
  JOIN public.tb_estado ec ON ec.id = c.id_estado
  WHERE UPPER(ec.nombre) = 'ACTIVO'
    AND c.naturaleza IN ('INGRESO', 'DESCUENTO');

  RETURN jsonb_build_object(
    'periodo', to_jsonb(v_periodo),
    'colaboradores', v_colaboradores,
    'conceptos', v_conceptos
  );
END;
$$;

-- ============================================================================
-- 8. CONSULTA DE AJUSTES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_ajuste(
  p_id bigint DEFAULT NULL,
  p_id_periodo_destino bigint DEFAULT NULL,
  p_id_colaborador bigint DEFAULT NULL,
  p_estado_ajuste character varying DEFAULT NULL
)
RETURNS SETOF jsonb
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
  v_contexto := public.f_private_compensacion_contexto('LIQUIDACIONES', 'CONSULTAR');
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', a.id,
    'id_periodo_destino', a.id_periodo_destino,
    'periodo_destino', pe.periodo,
    'id_colaborador', a.id_colaborador,
    'colaborador_nombre', c.nombre_completo,
    'colaborador_documento', c.numero_documento,
    'id_concepto', a.id_concepto,
    'concepto_codigo', co.codigo,
    'concepto_nombre', co.nombre,
    'id_detalle_origen', a.id_detalle_origen,
    'naturaleza', a.naturaleza,
    'monto', a.monto,
    'motivo', a.motivo,
    'evidencia', a.evidencia,
    'estado_ajuste', a.estado_ajuste,
    'id_usuario_solicita', a.id_usuario_solicita,
    'fecha_solicitud', a.fecha_solicitud,
    'id_usuario_aprueba', a.id_usuario_aprueba,
    'fecha_aprobacion', a.fecha_aprobacion,
    'fecha_actualizacion', a.fecha_actualizacion
  )
  FROM public.tb_compensacion_ajuste a
  JOIN public.tb_compensacion_periodo pe ON pe.id = a.id_periodo_destino
  JOIN public.tb_compensacion_colaborador c ON c.id = a.id_colaborador
  JOIN public.tb_compensacion_concepto co ON co.id = a.id_concepto
  WHERE (p_id IS NULL OR a.id = p_id)
    AND (p_id_periodo_destino IS NULL OR a.id_periodo_destino = p_id_periodo_destino)
    AND (p_id_colaborador IS NULL OR a.id_colaborador = p_id_colaborador)
    AND (
      p_estado_ajuste IS NULL
      OR a.estado_ajuste = UPPER(TRIM(p_estado_ajuste))
    )
    AND (
      v_alcance = 'GLOBAL'
      OR (v_alcance = 'PROPIO' AND a.id_colaborador = v_id_colaborador_actor)
      OR (v_alcance = 'SEDE' AND EXISTS (
        SELECT 1
        FROM public.tb_compensacion_asignacion asi
        WHERE asi.id_colaborador = a.id_colaborador
          AND asi.id_sucursal = v_id_sucursal_alcance
          AND asi.fecha_inicio <= pe.fecha_fin
          AND (asi.fecha_fin IS NULL OR asi.fecha_fin >= pe.fecha_inicio)
      ))
    )
  ORDER BY pe.periodo DESC, a.fecha_solicitud DESC, a.id DESC;
END;
$$;

-- ============================================================================
-- 9. SOLICITUD Y DECISION DE AJUSTES POSTERIORES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_ajuste(
  p_id_periodo_destino bigint,
  p_id_colaborador bigint,
  p_id_concepto bigint,
  p_naturaleza character varying,
  p_monto numeric,
  p_motivo text,
  p_id_detalle_origen bigint DEFAULT NULL,
  p_evidencia jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_periodo public.tb_compensacion_periodo%ROWTYPE;
  v_contexto jsonb;
  v_id_actor bigint;
  v_naturaleza character varying(20) := UPPER(TRIM(COALESCE(p_naturaleza, '')));
  v_monto numeric(14, 2) := ROUND(COALESCE(p_monto, 0), 2);
  v_motivo text := NULLIF(TRIM(p_motivo), '');
  v_id_ajuste bigint;
BEGIN
  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = p_id_periodo_destino
  FOR UPDATE;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'El periodo destino no existe';
  END IF;

  IF v_periodo.estado_periodo NOT IN (
    'ABIERTO', 'EN_CALCULO', 'EN_REVISION', 'OBSERVADO', 'REABIERTO'
  ) THEN
    RAISE EXCEPTION 'El periodo destino no admite ajustes';
  END IF;

  v_contexto := public.f_private_compensacion_liquidacion_validar_alcance(
    p_id_colaborador, 'REGISTRAR', v_periodo.fecha_fin
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF v_naturaleza NOT IN ('INGRESO', 'DESCUENTO') THEN
    RAISE EXCEPTION 'La naturaleza debe ser INGRESO o DESCUENTO';
  END IF;

  IF v_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del ajuste debe ser mayor que cero';
  END IF;

  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'El motivo del ajuste es obligatorio';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_concepto WHERE id = p_id_concepto
  ) THEN
    RAISE EXCEPTION 'El concepto no existe';
  END IF;

  IF p_evidencia IS NULL OR jsonb_typeof(p_evidencia) NOT IN ('array', 'object') THEN
    RAISE EXCEPTION 'La evidencia debe ser un arreglo u objeto JSON';
  END IF;

  IF p_id_detalle_origen IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_liquidacion_detalle d
    JOIN public.tb_compensacion_liquidacion l ON l.id = d.id_liquidacion
    JOIN public.tb_compensacion_cierre_liquidacion cl ON cl.id_liquidacion = l.id
    JOIN public.tb_compensacion_cierre ci ON ci.id = cl.id_cierre
    JOIN public.tb_compensacion_periodo po ON po.id = ci.id_periodo
    WHERE d.id = p_id_detalle_origen
      AND l.id_colaborador = p_id_colaborador
      AND d.id_concepto = p_id_concepto
      AND ci.estado_cierre = 'VIGENTE'
      AND po.periodo < v_periodo.periodo
  ) THEN
    RAISE EXCEPTION 'El detalle origen no pertenece a un cierre vigente anterior';
  END IF;

  IF p_id_detalle_origen IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'compensacion_ajuste:' || p_id_detalle_origen || ':' || v_naturaleza,
      0
    ));

    IF EXISTS (
      SELECT 1
      FROM public.tb_compensacion_ajuste a
      WHERE a.id_detalle_origen = p_id_detalle_origen
        AND a.naturaleza = v_naturaleza
        AND a.estado_ajuste IN ('PENDIENTE', 'APROBADO', 'APLICADO')
    ) THEN
      RAISE EXCEPTION 'El detalle origen ya tiene un ajuste vigente de la misma naturaleza';
    END IF;
  END IF;

  INSERT INTO public.tb_compensacion_ajuste (
    id_periodo_destino, id_colaborador, id_concepto, id_detalle_origen,
    naturaleza, monto, motivo, evidencia, estado_ajuste,
    id_usuario_solicita
  ) VALUES (
    p_id_periodo_destino, p_id_colaborador, p_id_concepto,
    p_id_detalle_origen, v_naturaleza, v_monto, v_motivo,
    p_evidencia, 'PENDIENTE', v_id_actor
  ) RETURNING id INTO v_id_ajuste;

  RETURN jsonb_build_object(
    'id', v_id_ajuste,
    'estado_ajuste', 'PENDIENTE',
    'monto', v_monto,
    'mensaje', 'Ajuste registrado para revision'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_ajuste_decidir(
  p_id_ajuste bigint,
  p_decision character varying,
  p_comentario text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_ajuste public.tb_compensacion_ajuste%ROWTYPE;
  v_periodo public.tb_compensacion_periodo%ROWTYPE;
  v_contexto jsonb;
  v_id_actor bigint;
  v_decision character varying(20) := UPPER(TRIM(COALESCE(p_decision, '')));
  v_comentario text := NULLIF(TRIM(p_comentario), '');
  v_estado character varying(20);
BEGIN
  SELECT * INTO v_ajuste
  FROM public.tb_compensacion_ajuste
  WHERE id = p_id_ajuste;

  IF v_ajuste.id IS NULL THEN
    RAISE EXCEPTION 'El ajuste no existe';
  END IF;

  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = v_ajuste.id_periodo_destino
  FOR UPDATE;

  SELECT * INTO v_ajuste
  FROM public.tb_compensacion_ajuste
  WHERE id = p_id_ajuste
  FOR UPDATE;

  IF v_periodo.estado_periodo NOT IN (
    'ABIERTO', 'EN_CALCULO', 'EN_REVISION', 'OBSERVADO', 'REABIERTO'
  ) THEN
    RAISE EXCEPTION 'El periodo destino no admite decisiones de ajustes';
  END IF;

  IF v_ajuste.estado_ajuste <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo un ajuste pendiente puede decidirse';
  END IF;

  IF v_decision NOT IN ('APROBADO', 'RECHAZADO') THEN
    RAISE EXCEPTION 'La decision debe ser APROBADO o RECHAZADO';
  END IF;

  IF v_decision = 'RECHAZADO' AND v_comentario IS NULL THEN
    RAISE EXCEPTION 'El motivo de rechazo es obligatorio';
  END IF;

  v_contexto := public.f_private_compensacion_liquidacion_validar_alcance(
    v_ajuste.id_colaborador, 'APROBAR', v_periodo.fecha_fin
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF v_id_actor = v_ajuste.id_usuario_solicita THEN
    RAISE EXCEPTION 'Quien solicito el ajuste no puede decidirlo';
  END IF;

  IF v_decision = 'APROBADO' AND EXISTS (
    SELECT 1
    FROM public.tb_compensacion_liquidacion l
    WHERE l.id_periodo = v_ajuste.id_periodo_destino
      AND l.id_colaborador = v_ajuste.id_colaborador
      AND l.estado_liquidacion IN ('APROBADA', 'PAGO_PARCIAL', 'PAGADA')
  ) THEN
    RAISE EXCEPTION
      'La liquidacion destino ya esta aprobada; use un periodo posterior para el ajuste';
  END IF;

  v_estado := CASE v_decision
    WHEN 'APROBADO' THEN 'APROBADO'
    ELSE 'RECHAZADO'
  END;

  UPDATE public.tb_compensacion_ajuste
  SET estado_ajuste = v_estado,
      id_usuario_aprueba = v_id_actor,
      fecha_aprobacion = now(),
      evidencia = CASE jsonb_typeof(evidencia)
        WHEN 'array' THEN evidencia || jsonb_build_array(jsonb_build_object(
          'tipo', 'REVISION',
          'decision', v_decision,
          'comentario', v_comentario,
          'id_usuario', v_id_actor,
          'fecha', now()
        ))
        ELSE jsonb_set(evidencia, '{revision}', jsonb_build_object(
          'decision', v_decision,
          'comentario', v_comentario,
          'id_usuario', v_id_actor,
          'fecha', now()
        ), true)
      END,
      fecha_actualizacion = now()
  WHERE id = p_id_ajuste;

  IF v_estado = 'APROBADO' THEN
    UPDATE public.tb_compensacion_periodo
    SET estado_periodo = 'OBSERVADO',
        fecha_aprobacion = NULL,
        id_usuario_actualiza = v_id_actor,
        fecha_actualizacion = now()
    WHERE id = v_periodo.id;
  END IF;

  RETURN jsonb_build_object(
    'id', p_id_ajuste,
    'estado_ajuste', v_estado,
    'id_usuario_aprueba', v_id_actor,
    'mensaje', CASE v_estado
      WHEN 'APROBADO' THEN 'Ajuste aprobado; el periodo requiere recalculo'
      ELSE 'Ajuste rechazado'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_ajuste_anular(
  p_id_ajuste bigint,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_ajuste public.tb_compensacion_ajuste%ROWTYPE;
  v_periodo public.tb_compensacion_periodo%ROWTYPE;
  v_contexto jsonb;
  v_id_actor bigint;
  v_motivo text := NULLIF(TRIM(p_motivo), '');
BEGIN
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'El motivo de anulacion es obligatorio';
  END IF;

  SELECT * INTO v_ajuste
  FROM public.tb_compensacion_ajuste
  WHERE id = p_id_ajuste;

  IF v_ajuste.id IS NULL THEN
    RAISE EXCEPTION 'El ajuste no existe';
  END IF;

  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = v_ajuste.id_periodo_destino
  FOR UPDATE;

  SELECT * INTO v_ajuste
  FROM public.tb_compensacion_ajuste
  WHERE id = p_id_ajuste
  FOR UPDATE;

  IF v_periodo.estado_periodo NOT IN (
    'ABIERTO', 'EN_CALCULO', 'EN_REVISION', 'OBSERVADO', 'REABIERTO'
  ) THEN
    RAISE EXCEPTION 'El periodo destino no permite anular ajustes';
  END IF;

  IF v_ajuste.estado_ajuste <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo un ajuste pendiente puede anularse';
  END IF;

  v_contexto := public.f_private_compensacion_liquidacion_validar_alcance(
    v_ajuste.id_colaborador, 'REGISTRAR', v_periodo.fecha_fin
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF v_id_actor <> v_ajuste.id_usuario_solicita
     AND (v_contexto ->> 'alcance') <> 'GLOBAL' THEN
    RAISE EXCEPTION 'Solo el solicitante o un acceso global puede anular el ajuste';
  END IF;

  UPDATE public.tb_compensacion_ajuste
  SET estado_ajuste = 'ANULADO',
      evidencia = CASE jsonb_typeof(evidencia)
        WHEN 'array' THEN evidencia || jsonb_build_array(jsonb_build_object(
          'tipo', 'ANULACION',
          'motivo', v_motivo,
          'id_usuario', v_id_actor,
          'fecha', now()
        ))
        ELSE jsonb_set(evidencia, '{anulacion}', jsonb_build_object(
          'motivo', v_motivo,
          'id_usuario', v_id_actor,
          'fecha', now()
        ), true)
      END,
      fecha_actualizacion = now()
  WHERE id = p_id_ajuste;

  RETURN jsonb_build_object(
    'id', p_id_ajuste,
    'estado_ajuste', 'ANULADO',
    'mensaje', 'Ajuste anulado'
  );
END;
$$;

-- ============================================================================
-- 10. PERMISOS RPC
-- ============================================================================

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_cierre_prevalidar(bigint, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_cierre_prevalidar(bigint, boolean)
  TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_cierre(bigint, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_cierre(bigint, boolean)
  TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_cierre_reabrir(bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_cierre_reabrir(bigint, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_cierre(bigint, bigint, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_cierre(bigint, bigint, boolean)
  TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_cierre_validar_integridad(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_cierre_validar_integridad(bigint)
  TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_ajuste_catalogo(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_ajuste_catalogo(bigint)
  TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_ajuste(
  bigint, bigint, bigint, character varying
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_ajuste(
  bigint, bigint, bigint, character varying
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_ajuste(
  bigint, bigint, bigint, character varying, numeric, text, bigint, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_ajuste(
  bigint, bigint, bigint, character varying, numeric, text, bigint, jsonb
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_ajuste_decidir(
  bigint, character varying, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_ajuste_decidir(
  bigint, character varying, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_ajuste_anular(bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_ajuste_anular(bigint, text)
  TO authenticated;

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
  'f_get_tb_compensacion_ajuste_catalogo'
)
ORDER BY n.nspname, p.proname;
