# Excel histórico BCP — desarrollo, 06/11/2026

## Alcance

Se añadió soporte al reporte de movimientos históricos utilizado por Serviprest
S.A. en `/operaciones/bcp`, mediante detección de cabeceras. No se codificó el
nombre o ID de la empresa; otras empresas BCP pueden usar el mismo formato.

Archivos modificados:

- `src/features/operaciones/efectivizacion/shared/utils/excel-parser.ts`
- `src/features/operaciones/efectivizacion/shared/utils/excel-parser.test.ts`

## Mapeo

| Columna de origen | Campo enviado |
|---|---|
| Descripción operación | dni, conservando la descripción completa |
| Monto | monto |
| Operación - Número | codigo_operacion, conservando ceros iniciales |
| Fecha | fecha_pago normalizada |
| Operación - Hora | hora_proceso |
| Sin columna de origen | nombre_cliente_banco_ingreso = null |
| Sin columna de origen | estado = null |

Se añadieron alias para las columnas de número y hora. En Excel BCP cuyo
documento se toma de «Descripción operación», solo se admiten descripciones que
contengan EFECTIVO, sin distinguir mayúsculas/minúsculas. La coincidencia se
busca exclusivamente en esa columna, no en referencias ni otras celdas.

Para el nuevo formato histórico se utilizan las posiciones exactas de cabecera,
sin desplazar celdas por el heurístico de filas incompletas. Los valores null se
aplican al nuevo formato; los demás formatos conservan su salida previa.

Se mantuvo el parser TXT BCP, incluidos nueve dígitos/sufijo I. La lectura de
otros bancos no aplica el filtro EFECTIVO. No se modificaron SQL, tablas, RPC,
reglas de comisión ni asignaciones de la empresa.

## Validación

Archivo adjunto: `031_movimientos_historicos (2).xlsx`.

- Cabecera en fila 5; 24 movimientos de origen.
- 19 movimientos EFECTIVO, sumando S/110,465.00.
- Cinco filas excluidas: impuestos, comisión de recaudación y salidas.
- Se compararon los siete campos de cada una de las 19 filas con el origen.
- 39 pruebas de parser aprobadas, incluyendo TXT y formatos anteriores.
- TypeScript sin errores: `npx tsc --noEmit -p tsconfig.app.json`.
- DOM en localhost: Serviprest seleccionada y 19 filas detectadas en precarga.
  No se pulsó Procesar ni se registraron operaciones.

Evidencia: `outputs/bcp-serviprest-import-dev-20261106/verification.json`
y `preload-19.png`.

El adjunto no fue editado. No hubo build de Vite, compilación SQL, cambios en
producción, commit ni push. La prueba de registro queda para validación del usuario.
