# 02. Operaciones: Vision General

## Objetivo del dominio

`operaciones` concentra los flujos transaccionales del negocio. En el sistema compacto nuevo no debe documentarse como un modulo unico y monolitico, sino como 3 familias hermanas con responsabilidades distintas.

## Familias oficiales de operaciones

La division aprobada es:

1. `efectivizacion-bancaria`
2. `efectivizacion-asistida`
3. `pago-deuda`

## Regla conceptual clave

No todas las rutas de `operaciones` tienen el mismo comportamiento:

- algunas tienen caja inicial propia, apertura/cierre, Excel y flujo completo;
- otras solo generan solicitud o ganancia;
- otras no tienen caja propia, pero si impactan una caja real configurable.

Por eso no se debe volver a agrupar todo bajo un solo `features/operaciones/` sin separacion clara.

## Rutas por familia

### `efectivizacion-bancaria`

- `bcp`
- `bbva`
- `scotiabank`
- `interbank`
- `banbif`
- `safetypay`

### `efectivizacion-asistida`

- `link pago`
- `pos`

### `pago-deuda`

- `pago deuda`

## Estructura frontend objetivo

El frontend nuevo debe nacer ya dividido por responsabilidad:

- `features/operaciones/efectivizacion-bancaria/`
- `features/operaciones/efectivizacion-asistida/`
- `features/operaciones/pago-deuda/`

Y ademas apoyarse en carpetas transversales:

- `ui/`
- `hooks/`
- `services/`
- `schemas/`
- `utils/`

## Relacion con otros dominios

- `sistema` alimenta catalogos, empresas, cuentas y reglas;
- `operaciones` usa esas estructuras para ejecutar transacciones;
- `seguimientos` observara el estado operativo;
- `dashboard` observara el impacto real sobre cajas;
- `reportes` consolidara resultados.

## Resultado esperado para otra IA

Otra IA debe salir de este documento entendiendo que:

- `operaciones` tiene 3 familias reales;
- cada familia requiere paginas, servicios y contratos propios;
- y volver a meter todo en una sola capa seria un error de arquitectura.
