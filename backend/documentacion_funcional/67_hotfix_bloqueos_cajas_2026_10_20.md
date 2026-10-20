# Hotfix urgente de bloqueos de cajas — 20/10/2026 UTC

## Estado

Desplegado en producción, proyecto `hyckmismfektoypudzar`. COMMIT confirmado. No se ingresó a desarrollo. No hubo cambios de frontend, commit/push, cambios de tablas, índices ni DROP ejecutados. No se cancelaron ni terminaron sesiones de usuarios.

Alcance: mitigación de los ciclos documentados en el log; no equivale a completar el plan de rendimiento ni garantiza ausencia de cualquier bloqueo en otros caminos.

## Evidencia que motivó el parche

El JSON detallado aportado contiene 117 eventos: 103 errores 55P03, nueve 40P01 y cinco 57014. En 95 eventos la RPC externa era `f_patch_tb_pago_deuda_pagado`; un deadlock también involucra `f_patch_tb_operacion_proceso_pagado_lote`.

- `f_post_tb_operacion_caja` usa un JOIN de caja, empresa, cuenta y banco. Su FOR UPDATE sin OF bloqueaba también catálogos; cuatro contextos de deadlock mencionan explícitamente `tb_empresa`.
- `f_sync_tb_ruta_operacion_kpi_caja` actualiza varias cajas de una ruta. Los llamadores pueden haber bloqueado previamente cajas distintas; esperar las restantes puede formar un ciclo.
- INSERT/ON CONFLICT y UPDATE de `tb_ruta_operacion_kpi` también aparecen en contextos de espera.

## Funciones modificadas

Archivo fuente: `backend/backend_implementacion/05.ruta_operacion_y_cajas.sql`.

1. `f_post_tb_operacion_caja`: únicamente `FOR UPDATE` del SELECT inicial pasa a `FOR UPDATE OF c NOWAIT`. Conserva el bloqueo de saldo, excluye los catálogos del bloqueo de actualización y rechaza la caja ocupada sin espera.
2. `f_apply_tb_operacion_caja_delta`: mismo rechazo inmediato en el bloqueo inicial de la caja, sin tocar fórmulas ni factores.
3. `f_sync_tb_ruta_operacion_kpi_caja`: coordinación por ruta mediante `pg_try_advisory_xact_lock(1096043344, hashtext(lower(btrim(p_ruta))))`; antes de INSERT/UPDATE reserva las cajas activas ya incluidas en su UPDATE original, ordenadas por ID y con `FOR UPDATE OF c NOWAIT`.
4. `f_sync_tb_ruta_operacion_kpi_operacion`: misma coordinación por ruta, antes del catálogo de estados/INSERT/UPDATE. Se reemplazaron sus dos firmas reales de producción (dos y tres argumentos), preservando cada implementación previa.

La coordinación es transaccional, no una bandera persistente. Una llamada anidada en la misma sesión/transacción puede adquirirla nuevamente. Si otra transacción ocupa esa ruta se levanta SQLSTATE 55P03 con mensaje explícito de reintento. No se omite la sincronización ni se devuelve éxito con saldos sin recalcular.

El código local tiene una diferencia preexistente frente a producción: la firma de dos argumentos del KPI de operación ya es un wrapper SQL hacia la de tres argumentos. Se conservó ese wrapper local sin modificar, puesto que la implementación de tres argumentos queda protegida. No se trasladó ese cambio de arquitectura a producción; cada definición productiva se parcheó sobre su propia copia.

## Semántica y limitaciones operativas

- Las firmas, nombres/valores por defecto de parámetros, retornos y ACL se comprobaron contra `pg_proc` antes de COMMIT; permanecen iguales.
- Se comprobó estáticamente que quitar las instrucciones nuevas de coordinación y revertir los dos cambios de bloqueo reconstruye exactamente cada definición previa normalizada. No se editaron expresiones financieras, estados, fechas, comisiones o retornos.
- En las rutas de pago verificadas, una excepción de conflicto propaga el error y revierte la transacción. El usuario debe reintentar; este parche no instala reintentos automáticos.
- Este comportamiento puede aumentar los rechazos rápidos 55P03 durante competencia intensa: reduce la espera en los puntos intervenidos, no convierte todas las escrituras simultáneas en exitosas.
- No se garantiza que una importación tenga siempre la misma atomicidad que un pago individual: se conserva el manejo de excepciones propio de cada llamador. Revisar el resultado del lote antes de reimportar.
- Una operación que ya estaba pendiente no se marca pagada si la transacción falla; no se revierte una operación pagada previamente y confirmada.
- Los bloqueos de operación, movimientos, cierres u otros escritores no intervenidos pueden seguir esperando. No se retiraron los FOR UPDATE necesarios para integridad ni se aumentaron timeouts globales.
- No es una serialización completa al comienzo de todas las RPC financieras. La protección de sincronización usa try-lock/NOWAIT precisamente porque puede ejecutarse después de bloqueos adquiridos por el llamador.
- Al ser cambios de funciones, una llamada ya iniciada puede mantener código/bloqueos anteriores hasta terminar. En la muestra posterior al despliegue no había sesiones PostgREST activas o idle in transaction.

## Seguridad del despliegue

1. Conexión PostgreSQL a producción con certificado SSL verificado; sin exponer claves en archivos nuevos.
2. Respaldo previo fuera del repositorio de las definiciones/firmas/ACL reales.
3. Parche construido exclusivamente sobre esas definiciones; los SQL locales contienen cambios ajenos no desplegados por esta intervención.
4. Comparación optimista de cada definición vigente antes de reemplazarla: abortar si otro proceso la hubiera cambiado.
5. Cinco CREATE OR REPLACE FUNCTION dentro de una sola transacción con check_function_bodies habilitado y tiempos de espera de despliegue acotados.
6. Verificación de OID, argumentos, resultado, ACL y definición después del reemplazo.
7. Pruebas de entradas inválidas/vacías con SAVEPOINT/ROLLBACK TO; después COMMIT y NOTIFY de caché de API en la misma transacción.

El primer intento de verificación se revirtió completamente porque el literal de ID mínimo de la prueba produjo 22003; se sustituyó por un ID negativo comprobado inexistente. No quedó un despliegue parcial. El segundo intento pasó y confirmó el COMMIT.

## Pruebas realizadas

### Antes de COMMIT, sin escritura de filas de negocio

- Caja inexistente en `f_post_tb_operacion_caja`: conserva JSON de error «La caja no existe.».
- Caja inexistente en `f_apply_tb_operacion_caja_delta`: conserva excepción P0001.
- Ruta vacía en sincronización de caja: NULL, sin insertar ni actualizar.
- Ruta vacía en las dos firmas de sincronización de operación: NULL, sin insertar ni actualizar.

### Después de COMMIT, concurrencia controlada sin usar cajas reales

- Una sesión retuvo el advisory lock de la ruta sintética `__codex_hotfix_probe_20261020__`.
- Otra sesión llamó a las tres firmas de sincronización; las tres rechazaron el conflicto con 55P03 antes de ejecutar escrituras.
- Se hicieron ROLLBACK y cierre de las conexiones de prueba; se confirmó que no existe una fila de KPI con esa ruta sintética.
- Aplicaciones de las conexiones de prueba: `codex_deadlock_lock_probe` y `codex_deadlock_conflict_probe`. Sus errores esperados no deben confundirse con fallos de usuarios reales.

Resultado: cinco pruebas básicas y tres pruebas de conflicto pasadas. No se ejecutaron pagos reales, importaciones ni pruebas de carga. Queda pendiente validar saldos con un caso funcional real y observar si los deadlocks de los usuarios disminuyen bajo carga normal.

## Verificación inmediata

La consulta de `pg_stat_activity` posterior al despliegue, filtrada por PostgREST y estados active/idle in transaction, devolvió cero filas. Es una captura del momento; no prueba ausencia de errores posteriores ni rendimiento bajo carga.

## Respaldo y reversión

Archivos locales fuera del repositorio:

- `C:/Users/Lenovo/AppData/Local/Temp/codex-deadlock-prod-20261020-rollback.sql`: cinco definiciones originales para restauración.
- `C:/Users/Lenovo/AppData/Local/Temp/codex-deadlock-prod-20261020-before.json`: snapshot comprimido de funciones operativas para análisis.
- `C:/Users/Lenovo/AppData/Local/Temp/codex-deadlock-prod-20261020-sync-before.json`: snapshot comprimido de las sincronizaciones.
- `C:/Users/Lenovo/AppData/Local/Temp/codex-deadlock-prod-20261020-patch.json`: definiciones anteriores/nuevas y metadatos usados en el despliegue.

Los archivos temporales no son un respaldo duradero de migración; conservarlos de forma segura antes de una limpieza del sistema. Para rollback, revisar que no existan cambios posteriores y ejecutar únicamente esas cinco definiciones originales en una transacción, con autorización. Los advisory locks adquiridos se liberan al terminar sus transacciones.

El generador de DROP al final del SQL fuente enumera las funciones afectadas. No se ejecutó ningún DROP. No ejecutar el archivo 05 completo para reproducir el parche: incluye trabajo ajeno.

## Siguiente paso

Con uso normal, revisar errores de usuarios posteriores al COMMIT y distinguir espera, rechazo rápido y deadlock. Si continúan ciclos, capturar DETAIL/CONTEXT nuevamente para intervenir el camino concreto, no aplicar más bloqueos globales a ciegas. Mantener separado el plan 66 de rendimiento y la futura mejora de coordinación temprana/recálculos; este hotfix no los reemplaza.
