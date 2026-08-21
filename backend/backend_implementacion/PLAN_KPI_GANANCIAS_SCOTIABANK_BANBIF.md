# Plan: KPI De Ganancias Para Scotiabank Y BanBif

## Estado

Documento de análisis para retomar posteriormente. En esta fase no se modifican funciones SQL, tablas ni componentes frontend.

## Objetivo

Ajustar únicamente el KPI **Ganancias** de las rutas Scotiabank y BanBif para que refleje las ganancias de operaciones de **Efectivización** según:

- estado `PAGADO`;
- modalidad `Mismo Día` o `Día Siguiente`;
- `fecha_deposito_cliente` en hora de Lima;
- fecha operativa que se está consultando.

Los demás KPI, reglas de retención, caja, movimientos, cierres, pagos y otras rutas deben conservar su comportamiento actual.

## Flujo Actual

### 1. Creación De La Operación

Las operaciones manuales y de Excel se crean principalmente desde:

- `03.operacion_proceso_y_excel.sql`
  - `f_post_tb_operacion_proceso`
  - `f_post_tb_operacion_proceso_excel`
  - `f_post_tb_operacion_proceso_excel_ganancia`

Estas funciones guardan la fecha del depósito y la modalidad de depósito en `tb_operacion_proceso`.

### 2. Registro Del Movimiento Y Caja

Cuando la operación se procesa, intervienen principalmente:

- `f_post_tb_operacion_caja_desde_proceso`
- `f_post_tb_operacion_caja`
- `f_apply_tb_operacion_caja_delta`

La ganancia se calcula y guarda en los movimientos de caja y en los acumulados de la caja operativa.

### 3. KPI De La Caja Abierta

`f_get_tb_ruta_operacion_kpi` devuelve el KPI de la ruta. Para Scotiabank y BanBif actualmente incorpora una consulta especial de ganancias por modalidad.

La función `f_sync_tb_ruta_operacion_kpi_caja` también contiene una lógica especial para recalcular y materializar los acumulados de la ruta.

### 4. KPI Del Cierre Histórico

El cierre utiliza principalmente:

- `f_post_tb_caja_operativa_cierre`
- `f_get_tb_caja_operativa_cierre`

El histórico devuelve el valor de `ganancia` guardado en el cierre. En frontend, `use-bancaria-kpis.ts` suma los valores de los cierres seleccionados mediante `buildHistoryKpi`.

Por eso, actualmente la caja abierta y el histórico no necesariamente calculan la ganancia desde el mismo conjunto de operaciones.

## Fórmula Actual

La ganancia por operación se obtiene conceptualmente como:

```text
Ganancia = monto_deposito_cliente
         - monto_transferencia_cliente
         - resultado_comision_banco_ingreso
         - resultado_comision_banco_salida
```

Cuando la transferencia no existe, el flujo utiliza el comportamiento actual de la operación y sus comisiones. Esta fórmula no debe cambiarse en esta tarea.

## Condición Actual Detectada

La lógica especial actual para Scotiabank y BanBif considera, entre otros criterios:

- operación con estado `PAGADO`;
- `fecha_pagado` informada;
- operación sin cierre histórico para la vista abierta;
- modalidad `Mismo Día` con fecha de depósito igual a la fecha de pago;
- modalidad `Día Siguiente` con fecha de depósito igual al día anterior a la fecha de pago.

Se observan estos puntos a revisar durante la implementación:

1. La consulta especial no expresa de forma suficientemente explícita el filtro `tipo_servicio = 'Efectivizacion'`.
2. La vista abierta calcula directamente desde operaciones, mientras el histórico utiliza el snapshot del cierre.
3. La fecha de pago se utiliza como eje principal de reconocimiento, aunque el requerimiento solicita que la atribución se base en la fecha de depósito y en la fecha operativa consultada.
4. `f_sync_tb_ruta_operacion_kpi_caja` puede materializar valores, aunque el requerimiento plantea un KPI calculado por suma directa y sin actualizar otros acumulados.

## Regla Propuesta

Para la fecha operativa `D`, la interpretación inicialmente planteada es:

```text
Mismo Día:
  fecha_deposito_cliente = D
  estado = PAGADO

Día Siguiente:
  fecha_deposito_cliente = D - 1 día
  estado = PAGADO durante D
```

La operación `Día Siguiente` depositada en `D` y todavía `PENDIENTE` no debe entrar en el KPI de `D`.

La ganancia se calcularía sumando la fórmula de cada operación que cumpla los filtros, sin modificar la operación ni la caja.

## Ambigüedad Pendiente De Confirmar

Hay dos interpretaciones en la definición funcional recibida:

### Interpretación A: Reconocimiento Por Fecha De Atención

Para el día `D`:

```text
Mismo Día depositado en D y pagado en D
+ Día Siguiente depositado en D-1 y pagado en D
```

Esta interpretación coincide con el ejemplo de una operación del día anterior en modalidad `Día Siguiente` que se atiende hoy, y también con la lógica especial existente.

### Interpretación B: Agrupación Diferida De Ambas Modalidades

Para el martes se mostraría:

```text
Mismo Día depositado el lunes
+ Día Siguiente depositado el lunes y pagado el martes
```

Esta interpretación hace que el `Mismo Día` del lunes se visualice el martes, lo que contradice la frase de que una operación `Mismo Día` genera ganancia el lunes.

Antes de implementar se debe confirmar cuál de las dos reglas es la definitiva.

## Diseño Técnico Recomendado

La opción más aislada es crear una RPC de lectura exclusiva para el cálculo de ganancias de estas dos rutas. El nombre definitivo se decidirá al implementar, por ejemplo:

```text
f_get_tb_ruta_operacion_ganancias_efectivizacion
```

La función debería:

- recibir ruta, empresa, cuenta bancaria y fecha operativa;
- recibir opcionalmente el cierre histórico consultado;
- filtrar únicamente `tipo_servicio = 'Efectivizacion'`;
- filtrar estado `PAGADO`;
- filtrar modalidad `Mismo Día` o `Día Siguiente`;
- usar `fecha_deposito_cliente` convertida a hora de Lima;
- aplicar la regla temporal confirmada;
- sumar la fórmula de ganancia existente;
- devolver únicamente el importe calculado.

Para la caja abierta, el cálculo debe considerar operaciones del ciclo vivo. Para un cierre histórico, debe limitarse al cierre consultado o utilizar el snapshot histórico sin modificarlo.

El frontend podría reemplazar solamente el valor mostrado en `Ganancias` para Scotiabank y BanBif. No se modificarían los demás KPI ni se escribirían acumulados nuevos en `tb_caja_operativa` o `tb_ruta_operacion_kpi`.

## Archivos Probables A Modificar

### Backend

- `backend/backend_implementacion/05.ruta_operacion_y_cajas.sql`
  - nueva RPC de lectura del KPI;
  - bloque final `DROP FUNCTION` únicamente para la función nueva, si corresponde.

### Frontend

- `src/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-kpis.ts`
  - consultar el KPI especial solo para Scotiabank y BanBif;
  - conservar el cálculo actual para las demás rutas.
- `src/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service.ts`
  - agregar el método RPC si el servicio centraliza las llamadas.
- Tipos relacionados, únicamente si el contrato de la RPC lo requiere.

No se prevé modificar los flujos de creación, pago, retención, cierre o movimientos.

## Matriz De Validación

| Caso | Resultado esperado |
|---|---|
| Scotiabank, `Mismo Día`, depositada y pagada en D | Incluida en ganancias de D |
| Scotiabank, `Día Siguiente`, depositada en D-1 y pagada en D | Incluida en ganancias de D |
| Scotiabank, `Día Siguiente`, depositada en D y pendiente | Excluida de ganancias de D |
| BanBif con los mismos casos | Mismo comportamiento que Scotiabank |
| Operación `Pago Deuda` pagada | Excluida |
| Operación POS o Link Pago pagada | Excluida |
| BCP, BBVA, Interbank y SafetyPay | Sin cambios |
| Cierre histórico | Ganancia estable y asociada al cierre consultado |
| Caja abierta | Ganancia calculada para el ciclo actual |
| Retención | No modifica la regla de retención ni el saldo por esta tarea |

## Estado De Implementación

Implementado y validado en el código local.

## Implementación Retomada

La regla temporal confirmada se implementó para Scotiabank y BanBif:

- Se agregó la RPC de solo lectura `f_get_tb_ruta_operacion_ganancias_efectivizacion`.
- El cálculo considera únicamente operaciones de Efectivización en estado `PAGADO`.
- `Mismo Día` se agrupa por la fecha original de depósito cuando está `PAGADO`.
- `Día Siguiente` también se agrupa por la fecha original de depósito cuando está `PAGADO`, aunque se haya pagado posteriormente.
- Una operación `Día Siguiente` pendiente no suma al KPI.
- Se usa la zona horaria `America/Lima`.
- El frontend reemplaza únicamente el valor visual de `Ganancias` para estas dos rutas, tanto en caja viva como en historial.
- No se modifican saldos, movimientos, cierres, retenciones ni los demás KPI.

Validación realizada: `npm exec tsc -- --noEmit` y `git diff --check` sobre los archivos modificados.
