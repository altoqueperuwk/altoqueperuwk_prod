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
  id_estado bigint NOT NULL DEFAULT 1,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_ruta_operacion_caja_pkey PRIMARY KEY (id),
  CONSTRAINT tb_ruta_operacion_caja_fk_empresa FOREIGN KEY (id_empresa) REFERENCES public.tb_empresa(id),
  CONSTRAINT tb_ruta_operacion_caja_fk_empresa_cuenta FOREIGN KEY (id_empresa_cuenta_bancaria) REFERENCES public.tb_empresa_cuenta_bancaria(id),
  CONSTRAINT tb_ruta_operacion_caja_fk_estado FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_ruta_operacion_caja_fk_usuario FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id)
);

-- ============================================================================
-- 15. TB_CAJA_OPERATIVA
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
  - flag_retencion queda disponible para futuras reglas de negocio, pero no
    activa todavÃ­a una capa adicional de cÃ¡lculo.
*/
CREATE TABLE IF NOT EXISTS public.tb_caja_operativa (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_empresa bigint NOT NULL,
  id_empresa_cuenta_bancaria bigint NOT NULL,
  saldo_inicial numeric NOT NULL DEFAULT 0,
  saldo_actual numeric NOT NULL DEFAULT 0,
  ingresos numeric NOT NULL DEFAULT 0,
  ingresos_retenido numeric NOT NULL DEFAULT 0,
  gastos numeric NOT NULL DEFAULT 0,
  ganancia numeric NOT NULL DEFAULT 0,
  ganancia_retenido numeric NOT NULL DEFAULT 0,
  salida numeric NOT NULL DEFAULT 0,
  operaciones integer NOT NULL DEFAULT 0,
  flag_retencion boolean NOT NULL DEFAULT false,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_apertura timestamp with time zone NOT NULL DEFAULT now(),
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_caja_operativa_pkey PRIMARY KEY (id),
  CONSTRAINT tb_caja_operativa_unique UNIQUE (id_empresa, id_empresa_cuenta_bancaria),
  CONSTRAINT tb_caja_operativa_saldo_inicial_check CHECK (saldo_inicial >= 0),
  CONSTRAINT tb_caja_operativa_saldo_actual_check CHECK (saldo_actual >= 0),
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
  ingresos numeric,
  ingresos_retenido numeric,
  gastos numeric,
  ganancia numeric,
  ganancia_retenido numeric,
  salida numeric,
  operaciones integer,
  flag_retencion boolean,
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
    c.saldo_actual AS saldo_total,
    c.saldo_actual,
    c.ingresos,
    c.ingresos_retenido,
    c.gastos,
    c.ganancia,
    c.ganancia_retenido,
    c.salida,
    c.operaciones,
    c.flag_retencion,
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
  p_flag_retencion boolean DEFAULT false,
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
    saldo_actual,
    ingresos,
    ingresos_retenido,
    gastos,
    ganancia,
    ganancia_retenido,
    salida,
    operaciones,
    flag_retencion,
    id_estado,
    id_usuario,
    fecha_apertura
  )
  VALUES (
    p_id_empresa,
    p_id_empresa_cuenta_bancaria,
    COALESCE(p_saldo_inicial, 0),
    COALESCE(p_saldo_actual, p_saldo_inicial, 0),
    COALESCE(p_ingresos, 0),
    COALESCE(p_ingresos_retenido, 0),
    COALESCE(p_gastos, 0),
    COALESCE(p_ganancia, 0),
    COALESCE(p_ganancia_retenido, 0),
    COALESCE(p_salida, 0),
    COALESCE(p_operaciones, 0),
    COALESCE(p_flag_retencion, false),
    p_id_estado,
    p_id_usuario,
    COALESCE(p_fecha_apertura, now())
  )
  RETURNING id INTO v_new_id;

  SELECT to_jsonb(x)
  INTO v_result
  FROM public.f_get_tb_caja_operativa(p_id := v_new_id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

/*
Funcion: f_patch_tb_caja_operativa
Objetivo:
  Editar una caja compacta ya existente. Permite cambiar empresa, cuenta, saldos,
  estado, usuario y bandera de retenciÃ³n, manteniendo la validaciÃ³n de coherencia
  entre empresa y cuenta bancaria.
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
  p_flag_retencion boolean DEFAULT NULL,
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

  v_empresa_final := COALESCE(p_id_empresa, v_actual.id_empresa);
  v_cuenta_final := COALESCE(p_id_empresa_cuenta_bancaria, v_actual.id_empresa_cuenta_bancaria);

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
      saldo_actual = COALESCE(p_saldo_actual, saldo_actual),
      ingresos = COALESCE(p_ingresos, ingresos),
      ingresos_retenido = COALESCE(p_ingresos_retenido, ingresos_retenido),
      gastos = COALESCE(p_gastos, gastos),
      ganancia = COALESCE(p_ganancia, ganancia),
      ganancia_retenido = COALESCE(p_ganancia_retenido, ganancia_retenido),
      salida = COALESCE(p_salida, salida),
      operaciones = COALESCE(p_operaciones, operaciones),
      flag_retencion = COALESCE(p_flag_retencion, flag_retencion),
      id_estado = COALESCE(p_id_estado, id_estado),
      id_usuario = COALESCE(p_id_usuario, id_usuario),
      fecha_apertura = COALESCE(p_fecha_apertura, fecha_apertura)
  WHERE id = p_id;

  SELECT to_jsonb(x)
  INTO v_result
  FROM public.f_get_tb_caja_operativa(p_id := p_id) AS x
  LIMIT 1;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 16. TB_ASIGNACION_CAJA_OPERATIVA
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
-- 17. TB_CAJA_OPERATIVA_CIERRE
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
  saldo_actual numeric NOT NULL DEFAULT 0,
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
    ch.saldo_actual AS saldo_total,
    ch.saldo_actual,
    ch.ingresos,
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
  tb_caja_operativa_cierre. No crea movimientos ni redistribuye saldos; Ãºnicamente
  registra el cierre y reinicia la fecha_apertura manteniendo saldo_actual.
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
BEGIN
  SELECT *
  INTO v_caja
  FROM public.tb_caja_operativa
  WHERE id = p_id_caja
  LIMIT 1;

  IF v_caja.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La caja no existe.');
  END IF;

  v_kpi_snapshot := COALESCE(
    p_kpi_snapshot,
    jsonb_build_object(
      'saldo_inicial', v_caja.saldo_inicial,
      'saldo_total', v_caja.saldo_actual,
      'ingresos', COALESCE(v_caja.ingresos, 0),
      'ingresos_retenido', COALESCE(v_caja.ingresos_retenido, 0),
      'gastos', COALESCE(v_caja.gastos, 0),
      'ganancia', COALESCE(v_caja.ganancia, 0),
      'ganancia_retenido', COALESCE(v_caja.ganancia_retenido, 0),
      'salida', COALESCE(v_caja.salida, 0),
      'operaciones', COALESCE(v_caja.operaciones, 0)
    )
  );

  INSERT INTO public.tb_caja_operativa_cierre (
    id_caja,
    id_empresa,
    id_empresa_cuenta_bancaria,
    saldo_inicial,
    saldo_actual,
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
    v_caja.saldo_actual,
    COALESCE(v_caja.ingresos, 0),
    COALESCE(v_caja.ingresos_retenido, 0),
    COALESCE(v_caja.gastos, 0),
    COALESCE(v_caja.ganancia, 0),
    COALESCE(v_caja.ganancia_retenido, 0),
    COALESCE(v_caja.salida, 0),
    COALESCE(v_caja.operaciones, 0),
    COALESCE(p_id_estado, v_caja.id_estado),
    COALESCE(p_id_usuario, v_caja.id_usuario),
    v_caja.fecha_apertura,
    now(),
    v_kpi_snapshot
  )
  RETURNING id INTO v_historial_id;

  UPDATE public.tb_caja_operativa
  SET saldo_inicial = saldo_actual,
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

  SELECT to_jsonb(x)
  INTO v_result
  FROM public.f_get_tb_caja_operativa_cierre(p_id := v_historial_id) AS x
  LIMIT 1;

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
  p_fecha_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'id_caja', t.id_caja,
    'id_operacion_caja_relacionada', t.id_operacion_caja_relacionada,
    'id_operacion_proceso', t.id_operacion_proceso,
    'tipo_origen', t.tipo_origen,
    'tipo_movimiento', t.tipo_movimiento,
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
    'fecha_registro', t.fecha_registro
  )
  FROM public.tb_operacion_caja t
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
  ORDER BY t.fecha_registro DESC, t.id DESC;
$$;

/*
Funcion: f_post_tb_operacion_caja
Objetivo:
  Registrar una operacion de caja individual y actualizar el saldo_actual de la
  caja afectada.

Reglas compactas:
  - INGRESO confirmado: suma monto_ingreso y descuenta monto_gasto;
  - INGRESO retenido: no suma monto_ingreso, solo descuenta monto_gasto;
  - SALIDA: descuenta monto_salida y monto_gasto;
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
  v_delta_gastos numeric := 0;
  v_delta_ganancia numeric := 0;
  v_delta_ganancia_retenido numeric := 0;
  v_delta_salida numeric := 0;
  v_delta_operaciones integer := 0;
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
  LIMIT 1;

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
    WHERE UPPER(nombre) = 'CONFIRMADO'
    LIMIT 1;
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

  IF UPPER(p_tipo_movimiento) = 'INGRESO' THEN
    IF v_estado_retenido_id IS NOT NULL AND v_estado_id = v_estado_retenido_id THEN
      v_saldo_nuevo := v_saldo_anterior - COALESCE(p_monto_gasto, 0);
      v_delta_ingresos_retenido := COALESCE(p_monto_ingreso, 0);
      v_delta_ganancia_retenido := COALESCE(p_monto_ganancia, 0);
    ELSE
      v_saldo_nuevo := v_saldo_anterior + COALESCE(p_monto_ingreso, 0) - COALESCE(p_monto_gasto, 0);
      v_delta_ingresos := COALESCE(p_monto_ingreso, 0);
      v_delta_ganancia := COALESCE(p_monto_ganancia, 0);
    END IF;
    v_delta_gastos := COALESCE(p_monto_gasto, 0);
  ELSIF UPPER(p_tipo_movimiento) = 'SALIDA' THEN
    v_saldo_nuevo := v_saldo_anterior - COALESCE(p_monto_salida, 0) - COALESCE(p_monto_gasto, 0);
    v_delta_gastos := COALESCE(p_monto_gasto, 0);
    v_delta_salida := COALESCE(p_monto_salida, 0);
  ELSE
    RETURN jsonb_build_object('error', 'tipo_movimiento debe ser INGRESO o SALIDA.');
  END IF;

  IF COALESCE(p_flag_contabiliza_operacion, true) THEN
    v_delta_operaciones := 1;
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
      ingresos = COALESCE(ingresos, 0) + v_delta_ingresos,
      ingresos_retenido = COALESCE(ingresos_retenido, 0) + v_delta_ingresos_retenido,
      gastos = COALESCE(gastos, 0) + v_delta_gastos,
      ganancia = COALESCE(ganancia, 0) + v_delta_ganancia,
      ganancia_retenido = COALESCE(ganancia_retenido, 0) + v_delta_ganancia_retenido,
      salida = COALESCE(salida, 0) + v_delta_salida,
      operaciones = COALESCE(operaciones, 0) + v_delta_operaciones,
      id_usuario = COALESCE(p_id_usuario, id_usuario)
  WHERE id = p_id_caja;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_caja(p_id := v_new_id) AS x
    LIMIT 1
  );
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

  v_salida := public.f_post_tb_operacion_caja(
    p_id_caja := p_id_caja_origen,
    p_tipo_origen := 'TRANSFERENCIA_INTERNA',
    p_tipo_movimiento := 'SALIDA',
    p_id_categoria_movimiento := p_id_categoria_movimiento,
    p_nombre_categoria_movimiento := p_nombre_categoria_movimiento,
    p_detalle := COALESCE(p_detalle, 'Transferencia interna entre cajas'),
    p_id_banco_tercero := v_destino.id_banco,
    p_nombre_banco_tercero := v_destino.nombre_banco,
    p_monto_salida := p_monto,
    p_flag_contabiliza_operacion := true,
    p_id_estado := p_id_estado,
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
    p_tipo_origen := 'TRANSFERENCIA_INTERNA',
    p_tipo_movimiento := 'INGRESO',
    p_id_categoria_movimiento := p_id_categoria_movimiento,
    p_nombre_categoria_movimiento := p_nombre_categoria_movimiento,
    p_detalle := COALESCE(p_detalle, 'Transferencia interna entre cajas'),
    p_id_banco_tercero := v_origen.id_banco,
    p_nombre_banco_tercero := v_origen.nombre_banco,
    p_monto_ingreso := p_monto,
    p_flag_contabiliza_operacion := true,
    p_id_estado := p_id_estado,
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

  SELECT id, nombre INTO v_estado_confirmado_id, v_estado_confirmado_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'CONFIRMADO'
  LIMIT 1;

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
      ingresos = COALESCE(ingresos, 0) + COALESCE(v_mov.monto_ingreso, 0),
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

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_caja(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;
