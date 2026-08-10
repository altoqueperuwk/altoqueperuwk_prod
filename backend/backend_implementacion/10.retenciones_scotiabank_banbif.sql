-- ============================================================================
-- RETENCIONES BCP / SCOTIABANK / BANBIF / SAFETYPAY
-- ============================================================================
--
-- Objetivo:
--   Separar las consultas operativas de retenciones de las consultas generales.
--   Estas funciones solo aplican a las rutas bcp, scotiabank, banbif y safetypay.

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
    WHERE a.ruta IN ('bcp', 'scotiabank', 'banbif', 'safetypay')
      AND (a.tab = 'ELIMINADOS' OR COALESCE(op.id_estado, 0) <> 10)
      AND (
        (a.tab = 'EFECTIVIZACION' AND (
          LOWER(COALESCE(op.ruta_destino, '')) = a.ruta
          OR (COALESCE(op.flag_derivado, false) = true AND LOWER(COALESCE(op.ruta_origen, '')) = a.ruta)
        ))
        OR (a.tab <> 'EFECTIVIZACION' AND LOWER(COALESCE(op.ruta_destino, '')) = a.ruta)
      )
      AND (p_codigo_operacion IS NULL OR COALESCE(op.codigo_operacion_deposito_cliente, '') ILIKE '%' || p_codigo_operacion || '%')
      AND (p_dni_cliente IS NULL OR COALESCE(op.dni_cliente, '') ILIKE '%' || p_dni_cliente || '%')
      AND (p_fecha_deposito_desde IS NULL OR op.fecha_deposito_cliente >= p_fecha_deposito_desde)
      AND (p_fecha_deposito_hasta IS NULL OR op.fecha_deposito_cliente <= p_fecha_deposito_hasta)
      AND (
        (
          p_fecha_caja_cierre_desde IS NULL
          AND p_fecha_caja_cierre_hasta IS NULL
          AND (
            (
              a.tab = 'RETENIDOS'
              AND op.id_caja_cierre IS NULL
              AND COALESCE(op.flag_retenido, false) = true
            )
            OR (
              a.tab <> 'RETENIDOS'
              AND op.id_caja_cierre IS NULL
              AND NOT (
                COALESCE(op.flag_retenido, false) = true
                AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
              )
            )
          )
        )
        OR (
          a.tab <> 'RETENIDOS'
          AND (p_fecha_caja_cierre_desde IS NOT NULL OR p_fecha_caja_cierre_hasta IS NOT NULL)
          AND (
            (
              op.id_caja_cierre IS NOT NULL
              AND (p_fecha_caja_cierre_desde IS NULL OR op.fecha_caja_cierre >= p_fecha_caja_cierre_desde)
              AND (p_fecha_caja_cierre_hasta IS NULL OR op.fecha_caja_cierre <= p_fecha_caja_cierre_hasta)
            )
            OR (
              COALESCE(op.flag_retenido, false) = true
              AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
              AND EXISTS (
                SELECT 1
                FROM public.tb_caja_operativa_cierre ch
                JOIN public.tb_ruta_operacion_caja rc
                  ON rc.id_empresa = ch.id_empresa
                 AND rc.id_empresa_cuenta_bancaria = ch.id_empresa_cuenta_bancaria
                 AND LOWER(BTRIM(COALESCE(rc.ruta, ''))) = a.ruta
                WHERE (p_fecha_caja_cierre_desde IS NULL OR ch.fecha_cierre >= p_fecha_caja_cierre_desde)
                  AND (p_fecha_caja_cierre_hasta IS NULL OR ch.fecha_cierre <= p_fecha_caja_cierre_hasta)
                  AND (
                    (
                      ch.id_empresa = op.id_empresa_salida
                      AND ch.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_salida
                    )
                    OR (
                      ch.id_empresa = op.id_empresa_ingreso
                      AND ch.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_ingreso
                    )
                  )
                  AND (
                    ch.fecha_apertura IS NULL
                    OR COALESCE(op.fecha_pagado, op.fecha_registro) >= ch.fecha_apertura
                  )
                  AND COALESCE(op.fecha_pagado, op.fecha_registro) <= ch.fecha_cierre
              )
            )
          )
        )
      )
  )
  SELECT to_jsonb(b)
  FROM base b
  CROSS JOIN args a
  WHERE (
      a.tab = 'EFECTIVIZACION'
      AND UPPER(COALESCE(b.tipo_servicio, '')) = 'EFECTIVIZACION'
      AND (
        (
          COALESCE(b.flag_derivado, false) = false
          AND (p_id_empresa IS NULL OR b.id_empresa_salida = p_id_empresa)
          AND (p_id_empresa_cuenta_bancaria IS NULL OR b.id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
        )
        OR (
          COALESCE(b.flag_derivado, false) = true
          AND LOWER(COALESCE(b.ruta_origen, '')) = a.ruta
          AND (p_id_empresa IS NULL OR COALESCE(b.id_empresa_salida_origen, b.id_empresa_salida) = p_id_empresa)
          AND (p_id_empresa_cuenta_bancaria IS NULL OR COALESCE(b.id_empresa_cuenta_salida_origen, b.id_empresa_cuenta_salida) = p_id_empresa_cuenta_bancaria)
        )
      )
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
      AND (p_id_empresa_cuenta_bancaria IS NULL OR b.id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      AND (
        a.filtro_estado = 'TODOS'
        OR UPPER(BTRIM(COALESCE(b.nombre_estado, ''))) = a.filtro_estado
      )
    )
    OR (
      a.tab = 'ELIMINADOS'
      AND b.id_estado = 10
      AND UPPER(COALESCE(b.tipo_servicio, '')) = 'EFECTIVIZACION'
      AND (p_id_empresa IS NULL OR b.id_empresa_salida = p_id_empresa)
      AND (p_id_empresa_cuenta_bancaria IS NULL OR b.id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
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
    WHERE a.ruta IN ('bcp', 'scotiabank', 'banbif', 'safetypay')
      AND LOWER(COALESCE(op.ruta_destino, '')) = a.ruta
      AND COALESCE(op.id_estado, 0) <> 10
      AND (
        p_fecha_caja_cierre_desde IS NOT NULL
        OR p_fecha_caja_cierre_hasta IS NOT NULL
            OR COALESCE(op.flag_retenido, false) = true
        OR (
          COALESCE(op.flag_retenido, false) = false
          AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) NOT IN ('PAGADO', 'ELIMINADO')
        )
      )
      AND (
        (
          p_fecha_caja_cierre_desde IS NULL
          AND p_fecha_caja_cierre_hasta IS NULL
          AND op.id_caja_cierre IS NULL
        )
        OR (
          (p_fecha_caja_cierre_desde IS NOT NULL OR p_fecha_caja_cierre_hasta IS NOT NULL)
          AND (
            (
              op.id_caja_cierre IS NOT NULL
              AND (p_fecha_caja_cierre_desde IS NULL OR op.fecha_caja_cierre >= p_fecha_caja_cierre_desde)
              AND (p_fecha_caja_cierre_hasta IS NULL OR op.fecha_caja_cierre <= p_fecha_caja_cierre_hasta)
            )
            OR (
              COALESCE(op.flag_retenido, false) = true
              AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
              AND EXISTS (
                SELECT 1
                FROM public.tb_caja_operativa_cierre ch
                JOIN public.tb_ruta_operacion_caja rc
                  ON rc.id_empresa = ch.id_empresa
                 AND rc.id_empresa_cuenta_bancaria = ch.id_empresa_cuenta_bancaria
                 AND LOWER(BTRIM(COALESCE(rc.ruta, ''))) = a.ruta
                WHERE (p_fecha_caja_cierre_desde IS NULL OR ch.fecha_cierre >= p_fecha_caja_cierre_desde)
                  AND (p_fecha_caja_cierre_hasta IS NULL OR ch.fecha_cierre <= p_fecha_caja_cierre_hasta)
                  AND (
                    (
                      ch.id_empresa = op.id_empresa_salida
                      AND ch.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_salida
                    )
                    OR (
                      ch.id_empresa = op.id_empresa_ingreso
                      AND ch.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_ingreso
                    )
                  )
                  AND (
                    ch.fecha_apertura IS NULL
                    OR COALESCE(op.fecha_pagado, op.fecha_registro) >= ch.fecha_apertura
                  )
                  AND COALESCE(op.fecha_pagado, op.fecha_registro) <= ch.fecha_cierre
              )
            )
          )
        )
      )
  ),
  conteos AS (
    SELECT
      COUNT(*) FILTER (
        WHERE UPPER(COALESCE(tipo_servicio, '')) = 'EFECTIVIZACION'
          AND COALESCE(flag_derivado, false) = false
          AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO', 'RECHAZADO')
          AND (p_id_empresa IS NULL OR id_empresa_salida = p_id_empresa)
          AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      )::integer AS efectivizacion,
      COUNT(*) FILTER (
        WHERE UPPER(COALESCE(tipo_servicio, '')) = 'PAGO DEUDA'
          AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
          AND (p_id_empresa IS NULL OR id_empresa_salida = p_id_empresa)
          AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      )::integer AS pago_deuda,
      COUNT(*) FILTER (
        WHERE COALESCE(flag_derivado, false) = true
          AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
          AND (p_id_empresa IS NULL OR id_empresa_salida = p_id_empresa)
          AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      )::integer AS derivados,
      COUNT(*) FILTER (
        WHERE LOWER(COALESCE(ruta_origen, '')) = 'pos'
          AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
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
    WHERE a.ruta IN ('bcp', 'scotiabank', 'banbif', 'safetypay')
      AND LOWER(COALESCE(op.ruta_destino, '')) = a.ruta
      AND COALESCE(op.id_estado, 0) <> 10
      AND (
        p_fecha_caja_cierre_desde IS NOT NULL
        OR p_fecha_caja_cierre_hasta IS NOT NULL
        OR COALESCE(op.flag_retenido, false) = true
        OR (
          COALESCE(op.flag_retenido, false) = false
          AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) NOT IN ('PAGADO', 'ELIMINADO')
        )
      )
      AND (
        (
          p_fecha_caja_cierre_desde IS NULL
          AND p_fecha_caja_cierre_hasta IS NULL
          AND op.id_caja_cierre IS NULL
        )
        OR (
          (p_fecha_caja_cierre_desde IS NOT NULL OR p_fecha_caja_cierre_hasta IS NOT NULL)
          AND (
            (
              op.id_caja_cierre IS NOT NULL
              AND (p_fecha_caja_cierre_desde IS NULL OR op.fecha_caja_cierre >= p_fecha_caja_cierre_desde)
              AND (p_fecha_caja_cierre_hasta IS NULL OR op.fecha_caja_cierre <= p_fecha_caja_cierre_hasta)
            )
            OR (
              COALESCE(op.flag_retenido, false) = true
              AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
              AND EXISTS (
                SELECT 1
                FROM public.tb_caja_operativa_cierre ch
                JOIN public.tb_ruta_operacion_caja rc
                  ON rc.id_empresa = ch.id_empresa
                 AND rc.id_empresa_cuenta_bancaria = ch.id_empresa_cuenta_bancaria
                 AND LOWER(BTRIM(COALESCE(rc.ruta, ''))) = a.ruta
                WHERE (p_fecha_caja_cierre_desde IS NULL OR ch.fecha_cierre >= p_fecha_caja_cierre_desde)
                  AND (p_fecha_caja_cierre_hasta IS NULL OR ch.fecha_cierre <= p_fecha_caja_cierre_hasta)
                  AND (
                    (
                      ch.id_empresa = op.id_empresa_salida
                      AND ch.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_salida
                    )
                    OR (
                      ch.id_empresa = op.id_empresa_ingreso
                      AND ch.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_ingreso
                    )
                  )
                  AND (
                    ch.fecha_apertura IS NULL
                    OR COALESCE(op.fecha_pagado, op.fecha_registro) >= ch.fecha_apertura
                  )
                  AND COALESCE(op.fecha_pagado, op.fecha_registro) <= ch.fecha_cierre
              )
            )
          )
        )
      )
  ),
  empresa_rows AS (
    SELECT 'Efectivizacion'::character varying AS tab, id_empresa_salida AS id_empresa
    FROM base
    WHERE UPPER(COALESCE(tipo_servicio, '')) = 'EFECTIVIZACION'
      AND COALESCE(flag_derivado, false) = false
      AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO', 'RECHAZADO')
      AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      AND id_empresa_salida IS NOT NULL

    UNION ALL
    SELECT 'Pago Deuda'::character varying AS tab, id_empresa_salida AS id_empresa
    FROM base
    WHERE UPPER(COALESCE(tipo_servicio, '')) = 'PAGO DEUDA'
      AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
      AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      AND id_empresa_salida IS NOT NULL

    UNION ALL
    SELECT 'Derivados'::character varying AS tab, id_empresa_salida AS id_empresa
    FROM base
    WHERE COALESCE(flag_derivado, false) = true
      AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
      AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      AND id_empresa_salida IS NOT NULL

    UNION ALL
    SELECT 'POS'::character varying AS tab, COALESCE(id_empresa_salida, id_empresa_ingreso) AS id_empresa
    FROM base
    WHERE LOWER(COALESCE(ruta_origen, '')) = 'pos'
      AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
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
