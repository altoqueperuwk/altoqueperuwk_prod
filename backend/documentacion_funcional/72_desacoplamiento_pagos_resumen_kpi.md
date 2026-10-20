# Desacoplamiento del pago y el resumen KPI — desarrollo

Fecha: 20/10/2026. Entorno exclusivo: `ouehhtlrcvcixurgonrb`. No se modificó producción ni el frontend en esta intervención. Sin build, commit o push.

## Decisión e implementación

Para BCP, Interbank, Scotiabank, BBVA y BanBif, los importes de las tarjetas ya se consultan desde operaciones/cajas/movimientos mediante KPI v2. El pago deja de recalcular y escribir el resumen global antiguo. No se elimina ninguna tabla ni movimiento.

La separación de metadatos es **lógica**, mediante `v_ruta_operacion_metadata`, una vista restringida sobre las columnas id/ruta/estado/usuario/fecha de la tabla existente. No se duplican datos ni se cambian los identificadores históricos. `tb_ruta_operacion_kpi` permanece para compatibilidad, inicialización y rutas no migradas. Sus importes acumulados no deben considerarse el saldo vigente de los cinco bancos: usar los lectores migrados. La identidad del gestor de cada pago sigue en la operación; los metadatos de ruta no se actualizan por cada pago.

### Funciones

- `f_get_tb_ruta_operacion_kpi`: lector compatible que consulta v2 en las cinco rutas activas. Conserva el formato de 21 campos, filtros por id/estado y el recorrido antiguo para rutas no migradas o metadatos inactivos. La consulta sin ruta recorre las rutas con metadatos, sin devolver los acumulados obsoletos de los bancos.
- `f_get_tb_ruta_operacion_kpi_operaciones_v2`: obtiene los metadatos de la vista, sin modificar su cálculo comercial.
- `f_sync_tb_ruta_operacion_kpi_operacion`, **ambas firmas**: para los cinco bancos con metadatos existentes devuelve el cálculo vigente si se solicitó respuesta, o NULL si no; no adquiere el advisory lock global ni escribe los acumulados. La sobrecarga de dos argumentos delega en la de tres. Se conserva el camino de inicialización si no existe la ruta y el camino de rutas no migradas.
- `f_sync_tb_caja_operativa_despues_movimiento`: helper interno nuevo; conserva la normalización de ingresos retenidos, pero limita el bloqueo y actualización a la caja afectada. Para rutas no migradas mantiene la sincronización anterior. EXECUTE revocado a PUBLIC/anon/authenticated; lo invocan funciones SECURITY DEFINER existentes.
- `f_post_tb_operacion_caja`, `f_apply_tb_operacion_caja_delta`, `f_post_tb_operacion_caja_desde_proceso`: conservan los movimientos, deltas, saldos, protecciones e idempotencia existentes; sustituyen la sincronización global posterior por el helper de la caja afectada, respetando el diferimiento en lotes.
- `f_patch_tb_operacion_proceso_pagado_lote`: al terminar, normaliza las cajas con movimientos afectados en orden de id, sin sincronizar todas las cajas de la ruta migrada. Mantiene el camino anterior para otras rutas y la respuesta existente.

**Hallazgo importante de la línea base:** la definición que ya estaba compilada de `f_post_tb_operacion_caja_desde_proceso` contenía un corte comercial que no genera movimientos nuevos para determinadas operaciones bancarias EF/POS sin movimiento legacy. Esta intervención no lo introdujo ni lo retiró. Por ello se agregó un caso con movimiento legacy sembrado dentro de la transacción para comprobar también el recorrido financiero real, además de Pago Deuda, que sí creó movimientos en la prueba. No atribuir los cero movimientos de los casos comerciales nuevos a esta intervención.

No se cambió `f_sync_tb_ruta_operacion_kpi_caja`: continúa disponible para cierres, configuración y flujos no migrados. Tampoco se retiraron globalmente recálculos de devoluciones, eliminación, reclasificación ni cierres. El alcance no equivale a eliminar todos los bloqueos legítimos ni todo recálculo del sistema.

## Despliegue

Se compilaron ocho nombres de función / nueve firmas en desarrollo y se creó la vista de metadatos. Se respaldaron las definiciones originales, incluida la implementación distinta de la sobrecarga de dos argumentos que existía en desarrollo. Es necesario compilar **las dos firmas** para que lote y Pago Deuda no sigan ejecutando la implementación antigua de dos argumentos.

Los archivos SQL contienen al final la consulta generadora de DROP de las funciones afectadas. Esa consulta no ejecuta DROP; no se ejecutó DROP ni ALTER TABLE en este cambio. Las restricciones de acceso al helper/vista son nuevas, no amplían permisos del cliente.

## Regresión financiera (todo con ROLLBACK)

Siete escenarios comparados contra las definiciones originales: efectivización, POS, retenida, fuera de horario, movimiento legacy, lote de dos operaciones y Pago Deuda con raíz/BANCO/retorno/comisión preparados dentro de la transacción.

Se compararon estados, importes de movimientos, saldos/acumulados físicos de cajas y KPI v2. **Siete comparaciones idénticas**, resumen global sin cambios y cero advisory locks de BCP en todos los recorridos nuevos. No se considera id/fecha del movimiento una medida de equivalencia; las secuencias de identidad pueden avanzar aun con ROLLBACK.

La financiación y las operaciones de prueba fueron transaccionales y no se guardaron. El caso fuera de horario comprueba una operación marcada así; no sustituye una matriz completa de movimientos informativos históricos ni las pruebas de cierre/reapertura.

Tiempos de cliente SQL puntuales, no p95 ni benchmark controlado: lote 282 → 209 ms; Pago Deuda 338 → 246 ms; movimiento legacy 405 → 249 ms. La evidencia principal es la eliminación del recurso global sin cambios financieros, no un porcentaje general de velocidad.

## Concurrencia

Cinco pruebas de dos conexiones, también revertidas:

1. Pago de una operación con otra conexión reteniendo deliberadamente el advisory lock global BCP: completó sin adquirir ese lock.
2. Operaciones distintas de Hueso y Capital Nova pagadas en transacciones concurrentes: ambas completaron.
3. Misma operación bloqueada: el segundo intento conservó el rechazo 55P03 por lock_timeout.
4. Misma caja bloqueada: el delta conservó el rechazo 55P03 con NOWAIT.
5. Una caja bloqueada y delta en otra caja BCP: completó sin reservar todas las cajas de BCP.

Fingerprint de todas las operaciones, movimientos y cajas idéntico antes/después. Los pagos de operaciones existentes en desarrollo fueron revertidos; no quedaron operaciones pagadas por las pruebas. No es una prueba de estrés prolongada ni una garantía de ausencia de deadlocks en todos los recursos/escenarios.

## Consumidores, interfaz y compatibilidad

- Lectores antiguo/v2 equivalentes en las cinco rutas; consulta global devuelve las nueve rutas actuales.
- Comparación de respuesta y estado físico después de sincronizar las rutas no migradas `deuda`, `linkpago`, `pos` y `safetypay`: idéntica a la sobrecarga original de desarrollo, todo revertido.
- Inventario de SQL con referencias directas a la tabla: lector antiguo, delta KPI y sincronizadores de operación/caja. La única vista encontrada fue la nueva proyección; no se encontraron vistas materializadas dependientes. No cubre integraciones externas o SQL dinámico arbitrario.
- BCP recargado en DOM: Hueso 800 y filas visibles, sin errores en el registro de consola consultado. No se efectuaron pagos por DOM.
- Dieciocho pruebas frontend de reintento y badges aprobadas. No hay archivos frontend nuevos para este cambio ni se modificaron request/response de los RPC existentes.

## Evidencia y rollback

Directorio `outputs/payment-decouple-20261020/`: `before-functions.json`, siete comparaciones, `regression.json`, `concurrency.json`, `reader-verification.json`, `deployed.json`, `rollback.sql` (preparado, **no ejecutado**) y `bcp-despues.jpg`. El rollback restaura las funciones originales y retira únicamente el helper/vista nuevos; no borra tablas ni operaciones.

Scripts locales protegidos por proyecto: `scripts/dev-payment-decouple.cjs`, `scripts/dev-payment-concurrency.cjs` y `scripts/dev-payment-readers-verify.cjs`. Los dos primeros hacen pruebas financieras con rollback; no son scripts de producción. No publicar fixtures ni credenciales.

Pendientes antes de producción: estrés sostenido con usuarios/operaciones representativos, escenarios históricos de retención y cierre/reapertura, comisión existente/reversa, conciliación completa y autorización de despliegue. El conflicto sobre una misma caja u operación sigue siendo legítimo y conserva los reintentos existentes.
