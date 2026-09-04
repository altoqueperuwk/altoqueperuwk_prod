# Mapa Funcional Vigente - Septiembre 2026

> Fuente funcional principal de `backend/documentacion_funcional`. Este mapa
> fue contrastado con `backend/backend_implementacion/`, `src/main.tsx` y
> `src/features/operaciones/`. Si una nota anterior contradice este documento,
> se debe validar primero el SQL y el componente indicado aqui.

## 1. Alcance actual

El producto tiene tres experiencias operativas:

| Experiencia | Rutas | Caja propia | Excel de banco | Cierre |
| --- | --- | ---: | ---: | ---: |
| Efectivizacion bancaria | `/operaciones/bcp`, `/bbva`, `/scotiabank`, `/banbif`, `/interbank`, `/safetypay` | Si | Si | Si |
| Operacion asistida | `/operaciones/pos`, `/operaciones/linkpago` | No | No | No |
| Pago Deuda | `/operaciones/deuda`, `/pago-deuda`, `/pagodeuda` | No propia | No | No propio |

`/operaciones/safetypay` usa `BancariaPage` y puede integrarse visualmente con
la experiencia de Interbank, pero conserva su servicio y filtros propios.
Las rutas de banco comparten componentes, no una misma configuracion de
empresa, cuenta o caja.

Fuera de Operaciones, las rutas funcionales registradas en `src/main.tsx` son
los maestros de `/sistema/estado`, `/rol`, `/sucursal`, `/comunidad`,
`/codigo-servicio`, `/usuario`, `/permiso-menu`, `/permiso-usuario`, `/cliente`,
`/banco`, `/empresa`, `/reglas-efectivizacion`, `/caja-operativa` y cuentas de
empresa; ademas de `/atencion/cliente`, `/seguimientos/operaciones`,
`/seguimientos/pago-deuda` y `/reportes/cierre-caja`. Sus documentos de dominio
siguen siendo validos y este mapa solo los ubica dentro de la arquitectura.

## 2. Mapa de fuentes de verdad

### Backend SQL

| Archivo | Responsabilidad vigente |
| --- | --- |
| `01.core_catalogos_permisos.sql` | estados, roles, usuarios, sucursales, comunidades y permisos |
| `02.core_clientes_servicios_empresas_reglas.sql` | clientes, bancos, empresas, cuentas y reglas de comision |
| `03.operacion_proceso_y_excel.sql` | operaciones, calculos, Excel, derivaciones, retencion, pago, borrado y Directo Caja |
| `04.pago_deuda.sql` | solicitudes, filas BANCO, transferencia, retorno, match, comisiones y borrado |
| `05.ruta_operacion_y_cajas.sql` | rutas, cajas, movimientos, KPI, cierres, reapertura y reportes bancarios |
| `10.retenciones_scotiabank_banbif.sql` | bandejas, badges y consultas auxiliares de retencion |
| `11.operaciones_asistidas_pos_linkpago.sql` | POS, Link Pago y POS sin envio |
| `12.recaudacion_cortes_abonos.sql` | calendario, lotes, compatibilidad de abonos y job nocturno |
| `14.reportes_cierre_caja.sql` | consultas auxiliares de reportes de cierre |

La tabla comercial principal es `tb_operacion_proceso`. La trazabilidad
contable se relaciona con `tb_operacion_caja`, la caja viva
`tb_caja_operativa`, el KPI acumulado `tb_ruta_operacion_kpi` y el snapshot
`tb_caja_operativa_cierre`.

### Frontend

| Archivo o carpeta | Responsabilidad vigente |
| --- | --- |
| `src/main.tsx` | registro de rutas y paginas |
| `.../bancaria/pages/bancaria-page.tsx` | shell bancario, empresas, cuentas, KPI, cierre, configuracion y descarga |
| `.../bancaria/components/bancaria-operational-tabs.tsx` | tabs `Efectivizacion TC`, `Pago Deuda TC` y `Movimientos` |
| `.../bancaria/components/bancaria-efectivizacion-table.tsx` | tabla, acciones por fila, derivados, match y borrado |
| `.../bancaria/hooks/use-bancaria-bandeja.ts` | consultas, filtros, historico y reconciliacion de filas |
| `.../bancaria/hooks/use-bancaria-kpis.ts` | KPI vivo, historico y ganancia especial |
| `.../asistida/pages/asistida-page.tsx` | POS y Link Pago, rango de fecha y reportes |
| `.../asistida/components/asistida-operational-board.tsx` | bandeja asistida, busqueda y estados |
| `.../pago-deuda/pages/pago-deuda-page.tsx` | solicitud global, rango, KPI y descarga |
| `.../pago-deuda/components/pago-deuda-board.tsx` | solicitudes, pasos, match, transferencia y comision |
| `.../shared/services/operaciones-rpc.service.ts` | RPC compartidas de operaciones, cajas, KPI y reportes |
| `.../pago-deuda/services/pago-deuda.service.ts` | RPC especificas de Pago Deuda |

## 3. Efectivizacion bancaria

Una operacion puede nacer por formulario manual, carga de Excel/TXT o por una
solicitud POS derivada al banco. El backend resuelve empresa, cuenta, banco,
regla de comision, importe de transferencia e ITF antes de registrar el
impacto en caja cuando corresponde.

La carga Excel:

- normaliza cabeceras, DNI, importes, fechas y horas del banco;
- detecta duplicados por servicio, codigo, monto y ventana de siete dias;
- evita duplicados incluso si el registro historico fue eliminado;
- registra la carga y sincroniza KPI al finalizar;
- para SafetyPay solo acepta filas cuyo estado sea `Pagado` o `Compra completada`;
- en las demas rutas bancarias la condicion funcional de carga no depende de
  la columna `Estado` del archivo.

Funciones principales: `f_post_tb_operacion_proceso`,
`f_post_tb_operacion_proceso_excel`, `f_post_tb_operacion_proceso_excel_ganancia`
y `f_get_tb_operacion_proceso`.

La pantalla muestra empresas y cuentas asociadas a la ruta. Una empresa normal
requiere cuenta para operar. `Otra Empresa` y `Otra Cuenta` son valores de
referencia para movimientos manuales sin contraparte catalogada; el frontend
los envia como valores nulos de contraparte. La RPC
`f_post_tb_operacion_caja_contraparte` debe soportar ese caso sin intentar leer
un registro de contraparte no asignado. Si reaparece el error de record no
asignado, es un pendiente backend y no una empresa o cuenta que deba crearse.

Si la empresa seleccionada coincide con la empresa de la caja activa, el
frontend selecciona inicialmente la cuenta activa. Al cambiar a otra empresa,
la cuenta vuelve a `Seleccionar` para que el usuario la defina.

La pantalla bancaria tiene:

- `Efectivizacion TC`: unifica efectivizaciones, derivados y POS atendidos;
- `Pago Deuda TC`: muestra las filas BANCO y datos de solicitud, retorno y
  Atencion Cliente;
- `Movimientos`: ingresos, salidas y movimientos manuales.

El selector secundario conserva bandejas como `Eliminados`, `Efectivizacion`,
`POS`, `Derivados` y `Retenidos`. La empresa activa filtra por empresa/cuenta
de salida cuando la operacion fue derivada.

Una operacion derivada conserva una sola fila y guarda ruta origen, ruta
destino, empresa/cuenta de salida origen y empresa/cuenta de salida destino.
En la ruta destino se muestran las acciones de comision especial, comision
extra y transferencia interbancaria. El origen queda visualmente congelado
cuando corresponde.

Las acciones rapidas de Efectivizacion incluyen pago, derivacion, comisiones,
Directo Caja, match Pago Deuda y `Eliminar Operacion`. El borrado solo es
elegible en estado `Pendiente`; se conserva en la bandeja de eliminados y no se
trata como una operacion activa.

Funciones relacionadas: `f_patch_tb_operacion_proceso_derivacion`,
`f_patch_tb_operacion_proceso_pagado`,
`f_patch_tb_operacion_proceso_directo_caja`,
`f_patch_tb_operacion_proceso_reanudar` y las funciones de eliminacion/restauracion.

## 4. Retenciones y ganancias especiales

La retencion automatica vigente se decide por empresa, cuenta, banco y
`fecha_deposito_cliente` convertida a `America/Lima`:

| Ruta | Empresa | Cuenta | Corte |
| --- | --- | ---: | ---: |
| Scotiabank | Capital Nova S.A. | 33 | 21:00 |
| Scotiabank | Academia WK S.A. | 7 | 21:00 |
| BanBif | A Cuenta WK S.A. | 16 | 21:00 |
| BCP | Capital Nova S.A. | 4 | 00:00 |
| BCP | Fluxopay S.A. | 5 | 00:00 |

Las otras combinaciones no se vuelven retenidas por una regla generica
antigua. No existe liberacion automatica de fondos. Los campos de retencion y
fuera de horario se conservan para auditoria.

Para Scotiabank y BanBif, el KPI visual de Ganancias usa
`f_get_tb_ruta_operacion_ganancias_efectivizacion_v2`. Considera
Efectivizacion `Pagado`, modalidades Mismo Dia/Dia Siguiente, fecha de deposito
en Lima y la fecha operativa consultada. Excluye pendientes y no escribe caja,
movimientos ni KPI materializados.

## 5. Pago Deuda

La solicitud global se consulta mediante `f_get_tb_pago_deuda`; la bandeja
bancaria usa `f_get_tb_pago_deuda_bandeja`, que devuelve solo filas `BANCO` y
agrega nombre y sucursal de Atencion Cliente desde la solicitud, datos de
retorno/devolucion, codigo de transferencia y estado de comision.

El flujo es:

```text
SOLICITUD -> BANCO -> transferencia -> RETORNO/match -> comision
```

`RETORNO` y `RETORNO_DIRECTO` representan ingresos de devolucion. La comision
se registra separadamente como `PAGO_DEUDA_COMISION`. El match usa DNI, monto,
banco y la ventana operativa definida por SQL; las funciones lote soportan la
consulta y la visualizacion anticipada del icono.

La columna `Atencion Cliente` se resuelve desde la solicitud mediante
`tb_usuario.id` y `tb_usuario.id_sucursal -> tb_sucursal`. La RPC actual expone
el valor de `tb_usuario.username` en `nombre_atencion_cliente`; el nombre
completo de `tb_usuario.nombre` aun no se expone en ese campo. En el frontend
se presenta como pill. Los registros se filtran por permisos de administrador,
jefe de tienda, sucursal y usuario solicitante.

## 6. POS y Link Pago

POS y Link Pago no tienen caja ni cierre propios. Sus KPI son informativos y se
calculan desde `tb_operacion_proceso`: Comisiones, Gastos, Ganancia y Salidas.

La pantalla usa dos calendarios basicos, Desde y Hasta. Por defecto, Desde es
el dia actual de Lima y Hasta es el ultimo dia del mes actual. Cada calendario
se cierra al seleccionar. Las fechas se envian como limites inclusivos del dia
peruano:

- POS/Link Pago: `p_fecha_registro_desde` y `p_fecha_registro_hasta`;
- Pago Deuda: `p_fecha_desde` y `p_fecha_hasta`.

Si existe una busqueda por codigo, DNI, tarjeta o monto en POS/Link Pago, el
frontend omite el rango de fecha para conservar la busqueda global.

POS normal crea una solicitud con banco/ruta destino y se atiende desde el tab
POS de la ruta bancaria. `Sin Envio Solicitud` crea directamente `PAGADO`, sin
comision, transferencia ni movimiento de caja. Link Pago permanece asistido y
no genera movimiento de caja.

Funciones: `f_get_tb_operacion_asistida_bandeja`,
`f_get_tb_operacion_asistida_kpi`, `f_post_tb_operacion_asistida`,
`f_post_tb_operacion_asistida_pos_sin_envio`,
`f_patch_tb_operacion_asistida` y
`f_patch_tb_operacion_asistida_fecha_deposito`.

## 7. Fechas y reportes

Los reportes de POS, Link Pago y Pago Deuda vuelven a consultar todas las filas
del rango seleccionado antes de generar el archivo; no dependen de la pagina
visible. Excel y PDF muestran una fecha para un solo dia y `Desde ... hasta ...`
para varios dias. El nombre del archivo incorpora una fecha o ambas fechas.

En rutas bancarias, `Descargar > Excel/PDF` usa `f_get_reporte_cierre` y las
fuentes de los tabs. El historico se selecciona por cierre y la seleccion de
fecha persiste al cambiar empresa. Si la empresa no tiene cierre para la fecha,
la pantalla informa esa ausencia sin borrar automaticamente la fecha elegida.

El reporte bancario unifica Efectivizacion y Derivados con columnas de Empresa
y Cuenta, y conserva secciones de Pago Deuda, Movimientos y Retenciones cuando
existen datos.

## 8. Caja, KPI y cierre

Los KPI bancarios vivos usan `f_get_tb_ruta_operacion_kpi_operaciones_v2`.
El historico usa `f_get_tb_ruta_operacion_kpi_cierre_operaciones_v2` con las
atribuciones de ingreso/salida y el cierre identificado. La ganancia especial
de Scotiabank/BanBif se consulta aparte y solo reemplaza visualmente Ganancias.

La caja protege el saldo con locks. Los movimientos de Efectivizacion y Pago
Deuda mantienen trazabilidad en `tb_operacion_caja`. El cierre conserva el
snapshot, deja operaciones abiertas en Hoy y finalizadas en el historico; la
caja viva del siguiente ciclo inicia en cero segun la implementacion vigente.

El boton visual `Cierre` permanece deshabilitado porque el cierre se ejecuta
automaticamente a las 22:30, hora de Peru. El tooltip informa este mecanismo.
El job `cerrar-cajas-operativas-2230-lima` se programa como `30 3 * * *` UTC y
ejecuta `f_job_cerrar_cajas_operativas_2230` de forma idempotente.

## 9. Seguridad y validacion

- Las RPC publicas consumidas por Supabase usan `SECURITY DEFINER`.
- Los permisos se validan en backend; el frontend controla la experiencia.
- `id_estado = 10` representa eliminado, salvo la bandeja explicita.
- Las fechas operativas usan `America/Lima`, no la zona del navegador.
- Los scripts SQL historicos de backfill, sincronizacion y rollback fueron
  retirados del directorio activo; los cambios nuevos deben aplicarse sobre
  los archivos SQL fuente del dominio correspondiente.

Validacion minima para cambios de codigo:

```bash
npm exec tsc -- --noEmit
npm run build
git diff --check
```

Casos minimos: rutas bancarias y SafetyPay, cambio de empresa/cuenta,
derivacion origen/destino, eliminacion solo pendiente, retencion, Ganancias
Scotiabank/BanBif, POS sin envio, rangos alrededor de medianoche, Pago Deuda
sin arrastre fuera de rango, reportes completos y cierre historico.

## 10. Pendientes identificados

- `f_get_tb_pago_deuda_bandeja` actualmente devuelve `username` bajo
  `nombre_atencion_cliente`; si el requerimiento funcional exige el nombre
  completo, debe cambiarse el campo SQL y validarse el frontend.
- El caso `Otra Empresa`/`Otra Cuenta` requiere que
  `f_post_tb_operacion_caja_contraparte` inicialice correctamente su record
  cuando no existe contraparte catalogada.
- La cobertura funcional esta documentada; aun debe complementarse con pruebas
  automatizadas de navegador y una validacion de datos contra un ambiente real.
