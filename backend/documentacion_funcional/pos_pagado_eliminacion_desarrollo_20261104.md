# Eliminación de POS pagado — desarrollo, 04/11/2026

## Directiva

Administrador y jefe de tienda activos pueden eliminar un POS pagado, incluso
cuando la solicitud pertenece a otro usuario. El permiso se valida en frontend
y en backend a partir de la sesión autenticada; no basta enviar un ID de usuario.
Los POS pendientes y Link Pago conservan sus reglas anteriores.

## Confirmación

Antes de enviar la eliminación, el popup informa que el POS está pagado y muestra
POS, Empresa, Cod. Operacion, Entidad Tarjeta, DNI y Monto Deposito de la fila
seleccionada. Explica la reversión interna de movimientos abiertos y que no se
cancela el pago en el proveedor ni se devuelve dinero al cliente.

Cancelar conserva el registro. Confirmar utiliza la misma RPC existente.

## Backend

Archivo: `backend/backend_implementacion/03.operacion_proceso_y_excel.sql`.
Única función modificada por este ajuste:
`f_patch_tb_operacion_proceso_eliminar(bigint,bigint)`.

- Reconoce POS pagado por estado 4 o etiqueta Pagado.
- Comprueba usuario activo, perfil permitido y correspondencia con JWT.
- Conserva soft delete y snapshot de los movimientos para recuperación.
- Revierte movimientos abiertos mediante el mecanismo existente.
- Rechaza cierres en la operación o sus movimientos y saldo insuficiente.
- Registra al actor autenticado como gestor del POS eliminado.
- Mantiene firma de request y response; sin cambios estructurales de tablas.
- Consulta generadora de DROP al final del archivo; no se ejecutó DROP FUNCTION.

Se compiló exclusivamente esta función en la base de desarrollo. El respaldo
anterior está en `outputs/pos-paid-delete-dev-20261104/before.sql`.
Producción no fue actualizada y no se realizó commit ni push en esta tarea.

## Frontend afectado

- `src/features/operaciones/efectivizacion/asistida/utils/asistida-delete-permission.ts`
- `src/features/operaciones/efectivizacion/asistida/utils/asistida-delete-permission.test.ts`
- `src/features/operaciones/efectivizacion/asistida/components/asistida-operational-board.tsx`
- `src/features/operaciones/efectivizacion/asistida/components/pos-delete-summary.tsx`
- `src/features/operaciones/efectivizacion/asistida/components/pos-delete-summary.test.tsx`
- `src/features/operaciones/efectivizacion/shared/components/operacion-confirm-modal.tsx`

El modal compartido admite contenido adicional; otros consumidores conservan su
comportamiento. Hay otros cambios previos en el workspace: una futura entrega
debe seleccionar únicamente estos fragmentos, no el SQL completo sin revisión.

## Verificación

- 13 pruebas de frontend: permisos por perfil/estado y resumen de seis campos.
- TypeScript: `npx tsc --noEmit -p tsconfig.app.json`, sin errores.
- 14 comprobaciones SQL con `node scripts/dev-pos-paid-delete.cjs --test`:
  permisos, usuario inactivo, suplantación, estado por ID, otras rutas protegidas,
  soft delete/snapshot, reversión de saldo, cierres y saldo insuficiente.
- Las pruebas SQL usan SAVEPOINT y ROLLBACK; fingerprints de operaciones,
  movimientos y cajas idénticos antes/después. No se conservaron eliminaciones.
- DOM: sesión de administrador en localhost, POS pagado CULQI, código 456456465,
  monto S/1,000.00. Se verificó acción habilitada, alerta y datos, y se canceló.
  No se confirmó la eliminación desde el navegador.
- Evidencia: `outputs/pos-paid-delete-dev-20261104/confirmation.png` y `tests.json`.

No se ejecutó build de Vite ni se desplegó frontend a producción.
