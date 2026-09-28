-- ============================================================================
-- COMPENSACIONES - PERIODOS, LIQUIDACIONES, PAGOS, CIERRES Y EXPORTACIONES
-- ============================================================================
-- Objetivo:
--   Modelar calculos explicables, aprobaciones, pagos externos, snapshots de
--   cierre y exportaciones sin crear movimientos en Caja.
--
-- Dependencias:
--   01.core_catalogos_permisos.sql
--   03.operacion_proceso_y_excel.sql
--   17.compensaciones_personal_configuracion.sql
--   18.compensaciones_asistencia_evidencias.sql
--
-- Alcance de este archivo:
--   Solo tablas, restricciones, indices y auditoria por snapshot.
-- ============================================================================

-- ============================================================================
-- 1. TB_COMPENSACION_PERIODO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_periodo (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  periodo date NOT NULL,
  nombre character varying(100) NOT NULL,
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  zona_horaria character varying(80) NOT NULL DEFAULT 'America/Lima',
  estado_periodo character varying(20) NOT NULL DEFAULT 'ABIERTO',
  numero_calculo integer NOT NULL DEFAULT 0,
  fecha_apertura timestamp with time zone NOT NULL DEFAULT now(),
  fecha_aprobacion timestamp with time zone,
  fecha_cierre timestamp with time zone,
  id_usuario_abre bigint NOT NULL,
  id_usuario_actualiza bigint,
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_periodo_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_periodo_periodo_uk UNIQUE (periodo),
  CONSTRAINT tb_compensacion_periodo_usuario_abre_fk
    FOREIGN KEY (id_usuario_abre) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_periodo_usuario_actualiza_fk
    FOREIGN KEY (id_usuario_actualiza) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_periodo_mes_ck
    CHECK (
      periodo = date_trunc('month', periodo)::date
      AND fecha_inicio = periodo
      AND fecha_fin = (periodo + INTERVAL '1 month - 1 day')::date
    ),
  CONSTRAINT tb_compensacion_periodo_estado_ck
    CHECK (
      estado_periodo IN (
        'ABIERTO', 'EN_CALCULO', 'EN_REVISION', 'OBSERVADO',
        'APROBADO', 'CERRADO', 'REABIERTO'
      )
    ),
  CONSTRAINT tb_compensacion_periodo_calculo_ck
    CHECK (numero_calculo >= 0),
  CONSTRAINT tb_compensacion_periodo_aprobacion_ck
    CHECK (
      estado_periodo NOT IN ('APROBADO', 'CERRADO')
      OR fecha_aprobacion IS NOT NULL
    ),
  CONSTRAINT tb_compensacion_periodo_cierre_ck
    CHECK (estado_periodo <> 'CERRADO' OR fecha_cierre IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_compensacion_periodo_estado
  ON public.tb_compensacion_periodo (estado_periodo, periodo);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_periodo_his AS
TABLE public.tb_compensacion_periodo
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_periodo_his
  ON public.tb_compensacion_periodo;
CREATE TRIGGER trg_tb_compensacion_periodo_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_periodo
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 2. TB_COMPENSACION_LIQUIDACION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_liquidacion (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_periodo bigint NOT NULL,
  id_colaborador bigint NOT NULL,
  numero_calculo integer NOT NULL,
  estado_liquidacion character varying(20) NOT NULL DEFAULT 'BORRADOR',
  colaborador_snapshot jsonb NOT NULL,
  total_sueldo numeric(14, 2) NOT NULL DEFAULT 0,
  total_bonos numeric(14, 2) NOT NULL DEFAULT 0,
  total_comisiones numeric(14, 2) NOT NULL DEFAULT 0,
  total_descuentos numeric(14, 2) NOT NULL DEFAULT 0,
  total_pagar numeric(14, 2) NOT NULL DEFAULT 0,
  total_pagado numeric(14, 2) NOT NULL DEFAULT 0,
  observacion text,
  fecha_calculo timestamp with time zone,
  fecha_aprobacion timestamp with time zone,
  id_usuario_calcula bigint,
  id_usuario_actualiza bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_liquidacion_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_liquidacion_calculo_uk
    UNIQUE (id_periodo, id_colaborador, numero_calculo),
  CONSTRAINT tb_compensacion_liquidacion_periodo_fk
    FOREIGN KEY (id_periodo) REFERENCES public.tb_compensacion_periodo(id),
  CONSTRAINT tb_compensacion_liquidacion_colaborador_fk
    FOREIGN KEY (id_colaborador)
    REFERENCES public.tb_compensacion_colaborador(id),
  CONSTRAINT tb_compensacion_liquidacion_usuario_calcula_fk
    FOREIGN KEY (id_usuario_calcula) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_liquidacion_usuario_actualiza_fk
    FOREIGN KEY (id_usuario_actualiza) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_liquidacion_estado_ck
    CHECK (
      estado_liquidacion IN (
        'BORRADOR', 'CALCULADA', 'OBSERVADA', 'APROBADA',
        'PAGO_PARCIAL', 'PAGADA', 'REEMPLAZADA', 'ANULADA'
      )
    ),
  CONSTRAINT tb_compensacion_liquidacion_numero_ck
    CHECK (numero_calculo > 0),
  CONSTRAINT tb_compensacion_liquidacion_totales_ck
    CHECK (
      total_sueldo >= 0
      AND total_bonos >= 0
      AND total_comisiones >= 0
      AND total_descuentos >= 0
      AND total_pagar >= 0
      AND total_pagado >= 0
      AND total_pagar =
        total_sueldo + total_bonos + total_comisiones - total_descuentos
      AND total_pagado <= total_pagar
    ),
  CONSTRAINT tb_compensacion_liquidacion_calculada_ck
    CHECK (
      estado_liquidacion = 'BORRADOR'
      OR (fecha_calculo IS NOT NULL AND id_usuario_calcula IS NOT NULL)
    ),
  CONSTRAINT tb_compensacion_liquidacion_aprobada_ck
    CHECK (
      estado_liquidacion NOT IN ('APROBADA', 'PAGO_PARCIAL', 'PAGADA')
      OR fecha_aprobacion IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_compensacion_liquidacion_periodo_estado
  ON public.tb_compensacion_liquidacion (id_periodo, estado_liquidacion);

CREATE INDEX IF NOT EXISTS idx_compensacion_liquidacion_colaborador
  ON public.tb_compensacion_liquidacion (id_colaborador, id_periodo);

CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_liquidacion_vigente
  ON public.tb_compensacion_liquidacion (id_periodo, id_colaborador)
  WHERE estado_liquidacion NOT IN ('REEMPLAZADA', 'ANULADA');

CREATE TABLE IF NOT EXISTS public.tb_compensacion_liquidacion_his AS
TABLE public.tb_compensacion_liquidacion
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_liquidacion_his
  ON public.tb_compensacion_liquidacion;
CREATE TRIGGER trg_tb_compensacion_liquidacion_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_liquidacion
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 3. TB_COMPENSACION_LIQUIDACION_TRAMO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_liquidacion_tramo (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_liquidacion bigint NOT NULL,
  id_asignacion bigint NOT NULL,
  id_plan_version bigint NOT NULL,
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  dias_calendario integer NOT NULL,
  dias_pagables numeric(8, 2) NOT NULL DEFAULT 0,
  asignacion_snapshot jsonb NOT NULL,
  total_sueldo numeric(14, 2) NOT NULL DEFAULT 0,
  total_bonos numeric(14, 2) NOT NULL DEFAULT 0,
  total_comisiones numeric(14, 2) NOT NULL DEFAULT 0,
  total_descuentos numeric(14, 2) NOT NULL DEFAULT 0,
  total_pagar numeric(14, 2) NOT NULL DEFAULT 0,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_liquidacion_tramo_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_liquidacion_tramo_id_liquidacion_uk
    UNIQUE (id, id_liquidacion),
  CONSTRAINT tb_compensacion_liquidacion_tramo_uk
    UNIQUE (id_liquidacion, id_asignacion, fecha_inicio, fecha_fin),
  CONSTRAINT tb_compensacion_liquidacion_tramo_liquidacion_fk
    FOREIGN KEY (id_liquidacion)
    REFERENCES public.tb_compensacion_liquidacion(id),
  CONSTRAINT tb_compensacion_liquidacion_tramo_asignacion_fk
    FOREIGN KEY (id_asignacion)
    REFERENCES public.tb_compensacion_asignacion(id),
  CONSTRAINT tb_compensacion_liquidacion_tramo_plan_version_fk
    FOREIGN KEY (id_plan_version)
    REFERENCES public.tb_compensacion_plan_version(id),
  CONSTRAINT tb_compensacion_liquidacion_tramo_fechas_ck
    CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT tb_compensacion_liquidacion_tramo_dias_ck
    CHECK (dias_calendario > 0 AND dias_pagables >= 0),
  CONSTRAINT tb_compensacion_liquidacion_tramo_totales_ck
    CHECK (
      total_sueldo >= 0
      AND total_bonos >= 0
      AND total_comisiones >= 0
      AND total_descuentos >= 0
      AND total_pagar >= 0
      AND total_pagar =
        total_sueldo + total_bonos + total_comisiones - total_descuentos
    )
);

CREATE INDEX IF NOT EXISTS idx_compensacion_liquidacion_tramo_liquidacion
  ON public.tb_compensacion_liquidacion_tramo (id_liquidacion, fecha_inicio);

-- Los tramos son append-only dentro de una version de calculo.

-- ============================================================================
-- 4. TB_COMPENSACION_LIQUIDACION_DETALLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_liquidacion_detalle (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_liquidacion bigint NOT NULL,
  id_tramo bigint,
  id_concepto bigint NOT NULL,
  id_regla bigint,
  tipo_origen character varying(30) NOT NULL,
  clave_origen character varying(250) NOT NULL,
  id_evento bigint,
  id_jornada bigint,
  id_operacion bigint,
  id_excepcion bigint,
  concepto_codigo_snapshot character varying(80) NOT NULL,
  concepto_nombre_snapshot character varying(180) NOT NULL,
  categoria_snapshot character varying(30) NOT NULL,
  naturaleza_snapshot character varying(20) NOT NULL,
  regla_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  formula_snapshot text,
  base_calculo numeric(16, 4) NOT NULL DEFAULT 0,
  cantidad numeric(16, 4) NOT NULL DEFAULT 1,
  tarifa numeric(16, 6) NOT NULL DEFAULT 0,
  importe numeric(14, 2) NOT NULL,
  datos_origen_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_liquidacion_detalle_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_liquidacion_detalle_origen_uk
    UNIQUE (id_liquidacion, id_concepto, clave_origen),
  CONSTRAINT tb_compensacion_liquidacion_detalle_liquidacion_fk
    FOREIGN KEY (id_liquidacion)
    REFERENCES public.tb_compensacion_liquidacion(id),
  CONSTRAINT tb_compensacion_liquidacion_detalle_tramo_fk
    FOREIGN KEY (id_tramo, id_liquidacion)
    REFERENCES public.tb_compensacion_liquidacion_tramo(id, id_liquidacion),
  CONSTRAINT tb_compensacion_liquidacion_detalle_concepto_fk
    FOREIGN KEY (id_concepto) REFERENCES public.tb_compensacion_concepto(id),
  CONSTRAINT tb_compensacion_liquidacion_detalle_regla_fk
    FOREIGN KEY (id_regla) REFERENCES public.tb_compensacion_regla(id),
  CONSTRAINT tb_compensacion_liquidacion_detalle_evento_fk
    FOREIGN KEY (id_evento) REFERENCES public.tb_compensacion_evento(id),
  CONSTRAINT tb_compensacion_liquidacion_detalle_jornada_fk
    FOREIGN KEY (id_jornada) REFERENCES public.tb_asistencia_jornada(id),
  CONSTRAINT tb_compensacion_liquidacion_detalle_operacion_fk
    FOREIGN KEY (id_operacion) REFERENCES public.tb_operacion_proceso(id),
  CONSTRAINT tb_compensacion_liquidacion_detalle_excepcion_fk
    FOREIGN KEY (id_excepcion) REFERENCES public.tb_compensacion_excepcion(id),
  CONSTRAINT tb_compensacion_liquidacion_detalle_tipo_origen_ck
    CHECK (
      tipo_origen IN (
        'ASIGNACION', 'ASISTENCIA', 'EVENTO', 'OPERACION', 'EXCEPCION',
        'AJUSTE', 'MANUAL'
      )
    ),
  CONSTRAINT tb_compensacion_liquidacion_detalle_categoria_ck
    CHECK (
      categoria_snapshot IN (
        'SUELDO', 'BONO', 'COMISION', 'PENALIDAD', 'DESCUENTO',
        'INFORMATIVO'
      )
    ),
  CONSTRAINT tb_compensacion_liquidacion_detalle_naturaleza_ck
    CHECK (naturaleza_snapshot IN ('INGRESO', 'DESCUENTO', 'INFORMATIVO')),
  CONSTRAINT tb_compensacion_liquidacion_detalle_valores_ck
    CHECK (
      base_calculo >= 0
      AND cantidad >= 0
      AND tarifa >= 0
      AND importe >= 0
    ),
  CONSTRAINT tb_compensacion_liquidacion_detalle_origen_fk_ck
    CHECK (
      (tipo_origen <> 'ASIGNACION' OR id_tramo IS NOT NULL)
      AND (tipo_origen <> 'ASISTENCIA' OR id_jornada IS NOT NULL)
      AND (tipo_origen <> 'EVENTO' OR id_evento IS NOT NULL)
      AND (tipo_origen <> 'OPERACION' OR id_operacion IS NOT NULL)
      AND (tipo_origen <> 'EXCEPCION' OR id_excepcion IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_compensacion_liquidacion_detalle_concepto
  ON public.tb_compensacion_liquidacion_detalle (id_liquidacion, id_concepto);

CREATE INDEX IF NOT EXISTS idx_compensacion_liquidacion_detalle_evento
  ON public.tb_compensacion_liquidacion_detalle (id_evento)
  WHERE id_evento IS NOT NULL;

-- El detalle es append-only dentro de cada version de calculo. Un recalculo
-- marca la cabecera anterior como REEMPLAZADA y genera otra liquidacion con
-- nuevo numero.

-- ============================================================================
-- 5. TB_COMPENSACION_CIERRE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_cierre (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_periodo bigint NOT NULL,
  numero_version integer NOT NULL,
  estado_cierre character varying(20) NOT NULL DEFAULT 'VIGENTE',
  total_colaboradores integer NOT NULL DEFAULT 0,
  total_sueldo numeric(16, 2) NOT NULL DEFAULT 0,
  total_bonos numeric(16, 2) NOT NULL DEFAULT 0,
  total_comisiones numeric(16, 2) NOT NULL DEFAULT 0,
  total_descuentos numeric(16, 2) NOT NULL DEFAULT 0,
  total_pagar numeric(16, 2) NOT NULL DEFAULT 0,
  total_pagado numeric(16, 2) NOT NULL DEFAULT 0,
  total_pendiente numeric(16, 2) NOT NULL DEFAULT 0,
  snapshot_resumen jsonb NOT NULL,
  hash_integridad character varying(128) NOT NULL,
  motivo_reapertura text,
  id_cierre_anterior bigint,
  id_usuario_cierra bigint NOT NULL,
  fecha_cierre timestamp with time zone NOT NULL DEFAULT now(),
  id_usuario_revierte bigint,
  fecha_reversion timestamp with time zone,
  CONSTRAINT tb_compensacion_cierre_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_cierre_version_uk
    UNIQUE (id_periodo, numero_version),
  CONSTRAINT tb_compensacion_cierre_hash_uk UNIQUE (hash_integridad),
  CONSTRAINT tb_compensacion_cierre_periodo_fk
    FOREIGN KEY (id_periodo) REFERENCES public.tb_compensacion_periodo(id),
  CONSTRAINT tb_compensacion_cierre_anterior_fk
    FOREIGN KEY (id_cierre_anterior) REFERENCES public.tb_compensacion_cierre(id),
  CONSTRAINT tb_compensacion_cierre_usuario_cierra_fk
    FOREIGN KEY (id_usuario_cierra) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_cierre_usuario_revierte_fk
    FOREIGN KEY (id_usuario_revierte) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_cierre_version_ck
    CHECK (numero_version > 0),
  CONSTRAINT tb_compensacion_cierre_estado_ck
    CHECK (estado_cierre IN ('VIGENTE', 'REVERTIDO')),
  CONSTRAINT tb_compensacion_cierre_totales_ck
    CHECK (
      total_colaboradores >= 0
      AND total_sueldo >= 0
      AND total_bonos >= 0
      AND total_comisiones >= 0
      AND total_descuentos >= 0
      AND total_pagar >= 0
      AND total_pagado >= 0
      AND total_pendiente >= 0
      AND total_pagar =
        total_sueldo + total_bonos + total_comisiones - total_descuentos
      AND total_pendiente = total_pagar - total_pagado
    ),
  CONSTRAINT tb_compensacion_cierre_reversion_ck
    CHECK (
      estado_cierre <> 'REVERTIDO'
      OR (
        id_usuario_revierte IS NOT NULL
        AND fecha_reversion IS NOT NULL
        AND btrim(COALESCE(motivo_reapertura, '')) <> ''
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_cierre_vigente
  ON public.tb_compensacion_cierre (id_periodo)
  WHERE estado_cierre = 'VIGENTE';

CREATE TABLE IF NOT EXISTS public.tb_compensacion_cierre_his AS
TABLE public.tb_compensacion_cierre
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_cierre_his
  ON public.tb_compensacion_cierre;
CREATE TRIGGER trg_tb_compensacion_cierre_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_cierre
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 6. TB_COMPENSACION_CIERRE_LIQUIDACION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_cierre_liquidacion (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_cierre bigint NOT NULL,
  id_liquidacion bigint NOT NULL,
  id_colaborador bigint NOT NULL,
  colaborador_snapshot jsonb NOT NULL,
  total_sueldo numeric(14, 2) NOT NULL,
  total_bonos numeric(14, 2) NOT NULL,
  total_comisiones numeric(14, 2) NOT NULL,
  total_descuentos numeric(14, 2) NOT NULL,
  total_pagar numeric(14, 2) NOT NULL,
  total_pagado numeric(14, 2) NOT NULL,
  detalle_snapshot jsonb NOT NULL,
  hash_integridad character varying(128) NOT NULL,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_cierre_liquidacion_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_cierre_liquidacion_uk
    UNIQUE (id_cierre, id_liquidacion),
  CONSTRAINT tb_compensacion_cierre_liquidacion_hash_uk
    UNIQUE (id_cierre, hash_integridad),
  CONSTRAINT tb_compensacion_cierre_liquidacion_cierre_fk
    FOREIGN KEY (id_cierre) REFERENCES public.tb_compensacion_cierre(id),
  CONSTRAINT tb_compensacion_cierre_liquidacion_liquidacion_fk
    FOREIGN KEY (id_liquidacion)
    REFERENCES public.tb_compensacion_liquidacion(id),
  CONSTRAINT tb_compensacion_cierre_liquidacion_colaborador_fk
    FOREIGN KEY (id_colaborador)
    REFERENCES public.tb_compensacion_colaborador(id),
  CONSTRAINT tb_compensacion_cierre_liquidacion_totales_ck
    CHECK (
      total_sueldo >= 0
      AND total_bonos >= 0
      AND total_comisiones >= 0
      AND total_descuentos >= 0
      AND total_pagar >= 0
      AND total_pagado >= 0
      AND total_pagar =
        total_sueldo + total_bonos + total_comisiones - total_descuentos
      AND total_pagado <= total_pagar
    )
);

CREATE INDEX IF NOT EXISTS idx_compensacion_cierre_liquidacion_colaborador
  ON public.tb_compensacion_cierre_liquidacion (id_colaborador, id_cierre);

-- Esta tabla es append-only y constituye el detalle congelado del cierre.

-- ============================================================================
-- 7. TB_COMPENSACION_APROBACION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_aprobacion (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  alcance character varying(20) NOT NULL,
  id_liquidacion bigint,
  id_cierre bigint,
  numero_paso integer NOT NULL,
  etapa character varying(50) NOT NULL,
  decision character varying(20) NOT NULL,
  comentario text,
  id_usuario_aprueba bigint NOT NULL,
  fecha_aprobacion timestamp with time zone NOT NULL DEFAULT now(),
  datos_decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT tb_compensacion_aprobacion_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_aprobacion_liquidacion_paso_uk
    UNIQUE (id_liquidacion, numero_paso),
  CONSTRAINT tb_compensacion_aprobacion_cierre_paso_uk
    UNIQUE (id_cierre, numero_paso),
  CONSTRAINT tb_compensacion_aprobacion_liquidacion_fk
    FOREIGN KEY (id_liquidacion)
    REFERENCES public.tb_compensacion_liquidacion(id),
  CONSTRAINT tb_compensacion_aprobacion_cierre_fk
    FOREIGN KEY (id_cierre) REFERENCES public.tb_compensacion_cierre(id),
  CONSTRAINT tb_compensacion_aprobacion_usuario_fk
    FOREIGN KEY (id_usuario_aprueba) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_aprobacion_alcance_ck
    CHECK (alcance IN ('LIQUIDACION', 'CIERRE')),
  CONSTRAINT tb_compensacion_aprobacion_objeto_ck
    CHECK (
      (alcance = 'LIQUIDACION' AND id_liquidacion IS NOT NULL AND id_cierre IS NULL)
      OR (alcance = 'CIERRE' AND id_cierre IS NOT NULL AND id_liquidacion IS NULL)
    ),
  CONSTRAINT tb_compensacion_aprobacion_paso_ck CHECK (numero_paso > 0),
  CONSTRAINT tb_compensacion_aprobacion_decision_ck
    CHECK (decision IN ('APROBADO', 'RECHAZADO', 'OBSERVADO')),
  CONSTRAINT tb_compensacion_aprobacion_comentario_ck
    CHECK (
      decision = 'APROBADO'
      OR btrim(COALESCE(comentario, '')) <> ''
    )
);

CREATE INDEX IF NOT EXISTS idx_compensacion_aprobacion_liquidacion
  ON public.tb_compensacion_aprobacion (id_liquidacion, fecha_aprobacion)
  WHERE id_liquidacion IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compensacion_aprobacion_cierre
  ON public.tb_compensacion_aprobacion (id_cierre, fecha_aprobacion)
  WHERE id_cierre IS NOT NULL;

-- Las aprobaciones son append-only.

-- ============================================================================
-- 8. TB_COMPENSACION_PAGO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_pago (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_liquidacion bigint NOT NULL,
  tipo_movimiento character varying(20) NOT NULL DEFAULT 'PAGO',
  componente character varying(20) NOT NULL,
  monto numeric(14, 2) NOT NULL,
  moneda character varying(3) NOT NULL DEFAULT 'PEN',
  fecha_pago timestamp with time zone NOT NULL,
  medio_pago character varying(50),
  referencia character varying(200) NOT NULL,
  id_cuenta_pago bigint,
  id_pago_origen bigint,
  observacion text,
  id_usuario bigint NOT NULL,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_pago_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_pago_referencia_uk
    UNIQUE (tipo_movimiento, referencia),
  CONSTRAINT tb_compensacion_pago_liquidacion_fk
    FOREIGN KEY (id_liquidacion)
    REFERENCES public.tb_compensacion_liquidacion(id),
  CONSTRAINT tb_compensacion_pago_cuenta_fk
    FOREIGN KEY (id_cuenta_pago)
    REFERENCES public.tb_compensacion_cuenta_pago(id),
  CONSTRAINT tb_compensacion_pago_origen_fk
    FOREIGN KEY (id_pago_origen) REFERENCES public.tb_compensacion_pago(id),
  CONSTRAINT tb_compensacion_pago_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_pago_tipo_ck
    CHECK (tipo_movimiento IN ('PAGO', 'REVERSA')),
  CONSTRAINT tb_compensacion_pago_componente_ck
    CHECK (componente IN ('SUELDO', 'COMISIONES', 'TOTAL')),
  CONSTRAINT tb_compensacion_pago_monto_ck CHECK (monto > 0),
  CONSTRAINT tb_compensacion_pago_moneda_ck CHECK (moneda IN ('PEN', 'USD')),
  CONSTRAINT tb_compensacion_pago_reversa_ck
    CHECK (
      (tipo_movimiento = 'PAGO' AND id_pago_origen IS NULL)
      OR (tipo_movimiento = 'REVERSA' AND id_pago_origen IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_pago_reversa
  ON public.tb_compensacion_pago (id_pago_origen)
  WHERE tipo_movimiento = 'REVERSA';

CREATE INDEX IF NOT EXISTS idx_compensacion_pago_liquidacion
  ON public.tb_compensacion_pago (id_liquidacion, fecha_pago);

-- Los pagos son append-only. La reversa crea otra fila y no borra el pago.

-- ============================================================================
-- 9. TB_COMPENSACION_AJUSTE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_ajuste (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_periodo_destino bigint NOT NULL,
  id_colaborador bigint NOT NULL,
  id_concepto bigint NOT NULL,
  id_detalle_origen bigint,
  naturaleza character varying(20) NOT NULL,
  monto numeric(14, 2) NOT NULL,
  motivo text NOT NULL,
  evidencia jsonb NOT NULL DEFAULT '[]'::jsonb,
  estado_ajuste character varying(20) NOT NULL DEFAULT 'PENDIENTE',
  id_usuario_solicita bigint NOT NULL,
  fecha_solicitud timestamp with time zone NOT NULL DEFAULT now(),
  id_usuario_aprueba bigint,
  fecha_aprobacion timestamp with time zone,
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_ajuste_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_ajuste_periodo_fk
    FOREIGN KEY (id_periodo_destino) REFERENCES public.tb_compensacion_periodo(id),
  CONSTRAINT tb_compensacion_ajuste_colaborador_fk
    FOREIGN KEY (id_colaborador)
    REFERENCES public.tb_compensacion_colaborador(id),
  CONSTRAINT tb_compensacion_ajuste_concepto_fk
    FOREIGN KEY (id_concepto) REFERENCES public.tb_compensacion_concepto(id),
  CONSTRAINT tb_compensacion_ajuste_detalle_fk
    FOREIGN KEY (id_detalle_origen)
    REFERENCES public.tb_compensacion_liquidacion_detalle(id),
  CONSTRAINT tb_compensacion_ajuste_solicita_fk
    FOREIGN KEY (id_usuario_solicita) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_ajuste_aprueba_fk
    FOREIGN KEY (id_usuario_aprueba) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_ajuste_naturaleza_ck
    CHECK (naturaleza IN ('INGRESO', 'DESCUENTO')),
  CONSTRAINT tb_compensacion_ajuste_monto_ck CHECK (monto > 0),
  CONSTRAINT tb_compensacion_ajuste_estado_ck
    CHECK (
      estado_ajuste IN ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'APLICADO', 'ANULADO')
    ),
  CONSTRAINT tb_compensacion_ajuste_motivo_ck CHECK (btrim(motivo) <> ''),
  CONSTRAINT tb_compensacion_ajuste_aprobacion_ck
    CHECK (
      estado_ajuste NOT IN ('APROBADO', 'RECHAZADO', 'APLICADO')
      OR (id_usuario_aprueba IS NOT NULL AND fecha_aprobacion IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_compensacion_ajuste_periodo_colaborador
  ON public.tb_compensacion_ajuste (
    id_periodo_destino,
    id_colaborador,
    estado_ajuste
  );

CREATE TABLE IF NOT EXISTS public.tb_compensacion_ajuste_his AS
TABLE public.tb_compensacion_ajuste
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_ajuste_his
  ON public.tb_compensacion_ajuste;
CREATE TRIGGER trg_tb_compensacion_ajuste_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_ajuste
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 10. TB_COMPENSACION_EXPORTACION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_exportacion (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_periodo bigint NOT NULL,
  id_cierre bigint,
  tipo_reporte character varying(50) NOT NULL,
  formato character varying(10) NOT NULL,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  nombre_archivo character varying(300) NOT NULL,
  hash_archivo character varying(128),
  total_registros integer NOT NULL DEFAULT 0,
  total_reportado numeric(16, 2),
  estado_exportacion character varying(20) NOT NULL DEFAULT 'GENERADA',
  mensaje_error text,
  clave_idempotencia character varying(200),
  id_usuario bigint NOT NULL,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  id_usuario_anula bigint,
  fecha_anulacion timestamp with time zone,
  motivo_anulacion text,
  CONSTRAINT tb_compensacion_exportacion_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_exportacion_periodo_fk
    FOREIGN KEY (id_periodo) REFERENCES public.tb_compensacion_periodo(id),
  CONSTRAINT tb_compensacion_exportacion_cierre_fk
    FOREIGN KEY (id_cierre) REFERENCES public.tb_compensacion_cierre(id),
  CONSTRAINT tb_compensacion_exportacion_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_exportacion_usuario_anula_fk
    FOREIGN KEY (id_usuario_anula) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_exportacion_tipo_ck
    CHECK (
      tipo_reporte IN (
        'GENERAL_FINANCIERO', 'DETALLE_COLABORADOR', 'RESUMEN_SEDE',
        'PRODUCTIVIDAD', 'PAGOS', 'ASISTENCIA', 'OTRO'
      )
    ),
  CONSTRAINT tb_compensacion_exportacion_formato_ck
    CHECK (formato IN ('PDF', 'XLSX', 'CSV')),
  CONSTRAINT tb_compensacion_exportacion_estado_ck
    CHECK (estado_exportacion IN ('GENERADA', 'ERROR', 'ANULADA')),
  CONSTRAINT tb_compensacion_exportacion_totales_ck
    CHECK (
      total_registros >= 0
      AND (total_reportado IS NULL OR total_reportado >= 0)
    ),
  CONSTRAINT tb_compensacion_exportacion_anulacion_ck
    CHECK (
      estado_exportacion <> 'ANULADA'
      OR (
        id_usuario_anula IS NOT NULL
        AND fecha_anulacion IS NOT NULL
        AND btrim(COALESCE(motivo_anulacion, '')) <> ''
      )
    )
);

ALTER TABLE public.tb_compensacion_exportacion
  ADD COLUMN IF NOT EXISTS clave_idempotencia character varying(200),
  ADD COLUMN IF NOT EXISTS id_usuario_anula bigint,
  ADD COLUMN IF NOT EXISTS fecha_anulacion timestamp with time zone,
  ADD COLUMN IF NOT EXISTS motivo_anulacion text;

UPDATE public.tb_compensacion_exportacion
SET clave_idempotencia = NULLIF(
  BTRIM(filtros ->> 'clave_idempotencia'),
  ''
)
WHERE clave_idempotencia IS NULL
  AND BTRIM(COALESCE(filtros ->> 'clave_idempotencia', '')) <> '';

UPDATE public.tb_compensacion_exportacion
SET id_usuario_anula = COALESCE(id_usuario_anula, id_usuario),
    fecha_anulacion = COALESCE(fecha_anulacion, fecha_registro),
    motivo_anulacion = COALESCE(
      NULLIF(BTRIM(motivo_anulacion), ''),
      NULLIF(BTRIM(mensaje_error), ''),
      'Anulacion migrada sin motivo historico'
    )
WHERE estado_exportacion = 'ANULADA'
  AND (
    id_usuario_anula IS NULL
    OR fecha_anulacion IS NULL
    OR BTRIM(COALESCE(motivo_anulacion, '')) = ''
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tb_compensacion_exportacion'::regclass
      AND conname = 'tb_compensacion_exportacion_usuario_anula_fk'
  ) THEN
    ALTER TABLE public.tb_compensacion_exportacion
      ADD CONSTRAINT tb_compensacion_exportacion_usuario_anula_fk
      FOREIGN KEY (id_usuario_anula) REFERENCES public.tb_usuario(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tb_compensacion_exportacion'::regclass
      AND conname = 'tb_compensacion_exportacion_anulacion_ck'
  ) THEN
    ALTER TABLE public.tb_compensacion_exportacion
      ADD CONSTRAINT tb_compensacion_exportacion_anulacion_ck
      CHECK (
        estado_exportacion <> 'ANULADA'
        OR (
          id_usuario_anula IS NOT NULL
          AND fecha_anulacion IS NOT NULL
          AND btrim(COALESCE(motivo_anulacion, '')) <> ''
        )
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_compensacion_exportacion_periodo
  ON public.tb_compensacion_exportacion (
    id_periodo,
    tipo_reporte,
    fecha_registro
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_exportacion_idempotencia
  ON public.tb_compensacion_exportacion (
    id_usuario,
    id_periodo,
    tipo_reporte,
    formato,
    clave_idempotencia
  )
  WHERE clave_idempotencia IS NOT NULL;

-- La exportacion registra la evidencia del archivo generado. No almacena el
-- binario; su ubicacion se definira al implementar el servicio de documentos.
