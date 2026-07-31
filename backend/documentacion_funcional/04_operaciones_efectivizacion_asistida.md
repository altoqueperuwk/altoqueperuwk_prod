# 04. Operaciones: Efectivizacion Asistida

## Alcance

`efectivizacion-asistida` cubre rutas que viven dentro de `operaciones`, pero que no son cajas bancarias completas. No tienen caja operativa propia, no hacen cierre de caja y se consultan por fecha de registro de la operacion.

## Rutas incluidas

- `link pago`
- `pos`

## Regla funcional central

Estas rutas:

- no aperturan caja inicial propia;
- no cierran caja inicial propia;
- no tienen carga Excel;
- generan registros o solicitudes operativas;
- usan KPIs informativos desde `tb_operacion_proceso`;
- no crean movimientos de caja desde su pantalla propia.

## Interpretacion operativa

### `POS`

- la solicitud nace por uso de tarjeta;
- el formulario de registro contiene: `Entidad Tarjeta | DNI | Nombre | Comunidad | Banco Transferir | Monto`;
- `Entidad Tarjeta` lista bancos con `tipo = 'Tarjeta Comercial'` (trazabilidad del banco del cliente en `id_banco_cliente` / `nombre_banco_cliente`);
- `Banco Transferir` lista bancos con `tipo = 'Tarjeta Crédito'` y resuelve automaticamente la empresa/cuenta de salida desde `tb_ruta_operacion_caja` con `flag_caja_ingreso_principal = true`;
- al ingresar DNI se busca automaticamente el cliente en `tb_cliente` y se populan `Nombre` (bloqueado si existe) y `Comunidad`;
- el campo `Celulares` es multi-valor (chip input) y se guarda en `tb_cliente.celular` como `jsonb`;
- la solicitud queda con `ruta_origen = 'pos'` y `ruta_destino` del banco elegido;
- la atencion de salida al cliente se resuelve desde el tab `POS` del banco destino;
- la pantalla `/operaciones/pos` no tiene accion `Pagar` ni golpea caja;
- la botonera del formulario es `Guardar` (izquierda, primary) y `Cancelar` (derecha, secondary); ambos ocupan ancho completo y `Cancelar` limpia todos los campos incluyendo el cliente encontrado.

### `Link Pago`

- la solicitud nace por un flujo de recaudacion o tercerizacion;
- no requiere banco destino;
- queda con `ruta_origen = 'linkpago'` y `ruta_destino = 'linkpago'`;
- permite cambio de estado operativo;
- permite edicion de campos (DNI, nombre, comunidad, monto, entidad tarjeta) via modal con `f_patch_tb_operacion_asistida`;
- no crea movimientos de caja ni depende de cierre.

## KPIs asistidos

Las rutas asistidas muestran KPIs informativos por fecha de registro:

- `Comisiones` (lo cobrado al cliente por la empresa)
- `Gastos` (comisiones de banco ingreso + banco salida)
- `Ganancia` (comisiones - gastos)
- `Salidas`

Reglas:

- se calculan desde `tb_operacion_proceso`;
- solo suman operaciones en estado `Pagado`;
- no consultan `tb_caja_operativa`, `tb_operacion_caja` ni cierres.

La fecha se selecciona mediante un dropdown con calendario en el header de la pantalla (al lado del boton Configuracion). Representa historial operativo del dia seleccionado, no cierre de caja.

## Diferencia frente a efectivizacion bancaria

No debe confundirse con `efectivizacion-bancaria` porque aqui no existen por defecto:

- apertura de caja propia;
- cierre de caja propia;
- Excel por ruta;
- stack completo de caja operacional.

Tambien se diferencia de una bandeja bancaria porque:

- POS se atiende financieramente en el banco destino;
- Link Pago solo registra y cambia estado en su propia vista;
- ninguna de las dos rutas debe modificar saldo disponible por si misma.

## Contrato esperado

La documentacion debe dejar claro que:

- estas rutas siguen siendo `operaciones`;
- tienen UI propia;
- pero no se construyen como un clon de los bancos tradicionales.
- usan las RPC asistidas de `11.operaciones_asistidas_pos_linkpago.sql`.

## Estructura frontend

La pagina `/operaciones/pos` y `/operaciones/linkpago` comparten el mismo layout:

- **Header**: titulo de ruta + dropdown de fecha con calendario (popup) + boton `Configuracion`
- **KPIs**: 4 cards en grid `2x2` / `sm:4` usando `RouteKpiCard` (mismo componente que bancaria)
- **Formulario inline**: `AsistidaSolicitudForm` en card compacto
- **Bandeja operativa**: `AsistidaOperationalBoard` con datatable

### Columnas datatable POS

| Columna | Campo | Notas |
|---------|-------|-------|
| Entidad Tarjeta | `nombre_banco_cliente` | `CompactBadge` |
| DNI | `dni_cliente` | |
| Comunidad | `nombre_comunidad` | |
| Monto | `monto_deposito_cliente` | |
| Comision | `resultado_comision_servicio` | badge con % |
| Empresa Cuenta | `nombre_empresa_salida` + `nombre_banco_empresa_cuenta_salida` | dos `CompactBadgeLine` (brand + gray) |
| Transferencia | `monto_transferencia_cliente` | |
| Estado | `nombre_estado` | badge Pagado/Pendiente |
| Hora | `fecha_registro` | hora + fecha |

La columna `Codigo Operacion` esta oculta en POS.

### Columnas datatable Link Pago

La bandeja de Link Pago usa las mismas columnas que POS pero con toolbar inline que reemplaza los botones de accion: boton `Editar` (icono `Edit03`) abre `LinkPagoEditModal` para modificar DNI, nombre, comunidad, monto o entidad tarjeta; boton `Pendiente`/`Pagado` cambia estado.

### Componente `LinkPagoEditModal`

`components/linkpago-edit-modal.tsx`: modal de edicion con campos `Entidad Tarjeta | DNI | Nombre | Comunidad | Monto`. Al guardar llama `f_patch_tb_operacion_asistida` con los campos modificados. La entidad tarjeta solo se muestra en operaciones POS (con `id_banco_cliente`).

### Hook de busqueda de cliente

`useClienteLookup(dni)` en `features/operaciones/efectivizacion/asistida/hooks/`:

- debounce 500ms sobre el DNI;
- llama `clienteService.getList({ p_numero_documento, p_id_estado: 1 })`;
- retorna `{ id, nombre, celular: string[], id_comunidad }` o `null`;
- el formulario usa el resultado para auto-popular Nombre (bloqueado), Celulares y Comunidad;
- si el cliente no existe, Nombre queda editable para registro manual.

### Componente `CelularInput`

`components/base/input/celular-input.tsx`:

- chip/tag input multi-valor;
- props: `value: string[]`, `onChange`, `placeholder`, `isDisabled`;
- solo digitos (max 9), deduplicacion, Enter para agregar.

## Regla para otra IA

Si una ruta:

- no tiene caja propia,
- no tiene Excel,
- pero genera registro o solicitud operativa por fecha de registro,

entonces pertenece a `efectivizacion-asistida`.
