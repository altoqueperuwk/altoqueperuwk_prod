# Plan: documento de ocho dígitos en TXT BCP

Fecha: 04/11/2026. Estado actual: implementado y validado en desarrollo.
Las secciones del plan conservan las decisiones de la fase previa; el resultado
de la ejecución se documenta al final.

## Objetivo y alcance

Permitir, exclusivamente en la lectura del TXT de BCP, tratar los dos casos
observados: documento numérico de nueve dígitos y documento de ocho dígitos con
espacios de relleno y sufijo literal `I`. Conservar las filas que hoy se aceptan
y los demás campos. Alcance ampliado por solicitud del usuario el 04/11/2026.

La fase inicial creó solo este documento. Posteriormente el usuario autorizó
implementar el plan en desarrollo; véase el resultado al final.

## Evidencia del archivo ampliado

Archivo analizado: `Reporte de cobros-CREP-COBRANZAS-2026-10-30.txt`.
Numeración física, desde 1 e incluyendo la cabecera:

| Concepto | Resultado |
|---|---:|
| Cabeceras CC | 1 |
| Movimientos DD | 113 |
| Movimientos aceptados por el parser actual | 111 |
| Documentos de nueve dígitos | 1 |
| Otro movimiento rechazado por estructura | 1 |
| Suma de todos los movimientos DD | S/626,723.00 |
| Suma de filas que el parser actual acepta | S/619,443.00 |

La fila 114 tiene el campo de documento `00000414236225`, documento normalizado
`414236225`, monto S/6,280.00 y código de operación `02059216`.
Fecha, hora, monto y referencia cumplen las comprobaciones actuales.
El rechazo se produce por exigir exactamente ocho dígitos al documento.

La fila 90 tiene el mismo campo `     70413425I` en las posiciones humanas
14–27 y 139–152. Falla la expresión que exige `DD` seguido de 25 dígitos.
Su monto es S/1,000.00 y su código de operación `01798650`. Los ocho dígitos
son `70413425`; la `I` es un sufijo, no parte del DNI. No se atribuye un
significado bancario a esa letra, porque el archivo no lo documenta.
Este caso también forma parte del cambio solicitado.

La primera línea `CC` se excluye por ser cabecera; no representa un movimiento
perdido. Las 111 filas de la precarga son las 113 líneas DD menos los dos casos
descritos. El contador «Omitidos: 0» corresponde al procesamiento posterior y
no informa estas exclusiones de la precarga.

## Decisión necesaria: cuáles ocho dígitos

La propuesta es conservar los **últimos ocho dígitos**, respetando la alineación
a la derecha del campo numérico actual. En el ejemplo:

| Campo | Valor |
|---|---|
| Campo completo de 14 caracteres | `00000414236225` |
| Documento observado | `414236225` |
| Propuesta: últimos ocho | `14236225` |
| Alternativa: primeros ocho del documento observado | `41423622` |

El TXT, por sí solo, no demuestra que el primer dígito sea un prefijo descartable
ni acredita cuál de esos documentos corresponde al cliente. Antes de implementar,
confirmar con el responsable de la trama o una referencia fiable del movimiento
que `14236225` es el resultado esperado. No interpretar automáticamente todos los
documentos de nueve dígitos del sistema como DNI: otros flujos admiten CE.

Esta confirmación define la regla de extracción; no exige modificar el contrato
del backend ni crear un nuevo tipo documental.

## Cambio propuesto

Archivo de lógica:
`src/features/operaciones/efectivizacion/shared/utils/excel-parser.ts`.

Única función afectada: `parseBcpTxtRows`.

1. Mantener la lectura del campo documento en índice 138 y longitud 14
   (posiciones humanas 139–152), sin desplazar otros campos de la trama.
2. Mantener el resultado actual para documentos normalizados de ocho dígitos,
   incluidos los ceros iniciales, por ejemplo `03286502`.
3. Solo para el caso numérico de nueve dígitos y una trama válida, aplicar la
   extracción aprobada. Si se confirma la propuesta, tomar los últimos ocho.
   La autorización posterior de implementar este plan se aplicó con la propuesta
   de los últimos ocho dígitos. No constituye una certificación de identidad.
4. No usar un truncamiento general de cualquier longitud: documentos con más
   de nueve dígitos deben conservar su rechazo actual.
5. Para el caso `I`, separar la validación del prefijo `DD` y los 11 dígitos
   siguientes de la validación del campo de documento de 14 caracteres.
   Conservar la ruta de validación actual para los registros numéricos.
   Añadir una alternativa acotada que admita únicamente espacios de relleno
   a la izquierda, exactamente ocho dígitos y una `I` mayúscula final.
   Aplicar esa alternativa a ambos campos documentales y exigir que sus ocho
   dígitos coincidan en este nuevo caso. Extraer `70413425`, sin convertirlo
   a número ni usar el sufijo como dígito.
6. Mantener la validación final de exactamente ocho dígitos y las comprobaciones
   actuales de monto, fecha, hora y referencia. No admitir letras arbitrarias,
   letras dentro del DNI, sufijos distintos, documentos vacíos ni campos
   documentales inconsistentes por ampliar este caso.
7. Conservar el contrato `dni: EFECTIVO000000<ocho dígitos>`, el código extraído
   de la referencia, los importes y todos los demás valores del objeto ExcelRow.
8. No modificar el parser de Excel/HTML, las rutas de otros bancos ni las
   validaciones generales de DNI/CE del sistema.

La implementación no debe usar Number/parseInt para reconstruir el DNI ni
eliminar dígitos del código de operación por confundirlo con el documento.

## Pruebas previstas

Archivo:
`src/features/operaciones/efectivizacion/shared/utils/excel-parser.test.ts`.

- Regresión con los ejemplos BCP actuales, tanto BM como TERMIB.
- Documento válido de ocho dígitos sin cambios.
- Documento de ocho dígitos con cero inicial conservado.
- Campo observado de nueve dígitos: salida exacta según la regla aprobada.
- Documentos de más de nueve dígitos y campos malformados: conservar rechazo.
- Tramas con referencia, fecha o monto inválido: no admitirlas por normalizar DNI.
- Fila 90 del reporte: aceptar el caso exacto `     70413425I` y producir
  `EFECTIVO00000070413425`, S/1,000.00 y código `01798650`.
- Sufijo `I` con un DNI que comienza en cero: conservar los ocho dígitos.
- Casos negativos: sufijo `X`, `I` intermedia, siete/nueve dígitos con `I`,
  discrepancia entre campos y prefijo bancario malformado deben rechazarse.
- Archivo de tres líneas: pasar de una fila detectada a dos; conservar montos
  S/3,000.00 y S/6,280.00 y códigos `00344470` y `02059216`.
- Archivo ampliado: 113 filas detectadas si se aprueba tomar los últimos ocho
  del caso numérico de nueve dígitos y se incorpora el caso `I`;
  las 111 filas actuales deben coincidir campo por campo y en el mismo orden.
- Comprobar colisiones: distintos documentos originales que terminen en los
  mismos ocho dígitos no deben interpretarse como evidencia de identidad.
  En el archivo ampliado no se observaron colisiones entre documentos originales
  distintos bajo la propuesta. La garantía no se extiende a otros archivos.

Usar fixtures sintéticos o mínimos para las pruebas versionadas, evitando copiar
el reporte completo de clientes al repositorio.

## Simulación realizada, sin editar el código

Se ejecutó el parser actual y una variante exclusivamente en memoria que toma
los últimos ocho dígitos solo cuando el documento normalizado tiene nueve.

| Métrica | Actual | Simulación |
|---|---:|---:|
| Filas detectadas | 111 | 112 |
| Suma de montos detectados | S/619,443.00 | S/625,723.00 |
| Filas previamente aceptadas que cambian | — | 0 |

La única incorporación sería el código `02059216`, monto S/6,280.00,
documento enviado `EFECTIVO00000014236225`. Quedaría pendiente la fila 90,
por S/1,000.00, que explica la diferencia con el total del reporte.
Esta simulación inicial cubrió solamente nueve dígitos y sirve como comparación;
el alcance ampliado debe cubrir las dos filas.

### Criterio de aceptación ampliado

| Métrica | Actual | Objetivo con ambos casos |
|---|---:|---:|
| Cabeceras excluidas | 1 | 1 |
| Movimientos detectados | 111 | 113 |
| Suma de montos detectados | S/619,443.00 | S/626,723.00 |
| Filas previamente aceptadas que cambian | — | 0 |

El objetivo de 113 filas es un criterio pendiente de implementación y prueba,
no el resultado de una modificación ya aplicada. Se incorporan exclusivamente
los códigos `02059216` y `01798650`, conservando el orden del reporte.

Esta simulación acredita la diferencia de parsing, no la identidad del cliente
ni el éxito de registrar la operación en la base de datos.

## Validación posterior en desarrollo

1. Confirmar la regla de ocho dígitos e implementar el cambio acotado.
2. Ejecutar los tests del parser y comprobación TypeScript.
3. En `/operaciones/bcp`, cargar ambos TXT y validar por DOM los contadores:
   dos filas para el archivo reducido y 113 para el ampliado.
4. Validar el documento, código y monto de la fila nueva antes de procesar.
   La prueba de detección no requiere pulsar Procesar ni crear operaciones.
5. Si se requiere una prueba de registro, usar un caso controlado en desarrollo
   y comprobar cliente asociado, regla de comisión, duplicidad y monto; es una
   verificación posterior distinta del conteo del parser.
6. Preparar diff únicamente del parser y sus pruebas. El despliegue queda para
   una instrucción posterior; este plan no autoriza publicar en producción.

## Backend y entrega

No se prevén cambios de SQL, tablas, RPC ni firmas de request/response.
No habría funciones que compilar por este ajuste. El backend recibe el mismo
contrato documental de ocho dígitos que ya procesa para BCP.

La mejora de informar filas descartadas durante la precarga y sus motivos queda
como propuesta adicional. El soporte acotado del sufijo `I` de la fila 90 sí
queda incluido en este plan actualizado.

## Implementación ejecutada en desarrollo

El usuario autorizó implementar ambos casos después de revisar el plan.
Se modificaron exclusivamente `excel-parser.ts` y `excel-parser.test.ts`, además
de actualizar este documento. No hubo cambios de SQL ni funciones compiladas.

- Documento numérico normalizado de nueve dígitos: últimos ocho.
- Sufijo `I`: exactamente cinco espacios, ocho dígitos y `I` final, con ambos
  campos documentales idénticos y prefijo bancario numérico válido.
- No se admiten otros sufijos ni documentos numéricos de diez o más dígitos.
- Contrato, importes, referencia y orden de las filas conservados.

Verificación realizada:

- 31 pruebas del importador aprobadas, incluyendo el recorrido de carga de File
  TXT y el rechazo de ese formato en una ruta distinta de BCP.
- Reporte real ampliado: 113 filas, total S/626,723.00.
- Las 111 filas aceptadas antes del cambio son idénticas y mantienen el orden
  (comparación de hashes SHA-256 por fila contra la línea base previa).
- Archivo reducido real: dos filas detectadas.
- DOM en localhost BCP: precarga muestra «113 filas detectadas», procesados 0,
  omitidos 0 y errores 0. No se pulsó Procesar ni se crearon operaciones.

Evidencia local:
`outputs/bcp-txt-document-dev-20261104/verification.json` y `preload-113.png`.
Producción no se actualizó; no se realizó commit ni push en esta tarea.
