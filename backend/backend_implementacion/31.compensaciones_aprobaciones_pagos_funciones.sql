-- ============================================================================
-- COMPENSACIONES - APROBACION DE LIQUIDACIONES Y PAGOS
-- ============================================================================
-- Objetivo:
--   Implementar la revision maker-checker de las liquidaciones y el registro
--   auditable de pagos externos, pagos parciales y reversas. Este archivo no
--   genera movimientos de Caja ni ejecuta transferencias bancarias.
--
-- Dependencias:
--   17.compensaciones_personal_configuracion.sql
--   19.compensaciones_liquidaciones_cierres_reportes.sql
--   20.compensaciones_seguridad_personal_funciones.sql
--   30.compensaciones_preliquidacion_funciones.sql
-- ============================================================================

-- ============================================================================
-- 1. RESUMEN PRIVADO DE PAGOS Y SALDOS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pago_resumen(
  p_id_liquidacion bigint
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH liquidacion AS (
    SELECT
      l.id,
      l.total_sueldo,
      l.total_bonos,
      l.total_comisiones,
      l.total_descuentos,
      l.total_pagar,
      GREATEST(l.total_sueldo - l.total_descuentos, 0)::numeric(14, 2)
        AS objetivo_sueldo
    FROM public.tb_compensacion_liquidacion l
    WHERE l.id = p_id_liquidacion
  ), movimientos AS (
    SELECT
      p.componente,
      SUM(
        CASE p.tipo_movimiento
          WHEN 'PAGO' THEN p.monto
          WHEN 'REVERSA' THEN -p.monto
        END
      )::numeric(14, 2) AS pagado
    FROM public.tb_compensacion_pago p
    WHERE p.id_liquidacion = p_id_liquidacion
    GROUP BY p.componente
  ), resumen AS (
    SELECT
      l.*,
      (l.total_pagar - l.objetivo_sueldo)::numeric(14, 2)
        AS objetivo_comisiones,
      COALESCE((SELECT m.pagado FROM movimientos m WHERE m.componente = 'TOTAL'), 0)
        ::numeric(14, 2) AS pagado_total,
      COALESCE((SELECT m.pagado FROM movimientos m WHERE m.componente = 'SUELDO'), 0)
        ::numeric(14, 2) AS pagado_sueldo,
      COALESCE((SELECT m.pagado FROM movimientos m WHERE m.componente = 'COMISIONES'), 0)
        ::numeric(14, 2) AS pagado_comisiones
    FROM liquidacion l
  )
  SELECT jsonb_build_object(
    'id_liquidacion', r.id,
    'objetivo_total', r.total_pagar,
    'objetivo_sueldo', r.objetivo_sueldo,
    'objetivo_comisiones', r.objetivo_comisiones,
    'pagado_total', r.pagado_total,
    'pagado_sueldo', r.pagado_sueldo,
    'pagado_comisiones', r.pagado_comisiones,
    'pagado_acumulado',
      r.pagado_total + r.pagado_sueldo + r.pagado_comisiones,
    'saldo_total',
      r.total_pagar - r.pagado_total - r.pagado_sueldo - r.pagado_comisiones,
    'saldo_sueldo', r.objetivo_sueldo - r.pagado_sueldo,
    'saldo_comisiones', r.objetivo_comisiones - r.pagado_comisiones,
    'modalidad', CASE
      WHEN r.pagado_total > 0 THEN 'TOTAL'
      WHEN r.pagado_sueldo > 0 OR r.pagado_comisiones > 0 THEN 'COMPONENTES'
      ELSE NULL
    END
  )
  FROM resumen r;
$$;

REVOKE ALL ON FUNCTION public.f_private_compensacion_pago_resumen(bigint)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. SINCRONIZACION PRIVADA DEL TOTAL PAGADO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_compensacion_pago_sincronizar(
  p_id_liquidacion bigint,
  p_id_usuario bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_liquidacion public.tb_compensacion_liquidacion%ROWTYPE;
  v_resumen jsonb;
  v_pagado numeric(14, 2);
  v_estado character varying(20);
BEGIN
  SELECT * INTO v_liquidacion
  FROM public.tb_compensacion_liquidacion
  WHERE id = p_id_liquidacion
  FOR UPDATE;

  IF v_liquidacion.id IS NULL THEN
    RAISE EXCEPTION 'La liquidacion no existe';
  END IF;

  v_resumen := public.f_private_compensacion_pago_resumen(p_id_liquidacion);
  v_pagado := (v_resumen ->> 'pagado_acumulado')::numeric;

  IF v_pagado < 0 OR v_pagado > v_liquidacion.total_pagar THEN
    RAISE EXCEPTION 'El acumulado pagado no es consistente con el total aprobado';
  END IF;

  v_estado := CASE
    WHEN v_pagado = 0 THEN 'APROBADA'
    WHEN v_pagado = v_liquidacion.total_pagar THEN 'PAGADA'
    ELSE 'PAGO_PARCIAL'
  END;

  UPDATE public.tb_compensacion_liquidacion
  SET total_pagado = v_pagado,
      estado_liquidacion = v_estado,
      id_usuario_actualiza = p_id_usuario,
      fecha_actualizacion = now()
  WHERE id = p_id_liquidacion;

  RETURN v_resumen || jsonb_build_object('estado_liquidacion', v_estado);
END;
$$;

REVOKE ALL ON FUNCTION public.f_private_compensacion_pago_sincronizar(bigint, bigint)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. DECISION PRIVADA MAKER-CHECKER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_private_compensacion_liquidacion_decidir(
  p_id_liquidacion bigint,
  p_decision character varying,
  p_comentario text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_liquidacion public.tb_compensacion_liquidacion%ROWTYPE;
  v_periodo public.tb_compensacion_periodo%ROWTYPE;
  v_contexto jsonb;
  v_id_actor bigint;
  v_decision character varying(20) := UPPER(TRIM(COALESCE(p_decision, '')));
  v_comentario text := NULLIF(TRIM(p_comentario), '');
  v_estado_liquidacion character varying(20);
  v_estado_periodo character varying(20);
  v_id_aprobacion bigint;
  v_simulacion jsonb;
  v_firma_persistida jsonb;
  v_firma_simulada jsonb;
BEGIN
  IF v_decision NOT IN ('APROBADO', 'RECHAZADO', 'OBSERVADO') THEN
    RAISE EXCEPTION 'La decision debe ser APROBADO, RECHAZADO u OBSERVADO';
  END IF;

  IF v_decision <> 'APROBADO' AND v_comentario IS NULL THEN
    RAISE EXCEPTION 'Debe indicar el motivo de la decision';
  END IF;

  SELECT * INTO v_liquidacion
  FROM public.tb_compensacion_liquidacion
  WHERE id = p_id_liquidacion;

  IF v_liquidacion.id IS NULL THEN
    RAISE EXCEPTION 'La liquidacion no existe';
  END IF;

  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = v_liquidacion.id_periodo
  FOR UPDATE;

  SELECT * INTO v_liquidacion
  FROM public.tb_compensacion_liquidacion
  WHERE id = p_id_liquidacion
  FOR UPDATE;

  IF v_periodo.estado_periodo NOT IN (
    'ABIERTO', 'EN_CALCULO', 'EN_REVISION', 'OBSERVADO', 'REABIERTO'
  ) THEN
    RAISE EXCEPTION 'El periodo no admite decisiones sobre liquidaciones';
  END IF;

  IF v_liquidacion.estado_liquidacion <> 'CALCULADA' THEN
    RAISE EXCEPTION 'Solo una liquidacion calculada puede ser revisada';
  END IF;

  v_contexto := public.f_private_compensacion_liquidacion_validar_alcance(
    v_liquidacion.id_colaborador,
    CASE WHEN v_decision = 'APROBADO' THEN 'APROBAR' ELSE 'REVISAR' END,
    v_periodo.fecha_fin
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF v_liquidacion.id_usuario_calcula = v_id_actor THEN
    RAISE EXCEPTION 'Quien calculo la liquidacion no puede decidirla';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_compensacion_aprobacion a
    WHERE a.id_liquidacion = p_id_liquidacion
  ) THEN
    RAISE EXCEPTION 'La liquidacion ya tiene una decision registrada';
  END IF;

  IF v_decision = 'APROBADO' THEN
    v_simulacion := public.f_private_compensacion_liquidacion_simular(
      v_liquidacion.id_periodo,
      v_liquidacion.id_colaborador
    );

    IF NOT COALESCE((v_simulacion ->> 'puede_calcular')::boolean, false) THEN
      RAISE EXCEPTION
        'La liquidacion no puede aprobarse porque existen bloqueos actuales: %',
        v_simulacion -> 'bloqueos';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'clave_origen', d.clave_origen,
      'id_concepto', d.id_concepto,
      'id_regla', d.id_regla,
      'tipo_origen', d.tipo_origen,
      'categoria', d.categoria_snapshot,
      'naturaleza', d.naturaleza_snapshot,
      'base_calculo', d.base_calculo,
      'cantidad', d.cantidad,
      'tarifa', d.tarifa,
      'importe', d.importe
    ) ORDER BY d.clave_origen), '[]'::jsonb)
    INTO v_firma_persistida
    FROM public.tb_compensacion_liquidacion_detalle d
    WHERE d.id_liquidacion = v_liquidacion.id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'clave_origen', x.linea ->> 'clave_origen',
      'id_concepto', (x.linea ->> 'id_concepto')::bigint,
      'id_regla', NULLIF(x.linea ->> 'id_regla', '')::bigint,
      'tipo_origen', x.linea ->> 'tipo_origen',
      'categoria', x.linea ->> 'categoria',
      'naturaleza', x.linea ->> 'naturaleza',
      'base_calculo', COALESCE((x.linea ->> 'base_calculo')::numeric, 0),
      'cantidad', COALESCE((x.linea ->> 'cantidad')::numeric, 1),
      'tarifa', COALESCE((x.linea ->> 'tarifa')::numeric, 0),
      'importe', (x.linea ->> 'importe')::numeric
    ) ORDER BY x.linea ->> 'clave_origen'), '[]'::jsonb)
    INTO v_firma_simulada
    FROM jsonb_array_elements(v_simulacion -> 'detalles') AS x(linea);

    IF v_firma_persistida IS DISTINCT FROM v_firma_simulada THEN
      RAISE EXCEPTION
        'El calculo quedo desactualizado; debe recalcularse antes de aprobar';
    END IF;
  END IF;

  v_estado_liquidacion := CASE v_decision
    WHEN 'APROBADO' THEN 'APROBADA'
    WHEN 'OBSERVADO' THEN 'OBSERVADA'
    WHEN 'RECHAZADO' THEN 'ANULADA'
  END;
  v_estado_periodo := CASE
    WHEN v_decision = 'APROBADO' THEN 'EN_REVISION'
    ELSE 'OBSERVADO'
  END;

  INSERT INTO public.tb_compensacion_aprobacion (
    alcance, id_liquidacion, numero_paso, etapa, decision, comentario,
    id_usuario_aprueba, datos_decision
  ) VALUES (
    'LIQUIDACION', p_id_liquidacion, 1, 'REVISION_LIQUIDACION',
    v_decision, v_comentario, v_id_actor,
    jsonb_build_object(
      'numero_calculo', v_liquidacion.numero_calculo,
      'total_sueldo', v_liquidacion.total_sueldo,
      'total_bonos', v_liquidacion.total_bonos,
      'total_comisiones', v_liquidacion.total_comisiones,
      'total_descuentos', v_liquidacion.total_descuentos,
      'total_pagar', v_liquidacion.total_pagar,
      'estado_anterior', v_liquidacion.estado_liquidacion
    )
  ) RETURNING id INTO v_id_aprobacion;

  UPDATE public.tb_compensacion_liquidacion
  SET estado_liquidacion = v_estado_liquidacion,
      observacion = COALESCE(v_comentario, observacion),
      fecha_aprobacion = CASE
        WHEN v_decision = 'APROBADO' THEN now()
        ELSE fecha_aprobacion
      END,
      id_usuario_actualiza = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id_liquidacion;

  UPDATE public.tb_compensacion_periodo
  SET estado_periodo = v_estado_periodo,
      id_usuario_actualiza = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = v_periodo.id;

  RETURN jsonb_build_object(
    'id_liquidacion', p_id_liquidacion,
    'id_aprobacion', v_id_aprobacion,
    'decision', v_decision,
    'estado_liquidacion', v_estado_liquidacion,
    'estado_periodo', v_estado_periodo,
    'mensaje', CASE v_decision
      WHEN 'APROBADO' THEN 'Liquidacion aprobada y congelada para pago'
      WHEN 'OBSERVADO' THEN 'Liquidacion observada para recalculo'
      ELSE 'Liquidacion rechazada y anulada'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.f_private_compensacion_liquidacion_decidir(
  bigint, character varying, text
) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. CONTRATOS PUBLICOS DE DECISION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_liquidacion_aprobar(
  p_id_liquidacion bigint,
  p_comentario text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.f_private_compensacion_liquidacion_decidir(
    p_id_liquidacion, 'APROBADO', p_comentario
  );
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_liquidacion_observar(
  p_id_liquidacion bigint,
  p_comentario text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.f_private_compensacion_liquidacion_decidir(
    p_id_liquidacion, 'OBSERVADO', p_comentario
  );
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_liquidacion_rechazar(
  p_id_liquidacion bigint,
  p_comentario text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.f_private_compensacion_liquidacion_decidir(
    p_id_liquidacion, 'RECHAZADO', p_comentario
  );
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_compensacion_liquidacion_reabrir_revision(
  p_id_liquidacion bigint,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_liquidacion public.tb_compensacion_liquidacion%ROWTYPE;
  v_periodo public.tb_compensacion_periodo%ROWTYPE;
  v_contexto jsonb;
  v_id_actor bigint;
  v_motivo text := NULLIF(TRIM(p_motivo), '');
  v_numero_paso integer;
  v_id_aprobacion bigint;
BEGIN
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'El motivo para reabrir la revision es obligatorio';
  END IF;

  SELECT * INTO v_liquidacion
  FROM public.tb_compensacion_liquidacion
  WHERE id = p_id_liquidacion;

  IF v_liquidacion.id IS NULL THEN
    RAISE EXCEPTION 'La liquidacion no existe';
  END IF;

  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = v_liquidacion.id_periodo
  FOR UPDATE;

  SELECT * INTO v_liquidacion
  FROM public.tb_compensacion_liquidacion
  WHERE id = p_id_liquidacion
  FOR UPDATE;

  IF v_periodo.estado_periodo NOT IN ('EN_REVISION', 'OBSERVADO', 'REABIERTO') THEN
    RAISE EXCEPTION 'El periodo no permite reabrir la revision';
  END IF;

  IF v_liquidacion.estado_liquidacion <> 'APROBADA' THEN
    RAISE EXCEPTION 'Solo una liquidacion aprobada puede volver a revision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tb_compensacion_pago
    WHERE id_liquidacion = p_id_liquidacion
  ) THEN
    RAISE EXCEPTION
      'Una liquidacion con movimientos de pago debe corregirse mediante ajuste posterior';
  END IF;

  v_contexto := public.f_private_compensacion_liquidacion_validar_alcance(
    v_liquidacion.id_colaborador, 'APROBAR', v_periodo.fecha_fin
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF v_id_actor = v_liquidacion.id_usuario_calcula THEN
    RAISE EXCEPTION 'Quien calculo la liquidacion no puede reabrir su revision';
  END IF;

  SELECT COALESCE(MAX(a.numero_paso), 0) + 1
  INTO v_numero_paso
  FROM public.tb_compensacion_aprobacion a
  WHERE a.id_liquidacion = p_id_liquidacion;

  INSERT INTO public.tb_compensacion_aprobacion (
    alcance, id_liquidacion, numero_paso, etapa, decision, comentario,
    id_usuario_aprueba, datos_decision
  ) VALUES (
    'LIQUIDACION', p_id_liquidacion, v_numero_paso,
    'REAPERTURA_REVISION', 'OBSERVADO', v_motivo, v_id_actor,
    jsonb_build_object(
      'estado_anterior', v_liquidacion.estado_liquidacion,
      'numero_calculo', v_liquidacion.numero_calculo,
      'fecha_aprobacion_anterior', v_liquidacion.fecha_aprobacion
    )
  ) RETURNING id INTO v_id_aprobacion;

  UPDATE public.tb_compensacion_liquidacion
  SET estado_liquidacion = 'OBSERVADA',
      observacion = v_motivo,
      fecha_aprobacion = NULL,
      id_usuario_actualiza = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = p_id_liquidacion;

  UPDATE public.tb_compensacion_periodo
  SET estado_periodo = 'OBSERVADO',
      fecha_aprobacion = NULL,
      id_usuario_actualiza = v_id_actor,
      fecha_actualizacion = now()
  WHERE id = v_periodo.id;

  RETURN jsonb_build_object(
    'id_liquidacion', p_id_liquidacion,
    'id_aprobacion', v_id_aprobacion,
    'numero_paso', v_numero_paso,
    'estado_liquidacion', 'OBSERVADA',
    'estado_periodo', 'OBSERVADO',
    'mensaje', 'La liquidacion volvio a revision y puede recalcularse'
  );
END;
$$;

-- ============================================================================
-- 5. HISTORIAL DE APROBACION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_liquidacion_aprobacion(
  p_id_liquidacion bigint
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_liquidacion public.tb_compensacion_liquidacion%ROWTYPE;
  v_periodo public.tb_compensacion_periodo%ROWTYPE;
BEGIN
  SELECT * INTO v_liquidacion
  FROM public.tb_compensacion_liquidacion
  WHERE id = p_id_liquidacion;

  IF v_liquidacion.id IS NULL THEN
    RAISE EXCEPTION 'La liquidacion no existe';
  END IF;

  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = v_liquidacion.id_periodo;

  PERFORM public.f_private_compensacion_liquidacion_validar_alcance(
    v_liquidacion.id_colaborador, 'CONSULTAR', v_periodo.fecha_fin
  );

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', a.id,
    'numero_paso', a.numero_paso,
    'etapa', a.etapa,
    'decision', a.decision,
    'comentario', a.comentario,
    'id_usuario_aprueba', a.id_usuario_aprueba,
    'usuario_aprueba', u.nombre,
    'fecha_aprobacion', a.fecha_aprobacion,
    'datos_decision', a.datos_decision
  )
  FROM public.tb_compensacion_aprobacion a
  JOIN public.tb_usuario u ON u.id = a.id_usuario_aprueba
  WHERE a.id_liquidacion = p_id_liquidacion
  ORDER BY a.numero_paso, a.fecha_aprobacion, a.id;
END;
$$;

-- ============================================================================
-- 6. REGISTRO DE PAGO PARCIAL O TOTAL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_pago(
  p_id_liquidacion bigint,
  p_componente character varying,
  p_monto numeric,
  p_fecha_pago timestamp with time zone,
  p_referencia character varying,
  p_medio_pago character varying DEFAULT NULL,
  p_id_cuenta_pago bigint DEFAULT NULL,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_liquidacion public.tb_compensacion_liquidacion%ROWTYPE;
  v_periodo public.tb_compensacion_periodo%ROWTYPE;
  v_contexto jsonb;
  v_id_actor bigint;
  v_componente character varying(20) := UPPER(TRIM(COALESCE(p_componente, '')));
  v_monto numeric(14, 2) := ROUND(COALESCE(p_monto, 0), 2);
  v_referencia text := NULLIF(TRIM(p_referencia), '');
  v_id_cuenta bigint := p_id_cuenta_pago;
  v_resumen jsonb;
  v_saldo numeric(14, 2);
  v_id_pago bigint;
  v_politica_cierre character varying(50);
BEGIN
  IF v_componente NOT IN ('SUELDO', 'COMISIONES', 'TOTAL') THEN
    RAISE EXCEPTION 'El componente debe ser SUELDO, COMISIONES o TOTAL';
  END IF;

  IF v_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor que cero';
  END IF;

  IF p_fecha_pago IS NULL OR p_fecha_pago > now() THEN
    RAISE EXCEPTION 'La fecha del pago es obligatoria y no puede ser futura';
  END IF;

  IF v_referencia IS NULL THEN
    RAISE EXCEPTION 'La referencia del pago es obligatoria';
  END IF;

  IF length(TRIM(p_referencia)) > 200 THEN
    RAISE EXCEPTION 'La referencia del pago no puede superar 200 caracteres';
  END IF;

  IF length(TRIM(COALESCE(p_medio_pago, ''))) > 50 THEN
    RAISE EXCEPTION 'El medio de pago no puede superar 50 caracteres';
  END IF;

  SELECT * INTO v_liquidacion
  FROM public.tb_compensacion_liquidacion
  WHERE id = p_id_liquidacion;

  IF v_liquidacion.id IS NULL THEN
    RAISE EXCEPTION 'La liquidacion no existe';
  END IF;

  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = v_liquidacion.id_periodo
  FOR UPDATE;

  SELECT * INTO v_liquidacion
  FROM public.tb_compensacion_liquidacion
  WHERE id = p_id_liquidacion
  FOR UPDATE;

  IF v_liquidacion.estado_liquidacion NOT IN ('APROBADA', 'PAGO_PARCIAL') THEN
    RAISE EXCEPTION 'Solo se puede pagar una liquidacion aprobada';
  END IF;

  IF v_periodo.estado_periodo = 'CERRADO' THEN
    SELECT c.snapshot_resumen ->> 'politica_pago'
    INTO v_politica_cierre
    FROM public.tb_compensacion_cierre c
    WHERE c.id_periodo = v_periodo.id
      AND c.estado_cierre = 'VIGENTE';

    IF v_politica_cierre IS DISTINCT FROM 'PERMITIR_CUENTAS_POR_PAGAR' THEN
      RAISE EXCEPTION
        'El cierre del periodo no permite registrar pagos posteriores';
    END IF;
  END IF;

  v_contexto := public.f_private_compensacion_liquidacion_validar_alcance(
    v_liquidacion.id_colaborador, 'PAGAR', v_periodo.fecha_fin
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF EXISTS (
    SELECT 1 FROM public.tb_compensacion_pago
    WHERE tipo_movimiento = 'PAGO' AND referencia = v_referencia
  ) THEN
    RAISE EXCEPTION 'La referencia de pago ya fue registrada';
  END IF;

  v_resumen := public.f_private_compensacion_pago_resumen(p_id_liquidacion);

  IF v_componente = 'TOTAL'
     AND COALESCE((v_resumen ->> 'pagado_sueldo')::numeric, 0)
       + COALESCE((v_resumen ->> 'pagado_comisiones')::numeric, 0) > 0 THEN
    RAISE EXCEPTION 'La liquidacion ya usa pagos separados por componentes';
  END IF;

  IF v_componente IN ('SUELDO', 'COMISIONES')
     AND COALESCE((v_resumen ->> 'pagado_total')::numeric, 0) > 0 THEN
    RAISE EXCEPTION 'La liquidacion ya usa pagos por total';
  END IF;

  v_saldo := CASE v_componente
    WHEN 'TOTAL' THEN (v_resumen ->> 'saldo_total')::numeric
    WHEN 'SUELDO' THEN (v_resumen ->> 'saldo_sueldo')::numeric
    WHEN 'COMISIONES' THEN (v_resumen ->> 'saldo_comisiones')::numeric
  END;

  IF v_monto > v_saldo THEN
    RAISE EXCEPTION 'El monto excede el saldo del componente: %', v_saldo;
  END IF;

  IF v_id_cuenta IS NULL THEN
    SELECT cp.id INTO v_id_cuenta
    FROM public.tb_compensacion_cuenta_pago cp
    JOIN public.tb_estado e ON e.id = cp.id_estado
    WHERE cp.id_colaborador = v_liquidacion.id_colaborador
      AND cp.moneda = 'PEN'
      AND cp.es_principal
      AND UPPER(e.nombre) = 'ACTIVO'
      AND cp.fecha_inicio <= p_fecha_pago::date
      AND (cp.fecha_fin IS NULL OR cp.fecha_fin >= p_fecha_pago::date)
    ORDER BY cp.fecha_inicio DESC, cp.id DESC
    LIMIT 1;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.tb_compensacion_cuenta_pago cp
      JOIN public.tb_estado e ON e.id = cp.id_estado
      WHERE cp.id = v_id_cuenta
        AND cp.id_colaborador = v_liquidacion.id_colaborador
        AND cp.moneda = 'PEN'
        AND UPPER(e.nombre) = 'ACTIVO'
        AND cp.fecha_inicio <= p_fecha_pago::date
        AND (cp.fecha_fin IS NULL OR cp.fecha_fin >= p_fecha_pago::date)
    ) THEN
      RAISE EXCEPTION 'La cuenta no pertenece al colaborador o no estaba vigente';
    END IF;
  END IF;

  INSERT INTO public.tb_compensacion_pago (
    id_liquidacion, tipo_movimiento, componente, monto, moneda,
    fecha_pago, medio_pago, referencia, id_cuenta_pago,
    observacion, id_usuario
  ) VALUES (
    p_id_liquidacion, 'PAGO', v_componente, v_monto, 'PEN',
    p_fecha_pago, NULLIF(TRIM(p_medio_pago), ''), v_referencia,
    v_id_cuenta, NULLIF(TRIM(p_observacion), ''), v_id_actor
  ) RETURNING id INTO v_id_pago;

  v_resumen := public.f_private_compensacion_pago_sincronizar(
    p_id_liquidacion, v_id_actor
  );

  RETURN jsonb_build_object(
    'id_pago', v_id_pago,
    'id_liquidacion', p_id_liquidacion,
    'componente', v_componente,
    'monto', v_monto,
    'referencia', v_referencia,
    'resumen', v_resumen,
    'mensaje', 'Pago registrado'
  );
END;
$$;

-- ============================================================================
-- 7. REVERSA AUTORIZADA DE PAGO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_post_tb_compensacion_pago_reversar(
  p_id_pago bigint,
  p_referencia character varying,
  p_motivo text,
  p_fecha_reversa timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_pago public.tb_compensacion_pago%ROWTYPE;
  v_liquidacion public.tb_compensacion_liquidacion%ROWTYPE;
  v_periodo public.tb_compensacion_periodo%ROWTYPE;
  v_contexto jsonb;
  v_id_actor bigint;
  v_referencia text := NULLIF(TRIM(p_referencia), '');
  v_motivo text := NULLIF(TRIM(p_motivo), '');
  v_id_reversa bigint;
  v_resumen jsonb;
  v_cierre public.tb_compensacion_cierre%ROWTYPE;
BEGIN
  IF v_referencia IS NULL OR v_motivo IS NULL THEN
    RAISE EXCEPTION 'La referencia y el motivo de la reversa son obligatorios';
  END IF;

  IF length(TRIM(p_referencia)) > 200 THEN
    RAISE EXCEPTION 'La referencia de reversa no puede superar 200 caracteres';
  END IF;

  IF p_fecha_reversa IS NULL OR p_fecha_reversa > now() THEN
    RAISE EXCEPTION 'La fecha de reversa no puede ser futura';
  END IF;

  SELECT * INTO v_pago
  FROM public.tb_compensacion_pago
  WHERE id = p_id_pago;

  IF v_pago.id IS NULL OR v_pago.tipo_movimiento <> 'PAGO' THEN
    RAISE EXCEPTION 'El pago de origen no existe o no es reversible';
  END IF;

  SELECT * INTO v_liquidacion
  FROM public.tb_compensacion_liquidacion
  WHERE id = v_pago.id_liquidacion;

  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = v_liquidacion.id_periodo
  FOR UPDATE;

  SELECT * INTO v_liquidacion
  FROM public.tb_compensacion_liquidacion
  WHERE id = v_pago.id_liquidacion
  FOR UPDATE;

  SELECT * INTO v_pago
  FROM public.tb_compensacion_pago
  WHERE id = p_id_pago
  FOR UPDATE;

  IF p_fecha_reversa < v_pago.fecha_pago THEN
    RAISE EXCEPTION 'La reversa no puede ser anterior al pago original';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tb_compensacion_pago
    WHERE id_pago_origen = p_id_pago AND tipo_movimiento = 'REVERSA'
  ) THEN
    RAISE EXCEPTION 'El pago ya fue reversado';
  END IF;

  IF v_periodo.estado_periodo = 'CERRADO' THEN
    SELECT * INTO v_cierre
    FROM public.tb_compensacion_cierre
    WHERE id_periodo = v_periodo.id
      AND estado_cierre = 'VIGENTE';

    IF v_cierre.id IS NULL
       OR v_cierre.snapshot_resumen ->> 'politica_pago'
         IS DISTINCT FROM 'PERMITIR_CUENTAS_POR_PAGAR' THEN
      RAISE EXCEPTION
        'El cierre del periodo no permite reversar pagos posteriores';
    END IF;

    IF v_pago.fecha_registro <= v_cierre.fecha_cierre THEN
      RAISE EXCEPTION
        'Para reversar un pago congelado por el cierre debe reabrir el periodo';
    END IF;
  END IF;

  v_contexto := public.f_private_compensacion_liquidacion_validar_alcance(
    v_liquidacion.id_colaborador, 'PAGAR', v_periodo.fecha_fin
  );
  v_id_actor := (v_contexto ->> 'id_usuario')::bigint;

  IF EXISTS (
    SELECT 1 FROM public.tb_compensacion_pago
    WHERE tipo_movimiento = 'REVERSA' AND referencia = v_referencia
  ) THEN
    RAISE EXCEPTION 'La referencia de reversa ya fue registrada';
  END IF;

  INSERT INTO public.tb_compensacion_pago (
    id_liquidacion, tipo_movimiento, componente, monto, moneda,
    fecha_pago, medio_pago, referencia, id_cuenta_pago, id_pago_origen,
    observacion, id_usuario
  ) VALUES (
    v_pago.id_liquidacion, 'REVERSA', v_pago.componente, v_pago.monto,
    v_pago.moneda, p_fecha_reversa, v_pago.medio_pago, v_referencia,
    v_pago.id_cuenta_pago, v_pago.id, v_motivo, v_id_actor
  ) RETURNING id INTO v_id_reversa;

  v_resumen := public.f_private_compensacion_pago_sincronizar(
    v_pago.id_liquidacion, v_id_actor
  );

  RETURN jsonb_build_object(
    'id_reversa', v_id_reversa,
    'id_pago_origen', v_pago.id,
    'id_liquidacion', v_pago.id_liquidacion,
    'monto', v_pago.monto,
    'resumen', v_resumen,
    'mensaje', 'Pago reversado sin eliminar el movimiento original'
  );
END;
$$;

-- ============================================================================
-- 8. CONSULTA DE PAGOS Y SALDOS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_pago(
  p_id_liquidacion bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_liquidacion public.tb_compensacion_liquidacion%ROWTYPE;
  v_periodo public.tb_compensacion_periodo%ROWTYPE;
  v_resumen jsonb;
  v_movimientos jsonb;
BEGIN
  SELECT * INTO v_liquidacion
  FROM public.tb_compensacion_liquidacion
  WHERE id = p_id_liquidacion;

  IF v_liquidacion.id IS NULL THEN
    RAISE EXCEPTION 'La liquidacion no existe';
  END IF;

  SELECT * INTO v_periodo
  FROM public.tb_compensacion_periodo
  WHERE id = v_liquidacion.id_periodo;

  PERFORM public.f_private_compensacion_liquidacion_validar_alcance(
    v_liquidacion.id_colaborador, 'CONSULTAR', v_periodo.fecha_fin
  );

  v_resumen := public.f_private_compensacion_pago_resumen(p_id_liquidacion);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'tipo_movimiento', p.tipo_movimiento,
    'componente', p.componente,
    'monto', p.monto,
    'moneda', p.moneda,
    'fecha_pago', p.fecha_pago,
    'medio_pago', p.medio_pago,
    'referencia', p.referencia,
    'id_cuenta_pago', p.id_cuenta_pago,
    'id_pago_origen', p.id_pago_origen,
    'observacion', p.observacion,
    'id_usuario', p.id_usuario,
    'usuario', u.nombre,
    'fecha_registro', p.fecha_registro
  ) ORDER BY p.fecha_pago, p.id), '[]'::jsonb)
  INTO v_movimientos
  FROM public.tb_compensacion_pago p
  JOIN public.tb_usuario u ON u.id = p.id_usuario
  WHERE p.id_liquidacion = p_id_liquidacion;

  RETURN jsonb_build_object(
    'id_liquidacion', p_id_liquidacion,
    'estado_liquidacion', v_liquidacion.estado_liquidacion,
    'resumen', v_resumen,
    'movimientos', v_movimientos
  );
END;
$$;

-- ============================================================================
-- 9. BANDEJA DE SALDOS PARA APOYO AL PAGO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_get_tb_compensacion_pago_pendiente(
  p_id_periodo bigint,
  p_busqueda character varying DEFAULT NULL,
  p_pagina integer DEFAULT 1,
  p_tamano_pagina integer DEFAULT 100
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
  v_id_sucursal_alcance bigint;
  v_pagina integer := GREATEST(COALESCE(p_pagina, 1), 1);
  v_tamano integer := LEAST(GREATEST(COALESCE(p_tamano_pagina, 100), 1), 500);
  v_total bigint;
  v_items jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tb_compensacion_periodo WHERE id = p_id_periodo) THEN
    RAISE EXCEPTION 'El periodo no existe';
  END IF;

  v_contexto := public.f_private_compensacion_contexto('LIQUIDACIONES', 'PAGAR');
  v_alcance := v_contexto ->> 'alcance';
  v_id_sucursal_alcance := NULLIF(v_contexto ->> 'id_sucursal_alcance', '')::bigint;

  IF v_alcance = 'PROPIO' THEN
    RAISE EXCEPTION 'El registro de pagos requiere alcance de sede o global';
  END IF;

  WITH base AS (
    SELECT
      l.id,
      l.id_periodo,
      l.id_colaborador,
      l.estado_liquidacion,
      l.total_pagar,
      l.total_pagado,
      l.total_pagar - l.total_pagado AS saldo_pendiente,
      c.nombre_completo,
      c.numero_documento,
      cp.id AS id_cuenta_pago,
      b.nombre AS banco,
      cp.tipo_cuenta,
      cp.moneda,
      cp.numero_cuenta,
      cp.numero_cci,
      cp.titular,
      public.f_private_compensacion_pago_resumen(l.id) AS resumen_pago
    FROM public.tb_compensacion_liquidacion l
    JOIN public.tb_compensacion_colaborador c ON c.id = l.id_colaborador
    LEFT JOIN LATERAL (
      SELECT x.*
      FROM public.tb_compensacion_cuenta_pago x
      JOIN public.tb_estado e ON e.id = x.id_estado
      WHERE x.id_colaborador = l.id_colaborador
        AND x.moneda = 'PEN'
        AND x.es_principal
        AND UPPER(e.nombre) = 'ACTIVO'
        AND x.fecha_inicio <= CURRENT_DATE
        AND (x.fecha_fin IS NULL OR x.fecha_fin >= CURRENT_DATE)
      ORDER BY x.fecha_inicio DESC, x.id DESC
      LIMIT 1
    ) cp ON true
    LEFT JOIN public.tb_banco b ON b.id = cp.id_banco
    WHERE l.id_periodo = p_id_periodo
      AND l.estado_liquidacion IN ('APROBADA', 'PAGO_PARCIAL')
      AND l.total_pagado < l.total_pagar
      AND (
        p_busqueda IS NULL
        OR c.nombre_completo ILIKE '%' || TRIM(p_busqueda) || '%'
        OR c.numero_documento ILIKE '%' || TRIM(p_busqueda) || '%'
      )
      AND (
        v_alcance = 'GLOBAL'
        OR (v_alcance = 'SEDE' AND EXISTS (
          SELECT 1
          FROM public.tb_compensacion_liquidacion_tramo t
          WHERE t.id_liquidacion = l.id
            AND (t.asignacion_snapshot ->> 'id_sucursal')::bigint = v_id_sucursal_alcance
        ))
      )
  ), conteo AS (
    SELECT COUNT(*) AS total FROM base
  ), pagina AS (
    SELECT * FROM base
    ORDER BY nombre_completo, id
    LIMIT v_tamano OFFSET (v_pagina - 1) * v_tamano
  )
  SELECT conteo.total,
         COALESCE(
           jsonb_agg(to_jsonb(pagina) ORDER BY pagina.nombre_completo, pagina.id)
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
-- 10. PERMISOS RPC
-- ============================================================================

REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_liquidacion_aprobar(
  bigint, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_liquidacion_aprobar(
  bigint, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_liquidacion_observar(
  bigint, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_liquidacion_observar(
  bigint, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_liquidacion_rechazar(
  bigint, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_liquidacion_rechazar(
  bigint, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_patch_tb_compensacion_liquidacion_reabrir_revision(
  bigint, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_compensacion_liquidacion_reabrir_revision(
  bigint, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_liquidacion_aprobacion(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_liquidacion_aprobacion(bigint)
  TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_pago(
  bigint, character varying, numeric, timestamp with time zone,
  character varying, character varying, bigint, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_pago(
  bigint, character varying, numeric, timestamp with time zone,
  character varying, character varying, bigint, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_post_tb_compensacion_pago_reversar(
  bigint, character varying, text, timestamp with time zone
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_post_tb_compensacion_pago_reversar(
  bigint, character varying, text, timestamp with time zone
) TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_pago(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_pago(bigint)
  TO authenticated;

REVOKE ALL ON FUNCTION public.f_get_tb_compensacion_pago_pendiente(
  bigint, character varying, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f_get_tb_compensacion_pago_pendiente(
  bigint, character varying, integer, integer
) TO authenticated;

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
  'f_private_compensacion_liquidacion_decidir',
  'f_patch_tb_compensacion_liquidacion_reabrir_revision',
  'f_post_tb_compensacion_pago',
  'f_post_tb_compensacion_pago_reversar'
)
ORDER BY n.nspname, p.proname;
