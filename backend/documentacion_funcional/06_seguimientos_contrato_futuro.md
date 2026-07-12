# 06. Seguimientos: Contrato Futuro

## Objetivo futuro

`seguimientos` sera el dominio de visibilidad operativa transversal. No es un CRUD core ni una caja en si misma; es una capa de observacion del estado de las transacciones.

## Casos que debe cubrir

Debe contemplar visualizaciones futuras de:

- operaciones pendientes;
- operaciones atendidas;
- operaciones pagadas;
- tiempos operativos;
- reasignaciones;
- colas o bandejas por responsable cuando aplique.

## Dependencia de negocio

`seguimientos` depende de lo que ocurra en:

- `efectivizacion-bancaria`
- `efectivizacion-asistida`
- `pago-deuda`

Por eso no debe inventar logica propia paralela; debe observar y presentar estados reales del backend.

## Estructura frontend sugerida

- `features/seguimientos/pages/`
- `features/seguimientos/components/`
- `features/seguimientos/hooks/`
- `features/seguimientos/services/`
- `features/seguimientos/schemas/`

## Regla documental

Desde ahora debe quedar claro para otra IA que:

- `seguimientos` existe como dominio futuro;
- no debe quedar enterrado dentro de `operaciones`;
- y su fuente de verdad seguira siendo el backend transaccional.
