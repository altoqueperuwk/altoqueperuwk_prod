# Plan De Optimizacion De Locks Y Concurrencia

## Alcance

Este documento corresponde a una segunda fase de analisis sobre:

- `backend/backend_implementacion/03.operacion_proceso_y_excel.sql`
- `backend/backend_implementacion/05.ruta_operacion_y_cajas.sql`

Se uso como contexto `REVISION_TB_OPERACION_PROCESO.md`.

No se modificaron funciones SQL, tablas, indices ni contratos RPC. Las propuestas mantienen como requisito que una misma entrada produzca el mismo estado, movimiento, saldo y KPI final.

## Conclusion Ejecutiva

El `55P03` es compatible con una contencion por fila de caja operativa. Las operaciones distintas pueden terminar esperando entre si porque comparten la misma fila de `tb_caja_operativa`. Esto es correcto para proteger el saldo, pero el tiempo de espera aumenta porque, despues de tomar `FOR UPDATE`, varias rutas ejecutan sincronizaciones de KPI y consultas agregadas dentro de la misma transaccion.

El segundo riesgo relevante es la idempotencia de `f_post_tb_operacion_caja_desde_proceso`: la comprobacion de movimiento existente y el `INSERT` no forman por si solos una barrera unica por operacion. Dos sesiones pueden observar que no existe movimiento y competir para crearlo.

La carga Excel no puede liberar la caja entre filas mientras permanezca en una sola llamada RPC. Las funciones PL/pgSQL no pueden hacer `COMMIT` intermedio. Dividir la carga exige cambiar el contrato o introducir un proceso por lotes, por lo que debe validarse aparte.

## 1. Flujo Revisado

### Carga y creacion

`f_post_tb_operacion_proceso_excel` y `f_post_tb_operacion_proceso_excel_ganancia` normalizan la fila, verifican duplicidad, resuelven cliente, banco, comunidad y reglas, calculan comisiones, insertan en `tb_operacion_proceso` y generan el movimiento mediante `f_post_tb_operacion_caja_desde_proceso`.

La carga Excel puede tocar en cada fila:

1. `tb_operacion_proceso`.
2. `tb_operacion_caja`.
3. `tb_caja_operativa`.
4. `tb_ruta_operacion_kpi` mediante sincronizaciones.

El advisory lock de duplicidad serializa la misma clave de carga, pero no evita que distintas filas compitan por una misma caja.

### Atencion y pagos

Las funciones de estado y pago bloquean la operacion y terminan usando `f_post_tb_operacion_caja_desde_proceso`, `f_post_tb_operacion_caja` o `f_apply_tb_operacion_caja_delta`. El saldo de `tb_caja_operativa` se protege con `FOR UPDATE`.

Pago Deuda, POS, Efectivizacion, derivaciones, reversas y cambios de clasificacion pueden coincidir con una carga Excel y competir por las mismas filas de caja, movimiento u operacion.

### Cierre y reapertura

`f_post_tb_caja_operativa_cierre` actualiza operaciones y movimientos, genera el snapshot y reinicia la caja viva. `f_delete_tb_caja_operativa_cierre_ultimo_dia` revierte el ultimo cierre y actualiza varias tablas. Ambas operaciones tienen un alcance mayor que una operacion individual y deben coordinarse con los pagos que usan la misma caja.

## 2. Funciones Y Puntos De Contencion

| Archivo | Funcion | Accion principal | Lock o riesgo |
|---|---|---|---|
| `05.ruta_operacion_y_cajas.sql` | `f_post_tb_operacion_caja` | Registra movimiento y actualiza saldo/KPI | `tb_caja_operativa FOR UPDATE`; KPI dentro de la misma transaccion |
| `05.ruta_operacion_y_cajas.sql` | `f_apply_tb_operacion_caja_delta` | Aplica o revierte impacto de movimiento | `tb_caja_operativa FOR UPDATE`; sincroniza KPI antes de liberar la transaccion |
| `05.ruta_operacion_y_cajas.sql` | `f_post_tb_operacion_caja_desde_proceso` | Idempotencia y delegacion de movimiento | Riesgo de carrera entre existencia e insercion |
| `05.ruta_operacion_y_cajas.sql` | `f_sync_tb_ruta_operacion_kpi_caja` | Recalcula KPIs de caja/ruta | Actualiza filas compartidas y ejecuta agregaciones costosas |
| `05.ruta_operacion_y_cajas.sql` | `f_sync_tb_ruta_operacion_kpi_operacion` | Recalcula KPI por operaciones | Actualiza la fila de KPI de la ruta; contention por ruta |
| `05.ruta_operacion_y_cajas.sql` | `f_post_tb_caja_operativa_cierre` | Congela ciclo y reinicia caja | Updates masivos sobre operaciones, movimientos, cierre y caja |
| `05.ruta_operacion_y_cajas.sql` | `f_delete_tb_caja_operativa_cierre_ultimo_dia` | Reabre y restaura ultimo cierre | Bloquea cierre/caja y modifica varias relaciones |
| `05.ruta_operacion_y_cajas.sql` | `f_patch_tb_caja_operativa_saldo_inicial` | Ajusta saldo inicial | Lock de caja y alta de movimiento |
| `03.operacion_proceso_y_excel.sql` | `f_post_tb_operacion_proceso` | Crea operacion manual | Advisory lock, operacion, movimiento y KPI |
| `03.operacion_proceso_y_excel.sql` | `f_post_tb_operacion_proceso_excel` | Carga filas Excel | Advisory lock por duplicidad y llamada de caja por fila |
| `03.operacion_proceso_y_excel.sql` | `f_post_tb_operacion_proceso_excel_ganancia` | Variante de carga con ganancia | Misma competencia por caja; conserva ruta costosa |
| `03.operacion_proceso_y_excel.sql` | `f_patch_tb_operacion_proceso_pagado` | Paga una operacion | Bloquea operacion/caja y registra salida |
| `03.operacion_proceso_y_excel.sql` | `f_patch_tb_operacion_proceso_pagado_lote` | Paga varias operaciones | Puede bloquear varias operaciones/cajas y llamar el pago individual |
| `03.operacion_proceso_y_excel.sql` | `f_patch_tb_operacion_proceso_eliminar` | Elimina/revierte operacion | Bloquea operacion, movimiento/caja y recalcula KPI |
| `03.operacion_proceso_y_excel.sql` | `f_patch_tb_operacion_proceso_derivacion` | Deriva operacion | Bloqueo de operacion y asociaciones de ruta |
| `03.operacion_proceso_y_excel.sql` | `f_patch_tb_operacion_proceso_fuera_horario` | Cambia clasificacion | Bloquea operacion y puede revertir informacion |

Las funciones de lectura y reportes no toman normalmente locks de escritura, pero pueden aumentar el tiempo total de consultas si recorren muchas filas sin indices adecuados. No son la causa primaria del `55P03`, aunque pueden elevar la presion de CPU e IO.

## 3. Hallazgos Priorizados

### P0 - Contencion de caja durante sincronizacion de KPI

**Cambio propuesto:** separar la seccion critica de caja de los recalculos extensos de KPI, manteniendo el mismo resultado final.

**Archivo:** `05.ruta_operacion_y_cajas.sql`.

**Funciones:** `f_post_tb_operacion_caja`, `f_apply_tb_operacion_caja_delta`, `f_sync_tb_ruta_operacion_kpi_caja`, `f_sync_tb_ruta_operacion_kpi_operacion`.

**Problema actual:** la caja se bloquea con `FOR UPDATE`, luego se insertan/actualizan movimientos y se ejecutan sincronizaciones que consultan operaciones y movimientos. El lock se conserva hasta el final de la transaccion RPC. Cinco usuarios que trabajan sobre operaciones diferentes de la misma empresa/cuenta esperan la misma fila de caja.

**Modificacion tecnica propuesta:** tomar el lock, validar saldo, aplicar el movimiento y actualizar los acumulados de caja; despues ejecutar el recalculo completo de KPI en un paso controlado y con un orden de locks definido. Las consultas de KPI deben ejecutarse una sola vez por operacion o lote cuando sea posible.

**Clasificacion:** REQUIERE VALIDACION.

**Por que no cambia la logica:** el saldo y el movimiento seguirian confirmandose bajo el lock; solo se reduce trabajo dentro de la seccion critica. Sin embargo, separar KPI puede cambiar el instante en que el usuario observa el dato o dejar un KPI temporalmente atrasado si falla la sincronizacion.

**Riesgo:** KPI momentaneamente desactualizado, doble sincronizacion o una carrera entre dos sincronizaciones de la misma ruta.

**Beneficio esperado:** menor tiempo de espera sobre `tb_caja_operativa` y menos `55P03` en pagos, POS y cargas concurrentes.

**Como probar:** ejecutar 5 sesiones concurrentes sobre la misma caja y otras 5 sobre cajas distintas; medir `pg_stat_activity`, `pg_locks`, latencia RPC y comparar saldo/KPI final con una ejecucion serial.

**Rollback:** restaurar la version anterior de las funciones y volver a ejecutar la sincronizacion completa dentro de la transaccion actual.

### P0 - Idempotencia de movimiento por operacion

**Cambio propuesto:** hacer atomica la proteccion de `f_post_tb_operacion_caja_desde_proceso`.

**Archivo:** `05.ruta_operacion_y_cajas.sql`.

**Funcion:** `f_post_tb_operacion_caja_desde_proceso`.

**Problema actual:** la funcion consulta si ya existe un movimiento abierto y luego delega el insert. Sin un lock de operacion o una restriccion unica compatible, las sesiones A y B pueden observar ausencia y ambas insertar.

**Modificacion tecnica propuesta:** bloquear de forma determinista la fila de `tb_operacion_proceso` antes de la comprobacion, o agregar una restriccion/indice unico parcial que represente exactamente el movimiento comercial unico permitido por la regla actual. La eleccion depende de confirmar si una operacion puede tener legalmente mas de un movimiento de cada tipo.

**Clasificacion:** REQUIERE VALIDACION.

**Por que no cambia la logica:** solo impide duplicar un movimiento que ya deberia ser unico. No cambia monto, estado ni formula.

**Riesgo:** un lock adicional puede invertir el orden actual con funciones que bloquean primero la caja; un indice unico puede rechazar historicos duplicados o movimientos especiales validos si la clave se define mal.

**Beneficio esperado:** elimina la carrera de doble movimiento y evita dobles descuentos o dobles acumulados.

**Como probar:** dos sesiones deben llamar simultaneamente la funcion para el mismo `id_operacion_proceso`; debe existir un solo movimiento y un solo impacto de caja. Repetir con operaciones distintas y con movimientos de reversa/retencion.

**Rollback:** quitar el indice solo despues de confirmar que no fue usado por otras funciones, o revertir el lock adicional. Antes de crear un indice se debe auditar duplicidad historica.

### P1 - Orden unico de adquisicion de locks

**Cambio propuesto:** documentar e implementar gradualmente un orden comun:

1. `tb_operacion_proceso`, por `id` ascendente.
2. `tb_operacion_caja`, por `id` ascendente, cuando existan varios movimientos.
3. `tb_caja_operativa`, por `id` ascendente.
4. KPI/ruta, por `ruta` o `id` ascendente.

Para transferencias o lotes, primero ordenar todos los ids y luego tomar los locks. Nunca bloquear una segunda caja antes de terminar de ordenar la lista.

**Archivo:** ambos archivos revisados.

**Funciones:** pagos individual/lote, eliminacion, reversas, derivacion, `f_post_tb_operacion_caja_desde_proceso`, cierre y reapertura.

**Problema actual:** distintas rutas pueden bloquear primero operacion, caja o movimiento en orden diferente. Esto aumenta la posibilidad de espera circular.

**Clasificacion:** REQUIERE VALIDACION.

**Por que no cambia la logica:** el orden solo define como se espera el acceso; el resultado funcional debe ser el mismo.

**Riesgo:** alterar el orden sin mapear todas las llamadas anidadas puede crear una nueva espera o bloquear mas filas antes de validar.

**Beneficio esperado:** menos deadlocks y menor variabilidad de latencia bajo lotes y pagos simultaneos.

**Como probar:** ejecutar pagos de dos operaciones que comparten caja, pagos de dos cajas, derivaciones simultaneas y cierre concurrente. Revisar `pg_locks` y confirmar ausencia de ciclos.

**Rollback:** revertir por funcion el orden nuevo y conservar el orden previo mientras se corrige el caso que falle.

### P1 - Indices de acceso para movimientos

**Cambio propuesto:** despues de revisar `pg_indexes` en la base objetivo y `EXPLAIN (ANALYZE, BUFFERS)`, evaluar indices para:

- `tb_operacion_caja (id_operacion_proceso)`;
- `tb_operacion_caja (id_caja, id_caja_cierre)`;
- `tb_operacion_caja (id_caja_cierre)` cuando la consulta historica lo justifique;
- `tb_operacion_proceso (id_empresa, id_empresa_cuenta_ingreso, id_estado)` y variantes solo si los planes muestran seq scan costoso.

**Archivo:** no modificar todavia. La implementacion debera quedar junto a la definicion de la tabla segun la regla del repositorio, o desplegarse con `CREATE INDEX CONCURRENTLY` fuera de la transaccion.

**Funciones beneficiadas:** `f_post_tb_operacion_caja_desde_proceso`, `f_apply_tb_operacion_caja_delta`, bandejas, cierre, reapertura, pagos y rollback Excel.

**Problema actual:** los scripts revisados no muestran indices secundarios suficientes sobre `tb_operacion_caja`; los filtros por `id_operacion_proceso`, `id_caja` e `id_caja_cierre` pueden hacer scans repetidos.

**Clasificacion:** SEGURO, condicionado a `EXPLAIN` y a no duplicar indices existentes.

**Por que no cambia la logica:** un indice cambia el plan de acceso, no las filas devueltas ni los valores.

**Riesgo:** mayor costo de escritura y almacenamiento; un indice redundante puede empeorar cargas Excel.

**Beneficio esperado:** menos tiempo de espera para comprobaciones de idempotencia, cierre y reversas.

**Como probar:** comparar `EXPLAIN (ANALYZE, BUFFERS)` antes/despues en cada consulta representativa y medir carga de 100, 500 y 1,000 filas.

**Rollback:** eliminar solo el indice nuevo si las metricas de escritura empeoran y no existen dependencias.

### P1 - Indice de duplicidad Excel existente

**Estado:** ya existe en los cambios locales de `03.operacion_proceso_y_excel.sql` el indice expresional de duplicidad por servicio, codigo, monto normalizado y fecha.

**Conclusion:** no crear otro indice equivalente. Debe validarse en la base de desarrollo con `EXPLAIN`, incluyendo exactamente las mismas expresiones del `WHERE`.

**Clasificacion:** SEGURO mantenerlo; REQUIERE VALIDACION confirmar que la funcion desplegada lo usa y que el plan muestra `Index Scan`.

**Riesgo:** bajo para lectura; cada insert de Excel tiene el costo normal de mantener el indice.

**Rollback:** solo retirar el indice si se demuestra que no se usa y que su mantenimiento afecta la carga; no cambiar la regla de duplicidad.

### P1 - Cierre de caja como operacion exclusiva

**Cambio propuesto:** tomar el lock de la caja operativa al inicio de `f_post_tb_caja_operativa_cierre`, antes de leer el estado que se va a congelar. Coordinar el mismo orden con pagos y registros.

**Archivo:** `05.ruta_operacion_y_cajas.sql`.

**Funcion:** `f_post_tb_caja_operativa_cierre`.

**Problema actual:** el cierre realiza updates masivos y puede competir con un pago que esta registrando movimiento en la misma caja. El snapshot puede esperar o ser calculado mientras otra transaccion aun no termina.

**Clasificacion:** REQUIERE VALIDACION.

**Por que no cambia la logica:** protege la fotografia del ciclo sin cambiar que operaciones se consideran cerradas.

**Riesgo:** bloqueo prolongado de toda la caja durante el cierre; si se toma demasiado temprano, aumenta la espera de usuarios.

**Beneficio esperado:** snapshot consistente y menos carreras entre cierre y pago.

**Como probar:** iniciar cierre y pago simultaneamente sobre una misma caja; validar snapshot, asociaciones y saldo final frente a una ejecucion serial.

**Rollback:** restaurar el orden previo de lectura/actualizacion mientras se rediseña la seccion critica.

## 4. Analisis De NOWAIT

`NOWAIT` podria evaluarse unicamente en acciones interactivas que bloquean una sola operacion, como pago individual, edicion de estado, eliminacion o cambio de clasificacion. No se recomienda usarlo en caja, cierre, cargas Excel ni lotes.

Clasificacion: REQUIERE VALIDACION.

El motivo es que cambia el comportamiento observable: en lugar de esperar hasta el timeout, la RPC retornaria inmediatamente `55P03`. Para que sea correcto se necesita un mensaje tecnico claro y que el frontend conserve la seleccion/edicion sin interpretar el rechazo como una falla de negocio.

No usar `SKIP LOCKED` para pagos o cargas. Podria omitir operaciones validas silenciosamente y cambiar el resultado funcional.

## 5. Carga Excel Y Tamano De Transaccion

### Situacion actual

`f_post_tb_operacion_proceso_excel` mantiene la semantica de una llamada unica. Aunque el movimiento se genere fila por fila, los locks tomados por cada llamada anidada se conservan hasta el final de la transaccion RPC.

### Alternativas

| Alternativa | Clasificacion | Motivo |
|---|---|---|
| Mover calculos puros antes del lock de caja | SEGURO condicionado | Reduce seccion critica si no lee saldo mutable; requiere revisar dependencia exacta |
| Recalcular KPI una sola vez por archivo | REQUIERE VALIDACION | Puede mantener el mismo resultado final, pero cambia el momento de visibilidad |
| Partir Excel en RPC por lotes | REQUIERE VALIDACION | Libera locks entre lotes, pero cambia atomicidad y rollback de archivo |
| `COMMIT` dentro de PL/pgSQL | NO RECOMENDADO | No es valido para una funcion normal y rompería la semantica |
| Saltar filas bloqueadas | NO RECOMENDADO | Cambia el resultado y puede perder operaciones |

La opcion mas conservadora es conservar el contrato actual y optimizar primero indices, idempotencia y el trabajo de KPI. Si el timeout continua, evaluar un endpoint de lotes con estado explicito, no insertar commits improvisados dentro de la funcion.

## 6. Indices Revisados

### `tb_operacion_proceso`

- PK sobre `id`.
- Indice expresional local para duplicidad Excel por servicio, codigo, monto redondeado y fecha.
- No se debe crear otro indice de duplicidad sin comparar expresiones exactamente.
- Evaluar filtros de bandejas solo con evidencia de `EXPLAIN`; no crear indices por cada columna aislada.

### `tb_operacion_caja`

- PK sobre `id`.
- No se identifico en los scripts revisados un indice secundario general para `id_operacion_proceso`, `id_caja` o `id_caja_cierre`.
- Es el candidato principal para pruebas de indices.

### `tb_caja_operativa`

- PK sobre `id`.
- Unicidad por `(id_empresa, id_empresa_cuenta_bancaria)`.
- El acceso por `id` ya es directo; no se recomienda agregar indices sobre saldo o KPI.

## 7. Escenario De Cinco Usuarios

| Usuario | Accion | Recurso compartido | Riesgo |
|---|---|---|---|
| 1 | Paga operacion | Operacion, movimiento, caja | Espera si otra sesion retiene caja |
| 2 | Paga otra operacion | Misma caja | Espera necesaria para proteger saldo |
| 3 | Carga Excel | Caja repetida por fila | Puede prolongar la cola de caja |
| 4 | Registra POS/Pago Deuda | Caja y operacion | Puede recibir `55P03` por timeout |
| 5 | Modifica/deriva | Operacion, rutas y KPI | Puede competir por operacion/KPI |

Operaciones distintas solo pueden ejecutarse en paralelo hasta el punto donde comparten caja o KPI de ruta. La serializacion sobre una misma caja es necesaria; el objetivo es reducir el trabajo que ocurre mientras la fila esta bloqueada, no quitar esa proteccion.

## 8. Cambios Seguros Recomendados

1. Mantener el indice expresional de duplicidad Excel ya presente y validar su uso con `EXPLAIN`.
2. Auditar `pg_indexes` antes de crear indices nuevos.
3. Evaluar y, si falta, agregar indices de acceso a `tb_operacion_caja` para `id_operacion_proceso` y `id_caja/id_caja_cierre`, usando despliegue concurrente cuando corresponda.
4. Instrumentar tiempos por etapa en desarrollo para separar tiempo de normalizacion, consulta, caja y KPI. La instrumentacion debe ser de diagnostico y no alterar resultados.

## 9. Cambios Que Requieren Validacion

1. Mover sincronizaciones KPI fuera de la seccion critica de caja.
2. Bloquear la operacion antes de la comprobacion/insert de movimiento.
3. Agregar una unicidad parcial para impedir movimientos duplicados.
4. Estandarizar el orden de locks en pagos, lotes, reversas, cierre y derivaciones.
5. Tomar la caja al inicio del cierre.
6. Usar `NOWAIT` en acciones de una sola operacion, con manejo frontend del `55P03`.
7. Agrupar la sincronizacion KPI al final de una carga o lote.
8. Partir la carga Excel en varias RPC.

## 10. Cambios Que No Debemos Hacer

1. Eliminar `FOR UPDATE` de `tb_caja_operativa`.
2. Usar `SKIP LOCKED` para pagos, cargas o cierres.
3. Hacer `COMMIT` dentro de las funciones PL/pgSQL.
4. Convertir la carga Excel en inserciones asincronas sin conservar su atomicidad y respuesta actual.
5. Quitar sincronizaciones KPI sin reemplazarlas por una estrategia de consistencia equivalente.
6. Crear indices duplicados sobre las expresiones ya existentes.
7. Cambiar estados, formulas, montos, reglas de retencion, fuera de horario o comisiones como parte de esta fase.

## 11. Plan De Pruebas Antes De Implementar

1. Capturar inventario real de `pg_indexes`, constraints y volumen por tabla.
2. Ejecutar `EXPLAIN (ANALYZE, BUFFERS)` para duplicidad Excel, movimiento por operacion, movimiento por caja y cierre.
3. Ejecutar cinco sesiones concurrentes sobre la misma caja.
4. Ejecutar cinco sesiones sobre cajas distintas y comparar paralelismo.
5. Probar pago individual, pago por lote, POS, Pago Deuda, derivacion, eliminacion y cierre simultaneos.
6. Verificar que cada operacion tenga como maximo los movimientos permitidos por su flujo.
7. Comparar contra una ejecucion serial: estados, montos, saldos, movimientos y KPI deben coincidir.
8. Medir `55P03`, `40P01`, duracion de RPC, espera por lock y filas afectadas.
9. Probar carga Excel de 100, 500 y 1,000 filas, incluyendo repetidas y duplicados concurrentes.

## Implementacion Inicial

Con la aprobacion para comenzar, se aplicaron solamente los cambios conservadores siguientes:

- En `05.ruta_operacion_y_cajas.sql` se agrego `idx_tb_operacion_caja_operacion_proceso` para acelerar la comprobacion de movimientos por operacion.
- En `05.ruta_operacion_y_cajas.sql` se agrego `idx_tb_operacion_caja_caja_cierre` para filtros de caja y cierre.
- `f_post_tb_operacion_caja_desde_proceso` ahora bloquea la fila de `tb_operacion_proceso` con `FOR UPDATE` antes de consultar o crear su movimiento. Esto evita que dos sesiones creen el movimiento de la misma operacion simultaneamente.
- `03.operacion_proceso_y_excel.sql` no requirio cambios adicionales en esta primera pasada; conserva la optimizacion local de duplicidad Excel ya existente.

Estos cambios no modifican estados, formulas, montos, saldo, movimientos esperados ni KPI finales. El recálculo de KPI dentro de la seccion critica, `NOWAIT`, el orden global de locks y el particionado de Excel quedan pendientes de validacion concurrente.

Este archivo sigue siendo el plan de referencia para la siguiente etapa. No se implementaron cambios en otros archivos SQL.

## Punto De Reanudacion

**Estado:** pausa controlada despues de la primera implementacion conservadora.

### Ya Aplicado

- Indice para buscar movimientos por `id_operacion_proceso`.
- Indice para buscar movimientos por `id_caja` e `id_caja_cierre`.
- `FOR UPDATE` sobre la operacion comercial dentro de `f_post_tb_operacion_caja_desde_proceso`, antes de comprobar o crear el movimiento.
- Validacion TypeScript y `git diff --check` correctos.

### No Aplicar Todavia

- No eliminar ni debilitar `FOR UPDATE` sobre `tb_caja_operativa`.
- No usar `SKIP LOCKED`.
- No usar `NOWAIT` hasta definir el manejo del error `55P03` en cada flujo.
- No separar la carga Excel en varias transacciones sin validar la atomicidad actual.
- No mover sincronizaciones KPI fuera de la transaccion sin probar consistencia temporal y rollback.

### Siguiente Paso Al Retomar

1. Ejecutar en desarrollo `pg_indexes` y `EXPLAIN (ANALYZE, BUFFERS)` para confirmar el uso de los dos indices.
2. Medir locks con cinco sesiones concurrentes sobre la misma caja y sobre cajas diferentes.
3. Comparar el orden de locks en pagos individuales, pagos por lote, reversas, eliminacion y cierre.
4. Evaluar por separado la reduccion del trabajo KPI dentro de la seccion critica.
5. Evaluar el particionado de Excel solo si los resultados funcionales y la atomicidad pueden conservarse.

Al continuar, comenzar desde esta seccion y conservar los cambios ya aplicados antes de proponer nuevas modificaciones.
