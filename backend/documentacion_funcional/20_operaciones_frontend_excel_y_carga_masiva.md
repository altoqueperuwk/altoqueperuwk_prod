# 20. Operaciones Frontend: Excel y Carga Masiva

> **Estado vigente 22/08/2026:** La carga se ejecuta con el contrato descrito en
> [`backend/CONTEXTO_GENERAL_BACKEND.md`](../CONTEXTO_GENERAL_BACKEND.md). Las reglas
> antiguas de `flag_retencion` y de `tb_recaudacion_regla_abono` no determinan la
> retencion de las cuentas hardcodeadas. Si el texto historico de esta guia
> contradice este bloque, prevalece este bloque y el codigo vigente.

### Estado operativo actual

- Se aceptan `.xlsx`, `.xls`, `.html`, `.htm` y `.txt` BCP.
- El TXT BCP conserva la hora real informada por el archivo y se guarda en UTC con
  visualizacion en hora de Lima; el codigo corto se extrae del campo bancario, por
  ejemplo `0218526500391250` produce `00391250`.
- La validacion de duplicados se realiza antes de cliente, reglas y comisiones:
  servicio + codigo + monto a 2 decimales + ventana de 7 dias, incluyendo historicas
  y eliminadas. La primera fila repetida se procesa y las siguientes se omiten.
- La consulta de duplicidad usa el indice especializado y el bloqueo advisory para
  cargas concurrentes.
- La carga mantiene movimientos de trazabilidad, pero evita recalculos innecesarios
  por fila; el proceso de 720 filas queda preparado para terminar en segundos bajo
  el escenario validado.
- Al finalizar Excel se actualiza la vista sin limpiar la seleccion persistente de
  las bandejas bancarias.
- Para las cuentas hardcodeadas `(5,33,3)`, `(7,16,4)`, `(8,7,3)`, `(5,4,2)` y
  `(6,5,2)`, solo `fecha_deposito_cliente` y la hora de Lima deciden la retencion.
  Scotiabank/BanBif usan 21:00; BCP usa 00:00. No hay liberacion automatica.

## Estado vigente

El bloque de carga actualmente soporta archivos bancarios:

- `.xlsx`
- `.xls`
- `.html`
- `.htm`
- `.txt` para BCP cuando el banco entrega el nuevo formato plano.

Reglas vigentes:

- El detalle visual de la carga se oculta para evitar fatiga visual.
- No se muestran las dos tablas de preview/procesamiento como bloque operativo principal.
- En BCP TXT se toma el codigo de operacion corto.
- La fecha operacional del deposito es `fecha_deposito_cliente`.
- Para Pago Deuda, el match automatico usa la fecha operacional del deposito, no la fecha de carga ni `CURRENT_DATE`.
- Scotiabank y Banbif pueden retener ingresos si la cuenta bancaria tiene `flag_retencion = true`.
- `f_post_tb_operacion_proceso_excel` y `f_post_tb_operacion_proceso_excel_ganancia` usan `hora_proceso` del Excel cuando la fecha tiene time `00:00:00`, en lugar de `current_time`.

La seccion antigua de tipos soportados queda reemplazada por esta lista vigente.

## Objetivo

Congelar el bloque de carga masiva de `efectivizacion-bancaria`, usando `Webpage.png` como contrato visual y el frontend actual como fuente técnica del proceso de parsing, validación y ejecución.

## Ubicación exacta

El bloque Excel vive debajo de los tres formularios inline y antes del bloque de tabs operativos + datatable.

No se implementa como popup principal en la nueva versión.

## Estructura visual exacta

Título del bloque:

- `Sube Un archivo Excel: [Empresa]`

Zonas:

1. dropzone principal
2. preview del archivo cargado
3. acciones:
   - `Procesar`
   - `Cancelar`

## Regla funcional principal

La empresa debe estar seleccionada antes de procesar.

Esa empresa:

- viene del contexto transversal de empresa activa;
- aparece en el título del bloque;
- gobierna la resolución operativa del archivo.

## Tipos de archivo soportados

- `.xlsx`
- `.xls`
- `.html`
- `.htm`

## Fuente técnica obligatoria

Usar como referencia funcional directa:

- `src/features/operaciones/components/excel-upload-modal.tsx`
- `src/features/operaciones/components/excel-upload-utils.ts`
- `src/features/operaciones/config/excel-header-config.ts`

## Flujo técnico que debe documentarse

### 1. Carga de archivo

- el usuario selecciona o arrastra un archivo;
- se obtiene `ArrayBuffer`;
- se detecta si el archivo es HTML o Excel binario;
- se arma una matriz normalizada de celdas.

### 2. Detección de encabezado

- se usa configuración por ruta;
- se busca encabezado compatible con aliases;
- si no hay match, el archivo se rechaza.

### 3. Construcción de filas

- la matriz se transforma a filas de negocio;
- se arma `p_datos_excel_json`;
- la estructura de salida depende de la configuración de encabezados de la ruta.

### 4. Llamada RPC por ruta

Rutas estándar:

- usar operación Excel estándar

Rutas de ganancia:

- usar operación Excel de ganancia

La documentación debe dejar cerrada la regla exacta de mapeo por ruta, tomando la lógica real ya existente.

## Comportamiento por familia

### Efectivización bancaria

Rutas con Excel:

- `bcp`
- `bbva`
- `scotiabank`
- `banbif`
- `interbank`
- `safetypay`

### Efectivización asistida

Rutas con flujo especial:

- `pos`
- `linkpago`

La documentación debe dejar explícito si usan flujo estándar o flujo tipo ganancia según el comportamiento ya existente.

## Errores que la UI debe contemplar

- ruta sin configuración Excel;
- archivo sin encabezado válido;
- empresa no seleccionada;
- error en lectura de archivo;
- error de RPC;
- filas omitidas o rechazadas según respuesta del backend.

## Resultado esperado de la UI

La UI debe poder mostrar:

- archivo cargado;
- estado de proceso;
- resultado de filas procesadas;
- errores funcionales devueltos por backend.

No debe inventar:

- un flujo distinto de parsing;
- un contrato de archivo alternativo;
- una carga paso a paso distinta a la ya cerrada.

## Regla visual

Visualmente:

- usar patrones base de `Untitled UI`;
- la dropzone puede ser composición propia;
- no apartarse del look general del sistema compacto;
- aplicar `Framer Motion` en aparición de preview y estados de procesamiento.

## Regla para otra IA

Otra IA debe entender que:

- el bloque de Excel ya está cerrado visual y técnicamente;
- el contrato de parsing ya existe en el frontend actual;
- el comportamiento debe migrarse, no rediseñarse.
