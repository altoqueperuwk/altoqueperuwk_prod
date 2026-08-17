-- ============================================================================
-- 14. TB_RUTA_OPERACION_CAJA
-- ============================================================================

/*
Tabla: tb_ruta_operacion_caja
Objetivo:
  Definir quÃ© empresa y quÃ© cuenta bancaria estÃ¡n habilitadas para operar en una
  ruta especÃ­fica de Operaciones. Esta tabla representa el contexto runtime de
  empresas/cuentas permitidas por ruta para el frontend nuevo.
*/
CREATE TABLE IF NOT EXISTS public.tb_ruta_operacion_caja (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  ruta character varying NOT NULL,
  id_empresa bigint NOT NULL,
  id_empresa_cuenta_bancaria bigint NOT NULL,
  flag_caja_ingreso_principal boolean NOT NULL DEFAULT false,
  id_estado bigint NOT NULL DEFAULT 1,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_ruta_operacion_caja_pkey PRIMARY KEY (id),
  CONSTRAINT tb_ruta_operacion_caja_fk_empresa FOREIGN KEY (id_empresa) REFERENCES public.tb_empresa(id),
  CONSTRAINT tb_ruta_operacion_caja_fk_empresa_cuenta FOREIGN KEY (id_empresa_cuenta_bancaria) REFERENCES public.tb_empresa_cuenta_bancaria(id),
  CONSTRAINT tb_ruta_operacion_caja_fk_estado FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_ruta_operacion_caja_fk_usuario FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tb_ruta_operacion_caja'
      AND column_name = 'flag_caja_ingreso_principal'
  ) THEN
    ALTER TABLE public.tb_ruta_operacion_caja
    ADD COLUMN flag_caja_ingreso_principal boolean NOT NULL DEFAULT false;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tb_ruta_operacion_caja_ingreso_principal
  ON public.tb_ruta_operacion_caja (ruta)
  WHERE flag_caja_ingreso_principal = true
    AND id_estado = 1;

/*
Funcion: f_get_tb_ruta_operacion_caja
Objetivo:
  Consultar la configuracion operativa de empresas/cuentas habilitadas por ruta,
  indicando ademas si una de ellas es la caja primaria de ingreso.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_ruta_operacion_caja(
  p_id bigint DEFAULT NULL,
  p_ruta character varying DEFAULT NULL,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_flag_caja_ingreso_principal boolean DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  ruta character varying,
  id_empresa bigint,
  nombre_empresa character varying,
  id_empresa_cuenta_bancaria bigint,
  id_banco bigint,
  nombre_banco character varying,
  id_caja bigint,
  flag_caja_ingreso_principal boolean,
  id_estado bigint,
  nombre_estado character varying,
  id_usuario bigint,
  nombre_usuario character varying,
  fecha_registro timestamp with time zone,
  flag_retencion_cuenta boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.id,
    rc.ruta,
    rc.id_empresa,
    e.nombre AS nombre_empresa,
    rc.id_empresa_cuenta_bancaria,
    ecb.id_banco,
    b.nombre AS nombre_banco,
    c.id AS id_caja,
    rc.flag_caja_ingreso_principal,
    rc.id_estado,
    est.nombre AS nombre_estado,
    rc.id_usuario,
    u.nombre AS nombre_usuario,
    rc.fecha_registro,
    CASE
      WHEN to_regprocedure('public.f_get_tb_recaudacion_cuenta_flag_retenida(character varying,bigint)') IS NOT NULL
        THEN public.f_get_tb_recaudacion_cuenta_flag_retenida(rc.ruta, rc.id_empresa_cuenta_bancaria)
      ELSE false
    END AS flag_retencion_cuenta
  FROM public.tb_ruta_operacion_caja rc
  JOIN public.tb_empresa e ON e.id = rc.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = rc.id_empresa_cuenta_bancaria
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  JOIN public.tb_estado est ON est.id = rc.id_estado
  LEFT JOIN public.tb_usuario u ON u.id = rc.id_usuario
  LEFT JOIN public.tb_caja_operativa c
    ON c.id_empresa = rc.id_empresa
   AND c.id_empresa_cuenta_bancaria = rc.id_empresa_cuenta_bancaria
  WHERE (p_id IS NULL OR rc.id = p_id)
    AND (p_ruta IS NULL OR rc.ruta = p_ruta)
    AND (p_id_empresa IS NULL OR rc.id_empresa = p_id_empresa)
    AND (p_id_empresa_cuenta_bancaria IS NULL OR rc.id_empresa_cuenta_bancaria = p_id_empresa_cuenta_bancaria)
    AND (p_flag_caja_ingreso_principal IS NULL OR rc.flag_caja_ingreso_principal = p_flag_caja_ingreso_principal)
    AND (p_id_estado IS NULL OR rc.id_estado = p_id_estado)
  ORDER BY rc.ruta, rc.flag_caja_ingreso_principal DESC, e.nombre, b.nombre, rc.id;
END;
$$;

/*
Funcion: f_get_tb_ruta_operacion_caja_ingreso_principal
Objetivo:
  Resolver la caja primaria de ingreso de una ruta bancaria. Esta funcion es la
  fuente de verdad para congelar el contexto de ingreso de una operacion.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_ruta_operacion_caja_ingreso_principal(
  p_ruta character varying
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT to_jsonb(x)
  INTO v_result
  FROM public.f_get_tb_ruta_operacion_caja(
    p_ruta := p_ruta,
    p_flag_caja_ingreso_principal := true,
    p_id_estado := 1
  ) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_sync_tb_ruta_operacion_caja_principal
Objetivo:
  Asegurar que cada ruta tenga una sola caja principal activa. Si no existe una
  principal activa, promueve la primera asociacion activa de la ruta.
*/
CREATE OR REPLACE FUNCTION public.f_sync_tb_ruta_operacion_caja_principal(
  p_ruta character varying,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_principal_id bigint;
  v_promoted_id bigint;
BEGIN
  IF COALESCE(p_ruta, '') = '' THEN
    RETURN jsonb_build_object('error', 'La ruta es obligatoria.');
  END IF;

  SELECT rc.id
  INTO v_principal_id
  FROM public.tb_ruta_operacion_caja rc
  WHERE rc.ruta = p_ruta
    AND rc.id_estado = 1
    AND rc.flag_caja_ingreso_principal = true
  ORDER BY rc.id
  LIMIT 1;

  IF v_principal_id IS NOT NULL THEN
    UPDATE public.tb_ruta_operacion_caja
    SET flag_caja_ingreso_principal = false,
        id_usuario = COALESCE(p_id_usuario, id_usuario)
    WHERE ruta = p_ruta
      AND id_estado = 1
      AND flag_caja_ingreso_principal = true
      AND id <> v_principal_id;

    RETURN jsonb_build_object('id_principal', v_principal_id);
  END IF;

  SELECT rc.id
  INTO v_promoted_id
  FROM public.tb_ruta_operacion_caja rc
  WHERE rc.ruta = p_ruta
    AND rc.id_estado = 1
  ORDER BY rc.id
  LIMIT 1;

  IF v_promoted_id IS NOT NULL THEN
    UPDATE public.tb_ruta_operacion_caja
    SET flag_caja_ingreso_principal = true,
        id_usuario = COALESCE(p_id_usuario, id_usuario)
    WHERE id = v_promoted_id;
  END IF;

  RETURN jsonb_build_object('id_principal', v_promoted_id);
END;
$$;

/*
Funcion: f_patch_tb_ruta_operacion_caja_principal
Objetivo:
  Cambiar de forma atomica la empresa principal de una ruta, evitando que dos
  asociaciones activas queden marcadas como principales durante el cambio.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_ruta_operacion_caja_principal(
  p_id_ruta_operacion_caja bigint,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target public.tb_ruta_operacion_caja%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT rc.*
  INTO v_target
  FROM public.tb_ruta_operacion_caja rc
  WHERE rc.id = p_id_ruta_operacion_caja
  FOR UPDATE;

  IF v_target.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La asociacion de ruta no existe.');
  END IF;

  IF v_target.id_estado <> 1 THEN
    RETURN jsonb_build_object('error', 'La asociacion de ruta no esta activa.');
  END IF;

  -- Todas las filas se bloquean en orden estable para evitar carreras entre
  -- dos cambios simultaneos sobre la misma ruta.
  PERFORM 1
  FROM public.tb_ruta_operacion_caja rc
  WHERE rc.ruta = v_target.ruta
    AND rc.id_estado = 1
  ORDER BY rc.id
  FOR UPDATE;

  UPDATE public.tb_ruta_operacion_caja rc
  SET flag_caja_ingreso_principal = false
  WHERE rc.ruta = v_target.ruta
    AND rc.id_estado = 1;

  UPDATE public.tb_ruta_operacion_caja rc
  SET flag_caja_ingreso_principal = true,
      id_usuario = COALESCE(p_id_usuario, rc.id_usuario)
  WHERE rc.id = v_target.id;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(
    v_target.ruta,
    COALESCE(p_id_usuario, v_target.id_usuario)
  );

  SELECT to_jsonb(x)
  INTO v_result
  FROM public.f_get_tb_ruta_operacion_caja(p_id := v_target.id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_post_tb_ruta_operacion_caja
Objetivo:
  Asociar una caja operativa base a una ruta de Operaciones para bootstrap
  tecnico-administrativo desde Sistema. La caja se resuelve por empresa + cuenta
  bancaria, y se protege que solo exista una caja principal activa por ruta.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_ruta_operacion_caja(
  p_ruta character varying,
  p_id_empresa bigint,
  p_id_empresa_cuenta_bancaria bigint,
  p_flag_caja_ingreso_principal boolean DEFAULT false,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cuenta record;
  v_caja record;
  v_estado_final bigint;
  v_principal_final boolean;
  v_new_id bigint;
  v_result jsonb;
BEGIN
  IF COALESCE(p_ruta, '') = '' THEN
    RETURN jsonb_build_object('error', 'La ruta es obligatoria.');
  END IF;

  SELECT ecb.id, ecb.id_empresa
  INTO v_cuenta
  FROM public.tb_empresa_cuenta_bancaria ecb
  WHERE ecb.id = p_id_empresa_cuenta_bancaria
  LIMIT 1;

  IF v_cuenta.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La cuenta bancaria no existe.');
  END IF;

  IF v_cuenta.id_empresa <> p_id_empresa THEN
    RETURN jsonb_build_object('error', 'La cuenta bancaria no pertenece a la empresa seleccionada.');
  END IF;

  SELECT c.id, c.id_estado
  INTO v_caja
  FROM public.tb_caja_operativa c
  WHERE c.id_empresa = p_id_empresa
    AND c.id_empresa_cuenta_bancaria = p_id_empresa_cuenta_bancaria
  LIMIT 1;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Primero debe crear la caja operativa para esa empresa y cuenta bancaria.');
  END IF;

  v_estado_final := COALESCE(p_id_estado, 1);
  v_principal_final := COALESCE(p_flag_caja_ingreso_principal, false);

  IF EXISTS (
    SELECT 1
    FROM public.tb_ruta_operacion_caja rc
    WHERE rc.ruta = p_ruta
      AND rc.id_empresa = p_id_empresa
      AND rc.id_empresa_cuenta_bancaria = p_id_empresa_cuenta_bancaria
  ) THEN
    RETURN jsonb_build_object('error', 'La caja ya esta asociada a esa ruta.');
  END IF;

  IF COALESCE(p_flag_caja_ingreso_principal, false) = true
     AND v_estado_final = 1
     AND EXISTS (
       SELECT 1
       FROM public.tb_ruta_operacion_caja rc
       WHERE rc.ruta = p_ruta
         AND rc.flag_caja_ingreso_principal = true
         AND rc.id_estado = 1
     ) THEN
    RETURN jsonb_build_object('error', 'Ya existe una caja de ingreso principal activa para esta ruta.');
  END IF;

  IF v_estado_final = 1
     AND v_principal_final = false
     AND NOT EXISTS (
       SELECT 1
       FROM public.tb_ruta_operacion_caja rc
       WHERE rc.ruta = p_ruta
         AND rc.flag_caja_ingreso_principal = true
         AND rc.id_estado = 1
     ) THEN
    v_principal_final := true;
  END IF;

  INSERT INTO public.tb_ruta_operacion_caja (
    ruta,
    id_empresa,
    id_empresa_cuenta_bancaria,
    flag_caja_ingreso_principal,
    id_estado,
    id_usuario
  )
  VALUES (
    p_ruta,
    p_id_empresa,
    p_id_empresa_cuenta_bancaria,
    v_principal_final,
    v_estado_final,
    p_id_usuario
  )
  RETURNING id INTO v_new_id;

  PERFORM public.f_sync_tb_ruta_operacion_caja_principal(p_ruta, p_id_usuario);
  PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(p_ruta, p_id_usuario);

  SELECT to_jsonb(x)
  INTO v_result
  FROM public.f_get_tb_ruta_operacion_caja(p_id := v_new_id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_ruta_operacion_caja
Objetivo:
  Editar la asociacion ruta/caja usada por Operaciones, conservando la validacion
  de coherencia empresa-cuenta-caja y bloqueando multiples cajas principales
  activas en una misma ruta.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_ruta_operacion_caja(
  p_id bigint,
  p_ruta character varying DEFAULT NULL,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_flag_caja_ingreso_principal boolean DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_ruta_final character varying;
  v_empresa_final bigint;
  v_cuenta_final bigint;
  v_principal_final boolean;
  v_estado_final bigint;
  v_cuenta record;
  v_caja record;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_ruta_operacion_caja
  WHERE id = p_id
  LIMIT 1;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La asociacion de ruta no existe.');
  END IF;

  v_ruta_final := COALESCE(p_ruta, v_actual.ruta);
  v_empresa_final := COALESCE(p_id_empresa, v_actual.id_empresa);
  v_cuenta_final := COALESCE(p_id_empresa_cuenta_bancaria, v_actual.id_empresa_cuenta_bancaria);
  v_principal_final := COALESCE(p_flag_caja_ingreso_principal, v_actual.flag_caja_ingreso_principal);
  v_estado_final := COALESCE(p_id_estado, v_actual.id_estado);

  IF v_estado_final <> 1 THEN
    v_principal_final := false;
  END IF;

  IF COALESCE(v_ruta_final, '') = '' THEN
    RETURN jsonb_build_object('error', 'La ruta es obligatoria.');
  END IF;

  SELECT ecb.id, ecb.id_empresa
  INTO v_cuenta
  FROM public.tb_empresa_cuenta_bancaria ecb
  WHERE ecb.id = v_cuenta_final
  LIMIT 1;

  IF v_cuenta.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La cuenta bancaria no existe.');
  END IF;

  IF v_cuenta.id_empresa <> v_empresa_final THEN
    RETURN jsonb_build_object('error', 'La cuenta bancaria no pertenece a la empresa seleccionada.');
  END IF;

  SELECT c.id, c.id_estado
  INTO v_caja
  FROM public.tb_caja_operativa c
  WHERE c.id_empresa = v_empresa_final
    AND c.id_empresa_cuenta_bancaria = v_cuenta_final
  LIMIT 1;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Primero debe crear la caja operativa para esa empresa y cuenta bancaria.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_ruta_operacion_caja rc
    WHERE rc.id <> p_id
      AND rc.ruta = v_ruta_final
      AND rc.id_empresa = v_empresa_final
      AND rc.id_empresa_cuenta_bancaria = v_cuenta_final
  ) THEN
    RETURN jsonb_build_object('error', 'La caja ya esta asociada a esa ruta.');
  END IF;

  IF v_principal_final = true
     AND v_estado_final = 1
     AND EXISTS (
       SELECT 1
       FROM public.tb_ruta_operacion_caja rc
       WHERE rc.id <> p_id
         AND rc.ruta = v_ruta_final
         AND rc.flag_caja_ingreso_principal = true
         AND rc.id_estado = 1
     ) THEN
    RETURN jsonb_build_object('error', 'Ya existe una caja de ingreso principal activa para esta ruta.');
  END IF;

  UPDATE public.tb_ruta_operacion_caja
  SET ruta = v_ruta_final,
      id_empresa = v_empresa_final,
      id_empresa_cuenta_bancaria = v_cuenta_final,
      flag_caja_ingreso_principal = v_principal_final,
      id_estado = v_estado_final,
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id;

  PERFORM public.f_sync_tb_ruta_operacion_caja_principal(v_actual.ruta, COALESCE(p_id_usuario, v_actual.id_usuario));
  IF v_actual.ruta <> v_ruta_final THEN
    PERFORM public.f_sync_tb_ruta_operacion_caja_principal(v_ruta_final, COALESCE(p_id_usuario, v_actual.id_usuario));
  END IF;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(v_actual.ruta, COALESCE(p_id_usuario, v_actual.id_usuario));
  IF v_actual.ruta <> v_ruta_final THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(v_ruta_final, COALESCE(p_id_usuario, v_actual.id_usuario));
  END IF;

  SELECT to_jsonb(x)
  INTO v_result
  FROM public.f_get_tb_ruta_operacion_caja(p_id := p_id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 15. TB_RUTA_OPERACION_KPI
-- ============================================================================

/*
Tabla: tb_ruta_operacion_kpi
Objetivo:
  Materializar los KPI principales de una ruta de Operaciones para que el
  frontend no tenga que consultar sumatorias pesadas sobre cajas u operaciones.

Responsabilidad:
  - los KPI contables agregados de la ruta se sincronizan desde
    `tb_caja_operativa`;
  - los KPI operativos/comerciales de la ruta se actualizan por eventos desde
    `tb_operacion_proceso`.
*/
CREATE TABLE IF NOT EXISTS public.tb_ruta_operacion_kpi (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  ruta character varying NOT NULL,
  caja_inicial numeric NOT NULL DEFAULT 0,
  caja_actual numeric NOT NULL DEFAULT 0,
  total_recaudado numeric NOT NULL DEFAULT 0,
  ingresos numeric NOT NULL DEFAULT 0,
  salidas numeric NOT NULL DEFAULT 0,
  gastos_operacionales numeric NOT NULL DEFAULT 0,
  ganancias numeric NOT NULL DEFAULT 0,
  ingresos_retenidos numeric NOT NULL DEFAULT 0,
  pendiente_depositar numeric NOT NULL DEFAULT 0,
  total_efectivizacion integer NOT NULL DEFAULT 0,
  total_pago_deuda integer NOT NULL DEFAULT 0,
  id_estado bigint NOT NULL DEFAULT 1,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_ruta_operacion_kpi_pkey PRIMARY KEY (id),
  CONSTRAINT tb_ruta_operacion_kpi_unique UNIQUE (ruta),
  CONSTRAINT tb_ruta_operacion_kpi_fk_estado FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_ruta_operacion_kpi_fk_usuario FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id)
);

/*
Funcion: f_get_tb_ruta_operacion_kpi
Objetivo:
  Leer los KPI ya materializados por ruta. Esta funcion es la fuente de verdad
  del bloque superior principal de Operaciones.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_ruta_operacion_kpi(
  p_id bigint DEFAULT NULL,
  p_ruta character varying DEFAULT NULL,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  ruta character varying,
  caja_inicial numeric,
  caja_actual numeric,
  total_recaudado numeric,
  ingresos numeric,
  salidas numeric,
  gastos_operacionales numeric,
  ganancias numeric,
  ingresos_retenidos numeric,
  pendiente_depositar numeric,
  total_efectivizacion integer,
  total_pago_deuda integer,
  id_estado bigint,
  nombre_estado character varying,
  id_usuario bigint,
  nombre_usuario character varying,
  fecha_registro timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_id_empresa IS NOT NULL OR p_id_empresa_cuenta_bancaria IS NOT NULL THEN
    RETURN QUERY
    WITH base AS (
      SELECT
        k.id,
        k.ruta,
        k.id_estado,
        est.nombre AS nombre_estado,
        k.id_usuario,
        u.nombre AS nombre_usuario,
        k.fecha_registro
      FROM public.tb_ruta_operacion_kpi k
      JOIN public.tb_estado est ON est.id = k.id_estado
      LEFT JOIN public.tb_usuario u ON u.id = k.id_usuario
      WHERE (p_id IS NULL OR k.id = p_id)
        AND (p_ruta IS NULL OR k.ruta = p_ruta)
        AND (p_id_estado IS NULL OR k.id_estado = p_id_estado)
    ),
    caja_totales AS (
      SELECT
        rc.ruta,
        COALESCE(SUM(c.saldo_inicial), 0) AS caja_inicial,
        COALESCE(SUM(c.saldo_actual), 0) AS caja_actual,
        COALESCE(SUM((
          SELECT COALESCE(SUM(oc.monto_ingreso), 0)
          FROM public.tb_operacion_caja oc
          LEFT JOIN public.tb_operacion_proceso op
            ON op.id = oc.id_operacion_proceso
          WHERE oc.id_caja = c.id
            AND oc.id_caja_cierre IS NULL
            AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
            AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) <> 'RETENIDO'
            AND COALESCE(op.flag_retenido, false) = false
            AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) IN (
              'EFECTIVIZACION',
              'PAGO_DEUDA',
              'PAGO_DEUDA_DEVOLUCION',
              'PAGO_DEUDA_COMISION'
            )
        )), 0) AS total_recaudado,
        COALESCE(SUM(c.salida), 0) AS salidas,
        COALESCE(SUM(c.gastos), 0) AS gastos_operacionales,
        -- La retencion separa la ganancia en ganancia_retenido, pero no la elimina
        -- del resultado economico de la ruta.
        COALESCE(SUM(COALESCE(c.ganancia, 0) + COALESCE(c.ganancia_retenido, 0)), 0) AS ganancias,
        COALESCE(SUM((
          SELECT COALESCE(SUM(op.monto_deposito_cliente), 0)
          FROM public.tb_operacion_proceso op
          WHERE op.flag_retenido = true
            AND op.id_empresa_ingreso = c.id_empresa
            AND op.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria
            AND COALESCE(op.ruta_destino, op.ruta_origen) = rc.ruta
            AND op.id_caja_cierre IS NULL
            AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
        )), 0) AS ingresos_retenidos
      FROM base b
      JOIN public.tb_ruta_operacion_caja rc
        ON rc.ruta = b.ruta
       AND rc.id_estado = b.id_estado
      JOIN public.tb_caja_operativa c
        ON c.id_empresa = rc.id_empresa
       AND c.id_empresa_cuenta_bancaria = rc.id_empresa_cuenta_bancaria
       AND c.id_estado = b.id_estado
      WHERE (p_id_empresa IS NULL OR rc.id_empresa = p_id_empresa)
        AND (p_id_empresa_cuenta_bancaria IS NULL OR rc.id_empresa_cuenta_bancaria = p_id_empresa_cuenta_bancaria)
      GROUP BY rc.ruta
    ),
    ingresos_movimientos AS (
      SELECT
        rc.ruta,
        COALESCE(SUM(COALESCE(oc.monto_ingreso, 0)), 0) AS ingresos
      FROM base b
      JOIN public.tb_ruta_operacion_caja rc
        ON rc.ruta = b.ruta
       AND rc.id_estado = b.id_estado
      JOIN public.tb_caja_operativa c
        ON c.id_empresa = rc.id_empresa
       AND c.id_empresa_cuenta_bancaria = rc.id_empresa_cuenta_bancaria
       AND c.id_estado = b.id_estado
       JOIN public.tb_operacion_caja oc ON oc.id_caja = c.id
       LEFT JOIN public.tb_operacion_proceso op ON op.id = oc.id_operacion_proceso
      WHERE (p_id_empresa IS NULL OR rc.id_empresa = p_id_empresa)
        AND (p_id_empresa_cuenta_bancaria IS NULL OR rc.id_empresa_cuenta_bancaria = p_id_empresa_cuenta_bancaria)
        AND oc.id_caja_cierre IS NULL
        AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
        AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) <> 'RETENIDO'
        AND COALESCE(op.flag_retenido, false) = false
        AND UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) NOT IN ('EFECTIVIZACION', 'PAGO DEUDA')
        AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) NOT IN (
          'EXCEL',
          'EXCEL_GANANCIA',
          'OPERACION_PROCESO',
          'EDICION SALDO INICIAL CAJA',
          'PAGO_DEUDA',
          'PAGO_DEUDA_RETORNO',
          'PAGO_DEUDA_DIRECTO',
          'PAGO_DEUDA_COMISION'
        )
      GROUP BY rc.ruta
    ),
    operacion_totales AS (
      SELECT
        COALESCE(op.ruta_destino, op.ruta_origen) AS ruta,
        COALESCE(
          SUM(
            CASE
              WHEN public.f_get_tb_operacion_proceso_flag_pendiente_kpi(op.nombre_estado, op.flag_retenido)
                AND (
                  (p_id_empresa IS NULL OR op.id_empresa_ingreso = p_id_empresa OR op.id_empresa_salida = p_id_empresa)
                  AND (
                    p_id_empresa_cuenta_bancaria IS NULL
                    OR op.id_empresa_cuenta_ingreso = p_id_empresa_cuenta_bancaria
                    OR op.id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria
                  )
                )
              THEN COALESCE(op.monto_transferencia_cliente, 0)
              ELSE 0
            END
          ),
          0
        ) AS pendiente_depositar,
        COUNT(*) FILTER (
          WHERE UPPER(COALESCE(op.tipo_servicio, '')) = 'EFECTIVIZACION'
            AND op.id_empresa_ingreso = p_id_empresa
            AND (p_id_empresa_cuenta_bancaria IS NULL OR op.id_empresa_cuenta_ingreso = p_id_empresa_cuenta_bancaria)
            AND NOT (
              COALESCE(op.flag_retenido, false) = true
              AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
            )
        )::integer AS total_efectivizacion,
        COUNT(*) FILTER (
          WHERE UPPER(COALESCE(op.tipo_servicio, '')) = 'PAGO DEUDA'
            AND op.id_empresa_salida = p_id_empresa
            AND (p_id_empresa_cuenta_bancaria IS NULL OR op.id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
        )::integer AS total_pago_deuda
      FROM public.tb_operacion_proceso op
      JOIN base b ON b.ruta = COALESCE(op.ruta_destino, op.ruta_origen)
      WHERE op.id_caja_cierre IS NULL
      GROUP BY COALESCE(op.ruta_destino, op.ruta_origen)
    )
    SELECT
      b.id,
      b.ruta,
      COALESCE(ct.caja_inicial, 0),
      COALESCE(ct.caja_actual, 0),
      COALESCE(ct.total_recaudado, 0),
      COALESCE(im.ingresos, 0),
      COALESCE(ct.salidas, 0),
      COALESCE(ct.gastos_operacionales, 0),
      COALESCE(ct.ganancias, 0),
      COALESCE(ct.ingresos_retenidos, 0),
      COALESCE(ot.pendiente_depositar, 0),
      COALESCE(ot.total_efectivizacion, 0),
      COALESCE(ot.total_pago_deuda, 0),
      b.id_estado,
      b.nombre_estado,
      b.id_usuario,
      b.nombre_usuario,
      b.fecha_registro
    FROM base b
    LEFT JOIN caja_totales ct ON ct.ruta = b.ruta
    LEFT JOIN ingresos_movimientos im ON im.ruta = b.ruta
    LEFT JOIN operacion_totales ot ON ot.ruta = b.ruta
    ORDER BY b.ruta, b.id;

    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    k.id,
    k.ruta,
    k.caja_inicial,
    k.caja_actual,
    COALESCE((
      SELECT SUM(oc.monto_ingreso)
      FROM public.tb_ruta_operacion_caja rc
      JOIN public.tb_caja_operativa c
        ON c.id_empresa = rc.id_empresa
       AND c.id_empresa_cuenta_bancaria = rc.id_empresa_cuenta_bancaria
       AND c.id_estado = k.id_estado
       JOIN public.tb_operacion_caja oc ON oc.id_caja = c.id
       LEFT JOIN public.tb_operacion_proceso op ON op.id = oc.id_operacion_proceso
       WHERE rc.ruta = k.ruta
        AND rc.id_estado = k.id_estado
        AND oc.id_caja_cierre IS NULL
         AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
         AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) <> 'RETENIDO'
         AND COALESCE(op.flag_retenido, false) = false
         AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) IN (
          'EFECTIVIZACION',
          'PAGO_DEUDA',
          'PAGO_DEUDA_DEVOLUCION',
          'PAGO_DEUDA_COMISION'
        )
    ), 0) AS total_recaudado,
    k.ingresos,
    k.salidas,
    k.gastos_operacionales,
    k.ganancias,
    COALESCE((
      SELECT SUM(op.monto_deposito_cliente)
      FROM public.tb_operacion_proceso op
      WHERE op.flag_retenido = true
        AND COALESCE(op.ruta_destino, op.ruta_origen) = k.ruta
        AND op.id_caja_cierre IS NULL
        AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
        AND EXISTS (
          SELECT 1
          FROM public.tb_ruta_operacion_caja rc
          WHERE rc.ruta = k.ruta
            AND rc.id_estado = k.id_estado
            AND rc.id_empresa = op.id_empresa_ingreso
            AND rc.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_ingreso
        )
    ), 0) AS ingresos_retenidos,
    k.pendiente_depositar,
    k.total_efectivizacion,
    k.total_pago_deuda,
    k.id_estado,
    est.nombre AS nombre_estado,
    k.id_usuario,
    u.nombre AS nombre_usuario,
    k.fecha_registro
  FROM public.tb_ruta_operacion_kpi k
  JOIN public.tb_estado est ON est.id = k.id_estado
  LEFT JOIN public.tb_usuario u ON u.id = k.id_usuario
  WHERE (p_id IS NULL OR k.id = p_id)
    AND (p_ruta IS NULL OR k.ruta = p_ruta)
    AND (p_id_estado IS NULL OR k.id_estado = p_id_estado)
  ORDER BY k.ruta, k.id;
END;
$$;

/*
Funcion: f_patch_tb_ruta_operacion_kpi_delta
Objetivo:
  Aplicar deltas operativos sobre los KPI de ruta sin recalcular toda la capa
  de cajas. Se usa para pendientes y contadores de familias comerciales.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_ruta_operacion_kpi_delta(
  p_ruta character varying,
  p_delta_pendiente_depositar numeric DEFAULT 0,
  p_delta_total_efectivizacion integer DEFAULT 0,
  p_delta_total_pago_deuda integer DEFAULT 0,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_estado_activo_id bigint;
  v_result jsonb;
BEGIN
  IF COALESCE(p_ruta, '') = '' THEN
    RETURN NULL;
  END IF;

  SELECT id
  INTO v_estado_activo_id
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'ACTIVO'
  LIMIT 1;

  v_estado_activo_id := COALESCE(v_estado_activo_id, 1);

  INSERT INTO public.tb_ruta_operacion_kpi (
    ruta,
    id_estado,
    id_usuario
  )
  VALUES (
    p_ruta,
    v_estado_activo_id,
    p_id_usuario
  )
  ON CONFLICT (ruta) DO NOTHING;

  UPDATE public.tb_ruta_operacion_kpi
  SET pendiente_depositar = GREATEST(COALESCE(pendiente_depositar, 0) + COALESCE(p_delta_pendiente_depositar, 0), 0),
      total_efectivizacion = GREATEST(COALESCE(total_efectivizacion, 0) + COALESCE(p_delta_total_efectivizacion, 0), 0),
      total_pago_deuda = GREATEST(COALESCE(total_pago_deuda, 0) + COALESCE(p_delta_total_pago_deuda, 0), 0),
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE ruta = p_ruta;

  SELECT to_jsonb(x)
  INTO v_result
  FROM public.f_get_tb_ruta_operacion_kpi(p_ruta := p_ruta) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_sync_tb_ruta_operacion_kpi_operacion
Objetivo:
  Recalcular y materializar los KPI operativos/comerciales de una ruta a partir
  del snapshot actual de `tb_operacion_proceso`.

Uso:
  - altas manuales
  - cargas Excel
  - cambios de estado
  - derivaciones
  - retenciones
  - flujo Pago Deuda
*/
CREATE OR REPLACE FUNCTION public.f_sync_tb_ruta_operacion_kpi_operacion(
  p_ruta character varying,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_estado_activo_id bigint;
  v_result jsonb;
BEGIN
  IF COALESCE(p_ruta, '') = '' THEN
    RETURN NULL;
  END IF;

  SELECT id
  INTO v_estado_activo_id
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'ACTIVO'
  LIMIT 1;

  v_estado_activo_id := COALESCE(v_estado_activo_id, 1);

  INSERT INTO public.tb_ruta_operacion_kpi (
    ruta,
    id_estado,
    id_usuario
  )
  VALUES (
    p_ruta,
    v_estado_activo_id,
    p_id_usuario
  )
  ON CONFLICT (ruta) DO NOTHING;

  WITH totales AS (
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN public.f_get_tb_operacion_proceso_flag_pendiente_kpi(op.nombre_estado, op.flag_retenido)
            THEN COALESCE(op.monto_transferencia_cliente, 0)
            ELSE 0
          END
        ),
        0
      ) AS pendiente_depositar,
      COUNT(*) FILTER (
        WHERE UPPER(COALESCE(op.tipo_servicio, '')) = 'EFECTIVIZACION'
          AND NOT (
            COALESCE(op.flag_retenido, false) = true
            AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
          )
      )::integer AS total_efectivizacion,
      COUNT(*) FILTER (
        WHERE UPPER(COALESCE(op.tipo_servicio, '')) = 'PAGO DEUDA'
      )::integer AS total_pago_deuda
    FROM public.tb_operacion_proceso op
    WHERE COALESCE(op.ruta_destino, op.ruta_origen) = p_ruta
      AND op.id_caja_cierre IS NULL
      AND COALESCE(op.id_estado, 0) <> 10
  )
  UPDATE public.tb_ruta_operacion_kpi k
  SET pendiente_depositar = t.pendiente_depositar,
      total_efectivizacion = t.total_efectivizacion,
      total_pago_deuda = t.total_pago_deuda,
      id_usuario = COALESCE(p_id_usuario, k.id_usuario)
  FROM totales t
  WHERE k.ruta = p_ruta;

  SELECT to_jsonb(x)
  INTO v_result
  FROM public.f_get_tb_ruta_operacion_kpi(p_ruta := p_ruta) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_get_tb_operacion_bandeja_badges
Objetivo:
  Devolver conteos pendientes por bandeja operativa para mostrar badges en tabs.

Reglas:
  - en ciclo actual cuenta solo operaciones sin cierre de caja;
  - en historial cuenta solo operaciones congeladas dentro del rango de cierre;
  - los conteos son por ruta y empresa activa.
  - Retenidos de Scotiabank/Banbif se consultan en 10.retenciones_scotiabank_banbif.sql.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_bandeja_badges(
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
  WITH base AS (
    SELECT op.*
    FROM public.tb_operacion_proceso op
    WHERE COALESCE(op.ruta_destino, op.ruta_origen) = p_ruta
      AND COALESCE(op.id_estado, 0) <> 10
      AND (
        (
          p_fecha_caja_cierre_desde IS NULL
          AND p_fecha_caja_cierre_hasta IS NULL
          AND op.id_caja_cierre IS NULL
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
          AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
          AND COALESCE(flag_derivado, false) = false
          AND (p_id_empresa IS NULL OR id_empresa_salida = p_id_empresa)
          AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_ingreso = p_id_empresa_cuenta_bancaria)
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
          AND (
            p_id_empresa IS NULL
            OR id_empresa_ingreso = p_id_empresa
            OR id_empresa_salida = p_id_empresa
          )
          AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      )::integer AS derivados,
      COUNT(*) FILTER (
        WHERE LOWER(COALESCE(ruta_origen, '')) = 'pos'
          AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
          AND COALESCE(flag_retenido, false) = false
          AND (
            p_id_empresa IS NULL
            OR id_empresa_ingreso = p_id_empresa
            OR id_empresa_salida = p_id_empresa
          )
          AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      )::integer AS pos,
      COUNT(*) FILTER (
        WHERE false
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
Funcion: f_get_tb_operacion_empresa_badges
Objetivo:
  Devolver conteos pendientes por bandeja y empresa para mostrar badges en la
  fila de empresas de la ruta bancaria.

Reglas:
  - las demas bandejas usan el universo pendiente de f_get_tb_operacion_bandeja_badges;
  - en ciclo actual cuenta solo operaciones sin cierre de caja;
  - en historial cuenta solo operaciones congeladas dentro del rango de cierre;
  - derivados se agrupa por empresa de salida porque la ruta destino atiende
    la operacion.
  - Retenidos de Scotiabank/Banbif se consultan en 10.retenciones_scotiabank_banbif.sql.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_empresa_badges(
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
  WITH base AS (
    SELECT op.*
    FROM public.tb_operacion_proceso op
    WHERE COALESCE(op.ruta_destino, op.ruta_origen) = p_ruta
      AND COALESCE(op.id_estado, 0) <> 10
      AND (
        (
          p_fecha_caja_cierre_desde IS NULL
          AND p_fecha_caja_cierre_hasta IS NULL
          AND op.id_caja_cierre IS NULL
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
    SELECT
      'Efectivizacion'::character varying AS tab,
      id_empresa_salida AS id_empresa
    FROM base
    WHERE UPPER(COALESCE(tipo_servicio, '')) = 'EFECTIVIZACION'
      AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
      AND COALESCE(flag_derivado, false) = false
      AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_ingreso = p_id_empresa_cuenta_bancaria)
      AND id_empresa_salida IS NOT NULL

    UNION ALL

    SELECT
      'Pago Deuda'::character varying AS tab,
      id_empresa_salida AS id_empresa
    FROM base
    WHERE UPPER(COALESCE(tipo_servicio, '')) = 'PAGO DEUDA'
      AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
      AND COALESCE(flag_retenido, false) = false
      AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      AND id_empresa_salida IS NOT NULL

    UNION ALL

    SELECT
      'Derivados'::character varying AS tab,
      id_empresa_salida AS id_empresa
    FROM base
    WHERE COALESCE(flag_derivado, false) = true
      AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
      AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      AND id_empresa_salida IS NOT NULL

    UNION ALL

    SELECT
      'POS'::character varying AS tab,
      COALESCE(id_empresa_salida, id_empresa_ingreso) AS id_empresa
    FROM base
    WHERE LOWER(COALESCE(ruta_origen, '')) = 'pos'
      AND UPPER(BTRIM(COALESCE(nombre_estado, ''))) IN ('PENDIENTE', 'SOLICITADO')
      AND COALESCE(flag_retenido, false) = false
      AND (p_id_empresa_cuenta_bancaria IS NULL OR id_empresa_cuenta_salida = p_id_empresa_cuenta_bancaria)
      AND COALESCE(id_empresa_salida, id_empresa_ingreso) IS NOT NULL

    UNION ALL

    SELECT
      'Retenidos'::character varying AS tab,
      COALESCE(id_empresa_ingreso, id_empresa_salida) AS id_empresa
    FROM base
    WHERE false
  )
  SELECT
    empresa_rows.tab,
    empresa_rows.id_empresa,
    COUNT(*)::integer AS cantidad
  FROM empresa_rows
  GROUP BY empresa_rows.tab, empresa_rows.id_empresa
  HAVING COUNT(*) > 0
  ORDER BY empresa_rows.tab, empresa_rows.id_empresa;
$$;

/*
Funcion: f_sync_tb_ruta_operacion_kpi_caja
Objetivo:
  Recalcular y persistir los KPI contables agregados de una ruta a partir de
  las cajas efectivamente asociadas a esa ruta.

Nota:
  Este calculo puede usar SUM en escritura porque su objetivo es materializar
  los resultados para las lecturas futuras del frontend.
*/
CREATE OR REPLACE FUNCTION public.f_sync_tb_ruta_operacion_kpi_caja(
  p_ruta character varying,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_estado_activo_id bigint;
  v_result jsonb;
BEGIN
  IF COALESCE(p_ruta, '') = '' THEN
    RETURN NULL;
  END IF;

  SELECT id
  INTO v_estado_activo_id
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'ACTIVO'
  LIMIT 1;

  v_estado_activo_id := COALESCE(v_estado_activo_id, 1);

  INSERT INTO public.tb_ruta_operacion_kpi (
    ruta,
    id_estado,
    id_usuario
  )
  VALUES (
    p_ruta,
    v_estado_activo_id,
    p_id_usuario
  )
  ON CONFLICT (ruta) DO NOTHING;

  UPDATE public.tb_caja_operativa c
  SET ingresos_retenido = COALESCE((
    SELECT SUM(op.monto_deposito_cliente)
    FROM public.tb_operacion_proceso op
    WHERE op.flag_retenido = true
      AND op.id_empresa_ingreso = c.id_empresa
      AND op.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria
      AND COALESCE(op.ruta_destino, op.ruta_origen) = p_ruta
      AND op.id_caja_cierre IS NULL
      AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
  ), 0)
  WHERE c.id_estado = v_estado_activo_id
    AND EXISTS (
      SELECT 1
      FROM public.tb_ruta_operacion_caja rc
      WHERE rc.ruta = p_ruta
        AND rc.id_estado = v_estado_activo_id
        AND rc.id_empresa = c.id_empresa
        AND rc.id_empresa_cuenta_bancaria = c.id_empresa_cuenta_bancaria
    );

  WITH cajas_ruta AS (
    SELECT DISTINCT
      c.id,
      c.saldo_inicial,
      c.saldo_actual,
      COALESCE(c.total_recaudado, 0) AS total_recaudado,
      c.ingresos,
      COALESCE((
        SELECT SUM(op.monto_deposito_cliente)
        FROM public.tb_operacion_proceso op
        WHERE op.flag_retenido = true
          AND op.id_empresa_ingreso = c.id_empresa
          AND op.id_empresa_cuenta_ingreso = c.id_empresa_cuenta_bancaria
          AND COALESCE(op.ruta_destino, op.ruta_origen) = p_ruta
          AND op.id_caja_cierre IS NULL
          AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
      ), 0) AS ingresos_retenido,
      c.gastos,
      c.ganancia,
      c.ganancia_retenido,
      c.salida
    FROM public.tb_ruta_operacion_caja rc
    JOIN public.tb_caja_operativa c
      ON c.id_empresa = rc.id_empresa
     AND c.id_empresa_cuenta_bancaria = rc.id_empresa_cuenta_bancaria
    WHERE rc.ruta = p_ruta
      AND rc.id_estado = v_estado_activo_id
      AND c.id_estado = v_estado_activo_id
  ),
  ingresos_movimientos AS (
    SELECT COALESCE(SUM(COALESCE(oc.monto_ingreso, 0)), 0) AS ingresos
    FROM cajas_ruta cr
    JOIN public.tb_operacion_caja oc ON oc.id_caja = cr.id
    LEFT JOIN public.tb_operacion_proceso op ON op.id = oc.id_operacion_proceso
    WHERE oc.id_caja_cierre IS NULL
      AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
      AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) <> 'RETENIDO'
      AND COALESCE(op.flag_retenido, false) = false
      AND UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) NOT IN ('EFECTIVIZACION', 'PAGO DEUDA')
      AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) NOT IN (
        'EXCEL',
        'EXCEL_GANANCIA',
        'OPERACION_PROCESO',
        'EDICION SALDO INICIAL CAJA',
        'PAGO_DEUDA',
        'PAGO_DEUDA_RETORNO',
        'PAGO_DEUDA_DIRECTO',
        'PAGO_DEUDA_COMISION'
      )
  ),
  recaudacion_movimientos AS (
    SELECT
      cr.id,
      COALESCE(SUM(COALESCE(oc.monto_ingreso, 0)), 0) AS total_recaudado
    FROM cajas_ruta cr
    JOIN public.tb_operacion_caja oc ON oc.id_caja = cr.id
    LEFT JOIN public.tb_operacion_proceso op ON op.id = oc.id_operacion_proceso
    WHERE oc.id_caja_cierre IS NULL
      AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
      AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) <> 'RETENIDO'
      AND COALESCE(op.flag_retenido, false) = false
      AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) IN (
        'EFECTIVIZACION',
        'PAGO_DEUDA',
        'PAGO_DEUDA_DEVOLUCION',
        'PAGO_DEUDA_COMISION'
      )
    GROUP BY cr.id
  ),
  totales AS (
    SELECT
      COALESCE(SUM(cr.saldo_inicial), 0) AS caja_inicial,
      COALESCE(SUM(cr.saldo_actual), 0) AS caja_actual,
      COALESCE(SUM(COALESCE(rm.total_recaudado, 0)), 0) AS total_recaudado,
      COALESCE((SELECT im.ingresos FROM ingresos_movimientos im), 0) AS ingresos,
      COALESCE(SUM(cr.salida), 0) AS salidas,
      COALESCE(SUM(cr.gastos), 0) AS gastos_operacionales,
      -- La ganancia retenida sigue siendo ganancia generada y debe permanecer
      -- visible en el KPI mientras espera su liberacion.
      COALESCE(SUM(COALESCE(cr.ganancia, 0) + COALESCE(cr.ganancia_retenido, 0)), 0) AS ganancias,
      COALESCE(SUM(cr.ingresos_retenido), 0) AS ingresos_retenidos
    FROM cajas_ruta cr
    LEFT JOIN recaudacion_movimientos rm ON rm.id = cr.id
  )
  UPDATE public.tb_ruta_operacion_kpi k
  SET caja_inicial = t.caja_inicial,
      caja_actual = t.caja_actual,
      total_recaudado = t.total_recaudado,
      ingresos = t.ingresos,
      salidas = t.salidas,
      gastos_operacionales = t.gastos_operacionales,
      ganancias = t.ganancias,
      ingresos_retenidos = t.ingresos_retenidos,
      id_usuario = COALESCE(p_id_usuario, k.id_usuario)
  FROM totales t
  WHERE k.ruta = p_ruta;

  SELECT to_jsonb(x)
  INTO v_result
  FROM public.f_get_tb_ruta_operacion_kpi(p_ruta := p_ruta) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 16. TB_CAJA_OPERATIVA
-- ============================================================================

/*
Tabla: tb_caja_operativa
Objetivo:
  Representa la caja operativa base de una empresa sobre una cuenta bancaria
  especÃ­fica. En esta migraciÃ³n compacta conserva tanto el nÃºcleo de apertura y
  saldo como los KPI vivos materializados, para evitar recalcular dashboard en
  cada lectura.

Reglas principales:
  - una empresa no puede repetir la misma cuenta bancaria en mÃ¡s de una caja;
  - saldo_inicial y saldo_actual nacen en la misma caja;
  - la retencion se gobierna desde tb_recaudacion_regla_abono (archivo 12),
    no desde la caja.
*/
CREATE TABLE IF NOT EXISTS public.tb_caja_operativa (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_empresa bigint NOT NULL,
  id_empresa_cuenta_bancaria bigint NOT NULL,
  saldo_inicial numeric NOT NULL DEFAULT 0,
  saldo_total numeric NOT NULL DEFAULT 0,
  saldo_actual numeric NOT NULL DEFAULT 0,
  total_recaudado numeric NOT NULL DEFAULT 0,
  ingresos numeric NOT NULL DEFAULT 0,
  ingresos_retenido numeric NOT NULL DEFAULT 0,
  gastos numeric NOT NULL DEFAULT 0,
  ganancia numeric NOT NULL DEFAULT 0,
  ganancia_retenido numeric NOT NULL DEFAULT 0,
  salida numeric NOT NULL DEFAULT 0,
  operaciones integer NOT NULL DEFAULT 0,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_apertura timestamp with time zone NOT NULL DEFAULT now(),
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_caja_operativa_pkey PRIMARY KEY (id),
  CONSTRAINT tb_caja_operativa_unique UNIQUE (id_empresa, id_empresa_cuenta_bancaria),
  CONSTRAINT tb_caja_operativa_saldo_inicial_check CHECK (saldo_inicial >= 0),
  CONSTRAINT tb_caja_operativa_saldo_total_check CHECK (saldo_total >= 0),
  CONSTRAINT tb_caja_operativa_saldo_actual_check CHECK (saldo_actual >= 0),
  CONSTRAINT tb_caja_operativa_total_recaudado_check CHECK (total_recaudado >= 0),
  CONSTRAINT tb_caja_operativa_ingresos_check CHECK (ingresos >= 0),
  CONSTRAINT tb_caja_operativa_ingresos_retenido_check CHECK (ingresos_retenido >= 0),
  CONSTRAINT tb_caja_operativa_gastos_check CHECK (gastos >= 0),
  CONSTRAINT tb_caja_operativa_ganancia_check CHECK (ganancia >= 0),
  CONSTRAINT tb_caja_operativa_ganancia_retenido_check CHECK (ganancia_retenido >= 0),
  CONSTRAINT tb_caja_operativa_salida_check CHECK (salida >= 0),
  CONSTRAINT tb_caja_operativa_operaciones_check CHECK (operaciones >= 0),
  CONSTRAINT tb_caja_operativa_fk_empresa FOREIGN KEY (id_empresa) REFERENCES public.tb_empresa(id),
  CONSTRAINT tb_caja_operativa_fk_empresa_cuenta FOREIGN KEY (id_empresa_cuenta_bancaria) REFERENCES public.tb_empresa_cuenta_bancaria(id),
  CONSTRAINT tb_caja_operativa_fk_estado FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_caja_operativa_fk_usuario FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tb_caja_operativa'
      AND column_name = 'saldo_total'
  ) THEN
    ALTER TABLE public.tb_caja_operativa
    ADD COLUMN saldo_total numeric NOT NULL DEFAULT 0;

    UPDATE public.tb_caja_operativa
    SET saldo_total = saldo_actual;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tb_caja_operativa_saldo_total_check'
      AND conrelid = 'public.tb_caja_operativa'::regclass
  ) THEN
    ALTER TABLE public.tb_caja_operativa
    ADD CONSTRAINT tb_caja_operativa_saldo_total_check CHECK (saldo_total >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tb_caja_operativa'
      AND column_name = 'total_recaudado'
  ) THEN
    ALTER TABLE public.tb_caja_operativa
    ADD COLUMN total_recaudado numeric NOT NULL DEFAULT 0;
  END IF;
END;
$$;

-- ============================================================================
-- DROP COLUMN: quitar flag_retencion de tb_caja_operativa
-- La retencion ahora se gobierna desde tb_recaudacion_regla_abono (archivo 12).
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_caja_operativa' AND column_name = 'flag_retencion'
  ) THEN
    ALTER TABLE public.tb_caja_operativa DROP COLUMN flag_retencion;
  END IF;
END;
$$;

/*
Funcion: f_get_tb_caja_operativa
Objetivo:
  Consultar cajas compactas con sus nombres enriquecidos de empresa, banco,
  estado y usuario. Se usa como funciÃ³n base para listar y tambiÃ©n para devolver
  el snapshot final despuÃ©s de crear o editar.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_caja_operativa(
  p_id bigint DEFAULT NULL,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  id_empresa bigint,
  nombre_empresa character varying,
  id_empresa_cuenta_bancaria bigint,
  id_banco bigint,
  nombre_banco character varying,
  saldo_inicial numeric,
  saldo_total numeric,
  saldo_actual numeric,
  total_recaudado numeric,
  ingresos numeric,
  ingresos_retenido numeric,
  gastos numeric,
  ganancia numeric,
  ganancia_retenido numeric,
  salida numeric,
  operaciones integer,
  id_estado bigint,
  nombre_estado character varying,
  id_usuario bigint,
  nombre_usuario character varying,
  fecha_apertura timestamp with time zone,
  fecha_registro timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.id_empresa,
    e.nombre AS nombre_empresa,
    c.id_empresa_cuenta_bancaria,
    ecb.id_banco,
    b.nombre AS nombre_banco,
    c.saldo_inicial,
    c.saldo_total,
    c.saldo_actual,
    c.total_recaudado,
    c.ingresos,
    c.ingresos_retenido,
    c.gastos,
    c.ganancia,
    c.ganancia_retenido,
    c.salida,
    c.operaciones,
    c.id_estado,
    est.nombre AS nombre_estado,
    c.id_usuario,
    u.nombre AS nombre_usuario,
    c.fecha_apertura,
    c.fecha_registro
  FROM public.tb_caja_operativa c
  JOIN public.tb_empresa e ON e.id = c.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = c.id_empresa_cuenta_bancaria
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  JOIN public.tb_estado est ON est.id = c.id_estado
  LEFT JOIN public.tb_usuario u ON u.id = c.id_usuario
  WHERE (p_id IS NULL OR c.id = p_id)
    AND (p_id_empresa IS NULL OR c.id_empresa = p_id_empresa)
    AND (p_id_empresa_cuenta_bancaria IS NULL OR c.id_empresa_cuenta_bancaria = p_id_empresa_cuenta_bancaria)
    AND (p_id_estado IS NULL OR c.id_estado = p_id_estado)
  ORDER BY e.nombre, b.nombre, c.id;
END;
$$;

/*
Funcion: f_post_tb_caja_operativa
Objetivo:
  Crear una caja compacta validando que la cuenta bancaria pertenezca a la
  empresa elegida. No crea movimientos ni historial; solo registra el punto de
  partida operativo.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_caja_operativa(
  p_id_empresa bigint,
  p_id_empresa_cuenta_bancaria bigint,
  p_saldo_inicial numeric DEFAULT 0,
  p_saldo_actual numeric DEFAULT NULL,
  p_ingresos numeric DEFAULT 0,
  p_ingresos_retenido numeric DEFAULT 0,
  p_gastos numeric DEFAULT 0,
  p_ganancia numeric DEFAULT 0,
  p_ganancia_retenido numeric DEFAULT 0,
  p_salida numeric DEFAULT 0,
  p_operaciones integer DEFAULT 0,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_fecha_apertura timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cuenta record;
  v_new_id bigint;
  v_result jsonb;
BEGIN
  SELECT
    ecb.id,
    ecb.id_empresa
  INTO v_cuenta
  FROM public.tb_empresa_cuenta_bancaria ecb
  WHERE ecb.id = p_id_empresa_cuenta_bancaria
  LIMIT 1;

  IF v_cuenta.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La cuenta bancaria no existe.');
  END IF;

  IF v_cuenta.id_empresa <> p_id_empresa THEN
    RETURN jsonb_build_object('error', 'La cuenta bancaria no pertenece a la empresa seleccionada.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_caja_operativa c
    WHERE c.id_empresa = p_id_empresa
      AND c.id_empresa_cuenta_bancaria = p_id_empresa_cuenta_bancaria
  ) THEN
    RETURN jsonb_build_object('error', 'Ya existe una caja para esa empresa y cuenta bancaria.');
  END IF;

  INSERT INTO public.tb_caja_operativa (
    id_empresa,
    id_empresa_cuenta_bancaria,
    saldo_inicial,
    saldo_total,
    saldo_actual,
    total_recaudado,
    ingresos,
    ingresos_retenido,
    gastos,
    ganancia,
    ganancia_retenido,
    salida,
    operaciones,
    id_estado,
    id_usuario,
    fecha_apertura
  )
  VALUES (
    p_id_empresa,
    p_id_empresa_cuenta_bancaria,
    COALESCE(p_saldo_inicial, 0),
    COALESCE(p_saldo_actual, p_saldo_inicial, 0),
    COALESCE(p_saldo_actual, p_saldo_inicial, 0),
    COALESCE(p_ingresos, 0),
    COALESCE(p_ingresos, 0),
    COALESCE(p_ingresos_retenido, 0),
    COALESCE(p_gastos, 0),
    COALESCE(p_ganancia, 0),
    COALESCE(p_ganancia_retenido, 0),
    COALESCE(p_salida, 0),
    COALESCE(p_operaciones, 0),
    p_id_estado,
    p_id_usuario,
    COALESCE(p_fecha_apertura, now())
  )
  RETURNING id INTO v_new_id;

  SELECT to_jsonb(x)
  INTO v_result
  FROM public.f_get_tb_caja_operativa(p_id := v_new_id) AS x
  LIMIT 1;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(r.ruta, p_id_usuario)
  FROM (
    SELECT DISTINCT rc.ruta
    FROM public.tb_ruta_operacion_caja rc
    WHERE rc.id_empresa = p_id_empresa
      AND rc.id_empresa_cuenta_bancaria = p_id_empresa_cuenta_bancaria
  ) r;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_caja_operativa
Objetivo:
  Editar una caja compacta ya existente. Permite cambiar empresa, cuenta, saldos,
  estado y usuario, manteniendo la validaciÃ³n de coherencia entre empresa y
  cuenta bancaria.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_caja_operativa(
  p_id bigint,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_saldo_inicial numeric DEFAULT NULL,
  p_saldo_actual numeric DEFAULT NULL,
  p_ingresos numeric DEFAULT NULL,
  p_ingresos_retenido numeric DEFAULT NULL,
  p_gastos numeric DEFAULT NULL,
  p_ganancia numeric DEFAULT NULL,
  p_ganancia_retenido numeric DEFAULT NULL,
  p_salida numeric DEFAULT NULL,
  p_operaciones integer DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_fecha_apertura timestamp with time zone DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_empresa_final bigint;
  v_cuenta_final bigint;
  v_estado_final bigint;
  v_cuenta record;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_caja_operativa
  WHERE id = p_id
  LIMIT 1;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La caja no existe.');
  END IF;

  IF p_saldo_inicial IS NOT NULL OR p_saldo_actual IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error', 'Los saldos de la caja deben actualizarse mediante la edicion de saldo inicial.'
    );
  END IF;

  v_empresa_final := COALESCE(p_id_empresa, v_actual.id_empresa);
  v_cuenta_final := COALESCE(p_id_empresa_cuenta_bancaria, v_actual.id_empresa_cuenta_bancaria);
  v_estado_final := COALESCE(p_id_estado, v_actual.id_estado);

  SELECT
    ecb.id,
    ecb.id_empresa
  INTO v_cuenta
  FROM public.tb_empresa_cuenta_bancaria ecb
  WHERE ecb.id = v_cuenta_final
  LIMIT 1;

  IF v_cuenta.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La cuenta bancaria no existe.');
  END IF;

  IF v_cuenta.id_empresa <> v_empresa_final THEN
    RETURN jsonb_build_object('error', 'La cuenta bancaria no pertenece a la empresa seleccionada.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_caja_operativa c
    WHERE c.id <> p_id
      AND c.id_empresa = v_empresa_final
      AND c.id_empresa_cuenta_bancaria = v_cuenta_final
  ) THEN
    RETURN jsonb_build_object('error', 'Ya existe otra caja para esa empresa y cuenta bancaria.');
  END IF;

  UPDATE public.tb_caja_operativa
  SET id_empresa = v_empresa_final,
      id_empresa_cuenta_bancaria = v_cuenta_final,
      saldo_inicial = COALESCE(p_saldo_inicial, saldo_inicial),
      saldo_total = COALESCE(p_saldo_actual, saldo_total),
      saldo_actual = COALESCE(p_saldo_actual, saldo_actual),
      total_recaudado = COALESCE(p_ingresos, ingresos),
      ingresos = COALESCE(p_ingresos, ingresos),
      ingresos_retenido = COALESCE(p_ingresos_retenido, ingresos_retenido),
      gastos = COALESCE(p_gastos, gastos),
      ganancia = COALESCE(p_ganancia, ganancia),
      ganancia_retenido = COALESCE(p_ganancia_retenido, ganancia_retenido),
      salida = COALESCE(p_salida, salida),
      operaciones = COALESCE(p_operaciones, operaciones),
      id_estado = v_estado_final,
      id_usuario = COALESCE(p_id_usuario, id_usuario),
      fecha_apertura = COALESCE(p_fecha_apertura, fecha_apertura)
  WHERE id = p_id;

  IF v_estado_final <> 1 THEN
    UPDATE public.tb_ruta_operacion_caja
    SET id_estado = v_estado_final,
        flag_caja_ingreso_principal = false,
        id_usuario = COALESCE(p_id_usuario, id_usuario)
    WHERE (id_empresa = v_actual.id_empresa AND id_empresa_cuenta_bancaria = v_actual.id_empresa_cuenta_bancaria)
       OR (id_empresa = v_empresa_final AND id_empresa_cuenta_bancaria = v_cuenta_final);
  END IF;

  SELECT to_jsonb(x)
  INTO v_result
  FROM public.f_get_tb_caja_operativa(p_id := p_id) AS x
  LIMIT 1;

  PERFORM public.f_sync_tb_ruta_operacion_caja_principal(r.ruta, COALESCE(p_id_usuario, v_actual.id_usuario))
  FROM (
    SELECT DISTINCT rc.ruta
    FROM public.tb_ruta_operacion_caja rc
    WHERE (rc.id_empresa = v_actual.id_empresa AND rc.id_empresa_cuenta_bancaria = v_actual.id_empresa_cuenta_bancaria)
       OR (rc.id_empresa = v_empresa_final AND rc.id_empresa_cuenta_bancaria = v_cuenta_final)
  ) r;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(r.ruta, COALESCE(p_id_usuario, v_actual.id_usuario))
  FROM (
    SELECT DISTINCT rc.ruta
    FROM public.tb_ruta_operacion_caja rc
    WHERE (rc.id_empresa = v_actual.id_empresa AND rc.id_empresa_cuenta_bancaria = v_actual.id_empresa_cuenta_bancaria)
       OR (rc.id_empresa = v_empresa_final AND rc.id_empresa_cuenta_bancaria = v_cuenta_final)
  ) r;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_caja_operativa_saldo_inicial
Objetivo:
  Ajustar el saldo inicial de una caja mediante un movimiento compensatorio.
  El saldo actual nunca se modifica directamente: cambia por el movimiento
  de ingreso o salida generado por la diferencia.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_caja_operativa_saldo_inicial(
  p_id_caja bigint,
  p_saldo_inicial numeric,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caja record;
  v_saldo_anterior numeric;
  v_saldo_nuevo numeric;
  v_diferencia numeric;
  v_movimientos_operativos integer := 0;
  v_movimiento jsonb;
  v_result jsonb;
BEGIN
  IF p_saldo_inicial IS NULL OR p_saldo_inicial < 0 THEN
    RETURN jsonb_build_object('error', 'El saldo inicial debe ser mayor o igual a cero.');
  END IF;

  SELECT c.*
  INTO v_caja
  FROM public.tb_caja_operativa c
  WHERE c.id = p_id_caja
  LIMIT 1
  FOR UPDATE;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La caja no existe.');
  END IF;

  -- El saldo inicial solo puede corregirse mientras la caja viva no tenga
  -- operaciones ni movimientos operativos en el ciclo actual. Los ajustes
  -- previos del propio saldo inicial no bloquean una nueva correccion.
  SELECT COUNT(*)::integer
  INTO v_movimientos_operativos
  FROM public.tb_operacion_caja oc
  WHERE oc.id_caja = p_id_caja
    AND oc.id_caja_cierre IS NULL
    AND (
      oc.id_operacion_proceso IS NOT NULL
      OR UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) <> 'EDICION SALDO INICIAL CAJA'
    );

  IF v_movimientos_operativos > 0 THEN
    RETURN jsonb_build_object(
      'error', 'No se puede editar el saldo inicial porque la caja ya tiene operaciones o movimientos.',
      'codigo', 'CAJA_CON_ACTIVIDAD',
      'id_caja', p_id_caja
    );
  END IF;

  v_saldo_anterior := COALESCE(v_caja.saldo_inicial, 0);
  v_saldo_nuevo := p_saldo_inicial;
  v_diferencia := v_saldo_nuevo - v_saldo_anterior;

  IF v_diferencia <> 0 THEN
    IF v_diferencia > 0 THEN
      v_movimiento := public.f_post_tb_operacion_caja(
        p_id_caja := p_id_caja,
        p_tipo_origen := 'EDICION SALDO INICIAL CAJA',
        p_tipo_movimiento := 'INGRESO',
        p_detalle := format('Edicion de saldo inicial: %s -> %s', v_saldo_anterior, v_saldo_nuevo),
        p_monto_ingreso := v_diferencia,
        p_flag_contabiliza_operacion := false,
        p_id_usuario := p_id_usuario,
        p_nombre_usuario := p_nombre_usuario
      );
    ELSE
      v_movimiento := public.f_post_tb_operacion_caja(
        p_id_caja := p_id_caja,
        p_tipo_origen := 'EDICION SALDO INICIAL CAJA',
        p_tipo_movimiento := 'SALIDA',
        p_detalle := format('Edicion de saldo inicial: %s -> %s', v_saldo_anterior, v_saldo_nuevo),
        p_monto_salida := abs(v_diferencia),
        p_flag_contabiliza_operacion := false,
        p_id_usuario := p_id_usuario,
        p_nombre_usuario := p_nombre_usuario
      );
    END IF;

    IF v_movimiento ? 'error' THEN
      RETURN v_movimiento;
    END IF;
  END IF;

  UPDATE public.tb_caja_operativa
  SET saldo_inicial = v_saldo_nuevo,
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id_caja;

  SELECT to_jsonb(x)
  INTO v_result
  FROM public.f_get_tb_caja_operativa(p_id := p_id_caja) AS x
  LIMIT 1;

  RETURN jsonb_build_object(
    'caja', v_result,
    'movimiento', v_movimiento,
    'diferencia', v_diferencia
  );
END;
$$;

-- ============================================================================
-- 17. TB_ASIGNACION_CAJA_OPERATIVA
-- ============================================================================

/*
Tabla: tb_asignacion_caja_operativa
Objetivo:
  Registrar la asignaciÃ³n operativa de una caja a un usuario dentro de una ruta.
  Esta relaciÃ³n es la fuente de verdad del universo de cajas visibles para el
  usuario en Operaciones.
*/
CREATE TABLE IF NOT EXISTS public.tb_asignacion_caja_operativa (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  ruta character varying NOT NULL,
  id_usuario bigint NOT NULL,
  id_caja bigint NOT NULL,
  id_estado bigint NOT NULL DEFAULT 1,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_asignacion_caja_operativa_pkey PRIMARY KEY (id),
  CONSTRAINT tb_asignacion_caja_operativa_unique UNIQUE (ruta, id_usuario, id_caja),
  CONSTRAINT tb_asignacion_caja_operativa_fk_caja FOREIGN KEY (id_caja) REFERENCES public.tb_caja_operativa(id),
  CONSTRAINT tb_asignacion_caja_operativa_fk_estado FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_asignacion_caja_operativa_fk_usuario FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id)
);

-- ============================================================================
-- 18. TB_CAJA_OPERATIVA_CIERRE
-- ============================================================================

/*
Tabla: tb_caja_operativa_cierre
Objetivo:
  Congelar snapshots de cierres de caja. En la fase compacta se almacena solo el
  resumen base del cierre, dejando libre el campo kpi_snapshot para adjuntar
  mÃ©tricas futuras sin depender todavÃ­a de movimientos de caja.
*/
CREATE TABLE IF NOT EXISTS public.tb_caja_operativa_cierre (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_caja bigint NOT NULL,
  id_empresa bigint NOT NULL,
  id_empresa_cuenta_bancaria bigint NOT NULL,
  saldo_inicial numeric NOT NULL DEFAULT 0,
  saldo_total numeric NOT NULL DEFAULT 0,
  saldo_actual numeric NOT NULL DEFAULT 0,
  total_recaudado numeric NOT NULL DEFAULT 0,
  ingresos numeric NOT NULL DEFAULT 0,
  ingresos_retenido numeric NOT NULL DEFAULT 0,
  gastos numeric NOT NULL DEFAULT 0,
  ganancia numeric NOT NULL DEFAULT 0,
  ganancia_retenido numeric NOT NULL DEFAULT 0,
  salida numeric NOT NULL DEFAULT 0,
  operaciones integer NOT NULL DEFAULT 0,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_apertura timestamp with time zone NOT NULL,
  fecha_cierre timestamp with time zone NOT NULL DEFAULT now(),
  kpi_snapshot jsonb,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_caja_operativa_cierre_pkey PRIMARY KEY (id),
  CONSTRAINT tb_caja_operativa_cierre_fk_caja FOREIGN KEY (id_caja) REFERENCES public.tb_caja_operativa(id),
  CONSTRAINT tb_caja_operativa_cierre_fk_empresa FOREIGN KEY (id_empresa) REFERENCES public.tb_empresa(id),
  CONSTRAINT tb_caja_operativa_cierre_fk_empresa_cuenta FOREIGN KEY (id_empresa_cuenta_bancaria) REFERENCES public.tb_empresa_cuenta_bancaria(id),
  CONSTRAINT tb_caja_operativa_cierre_fk_estado FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_caja_operativa_cierre_fk_usuario FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tb_caja_operativa_cierre'
      AND column_name = 'saldo_total'
  ) THEN
    ALTER TABLE public.tb_caja_operativa_cierre
    ADD COLUMN saldo_total numeric NOT NULL DEFAULT 0;

    UPDATE public.tb_caja_operativa_cierre
    SET saldo_total = saldo_actual;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tb_caja_operativa_cierre'
      AND column_name = 'total_recaudado'
  ) THEN
    ALTER TABLE public.tb_caja_operativa_cierre
    ADD COLUMN total_recaudado numeric NOT NULL DEFAULT 0;
  END IF;
END;
$$;

/*
Funcion: f_get_tb_caja_operativa_cierre
Objetivo:
  Consultar cierres de caja ya congelados. Devuelve el snapshot con nombres
  enriquecidos de empresa, banco, estado y usuario.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_caja_operativa_cierre(
  p_id bigint DEFAULT NULL,
  p_id_caja bigint DEFAULT NULL,
  p_id_empresa bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  id_caja bigint,
  id_empresa bigint,
  nombre_empresa character varying,
  id_empresa_cuenta_bancaria bigint,
  id_banco bigint,
  nombre_banco character varying,
  saldo_inicial numeric,
  saldo_total numeric,
  saldo_actual numeric,
  total_recaudado numeric,
  ingresos numeric,
  ingresos_retenido numeric,
  gastos numeric,
  ganancia numeric,
  ganancia_retenido numeric,
  salida numeric,
  operaciones integer,
  id_estado bigint,
  nombre_estado character varying,
  id_usuario bigint,
  nombre_usuario character varying,
  fecha_apertura timestamp with time zone,
  fecha_cierre timestamp with time zone,
  kpi_snapshot jsonb,
  fecha_registro timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ch.id,
    ch.id_caja,
    ch.id_empresa,
    e.nombre AS nombre_empresa,
    ch.id_empresa_cuenta_bancaria,
    ecb.id_banco,
    b.nombre AS nombre_banco,
    ch.saldo_inicial,
    ch.saldo_total,
    ch.saldo_actual,
    CASE
      WHEN COALESCE(recaudacion.movimientos, 0) > 0
        THEN COALESCE(recaudacion.total_recaudado, 0)
      ELSE COALESCE(
        NULLIF(ch.kpi_snapshot ->> 'total_recaudado', '')::numeric,
        ch.total_recaudado,
        0
      )
    END AS total_recaudado,
    COALESCE(
      NULLIF(ch.kpi_snapshot ->> 'ingresos', '')::numeric,
      ch.ingresos,
      mov.ingresos,
      0
    ) AS ingresos,
    ch.ingresos_retenido,
    ch.gastos,
    ch.ganancia,
    ch.ganancia_retenido,
    ch.salida,
    ch.operaciones,
    ch.id_estado,
    est.nombre AS nombre_estado,
    ch.id_usuario,
    u.nombre AS nombre_usuario,
    ch.fecha_apertura,
    ch.fecha_cierre,
    ch.kpi_snapshot,
    ch.fecha_registro
  FROM public.tb_caja_operativa_cierre ch
  JOIN public.tb_empresa e ON e.id = ch.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = ch.id_empresa_cuenta_bancaria
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  JOIN public.tb_estado est ON est.id = ch.id_estado
  LEFT JOIN public.tb_usuario u ON u.id = ch.id_usuario
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(COALESCE(oc.monto_ingreso, 0)), 0) AS ingresos
    FROM public.tb_operacion_caja oc
    LEFT JOIN public.tb_operacion_proceso op ON op.id = oc.id_operacion_proceso
    WHERE oc.id_caja_cierre = ch.id
      AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
      AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) <> 'RETENIDO'
      AND COALESCE(op.flag_retenido, false) = false
      AND UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) NOT IN ('EFECTIVIZACION', 'PAGO DEUDA')
      AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) NOT IN (
        'EXCEL',
        'EXCEL_GANANCIA',
        'OPERACION_PROCESO',
        'PAGO_DEUDA',
        'PAGO_DEUDA_RETORNO',
        'PAGO_DEUDA_DIRECTO',
        'PAGO_DEUDA_COMISION'
      )
  ) mov ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::integer AS movimientos,
      COALESCE(SUM(
        CASE
          WHEN UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
            AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) <> 'RETENIDO'
            AND COALESCE(op.flag_retenido, false) = false
            AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) IN (
              'EFECTIVIZACION',
              'PAGO_DEUDA',
              'PAGO_DEUDA_DEVOLUCION',
              'PAGO_DEUDA_COMISION'
            )
          THEN COALESCE(oc.monto_ingreso, 0)
          ELSE 0
        END
      ), 0) AS total_recaudado
    FROM public.tb_operacion_caja oc
    LEFT JOIN public.tb_operacion_proceso op ON op.id = oc.id_operacion_proceso
    WHERE oc.id_caja_cierre = ch.id
  ) recaudacion ON true
  WHERE (p_id IS NULL OR ch.id = p_id)
    AND (p_id_caja IS NULL OR ch.id_caja = p_id_caja)
    AND (p_id_empresa IS NULL OR ch.id_empresa = p_id_empresa)
  ORDER BY ch.fecha_cierre DESC, ch.id DESC;
END;
$$;

/*
Funcion: f_post_tb_caja_operativa_cierre
Objetivo:
  Ejecutar un cierre compacto de caja congelando su snapshot actual en
  tb_caja_operativa_cierre. Registra el cierre, reinicia la fecha_apertura y
  traslada una sola vez los gastos operacionales del ciclo a la caja viva.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_caja_operativa_cierre(
  p_id_caja bigint,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_kpi_snapshot jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caja record;
  v_historial_id bigint;
  v_result jsonb;
  v_kpi_snapshot jsonb;
  v_fecha_cierre timestamp with time zone := now();
  v_operaciones_congeladas integer := 0;
  v_operaciones_retenidas_congeladas integer := 0;
  v_movimientos_congelados integer := 0;
  v_movimientos_confirmados integer := 0;
  v_movimientos_abiertos integer := 0;
  v_movimientos_salida_retenidos integer := 0;
  v_total_recaudado numeric := 0;
  v_gastos_ciclo_cerrado numeric := 0;
  v_ingresos_retenidos_abiertos numeric := 0;
  v_ganancia_retenida_abierta numeric := 0;
BEGIN
  SELECT *
  INTO v_caja
  FROM public.tb_caja_operativa
  WHERE id = p_id_caja
  LIMIT 1;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La caja no existe.');
  END IF;

  -- Toda retencion no eliminada pertenece al cierre donde fue generada. Su
  -- estado puede seguir pendiente, pero no debe pasar al ciclo siguiente ni
  -- alimentar sus KPI.
  SELECT COALESCE(SUM(op.monto_deposito_cliente), 0)
  INTO v_ingresos_retenidos_abiertos
  FROM public.tb_operacion_proceso op
  WHERE COALESCE(op.flag_retenido, false) = true
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
    AND op.id_caja_cierre IS NULL
    AND op.id_empresa_ingreso = v_caja.id_empresa
    AND op.id_empresa_cuenta_ingreso = v_caja.id_empresa_cuenta_bancaria
    AND EXISTS (
      SELECT 1
      FROM public.tb_ruta_operacion_caja rc
      WHERE rc.id_empresa = v_caja.id_empresa
        AND rc.id_empresa_cuenta_bancaria = v_caja.id_empresa_cuenta_bancaria
        AND LOWER(rc.ruta) = LOWER(COALESCE(op.ruta_destino, op.ruta_origen))
        AND rc.id_estado = 1
    );

  SELECT COALESCE(SUM(oc.monto_ingreso), 0)
  INTO v_total_recaudado
  FROM public.tb_operacion_caja oc
  LEFT JOIN public.tb_operacion_proceso op
    ON op.id = oc.id_operacion_proceso
  WHERE oc.id_caja = p_id_caja
    AND oc.id_caja_cierre IS NULL
    AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
    AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) <> 'RETENIDO'
    AND COALESCE(op.flag_retenido, false) = false
    AND NOT (
      op.id IS NOT NULL
      AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) IN ('PENDIENTE', 'RECHAZADO')
    )
    AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) IN (
      'EFECTIVIZACION',
      'PAGO_DEUDA',
      'PAGO_DEUDA_DEVOLUCION',
      'PAGO_DEUDA_COMISION'
    );

  -- Los gastos de operaciones que se congelaran pertenecen al ciclo cerrado.
  -- Se trasladaran a la caja viva despues de crear el snapshot historico.
  SELECT COALESCE(SUM(COALESCE(oc.monto_gasto, 0)), 0)
  INTO v_gastos_ciclo_cerrado
  FROM public.tb_operacion_caja oc
  LEFT JOIN public.tb_operacion_proceso op
    ON op.id = oc.id_operacion_proceso
  WHERE oc.id_caja = p_id_caja
    AND oc.id_caja_cierre IS NULL
    AND oc.id_operacion_proceso IS NOT NULL
    AND NOT (
      COALESCE(op.flag_retenido, false) = true
      AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
      AND oc.fecha_registro < COALESCE(v_caja.fecha_apertura, '-infinity'::timestamptz)
    )
    AND NOT (
      UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) IN ('PENDIENTE', 'RECHAZADO')
    );

  IF COALESCE(v_caja.saldo_actual, 0) - v_gastos_ciclo_cerrado < 0 THEN
    RETURN jsonb_build_object(
      'error', 'El gasto operacional del ciclo deja la caja posterior con saldo negativo.',
      'codigo', 'SALDO_INSUFICIENTE',
      'id_caja', p_id_caja,
      'saldo_disponible', COALESCE(v_caja.saldo_actual, 0),
      'gasto_operacional', v_gastos_ciclo_cerrado
    );
  END IF;

  v_kpi_snapshot := COALESCE(
    p_kpi_snapshot,
    jsonb_build_object(
      'saldo_inicial', v_caja.saldo_inicial,
      'saldo_total', v_caja.saldo_total,
      'total_recaudado', v_total_recaudado,
      'ingresos', COALESCE(v_caja.ingresos, 0),
      'ingresos_retenido', COALESCE(v_caja.ingresos_retenido, 0),
      'gastos', COALESCE(v_caja.gastos, 0),
      'ganancia', COALESCE(v_caja.ganancia, 0),
      'ganancia_retenido', COALESCE(v_caja.ganancia_retenido, 0),
      'salida', COALESCE(v_caja.salida, 0),
      'operaciones', COALESCE(v_caja.operaciones, 0)
    )
  ) || jsonb_build_object(
    'total_recaudado', v_total_recaudado,
    'ingresos_retenidos', v_ingresos_retenidos_abiertos,
    'ingresos_retenido', v_ingresos_retenidos_abiertos
  );

  INSERT INTO public.tb_caja_operativa_cierre (
    id_caja,
    id_empresa,
    id_empresa_cuenta_bancaria,
    saldo_inicial,
    saldo_total,
    saldo_actual,
    total_recaudado,
    ingresos,
    ingresos_retenido,
    gastos,
    ganancia,
    ganancia_retenido,
    salida,
    operaciones,
    id_estado,
    id_usuario,
    fecha_apertura,
    fecha_cierre,
    kpi_snapshot
  )
  VALUES (
    v_caja.id,
    v_caja.id_empresa,
    v_caja.id_empresa_cuenta_bancaria,
    v_caja.saldo_inicial,
    v_caja.saldo_total,
    v_caja.saldo_actual,
    COALESCE(v_total_recaudado, 0),
    COALESCE(v_caja.ingresos, 0),
    COALESCE(v_ingresos_retenidos_abiertos, 0),
    COALESCE(v_caja.gastos, 0),
    COALESCE(v_caja.ganancia, 0),
    COALESCE(v_caja.ganancia_retenido, 0),
    COALESCE(v_caja.salida, 0),
    COALESCE(v_caja.operaciones, 0),
    COALESCE(p_id_estado, v_caja.id_estado),
    COALESCE(p_id_usuario, v_caja.id_usuario),
    v_caja.fecha_apertura,
    v_fecha_cierre,
    v_kpi_snapshot
  )
  RETURNING id INTO v_historial_id;

  UPDATE public.tb_operacion_proceso op
  SET id_caja_cierre = v_historial_id,
      fecha_caja_cierre = v_fecha_cierre
  WHERE op.id_caja_cierre IS NULL
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
    AND COALESCE(op.flag_retenido, false) = false
    AND (
      (
        op.id_empresa_ingreso = v_caja.id_empresa
        AND op.id_empresa_cuenta_ingreso = v_caja.id_empresa_cuenta_bancaria
      )
      OR (
        op.id_empresa_salida = v_caja.id_empresa
        AND op.id_empresa_cuenta_salida = v_caja.id_empresa_cuenta_bancaria
      )
    );

  GET DIAGNOSTICS v_operaciones_congeladas = ROW_COUNT;

  -- Congelar toda retencion no eliminada, sea Pagado o Pendiente. La
  -- operacion conserva su estado y flag_retenido; solo se fija su cierre.
  UPDATE public.tb_operacion_proceso op
  SET id_caja_cierre = v_historial_id,
      fecha_caja_cierre = v_fecha_cierre
  WHERE op.id_caja_cierre IS NULL
    AND COALESCE(op.flag_retenido, false) = true
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
    AND (
      (
        op.id_empresa_ingreso = v_caja.id_empresa
        AND op.id_empresa_cuenta_ingreso = v_caja.id_empresa_cuenta_bancaria
      )
      OR (
        op.id_empresa_salida = v_caja.id_empresa
        AND op.id_empresa_cuenta_salida = v_caja.id_empresa_cuenta_bancaria
      )
    );

  GET DIAGNOSTICS v_operaciones_retenidas_congeladas = ROW_COUNT;
  v_operaciones_congeladas := v_operaciones_congeladas + v_operaciones_retenidas_congeladas;

  UPDATE public.tb_operacion_caja oc
  SET id_caja_cierre = v_historial_id,
      fecha_caja_cierre = v_fecha_cierre
  FROM public.tb_operacion_proceso op
  WHERE oc.id_caja_cierre IS NULL
    AND oc.id_caja = p_id_caja
    AND oc.id_operacion_proceso = op.id
    AND op.id_caja_cierre = v_historial_id
    AND NOT (
      COALESCE(op.flag_retenido, false) = true
      AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
    );

  GET DIAGNOSTICS v_movimientos_congelados = ROW_COUNT;

  UPDATE public.tb_operacion_caja oc
  SET id_caja_cierre = v_historial_id,
      fecha_caja_cierre = v_fecha_cierre
  WHERE oc.id_caja_cierre IS NULL
    AND oc.id_caja = p_id_caja
    AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) = 'CONFIRMADO';

  GET DIAGNOSTICS v_movimientos_confirmados = ROW_COUNT;
  v_movimientos_congelados := v_movimientos_congelados + v_movimientos_confirmados;

  -- El movimiento de ingreso de una retencion pertenece al cierre donde se
  -- genero, aunque la operacion continue pendiente. La operacion permanece
  -- abierta para atencion, pero su ingreso no pasa a la caja viva siguiente.
  UPDATE public.tb_operacion_caja oc
  SET id_caja_cierre = v_historial_id,
      fecha_caja_cierre = v_fecha_cierre
  FROM public.tb_operacion_proceso op
  WHERE oc.id_caja_cierre IS NULL
    AND oc.id_caja = p_id_caja
    AND oc.id_operacion_proceso = op.id
    AND COALESCE(op.flag_retenido, false) = true
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
    AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO';

  GET DIAGNOSTICS v_movimientos_salida_retenidos = ROW_COUNT;
  v_movimientos_congelados := v_movimientos_congelados + v_movimientos_salida_retenidos;

  -- El ingreso de una efectivizacion pendiente tambien pertenece al cierre
  -- donde fue registrado. La operacion queda abierta para ser atendida en el
  -- siguiente ciclo, pero el movimiento no debe alimentar su recaudacion.
  UPDATE public.tb_operacion_caja oc
  SET id_caja_cierre = v_historial_id,
      fecha_caja_cierre = v_fecha_cierre
  FROM public.tb_operacion_proceso op
  WHERE oc.id_caja_cierre IS NULL
    AND oc.id_caja = p_id_caja
    AND oc.id_operacion_proceso = op.id
    AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) = 'EFECTIVIZACION'
    AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) IN ('PENDIENTE', 'RECHAZADO')
    AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO';

  GET DIAGNOSTICS v_movimientos_abiertos = ROW_COUNT;
  v_movimientos_congelados := v_movimientos_congelados + v_movimientos_abiertos;

  -- Congelar cualquier movimiento abierto restante de la caja, incluidos
  -- movimientos manuales OTROS y TRANSFERENCIA INTERNA sin proceso asociado.
  -- Los ingresos retenidos ya fueron congelados en el bloque anterior.
  UPDATE public.tb_operacion_caja oc
  SET id_caja_cierre = v_historial_id,
      fecha_caja_cierre = v_fecha_cierre
  WHERE oc.id_caja_cierre IS NULL
    AND oc.id_caja = p_id_caja
    AND NOT (
      UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
      AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) = 'RETENIDO'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tb_operacion_proceso op
      WHERE op.id = oc.id_operacion_proceso
        AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) IN ('PENDIENTE', 'RECHAZADO')
    );

  GET DIAGNOSTICS v_movimientos_abiertos = ROW_COUNT;
  v_movimientos_congelados := v_movimientos_congelados + v_movimientos_abiertos;

  SELECT
    COALESCE(SUM(COALESCE(oc.monto_ingreso, 0)), 0),
    COALESCE(SUM(COALESCE(oc.monto_ganancia, 0)), 0)
  INTO v_ingresos_retenidos_abiertos, v_ganancia_retenida_abierta
  FROM public.tb_operacion_caja oc
  WHERE oc.id_caja = p_id_caja
    AND oc.id_caja_cierre IS NULL
    AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
    AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) = 'RETENIDO';

  UPDATE public.tb_caja_operativa
  SET saldo_inicial = 0,
      saldo_actual = 0,
      saldo_total = 0,
      total_recaudado = 0,
      ingresos = 0,
      ingresos_retenido = 0,
      gastos = 0,
      ganancia = 0,
      ganancia_retenido = 0,
      salida = 0,
      operaciones = 0,
      id_usuario = COALESCE(p_id_usuario, id_usuario),
      fecha_apertura = now()
  WHERE id = p_id_caja;

  -- El snapshot anterior queda intacto. El gasto del ciclo cerrado impacta
  -- una sola vez sobre la caja viva mediante un movimiento administrativo.
  IF v_gastos_ciclo_cerrado > 0 THEN
    PERFORM public.f_post_tb_operacion_caja(
      p_id_caja := p_id_caja,
      p_tipo_origen := 'GASTO OPERACIONAL CIERRE',
      p_tipo_movimiento := 'SALIDA',
      p_detalle := format(
        'Gasto operacional trasladado del cierre %s: %s',
        v_historial_id,
        v_gastos_ciclo_cerrado
      ),
      p_monto_salida := v_gastos_ciclo_cerrado,
      p_monto_gasto := 0,
      p_monto_ingreso := 0,
      p_monto_ganancia := 0,
      p_flag_contabiliza_operacion := false,
      p_id_usuario := p_id_usuario,
      p_nombre_usuario := NULL
    );
  END IF;

  SELECT to_jsonb(x)
  INTO v_result
  FROM public.f_get_tb_caja_operativa_cierre(p_id := v_historial_id) AS x
  LIMIT 1;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(r.ruta, COALESCE(p_id_usuario, v_caja.id_usuario))
  FROM (
    SELECT DISTINCT rc.ruta
    FROM public.tb_ruta_operacion_caja rc
    WHERE rc.id_empresa = v_caja.id_empresa
      AND rc.id_empresa_cuenta_bancaria = v_caja.id_empresa_cuenta_bancaria
  ) r;

  RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object(
    'operaciones_congeladas', v_operaciones_congeladas,
    'movimientos_congelados', v_movimientos_congelados
  );
END;
$$;

/*
Funcion: f_delete_tb_caja_operativa_cierre_ultimo_dia
Objetivo:
  Reabrir el ultimo cierre del dia de una caja, devolviendo operaciones y
  movimientos al ciclo actual y restaurando la caja viva desde el snapshot.
*/
CREATE OR REPLACE FUNCTION public.f_delete_tb_caja_operativa_cierre_ultimo_dia(
  p_id_caja bigint,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cierre record;
  v_caja record;
  v_operaciones_reabiertas integer := 0;
  v_movimientos_reabiertos integer := 0;
  v_retenciones_revertidas integer := 0;
BEGIN
  SELECT ch.*
  INTO v_cierre
  FROM public.tb_caja_operativa_cierre ch
  WHERE ch.id_caja = p_id_caja
  ORDER BY ch.fecha_cierre DESC, ch.id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_cierre.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No existe un cierre para reabrir.');
  END IF;

  IF v_cierre.fecha_cierre::date <> current_date THEN
    RETURN jsonb_build_object('error', 'Solo se puede reabrir el ultimo cierre del dia actual.');
  END IF;

  SELECT *
  INTO v_caja
  FROM public.tb_caja_operativa
  WHERE id = p_id_caja
  LIMIT 1
  FOR UPDATE;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La caja no existe.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja oc
    WHERE oc.id_caja = p_id_caja
      AND oc.id_caja_cierre IS NULL
      AND oc.fecha_registro > v_cierre.fecha_cierre
      AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) <> 'GASTO OPERACIONAL CIERRE'
  ) THEN
    RETURN jsonb_build_object('error', 'No se puede reabrir el cierre porque existen movimientos posteriores en la caja.');
  END IF;

  -- El movimiento administrativo se elimina junto con el ultimo cierre,
  -- despues de validar que no existan movimientos operativos posteriores.
  DELETE FROM public.tb_operacion_caja
  WHERE id_caja = p_id_caja
    AND id_caja_cierre IS NULL
    AND UPPER(BTRIM(COALESCE(tipo_origen, ''))) = 'GASTO OPERACIONAL CIERRE'
    AND fecha_registro >= v_cierre.fecha_cierre;

  v_retenciones_revertidas := 0;

  UPDATE public.tb_operacion_proceso
  SET id_caja_cierre = NULL,
      fecha_caja_cierre = NULL
  WHERE id_caja_cierre = v_cierre.id;

  GET DIAGNOSTICS v_operaciones_reabiertas = ROW_COUNT;

  UPDATE public.tb_operacion_caja
  SET id_caja_cierre = NULL,
      fecha_caja_cierre = NULL
  WHERE id_caja_cierre = v_cierre.id;

  GET DIAGNOSTICS v_movimientos_reabiertos = ROW_COUNT;

  UPDATE public.tb_caja_operativa
  SET saldo_inicial = v_cierre.saldo_inicial,
      saldo_total = v_cierre.saldo_total,
      saldo_actual = v_cierre.saldo_actual,
      total_recaudado = v_cierre.total_recaudado,
      ingresos = v_cierre.ingresos,
      ingresos_retenido = v_cierre.ingresos_retenido,
      gastos = v_cierre.gastos,
      ganancia = v_cierre.ganancia,
      ganancia_retenido = v_cierre.ganancia_retenido,
      salida = v_cierre.salida,
      operaciones = v_cierre.operaciones,
      id_usuario = COALESCE(p_id_usuario, id_usuario),
      fecha_apertura = v_cierre.fecha_apertura
  WHERE id = p_id_caja;

  DELETE FROM public.tb_caja_operativa_cierre
  WHERE id = v_cierre.id;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(r.ruta, COALESCE(p_id_usuario, v_cierre.id_usuario))
  FROM (
    SELECT DISTINCT rc.ruta
    FROM public.tb_ruta_operacion_caja rc
    WHERE rc.id_empresa = v_cierre.id_empresa
      AND rc.id_empresa_cuenta_bancaria = v_cierre.id_empresa_cuenta_bancaria
  ) r;

  RETURN jsonb_build_object(
    'id_cierre_reabierto', v_cierre.id,
    'id_caja', p_id_caja,
    'operaciones_reabiertas', v_operaciones_reabiertas,
    'movimientos_reabiertos', v_movimientos_reabiertos,
    'retenciones_revertidas', v_retenciones_revertidas
  );
END;
$$;

/*
Funcion: f_get_reporte_cierre
Objetivo:
  Devolver todos los datos necesarios para generar el reporte de cierre en
  PDF/Excel. Organizado por secciones: KPI, Efectivizaciones Pagado,
  Pago Deuda, Movimientos (OTRO) y Retenciones.

  Fuentes alineadas con la web:
    - Efectivizacion y Pago Deuda: tb_operacion_proceso
    - Movimientos OTRO: tb_operacion_caja
    - Retenciones: tb_operacion_proceso
    - KPI: tb_caja_operativa_cierre (historico) o tb_ruta_operacion_kpi (hoy)
*/
CREATE OR REPLACE FUNCTION public.f_get_reporte_cierre(
  p_id_caja bigint,
  p_id_empresa bigint DEFAULT NULL,
  p_ruta character varying DEFAULT NULL,
  p_id_caja_cierre bigint DEFAULT NULL,
  p_fecha_cierre date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caja record;
  v_ruta character varying;
  v_nombre_empresa character varying;
  v_nombre_banco character varying;
  v_result jsonb;
  v_efectivizacion jsonb;
  v_efectivizacion_todas jsonb;
  v_efectivizacion_pendientes jsonb;
  v_derivados jsonb;
  v_derivados_todos jsonb;
  v_derivados_pendientes jsonb;
  v_pago_deuda jsonb;
  v_pago_deuda_todos jsonb;
  v_pago_deuda_pendientes jsonb;
  v_pos jsonb;
  v_pos_todas jsonb;
  v_pos_pendientes jsonb;
  v_movimientos jsonb;
  v_retenciones jsonb;
  v_retenciones_pagadas jsonb;
  v_retenciones_pendientes jsonb;
  v_kpi jsonb;
  v_fecha_cierre_ts timestamp with time zone;
BEGIN
  SELECT *
  INTO v_caja
  FROM public.tb_caja_operativa
  WHERE id = p_id_caja
  LIMIT 1;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La caja no existe.');
  END IF;

  SELECT rc.ruta, e.nombre, b.nombre
  INTO v_ruta, v_nombre_empresa, v_nombre_banco
  FROM public.tb_ruta_operacion_caja rc
  JOIN public.tb_empresa e ON e.id = v_caja.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = v_caja.id_empresa_cuenta_bancaria
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  WHERE rc.id_empresa = v_caja.id_empresa
    AND rc.id_empresa_cuenta_bancaria = v_caja.id_empresa_cuenta_bancaria
  LIMIT 1;

  v_ruta := COALESCE(p_ruta, v_ruta);

  SELECT fecha_cierre
  INTO v_fecha_cierre_ts
  FROM public.tb_caja_operativa_cierre
  WHERE id_caja = p_id_caja
    AND fecha_cierre::date = p_fecha_cierre
  ORDER BY fecha_cierre DESC
  LIMIT 1;

  -- EFECTIVIZACION: operaciones normales y congeladas en la ruta de origen
  SELECT COALESCE(jsonb_agg(x ORDER BY operacion), '[]'::jsonb)
  INTO v_efectivizacion_todas
  FROM (
    SELECT
      op.tipo_facturacion AS facturacion,
      op.codigo_operacion_deposito_cliente AS operacion,
      op.dni_cliente AS dni,
      op.nombre_comunidad AS comunidad,
      COALESCE(op.monto_deposito_cliente, 0) AS deposito,
      COALESCE(op.comision_servicio, 0) AS porcentaje_comision,
      COALESCE(op.resultado_comision_servicio, 0) AS soles_comision,
      COALESCE(caja.monto_gasto, 0) AS gastos,
      COALESCE(caja.monto_ganancia, 0) AS ganancia,
      CASE
        WHEN op.flag_derivado = true
         AND LOWER(COALESCE(op.ruta_origen, '')) = LOWER(COALESCE(p_ruta, v_ruta))
        THEN 0
        ELSE COALESCE(op.monto_transferencia_cliente, 0)
      END AS transferencia,
      (
        op.flag_derivado = true
        AND LOWER(COALESCE(op.ruta_origen, '')) = LOWER(COALESCE(p_ruta, v_ruta))
      ) AS derivada_congelada,
      op.nombre_estado AS estado,
      op.fecha_deposito_cliente AS fecha
    FROM public.tb_operacion_proceso op
    LEFT JOIN LATERAL (
      SELECT
        SUM(COALESCE(oc.monto_gasto, 0)) AS monto_gasto,
        SUM(COALESCE(oc.monto_ganancia, 0)) AS monto_ganancia
      FROM public.tb_operacion_caja oc
      WHERE oc.id_operacion_proceso = op.id
        AND UPPER(COALESCE(oc.tipo_origen, '')) <> 'PAGO_DEUDA_COMISION'
    ) caja ON true
    WHERE UPPER(COALESCE(op.tipo_servicio, '')) = 'EFECTIVIZACION'
      AND op.id_estado <> 10
      AND (
        (
          op.flag_derivado = false
          AND (p_id_empresa IS NULL OR op.id_empresa_salida = p_id_empresa OR op.id_empresa_ingreso = p_id_empresa)
          AND (v_caja.id_empresa_cuenta_bancaria IS NULL OR op.id_empresa_cuenta_salida = v_caja.id_empresa_cuenta_bancaria OR op.id_empresa_cuenta_ingreso = v_caja.id_empresa_cuenta_bancaria)
          AND (p_ruta IS NULL OR op.ruta_destino = p_ruta)
          AND (
            (p_fecha_cierre IS NULL AND op.id_caja_cierre IS NULL)
            OR (v_fecha_cierre_ts IS NOT NULL AND op.id_caja_cierre IN (
              SELECT id FROM public.tb_caja_operativa_cierre
              WHERE id_caja = p_id_caja AND fecha_cierre::date = p_fecha_cierre
            ))
          )
        )
        OR (
          op.flag_derivado = true
          AND LOWER(COALESCE(op.ruta_origen, '')) = LOWER(COALESCE(p_ruta, v_ruta))
          AND (p_id_empresa IS NULL OR op.id_empresa_salida_origen = p_id_empresa)
          AND (v_caja.id_empresa_cuenta_bancaria IS NULL OR op.id_empresa_cuenta_salida_origen = v_caja.id_empresa_cuenta_bancaria)
        )
      )
  ) x;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'operacion'), '[]'::jsonb)
  INTO v_efectivizacion
  FROM jsonb_array_elements(v_efectivizacion_todas) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) = 'PAGADO';

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'operacion'), '[]'::jsonb)
  INTO v_efectivizacion_pendientes
  FROM jsonb_array_elements(v_efectivizacion_todas) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) <> 'PAGADO';

  -- DERIVADOS: operaciones que la ruta actual debe atender
  SELECT COALESCE(jsonb_agg(x ORDER BY operacion), '[]'::jsonb)
  INTO v_derivados_todos
  FROM (
    SELECT
      op.tipo_facturacion AS facturacion,
      op.ruta_origen AS derivo,
      op.codigo_operacion_deposito_cliente AS operacion,
      op.dni_cliente AS dni,
      op.nombre_comunidad AS comunidad,
      op.nombre_banco_empresa_cuenta_salida AS cuenta_cliente,
      COALESCE(op.monto_deposito_cliente, 0) AS monto,
      COALESCE(op.resultado_comision_servicio, 0) AS soles_comision,
      COALESCE(op.comision_servicio, 0) AS porcentaje_comision,
      COALESCE(op.monto_transferencia_cliente, 0) AS transferencia,
      op.nombre_estado AS estado,
      op.fecha_deposito_cliente AS fecha
    FROM public.tb_operacion_proceso op
    WHERE UPPER(COALESCE(op.tipo_servicio, '')) = 'EFECTIVIZACION'
      AND op.id_estado <> 10
      AND op.flag_derivado = true
      AND LOWER(COALESCE(op.ruta_destino, '')) = LOWER(COALESCE(p_ruta, v_ruta))
      AND (p_id_empresa IS NULL OR op.id_empresa_salida = p_id_empresa)
      AND (v_caja.id_empresa_cuenta_bancaria IS NULL OR op.id_empresa_cuenta_salida = v_caja.id_empresa_cuenta_bancaria)
      AND (
        (p_fecha_cierre IS NULL AND op.id_caja_cierre IS NULL)
        OR (v_fecha_cierre_ts IS NOT NULL AND op.id_caja_cierre IN (
          SELECT id FROM public.tb_caja_operativa_cierre
          WHERE id_caja = p_id_caja AND fecha_cierre::date = p_fecha_cierre
        ))
      )
  ) x;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'operacion'), '[]'::jsonb)
  INTO v_derivados
  FROM jsonb_array_elements(v_derivados_todos) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) = 'PAGADO';

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'operacion'), '[]'::jsonb)
  INTO v_derivados_pendientes
  FROM jsonb_array_elements(v_derivados_todos) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) <> 'PAGADO';

  -- PAGO DEUDA: operaciones de tipo pago deuda
  SELECT COALESCE(jsonb_agg(x ORDER BY operacion), '[]'::jsonb)
  INTO v_pago_deuda_todos
  FROM (
    SELECT
      op.codigo_operacion_deposito_cliente AS operacion,
      op.dni_cliente AS dni,
      op.nombre_empresa_salida AS empresa_salida,
      op.nombre_banco_empresa_cuenta_salida AS cuenta_salida,
      COALESCE(op.monto_transferencia_cliente, op.monto_deposito_cliente, 0) AS monto_transferencia,
      COALESCE(op.monto_transferencia_cliente, op.monto_deposito_cliente, 0) AS transferencia,
      COALESCE(pago_retorno.nombre_empresa_ingreso, op.nombre_empresa_ingreso) AS empresa_ingreso,
      COALESCE(pago_retorno.nombre_banco_empresa_cuenta_ingreso, op.nombre_banco_empresa_cuenta_ingreso) AS cuenta_ingreso,
      COALESCE(pago_retorno.monto_devolucion, op.monto_devuelto, 0) AS deposito,
      COALESCE(op.comision_servicio, 0) AS porcentaje_comision,
      COALESCE(op.resultado_comision_servicio, 0) AS soles_comision,
      op.nombre_estado AS estado,
      COALESCE(op.fecha_pagado, op.fecha_registro) AS fecha
    FROM public.tb_operacion_proceso op
    LEFT JOIN LATERAL (
      SELECT
        (ARRAY_AGG(r.nombre_empresa_ingreso ORDER BY r.fecha_deposito_cliente NULLS LAST, r.fecha_registro NULLS LAST, r.id))[1] AS nombre_empresa_ingreso,
        (ARRAY_AGG(r.nombre_banco_empresa_cuenta_ingreso ORDER BY r.fecha_deposito_cliente NULLS LAST, r.fecha_registro NULLS LAST, r.id))[1] AS nombre_banco_empresa_cuenta_ingreso,
        SUM(COALESCE(r.monto_deposito_cliente, r.monto_transferencia_cliente, 0)) AS monto_devolucion
      FROM public.tb_operacion_proceso r
      WHERE UPPER(COALESCE(r.tipo_flujo_pago_deuda, '')) = 'RETORNO'
        AND (
          r.id = op.id_operacion_match
          OR r.id_operacion_match = op.id
          OR r.id_operacion_padre = op.id
        )
    ) pago_retorno ON true
    WHERE UPPER(COALESCE(op.tipo_servicio, '')) = 'PAGO DEUDA'
      AND COALESCE(op.flag_retenido, false) = false
      AND (COALESCE(op.tipo_flujo_pago_deuda, '') = '' OR UPPER(op.tipo_flujo_pago_deuda) <> 'RETORNO')
      AND (p_id_empresa IS NULL OR op.id_empresa_salida = p_id_empresa)
      AND (
        v_caja.id_empresa_cuenta_bancaria IS NULL
        OR op.id_empresa_cuenta_salida = v_caja.id_empresa_cuenta_bancaria
      )
      AND (p_ruta IS NULL OR op.ruta_destino = p_ruta)
      AND (
        (p_fecha_cierre IS NULL AND op.id_caja_cierre IS NULL)
        OR (v_fecha_cierre_ts IS NOT NULL AND op.id_caja_cierre IN (
          SELECT id FROM public.tb_caja_operativa_cierre
          WHERE id_caja = p_id_caja AND fecha_cierre::date = p_fecha_cierre
        ))
      )
  ) x;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'operacion'), '[]'::jsonb)
  INTO v_pago_deuda
  FROM jsonb_array_elements(v_pago_deuda_todos) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) = 'PAGADO';

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'operacion'), '[]'::jsonb)
  INTO v_pago_deuda_pendientes
  FROM jsonb_array_elements(v_pago_deuda_todos) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) <> 'PAGADO';

  -- POS: operaciones originadas en POS y atendidas por la caja/ruta bancaria
  SELECT COALESCE(jsonb_agg(x ORDER BY operacion), '[]'::jsonb)
  INTO v_pos_todas
  FROM (
    SELECT
      op.codigo_operacion_deposito_cliente AS operacion,
      op.dni_cliente AS dni,
      op.nombre_empresa_salida AS empresa,
      op.nombre_banco_empresa_cuenta_salida AS cuenta,
      COALESCE(op.monto_deposito_cliente, 0) AS deposito,
      COALESCE(op.comision_servicio, 0) AS porcentaje_comision,
      COALESCE(op.resultado_comision_servicio, 0) AS soles_comision,
      COALESCE(op.monto_transferencia_cliente, 0) AS transferencia,
      op.nombre_estado AS estado,
      COALESCE(op.fecha_deposito_cliente, op.fecha_registro) AS fecha
    FROM public.tb_operacion_proceso op
    WHERE LOWER(COALESCE(op.ruta_origen, '')) = 'pos'
      AND op.id_estado <> 10
      AND (p_ruta IS NULL OR op.ruta_destino = p_ruta)
      AND (p_id_empresa IS NULL OR op.id_empresa_salida = p_id_empresa)
      AND (
        v_caja.id_empresa_cuenta_bancaria IS NULL
        OR op.id_empresa_cuenta_salida = v_caja.id_empresa_cuenta_bancaria
      )
      AND (
        (p_fecha_cierre IS NULL AND op.id_caja_cierre IS NULL)
        OR (v_fecha_cierre_ts IS NOT NULL AND op.id_caja_cierre IN (
          SELECT id FROM public.tb_caja_operativa_cierre
          WHERE id_caja = p_id_caja AND fecha_cierre::date = p_fecha_cierre
        ))
      )
  ) x;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'operacion'), '[]'::jsonb)
  INTO v_pos
  FROM jsonb_array_elements(v_pos_todas) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) = 'PAGADO';

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'operacion'), '[]'::jsonb)
  INTO v_pos_pendientes
  FROM jsonb_array_elements(v_pos_todas) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) <> 'PAGADO';

  -- MOVIMIENTOS: solo devolucion de pago deuda, otros y movimiento saldo
  SELECT COALESCE(jsonb_agg(x ORDER BY fecha_registro), '[]'::jsonb)
  INTO v_movimientos
  FROM (
    SELECT
      oc.tipo_origen,
      oc.tipo_movimiento,
      oc.dni_cliente,
      oc.codigo_operacion,
      oc.monto_ingreso,
      oc.monto_salida,
      oc.monto_gasto,
      oc.monto_ganancia,
      oc.detalle,
      oc.tipo_facturacion,
      oc.nombre_empresa,
      oc.nombre_banco,
      related.nombre_empresa AS nombre_empresa_relacionada,
      related.nombre_banco AS nombre_banco_relacionada,
      oc.fecha_registro
    FROM public.tb_operacion_caja oc
    LEFT JOIN public.tb_operacion_caja related
      ON related.id = oc.id_operacion_caja_relacionada
    WHERE oc.id_caja = p_id_caja
      AND REPLACE(UPPER(COALESCE(oc.tipo_origen, '')), '_', ' ') IN (
        'PAGO DEUDA COMISION',
        'OTROS',
        'TRANSFERENCIA INTERNA',
        'GASTO OPERACIONAL CIERRE'
      )
      AND UPPER(COALESCE(oc.nombre_estado, '')) <> 'RETENIDO'
      AND (
        (p_fecha_cierre IS NULL AND oc.id_caja_cierre IS NULL)
        OR (v_fecha_cierre_ts IS NOT NULL AND oc.id_caja_cierre IN (
          SELECT id FROM public.tb_caja_operativa_cierre
          WHERE id_caja = p_id_caja AND fecha_cierre::date = p_fecha_cierre
        ))
      )
  ) x;

  -- RETENCIONES: operaciones con flag_retenido = true.
  -- Se conserva el arreglo completo por compatibilidad y se separa por estado
  -- para que los reportes puedan distinguir pagadas de pendientes.
  SELECT COALESCE(jsonb_agg(x ORDER BY codigo_operacion_deposito_cliente), '[]'::jsonb)
  INTO v_retenciones
  FROM (
    SELECT
      op.codigo_operacion_deposito_cliente,
      op.dni_cliente,
      op.nombre_cliente,
      COALESCE(op.monto_transferencia_cliente, op.monto_deposito_cliente, 0) AS monto,
      op.nombre_estado AS estado,
      op.fecha_deposito_cliente,
      rl.fecha_corte AS fecha_corte_recaudacion,
      rl.fecha_estimada_abono,
      rl.fecha_liberacion AS fecha_liberacion_abono,
      false AS flag_liberable_abono,
      op.motivo_retencion,
      op.nombre_usuario_retiene,
      op.fecha_retencion,
      op.fecha_registro
    FROM public.tb_operacion_proceso op
    LEFT JOIN public.tb_recaudacion_lote_operacion rlo ON rlo.id_operacion_proceso = op.id
    LEFT JOIN public.tb_recaudacion_lote rl ON rl.id = rlo.id_lote
    WHERE op.flag_retenido = true
      AND op.id_estado <> 10
      AND (p_id_empresa IS NULL OR op.id_empresa_salida = p_id_empresa)
      AND (p_ruta IS NULL OR op.ruta_destino = p_ruta)
      AND (
        (p_fecha_cierre IS NULL AND op.id_caja_cierre IS NULL)
        OR (v_fecha_cierre_ts IS NOT NULL AND op.id_caja_cierre IN (
          SELECT id FROM public.tb_caja_operativa_cierre
          WHERE id_caja = p_id_caja AND fecha_cierre::date = p_fecha_cierre
        ))
      )
  ) x;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'codigo_operacion_deposito_cliente'), '[]'::jsonb)
  INTO v_retenciones_pagadas
  FROM jsonb_array_elements(v_retenciones) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) = 'PAGADO';

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'codigo_operacion_deposito_cliente'), '[]'::jsonb)
  INTO v_retenciones_pendientes
  FROM jsonb_array_elements(v_retenciones) item
  WHERE UPPER(BTRIM(COALESCE(item->>'estado', ''))) <> 'PAGADO';

  -- KPI
  IF p_fecha_cierre IS NOT NULL AND v_fecha_cierre_ts IS NOT NULL THEN
    SELECT row_to_json(k)::jsonb
    INTO v_kpi
    FROM (
      SELECT ch.saldo_inicial AS caja_inicial, ch.saldo_actual AS caja_actual,
             ch.total_recaudado, COALESCE(mov.ingresos, 0) AS ingresos, ch.salida AS salidas,
             ch.gastos AS gastos_operacionales, ch.ganancia AS ganancias,
             ch.ingresos_retenido AS ingresos_retenidos
      FROM public.tb_caja_operativa_cierre ch
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(COALESCE(oc.monto_ingreso, 0)), 0) AS ingresos
        FROM public.tb_operacion_caja oc
        LEFT JOIN public.tb_operacion_proceso op ON op.id = oc.id_operacion_proceso
        WHERE oc.id_caja_cierre = ch.id
          AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
          AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) <> 'RETENIDO'
          AND UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) NOT IN ('EFECTIVIZACION', 'PAGO DEUDA')
          AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) NOT IN (
            'EXCEL',
            'EXCEL_GANANCIA',
            'OPERACION_PROCESO',
            'PAGO_DEUDA',
            'PAGO_DEUDA_RETORNO',
            'PAGO_DEUDA_DIRECTO',
            'PAGO_DEUDA_COMISION'
          )
      ) mov ON true
      WHERE ch.id_caja = p_id_caja
        AND ch.fecha_cierre::date = p_fecha_cierre
      ORDER BY ch.fecha_cierre DESC
      LIMIT 1
    ) k;
  ELSE
    SELECT row_to_json(k)::jsonb
    INTO v_kpi
    FROM (
      SELECT
        c.saldo_inicial AS caja_inicial,
        c.saldo_actual AS caja_actual,
        c.total_recaudado,
        COALESCE(mov.ingresos, 0) AS ingresos,
        c.salida AS salidas,
        c.gastos AS gastos_operacionales,
        c.ganancia AS ganancias,
        c.ingresos_retenido AS ingresos_retenidos,
        COALESCE(k.pendiente_depositar, 0) AS pendiente_depositar,
        COALESCE(pendientes.operaciones_pendientes, 0) AS operaciones_pendientes,
        COALESCE(k.total_efectivizacion, 0) AS total_efectivizacion,
        COALESCE(k.total_pago_deuda, 0) AS total_pago_deuda
      FROM public.tb_caja_operativa c
      LEFT JOIN public.tb_ruta_operacion_kpi k ON k.ruta = COALESCE(p_ruta, v_ruta)
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer AS operaciones_pendientes
        FROM public.tb_operacion_proceso op
        WHERE COALESCE(op.ruta_destino, op.ruta_origen) = COALESCE(p_ruta, v_ruta)
          AND op.id_caja_cierre IS NULL
          AND COALESCE(op.id_estado, 0) <> 10
          AND public.f_get_tb_operacion_proceso_flag_pendiente_kpi(op.nombre_estado, op.flag_retenido)
          AND (
            p_id_empresa IS NULL
            OR op.id_empresa_ingreso = p_id_empresa
            OR op.id_empresa_salida = p_id_empresa
          )
          AND (
            v_caja.id_empresa_cuenta_bancaria IS NULL
            OR op.id_empresa_cuenta_ingreso = v_caja.id_empresa_cuenta_bancaria
            OR op.id_empresa_cuenta_salida = v_caja.id_empresa_cuenta_bancaria
          )
      ) pendientes ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(COALESCE(oc.monto_ingreso, 0)), 0) AS ingresos
        FROM public.tb_operacion_caja oc
        LEFT JOIN public.tb_operacion_proceso op ON op.id = oc.id_operacion_proceso
        WHERE oc.id_caja = c.id
          AND oc.id_caja_cierre IS NULL
          AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
          AND UPPER(BTRIM(COALESCE(oc.nombre_estado, ''))) <> 'RETENIDO'
          AND UPPER(BTRIM(COALESCE(op.tipo_servicio, op.nombre_codigo_servicio, ''))) NOT IN ('EFECTIVIZACION', 'PAGO DEUDA')
          AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) NOT IN (
            'EXCEL',
            'EXCEL_GANANCIA',
            'OPERACION_PROCESO',
            'PAGO_DEUDA',
            'PAGO_DEUDA_RETORNO',
            'PAGO_DEUDA_DIRECTO',
            'PAGO_DEUDA_COMISION'
          )
      ) mov ON true
      WHERE c.id = p_id_caja
      LIMIT 1
    ) k;
  END IF;

  v_result := jsonb_build_object(
    'empresa', v_nombre_empresa,
    'banco', v_nombre_banco,
    'fecha_cierre', COALESCE(
      v_fecha_cierre_ts,
      (SELECT fecha_cierre FROM public.tb_caja_operativa_cierre WHERE id = p_id_caja_cierre LIMIT 1),
      v_caja.fecha_apertura
    ),
    'kpi', COALESCE(v_kpi, '{}'::jsonb),
    'efectivizacion', v_efectivizacion,
    'efectivizacion_pendientes', COALESCE(v_efectivizacion_pendientes, '[]'::jsonb),
    'derivados', v_derivados,
    'derivados_pendientes', COALESCE(v_derivados_pendientes, '[]'::jsonb),
    'pago_deuda', v_pago_deuda,
    'pago_deuda_pendientes', COALESCE(v_pago_deuda_pendientes, '[]'::jsonb),
    'pos', v_pos,
    'pos_pendientes', COALESCE(v_pos_pendientes, '[]'::jsonb),
    'movimientos', v_movimientos,
    'retenciones', v_retenciones,
    'retenciones_pagadas', COALESCE(v_retenciones_pagadas, '[]'::jsonb),
    'retenciones_pendientes', COALESCE(v_retenciones_pendientes, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 18. TB_CATEGORIA_OPERACION_CAJA
-- ============================================================================

/*
Tabla: tb_categoria_operacion_caja
Objetivo:
  Catalogo compacto para clasificar ingresos y salidas manuales de caja.
  Tambien puede reutilizarse para agrupar movimientos internos no ligados a una
  operacion comercial.
*/
CREATE TABLE IF NOT EXISTS public.tb_categoria_operacion_caja (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre character varying NOT NULL,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_categoria_operacion_caja_pkey PRIMARY KEY (id),
  CONSTRAINT tb_categoria_operacion_caja_nombre_unique UNIQUE (nombre),
  CONSTRAINT tb_categoria_operacion_caja_fk_estado FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_categoria_operacion_caja_fk_usuario FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id)
);

/*
Funcion: f_get_tb_categoria_operacion_caja
Objetivo:
  Consultar categorias de movimiento disponibles para los flujos manuales de
  caja.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_categoria_operacion_caja(
  p_id bigint DEFAULT NULL,
  p_nombre character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'nombre', t.nombre,
    'id_estado', t.id_estado,
    'nombre_estado', est.nombre,
    'id_usuario', t.id_usuario,
    'nombre_usuario', u.nombre,
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_categoria_operacion_caja t
  JOIN public.tb_estado est ON est.id = t.id_estado
  LEFT JOIN public.tb_usuario u ON u.id = t.id_usuario
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_nombre IS NULL OR t.nombre ILIKE '%' || p_nombre || '%')
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
  ORDER BY t.nombre, t.id;
$$;

/*
Funcion: f_post_tb_categoria_operacion_caja
Objetivo:
  Crear una categoria de movimiento para ingresos o salidas manuales.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_categoria_operacion_caja(
  p_nombre character varying,
  p_id_estado bigint,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.tb_categoria_operacion_caja (
    nombre,
    id_estado,
    id_usuario
  )
  VALUES (
    p_nombre,
    p_id_estado,
    p_id_usuario
  )
  RETURNING id INTO v_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_categoria_operacion_caja(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_categoria_operacion_caja
Objetivo:
  Editar una categoria de movimiento existente.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_categoria_operacion_caja(
  p_id bigint,
  p_nombre character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_categoria_operacion_caja
  SET nombre = COALESCE(p_nombre, nombre),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_categoria_operacion_caja(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- 19. TB_OPERACION_CAJA
-- ============================================================================

/*
Tabla: tb_operacion_caja
Objetivo:
  Libro operativo compacto de caja. Cada fila impacta exactamente una caja y
  sirve para registrar:
    - efectivizacion
    - pago de deuda
    - transferencias entre cajas
    - ingresos manuales
    - salidas manuales
    - ajustes y retenciones

Diseno:
  - una transferencia entre cajas se modela con dos filas, una SALIDA y una
    INGRESO, enlazadas por id_operacion_caja_relacionada;
  - la trazabilidad comercial sigue viviendo en tb_operacion_proceso;
  - esta tabla guarda el resultado financiero final que impacta la caja.
*/
CREATE TABLE IF NOT EXISTS public.tb_operacion_caja (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_caja bigint NOT NULL,
  id_operacion_caja_relacionada bigint,
  id_operacion_proceso bigint,
  tipo_origen character varying NOT NULL,
  tipo_movimiento character varying NOT NULL,
  id_codigo_servicio bigint,
  nombre_codigo_servicio character varying,
  dni_cliente character varying,
  nombre_cliente character varying,
  codigo_operacion character varying,
  id_categoria_movimiento bigint,
  nombre_categoria_movimiento character varying,
  detalle character varying,
  id_empresa bigint NOT NULL,
  nombre_empresa character varying NOT NULL,
  id_empresa_cuenta_bancaria bigint NOT NULL,
  id_banco bigint NOT NULL,
  nombre_banco character varying NOT NULL,
  id_banco_tercero bigint,
  nombre_banco_tercero character varying,
  monto_ingreso numeric NOT NULL DEFAULT 0,
  monto_gasto numeric NOT NULL DEFAULT 0,
  monto_ganancia numeric NOT NULL DEFAULT 0,
  monto_salida numeric NOT NULL DEFAULT 0,
  flag_contabiliza_operacion boolean NOT NULL DEFAULT true,
  saldo_anterior numeric NOT NULL DEFAULT 0,
  saldo_actual numeric NOT NULL DEFAULT 0,
  id_estado bigint NOT NULL,
  nombre_estado character varying,
  id_usuario bigint,
  nombre_usuario character varying,
  tipo_facturacion character varying DEFAULT 'Boleta',
  id_caja_cierre bigint,
  fecha_caja_cierre timestamp with time zone,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_operacion_caja_pkey PRIMARY KEY (id),
  CONSTRAINT tb_operacion_caja_tipo_mov_check CHECK (UPPER(tipo_movimiento) IN ('INGRESO', 'SALIDA')),
  CONSTRAINT tb_operacion_caja_monto_ingreso_check CHECK (monto_ingreso >= 0),
  CONSTRAINT tb_operacion_caja_monto_gasto_check CHECK (monto_gasto >= 0),
  CONSTRAINT tb_operacion_caja_monto_ganancia_check CHECK (monto_ganancia >= 0),
  CONSTRAINT tb_operacion_caja_monto_salida_check CHECK (monto_salida >= 0),
  CONSTRAINT tb_operacion_caja_saldo_anterior_check CHECK (saldo_anterior >= 0),
  CONSTRAINT tb_operacion_caja_saldo_actual_check CHECK (saldo_actual >= 0),
  CONSTRAINT tb_operacion_caja_fk_caja FOREIGN KEY (id_caja) REFERENCES public.tb_caja_operativa(id),
  CONSTRAINT tb_operacion_caja_fk_relacionada FOREIGN KEY (id_operacion_caja_relacionada) REFERENCES public.tb_operacion_caja(id),
  CONSTRAINT tb_operacion_caja_fk_operacion_proceso FOREIGN KEY (id_operacion_proceso) REFERENCES public.tb_operacion_proceso(id),
  CONSTRAINT tb_operacion_caja_fk_categoria FOREIGN KEY (id_categoria_movimiento) REFERENCES public.tb_categoria_operacion_caja(id),
  CONSTRAINT tb_operacion_caja_fk_estado FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_operacion_caja_fk_usuario FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_caja' AND column_name = 'id_caja_cierre'
  ) THEN
    ALTER TABLE public.tb_operacion_caja ADD COLUMN id_caja_cierre bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_caja' AND column_name = 'fecha_caja_cierre'
  ) THEN
    ALTER TABLE public.tb_operacion_caja ADD COLUMN fecha_caja_cierre timestamp with time zone;
  END IF;
END;
$$;

/*
Funcion: f_get_tb_operacion_caja
Objetivo:
  Consultar el libro compacto de caja con filtros por caja, empresa, operaciÃ³n,
  tipo y rango de fechas.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_caja(
  p_id bigint DEFAULT NULL,
  p_id_caja bigint DEFAULT NULL,
  p_id_empresa bigint DEFAULT NULL,
  p_id_operacion_proceso bigint DEFAULT NULL,
  p_tipo_origen character varying DEFAULT NULL,
  p_tipo_movimiento character varying DEFAULT NULL,
  p_id_categoria_movimiento bigint DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_codigo_operacion character varying DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_fecha_desde timestamp with time zone DEFAULT NULL,
  p_fecha_hasta timestamp with time zone DEFAULT NULL,
  p_id_caja_cierre bigint DEFAULT NULL,
  p_fecha_caja_cierre_desde timestamp with time zone DEFAULT NULL,
  p_fecha_caja_cierre_hasta timestamp with time zone DEFAULT NULL,
  p_incluir_cerradas boolean DEFAULT false
)
RETURNS SETOF jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'id_caja', t.id_caja,
    'id_operacion_caja_relacionada', t.id_operacion_caja_relacionada,
    'nombre_empresa_relacionada', related.nombre_empresa,
    'nombre_banco_relacionada', related.nombre_banco,
    'id_operacion_proceso', t.id_operacion_proceso,
    'tipo_origen', t.tipo_origen,
    'tipo_movimiento', t.tipo_movimiento,
    'tipo_servicio', op.tipo_servicio,
    'tipo_recaudacion_sf', op.tipo_recaudacion_sf,
    'id_codigo_servicio', t.id_codigo_servicio,
    'nombre_codigo_servicio', t.nombre_codigo_servicio,
    'dni_cliente', t.dni_cliente,
    'nombre_cliente', t.nombre_cliente,
    'codigo_operacion', t.codigo_operacion,
    'id_categoria_movimiento', t.id_categoria_movimiento,
    'nombre_categoria_movimiento', t.nombre_categoria_movimiento,
    'detalle', t.detalle,
    'id_empresa', t.id_empresa,
    'nombre_empresa', t.nombre_empresa,
    'id_empresa_cuenta_bancaria', t.id_empresa_cuenta_bancaria,
    'id_banco', t.id_banco,
    'nombre_banco', t.nombre_banco,
    'id_banco_tercero', t.id_banco_tercero,
    'nombre_banco_tercero', t.nombre_banco_tercero,
    'monto_ingreso', t.monto_ingreso,
    'monto_gasto', t.monto_gasto,
    'monto_ganancia', t.monto_ganancia,
    'monto_salida', t.monto_salida,
    'flag_contabiliza_operacion', t.flag_contabiliza_operacion,
    'saldo_anterior', t.saldo_anterior,
    'saldo_actual', t.saldo_actual,
    'id_estado', t.id_estado,
    'nombre_estado', t.nombre_estado,
    'id_usuario', t.id_usuario,
    'nombre_usuario', t.nombre_usuario,
    'tipo_facturacion', t.tipo_facturacion,
    'id_caja_cierre', t.id_caja_cierre,
    'fecha_caja_cierre', t.fecha_caja_cierre,
    'fecha_registro', t.fecha_registro,
    'flag_paso_retencion', (op.fecha_retencion IS NOT NULL)
  )
  FROM public.tb_operacion_caja t
  LEFT JOIN public.tb_operacion_caja related ON related.id = t.id_operacion_caja_relacionada
  LEFT JOIN public.tb_operacion_proceso op ON op.id = t.id_operacion_proceso
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_id_caja IS NULL OR t.id_caja = p_id_caja)
    AND (p_id_empresa IS NULL OR t.id_empresa = p_id_empresa)
    AND (p_id_operacion_proceso IS NULL OR t.id_operacion_proceso = p_id_operacion_proceso)
    AND (p_tipo_origen IS NULL OR t.tipo_origen = p_tipo_origen)
    AND (p_tipo_movimiento IS NULL OR t.tipo_movimiento = p_tipo_movimiento)
    AND (p_id_categoria_movimiento IS NULL OR t.id_categoria_movimiento = p_id_categoria_movimiento)
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_codigo_operacion IS NULL OR COALESCE(t.codigo_operacion, '') ILIKE '%' || p_codigo_operacion || '%')
    AND (p_dni_cliente IS NULL OR COALESCE(t.dni_cliente, '') ILIKE '%' || p_dni_cliente || '%')
    AND (p_fecha_desde IS NULL OR t.fecha_registro >= p_fecha_desde)
    AND (p_fecha_hasta IS NULL OR t.fecha_registro <= p_fecha_hasta)
    AND (p_fecha_caja_cierre_desde IS NULL OR t.fecha_caja_cierre >= p_fecha_caja_cierre_desde)
    AND (p_fecha_caja_cierre_hasta IS NULL OR t.fecha_caja_cierre <= p_fecha_caja_cierre_hasta)
    AND (
      p_id IS NOT NULL
      OR p_id_operacion_proceso IS NOT NULL
      OR p_id_estado IS NOT NULL
      OR NOT (
        UPPER(COALESCE(t.tipo_movimiento, '')) = 'INGRESO'
        AND COALESCE(op.flag_retenido, false) = true
      )
    )
    AND (
      p_id IS NOT NULL
      OR
      (p_id_caja_cierre IS NOT NULL AND t.id_caja_cierre = p_id_caja_cierre)
      OR (
        (p_fecha_caja_cierre_desde IS NOT NULL OR p_fecha_caja_cierre_hasta IS NOT NULL)
        AND t.id_caja_cierre IS NOT NULL
      )
      OR (
        p_id_caja_cierre IS NULL
        AND p_fecha_caja_cierre_desde IS NULL
        AND p_fecha_caja_cierre_hasta IS NULL
        AND (COALESCE(p_incluir_cerradas, false) OR t.id_caja_cierre IS NULL)
      )
    )
  ORDER BY t.fecha_registro DESC, t.id DESC;
$$;

/*
Funcion: f_post_tb_operacion_caja
Objetivo:
  Registrar una operacion de caja individual y actualizar el saldo_actual de la
  caja afectada.

Reglas compactas:
  - INGRESO confirmado: suma monto_ingreso; el gasto se acumula para el cierre;
  - INGRESO retenido: no suma monto_ingreso ni descuenta el gasto;
  - SALIDA: descuenta monto_salida; el gasto se acumula para el cierre;
  - monto_ganancia queda congelado como dato de reporte, sin alterar por si solo
    el saldo porque ya esta implÃ­cito en la combinacion ingreso/gasto.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_operacion_caja(
  p_id_caja bigint,
  p_tipo_origen character varying,
  p_tipo_movimiento character varying,
  p_id_operacion_caja_relacionada bigint DEFAULT NULL,
  p_id_operacion_proceso bigint DEFAULT NULL,
  p_id_codigo_servicio bigint DEFAULT NULL,
  p_nombre_codigo_servicio character varying DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_nombre_cliente character varying DEFAULT NULL,
  p_codigo_operacion character varying DEFAULT NULL,
  p_id_categoria_movimiento bigint DEFAULT NULL,
  p_nombre_categoria_movimiento character varying DEFAULT NULL,
  p_detalle character varying DEFAULT NULL,
  p_id_banco_tercero bigint DEFAULT NULL,
  p_nombre_banco_tercero character varying DEFAULT NULL,
  p_monto_ingreso numeric DEFAULT 0,
  p_monto_gasto numeric DEFAULT 0,
  p_monto_ganancia numeric DEFAULT 0,
  p_monto_salida numeric DEFAULT 0,
  p_flag_contabiliza_operacion boolean DEFAULT true,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL,
  p_tipo_facturacion character varying DEFAULT 'Boleta'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caja record;
  v_estado_id bigint;
  v_estado_nombre character varying;
  v_estado_retenido_id bigint;
  v_nombre_usuario character varying;
  v_saldo_anterior numeric;
  v_saldo_nuevo numeric;
  v_delta_ingresos numeric := 0;
  v_delta_ingresos_retenido numeric := 0;
  v_delta_total_recaudado numeric := 0;
  v_delta_gastos numeric := 0;
  v_delta_ganancia numeric := 0;
  v_delta_ganancia_retenido numeric := 0;
  v_delta_salida numeric := 0;
  v_delta_operaciones integer := 0;
  v_monto_requerido numeric := 0;
  v_new_id bigint;
BEGIN
  SELECT
    c.id,
    c.id_empresa,
    c.id_empresa_cuenta_bancaria,
    c.saldo_actual,
    e.nombre AS nombre_empresa,
    ecb.id_banco,
    b.nombre AS nombre_banco
  INTO v_caja
  FROM public.tb_caja_operativa c
  JOIN public.tb_empresa e ON e.id = c.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = c.id_empresa_cuenta_bancaria
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  WHERE c.id = p_id_caja
  LIMIT 1
  FOR UPDATE;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La caja no existe.');
  END IF;

  IF p_id_estado IS NOT NULL THEN
    SELECT id, nombre INTO v_estado_id, v_estado_nombre
    FROM public.tb_estado
    WHERE id = p_id_estado
    LIMIT 1;
  ELSE
    SELECT id, nombre INTO v_estado_id, v_estado_nombre
    FROM public.tb_estado
    WHERE UPPER(BTRIM(nombre)) IN ('CONFIRMADO', 'PAGADO', 'PROCESADO', 'ACTIVO')
    ORDER BY CASE UPPER(BTRIM(nombre))
      WHEN 'CONFIRMADO' THEN 1
      WHEN 'PAGADO' THEN 2
      WHEN 'PROCESADO' THEN 3
      WHEN 'ACTIVO' THEN 4
      ELSE 5
    END
    LIMIT 1;
  END IF;

  IF v_estado_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro un estado valido para registrar el movimiento de caja.');
  END IF;

  SELECT id INTO v_estado_retenido_id
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'RETENIDO'
  LIMIT 1;

  IF p_nombre_usuario IS NOT NULL THEN
    v_nombre_usuario := p_nombre_usuario;
  ELSIF p_id_usuario IS NOT NULL THEN
    SELECT nombre INTO v_nombre_usuario
    FROM public.tb_usuario
    WHERE id = p_id_usuario
    LIMIT 1;
  END IF;

  v_saldo_anterior := COALESCE(v_caja.saldo_actual, 0);

  IF UPPER(BTRIM(COALESCE(p_tipo_origen, ''))) = 'GASTO OPERACIONAL CIERRE' THEN
    v_monto_requerido := COALESCE(p_monto_salida, 0);
    v_saldo_nuevo := v_saldo_anterior - v_monto_requerido;
    v_delta_ingresos := 0;
    v_delta_ingresos_retenido := 0;
    v_delta_total_recaudado := 0;
    v_delta_gastos := 0;
    v_delta_ganancia := 0;
    v_delta_ganancia_retenido := 0;
    v_delta_salida := 0;
    ELSIF UPPER(p_tipo_movimiento) = 'INGRESO' THEN
      IF UPPER(BTRIM(COALESCE(p_tipo_origen, ''))) = 'EDICION SALDO INICIAL CAJA' THEN
        v_saldo_nuevo := v_saldo_anterior + COALESCE(p_monto_ingreso, 0);
      ELSIF v_estado_retenido_id IS NOT NULL AND v_estado_id = v_estado_retenido_id THEN
        v_saldo_nuevo := v_saldo_anterior;
        v_delta_ingresos_retenido := COALESCE(p_monto_ingreso, 0);
        v_delta_ganancia_retenido := COALESCE(p_monto_ganancia, 0);
      ELSE
        v_saldo_nuevo := v_saldo_anterior + COALESCE(p_monto_ingreso, 0);
        IF UPPER(BTRIM(COALESCE(p_tipo_origen, ''))) IN (
          'EFECTIVIZACION',
          'PAGO_DEUDA',
          'PAGO_DEUDA_DEVOLUCION',
          'PAGO_DEUDA_COMISION'
        )
        AND UPPER(BTRIM(COALESCE(p_tipo_origen, ''))) <> 'EDICION SALDO INICIAL CAJA' THEN
          v_delta_total_recaudado := COALESCE(p_monto_ingreso, 0);
          v_delta_ingresos := 0;
        ELSE
          v_delta_total_recaudado := 0;
          v_delta_ingresos := COALESCE(p_monto_ingreso, 0);
        END IF;
        v_delta_ganancia := COALESCE(p_monto_ganancia, 0);
      END IF;
    IF UPPER(BTRIM(COALESCE(p_tipo_origen, ''))) NOT IN ('GASTO OPERACIONAL CIERRE', 'EDICION SALDO INICIAL CAJA') THEN
      v_delta_gastos := COALESCE(p_monto_gasto, 0);
    END IF;
  ELSIF UPPER(p_tipo_movimiento) = 'SALIDA' THEN
    v_monto_requerido := COALESCE(p_monto_salida, 0);
    v_saldo_nuevo := v_saldo_anterior - v_monto_requerido;
    IF UPPER(BTRIM(COALESCE(p_tipo_origen, ''))) NOT IN ('GASTO OPERACIONAL CIERRE', 'EDICION SALDO INICIAL CAJA') THEN
      v_delta_gastos := COALESCE(p_monto_gasto, 0);
      v_delta_salida := COALESCE(p_monto_salida, 0);
    END IF;
  ELSE
    RETURN jsonb_build_object('error', 'tipo_movimiento debe ser INGRESO o SALIDA.');
  END IF;

  IF COALESCE(p_flag_contabiliza_operacion, true) THEN
    v_delta_operaciones := 1;
  END IF;

  IF UPPER(p_tipo_movimiento) = 'SALIDA' AND v_saldo_nuevo < 0 THEN
    RETURN jsonb_build_object(
      'error', 'Saldo insuficiente en caja actual.',
      'codigo', 'SALDO_INSUFICIENTE',
      'id_caja', p_id_caja,
      'saldo_disponible', v_saldo_anterior,
      'monto_requerido', v_monto_requerido
    );
  END IF;

  IF v_saldo_nuevo < 0 THEN
    RETURN jsonb_build_object('error', 'La operaciÃ³n deja la caja con saldo negativo.');
  END IF;

  INSERT INTO public.tb_operacion_caja (
    id_caja,
    id_operacion_caja_relacionada,
    id_operacion_proceso,
    tipo_origen,
    tipo_movimiento,
    id_codigo_servicio,
    nombre_codigo_servicio,
    dni_cliente,
    nombre_cliente,
    codigo_operacion,
    id_categoria_movimiento,
    nombre_categoria_movimiento,
    detalle,
    id_empresa,
    nombre_empresa,
    id_empresa_cuenta_bancaria,
    id_banco,
    nombre_banco,
    id_banco_tercero,
    nombre_banco_tercero,
    monto_ingreso,
    monto_gasto,
    monto_ganancia,
    monto_salida,
    flag_contabiliza_operacion,
    saldo_anterior,
    saldo_actual,
    id_estado,
    nombre_estado,
    id_usuario,
    nombre_usuario,
    tipo_facturacion
  )
  VALUES (
    p_id_caja,
    p_id_operacion_caja_relacionada,
    p_id_operacion_proceso,
    p_tipo_origen,
    UPPER(p_tipo_movimiento),
    p_id_codigo_servicio,
    p_nombre_codigo_servicio,
    p_dni_cliente,
    p_nombre_cliente,
    p_codigo_operacion,
    p_id_categoria_movimiento,
    p_nombre_categoria_movimiento,
    p_detalle,
    v_caja.id_empresa,
    v_caja.nombre_empresa,
    v_caja.id_empresa_cuenta_bancaria,
    v_caja.id_banco,
    v_caja.nombre_banco,
    p_id_banco_tercero,
    p_nombre_banco_tercero,
    COALESCE(p_monto_ingreso, 0),
    COALESCE(p_monto_gasto, 0),
    COALESCE(p_monto_ganancia, 0),
    COALESCE(p_monto_salida, 0),
    COALESCE(p_flag_contabiliza_operacion, true),
    v_saldo_anterior,
    v_saldo_nuevo,
    v_estado_id,
    v_estado_nombre,
    p_id_usuario,
    v_nombre_usuario,
    COALESCE(p_tipo_facturacion, 'Boleta')
  )
  RETURNING id INTO v_new_id;

  UPDATE public.tb_caja_operativa
  SET saldo_actual = v_saldo_nuevo,
      saldo_total = v_saldo_nuevo,
      total_recaudado = COALESCE(total_recaudado, 0) + v_delta_total_recaudado,
      ingresos = COALESCE(ingresos, 0) + v_delta_ingresos,
      ingresos_retenido = COALESCE(ingresos_retenido, 0) + v_delta_ingresos_retenido,
      gastos = COALESCE(gastos, 0) + v_delta_gastos,
      ganancia = COALESCE(ganancia, 0) + v_delta_ganancia,
      ganancia_retenido = COALESCE(ganancia_retenido, 0) + v_delta_ganancia_retenido,
      salida = COALESCE(salida, 0) + v_delta_salida,
      operaciones = COALESCE(operaciones, 0) + v_delta_operaciones,
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id_caja;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(rc.ruta, p_id_usuario)
  FROM public.tb_ruta_operacion_caja rc
  WHERE rc.id_empresa = v_caja.id_empresa
    AND rc.id_empresa_cuenta_bancaria = v_caja.id_empresa_cuenta_bancaria
    AND rc.id_estado = 1;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_caja(p_id := v_new_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_apply_tb_operacion_caja_delta
Objetivo:
  Aplicar o revertir en tb_caja_operativa el impacto financiero de un movimiento
  de caja, usando la misma semantica de f_post_tb_operacion_caja.
*/
CREATE OR REPLACE FUNCTION public.f_apply_tb_operacion_caja_delta(
  p_id_caja bigint,
  p_tipo_movimiento character varying,
  p_nombre_estado character varying DEFAULT NULL,
  p_monto_ingreso numeric DEFAULT 0,
  p_monto_gasto numeric DEFAULT 0,
  p_monto_ganancia numeric DEFAULT 0,
  p_monto_salida numeric DEFAULT 0,
  p_flag_contabiliza_operacion boolean DEFAULT true,
  p_factor integer DEFAULT 1,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caja record;
  v_tipo_movimiento character varying;
  v_nombre_estado character varying;
  v_saldo_delta numeric := 0;
  v_delta_ingresos numeric := 0;
  v_delta_ingresos_retenido numeric := 0;
  v_delta_total_recaudado numeric := 0;
  v_delta_gastos numeric := 0;
  v_delta_ganancia numeric := 0;
  v_delta_ganancia_retenido numeric := 0;
  v_delta_salida numeric := 0;
  v_delta_operaciones integer := 0;
  v_saldo_nuevo numeric;
  v_factor integer;
  v_monto_requerido numeric := 0;
BEGIN
  SELECT c.id, c.saldo_actual, c.id_empresa, c.id_empresa_cuenta_bancaria
  INTO v_caja
  FROM public.tb_caja_operativa c
  WHERE c.id = p_id_caja
  LIMIT 1
  FOR UPDATE;

  IF v_caja.id IS NULL THEN
    RAISE EXCEPTION 'La caja no existe.';
  END IF;

  v_tipo_movimiento := UPPER(COALESCE(p_tipo_movimiento, ''));
  v_nombre_estado := UPPER(COALESCE(p_nombre_estado, ''));

  IF v_tipo_movimiento = 'INGRESO' THEN
    IF v_nombre_estado = 'RETENIDO' THEN
      v_saldo_delta := 0;
      v_delta_ingresos_retenido := COALESCE(p_monto_ingreso, 0);
      v_delta_ganancia_retenido := COALESCE(p_monto_ganancia, 0);
    ELSE
      v_saldo_delta := COALESCE(p_monto_ingreso, 0);
      v_delta_ingresos := COALESCE(p_monto_ingreso, 0);
      v_delta_total_recaudado := COALESCE(p_monto_ingreso, 0);
      v_delta_ganancia := COALESCE(p_monto_ganancia, 0);
    END IF;
    v_delta_gastos := COALESCE(p_monto_gasto, 0);
  ELSIF v_tipo_movimiento = 'SALIDA' THEN
    v_monto_requerido := COALESCE(p_monto_salida, 0);
    v_saldo_delta := -COALESCE(p_monto_salida, 0);
    v_delta_gastos := COALESCE(p_monto_gasto, 0);
    v_delta_salida := COALESCE(p_monto_salida, 0);
  ELSE
    RAISE EXCEPTION 'tipo_movimiento debe ser INGRESO o SALIDA.';
  END IF;

  IF COALESCE(p_flag_contabiliza_operacion, true) THEN
    v_delta_operaciones := 1;
  END IF;

  v_factor := COALESCE(p_factor, 1);
  v_saldo_nuevo := COALESCE(v_caja.saldo_actual, 0) + (v_factor * v_saldo_delta);

  IF v_factor = 1 AND v_tipo_movimiento = 'SALIDA' AND v_saldo_nuevo < 0 THEN
    RAISE EXCEPTION 'SALDO_INSUFICIENTE: Saldo insuficiente en caja actual. Disponible: %, Requerido: %, Caja: %',
      COALESCE(v_caja.saldo_actual, 0),
      v_monto_requerido,
      p_id_caja;
  END IF;

  IF v_factor = 1 AND v_saldo_nuevo < 0 THEN
    RAISE EXCEPTION 'La operacion deja la caja con saldo negativo.';
  END IF;

  UPDATE public.tb_caja_operativa
  SET saldo_actual = v_saldo_nuevo,
      saldo_total = v_saldo_nuevo,
      total_recaudado = GREATEST(COALESCE(total_recaudado, 0) + (v_factor * v_delta_total_recaudado), 0),
      ingresos = GREATEST(COALESCE(ingresos, 0) + (v_factor * v_delta_ingresos), 0),
      ingresos_retenido = GREATEST(COALESCE(ingresos_retenido, 0) + (v_factor * v_delta_ingresos_retenido), 0),
      gastos = GREATEST(COALESCE(gastos, 0) + (v_factor * v_delta_gastos), 0),
      ganancia = GREATEST(COALESCE(ganancia, 0) + (v_factor * v_delta_ganancia), 0),
      ganancia_retenido = GREATEST(COALESCE(ganancia_retenido, 0) + (v_factor * v_delta_ganancia_retenido), 0),
      salida = GREATEST(COALESCE(salida, 0) + (v_factor * v_delta_salida), 0),
      operaciones = GREATEST(COALESCE(operaciones, 0) + (v_factor * v_delta_operaciones), 0),
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id_caja;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(rc.ruta, p_id_usuario)
  FROM public.tb_ruta_operacion_caja rc
  WHERE rc.id_empresa = v_caja.id_empresa
    AND rc.id_empresa_cuenta_bancaria = v_caja.id_empresa_cuenta_bancaria
    AND rc.id_estado = 1;

  RETURN v_saldo_nuevo;
END;
$$;

/*
Funcion: f_post_tb_operacion_caja_desde_proceso
Objetivo:
  Traducir una fila comercial de tb_operacion_proceso a un movimiento financiero
  de caja, usando f_post_tb_operacion_caja como unico punto que modifica saldos.

Reglas:
  - idempotente por id_operacion_proceso + tipo_movimiento;
  - Efectivizacion y Excel registran INGRESO en la caja de ingreso;
  - al pagar se registra SALIDA en la caja de salida;
  - Pago Deuda usa la misma semantica de INGRESO + SALIDA cuando aplique;
  - la caja se resuelve desde empresa + cuenta congeladas en la operacion.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_operacion_caja_desde_proceso(
  p_id_operacion_proceso bigint,
  p_tipo_origen character varying DEFAULT 'EFECTIVIZACION',
  p_tipo_movimiento character varying DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_op record;
  v_mov record;
  v_caja_destino record;
  v_existente jsonb;
  v_relacionada jsonb;
  v_tipo_movimiento character varying;
  v_id_caja bigint;
  v_id_movimiento bigint;
  v_id_relacionada bigint;
  v_estado_id bigint;
  v_estado_nombre character varying;
  v_estado_retenido_id bigint;
  v_estado_retenido_nombre character varying;
  v_nombre_usuario character varying;
  v_saldo_anterior_nuevo numeric;
  v_saldo_actual_nuevo numeric;
  v_monto_ingreso numeric := 0;
  v_monto_transferencia numeric := 0;
  v_monto_gasto numeric := 0;
  v_monto_ganancia numeric := 0;
  v_monto_salida numeric := 0;
  v_monto_requerido numeric := 0;
  v_saldo_disponible numeric := 0;
  v_tipo_servicio character varying;
  v_tipo_flujo_pago_deuda character varying;
  v_flag_retencion boolean := false;
  v_detalle character varying;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_op
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion_proceso
  LIMIT 1;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion comercial no existe.');
  END IF;

  v_tipo_servicio := UPPER(COALESCE(v_op.tipo_servicio, v_op.nombre_codigo_servicio, ''));
  v_tipo_flujo_pago_deuda := UPPER(COALESCE(v_op.tipo_flujo_pago_deuda, ''));
  v_tipo_movimiento := UPPER(
    COALESCE(
      p_tipo_movimiento,
      CASE
        WHEN v_tipo_servicio LIKE '%PAGO%DEUDA%' THEN 'SALIDA'
        ELSE 'INGRESO'
      END
    )
  );

  SELECT to_jsonb(c)
  INTO v_existente
  FROM public.tb_operacion_caja c
  WHERE c.id_operacion_proceso = p_id_operacion_proceso
    AND c.tipo_movimiento = v_tipo_movimiento
    AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
  ORDER BY c.id
  LIMIT 1;

  SELECT to_jsonb(c)
  INTO v_relacionada
  FROM public.tb_operacion_caja c
  WHERE c.id_operacion_proceso = p_id_operacion_proceso
    AND c.tipo_movimiento = CASE WHEN v_tipo_movimiento = 'INGRESO' THEN 'SALIDA' ELSE 'INGRESO' END
    AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
  ORDER BY c.id
  LIMIT 1;

  v_estado_id := COALESCE(p_id_estado, v_op.id_estado);
  v_estado_nombre := v_op.nombre_estado;

  IF v_estado_id IS NOT NULL THEN
    SELECT nombre
    INTO v_estado_nombre
    FROM public.tb_estado
    WHERE id = v_estado_id
    LIMIT 1;
  END IF;

  SELECT id, nombre
  INTO v_estado_retenido_id, v_estado_retenido_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'RETENIDO'
  LIMIT 1;

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

  IF v_tipo_movimiento = 'INGRESO' THEN
    SELECT
      c.id,
      c.saldo_actual,
      c.id_empresa,
      e.nombre AS nombre_empresa,
      c.id_empresa_cuenta_bancaria,
      ecb.id_banco,
      b.nombre AS nombre_banco
    INTO v_caja_destino
    FROM public.tb_caja_operativa c
    JOIN public.tb_empresa e ON e.id = c.id_empresa
    JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = c.id_empresa_cuenta_bancaria
    JOIN public.tb_banco b ON b.id = ecb.id_banco
    WHERE c.id_empresa = v_op.id_empresa_ingreso
      AND c.id_empresa_cuenta_bancaria = v_op.id_empresa_cuenta_ingreso
    LIMIT 1;

    IF v_caja_destino.id IS NULL THEN
      RETURN jsonb_build_object('error', 'No existe caja inicial para la empresa y cuenta de ingreso de la operacion.');
    END IF;

    v_id_caja := v_caja_destino.id;
    v_flag_retencion := COALESCE(v_op.flag_retenido, false);
    IF v_flag_retencion AND v_estado_retenido_id IS NOT NULL THEN
      v_estado_id := v_estado_retenido_id;
      v_estado_nombre := v_estado_retenido_nombre;
    END IF;
    v_monto_ingreso := COALESCE(v_op.monto_deposito_cliente, 0);
    IF v_tipo_flujo_pago_deuda IN ('RETORNO', 'RETORNO_DIRECTO', 'DIRECTO_CAJA') THEN
      v_monto_transferencia := 0;
    ELSE
      v_monto_transferencia := COALESCE(
        v_op.monto_transferencia_cliente,
        GREATEST(COALESCE(v_op.monto_deposito_cliente, 0) - COALESCE(v_op.resultado_comision_servicio, 0), 0),
        0
      );
    END IF;
    v_monto_gasto := COALESCE(v_op.resultado_comision_banco_ingreso, 0);
    IF v_tipo_flujo_pago_deuda IN ('RETORNO', 'RETORNO_DIRECTO', 'DIRECTO_CAJA') THEN
      v_monto_ganancia := 0;
      v_detalle := CASE
        WHEN v_tipo_flujo_pago_deuda = 'DIRECTO_CAJA' THEN 'Ingreso directo a caja'
        WHEN v_tipo_flujo_pago_deuda = 'RETORNO_DIRECTO' THEN 'Retorno directo Pago Deuda'
        ELSE 'Retorno Pago Deuda'
      END;
    ELSE
      v_monto_ganancia := GREATEST(
        v_monto_ingreso -
        v_monto_transferencia -
        v_monto_gasto -
        COALESCE(v_op.resultado_comision_banco_salida, 0),
        0
      );
      v_detalle := 'Operacion comercial de ingreso';
    END IF;
  ELSIF v_tipo_movimiento = 'SALIDA' THEN
    SELECT
      c.id,
      c.saldo_actual,
      c.id_empresa,
      e.nombre AS nombre_empresa,
      c.id_empresa_cuenta_bancaria,
      ecb.id_banco,
      b.nombre AS nombre_banco
    INTO v_caja_destino
    FROM public.tb_caja_operativa c
    JOIN public.tb_empresa e ON e.id = c.id_empresa
    JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = c.id_empresa_cuenta_bancaria
    JOIN public.tb_banco b ON b.id = ecb.id_banco
    WHERE c.id_empresa = v_op.id_empresa_salida
      AND c.id_empresa_cuenta_bancaria = v_op.id_empresa_cuenta_salida
    LIMIT 1;

    IF v_caja_destino.id IS NULL THEN
      RETURN jsonb_build_object('error', 'No existe caja inicial para la empresa y cuenta de salida de la operacion.');
    END IF;

    v_id_caja := v_caja_destino.id;
    v_monto_salida := COALESCE(v_op.monto_transferencia_cliente, v_op.monto_deposito_cliente, 0);
    v_monto_gasto := COALESCE(v_op.resultado_comision_banco_salida, 0);
    v_detalle := 'Operacion comercial de salida';
  ELSE
    RETURN jsonb_build_object('error', 'tipo_movimiento debe ser INGRESO o SALIDA.');
  END IF;

  IF v_tipo_movimiento = 'INGRESO' AND v_monto_ingreso <= 0 THEN
    RETURN jsonb_build_object('error', 'La operacion no tiene monto de ingreso para caja.');
  END IF;

  IF v_tipo_movimiento = 'SALIDA' AND v_monto_salida <= 0 THEN
    RETURN jsonb_build_object('error', 'La operacion no tiene monto de salida para caja.');
  END IF;

  IF v_existente IS NOT NULL THEN
    v_id_movimiento := (v_existente->>'id')::bigint;
    v_id_relacionada := NULLIF(v_relacionada->>'id', '')::bigint;

    SELECT *
    INTO v_mov
    FROM public.tb_operacion_caja
    WHERE id = v_id_movimiento
    FOR UPDATE;

    IF v_mov.id_caja_cierre IS NOT NULL THEN
      RETURN v_existente || jsonb_build_object('idempotente', true, 'cerrado', true);
    END IF;

    IF v_tipo_movimiento = 'SALIDA' THEN
      SELECT COALESCE(saldo_actual, 0)
      INTO v_saldo_disponible
      FROM public.tb_caja_operativa
      WHERE id = v_id_caja
      LIMIT 1
      FOR UPDATE;

      IF v_mov.id_caja = v_id_caja AND UPPER(BTRIM(COALESCE(v_mov.tipo_movimiento, ''))) = 'SALIDA' THEN
        v_saldo_disponible := v_saldo_disponible + COALESCE(v_mov.monto_salida, 0);
      END IF;

      v_monto_requerido := COALESCE(v_monto_salida, 0);

      IF v_saldo_disponible < v_monto_requerido THEN
        RETURN jsonb_build_object(
          'error', 'Saldo insuficiente en caja actual.',
          'codigo', 'SALDO_INSUFICIENTE',
          'id_caja', v_id_caja,
          'saldo_disponible', v_saldo_disponible,
          'monto_requerido', v_monto_requerido
        );
      END IF;
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
    INTO v_saldo_anterior_nuevo
    FROM public.tb_caja_operativa
    WHERE id = v_id_caja
    LIMIT 1;

    v_saldo_actual_nuevo := public.f_apply_tb_operacion_caja_delta(
      p_id_caja := v_id_caja,
      p_tipo_movimiento := v_tipo_movimiento,
      p_nombre_estado := COALESCE(v_estado_nombre, v_op.nombre_estado, v_mov.nombre_estado),
      p_monto_ingreso := v_monto_ingreso,
      p_monto_gasto := v_monto_gasto,
      p_monto_ganancia := v_monto_ganancia,
      p_monto_salida := v_monto_salida,
      p_flag_contabiliza_operacion := COALESCE(v_mov.flag_contabiliza_operacion, true),
      p_factor := 1,
      p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario)
    );

    UPDATE public.tb_operacion_caja
    SET id_caja = v_id_caja,
        id_operacion_caja_relacionada = v_id_relacionada,
        tipo_origen = CASE
          WHEN v_tipo_movimiento = 'INGRESO' AND v_flag_retencion THEN tipo_origen
          ELSE COALESCE(p_tipo_origen, tipo_origen)
        END,
        id_codigo_servicio = v_op.id_codigo_servicio,
        nombre_codigo_servicio = v_op.nombre_codigo_servicio,
        dni_cliente = v_op.dni_cliente,
        nombre_cliente = v_op.nombre_cliente,
        codigo_operacion = v_op.codigo_operacion_deposito_cliente,
        detalle = v_detalle,
        id_empresa = v_caja_destino.id_empresa,
        nombre_empresa = v_caja_destino.nombre_empresa,
        id_empresa_cuenta_bancaria = v_caja_destino.id_empresa_cuenta_bancaria,
        id_banco = v_caja_destino.id_banco,
        nombre_banco = v_caja_destino.nombre_banco,
        id_banco_tercero = COALESCE(v_op.id_banco_cliente_transferencia, v_op.id_banco_cliente),
        nombre_banco_tercero = COALESCE(v_op.nombre_banco_cliente_transferencia, v_op.nombre_banco_cliente),
        monto_ingreso = v_monto_ingreso,
        monto_gasto = v_monto_gasto,
        monto_ganancia = v_monto_ganancia,
        monto_salida = v_monto_salida,
        saldo_anterior = v_saldo_anterior_nuevo,
        saldo_actual = v_saldo_actual_nuevo,
        id_estado = COALESCE(v_estado_id, id_estado),
        nombre_estado = COALESCE(v_estado_nombre, nombre_estado),
        id_usuario = COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario, id_usuario),
        nombre_usuario = COALESCE(v_nombre_usuario, nombre_usuario),
        tipo_facturacion = COALESCE(v_op.tipo_facturacion, 'Boleta')
    WHERE id = v_id_movimiento;

    IF v_id_relacionada IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.tb_operacion_caja c
         WHERE c.id = v_id_relacionada
           AND c.id_caja_cierre IS NOT NULL
       ) THEN
      PERFORM public.f_patch_tb_operacion_caja(
        p_id := v_id_relacionada,
        p_id_operacion_caja_relacionada := v_id_movimiento,
        p_id_estado := p_id_estado,
        p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario),
        p_nombre_usuario := COALESCE(p_nombre_usuario, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
        p_tipo_facturacion := COALESCE(v_op.tipo_facturacion, 'Boleta')
      );
    END IF;

    SELECT x
    INTO v_result
    FROM public.f_get_tb_operacion_caja(p_id := v_id_movimiento) AS x
    LIMIT 1;

    RETURN v_result || jsonb_build_object('idempotente', true);
  END IF;

  v_result := public.f_post_tb_operacion_caja(
    p_id_caja := v_id_caja,
    p_tipo_origen := COALESCE(p_tipo_origen, 'EFECTIVIZACION'),
    p_tipo_movimiento := v_tipo_movimiento,
    p_id_operacion_proceso := v_op.id,
    p_id_codigo_servicio := v_op.id_codigo_servicio,
    p_nombre_codigo_servicio := v_op.nombre_codigo_servicio,
    p_dni_cliente := v_op.dni_cliente,
    p_nombre_cliente := v_op.nombre_cliente,
    p_codigo_operacion := v_op.codigo_operacion_deposito_cliente,
    p_detalle := v_detalle,
    p_id_banco_tercero := COALESCE(v_op.id_banco_cliente_transferencia, v_op.id_banco_cliente),
    p_nombre_banco_tercero := COALESCE(v_op.nombre_banco_cliente_transferencia, v_op.nombre_banco_cliente),
    p_monto_ingreso := v_monto_ingreso,
    p_monto_gasto := v_monto_gasto,
    p_monto_ganancia := v_monto_ganancia,
    p_monto_salida := v_monto_salida,
    p_flag_contabiliza_operacion := true,
    p_id_estado := COALESCE(v_estado_id, p_id_estado, v_op.id_estado),
    p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
    p_tipo_facturacion := COALESCE(v_op.tipo_facturacion, 'Boleta')
  );

  IF v_result ? 'error' THEN
    RETURN v_result;
  END IF;

  v_id_movimiento := (v_result->>'id')::bigint;
  v_id_relacionada := NULLIF(v_relacionada->>'id', '')::bigint;

  IF v_id_relacionada IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.tb_operacion_caja c
       WHERE c.id = v_id_relacionada
         AND c.id_caja_cierre IS NOT NULL
     ) THEN
    v_result := public.f_patch_tb_operacion_caja(
      p_id := v_id_movimiento,
      p_id_operacion_caja_relacionada := v_id_relacionada,
      p_id_estado := p_id_estado,
      p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario),
      p_nombre_usuario := COALESCE(p_nombre_usuario, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
      p_tipo_facturacion := COALESCE(v_op.tipo_facturacion, 'Boleta')
    );

    PERFORM public.f_patch_tb_operacion_caja(
      p_id := v_id_relacionada,
      p_id_operacion_caja_relacionada := v_id_movimiento,
      p_id_estado := p_id_estado,
      p_id_usuario := COALESCE(p_id_usuario, v_op.id_usuario_gestor, v_op.id_usuario),
      p_nombre_usuario := COALESCE(p_nombre_usuario, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
      p_tipo_facturacion := COALESCE(v_op.tipo_facturacion, 'Boleta')
    );
  END IF;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_operacion_caja
Objetivo:
  Editar solo metadatos de una operaciÃ³n de caja ya registrada.

Nota:
  Para mantener integridad de saldos, esta version compacta no recalcula
  montos financieros ni cambia la caja base del movimiento.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_caja(
  p_id bigint,
  p_id_operacion_caja_relacionada bigint DEFAULT NULL,
  p_id_operacion_proceso bigint DEFAULT NULL,
  p_codigo_operacion character varying DEFAULT NULL,
  p_id_categoria_movimiento bigint DEFAULT NULL,
  p_nombre_categoria_movimiento character varying DEFAULT NULL,
  p_detalle character varying DEFAULT NULL,
  p_flag_contabiliza_operacion boolean DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL,
  p_tipo_facturacion character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_estado_nombre character varying;
  v_nombre_usuario character varying;
BEGIN
  IF p_id_estado IS NOT NULL THEN
    SELECT nombre INTO v_estado_nombre
    FROM public.tb_estado
    WHERE id = p_id_estado
    LIMIT 1;
  END IF;

  IF p_nombre_usuario IS NOT NULL THEN
    v_nombre_usuario := p_nombre_usuario;
  ELSIF p_id_usuario IS NOT NULL THEN
    SELECT nombre INTO v_nombre_usuario
    FROM public.tb_usuario
    WHERE id = p_id_usuario
    LIMIT 1;
  END IF;

  UPDATE public.tb_operacion_caja
  SET id_operacion_caja_relacionada = COALESCE(p_id_operacion_caja_relacionada, id_operacion_caja_relacionada),
      id_operacion_proceso = COALESCE(p_id_operacion_proceso, id_operacion_proceso),
      codigo_operacion = COALESCE(p_codigo_operacion, codigo_operacion),
      id_categoria_movimiento = COALESCE(p_id_categoria_movimiento, id_categoria_movimiento),
      nombre_categoria_movimiento = COALESCE(p_nombre_categoria_movimiento, nombre_categoria_movimiento),
      detalle = COALESCE(p_detalle, detalle),
      flag_contabiliza_operacion = COALESCE(p_flag_contabiliza_operacion, flag_contabiliza_operacion),
      id_estado = COALESCE(p_id_estado, id_estado),
      nombre_estado = COALESCE(v_estado_nombre, nombre_estado),
      id_usuario = COALESCE(p_id_usuario, id_usuario),
      nombre_usuario = COALESCE(v_nombre_usuario, nombre_usuario),
      tipo_facturacion = COALESCE(p_tipo_facturacion, tipo_facturacion)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_caja(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- 20. OPERACIONES ESPECIALES DE CAJA
-- ============================================================================

/*
Funcion: f_post_tb_operacion_caja_transferencia
Objetivo:
  Registrar una transferencia interna entre dos cajas generando:
    - una fila SALIDA en la caja origen
    - una fila INGRESO en la caja destino
  y enlazando ambos registros entre si.
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_operacion_caja_transferencia(
  p_id_caja_origen bigint,
  p_id_caja_destino bigint,
  p_monto numeric,
  p_detalle character varying DEFAULT NULL,
  p_id_categoria_movimiento bigint DEFAULT NULL,
  p_nombre_categoria_movimiento character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_origen record;
  v_destino record;
  v_salida jsonb;
  v_ingreso jsonb;
  v_id_salida bigint;
  v_id_ingreso bigint;
  v_estado_id bigint;
BEGIN
  IF p_id_caja_origen = p_id_caja_destino THEN
    RETURN jsonb_build_object('error', 'La caja origen y destino no pueden ser la misma.');
  END IF;

  SELECT c.id, e.nombre AS nombre_empresa, b.id AS id_banco, b.nombre AS nombre_banco
  INTO v_origen
  FROM public.tb_caja_operativa c
  JOIN public.tb_empresa e ON e.id = c.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = c.id_empresa_cuenta_bancaria
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  WHERE c.id = p_id_caja_origen
  LIMIT 1;

  SELECT c.id, e.nombre AS nombre_empresa, b.id AS id_banco, b.nombre AS nombre_banco
  INTO v_destino
  FROM public.tb_caja_operativa c
  JOIN public.tb_empresa e ON e.id = c.id_empresa
  JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = c.id_empresa_cuenta_bancaria
  JOIN public.tb_banco b ON b.id = ecb.id_banco
  WHERE c.id = p_id_caja_destino
  LIMIT 1;

  IF v_origen.id IS NULL OR v_destino.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontraron las cajas de origen y destino.');
  END IF;

  IF p_id_estado IS NOT NULL THEN
    SELECT id
    INTO v_estado_id
    FROM public.tb_estado
    WHERE id = p_id_estado
    LIMIT 1;
  ELSE
    SELECT id
    INTO v_estado_id
    FROM public.tb_estado
    WHERE UPPER(BTRIM(nombre)) IN ('CONFIRMADO', 'PAGADO', 'PROCESADO', 'ACTIVO')
    ORDER BY CASE UPPER(BTRIM(nombre))
      WHEN 'CONFIRMADO' THEN 1
      WHEN 'PAGADO' THEN 2
      WHEN 'PROCESADO' THEN 3
      WHEN 'ACTIVO' THEN 4
      ELSE 5
    END
    LIMIT 1;
  END IF;

  IF v_estado_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro un estado valido para registrar la transferencia interna.');
  END IF;

  v_salida := public.f_post_tb_operacion_caja(
    p_id_caja := p_id_caja_origen,
    p_tipo_origen := 'TRANSFERENCIA INTERNA',
    p_tipo_movimiento := 'SALIDA',
    p_id_categoria_movimiento := p_id_categoria_movimiento,
    p_nombre_categoria_movimiento := p_nombre_categoria_movimiento,
    p_detalle := COALESCE(p_detalle, 'Transferencia interna entre cajas'),
    p_id_banco_tercero := v_destino.id_banco,
    p_nombre_banco_tercero := v_destino.nombre_banco,
    p_monto_salida := p_monto,
    p_flag_contabiliza_operacion := true,
    p_id_estado := v_estado_id,
    p_id_usuario := p_id_usuario,
    p_nombre_usuario := p_nombre_usuario
  );

  IF v_salida ? 'error' THEN
    RETURN v_salida;
  END IF;

  v_id_salida := (v_salida->>'id')::bigint;

  v_ingreso := public.f_post_tb_operacion_caja(
    p_id_caja := p_id_caja_destino,
    p_id_operacion_caja_relacionada := v_id_salida,
    p_tipo_origen := 'TRANSFERENCIA INTERNA',
    p_tipo_movimiento := 'INGRESO',
    p_id_categoria_movimiento := p_id_categoria_movimiento,
    p_nombre_categoria_movimiento := p_nombre_categoria_movimiento,
    p_detalle := COALESCE(p_detalle, 'Transferencia interna entre cajas'),
    p_id_banco_tercero := v_origen.id_banco,
    p_nombre_banco_tercero := v_origen.nombre_banco,
    p_monto_ingreso := p_monto,
    p_flag_contabiliza_operacion := true,
    p_id_estado := v_estado_id,
    p_id_usuario := p_id_usuario,
    p_nombre_usuario := p_nombre_usuario
  );

  IF v_ingreso ? 'error' THEN
    RETURN v_ingreso;
  END IF;

  v_id_ingreso := (v_ingreso->>'id')::bigint;

  UPDATE public.tb_operacion_caja
  SET id_operacion_caja_relacionada = v_id_ingreso
  WHERE id = v_id_salida;

  v_salida := (
    SELECT x
    FROM public.f_get_tb_operacion_caja(p_id := v_id_salida) AS x
    LIMIT 1
  );

  RETURN jsonb_build_object(
    'operacion_salida', v_salida,
    'operacion_ingreso', v_ingreso
  );
END;
$$;

/*
Funcion: f_delete_tb_operacion_caja_manual
Objetivo:
  Eliminar un movimiento manual abierto y revertir su impacto financiero. Para
  transferencias internas elimina y revierte ambas puntas enlazadas.
*/
CREATE OR REPLACE FUNCTION public.f_delete_tb_operacion_caja_manual(
  p_id bigint,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mov record;
  v_row record;
  v_ids bigint[];
  v_deleted_count integer := 0;
BEGIN
  SELECT *
  INTO v_mov
  FROM public.tb_operacion_caja
  WHERE id = p_id
  LIMIT 1
  FOR UPDATE;

  IF v_mov.id IS NULL THEN
    RETURN jsonb_build_object('error', 'El movimiento no existe.');
  END IF;

  IF v_mov.id_caja_cierre IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'No se puede eliminar un movimiento cerrado en caja.');
  END IF;

  IF v_mov.id_operacion_proceso IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Solo se pueden eliminar movimientos manuales. Usa Reiniciar para operaciones comerciales.');
  END IF;

  IF UPPER(BTRIM(COALESCE(v_mov.tipo_origen, ''))) NOT IN ('OTROS', 'TRANSFERENCIA INTERNA', 'TRANSFERENCIA_INTERNA') THEN
    RETURN jsonb_build_object('error', 'Solo se pueden eliminar movimientos de Otros o Mover Saldo.');
  END IF;

  IF UPPER(BTRIM(COALESCE(v_mov.tipo_origen, ''))) IN ('TRANSFERENCIA INTERNA', 'TRANSFERENCIA_INTERNA') THEN
    SELECT ARRAY_AGG(DISTINCT x.id ORDER BY x.id)
    INTO v_ids
    FROM (
      SELECT oc.id
      FROM public.tb_operacion_caja oc
      WHERE oc.id = v_mov.id
         OR oc.id = v_mov.id_operacion_caja_relacionada
         OR oc.id_operacion_caja_relacionada = v_mov.id
    ) x;
  ELSE
    v_ids := ARRAY[v_mov.id];
  END IF;

  IF COALESCE(ARRAY_LENGTH(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('error', 'No se encontraron movimientos para revertir.');
  END IF;

  FOR v_row IN
    SELECT oc.*, c.saldo_actual AS caja_saldo_actual
    FROM public.tb_operacion_caja oc
    JOIN public.tb_caja_operativa c ON c.id = oc.id_caja
    WHERE oc.id = ANY(v_ids)
    FOR UPDATE OF oc, c
  LOOP
    IF v_row.id_caja_cierre IS NOT NULL THEN
      RETURN jsonb_build_object('error', 'No se puede eliminar un movimiento cerrado en caja.');
    END IF;

    IF v_row.id_operacion_proceso IS NOT NULL THEN
      RETURN jsonb_build_object('error', 'La transferencia tiene movimientos asociados a operaciones comerciales.');
    END IF;

    IF UPPER(BTRIM(COALESCE(v_row.tipo_origen, ''))) NOT IN ('OTROS', 'TRANSFERENCIA INTERNA', 'TRANSFERENCIA_INTERNA') THEN
      RETURN jsonb_build_object('error', 'La transferencia contiene movimientos no manuales.');
    END IF;

    IF UPPER(BTRIM(COALESCE(v_row.tipo_movimiento, ''))) = 'INGRESO'
       AND UPPER(BTRIM(COALESCE(v_row.nombre_estado, ''))) <> 'RETENIDO'
       AND COALESCE(v_row.caja_saldo_actual, 0) - (COALESCE(v_row.monto_ingreso, 0) - COALESCE(v_row.monto_gasto, 0)) < 0 THEN
      RETURN jsonb_build_object('error', 'No se puede eliminar el movimiento porque la caja destino no tiene saldo suficiente para revertir el ingreso.');
    END IF;
  END LOOP;

  FOR v_row IN
    SELECT *
    FROM public.tb_operacion_caja
    WHERE id = ANY(v_ids)
    ORDER BY CASE UPPER(BTRIM(COALESCE(tipo_movimiento, ''))) WHEN 'INGRESO' THEN 1 ELSE 2 END
  LOOP
    PERFORM public.f_apply_tb_operacion_caja_delta(
      p_id_caja := v_row.id_caja,
      p_tipo_movimiento := v_row.tipo_movimiento,
      p_nombre_estado := v_row.nombre_estado,
      p_monto_ingreso := v_row.monto_ingreso,
      p_monto_gasto := v_row.monto_gasto,
      p_monto_ganancia := v_row.monto_ganancia,
      p_monto_salida := v_row.monto_salida,
      p_flag_contabiliza_operacion := v_row.flag_contabiliza_operacion,
      p_factor := -1,
      p_id_usuario := p_id_usuario
    );
  END LOOP;

  UPDATE public.tb_operacion_caja
  SET id_operacion_caja_relacionada = NULL
  WHERE id = ANY(v_ids)
     OR id_operacion_caja_relacionada = ANY(v_ids);

  DELETE FROM public.tb_operacion_caja
  WHERE id = ANY(v_ids);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'id_movimiento', p_id,
    'movimientos_eliminados', v_deleted_count
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_caja_confirmar_retencion
Objetivo:
  Confirmar una retenciÃ³n previamente registrada como INGRESO RETENIDO. Al
  confirmarse, reciÃ©n se suma el monto_ingreso a la caja porque el gasto ya fue
  descontado al momento de retener.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_caja_confirmar_retencion(
  p_id bigint,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mov record;
  v_estado_confirmado_id bigint;
  v_estado_confirmado_nombre character varying;
  v_nombre_usuario character varying;
  v_nuevo_saldo numeric;
BEGIN
  RETURN jsonb_build_object(
    'error', 'Las retenciones son informativas y no pueden liberarse.',
    'codigo', 'RETENCION_INFORMATIVA'
  );

  SELECT *
  INTO v_mov
  FROM public.tb_operacion_caja
  WHERE id = p_id
  LIMIT 1;

  IF v_mov.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La operaciÃ³n de caja no existe.');
  END IF;

  IF UPPER(v_mov.tipo_movimiento) <> 'INGRESO' THEN
    RETURN jsonb_build_object('error', 'Solo se pueden confirmar retenciones de tipo INGRESO.');
  END IF;

  IF v_mov.id_caja_cierre IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'No se puede confirmar una retencion con caja cerrada.');
  END IF;

  IF UPPER(COALESCE(v_mov.nombre_estado, '')) <> 'RETENIDO' THEN
    RETURN (
      SELECT x
      FROM public.f_get_tb_operacion_caja(p_id := p_id) AS x
      LIMIT 1
    ) || jsonb_build_object('idempotente', true);
  END IF;

  SELECT id, nombre INTO v_estado_confirmado_id, v_estado_confirmado_nombre
  FROM public.tb_estado
  WHERE UPPER(BTRIM(nombre)) IN ('CONFIRMADO', 'PAGADO', 'PROCESADO', 'ACTIVO')
  ORDER BY CASE UPPER(BTRIM(nombre))
    WHEN 'CONFIRMADO' THEN 1
    WHEN 'PAGADO' THEN 2
    WHEN 'PROCESADO' THEN 3
    WHEN 'ACTIVO' THEN 4
    ELSE 5
  END
  LIMIT 1;

  IF v_estado_confirmado_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro un estado valido para confirmar la retencion.');
  END IF;

  IF p_nombre_usuario IS NOT NULL THEN
    v_nombre_usuario := p_nombre_usuario;
  ELSIF p_id_usuario IS NOT NULL THEN
    SELECT nombre INTO v_nombre_usuario
    FROM public.tb_usuario
    WHERE id = p_id_usuario
    LIMIT 1;
  END IF;

  SELECT saldo_actual + COALESCE(v_mov.monto_ingreso, 0)
  INTO v_nuevo_saldo
  FROM public.tb_caja_operativa
  WHERE id = v_mov.id_caja
  LIMIT 1;

  UPDATE public.tb_caja_operativa
  SET saldo_actual = v_nuevo_saldo,
      saldo_total = v_nuevo_saldo,
      total_recaudado = COALESCE(total_recaudado, 0) +
        CASE WHEN UPPER(v_mov.tipo_origen) IN ('EFECTIVIZACION', 'PAGO_DEUDA', 'PAGO_DEUDA_DEVOLUCION', 'PAGO_DEUDA_COMISION')
          THEN COALESCE(v_mov.monto_ingreso, 0) ELSE 0 END,
      ingresos = COALESCE(ingresos, 0) +
        CASE WHEN UPPER(v_mov.tipo_origen) NOT IN ('EFECTIVIZACION', 'PAGO_DEUDA', 'PAGO_DEUDA_DEVOLUCION', 'PAGO_DEUDA_COMISION')
          THEN COALESCE(v_mov.monto_ingreso, 0) ELSE 0 END,
      ingresos_retenido = GREATEST(COALESCE(ingresos_retenido, 0) - COALESCE(v_mov.monto_ingreso, 0), 0),
      ganancia = COALESCE(ganancia, 0) + COALESCE(v_mov.monto_ganancia, 0),
      ganancia_retenido = GREATEST(COALESCE(ganancia_retenido, 0) - COALESCE(v_mov.monto_ganancia, 0), 0),
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = v_mov.id_caja;

  UPDATE public.tb_operacion_caja
  SET id_estado = v_estado_confirmado_id,
      nombre_estado = v_estado_confirmado_nombre,
      saldo_actual = v_nuevo_saldo,
      id_usuario = COALESCE(p_id_usuario, id_usuario),
      nombre_usuario = COALESCE(v_nombre_usuario, nombre_usuario)
  WHERE id = p_id;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(rc.ruta, p_id_usuario)
  FROM public.tb_ruta_operacion_caja rc
  WHERE rc.id_empresa = v_mov.id_empresa
    AND rc.id_empresa_cuenta_bancaria = v_mov.id_empresa_cuenta_bancaria
    AND rc.id_estado = 1;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_caja(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_confirmar_retencion
Objetivo:
  Confirmar una operacion retenida liberando su movimiento de INGRESO retenido
  hacia caja y apagando la bandera operativa de retencion.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_confirmar_retencion(
  p_id bigint,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_op record;
  v_mov record;
  v_nombre_usuario character varying;
  v_caja_result jsonb;
  v_sync_result jsonb;
BEGIN
  RETURN jsonb_build_object(
    'error', 'Las retenciones son informativas y no pueden liberarse.',
    'codigo', 'RETENCION_INFORMATIVA'
  );

  SELECT *
  INTO v_op
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion no encontrada.');
  END IF;

  IF p_nombre_usuario_gestor IS NOT NULL THEN
    v_nombre_usuario := p_nombre_usuario_gestor;
  ELSIF p_id_usuario_gestor IS NOT NULL THEN
    SELECT nombre
    INTO v_nombre_usuario
    FROM public.tb_usuario
    WHERE id = p_id_usuario_gestor
    LIMIT 1;
  ELSE
    v_nombre_usuario := COALESCE(v_op.nombre_usuario_gestor, v_op.nombre_usuario);
  END IF;

  SELECT *
  INTO v_mov
  FROM public.tb_operacion_caja c
  WHERE c.id_operacion_proceso = p_id
    AND c.tipo_movimiento = 'INGRESO'
    AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
  ORDER BY c.id
  LIMIT 1;

  IF v_mov.id IS NULL THEN
    v_sync_result := public.f_post_tb_operacion_caja_desde_proceso(
      p_id_operacion_proceso := p_id,
      p_tipo_origen := 'EFECTIVIZACION',
      p_tipo_movimiento := 'INGRESO',
      p_id_usuario := COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario),
      p_nombre_usuario := v_nombre_usuario,
      p_id_estado := v_op.id_estado
    );

    IF v_sync_result ? 'error' THEN
      RETURN v_sync_result;
    END IF;

    SELECT *
    INTO v_mov
    FROM public.tb_operacion_caja c
    WHERE c.id_operacion_proceso = p_id
      AND c.tipo_movimiento = 'INGRESO'
      AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
    ORDER BY c.id
    LIMIT 1;
  END IF;

  IF v_mov.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro el movimiento de ingreso retenido.');
  END IF;

  v_caja_result := public.f_patch_tb_operacion_caja_confirmar_retencion(
    p_id := v_mov.id,
    p_id_usuario := COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario),
    p_nombre_usuario := v_nombre_usuario
  );

  IF v_caja_result ? 'error' THEN
    RETURN v_caja_result;
  END IF;

  UPDATE public.tb_operacion_proceso
  SET flag_retenido = false,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(v_nombre_usuario, nombre_usuario_gestor)
  WHERE id = p_id;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(
    COALESCE(v_op.ruta_destino, v_op.ruta_origen),
    COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario)
  );

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_retornar_retencion
Objetivo:
  Devolver una operacion ya liberada hacia la retencion: revierte el impacto en
  caja del abono confirmado, reetiqueta el movimiento INGRESO como RETENIDO y
  vuelve a marcar la operacion como retenida. Solo aplica a retenciones
  liberadas (fecha_retencion no nula) con caja abierta y saldo suficiente.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_retornar_retencion(
  p_id bigint,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_op record;
  v_mov record;
  v_caja record;
  v_nombre_usuario character varying;
  v_estado_retenido_id bigint;
  v_estado_retenido_nombre character varying;
  v_saldo_nuevo numeric;
BEGIN
  RETURN jsonb_build_object(
    'error', 'Las retenciones son informativas y no pueden modificarse.',
    'codigo', 'RETENCION_INFORMATIVA'
  );

  SELECT *
  INTO v_op
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1;

  IF v_op.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Operacion no encontrada.');
  END IF;

  IF v_op.fecha_retencion IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion no paso por retencion.');
  END IF;

  IF p_nombre_usuario_gestor IS NOT NULL THEN
    v_nombre_usuario := p_nombre_usuario_gestor;
  ELSIF p_id_usuario_gestor IS NOT NULL THEN
    SELECT nombre
    INTO v_nombre_usuario
    FROM public.tb_usuario
    WHERE id = p_id_usuario_gestor
    LIMIT 1;
  ELSE
    v_nombre_usuario := COALESCE(v_op.nombre_usuario_gestor, v_op.nombre_usuario);
  END IF;

  SELECT *
  INTO v_mov
  FROM public.tb_operacion_caja c
  WHERE c.id_operacion_proceso = p_id
    AND c.tipo_movimiento = 'INGRESO'
    AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
  ORDER BY c.id
  LIMIT 1;

  IF v_mov.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro el movimiento de ingreso de la operacion.');
  END IF;

  IF v_mov.id_caja_cierre IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'No se puede retornar una retencion con caja cerrada.');
  END IF;

  IF UPPER(COALESCE(v_mov.nombre_estado, '')) = 'RETENIDO' THEN
    RETURN jsonb_build_object('error', 'La retencion ya se encuentra retenida.');
  END IF;

  SELECT id, nombre
  INTO v_estado_retenido_id, v_estado_retenido_nombre
  FROM public.tb_estado
  WHERE UPPER(BTRIM(nombre)) = 'RETENIDO'
  LIMIT 1;

  IF v_estado_retenido_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro el estado RETENIDO.');
  END IF;

  SELECT c.id, c.saldo_actual
  INTO v_caja
  FROM public.tb_caja_operativa c
  WHERE c.id = v_mov.id_caja
  LIMIT 1;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La caja del movimiento no existe.');
  END IF;

  v_saldo_nuevo := COALESCE(v_caja.saldo_actual, 0) - COALESCE(v_mov.monto_ingreso, 0);

  IF v_saldo_nuevo < 0 THEN
    RETURN jsonb_build_object('error', 'Saldo insuficiente en caja para retornar la retencion.');
  END IF;

  UPDATE public.tb_caja_operativa
  SET saldo_actual = v_saldo_nuevo,
      saldo_total = v_saldo_nuevo,
      total_recaudado = GREATEST(COALESCE(total_recaudado, 0) -
        CASE WHEN UPPER(v_mov.tipo_origen) IN ('EFECTIVIZACION', 'PAGO_DEUDA', 'PAGO_DEUDA_DEVOLUCION', 'PAGO_DEUDA_COMISION')
          THEN COALESCE(v_mov.monto_ingreso, 0) ELSE 0 END, 0),
      ingresos = GREATEST(COALESCE(ingresos, 0) -
        CASE WHEN UPPER(v_mov.tipo_origen) NOT IN ('EFECTIVIZACION', 'PAGO_DEUDA', 'PAGO_DEUDA_DEVOLUCION', 'PAGO_DEUDA_COMISION')
          THEN COALESCE(v_mov.monto_ingreso, 0) ELSE 0 END, 0),
      ingresos_retenido = COALESCE(ingresos_retenido, 0) + COALESCE(v_mov.monto_ingreso, 0),
      ganancia = GREATEST(COALESCE(ganancia, 0) - COALESCE(v_mov.monto_ganancia, 0), 0),
      ganancia_retenido = COALESCE(ganancia_retenido, 0) + COALESCE(v_mov.monto_ganancia, 0),
      id_usuario = COALESCE(p_id_usuario_gestor, id_usuario)
  WHERE id = v_mov.id_caja;

  UPDATE public.tb_operacion_caja
  SET id_estado = v_estado_retenido_id,
      nombre_estado = v_estado_retenido_nombre,
      saldo_actual = v_saldo_nuevo,
      id_usuario = COALESCE(p_id_usuario_gestor, id_usuario),
      nombre_usuario = COALESCE(v_nombre_usuario, nombre_usuario)
  WHERE id = v_mov.id;

  UPDATE public.tb_operacion_proceso
  SET flag_retenido = true,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(v_nombre_usuario, nombre_usuario_gestor)
  WHERE id = p_id;

  IF to_regprocedure('public.f_sync_tb_recaudacion_lotes(character varying,bigint,bigint)') IS NOT NULL THEN
    PERFORM public.f_sync_tb_recaudacion_lotes(
      COALESCE(v_op.ruta_destino, v_op.ruta_origen),
      v_op.id_empresa_cuenta_ingreso,
      p_id_usuario_gestor
    );
  END IF;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(rc.ruta, p_id_usuario_gestor)
  FROM public.tb_ruta_operacion_caja rc
  WHERE rc.id_empresa = v_mov.id_empresa
    AND rc.id_empresa_cuenta_bancaria = v_mov.id_empresa_cuenta_bancaria
    AND rc.id_estado = 1;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(
    COALESCE(v_op.ruta_destino, v_op.ruta_origen),
    COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario)
  );

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

-- Reconciliacion controlada de retenciones antiguas. Se asigna cada retencion
-- abierta al primer cierre compatible posterior a su fecha de generacion.
DO $$
BEGIN
  WITH candidatos AS (
    SELECT
      op.id AS id_operacion,
      ch.id AS id_cierre,
      ch.fecha_cierre,
      ROW_NUMBER() OVER (
        PARTITION BY op.id
        ORDER BY ch.fecha_cierre ASC, ch.id ASC
      ) AS orden_cierre
    FROM public.tb_operacion_proceso op
    JOIN public.tb_caja_operativa_cierre ch
      ON (
        (
          ch.id_empresa = op.id_empresa_ingreso
          AND ch.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_ingreso
        )
        OR (
          ch.id_empresa = op.id_empresa_salida
          AND ch.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_salida
        )
      )
    JOIN public.tb_ruta_operacion_caja rc
      ON rc.id_empresa = ch.id_empresa
     AND rc.id_empresa_cuenta_bancaria = ch.id_empresa_cuenta_bancaria
     AND LOWER(BTRIM(COALESCE(rc.ruta, ''))) = LOWER(BTRIM(COALESCE(op.ruta_destino, op.ruta_origen, '')))
     AND rc.id_estado = 1
    WHERE op.id_caja_cierre IS NULL
      AND COALESCE(op.flag_retenido, false) = true
      AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
      AND (
        ch.fecha_apertura IS NULL
        OR COALESCE(op.fecha_pagado, op.fecha_registro) >= ch.fecha_apertura
      )
      AND COALESCE(op.fecha_pagado, op.fecha_registro) <= ch.fecha_cierre
  )
  UPDATE public.tb_operacion_proceso op
  SET id_caja_cierre = u.id_cierre,
      fecha_caja_cierre = u.fecha_cierre
  FROM candidatos u
  WHERE op.id = u.id_operacion
    AND u.orden_cierre = 1
    AND op.id_caja_cierre IS NULL;

  UPDATE public.tb_operacion_caja oc
  SET id_caja_cierre = op.id_caja_cierre,
      fecha_caja_cierre = op.fecha_caja_cierre
  FROM public.tb_operacion_proceso op
  WHERE oc.id_caja_cierre IS NULL
    AND oc.id_operacion_proceso = op.id
    AND op.id_caja_cierre IS NOT NULL
    AND COALESCE(op.flag_retenido, false) = true;
END;
$$;

-- Reconciliacion controlada de movimientos de efectivizacion pendientes que
-- quedaron abiertos despues de un cierre. Solo se asocian al primer cierre
-- compatible posterior a la fecha del movimiento; la operacion permanece
-- pendiente y no se modifica el snapshot historico.
DO $$
BEGIN
  WITH candidatos AS (
    SELECT
      oc.id AS id_movimiento,
      cierre.id AS id_cierre,
      cierre.fecha_cierre
    FROM public.tb_operacion_caja oc
    JOIN public.tb_operacion_proceso op
      ON op.id = oc.id_operacion_proceso
    CROSS JOIN LATERAL (
      SELECT ch.id, ch.fecha_cierre
      FROM public.tb_caja_operativa_cierre ch
      WHERE ch.id_caja = oc.id_caja
        AND ch.fecha_cierre >= oc.fecha_registro
        AND (
          ch.fecha_apertura IS NULL
          OR oc.fecha_registro >= ch.fecha_apertura
        )
      ORDER BY ch.fecha_cierre ASC, ch.id ASC
      LIMIT 1
    ) cierre
    WHERE oc.id_caja_cierre IS NULL
      AND UPPER(BTRIM(COALESCE(oc.tipo_origen, ''))) = 'EFECTIVIZACION'
      AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'INGRESO'
      AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) IN ('PENDIENTE', 'RECHAZADO')
      AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'ELIMINADO'
  )
  UPDATE public.tb_operacion_caja oc
  SET id_caja_cierre = c.id_cierre,
      fecha_caja_cierre = c.fecha_cierre
  FROM candidatos c
  WHERE oc.id = c.id_movimiento;
END;
$$;


SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_get_reporte_cierre',
  'f_get_tb_ruta_operacion_kpi',
  'f_patch_tb_caja_operativa_saldo_inicial',
  'f_post_tb_caja_operativa_cierre',
  'f_post_tb_operacion_caja',
  'f_patch_tb_operacion_proceso_retornar_retencion',
  'f_patch_tb_ruta_operacion_caja',
  'f_patch_tb_ruta_operacion_caja_principal',
  'f_post_tb_caja_operativa',
  'f_post_tb_operacion_caja_desde_proceso',
  'f_post_tb_ruta_operacion_caja',
  'f_apply_tb_operacion_caja_delta',
  'f_sync_tb_ruta_operacion_caja_principal',
  'f_sync_tb_ruta_operacion_kpi_caja',
  'f_patch_tb_operacion_caja_confirmar_retencion',
  'f_patch_tb_operacion_proceso_confirmar_retencion',
  'f_patch_tb_operacion_proceso_retornar_retencion'
)
ORDER BY n.nspname, p.proname;
