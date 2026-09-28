-- ============================================================================
-- COMPENSACIONES - REFERIDOS Y PRIMERA OPERACION ELEGIBLE
-- ============================================================================
-- Objetivo:
--   Especializar el evento REFERIDO, atribuir un cliente una sola vez y
--   valorizar exclusivamente su primera operacion pagada elegible posterior al
--   registro. La tasa remunerativa proviene de la matriz publicada.
--
-- Dependencias:
--   03.operacion_proceso_y_excel.sql
--   17.compensaciones_personal_configuracion.sql
--   18.compensaciones_asistencia_evidencias.sql
--   20.compensaciones_seguridad_personal_funciones.sql
--   27.compensaciones_evidencias_funciones.sql
-- ============================================================================

-- ============================================================================
-- 1. CONSULTA DE REFERIDOS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_referido(
  p_id bigint DEFAULT NULL,
  p_id_colaborador_referente bigint DEFAULT NULL,
  p_id_sucursal bigint DEFAULT NULL,
  p_estado_referido character varying DEFAULT NULL,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL,
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
  v_resumen jsonb;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('EVIDENCIAS', 'CONSULTAR');
  v_alcance := v_contexto ->> 'alcance';
  v_id_colaborador_actor := NULLIF(v_contexto ->> 'id_colaborador', '')::bigint;
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  WITH base AS (
    SELECT
      r.*,
      ev.estado_evento,
      ev.periodo_imputacion,
      ev.importe_aprobado,
      ev.id_regla_aplicada,
      ev.id_sucursal_origen,
      s.nombre AS sucursal_nombre,
      c.nombre_completo AS referente_nombre,
      c.numero_documento AS referente_documento,
      cl.nombre AS cliente_nombre_actual,
      cl.numero_documento AS cliente_documento_actual,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(ro) ORDER BY ro.fecha_operacion_snapshot, ro.id)
        FROM public.tb_compensacion_referido_operacion ro
        WHERE ro.id_referido = r.id
      ), '[]'::jsonb) AS operaciones
    FROM public.tb_compensacion_referido r
    JOIN public.tb_compensacion_evento ev ON ev.id = r.id_evento
    JOIN public.tb_compensacion_evento_tipo te ON te.id = ev.id_tipo_evento
    JOIN public.tb_compensacion_colaborador c ON c.id = r.id_colaborador_referente
    JOIN public.tb_cliente cl ON cl.id = r.id_cliente
    LEFT JOIN public.tb_sucursal s ON s.id = ev.id_sucursal_origen
    WHERE te.categoria = 'REFERIDO'
      AND (p_id IS NULL OR r.id = p_id)
      AND (
        p_id_colaborador_referente IS NULL
        OR r.id_colaborador_referente = p_id_colaborador_referente
      )
      AND (p_id_sucursal IS NULL OR ev.id_sucursal_origen = p_id_sucursal)
      AND (
        p_estado_referido IS NULL
        OR r.estado_referido = UPPER(TRIM(p_estado_referido))
      )
      AND (p_fecha_desde IS NULL OR r.fecha_referencia::date >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR r.fecha_referencia::date <= p_fecha_hasta)
      AND (
        p_busqueda IS NULL
        OR r.nombre_referido_snapshot ILIKE '%' || TRIM(p_busqueda) || '%'
        OR r.documento_referido_snapshot ILIKE '%' || TRIM(p_busqueda) || '%'
        OR c.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR c.numero_documento ILIKE '%' || TRIM(p_busqueda) || '%'
      )
      AND (
        v_alcance = 'GLOBAL'
        OR (
          v_alcance = 'PROPIO'
          AND r.id_colaborador_referente = v_id_colaborador_actor
        )
        OR (
          v_alcance = 'SEDE'
          AND (
            ev.id_sucursal_origen = v_id_sucursal_alcance
            OR EXISTS (
              SELECT 1
              FROM public.tb_compensacion_asignacion a
              WHERE a.id_colaborador = r.id_colaborador_referente
                AND a.id_sucursal = v_id_sucursal_alcance
                AND a.fecha_inicio <= r.fecha_referencia::date
                AND (a.fecha_fin IS NULL OR a.fecha_fin >= r.fecha_referencia::date)
            )
          )
        )
      )
  ), conteo AS (
    SELECT COUNT(*) AS total FROM base
  ), resumen AS (
    SELECT jsonb_build_object(
      'pendientes', COUNT(*) FILTER (WHERE estado_referido = 'PENDIENTE'),
      'validados', COUNT(*) FILTER (WHERE estado_referido = 'VALIDADO'),
      'rechazados', COUNT(*) FILTER (WHERE estado_referido = 'RECHAZADO'),
      'anulados', COUNT(*) FILTER (WHERE estado_referido = 'ANULADO'),
      'importe_validado', COALESCE(SUM(importe_aprobado) FILTER (
        WHERE estado_referido = 'VALIDADO'
      ), 0)
    ) AS datos
    FROM base
  ), pagina AS (
    SELECT * FROM base
    ORDER BY fecha_referencia DESC, id DESC
    LIMIT v_tamano OFFSET (v_pagina - 1) * v_tamano
  )
  SELECT conteo.total, resumen.datos,
         COALESCE(
           jsonb_agg(to_jsonb(pagina) ORDER BY pagina.fecha_referencia DESC, pagina.id DESC)
             FILTER (WHERE pagina.id IS NOT NULL),
           '[]'::jsonb
         )
  INTO v_total, v_resumen, v_items
  FROM conteo
  CROSS JOIN resumen
  LEFT JOIN pagina ON true
  GROUP BY conteo.total, resumen.datos;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'resumen', COALESCE(v_resumen, '{}'::jsonb),
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
-- 2. REGISTRO ATOMICO DEL REFERIDO Y SU EVENTO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_referido(
  p_id_tipo_evento bigint,
  p_id_cliente bigint,
  p_id_colaborador_referente bigint,
  p_fecha_referencia timestamp with time zone DEFAULT now(),
  p_observacion text DEFAULT NULL,
  p_evidencia jsonb DEFAULT '[]'::jsonb,
  p_clave_origen character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_contexto jsonb;
  v_id_actor bigint;
  v_tipo public.tb_compensacion_evento_tipo%ROWTYPE;
  v_cliente public.tb_cliente%ROWTYPE;
  v_evento jsonb;
  v_id_evento bigint;
  v_id bigint;
BEGIN
  v_contexto := public.f_private_compensacion_contexto('EVIDENCIAS', 'REGISTRAR');
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  SELECT t.* INTO v_tipo
  FROM public.tb_compensacion_evento_tipo t
  JOIN public.tb_estado es ON es.id = t.id_estado
  WHERE t.id = p_id_tipo_evento
    AND t.categoria = 'REFERIDO'
    AND UPPER(es.nombre) = 'ACTIVO';

  IF v_tipo.id IS NULL THEN
    RAISE EXCEPTION 'El tipo de evento de referido no existe o esta inactivo';
  END IF;

  SELECT * INTO v_cliente
  FROM public.tb_cliente
  WHERE id = p_id_cliente;

  IF v_cliente.id IS NULL THEN
    RAISE EXCEPTION 'El cliente referido no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_compensacion_colaborador
    WHERE id = p_id_colaborador_referente
  ) THEN
    RAISE EXCEPTION 'El colaborador referente no existe';
  END IF;

  v_evento := public.f_post_tb_compensacion_evento(
    p_id_tipo_evento => p_id_tipo_evento,
    p_fecha_evento => COALESCE(p_fecha_referencia, now()),
    p_id_colaborador_beneficiario => p_id_colaborador_referente,
    p_periodo_imputacion => date_trunc(
      'month', COALESCE(p_fecha_referencia, now())
    )::date,
    p_fuente => 'CLIENTE',
    p_clave_origen => p_clave_origen,
    p_titulo => 'Referido: ' || COALESCE(v_cliente.nombre, v_cliente.numero_documento),
    p_descripcion => p_observacion,
    p_datos => jsonb_build_object(
      'id_cliente', v_cliente.id,
      'tipo_documento', v_cliente.tipo_documento,
      'numero_documento', v_cliente.numero_documento,
      'nombre', v_cliente.nombre
    ),
    p_evidencia => COALESCE(p_evidencia, '[]'::jsonb),
    p_referencias => jsonb_build_array(
      jsonb_build_object(
        'tipo_referencia', 'CLIENTE',
        'id_cliente', v_cliente.id,
        'datos_snapshot', jsonb_build_object(
          'tipo_documento', v_cliente.tipo_documento,
          'numero_documento', v_cliente.numero_documento,
          'nombre', v_cliente.nombre
        )
      )
    )
  );
  v_id_evento := (v_evento ->> 'id')::bigint;

  INSERT INTO public.tb_compensacion_referido (
    id_evento, id_cliente, id_colaborador_referente,
    nombre_referido_snapshot, documento_referido_snapshot,
    fecha_referencia, estado_referido, observacion, id_usuario
  ) VALUES (
    v_id_evento, v_cliente.id, p_id_colaborador_referente,
    COALESCE(NULLIF(TRIM(v_cliente.nombre), ''), v_cliente.numero_documento),
    v_cliente.numero_documento, COALESCE(p_fecha_referencia, now()),
    'PENDIENTE', NULLIF(TRIM(p_observacion), ''), v_id_actor
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'id_evento', v_id_evento,
    'estado_referido', 'PENDIENTE',
    'estado_evento', 'BORRADOR',
    'mensaje', 'Referido registrado como borrador'
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'El cliente ya fue atribuido a un referente o la clave de origen esta duplicada';
END;
$$;

-- ============================================================================
-- 3. RESOLUCION CON PRIMERA OPERACION ELEGIBLE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_referido_resolver(
  p_id bigint,
  p_decision character varying,
  p_id_operacion bigint DEFAULT NULL,
  p_comentario text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_referido public.tb_compensacion_referido%ROWTYPE;
  v_evento public.tb_compensacion_evento%ROWTYPE;
  v_tipo public.tb_compensacion_evento_tipo%ROWTYPE;
  v_operacion public.tb_operacion_proceso%ROWTYPE;
  v_decision character varying := UPPER(TRIM(COALESCE(p_decision, '')));
  v_porcentaje_requerido numeric(12, 6);
  v_fecha_operacion timestamp with time zone;
  v_resultado jsonb;
  v_id_actor bigint;
BEGIN
  IF v_decision NOT IN ('APROBADO', 'RECHAZADO') THEN
    RAISE EXCEPTION 'La decision debe ser APROBADO o RECHAZADO';
  END IF;

  SELECT * INTO v_referido
  FROM public.tb_compensacion_referido
  WHERE id = p_id
  FOR UPDATE;

  IF v_referido.id IS NULL THEN
    RAISE EXCEPTION 'El referido no existe';
  END IF;

  SELECT * INTO v_evento
  FROM public.tb_compensacion_evento
  WHERE id = v_referido.id_evento
  FOR UPDATE;

  v_id_actor := (
    public.f_private_compensacion_evento_validar_alcance(
      v_evento.id,
      CASE WHEN v_decision = 'APROBADO' THEN 'APROBAR' ELSE 'REVISAR' END,
      false
    ) ->> 'id_usuario'
  )::bigint;

  IF v_evento.estado_evento <> 'PENDIENTE'
     OR v_referido.estado_referido <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo se pueden resolver referidos pendientes y enviados';
  END IF;

  IF v_decision = 'RECHAZADO' THEN
    v_resultado := public.f_post_tb_compensacion_evento_resolver(
      v_evento.id, 'RECHAZADO', p_comentario, NULL, NULL
    );

    UPDATE public.tb_compensacion_referido
    SET estado_referido = 'RECHAZADO',
        observacion = COALESCE(NULLIF(TRIM(p_comentario), ''), observacion),
        fecha_actualizacion = now()
    WHERE id = p_id;

    RETURN v_resultado || jsonb_build_object('id_referido', p_id);
  END IF;

  IF p_id_operacion IS NULL THEN
    RAISE EXCEPTION 'Debe indicar la primera operacion elegible para aprobar';
  END IF;

  SELECT * INTO v_tipo
  FROM public.tb_compensacion_evento_tipo
  WHERE id = v_evento.id_tipo_evento;

  IF NULLIF(v_tipo.configuracion ->> 'porcentaje_operacion_requerido', '') IS NULL
     OR (v_tipo.configuracion ->> 'porcentaje_operacion_requerido')
       !~ '^[0-9]+([.][0-9]+)?$' THEN
    RAISE EXCEPTION 'El tipo de referido debe configurar porcentaje_operacion_requerido';
  END IF;

  v_porcentaje_requerido := (
    v_tipo.configuracion ->> 'porcentaje_operacion_requerido'
  )::numeric;

  SELECT * INTO v_operacion
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  FOR SHARE;

  IF v_operacion.id IS NULL THEN
    RAISE EXCEPTION 'La operacion indicada no existe';
  END IF;

  v_fecha_operacion := COALESCE(
    v_operacion.fecha_pagado,
    v_operacion.fecha_deposito_cliente,
    v_operacion.fecha_registro
  );

  IF v_operacion.id_cliente IS DISTINCT FROM v_referido.id_cliente THEN
    RAISE EXCEPTION 'La operacion no pertenece al cliente referido';
  END IF;

  IF UPPER(BTRIM(COALESCE(v_operacion.nombre_estado, ''))) <> 'PAGADO' THEN
    RAISE EXCEPTION 'La operacion del referido debe estar pagada';
  END IF;

  IF v_fecha_operacion < v_referido.fecha_referencia THEN
    RAISE EXCEPTION 'La operacion es anterior al registro del referido';
  END IF;

  IF COALESCE(v_operacion.comision_servicio, 0) <> v_porcentaje_requerido THEN
    RAISE EXCEPTION
      'La operacion no cumple el porcentaje requerido de % por ciento',
      v_porcentaje_requerido;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_operacion_proceso op
    WHERE op.id_cliente = v_referido.id_cliente
      AND op.id <> v_operacion.id
      AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
      AND COALESCE(op.comision_servicio, 0) = v_porcentaje_requerido
      AND COALESCE(op.fecha_pagado, op.fecha_deposito_cliente, op.fecha_registro)
        >= v_referido.fecha_referencia
      AND (
        COALESCE(op.fecha_pagado, op.fecha_deposito_cliente, op.fecha_registro),
        op.id
      ) < (v_fecha_operacion, v_operacion.id)
  ) THEN
    RAISE EXCEPTION 'La operacion indicada no es la primera operacion elegible del referido';
  END IF;

  IF COALESCE(v_operacion.monto_deposito_cliente, 0) <= 0 THEN
    RAISE EXCEPTION 'La operacion no tiene un monto de deposito valido';
  END IF;

  INSERT INTO public.tb_compensacion_evento_referencia (
    id_evento, tipo_referencia, id_cliente, id_operacion,
    identificador_externo, datos_snapshot, id_usuario
  ) VALUES (
    v_evento.id, 'OPERACION', NULL, v_operacion.id,
    NULLIF(TRIM(v_operacion.codigo_operacion_deposito_cliente), ''),
    jsonb_build_object(
      'fecha_operacion', v_fecha_operacion,
      'nombre_banco', v_operacion.nombre_banco_cliente,
      'monto_deposito', v_operacion.monto_deposito_cliente,
      'porcentaje_operacion', v_operacion.comision_servicio,
      'estado', v_operacion.nombre_estado
    ),
    v_id_actor
  );

  v_resultado := public.f_post_tb_compensacion_evento_resolver(
    v_evento.id,
    'APROBADO',
    p_comentario,
    v_operacion.monto_deposito_cliente,
    1
  );

  SELECT * INTO v_evento
  FROM public.tb_compensacion_evento
  WHERE id = v_evento.id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_regla regla
    WHERE regla.id = v_evento.id_regla_aplicada
      AND regla.tipo_calculo = 'PORCENTAJE'
  ) THEN
    RAISE EXCEPTION 'La regla remunerativa del referido debe ser porcentual';
  END IF;

  INSERT INTO public.tb_compensacion_referido_operacion (
    id_referido, id_operacion, fecha_operacion_snapshot, banco_snapshot,
    monto_operacion_snapshot, porcentaje_operacion_snapshot,
    base_comision, tasa_referido, importe_comision,
    es_elegible, motivo_no_elegible, id_usuario
  ) VALUES (
    p_id, v_operacion.id, v_fecha_operacion, v_operacion.nombre_banco_cliente,
    v_operacion.monto_deposito_cliente, v_operacion.comision_servicio,
    v_evento.base_calculo, v_evento.tarifa_aplicada, v_evento.importe_aprobado,
    true, NULL, v_id_actor
  );

  UPDATE public.tb_compensacion_referido
  SET estado_referido = 'VALIDADO',
      observacion = COALESCE(NULLIF(TRIM(p_comentario), ''), observacion),
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN v_resultado || jsonb_build_object(
    'id_referido', p_id,
    'id_operacion', v_operacion.id,
    'porcentaje_operacion_requerido', v_porcentaje_requerido
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'La operacion ya fue consumida por otro referido';
END;
$$;

-- ============================================================================
-- 4. ANULACION PREVIA A LA VALORIZACION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_referido_anular(
  p_id bigint,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_referido public.tb_compensacion_referido%ROWTYPE;
  v_resultado jsonb;
BEGIN
  SELECT * INTO v_referido
  FROM public.tb_compensacion_referido
  WHERE id = p_id
  FOR UPDATE;

  IF v_referido.id IS NULL THEN
    RAISE EXCEPTION 'El referido no existe';
  END IF;

  PERFORM public.f_private_compensacion_evento_validar_alcance(
    v_referido.id_evento, 'EDITAR', false
  );

  IF v_referido.estado_referido NOT IN ('PENDIENTE', 'RECHAZADO') THEN
    RAISE EXCEPTION 'El referido validado o anulado no puede anularse por este flujo';
  END IF;

  v_resultado := public.f_post_tb_compensacion_evento_anular(
    v_referido.id_evento,
    p_motivo
  );

  UPDATE public.tb_compensacion_referido
  SET estado_referido = 'ANULADO',
      observacion = TRIM(p_motivo),
      fecha_actualizacion = now()
  WHERE id = p_id;

  RETURN v_resultado || jsonb_build_object('id_referido', p_id);
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
        'f_get_tb_compensacion_referido',
        'f_post_tb_compensacion_referido',
        'f_post_tb_compensacion_referido_resolver',
        'f_post_tb_compensacion_referido_anular'
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
  'f_get_tb_compensacion_referido',
  'f_post_tb_compensacion_referido',
  'f_post_tb_compensacion_referido_resolver',
  'f_post_tb_compensacion_referido_anular'
)
ORDER BY n.nspname, p.proname;
