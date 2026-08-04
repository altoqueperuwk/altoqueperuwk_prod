/*
  Reportes globales de cierre de caja.
  Este archivo no modifica las RPC operativas existentes. Expone únicamente el
  catálogo necesario para seleccionar cuentas/cierres y reutilizar el reporte
  completo mediante f_get_reporte_cierre.
*/

CREATE OR REPLACE FUNCTION public.f_get_tb_reporte_cierre_caja_fechas()
RETURNS TABLE (
  fecha_cierre date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    (ch.fecha_cierre AT TIME ZONE 'America/Lima')::date AS fecha_cierre
  FROM public.tb_caja_operativa_cierre ch
  JOIN public.tb_empresa e
    ON e.id = ch.id_empresa
   AND e.id_estado = 1
  JOIN public.tb_empresa_cuenta_bancaria ecb
    ON ecb.id = ch.id_empresa_cuenta_bancaria
   AND ecb.id_estado = 1
  WHERE ch.fecha_cierre IS NOT NULL
  ORDER BY fecha_cierre DESC;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_reporte_cierre_caja_bandeja(
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_fecha_cierre date DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  id_empresa bigint,
  nombre_empresa character varying,
  id_empresa_cuenta_bancaria bigint,
  id_banco bigint,
  nombre_banco character varying,
  id_caja bigint,
  id_caja_cierre bigint,
  fecha_cierre timestamp with time zone,
  tiene_cierre boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ecb.id AS id,
    e.id AS id_empresa,
    e.nombre AS nombre_empresa,
    ecb.id AS id_empresa_cuenta_bancaria,
    ecb.id_banco,
    b.nombre AS nombre_banco,
    COALESCE(caja.id, cierre.id_caja) AS id_caja,
    cierre.id AS id_caja_cierre,
    cierre.fecha_cierre,
    CASE
      WHEN p_fecha_cierre IS NULL THEN caja.id IS NOT NULL
      ELSE cierre.id IS NOT NULL
    END AS tiene_cierre
  FROM public.tb_empresa_cuenta_bancaria ecb
  JOIN public.tb_empresa e
    ON e.id = ecb.id_empresa
   AND e.id_estado = 1
  JOIN public.tb_banco b
    ON b.id = ecb.id_banco
  LEFT JOIN LATERAL (
    SELECT c.id
    FROM public.tb_caja_operativa c
    WHERE c.id_empresa = ecb.id_empresa
      AND c.id_empresa_cuenta_bancaria = ecb.id
      AND c.id_estado = 1
    ORDER BY c.id DESC
    LIMIT 1
  ) caja ON true
  LEFT JOIN LATERAL (
    SELECT ch.id, ch.id_caja, ch.fecha_cierre
    FROM public.tb_caja_operativa_cierre ch
    WHERE ch.id_empresa = ecb.id_empresa
      AND ch.id_empresa_cuenta_bancaria = ecb.id
      AND p_fecha_cierre IS NOT NULL
      AND (ch.fecha_cierre AT TIME ZONE 'America/Lima')::date = p_fecha_cierre
    ORDER BY ch.fecha_cierre DESC, ch.id DESC
    LIMIT 1
  ) cierre ON true
  WHERE ecb.id_estado = 1
    AND (p_id_empresa IS NULL OR ecb.id_empresa = p_id_empresa)
    AND (p_id_empresa_cuenta_bancaria IS NULL OR ecb.id = p_id_empresa_cuenta_bancaria)
  ORDER BY e.nombre, b.nombre, ecb.id;
$$;

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
    'f_get_tb_reporte_cierre_caja_fechas',
    'f_get_tb_reporte_cierre_caja_bandeja'
)
ORDER BY n.nspname, p.proname;
