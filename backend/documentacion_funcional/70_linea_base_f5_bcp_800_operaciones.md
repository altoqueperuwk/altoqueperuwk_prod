# Línea base F5: BCP en desarrollo

Dos recargas de `http://127.0.0.1:5173/operaciones/bcp`, con 800 operaciones pendientes preparadas de Hueso y 300 de Capital Nova. Se midieron RPC iniciadas durante los primeros 20 segundos mediante Resource Timing. Las duraciones incluyen red, servidor y recepción; **no son tiempos exclusivos de SQL**.

Evidencia: `outputs/performance-bcp-20261019/f5-1.json`, `f5-2.json` y `resumen.json`. Se registraron nombres y tiempos, no parámetros, DNIs, claves ni tokens. Los tamaños no estuvieron disponibles por restricciones entre orígenes.

## Resultados

Cada recarga registró **62 RPC** en la ventana inicial. Máximos por función, no percentiles:

| Función | Llamadas por recarga | Máximo F5 1 | Máximo F5 2 |
| --- | ---: | ---: | ---: |
| f_get_tb_operacion_bandeja_unificada | 4 | 5489 ms | 1389 ms |
| f_get_tb_pago_deuda_match_flags_lote | 1 | 1487 ms | 1041 ms |
| f_get_tb_banco | 1 | 223 ms | 1177 ms |
| f_get_tb_ruta_operacion_gastos_salida_v2 | 4 | 957 ms | 1022 ms |
| f_get_tb_operacion_retencion_empresa_badges | 2 | 958 ms | 1000 ms |
| f_get_tb_operacion_retencion_bandeja_badges | 4 | 341 ms | 709 ms |
| f_get_tb_ruta_operacion_kpi_operaciones_v2 | 4 | 532 ms | 709 ms |
| f_get_tb_empresa_cuenta_bancaria | 4 | 573 ms | 559 ms |

También hubo 7 llamadas a comunidad, 7 a código de servicio y 6 a estado por recarga. Repetir el nombre no demuestra igualdad de parámetros: no se capturaron cuerpos.

Tareas largas del hilo principal: 68 en la primera muestra (máximo 581 ms) y 11 en la segunda (máximo 869 ms). Justifican perfilar la interfaz, pero no atribuyen la causa a un componente concreto; el entorno de desarrollo y la medición introducen ruido.

## Orden de mejora propuesto

1. Frontend: revisar contexto listo y solicitudes idénticas compartidas en `use-bancaria-bandeja.ts`, `use-bancaria-kpis.ts` y `use-bancaria-tab-badges.ts`. Agrupar refrescos sin perder invalidaciones ni mezclar usuarios. La raíz usa StrictMode: parte de las ejecuciones extra puede ser exclusiva de desarrollo; no desactivarlo para ocultarlas.
2. Backend: medir planes representativos de la bandeja unificada; revisar filtros, joins, proyección y volumen devuelto. Justificar índices con planes y revisar los existentes. Conservar permisos, estados, contratos y exportaciones.
3. Matching: medir accesos por cliente/operación/rango y evitar recalcular lotes sin cambios; conservar el procesamiento por lote, sin consultas por fila.
4. Badges, gastos y KPI: evitar reconstruir bandejas completas para contar y trabajo repetido. El pico aislado de bancos no demuestra que sea el cuello principal.
5. Interfaz: perfilar transformación y renderizado con filas pobladas; reducir recalculados y actualizaciones completas, revisando la virtualización existente.

No sumar solicitudes paralelas como tiempo de carga. Dos muestras no permiten establecer p95 ni extrapolar a producción. Tampoco prueban ausencia de bloqueos: eso requiere observar PostgreSQL durante concurrencia.

## Alcance de cambios y verificación

Se agregó `src/lib/rpc-performance-diagnostics.ts`, limitado a host local, desarrollo y proyecto Supabase de desarrollo. La integración temporal en `src/lib/supabase.ts` fue retirada tras medir: no queda activa por defecto. Se conservan el módulo y cuatro pruebas para repetir el diagnóstico.

`npx vitest run src/lib/rpc-performance-diagnostics.test.ts src/lib/rpc-lock-retry.test.ts`: **19 pruebas aprobadas**. No se ejecutaron pagos, modificaciones SQL, build, despliegue, commit ni push para esta medición.

Continúa el [plan de rendimiento](66_plan_rendimiento_rutas_bancarias.md). Referencias: [StrictMode](https://react.dev/reference/react/StrictMode), [Resource Timing](https://www.w3.org/TR/resource-timing/).

## Primera mejora implementada: contadores por empresa

`use-bancaria-tab-badges.ts`: la respuesta por empresa contiene todas las pestañas. Ahora se conserva dentro del hook y se deriva el contador localmente al cambiar de pestaña, sin volver a consultar por ese único motivo. No hay caché global ni cambios de contratos. Se mantiene la recarga por cuenta, ruta, fecha y `refreshKey`; Movimientos continúa sin consultar y al volver se recarga. Una respuesta pendiente se filtra con la pestaña actual, no con una captura anterior.

Pruebas automatizadas: cambio de pestaña sin otra solicitud, suma de Unificado, refresco por mutación, cambio de pestaña durante respuesta pendiente, exclusión de Movimientos y cambio de cuenta. Junto con las pruebas de reintento: **18 pruebas aprobadas**. Pendiente validar DOM y repetir mediciones; no atribuir todavía una reducción del F5 inicial a este cambio. Sigue pendiente optimizar la bandeja, KPI y SQL con planes medidos. Sin compilación SQL ni publicación.
