# 07. Dashboard: Contrato Futuro

## Objetivo futuro

`dashboard` sera la vista del estado real de las cajas iniciales y de los impactos financieros ya materializados.

## Definicion correcta del dominio

`dashboard` no debe interpretarse como la pantalla de todas las rutas del sistema. Su foco real es:

- cajas iniciales reales;
- saldos;
- KPIs;
- cierres;
- consolidado por empresa;
- consolidado por cuenta;
- impactos ya registrados.

## Lo que si debe mostrar

- saldo inicial;
- saldo total;
- ingresos;
- gastos;
- ganancia;
- salida;
- operaciones;
- cortes o cierres por fecha cuando aplique;
- consolidado por empresa y por caja.

## Lo que no debe representar como eje principal

No debe modelarse como tablero principal de rutas de solicitud pura como:

- `link pago`
- `pos`
- `pago deuda`

salvo cuando esas rutas ya impactaron una caja real y ese impacto financiero forma parte del consolidado.

## Estructura frontend sugerida

- `features/dashboard/pages/`
- `features/dashboard/components/`
- `features/dashboard/hooks/`
- `features/dashboard/services/`
- `features/dashboard/schemas/`

## Regla para otra IA

Si la pregunta es sobre saldos reales, KPIs, cierres o consolidado por caja/empresa, entonces pertenece a `dashboard`, no a `operaciones` como dominio documental.
