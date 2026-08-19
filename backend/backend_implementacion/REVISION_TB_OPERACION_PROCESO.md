# Revision de concurrencia de `tb_operacion_proceso`

## Alcance y metodo

Revision estatica de todos los archivos `.sql` dentro de `backend_implementacion/`,
siguiendo referencias directas e indirectas a:

- `public.tb_operacion_proceso`
- `public.tb_operacion_caja`
- `public.tb_caja_operativa`
- `public.tb_ruta_operacion_kpi`

No se modifico ningun archivo SQL ni se consulto produccion. La causa exacta de
una ejecucion concreta debe confirmarse con `pg_stat_activity` y `pg_locks`,
pero el codigo permite identificar los puntos de espera y los riesgos.

## Resumen ejecutivo

### P0 - urgente

1. La carga Excel puede mantener bloqueada la misma caja durante toda la
   transaccion. Cada fila termina en `f_post_tb_operacion_caja`, que hace
   `FOR UPDATE` sobre `tb_caja_operativa`. El lock de fila se mantiene hasta el
   `COMMIT`, no hasta el retorno de la funcion interna.
2. El recalculo KPI ocurre mientras la caja esta bloqueada. Cada movimiento
   puede llamar a `f_sync_tb_ruta_operacion_kpi_caja`, que actualiza cajas/KPI y
   ejecuta sumatorias y subconsultas sobre operaciones y movimientos.
3. El cierre de caja no toma el lock de la caja al inicio. Despues hace
   snapshots y actualizaciones masivas de operaciones y movimientos, pudiendo
   competir con pagos o cargas.
4. Los scripts de limpieza y backfill adquieren locks de tabla. Si se ejecutan
   mientras hay usuarios operando, pueden bloquear globalmente el sistema.

### P1 - importante

1. El pago por lote puede tomar varias operaciones y cajas en una transaccion.
   Si dos lotes adquieren recursos en orden distinto, aumenta la espera y el
   riesgo de deadlock o timeout.
2. Match de Pago Deuda, pago final, reversas y eliminaciones combinan locks de
   operaciones, movimientos, cajas y KPI. El orden no esta estandarizado entre
   todas las funciones.
3. Los scripts no declaran indices secundarios para las busquedas mas comunes
   de `tb_operacion_caja` por proceso, caja y cierre. Un scan lento no bloquea
   por si solo, pero alarga la transaccion que ya tiene locks.
4. La ruta Excel principal ya tiene validacion temprana e indice de duplicidad,
   pero `f_post_tb_operacion_proceso_excel_ganancia` conserva un camino mas
   costoso antes de terminar la validacion.

### P2 - optimizacion

1. Bandejas, seguimientos y reportes no usan `FOR UPDATE`; normalmente no
   bloquean escrituras, pero pueden consumir CPU/IO durante cargas grandes.
2. El KPI materializado es una fila por ruta. Cajas diferentes de una misma
   ruta terminan actualizando el mismo registro de `tb_ruta_operacion_kpi`.
3. Las operaciones de mantenimiento deben ejecutarse fuera del horario de
   trabajo o con una politica de exclusividad.

## 1. Flujo completo

```text
Excel / Efectivizacion / POS / Link Pago / Pago Deuda
                         |
                         v
                 tb_operacion_proceso
                         |
       pendiente / solicitado / procesado / retenido /
                    fuera de horario / pagado
                         |
                         +--> estado, comision, derivacion, match
                         |
                         v
                 tb_operacion_caja
                         |
                         v
                 tb_caja_operativa
                         |
                         +--> tb_ruta_operacion_kpi
                         +--> cierre y snapshot historico
                         +--> seguimiento y reportes
```

- Entrada manual: `f_post_tb_operacion_proceso`.
- Entrada Excel: `f_post_tb_operacion_proceso_excel` y
  `f_post_tb_operacion_proceso_excel_ganancia`.
- POS/Link Pago: `f_post_tb_operacion_asistida`.
- Solicitud Pago Deuda: `f_post_tb_pago_deuda_solicitud`, que crea raiz y
  operacion bancaria relacionada.
- Pago Efectivizacion: `f_patch_tb_operacion_proceso_pagado` y su variante
  `f_patch_tb_operacion_proceso_pagado_lote`.
- Pago Deuda: `f_patch_tb_pago_deuda_salida`,
  `f_patch_tb_pago_deuda_pagado` y `f_patch_tb_pago_deuda_match`.
- Derivacion: `f_patch_tb_operacion_proceso_derivacion` y
  `f_patch_tb_pago_deuda_derivar_banco`.
- Eliminacion/reversion: eliminacion, restauracion, reinicio y
  `f_apply_tb_operacion_caja_delta`.
- Cierre: `f_post_tb_caja_operativa_cierre` crea snapshot, asocia datos,
  reinicia caja y sincroniza KPI.

## 2. Funciones involucradas

La matriz identifica las funciones que escriben o tienen impacto operativo
directo. Una funcion puede tomar locks indirectamente al llamar un helper.

### 2.1 `03.operacion_proceso_y_excel.sql`

| Funcion | Que hace / tablas | Locks y llamadas | Riesgo |
|---|---|---|---|
| `f_post_tb_operacion_proceso` | Crea operacion manual en `tb_operacion_proceso`; puede crear cliente y movimiento. | Advisory lock de duplicidad; calculos; `f_post_tb_operacion_caja_desde_proceso`; KPI. | P1: transaccion amplia y caja compartida. |
| `f_post_tb_operacion_proceso_excel` | Procesa filas Excel y crea operaciones. | `pg_advisory_xact_lock`; llama caja por fila y KPI. | **P0:** puede retener la caja hasta terminar cientos de filas. |
| `f_post_tb_operacion_proceso_excel_ganancia` | Variante Excel con ganancia. | Advisory lock; comisiones; caja; KPI. | P1: mismo riesgo y ruta de duplicidad menos optimizada. |
| `f_patch_tb_operacion_proceso_pagado` | Cambia una operacion a Pagado y registra salida. | Operacion `FOR UPDATE`; caja por helper; KPI. | P1: operaciones distintas de la misma caja esperan. |
| `f_patch_tb_operacion_proceso_pagado_lote` | Valida y paga varias operaciones atomicas. | Operaciones y cajas; llama pago individual. | P1: lock multiple y posible orden inconsistente. |
| `f_patch_tb_operacion_proceso_eliminar` | Elimina/revierte operacion y movimientos. | Proceso `FOR UPDATE`; cajas `FOR UPDATE`; delta; KPI. | P1: ventana larga de reversion. |
| `f_patch_tb_operacion_proceso_restaurar` | Restaura operacion y movimientos. | Proceso y respaldo `FOR UPDATE`; helper de caja; KPI. | P1. |
| `f_patch_tb_operacion_proceso_base` | Cambia datos base y recalcula comisiones/caja. | Helpers de caja y KPI. | P1. |
| `f_patch_tb_operacion_proceso_comision_recurrente` | Recalcula comision. | Proceso `FOR UPDATE`; caja y KPI. | P1. |
| `f_patch_tb_operacion_proceso_comision_extra` | Aplica extra y recalcula. | Proceso, calculos y KPI. | P1 si coincide con pago. |
| `f_patch_tb_operacion_proceso_estado` | Cambia estado y KPI. | `UPDATE` implicito sobre proceso/KPI. | P2, salvo simultaneidad. |
| `f_patch_tb_operacion_proceso_derivacion` | Deriva a ruta/empresa/cuenta. | Proceso `FOR UPDATE`; ruta `FOR UPDATE OF rc`; KPI origen/destino. | P1. |
| `f_patch_tb_operacion_proceso_retencion` | Marca retencion y KPI. | Escritura de proceso; sincronizaciones. | P1 con cierre/pago. |
| `f_patch_tb_operacion_proceso_fuera_horario` | Cambia clasificacion. | Proceso `FOR UPDATE`; puede revertir movimiento; KPI. | P1 con pago/cierre. |
| `f_patch_tb_operacion_proceso_reanudar` | Revierte pausa y aplica delta. | Caja por `f_apply_tb_operacion_caja_delta`; KPI. | P1. |
| `f_patch_tb_operacion_proceso_directo_caja` | Registra efecto directo en caja. | Helper de caja y KPI. | P1. |
| `f_delete_tb_operacion_carga_excel_rollback` | Revierte una carga completa. | Carga `FOR UPDATE`; muchas operaciones/movimientos; delta/KPI. | **P0 en horario operativo.** |

Funciones auxiliares del mismo archivo:

- Lectura/normalizacion: `f_get_tb_documento_tipo_codigo`,
  `f_get_tb_parse_documento`, `f_get_tb_parsear_fecha`,
  `f_get_tb_operacion_proceso`, `f_get_tb_operacion_proceso_flag_pendiente_kpi`
  y `f_get_tb_operacion_carga_excel_rollback`.
- Clasificacion: `f_get_tb_operacion_clasificacion_horaria`.
- Calculos: `f_get_tb_operacion_comision_efectivizacion_cliente`,
  `f_get_tb_operacion_calculo_comision_servicio`,
  `f_get_tb_operacion_calculo_comision_banco_ingreso`,
  `f_get_tb_operacion_calculo_comision_banco_salida` y
  `f_get_tb_operacion_proceso_calculo`.

Estas auxiliares no toman locks de fila de forma visible; el riesgo principal
es ser llamadas por cada fila de una carga dentro de una transaccion grande.

Tambien forman parte del grafo de mutaciones y fueron revisadas:
`f_patch_tb_operacion_proceso_usuario`, `f_patch_tb_operacion_proceso_empresa`
y `f_patch_tb_operacion_proceso_tipo_recaudacion_sf`. Actualizan columnas de
`tb_operacion_proceso` y sincronizan o consultan KPI segun el camino; si se
ejecutan mientras otra funcion tiene la misma operacion bloqueada, esperan el
commit de esa funcion.

### 2.2 `04.pago_deuda.sql`

| Funcion | Que modifica | Locks / llamadas | Riesgo |
|---|---|---|---|
| `f_post_tb_pago_deuda_solicitud` | Crea raiz y BANCO en proceso. | Reglas, calculos y KPI; salida posterior usa caja. | P1: filas relacionadas. |
| `f_patch_tb_pago_deuda_salida` | Pasa BANCO a Procesado y registra salida. | Varias filas `FOR UPDATE`; caja; helper y KPI. | P1. |
| `f_patch_tb_pago_deuda_pagado` | Finaliza BANCO/raiz y salida/comision. | Input, BANCO, raiz y caja `FOR UPDATE`; helper, comision y KPI. | P1 alto. |
| `f_patch_tb_pago_deuda_match` | Enlaza retorno con efectivizacion. | Operaciones/movimiento; actualiza caja y KPI. | **P0/P1:** cruza dos flujos. |
| `f_patch_tb_pago_deuda_directo` | Registra retorno directo. | Helper de caja y KPI. | P1. |
| `f_patch_tb_pago_deuda_reiniciar_transferencia` | Revierte transferencia. | Proceso/movimiento y delta de caja. | P1. |
| `f_delete_tb_pago_deuda_solicitud` | Elimina raiz/BANCO y relaciones. | Varias filas `FOR UPDATE`; movimientos y KPI. | P1. |
| `f_patch_tb_pago_deuda_comision_especial` / `f_patch_tb_pago_deuda_comision_extra` | Cambian comision de raiz/BANCO. | Locks de proceso y recalculo. | P1. |
| `f_patch_tb_pago_deuda_empresa` | Cambia empresa/cuenta de salida. | Actualiza proceso, recalcula y KPI. | P1. |
| `f_patch_tb_pago_deuda_comision_cuenta` | Cambia cuenta de comision. | Proceso y movimientos relacionados. | P1. |
| `f_sync_tb_pago_deuda_comision_caja` | Crea/actualiza movimiento de comision. | Movimiento `FOR UPDATE`; `f_post_tb_operacion_caja` o delta. | P1. |
| `f_patch_tb_pago_deuda_derivar_banco` | Deriva BANCO. | Proceso y asociacion de ruta; KPI. | P1. |
| `f_patch_tb_pago_deuda_codigo_operacion` | Actualiza codigo de transferencia. | Escritura sobre proceso. | P2 salvo simultaneidad. |
| `f_patch_tb_pago_deuda_empresa_comision` / `f_post_tb_pago_deuda_comision` | Configuracion y registro de comision. | Escrituras; indirectamente movimiento/caja. | P2/P1. |

Lecturas: `f_get_tb_pago_deuda_empresa_comision`, `f_get_tb_pago_deuda`,
`f_get_tb_pago_deuda_kpi`, `f_get_tb_pago_deuda_match`,
`f_get_tb_pago_deuda_match_lote` y `f_get_tb_pago_deuda_bandeja`. No tienen
`FOR UPDATE` en la consulta normal; su riesgo es scan y consumo de recursos.

### 2.3 `05.ruta_operacion_y_cajas.sql`

| Funcion | Que hace | Locks / llamadas | Riesgo |
|---|---|---|---|
| `f_post_tb_operacion_caja` | Inserta movimiento y actualiza saldo/acumulados. | Caja `FOR UPDATE`; despues `f_sync_tb_ruta_operacion_kpi_caja`. | **P0:** KPI se ejecuta dentro del lock. |
| `f_apply_tb_operacion_caja_delta` | Aplica/revierte saldo y acumulados. | Caja `FOR UPDATE`; sincroniza KPI. | **P0.** |
| `f_post_tb_operacion_caja_desde_proceso` | Resuelve caja y movimiento; crea/actualiza ingreso/salida. | Verifica movimiento sin lock atomico; luego movimiento/caja por helpers. | **P0:** carrera de doble movimiento y orden variable. |
| `f_patch_tb_operacion_caja_revertir_informativa` | Revierte ingresos informativos. | Movimientos `FOR UPDATE`; delta de caja. | P1. |
| `f_patch_tb_operacion_caja` | Edita movimiento. | Escritura de movimiento y sincronizacion. | P1. |
| `f_post_tb_operacion_caja_transferencia` | Crea salida e ingreso relacionados. | Dos llamadas a `f_post_tb_operacion_caja`. | P1: puede invertir cajas. |
| `f_delete_tb_operacion_caja_manual` | Elimina movimiento manual. | Movimiento y caja `FOR UPDATE OF oc, c`; delta. | P1. |
| `f_patch_tb_operacion_caja_confirmar_retencion` | Confirma retencion de movimiento. | Movimiento/caja/KPI. | P1. |
| `f_patch_tb_operacion_proceso_confirmar_retencion` | Confirma desde proceso. | Proceso, caja, movimiento y KPI. | P1. |
| `f_patch_tb_operacion_proceso_retornar_retencion` | Retorna/libera retencion. | Proceso, lotes, caja y KPI. | P1 si camino operativo activo. |
| `f_sync_tb_ruta_operacion_kpi_operacion` | Recalcula KPI comercial. | Actualiza fila KPI; CTE y `NOT EXISTS` sobre proceso/caja. | **P0/P1:** costo alto dentro de mutaciones. |
| `f_sync_tb_ruta_operacion_kpi_caja` | Recalcula caja/KPI. | Actualiza cajas y KPI; agregaciones correlacionadas. | **P0:** prolonga el lock financiero. |
| `f_post_tb_caja_operativa_cierre` | Snapshot, asociaciones, reinicio y KPI. | Actualizaciones masivas; no bloquea caja al inicio. | **P0:** compite con pagos/Excel. |
| `f_delete_tb_caja_operativa_cierre_ultimo_dia` | Reabre cierre y revierte asociaciones. | Cierre y caja `FOR UPDATE`; varias tablas. | P0/P1. |
| `f_patch_tb_caja_operativa_saldo_inicial` | Cambia saldo inicial. | Caja `FOR UPDATE`; movimiento/KPI. | P1. |
| `f_post_tb_caja_operativa` / `f_patch_tb_caja_operativa` | Crea/edita caja. | Actualizan caja y KPI. | P1 durante operacion. |
| `f_patch_tb_ruta_operacion_caja_principal` | Cambia empresa principal. | Asociacion `FOR UPDATE`; actualizacion de ruta. | P1 sobre ruta. |

Lecturas: `f_get_tb_ruta_operacion_caja`,
`f_get_tb_ruta_operacion_caja_ingreso_principal`, `f_get_tb_ruta_operacion_kpi`,
`f_get_tb_caja_operativa`, `f_get_tb_caja_operativa_cierre`,
`f_get_tb_operacion_caja`, `f_get_tb_categoria_operacion_caja` y
`f_get_reporte_cierre`. No toman locks de escritura en el camino normal.

Funciones de ruta/caja adicionales revisadas: `f_sync_tb_ruta_operacion_caja_principal`,
`f_post_tb_ruta_operacion_caja`, `f_patch_tb_ruta_operacion_caja`,
`f_patch_tb_ruta_operacion_kpi_delta`, `f_post_tb_caja_operativa`,
`f_patch_tb_caja_operativa`, `f_post_tb_categoria_operacion_caja` y
`f_patch_tb_categoria_operacion_caja`. Las de escritura pueden bloquear la
asociacion, la caja o el KPI; las de categoria no modifican el flujo comercial
salvo cuando son llamadas durante la creacion de un movimiento.

### 2.4 POS y Link Pago: `11.operaciones_asistidas_pos_linkpago.sql`

- `f_post_tb_operacion_asistida` inserta POS/Link Pago en
  `tb_operacion_proceso`, consulta cliente/reglas/calculos y puede delegar la
  caja mediante las funciones comunes.
- `f_patch_tb_operacion_asistida` actualiza la operacion y sus calculos; usa
  `FOR UPDATE OF rc` al resolver ruta y puede llegar a proceso, caja y KPI.
- `f_get_tb_operacion_asistida_kpi` y
  `f_get_tb_operacion_asistida_bandeja` son lecturas.

POS y Link Pago comparten los mismos recursos de caja y KPI con Efectivizacion
y Pago Deuda; no tienen una proteccion de concurrencia independiente.

### 2.5 Retenciones: `10.retenciones_scotiabank_banbif.sql`

`f_get_tb_operacion_retencion_bandeja`,
`f_get_tb_operacion_retencion_bandeja_badges` y
`f_get_tb_operacion_retencion_empresa_badges` son consultas. No se encontro
`FOR UPDATE` en ellas. Leen proceso, cierres y reglas; no deberian bloquear
filas, aunque pueden ser lentas si escanean muchos estados, empresas, cuentas o
fechas.

### 2.6 Cortes/jobs: `12.recaudacion_cortes_abonos.sql`

- `f_sync_tb_recaudacion_lotes` actualiza lotes y relaciones que apuntan a
  `tb_operacion_proceso`.
- `f_run_tb_recaudacion_liberar_retenciones` y
  `f_patch_tb_recaudacion_confirmar_si_vencida` pueden recorrer/actualizar
  operaciones y movimientos segun la configuracion vigente.
- `f_get_tb_recaudacion_operacion_info` es lectura.
- `f_get_tb_recaudacion_cuenta_flag_retenida`,
  `f_get_tb_calendario_habil_sumar`, `f_get_tb_calendario_es_habil`,
  `f_get_tb_recaudacion_fecha_liberacion`,
  `f_get_tb_recaudacion_regla_abono` y
  `f_patch_tb_recaudacion_regla_abono` son auxiliares.

El job o la liberacion manual deben considerarse concurrentes con pago, cierre
y clasificacion si el camino operativo sigue habilitado. Una funcion que
recorre muchas operaciones tambien puede mantener una transaccion larga.

### 2.7 Seguimientos y reportes

En `13.seguimientos.sql` participan:

- `f_get_tb_seguimiento_efectivizacion_kpi`;
- `f_get_tb_seguimiento_efectivizacion_bandeja`;
- `f_get_tb_seguimiento_pago_deuda_kpi`;
- `f_get_tb_seguimiento_pago_deuda_bandeja`;
- `f_get_tb_seguimiento_efectivizacion_paginado`;
- `f_get_tb_seguimiento_pago_deuda_paginado`;
- `f_get_tb_seguimiento_operaciones_paginado`.

Son lecturas con joins y subconsultas sobre proceso/movimientos. No toman
`FOR UPDATE` de forma explicita; su riesgo es consumo de CPU/IO y planes lentos.

En `14.reportes_cierre_caja.sql` participan
`f_get_tb_reporte_cierre_caja_fechas` y
`f_get_tb_reporte_cierre_caja_bandeja`. Tambien participa
`f_get_reporte_cierre` de `05`. Son lecturas de snapshots, cajas y procesos;
no deben ejecutarse dentro de una transaccion de escritura larga.

### 2.8 Mantenimiento y triggers

- `07.limpieza_operaciones_*.sql` y `07.limpieza_operaciones_global.sql`
  ejecutan `LOCK TABLE ... IN SHARE ROW EXCLUSIVE MODE` sobre proceso,
  movimientos, cajas, cierres y KPI. Son bloqueos globales y no pertenecen al
  flujo normal de usuarios.
- `08.backfill_operacion_caja_ingreso_salida.sql` hace actualizaciones e
  inserciones masivas en movimientos/cajas.
- `09.rollback_operaciones_para_pruebas.sql` limpia/trunca tablas operativas y
  sincroniza KPI; no debe ejecutarse con usuarios conectados.
- `01` y `02` tienen triggers de historial sobre catalogos, no sobre proceso,
  movimientos o cajas. No son causa directa del timeout operativo.

## 3. Puntos donde se generan locks

### Locks explicitos

1. `tb_operacion_proceso ... FOR UPDATE`: elimina, restaura, pagos, lotes,
   derivacion, comisiones, clasificacion y Pago Deuda.
2. `tb_caja_operativa ... FOR UPDATE`: `f_post_tb_operacion_caja`,
   `f_apply_tb_operacion_caja_delta`, pagos, saldo inicial, reapertura y
   movimientos manuales.
3. `tb_operacion_caja ... FOR UPDATE`: reversas, eliminacion manual, comision,
   match y confirmacion de retencion.
4. Asociaciones de ruta `FOR UPDATE OF rc`: derivaciones, POS y empresa
   principal.
5. `pg_advisory_xact_lock`: serializa la misma clave de duplicidad en Excel o
   registro manual, pero no protege la caja compartida.

### Locks implicitos

`UPDATE` y `DELETE` toman locks de fila automaticamente:

- cada `UPDATE tb_ruta_operacion_kpi` bloquea la fila de una ruta;
- cada `UPDATE tb_caja_operativa` bloquea la caja;
- el cierre actualiza muchas operaciones y movimientos;
- un conflicto en indice/constraint unico puede esperar al commit de otra
  transaccion.

### Ordenes que pueden cruzarse

- Pago individual: proceso -> caja -> movimiento -> KPI.
- Match: operaciones relacionadas -> movimiento -> caja -> KPI.
- Reversa/eliminacion: proceso -> movimientos -> caja -> KPI.
- Transferencia entre cajas: caja origen -> caja destino.
- Otro flujo puede tomar primero destino y despues origen.
- Cierre: seleccion -> proceso/movimientos -> caja -> KPI.

La falta de un orden unico para todas las funciones es el principal riesgo de
esperas largas y, en algunos cruces, deadlocks.

## 4. Causa mas probable del `55P03`

La hipotesis principal es:

```text
Carga Excel grande
  -> inserta fila
  -> f_post_tb_operacion_caja_desde_proceso
  -> f_post_tb_operacion_caja
  -> SELECT tb_caja_operativa FOR UPDATE
  -> f_sync_tb_ruta_operacion_kpi_caja
  -> repite con la siguiente fila
  -> COMMIT al terminar el RPC
```

Mientras la carga esta abierta, un pago de otra operacion de la misma caja no
puede tomar `tb_caja_operativa`. Si `lock_timeout` es menor que la duracion de
la carga, el pago falla con `55P03`.

La segunda causa probable es un cierre o reapertura en paralelo: hace
actualizaciones masivas y el cierre no bloquea la caja al principio. La tercera
es un lote/match que toma varias operaciones, movimientos y cajas.

No es correcto eliminar el `FOR UPDATE` de la caja: proteger el saldo es
necesario. El problema es la duracion de la transaccion y el trabajo pesado que
se realiza mientras el lock esta tomado.

Para demostrar el bloqueador real en un ambiente autorizado:

```sql
SELECT
  pid,
  usename,
  state,
  wait_event_type,
  wait_event,
  now() - query_start AS duracion,
  pg_blocking_pids(pid) AS bloqueadores,
  query
FROM pg_stat_activity
WHERE datname = current_database()
  AND (wait_event_type = 'Lock' OR cardinality(pg_blocking_pids(pid)) > 0)
ORDER BY query_start;
```

Grafo de locks:

```sql
SELECT
  waiting.pid AS waiting_pid,
  waiting.query AS waiting_query,
  blocking.pid AS blocking_pid,
  blocking.query AS blocking_query,
  waiting_l.mode AS waiting_mode,
  blocking_l.mode AS blocking_mode,
  waiting_l.relation::regclass AS relation
FROM pg_locks waiting_l
JOIN pg_stat_activity waiting ON waiting.pid = waiting_l.pid
JOIN pg_locks blocking_l
  ON blocking_l.locktype = waiting_l.locktype
 AND blocking_l.database IS NOT DISTINCT FROM waiting_l.database
 AND blocking_l.relation IS NOT DISTINCT FROM waiting_l.relation
 AND blocking_l.page IS NOT DISTINCT FROM waiting_l.page
 AND blocking_l.tuple IS NOT DISTINCT FROM waiting_l.tuple
 AND blocking_l.virtualxid IS NOT DISTINCT FROM waiting_l.virtualxid
 AND blocking_l.transactionid IS NOT DISTINCT FROM waiting_l.transactionid
 AND blocking_l.classid IS NOT DISTINCT FROM waiting_l.classid
 AND blocking_l.objid IS NOT DISTINCT FROM waiting_l.objid
 AND blocking_l.objsubid IS NOT DISTINCT FROM waiting_l.objsubid
 AND blocking_l.pid <> waiting_l.pid
JOIN pg_stat_activity blocking ON blocking.pid = blocking_l.pid
WHERE NOT waiting_l.granted
  AND blocking_l.granted;
```

## 5. Riesgo con cinco usuarios simultaneos

| Usuario | Accion | Recurso | Efecto |
|---|---|---|---|
| 1 | Paga operacion A | Caja compartida | Obtiene lock de caja. |
| 2 | Paga operacion B distinta | Misma caja | Espera aunque el proceso sea distinto. |
| 3 | Carga Excel de 500 filas | Misma caja/KPI | Puede bloquear 1, 2 y POS hasta terminar. |
| 4 | Registra POS o Link Pago | Misma caja | Espera el lock de caja. |
| 5 | Hace match, deriva o edita comision | Proceso/ruta/KPI | Puede esperar operacion, caja o KPI. |

Cajas diferentes de una misma ruta todavia comparten la fila de KPI de ruta.
Si `f_sync_tb_ruta_operacion_kpi_caja` actualiza todas las cajas de la ruta,
la contencion puede ampliarse mas alla de la caja que origino la operacion.

## 6. Indices revisados

Los scripts declaran:

- `tb_operacion_proceso_pkey (id)`;
- `idx_tb_operacion_proceso_excel_duplicidad` para servicio, codigo, monto y
  fecha;
- `tb_operacion_caja_pkey (id)`;
- `tb_caja_operativa_pkey (id)` y unique `(id_empresa,
  id_empresa_cuenta_bancaria)`;
- `tb_ruta_operacion_kpi_pkey (id)` y unique `(ruta)`;
- indice parcial unico de empresa principal;
- indices de lotes/recaudacion en `12.recaudacion_cortes_abonos.sql`.

No se encontraron indices secundarios declarados en los scripts para las
busquedas frecuentes de `tb_operacion_caja`. Confirmar en cada ambiente:

```sql
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'tb_operacion_proceso',
    'tb_operacion_caja',
    'tb_caja_operativa',
    'tb_ruta_operacion_kpi'
  )
ORDER BY tablename, indexname;
```

Candidatos P1, despues de revisar planes y datos:

```text
tb_operacion_caja (id_operacion_proceso, tipo_movimiento, id_caja_cierre)
tb_operacion_caja (id_caja, id_caja_cierre, id_operacion_proceso)
tb_operacion_proceso (id_caja_cierre, id_estado)
tb_operacion_proceso (id_empresa_ingreso, id_empresa_cuenta_ingreso, id_caja_cierre)
tb_operacion_proceso (ruta_destino, id_estado, flag_derivado)
```

No crearlos a ciegas: usar `EXPLAIN (ANALYZE, BUFFERS)` y revisar el costo.
Tambien evaluar una restriccion de idempotencia para no crear dos movimientos
del mismo proceso/tipo, despues de revisar comisiones, retornos y relaciones.

## 7. Estrategia recomendada

### P0

1. Mantener `FOR UPDATE` sobre la caja, pero reducir la seccion critica a
   validar saldo, aplicar delta, insertar/actualizar movimiento y actualizar
   caja. No ejecutar agregaciones completas mientras la caja esta bloqueada.
2. Procesar Excel en lotes pequenos o por etapas. Mantener la validacion
   atomica de duplicados, pero no una unica transaccion de cientos de filas que
   sostenga la caja todo el tiempo.
3. Ordenar operaciones por `id` y cajas por `id` antes de adquirir locks en
   pagos por lote y match.
4. Al iniciar el cierre, bloquear la caja con `FOR UPDATE` y esperar/rechazar
   operaciones activas antes de construir el snapshot.
5. Separar KPI pesado del lock financiero: usar deltas dentro de la transaccion
   y recalculo completo despues del commit, o una cola idempotente.

### P1

1. Hacer atomica la lectura/creacion del movimiento en
   `f_post_tb_operacion_caja_desde_proceso`, tomando primero el lock de la
   operacion o usando una clave idempotente.
2. Estandarizar el orden: operacion -> movimientos relacionados -> cajas en
   orden ascendente -> KPI en orden de ruta.
3. Aplicar la misma validacion temprana de duplicados a la variante Excel con
   ganancia.
4. Crear solo indices confirmados con `EXPLAIN`, con prioridad en
   `tb_operacion_caja.id_operacion_proceso` y filtros de caja/cierre.
5. Revisar `fecha::date`, `UPPER`, `COALESCE` y subconsultas correlacionadas en
   filtros frecuentes.

### P2

1. Usar `pg_stat_statements` para ordenar consultas por tiempo total y medio.
2. Medir duracion y cantidad de filas de Excel, pagos por lote, cierres y KPI.
3. Ejecutar bandejas/reportes fuera de transacciones de escritura largas.
4. No reintentar ciegamente `55P03`; solo hacerlo si la mutacion es idempotente.
5. Ejecutar limpieza, backfill y rollback sin usuarios operando.

## 8. Archivos SQL que se tendrian que modificar

Esta revision no los modifica. Los candidatos son:

- `03.operacion_proceso_y_excel.sql`: Excel normal/ganancia, pago individual,
  pago lote, eliminacion y reversion.
- `04.pago_deuda.sql`: solicitud, salida, match, pago, comision y reversa.
- `05.ruta_operacion_y_cajas.sql`: movimientos, deltas, helper desde proceso,
  KPI, cierre y reapertura.
- `10.retenciones_scotiabank_banbif.sql`: solo si los planes de bandeja son
  lentos.
- `11.operaciones_asistidas_pos_linkpago.sql`: si POS/Link Pago mantienen
  transacciones largas antes de caja.
- `12.recaudacion_cortes_abonos.sql`: jobs y lotes que modifiquen procesos.
- `13.seguimientos.sql` y `14.reportes_cierre_caja.sql`: solo para indices o
  planes; no deben tomar locks de escritura.
- `07.*`, `08.*` y `09.*`: mantenimiento exclusivo, no flujo normal.

Si se modifica una funcion SQL, se debe conservar su bloque `DROP FUNCTION`
correspondiente al final del archivo.

## Conclusion

El `55P03` mas probable no es un `FOR UPDATE` aislado defectuoso. Es la suma
de:

```text
transaccion larga
+ mismo registro de tb_caja_operativa compartido
+ KPI pesado ejecutado dentro del lock
+ cierres/lotes que actualizan muchas filas
```

La proteccion del saldo debe permanecer. La prioridad es acortar la
transaccion, estandarizar el orden de locks, asegurar idempotencia por
operacion y sacar los recalculos pesados del tramo que protege la caja.
