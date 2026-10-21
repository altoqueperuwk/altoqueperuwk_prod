# Match Pago Deuda: corrección y pruebas de concurrencia en desarrollo

## Homologación autorizada a producción — 21/10/2026

Posteriormente el usuario autorizó compilar en producción y publicar los cambios puntuales en develop/main. Las seis funciones se compilaron y se confirmó COMMIT. Los cuerpos de las cuatro funciones productivas anteriores coincidían exactamente con la base probada en desarrollo. Se conservaron OID, argumentos, retorno, propietario, SECURITY DEFINER, ACL y proconfig. Los dos auxiliares nuevos quedaron internos (anon/authenticated sin EXECUTE). Consultas KPI de lectura correctas en bcp, interbank, scotiabank, bbva y banbif; se notificó recarga de esquema PostgREST. Verificación posterior de las seis definiciones y del hotfix POS previo correcta. No se ejecutaron matches, pagos, fixtures ni pruebas financieras en producción. Evidencias locales: `outputs/match-release-prod-20261021/` (backup, rollback no ejecutado, candidatos, despliegue y verificación). Las secciones siguientes describen el trabajo previo en desarrollo y sus límites.

## Entorno y límites

Aplicado exclusivamente al proyecto `ouehhtlrcvcixurgonrb` (desarrollo). Frontend local `127.0.0.1:5173/operaciones/bbva`. Sin acceso ni despliegue a producción; sin commit/push ni build frontend. No hay ALTER TABLE, DROP COLUMN ni ejecución de DROP FUNCTION. Dos funciones auxiliares internas nuevas con EXECUTE revocado a PUBLIC, anon y authenticated.

Los matches solicitados sí se confirmaron en desarrollo: diez operaciones preparadas por el usuario, cinco en A Cuenta WK S.A. (empresa 7, cuenta 6, caja 3) y cinco en Abitex S.A. (empresa 12, cuenta 36, caja 35). No se confirmó el pago final de comisiones; se mantiene la etapa Devuelto tras el match. Los ensayos adicionales de pago/transferencia/legacy/error se revirtieron.

## Diagnóstico del adjunto

151 eventos en el JSON; 146 con el mensaje exacto `could not obtain lock on row in relation "tb_caja_operativa"`: match 28, confirmación Pago Deuda 114, importador 1, sincronización global de cajas 3. Son intentos, no operaciones distintas. Los 28 matches fallan en f_post_tb_operacion_caja -> FOR UPDATE OF c NOWAIT, llamado por f_post_tb_operacion_caja_desde_proceso. Los logs no identifican al titular del bloqueo ni el id_caja del evento; no prueban que todos correspondan a BBVA.

## Implementación

### 04.pago_deuda.sql

- `f_lock_tb_pago_deuda_familia(bigint,bigint)`: auxiliar privado. Reserva solicitud raíz, hijos bancarios y retorno indicado en orden ascendente de ID, con espera de lock acotada a 1500 ms por adquisición. El SET de función restaura la configuración al salir. No serializa toda la ruta.
- `f_patch_tb_pago_deuda_match`: reserva familia antes de leer el acumulado; misma efectivización y misma deuda mantienen respuesta idempotente. Reserva caja(s) afectada(s) antes de escribir; rama con ingreso previo usa sincronización por caja, no recálculo de todas las cajas de la ruta. Un error JSON interno posterior a las escrituras se eleva como excepción para no confirmar cambios parciales.
- `f_patch_tb_pago_deuda_salida`: mismo orden de familia; pre-reserva las cajas vieja/nueva afectadas con espera acotada. Propaga como excepción el fallo interno posterior a mutación.
- `f_patch_tb_pago_deuda_pagado`: mismo orden de familia y de cajas de salida/comisión, incluyendo movimientos previos abiertos. Propaga errores internos para rollback del statement completo.

### 05.ruta_operacion_y_cajas.sql

- `f_lock_tb_cajas_operativas(bigint[])`: auxiliar privado, cajas ordenadas por ID y espera de lock de 1500 ms por adquisición. Los NOWAIT internos existentes no se retiraron globalmente; en este flujo operan sobre cajas ya reservadas.
- `f_post_tb_operacion_caja_desde_proceso`: si una SALIDA PAGO_DEUDA existente permanece en la misma caja, con monto/gasto/contador iguales, no revierte ni reaplica dinero al confirmar Procesado -> Pagado. Conserva los saldos históricos del movimiento y actualiza los metadatos comunes. Los casos con diferencias financieras conservan la ruta de diferencias/reversa anterior.

No cambian argumentos ni tipos de retorno de las RPC existentes. Sí cambia intencionalmente el canal de fallo interno tras mutaciones: error PostgreSQL P0001 en vez de JSON exitoso con escrituras parciales. Conflictos de lock siguen como 55P03, sin captura que los convierta a éxito.

### Frontend

`src/lib/rpc-lock-retry.ts` incluye ahora match y salida de deuda entre las RPC autorizadas a reintentar 55P03. Un intento inicial más tres reintentos, esperas 750/1500/3000 ms + jitter existente. No se reintentan red, 57014, 40P01 ni errores de negocio JSON/P0001. Sin cambios de formularios, firma o ruta de usuario.

## Matches confirmados

| Empresa | Efectivización -> deuda bancaria |
|---|---|
| A Cuenta WK | 23309 -> 23320; 23310 -> 23322; 23311 -> 23324; 23312 -> 23326; 23313 -> 23328 |
| Abitex | 23314 -> 23330; 23315 -> 23332; 23316 -> 23334; 23317 -> 23338; 23318 -> 23336 |

Cada retorno es S/5,000: S/25,000 por empresa, S/50,000 total. Verificación por IDs de raíz, hija y retorno: monto_devuelto correcto; una sola fila PAGO_DEUDA_DEVOLUCION por retorno; diferencia de saldo de caja igual al ingreso confirmado; incremento de contador igual a cinco; repetir cada match no altera dinero ni acumulados.

La concurrencia real se ejecutó invocando las mismas funciones PostgreSQL mediante dos conexiones independientes, una por empresa, no con dos clics DOM. Se iniciaron los dos trabajadores juntos y cada uno procesó sus cinco operaciones. Todos los diez finalizaron al primer intento, sin 55P03/40P01, entre 318 y 330 ms por transacción incluyendo ida/vuelta y commit en este ensayo. No representa p95 de producción.

El intento inicial de abrir diez conexiones adicionales alcanzó EMAXCONNSESSION (pool_size 15) antes de lanzar matches. Se cerró únicamente el proceso de prueba y se reemplazó por dos conexiones; no se aumentó el pool ni se mataron sesiones ajenas.

## Ensayos adicionales

- Comparación financiera antes/después de un match nuevo en cada empresa: misma salida de negocio, estados, movimientos y acumulados; rollback completo.
- A mantiene su match sin COMMIT y B termina en 145 ms: evidencia de independencia entre las cajas, no solo peticiones que accidentalmente no se superponen.
- Misma caja/diferentes deudas: segundo match espera; al liberar el primero después de 300 ms, termina correctamente (422 ms observados incluyendo red).
- Caja ocupada persistentemente: devuelve 55P03 (~1707 ms con red), sin efectos financieros parciales.
- Misma pareja concurrente + repetición: una sola devolución. El primer ensayo mantiene y revierte A; B continúa al liberarse la familia.
- Comparación financiera de confirmación Pago Deuda contra definiciones anteriores: igual, con rollback.
- Confirmación de pago mantiene caja; repetición de transferencia de otra deuda espera y finaliza al liberarla (530 ms en ensayo final); rollback de ambos.
- Rama legacy con ingreso existente: reutiliza la fila sin duplicación y mantiene resultado financiero anterior; fixture transaccional -92121001 eliminado por ROLLBACK.
- Error interno de match sin cuenta de ingreso: P0001 y fingerprint íntegro igual después de ROLLBACK TO SAVEPOINT; no persisten acumulados parciales.
- Fingerprints de operaciones, cajas y movimientos iguales antes/después de todos los ensayos con rollback. Las secuencias de identidad pueden avanzar durante ensayos revertidos; no implican filas financieras persistidas.
- 23 tests frontend dirigidos correctos; `tsc -p tsconfig.app.json --noEmit` correcto.
- DOM tras refrescar: cinco nuevas filas Devuelto en cada empresa; Abitex Movimientos muestra cinco Transferidos y cinco Devoluciones. Las operaciones ya no están en Efectivización TC.

## Evidencias locales

`outputs/match-concurrency-dev-20261021/`: before-functions.json y rollback.sql (no ejecutado), deployed.json, pairs-before.json, rollback-tests.json, extra-tests.json, committed-matches.json, post-commit-verification.json, boxes-before-commit.json y capturas DOM WK/Abitex. No publicar datos de prueba indiscriminadamente.

Scripts: `scripts/dev-match-concurrency.cjs`, `scripts/dev-match-concurrency-tests.cjs`, `scripts/dev-match-extra-tests.cjs`. Guardas de proyecto y TLS, sin credenciales en código. El runner de matches se niega a repetir la etapa confirmada si existe committed-matches.json; no borrarlo para forzar otra ejecución.

## Entrega futura y pruebas pendientes

El manifiesto 76 ya no basta para la siguiente entrega: añadir estos cambios acotados de 04/05 SQL y rpc-lock-retry.ts/.test.ts. Preparar diff desde la base remota sin incluir otros cambios locales de esos SQL. Compilar solo las seis funciones de este documento, auxiliares antes que consumidoras; conservar permisos/configuración productivos y no ejecutar el archivo completo ni los DROP generados. Requiere autorización explícita para producción y push.

Este ensayo no certifica stress sostenido, devoluciones parciales distintas concurrentes confirmadas sobre una misma deuda, cierres simultáneos, todos los perfiles ni todos los flujos de reubicación/reversión. Los locks legítimos sobre una misma caja permanecen: si otro proceso mantiene el lock más tiempo que la espera/reintentos, la operación debe fallar con rollback, no forzar éxito.
