# Validación de estados, bandejas y KPI — desarrollo 2026-10-20

## Actualización posterior y cierre de la muestra

La evaluación inicial de etiquetas queda rectificada: POS Solicitado (estado 7) mostrado como Pendiente es una presentación funcional aceptada por el usuario, no un defecto. Se preserva esa presentación, también en la tabla bancaria. El único cambio visual implementado es mostrar Eliminado para estado 10/nombre Eliminado, tanto en presentación operativa como plana. Confirmado por DOM en operación 23306, código 784865656; seis tests unitarios y TypeScript del proyecto app correctos. Evidencia: `outputs/eliminado-label-fix-20261020/bbva.png`.

Se repitió conciliación de los seis KPI fuera de Caja Inicial y Saldo Banco: recaudación 8,400; ingresos 0; ganancias 33.65; salidas 8,480; gastos 18.80; pendiente transferencia 12,604. Los resultados coinciden con las operaciones por ID y la fórmula vigente. POS/Deuda/Link Pago también coinciden en la muestra. El usuario da por cerrado este alcance; no equivale a certificar todos los roles, históricos o concurrencia. Saldo Banco/Caja Inicial quedaron fuera de la última validación solicitada; no se cambió su fórmula.

Las observaciones iniciales que siguen se conservan como historial, no como pendientes vigentes de POS ni de la etiqueta Eliminado.

## Alcance y resultado

Validación de solo lectura contra el proyecto de desarrollo `ouehhtlrcvcixurgonrb` y frontend `127.0.0.1:5173`. No se accedió a producción, no se compilaron funciones, no se modificaron operaciones, no se ejecutaron pagos ni se hizo commit/push. Se inició Vite porque el servidor local estaba detenido; no se ejecutó build.

Se revisaron BBVA (cuatro pestañas), POS, Pago Deuda y adicionalmente Link Pago, presente en los datos aunque la solicitud repite la URL de POS. La sesión local ya estaba autenticada. Prueba con el usuario actual, no constituye aceptación de todos los roles.

**Resultado: conciliación numérica satisfactoria para las casuísticas presentes; aceptación visual pendiente por dos etiquetas de estado incorrectas.**

## Cortes de datos

- POS, Link Pago y Pago Deuda: fecha de registro del 20/10/2026 al 31/10/2026, tal como la interfaz.
- BBVA: caja vigente, A Cuenta WK S.A., cuenta BBVA; no es un filtro de registro desde las 09:00.
- Adjuntos: primera consulta filtra fecha de depósito; la segunda fecha de registro de movimientos. No son universos equivalentes. No sumar indiscriminadamente ambos resultados.
- Se consultó además el registro desde las 09:00: hay 18 operaciones (incluidos SOLICITUD, BANCO y RETORNO) y ocho movimientos. El primer adjunto no incluye todas estas filas, por ejemplo 23297/23298, 23299/23300 y POS/Link Pago. Esta diferencia debe tenerse en cuenta al conciliar.

## Matriz observada en DOM

| Pantalla / pestaña | Filas comprobadas | Resultado |
|---|---|---|
| BBVA Efectivización TC, Todos | 23303 EF pendiente; 23289 POS pagado; 23305 POS solicitado | Tres filas, sin 23306 eliminado |
| BBVA Efectivización TC, Pendientes | 23303 | Filtra Pendiente; no incluye el solicitado 23305 |
| BBVA Efectivización TC, Pagados | 23289 | Correcto |
| BBVA Pago Deuda TC, Todos | 23294, 23296, 23298, 23300 | Cuatro filas BANCO, sin duplicar SOLICITUD ni RETORNO |
| BBVA Pago Deuda TC, Devuelto | 23294, S/400 | Correcto; estado físico 8 Procesado, etapa visual Devuelto por retorno |
| BBVA Pago Deuda TC, Pagado | 23296, S/4,000 | Correcto |
| BBVA Pago Deuda TC, Transferido | 23298, S/4,000 | Correcto; estado físico 8 Procesado, sin retorno |
| BBVA Pago Deuda TC, Solicitado | 23300, S/8,000 | Correcto; etapa visual Solicitado sobre estado físico 3 |
| BBVA Movimientos | 17696, 17697, 17698, 17699, 17700 | Tres salidas y dos devoluciones, correspondientes a caja BBVA |
| BBVA Eliminados | 23306, código 784865656 | Se separa de bandeja activa; etiqueta incorrecta Pendiente |
| POS Todos | 23305 y 23289 | Solicitud y pagado presentes |
| POS Solicitado | 23305 | Filtro correcto, etiqueta incorrecta Pendiente |
| POS Pagados | 23289 | Correcto |
| Link Pago | 23304 | Pagado, S/5,000 depósito / S/4,600 transferencia |
| Pago Deuda Todos | 23299, 23297, 23295, 23293 | Cuatro solicitudes raíz, sin duplicar BANCO/RETORNO |
| Pago Deuda Pendiente Transferencia | 23299 | Correcto |
| Pago Deuda Pendiente Devolución | 23297 | Correcto |
| Pago Deuda Pendiente Comisión | 23293 | Correcto |

Los contadores de pestaña son **pendientes**, no la cantidad de filas de Todos. BBVA Efectivización TC: 2 pendientes frente a 3 filas totales. Pago Deuda TC: 1 solicitud pendiente frente a 4 filas totales. Se confirmó la semántica de `f_get_tb_operacion_bandeja_badges`; no es un error de pérdida de registros.

## Conciliación KPI

SQL independiente y DOM coinciden para POS, Link Pago y Pago Deuda. En BBVA se reconstruyeron los ocho importes con las operaciones de las casuísticas y se contrastaron contra el RPC vigente y DOM. La coincidencia valida la fórmula actual, no define por sí misma una nueva regla contable.

| Pantalla | Valores observados y conciliados |
|---|---|
| POS | Comisión 30; gastos 0; ganancia 30; salidas 80. Solo aporta el pagado 23289; solicitado 23305 no aporta a estos importes |
| Link Pago | Comisión 400; gastos 250.45; ganancia 149.55; salidas 4,600 |
| Pago Deuda | Pendientes 3; pagadas 1; solicitado 16,400; comisión cobrada 60; devuelto 4,400 |
| BBVA | Caja inicial 0; saldo banco -80; recaudación 8,400; ingresos 0; ganancia 33.65; salidas 8,480; gastos 18.80; pendiente transferencia 12,604 |

Desglose BBVA:

- Recaudación: 4,000 EF pendiente + 400 y 4,000 de RETORNO = 8,400.
- Salidas: transferencias de deuda 400 + 4,000 + 4,000, más POS pagado 80 = 8,480. No volver a sumar los movimientos que representan estas mismas transferencias.
- Pendiente transferencia: EF 3,960 + POS solicitado 644 + deuda solicitada 8,000 = 12,604. El estado 7 no desaparece de este KPI.
- Ganancia: 4,000 - 3,960 - 6.20 - 0.15 = 33.65, según la fórmula vigente.
- Gastos: ingresos 6.20 + 6 + 6.20, más salidas de deuda 0.40 = 18.80.
- Saldo banco calculado: 0 + 8,400 - 8,480 = -80. **No equivale al saldo transaccional persistido de caja**: los cinco movimientos BBVA adjuntos netean -4,000 y la caja 3 registra -4,000. El KPI incluye recaudación pendiente y reglas comerciales; confirmar esta definición de negocio antes de exigir igualdad con el libro de movimientos.
- Eliminado 23306 queda fuera de las sumas; conserva su consulta en Eliminados.
- El monto devuelto global de deuda se cuenta sobre SOLICITUD: 400 + 4,000; no agregar nuevamente BANCO ni RETORNO.
- Pendientes globales de deuda incluye tres solicitudes no finalizadas: Solicitado, Transferido y Devuelto pendiente de comisión. No significa tres sin transferir.

## Hallazgos para corregir antes de aceptación final

1. **POS y fila POS de la tabla bancaria:** 23305 tiene estado 7/Solicitado en DB y RPC; el frontend imprime Pendiente. `asistida-operational-board.tsx` usa `pagado ? 'Pagado' : 'Pendiente'`; `bancaria-efectivizacion-table.tsx` usa la misma simplificación. Muestra un estado incorrecto y oculta la diferencia al usuario. El filtro Solicitado sí devuelve la fila. En la tabla bancaria, Pendientes no devuelve esta fila aunque en Todos se rotula Pendiente: incoherencia visual confirmada.
2. **BBVA Eliminados:** 23306 tiene estado 10/Eliminado, pero su celda muestra Pendiente por el render binario de la tabla bancaria. La segregación SQL es correcta; no restaurar ni cambiar estado para arreglar la etiqueta.
3. **Semántica contable pendiente de aceptación:** distinguir saldo proyectado/comercial del KPI y saldo bancario de movimientos persistidos (-80 versus -4,000 en esta prueba). No corregir con un ajuste de saldo sin acordar la definición.
4. Advertencias de accesibilidad en consola sobre controles sin label/aria-label. No son evidencia de un fallo de las sumas.

No se retiraron WHERE de estados ni se ampliaron indiscriminadamente: 8 Procesado en deuda tiene etapas propias; 7 Solicitado en POS es válido; 10 se excluye de activos y KPI pero debe conservarse en eliminados.

## Evidencia y reproducción

- `scripts/dev-state-dom-audit.cjs`: conexión guardada exclusivamente contra desarrollo, TLS validado, transacción READ ONLY con ROLLBACK. Lee configuración existente sin imprimir credenciales. Reconstrucción BBVA específica de estos IDs; no es un test genérico para futuros fixtures modificados.
- `outputs/dev-state-dom-audit-20261020/database.json`: RPC, operaciones, movimientos, verificaciones numéricas y funciones leídas.
- `outputs/dev-state-dom-audit-20261020/dom.json`: snapshots de los resultados finales. No interpretar estados transitorios de carga como resultados.
- Capturas locales `bbva-eliminado.png`, `pos.png`, `linkpago.png`, `pagodeuda.png`. Contienen datos del entorno de prueba, no publicar indiscriminadamente.
- Cero sesiones bloqueadas en la captura SQL. No es prueba de ausencia de bloqueos bajo concurrencia ni una prueba de estrés.

Pendiente: corregir etiquetas con tests de 3/4/7/8/10 y repetir DOM; acordar definición de saldo; completar casuísticas sin fixture actual (eliminados POS/Link Pago/deuda, cierres históricos, otras cuentas y roles). No se certifica todo el sistema con esta muestra.
