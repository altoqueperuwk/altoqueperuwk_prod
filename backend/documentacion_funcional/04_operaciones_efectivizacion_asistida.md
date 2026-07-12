# 04. Operaciones: Efectivizacion Asistida

## Alcance

`efectivizacion-asistida` cubre rutas que viven dentro de `operaciones`, pero que no son cajas bancarias completas ni tienen Excel. Generan atencion operativa y pueden impactar una caja configurable.

## Rutas incluidas

- `link pago`
- `pos`

## Regla funcional central

Estas rutas:

- no aperturan caja inicial propia;
- no cierran caja inicial propia;
- no tienen carga Excel;
- generan solicitud de atencion;
- pueden golpear una caja real configurable cuando corresponde.

## Interpretacion operativa

### `POS`

- la solicitud nace por uso de tarjeta;
- la atencion de salida al cliente se resuelve desde el flujo operativo bancario;
- el ingreso o ganancia resultante puede impactar una caja real configurable.

### `Link Pago`

- la solicitud nace por un flujo de recaudacion o tercerizacion;
- no se comporta como caja autonoma;
- la ganancia puede impactar una caja real configurable.

## Diferencia frente a efectivizacion bancaria

No debe confundirse con `efectivizacion-bancaria` porque aqui no existen por defecto:

- apertura de caja propia;
- cierre de caja propia;
- Excel por ruta;
- stack completo de caja operacional.

## Contrato esperado

La documentacion debe dejar claro que:

- estas rutas siguen siendo `operaciones`;
- tienen UI propia;
- pero no se construyen como un clon de los bancos tradicionales.

## Estructura frontend sugerida

- `features/operaciones/efectivizacion-asistida/pages/`
- `features/operaciones/efectivizacion-asistida/components/`
- `features/operaciones/efectivizacion-asistida/hooks/`
- `features/operaciones/efectivizacion-asistida/services/`
- `features/operaciones/efectivizacion-asistida/schemas/`

## Regla para otra IA

Si una ruta:

- no tiene caja propia,
- no tiene Excel,
- pero genera solicitud o ganancia que luego impacta una caja configurable,

entonces pertenece a `efectivizacion-asistida`.
