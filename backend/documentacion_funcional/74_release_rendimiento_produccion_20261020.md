# Release de rendimiento — producción — 20/10/2026

## Resultado SQL

Proyecto: `hyckmismfektoypudzar`, conexión PostgreSQL con certificado validado. COMMIT confirmado: doce firmas existentes actualizadas y un helper nuevo (trece firmas, doce nombres), más `v_ruta_operacion_metadata`. NOTIFY de recarga de esquema PostgREST enviado. No se ejecutaron pagos, cambios de estados, eliminaciones, ALTER TABLE, índices ni DROP durante el despliegue.

Se respaldaron las definiciones de producción antes de preparar el paquete. El despliegue usó esas definiciones como base y sustituyó solamente los cuerpos correspondientes a las mejoras probadas. Se verificaron OID, argumentos, tipo de retorno, ACL, SECURITY DEFINER y proconfig. Se conservaron los filtros de estados existentes; esta entrega no implementa su retirada ni un nuevo mapa de estados.

La sobrecarga de dos argumentos de `f_sync_tb_ruta_operacion_kpi_operacion` era PL/pgSQL en producción, no SQL como el wrapper local. Se adaptó el wrapper preservando su lenguaje y configuración de producción. Los primeros ensayos detectaron esa diferencia y se revirtieron; el paquete final pasó todas las comprobaciones antes del COMMIT. Se conservaron los statement_timeout específicos existentes, incluidos los de diez minutos: no se estableció un timeout global nuevo.

## Funciones publicadas

`03.operacion_proceso_y_excel.sql`:

- `f_patch_tb_operacion_proceso_pagado_lote`: normalización de las cajas afectadas, sin sincronización global bancaria al finalizar el lote.

También se publica, debajo de la definición de su tabla, el DDL de los índices de relaciones `idx_tb_operacion_proceso_padre` y `idx_tb_operacion_proceso_match`, cuya existencia se confirmó en producción. No se crearon durante esta entrega. Sus CREATE INDEX CONCURRENTLY IF NOT EXISTS se ejecutan fuera de una transacción si se necesita reproducirlos en otro entorno.

`05.ruta_operacion_y_cajas.sql`:

- `f_get_tb_ruta_operacion_kpi`: compatibilidad con lectura v2 para bancos migrados.
- `f_get_tb_ruta_operacion_kpi_operaciones_v2`: metadatos mediante la vista dedicada.
- `f_get_tb_ruta_operacion_gastos_salida_v2`: materialización del contexto de cajas.
- `f_sync_tb_ruta_operacion_kpi_operacion`: ambas firmas; sin escritura del resumen global en bancos con metadatos existentes.
- `f_sync_tb_caja_operativa_despues_movimiento`: helper interno, caja afectada únicamente; ejecución revocada a PUBLIC/anon/authenticated.
- `f_post_tb_operacion_caja`, `f_apply_tb_operacion_caja_delta`, `f_post_tb_operacion_caja_desde_proceso`: conservan los saldos/movimientos y llaman al helper acotado.

`10.retenciones_scotiabank_banbif.sql`:

- `f_get_tb_operacion_bandeja_unificada`: ordenamiento antes de expandir a JSON.
- `f_get_tb_operacion_retencion_bandeja_badges`: proyección reducida de columnas.
- `f_get_tb_operacion_retencion_empresa_badges`: proyección reducida de columnas.

Los SQL publicados se construyeron a partir de origin/main y las definiciones de este despliegue, sin copiar cambios adicionales de los archivos sucios del checkout. Las consultas generadoras de DROP al final solo enumeran las funciones afectadas; no ejecutan DROP.

## Verificación

- Treinta comprobaciones en una misma transacción REPEATABLE READ de producción: veinte lecturas de bandejas/contadores/gastos, cinco KPI v2 antes/después y cinco comprobaciones de compatibilidad lector antiguo/v2. Todas iguales en cantidad/hash. Se revirtieron los ensayos; no hubo pagos de prueba en producción.
- Tras el COMMIT: definiciones/contratos/permisos/configuración comprobados y captura de pg_stat_activity con cero sesiones bloqueadas. Es una captura, no una garantía de ausencia futura de contención.
- Comprobación posterior al COMMIT: lectores antiguo/v2 equivalentes en los cinco bancos y nueva captura sin sesiones bloqueadas.
- Copia limpia del commit preparado: veintiocho pruebas dirigidas aprobadas y `tsc --noEmit` sin errores. No se ejecutó npm run build.
- El fallo ya documentado de la batería ampliada en `action-rules.test.ts:34` no forma parte de esta modificación; no se cambió su regla de negocio.

El estrés de pagos y las regresiones financieras descritas en 72 se ejecutaron solo en desarrollo y con ROLLBACK. No se repitieron contra operaciones de clientes en producción.

## Frontend y Git

Se incluyen el cuerpo virtualizado aislado/memorizado, callbacks y mediciones estables, margen adicional acotado, reutilización de badges y sus pruebas. El módulo de diagnóstico se conserva desactivado por defecto y restringido a desarrollo/localhost/proyecto de desarrollo. No se publican credenciales, configuración de entorno, logs con datos, capturas, fixtures, scripts locales de carga, dependencias modificadas ni cambios ajenos de compensaciones/permisos/reportes.

La publicación se prepara con un índice Git separado para conservar el checkout y su staging. Las dos ramas remotas se actualizan juntas con push atómico y sin force. El manifiesto local de release identifica el commit exacto y sus archivos. La confirmación de push no equivale a confirmar que Cloudflare terminó de desplegar el frontend.

## Evidencias y recuperación

Carpeta local no publicada: `outputs/performance-release-prod-20261020/`. Contiene respaldo previo, SQL aplicado, rollback sin ejecutar, comprobaciones, manifiesto y resultados de validación. El rollback restaura las doce firmas existentes y retira únicamente el helper y la vista nuevos; no elimina tablas ni operaciones. Las credenciales no se guardan en esos artefactos.

Para cualquier cambio adicional de estados, cierres o contratos, preparar otra entrega con pruebas específicas. Los bloqueos legítimos de la misma operación/caja y los reintentos 55P03 se mantienen.
