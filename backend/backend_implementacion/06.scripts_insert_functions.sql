/*
Script: 06.scripts_insert_functions.sql
Objetivo:
  Poblar el backend compacto con registros bootstrap usando exclusivamente
  funciones publicas `f_post_*`, para que tambien se materialicen los
  snapshots de historial `_his`.

Reglas:
  - El script es idempotente.
  - No inserta duplicados si el dato ya existe.
  - Solo cubre el bootstrap inicial solicitado:
    - tb_estado
    - tb_rol
    - tb_usuario
    - tb_permiso_menu
    - tb_permiso_usuario
*/

-- ============================================================================
-- 1. ESTADOS BASE
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_estado
    WHERE lower(nombre) = 'activo'
  ) THEN
    PERFORM public.f_post_tb_estado(
      p_nombre := 'Activo',
      p_id_usuario := NULL
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_estado
    WHERE lower(nombre) = 'inactivo'
  ) THEN
    PERFORM public.f_post_tb_estado(
      p_nombre := 'Inactivo',
      p_id_usuario := NULL
    );
  END IF;
END;
$$;

-- ============================================================================
-- 2. ROL ADMINISTRADOR
-- ============================================================================

DO $$
DECLARE
  v_estado_activo_id bigint;
BEGIN
  SELECT id
  INTO v_estado_activo_id
  FROM public.tb_estado
  WHERE lower(nombre) = 'activo'
  LIMIT 1;

  IF v_estado_activo_id IS NULL THEN
    RAISE EXCEPTION 'No existe el estado Activo. Ejecuta primero el bloque de estados base.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_rol
    WHERE lower(nombre) = 'administrador'
  ) THEN
    PERFORM public.f_post_tb_rol(
      p_nombre := 'Administrador',
      p_id_estado := v_estado_activo_id,
      p_id_usuario := NULL
    );
  END IF;
END;
$$;

-- ============================================================================
-- 3. USUARIO ADMIN BASE
-- ============================================================================

DO $$
DECLARE
  v_estado_activo_id bigint;
  v_rol_admin_id bigint;
BEGIN
  SELECT id
  INTO v_estado_activo_id
  FROM public.tb_estado
  WHERE lower(nombre) = 'activo'
  LIMIT 1;

  SELECT id
  INTO v_rol_admin_id
  FROM public.tb_rol
  WHERE lower(nombre) = 'administrador'
  LIMIT 1;

  IF v_estado_activo_id IS NULL OR v_rol_admin_id IS NULL THEN
    RAISE EXCEPTION 'Faltan datos base: estado Activo o rol Administrador.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_usuario
    WHERE lower(email) = 'johnsmendoza@yahoo.com'
       OR lower(username) = 'johnsmendoza'
  ) THEN
    PERFORM public.f_post_tb_usuario(
      p_username := 'johnsmendoza',
      p_password := '7927105',
      p_email := 'johnsmendoza@yahoo.com',
      p_nombre := 'jhon',
      p_id_rol := v_rol_admin_id,
      p_id_estado := v_estado_activo_id,
      p_flag_super_admin := true
    );
  END IF;
END;
$$;

-- ============================================================================
-- 4. PERMISOS MENU BASE
-- ============================================================================

DO $$
DECLARE
  v_estado_activo_id bigint;
  v_usuario_admin_id bigint;
  v_menu_sistema_id bigint;
  v_menu_operaciones_id bigint;
  v_menu_seguimientos_id bigint;
  v_menu_dashboard_id bigint;
  v_menu_reportes_id bigint;
BEGIN
  SELECT id
  INTO v_estado_activo_id
  FROM public.tb_estado
  WHERE lower(nombre) = 'activo'
  LIMIT 1;

  SELECT id
  INTO v_usuario_admin_id
  FROM public.tb_usuario
  WHERE lower(username) = 'johnsmendoza'
  LIMIT 1;

  IF v_estado_activo_id IS NULL THEN
    RAISE EXCEPTION 'No existe el estado Activo.';
  END IF;

  -- Grupos principales
  IF NOT EXISTS (
    SELECT 1 FROM public.tb_permiso_menu
    WHERE lower(nombre) = 'sistema' AND ruta IS NULL
  ) THEN
    PERFORM public.f_post_tb_permiso_menu(
      p_nombre := 'Sistema',
      p_id_padre := NULL,
      p_ruta := NULL,
      p_icono := 'settings',
      p_orden := 10,
      p_id_estado := v_estado_activo_id,
      p_id_usuario := v_usuario_admin_id
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_permiso_menu
    WHERE lower(nombre) = 'operaciones' AND ruta IS NULL
  ) THEN
    PERFORM public.f_post_tb_permiso_menu(
      p_nombre := 'Operaciones',
      p_id_padre := NULL,
      p_ruta := NULL,
      p_icono := 'credit-card',
      p_orden := 20,
      p_id_estado := v_estado_activo_id,
      p_id_usuario := v_usuario_admin_id
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_permiso_menu
    WHERE lower(nombre) = 'seguimientos' AND ruta IS NULL
  ) THEN
    PERFORM public.f_post_tb_permiso_menu(
      p_nombre := 'Seguimientos',
      p_id_padre := NULL,
      p_ruta := NULL,
      p_icono := 'activity',
      p_orden := 30,
      p_id_estado := v_estado_activo_id,
      p_id_usuario := v_usuario_admin_id
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_permiso_menu
    WHERE lower(nombre) = 'dashboard' AND ruta IS NULL
  ) THEN
    PERFORM public.f_post_tb_permiso_menu(
      p_nombre := 'Dashboard',
      p_id_padre := NULL,
      p_ruta := NULL,
      p_icono := 'bar-chart',
      p_orden := 40,
      p_id_estado := v_estado_activo_id,
      p_id_usuario := v_usuario_admin_id
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tb_permiso_menu
    WHERE lower(nombre) = 'reportes' AND ruta IS NULL
  ) THEN
    PERFORM public.f_post_tb_permiso_menu(
      p_nombre := 'Reportes',
      p_id_padre := NULL,
      p_ruta := NULL,
      p_icono := 'file-text',
      p_orden := 50,
      p_id_estado := v_estado_activo_id,
      p_id_usuario := v_usuario_admin_id
    );
  END IF;

  SELECT id INTO v_menu_sistema_id
  FROM public.tb_permiso_menu
  WHERE lower(nombre) = 'sistema' AND ruta IS NULL
  LIMIT 1;

  SELECT id INTO v_menu_operaciones_id
  FROM public.tb_permiso_menu
  WHERE lower(nombre) = 'operaciones' AND ruta IS NULL
  LIMIT 1;

  SELECT id INTO v_menu_seguimientos_id
  FROM public.tb_permiso_menu
  WHERE lower(nombre) = 'seguimientos' AND ruta IS NULL
  LIMIT 1;

  SELECT id INTO v_menu_dashboard_id
  FROM public.tb_permiso_menu
  WHERE lower(nombre) = 'dashboard' AND ruta IS NULL
  LIMIT 1;

  SELECT id INTO v_menu_reportes_id
  FROM public.tb_permiso_menu
  WHERE lower(nombre) = 'reportes' AND ruta IS NULL
  LIMIT 1;

  -- Hijos de Sistema
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/sistema/estado') THEN
    PERFORM public.f_post_tb_permiso_menu('Estado', v_menu_sistema_id, '/sistema/estado', 'circle', 11, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/sistema/rol') THEN
    PERFORM public.f_post_tb_permiso_menu('Rol', v_menu_sistema_id, '/sistema/rol', 'shield', 12, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/sistema/sucursal') THEN
    PERFORM public.f_post_tb_permiso_menu('Sucursal', v_menu_sistema_id, '/sistema/sucursal', 'building', 13, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/sistema/comunidad') THEN
    PERFORM public.f_post_tb_permiso_menu('Comunidad', v_menu_sistema_id, '/sistema/comunidad', 'users', 14, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/sistema/usuario') THEN
    PERFORM public.f_post_tb_permiso_menu('Usuario', v_menu_sistema_id, '/sistema/usuario', 'user', 15, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/sistema/permiso-menu') THEN
    PERFORM public.f_post_tb_permiso_menu('Permiso Menu', v_menu_sistema_id, '/sistema/permiso-menu', 'menu', 16, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/sistema/permiso-usuario') THEN
    PERFORM public.f_post_tb_permiso_menu('Permiso Usuario', v_menu_sistema_id, '/sistema/permiso-usuario', 'key', 17, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/sistema/cliente') THEN
    PERFORM public.f_post_tb_permiso_menu('Cliente', v_menu_sistema_id, '/sistema/cliente', 'user-square', 18, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/sistema/codigo-servicio') THEN
    PERFORM public.f_post_tb_permiso_menu('Codigo Servicio', v_menu_sistema_id, '/sistema/codigo-servicio', 'hash', 19, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/sistema/banco') THEN
    PERFORM public.f_post_tb_permiso_menu('Banco', v_menu_sistema_id, '/sistema/banco', 'bank', 20, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/sistema/empresa') THEN
    PERFORM public.f_post_tb_permiso_menu('Empresa', v_menu_sistema_id, '/sistema/empresa', 'briefcase', 21, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/sistema/reglas-efectivizacion') THEN
    PERFORM public.f_post_tb_permiso_menu('Reglas Efectivizacion', v_menu_sistema_id, '/sistema/reglas-efectivizacion', 'sliders', 22, v_estado_activo_id, v_usuario_admin_id);
  END IF;

  -- Hijos de Operaciones
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/operaciones/bcp') THEN
    PERFORM public.f_post_tb_permiso_menu('BCP', v_menu_operaciones_id, '/operaciones/bcp', 'credit-card-bcp', 21, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/operaciones/bbva') THEN
    PERFORM public.f_post_tb_permiso_menu('BBVA', v_menu_operaciones_id, '/operaciones/bbva', 'credit-card-bbva', 22, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/operaciones/scotiabank') THEN
    PERFORM public.f_post_tb_permiso_menu('Scotiabank', v_menu_operaciones_id, '/operaciones/scotiabank', 'credit-card-scotiabank', 23, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/operaciones/banbif') THEN
    PERFORM public.f_post_tb_permiso_menu('BanBif', v_menu_operaciones_id, '/operaciones/banbif', 'credit-card-banbif', 24, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/operaciones/interbank') THEN
    PERFORM public.f_post_tb_permiso_menu('Interbank', v_menu_operaciones_id, '/operaciones/interbank', 'credit-card-interbank', 25, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/operaciones/safetypay') THEN
    PERFORM public.f_post_tb_permiso_menu('SafetyPay', v_menu_operaciones_id, '/operaciones/safetypay', 'credit-card-safetypay', 26, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/operaciones/pos') THEN
    PERFORM public.f_post_tb_permiso_menu('POS', v_menu_operaciones_id, '/operaciones/pos', 'credit-card-pos', 27, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/operaciones/linkpago') THEN
    PERFORM public.f_post_tb_permiso_menu('Link Pago', v_menu_operaciones_id, '/operaciones/linkpago', 'credit-card-linkpago', 28, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/operaciones/deuda') THEN
    PERFORM public.f_post_tb_permiso_menu('Deuda', v_menu_operaciones_id, '/operaciones/deuda', 'credit-card-deuda', 29, v_estado_activo_id, v_usuario_admin_id);
  END IF;

  -- Grupos futuros iniciales
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/seguimientos') THEN
    PERFORM public.f_post_tb_permiso_menu('Seguimientos', v_menu_seguimientos_id, '/seguimientos', 'activity', 31, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/dashboard') THEN
    PERFORM public.f_post_tb_permiso_menu('Dashboard', v_menu_dashboard_id, '/dashboard', 'bar-chart', 41, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/reportes') THEN
    PERFORM public.f_post_tb_permiso_menu('Reportes', v_menu_reportes_id, '/reportes', 'file-text', 51, v_estado_activo_id, v_usuario_admin_id);
  END IF;
END;
$$;

-- ============================================================================
-- 5. ASIGNACION DE PERMISOS AL USUARIO ADMIN
-- ============================================================================

DO $$
DECLARE
  v_estado_activo_id bigint;
  v_usuario_admin_id bigint;
  v_permiso record;
BEGIN
  SELECT id
  INTO v_estado_activo_id
  FROM public.tb_estado
  WHERE lower(nombre) = 'activo'
  LIMIT 1;

  SELECT id
  INTO v_usuario_admin_id
  FROM public.tb_usuario
  WHERE lower(username) = 'johnsmendoza'
  LIMIT 1;

  IF v_estado_activo_id IS NULL OR v_usuario_admin_id IS NULL THEN
    RAISE EXCEPTION 'No existe el usuario admin base o el estado Activo.';
  END IF;

  FOR v_permiso IN
    SELECT id
    FROM public.tb_permiso_menu
    WHERE id_estado = v_estado_activo_id
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.tb_permiso_usuario
      WHERE id_usuario = v_usuario_admin_id
        AND id_permiso_menu = v_permiso.id
    ) THEN
      PERFORM public.f_post_tb_permiso_usuario(
        p_id_usuario := v_usuario_admin_id,
        p_id_permiso_menu := v_permiso.id,
        p_id_estado := v_estado_activo_id,
        p_id_usuario_registra := v_usuario_admin_id
      );
    END IF;
  END LOOP;
END;
$$;



--1. Antigua informacion a migrar hacia la nueva tabla de tb_reglas_efectivizacion

id|id_codigo_servicio|codigo_servicio_nombre|id_banco|banco_nombre|id_itf_ingreso|itf_ingreso_nombre|id_comunidad|comunidad_nombre|id_tipo_deposito|tipo_deposito_nombre|comision_servicio|monto_minimo_deposito_servicio|comision_minima_servicio|id_itf_salida|itf_salida_nombre|id_estado|estado_nombre|id_usuario|fecha_registro
145|1|Cod. Servicio BCP|2|BCP|1|ITF|1|ATK1|1|Mismo Día|1|1200|12|1|ITF|1|Activo|1|2026-06-09 11:11:42.138452 -05:00
146|1|Cod. Servicio BCP|1|BBVA|1|ITF|1|ATK1|1|Mismo Día|1|1200|12|1|ITF|1|Activo|1|2026-06-09 11:11:42.636976 -05:00
149|1|Cod. Servicio BCP|4|BanBif|1|ITF|1|ATK1|1|Mismo Día|1|1200|12|1|ITF|1|Activo|1|2026-06-09 11:11:44.122255 -05:00
154|1|Cod. Servicio BCP|2|BCP|1|ITF|2|ATK05|1|Mismo Día|0.5|2400|12|1|ITF|1|Activo|1|2026-06-09 11:11:46.528658 -05:00
155|1|Cod. Servicio BCP|1|BBVA|1|ITF|2|ATK05|1|Mismo Día|0.5|2400|12|1|ITF|1|Activo|1|2026-06-09 11:11:47.022790 -05:00
158|1|Cod. Servicio BCP|4|BanBif|1|ITF|2|ATK05|1|Mismo Día|0.5|2400|12|1|ITF|1|Activo|1|2026-06-09 11:11:48.482987 -05:00
163|1|Cod. Servicio BCP|2|BCP|1|ITF|3|ATK035|1|Mismo Día|0.35|3430|12|1|ITF|1|Activo|1|2026-06-09 11:11:50.880562 -05:00
164|1|Cod. Servicio BCP|1|BBVA|1|ITF|3|ATK035|1|Mismo Día|0.35|3430|12|1|ITF|1|Activo|1|2026-06-09 11:11:51.359080 -05:00
167|1|Cod. Servicio BCP|4|BanBif|1|ITF|3|ATK035|1|Mismo Día|0.35|3430|12|1|ITF|1|Activo|1|2026-06-09 11:11:53.784873 -05:00
172|1|Cod. Servicio BCP|2|BCP|1|ITF|4|FK|1|Mismo Día|0.5|2400|12|1|ITF|1|Activo|1|2026-06-09 11:11:56.529521 -05:00
173|1|Cod. Servicio BCP|1|BBVA|1|ITF|4|FK|1|Mismo Día|0.5|2400|12|1|ITF|1|Activo|1|2026-06-09 11:11:56.996563 -05:00
176|1|Cod. Servicio BCP|4|BanBif|1|ITF|4|FK|1|Mismo Día|0.5|2400|12|1|ITF|1|Activo|1|2026-06-09 11:11:58.515082 -05:00
181|1|Cod. Servicio BCP|2|BCP|1|ITF|5|BETO30|1|Mismo Día|0.35|3430|12|1|ITF|1|Activo|1|2026-06-09 11:12:00.970354 -05:00
182|1|Cod. Servicio BCP|1|BBVA|1|ITF|5|BETO30|1|Mismo Día|0.35|3430|12|1|ITF|1|Activo|1|2026-06-09 11:12:01.452096 -05:00
185|1|Cod. Servicio BCP|4|BanBif|1|ITF|5|BETO30|1|Mismo Día|0.35|3430|12|1|ITF|1|Activo|1|2026-06-09 11:12:02.954524 -05:00
190|1|Cod. Servicio BCP|2|BCP|1|ITF|6|LUIS30|1|Mismo Día|0.35|3430|12|1|ITF|1|Activo|1|2026-06-09 11:12:05.353690 -05:00
191|1|Cod. Servicio BCP|1|BBVA|1|ITF|6|LUIS30|1|Mismo Día|0.35|3430|12|1|ITF|1|Activo|1|2026-06-09 11:12:05.842880 -05:00
194|1|Cod. Servicio BCP|4|BanBif|1|ITF|6|LUIS30|1|Mismo Día|0.35|3430|12|1|ITF|1|Activo|1|2026-06-09 11:12:07.260926 -05:00
199|1|Cod. Servicio BCP|2|BCP|1|ITF|7|MARTIN30|1|Mismo Día|0.35|3430|12|1|ITF|1|Activo|1|2026-06-09 11:12:09.620058 -05:00
200|1|Cod. Servicio BCP|1|BBVA|1|ITF|7|MARTIN30|1|Mismo Día|0.35|3430|12|1|ITF|1|Activo|1|2026-06-09 11:12:10.099141 -05:00
203|1|Cod. Servicio BCP|4|BanBif|1|ITF|7|MARTIN30|1|Mismo Día|0.35|3430|12|1|ITF|1|Activo|1|2026-06-09 11:12:11.529585 -05:00
208|1|Cod. Servicio BCP|2|BCP|1|ITF|8|CCFVIP|1|Mismo Día|0.35|3430|12|1|ITF|1|Activo|1|2026-06-09 11:12:13.904933 -05:00
209|1|Cod. Servicio BCP|1|BBVA|1|ITF|8|CCFVIP|1|Mismo Día|0.35|3430|12|1|ITF|1|Activo|1|2026-06-09 11:12:14.369563 -05:00
212|1|Cod. Servicio BCP|4|BanBif|1|ITF|8|CCFVIP|1|Mismo Día|0.35|3430|12|1|ITF|1|Activo|1|2026-06-09 11:12:15.784489 -05:00
228|1|Cod. Servicio BCP|2|BCP|1|ITF|9|REMY|1|Mismo Día|1|1200|12|1|ITF|1|Activo|1|2026-06-27 10:04:11.453766 -05:00
229|1|Cod. Servicio BCP|1|BBVA|1|ITF|9|REMY|1|Mismo Día|1|1200|12|1|ITF|1|Activo|1|2026-06-27 10:04:11.453766 -05:00
232|1|Cod. Servicio BCP|4|BanBif|1|ITF|9|REMY|1|Mismo Día|1|1200|12|1|ITF|1|Activo|1|2026-06-27 10:04:11.453766 -05:00
150|3|Cod. Servicio Interbank|5|Interbank|1|ITF|1|ATK1|1|Mismo Día|2|1500|30|1|ITF|1|Activo|2|2026-06-09 11:11:44.609072 -05:00
159|3|Cod. Servicio Interbank|5|Interbank|1|ITF|2|ATK05|1|Mismo Día|2|1500|30|1|ITF|1|Activo|2|2026-06-09 11:11:48.968172 -05:00
168|3|Cod. Servicio Interbank|5|Interbank|1|ITF|3|ATK035|1|Mismo Día|1.5|1500|30|1|ITF|1|Activo|2|2026-06-09 11:11:54.629402 -05:00
177|3|Cod. Servicio Interbank|5|Interbank|1|ITF|4|FK|1|Mismo Día|1.5|1500|30|1|ITF|1|Activo|2|2026-06-09 11:11:59.035310 -05:00
186|3|Cod. Servicio Interbank|5|Interbank|1|ITF|5|BETO30|1|Mismo Día|1.5|1500|30|1|ITF|1|Activo|2|2026-06-09 11:12:03.417580 -05:00
195|3|Cod. Servicio Interbank|5|Interbank|1|ITF|6|LUIS30|1|Mismo Día|1.5|1500|30|1|ITF|1|Activo|2|2026-06-09 11:12:07.724529 -05:00
204|3|Cod. Servicio Interbank|5|Interbank|1|ITF|7|MARTIN30|1|Mismo Día|1.5|1500|30|1|ITF|1|Activo|2|2026-06-09 11:12:12.011635 -05:00
213|3|Cod. Servicio Interbank|5|Interbank|1|ITF|8|CCFVIP|1|Mismo Día|1.5|1500|30|1|ITF|1|Activo|2|2026-06-09 11:12:16.260980 -05:00
227|3|Cod. Servicio Interbank|5|Interbank|1|ITF|9|REMY|1|Mismo Día|2|1500|30|1|ITF|1|Activo|2|2026-06-27 10:04:11.453766 -05:00
217|7|Cod. Servicio Pago Deuda|1|BBVA|1|ITF|1|ATK1|1|Mismo Día|1|0|0|1|ITF|1|Activo|2|2026-06-17 00:14:08.074680 -05:00
218|7|Cod. Servicio Pago Deuda|2|BCP|1|ITF|1|ATK1|1|Mismo Día|1|0|0|1|ITF|1|Activo|2|2026-06-17 00:15:03.627061 -05:00
219|7|Cod. Servicio Pago Deuda|3|Scotiabank|1|ITF|1|ATK1|1|Mismo Día|1.5|0|0|1|ITF|1|Activo|2|2026-06-17 00:16:13.565924 -05:00
220|7|Cod. Servicio Pago Deuda|4|BanBif|1|ITF|1|ATK1|1|Mismo Día|1|0|0|1|ITF|1|Activo|2|2026-06-17 00:17:33.366335 -05:00
221|7|Cod. Servicio Pago Deuda|5|Interbank|1|ITF|1|ATK1|1|Mismo Día|2|0|0|1|ITF|1|Activo|2|2026-06-17 00:19:55.732019 -05:00
151|4|Cod. Servicio SafetyPay|15|SafetyPay|1|ITF|1|ATK1|1|Mismo Día|2|1500|30|1|ITF|1|Activo|2|2026-06-09 11:11:45.083605 -05:00
160|4|Cod. Servicio SafetyPay|15|SafetyPay|1|ITF|2|ATK05|1|Mismo Día|2|1500|30|1|ITF|1|Activo|2|2026-06-09 11:11:49.441426 -05:00
169|4|Cod. Servicio SafetyPay|15|SafetyPay|1|ITF|3|ATK035|1|Mismo Día|2|1500|30|1|ITF|1|Activo|2|2026-06-09 11:11:55.103947 -05:00
178|4|Cod. Servicio SafetyPay|15|SafetyPay|1|ITF|4|FK|1|Mismo Día|2|1500|30|1|ITF|1|Activo|2|2026-06-09 11:11:59.546235 -05:00
187|4|Cod. Servicio SafetyPay|15|SafetyPay|1|ITF|5|BETO30|1|Mismo Día|2|1500|30|1|ITF|1|Activo|2|2026-06-09 11:12:03.922791 -05:00
196|4|Cod. Servicio SafetyPay|15|SafetyPay|1|ITF|6|LUIS30|1|Mismo Día|2|1500|30|1|ITF|1|Activo|2|2026-06-09 11:12:08.204287 -05:00
205|4|Cod. Servicio SafetyPay|15|SafetyPay|1|ITF|7|MARTIN30|1|Mismo Día|2|1500|30|1|ITF|1|Activo|2|2026-06-09 11:12:12.482660 -05:00
214|4|Cod. Servicio SafetyPay|15|SafetyPay|1|ITF|8|CCFVIP|1|Mismo Día|2|1500|30|1|ITF|1|Activo|2|2026-06-09 11:12:16.736062 -05:00
224|4|Cod. Servicio SafetyPay|15|SafetyPay|1|ITF|9|REMY|1|Mismo Día|2|1500|30|1|ITF|1|Activo|2|2026-06-27 10:04:11.453766 -05:00
147|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|1|ATK1|1|Mismo Día|1.5|2000|20|1|ITF|1|Activo|1|2026-06-09 11:11:43.114014 -05:00
148|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|1|ATK1|2|Día Siguiente|1|2000|20|1|ITF|1|Activo|1|2026-06-09 11:11:43.630382 -05:00
156|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|2|ATK05|1|Mismo Día|1|4000|20|1|ITF|1|Activo|1|2026-06-09 11:11:47.498763 -05:00
157|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|2|ATK05|2|Día Siguiente|0.5|4000|20|1|ITF|1|Activo|1|2026-06-09 11:11:47.980733 -05:00
165|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|3|ATK035|1|Mismo Día|1|5715|20|1|ITF|1|Activo|1|2026-06-09 11:11:51.830287 -05:00
166|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|3|ATK035|2|Día Siguiente|0.35|5715|20|1|ITF|1|Activo|1|2026-06-09 11:11:52.694205 -05:00
174|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|4|FK|1|Mismo Día|1|4000|20|1|ITF|1|Activo|1|2026-06-09 11:11:57.479048 -05:00
175|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|4|FK|2|Día Siguiente|0.5|4000|20|1|ITF|1|Activo|1|2026-06-09 11:11:57.958272 -05:00
183|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|5|BETO30|1|Mismo Día|1|5715|20|1|ITF|1|Activo|1|2026-06-09 11:12:01.982190 -05:00
184|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|5|BETO30|2|Día Siguiente|0.35|5715|20|1|ITF|1|Activo|1|2026-06-09 11:12:02.480101 -05:00
192|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|6|LUIS30|1|Mismo Día|1|5715|20|1|ITF|1|Activo|1|2026-06-09 11:12:06.315742 -05:00
193|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|6|LUIS30|2|Día Siguiente|0.35|5715|20|1|ITF|1|Activo|1|2026-06-09 11:12:06.786517 -05:00
201|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|7|MARTIN30|1|Mismo Día|1|5715|20|1|ITF|1|Activo|1|2026-06-09 11:12:10.573175 -05:00
202|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|7|MARTIN30|2|Día Siguiente|0.35|5715|20|1|ITF|1|Activo|1|2026-06-09 11:12:11.064053 -05:00
210|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|8|CCFVIP|1|Mismo Día|1|5715|20|1|ITF|1|Activo|1|2026-06-09 11:12:14.840756 -05:00
211|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|8|CCFVIP|2|Día Siguiente|0.35|5715|20|1|ITF|1|Activo|1|2026-06-09 11:12:15.305090 -05:00
230|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|9|REMY|1|Mismo Día|1.5|2000|20|1|ITF|1|Activo|1|2026-06-27 10:04:11.453766 -05:00
231|2|Cod. Servicio Scotiabank|3|Scotiabank|1|ITF|9|REMY|2|Día Siguiente|1|2000|20|1|ITF|1|Activo|1|2026-06-27 10:04:11.453766 -05:00

--2. nuevas tablas que estan en la nueva base de datos compactada

SELECT * FROM tb_codigo_servicio;

id|nombre|tipo|id_estado
2|BCP|Efectivizacion|1
3|BBVA|Efectivizacion|1
4|Scotiabank|Efectivizacion|1
5|Banbif|Efectivizacion|1
6|Interbank|Efectivizacion|1
7|SafetyPay|Efectivizacion|1
8|POS|Efectivizacion|1
9|Link Pago|Efectivizacion|1
10|Pago Deuda|Pago Deuda|1

SELECT * FROM TB_BANCO;
id|nombre|nombre_abreviatura
4|BANBIF|BANBIF
5|INTERBANK|IBK
9|SAFETYPAY|SFPAY
1|BBVA|BBVA
2|BCP|BCP
3|SCOTIABANK|SCO

SELECT * FROM tb_estado;
id|nombre
1|Activo
2|Inactivo

select * from tb_comunidad;
id|nombre
10|ATK1
11|ATK05
12|ATK035
13|FK
14|BETO30
15|LUIS30
16|MARTIN30
17|CCFVIP
18|REMY


create table tb_reglas_efectivizacion
(
    id                             bigint generated always as identity
        primary key,
    id_codigo_servicio             bigint                                 not null,
    id_banco                       bigint,
    id_comunidad                   bigint,
    tipo_deposito                  bigint,
    comision_servicio              numeric                  default 0     not null,
    monto_minimo_deposito_servicio numeric                  default 0     not null,
    comision_minima_servicio       numeric                  default 0     not null,
    id_estado                      bigint                                 not null,
    id_usuario                     bigint,
    fecha_registro                 timestamp with time zone default now() not null
);

--3. Migracion de reglas de efectivizacion antiguas a la nueva tabla
--   Mapea por nombre (ILIKE) porque los IDs cambiaron entre BD legacy y compacta.

DO $$
DECLARE
  v_admin_id   bigint;
  v_activo_id  bigint;
  v_cs_id      bigint;
  v_banco_id   bigint;
  v_com_id     bigint;
  v_rec        record;
BEGIN
  SELECT id INTO v_activo_id FROM public.tb_estado WHERE lower(nombre) = 'activo' LIMIT 1;
  SELECT id INTO v_admin_id FROM public.tb_usuario WHERE lower(username) = 'johnsmendoza' LIMIT 1;

  IF v_activo_id IS NULL OR v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Faltan: estado Activo o usuario admin.';
  END IF;

  FOR v_rec IN
    SELECT * FROM (VALUES
      -- BCP (cod_servicio='BCP') x BCP / BBVA / BanBif
      ('BCP', 'BCP',     'ATK1',    'Mismo Día', 1,   1200, 12),
      ('BCP', 'BBVA',    'ATK1',    'Mismo Día', 1,   1200, 12),
      ('BCP', 'BanBif',  'ATK1',    'Mismo Día', 1,   1200, 12),
      ('BCP', 'BCP',     'ATK05',   'Mismo Día', 0.5, 2400, 12),
      ('BCP', 'BBVA',    'ATK05',   'Mismo Día', 0.5, 2400, 12),
      ('BCP', 'BanBif',  'ATK05',   'Mismo Día', 0.5, 2400, 12),
      ('BCP', 'BCP',     'ATK035',  'Mismo Día', 0.35, 3430, 12),
      ('BCP', 'BBVA',    'ATK035',  'Mismo Día', 0.35, 3430, 12),
      ('BCP', 'BanBif',  'ATK035',  'Mismo Día', 0.35, 3430, 12),
      ('BCP', 'BCP',     'FK',      'Mismo Día', 0.5,  2400, 12),
      ('BCP', 'BBVA',    'FK',      'Mismo Día', 0.5,  2400, 12),
      ('BCP', 'BanBif',  'FK',      'Mismo Día', 0.5,  2400, 12),
      ('BCP', 'BCP',     'BETO30',  'Mismo Día', 0.35, 3430, 12),
      ('BCP', 'BBVA',    'BETO30',  'Mismo Día', 0.35, 3430, 12),
      ('BCP', 'BanBif',  'BETO30',  'Mismo Día', 0.35, 3430, 12),
      ('BCP', 'BCP',     'LUIS30',  'Mismo Día', 0.35, 3430, 12),
      ('BCP', 'BBVA',    'LUIS30',  'Mismo Día', 0.35, 3430, 12),
      ('BCP', 'BanBif',  'LUIS30',  'Mismo Día', 0.35, 3430, 12),
      ('BCP', 'BCP',     'MARTIN30','Mismo Día', 0.35, 3430, 12),
      ('BCP', 'BBVA',    'MARTIN30','Mismo Día', 0.35, 3430, 12),
      ('BCP', 'BanBif',  'MARTIN30','Mismo Día', 0.35, 3430, 12),
      ('BCP', 'BCP',     'CCFVIP',  'Mismo Día', 0.35, 3430, 12),
      ('BCP', 'BBVA',    'CCFVIP',  'Mismo Día', 0.35, 3430, 12),
      ('BCP', 'BanBif',  'CCFVIP',  'Mismo Día', 0.35, 3430, 12),
      ('BCP', 'BCP',     'REMY',    'Mismo Día', 1,   1200, 12),
      ('BCP', 'BBVA',    'REMY',    'Mismo Día', 1,   1200, 12),
      ('BCP', 'BanBif',  'REMY',    'Mismo Día', 1,   1200, 12),
      -- Interbank
      ('Interbank', 'Interbank', 'ATK1',    'Mismo Día', 2,   1500, 30),
      ('Interbank', 'Interbank', 'ATK05',   'Mismo Día', 2,   1500, 30),
      ('Interbank', 'Interbank', 'ATK035',  'Mismo Día', 1.5, 1500, 30),
      ('Interbank', 'Interbank', 'FK',      'Mismo Día', 1.5, 1500, 30),
      ('Interbank', 'Interbank', 'BETO30',  'Mismo Día', 1.5, 1500, 30),
      ('Interbank', 'Interbank', 'LUIS30',  'Mismo Día', 1.5, 1500, 30),
      ('Interbank', 'Interbank', 'MARTIN30','Mismo Día', 1.5, 1500, 30),
      ('Interbank', 'Interbank', 'CCFVIP',  'Mismo Día', 1.5, 1500, 30),
      ('Interbank', 'Interbank', 'REMY',    'Mismo Día', 2,   1500, 30),
      -- Pago Deuda x todos los bancos
      ('Pago Deuda', 'BBVA',      'ATK1',    'Mismo Día', 1,   0,    0),
      ('Pago Deuda', 'BCP',       'ATK1',    'Mismo Día', 1,   0,    0),
      ('Pago Deuda', 'Scotiabank','ATK1',    'Mismo Día', 1.5, 0,    0),
      ('Pago Deuda', 'BanBif',    'ATK1',    'Mismo Día', 1,   0,    0),
      ('Pago Deuda', 'Interbank', 'ATK1',    'Mismo Día', 2,   0,    0),
      -- SafetyPay x todas las comunidades
      ('SafetyPay', 'SafetyPay', 'ATK1',    'Mismo Día', 2,   1500, 30),
      ('SafetyPay', 'SafetyPay', 'ATK05',   'Mismo Día', 2,   1500, 30),
      ('SafetyPay', 'SafetyPay', 'ATK035',  'Mismo Día', 2,   1500, 30),
      ('SafetyPay', 'SafetyPay', 'FK',      'Mismo Día', 2,   1500, 30),
      ('SafetyPay', 'SafetyPay', 'BETO30',  'Mismo Día', 2,   1500, 30),
      ('SafetyPay', 'SafetyPay', 'LUIS30',  'Mismo Día', 2,   1500, 30),
      ('SafetyPay', 'SafetyPay', 'MARTIN30','Mismo Día', 2,   1500, 30),
      ('SafetyPay', 'SafetyPay', 'CCFVIP',  'Mismo Día', 2,   1500, 30),
      ('SafetyPay', 'SafetyPay', 'REMY',    'Mismo Día', 2,   1500, 30),
      -- Scotiabank x todas las comunidades (Mismo Dia y Dia Siguiente)
      ('Scotiabank','Scotiabank','ATK1',    'Mismo Día',     1.5, 2000, 20),
      ('Scotiabank','Scotiabank','ATK1',    'Día Siguiente', 1,   2000, 20),
      ('Scotiabank','Scotiabank','ATK05',   'Mismo Día',     1,   4000, 20),
      ('Scotiabank','Scotiabank','ATK05',   'Día Siguiente', 0.5, 4000, 20),
      ('Scotiabank','Scotiabank','ATK035',  'Mismo Día',     1,   5715, 20),
      ('Scotiabank','Scotiabank','ATK035',  'Día Siguiente', 0.35,5715, 20),
      ('Scotiabank','Scotiabank','FK',      'Mismo Día',     1,   4000, 20),
      ('Scotiabank','Scotiabank','FK',      'Día Siguiente', 0.5, 4000, 20),
      ('Scotiabank','Scotiabank','BETO30',  'Mismo Día',     1,   5715, 20),
      ('Scotiabank','Scotiabank','BETO30',  'Día Siguiente', 0.35,5715, 20),
      ('Scotiabank','Scotiabank','LUIS30',  'Mismo Día',     1,   5715, 20),
      ('Scotiabank','Scotiabank','LUIS30',  'Día Siguiente', 0.35,5715, 20),
      ('Scotiabank','Scotiabank','MARTIN30','Mismo Día',     1,   5715, 20),
      ('Scotiabank','Scotiabank','MARTIN30','Día Siguiente', 0.35,5715, 20),
      ('Scotiabank','Scotiabank','CCFVIP',  'Mismo Día',     1,   5715, 20),
      ('Scotiabank','Scotiabank','CCFVIP',  'Día Siguiente', 0.35,5715, 20),
      ('Scotiabank','Scotiabank','REMY',    'Mismo Día',     1.5, 2000, 20),
      ('Scotiabank','Scotiabank','REMY',    'Día Siguiente', 1,   2000, 20)
    ) AS t(cod_servicio, banco, comunidad, tipo_deposito, comision, monto_min, comision_min)
  LOOP
    SELECT id INTO v_cs_id FROM public.tb_codigo_servicio WHERE nombre ILIKE v_rec.cod_servicio LIMIT 1;
    SELECT id INTO v_banco_id FROM public.tb_banco WHERE nombre ILIKE v_rec.banco LIMIT 1;
    SELECT id INTO v_com_id FROM public.tb_comunidad WHERE nombre ILIKE v_rec.comunidad LIMIT 1;

    IF v_cs_id IS NULL OR v_banco_id IS NULL OR v_com_id IS NULL THEN
      RAISE WARNING 'Lookup fallido: cs=%, banco=%, comunidad=%', v_rec.cod_servicio, v_rec.banco, v_rec.comunidad;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.tb_reglas_efectivizacion
      WHERE id_codigo_servicio = v_cs_id
        AND id_banco = v_banco_id
        AND id_comunidad = v_com_id
        AND tipo_deposito = v_rec.tipo_deposito
    ) THEN
      PERFORM public.f_post_tb_reglas_efectivizacion(
        p_id_codigo_servicio := v_cs_id,
        p_id_banco           := v_banco_id,
        p_id_comunidad       := v_com_id,
        p_tipo_deposito      := v_rec.tipo_deposito,
        p_comision_servicio  := v_rec.comision,
        p_monto_minimo_deposito_servicio := v_rec.monto_min,
        p_comision_minima_servicio       := v_rec.comision_min,
        p_id_estado          := v_activo_id,
        p_id_usuario         := v_admin_id
      );
    END IF;
  END LOOP;
END;
$$;