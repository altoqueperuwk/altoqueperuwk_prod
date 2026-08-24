# Mapa Actual De KPIs Por Ruta

## Objetivo

Este documento registra como se calculan, leen y actualizan los KPI del sistema en el estado actual del proyecto.

El objetivo es preparar una refactorizacion controlada: crear nuevas funciones de KPI y cambiar el punto de lectura cuando corresponda, sin eliminar ni modificar las funciones actuales. Las funciones existentes deben permanecer disponibles para rollback.

No se realizaron cambios de SQL ni de frontend para generar este documento.

## Resumen Ejecutivo

El sistema tiene tres familias distintas de KPI:

1. **KPI bancario de caja** para BCP, BBVA, Scotiabank, BanBif, Interbank y SafetyPay.
2. **KPI informativo asistido** para POS y Link Pago.
3. **KPI informativo de solicitudes** para Pago Deuda.

La familia bancaria es la que depende de la relacion entre operaciones, movimientos y caja:

```text
tb_operacion_proceso
        |
        +--> tb_operacion_caja
        |          |
        |          +--> tb_caja_operativa
        |                    |
        |                    +--> tb_ruta_operacion_kpi
        |
        +--> tb_caja_operativa_cierre.kpi_snapshot
```

La lectura actual del frontend bancario no toma unicamente el valor materializado en `tb_ruta_operacion_kpi`. Usa una lectura general y, para Scotiabank/BanBif, reemplaza el campo `ganancias` con una consulta especial.

## Rutas Bancarias

Estas rutas utilizan `BancariaPage`:

| Ruta | Componente | Lectura principal | Lectura especial de ganancias |
|---|---|---|---|
| `/operaciones/bcp` | `BancariaPage` | `f_get_tb_ruta_operacion_kpi` | No |
| `/operaciones/bbva` | `BancariaPage` | `f_get_tb_ruta_operacion_kpi` | No |
| `/operaciones/scotiabank` | `BancariaPage` | `f_get_tb_ruta_operacion_kpi` | Si, `f_get_tb_ruta_operacion_ganancias_efectivizacion` |
| `/operaciones/banbif` | `BancariaPage` | `f_get_tb_ruta_operacion_kpi` | Si, `f_get_tb_ruta_operacion_ganancias_efectivizacion` |
| `/operaciones/interbank` | `BancariaPage` | `f_get_tb_ruta_operacion_kpi` | No |
| `/operaciones/safetypay` | `BancariaPage` | `f_get_tb_ruta_operacion_kpi` | No |

La ruta activa puede trabajar con varias empresas y cuentas. Por eso el hook puede consultar una o varias rutas de trabajo y luego combinar sus resultados.

## Flujo Frontend De Lectura

### Punto de entrada

Archivo:

`src/features/operaciones/efectivizacion/bancaria/pages/bancaria-page.tsx`

La pagina obtiene el KPI mediante:

```text
useBancariaKpis(
  activeOperationRoute,
  activeCompanyId,
  activeAccountId,
  activeCajaId,
  selectedHistoryDate,
  refreshKey,
  workspaceRoutes
)
```

El resultado se entrega a:

```text
BancariaKpiGrid
```

### Hook actual

Archivo:

`src/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-kpis.ts`

Funciones que se ejecutan desde el hook:

1. `operacionesRpcService.getRutaKpi(...)`
   - RPC: `f_get_tb_ruta_operacion_kpi`.
2. `operacionesRpcService.getRutaGananciasEfectivizacion(...)`
   - RPC: `f_get_tb_ruta_operacion_ganancias_efectivizacion`.
   - Solo se llama cuando la ruta es `scotiabank` o `banbif`.
3. `operacionesRpcService.getCajaCierres(...)`
   - RPC: `f_get_tb_caja_operativa_cierre`.
   - Se usa cuando se consulta una fecha historica.

En una consulta viva de Scotiabank o BanBif, el flujo es:

```text
f_get_tb_ruta_operacion_kpi
        |
        +--> resultado base de todos los KPI

f_get_tb_ruta_operacion_ganancias_efectivizacion
        |
        +--> reemplaza unicamente el campo ganancias
```

En una consulta historica bancaria:

```text
f_get_tb_caja_operativa_cierre
        |
        +--> buildHistoryKpi en frontend
        |
        +--> para Scotiabank/BanBif se vuelve a consultar
             f_get_tb_ruta_operacion_ganancias_efectivizacion
```

## Funciones KPI Bancarias

### 1. `f_get_tb_ruta_operacion_kpi`

Archivo:

`backend/backend_implementacion/05.ruta_operacion_y_cajas.sql`

Tipo: lectura general del KPI bancario.

Retorna:

- `caja_inicial`;
- `caja_actual`;
- `total_recaudado`;
- `ingresos`;
- `salidas`;
- `gastos_operacionales`;
- `ganancias`;
- `ingresos_retenidos`;
- `fuera_horario`;
- `pendiente_depositar`;
- total de Efectivizacion;
- total de Pago Deuda.

Fuentes consultadas:

- `tb_ruta_operacion_kpi` como registro base de la ruta;
- `tb_ruta_operacion_caja` para relacionar ruta con empresa y cuenta;
- `tb_caja_operativa` para caja inicial, caja actual, salidas y acumulados;
- `tb_operacion_proceso` para operaciones comerciales, retenciones, fuera de horario y conteos;
- `tb_operacion_caja` para movimientos abiertos;
- `tb_caja_operativa_cierre` indirectamente mediante filtros de historico y trazabilidad.

Caracteristica importante:

- Para Scotiabank y BanBif, el bloque de `ganancias` de esta funcion puede ser reemplazado por la funcion especial en frontend.
- El resto de los KPI sigue viniendo de esta consulta general.

### 2. `f_get_tb_ruta_operacion_ganancias_efectivizacion`

Archivo:

`backend/backend_implementacion/05.ruta_operacion_y_cajas.sql`

Tipo: lectura especial, sin escritura.

Aplica exclusivamente a:

- `scotiabank`;
- `banbif`.

Filtros actuales principales:

- ruta destino u origen;
- tipo de servicio `EFECTIVIZACION`;
- estado `PAGADO`;
- `fecha_deposito_cliente` no nula;
- modalidad `MISMO DIA` o `DIA SIGUIENTE`;
- empresa y cuenta, cuando se reciben;
- fecha operativa;
- cierre historico cuando `p_historico = true`.

Formula actual de cada ganancia:

```text
monto_deposito_cliente
- monto_transferencia_cliente
- resultado_comision_banco_ingreso
- resultado_comision_banco_salida
```

Las operaciones de retorno/directo de Pago Deuda se excluyen de la ganancia.

Esta es la funcion especial que debe conservarse intacta durante el break. Si luego se crea una nueva funcion, el cambio de conexion puede hacerse en `use-bancaria-kpis.ts`.

### 3. `f_sync_tb_ruta_operacion_kpi_operacion`

Archivo:

`backend/backend_implementacion/05.ruta_operacion_y_cajas.sql`

Tipo: sincronizacion/materializacion de KPI operativos.

Actualiza principalmente:

- `pendiente_depositar`;
- `total_efectivizacion`;
- `total_pago_deuda`.

Lee `tb_operacion_proceso` y excluye operaciones que ya estan cerradas o arrastradas segun las reglas vigentes.

Al finalizar consulta `f_get_tb_ruta_operacion_kpi` para devolver el estado de KPI.

No es la lectura directa que presenta el frontend, pero forma parte del circuito de actualizacion.

### 4. `f_sync_tb_ruta_operacion_kpi_caja`

Archivo:

`backend/backend_implementacion/05.ruta_operacion_y_cajas.sql`

Tipo: sincronizacion/materializacion contable.

Actualiza datos en:

- `tb_caja_operativa`:
  - `ingresos_retenido`;
  - valores derivados de fuera de horario;
- `tb_ruta_operacion_kpi`:
  - caja inicial;
  - caja actual;
  - recaudacion;
  - ingresos;
  - salidas;
  - gastos;
  - ganancias;
  - retenciones;
  - fuera de horario.

Fuentes principales:

- `tb_caja_operativa`;
- `tb_operacion_caja`;
- `tb_operacion_proceso`;
- `tb_ruta_operacion_caja`.

Tiene una rama especial para `scotiabank` y `banbif` mediante `ganancias_modalidad`. Esto no debe confundirse con la lectura aislada del frontend: ambas piezas existen actualmente.

### 5. `f_patch_tb_ruta_operacion_kpi_delta`

Archivo:

`backend/backend_implementacion/05.ruta_operacion_y_cajas.sql`

Tipo: ajuste materializado de KPI.

Recibe deltas para valores de KPI y actualiza `tb_ruta_operacion_kpi`. Cuando corresponde, obtiene el estado base mediante `f_get_tb_ruta_operacion_kpi`.

Es una funcion de soporte para actualizaciones puntuales, no la lectura principal de `BancariaPage`.

### 6. `f_get_tb_operacion_proceso_flag_pendiente_kpi`

Archivo:

`backend/backend_implementacion/03.operacion_proceso_y_excel.sql`

Tipo: funcion auxiliar de clasificacion.

Se usa dentro de calculos de KPI para decidir si una operacion debe participar en `pendiente_depositar`.

No retorna un KPI completo ni escribe datos, pero afecta el resultado de las funciones de sincronizacion.

## Cierre E Historico

### `f_post_tb_caja_operativa_cierre`

Archivo:

`backend/backend_implementacion/05.ruta_operacion_y_cajas.sql`

Participa en el KPI porque:

1. Toma la caja viva.
2. Construye `kpi_snapshot`.
3. Inserta el snapshot en `tb_caja_operativa_cierre`.
4. Congela operaciones y movimientos segun las reglas vigentes.
5. Reinicia la caja viva.
6. Ejecuta `f_sync_tb_ruta_operacion_kpi_caja`.

No es una funcion de consulta KPI, pero define el snapshot que luego se muestra como cierre historico.

### `f_get_tb_caja_operativa_cierre`

Archivo:

`backend/backend_implementacion/05.ruta_operacion_y_cajas.sql`

Lee:

- `tb_caja_operativa_cierre`;
- `kpi_snapshot`;
- `tb_operacion_caja` para algunos valores historicos de ingresos/recaudacion;
- `tb_operacion_proceso` mediante la relacion del movimiento.

El frontend usa esta funcion para construir los KPI historicos. Para Scotiabank y BanBif vuelve a pedir la ganancia especial por separado.

### `f_get_reporte_cierre`

Archivo:

`backend/backend_implementacion/05.ruta_operacion_y_cajas.sql`

Se usa para los reportes de cierre en Excel/PDF. Consume el cierre, el snapshot y las operaciones/movimientos relacionados. Es un consumidor historico, no el KPI vivo de la pantalla principal.

## Disparadores De Sincronizacion Bancaria

Las siguientes funciones pueden disparar sincronizacion de KPI al modificar operaciones:

### `03.operacion_proceso_y_excel.sql`

- `f_post_tb_operacion_proceso`;
- `f_post_tb_operacion_proceso_excel`;
- `f_post_tb_operacion_proceso_excel_ganancia`;
- `f_patch_tb_operacion_proceso_base`;
- `f_patch_tb_operacion_proceso_estado`;
- `f_patch_tb_operacion_proceso_empresa`;
- `f_patch_tb_operacion_proceso_comision_extra`;
- `f_patch_tb_operacion_proceso_comision_recurrente`;
- `f_patch_tb_operacion_proceso_derivacion`;
- `f_patch_tb_operacion_proceso_devolver_derivacion`;
- `f_patch_tb_operacion_proceso_retencion`;
- `f_patch_tb_operacion_proceso_pagado`;
- `f_patch_tb_operacion_proceso_pagado_lote`;
- `f_patch_tb_operacion_proceso_directo_caja`;
- `f_patch_tb_operacion_proceso_reanudar`;
- `f_patch_tb_operacion_proceso_reanudar_post_cierre`;
- `f_patch_tb_operacion_proceso_fuera_horario`;
- `f_patch_tb_operacion_proceso_eliminar`;
- `f_patch_tb_operacion_proceso_restaurar`;
- `f_delete_tb_operacion_carga_excel_rollback`.

Segun la funcion, se llama al sincronizador de operaciones, al sincronizador de caja o a ambos. Derivaciones pueden sincronizar ruta origen y ruta destino.

### `04.pago_deuda.sql`

- `f_post_tb_pago_deuda_solicitud`;
- `f_delete_tb_pago_deuda_solicitud`;
- `f_patch_tb_pago_deuda_salida`;
- `f_patch_tb_pago_deuda_match`;
- `f_patch_tb_pago_deuda_pagado`;
- `f_patch_tb_pago_deuda_reiniciar_transferencia`;
- `f_patch_tb_pago_deuda_derivar_banco`.

Estas funciones pueden sincronizar una o dos rutas dependiendo de si existe una derivacion o un destino bancario.

### `05.ruta_operacion_y_cajas.sql`

- `f_patch_tb_ruta_operacion_caja_principal`;
- `f_post_tb_ruta_operacion_caja`;
- `f_patch_tb_ruta_operacion_caja`;
- `f_post_tb_caja_operativa`;
- `f_patch_tb_caja_operativa`;
- `f_post_tb_caja_operativa_cierre`;
- `f_delete_tb_caja_operativa_cierre_ultimo_dia`;
- `f_post_tb_operacion_caja`;
- `f_apply_tb_operacion_caja_delta`;
- `f_post_tb_operacion_caja_desde_proceso`;
- `f_patch_tb_operacion_caja_confirmar_retencion`;
- `f_patch_tb_operacion_proceso_confirmar_retencion`;
- `f_patch_tb_operacion_proceso_retornar_retencion`.

Estas funciones impactan de forma directa la caja o los movimientos y, por eso, actualizan KPI de caja y/o KPI de operaciones.

## Conteo De La Familia Bancaria

Para la refactorizacion de KPI bancarios, el inventario minimo es:

### Funciones de lectura o calculo

**6 funciones principales/auxiliares**:

1. `f_get_tb_ruta_operacion_kpi`;
2. `f_get_tb_ruta_operacion_ganancias_efectivizacion`;
3. `f_sync_tb_ruta_operacion_kpi_operacion`;
4. `f_sync_tb_ruta_operacion_kpi_caja`;
5. `f_patch_tb_ruta_operacion_kpi_delta`;
6. `f_get_tb_operacion_proceso_flag_pendiente_kpi`.

### Funciones de cierre y consumo historico

**3 funciones relacionadas**:

1. `f_post_tb_caja_operativa_cierre`;
2. `f_get_tb_caja_operativa_cierre`;
3. `f_get_reporte_cierre`.

Por tanto, hay **9 funciones directamente relacionadas con el KPI bancario y su historial**, de las cuales las 6 primeras forman el nucleo de lectura/sincronizacion y las 3 ultimas forman el ciclo de cierre/reporte.

El numero de llamadas no es igual al numero de funciones: una sola accion, como pagar por lote, puede llamar una funcion de negocio y terminar en los dos sincronizadores.

## KPI Especial De Retenciones

La separacion especial actual se encuentra en dos lugares:

1. `f_get_tb_ruta_operacion_ganancias_efectivizacion` para la lectura puntual de ganancias de Scotiabank/BanBif.
2. `ganancias_modalidad` dentro de `f_sync_tb_ruta_operacion_kpi_caja` y dentro de `f_get_tb_ruta_operacion_kpi` para materializacion/lectura general.

Las retenciones y fuera de horario se calculan usando flags de `tb_operacion_proceso` y filtros de operaciones arrastradas/cerradas. Los principales campos son:

- `flag_retenido`;
- `flag_fuera_horario`;
- `id_caja_cierre`;
- `fecha_caja_cierre`;
- `fecha_deposito_cliente` en la ganancia especial.

Este es el punto donde una futura funcion nueva debe aislarse para no reintroducir reglas antiguas de retencion ni depender de `tb_operacion_caja` si la nueva definicion lo decide.

## Rutas Que No Se Deben Tocar En Este Break

### `/operaciones/pos`

Usa:

- `f_get_tb_operacion_asistida_kpi`;
- `f_get_tb_operacion_asistida_bandeja` para la tabla.

El KPI asistido:

- lee `tb_operacion_proceso`;
- usa `fecha_registro`;
- suma operaciones `PAGADO`;
- calcula comisiones, gastos, ganancia y salidas;
- no consulta ni modifica caja operativa.

### `/operaciones/linkpago`

Usa la misma familia asistida:

- `f_get_tb_operacion_asistida_kpi`;
- `f_get_tb_operacion_asistida_bandeja`.

No debe conectarse al nuevo KPI bancario.

### `/operaciones/pagodeuda`

Usa:

- `f_get_tb_pago_deuda_kpi`;
- `f_get_tb_pago_deuda` y/o funciones de bandeja para la tabla.

El KPI de Pago Deuda:

- trabaja sobre solicitudes principales;
- usa `fecha_registro` para el rango;
- cuenta pendientes y pagados;
- suma montos solicitados, comisiones y devoluciones;
- no es el KPI bancario de caja.

## Seguimientos Globales

Estas funciones existen, pero no son las que alimentan el bloque KPI principal de `/operaciones/bancos`:

- `f_get_tb_seguimiento_efectivizacion_kpi`;
- `f_get_tb_seguimiento_pago_deuda_kpi`.

Se usan en el modulo de seguimientos y tienen sus propias reglas globales. No deben modificarse como parte del corte de KPI bancario.

## Conexion Recomendada Para La Nueva Via

El cambio futuro puede hacerse en este punto, sin demoler la via actual:

```text
BancariaPage
    |
    +--> useBancariaKpis
              |
              +--> operacionesRpcService.getRutaKpi
              |       |
              |       +--> f_get_tb_ruta_operacion_kpi  (actual)
              |
              +--> getRutaGananciasEfectivizacion
                      |
                      +--> f_get_tb_ruta_operacion_ganancias_efectivizacion
                          (actual, solo Scotiabank/BanBif)
```

La estrategia conservadora seria:

1. Crear nuevas funciones con nombres nuevos.
2. No editar ni eliminar las funciones actuales.
3. Agregar nuevos metodos RPC con nombres nuevos, si se necesita separar contratos.
4. Cambiar solo el hook de lectura de bancos mediante una bandera o selector controlado.
5. Mantener el camino anterior disponible para rollback.
6. No cambiar POS, Link Pago ni Pago Deuda.

## Puntos De Riesgo Para La Refactorizacion

### Riesgo 1: Confundir lectura con materializacion

`f_get_tb_ruta_operacion_kpi` lee/calcula el resultado que ve el frontend, mientras que `f_sync_tb_ruta_operacion_kpi_caja` y `f_sync_tb_ruta_operacion_kpi_operacion` actualizan datos persistidos.

Crear una nueva lectura no elimina automaticamente los efectos de los sincronizadores.

### Riesgo 2: Duplicar ganancias

Para Scotiabank y BanBif hay una ganancia especial en la lectura del frontend y otra logica especial dentro del sincronizador de caja. Si se crea una nueva funcion, debe definirse cual sera la unica fuente visual para `ganancias` sin sumar ambas.

### Riesgo 3: Historico de cierre

El KPI historico combina `tb_caja_operativa_cierre` con `kpi_snapshot` y luego puede volver a consultar la ganancia especial. La nueva via debe tener una variante historica explicita o conservar la lectura actual para cierres.

### Riesgo 4: Derivaciones

Una derivacion puede sincronizar la ruta de origen y la ruta destino. Una nueva funcion debe recibir claramente el contexto de ruta, empresa y cuenta para no mostrar la operacion dos veces ni quitarla de la empresa receptora.

### Riesgo 5: Dependencia de movimientos

La caja y algunos valores de KPI todavia dependen de `tb_operacion_caja`. Separar el KPI de operaciones no debe cambiar el saldo ni los movimientos hasta que exista una decision funcional independiente.

## Conclusion

El sistema no tiene un unico KPI universal. Tiene:

- **9 funciones relacionadas con KPI bancario, cierre e historico**;
- **1 funcion KPI para POS/Link Pago**;
- **1 funcion KPI para Pago Deuda**;
- **2 funciones KPI de seguimientos globales**.

Para el break solicitado, el alcance correcto es solo la familia bancaria de las seis rutas. El primer punto de conmutacion debe ser `useBancariaKpis.ts`, manteniendo las funciones SQL actuales y sin tocar las familias de POS, Link Pago ni Pago Deuda.
