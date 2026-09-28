-- ============================================================================
-- COMPENSACIONES - NAVEGACION DEL FRONTEND
-- ============================================================================
-- Objetivo:
--   Registrar de forma idempotente el grupo Compensaciones y sus pantallas
--   habilitadas. Los superadministradores las reciben automaticamente; para
--   los demas usuarios debe asignarse cada permiso de pantalla.
-- ============================================================================

DO $$
DECLARE
  v_id_estado_activo bigint;
  v_id_grupo bigint;
BEGIN
  SELECT e.id
  INTO v_id_estado_activo
  FROM public.tb_estado e
  WHERE UPPER(TRIM(e.nombre)) = 'ACTIVO'
  ORDER BY e.id
  LIMIT 1;

  IF v_id_estado_activo IS NULL THEN
    RAISE EXCEPTION 'No existe el estado ACTIVO requerido para registrar la navegacion';
  END IF;

  SELECT pm.id
  INTO v_id_grupo
  FROM public.tb_permiso_menu pm
  WHERE pm.id_padre IS NULL
    AND UPPER(TRIM(pm.nombre)) = 'COMPENSACIONES'
  ORDER BY pm.id
  LIMIT 1;

  IF v_id_grupo IS NULL THEN
    INSERT INTO public.tb_permiso_menu (
      nombre,
      id_padre,
      ruta,
      icono,
      orden,
      id_estado,
      id_usuario
    ) VALUES (
      'Compensaciones',
      NULL,
      NULL,
      'coins-stacked',
      60,
      v_id_estado_activo,
      NULL
    )
    RETURNING id INTO v_id_grupo;
  ELSE
    UPDATE public.tb_permiso_menu
    SET nombre = 'Compensaciones',
        ruta = NULL,
        icono = 'coins-stacked',
        orden = 60,
        id_estado = v_id_estado_activo
    WHERE id = v_id_grupo;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_permiso_menu pm
    WHERE pm.ruta = '/compensaciones/resumen'
  ) THEN
    UPDATE public.tb_permiso_menu
    SET nombre = 'Resumen',
        id_padre = v_id_grupo,
        icono = 'bar-chart',
        orden = 61,
        id_estado = v_id_estado_activo
    WHERE ruta = '/compensaciones/resumen';
  ELSE
    INSERT INTO public.tb_permiso_menu (
      nombre,
      id_padre,
      ruta,
      icono,
      orden,
      id_estado,
      id_usuario
    ) VALUES (
      'Resumen',
      v_id_grupo,
      '/compensaciones/resumen',
      'bar-chart',
      61,
      v_id_estado_activo,
      NULL
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_permiso_menu pm
    WHERE pm.ruta = '/compensaciones/colaboradores'
  ) THEN
    UPDATE public.tb_permiso_menu
    SET nombre = 'Colaboradores',
        id_padre = v_id_grupo,
        icono = 'users',
        orden = 62,
        id_estado = v_id_estado_activo
    WHERE ruta = '/compensaciones/colaboradores';
  ELSE
    INSERT INTO public.tb_permiso_menu (
      nombre,
      id_padre,
      ruta,
      icono,
      orden,
      id_estado,
      id_usuario
    ) VALUES (
      'Colaboradores',
      v_id_grupo,
      '/compensaciones/colaboradores',
      'users',
      62,
      v_id_estado_activo,
      NULL
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_permiso_menu pm
    WHERE pm.ruta = '/compensaciones/asistencia'
  ) THEN
    UPDATE public.tb_permiso_menu
    SET nombre = 'Asistencia',
        id_padre = v_id_grupo,
        icono = 'activity',
        orden = 63,
        id_estado = v_id_estado_activo
    WHERE ruta = '/compensaciones/asistencia';
  ELSE
    INSERT INTO public.tb_permiso_menu (
      nombre,
      id_padre,
      ruta,
      icono,
      orden,
      id_estado,
      id_usuario
    ) VALUES (
      'Asistencia',
      v_id_grupo,
      '/compensaciones/asistencia',
      'activity',
      63,
      v_id_estado_activo,
      NULL
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_permiso_menu pm
    WHERE pm.ruta = '/compensaciones/evidencias'
  ) THEN
    UPDATE public.tb_permiso_menu
    SET nombre = 'Evidencias',
        id_padre = v_id_grupo,
        icono = 'file-text',
        orden = 64,
        id_estado = v_id_estado_activo
    WHERE ruta = '/compensaciones/evidencias';
  ELSE
    INSERT INTO public.tb_permiso_menu (
      nombre,
      id_padre,
      ruta,
      icono,
      orden,
      id_estado,
      id_usuario
    ) VALUES (
      'Evidencias',
      v_id_grupo,
      '/compensaciones/evidencias',
      'file-text',
      64,
      v_id_estado_activo,
      NULL
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_permiso_menu pm
    WHERE pm.ruta = '/compensaciones/incidencias'
  ) THEN
    UPDATE public.tb_permiso_menu
    SET nombre = 'Incidencias',
        id_padre = v_id_grupo,
        icono = 'alert-circle',
        orden = 65,
        id_estado = v_id_estado_activo
    WHERE ruta = '/compensaciones/incidencias';
  ELSE
    INSERT INTO public.tb_permiso_menu (
      nombre,
      id_padre,
      ruta,
      icono,
      orden,
      id_estado,
      id_usuario
    ) VALUES (
      'Incidencias',
      v_id_grupo,
      '/compensaciones/incidencias',
      'alert-circle',
      65,
      v_id_estado_activo,
      NULL
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_permiso_menu pm
    WHERE pm.ruta = '/compensaciones/liquidaciones'
  ) THEN
    UPDATE public.tb_permiso_menu
    SET nombre = 'Liquidaciones',
        id_padre = v_id_grupo,
        icono = 'coins-stacked',
        orden = 66,
        id_estado = v_id_estado_activo
    WHERE ruta = '/compensaciones/liquidaciones';
  ELSE
    INSERT INTO public.tb_permiso_menu (
      nombre,
      id_padre,
      ruta,
      icono,
      orden,
      id_estado,
      id_usuario
    ) VALUES (
      'Liquidaciones',
      v_id_grupo,
      '/compensaciones/liquidaciones',
      'coins-stacked',
      66,
      v_id_estado_activo,
      NULL
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_permiso_menu pm
    WHERE pm.ruta = '/compensaciones/cierres'
  ) THEN
    UPDATE public.tb_permiso_menu
    SET nombre = 'Cierres',
        id_padre = v_id_grupo,
        icono = 'shield',
        orden = 67,
        id_estado = v_id_estado_activo
    WHERE ruta = '/compensaciones/cierres';
  ELSE
    INSERT INTO public.tb_permiso_menu (
      nombre,
      id_padre,
      ruta,
      icono,
      orden,
      id_estado,
      id_usuario
    ) VALUES (
      'Cierres',
      v_id_grupo,
      '/compensaciones/cierres',
      'shield',
      67,
      v_id_estado_activo,
      NULL
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_permiso_menu pm
    WHERE pm.ruta = '/compensaciones/configuracion'
  ) THEN
    UPDATE public.tb_permiso_menu
    SET nombre = 'Configuración',
        id_padre = v_id_grupo,
        icono = 'settings',
        orden = 68,
        id_estado = v_id_estado_activo
    WHERE ruta = '/compensaciones/configuracion';
  ELSE
    INSERT INTO public.tb_permiso_menu (
      nombre,
      id_padre,
      ruta,
      icono,
      orden,
      id_estado,
      id_usuario
    ) VALUES (
      'Configuración',
      v_id_grupo,
      '/compensaciones/configuracion',
      'settings',
      68,
      v_id_estado_activo,
      NULL
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_permiso_menu pm
    WHERE pm.ruta = '/compensaciones/reportes'
  ) THEN
    UPDATE public.tb_permiso_menu
    SET nombre = 'Reportes',
        id_padre = v_id_grupo,
        icono = 'bar-chart',
        orden = 69,
        id_estado = v_id_estado_activo
    WHERE ruta = '/compensaciones/reportes';
  ELSE
    INSERT INTO public.tb_permiso_menu (
      nombre,
      id_padre,
      ruta,
      icono,
      orden,
      id_estado,
      id_usuario
    ) VALUES (
      'Reportes',
      v_id_grupo,
      '/compensaciones/reportes',
      'bar-chart',
      69,
      v_id_estado_activo,
      NULL
    );
  END IF;
END;
$$;
