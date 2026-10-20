# SQL de lecturas bancarias y validación DOM — 20/10/2026

## Entorno y alcance

Solo desarrollo: proyecto `ouehhtlrcvcixurgonrb`, frontend `http://127.0.0.1:5173/operaciones/bcp`. Sin acceso a producción, pagos, derivaciones, cambios de estados, build, commit ni push durante esta intervención. Las definiciones anteriores y rollback sin ejecutar están en `outputs/sql-bcp-performance-20261020/`.

Se actualizaron cuatro funciones mediante CREATE OR REPLACE en una transacción con `lock_timeout=1s`, comparando las definiciones con el respaldo antes de reemplazarlas. No se ejecutaron DROP, ALTER TABLE ni cambios de índices. Se conservaron firmas y formatos de respuesta.

## Cambios SQL

- `f_get_tb_operacion_bandeja_unificada`: ordenar filas antes de convertir a JSON, con barrera OFFSET 0 para evitar adelantar esa expansión al ordenamiento.
- `f_get_tb_operacion_retencion_bandeja_badges`: seleccionar solamente las columnas utilizadas por los conteos y sus ramas.
- `f_get_tb_operacion_retencion_empresa_badges`: reducir las columnas de la CTE reutilizada por los conteos, conservando el universo de Pago Deuda y las reglas de retención.
- `f_get_tb_ruta_operacion_gastos_salida_v2`: materializar el contexto de cajas una vez para evitar lecturas repetidas dentro de la condición correlacionada.

No se modificó `f_get_tb_ruta_operacion_kpi_operaciones_v2`; únicamente se midió. No se instalaron índices especulativos: el coste observado en gastos mejoró reduciendo la repetición de lecturas.

## Comparación SQL

EXPLAIN (ANALYZE, BUFFERS), muestras puntuales sobre la misma conexión de desarrollo, no percentiles ni benchmark controlado de producción:

| Función | Antes | Después | Observación |
| --- | ---: | ---: | --- |
| Bandeja unificada, Hueso | 92,097 ms | 85,951 ms | Bloques temporales escritos: 649 → 322 |
| Badges de bandeja | 11,253 ms | 11,094 ms | Diferencia pequeña; no afirmar mejora significativa |
| Badges por empresa | 101,882 ms | 92,878 ms | Sigue consultando Pago Deuda; 5087 bloques compartidos consultados |
| Gastos de salida | 70,027 ms | 6,458 ms | Bloques compartidos consultados: 12485 → 110 |

Los bloques compartidos consultados aquí son hits de caché, no lecturas físicas de disco. La bandeja sigue usando espacio temporal; no se eliminó todo el trabajo de serialización/recepción.

**29 comparaciones de resultado idénticas**, mediante cantidad y hash del agregado de filas antes/después dentro de una misma transacción REPEATABLE READ. Casos: cinco rutas bancarias, empresa/cuenta Hueso y Capital Nova donde aplica, consulta global e histórico. Algunos casos de otras rutas/histórico pueden estar vacíos: esto no sustituye fixtures históricos completos ni aceptación funcional financiera.

Evidencias: `before-functions.json`, `indexes.json`, `baseline.json`, `deployment.json`, `rollback-functions.sql`. Los hashes comparan resultados sin guardar DNIs ni payloads de operaciones.

## Prueba DOM y tiempos de cliente

Dos F5, recursos RPC iniciados en los primeros 20 segundos. Duración de cliente = servidor + red + recepción; no confundir con EXPLAIN.

| Función | Máximo F5 1 | Máximo F5 2 | Llamadas por F5 |
| --- | ---: | ---: | ---: |
| Bandeja unificada | 1463 ms | 3644 ms | 4 |
| Matching por lote | 912 ms | 1199 ms | 1 |
| Gastos salida v2 | 767 ms | 958 ms | 4 |
| KPI operaciones v2 | 648 ms | 1140 ms | 4 |
| Badges por empresa | 1099 ms | 786 ms | 2 |

**62 RPC por F5**, todas las capturadas con estado 200. No hay evidencia suficiente para afirmar que la página completa ya carga más rápido: persisten variación de red y solicitudes repetidas. La prueba anterior tenía máximos de bandeja de 5489 y 1389 ms; no son condiciones controladas para atribuir diferencias exclusivamente a SQL.

DOM validado: Hueso 800 operaciones, Capital Nova 300; cambio a Pago Deuda muestra Hueso 26 y Capital Nova 24. En el mismo `performance.timeOrigin`, el contador de llamadas a badges por empresa permaneció **2 → 2** al cambiar a Pago Deuda, confirmando la reutilización frontend implementada antes. Se regresó a Efectivización y se verificaron filas pobladas. Sin errores en el registro de consola consultado.

Evidencia: `dom-f5-1.json`, `dom-f5-2.json`, `dom-summary.json`, `dom-tab-switch.json`, `bcp-validado.jpg`. La instrumentación temporal se desconectó otra vez de `supabase.ts` al finalizar.

## Bloqueos y concurrencia de lectura

Observación de 45 segundos con 63 muestras de pg_stat_activity / pg_blocking_pids; simultáneamente se ejecutaron 12 consultas GET repartidas en tres conexiones. **0 muestras con sesiones bloqueadas, 0 esperas Lock, 12 GET completadas sin errores.** La ventana incluyó la primera recarga DOM; no toda la sesión de navegador.

Esto demuestra únicamente el resultado de esa ventana de lecturas. No prueba ausencia permanente de bloqueos ni corrige/valida la concurrencia de pagos que actualizan cajas/KPI compartidos. No se cancelaron ni terminaron sesiones. Evidencia: `lock-observation.json`.

## Verificación y trabajo restante

22 pruebas automatizadas aprobadas: badges, reintentos 55P03 e instrumentación local. No se hizo build. Scripts de diagnóstico/despliegue local: `scripts/dev-bcp-sql-performance.cjs`, `scripts/dev-bcp-sql-deploy.cjs`, `scripts/dev-bcp-lock-observe.cjs`; requieren las dependencias locales descritas en su código y verifican el proyecto de desarrollo. No son un desplegador genérico de producción.

Pendientes: deduplicación de solicitudes iniciales con contexto estable, perfil de renderizado/JSON y volumen de bandeja, evitar reconstrucción de Pago Deuda para conteos donde se demuestre equivalente, pruebas concurrentes de escrituras con conciliación, fixtures históricos y medición con usuarios representativos antes de desplegar a producción.

Fundamento: [PostgreSQL: materialización de CTE](https://www.postgresql.org/docs/current/queries-with.html#QUERIES-WITH-CTE-MATERIALIZATION) y [estadísticas de actividad y esperas](https://www.postgresql.org/docs/current/monitoring-stats.html). Continúa los documentos 66 y 70.
