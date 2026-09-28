-- ============================================================================
-- 36. RECORDATORIOS DE OPERACIONES PENDIENTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tb_operacion_recordatorio (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_operacion_proceso bigint NOT NULL,
  id_usuario_destinatario bigint NOT NULL,
  id_usuario_ultimo_emisor bigint NOT NULL,
  id_sucursal bigint,
  servicio character varying NOT NULL,
  nivel_alerta smallint NOT NULL,
  codigo_mensaje character varying NOT NULL,
  mensaje_snapshot text NOT NULL,
  codigo_operacion_snapshot character varying NOT NULL,
  dni_snapshot character varying,
  cliente_snapshot character varying,
  entidad_snapshot character varying,
  monto_snapshot numeric(18,2) NOT NULL DEFAULT 0,
  fecha_operacion_snapshot timestamp with time zone,
  ruta_operativa character varying NOT NULL,
  estado character varying NOT NULL DEFAULT 'PENDIENTE',
  cantidad_envios integer NOT NULL DEFAULT 1,
  fecha_primer_envio timestamp with time zone NOT NULL DEFAULT now(),
  fecha_ultimo_envio timestamp with time zone NOT NULL DEFAULT now(),
  fecha_primera_lectura timestamp with time zone,
  fecha_ultima_lectura timestamp with time zone,
  fecha_cierre timestamp with time zone,
  motivo_cierre character varying,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_operacion_recordatorio_operacion_fk
    FOREIGN KEY (id_operacion_proceso) REFERENCES public.tb_operacion_proceso(id),
  CONSTRAINT tb_operacion_recordatorio_destinatario_fk
    FOREIGN KEY (id_usuario_destinatario) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_operacion_recordatorio_emisor_fk
    FOREIGN KEY (id_usuario_ultimo_emisor) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_operacion_recordatorio_sucursal_fk
    FOREIGN KEY (id_sucursal) REFERENCES public.tb_sucursal(id),
  CONSTRAINT tb_operacion_recordatorio_nivel_check
    CHECK (nivel_alerta BETWEEN 1 AND 3),
  CONSTRAINT tb_operacion_recordatorio_estado_check
    CHECK (estado IN ('PENDIENTE', 'CERRADO', 'ANULADO'))
);

CREATE UNIQUE INDEX IF NOT EXISTS tb_operacion_recordatorio_activo_uidx
  ON public.tb_operacion_recordatorio (id_operacion_proceso, id_usuario_destinatario)
  WHERE estado = 'PENDIENTE';

CREATE INDEX IF NOT EXISTS tb_operacion_recordatorio_bandeja_idx
  ON public.tb_operacion_recordatorio (
    id_usuario_destinatario, estado, nivel_alerta DESC, fecha_ultimo_envio DESC
  );

CREATE TABLE IF NOT EXISTS public.tb_operacion_recordatorio_envio (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_recordatorio bigint NOT NULL,
  id_usuario_emisor bigint NOT NULL,
  nivel_alerta smallint NOT NULL,
  codigo_mensaje character varying NOT NULL,
  mensaje_snapshot text NOT NULL,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tb_operacion_recordatorio_envio_recordatorio_fk
    FOREIGN KEY (id_recordatorio) REFERENCES public.tb_operacion_recordatorio(id),
  CONSTRAINT tb_operacion_recordatorio_envio_emisor_fk
    FOREIGN KEY (id_usuario_emisor) REFERENCES public.tb_usuario(id),
  CONSTRAINT tb_operacion_recordatorio_envio_nivel_check
    CHECK (nivel_alerta BETWEEN 1 AND 3)
);

CREATE INDEX IF NOT EXISTS tb_operacion_recordatorio_envio_historial_idx
  ON public.tb_operacion_recordatorio_envio (id_recordatorio, fecha_registro DESC);

CREATE OR REPLACE FUNCTION public.f_private_operacion_recordatorio_actor()
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id bigint;
BEGIN
  SELECT u.id
  INTO v_id
  FROM public.tb_usuario u
  JOIN public.tb_estado e ON e.id = u.id_estado
  WHERE UPPER(BTRIM(e.nombre)) = 'ACTIVO'
    AND (
      u.auth_user_id = auth.uid()
      OR (u.auth_user_id IS NULL AND LOWER(u.email) = LOWER(auth.jwt() ->> 'email'))
    )
  ORDER BY (u.auth_user_id = auth.uid()) DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo validar el usuario autenticado';
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.f_private_operacion_recordatorio_puede_enviar(
  p_id_usuario bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tb_usuario u
    WHERE u.id = p_id_usuario
      AND (
        COALESCE(u.flag_super_admin, false)
        OR u.id_rol = 1
        OR EXISTS (
          SELECT 1
          FROM public.tb_permiso_usuario pu
          JOIN public.tb_permiso_menu pm ON pm.id = pu.id_permiso_menu
          JOIN public.tb_estado ep ON ep.id = pu.id_estado
          JOIN public.tb_estado em ON em.id = pm.id_estado
          WHERE pu.id_usuario = u.id
            AND pm.ruta = '/reportes/metricas-bancarias'
            AND UPPER(BTRIM(ep.nombre)) = 'ACTIVO'
            AND UPPER(BTRIM(em.nombre)) = 'ACTIVO'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.f_private_operacion_recordatorio_pendiente(
  p_id_operacion_proceso bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN COALESCE(op.id_estado, 0) = 10
        OR UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'ELIMINADO'
        THEN false
      WHEN UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) = 'SOLICITUD'
        THEN NOT (
          op.id_operacion_match IS NOT NULL
          OR COALESCE(op.monto_devuelto, 0) > 0
          OR UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) = 'PAGADO'
        )
      WHEN LOWER(BTRIM(COALESCE(op.ruta_origen, ''))) IN ('pos', 'linkpago')
        THEN UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) <> 'PAGADO'
      ELSE
        UPPER(BTRIM(COALESCE(op.nombre_estado, ''))) NOT IN (
          'PAGADO', 'PROCESADO', 'DEVUELTO', 'RECHAZADO'
        )
        AND COALESCE(op.monto_transferencia_cliente, 0) > 0
    END
    FROM public.tb_operacion_proceso op
    WHERE op.id = p_id_operacion_proceso
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.f_private_operacion_recordatorio_reconciliar(
  p_id_usuario_destinatario bigint
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actualizados integer;
BEGIN
  UPDATE public.tb_operacion_recordatorio r
  SET estado = 'CERRADO',
      fecha_cierre = now(),
      motivo_cierre = 'La operacion dejo de estar pendiente',
      fecha_actualizacion = now()
  WHERE r.id_usuario_destinatario = p_id_usuario_destinatario
    AND r.estado = 'PENDIENTE'
    AND NOT public.f_private_operacion_recordatorio_pendiente(r.id_operacion_proceso);

  GET DIAGNOSTICS v_actualizados = ROW_COUNT;
  RETURN v_actualizados;
END;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_recordatorio_contexto(
  p_id_operacion_proceso bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor bigint := public.f_private_operacion_recordatorio_actor();
  v_resultado jsonb;
BEGIN
  IF NOT public.f_private_operacion_recordatorio_puede_enviar(v_actor) THEN
    RAISE EXCEPTION 'No tiene acceso autorizado a Metricas Bancarias';
  END IF;

  SELECT jsonb_build_object(
    'id_operacion', op.id,
    'codigo_operacion', COALESCE(NULLIF(BTRIM(op.codigo_operacion_deposito_cliente), ''), op.id::text),
    'id_usuario_destinatario', COALESCE(op.id_usuario_solicitud, op.id_usuario),
    'usuario_destinatario', COALESCE(NULLIF(BTRIM(u.nombre), ''), NULLIF(BTRIM(op.nombre_usuario_solicitud), ''), 'Sin usuario'),
    'servicio', CASE
      WHEN UPPER(BTRIM(COALESCE(op.tipo_flujo_pago_deuda, ''))) = 'SOLICITUD' THEN 'PAGO_DEUDA'
      WHEN LOWER(BTRIM(COALESCE(op.ruta_origen, ''))) = 'pos' THEN 'POS'
      WHEN LOWER(BTRIM(COALESCE(op.ruta_origen, ''))) = 'linkpago' THEN 'LINK_PAGO'
      ELSE 'EFECTIVIZACION'
    END,
    'dni', COALESCE(NULLIF(BTRIM(cl.numero_documento), ''), NULLIF(BTRIM(op.dni_cliente), ''), '-'),
    'cliente', COALESCE(NULLIF(BTRIM(cl.nombre), ''), NULLIF(BTRIM(op.nombre_cliente), ''), 'Sin nombre'),
    'sucursal', COALESCE(NULLIF(BTRIM(s.nombre), ''), 'Sin sede'),
    'entidad', COALESCE(NULLIF(BTRIM(op.nombre_banco_cliente), ''), NULLIF(BTRIM(op.nombre_pos), ''), NULLIF(BTRIM(op.ruta_destino), ''), 'Sin entidad'),
    'monto', COALESCE(op.monto_deposito_cliente, 0),
    'fecha_operacion', op.fecha_registro,
    'estado', COALESCE(NULLIF(BTRIM(op.nombre_estado), ''), 'Sin estado'),
    'esta_pendiente', public.f_private_operacion_recordatorio_pendiente(op.id),
    'recordatorio_activo', EXISTS (
      SELECT 1 FROM public.tb_operacion_recordatorio r
      WHERE r.id_operacion_proceso = op.id AND r.estado = 'PENDIENTE'
    )
  )
  INTO v_resultado
  FROM public.tb_operacion_proceso op
  LEFT JOIN public.tb_usuario u ON u.id = COALESCE(op.id_usuario_solicitud, op.id_usuario)
  LEFT JOIN public.tb_estado eu ON eu.id = u.id_estado
  LEFT JOIN public.tb_sucursal s ON s.id = u.id_sucursal
  LEFT JOIN public.tb_cliente cl ON cl.id = op.id_cliente
  WHERE op.id = p_id_operacion_proceso
    AND (u.id IS NULL OR UPPER(BTRIM(COALESCE(eu.nombre, ''))) = 'ACTIVO');

  IF v_resultado IS NULL THEN
    RAISE EXCEPTION 'La operacion no existe o su usuario responsable esta inactivo';
  END IF;

  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.f_post_tb_operacion_recordatorio(
  p_id_operacion_proceso bigint,
  p_nivel_alerta smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor bigint := public.f_private_operacion_recordatorio_actor();
  v_op public.tb_operacion_proceso%ROWTYPE;
  v_destinatario public.tb_usuario%ROWTYPE;
  v_id_recordatorio bigint;
  v_codigo character varying;
  v_mensaje text;
  v_servicio character varying;
  v_ruta character varying;
  v_sucursal bigint;
BEGIN
  IF NOT public.f_private_operacion_recordatorio_puede_enviar(v_actor) THEN
    RAISE EXCEPTION 'No tiene acceso autorizado a Metricas Bancarias';
  END IF;
  IF p_nivel_alerta NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'El nivel de alerta debe ser 1, 2 o 3';
  END IF;

  SELECT * INTO v_op
  FROM public.tb_operacion_proceso
  WHERE id = p_id_operacion_proceso
  FOR UPDATE;

  IF v_op.id IS NULL THEN
    RAISE EXCEPTION 'La operacion no existe';
  END IF;
  IF NOT public.f_private_operacion_recordatorio_pendiente(v_op.id) THEN
    RAISE EXCEPTION 'La operacion ya no se encuentra pendiente';
  END IF;
  IF COALESCE(v_op.id_usuario_solicitud, v_op.id_usuario) IS NULL THEN
    RAISE EXCEPTION 'La operacion no tiene un usuario responsable';
  END IF;

  SELECT u.* INTO v_destinatario
  FROM public.tb_usuario u
  JOIN public.tb_estado e ON e.id = u.id_estado
  WHERE u.id = COALESCE(v_op.id_usuario_solicitud, v_op.id_usuario)
    AND UPPER(BTRIM(e.nombre)) = 'ACTIVO';

  IF v_destinatario.id IS NULL THEN
    RAISE EXCEPTION 'El usuario responsable esta inactivo o no existe';
  END IF;

  SELECT codigo, mensaje
  INTO v_codigo, v_mensaje
  FROM (VALUES
    (1::smallint, 'RECORDATORIO'::character varying, 'Tienes una operacion pendiente. Por favor, revisala y completa su cierre.'::text),
    (2::smallint, 'IMPORTANTE'::character varying, 'Esta operacion continua pendiente y requiere que regularices su cierre a la brevedad.'::text),
    (3::smallint, 'URGENTE'::character varying, 'Alerta urgente: debes atender y cerrar esta operacion pendiente de inmediato.'::text)
  ) AS plantilla(nivel, codigo, mensaje)
  WHERE nivel = p_nivel_alerta;

  v_servicio := CASE
    WHEN UPPER(BTRIM(COALESCE(v_op.tipo_flujo_pago_deuda, ''))) = 'SOLICITUD' THEN 'PAGO_DEUDA'
    WHEN LOWER(BTRIM(COALESCE(v_op.ruta_origen, ''))) = 'pos' THEN 'POS'
    WHEN LOWER(BTRIM(COALESCE(v_op.ruta_origen, ''))) = 'linkpago' THEN 'LINK_PAGO'
    ELSE 'EFECTIVIZACION'
  END;
  v_ruta := CASE v_servicio
    WHEN 'PAGO_DEUDA' THEN '/operaciones/pago-deuda'
    WHEN 'POS' THEN '/operaciones/pos'
    WHEN 'LINK_PAGO' THEN '/operaciones/linkpago'
    ELSE '/operaciones/' || LOWER(BTRIM(COALESCE(v_op.ruta_destino, v_op.ruta_origen, '')))
  END;
  v_sucursal := v_destinatario.id_sucursal;

  SELECT id INTO v_id_recordatorio
  FROM public.tb_operacion_recordatorio
  WHERE id_operacion_proceso = v_op.id
    AND id_usuario_destinatario = v_destinatario.id
    AND estado = 'PENDIENTE'
  FOR UPDATE;

  IF v_id_recordatorio IS NULL THEN
    INSERT INTO public.tb_operacion_recordatorio (
      id_operacion_proceso, id_usuario_destinatario, id_usuario_ultimo_emisor,
      id_sucursal, servicio, nivel_alerta, codigo_mensaje, mensaje_snapshot,
      codigo_operacion_snapshot, dni_snapshot, cliente_snapshot,
      entidad_snapshot, monto_snapshot, fecha_operacion_snapshot, ruta_operativa
    )
    SELECT
      v_op.id, v_destinatario.id, v_actor, v_sucursal, v_servicio,
      p_nivel_alerta, v_codigo, v_mensaje,
      COALESCE(NULLIF(BTRIM(v_op.codigo_operacion_deposito_cliente), ''), v_op.id::text),
      COALESCE(NULLIF(BTRIM(cl.numero_documento), ''), NULLIF(BTRIM(v_op.dni_cliente), ''), '-'),
      COALESCE(NULLIF(BTRIM(cl.nombre), ''), NULLIF(BTRIM(v_op.nombre_cliente), ''), 'Sin nombre'),
      COALESCE(NULLIF(BTRIM(v_op.nombre_banco_cliente), ''), NULLIF(BTRIM(v_op.nombre_pos), ''), NULLIF(BTRIM(v_op.ruta_destino), ''), 'Sin entidad'),
      COALESCE(v_op.monto_deposito_cliente, 0), v_op.fecha_registro, v_ruta
    FROM (SELECT 1) seed
    LEFT JOIN public.tb_cliente cl ON cl.id = v_op.id_cliente
    RETURNING id INTO v_id_recordatorio;
  ELSE
    UPDATE public.tb_operacion_recordatorio
    SET id_usuario_ultimo_emisor = v_actor,
        nivel_alerta = GREATEST(nivel_alerta, p_nivel_alerta),
        codigo_mensaje = CASE WHEN p_nivel_alerta >= nivel_alerta THEN v_codigo ELSE codigo_mensaje END,
        mensaje_snapshot = CASE WHEN p_nivel_alerta >= nivel_alerta THEN v_mensaje ELSE mensaje_snapshot END,
        cantidad_envios = cantidad_envios + 1,
        fecha_ultimo_envio = now(),
        fecha_actualizacion = now()
    WHERE id = v_id_recordatorio;
  END IF;

  INSERT INTO public.tb_operacion_recordatorio_envio (
    id_recordatorio, id_usuario_emisor, nivel_alerta, codigo_mensaje, mensaje_snapshot
  ) VALUES (
    v_id_recordatorio, v_actor, p_nivel_alerta, v_codigo, v_mensaje
  );

  RETURN jsonb_build_object(
    'id', v_id_recordatorio,
    'id_operacion', v_op.id,
    'id_usuario_destinatario', v_destinatario.id,
    'usuario_destinatario', v_destinatario.nombre,
    'nivel_alerta', p_nivel_alerta,
    'codigo_mensaje', v_codigo,
    'mensaje', v_mensaje,
    'estado', 'PENDIENTE'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_recordatorio_resumen()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor bigint := public.f_private_operacion_recordatorio_actor();
  v_resultado jsonb;
BEGIN
  PERFORM public.f_private_operacion_recordatorio_reconciliar(v_actor);

  SELECT jsonb_build_object(
    'activos', COUNT(*) FILTER (WHERE estado = 'PENDIENTE'),
    'nuevos', COUNT(*) FILTER (WHERE estado = 'PENDIENTE' AND fecha_primera_lectura IS NULL),
    'nivel_1', COUNT(*) FILTER (WHERE estado = 'PENDIENTE' AND nivel_alerta = 1),
    'nivel_2', COUNT(*) FILTER (WHERE estado = 'PENDIENTE' AND nivel_alerta = 2),
    'nivel_3', COUNT(*) FILTER (WHERE estado = 'PENDIENTE' AND nivel_alerta = 3)
  )
  INTO v_resultado
  FROM public.tb_operacion_recordatorio
  WHERE id_usuario_destinatario = v_actor;

  RETURN COALESCE(v_resultado, jsonb_build_object(
    'activos', 0, 'nuevos', 0, 'nivel_1', 0, 'nivel_2', 0, 'nivel_3', 0
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.f_get_tb_operacion_recordatorio_bandeja(
  p_vista character varying DEFAULT 'PENDIENTES',
  p_nivel_alerta smallint DEFAULT NULL,
  p_servicio character varying DEFAULT NULL,
  p_busqueda character varying DEFAULT NULL,
  p_pagina integer DEFAULT 1,
  p_tamano_pagina integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor bigint := public.f_private_operacion_recordatorio_actor();
  v_vista character varying := UPPER(BTRIM(COALESCE(p_vista, 'PENDIENTES')));
  v_pagina integer := GREATEST(COALESCE(p_pagina, 1), 1);
  v_tamano integer := LEAST(GREATEST(COALESCE(p_tamano_pagina, 20), 1), 100);
  v_total bigint;
  v_items jsonb;
BEGIN
  IF v_vista NOT IN ('PENDIENTES', 'HISTORIAL') THEN
    RAISE EXCEPTION 'La vista debe ser PENDIENTES o HISTORIAL';
  END IF;

  PERFORM public.f_private_operacion_recordatorio_reconciliar(v_actor);

  WITH base AS (
    SELECT
      r.*,
      COALESCE(s.nombre, 'Sin sede') AS sucursal,
      COALESCE(em.nombre, 'Sin usuario') AS emisor,
      COALESCE(op.nombre_estado, 'Sin estado') AS estado_operacion
    FROM public.tb_operacion_recordatorio r
    LEFT JOIN public.tb_sucursal s ON s.id = r.id_sucursal
    LEFT JOIN public.tb_usuario em ON em.id = r.id_usuario_ultimo_emisor
    LEFT JOIN public.tb_operacion_proceso op ON op.id = r.id_operacion_proceso
    WHERE r.id_usuario_destinatario = v_actor
      AND (
        (v_vista = 'PENDIENTES' AND r.estado = 'PENDIENTE')
        OR (v_vista = 'HISTORIAL' AND r.estado IN ('CERRADO', 'ANULADO'))
      )
      AND (p_nivel_alerta IS NULL OR r.nivel_alerta = p_nivel_alerta)
      AND (p_servicio IS NULL OR r.servicio = UPPER(BTRIM(p_servicio)))
      AND (
        p_busqueda IS NULL OR BTRIM(p_busqueda) = ''
        OR r.codigo_operacion_snapshot ILIKE '%' || BTRIM(p_busqueda) || '%'
        OR r.dni_snapshot ILIKE '%' || BTRIM(p_busqueda) || '%'
        OR r.cliente_snapshot ILIKE '%' || BTRIM(p_busqueda) || '%'
        OR r.mensaje_snapshot ILIKE '%' || BTRIM(p_busqueda) || '%'
      )
  ), pagina AS (
    SELECT *
    FROM base
    ORDER BY nivel_alerta DESC, fecha_ultimo_envio DESC, id DESC
    LIMIT v_tamano OFFSET (v_pagina - 1) * v_tamano
  )
  SELECT
    (SELECT COUNT(*) FROM base),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'id_operacion', p.id_operacion_proceso,
      'nivel_alerta', p.nivel_alerta,
      'codigo_mensaje', p.codigo_mensaje,
      'comentario', p.mensaje_snapshot,
      'servicio', p.servicio,
      'codigo_operacion', p.codigo_operacion_snapshot,
      'fecha_operacion', p.fecha_operacion_snapshot,
      'dni', p.dni_snapshot,
      'cliente', p.cliente_snapshot,
      'sucursal', p.sucursal,
      'entidad', p.entidad_snapshot,
      'monto', p.monto_snapshot,
      'estado_operacion', p.estado_operacion,
      'estado_recordatorio', p.estado,
      'emisor', p.emisor,
      'fecha_ultimo_envio', p.fecha_ultimo_envio,
      'cantidad_envios', p.cantidad_envios,
      'leido', p.fecha_primera_lectura IS NOT NULL,
      'fecha_cierre', p.fecha_cierre,
      'ruta_operativa', p.ruta_operativa
    ) ORDER BY p.nivel_alerta DESC, p.fecha_ultimo_envio DESC, p.id DESC), '[]'::jsonb)
  INTO v_total, v_items
  FROM pagina p;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'pagina', v_pagina,
    'tamano_pagina', v_tamano,
    'total_paginas', CASE WHEN COALESCE(v_total, 0) = 0 THEN 0
      ELSE CEIL(v_total::numeric / v_tamano)::integer END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.f_patch_tb_operacion_recordatorio_lectura(
  p_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor bigint := public.f_private_operacion_recordatorio_actor();
  v_resultado jsonb;
BEGIN
  UPDATE public.tb_operacion_recordatorio
  SET fecha_primera_lectura = COALESCE(fecha_primera_lectura, now()),
      fecha_ultima_lectura = now(),
      fecha_actualizacion = now()
  WHERE id = p_id
    AND id_usuario_destinatario = v_actor
  RETURNING jsonb_build_object(
    'id', id,
    'leido', true,
    'fecha_ultima_lectura', fecha_ultima_lectura
  ) INTO v_resultado;

  IF v_resultado IS NULL THEN
    RAISE EXCEPTION 'El recordatorio no existe o no pertenece al usuario';
  END IF;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON TABLE public.tb_operacion_recordatorio FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tb_operacion_recordatorio_envio FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.f_private_operacion_recordatorio_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.f_private_operacion_recordatorio_puede_enviar(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.f_private_operacion_recordatorio_pendiente(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.f_private_operacion_recordatorio_reconciliar(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.f_get_tb_operacion_recordatorio_contexto(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.f_post_tb_operacion_recordatorio(bigint, smallint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.f_get_tb_operacion_recordatorio_resumen() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.f_get_tb_operacion_recordatorio_bandeja(character varying, smallint, character varying, character varying, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.f_patch_tb_operacion_recordatorio_lectura(bigint) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.f_get_tb_operacion_recordatorio_contexto(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.f_post_tb_operacion_recordatorio(bigint, smallint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.f_get_tb_operacion_recordatorio_resumen() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.f_get_tb_operacion_recordatorio_bandeja(character varying, smallint, character varying, character varying, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.f_patch_tb_operacion_recordatorio_lectura(bigint) TO authenticated, service_role;

SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'f_private_operacion_recordatorio_actor',
  'f_private_operacion_recordatorio_puede_enviar',
  'f_private_operacion_recordatorio_pendiente',
  'f_private_operacion_recordatorio_reconciliar',
  'f_get_tb_operacion_recordatorio_contexto',
  'f_post_tb_operacion_recordatorio',
  'f_get_tb_operacion_recordatorio_resumen',
  'f_get_tb_operacion_recordatorio_bandeja',
  'f_patch_tb_operacion_recordatorio_lectura'
)
ORDER BY n.nspname, p.proname;
