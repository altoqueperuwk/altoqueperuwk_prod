-- 07_permisos_usuario.sql
-- Asigna los menús de Compensaciones a los usuarios activos según su rol. Ejecutar junto con la publicación del frontend.
-- No toca permisos existentes ni a los superadministradores (ven todo). Se puede repetir para usuarios nuevos.

BEGIN;
DO $guard$
BEGIN
    IF coalesce(current_setting('app.confirmar_despliegue_compensaciones', true), '') <> 'si' THEN
        RAISE EXCEPTION 'Confirma el despliegue con: SET app.confirmar_despliegue_compensaciones = ''si'';';
    END IF;
END
$guard$;
SET LOCAL lock_timeout = '5s';

WITH rol_ruta (id_rol, ruta) AS (
    VALUES
        (1, '/compensaciones/atenciones'),
        (1, '/compensaciones/resumen'),
        (1, '/compensaciones/colaboradores'),
        (1, '/compensaciones/configuracion'),
        (1, '/compensaciones/llamadas'),
        (1, '/compensaciones/otros-bonos/propuesta_innovacion'),
        (1, '/compensaciones/reportes'),
        (1, '/compensaciones/referidos'),
        (1, '/compensaciones/otros-bonos/tiktok_live'),
        (1, '/compensaciones/bonos-mes'),
        (1, '/compensaciones/calificaciones'),
        (1, '/compensaciones/otros-bonos/video_viral'),
        (1, '/compensaciones/auditoria-operaciones'),
        (1, '/compensaciones/indisciplina-colaborador'),
        (1, '/compensaciones/penalidad-escalonada-bonos'),
        (1, '/compensaciones/auditoria-cuadre-cierre'),
        (1, '/compensaciones/otros-bonos/recuperacion_cliente'),
        (2, '/compensaciones/resumen'),
        (2, '/compensaciones/atenciones'),
        (2, '/compensaciones/referidos'),
        (2, '/compensaciones/otros-bonos/tiktok_live'),
        (2, '/compensaciones/otros-bonos/propuesta_innovacion'),
        (2, '/compensaciones/auditoria-operaciones'),
        (2, '/compensaciones/auditoria-cuadre-cierre'),
        (2, '/compensaciones/indisciplina-colaborador'),
        (2, '/compensaciones/penalidad-escalonada-bonos'),
        (3, '/compensaciones/resumen'),
        (3, '/compensaciones/colaboradores'),
        (3, '/compensaciones/calificaciones'),
        (3, '/compensaciones/llamadas'),
        (3, '/compensaciones/atenciones'),
        (3, '/compensaciones/referidos'),
        (3, '/compensaciones/mis-bonos-descuentos'),
        (3, '/compensaciones/incidencias'),
        (3, '/compensaciones/auditoria-operaciones'),
        (3, '/compensaciones/indisciplina-colaborador'),
        (3, '/compensaciones/penalidad-escalonada-bonos'),
        (3, '/compensaciones/otros-bonos/propuesta_innovacion'),
        (3, '/compensaciones/otros-bonos/tiktok_live'),
        (4, '/compensaciones/resumen'),
        (4, '/compensaciones/calificaciones'),
        (4, '/compensaciones/llamadas'),
        (4, '/compensaciones/atenciones'),
        (4, '/compensaciones/referidos'),
        (4, '/compensaciones/auditoria-operaciones'),
        (4, '/compensaciones/indisciplina-colaborador'),
        (4, '/compensaciones/otros-bonos/propuesta_innovacion'),
        (4, '/compensaciones/otros-bonos/tiktok_live'),
        (5, '/compensaciones/resumen'),
        (5, '/compensaciones/referidos'),
        (5, '/compensaciones/auditoria-operaciones'),
        (5, '/compensaciones/indisciplina-colaborador'),
        (5, '/compensaciones/otros-bonos/propuesta_innovacion'),
        (6, '/compensaciones/resumen'),
        (6, '/compensaciones/referidos'),
        (6, '/compensaciones/auditoria-operaciones'),
        (6, '/compensaciones/indisciplina-colaborador'),
        (6, '/compensaciones/otros-bonos/video_viral'),
        (6, '/compensaciones/otros-bonos/recuperacion_cliente'),
        (6, '/compensaciones/otros-bonos/tiktok_live'),
        (6, '/compensaciones/otros-bonos/propuesta_innovacion')
)
INSERT INTO public.tb_permiso_usuario (id_usuario, id_permiso_menu, id_estado, id_usuario_registra)
SELECT u.id, m.id, activo.id, NULL
FROM rol_ruta r
CROSS JOIN LATERAL (SELECT id FROM public.tb_estado WHERE upper(btrim(nombre)) = 'ACTIVO' ORDER BY id LIMIT 1) activo
JOIN public.tb_usuario u ON u.id_rol = r.id_rol AND u.id_estado = activo.id AND NOT coalesce(u.flag_super_admin, false)
JOIN public.tb_permiso_menu m ON m.ruta = r.ruta
ON CONFLICT (id_usuario, id_permiso_menu) DO NOTHING;

COMMIT;
