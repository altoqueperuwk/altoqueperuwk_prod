-- ============================================================================
-- 13. PAGO DEUDA
-- ============================================================================

/*
Tabla: tb_pago_deuda_empresa_comision
Objetivo:
  Configurar que cuentas empresariales pueden recibir el deposito de comision
  del flujo Pago Deuda y con que billetera digital se presentan al usuario.
*/
CREATE TABLE IF NOT EXISTS public.tb_pago_deuda_empresa_comision (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_empresa bigint NOT NULL,
  id_empresa_cuenta_bancaria bigint NOT NULL,
  billetera_digital character varying,
  flag_deposito_comision boolean NOT NULL DEFAULT false,
  id_estado bigint NOT NULL DEFAULT 1,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_pago_deuda_empresa_comision_pkey PRIMARY KEY (id),
  CONSTRAINT tb_pago_deuda_empresa_comision_fk_empresa FOREIGN KEY (id_empresa) REFERENCES public.tb_empresa(id),
  CONSTRAINT tb_pago_deuda_empresa_comision_fk_cuenta FOREIGN KEY (id_empresa_cuenta_bancaria) REFERENCES public.tb_empresa_cuenta_bancaria(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS tb_pago_deuda_empresa_comision_uk_cuenta
ON public.tb_pago_deuda_empresa_comision (id_empresa_cuenta_bancaria);

/*
Funcion: f_get_tb_pago_deuda_empresa_comision
Objetivo:
  Listar cuentas empresariales con su configuracion para deposito de comision
  de Pago Deuda. Incluye cuentas sin configuracion para permitir activarlas.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_pago_deuda_empresa_comision(
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_flag_deposito_comision boolean DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'id', cfg.id,
    'id_empresa', e.id,
    'empresa_nombre', e.nombre,
    'id_empresa_cuenta_bancaria', ecb.id,
    'id_banco', b.id,
    'banco_nombre', b.nombre,
    'billetera_digital', cfg.billetera_digital,
    'flag_deposito_comision', COALESCE(cfg.flag_deposito_comision, false),
    'id_estado', COALESCE(cfg.id_estado, 1),
    'id_usuario', cfg.id_usuario,
    'fecha_registro', cfg.fecha_registro
  )
  FROM public.tb_empresa_cuenta_bancaria ecb
  JOIN public.tb_empresa e ON e.id = ecb.id_empresa
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  LEFT JOIN public.tb_pago_deuda_empresa_comision cfg
    ON cfg.id_empresa_cuenta_bancaria = ecb.id
  WHERE e.id_estado = 1
    AND ecb.id_estado = 1
    AND (p_id_empresa IS NULL OR e.id = p_id_empresa)
    AND (p_id_empresa_cuenta_bancaria IS NULL OR ecb.id = p_id_empresa_cuenta_bancaria)
    AND (p_flag_deposito_comision IS NULL OR COALESCE(cfg.flag_deposito_comision, false) = p_flag_deposito_comision)
    AND (p_id_estado IS NULL OR COALESCE(cfg.id_estado, 1) = p_id_estado)
  ORDER BY e.nombre, b.nombre, ecb.id;
$$;

/*
Funcion: f_patch_tb_pago_deuda_empresa_comision
Objetivo:
  Crear o actualizar la configuracion de deposito de comision de una cuenta.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_empresa_comision(
  p_id_empresa bigint,
  p_id_empresa_cuenta_bancaria bigint,
  p_billetera_digital character varying DEFAULT NULL,
  p_flag_deposito_comision boolean DEFAULT false,
  p_id_estado bigint DEFAULT 1,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_billetera character varying;
  v_result jsonb;
BEGIN
  IF p_id_empresa IS NULL OR p_id_empresa_cuenta_bancaria IS NULL THEN
    RETURN jsonb_build_object('error', 'Empresa y cuenta son requeridas.');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_empresa_cuenta_bancaria ecb
    JOIN public.tb_empresa e ON e.id = ecb.id_empresa
    WHERE ecb.id = p_id_empresa_cuenta_bancaria
      AND ecb.id_empresa = p_id_empresa
      AND ecb.id_estado = 1
      AND e.id_estado = 1
  ) THEN
    RETURN jsonb_build_object('error', 'Cuenta empresarial no encontrada o inactiva.');
  END IF;

  v_billetera := NULLIF(BTRIM(COALESCE(p_billetera_digital, '')), '');

  IF v_billetera IS NOT NULL THEN
    v_billetera := CASE
      WHEN UPPER(v_billetera) = 'QR' THEN 'QR'
      ELSE INITCAP(LOWER(v_billetera))
    END;
  END IF;

  IF COALESCE(p_flag_deposito_comision, false) = true
     AND UPPER(COALESCE(v_billetera, '')) NOT IN ('YAPE', 'PLIN', 'QR', 'TRANSFERENCIA') THEN
    RETURN jsonb_build_object('error', 'Selecciona una opcion valida: Yape, Plin, QR o Transferencia.');
  END IF;

  INSERT INTO public.tb_pago_deuda_empresa_comision (
    id_empresa,
    id_empresa_cuenta_bancaria,
    billetera_digital,
    flag_deposito_comision,
    id_estado,
    id_usuario
  )
  VALUES (
    p_id_empresa,
    p_id_empresa_cuenta_bancaria,
    v_billetera,
    COALESCE(p_flag_deposito_comision, false),
    COALESCE(p_id_estado, 1),
    p_id_usuario
  )
  ON CONFLICT (id_empresa_cuenta_bancaria) DO UPDATE
  SET id_empresa = EXCLUDED.id_empresa,
      billetera_digital = EXCLUDED.billetera_digital,
      flag_deposito_comision = EXCLUDED.flag_deposito_comision,
      id_estado = EXCLUDED.id_estado,
      id_usuario = EXCLUDED.id_usuario,
      fecha_registro = now();

  SELECT x
  INTO v_result
  FROM public.f_get_tb_pago_deuda_empresa_comision(
    p_id_empresa_cuenta_bancaria := p_id_empresa_cuenta_bancaria
  ) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_get_tb_pago_deuda
Objetivo:
  Listar solo solicitudes raiz para `/operaciones/pagodeuda`. La atencion
  bancaria se consulta desde la fila hija en las rutas de efectivizacion.

Regla de fecha:
  - muestra solicitudes registradas estrictamente dentro del intervalo
    consultado, sin arrastrar pendientes de fechas anteriores.
*/
DROP FUNCTION IF EXISTS public.f_get_tb_pago_deuda(
  bigint, character varying, bigint, character varying,
  timestamp with time zone, timestamp with time zone, bigint, bigint, bigint
);

CREATE OR REPLACE FUNCTION public.f_get_tb_pago_deuda(
  p_id bigint DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_codigo_operacion character varying DEFAULT NULL,
  p_fecha_desde timestamp with time zone DEFAULT NULL,
  p_fecha_hasta timestamp with time zone DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_id_usuario_solicitud bigint DEFAULT NULL,
  p_id_usuario_consulta bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_id_codigo_servicio_pago_deuda bigint;
  v_consulta_id_sucursal bigint;
  v_consulta_es_administrador boolean := false;
  v_consulta_es_jefe_tienda boolean := false;
BEGIN
  IF p_id_usuario_consulta IS NOT NULL THEN
    SELECT
      u.id_sucursal,
      COALESCE(u.flag_super_admin, false)
        OR u.id_rol = 1
        OR UPPER(BTRIM(COALESCE(r.nombre, ''))) = 'ADMINISTRADOR',
      u.id_rol = 3
        OR UPPER(BTRIM(COALESCE(r.nombre, ''))) = 'JEFE DE TIENDA'
    INTO
      v_consulta_id_sucursal,
      v_consulta_es_administrador,
      v_consulta_es_jefe_tienda
    FROM public.tb_usuario u
    LEFT JOIN public.tb_rol r ON r.id = u.id_rol
    WHERE u.id = p_id_usuario_consulta;
  END IF;

  SELECT cs.id
  INTO v_id_codigo_servicio_pago_deuda
  FROM public.tb_codigo_servicio cs
  WHERE UPPER(COALESCE(cs.nombre, '')) LIKE '%PAGO%DEUDA%'
  ORDER BY cs.id
  LIMIT 1;

  IF v_id_codigo_servicio_pago_deuda IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT to_jsonb(op) || jsonb_build_object(
    'id_operacion_banco',
    (
      SELECT h.id
      FROM public.tb_operacion_proceso h
      WHERE h.id_operacion_padre = op.id
        AND UPPER(COALESCE(h.tipo_flujo_pago_deuda, '')) = 'BANCO'
      ORDER BY h.id
      LIMIT 1
    ),
    'pd_codigo_operacion_comision',
    NULLIF(BTRIM(COALESCE(op.codigo_operacion_deposito_cliente, '')), ''),
    'flag_comision_registrada',
    EXISTS (
      SELECT 1
      FROM public.tb_operacion_caja c
      WHERE c.id_operacion_proceso = op.id
        AND c.tipo_origen = 'PAGO_DEUDA_COMISION'
    )
  )
  FROM public.tb_operacion_proceso op
  WHERE op.id_codigo_servicio = v_id_codigo_servicio_pago_deuda
    AND op.id_operacion_padre IS NULL
    AND UPPER(COALESCE(op.tipo_flujo_pago_deuda, 'SOLICITUD')) = 'SOLICITUD'
    AND (p_id IS NULL OR op.id = p_id)
    AND (p_dni_cliente IS NULL OR op.dni_cliente ILIKE '%' || p_dni_cliente || '%')
    AND (p_id_estado IS NULL OR op.id_estado = p_id_estado)
    AND (p_codigo_operacion IS NULL OR op.codigo_operacion_deposito_cliente ILIKE '%' || p_codigo_operacion || '%')
    AND (
      (p_fecha_desde IS NULL AND p_fecha_hasta IS NULL)
      OR (
        (p_fecha_desde IS NULL OR op.fecha_registro >= p_fecha_desde)
        AND (p_fecha_hasta IS NULL OR op.fecha_registro <= p_fecha_hasta)
      )
    )
    AND (p_id_usuario_gestor IS NULL OR op.id_usuario_gestor = p_id_usuario_gestor)
    AND (
      (
        p_id_usuario_consulta IS NULL
        AND (p_id_usuario_solicitud IS NULL OR op.id_usuario_solicitud = p_id_usuario_solicitud)
      )
      OR (
        p_id_usuario_consulta IS NOT NULL
        AND (
          v_consulta_es_administrador
          OR (
            v_consulta_es_jefe_tienda
            AND v_consulta_id_sucursal IS NOT NULL
            AND (
              op.id_usuario_solicitud = p_id_usuario_consulta
              OR EXISTS (
                SELECT 1
                FROM public.tb_usuario creador
                WHERE creador.id = op.id_usuario_solicitud
                  AND creador.id_rol = 4
                  AND creador.id_sucursal = v_consulta_id_sucursal
              )
            )
            AND (p_id_usuario_solicitud IS NULL OR op.id_usuario_solicitud = p_id_usuario_solicitud)
          )
        )
      )
    )
  ORDER BY
    CASE
      WHEN LOWER(BTRIM(COALESCE(p_ruta, ''))) IN (
        'bcp', 'bbva', 'banbif', 'scotiabank', 'interbank', 'safetypay'
      ) THEN COALESCE(op.fecha_deposito_cliente, op.fecha_registro)
    END ASC NULLS LAST,
    CASE
      WHEN LOWER(BTRIM(COALESCE(p_ruta, ''))) IN (
        'bcp', 'bbva', 'banbif', 'scotiabank', 'interbank', 'safetypay'
      ) THEN op.fecha_registro
    END ASC NULLS LAST,
    CASE
      WHEN LOWER(BTRIM(COALESCE(p_ruta, ''))) IN (
        'bcp', 'bbva', 'banbif', 'scotiabank', 'interbank', 'safetypay'
      ) THEN op.id
    END ASC NULLS LAST,
    op.id DESC;
END;
$$;

/*
Funcion: f_get_tb_pago_deuda_kpi
Objetivo:
  Consultar KPIs informativos de Pago Deuda por fecha de registro. No depende
  de caja operativa ni de cierre. El intervalo recibido se aplica de forma
  estricta a fecha_registro, incluidos los estados pendientes.
*/
DROP FUNCTION IF EXISTS public.f_get_tb_pago_deuda_kpi(
  timestamp with time zone, timestamp with time zone, bigint, bigint
);

CREATE OR REPLACE FUNCTION public.f_get_tb_pago_deuda_kpi(
  p_fecha_desde timestamp with time zone DEFAULT NULL,
  p_fecha_hasta timestamp with time zone DEFAULT NULL,
  p_id_usuario_solicitud bigint DEFAULT NULL,
  p_id_usuario_consulta bigint DEFAULT NULL
)
RETURNS TABLE (
  total_operaciones_pendientes integer,
  total_operaciones_pagados integer,
  monto_solicitados numeric,
  comisiones numeric,
  monto_devueltos numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH consulta AS (
    SELECT
      u.id_sucursal,
      COALESCE(u.flag_super_admin, false)
        OR u.id_rol = 1
        OR UPPER(BTRIM(COALESCE(r.nombre, ''))) = 'ADMINISTRADOR' AS es_administrador,
      u.id_rol = 3
        OR UPPER(BTRIM(COALESCE(r.nombre, ''))) = 'JEFE DE TIENDA' AS es_jefe_tienda
    FROM public.tb_usuario u
    LEFT JOIN public.tb_rol r ON r.id = u.id_rol
    WHERE u.id = p_id_usuario_consulta
  )
  SELECT
    COUNT(*) FILTER (
      WHERE UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'PAGADO'
    )::integer AS total_operaciones_pendientes,
    COUNT(*) FILTER (
      WHERE UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
    )::integer AS total_operaciones_pagados,
    COALESCE(SUM(COALESCE(op.monto_deposito_cliente, 0)), 0)::numeric AS monto_solicitados,
    COALESCE(
      SUM(COALESCE(op.resultado_comision_servicio, 0)) FILTER (
        WHERE UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
      ),
      0
    )::numeric AS comisiones,
    COALESCE(
      SUM(
        CASE
          WHEN op.id_operacion_match IS NOT NULL
            OR COALESCE(op.monto_devuelto, 0) >= COALESCE(op.monto_deposito_cliente, 0)
          THEN COALESCE(op.monto_deposito_cliente, 0)
          ELSE COALESCE(op.monto_devuelto, 0)
        END
      ),
      0
    )::numeric AS monto_devueltos
  FROM public.tb_operacion_proceso op
  LEFT JOIN consulta c ON true
  WHERE op.id_operacion_padre IS NULL
    AND UPPER(COALESCE(op.tipo_flujo_pago_deuda, '')) = 'SOLICITUD'
    AND (
      (
        p_id_usuario_consulta IS NULL
        AND (p_id_usuario_solicitud IS NULL OR op.id_usuario_solicitud = p_id_usuario_solicitud)
      )
      OR (
        p_id_usuario_consulta IS NOT NULL
        AND (
          COALESCE(c.es_administrador, false)
          OR (
            COALESCE(c.es_jefe_tienda, false)
            AND c.id_sucursal IS NOT NULL
            AND (
              op.id_usuario_solicitud = p_id_usuario_consulta
              OR EXISTS (
                SELECT 1
                FROM public.tb_usuario creador
                WHERE creador.id = op.id_usuario_solicitud
                  AND creador.id_rol = 4
                  AND creador.id_sucursal = c.id_sucursal
              )
            )
            AND (p_id_usuario_solicitud IS NULL OR op.id_usuario_solicitud = p_id_usuario_solicitud)
          )
        )
      )
    )
    AND (
      (p_fecha_desde IS NULL AND p_fecha_hasta IS NULL)
      OR (
        (p_fecha_desde IS NULL OR op.fecha_registro >= p_fecha_desde)
        AND (p_fecha_hasta IS NULL OR op.fecha_registro <= p_fecha_hasta)
      )
    );
$$;

/*
Funcion: f_get_tb_pago_deuda_match
Objetivo:
  Buscar candidatos de efectivizacion para hacer match con una solicitud de
  Pago Deuda.

Reglas:
  - excluye operaciones que ya son Pago Deuda
  - busca por DNI y monto
  - usa fecha_deposito_cliente como fecha operacional del Excel
  - limita el match a una ventana de 24 horas reales
*/
DROP FUNCTION IF EXISTS public.f_get_tb_pago_deuda_match(
  bigint, character varying, bigint, bigint
);

CREATE OR REPLACE FUNCTION public.f_get_tb_pago_deuda_match(
  p_id_operacion_pago_deuda bigint DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_monto_deposito_cliente numeric DEFAULT NULL,
  p_id_operacion_efectivizacion bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_id_codigo_servicio_pago_deuda bigint;
  v_dni_cliente character varying;
  v_monto_deposito_cliente numeric;
  v_banco_cliente bigint;
  v_fecha_operacion timestamp with time zone;
BEGIN
  SELECT cs.id
  INTO v_id_codigo_servicio_pago_deuda
  FROM public.tb_codigo_servicio cs
  WHERE UPPER(COALESCE(cs.nombre, '')) LIKE '%PAGO%DEUDA%'
  ORDER BY cs.id
  LIMIT 1;

  IF p_id_operacion_efectivizacion IS NOT NULL THEN
    SELECT op.dni_cliente, op.monto_deposito_cliente, op.id_banco_empresa_cuenta_ingreso, op.fecha_deposito_cliente
    INTO v_dni_cliente, v_monto_deposito_cliente, v_banco_cliente, v_fecha_operacion
    FROM public.tb_operacion_proceso op
    WHERE op.id = p_id_operacion_efectivizacion
    LIMIT 1;
  ELSIF p_id_operacion_pago_deuda IS NOT NULL THEN
    SELECT op.dni_cliente, op.monto_deposito_cliente
    INTO v_dni_cliente, v_monto_deposito_cliente
    FROM public.tb_operacion_proceso op
    WHERE op.id = p_id_operacion_pago_deuda
    LIMIT 1;
  ELSE
    v_dni_cliente := p_dni_cliente;
    v_monto_deposito_cliente := p_monto_deposito_cliente;
  END IF;

  IF COALESCE(v_dni_cliente, '') = '' THEN
    RETURN;
  END IF;

  IF p_id_operacion_efectivizacion IS NOT NULL THEN
    RETURN QUERY
    SELECT jsonb_build_object(
      'id', op.id,
      'codigo_operacion_deposito_cliente', op.codigo_operacion_deposito_cliente,
      'dni_cliente', op.dni_cliente,
      'nombre_cliente', op.nombre_cliente,
      'monto_deposito_cliente', op.monto_deposito_cliente,
      'nombre_banco_cliente', op.nombre_banco_cliente,
      'nombre_codigo_servicio', op.nombre_codigo_servicio,
      'id_estado', op.id_estado,
      'nombre_estado', op.nombre_estado,
      'fecha_registro', op.fecha_registro,
      'fecha_pendiente', op.fecha_pendiente,
      'tipo_flujo_pago_deuda', op.tipo_flujo_pago_deuda,
      'monto_deposito_cliente', op.monto_deposito_cliente,
      'monto_devuelto', op.monto_devuelto
    )
    FROM public.tb_operacion_proceso op
    WHERE op.dni_cliente = v_dni_cliente
      AND UPPER(COALESCE(op.tipo_servicio, '')) LIKE '%PAGO%DEUDA%'
      AND UPPER(COALESCE(op.tipo_flujo_pago_deuda, '')) = 'BANCO'
      AND UPPER(COALESCE(op.nombre_estado, '')) = 'PROCESADO'
      AND op.id_caja_cierre IS NULL
      AND v_fecha_operacion IS NOT NULL
      AND op.monto_devuelto < op.monto_deposito_cliente
      AND ABS(
        EXTRACT(epoch FROM (COALESCE(op.fecha_pendiente, op.fecha_registro) - v_fecha_operacion))
      ) <= 86400
    ORDER BY op.id DESC
    LIMIT 20;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', op.id,
    'codigo_operacion_deposito_cliente', op.codigo_operacion_deposito_cliente,
    'dni_cliente', op.dni_cliente,
    'nombre_cliente', op.nombre_cliente,
    'monto_deposito_cliente', op.monto_deposito_cliente,
    'nombre_banco_cliente', op.nombre_banco_cliente,
    'nombre_codigo_servicio', op.nombre_codigo_servicio,
    'id_estado', op.id_estado,
    'nombre_estado', op.nombre_estado,
    'fecha_registro', op.fecha_registro,
    'fecha_deposito_cliente', op.fecha_deposito_cliente
  )
  FROM public.tb_operacion_proceso op
  JOIN public.tb_estado e ON op.id_estado = e.id
  WHERE op.dni_cliente = v_dni_cliente
    AND (v_monto_deposito_cliente IS NULL OR op.monto_deposito_cliente = v_monto_deposito_cliente)
    AND (v_id_codigo_servicio_pago_deuda IS NULL OR op.id_codigo_servicio <> v_id_codigo_servicio_pago_deuda)
    AND UPPER(COALESCE(e.nombre, '')) = 'PENDIENTE'
    AND op.id_empresa_ingreso IS NOT NULL
    AND op.id_caja_cierre IS NULL
    AND (
      p_id_operacion_pago_deuda IS NULL
      OR op.fecha_deposito_cliente::date = (
        SELECT COALESCE(pd.fecha_pendiente, pd.fecha_registro)::date
        FROM public.tb_operacion_proceso pd
        WHERE pd.id = p_id_operacion_pago_deuda
        LIMIT 1
      )
    )
  ORDER BY op.fecha_deposito_cliente DESC NULLS LAST, op.fecha_registro DESC
  LIMIT 20;
END;
$$;

/*
Funcion: f_get_tb_pago_deuda_match_lote
Objetivo:
  Buscar candidatos de Pago Deuda para varias operaciones de efectivizacion
  en una sola consulta. La respuesta conserva la relacion entre cada
  operacion origen y sus candidatos para que el frontend no tenga que
  ejecutar una RPC por cada fila.

Reglas:
  - conserva los mismos criterios de f_get_tb_pago_deuda_match
  - excluye operaciones que ya son Pago Deuda
  - busca por DNI
  - limita el match a una ventana de 24 horas reales
  - devuelve como maximo 20 candidatos por operacion origen
*/
DROP FUNCTION IF EXISTS public.f_get_tb_pago_deuda_match_lote(jsonb);

CREATE OR REPLACE FUNCTION public.f_get_tb_pago_deuda_match_lote(
  p_ids_operaciones jsonb
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH ids AS (
    SELECT DISTINCT item.value::bigint AS id
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(COALESCE(p_ids_operaciones, '[]'::jsonb)) = 'array'
          THEN p_ids_operaciones
        ELSE '[]'::jsonb
      END
    ) AS item(value)
    WHERE item.value ~ '^[0-9]+$'
  ),
  operaciones_efectivizacion AS (
    SELECT
      op.id,
      op.dni_cliente,
      op.fecha_deposito_cliente
    FROM public.tb_operacion_proceso op
    INNER JOIN ids ON ids.id = op.id
  ),
  candidatos_ranked AS (
    SELECT
      origen.id AS id_operacion_efectivizacion,
      candidato.id AS id_candidato,
      candidato.codigo_operacion_deposito_cliente,
      candidato.dni_cliente,
      candidato.nombre_cliente,
      candidato.monto_deposito_cliente,
      candidato.nombre_banco_cliente,
      candidato.nombre_codigo_servicio,
      candidato.id_estado,
      candidato.nombre_estado,
      candidato.fecha_registro,
      candidato.fecha_pendiente,
      candidato.tipo_flujo_pago_deuda,
      candidato.monto_devuelto,
      ROW_NUMBER() OVER (
        PARTITION BY origen.id
        ORDER BY candidato.id DESC
      ) AS numero_candidato
    FROM operaciones_efectivizacion origen
    INNER JOIN public.tb_operacion_proceso candidato
      ON candidato.dni_cliente = origen.dni_cliente
    WHERE UPPER(COALESCE(candidato.tipo_servicio, '')) LIKE '%PAGO%DEUDA%'
      AND UPPER(COALESCE(candidato.tipo_flujo_pago_deuda, '')) = 'BANCO'
      AND UPPER(COALESCE(candidato.nombre_estado, '')) = 'PROCESADO'
      AND candidato.id_caja_cierre IS NULL
      AND origen.fecha_deposito_cliente IS NOT NULL
      AND candidato.monto_devuelto < candidato.monto_deposito_cliente
      AND ABS(
        EXTRACT(epoch FROM (
          COALESCE(candidato.fecha_pendiente, candidato.fecha_registro)
          - origen.fecha_deposito_cliente
        ))
      ) <= 86400
  ),
  candidatos_agrupados AS (
    SELECT
      id_operacion_efectivizacion,
      jsonb_agg(
        jsonb_build_object(
          'id', id_candidato,
          'codigo_operacion_deposito_cliente', codigo_operacion_deposito_cliente,
          'dni_cliente', dni_cliente,
          'nombre_cliente', nombre_cliente,
          'monto_deposito_cliente', monto_deposito_cliente,
          'nombre_banco_cliente', nombre_banco_cliente,
          'nombre_codigo_servicio', nombre_codigo_servicio,
          'id_estado', id_estado,
          'nombre_estado', nombre_estado,
          'fecha_registro', fecha_registro,
          'fecha_pendiente', fecha_pendiente,
          'tipo_flujo_pago_deuda', tipo_flujo_pago_deuda,
          'monto_devuelto', monto_devuelto
        )
        ORDER BY id_candidato DESC
      ) AS matches
    FROM candidatos_ranked
    WHERE numero_candidato <= 20
    GROUP BY id_operacion_efectivizacion
  )
  SELECT jsonb_build_object(
    'id_operacion_efectivizacion', agrupados.id_operacion_efectivizacion,
    'matches', agrupados.matches
  )
  FROM candidatos_agrupados agrupados
  ORDER BY agrupados.id_operacion_efectivizacion;
$$;

/*
Funcion: f_get_tb_pago_deuda_match_flags_lote
Objetivo:
  Indicar rapidamente si varias operaciones de efectivizacion tienen al menos
  un candidato de Pago Deuda. El detalle completo se consulta al abrir el
  modal de match.

Reglas:
  - conserva los mismos criterios de f_get_tb_pago_deuda_match_lote;
  - devuelve una fila por operacion recibida, incluso cuando no hay match;
  - no devuelve el detalle de los candidatos.
*/
DROP FUNCTION IF EXISTS public.f_get_tb_pago_deuda_match_flags_lote(jsonb);

CREATE OR REPLACE FUNCTION public.f_get_tb_pago_deuda_match_flags_lote(
  p_ids_operaciones jsonb
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH ids AS (
    SELECT DISTINCT item.value::bigint AS id
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(COALESCE(p_ids_operaciones, '[]'::jsonb)) = 'array'
          THEN p_ids_operaciones
        ELSE '[]'::jsonb
      END
    ) AS item(value)
    WHERE item.value ~ '^[0-9]+$'
  ),
  operaciones_efectivizacion AS (
    SELECT
      op.id,
      op.dni_cliente,
      op.fecha_deposito_cliente
    FROM public.tb_operacion_proceso op
    INNER JOIN ids ON ids.id = op.id
  )
  SELECT jsonb_build_object(
    'id_operacion_efectivizacion', origen.id,
    'tiene_match', EXISTS (
      SELECT 1
      FROM public.tb_operacion_proceso candidato
      WHERE candidato.dni_cliente = origen.dni_cliente
        AND UPPER(COALESCE(candidato.tipo_servicio, '')) LIKE '%PAGO%DEUDA%'
        AND UPPER(COALESCE(candidato.tipo_flujo_pago_deuda, '')) = 'BANCO'
        AND UPPER(COALESCE(candidato.nombre_estado, '')) = 'PROCESADO'
        AND candidato.id_caja_cierre IS NULL
        AND origen.fecha_deposito_cliente IS NOT NULL
        AND candidato.monto_devuelto < candidato.monto_deposito_cliente
        AND ABS(
          EXTRACT(epoch FROM (
            COALESCE(candidato.fecha_pendiente, candidato.fecha_registro)
            - origen.fecha_deposito_cliente
          ))
        ) <= 86400
    )
  )
  FROM operaciones_efectivizacion origen
  ORDER BY origen.id;
$$;

/*
Funcion: f_get_tb_pago_deuda_bandeja
Objetivo:
  Listar solo filas BANCO para el tab Pago Deuda dentro de las rutas bancarias
  (bcp, bbva, scotiabank, banbif, interbank). Excluye RETORNO y SOLICITUD.
*/
DROP FUNCTION IF EXISTS public.f_get_tb_pago_deuda_bandeja(
  character varying,
  bigint,
  bigint,
  character varying,
  character varying,
  bigint,
  timestamp with time zone,
  timestamp with time zone
);

CREATE OR REPLACE FUNCTION public.f_get_tb_pago_deuda_bandeja(
  p_ruta character varying,
  p_id_empresa_salida bigint DEFAULT NULL,
  p_id_empresa_cuenta_salida bigint DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_codigo_operacion character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_fecha_caja_cierre_desde timestamp with time zone DEFAULT NULL,
  p_fecha_caja_cierre_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT to_jsonb(op) || jsonb_build_object(
    'id_usuario_atencion_cliente',
    COALESCE(op_solicitud.id_usuario_solicitud, op_solicitud.id_usuario),
    'nombre_atencion_cliente',
    usuario_atencion_cliente.username,
    'id_sucursal_atencion_cliente',
    usuario_atencion_cliente.id_sucursal,
    'nombre_sucursal_atencion_cliente',
    sucursal_atencion_cliente.nombre,
    'pd_codigo_operacion_transferencia',
    NULLIF(BTRIM(COALESCE(op.codigo_operacion_deposito_cliente, '')), ''),
    'flag_comision_registrada',
    EXISTS (
      SELECT 1
      FROM public.tb_operacion_caja c
      WHERE c.id_operacion_proceso = op.id_operacion_padre
        AND c.tipo_origen = 'PAGO_DEUDA_COMISION'
    ),
    'pd_retorno_id',
    op_retorno.id,
    'pd_retorno_id_empresa_ingreso',
    op_retorno.id_empresa_ingreso,
    'pd_retorno_id_empresa_cuenta_ingreso',
    op_retorno.id_empresa_cuenta_ingreso,
    'pd_retorno_nombre_empresa_ingreso',
    op_retorno.nombre_empresa_ingreso,
    'pd_retorno_nombre_banco_empresa_cuenta_ingreso',
    op_retorno.nombre_banco_empresa_cuenta_ingreso,
    'pd_retorno_monto_devolucion',
    op_retorno.monto_devolucion,
    'pd_retorno_codigos_operacion',
    op_retorno.codigos_operacion,
    'pd_retorno_empresas_cuentas',
    op_retorno.empresas_cuentas
  )
  FROM public.tb_operacion_proceso op
  LEFT JOIN public.tb_operacion_proceso op_solicitud
    ON op_solicitud.id = op.id_operacion_padre
   AND UPPER(COALESCE(op_solicitud.tipo_flujo_pago_deuda, '')) = 'SOLICITUD'
  LEFT JOIN public.tb_usuario usuario_atencion_cliente
    ON usuario_atencion_cliente.id = COALESCE(op_solicitud.id_usuario_solicitud, op_solicitud.id_usuario)
  LEFT JOIN public.tb_sucursal sucursal_atencion_cliente
    ON sucursal_atencion_cliente.id = usuario_atencion_cliente.id_sucursal
  LEFT JOIN LATERAL (
    SELECT
      (ARRAY_AGG(r.id ORDER BY r.fecha_deposito_cliente NULLS LAST, r.fecha_registro NULLS LAST, r.id))[1] AS id,
      (ARRAY_AGG(r.id_empresa_ingreso ORDER BY r.fecha_deposito_cliente NULLS LAST, r.fecha_registro NULLS LAST, r.id))[1] AS id_empresa_ingreso,
      (ARRAY_AGG(r.id_empresa_cuenta_ingreso ORDER BY r.fecha_deposito_cliente NULLS LAST, r.fecha_registro NULLS LAST, r.id))[1] AS id_empresa_cuenta_ingreso,
      (ARRAY_AGG(r.nombre_empresa_ingreso ORDER BY r.fecha_deposito_cliente NULLS LAST, r.fecha_registro NULLS LAST, r.id))[1] AS nombre_empresa_ingreso,
      (ARRAY_AGG(r.nombre_banco_empresa_cuenta_ingreso ORDER BY r.fecha_deposito_cliente NULLS LAST, r.fecha_registro NULLS LAST, r.id))[1] AS nombre_banco_empresa_cuenta_ingreso,
      SUM(COALESCE(r.monto_deposito_cliente, r.monto_transferencia_cliente, 0)) AS monto_devolucion,
      STRING_AGG(NULLIF(BTRIM(COALESCE(r.codigo_operacion_deposito_cliente, '')), ''), E'\n' ORDER BY r.fecha_deposito_cliente NULLS LAST, r.fecha_registro NULLS LAST, r.id) AS codigos_operacion,
      JSONB_AGG(
        jsonb_build_object(
          'empresa', r.nombre_empresa_ingreso,
          'cuenta', r.nombre_banco_empresa_cuenta_ingreso,
          'codigo', r.codigo_operacion_deposito_cliente,
          'monto', COALESCE(r.monto_deposito_cliente, r.monto_transferencia_cliente, 0)
        )
        ORDER BY r.fecha_deposito_cliente NULLS LAST, r.fecha_registro NULLS LAST, r.id
      ) AS empresas_cuentas
    FROM public.tb_operacion_proceso r
    WHERE UPPER(COALESCE(r.tipo_flujo_pago_deuda, '')) = 'RETORNO'
      AND (
        r.id = op.id_operacion_match
        OR r.id_operacion_match = op.id
        OR r.id_operacion_padre = op.id
      )
  ) op_retorno ON true
  WHERE UPPER(COALESCE(op.tipo_flujo_pago_deuda, '')) = 'BANCO'
    AND op.ruta_destino = p_ruta
    AND (p_id_empresa_salida IS NULL OR op.id_empresa_salida = p_id_empresa_salida)
    AND (p_id_empresa_cuenta_salida IS NULL OR op.id_empresa_cuenta_salida = p_id_empresa_cuenta_salida)
    AND (
      (
        p_fecha_caja_cierre_desde IS NULL
        AND p_fecha_caja_cierre_hasta IS NULL
        AND op.id_caja_cierre IS NULL
      )
      OR (
        (p_fecha_caja_cierre_desde IS NOT NULL OR p_fecha_caja_cierre_hasta IS NOT NULL)
        AND op.id_caja_cierre IS NOT NULL
        AND (
          UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) NOT IN ('SOLICITADO', 'PROCESADO')
          OR (
            UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PROCESADO'
            AND (
              op.id_operacion_match IS NOT NULL
              OR COALESCE(op.monto_devuelto, 0) >= COALESCE(op.monto_deposito_cliente, 0)
              OR EXISTS (
                SELECT 1
                FROM public.tb_operacion_caja c
                WHERE c.id_operacion_proceso = op.id_operacion_padre
                  AND UPPER(BTRIM(COALESCE(c.tipo_origen, ''))) = 'PAGO_DEUDA_COMISION'
              )
            )
          )
        )
        AND (p_fecha_caja_cierre_desde IS NULL OR op.fecha_caja_cierre >= p_fecha_caja_cierre_desde)
        AND (p_fecha_caja_cierre_hasta IS NULL OR op.fecha_caja_cierre <= p_fecha_caja_cierre_hasta)
      )
    )
    AND (p_dni_cliente IS NULL OR op.dni_cliente ILIKE '%' || p_dni_cliente || '%')
    AND (
      p_codigo_operacion IS NULL
      OR op.codigo_operacion_deposito_cliente ILIKE '%' || p_codigo_operacion || '%'
      OR op_solicitud.codigo_operacion_deposito_cliente ILIKE '%' || p_codigo_operacion || '%'
      OR op_retorno.codigos_operacion ILIKE '%' || p_codigo_operacion || '%'
    )
    AND (p_id_estado IS NULL OR op.id_estado = p_id_estado)
  ORDER BY op.id DESC;
$$;

/*
Funcion: f_patch_tb_pago_deuda_codigo_operacion
Objetivo:
  Guardar el codigo de transferencia en la fila BANCO o el codigo de
  comision en la solicitud raiz, sin alterar los codigos de devolucion RETORNO.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_codigo_operacion(
  p_id_operacion bigint,
  p_tipo_codigo character varying,
  p_codigo_operacion character varying,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_input record;
  v_banco record;
  v_root record;
  v_tipo character varying;
  v_codigo character varying;
  v_target_id bigint;
BEGIN
  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1;

  IF v_input.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de Pago Deuda no encontrada.');
  END IF;

  IF UPPER(COALESCE(v_input.tipo_flujo_pago_deuda, '')) = 'SOLICITUD' THEN
    v_root := v_input;
    SELECT *
    INTO v_banco
    FROM public.tb_operacion_proceso
    WHERE id_operacion_padre = v_root.id
      AND UPPER(COALESCE(tipo_flujo_pago_deuda, '')) = 'BANCO'
    ORDER BY id
    LIMIT 1;
  ELSE
    v_banco := v_input;
    IF UPPER(COALESCE(v_banco.tipo_flujo_pago_deuda, '')) <> 'BANCO' THEN
      RETURN jsonb_build_object('error', 'La operacion no corresponde a una fila BANCO de Pago Deuda.');
    END IF;

    SELECT *
    INTO v_root
    FROM public.tb_operacion_proceso
    WHERE id = v_banco.id_operacion_padre
    LIMIT 1;
  END IF;

  IF v_banco.id IS NULL OR v_root.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontraron las operaciones relacionadas de Pago Deuda.');
  END IF;

  IF v_banco.id_estado = 10 OR v_root.id_estado = 10 THEN
    RETURN jsonb_build_object('error', 'No se puede modificar una operacion eliminada.');
  END IF;

  v_tipo := UPPER(BTRIM(COALESCE(p_tipo_codigo, '')));
  v_codigo := NULLIF(BTRIM(COALESCE(p_codigo_operacion, '')), '');

  IF v_tipo NOT IN ('TRANSFERENCIA', 'COMISION') THEN
    RETURN jsonb_build_object('error', 'Tipo de codigo no valido.');
  END IF;

  IF v_tipo = 'TRANSFERENCIA' THEN
    IF UPPER(COALESCE(v_banco.nombre_estado, '')) NOT IN ('PENDIENTE', 'SOLICITADO') THEN
      RETURN jsonb_build_object('error', 'El codigo de transferencia solo puede editarse antes de procesar la operacion.');
    END IF;
    v_target_id := v_banco.id;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM public.tb_operacion_caja c
      WHERE c.id_operacion_proceso = v_root.id
        AND c.tipo_origen = 'PAGO_DEUDA_COMISION'
    ) OR UPPER(COALESCE(v_root.nombre_estado, '')) = 'PAGADO' THEN
      RETURN jsonb_build_object('error', 'El codigo de comision ya no puede modificarse.');
    END IF;
    v_target_id := v_root.id;
  END IF;

  UPDATE public.tb_operacion_proceso
  SET codigo_operacion_deposito_cliente = v_codigo,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_target_id;

  RETURN jsonb_build_object(
    'id', v_target_id,
    'id_operacion_banco', v_banco.id,
    'id_operacion_raiz', v_root.id,
    'tipo_codigo', v_tipo,
    'codigo_operacion', v_codigo
  );
END;
$$;

/*
Funcion: f_sync_tb_pago_deuda_comision_caja
Objetivo:
  Registrar/sincronizar el ingreso de comision de Pago Deuda como un movimiento
  INGRESO diferenciado por tipo_origen = PAGO_DEUDA_COMISION.
*/
CREATE OR REPLACE FUNCTION public.f_sync_tb_pago_deuda_comision_caja(
  p_id_operacion bigint,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL,
  p_id_empresa_ingreso bigint DEFAULT NULL,
  p_id_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_monto_comision numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_op record;
  v_mov record;
  v_caja record;
  v_estado_id bigint;
  v_estado_nombre character varying;
  v_nombre_usuario character varying;
  v_saldo_anterior numeric;
  v_saldo_actual numeric;
  v_monto_comision numeric;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_op
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de Pago Deuda no encontrada.');
  END IF;

  v_monto_comision := COALESCE(p_monto_comision, v_op.resultado_comision_servicio, 0);

  IF v_monto_comision <= 0 THEN
    RETURN jsonb_build_object('omitido', true, 'motivo', 'La comision de servicio no es mayor a cero.');
  END IF;

  SELECT
    c.id,
    c.saldo_actual,
    c.id_empresa,
    e.nombre AS nombre_empresa,
    c.id_empresa_cuenta_bancaria,
    ecb.id_banco,
    b.nombre AS nombre_banco
  INTO v_caja
  FROM public.tb_caja_operativa c
  JOIN public.tb_empresa e ON e.id = c.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = c.id_empresa_cuenta_bancaria
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  WHERE c.id_empresa = COALESCE(p_id_empresa_ingreso, v_op.id_empresa_ingreso)
    AND c.id_empresa_cuenta_bancaria = COALESCE(p_id_empresa_cuenta_ingreso, v_op.id_empresa_cuenta_ingreso)
  LIMIT 1;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No existe caja inicial para registrar la comision de Pago Deuda.');
  END IF;

  v_estado_id := COALESCE(p_id_estado, v_op.id_estado);

  SELECT nombre
  INTO v_estado_nombre
  FROM public.tb_estado
  WHERE id = v_estado_id
  LIMIT 1;

  v_estado_nombre := COALESCE(v_estado_nombre, v_op.nombre_estado);

  IF p_nombre_usuario IS NOT NULL THEN
    v_nombre_usuario := p_nombre_usuario;
  ELSIF p_id_usuario IS NOT NULL THEN
    SELECT nombre
    INTO v_nombre_usuario
    FROM public.tb_usuario
    WHERE id = p_id_usuario
    LIMIT 1;
  ELSE
    v_nombre_usuario := COALESCE(v_op.nombre_usuario_gestor, v_op.nombre_usuario);
  END IF;

  SELECT *
  INTO v_mov
  FROM public.tb_operacion_caja
  WHERE id_operacion_proceso = p_id_operacion
    AND tipo_origen = 'PAGO_DEUDA_COMISION'
  ORDER BY id
  LIMIT 1
  FOR UPDATE;

  IF v_mov.id IS NULL THEN
    RETURN public.f_post_tb_operacion_caja(
      p_id_caja := v_caja.id,
      p_tipo_origen := 'PAGO_DEUDA_COMISION',
      p_tipo_movimiento := 'INGRESO',
      p_id_operacion_proceso := p_id_operacion,
      p_id_codigo_servicio := v_op.id_codigo_servicio,
      p_nombre_codigo_servicio := v_op.nombre_codigo_servicio,
      p_dni_cliente := v_op.dni_cliente,
      p_nombre_cliente := v_op.nombre_cliente,
      p_codigo_operacion := v_op.codigo_operacion_deposito_cliente,
      p_nombre_categoria_movimiento := 'Comision Pago Deuda',
      p_detalle := 'Ingreso de comision Pago Deuda',
      p_id_banco_tercero := v_op.id_banco_cliente,
      p_nombre_banco_tercero := v_op.nombre_banco_cliente,
      p_monto_ingreso := v_monto_comision,
      p_monto_gasto := 0,
      p_monto_ganancia := v_monto_comision,
      p_monto_salida := 0,
      p_flag_contabiliza_operacion := true,
      p_id_estado := v_estado_id,
      p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario),
      p_nombre_usuario := v_nombre_usuario,
      p_tipo_facturacion := COALESCE(v_op.tipo_facturacion, 'Boleta')
    );
  END IF;

  IF v_mov.id_caja_cierre IS NOT NULL THEN
    IF v_mov.id_caja IS DISTINCT FROM v_caja.id THEN
      RETURN jsonb_build_object(
        'error',
        'La comision ya pertenece a un cierre de caja distinto y no puede reubicarse.'
      );
    END IF;

    SELECT x
    INTO v_result
    FROM public.f_get_tb_operacion_caja(p_id := v_mov.id) AS x
    LIMIT 1;

    RETURN v_result || jsonb_build_object('idempotente', true, 'cerrado', true);
  END IF;

  PERFORM public.f_apply_tb_operacion_caja_delta(
    p_id_caja := v_mov.id_caja,
    p_tipo_movimiento := v_mov.tipo_movimiento,
    p_nombre_estado := v_mov.nombre_estado,
    p_monto_ingreso := v_mov.monto_ingreso,
    p_monto_gasto := v_mov.monto_gasto,
    p_monto_ganancia := v_mov.monto_ganancia,
    p_monto_salida := v_mov.monto_salida,
    p_flag_contabiliza_operacion := v_mov.flag_contabiliza_operacion,
    p_factor := -1,
    p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario)
  );

  SELECT saldo_actual
  INTO v_saldo_anterior
  FROM public.tb_caja_operativa
  WHERE id = v_caja.id
  LIMIT 1;

  v_saldo_actual := public.f_apply_tb_operacion_caja_delta(
    p_id_caja := v_caja.id,
    p_tipo_movimiento := 'INGRESO',
    p_nombre_estado := v_estado_nombre,
    p_monto_ingreso := v_monto_comision,
    p_monto_gasto := 0,
    p_monto_ganancia := v_monto_comision,
    p_monto_salida := 0,
    p_flag_contabiliza_operacion := COALESCE(v_mov.flag_contabiliza_operacion, true),
    p_factor := 1,
    p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario)
  );

  UPDATE public.tb_operacion_caja
  SET id_caja = v_caja.id,
      id_codigo_servicio = v_op.id_codigo_servicio,
      nombre_codigo_servicio = v_op.nombre_codigo_servicio,
      dni_cliente = v_op.dni_cliente,
      nombre_cliente = v_op.nombre_cliente,
      codigo_operacion = v_op.codigo_operacion_deposito_cliente,
      nombre_categoria_movimiento = 'Comision Pago Deuda',
      detalle = 'Ingreso de comision Pago Deuda',
      id_empresa = v_caja.id_empresa,
      nombre_empresa = v_caja.nombre_empresa,
      id_empresa_cuenta_bancaria = v_caja.id_empresa_cuenta_bancaria,
      id_banco = v_caja.id_banco,
      nombre_banco = v_caja.nombre_banco,
      id_banco_tercero = v_op.id_banco_cliente,
      nombre_banco_tercero = v_op.nombre_banco_cliente,
      monto_ingreso = v_monto_comision,
      monto_gasto = 0,
      monto_ganancia = v_monto_comision,
      monto_salida = 0,
      saldo_anterior = v_saldo_anterior,
      saldo_actual = v_saldo_actual,
      id_estado = v_estado_id,
      nombre_estado = v_estado_nombre,
      id_usuario = COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario, id_usuario),
      nombre_usuario = COALESCE(v_nombre_usuario, nombre_usuario),
      tipo_facturacion = COALESCE(v_op.tipo_facturacion, tipo_facturacion)
  WHERE id = v_mov.id;

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_caja(p_id := v_mov.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_post_tb_pago_deuda_solicitud
Objetivo:
  Crear una solicitud raiz para atencion al cliente y una operacion hija
  bancaria visible en el tab Pago Deuda de la ruta destino.
*/
DROP FUNCTION IF EXISTS public.f_post_tb_pago_deuda_solicitud(
  bigint, character varying, character varying, bigint, character varying,
  bigint, bigint, character varying, bigint, bigint, character varying,
  bigint, character varying, character varying, character varying, numeric,
  bigint
);
DROP FUNCTION IF EXISTS public.f_post_tb_pago_deuda_solicitud(
  bigint, character varying, character varying, bigint, character varying,
  bigint, bigint, character varying, bigint, bigint, character varying,
  bigint, character varying, character varying, character varying, numeric,
  bigint, bigint
);
DROP FUNCTION IF EXISTS public.f_post_tb_pago_deuda_solicitud(
  bigint, character varying, character varying, bigint, character varying,
  numeric, bigint, character varying, bigint, bigint, character varying,
  bigint, character varying, character varying, character varying, numeric,
  bigint, bigint
);

CREATE OR REPLACE FUNCTION public.f_post_tb_pago_deuda_solicitud(
  p_id_usuario bigint,
  p_dni_cliente character varying,
  p_nombre_cliente character varying,
  p_id_banco_cliente bigint,
  p_nombre_banco_cliente character varying,
  p_monto_deposito_cliente numeric,
  p_id_comunidad bigint DEFAULT NULL,
  p_celular_cliente character varying DEFAULT NULL,
  p_id_operacion bigint DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL,
  p_id_usuario_solicitud bigint DEFAULT NULL,
  p_nombre_usuario_solicitud character varying DEFAULT NULL,
  p_ruta_origen character varying DEFAULT NULL,
  p_ruta_destino character varying DEFAULT NULL,
  p_comision_servicio_manual numeric DEFAULT NULL,
  p_tipo_documento_cliente bigint DEFAULT NULL,
  p_id_empresa_destino bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_regla record;
  v_cliente_id bigint;
  v_cliente_nombre character varying;
  v_dni_parseado character varying;
  v_tipo_doc character varying;
  v_tipo_documento bigint;
  v_celular_cliente bigint;
  v_estado_pendiente_id bigint;
  v_estado_pendiente_nombre character varying;
  v_username character varying;
  v_codigo_servicio_id bigint;
  v_codigo_servicio_nombre character varying;
  v_codigo_operacion character varying;
  v_root_id bigint;
  v_child_id bigint;
  v_calc_serv jsonb;
  v_calc_sal jsonb;
  v_result jsonb;
  v_nombre_usuario_gestor character varying;
  v_nombre_usuario_solicitud character varying;
  v_ruta_banco character varying;
  v_cuenta_salida record;
  v_existing record;
  v_comunidad_id bigint;
  v_comunidad_nombre character varying;
  v_comision_servicio_final numeric;
  v_monto_minimo_deposito_final numeric;
  v_cuenta_comision record;
BEGIN
  p_monto_deposito_cliente := ROUND(COALESCE(p_monto_deposito_cliente, 0)::numeric, 2);

  IF p_tipo_documento_cliente IS NOT NULL THEN
    IF p_tipo_documento_cliente NOT IN (1, 2) THEN
      RETURN jsonb_build_object('error', 'Tipo de documento invalido.');
    END IF;

    v_tipo_documento := p_tipo_documento_cliente;
    v_dni_parseado := REGEXP_REPLACE(COALESCE(p_dni_cliente, ''), '[^0-9]', '', 'g');

    IF v_tipo_documento = 1 AND LENGTH(v_dni_parseado) <> 8 THEN
      RETURN jsonb_build_object('error', 'El DNI debe tener exactamente 8 dígitos.');
    END IF;

    IF v_tipo_documento = 2 AND LENGTH(v_dni_parseado) <> 9 THEN
      RETURN jsonb_build_object('error', 'El CE debe tener exactamente 9 dígitos.');
    END IF;
  ELSE
    SELECT valor, tipo
    INTO v_dni_parseado, v_tipo_doc
    FROM public.f_get_tb_parse_documento(p_dni_cliente);

    v_tipo_documento := public.f_get_tb_documento_tipo_codigo(v_tipo_doc);
  END IF;

  v_celular_cliente := NULLIF(REGEXP_REPLACE(COALESCE(p_celular_cliente, ''), '[^0-9]', '', 'g'), '')::bigint;

  SELECT id, nombre
  INTO v_cliente_id, v_cliente_nombre
  FROM public.tb_cliente
  WHERE tipo_documento = v_tipo_documento
    AND numero_documento = v_dni_parseado
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    SELECT x.id, x.nombre
    INTO v_cliente_id, v_cliente_nombre
    FROM jsonb_to_record(
      public.f_post_tb_cliente(
        p_tipo_documento := v_tipo_documento,
        p_numero_documento := v_dni_parseado,
        p_nombre := p_nombre_cliente,
        p_celular := v_celular_cliente,
        p_id_comunidad := p_id_comunidad,
        p_id_estado := (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1),
        p_id_usuario := p_id_usuario
      )
    ) AS x(id bigint, nombre character varying);
  ELSIF NULLIF(BTRIM(COALESCE(p_nombre_cliente, '')), '') IS NOT NULL
     OR NULLIF(BTRIM(COALESCE(p_celular_cliente, '')), '') IS NOT NULL THEN
    PERFORM public.f_patch_tb_cliente(
      p_id := v_cliente_id,
      p_nombre := NULLIF(BTRIM(COALESCE(p_nombre_cliente, '')), ''),
      p_celular := v_celular_cliente,
      p_id_usuario := p_id_usuario
    );
    v_cliente_nombre := COALESCE(NULLIF(BTRIM(COALESCE(p_nombre_cliente, '')), ''), v_cliente_nombre);
  END IF;

  SELECT cs.id, cs.nombre
  INTO v_codigo_servicio_id, v_codigo_servicio_nombre
  FROM public.tb_codigo_servicio cs
  WHERE UPPER(COALESCE(cs.nombre, '')) LIKE '%PAGO%DEUDA%'
  ORDER BY cs.id
  LIMIT 1;

  IF v_codigo_servicio_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro el servicio Pago Deuda.');
  END IF;

  SELECT r.*
  INTO v_regla
  FROM public.tb_reglas_efectivizacion r
  WHERE r.id_codigo_servicio = v_codigo_servicio_id
    AND r.id_banco = p_id_banco_cliente
    AND r.id_estado = (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1)
  ORDER BY r.id
  LIMIT 1;

  IF v_regla.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro una regla activa de Pago Deuda para el banco seleccionado.');
  END IF;

  IF p_comision_servicio_manual IS NOT NULL AND p_comision_servicio_manual < 0 THEN
    RETURN jsonb_build_object('error', 'La comision especial debe ser mayor o igual a 0.');
  END IF;

  v_comision_servicio_final := COALESCE(p_comision_servicio_manual, v_regla.comision_servicio);
  v_monto_minimo_deposito_final := CASE
    WHEN p_comision_servicio_manual IS NOT NULL THEN 0
    ELSE v_regla.monto_minimo_deposito_servicio
  END;

  v_comunidad_id := COALESCE(p_id_comunidad, v_regla.id_comunidad);

  SELECT nombre
  INTO v_comunidad_nombre
  FROM public.tb_comunidad
  WHERE id = v_comunidad_id
  LIMIT 1;

  SELECT id, nombre
  INTO v_estado_pendiente_id, v_estado_pendiente_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PENDIENTE'
  LIMIT 1;

  SELECT username
  INTO v_username
  FROM public.tb_usuario
  WHERE id = p_id_usuario;

  v_username := COALESCE(v_username, 'Sistema');

  IF p_id_usuario_gestor IS NOT NULL AND p_nombre_usuario_gestor IS NULL THEN
    SELECT username
    INTO v_nombre_usuario_gestor
    FROM public.tb_usuario
    WHERE id = p_id_usuario_gestor;
  ELSE
    v_nombre_usuario_gestor := p_nombre_usuario_gestor;
  END IF;

  IF p_id_usuario_solicitud IS NOT NULL AND p_nombre_usuario_solicitud IS NULL THEN
    SELECT username
    INTO v_nombre_usuario_solicitud
    FROM public.tb_usuario
    WHERE id = p_id_usuario_solicitud;
  ELSE
    v_nombre_usuario_solicitud := p_nombre_usuario_solicitud;
  END IF;

  SELECT rc.ruta
  INTO v_ruta_banco
  FROM public.tb_ruta_operacion_caja rc
  JOIN public.tb_empresa e ON e.id = rc.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = rc.id_empresa_cuenta_bancaria
  WHERE rc.id_estado = 1
    AND ecb.id_estado = 1
    AND ecb.id_banco = p_id_banco_cliente
    AND e.id_estado = 1
    -- SafetyPay es una ruta de recaudacion y no atiende solicitudes de Pago Deuda.
    AND LOWER(COALESCE(rc.ruta, '')) <> 'safetypay'
    AND (p_id_empresa_destino IS NULL OR rc.id_empresa = p_id_empresa_destino)
  ORDER BY rc.flag_caja_ingreso_principal DESC, e.nombre ASC, rc.id ASC
  LIMIT 1;

  IF p_id_empresa_destino IS NOT NULL AND v_ruta_banco IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'La empresa seleccionada no tiene una cuenta operativa activa para el banco solicitado.'
    );
  END IF;

  v_ruta_banco := COALESCE(
    v_ruta_banco,
    p_ruta_destino,
    lower(regexp_replace(COALESCE(p_nombre_banco_cliente, ''), '\s+', '', 'g'))
  );

  SELECT
    rc.ruta,
    rc.id_empresa,
    e.nombre AS nombre_empresa,
    rc.id_empresa_cuenta_bancaria,
    ecb.id_banco,
    b.nombre AS nombre_banco,
    ecb.comision_itf_ingreso_salida,
    ecb.comision_transf_banco_salida,
    ecb.comision_transf_inter_banco_salida
  INTO v_cuenta_salida
  FROM public.tb_ruta_operacion_caja rc
  JOIN public.tb_empresa e ON e.id = rc.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = rc.id_empresa_cuenta_bancaria
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  WHERE rc.ruta = v_ruta_banco
    AND rc.id_estado = 1
    AND ecb.id_estado = 1
    AND e.id_estado = 1
    -- Mantener Pago Deuda fuera de la asociacion interna de SafetyPay.
    AND LOWER(COALESCE(rc.ruta, '')) <> 'safetypay'
    AND (p_id_empresa_destino IS NULL OR rc.id_empresa = p_id_empresa_destino)
  ORDER BY (ecb.id_banco = p_id_banco_cliente) DESC, rc.flag_caja_ingreso_principal DESC, e.nombre ASC, rc.id ASC
  LIMIT 1;

  IF p_id_empresa_destino IS NOT NULL AND v_cuenta_salida.id_empresa IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'La empresa seleccionada no tiene una cuenta operativa activa para el banco solicitado.'
    );
  END IF;

  SELECT
    cfg.id_empresa,
    e.nombre AS empresa_nombre,
    cfg.id_empresa_cuenta_bancaria,
    ecb.id_banco,
    b.nombre AS banco_nombre
  INTO v_cuenta_comision
  FROM public.tb_pago_deuda_empresa_comision cfg
  JOIN public.tb_empresa e ON e.id = cfg.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = cfg.id_empresa_cuenta_bancaria
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  WHERE cfg.flag_deposito_comision = true
    AND cfg.id_estado = 1
    AND e.id_estado = 1
    AND ecb.id_estado = 1
  ORDER BY cfg.id ASC
  LIMIT 1;

  v_calc_serv := public.f_get_tb_operacion_calculo_comision_servicio(
    p_monto_deposito_cliente,
    v_comision_servicio_final,
    v_monto_minimo_deposito_final,
    v_regla.comision_minima_servicio,
    0
  );

  IF v_cuenta_salida.id_empresa IS NOT NULL THEN
    v_calc_sal := public.f_get_tb_operacion_calculo_comision_banco_salida(
      p_monto_deposito_cliente,
      COALESCE(v_cuenta_salida.comision_transf_banco_salida, 0),
      COALESCE(v_cuenta_salida.comision_transf_inter_banco_salida, 0),
      COALESCE(v_cuenta_salida.comision_itf_ingreso_salida, 0),
      p_id_empresa_salida := v_cuenta_salida.id_empresa,
      p_id_empresa_cuenta_salida := v_cuenta_salida.id_empresa_cuenta_bancaria,
      p_id_banco_empresa_cuenta_salida := v_cuenta_salida.id_banco,
      p_id_banco_cliente_transferencia := p_id_banco_cliente
    );
  END IF;

  IF p_id_operacion IS NULL THEN
    v_codigo_operacion := NULL;

    INSERT INTO public.tb_operacion_proceso (
      codigo_operacion_deposito_cliente, id_codigo_servicio, nombre_codigo_servicio, tipo_servicio,
      id_comunidad, nombre_comunidad, nombre_tipo_deposito, id_cliente, dni_cliente, nombre_cliente,
      id_banco_cliente, nombre_banco_cliente, monto_deposito_cliente, comision_servicio,
      monto_minimo_deposito_servicio, comision_minima_servicio, comision_monto_extra_servicio,
      resultado_comision_servicio, id_banco_cliente_transferencia, nombre_banco_cliente_transferencia,
      id_empresa_ingreso, nombre_empresa_ingreso, id_empresa_cuenta_ingreso,
      id_banco_empresa_cuenta_ingreso, nombre_banco_empresa_cuenta_ingreso,
      id_estado, nombre_estado, id_usuario, nombre_usuario, id_usuario_gestor, nombre_usuario_gestor,
      id_usuario_solicitud, nombre_usuario_solicitud, tipo_flujo_pago_deuda, ruta_origen, ruta_destino,
      fecha_pendiente
    )
    VALUES (
      v_codigo_operacion, v_codigo_servicio_id, v_codigo_servicio_nombre, 'Pago Deuda',
      v_comunidad_id, v_comunidad_nombre,
      v_regla.tipo_deposito, v_cliente_id, v_dni_parseado, COALESCE(v_cliente_nombre, p_nombre_cliente),
      p_id_banco_cliente, p_nombre_banco_cliente, p_monto_deposito_cliente, v_comision_servicio_final,
      v_monto_minimo_deposito_final, v_regla.comision_minima_servicio, 0,
      (v_calc_serv->>'resultado_comision_servicio')::numeric, p_id_banco_cliente, p_nombre_banco_cliente,
      v_cuenta_comision.id_empresa, v_cuenta_comision.empresa_nombre,
      v_cuenta_comision.id_empresa_cuenta_bancaria, v_cuenta_comision.id_banco,
      v_cuenta_comision.banco_nombre,
      v_estado_pendiente_id, v_estado_pendiente_nombre, p_id_usuario, v_username,
      COALESCE(p_id_usuario_gestor, p_id_usuario), COALESCE(v_nombre_usuario_gestor, v_username),
      COALESCE(p_id_usuario_solicitud, p_id_usuario), COALESCE(v_nombre_usuario_solicitud, v_username),
      'SOLICITUD', COALESCE(p_ruta_origen, 'deuda'), 'deuda', NOW()
    )
    RETURNING id INTO v_root_id;
  ELSE
    v_root_id := p_id_operacion;

    SELECT op.*
    INTO v_existing
    FROM public.tb_operacion_proceso op
    WHERE op.id = v_root_id
      AND op.id_operacion_padre IS NULL
      AND UPPER(COALESCE(op.tipo_flujo_pago_deuda, '')) = 'SOLICITUD'
    LIMIT 1;

    IF v_existing.id IS NULL THEN
      RETURN jsonb_build_object('error', 'Solicitud de Pago Deuda no encontrada.');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.tb_operacion_proceso h
      WHERE h.id_operacion_padre = v_root_id
        AND UPPER(COALESCE(h.tipo_flujo_pago_deuda, '')) = 'BANCO'
        AND UPPER(COALESCE(h.nombre_estado, '')) <> 'PENDIENTE'
    ) THEN
      RETURN jsonb_build_object('error', 'Solo se puede editar una solicitud en paso 1.');
    END IF;

    UPDATE public.tb_operacion_proceso
    SET id_comunidad = v_comunidad_id,
        nombre_comunidad = v_comunidad_nombre,
        nombre_tipo_deposito = v_regla.tipo_deposito,
        id_cliente = v_cliente_id,
        dni_cliente = v_dni_parseado,
        nombre_cliente = COALESCE(v_cliente_nombre, p_nombre_cliente),
        id_banco_cliente = p_id_banco_cliente,
        nombre_banco_cliente = p_nombre_banco_cliente,
        monto_deposito_cliente = p_monto_deposito_cliente,
        comision_servicio = v_comision_servicio_final,
        monto_minimo_deposito_servicio = v_monto_minimo_deposito_final,
        comision_minima_servicio = v_regla.comision_minima_servicio,
        comision_monto_extra_servicio = 0,
        resultado_comision_servicio = (v_calc_serv->>'resultado_comision_servicio')::numeric,
        id_banco_cliente_transferencia = p_id_banco_cliente,
        nombre_banco_cliente_transferencia = p_nombre_banco_cliente,
        id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
        nombre_usuario_gestor = COALESCE(v_nombre_usuario_gestor, nombre_usuario_gestor),
        id_usuario_solicitud = COALESCE(p_id_usuario_solicitud, id_usuario_solicitud),
        nombre_usuario_solicitud = COALESCE(v_nombre_usuario_solicitud, nombre_usuario_solicitud)
    WHERE id = v_root_id;
  END IF;

  SELECT id
  INTO v_child_id
  FROM public.tb_operacion_proceso
  WHERE id_operacion_padre = v_root_id
    AND UPPER(COALESCE(tipo_flujo_pago_deuda, '')) = 'BANCO'
  ORDER BY id
  LIMIT 1;

  IF v_child_id IS NULL THEN
    INSERT INTO public.tb_operacion_proceso (
      codigo_operacion_deposito_cliente, id_codigo_servicio, nombre_codigo_servicio, tipo_servicio,
      id_comunidad, nombre_comunidad, nombre_tipo_deposito, id_cliente, dni_cliente, nombre_cliente,
      id_banco_cliente, nombre_banco_cliente, monto_deposito_cliente, comision_servicio,
      monto_minimo_deposito_servicio, comision_minima_servicio, comision_monto_extra_servicio,
      resultado_comision_servicio, id_empresa_salida, nombre_empresa_salida, id_empresa_cuenta_salida,
      id_banco_empresa_cuenta_salida, nombre_banco_empresa_cuenta_salida, comision_transf_banco_salida,
      comision_transf_inter_banco_salida, resultado_comision_banco_salida, monto_transferencia_cliente,
      monto_itf_salida, id_banco_cliente_transferencia, nombre_banco_cliente_transferencia,
      id_empresa_ingreso, nombre_empresa_ingreso, id_empresa_cuenta_ingreso,
      id_banco_empresa_cuenta_ingreso, nombre_banco_empresa_cuenta_ingreso,
      id_estado, nombre_estado, id_usuario, nombre_usuario, id_usuario_gestor, nombre_usuario_gestor,
      id_usuario_solicitud, nombre_usuario_solicitud, id_operacion_padre, tipo_flujo_pago_deuda,
      ruta_origen, ruta_destino, fecha_pendiente
    )
    VALUES (
      v_codigo_operacion, v_codigo_servicio_id, v_codigo_servicio_nombre, 'Pago Deuda',
      v_comunidad_id, v_comunidad_nombre,
      v_regla.tipo_deposito, v_cliente_id, v_dni_parseado, COALESCE(v_cliente_nombre, p_nombre_cliente),
      p_id_banco_cliente, p_nombre_banco_cliente, p_monto_deposito_cliente, v_comision_servicio_final,
      v_monto_minimo_deposito_final, v_regla.comision_minima_servicio, 0,
      (v_calc_serv->>'resultado_comision_servicio')::numeric, v_cuenta_salida.id_empresa,
      v_cuenta_salida.nombre_empresa, v_cuenta_salida.id_empresa_cuenta_bancaria, v_cuenta_salida.id_banco,
      v_cuenta_salida.nombre_banco, COALESCE(v_cuenta_salida.comision_transf_banco_salida, 0),
      COALESCE(v_cuenta_salida.comision_transf_inter_banco_salida, 0),
      COALESCE((v_calc_sal->>'resultado_comision_banco_salida')::numeric, 0), p_monto_deposito_cliente,
      COALESCE(v_cuenta_salida.comision_itf_ingreso_salida, 0), p_id_banco_cliente, p_nombre_banco_cliente,
      v_cuenta_comision.id_empresa, v_cuenta_comision.empresa_nombre,
      v_cuenta_comision.id_empresa_cuenta_bancaria, v_cuenta_comision.id_banco,
      v_cuenta_comision.banco_nombre,
      v_estado_pendiente_id, v_estado_pendiente_nombre, p_id_usuario, v_username,
      COALESCE(p_id_usuario_gestor, p_id_usuario), COALESCE(v_nombre_usuario_gestor, v_username),
      COALESCE(p_id_usuario_solicitud, p_id_usuario), COALESCE(v_nombre_usuario_solicitud, v_username),
      v_root_id, 'BANCO', 'deuda', v_ruta_banco, NOW()
    )
    RETURNING id INTO v_child_id;
  ELSE
    UPDATE public.tb_operacion_proceso
    SET id_comunidad = v_comunidad_id,
        nombre_comunidad = v_comunidad_nombre,
        nombre_tipo_deposito = v_regla.tipo_deposito,
        id_cliente = v_cliente_id,
        dni_cliente = v_dni_parseado,
        nombre_cliente = COALESCE(v_cliente_nombre, p_nombre_cliente),
        id_banco_cliente = p_id_banco_cliente,
        nombre_banco_cliente = p_nombre_banco_cliente,
        monto_deposito_cliente = p_monto_deposito_cliente,
        comision_servicio = v_comision_servicio_final,
        monto_minimo_deposito_servicio = v_monto_minimo_deposito_final,
        comision_minima_servicio = v_regla.comision_minima_servicio,
        comision_monto_extra_servicio = 0,
        resultado_comision_servicio = (v_calc_serv->>'resultado_comision_servicio')::numeric,
        id_empresa_salida = v_cuenta_salida.id_empresa,
        nombre_empresa_salida = v_cuenta_salida.nombre_empresa,
        id_empresa_cuenta_salida = v_cuenta_salida.id_empresa_cuenta_bancaria,
        id_banco_empresa_cuenta_salida = v_cuenta_salida.id_banco,
        nombre_banco_empresa_cuenta_salida = v_cuenta_salida.nombre_banco,
        comision_transf_banco_salida = COALESCE(v_cuenta_salida.comision_transf_banco_salida, 0),
        comision_transf_inter_banco_salida = COALESCE(v_cuenta_salida.comision_transf_inter_banco_salida, 0),
        resultado_comision_banco_salida = COALESCE((v_calc_sal->>'resultado_comision_banco_salida')::numeric, 0),
        monto_transferencia_cliente = p_monto_deposito_cliente,
        monto_itf_salida = COALESCE(v_cuenta_salida.comision_itf_ingreso_salida, 0),
        id_banco_cliente_transferencia = p_id_banco_cliente,
        nombre_banco_cliente_transferencia = p_nombre_banco_cliente,
        ruta_destino = v_ruta_banco,
        id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
        nombre_usuario_gestor = COALESCE(v_nombre_usuario_gestor, nombre_usuario_gestor),
        id_usuario_solicitud = COALESCE(p_id_usuario_solicitud, id_usuario_solicitud),
        nombre_usuario_solicitud = COALESCE(v_nombre_usuario_solicitud, nombre_usuario_solicitud)
    WHERE id = v_child_id;
  END IF;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_banco, p_id_usuario);

  SELECT x
  INTO v_result
  FROM public.f_get_tb_pago_deuda(p_id := v_root_id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_comision_especial
Objetivo:
  Aplicar una comision porcentual manual a una solicitud de Pago Deuda antes de
  ejecutar la transferencia bancaria. La comision manual reemplaza la regla
  vigente y se replica en la operacion hija BANCO para mantener el flujo
  sincronizado.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_comision_especial(
  p_id_operacion bigint,
  p_comision_servicio numeric,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_root public.tb_operacion_proceso%ROWTYPE;
  v_child public.tb_operacion_proceso%ROWTYPE;
  v_calc jsonb;
  v_result jsonb;
BEGIN
  IF p_id_operacion IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion requerida.');
  END IF;

  IF p_comision_servicio IS NULL OR p_comision_servicio < 0 THEN
    RETURN jsonb_build_object('error', 'La comision debe ser mayor o igual a 0.');
  END IF;

  SELECT op.*
  INTO v_root
  FROM public.tb_operacion_proceso op
  WHERE op.id = p_id_operacion
    AND op.id_operacion_padre IS NULL
    AND UPPER(COALESCE(op.tipo_flujo_pago_deuda, '')) = 'SOLICITUD'
  FOR UPDATE;

  IF v_root.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Solicitud de Pago Deuda no encontrada.');
  END IF;

  SELECT h.*
  INTO v_child
  FROM public.tb_operacion_proceso h
  WHERE h.id_operacion_padre = v_root.id
    AND UPPER(COALESCE(h.tipo_flujo_pago_deuda, '')) = 'BANCO'
  ORDER BY h.id
  LIMIT 1
  FOR UPDATE;

  IF v_child.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro la operacion bancaria de la solicitud.');
  END IF;

  IF UPPER(COALESCE(v_child.nombre_estado, '')) <> 'PENDIENTE' THEN
    RETURN jsonb_build_object('error', 'Solo se puede editar la comision en paso 1.');
  END IF;

  v_calc := public.f_get_tb_operacion_calculo_comision_servicio(
    COALESCE(v_root.monto_deposito_cliente, 0),
    p_comision_servicio,
    0,
    COALESCE(v_root.comision_minima_servicio, 0),
    COALESCE(v_root.comision_monto_extra_servicio, 0)
  );

  UPDATE public.tb_operacion_proceso
  SET comision_servicio = p_comision_servicio,
      monto_minimo_deposito_servicio = 0,
      resultado_comision_servicio = (v_calc->>'resultado_comision_servicio')::numeric,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id IN (v_root.id, v_child.id);

  SELECT x
  INTO v_result
  FROM public.f_get_tb_pago_deuda(p_id := v_root.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_comision_extra
Objetivo:
  Aplicar una comision extra en soles a una solicitud Pago Deuda antes de
  confirmar la comision final. El monto extra recalcula la comision total y se
  replica en la operacion hija BANCO.
*/
DROP FUNCTION IF EXISTS public.f_patch_tb_pago_deuda_comision_extra(
  bigint, bigint, bigint, character varying
);

CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_comision_extra(
  p_id_operacion bigint,
  p_comision_monto_extra_servicio numeric,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_input public.tb_operacion_proceso%ROWTYPE;
  v_root public.tb_operacion_proceso%ROWTYPE;
  v_child public.tb_operacion_proceso%ROWTYPE;
  v_calc jsonb;
  v_result jsonb;
BEGIN
  IF p_id_operacion IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion requerida.');
  END IF;

  IF p_comision_monto_extra_servicio IS NULL OR p_comision_monto_extra_servicio < 0 THEN
    RETURN jsonb_build_object('error', 'La comision extra debe ser mayor o igual a 0.');
  END IF;

  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  FOR UPDATE;

  IF v_input.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Solicitud de Pago Deuda no encontrada.');
  END IF;

  IF UPPER(COALESCE(v_input.tipo_flujo_pago_deuda, '')) = 'BANCO'
     AND v_input.id_operacion_padre IS NOT NULL THEN
    SELECT *
    INTO v_root
    FROM public.tb_operacion_proceso
    WHERE id = v_input.id_operacion_padre
    FOR UPDATE;
  ELSE
    v_root := v_input;
  END IF;

  IF v_root.id IS NULL
     OR v_root.id_operacion_padre IS NOT NULL
     OR UPPER(COALESCE(v_root.tipo_flujo_pago_deuda, '')) <> 'SOLICITUD' THEN
    RETURN jsonb_build_object('error', 'Solicitud raiz de Pago Deuda no encontrada.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja c
    WHERE c.id_operacion_proceso = v_root.id
      AND c.tipo_origen = 'PAGO_DEUDA_COMISION'
  ) THEN
    RETURN jsonb_build_object('error', 'No se puede editar la comision extra de una solicitud pagada.');
  END IF;

  SELECT *
  INTO v_child
  FROM public.tb_operacion_proceso
  WHERE id_operacion_padre = v_root.id
    AND UPPER(COALESCE(tipo_flujo_pago_deuda, '')) = 'BANCO'
  ORDER BY id
  LIMIT 1
  FOR UPDATE;

  v_calc := public.f_get_tb_operacion_calculo_comision_servicio(
    COALESCE(v_root.monto_deposito_cliente, 0),
    COALESCE(v_root.comision_servicio, 0),
    COALESCE(v_root.monto_minimo_deposito_servicio, 0),
    COALESCE(v_root.comision_minima_servicio, 0),
    p_comision_monto_extra_servicio
  );

  UPDATE public.tb_operacion_proceso
  SET comision_monto_extra_servicio = p_comision_monto_extra_servicio,
      resultado_comision_servicio = (v_calc->>'resultado_comision_servicio')::numeric,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_root.id
     OR id = v_child.id;

  SELECT x
  INTO v_result
  FROM public.f_get_tb_pago_deuda(p_id := v_root.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_delete_tb_pago_deuda_solicitud
Objetivo:
  Eliminar fisicamente una solicitud Pago Deuda y su operacion bancaria hija
  solo cuando permanece en paso 1, sin devoluciones, match ni movimientos.
*/
CREATE OR REPLACE FUNCTION public.f_delete_tb_pago_deuda_solicitud(
  p_id_operacion bigint,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_input public.tb_operacion_proceso%ROWTYPE;
  v_root public.tb_operacion_proceso%ROWTYPE;
  v_child public.tb_operacion_proceso%ROWTYPE;
  v_ruta_destino character varying;
  v_deleted_child integer := 0;
  v_deleted_root integer := 0;
BEGIN
  IF p_id_operacion IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion requerida.');
  END IF;

  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  FOR UPDATE;

  IF v_input.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Solicitud de Pago Deuda no encontrada.');
  END IF;

  IF UPPER(COALESCE(v_input.tipo_flujo_pago_deuda, '')) = 'BANCO'
     AND v_input.id_operacion_padre IS NOT NULL THEN
    SELECT *
    INTO v_root
    FROM public.tb_operacion_proceso
    WHERE id = v_input.id_operacion_padre
    FOR UPDATE;
  ELSE
    v_root := v_input;
  END IF;

  IF v_root.id IS NULL
     OR v_root.id_operacion_padre IS NOT NULL
     OR UPPER(COALESCE(v_root.tipo_flujo_pago_deuda, '')) <> 'SOLICITUD' THEN
    RETURN jsonb_build_object('error', 'Solicitud raiz de Pago Deuda no encontrada.');
  END IF;

  SELECT *
  INTO v_child
  FROM public.tb_operacion_proceso
  WHERE id_operacion_padre = v_root.id
    AND UPPER(COALESCE(tipo_flujo_pago_deuda, '')) = 'BANCO'
  ORDER BY id
  LIMIT 1
  FOR UPDATE;

  -- La solicitud puede quedar huerfana si su operacion BANCO fue eliminada
  -- previamente. En ese caso se permite eliminar la raiz mientras siga
  -- pendiente; si la hija existe, se conserva la validacion original.
  IF v_child.id IS NULL THEN
    IF UPPER(COALESCE(v_root.nombre_estado, '')) <> 'PENDIENTE' THEN
      RETURN jsonb_build_object('error', 'Solo se puede eliminar una solicitud en paso 1.');
    END IF;
  ELSIF UPPER(COALESCE(v_child.nombre_estado, '')) <> 'PENDIENTE' THEN
    RETURN jsonb_build_object('error', 'Solo se puede eliminar una solicitud en paso 1.');
  END IF;

  IF v_root.id_operacion_match IS NOT NULL
     OR v_child.id_operacion_match IS NOT NULL
     OR COALESCE(v_root.monto_devuelto, 0) > 0
     OR COALESCE(v_child.monto_devuelto, 0) > 0 THEN
    RETURN jsonb_build_object('error', 'No se puede eliminar una solicitud con avance operativo.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_operacion_proceso op
    WHERE op.id NOT IN (v_root.id, v_child.id)
      AND (
        op.id_operacion_padre IN (v_root.id, v_child.id)
        OR op.id_operacion_match IN (v_root.id, v_child.id)
      )
  ) THEN
    RETURN jsonb_build_object('error', 'No se puede eliminar una solicitud con operaciones relacionadas.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja oc
    WHERE oc.id_operacion_proceso IN (v_root.id, v_child.id)
  ) THEN
    RETURN jsonb_build_object('error', 'No se puede eliminar una solicitud con movimientos de caja.');
  END IF;

  v_ruta_destino := COALESCE(v_child.ruta_destino, v_root.ruta_destino);

  IF v_child.id IS NOT NULL THEN
    DELETE FROM public.tb_operacion_proceso
    WHERE id = v_child.id;
    GET DIAGNOSTICS v_deleted_child = ROW_COUNT;
  END IF;

  DELETE FROM public.tb_operacion_proceso
  WHERE id = v_root.id;
  GET DIAGNOSTICS v_deleted_root = ROW_COUNT;

  IF v_ruta_destino IS NOT NULL THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_destino, p_id_usuario);
  END IF;

  RETURN jsonb_build_object(
    'eliminado', true,
    'solicitudes_eliminadas', v_deleted_root,
    'operaciones_banco_eliminadas', v_deleted_child
  );
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_salida
Objetivo:
  Confirmar el deposito al cliente desde la operacion bancaria hija. Cambia a
  Procesado y crea/sincroniza la SALIDA de caja. La caja puede quedar con
  saldo negativo; no se bloquea el paso por falta de saldo disponible.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_salida(
  p_id_operacion bigint,
  p_id_empresa_salida bigint DEFAULT NULL,
  p_id_empresa_cuenta_salida bigint DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL,
  p_ruta_destino character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_input record;
  v_op record;
  v_cuenta record;
  v_calc_sal jsonb;
  v_result jsonb;
  v_caja_result jsonb;
  v_estado_procesado_id bigint;
  v_estado_procesado_nombre character varying;
  v_ruta_kpi_actual character varying;
  v_ruta_kpi_final character varying;
  v_id_empresa_salida_final bigint;
  v_id_empresa_cuenta_salida_final bigint;
  v_caja_salida record;
BEGIN
  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1
  FOR UPDATE;

  IF v_input.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion no encontrada.');
  END IF;

  IF UPPER(COALESCE(v_input.tipo_flujo_pago_deuda, '')) = 'SOLICITUD' THEN
    SELECT *
    INTO v_op
    FROM public.tb_operacion_proceso
    WHERE id_operacion_padre = v_input.id
      AND UPPER(COALESCE(tipo_flujo_pago_deuda, '')) = 'BANCO'
    ORDER BY id
    LIMIT 1
    FOR UPDATE;
  ELSE
    v_op := v_input;
  END IF;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro la operacion bancaria de Pago Deuda.');
  END IF;

  v_ruta_kpi_actual := COALESCE(v_op.ruta_destino, v_op.ruta_origen);
  v_id_empresa_salida_final := COALESCE(p_id_empresa_salida, v_op.id_empresa_salida);
  v_id_empresa_cuenta_salida_final := COALESCE(p_id_empresa_cuenta_salida, v_op.id_empresa_cuenta_salida);

  SELECT
    ecb.id,
    ecb.id_banco,
    ecb.id_empresa,
    e.nombre AS empresa_nombre,
    b.nombre AS banco_nombre,
    ecb.comision_itf_ingreso_salida,
    ecb.comision_transf_banco_salida,
    ecb.comision_transf_inter_banco_salida
  INTO v_cuenta
  FROM public.tb_empresa_cuenta_bancaria ecb
  JOIN public.tb_empresa e ON ecb.id_empresa = e.id
  JOIN public.tb_banco b ON ecb.id_banco = b.id
  WHERE ecb.id = v_id_empresa_cuenta_salida_final
    AND ecb.id_empresa = v_id_empresa_salida_final
  LIMIT 1;

  IF v_cuenta.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Cuenta de salida no encontrada. Selecciona Empresa antes de transferir.');
  END IF;

  v_calc_sal := public.f_get_tb_operacion_calculo_comision_banco_salida(
    COALESCE(v_op.monto_deposito_cliente, 0),
    COALESCE(v_cuenta.comision_transf_banco_salida, 0),
    COALESCE(v_cuenta.comision_transf_inter_banco_salida, 0),
    COALESCE(v_cuenta.comision_itf_ingreso_salida, 0),
    p_id_empresa_salida := v_id_empresa_salida_final,
    p_id_empresa_cuenta_salida := v_id_empresa_cuenta_salida_final,
    p_id_banco_empresa_cuenta_salida := v_cuenta.id_banco,
    p_id_banco_cliente_transferencia := v_op.id_banco_cliente
  );

  /* Mantener el lock y validar que exista la caja, sin bloquear por saldo. */
  SELECT c.id, c.saldo_actual
  INTO v_caja_salida
  FROM public.tb_caja_operativa c
  WHERE c.id_empresa = v_id_empresa_salida_final
    AND c.id_empresa_cuenta_bancaria = v_id_empresa_cuenta_salida_final
  LIMIT 1
  FOR UPDATE;

  IF v_caja_salida.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No existe caja inicial para la empresa y cuenta de salida seleccionada.');
  END IF;

  SELECT id, nombre
  INTO v_estado_procesado_id, v_estado_procesado_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PROCESADO'
  LIMIT 1;

  IF v_estado_procesado_id IS NULL THEN
    INSERT INTO public.tb_estado (nombre, id_usuario)
    VALUES ('Procesado', p_id_usuario_gestor)
    RETURNING id, nombre INTO v_estado_procesado_id, v_estado_procesado_nombre;
  END IF;

  UPDATE public.tb_operacion_proceso
  SET id_empresa_salida = v_id_empresa_salida_final,
      nombre_empresa_salida = v_cuenta.empresa_nombre,
      id_empresa_cuenta_salida = v_id_empresa_cuenta_salida_final,
      id_banco_empresa_cuenta_salida = v_cuenta.id_banco,
      nombre_banco_empresa_cuenta_salida = v_cuenta.banco_nombre,
      comision_transf_banco_salida = COALESCE(v_cuenta.comision_transf_banco_salida, 0),
      comision_transf_inter_banco_salida = COALESCE(v_cuenta.comision_transf_inter_banco_salida, 0),
      resultado_comision_banco_salida = (v_calc_sal->>'resultado_comision_banco_salida')::numeric,
      monto_transferencia_cliente = COALESCE(v_op.monto_deposito_cliente, 0),
      monto_itf_salida = COALESCE(v_cuenta.comision_itf_ingreso_salida, 0),
      ruta_destino = COALESCE(p_ruta_destino, ruta_destino),
      id_estado = v_estado_procesado_id,
      nombre_estado = v_estado_procesado_nombre,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_op.id;

  IF v_op.id_operacion_padre IS NOT NULL THEN
    UPDATE public.tb_operacion_proceso
    SET id_estado = v_estado_procesado_id,
        nombre_estado = v_estado_procesado_nombre,
        id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
        nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
    WHERE id = v_op.id_operacion_padre;
  END IF;

  v_caja_result := public.f_post_tb_operacion_caja_desde_proceso(
    p_id_operacion_proceso := v_op.id,
    p_tipo_origen := 'PAGO_DEUDA',
    p_tipo_movimiento := 'SALIDA',
    p_id_usuario := COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
    p_id_estado := v_estado_procesado_id
  );

  IF v_caja_result ? 'error' THEN
    RETURN v_caja_result;
  END IF;

  v_ruta_kpi_final := COALESCE(p_ruta_destino, v_op.ruta_destino, v_op.ruta_origen);

  IF v_ruta_kpi_actual IS NOT NULL THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi_actual, COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario));
  END IF;
  IF v_ruta_kpi_final IS DISTINCT FROM v_ruta_kpi_actual THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi_final, COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario));
  END IF;

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_proceso(p_id := v_op.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_empresa
Objetivo:
  Cambiar la empresa/cuenta de salida de Pago Deuda sin confirmar la
  transferencia ni generar movimientos de caja.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_empresa(
  p_id_operacion bigint,
  p_id_empresa_salida bigint,
  p_id_empresa_cuenta_salida bigint,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL,
  p_ruta_destino character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_input record;
  v_op record;
  v_cuenta record;
  v_calc_sal jsonb;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1;

  IF v_input.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion no encontrada.');
  END IF;

  IF UPPER(COALESCE(v_input.tipo_flujo_pago_deuda, '')) = 'SOLICITUD' THEN
    SELECT *
    INTO v_op
    FROM public.tb_operacion_proceso
    WHERE id_operacion_padre = v_input.id
      AND UPPER(COALESCE(tipo_flujo_pago_deuda, '')) = 'BANCO'
    ORDER BY id
    LIMIT 1;
  ELSE
    v_op := v_input;
  END IF;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro la operacion bancaria de Pago Deuda.');
  END IF;

  SELECT
    ecb.id,
    ecb.id_banco,
    ecb.id_empresa,
    e.nombre AS empresa_nombre,
    b.nombre AS banco_nombre,
    ecb.comision_itf_ingreso_salida,
    ecb.comision_transf_banco_salida,
    ecb.comision_transf_inter_banco_salida
  INTO v_cuenta
  FROM public.tb_empresa_cuenta_bancaria ecb
  JOIN public.tb_empresa e ON ecb.id_empresa = e.id
  JOIN public.tb_banco b ON ecb.id_banco = b.id
  WHERE ecb.id = p_id_empresa_cuenta_salida
    AND ecb.id_empresa = p_id_empresa_salida
  LIMIT 1;

  IF v_cuenta.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Cuenta de salida no encontrada.');
  END IF;

  v_calc_sal := public.f_get_tb_operacion_calculo_comision_banco_salida(
    COALESCE(v_op.monto_deposito_cliente, 0),
    COALESCE(v_cuenta.comision_transf_banco_salida, 0),
    COALESCE(v_cuenta.comision_transf_inter_banco_salida, 0),
    COALESCE(v_cuenta.comision_itf_ingreso_salida, 0),
    p_id_empresa_salida := p_id_empresa_salida,
    p_id_empresa_cuenta_salida := p_id_empresa_cuenta_salida,
    p_id_banco_empresa_cuenta_salida := v_cuenta.id_banco,
    p_id_banco_cliente_transferencia := v_op.id_banco_cliente
  );

  UPDATE public.tb_operacion_proceso
  SET id_empresa_salida = p_id_empresa_salida,
      nombre_empresa_salida = v_cuenta.empresa_nombre,
      id_empresa_cuenta_salida = p_id_empresa_cuenta_salida,
      id_banco_empresa_cuenta_salida = v_cuenta.id_banco,
      nombre_banco_empresa_cuenta_salida = v_cuenta.banco_nombre,
      comision_transf_banco_salida = COALESCE(v_cuenta.comision_transf_banco_salida, 0),
      comision_transf_inter_banco_salida = COALESCE(v_cuenta.comision_transf_inter_banco_salida, 0),
      resultado_comision_banco_salida = (v_calc_sal->>'resultado_comision_banco_salida')::numeric,
      monto_transferencia_cliente = COALESCE(v_op.monto_deposito_cliente, 0),
      monto_itf_salida = COALESCE(v_cuenta.comision_itf_ingreso_salida, 0),
      ruta_destino = COALESCE(p_ruta_destino, ruta_destino),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_op.id;

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_proceso(p_id := v_op.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_comision_cuenta
Objetivo:
  Guardar la empresa/cuenta donde atencion cobrara la comision separada de
  Pago Deuda, sin generar movimientos de caja.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_comision_cuenta(
  p_id_operacion bigint,
  p_id_empresa_ingreso bigint,
  p_id_empresa_cuenta_ingreso bigint,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_input record;
  v_root record;
  v_cuenta record;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1;

  IF v_input.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de Pago Deuda no encontrada.');
  END IF;

  IF UPPER(COALESCE(v_input.tipo_flujo_pago_deuda, '')) = 'BANCO'
     AND v_input.id_operacion_padre IS NOT NULL THEN
    SELECT *
    INTO v_root
    FROM public.tb_operacion_proceso
    WHERE id = v_input.id_operacion_padre
    LIMIT 1;
  ELSE
    v_root := v_input;
  END IF;

  IF v_root.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Solicitud raiz de Pago Deuda no encontrada.');
  END IF;

  SELECT
    ecb.id,
    ecb.id_banco,
    ecb.id_empresa,
    e.nombre AS empresa_nombre,
    b.nombre AS banco_nombre,
    cfg.billetera_digital
  INTO v_cuenta
  FROM public.tb_empresa_cuenta_bancaria ecb
  JOIN public.tb_empresa e ON e.id = ecb.id_empresa
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  JOIN public.tb_pago_deuda_empresa_comision cfg
    ON cfg.id_empresa_cuenta_bancaria = ecb.id
   AND cfg.flag_deposito_comision = true
   AND cfg.id_estado = 1
  WHERE ecb.id = p_id_empresa_cuenta_ingreso
    AND ecb.id_empresa = p_id_empresa_ingreso
    AND ecb.id_estado = 1
  LIMIT 1;

  IF v_cuenta.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Cuenta de comision no habilitada para deposito.');
  END IF;

  UPDATE public.tb_operacion_proceso
  SET id_empresa_ingreso = p_id_empresa_ingreso,
      nombre_empresa_ingreso = v_cuenta.empresa_nombre,
      id_empresa_cuenta_ingreso = p_id_empresa_cuenta_ingreso,
      id_banco_empresa_cuenta_ingreso = v_cuenta.id_banco,
      nombre_banco_empresa_cuenta_ingreso = v_cuenta.banco_nombre,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_root.id
     OR id_operacion_padre = v_root.id;

  SELECT x
  INTO v_result
  FROM public.f_get_tb_pago_deuda(p_id := v_root.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_match
Objetivo:
  Confirmar el match de una solicitud Pago Deuda contra una operacion de
  efectivizacion, copiando el snapshot de ingreso a la solicitud.

Diseno compacto:
  - no crea ni borra movimientos de caja porque reutiliza el ingreso conciliado
  - no anula la efectivizacion original
  - solo congela el snapshot que necesita la solicitud de pago de deuda
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_match(
  p_id_pago_deuda bigint,
  p_id_operacion_efectivizacion bigint,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_input record;
  v_op_deuda record;
  v_op_efect record;
  v_estado_pagado_id bigint;
  v_estado_pagado_nombre character varying;
  v_estado_retenido_id bigint;
  v_estado_retenido_nombre character varying;
  v_movimiento_efect record;
  v_ingreso_result jsonb;
BEGIN
  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_pago_deuda
  LIMIT 1;

  IF v_input.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de Pago Deuda no encontrada.');
  END IF;

  IF UPPER(COALESCE(v_input.tipo_flujo_pago_deuda, '')) = 'SOLICITUD' THEN
    SELECT *
    INTO v_op_deuda
    FROM public.tb_operacion_proceso
    WHERE id_operacion_padre = v_input.id
      AND UPPER(COALESCE(tipo_flujo_pago_deuda, '')) = 'BANCO'
    ORDER BY id
    LIMIT 1;
  ELSE
    v_op_deuda := v_input;
  END IF;

  IF v_op_deuda.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro la operacion bancaria de Pago Deuda.');
  END IF;

  SELECT *
  INTO v_op_efect
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion_efectivizacion
  LIMIT 1
  FOR UPDATE;

  IF v_op_efect.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de efectivizacion no encontrada.');
  END IF;

  IF UPPER(BTRIM(COALESCE(v_op_efect.tipo_flujo_pago_deuda, ''))) = 'RETORNO'
     AND v_op_efect.id_operacion_match = v_op_deuda.id THEN
    RETURN (
      SELECT x
      FROM public.f_get_tb_operacion_proceso(p_id := v_op_efect.id) AS x
      LIMIT 1
    );
  END IF;

  IF UPPER(BTRIM(COALESCE(v_op_efect.tipo_servicio, ''))) <> 'EFECTIVIZACION'
     OR UPPER(BTRIM(COALESCE(v_op_efect.nombre_estado, ''))) <> 'PENDIENTE'
     OR v_op_efect.id_operacion_match IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error', 'La operacion ya no esta disponible para realizar el match de Pago Deuda.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja oc
    WHERE oc.id_operacion_proceso = v_op_efect.id
      AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'SALIDA'
      AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) <> 'ELIMINADO'
  ) THEN
    RETURN jsonb_build_object(
      'error', 'La operacion ya tiene una salida bancaria y no puede utilizarse como retorno.'
    );
  END IF;

  -- El match reutiliza el ingreso de la efectivizacion. Se bloquea el
  -- movimiento para poder actualizarlo en sitio y evitar una reversa
  -- temporal que pueda llevar la caja a saldo negativo.
  SELECT oc.*
  INTO v_movimiento_efect
  FROM public.tb_operacion_caja oc
  WHERE oc.id_operacion_proceso = v_op_efect.id
    AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
  ORDER BY oc.id
  LIMIT 1
  FOR UPDATE;

  IF v_movimiento_efect.id IS NOT NULL
     AND v_movimiento_efect.id_caja_cierre IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error', 'No se puede realizar el match porque el movimiento de efectivizacion ya pertenece a un cierre de caja.'
    );
  END IF;

  IF COALESCE(v_op_deuda.dni_cliente, '') <> COALESCE(v_op_efect.dni_cliente, '') THEN
    RETURN jsonb_build_object('error', 'Los DNIs no coinciden.');
  END IF;

  IF v_op_efect.fecha_deposito_cliente IS NULL
     OR ABS(
       EXTRACT(epoch FROM (v_op_efect.fecha_deposito_cliente - COALESCE(v_op_deuda.fecha_pendiente, v_op_deuda.fecha_registro)))
     ) > 86400 THEN
    RETURN jsonb_build_object('error', 'La fecha de deposito excede el rango de 24h con la solicitud Pago Deuda.');
  END IF;

  SELECT id, nombre
  INTO v_estado_pagado_id, v_estado_pagado_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PAGADO'
  LIMIT 1;

  SELECT id, nombre
  INTO v_estado_retenido_id, v_estado_retenido_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'RETENIDO'
  LIMIT 1;

  UPDATE public.tb_operacion_proceso
  SET fecha_deposito_cliente = v_op_efect.fecha_deposito_cliente,
      monto_devuelto = COALESCE(v_op_deuda.monto_devuelto, 0) + COALESCE(v_op_efect.monto_deposito_cliente, 0),
      id_operacion_match = CASE
        WHEN (COALESCE(v_op_deuda.monto_devuelto, 0) + COALESCE(v_op_efect.monto_deposito_cliente, 0)) >= COALESCE(v_op_deuda.monto_deposito_cliente, 0)
        THEN COALESCE(id_operacion_match, v_op_efect.id)
        ELSE id_operacion_match
      END,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_op_deuda.id;

  IF (COALESCE(v_op_deuda.monto_devuelto, 0) + COALESCE(v_op_efect.monto_deposito_cliente, 0)) >= COALESCE(v_op_deuda.monto_deposito_cliente, 0) THEN
    UPDATE public.tb_operacion_proceso
    SET id_operacion_match = v_op_efect.id,
        id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
        nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
    WHERE id = v_op_deuda.id_operacion_padre AND id_operacion_match IS NULL;
  END IF;

  UPDATE public.tb_operacion_proceso
  SET tipo_servicio = 'Pago Deuda',
      tipo_flujo_pago_deuda = 'RETORNO',
      id_operacion_match = v_op_deuda.id,
      id_estado = v_estado_pagado_id,
      nombre_estado = v_estado_pagado_nombre,
      fecha_pagado = COALESCE(fecha_pagado, NOW()),
      resultado_comision_servicio = 0,
      monto_transferencia_cliente = monto_deposito_cliente,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_op_efect.id;

  IF v_movimiento_efect.id IS NOT NULL THEN
    -- El monto ingresado no cambia con el match. Solo se reemplaza la
    -- naturaleza del movimiento y se revierten los acumulados que ya no
    -- corresponden a la efectivizacion original.
    UPDATE public.tb_operacion_caja
    SET tipo_origen = 'PAGO_DEUDA_DEVOLUCION',
        detalle = 'Retorno Pago Deuda',
        monto_ingreso = COALESCE(v_op_efect.monto_deposito_cliente, 0),
        monto_gasto = 0,
        monto_ganancia = 0,
        monto_salida = 0,
        id_estado = CASE
          WHEN COALESCE(v_op_efect.flag_retenido, false) AND v_estado_retenido_id IS NOT NULL
            THEN v_estado_retenido_id
          ELSE v_estado_pagado_id
        END,
        nombre_estado = CASE
          WHEN COALESCE(v_op_efect.flag_retenido, false) AND v_estado_retenido_nombre IS NOT NULL
            THEN v_estado_retenido_nombre
          ELSE v_estado_pagado_nombre
        END,
        id_usuario = COALESCE(p_id_usuario_gestor, v_op_efect.id_usuario_gestor, v_op_efect.id_usuario, id_usuario),
        nombre_usuario = COALESCE(p_nombre_usuario_gestor, v_op_efect.nombre_usuario_gestor, v_op_efect.nombre_usuario, nombre_usuario)
    WHERE id = v_movimiento_efect.id;

    UPDATE public.tb_caja_operativa
    SET gastos = GREATEST(COALESCE(gastos, 0) - COALESCE(v_movimiento_efect.monto_gasto, 0), 0),
        ganancia = CASE
          WHEN UPPER(BTRIM(COALESCE(v_movimiento_efect.nombre_estado, ''))) = 'RETENIDO'
            THEN COALESCE(ganancia, 0)
          ELSE GREATEST(COALESCE(ganancia, 0) - COALESCE(v_movimiento_efect.monto_ganancia, 0), 0)
        END,
        ganancia_retenido = CASE
          WHEN UPPER(BTRIM(COALESCE(v_movimiento_efect.nombre_estado, ''))) = 'RETENIDO'
            THEN GREATEST(COALESCE(ganancia_retenido, 0) - COALESCE(v_movimiento_efect.monto_ganancia, 0), 0)
          ELSE COALESCE(ganancia_retenido, 0)
        END,
        id_usuario = COALESCE(p_id_usuario_gestor, id_usuario)
    WHERE id = v_movimiento_efect.id_caja;

    PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(rc.ruta, p_id_usuario_gestor)
    FROM public.tb_ruta_operacion_caja rc
    JOIN public.tb_caja_operativa c
      ON c.id_empresa = rc.id_empresa
     AND c.id_empresa_cuenta_bancaria = rc.id_empresa_cuenta_bancaria
    WHERE c.id = v_movimiento_efect.id_caja
      AND rc.id_estado = 1;
  ELSE
    v_ingreso_result := public.f_post_tb_operacion_caja_desde_proceso(
      p_id_operacion_proceso := v_op_efect.id,
      p_tipo_origen := 'PAGO_DEUDA_DEVOLUCION',
      p_tipo_movimiento := 'INGRESO',
      p_id_usuario := COALESCE(p_id_usuario_gestor, v_op_efect.id_usuario_gestor, v_op_efect.id_usuario),
      p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_op_efect.nombre_usuario_gestor, v_op_efect.nombre_usuario),
      p_id_estado := v_estado_pagado_id
    );

    IF v_ingreso_result ? 'error' THEN
      RETURN v_ingreso_result;
    END IF;
  END IF;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := v_op_efect.id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_pagado
Objetivo:
  Finalizar una operacion bancaria de Pago Deuda. Asegura SALIDA, INGRESO de
  retorno e INGRESO de comision sin duplicar movimientos.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_pagado(
  p_id_operacion bigint,
  p_resultado_comision_servicio numeric DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_estado_pagado_id bigint;
  v_estado_pagado_nombre character varying;
  v_result jsonb;
  v_input record;
  v_op record;
  v_root record;
  v_cuenta_comision record;
  v_ruta_kpi character varying;
  v_salida_result jsonb;
  v_comision_result jsonb;
BEGIN
  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1
  FOR UPDATE;

  IF v_input.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de Pago Deuda no encontrada.');
  END IF;

  IF UPPER(COALESCE(v_input.tipo_flujo_pago_deuda, '')) = 'SOLICITUD' THEN
    SELECT *
    INTO v_op
    FROM public.tb_operacion_proceso
    WHERE id_operacion_padre = v_input.id
      AND UPPER(COALESCE(tipo_flujo_pago_deuda, '')) = 'BANCO'
    ORDER BY id
    LIMIT 1
    FOR UPDATE;
  ELSE
    v_op := v_input;
  END IF;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro la operacion bancaria de Pago Deuda.');
  END IF;

  SELECT *
  INTO v_root
  FROM public.tb_operacion_proceso
  WHERE id = COALESCE(v_op.id_operacion_padre, v_op.id)
  FOR UPDATE;

  IF v_root.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro la solicitud raiz de Pago Deuda.');
  END IF;

  IF v_op.id_empresa_salida IS NULL OR v_op.id_empresa_cuenta_salida IS NULL THEN
    RETURN jsonb_build_object('error', 'Selecciona la empresa y cuenta de salida antes de finalizar Pago Deuda.');
  END IF;

  IF v_op.id_operacion_match IS NULL
     AND COALESCE(v_op.monto_devuelto, 0) < COALESCE(v_op.monto_deposito_cliente, 0) THEN
    RETURN jsonb_build_object('error', 'Primero realiza el match con la efectivizacion de retorno.');
  END IF;

  IF v_root.id_empresa_ingreso IS NULL OR v_root.id_empresa_cuenta_ingreso IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion de Pago Deuda no tiene empresa y cuenta de ingreso configuradas.');
  END IF;

  SELECT
    ecb.id,
    ecb.id_empresa,
    e.nombre AS empresa_nombre,
    ecb.id_banco,
    b.nombre AS banco_nombre,
    cfg.flag_deposito_comision
  INTO v_cuenta_comision
  FROM public.tb_empresa_cuenta_bancaria ecb
  JOIN public.tb_empresa e ON e.id = ecb.id_empresa
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  JOIN public.tb_pago_deuda_empresa_comision cfg
    ON cfg.id_empresa_cuenta_bancaria = ecb.id
   AND cfg.id_empresa = ecb.id_empresa
   AND cfg.flag_deposito_comision = true
   AND cfg.id_estado = 1
  WHERE ecb.id = v_root.id_empresa_cuenta_ingreso
    AND ecb.id_empresa = v_root.id_empresa_ingreso
    AND e.id_estado = 1
    AND ecb.id_estado = 1
  LIMIT 1;

  IF v_cuenta_comision.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La cuenta de comision seleccionada no esta habilitada para recibir comisiones.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja oc
    JOIN public.tb_caja_operativa caja ON caja.id = oc.id_caja
    WHERE oc.id_operacion_proceso = v_root.id
      AND UPPER(COALESCE(oc.tipo_origen, '')) = 'PAGO_DEUDA_COMISION'
      AND oc.id_caja_cierre IS NOT NULL
      AND (
        caja.id_empresa IS DISTINCT FROM v_cuenta_comision.id_empresa
        OR caja.id_empresa_cuenta_bancaria IS DISTINCT FROM v_cuenta_comision.id
      )
  ) THEN
    RETURN jsonb_build_object('error', 'La comision ya pertenece a un cierre de caja distinto y no puede reubicarse.');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_caja_operativa c
    WHERE c.id_empresa = v_root.id_empresa_ingreso
      AND c.id_empresa_cuenta_bancaria = v_root.id_empresa_cuenta_ingreso
  ) THEN
    RETURN jsonb_build_object('error', 'No existe caja inicial para la empresa y cuenta de ingreso seleccionada.');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_caja_operativa c
    WHERE c.id_empresa = v_op.id_empresa_salida
      AND c.id_empresa_cuenta_bancaria = v_op.id_empresa_cuenta_salida
  ) THEN
    RETURN jsonb_build_object('error', 'No existe caja inicial para la empresa y cuenta de salida seleccionada.');
  END IF;

  UPDATE public.tb_operacion_proceso
  SET id_empresa_ingreso = v_root.id_empresa_ingreso,
      nombre_empresa_ingreso = v_cuenta_comision.empresa_nombre,
      id_empresa_cuenta_ingreso = v_root.id_empresa_cuenta_ingreso,
      id_banco_empresa_cuenta_ingreso = v_cuenta_comision.id_banco,
      nombre_banco_empresa_cuenta_ingreso = v_cuenta_comision.banco_nombre
  WHERE id = v_op.id;

  v_op.id_empresa_ingreso := v_root.id_empresa_ingreso;
  v_op.nombre_empresa_ingreso := v_cuenta_comision.empresa_nombre;
  v_op.id_empresa_cuenta_ingreso := v_root.id_empresa_cuenta_ingreso;
  v_op.id_banco_empresa_cuenta_ingreso := v_cuenta_comision.id_banco;
  v_op.nombre_banco_empresa_cuenta_ingreso := v_cuenta_comision.banco_nombre;

  SELECT id, nombre
  INTO v_estado_pagado_id, v_estado_pagado_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PAGADO'
  LIMIT 1;

  UPDATE public.tb_operacion_proceso
  SET id_estado = v_estado_pagado_id,
      nombre_estado = v_estado_pagado_nombre,
      resultado_comision_servicio = COALESCE(p_resultado_comision_servicio, resultado_comision_servicio),
      fecha_pagado = COALESCE(fecha_pagado, NOW()),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_op.id;

  IF v_op.id_operacion_padre IS NOT NULL THEN
    UPDATE public.tb_operacion_proceso
    SET id_estado = v_estado_pagado_id,
        nombre_estado = v_estado_pagado_nombre,
        id_operacion_match = COALESCE(id_operacion_match, v_op.id_operacion_match),
        fecha_pagado = COALESCE(fecha_pagado, NOW()),
        id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
        nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
    WHERE id = v_op.id_operacion_padre;
  END IF;

  v_salida_result := public.f_post_tb_operacion_caja_desde_proceso(
    p_id_operacion_proceso := v_op.id,
    p_tipo_origen := 'PAGO_DEUDA',
    p_tipo_movimiento := 'SALIDA',
    p_id_usuario := COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
    p_id_estado := v_estado_pagado_id
  );

  IF v_salida_result ? 'error' THEN
    RETURN v_salida_result;
  END IF;

  v_comision_result := public.f_sync_tb_pago_deuda_comision_caja(
    p_id_operacion := v_op.id_operacion_padre,
    p_id_estado := v_estado_pagado_id,
    p_id_usuario := COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
    p_id_empresa_ingreso := v_op.id_empresa_ingreso,
    p_id_empresa_cuenta_ingreso := v_op.id_empresa_cuenta_ingreso,
    p_monto_comision := v_op.resultado_comision_servicio
  );

  IF v_comision_result ? 'error' THEN
    RETURN v_comision_result;
  END IF;

  v_ruta_kpi := COALESCE(v_op.ruta_destino, v_op.ruta_origen);
  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi, COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario));

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_proceso(p_id := v_op.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_directo
Objetivo:
  Clasificar una efectivizacion como retorno directo de Pago Deuda sin enlazar
  una solicitud. Genera solo INGRESO de caja con gasto bancario de ingreso.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_directo(
  p_id_operacion_efectivizacion bigint,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_op record;
  v_estado_pagado_id bigint;
  v_estado_pagado_nombre character varying;
  v_caja_result jsonb;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_op
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion_efectivizacion
  LIMIT 1;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de efectivizacion no encontrada.');
  END IF;

  SELECT id, nombre
  INTO v_estado_pagado_id, v_estado_pagado_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PAGADO'
  LIMIT 1;

  UPDATE public.tb_operacion_proceso
  SET tipo_servicio = 'Pago Deuda',
      tipo_flujo_pago_deuda = 'RETORNO_DIRECTO',
      id_estado = v_estado_pagado_id,
      nombre_estado = v_estado_pagado_nombre,
      fecha_pagado = COALESCE(fecha_pagado, NOW()),
      resultado_comision_servicio = 0,
      monto_transferencia_cliente = monto_deposito_cliente,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_op.id;

  v_caja_result := public.f_post_tb_operacion_caja_desde_proceso(
    p_id_operacion_proceso := v_op.id,
    p_tipo_origen := 'PAGO_DEUDA_DEVOLUCION',
    p_tipo_movimiento := 'INGRESO',
    p_id_usuario := COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
    p_id_estado := v_estado_pagado_id
  );

  IF v_caja_result ? 'error' THEN
    RETURN v_caja_result;
  END IF;

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_proceso(p_id := v_op.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_post_tb_pago_deuda_comision
Objetivo:
  Registrar la comision separada de Pago Deuda en la empresa/cuenta elegida.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_pago_deuda_comision(
  p_id_operacion bigint,
  p_id_empresa_ingreso bigint,
  p_id_empresa_cuenta_ingreso bigint,
  p_monto_comision numeric DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_op record;
  v_estado_pagado_id bigint;
BEGIN
  SELECT *
  INTO v_op
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de Pago Deuda no encontrada.');
  END IF;

  SELECT id
  INTO v_estado_pagado_id
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PAGADO'
  LIMIT 1;

  RETURN public.f_sync_tb_pago_deuda_comision_caja(
    p_id_operacion := v_op.id,
    p_id_estado := COALESCE(v_estado_pagado_id, v_op.id_estado),
    p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
    p_id_empresa_ingreso := p_id_empresa_ingreso,
    p_id_empresa_cuenta_ingreso := p_id_empresa_cuenta_ingreso,
    p_monto_comision := p_monto_comision
  );
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_reiniciar_transferencia
Objetivo:
  Revertir una transferencia de Pago Deuda aun no cerrada, volviendo del paso
  2 (Procesado) al paso 1 (Pendiente) para corregir empresa/cuenta de salida.

Reglas:
  - solo trabaja sobre la operacion bancaria hija BANCO;
  - no permite reiniciar si ya existe match/devolucion;
  - no modifica movimientos cerrados por caja;
  - revierte el impacto de la SALIDA y elimina el movimiento abierto.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_reiniciar_transferencia(
  p_id_operacion bigint,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_input record;
  v_op record;
  v_mov record;
  v_estado_pendiente_id bigint;
  v_estado_pendiente_nombre character varying;
  v_ruta_kpi character varying;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1;

  IF v_input.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion de Pago Deuda no encontrada.');
  END IF;

  IF UPPER(COALESCE(v_input.tipo_flujo_pago_deuda, '')) = 'SOLICITUD' THEN
    SELECT *
    INTO v_op
    FROM public.tb_operacion_proceso
    WHERE id_operacion_padre = v_input.id
      AND UPPER(COALESCE(tipo_flujo_pago_deuda, '')) = 'BANCO'
    ORDER BY id
    LIMIT 1;
  ELSE
    v_op := v_input;
  END IF;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro la operacion bancaria de Pago Deuda.');
  END IF;

  IF v_op.id_operacion_match IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'No se puede reiniciar una Pago Deuda con devolucion enlazada.');
  END IF;

  SELECT *
  INTO v_mov
  FROM public.tb_operacion_caja
  WHERE id_operacion_proceso = v_op.id
    AND UPPER(COALESCE(tipo_movimiento, '')) = 'SALIDA'
    AND UPPER(COALESCE(tipo_origen, '')) = 'PAGO_DEUDA'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_mov.id IS NOT NULL AND v_mov.id_caja_cierre IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'No se puede reiniciar porque la salida ya pertenece a un cierre de caja.');
  END IF;

  SELECT id, nombre
  INTO v_estado_pendiente_id, v_estado_pendiente_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PENDIENTE'
  LIMIT 1;

  IF v_estado_pendiente_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro el estado Pendiente.');
  END IF;

  IF v_mov.id IS NOT NULL THEN
    PERFORM public.f_apply_tb_operacion_caja_delta(
      p_id_caja := v_mov.id_caja,
      p_tipo_movimiento := v_mov.tipo_movimiento,
      p_nombre_estado := v_mov.nombre_estado,
      p_monto_ingreso := v_mov.monto_ingreso,
      p_monto_gasto := v_mov.monto_gasto,
      p_monto_ganancia := v_mov.monto_ganancia,
      p_monto_salida := v_mov.monto_salida,
      p_flag_contabiliza_operacion := v_mov.flag_contabiliza_operacion,
      p_factor := -1,
      p_id_usuario := COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario)
    );

    DELETE FROM public.tb_operacion_caja
    WHERE id = v_mov.id;
  END IF;

  UPDATE public.tb_operacion_proceso
  SET id_estado = v_estado_pendiente_id,
      nombre_estado = v_estado_pendiente_nombre,
      fecha_pendiente = NOW(),
      fecha_pagado = NULL,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_op.id;

  IF v_op.id_operacion_padre IS NOT NULL THEN
    UPDATE public.tb_operacion_proceso
    SET id_estado = v_estado_pendiente_id,
        nombre_estado = v_estado_pendiente_nombre,
        fecha_pendiente = NOW(),
        fecha_pagado = NULL,
        id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
        nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
    WHERE id = v_op.id_operacion_padre;
  END IF;

  v_ruta_kpi := COALESCE(v_op.ruta_destino, v_op.ruta_origen);
  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi, COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario));

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_proceso(p_id := v_op.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_pago_deuda_derivar_banco
Objetivo:
  Mover la operacion BANCO de Pago Deuda a otra ruta bancaria durante el
  primer paso, resolviendo la cuenta principal activa por banco.
*/
DROP FUNCTION IF EXISTS public.f_patch_tb_pago_deuda_derivar_banco(
  bigint, bigint, bigint, character varying
);

CREATE OR REPLACE FUNCTION public.f_patch_tb_pago_deuda_derivar_banco(
  p_id_operacion bigint,
  p_id_banco_destino bigint,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL,
  p_id_ruta_operacion_caja_destino bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_input record;
  v_op record;
  v_destino record;
  v_calc jsonb;
  v_ruta_actual character varying;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_input
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion
  LIMIT 1
  FOR UPDATE;

  IF v_input.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion no encontrada.');
  END IF;

  IF UPPER(COALESCE(v_input.tipo_flujo_pago_deuda, '')) = 'SOLICITUD' THEN
    SELECT *
    INTO v_op
    FROM public.tb_operacion_proceso
    WHERE id_operacion_padre = v_input.id
      AND UPPER(COALESCE(tipo_flujo_pago_deuda, '')) = 'BANCO'
    ORDER BY id
    LIMIT 1
    FOR UPDATE;
  ELSE
    v_op := v_input;
  END IF;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro la operacion bancaria de Pago Deuda.');
  END IF;

  IF UPPER(COALESCE(v_op.nombre_estado, '')) NOT IN ('SOLICITADO', 'PENDIENTE')
     OR COALESCE(v_op.id_estado, 0) = 10
     OR EXISTS (
          SELECT 1
          FROM public.tb_operacion_caja c
          WHERE c.id_operacion_proceso = COALESCE(v_op.id_operacion_padre, v_op.id)
            AND UPPER(COALESCE(c.tipo_origen, '')) = 'PAGO_DEUDA_COMISION'
        )
     OR EXISTS (
          SELECT 1
          FROM public.tb_operacion_proceso r
          WHERE (r.id_operacion_padre = v_op.id OR r.id_operacion_match = v_op.id)
            AND UPPER(COALESCE(r.tipo_flujo_pago_deuda, '')) = 'RETORNO'
            AND r.id_estado = 4
        )
  THEN
    RETURN jsonb_build_object('error', 'Solo se pueden derivar operaciones de Pago Deuda en el Paso 1.');
  END IF;

  v_ruta_actual := LOWER(BTRIM(COALESCE(v_op.ruta_destino, v_op.ruta_origen, '')));

  IF p_id_ruta_operacion_caja_destino IS NOT NULL THEN
    SELECT
      rc.ruta,
      rc.id_empresa,
      e.nombre AS nombre_empresa,
      rc.id_empresa_cuenta_bancaria,
      ecb.id_banco,
      b.nombre AS nombre_banco,
      ecb.comision_transf_banco_salida,
      ecb.comision_transf_inter_banco_salida,
      ecb.comision_itf_ingreso_salida
    INTO v_destino
    FROM public.tb_ruta_operacion_caja rc
    JOIN public.tb_empresa e ON e.id = rc.id_empresa
    JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = rc.id_empresa_cuenta_bancaria
    JOIN public.tb_banco b ON b.id = ecb.id_banco
    WHERE rc.id = p_id_ruta_operacion_caja_destino
      AND rc.id_estado = 1
      AND e.id_estado = 1
      AND ecb.id_estado = 1
    LIMIT 1
    FOR UPDATE OF rc;

    IF v_destino.ruta IS NOT NULL
       AND p_id_banco_destino IS NOT NULL
       AND v_destino.id_banco IS DISTINCT FROM p_id_banco_destino THEN
      RETURN jsonb_build_object('error', 'La empresa y cuenta destino no pertenecen al banco seleccionado.');
    END IF;
  ELSE
    SELECT
      rc.ruta,
      rc.id_empresa,
      e.nombre AS nombre_empresa,
      rc.id_empresa_cuenta_bancaria,
      ecb.id_banco,
      b.nombre AS nombre_banco,
      ecb.comision_transf_banco_salida,
      ecb.comision_transf_inter_banco_salida,
      ecb.comision_itf_ingreso_salida
    INTO v_destino
    FROM public.tb_ruta_operacion_caja rc
    JOIN public.tb_empresa e ON e.id = rc.id_empresa
    JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = rc.id_empresa_cuenta_bancaria
    JOIN public.tb_banco b ON b.id = ecb.id_banco
    WHERE rc.id_estado = 1
      AND e.id_estado = 1
      AND ecb.id_estado = 1
      AND rc.flag_caja_ingreso_principal = true
      AND ecb.id_banco = p_id_banco_destino
      AND LOWER(COALESCE(rc.ruta, '')) <> v_ruta_actual
      AND LOWER(COALESCE(rc.ruta, '')) <> 'safetypay'
    ORDER BY rc.id
    LIMIT 1
    FOR UPDATE OF rc;
  END IF;

  IF v_destino.ruta IS NULL THEN
    RETURN jsonb_build_object('error', 'El banco destino no tiene una cuenta principal activa configurada.');
  END IF;

  v_calc := public.f_get_tb_operacion_calculo_comision_banco_salida(
    COALESCE(v_op.monto_deposito_cliente, 0),
    COALESCE(v_destino.comision_transf_banco_salida, 0),
    COALESCE(v_destino.comision_transf_inter_banco_salida, 0),
    COALESCE(v_destino.comision_itf_ingreso_salida, 0),
    p_id_empresa_salida := v_destino.id_empresa,
    p_id_empresa_cuenta_salida := v_destino.id_empresa_cuenta_bancaria,
    p_id_banco_empresa_cuenta_salida := v_destino.id_banco,
    p_id_banco_cliente_transferencia := v_op.id_banco_cliente
  );

  UPDATE public.tb_operacion_proceso
  SET ruta_destino = v_destino.ruta,
      id_empresa_salida = v_destino.id_empresa,
      nombre_empresa_salida = v_destino.nombre_empresa,
      id_empresa_cuenta_salida = v_destino.id_empresa_cuenta_bancaria,
      id_banco_empresa_cuenta_salida = v_destino.id_banco,
      nombre_banco_empresa_cuenta_salida = v_destino.nombre_banco,
      id_banco_cliente_transferencia = v_destino.id_banco,
      nombre_banco_cliente_transferencia = v_destino.nombre_banco,
      comision_transf_banco_salida = COALESCE(v_destino.comision_transf_banco_salida, 0),
      comision_transf_inter_banco_salida = COALESCE(v_destino.comision_transf_inter_banco_salida, 0),
      monto_itf_salida = COALESCE(v_destino.comision_itf_ingreso_salida, 0),
      resultado_comision_banco_salida = (v_calc->>'resultado_comision_banco_salida')::numeric,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = v_op.id;

  IF v_op.id_operacion_padre IS NOT NULL THEN
    UPDATE public.tb_operacion_proceso
    SET ruta_destino = v_destino.ruta,
        id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
        nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
    WHERE id = v_op.id_operacion_padre;
  END IF;

  IF v_ruta_actual <> LOWER(v_destino.ruta) THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_actual, COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario));
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_destino.ruta, COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario));
  END IF;

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_proceso(p_id := v_op.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'f_get_tb_pago_deuda',
    'f_get_tb_pago_deuda_kpi',
    'f_get_tb_pago_deuda_bandeja'
  )
ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid);
