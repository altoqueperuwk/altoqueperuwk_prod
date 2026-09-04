# Contexto General Frontend

## Vigencia

Esta guia describe el frontend vigente al 22/08/2026. El codigo fuente es la
fuente final; esta guia resume los contratos para retomar el trabajo en otra
sesion.

## Stack y entrada

- React 19 + TypeScript.
- Vite 8 y React Router 7.
- Supabase JS para RPC.
- `motion/react` para animaciones.
- Tailwind CSS 4 con tokens semanticos.
- Untitled UI/React Aria para controles.
- ExcelJS, XLSX, JSZip y html2pdf para cargas y reportes.

La entrada de rutas esta en `src/main.tsx`.

## Rutas

### Bancarias

```text
/operaciones/bcp
/operaciones/bbva
/operaciones/scotiabank
/operaciones/banbif
/operaciones/interbank
/operaciones/safetypay
```

`BancariaPage` atiende las seis rutas. SafetyPay conserva una ruta interna,
pero el espacio visual de Interbank puede integrar sus empresas y operaciones.
No asumir que SafetyPay es el mismo banco en todos los contratos RPC.

### Asistidas y Pago Deuda

```text
/operaciones/pos
/operaciones/linkpago
/operaciones/pagodeuda
/operaciones/pago-deuda
/operaciones/deuda
```

La vista bancaria y la vista global de Pago Deuda son pantallas distintas.

## Pantalla bancaria

Componentes principales:

```text
pages/bancaria-page.tsx
  -> bancaria-kpi-grid.tsx
  -> bancaria-inline-forms.tsx
  -> bancaria-excel-upload.tsx
  -> bancaria-operational-tabs.tsx
       -> bancaria-efectivizacion-table.tsx
       -> use-bancaria-bandeja.ts
       -> use-bancaria-kpis.ts
       -> use-bancaria-tab-badges.ts
```

La pantalla contiene acciones de fecha/cierre/descarga/configuracion, tabs de
empresa, KPI, formulario Ingreso y Salidas, Operacion Efectivizacion, carga
Excel y bandejas.

`Mover Saldo` queda oculto en el codigo. El formulario visible `Ingreso y
Salidas` registra solo en la caja origen; la empresa/cuenta destino queda como
referencia o concepto y no crea un movimiento en la caja destino.

## Tabs y bandejas

Tabs principales:

```text
Efectivizacion TC
Pago Deuda TC
Movimientos
```

El dropdown `Seleccionar` mantiene las bandejas antiguas:

```text
Eliminados
Efectivizacion
POS
Derivados
Retenidos
```

Efectivizacion TC unifica Efectivizacion, POS y Derivados; la columna Flujo
diferencia cada tipo. Pago Deuda TC conserva los pasos de Pago Deuda.

En las tablas actuales:

- Fuera de Horario se oculta visualmente;
- Derivo queda vacio cuando no existe destino;
- cada Flujo tiene color diferenciado;
- PAGADO se muestra gris y sus controles quedan congelados;
- se conserva checkbox y menu Reiniciar en una fila pagada;
- acciones de comision especial/extra solo aplican a Efectivizacion;
- Confirmar Pago Deuda aparece cuando existe match de DNI;
- Pago Deuda TC no exige codigo de transferencia para avanzar del paso 1 al 2.

## Seleccion persistente

La seleccion se guarda globalmente por `id` para Efectivizacion TC y Pago Deuda
TC. Se conserva al cambiar pagina, bandeja, finalizar Excel o recibir nuevas
filas.

Se limpia al cambiar empresa, cuenta, filtros, fechas, cierre historico o al
completar correctamente una accion. Las acciones masivas procesan solo filas
elegibles de la bandeja activa y retiran solo las procesadas.

Seleccionar un checkbox no debe disparar RPC, refresco de KPI ni recarga de
tabla.

## Refresco y rendimiento

El modulo usa `refreshKey` y `metricsRefreshKey` como invalidadores. Se
actualiza por acciones reales:

- guardar formularios/modales;
- terminar Excel;
- cambiar empresa, cuenta, bandeja, filtro o fecha;
- editar una fila;
- pagar, derivar, reiniciar, Directo, eliminar u otra accion rapida;
- cerrar o reabrir caja.

No hay refresco automatico por volver a Firefox ni por `focus` o
`visibilitychange`. Se conservan filas, seleccion, pagina y filtros.

`use-bancaria-bandeja.ts` reconcilia por `id`, conserva filas sin cambios y
anima solo entradas/salidas. El orden es ascendente por
`fecha_deposito_cliente`, luego `fecha_registro` e `id`.

La invalidacion por alcance esta implementada en los hooks y servicios de
operaciones. Para el comportamiento vigente, consultar el mapa funcional de
`backend/documentacion_funcional/36_mapa_funcional_vigente_2026-09.md`.

## KPI

`use-bancaria-kpis.ts` consulta KPI de ruta/caja. Solo para Scotiabank y BanBif
consulta `f_get_tb_ruta_operacion_ganancias_efectivizacion` y reemplaza el
valor visual de Ganancias.

La lectura especial filtra Efectivizacion/PAGADO, usa Mismo Dia o Dia Siguiente,
y agrupa por `fecha_deposito_cliente` en Lima. No suma Dia Siguiente pendiente
y no escribe cajas, movimientos ni KPI.

La visibilidad de Caja Recaudacion o Retencion Recaudacion depende del contexto
de la cuenta y sus combinaciones de retencion. Las cuentas vigentes estan en
`backend/CONTEXTO_GENERAL_BACKEND.md`.

## Cajas y conciliacion

Desde Configuracion > Cajas se puede crear/asociar caja, registrar saldo
inicial y conciliarlo contra la banca. El modal de conciliacion muestra saldo
del sistema, un input vacio con placeholder `S/ 0.00`, acepta `1,000.00`,
`1000` y `1,000`, y muestra el ajuste administrativo.

El movimiento inicial no cuenta como ingreso comercial. El cierre conserva el
snapshot y reinicia la caja viva siguiente en cero. Las operaciones finalizadas
quedan en historico; las abiertas se muestran en Hoy. Una pendiente heredada al
pagarse solo afecta Salidas, Gastos y Caja Actual del ciclo vivo, sin ganancia
nueva ni cambio del cierre anterior.

## Carga de Excel/TXT

El parser esta en:

```text
src/features/operaciones/efectivizacion/shared/utils/excel-parser.ts
```

Normaliza cabeceras, montos, fechas y filas segun banco. BCP usa formato de
ancho fijo y conserva la hora real de Lima. Al terminar, `onProcessed` actualiza
la vista sin borrar la seleccion persistente.

## POS y Link Pago

En `/operaciones/pos`, el switch `Sin Envio Solicitud` cambia el flujo:

- apagado: POS normal, Banco Transferir visible y estado solicitado;
- encendido: banco destino oculto, estado PAGADO, comision/transferencia cero,
  sin solicitud bancaria y sin movimiento de caja.

Link Pago mantiene su flujo asistido independiente.

## Pago Deuda

`/operaciones/pagodeuda` registra solicitudes, comisiones y pasos. Pago Deuda TC
en bancos permite transferencia, devolucion, match y comision. El match opera
en una ventana de 24 horas. La pantalla global permite eliminar solicitudes
seleccionadas.

## Servicio RPC

Las llamadas se centralizan principalmente en:

```text
src/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service.ts
src/features/operaciones/pago-deuda/services/pago-deuda.service.ts
```

No duplicar contratos en componentes. Si cambia un payload, revisar servicio,
tipos, hook y todos los tabs consumidores.

## Reglas para continuar

- El frontend no es la validacion definitiva de negocio.
- No sustituir movimientos de caja por calculos visuales.
- No usar fecha de carga para decidir retencion.
- No usar fecha de pago para reubicar la ganancia especial.
- No reactivar liberacion automatica de retenciones sin decision funcional.
- Usar tokens semanticos y `motion/react`; no colores Tailwind crudos.
- Mantener contexto de ruta, empresa, cuenta, caja, fecha y cierre historico.

## Validacion

```bash
npm exec tsc -- --noEmit
npm run build
git diff --check
```

