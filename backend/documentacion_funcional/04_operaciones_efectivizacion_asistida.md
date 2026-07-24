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
- el usuario selecciona banco/empresa/cuenta destino al registrar la solicitud;
- la solicitud queda con `ruta_origen = 'pos'` y `ruta_destino` del banco elegido;
- la atencion de salida al cliente se resuelve desde el tab `POS` del banco destino;
- la pantalla `/operaciones/pos` no tiene accion `Pagar` ni golpea caja.

### `Link Pago`

- la solicitud nace por un flujo de recaudacion o tercerizacion;
- no requiere banco destino;
- queda con `ruta_origen = 'linkpago'` y `ruta_destino = 'linkpago'`;
- permite cambio de estado operativo;
- no crea movimientos de caja ni depende de cierre.

## KPIs asistidos

Las rutas asistidas muestran KPIs informativos por fecha de registro:

- `Gastos`
- `Ganancia`
- `Salidas`

Reglas:

- se calculan desde `tb_operacion_proceso`;
- solo suman operaciones en estado `Pagado`;
- no consultan `tb_caja_operativa`, `tb_operacion_caja` ni cierres.

La fecha superior de la pantalla representa historial operativo del dia seleccionado, no cierre de caja.

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

## Estructura frontend sugerida

Esta familia no debe vivir como un tercer modulo raiz. Debe implementarse dentro de:

- `features/operaciones/efectivizacion/`

Con desglose interno sugerido:

- `features/operaciones/efectivizacion/asistida/pages/`
- `features/operaciones/efectivizacion/asistida/components/`
- `features/operaciones/efectivizacion/asistida/hooks/`
- `features/operaciones/efectivizacion/asistida/services/`
- `features/operaciones/efectivizacion/asistida/schemas/`

## Regla para otra IA

Si una ruta:

- no tiene caja propia,
- no tiene Excel,
- pero genera registro o solicitud operativa por fecha de registro,

entonces pertenece a `efectivizacion-asistida`.
