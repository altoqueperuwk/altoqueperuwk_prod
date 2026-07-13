# 26. Operaciones: lectura de Excel/HTML y cabeceras por banco

## Objetivo

Documentar como esta implementada la lectura de archivos `.xlsx`, `.xls`, `.html` y `.htm` en Operaciones, incluyendo la deteccion automatica de cabeceras por banco y la transformacion final hacia `p_datos_excel_json`.

Este documento existe para que la nueva web compactada reutilice la logica ya validada y no vuelva a resolver desde cero el problema de cabeceras, HTML exportado por bancos o variaciones de formatos.

## Archivos fuente actuales

La implementacion vigente se basa en:

- `src/features/operaciones/config/excel-header-config.ts`
- `src/features/operaciones/components/excel-upload-utils.ts`
- `src/features/operaciones/components/excel-upload-modal.tsx`
- `src/features/operaciones/components/operacion-page-layout.tsx`

Responsabilidad de cada archivo:

- `excel-header-config.ts`: define los alias de cabeceras por ruta/banco y la funcion de deteccion de fila cabecera.
- `excel-upload-utils.ts`: lee archivos Excel/HTML, convierte tablas a matriz, normaliza fechas y construye filas normalizadas.
- `excel-upload-modal.tsx`: contiene la experiencia de carga/proceso en modal del sistema actual.
- `operacion-page-layout.tsx`: contiene el flujo inline actual de carga y el armado de parametros hacia la RPC.

## Formatos soportados

El lector acepta:

- `.xlsx`
- `.xls`
- `.html`
- `.htm`

Para archivos Excel nativos se usa la libreria `xlsx`.

Para archivos HTML/HTM:

- detecta si el contenido empieza con `<html` o `<table`;
- detecta tablas embebidas en el documento;
- convierte cada tabla encontrada a matriz usando `XLSX.utils.table_to_sheet`;
- selecciona la tabla con mejor puntaje, priorizando la que contiene cabeceras reconocidas;
- si el HTML apunta a archivos externos tipo `sheet001.htm` o `_archivos/`, se considera no legible directamente.

## Normalizacion de cabeceras

Antes de comparar cabeceras, el sistema normaliza cada texto.

Reglas de normalizacion:

- convierte el valor a `string`;
- elimina tildes;
- elimina simbolos;
- reemplaza caracteres no alfanumericos por espacios;
- colapsa espacios repetidos;
- aplica `trim`;
- convierte a minusculas.

Esto permite que diferencias por tildes, simbolos, codificacion o espacios no rompan la deteccion de cabeceras.

Ejemplo conceptual:

```ts
"Nro. de operación" -> "nro de operacion"
"Nº operación"     -> "n operacion"
"Fecha de Pago"    -> "fecha de pago"
```

## Regla para detectar fila de cabecera

La funcion revisa fila por fila hasta encontrar una cabecera valida.

Una fila se considera valida cuando encuentra como minimo:

- columna de `monto`;
- columna de `codigo_operacion`.

Las columnas `dni`, `fecha_pago`, `hora_proceso`, `nombre_cliente_banco_ingreso` y `estado` pueden depender del banco.

Si no se encuentra una fila que cumpla la regla minima, el archivo debe marcarse como invalido por cabecera no detectada.

## Bancos y rutas con carga Excel

Las rutas bancarias que deben soportar carga Excel son:

- `/operaciones/bcp`
- `/operaciones/bbva`
- `/operaciones/scotiabank`
- `/operaciones/banbif`
- `/operaciones/interbank`
- `/operaciones/safetypay`

Rutas que no deben usar el lector Excel bancario estandar:

- `/operaciones/pos`
- `/operaciones/linkpago`
- `/operaciones/pagodeuda`

Nota importante:

- En el sistema actual legacy, Interbank aparece como `/operaciones/f35`.
- En la web compactada, Interbank debe trabajar como `/operaciones/interbank`.
- La nueva implementacion debe mapear la configuracion legacy de F35 hacia Interbank o definir directamente la key `/operaciones/interbank` con los mismos alias.

## Cabeceras aceptadas por banco

### BCP

```ts
{
  dni: ["Descripcion operacion"],
  monto: ["Monto"],
  codigo_operacion: ["Nº operacion"],
  fecha_pago: ["Fecha"]
}
```

Cabeceras reales esperadas:

- `dni`: `Descripcion operacion`
- `monto`: `Monto`
- `codigo_operacion`: `Nº operacion`
- `fecha_pago`: `Fecha`

Caso especial:

- BCP tiene una correccion de offset cuando la fila viene desplazada una columna.
- El sistema compara valores estrictos y desplazados para decidir si debe leer con `offset = -1`.

### BBVA

```ts
{
  dni: ["Codigo"],
  monto: ["Importe Pagado"],
  codigo_operacion: ["Nro Movimiento"],
  fecha_pago: ["Fecha Pago"]
}
```

Cabeceras reales esperadas:

- `dni`: `Codigo`
- `monto`: `Importe Pagado`
- `codigo_operacion`: `Nro Movimiento`
- `fecha_pago`: `Fecha Pago`

### BanBif

```ts
{
  dni: ["Cod.Integr."],
  monto: ["Imp.Total"],
  codigo_operacion: ["Nro.Recibo"],
  fecha_pago: ["Fec.Pago"]
}
```

Cabeceras reales esperadas:

- `dni`: `Cod.Integr.`
- `monto`: `Imp.Total`
- `codigo_operacion`: `Nro.Recibo`
- `fecha_pago`: `Fec.Pago`

### Scotiabank

```ts
{
  dni: ["Usuario"],
  monto: ["Importe"],
  codigo_operacion: ["Operacion"],
  fecha_pago: ["Fecha de proceso"],
  hora_proceso: ["Hora de proceso"]
}
```

Cabeceras reales esperadas:

- `dni`: `Usuario`
- `monto`: `Importe`
- `codigo_operacion`: `Operacion`
- `fecha_pago`: `Fecha de proceso`
- `hora_proceso`: `Hora de proceso`

### Interbank

En el sistema actual legacy esta configurado como `/operaciones/f35`. En la web compactada debe usarse como `/operaciones/interbank`.

```ts
{
  dni: ["Deudor"],
  monto: ["Monto pagado"],
  codigo_operacion: ["Nro. de operacion"],
  fecha_pago: ["Fecha de pago"]
}
```

Cabeceras reales esperadas:

- `dni`: `Deudor`
- `monto`: `Monto pagado`
- `codigo_operacion`: `Nro. de operacion`
- `fecha_pago`: `Fecha de pago`

### SafetyPay

```ts
{
  dni: ["Nro. Documento"],
  monto: ["Importe de la venta", "Monto"],
  codigo_operacion: ["Id. de transaccion", "Transaccion"],
  fecha_pago: ["Fecha", "Fecha de Creacion"],
  nombre_cliente_banco_ingreso: ["Nombre del banco de pago", "Nombre del Banco"],
  estado: ["Estado"]
}
```

Cabeceras reales esperadas:

- `dni`: `Nro. Documento`
- `monto`: `Importe de la venta` o `Monto`
- `codigo_operacion`: `Id. de transaccion` o `Transaccion`
- `fecha_pago`: `Fecha` o `Fecha de Creacion`
- `nombre_cliente_banco_ingreso`: `Nombre del banco de pago` o `Nombre del Banco`
- `estado`: `Estado`

SafetyPay tiene tratamiento especial de fechas porque puede venir con formato tipo `MM/DD/YYYY` o serial numerico como texto.

## Construccion de filas normalizadas

Luego de detectar la fila de cabecera, cada fila posterior se transforma a este contrato:

```ts
{
  dni: string;
  monto: string;
  codigo_operacion: string;
  fecha_pago: string;
  hora_proceso: string;
  nombre_cliente_banco_ingreso: string;
  estado: string;
}
```

El arreglo resultante se envia al backend como:

```ts
p_datos_excel_json
```

Reglas de construccion:

- se ignoran filas completamente vacias;
- se omiten filas de totales;
- todos los valores viajan como texto normalizado desde frontend;
- el backend se encarga de parsear DNI/documento, monto, fecha, cliente y reglas de efectivizacion.

## Manejo especial de fechas

El lector soporta:

- serial Excel numerico;
- `YYYYMMDD`;
- `YYYY-MM-DD`;
- `YYYY/MM/DD`;
- `YYYY-MM-DD HH:mm:ss`;
- `DD/MM/YYYY`;
- `DD-MM-YYYY`;
- fecha con hora;
- texto parseable por `Date`.

Cuando una fecha no tiene hora, se normaliza a `00:00:00` o se completa luego en backend segun la regla vigente.

SafetyPay usa una normalizacion adicional:

- acepta serial Excel como numero;
- acepta serial Excel como texto;
- interpreta `MM/DD/YYYY` cuando corresponde;
- si no puede resolverlo con su regla especial, cae al parser general.

## Filas omitidas por frontend

El frontend no debe enviar:

- filas completamente vacias;
- filas cuyo estado/texto indique `Total de registros`;
- filas cuyo estado/texto indique `Total registros`.

## Errores esperados en frontend

El frontend debe mostrar error cuando:

- no existe configuracion de cabeceras para la ruta;
- no se puede leer el archivo;
- el archivo esta vacio;
- no se encuentra fila de cabecera;
- no se generan filas validas para procesar.

Mensajes recomendados:

- `No hay configuracion de columnas para esta ruta.`
- `No se pudo leer el archivo o esta vacio.`
- `No se encontraron encabezados de columna en el archivo.`
- `No se encontraron filas para procesar.`

Cuando falle por cabecera, la nueva web compactada debe mostrar tambien:

- banco/ruta actual;
- columnas minimas requeridas;
- alias aceptados para ese banco.

## Contrato con backend compacto

La RPC compacta principal para Excel bancario es:

```sql
f_post_tb_operacion_proceso_excel
```

Parametros relevantes:

```ts
{
  p_datos_excel_json,
  p_id_codigo_servicio,
  p_nombre_codigo_servicio,
  p_id_comunidad,
  p_nombre_comunidad,
  p_id_tipo_deposito,
  p_nombre_tipo_deposito,
  p_id_empresa_ingreso,
  p_nombre_empresa_ingreso,
  p_id_banco,
  p_id_usuario,
  p_nombre_usuario,
  p_ruta_actual
}
```

Reglas importantes:

- `p_datos_excel_json` contiene las filas normalizadas desde frontend.
- `p_ruta_actual` debe enviarse siempre en la nueva web compactada.
- Si `p_ruta_actual` viene informado, backend resuelve la caja primaria de ingreso de la ruta.
- Si la empresa enviada no coincide con la caja primaria de ingreso, backend responde error.
- Si la ruta no tiene caja primaria configurada, backend responde error.
- La cuenta de ingreso se resuelve por empresa + banco de la ruta.

## Duplicados y filas omitidas por backend

El backend omite duplicados con la regla:

- `dni_cliente`
- `codigo_operacion_deposito_cliente`
- `id_codigo_servicio`
- `id_empresa_cuenta_ingreso`
- ventana de `7 days`

Mensaje esperado:

- `Duplicado en los ultimos 7 dias`

Esto significa que el frontend no debe intentar resolver duplicados manualmente. Solo debe mostrar los contadores y detalle devueltos por la RPC.

## Contrato minimo para nueva implementacion

La nueva web compactada debe implementar el lector con estas piezas:

- configuracion centralizada de cabeceras por banco;
- funcion de normalizacion de cabeceras;
- lector unico para `.xlsx`, `.xls`, `.html`, `.htm`;
- deteccion de fila cabecera por alias;
- construccion del arreglo `p_datos_excel_json`;
- errores claros cuando falte cabecera o ruta;
- cero hardcode de cabeceras dentro del componente visual.

No se debe implementar una logica distinta por componente visual. El componente de carga solo debe orquestar:

1. obtener config de cabeceras por ruta;
2. leer archivo;
3. detectar cabecera;
4. construir filas normalizadas;
5. llamar RPC;
6. mostrar contadores.

## Test plan

Validar por banco:

- cargar un `.xlsx`;
- cargar un `.xls` si existe muestra real;
- cargar un `.html` o `.htm` exportado desde banco;
- validar cabeceras con tildes y sin tildes;
- validar cabeceras con simbolos;
- validar archivo con filas vacias;
- validar archivo con fila de totales;
- validar error cuando falte `monto`;
- validar error cuando falte `codigo_operacion`;
- validar que `p_datos_excel_json` tenga las claves esperadas.

Validaciones especificas:

- BCP debe soportar el corrimiento de columna con `offset = -1`.
- SafetyPay debe soportar alias alternativos de monto, transaccion, fecha y banco.
- SafetyPay debe soportar fechas tipo `MM/DD/YYYY` y serial numerico como texto.
- Interbank debe funcionar con `/operaciones/interbank` aunque el sistema actual legacy lo tuviera como `/operaciones/f35`.

Validaciones backend:

- ruta sin caja primaria debe devolver error.
- empresa distinta a caja primaria debe devolver error.
- duplicados dentro de 7 dias deben ir a omitidos.
- filas invalidas deben ir a errores con detalle.
- filas correctas deben incrementar `filas_procesadas`.

