-- ============================================================================
-- 15. DASHBOARD DE METRICAS PARA PAGO DEUDA, POS Y LINK PAGO
-- ============================================================================

/*
Dominio analitico de solo lectura.

Reglas principales:
  - no modifica las funciones operativas cerradas;
  - Pago Deuda usa solo solicitudes raiz y fecha_registro;
  - POS y Link Pago usan ruta_origen y fecha_registro;
  - la sede pertenece al usuario solicitante;
  - las metricas financieras de POS/Link Pago solo consideran Pagado;
  - las fechas se interpretan en America/Lima.
*/

CREATE OR REPLACE FUNCTION public.f_get_dashboard_metricas_servicios_hechos(
  p_servicio character varying,
  p_fecha_desde date,
  p_fecha_hasta date,
  p_id_usuario_consulta bigint,
  p_id_sucursal bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_banco_cliente bigint DEFAULT NULL,
  p_id_banco_destino bigint DEFAULT NULL,
  p_id_pos bigint DEFAULT NULL
)
RETURNS TABLE (
  servicio character varying,
  id_operacion bigint,
  fecha_operacion date,
  id_cliente bigint,
  fecha_cliente_registro date,
  cliente_nuevo boolean,
  id_usuario_solicitud bigint,
  usuario_solicitud character varying,
  id_sucursal bigint,
  sucursal character varying,
  id_estado bigint,
  estado character varying,
  id_banco_cliente bigint,
  entidad_tarjeta character varying,
  id_banco_destino bigint,
  banco_destino character varying,
  id_pos bigint,
  pos character varying,
  id_empresa_salida bigint,
  empresa_salida character varying,
  id_cuenta_salida bigint,
  cuenta_salida character varying,
  pagada boolean,
  procesada boolean,
  atendida boolean,
  paso4 boolean,
  monto_procesado numeric,
  monto_atendido numeric,
  comisiones numeric,
  gastos numeric,
  ganancias numeric,
  salidas numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH servicio_config AS (
    SELECT CASE
      WHEN REPLACE(LOWER(BTRIM(COALESCE(p_servicio, ''))), '-', '') IN ('pagodeuda', 'deuda') THEN 'pago-deuda'
      WHEN LOWER(BTRIM(COALESCE(p_servicio, ''))) = 'pos' THEN 'pos'
      WHEN REPLACE(LOWER(BTRIM(COALESCE(p_servicio, ''))), '-', '') = 'linkpago' THEN 'linkpago'
      ELSE NULL
    END::character varying AS servicio
  ), consulta AS (
    SELECT
      u.id,
      u.id_sucursal,
      COALESCE(u.flag_super_admin, false)
        OR u.id_rol = 1
        OR UPPER(BTRIM(COALESCE(r.nombre, ''))) = 'ADMINISTRADOR' AS es_administrador,
      u.id_rol = 3
        OR UPPER(BTRIM(COALESCE(r.nombre, ''))) = 'JEFE DE TIENDA' AS es_jefe_tienda
    FROM public.tb_usuario u
    LEFT JOIN public.tb_rol r ON r.id = u.id_rol
    WHERE u.id = p_id_usuario_consulta
  ), base AS (
    SELECT
      sc.servicio,
      op.*,
      solicitante.id_sucursal AS id_sucursal_solicitud,
      COALESCE(s.nombre, 'Sin sede')::character varying AS nombre_sucursal_solicitud,
      COALESCE(op.nombre_usuario_solicitud, solicitante.nombre, solicitante.username, 'Sin usuario')::character varying AS usuario_solicitud_resuelto,
      (op.fecha_registro AT TIME ZONE 'America/Lima')::date AS fecha_operacion_local,
      (cl.fecha_registro AT TIME ZONE 'America/Lima')::date AS fecha_cliente_local,
      EXISTS (
        SELECT 1
        FROM public.tb_operacion_caja oc
        WHERE oc.id_operacion_proceso = op.id
          AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) = 'PAGO_DEUDA_COMISION'
      ) AS tiene_comision_registrada
    FROM public.tb_operacion_proceso op
    CROSS JOIN servicio_config sc
    CROSS JOIN consulta c
    LEFT JOIN public.tb_usuario solicitante ON solicitante.id = op.id_usuario_solicitud
    LEFT JOIN public.tb_sucursal s ON s.id = solicitante.id_sucursal
    LEFT JOIN public.tb_cliente cl ON cl.id = op.id_cliente
    WHERE sc.servicio IS NOT NULL
      AND p_fecha_desde IS NOT NULL
      AND p_fecha_hasta IS NOT NULL
      AND p_fecha_desde <= p_fecha_hasta
      AND p_fecha_hasta - p_fecha_desde <= 731
      AND (op.fecha_registro AT TIME ZONE 'America/Lima')::date BETWEEN p_fecha_desde AND p_fecha_hasta
      AND COALESCE(op.id_estado, 0) <> 10
      AND (
        (sc.servicio = 'pago-deuda'
          AND op.id_operacion_padre IS NULL
          AND UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) = 'SOLICITUD')
        OR (sc.servicio IN ('pos', 'linkpago')
          AND LOWER(BTRIM(COALESCE(op.ruta_origen, ''))) = sc.servicio)
      )
      AND (
        c.es_administrador
        OR (c.es_jefe_tienda AND c.id_sucursal IS NOT NULL AND solicitante.id_sucursal = c.id_sucursal)
        OR op.id_usuario_solicitud = c.id
      )
      AND (p_id_sucursal IS NULL OR solicitante.id_sucursal = p_id_sucursal)
      AND (p_id_estado IS NULL OR op.id_estado = p_id_estado)
      AND (p_id_banco_cliente IS NULL OR op.id_banco_cliente = p_id_banco_cliente)
      AND (p_id_banco_destino IS NULL OR op.id_banco_cliente_transferencia = p_id_banco_destino)
      AND (p_id_pos IS NULL OR op.id_pos = p_id_pos)
  )
  SELECT
    b.servicio,
    b.id,
    b.fecha_operacion_local,
    b.id_cliente,
    b.fecha_cliente_local,
    b.id_cliente IS NOT NULL
      AND b.fecha_cliente_local BETWEEN p_fecha_desde AND p_fecha_hasta AS cliente_nuevo,
    b.id_usuario_solicitud,
    b.usuario_solicitud_resuelto,
    b.id_sucursal_solicitud,
    b.nombre_sucursal_solicitud,
    b.id_estado,
    COALESCE(b.nombre_estado, 'Sin estado')::character varying,
    b.id_banco_cliente,
    COALESCE(b.nombre_banco_cliente, 'Sin entidad')::character varying,
    b.id_banco_cliente_transferencia,
    COALESCE(b.nombre_banco_cliente_transferencia, b.nombre_banco_empresa_cuenta_salida, 'Sin destino')::character varying,
    b.id_pos,
    COALESCE(b.nombre_pos, 'Sin POS')::character varying,
    b.id_empresa_salida,
    COALESCE(b.nombre_empresa_salida, 'Sin empresa')::character varying,
    b.id_empresa_cuenta_salida,
    COALESCE(b.nombre_banco_empresa_cuenta_salida, 'Sin cuenta')::character varying,
    UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) = 'PAGADO',
    CASE
      WHEN b.servicio = 'pago-deuda' THEN UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) IN ('PROCESADO', 'PAGADO')
      ELSE UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) = 'PAGADO'
    END,
    CASE
      WHEN b.servicio = 'pago-deuda' THEN
        b.id_operacion_match IS NOT NULL
        OR COALESCE(b.monto_devuelto, 0) > 0
        OR UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) = 'PAGADO'
      ELSE UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) = 'PAGADO'
    END,
    CASE
      WHEN b.servicio = 'pago-deuda' THEN b.tiene_comision_registrada
      ELSE UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) = 'PAGADO'
    END,
    CASE
      WHEN b.servicio = 'pago-deuda' THEN COALESCE(b.monto_deposito_cliente, 0)
      WHEN UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) = 'PAGADO'
        THEN COALESCE(b.monto_deposito_cliente, 0)
      ELSE 0
    END::numeric,
    CASE
      WHEN b.servicio = 'pago-deuda' THEN CASE
        WHEN b.id_operacion_match IS NOT NULL
          OR COALESCE(b.monto_devuelto, 0) >= COALESCE(b.monto_deposito_cliente, 0)
        THEN COALESCE(b.monto_deposito_cliente, 0)
        ELSE COALESCE(b.monto_devuelto, 0)
      END
      WHEN UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) = 'PAGADO'
      THEN COALESCE(b.monto_transferencia_cliente, 0)
      ELSE 0
    END::numeric,
    CASE WHEN UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) = 'PAGADO'
      THEN COALESCE(b.resultado_comision_servicio, 0) ELSE 0 END::numeric,
    CASE WHEN b.servicio IN ('pos', 'linkpago')
      AND UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) = 'PAGADO'
      THEN COALESCE(b.resultado_comision_banco_ingreso, 0)
        + COALESCE(b.resultado_comision_banco_salida, 0)
      ELSE 0 END::numeric,
    CASE WHEN UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) = 'PAGADO'
      THEN COALESCE(b.resultado_comision_servicio, 0)
        - CASE WHEN b.servicio IN ('pos', 'linkpago')
            THEN COALESCE(b.resultado_comision_banco_ingreso, 0)
              + COALESCE(b.resultado_comision_banco_salida, 0)
            ELSE 0 END
      ELSE 0 END::numeric,
    CASE WHEN b.servicio IN ('pos', 'linkpago')
      AND UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) = 'PAGADO'
      THEN COALESCE(b.monto_transferencia_cliente, 0)
      ELSE 0 END::numeric
  FROM base b;
$$;

CREATE OR REPLACE FUNCTION public.f_get_dashboard_metricas_servicios_resumen(
  p_servicio character varying,
  p_fecha_desde date,
  p_fecha_hasta date,
  p_id_usuario_consulta bigint,
  p_id_sucursal bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_banco_cliente bigint DEFAULT NULL,
  p_id_banco_destino bigint DEFAULT NULL,
  p_id_pos bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH h AS (
    SELECT * FROM public.f_get_dashboard_metricas_servicios_hechos(
      p_servicio, p_fecha_desde, p_fecha_hasta, p_id_usuario_consulta,
      p_id_sucursal, p_id_estado, p_id_banco_cliente, p_id_banco_destino, p_id_pos
    )
  ), a AS (
    SELECT
      COALESCE(MAX(servicio), CASE
        WHEN REPLACE(LOWER(BTRIM(COALESCE(p_servicio, ''))), '-', '') IN ('pagodeuda', 'deuda') THEN 'pago-deuda'
        ELSE REPLACE(LOWER(BTRIM(COALESCE(p_servicio, ''))), '-', '')
      END)::character varying AS servicio,
      COUNT(*)::bigint AS operaciones,
      COUNT(*) FILTER (WHERE pagada)::bigint AS pagadas,
      COUNT(*) FILTER (
        WHERE CASE
          -- En Pago Deuda solo son pendientes las solicitudes anteriores a
          -- la confirmacion de la devolucion (etapas operativas 1 y 2).
          WHEN servicio = 'pago-deuda' THEN NOT atendida
          ELSE NOT pagada
        END
      )::bigint AS pendientes,
      COUNT(*) FILTER (
        -- Una devolucion confirmada sin comision registrada aun requiere
        -- asignar/finalizar la empresa que recibira dicha comision.
        WHERE servicio = 'pago-deuda' AND atendida AND NOT paso4
      )::bigint AS sin_empresa_comision,
      COUNT(DISTINCT h.id_cliente) FILTER (WHERE cliente_nuevo)::bigint AS clientes_nuevos,
      COALESCE(SUM(monto_procesado), 0)::numeric AS monto_procesado,
      COALESCE(SUM(monto_atendido), 0)::numeric AS monto_atendido,
      COALESCE(SUM(comisiones), 0)::numeric AS comisiones,
      COALESCE(SUM(gastos), 0)::numeric AS gastos,
      COALESCE(SUM(ganancias), 0)::numeric AS ganancias,
      COALESCE(SUM(salidas), 0)::numeric AS salidas,
      -- Mantener el mismo universo que el conteo de pendientes de cada servicio.
      COALESCE(SUM(CASE
        WHEN h.servicio = 'pago-deuda' AND NOT h.atendida
          THEN GREATEST(h.monto_procesado - h.monto_atendido, 0)
        WHEN h.servicio IN ('pos', 'linkpago') AND NOT h.pagada
          THEN GREATEST(COALESCE(op.monto_transferencia_cliente, 0), 0)
        ELSE 0
      END), 0)::numeric AS pendiente_transferencia
    FROM h
    LEFT JOIN public.tb_operacion_proceso op ON op.id = h.id_operacion
  )
  SELECT jsonb_build_object(
    'servicio', a.servicio,
    'periodo', jsonb_build_object('desde', p_fecha_desde, 'hasta', p_fecha_hasta),
    'actual', jsonb_build_object(
      'operaciones', a.operaciones,
      'pagadas', a.pagadas,
      'pendientes', a.pendientes,
      'sin_empresa_comision', a.sin_empresa_comision,
      'monto_procesado', a.monto_procesado,
      'monto_atendido', a.monto_atendido,
      'comisiones', a.comisiones,
      'gastos', a.gastos,
      'ganancias', a.ganancias,
      'salidas', a.salidas,
      'pendiente_transferencia', a.pendiente_transferencia,
      'clientes_nuevos', a.clientes_nuevos,
      'tasa_exito', CASE WHEN a.operaciones > 0 THEN ROUND(
        a.pagadas::numeric / a.operaciones * 100, 2) ELSE 0 END,
      'ticket_promedio', CASE WHEN a.operaciones > 0
        THEN ROUND(a.monto_procesado / a.operaciones, 2) ELSE 0 END
    )
  )
  FROM a;
$$;

CREATE OR REPLACE FUNCTION public.f_get_dashboard_metricas_servicios_serie(
  p_servicio character varying,
  p_fecha_desde date,
  p_fecha_hasta date,
  p_id_usuario_consulta bigint,
  p_id_sucursal bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_banco_cliente bigint DEFAULT NULL,
  p_id_banco_destino bigint DEFAULT NULL,
  p_id_pos bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH dias AS (
    SELECT d::date AS periodo
    FROM generate_series(p_fecha_desde, p_fecha_hasta, interval '1 day') d
    WHERE p_fecha_desde IS NOT NULL
      AND p_fecha_hasta IS NOT NULL
      AND p_fecha_desde <= p_fecha_hasta
      AND p_fecha_hasta - p_fecha_desde <= 731
  ), h AS (
    SELECT * FROM public.f_get_dashboard_metricas_servicios_hechos(
      p_servicio, p_fecha_desde, p_fecha_hasta, p_id_usuario_consulta,
      p_id_sucursal, p_id_estado, p_id_banco_cliente, p_id_banco_destino, p_id_pos
    )
  ), operaciones AS (
    SELECT
      fecha_operacion AS periodo,
      COUNT(*)::bigint AS operaciones,
      COUNT(*) FILTER (WHERE pagada)::bigint AS pagadas,
      COALESCE(SUM(monto_procesado), 0)::numeric AS monto_procesado,
      COALESCE(SUM(monto_atendido), 0)::numeric AS monto_atendido,
      COALESCE(SUM(comisiones), 0)::numeric AS comisiones,
      COALESCE(SUM(gastos), 0)::numeric AS gastos,
      COALESCE(SUM(ganancias), 0)::numeric AS ganancias,
      COALESCE(SUM(salidas), 0)::numeric AS salidas
    FROM h GROUP BY fecha_operacion
  ), clientes AS (
    SELECT fecha_cliente_registro AS periodo,
           COUNT(DISTINCT id_cliente)::bigint AS clientes_nuevos
    FROM h
    WHERE cliente_nuevo
    GROUP BY fecha_cliente_registro
  )
  SELECT jsonb_build_object(
    'periodo', d.periodo,
    'operaciones', COALESCE(o.operaciones, 0),
    'pagadas', COALESCE(o.pagadas, 0),
    'clientes_nuevos', COALESCE(c.clientes_nuevos, 0),
    'monto_procesado', COALESCE(o.monto_procesado, 0),
    'monto_atendido', COALESCE(o.monto_atendido, 0),
    'comisiones', COALESCE(o.comisiones, 0),
    'gastos', COALESCE(o.gastos, 0),
    'ganancias', COALESCE(o.ganancias, 0),
    'salidas', COALESCE(o.salidas, 0)
  )
  FROM dias d
  LEFT JOIN operaciones o ON o.periodo = d.periodo
  LEFT JOIN clientes c ON c.periodo = d.periodo
  ORDER BY d.periodo;
$$;

CREATE OR REPLACE FUNCTION public.f_get_dashboard_metricas_servicios_sedes(
  p_servicio character varying,
  p_fecha_desde date,
  p_fecha_hasta date,
  p_id_usuario_consulta bigint,
  p_id_sucursal bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_banco_cliente bigint DEFAULT NULL,
  p_id_banco_destino bigint DEFAULT NULL,
  p_id_pos bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH h AS (
    SELECT * FROM public.f_get_dashboard_metricas_servicios_hechos(
      p_servicio, p_fecha_desde, p_fecha_hasta, p_id_usuario_consulta,
      p_id_sucursal, p_id_estado, p_id_banco_cliente, p_id_banco_destino, p_id_pos
    )
  ), a AS (
    SELECT
      id_sucursal, sucursal, MAX(servicio) AS servicio,
      COUNT(*)::bigint AS operaciones,
      COUNT(*) FILTER (WHERE pagada)::bigint AS pagadas,
      COUNT(DISTINCT id_cliente) FILTER (WHERE cliente_nuevo)::bigint AS clientes_nuevos,
      SUM(monto_procesado)::numeric AS monto_procesado,
      SUM(monto_atendido)::numeric AS monto_atendido,
      SUM(comisiones)::numeric AS comisiones,
      SUM(gastos)::numeric AS gastos,
      SUM(ganancias)::numeric AS ganancias,
      SUM(salidas)::numeric AS salidas
    FROM h GROUP BY id_sucursal, sucursal
  )
  SELECT jsonb_build_object(
    'id_sucursal', id_sucursal, 'sede', sucursal,
    'operaciones', operaciones, 'pagadas', pagadas,
    'clientes_nuevos', clientes_nuevos,
    'monto_procesado', monto_procesado, 'monto_atendido', monto_atendido,
    'comisiones', comisiones, 'gastos', gastos, 'ganancias', ganancias, 'salidas', salidas,
    'tasa_exito', CASE WHEN operaciones > 0 THEN ROUND(
      pagadas::numeric / operaciones * 100, 2) ELSE 0 END
  )
  FROM a
  ORDER BY monto_procesado DESC, operaciones DESC, sucursal;
$$;

CREATE OR REPLACE FUNCTION public.f_get_dashboard_metricas_servicios_distribucion(
  p_servicio character varying,
  p_fecha_desde date,
  p_fecha_hasta date,
  p_id_usuario_consulta bigint,
  p_id_sucursal bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_banco_cliente bigint DEFAULT NULL,
  p_id_banco_destino bigint DEFAULT NULL,
  p_id_pos bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH h AS (
    SELECT * FROM public.f_get_dashboard_metricas_servicios_hechos(
      p_servicio, p_fecha_desde, p_fecha_hasta, p_id_usuario_consulta,
      p_id_sucursal, p_id_estado, p_id_banco_cliente, p_id_banco_destino, p_id_pos
    )
  ), dimensiones AS (
    SELECT 'estado'::text AS dimension, COALESCE(id_estado::text, 'null') AS clave, estado AS nombre, NULL::date AS periodo,
           COUNT(*)::bigint AS operaciones, COUNT(*) FILTER (WHERE pagada)::bigint AS pagadas,
           COUNT(*) FILTER (WHERE NOT pagada)::bigint AS pendientes,
           COUNT(DISTINCT id_cliente) FILTER (WHERE cliente_nuevo)::bigint AS clientes_nuevos,
           SUM(monto_procesado)::numeric AS monto_procesado, SUM(monto_atendido)::numeric AS monto_atendido,
           SUM(comisiones)::numeric AS comisiones, SUM(gastos)::numeric AS gastos,
           SUM(ganancias)::numeric AS ganancias, SUM(salidas)::numeric AS salidas
    FROM h GROUP BY id_estado, estado
    UNION ALL
    SELECT 'entidad-tarjeta', COALESCE(id_banco_cliente::text, 'null'), entidad_tarjeta, NULL::date,
           COUNT(*)::bigint, COUNT(*) FILTER (WHERE pagada)::bigint,
           COUNT(*) FILTER (WHERE NOT pagada)::bigint,
           COUNT(DISTINCT id_cliente) FILTER (WHERE cliente_nuevo)::bigint,
           SUM(monto_procesado)::numeric, SUM(monto_atendido)::numeric,
           SUM(comisiones)::numeric, SUM(gastos)::numeric, SUM(ganancias)::numeric, SUM(salidas)::numeric
    FROM h GROUP BY id_banco_cliente, entidad_tarjeta
    UNION ALL
    SELECT 'banco-destino', COALESCE(id_banco_destino::text, 'null'), banco_destino, NULL::date,
           COUNT(*)::bigint, COUNT(*) FILTER (WHERE pagada)::bigint,
           COUNT(*) FILTER (WHERE NOT pagada)::bigint,
           COUNT(DISTINCT id_cliente) FILTER (WHERE cliente_nuevo)::bigint,
           SUM(monto_procesado)::numeric, SUM(monto_atendido)::numeric,
           SUM(comisiones)::numeric, SUM(gastos)::numeric, SUM(ganancias)::numeric, SUM(salidas)::numeric
    FROM h WHERE servicio = 'pos' GROUP BY id_banco_destino, banco_destino
    UNION ALL
    SELECT 'pos', COALESCE(id_pos::text, 'null'), pos, NULL::date,
           COUNT(*)::bigint, COUNT(*) FILTER (WHERE pagada)::bigint,
           COUNT(*) FILTER (WHERE NOT pagada)::bigint,
           COUNT(DISTINCT id_cliente) FILTER (WHERE cliente_nuevo)::bigint,
           SUM(monto_procesado)::numeric, SUM(monto_atendido)::numeric,
           SUM(comisiones)::numeric, SUM(gastos)::numeric, SUM(ganancias)::numeric, SUM(salidas)::numeric
    FROM h WHERE servicio = 'pos' GROUP BY id_pos, pos
    UNION ALL
    SELECT 'pos-diario', COALESCE(id_pos::text, 'null'), pos, fecha_operacion,
           COUNT(*)::bigint, COUNT(*) FILTER (WHERE pagada)::bigint,
           COUNT(*) FILTER (WHERE NOT pagada)::bigint,
           COUNT(DISTINCT id_cliente) FILTER (WHERE cliente_nuevo)::bigint,
           SUM(monto_procesado)::numeric, SUM(monto_atendido)::numeric,
           SUM(comisiones)::numeric, SUM(gastos)::numeric, SUM(ganancias)::numeric, SUM(salidas)::numeric
    FROM h WHERE servicio = 'pos' GROUP BY fecha_operacion, id_pos, pos
    UNION ALL
    SELECT 'entidad-tarjeta-diaria', COALESCE(id_banco_cliente::text, 'null'), entidad_tarjeta, fecha_operacion,
           COUNT(*)::bigint, COUNT(*) FILTER (WHERE pagada)::bigint,
           COUNT(*) FILTER (WHERE NOT pagada)::bigint,
           COUNT(DISTINCT id_cliente) FILTER (WHERE cliente_nuevo)::bigint,
           SUM(monto_procesado)::numeric, SUM(monto_atendido)::numeric,
           SUM(comisiones)::numeric, SUM(gastos)::numeric, SUM(ganancias)::numeric, SUM(salidas)::numeric
    FROM h WHERE servicio = 'linkpago' GROUP BY fecha_operacion, id_banco_cliente, entidad_tarjeta
  )
  SELECT jsonb_build_object(
    'dimension', dimension, 'clave', clave, 'nombre', nombre, 'periodo', periodo,
    'operaciones', operaciones, 'pagadas', pagadas, 'pendientes', pendientes,
    'clientes_nuevos', clientes_nuevos,
    'monto_procesado', monto_procesado, 'monto_atendido', monto_atendido,
    'comisiones', comisiones, 'gastos', gastos, 'ganancias', ganancias, 'salidas', salidas,
    'tasa_exito', CASE WHEN operaciones > 0 THEN ROUND(
      pagadas::numeric / operaciones * 100, 2) ELSE 0 END
  )
  FROM dimensiones
  WHERE operaciones > 0
  ORDER BY dimension, periodo NULLS FIRST, operaciones DESC, monto_procesado DESC, nombre;
$$;

CREATE OR REPLACE FUNCTION public.f_get_dashboard_metricas_servicios_desglose(
  p_servicio character varying,
  p_fecha_desde date,
  p_fecha_hasta date,
  p_id_usuario_consulta bigint,
  p_id_sucursal bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_banco_cliente bigint DEFAULT NULL,
  p_id_banco_destino bigint DEFAULT NULL,
  p_id_pos bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH h AS (
    SELECT * FROM public.f_get_dashboard_metricas_servicios_hechos(
      p_servicio, p_fecha_desde, p_fecha_hasta, p_id_usuario_consulta,
      p_id_sucursal, p_id_estado, p_id_banco_cliente, p_id_banco_destino, p_id_pos
    )
  ), a AS (
    SELECT
      MAX(servicio) AS servicio,
      id_sucursal, sucursal,
      id_banco_cliente, entidad_tarjeta,
      id_banco_destino, banco_destino,
      id_pos, pos,
      id_empresa_salida, empresa_salida,
      id_cuenta_salida, cuenta_salida,
      COUNT(*)::bigint AS operaciones,
      COUNT(*) FILTER (WHERE pagada)::bigint AS pagadas,
      COUNT(*) FILTER (WHERE NOT pagada)::bigint AS pendientes,
      COUNT(DISTINCT id_cliente) FILTER (WHERE cliente_nuevo)::bigint AS clientes_nuevos,
      SUM(monto_procesado)::numeric AS monto_procesado,
      SUM(monto_atendido)::numeric AS monto_atendido,
      SUM(comisiones)::numeric AS comisiones,
      SUM(gastos)::numeric AS gastos,
      SUM(ganancias)::numeric AS ganancias,
      SUM(salidas)::numeric AS salidas
    FROM h
    GROUP BY id_sucursal, sucursal, id_banco_cliente, entidad_tarjeta,
      id_banco_destino, banco_destino, id_pos, pos,
      id_empresa_salida, empresa_salida, id_cuenta_salida, cuenta_salida
  )
  SELECT jsonb_build_object(
    'servicio', servicio,
    'id_sucursal', id_sucursal, 'sede', sucursal,
    'id_banco_cliente', id_banco_cliente, 'entidad_tarjeta', entidad_tarjeta,
    'id_banco_destino', id_banco_destino, 'banco_destino', banco_destino,
    'id_pos', id_pos, 'pos', pos,
    'id_empresa_salida', id_empresa_salida, 'empresa_salida', empresa_salida,
    'id_cuenta_salida', id_cuenta_salida, 'cuenta_salida', cuenta_salida,
    'operaciones', operaciones, 'pagadas', pagadas, 'pendientes', pendientes,
    'clientes_nuevos', clientes_nuevos,
    'monto_procesado', monto_procesado, 'monto_atendido', monto_atendido,
    'comisiones', comisiones, 'gastos', gastos, 'ganancias', ganancias, 'salidas', salidas,
    'tasa_exito', CASE WHEN operaciones > 0 THEN ROUND(
      pagadas::numeric / operaciones * 100, 2) ELSE 0 END
  )
  FROM a
  ORDER BY monto_procesado DESC, operaciones DESC, sucursal, entidad_tarjeta;
$$;

DROP FUNCTION IF EXISTS public.f_get_dashboard_metricas_pago_deuda_analitica(
  date,
  date,
  bigint,
  bigint,
  bigint
);

/* Vista analitica completa de Pago Deuda para filtros, KPI y datatables. */
CREATE OR REPLACE FUNCTION public.f_get_dashboard_metricas_pago_deuda_analitica(
  p_fecha_desde date,
  p_fecha_hasta date,
  p_id_usuario_consulta bigint,
  p_id_banco_cliente bigint DEFAULT NULL,
  p_id_empresa_salida bigint DEFAULT NULL,
  p_id_sucursal bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  IF p_fecha_desde IS NULL OR p_fecha_hasta IS NULL OR p_fecha_desde > p_fecha_hasta THEN
    RAISE EXCEPTION 'El rango de fechas del dashboard no es valido.';
  END IF;
  IF p_fecha_hasta - p_fecha_desde > 730 THEN
    RAISE EXCEPTION 'El rango maximo permitido es de 731 dias.';
  END IF;

  WITH universo_base AS MATERIALIZED (
    SELECT *
    FROM public.f_get_dashboard_metricas_servicios_hechos(
      'pago-deuda', p_fecha_desde, p_fecha_hasta, p_id_usuario_consulta,
      NULL, NULL, NULL, NULL, NULL
    )
  ), bancos_base AS MATERIALIZED (
    SELECT *
    FROM universo_base
    WHERE p_id_sucursal IS NULL
       OR (p_id_sucursal = 0 AND id_sucursal IS NULL)
       OR id_sucursal = p_id_sucursal
  ), empresas_base AS MATERIALIZED (
    SELECT *
    FROM bancos_base
    WHERE p_id_banco_cliente IS NULL
       OR (p_id_banco_cliente = 0 AND id_banco_cliente IS NULL)
       OR id_banco_cliente = p_id_banco_cliente
  ), hechos AS MATERIALIZED (
    SELECT *
    FROM empresas_base
    WHERE p_id_empresa_salida IS NULL
       OR (p_id_empresa_salida = 0 AND id_empresa_salida IS NULL)
       OR id_empresa_salida = p_id_empresa_salida
  ), detalle AS MATERIALIZED (
    SELECT
      h.*,
      op.codigo_operacion_deposito_cliente AS codigo_operacion,
      op.fecha_registro,
      op.id_comunidad,
      COALESCE(NULLIF(BTRIM(op.nombre_comunidad), ''), 'Sin comunidad')::character varying AS comunidad_operacion,
      COALESCE(NULLIF(BTRIM(op.dni_cliente), ''), NULLIF(BTRIM(cl.numero_documento), ''), '-')::character varying AS dni,
      COALESCE(NULLIF(BTRIM(op.nombre_cliente), ''), NULLIF(BTRIM(cl.nombre), ''), 'Sin nombre')::character varying AS nombre_completo,
      COALESCE(op.comision_servicio, 0)::numeric AS comision_porcentaje,
      COALESCE(NULLIF(BTRIM(cm.nombre), ''), 'Sin comunidad')::character varying AS comunidad_cliente
    FROM hechos h
    JOIN public.tb_operacion_proceso op ON op.id = h.id_operacion
    LEFT JOIN public.tb_cliente cl ON cl.id = h.id_cliente
    LEFT JOIN public.tb_comunidad cm ON cm.id = cl.id_comunidad
  ), resumen AS (
    SELECT jsonb_build_object(
      'operaciones', COUNT(*)::bigint,
      'recaudacion', COALESCE(SUM(monto_procesado), 0)::numeric,
      'comision', COALESCE(SUM(comisiones), 0)::numeric,
      'gastos_operacionales', COALESCE(SUM(gastos), 0)::numeric,
      'ganancias', COALESCE(SUM(ganancias), 0)::numeric,
      'salida', COALESCE(SUM(monto_atendido), 0)::numeric,
      'clientes_nuevos', COUNT(DISTINCT id_cliente) FILTER (WHERE cliente_nuevo)::bigint,
      'operaciones_pendientes', COUNT(*) FILTER (WHERE NOT atendida)::bigint,
      'monto_pendiente', COALESCE(SUM(GREATEST(monto_procesado - monto_atendido, 0)) FILTER (WHERE NOT atendida), 0)::numeric
    ) AS valor
    FROM detalle
  ), serie_filas AS (
    SELECT
      fecha_operacion AS periodo,
      COUNT(*)::bigint AS operaciones,
      COALESCE(SUM(ganancias), 0)::numeric AS ganancias
    FROM detalle
    GROUP BY fecha_operacion
  ), comisiones_filas AS (
    SELECT
      comision_porcentaje AS porcentaje,
      COUNT(*)::bigint AS operaciones,
      COUNT(*) FILTER (WHERE atendida)::bigint AS atendidas,
      COUNT(*) FILTER (WHERE NOT atendida)::bigint AS pendientes,
      COALESCE(SUM(monto_procesado), 0)::numeric AS recaudacion,
      COALESCE(SUM(comisiones), 0)::numeric AS comision,
      COALESCE(SUM(gastos), 0)::numeric AS gastos_operacionales,
      COALESCE(SUM(ganancias), 0)::numeric AS ganancias,
      COALESCE(SUM(monto_atendido), 0)::numeric AS salida,
      COUNT(DISTINCT id_cliente) FILTER (WHERE cliente_nuevo)::bigint AS clientes_nuevos,
      CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE atendida)::numeric / COUNT(*) * 100, 2) ELSE 0 END AS tasa_atencion
    FROM detalle
    GROUP BY comision_porcentaje
  ), comunidades_filas AS (
    SELECT
      id_comunidad,
      comunidad_operacion AS comunidad,
      COUNT(*)::bigint AS operaciones,
      COUNT(*) FILTER (WHERE atendida)::bigint AS atendidas,
      COUNT(*) FILTER (WHERE NOT atendida)::bigint AS pendientes,
      COALESCE(SUM(monto_procesado), 0)::numeric AS recaudacion,
      COALESCE(SUM(comisiones), 0)::numeric AS comision,
      COALESCE(SUM(gastos), 0)::numeric AS gastos_operacionales,
      COALESCE(SUM(ganancias), 0)::numeric AS ganancias,
      COALESCE(SUM(monto_atendido), 0)::numeric AS salida,
      COUNT(DISTINCT id_cliente) FILTER (WHERE cliente_nuevo)::bigint AS clientes_nuevos,
      COUNT(*) FILTER (WHERE NOT atendida)::bigint AS operaciones_pendientes,
      CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE atendida)::numeric / COUNT(*) * 100, 2) ELSE 0 END AS tasa_atencion
    FROM detalle
    GROUP BY id_comunidad, comunidad_operacion
  ), clientes_filas AS (
    SELECT
      d.id_cliente,
      MAX(d.dni) AS dni,
      MAX(d.nombre_completo) AS nombre_completo,
      MAX(d.comunidad_cliente) AS comunidad,
      COUNT(*)::bigint AS operaciones,
      COUNT(*) FILTER (WHERE d.atendida)::bigint AS atendidas,
      COUNT(*) FILTER (WHERE NOT d.atendida)::bigint AS pendientes,
      COUNT(*) FILTER (WHERE NOT d.atendida)::bigint AS operaciones_pendientes,
      COALESCE(SUM(d.monto_procesado), 0)::numeric AS recaudacion,
      COALESCE(SUM(d.comisiones), 0)::numeric AS comision,
      COALESCE(SUM(d.gastos), 0)::numeric AS gastos_operacionales,
      COALESCE(SUM(d.ganancias), 0)::numeric AS ganancias,
      COALESCE(SUM(d.monto_atendido), 0)::numeric AS salida,
      COUNT(DISTINCT d.id_cliente) FILTER (WHERE d.cliente_nuevo)::bigint AS clientes_nuevos,
      CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE d.atendida)::numeric / COUNT(*) * 100, 2) ELSE 0 END AS tasa_atencion
    FROM detalle d
    WHERE d.id_cliente IS NOT NULL
    GROUP BY d.id_cliente
  ), sedes_filas AS (
    SELECT
      id_sucursal,
      MAX(sucursal) AS sede,
      COUNT(*)::bigint AS operaciones,
      COUNT(*) FILTER (WHERE atendida)::bigint AS atendidas,
      COUNT(*) FILTER (WHERE NOT atendida)::bigint AS pendientes,
      COALESCE(SUM(monto_procesado), 0)::numeric AS monto_solicitado,
      COALESCE(SUM(monto_atendido), 0)::numeric AS monto_transferido,
      COALESCE(SUM(ganancias), 0)::numeric AS ganancias,
      COUNT(DISTINCT id_cliente) FILTER (WHERE cliente_nuevo)::bigint AS clientes_nuevos,
      CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE atendida)::numeric / COUNT(*) * 100, 2) ELSE 0 END AS tasa_atencion
    FROM detalle
    GROUP BY id_sucursal
  ), bancos_filas AS (
    SELECT
      id_banco_cliente,
      MAX(entidad_tarjeta) AS banco,
      COUNT(*)::bigint AS operaciones,
      COUNT(*) FILTER (WHERE atendida)::bigint AS atendidas,
      COUNT(*) FILTER (WHERE NOT atendida)::bigint AS pendientes,
      COALESCE(SUM(monto_procesado), 0)::numeric AS monto_solicitado,
      COALESCE(SUM(monto_atendido), 0)::numeric AS monto_transferido,
      COALESCE(SUM(ganancias), 0)::numeric AS ganancias,
      COUNT(DISTINCT id_cliente) FILTER (WHERE cliente_nuevo)::bigint AS clientes_nuevos,
      CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE atendida)::numeric / COUNT(*) * 100, 2) ELSE 0 END AS tasa_atencion
    FROM detalle
    GROUP BY id_banco_cliente
  ), mejor_cliente AS (
    SELECT jsonb_build_object(
      'id_cliente', id_cliente,
      'dni', dni,
      'nombre_completo', nombre_completo,
      'operaciones', operaciones,
      'ganancias', ganancias
    ) AS valor
    FROM clientes_filas
    ORDER BY ganancias DESC, operaciones DESC, id_cliente
    LIMIT 1
  ), mejor_sede AS (
    SELECT jsonb_build_object(
      'id_sucursal', id_sucursal,
      'sede', sede,
      'operaciones', operaciones,
      'ganancias', ganancias
    ) AS valor
    FROM sedes_filas
    ORDER BY ganancias DESC, operaciones DESC, sede
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'id_sucursal_seleccionada', p_id_sucursal,
    'id_banco_seleccionado', p_id_banco_cliente,
    'id_empresa_seleccionada', p_id_empresa_salida,
    'bancos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id_banco', id_banco_cliente,
        'banco', entidad_tarjeta
      ) ORDER BY entidad_tarjeta)
      FROM (
        SELECT id_banco_cliente, MAX(entidad_tarjeta) AS entidad_tarjeta
        FROM bancos_base
        GROUP BY id_banco_cliente
      ) b
    ), '[]'::jsonb),
    'sedes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id_sucursal', id_sucursal,
        'sede', sucursal
      ) ORDER BY sucursal)
      FROM (
        SELECT id_sucursal, MAX(sucursal) AS sucursal
        FROM universo_base
        GROUP BY id_sucursal
      ) s
    ), '[]'::jsonb),
    'empresas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id_empresa', id_empresa_salida,
        'empresa', empresa_salida
      ) ORDER BY empresa_salida)
      FROM (
        SELECT id_empresa_salida, MAX(empresa_salida) AS empresa_salida
        FROM empresas_base
        GROUP BY id_empresa_salida
      ) e
    ), '[]'::jsonb),
    'resumen', (SELECT valor FROM resumen),
    'serie', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'periodo', periodo,
        'operaciones', operaciones,
        'ganancias', ganancias
      ) ORDER BY periodo)
      FROM serie_filas
    ), '[]'::jsonb),
    'comisiones', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY porcentaje)
      FROM comisiones_filas c
    ), '[]'::jsonb),
    'comunidades', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY recaudacion DESC, comunidad)
      FROM comunidades_filas c
    ), '[]'::jsonb),
    'clientes', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY operaciones DESC, ganancias DESC, dni)
      FROM (SELECT * FROM clientes_filas ORDER BY operaciones DESC, ganancias DESC, dni LIMIT 10) c
    ), '[]'::jsonb),
    'mejor_cliente', COALESCE((SELECT valor FROM mejor_cliente), '{}'::jsonb),
    'mejor_sede', COALESCE((SELECT valor FROM mejor_sede), '{}'::jsonb),
    'distribucion_sedes', COALESCE((
      SELECT jsonb_agg(to_jsonb(s) ORDER BY operaciones DESC, sede)
      FROM sedes_filas s
    ), '[]'::jsonb),
    'distribucion_bancos', COALESCE((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY operaciones DESC, banco)
      FROM bancos_filas b
    ), '[]'::jsonb),
    'pendientes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id_operacion', id_operacion,
        'codigo_operacion', COALESCE(codigo_operacion, id_operacion::text),
        'dni', dni,
        'nombre_completo', nombre_completo,
        'comunidad', comunidad_operacion,
        'banco', entidad_tarjeta,
        'empresa', empresa_salida,
        'fecha', fecha_registro,
        'recaudacion', monto_procesado,
        'transferencia', monto_atendido,
        'ganancias', ganancias,
        'estado', estado
      ) ORDER BY fecha_registro DESC)
      FROM detalle
      WHERE NOT atendida
    ), '[]'::jsonb)
  )
  INTO v_resultado;

  RETURN v_resultado;
END;
$$;

-- Diagnostico de firmas para despliegue seguro.
SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_get_dashboard_metricas_servicios_resumen',
  'f_get_dashboard_metricas_servicios_distribucion',
  'f_get_dashboard_metricas_pago_deuda_analitica'
)
ORDER BY n.nspname, p.proname;
