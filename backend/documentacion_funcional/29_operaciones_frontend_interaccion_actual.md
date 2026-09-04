# 29. Operaciones: Interaccion Frontend Actual

> **Estado vigente 04/09/2026:** Consultar primero
> [`36_mapa_funcional_vigente_2026-09.md`](36_mapa_funcional_vigente_2026-09.md).
> Este documento conserva el detalle de interaccion,
> pero las bandejas actuales se leen como `Efectivizacion TC`, `Pago Deuda TC` y
> `Movimientos`, con bandejas antiguas dentro del selector. Ver
> [`src/CONTEXTO_GENERAL_FRONTEND.md`](../../src/CONTEXTO_GENERAL_FRONTEND.md).
> Si una seccion posterior difiere, prevalece este bloque y el codigo vigente.

### Cambios de UX vigentes

- Las acciones de guardado, Excel finalizado, cambio de empresa/cuenta/bandeja,
  acciones de fila y acciones masivas disparan la actualizacion necesaria.
- Volver desde otra pestana del navegador no dispara una cascada automatica de RPC.
- La seleccion de filas permanece entre paginacion, cambio entre las dos bandejas
  principales y carga Excel; se limpia solo al cambiar contexto real o completar
  correctamente la accion.
- La tabla conserva filas durante el refresco y usa actualizacion parcial con motion;
  no muestra un skeleton completo por cada accion.
- La vista unificada muestra `Flujo`, mantiene acciones propias de cada flujo y
  permite derivar POS y operaciones Efectivizacion sin cambiar el backend.
- Las filas pagadas se ven grises; checkbox y `Reiniciar` quedan disponibles cuando
  el backend permite revertirlas.

## Objetivo

Documentar como interactua actualmente el frontend de operaciones con el flujo de negocio. Este documento complementa los documentos 17-27 y corrige puntos que cambiaron durante la implementacion.

## Estructura general de pantalla bancaria

Cada ruta bancaria usa una pantalla con:

1. Encabezado de ruta.
2. Selector de empresa.
3. Acciones superiores:
   - cierre;
   - fecha historica;
   - asignar;
   - descargar.
4. KPI cards.
5. Formularios inline.
6. Carga de archivo.
7. Tabs operativos.

## Estructura de pantalla asistida POS/Link Pago

Las rutas asistidas usan una pantalla distinta a la bancaria:

- `/operaciones/pos`
- `/operaciones/linkpago`

No muestran:

- caja inicial;
- caja actual;
- cierre de caja;
- historial por cierre;
- carga Excel;
- movimientos de caja.

Si muestran:

- selector de fecha de registro;
- KPI informativos `Gastos`, `Ganancia` y `Salidas`;
- formulario de registro;
- bandeja de operaciones registradas en la fecha seleccionada.

La fecha superior filtra por `tb_operacion_proceso.fecha_registro`.

## Selector de fecha

El selector permite:

- `Hoy`: ciclo vivo de caja.
- Fecha historica: consulta cierres anteriores.

Reglas:

- En modo `Hoy`, las bandejas operativas muestran operaciones vivas.
- En modo historico, se consulta por `fecha_caja_cierre`.
- `Retenidos` no debe mostrar ingresos retenidos en historial de cierre, porque esos ingresos quedaron abiertos para el siguiente ciclo.

## Boton Descargar

El boton "Descargar" en la barra superior abre un modal con 2 opciones:

- **Excel**: genera un `.xlsx` con 4 sheets (Efectivizaciones, Pago Deuda, Movimientos, Retenciones).
- **PDF**: abre ventana de impresion con el componente `BancariaReporteCierrePdf`.

### Comportamiento

1. Al hacer clic, se ejecuta `f_get_reporte_cierre` con los parametros `p_id_caja`, `p_id_empresa`, `p_ruta` y `p_fecha_cierre`.
2. La respuesta incluye 5 secciones: `kpi`, `efectivizacion`, `pago_deuda`, `movimientos`, `retenciones`.
3. Los datos provienen de las mismas tablas que los tabs operativos de la web:
   - Efectivizacion y Pago Deuda: `tb_operacion_proceso`
   - Movimientos OTRO: `tb_operacion_caja`
   - Retenciones: `tb_operacion_proceso`
   - KPI: `tb_caja_operativa_cierre` (historico) o `tb_ruta_operacion_kpi` (hoy)
4. En modo Hoy (`selectedHistoryDate = null`), se descargan operaciones vivas (`id_caja_cierre IS NULL`).
5. En modo Historico, se descargan operaciones congeladas del cierre seleccionado.

Las columnas del PDF coinciden exactamente con los DataTables de la web. Ver `32_operaciones_descarga_reportes.md`.

## Formularios inline actuales

Los tres formularios usan componentes base Untitled UI:

- `Input`
- `NativeSelect`
- `Button`
- `ButtonGroup`

### Mover Saldo

Campos:

- `Empresa`: bloqueado con la empresa activa.
- `Cuenta`: dropdown con cuentas de la empresa activa.
- `Empresa Destino`: dropdown con placeholder `Seleccionar`.
- `Cuenta Destino`: dropdown con placeholder `Seleccionar`, filtrado por empresa destino.
- `Monto a Depositar`.

Reglas:

- La cuenta origen debe tener caja operativa.
- La cuenta destino se lista desde cuentas bancarias activas.
- Para ejecutar la transferencia, la cuenta destino debe tener caja operativa configurada.
- Si no tiene caja, se muestra error y no se ejecuta la RPC.

### Ingreso y Salidas

Campos:

- `Empresa`: bloqueado con la empresa activa.
- `Cuenta`: dropdown con cuentas de la empresa activa.
- `Movimiento`: segmentado `Ingreso` / `Salida`.
- `Monto`.
- `Concepto`.

Reglas:

- `Concepto` es obligatorio.
- La cuenta seleccionada debe tener caja.
- Estos movimientos son manuales y se visualizan como `OTROS` cuando corresponde.

### Operacion Efectivizacion

Campos:

- `Empresa`: bloqueado.
- `Cuenta`: bloqueado con la primera cuenta disponible de la empresa activa.
- `Codigo Operacion`.
- `DNI`.
- `Monto`.
- `Comunidad`.

Reglas:

- Registra una operacion manual de efectivizacion.
- Usa el codigo de servicio correspondiente a la ruta.
- Entra como `Pendiente`.
- La atencion posterior ocurre desde el tab `Efectivizacion`.

## Carga de archivos

El bloque de carga admite:

- Excel `.xlsx` / `.xls`
- HTML `.html` / `.htm`
- TXT para BCP segun el formato bancario nuevo.

Reglas:

- La carga de detalle se oculta visualmente para evitar ruido.
- El parser normaliza columnas por banco.
- En BCP TXT se usa el codigo de operacion corto.
- En Scotiabank y Banbif, la fecha operacional relevante es `fecha_deposito_cliente`.

## Tabs operativos

Tabs:

- `Efectivizacion`
- `Pago Deuda`
- `Derivados`
- `POS`
- `Movimientos`
- `Retenidos`

### Retenidos por ruta

`Retenidos` solo aparece para:

- `/operaciones/scotiabank`
- `/operaciones/banbif`

No aparece para:

- `/operaciones/bcp`
- `/operaciones/bbva`
- `/operaciones/interbank`
- `/operaciones/safetypay`

Para Scotiabank y Banbif, las bandejas operativas no usan directamente el GET generico `f_get_tb_operacion_proceso`.
Usan funciones separadas de retencion:

- `f_get_tb_operacion_retencion_bandeja`
- `f_get_tb_operacion_retencion_bandeja_badges`
- `f_get_tb_operacion_retencion_empresa_badges`

Esto evita que reglas de cierre, historial y retenciones se mezclen con bancos que no retienen.

## Badges

### Badges de tabs

Muestran conteos por bandeja:

- Efectivizacion: pendientes.
- Derivados: pendientes derivados.
- Pago Deuda: solicitudes/pendientes segun flujo.
- Retenidos: operaciones con retencion abierta, sin depender del estado comercial.

En Scotiabank/Banbif, `Efectivizacion` puede contar operaciones retenidas `Pendiente`, `Rechazado` o `Pagado`, porque retencion y estado comercial son conceptos paralelos.

### Badges por empresa

La fila de empresas muestra distribucion del tab activo.
En rutas con retencion (Scotiabank, Banbif, SafetyPay), los badges de `Efectivizacion` y `Retenidos` agrupan por `id_empresa_salida`, no por `id_empresa_ingreso`.

- Si `Derivados` tiene 3, las empresas pueden mostrar `1` y `2`.
- En `Retenidos`, el conteo corresponde a retenciones abiertas del ciclo actual.
- En historial, `Retenidos` no muestra conteo.

## Efectivizacion

La tabla permite:

- filtrar por codigo y DNI;
- cambiar facturacion;
- cambiar tipo de deposito;
- cambiar comunidad;
- revisar banco/cuenta de ingreso;
- cambiar empresa/cuenta de salida;
- pagar;
- derivar;
- reasignar;
- ejecutar PD directo;
- ejecutar Directo Caja.

Regla para retenciones:

- una operacion `flag_retenido=true` marcada como `Pagado` permanece visible en `Efectivizacion > Todos`;
- tambien aparece en `Efectivizacion > Pagados`;
- sigue apareciendo en `Retenidos` hasta confirmar la retencion;
- confirmar la retencion no cambia `nombre_estado`; solo apaga `flag_retenido`.

## POS y Link Pago asistidos

### POS

En `/operaciones/pos`:

- se registra la solicitud;
- se elige banco/empresa/cuenta destino;
- queda como `ruta_origen = 'pos'`;
- queda con `ruta_destino` igual al banco elegido;
- no se muestra accion `Pagar`;
- no se crea movimiento de caja.

La salida real se atiende desde el tab `POS` del banco destino.

### Link Pago

En `/operaciones/linkpago`:

- se registra la operacion sin banco destino;
- queda como `ruta_origen = 'linkpago'` y `ruta_destino = 'linkpago'`;
- permite cambiar estado desde la bandeja;
- permite editar la operacion via `LinkPagoEditModal` que llama `f_patch_tb_operacion_asistida` (modifica DNI, nombre, comunidad, monto, entidad tarjeta);
- no se crea movimiento de caja.

### KPIs asistidos

Los KPI se consultan con:

- `f_get_tb_operacion_asistida_kpi`

Solo suman operaciones en estado `Pagado`.

Estado actual:

- El dropdown de estado esta oculto temporalmente.
- En fila se usa boton `Pendiente`.
- Click en `Pendiente` cambia a `Pagado` con confirmacion.
- `Pagado` queda como boton deshabilitado.

## Derivados

Representa operaciones derivadas a la ruta actual.

Reglas:

- Siempre atiende salida.
- Permite ajustar empresa/cuenta de salida.
- Puede marcarse como pagado.
- No debe alterar datos de ingreso de la ruta origen.

## Pago Deuda en pantalla bancaria

En la ruta bancaria puede verse el boton `PD` cuando una operacion de efectivizacion coincide con una solicitud de Pago Deuda.

El match automatico usa:

- banco;
- DNI;
- monto;
- `fecha_deposito_cliente::date = fecha_solicitud::date`.

No usa:

- `CURRENT_DATE`;
- fecha de carga del Excel;
- `fecha_registro` del archivo.

## Pago Deuda Directo

En el menu de acciones se muestra como:

- `PD Directo`

Regla:

- Clasifica la operacion como retorno directo.
- No enlaza solicitud.
- Genera ingreso de devolucion.

## Directo Caja

Accion disponible solo en `Efectivizacion`.

Reglas:

- Solo aparece en pendientes.
- Solicita confirmacion.
- Al confirmar marca la operacion como pagada.
- Genera solo ingreso, no salida.
- Debe mantener trazabilidad diferenciada.

## Movimientos

Muestra movimientos confirmados u operativos.

Reglas:

- Oculta ingresos `RETENIDO` por defecto.
- Muestra salidas pagadas.
- Normaliza origen visual.
- Usa filtros por DNI y tipo de origen visible.

## Actualizacion parcial de filas

El frontend evita recargar todo el datatable cuando la RPC devuelve la fila actualizada.

Reglas:

- Acciones por fila reemplazan o remueven solo esa fila.
- Acciones por lote acumulan resultados y aplican una sola actualizacion local.
- KPI y badges se refrescan aparte.
- Skeleton/loading solo aparece en recarga real:
  - cambio de empresa;
  - cambio de tab;
  - cambio de filtro mayor;
  - cambio de fecha historica.

## Framer Motion

Uso esperado:

- transiciones suaves de filas;
- salida de filas cuando dejan el filtro actual;
- highlight temporal de filas actualizadas;
- sin animaciones invasivas en tablas operativas.
