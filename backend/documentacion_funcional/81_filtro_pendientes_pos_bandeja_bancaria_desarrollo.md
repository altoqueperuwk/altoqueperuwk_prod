# POS solicitado en filtro Pendientes — desarrollo

Fecha: 21/10/2026. Implementado primero en desarrollo y posteriormente compilado en producción con autorización expresa. Publicación Git de este ajuste preparada de forma acotada; verificar el registro de entrega para confirmar el push.

## Causa

La bandeja bancaria muestra POS con estado real 7/Solicitado como Pendiente. Sin embargo, tanto la RPC unificada como el filtro local del hook comparaban literalmente nombre_estado con Pendiente. La fila desaparecía al filtrar o actualizarla localmente bajo ese filtro.

## Corrección

- `10.retenciones_scotiabank_banbif.sql`: `f_get_tb_operacion_bandeja_unificada` incluye POS Solicitado en el filtro Pendiente, además de las coincidencias literales existentes. POS se reconoce por tipo_servicio POS o ruta_origen pos; solicitado por ID 7 o nombre Solicitado. Se mantienen las restricciones previas de ruta, empresa/cuenta, histórico y eliminados.
- `bancaria-estado-label.ts`: nueva función `matchesBancariaEstadoFilter` para reflejar esa equivalencia en el filtro del cliente. No extiende la equivalencia a solicitudes de pago de deuda ni a otros estados POS.
- `use-bancaria-bandeja.ts`: utiliza el predicado en la selección local y en la actualización de filas.
- Pruebas en `bancaria-estado-label.test.ts` y `use-bancaria-bandeja.test.ts`: pendientes, pagados, todos, normalización, eliminados, rechazados, solicitudes de otros servicios y actualización local de POS solicitado→pagado.

No se cambia el estado real de ninguna operación, la etiqueta visual existente, la firma de la RPC, las reglas de pago ni los KPIs. No se amplía la consulta a Todos para filtrar después: el servidor conserva el filtro acotado.

## Validación ejecutada

- Trece pruebas frontend satisfactorias (predicado, etiqueta y hook).
- Compilación en desarrollo de únicamente la función unificada, reemplazando su cuerpo y preservando OID, firma, permisos, propietario y configuración.
- Comparación previa del cuerpo desplegado contra la versión local sin el ajuste: idénticos; no se arrastraron cambios ajenos.
- Caso real BBVA, empresa 7, cuenta 6: Todos conserva 3 filas, Pagado conserva 1 fila y Pendiente pasa de 1 a 2 filas, incorporando únicamente POS ID 23305.
- Comprobación del conjunto exacto esperado de pendientes y conservación de las filas pendientes previas.
- Sin escrituras en tablas de operaciones/caja, sin ALTER TABLE ni DROP FUNCTION ejecutados. La consulta generadora de DROP al final del SQL es informativa y limitada a la función afectada.
- Sin pruebas DOM en esta entrega; se comprobó el filtro mediante pruebas del hook y la RPC real de desarrollo.

Script de despliegue/validación: `scripts/dev-pos-pendiente-filter.cjs` (conexión limitada a desarrollo). Evidencias: `outputs/pos-pendiente-filter-dev-20261021/`, incluyendo definición anterior y SQL de restauración no ejecutado.

## Homologación productiva autorizada y ejecutada

Se compiló únicamente `f_get_tb_operacion_bandeja_unificada`, conservando firma, retorno, OID, propietario, configuración y permisos. Se verificó que el cuerpo previo productivo coincide con la línea base de desarrollo, salvo el ajuste aprobado. No se ejecutó el archivo SQL completo, que contiene sentencias y funciones fuera del alcance.

En una transacción consistente se compararon Todos, Pendiente y Pagado para once combinaciones empresa/cuenta con POS abiertos en las rutas bancarias (BCP, BBVA, Interbank y BanBif presentes). Todos y Pagado quedaron idénticos en cada combinación. Se verificó el conjunto exacto esperado de pendientes: se incorporaron únicamente seis POS solicitados que antes se omitían (cuatro BCP/Abitex, uno Interbank/empresa 3 y uno Interbank/Impulsa). No se perdieron pendientes existentes. Se comparó además la lectura histórica Todos de BBVA del 20/10/2026, sin diferencias. La definición fue releída y confirmada después de COMMIT.

Sin modificación de operaciones ni movimientos. Se notificó recarga de esquema a PostgREST. No hubo pruebas DOM productivas ni acciones de pago.

Evidencias: `outputs/pos-pendiente-filter-prod-20261021/`, con `before.json`, `rollback.sql` (no ejecutado), `applied.sql` y `deployed.json`. Script: `scripts/prod-pos-pendiente-release.cjs`.

Alcance Git: una función dentro del SQL 10, los cuatro archivos frontend del ajuste y este documento; no incluir el resto de modificaciones locales, SQL SafetyPay ni el plan de políticas de recaudación. Validar pruebas y TypeScript sobre el commit aislado antes de push a develop/main. El despliegue del frontend en Cloudflare debe confirmarse por separado.
