-- ============================================================================
-- COMPENSACIONES - PERSONAL Y CONFIGURACION
-- ============================================================================
-- Objetivo:
--   Modelar la ficha laboral, asignaciones, cuentas de pago y matriz de reglas
--   versionadas sin mezclar este dominio con Operaciones ni Caja.
--
-- Dependencias:
--   01.core_catalogos_permisos.sql
--   02.core_clientes_servicios_empresas_reglas.sql
--
-- Alcance de este archivo:
--   Solo tablas, restricciones, indices y auditoria por snapshot.
--   Los contratos RPC se incorporaran despues de validar el modelo.
-- ============================================================================

-- ============================================================================
-- 1. TB_COMPENSACION_CARGO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_cargo (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  codigo character varying(50) NOT NULL,
  nombre character varying(150) NOT NULL,
  descripcion text,
  orden integer NOT NULL DEFAULT 0,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_cargo_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_cargo_codigo_uk UNIQUE (codigo),
  CONSTRAINT tb_compensacion_cargo_estado_fk
    FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_compensacion_cargo_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_cargo_codigo_ck
    CHECK (btrim(codigo) <> ''),
  CONSTRAINT tb_compensacion_cargo_nombre_ck
    CHECK (btrim(nombre) <> '')
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_cargo_his AS
TABLE public.tb_compensacion_cargo
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_cargo_his
  ON public.tb_compensacion_cargo;
CREATE TRIGGER trg_tb_compensacion_cargo_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_cargo
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 2. TB_COMPENSACION_JORNADA
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_jornada (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  codigo character varying(50) NOT NULL,
  nombre character varying(150) NOT NULL,
  modalidad character varying(30) NOT NULL DEFAULT 'TIEMPO_COMPLETO',
  hora_entrada time without time zone NOT NULL,
  hora_salida time without time zone NOT NULL,
  minutos_tolerancia integer NOT NULL DEFAULT 0,
  minutos_descanso integer NOT NULL DEFAULT 0,
  dias_semana smallint[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5]::smallint[],
  cruza_medianoche boolean NOT NULL DEFAULT false,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_jornada_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_jornada_codigo_uk UNIQUE (codigo),
  CONSTRAINT tb_compensacion_jornada_estado_fk
    FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_compensacion_jornada_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_jornada_modalidad_ck
    CHECK (modalidad IN ('TIEMPO_COMPLETO', 'PART_TIME', 'PERSONALIZADA')),
  CONSTRAINT tb_compensacion_jornada_tolerancia_ck
    CHECK (minutos_tolerancia >= 0),
  CONSTRAINT tb_compensacion_jornada_descanso_ck
    CHECK (minutos_descanso >= 0),
  CONSTRAINT tb_compensacion_jornada_dias_ck
    CHECK (
      cardinality(dias_semana) > 0
      AND dias_semana <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
    )
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_jornada_his AS
TABLE public.tb_compensacion_jornada
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_jornada_his
  ON public.tb_compensacion_jornada;
CREATE TRIGGER trg_tb_compensacion_jornada_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_jornada
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 3. TB_COMPENSACION_COLABORADOR
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_colaborador (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_usuario bigint NOT NULL,
  tipo_documento character varying(20) NOT NULL DEFAULT 'DNI',
  numero_documento character varying(30) NOT NULL,
  nombres character varying(150) NOT NULL,
  apellido_paterno character varying(100),
  apellido_materno character varying(100),
  nombre_completo character varying(300) NOT NULL,
  email character varying(200),
  celular character varying(30),
  codigo_huellero character varying(100),
  fecha_ingreso date NOT NULL,
  fecha_cese date,
  motivo_cese text,
  id_estado bigint NOT NULL,
  id_usuario_registra bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_colaborador_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_colaborador_usuario_uk UNIQUE (id_usuario),
  CONSTRAINT tb_compensacion_colaborador_documento_uk
    UNIQUE (tipo_documento, numero_documento),
  CONSTRAINT tb_compensacion_colaborador_codigo_huellero_uk
    UNIQUE (codigo_huellero),
  CONSTRAINT tb_compensacion_colaborador_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_colaborador_estado_fk
    FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_compensacion_colaborador_usuario_registra_fk
    FOREIGN KEY (id_usuario_registra) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_colaborador_documento_ck
    CHECK (btrim(numero_documento) <> ''),
  CONSTRAINT tb_compensacion_colaborador_nombre_ck
    CHECK (btrim(nombre_completo) <> ''),
  CONSTRAINT tb_compensacion_colaborador_fechas_ck
    CHECK (fecha_cese IS NULL OR fecha_cese >= fecha_ingreso)
);

-- La ficha laboral extiende a tb_usuario; no representa una identidad
-- paralela. Si ya existen filas sin vinculo, el despliegue se detiene para que
-- sean regularizadas antes de activar calculos de compensacion.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tb_compensacion_colaborador
    WHERE id_usuario IS NULL
  ) THEN
    RAISE EXCEPTION
      'Existen colaboradores sin id_usuario. Vinculelos a tb_usuario antes de continuar';
  END IF;

  ALTER TABLE public.tb_compensacion_colaborador
    ALTER COLUMN id_usuario SET NOT NULL;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_compensacion_colaborador_nombre
  ON public.tb_compensacion_colaborador (nombre_completo);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_colaborador_his AS
TABLE public.tb_compensacion_colaborador
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_colaborador_his
  ON public.tb_compensacion_colaborador;
CREATE TRIGGER trg_tb_compensacion_colaborador_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_colaborador
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 4. TB_COMPENSACION_PLAN
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_plan (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  codigo character varying(50) NOT NULL,
  nombre character varying(150) NOT NULL,
  descripcion text,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_plan_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_plan_codigo_uk UNIQUE (codigo),
  CONSTRAINT tb_compensacion_plan_estado_fk
    FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_compensacion_plan_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_plan_codigo_ck CHECK (btrim(codigo) <> ''),
  CONSTRAINT tb_compensacion_plan_nombre_ck CHECK (btrim(nombre) <> '')
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_plan_his AS
TABLE public.tb_compensacion_plan
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_plan_his
  ON public.tb_compensacion_plan;
CREATE TRIGGER trg_tb_compensacion_plan_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_plan
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 5. TB_COMPENSACION_PLAN_VERSION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_plan_version (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_plan bigint NOT NULL,
  numero_version integer NOT NULL,
  nombre character varying(150),
  fecha_inicio date NOT NULL,
  fecha_fin date,
  estado_version character varying(20) NOT NULL DEFAULT 'BORRADOR',
  observacion text,
  fecha_publicacion timestamp with time zone,
  id_usuario_publica bigint,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_plan_version_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_plan_version_numero_uk
    UNIQUE (id_plan, numero_version),
  CONSTRAINT tb_compensacion_plan_version_plan_fk
    FOREIGN KEY (id_plan) REFERENCES public.tb_compensacion_plan(id),
  CONSTRAINT tb_compensacion_plan_version_publica_fk
    FOREIGN KEY (id_usuario_publica) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_plan_version_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_plan_version_numero_ck
    CHECK (numero_version > 0),
  CONSTRAINT tb_compensacion_plan_version_fechas_ck
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
  CONSTRAINT tb_compensacion_plan_version_estado_ck
    CHECK (estado_version IN ('BORRADOR', 'PUBLICADA', 'RETIRADA')),
  CONSTRAINT tb_compensacion_plan_version_publicacion_ck
    CHECK (
      estado_version = 'BORRADOR'
      OR fecha_publicacion IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_compensacion_plan_version_vigencia
  ON public.tb_compensacion_plan_version (id_plan, fecha_inicio, fecha_fin);

CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_plan_version_publicada_inicio
  ON public.tb_compensacion_plan_version (id_plan, fecha_inicio)
  WHERE estado_version = 'PUBLICADA';

CREATE TABLE IF NOT EXISTS public.tb_compensacion_plan_version_his AS
TABLE public.tb_compensacion_plan_version
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_plan_version_his
  ON public.tb_compensacion_plan_version;
CREATE TRIGGER trg_tb_compensacion_plan_version_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_plan_version
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 6. TB_COMPENSACION_CONCEPTO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_concepto (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  codigo character varying(80) NOT NULL,
  nombre character varying(180) NOT NULL,
  categoria character varying(30) NOT NULL,
  naturaleza character varying(20) NOT NULL,
  unidad character varying(30) NOT NULL DEFAULT 'MONTO',
  requiere_evidencia boolean NOT NULL DEFAULT false,
  requiere_aprobacion boolean NOT NULL DEFAULT false,
  permite_excepcion boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_concepto_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_concepto_codigo_uk UNIQUE (codigo),
  CONSTRAINT tb_compensacion_concepto_estado_fk
    FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_compensacion_concepto_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_concepto_categoria_ck
    CHECK (
      categoria IN (
        'SUELDO', 'BONO', 'COMISION', 'PENALIDAD', 'DESCUENTO',
        'INFORMATIVO'
      )
    ),
  CONSTRAINT tb_compensacion_concepto_naturaleza_ck
    CHECK (naturaleza IN ('INGRESO', 'DESCUENTO', 'INFORMATIVO')),
  CONSTRAINT tb_compensacion_concepto_unidad_ck
    CHECK (
      unidad IN (
        'MONTO', 'PORCENTAJE', 'MINUTO', 'HORA', 'DIA', 'UNIDAD', 'PUNTO'
      )
    ),
  CONSTRAINT tb_compensacion_concepto_codigo_ck CHECK (btrim(codigo) <> ''),
  CONSTRAINT tb_compensacion_concepto_nombre_ck CHECK (btrim(nombre) <> '')
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_concepto_his AS
TABLE public.tb_compensacion_concepto
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_concepto_his
  ON public.tb_compensacion_concepto;
CREATE TRIGGER trg_tb_compensacion_concepto_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_concepto
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 7. TB_COMPENSACION_REGLA
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_regla (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_plan_version bigint NOT NULL,
  id_concepto bigint NOT NULL,
  id_cargo bigint,
  id_sucursal bigint,
  tipo_calculo character varying(30) NOT NULL,
  monto numeric(14, 2),
  porcentaje numeric(12, 6),
  valor_minimo numeric(14, 4),
  valor_maximo numeric(14, 4),
  tope_importe numeric(14, 2),
  prioridad integer NOT NULL DEFAULT 0,
  configuracion jsonb NOT NULL DEFAULT '{}'::jsonb,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_regla_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_regla_plan_version_fk
    FOREIGN KEY (id_plan_version)
    REFERENCES public.tb_compensacion_plan_version(id),
  CONSTRAINT tb_compensacion_regla_concepto_fk
    FOREIGN KEY (id_concepto) REFERENCES public.tb_compensacion_concepto(id),
  CONSTRAINT tb_compensacion_regla_cargo_fk
    FOREIGN KEY (id_cargo) REFERENCES public.tb_compensacion_cargo(id),
  CONSTRAINT tb_compensacion_regla_sucursal_fk
    FOREIGN KEY (id_sucursal) REFERENCES public.tb_sucursal(id),
  CONSTRAINT tb_compensacion_regla_estado_fk
    FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_compensacion_regla_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_regla_tipo_ck
    CHECK (
      tipo_calculo IN (
        'FIJO', 'PORCENTAJE', 'POR_MINUTO', 'POR_HORA', 'POR_DIA',
        'POR_UNIDAD', 'FORMULA'
      )
    ),
  CONSTRAINT tb_compensacion_regla_monto_ck
    CHECK (monto IS NULL OR monto >= 0),
  CONSTRAINT tb_compensacion_regla_porcentaje_ck
    CHECK (porcentaje IS NULL OR porcentaje BETWEEN 0 AND 100),
  CONSTRAINT tb_compensacion_regla_rango_ck
    CHECK (
      valor_minimo IS NULL
      OR valor_maximo IS NULL
      OR valor_maximo >= valor_minimo
    ),
  CONSTRAINT tb_compensacion_regla_tope_ck
    CHECK (tope_importe IS NULL OR tope_importe >= 0),
  CONSTRAINT tb_compensacion_regla_valor_ck
    CHECK (
      (tipo_calculo = 'PORCENTAJE' AND porcentaje IS NOT NULL)
      OR (tipo_calculo = 'FORMULA' AND configuracion <> '{}'::jsonb)
      OR (
        tipo_calculo IN (
          'FIJO', 'POR_MINUTO', 'POR_HORA', 'POR_DIA', 'POR_UNIDAD'
        )
        AND monto IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_regla_aplicacion
  ON public.tb_compensacion_regla (
    id_plan_version,
    id_concepto,
    COALESCE(id_cargo, 0),
    COALESCE(id_sucursal, 0),
    prioridad
  );

CREATE INDEX IF NOT EXISTS idx_compensacion_regla_concepto
  ON public.tb_compensacion_regla (id_concepto, id_estado);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_regla_his AS
TABLE public.tb_compensacion_regla
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_regla_his
  ON public.tb_compensacion_regla;
CREATE TRIGGER trg_tb_compensacion_regla_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_regla
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 8. TB_COMPENSACION_META_SEDE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_meta_sede (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_plan_version bigint NOT NULL,
  id_sucursal bigint NOT NULL,
  codigo_indicador character varying(80) NOT NULL,
  periodo date NOT NULL,
  valor_meta numeric(16, 4) NOT NULL,
  unidad character varying(30) NOT NULL DEFAULT 'MONTO',
  configuracion jsonb NOT NULL DEFAULT '{}'::jsonb,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_meta_sede_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_meta_sede_uk
    UNIQUE (id_plan_version, id_sucursal, codigo_indicador, periodo),
  CONSTRAINT tb_compensacion_meta_sede_plan_version_fk
    FOREIGN KEY (id_plan_version)
    REFERENCES public.tb_compensacion_plan_version(id),
  CONSTRAINT tb_compensacion_meta_sede_sucursal_fk
    FOREIGN KEY (id_sucursal) REFERENCES public.tb_sucursal(id),
  CONSTRAINT tb_compensacion_meta_sede_estado_fk
    FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_compensacion_meta_sede_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_meta_sede_periodo_ck
    CHECK (periodo = date_trunc('month', periodo)::date),
  CONSTRAINT tb_compensacion_meta_sede_valor_ck
    CHECK (valor_meta >= 0),
  CONSTRAINT tb_compensacion_meta_sede_unidad_ck
    CHECK (unidad IN ('MONTO', 'PORCENTAJE', 'UNIDAD', 'PUNTO'))
);

CREATE INDEX IF NOT EXISTS idx_compensacion_meta_sede_periodo
  ON public.tb_compensacion_meta_sede (periodo, id_sucursal);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_meta_sede_his AS
TABLE public.tb_compensacion_meta_sede
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_meta_sede_his
  ON public.tb_compensacion_meta_sede;
CREATE TRIGGER trg_tb_compensacion_meta_sede_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_meta_sede
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 9. TB_COMPENSACION_ASIGNACION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_asignacion (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_colaborador bigint NOT NULL,
  id_cargo bigint NOT NULL,
  id_sucursal bigint NOT NULL,
  id_jornada bigint NOT NULL,
  id_plan bigint NOT NULL,
  fecha_inicio date NOT NULL,
  fecha_fin date,
  modalidad character varying(30) NOT NULL DEFAULT 'PRESENCIAL',
  observacion text,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_asignacion_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_asignacion_colaborador_fk
    FOREIGN KEY (id_colaborador)
    REFERENCES public.tb_compensacion_colaborador(id),
  CONSTRAINT tb_compensacion_asignacion_cargo_fk
    FOREIGN KEY (id_cargo) REFERENCES public.tb_compensacion_cargo(id),
  CONSTRAINT tb_compensacion_asignacion_sucursal_fk
    FOREIGN KEY (id_sucursal) REFERENCES public.tb_sucursal(id),
  CONSTRAINT tb_compensacion_asignacion_jornada_fk
    FOREIGN KEY (id_jornada) REFERENCES public.tb_compensacion_jornada(id),
  CONSTRAINT tb_compensacion_asignacion_plan_fk
    FOREIGN KEY (id_plan) REFERENCES public.tb_compensacion_plan(id),
  CONSTRAINT tb_compensacion_asignacion_estado_fk
    FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_compensacion_asignacion_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_asignacion_fechas_ck
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
  CONSTRAINT tb_compensacion_asignacion_modalidad_ck
    CHECK (modalidad IN ('PRESENCIAL', 'REMOTO', 'HIBRIDO'))
);

CREATE INDEX IF NOT EXISTS idx_compensacion_asignacion_colaborador_vigencia
  ON public.tb_compensacion_asignacion (
    id_colaborador,
    fecha_inicio,
    fecha_fin
  );

CREATE INDEX IF NOT EXISTS idx_compensacion_asignacion_sucursal
  ON public.tb_compensacion_asignacion (id_sucursal, id_cargo);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_asignacion_his AS
TABLE public.tb_compensacion_asignacion
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_asignacion_his
  ON public.tb_compensacion_asignacion;
CREATE TRIGGER trg_tb_compensacion_asignacion_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_asignacion
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 10. TB_COMPENSACION_CUENTA_PAGO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_cuenta_pago (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_colaborador bigint NOT NULL,
  id_banco bigint NOT NULL,
  tipo_cuenta character varying(30) NOT NULL,
  moneda character varying(3) NOT NULL DEFAULT 'PEN',
  numero_cuenta character varying(80) NOT NULL,
  numero_cci character varying(80),
  titular character varying(300) NOT NULL,
  es_principal boolean NOT NULL DEFAULT false,
  fecha_inicio date NOT NULL,
  fecha_fin date,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_cuenta_pago_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_cuenta_pago_colaborador_fk
    FOREIGN KEY (id_colaborador)
    REFERENCES public.tb_compensacion_colaborador(id),
  CONSTRAINT tb_compensacion_cuenta_pago_banco_fk
    FOREIGN KEY (id_banco) REFERENCES public.tb_banco(id),
  CONSTRAINT tb_compensacion_cuenta_pago_estado_fk
    FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_compensacion_cuenta_pago_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_cuenta_pago_tipo_ck
    CHECK (tipo_cuenta IN ('AHORROS', 'CORRIENTE', 'OTRA')),
  CONSTRAINT tb_compensacion_cuenta_pago_moneda_ck
    CHECK (moneda IN ('PEN', 'USD')),
  CONSTRAINT tb_compensacion_cuenta_pago_numero_ck
    CHECK (btrim(numero_cuenta) <> ''),
  CONSTRAINT tb_compensacion_cuenta_pago_fechas_ck
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_cuenta_pago_principal
  ON public.tb_compensacion_cuenta_pago (id_colaborador)
  WHERE es_principal AND fecha_fin IS NULL;

CREATE INDEX IF NOT EXISTS idx_compensacion_cuenta_pago_colaborador
  ON public.tb_compensacion_cuenta_pago (id_colaborador, fecha_inicio, fecha_fin);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_cuenta_pago_his AS
TABLE public.tb_compensacion_cuenta_pago
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_cuenta_pago_his
  ON public.tb_compensacion_cuenta_pago;
CREATE TRIGGER trg_tb_compensacion_cuenta_pago_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_cuenta_pago
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 11. TB_COMPENSACION_EXCEPCION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_excepcion (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_colaborador bigint NOT NULL,
  id_concepto bigint NOT NULL,
  tipo_calculo character varying(30) NOT NULL,
  monto numeric(14, 2),
  porcentaje numeric(12, 6),
  configuracion jsonb NOT NULL DEFAULT '{}'::jsonb,
  fecha_inicio date NOT NULL,
  fecha_fin date,
  motivo text NOT NULL,
  estado_aprobacion character varying(20) NOT NULL DEFAULT 'PENDIENTE',
  id_usuario_aprueba bigint,
  fecha_aprobacion timestamp with time zone,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_excepcion_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_excepcion_colaborador_fk
    FOREIGN KEY (id_colaborador)
    REFERENCES public.tb_compensacion_colaborador(id),
  CONSTRAINT tb_compensacion_excepcion_concepto_fk
    FOREIGN KEY (id_concepto) REFERENCES public.tb_compensacion_concepto(id),
  CONSTRAINT tb_compensacion_excepcion_aprueba_fk
    FOREIGN KEY (id_usuario_aprueba) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_excepcion_estado_fk
    FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_compensacion_excepcion_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_excepcion_tipo_ck
    CHECK (
      tipo_calculo IN (
        'FIJO', 'PORCENTAJE', 'POR_MINUTO', 'POR_HORA', 'POR_DIA',
        'POR_UNIDAD', 'FORMULA'
      )
    ),
  CONSTRAINT tb_compensacion_excepcion_estado_aprobacion_ck
    CHECK (
      estado_aprobacion IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'ANULADA')
    ),
  CONSTRAINT tb_compensacion_excepcion_fechas_ck
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
  CONSTRAINT tb_compensacion_excepcion_monto_ck
    CHECK (monto IS NULL OR monto >= 0),
  CONSTRAINT tb_compensacion_excepcion_porcentaje_ck
    CHECK (porcentaje IS NULL OR porcentaje BETWEEN 0 AND 100),
  CONSTRAINT tb_compensacion_excepcion_motivo_ck
    CHECK (btrim(motivo) <> ''),
  CONSTRAINT tb_compensacion_excepcion_aprobacion_ck
    CHECK (
      estado_aprobacion NOT IN ('APROBADA', 'RECHAZADA')
      OR (id_usuario_aprueba IS NOT NULL AND fecha_aprobacion IS NOT NULL)
    ),
  CONSTRAINT tb_compensacion_excepcion_valor_ck
    CHECK (
      (tipo_calculo = 'PORCENTAJE' AND porcentaje IS NOT NULL)
      OR (tipo_calculo = 'FORMULA' AND configuracion <> '{}'::jsonb)
      OR (
        tipo_calculo IN (
          'FIJO', 'POR_MINUTO', 'POR_HORA', 'POR_DIA', 'POR_UNIDAD'
        )
        AND monto IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_compensacion_excepcion_vigencia
  ON public.tb_compensacion_excepcion (
    id_colaborador,
    id_concepto,
    fecha_inicio,
    fecha_fin
  );

CREATE TABLE IF NOT EXISTS public.tb_compensacion_excepcion_his AS
TABLE public.tb_compensacion_excepcion
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_excepcion_his
  ON public.tb_compensacion_excepcion;
CREATE TRIGGER trg_tb_compensacion_excepcion_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_excepcion
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 12. TB_COMPENSACION_ACCESO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_acceso (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_usuario bigint NOT NULL,
  recurso character varying(30) NOT NULL,
  alcance character varying(20) NOT NULL DEFAULT 'PROPIO',
  id_sucursal bigint,
  puede_consultar boolean NOT NULL DEFAULT false,
  puede_registrar boolean NOT NULL DEFAULT false,
  puede_editar boolean NOT NULL DEFAULT false,
  puede_revisar boolean NOT NULL DEFAULT false,
  puede_aprobar boolean NOT NULL DEFAULT false,
  puede_pagar boolean NOT NULL DEFAULT false,
  puede_cerrar boolean NOT NULL DEFAULT false,
  puede_configurar boolean NOT NULL DEFAULT false,
  id_estado bigint NOT NULL,
  id_usuario_registra bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_acceso_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_acceso_usuario_recurso_uk
    UNIQUE (id_usuario, recurso),
  CONSTRAINT tb_compensacion_acceso_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_acceso_sucursal_fk
    FOREIGN KEY (id_sucursal) REFERENCES public.tb_sucursal(id),
  CONSTRAINT tb_compensacion_acceso_estado_fk
    FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_compensacion_acceso_usuario_registra_fk
    FOREIGN KEY (id_usuario_registra) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_acceso_recurso_ck
    CHECK (
      recurso IN (
        'RESUMEN', 'COLABORADORES', 'ASISTENCIA', 'EVIDENCIAS',
        'INCIDENCIAS', 'LIQUIDACIONES', 'CIERRES', 'CONFIGURACION',
        'REPORTES'
      )
    ),
  CONSTRAINT tb_compensacion_acceso_alcance_ck
    CHECK (alcance IN ('PROPIO', 'SEDE', 'GLOBAL')),
  CONSTRAINT tb_compensacion_acceso_sucursal_ck
    CHECK (
      (alcance = 'SEDE' AND id_sucursal IS NOT NULL)
      OR (alcance IN ('PROPIO', 'GLOBAL') AND id_sucursal IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_compensacion_acceso_usuario_estado
  ON public.tb_compensacion_acceso (id_usuario, id_estado);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_acceso_his AS
TABLE public.tb_compensacion_acceso
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_acceso_his
  ON public.tb_compensacion_acceso;
CREATE TRIGGER trg_tb_compensacion_acceso_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_acceso
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 13. TB_COMPENSACION_PENALIDAD_TIPO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_penalidad_tipo (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_plan_version bigint NOT NULL,
  codigo character varying(80) NOT NULL,
  nombre character varying(180) NOT NULL,
  descripcion text,
  id_cargo bigint,
  id_concepto_descuento bigint NOT NULL,
  id_concepto_bono_reportante bigint,
  monto_referencia numeric(14, 2) NOT NULL,
  monto_bono_reportante numeric(14, 2),
  requiere_respuesta boolean NOT NULL DEFAULT true,
  configuracion jsonb NOT NULL DEFAULT '{}'::jsonb,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_penalidad_tipo_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_penalidad_tipo_codigo_uk
    UNIQUE (id_plan_version, codigo),
  CONSTRAINT tb_compensacion_penalidad_tipo_plan_version_fk
    FOREIGN KEY (id_plan_version)
    REFERENCES public.tb_compensacion_plan_version(id),
  CONSTRAINT tb_compensacion_penalidad_tipo_cargo_fk
    FOREIGN KEY (id_cargo) REFERENCES public.tb_compensacion_cargo(id),
  CONSTRAINT tb_compensacion_penalidad_tipo_descuento_fk
    FOREIGN KEY (id_concepto_descuento)
    REFERENCES public.tb_compensacion_concepto(id),
  CONSTRAINT tb_compensacion_penalidad_tipo_bono_fk
    FOREIGN KEY (id_concepto_bono_reportante)
    REFERENCES public.tb_compensacion_concepto(id),
  CONSTRAINT tb_compensacion_penalidad_tipo_estado_fk
    FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_compensacion_penalidad_tipo_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_penalidad_tipo_monto_ck
    CHECK (monto_referencia >= 0),
  CONSTRAINT tb_compensacion_penalidad_tipo_bono_ck
    CHECK (monto_bono_reportante IS NULL OR monto_bono_reportante >= 0),
  CONSTRAINT tb_compensacion_penalidad_tipo_codigo_ck
    CHECK (btrim(codigo) <> ''),
  CONSTRAINT tb_compensacion_penalidad_tipo_nombre_ck
    CHECK (btrim(nombre) <> '')
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_penalidad_tipo_his AS
TABLE public.tb_compensacion_penalidad_tipo
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_penalidad_tipo_his
  ON public.tb_compensacion_penalidad_tipo;
CREATE TRIGGER trg_tb_compensacion_penalidad_tipo_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_penalidad_tipo
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- Nota de integridad temporal:
-- Las funciones de escritura deberan impedir solapamientos entre asignaciones,
-- versiones publicadas y excepciones aprobadas. No se agrega EXCLUDE USING gist
-- para evitar introducir la extension btree_gist como dependencia global.

-- ============================================================================
-- 15. CONFIGURACION BETA ACTUAL - ESQUEMA 12
-- ============================================================================
-- Fuente principal: ESQUEMA 12.pdf y confirmaciones del cliente del 21/09/2026.
-- La version se conserva en BORRADOR para permitir validacion con el cliente.
-- Los INSERT y UPDATE son idempotentes para mantener la beta sincronizada.
-- Inferencias beta registradas en la observacion de la version:
-- Confirmado por el cliente:
--   * Jornada general: lunes a sabado, 09:00 a 18:00, tolerancia 5 minutos.
--   * Jornada part-time: lunes a sabado, 08:00 a 12:00, tolerancia 5 minutos.
--   * Jornada part-time temporal: lunes a sabado, 14:00 a 18:00, tolerancia 5 minutos.
--   * Todas las jornadas incluyen 60 minutos de refrigerio.
-- Inferencias pendientes de confirmacion:
--   * Ninguna. Las definiciones abiertas fueron confirmadas el 21/09/2026.

DO $seed_esquema_9$
DECLARE
  v_id_estado bigint;
  v_id_usuario bigint;
  v_id_plan bigint;
  v_id_version bigint;
BEGIN
  SELECT e.id
  INTO v_id_estado
  FROM public.tb_estado e
  WHERE UPPER(BTRIM(e.nombre)) = 'ACTIVO'
  ORDER BY e.id
  LIMIT 1;

  IF v_id_estado IS NULL THEN
    RAISE EXCEPTION 'No existe el estado ACTIVO requerido para la configuracion beta';
  END IF;

  SELECT u.id
  INTO v_id_usuario
  FROM public.tb_usuario u
  JOIN public.tb_estado e ON e.id = u.id_estado
  WHERE UPPER(BTRIM(e.nombre)) = 'ACTIVO'
    AND (COALESCE(u.flag_super_admin, false) OR u.id_rol = 1)
  ORDER BY COALESCE(u.flag_super_admin, false) DESC, u.id
  LIMIT 1;

  INSERT INTO public.tb_compensacion_cargo (
    codigo, nombre, descripcion, orden, id_estado, id_usuario
  )
  SELECT v.codigo, v.nombre, v.descripcion, v.orden, v_id_estado, v_id_usuario
  FROM (VALUES
    ('ATENCION_CLIENTE', 'Atencion al Cliente', 'Atencion, registro y seguimiento comercial.', 10),
    ('JEFE_TIENDA', 'Jefe de Tienda', 'Liderazgo, supervision y control de sede.', 20),
    ('FACTURACION', 'Facturacion', 'Auditoria final, correccion y emision de comprobantes.', 30),
    ('JEFE_SUPERIOR_PAGOS', 'Jefe Superior de Pagos', 'Lider operativo de la sede Lince, responsable principal de BBVA, SafetyPay y soporte cruzado.', 40),
    ('OPERADOR_ALTA_DEMANDA', 'Operador de Alta Demanda', 'Responsable principal de BCP, monitoreo de flujos y soporte multibanco.', 50),
    ('ENCARGADO_CARTERA_MEDIA', 'Encargado de Cartera Media', 'Perfil multibanco autonomo con asignacion dinamica por demanda.', 60),
    ('ASISTENTE_VIRTUAL_PAGOS', 'Asistente Virtual de Pagos', 'Perfil remoto para carteras de menor flujo, soporte logistico digital y descanso los jueves.', 70),
    ('DISENO_MARKETING', 'Diseno y Marketing', 'Generacion de demanda, contenido y recuperacion.', 80)
  ) AS v(codigo, nombre, descripcion, orden)
  ON CONFLICT (codigo) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      descripcion = EXCLUDED.descripcion,
      orden = EXCLUDED.orden,
      id_estado = EXCLUDED.id_estado,
      fecha_actualizacion = now()
  WHERE (
    tb_compensacion_cargo.nombre,
    tb_compensacion_cargo.descripcion,
    tb_compensacion_cargo.orden,
    tb_compensacion_cargo.id_estado
  ) IS DISTINCT FROM (
    EXCLUDED.nombre,
    EXCLUDED.descripcion,
    EXCLUDED.orden,
    EXCLUDED.id_estado
  );

  INSERT INTO public.tb_compensacion_jornada (
    codigo, nombre, modalidad, hora_entrada, hora_salida,
    minutos_tolerancia, minutos_descanso, dias_semana, cruza_medianoche,
    id_estado, id_usuario
  ) VALUES
    (
      'GENERAL_LUN_SAB_09_18', 'General lunes a sabado 09:00-18:00',
      'TIEMPO_COMPLETO', TIME '09:00', TIME '18:00', 5, 60,
      ARRAY[1, 2, 3, 4, 5, 6]::smallint[], false, v_id_estado, v_id_usuario
    ),
    (
      'PART_TIME_LUN_SAB_08_12', 'Part-time lunes a sabado 08:00-12:00',
      'PART_TIME', TIME '08:00', TIME '12:00', 5, 60,
      ARRAY[1, 2, 3, 4, 5, 6]::smallint[], false, v_id_estado, v_id_usuario
    ),
    (
      'PART_TIME_LUN_SAB_14_18_TEMPORAL', 'Part-time temporal lunes a sabado 14:00-18:00',
      'PART_TIME', TIME '14:00', TIME '18:00', 5, 60,
      ARRAY[1, 2, 3, 4, 5, 6]::smallint[], false, v_id_estado, v_id_usuario
    ),
    (
      'VIRTUAL_PAGOS_DESCANSO_JUEVES', 'Virtual Pagos sin marcacion y con descanso jueves',
      'PERSONALIZADA', TIME '09:00', TIME '18:00', 0, 60,
      ARRAY[1, 2, 3, 5, 6]::smallint[], false, v_id_estado, v_id_usuario
    )
  ON CONFLICT (codigo) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      modalidad = EXCLUDED.modalidad,
      hora_entrada = EXCLUDED.hora_entrada,
      hora_salida = EXCLUDED.hora_salida,
      minutos_tolerancia = EXCLUDED.minutos_tolerancia,
      minutos_descanso = EXCLUDED.minutos_descanso,
      dias_semana = EXCLUDED.dias_semana,
      cruza_medianoche = EXCLUDED.cruza_medianoche,
      id_estado = EXCLUDED.id_estado,
      fecha_actualizacion = now()
  WHERE (
    tb_compensacion_jornada.nombre,
    tb_compensacion_jornada.modalidad,
    tb_compensacion_jornada.hora_entrada,
    tb_compensacion_jornada.hora_salida,
    tb_compensacion_jornada.minutos_tolerancia,
    tb_compensacion_jornada.minutos_descanso,
    tb_compensacion_jornada.dias_semana,
    tb_compensacion_jornada.cruza_medianoche,
    tb_compensacion_jornada.id_estado
  ) IS DISTINCT FROM (
    EXCLUDED.nombre,
    EXCLUDED.modalidad,
    EXCLUDED.hora_entrada,
    EXCLUDED.hora_salida,
    EXCLUDED.minutos_tolerancia,
    EXCLUDED.minutos_descanso,
    EXCLUDED.dias_semana,
    EXCLUDED.cruza_medianoche,
    EXCLUDED.id_estado
  );

  INSERT INTO public.tb_compensacion_concepto (
    codigo, nombre, categoria, naturaleza, unidad,
    requiere_evidencia, requiere_aprobacion, permite_excepcion,
    orden, id_estado, id_usuario
  )
  SELECT
    v.codigo, v.nombre, v.categoria, v.naturaleza, v.unidad,
    v.requiere_evidencia, v.requiere_aprobacion, true,
    v.orden, v_id_estado, v_id_usuario
  FROM (VALUES
    ('SUELDO_BASE', 'Sueldo base', 'SUELDO', 'INGRESO', 'MONTO', false, false, 10),
    ('BONO_PUNTUALIDAD', 'Bono puntualidad y disciplina', 'BONO', 'INGRESO', 'MONTO', true, true, 20),
    ('BONO_COLABORADOR_ATENCIONES', 'Bono colaborador del mes por atenciones', 'BONO', 'INGRESO', 'MONTO', true, true, 30),
    ('BONO_COLABORADOR_CALIFICACIONES', 'Bono colaborador del mes por calificaciones', 'BONO', 'INGRESO', 'MONTO', true, true, 40),
    ('BONO_INNOVACION', 'Bono por propuesta de innovacion', 'BONO', 'INGRESO', 'MONTO', true, true, 50),
    ('BONO_SEGURIDAD_TARJETA', 'Bono seguridad tarjeta', 'BONO', 'INGRESO', 'UNIDAD', true, true, 60),
    ('BONO_META_AREA', 'Bono por meta de area', 'BONO', 'INGRESO', 'MONTO', true, true, 70),
    ('BONO_META_SEDE', 'Bono por meta de sede SafetyPay', 'BONO', 'INGRESO', 'MONTO', true, true, 80),
    ('BONO_REGISTRO_PRESENCIAL', 'Bono atencion o registro presencial', 'BONO', 'INGRESO', 'UNIDAD', true, true, 90),
    ('BONO_LIDERAZGO', 'Bono liderazgo', 'BONO', 'INGRESO', 'UNIDAD', true, true, 100),
    ('BONO_DETECCION_ERROR_PAGO', 'Bono deteccion de error de pago', 'BONO', 'INGRESO', 'UNIDAD', true, true, 110),
    ('BONO_OPERACION_EXTRA', 'Bono operacion extra', 'BONO', 'INGRESO', 'UNIDAD', true, true, 120),
    ('BONO_CUADRE_PERFECTO', 'Bono cuadre perfecto', 'BONO', 'INGRESO', 'MONTO', true, true, 130),
    ('BONO_REPORTE_ABANDONO', 'Bono reporte de abandono comercial', 'BONO', 'INGRESO', 'UNIDAD', true, true, 140),
    ('BONO_DETECCION_ERROR_MANUAL', 'Bono deteccion de error manual o codigo', 'BONO', 'INGRESO', 'UNIDAD', true, true, 150),
    ('BONO_VIDEO_VIRAL', 'Bono por video viral', 'BONO', 'INGRESO', 'MONTO', true, true, 160),
    ('BONO_RECUPERACION', 'Bono recuperacion de cliente', 'BONO', 'INGRESO', 'UNIDAD', true, true, 170),
    ('BONO_CUMPLIMIENTO_VIRTUAL', 'Bono cumplimiento general del asistente virtual', 'BONO', 'INGRESO', 'MONTO', true, true, 180),
    ('BONO_REPORTE_INCIDENCIA', 'Bono por reporte de incidencia', 'BONO', 'INGRESO', 'UNIDAD', true, true, 190),
    ('COMISION_REGISTRO_EFECTIVIZACION', 'Registro nuevo y efectivizacion', 'COMISION', 'INGRESO', 'UNIDAD', false, false, 200),
    ('COMISION_CALIFICACION_PRESENCIAL', 'Atencion presencial calificada', 'COMISION', 'INGRESO', 'UNIDAD', true, true, 210),
    ('COMISION_REFERIDO', 'Comision por referido', 'COMISION', 'INGRESO', 'PORCENTAJE', true, true, 220),
    ('COMISION_LLAMADA', 'Llamada o contacto', 'COMISION', 'INGRESO', 'UNIDAD', true, true, 230),
    ('COMISION_TIKTOK_LIVE', 'Comision TikTok Live', 'COMISION', 'INGRESO', 'UNIDAD', true, true, 240),
    ('COMISION_AUDITORIA_ACTIVA', 'Comision auditoria activa', 'COMISION', 'INGRESO', 'UNIDAD', true, true, 250),
    ('COMISION_AUDITAR_NUEVOS', 'Auditar nuevos registros y efectivizacion', 'COMISION', 'INGRESO', 'UNIDAD', true, true, 260),
    ('COMISION_ALERTA_TEMPRANA', 'Co-fiscalizacion o alerta temprana', 'COMISION', 'INGRESO', 'UNIDAD', true, true, 270),
    ('PENALIDAD_TARDANZA', 'Penalidad por tardanza', 'PENALIDAD', 'DESCUENTO', 'MINUTO', false, false, 300),
    ('PENALIDAD_GENERICA', 'Penalidad por incidencia', 'PENALIDAD', 'DESCUENTO', 'MONTO', true, true, 310)
  ) AS v(
    codigo, nombre, categoria, naturaleza, unidad,
    requiere_evidencia, requiere_aprobacion, orden
  )
  ON CONFLICT (codigo) DO NOTHING;

  INSERT INTO public.tb_compensacion_plan (
    codigo, nombre, descripcion, id_estado, id_usuario
  ) VALUES (
    'PLAN_COMPENSACIONES_GENERAL',
    'Plan general de compensaciones',
    'Matriz beta basada en ESQUEMA 12.pdf.',
    v_id_estado,
    v_id_usuario
  )
  ON CONFLICT (codigo) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      descripcion = EXCLUDED.descripcion,
      fecha_actualizacion = now()
  WHERE (
    tb_compensacion_plan.nombre,
    tb_compensacion_plan.descripcion
  ) IS DISTINCT FROM (
    EXCLUDED.nombre,
    EXCLUDED.descripcion
  );

  SELECT p.id
  INTO v_id_plan
  FROM public.tb_compensacion_plan p
  WHERE p.codigo = 'PLAN_COMPENSACIONES_GENERAL';

  INSERT INTO public.tb_compensacion_plan_version (
    id_plan, numero_version, nombre, fecha_inicio, estado_version,
    observacion, id_usuario
  ) VALUES (
    v_id_plan,
    1,
    'ESQUEMA 12 - Beta actual',
    DATE '2026-09-01',
    'BORRADOR',
    'Beta ESQUEMA 12 confirmada el 21/09/2026: jornadas de lunes a sabado con tolerancia de 5 minutos y 60 minutos de refrigerio; personal virtual sin marcacion ni bono de cumplimiento; metas SafetyPay vigentes; error de cuadro 30/60/90 sobre comisiones del mes; error critico por 100% del monto perdido, fraccionable en varios meses.',
    v_id_usuario
  )
  ON CONFLICT (id_plan, numero_version) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      observacion = EXCLUDED.observacion,
      fecha_actualizacion = now()
  WHERE tb_compensacion_plan_version.estado_version = 'BORRADOR'
    AND (
      tb_compensacion_plan_version.nombre,
      tb_compensacion_plan_version.observacion
    ) IS DISTINCT FROM (
      EXCLUDED.nombre,
      EXCLUDED.observacion
    );

  SELECT pv.id
  INTO v_id_version
  FROM public.tb_compensacion_plan_version pv
  WHERE pv.id_plan = v_id_plan
    AND pv.numero_version = 1;

  INSERT INTO public.tb_compensacion_regla (
    id_plan_version, id_concepto, id_cargo, id_sucursal,
    tipo_calculo, monto, porcentaje, valor_minimo, valor_maximo,
    tope_importe, prioridad, configuracion, id_estado, id_usuario
  )
  SELECT
    v_id_version, co.id, ca.id, NULL,
    v.tipo_calculo, v.monto, v.porcentaje, NULL, NULL,
    NULL, v.prioridad, v.configuracion::jsonb, v_id_estado, v_id_usuario
  FROM (VALUES
    ('ATENCION_CLIENTE', 'SUELDO_BASE', 'FIJO', 1250.00::numeric, NULL::numeric, 100, '{"metodo_prorrateo":"DIAS_CALENDARIO","fuente":"ESQUEMA_9_PDF"}'),
    ('JEFE_TIENDA', 'SUELDO_BASE', 'FIJO', 1500.00, NULL, 100, '{"metodo_prorrateo":"DIAS_CALENDARIO","fuente":"ESQUEMA_9_PDF"}'),
    ('FACTURACION', 'SUELDO_BASE', 'FIJO', 1500.00, NULL, 100, '{"metodo_prorrateo":"DIAS_CALENDARIO","fuente":"ESQUEMA_9_PDF"}'),
    ('JEFE_SUPERIOR_PAGOS', 'SUELDO_BASE', 'FIJO', 3000.00, NULL, 100, '{"metodo_prorrateo":"DIAS_CALENDARIO","fuente":"ESQUEMA_9_PDF"}'),
    ('OPERADOR_ALTA_DEMANDA', 'SUELDO_BASE', 'FIJO', 2500.00, NULL, 100, '{"metodo_prorrateo":"DIAS_CALENDARIO","fuente":"ESQUEMA_9_PDF"}'),
    ('ENCARGADO_CARTERA_MEDIA', 'SUELDO_BASE', 'FIJO', 2000.00, NULL, 100, '{"metodo_prorrateo":"DIAS_CALENDARIO","fuente":"ESQUEMA_9_PDF"}'),
    ('ASISTENTE_VIRTUAL_PAGOS', 'SUELDO_BASE', 'FIJO', 1500.00, NULL, 100, '{"metodo_prorrateo":"DIAS_CALENDARIO","fuente":"ESQUEMA_12_MD"}'),
    ('DISENO_MARKETING', 'SUELDO_BASE', 'FIJO', 1500.00, NULL, 100, '{"metodo_prorrateo":"DIAS_CALENDARIO","fuente":"ESQUEMA_9_PDF"}'),

    ('ATENCION_CLIENTE', 'BONO_PUNTUALIDAD', 'FIJO', 50.00, NULL, 50, '{"fuente":"EVIDENCIA_MENSUAL"}'),
    ('JEFE_TIENDA', 'BONO_PUNTUALIDAD', 'FIJO', 70.00, NULL, 50, '{"fuente":"EVIDENCIA_MENSUAL"}'),
    ('FACTURACION', 'BONO_PUNTUALIDAD', 'FIJO', 50.00, NULL, 50, '{"fuente":"EVIDENCIA_MENSUAL"}'),
    ('JEFE_SUPERIOR_PAGOS', 'BONO_PUNTUALIDAD', 'FIJO', 150.00, NULL, 50, '{"fuente":"EVIDENCIA_MENSUAL"}'),
    ('OPERADOR_ALTA_DEMANDA', 'BONO_PUNTUALIDAD', 'FIJO', 100.00, NULL, 50, '{"fuente":"EVIDENCIA_MENSUAL"}'),
    ('ENCARGADO_CARTERA_MEDIA', 'BONO_PUNTUALIDAD', 'FIJO', 75.00, NULL, 50, '{"fuente":"EVIDENCIA_MENSUAL"}'),
    ('DISENO_MARKETING', 'BONO_PUNTUALIDAD', 'FIJO', 50.00, NULL, 50, '{"fuente":"EVIDENCIA_MENSUAL"}'),

    ('ATENCION_CLIENTE', 'PENALIDAD_TARDANZA', 'POR_MINUTO', 0.50, NULL, 60, '{"fuente_asistencia":"MINUTOS_TARDANZA"}'),
    ('JEFE_TIENDA', 'PENALIDAD_TARDANZA', 'POR_MINUTO', 0.70, NULL, 60, '{"fuente_asistencia":"MINUTOS_TARDANZA"}'),
    ('FACTURACION', 'PENALIDAD_TARDANZA', 'POR_MINUTO', 0.70, NULL, 60, '{"fuente_asistencia":"MINUTOS_TARDANZA"}'),
    ('JEFE_SUPERIOR_PAGOS', 'PENALIDAD_TARDANZA', 'POR_MINUTO', 1.50, NULL, 60, '{"fuente_asistencia":"MINUTOS_TARDANZA"}'),
    ('OPERADOR_ALTA_DEMANDA', 'PENALIDAD_TARDANZA', 'POR_MINUTO', 1.00, NULL, 60, '{"fuente_asistencia":"MINUTOS_TARDANZA"}'),
    ('ENCARGADO_CARTERA_MEDIA', 'PENALIDAD_TARDANZA', 'POR_MINUTO', 1.00, NULL, 60, '{"fuente_asistencia":"MINUTOS_TARDANZA"}'),

    ('ATENCION_CLIENTE', 'BONO_COLABORADOR_ATENCIONES', 'FIJO', 100.00, NULL, 40, '{"fuente":"EVIDENCIA_MENSUAL"}'),
    ('ATENCION_CLIENTE', 'BONO_COLABORADOR_CALIFICACIONES', 'FIJO', 100.00, NULL, 40, '{"fuente":"EVIDENCIA_MENSUAL"}'),
    ('ATENCION_CLIENTE', 'BONO_INNOVACION', 'FIJO', 50.00, NULL, 40, '{"fuente":"EVIDENCIA"}'),
    ('ATENCION_CLIENTE', 'BONO_SEGURIDAD_TARJETA', 'POR_UNIDAD', 10.00, NULL, 40, '{"fuente":"EVIDENCIA"}'),
    ('ATENCION_CLIENTE', 'BONO_META_AREA', 'FIJO', 300.00, NULL, 40, '{"umbral_porcentaje":80,"fuente":"META_SEDE"}'),
    ('ATENCION_CLIENTE', 'COMISION_REGISTRO_EFECTIVIZACION', 'POR_UNIDAD', 0.70, NULL, 40, '{"fuente_operacion":"CLIENTE_NUEVO_EFECTIVIZADO_7_DIAS"}'),
    ('ATENCION_CLIENTE', 'COMISION_CALIFICACION_PRESENCIAL', 'POR_UNIDAD', 2.00, NULL, 40, '{"estrellas_minimas":4,"fuente":"EVIDENCIA"}'),
    ('ATENCION_CLIENTE', 'COMISION_REFERIDO', 'PORCENTAJE', NULL, 0.40, 40, '{"fuente":"EVIDENCIA","tasa_cliente_requerida":1}'),
    ('ATENCION_CLIENTE', 'COMISION_LLAMADA', 'POR_UNIDAD', 0.20, NULL, 40, '{"fuente":"EVIDENCIA"}'),
    ('ATENCION_CLIENTE', 'COMISION_TIKTOK_LIVE', 'POR_UNIDAD', 0.70, NULL, 40, '{"fuente":"EVIDENCIA","dias_maximos_operacion":7}'),

    ('JEFE_TIENDA', 'BONO_META_SEDE', 'FIJO', 200.00, NULL, 40, '{"umbral_porcentaje":100,"fuente":"META_SEDE"}'),
    ('JEFE_TIENDA', 'BONO_INNOVACION', 'FIJO', 50.00, NULL, 40, '{"fuente":"EVIDENCIA"}'),
    ('JEFE_TIENDA', 'BONO_REGISTRO_PRESENCIAL', 'POR_UNIDAD', 0.30, NULL, 40, '{"fuente":"EVIDENCIA"}'),
    ('JEFE_TIENDA', 'BONO_LIDERAZGO', 'POR_UNIDAD', 30.00, NULL, 40, '{"fuente":"EVIDENCIA","unidad":"SUBORDINADO_PUNTUAL"}'),
    ('JEFE_TIENDA', 'COMISION_REGISTRO_EFECTIVIZACION', 'POR_UNIDAD', 0.30, NULL, 40, '{"fuente_operacion":"CLIENTE_NUEVO_EFECTIVIZADO_7_DIAS"}'),
    ('JEFE_TIENDA', 'COMISION_CALIFICACION_PRESENCIAL', 'POR_UNIDAD', 2.00, NULL, 40, '{"estrellas_minimas":4,"fuente":"EVIDENCIA"}'),
    ('JEFE_TIENDA', 'COMISION_AUDITORIA_ACTIVA', 'POR_UNIDAD', 1.00, NULL, 40, '{"fuente":"EVIDENCIA"}'),
    ('JEFE_TIENDA', 'COMISION_LLAMADA', 'POR_UNIDAD', 0.20, NULL, 40, '{"fuente":"EVIDENCIA"}'),
    ('JEFE_TIENDA', 'COMISION_REFERIDO', 'PORCENTAJE', NULL, 0.40, 40, '{"fuente":"EVIDENCIA","tasa_cliente_requerida":1}'),
    ('JEFE_TIENDA', 'COMISION_TIKTOK_LIVE', 'POR_UNIDAD', 0.30, NULL, 40, '{"fuente":"EVIDENCIA","dias_maximos_operacion":7}'),

    ('FACTURACION', 'BONO_DETECCION_ERROR_PAGO', 'POR_UNIDAD', 20.00, NULL, 40, '{"fuente":"EVIDENCIA"}'),
    ('FACTURACION', 'BONO_OPERACION_EXTRA', 'POR_UNIDAD', 0.20, NULL, 40, '{"fuente":"EVIDENCIA"}'),
    ('FACTURACION', 'BONO_INNOVACION', 'FIJO', 50.00, NULL, 40, '{"fuente":"EVIDENCIA"}'),
    ('FACTURACION', 'COMISION_REFERIDO', 'PORCENTAJE', NULL, 0.40, 40, '{"fuente":"EVIDENCIA","tasa_cliente_requerida":1}'),

    ('JEFE_SUPERIOR_PAGOS', 'BONO_CUADRE_PERFECTO', 'FIJO', 100.00, NULL, 40, '{"fuente":"EVIDENCIA_MENSUAL"}'),
    ('OPERADOR_ALTA_DEMANDA', 'BONO_CUADRE_PERFECTO', 'FIJO', 75.00, NULL, 40, '{"fuente":"EVIDENCIA_MENSUAL"}'),
    ('ENCARGADO_CARTERA_MEDIA', 'BONO_CUADRE_PERFECTO', 'FIJO', 50.00, NULL, 40, '{"fuente":"EVIDENCIA_MENSUAL"}'),
    ('ASISTENTE_VIRTUAL_PAGOS', 'BONO_CUADRE_PERFECTO', 'FIJO', 50.00, NULL, 40, '{"fuente":"EVIDENCIA_MENSUAL"}'),

    ('DISENO_MARKETING', 'BONO_VIDEO_VIRAL', 'FIJO', 50.00, NULL, 40, '{"vistas_minimas":10000,"reacciones_minimas":500,"comentarios_minimos":5,"fuente":"EVIDENCIA"}'),
    ('DISENO_MARKETING', 'BONO_INNOVACION', 'FIJO', 50.00, NULL, 40, '{"fuente":"EVIDENCIA"}'),
    ('DISENO_MARKETING', 'BONO_RECUPERACION', 'POR_UNIDAD', 5.00, NULL, 40, '{"inactividad_dias_minimos":60,"fuente":"EVIDENCIA"}'),
    ('DISENO_MARKETING', 'COMISION_ALERTA_TEMPRANA', 'POR_UNIDAD', 0.50, NULL, 40, '{"fuente":"EVIDENCIA"}'),
    ('DISENO_MARKETING', 'COMISION_REFERIDO', 'PORCENTAJE', NULL, 0.40, 40, '{"fuente":"EVIDENCIA","tasa_cliente_requerida":1}'),
    ('DISENO_MARKETING', 'COMISION_TIKTOK_LIVE', 'POR_UNIDAD', 1.00, NULL, 40, '{"fuente":"EVIDENCIA","dias_maximos_operacion":7}')
  ) AS v(cargo_codigo, concepto_codigo, tipo_calculo, monto, porcentaje, prioridad, configuracion)
  JOIN public.tb_compensacion_cargo ca ON ca.codigo = v.cargo_codigo
  JOIN public.tb_compensacion_concepto co ON co.codigo = v.concepto_codigo
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_regla r
    WHERE r.id_plan_version = v_id_version
      AND r.id_concepto = co.id
      AND r.id_cargo = ca.id
      AND r.id_sucursal IS NULL
      AND r.prioridad = v.prioridad
  );

  -- Reglas comunes para todos los cargos de Pagos.
  INSERT INTO public.tb_compensacion_regla (
    id_plan_version, id_concepto, id_cargo, tipo_calculo,
    monto, porcentaje, prioridad, configuracion, id_estado, id_usuario
  )
  SELECT
    v_id_version, co.id, ca.id, v.tipo_calculo,
    v.monto, v.porcentaje, 35, v.configuracion::jsonb,
    v_id_estado, v_id_usuario
  FROM (VALUES
    ('BONO_REPORTE_ABANDONO', 'POR_UNIDAD', 1.00::numeric, NULL::numeric, '{"fuente":"EVIDENCIA"}'),
    ('BONO_DETECCION_ERROR_MANUAL', 'POR_UNIDAD', 1.00, NULL, '{"fuente":"EVIDENCIA"}'),
    ('BONO_INNOVACION', 'FIJO', 50.00, NULL, '{"fuente":"EVIDENCIA"}'),
    ('BONO_REGISTRO_PRESENCIAL', 'POR_UNIDAD', 0.30, NULL, '{"fuente":"EVIDENCIA"}'),
    ('COMISION_REFERIDO', 'PORCENTAJE', NULL, 0.40, '{"fuente":"EVIDENCIA","tasa_cliente_requerida":1}'),
    ('COMISION_TIKTOK_LIVE', 'POR_UNIDAD', 1.00, NULL, '{"fuente":"EVIDENCIA","dias_maximos_operacion":7}')
  ) AS v(concepto_codigo, tipo_calculo, monto, porcentaje, configuracion)
  JOIN public.tb_compensacion_concepto co ON co.codigo = v.concepto_codigo
  CROSS JOIN public.tb_compensacion_cargo ca
  WHERE ca.codigo IN (
    'JEFE_SUPERIOR_PAGOS', 'OPERADOR_ALTA_DEMANDA',
    'ENCARGADO_CARTERA_MEDIA', 'ASISTENTE_VIRTUAL_PAGOS'
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tb_compensacion_regla r
      WHERE r.id_plan_version = v_id_version
        AND r.id_concepto = co.id
        AND r.id_cargo = ca.id
        AND r.id_sucursal IS NULL
        AND r.prioridad = 35
    );

  -- El ESQUEMA 12 diferencia la comision de nuevos registros por perfil:
  -- Jefe Superior audita (S/0.30); los otros perfiles registran y efectivizan
  -- (S/0.70). No deben coexistir ambos conceptos para el mismo cargo.
  INSERT INTO public.tb_compensacion_regla (
    id_plan_version, id_concepto, id_cargo, tipo_calculo,
    monto, prioridad, configuracion, id_estado, id_usuario
  )
  SELECT
    v_id_version, co.id, ca.id, 'POR_UNIDAD', v.monto, 35,
    v.configuracion::jsonb, v_id_estado, v_id_usuario
  FROM (VALUES
    ('JEFE_SUPERIOR_PAGOS', 'COMISION_AUDITAR_NUEVOS', 0.30::numeric,
      '{"fuente":"EVIDENCIA","dias_maximos_operacion":7,"fuente_documental":"ESQUEMA_12_MD"}'),
    ('OPERADOR_ALTA_DEMANDA', 'COMISION_REGISTRO_EFECTIVIZACION', 0.70::numeric,
      '{"fuente":"EVIDENCIA","dias_maximos_operacion":7,"fuente_documental":"ESQUEMA_12_MD"}'),
    ('ENCARGADO_CARTERA_MEDIA', 'COMISION_REGISTRO_EFECTIVIZACION', 0.70::numeric,
      '{"fuente":"EVIDENCIA","dias_maximos_operacion":7,"fuente_documental":"ESQUEMA_12_MD"}'),
    ('ASISTENTE_VIRTUAL_PAGOS', 'COMISION_REGISTRO_EFECTIVIZACION', 0.70::numeric,
      '{"fuente":"EVIDENCIA","dias_maximos_operacion":7,"fuente_documental":"ESQUEMA_12_MD"}')
  ) AS v(cargo_codigo, concepto_codigo, monto, configuracion)
  JOIN public.tb_compensacion_cargo ca ON ca.codigo = v.cargo_codigo
  JOIN public.tb_compensacion_concepto co ON co.codigo = v.concepto_codigo
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_regla r
    WHERE r.id_plan_version = v_id_version
      AND r.id_concepto = co.id
      AND r.id_cargo = ca.id
      AND r.id_sucursal IS NULL
      AND r.prioridad = 35
  );

  DELETE FROM public.tb_compensacion_regla r
  USING public.tb_compensacion_concepto co,
        public.tb_compensacion_cargo ca
  WHERE r.id_plan_version = v_id_version
    AND r.id_concepto = co.id
    AND r.id_cargo = ca.id
    AND r.prioridad = 35
    AND (
      (
        ca.codigo = 'JEFE_SUPERIOR_PAGOS'
        AND co.codigo = 'COMISION_REGISTRO_EFECTIVIZACION'
      )
      OR (
        ca.codigo IN (
          'OPERADOR_ALTA_DEMANDA', 'ENCARGADO_CARTERA_MEDIA',
          'ASISTENTE_VIRTUAL_PAGOS'
        )
        AND co.codigo = 'COMISION_AUDITAR_NUEVOS'
      )
    );

  INSERT INTO public.tb_compensacion_penalidad_tipo (
    id_plan_version, codigo, nombre, descripcion, id_cargo,
    id_concepto_descuento, id_concepto_bono_reportante,
    monto_referencia, monto_bono_reportante, requiere_respuesta,
    configuracion, id_estado, id_usuario
  )
  SELECT
    v_id_version, v.codigo, v.nombre, v.descripcion, ca.id,
    descuento.id, bono.id, v.monto, v.bono_reportante, true,
    v.configuracion::jsonb, v_id_estado, v_id_usuario
  FROM (VALUES
    ('ATENCION_CLIENTE', 'ATC_ERROR_DATOS', 'Error de datos', 'Dato errado detectado por Facturacion o Jefe de Tienda.', 2.00::numeric, 1.00::numeric, '{}'),
    ('ATENCION_CLIENTE', 'ATC_ABANDONO_CHAT', 'Abandono de chat', 'Chat con mas de 20 minutos sin respuesta.', 2.00, 1.00, '{}'),
    ('ATENCION_CLIENTE', 'ATC_MAL_FLUJO', 'Mal flujo CMR o Safety', 'Omision del protocolo obligatorio.', 2.00, 1.00, '{}'),
    ('ATENCION_CLIENTE', 'ATC_PROCESO_AIRE', 'Conversacion o proceso al aire', 'Proceso abandonado sin datos obligatorios.', 2.00, 1.00, '{}'),
    ('ATENCION_CLIENTE', 'ATC_ERROR_REGISTRO', 'Error en registro manual o codigo', 'Dato del cliente o comunidad ingresado incorrectamente.', 2.00, 1.00, '{}'),
    ('ATENCION_CLIENTE', 'ATC_UNIFORME', 'Falta de uniforme completo', 'Descuento por cada dia sin uniforme.', 10.00, NULL, '{}'),
    ('ATENCION_CLIENTE', 'ATC_INDISCIPLINA', 'Indisciplina recurrente activa', 'Incidencia de indisciplina confirmada.', 15.00, NULL, '{}'),
    ('ATENCION_CLIENTE', 'ATC_FRAUDE_DIGITAL', 'Tolerancia cero digital', 'Perdida del 100% de comisiones por fraude confirmado.', 0.00, NULL, '{"porcentaje_comisiones":100,"requiere_ajuste_manual":true}'),

    ('JEFE_TIENDA', 'JEFE_ERROR_SUPERVISION', 'Error de supervision', 'Error del personal que supera el filtro del jefe.', 2.00, NULL, '{}'),
    ('JEFE_TIENDA', 'JEFE_ABANDONO_SOLIDARIO', 'Abandono de chat solidario', 'Chat del equipo con mas de 20 minutos sin respuesta.', 2.00, NULL, '{}'),
    ('JEFE_TIENDA', 'JEFE_QUEJA_TARDIA', 'Queja tardia u omision de reporte', 'Queja antigua no solucionada ni reportada oportunamente.', 50.00, NULL, '{}'),
    ('JEFE_TIENDA', 'JEFE_UNIFORME', 'Falta de uniforme de jefatura', 'Descuento por cada dia sin uniforme corporativo.', 20.00, NULL, '{}'),
    ('JEFE_TIENDA', 'JEFE_ERROR_CUADRO', 'Error en cuadro de comisiones', 'Descuento escalonado sobre todas las comisiones del mes.', 0.00, NULL, '{"tramos":[{"errores_desde":1,"errores_hasta":1,"porcentaje":30},{"errores_desde":2,"errores_hasta":2,"porcentaje":60},{"errores_desde":3,"porcentaje":90}],"base_calculo":"COMISIONES_MES","requiere_ajuste_manual":true,"confirmado_cliente":true}'),
    ('JEFE_TIENDA', 'JEFE_INDISCIPLINA', 'Indisciplina recurrente activa', 'Incidencia de indisciplina confirmada.', 15.00, NULL, '{}'),

    ('FACTURACION', 'FAC_ERROR_SOLUCION', 'Error con solucion', 'Error operativo omitido por Facturacion.', 100.00, NULL, '{}'),
    ('FACTURACION', 'FAC_ERROR_SIN_SOLUCION', 'Error sin solucion', 'Error critico omitido por Facturacion.', 200.00, NULL, '{}'),
    ('FACTURACION', 'FAC_UNIFORME', 'Falta de uniforme completo', 'Descuento por cada dia sin uniforme.', 10.00, NULL, '{}'),
    ('FACTURACION', 'FAC_INDISCIPLINA', 'Indisciplina recurrente activa', 'Incidencia de indisciplina confirmada.', 15.00, NULL, '{}'),

    ('JEFE_SUPERIOR_PAGOS', 'PAG_JEFE_CIERRE_INCOMPLETO', 'Cierre diario incompleto', 'Cierre diario incompleto del Jefe Superior de Pagos.', 150.00, NULL, '{}'),
    ('JEFE_SUPERIOR_PAGOS', 'PAG_JEFE_RETRASO_VOUCHER', 'Retraso de vouchers', 'Retraso en vouchers del Jefe Superior de Pagos.', 50.00, NULL, '{}'),
    ('OPERADOR_ALTA_DEMANDA', 'PAG_OPERADOR_CIERRE_INCOMPLETO', 'Cierre diario incompleto', 'Cierre diario incompleto del Operador de Alta Demanda.', 100.00, NULL, '{}'),
    ('OPERADOR_ALTA_DEMANDA', 'PAG_OPERADOR_RETRASO_VOUCHER', 'Retraso de vouchers', 'Retraso en vouchers del Operador de Alta Demanda.', 35.00, NULL, '{}'),
    ('ENCARGADO_CARTERA_MEDIA', 'PAG_CARTERA_CIERRE_INCOMPLETO', 'Cierre diario incompleto', 'Cierre diario incompleto del Encargado de Cartera Media.', 75.00, NULL, '{}'),
    ('ENCARGADO_CARTERA_MEDIA', 'PAG_CARTERA_RETRASO_VOUCHER', 'Retraso de vouchers', 'Retraso en vouchers del Encargado de Cartera Media.', 25.00, NULL, '{}'),
    ('ASISTENTE_VIRTUAL_PAGOS', 'PAG_VIRTUAL_CIERRE_INCOMPLETO', 'Cierre diario incompleto', 'Cierre diario incompleto del Asistente Virtual.', 75.00, NULL, '{}'),
    ('ASISTENTE_VIRTUAL_PAGOS', 'PAG_VIRTUAL_RETRASO_VOUCHER', 'Retraso de vouchers', 'Retraso en vouchers del Asistente Virtual.', 25.00, NULL, '{}'),

    ('DISENO_MARKETING', 'MKT_UNIFORME', 'Falta de uniforme completo', 'Descuento por cada dia sin uniforme.', 10.00, NULL, '{}'),
    ('DISENO_MARKETING', 'MKT_INDISCIPLINA', 'Indisciplina recurrente activa', 'Incidencia de indisciplina confirmada.', 15.00, NULL, '{}')
  ) AS v(cargo_codigo, codigo, nombre, descripcion, monto, bono_reportante, configuracion)
  JOIN public.tb_compensacion_cargo ca ON ca.codigo = v.cargo_codigo
  JOIN public.tb_compensacion_concepto descuento ON descuento.codigo = 'PENALIDAD_GENERICA'
  LEFT JOIN public.tb_compensacion_concepto bono
    ON bono.codigo = 'BONO_REPORTE_INCIDENCIA'
   AND v.bono_reportante IS NOT NULL
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.tb_compensacion_penalidad_tipo pt
    WHERE pt.id_plan_version = v_id_version
      AND pt.codigo = v.codigo
  );

  -- Penalidades comunes de Pagos por cada perfil.
  INSERT INTO public.tb_compensacion_penalidad_tipo (
    id_plan_version, codigo, nombre, descripcion, id_cargo,
    id_concepto_descuento, monto_referencia, requiere_respuesta,
    configuracion, id_estado, id_usuario
  )
  SELECT
    v_id_version,
    'PAG_' || ca.codigo || '_' || v.codigo,
    v.nombre,
    v.descripcion,
    ca.id,
    descuento.id,
    v.monto,
    true,
    v.configuracion::jsonb,
    v_id_estado,
    v_id_usuario
  FROM (VALUES
    ('ERROR_PAGO_CRITICO', 'Error de pago critico', 'Descuento del 100% del monto perdido, minimo S/40 y fraccionable en varios meses.', 40.00::numeric, '{"porcentaje":100,"minimo":40,"base_calculo":"MONTO_PERDIDO","permite_fraccionamiento":true,"periodicidad_cuota":"MENSUAL","cantidad_cuotas":"VARIABLE","requiere_ajuste_manual":true,"confirmado_cliente":true}'),
    ('DESCUADRE', 'Descuadre', 'Discrepancia no justificada entre Excel y banco.', 5.00, '{}'),
    ('UNIFORME', 'Falta de uniforme completo', 'Descuento por cada dia sin uniforme.', 30.00, '{}'),
    ('INDISCIPLINA', 'Indisciplina recurrente activa', 'Incidencia de indisciplina confirmada.', 40.00, '{}'),
    ('ERROR_CUADRO', 'Error en cuadro de comisiones', 'Descuento escalonado sobre todas las comisiones del mes.', 0.00, '{"tramos":[{"errores_desde":1,"errores_hasta":1,"porcentaje":30},{"errores_desde":2,"errores_hasta":2,"porcentaje":60},{"errores_desde":3,"porcentaje":90}],"base_calculo":"COMISIONES_MES","requiere_ajuste_manual":true,"confirmado_cliente":true}')
  ) AS v(codigo, nombre, descripcion, monto, configuracion)
  CROSS JOIN public.tb_compensacion_cargo ca
  JOIN public.tb_compensacion_concepto descuento
    ON descuento.codigo = 'PENALIDAD_GENERICA'
  WHERE ca.codigo IN (
    'JEFE_SUPERIOR_PAGOS', 'OPERADOR_ALTA_DEMANDA',
    'ENCARGADO_CARTERA_MEDIA', 'ASISTENTE_VIRTUAL_PAGOS'
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tb_compensacion_penalidad_tipo pt
      WHERE pt.id_plan_version = v_id_version
        AND pt.codigo = 'PAG_' || ca.codigo || '_' || v.codigo
    );

  INSERT INTO public.tb_compensacion_meta_sede (
    id_plan_version, id_sucursal, codigo_indicador, periodo,
    valor_meta, unidad, configuracion, id_estado, id_usuario
  )
  SELECT
    v_id_version, s.id, 'SAFETYPAY_MONTO', DATE '2026-09-01',
    v.valor_meta, 'MONTO',
    jsonb_build_object('fuente', 'SISTEMA_LEGACY', 'confirmado_cliente', true),
    v_id_estado, v_id_usuario
  FROM (VALUES
    ('Sede Lince', 500000.00::numeric),
    ('Sede Norte', 900000.00::numeric),
    ('Sede Sur', 900000.00::numeric),
    ('Sede Miraflores', 400000.00::numeric)
  ) AS v(sucursal_nombre, valor_meta)
  JOIN public.tb_sucursal s ON UPPER(BTRIM(s.nombre)) = UPPER(v.sucursal_nombre)
  ON CONFLICT (id_plan_version, id_sucursal, codigo_indicador, periodo)
  DO NOTHING;

  UPDATE public.tb_compensacion_regla
  SET configuracion = jsonb_set(
        configuracion,
        '{fuente}',
        '"ESQUEMA_12_PDF"'::jsonb,
        true
      ),
      fecha_actualizacion = now()
  WHERE id_plan_version = v_id_version
    AND configuracion ->> 'fuente' = 'ESQUEMA_9_PDF';

  -- Condiciones ampliadas que el ESQUEMA 12 explicita para Jefes de Tienda.
  UPDATE public.tb_compensacion_regla r
  SET configuracion = r.configuracion || jsonb_build_object(
        'fuente', 'ESQUEMA_12_PDF',
        'cuotas_calidad', jsonb_build_object(
          'norte_sur', jsonb_build_object('mensajes', 350, 'respuestas', 175),
          'lince', jsonb_build_object('mensajes', 300, 'respuestas', 150),
          'margen_faltante_diario_minimo', 10,
          'margen_faltante_diario_maximo', 15,
          'anula_bono_si_chat_filtrado_descuidado', true
        )
      ),
      fecha_actualizacion = now()
  FROM public.tb_compensacion_concepto co,
       public.tb_compensacion_cargo ca
  WHERE r.id_plan_version = v_id_version
    AND r.id_concepto = co.id
    AND r.id_cargo = ca.id
    AND co.codigo = 'BONO_META_SEDE'
    AND ca.codigo = 'JEFE_TIENDA'
    AND (
      r.configuracion ->> 'fuente' IS DISTINCT FROM 'ESQUEMA_12_PDF'
      OR r.configuracion -> 'cuotas_calidad' IS DISTINCT FROM jsonb_build_object(
        'norte_sur', jsonb_build_object('mensajes', 350, 'respuestas', 175),
        'lince', jsonb_build_object('mensajes', 300, 'respuestas', 150),
        'margen_faltante_diario_minimo', 10,
        'margen_faltante_diario_maximo', 15,
        'anula_bono_si_chat_filtrado_descuidado', true
      )
    );

  UPDATE public.tb_compensacion_regla r
  SET configuracion = r.configuracion || jsonb_build_object(
        'fuente', 'ESQUEMA_12_PDF',
        'adicional_independiente', true,
        'acumulado_maximo_con_meta', 400
      ),
      fecha_actualizacion = now()
  FROM public.tb_compensacion_concepto co,
       public.tb_compensacion_cargo ca
  WHERE r.id_plan_version = v_id_version
    AND r.id_concepto = co.id
    AND r.id_cargo = ca.id
    AND co.codigo = 'BONO_INNOVACION'
    AND ca.codigo = 'JEFE_TIENDA'
    AND (
      r.configuracion ->> 'fuente' IS DISTINCT FROM 'ESQUEMA_12_PDF'
      OR r.configuracion -> 'adicional_independiente' IS DISTINCT FROM 'true'::jsonb
      OR r.configuracion -> 'acumulado_maximo_con_meta' IS DISTINCT FROM '400'::jsonb
    );

  -- Correccion confirmada por ESQUEMA_12.md: el Asistente Virtual percibe
  -- S/1,500 de sueldo base (la lectura visual previa se interpreto como S/500).
  UPDATE public.tb_compensacion_regla r
  SET monto = 1500.00,
      configuracion = r.configuracion || jsonb_build_object(
        'fuente', 'ESQUEMA_12_MD'
      ),
      fecha_actualizacion = now()
  FROM public.tb_compensacion_concepto co,
       public.tb_compensacion_cargo ca
  WHERE r.id_plan_version = v_id_version
    AND r.id_concepto = co.id
    AND r.id_cargo = ca.id
    AND co.codigo = 'SUELDO_BASE'
    AND ca.codigo = 'ASISTENTE_VIRTUAL_PAGOS'
    AND (
      r.monto IS DISTINCT FROM 1500.00
      OR r.configuracion ->> 'fuente' IS DISTINCT FROM 'ESQUEMA_12_MD'
    );

  -- Condiciones de elegibilidad y exclusiones detalladas en ESQUEMA_12.md.
  UPDATE public.tb_compensacion_regla r
  SET configuracion = r.configuracion || jsonb_build_object(
        'fuente_documental', 'ESQUEMA_12_MD',
        'requiere_bono_puntualidad_vigente', true,
        'requiere_sin_indisciplina', true
      ),
      fecha_actualizacion = now()
  FROM public.tb_compensacion_concepto co,
       public.tb_compensacion_cargo ca
  WHERE r.id_plan_version = v_id_version
    AND r.id_concepto = co.id
    AND r.id_cargo = ca.id
    AND ca.codigo = 'ATENCION_CLIENTE'
    AND co.codigo IN (
      'BONO_COLABORADOR_ATENCIONES',
      'BONO_COLABORADOR_CALIFICACIONES'
    )
    AND (
      r.configuracion -> 'requiere_bono_puntualidad_vigente'
        IS DISTINCT FROM 'true'::jsonb
      OR r.configuracion -> 'requiere_sin_indisciplina'
        IS DISTINCT FROM 'true'::jsonb
    );

  UPDATE public.tb_compensacion_regla r
  SET configuracion = r.configuracion || jsonb_build_object(
        'fuente_documental', 'ESQUEMA_12_MD',
        'estrellas_minimas', 4,
        'estrellas_maximas', 5,
        'tasas_admitidas', jsonb_build_array(1, 2),
        'incluye_pago_deuda', true,
        'excluye_tasa_preferencial', true,
        'excluye_comunidades', true
      ),
      fecha_actualizacion = now()
  FROM public.tb_compensacion_concepto co,
       public.tb_compensacion_cargo ca
  WHERE r.id_plan_version = v_id_version
    AND r.id_concepto = co.id
    AND r.id_cargo = ca.id
    AND co.codigo = 'COMISION_CALIFICACION_PRESENCIAL'
    AND ca.codigo IN ('ATENCION_CLIENTE', 'JEFE_TIENDA')
    AND (
      r.configuracion -> 'excluye_tasa_preferencial'
        IS DISTINCT FROM 'true'::jsonb
      OR r.configuracion -> 'excluye_comunidades'
        IS DISTINCT FROM 'true'::jsonb
    );

  UPDATE public.tb_compensacion_regla r
  SET configuracion = r.configuracion || jsonb_build_object(
        'fuente_documental', 'ESQUEMA_12_MD',
        'descontar_al_responsable', true,
        'minutos_sin_respuesta', 20
      ),
      fecha_actualizacion = now()
  FROM public.tb_compensacion_concepto co,
       public.tb_compensacion_cargo ca
  WHERE r.id_plan_version = v_id_version
    AND r.id_concepto = co.id
    AND r.id_cargo = ca.id
    AND co.codigo = 'COMISION_ALERTA_TEMPRANA'
    AND ca.codigo = 'DISENO_MARKETING'
    AND r.configuracion -> 'descontar_al_responsable'
      IS DISTINCT FROM 'true'::jsonb;

  -- El cliente confirmo que el Asistente Virtual no percibe el bono de
  -- cumplimiento general. Se conserva el concepto de catalogo para no romper
  -- posibles referencias historicas, pero se elimina su regla de calculo.
  DELETE FROM public.tb_compensacion_regla r
  USING public.tb_compensacion_concepto co,
        public.tb_compensacion_cargo ca
  WHERE r.id_plan_version = v_id_version
    AND r.id_concepto = co.id
    AND r.id_cargo = ca.id
    AND co.codigo = 'BONO_CUMPLIMIENTO_VIRTUAL'
    AND ca.codigo = 'ASISTENTE_VIRTUAL_PAGOS';

  UPDATE public.tb_compensacion_penalidad_tipo
  SET descripcion = 'Descuento escalonado sobre todas las comisiones del mes.',
      configuracion = '{"tramos":[{"errores_desde":1,"errores_hasta":1,"porcentaje":30},{"errores_desde":2,"errores_hasta":2,"porcentaje":60},{"errores_desde":3,"porcentaje":90}],"base_calculo":"COMISIONES_MES","requiere_ajuste_manual":true,"confirmado_cliente":true}'::jsonb,
      fecha_actualizacion = now()
  WHERE id_plan_version = v_id_version
    AND (
      codigo = 'JEFE_ERROR_CUADRO'
      OR codigo LIKE 'PAG\_%\_ERROR\_CUADRO' ESCAPE '\'
    )
    AND (
      descripcion IS DISTINCT FROM
        'Descuento escalonado sobre todas las comisiones del mes.'
      OR configuracion IS DISTINCT FROM
        '{"tramos":[{"errores_desde":1,"errores_hasta":1,"porcentaje":30},{"errores_desde":2,"errores_hasta":2,"porcentaje":60},{"errores_desde":3,"porcentaje":90}],"base_calculo":"COMISIONES_MES","requiere_ajuste_manual":true,"confirmado_cliente":true}'::jsonb
    );

  UPDATE public.tb_compensacion_penalidad_tipo
  SET descripcion = 'Descuento del 100% del monto perdido, minimo S/40 y fraccionable en varios meses.',
      configuracion = '{"porcentaje":100,"minimo":40,"base_calculo":"MONTO_PERDIDO","permite_fraccionamiento":true,"periodicidad_cuota":"MENSUAL","cantidad_cuotas":"VARIABLE","requiere_ajuste_manual":true,"confirmado_cliente":true}'::jsonb,
      fecha_actualizacion = now()
  WHERE id_plan_version = v_id_version
    AND codigo LIKE 'PAG\_%\_ERROR\_PAGO\_CRITICO' ESCAPE '\'
    AND (
      descripcion IS DISTINCT FROM
        'Descuento del 100% del monto perdido, minimo S/40 y fraccionable en varios meses.'
      OR configuracion IS DISTINCT FROM
        '{"porcentaje":100,"minimo":40,"base_calculo":"MONTO_PERDIDO","permite_fraccionamiento":true,"periodicidad_cuota":"MENSUAL","cantidad_cuotas":"VARIABLE","requiere_ajuste_manual":true,"confirmado_cliente":true}'::jsonb
    );

  UPDATE public.tb_compensacion_meta_sede
  SET configuracion = jsonb_build_object(
        'fuente', 'SISTEMA_LEGACY',
        'confirmado_cliente', true
      ),
      fecha_actualizacion = now()
  WHERE id_plan_version = v_id_version
    AND codigo_indicador = 'SAFETYPAY_MONTO'
    AND configuracion IS DISTINCT FROM jsonb_build_object(
      'fuente', 'SISTEMA_LEGACY',
      'confirmado_cliente', true
    );
END;
$seed_esquema_9$;
