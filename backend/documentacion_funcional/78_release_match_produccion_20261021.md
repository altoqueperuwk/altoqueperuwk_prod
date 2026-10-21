# Release: concurrencia match Pago Deuda y etiquetas de eliminados

## Base y alcance

Base remota verificada: `d9ebb71545129aa3dc27baa04d4b84ea77edde54`, común a develop/main. El release incorpora la corrección de concurrencia probada el 21/10 y los pendientes puntuales anteriores: etiqueta Eliminado y versionado del hotfix de bandeja POS. No incluye compensaciones, permisos, reportes, cambios de dependencias ni otros cambios locales. El checkout ordinario y su índice se preservan; la preparación usa un índice alternativo.

## Producción

Compiladas únicamente estas seis funciones, en una transacción con lock_timeout de despliegue y sin ejecutar archivos SQL completos:

- `f_lock_tb_cajas_operativas(bigint[])` (nueva, interna).
- `f_lock_tb_pago_deuda_familia(bigint,bigint)` (nueva, interna).
- `f_patch_tb_pago_deuda_match`.
- `f_patch_tb_pago_deuda_salida`.
- `f_patch_tb_pago_deuda_pagado`.
- `f_post_tb_operacion_caja_desde_proceso`.

Backup antes del cambio; base productiva idéntica a los cuerpos anteriores usados en la regresión de desarrollo. Preservados OIDs, firmas, retorno, propietario, ACL, SECURITY DEFINER y proconfig de las cuatro funciones existentes. Auxiliares sin EXECUTE para PUBLIC, anon y authenticated. COMMIT confirmado y NOTIFY pgrst reload schema. Seis definiciones verificadas de nuevo después del despliegue. Smoke de lectura de cinco rutas bancarias correcto; no se ejecutaron pagos, matches ni pruebas financieras en producción. No hubo ALTER TABLE, DROP COLUMN ni ejecución de DROP FUNCTION.

`f_get_tb_operacion_asistida_bandeja` se incluye en Git para cerrar el hotfix anterior, pero no se recompiló en este release: su definición productiva actual se leyó y coincidió con el cuerpo esperado 3/4/7, con consulta explícita de 10.

## Frontend y comprobaciones

- Reintentos solo ante 55P03 también para match y transferencia de deuda; cuatro intentos totales, sin reintento de red o errores de negocio.
- Estado Eliminado en tabla bancaria (ID 10), manteniendo Pendiente para POS Solicitado.
- SQL canónico reconstruido desde la base Git remota y las seis definiciones productivas desplegadas, no desde archivos locales completos con trabajo ajeno.
- Validación de tests dirigidos y TypeScript sobre un archivo Git limpio del commit preparado, sin build frontend.
- Push previsto a las dos ramas en una única operación atómica, sin force y solo si ambas conservan la base esperada. El resultado de Git queda en evidencia local del release y en el resumen entregado al usuario. No confundir push con confirmación de despliegue Cloudflare.

## Evidencia y límites

`outputs/match-release-prod-20261021/`: before.json, rollback.sql no ejecutado, audit.json, candidates.json, deploy.sql, deployed.json, post.json, assisted-current.json y evidencia de Git/validación/publicación. No se versionan credenciales, archivos de configuración privada, certificados, snapshots de datos ni estos outputs.

Pruebas financieras de desarrollo y detalles en documento 77: diez matches confirmados, dos trabajadores, cinco por empresa, sin duplicados ni pérdida de acumulados; 23 tests frontend dirigidos y TypeScript correctos. Esto no garantiza ausencia de todo conflicto futuro ni sustituye stress sostenido/cierres concurrentes. Los conflictos persistentes siguen abortando y requieren reintento; nunca se fuerza un pago artificial.
