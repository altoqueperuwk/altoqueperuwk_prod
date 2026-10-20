# Plan de rendimiento: BCP, Interbank, Scotiabank, BBVA y BanBif

Fecha inicial: 19/10/2026. Estado del plan de rendimiento: análisis estático y planificación; implementación integral no iniciada. Actualización de concurrencia: sección 14. La mitigación urgente de bloqueos y los reintentos posteriores son intervenciones separadas, no el cierre de este plan.

## 1. Objetivo y límites

Reducir tiempo de carga, llamadas repetidas y trabajo de PostgreSQL en las cinco rutas bancarias, conservando los flujos actuales. Tomar como escenario de prueba el pico informado por el usuario de 1.500 operaciones. No equiparar ese número a las filas que PostgreSQL debe examinar ni al tamaño histórico de la base.

El levantamiento y su actualización utilizan exclusivamente código local, documentación oficial y logs entregados. En estas etapas de documentación no se realizó DOM, conexión a producción/desarrollo, ejecución de RPC, compilación, build ni modificación de SQL o frontend. Las intervenciones previas autorizadas se describen por separado en los documentos 67 y 68.

### Invariantes obligatorios

- Mismas operaciones, sin omisiones ni duplicados, y mismo orden estable.
- Mismos montos, redondeos, comisiones, saldo banco, recaudación, gastos y ganancias.
- Mismas reglas por empresa/cuenta, retenciones, fuera de horario y cajas abiertas/cerradas.
- Mismos estados y permisos vigentes. No extender indiscriminadamente `IN (3,4)` a todos los servicios: Pago Deuda, derivados y POS pueden tener otras reglas.
- Mismas derivaciones y visibilidad desde origen/destino. No eliminar ramas OR sin demostrar equivalencia.
- Mismos resultados de matching y regla temporal de 86.400 segundos.
- Mismas acciones por fila/lote, selecciones, exportaciones, búsquedas e históricos.
- Mantener la integración de Interbank con SafetyPay y sus KPI específicos; no ocultarla para reducir llamadas.
- No borrar/archivar operaciones, restaurar respaldos, cambiar lógica contable, conceder permisos ni aumentar timeouts globales como solución de rendimiento.

## 2. Qué está confirmado y qué falta medir

**Confirmado en código:** hooks compartidos, familias de RPC por ruta, carga inicial sin contexto listo, limpieza mediante `ignore` sin cancelación HTTP, agregaciones laterales, construcción de JSON para contadores, matching por lote, consultas por fila de clientes y sondeo global de recordatorios.

**Evidencia histórica:** los logs previos al establecimiento de una línea base estable en Micro muestran demoras importantes. No representan un benchmark actual ni permiten ordenar consumo de CPU/I/O por función. Una consulta lenta puede estar afectada por competencia de recursos.

**Pendiente para una ventana posterior:** inventario real de índices válidos, tamaño/distribución de tablas, configuración de límite de filas de la API, frecuencia real por RPC/usuario, planes internos, bytes devueltos, concurrencia y métricas actuales de I/O. Que un índice exista en un `.sql` local no demuestra que esté instalado o válido en producción.

El pico de 1.500 operaciones no prueba que una consulta deba tardar decenas de segundos. El costo depende de filas históricas examinadas, número de cajas, subconsultas, respuesta JSON, caché, concurrencia y patrón de llamadas.

## 3. Mapa por ruta

Las cinco rutas usan `bancaria-page.tsx`, `BancariaOperationalTabs` y los hooks compartidos.

| Ruta | Empresas/contexto | Bandeja Efectivización actual | Contadores | Particularidad a conservar |
| --- | --- | --- | --- | --- |
| BCP | `f_get_tb_ruta_operacion_caja('bcp')` | `f_get_tb_operacion_bandeja_unificada` | `f_get_tb_operacion_retencion_bandeja_badges` y `f_get_tb_operacion_retencion_empresa_badges` | Retenciones y cuentas configuradas |
| Scotiabank | contexto de Scotiabank | unificada | familia retención | Ganancia especial en cuentas 5/33 y 8/7 |
| BanBif | contexto de BanBif | unificada | familia retención | Ganancia especial en cuenta 7/16 |
| BBVA | contexto de BBVA | unificada | `f_get_tb_operacion_bandeja_badges` y `f_get_tb_operacion_empresa_badges` | No imponer reglas de retención de BCP |
| Interbank | consulta contextos `interbank` y `safetypay` | combinación de rutas con deduplicación por ID | familia normal para Interbank y retención para SafetyPay, según contexto activo | Doble ruta, cuenta secundaria sin el mismo alcance de cuenta y KPI específico al seleccionar SafetyPay |

### Familias adicionales según pestaña o acción

- KPI actual: `f_get_tb_ruta_operacion_kpi_operaciones_v2` + `f_get_tb_ruta_operacion_gastos_salida_v2`.
- Ganancia especial: `f_get_tb_ruta_operacion_ganancias_efectivizacion_v2`, solo en las cuentas configuradas.
- Histórico: `f_get_tb_caja_operativa_cierre`, KPI de cierre `f_get_tb_ruta_operacion_kpi_cierre_operaciones_v2` y gastos por cierre. Se generan dos familias de consultas por cada cierre seleccionado, más la ganancia especial si aplica.
- SafetyPay dentro de Interbank: `use-bancaria-safetypay-kpi.ts` activa su vía específica únicamente cuando tiene empresa/cuenta/caja válidas. No asumir que siempre ejecuta las mismas llamadas que Interbank convencional.
- Pestañas no unificadas: `f_get_tb_operacion_retencion_bandeja` en rutas de retención; `f_get_tb_operacion_proceso` en otras. En Efectivización no retenida puede existir una segunda consulta para derivados por ruta origen.
- Pago Deuda: `f_get_tb_pago_deuda_bandeja`, cuando se abre su pestaña; además aparece como dependencia interna de contadores por empresa incluso sin abrir esa pestaña.
- Retenidos: enriquecimiento adicional mediante `f_get_tb_recaudacion_operacion_info` después de obtener las filas.
- Movimientos: `f_get_tb_operacion_caja`.
- Matching de Efectivización: flags por `f_get_tb_pago_deuda_match_flags_lote`; detalles bajo demanda mediante `f_get_tb_pago_deuda_match_lote`. No es necesario optimizar toda la pantalla independiente de Pago Deuda para abordar estas dependencias.
- Catálogos: `f_get_tb_estado`, `f_get_tb_cliente`, reglas de efectivización y catálogos de sesión.
- Global: `f_get_tb_operacion_recordatorio_resumen`, ejecutado inicialmente, cada 30 segundos y al recuperar foco de ventana.

## 4. Priorización inicial de funciones

Los máximos siguientes son muestras del incidente en logs aportados, no valores actuales, p95 ni tiempos garantizados después del cambio de compute.

| Prioridad | Función/familia | Evidencia o riesgo | Trabajo propuesto |
| --- | --- | --- | --- |
| P0 | `f_get_tb_operacion_bandeja_unificada` | Log posterior al parche de estados: 48,17 s; es la tabla inicial compartida | Medir ramas de ruta/origen/destino, filtros, orden y serialización; reducir alcance transitorio de llamadas |
| P0 | `f_get_tb_ruta_operacion_kpi_operaciones_v2` | Hasta 54,03 s en log anterior; 34,47 s en el siguiente; agregaciones LATERAL por caja | Medir lecturas por caja y comprobar índices de entrada/salida; evaluar preagregación equivalente dentro de la consulta |
| P0 | `f_get_tb_ruta_operacion_gastos_salida_v2` | Hasta 51,03 s en el log posterior; otra lectura de operaciones para las mismas tarjetas | Índices y filtros por cuenta/cierre; compartir trabajo solo si no mezcla definiciones de gasto |
| P0 | `f_get_tb_operacion_retencion_bandeja_badges` | 48,89 s en log posterior | Universo mínimo para COUNT; índices compatibles y menos solicitudes repetidas |
| P0 | `f_get_tb_operacion_retencion_empresa_badges` / `f_get_tb_operacion_empresa_badges` | Obtienen filas JSON de una bandeja compleja de Pago Deuda para agrupar contadores | Contar con columnas mínimas y predicados equivalentes; no construir retorno/comprobantes innecesarios |
| P1 | `f_get_tb_operacion_bandeja_badges` | 48,57 s en log posterior; comparte escaneo de operaciones | Índice sobre expresión/predicado realmente utilizados; simplificar trabajo de agregación |
| P1 | `f_get_tb_pago_deuda_match_flags_lote` | EXISTS correlacionado por operación y ventana con ABS(EXTRACT(epoch...)) | Índice por DNI/flujo/fecha y rango temporal equivalente; controlar tamaño y repetición de lotes |
| P1 | `f_get_tb_pago_deuda_match_lote` | Log posterior: 48,32 s; detalle se pide al abrir candidatos | Mantener carga bajo demanda, índice y caché coherente por operación |
| P1 | ganancia especial, KPI de cierre y `f_get_tb_operacion_caja` | Costo potencial en rutas/cierres concretos, sin ranking nuevo confirmado | Medición separada para no asumir costo a partir del nombre |
| P2 | contexto de cajas, reglas, `f_get_tb_estado`, `f_get_tb_cliente` | Muchas llamadas pequeñas pueden multiplicar la carga | Reutilizar catálogos y agrupar clientes únicos |
| P2 | resumen de recordatorios | Frecuencia global y reconciliación con escritura interna | Evitar solapamientos; medir sin alterar frecuencia ni reglas visibles |

Una función con menor duración por llamada puede consumir más recursos totales si se invoca cientos de veces. Ordenar posteriormente por tiempo total, cantidad de llamadas, lecturas de bloques y tamaño de respuesta, no solo por máximo.

## 5. Hallazgos concretos en frontend

### F1. Arranque sin empresa/cuenta resueltas — prioridad P0

`useBancariaKpis` recibe IDs nulos al comienzo y no dispone de una condición de contexto listo para la consulta actual. La página monta las bandejas sin pasar una habilitación condicionada a `isLoadingCompanies`. Cuando `useRouteCompanies` resuelve las cajas, la selección cambia y dispara solicitudes con parámetros nuevos.

Mejora propuesta: separar explícitamente contexto «cargando», «vacío», «selección concreta» y «todas las empresas» si esta última es una opción válida. No usar simplemente `if (!idEmpresa) return`, porque anularía consultas globales legítimas. Arrancar consultas dependientes una vez que el alcance real esté estabilizado.

Criterio: una petición por clave final en un montaje estable; ninguna lectura global accidental que solo corresponda al estado transitorio de carga.

### F2. `ignore` evita pintar respuestas, pero no cancela la solicitud — P0

Los hooks de empresas, KPI, bandejas y badges usan `ignore = true` en cleanup. El helper RPC llama a `supabase.rpc(fn, params)` sin soporte de señal de aborto ni deduplicación de solicitudes pendientes.

Mejora propuesta: single-flight por función + parámetros normalizados + identidad/permisos de sesión; señal de aborto cuando no existan consumidores, descarte de respuestas antiguas y controles de carrera. Abortar HTTP no garantiza que PostgreSQL detenga instantáneamente una consulta; reducir solicitudes innecesarias antes de iniciarlas es la medida principal. No compartir caché de datos entre usuarios o roles.

### F3. Contadores por empresa vuelven a pedir datos iguales al cambiar pestaña — P0

`useBancariaEmpresaBadges` depende de `activeTab`, pero no envía la pestaña a la RPC. El backend devuelve conteos de todas las pestañas y el frontend selecciona el grupo correspondiente.

Mejora propuesta: conservar el resultado bruto por ruta/cuenta/histórico y derivar la pestaña localmente. Compartir la solicitud cuando haya varios consumidores de la misma clave. Invalidar tras una modificación real o una actualización explícita, no por cambiar únicamente la proyección visual.

Los contadores de todas las empresas no deben restringirse a la empresa seleccionada si eso cambia lo que el usuario ve.

### F4. Matching ya está optimizado parcialmente — P1

Ya hay flags por lote, caché por fingerprint y detalle bajo demanda; no proponer reemplazarlos como si se hiciera una petición de detalle por cada fila al cargar.

Sin embargo, `showPagination = !hidePagination && mode !== 'unificado'`; en unificado, `visibleRows` contiene todas las filas cargadas. La virtualización limita el renderizado, pero no este conjunto usado por el efecto de flags. Un lote puede abarcar una parte grande de las 1.500 operaciones.

Mejora propuesta: deduplicar lotes pendientes, conservar fingerprints, agrupar trabajo por DNI/fecha en backend y evaluar bloques acotados con concurrencia limitada. Si se carga por viewport, garantizar que cada fila tenga su indicador antes de habilitar su acción; no cambiar candidatos ni introducir falsos negativos por datos todavía pendientes.

### F5. Consulta de cliente por fila en modo Efectivización — P1

El efecto de comisiones recurrentes recorre `visibleRows`, llama a `clienteService.getById` y puede hacer fallback a búsqueda por documento. Ambas vías utilizan `f_get_tb_cliente`. En modo Efectivización paginado son las filas de la página; no aplica de igual manera al modo unificado porque el efecto lo excluye.

Mejora propuesta: agrupar IDs/documentos únicos y resolver por lote con igual política de permisos y prioridad ID→documento. Mantener valores individuales y manejo de «sin cliente». Como alternativa inicial, caché y deduplicación por cliente con invalidación al editar sus comisiones.

### F6. Catálogos y destinos solicitados desde varios componentes — P2

Existe un `SessionCacheProvider` que ya deduplica los seis catálogos iniciales; aprovecharlo, no crear una segunda caché global sin control de sesión. La tabla solicita reglas al montarse; las pestañas solicitan estados por su cuenta. Destinos POS/Pago Deuda y la acción Derivar vuelven a consultar varias rutas de cajas.

Mejora propuesta: caché compartida por ruta con actualización al cambiar configuración, reutilización de estados/reglas y solicitudes solo al necesitar destinos. Evitar una optimización que vuelva obsoletas cuentas recién habilitadas.

### F7. Refrescos posteriores a acciones y dependencias amplias — P1

Auditar `refreshKey`, `actionRefreshKey`, `metricsRefreshKey` y efectos que reinician filtros. Evitar repetir bandeja completa si la respuesta de escritura ya trae las filas actualizadas; agrupar invalidaciones de una misma acción. Mantener actualización de KPI, saldos, contadores y empresas afectadas por derivaciones/matches, incluido origen y destino.

### F8. GET no siempre significa lectura pura — P2

`f_get_tb_operacion_recordatorio_resumen` llama a `f_private_operacion_recordatorio_reconciliar`, que ejecuta UPDATE. Su proveedor global puede iniciar solicitudes por intervalo y foco sin guardia de ejecución pendiente.

Mejora inicial: single-flight y prevención de solapamientos, manteniendo el intervalo de 30 segundos y el comportamiento actual. Separar la reconciliación de la lectura requeriría un diseño adicional y no se considera un cambio automático permitido por este plan. No ejecutar esta RPC como prueba inocua en producción.

## 6. Backend: oportunidades de consulta sin cambios de negocio

### B1. Seleccionar el universo pequeño antes de agregar

- KPI actual: el LATERAL por cada caja vuelve a consultar `tb_operacion_proceso`. Medir número de loops y filas leídas. Probar agregados separados por lado ingreso/salida y agrupación por empresa/cuenta/caja, con el mismo resultado final.
- No aplicar una fecha global nueva «para acelerar»: algunas operaciones abiertas, retenidas o derivadas pueden ser anteriores a la apertura usada en una de las métricas.
- Gastos salida: mantener distinción entre caja actual e histórico, lado de cierre y excepción PROCESADO de Pago Deuda. El KPI y el gasto bancario adicional no son automáticamente el mismo concepto.
- Contadores: no usar `to_jsonb(op)` ni la bandeja enriquecida de Pago Deuda si basta contar claves. Primero demostrar que los joins y condiciones de esa bandeja no multiplican ni descartan filas de forma significativa para el conteo.
- Considerar un resultado agregado reutilizable dentro de una petición; no introducir saldos cacheados persistentes o una vista materializada financiera sin un diseño de consistencia adicional.

### B2. Predicados indexables, conservando semántica

- Revisar `LOWER`, `UPPER`, `BTRIM` y `COALESCE` sobre columnas filtradas. Un índice simple sobre la columna no equivale a uno sobre su expresión normalizada.
- No quitar normalizaciones ni reemplazar estados por ID en todos los flujos sin comprobar equivalencia de datos. Este plan no pretende redefinir reglas.
- En matching, evaluar transformar `ABS(EXTRACT(epoch FROM (fecha_candidata - fecha_origen))) <= 86400` a límites inclusivos `fecha_origen ± interval '24 hours'`, preservando `COALESCE(fecha_pendiente,fecha_registro)`, valores nulos y zona horaria.
- Unificada: evaluar separar las ramas de rutas y derivados para facilitar índices. No sustituir OR por UNION ALL directamente: una operación puede satisfacer varias ramas y duplicarse; mantener unicidad y prioridad de datos.
- Mantener la búsqueda de subcadena de DNI/código si hoy existe. No convertirla en igualdad o prefijo para aprovechar un B-tree. Evaluar `pg_trgm` únicamente si volumen/frecuencia justifican extensión, tamaño y costo de mantenimiento.
- Mantener exactamente el orden cronológico, con desempate por fecha de registro/ID según contrato actual.

### B3. Histórico y carga útil

- Hoy se descargan cierres y se filtra su fecha en cliente, seguido de llamadas de KPI y gastos por cierre. Evaluar filtros de fecha del lado servidor y una consulta agrupada por los mismos cierres, sin eliminar snapshots ni reinterpretar fechas Lima.
- `SETOF jsonb` y `to_jsonb(op)` pueden enviar columnas que la tabla no usa. Medir bytes y contratos de acciones/exportaciones antes de proponer una proyección más estrecha.
- Investigar límite API: los logs incluyen `LIMIT 1000`. No significa que hoy se pierdan siempre filas, pero obliga a validar el caso 1.001/1.500 frente al total de backend.
- La paginación/virtualización visual no acredita paginación SQL. No limitar a 20/50/100 por rendimiento si se cambia la selección global o una exportación completa. El streaming o paginación interna requieren conservar orden, total, selección entre bloques y exportación íntegra; tratarlo como trabajo posterior, no primer parche.

## 7. Índices candidatos: hipótesis, no DDL autorizado

Instalar solo los que un plan y una prueba comparativa justifiquen. No crear todos los índices de esta lista. El orden final de columnas depende de selectividad, filtros obligatorios y orden real. Considerar costo de escritura, importaciones, WAL, tamaño y mantenimiento.

| Familia candidata | Tablas/columnas a estudiar | Consulta objetivo | Precaución |
| --- | --- | --- | --- |
| Operaciones abiertas por destino | `tb_operacion_proceso`: expresión real de ruta destino, empresa/cuenta salida, fecha de orden e ID; predicado de cierre/estado compatible | Unificada y retención | El predicado parcial debe coincidir o ser implicado por la consulta; `<>10` no es siempre intercambiable con COALESCE en presencia de nulos |
| Derivados por origen | ruta origen, flag derivado, empresa/cuenta origen y fechas | Rama de origen de unificada | Preservar los campos congelados de origen y el fallback actual |
| KPI ingreso/salida | empresa, cuenta, campos de cierre de cada lado, fechas usadas por cada CASE | KPI y gastos | Ya hay índices de cierre/empresa/cuenta locales; probar si sirven antes de añadir otros |
| Expresión ruta global | `COALESCE(ruta_destino,ruta_origen)` más filtro abierto/no eliminado | Badges normales de BBVA/Interbank | Existe `idx_tb_operacion_proceso_kpi_ruta_abierta` en el código; instalación/validez actuales sin verificar |
| Relaciones | `id_operacion_padre`, `id_operacion_match` | Subconsultas relacionadas y cierre | Índice padre creado en la intervención anterior. Estado final del índice match no verificado; un intento concurrente falló. No asumir que IF NOT EXISTS garantiza validez |
| Matching candidato | DNI + clasificación/flujo + expresión fecha candidata, con filtro compatible con PROCESADO y caja abierta | flags y detalle de matching | Un índice sobre estado 3/4 eliminaría el candidato PROCESADO legítimo |
| Movimiento de caja | `tb_operacion_caja`: caja/cierre/fecha; operación/cierre/tipo origen | Movimientos, gastos y comprobación de cierre | Existen índices locales por operación y caja/cierre: evaluar redundancia y longitud de prefijos |
| Catálogo de clientes | documento/tipo/estado o PK por ID según búsqueda efectiva | Lecturas de comisión recurrente | Deduplicar llamadas suele ser anterior a añadir un índice; respetar búsqueda parcial |
| Histórico especial | empresa/cuenta ingreso, tipo de depósito, fechas depositado/pagado y cierre | Ganancia especial Scotiabank/BanBif | Comparaciones por día Lima no equivalen sin más a fecha UTC |

Antes de desplegar: consultar catálogo de índices y `indisvalid`/`indisready`, planes y uso; verificar que no haya duplicados o construcciones incompletas. No se realizó esa consulta en esta etapa.

## 8. Plan de trabajo por fases

| Fase | Trabajo | Entregable y puerta de salida |
| --- | --- | --- |
| 0 — este levantamiento | Inventario estático, dependencias, evidencias previas, hipótesis y límites | Este documento. Completada sin acceso a producción |
| 1 — línea base | En desarrollo aislado con datos sintéticos/anónimos: 100/500/1.000/1.001/1.500 operaciones, historial representativo y distribución por empresa/cuenta; inventariar índices y contratos | Medidas por ruta/acción, equivalencia esperada y lista corta de índices. No usar credenciales o datos de clientes en logs |
| 2 — reducir solicitudes | Contexto inicial listo, single-flight, invalidación precisa, reutilización de contadores/catálogos, guardia de recordatorios; mantener UI y frecuencia funcional | Comparativa de cantidad de RPC por acción y pruebas unitarias. No solicitudes transitorias globales por IDs nulos |
| 3 — índices medidos | Evaluar candidatos en desarrollo con EXPLAIN y consultas internas; elegir un conjunto mínimo | Antes/después en tiempo y buffers, costo de escritura y migración/rollback puntuales. Índices bajo la creación de su tabla en su archivo original |
| 4 — consultas equivalentes | Optimizar KPI/gastos, contadores sin bandeja enriquecida, ramas de unificada y rango de matching | Igualdad de conjuntos/orden/montos/candidatos, perfiles y escenarios de cierre. Preservar firmas de RPC cuando sea posible |
| 5 — carga y regresión | Matriz por ruta, perfiles, 1/3/5 sesiones sintéticas y variación de pendientes/pagados/retenciones; exportaciones y selección integral | Comparativa p50/p95 y ausencia de regresiones de escritura o saturación. Pruebas solo fuera de producción |
| 6 — despliegue controlado | Con autorización posterior y ventana sin operación: inventario real, backup de definiciones y comparación de cambios; primero frontend medido, índices y luego funciones según resultados de desarrollo | Migración revisada por unidades, verificación, caché de API si corresponde y rollback separado por capa. No ejecutar SQL completos con cambios ajenos |

Fases 3 y 4 pueden alternarse: un cambio de predicado puede exigir otro índice; medir después de cada unidad. No prometer un porcentaje de mejora antes de establecer línea base.

### Método de medición futuro

- Frontend/desarrollo: duración hasta empresas, tabla útil y KPI; RPC por función/clave, duplicados simultáneos, bytes y renderizado. Separar render de red/SQL.
- PostgreSQL/desarrollo: tiempo total y por llamada, filas examinadas/devueltas, loops, bloques hit/read, ordenaciones temporales y planes genéricos frente a parámetros selectivos.
- Para funciones SQL/PLpgSQL complejas, el EXPLAIN exterior puede mostrar solo Function Scan. Analizar sus SELECT internos con los mismos parámetros/rol; no confundir ese plan envoltorio con prueba de que no hay escaneos repetidos.
- EXPLAIN sin ANALYZE no ejecuta la consulta, pero su coste estimado no es tiempo real. EXPLAIN ANALYZE sí ejecuta: no utilizarlo en producción en esta fase ni sobre un supuesto GET que pueda escribir.
- Comparar antes/después en el mismo compute, dataset, concurrencia y estado de caché. No mezclar las muestras del incidente Nano con una medición nueva de Micro.
- Registrar deltas de estadísticas, sin resetear contadores globales en producción. Preferir frecuencia acotada para no convertir el monitoreo en carga adicional.

## 9. Criterios de aceptación

1. Cero diferencias no autorizadas en IDs, orden, montos a precisión monetaria, badges y candidatos con el dataset congelado.
2. Cero truncamientos silenciosos a 1.000 filas: búsqueda, selección y exportación incluyen las 1.500 cuando corresponda.
3. Al estabilizar una selección, máximo una solicitud simultánea por función + parámetros + ámbito de seguridad, salvo refresco explícito posterior.
4. Cambiar pestaña no repite un contador por empresa idéntico todavía vigente; cambiar empresa no usa datos de otro contexto.
5. KPIs, tabla y badges se invalidan correctamente tras pagar, derivar, reiniciar, editar, eliminar/restaurar y cambiar una caja, sin modificar esas acciones.
6. Resultados idénticos en cada ruta y en la combinación Interbank/SafetyPay, con casos de origen/destino y retenciones cruzadas.
7. Sin nuevos timeouts/esperas de bloqueo en el escenario acordado de desarrollo; validación de p95 frente a línea base por RPC. Objetivo inicial a validar, no compromiso: tabla útil p95 <= 3 s, KPI/badges <= 2 s con 1.500 operaciones y concurrencia acordada.
8. Medir también guardar/importar y revisar I/O: un índice que mejora lectura pero degrada materialmente el guardado no se acepta sin ajuste.
9. No aumentar privilegios, introducir caché cruzada entre sesiones ni modificar el tratamiento actual de estados por una optimización técnica.

### Casos mínimos de regresión

- Estados 3, 4, 10 y estados adicionales usados por otros flujos; datos con nombres nulos/desincronizados para identificar comportamientos ya existentes sin corregirlos silenciosamente.
- Empresa con 0/1/múltiples cuentas; contexto sin cajas y opción global si existe.
- Recaudación retenida/no retenida, fuera de horario, límites de corte y cambio de día Lima.
- Caja abierta, cierre por ingreso/salida y operación derivada con origen congelado.
- Coincidencia de dos ramas de unificada: una sola operación, sin doble conteo.
- Match con mismo DNI, diferencia de exactamente ±86.400 segundos, fecha nula, retorno parcial, candidato PROCESADO y operación eliminada.
- Vista histórica con 0/1/múltiples cierres y cuentas especiales de Scotiabank/BanBif.
- Cambio rápido de filtros/pestañas/cuentas, escritura durante refresco y respuesta tardía de una solicitud anterior.
- Administrador, jefe de tienda y perfil con alcance restringido, sin ampliar lo visible por cachear.

## 10. Archivos previstos para una implementación posterior

No fueron modificados en este levantamiento.

### Frontend

- `src/features/operaciones/efectivizacion/bancaria/pages/bancaria-page.tsx`
- `src/features/operaciones/efectivizacion/bancaria/components/bancaria-operational-tabs.tsx`
- `src/features/operaciones/efectivizacion/bancaria/components/bancaria-efectivizacion-table.tsx`
- `src/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-kpis.ts`
- `src/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-bandeja.ts`
- `src/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-tab-badges.ts`
- `src/features/operaciones/efectivizacion/shared/hooks/use-route-companies.ts`
- `src/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service.ts`
- `src/features/operaciones/pago-deuda/services/pago-deuda.service.ts`, solo soporte compartido de matching si lo exige la medición.
- `src/services/cliente.service.ts`, si se agrupa la lectura de clientes.
- `src/providers/session-cache-provider.tsx` y `src/providers/operational-reminders-provider.tsx`, cambios globales solo con pruebas del resto de consumidores.

### Backend

- `03.operacion_proceso_y_excel.sql`: índices de `tb_operacion_proceso`; GET genérico solo si la medición lo exige.
- `04.pago_deuda.sql`: consultas de matching y dependencia de bandeja usadas desde Efectivización/contadores, no rediseño del flujo Pago Deuda.
- `05.ruta_operacion_y_cajas.sql`: KPI, gastos, ganancia especial, contadores normales, contexto y movimientos; índices de las tablas creadas en este archivo.
- `10.retenciones_scotiabank_banbif.sql`: unificada, bandeja y contadores de retención.
- `12.recaudacion_cortes_abonos.sql`: solo si el enriquecimiento de Retenidos resulta costoso.
- `36.recordatorios_operaciones_pendientes.sql`: únicamente si una optimización equivalente de su consulta se justifica; no separar escrituras automáticamente.

`11.operaciones_asistidas_pos_linkpago.sql` y los módulos independientes POS/Link Pago no son un frente principal de estas cinco rutas. Los logs contienen demoras allí, pero no autorizan ampliar el alcance del presente plan.

Las futuras modificaciones SQL deberán incluir el generador de DROP al final para las funciones efectivamente afectadas. Generarlo no implica ejecutarlo. No publicar todos los cambios del árbol de trabajo: seleccionar un conjunto de archivos/hunks por fase.

## 11. Despliegue y reversión futuros

- No ejecutar nada mientras el usuario mantenga producción en uso, salvo una nueva autorización explícita y delimitada.
- Capturar definiciones/firmas/ACL reales antes de reemplazar funciones. Los archivos locales pueden contener cambios aún no desplegados.
- Índices concurrentes individualmente y fuera de BEGIN/COMMIT; pueden esperar transacciones y consumir I/O. Revisar validez tras cualquier timeout y limpiar únicamente el índice incompleto de ese intento, con autorización.
- Funciones mediante reemplazo puntual compatible, sin DROP CASCADE. Si cambia firma/contrato, diseñar compatibilidad antes de desplegar.
- Rollback frontend separado del SQL; rollback de función restaura su definición previa; retiro de índices nuevos solo si hay evidencia de regresión y alcance exacto.
- Validar por ruta primero con uso acotado y después con carga normal; no dar recuperación por confirmada solo por un COMMIT o un NOTIFY.

## 12. Fuentes y trazabilidad

### Código local revisado

- [Página bancaria](../../src/features/operaciones/efectivizacion/bancaria/pages/bancaria-page.tsx).
- [Hook KPI](../../src/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-kpis.ts).
- [Hook bandejas](../../src/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-bandeja.ts).
- [Hook contadores](../../src/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-tab-badges.ts).
- [Tabla y matching](../../src/features/operaciones/efectivizacion/bancaria/components/bancaria-efectivizacion-table.tsx).
- [SQL ruta/cajas](../backend_implementacion/05.ruta_operacion_y_cajas.sql).
- [SQL retención y unificada](../backend_implementacion/10.retenciones_scotiabank_banbif.sql).
- [Intervención de estados previa](43_filtros_estados_operaciones_2026_10_19.md).
- [Incidente previo e índices pendientes de verificación](42_incidente_produccion_2026_10_19.md).

### Documentación oficial de apoyo

- [Supabase: optimización de consultas](https://supabase.com/docs/guides/database/query-optimization).
- [Supabase: índices](https://supabase.com/docs/guides/database/postgres/indexes).
- [Supabase: Index Advisor](https://supabase.com/docs/guides/database/extensions/index_advisor).
- [Supabase: inspect y significado de EXPLAIN ANALYZE](https://supabase.com/docs/guides/database/inspect).

## 13. Orden recomendado para comenzar después

Antes de continuar con la optimización de GET, priorizar el protocolo de escrituras y las pruebas de concurrencia de la sección 14. Para medir e implementar en desarrollo se requiere autorización posterior: esta actualización no accede a ese ambiente. Después reducir solicitudes de arranque/cambio de pestaña y contadores por empresa; a continuación elegir índices medidos para unificada/KPI/gastos. Luego optimizar sus SELECT y matching, y validar las cinco rutas antes de cualquier ventana de producción. La mejora de compute es una mitigación de capacidad, no sustituye esta secuencia.

## 14. Ampliación prioritaria: concurrencia y escrituras financieras

Actualización: 19/10/2026 Lima, después del hotfix y del commit `3fbcd30`. Solo análisis/documentación; no autoriza nuevos cambios de producción ni acceso a desarrollo. El alcance de diagnóstico incluye Pago Deuda porque comparte cajas y sincronizaciones con Efectivización; excluirlo impediría resolver el ciclo observado, aunque el plan de lecturas se concentra en las cinco rutas bancarias.

### 14.1. Trazabilidad: el adjunto no es un incidente nuevo

Archivo recibido: `C:/Users/Lenovo/.codex/attachments/34aa4637-0db5-4695-b5f0-ff8b9a56f589/Texto pegado.txt`.

- JSON válido con 117 eventos: 103 `55P03`, nueve `40P01` y cinco `57014`.
- Intervalo UTC: `2026-10-19 23:51:00.240000` a `2026-10-20 00:19:54.446000`; en Lima: 19/10, 18:51:00 a 19:19:54. Es anterior al hotfix y sus pruebas de aproximadamente 19:35–19:36 Lima.
- SHA-256 del archivo: `69d0adf44ca2f22a7dccba00608bc14112b82ff9c00cfc9b3a52a7a3b8168893`.
- Comparación de contenido: idéntico al adjunto `516a8ade-8413-4855-bbe4-5fa1c089ed8f/Texto pegado.txt`, utilizado antes del hotfix. No sumar ambos como incidentes distintos ni usar este archivo como prueba de fallos posteriores.
- Son registros de error, no operaciones únicas, ni llamadas exitosas, ni mediciones de duración. No permiten calcular tasa de fallo/éxito o p95, ni atribuir todos los errores a BCP: los parámetros reales están sustituidos por variables PostgREST.

| RPC externa identificada | 55P03 | 40P01 | 57014 |
| --- | ---: | ---: | ---: |
| `f_patch_tb_pago_deuda_pagado` | 82 | 8 | 5 |
| `f_patch_tb_operacion_proceso_pagado_lote` | 10 | 1 | 0 |
| `f_post_tb_operacion_proceso_excel` | 3 | 0 | 0 |
| `f_patch_tb_operacion_proceso_pagado` | 1 | 0 | 0 |
| `f_patch_tb_pago_deuda_match` | 3 | 0 | 0 |
| `f_patch_tb_pago_deuda_salida` | 2 | 0 | 0 |
| `f_patch_tb_operacion_proceso_derivacion` | 2 | 0 | 0 |

Los nueve registros de deadlock muestran ciclos entre procesos. Ejemplo verificable: a `00:17:22.132 UTC`, PID 7474 espera a 7530 y 7530 espera a 7474; los participantes son pago por lote y Pago Deuda pagado. Cuatro contextos de deadlock señalan `tb_empresa`; otros muestran `tb_caja_operativa`. Las coordenadas de tupla del log no son IDs de negocio y no deben utilizarse para seleccionar operaciones a corregir.

### 14.2. Diagnóstico: paralelismo sobre recursos comunes

No es necesario que dos usuarios paguen la misma operación para competir. Dos operaciones distintas pueden tocar la misma caja de salida/comisión, varias cajas relacionadas o la misma fila `tb_ruta_operacion_kpi` (única por ruta).

Cadena verificada en los contextos históricos y contrastada con código local:

```text
Pago Deuda pagado
  → movimiento de salida desde proceso
    → aplicar/revertir delta de caja
      → sincronizar cajas/KPI de ruta
  → sincronizar comisión
    → insertar movimiento o revertir delta anterior y aplicar nuevo
      → sincronizar cajas/KPI de ruta
  → sincronizar KPI de operaciones

Pago de Efectivización/lote
  → movimientos y cajas
  → sincronizaciones compartidas con la cadena anterior
```

**C1 — Orden de adquisición no unificado (P0, evidencia histórica + riesgo actual).** El hotfix evita esperar en ciertos puntos, pero la coordinación de ruta se toma dentro de las sincronizaciones, cuando el llamador puede tener ya bloqueadas operaciones, movimientos y una caja. No constituye una reserva temprana de todos los recursos de la transacción. Las derivaciones pueden involucrar dos rutas y cuentas compartidas; ordenar solo las cajas dentro de un helper no ordena toda la RPC.

**C2 — Granularidad amplia y fila de KPI disputada (P0, confirmado).** `f_sync_tb_ruta_operacion_kpi_caja` recalcula `ingresos_retenido` para las cajas activas vinculadas a la ruta y actualiza su KPI. Una escritura local puede entrar en competencia con cajas que no eran su destino directo. El `INSERT ... ON CONFLICT (ruta) DO NOTHING` también aparece esperando en el log: no es una instrucción libre de esperas. El gate actual reduce el ciclo entre participantes protegidos, pero serializa por ruta; no elimina este punto común ni protege escritores que no adopten el protocolo.

**C3 — Reversión/reaplicación con sincronizaciones intermedias (P0, confirmado en código y cadena histórica).** La actualización de una comisión existente llama a `f_apply_tb_operacion_caja_delta` con factor -1 y luego +1; ambas llamadas pueden sincronizar la ruta. La salida puede repetir un patrón parecido y la RPC raíz vuelve a sincronizar el KPI de operaciones. No asignar un número fijo de recálculos sin medir la rama real. El objetivo es conservar los deltas contables, pero evitar recalcular resúmenes varias veces dentro de la misma transacción.

**C4 — Orden padre/hijo dependiente de la entrada (P0, riesgo estático, no deadlock nuevo demostrado).** `f_patch_tb_pago_deuda_pagado` bloquea primero `p_id_operacion`; si recibe la SOLICITUD, bloquea después el hijo BANCO; si recibe el hijo, bloquea después la raíz. Dos entradas equivalentes pueden adquirir padre/hijo en orden inverso. Hay contextos de espera sobre `tb_operacion_proceso`, pero este archivo no demuestra que ese patrón concreto haya causado uno de los nueve deadlocks. Requiere reproducción controlada y revisión de todos los consumidores.

**C5 — Lotes/importaciones prolongan la tenencia de locks (P1, riesgo a medir).** El lote local ya ordena IDs y dispone de `app.defer_kpi_sync`, con sincronización final ordenada por ruta: preservar lo existente, no proponerlo como si faltara por completo. Los helpers también consultan esa configuración en varias ramas. Aun así, los locks se conservan hasta terminar la transacción y la reserva de rutas no se hace al comienzo del lote. Auditar cobertura de la bandera, restauración del valor anterior y diferencias con definiciones reales antes de desplegar; no asumir paridad local/producción.

**C6 — Doble envío e idempotencia incompleta por demostrar (P1).** El frontend protege varias acciones con estados de carga por fila, pero eso no coordina dos filas que comparten caja, dos pestañas ni dos usuarios. Los reintentos actuales están acotados a tres RPC y `55P03`; no reemplazan la coordinación del backend. Revisar además la repetición de un pago ya confirmado, movimiento de comisión, inversión/reaplicación y saldos: no se ha demostrado duplicación de dinero en este log.

**C7 — Atomicidad de errores de negocio (P0, riesgo estático distinto de 55P03).** La RPC local de Pago Deuda actualiza estados antes de invocar helpers que pueden devolver JSON con `error`; después retorna ese JSON. Un retorno normal no equivale a una excepción que provoque rollback. Verificar que ninguna rama pueda confirmar cambios anteriores junto con ese error. Los `55P03` no capturados sí abortan la transacción; no confundir ambos contratos ni habilitar reintentos basados en texto JSON. Este hallazgo exige pruebas, no acredita que haya pagos incoherentes actuales.

**C8 — Carga de lecturas y saturación son un frente diferente (P1).** Refrescos y agregaciones repetidas pueden competir por CPU/I/O/conexiones y alargar transacciones. Los bloqueos de filas no demuestran por sí solos que un SELECT normal esté bloqueado; la pantalla completa puede esperar una dependencia, recursos o una RPC que también escriba. El log no permite atribuir toda la caída a un único lock, a 1.500 operaciones o al plan contratado.

### 14.3. Diseño de corrección propuesto, sin cambiar flujos ni firmas

1. **Inventariar escritores y dependencias antes de agregar locks.** Para cada RPC raíz: operaciones padre/hijo/match, movimientos existentes, cajas de salida/ingreso/comisión, rutas origen/destino, cierre y punto de sincronización. Incluir pagos, match/salida, derivaciones, reinicio/eliminación, Excel y cierre. Identificar triggers y escritores directos que pudieran saltarse los helpers. Contrastar posteriormente con definiciones/ACL reales bajo autorización; no desplegar SQL local completo.
2. **Diseñar un protocolo único de adquisición temprana.** Descubrir tentativamente el conjunto de recursos sin bloquear catálogos; reservar todas las claves de coordinación en orden estable antes de tomar locks de filas; luego bloquear filas por clase e ID siguiendo el mismo orden en todos los escritores. Releer y validar relaciones, cuenta, estado y cierre después de reservar: si cambiaron, abortar/reintentar la transacción completa, no extender el conjunto de locks fuera de orden.
3. **Cubrir rutas cruzadas y cajas compartidas.** Un gate de una sola ruta no basta si una caja participa en varias. Diseñar el conjunto completo de claves y su orden (incluidos origen/destino), deduplicarlo y evitar conflictos innecesarios por normalización/hash. Empezar con granularidad segura; reducirla solo cuando esté probado que no existe un recurso común. No imponer un mutex global de toda la base. Advisory locks solo coordinan participantes que los respetan.
4. **Reducir la sección crítica sin debilitar contabilidad.** Mantener movimientos y saldo protegidos en la misma transacción. Revertir/aplicar deltas según reglas actuales, reunir las cajas/rutas afectadas y sincronizar resúmenes una vez por ruta al final. Evaluar el mecanismo local de diferimiento existente, su restauración bajo errores/savepoints y llamadas anidadas. Si la respuesta requiere datos finales, construirla después del flush. No cambiar todavía a KPI asíncronos ni permitir resúmenes silenciosamente obsoletos.
5. **Acotar escrituras y recálculos medidos.** Evaluar recalcular solo cajas afectadas y agrupar operaciones en una lectura equivalente; probar casos en los que otras cajas también dependen del cambio. Evitar UPDATE sin cambios con comparación segura de campos cuando sea equivalente. Medir primero loops, buffers, duración y locks; un índice puede reducir tiempo de retención, pero no corrige un orden circular.
6. **Garantizar atomicidad e idempotencia.** Resolver C7 sin cambiar request/response de negocio: validaciones antes de modificar o bloque transaccional que revierta antes de devolver el error existente. Definir la identidad de cada movimiento antes de proponer una restricción única; no agregar una unicidad indiscriminada sobre operación, porque hay movimientos legítimos múltiples. Pagar dos veces debe tener un resultado definido y nunca duplicar salida/comisión.
7. **Controlar el emisor frontend, sin convertirlo en garantía contable.** Conservar botones ocupados durante la promesa completa, bloquear doble envío inmediato mediante guardia síncrona cuando corresponda y evaluar cola local por recurso compartido, no un bloqueo global de navegación. Evitar superponer una nueva acción manual con su reintento. Agrupar refrescos solo al finalizar la acción y no después de cada intento fallido. Dos sesiones distintas siempre deben quedar protegidas por backend.
8. **Observar y decidir con resultados reales.** Mantener los tres reintentos de `rpc-lock-retry.ts` solo para `55P03`; no extender a red, timeouts, imports con éxito parcial o errores JSON. Medir agotamiento y latencia de la acción completa, distinguiendo solicitudes HTTP de acciones del usuario. No registrar claves, contraseñas, documentos de clientes ni cuerpos completos de pagos. Confirmar versión web desplegada antes de interpretar sus reintentos.

No usar `SKIP LOCKED` para omitir pagos/cajas de un lote financiero, eliminar `FOR UPDATE` de saldos, aumentar timeouts globales o cambiar estados artificialmente para esconder la competencia. Una cola persistente/asíncrona sería otro diseño y requeriría autorización y contrato de procesamiento; no forma parte de la primera corrección propuesta.

### 14.4. Fases de ejecución y salida verificable

Base de desarrollo actualizada posteriormente: las cinco firmas del hotfix ya están homologadas, con nueve verificaciones backend y preservación de los datos preparados. Detalle en el [documento 69](69_homologacion_hotfix_desarrollo_2026_10_20.md). Esto establece la base de C1; no marca completadas C1/C2 ni las pruebas de estrés.

| Fase | Trabajo | Condición de salida |
| --- | --- | --- |
| C0 — análisis actual | Clasificar adjunto, distinguir histórico/actual y actualizar plan | Esta sección; sin ejecutar escrituras ni conectarse a BD |
| C1 — reproducción autorizada | Entorno aislado, inventario de versiones/escritores y pruebas de padre/hijo, cajas y rutas cruzadas | Grafo de recursos y carreras reproducibles, no inferidas solo por frecuencia de errores |
| C2 — consistencia | Orden temprano uniforme, atomicidad de errores de negocio e idempotencia | Cero doble movimiento, estados/saldos reconciliados y rollback completo en conflicto |
| C3 — duración crítica | Diferir sincronizaciones redundantes y acotar agregaciones equivalentes | Medición de recálculos por acción y reducción de tiempo de locks sin diferencias monetarias |
| C4 — frontend y carga | Guardia/cola local donde corresponda, invalidación agrupada y 1/3/5 sesiones | Sin duplicados de envío, reintentos limitados y latencias/agotamiento medidos |
| C5 — migración autorizada | Respaldo de definiciones, unidades SQL revisadas y publicación web si aplica | Verificación por ruta, rollback separado, conciliación y seguimiento posterior; no cerrar por un COMMIT exitoso |

Prioridad: C1/C2 antes que agregar índices o ampliar paralelismo. C3 y el plan de GET pueden ejecutarse después de asegurar consistencia, sin cambiar las opciones o pasos habituales del usuario. No se solicita resolver dudas de negocio al cliente: los casos se derivan del código/reglas vigentes y se verifican técnicamente.

### 14.5. Pruebas mínimas para cerrar este frente

- Dos pagos distintos con una misma caja; salida y comisión en la misma caja y en cajas distintas; dos cajas de una ruta.
- Mismo Pago Deuda llamado por padre y por hijo simultáneamente; dos llamadas sobre el mismo pago y repetición después de éxito confirmado.
- Pago individual contra lote con operaciones compartidas y no compartidas; lotes con IDs en orden inverso; importación concurrente con pago preservando la atomicidad actual de cada contrato.
- Derivaciones A→B y B→A; caja compartida entre rutas; Interbank/SafetyPay; cambio de empresa/cuenta mientras se descubre el conjunto de recursos.
- Pago contra cierre, reinicio, eliminación/restauración y modificación del movimiento de comisión. El cierre congelado no debe alterarse.
- Rechazo `55P03` en cada etapa y agotamiento de cuatro llamadas máximas; error de negocio de helper después de iniciar la escritura; transporte interrumpido sin reenvío automático.
- Comparar estados, movimientos por identidad, comisión, saldo banco, recaudación, ganancias y snapshots de cierre con resultado secuencial de referencia. Rollback no debe dejar un estado pagado ni deltas parciales.
- Concurrencia sintética 1/3/5 sesiones y volumen hasta 1.500 operaciones con histórico representativo: medir éxito por acción, rechazos iniciales/finales, deadlocks, latencia total y máxima tenencia de locks. Los 15 tests frontend con mocks no reemplazan estas pruebas de BD.

Criterio de cierre: invariantes financieras y contratos conservados, ninguna carrera/deadlock en la matriz acordada, contención acotada con resultado explícito y comparación de rendimiento antes/después. Cero errores en una muestra vacía o varios `55P03` seguidos de éxito no acreditan por sí solos ese cierre.

### 14.6. Archivos y fuentes a revisar durante la implementación

- `03.operacion_proceso_y_excel.sql`: pago individual/lote, derivación, importación y llamadas a sincronización.
- `04.pago_deuda.sql`: `f_patch_tb_pago_deuda_pagado`, `f_sync_tb_pago_deuda_comision_caja`, match/salida y orden padre/hijo.
- `05.ruta_operacion_y_cajas.sql`: `f_post_tb_operacion_caja`, `f_apply_tb_operacion_caja_delta`, `f_post_tb_operacion_caja_desde_proceso`, ambas firmas de `f_sync_tb_ruta_operacion_kpi_operacion`, sincronización de cajas, cierre y restricciones de movimientos.
- [Mitigación desplegada y límites](67_hotfix_bloqueos_cajas_2026_10_20.md) y [reintentos frontend](68_reintento_automatico_pagos_55p03.md). Commit compartido de entrega: `3fbcd30`; despliegue web funcional no acreditado por este análisis.
- `src/lib/rpc-lock-retry.ts`, servicios de operaciones/Pago Deuda y componentes que inician pagos/refrescos. No ampliar este trabajo a la refactorización de Compensaciones.
- [PostgreSQL: bloqueos explícitos, deadlocks y advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html): locks de fila conservados hasta fin de transacción, orden consistente y coordinación cooperativa. Respalda el criterio de diseño, no demuestra que la solución propuesta ya esté implementada.
- [Supabase: timeouts](https://supabase.com/docs/guides/database/postgres/timeouts): distinguir las capas de timeout y su alcance. Aumentar límites no elimina una espera circular.

### 14.7. Aclaración funcional: varios usuarios y velocidad de consulta

**Requisito:** dos o más personas deben poder trabajar al mismo tiempo sobre operaciones distintas de una misma tabla, sin cambiar el flujo del usuario ni bloquear globalmente la pantalla. PostgreSQL admite esa concurrencia. Compartir tabla no implica que todas las escrituras deban ejecutarse de una en una.

La diferencia está entre la fila que el usuario ve y el conjunto de filas que la función realmente modifica. En este sistema, pagar una operación puede modificar su estado, movimientos, saldo de caja, comisión y KPI por ruta. Operaciones visibles distintas pueden compartir esos últimos recursos.

| Situación | Comportamiento esperado |
| --- | --- |
| Operaciones distintas sin recursos financieros comunes | Procesamiento concurrente, sin serialización global innecesaria |
| Operaciones distintas con la misma caja o KPI | Coordinación breve del recurso común, actualización íntegra de ambos pagos y sin pérdida de saldo |
| Recursos múltiples adquiridos en orden inverso | Corregir el protocolo; no aceptar deadlocks recurrentes como funcionamiento normal |
| Mismo pago recibido dos veces | Validación/idempotencia en backend; nunca dos cargos por el mismo hecho contable |

Ejemplo: usuario A paga la operación 100 y usuario B la 200. Aunque las filas 100/200 sean distintas, si ambas actualizan la caja X y el KPI BCP, existe contención sobre X/BCP. Esa contención puede ser legítima; que termine habitualmente en espera prolongada, deadlock o rechazo al usuario es lo que se debe corregir. El objetivo no es eliminar todos los locks, sino reducir su alcance/duración y mantener un orden consistente. Si una transacción modifica el recurso común, la otra debe coordinarse antes de consumir un saldo que podría estar cambiando.

**Frente A — consistencia y concurrencia (backend prioritario).** Resolver C1–C7: orden uniforme de recursos, alcance de sincronización, atomicidad y repetición segura. Los reintentos son una mitigación acotada y no acreditan la corrección estructural. No depende de que el frontend evite todas las coincidencias: deben soportarse dos clientes distintos y llamadas directas válidas a la API.

**Frente B — velocidad y volumen de llamadas (backend + frontend).** Backend: optimizar las agregaciones y consultas internas con índices justificados, evitando recálculos redundantes. Frontend: no consultar antes de tener contexto, deduplicar solicitudes idénticas, reutilizar contadores y agrupar refrescos tras una acción. No serializar indiscriminadamente todos los GET ni todos los pagos para simular estabilidad.

Las mejoras de backend pueden conservar los contratos y desplegarse sin modificar el frontend por ese motivo. Las mejoras de emisión/caché/refrescos sí requieren publicar los archivos frontend correspondientes. No es necesario cambiar todas las funciones o toda la interfaz, y todavía no existe una lista definitiva de índices a instalar sin medición.

**Orden de resolución:** reproducción controlada e inventario → consistencia de escrituras → reducir tiempo de la sección crítica → eliminar lecturas repetidas y medir índices → pruebas concurrentes y conciliación → despliegue autorizado. No considerar completo el sistema por tolerar dos pruebas aisladas: usar la matriz de la sección 14.5 y medir p95, éxito por acción, reintentos agotados y saldos.

Fundamento oficial: [PostgreSQL y concurrencia MVCC](https://www.postgresql.org/docs/current/mvcc-intro.html) y [bloqueos de filas/deadlocks](https://www.postgresql.org/docs/current/explicit-locking.html). La concurrencia es una capacidad de la base; el protocolo de las funciones debe aprovecharla correctamente. Esta aclaración no implica ejecución de cambios de SQL/frontend, compilaciones, conexiones a BD ni publicación Git.
