# 02. Operaciones: Vision General

> **Estado vigente 04/09/2026:** Para el mapa completo consultar primero
> [`36_mapa_funcional_vigente_2026-09.md`](36_mapa_funcional_vigente_2026-09.md),
> y luego
> [`backend/CONTEXTO_GENERAL_BACKEND.md`](../CONTEXTO_GENERAL_BACKEND.md) y
> [`src/CONTEXTO_GENERAL_FRONTEND.md`](../../src/CONTEXTO_GENERAL_FRONTEND.md).
> Este documento conserva la separacion conceptual de familias, pero la pantalla
> bancaria actual usa las vistas `Efectivizacion TC`, `Pago Deuda TC` y `Movimientos`.

## Objetivo del dominio

`operaciones` concentra los flujos transaccionales del negocio. En el sistema compacto nuevo no debe documentarse como un modulo unico y monolitico, sino como 3 familias de negocio con responsabilidades distintas.

## Familias oficiales de operaciones

La division aprobada es:

1. `efectivizacion-bancaria`
2. `efectivizacion-asistida`
3. `pago-deuda`

## Regla conceptual clave

No todas las rutas de `operaciones` tienen el mismo comportamiento:

- algunas tienen caja inicial propia, apertura/cierre, Excel y flujo completo;
- otras registran operaciones o solicitudes sin caja propia;
- otras dependen de una ruta bancaria destino para materializar el impacto financiero.

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

Regla actual:

- `/operaciones/pos` y `/operaciones/linkpago` no tienen caja operativa ni cierre;
- consultan historial por `fecha_registro`;
- sus KPIs son informativos y salen desde `tb_operacion_proceso`;
- POS envia solicitudes al banco destino y se atiende en el tab `POS` de ese banco;
- Link Pago cambia estado sin crear movimientos de caja.

### `pago-deuda`

- `pago deuda`

## Estructura frontend objetivo

El frontend nuevo debe nacer dividido en 2 modulos raiz:

- `features/operaciones/efectivizacion/`
- `features/operaciones/pago-deuda/`

Y dentro de `features/operaciones/efectivizacion/` se deben separar internamente las 2 variantes reales:

- `bancaria/`
- `asistida/`
- `shared/`

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

- `operaciones` tiene 3 familias reales de negocio;
- el frontend solo tiene 2 modulos raiz: `efectivizacion` y `pago-deuda`;
- `efectivizacion-asistida` no es una tercera raiz tecnica, sino una variante interna de `efectivizacion`;
- y volver a meter todo en una sola capa seria un error de arquitectura.
