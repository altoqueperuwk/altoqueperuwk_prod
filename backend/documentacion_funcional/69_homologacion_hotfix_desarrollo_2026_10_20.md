# Homologación del hotfix de cajas en desarrollo

## Resultado

Aplicado y verificado exclusivamente en `ouehhtlrcvcixurgonrb` (desarrollo). COMMIT confirmado. No se conectó a producción durante esta intervención. Referencia del hotfix: commit `3fbcd30` y documento 67.

Esta entrega homologa la mitigación urgente, no implementa todavía la corrección estructural completa de la sección 14 del plan 66. NOWAIT y reintentos pueden seguir rechazando una acción si persiste la contención. No se afirma que cualquier deadlock futuro sea imposible.

## Auditoría previa

Las cinco firmas auditadas en desarrollo carecían de las protecciones del hotfix:

| Función | Firmas intervenidas | Cambio puntual |
| --- | --- | --- |
| `f_post_tb_operacion_caja` | 24 argumentos | Bloqueo inicial `FOR UPDATE OF c NOWAIT`, sin bloquear catálogos del JOIN |
| `f_apply_tb_operacion_caja_delta` | 10 argumentos | Rechazo inmediato si la caja ya está bloqueada |
| `f_sync_tb_ruta_operacion_kpi_caja` | 2 argumentos | Advisory lock transaccional por ruta y reserva ordenada NOWAIT de las cajas que su UPDATE ya alcanza |
| `f_sync_tb_ruta_operacion_kpi_operacion` | 2 y 3 argumentos | Misma coordinación por ruta antes de las escrituras del KPI |

Cuatro definiciones coincidían con las copias anteriores al hotfix de producción. La sobrecarga de dos argumentos del KPI tenía una diferencia previa. Se parcheó la definición propia de desarrollo, conservando esa diferencia; no se copió indiscriminadamente el cuerpo productivo ni se sustituyó por el wrapper SQL local.

Las comparaciones con producción usaron los respaldos de la intervención anterior, sin nueva conexión al proyecto productivo. No constituyen una auditoría de toda la configuración actual de ambos proyectos ni homologan automáticamente otros cambios históricos de estados/retenciones.

## Migración reproducible

Archivo: [20261020_homologar_hotfix_bloqueos_desarrollo.sql](../backend_migraciones/20261020_homologar_hotfix_bloqueos_desarrollo.sql).

- Reemplaza solo las instrucciones de bloqueo/coordinación sobre cada definición auditada.
- Comprueba la huella de las definiciones antes y después; rechaza versiones inesperadas en lugar de sobrescribirlas.
- Idempotente: una segunda aplicación reconoce las cinco firmas ya homologadas y no las modifica.
- Conserva OID, argumentos, retornos, permisos, configuraciones propias y expresiones financieras.
- Sin CREATE/ALTER TABLE, índices, DROP ni modificaciones de filas de negocio.
- Incluye NOTIFY de caché y el generador informativo de DROP exigido por la convención; no se ejecutó ningún DROP.
- La conexión del ejecutor tuvo guardas explícitas de host/usuario del proyecto de desarrollo y certificado SSL verificado. Las huellas del SQL protegen versiones; no identifican por sí solas el ambiente. No ejecutar este archivo en producción.

Se ejecutó el archivo en una transacción con `check_function_bodies`, límite de sentencia y espera de lock acotados, comparación optimista de definiciones, verificaciones y COMMIT solo después de pasar las pruebas previas. No se compiló el archivo 05 completo porque contiene trabajo adicional.

## Pruebas y preservación de datos

Nueve comprobaciones de backend aprobadas:

1. Caja inexistente en registro de movimiento conserva su JSON de error.
2. Caja inexistente en delta conserva su excepción P0001.
3. Ruta vacía en sincronización de caja devuelve NULL.
4. Ruta vacía en KPI de dos argumentos devuelve NULL.
5. Ruta vacía en KPI de tres argumentos devuelve NULL.
6. Segunda aplicación de la migración sin cambios de definiciones.
7. Conflicto controlado entre dos sesiones en sincronización de caja devuelve 55P03.
8. Mismo conflicto en KPI de dos argumentos devuelve 55P03.
9. Mismo conflicto en KPI de tres argumentos devuelve 55P03.

Las pruebas básicas usaron savepoints; la prueba de conflicto usó la ruta sintética `__codex_dev_hotfix_probe_20261020__` con dos conexiones y rollback. Se verificó que no quedó KPI para esa ruta. No se usaron operaciones financieras reales para provocar el conflicto.

Se compararon huellas completas de las 700 filas preparadas (600 efectivizaciones + 50 solicitudes + 50 hijas), todas las cajas/KPI y los movimientos relacionados con la preparación. Las huellas anteriores y posteriores coinciden. No hubo pagos, matches, derivaciones ni modificaciones de saldos por esta intervención.

Frontend: `npx vitest run src/lib/rpc-lock-retry.test.ts` aprobó 15 pruebas. El helper y sus integraciones ya estaban presentes en el árbol local; no requirieron otro cambio. Un intento inicial más tres reintentos solo ante 55P03 en las tres RPC permitidas. No se ejecutó `npm run build`.

Los tests de concurrencia anteriores verifican rechazo y rollback del hotfix, no rendimiento, equidad entre usuarios ni que cuatro intentos sean suficientes bajo carga.

## Evidencia y reversión

En `outputs/homologacion-desarrollo-20261020/`:

- `before-functions.json`: definiciones/firmas/ACL anteriores de desarrollo.
- `rollback-functions.sql`: cinco definiciones anteriores, generadas como respaldo; no ejecutado.
- `after-functions.json`: definiciones verificadas después del COMMIT.
- `verification.json`: nueve pruebas, proyecto objetivo y huellas de datos anteriores/posteriores.

Conservar estos respaldos fuera de la carpeta de temporales. Para una reversión futura, comprobar primero que no haya cambios posteriores y restaurar únicamente estas definiciones bajo autorización. No restaurar la base ni borrar las operaciones de prueba.

## Qué falta para resolver el problema de fondo

Continuar con C1/C2 del plan 66 sobre esta base: reproducir las carreras con operaciones distintas que comparten caja/KPI, inventariar todos los escritores, unificar la adquisición temprana de recursos, revisar orden padre/hijo y atomicidad de errores JSON. Después reducir recálculos intermedios y solicitudes duplicadas, medir y conciliar.

La matriz deberá incluir usuarios/sesiones independientes, rutas cruzadas, pagos individuales/lotes y cierres; no atribuir una mejora de velocidad a una prueba que solo demuestra fallo rápido. Las 600 efectivizaciones y 50 solicitudes quedan disponibles sin avanzar su flujo. No se hizo commit/push de esta homologación.

## Ampliación: homologación de las dos consultas _v2 del incidente

Aplicada y confirmada posteriormente, solo en desarrollo:

- `f_get_tb_ruta_operacion_kpi_operaciones_v2`: excluye ID 10 y admite Efectivización con IDs 3/4, manteniendo reglas de otros servicios.
- `f_get_tb_ruta_operacion_gastos_salida_v2`: mismo filtro de elegibilidad, Pagado por ID 4 y conservación de la excepción PROCESADO de Pago Deuda.

Referencia: [despliegue de estados del incidente](43_filtros_estados_operaciones_2026_10_19.md). No pertenecían al commit `3fbcd30`, que recogió el hotfix de bloqueos y el reintento frontend. Sus copias productivas posteriores al parche estaban disponibles en el respaldo local `codex-estados-prod-20261019-patch.json`; no fue necesario conectar a producción.

Las dos definiciones de desarrollo coincidían exactamente con esas copias previas al parche. Se verificó estáticamente que revertir exclusivamente los filtros añadidos y las comparaciones Pagado por ID reconstruye las definiciones anteriores. No se trasladaron cambios ajenos ni se modificaron retenciones, firmas, retornos, OID, ACL o reglas monetarias.

Migración puntual: [20261020_homologar_v2_estados_desarrollo.sql](../backend_migraciones/20261020_homologar_v2_estados_desarrollo.sql). Comprueba huellas antes/después, rechaza definiciones inesperadas y es idempotente. Se ejecutó en una transacción con verificaciones antes de COMMIT y recarga de caché de API. No hay cambios de tablas/índices ni DROP ejecutados; el generador final solo informa.

Siete verificaciones aprobadas: ruta inexistente en cada función, comparación de KPI y gastos antes/después para Hueso y Capital Nova (cuatro comprobaciones), y segunda aplicación sin cambios. Los valores actuales de las empresas preparadas coinciden con la línea base; no se ejecutaron pagos ni mutaciones de estados para probar esos casos. La matriz de estados y el estrés siguen pendientes, por lo que estos resultados no constituyen un benchmark ni una validación completa de los cálculos.

Las huellas de las 700 filas preparadas, cajas, KPI y movimientos relacionados permanecieron iguales. Respaldo previo, reversión de funciones no ejecutada, definiciones posteriores e informe están en `outputs/homologacion-v2-desarrollo-20261020/`.

Alcance explícito: estas dos `_v2`. Las funciones `_v2` de histórico de cierre y ganancias especiales no formaron parte del parche de estados original y no se reemplazaron por esta ampliación. Sin build, commit ni push.
