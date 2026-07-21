# Cargar Y Procesar Archivo

## Objetivo

Cargar el archivo bancario de BCP y convertir las filas detectadas en operaciones de efectivizacion.

## 1. Seleccionar Archivo

Arrastrar o seleccionar el archivo desde el bloque de carga.

Formatos permitidos:

- `.xlsx`
- `.xls`
- `.html`
- `.htm`
- `.txt`

**Imagen 1:** pegar captura del bloque de carga sin archivo.

## 2. Confirmar Archivo Cargado

Cuando el archivo se carga, el sistema muestra:

- Nombre del archivo
- Peso
- Estado de lectura
- Filas detectadas
- Barra de progreso

**Imagen 2:** pegar captura del archivo seleccionado.

## 3. Procesar

Presionar `Procesar`.

El sistema validara cada fila y generara el resultado de la carga.

**Imagen 3:** pegar captura del boton `Procesar` activo.

## 4. Revisar Resultado

Validar contadores:

- Procesados: operaciones creadas correctamente.
- Omitidos: operaciones que ya existen y no se vuelven a cargar.
- Errores: filas que no pudieron procesarse.

**Imagen 4:** pegar captura de los contadores despues de procesar.

## Resultado Esperado

Las operaciones procesadas aparecen en el tab `Efectivizacion`.
