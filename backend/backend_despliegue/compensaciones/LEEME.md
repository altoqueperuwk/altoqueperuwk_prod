# Pase de Compensaciones a producción

Paquete cerrado el 25/11/2026. Es la **única fuente de despliegue**: no ejecutar los archivos de `backend_implementacion/` ni de `archivo-historico/`. 

**Estado en producción (25/11/2026):** instalados `00` a `06`; `99` con 10 de 10 OK. **No volver a ejecutarlos.** Pendiente: `07`, junto con la publicación del frontend. `90` y `91` no se ejecutaron.

## Orden de ejecución

| Script                       | Contenido                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `00_core_previo.sql`         | Rol Marketing (id 6) y 5 funciones de clientes                                |
| `01_tablas_y_catalogos.sql`  | Tablas, restricciones, índices y RLS; sin llaves hacia `tb_operacion_proceso` |
| `02_semillas_catalogo.sql`   | Catálogos, reglas, menús (incluye "Reporte de Bonos") y buckets               |
| `03_funciones_privadas.sql`  | Funciones `f_private_*`                                                       |
| `04_funciones_lectura.sql`   | Funciones `f_get_*`                                                           |
| `05_funciones_escritura.sql` | Funciones de escritura y triggers sobre tablas de Compensaciones              |
| `06_permisos_acl.sql`        | `REVOKE/GRANT` y políticas de storage                                         |
| `07_permisos_usuario.sql`    | Menús por rol. **Ejecutar junto con la publicación del frontend**             |
| `99_verificacion.sql`        | Solo lectura; las 10 filas deben decir OK                                     |

Reversa, solo si hace falta: `90_reversa_compensaciones.sql` (borra Compensaciones y sus datos) y `91_reversa_clientes.sql` (las 5 funciones como estaban en producción).

## Antes de ejecutar

1. Respaldo de la base de producción confirmado.
2. Autorización explícita.
3. Sin personal trabajando: `00` y `01` bloquean por un momento escrituras en tablas operativas.
4. En la misma sesión: `SET app.confirmar_despliegue_compensaciones = 'si';` (la reversa usa `app.confirmar_reversa_compensaciones`). Cada script es una transacción; si uno falla, detenerse.

## Después

- Prueba de las rutas operativas: `/operaciones/pagodeuda`, `/atencion/cliente`, `bcp`, `bbva`, `scotiabank`, `banbif`, `interbank`; además POS, Link Pago y `/sistema/cliente`. Con un usuario Atención al Cliente: alta, carga masiva, solicitud de Pago Deuda con cliente nuevo y existente.
- Dar de alta a cada colaborador con su cargo y cargar las metas por sede en Configuración (no se siembran).
- Nadie tiene los menús hasta ejecutar `07`: en producción no hay superadministradores activos ni permisos de Compensaciones.

## Frontend (aparte, no incluido aquí)

- Debe incluir lo que hay en `origin/main`; BanBif queda como en `main` (cuenta 38).
- No viaja Conciliación bancaria (su función no existe en producción) ni la seguridad de usuarios y permisos.
- `supabase/.temp` no debe ir a `main`.
- Revisar el despliegue de la función `calificacion-publica` (calificaciones por QR); no se verificó en producción.

## Cómo se validó

En desarrollo, dentro de una transacción con `ROLLBACK`: reversa completa, instalación de `00` a `07`, comparación contra desarrollo y `99` (10 de 10 OK). Tablas, columnas, índices, funciones, ACL, triggers, RLS, menús, políticas y catálogos iguales; 6 restricciones `CHECK` cambian solo de redacción. `91` se ejecutó en la misma prueba.
