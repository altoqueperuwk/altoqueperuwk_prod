-- 01_tablas_y_catalogos.sql
-- Baseline de Compensaciones (22/11/2026), generado desde la base de desarrollo. 65 tablas (con historiales), restricciones, índices, triggers de historial y RLS.
-- Requiere Core y Operaciones ya instalados. No ejecutar los archivos históricos.


BEGIN;
-- Guarda: este script solo corre si quien lo ejecuta lo confirma de forma explícita.
--   SET app.confirmar_despliegue_compensaciones = 'si';
DO $guard$
BEGIN
    IF coalesce(current_setting('app.confirmar_despliegue_compensaciones', true), '') <> 'si' THEN
        RAISE EXCEPTION 'Confirma el despliegue con: SET app.confirmar_despliegue_compensaciones = ''si'';';
    END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public.tb_compensacion_acceso (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_usuario bigint NOT NULL,
    recurso character varying(30) NOT NULL,
    alcance character varying(20) DEFAULT 'PROPIO'::character varying NOT NULL,
    id_sucursal bigint,
    puede_consultar boolean DEFAULT false NOT NULL,
    puede_registrar boolean DEFAULT false NOT NULL,
    puede_editar boolean DEFAULT false NOT NULL,
    puede_revisar boolean DEFAULT false NOT NULL,
    puede_aprobar boolean DEFAULT false NOT NULL,
    puede_pagar boolean DEFAULT false NOT NULL,
    puede_cerrar boolean DEFAULT false NOT NULL,
    puede_configurar boolean DEFAULT false NOT NULL,
    id_estado bigint NOT NULL,
    id_usuario_registra bigint,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_acceso_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_acceso_usuario_recurso_uk UNIQUE (id_usuario, recurso),
    CONSTRAINT tb_compensacion_acceso_alcance_ck CHECK (((alcance)::text = ANY ((ARRAY['PROPIO'::character varying, 'SEDE'::character varying, 'GLOBAL'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_acceso_recurso_ck CHECK (((recurso)::text = ANY ((ARRAY['RESUMEN'::character varying, 'COLABORADORES'::character varying, 'EVIDENCIAS'::character varying, 'INCIDENCIAS'::character varying, 'CONFIGURACION'::character varying, 'REPORTES'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_acceso_sucursal_ck CHECK (((((alcance)::text = 'SEDE'::text) AND (id_sucursal IS NOT NULL)) OR (((alcance)::text = ANY ((ARRAY['PROPIO'::character varying, 'GLOBAL'::character varying])::text[])) AND (id_sucursal IS NULL))))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_acceso_his (
    id bigint,
    id_usuario bigint,
    recurso character varying(30),
    alcance character varying(20),
    id_sucursal bigint,
    puede_consultar boolean,
    puede_registrar boolean,
    puede_editar boolean,
    puede_revisar boolean,
    puede_aprobar boolean,
    puede_pagar boolean,
    puede_cerrar boolean,
    puede_configurar boolean,
    id_estado bigint,
    id_usuario_registra bigint,
    fecha_registro timestamp with time zone,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_asignacion_his (
    id bigint,
    id_colaborador bigint,
    id_cargo bigint,
    id_sucursal bigint,
    id_plan bigint,
    fecha_inicio date,
    fecha_fin date,
    modalidad character varying(30),
    observacion text,
    id_estado bigint,
    id_usuario bigint,
    fecha_registro timestamp with time zone,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_atencion (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_operacion_raiz bigint NOT NULL,
    id_operacion_pagada bigint NOT NULL,
    id_usuario_asesor bigint NOT NULL,
    fecha_atencion timestamp with time zone NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    estado text DEFAULT 'VIGENTE'::text NOT NULL,
    operacion_snapshot jsonb NOT NULL,
    id_usuario_libera bigint,
    fecha_liberacion timestamp with time zone,
    motivo_liberacion text,
    CONSTRAINT tb_compensacion_atencion_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_atencion_check CHECK ((((estado = 'VIGENTE'::text) AND (id_usuario_libera IS NULL) AND (fecha_liberacion IS NULL) AND (motivo_liberacion IS NULL)) OR ((estado = 'LIBERADA'::text) AND (id_usuario_libera IS NOT NULL) AND (fecha_liberacion IS NOT NULL) AND (motivo_liberacion IS NOT NULL) AND (length(btrim(motivo_liberacion)) >= 5)))),
    CONSTRAINT tb_compensacion_atencion_estado_check CHECK ((estado = ANY (ARRAY['VIGENTE'::text, 'LIBERADA'::text])))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_cargo (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    codigo character varying(50) NOT NULL,
    nombre character varying(150) NOT NULL,
    descripcion text,
    orden integer DEFAULT 0 NOT NULL,
    id_estado bigint NOT NULL,
    id_usuario bigint,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_cargo_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_cargo_codigo_uk UNIQUE (codigo),
    CONSTRAINT tb_compensacion_cargo_codigo_ck CHECK ((btrim((codigo)::text) <> ''::text)),
    CONSTRAINT tb_compensacion_cargo_nombre_ck CHECK ((btrim((nombre)::text) <> ''::text))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_cargo_his (
    id bigint,
    codigo character varying(50),
    nombre character varying(150),
    descripcion text,
    orden integer,
    id_estado bigint,
    id_usuario bigint,
    fecha_registro timestamp with time zone,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_chat_dni_mes (
    periodo date NOT NULL,
    certificacion jsonb NOT NULL,
    id_usuario bigint NOT NULL,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_chat_dni_mes_pkey PRIMARY KEY (periodo),
    CONSTRAINT tb_compensacion_chat_dni_mes_periodo_check CHECK ((periodo = (date_trunc('month'::text, (periodo)::timestamp with time zone))::date))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_cliente_nuevo_baja (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_cliente bigint NOT NULL,
    tipo_documento bigint NOT NULL,
    numero_documento character varying NOT NULL,
    nombre character varying,
    id_usuario bigint NOT NULL,
    fecha_registro_cliente timestamp with time zone,
    fecha_baja timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT tb_compensacion_cliente_nuevo_baja_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_colaborador (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_usuario bigint NOT NULL,
    tipo_documento character varying(20) DEFAULT 'DNI'::character varying NOT NULL,
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
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_colaborador_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_colaborador_codigo_huellero_uk UNIQUE (codigo_huellero),
    CONSTRAINT tb_compensacion_colaborador_documento_uk UNIQUE (tipo_documento, numero_documento),
    CONSTRAINT tb_compensacion_colaborador_usuario_uk UNIQUE (id_usuario),
    CONSTRAINT tb_compensacion_colaborador_documento_ck CHECK ((btrim((numero_documento)::text) <> ''::text)),
    CONSTRAINT tb_compensacion_colaborador_fechas_ck CHECK (((fecha_cese IS NULL) OR (fecha_cese >= fecha_ingreso))),
    CONSTRAINT tb_compensacion_colaborador_nombre_ck CHECK ((btrim((nombre_completo)::text) <> ''::text))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_colaborador_his (
    id bigint,
    id_usuario bigint,
    tipo_documento character varying(20),
    numero_documento character varying(30),
    nombres character varying(150),
    apellido_paterno character varying(100),
    apellido_materno character varying(100),
    nombre_completo character varying(300),
    email character varying(200),
    celular character varying(30),
    codigo_huellero character varying(100),
    fecha_ingreso date,
    fecha_cese date,
    motivo_cese text,
    id_estado bigint,
    id_usuario_registra bigint,
    fecha_registro timestamp with time zone,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_concepto (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    codigo character varying(80) NOT NULL,
    nombre character varying(180) NOT NULL,
    categoria character varying(30) NOT NULL,
    naturaleza character varying(20) NOT NULL,
    unidad character varying(30) DEFAULT 'MONTO'::character varying NOT NULL,
    requiere_evidencia boolean DEFAULT false NOT NULL,
    requiere_aprobacion boolean DEFAULT false NOT NULL,
    permite_excepcion boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    id_estado bigint NOT NULL,
    id_usuario bigint,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_concepto_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_concepto_codigo_uk UNIQUE (codigo),
    CONSTRAINT tb_compensacion_concepto_categoria_ck CHECK (((categoria)::text = ANY ((ARRAY['SUELDO'::character varying, 'BONO'::character varying, 'COMISION'::character varying, 'PENALIDAD'::character varying, 'DESCUENTO'::character varying, 'INFORMATIVO'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_concepto_codigo_ck CHECK ((btrim((codigo)::text) <> ''::text)),
    CONSTRAINT tb_compensacion_concepto_naturaleza_ck CHECK (((naturaleza)::text = ANY ((ARRAY['INGRESO'::character varying, 'DESCUENTO'::character varying, 'INFORMATIVO'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_concepto_nombre_ck CHECK ((btrim((nombre)::text) <> ''::text)),
    CONSTRAINT tb_compensacion_concepto_unidad_ck CHECK (((unidad)::text = ANY ((ARRAY['MONTO'::character varying, 'PORCENTAJE'::character varying, 'MINUTO'::character varying, 'HORA'::character varying, 'DIA'::character varying, 'UNIDAD'::character varying, 'PUNTO'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_concepto_his (
    id bigint,
    codigo character varying(80),
    nombre character varying(180),
    categoria character varying(30),
    naturaleza character varying(20),
    unidad character varying(30),
    requiere_evidencia boolean,
    requiere_aprobacion boolean,
    permite_excepcion boolean,
    orden integer,
    id_estado bigint,
    id_usuario bigint,
    fecha_registro timestamp with time zone,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_condicion_mes_his (
    id bigint,
    id_periodo bigint,
    id_colaborador bigint,
    codigo_condicion character varying(30),
    cumple boolean,
    nota text,
    id_usuario_registra bigint,
    fecha_registro timestamp with time zone,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_descuento_mes_his (
    id bigint,
    id_periodo bigint,
    id_colaborador bigint,
    tipo_origen character varying(40),
    tipo character varying(12),
    porcentaje numeric(5,2),
    importe_base numeric(14,2),
    importe_descuento numeric(14,2),
    id_concepto bigint,
    motivo text,
    estado character varying(10),
    id_usuario_registra bigint,
    fecha_registro timestamp with time zone,
    id_usuario_anula bigint,
    fecha_anulacion timestamp with time zone,
    motivo_anulacion text,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_evento_his (
    id bigint,
    id_tipo_evento bigint,
    id_colaborador_beneficiario bigint,
    id_colaborador_responsable bigint,
    id_sucursal_origen bigint,
    id_sucursal_responsable bigint,
    id_penalidad_tipo bigint,
    fecha_evento timestamp with time zone,
    periodo_imputacion date,
    fuente character varying(30),
    clave_origen character varying(200),
    titulo character varying(250),
    descripcion text,
    datos jsonb,
    evidencia jsonb,
    criterios_validacion_snapshot jsonb,
    estado_evento character varying(20),
    id_regla_aplicada bigint,
    base_calculo numeric(16,4),
    cantidad numeric(16,4),
    tarifa_aplicada numeric(16,6),
    importe_aprobado numeric(14,2),
    id_usuario_registra bigint,
    fecha_registro timestamp with time zone,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_evento_tipo_his (
    id bigint,
    codigo character varying(80),
    nombre character varying(180),
    categoria character varying(30),
    id_concepto bigint,
    requiere_beneficiario boolean,
    requiere_responsable boolean,
    requiere_cliente boolean,
    requiere_operacion boolean,
    configuracion jsonb,
    id_estado bigint,
    id_usuario bigint,
    fecha_registro timestamp with time zone,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_excepcion_his (
    id bigint,
    id_colaborador bigint,
    id_concepto bigint,
    tipo_calculo character varying(30),
    monto numeric(14,2),
    porcentaje numeric(12,6),
    configuracion jsonb,
    fecha_inicio date,
    fecha_fin date,
    motivo text,
    estado_aprobacion character varying(20),
    id_usuario_aprueba bigint,
    fecha_aprobacion timestamp with time zone,
    id_estado bigint,
    id_usuario bigint,
    fecha_registro timestamp with time zone,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_mes_adjudicacion (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    periodo date NOT NULL,
    criterio text NOT NULL,
    version text NOT NULL,
    snapshot jsonb NOT NULL,
    justificacion text NOT NULL,
    id_usuario bigint NOT NULL,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_mes_adjudicacion_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_mes_adjudicacion_periodo_criterio_key UNIQUE (periodo, criterio),
    CONSTRAINT tb_compensacion_mes_adjudicacion_criterio_check CHECK ((criterio = ANY (ARRAY['ATENCIONES'::text, 'CALIFICACIONES'::text])))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_meta_sede_his (
    id bigint,
    id_plan_version bigint,
    id_sucursal bigint,
    codigo_indicador character varying(80),
    periodo date,
    valor_meta numeric(16,4),
    unidad character varying(30),
    configuracion jsonb,
    id_estado bigint,
    id_usuario bigint,
    fecha_registro timestamp with time zone,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_pancake_mes (
    periodo date NOT NULL,
    paginas text[] NOT NULL,
    id_usuario bigint NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    certificacion jsonb,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_pancake_mes_pkey PRIMARY KEY (periodo),
    CONSTRAINT tb_compensacion_pancake_mes_paginas_check CHECK ((cardinality(paginas) > 0)),
    CONSTRAINT tb_compensacion_pancake_mes_periodo_check CHECK ((periodo = (date_trunc('month'::text, (periodo)::timestamp with time zone))::date))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_penalidad_tipo_his (
    id bigint,
    id_plan_version bigint,
    codigo character varying(80),
    nombre character varying(180),
    descripcion text,
    id_cargo bigint,
    id_concepto_descuento bigint,
    id_concepto_bono_reportante bigint,
    monto_referencia numeric(14,2),
    monto_bono_reportante numeric(14,2),
    requiere_respuesta boolean,
    configuracion jsonb,
    id_estado bigint,
    id_usuario bigint,
    fecha_registro timestamp with time zone,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_periodo (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    periodo date NOT NULL,
    nombre character varying(100) NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date NOT NULL,
    zona_horaria character varying(80) DEFAULT 'America/Lima'::character varying NOT NULL,
    estado_periodo character varying(20) DEFAULT 'ABIERTO'::character varying NOT NULL,
    numero_calculo integer DEFAULT 0 NOT NULL,
    fecha_apertura timestamp with time zone DEFAULT now() NOT NULL,
    fecha_aprobacion timestamp with time zone,
    fecha_cierre timestamp with time zone,
    id_usuario_abre bigint,
    id_usuario_actualiza bigint,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    apertura_automatica boolean DEFAULT false NOT NULL,
    CONSTRAINT tb_compensacion_periodo_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_periodo_periodo_uk UNIQUE (periodo),
    CONSTRAINT tb_compensacion_periodo_actor_ck CHECK (((id_usuario_abre IS NOT NULL) OR apertura_automatica)),
    CONSTRAINT tb_compensacion_periodo_aprobacion_ck CHECK ((((estado_periodo)::text <> ALL ((ARRAY['APROBADO'::character varying, 'CERRADO'::character varying])::text[])) OR (fecha_aprobacion IS NOT NULL))),
    CONSTRAINT tb_compensacion_periodo_calculo_ck CHECK ((numero_calculo >= 0)),
    CONSTRAINT tb_compensacion_periodo_cierre_ck CHECK ((((estado_periodo)::text <> 'CERRADO'::text) OR (fecha_cierre IS NOT NULL))),
    CONSTRAINT tb_compensacion_periodo_estado_ck CHECK (((estado_periodo)::text = ANY ((ARRAY['ABIERTO'::character varying, 'EN_CALCULO'::character varying, 'EN_REVISION'::character varying, 'OBSERVADO'::character varying, 'APROBADO'::character varying, 'CERRADO'::character varying, 'REABIERTO'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_periodo_mes_ck CHECK (((periodo = (date_trunc('month'::text, (periodo)::timestamp with time zone))::date) AND (fecha_inicio = periodo) AND (fecha_fin = ((periodo + '1 mon -1 days'::interval))::date)))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_periodo_his (
    id bigint,
    periodo date,
    nombre character varying(100),
    fecha_inicio date,
    fecha_fin date,
    zona_horaria character varying(80),
    estado_periodo character varying(20),
    numero_calculo integer,
    fecha_apertura timestamp with time zone,
    fecha_aprobacion timestamp with time zone,
    fecha_cierre timestamp with time zone,
    id_usuario_abre bigint,
    id_usuario_actualiza bigint,
    fecha_actualizacion timestamp with time zone,
    apertura_automatica boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_plan (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    codigo character varying(50) NOT NULL,
    nombre character varying(150) NOT NULL,
    descripcion text,
    id_estado bigint NOT NULL,
    id_usuario bigint,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_plan_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_plan_codigo_uk UNIQUE (codigo),
    CONSTRAINT tb_compensacion_plan_codigo_ck CHECK ((btrim((codigo)::text) <> ''::text)),
    CONSTRAINT tb_compensacion_plan_nombre_ck CHECK ((btrim((nombre)::text) <> ''::text))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_plan_his (
    id bigint,
    codigo character varying(50),
    nombre character varying(150),
    descripcion text,
    id_estado bigint,
    id_usuario bigint,
    fecha_registro timestamp with time zone,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_plan_version_his (
    id bigint,
    id_plan bigint,
    numero_version integer,
    nombre character varying(150),
    fecha_inicio date,
    fecha_fin date,
    estado_version character varying(20),
    observacion text,
    fecha_publicacion timestamp with time zone,
    id_usuario_publica bigint,
    id_usuario bigint,
    fecha_registro timestamp with time zone,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_referido_his (
    id bigint,
    id_evento bigint,
    id_cliente bigint,
    id_colaborador_referente bigint,
    nombre_referido_snapshot character varying(300),
    documento_referido_snapshot character varying(30),
    fecha_referencia timestamp with time zone,
    estado_referido character varying(20),
    observacion text,
    id_usuario bigint,
    fecha_registro timestamp with time zone,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_regla_his (
    id bigint,
    id_plan_version bigint,
    id_concepto bigint,
    id_cargo bigint,
    id_sucursal bigint,
    tipo_calculo character varying(30),
    monto numeric(14,2),
    porcentaje numeric(12,6),
    valor_minimo numeric(14,4),
    valor_maximo numeric(14,4),
    tope_importe numeric(14,2),
    prioridad integer,
    configuracion jsonb,
    id_estado bigint,
    id_usuario bigint,
    fecha_registro timestamp with time zone,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_reporte_mes_his (
    id bigint,
    id_periodo bigint,
    estado character varying(12),
    nota text,
    snapshot jsonb,
    hash_contenido text,
    confirmado_por bigint,
    confirmado_en timestamp with time zone,
    reabierto_por bigint,
    reabierto_en timestamp with time zone,
    motivo_reapertura text,
    veces_confirmado integer,
    fecha_registro timestamp with time zone,
    fecha_actualizacion timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_safetypay_registro (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_usuario bigint NOT NULL,
    codigo_operacion text NOT NULL,
    tipo_documento bigint NOT NULL,
    documento text NOT NULL,
    monto numeric(12,2) NOT NULL,
    id_comunidad bigint NOT NULL,
    nombre_comunidad text,
    fecha_deposito timestamp with time zone NOT NULL,
    codigo_cliente text,
    tarjeta text,
    banco text,
    estado text DEFAULT 'REGISTRADO'::text NOT NULL,
    id_operacion_proceso bigint,
    fecha_cruce timestamp with time zone,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_safetypay_registro_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_safetypay_registro_banco_ck CHECK (((banco IS NULL) OR (banco = ANY (ARRAY['CMR'::text, 'IBK'::text, 'IO'::text])))),
    CONSTRAINT tb_compensacion_safetypay_registro_codigo_cliente_ck CHECK (((codigo_cliente IS NULL) OR (codigo_cliente ~ '^[0-9]{6}$'::text))),
    CONSTRAINT tb_compensacion_safetypay_registro_cruce_ck CHECK ((((estado = 'REGISTRADO'::text) AND (id_operacion_proceso IS NULL)) OR ((estado <> 'REGISTRADO'::text) AND (id_operacion_proceso IS NOT NULL)))),
    CONSTRAINT tb_compensacion_safetypay_registro_estado_ck CHECK ((estado = ANY (ARRAY['REGISTRADO'::text, 'PENDIENTE'::text, 'PAGADO'::text]))),
    CONSTRAINT tb_compensacion_safetypay_registro_monto_ck CHECK ((monto > (0)::numeric))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_seguimiento_historial (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    periodo date NOT NULL,
    id_colaborador bigint NOT NULL,
    revision bigint NOT NULL,
    huella text,
    resultado jsonb,
    requiere_revision boolean NOT NULL,
    congelado boolean NOT NULL,
    fecha_calculo timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_seguimiento_historial_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_seguimiento_h_periodo_id_colaborador_revisi_key UNIQUE (periodo, id_colaborador, revision)
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_asignacion (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_colaborador bigint NOT NULL,
    id_cargo bigint NOT NULL,
    id_sucursal bigint NOT NULL,
    id_plan bigint NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date,
    modalidad character varying(30) DEFAULT 'PRESENCIAL'::character varying NOT NULL,
    observacion text,
    id_estado bigint NOT NULL,
    id_usuario bigint,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_asignacion_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_asignacion_fechas_ck CHECK (((fecha_fin IS NULL) OR (fecha_fin >= fecha_inicio))),
    CONSTRAINT tb_compensacion_asignacion_modalidad_ck CHECK (((modalidad)::text = ANY ((ARRAY['PRESENCIAL'::character varying, 'REMOTO'::character varying, 'HIBRIDO'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_calidad_diaria (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_colaborador bigint NOT NULL,
    id_sucursal bigint NOT NULL,
    fecha date NOT NULL,
    mensajes integer NOT NULL,
    respuestas integer NOT NULL,
    calidad_conforme boolean NOT NULL,
    notas text NOT NULL,
    meta_mensajes integer,
    meta_respuestas integer,
    id_usuario bigint NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    historial jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT tb_compensacion_calidad_diaria_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_calidad_diaria_id_colaborador_fecha_key UNIQUE (id_colaborador, fecha),
    CONSTRAINT tb_compensacion_calidad_diaria_mensajes_check CHECK (((mensajes >= 0) AND (mensajes <= 100000))),
    CONSTRAINT tb_compensacion_calidad_diaria_notas_check CHECK (((length(notas) >= 5) AND (length(notas) <= 2000))),
    CONSTRAINT tb_compensacion_calidad_diaria_respuestas_check CHECK (((respuestas >= 0) AND (respuestas <= 100000)))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_calificacion_enlace (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_colaborador bigint NOT NULL,
    token_hash bytea NOT NULL,
    id_usuario_genera bigint NOT NULL,
    fecha_creacion timestamp with time zone DEFAULT now() NOT NULL,
    fecha_revocacion timestamp with time zone,
    fecha_expiracion timestamp with time zone DEFAULT (now() + '1 year'::interval) NOT NULL,
    token_value text,
    CONSTRAINT tb_compensacion_calificacion_enlace_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_calificacion_enlace_token_hash_key UNIQUE (token_hash),
    CONSTRAINT tb_compensacion_calificacion_enlace_check CHECK (((token_value IS NULL) OR ((token_value ~ '^[a-f0-9]{64}$'::text) AND (sha256(convert_to(token_value, 'UTF8'::name)) = token_hash))))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_captacion_nota (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_cliente bigint NOT NULL,
    id_colaborador bigint NOT NULL,
    nota text NOT NULL,
    id_usuario bigint NOT NULL,
    fecha_registro timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT tb_compensacion_captacion_nota_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_captacion_nota_nota_check CHECK (((length(btrim(nota)) >= 1) AND (length(btrim(nota)) <= 2000)))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_captacion_revision (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_cliente bigint NOT NULL,
    id_colaborador bigint NOT NULL,
    decision text NOT NULL,
    motivo text NOT NULL,
    huella text NOT NULL,
    fuente_snapshot jsonb NOT NULL,
    id_usuario_revisa bigint NOT NULL,
    fecha_revision timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    concepto_codigo text DEFAULT 'COMISION_REGISTRO_EFECTIVIZACION'::text NOT NULL,
    CONSTRAINT tb_compensacion_captacion_revision_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_captacion_revision_decision_check CHECK ((decision = ANY (ARRAY['APROBADO'::text, 'RECHAZADO'::text]))),
    CONSTRAINT tb_compensacion_captacion_revision_motivo_check CHECK ((length(btrim(motivo)) >= 10))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_chat_dni (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    periodo date NOT NULL,
    id_colaborador bigint NOT NULL,
    id_cliente bigint NOT NULL,
    documento text NOT NULL,
    fecha_atencion date NOT NULL,
    clave uuid NOT NULL,
    estado text DEFAULT 'ACTIVO'::text NOT NULL,
    motivo_anulacion text,
    id_usuario bigint NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    id_usuario_anula bigint,
    fecha_anulacion timestamp with time zone,
    CONSTRAINT tb_compensacion_chat_dni_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_chat_dni_anulado_ck CHECK (((estado = 'ANULADO'::text) = ((motivo_anulacion IS NOT NULL) AND (fecha_anulacion IS NOT NULL)))),
    CONSTRAINT tb_compensacion_chat_dni_documento_check CHECK ((documento ~ '^[0-9]{8}$'::text)),
    CONSTRAINT tb_compensacion_chat_dni_estado_check CHECK ((estado = ANY (ARRAY['ACTIVO'::text, 'ANULADO'::text]))),
    CONSTRAINT tb_compensacion_chat_dni_fecha_ck CHECK (((date_trunc('month'::text, (fecha_atencion)::timestamp with time zone))::date = periodo)),
    CONSTRAINT tb_compensacion_chat_dni_periodo_check CHECK ((periodo = (date_trunc('month'::text, (periodo)::timestamp with time zone))::date))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_condicion_mes (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    id_periodo bigint NOT NULL,
    id_colaborador bigint NOT NULL,
    codigo_condicion character varying(30) NOT NULL,
    cumple boolean NOT NULL,
    nota text,
    id_usuario_registra bigint NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_condicion_mes_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_condicion_mes_unica UNIQUE (id_periodo, id_colaborador, codigo_condicion),
    CONSTRAINT tb_compensacion_condicion_mes_codigo_ck CHECK (((codigo_condicion)::text = ANY ((ARRAY['PUNTUALIDAD'::character varying, 'META_AREA_15_DIAS'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_descuento_mes (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    id_periodo bigint NOT NULL,
    id_colaborador bigint NOT NULL,
    tipo_origen character varying(40) NOT NULL,
    tipo character varying(12) NOT NULL,
    porcentaje numeric(5,2) NOT NULL,
    importe_base numeric(14,2) NOT NULL,
    importe_descuento numeric(14,2) NOT NULL,
    id_concepto bigint NOT NULL,
    motivo text NOT NULL,
    estado character varying(10) DEFAULT 'ACTIVO'::character varying NOT NULL,
    id_usuario_registra bigint NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    id_usuario_anula bigint,
    fecha_anulacion timestamp with time zone,
    motivo_anulacion text,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_descuento_mes_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_descuento_mes_anulacion_ck CHECK ((((estado)::text = 'ACTIVO'::text) OR ((id_usuario_anula IS NOT NULL) AND (fecha_anulacion IS NOT NULL) AND (btrim(COALESCE(motivo_anulacion, ''::text)) <> ''::text)))),
    CONSTRAINT tb_compensacion_descuento_mes_estado_ck CHECK (((estado)::text = ANY ((ARRAY['ACTIVO'::character varying, 'ANULADO'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_descuento_mes_importes_ck CHECK (((importe_base >= (0)::numeric) AND (importe_descuento >= (0)::numeric))),
    CONSTRAINT tb_compensacion_descuento_mes_motivo_ck CHECK ((btrim(motivo) <> ''::text)),
    CONSTRAINT tb_compensacion_descuento_mes_origen_ck CHECK (((tipo_origen)::text = ANY ((ARRAY['ERROR_CUADRO'::character varying, 'TOLERANCIA_CERO_DIGITAL'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_descuento_mes_porcentaje_ck CHECK (((((tipo)::text = 'BLOQUE_30'::text) AND (porcentaje = (30)::numeric)) OR (((tipo)::text = 'BLOQUE_60'::text) AND (porcentaje = (60)::numeric)) OR (((tipo)::text = 'BLOQUE_90'::text) AND (porcentaje = (90)::numeric)) OR (((tipo)::text = 'TOTAL'::text) AND (porcentaje = (100)::numeric)))),
    CONSTRAINT tb_compensacion_descuento_mes_tipo_ck CHECK (((tipo)::text = ANY ((ARRAY['BLOQUE_30'::character varying, 'BLOQUE_60'::character varying, 'BLOQUE_90'::character varying, 'TOTAL'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_descuento_mes_tolerancia_ck CHECK ((((tipo_origen)::text <> 'TOLERANCIA_CERO_DIGITAL'::text) OR ((tipo)::text = 'TOTAL'::text)))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_evento_tipo (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    codigo character varying(80) NOT NULL,
    nombre character varying(180) NOT NULL,
    categoria character varying(30) NOT NULL,
    id_concepto bigint,
    requiere_beneficiario boolean DEFAULT true NOT NULL,
    requiere_responsable boolean DEFAULT false NOT NULL,
    requiere_cliente boolean DEFAULT false NOT NULL,
    requiere_operacion boolean DEFAULT false NOT NULL,
    configuracion jsonb DEFAULT '{}'::jsonb NOT NULL,
    id_estado bigint NOT NULL,
    id_usuario bigint,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_evento_tipo_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_evento_tipo_codigo_uk UNIQUE (codigo),
    CONSTRAINT tb_compensacion_evento_tipo_categoria_ck CHECK (((categoria)::text = ANY ((ARRAY['CALIFICACION'::character varying, 'LLAMADA'::character varying, 'TARJETA_TERCERO'::character varying, 'REFERIDO'::character varying, 'PENALIDAD'::character varying, 'AUDITORIA_PAGO'::character varying, 'AJUSTE_MANUAL'::character varying, 'OTRO'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_evento_tipo_codigo_ck CHECK ((btrim((codigo)::text) <> ''::text)),
    CONSTRAINT tb_compensacion_evento_tipo_nombre_ck CHECK ((btrim((nombre)::text) <> ''::text))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_excepcion (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_colaborador bigint NOT NULL,
    id_concepto bigint NOT NULL,
    tipo_calculo character varying(30) NOT NULL,
    monto numeric(14,2),
    porcentaje numeric(12,6),
    configuracion jsonb DEFAULT '{}'::jsonb NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date,
    motivo text NOT NULL,
    estado_aprobacion character varying(20) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    id_usuario_aprueba bigint,
    fecha_aprobacion timestamp with time zone,
    id_estado bigint NOT NULL,
    id_usuario bigint,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_excepcion_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_excepcion_aprobacion_ck CHECK ((((estado_aprobacion)::text <> ALL ((ARRAY['APROBADA'::character varying, 'RECHAZADA'::character varying])::text[])) OR ((id_usuario_aprueba IS NOT NULL) AND (fecha_aprobacion IS NOT NULL)))),
    CONSTRAINT tb_compensacion_excepcion_estado_aprobacion_ck CHECK (((estado_aprobacion)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'APROBADA'::character varying, 'RECHAZADA'::character varying, 'ANULADA'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_excepcion_fechas_ck CHECK (((fecha_fin IS NULL) OR (fecha_fin >= fecha_inicio))),
    CONSTRAINT tb_compensacion_excepcion_monto_ck CHECK (((monto IS NULL) OR (monto >= (0)::numeric))),
    CONSTRAINT tb_compensacion_excepcion_motivo_ck CHECK ((btrim(motivo) <> ''::text)),
    CONSTRAINT tb_compensacion_excepcion_porcentaje_ck CHECK (((porcentaje IS NULL) OR ((porcentaje >= (0)::numeric) AND (porcentaje <= (100)::numeric)))),
    CONSTRAINT tb_compensacion_excepcion_tipo_ck CHECK (((tipo_calculo)::text = ANY ((ARRAY['FIJO'::character varying, 'PORCENTAJE'::character varying, 'POR_MINUTO'::character varying, 'POR_HORA'::character varying, 'POR_DIA'::character varying, 'POR_UNIDAD'::character varying, 'FORMULA'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_excepcion_valor_ck CHECK (((((tipo_calculo)::text = 'PORCENTAJE'::text) AND (porcentaje IS NOT NULL)) OR (((tipo_calculo)::text = 'FORMULA'::text) AND (configuracion <> '{}'::jsonb)) OR (((tipo_calculo)::text = ANY ((ARRAY['FIJO'::character varying, 'POR_MINUTO'::character varying, 'POR_HORA'::character varying, 'POR_DIA'::character varying, 'POR_UNIDAD'::character varying])::text[])) AND (monto IS NOT NULL))))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_exportacion (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_periodo bigint NOT NULL,
    tipo_reporte character varying(50) NOT NULL,
    formato character varying(10) NOT NULL,
    filtros jsonb DEFAULT '{}'::jsonb NOT NULL,
    nombre_archivo character varying(300) NOT NULL,
    hash_archivo character varying(128),
    total_registros integer DEFAULT 0 NOT NULL,
    total_reportado numeric(16,2),
    estado_exportacion character varying(20) DEFAULT 'GENERADA'::character varying NOT NULL,
    mensaje_error text,
    clave_idempotencia character varying(200),
    id_usuario bigint NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    id_usuario_anula bigint,
    fecha_anulacion timestamp with time zone,
    motivo_anulacion text,
    CONSTRAINT tb_compensacion_exportacion_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_exportacion_anulacion_ck CHECK ((((estado_exportacion)::text <> 'ANULADA'::text) OR ((id_usuario_anula IS NOT NULL) AND (fecha_anulacion IS NOT NULL) AND (btrim(COALESCE(motivo_anulacion, ''::text)) <> ''::text)))),
    CONSTRAINT tb_compensacion_exportacion_estado_ck CHECK (((estado_exportacion)::text = ANY ((ARRAY['GENERADA'::character varying, 'ERROR'::character varying, 'ANULADA'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_exportacion_formato_ck CHECK (((formato)::text = ANY ((ARRAY['PDF'::character varying, 'XLSX'::character varying, 'CSV'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_exportacion_tipo_ck CHECK (((tipo_reporte)::text = ANY ((ARRAY['GENERAL_FINANCIERO'::character varying, 'DETALLE_COLABORADOR'::character varying, 'RESUMEN_SEDE'::character varying, 'PRODUCTIVIDAD'::character varying, 'OTRO'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_exportacion_totales_ck CHECK (((total_registros >= 0) AND ((total_reportado IS NULL) OR (total_reportado >= (0)::numeric))))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_marketing_campana (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_colaborador bigint NOT NULL,
    id_usuario bigint NOT NULL,
    clave uuid NOT NULL,
    nombre character varying(200) NOT NULL,
    descripcion text NOT NULL,
    canal character varying(30) NOT NULL,
    fecha_inicio date NOT NULL,
    evidencia text,
    fecha_registro timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT tb_compensacion_marketing_campana_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_marketing_campana_clave_key UNIQUE (clave),
    CONSTRAINT tb_compensacion_marketing_campana_canal_check CHECK (((canal)::text = ANY ((ARRAY['TIKTOK'::character varying, 'INSTAGRAM'::character varying, 'FACEBOOK'::character varying, 'YOUTUBE'::character varying, 'WHATSAPP'::character varying, 'OTRO'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_marketing_campana_descripcion_check CHECK (((length(btrim(descripcion)) >= 3) AND (length(btrim(descripcion)) <= 2000))),
    CONSTRAINT tb_compensacion_marketing_campana_evidencia_check CHECK (((evidencia IS NULL) OR ((length(evidencia) <= 2000) AND (evidencia ~ '^https://[^[:space:]]+$'::text)))),
    CONSTRAINT tb_compensacion_marketing_campana_nombre_check CHECK ((length(btrim((nombre)::text)) >= 3))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_mes_premio (
    id_adjudicacion bigint NOT NULL,
    id_colaborador bigint NOT NULL,
    centimos integer NOT NULL,
    CONSTRAINT tb_compensacion_mes_premio_pkey PRIMARY KEY (id_adjudicacion, id_colaborador),
    CONSTRAINT tb_compensacion_mes_premio_centimos_check CHECK (((centimos > 0) AND (centimos <= 10000)))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_pagos_entrega (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_operacion bigint NOT NULL,
    id_colaborador bigint NOT NULL,
    id_usuario bigint NOT NULL,
    clave uuid NOT NULL,
    evidencia text NOT NULL,
    fecha_entrega timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    operacion_snapshot jsonb NOT NULL,
    estado character varying DEFAULT 'PENDIENTE'::character varying NOT NULL,
    id_usuario_revisa bigint,
    fecha_revision timestamp with time zone,
    motivo_revision text,
    historial jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT tb_compensacion_pagos_entrega_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_pagos_entrega_clave_key UNIQUE (clave),
    CONSTRAINT tb_compensacion_pagos_entrega_id_operacion_key UNIQUE (id_operacion),
    CONSTRAINT tb_compensacion_pagos_entrega_check CHECK (((id_usuario_revisa IS NULL) OR (id_usuario_revisa <> id_usuario))),
    CONSTRAINT tb_compensacion_pagos_entrega_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'VALIDADO'::character varying, 'OBSERVADO'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_pagos_entrega_evidencia_check CHECK (((length(evidencia) <= 2000) AND (evidencia ~ '^https://[^[:space:]]+$'::text)))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_pancake_identidad (
    periodo date NOT NULL,
    pagina text NOT NULL,
    usuario_externo text NOT NULL,
    id_colaborador bigint NOT NULL,
    CONSTRAINT tb_compensacion_pancake_identidad_pkey PRIMARY KEY (periodo, pagina, usuario_externo)
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_pancake_importacion (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    periodo date NOT NULL,
    pagina text NOT NULL,
    archivo text NOT NULL,
    huella text NOT NULL,
    original text NOT NULL,
    mapeo jsonb NOT NULL,
    justificacion text NOT NULL,
    id_usuario bigint NOT NULL,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_pancake_importacion_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_pancake_importacion_periodo_pagina_huella_key UNIQUE (periodo, pagina, huella)
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_plan_version (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_plan bigint NOT NULL,
    numero_version integer NOT NULL,
    nombre character varying(150),
    fecha_inicio date NOT NULL,
    fecha_fin date,
    estado_version character varying(20) DEFAULT 'BORRADOR'::character varying NOT NULL,
    observacion text,
    fecha_publicacion timestamp with time zone,
    id_usuario_publica bigint,
    id_usuario bigint,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_plan_version_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_plan_version_numero_uk UNIQUE (id_plan, numero_version),
    CONSTRAINT tb_compensacion_plan_version_estado_ck CHECK (((estado_version)::text = ANY ((ARRAY['BORRADOR'::character varying, 'PUBLICADA'::character varying, 'RETIRADA'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_plan_version_fechas_ck CHECK (((fecha_fin IS NULL) OR (fecha_fin >= fecha_inicio))),
    CONSTRAINT tb_compensacion_plan_version_numero_ck CHECK ((numero_version > 0)),
    CONSTRAINT tb_compensacion_plan_version_publicacion_ck CHECK ((((estado_version)::text = 'BORRADOR'::text) OR (fecha_publicacion IS NOT NULL)))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_reporte_mes (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    id_periodo bigint NOT NULL,
    estado character varying(12) DEFAULT 'BORRADOR'::character varying NOT NULL,
    nota text,
    snapshot jsonb,
    hash_contenido text,
    confirmado_por bigint,
    confirmado_en timestamp with time zone,
    reabierto_por bigint,
    reabierto_en timestamp with time zone,
    motivo_reapertura text,
    veces_confirmado integer DEFAULT 0 NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_reporte_mes_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_reporte_mes_unico UNIQUE (id_periodo),
    CONSTRAINT tb_compensacion_reporte_mes_confirmado_ck CHECK ((((estado)::text <> 'CONFIRMADO'::text) OR ((confirmado_por IS NOT NULL) AND (confirmado_en IS NOT NULL) AND (snapshot IS NOT NULL) AND (hash_contenido IS NOT NULL)))),
    CONSTRAINT tb_compensacion_reporte_mes_estado_ck CHECK (((estado)::text = ANY ((ARRAY['BORRADOR'::character varying, 'CONFIRMADO'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_seguimiento_cola (
    periodo date NOT NULL,
    id_colaborador bigint NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    revision_procesada bigint DEFAULT 0 NOT NULL,
    ultima_transaccion bigint DEFAULT txid_current() NOT NULL,
    motivo text NOT NULL,
    disponible_desde timestamp with time zone DEFAULT now() NOT NULL,
    intentos integer DEFAULT 0 NOT NULL,
    error_codigo text,
    fecha_evento timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_seguimiento_cola_pkey PRIMARY KEY (periodo, id_colaborador),
    CONSTRAINT tb_compensacion_seguimiento_cola_intentos_check CHECK ((intentos >= 0)),
    CONSTRAINT tb_compensacion_seguimiento_cola_periodo_check CHECK ((periodo = (date_trunc('month'::text, (periodo)::timestamp with time zone))::date)),
    CONSTRAINT tb_compensacion_seguimiento_cola_revision_check CHECK ((revision > 0)),
    CONSTRAINT tb_compensacion_seguimiento_cola_revision_procesada_check CHECK ((revision_procesada >= 0))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_seguimiento_invalidacion (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    periodo date NOT NULL,
    id_colaborador bigint NOT NULL,
    motivo text NOT NULL,
    procesada boolean DEFAULT false NOT NULL,
    fecha_evento timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT tb_compensacion_seguimiento_invalidacion_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_seguimiento_invalidacion_periodo_check CHECK ((periodo = (date_trunc('month'::text, (periodo)::timestamp with time zone))::date))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_seguimiento_resultado (
    periodo date NOT NULL,
    id_colaborador bigint NOT NULL,
    revision bigint NOT NULL,
    resultado jsonb,
    huella text,
    fecha_calculo timestamp with time zone DEFAULT now() NOT NULL,
    requiere_revision boolean DEFAULT false NOT NULL,
    congelado boolean DEFAULT false NOT NULL,
    CONSTRAINT tb_compensacion_seguimiento_resultado_pkey PRIMARY KEY (periodo, id_colaborador)
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_configuracion_efectiva (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_plan bigint NOT NULL,
    id_plan_version_origen bigint NOT NULL,
    fecha_desde date NOT NULL,
    reglas_snapshot jsonb NOT NULL,
    id_usuario bigint NOT NULL,
    fecha_registro timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    penalidades_snapshot jsonb,
    CONSTRAINT tb_compensacion_configuracion_efectiva_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_configuracion_efecti_penalidades_snapshot_check CHECK (((penalidades_snapshot IS NULL) OR (jsonb_typeof(penalidades_snapshot) = 'array'::text))),
    CONSTRAINT tb_compensacion_configuracion_efectiva_reglas_snapshot_check CHECK ((jsonb_typeof(reglas_snapshot) = 'array'::text))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_meta_sede (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_plan_version bigint NOT NULL,
    id_sucursal bigint NOT NULL,
    codigo_indicador character varying(80) NOT NULL,
    periodo date NOT NULL,
    valor_meta numeric(16,4) NOT NULL,
    unidad character varying(30) DEFAULT 'MONTO'::character varying NOT NULL,
    configuracion jsonb DEFAULT '{}'::jsonb NOT NULL,
    id_estado bigint NOT NULL,
    id_usuario bigint,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_meta_sede_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_meta_sede_uk UNIQUE (id_plan_version, id_sucursal, codigo_indicador, periodo),
    CONSTRAINT tb_compensacion_meta_sede_periodo_ck CHECK ((periodo = (date_trunc('month'::text, (periodo)::timestamp with time zone))::date)),
    CONSTRAINT tb_compensacion_meta_sede_unidad_ck CHECK (((unidad)::text = ANY ((ARRAY['MONTO'::character varying, 'PORCENTAJE'::character varying, 'UNIDAD'::character varying, 'PUNTO'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_meta_sede_valor_ck CHECK ((valor_meta >= (0)::numeric))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_pancake_conversacion (
    pagina text NOT NULL,
    conversacion text NOT NULL,
    periodo date NOT NULL,
    id_colaborador bigint NOT NULL,
    usuario_externo text NOT NULL,
    fecha_efectiva timestamp with time zone NOT NULL,
    efectiva boolean NOT NULL,
    id_importacion bigint NOT NULL,
    CONSTRAINT tb_compensacion_pancake_conversacion_pkey PRIMARY KEY (pagina, conversacion)
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_penalidad_tipo (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_plan_version bigint NOT NULL,
    codigo character varying(80) NOT NULL,
    nombre character varying(180) NOT NULL,
    descripcion text,
    id_cargo bigint,
    id_concepto_descuento bigint NOT NULL,
    id_concepto_bono_reportante bigint,
    monto_referencia numeric(14,2) NOT NULL,
    monto_bono_reportante numeric(14,2),
    requiere_respuesta boolean DEFAULT true NOT NULL,
    configuracion jsonb DEFAULT '{}'::jsonb NOT NULL,
    id_estado bigint NOT NULL,
    id_usuario bigint,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_penalidad_tipo_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_penalidad_tipo_codigo_uk UNIQUE (id_plan_version, codigo),
    CONSTRAINT tb_compensacion_penalidad_tipo_bono_ck CHECK (((monto_bono_reportante IS NULL) OR (monto_bono_reportante >= (0)::numeric))),
    CONSTRAINT tb_compensacion_penalidad_tipo_codigo_ck CHECK ((btrim((codigo)::text) <> ''::text)),
    CONSTRAINT tb_compensacion_penalidad_tipo_monto_ck CHECK ((monto_referencia >= (0)::numeric)),
    CONSTRAINT tb_compensacion_penalidad_tipo_nombre_ck CHECK ((btrim((nombre)::text) <> ''::text))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_regla (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_plan_version bigint NOT NULL,
    id_concepto bigint NOT NULL,
    id_cargo bigint,
    id_sucursal bigint,
    tipo_calculo character varying(30) NOT NULL,
    monto numeric(14,2),
    porcentaje numeric(12,6),
    valor_minimo numeric(14,4),
    valor_maximo numeric(14,4),
    tope_importe numeric(14,2),
    prioridad integer DEFAULT 0 NOT NULL,
    configuracion jsonb DEFAULT '{}'::jsonb NOT NULL,
    id_estado bigint NOT NULL,
    id_usuario bigint,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_regla_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_regla_monto_ck CHECK (((monto IS NULL) OR (monto >= (0)::numeric))),
    CONSTRAINT tb_compensacion_regla_porcentaje_ck CHECK (((porcentaje IS NULL) OR ((porcentaje >= (0)::numeric) AND (porcentaje <= (100)::numeric)))),
    CONSTRAINT tb_compensacion_regla_rango_ck CHECK (((valor_minimo IS NULL) OR (valor_maximo IS NULL) OR (valor_maximo >= valor_minimo))),
    CONSTRAINT tb_compensacion_regla_tipo_ck CHECK (((tipo_calculo)::text = ANY ((ARRAY['FIJO'::character varying, 'PORCENTAJE'::character varying, 'POR_MINUTO'::character varying, 'POR_HORA'::character varying, 'POR_DIA'::character varying, 'POR_UNIDAD'::character varying, 'FORMULA'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_regla_tope_ck CHECK (((tope_importe IS NULL) OR (tope_importe >= (0)::numeric))),
    CONSTRAINT tb_compensacion_regla_valor_ck CHECK (((((tipo_calculo)::text = 'PORCENTAJE'::text) AND (porcentaje IS NOT NULL)) OR (((tipo_calculo)::text = 'FORMULA'::text) AND (configuracion <> '{}'::jsonb)) OR (((tipo_calculo)::text = ANY ((ARRAY['FIJO'::character varying, 'POR_MINUTO'::character varying, 'POR_HORA'::character varying, 'POR_DIA'::character varying, 'POR_UNIDAD'::character varying])::text[])) AND (monto IS NOT NULL))))
);

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
    fuente character varying(30) DEFAULT 'MANUAL'::character varying NOT NULL,
    clave_origen character varying(200),
    titulo character varying(250),
    descripcion text,
    datos jsonb DEFAULT '{}'::jsonb NOT NULL,
    evidencia jsonb DEFAULT '[]'::jsonb NOT NULL,
    criterios_validacion_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    estado_evento character varying(20) DEFAULT 'BORRADOR'::character varying NOT NULL,
    id_regla_aplicada bigint,
    base_calculo numeric(16,4),
    cantidad numeric(16,4),
    tarifa_aplicada numeric(16,6),
    importe_aprobado numeric(14,2),
    id_usuario_registra bigint NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_evento_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_evento_actor_ck CHECK (((id_colaborador_beneficiario IS NOT NULL) OR (id_colaborador_responsable IS NOT NULL))),
    CONSTRAINT tb_compensacion_evento_aprobado_ck CHECK ((((estado_evento)::text <> ALL ((ARRAY['APROBADO'::character varying, 'LIQUIDADO'::character varying])::text[])) OR (importe_aprobado IS NOT NULL))),
    CONSTRAINT tb_compensacion_evento_calculo_ck CHECK ((((base_calculo IS NULL) OR (base_calculo >= (0)::numeric)) AND ((cantidad IS NULL) OR (cantidad >= (0)::numeric)) AND ((tarifa_aplicada IS NULL) OR (tarifa_aplicada >= (0)::numeric)) AND ((importe_aprobado IS NULL) OR (importe_aprobado >= (0)::numeric)))),
    CONSTRAINT tb_compensacion_evento_estado_ck CHECK (((estado_evento)::text = ANY ((ARRAY['BORRADOR'::character varying, 'PENDIENTE'::character varying, 'APROBADO'::character varying, 'RECHAZADO'::character varying, 'ANULADO'::character varying, 'LIQUIDADO'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_evento_fuente_ck CHECK (((fuente)::text = ANY ((ARRAY['MANUAL'::character varying, 'OPERACION'::character varying, 'CLIENTE'::character varying, 'PANCAKE'::character varying, 'IMPORTACION'::character varying, 'MIGRACION'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_evento_periodo_ck CHECK (((periodo_imputacion IS NULL) OR (periodo_imputacion = (date_trunc('month'::text, (periodo_imputacion)::timestamp with time zone))::date)))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_calificacion_envio (
    id_enlace bigint NOT NULL,
    clave uuid NOT NULL,
    contenido_hash bytea NOT NULL,
    id_evento bigint NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_calificacion_envio_pkey PRIMARY KEY (id_enlace, clave),
    CONSTRAINT tb_compensacion_calificacion_envio_id_evento_key UNIQUE (id_evento)
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_caza_errores_vinculo (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_evento_origen bigint NOT NULL,
    id_evento_consecuencia bigint NOT NULL,
    tipo_consecuencia character varying(30) NOT NULL,
    id_usuario_registra bigint NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_caza_errores_vinculo_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_caza_errores_consecuencia_uk UNIQUE (id_evento_consecuencia),
    CONSTRAINT tb_compensacion_caza_errores_vinculo_uk UNIQUE (id_evento_origen, tipo_consecuencia),
    CONSTRAINT tb_compensacion_caza_errores_distinto_ck CHECK ((id_evento_origen <> id_evento_consecuencia)),
    CONSTRAINT tb_compensacion_caza_errores_vinculo_tipo_consecuencia_check CHECK (((tipo_consecuencia)::text = ANY ((ARRAY['COMISION_JEFE'::character varying, 'PENALIDAD_JEFE'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_evento_referencia (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_evento bigint NOT NULL,
    tipo_referencia character varying(30) NOT NULL,
    id_cliente bigint,
    id_operacion bigint,
    identificador_externo character varying(250),
    datos_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    id_usuario bigint,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_evento_referencia_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_evento_referencia_tipo_ck CHECK (((tipo_referencia)::text = ANY ((ARRAY['CLIENTE'::character varying, 'OPERACION'::character varying, 'PANCAKE'::character varying, 'ARCHIVO'::character varying, 'OTRA'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_evento_referencia_valor_ck CHECK (((id_cliente IS NOT NULL) OR (id_operacion IS NOT NULL) OR (btrim((COALESCE(identificador_externo, ''::character varying))::text) <> ''::text)))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_evento_revision (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_evento bigint NOT NULL,
    numero_paso integer NOT NULL,
    etapa character varying(50) NOT NULL,
    decision character varying(20) NOT NULL,
    comentario text,
    id_usuario_revisor bigint NOT NULL,
    fecha_revision timestamp with time zone DEFAULT now() NOT NULL,
    datos_decision jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT tb_compensacion_evento_revision_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_evento_revision_paso_uk UNIQUE (id_evento, numero_paso),
    CONSTRAINT tb_compensacion_evento_revision_comentario_ck CHECK ((((decision)::text <> ALL ((ARRAY['RECHAZADO'::character varying, 'OBSERVADO'::character varying, 'ANULADO'::character varying])::text[])) OR (btrim(COALESCE(comentario, ''::text)) <> ''::text) OR ((((decision)::text = 'RECHAZADO'::text) AND ((etapa)::text = ANY ((ARRAY['REVISION'::character varying, 'ADMIN_CALIFICACION'::character varying])::text[])) AND ((datos_decision ->> 'origen_decision'::text) = 'REVISION_DIRECTA_PLAN_74'::text) AND ((datos_decision ->> 'nota_humana_opcional'::text) = 'true'::text)) IS TRUE))),
    CONSTRAINT tb_compensacion_evento_revision_decision_ck CHECK (((decision)::text = ANY ((ARRAY['ENVIADO'::character varying, 'APROBADO'::character varying, 'RECHAZADO'::character varying, 'OBSERVADO'::character varying, 'ANULADO'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_evento_revision_paso_ck CHECK ((numero_paso > 0))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_hallazgo_correccion (
    id_evento bigint NOT NULL,
    estado text NOT NULL,
    fecha_correccion timestamp with time zone,
    antes_escalamiento boolean DEFAULT false NOT NULL,
    id_colaborador_corrige bigint,
    nota text NOT NULL,
    id_usuario bigint NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    historial jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT tb_compensacion_hallazgo_correccion_pkey PRIMARY KEY (id_evento),
    CONSTRAINT tb_compensacion_hallazgo_correccion_check CHECK (((estado <> 'CORREGIDO'::text) OR ((fecha_correccion IS NOT NULL) AND (id_colaborador_corrige IS NOT NULL) AND (length(btrim(nota)) >= 5)))),
    CONSTRAINT tb_compensacion_hallazgo_correccion_estado_check CHECK ((estado = ANY (ARRAY['PENDIENTE'::text, 'CORREGIDO'::text])))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_referido (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_evento bigint NOT NULL,
    id_cliente bigint NOT NULL,
    id_colaborador_referente bigint NOT NULL,
    nombre_referido_snapshot character varying(300) NOT NULL,
    documento_referido_snapshot character varying(30),
    fecha_referencia timestamp with time zone NOT NULL,
    estado_referido character varying(20) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    observacion text,
    id_usuario bigint NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tb_compensacion_referido_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_referido_evento_uk UNIQUE (id_evento),
    CONSTRAINT tb_compensacion_referido_estado_ck CHECK (((estado_referido)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'VALIDADO'::character varying, 'RECHAZADO'::character varying, 'ANULADO'::character varying])::text[]))),
    CONSTRAINT tb_compensacion_referido_nombre_ck CHECK ((btrim((nombre_referido_snapshot)::text) <> ''::text))
);

CREATE TABLE IF NOT EXISTS public.tb_compensacion_referido_operacion (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    id_referido bigint NOT NULL,
    id_operacion bigint NOT NULL,
    fecha_operacion_snapshot timestamp with time zone NOT NULL,
    banco_snapshot character varying(150),
    monto_operacion_snapshot numeric(14,2) NOT NULL,
    porcentaje_operacion_snapshot numeric(12,6),
    base_comision numeric(14,2) NOT NULL,
    tasa_referido numeric(12,6) NOT NULL,
    importe_comision numeric(14,2) NOT NULL,
    es_elegible boolean DEFAULT true NOT NULL,
    motivo_no_elegible text,
    id_usuario bigint NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    id_evento bigint,
    CONSTRAINT tb_compensacion_referido_operacion_pkey PRIMARY KEY (id),
    CONSTRAINT tb_compensacion_referido_operacion_operacion_uk UNIQUE (id_operacion),
    CONSTRAINT tb_compensacion_referido_operacion_elegible_ck CHECK ((es_elegible OR (btrim(COALESCE(motivo_no_elegible, ''::text)) <> ''::text))),
    CONSTRAINT tb_compensacion_referido_operacion_montos_ck CHECK (((monto_operacion_snapshot >= (0)::numeric) AND (base_comision >= (0)::numeric) AND ((tasa_referido >= (0)::numeric) AND (tasa_referido <= (100)::numeric)) AND (importe_comision >= (0)::numeric) AND ((porcentaje_operacion_snapshot IS NULL) OR ((porcentaje_operacion_snapshot >= (0)::numeric) AND (porcentaje_operacion_snapshot <= (100)::numeric)))))
);

-- Claves foráneas (después de crear todas las tablas).
ALTER TABLE public.tb_compensacion_acceso DROP CONSTRAINT IF EXISTS tb_compensacion_acceso_estado_fk;
ALTER TABLE public.tb_compensacion_acceso ADD CONSTRAINT tb_compensacion_acceso_estado_fk FOREIGN KEY (id_estado) REFERENCES tb_estado(id);
ALTER TABLE public.tb_compensacion_acceso DROP CONSTRAINT IF EXISTS tb_compensacion_acceso_sucursal_fk;
ALTER TABLE public.tb_compensacion_acceso ADD CONSTRAINT tb_compensacion_acceso_sucursal_fk FOREIGN KEY (id_sucursal) REFERENCES tb_sucursal(id);
ALTER TABLE public.tb_compensacion_acceso DROP CONSTRAINT IF EXISTS tb_compensacion_acceso_usuario_fk;
ALTER TABLE public.tb_compensacion_acceso ADD CONSTRAINT tb_compensacion_acceso_usuario_fk FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_acceso DROP CONSTRAINT IF EXISTS tb_compensacion_acceso_usuario_registra_fk;
ALTER TABLE public.tb_compensacion_acceso ADD CONSTRAINT tb_compensacion_acceso_usuario_registra_fk FOREIGN KEY (id_usuario_registra) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_atencion DROP CONSTRAINT IF EXISTS tb_compensacion_atencion_id_usuario_asesor_fkey;
ALTER TABLE public.tb_compensacion_atencion ADD CONSTRAINT tb_compensacion_atencion_id_usuario_asesor_fkey FOREIGN KEY (id_usuario_asesor) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_atencion DROP CONSTRAINT IF EXISTS tb_compensacion_atencion_id_usuario_libera_fkey;
ALTER TABLE public.tb_compensacion_atencion ADD CONSTRAINT tb_compensacion_atencion_id_usuario_libera_fkey FOREIGN KEY (id_usuario_libera) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_cargo DROP CONSTRAINT IF EXISTS tb_compensacion_cargo_estado_fk;
ALTER TABLE public.tb_compensacion_cargo ADD CONSTRAINT tb_compensacion_cargo_estado_fk FOREIGN KEY (id_estado) REFERENCES tb_estado(id);
ALTER TABLE public.tb_compensacion_cargo DROP CONSTRAINT IF EXISTS tb_compensacion_cargo_usuario_fk;
ALTER TABLE public.tb_compensacion_cargo ADD CONSTRAINT tb_compensacion_cargo_usuario_fk FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_chat_dni_mes DROP CONSTRAINT IF EXISTS tb_compensacion_chat_dni_mes_id_usuario_fkey;
ALTER TABLE public.tb_compensacion_chat_dni_mes ADD CONSTRAINT tb_compensacion_chat_dni_mes_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_colaborador DROP CONSTRAINT IF EXISTS tb_compensacion_colaborador_estado_fk;
ALTER TABLE public.tb_compensacion_colaborador ADD CONSTRAINT tb_compensacion_colaborador_estado_fk FOREIGN KEY (id_estado) REFERENCES tb_estado(id);
ALTER TABLE public.tb_compensacion_colaborador DROP CONSTRAINT IF EXISTS tb_compensacion_colaborador_usuario_fk;
ALTER TABLE public.tb_compensacion_colaborador ADD CONSTRAINT tb_compensacion_colaborador_usuario_fk FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_colaborador DROP CONSTRAINT IF EXISTS tb_compensacion_colaborador_usuario_registra_fk;
ALTER TABLE public.tb_compensacion_colaborador ADD CONSTRAINT tb_compensacion_colaborador_usuario_registra_fk FOREIGN KEY (id_usuario_registra) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_concepto DROP CONSTRAINT IF EXISTS tb_compensacion_concepto_estado_fk;
ALTER TABLE public.tb_compensacion_concepto ADD CONSTRAINT tb_compensacion_concepto_estado_fk FOREIGN KEY (id_estado) REFERENCES tb_estado(id);
ALTER TABLE public.tb_compensacion_concepto DROP CONSTRAINT IF EXISTS tb_compensacion_concepto_usuario_fk;
ALTER TABLE public.tb_compensacion_concepto ADD CONSTRAINT tb_compensacion_concepto_usuario_fk FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_mes_adjudicacion DROP CONSTRAINT IF EXISTS tb_compensacion_mes_adjudicacion_id_usuario_fkey;
ALTER TABLE public.tb_compensacion_mes_adjudicacion ADD CONSTRAINT tb_compensacion_mes_adjudicacion_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_pancake_mes DROP CONSTRAINT IF EXISTS tb_compensacion_pancake_mes_id_usuario_fkey;
ALTER TABLE public.tb_compensacion_pancake_mes ADD CONSTRAINT tb_compensacion_pancake_mes_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_periodo DROP CONSTRAINT IF EXISTS tb_compensacion_periodo_usuario_abre_fk;
ALTER TABLE public.tb_compensacion_periodo ADD CONSTRAINT tb_compensacion_periodo_usuario_abre_fk FOREIGN KEY (id_usuario_abre) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_periodo DROP CONSTRAINT IF EXISTS tb_compensacion_periodo_usuario_actualiza_fk;
ALTER TABLE public.tb_compensacion_periodo ADD CONSTRAINT tb_compensacion_periodo_usuario_actualiza_fk FOREIGN KEY (id_usuario_actualiza) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_plan DROP CONSTRAINT IF EXISTS tb_compensacion_plan_estado_fk;
ALTER TABLE public.tb_compensacion_plan ADD CONSTRAINT tb_compensacion_plan_estado_fk FOREIGN KEY (id_estado) REFERENCES tb_estado(id);
ALTER TABLE public.tb_compensacion_plan DROP CONSTRAINT IF EXISTS tb_compensacion_plan_usuario_fk;
ALTER TABLE public.tb_compensacion_plan ADD CONSTRAINT tb_compensacion_plan_usuario_fk FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_safetypay_registro DROP CONSTRAINT IF EXISTS tb_compensacion_safetypay_registro_id_usuario_fkey;
ALTER TABLE public.tb_compensacion_safetypay_registro ADD CONSTRAINT tb_compensacion_safetypay_registro_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_asignacion DROP CONSTRAINT IF EXISTS tb_compensacion_asignacion_cargo_fk;
ALTER TABLE public.tb_compensacion_asignacion ADD CONSTRAINT tb_compensacion_asignacion_cargo_fk FOREIGN KEY (id_cargo) REFERENCES tb_compensacion_cargo(id);
ALTER TABLE public.tb_compensacion_asignacion DROP CONSTRAINT IF EXISTS tb_compensacion_asignacion_colaborador_fk;
ALTER TABLE public.tb_compensacion_asignacion ADD CONSTRAINT tb_compensacion_asignacion_colaborador_fk FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_asignacion DROP CONSTRAINT IF EXISTS tb_compensacion_asignacion_estado_fk;
ALTER TABLE public.tb_compensacion_asignacion ADD CONSTRAINT tb_compensacion_asignacion_estado_fk FOREIGN KEY (id_estado) REFERENCES tb_estado(id);
ALTER TABLE public.tb_compensacion_asignacion DROP CONSTRAINT IF EXISTS tb_compensacion_asignacion_plan_fk;
ALTER TABLE public.tb_compensacion_asignacion ADD CONSTRAINT tb_compensacion_asignacion_plan_fk FOREIGN KEY (id_plan) REFERENCES tb_compensacion_plan(id);
ALTER TABLE public.tb_compensacion_asignacion DROP CONSTRAINT IF EXISTS tb_compensacion_asignacion_sucursal_fk;
ALTER TABLE public.tb_compensacion_asignacion ADD CONSTRAINT tb_compensacion_asignacion_sucursal_fk FOREIGN KEY (id_sucursal) REFERENCES tb_sucursal(id);
ALTER TABLE public.tb_compensacion_asignacion DROP CONSTRAINT IF EXISTS tb_compensacion_asignacion_usuario_fk;
ALTER TABLE public.tb_compensacion_asignacion ADD CONSTRAINT tb_compensacion_asignacion_usuario_fk FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_calidad_diaria DROP CONSTRAINT IF EXISTS tb_compensacion_calidad_diaria_id_colaborador_fkey;
ALTER TABLE public.tb_compensacion_calidad_diaria ADD CONSTRAINT tb_compensacion_calidad_diaria_id_colaborador_fkey FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_calidad_diaria DROP CONSTRAINT IF EXISTS tb_compensacion_calidad_diaria_id_sucursal_fkey;
ALTER TABLE public.tb_compensacion_calidad_diaria ADD CONSTRAINT tb_compensacion_calidad_diaria_id_sucursal_fkey FOREIGN KEY (id_sucursal) REFERENCES tb_sucursal(id);
ALTER TABLE public.tb_compensacion_calidad_diaria DROP CONSTRAINT IF EXISTS tb_compensacion_calidad_diaria_id_usuario_fkey;
ALTER TABLE public.tb_compensacion_calidad_diaria ADD CONSTRAINT tb_compensacion_calidad_diaria_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_calificacion_enlace DROP CONSTRAINT IF EXISTS tb_compensacion_calificacion_enlace_id_colaborador_fkey;
ALTER TABLE public.tb_compensacion_calificacion_enlace ADD CONSTRAINT tb_compensacion_calificacion_enlace_id_colaborador_fkey FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_calificacion_enlace DROP CONSTRAINT IF EXISTS tb_compensacion_calificacion_enlace_id_usuario_genera_fkey;
ALTER TABLE public.tb_compensacion_calificacion_enlace ADD CONSTRAINT tb_compensacion_calificacion_enlace_id_usuario_genera_fkey FOREIGN KEY (id_usuario_genera) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_captacion_nota DROP CONSTRAINT IF EXISTS tb_compensacion_captacion_nota_id_cliente_fkey;
ALTER TABLE public.tb_compensacion_captacion_nota ADD CONSTRAINT tb_compensacion_captacion_nota_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES tb_cliente(id);
ALTER TABLE public.tb_compensacion_captacion_nota DROP CONSTRAINT IF EXISTS tb_compensacion_captacion_nota_id_colaborador_fkey;
ALTER TABLE public.tb_compensacion_captacion_nota ADD CONSTRAINT tb_compensacion_captacion_nota_id_colaborador_fkey FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_captacion_nota DROP CONSTRAINT IF EXISTS tb_compensacion_captacion_nota_id_usuario_fkey;
ALTER TABLE public.tb_compensacion_captacion_nota ADD CONSTRAINT tb_compensacion_captacion_nota_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_captacion_revision DROP CONSTRAINT IF EXISTS tb_compensacion_captacion_revision_id_cliente_fkey;
ALTER TABLE public.tb_compensacion_captacion_revision ADD CONSTRAINT tb_compensacion_captacion_revision_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES tb_cliente(id);
ALTER TABLE public.tb_compensacion_captacion_revision DROP CONSTRAINT IF EXISTS tb_compensacion_captacion_revision_id_colaborador_fkey;
ALTER TABLE public.tb_compensacion_captacion_revision ADD CONSTRAINT tb_compensacion_captacion_revision_id_colaborador_fkey FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_captacion_revision DROP CONSTRAINT IF EXISTS tb_compensacion_captacion_revision_id_usuario_revisa_fkey;
ALTER TABLE public.tb_compensacion_captacion_revision ADD CONSTRAINT tb_compensacion_captacion_revision_id_usuario_revisa_fkey FOREIGN KEY (id_usuario_revisa) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_chat_dni DROP CONSTRAINT IF EXISTS tb_compensacion_chat_dni_id_cliente_fkey;
ALTER TABLE public.tb_compensacion_chat_dni ADD CONSTRAINT tb_compensacion_chat_dni_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES tb_cliente(id);
ALTER TABLE public.tb_compensacion_chat_dni DROP CONSTRAINT IF EXISTS tb_compensacion_chat_dni_id_colaborador_fkey;
ALTER TABLE public.tb_compensacion_chat_dni ADD CONSTRAINT tb_compensacion_chat_dni_id_colaborador_fkey FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_chat_dni DROP CONSTRAINT IF EXISTS tb_compensacion_chat_dni_id_usuario_anula_fkey;
ALTER TABLE public.tb_compensacion_chat_dni ADD CONSTRAINT tb_compensacion_chat_dni_id_usuario_anula_fkey FOREIGN KEY (id_usuario_anula) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_chat_dni DROP CONSTRAINT IF EXISTS tb_compensacion_chat_dni_id_usuario_fkey;
ALTER TABLE public.tb_compensacion_chat_dni ADD CONSTRAINT tb_compensacion_chat_dni_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_condicion_mes DROP CONSTRAINT IF EXISTS tb_compensacion_condicion_mes_colaborador_fk;
ALTER TABLE public.tb_compensacion_condicion_mes ADD CONSTRAINT tb_compensacion_condicion_mes_colaborador_fk FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_condicion_mes DROP CONSTRAINT IF EXISTS tb_compensacion_condicion_mes_periodo_fk;
ALTER TABLE public.tb_compensacion_condicion_mes ADD CONSTRAINT tb_compensacion_condicion_mes_periodo_fk FOREIGN KEY (id_periodo) REFERENCES tb_compensacion_periodo(id);
ALTER TABLE public.tb_compensacion_condicion_mes DROP CONSTRAINT IF EXISTS tb_compensacion_condicion_mes_registra_fk;
ALTER TABLE public.tb_compensacion_condicion_mes ADD CONSTRAINT tb_compensacion_condicion_mes_registra_fk FOREIGN KEY (id_usuario_registra) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_descuento_mes DROP CONSTRAINT IF EXISTS tb_compensacion_descuento_mes_anula_fk;
ALTER TABLE public.tb_compensacion_descuento_mes ADD CONSTRAINT tb_compensacion_descuento_mes_anula_fk FOREIGN KEY (id_usuario_anula) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_descuento_mes DROP CONSTRAINT IF EXISTS tb_compensacion_descuento_mes_colaborador_fk;
ALTER TABLE public.tb_compensacion_descuento_mes ADD CONSTRAINT tb_compensacion_descuento_mes_colaborador_fk FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_descuento_mes DROP CONSTRAINT IF EXISTS tb_compensacion_descuento_mes_concepto_fk;
ALTER TABLE public.tb_compensacion_descuento_mes ADD CONSTRAINT tb_compensacion_descuento_mes_concepto_fk FOREIGN KEY (id_concepto) REFERENCES tb_compensacion_concepto(id);
ALTER TABLE public.tb_compensacion_descuento_mes DROP CONSTRAINT IF EXISTS tb_compensacion_descuento_mes_periodo_fk;
ALTER TABLE public.tb_compensacion_descuento_mes ADD CONSTRAINT tb_compensacion_descuento_mes_periodo_fk FOREIGN KEY (id_periodo) REFERENCES tb_compensacion_periodo(id);
ALTER TABLE public.tb_compensacion_descuento_mes DROP CONSTRAINT IF EXISTS tb_compensacion_descuento_mes_registra_fk;
ALTER TABLE public.tb_compensacion_descuento_mes ADD CONSTRAINT tb_compensacion_descuento_mes_registra_fk FOREIGN KEY (id_usuario_registra) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_evento_tipo DROP CONSTRAINT IF EXISTS tb_compensacion_evento_tipo_concepto_fk;
ALTER TABLE public.tb_compensacion_evento_tipo ADD CONSTRAINT tb_compensacion_evento_tipo_concepto_fk FOREIGN KEY (id_concepto) REFERENCES tb_compensacion_concepto(id);
ALTER TABLE public.tb_compensacion_evento_tipo DROP CONSTRAINT IF EXISTS tb_compensacion_evento_tipo_estado_fk;
ALTER TABLE public.tb_compensacion_evento_tipo ADD CONSTRAINT tb_compensacion_evento_tipo_estado_fk FOREIGN KEY (id_estado) REFERENCES tb_estado(id);
ALTER TABLE public.tb_compensacion_evento_tipo DROP CONSTRAINT IF EXISTS tb_compensacion_evento_tipo_usuario_fk;
ALTER TABLE public.tb_compensacion_evento_tipo ADD CONSTRAINT tb_compensacion_evento_tipo_usuario_fk FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_excepcion DROP CONSTRAINT IF EXISTS tb_compensacion_excepcion_aprueba_fk;
ALTER TABLE public.tb_compensacion_excepcion ADD CONSTRAINT tb_compensacion_excepcion_aprueba_fk FOREIGN KEY (id_usuario_aprueba) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_excepcion DROP CONSTRAINT IF EXISTS tb_compensacion_excepcion_colaborador_fk;
ALTER TABLE public.tb_compensacion_excepcion ADD CONSTRAINT tb_compensacion_excepcion_colaborador_fk FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_excepcion DROP CONSTRAINT IF EXISTS tb_compensacion_excepcion_concepto_fk;
ALTER TABLE public.tb_compensacion_excepcion ADD CONSTRAINT tb_compensacion_excepcion_concepto_fk FOREIGN KEY (id_concepto) REFERENCES tb_compensacion_concepto(id);
ALTER TABLE public.tb_compensacion_excepcion DROP CONSTRAINT IF EXISTS tb_compensacion_excepcion_estado_fk;
ALTER TABLE public.tb_compensacion_excepcion ADD CONSTRAINT tb_compensacion_excepcion_estado_fk FOREIGN KEY (id_estado) REFERENCES tb_estado(id);
ALTER TABLE public.tb_compensacion_excepcion DROP CONSTRAINT IF EXISTS tb_compensacion_excepcion_usuario_fk;
ALTER TABLE public.tb_compensacion_excepcion ADD CONSTRAINT tb_compensacion_excepcion_usuario_fk FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_exportacion DROP CONSTRAINT IF EXISTS tb_compensacion_exportacion_periodo_fk;
ALTER TABLE public.tb_compensacion_exportacion ADD CONSTRAINT tb_compensacion_exportacion_periodo_fk FOREIGN KEY (id_periodo) REFERENCES tb_compensacion_periodo(id);
ALTER TABLE public.tb_compensacion_exportacion DROP CONSTRAINT IF EXISTS tb_compensacion_exportacion_usuario_anula_fk;
ALTER TABLE public.tb_compensacion_exportacion ADD CONSTRAINT tb_compensacion_exportacion_usuario_anula_fk FOREIGN KEY (id_usuario_anula) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_exportacion DROP CONSTRAINT IF EXISTS tb_compensacion_exportacion_usuario_fk;
ALTER TABLE public.tb_compensacion_exportacion ADD CONSTRAINT tb_compensacion_exportacion_usuario_fk FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_marketing_campana DROP CONSTRAINT IF EXISTS tb_compensacion_marketing_campana_id_colaborador_fkey;
ALTER TABLE public.tb_compensacion_marketing_campana ADD CONSTRAINT tb_compensacion_marketing_campana_id_colaborador_fkey FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_marketing_campana DROP CONSTRAINT IF EXISTS tb_compensacion_marketing_campana_id_usuario_fkey;
ALTER TABLE public.tb_compensacion_marketing_campana ADD CONSTRAINT tb_compensacion_marketing_campana_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_mes_premio DROP CONSTRAINT IF EXISTS tb_compensacion_mes_premio_id_adjudicacion_fkey;
ALTER TABLE public.tb_compensacion_mes_premio ADD CONSTRAINT tb_compensacion_mes_premio_id_adjudicacion_fkey FOREIGN KEY (id_adjudicacion) REFERENCES tb_compensacion_mes_adjudicacion(id);
ALTER TABLE public.tb_compensacion_mes_premio DROP CONSTRAINT IF EXISTS tb_compensacion_mes_premio_id_colaborador_fkey;
ALTER TABLE public.tb_compensacion_mes_premio ADD CONSTRAINT tb_compensacion_mes_premio_id_colaborador_fkey FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_pagos_entrega DROP CONSTRAINT IF EXISTS tb_compensacion_pagos_entrega_id_colaborador_fkey;
ALTER TABLE public.tb_compensacion_pagos_entrega ADD CONSTRAINT tb_compensacion_pagos_entrega_id_colaborador_fkey FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_pagos_entrega DROP CONSTRAINT IF EXISTS tb_compensacion_pagos_entrega_id_usuario_fkey;
ALTER TABLE public.tb_compensacion_pagos_entrega ADD CONSTRAINT tb_compensacion_pagos_entrega_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_pagos_entrega DROP CONSTRAINT IF EXISTS tb_compensacion_pagos_entrega_id_usuario_revisa_fkey;
ALTER TABLE public.tb_compensacion_pagos_entrega ADD CONSTRAINT tb_compensacion_pagos_entrega_id_usuario_revisa_fkey FOREIGN KEY (id_usuario_revisa) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_pancake_identidad DROP CONSTRAINT IF EXISTS tb_compensacion_pancake_identidad_id_colaborador_fkey;
ALTER TABLE public.tb_compensacion_pancake_identidad ADD CONSTRAINT tb_compensacion_pancake_identidad_id_colaborador_fkey FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_pancake_identidad DROP CONSTRAINT IF EXISTS tb_compensacion_pancake_identidad_periodo_fkey;
ALTER TABLE public.tb_compensacion_pancake_identidad ADD CONSTRAINT tb_compensacion_pancake_identidad_periodo_fkey FOREIGN KEY (periodo) REFERENCES tb_compensacion_pancake_mes(periodo);
ALTER TABLE public.tb_compensacion_pancake_importacion DROP CONSTRAINT IF EXISTS tb_compensacion_pancake_importacion_id_usuario_fkey;
ALTER TABLE public.tb_compensacion_pancake_importacion ADD CONSTRAINT tb_compensacion_pancake_importacion_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_pancake_importacion DROP CONSTRAINT IF EXISTS tb_compensacion_pancake_importacion_periodo_fkey;
ALTER TABLE public.tb_compensacion_pancake_importacion ADD CONSTRAINT tb_compensacion_pancake_importacion_periodo_fkey FOREIGN KEY (periodo) REFERENCES tb_compensacion_pancake_mes(periodo);
ALTER TABLE public.tb_compensacion_plan_version DROP CONSTRAINT IF EXISTS tb_compensacion_plan_version_plan_fk;
ALTER TABLE public.tb_compensacion_plan_version ADD CONSTRAINT tb_compensacion_plan_version_plan_fk FOREIGN KEY (id_plan) REFERENCES tb_compensacion_plan(id);
ALTER TABLE public.tb_compensacion_plan_version DROP CONSTRAINT IF EXISTS tb_compensacion_plan_version_publica_fk;
ALTER TABLE public.tb_compensacion_plan_version ADD CONSTRAINT tb_compensacion_plan_version_publica_fk FOREIGN KEY (id_usuario_publica) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_plan_version DROP CONSTRAINT IF EXISTS tb_compensacion_plan_version_usuario_fk;
ALTER TABLE public.tb_compensacion_plan_version ADD CONSTRAINT tb_compensacion_plan_version_usuario_fk FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_reporte_mes DROP CONSTRAINT IF EXISTS tb_compensacion_reporte_mes_confirma_fk;
ALTER TABLE public.tb_compensacion_reporte_mes ADD CONSTRAINT tb_compensacion_reporte_mes_confirma_fk FOREIGN KEY (confirmado_por) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_reporte_mes DROP CONSTRAINT IF EXISTS tb_compensacion_reporte_mes_periodo_fk;
ALTER TABLE public.tb_compensacion_reporte_mes ADD CONSTRAINT tb_compensacion_reporte_mes_periodo_fk FOREIGN KEY (id_periodo) REFERENCES tb_compensacion_periodo(id);
ALTER TABLE public.tb_compensacion_reporte_mes DROP CONSTRAINT IF EXISTS tb_compensacion_reporte_mes_reabre_fk;
ALTER TABLE public.tb_compensacion_reporte_mes ADD CONSTRAINT tb_compensacion_reporte_mes_reabre_fk FOREIGN KEY (reabierto_por) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_seguimiento_cola DROP CONSTRAINT IF EXISTS tb_compensacion_seguimiento_cola_id_colaborador_fkey;
ALTER TABLE public.tb_compensacion_seguimiento_cola ADD CONSTRAINT tb_compensacion_seguimiento_cola_id_colaborador_fkey FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_seguimiento_invalidacion DROP CONSTRAINT IF EXISTS tb_compensacion_seguimiento_invalidacion_id_colaborador_fkey;
ALTER TABLE public.tb_compensacion_seguimiento_invalidacion ADD CONSTRAINT tb_compensacion_seguimiento_invalidacion_id_colaborador_fkey FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_seguimiento_resultado DROP CONSTRAINT IF EXISTS tb_compensacion_seguimiento_resultado_id_colaborador_fkey;
ALTER TABLE public.tb_compensacion_seguimiento_resultado ADD CONSTRAINT tb_compensacion_seguimiento_resultado_id_colaborador_fkey FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_configuracion_efectiva DROP CONSTRAINT IF EXISTS tb_compensacion_configuracion_efect_id_plan_version_origen_fkey;
ALTER TABLE public.tb_compensacion_configuracion_efectiva ADD CONSTRAINT tb_compensacion_configuracion_efect_id_plan_version_origen_fkey FOREIGN KEY (id_plan_version_origen) REFERENCES tb_compensacion_plan_version(id);
ALTER TABLE public.tb_compensacion_configuracion_efectiva DROP CONSTRAINT IF EXISTS tb_compensacion_configuracion_efectiva_id_plan_fkey;
ALTER TABLE public.tb_compensacion_configuracion_efectiva ADD CONSTRAINT tb_compensacion_configuracion_efectiva_id_plan_fkey FOREIGN KEY (id_plan) REFERENCES tb_compensacion_plan(id);
ALTER TABLE public.tb_compensacion_configuracion_efectiva DROP CONSTRAINT IF EXISTS tb_compensacion_configuracion_efectiva_id_usuario_fkey;
ALTER TABLE public.tb_compensacion_configuracion_efectiva ADD CONSTRAINT tb_compensacion_configuracion_efectiva_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_meta_sede DROP CONSTRAINT IF EXISTS tb_compensacion_meta_sede_estado_fk;
ALTER TABLE public.tb_compensacion_meta_sede ADD CONSTRAINT tb_compensacion_meta_sede_estado_fk FOREIGN KEY (id_estado) REFERENCES tb_estado(id);
ALTER TABLE public.tb_compensacion_meta_sede DROP CONSTRAINT IF EXISTS tb_compensacion_meta_sede_plan_version_fk;
ALTER TABLE public.tb_compensacion_meta_sede ADD CONSTRAINT tb_compensacion_meta_sede_plan_version_fk FOREIGN KEY (id_plan_version) REFERENCES tb_compensacion_plan_version(id);
ALTER TABLE public.tb_compensacion_meta_sede DROP CONSTRAINT IF EXISTS tb_compensacion_meta_sede_sucursal_fk;
ALTER TABLE public.tb_compensacion_meta_sede ADD CONSTRAINT tb_compensacion_meta_sede_sucursal_fk FOREIGN KEY (id_sucursal) REFERENCES tb_sucursal(id);
ALTER TABLE public.tb_compensacion_meta_sede DROP CONSTRAINT IF EXISTS tb_compensacion_meta_sede_usuario_fk;
ALTER TABLE public.tb_compensacion_meta_sede ADD CONSTRAINT tb_compensacion_meta_sede_usuario_fk FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_pancake_conversacion DROP CONSTRAINT IF EXISTS tb_compensacion_pancake_conversacion_id_colaborador_fkey;
ALTER TABLE public.tb_compensacion_pancake_conversacion ADD CONSTRAINT tb_compensacion_pancake_conversacion_id_colaborador_fkey FOREIGN KEY (id_colaborador) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_pancake_conversacion DROP CONSTRAINT IF EXISTS tb_compensacion_pancake_conversacion_id_importacion_fkey;
ALTER TABLE public.tb_compensacion_pancake_conversacion ADD CONSTRAINT tb_compensacion_pancake_conversacion_id_importacion_fkey FOREIGN KEY (id_importacion) REFERENCES tb_compensacion_pancake_importacion(id);
ALTER TABLE public.tb_compensacion_pancake_conversacion DROP CONSTRAINT IF EXISTS tb_compensacion_pancake_conversacion_periodo_fkey;
ALTER TABLE public.tb_compensacion_pancake_conversacion ADD CONSTRAINT tb_compensacion_pancake_conversacion_periodo_fkey FOREIGN KEY (periodo) REFERENCES tb_compensacion_pancake_mes(periodo);
ALTER TABLE public.tb_compensacion_penalidad_tipo DROP CONSTRAINT IF EXISTS tb_compensacion_penalidad_tipo_bono_fk;
ALTER TABLE public.tb_compensacion_penalidad_tipo ADD CONSTRAINT tb_compensacion_penalidad_tipo_bono_fk FOREIGN KEY (id_concepto_bono_reportante) REFERENCES tb_compensacion_concepto(id);
ALTER TABLE public.tb_compensacion_penalidad_tipo DROP CONSTRAINT IF EXISTS tb_compensacion_penalidad_tipo_cargo_fk;
ALTER TABLE public.tb_compensacion_penalidad_tipo ADD CONSTRAINT tb_compensacion_penalidad_tipo_cargo_fk FOREIGN KEY (id_cargo) REFERENCES tb_compensacion_cargo(id);
ALTER TABLE public.tb_compensacion_penalidad_tipo DROP CONSTRAINT IF EXISTS tb_compensacion_penalidad_tipo_descuento_fk;
ALTER TABLE public.tb_compensacion_penalidad_tipo ADD CONSTRAINT tb_compensacion_penalidad_tipo_descuento_fk FOREIGN KEY (id_concepto_descuento) REFERENCES tb_compensacion_concepto(id);
ALTER TABLE public.tb_compensacion_penalidad_tipo DROP CONSTRAINT IF EXISTS tb_compensacion_penalidad_tipo_estado_fk;
ALTER TABLE public.tb_compensacion_penalidad_tipo ADD CONSTRAINT tb_compensacion_penalidad_tipo_estado_fk FOREIGN KEY (id_estado) REFERENCES tb_estado(id);
ALTER TABLE public.tb_compensacion_penalidad_tipo DROP CONSTRAINT IF EXISTS tb_compensacion_penalidad_tipo_plan_version_fk;
ALTER TABLE public.tb_compensacion_penalidad_tipo ADD CONSTRAINT tb_compensacion_penalidad_tipo_plan_version_fk FOREIGN KEY (id_plan_version) REFERENCES tb_compensacion_plan_version(id);
ALTER TABLE public.tb_compensacion_penalidad_tipo DROP CONSTRAINT IF EXISTS tb_compensacion_penalidad_tipo_usuario_fk;
ALTER TABLE public.tb_compensacion_penalidad_tipo ADD CONSTRAINT tb_compensacion_penalidad_tipo_usuario_fk FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_regla DROP CONSTRAINT IF EXISTS tb_compensacion_regla_cargo_fk;
ALTER TABLE public.tb_compensacion_regla ADD CONSTRAINT tb_compensacion_regla_cargo_fk FOREIGN KEY (id_cargo) REFERENCES tb_compensacion_cargo(id);
ALTER TABLE public.tb_compensacion_regla DROP CONSTRAINT IF EXISTS tb_compensacion_regla_concepto_fk;
ALTER TABLE public.tb_compensacion_regla ADD CONSTRAINT tb_compensacion_regla_concepto_fk FOREIGN KEY (id_concepto) REFERENCES tb_compensacion_concepto(id);
ALTER TABLE public.tb_compensacion_regla DROP CONSTRAINT IF EXISTS tb_compensacion_regla_estado_fk;
ALTER TABLE public.tb_compensacion_regla ADD CONSTRAINT tb_compensacion_regla_estado_fk FOREIGN KEY (id_estado) REFERENCES tb_estado(id);
ALTER TABLE public.tb_compensacion_regla DROP CONSTRAINT IF EXISTS tb_compensacion_regla_plan_version_fk;
ALTER TABLE public.tb_compensacion_regla ADD CONSTRAINT tb_compensacion_regla_plan_version_fk FOREIGN KEY (id_plan_version) REFERENCES tb_compensacion_plan_version(id);
ALTER TABLE public.tb_compensacion_regla DROP CONSTRAINT IF EXISTS tb_compensacion_regla_sucursal_fk;
ALTER TABLE public.tb_compensacion_regla ADD CONSTRAINT tb_compensacion_regla_sucursal_fk FOREIGN KEY (id_sucursal) REFERENCES tb_sucursal(id);
ALTER TABLE public.tb_compensacion_regla DROP CONSTRAINT IF EXISTS tb_compensacion_regla_usuario_fk;
ALTER TABLE public.tb_compensacion_regla ADD CONSTRAINT tb_compensacion_regla_usuario_fk FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_evento DROP CONSTRAINT IF EXISTS tb_compensacion_evento_beneficiario_fk;
ALTER TABLE public.tb_compensacion_evento ADD CONSTRAINT tb_compensacion_evento_beneficiario_fk FOREIGN KEY (id_colaborador_beneficiario) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_evento DROP CONSTRAINT IF EXISTS tb_compensacion_evento_penalidad_tipo_fk;
ALTER TABLE public.tb_compensacion_evento ADD CONSTRAINT tb_compensacion_evento_penalidad_tipo_fk FOREIGN KEY (id_penalidad_tipo) REFERENCES tb_compensacion_penalidad_tipo(id);
ALTER TABLE public.tb_compensacion_evento DROP CONSTRAINT IF EXISTS tb_compensacion_evento_regla_fk;
ALTER TABLE public.tb_compensacion_evento ADD CONSTRAINT tb_compensacion_evento_regla_fk FOREIGN KEY (id_regla_aplicada) REFERENCES tb_compensacion_regla(id);
ALTER TABLE public.tb_compensacion_evento DROP CONSTRAINT IF EXISTS tb_compensacion_evento_responsable_fk;
ALTER TABLE public.tb_compensacion_evento ADD CONSTRAINT tb_compensacion_evento_responsable_fk FOREIGN KEY (id_colaborador_responsable) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_evento DROP CONSTRAINT IF EXISTS tb_compensacion_evento_sucursal_origen_fk;
ALTER TABLE public.tb_compensacion_evento ADD CONSTRAINT tb_compensacion_evento_sucursal_origen_fk FOREIGN KEY (id_sucursal_origen) REFERENCES tb_sucursal(id);
ALTER TABLE public.tb_compensacion_evento DROP CONSTRAINT IF EXISTS tb_compensacion_evento_sucursal_responsable_fk;
ALTER TABLE public.tb_compensacion_evento ADD CONSTRAINT tb_compensacion_evento_sucursal_responsable_fk FOREIGN KEY (id_sucursal_responsable) REFERENCES tb_sucursal(id);
ALTER TABLE public.tb_compensacion_evento DROP CONSTRAINT IF EXISTS tb_compensacion_evento_tipo_fk;
ALTER TABLE public.tb_compensacion_evento ADD CONSTRAINT tb_compensacion_evento_tipo_fk FOREIGN KEY (id_tipo_evento) REFERENCES tb_compensacion_evento_tipo(id);
ALTER TABLE public.tb_compensacion_evento DROP CONSTRAINT IF EXISTS tb_compensacion_evento_usuario_fk;
ALTER TABLE public.tb_compensacion_evento ADD CONSTRAINT tb_compensacion_evento_usuario_fk FOREIGN KEY (id_usuario_registra) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_calificacion_envio DROP CONSTRAINT IF EXISTS tb_compensacion_calificacion_envio_id_enlace_fkey;
ALTER TABLE public.tb_compensacion_calificacion_envio ADD CONSTRAINT tb_compensacion_calificacion_envio_id_enlace_fkey FOREIGN KEY (id_enlace) REFERENCES tb_compensacion_calificacion_enlace(id);
ALTER TABLE public.tb_compensacion_calificacion_envio DROP CONSTRAINT IF EXISTS tb_compensacion_calificacion_envio_id_evento_fkey;
ALTER TABLE public.tb_compensacion_calificacion_envio ADD CONSTRAINT tb_compensacion_calificacion_envio_id_evento_fkey FOREIGN KEY (id_evento) REFERENCES tb_compensacion_evento(id);
ALTER TABLE public.tb_compensacion_caza_errores_vinculo DROP CONSTRAINT IF EXISTS tb_compensacion_caza_errores_vincul_id_evento_consecuencia_fkey;
ALTER TABLE public.tb_compensacion_caza_errores_vinculo ADD CONSTRAINT tb_compensacion_caza_errores_vincul_id_evento_consecuencia_fkey FOREIGN KEY (id_evento_consecuencia) REFERENCES tb_compensacion_evento(id);
ALTER TABLE public.tb_compensacion_caza_errores_vinculo DROP CONSTRAINT IF EXISTS tb_compensacion_caza_errores_vinculo_id_evento_origen_fkey;
ALTER TABLE public.tb_compensacion_caza_errores_vinculo ADD CONSTRAINT tb_compensacion_caza_errores_vinculo_id_evento_origen_fkey FOREIGN KEY (id_evento_origen) REFERENCES tb_compensacion_evento(id);
ALTER TABLE public.tb_compensacion_caza_errores_vinculo DROP CONSTRAINT IF EXISTS tb_compensacion_caza_errores_vinculo_id_usuario_registra_fkey;
ALTER TABLE public.tb_compensacion_caza_errores_vinculo ADD CONSTRAINT tb_compensacion_caza_errores_vinculo_id_usuario_registra_fkey FOREIGN KEY (id_usuario_registra) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_evento_referencia DROP CONSTRAINT IF EXISTS tb_compensacion_evento_referencia_cliente_fk;
ALTER TABLE public.tb_compensacion_evento_referencia ADD CONSTRAINT tb_compensacion_evento_referencia_cliente_fk FOREIGN KEY (id_cliente) REFERENCES tb_cliente(id);
ALTER TABLE public.tb_compensacion_evento_referencia DROP CONSTRAINT IF EXISTS tb_compensacion_evento_referencia_evento_fk;
ALTER TABLE public.tb_compensacion_evento_referencia ADD CONSTRAINT tb_compensacion_evento_referencia_evento_fk FOREIGN KEY (id_evento) REFERENCES tb_compensacion_evento(id);
ALTER TABLE public.tb_compensacion_evento_referencia DROP CONSTRAINT IF EXISTS tb_compensacion_evento_referencia_usuario_fk;
ALTER TABLE public.tb_compensacion_evento_referencia ADD CONSTRAINT tb_compensacion_evento_referencia_usuario_fk FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_evento_revision DROP CONSTRAINT IF EXISTS tb_compensacion_evento_revision_evento_fk;
ALTER TABLE public.tb_compensacion_evento_revision ADD CONSTRAINT tb_compensacion_evento_revision_evento_fk FOREIGN KEY (id_evento) REFERENCES tb_compensacion_evento(id);
ALTER TABLE public.tb_compensacion_evento_revision DROP CONSTRAINT IF EXISTS tb_compensacion_evento_revision_usuario_fk;
ALTER TABLE public.tb_compensacion_evento_revision ADD CONSTRAINT tb_compensacion_evento_revision_usuario_fk FOREIGN KEY (id_usuario_revisor) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_hallazgo_correccion DROP CONSTRAINT IF EXISTS tb_compensacion_hallazgo_correccion_id_colaborador_corrige_fkey;
ALTER TABLE public.tb_compensacion_hallazgo_correccion ADD CONSTRAINT tb_compensacion_hallazgo_correccion_id_colaborador_corrige_fkey FOREIGN KEY (id_colaborador_corrige) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_hallazgo_correccion DROP CONSTRAINT IF EXISTS tb_compensacion_hallazgo_correccion_id_evento_fkey;
ALTER TABLE public.tb_compensacion_hallazgo_correccion ADD CONSTRAINT tb_compensacion_hallazgo_correccion_id_evento_fkey FOREIGN KEY (id_evento) REFERENCES tb_compensacion_evento(id);
ALTER TABLE public.tb_compensacion_hallazgo_correccion DROP CONSTRAINT IF EXISTS tb_compensacion_hallazgo_correccion_id_usuario_fkey;
ALTER TABLE public.tb_compensacion_hallazgo_correccion ADD CONSTRAINT tb_compensacion_hallazgo_correccion_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_referido DROP CONSTRAINT IF EXISTS tb_compensacion_referido_cliente_fk;
ALTER TABLE public.tb_compensacion_referido ADD CONSTRAINT tb_compensacion_referido_cliente_fk FOREIGN KEY (id_cliente) REFERENCES tb_cliente(id);
ALTER TABLE public.tb_compensacion_referido DROP CONSTRAINT IF EXISTS tb_compensacion_referido_colaborador_fk;
ALTER TABLE public.tb_compensacion_referido ADD CONSTRAINT tb_compensacion_referido_colaborador_fk FOREIGN KEY (id_colaborador_referente) REFERENCES tb_compensacion_colaborador(id);
ALTER TABLE public.tb_compensacion_referido DROP CONSTRAINT IF EXISTS tb_compensacion_referido_evento_fk;
ALTER TABLE public.tb_compensacion_referido ADD CONSTRAINT tb_compensacion_referido_evento_fk FOREIGN KEY (id_evento) REFERENCES tb_compensacion_evento(id);
ALTER TABLE public.tb_compensacion_referido DROP CONSTRAINT IF EXISTS tb_compensacion_referido_usuario_fk;
ALTER TABLE public.tb_compensacion_referido ADD CONSTRAINT tb_compensacion_referido_usuario_fk FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);
ALTER TABLE public.tb_compensacion_referido_operacion DROP CONSTRAINT IF EXISTS tb_compensacion_referido_operacion_id_evento_fkey;
ALTER TABLE public.tb_compensacion_referido_operacion ADD CONSTRAINT tb_compensacion_referido_operacion_id_evento_fkey FOREIGN KEY (id_evento) REFERENCES tb_compensacion_evento(id);
ALTER TABLE public.tb_compensacion_referido_operacion DROP CONSTRAINT IF EXISTS tb_compensacion_referido_operacion_referido_fk;
ALTER TABLE public.tb_compensacion_referido_operacion ADD CONSTRAINT tb_compensacion_referido_operacion_referido_fk FOREIGN KEY (id_referido) REFERENCES tb_compensacion_referido(id);
ALTER TABLE public.tb_compensacion_referido_operacion DROP CONSTRAINT IF EXISTS tb_compensacion_referido_operacion_usuario_fk;
ALTER TABLE public.tb_compensacion_referido_operacion ADD CONSTRAINT tb_compensacion_referido_operacion_usuario_fk FOREIGN KEY (id_usuario) REFERENCES tb_usuario(id);

-- Índices.
CREATE INDEX IF NOT EXISTS idx_compensacion_acceso_usuario_estado ON public.tb_compensacion_acceso USING btree (id_usuario, id_estado);
CREATE UNIQUE INDEX IF NOT EXISTS uq_compensacion_atencion_operacion_vigente ON public.tb_compensacion_atencion USING btree (id_operacion_raiz) WHERE (estado = 'VIGENTE'::text);
CREATE INDEX IF NOT EXISTS idx_cliente_nuevo_baja_cliente ON public.tb_compensacion_cliente_nuevo_baja USING btree (id_cliente);
CREATE INDEX IF NOT EXISTS idx_compensacion_colaborador_nombre ON public.tb_compensacion_colaborador USING btree (nombre_completo);
CREATE INDEX IF NOT EXISTS idx_compensacion_periodo_estado ON public.tb_compensacion_periodo USING btree (estado_periodo, periodo);
CREATE INDEX IF NOT EXISTS ix_compensacion_safetypay_registro_cruce ON public.tb_compensacion_safetypay_registro USING btree (codigo_cliente, monto) WHERE (estado <> 'PAGADO'::text);
CREATE INDEX IF NOT EXISTS ix_compensacion_safetypay_registro_usuario ON public.tb_compensacion_safetypay_registro USING btree (id_usuario, fecha_deposito);
CREATE UNIQUE INDEX IF NOT EXISTS uq_compensacion_safetypay_registro_operacion ON public.tb_compensacion_safetypay_registro USING btree (id_operacion_proceso) WHERE (id_operacion_proceso IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_compensacion_asignacion_colaborador_vigencia ON public.tb_compensacion_asignacion USING btree (id_colaborador, fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_compensacion_asignacion_sucursal ON public.tb_compensacion_asignacion USING btree (id_sucursal, id_cargo);
CREATE UNIQUE INDEX IF NOT EXISTS ux_calificacion_enlace_activo ON public.tb_compensacion_calificacion_enlace USING btree (id_colaborador) WHERE (fecha_revocacion IS NULL);
CREATE INDEX IF NOT EXISTS idx_captacion_nota_cliente ON public.tb_compensacion_captacion_nota USING btree (id_cliente, id_colaborador, id DESC);
CREATE INDEX IF NOT EXISTS idx_captacion_revision_concepto ON public.tb_compensacion_captacion_revision USING btree (id_cliente, id_colaborador, concepto_codigo, id DESC);
CREATE INDEX IF NOT EXISTS idx_captacion_revision_fuente ON public.tb_compensacion_captacion_revision USING btree (id_cliente, id_colaborador, id DESC);
CREATE INDEX IF NOT EXISTS ix_compensacion_chat_dni_colaborador ON public.tb_compensacion_chat_dni USING btree (periodo, id_colaborador) WHERE (estado = 'ACTIVO'::text);
CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_chat_dni_activo ON public.tb_compensacion_chat_dni USING btree (periodo, documento) WHERE (estado = 'ACTIVO'::text);
CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_chat_dni_clave ON public.tb_compensacion_chat_dni USING btree (id_usuario, clave);
CREATE INDEX IF NOT EXISTS idx_compensacion_descuento_mes_periodo ON public.tb_compensacion_descuento_mes USING btree (id_periodo, id_colaborador, estado);
CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_descuento_mes_activo ON public.tb_compensacion_descuento_mes USING btree (id_periodo, id_colaborador, tipo_origen) WHERE ((estado)::text = 'ACTIVO'::text);
CREATE INDEX IF NOT EXISTS idx_compensacion_excepcion_vigencia ON public.tb_compensacion_excepcion USING btree (id_colaborador, id_concepto, fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_compensacion_exportacion_periodo ON public.tb_compensacion_exportacion USING btree (id_periodo, tipo_reporte, fecha_registro);
CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_exportacion_idempotencia ON public.tb_compensacion_exportacion USING btree (id_usuario, id_periodo, tipo_reporte, formato, clave_idempotencia) WHERE (clave_idempotencia IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_compensacion_plan_version_vigencia ON public.tb_compensacion_plan_version USING btree (id_plan, fecha_inicio, fecha_fin);
CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_plan_version_publicada_inicio ON public.tb_compensacion_plan_version USING btree (id_plan, fecha_inicio) WHERE ((estado_version)::text = 'PUBLICADA'::text);
CREATE INDEX IF NOT EXISTS idx_compensacion_seguimiento_pendiente ON public.tb_compensacion_seguimiento_cola USING btree (disponible_desde, periodo, id_colaborador) WHERE (revision > revision_procesada);
CREATE INDEX IF NOT EXISTS idx_compensacion_seguimiento_invalidacion_pendiente ON public.tb_compensacion_seguimiento_invalidacion USING btree (periodo, id_colaborador, id) WHERE (NOT procesada);
CREATE INDEX IF NOT EXISTS tb_compensacion_configuracion_efectiva_plan_fecha_idx ON public.tb_compensacion_configuracion_efectiva USING btree (id_plan, fecha_desde DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_compensacion_meta_sede_periodo ON public.tb_compensacion_meta_sede USING btree (periodo, id_sucursal);
CREATE INDEX IF NOT EXISTS idx_pancake_conversacion_mes ON public.tb_compensacion_pancake_conversacion USING btree (periodo, id_colaborador);
CREATE INDEX IF NOT EXISTS idx_compensacion_regla_concepto ON public.tb_compensacion_regla USING btree (id_concepto, id_estado);
CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_regla_aplicacion ON public.tb_compensacion_regla USING btree (id_plan_version, id_concepto, COALESCE(id_cargo, (0)::bigint), COALESCE(id_sucursal, (0)::bigint), prioridad);
CREATE INDEX IF NOT EXISTS idx_compensacion_evento_bandeja ON public.tb_compensacion_evento USING btree (id_tipo_evento, estado_evento, periodo_imputacion);
CREATE INDEX IF NOT EXISTS idx_compensacion_evento_beneficiario ON public.tb_compensacion_evento USING btree (id_colaborador_beneficiario, fecha_evento, estado_evento);
CREATE INDEX IF NOT EXISTS idx_compensacion_evento_responsable ON public.tb_compensacion_evento USING btree (id_colaborador_responsable, fecha_evento, estado_evento);
CREATE UNIQUE INDEX IF NOT EXISTS idx_compensacion_mes_premio_79 ON public.tb_compensacion_evento USING btree (clave_origen) WHERE ((clave_origen)::text ~~ 'COLABORADOR_MES_79:%'::text);
CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_evento_clave_origen ON public.tb_compensacion_evento USING btree (fuente, clave_origen) WHERE (clave_origen IS NOT NULL);
CREATE INDEX IF NOT EXISTS ix_calificacion_envio_fecha ON public.tb_compensacion_calificacion_envio USING btree (id_enlace, fecha_registro);
CREATE INDEX IF NOT EXISTS idx_compensacion_caza_errores_origen ON public.tb_compensacion_caza_errores_vinculo USING btree (id_evento_origen, tipo_consecuencia);
CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_evento_ref_cliente ON public.tb_compensacion_evento_referencia USING btree (id_evento, id_cliente) WHERE (id_cliente IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_evento_ref_externa ON public.tb_compensacion_evento_referencia USING btree (id_evento, tipo_referencia, identificador_externo) WHERE (identificador_externo IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_compensacion_evento_ref_operacion ON public.tb_compensacion_evento_referencia USING btree (id_evento, id_operacion) WHERE (id_operacion IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_compensacion_evento_revision_evento ON public.tb_compensacion_evento_revision USING btree (id_evento, fecha_revision);
CREATE INDEX IF NOT EXISTS idx_compensacion_referido_operacion_referido ON public.tb_compensacion_referido_operacion USING btree (id_referido, es_elegible);
CREATE UNIQUE INDEX IF NOT EXISTS uq_compensacion_referido_operacion_evento ON public.tb_compensacion_referido_operacion USING btree (id_evento) WHERE (id_evento IS NOT NULL);

-- Seguridad de filas.
ALTER TABLE public.tb_compensacion_acceso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_acceso_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_asignacion_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_atencion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_cargo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_cargo_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_chat_dni_mes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_cliente_nuevo_baja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_colaborador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_colaborador_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_concepto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_concepto_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_condicion_mes_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_descuento_mes_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_evento_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_evento_tipo_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_excepcion_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_mes_adjudicacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_meta_sede_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_pancake_mes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_penalidad_tipo_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_periodo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_periodo_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_plan_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_plan_version_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_referido_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_regla_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_reporte_mes_his ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_safetypay_registro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_seguimiento_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_asignacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_calidad_diaria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_calificacion_enlace ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_captacion_nota ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_captacion_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_chat_dni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_condicion_mes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_descuento_mes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_evento_tipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_excepcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_exportacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_marketing_campana ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_mes_premio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_pagos_entrega ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_pancake_identidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_pancake_importacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_plan_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_reporte_mes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_seguimiento_cola ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_seguimiento_invalidacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_seguimiento_resultado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_configuracion_efectiva ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_meta_sede ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_pancake_conversacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_penalidad_tipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_regla ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_evento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_calificacion_envio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_caza_errores_vinculo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_evento_referencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_evento_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_hallazgo_correccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_referido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_compensacion_referido_operacion ENABLE ROW LEVEL SECURITY;

-- Comentarios.

NOTIFY pgrst, 'reload schema';
COMMIT;
