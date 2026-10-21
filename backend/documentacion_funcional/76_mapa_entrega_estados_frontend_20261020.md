# Mapa de entrega posterior al release de rendimiento

> Homologación posterior autorizada 21/10/2026: las seis funciones de concurrencia del documento 77 ya se compilaron en producción. La entrega Git se prepara sobre la base remota con SQL canónico y solo los cambios de este hilo; el alcance de seis archivos descrito abajo es histórico.

> Actualización 21/10/2026: se implementó posteriormente la corrección de concurrencia de match en **desarrollo**. El alcance de seis archivos de este manifiesto es histórico e insuficiente para la próxima entrega. Incorporar el manifiesto técnico y las seis funciones del documento `77_match_pago_deuda_concurrencia_desarrollo_20261021.md`, además de `rpc-lock-retry.ts` y su test. Esas nuevas funciones aún NO están desplegadas en producción. Ningún push se ejecutó.

## Base verificada

`git ls-remote` del 20/10/2026: develop y main apuntan a `d9ebb71545129aa3dc27baa04d4b84ea77edde54`. Es la base de comparación, no el HEAD local `35bddd0`. El release de rendimiento de 20 archivos ya está publicado en ambas ramas; sus 13 firmas SQL ya fueron compiladas en producción según las evidencias del release.

El checkout tiene numerosos cambios anteriores/ajenos. No usar `git add .` ni incluir todo lo marcado en `git status`. El HEAD local no se avanzó durante el release anterior para preservar ese trabajo: archivos publicados pueden seguir apareciendo modificados o untracked localmente.

## Archivos que incluir en la siguiente entrega de este hilo

| Archivo | Cambio | Verificación |
|---|---|---|
| `src/features/operaciones/efectivizacion/bancaria/components/bancaria-efectivizacion-table.tsx` | Usar etiqueta compartida en ambas presentaciones de celda Estado | Diff frente a d9ebb715: solo import y dos sustituciones |
| `src/features/operaciones/efectivizacion/bancaria/utils/bancaria-estado-label.ts` | Mostrar Eliminado para ID 10/nombre Eliminado; conservar Pagado y Pendiente incluido POS Solicitado | Nuevo |
| `src/features/operaciones/efectivizacion/bancaria/utils/bancaria-estado-label.test.ts` | Seis casos, incluyendo estado 7 y prioridad del ID 10 | Seis tests pasan |
| `backend/backend_implementacion/11.operaciones_asistidas_pos_linkpago.sql` | Homologar en Git la bandeja asistida que incluye estados 3/4/7 y consulta explícita de 10 | Hotfix ya compilado en producción, ver abajo |
| `backend/documentacion_funcional/75_validacion_estados_dom_desarrollo_20261020.md` | Matriz de estados, conciliación y rectificación: POS Pendiente es válido; Eliminado corregido | Documentación, no despliegue |
| `backend/documentacion_funcional/76_mapa_entrega_estados_frontend_20261020.md` | Este manifiesto | Documentación, no despliegue |

Total propuesto: seis archivos (tres frontend incluyendo test, un SQL y dos documentos).

## SQL y compilación en producción

Única función SQL pendiente de versionar dentro de este alcance:

- Archivo `11.operaciones_asistidas_pos_linkpago.sql`.
- Función `f_get_tb_operacion_asistida_bandeja`.
- Admite activos 3 Pendiente, 4 Pagado, 7 Solicitado; 10 Eliminado únicamente cuando se solicita ese filtro. Filtra por IDs para esos cuatro estados. Sin cambios de firma request/response, tablas ni operaciones.
- El generador final de DROP se limita a esta función; genera texto, no debe ejecutarse el DROP.
- **Ya compilada en producción durante el hotfix POS anterior**, después del commit d9ebb715. Evidencia `outputs/pos-solicitado-fix-20261020/verification.json`: committed true, ocho verificaciones, operación 68670 recuperada por Todos/Solicitado y confirmada tras commit.
- Para este próximo release no hay nueva compilación SQL requerida por el ajuste visual. Antes de desplegar, verificar que la definición productiva no haya cambiado desde el hotfix. Si hay deriva, revisar; no recompilar todo el archivo a ciegas.
- No se modificó SQL para conciliar los KPI ni para la etiqueta Eliminado.

## Exclusiones

- No volver a incluir rendimiento, virtualización ni reintentos ya publicados.
- No incluir modificaciones locales residuales de 03/05/10 SQL: el release anterior usó definiciones canónicas basadas en producción y conservó configuración/seguridad. Los archivos locales no son automáticamente la versión que debe desplegarse.
- Excluir compensaciones, autenticación/permisos, reportes, cambios de paquetes y otros pendientes ajenos a este ajuste.
- Scripts de auditoría `dev-state-dom-audit.cjs` y `dev-state-id-verify.cjs` son utilidades locales con rutas específicas de esta máquina; no son necesarios para el producto. No versionar en esta entrega.
- Excluir `outputs/`, `output/`, capturas y fixtures con datos de pruebas, `.env*`, credenciales, certificados y copias SQL productivas.

## Secuencia de entrega preparada, no ejecutada

1. Reconfirmar que ambas ramas remotas siguen en la base indicada.
2. Preparar un commit aislado sobre esa base con solo estos seis archivos; preservar el checkout y su índice ordinario si sigue sucio.
3. Verificar el diff y ejecutar tests dirigidos + `tsc -p tsconfig.app.json --noEmit` sobre el contenido a publicar; no hacer build sin solicitud.
4. Cuando el usuario autorice el push, actualizar develop y main sin force; si las bases divergen, reevaluar antes de publicar.
5. Verificar que ambos refs contienen el commit y confirmar el resultado del despliegue frontend. La publicación Git no prueba por sí sola que Cloudflare terminó.

Esta tarea únicamente inventaría/prepara la entrega: no creó commit, no hizo push y no ejecutó compilación en producción.
