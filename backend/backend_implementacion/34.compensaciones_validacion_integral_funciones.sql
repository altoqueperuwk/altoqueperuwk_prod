-- ============================================================================
-- COMPENSACIONES - VALIDACION INTEGRAL Y CONCILIACION
-- ============================================================================
-- Objetivo:
--   Detectar inconsistencias estructurales, financieras, operativas y de
--   seguridad antes de habilitar un periodo o liberar el modulo. Todas las
--   funciones son de solo lectura y no recalculan ni corrigen resultados.
--
-- Dependencias:
--   17 al 33 del dominio de compensaciones.
-- ============================================================================

-- ============================================================================
-- 1. HALLAZGOS PRIVADOS NORMALIZADOS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_compensacion_validacion_hallazgos(
  p_id_periodo bigint DEFAULT NULL,
  p_incluir_advertencias boolean DEFAULT true
)
RETURNS TABLE (
  nivel text,
  codigo text,
  entidad text,
  id_referencia text,
  detalle jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH periodo AS (
    SELECT p.*
    FROM public.tb_compensacion_periodo p
    WHERE p_id_periodo IS NULL OR p.id = p_id_periodo
  ), liquidaciones AS (
    SELECT l.*
    FROM public.tb_compensacion_liquidacion l
    JOIN periodo pe ON pe.id = l.id_periodo
  ), liquidaciones_vigentes AS (
    SELECT l.*
    FROM liquidaciones l
    WHERE l.estado_liquidacion NOT IN ('REEMPLAZADA', 'ANULADA')
  ), detalle_liquidacion AS (
    SELECT
      l.id AS id_liquidacion,
      COALESCE(SUM(d.importe) FILTER (
        WHERE d.categoria_snapshot = 'SUELDO'
          AND d.naturaleza_snapshot = 'INGRESO'
      ), 0) AS sueldo,
      COALESCE(SUM(d.importe) FILTER (
        WHERE d.categoria_snapshot = 'BONO'
          AND d.naturaleza_snapshot = 'INGRESO'
      ), 0) AS bonos,
      COALESCE(SUM(d.importe) FILTER (
        WHERE d.categoria_snapshot = 'COMISION'
          AND d.naturaleza_snapshot = 'INGRESO'
      ), 0) AS comisiones,
      COALESCE(SUM(d.importe) FILTER (
        WHERE d.naturaleza_snapshot = 'DESCUENTO'
      ), 0) AS descuentos
    FROM liquidaciones_vigentes l
    LEFT JOIN public.tb_compensacion_liquidacion_detalle d
      ON d.id_liquidacion = l.id
    GROUP BY l.id
  ), pagos AS (
    SELECT
      p.id_liquidacion,
      COALESCE(SUM(
        CASE p.tipo_movimiento WHEN 'PAGO' THEN p.monto ELSE -p.monto END
      ), 0) AS total_pagado
    FROM public.tb_compensacion_pago p
    JOIN liquidaciones_vigentes l ON l.id = p.id_liquidacion
    GROUP BY p.id_liquidacion
  ), cierres AS (
    SELECT c.*
    FROM public.tb_compensacion_cierre c
    JOIN periodo pe ON pe.id = c.id_periodo
  ), hallazgos AS (
    SELECT
      'ERROR'::text AS nivel,
      'ASIGNACION_SOLAPADA'::text AS codigo,
      'tb_compensacion_asignacion'::text AS entidad,
      a1.id::text || ':' || a2.id::text AS id_referencia,
      jsonb_build_object(
        'id_colaborador', a1.id_colaborador,
        'primera', jsonb_build_object(
          'id', a1.id, 'inicio', a1.fecha_inicio, 'fin', a1.fecha_fin
        ),
        'segunda', jsonb_build_object(
          'id', a2.id, 'inicio', a2.fecha_inicio, 'fin', a2.fecha_fin
        )
      ) AS detalle
    FROM public.tb_compensacion_asignacion a1
    JOIN public.tb_compensacion_asignacion a2
      ON a2.id_colaborador = a1.id_colaborador
     AND a2.id > a1.id
     AND daterange(a1.fecha_inicio, COALESCE(a1.fecha_fin, 'infinity'::date), '[]')
         && daterange(a2.fecha_inicio, COALESCE(a2.fecha_fin, 'infinity'::date), '[]')
    WHERE p_id_periodo IS NULL OR EXISTS (
      SELECT 1 FROM periodo pe
      WHERE a1.fecha_inicio <= pe.fecha_fin
        AND COALESCE(a1.fecha_fin, pe.fecha_fin) >= pe.fecha_inicio
    )

    UNION ALL

    SELECT
      'ERROR',
      'PLAN_VERSION_SOLAPADA',
      'tb_compensacion_plan_version',
      v1.id::text || ':' || v2.id::text,
      jsonb_build_object(
        'id_plan', v1.id_plan,
        'primera_version', v1.numero_version,
        'segunda_version', v2.numero_version
      )
    FROM public.tb_compensacion_plan_version v1
    JOIN public.tb_compensacion_plan_version v2
      ON v2.id_plan = v1.id_plan
     AND v2.id > v1.id
     AND v1.estado_version IN ('PUBLICADA', 'RETIRADA')
     AND v2.estado_version IN ('PUBLICADA', 'RETIRADA')
     AND daterange(v1.fecha_inicio, COALESCE(v1.fecha_fin, 'infinity'::date), '[]')
         && daterange(v2.fecha_inicio, COALESCE(v2.fecha_fin, 'infinity'::date), '[]')
    WHERE p_id_periodo IS NULL OR EXISTS (
      SELECT 1 FROM periodo pe
      WHERE v1.fecha_inicio <= pe.fecha_fin
        AND COALESCE(v1.fecha_fin, pe.fecha_fin) >= pe.fecha_inicio
    )

    UNION ALL

    SELECT
      'ERROR',
      'LIQUIDACION_VIGENTE_DUPLICADA',
      'tb_compensacion_liquidacion',
      l.id_periodo::text || ':' || l.id_colaborador::text,
      jsonb_build_object('cantidad', COUNT(*), 'ids', jsonb_agg(l.id ORDER BY l.id))
    FROM liquidaciones_vigentes l
    GROUP BY l.id_periodo, l.id_colaborador
    HAVING COUNT(*) > 1

    UNION ALL

    SELECT
      'ERROR',
      'LIQUIDACION_DETALLE_DESCUADRADO',
      'tb_compensacion_liquidacion',
      l.id::text,
      jsonb_build_object(
        'cabecera', jsonb_build_object(
          'sueldo', l.total_sueldo,
          'bonos', l.total_bonos,
          'comisiones', l.total_comisiones,
          'descuentos', l.total_descuentos,
          'pagar', l.total_pagar
        ),
        'detalle', to_jsonb(d)
      )
    FROM liquidaciones_vigentes l
    JOIN detalle_liquidacion d ON d.id_liquidacion = l.id
    WHERE l.total_sueldo IS DISTINCT FROM d.sueldo
       OR l.total_bonos IS DISTINCT FROM d.bonos
       OR l.total_comisiones IS DISTINCT FROM d.comisiones
       OR l.total_descuentos IS DISTINCT FROM d.descuentos
       OR l.total_pagar IS DISTINCT FROM (
         d.sueldo + d.bonos + d.comisiones - d.descuentos
       )

    UNION ALL

    SELECT
      'ERROR',
      'PAGO_DESCUADRADO',
      'tb_compensacion_liquidacion',
      l.id::text,
      jsonb_build_object(
        'total_pagado_cabecera', l.total_pagado,
        'total_pagado_movimientos', COALESCE(p.total_pagado, 0),
        'total_pagar', l.total_pagar,
        'estado', l.estado_liquidacion,
        'estado_esperado', CASE
          WHEN COALESCE(p.total_pagado, 0) = 0 THEN 'APROBADA'
          WHEN COALESCE(p.total_pagado, 0) < l.total_pagar THEN 'PAGO_PARCIAL'
          ELSE 'PAGADA'
        END
      )
    FROM liquidaciones_vigentes l
    LEFT JOIN pagos p ON p.id_liquidacion = l.id
    WHERE l.total_pagado IS DISTINCT FROM COALESCE(p.total_pagado, 0)
       OR COALESCE(p.total_pagado, 0) < 0
       OR COALESCE(p.total_pagado, 0) > l.total_pagar
       OR (
         l.estado_liquidacion IN ('APROBADA', 'PAGO_PARCIAL', 'PAGADA')
         AND (
           (COALESCE(p.total_pagado, 0) = 0
             AND l.estado_liquidacion <> 'APROBADA')
           OR (COALESCE(p.total_pagado, 0) > 0
             AND COALESCE(p.total_pagado, 0) < l.total_pagar
             AND l.estado_liquidacion <> 'PAGO_PARCIAL')
           OR (l.total_pagar > 0
             AND COALESCE(p.total_pagado, 0) = l.total_pagar
             AND l.estado_liquidacion <> 'PAGADA')
         )
       )

    UNION ALL

    SELECT
      'ERROR',
      'PERIODO_CIERRE_INCONSISTENTE',
      'tb_compensacion_periodo',
      pe.id::text,
      jsonb_build_object(
        'estado_periodo', pe.estado_periodo,
        'cierres_vigentes', COUNT(c.id) FILTER (WHERE c.estado_cierre = 'VIGENTE')
      )
    FROM periodo pe
    LEFT JOIN public.tb_compensacion_cierre c ON c.id_periodo = pe.id
    GROUP BY pe.id, pe.estado_periodo
    HAVING (
      pe.estado_periodo = 'CERRADO'
      AND COUNT(c.id) FILTER (WHERE c.estado_cierre = 'VIGENTE') <> 1
    ) OR (
      pe.estado_periodo <> 'CERRADO'
      AND COUNT(c.id) FILTER (WHERE c.estado_cierre = 'VIGENTE') <> 0
    )

    UNION ALL

    SELECT
      'ERROR',
      'CIERRE_HASH_INVALIDO',
      'tb_compensacion_cierre',
      c.id::text,
      jsonb_build_object('hash_guardado', c.hash_integridad)
    FROM cierres c
    WHERE c.hash_integridad IS DISTINCT FROM md5(c.snapshot_resumen::text)

    UNION ALL

    SELECT
      'ERROR',
      'CIERRE_LIQUIDACION_HASH_INVALIDO',
      'tb_compensacion_cierre_liquidacion',
      cl.id::text,
      jsonb_build_object('id_cierre', cl.id_cierre, 'id_liquidacion', cl.id_liquidacion)
    FROM public.tb_compensacion_cierre_liquidacion cl
    JOIN cierres c ON c.id = cl.id_cierre
    WHERE cl.hash_integridad IS DISTINCT FROM md5(cl.detalle_snapshot::text)

    UNION ALL

    SELECT
      'ERROR',
      'CIERRE_TOTAL_DESCUADRADO',
      'tb_compensacion_cierre',
      c.id::text,
      jsonb_build_object(
        'cabecera', jsonb_build_object(
          'colaboradores', c.total_colaboradores,
          'pagar', c.total_pagar,
          'pagado', c.total_pagado,
          'pendiente', c.total_pendiente
        ),
        'detalle', jsonb_build_object(
          'colaboradores', x.colaboradores,
          'pagar', x.pagar,
          'pagado', x.pagado,
          'pendiente', x.pagar - x.pagado
        )
      )
    FROM cierres c
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
      WHERE cl.id_cierre = c.id
    ) x ON true
    WHERE c.total_colaboradores IS DISTINCT FROM x.colaboradores
       OR c.total_sueldo IS DISTINCT FROM x.sueldo
       OR c.total_bonos IS DISTINCT FROM x.bonos
       OR c.total_comisiones IS DISTINCT FROM x.comisiones
       OR c.total_descuentos IS DISTINCT FROM x.descuentos
       OR c.total_pagar IS DISTINCT FROM x.pagar
       OR c.total_pagado IS DISTINCT FROM x.pagado
       OR c.total_pendiente IS DISTINCT FROM x.pagar - x.pagado

    UNION ALL

    SELECT
      'ERROR',
      'CIERRE_SNAPSHOT_REPORTES_INCOMPLETO',
      'tb_compensacion_cierre',
      c.id::text,
      jsonb_build_object(
        'asistencia_tipo', jsonb_typeof(c.snapshot_resumen -> 'asistencia'),
        'productividad_tipo', jsonb_typeof(
          c.snapshot_resumen -> 'productividad' -> 'items'
        )
      )
    FROM cierres c
    WHERE c.estado_cierre = 'VIGENTE'
      AND (
        jsonb_typeof(c.snapshot_resumen -> 'asistencia') IS DISTINCT FROM 'array'
        OR jsonb_typeof(c.snapshot_resumen -> 'productividad' -> 'items')
          IS DISTINCT FROM 'array'
      )

    UNION ALL

    SELECT
      'ERROR',
      'EVENTO_APROBADO_INCOMPLETO',
      'tb_compensacion_evento',
      ev.id::text,
      jsonb_build_object(
        'estado', ev.estado_evento,
        'id_regla', ev.id_regla_aplicada,
        'importe', ev.importe_aprobado
      )
    FROM public.tb_compensacion_evento ev
    JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
    WHERE (p_id_periodo IS NULL OR ev.periodo_imputacion = (
      SELECT pe.periodo FROM periodo pe LIMIT 1
    ))
      AND ev.estado_evento IN ('APROBADO', 'LIQUIDADO')
      AND te.categoria NOT IN ('PENALIDAD', 'AUDITORIA_PAGO')
      AND (
        ev.id_regla_aplicada IS NULL
        OR ev.importe_aprobado IS NULL
        OR ev.criterios_validacion_snapshot = '{}'::jsonb
      )

    UNION ALL

    SELECT
      'ERROR',
      'REFERIDO_VALIDADO_INCONSISTENTE',
      'tb_compensacion_referido',
      r.id::text,
      jsonb_build_object(
        'id_evento', r.id_evento,
        'operaciones_elegibles', COUNT(ro.id),
        'importe_evento', ev.importe_aprobado,
        'importe_operacion', MAX(ro.importe_comision)
      )
    FROM public.tb_compensacion_referido r
    JOIN public.tb_compensacion_evento ev ON ev.id = r.id_evento
    LEFT JOIN public.tb_compensacion_referido_operacion ro
      ON ro.id_referido = r.id AND ro.es_elegible
    WHERE r.estado_referido = 'VALIDADO'
      AND (p_id_periodo IS NULL OR ev.periodo_imputacion = (
        SELECT pe.periodo FROM periodo pe LIMIT 1
      ))
    GROUP BY r.id, r.id_evento, ev.importe_aprobado
    HAVING COUNT(ro.id) <> 1
       OR MAX(ro.importe_comision) IS DISTINCT FROM ev.importe_aprobado

    UNION ALL

    SELECT
      'ERROR',
      'EXPORTACION_INCONSISTENTE',
      'tb_compensacion_exportacion',
      e.id::text,
      jsonb_build_object(
        'estado', e.estado_exportacion,
        'id_cierre', e.id_cierre,
        'hash_archivo', e.hash_archivo
      )
    FROM public.tb_compensacion_exportacion e
    JOIN periodo pe ON pe.id = e.id_periodo
    LEFT JOIN public.tb_compensacion_cierre c ON c.id = e.id_cierre
    WHERE (e.id_cierre IS NOT NULL AND c.id_periodo IS DISTINCT FROM e.id_periodo)
       OR (e.estado_exportacion = 'GENERADA'
           AND BTRIM(COALESCE(e.hash_archivo, '')) = '')
       OR (e.estado_exportacion = 'ERROR'
           AND BTRIM(COALESCE(e.mensaje_error, '')) = '')
       OR (e.estado_exportacion = 'ANULADA' AND (
         e.id_usuario_anula IS NULL
         OR e.fecha_anulacion IS NULL
         OR BTRIM(COALESCE(e.motivo_anulacion, '')) = ''
       ))

    UNION ALL

    SELECT
      'ERROR',
      'EXPORTACION_IDEMPOTENCIA_DUPLICADA',
      'tb_compensacion_exportacion',
      e.id_usuario::text || ':' || e.clave_idempotencia,
      jsonb_build_object(
        'id_periodo', e.id_periodo,
        'tipo_reporte', e.tipo_reporte,
        'formato', e.formato,
        'cantidad', COUNT(*)
      )
    FROM public.tb_compensacion_exportacion e
    JOIN periodo pe ON pe.id = e.id_periodo
    WHERE e.clave_idempotencia IS NOT NULL
    GROUP BY
      e.id_usuario, e.id_periodo, e.tipo_reporte, e.formato,
      e.clave_idempotencia
    HAVING COUNT(*) > 1

    UNION ALL

    SELECT
      'ERROR',
      'FUNCION_COMPENSACION_ACOPLADA_A_CAJA',
      'pg_proc',
      p.oid::text,
      jsonb_build_object('funcion', p.proname)
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname LIKE 'f\_%compensacion%' ESCAPE '\'
      AND p.proname <> 'f_private_compensacion_validacion_hallazgos'
      AND (
        pg_get_functiondef(p.oid) ILIKE '%tb_caja_%'
        OR pg_get_functiondef(p.oid) ILIKE '%f_post_tb_operacion_caja%'
      )

    UNION ALL

    SELECT
      'ERROR',
      'FUNCION_COMPENSACION_SIN_SECURITY_DEFINER',
      'pg_proc',
      p.oid::text,
      jsonb_build_object('funcion', p.proname)
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname LIKE 'f\_%compensacion%' ESCAPE '\'
      AND NOT p.prosecdef

    UNION ALL

    SELECT
      'ERROR',
      'FUNCION_COMPENSACION_EJECUTABLE_POR_ANON',
      'pg_proc',
      p.oid::text,
      jsonb_build_object('funcion', p.proname)
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname LIKE 'f\_%compensacion%' ESCAPE '\'
      AND to_regrole('anon') IS NOT NULL
      AND has_function_privilege('anon', p.oid, 'EXECUTE')

    UNION ALL

    SELECT
      'ADVERTENCIA',
      'SOLICITUDES_ASISTENCIA_PENDIENTES',
      'tb_asistencia_solicitud',
      pe.id::text,
      jsonb_build_object('cantidad', COUNT(*))
    FROM periodo pe
    JOIN public.tb_asistencia_jornada j
      ON j.fecha BETWEEN pe.fecha_inicio AND pe.fecha_fin
    JOIN public.tb_asistencia_solicitud s ON s.id_jornada = j.id
    WHERE p_incluir_advertencias AND s.estado_solicitud = 'PENDIENTE'
    GROUP BY pe.id
    HAVING COUNT(*) > 0

    UNION ALL

    SELECT
      'ADVERTENCIA',
      'EVENTOS_PENDIENTES',
      'tb_compensacion_evento',
      pe.id::text,
      jsonb_build_object('cantidad', COUNT(*))
    FROM periodo pe
    JOIN public.tb_compensacion_evento ev ON ev.periodo_imputacion = pe.periodo
    WHERE p_incluir_advertencias AND ev.estado_evento = 'PENDIENTE'
    GROUP BY pe.id
    HAVING COUNT(*) > 0

    UNION ALL

    SELECT
      'ADVERTENCIA',
      'LIQUIDACIONES_PENDIENTES_APROBACION',
      'tb_compensacion_liquidacion',
      l.id_periodo::text,
      jsonb_build_object('cantidad', COUNT(*))
    FROM liquidaciones_vigentes l
    WHERE p_incluir_advertencias
      AND l.estado_liquidacion IN ('BORRADOR', 'CALCULADA', 'OBSERVADA')
    GROUP BY l.id_periodo
    HAVING COUNT(*) > 0

    UNION ALL

    SELECT
      'ADVERTENCIA',
      'USUARIO_GESTOR_SIN_FICHA',
      'tb_usuario',
      pe.id::text || ':' || u.id::text,
      jsonb_build_object(
        'id_periodo', pe.id,
        'periodo', pe.periodo,
        'id_usuario', u.id,
        'usuario', u.nombre,
        'operaciones_pagadas', COUNT(*),
        'mensaje', 'El usuario tiene operaciones pagadas pero no una ficha de compensaciones vinculada'
      )
    FROM periodo pe
    JOIN public.tb_operacion_proceso op
      ON UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
     AND (
       COALESCE(op.fecha_pagado, op.fecha_deposito_cliente, op.fecha_registro)
       AT TIME ZONE pe.zona_horaria
     )::date BETWEEN pe.fecha_inicio AND pe.fecha_fin
    JOIN public.tb_usuario u
      ON u.id = COALESCE(op.id_usuario_gestor, op.id_usuario)
    LEFT JOIN public.tb_compensacion_colaborador c ON c.id_usuario = u.id
    WHERE p_incluir_advertencias
      AND c.id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.tb_operacion_proceso_eliminada oe
        WHERE oe.id_operacion_proceso = op.id
      )
      AND EXISTS (
        SELECT 1
        FROM public.tb_compensacion_regla r
        JOIN public.tb_compensacion_plan_version pv
          ON pv.id = r.id_plan_version
        WHERE pv.estado_version = 'PUBLICADA'
          AND r.configuracion ->> 'fuente_operacion' = 'OPERACION_PAGADA_GESTOR'
          AND pv.fecha_inicio <= pe.fecha_fin
          AND (pv.fecha_fin IS NULL OR pv.fecha_fin >= pe.fecha_inicio)
      )
    GROUP BY pe.id, pe.periodo, u.id, u.nombre

    UNION ALL

    SELECT
      'ADVERTENCIA',
      'USUARIO_REGISTRO_SIN_FICHA',
      'tb_usuario',
      pe.id::text || ':' || u.id::text,
      jsonb_build_object(
        'id_periodo', pe.id,
        'periodo', pe.periodo,
        'id_usuario', u.id,
        'usuario', u.nombre,
        'clientes_elegibles', COUNT(DISTINCT cli.id),
        'mensaje', 'El usuario registro clientes efectivizados pero no tiene una ficha de compensaciones vinculada'
      )
    FROM periodo pe
    JOIN public.tb_cliente cli ON true
    JOIN public.tb_usuario u ON u.id = cli.id_usuario
    JOIN LATERAL (
      SELECT op.id, COALESCE(
        op.fecha_pagado,
        op.fecha_deposito_cliente,
        op.fecha_registro
      ) AS fecha_atribucion
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
    ) primera ON (
      primera.fecha_atribucion AT TIME ZONE pe.zona_horaria
    )::date BETWEEN pe.fecha_inicio AND pe.fecha_fin
    LEFT JOIN public.tb_compensacion_colaborador c ON c.id_usuario = u.id
    WHERE p_incluir_advertencias
      AND c.id IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.tb_compensacion_regla r
        JOIN public.tb_compensacion_plan_version pv
          ON pv.id = r.id_plan_version
        WHERE pv.estado_version = 'PUBLICADA'
          AND r.configuracion ->> 'fuente_operacion' = 'CLIENTE_NUEVO_EFECTIVIZADO_7_DIAS'
          AND pv.fecha_inicio <= pe.fecha_fin
          AND (pv.fecha_fin IS NULL OR pv.fecha_fin >= pe.fecha_inicio)
      )
    GROUP BY pe.id, pe.periodo, u.id, u.nombre

    UNION ALL

    SELECT
      'ADVERTENCIA',
      'SALDOS_PENDIENTES',
      'tb_compensacion_liquidacion',
      l.id_periodo::text,
      jsonb_build_object(
        'liquidaciones', COUNT(*),
        'monto', SUM(l.total_pagar - l.total_pagado)
      )
    FROM liquidaciones_vigentes l
    WHERE p_incluir_advertencias
      AND l.estado_liquidacion IN ('APROBADA', 'PAGO_PARCIAL')
      AND l.total_pagar > l.total_pagado
    GROUP BY l.id_periodo
    HAVING SUM(l.total_pagar - l.total_pagado) > 0

    UNION ALL

    SELECT
      'ADVERTENCIA',
      'EXPORTACIONES_CON_ERROR',
      'tb_compensacion_exportacion',
      e.id_periodo::text,
      jsonb_build_object('cantidad', COUNT(*))
    FROM public.tb_compensacion_exportacion e
    JOIN periodo pe ON pe.id = e.id_periodo
    WHERE p_incluir_advertencias AND e.estado_exportacion = 'ERROR'
    GROUP BY e.id_periodo
    HAVING COUNT(*) > 0
  )
  SELECT h.nivel, h.codigo, h.entidad, h.id_referencia, h.detalle
  FROM hallazgos h;
$$;

REVOKE ALL ON FUNCTION public.f_private_compensacion_validacion_hallazgos(
  bigint, boolean
) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. VALIDACION INTEGRAL ADMINISTRATIVA
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_validacion_integral(
  p_id_periodo bigint DEFAULT NULL,
  p_incluir_advertencias boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_errores integer;
  v_advertencias integer;
  v_hallazgos jsonb;
  v_periodo jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('REPORTES', 'CONSULTAR');
  IF v_contexto ->> 'alcance' <> 'GLOBAL' THEN
    RAISE EXCEPTION 'La validacion integral requiere alcance GLOBAL';
  END IF;

  IF p_id_periodo IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', p.id,
      'periodo', p.periodo,
      'nombre', p.nombre,
      'estado', p.estado_periodo
    ) INTO v_periodo
    FROM public.tb_compensacion_periodo p
    WHERE p.id = p_id_periodo;

    IF v_periodo IS NULL THEN
      RAISE EXCEPTION 'El periodo no existe';
    END IF;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE h.nivel = 'ERROR'),
    COUNT(*) FILTER (WHERE h.nivel = 'ADVERTENCIA'),
    COALESCE(
      jsonb_agg(to_jsonb(h) ORDER BY h.nivel, h.codigo, h.id_referencia),
      '[]'::jsonb
    )
  INTO v_errores, v_advertencias, v_hallazgos
  FROM public.f_private_compensacion_validacion_hallazgos(
    p_id_periodo,
    p_incluir_advertencias
  ) h;

  RETURN jsonb_build_object(
    'resultado', CASE
      WHEN v_errores > 0 THEN 'BLOQUEADO'
      WHEN v_advertencias > 0 THEN 'CON_ADVERTENCIAS'
      ELSE 'APROBADO'
    END,
    'fecha_validacion', now(),
    'periodo', v_periodo,
    'resumen', jsonb_build_object(
      'errores', v_errores,
      'advertencias', v_advertencias,
      'hallazgos', v_errores + v_advertencias
    ),
    'hallazgos', v_hallazgos
  );
END;
$$;

-- ============================================================================
-- 3. CONCILIACION FINANCIERA POR PERIODO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_conciliacion_periodo(
  p_id_periodo bigint,
  p_id_sucursal bigint DEFAULT NULL,
  p_id_colaborador bigint DEFAULT NULL,
  p_solo_diferencias boolean DEFAULT false
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
  v_resumen jsonb;
  v_items jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_reporte_contexto(
    p_id_periodo, 'CONSULTAR', p_id_sucursal, p_id_colaborador
  );
  v_id_sucursal := NULLIF(v_contexto ->> 'id_sucursal_efectiva', '')::bigint;
  v_id_colaborador := NULLIF(v_contexto ->> 'id_colaborador_efectivo', '')::bigint;
  v_id_cierre := NULLIF(v_contexto ->> 'id_cierre_vigente', '')::bigint;

  WITH base AS (
    SELECT *
    FROM public.f_private_compensacion_reporte_liquidaciones(p_id_periodo)
    WHERE (v_id_sucursal IS NULL OR id_sucursal = v_id_sucursal)
      AND (v_id_colaborador IS NULL OR id_colaborador = v_id_colaborador)
  ), detalle AS (
    SELECT
      d.id_liquidacion,
      COALESCE(SUM(d.importe) FILTER (
        WHERE d.categoria = 'SUELDO' AND d.naturaleza = 'INGRESO'
      ), 0) AS sueldo,
      COALESCE(SUM(d.importe) FILTER (
        WHERE d.categoria = 'BONO' AND d.naturaleza = 'INGRESO'
      ), 0) AS bonos,
      COALESCE(SUM(d.importe) FILTER (
        WHERE d.categoria = 'COMISION' AND d.naturaleza = 'INGRESO'
      ), 0) AS comisiones,
      COALESCE(SUM(d.importe) FILTER (WHERE d.naturaleza = 'DESCUENTO'), 0)
        AS descuentos
    FROM public.f_private_compensacion_reporte_detalles(p_id_periodo) d
    JOIN base b ON b.id_liquidacion = d.id_liquidacion
    GROUP BY d.id_liquidacion
  ), movimientos AS (
    SELECT
      b.id_liquidacion,
      CASE WHEN p.value ->> 'tipo_movimiento' = 'REVERSA'
        THEN -(p.value ->> 'monto')::numeric
        ELSE (p.value ->> 'monto')::numeric
      END AS monto_neto
    FROM base b
    JOIN public.tb_compensacion_cierre_liquidacion cl
      ON cl.id_cierre = v_id_cierre
     AND cl.id_liquidacion = b.id_liquidacion
    CROSS JOIN LATERAL jsonb_array_elements(cl.detalle_snapshot -> 'pagos') p(value)
    WHERE v_id_cierre IS NOT NULL

    UNION ALL

    SELECT
      b.id_liquidacion,
      CASE p.tipo_movimiento WHEN 'PAGO' THEN p.monto ELSE -p.monto END
    FROM base b
    JOIN public.tb_compensacion_pago p ON p.id_liquidacion = b.id_liquidacion
    WHERE v_id_cierre IS NULL
  ), pagos AS (
    SELECT id_liquidacion, COALESCE(SUM(monto_neto), 0) AS total_pagado
    FROM movimientos
    GROUP BY id_liquidacion
  ), comparacion AS (
    SELECT
      b.*,
      COALESCE(d.sueldo, 0) AS sueldo_detalle,
      COALESCE(d.bonos, 0) AS bonos_detalle,
      COALESCE(d.comisiones, 0) AS comisiones_detalle,
      COALESCE(d.descuentos, 0) AS descuentos_detalle,
      COALESCE(p.total_pagado, 0) AS pagado_movimientos,
      diferencias.codigos AS diferencias,
      jsonb_array_length(diferencias.codigos) = 0 AS es_consistente
    FROM base b
    LEFT JOIN detalle d ON d.id_liquidacion = b.id_liquidacion
    LEFT JOIN pagos p ON p.id_liquidacion = b.id_liquidacion
    CROSS JOIN LATERAL (
      SELECT COALESCE(jsonb_agg(v.codigo ORDER BY v.codigo), '[]'::jsonb) AS codigos
      FROM (VALUES
        ('SUELDO', b.total_sueldo IS DISTINCT FROM COALESCE(d.sueldo, 0)),
        ('BONOS', b.total_bonos IS DISTINCT FROM COALESCE(d.bonos, 0)),
        ('COMISIONES', b.total_comisiones IS DISTINCT FROM COALESCE(d.comisiones, 0)),
        ('DESCUENTOS', b.total_descuentos IS DISTINCT FROM COALESCE(d.descuentos, 0)),
        ('TOTAL_PAGAR', b.total_pagar IS DISTINCT FROM (
          COALESCE(d.sueldo, 0) + COALESCE(d.bonos, 0)
          + COALESCE(d.comisiones, 0) - COALESCE(d.descuentos, 0)
        )),
        ('TOTAL_PAGADO', b.total_pagado IS DISTINCT FROM COALESCE(p.total_pagado, 0)),
        ('SALDO', b.total_pendiente IS DISTINCT FROM b.total_pagar - b.total_pagado)
      ) v(codigo, incumple)
      WHERE v.incumple
    ) diferencias
  ), filtrado AS (
    SELECT *
    FROM comparacion
    WHERE NOT COALESCE(p_solo_diferencias, false) OR NOT es_consistente
  )
  SELECT
    (SELECT jsonb_build_object(
      'liquidaciones', COUNT(*),
      'liquidaciones_consistentes', COUNT(*) FILTER (WHERE es_consistente),
      'liquidaciones_con_diferencias', COUNT(*) FILTER (WHERE NOT es_consistente),
      'total_sueldo', COALESCE(SUM(total_sueldo), 0),
      'total_bonos', COALESCE(SUM(total_bonos), 0),
      'total_comisiones', COALESCE(SUM(total_comisiones), 0),
      'total_descuentos', COALESCE(SUM(total_descuentos), 0),
      'total_pagar', COALESCE(SUM(total_pagar), 0),
      'total_pagado', COALESCE(SUM(total_pagado), 0),
      'total_pendiente', COALESCE(SUM(total_pendiente), 0)
    ) FROM comparacion),
    COALESCE((
      SELECT jsonb_agg(to_jsonb(f) ORDER BY colaborador_nombre, id_colaborador)
      FROM filtrado f
    ), '[]'::jsonb)
  INTO v_resumen, v_items;

  RETURN jsonb_build_object(
    'periodo', v_contexto -> 'periodo',
    'fuente', v_contexto -> 'fuente_reporte',
    'filtros', jsonb_build_object(
      'id_sucursal', v_id_sucursal,
      'id_colaborador', v_id_colaborador,
      'solo_diferencias', COALESCE(p_solo_diferencias, false)
    ),
    'resumen', v_resumen,
    'items', v_items
  );
END;
$$;

-- ============================================================================
-- PERMISOS
-- ============================================================================

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_validacion_integral(
  bigint, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_validacion_integral(
  bigint, boolean
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_conciliacion_periodo(
  bigint, bigint, bigint, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_conciliacion_periodo(
  bigint, bigint, bigint, boolean
) TO authenticated;

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_private_compensacion_validacion_hallazgos'
)
ORDER BY n.nspname, p.proname;
