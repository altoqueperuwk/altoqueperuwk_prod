# 28. Operaciones: Flujo de Negocio Actual

## Objetivo

Este documento resume el flujo vigente de negocio de `Operaciones` despues de los ajustes de efectivizacion, pago deuda, retenciones, caja y cierre. Es la referencia funcional actual para entender que debe pasar en la tienda y como debe reflejarse en base de datos.

## Familias operativas

### Efectivizacion bancaria

Rutas:

- `/operaciones/bcp`
- `/operaciones/bbva`
- `/operaciones/scotiabank`
- `/operaciones/banbif`
- `/operaciones/interbank`
- `/operaciones/safetypay`

Estas rutas trabajan con empresas, cuentas bancarias, cajas operativas, Excel/TXT bancario y cierre de caja.

### Pago Deuda

Ruta:

- `/operaciones/pagodeuda`

Pago Deuda no es una caja propia. Es una solicitud que genera atencion bancaria y luego puede registrar una comision separada.

### POS y asistidas

POS y Link Pago son rutas asistidas sin caja propia.

Reglas:

- no tienen cierre de caja;
- no tienen caja inicial ni caja actual;
- se consultan por `fecha_registro`;
- sus KPI se calculan desde `tb_operacion_proceso`;
- solo suman operaciones en estado `Pagado`.

POS tiene dos momentos:

1. En `/operaciones/pos`, el usuario registra la solicitud y selecciona banco/empresa/cuenta destino.
2. En el banco destino, el tab `POS` atiende la transferencia y recien ahi se impacta caja.

Link Pago:

- registra la operacion en `/operaciones/linkpago`;
- permite cambio de estado operativo;
- no envia solicitud bancaria;
- no crea movimientos de caja.

## Flujo base de Efectivizacion

1. El usuario carga archivo bancario o registra una operacion manual.
2. La operacion entra a `tb_operacion_proceso` como `Efectivizacion`.
3. La operacion aparece en el tab `Efectivizacion` como `Pendiente`.
4. La caja crea o sincroniza el movimiento financiero que corresponda.
5. Si el usuario marca la operacion como pagada:
   - la operacion cambia a `Pagado`;
   - se genera o sincroniza una `SALIDA`;
   - la salida golpea caja y KPI;
   - la fila puede quedar cerrada cuando se hace cierre de caja.

## Tipo de deposito: mismo dia y dia siguiente

La columna `Cod. Op.` permite seleccionar `Mismo Dia` o `Dia Siguiente` cuando el banco lo requiere.

Reglas actuales:

- BCP, BBVA, Interbank y SafetyPay trabajan solo mismo dia para negocio operativo y no necesitan badge visible.
- Scotiabank y Banbif trabajan con mismo dia y dia siguiente.
- Banbif se comporta igual que Scotiabank para este criterio.
- Cambiar el tipo de deposito recalcula reglas, comisiones, transferencia, KPI y movimiento asociado.

## Retenciones

Scotiabank y Banbif retienen ingresos por cuenta bancaria.

La fuente de verdad es:

- `tb_empresa_cuenta_bancaria.flag_retencion`

Comportamiento:

- Al cargar Excel/TXT en una cuenta con `flag_retencion = true`, la operacion queda con `flag_retenido = true`.
- La operacion sigue apareciendo en `Efectivizacion` mientras sea parte del flujo operativo.
- Si la operacion retenida se marca como `Pagado`, no desaparece de `Efectivizacion > Todos` y tambien aparece en `Efectivizacion > Pagados`.
- Tambien aparece en `Retenidos` hasta que se confirme manualmente.
- El ingreso retenido no aumenta `ingresos`, `total_recaudado` ni `caja_actual`.
- El monto retenido se muestra separado en `Ingresos Retenidos`.
- Los movimientos retenidos no aparecen por defecto en `Movimientos`.
- El cierre de caja excluye el ingreso retenido pendiente.
- Confirmar una retencion mueve el ingreso retenido a ingreso confirmado y recien suma a caja.
- Confirmar una retencion solo apaga `flag_retenido`; no cambia el estado comercial de la operacion.
- Las consultas operativas de Scotiabank/Banbif usan funciones separadas en `10.retenciones_scotiabank_banbif.sql`.

### Trabajo real con retenciones

Ejemplo de operacion diaria:

1. En la manana, atencion informa operaciones hechas desde ayer despues del cierre.
2. El usuario descarga y carga el archivo de Scotiabank o Banbif.
3. Las operaciones aparecen en `Efectivizacion` como pendientes.
4. Los ingresos quedan retenidos en caja.
5. El usuario atiende pagos, derivados, pago deuda y salidas.
6. En `Retenidos`, el usuario confirma manualmente solo los ingresos que ya fueron liberados por el banco.
7. El cierre de caja congela movimientos confirmados, pero deja retenidos abiertos para el dia siguiente.

## Pago Deuda

Pago Deuda tiene cuatro momentos funcionales:

1. Solicitud.
2. Transferencia al cliente.
3. Retorno/devolucion.
4. Comision separada.

### Solicitud

Atencion registra la solicitud en `/operaciones/pagodeuda`.

La solicitud raiz se crea con flujo:

- `tipo_flujo_pago_deuda = SOLICITUD`

Tambien se crea o ubica la operacion bancaria hija:

- `tipo_flujo_pago_deuda = BANCO`

### Transferencia

La accion `Transferencia` confirma la salida al cliente y pasa la operacion bancaria a `Procesado`.

### Retorno

El retorno puede ser:

- `RETORNO`: enlazado a una solicitud por match.
- `RETORNO_DIRECTO`: clasificado como Pago Deuda directo sin solicitud.

El retorno genera solo `INGRESO`. No genera salida ni ganancia normal de efectivizacion.

Si la cuenta de ingreso retiene, el ingreso de retorno tambien queda retenido.

### Comision separada

La comision de Pago Deuda no se registra automaticamente con el match.

Se registra por accion separada:

- `PAGO_DEUDA_COMISION`

La empresa/cuenta de comision se guarda en la solicitud usando campos de ingreso:

- `id_empresa_ingreso`
- `nombre_empresa_ingreso`
- `id_empresa_cuenta_ingreso`
- `id_banco_empresa_cuenta_ingreso`
- `nombre_banco_empresa_cuenta_ingreso`

## Directo Caja

`Directo Caja` aplica en Efectivizacion cuando el ingreso debe tratarse como caja directa.

Reglas:

- Marca la operacion como `Pagado`.
- Clasifica el flujo como `DIRECTO_CAJA`.
- Genera solo movimiento `INGRESO`.
- El origen visible debe ser `OTROS` para trazabilidad cuando corresponde al modal/accion de ingreso-salida.
- No genera salida ni ganancia normal de efectivizacion.
- Mantiene como gasto operacional la comision bancaria de ingreso.

## Movimientos y origen visible

La columna `Origen` de Movimientos normaliza etiquetas tecnicas:

- `EXCEL`, `OPERACION_PROCESO`, `EXCEL_GANANCIA`, `MANUAL` -> `EFECTIVIZACION`
- `PAGO_DEUDA` -> `PAGO DEUDA DEPOSITO`
- `PAGO_DEUDA_RETORNO`, `PAGO_DEUDA_DIRECTO` -> `PAGO DEUDA DEVOLUCION`
- `PAGO_DEUDA_COMISION` -> `PAGO DEUDA COMISION`
- `OTROS` -> `OTROS`
- `TRANSFERENCIA_INTERNA` -> `TRANSFERENCIA INTERNA`

Los ingresos retenidos pendientes no se muestran como ingresos normales en `Movimientos`.

## Cierre de caja

El cierre de caja congela:

- salidas confirmadas;
- ingresos confirmados;
- gastos confirmados;
- ganancias confirmadas;
- operaciones pagadas cerrables.

El cierre no debe congelar el ingreso retenido pendiente.

Si una operacion esta pagada y retenida:

- su `SALIDA` puede quedar cerrada;
- su `INGRESO RETENIDO` queda abierto;
- la operacion puede seguir apareciendo en `Retenidos` hasta confirmacion.

## KPI vigente

Los KPI deben separar dinero confirmado de dinero retenido:

- `Ingresos`: solo ingresos confirmados.
- `Total Recaudado`: solo dinero confirmado.
- `Caja Actual`: saldo disponible real.
- `Salidas`: salidas confirmadas.
- `Gastos Operacionales`: gastos confirmados.
- `Ingresos Retenidos`: monto retenido abierto.

`Ingresos Retenidos` puede venir de dias anteriores y seguir visible hoy, porque es dinero pendiente de liberar.

## Descarga de reportes de cierre

El boton "Descargar" en la barra superior de cada ruta bancaria permite exportar los datos del periodo actual o de un cierre historico en PDF o Excel.

La descarga refleja exactamente lo que se visualiza en los tabs de la web, usando las mismas fuentes de datos:

- **Efectivizaciones Pagadas**: `tb_operacion_proceso` con `tipo_servicio = 'EFECTIVIZACION'` y `nombre_estado = 'PAGADO'`.
- **Pago Deuda**: `tb_operacion_proceso` con `tipo_servicio = 'PAGO DEUDA'`.
- **Movimientos OTRO**: `tb_operacion_caja` con `tipo_origen NOT IN ('EFECTIVIZACION', 'PAGO_DEUDA*')`.
- **Retenciones**: `tb_operacion_proceso` con `flag_retenido = true`.
- **KPI**: `tb_caja_operativa_cierre` (historico) o `tb_ruta_operacion_kpi` (hoy).

### Modo Hoy vs Historico

| Aspecto | Hoy (sin cierre) | Historico (con cierre) |
|---------|-----------------|----------------------|
| KPI | `tb_ruta_operacion_kpi` | `tb_caja_operativa_cierre` |
| Operaciones | `id_caja_cierre IS NULL` | `id_caja_cierre` del cierre seleccionado |
| Movimientos | `id_caja_cierre IS NULL` | `id_caja_cierre` del cierre seleccionado |

Ver `32_operaciones_descarga_reportes.md` para el detalle completo de la implementacion.
