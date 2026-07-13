# 18. Operaciones Frontend: KPIs y Bloque Superior

## Objetivo

Definir el bloque KPI superior de `operaciones` usando el backend compacto ya materializado, para que la lectura del frontend no haga `JOIN + SUM` pesados.

La fuente de verdad del bloque principal es la ruta actual, no la caja individual.

## Fuente de verdad backend

### KPI de ruta principal

Usar:

- `f_get_tb_ruta_operacion_kpi`

Tabla fuente:

- `tb_ruta_operacion_kpi`

Semántica:

- una fila por ruta activa;
- lectura directa de valores materializados;
- sin agregados runtime sobre operaciones ni cajas.

### KPI de detalle por caja

Usar:

- `f_get_tb_caja_operativa`
- `f_get_tb_ruta_operacion_caja`

Tabla fuente:

- `tb_caja_operativa`

Semántica:

- snapshot por caja;
- sirve para detalle por empresa/cuenta, no para el bloque superior principal.

## KPIs exactos del bloque superior

### Primera fila

- `Caja Inicial`
- `Caja Actual`
- `Total Recaudado`
- `Ingresos`
- `Salidas`
- `Gastos Operacionales`
- `Ganancias`

### Segunda fila

- `Pendiente a Depositar`
- `Ingresos Retenidos`
- `Total Efectivización`
- `Total Pago Deuda`

## Mapeo exacto de datos

Desde `tb_ruta_operacion_kpi`:

- `Caja Inicial` -> `caja_inicial`
- `Caja Actual` -> `caja_actual`
- `Total Recaudado` -> `total_recaudado`
- `Ingresos` -> `ingresos`
- `Salidas` -> `salidas`
- `Gastos Operacionales` -> `gastos_operacionales`
- `Ganancias` -> `ganancias`
- `Ingresos Retenidos` -> `ingresos_retenidos`
- `Pendiente a Depositar` -> `pendiente_depositar`
- `Total Efectivización` -> `total_efectivizacion`
- `Total Pago Deuda` -> `total_pago_deuda`

## Regla de lectura

- el bloque superior principal siempre lee por ruta;
- no se consulta sumando cajas en vivo;
- no se consulta sumando operaciones en vivo;
- si la empresa cambia, el bloque principal sigue siendo de ruta, pero el detalle inferior puede reaccionar a la empresa activa.

## Relación con empresa activa

La empresa activa:

- no rompe el KPI materializado principal de ruta;
- sí sirve para:
  - formularios inline;
  - Excel;
  - bandejas operativas;
  - detalle por empresa/caja si se implementa debajo.

## Comportamiento visual

Visualmente el bloque debe usar:

- cards estándar de `Untitled UI`;
- colores del tema claro/oscuro del sistema compacto;
- animación de entrada con `Framer Motion`;
- grid estable, sin reacomodo arbitrario.

No se debe:

- inventar tarjetas de “variación %”;
- agregar comparativos temporales;
- insertar subtítulos de analytics no definidos.

## Estados visuales

### Estado con data

- muestra el valor directo;
- montos con formato moneda;
- contadores enteros para `Total Efectivización` y `Total Pago Deuda`.

### Estado sin data

- mostrar `0` o `S/ 0.00` según corresponda;
- no ocultar cards;
- mantener el grid completo.

### Estado loading

- usar skeletons o placeholders estándar de `Untitled UI`;
- la disposición de cards no debe colapsar.

## Archivos backend a tomar como referencia

- `backend_implementacion/05.ruta_operacion_y_cajas.sql`

## Regla para otra IA

Otra IA debe entender que:

- el bloque KPI superior ya quedó cerrado contra `tb_ruta_operacion_kpi`;
- no debe reintroducir cálculos pesados en lectura;
- la empresa activa no reemplaza el KPI de ruta;
- el contrato visual ya está cerrado.
