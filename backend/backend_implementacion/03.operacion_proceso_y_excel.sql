-- ============================================================================
-- 12. TB_OPERACION_CARGA_EXCEL
-- ============================================================================

/*
Tabla: tb_operacion_carga_excel
Objetivo:
  Agrupar las operaciones creadas por una misma carga Excel para permitir un
  rollback completo cuando el usuario cargo el archivo en la empresa equivocada.

Regla:
  - el lote solo se conserva si al menos una fila fue procesada;
  - no se usa como auditoria historica permanente: puede borrarse junto con
    sus operaciones y movimientos cuando el rollback esta permitido.
*/
CREATE TABLE IF NOT EXISTS public.tb_operacion_carga_excel (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre_archivo character varying,
  ruta character varying,
  id_empresa_ingreso bigint,
  nombre_empresa_ingreso character varying,
  id_empresa_cuenta_ingreso bigint,
  id_banco bigint,
  nombre_banco character varying,
  filas_procesadas integer NOT NULL DEFAULT 0,
  filas_omitidas integer NOT NULL DEFAULT 0,
  filas_error integer NOT NULL DEFAULT 0,
  id_usuario bigint,
  nombre_usuario character varying,
  fecha_carga timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_operacion_carga_excel_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- 13. TB_OPERACION_PROCESO
-- ============================================================================

/*
Tabla: tb_operacion_proceso
Objetivo:
  Registrar la operacion comercial congelando los datos funcionales,
  comerciales y monetarios realmente aplicados al momento del registro.

Justificacion del modelo en la etapa compacta:
  - conserva ids tecnicos necesarios para trazabilidad
  - conserva nombres materializados para auditoria historica
  - conserva reglas y resultados congelados para evitar que cambios futuros
    en catalogos o comisiones alteren la lectura historica
  - delega el impacto financiero de caja a `05.ruta_operacion_y_cajas.sql`
  - `tipo_servicio` es el unico clasificador de familia comercial y se deriva
    desde `tb_codigo_servicio.tipo`
  - `id_usuario` representa al usuario que registra la operacion
  - `id_usuario_gestor` representa al responsable operativo actual
  - `id_usuario_reasignado` representa el ultimo destino de reasignacion
  - `id_usuario_solicitud` representa el origen de la solicitud
  - derivados, reasignaciones y retenciones viven como metadata operativa de la
    misma fila, sin bifurcar la operacion en tablas adicionales

Nota de compactacion:
  Aunque existen campos que en el futuro podrian reagruparse o compactarse
  mas aun, en esta etapa se mantiene el detalle que hoy utiliza el frontend
  de Operaciones para:
    1. registro manual
    2. carga Excel
    3. autoguardado inline
    4. auditoria visual de comisiones

Alcance de esta fase:
  - cerrar solo la capa operativa/comercial
  - persistir el movimiento de caja mediante la funcion puente del core de cajas
  - permitir pruebas completas de efectivizacion, pago deuda, derivados,
    reasignados y retenidos sobre una sola fila snapshot
*/
CREATE TABLE IF NOT EXISTS public.tb_operacion_proceso (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_codigo_servicio bigint,
  nombre_codigo_servicio character varying,
  tipo_servicio character varying,
  id_comunidad bigint,
  nombre_comunidad character varying,
  nombre_tipo_deposito character varying,
  id_cliente bigint,
  dni_cliente character varying,
  nombre_cliente character varying,
  email_cliente character varying,
  id_banco_cliente bigint,
  nombre_banco_cliente character varying,
  monto_deposito_cliente numeric,
  codigo_operacion_deposito_cliente character varying,
  fecha_deposito_cliente timestamp with time zone,
  id_empresa_ingreso bigint,
  nombre_empresa_ingreso character varying,
  id_empresa_cuenta_ingreso bigint,
  id_banco_empresa_cuenta_ingreso bigint,
  nombre_banco_empresa_cuenta_ingreso character varying,
  flag_por_sol_comision_banco_ingreso boolean,
  comision_banco_ingreso numeric,
  comision_minimo_banco_ingreso numeric,
  comision_igv_banco_ingreso numeric,
  resultado_comision_banco_ingreso numeric,
  monto_itf_ingreso numeric,
  comision_servicio numeric,
  monto_minimo_deposito_servicio numeric,
  comision_minima_servicio numeric,
  comision_monto_extra_servicio numeric,
  resultado_comision_servicio numeric,
  id_empresa_salida bigint,
  nombre_empresa_salida character varying,
  id_empresa_cuenta_salida bigint,
  id_banco_empresa_cuenta_salida bigint,
  nombre_banco_empresa_cuenta_salida character varying,
  id_empresa_salida_origen bigint,
  nombre_empresa_salida_origen character varying,
  id_empresa_cuenta_salida_origen bigint,
  id_banco_empresa_cuenta_salida_origen bigint,
  nombre_banco_empresa_cuenta_salida_origen character varying,
  comision_transf_banco_salida numeric,
  comision_transf_inter_banco_salida numeric,
  resultado_comision_banco_salida numeric,
  monto_transferencia_cliente numeric,
  monto_itf_salida numeric,
  id_banco_cliente_transferencia bigint,
  nombre_banco_cliente_transferencia character varying,
  id_estado bigint,
  nombre_estado character varying,
  id_usuario bigint,
  nombre_usuario character varying,
  id_usuario_gestor bigint,
  nombre_usuario_gestor character varying,
  id_usuario_reasignado bigint,
  nombre_usuario_reasignado character varying,
  id_usuario_solicitud bigint,
  nombre_usuario_solicitud character varying,
  id_operacion_padre bigint,
  id_operacion_match bigint,
  tipo_flujo_pago_deuda character varying,
  ruta_origen character varying,
  ruta_destino character varying,
  flag_derivado boolean NOT NULL DEFAULT false,
  fecha_derivacion timestamp with time zone,
  id_usuario_deriva bigint,
  nombre_usuario_deriva character varying,
  flag_retenido boolean NOT NULL DEFAULT false,
  fecha_retencion timestamp with time zone,
  id_usuario_retiene bigint,
  nombre_usuario_retiene character varying,
  motivo_retencion text,
  fecha_pendiente timestamp with time zone,
  fecha_pagado timestamp with time zone,
  error_motivo character varying,
  observacion_tiempo text,
  tipo_facturacion character varying DEFAULT 'Boleta',
  tipo_recaudacion_sf character varying,
  id_carga_excel bigint,
  nombre_carga_excel character varying,
  fecha_carga_excel timestamp with time zone,
  id_caja_cierre bigint,
  fecha_caja_cierre timestamp with time zone,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_operacion_proceso_pkey PRIMARY KEY (id),
  CONSTRAINT tb_operacion_proceso_fk_carga_excel FOREIGN KEY (id_carga_excel) REFERENCES public.tb_operacion_carga_excel(id)
);

ALTER TABLE public.tb_operacion_proceso
  ADD COLUMN IF NOT EXISTS comision_monto_extra_servicio numeric;

ALTER TABLE public.tb_operacion_proceso
  ALTER COLUMN comision_monto_extra_servicio TYPE numeric
  USING comision_monto_extra_servicio::numeric;

ALTER TABLE public.tb_operacion_proceso
  ALTER COLUMN monto_deposito_cliente TYPE numeric(18,2)
  USING CASE
    WHEN monto_deposito_cliente IS NULL THEN NULL
    ELSE ROUND(monto_deposito_cliente::numeric, 2)
  END;

-- Los importes derivados tambien conservan centavos. Las tasas de ITF y
-- porcentajes permanecen numeric sin escala fija porque no son importes.
ALTER TABLE public.tb_operacion_proceso
  ALTER COLUMN monto_transferencia_cliente TYPE numeric(18,2)
  USING CASE
    WHEN monto_transferencia_cliente IS NULL THEN NULL
    ELSE ROUND(monto_transferencia_cliente::numeric, 2)
  END,
  ALTER COLUMN resultado_comision_banco_ingreso TYPE numeric(18,2)
  USING CASE
    WHEN resultado_comision_banco_ingreso IS NULL THEN NULL
    ELSE ROUND(resultado_comision_banco_ingreso::numeric, 2)
  END,
  ALTER COLUMN resultado_comision_servicio TYPE numeric(18,2)
  USING CASE
    WHEN resultado_comision_servicio IS NULL THEN NULL
    ELSE ROUND(resultado_comision_servicio::numeric, 2)
  END,
  ALTER COLUMN resultado_comision_banco_salida TYPE numeric(18,2)
  USING CASE
    WHEN resultado_comision_banco_salida IS NULL THEN NULL
    ELSE ROUND(resultado_comision_banco_salida::numeric, 2)
  END;

ALTER TABLE public.tb_operacion_proceso
  ADD COLUMN IF NOT EXISTS email_cliente character varying;

/*
Migracion de contratos: los importes de deposito, transferencia, devolucion y
resultados de comision conservan centavos en registro, edicion y carga.
*/
DO $$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'f_get_tb_operacion_proceso',
        'f_get_tb_operacion_comision_efectivizacion_cliente',
        'f_post_tb_operacion_proceso',
        'f_patch_tb_operacion_proceso_base',
        'f_get_tb_operacion_calculo_comision_servicio',
        'f_get_tb_operacion_calculo_comision_banco_ingreso',
        'f_get_tb_operacion_proceso_calculo'
      )
  LOOP
    EXECUTE format(
      'DROP FUNCTION IF EXISTS %I.%I(%s);',
      v_function.schema_name,
      v_function.function_name,
      v_function.identity_arguments
    );
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'tipo_servicio'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN tipo_servicio character varying;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'ruta_origen'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN ruta_origen character varying;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'ruta_destino'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN ruta_destino character varying;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'flag_derivado'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN flag_derivado boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'fecha_derivacion'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN fecha_derivacion timestamp with time zone;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'id_usuario_deriva'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN id_usuario_deriva bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'nombre_usuario_deriva'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN nombre_usuario_deriva character varying;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'id_empresa_salida_origen'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN id_empresa_salida_origen bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'nombre_empresa_salida_origen'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN nombre_empresa_salida_origen character varying;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'id_empresa_cuenta_salida_origen'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN id_empresa_cuenta_salida_origen bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'id_banco_empresa_cuenta_salida_origen'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN id_banco_empresa_cuenta_salida_origen bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'nombre_banco_empresa_cuenta_salida_origen'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN nombre_banco_empresa_cuenta_salida_origen character varying;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'flag_retenido'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN flag_retenido boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'fecha_retencion'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN fecha_retencion timestamp with time zone;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'id_usuario_retiene'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN id_usuario_retiene bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'nombre_usuario_retiene'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN nombre_usuario_retiene character varying;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'motivo_retencion'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN motivo_retencion text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'id_caja_cierre'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN id_caja_cierre bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'fecha_caja_cierre'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN fecha_caja_cierre timestamp with time zone;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'id_operacion_padre'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN id_operacion_padre bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'id_operacion_match'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN id_operacion_match bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'tipo_flujo_pago_deuda'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN tipo_flujo_pago_deuda character varying;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'monto_devuelto'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN monto_devuelto numeric(18,2) NOT NULL DEFAULT 0;
  END IF;
END;
$$;

ALTER TABLE public.tb_operacion_proceso
  ALTER COLUMN monto_devuelto TYPE numeric(18,2)
  USING CASE
    WHEN monto_devuelto IS NULL THEN 0
    ELSE ROUND(monto_devuelto::numeric, 2)
  END;

-- ALTER TABLE: id_tipo_deposito ya no se usa; el tipo aplicado se congela en nombre_tipo_deposito.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tb_operacion_proceso'
      AND column_name = 'id_tipo_deposito'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso DROP COLUMN id_tipo_deposito;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'tipo_recaudacion_sf'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN tipo_recaudacion_sf character varying;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'id_carga_excel'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN id_carga_excel bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'nombre_carga_excel'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN nombre_carga_excel character varying;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_operacion_proceso' AND column_name = 'fecha_carga_excel'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso ADD COLUMN fecha_carga_excel timestamp with time zone;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tb_operacion_proceso_fk_carga_excel'
  ) THEN
    ALTER TABLE public.tb_operacion_proceso
      ADD CONSTRAINT tb_operacion_proceso_fk_carga_excel
      FOREIGN KEY (id_carga_excel) REFERENCES public.tb_operacion_carga_excel(id);
  END IF;
END;
$$;

/*
Funcion: f_get_tb_documento_tipo_codigo
Objetivo:
  Traducir el tipo de documento textual del parseo compacto a un codigo
  numerico persistible en `tb_cliente`.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_documento_tipo_codigo(
  p_tipo character varying
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT CASE UPPER(COALESCE(p_tipo, ''))
    WHEN 'DNI' THEN 1
    WHEN 'CE' THEN 2
    WHEN 'RUC' THEN 3
    ELSE 1
  END;
$$;

/*
Funcion: f_get_tb_operacion_proceso
Objetivo:
  Consultar operaciones con filtros opcionales sobre los principales campos
  operativos, comerciales, monetarios y de auditoria.

Diseno:
  - responde directamente con los campos congelados de la tabla
  - no recalcula nada
  - no depende de caja ni de snapshots contables externos
  - sirve tanto para detalle como para datatable
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_proceso(
  p_id bigint DEFAULT NULL,
  p_id_codigo_servicio bigint DEFAULT NULL,
  p_nombre_codigo_servicio character varying DEFAULT NULL,
  p_tipo_servicio character varying DEFAULT NULL,
  p_id_comunidad bigint DEFAULT NULL,
  p_nombre_comunidad character varying DEFAULT NULL,
  p_nombre_tipo_deposito character varying DEFAULT NULL,
  p_id_cliente bigint DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_nombre_cliente character varying DEFAULT NULL,
  p_id_banco_cliente bigint DEFAULT NULL,
  p_nombre_banco_cliente character varying DEFAULT NULL,
  p_monto_deposito_cliente numeric DEFAULT NULL,
  p_codigo_operacion_deposito_cliente character varying DEFAULT NULL,
  p_fecha_deposito_desde timestamp with time zone DEFAULT NULL,
  p_fecha_deposito_hasta timestamp with time zone DEFAULT NULL,
  p_id_empresa_ingreso bigint DEFAULT NULL,
  p_nombre_empresa_ingreso character varying DEFAULT NULL,
  p_id_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_nombre_banco_empresa_cuenta_ingreso character varying DEFAULT NULL,
  p_comision_servicio numeric DEFAULT NULL,
  p_comision_monto_extra_servicio numeric DEFAULT NULL,
  p_resultado_comision_servicio numeric DEFAULT NULL,
  p_id_empresa_salida bigint DEFAULT NULL,
  p_nombre_empresa_salida character varying DEFAULT NULL,
  p_id_empresa_cuenta_salida bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_salida bigint DEFAULT NULL,
  p_nombre_banco_empresa_cuenta_salida character varying DEFAULT NULL,
  p_resultado_comision_banco_ingreso numeric DEFAULT NULL,
  p_resultado_comision_banco_salida numeric DEFAULT NULL,
  p_monto_transferencia_cliente numeric DEFAULT NULL,
  p_id_banco_cliente_transferencia bigint DEFAULT NULL,
  p_nombre_banco_cliente_transferencia character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_nombre_estado character varying DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL,
  p_id_usuario_reasignado bigint DEFAULT NULL,
  p_nombre_usuario_reasignado character varying DEFAULT NULL,
  p_id_usuario_solicitud bigint DEFAULT NULL,
  p_nombre_usuario_solicitud character varying DEFAULT NULL,
  p_ruta_origen character varying DEFAULT NULL,
  p_ruta_destino character varying DEFAULT NULL,
  p_flag_derivado boolean DEFAULT NULL,
  p_fecha_derivacion_desde timestamp with time zone DEFAULT NULL,
  p_fecha_derivacion_hasta timestamp with time zone DEFAULT NULL,
  p_id_usuario_deriva bigint DEFAULT NULL,
  p_nombre_usuario_deriva character varying DEFAULT NULL,
  p_flag_retenido boolean DEFAULT NULL,
  p_fecha_retencion_desde timestamp with time zone DEFAULT NULL,
  p_fecha_retencion_hasta timestamp with time zone DEFAULT NULL,
  p_id_usuario_retiene bigint DEFAULT NULL,
  p_nombre_usuario_retiene character varying DEFAULT NULL,
  p_motivo_retencion character varying DEFAULT NULL,
  p_fecha_pendiente_desde timestamp with time zone DEFAULT NULL,
  p_fecha_pendiente_hasta timestamp with time zone DEFAULT NULL,
  p_fecha_pagado_desde timestamp with time zone DEFAULT NULL,
  p_fecha_pagado_hasta timestamp with time zone DEFAULT NULL,
  p_error_motivo character varying DEFAULT NULL,
  p_observacion_tiempo character varying DEFAULT NULL,
  p_tipo_facturacion character varying DEFAULT NULL,
  p_fecha_registro_desde timestamp with time zone DEFAULT NULL,
  p_fecha_registro_hasta timestamp with time zone DEFAULT NULL,
  p_id_caja_cierre bigint DEFAULT NULL,
  p_fecha_caja_cierre_desde timestamp with time zone DEFAULT NULL,
  p_fecha_caja_cierre_hasta timestamp with time zone DEFAULT NULL,
  p_incluir_cerradas boolean DEFAULT false
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT to_jsonb(t)
  FROM public.tb_operacion_proceso t
  WHERE (p_id IS NULL OR t.id = p_id)
    AND (p_id_estado IS NOT NULL OR COALESCE(t.id_estado, 0) <> 10)
    AND (p_id_codigo_servicio IS NULL OR t.id_codigo_servicio = p_id_codigo_servicio)
    AND (p_nombre_codigo_servicio IS NULL OR t.nombre_codigo_servicio ILIKE '%' || p_nombre_codigo_servicio || '%')
    AND (p_tipo_servicio IS NULL OR COALESCE(t.tipo_servicio, '') ILIKE '%' || p_tipo_servicio || '%')
    AND (p_id_comunidad IS NULL OR t.id_comunidad = p_id_comunidad)
    AND (p_nombre_comunidad IS NULL OR t.nombre_comunidad ILIKE '%' || p_nombre_comunidad || '%')
    AND (p_nombre_tipo_deposito IS NULL OR t.nombre_tipo_deposito ILIKE '%' || p_nombre_tipo_deposito || '%')
    AND (p_id_cliente IS NULL OR t.id_cliente = p_id_cliente)
    AND (p_dni_cliente IS NULL OR t.dni_cliente ILIKE '%' || p_dni_cliente || '%')
    AND (p_nombre_cliente IS NULL OR t.nombre_cliente ILIKE '%' || p_nombre_cliente || '%')
    AND (p_id_banco_cliente IS NULL OR t.id_banco_cliente = p_id_banco_cliente)
    AND (p_nombre_banco_cliente IS NULL OR t.nombre_banco_cliente ILIKE '%' || p_nombre_banco_cliente || '%')
    AND (p_monto_deposito_cliente IS NULL OR t.monto_deposito_cliente = p_monto_deposito_cliente)
    AND (p_codigo_operacion_deposito_cliente IS NULL OR t.codigo_operacion_deposito_cliente ILIKE '%' || p_codigo_operacion_deposito_cliente || '%')
    AND (p_fecha_deposito_desde IS NULL OR t.fecha_deposito_cliente >= p_fecha_deposito_desde)
    AND (p_fecha_deposito_hasta IS NULL OR t.fecha_deposito_cliente <= p_fecha_deposito_hasta)
    AND (p_id_empresa_ingreso IS NULL OR t.id_empresa_ingreso = p_id_empresa_ingreso)
    AND (p_nombre_empresa_ingreso IS NULL OR t.nombre_empresa_ingreso ILIKE '%' || p_nombre_empresa_ingreso || '%')
    AND (p_id_empresa_cuenta_ingreso IS NULL OR t.id_empresa_cuenta_ingreso = p_id_empresa_cuenta_ingreso)
    AND (p_id_banco_empresa_cuenta_ingreso IS NULL OR t.id_banco_empresa_cuenta_ingreso = p_id_banco_empresa_cuenta_ingreso)
    AND (p_nombre_banco_empresa_cuenta_ingreso IS NULL OR t.nombre_banco_empresa_cuenta_ingreso ILIKE '%' || p_nombre_banco_empresa_cuenta_ingreso || '%')
    AND (p_comision_servicio IS NULL OR t.comision_servicio = p_comision_servicio)
    AND (p_comision_monto_extra_servicio IS NULL OR t.comision_monto_extra_servicio = p_comision_monto_extra_servicio)
    AND (p_resultado_comision_servicio IS NULL OR t.resultado_comision_servicio = p_resultado_comision_servicio)
    AND (p_id_empresa_salida IS NULL OR t.id_empresa_salida = p_id_empresa_salida)
    AND (p_nombre_empresa_salida IS NULL OR t.nombre_empresa_salida ILIKE '%' || p_nombre_empresa_salida || '%')
    AND (p_id_empresa_cuenta_salida IS NULL OR t.id_empresa_cuenta_salida = p_id_empresa_cuenta_salida)
    AND (p_id_banco_empresa_cuenta_salida IS NULL OR t.id_banco_empresa_cuenta_salida = p_id_banco_empresa_cuenta_salida)
    AND (p_nombre_banco_empresa_cuenta_salida IS NULL OR t.nombre_banco_empresa_cuenta_salida ILIKE '%' || p_nombre_banco_empresa_cuenta_salida || '%')
    AND (p_resultado_comision_banco_ingreso IS NULL OR t.resultado_comision_banco_ingreso = p_resultado_comision_banco_ingreso)
    AND (p_resultado_comision_banco_salida IS NULL OR t.resultado_comision_banco_salida = p_resultado_comision_banco_salida)
    AND (p_monto_transferencia_cliente IS NULL OR t.monto_transferencia_cliente = p_monto_transferencia_cliente)
    AND (p_id_banco_cliente_transferencia IS NULL OR t.id_banco_cliente_transferencia = p_id_banco_cliente_transferencia)
    AND (p_nombre_banco_cliente_transferencia IS NULL OR t.nombre_banco_cliente_transferencia ILIKE '%' || p_nombre_banco_cliente_transferencia || '%')
    AND (p_id_estado IS NULL OR t.id_estado = p_id_estado)
    AND (p_nombre_estado IS NULL OR t.nombre_estado ILIKE '%' || p_nombre_estado || '%')
    AND (p_id_usuario IS NULL OR t.id_usuario = p_id_usuario)
    AND (p_nombre_usuario IS NULL OR t.nombre_usuario ILIKE '%' || p_nombre_usuario || '%')
    AND (p_id_usuario_gestor IS NULL OR t.id_usuario_gestor = p_id_usuario_gestor)
    AND (p_nombre_usuario_gestor IS NULL OR t.nombre_usuario_gestor ILIKE '%' || p_nombre_usuario_gestor || '%')
    AND (p_id_usuario_reasignado IS NULL OR t.id_usuario_reasignado = p_id_usuario_reasignado)
    AND (p_nombre_usuario_reasignado IS NULL OR t.nombre_usuario_reasignado ILIKE '%' || p_nombre_usuario_reasignado || '%')
    AND (p_id_usuario_solicitud IS NULL OR t.id_usuario_solicitud = p_id_usuario_solicitud)
    AND (p_nombre_usuario_solicitud IS NULL OR t.nombre_usuario_solicitud ILIKE '%' || p_nombre_usuario_solicitud || '%')
    AND (p_ruta_origen IS NULL OR COALESCE(t.ruta_origen, '') ILIKE '%' || p_ruta_origen || '%')
    AND (p_ruta_destino IS NULL OR COALESCE(t.ruta_destino, '') ILIKE '%' || p_ruta_destino || '%')
    AND (p_flag_derivado IS NULL OR t.flag_derivado = p_flag_derivado)
    AND (p_fecha_derivacion_desde IS NULL OR t.fecha_derivacion >= p_fecha_derivacion_desde)
    AND (p_fecha_derivacion_hasta IS NULL OR t.fecha_derivacion <= p_fecha_derivacion_hasta)
    AND (p_id_usuario_deriva IS NULL OR t.id_usuario_deriva = p_id_usuario_deriva)
    AND (p_nombre_usuario_deriva IS NULL OR COALESCE(t.nombre_usuario_deriva, '') ILIKE '%' || p_nombre_usuario_deriva || '%')
    AND (p_flag_retenido IS NULL OR t.flag_retenido = p_flag_retenido)
    AND (p_fecha_retencion_desde IS NULL OR t.fecha_retencion >= p_fecha_retencion_desde)
    AND (p_fecha_retencion_hasta IS NULL OR t.fecha_retencion <= p_fecha_retencion_hasta)
    AND (p_id_usuario_retiene IS NULL OR t.id_usuario_retiene = p_id_usuario_retiene)
    AND (p_nombre_usuario_retiene IS NULL OR COALESCE(t.nombre_usuario_retiene, '') ILIKE '%' || p_nombre_usuario_retiene || '%')
    AND (p_motivo_retencion IS NULL OR COALESCE(t.motivo_retencion, '') ILIKE '%' || p_motivo_retencion || '%')
    AND (p_fecha_pendiente_desde IS NULL OR t.fecha_pendiente >= p_fecha_pendiente_desde)
    AND (p_fecha_pendiente_hasta IS NULL OR t.fecha_pendiente <= p_fecha_pendiente_hasta)
    AND (p_fecha_pagado_desde IS NULL OR t.fecha_pagado >= p_fecha_pagado_desde)
    AND (p_fecha_pagado_hasta IS NULL OR t.fecha_pagado <= p_fecha_pagado_hasta)
    AND (p_error_motivo IS NULL OR t.error_motivo ILIKE '%' || p_error_motivo || '%')
    AND (p_observacion_tiempo IS NULL OR t.observacion_tiempo ILIKE '%' || p_observacion_tiempo || '%')
    AND (p_tipo_facturacion IS NULL OR t.tipo_facturacion ILIKE '%' || p_tipo_facturacion || '%')
    AND (p_fecha_registro_desde IS NULL OR t.fecha_registro >= p_fecha_registro_desde)
    AND (p_fecha_registro_hasta IS NULL OR t.fecha_registro <= p_fecha_registro_hasta)
    AND (p_fecha_caja_cierre_desde IS NULL OR t.fecha_caja_cierre >= p_fecha_caja_cierre_desde)
    AND (p_fecha_caja_cierre_hasta IS NULL OR t.fecha_caja_cierre <= p_fecha_caja_cierre_hasta)
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
        AND (
          COALESCE(p_incluir_cerradas, false)
          OR t.id_caja_cierre IS NULL
          OR COALESCE(p_flag_retenido, false) = true
        )
      )
    )
  ORDER BY t.id DESC;
$$;

-- ============================================================================
-- 13.1. RESPALDO DE OPERACIONES DE EFECTIVIZACION ELIMINADAS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_operacion_proceso_eliminada (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_operacion_proceso bigint NOT NULL,
  id_estado_anterior bigint,
  nombre_estado_anterior character varying,
  flag_retenido_anterior boolean NOT NULL DEFAULT false,
  movimientos_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  id_usuario bigint,
  fecha_eliminacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_operacion_proceso_eliminada_pkey PRIMARY KEY (id),
  CONSTRAINT tb_operacion_proceso_eliminada_uq UNIQUE (id_operacion_proceso),
  CONSTRAINT tb_operacion_proceso_eliminada_fk_operacion
    FOREIGN KEY (id_operacion_proceso) REFERENCES public.tb_operacion_proceso(id),
  CONSTRAINT tb_operacion_proceso_eliminada_fk_estado
    FOREIGN KEY (id_estado_anterior) REFERENCES public.tb_estado(id),
  CONSTRAINT tb_operacion_proceso_eliminada_fk_usuario
    FOREIGN KEY (id_usuario) REFERENCES public.tb_usuario(id)
);

/*
Funcion: f_patch_tb_operacion_proceso_eliminar
Objetivo:
  Aplicar soft delete a una operacion no pagada, revirtiendo primero sus
  movimientos abiertos y conservando un snapshot para restaurar.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_eliminar(
  p_id bigint,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_mov record;
  v_estado_eliminado_id bigint;
  v_estado_eliminado_nombre character varying;
  v_snapshot jsonb := '[]'::jsonb;
  v_usuario bigint;
  v_ruta character varying;
  v_es_linkpago boolean := false;
  v_saldo_caja numeric;
  v_saldo_simulado numeric;
  v_caja_simulada bigint;
  v_monto_reversion numeric;
  v_es_operacion_pendiente boolean := false;
  v_movimientos_cerrados_conservados integer := 0;
BEGIN
  SELECT * INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  FOR UPDATE;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion no existe.');
  END IF;

  v_es_linkpago := LOWER(COALESCE(v_actual.ruta_origen, '')) = 'linkpago';
  v_es_operacion_pendiente := UPPER(BTRIM(COALESCE(v_actual.nombre_estado, ''))) IN ('PENDIENTE', 'RECHAZADO');
  v_usuario := COALESCE(p_id_usuario, v_actual.id_usuario_gestor, v_actual.id_usuario);

  IF LOWER(COALESCE(v_actual.ruta_origen, '')) IN ('pos', 'linkpago')
     AND EXISTS (
       SELECT 1
       FROM public.tb_usuario u
       LEFT JOIN public.tb_rol r ON r.id = u.id_rol
       WHERE u.id = p_id_usuario
         AND (
           u.id_rol = 3
           OR UPPER(BTRIM(COALESCE(r.nombre, ''))) = 'JEFE DE TIENDA'
         )
     )
     AND (
       v_actual.id_usuario_solicitud IS NULL
       OR v_actual.id_usuario_solicitud IS DISTINCT FROM p_id_usuario
     ) THEN
    RETURN jsonb_build_object('error', 'Solo el usuario que registro la operacion puede eliminarla.');
  END IF;

  IF COALESCE(v_actual.id_estado, 0) = 10
     OR UPPER(COALESCE(v_actual.nombre_estado, '')) = 'ELIMINADO'
     OR (
       UPPER(COALESCE(v_actual.nombre_estado, '')) = 'PAGADO'
       AND NOT v_es_linkpago
     ) THEN
    RETURN jsonb_build_object('error', 'No se puede eliminar una operacion Pagada o Eliminada.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja c
    WHERE c.id_operacion_proceso = p_id
      AND c.id_caja_cierre IS NOT NULL
  ) AND NOT v_es_operacion_pendiente THEN
    RETURN jsonb_build_object('error', 'No se puede eliminar una operacion con movimientos cerrados por caja.');
  END IF;

  -- Validate the reversal before changing the caja. A prior income may have
  -- already been consumed by later operations in the same open cycle.
  FOR v_mov IN
    SELECT c.*
    FROM public.tb_operacion_caja c
    WHERE c.id_operacion_proceso = p_id
      AND (c.id_caja_cierre IS NULL OR v_es_operacion_pendiente)
    ORDER BY c.id
  LOOP
    IF v_caja_simulada IS DISTINCT FROM v_mov.id_caja THEN
      SELECT c.saldo_actual
      INTO v_saldo_caja
      FROM public.tb_caja_operativa c
      WHERE c.id = v_mov.id_caja
      FOR UPDATE;

      v_caja_simulada := v_mov.id_caja;
      v_saldo_simulado := COALESCE(v_saldo_caja, 0);
    END IF;

    IF UPPER(BTRIM(COALESCE(v_mov.tipo_movimiento, ''))) = 'INGRESO' THEN
      IF UPPER(BTRIM(COALESCE(v_mov.nombre_estado, ''))) = 'RETENIDO' THEN
        v_monto_reversion := -COALESCE(v_mov.monto_gasto, 0);
      ELSE
        v_monto_reversion := COALESCE(v_mov.monto_ingreso, 0) - COALESCE(v_mov.monto_gasto, 0);
      END IF;
    ELSIF UPPER(BTRIM(COALESCE(v_mov.tipo_movimiento, ''))) = 'SALIDA' THEN
      v_monto_reversion := -(COALESCE(v_mov.monto_salida, 0) + COALESCE(v_mov.monto_gasto, 0));
    ELSE
      v_monto_reversion := 0;
    END IF;

    v_saldo_simulado := COALESCE(v_saldo_simulado, 0) - v_monto_reversion;

    IF v_saldo_simulado < 0 THEN
      RETURN jsonb_build_object(
        'error', 'No se puede eliminar la operacion porque la caja no tiene saldo suficiente para revertir el movimiento.',
        'saldo_disponible', COALESCE(v_saldo_caja, 0),
        'monto_reversion', ABS(v_monto_reversion),
        'id_caja', v_mov.id_caja
      );
    END IF;
  END LOOP;

  -- Los movimientos ya cerrados de una operacion pendiente se conservan como
  -- historico. Solo se descuenta su impacto del saldo de la caja viva.
  IF v_es_operacion_pendiente THEN
    FOR v_mov IN
      SELECT c.*
      FROM public.tb_operacion_caja c
      WHERE c.id_operacion_proceso = p_id
        AND c.id_caja_cierre IS NOT NULL
      ORDER BY c.id
    LOOP
      IF UPPER(BTRIM(COALESCE(v_mov.tipo_movimiento, ''))) = 'INGRESO' THEN
        IF UPPER(BTRIM(COALESCE(v_mov.nombre_estado, ''))) = 'RETENIDO' THEN
          v_monto_reversion := -COALESCE(v_mov.monto_gasto, 0);
        ELSE
          v_monto_reversion := COALESCE(v_mov.monto_ingreso, 0) - COALESCE(v_mov.monto_gasto, 0);
        END IF;
      ELSIF UPPER(BTRIM(COALESCE(v_mov.tipo_movimiento, ''))) = 'SALIDA' THEN
        v_monto_reversion := -(COALESCE(v_mov.monto_salida, 0) + COALESCE(v_mov.monto_gasto, 0));
      ELSE
        v_monto_reversion := 0;
      END IF;

      UPDATE public.tb_caja_operativa c
      SET saldo_actual = c.saldo_actual - v_monto_reversion,
          saldo_total = c.saldo_total - v_monto_reversion,
          id_usuario = COALESCE(v_usuario, c.id_usuario)
      WHERE c.id = v_mov.id_caja;

      v_movimientos_cerrados_conservados := v_movimientos_cerrados_conservados + 1;
    END LOOP;
  END IF;

  SELECT id, nombre INTO v_estado_eliminado_id, v_estado_eliminado_nombre
  FROM public.tb_estado
  WHERE id = 10 OR UPPER(nombre) = 'ELIMINADO'
  ORDER BY id
  LIMIT 1;

  IF v_estado_eliminado_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No existe el estado Eliminado (id 10).');
  END IF;

  SELECT COALESCE(v_actual.ruta_destino, v_actual.ruta_origen) INTO v_ruta;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id), '[]'::jsonb)
  INTO v_snapshot
  FROM public.tb_operacion_caja c
  WHERE c.id_operacion_proceso = p_id
    AND c.id_caja_cierre IS NULL;

  INSERT INTO public.tb_operacion_proceso_eliminada (
    id_operacion_proceso,
    id_estado_anterior,
    nombre_estado_anterior,
    flag_retenido_anterior,
    movimientos_snapshot,
    id_usuario
  )
  VALUES (
    p_id,
    v_actual.id_estado,
    CASE WHEN COALESCE(v_actual.flag_retenido, false) THEN 'Retenido' ELSE v_actual.nombre_estado END,
    COALESCE(v_actual.flag_retenido, false),
    v_snapshot,
    v_usuario
  )
  ON CONFLICT (id_operacion_proceso) DO UPDATE SET
    id_estado_anterior = EXCLUDED.id_estado_anterior,
    nombre_estado_anterior = EXCLUDED.nombre_estado_anterior,
    flag_retenido_anterior = EXCLUDED.flag_retenido_anterior,
    movimientos_snapshot = EXCLUDED.movimientos_snapshot,
    id_usuario = EXCLUDED.id_usuario,
    fecha_eliminacion = now();

  IF NOT v_es_linkpago THEN
    FOR v_mov IN
      SELECT *
      FROM public.tb_operacion_caja
      WHERE id_operacion_proceso = p_id
        AND id_caja_cierre IS NULL
      ORDER BY id
    LOOP
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
        p_id_usuario := v_usuario
      );

      UPDATE public.tb_operacion_caja
      SET id_operacion_caja_relacionada = NULL
      WHERE id_operacion_caja_relacionada = v_mov.id;

      DELETE FROM public.tb_operacion_caja WHERE id = v_mov.id;
    END LOOP;
  END IF;

  UPDATE public.tb_operacion_proceso
  SET id_estado = v_estado_eliminado_id,
      nombre_estado = v_estado_eliminado_nombre,
      flag_retenido = false,
      id_usuario_gestor = COALESCE(p_id_usuario, id_usuario_gestor),
      fecha_retencion = NULL,
      id_usuario_retiene = NULL,
      nombre_usuario_retiene = NULL,
      motivo_retencion = NULL
  WHERE id = p_id;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta, v_usuario);
  IF NOT v_es_linkpago THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(v_ruta, v_usuario);
  END IF;

  RETURN jsonb_build_object(
    'id', p_id,
    'id_estado', v_estado_eliminado_id,
    'nombre_estado', v_estado_eliminado_nombre,
    'movimientos_revertidos', jsonb_array_length(v_snapshot),
    'movimientos_historicos_conservados', v_movimientos_cerrados_conservados
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_restaurar
Objetivo:
  Restaurar una operacion eliminada al estado y flujo que tenia antes del
  soft delete, reconstruyendo sus movimientos abiertos.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_restaurar(
  p_id bigint,
  p_id_usuario bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_backup record;
  v_mov jsonb;
  v_restored jsonb;
  v_usuario bigint;
  v_ruta character varying;
  v_previous_name character varying;
  v_previous_id bigint;
BEGIN
  SELECT * INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  FOR UPDATE;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion no existe.');
  END IF;

  IF COALESCE(v_actual.id_estado, 0) <> 10
     AND UPPER(COALESCE(v_actual.nombre_estado, '')) <> 'ELIMINADO' THEN
    RETURN jsonb_build_object('error', 'La operacion no esta eliminada.');
  END IF;

  SELECT * INTO v_backup
  FROM public.tb_operacion_proceso_eliminada
  WHERE id_operacion_proceso = p_id
  FOR UPDATE;

  IF v_backup.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No existe respaldo para restaurar la operacion.');
  END IF;

  v_usuario := COALESCE(p_id_usuario, v_actual.id_usuario_gestor, v_actual.id_usuario);
  v_ruta := COALESCE(v_actual.ruta_destino, v_actual.ruta_origen);
  v_previous_id := v_backup.id_estado_anterior;
  v_previous_name := CASE
    WHEN v_backup.flag_retenido_anterior THEN 'Retenido'
    ELSE v_backup.nombre_estado_anterior
  END;

  UPDATE public.tb_operacion_proceso
  SET id_estado = v_previous_id,
      nombre_estado = v_previous_name,
      flag_retenido = v_backup.flag_retenido_anterior,
      fecha_retencion = CASE WHEN v_backup.flag_retenido_anterior THEN COALESCE(fecha_retencion, now()) ELSE fecha_retencion END,
      id_usuario_gestor = COALESCE(p_id_usuario, id_usuario_gestor)
  WHERE id = p_id;

  FOR v_mov IN SELECT value FROM jsonb_array_elements(v_backup.movimientos_snapshot)
  LOOP
    v_restored := public.f_post_tb_operacion_caja_desde_proceso(
      p_id_operacion_proceso := p_id,
      p_tipo_origen := v_mov->>'tipo_origen',
      p_tipo_movimiento := v_mov->>'tipo_movimiento',
      p_id_usuario := v_usuario,
      p_nombre_usuario := NULL,
      p_id_estado := v_previous_id
    );

    IF v_restored IS NULL OR v_restored ? 'error' THEN
      RAISE EXCEPTION '%', COALESCE(v_restored->>'error', 'No se pudo reconstruir un movimiento de la operacion.');
    END IF;
  END LOOP;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta, v_usuario);
  PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(v_ruta, v_usuario);

  DELETE FROM public.tb_operacion_proceso_eliminada WHERE id_operacion_proceso = p_id;

  RETURN (
    SELECT x FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x LIMIT 1
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE public.tb_operacion_proceso
  SET id_estado = 10,
      nombre_estado = COALESCE((SELECT nombre FROM public.tb_estado WHERE id = 10), 'Eliminado'),
      flag_retenido = false
  WHERE id = p_id;
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

/*
Funcion: f_get_tb_operacion_proceso_flag_pendiente_kpi
Objetivo:
  Determinar si una operacion debe sumar al KPI materializado
  `pendiente_depositar` de la ruta.

Regla:
  - cuentan solo estados `Pendiente` y `Rechazado`
  - una operacion retenida queda fuera del KPI mientras mantenga la retencion
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_proceso_flag_pendiente_kpi(
  p_nombre_estado character varying,
  p_flag_retenido boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT CASE
    WHEN COALESCE(p_flag_retenido, false) THEN false
    WHEN UPPER(BTRIM(COALESCE(p_nombre_estado, ''))) IN ('PENDIENTE', 'RECHAZADO') THEN true
    ELSE false
  END;
$$;

/*
Funcion: f_get_tb_operacion_comision_efectivizacion_cliente
Objetivo:
  Resolver la comision efectiva de Efectivizacion considerando la configuracion
  recurrente del cliente. Las rutas asistidas no llaman esta funcion.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_comision_efectivizacion_cliente(
  p_id_cliente bigint,
  p_monto_deposito_cliente numeric,
  p_comision_servicio_regla numeric,
  p_monto_minimo_deposito_servicio numeric,
  p_comision_minima_servicio numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_porcentaje_recurrente numeric;
  v_extra_recurrente numeric := 0;
  v_porcentaje numeric;
  v_extra numeric := 0;
  v_calc jsonb;
  v_tiene_porcentaje boolean := false;
BEGIN
  IF p_id_cliente IS NOT NULL THEN
    SELECT c.comision_servicio_recurrente, c.comision_monto_extra_servicio_recurrente
    INTO v_porcentaje_recurrente, v_extra_recurrente
    FROM public.tb_cliente c
    WHERE c.id = p_id_cliente
    LIMIT 1;
  END IF;

  v_tiene_porcentaje := v_porcentaje_recurrente IS NOT NULL;
  v_porcentaje := CASE
    WHEN v_tiene_porcentaje THEN v_porcentaje_recurrente
    ELSE p_comision_servicio_regla
  END;
  v_extra := COALESCE(v_extra_recurrente, 0);

  v_calc := public.f_get_tb_operacion_calculo_comision_servicio(
    COALESCE(p_monto_deposito_cliente, 0),
    COALESCE(v_porcentaje, 0),
    CASE WHEN v_tiene_porcentaje THEN 0 ELSE COALESCE(p_monto_minimo_deposito_servicio, 0) END,
    CASE WHEN v_tiene_porcentaje THEN 0 ELSE COALESCE(p_comision_minima_servicio, 0) END,
    v_extra
  );

  RETURN v_calc || jsonb_build_object(
    'comision_servicio', v_porcentaje,
    'monto_minimo_deposito_servicio', CASE WHEN v_tiene_porcentaje THEN 0 ELSE p_monto_minimo_deposito_servicio END,
    'comision_minima_servicio', CASE WHEN v_tiene_porcentaje THEN 0 ELSE p_comision_minima_servicio END,
    'comision_monto_extra_servicio', v_extra,
    'comision_recurrente', v_tiene_porcentaje
  );
END;
$$;

/*
Funcion: f_post_tb_operacion_proceso
Objetivo:
  Crear una operacion manual ya resuelta y con resultados congelados.

Uso esperado:
  - registro manual desde Operaciones
  - insercion programatica cuando el frontend ya resolvio la regla aplicada

Regla de fase:
  - la operacion se registra en `tb_operacion_proceso`
  - el impacto de caja se delega a `f_post_tb_operacion_caja_desde_proceso`
  - si la ruta bancaria viene informada, el ingreso se valida contra el banco
    de la ruta; la caja primaria solo se usa como default si no llega empresa
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_operacion_proceso(
  p_id_codigo_servicio bigint DEFAULT NULL,
  p_nombre_codigo_servicio character varying DEFAULT NULL,
  p_tipo_servicio character varying DEFAULT NULL,
  p_id_comunidad bigint DEFAULT NULL,
  p_nombre_comunidad character varying DEFAULT NULL,
  p_nombre_tipo_deposito character varying DEFAULT NULL,
  p_id_cliente bigint DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_nombre_cliente character varying DEFAULT NULL,
  p_id_banco_cliente bigint DEFAULT NULL,
  p_nombre_banco_cliente character varying DEFAULT NULL,
  p_monto_deposito_cliente numeric DEFAULT NULL,
  p_codigo_operacion_deposito_cliente character varying DEFAULT NULL,
  p_fecha_deposito_cliente timestamp with time zone DEFAULT NULL,
  p_id_empresa_ingreso bigint DEFAULT NULL,
  p_nombre_empresa_ingreso character varying DEFAULT NULL,
  p_id_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_nombre_banco_empresa_cuenta_ingreso character varying DEFAULT NULL,
  p_flag_por_sol_comision_banco_ingreso boolean DEFAULT NULL,
  p_comision_banco_ingreso numeric DEFAULT NULL,
  p_comision_minimo_banco_ingreso numeric DEFAULT NULL,
  p_comision_igv_banco_ingreso numeric DEFAULT NULL,
  p_resultado_comision_banco_ingreso numeric DEFAULT NULL,
  p_monto_itf_ingreso numeric DEFAULT NULL,
  p_comision_servicio numeric DEFAULT NULL,
  p_monto_minimo_deposito_servicio numeric DEFAULT NULL,
  p_comision_minima_servicio numeric DEFAULT NULL,
  p_comision_monto_extra_servicio numeric DEFAULT NULL,
  p_resultado_comision_servicio numeric DEFAULT NULL,
  p_id_empresa_salida bigint DEFAULT NULL,
  p_nombre_empresa_salida character varying DEFAULT NULL,
  p_id_empresa_cuenta_salida bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_salida bigint DEFAULT NULL,
  p_nombre_banco_empresa_cuenta_salida character varying DEFAULT NULL,
  p_comision_transf_banco_salida numeric DEFAULT NULL,
  p_comision_transf_inter_banco_salida numeric DEFAULT NULL,
  p_resultado_comision_banco_salida numeric DEFAULT NULL,
  p_monto_transferencia_cliente numeric DEFAULT NULL,
  p_monto_itf_salida numeric DEFAULT NULL,
  p_id_banco_cliente_transferencia bigint DEFAULT NULL,
  p_nombre_banco_cliente_transferencia character varying DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_nombre_estado character varying DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL,
  p_id_usuario_reasignado bigint DEFAULT NULL,
  p_nombre_usuario_reasignado character varying DEFAULT NULL,
  p_id_usuario_solicitud bigint DEFAULT NULL,
  p_nombre_usuario_solicitud character varying DEFAULT NULL,
  p_ruta_origen character varying DEFAULT NULL,
  p_ruta_destino character varying DEFAULT NULL,
  p_flag_derivado boolean DEFAULT false,
  p_fecha_derivacion timestamp with time zone DEFAULT NULL,
  p_id_usuario_deriva bigint DEFAULT NULL,
  p_nombre_usuario_deriva character varying DEFAULT NULL,
  p_flag_retenido boolean DEFAULT false,
  p_fecha_retencion timestamp with time zone DEFAULT NULL,
  p_id_usuario_retiene bigint DEFAULT NULL,
  p_nombre_usuario_retiene character varying DEFAULT NULL,
  p_motivo_retencion text DEFAULT NULL,
  p_fecha_pendiente timestamp with time zone DEFAULT NULL,
  p_fecha_pagado timestamp with time zone DEFAULT NULL,
  p_error_motivo character varying DEFAULT NULL,
  p_observacion_tiempo text DEFAULT NULL,
  p_tipo_facturacion character varying DEFAULT NULL,
  p_ruta_actual character varying DEFAULT NULL,
  p_tipo_documento_cliente bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id bigint;
  v_cliente_id bigint;
  v_cliente_nombre character varying;
  v_cliente_existente boolean := false;
  v_estado_activo_id bigint;
  v_tipo_servicio character varying;
  v_tipo_documento bigint;
  v_ruta_ingreso jsonb;
  v_id_banco_ruta bigint;
  v_nombre_banco_ruta character varying;
  v_ruta_origen_final character varying;
  v_ruta_destino_final character varying;
  v_id_empresa_ingreso_final bigint;
  v_nombre_empresa_ingreso_final character varying;
  v_id_empresa_cuenta_ingreso_final bigint;
  v_id_banco_empresa_cuenta_ingreso_final bigint;
  v_nombre_banco_empresa_cuenta_ingreso_final character varying;
  v_ruta_kpi character varying;
  v_caja_result jsonb;
  v_id_ecb_ingreso bigint;
  v_itf_cuenta numeric := 0;
  v_flag_por_sol_comision_banco_ingreso_val boolean := false;
  v_flag_retencion_cuenta_val boolean := false;
  v_comision_banco_ingreso_val numeric := 0;
  v_comision_minimo_banco_ingreso_val numeric := 0;
  v_comision_igv_banco_ingreso_val numeric := 0;
  v_regla record;
  v_dup_id bigint;
  v_monto_duplicidad numeric;
  v_codigo_duplicidad character varying;
  v_calc_serv jsonb;
  v_comision_efectivizacion jsonb;
  v_calc_ing jsonb;
  v_calc_sal jsonb;
  v_sincroniza_cliente boolean := false;
BEGIN
  IF p_monto_deposito_cliente IS NOT NULL THEN
    p_monto_deposito_cliente := ROUND(p_monto_deposito_cliente::numeric, 2);
  END IF;

  v_cliente_id := p_id_cliente;
  v_cliente_nombre := p_nombre_cliente;
  v_tipo_servicio := p_tipo_servicio;
  v_tipo_documento := public.f_get_tb_documento_tipo_codigo('DNI');
  v_ruta_origen_final := COALESCE(p_ruta_origen, p_ruta_actual);
  v_ruta_destino_final := COALESCE(p_ruta_destino, p_ruta_origen, p_ruta_actual);
  v_id_empresa_ingreso_final := p_id_empresa_ingreso;
  v_nombre_empresa_ingreso_final := p_nombre_empresa_ingreso;
  v_id_empresa_cuenta_ingreso_final := p_id_empresa_cuenta_ingreso;
  v_id_banco_empresa_cuenta_ingreso_final := p_id_banco_empresa_cuenta_ingreso;
  v_nombre_banco_empresa_cuenta_ingreso_final := p_nombre_banco_empresa_cuenta_ingreso;
  v_ruta_kpi := COALESCE(v_ruta_destino_final, v_ruta_origen_final);

  IF v_tipo_servicio IS NULL AND p_id_codigo_servicio IS NOT NULL THEN
    SELECT cs.tipo
    INTO v_tipo_servicio
    FROM public.tb_codigo_servicio cs
    WHERE cs.id = p_id_codigo_servicio
    LIMIT 1;
  END IF;

  v_sincroniza_cliente := UPPER(BTRIM(COALESCE(v_tipo_servicio, ''))) = 'EFECTIVIZACION'
    AND LOWER(BTRIM(COALESCE(v_ruta_origen_final, ''))) IN ('bcp', 'bbva', 'scotiabank', 'banbif', 'interbank', 'safetypay');

  IF v_cliente_id IS NULL AND COALESCE(p_dni_cliente, '') <> '' THEN
    p_dni_cliente := REGEXP_REPLACE(COALESCE(p_dni_cliente, ''), '[^0-9]', '', 'g');

    IF p_tipo_documento_cliente IS NOT NULL THEN
      IF p_tipo_documento_cliente NOT IN (1, 2) THEN
        RETURN jsonb_build_object('error', 'Tipo de documento invalido.');
      END IF;

      v_tipo_documento := p_tipo_documento_cliente;

      IF v_tipo_documento = 1 AND LENGTH(p_dni_cliente) <> 8 THEN
        RETURN jsonb_build_object('error', 'El DNI debe tener exactamente 8 dígitos.');
      END IF;

      IF v_tipo_documento = 2 AND LENGTH(p_dni_cliente) <> 9 THEN
        RETURN jsonb_build_object('error', 'El CE debe tener exactamente 9 dígitos.');
      END IF;
    ELSIF LENGTH(p_dni_cliente) = 11 THEN
      v_tipo_documento := public.f_get_tb_documento_tipo_codigo('RUC');
    END IF;

    SELECT id, nombre
    INTO v_cliente_id, v_cliente_nombre
    FROM public.tb_cliente
    WHERE tipo_documento = v_tipo_documento
      AND numero_documento = p_dni_cliente
    LIMIT 1;

    v_cliente_existente := v_cliente_id IS NOT NULL;

    IF v_cliente_id IS NULL THEN
      SELECT id INTO v_estado_activo_id
      FROM public.tb_estado
      WHERE UPPER(nombre) = 'ACTIVO'
      LIMIT 1;

      INSERT INTO public.tb_cliente (
        tipo_documento,
        numero_documento,
        nombre,
        id_comunidad,
        id_estado,
        id_usuario
      )
      VALUES (
        v_tipo_documento,
        p_dni_cliente,
        COALESCE(p_nombre_cliente, ''),
        p_id_comunidad,
        v_estado_activo_id,
        p_id_usuario
      )
      RETURNING id, nombre INTO v_cliente_id, v_cliente_nombre;
    END IF;

    IF v_cliente_existente AND p_id_comunidad IS NOT NULL AND v_sincroniza_cliente THEN
      PERFORM public.f_patch_tb_cliente(
        p_id := v_cliente_id,
        p_id_comunidad := p_id_comunidad,
        p_id_usuario := p_id_usuario
      );
    END IF;
  END IF;

  IF COALESCE(v_ruta_origen_final, '') <> '' THEN
    IF LOWER(COALESCE(v_ruta_origen_final, '')) = 'safetypay' THEN
      v_ruta_ingreso := public.f_get_tb_ruta_operacion_caja_ingreso_principal(v_ruta_origen_final);

      IF v_ruta_ingreso IS NULL THEN
        RETURN jsonb_build_object(
          'error', 'La ruta SafetyPay no tiene una caja primaria de ingreso configurada.'
        );
      END IF;

      IF p_id_empresa_ingreso IS NOT NULL
         AND p_id_empresa_ingreso <> COALESCE((v_ruta_ingreso->>'id_empresa')::bigint, 0) THEN
        RETURN jsonb_build_object(
          'error', 'La empresa de ingreso no coincide con la caja primaria de SafetyPay.'
        );
      END IF;

      IF p_id_empresa_cuenta_ingreso IS NOT NULL
         AND p_id_empresa_cuenta_ingreso <> COALESCE((v_ruta_ingreso->>'id_empresa_cuenta_bancaria')::bigint, 0) THEN
        RETURN jsonb_build_object(
          'error', 'La cuenta bancaria de ingreso no coincide con la caja primaria de SafetyPay.'
        );
      END IF;

      v_id_empresa_ingreso_final := (v_ruta_ingreso->>'id_empresa')::bigint;
      v_nombre_empresa_ingreso_final := v_ruta_ingreso->>'nombre_empresa';
      v_id_empresa_cuenta_ingreso_final := (v_ruta_ingreso->>'id_empresa_cuenta_bancaria')::bigint;
      v_id_banco_empresa_cuenta_ingreso_final := (v_ruta_ingreso->>'id_banco')::bigint;
      v_nombre_banco_empresa_cuenta_ingreso_final := v_ruta_ingreso->>'nombre_banco';
    ELSE
      SELECT b.id, b.nombre
      INTO v_id_banco_ruta, v_nombre_banco_ruta
      FROM public.tb_banco b
      WHERE UPPER(b.nombre) = CASE LOWER(v_ruta_origen_final)
          WHEN 'bcp' THEN 'BCP'
          WHEN 'bbva' THEN 'BBVA'
          WHEN 'scotiabank' THEN 'SCOTIABANK'
          WHEN 'banbif' THEN 'BANBIF'
          WHEN 'interbank' THEN 'INTERBANK'
          WHEN 'safetypay' THEN 'SAFETYPAY'
          ELSE ''
        END
         OR UPPER(COALESCE(b.nombre_abreviatura, '')) = CASE LOWER(v_ruta_origen_final)
          WHEN 'bcp' THEN 'BCP'
          WHEN 'bbva' THEN 'BBVA'
          WHEN 'scotiabank' THEN 'SCOTIABANK'
          WHEN 'banbif' THEN 'BANBIF'
          WHEN 'interbank' THEN 'IBK'
          WHEN 'safetypay' THEN 'SFPAY'
          ELSE ''
        END
      LIMIT 1;

      IF v_id_banco_ruta IS NOT NULL THEN
        IF v_id_empresa_ingreso_final IS NULL THEN
          v_ruta_ingreso := public.f_get_tb_ruta_operacion_caja_ingreso_principal(v_ruta_origen_final);

          IF v_ruta_ingreso IS NULL THEN
            RETURN jsonb_build_object(
              'error', 'Selecciona una empresa de ingreso para la ruta actual.'
            );
          END IF;

          v_id_empresa_ingreso_final := (v_ruta_ingreso->>'id_empresa')::bigint;
          v_nombre_empresa_ingreso_final := v_ruta_ingreso->>'nombre_empresa';
        END IF;

        SELECT ecb.id
        INTO v_id_empresa_cuenta_ingreso_final
        FROM public.tb_empresa_cuenta_bancaria ecb
        WHERE ecb.id_empresa = v_id_empresa_ingreso_final
          AND ecb.id_banco = v_id_banco_ruta
        LIMIT 1;

        IF v_id_empresa_cuenta_ingreso_final IS NULL THEN
          RETURN jsonb_build_object(
            'error', 'La empresa seleccionada no tiene cuenta bancaria activa para el banco de la ruta.'
          );
        END IF;

        IF p_id_empresa_cuenta_ingreso IS NOT NULL
           AND p_id_empresa_cuenta_ingreso <> v_id_empresa_cuenta_ingreso_final THEN
          RETURN jsonb_build_object(
            'error', 'La cuenta bancaria de ingreso no corresponde al banco de la ruta.'
          );
        END IF;

        IF v_nombre_empresa_ingreso_final IS NULL THEN
          SELECT e.nombre
          INTO v_nombre_empresa_ingreso_final
          FROM public.tb_empresa e
          WHERE e.id = v_id_empresa_ingreso_final
          LIMIT 1;
        END IF;

        v_id_banco_empresa_cuenta_ingreso_final := v_id_banco_ruta;
        v_nombre_banco_empresa_cuenta_ingreso_final := v_nombre_banco_ruta;
      ELSE
        v_ruta_ingreso := public.f_get_tb_ruta_operacion_caja_ingreso_principal(v_ruta_origen_final);

        IF v_ruta_ingreso IS NULL THEN
          RETURN jsonb_build_object(
            'error', 'La ruta actual no tiene una caja primaria de ingreso configurada.'
          );
        END IF;

        IF p_id_empresa_ingreso IS NOT NULL
           AND p_id_empresa_ingreso <> COALESCE((v_ruta_ingreso->>'id_empresa')::bigint, 0) THEN
          RETURN jsonb_build_object(
            'error', 'La empresa de ingreso no coincide con la caja primaria de la ruta.'
          );
        END IF;

        IF p_id_empresa_cuenta_ingreso IS NOT NULL
           AND p_id_empresa_cuenta_ingreso <> COALESCE((v_ruta_ingreso->>'id_empresa_cuenta_bancaria')::bigint, 0) THEN
          RETURN jsonb_build_object(
            'error', 'La cuenta bancaria de ingreso no coincide con la caja primaria de la ruta.'
          );
        END IF;

        v_id_empresa_ingreso_final := (v_ruta_ingreso->>'id_empresa')::bigint;
        v_nombre_empresa_ingreso_final := v_ruta_ingreso->>'nombre_empresa';
        v_id_empresa_cuenta_ingreso_final := (v_ruta_ingreso->>'id_empresa_cuenta_bancaria')::bigint;
        v_id_banco_empresa_cuenta_ingreso_final := (v_ruta_ingreso->>'id_banco')::bigint;
        v_nombre_banco_empresa_cuenta_ingreso_final := v_ruta_ingreso->>'nombre_banco';
      END IF;
    END IF;
  END IF;

  SELECT
    ecb.id,
    ecb.comision_itf_ingreso_salida,
    ecb.flag_por_sol_comision_banco_ingreso,
    ecb.comision_banco_ingreso,
    ecb.comision_minimo_banco_ingreso,
    ecb.comision_igv_banco_ingreso
  INTO
    v_id_ecb_ingreso,
    v_itf_cuenta,
    v_flag_por_sol_comision_banco_ingreso_val,
    v_comision_banco_ingreso_val,
    v_comision_minimo_banco_ingreso_val,
    v_comision_igv_banco_ingreso_val
  FROM public.tb_empresa_cuenta_bancaria ecb
  WHERE ecb.id_empresa = v_id_empresa_ingreso_final
    AND ecb.id_banco   = v_id_banco_empresa_cuenta_ingreso_final
    AND ecb.id_estado  = (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1)
  LIMIT 1;

  IF v_id_ecb_ingreso IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'No existe una cuenta bancaria activa de ingreso para la empresa y banco de la ruta.'
    );
  END IF;

  IF to_regprocedure('public.f_get_tb_recaudacion_cuenta_flag_retenida(character varying,bigint)') IS NOT NULL THEN
    v_flag_retencion_cuenta_val := public.f_get_tb_recaudacion_cuenta_flag_retenida(
      v_ruta_kpi,
      v_id_ecb_ingreso
    );
  ELSE
    v_flag_retencion_cuenta_val := false;
  END IF;

  v_codigo_duplicidad := NULLIF(BTRIM(COALESCE(p_codigo_operacion_deposito_cliente, '')), '');

  IF v_codigo_duplicidad IS NOT NULL
     AND p_id_codigo_servicio IS NOT NULL
     AND p_monto_deposito_cliente IS NOT NULL
     AND p_fecha_deposito_cliente IS NOT NULL THEN
    v_monto_duplicidad := ROUND(COALESCE(p_monto_deposito_cliente, 0)::numeric, 2);

    -- Serialize identical deposits across simultaneous manual and Excel loads.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        CONCAT_WS('|', p_id_codigo_servicio::text, UPPER(v_codigo_duplicidad), v_monto_duplicidad::text),
        0
      )
    );

    SELECT id
    INTO v_dup_id
    FROM public.tb_operacion_proceso
    WHERE 1 = 1
      -- AND dni_cliente = p_dni_cliente
      AND ROUND(COALESCE(monto_deposito_cliente, 0)::numeric, 2) = v_monto_duplicidad
      AND UPPER(BTRIM(COALESCE(codigo_operacion_deposito_cliente, ''))) = UPPER(v_codigo_duplicidad)
      AND id_codigo_servicio = p_id_codigo_servicio
      AND fecha_deposito_cliente::date BETWEEN (p_fecha_deposito_cliente::date - 7) AND (p_fecha_deposito_cliente::date + 7)
    LIMIT 1;

    IF v_dup_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'error', 'Operacion duplicada por monto, codigo de operacion, servicio y ventana de deposito de 7 dias.',
        'estado', 'OMITIDO',
        'id_operacion', v_dup_id
      );
    END IF;
  END IF;

  SELECT r.*
  INTO v_regla
  FROM public.tb_reglas_efectivizacion r
  WHERE r.id_codigo_servicio = p_id_codigo_servicio
    AND r.id_banco   = v_id_banco_empresa_cuenta_ingreso_final
    AND r.id_comunidad = p_id_comunidad
    AND (p_nombre_tipo_deposito IS NULL OR r.tipo_deposito = p_nombre_tipo_deposito)
    AND r.id_estado  = (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1)
  LIMIT 1;

  IF v_regla.id IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'No se encontro una regla activa de efectivizacion para la combinacion seleccionada.'
    );
  END IF;

  IF v_sincroniza_cliente THEN
    v_comision_efectivizacion := public.f_get_tb_operacion_comision_efectivizacion_cliente(
      v_cliente_id,
      COALESCE(p_monto_deposito_cliente, 0),
      v_regla.comision_servicio,
      v_regla.monto_minimo_deposito_servicio,
      v_regla.comision_minima_servicio
    );
  ELSE
    v_comision_efectivizacion := public.f_get_tb_operacion_calculo_comision_servicio(
      COALESCE(p_monto_deposito_cliente, 0),
      v_regla.comision_servicio,
      v_regla.monto_minimo_deposito_servicio,
      v_regla.comision_minima_servicio,
      0
    ) || jsonb_build_object(
      'comision_servicio', v_regla.comision_servicio,
      'monto_minimo_deposito_servicio', v_regla.monto_minimo_deposito_servicio,
      'comision_minima_servicio', v_regla.comision_minima_servicio,
      'comision_monto_extra_servicio', 0
    );
  END IF;
  v_calc_serv := v_comision_efectivizacion;

  v_calc_ing := public.f_get_tb_operacion_calculo_comision_banco_ingreso(
    v_flag_por_sol_comision_banco_ingreso_val,
    COALESCE(p_monto_deposito_cliente, 0),
    v_comision_banco_ingreso_val,
    v_comision_minimo_banco_ingreso_val,
    v_comision_igv_banco_ingreso_val,
    v_itf_cuenta
  );

  v_calc_sal := public.f_get_tb_operacion_calculo_comision_banco_salida(
    (v_calc_serv->>'monto_transferencia_cliente')::numeric,
    0,
    0,
    v_itf_cuenta,
    v_id_empresa_ingreso_final,
    v_id_empresa_cuenta_ingreso_final,
    v_id_banco_empresa_cuenta_ingreso_final,
    v_id_banco_empresa_cuenta_ingreso_final
  );

  INSERT INTO public.tb_operacion_proceso (
    id_codigo_servicio,
    nombre_codigo_servicio,
    tipo_servicio,
    id_comunidad,
    nombre_comunidad,
    nombre_tipo_deposito,
    id_cliente,
    dni_cliente,
    nombre_cliente,
    id_banco_cliente,
    nombre_banco_cliente,
    monto_deposito_cliente,
    codigo_operacion_deposito_cliente,
    fecha_deposito_cliente,
    id_empresa_ingreso,
    nombre_empresa_ingreso,
    id_empresa_cuenta_ingreso,
    id_banco_empresa_cuenta_ingreso,
    nombre_banco_empresa_cuenta_ingreso,
    flag_por_sol_comision_banco_ingreso,
    comision_banco_ingreso,
    comision_minimo_banco_ingreso,
    comision_igv_banco_ingreso,
    resultado_comision_banco_ingreso,
    monto_itf_ingreso,
    comision_servicio,
    monto_minimo_deposito_servicio,
    comision_minima_servicio,
    comision_monto_extra_servicio,
    resultado_comision_servicio,
    id_empresa_salida,
    nombre_empresa_salida,
    id_empresa_cuenta_salida,
    id_banco_empresa_cuenta_salida,
    nombre_banco_empresa_cuenta_salida,
    comision_transf_banco_salida,
    comision_transf_inter_banco_salida,
    resultado_comision_banco_salida,
    monto_transferencia_cliente,
    monto_itf_salida,
    id_banco_cliente_transferencia,
    nombre_banco_cliente_transferencia,
    id_estado,
    nombre_estado,
    id_usuario,
    nombre_usuario,
    id_usuario_gestor,
    nombre_usuario_gestor,
    id_usuario_reasignado,
    nombre_usuario_reasignado,
    id_usuario_solicitud,
    nombre_usuario_solicitud,
    ruta_origen,
    ruta_destino,
    flag_derivado,
    fecha_derivacion,
    id_usuario_deriva,
    nombre_usuario_deriva,
    flag_retenido,
    fecha_retencion,
    id_usuario_retiene,
    nombre_usuario_retiene,
    motivo_retencion,
    fecha_pendiente,
    fecha_pagado,
    error_motivo,
    observacion_tiempo,
    tipo_facturacion
  )
  VALUES (
    p_id_codigo_servicio,
    p_nombre_codigo_servicio,
    v_tipo_servicio,
    p_id_comunidad,
    p_nombre_comunidad,
    v_regla.tipo_deposito,
    v_cliente_id,
    p_dni_cliente,
    COALESCE(v_cliente_nombre, p_nombre_cliente),
    v_id_banco_empresa_cuenta_ingreso_final,
    v_nombre_banco_empresa_cuenta_ingreso_final,
    p_monto_deposito_cliente,
    p_codigo_operacion_deposito_cliente,
    p_fecha_deposito_cliente,
    v_id_empresa_ingreso_final,
    v_nombre_empresa_ingreso_final,
    v_id_empresa_cuenta_ingreso_final,
    v_id_banco_empresa_cuenta_ingreso_final,
    v_nombre_banco_empresa_cuenta_ingreso_final,
    v_flag_por_sol_comision_banco_ingreso_val,
    v_comision_banco_ingreso_val,
    v_comision_minimo_banco_ingreso_val,
    v_comision_igv_banco_ingreso_val,
    (v_calc_ing->>'resultado_comision_banco_ingreso')::numeric,
    v_itf_cuenta,
    (v_calc_serv->>'comision_servicio')::numeric,
    (v_calc_serv->>'monto_minimo_deposito_servicio')::numeric,
    (v_calc_serv->>'comision_minima_servicio')::numeric,
    (v_calc_serv->>'comision_monto_extra_servicio')::numeric,
    (v_calc_serv->>'resultado_comision_servicio')::numeric,
    v_id_empresa_ingreso_final,
    v_nombre_empresa_ingreso_final,
    v_id_empresa_cuenta_ingreso_final,
    v_id_banco_empresa_cuenta_ingreso_final,
    v_nombre_banco_empresa_cuenta_ingreso_final,
    0,
    0,
    (v_calc_sal->>'resultado_comision_banco_salida')::numeric,
    (v_calc_serv->>'monto_transferencia_cliente')::numeric,
    v_itf_cuenta,
    v_id_banco_empresa_cuenta_ingreso_final,
    v_nombre_banco_empresa_cuenta_ingreso_final,
    p_id_estado,
    p_nombre_estado,
    p_id_usuario,
    p_nombre_usuario,
    COALESCE(p_id_usuario_gestor, p_id_usuario),
    COALESCE(p_nombre_usuario_gestor, p_nombre_usuario),
    p_id_usuario_reasignado,
    p_nombre_usuario_reasignado,
    p_id_usuario_solicitud,
    p_nombre_usuario_solicitud,
    v_ruta_origen_final,
    v_ruta_destino_final,
    COALESCE(p_flag_derivado, false),
    p_fecha_derivacion,
    p_id_usuario_deriva,
    p_nombre_usuario_deriva,
    CASE WHEN v_flag_retencion_cuenta_val THEN true ELSE COALESCE(p_flag_retenido, false) END,
    CASE WHEN v_flag_retencion_cuenta_val THEN now() ELSE p_fecha_retencion END,
    p_id_usuario_retiene,
    p_nombre_usuario_retiene,
    p_motivo_retencion,
    p_fecha_pendiente,
    p_fecha_pagado,
    p_error_motivo,
    p_observacion_tiempo,
    COALESCE(p_tipo_facturacion, 'Boleta')
  )
  RETURNING id INTO v_id;

  v_caja_result := public.f_post_tb_operacion_caja_desde_proceso(
    p_id_operacion_proceso := v_id,
    p_tipo_origen := 'EFECTIVIZACION',
    p_tipo_movimiento := 'INGRESO',
    p_id_usuario := p_id_usuario,
    p_nombre_usuario := p_nombre_usuario,
    p_id_estado := p_id_estado
  );

  IF v_caja_result ? 'error' THEN
    RETURN v_caja_result;
  END IF;

  IF to_regprocedure('public.f_patch_tb_recaudacion_confirmar_si_vencida(bigint,bigint,character varying)') IS NOT NULL THEN
    PERFORM public.f_patch_tb_recaudacion_confirmar_si_vencida(v_id, p_id_usuario, p_nombre_usuario);
  END IF;

  IF UPPER(COALESCE(p_nombre_estado, '')) = 'PAGADO' THEN
    v_caja_result := public.f_post_tb_operacion_caja_desde_proceso(
      p_id_operacion_proceso := v_id,
      p_tipo_origen := 'EFECTIVIZACION',
      p_tipo_movimiento := 'SALIDA',
      p_id_usuario := p_id_usuario,
      p_nombre_usuario := p_nombre_usuario,
      p_id_estado := p_id_estado
    );

    IF v_caja_result ? 'error' THEN
      RETURN v_caja_result;
    END IF;
  END IF;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi, p_id_usuario);

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := v_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_base
Objetivo:
  Actualizar la base operativa de una operacion sin entrar todavia a acciones
  especiales como pagado, reanudacion o carga masiva.

Casos de uso:
  - editar operacion manual
  - autoguardado inline
  - recalculo posterior a cambios de comunidad, banco, empresa o transferencia

Restriccion:
  - esta fase solo persiste cambios operativos congelados
  - no debe generar efectos contables
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_base(
  p_id bigint,
  p_tipo_servicio character varying DEFAULT NULL,
  p_id_comunidad bigint DEFAULT NULL,
  p_nombre_comunidad character varying DEFAULT NULL,
  p_nombre_tipo_deposito character varying DEFAULT NULL,
  p_id_cliente bigint DEFAULT NULL,
  p_dni_cliente character varying DEFAULT NULL,
  p_nombre_cliente character varying DEFAULT NULL,
  p_id_banco_cliente bigint DEFAULT NULL,
  p_nombre_banco_cliente character varying DEFAULT NULL,
  p_monto_deposito_cliente numeric DEFAULT NULL,
  p_codigo_operacion_deposito_cliente character varying DEFAULT NULL,
  p_fecha_deposito_cliente timestamp with time zone DEFAULT NULL,
  p_id_empresa_ingreso bigint DEFAULT NULL,
  p_nombre_empresa_ingreso character varying DEFAULT NULL,
  p_id_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_nombre_banco_empresa_cuenta_ingreso character varying DEFAULT NULL,
  p_flag_por_sol_comision_banco_ingreso boolean DEFAULT NULL,
  p_comision_banco_ingreso numeric DEFAULT NULL,
  p_comision_minimo_banco_ingreso numeric DEFAULT NULL,
  p_comision_igv_banco_ingreso numeric DEFAULT NULL,
  p_resultado_comision_banco_ingreso numeric DEFAULT NULL,
  p_monto_itf_ingreso numeric DEFAULT NULL,
  p_comision_servicio numeric DEFAULT NULL,
  p_monto_minimo_deposito_servicio numeric DEFAULT NULL,
  p_comision_minima_servicio numeric DEFAULT NULL,
  p_comision_monto_extra_servicio numeric DEFAULT NULL,
  p_resultado_comision_servicio numeric DEFAULT NULL,
  p_id_empresa_salida bigint DEFAULT NULL,
  p_nombre_empresa_salida character varying DEFAULT NULL,
  p_id_empresa_cuenta_salida bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_salida bigint DEFAULT NULL,
  p_nombre_banco_empresa_cuenta_salida character varying DEFAULT NULL,
  p_comision_transf_banco_salida numeric DEFAULT NULL,
  p_comision_transf_inter_banco_salida numeric DEFAULT NULL,
  p_resultado_comision_banco_salida numeric DEFAULT NULL,
  p_monto_transferencia_cliente numeric DEFAULT NULL,
  p_monto_itf_salida numeric DEFAULT NULL,
  p_id_banco_cliente_transferencia bigint DEFAULT NULL,
  p_nombre_banco_cliente_transferencia character varying DEFAULT NULL,
  p_tipo_facturacion character varying DEFAULT NULL,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL,
  p_id_usuario_reasignado bigint DEFAULT NULL,
  p_nombre_usuario_reasignado character varying DEFAULT NULL,
  p_id_usuario_solicitud bigint DEFAULT NULL,
  p_nombre_usuario_solicitud character varying DEFAULT NULL,
  p_ruta_origen character varying DEFAULT NULL,
  p_ruta_destino character varying DEFAULT NULL,
  p_flag_derivado boolean DEFAULT NULL,
  p_fecha_derivacion timestamp with time zone DEFAULT NULL,
  p_id_usuario_deriva bigint DEFAULT NULL,
  p_nombre_usuario_deriva character varying DEFAULT NULL,
  p_flag_retenido boolean DEFAULT NULL,
  p_fecha_retencion timestamp with time zone DEFAULT NULL,
  p_id_usuario_retiene bigint DEFAULT NULL,
  p_nombre_usuario_retiene character varying DEFAULT NULL,
  p_motivo_retencion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_actualizada record;
  v_sync_result jsonb;
  v_ruta_actual character varying;
  v_ruta_final character varying;
  v_regla_recurrente record;
  v_calc_recurrente jsonb;
  v_calc_ing_recurrente jsonb;
  v_calc_sal_recurrente jsonb;
  BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1;

  UPDATE public.tb_operacion_proceso
  SET tipo_servicio = COALESCE(p_tipo_servicio, tipo_servicio),
      id_comunidad = COALESCE(p_id_comunidad, id_comunidad),
      nombre_comunidad = COALESCE(p_nombre_comunidad, nombre_comunidad),
      nombre_tipo_deposito = COALESCE(p_nombre_tipo_deposito, nombre_tipo_deposito),
      id_cliente = COALESCE(p_id_cliente, id_cliente),
      dni_cliente = COALESCE(p_dni_cliente, dni_cliente),
      nombre_cliente = COALESCE(p_nombre_cliente, nombre_cliente),
      id_banco_cliente = COALESCE(p_id_banco_cliente, id_banco_cliente),
      nombre_banco_cliente = COALESCE(p_nombre_banco_cliente, nombre_banco_cliente),
      monto_deposito_cliente = COALESCE(p_monto_deposito_cliente, monto_deposito_cliente),
      codigo_operacion_deposito_cliente = COALESCE(p_codigo_operacion_deposito_cliente, codigo_operacion_deposito_cliente),
      fecha_deposito_cliente = COALESCE(p_fecha_deposito_cliente, fecha_deposito_cliente),
      id_empresa_ingreso = COALESCE(p_id_empresa_ingreso, id_empresa_ingreso),
      nombre_empresa_ingreso = COALESCE(p_nombre_empresa_ingreso, nombre_empresa_ingreso),
      id_empresa_cuenta_ingreso = COALESCE(p_id_empresa_cuenta_ingreso, id_empresa_cuenta_ingreso),
      id_banco_empresa_cuenta_ingreso = COALESCE(p_id_banco_empresa_cuenta_ingreso, id_banco_empresa_cuenta_ingreso),
      nombre_banco_empresa_cuenta_ingreso = COALESCE(p_nombre_banco_empresa_cuenta_ingreso, nombre_banco_empresa_cuenta_ingreso),
      flag_por_sol_comision_banco_ingreso = COALESCE(p_flag_por_sol_comision_banco_ingreso, flag_por_sol_comision_banco_ingreso),
      comision_banco_ingreso = COALESCE(p_comision_banco_ingreso, comision_banco_ingreso),
      comision_minimo_banco_ingreso = COALESCE(p_comision_minimo_banco_ingreso, comision_minimo_banco_ingreso),
      comision_igv_banco_ingreso = COALESCE(p_comision_igv_banco_ingreso, comision_igv_banco_ingreso),
      resultado_comision_banco_ingreso = COALESCE(p_resultado_comision_banco_ingreso, resultado_comision_banco_ingreso),
      monto_itf_ingreso = COALESCE(p_monto_itf_ingreso, monto_itf_ingreso),
      comision_servicio = COALESCE(p_comision_servicio, comision_servicio),
      monto_minimo_deposito_servicio = COALESCE(p_monto_minimo_deposito_servicio, monto_minimo_deposito_servicio),
      comision_minima_servicio = COALESCE(p_comision_minima_servicio, comision_minima_servicio),
      comision_monto_extra_servicio = COALESCE(p_comision_monto_extra_servicio, comision_monto_extra_servicio),
      resultado_comision_servicio = COALESCE(p_resultado_comision_servicio, resultado_comision_servicio),
      id_empresa_salida = COALESCE(p_id_empresa_salida, id_empresa_salida),
      nombre_empresa_salida = COALESCE(p_nombre_empresa_salida, nombre_empresa_salida),
      id_empresa_cuenta_salida = COALESCE(p_id_empresa_cuenta_salida, id_empresa_cuenta_salida),
      id_banco_empresa_cuenta_salida = COALESCE(p_id_banco_empresa_cuenta_salida, id_banco_empresa_cuenta_salida),
      nombre_banco_empresa_cuenta_salida = COALESCE(p_nombre_banco_empresa_cuenta_salida, nombre_banco_empresa_cuenta_salida),
      comision_transf_banco_salida = COALESCE(p_comision_transf_banco_salida, comision_transf_banco_salida),
      comision_transf_inter_banco_salida = COALESCE(p_comision_transf_inter_banco_salida, comision_transf_inter_banco_salida),
      resultado_comision_banco_salida = COALESCE(p_resultado_comision_banco_salida, resultado_comision_banco_salida),
      monto_transferencia_cliente = COALESCE(p_monto_transferencia_cliente, monto_transferencia_cliente),
      monto_itf_salida = COALESCE(p_monto_itf_salida, monto_itf_salida),
      id_banco_cliente_transferencia = COALESCE(p_id_banco_cliente_transferencia, id_banco_cliente_transferencia),
      nombre_banco_cliente_transferencia = COALESCE(p_nombre_banco_cliente_transferencia, nombre_banco_cliente_transferencia),
      tipo_facturacion = COALESCE(p_tipo_facturacion, tipo_facturacion),
      id_usuario = COALESCE(p_id_usuario, id_usuario),
      nombre_usuario = COALESCE(p_nombre_usuario, nombre_usuario),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor),
      id_usuario_reasignado = COALESCE(p_id_usuario_reasignado, id_usuario_reasignado),
      nombre_usuario_reasignado = COALESCE(p_nombre_usuario_reasignado, nombre_usuario_reasignado),
      id_usuario_solicitud = COALESCE(p_id_usuario_solicitud, id_usuario_solicitud),
      nombre_usuario_solicitud = COALESCE(p_nombre_usuario_solicitud, nombre_usuario_solicitud),
      ruta_origen = COALESCE(p_ruta_origen, ruta_origen),
      ruta_destino = COALESCE(p_ruta_destino, ruta_destino),
      flag_derivado = COALESCE(p_flag_derivado, flag_derivado),
      fecha_derivacion = COALESCE(p_fecha_derivacion, fecha_derivacion),
      id_usuario_deriva = COALESCE(p_id_usuario_deriva, id_usuario_deriva),
      nombre_usuario_deriva = COALESCE(p_nombre_usuario_deriva, nombre_usuario_deriva),
      flag_retenido = COALESCE(p_flag_retenido, flag_retenido),
      fecha_retencion = COALESCE(p_fecha_retencion, fecha_retencion),
      id_usuario_retiene = COALESCE(p_id_usuario_retiene, id_usuario_retiene),
      nombre_usuario_retiene = COALESCE(p_nombre_usuario_retiene, nombre_usuario_retiene),
      motivo_retencion = COALESCE(p_motivo_retencion, motivo_retencion)
  WHERE id = p_id;

  v_ruta_actual := COALESCE(v_actual.ruta_destino, v_actual.ruta_origen);
  v_ruta_final := COALESCE(p_ruta_destino, p_ruta_origen, v_actual.ruta_destino, v_actual.ruta_origen);

  SELECT *
  INTO v_actualizada
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1;

  IF p_id_comunidad IS NOT NULL
     AND v_actualizada.id_cliente IS NOT NULL
     AND UPPER(BTRIM(COALESCE(v_actualizada.tipo_servicio, ''))) = 'EFECTIVIZACION'
     AND LOWER(BTRIM(COALESCE(v_actualizada.ruta_destino, v_actualizada.ruta_origen, ''))) IN ('bcp', 'bbva', 'scotiabank', 'banbif', 'interbank', 'safetypay') THEN
    PERFORM public.f_patch_tb_cliente(
      p_id := v_actualizada.id_cliente,
      p_id_comunidad := p_id_comunidad,
      p_id_usuario := COALESCE(p_id_usuario, v_actualizada.id_usuario)
    );

    SELECT r.*
    INTO v_regla_recurrente
    FROM public.tb_reglas_efectivizacion r
    WHERE r.id_codigo_servicio = v_actualizada.id_codigo_servicio
      AND r.id_banco = v_actualizada.id_banco_empresa_cuenta_ingreso
      AND r.id_comunidad = p_id_comunidad
      AND (v_actualizada.nombre_tipo_deposito IS NULL OR r.tipo_deposito = v_actualizada.nombre_tipo_deposito)
      AND r.id_estado = (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1)
    LIMIT 1;

    IF v_regla_recurrente.id IS NULL THEN
      RETURN jsonb_build_object('error', 'No se encontro una regla activa para la nueva comunidad.');
    END IF;

    v_calc_recurrente := public.f_get_tb_operacion_comision_efectivizacion_cliente(
      v_actualizada.id_cliente,
      COALESCE(v_actualizada.monto_deposito_cliente, 0),
      v_regla_recurrente.comision_servicio,
      v_regla_recurrente.monto_minimo_deposito_servicio,
      v_regla_recurrente.comision_minima_servicio
    );

    v_calc_ing_recurrente := public.f_get_tb_operacion_calculo_comision_banco_ingreso(
      COALESCE(v_actualizada.flag_por_sol_comision_banco_ingreso, false),
      COALESCE(v_actualizada.monto_deposito_cliente, 0),
      COALESCE(v_actualizada.comision_banco_ingreso, 0),
      COALESCE(v_actualizada.comision_minimo_banco_ingreso, 0),
      COALESCE(v_actualizada.comision_igv_banco_ingreso, 0),
      COALESCE(v_actualizada.monto_itf_ingreso, 0)
    );

    v_calc_sal_recurrente := public.f_get_tb_operacion_calculo_comision_banco_salida(
      (v_calc_recurrente->>'monto_transferencia_cliente')::numeric,
      COALESCE(v_actualizada.comision_transf_banco_salida, 0),
      COALESCE(v_actualizada.comision_transf_inter_banco_salida, 0),
      COALESCE(v_actualizada.monto_itf_salida, 0),
      v_actualizada.id_empresa_salida,
      v_actualizada.id_empresa_cuenta_salida,
      v_actualizada.id_banco_empresa_cuenta_salida,
      v_actualizada.id_banco_cliente_transferencia
    );

    UPDATE public.tb_operacion_proceso
    SET comision_servicio = (v_calc_recurrente->>'comision_servicio')::numeric,
        monto_minimo_deposito_servicio = (v_calc_recurrente->>'monto_minimo_deposito_servicio')::numeric,
        comision_minima_servicio = (v_calc_recurrente->>'comision_minima_servicio')::numeric,
        comision_monto_extra_servicio = (v_calc_recurrente->>'comision_monto_extra_servicio')::numeric,
        resultado_comision_servicio = (v_calc_recurrente->>'resultado_comision_servicio')::numeric,
        monto_transferencia_cliente = (v_calc_recurrente->>'monto_transferencia_cliente')::numeric,
        resultado_comision_banco_ingreso = (v_calc_ing_recurrente->>'resultado_comision_banco_ingreso')::numeric,
        resultado_comision_banco_salida = (v_calc_sal_recurrente->>'resultado_comision_banco_salida')::numeric
    WHERE id = p_id;
  END IF;

  v_sync_result := public.f_post_tb_operacion_caja_desde_proceso(
    p_id_operacion_proceso := p_id,
    p_tipo_origen := NULL,
    p_tipo_movimiento := 'INGRESO',
    p_id_usuario := COALESCE(p_id_usuario_gestor, p_id_usuario, v_actualizada.id_usuario_gestor, v_actualizada.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, p_nombre_usuario, v_actualizada.nombre_usuario_gestor, v_actualizada.nombre_usuario),
    p_id_estado := v_actualizada.id_estado
  );

  IF v_sync_result ? 'error' THEN
    RETURN v_sync_result;
  END IF;

  IF UPPER(COALESCE(v_actualizada.nombre_estado, '')) = 'PAGADO'
     OR EXISTS (
       SELECT 1
       FROM public.tb_operacion_caja c
       WHERE c.id_operacion_proceso = p_id
         AND c.tipo_movimiento = 'SALIDA'
     ) THEN
    v_sync_result := public.f_post_tb_operacion_caja_desde_proceso(
      p_id_operacion_proceso := p_id,
      p_tipo_origen := NULL,
      p_tipo_movimiento := 'SALIDA',
      p_id_usuario := COALESCE(p_id_usuario_gestor, p_id_usuario, v_actualizada.id_usuario_gestor, v_actualizada.id_usuario),
      p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, p_nombre_usuario, v_actualizada.nombre_usuario_gestor, v_actualizada.nombre_usuario),
      p_id_estado := v_actualizada.id_estado
    );

    IF v_sync_result ? 'error' THEN
      RETURN v_sync_result;
    END IF;
  END IF;

  IF v_ruta_actual IS NOT NULL THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(
      v_ruta_actual,
      COALESCE(p_id_usuario_gestor, p_id_usuario, v_actual.id_usuario_gestor, v_actual.id_usuario)
    );
  END IF;

  IF v_ruta_final IS DISTINCT FROM v_ruta_actual THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(
      v_ruta_final,
      COALESCE(p_id_usuario_gestor, p_id_usuario, v_actual.id_usuario_gestor, v_actual.id_usuario)
    );
  END IF;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_comision_recurrente(
  p_id bigint,
  p_tipo_comision character varying,
  p_valor numeric DEFAULT NULL,
  p_limpiar boolean DEFAULT false,
  p_ruta_actual character varying DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_op record;
  v_cliente_id bigint;
  v_regla record;
  v_calc jsonb;
  v_calc_ing jsonb;
  v_calc_sal jsonb;
  v_sync_result jsonb;
  v_tipo character varying := LOWER(BTRIM(COALESCE(p_tipo_comision, '')));
BEGIN
  SELECT * INTO v_op FROM public.tb_operacion_proceso WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'La operacion no existe.'); END IF;
  IF UPPER(BTRIM(COALESCE(v_op.tipo_servicio, ''))) <> 'EFECTIVIZACION'
     OR LOWER(BTRIM(COALESCE(v_op.ruta_origen, v_op.ruta_destino, ''))) NOT IN ('bcp','bbva','scotiabank','banbif','interbank','safetypay') THEN
    RETURN jsonb_build_object('error', 'La comision recurrente solo aplica a Efectivizacion bancaria.');
  END IF;
  IF UPPER(BTRIM(COALESCE(v_op.nombre_estado, ''))) IN ('PAGADO','ELIMINADO') OR COALESCE(v_op.flag_retenido, false) THEN
    RETURN jsonb_build_object('error', 'La operacion no permite modificar comisiones recurrentes.');
  END IF;
  IF COALESCE(v_op.flag_derivado, false) AND p_ruta_actual IS NOT NULL
     AND LOWER(BTRIM(COALESCE(v_op.ruta_origen, ''))) = LOWER(BTRIM(p_ruta_actual))
     AND LOWER(BTRIM(COALESCE(v_op.ruta_destino, ''))) <> LOWER(BTRIM(p_ruta_actual)) THEN
    RETURN jsonb_build_object('error', 'La operacion derivada esta congelada en la ruta de origen.');
  END IF;
  IF v_tipo NOT IN ('especial','extra') THEN RETURN jsonb_build_object('error', 'Tipo de comision recurrente invalido.'); END IF;
  IF NOT p_limpiar AND p_valor IS NULL THEN RETURN jsonb_build_object('error', 'Ingresa un valor o utiliza la opcion de limpiar.'); END IF;
  IF NOT p_limpiar AND p_valor < 0 THEN RETURN jsonb_build_object('error', 'La comision recurrente debe ser mayor o igual a 0.'); END IF;
  IF v_tipo = 'extra' AND NOT p_limpiar AND p_valor <> trunc(p_valor) THEN RETURN jsonb_build_object('error', 'La comision extra recurrente debe ser un monto entero en soles.'); END IF;
  v_cliente_id := v_op.id_cliente;
  IF v_cliente_id IS NULL THEN
    SELECT c.id INTO v_cliente_id
    FROM public.tb_cliente c
    WHERE c.numero_documento = REGEXP_REPLACE(COALESCE(v_op.dni_cliente, ''), '[^0-9]', '', 'g')
      AND c.tipo_documento = CASE WHEN LENGTH(REGEXP_REPLACE(COALESCE(v_op.dni_cliente, ''), '[^0-9]', '', 'g')) = 9 THEN 2 ELSE 1 END
    LIMIT 1;
  END IF;
  IF v_cliente_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.tb_cliente WHERE id = v_cliente_id) THEN
    RETURN jsonb_build_object('error', 'La operacion no tiene un cliente relacionado.');
  END IF;

  SELECT r.* INTO v_regla
  FROM public.tb_reglas_efectivizacion r
  WHERE r.id_codigo_servicio = v_op.id_codigo_servicio
    AND r.id_banco = v_op.id_banco_empresa_cuenta_ingreso
    AND r.id_comunidad = v_op.id_comunidad
    AND (v_op.nombre_tipo_deposito IS NULL OR r.tipo_deposito = v_op.nombre_tipo_deposito)
    AND r.id_estado = (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1)
  LIMIT 1;
  IF v_regla.id IS NULL THEN RETURN jsonb_build_object('error', 'No se encontro una regla activa para recalcular la operacion.'); END IF;

  IF v_tipo = 'especial' THEN
    UPDATE public.tb_cliente SET comision_servicio_recurrente = CASE WHEN p_limpiar THEN NULL ELSE p_valor END, id_usuario = COALESCE(p_id_usuario_gestor, id_usuario) WHERE id = v_cliente_id;
  ELSE
    UPDATE public.tb_cliente SET comision_monto_extra_servicio_recurrente = CASE WHEN p_limpiar THEN NULL ELSE p_valor END, id_usuario = COALESCE(p_id_usuario_gestor, id_usuario) WHERE id = v_cliente_id;
  END IF;

  v_calc := public.f_get_tb_operacion_comision_efectivizacion_cliente(v_cliente_id, COALESCE(v_op.monto_deposito_cliente,0), v_regla.comision_servicio, v_regla.monto_minimo_deposito_servicio, v_regla.comision_minima_servicio);
  v_calc_ing := public.f_get_tb_operacion_calculo_comision_banco_ingreso(COALESCE(v_op.flag_por_sol_comision_banco_ingreso,false), COALESCE(v_op.monto_deposito_cliente,0), COALESCE(v_op.comision_banco_ingreso,0), COALESCE(v_op.comision_minimo_banco_ingreso,0), COALESCE(v_op.comision_igv_banco_ingreso,0), COALESCE(v_op.monto_itf_ingreso,0));
  v_calc_sal := public.f_get_tb_operacion_calculo_comision_banco_salida((v_calc->>'monto_transferencia_cliente')::numeric, COALESCE(v_op.comision_transf_banco_salida,0), COALESCE(v_op.comision_transf_inter_banco_salida,0), COALESCE(v_op.monto_itf_salida,0), v_op.id_empresa_salida, v_op.id_empresa_cuenta_salida, v_op.id_banco_empresa_cuenta_salida, v_op.id_banco_cliente_transferencia);
  UPDATE public.tb_operacion_proceso SET
    comision_servicio = (v_calc->>'comision_servicio')::numeric,
    monto_minimo_deposito_servicio = (v_calc->>'monto_minimo_deposito_servicio')::numeric,
    comision_minima_servicio = (v_calc->>'comision_minima_servicio')::numeric,
    comision_monto_extra_servicio = (v_calc->>'comision_monto_extra_servicio')::numeric,
    resultado_comision_servicio = (v_calc->>'resultado_comision_servicio')::numeric,
    monto_transferencia_cliente = (v_calc->>'monto_transferencia_cliente')::numeric,
    resultado_comision_banco_ingreso = (v_calc_ing->>'resultado_comision_banco_ingreso')::numeric,
    resultado_comision_banco_salida = (v_calc_sal->>'resultado_comision_banco_salida')::numeric,
    id_usuario = COALESCE(p_id_usuario_gestor,id_usuario), nombre_usuario = COALESCE(p_nombre_usuario_gestor,nombre_usuario)
  WHERE id = p_id;

  v_sync_result := public.f_post_tb_operacion_caja_desde_proceso(
    p_id_operacion_proceso := p_id,
    p_tipo_origen := NULL,
    p_tipo_movimiento := 'INGRESO',
    p_id_usuario := COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
    p_id_estado := v_op.id_estado
  );
  IF v_sync_result ? 'error' THEN
    RAISE EXCEPTION '%', v_sync_result->>'error';
  END IF;

  IF UPPER(COALESCE(v_op.nombre_estado, '')) = 'PAGADO'
     OR EXISTS (SELECT 1 FROM public.tb_operacion_caja c WHERE c.id_operacion_proceso = p_id AND c.tipo_movimiento = 'SALIDA') THEN
    v_sync_result := public.f_post_tb_operacion_caja_desde_proceso(
      p_id_operacion_proceso := p_id,
      p_tipo_origen := NULL,
      p_tipo_movimiento := 'SALIDA',
      p_id_usuario := COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario),
      p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_op.nombre_usuario_gestor, v_op.nombre_usuario),
      p_id_estado := v_op.id_estado
    );
    IF v_sync_result ? 'error' THEN
      RAISE EXCEPTION '%', v_sync_result->>'error';
    END IF;
  END IF;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(COALESCE(v_op.ruta_destino, v_op.ruta_origen), COALESCE(p_id_usuario_gestor, v_op.id_usuario_gestor, v_op.id_usuario));
  RETURN (SELECT x FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x LIMIT 1);
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_estado
Objetivo:
  Actualizar el estado operativo y sus campos de seguimiento.

Nota:
  - aun cuando el estado cambie a pagado, en esta fase no se debe tocar caja
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_estado(
  p_id bigint,
  p_id_estado bigint DEFAULT NULL,
  p_nombre_estado character varying DEFAULT NULL,
  p_fecha_pendiente timestamp with time zone DEFAULT NULL,
  p_fecha_pagado timestamp with time zone DEFAULT NULL,
  p_error_motivo character varying DEFAULT NULL,
  p_observacion_tiempo text DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_ruta_kpi character varying;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1;

  UPDATE public.tb_operacion_proceso
  SET id_estado = COALESCE(p_id_estado, id_estado),
      nombre_estado = COALESCE(p_nombre_estado, nombre_estado),
      fecha_pendiente = COALESCE(p_fecha_pendiente, fecha_pendiente),
      fecha_pagado = COALESCE(p_fecha_pagado, fecha_pagado),
      error_motivo = COALESCE(p_error_motivo, error_motivo),
      observacion_tiempo = COALESCE(p_observacion_tiempo, observacion_tiempo),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  v_ruta_kpi := COALESCE(v_actual.ruta_destino, v_actual.ruta_origen);
  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi, COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario));

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_comision_extra
Objetivo:
  Aplicar una comision extra ya recalculada por el flujo de negocio.

Nota:
  La funcion persiste tanto el monto extra como los resultados monetarios
  congelados resultantes del nuevo calculo.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_comision_extra(
  p_id bigint,
  p_comision_monto_extra_servicio numeric,
  p_resultado_comision_servicio numeric DEFAULT NULL,
  p_resultado_comision_banco_ingreso numeric DEFAULT NULL,
  p_resultado_comision_banco_salida numeric DEFAULT NULL,
  p_monto_transferencia_cliente numeric DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_calc jsonb;
  v_ruta_kpi character varying;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1;

  IF v_actual.id IS NULL THEN
    RAISE EXCEPTION 'No existe la operacion %.', p_id;
  END IF;

  v_calc := public.f_get_tb_operacion_proceso_calculo(
    v_actual.monto_deposito_cliente,
    v_actual.comision_servicio,
    v_actual.monto_minimo_deposito_servicio,
    v_actual.comision_minima_servicio,
    p_comision_monto_extra_servicio,
    v_actual.flag_por_sol_comision_banco_ingreso,
    v_actual.comision_banco_ingreso,
    v_actual.comision_minimo_banco_ingreso,
    v_actual.comision_igv_banco_ingreso,
    v_actual.monto_itf_ingreso,
    v_actual.comision_transf_banco_salida,
    v_actual.comision_transf_inter_banco_salida,
    v_actual.monto_itf_salida,
    v_actual.id_empresa_salida,
    v_actual.id_empresa_cuenta_salida,
    v_actual.id_banco_empresa_cuenta_salida,
    v_actual.id_banco_cliente_transferencia
  );

  UPDATE public.tb_operacion_proceso
  SET comision_monto_extra_servicio = p_comision_monto_extra_servicio,
      resultado_comision_servicio = (v_calc->>'resultado_comision_servicio')::numeric,
      resultado_comision_banco_ingreso = (v_calc->>'resultado_comision_banco_ingreso')::numeric,
      resultado_comision_banco_salida = (v_calc->>'resultado_comision_banco_salida')::numeric,
      monto_transferencia_cliente = (v_calc->>'monto_transferencia_cliente')::numeric,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  v_ruta_kpi := COALESCE(v_actual.ruta_destino, v_actual.ruta_origen);
  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi, COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario));

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_usuario
Objetivo:
  Reasignar responsable operativo de una operacion.

Nota:
  - la reasignacion conserva la misma fila snapshot
  - no genera ningun side effect contable
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_usuario(
  p_id bigint,
  p_id_usuario_gestor bigint,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tb_operacion_proceso
  SET id_usuario_gestor = p_id_usuario_gestor,
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor),
      id_usuario_reasignado = p_id_usuario_gestor,
      nombre_usuario_reasignado = COALESCE(p_nombre_usuario_gestor, nombre_usuario_reasignado)
  WHERE id = p_id;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_derivacion
Objetivo:
  Persistir la metadata de derivacion de una operacion sin tocar todavia caja.

Regla:
  - la derivacion mueve la responsabilidad operativa de la misma fila
  - no crea una segunda operacion
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_derivacion(
  p_id bigint,
  p_ruta_origen character varying DEFAULT NULL,
  p_ruta_destino character varying DEFAULT NULL,
  p_flag_derivado boolean DEFAULT true,
  p_fecha_derivacion timestamp with time zone DEFAULT now(),
  p_id_usuario_deriva bigint DEFAULT NULL,
  p_nombre_usuario_deriva character varying DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_destino_cuenta record;
  v_tiene_cuenta_destino boolean := false;
  v_calc_salida jsonb;
  v_resultado_comision_banco_salida numeric;
  v_ruta_actual character varying;
  v_ruta_final character varying;
  v_es_primera_derivacion boolean := false;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion no existe.');
  END IF;

  IF UPPER(BTRIM(COALESCE(v_actual.nombre_estado, ''))) <> 'PENDIENTE' THEN
    RETURN jsonb_build_object('error', 'Solo se pueden derivar operaciones en estado Pendiente.');
  END IF;

  IF COALESCE(v_actual.flag_retenido, false) THEN
    RETURN jsonb_build_object('error', 'No se puede derivar una operacion retenida.');
  END IF;

  v_es_primera_derivacion := NOT COALESCE(v_actual.flag_derivado, false)
    AND v_actual.id_empresa_salida_origen IS NULL;

  v_ruta_actual := COALESCE(v_actual.ruta_destino, v_actual.ruta_origen);
  v_ruta_final := COALESCE(p_ruta_destino, p_ruta_origen, v_actual.ruta_destino, v_actual.ruta_origen);

  IF COALESCE(p_ruta_destino, '') <> '' THEN
    SELECT
      rc.id_empresa,
      e.nombre AS nombre_empresa,
      rc.id_empresa_cuenta_bancaria,
      ecb.id_banco,
      b.nombre AS nombre_banco
    INTO v_destino_cuenta
    FROM public.tb_ruta_operacion_caja rc
    JOIN public.tb_empresa e ON e.id = rc.id_empresa
    JOIN public.tb_empresa_cuenta_bancaria ecb ON ecb.id = rc.id_empresa_cuenta_bancaria
    JOIN public.tb_banco b ON b.id = ecb.id_banco
    WHERE rc.ruta = p_ruta_destino
      AND rc.id_estado = 1
      AND ecb.id_estado = 1
    ORDER BY rc.flag_caja_ingreso_principal DESC, rc.id ASC
    LIMIT 1;

    v_tiene_cuenta_destino := FOUND;
  END IF;

  IF COALESCE(p_ruta_destino, '') <> '' AND NOT v_tiene_cuenta_destino THEN
    RETURN jsonb_build_object('error', 'La ruta destino no tiene una caja operativa activa.');
  END IF;

  IF v_tiene_cuenta_destino THEN
    v_calc_salida := public.f_get_tb_operacion_calculo_comision_banco_salida(
      COALESCE(v_actual.monto_transferencia_cliente, 0),
      COALESCE(v_actual.comision_transf_banco_salida, 0),
      COALESCE(v_actual.comision_transf_inter_banco_salida, 0),
      COALESCE(v_actual.monto_itf_salida, 0),
      v_destino_cuenta.id_empresa,
      v_destino_cuenta.id_empresa_cuenta_bancaria,
      v_destino_cuenta.id_banco,
      v_destino_cuenta.id_banco
    );

    v_resultado_comision_banco_salida := (v_calc_salida->>'resultado_comision_banco_salida')::numeric;
  END IF;

  UPDATE public.tb_operacion_proceso
  SET ruta_origen = CASE
        WHEN v_es_primera_derivacion THEN COALESCE(p_ruta_origen, ruta_origen)
        ELSE ruta_origen
      END,
      ruta_destino = COALESCE(p_ruta_destino, ruta_destino),
      id_empresa_salida_origen = CASE WHEN v_es_primera_derivacion THEN id_empresa_salida ELSE id_empresa_salida_origen END,
      nombre_empresa_salida_origen = CASE WHEN v_es_primera_derivacion THEN nombre_empresa_salida ELSE nombre_empresa_salida_origen END,
      id_empresa_cuenta_salida_origen = CASE WHEN v_es_primera_derivacion THEN id_empresa_cuenta_salida ELSE id_empresa_cuenta_salida_origen END,
      id_banco_empresa_cuenta_salida_origen = CASE WHEN v_es_primera_derivacion THEN id_banco_empresa_cuenta_salida ELSE id_banco_empresa_cuenta_salida_origen END,
      nombre_banco_empresa_cuenta_salida_origen = CASE WHEN v_es_primera_derivacion THEN nombre_banco_empresa_cuenta_salida ELSE nombre_banco_empresa_cuenta_salida_origen END,
      id_empresa_salida = CASE WHEN v_tiene_cuenta_destino THEN v_destino_cuenta.id_empresa ELSE id_empresa_salida END,
      nombre_empresa_salida = CASE WHEN v_tiene_cuenta_destino THEN v_destino_cuenta.nombre_empresa ELSE nombre_empresa_salida END,
      id_empresa_cuenta_salida = CASE WHEN v_tiene_cuenta_destino THEN v_destino_cuenta.id_empresa_cuenta_bancaria ELSE id_empresa_cuenta_salida END,
      id_banco_empresa_cuenta_salida = CASE WHEN v_tiene_cuenta_destino THEN v_destino_cuenta.id_banco ELSE id_banco_empresa_cuenta_salida END,
      nombre_banco_empresa_cuenta_salida = CASE WHEN v_tiene_cuenta_destino THEN v_destino_cuenta.nombre_banco ELSE nombre_banco_empresa_cuenta_salida END,
      id_banco_cliente_transferencia = CASE WHEN v_tiene_cuenta_destino THEN v_destino_cuenta.id_banco ELSE id_banco_cliente_transferencia END,
      nombre_banco_cliente_transferencia = CASE WHEN v_tiene_cuenta_destino THEN v_destino_cuenta.nombre_banco ELSE nombre_banco_cliente_transferencia END,
      resultado_comision_banco_salida = CASE WHEN v_tiene_cuenta_destino THEN COALESCE(v_resultado_comision_banco_salida, resultado_comision_banco_salida) ELSE resultado_comision_banco_salida END,
      flag_derivado = COALESCE(p_flag_derivado, flag_derivado),
      fecha_derivacion = COALESCE(p_fecha_derivacion, fecha_derivacion, now()),
      id_usuario_deriva = COALESCE(p_id_usuario_deriva, id_usuario_deriva),
      nombre_usuario_deriva = COALESCE(p_nombre_usuario_deriva, nombre_usuario_deriva),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_actual, COALESCE(p_id_usuario_gestor, p_id_usuario_deriva, v_actual.id_usuario_gestor, v_actual.id_usuario));
  IF v_ruta_final IS DISTINCT FROM v_ruta_actual THEN
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_final, COALESCE(p_id_usuario_gestor, p_id_usuario_deriva, v_actual.id_usuario_gestor, v_actual.id_usuario));
  END IF;

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_retencion
Objetivo:
  Marcar o desmarcar la retencion de una operacion con trazabilidad propia.

Regla:
  - la retencion es un flag operativo del snapshot
  - no genera asientos ni movimientos en esta fase
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_retencion(
  p_id bigint,
  p_flag_retenido boolean DEFAULT true,
  p_fecha_retencion timestamp with time zone DEFAULT now(),
  p_id_usuario_retiene bigint DEFAULT NULL,
  p_nombre_usuario_retiene character varying DEFAULT NULL,
  p_motivo_retencion text DEFAULT NULL,
  p_id_estado bigint DEFAULT NULL,
  p_nombre_estado character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_ruta_kpi character varying;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1;

  UPDATE public.tb_operacion_proceso
  SET flag_retenido = COALESCE(p_flag_retenido, flag_retenido),
      fecha_retencion = CASE
        WHEN COALESCE(p_flag_retenido, flag_retenido) THEN COALESCE(p_fecha_retencion, fecha_retencion, now())
        ELSE NULL
      END,
      id_usuario_retiene = CASE
        WHEN COALESCE(p_flag_retenido, flag_retenido) THEN COALESCE(p_id_usuario_retiene, id_usuario_retiene)
        ELSE NULL
      END,
      nombre_usuario_retiene = CASE
        WHEN COALESCE(p_flag_retenido, flag_retenido) THEN COALESCE(p_nombre_usuario_retiene, nombre_usuario_retiene)
        ELSE NULL
      END,
      motivo_retencion = CASE
        WHEN COALESCE(p_flag_retenido, flag_retenido) THEN COALESCE(p_motivo_retencion, motivo_retencion)
        ELSE NULL
      END,
      id_estado = COALESCE(p_id_estado, id_estado),
      nombre_estado = COALESCE(p_nombre_estado, nombre_estado)
  WHERE id = p_id;

  v_ruta_kpi := COALESCE(v_actual.ruta_destino, v_actual.ruta_origen);
  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi, COALESCE(p_id_usuario_retiene, v_actual.id_usuario_retiene, v_actual.id_usuario));

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_empresa
Objetivo:
  Cambiar la empresa y los datos asociados de ingreso/salida para una operacion
  ya recalculada.

Uso esperado:
  - cambio de empresa desde acciones de datatable
  - ajustes de ruta operativa sin tocar todavia caja

Nota:
  - la operacion conserva el mismo snapshot comercial
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_empresa(
  p_id bigint,
  p_id_empresa_ingreso bigint DEFAULT NULL,
  p_nombre_empresa_ingreso character varying DEFAULT NULL,
  p_id_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_ingreso bigint DEFAULT NULL,
  p_nombre_banco_empresa_cuenta_ingreso character varying DEFAULT NULL,
  p_id_empresa_salida bigint DEFAULT NULL,
  p_nombre_empresa_salida character varying DEFAULT NULL,
  p_id_empresa_cuenta_salida bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_salida bigint DEFAULT NULL,
  p_nombre_banco_empresa_cuenta_salida character varying DEFAULT NULL,
  p_nombre_codigo_servicio character varying DEFAULT NULL,
  p_resultado_comision_banco_ingreso numeric DEFAULT NULL,
  p_resultado_comision_servicio numeric DEFAULT NULL,
  p_resultado_comision_banco_salida numeric DEFAULT NULL,
  p_monto_transferencia_cliente numeric DEFAULT NULL,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_ruta_kpi character varying;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1;

  UPDATE public.tb_operacion_proceso
  SET id_empresa_ingreso = COALESCE(p_id_empresa_ingreso, id_empresa_ingreso),
      nombre_empresa_ingreso = COALESCE(p_nombre_empresa_ingreso, nombre_empresa_ingreso),
      id_empresa_cuenta_ingreso = COALESCE(p_id_empresa_cuenta_ingreso, id_empresa_cuenta_ingreso),
      id_banco_empresa_cuenta_ingreso = COALESCE(p_id_banco_empresa_cuenta_ingreso, id_banco_empresa_cuenta_ingreso),
      nombre_banco_empresa_cuenta_ingreso = COALESCE(p_nombre_banco_empresa_cuenta_ingreso, nombre_banco_empresa_cuenta_ingreso),
      id_empresa_salida = COALESCE(p_id_empresa_salida, id_empresa_salida),
      nombre_empresa_salida = COALESCE(p_nombre_empresa_salida, nombre_empresa_salida),
      id_empresa_cuenta_salida = COALESCE(p_id_empresa_cuenta_salida, id_empresa_cuenta_salida),
      id_banco_empresa_cuenta_salida = COALESCE(p_id_banco_empresa_cuenta_salida, id_banco_empresa_cuenta_salida),
      nombre_banco_empresa_cuenta_salida = COALESCE(p_nombre_banco_empresa_cuenta_salida, nombre_banco_empresa_cuenta_salida),
      nombre_codigo_servicio = COALESCE(p_nombre_codigo_servicio, nombre_codigo_servicio),
      resultado_comision_banco_ingreso = COALESCE(p_resultado_comision_banco_ingreso, resultado_comision_banco_ingreso),
      resultado_comision_servicio = COALESCE(p_resultado_comision_servicio, resultado_comision_servicio),
      resultado_comision_banco_salida = COALESCE(p_resultado_comision_banco_salida, resultado_comision_banco_salida),
      monto_transferencia_cliente = COALESCE(p_monto_transferencia_cliente, monto_transferencia_cliente),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  v_ruta_kpi := COALESCE(v_actual.ruta_destino, v_actual.ruta_origen);
  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi, COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario));

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_pagado
Objetivo:
  Marcar una operacion como pagada y asegurar el impacto de caja.

Regla de fase:
  - para POS: solo genera SALIDA (no tiene ingreso porque es solicitud)
  - para efectivizacion: asegura INGRESO + SALIDA
  - la funcion de caja es idempotente por id_operacion_proceso + tipo_movimiento
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_pagado(
  p_id bigint,
  p_id_estado bigint,
  p_nombre_estado character varying,
  p_fecha_pagado timestamp with time zone DEFAULT now(),
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_ruta_kpi character varying;
  v_ingreso_result jsonb;
  v_salida_result jsonb;
  v_estado_retenido_id bigint;
  v_tiene_ingreso boolean := false;
  v_tiene_salida boolean := false;
  v_es_pos boolean := false;
  v_aplica_validacion_saldo boolean := false;
  v_caja_salida record;
  v_saldo_disponible numeric := 0;
  v_monto_requerido numeric := 0;
  v_salida_abierta numeric := 0;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1
  FOR UPDATE;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion no existe.');
  END IF;

  v_es_pos := UPPER(COALESCE(v_actual.tipo_servicio, '')) = 'POS';
  v_aplica_validacion_saldo := UPPER(BTRIM(COALESCE(v_actual.tipo_servicio, ''))) IN ('EFECTIVIZACION', 'POS');

  SELECT id
  INTO v_estado_retenido_id
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'RETENIDO'
  LIMIT 1;

  /*
    La salida debe validarse antes de marcar la operacion como Pagado.
    El bloqueo de la caja mantiene consistente esta validacion frente a
    pagos concurrentes y replica el ajuste de idempotencia de la funcion
    de movimientos para una salida abierta ya existente.
  */
  IF v_aplica_validacion_saldo THEN
    SELECT c.id, c.saldo_actual
    INTO v_caja_salida
    FROM public.tb_caja_operativa c
    WHERE c.id_empresa = v_actual.id_empresa_salida
      AND c.id_empresa_cuenta_bancaria = v_actual.id_empresa_cuenta_salida
    LIMIT 1
    FOR UPDATE;

    IF v_caja_salida.id IS NULL THEN
      RETURN jsonb_build_object('error', 'No existe caja inicial para la empresa y cuenta de salida de la operacion.');
    END IF;

    v_monto_requerido := COALESCE(v_actual.monto_transferencia_cliente, v_actual.monto_deposito_cliente, 0);

    SELECT COALESCE(SUM(c.monto_salida), 0)
    INTO v_salida_abierta
    FROM public.tb_operacion_caja c
    WHERE c.id_operacion_proceso = p_id
      AND UPPER(BTRIM(COALESCE(c.tipo_movimiento, ''))) = 'SALIDA'
      AND c.id_caja = v_caja_salida.id
      AND c.id_caja_cierre IS NULL;

    v_saldo_disponible := COALESCE(v_caja_salida.saldo_actual, 0) + v_salida_abierta;

    IF v_saldo_disponible < v_monto_requerido THEN
      RETURN jsonb_build_object(
        'error', 'Saldo insuficiente en caja actual.',
        'codigo', 'SALDO_INSUFICIENTE',
        'id_caja', v_caja_salida.id,
        'saldo_disponible', v_saldo_disponible,
        'monto_requerido', v_monto_requerido
      );
    END IF;
  END IF;

  UPDATE public.tb_operacion_proceso
  SET id_estado = p_id_estado,
      nombre_estado = p_nombre_estado,
      fecha_pagado = COALESCE(p_fecha_pagado, now()),
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja c
    WHERE c.id_operacion_proceso = p_id
      AND c.tipo_movimiento = 'INGRESO'
      AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
  )
  INTO v_tiene_ingreso;

  SELECT EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja c
    WHERE c.id_operacion_proceso = p_id
      AND c.tipo_movimiento = 'SALIDA'
  )
  INTO v_tiene_salida;

  IF v_es_pos THEN
    IF NOT v_tiene_salida THEN
      v_salida_result := public.f_post_tb_operacion_caja_desde_proceso(
        p_id_operacion_proceso := p_id,
        p_tipo_origen := 'POS',
        p_tipo_movimiento := 'SALIDA',
        p_id_usuario := COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario),
        p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_actual.nombre_usuario_gestor, v_actual.nombre_usuario),
        p_id_estado := p_id_estado
      );

      IF v_salida_result ? 'error' THEN
        RETURN v_salida_result;
      END IF;
    END IF;
  ELSE
    IF COALESCE(v_actual.flag_retenido, false) THEN
      IF NOT v_tiene_ingreso THEN
        v_ingreso_result := public.f_post_tb_operacion_caja_desde_proceso(
          p_id_operacion_proceso := p_id,
          p_tipo_origen := 'EFECTIVIZACION',
          p_tipo_movimiento := 'INGRESO',
          p_id_usuario := COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario),
          p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_actual.nombre_usuario_gestor, v_actual.nombre_usuario),
          p_id_estado := COALESCE(v_estado_retenido_id, p_id_estado)
        );

        IF v_ingreso_result ? 'error' THEN
          RETURN v_ingreso_result;
        END IF;
      END IF;
    ELSE
      v_ingreso_result := public.f_post_tb_operacion_caja_desde_proceso(
        p_id_operacion_proceso := p_id,
        p_tipo_origen := 'EFECTIVIZACION',
        p_tipo_movimiento := 'INGRESO',
        p_id_usuario := COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario),
        p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_actual.nombre_usuario_gestor, v_actual.nombre_usuario),
        p_id_estado := p_id_estado
      );

      IF v_ingreso_result ? 'error' THEN
        RETURN v_ingreso_result;
      END IF;
    END IF;

    v_salida_result := public.f_post_tb_operacion_caja_desde_proceso(
      p_id_operacion_proceso := p_id,
      p_tipo_origen := 'EFECTIVIZACION',
      p_tipo_movimiento := 'SALIDA',
      p_id_usuario := COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario),
      p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_actual.nombre_usuario_gestor, v_actual.nombre_usuario),
      p_id_estado := p_id_estado
    );

    IF v_salida_result ? 'error' THEN
      RETURN v_salida_result;
    END IF;
  END IF;

  v_ruta_kpi := COALESCE(v_actual.ruta_destino, v_actual.ruta_origen);
  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi, COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario));

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_pagado_lote
Objetivo:
  Marcar como pagadas varias operaciones de Efectivizacion en una sola RPC.

Reglas:
  - bloquea las filas en un orden estable para evitar carreras entre usuarios;
  - valida todo el lote antes de modificar operaciones o caja;
  - si una operacion entra en conflicto, rechaza el lote completo;
  - reutiliza la logica de pago individual para conservar los movimientos actuales.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_pagado_lote(
  p_ids_operaciones jsonb,
  p_id_estado bigint,
  p_nombre_estado character varying,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ids bigint[];
  v_id bigint;
  v_actual record;
  v_caja_salida record;
  v_result jsonb;
  v_actualizadas jsonb := '[]'::jsonb;
  v_detalle jsonb := '[]'::jsonb;
  v_ruta character varying;
  v_saldo_disponible numeric := 0;
  v_monto_requerido numeric := 0;
  v_salida_abierta numeric := 0;
  v_cantidad_bloque bigint := 0;
  v_bloqueos_saldo jsonb := '[]'::jsonb;
  v_bloqueo_saldo jsonb;
BEGIN
  IF p_ids_operaciones IS NULL OR jsonb_typeof(p_ids_operaciones) <> 'array' THEN
    RETURN jsonb_build_object(
      'error', 'p_ids_operaciones debe ser un arreglo JSON.'
    );
  END IF;

  SELECT array_agg(DISTINCT value::bigint ORDER BY value::bigint)
  INTO v_ids
  FROM jsonb_array_elements_text(p_ids_operaciones) AS item(value);

  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object(
      'error', 'No se recibieron operaciones para pagar.'
    );
  END IF;

  /* Primero se bloquean y validan todas las filas; todavia no se modifica nada. */
  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT *
    INTO v_actual
    FROM public.tb_operacion_proceso
    WHERE id = v_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'id', v_id,
        'motivo', 'La operacion no existe.'
      ));
      CONTINUE;
    END IF;

    v_ruta := LOWER(BTRIM(COALESCE(v_actual.ruta_destino, v_actual.ruta_origen, '')));

    IF UPPER(BTRIM(COALESCE(v_actual.tipo_servicio, ''))) <> 'EFECTIVIZACION' THEN
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'id', v_id,
        'motivo', 'La operacion no pertenece a Efectivizacion.'
      ));
    ELSIF UPPER(BTRIM(COALESCE(v_actual.nombre_estado, ''))) <> 'PENDIENTE'
       OR v_actual.id_estado = 10 THEN
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'id', v_id,
        'motivo', 'La operacion ya no se encuentra en estado Pendiente.'
      ));
    ELSIF v_actual.id_caja_cierre IS NOT NULL THEN
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'id', v_id,
        'motivo', 'La operacion ya pertenece a un cierre de caja.'
      ));
    ELSIF v_ruta NOT IN ('bcp', 'bbva', 'scotiabank', 'banbif', 'interbank', 'safetypay') THEN
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'id', v_id,
        'motivo', 'La ruta de la operacion no es una ruta bancaria valida.'
      ));
    ELSIF v_actual.id_empresa_cuenta_salida IS NULL
       AND v_actual.id_empresa_cuenta_ingreso IS NULL THEN
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'id', v_id,
        'motivo', 'La operacion no tiene una cuenta operativa valida.'
      ));
    ELSE
      SELECT c.id
      INTO v_caja_salida
      FROM public.tb_caja_operativa c
      WHERE c.id_empresa = v_actual.id_empresa_salida
        AND c.id_empresa_cuenta_bancaria = v_actual.id_empresa_cuenta_salida
      LIMIT 1;

      IF v_caja_salida.id IS NULL THEN
        v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
          'id', v_id,
          'motivo', 'No existe caja inicial para la empresa y cuenta de salida de la operacion.'
        ));
      END IF;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_detalle) > 0 THEN
    RETURN jsonb_build_object(
      'error', 'No se pudo procesar el lote completo.',
      'detalle', v_detalle
    );
  END IF;

  /*
    La validacion del saldo se realiza por bloque y por caja. Primero se
    bloquean todas las cajas en orden estable; despues se compara la suma de
    las transferencias de cada caja contra su saldo actual. Asi ninguna
    operacion del lote puede avanzar parcialmente.
  */
  FOR v_caja_salida IN
    SELECT c.id, c.id_empresa, c.id_empresa_cuenta_bancaria, c.saldo_actual
    FROM public.tb_caja_operativa c
    WHERE c.id IN (
      SELECT DISTINCT cx.id
      FROM public.tb_operacion_proceso op
      JOIN public.tb_caja_operativa cx
        ON cx.id_empresa = op.id_empresa_salida
       AND cx.id_empresa_cuenta_bancaria = op.id_empresa_cuenta_salida
      WHERE op.id = ANY(v_ids)
        AND op.id_empresa_salida IS NOT NULL
        AND op.id_empresa_cuenta_salida IS NOT NULL
    )
    ORDER BY c.id
    FOR UPDATE
  LOOP
    SELECT
      COALESCE(SUM(COALESCE(op.monto_transferencia_cliente, op.monto_deposito_cliente, 0)), 0),
      COALESCE(SUM(COALESCE(salidas.monto_salida, 0)), 0),
      COUNT(*)
    INTO v_monto_requerido, v_salida_abierta, v_cantidad_bloque
    FROM public.tb_operacion_proceso op
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(oc.monto_salida), 0) AS monto_salida
      FROM public.tb_operacion_caja oc
      WHERE oc.id_operacion_proceso = op.id
        AND UPPER(BTRIM(COALESCE(oc.tipo_movimiento, ''))) = 'SALIDA'
        AND oc.id_caja = v_caja_salida.id
        AND oc.id_caja_cierre IS NULL
    ) salidas ON true
    WHERE op.id = ANY(v_ids)
      AND op.id_empresa_salida = v_caja_salida.id_empresa
      AND op.id_empresa_cuenta_salida = v_caja_salida.id_empresa_cuenta_bancaria;

    v_saldo_disponible := COALESCE(v_caja_salida.saldo_actual, 0) + v_salida_abierta;

    IF v_saldo_disponible < v_monto_requerido THEN
      v_bloqueos_saldo := v_bloqueos_saldo || jsonb_build_array(jsonb_build_object(
        'id_caja', v_caja_salida.id,
        'saldo_disponible', v_saldo_disponible,
        'monto_requerido', v_monto_requerido,
        'monto_faltante', v_monto_requerido - v_saldo_disponible,
        'cantidad_operaciones', v_cantidad_bloque
      ));
    END IF;
  END LOOP;

  IF jsonb_array_length(v_bloqueos_saldo) > 0 THEN
    IF jsonb_array_length(v_bloqueos_saldo) = 1 THEN
      v_bloqueo_saldo := v_bloqueos_saldo -> 0;

      RETURN jsonb_build_object(
        'error', 'Saldo insuficiente para procesar el bloque.',
        'codigo', 'SALDO_INSUFICIENTE_BLOQUE',
        'id_caja', v_bloqueo_saldo->'id_caja',
        'saldo_disponible', v_bloqueo_saldo->'saldo_disponible',
        'monto_requerido', v_bloqueo_saldo->'monto_requerido',
        'monto_faltante', v_bloqueo_saldo->'monto_faltante',
        'cantidad_operaciones', v_bloqueo_saldo->'cantidad_operaciones'
      );
    END IF;

    RETURN jsonb_build_object(
      'error', 'Saldo insuficiente para procesar el bloque.',
      'codigo', 'SALDO_INSUFICIENTE_BLOQUE',
      'detalle_cajas', v_bloqueos_saldo
    );
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    v_result := public.f_patch_tb_operacion_proceso_pagado(
      p_id := v_id,
      p_id_estado := p_id_estado,
      p_nombre_estado := p_nombre_estado,
      p_id_usuario_gestor := p_id_usuario_gestor,
      p_nombre_usuario_gestor := p_nombre_usuario_gestor
    );

    IF v_result ? 'error' THEN
      RAISE EXCEPTION 'No se pudo pagar la operacion %: %', v_id, v_result->>'error';
    END IF;

    v_actualizadas := v_actualizadas || jsonb_build_array(v_result);
  END LOOP;

  RETURN jsonb_build_object(
    'cantidad_procesada', array_length(v_ids, 1),
    'operaciones_actualizadas', v_actualizadas,
    'detalle', '[]'::jsonb
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_directo_caja
Objetivo:
  Clasificar una operacion de efectivizacion como ingreso directo a caja.

Regla:
  - marca la operacion como Pagado
  - genera/sincroniza solo el INGRESO
  - no genera SALIDA ni ganancia normal de efectivizacion
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_directo_caja(
  p_id bigint,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_estado_pagado_id bigint;
  v_estado_pagado_nombre character varying;
  v_ruta_kpi character varying;
  v_ingreso_result jsonb;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion no existe.');
  END IF;

  IF v_actual.id_caja_cierre IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'La operacion ya pertenece a un cierre de caja.');
  END IF;

  SELECT id, nombre
  INTO v_estado_pagado_id, v_estado_pagado_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PAGADO'
  LIMIT 1;

  IF v_estado_pagado_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No se encontro el estado Pagado.');
  END IF;

  UPDATE public.tb_operacion_proceso
  SET tipo_flujo_pago_deuda = 'DIRECTO_CAJA',
      id_estado = v_estado_pagado_id,
      nombre_estado = v_estado_pagado_nombre,
      fecha_pagado = COALESCE(fecha_pagado, NOW()),
      monto_transferencia_cliente = monto_deposito_cliente,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  v_ingreso_result := public.f_post_tb_operacion_caja_desde_proceso(
    p_id_operacion_proceso := p_id,
    p_tipo_origen := 'OTROS',
    p_tipo_movimiento := 'INGRESO',
    p_id_usuario := COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario),
    p_nombre_usuario := COALESCE(p_nombre_usuario_gestor, v_actual.nombre_usuario_gestor, v_actual.nombre_usuario),
    p_id_estado := v_estado_pagado_id
  );

  IF v_ingreso_result ? 'error' THEN
    RETURN v_ingreso_result;
  END IF;

  v_ruta_kpi := COALESCE(v_actual.ruta_destino, v_actual.ruta_origen);
  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi, COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario));

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_reanudar
Objetivo:
  Devolver una operacion pagada al flujo pendiente, revirtiendo el impacto de
  caja que se genero al pagar.

Regla:
  - no permite reiniciar operaciones con movimientos cerrados por caja
  - revierte y elimina SALIDAS abiertas asociadas a la operacion
  - conserva el INGRESO original de la carga y lo vuelve a estado pendiente
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_reanudar(
  p_id bigint,
  p_id_estado bigint,
  p_nombre_estado character varying,
  p_fecha_pendiente timestamp with time zone DEFAULT now(),
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_mov record;
  v_ruta_kpi character varying;
  v_id_usuario_final bigint;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion no existe.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja c
    WHERE c.id_operacion_proceso = p_id
      AND c.id_caja_cierre IS NOT NULL
      AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
  ) THEN
    RETURN jsonb_build_object('error', 'No se puede reiniciar una operacion con movimientos cerrados por caja.');
  END IF;

  v_id_usuario_final := COALESCE(p_id_usuario_gestor, v_actual.id_usuario_gestor, v_actual.id_usuario);

  FOR v_mov IN
    SELECT *
    FROM public.tb_operacion_caja c
    WHERE c.id_operacion_proceso = p_id
      AND UPPER(BTRIM(COALESCE(c.tipo_movimiento, ''))) = 'SALIDA'
      AND c.id_caja_cierre IS NULL
      AND c.tipo_origen <> 'PAGO_DEUDA_COMISION'
    ORDER BY c.id
  LOOP
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
      p_id_usuario := v_id_usuario_final
    );

    UPDATE public.tb_operacion_caja
    SET id_operacion_caja_relacionada = NULL
    WHERE id_operacion_caja_relacionada = v_mov.id;

    DELETE FROM public.tb_operacion_caja
    WHERE id = v_mov.id;
  END LOOP;

  UPDATE public.tb_operacion_caja
  SET id_estado = p_id_estado,
      nombre_estado = p_nombre_estado,
      id_usuario = COALESCE(v_id_usuario_final, id_usuario),
      nombre_usuario = COALESCE(p_nombre_usuario_gestor, nombre_usuario)
  WHERE id_operacion_proceso = p_id
    AND UPPER(BTRIM(COALESCE(tipo_movimiento, ''))) = 'INGRESO'
    AND id_caja_cierre IS NULL
    AND tipo_origen <> 'PAGO_DEUDA_COMISION';

  UPDATE public.tb_operacion_proceso
  SET id_estado = p_id_estado,
      nombre_estado = p_nombre_estado,
      fecha_pendiente = COALESCE(p_fecha_pendiente, now()),
      fecha_pagado = NULL,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  v_ruta_kpi := COALESCE(v_actual.ruta_destino, v_actual.ruta_origen);
  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta_kpi, v_id_usuario_final);
  PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(v_ruta_kpi, v_id_usuario_final);

  RETURN (
    SELECT x
    FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
    LIMIT 1
  );
END;
$$;

/*
Funcion: f_get_tb_parse_documento
Objetivo:
  Normalizar un documento desde texto libre y devolver su valor util y tipo.

Uso:
  - cargas Excel
  - procesos de parseo previos a crear cliente u operacion
*/
DROP FUNCTION IF EXISTS public.f_get_tb_parse_documento(text);

CREATE OR REPLACE FUNCTION public.f_get_tb_parse_documento(
  p_raw text,
  p_id_codigo_servicio bigint DEFAULT NULL
)
RETURNS TABLE(valor character varying, tipo character varying)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_digits varchar;
  v_candidate varchar;
  v_clean varchar;
BEGIN
  v_digits := REGEXP_REPLACE(COALESCE(p_raw, ''), '[^0-9]', '', 'g');

  IF LENGTH(v_digits) = 0 THEN
    RETURN QUERY SELECT NULL::varchar, 'DESCONOCIDO'::varchar;
    RETURN;
  END IF;

  v_candidate := RIGHT(v_digits, 11);
  IF LENGTH(v_candidate) = 11 AND LEFT(v_candidate, 1) IN ('1', '2') THEN
    RETURN QUERY SELECT v_candidate::varchar, 'RUC'::varchar;
    RETURN;
  END IF;

  v_clean := RIGHT(v_digits, 8);
  IF LENGTH(v_clean) < 8 THEN
    IF p_id_codigo_servicio = 3 THEN
      v_clean := LPAD(v_clean, 8, '0');
    ELSE
      v_clean := RPAD(v_clean, 8, '0');
    END IF;
  END IF;

  RETURN QUERY SELECT v_clean::varchar, 'DNI'::varchar;
END;
$$;

/*
Funcion: f_get_tb_parsear_fecha
Objetivo:
  Parsear fechas heterogeneas provenientes de flujos manuales o Excel.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_parsear_fecha(
  p_fecha text
)
RETURNS timestamp
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
AS $$
BEGIN
  p_fecha := TRIM(REGEXP_REPLACE(p_fecha, '[\r\n\t' || CHR(160) || ']', ' ', 'g'));

  IF p_fecha IS NULL OR p_fecha = '' THEN
    RETURN NULL;
  END IF;

  IF p_fecha ~ '^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}' THEN
    RETURN p_fecha::timestamp;
  END IF;

  IF p_fecha ~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN p_fecha::timestamp;
  END IF;

  IF p_fecha ~ '^\d{2}/\d{2}/\d{4} \d{2}:\d{2}' THEN
    RETURN TO_TIMESTAMP(p_fecha, 'DD/MM/YYYY HH24:MI:SS');
  END IF;

  IF p_fecha ~ '^\d{2}/\d{2}/\d{4}$' THEN
    RETURN TO_TIMESTAMP(p_fecha, 'DD/MM/YYYY');
  END IF;

  IF p_fecha ~ '^\d{2}-\d{2}-\d{4} \d{2}:\d{2}' THEN
    RETURN TO_TIMESTAMP(p_fecha, 'DD-MM-YYYY HH24:MI:SS');
  END IF;

  IF p_fecha ~ '^\d{2}-\d{2}-\d{4}$' THEN
    RETURN TO_TIMESTAMP(p_fecha, 'DD-MM-YYYY');
  END IF;

  RAISE EXCEPTION 'Formato de fecha no reconocido: %', p_fecha;
END;
$$;

/*
Funcion: f_get_tb_operacion_calculo_comision_servicio
Objetivo:
  Calcular la comision del servicio y el monto neto a transferir al cliente.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_calculo_comision_servicio(
  p_monto_deposito_cliente numeric,
  p_comision_servicio numeric,
  p_monto_minimo_deposito_servicio numeric,
  p_comision_minima_servicio numeric,
  p_comision_monto_extra_servicio numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_resultado numeric;
  v_transferencia numeric;
BEGIN
  IF p_monto_deposito_cliente < p_monto_minimo_deposito_servicio THEN
    v_resultado := COALESCE(p_comision_minima_servicio, 0);
  ELSE
    v_resultado := (COALESCE(p_comision_servicio, 0) / 100) * COALESCE(p_monto_deposito_cliente, 0);
  END IF;

  IF COALESCE(p_comision_monto_extra_servicio, 0) > 0 THEN
    v_resultado := v_resultado + p_comision_monto_extra_servicio;
  END IF;

  v_transferencia := COALESCE(p_monto_deposito_cliente, 0) - COALESCE(v_resultado, 0);

  RETURN jsonb_build_object(
    'resultado_comision_servicio', ROUND(COALESCE(v_resultado, 0), 2),
    'monto_transferencia_cliente', ROUND(COALESCE(v_transferencia, 0), 2)
  );
END;
$$;

/*
Funcion: f_get_tb_operacion_calculo_comision_banco_ingreso
Objetivo:
  Calcular la comision total del banco de ingreso usando ITF de la cuenta
  bancaria y regla aplicada.

Regla de ITF:
  El ITF se cobra por cada bloque completo de S/ 1,000.
  Cada bloque tiene un costo fijo de S/ 0.05; el excedente no se prorratea.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_calculo_comision_banco_ingreso(
  p_flag_por_sol_comision_banco_ingreso boolean,
  p_monto_deposito_cliente numeric,
  p_comision_banco_ingreso numeric,
  p_comision_minimo_banco_ingreso numeric DEFAULT 0,
  p_comision_igv_banco_ingreso numeric DEFAULT 0,
  p_monto_itf_ingreso numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_itf numeric;
  v_comision numeric;
  v_resultado numeric;
BEGIN
  v_itf := FLOOR(GREATEST(COALESCE(p_monto_deposito_cliente, 0), 0) / 1000) * 0.05;

  IF COALESCE(p_flag_por_sol_comision_banco_ingreso, false) THEN
    v_resultado := v_itf + COALESCE(p_comision_banco_ingreso, 0);
  ELSE
    v_resultado := v_itf;
    v_comision := (COALESCE(p_comision_banco_ingreso, 0) / 100) * COALESCE(p_monto_deposito_cliente, 0);

    IF v_comision <= COALESCE(p_comision_minimo_banco_ingreso, 0) THEN
      v_comision := COALESCE(p_comision_minimo_banco_ingreso, 0);
    END IF;

    v_resultado := v_resultado + v_comision;

    IF COALESCE(p_comision_igv_banco_ingreso, 0) > 0 THEN
      v_resultado := v_resultado + ((p_comision_igv_banco_ingreso / 100) * v_resultado);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'resultado_comision_banco_ingreso', ROUND(COALESCE(v_resultado, 0), 2)
  );
END;
$$;

/*
Funcion: f_get_tb_operacion_calculo_comision_banco_salida
Objetivo:
  Calcular la comision total del banco de salida usando la cuenta y el banco de
  transferencia elegido por el cliente.

Regla de ITF:
  El ITF se cobra por cada bloque completo de S/ 1,000.
  Cada bloque tiene un costo fijo de S/ 0.05; el excedente no se prorratea.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_calculo_comision_banco_salida(
  p_monto_transferencia_cliente numeric,
  p_comision_transf_banco_salida numeric DEFAULT 0,
  p_comision_transf_inter_banco_salida numeric DEFAULT 0,
  p_monto_itf_salida numeric DEFAULT 0,
  p_id_empresa_salida bigint DEFAULT NULL,
  p_id_empresa_cuenta_salida bigint DEFAULT NULL,
  p_id_banco_empresa_cuenta_salida bigint DEFAULT NULL,
  p_id_banco_cliente_transferencia bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_itf numeric;
  v_resultado numeric;
  v_comision_transf numeric;
  v_comision_inter numeric;
  v_cuenta record;
BEGIN
  v_itf := FLOOR(GREATEST(COALESCE(p_monto_transferencia_cliente, 0), 0) / 1000) * 0.05;

  v_comision_transf := COALESCE(p_comision_transf_banco_salida, 0);
  v_comision_inter := COALESCE(p_comision_transf_inter_banco_salida, 0);

  IF p_id_empresa_cuenta_salida IS NOT NULL THEN
    SELECT
      c.comision_transf_banco_salida,
      c.comision_transf_inter_banco_salida
    INTO v_cuenta
    FROM public.tb_empresa_cuenta_bancaria c
    WHERE c.id = p_id_empresa_cuenta_salida
      AND (p_id_empresa_salida IS NULL OR c.id_empresa = p_id_empresa_salida)
      AND (p_id_banco_empresa_cuenta_salida IS NULL OR c.id_banco = p_id_banco_empresa_cuenta_salida)
    LIMIT 1;

    IF COALESCE(p_id_banco_cliente_transferencia, 0) = COALESCE(p_id_banco_empresa_cuenta_salida, 0) THEN
      v_comision_transf := COALESCE(v_cuenta.comision_transf_banco_salida, 0);
      v_comision_inter := 0;
    ELSE
      v_comision_transf := 0;
      v_comision_inter := COALESCE(v_cuenta.comision_transf_inter_banco_salida, 0);
    END IF;
  END IF;

  v_resultado := v_itf + v_comision_transf + v_comision_inter;

  RETURN jsonb_build_object(
    'resultado_comision_banco_salida', ROUND(COALESCE(v_resultado, 0), 2)
  );
END;
$$;

/*
Funcion: f_get_tb_operacion_proceso_calculo
Objetivo:
  Exponer un contrato compacto y semantico para el calculo unificado de una
  operacion antes de guardar.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_proceso_calculo(
  p_monto_deposito_cliente numeric,
  p_comision_servicio numeric,
  p_monto_minimo_deposito_servicio numeric,
  p_comision_minima_servicio numeric,
  p_comision_monto_extra_servicio numeric,
  p_flag_por_sol_comision_banco_ingreso boolean,
  p_comision_banco_ingreso numeric,
  p_comision_minimo_banco_ingreso numeric,
  p_comision_igv_banco_ingreso numeric,
  p_monto_itf_ingreso numeric,
  p_comision_transf_banco_salida numeric,
  p_comision_transf_inter_banco_salida numeric,
  p_monto_itf_salida numeric,
  p_id_empresa_salida bigint,
  p_id_empresa_cuenta_salida bigint,
  p_id_banco_empresa_cuenta_salida bigint,
  p_id_banco_cliente_transferencia bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_calc_serv jsonb;
  v_calc_ing jsonb;
  v_calc_sal jsonb;
BEGIN
  v_calc_serv := public.f_get_tb_operacion_calculo_comision_servicio(
    p_monto_deposito_cliente,
    p_comision_servicio,
    p_monto_minimo_deposito_servicio,
    p_comision_minima_servicio,
    p_comision_monto_extra_servicio
  );

  v_calc_ing := public.f_get_tb_operacion_calculo_comision_banco_ingreso(
    p_flag_por_sol_comision_banco_ingreso,
    p_monto_deposito_cliente,
    p_comision_banco_ingreso,
    p_comision_minimo_banco_ingreso,
    p_comision_igv_banco_ingreso,
    p_monto_itf_ingreso
  );

  v_calc_sal := public.f_get_tb_operacion_calculo_comision_banco_salida(
    (v_calc_serv->>'monto_transferencia_cliente')::numeric,
    p_comision_transf_banco_salida,
    p_comision_transf_inter_banco_salida,
    p_monto_itf_salida,
    p_id_empresa_salida,
    p_id_empresa_cuenta_salida,
    p_id_banco_empresa_cuenta_salida,
    p_id_banco_cliente_transferencia
  );

  RETURN jsonb_build_object(
    'resultado_comision_servicio', (v_calc_serv->>'resultado_comision_servicio')::numeric,
    'monto_transferencia_cliente', (v_calc_serv->>'monto_transferencia_cliente')::numeric,
    'resultado_comision_banco_ingreso', (v_calc_ing->>'resultado_comision_banco_ingreso')::numeric,
    'resultado_comision_banco_salida', (v_calc_sal->>'resultado_comision_banco_salida')::numeric
  );
END;
$$;

/*
Funcion: f_post_tb_operacion_proceso_excel
Objetivo:
  Procesar una carga masiva Excel bajo un contrato compacto orientado al flujo
  de negocio, no al CRUD fila por fila.

Regla de fase:
  - inserta operaciones en `tb_operacion_proceso`
  - registra el movimiento de caja por cada operacion procesada
  - congela `tipo_servicio` desde `tb_codigo_servicio`
  - si la ruta bancaria viene informada, se respeta la empresa seleccionada y
    se valida que tenga cuenta del banco de la ruta
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_operacion_proceso_excel(
  p_datos_excel_json jsonb,
  p_id_codigo_servicio bigint,
  p_nombre_codigo_servicio character varying,
  p_id_comunidad bigint,
  p_nombre_comunidad character varying,
  p_nombre_tipo_deposito character varying,
  p_id_empresa_ingreso bigint,
  p_nombre_empresa_ingreso character varying,
  p_id_banco bigint,
  p_id_usuario bigint,
  p_nombre_usuario character varying DEFAULT NULL,
  p_ruta_actual character varying DEFAULT NULL,
  p_tipo_recaudacion_sf character varying DEFAULT NULL,
  p_nombre_archivo character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fila record;
  v_username character varying;
  v_estado_pendiente_id bigint;
  v_estado_pendiente_nombre character varying;
  v_estado_error_id bigint;
  v_id_empresa_cuenta_ingreso bigint;
  v_itf_cuenta numeric := 0;
  v_flag_por_sol_comision_banco_ingreso boolean := false;
  v_comision_banco_ingreso numeric := 0;
  v_comision_minimo_banco_ingreso numeric := 0;
  v_comision_igv_banco_ingreso numeric := 0;
  v_flag_retencion_cuenta boolean := false;
  v_regla record;
  v_regla_cliente record;
  v_dni_parseado character varying;
  v_tipo_doc character varying;
  v_tipo_documento bigint;
  v_monto numeric;
  v_monto_raw character varying;
  v_monto_normalizado character varying;
  v_ultima_coma integer;
  v_ultimo_punto integer;
  v_fecha_deposito timestamp with time zone;
  v_cliente_id bigint;
  v_cliente_nombre character varying;
  v_cliente_comunidad bigint;
  v_dup_id bigint;
  v_codigo_duplicidad character varying;
  v_banco_cliente_id bigint;
  v_banco_cliente_nombre character varying;
  v_calc_serv jsonb;
  v_calc_ing jsonb;
  v_calc_sal jsonb;
  v_error_motivo character varying;
  v_new_id bigint;
  v_reglas_candidatas_count integer := 0;
  v_filas_procesadas integer := 0;
  v_filas_omitidas integer := 0;
  v_filas_error integer := 0;
  v_detalle jsonb := '[]'::jsonb;
  v_excel_nombre_codigo_servicio character varying;
  v_excel_tipo_servicio character varying;
  v_ruta_ingreso jsonb;
  v_id_banco_ruta bigint;
  v_nombre_banco_ruta character varying;
  v_id_empresa_ingreso_final bigint;
  v_nombre_empresa_ingreso_final character varying;
  v_id_banco_ingreso_final bigint;
  v_nombre_banco_ingreso_final character varying;
  v_caja_result jsonb;
  v_tipo_recaudacion_sf character varying;
  v_id_carga_excel bigint;
  v_nombre_archivo_final character varying;
  v_fecha_carga_excel timestamp with time zone;
BEGIN
  SELECT username INTO v_username
  FROM public.tb_usuario
  WHERE id = p_id_usuario;

  IF NOT FOUND THEN
    v_username := 'Sistema';
  END IF;

  SELECT id, nombre INTO v_estado_pendiente_id, v_estado_pendiente_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PENDIENTE'
  LIMIT 1;

  SELECT id INTO v_estado_error_id
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'ERROR'
  LIMIT 1;

  v_excel_nombre_codigo_servicio := p_nombre_codigo_servicio;
  v_excel_tipo_servicio := NULL;
  v_id_empresa_ingreso_final := p_id_empresa_ingreso;
  v_nombre_empresa_ingreso_final := p_nombre_empresa_ingreso;
  v_id_banco_ingreso_final := p_id_banco;
  v_nombre_banco_ingreso_final := NULL;
  IF p_id_empresa_ingreso IS NOT NULL THEN
    SELECT COALESCE(cs.nombre, p_nombre_codigo_servicio), cs.tipo
    INTO v_excel_nombre_codigo_servicio, v_excel_tipo_servicio
    FROM public.tb_empresa e
    CROSS JOIN public.tb_codigo_servicio cs
    WHERE e.id = p_id_empresa_ingreso
      AND cs.id = p_id_codigo_servicio
    LIMIT 1;
  ELSIF p_id_codigo_servicio IS NOT NULL THEN
    SELECT cs.tipo
    INTO v_excel_tipo_servicio
    FROM public.tb_codigo_servicio cs
    WHERE cs.id = p_id_codigo_servicio
    LIMIT 1;
  END IF;

  v_tipo_recaudacion_sf := CASE
    WHEN LOWER(COALESCE(p_ruta_actual, '')) = 'safetypay'
      THEN CASE
        WHEN UPPER(BTRIM(COALESCE(p_tipo_recaudacion_sf, ''))) = 'MANUAL' THEN 'Manual'
        ELSE 'Automatico'
      END
    ELSE NULL
  END;

  IF COALESCE(p_ruta_actual, '') <> '' THEN
    IF LOWER(COALESCE(p_ruta_actual, '')) = 'safetypay' THEN
      v_ruta_ingreso := public.f_get_tb_ruta_operacion_caja_ingreso_principal(p_ruta_actual);

      IF v_ruta_ingreso IS NULL THEN
        RETURN jsonb_build_object(
          'filas_procesadas', 0,
          'filas_omitidas', 0,
          'filas_error', 1,
          'detalle', jsonb_build_array(
            jsonb_build_object(
              'fila', 0,
              'estado', 'ERROR',
              'motivo', 'La ruta SafetyPay no tiene una caja primaria de ingreso configurada'
            )
          )
        );
      END IF;

      IF p_id_empresa_ingreso IS NOT NULL
         AND p_id_empresa_ingreso <> COALESCE((v_ruta_ingreso->>'id_empresa')::bigint, 0) THEN
        RETURN jsonb_build_object(
          'filas_procesadas', 0,
          'filas_omitidas', 0,
          'filas_error', 1,
          'detalle', jsonb_build_array(
            jsonb_build_object(
              'fila', 0,
              'estado', 'ERROR',
              'motivo', 'La empresa seleccionada no coincide con la caja primaria de ingreso de SafetyPay'
            )
          )
        );
      END IF;

      v_id_empresa_ingreso_final := (v_ruta_ingreso->>'id_empresa')::bigint;
      v_nombre_empresa_ingreso_final := v_ruta_ingreso->>'nombre_empresa';
      v_id_banco_ingreso_final := (v_ruta_ingreso->>'id_banco')::bigint;
      v_nombre_banco_ingreso_final := v_ruta_ingreso->>'nombre_banco';
    ELSE
      SELECT b.id, b.nombre
      INTO v_id_banco_ruta, v_nombre_banco_ruta
      FROM public.tb_banco b
      WHERE UPPER(b.nombre) = CASE LOWER(p_ruta_actual)
          WHEN 'bcp' THEN 'BCP'
          WHEN 'bbva' THEN 'BBVA'
          WHEN 'scotiabank' THEN 'SCOTIABANK'
          WHEN 'banbif' THEN 'BANBIF'
          WHEN 'interbank' THEN 'INTERBANK'
          WHEN 'safetypay' THEN 'SAFETYPAY'
          ELSE ''
        END
         OR UPPER(COALESCE(b.nombre_abreviatura, '')) = CASE LOWER(p_ruta_actual)
          WHEN 'bcp' THEN 'BCP'
          WHEN 'bbva' THEN 'BBVA'
          WHEN 'scotiabank' THEN 'SCOTIABANK'
          WHEN 'banbif' THEN 'BANBIF'
          WHEN 'interbank' THEN 'IBK'
          WHEN 'safetypay' THEN 'SFPAY'
          ELSE ''
        END
      LIMIT 1;

      IF v_id_banco_ruta IS NOT NULL THEN
        IF v_id_empresa_ingreso_final IS NULL THEN
          v_ruta_ingreso := public.f_get_tb_ruta_operacion_caja_ingreso_principal(p_ruta_actual);

          IF v_ruta_ingreso IS NULL THEN
            RETURN jsonb_build_object(
              'filas_procesadas', 0,
              'filas_omitidas', 0,
              'filas_error', 1,
              'detalle', jsonb_build_array(
                jsonb_build_object(
                  'fila', 0,
                  'estado', 'ERROR',
                  'motivo', 'Selecciona una empresa de ingreso para la ruta actual'
                )
              )
            );
          END IF;

          v_id_empresa_ingreso_final := (v_ruta_ingreso->>'id_empresa')::bigint;
          v_nombre_empresa_ingreso_final := v_ruta_ingreso->>'nombre_empresa';
        END IF;

        IF v_nombre_empresa_ingreso_final IS NULL THEN
          SELECT e.nombre
          INTO v_nombre_empresa_ingreso_final
          FROM public.tb_empresa e
          WHERE e.id = v_id_empresa_ingreso_final
          LIMIT 1;
        END IF;

        v_id_banco_ingreso_final := v_id_banco_ruta;
        v_nombre_banco_ingreso_final := v_nombre_banco_ruta;
      ELSE
        v_ruta_ingreso := public.f_get_tb_ruta_operacion_caja_ingreso_principal(p_ruta_actual);

        IF v_ruta_ingreso IS NULL THEN
          RETURN jsonb_build_object(
            'filas_procesadas', 0,
            'filas_omitidas', 0,
            'filas_error', 1,
            'detalle', jsonb_build_array(
              jsonb_build_object(
                'fila', 0,
                'estado', 'ERROR',
                'motivo', 'La ruta actual no tiene una caja primaria de ingreso configurada'
              )
            )
          );
        END IF;

        IF p_id_empresa_ingreso IS NOT NULL
           AND p_id_empresa_ingreso <> COALESCE((v_ruta_ingreso->>'id_empresa')::bigint, 0) THEN
          RETURN jsonb_build_object(
            'filas_procesadas', 0,
            'filas_omitidas', 0,
            'filas_error', 1,
            'detalle', jsonb_build_array(
              jsonb_build_object(
                'fila', 0,
                'estado', 'ERROR',
                'motivo', 'La empresa seleccionada no coincide con la caja primaria de ingreso de la ruta'
              )
            )
          );
        END IF;

        v_id_empresa_ingreso_final := (v_ruta_ingreso->>'id_empresa')::bigint;
        v_nombre_empresa_ingreso_final := v_ruta_ingreso->>'nombre_empresa';
        v_id_banco_ingreso_final := (v_ruta_ingreso->>'id_banco')::bigint;
        v_nombre_banco_ingreso_final := v_ruta_ingreso->>'nombre_banco';
      END IF;
    END IF;
  END IF;

  SELECT
    ecb.id,
    ecb.comision_itf_ingreso_salida,
    ecb.flag_por_sol_comision_banco_ingreso,
    ecb.comision_banco_ingreso,
    ecb.comision_minimo_banco_ingreso,
    ecb.comision_igv_banco_ingreso
  INTO
    v_id_empresa_cuenta_ingreso,
    v_itf_cuenta,
    v_flag_por_sol_comision_banco_ingreso,
    v_comision_banco_ingreso,
    v_comision_minimo_banco_ingreso,
    v_comision_igv_banco_ingreso
  FROM public.tb_empresa_cuenta_bancaria ecb
  WHERE ecb.id_empresa = v_id_empresa_ingreso_final
    AND ecb.id_banco = v_id_banco_ingreso_final
  LIMIT 1;

  IF v_id_empresa_cuenta_ingreso IS NULL THEN
    RETURN jsonb_build_object(
      'filas_procesadas', 0,
      'filas_omitidas', 0,
      'filas_error', 1,
      'detalle', jsonb_build_array(
        jsonb_build_object(
          'fila', 0,
          'estado', 'ERROR',
      'motivo', 'No existe una cuenta bancaria de ingreso para la empresa y banco definidos por la ruta'
        )
      )
    );
  END IF;

  IF to_regprocedure('public.f_get_tb_recaudacion_cuenta_flag_retenida(character varying,bigint)') IS NOT NULL THEN
    v_flag_retencion_cuenta := public.f_get_tb_recaudacion_cuenta_flag_retenida(
      p_ruta_actual,
      v_id_empresa_cuenta_ingreso
    );
  ELSE
    v_flag_retencion_cuenta := false;
  END IF;

  v_nombre_archivo_final := COALESCE(NULLIF(BTRIM(p_nombre_archivo), ''), 'Archivo sin nombre');

  INSERT INTO public.tb_operacion_carga_excel (
    nombre_archivo,
    ruta,
    id_empresa_ingreso,
    nombre_empresa_ingreso,
    id_empresa_cuenta_ingreso,
    id_banco,
    nombre_banco,
    id_usuario,
    nombre_usuario
  )
  VALUES (
    v_nombre_archivo_final,
    p_ruta_actual,
    v_id_empresa_ingreso_final,
    v_nombre_empresa_ingreso_final,
    v_id_empresa_cuenta_ingreso,
    v_id_banco_ingreso_final,
    COALESCE(v_nombre_banco_ingreso_final, (SELECT nombre FROM public.tb_banco WHERE id = v_id_banco_ingreso_final LIMIT 1)),
    p_id_usuario,
    v_username
  )
  RETURNING id, fecha_carga INTO v_id_carga_excel, v_fecha_carga_excel;

  FOR v_fila IN
    SELECT *
    FROM jsonb_to_recordset(p_datos_excel_json) AS x(
      dni text,
      monto text,
      codigo_operacion text,
      fecha_pago text,
      hora_proceso text,
      nombre_cliente_banco_ingreso text,
      estado text
    )
  LOOP
    v_error_motivo := NULL;
    v_dni_parseado := NULL;
    v_monto := 0;
    v_fecha_deposito := NULL;
    v_cliente_id := NULL;
    v_cliente_nombre := NULL;
    v_cliente_comunidad := NULL;
    v_banco_cliente_id := NULL;
    v_banco_cliente_nombre := NULL;

    IF LOWER(COALESCE(p_ruta_actual, '')) = 'safetypay'
       AND BTRIM(COALESCE(v_fila.estado, '')) <> ''
       AND UPPER(TRANSLATE(BTRIM(COALESCE(v_fila.estado, '')), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')) <> 'PAGADO' THEN
      v_detalle := v_detalle || jsonb_build_object(
        'fila', v_filas_procesadas + v_filas_omitidas + v_filas_error + 1,
        'codigo_operacion', v_fila.codigo_operacion,
        'estado', 'OMITIDO',
        'estado_excel', v_fila.estado,
        'motivo', 'SafetyPay solo procesa filas con estado Pagado'
      );
      v_filas_omitidas := v_filas_omitidas + 1;
      CONTINUE;
    END IF;

    BEGIN
      SELECT valor, tipo
      INTO v_dni_parseado, v_tipo_doc
      FROM public.f_get_tb_parse_documento(
        p_raw := COALESCE(v_fila.dni, ''),
        p_id_codigo_servicio := p_id_codigo_servicio
      );
    EXCEPTION WHEN OTHERS THEN
      v_error_motivo := 'DNI invÃ¡lido: ' || COALESCE(v_fila.dni, 'vacÃ­o');
    END;

    IF v_error_motivo IS NULL THEN
      BEGIN
        v_monto_raw := BTRIM(COALESCE(v_fila.monto, '0'));

        -- Excel puede enviar el resultado como =DECIMAL("2,000.00").
        IF v_monto_raw ~ '^\s*=' THEN
          v_monto_raw := REGEXP_REPLACE(
            v_monto_raw,
            '^.*\(\s*"?([^")]+)"?\s*\).*$','\1'
          );
        END IF;

        v_monto_raw := REGEXP_REPLACE(v_monto_raw, '[^0-9,.-]', '', 'g');
        v_monto_normalizado := v_monto_raw;
        v_ultima_coma := LENGTH(v_monto_raw) - STRPOS(REVERSE(v_monto_raw), ',') + 1;
        v_ultimo_punto := LENGTH(v_monto_raw) - STRPOS(REVERSE(v_monto_raw), '.') + 1;

        IF STRPOS(v_monto_raw, ',') > 0 AND STRPOS(v_monto_raw, '.') > 0 THEN
          IF v_ultima_coma > v_ultimo_punto THEN
            v_monto_normalizado := REPLACE(REPLACE(v_monto_raw, '.', ''), ',', '.');
          ELSE
            v_monto_normalizado := REPLACE(v_monto_raw, ',', '');
          END IF;
        ELSIF STRPOS(v_monto_raw, ',') > 0 THEN
          IF LENGTH(v_monto_raw) - v_ultima_coma <= 2
             AND LENGTH(v_monto_raw) - LENGTH(REPLACE(v_monto_raw, ',', '')) = 1 THEN
            v_monto_normalizado := REPLACE(v_monto_raw, ',', '.');
          ELSE
            v_monto_normalizado := REPLACE(v_monto_raw, ',', '');
          END IF;
        END IF;

        v_monto := COALESCE(NULLIF(v_monto_normalizado, '')::numeric, 0);
        IF v_monto < 0 THEN
          RAISE EXCEPTION 'monto negativo';
        END IF;
        v_monto := ROUND(v_monto, 2);
      EXCEPTION WHEN OTHERS THEN
        v_error_motivo := 'Monto invÃ¡lido: ' || COALESCE(v_fila.monto, 'vacÃ­o');
      END;
    END IF;

    IF v_error_motivo IS NULL THEN
      BEGIN
        v_fecha_deposito := public.f_get_tb_parsear_fecha(v_fila.fecha_pago)::timestamp with time zone;
        IF v_fecha_deposito::time = '00:00:00'::time THEN
          IF COALESCE(v_fila.hora_proceso, '') <> '' THEN
            v_fecha_deposito := (v_fecha_deposito::date + v_fila.hora_proceso::time)::timestamp with time zone;
          ELSE
            v_fecha_deposito := (v_fecha_deposito::date + current_time)::timestamp with time zone;
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_error_motivo := 'Fecha invÃ¡lida: ' || COALESCE(v_fila.fecha_pago, 'vacÃ­a');
      END;
    END IF;

    IF v_error_motivo IS NOT NULL THEN
      v_detalle := v_detalle || jsonb_build_object(
        'fila', v_filas_procesadas + v_filas_omitidas + v_filas_error + 1,
        'dni', v_fila.dni,
        'monto', v_fila.monto,
        'codigo_operacion', v_fila.codigo_operacion,
        'fecha_pago', v_fila.fecha_pago,
        'estado', 'ERROR',
        'error_motivo', v_error_motivo
      );
      v_filas_error := v_filas_error + 1;
      CONTINUE;
    END IF;

    IF COALESCE(v_dni_parseado, '') <> '' THEN
      v_tipo_documento := public.f_get_tb_documento_tipo_codigo(v_tipo_doc);
      SELECT id, nombre, id_comunidad
      INTO v_cliente_id, v_cliente_nombre, v_cliente_comunidad
      FROM public.tb_cliente
      WHERE tipo_documento = v_tipo_documento
        AND numero_documento = v_dni_parseado
      LIMIT 1;

      IF v_cliente_id IS NULL THEN
        SELECT id, nombre
        INTO v_cliente_id, v_cliente_nombre
        FROM (
          SELECT *
          FROM jsonb_to_record(
            public.f_post_tb_cliente(
              p_tipo_documento := v_tipo_documento,
              p_numero_documento := v_dni_parseado,
              p_nombre := '',
              p_id_comunidad := p_id_comunidad,
              p_id_estado := (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1),
              p_id_usuario := p_id_usuario
            )
          ) AS x(id bigint, nombre character varying)
        ) z;
        v_cliente_comunidad := p_id_comunidad;
      END IF;
    END IF;

    v_codigo_duplicidad := NULLIF(BTRIM(COALESCE(v_fila.codigo_operacion, '')), '');
    IF v_codigo_duplicidad IS NOT NULL THEN
      -- Serialize identical deposits across simultaneous Excel loads.
      PERFORM pg_advisory_xact_lock(
        hashtextextended(
          CONCAT_WS('|', p_id_codigo_servicio::text, UPPER(v_codigo_duplicidad), ROUND(COALESCE(v_monto, 0)::numeric, 2)::text),
          0
        )
      );

      SELECT id
      INTO v_dup_id
      FROM public.tb_operacion_proceso
      WHERE 1 = 1
        -- AND dni_cliente = v_dni_parseado
        AND ROUND(COALESCE(monto_deposito_cliente, 0)::numeric, 2) = ROUND(COALESCE(v_monto, 0)::numeric, 2)
        AND UPPER(BTRIM(COALESCE(codigo_operacion_deposito_cliente, ''))) = UPPER(v_codigo_duplicidad)
        AND id_codigo_servicio = p_id_codigo_servicio
        AND fecha_deposito_cliente::date BETWEEN (v_fecha_deposito::date - 7) AND (v_fecha_deposito::date + 7)
      LIMIT 1;
    ELSE
      v_dup_id := NULL;
    END IF;

    IF v_dup_id IS NOT NULL THEN
      v_detalle := v_detalle || jsonb_build_object(
        'fila', v_filas_procesadas + v_filas_omitidas + v_filas_error + 1,
        'codigo_operacion', v_fila.codigo_operacion,
        'estado', 'OMITIDO',
        'motivo', 'Duplicado por monto, codigo de operacion, servicio y ventana de deposito de 7 dias',
        'id_operacion', v_dup_id
      );
      v_filas_omitidas := v_filas_omitidas + 1;
      CONTINUE;
    END IF;

    SELECT b.id, b.nombre
    INTO v_banco_cliente_id, v_banco_cliente_nombre
    FROM public.tb_banco b
    WHERE b.id = v_id_banco_ingreso_final
       OR UPPER(COALESCE(v_fila.nombre_cliente_banco_ingreso, '')) LIKE '%' || UPPER(COALESCE(b.nombre, '')) || '%'
       OR UPPER(COALESCE(v_fila.nombre_cliente_banco_ingreso, '')) LIKE '%' || UPPER(COALESCE(b.nombre_abreviatura, '')) || '%'
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(COALESCE(b.nombre_equivalencia, '[]'::jsonb)) eq(valor)
         WHERE UPPER(COALESCE(v_fila.nombre_cliente_banco_ingreso, '')) LIKE '%' || UPPER(eq.valor) || '%'
       )
    ORDER BY CASE WHEN b.id = v_id_banco_ingreso_final THEN 0 ELSE 1 END, b.id
    LIMIT 1;

    IF v_banco_cliente_id IS NULL THEN
      v_banco_cliente_id := v_id_banco_ingreso_final;
      SELECT nombre INTO v_banco_cliente_nombre
      FROM public.tb_banco
      WHERE id = v_id_banco_ingreso_final;
    END IF;

    SELECT COUNT(*) INTO v_reglas_candidatas_count
    FROM public.tb_reglas_efectivizacion r
    WHERE r.id_codigo_servicio = p_id_codigo_servicio
      AND r.id_banco = v_id_banco_ingreso_final
      AND r.id_comunidad = COALESCE(v_cliente_comunidad, p_id_comunidad)
      AND (p_nombre_tipo_deposito IS NULL OR r.tipo_deposito = p_nombre_tipo_deposito)
      AND r.id_estado = (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1);

    SELECT r.*
    INTO v_regla
    FROM public.tb_reglas_efectivizacion r
    WHERE r.id_codigo_servicio = p_id_codigo_servicio
      AND r.id_banco = v_id_banco_ingreso_final
      AND r.id_comunidad = COALESCE(v_cliente_comunidad, p_id_comunidad)
      AND (p_nombre_tipo_deposito IS NULL OR r.tipo_deposito = p_nombre_tipo_deposito)
      AND r.id_estado = (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1)
    LIMIT 1;

    IF v_regla.id IS NULL THEN
      v_detalle := v_detalle || jsonb_build_object(
        'fila', v_filas_procesadas + v_filas_omitidas + v_filas_error + 1,
        'codigo_operacion', v_fila.codigo_operacion,
        'estado', 'ERROR',
        'motivo', 'No se encontrÃ³ una regla activa de efectivizaciÃ³n'
      );
      v_filas_error := v_filas_error + 1;
      CONTINUE;
    END IF;

    IF UPPER(BTRIM(COALESCE(v_excel_tipo_servicio, ''))) = 'EFECTIVIZACION'
       AND LOWER(BTRIM(COALESCE(p_ruta_actual, ''))) IN ('bcp', 'bbva', 'scotiabank', 'banbif', 'interbank', 'safetypay') THEN
      v_calc_serv := public.f_get_tb_operacion_comision_efectivizacion_cliente(
        v_cliente_id,
        v_monto,
        v_regla.comision_servicio,
        v_regla.monto_minimo_deposito_servicio,
        v_regla.comision_minima_servicio
      );
    ELSE
      v_calc_serv := public.f_get_tb_operacion_calculo_comision_servicio(
        v_monto,
        v_regla.comision_servicio,
        v_regla.monto_minimo_deposito_servicio,
        v_regla.comision_minima_servicio,
        0
      ) || jsonb_build_object(
        'comision_servicio', v_regla.comision_servicio,
        'monto_minimo_deposito_servicio', v_regla.monto_minimo_deposito_servicio,
        'comision_minima_servicio', v_regla.comision_minima_servicio,
        'comision_monto_extra_servicio', 0
      );
    END IF;

    v_calc_ing := public.f_get_tb_operacion_calculo_comision_banco_ingreso(
      v_flag_por_sol_comision_banco_ingreso,
      v_monto,
      v_comision_banco_ingreso,
      v_comision_minimo_banco_ingreso,
      v_comision_igv_banco_ingreso,
      v_itf_cuenta
    );

    v_calc_sal := public.f_get_tb_operacion_calculo_comision_banco_salida(
      (v_calc_serv->>'monto_transferencia_cliente')::numeric,
      0,
      0,
      v_itf_cuenta,
      v_id_empresa_ingreso_final,
      v_id_empresa_cuenta_ingreso,
      v_id_banco_ingreso_final,
      v_id_banco_ingreso_final
    );

    INSERT INTO public.tb_operacion_proceso (
      id_codigo_servicio,
      nombre_codigo_servicio,
      tipo_servicio,
      id_comunidad,
      nombre_comunidad,
      nombre_tipo_deposito,
      id_cliente,
      dni_cliente,
      nombre_cliente,
      id_banco_cliente,
      nombre_banco_cliente,
      monto_deposito_cliente,
      codigo_operacion_deposito_cliente,
      fecha_deposito_cliente,
      id_empresa_ingreso,
      nombre_empresa_ingreso,
      id_empresa_cuenta_ingreso,
      id_banco_empresa_cuenta_ingreso,
      nombre_banco_empresa_cuenta_ingreso,
      flag_por_sol_comision_banco_ingreso,
      comision_banco_ingreso,
      comision_minimo_banco_ingreso,
      comision_igv_banco_ingreso,
      resultado_comision_banco_ingreso,
      monto_itf_ingreso,
      comision_servicio,
      monto_minimo_deposito_servicio,
      comision_minima_servicio,
      comision_monto_extra_servicio,
      resultado_comision_servicio,
      id_empresa_salida,
      nombre_empresa_salida,
      id_empresa_cuenta_salida,
      id_banco_empresa_cuenta_salida,
      nombre_banco_empresa_cuenta_salida,
      comision_transf_banco_salida,
      comision_transf_inter_banco_salida,
      resultado_comision_banco_salida,
      monto_transferencia_cliente,
      monto_itf_salida,
      id_banco_cliente_transferencia,
      nombre_banco_cliente_transferencia,
      id_estado,
      nombre_estado,
      id_usuario,
      nombre_usuario,
      id_usuario_gestor,
      nombre_usuario_gestor,
      ruta_origen,
      ruta_destino,
      flag_derivado,
      flag_retenido,
      fecha_retencion,
      id_usuario_retiene,
      nombre_usuario_retiene,
      motivo_retencion,
      fecha_pendiente,
      tipo_recaudacion_sf,
      id_carga_excel,
      nombre_carga_excel,
      fecha_carga_excel,
      tipo_facturacion
    )
    VALUES (
      p_id_codigo_servicio,
      v_excel_nombre_codigo_servicio,
      v_excel_tipo_servicio,
      COALESCE(v_cliente_comunidad, p_id_comunidad),
      COALESCE((SELECT nombre FROM public.tb_comunidad WHERE id = COALESCE(v_cliente_comunidad, p_id_comunidad) LIMIT 1), p_nombre_comunidad),
      v_regla.tipo_deposito,
      v_cliente_id,
      v_dni_parseado,
      COALESCE(v_cliente_nombre, ''),
      v_banco_cliente_id,
      v_banco_cliente_nombre,
      v_monto,
      COALESCE(v_fila.codigo_operacion, ''),
      v_fecha_deposito,
      v_id_empresa_ingreso_final,
      v_nombre_empresa_ingreso_final,
      v_id_empresa_cuenta_ingreso,
      v_id_banco_ingreso_final,
      COALESCE(v_nombre_banco_ingreso_final, (SELECT nombre FROM public.tb_banco WHERE id = v_id_banco_ingreso_final LIMIT 1)),
      v_flag_por_sol_comision_banco_ingreso,
      v_comision_banco_ingreso,
      v_comision_minimo_banco_ingreso,
      v_comision_igv_banco_ingreso,
      (v_calc_ing->>'resultado_comision_banco_ingreso')::numeric,
      v_itf_cuenta,
      (v_calc_serv->>'comision_servicio')::numeric,
      (v_calc_serv->>'monto_minimo_deposito_servicio')::numeric,
      (v_calc_serv->>'comision_minima_servicio')::numeric,
      (v_calc_serv->>'comision_monto_extra_servicio')::numeric,
      (v_calc_serv->>'resultado_comision_servicio')::numeric,
      v_id_empresa_ingreso_final,
      v_nombre_empresa_ingreso_final,
      v_id_empresa_cuenta_ingreso,
      v_id_banco_ingreso_final,
      COALESCE(v_nombre_banco_ingreso_final, (SELECT nombre FROM public.tb_banco WHERE id = v_id_banco_ingreso_final LIMIT 1)),
      0,
      0,
      (v_calc_sal->>'resultado_comision_banco_salida')::numeric,
      (v_calc_serv->>'monto_transferencia_cliente')::numeric,
      v_itf_cuenta,
      v_id_banco_ingreso_final,
      COALESCE(v_nombre_banco_ingreso_final, (SELECT nombre FROM public.tb_banco WHERE id = v_id_banco_ingreso_final LIMIT 1)),
      v_estado_pendiente_id,
      v_estado_pendiente_nombre,
      p_id_usuario,
      v_username,
      p_id_usuario,
      v_username,
      p_ruta_actual,
      COALESCE(p_ruta_actual, NULL),
      false,
      COALESCE(v_flag_retencion_cuenta, false),
      CASE WHEN COALESCE(v_flag_retencion_cuenta, false) THEN NOW() ELSE NULL END,
      CASE WHEN COALESCE(v_flag_retencion_cuenta, false) THEN p_id_usuario ELSE NULL END,
      CASE WHEN COALESCE(v_flag_retencion_cuenta, false) THEN v_username ELSE NULL END,
      CASE
        WHEN COALESCE(v_flag_retencion_cuenta, false)
          THEN 'Retencion automatica por cuenta bancaria'
        ELSE NULL
      END,
      NOW(),
      v_tipo_recaudacion_sf,
      v_id_carga_excel,
      v_nombre_archivo_final,
      v_fecha_carga_excel,
      'Boleta'
    )
    RETURNING id INTO v_new_id;

    v_caja_result := public.f_post_tb_operacion_caja_desde_proceso(
      p_id_operacion_proceso := v_new_id,
      p_tipo_origen := 'EFECTIVIZACION',
      p_tipo_movimiento := 'INGRESO',
      p_id_usuario := p_id_usuario,
      p_nombre_usuario := v_username,
      p_id_estado := v_estado_pendiente_id
    );

    IF v_caja_result ? 'error' THEN
      v_detalle := v_detalle || jsonb_build_object(
        'fila', v_filas_procesadas + v_filas_omitidas + v_filas_error + 1,
        'codigo_operacion', v_fila.codigo_operacion,
        'estado', 'ERROR',
        'id_operacion', v_new_id,
        'motivo', v_caja_result->>'error'
      );
      v_filas_error := v_filas_error + 1;
      CONTINUE;
    END IF;

    IF to_regprocedure('public.f_patch_tb_recaudacion_confirmar_si_vencida(bigint,bigint,character varying)') IS NOT NULL THEN
      PERFORM public.f_patch_tb_recaudacion_confirmar_si_vencida(v_new_id, p_id_usuario, v_username);
    END IF;

    v_detalle := v_detalle || jsonb_build_object(
      'fila', v_filas_procesadas + v_filas_omitidas + v_filas_error + 1,
      'codigo_operacion', v_fila.codigo_operacion,
      'estado', 'PROCESADO',
      'id_operacion', v_new_id
    );
    v_filas_procesadas := v_filas_procesadas + 1;
  END LOOP;

  IF v_id_carga_excel IS NOT NULL THEN
    IF v_filas_procesadas = 0
       AND NOT EXISTS (
         SELECT 1
         FROM public.tb_operacion_proceso
         WHERE id_carga_excel = v_id_carga_excel
       ) THEN
      DELETE FROM public.tb_operacion_carga_excel
      WHERE id = v_id_carga_excel;
    ELSE
      UPDATE public.tb_operacion_carga_excel
      SET filas_procesadas = v_filas_procesadas,
          filas_omitidas = v_filas_omitidas,
          filas_error = v_filas_error
      WHERE id = v_id_carga_excel;
    END IF;
  END IF;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(p_ruta_actual, p_id_usuario);

  RETURN jsonb_build_object(
    'filas_procesadas', v_filas_procesadas,
    'filas_omitidas', v_filas_omitidas,
    'filas_error', v_filas_error,
    'detalle', v_detalle
  );
END;
$$;

/*
Funcion: f_post_tb_operacion_proceso_excel_ganancia
Objetivo:
  Procesar la variante de carga masiva cuya entrada viene orientada a ganancia.

Regla de fase:
  - sigue siendo un registro operativo/comercial
  - registra el ingreso de caja asociado a la ganancia cargada
  - congela `tipo_servicio` desde `tb_codigo_servicio`
  - si la ruta bancaria viene informada, se respeta la empresa seleccionada y
    se valida que tenga cuenta del banco de la ruta
*/
CREATE OR REPLACE FUNCTION public.f_post_tb_operacion_proceso_excel_ganancia(
  p_datos_excel_json jsonb,
  p_id_codigo_servicio bigint,
  p_nombre_codigo_servicio character varying,
  p_id_comunidad bigint,
  p_nombre_comunidad character varying,
  p_nombre_tipo_deposito character varying,
  p_id_empresa_ingreso bigint,
  p_nombre_empresa_ingreso character varying,
  p_id_banco bigint,
  p_id_usuario bigint,
  p_nombre_usuario character varying DEFAULT NULL,
  p_ruta_actual character varying DEFAULT NULL,
  p_nombre_archivo character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fila record;
  v_username character varying;
  v_estado_pagado_id bigint;
  v_estado_pagado_nombre character varying;
  v_dni_parseado character varying;
  v_tipo_doc character varying;
  v_tipo_documento bigint;
  v_monto numeric;
  v_monto_raw character varying;
  v_monto_normalizado character varying;
  v_ultima_coma integer;
  v_ultimo_punto integer;
  v_fecha_deposito timestamp with time zone;
  v_cliente_id bigint;
  v_cliente_nombre character varying;
  v_dup_id bigint;
  v_codigo_duplicidad character varying;
  v_id_empresa_cuenta_ingreso bigint;
  v_itf_cuenta numeric := 0;
  v_flag_por_sol_comision_banco_ingreso boolean := false;
  v_comision_banco_ingreso numeric := 0;
  v_comision_minimo_banco_ingreso numeric := 0;
  v_comision_igv_banco_ingreso numeric := 0;
  v_calc_ing jsonb;
  v_new_id bigint;
  v_detalle jsonb := '[]'::jsonb;
  v_filas_procesadas integer := 0;
  v_filas_omitidas integer := 0;
  v_filas_error integer := 0;
  v_excel_nombre_codigo_servicio character varying;
  v_excel_tipo_servicio character varying;
  v_ruta_ingreso jsonb;
  v_id_banco_ruta bigint;
  v_nombre_banco_ruta character varying;
  v_id_empresa_ingreso_final bigint;
  v_nombre_empresa_ingreso_final character varying;
  v_id_banco_ingreso_final bigint;
  v_nombre_banco_ingreso_final character varying;
  v_caja_result jsonb;
  v_id_carga_excel bigint;
  v_nombre_archivo_final character varying;
  v_fecha_carga_excel timestamp with time zone;
BEGIN
  SELECT username INTO v_username
  FROM public.tb_usuario
  WHERE id = p_id_usuario;

  IF NOT FOUND THEN
    v_username := 'Sistema';
  END IF;

  SELECT id, nombre INTO v_estado_pagado_id, v_estado_pagado_nombre
  FROM public.tb_estado
  WHERE UPPER(nombre) = 'PAGADO'
  LIMIT 1;

  v_excel_nombre_codigo_servicio := p_nombre_codigo_servicio;
  v_excel_tipo_servicio := NULL;
  v_id_empresa_ingreso_final := p_id_empresa_ingreso;
  v_nombre_empresa_ingreso_final := p_nombre_empresa_ingreso;
  v_id_banco_ingreso_final := p_id_banco;
  v_nombre_banco_ingreso_final := NULL;
  IF p_id_empresa_ingreso IS NOT NULL THEN
    SELECT COALESCE(cs.nombre, p_nombre_codigo_servicio), cs.tipo
    INTO v_excel_nombre_codigo_servicio, v_excel_tipo_servicio
    FROM public.tb_empresa e
    CROSS JOIN public.tb_codigo_servicio cs
    WHERE e.id = p_id_empresa_ingreso
      AND cs.id = p_id_codigo_servicio
    LIMIT 1;
  ELSIF p_id_codigo_servicio IS NOT NULL THEN
    SELECT cs.tipo
    INTO v_excel_tipo_servicio
    FROM public.tb_codigo_servicio cs
    WHERE cs.id = p_id_codigo_servicio
    LIMIT 1;
  END IF;

  IF COALESCE(p_ruta_actual, '') <> '' THEN
    SELECT b.id, b.nombre
    INTO v_id_banco_ruta, v_nombre_banco_ruta
    FROM public.tb_banco b
    WHERE UPPER(b.nombre) = CASE LOWER(p_ruta_actual)
        WHEN 'bcp' THEN 'BCP'
        WHEN 'bbva' THEN 'BBVA'
        WHEN 'scotiabank' THEN 'SCOTIABANK'
        WHEN 'banbif' THEN 'BANBIF'
        WHEN 'interbank' THEN 'INTERBANK'
        WHEN 'safetypay' THEN 'SAFETYPAY'
        ELSE ''
      END
       OR UPPER(COALESCE(b.nombre_abreviatura, '')) = CASE LOWER(p_ruta_actual)
        WHEN 'bcp' THEN 'BCP'
        WHEN 'bbva' THEN 'BBVA'
        WHEN 'scotiabank' THEN 'SCOTIABANK'
        WHEN 'banbif' THEN 'BANBIF'
        WHEN 'interbank' THEN 'IBK'
        WHEN 'safetypay' THEN 'SFPAY'
        ELSE ''
      END
    LIMIT 1;

    IF v_id_banco_ruta IS NOT NULL THEN
      IF v_id_empresa_ingreso_final IS NULL THEN
        v_ruta_ingreso := public.f_get_tb_ruta_operacion_caja_ingreso_principal(p_ruta_actual);

        IF v_ruta_ingreso IS NULL THEN
          RETURN jsonb_build_object(
            'filas_procesadas', 0,
            'filas_omitidas', 0,
            'filas_error', 1,
            'detalle', jsonb_build_array(
              jsonb_build_object(
                'fila', 0,
                'estado', 'ERROR',
                'motivo', 'Selecciona una empresa de ingreso para la ruta actual'
              )
            )
          );
        END IF;

        v_id_empresa_ingreso_final := (v_ruta_ingreso->>'id_empresa')::bigint;
        v_nombre_empresa_ingreso_final := v_ruta_ingreso->>'nombre_empresa';
      END IF;

      IF v_nombre_empresa_ingreso_final IS NULL THEN
        SELECT e.nombre
        INTO v_nombre_empresa_ingreso_final
        FROM public.tb_empresa e
        WHERE e.id = v_id_empresa_ingreso_final
        LIMIT 1;
      END IF;

      v_id_banco_ingreso_final := v_id_banco_ruta;
      v_nombre_banco_ingreso_final := v_nombre_banco_ruta;
    ELSE
      v_ruta_ingreso := public.f_get_tb_ruta_operacion_caja_ingreso_principal(p_ruta_actual);

      IF v_ruta_ingreso IS NULL THEN
        RETURN jsonb_build_object(
          'filas_procesadas', 0,
          'filas_omitidas', 0,
          'filas_error', 1,
          'detalle', jsonb_build_array(
            jsonb_build_object(
              'fila', 0,
              'estado', 'ERROR',
              'motivo', 'La ruta actual no tiene una caja primaria de ingreso configurada'
            )
          )
        );
      END IF;

      IF p_id_empresa_ingreso IS NOT NULL
         AND p_id_empresa_ingreso <> COALESCE((v_ruta_ingreso->>'id_empresa')::bigint, 0) THEN
        RETURN jsonb_build_object(
          'filas_procesadas', 0,
          'filas_omitidas', 0,
          'filas_error', 1,
          'detalle', jsonb_build_array(
            jsonb_build_object(
              'fila', 0,
              'estado', 'ERROR',
              'motivo', 'La empresa seleccionada no coincide con la caja primaria de ingreso de la ruta'
            )
          )
        );
      END IF;

      v_id_empresa_ingreso_final := (v_ruta_ingreso->>'id_empresa')::bigint;
      v_nombre_empresa_ingreso_final := v_ruta_ingreso->>'nombre_empresa';
      v_id_banco_ingreso_final := (v_ruta_ingreso->>'id_banco')::bigint;
      v_nombre_banco_ingreso_final := v_ruta_ingreso->>'nombre_banco';
    END IF;
  END IF;

  SELECT
    ecb.id,
    ecb.comision_itf_ingreso_salida,
    ecb.flag_por_sol_comision_banco_ingreso,
    ecb.comision_banco_ingreso,
    ecb.comision_minimo_banco_ingreso,
    ecb.comision_igv_banco_ingreso
  INTO
    v_id_empresa_cuenta_ingreso,
    v_itf_cuenta,
    v_flag_por_sol_comision_banco_ingreso,
    v_comision_banco_ingreso,
    v_comision_minimo_banco_ingreso,
    v_comision_igv_banco_ingreso
  FROM public.tb_empresa_cuenta_bancaria ecb
  WHERE ecb.id_empresa = v_id_empresa_ingreso_final
    AND ecb.id_banco = v_id_banco_ingreso_final
  LIMIT 1;

  IF v_id_empresa_cuenta_ingreso IS NULL THEN
    RETURN jsonb_build_object(
      'filas_procesadas', 0,
      'filas_omitidas', 0,
      'filas_error', 1,
      'detalle', jsonb_build_array(
        jsonb_build_object(
          'fila', 0,
          'estado', 'ERROR',
      'motivo', 'No existe una cuenta bancaria de ingreso para la empresa y banco definidos por la ruta'
        )
      )
    );
  END IF;

  v_nombre_archivo_final := COALESCE(NULLIF(BTRIM(p_nombre_archivo), ''), 'Archivo sin nombre');

  INSERT INTO public.tb_operacion_carga_excel (
    nombre_archivo,
    ruta,
    id_empresa_ingreso,
    nombre_empresa_ingreso,
    id_empresa_cuenta_ingreso,
    id_banco,
    nombre_banco,
    id_usuario,
    nombre_usuario
  )
  VALUES (
    v_nombre_archivo_final,
    p_ruta_actual,
    v_id_empresa_ingreso_final,
    v_nombre_empresa_ingreso_final,
    v_id_empresa_cuenta_ingreso,
    v_id_banco_ingreso_final,
    COALESCE(v_nombre_banco_ingreso_final, (SELECT nombre FROM public.tb_banco WHERE id = v_id_banco_ingreso_final LIMIT 1)),
    p_id_usuario,
    v_username
  )
  RETURNING id, fecha_carga INTO v_id_carga_excel, v_fecha_carga_excel;

  FOR v_fila IN
    SELECT *
    FROM jsonb_to_recordset(p_datos_excel_json) AS x(
      dni text,
      monto text,
      codigo_operacion text,
      fecha_pago text,
      hora_proceso text,
      nombre_cliente_banco_ingreso text,
      estado text
    )
  LOOP
    BEGIN
      SELECT valor, tipo
      INTO v_dni_parseado, v_tipo_doc
      FROM public.f_get_tb_parse_documento(
        p_raw := COALESCE(v_fila.dni, ''),
        p_id_codigo_servicio := p_id_codigo_servicio
      );
    EXCEPTION WHEN OTHERS THEN
      v_dni_parseado := '';
    END;

    BEGIN
      v_monto_raw := BTRIM(COALESCE(v_fila.monto, '0'));

      -- Excel puede enviar el resultado como =DECIMAL("2,000.00").
      IF v_monto_raw ~ '^\s*=' THEN
        v_monto_raw := REGEXP_REPLACE(
          v_monto_raw,
          '^.*\(\s*"?([^")]+)"?\s*\).*$','\1'
        );
      END IF;

      v_monto_raw := REGEXP_REPLACE(v_monto_raw, '[^0-9,.-]', '', 'g');
      v_monto_normalizado := v_monto_raw;
      v_ultima_coma := LENGTH(v_monto_raw) - STRPOS(REVERSE(v_monto_raw), ',') + 1;
      v_ultimo_punto := LENGTH(v_monto_raw) - STRPOS(REVERSE(v_monto_raw), '.') + 1;

      IF STRPOS(v_monto_raw, ',') > 0 AND STRPOS(v_monto_raw, '.') > 0 THEN
        IF v_ultima_coma > v_ultimo_punto THEN
          v_monto_normalizado := REPLACE(REPLACE(v_monto_raw, '.', ''), ',', '.');
        ELSE
          v_monto_normalizado := REPLACE(v_monto_raw, ',', '');
        END IF;
      ELSIF STRPOS(v_monto_raw, ',') > 0 THEN
        IF LENGTH(v_monto_raw) - v_ultima_coma <= 2
           AND LENGTH(v_monto_raw) - LENGTH(REPLACE(v_monto_raw, ',', '')) = 1 THEN
          v_monto_normalizado := REPLACE(v_monto_raw, ',', '.');
        ELSE
          v_monto_normalizado := REPLACE(v_monto_raw, ',', '');
        END IF;
      END IF;

      v_monto := COALESCE(NULLIF(v_monto_normalizado, '')::numeric, 0);
      IF v_monto < 0 THEN
        RAISE EXCEPTION 'monto negativo';
      END IF;
      v_monto := ROUND(v_monto, 2);
    EXCEPTION WHEN OTHERS THEN
      v_monto := 0;
    END;

    BEGIN
      v_fecha_deposito := public.f_get_tb_parsear_fecha(v_fila.fecha_pago)::timestamp with time zone;
      IF v_fecha_deposito::time = '00:00:00'::time THEN
        IF COALESCE(v_fila.hora_proceso, '') <> '' THEN
          v_fecha_deposito := (v_fecha_deposito::date + v_fila.hora_proceso::time)::timestamp with time zone;
        ELSE
          v_fecha_deposito := (v_fecha_deposito::date + current_time)::timestamp with time zone;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_fecha_deposito := NOW();
    END;

    v_cliente_id := NULL;
    v_cliente_nombre := '';
    IF COALESCE(v_dni_parseado, '') <> '' THEN
      v_tipo_documento := public.f_get_tb_documento_tipo_codigo(v_tipo_doc);
      SELECT id, nombre
      INTO v_cliente_id, v_cliente_nombre
      FROM public.tb_cliente
      WHERE tipo_documento = v_tipo_documento
        AND numero_documento = v_dni_parseado
      LIMIT 1;

      IF v_cliente_id IS NULL THEN
        SELECT id, nombre
        INTO v_cliente_id, v_cliente_nombre
        FROM (
          SELECT *
          FROM jsonb_to_record(
            public.f_post_tb_cliente(
              p_tipo_documento := v_tipo_documento,
              p_numero_documento := v_dni_parseado,
              p_nombre := '',
              p_id_comunidad := p_id_comunidad,
              p_id_estado := (SELECT id FROM public.tb_estado WHERE UPPER(nombre) = 'ACTIVO' LIMIT 1),
              p_id_usuario := p_id_usuario
            )
          ) AS x(id bigint, nombre character varying)
        ) z;
      END IF;
    END IF;

    v_codigo_duplicidad := NULLIF(BTRIM(COALESCE(v_fila.codigo_operacion, '')), '');
    IF v_codigo_duplicidad IS NOT NULL THEN
      -- Serialize identical deposits across simultaneous Excel loads.
      PERFORM pg_advisory_xact_lock(
        hashtextextended(
          CONCAT_WS('|', p_id_codigo_servicio::text, UPPER(v_codigo_duplicidad), ROUND(COALESCE(v_monto, 0)::numeric, 2)::text),
          0
        )
      );

      SELECT id
      INTO v_dup_id
      FROM public.tb_operacion_proceso
      WHERE 1 = 1
        -- AND dni_cliente = v_dni_parseado
        AND ROUND(COALESCE(monto_deposito_cliente, 0)::numeric, 2) = ROUND(COALESCE(v_monto, 0)::numeric, 2)
        AND UPPER(BTRIM(COALESCE(codigo_operacion_deposito_cliente, ''))) = UPPER(v_codigo_duplicidad)
        AND id_codigo_servicio = p_id_codigo_servicio
        AND fecha_deposito_cliente::date BETWEEN (v_fecha_deposito::date - 7) AND (v_fecha_deposito::date + 7)
      LIMIT 1;
    ELSE
      v_dup_id := NULL;
    END IF;

    IF v_dup_id IS NOT NULL THEN
      v_detalle := v_detalle || jsonb_build_object(
        'fila', v_filas_procesadas + v_filas_omitidas + v_filas_error + 1,
        'codigo_operacion', v_fila.codigo_operacion,
        'estado', 'OMITIDO',
        'motivo', 'Duplicado por monto, codigo de operacion, servicio y ventana de deposito de 7 dias',
        'id_operacion', v_dup_id
      );
      v_filas_omitidas := v_filas_omitidas + 1;
      CONTINUE;
    END IF;

    v_calc_ing := public.f_get_tb_operacion_calculo_comision_banco_ingreso(
      v_flag_por_sol_comision_banco_ingreso,
      v_monto,
      v_comision_banco_ingreso,
      v_comision_minimo_banco_ingreso,
      v_comision_igv_banco_ingreso,
      v_itf_cuenta
    );

    INSERT INTO public.tb_operacion_proceso (
      id_codigo_servicio,
      nombre_codigo_servicio,
      tipo_servicio,
      id_comunidad,
      nombre_comunidad,
      nombre_tipo_deposito,
      id_cliente,
      dni_cliente,
      nombre_cliente,
      id_banco_cliente,
      nombre_banco_cliente,
      monto_deposito_cliente,
      codigo_operacion_deposito_cliente,
      fecha_deposito_cliente,
      id_empresa_ingreso,
      nombre_empresa_ingreso,
      id_empresa_cuenta_ingreso,
      id_banco_empresa_cuenta_ingreso,
      nombre_banco_empresa_cuenta_ingreso,
      flag_por_sol_comision_banco_ingreso,
      comision_banco_ingreso,
      comision_minimo_banco_ingreso,
      comision_igv_banco_ingreso,
      resultado_comision_banco_ingreso,
      monto_itf_ingreso,
      comision_servicio,
      monto_minimo_deposito_servicio,
      comision_minima_servicio,
      comision_monto_extra_servicio,
      resultado_comision_servicio,
      id_empresa_salida,
      nombre_empresa_salida,
      id_empresa_cuenta_salida,
      id_banco_empresa_cuenta_salida,
      nombre_banco_empresa_cuenta_salida,
      resultado_comision_banco_salida,
      monto_transferencia_cliente,
      id_banco_cliente_transferencia,
      nombre_banco_cliente_transferencia,
      id_estado,
      nombre_estado,
      id_usuario,
      nombre_usuario,
      id_usuario_gestor,
      nombre_usuario_gestor,
      ruta_origen,
      ruta_destino,
      flag_derivado,
      flag_retenido,
      fecha_pendiente,
      id_carga_excel,
      nombre_carga_excel,
      fecha_carga_excel,
      tipo_facturacion
    )
    VALUES (
      p_id_codigo_servicio,
      v_excel_nombre_codigo_servicio,
      v_excel_tipo_servicio,
      p_id_comunidad,
      p_nombre_comunidad,
      p_nombre_tipo_deposito,
      v_cliente_id,
      v_dni_parseado,
      COALESCE(v_cliente_nombre, ''),
      v_id_banco_ingreso_final,
      COALESCE(v_nombre_banco_ingreso_final, (SELECT nombre FROM public.tb_banco WHERE id = v_id_banco_ingreso_final LIMIT 1)),
      v_monto,
      COALESCE(v_fila.codigo_operacion, ''),
      v_fecha_deposito,
      v_id_empresa_ingreso_final,
      v_nombre_empresa_ingreso_final,
      v_id_empresa_cuenta_ingreso,
      v_id_banco_ingreso_final,
      COALESCE(v_nombre_banco_ingreso_final, (SELECT nombre FROM public.tb_banco WHERE id = v_id_banco_ingreso_final LIMIT 1)),
      v_flag_por_sol_comision_banco_ingreso,
      v_comision_banco_ingreso,
      v_comision_minimo_banco_ingreso,
      v_comision_igv_banco_ingreso,
      (v_calc_ing->>'resultado_comision_banco_ingreso')::numeric,
      v_itf_cuenta,
      0,
      0,
      0,
      0,
      0,
      v_id_empresa_ingreso_final,
      v_nombre_empresa_ingreso_final,
      v_id_empresa_cuenta_ingreso,
      v_id_banco_ingreso_final,
      COALESCE(v_nombre_banco_ingreso_final, (SELECT nombre FROM public.tb_banco WHERE id = v_id_banco_ingreso_final LIMIT 1)),
      0,
      0,
      v_id_banco_ingreso_final,
      COALESCE(v_nombre_banco_ingreso_final, (SELECT nombre FROM public.tb_banco WHERE id = v_id_banco_ingreso_final LIMIT 1)),
      v_estado_pagado_id,
      v_estado_pagado_nombre,
      p_id_usuario,
      v_username,
      p_id_usuario,
      v_username,
      p_ruta_actual,
      COALESCE(p_ruta_actual, NULL),
      false,
      false,
      NOW(),
      v_id_carga_excel,
      v_nombre_archivo_final,
      v_fecha_carga_excel,
      'Boleta'
    )
    RETURNING id INTO v_new_id;

    v_caja_result := public.f_post_tb_operacion_caja_desde_proceso(
      p_id_operacion_proceso := v_new_id,
      p_tipo_origen := 'EFECTIVIZACION',
      p_tipo_movimiento := 'INGRESO',
      p_id_usuario := p_id_usuario,
      p_nombre_usuario := v_username,
      p_id_estado := v_estado_pagado_id
    );

    IF v_caja_result ? 'error' THEN
      v_detalle := v_detalle || jsonb_build_object(
        'fila', v_filas_procesadas + v_filas_omitidas + v_filas_error + 1,
        'codigo_operacion', v_fila.codigo_operacion,
        'estado', 'ERROR',
        'id_operacion', v_new_id,
        'motivo', v_caja_result->>'error'
      );
      v_filas_error := v_filas_error + 1;
      CONTINUE;
    END IF;

    v_caja_result := public.f_post_tb_operacion_caja_desde_proceso(
      p_id_operacion_proceso := v_new_id,
      p_tipo_origen := 'EFECTIVIZACION',
      p_tipo_movimiento := 'SALIDA',
      p_id_usuario := p_id_usuario,
      p_nombre_usuario := v_username,
      p_id_estado := v_estado_pagado_id
    );

    IF v_caja_result ? 'error' THEN
      v_detalle := v_detalle || jsonb_build_object(
        'fila', v_filas_procesadas + v_filas_omitidas + v_filas_error + 1,
        'codigo_operacion', v_fila.codigo_operacion,
        'estado', 'ERROR',
        'id_operacion', v_new_id,
        'motivo', v_caja_result->>'error'
      );
      v_filas_error := v_filas_error + 1;
      CONTINUE;
    END IF;

    v_detalle := v_detalle || jsonb_build_object(
      'fila', v_filas_procesadas + v_filas_omitidas + v_filas_error + 1,
      'codigo_operacion', v_fila.codigo_operacion,
      'estado', 'PROCESADO',
      'id_operacion', v_new_id
    );
    v_filas_procesadas := v_filas_procesadas + 1;
  END LOOP;

  IF v_id_carga_excel IS NOT NULL THEN
    IF v_filas_procesadas = 0
       AND NOT EXISTS (
         SELECT 1
         FROM public.tb_operacion_proceso
         WHERE id_carga_excel = v_id_carga_excel
       ) THEN
      DELETE FROM public.tb_operacion_carga_excel
      WHERE id = v_id_carga_excel;
    ELSE
      UPDATE public.tb_operacion_carga_excel
      SET filas_procesadas = v_filas_procesadas,
          filas_omitidas = v_filas_omitidas,
          filas_error = v_filas_error
      WHERE id = v_id_carga_excel;
    END IF;
  END IF;

  PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(p_ruta_actual, p_id_usuario);

  RETURN jsonb_build_object(
    'filas_procesadas', v_filas_procesadas,
    'filas_omitidas', v_filas_omitidas,
    'filas_error', v_filas_error,
    'detalle', v_detalle
  );
END;
$$;

/*
Funcion: f_get_tb_operacion_carga_excel_rollback
Objetivo:
  Listar los lotes Excel disponibles para rollback operativo por ruta y cuenta
  activa. Un lote solo esta disponible si todas sus operaciones siguen
  Pendiente y ningun movimiento asociado pertenece a un cierre de caja.
*/
CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_carga_excel_rollback(
  p_ruta character varying DEFAULT NULL,
  p_id_empresa bigint DEFAULT NULL,
  p_id_empresa_cuenta_bancaria bigint DEFAULT NULL,
  p_fecha_carga_desde timestamp with time zone DEFAULT NULL,
  p_fecha_carga_hasta timestamp with time zone DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH lote_resumen AS (
    SELECT
      ce.id,
      ce.nombre_archivo,
      ce.ruta,
      ce.id_empresa_ingreso,
      ce.nombre_empresa_ingreso,
      ce.id_empresa_cuenta_ingreso,
      ce.fecha_carga,
      COUNT(op.id)::integer AS total_operaciones,
      COUNT(op.id) FILTER (
        WHERE UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'PENDIENTE'
      )::integer AS operaciones_no_pendientes,
      COUNT(DISTINCT oc.id) FILTER (
        WHERE oc.id_caja_cierre IS NOT NULL
      )::integer AS movimientos_cerrados
    FROM public.tb_operacion_carga_excel ce
    JOIN public.tb_operacion_proceso op ON op.id_carga_excel = ce.id
    LEFT JOIN public.tb_operacion_caja oc ON oc.id_operacion_proceso = op.id
    WHERE (p_ruta IS NULL OR LOWER(COALESCE(ce.ruta, '')) = LOWER(p_ruta))
      AND (p_id_empresa IS NULL OR ce.id_empresa_ingreso = p_id_empresa)
      AND (p_id_empresa_cuenta_bancaria IS NULL OR ce.id_empresa_cuenta_ingreso = p_id_empresa_cuenta_bancaria)
      AND (p_fecha_carga_desde IS NULL OR ce.fecha_carga >= p_fecha_carga_desde)
      AND (p_fecha_carga_hasta IS NULL OR ce.fecha_carga <= p_fecha_carga_hasta)
    GROUP BY
      ce.id,
      ce.nombre_archivo,
      ce.ruta,
      ce.id_empresa_ingreso,
      ce.nombre_empresa_ingreso,
      ce.id_empresa_cuenta_ingreso,
      ce.fecha_carga
  )
  SELECT jsonb_build_object(
    'id', lr.id,
    'nombre_excel', COALESCE(lr.nombre_archivo, 'Archivo sin nombre'),
    'fecha_carga', lr.fecha_carga,
    'ruta', lr.ruta,
    'id_empresa', lr.id_empresa_ingreso,
    'empresa', lr.nombre_empresa_ingreso,
    'id_empresa_cuenta_bancaria', lr.id_empresa_cuenta_ingreso,
    'total_operaciones', lr.total_operaciones,
    'disponible', (lr.operaciones_no_pendientes = 0 AND lr.movimientos_cerrados = 0),
    'detalle', CASE
      WHEN lr.operaciones_no_pendientes = 0 AND lr.movimientos_cerrados = 0
        THEN 'Todas las operaciones estan en estado Pendiente.'
      WHEN lr.movimientos_cerrados > 0
        THEN 'El lote tiene movimientos cerrados por caja.'
      ELSE 'Todas las operaciones deben estar en estado Pendiente.'
    END,
    'operaciones_no_pendientes', lr.operaciones_no_pendientes,
    'movimientos_cerrados', lr.movimientos_cerrados
  )
  FROM lote_resumen lr
  WHERE lr.total_operaciones > 0
  ORDER BY lr.fecha_carga DESC, lr.id DESC;
END;
$$;

/*
Funcion: f_delete_tb_operacion_carga_excel_rollback
Objetivo:
  Revertir y eliminar fisicamente un lote Excel completo cuando todas sus
  operaciones siguen pendientes y sin movimientos cerrados.
*/
CREATE OR REPLACE FUNCTION public.f_delete_tb_operacion_carga_excel_rollback(
  p_id_carga_excel bigint,
  p_id_usuario bigint DEFAULT NULL,
  p_nombre_usuario character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lote record;
  v_mov record;
  v_operaciones_eliminadas integer := 0;
  v_movimientos_revertidos integer := 0;
  v_rutas character varying[];
  v_ruta character varying;
BEGIN
  SELECT *
  INTO v_lote
  FROM public.tb_operacion_carga_excel
  WHERE id = p_id_carga_excel
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'La carga Excel no existe.');
  END IF;

  SELECT COUNT(*)::integer
  INTO v_operaciones_eliminadas
  FROM public.tb_operacion_proceso op
  WHERE op.id_carga_excel = p_id_carga_excel;

  IF v_operaciones_eliminadas = 0 THEN
    DELETE FROM public.tb_operacion_carga_excel
    WHERE id = p_id_carga_excel;

    RETURN jsonb_build_object(
      'id_carga_excel', p_id_carga_excel,
      'operaciones_eliminadas', 0,
      'movimientos_revertidos', 0,
      'lote_eliminado', true
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_operacion_proceso op
    WHERE op.id_carga_excel = p_id_carga_excel
      AND UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'PENDIENTE'
  ) THEN
    RETURN jsonb_build_object('error', 'Todas las operaciones deben estar en estado Pendiente.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_operacion_caja oc
    JOIN public.tb_operacion_proceso op ON op.id = oc.id_operacion_proceso
    WHERE op.id_carga_excel = p_id_carga_excel
      AND oc.id_caja_cierre IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('error', 'El lote tiene movimientos cerrados por caja.');
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT ruta
    FROM (
      SELECT ruta_origen AS ruta
      FROM public.tb_operacion_proceso
      WHERE id_carga_excel = p_id_carga_excel

      UNION

      SELECT ruta_destino AS ruta
      FROM public.tb_operacion_proceso
      WHERE id_carga_excel = p_id_carga_excel
    ) r
    WHERE ruta IS NOT NULL
  )
  INTO v_rutas;

  UPDATE public.tb_operacion_caja oc
  SET id_operacion_caja_relacionada = NULL
  WHERE oc.id_operacion_caja_relacionada IN (
    SELECT rel.id
    FROM public.tb_operacion_caja rel
    JOIN public.tb_operacion_proceso op ON op.id = rel.id_operacion_proceso
    WHERE op.id_carga_excel = p_id_carga_excel
  );

  FOR v_mov IN
    SELECT oc.*
    FROM public.tb_operacion_caja oc
    JOIN public.tb_operacion_proceso op ON op.id = oc.id_operacion_proceso
    WHERE op.id_carga_excel = p_id_carga_excel
      AND oc.id_caja_cierre IS NULL
    ORDER BY oc.id DESC
  LOOP
    PERFORM public.f_apply_tb_operacion_caja_delta(
      p_id_caja := v_mov.id_caja,
      p_tipo_movimiento := v_mov.tipo_movimiento,
      p_nombre_estado := v_mov.nombre_estado,
      p_monto_ingreso := COALESCE(v_mov.monto_ingreso, 0),
      p_monto_gasto := COALESCE(v_mov.monto_gasto, 0),
      p_monto_ganancia := COALESCE(v_mov.monto_ganancia, 0),
      p_monto_salida := COALESCE(v_mov.monto_salida, 0),
      p_flag_contabiliza_operacion := COALESCE(v_mov.flag_contabiliza_operacion, true),
      p_factor := -1,
      p_id_usuario := p_id_usuario
    );

    v_movimientos_revertidos := v_movimientos_revertidos + 1;
  END LOOP;

  DELETE FROM public.tb_operacion_caja oc
  USING public.tb_operacion_proceso op
  WHERE op.id = oc.id_operacion_proceso
    AND op.id_carga_excel = p_id_carga_excel;

  UPDATE public.tb_operacion_proceso op
  SET id_operacion_match = NULL
  WHERE op.id_operacion_match IN (
    SELECT id
    FROM public.tb_operacion_proceso
    WHERE id_carga_excel = p_id_carga_excel
  );

  UPDATE public.tb_operacion_proceso op
  SET id_operacion_padre = NULL
  WHERE op.id_operacion_padre IN (
    SELECT id
    FROM public.tb_operacion_proceso
    WHERE id_carga_excel = p_id_carga_excel
  );

  DELETE FROM public.tb_operacion_proceso
  WHERE id_carga_excel = p_id_carga_excel;

  DELETE FROM public.tb_operacion_carga_excel
  WHERE id = p_id_carga_excel;

  FOREACH v_ruta IN ARRAY COALESCE(v_rutas, ARRAY[]::character varying[]) LOOP
    PERFORM public.f_sync_tb_ruta_operacion_kpi_operacion(v_ruta, p_id_usuario);
    PERFORM public.f_sync_tb_ruta_operacion_kpi_caja(v_ruta, p_id_usuario);
  END LOOP;

  RETURN jsonb_build_object(
    'id_carga_excel', p_id_carga_excel,
    'operaciones_eliminadas', v_operaciones_eliminadas,
    'movimientos_revertidos', v_movimientos_revertidos,
    'lote_eliminado', true
  );
END;
$$;

/*
Funcion: f_patch_tb_operacion_proceso_tipo_recaudacion_sf
Objetivo:
  Corregir la modalidad informativa de recaudacion SafetyPay de una operacion
  cuando el usuario cargo el Excel con la modalidad equivocada.

Reglas:
  - solo aplica a la ruta safetypay;
  - solo acepta Manual o Automatico;
  - no modifica saldos, movimientos ni KPI de caja.
*/
CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_proceso_tipo_recaudacion_sf(
  p_id bigint,
  p_tipo_recaudacion_sf character varying,
  p_id_usuario_gestor bigint DEFAULT NULL,
  p_nombre_usuario_gestor character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual record;
  v_tipo_recaudacion_sf character varying;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_actual
  FROM public.tb_operacion_proceso
  WHERE id = p_id
  LIMIT 1;

  IF v_actual.id IS NULL THEN
    RETURN jsonb_build_object('error', 'La operacion no existe.');
  END IF;

  IF LOWER(COALESCE(v_actual.ruta_destino, v_actual.ruta_origen, '')) <> 'safetypay' THEN
    RETURN jsonb_build_object('error', 'La modalidad de recaudacion solo aplica a SafetyPay.');
  END IF;

  v_tipo_recaudacion_sf := CASE
    WHEN UPPER(BTRIM(COALESCE(p_tipo_recaudacion_sf, ''))) = 'MANUAL' THEN 'Manual'
    WHEN UPPER(BTRIM(COALESCE(p_tipo_recaudacion_sf, ''))) = 'AUTOMATICO' THEN 'Automatico'
    ELSE NULL
  END;

  IF v_tipo_recaudacion_sf IS NULL THEN
    RETURN jsonb_build_object('error', 'tipo_recaudacion_sf debe ser Manual o Automatico.');
  END IF;

  UPDATE public.tb_operacion_proceso
  SET tipo_recaudacion_sf = v_tipo_recaudacion_sf,
      id_usuario_gestor = COALESCE(p_id_usuario_gestor, id_usuario_gestor),
      nombre_usuario_gestor = COALESCE(p_nombre_usuario_gestor, nombre_usuario_gestor)
  WHERE id = p_id;

  SELECT x
  INTO v_result
  FROM public.f_get_tb_operacion_proceso(p_id := p_id) AS x
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
WHERE p.proname IN (
  'f_delete_tb_operacion_carga_excel_rollback',
  'f_get_tb_operacion_carga_excel_rollback',
  'f_get_tb_operacion_proceso',
  'f_get_tb_parse_documento',
  'f_get_tb_operacion_comision_efectivizacion_cliente',
  'f_get_tb_operacion_calculo_comision_servicio',
  'f_get_tb_operacion_calculo_comision_banco_ingreso',
  'f_get_tb_operacion_calculo_comision_banco_salida',
  'f_get_tb_operacion_proceso_calculo',
  'f_patch_tb_operacion_proceso_base',
  'f_patch_tb_operacion_proceso_comision_extra',
  'f_patch_tb_operacion_proceso_comision_recurrente',
  'f_patch_tb_operacion_proceso_eliminar',
  'f_patch_tb_operacion_proceso_pagado',
  'f_patch_tb_operacion_proceso_pagado_lote',
  'f_patch_tb_operacion_proceso_restaurar',
  'f_post_tb_operacion_proceso',
  'f_post_tb_operacion_proceso_excel',
  'f_post_tb_operacion_proceso_excel_ganancia'
)
ORDER BY n.nspname, p.proname;
