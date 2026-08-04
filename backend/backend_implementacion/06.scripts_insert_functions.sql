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
  v_menu_atencion_id bigint;
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
    WHERE lower(nombre) = 'atencion al cliente' AND ruta IS NULL
  ) THEN
    PERFORM public.f_post_tb_permiso_menu(
      p_nombre := 'Atencion al Cliente',
      p_id_padre := NULL,
      p_ruta := NULL,
      p_icono := 'users',
      p_orden := 30,
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
      p_orden := 40,
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
      p_orden := 50,
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
      p_orden := 60,
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

  SELECT id INTO v_menu_atencion_id
  FROM public.tb_permiso_menu
  WHERE lower(nombre) = 'atencion al cliente' AND ruta IS NULL
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

  -- Hijos de Atencion al Cliente
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/atencion/cliente') THEN
    PERFORM public.f_post_tb_permiso_menu('Clientes', v_menu_atencion_id, '/atencion/cliente', 'user-square', 31, v_estado_activo_id, v_usuario_admin_id);
  END IF;

  -- Grupos futuros iniciales
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/seguimientos') THEN
    PERFORM public.f_post_tb_permiso_menu('Seguimientos', v_menu_seguimientos_id, '/seguimientos', 'activity', 31, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/seguimientos/efectivizacion') THEN
    PERFORM public.f_post_tb_permiso_menu('Efectivizacion', v_menu_seguimientos_id, '/seguimientos/efectivizacion', 'credit-card', 32, v_estado_activo_id, v_usuario_admin_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu WHERE ruta = '/seguimientos/pago-deuda') THEN
    PERFORM public.f_post_tb_permiso_menu('Pago Deuda', v_menu_seguimientos_id, '/seguimientos/pago-deuda', 'refresh-cw', 33, v_estado_activo_id, v_usuario_admin_id);
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




/*
1. Antigua informacion migrada hacia la nueva tabla compacta de tb_reglas_efectivizacion.
   La tabla compacta mantiene solo:
   - id_codigo_servicio
   - id_banco
   - id_comunidad
   - tipo_deposito
   - comision_servicio
   - monto_minimo_deposito_servicio
   - comision_minima_servicio
   - id_estado
   - id_usuario
   - fecha_registro

2. Mapeos aplicados:
   - "Cod. Servicio BCP"         -> tb_codigo_servicio.nombre = 'BCP'
   - "Cod. Servicio Scotiabank"  -> tb_codigo_servicio.nombre = 'Scotiabank'
   - "Cod. Servicio Interbank"   -> tb_codigo_servicio.nombre = 'Interbank'
   - "Cod. Servicio SafetyPay"   -> tb_codigo_servicio.nombre = 'SafetyPay'
   - "Cod. Servicio Pago Deuda"  -> tb_codigo_servicio.nombre = 'Pago Deuda'

3. Se inserta directo a tabla para preservar fecha_registro historica.
*/

/*
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
*/

--3. genera el insert en base a la nueva tabla tb_reglas_efectivizacion

DO $$
DECLARE
  v_insertados integer := 0;
BEGIN
  WITH datos_origen (
    codigo_servicio_nombre,
    banco_nombre,
    id_comunidad,
    tipo_deposito,
    comision_servicio,
    monto_minimo_deposito_servicio,
    comision_minima_servicio,
    estado_nombre,
    id_usuario,
    fecha_registro
  ) AS (
    VALUES
      ('BCP', 'BCP', 1, 1, 1, 1200, 12, 'Activo', 1, '2026-06-09 11:11:42.138452 -05:00'::timestamptz),
      ('BCP', 'BBVA', 1, 1, 1, 1200, 12, 'Activo', 1, '2026-06-09 11:11:42.636976 -05:00'::timestamptz),
      ('BCP', 'BANBIF', 1, 1, 1, 1200, 12, 'Activo', 1, '2026-06-09 11:11:44.122255 -05:00'::timestamptz),
      ('BCP', 'BCP', 2, 1, 0.5, 2400, 12, 'Activo', 1, '2026-06-09 11:11:46.528658 -05:00'::timestamptz),
      ('BCP', 'BBVA', 2, 1, 0.5, 2400, 12, 'Activo', 1, '2026-06-09 11:11:47.022790 -05:00'::timestamptz),
      ('BCP', 'BANBIF', 2, 1, 0.5, 2400, 12, 'Activo', 1, '2026-06-09 11:11:48.482987 -05:00'::timestamptz),
      ('BCP', 'BCP', 3, 1, 0.35, 3430, 12, 'Activo', 1, '2026-06-09 11:11:50.880562 -05:00'::timestamptz),
      ('BCP', 'BBVA', 3, 1, 0.35, 3430, 12, 'Activo', 1, '2026-06-09 11:11:51.359080 -05:00'::timestamptz),
      ('BCP', 'BANBIF', 3, 1, 0.35, 3430, 12, 'Activo', 1, '2026-06-09 11:11:53.784873 -05:00'::timestamptz),
      ('BCP', 'BCP', 4, 1, 0.5, 2400, 12, 'Activo', 1, '2026-06-09 11:11:56.529521 -05:00'::timestamptz),
      ('BCP', 'BBVA', 4, 1, 0.5, 2400, 12, 'Activo', 1, '2026-06-09 11:11:56.996563 -05:00'::timestamptz),
      ('BCP', 'BANBIF', 4, 1, 0.5, 2400, 12, 'Activo', 1, '2026-06-09 11:11:58.515082 -05:00'::timestamptz),
      ('BCP', 'BCP', 5, 1, 0.35, 3430, 12, 'Activo', 1, '2026-06-09 11:12:00.970354 -05:00'::timestamptz),
      ('BCP', 'BBVA', 5, 1, 0.35, 3430, 12, 'Activo', 1, '2026-06-09 11:12:01.452096 -05:00'::timestamptz),
      ('BCP', 'BANBIF', 5, 1, 0.35, 3430, 12, 'Activo', 1, '2026-06-09 11:12:02.954524 -05:00'::timestamptz),
      ('BCP', 'BCP', 6, 1, 0.35, 3430, 12, 'Activo', 1, '2026-06-09 11:12:05.353690 -05:00'::timestamptz),
      ('BCP', 'BBVA', 6, 1, 0.35, 3430, 12, 'Activo', 1, '2026-06-09 11:12:05.842880 -05:00'::timestamptz),
      ('BCP', 'BANBIF', 6, 1, 0.35, 3430, 12, 'Activo', 1, '2026-06-09 11:12:07.260926 -05:00'::timestamptz),
      ('BCP', 'BCP', 7, 1, 0.35, 3430, 12, 'Activo', 1, '2026-06-09 11:12:09.620058 -05:00'::timestamptz),
      ('BCP', 'BBVA', 7, 1, 0.35, 3430, 12, 'Activo', 1, '2026-06-09 11:12:10.099141 -05:00'::timestamptz),
      ('BCP', 'BANBIF', 7, 1, 0.35, 3430, 12, 'Activo', 1, '2026-06-09 11:12:11.529585 -05:00'::timestamptz),
      ('BCP', 'BCP', 8, 1, 0.35, 3430, 12, 'Activo', 1, '2026-06-09 11:12:13.904933 -05:00'::timestamptz),
      ('BCP', 'BBVA', 8, 1, 0.35, 3430, 12, 'Activo', 1, '2026-06-09 11:12:14.369563 -05:00'::timestamptz),
      ('BCP', 'BANBIF', 8, 1, 0.35, 3430, 12, 'Activo', 1, '2026-06-09 11:12:15.784489 -05:00'::timestamptz),
      ('BCP', 'BCP', 9, 1, 1, 1200, 12, 'Activo', 1, '2026-06-27 10:04:11.453766 -05:00'::timestamptz),
      ('BCP', 'BBVA', 9, 1, 1, 1200, 12, 'Activo', 1, '2026-06-27 10:04:11.453766 -05:00'::timestamptz),
      ('BCP', 'BANBIF', 9, 1, 1, 1200, 12, 'Activo', 1, '2026-06-27 10:04:11.453766 -05:00'::timestamptz),
      ('Interbank', 'INTERBANK', 1, 1, 2, 1500, 30, 'Activo', 2, '2026-06-09 11:11:44.609072 -05:00'::timestamptz),
      ('Interbank', 'INTERBANK', 2, 1, 2, 1500, 30, 'Activo', 2, '2026-06-09 11:11:48.968172 -05:00'::timestamptz),
      ('Interbank', 'INTERBANK', 3, 1, 1.5, 1500, 30, 'Activo', 2, '2026-06-09 11:11:54.629402 -05:00'::timestamptz),
      ('Interbank', 'INTERBANK', 4, 1, 1.5, 1500, 30, 'Activo', 2, '2026-06-09 11:11:59.035310 -05:00'::timestamptz),
      ('Interbank', 'INTERBANK', 5, 1, 1.5, 1500, 30, 'Activo', 2, '2026-06-09 11:12:03.417580 -05:00'::timestamptz),
      ('Interbank', 'INTERBANK', 6, 1, 1.5, 1500, 30, 'Activo', 2, '2026-06-09 11:12:07.724529 -05:00'::timestamptz),
      ('Interbank', 'INTERBANK', 7, 1, 1.5, 1500, 30, 'Activo', 2, '2026-06-09 11:12:12.011635 -05:00'::timestamptz),
      ('Interbank', 'INTERBANK', 8, 1, 1.5, 1500, 30, 'Activo', 2, '2026-06-09 11:12:16.260980 -05:00'::timestamptz),
      ('Interbank', 'INTERBANK', 9, 1, 2, 1500, 30, 'Activo', 2, '2026-06-27 10:04:11.453766 -05:00'::timestamptz),
      ('Pago Deuda', 'BBVA', 1, 1, 1, 0, 0, 'Activo', 2, '2026-06-17 00:14:08.074680 -05:00'::timestamptz),
      ('Pago Deuda', 'BCP', 1, 1, 1, 0, 0, 'Activo', 2, '2026-06-17 00:15:03.627061 -05:00'::timestamptz),
      ('Pago Deuda', 'SCOTIABANK', 1, 1, 1.5, 0, 0, 'Activo', 2, '2026-06-17 00:16:13.565924 -05:00'::timestamptz),
      ('Pago Deuda', 'BANBIF', 1, 1, 1, 0, 0, 'Activo', 2, '2026-06-17 00:17:33.366335 -05:00'::timestamptz),
      ('Pago Deuda', 'INTERBANK', 1, 1, 2, 0, 0, 'Activo', 2, '2026-06-17 00:19:55.732019 -05:00'::timestamptz),
      ('SafetyPay', 'SAFETYPAY', 1, 1, 2, 1500, 30, 'Activo', 2, '2026-06-09 11:11:45.083605 -05:00'::timestamptz),
      ('SafetyPay', 'SAFETYPAY', 2, 1, 2, 1500, 30, 'Activo', 2, '2026-06-09 11:11:49.441426 -05:00'::timestamptz),
      ('SafetyPay', 'SAFETYPAY', 3, 1, 2, 1500, 30, 'Activo', 2, '2026-06-09 11:11:55.103947 -05:00'::timestamptz),
      ('SafetyPay', 'SAFETYPAY', 4, 1, 2, 1500, 30, 'Activo', 2, '2026-06-09 11:11:59.546235 -05:00'::timestamptz),
      ('SafetyPay', 'SAFETYPAY', 5, 1, 2, 1500, 30, 'Activo', 2, '2026-06-09 11:12:03.922791 -05:00'::timestamptz),
      ('SafetyPay', 'SAFETYPAY', 6, 1, 2, 1500, 30, 'Activo', 2, '2026-06-09 11:12:08.204287 -05:00'::timestamptz),
      ('SafetyPay', 'SAFETYPAY', 7, 1, 2, 1500, 30, 'Activo', 2, '2026-06-09 11:12:12.482660 -05:00'::timestamptz),
      ('SafetyPay', 'SAFETYPAY', 8, 1, 2, 1500, 30, 'Activo', 2, '2026-06-09 11:12:16.736062 -05:00'::timestamptz),
      ('SafetyPay', 'SAFETYPAY', 9, 1, 2, 1500, 30, 'Activo', 2, '2026-06-27 10:04:11.453766 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 1, 1, 1.5, 2000, 20, 'Activo', 1, '2026-06-09 11:11:43.114014 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 1, 2, 1, 2000, 20, 'Activo', 1, '2026-06-09 11:11:43.630382 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 2, 1, 1, 4000, 20, 'Activo', 1, '2026-06-09 11:11:47.498763 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 2, 2, 0.5, 4000, 20, 'Activo', 1, '2026-06-09 11:11:47.980733 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 3, 1, 1, 5715, 20, 'Activo', 1, '2026-06-09 11:11:51.830287 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 3, 2, 0.35, 5715, 20, 'Activo', 1, '2026-06-09 11:11:52.694205 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 4, 1, 1, 4000, 20, 'Activo', 1, '2026-06-09 11:11:57.479048 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 4, 2, 0.5, 4000, 20, 'Activo', 1, '2026-06-09 11:11:57.958272 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 5, 1, 1, 5715, 20, 'Activo', 1, '2026-06-09 11:12:01.982190 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 5, 2, 0.35, 5715, 20, 'Activo', 1, '2026-06-09 11:12:02.480101 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 6, 1, 1, 5715, 20, 'Activo', 1, '2026-06-09 11:12:06.315742 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 6, 2, 0.35, 5715, 20, 'Activo', 1, '2026-06-09 11:12:06.786517 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 7, 1, 1, 5715, 20, 'Activo', 1, '2026-06-09 11:12:10.573175 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 7, 2, 0.35, 5715, 20, 'Activo', 1, '2026-06-09 11:12:11.064053 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 8, 1, 1, 5715, 20, 'Activo', 1, '2026-06-09 11:12:14.840756 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 8, 2, 0.35, 5715, 20, 'Activo', 1, '2026-06-09 11:12:15.305090 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 9, 1, 1.5, 2000, 20, 'Activo', 1, '2026-06-27 10:04:11.453766 -05:00'::timestamptz),
      ('Scotiabank', 'SCOTIABANK', 9, 2, 1, 2000, 20, 'Activo', 1, '2026-06-27 10:04:11.453766 -05:00'::timestamptz)
  ),
  datos_resueltos AS (
    SELECT
      cs.id AS id_codigo_servicio,
      b.id AS id_banco,
      d.id_comunidad,
      d.tipo_deposito,
      d.comision_servicio,
      d.monto_minimo_deposito_servicio,
      d.comision_minima_servicio,
      e.id AS id_estado,
      d.id_usuario,
      d.fecha_registro
    FROM datos_origen d
    JOIN public.tb_codigo_servicio cs
      ON upper(cs.nombre) = upper(d.codigo_servicio_nombre)
    JOIN public.tb_banco b
      ON upper(b.nombre) = upper(d.banco_nombre)
    JOIN public.tb_estado e
      ON upper(e.nombre) = upper(d.estado_nombre)
  ),
  insertados AS (
    INSERT INTO public.tb_reglas_efectivizacion (
      id_codigo_servicio,
      id_banco,
      id_comunidad,
      tipo_deposito,
      comision_servicio,
      monto_minimo_deposito_servicio,
      comision_minima_servicio,
      id_estado,
      id_usuario,
      fecha_registro
    )
    SELECT
      r.id_codigo_servicio,
      r.id_banco,
      r.id_comunidad,
      r.tipo_deposito,
      r.comision_servicio,
      r.monto_minimo_deposito_servicio,
      r.comision_minima_servicio,
      r.id_estado,
      r.id_usuario,
      r.fecha_registro
    FROM datos_resueltos r
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.tb_reglas_efectivizacion t
      WHERE t.id_codigo_servicio = r.id_codigo_servicio
        AND t.id_banco = r.id_banco
        AND t.id_comunidad = r.id_comunidad
        AND t.tipo_deposito = r.tipo_deposito
        AND t.comision_servicio = r.comision_servicio
        AND t.monto_minimo_deposito_servicio = r.monto_minimo_deposito_servicio
        AND t.comision_minima_servicio = r.comision_minima_servicio
        AND t.id_estado = r.id_estado
        AND coalesce(t.id_usuario, 0) = coalesce(r.id_usuario, 0)
        AND t.fecha_registro = r.fecha_registro
    )
    RETURNING 1
  )
  SELECT count(*) INTO v_insertados
  FROM insertados;

  RAISE NOTICE 'tb_reglas_efectivizacion: % fila(s) insertada(s).', v_insertados;
END;
$$;
