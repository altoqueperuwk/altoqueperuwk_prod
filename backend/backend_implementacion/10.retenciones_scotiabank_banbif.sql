-- ============================================================================
-- RETENCIONES SCOTIABANK / BANBIF / SAFETYPAY
-- ============================================================================
--
-- Objetivo:
--   Separar las consultas operativas de retenciones de las consultas generales.
--   Estas funciones solo aplican a las rutas scotiabank, banbif y safetypay.

/*
Funcion: f_get_tb_operacion_retencion_bandeja
Objetivo:
  Consultar bandejas operativas para bancos con retencion sin mezclar reglas
  de GET generico, cierre historico y movimientos contables.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_retencion_bandeja(
  p_tab character varying,
  p_ruta character varying,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_filtro_estado character varying DEFAULT NULL,
  p_codigo_operacion character varying DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_fecha_deposito_desde timestamp with time zone DEFAULT NULL,
  p_fecha_deposito_hasta timestamp with time zone DEFAULT NULL,
  p_fecha_caja_cierre_desde timestamp with time zone DEFAULT NULL,
  p_fecha_caja_cierre_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH args AS (
    SELECT
      LOWER(BTRIM(COALESCE(p_ruta, ''))) AS ruta,
      UPPER(BTRIM(COALESCE(p_tab, ''))) AS tab,
      UPPER(BTRIM(COALESCE(p_filtro_estado, 'TODOS'))) AS filtro_estado
  ),
  base AS (
    SELECT op.*
    FROM public.tb_operacion_proceso op
    CROSS JOIN args a
    WHERE a.ruta IN ('scotiabank', 'banbif', 'safetypay')
      AND LOWER(COALESCE(op.ruta_destino, '')) = a.ruta
      AND (p_codigo_operacion IS NULL OR COALESCE(op.codigo_operacion_deposito_cliente, '') ILIKE '%' || p_codigo_operacion || '%')
      AND (p_dni_cliente IS NULL OR COALESCE(op.dni_cliente, '') ILIKE '%' || p_dni_cliente || '%')
      AND (p_fecha_deposito_desde IS NULL OR op.fecha_deposito_cliente >= p_fecha_deposito_desde)
      AND (p_fecha_deposito_hasta IS NULL OR op.fecha_deposito_cliente <= p_fecha_deposito_hasta)
      AND (
        (
          p_fecha_caja_cierre_desde IS NULL
          AND p_fecha_caja_cierre_hasta IS NULL
          AND (
            op.id_caja_cierre IS NULL
            OR (a.tab = 'RETENIDOS' AND COALESCE(op.flag_retenido, false) = true)
          )
        )
        OR (
          a.tab <> 'RETENIDOS'
          AND (p_fecha_caja_cierre_desde IS NOT NULL OR p_fecha_caja_cierre_hasta IS NOT NULL)
          AND op.id_caja_cierre IS NOT NULL
          AND (p_fecha_caja_cierre_desde IS NULL OR op.fecha_caja_cierre >= p_fecha_caja_cierre_desde)
          AND (p_fecha_caja_cierre_hasta IS NULL OR op.fecha_caja_cierre <= p_fecha_caja_cierre_hasta)
        )
      )
  )
  SELECT to_jsonb(b)
  FROM base b
  CROSS JOIN args a
  WHERE (
      a.tab = 'EFECTIVIZACION'
      AND UPPER(COALESCE(b.tipo_servicio, '')) = 'EFECTIVIZACION'
      AND COALESCE(b.flag_derivado, false) = false
      AND (p_id_empresa IS NULL OR b.id_empresa_salida = p_id_empresa)
      AND (p_id_empresa_cuenta_bancaria IS NULL OR b.id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      AND (
        a.filtro_estado = 'TODOS'
        OR UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) = a.filtro_estado
      )
    )
    OR (
      a.tab = 'RETENIDOS'
      AND COALESCE(b.flag_retenido, false) = true
      AND p_fecha_caja_cierre_desde IS NULL
      AND p_fecha_caja_cierre_hasta IS NULL
      AND (p_id_empresa IS NULL OR b.id_empresa_ingreso = p_id_empresa)
      AND (p_id_empresa_cuenta_bancaria IS NULL OR b.id_empresa_cuenta_ingreso = p_id_empresa_cuenta_bancaria)
    )
    OR (
      a.tab = 'PAGO DEUDA'
      AND UPPER(COALESCE(b.tipo_servicio, '')) = 'PAGO DEUDA'
      AND COALESCE(b.flag_retenido, false) = false
      AND (p_id_empresa IS NULL OR b.id_empresa_salida = p_id_empresa)
      AND (p_id_empresa_cuenta_bancaria IS NULL OR b.id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      AND (
        a.filtro_estado = 'TODOS'
        OR UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) = a.filtro_estado
      )
    )
    OR (
      a.tab = 'DERIVADOS'
      AND COALESCE(b.flag_derivado, false) = true
      AND COALESCE(b.flag_retenido, false) = false
      AND (p_id_empresa IS NULL OR b.id_empresa_salida = p_id_empresa)
      AND (p_id_empresa_cuenta_bancaria IS NULL OR b.id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      AND (
        a.filtro_estado = 'TODOS'
        OR UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) = a.filtro_estado
      )
    )
    OR (
      a.tab = 'POS'
      AND LOWER(COALESCE(b.ruta_origen, '')) = 'pos'
      AND COALESCE(b.flag_retenido, false) = false
      AND (p_id_empresa_cuenta_bancaria IS NULL OR b.id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      AND (
        a.filtro_estado = 'TODOS'
        OR UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) = a.filtro_estado
      )
    )
  ORDER BY b.id DESC;
$$;

/*
Funcion: f_get_tb_operacion_retencion_bandeja_badges
Objetivo:
  Contar tabs operativos para rutas con retencion, manteniendo retenidos como
  flujo paralelo al estado comercial.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_retencion_bandeja_badges(
  p_ruta character varying,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_fecha_caja_cierre_desde timestamp with time zone DEFAULT NULL,
  p_fecha_caja_cierre_hasta timestamp with time zone DEFAULT NULL
)
RETURNS TABLE (
  tab character varying,
  cantidad integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH args AS (
    SELECT LOWER(BTRIM(COALESCE(p_ruta, ''))) AS ruta
  ),
  base AS (
    SELECT op.*
    FROM public.tb_operacion_proceso op
    CROSS JOIN args a
    WHERE a.ruta IN ('scotiabank', 'banbif', 'safetypay')
      AND LOWER(COALESCE(op.ruta_destino, '')) = a.ruta
      AND (
        (
          p_fecha_caja_cierre_desde IS NULL
          AND p_fecha_caja_cierre_hasta IS NULL
          AND (
            op.id_caja_cierre IS NULL
            OR COALESCE(op.flag_retenido, false) = true
          )
        )
        OR (
          (p_fecha_caja_cierre_desde IS NOT NULL OR p_fecha_caja_cierre_hasta IS NOT NULL)
          AND op.id_caja_cierre IS NOT NULL
          AND (p_fecha_caja_cierre_desde IS NULL OR op.fecha_caja_cierre >= p_fecha_caja_cierre_desde)
          AND (p_fecha_caja_cierre_hasta IS NULL OR op.fecha_caja_cierre <= p_fecha_caja_cierre_hasta)
        )
      )
  ),
  conteos AS (
    SELECT
      COUNT(*) FILTER (
        WHERE UPPER(COALESCE(tipo_servicio, '')) = 'EFECTIVIZACION'
          AND COALESCE(flag_derivado, false) = false
          AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO', 'RECHAZADO', 'PAGADO')
          AND (p_id_empresa IS NULL OR id_empresa_salida = p_id_empresa)
          AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      )::integer AS efectivizacion,
      COUNT(*) FILTER (
        WHERE UPPER(COALESCE(tipo_servicio, '')) = 'PAGO DEUDA'
          AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
          AND COALESCE(flag_retenido, false) = false
          AND (p_id_empresa IS NULL OR id_empresa_salida = p_id_empresa)
          AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      )::integer AS pago_deuda,
      COUNT(*) FILTER (
        WHERE COALESCE(flag_derivado, false) = true
          AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
          AND COALESCE(flag_retenido, false) = false
          AND (p_id_empresa IS NULL OR id_empresa_salida = p_id_empresa)
          AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      )::integer AS derivados,
      COUNT(*) FILTER (
        WHERE LOWER(COALESCE(ruta_origen, '')) = 'pos'
          AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
          AND COALESCE(flag_retenido, false) = false
          AND (p_id_empresa IS NULL OR COALESCE(id_empresa_salida, id_empresa_ingreso) = p_id_empresa)
          AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      )::integer AS pos,
      COUNT(*) FILTER (
        WHERE COALESCE(flag_retenido, false) = true
          AND p_fecha_caja_cierre_desde IS NULL
          AND p_fecha_caja_cierre_hasta IS NULL
          AND (p_id_empresa IS NULL OR id_empresa_ingreso = p_id_empresa)
          AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_ingreso = p_id_empresa_cuenta_bancaria)
      )::integer AS retenidos
    FROM base
  )
  SELECT 'Efectivizacion'::character varying, efectivizacion FROM conteos
  UNION ALL
  SELECT 'Pago Deuda'::character varying, pago_deuda FROM conteos
  UNION ALL
  SELECT 'Derivados'::character varying, derivados FROM conteos
  UNION ALL
  SELECT 'POS'::character varying, pos FROM conteos
  UNION ALL
  SELECT 'Retenidos'::character varying, retenidos FROM conteos;
$$;

/*
Funcion: f_get_tb_operacion_retencion_empresa_badges
Objetivo:
  Distribuir conteos de la bandeja activa por empresa para rutas con retencion.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_retencion_empresa_badges(
  p_ruta character varying,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_fecha_caja_cierre_desde timestamp with time zone DEFAULT NULL,
  p_fecha_caja_cierre_hasta timestamp with time zone DEFAULT NULL
)
RETURNS TABLE (
  tab character varying,
  id_empresa bigint,
  cantidad integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH args AS (
    SELECT LOWER(BTRIM(COALESCE(p_ruta, ''))) AS ruta
  ),
  base AS (
    SELECT op.*
    FROM public.tb_operacion_proceso op
    CROSS JOIN args a
    WHERE a.ruta IN ('scotiabank', 'banbif', 'safetypay')
      AND LOWER(COALESCE(op.ruta_destino, '')) = a.ruta
      AND (
        (
          p_fecha_caja_cierre_desde IS NULL
          AND p_fecha_caja_cierre_hasta IS NULL
          AND (
            op.id_caja_cierre IS NULL
            OR COALESCE(op.flag_retenido, false) = true
          )
        )
        OR (
          (p_fecha_caja_cierre_desde IS NOT NULL OR p_fecha_caja_cierre_hasta IS NOT NULL)
          AND op.id_caja_cierre IS NOT NULL
          AND (p_fecha_caja_cierre_desde IS NULL OR op.fecha_caja_cierre >= p_fecha_caja_cierre_desde)
          AND (p_fecha_caja_cierre_hasta IS NULL OR op.fecha_caja_cierre <= p_fecha_caja_cierre_hasta)
        )
      )
  ),
  empresa_rows AS (
    SELECT 'Efectivizacion'::character varying AS tab, id_empresa_salida AS id_empresa
    FROM base
    WHERE UPPER(COALESCE(tipo_servicio, '')) = 'EFECTIVIZACION'
      AND COALESCE(flag_derivado, false) = false
      AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO', 'RECHAZADO', 'PAGADO')
      AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      AND id_empresa_salida IS NOT NULL

    UNION ALL
    SELECT 'Pago Deuda'::character varying AS tab, id_empresa_salida AS id_empresa
    FROM base
    WHERE UPPER(COALESCE(tipo_servicio, '')) = 'PAGO DEUDA'
      AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
      AND COALESCE(flag_retenido, false) = false
      AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      AND id_empresa_salida IS NOT NULL

    UNION ALL
    SELECT 'Derivados'::character varying AS tab, id_empresa_salida AS id_empresa
    FROM base
    WHERE COALESCE(flag_derivado, false) = true
      AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
      AND COALESCE(flag_retenido, false) = false
      AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      AND id_empresa_salida IS NOT NULL

    UNION ALL
    SELECT 'POS'::character varying AS tab, COALESCE(id_empresa_salida, id_empresa_ingreso) AS id_empresa
    FROM base
    WHERE LOWER(COALESCE(ruta_origen, '')) = 'pos'
      AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
      AND COALESCE(flag_retenido, false) = false
      AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      AND COALESCE(id_empresa_salida, id_empresa_ingreso) IS NOT NULL

    UNION ALL
    SELECT 'Retenidos'::character varying AS tab, id_empresa_ingreso AS id_empresa
    FROM base
    WHERE COALESCE(flag_retenido, false) = true
      AND p_fecha_caja_cierre_desde IS NULL
      AND p_fecha_caja_cierre_hasta IS NULL
      AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_ingreso = p_id_empresa_cuenta_bancaria)
      AND id_empresa_ingreso IS NOT NULL
  )
  SELECT empresa_rows.tab, empresa_rows.id_empresa, COUNT(*)::integer AS cantidad
  FROM empresa_rows
  GROUP BY empresa_rows.tab, empresa_rows.id_empresa
  HAVING COUNT(*) > 0
  ORDER BY empresa_rows.tab, empresa_rows.id_empresa;
$$;

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_get_tb_operacion_retencion_bandeja',
  'f_get_tb_operacion_retencion_bandeja_badges',
  'f_get_tb_operacion_retencion_empresa_badges'
)
ORDER BY n.nspname, p.proname;
