# 05. Operaciones: Pago Deuda

## Alcance

`pago-deuda` es una familia propia dentro de `operaciones`. No debe documentarse como una simple variante de `efectivizacion-bancaria`, porque su naturaleza es de solicitud y atencion, no de caja bancaria completa.

## Ruta incluida

- `pago deuda`

## Reglas funcionales aprobadas

Esta familia:

- no tiene caja inicial propia;
- no tiene flujo completo de caja como un banco tradicional;
- genera solicitud de atencion;
- la atencion operativa real la resuelve el area bancaria correspondiente;
- al final puede registrar la comision en una empresa/cuenta con caja real configurable.

## Logica operativa

El usuario solicitante:

- registra la solicitud;
- deja trazabilidad de la operacion;
- no ejecuta la caja completa desde este mismo modulo.

El usuario que atiende:

- resuelve la salida de dinero o la devolucion;
- lo hace desde su flujo operativo real;
- y luego puede usar una caja real para registrar el ingreso de comision cuando corresponda.

## Diferencia frente a efectivizacion asistida

`pago-deuda` se parece en que no tiene caja propia, pero sigue siendo otra familia porque:

- su semantica de negocio es solicitud de deuda;
- su atencion final responde a una casuistica propia;
- y su UI no debe mezclarse con `link pago` o `pos`.

## Estructura frontend sugerida

- `features/operaciones/pago-deuda/pages/`
- `features/operaciones/pago-deuda/components/`
- `features/operaciones/pago-deuda/hooks/`
- `features/operaciones/pago-deuda/services/`
- `features/operaciones/pago-deuda/schemas/`

## Regla para otra IA

Si la ruta:

- no tiene caja propia,
- representa una solicitud de deuda,
- y usa una caja real solo para impacto final configurable,

entonces pertenece a `pago-deuda`.
