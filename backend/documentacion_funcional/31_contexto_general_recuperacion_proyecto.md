# 31. Contexto General de Recuperacion del Proyecto

## Objetivo

Este documento sirve como mapa de recuperacion si se corrompen archivos del frontend, backend o documentacion. Resume la arquitectura vigente y los archivos criticos que permiten reconstruir el contexto del sistema sin depender del historial del chat.

## Lectura minima para recuperar contexto

Si se pierde contexto, leer en este orden:

1. `00_orden_de_lectura.md`
2. `09_contexto_general_y_objetivo.md`
3. `backend/backend_implementacion/00.indice_backend_implementacion.md`
4. `28_operaciones_flujo_negocio_actual.md`
5. `29_operaciones_frontend_interaccion_actual.md`
6. `30_operaciones_pruebas_retenciones_y_cierres.md`
7. Este documento.

## Backend: fuente de verdad

Carpeta principal:

- `backend/backend_implementacion/`

Indice tecnico:

- `backend/backend_implementacion/00.indice_backend_implementacion.md`

Archivos SQL por dominio:

- `01.core_catalogos_permisos.sql`
- `02.core_clientes_servicios_empresas_reglas.sql`
- `03.operacion_proceso_y_excel.sql`
- `04.pago_deuda.sql`
- `05.ruta_operacion_y_cajas.sql`
- `06.scripts_insert_functions.sql`
- `07.respuesta_consultas_selects.sql`
- `08.backfill_operacion_caja_ingreso_salida.sql`
- `09.rollback_operaciones_para_pruebas.sql`
- `10.retenciones_scotiabank_banbif.sql`

Scripts de prueba relacionados:

- `backend/backend_pruebas/10.simular_scotiabank_ayer.sql`
- `backend/backend_pruebas/11.reparar_retenciones_kpi_caja.sql`

Reglas backend que no deben olvidarse:

- Toda RPC publica consumida desde frontend debe usar `SECURITY DEFINER`.
- Si se modifica una funcion en `backend_implementacion/`, actualizar el bloque final de `DROP FUNCTION`.
- Si se modifica una tabla, el `ALTER TABLE` debe quedar debajo de la creacion de esa misma tabla.
- Los scripts de prueba deben terminar en `ROLLBACK` por defecto.

## Frontend: rutas principales

Archivo de rutas:

- `src/main.tsx`

Rutas de `Sistema`:

- `/sistema/estado`
- `/sistema/rol`
- `/sistema/sucursal`
- `/sistema/comunidad`
- `/sistema/codigo-servicio`
- `/sistema/usuario`
- `/sistema/permiso-menu`
- `/sistema/permiso-usuario`
- `/sistema/cliente`
- `/sistema/banco`
- `/sistema/empresa`
- `/sistema/reglas-efectivizacion`
- `/sistema/caja-operativa`
- `/sistema/empresa/:empresaId/cuentas`

Rutas de `Operaciones`:

- `/operaciones/bcp`
- `/operaciones/bbva`
- `/operaciones/scotiabank`
- `/operaciones/banbif`
- `/operaciones/interbank`
- `/operaciones/safetypay`
- `/operaciones/pos`
- `/operaciones/linkpago`
- `/operaciones/deuda`
- `/operaciones/pago-deuda`
- `/operaciones/pagodeuda`

## Frontend: proveedores y base tecnica

Archivos criticos:

- `src/lib/supabase.ts`
- `src/providers/auth-provider.tsx`
- `src/providers/session-cache-provider.tsx`
- `src/providers/theme-provider.tsx`
- `src/providers/toast-provider.tsx`
- `src/providers/router-provider.tsx`
- `src/components/application/app-layout.tsx`
- `src/components/application/sidebar-navigation.tsx`
- `src/components/application/breadcrumb.tsx`

Reglas visuales:

- Usar Untitled UI como base.
- Usar tokens semanticos de color.
- No usar colores Tailwind crudos en nuevos cambios.
- Usar `motion/react` para transiciones moderadas.
- No recrear controles planos si existe componente base.

## Sistema: estructura de features

Carpeta:

- `src/features/sistema/`

Patron por modulo:

- `<modulo>-page.tsx`
- `<modulo>-table.tsx`
- `<modulo>-popup.tsx`
- `<modulo>-history-drawer.tsx`

Modulos actuales:

- `estado`
- `rol`
- `sucursal`
- `comunidad`
- `codigo-servicio`
- `usuario`
- `permiso-menu`
- `permiso-usuario`
- `cliente`
- `banco`
- `empresa`
- `empresa-cuenta-bancaria`
- `reglas-efectivizacion`
- `caja-operativa`

Servicios globales usados por Sistema:

- `src/services/estado.service.ts`
- `src/services/rol.service.ts`
- `src/services/sucursal.service.ts`
- `src/services/comunidad.service.ts`
- `src/services/codigo-servicio.service.ts`
- `src/services/usuario.service.ts`
- `src/services/permiso-menu.service.ts`
- `src/services/permiso-usuario.service.ts`
- `src/services/cliente.service.ts`
- `src/services/banco.service.ts`
- `src/services/empresa.service.ts`
- `src/services/empresa-cuenta-bancaria.service.ts`
- `src/services/reglas-efectivizacion.service.ts`
- `src/services/caja-operativa.service.ts`

### Empresa y cuentas bancarias

Archivos importantes:

- `src/features/sistema/empresa/empresa-page.tsx`
- `src/features/sistema/empresa/empresa-table.tsx`
- `src/features/sistema/empresa/empresa-popup.tsx`
- `src/features/sistema/empresa/empresa-cuentas-modal.tsx`
- `src/features/sistema/empresa-cuenta-bancaria/empresa-cuenta-bancaria-page.tsx`
- `src/features/sistema/empresa-cuenta-bancaria/empresa-cuenta-bancaria-popup.tsx`

Regla de retenciones:

- `tb_empresa_cuenta_bancaria.flag_retencion` es la fuente de verdad.
- Scotiabank y Banbif deben marcar retencion para ingresos retenidos.

### Caja operativa

Archivos importantes:

- `src/features/sistema/caja-operativa/caja-operativa-page.tsx`
- `src/features/sistema/caja-operativa/caja-operativa-popup.tsx`
- `src/features/sistema/caja-operativa/caja-operativa-ruta-modal.tsx`

Reglas:

- Cajas conectan empresa + cuenta bancaria.
- Rutas operativas se configuran desde caja.
- Transferencia de caja requiere que origen y destino tengan caja operativa.

## Operaciones: estructura de features

Carpeta raiz:

- `src/features/operaciones/`

Familias:

- `efectivizacion/bancaria`
- `efectivizacion/asistida`
- `efectivizacion/shared`
- `pago-deuda`

## Operaciones compartido

Carpeta:

- `src/features/operaciones/efectivizacion/shared/`

Componentes:

- `components/operation-table.tsx`
- `components/operation-toolbar.tsx`
- `components/empresa-tabs.tsx`
- `components/compact-table-primitives.tsx`
- `components/inline-form-card.tsx`
- `components/route-config-drawer.tsx`
- `components/route-kpi-card.tsx`

Hooks:

- `hooks/use-route-companies.ts`
- `hooks/use-active-company.ts`

Servicios:

- `services/operaciones-rpc.service.ts`

Tipos:

- `types/operaciones.types.ts`

Utils:

- `utils/route-config.ts`
- `utils/excel-parser.ts`
- `utils/rpc-payloads.ts`
- `utils/action-rules.ts`
- `utils/money.ts`
- `utils/csv.ts`

Tests importantes:

- `utils/excel-parser.test.ts`
- `utils/rpc-payloads.test.ts`
- `utils/action-rules.test.ts`
- `utils/route-config.test.ts`
- `utils/csv.test.ts`

## Operaciones bancarias

Carpeta:

- `src/features/operaciones/efectivizacion/bancaria/`

Pagina principal:

- `pages/bancaria-page.tsx`

Hooks:

- `hooks/use-bancaria-bandeja.ts`
- `hooks/use-bancaria-kpis.ts`
- `hooks/use-bancaria-tab-badges.ts`

Componentes:

- `components/bancaria-top-actions.tsx`
- `components/bancaria-kpi-grid.tsx`
- `components/bancaria-inline-forms.tsx`
- `components/bancaria-excel-upload.tsx`
- `components/bancaria-operational-tabs.tsx`
- `components/bancaria-efectivizacion-table.tsx`
- `components/bancaria-action-modal.tsx`
- `components/bancaria-history-dropdown.tsx`
- `components/bancaria-history-drawer.tsx`

Flujo general:

1. `BancariaPage` arma layout, empresa activa, KPI, formularios, carga y tabs.
2. `useRouteCompanies` obtiene cajas/rutas configuradas.
3. `useActiveCompany` resuelve empresa activa y cuentas disponibles.
4. `BancariaTopActions` maneja cierre, historia, asignar y descargar.
5. `BancariaInlineForms` maneja Mover Saldo, Ingreso/Salidas y Operacion Efectivizacion.
6. `BancariaExcelUpload` parsea archivo y llama RPC de Excel.
7. `BancariaOperationalTabs` concentra tabs, filtros, acciones masivas, retenciones, movimientos y export.
8. `BancariaEfectivizacionTable` maneja tabla enriquecida de Efectivizacion/Derivados.

Tabs bancarios:

- `Efectivizacion`
- `Pago Deuda`
- `Derivados`
- `POS`
- `Movimientos`
- `Retenidos`

Retenidos:

- Solo visibles para `scotiabank` y `banbif`.
- En `Hoy`, muestra ingresos retenidos abiertos.
- En historial de cierre, no debe mostrar ingresos retenidos como si pertenecieran al cierre.

## Pago Deuda frontend

Carpeta:

- `src/features/operaciones/pago-deuda/`

Archivos:

- `pages/pago-deuda-page.tsx`
- `components/pago-deuda-solicitud-form.tsx`
- `components/pago-deuda-board.tsx`
- `components/pago-deuda-action-modal.tsx`
- `services/pago-deuda.service.ts`

Flujo:

1. Solicitud.
2. Transferencia.
3. Retorno o match.
4. Comision separada.

La tabla de Pago Deuda usa:

- pasos visuales;
- empresa/cuenta destino de comision;
- acciones de transferencia, match y comision.

## Efectivizacion asistida

Carpeta:

- `src/features/operaciones/efectivizacion/asistida/`

Archivos:

- `pages/asistida-page.tsx`
- `components/asistida-solicitud-form.tsx`
- `components/asistida-operational-board.tsx`

Rutas:

- `/operaciones/pos`
- `/operaciones/linkpago`

## RPC y contratos criticos

Servicio principal:

- `src/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service.ts`

Servicio Pago Deuda:

- `src/features/operaciones/pago-deuda/services/pago-deuda.service.ts`

Servicios de Sistema:

- `src/services/*.service.ts`

Regla:

- El frontend no debe replicar contabilidad.
- El frontend arma payloads, consume RPC, actualiza estado local y refresca KPI/badges.
- La contabilidad real vive en SQL.

## Flujos que deben mantenerse

### Retenciones

- Fuente: `tb_empresa_cuenta_bancaria.flag_retencion`.
- Aplica a Scotiabank y Banbif.
- La operacion retenida aparece en `Efectivizacion` mientras pertenece al flujo operativo.
- Si la operacion retenida esta `Pagado`, sigue visible en `Efectivizacion > Todos` y `Efectivizacion > Pagados`.
- La retencion aparece en `Retenidos` hasta confirmacion.
- Los ingresos retenidos no suben caja disponible hasta confirmarse.
- Confirmar retencion no cambia el estado comercial; solo apaga `flag_retenido`.
- Las consultas operativas de estas rutas se separaron en `backend/backend_implementacion/10.retenciones_scotiabank_banbif.sql`.
- Los bancos sin retencion usan los GETs generales sin reglas especiales de retenidos.

### Cierre de caja

- Cierra movimientos confirmados.
- Puede cerrar salidas pagadas aunque el ingreso este retenido.
- No cierra `INGRESO RETENIDO` pendiente.
- El KPI vivo de hoy puede arrastrar `Ingresos Retenidos` de ayer.

### Pago Deuda

- La comision es separada.
- `RETORNO` y `RETORNO_DIRECTO` generan solo ingreso.
- `PD Directo` no enlaza solicitud.
- Match usa fecha operacional del deposito.

### Actualizacion parcial

- No recargar datatable completo si una RPC devuelve la fila actualizada.
- Reemplazar/remover filas localmente.
- Refrescar KPI/badges por separado.
- Skeleton solo para cambios de universo: tab, empresa, filtro mayor o fecha.

## Checklist de recuperacion si algo se corrompe

1. Restaurar `src/main.tsx` para recuperar rutas.
2. Restaurar `src/lib/supabase.ts` y providers.
3. Restaurar servicios en `src/services/`.
4. Restaurar `operaciones-rpc.service.ts` y `pago-deuda.service.ts`.
5. Restaurar tipos en `operaciones.types.ts`.
6. Restaurar utils criticos:
   - `route-config.ts`
   - `excel-parser.ts`
   - `rpc-payloads.ts`
   - `action-rules.ts`
7. Restaurar `BancariaPage` y sus hooks.
8. Restaurar `BancariaOperationalTabs` y `BancariaEfectivizacionTable`.
9. Restaurar SQL por orden:
   - `01`
   - `02`
   - `03`
   - `04`
   - `05`
   - `10`
   - `06` si se necesita bootstrap.
10. Ejecutar `npm exec tsc -- --noEmit`.
11. Ejecutar pruebas unitarias relevantes si se tocaron parsers/utils.
12. Validar manualmente:
   - carga Excel/TXT;
   - retenciones;
   - pago;
   - cierre;
   - confirmacion de retenidos;
   - Pago Deuda.

## Comandos de validacion

TypeScript:

```bash
npm exec tsc -- --noEmit
```

Busqueda de funciones SQL:

```bash
rg "CREATE OR REPLACE FUNCTION" backend/backend_implementacion
```

Busqueda de rutas frontend:

```bash
rg "/operaciones|/sistema" src/main.tsx src/components/application
```

## Documentos relacionados

- `00_orden_de_lectura.md`
- `28_operaciones_flujo_negocio_actual.md`
- `29_operaciones_frontend_interaccion_actual.md`
- `30_operaciones_pruebas_retenciones_y_cierres.md`
- `backend/backend_implementacion/00.indice_backend_implementacion.md`
