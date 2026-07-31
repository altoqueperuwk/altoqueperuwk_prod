-- ============================================================================
-- RECAUDACION: CORTES, DIAS HABILES Y ABONOS
-- ============================================================================
--
-- Objetivo:
--   Administrar reglas de abono por cuenta, agrupar operaciones retenidas en
--   lotes de corte y liberar retenciones vencidas por RPC/job controlado.

CREATE TABLE IF NOT EXISTS public.tb_calendario_habil (
  fecha date PRIMARY KEY,
  flag_habil boolean NOT NULL DEFAULT true,
  tipo_dia character varying NOT NULL DEFAULT 'HABIL',
  descripcion character varying,
  id_estado bigint NOT NULL DEFAULT 1,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tb_recaudacion_regla_abono (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ruta character varying NOT NULL,
  id_empresa bigint NOT NULL,
  id_empresa_cuenta_bancaria bigint NOT NULL,
  hora_corte time without time zone NOT NULL DEFAULT '00:00',
  dias_habiles_abono integer NOT NULL DEFAULT 1,
  hora_liberacion time without time zone NOT NULL DEFAULT '06:00',
  flag_liberacion_automatica boolean NOT NULL DEFAULT false,
  id_estado bigint NOT NULL DEFAULT 1,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tb_recaudacion_regla_abono_ruta_cuenta
  ON public.tb_recaudacion_regla_abono (lower(ruta), id_empresa_cuenta_bancaria);

-- Migracion de compatibilidad:
-- Las retenciones ya no se gobiernan desde tb_empresa_cuenta_bancaria.
-- Si alguna cuenta venia marcada con el flujo anterior, se convierte en regla
-- activa de abono y luego se apagan los flags legados para evitar doble fuente.
INSERT INTO public.tb_recaudacion_regla_abono (
  ruta,
  id_empresa,
  id_empresa_cuenta_bancaria,
  hora_corte,
  dias_habiles_abono,
  hora_liberacion,
  flag_liberacion_automatica,
  id_estado,
  id_usuario
)
SELECT DISTINCT
  LOWER(roc.ruta),
  ecb.id_empresa,
  ecb.id,
  CASE
    WHEN LOWER(roc.ruta) IN ('scotiabank', 'banbif') THEN '21:00'::time
    ELSE '00:00'::time
  END,
  CASE
    WHEN LOWER(roc.ruta) = 'safetypay' THEN 2
    ELSE 1
  END,
  '06:00'::time,
  false,
  1,
  ecb.id_usuario
FROM public.tb_empresa_cuenta_bancaria ecb
JOIN public.tb_ruta_operacion_caja roc
  ON roc.id_empresa = ecb.id_empresa
 AND roc.id_empresa_cuenta_bancaria = ecb.id
WHERE COALESCE(ecb.flag_retencion, false) = true
   OR COALESCE(ecb.flag_retencion_parcial, false) = true
ON CONFLICT ((LOWER(ruta)), id_empresa_cuenta_bancaria) DO UPDATE
SET id_estado = 1,
    fecha_actualizacion = now();

UPDATE public.tb_empresa_cuenta_bancaria
SET flag_retencion = false,
    flag_retencion_parcial = false
WHERE COALESCE(flag_retencion, false) = true
   OR COALESCE(flag_retencion_parcial, false) = true;

/*
Funcion: f_get_tb_recaudacion_cuenta_flag_retenida
Objetivo:
  Indicar si una cuenta/ruta tiene contrato activo de retencion por regla de
  abono. Reemplaza a flag_retencion y flag_retencion_parcial de cuenta.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_recaudacion_cuenta_flag_retenida(
  p_ruta character varying,
  p_id_empresa_cuenta_bancaria bigint
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  IF p_ruta IS NULL OR p_id_empresa_cuenta_bancaria IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.tb_recaudacion_regla_abono r
    WHERE LOWER(r.ruta) = LOWER(p_ruta)
      AND r.id_empresa_cuenta_bancaria = p_id_empresa_cuenta_bancaria
      AND COALESCE(r.id_estado, 1) = 1
  );
END;
$$;

CREATE TABLE IF NOT EXISTS public.tb_recaudacion_lote (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ruta character varying NOT NULL,
  id_empresa bigint NOT NULL,
  id_empresa_cuenta_bancaria bigint NOT NULL,
  fecha_inicio timestamp with time zone NOT NULL,
  fecha_corte timestamp with time zone NOT NULL,
  fecha_estimada_abono date NOT NULL,
  fecha_liberacion timestamp with time zone NOT NULL,
  fecha_abono_real timestamp with time zone,
  estado character varying NOT NULL DEFAULT 'PENDIENTE_CORTE',
  total_operaciones integer NOT NULL DEFAULT 0,
  monto_total numeric NOT NULL DEFAULT 0,
  id_estado bigint NOT NULL DEFAULT 1,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tb_recaudacion_lote_ruta_cuenta_corte
  ON public.tb_recaudacion_lote (lower(ruta), id_empresa_cuenta_bancaria, fecha_corte);

CREATE TABLE IF NOT EXISTS public.tb_recaudacion_lote_operacion (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_lote bigint NOT NULL REFERENCES public.tb_recaudacion_lote(id) ON DELETE CASCADE,
  id_operacion_proceso bigint NOT NULL REFERENCES public.tb_operacion_proceso(id) ON DELETE CASCADE,
  id_operacion_caja bigint,
  monto numeric NOT NULL DEFAULT 0,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tb_recaudacion_lote_operacion_unique
  ON public.tb_recaudacion_lote_operacion (id_operacion_proceso);

/*
Funcion: f_get_tb_calendario_habil_sumar
Objetivo:
  Sumar dias habiles usando calendario administrado y fallback lunes-viernes.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_calendario_habil_sumar(
  p_fecha_base date,
  p_dias_habiles integer
)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_fecha date := p_fecha_base;
  v_restantes integer := GREATEST(COALESCE(p_dias_habiles, 0), 0);
  v_flag_habil boolean;
BEGIN
  IF p_fecha_base IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_restantes = 0 THEN
    RETURN v_fecha;
  END IF;

  WHILE v_restantes > 0 LOOP
    v_fecha := v_fecha + 1;

    SELECT ch.flag_habil
    INTO v_flag_habil
    FROM public.tb_calendario_habil ch
    WHERE ch.fecha = v_fecha
      AND COALESCE(ch.id_estado, 1) = 1;

    IF COALESCE(v_flag_habil, EXTRACT(ISODOW FROM v_fecha) BETWEEN 1 AND 5) THEN
      v_restantes := v_restantes - 1;
    END IF;
  END LOOP;

  RETURN v_fecha;
END;
$$;

/*
Funcion: f_get_tb_recaudacion_fecha_liberacion
Objetivo:
  Calcular corte, fecha estimada de abono y fecha/hora liberable por cuenta.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_recaudacion_fecha_liberacion(
  p_id_empresa_cuenta_bancaria bigint,
  p_fecha_deposito timestamp with time zone,
  p_ruta character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_regla public.tb_recaudacion_regla_abono%ROWTYPE;
  v_deposito_local timestamp without time zone;
  v_fecha_corte_local timestamp without time zone;
  v_fecha_estimada date;
  v_fecha_liberacion timestamp with time zone;
BEGIN
  IF p_id_empresa_cuenta_bancaria IS NULL OR p_fecha_deposito IS NULL THEN
    RETURN jsonb_build_object('error', 'Cuenta y fecha de deposito son requeridas.');
  END IF;

  SELECT r.*
  INTO v_regla
  FROM public.tb_recaudacion_regla_abono r
  WHERE r.id_empresa_cuenta_bancaria = p_id_empresa_cuenta_bancaria
    AND (p_ruta IS NULL OR LOWER(r.ruta) = LOWER(p_ruta))
    AND COALESCE(r.id_estado, 1) = 1
  ORDER BY CASE WHEN p_ruta IS NOT NULL AND LOWER(r.ruta) = LOWER(p_ruta) THEN 0 ELSE 1 END, r.id
  LIMIT 1;

  IF v_regla.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No existe regla activa de abono para la cuenta.');
  END IF;

  v_deposito_local := p_fecha_deposito AT TIME ZONE 'America/Lima';

  IF v_deposito_local::time < v_regla.hora_corte THEN
    v_fecha_corte_local := v_deposito_local::date + v_regla.hora_corte;
  ELSE
    v_fecha_corte_local := (v_deposito_local::date + 1) + v_regla.hora_corte;
  END IF;

  v_fecha_estimada := public.f_get_tb_calendario_habil_sumar(v_fecha_corte_local::date, v_regla.dias_habiles_abono);
  v_fecha_liberacion := ((v_fecha_estimada + v_regla.hora_liberacion)::timestamp AT TIME ZONE 'America/Lima');

  RETURN jsonb_build_object(
    'id_regla_abono', v_regla.id,
    'ruta', v_regla.ruta,
    'id_empresa', v_regla.id_empresa,
    'id_empresa_cuenta_bancaria', v_regla.id_empresa_cuenta_bancaria,
    'hora_corte', to_char(v_regla.hora_corte, 'HH24:MI'),
    'dias_habiles_abono', v_regla.dias_habiles_abono,
    'hora_liberacion', to_char(v_regla.hora_liberacion, 'HH24:MI'),
    'flag_liberacion_automatica', v_regla.flag_liberacion_automatica,
    'fecha_corte', (v_fecha_corte_local AT TIME ZONE 'America/Lima'),
    'fecha_estimada_abono', v_fecha_estimada,
    'fecha_liberacion', v_fecha_liberacion,
    'liberable', now() >= v_fecha_liberacion
  );
END;
$$;

/*
Funcion: f_sync_tb_recaudacion_lotes
Objetivo:
  Agrupar operaciones retenidas abiertas en lotes de corte/abono.
*/
CREATE OR REPLACE FUNCTION public.f_sync_tb_recaudacion_lotes(
  p_ruta character varying DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_op record;
  v_info jsonb;
  v_lote_id bigint;
  v_creados integer := 0;
  v_relaciones integer := 0;
BEGIN
  FOR v_op IN
    SELECT op.*
    FROM public.tb_operacion_proceso op
    JOIN public.tb_recaudacion_regla_abono r
      ON r.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_ingreso
     AND LOWER(r.ruta) = LOWER(COALESCE(op.ruta_destino, op.ruta_origen))
     AND COALESCE(r.id_estado, 1) = 1
    WHERE COALESCE(op.flag_retenido, false) = true
      AND op.id_caja_cierre IS NULL
      AND op.fecha_deposito_cliente IS NOT NULL
      AND (p_ruta IS NULL OR LOWER(COALESCE(op.ruta_destino, op.ruta_origen)) = LOWER(p_ruta))
      AND (p_id_empresa_cuenta_bancaria IS NULL OR op.id_empresa_cuenta_ingreso = p_id_empresa_cuenta_bancaria)
  LOOP
    v_info := public.f_get_tb_recaudacion_fecha_liberacion(
      v_op.id_empresa_cuenta_ingreso,
      v_op.fecha_deposito_cliente,
      COALESCE(v_op.ruta_destino, v_op.ruta_origen)
    );

    IF v_info ? 'error' THEN
      CONTINUE;
    END IF;

    SELECT l.id
    INTO v_lote_id
    FROM public.tb_recaudacion_lote l
    WHERE LOWER(l.ruta) = LOWER(COALESCE(v_op.ruta_destino, v_op.ruta_origen))
      AND l.id_empresa_cuenta_bancaria = v_op.id_empresa_cuenta_ingreso
      AND l.fecha_corte = (v_info->>'fecha_corte')::timestamp with time zone
    LIMIT 1;

    IF v_lote_id IS NULL THEN
      INSERT INTO public.tb_recaudacion_lote (
        ruta,
        id_empresa,
        id_empresa_cuenta_bancaria,
        fecha_inicio,
        fecha_corte,
        fecha_estimada_abono,
        fecha_liberacion,
        estado,
        id_usuario
      )
      VALUES (
        LOWER(COALESCE(v_op.ruta_destino, v_op.ruta_origen)),
        v_op.id_empresa_ingreso,
        v_op.id_empresa_cuenta_ingreso,
        ((v_info->>'fecha_corte')::timestamp with time zone - interval '1 day'),
        (v_info->>'fecha_corte')::timestamp with time zone,
        (v_info->>'fecha_estimada_abono')::date,
        (v_info->>'fecha_liberacion')::timestamp with time zone,
        CASE
          WHEN now() < (v_info->>'fecha_corte')::timestamp with time zone THEN 'PENDIENTE_CORTE'
          ELSE 'PENDIENTE_ABONO'
        END,
        p_id_usuario
      )
      RETURNING id INTO v_lote_id;
      v_creados := v_creados + 1;
    END IF;

    INSERT INTO public.tb_recaudacion_lote_operacion (
      id_lote,
      id_operacion_proceso,
      id_operacion_caja,
      monto
    )
    SELECT
      v_lote_id,
      v_op.id,
      oc.id,
      COALESCE(v_op.monto_deposito_cliente, 0)
    FROM public.tb_operacion_caja oc
    WHERE oc.id_operacion_proceso = v_op.id
      AND UPPER(COALESCE(oc.tipo_movimiento, '')) = 'INGRESO'
    ORDER BY oc.id
    LIMIT 1
    ON CONFLICT (id_operacion_proceso) DO UPDATE
      SET id_lote = EXCLUDED.id_lote,
          id_operacion_caja = EXCLUDED.id_operacion_caja,
          monto = EXCLUDED.monto;

    v_relaciones := v_relaciones + 1;
  END LOOP;

  UPDATE public.tb_recaudacion_lote l
  SET total_operaciones = COALESCE(x.total_operaciones, 0),
      monto_total = COALESCE(x.monto_total, 0),
      estado = CASE
        WHEN COALESCE(x.total_retenidas, 0) = 0 AND COALESCE(x.total_operaciones, 0) > 0 THEN 'ABONADO'
        WHEN now() < l.fecha_corte THEN 'PENDIENTE_CORTE'
        ELSE 'PENDIENTE_ABONO'
      END,
      fecha_abono_real = CASE
        WHEN COALESCE(x.total_retenidas, 0) = 0 AND COALESCE(x.total_operaciones, 0) > 0 THEN COALESCE(l.fecha_abono_real, now())
        ELSE l.fecha_abono_real
      END,
      fecha_actualizacion = now()
  FROM (
    SELECT
      lo.id_lote,
      COUNT(*)::integer AS total_operaciones,
      SUM(COALESCE(lo.monto, 0)) AS monto_total,
      COUNT(*) FILTER (WHERE COALESCE(op.flag_retenido, false) = true)::integer AS total_retenidas
    FROM public.tb_recaudacion_lote_operacion lo
    JOIN public.tb_operacion_proceso op ON op.id = lo.id_operacion_proceso
    GROUP BY lo.id_lote
  ) x
  WHERE x.id_lote = l.id
    AND (p_ruta IS NULL OR LOWER(l.ruta) = LOWER(p_ruta))
    AND (p_id_empresa_cuenta_bancaria IS NULL OR l.id_empresa_cuenta_bancaria = p_id_empresa_cuenta_bancaria);

  RETURN jsonb_build_object(
    'lotes_creados', v_creados,
    'operaciones_sincronizadas', v_relaciones
  );
END;
$$;

/*
Funcion: f_run_tb_recaudacion_liberar_retenciones
Objetivo:
  Liberar retenciones vencidas segun reglas activas con liberacion automatica.
*/
CREATE OR REPLACE FUNCTION public.f_run_tb_recaudacion_liberar_retenciones(
  p_ruta character varying DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_op record;
  v_info jsonb;
  v_usuario character varying := 'Sistema';
  v_result jsonb;
  v_liberadas integer := 0;
  v_omitidas integer := 0;
  v_errores integer := 0;
  v_detalle jsonb := '[]'::jsonb;
BEGIN
  IF p_id_usuario IS NOT NULL THEN
    SELECT COALESCE(u.nombre, 'Sistema')
    INTO v_usuario
    FROM public.tb_usuario u
    WHERE u.id = p_id_usuario
    LIMIT 1;
  END IF;

  PERFORM public.f_sync_tb_recaudacion_lotes(p_ruta, p_id_empresa_cuenta_bancaria, p_id_usuario);

  FOR v_op IN
    SELECT op.*
    FROM public.tb_operacion_proceso op
    JOIN public.tb_recaudacion_regla_abono r
      ON r.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_ingreso
     AND LOWER(r.ruta) = LOWER(COALESCE(op.ruta_destino, op.ruta_origen))
     AND COALESCE(r.id_estado, 1) = 1
    WHERE COALESCE(op.flag_retenido, false) = true
      AND op.id_caja_cierre IS NULL
      AND COALESCE(r.flag_liberacion_automatica, false) = true
      AND (p_ruta IS NULL OR LOWER(COALESCE(op.ruta_destino, op.ruta_origen)) = LOWER(p_ruta))
      AND (p_id_empresa_cuenta_bancaria IS NULL OR op.id_empresa_cuenta_ingreso = p_id_empresa_cuenta_bancaria)
  LOOP
    v_info := public.f_get_tb_recaudacion_fecha_liberacion(
      v_op.id_empresa_cuenta_ingreso,
      v_op.fecha_deposito_cliente,
      COALESCE(v_op.ruta_destino, v_op.ruta_origen)
    );

    IF v_info ? 'error' OR COALESCE((v_info->>'liberable')::boolean, false) = false THEN
      v_omitidas := v_omitidas + 1;
      CONTINUE;
    END IF;

    v_result := public.f_patch_tb_operacion_proceso_confirmar_retencion(v_op.id, p_id_usuario, v_usuario);

    IF v_result ? 'error' THEN
      v_errores := v_errores + 1;
      v_detalle := v_detalle || jsonb_build_object('id_operacion', v_op.id, 'estado', 'ERROR', 'motivo', v_result->>'error');
    ELSE
      v_liberadas := v_liberadas + 1;
      v_detalle := v_detalle || jsonb_build_object('id_operacion', v_op.id, 'estado', 'LIBERADO');
    END IF;
  END LOOP;

  PERFORM public.f_sync_tb_recaudacion_lotes(p_ruta, p_id_empresa_cuenta_bancaria, p_id_usuario);

  RETURN jsonb_build_object(
    'operaciones_liberadas', v_liberadas,
    'operaciones_omitidas', v_omitidas,
    'operaciones_error', v_errores,
    'detalle', v_detalle
  );
END;
$$;

/*
Funcion: f_patch_tb_recaudacion_confirmar_si_vencida
Objetivo:
  Confirmar inmediatamente una retencion recien creada si su abono ya vencio.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_recaudacion_confirmar_si_vencida(
  p_id_operacion_proceso bigint,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_op public.tb_operacion_proceso%ROWTYPE;
  v_info jsonb;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_op
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion_proceso;

  IF v_op.id IS NULL OR COALESCE(v_op.flag_retenido, false) = false THEN
    RETURN jsonb_build_object('confirmado', false);
  END IF;

  v_info := public.f_get_tb_recaudacion_fecha_liberacion(
    v_op.id_empresa_cuenta_ingreso,
    v_op.fecha_deposito_cliente,
    COALESCE(v_op.ruta_destino, v_op.ruta_origen)
  );

  IF v_info ? 'error' THEN
    RETURN jsonb_build_object('confirmado', false, 'motivo', v_info->>'error');
  END IF;

  PERFORM public.f_sync_tb_recaudacion_lotes(COALESCE(v_op.ruta_destino, v_op.ruta_origen), v_op.id_empresa_cuenta_ingreso, p_id_usuario);

  IF COALESCE((v_info->>'flag_liberacion_automatica')::boolean, false) = false
     OR COALESCE((v_info->>'liberable')::boolean, false) = false THEN
    RETURN jsonb_build_object('confirmado', false);
  END IF;

  v_result := public.f_patch_tb_operacion_proceso_confirmar_retencion(
    v_op.id,
    p_id_usuario,
    COALESCE(p_nombre_usuario, 'Sistema')
  );

  PERFORM public.f_sync_tb_recaudacion_lotes(COALESCE(v_op.ruta_destino, v_op.ruta_origen), v_op.id_empresa_cuenta_ingreso, p_id_usuario);

  IF v_result ? 'error' THEN
    RETURN jsonb_build_object('confirmado', false, 'motivo', v_result->>'error');
  END IF;

  RETURN jsonb_build_object('confirmado', true, 'id_operacion', v_op.id);
END;
$$;

/*
Funcion: f_get_tb_recaudacion_regla_abono
Objetivo:
  Listar reglas de abono para configuracion operativa.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_recaudacion_regla_abono(
  p_ruta character varying DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT to_jsonb(r) || jsonb_build_object(
    'empresa', e.nombre,
    'banco', b.nombre,
    'estado', es.nombre
  )
  FROM public.tb_recaudacion_regla_abono r
  LEFT JOIN public.tb_empresa e ON e.id = r.id_empresa
  LEFT JOIN public.tb_empresa_cuenta_bancaria cb ON cb.id = r.id_empresa_cuenta_bancaria
  LEFT JOIN public.tb_banco b ON b.id = cb.id_banco
  LEFT JOIN public.tb_estado es ON es.id = r.id_estado
  WHERE (p_ruta IS NULL OR LOWER(r.ruta) = LOWER(p_ruta))
    AND (p_id_empresa_cuenta_bancaria IS NULL OR r.id_empresa_cuenta_bancaria = p_id_empresa_cuenta_bancaria)
    AND (p_id_estado IS NULL OR r.id_estado = p_id_estado)
  ORDER BY r.ruta, e.nombre, b.nombre;
$$;

/*
Funcion: f_patch_tb_recaudacion_regla_abono
Objetivo:
  Crear o actualizar regla de abono por ruta/cuenta.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_recaudacion_regla_abono(
  p_ruta character varying,
  p_id_empresa bigint,
  p_id_empresa_cuenta_bancaria bigint,
  p_hora_corte time without time zone,
  p_dias_habiles_abono integer,
  p_hora_liberacion time without time zone DEFAULT '06:00',
  p_flag_liberacion_automatica boolean DEFAULT false,
  p_id_estado bigint DEFAULT 1,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id bigint;
  v_row jsonb;
BEGIN
  IF p_ruta IS NULL OR BTRIM(p_ruta) = '' THEN
    RETURN jsonb_build_object('error', 'La ruta es requerida.');
  END IF;

  IF p_id_empresa IS NULL OR p_id_empresa_cuenta_bancaria IS NULL THEN
    RETURN jsonb_build_object('error', 'La empresa y cuenta son requeridas.');
  END IF;

  IF COALESCE(p_dias_habiles_abono, 0) < 0 THEN
    RETURN jsonb_build_object('error', 'Los dias habiles de abono no pueden ser negativos.');
  END IF;

  INSERT INTO public.tb_recaudacion_regla_abono (
    ruta,
    id_empresa,
    id_empresa_cuenta_bancaria,
    hora_corte,
    dias_habiles_abono,
    hora_liberacion,
    flag_liberacion_automatica,
    id_estado,
    id_usuario,
    fecha_actualizacion
  )
  VALUES (
    LOWER(BTRIM(p_ruta)),
    p_id_empresa,
    p_id_empresa_cuenta_bancaria,
    COALESCE(p_hora_corte, '00:00'::time),
    COALESCE(p_dias_habiles_abono, 1),
    COALESCE(p_hora_liberacion, '06:00'::time),
    COALESCE(p_flag_liberacion_automatica, false),
    COALESCE(p_id_estado, 1),
    p_id_usuario,
    now()
  )
  ON CONFLICT ((lower(ruta)), id_empresa_cuenta_bancaria)
  DO UPDATE SET
    id_empresa = EXCLUDED.id_empresa,
    hora_corte = EXCLUDED.hora_corte,
    dias_habiles_abono = EXCLUDED.dias_habiles_abono,
    hora_liberacion = EXCLUDED.hora_liberacion,
    flag_liberacion_automatica = EXCLUDED.flag_liberacion_automatica,
    id_estado = EXCLUDED.id_estado,
    id_usuario = EXCLUDED.id_usuario,
    fecha_actualizacion = now()
  RETURNING id INTO v_id;

  SELECT x
  INTO v_row
  FROM public.f_get_tb_recaudacion_regla_abono(
    p_ruta := p_ruta,
    p_id_empresa_cuenta_bancaria := p_id_empresa_cuenta_bancaria
  ) AS x
  LIMIT 1;

  PERFORM public.f_sync_tb_recaudacion_lotes(p_ruta, p_id_empresa_cuenta_bancaria, p_id_usuario);

  RETURN COALESCE(v_row, jsonb_build_object('id', v_id));
END;
$$;

/*
Funcion: f_get_tb_recaudacion_operacion_info
Objetivo:
  Consultar informacion de corte/abono para operaciones retenidas visibles.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_recaudacion_operacion_info(
  p_ids_operacion bigint[],
  p_ruta character varying,
  p_id_empresa_cuenta_bancaria bigint
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  IF p_ids_operacion IS NULL OR array_length(p_ids_operacion, 1) IS NULL THEN
    RETURN;
  END IF;

  IF array_length(p_ids_operacion, 1) > 200 THEN
    RAISE EXCEPTION 'Solo se pueden consultar hasta 200 operaciones por llamada.';
  END IF;

  IF p_ruta IS NULL OR p_id_empresa_cuenta_bancaria IS NULL THEN
    RAISE EXCEPTION 'Ruta y cuenta son requeridas.';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id_operacion', op.id,
    'fecha_corte_recaudacion', COALESCE(rl.fecha_corte, (calc.info->>'fecha_corte')::timestamp with time zone),
    'fecha_estimada_abono', COALESCE(rl.fecha_estimada_abono, (calc.info->>'fecha_estimada_abono')::date),
    'fecha_liberacion_abono', COALESCE(rl.fecha_liberacion, (calc.info->>'fecha_liberacion')::timestamp with time zone),
    'flag_liberable_abono', COALESCE(
      CASE WHEN rl.fecha_liberacion IS NULL THEN NULL ELSE now() >= rl.fecha_liberacion END,
      COALESCE((calc.info->>'liberable')::boolean, false)
    ),
    'estado_lote_abono', rl.estado
  )
  FROM public.tb_operacion_proceso op
  LEFT JOIN public.tb_recaudacion_lote_operacion rlo ON rlo.id_operacion_proceso = op.id
  LEFT JOIN public.tb_recaudacion_lote rl ON rl.id = rlo.id_lote
  CROSS JOIN LATERAL (
    SELECT public.f_get_tb_recaudacion_fecha_liberacion(
      op.id_empresa_cuenta_ingreso,
      op.fecha_deposito_cliente,
      COALESCE(op.ruta_destino, op.ruta_origen)
    ) AS info
  ) calc
  WHERE op.id = ANY(p_ids_operacion)
    AND LOWER(COALESCE(op.ruta_destino, op.ruta_origen)) = LOWER(p_ruta)
    AND op.id_empresa_cuenta_ingreso = p_id_empresa_cuenta_bancaria
    AND COALESCE(op.flag_retenido, false) = true
    AND NOT (calc.info ? 'error')
  ORDER BY op.id DESC;
END;
$$;

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_get_tb_calendario_habil_sumar',
  'f_get_tb_recaudacion_cuenta_flag_retenida',
  'f_get_tb_recaudacion_fecha_liberacion',
  'f_sync_tb_recaudacion_lotes',
  'f_run_tb_recaudacion_liberar_retenciones',
  'f_patch_tb_recaudacion_confirmar_si_vencida',
  'f_get_tb_recaudacion_regla_abono',
  'f_patch_tb_recaudacion_regla_abono',
  'f_get_tb_recaudacion_operacion_info'
)
ORDER BY n.nspname, p.proname;
