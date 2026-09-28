-- ============================================================================
-- COMPENSACIONES - ASISTENCIA, EVIDENCIAS E INCIDENCIAS
-- ============================================================================
-- Objetivo:
--   Modelar cargas del huellero, jornadas consolidadas, correcciones y una
--   bandeja comun de evidencias laborales con aprobacion auditable.
--
-- Dependencias:
--   01.core_catalogos_permisos.sql
--   02.core_clientes_servicios_empresas_reglas.sql
--   03.operacion_proceso_y_excel.sql
--   17.compensaciones_personal_configuracion.sql
--
-- Alcance de este archivo:
--   Solo tablas, restricciones, indices y auditoria por snapshot.
-- ============================================================================

-- ============================================================================
-- 1. TB_ASISTENCIA_CARGA
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_asistencia_carga (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre_archivo character varying(300) NOT NULL,
  ruta_archivo character varying(500) NOT NULL,
  hash_archivo character varying(128) NOT NULL,
  formato character varying(20) NOT NULL DEFAULT 'XLSX',
  mime_type character varying(150),
  tamano_bytes bigint,
  version_plantilla character varying(50),
  nombre_hoja character varying(150),
  fecha_desde date,
  fecha_hasta date,
  zona_horaria character varying(80) NOT NULL DEFAULT 'America/Lima',
  estado_carga character varying(20) NOT NULL DEFAULT 'CARGADA',
  total_filas integer NOT NULL DEFAULT 0,
  total_validas integer NOT NULL DEFAULT 0,
  total_invalidas integer NOT NULL DEFAULT 0,
  total_duplicadas integer NOT NULL DEFAULT 0,
  resumen_error jsonb NOT NULL DEFAULT '[]'::jsonb,
  id_usuario_confirma bigint,
  fecha_confirmacion timestamp with time zone,
  id_usuario bigint NOT NULL,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_asistencia_carga_pkey PRIMARY KEY (id),
  CONSTRAINT tb_asistencia_carga_hash_uk UNIQUE (hash_archivo),
  CONSTRAINT tb_asistencia_carga_usuario_confirma_fk
    FOREIGN KEY (id_usuario_confirma) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_asistencia_carga_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_asistencia_carga_formato_ck
    CHECK (formato IN ('XLSX', 'XLS', 'CSV')),
  CONSTRAINT tb_asistencia_carga_tamano_ck
    CHECK (tamano_bytes IS NULL OR tamano_bytes >= 0),
  CONSTRAINT tb_asistencia_carga_estado_ck
    CHECK (
      estado_carga IN (
        'CARGADA', 'VALIDADA', 'CONFIRMADA', 'RECHAZADA', 'ANULADA'
      )
    ),
  CONSTRAINT tb_asistencia_carga_fechas_ck
    CHECK (fecha_hasta IS NULL OR fecha_desde IS NULL OR fecha_hasta >= fecha_desde),
  CONSTRAINT tb_asistencia_carga_totales_ck
    CHECK (
      total_filas >= 0
      AND total_validas >= 0
      AND total_invalidas >= 0
      AND total_duplicadas >= 0
      AND total_validas + total_invalidas + total_duplicadas <= total_filas
    ),
  CONSTRAINT tb_asistencia_carga_confirmacion_ck
    CHECK (
      estado_carga <> 'CONFIRMADA'
      OR (id_usuario_confirma IS NOT NULL AND fecha_confirmacion IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_asistencia_carga_periodo
  ON public.tb_asistencia_carga (fecha_desde, fecha_hasta, estado_carga);

CREATE TABLE IF NOT EXISTS public.tb_asistencia_carga_his AS
TABLE public.tb_asistencia_carga
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_asistencia_carga_his
  ON public.tb_asistencia_carga;
CREATE TRIGGER trg_tb_asistencia_carga_his
AFTER INSERT OR UPDATE ON public.tb_asistencia_carga
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 2. TB_ASISTENCIA_MARCACION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_asistencia_marcacion (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_carga bigint NOT NULL,
  id_colaborador bigint,
  numero_fila integer NOT NULL,
  codigo_huellero character varying(100),
  documento_origen character varying(30),
  nombre_origen character varying(300),
  fecha_hora_marcacion timestamp with time zone,
  fecha_hora_origen character varying(100),
  tipo_marcacion character varying(20) NOT NULL DEFAULT 'DESCONOCIDA',
  huella_marcacion character varying(128) NOT NULL,
  estado_validacion character varying(20) NOT NULL DEFAULT 'PENDIENTE',
  codigo_error character varying(80),
  mensaje_error text,
  datos_origen jsonb NOT NULL DEFAULT '{}'::jsonb,
  id_usuario bigint NOT NULL,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_asistencia_marcacion_pkey PRIMARY KEY (id),
  CONSTRAINT tb_asistencia_marcacion_carga_fila_uk
    UNIQUE (id_carga, numero_fila),
  CONSTRAINT tb_asistencia_marcacion_huella_uk UNIQUE (huella_marcacion),
  CONSTRAINT tb_asistencia_marcacion_carga_fk
    FOREIGN KEY (id_carga) REFERENCES public.tb_asistencia_carga(id),
  CONSTRAINT tb_asistencia_marcacion_colaborador_fk
    FOREIGN KEY (id_colaborador)
    REFERENCES public.tb_compensacion_colaborador(id),
  CONSTRAINT tb_asistencia_marcacion_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_asistencia_marcacion_fila_ck CHECK (numero_fila > 0),
  CONSTRAINT tb_asistencia_marcacion_tipo_ck
    CHECK (tipo_marcacion IN ('ENTRADA', 'SALIDA', 'DESCONOCIDA')),
  CONSTRAINT tb_asistencia_marcacion_estado_ck
    CHECK (
      estado_validacion IN ('PENDIENTE', 'VALIDA', 'INVALIDA', 'DUPLICADA')
    ),
  CONSTRAINT tb_asistencia_marcacion_valida_ck
    CHECK (
      estado_validacion <> 'VALIDA'
      OR (id_colaborador IS NOT NULL AND fecha_hora_marcacion IS NOT NULL)
    )
);

-- La misma marcacion puede reaparecer en otro archivo. Se conserva cada fila y
-- se clasifica como DUPLICADA durante la validacion, por lo que la huella no
-- puede permanecer como restriccion UNIQUE.
ALTER TABLE public.tb_asistencia_marcacion
  DROP CONSTRAINT IF EXISTS tb_asistencia_marcacion_huella_uk;

CREATE INDEX IF NOT EXISTS idx_asistencia_marcacion_huella
  ON public.tb_asistencia_marcacion (huella_marcacion);

CREATE INDEX IF NOT EXISTS idx_asistencia_marcacion_colaborador_fecha
  ON public.tb_asistencia_marcacion (id_colaborador, fecha_hora_marcacion);

CREATE TABLE IF NOT EXISTS public.tb_asistencia_marcacion_his AS
TABLE public.tb_asistencia_marcacion
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_asistencia_marcacion_his
  ON public.tb_asistencia_marcacion;
CREATE TRIGGER trg_tb_asistencia_marcacion_his
AFTER INSERT OR UPDATE ON public.tb_asistencia_marcacion
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 3. TB_ASISTENCIA_JORNADA
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_asistencia_jornada (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_colaborador bigint NOT NULL,
  id_asignacion bigint NOT NULL,
  id_carga bigint,
  fecha date NOT NULL,
  entrada_programada timestamp with time zone,
  salida_programada timestamp with time zone,
  entrada_real timestamp with time zone,
  salida_real timestamp with time zone,
  minutos_tardanza integer NOT NULL DEFAULT 0,
  minutos_extra integer NOT NULL DEFAULT 0,
  minutos_trabajados integer NOT NULL DEFAULT 0,
  estado_dia character varying(30) NOT NULL,
  fuente character varying(20) NOT NULL DEFAULT 'HUELLERO',
  version integer NOT NULL DEFAULT 1,
  observacion text,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_asistencia_jornada_pkey PRIMARY KEY (id),
  CONSTRAINT tb_asistencia_jornada_colaborador_fecha_uk
    UNIQUE (id_colaborador, fecha),
  CONSTRAINT tb_asistencia_jornada_colaborador_fk
    FOREIGN KEY (id_colaborador)
    REFERENCES public.tb_compensacion_colaborador(id),
  CONSTRAINT tb_asistencia_jornada_asignacion_fk
    FOREIGN KEY (id_asignacion)
    REFERENCES public.tb_compensacion_asignacion(id),
  CONSTRAINT tb_asistencia_jornada_carga_fk
    FOREIGN KEY (id_carga) REFERENCES public.tb_asistencia_carga(id),
  CONSTRAINT tb_asistencia_jornada_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_asistencia_jornada_estado_ck
    CHECK (
      estado_dia IN (
        'COMPLETO', 'FALTA_ENTRADA', 'FALTA_SALIDA', 'AUSENTE',
        'DESCANSO', 'VACACIONES', 'LICENCIA', 'JUSTIFICADO', 'PENDIENTE'
      )
    ),
  CONSTRAINT tb_asistencia_jornada_fuente_ck
    CHECK (fuente IN ('HUELLERO', 'CORRECCION', 'MANUAL', 'MIGRACION')),
  CONSTRAINT tb_asistencia_jornada_minutos_ck
    CHECK (
      minutos_tardanza >= 0
      AND minutos_extra >= 0
      AND minutos_trabajados >= 0
    ),
  CONSTRAINT tb_asistencia_jornada_version_ck CHECK (version > 0),
  CONSTRAINT tb_asistencia_jornada_reales_ck
    CHECK (
      salida_real IS NULL
      OR entrada_real IS NULL
      OR salida_real >= entrada_real
    )
);

CREATE INDEX IF NOT EXISTS idx_asistencia_jornada_fecha_estado
  ON public.tb_asistencia_jornada (fecha, estado_dia);

CREATE TABLE IF NOT EXISTS public.tb_asistencia_jornada_his AS
TABLE public.tb_asistencia_jornada
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_asistencia_jornada_his
  ON public.tb_asistencia_jornada;
CREATE TRIGGER trg_tb_asistencia_jornada_his
AFTER INSERT OR UPDATE ON public.tb_asistencia_jornada
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 4. TB_ASISTENCIA_SOLICITUD
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_asistencia_solicitud (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_jornada bigint NOT NULL,
  id_colaborador bigint NOT NULL,
  valores_actuales jsonb NOT NULL,
  valores_solicitados jsonb NOT NULL,
  motivo text NOT NULL,
  evidencia jsonb NOT NULL DEFAULT '[]'::jsonb,
  estado_solicitud character varying(20) NOT NULL DEFAULT 'PENDIENTE',
  id_usuario_solicita bigint NOT NULL,
  fecha_solicitud timestamp with time zone NOT NULL DEFAULT now(),
  id_usuario_resuelve bigint,
  fecha_resolucion timestamp with time zone,
  motivo_resolucion text,
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_asistencia_solicitud_pkey PRIMARY KEY (id),
  CONSTRAINT tb_asistencia_solicitud_jornada_fk
    FOREIGN KEY (id_jornada) REFERENCES public.tb_asistencia_jornada(id),
  CONSTRAINT tb_asistencia_solicitud_colaborador_fk
    FOREIGN KEY (id_colaborador)
    REFERENCES public.tb_compensacion_colaborador(id),
  CONSTRAINT tb_asistencia_solicitud_solicita_fk
    FOREIGN KEY (id_usuario_solicita) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_asistencia_solicitud_resuelve_fk
    FOREIGN KEY (id_usuario_resuelve) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_asistencia_solicitud_estado_ck
    CHECK (
      estado_solicitud IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'ANULADA')
    ),
  CONSTRAINT tb_asistencia_solicitud_motivo_ck CHECK (btrim(motivo) <> ''),
  CONSTRAINT tb_asistencia_solicitud_resolucion_ck
    CHECK (
      estado_solicitud NOT IN ('APROBADA', 'RECHAZADA')
      OR (
        id_usuario_resuelve IS NOT NULL
        AND fecha_resolucion IS NOT NULL
        AND btrim(COALESCE(motivo_resolucion, '')) <> ''
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_asistencia_solicitud_pendiente
  ON public.tb_asistencia_solicitud (id_jornada)
  WHERE estado_solicitud = 'PENDIENTE';

CREATE TABLE IF NOT EXISTS public.tb_asistencia_solicitud_his AS
TABLE public.tb_asistencia_solicitud
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_asistencia_solicitud_his
  ON public.tb_asistencia_solicitud;
CREATE TRIGGER trg_tb_asistencia_solicitud_his
AFTER INSERT OR UPDATE ON public.tb_asistencia_solicitud
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 5. TB_COMPENSACION_EVENTO_TIPO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_evento_tipo (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  codigo character varying(80) NOT NULL,
  nombre character varying(180) NOT NULL,
  categoria character varying(30) NOT NULL,
  id_concepto bigint,
  requiere_beneficiario boolean NOT NULL DEFAULT true,
  requiere_responsable boolean NOT NULL DEFAULT false,
  requiere_cliente boolean NOT NULL DEFAULT false,
  requiere_operacion boolean NOT NULL DEFAULT false,
  configuracion jsonb NOT NULL DEFAULT '{}'::jsonb,
  id_estado bigint NOT NULL,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_evento_tipo_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_evento_tipo_codigo_uk UNIQUE (codigo),
  CONSTRAINT tb_compensacion_evento_tipo_concepto_fk
    FOREIGN KEY (id_concepto) REFERENCES public.tb_compensacion_concepto(id),
  CONSTRAINT tb_compensacion_evento_tipo_estado_fk
    FOREIGN KEY (id_estado) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_compensacion_evento_tipo_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_evento_tipo_categoria_ck
    CHECK (
      categoria IN (
        'CALIFICACION', 'LLAMADA', 'TARJETA_TERCERO', 'REFERIDO',
        'PENALIDAD', 'AUDITORIA_PAGO', 'AJUSTE_MANUAL', 'OTRO'
      )
    ),
  CONSTRAINT tb_compensacion_evento_tipo_codigo_ck
    CHECK (btrim(codigo) <> ''),
  CONSTRAINT tb_compensacion_evento_tipo_nombre_ck
    CHECK (btrim(nombre) <> '')
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_evento_tipo_his AS
TABLE public.tb_compensacion_evento_tipo
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_evento_tipo_his
  ON public.tb_compensacion_evento_tipo;
CREATE TRIGGER trg_tb_compensacion_evento_tipo_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_evento_tipo
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 6. TB_COMPENSACION_EVENTO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_evento (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_tipo_evento bigint NOT NULL,
  id_colaborador_beneficiario bigint,
  id_colaborador_responsable bigint,
  id_sucursal_origen bigint,
  id_sucursal_responsable bigint,
  id_penalidad_tipo bigint,
  fecha_evento timestamp with time zone NOT NULL,
  periodo_imputacion date,
  fuente character varying(30) NOT NULL DEFAULT 'MANUAL',
  clave_origen character varying(200),
  titulo character varying(250),
  descripcion text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidencia jsonb NOT NULL DEFAULT '[]'::jsonb,
  criterios_validacion_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado_evento character varying(20) NOT NULL DEFAULT 'BORRADOR',
  id_regla_aplicada bigint,
  base_calculo numeric(16, 4),
  cantidad numeric(16, 4),
  tarifa_aplicada numeric(16, 6),
  importe_aprobado numeric(14, 2),
  id_usuario_registra bigint NOT NULL,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_evento_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_evento_tipo_fk
    FOREIGN KEY (id_tipo_evento)
    REFERENCES public.tb_compensacion_evento_tipo(id),
  CONSTRAINT tb_compensacion_evento_beneficiario_fk
    FOREIGN KEY (id_colaborador_beneficiario)
    REFERENCES public.tb_compensacion_colaborador(id),
  CONSTRAINT tb_compensacion_evento_responsable_fk
    FOREIGN KEY (id_colaborador_responsable)
    REFERENCES public.tb_compensacion_colaborador(id),
  CONSTRAINT tb_compensacion_evento_sucursal_origen_fk
    FOREIGN KEY (id_sucursal_origen) REFERENCES public.tb_sucursal(id),
  CONSTRAINT tb_compensacion_evento_sucursal_responsable_fk
    FOREIGN KEY (id_sucursal_responsable) REFERENCES public.tb_sucursal(id),
  CONSTRAINT tb_compensacion_evento_penalidad_tipo_fk
    FOREIGN KEY (id_penalidad_tipo)
    REFERENCES public.tb_compensacion_penalidad_tipo(id),
  CONSTRAINT tb_compensacion_evento_regla_fk
    FOREIGN KEY (id_regla_aplicada) REFERENCES public.tb_compensacion_regla(id),
  CONSTRAINT tb_compensacion_evento_usuario_fk
    FOREIGN KEY (id_usuario_registra) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_evento_periodo_ck
    CHECK (
      periodo_imputacion IS NULL
      OR periodo_imputacion = date_trunc('month', periodo_imputacion)::date
    ),
  CONSTRAINT tb_compensacion_evento_fuente_ck
    CHECK (
      fuente IN ('MANUAL', 'OPERACION', 'CLIENTE', 'PANCAKE', 'IMPORTACION', 'MIGRACION')
    ),
  CONSTRAINT tb_compensacion_evento_estado_ck
    CHECK (
      estado_evento IN (
        'BORRADOR', 'PENDIENTE', 'APROBADO', 'RECHAZADO', 'ANULADO',
        'LIQUIDADO'
      )
    ),
  CONSTRAINT tb_compensacion_evento_actor_ck
    CHECK (
      id_colaborador_beneficiario IS NOT NULL
      OR id_colaborador_responsable IS NOT NULL
    ),
  CONSTRAINT tb_compensacion_evento_calculo_ck
    CHECK (
      (base_calculo IS NULL OR base_calculo >= 0)
      AND (cantidad IS NULL OR cantidad >= 0)
      AND (tarifa_aplicada IS NULL OR tarifa_aplicada >= 0)
      AND (importe_aprobado IS NULL OR importe_aprobado >= 0)
    ),
  CONSTRAINT tb_compensacion_evento_aprobado_ck
    CHECK (
      estado_evento NOT IN ('APROBADO', 'LIQUIDADO')
      OR importe_aprobado IS NOT NULL
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_evento_clave_origen
  ON public.tb_compensacion_evento (fuente, clave_origen)
  WHERE clave_origen IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compensacion_evento_beneficiario
  ON public.tb_compensacion_evento (
    id_colaborador_beneficiario,
    fecha_evento,
    estado_evento
  );

CREATE INDEX IF NOT EXISTS idx_compensacion_evento_responsable
  ON public.tb_compensacion_evento (
    id_colaborador_responsable,
    fecha_evento,
    estado_evento
  );

CREATE INDEX IF NOT EXISTS idx_compensacion_evento_bandeja
  ON public.tb_compensacion_evento (
    id_tipo_evento,
    estado_evento,
    periodo_imputacion
  );

CREATE TABLE IF NOT EXISTS public.tb_compensacion_evento_his AS
TABLE public.tb_compensacion_evento
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_evento_his
  ON public.tb_compensacion_evento;
CREATE TRIGGER trg_tb_compensacion_evento_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_evento
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 7. TB_COMPENSACION_EVENTO_REVISION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_evento_revision (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_evento bigint NOT NULL,
  numero_paso integer NOT NULL,
  etapa character varying(50) NOT NULL,
  decision character varying(20) NOT NULL,
  comentario text,
  id_usuario_revisor bigint NOT NULL,
  fecha_revision timestamp with time zone NOT NULL DEFAULT now(),
  datos_decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT tb_compensacion_evento_revision_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_evento_revision_paso_uk
    UNIQUE (id_evento, numero_paso),
  CONSTRAINT tb_compensacion_evento_revision_evento_fk
    FOREIGN KEY (id_evento) REFERENCES public.tb_compensacion_evento(id),
  CONSTRAINT tb_compensacion_evento_revision_usuario_fk
    FOREIGN KEY (id_usuario_revisor) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_evento_revision_paso_ck
    CHECK (numero_paso > 0),
  CONSTRAINT tb_compensacion_evento_revision_decision_ck
    CHECK (
      decision IN ('ENVIADO', 'APROBADO', 'RECHAZADO', 'OBSERVADO', 'ANULADO')
    ),
  CONSTRAINT tb_compensacion_evento_revision_comentario_ck
    CHECK (
      decision NOT IN ('RECHAZADO', 'OBSERVADO', 'ANULADO')
      OR btrim(COALESCE(comentario, '')) <> ''
    )
);

CREATE INDEX IF NOT EXISTS idx_compensacion_evento_revision_evento
  ON public.tb_compensacion_evento_revision (id_evento, fecha_revision);

-- Esta tabla es append-only. No requiere trigger _his porque cada fila ya es una
-- decision historica inmutable.

-- ============================================================================
-- 8. TB_COMPENSACION_EVENTO_REFERENCIA
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_evento_referencia (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_evento bigint NOT NULL,
  tipo_referencia character varying(30) NOT NULL,
  id_cliente bigint,
  id_operacion bigint,
  identificador_externo character varying(250),
  datos_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  id_usuario bigint,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_evento_referencia_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_evento_referencia_evento_fk
    FOREIGN KEY (id_evento) REFERENCES public.tb_compensacion_evento(id),
  CONSTRAINT tb_compensacion_evento_referencia_cliente_fk
    FOREIGN KEY (id_cliente) REFERENCES public.tb_cliente(id),
  CONSTRAINT tb_compensacion_evento_referencia_operacion_fk
    FOREIGN KEY (id_operacion) REFERENCES public.tb_operacion_proceso(id),
  CONSTRAINT tb_compensacion_evento_referencia_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_evento_referencia_tipo_ck
    CHECK (
      tipo_referencia IN ('CLIENTE', 'OPERACION', 'PANCAKE', 'ARCHIVO', 'OTRA')
    ),
  CONSTRAINT tb_compensacion_evento_referencia_valor_ck
    CHECK (
      id_cliente IS NOT NULL
      OR id_operacion IS NOT NULL
      OR btrim(COALESCE(identificador_externo, '')) <> ''
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_evento_ref_cliente
  ON public.tb_compensacion_evento_referencia (id_evento, id_cliente)
  WHERE id_cliente IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_evento_ref_operacion
  ON public.tb_compensacion_evento_referencia (id_evento, id_operacion)
  WHERE id_operacion IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_evento_ref_externa
  ON public.tb_compensacion_evento_referencia (
    id_evento,
    tipo_referencia,
    identificador_externo
  )
  WHERE identificador_externo IS NOT NULL;

-- Las referencias son append-only y contienen el snapshot usado para validar.

-- ============================================================================
-- 9. TB_COMPENSACION_REFERIDO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_referido (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_evento bigint NOT NULL,
  id_cliente bigint NOT NULL,
  id_colaborador_referente bigint NOT NULL,
  nombre_referido_snapshot character varying(300) NOT NULL,
  documento_referido_snapshot character varying(30),
  fecha_referencia timestamp with time zone NOT NULL,
  estado_referido character varying(20) NOT NULL DEFAULT 'PENDIENTE',
  observacion text,
  id_usuario bigint NOT NULL,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_referido_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_referido_evento_uk UNIQUE (id_evento),
  CONSTRAINT tb_compensacion_referido_cliente_uk UNIQUE (id_cliente),
  CONSTRAINT tb_compensacion_referido_evento_fk
    FOREIGN KEY (id_evento) REFERENCES public.tb_compensacion_evento(id),
  CONSTRAINT tb_compensacion_referido_cliente_fk
    FOREIGN KEY (id_cliente) REFERENCES public.tb_cliente(id),
  CONSTRAINT tb_compensacion_referido_colaborador_fk
    FOREIGN KEY (id_colaborador_referente)
    REFERENCES public.tb_compensacion_colaborador(id),
  CONSTRAINT tb_compensacion_referido_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_referido_estado_ck
    CHECK (
      estado_referido IN ('PENDIENTE', 'VALIDADO', 'RECHAZADO', 'ANULADO')
    ),
  CONSTRAINT tb_compensacion_referido_nombre_ck
    CHECK (btrim(nombre_referido_snapshot) <> '')
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_referido_his AS
TABLE public.tb_compensacion_referido
WITH NO DATA;

DROP TRIGGER IF EXISTS trg_tb_compensacion_referido_his
  ON public.tb_compensacion_referido;
CREATE TRIGGER trg_tb_compensacion_referido_his
AFTER INSERT OR UPDATE ON public.tb_compensacion_referido
FOR EACH ROW
EXECUTE FUNCTION public.f_private_append_snapshot_his();

-- ============================================================================
-- 10. TB_COMPENSACION_REFERIDO_OPERACION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_compensacion_referido_operacion (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_referido bigint NOT NULL,
  id_operacion bigint NOT NULL,
  fecha_operacion_snapshot timestamp with time zone NOT NULL,
  banco_snapshot character varying(150),
  monto_operacion_snapshot numeric(14, 2) NOT NULL,
  porcentaje_operacion_snapshot numeric(12, 6),
  base_comision numeric(14, 2) NOT NULL,
  tasa_referido numeric(12, 6) NOT NULL,
  importe_comision numeric(14, 2) NOT NULL,
  es_elegible boolean NOT NULL DEFAULT true,
  motivo_no_elegible text,
  id_usuario bigint NOT NULL,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_compensacion_referido_operacion_pkey PRIMARY KEY (id),
  CONSTRAINT tb_compensacion_referido_operacion_operacion_uk
    UNIQUE (id_operacion),
  CONSTRAINT tb_compensacion_referido_operacion_referido_fk
    FOREIGN KEY (id_referido) REFERENCES public.tb_compensacion_referido(id),
  CONSTRAINT tb_compensacion_referido_operacion_operacion_fk
    FOREIGN KEY (id_operacion) REFERENCES public.tb_operacion_proceso(id),
  CONSTRAINT tb_compensacion_referido_operacion_usuario_fk
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_compensacion_referido_operacion_montos_ck
    CHECK (
      monto_operacion_snapshot >= 0
      AND base_comision >= 0
      AND tasa_referido BETWEEN 0 AND 100
      AND importe_comision >= 0
      AND (
        porcentaje_operacion_snapshot IS NULL
        OR porcentaje_operacion_snapshot BETWEEN 0 AND 100
      )
    ),
  CONSTRAINT tb_compensacion_referido_operacion_elegible_ck
    CHECK (
      es_elegible
      OR btrim(COALESCE(motivo_no_elegible, '')) <> ''
    )
);

CREATE INDEX IF NOT EXISTS idx_compensacion_referido_operacion_referido
  ON public.tb_compensacion_referido_operacion (id_referido, es_elegible);

-- Las operaciones de referido son snapshots append-only. Una perdida de
-- elegibilidad se representa en la liquidacion o mediante anulacion del evento,
-- sin alterar la operacion financiera original.

-- ============================================================================
-- 12. TIPOS DE EVIDENCIA BETA - ESQUEMA 12
-- ============================================================================
-- Catalogo idempotente para registrar y aprobar los conceptos no calculados
-- automaticamente desde asistencia u operaciones.

DO $seed_esquema_9_eventos$
DECLARE
  v_id_estado bigint;
  v_id_usuario bigint;
BEGIN
  SELECT e.id
  INTO v_id_estado
  FROM public.tb_estado e
  WHERE UPPER(BTRIM(e.nombre)) = 'ACTIVO'
  ORDER BY e.id
  LIMIT 1;

  IF v_id_estado IS NULL THEN
    RAISE EXCEPTION 'No existe el estado ACTIVO requerido para los tipos de evidencia beta';
  END IF;

  SELECT u.id
  INTO v_id_usuario
  FROM public.tb_usuario u
  JOIN public.tb_estado e ON e.id = u.id_estado
  WHERE UPPER(BTRIM(e.nombre)) = 'ACTIVO'
    AND (COALESCE(u.flag_super_admin, false) OR u.id_rol = 1)
  ORDER BY COALESCE(u.flag_super_admin, false) DESC, u.id
  LIMIT 1;

  INSERT INTO public.tb_compensacion_evento_tipo (
    codigo, nombre, categoria, id_concepto,
    requiere_beneficiario, requiere_responsable,
    requiere_cliente, requiere_operacion,
    configuracion, id_estado, id_usuario
  )
  SELECT
    v.codigo, v.nombre, v.categoria, co.id,
    v.requiere_beneficiario, v.requiere_responsable,
    v.requiere_cliente, v.requiere_operacion,
    v.configuracion::jsonb, v_id_estado, v_id_usuario
  FROM (VALUES
    ('BONO_PUNTUALIDAD', 'Puntualidad y disciplina mensual', 'OTRO', 'BONO_PUNTUALIDAD', true, false, false, false, '{"periodicidad":"MENSUAL","fuente":"ESQUEMA_12_PDF"}'),
    ('COLABORADOR_MES_ATENCIONES', 'Colaborador del mes por atenciones', 'OTRO', 'BONO_COLABORADOR_ATENCIONES', true, false, false, false, '{"periodicidad":"MENSUAL"}'),
    ('COLABORADOR_MES_CALIFICACIONES', 'Colaborador del mes por calificaciones', 'CALIFICACION', 'BONO_COLABORADOR_CALIFICACIONES', true, false, false, false, '{"periodicidad":"MENSUAL","estrellas_minimas":4}'),
    ('PROPUESTA_INNOVACION', 'Propuesta de innovacion aprobada', 'OTRO', 'BONO_INNOVACION', true, false, false, false, '{"requiere_implementacion":true}'),
    ('SEGURIDAD_TARJETA', 'Deteccion de tarjeta de tercero', 'TARJETA_TERCERO', 'BONO_SEGURIDAD_TARJETA', true, false, true, false, '{"requiere_ultimos_cuatro":true}'),
    ('META_AREA', 'Cumplimiento de meta de area', 'OTRO', 'BONO_META_AREA', true, false, false, false, '{"periodicidad":"MENSUAL","umbral_porcentaje":80}'),
    ('META_SEDE_SAFETYPAY', 'Cumplimiento de meta de sede SafetyPay', 'OTRO', 'BONO_META_SEDE', true, false, false, false, '{"periodicidad":"MENSUAL","umbral_porcentaje":100}'),
    ('REGISTRO_PRESENCIAL', 'Atencion o registro presencial', 'CALIFICACION', 'BONO_REGISTRO_PRESENCIAL', true, false, true, false, '{}'),
    ('LIDERAZGO_SUBORDINADO', 'Subordinado con bono de puntualidad', 'OTRO', 'BONO_LIDERAZGO', true, true, false, false, '{"unidad":"SUBORDINADO"}'),
    ('DETECCION_ERROR_PAGO', 'Deteccion de error de pago', 'AUDITORIA_PAGO', 'BONO_DETECCION_ERROR_PAGO', true, true, true, true, '{}'),
    ('OPERACION_EXTRA', 'Operacion real no registrada', 'AUDITORIA_PAGO', 'BONO_OPERACION_EXTRA', true, true, true, true, '{}'),
    ('CUADRE_PERFECTO', 'Cuadre mensual perfecto', 'AUDITORIA_PAGO', 'BONO_CUADRE_PERFECTO', true, false, false, false, '{"periodicidad":"MENSUAL"}'),
    ('REPORTE_ABANDONO', 'Reporte de abandono comercial', 'OTRO', 'BONO_REPORTE_ABANDONO', true, true, true, false, '{"minutos_sin_respuesta":20}'),
    ('DETECCION_ERROR_MANUAL', 'Deteccion de error manual o codigo', 'AUDITORIA_PAGO', 'BONO_DETECCION_ERROR_MANUAL', true, true, true, true, '{}'),
    ('CALIFICACION_PRESENCIAL', 'Atencion presencial calificada', 'CALIFICACION', 'COMISION_CALIFICACION_PRESENCIAL', true, false, true, true, '{"estrellas_minimas":4}'),
    ('REFERIDO', 'Referido efectivizado', 'REFERIDO', 'COMISION_REFERIDO', true, false, true, true, '{"tasa_operacion_requerida":1}'),
    ('LLAMADA_CONTACTO', 'Llamada entrante contestada', 'LLAMADA', 'COMISION_LLAMADA', true, false, true, false, '{}'),
    ('TIKTOK_LIVE', 'Registro y operacion desde TikTok Live', 'OTRO', 'COMISION_TIKTOK_LIVE', true, false, true, true, '{"dias_maximos_operacion":7}'),
    ('AUDITORIA_ACTIVA', 'Auditoria activa o caza-error', 'AUDITORIA_PAGO', 'COMISION_AUDITORIA_ACTIVA', true, true, true, false, '{}'),
    ('AUDITAR_NUEVOS', 'Auditoria de nuevo registro y efectivizacion', 'AUDITORIA_PAGO', 'COMISION_AUDITAR_NUEVOS', true, false, true, true, '{"dias_maximos_operacion":7}'),
    ('REGISTRO_NUEVO_EFECTIVIZADO', 'Registro nuevo efectivizado en siete dias', 'AUDITORIA_PAGO', 'COMISION_REGISTRO_EFECTIVIZACION', true, false, true, true, '{"dias_maximos_operacion":7,"aplica_cargos":["JEFE_SUPERIOR_PAGOS","OPERADOR_ALTA_DEMANDA","ENCARGADO_CARTERA_MEDIA","ASISTENTE_VIRTUAL_PAGOS"]}'),
    ('VIDEO_VIRAL', 'Video viral con metricas cumplidas', 'OTRO', 'BONO_VIDEO_VIRAL', true, false, false, false, '{"vistas_minimas":10000,"reacciones_minimas":500,"comentarios_minimos":5}'),
    ('RECUPERACION_CLIENTE', 'Recuperacion de cliente inactivo', 'OTRO', 'BONO_RECUPERACION', true, false, true, true, '{"inactividad_dias_minimos":60}'),
    ('ALERTA_TEMPRANA', 'Co-fiscalizacion o alerta temprana', 'OTRO', 'COMISION_ALERTA_TEMPRANA', true, true, true, false, '{"minutos_sin_respuesta":20}'),
    ('REPORTE_PENALIDAD', 'Reporte de penalidad operativa', 'PENALIDAD', NULL, false, true, false, false, '{}'),
    ('AUDITORIA_PAGO_CRITICO', 'Auditoria de error de pago critico', 'AUDITORIA_PAGO', NULL, false, true, true, true, '{}')
  ) AS v(
    codigo, nombre, categoria, concepto_codigo,
    requiere_beneficiario, requiere_responsable,
    requiere_cliente, requiere_operacion, configuracion
  )
  LEFT JOIN public.tb_compensacion_concepto co
    ON co.codigo = v.concepto_codigo
  ON CONFLICT (codigo) DO NOTHING;

  UPDATE public.tb_compensacion_evento_tipo
  SET configuracion = configuracion || jsonb_build_object(
        'fuente', 'ESQUEMA_12_PDF'
      ),
      fecha_actualizacion = now()
  WHERE codigo = 'BONO_PUNTUALIDAD'
    AND configuracion ->> 'fuente' IS DISTINCT FROM 'ESQUEMA_12_PDF';

  UPDATE public.tb_compensacion_evento_tipo
  SET configuracion = configuracion || jsonb_build_object(
        'fuente_documental', 'ESQUEMA_12_MD',
        'aplica_cargos', jsonb_build_array('JEFE_SUPERIOR_PAGOS')
      ),
      fecha_actualizacion = now()
  WHERE codigo = 'AUDITAR_NUEVOS'
    AND configuracion -> 'aplica_cargos'
      IS DISTINCT FROM jsonb_build_array('JEFE_SUPERIOR_PAGOS');

  UPDATE public.tb_compensacion_evento_tipo
  SET configuracion = configuracion || jsonb_build_object(
        'fuente_documental', 'ESQUEMA_12_MD',
        'aplica_cargos', jsonb_build_array(
          'OPERADOR_ALTA_DEMANDA',
          'ENCARGADO_CARTERA_MEDIA',
          'ASISTENTE_VIRTUAL_PAGOS'
        )
      ),
      fecha_actualizacion = now()
  WHERE codigo = 'REGISTRO_NUEVO_EFECTIVIZADO'
    AND configuracion -> 'aplica_cargos' IS DISTINCT FROM jsonb_build_array(
      'OPERADOR_ALTA_DEMANDA',
      'ENCARGADO_CARTERA_MEDIA',
      'ASISTENTE_VIRTUAL_PAGOS'
    );

  UPDATE public.tb_compensacion_evento_tipo
  SET configuracion = configuracion || jsonb_build_object(
        'fuente_documental', 'ESQUEMA_12_MD',
        'estrellas_minimas', 4,
        'estrellas_maximas', 5,
        'tasas_admitidas', jsonb_build_array(1, 2),
        'incluye_pago_deuda', true,
        'excluye_tasa_preferencial', true,
        'excluye_comunidades', true
      ),
      fecha_actualizacion = now()
  WHERE codigo = 'CALIFICACION_PRESENCIAL'
    AND (
      configuracion -> 'excluye_tasa_preferencial'
        IS DISTINCT FROM 'true'::jsonb
      OR configuracion -> 'excluye_comunidades'
        IS DISTINCT FROM 'true'::jsonb
    );

  UPDATE public.tb_compensacion_evento_tipo
  SET configuracion = configuracion || jsonb_build_object(
        'fuente_documental', 'ESQUEMA_12_MD',
        'descontar_al_responsable', true,
        'minutos_sin_respuesta', 20
      ),
      fecha_actualizacion = now()
  WHERE codigo = 'ALERTA_TEMPRANA'
    AND configuracion -> 'descontar_al_responsable'
      IS DISTINCT FROM 'true'::jsonb;

  -- El cliente confirmo que el Asistente Virtual no tiene bono de
  -- cumplimiento. El tipo se retira porque no existen eventos asociados.
  DELETE FROM public.tb_compensacion_evento_tipo et
  WHERE et.codigo = 'CUMPLIMIENTO_VIRTUAL'
    AND NOT EXISTS (
      SELECT 1
      FROM public.tb_compensacion_evento e
      WHERE e.id_tipo_evento = et.id
    );
END;
$seed_esquema_9_eventos$;
