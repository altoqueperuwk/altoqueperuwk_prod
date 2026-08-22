# 03. Operaciones: Efectivizacion Bancaria

> **Estado vigente 22/08/2026:** Las seis rutas bancarias comparten el flujo de
> caja, pero SafetyPay puede integrarse visualmente dentro de Interbank. La tabla
> principal es `Efectivizacion TC`, que unifica Efectivizacion, Derivados y POS y
> diferencia cada fila mediante `Flujo`.

## Alcance

`efectivizacion-bancaria` es la familia con logica operativa completa. Aqui viven las rutas que si tienen caja inicial propia, flujo de caja completo y carga Excel.

## Rutas incluidas

- `bcp`
- `bbva`
- `scotiabank`
- `interbank`
- `banbif`
- `safetypay`

## Capacidades aprobadas

Estas rutas comparten:

- apertura de caja inicial;
- cierre de caja inicial;
- visualizacion de KPIs y cards de caja;
- efectivizacion completa;
- carga Excel;
- registro manual;
- seleccion y gestion de empresas y cuentas;
- reglas de efectivizacion;
- movimientos entre cajas;
- impacto completo en caja.

## Caja y flujo financiero

Estas rutas si son cajas operativas reales. Por eso:

- tienen saldos;
- tienen ingresos, gastos, ganancia, salida y operaciones;
- afectan dashboard futuro;
- afectan reportes futuros;
- y generan seguimiento operativo real.

## UX esperada

Cada ruta bancaria debe exponer:

- cards de caja inicial;
- filtros y datatable operativo;
- acciones de registro manual;
- procesamiento Excel;
- acceso rapido a empresas, cuentas y reglas;
- movimientos entre cajas.

## Dependencias backend

Esta familia depende especialmente de:

- `tb_operacion_proceso`
- `tb_reglas_efectivizacion`
- tablas de empresa y cuenta bancaria
- configuracion de rutas operativas
- estructuras de caja inicial y operacion caja

## Estructura frontend sugerida

Esta familia debe implementarse dentro de:

- `features/operaciones/efectivizacion/`

Con desglose interno sugerido:

- `features/operaciones/efectivizacion/bancaria/pages/`
- `features/operaciones/efectivizacion/bancaria/components/`
- `features/operaciones/efectivizacion/bancaria/hooks/`
- `features/operaciones/efectivizacion/bancaria/services/`
- `features/operaciones/efectivizacion/bancaria/schemas/`

## Regla para otra IA

Si una ruta tiene:

- caja inicial propia,
- cierre,
- Excel,
- y flujo financiero completo,

entonces pertenece a `efectivizacion-bancaria`.
