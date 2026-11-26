-- 90_reversa_compensaciones.sql
-- Retira lo instalado por 01 a 07. Borra los datos registrados en Compensaciones: respaldar antes.
-- No toca tablas operativas, salvo los menús y permisos de Compensaciones.
-- No borra el rol Marketing ni los buckets (se eliminan desde el panel de Supabase si quedan vacíos).
-- Requiere: SET app.confirmar_reversa_compensaciones = 'si';

BEGIN;
DO $guard$
BEGIN
    IF coalesce(current_setting('app.confirmar_reversa_compensaciones', true), '') <> 'si' THEN
        RAISE EXCEPTION 'Confirma la reversa con: SET app.confirmar_reversa_compensaciones = ''si'';';
    END IF;
END
$guard$;
SET LOCAL lock_timeout = '5s';

DO $reversa$
DECLARE r record;
BEGIN
    -- Políticas de almacenamiento (dependen de funciones de Compensaciones).
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'compensaciones\_%' LOOP
        EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname);
    END LOOP;

    -- Menús y permisos de Compensaciones; luego los grupos que quedan vacíos.
    DELETE FROM public.tb_permiso_usuario WHERE id_permiso_menu IN (SELECT id FROM public.tb_permiso_menu WHERE ruta LIKE '/compensaciones%');
    DELETE FROM public.tb_permiso_menu WHERE ruta LIKE '/compensaciones%';
    DELETE FROM public.tb_permiso_usuario WHERE id_permiso_menu IN (
        SELECT g.id FROM public.tb_permiso_menu g
        WHERE g.ruta IS NULL AND g.nombre IN ('Vista general', 'Personal', 'Gestión comercial', 'Innovación y redes', 'Control', 'Liquidaciones', 'Gestión de bonos')
          AND NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu h WHERE h.id_padre = g.id));
    DELETE FROM public.tb_permiso_menu g
        WHERE g.ruta IS NULL AND g.nombre IN ('Vista general', 'Personal', 'Gestión comercial', 'Innovación y redes', 'Control', 'Liquidaciones', 'Gestión de bonos')
          AND NOT EXISTS (SELECT 1 FROM public.tb_permiso_menu h WHERE h.id_padre = g.id);

    -- Tablas de Compensaciones (sus triggers, índices y restricciones salen con ellas).
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'tb\_compensacion%' LOOP
        EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
    END LOOP;

    -- Funciones de Compensaciones.
    FOR r IN SELECT p.oid::regprocedure AS firma FROM pg_proc p
             WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.proname LIKE '%compensacion%' LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.firma);
    END LOOP;
END
$reversa$;

NOTIFY pgrst, 'reload schema';
COMMIT;
