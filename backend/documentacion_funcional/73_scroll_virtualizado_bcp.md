# Scroll virtualizado BCP — 20/10/2026

Alcance: frontend de desarrollo, sin SQL, cambios de datos financieros, build ni publicación. Se conserva la virtualización y el desplazamiento continuo, sin imponer paginación.

## Cambios

- `use-virtual-table-rows.ts`: callbacks de claves, estimación, elemento de scroll y observación de offset estables. Se elimina la medición/reinyección del offset en cada render; la posición de la tabla se mide al montar/cambiar datos y ante cambios de tamaño observados en tbody/ancestros/ventana. Se liberan observadores al desmontar.
- Margen adicional de unas dos pantallas, limitado a **12–32 filas por extremo** (24 por defecto antes de conocer la altura). Para viewport de 805 px y estimación de 64 px resultan 26 filas extra por extremo.
- Nuevo `VirtualTableBody`: aloja las actualizaciones de rango/medición. El scroll no fuerza por ese motivo la reconstrucción del componente padre con reglas, formularios y modales.
- Filas con React.memo y comparación estándar de props: filas solapadas conservan su render al cambiar el rango. Cambios de fila, índice o callback del padre invalidan la memoización, conservando datos/acciones actualizados. No se usa un comparador que ignore selección, permisos o cambios de controles.
- Integración en `bancaria-efectivizacion-table.tsx` y `operation-table.tsx`; se mantienen las ramas de carga, vacío, animación/paginación no virtualizadas y las celdas/acciones existentes.

## Pruebas automatizadas

24 pruebas dirigidas aprobadas: cuerpo virtualizado, hook, badges y reintentos. Casos nuevos: reutilización de filas solapadas, actualización de datos/callbacks sin cierres obsoletos, ramas no virtualizada/carga/vacío, límites del margen, estabilidad de callbacks, medición de layout no repetida por render y limpieza de observadores.

TypeScript `npx tsc --noEmit -p tsconfig.app.json` sin errores. No se ejecutó npm run build.

La batería ampliada del directorio shared y badges devolvió **39 aprobadas y 1 fallida**: `action-rules.test.ts:34`, expectativa de deshabilitación de “Emp. Salida” en POS. Este test importa únicamente `action-rules.ts`; ni la regla ni su test fueron modificados en esta tarea y no presentan diff respecto de HEAD. No se cambió esa regla de negocio para hacer pasar la batería.

## DOM de desarrollo

BCP con 800 operaciones Hueso, después de esperar a que cargaran las filas:

- 8 puntos muestreados tras desplazamientos PageDown/PageUp y saltos al final/inicio; 0 px de hueco detectado en la intersección visible del cuerpo y las filas reales en esas muestras.
- En la zona de datos se observaron entre 50 y 66 filas montadas en varias muestras, no 800. Al inicio, fuera de la zona visible de datos, 27 filas preparadas. Al final se confirmó el último índice 799.
- Se seleccionó la operación 22802, se comprobó que su fila se desmontara al ir al final y que regresara seleccionada al volver. Se desmarcó después. No se pagó, editó ni eliminó ninguna operación.
- No aparecieron consultas adicionales de operaciones durante el intervalo observado de scroll. Las dos RPC adicionales capturadas fueron las consultas periódicas de `f_get_tb_operacion_recordatorio_resumen`.
- Sin errores en el registro de consola consultado. La instrumentación temporal local fue retirada de `supabase.ts` al terminar.

Evidencias: `outputs/scroll-bcp-20261020/dom-checks.json` y captura `bcp-scroll.jpg`.

Límite de la prueba: son puntos DOM muestreados, no un registro de cada frame ni una medición de FPS/latencia de producción. Los saltos del navegador pueden ser animados y completarse después de la tecla; por eso el caso extremo también esperó el desmontaje de la primera fila y su reaparición. No se afirma que sea imposible cualquier hueco transitorio bajo todas las velocidades/dispositivos. Queda validación manual continua con rueda/trackpad y perfiles de dispositivos representativos.
