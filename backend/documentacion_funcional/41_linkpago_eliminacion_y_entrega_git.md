# Link Pago — Eliminación y entrega a develop/main

Fecha: 16 de octubre de 2026.

## Alcance

Administrador y jefe de tienda pueden eliminar lógicamente Link Pago, incluido Pagado y solicitudes de otros usuarios visibles en la bandeja. No se agregó restricción por sucursal: la autorización solicitada es por perfil, con el alcance de visibilidad existente. Los otros perfiles no pueden eliminar Link Pago. POS conserva su regla anterior.

La RPC comprueba la identidad con `auth.uid()`, el perfil activo y el rol en `tb_usuario`. Conserva compatibilidad con perfiles antiguos sin `auth_user_id` mediante el correo del JWT firmado. Rechaza un `p_id_usuario` que no coincida con la sesión. No autoriza por un ID arbitrario enviado por el cliente.

Se conservan las protecciones de movimientos cerrados, saldo de reversión, snapshot, estado Eliminado y actualización de KPI. No se realiza DELETE físico. Habilitar el botón no garantiza eliminar una operación con bloqueos contables.

## Archivos exactos de esta entrega

1. `src/features/operaciones/efectivizacion/asistida/components/asistida-operational-board.tsx` — papelera, confirmación y comprobación previa al envío.
2. `src/features/operaciones/efectivizacion/asistida/utils/asistida-delete-permission.ts` — regla independiente para Link Pago/POS.
3. `src/features/operaciones/efectivizacion/asistida/utils/asistida-delete-permission.test.ts` — pruebas de perfiles y estados.
4. `backend/backend_implementacion/03.operacion_proceso_y_excel.sql` — actualizar únicamente `f_patch_tb_operacion_proceso_eliminar(bigint,bigint)` para este bloque.
5. `backend/documentacion_funcional/41_linkpago_eliminacion_y_entrega_git.md` — este manifiesto.

La copia local del archivo SQL 03 también contiene el cambio previo de Impulsa BCP en `f_get_tb_operacion_retencion_hardcodeada`. La entrega puntual a GitHub excluye ese cambio: traslada solamente la función de eliminación y agrega su consulta generadora de DROP al final, conservando el resto del SQL remoto. No ejecutar ciegamente el archivo completo: contiene otras definiciones y cambios históricos. Las firmas no cambiaron; usar CREATE OR REPLACE de las funciones seleccionadas. La consulta final solo genera texto, no ejecuta DROP.

## Cambio previo separado: Impulsa BCP

Si también se entrega ese bloque, incluir además:

- `backend/backend_implementacion/05.ruta_operacion_y_cajas.sql`
- `backend/backend_implementacion/12.recaudacion_cortes_abonos.sql`
- `backend/CONTEXTO_GENERAL_BACKEND.md`
- `src/features/operaciones/efectivizacion/bancaria/utils/saldo-banco.ts`
- `src/features/operaciones/efectivizacion/bancaria/utils/saldo-banco.test.ts`

El SQL 03 es compartido por ambos bloques; separar sus hunks si se crean commits independientes. El resto de archivos modificados/no rastreados del repositorio no forman parte de estas dos entregas.

## Promoción

La rama local observada es `main`, con numerosos cambios ajenos pendientes. La entrega puntual usa un índice Git temporal, sin cambiar ramas ni alterar el índice o los archivos de trabajo del usuario. No usar `git add .`. Las ramas remotas `develop` y `main` estaban alineadas en `35bddd0` al preparar la entrega; se permite promover el mismo commit puntual por fast-forward a ambas, sin force-push ni mezclar otros bloques.

1. Partir del commit remoto compartido y preparar un árbol aislado con índice temporal; si las ramas divergen, detener la promoción para revisar.
2. Trasladar solo el diff del bloque y sus archivos nuevos; no copiar el árbol completo. En SQL 03, reemplazar únicamente `f_patch_tb_operacion_proceso_eliminar` y agregar su generador de DROP, sin Impulsa BCP.
3. Compilar manualmente la función en desarrollo; probar con sesiones reales de administrador, jefe y perfil no autorizado. Verificar rechazo de ID suplantado, bloqueos contables y POS pagado. No se ejecutaron esas RPC destructivas durante la implementación.
4. Revisar el árbol aislado y subir el commit a `develop` según autorización del usuario; si la protección de rama requiere PR, respetarla.
5. Promover el mismo commit revisado a `main` por fast-forward cuando ambas ramas partan de la misma base. No mezclar compensaciones u otros trabajos pendientes ni usar force-push.
6. El responsable aplica la función SQL en producción y despliega el frontend. Preferir backend antes del frontend, porque la interfaz por sí sola no concede permisos.

No se compiló SQL, no se modificaron datos y no se eliminaron operaciones. No se ejecutó `npm run build`. Las pruebas unitarias no sustituyen una prueba de autorización en PostgreSQL desplegado.

Verificación local: 17 pruebas correctas entre permisos de eliminación (8) y Saldo Banco (9); TypeScript `tsc --noEmit -p tsconfig.app.json` sin errores. Diff de archivos modificados sin errores de espacios. No se afirmó validación DOM posterior ni autorización real del SQL nuevo, pendiente de compilación manual.
