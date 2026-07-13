# 27. Operaciones: datatable inline de Efectivizacion

## Objetivo

Documentar como debe construirse el datatable del tab `Efectivizacion` en la nueva web compactada.

El objetivo no es copiar pixel a pixel el diseño actual, sino conservar la logica de negocio inline ya validada en:

- `src/features/operaciones/components/operacion-page-layout.tsx`

La nueva implementacion debe usar componentes estandar de Untitled UI para:

- tabla;
- checkboxes;
- dropdowns;
- badges;
- menus de acciones;
- paginacion;
- popups/drawers auxiliares.

Pero la logica funcional debe tomarse del flujo actual.

## Diferencia con el datatable simple del compacto

El datatable simple del compacto muestra columnas basicas:

- checkbox;
- codigo;
- DNI;
- cliente;
- estado;
- monto;
- empresa;
- fecha;
- paginacion.

Para `Operaciones > Efectivizacion`, ese formato es insuficiente.

El datatable de Efectivizacion debe ser una tabla operativa enriquecida, porque cada fila permite:

- visualizar informacion resumida y secundaria con badges;
- cambiar facturacion;
- cambiar tipo de deposito;
- cambiar banco/cuenta de ingreso segun reglas;
- cambiar comunidad;
- cambiar empresa/cuenta de salida;
- cambiar banco de transferencia;
- recalcular comisiones;
- autoguardar la fila;
- marcar pagado;
- reanudar;
- derivar;
- reasignar;
- abrir edicion/visualizacion.

## Fuentes de datos

### Lectura principal

Usar la RPC:

```ts
f_get_tb_operacion_proceso
```

Parametros funcionales esperados:

```ts
{
  p_id_codigo_servicio,
  p_excluir_cerrados: true,
  p_contexto: "efectivizacion",
  p_ruta_actual,
  p_ids_empresa_cuenta_ingreso,
  p_id_banco_empresa_cuenta_ingreso,
  p_id_usuario,
  p_codigo_operacion_deposito_cliente,
  p_dni_cliente,
  p_id_estado,
  p_id_comunidad,
  p_fecha_desde,
  p_fecha_hasta,
  p_id_empresa_ingreso
}
```

Reglas:

- `p_id_codigo_servicio` viene de la ruta actual.
- `p_contexto` debe ser `"efectivizacion"`.
- `p_ruta_actual` debe ser la ruta activa, por ejemplo `/operaciones/bcp`.
- `p_id_usuario` limita la bandeja normal a operaciones del usuario/gestor segun la logica vigente.
- Si existe empresa activa global, enviar `p_id_empresa_ingreso`.
- Por defecto, si no hay fechas, consultar desde el inicio de los ultimos 4 dias hasta el final del dia actual.

### Conteos

Usar:

```ts
f_get_tb_operacion_proceso_counts
```

El conteo debe respetar la ruta, servicio, usuario y cuentas de ingreso de la ruta.

## Columnas funcionales del datatable

### 1. Seleccion

Usar checkbox de Untitled UI.

Reglas:

- seleccion multiple;
- soportar seleccionar todo lo visible;
- la seleccion alimenta acciones masivas:
  - `Pagado`;
  - `Reanudar`;
  - `Derivar`;
  - `Reasignar`;
  - `Cambio Empresa`.

### 2. Facturacion

Columna visual:

- badge principal: `Boleta` o `Sin Boleta`;
- badge secundario: empresa de ingreso.

Comportamiento inline:

- si la operacion no esta pagada, permitir dropdown.
- opciones:
  - `Boleta`;
  - `Sin Boleta`.
- al cambiar, actualizar `tipo_facturacion`.
- guardar inmediatamente con `f_put_tb_operacion_proceso`.

Restricciones:

- si esta `Pagado`, solo lectura.
- en modo derivaciones, solo lectura.

### 3. Cod. Op.

Columna visual:

- linea principal: `codigo_operacion_deposito_cliente`;
- debajo: badge/dropdown de `tipo_deposito`.

Comportamiento inline de `tipo_deposito`:

- opciones se calculan desde reglas activas segun:
  - comunidad;
  - cuenta/banco de ingreso;
  - servicio/ruta.
- al cambiar:
  - actualizar `id_tipo_deposito`;
  - actualizar `nombre_tipo_deposito`;
  - resolver regla activa;
  - recalcular comisiones;
  - guardar fila.

Restricciones:

- si no hay regla activa, mostrar error y no guardar.
- si esta `Pagado`, solo lectura.
- en derivaciones, solo lectura.

### 4. DNI

Columna visual:

- linea principal: `dni_cliente`;
- debajo: badge/dropdown de banco/cuenta de deposito/ingreso.

Si `dni_cliente` esta vacio:

- mostrar input corto;
- aceptar solo numeros;
- maximo 8 digitos para DNI;
- cuando llega a 8 digitos, buscar cliente y autoguardar.

Comportamiento inline de banco/cuenta ingreso:

- opciones se obtienen desde reglas activas y cuentas permitidas para la ruta.
- al cambiar:
  - resolver regla activa;
  - actualizar datos de ingreso;
  - recalcular comisiones;
  - guardar fila.

Restricciones:

- si esta `Pagado`, solo lectura.
- en derivaciones, solo lectura.
- si solo existe una opcion, mostrar como badge no editable.

### 5. Comunidad

Columna visual:

- badge/dropdown con `nombre_comunidad`.

Comportamiento:

- opciones vienen de catalogo `tb_comunidad`.
- al cambiar:
  - actualizar `id_comunidad`;
  - actualizar `nombre_comunidad`;
  - resolver regla activa con comunidad + tipo deposito + cuenta ingreso;
  - recalcular comisiones;
  - guardar fila.

Restricciones:

- si esta `Pagado`, solo lectura.
- en derivaciones, solo lectura.

### 6. Empresa Salida

Columna visual:

- dropdown compuesto empresa + cuenta bancaria.
- debe mostrar nombre de empresa y banco/cuenta debajo o como badge.

Comportamiento:

- opciones deben salir de empresas/cuentas habilitadas para la ruta operativa.
- al cambiar empresa/cuenta:
  - actualizar `id_empresa_salida`;
  - actualizar `nombre_empresa_salida`;
  - actualizar `id_empresa_cuenta_salida`;
  - actualizar `id_banco_empresa_cuenta_salida`;
  - autoseleccionar como banco transferencia el banco de la cuenta elegida;
  - recalcular comision de salida;
  - guardar fila.

Restricciones:

- si esta `Pagado`, solo lectura.
- en `Derivaciones`, esta columna si puede ser editable porque la ruta destino atiende la salida.

### 7. Banco Transf.

Columna visual:

- badge/dropdown con banco destino de transferencia.

Comportamiento:

- por defecto, cuando se cambia `Empresa Salida`, debe seleccionar el banco de la cuenta salida.
- si el usuario lo cambia manualmente:
  - actualizar `id_banco_cliente_transferencia`;
  - actualizar `nombre_banco_cliente_transferencia`;
  - recalcular comision de salida;
  - guardar fila.

Opciones:

- bancos activos que permiten deposito;
- excluir bancos de tipo no valido para transferencia si aplica la regla actual.

Restricciones:

- si esta `Pagado`, solo lectura.

### 8. Monto

Mostrar:

```ts
monto_deposito_cliente
```

Formato:

```ts
S/ 0,000.00
```

No editable inline.

### 9. Comision

Mostrar:

- `resultado_comision_servicio`;
- badge del porcentaje o comision minima aplicada;
- badge de comision extra si existe.

Reglas visuales:

- si `monto_deposito_cliente > monto_minimo_deposito_servicio`, mostrar `%`.
- si no supera minimo, mostrar monto minimo `S/`.
- si `comision_monto_extra_servicio > 0`, mostrar badge extra.

La comision se recalcula al cambiar:

- comunidad;
- tipo deposito;
- banco/cuenta ingreso;
- empresa/cuenta salida;
- banco transferencia;
- comision extra.

### 10. Transferencia

Mostrar:

```ts
monto_transferencia_cliente
```

Comportamiento:

- debe tener accion de copiar al portapapeles.
- al copiar, mostrar toast de exito.

No editable inline.

### 11. Estado

Columna visual:

- badge/dropdown.

Estados principales:

- `Pendiente`;
- `Pagado`;
- `Rechazado`;
- `Error` si aplica.

Comportamiento:

- si se selecciona `Pagado`, no guardar directo.
- abrir confirmacion de pago.
- al confirmar:
  - guardar fila si corresponde;
  - ejecutar `f_put_tb_operacion_pagado`;
  - refrescar datatable;
  - refrescar contadores/KPIs.

Restricciones:

- si ya esta `Pagado`, solo lectura.
- si esta recalculando, bloquear control.

### 12. Hora

Mostrar:

- hora de `fecha_deposito_cliente`;
- debajo, fecha en formato `DD/MM/YYYY`.

No usar `fecha_registro` para esta columna.

### 13. Acciones

Usar menu de acciones de Untitled UI.

Para fila no pagada:

- `Pagado`;
- `Editar`;
- `Derivar`;
- `Pago Deuda` si tiene match con pago deuda;
- `Com. Extra`;
- `Calcular`;
- `Cambiar Empresa`;
- `Visualizar` si se desea mantener acceso rapido.

Para fila pagada:

- `Reanudar`;
- `Visualizar`.

Para modo derivaciones:

- si no esta pagada:
  - `Pagado`;
  - `Visualizar`;
- si esta pagada:
  - `Visualizar`.

## Flujo de autoguardado inline

La nueva implementacion debe conservar este flujo:

1. El usuario cambia un dropdown o campo inline.
2. Se crea una copia de la fila.
3. Se actualizan campos dependientes.
4. Si el cambio afecta reglas/comisiones, llamar calculo.
5. Con el resultado, actualizar:
   - `resultado_comision_servicio`;
   - `monto_transferencia_cliente`;
   - `resultado_comision_banco_ingreso`;
   - `resultado_comision_banco_salida`.
6. Guardar la fila.
7. Actualizar el estado local de la tabla.
8. Mostrar toast.

En el sistema actual, el calculo usa:

```ts
f_get_tb_operacion_calculo_modal
```

En el backend compacto, usar la funcion compacta equivalente:

```ts
f_get_tb_operacion_proceso_calculo
```

si ya reemplazo el nombre anterior.

El guardado actual usa:

```ts
f_put_tb_operacion_proceso
```

En el backend compacto, usar la funcion PATCH/POST equivalente definida en `03.operacion_proceso_y_excel.sql`.

## Acciones masivas

La tabla debe mantener seleccion multiple para acciones por lote.

### Pagado por lote

Validaciones:

- requiere una o mas filas seleccionadas.

RPC actual:

```ts
f_put_tb_operacion_pagado_lote
```

Resultado esperado:

- mostrar cuantas operaciones fueron procesadas;
- limpiar seleccion;
- refrescar registros;
- refrescar conteos/KPIs.

### Reanudar por lote

Validaciones:

- requiere una o mas filas seleccionadas.
- normalmente aplica sobre operaciones pagadas o rechazadas segun regla vigente.

RPC actual:

```ts
f_put_tb_operacion_reanudar_lote
```

Resultado esperado:

- limpiar seleccion;
- refrescar registros;
- refrescar conteos/KPIs.

### Cambio de empresa por lote

Validaciones:

- requiere empresa destino;
- requiere una o mas operaciones seleccionadas.

RPC actual:

```ts
f_put_tb_operacion_cambiar_empresa
```

Parametros:

```ts
{
  p_ids,
  p_id_empresa_nueva,
  p_id_usuario
}
```

Resultado esperado:

- limpiar seleccion;
- cerrar modal;
- refrescar registros;
- refrescar conteos/KPIs;
- refrescar cajas/configuracion si aplica.

### Derivar

Debe abrir modal de derivacion con operaciones seleccionadas.

La derivacion:

- mueve la responsabilidad operativa a otra ruta bancaria;
- no duplica la fila;
- deja de aparecer en Efectivizacion normal de la ruta origen;
- aparece en Derivaciones de la ruta destino.

## Reglas de solo lectura

Una fila debe bloquear cambios inline cuando:

- `nombre_estado = Pagado`;
- esta en proceso de recalculo;
- el modo es `Derivaciones` y el campo pertenece al bloque de ingreso;
- no existe mas de una opcion valida para ese dropdown.

Campos editables en Efectivizacion normal:

- facturacion;
- tipo deposito;
- DNI si esta vacio;
- banco/cuenta ingreso si existe mas de una opcion;
- comunidad;
- empresa/cuenta salida;
- banco transferencia;
- estado.

Campos editables en Derivaciones:

- empresa/cuenta salida;
- banco transferencia;
- estado a pagado.

Campos no editables en Derivaciones:

- facturacion;
- codigo;
- DNI;
- comunidad;
- tipo deposito;
- banco/cuenta ingreso;
- monto;
- comision de ingreso.

## Filtros del tab Efectivizacion

Filtros minimos:

- `Cod. Operacion`;
- `DNI`;
- `Estado`;
- `Buscar`;
- `Limpiar`.

Reglas:

- `DNI` puede disparar busqueda con debounce cuando llega a 8 digitos.
- `Cod. Operacion` puede disparar busqueda con debounce desde 3 caracteres.
- si no hay fechas explicitas, usar rango default de ultimos 4 dias.
- la empresa activa global debe filtrarse con `p_id_empresa_ingreso`.

## Layout visual recomendado con Untitled UI

No copiar las clases personalizadas del sistema actual.

Usar componentes base:

- `Table` o `DataTable` de Untitled UI;
- `Checkbox`;
- `Badge`;
- `Dropdown/Menu`;
- `Button`;
- `Pagination`;
- `Modal/Dialog`;
- `Toast`.

La estructura visual debe ser:

1. toolbar de filtros;
2. toolbar de acciones;
3. tabla con seleccion multiple;
4. paginacion;
5. modales auxiliares.

La tabla debe mantener el criterio visual de informacion secundaria en una misma celda:

- `Facturacion`: boleta + empresa ingreso;
- `Cod. Op.`: codigo + tipo deposito;
- `DNI`: DNI + banco ingreso;
- `Hora`: hora + fecha.

## Framer Motion

Aplicar motion moderado:

- entrada de tabla al cambiar tab;
- aparicion de filas;
- aparicion/cierre de modales;
- cambios de filtros.

No usar animacion invasiva en celdas porque la tabla es operativa y debe leerse rapido.

## Test plan

### Lectura

- Cargar tabla con operaciones pendientes.
- Cargar tabla con operaciones pagadas.
- Validar que operaciones pagadas bloquean controles inline.
- Validar que la tabla vacia conserva cabecera y paginacion.

### Inline

- Cambiar facturacion y verificar autoguardado.
- Cambiar comunidad y verificar recalculo.
- Cambiar tipo deposito y verificar recalculo.
- Cambiar empresa/cuenta salida y verificar que banco transferencia se seleccione automaticamente.
- Cambiar banco transferencia y verificar recalculo.
- Copiar monto de transferencia.
- Ingresar DNI faltante y verificar busqueda/autoguardado.

### Estado

- Seleccionar `Pagado` y validar que abre confirmacion.
- Confirmar pagado y verificar refresco.
- Reanudar operacion pagada.
- Rechazar o volver a pendiente segun estados permitidos.

### Acciones por lote

- Seleccionar varias filas y marcar pagado.
- Seleccionar varias filas y reanudar.
- Seleccionar varias filas y cambiar empresa.
- Seleccionar varias filas y derivar.

### Derivaciones

- Verificar que en modo derivaciones solo se edita salida y pago.
- Verificar que no se puede modificar informacion de ingreso.

## Regla de oro

La nueva web compactada puede cambiar el look usando Untitled UI, pero no debe simplificar la logica operativa de Efectivizacion al punto de perder:

- subinformacion por celda;
- dropdowns inline;
- recalculo automatico;
- autoguardado;
- acciones por lote;
- reglas de solo lectura por estado;
- flujo de pagado con confirmacion;
- derivacion y reasignacion.

