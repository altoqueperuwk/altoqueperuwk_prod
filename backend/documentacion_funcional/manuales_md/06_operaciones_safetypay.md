# Manual Operativo: /operaciones/safetypay

## Objetivo

Este manual explica como trabajar en `/operaciones/safetypay`. SafetyPay es una ruta de recaudacion: se carga archivo, se registran operaciones pagadas, se clasifica modalidad Manual/Automatico, se retienen ingresos y se confirma cuando el dinero se libera.

No se considera el boton `Configuracion`.

## 1. Ingreso A La Ruta

### Que ve el usuario

- empresas configuradas para SafetyPay;
- KPIs;
- modales operativos;
- carga Excel con selector Manual/Automatico;
- tabs Efectivizacion, Movimientos y Retenidos.

### No se muestra

- Pago Deuda.
- Derivados.
- POS.
- boton PD.

Imagen sugerida:

- pantalla principal SafetyPay.

## 2. Empresa Y KPIs

La empresa activa define la caja SafetyPay que se esta revisando.

KPIs importantes:

- Caja Actual.
- Caja Recaudacion.
- Retencion Recaudacion.
- Total Efectivizacion.

Regla:

- SafetyPay retiene ingresos, por eso el monto puede aparecer en Retencion Recaudacion antes de entrar a Caja Actual.

Imagen sugerida:

- KPIs SafetyPay con retencion.

## 3. Carga Excel SafetyPay

### Que ve el usuario

- selector de empresa;
- selector de modalidad `Automatico` o `Manual`;
- panel para subir archivo;
- estado del archivo;
- contadores Procesados, Omitidos y Errores;
- botones Procesar y Cancelar.

### Modalidad

- Automatico: el cliente opero directamente por SafetyPay.
- Manual: el cliente pidio un codigo SafetyPay al usuario o empresa.

### Regla del archivo

- Si el Excel tiene columna Estado, solo se procesan filas `Pagado`.
- Filas `Pendiente` se omiten.
- Si no existe columna Estado o viene vacia, se entiende que todo esta pagado.

### Pasos

1. Seleccionar empresa.
2. Elegir Manual o Automatico.
3. Adjuntar archivo.
4. Presionar Procesar.
5. Revisar Procesados, Omitidos y Errores.

Resultado esperado:

- las filas pagadas aparecen en Efectivizacion;
- las filas pendientes quedan omitidas;
- los ingresos quedan retenidos.

Imagen sugerida:

- carga SafetyPay con selector Manual/Automatico.

## 4. Efectivizacion SafetyPay

### Para que sirve

Muestra operaciones recaudadas por SafetyPay.

### Columnas especiales

- Modalidad: Manual o Automatico.
- No se muestra boton PD.
- No se muestra selector de cuenta cliente debajo del DNI.

### Filtros

- Cod. Operacion.
- DNI.
- Todos.
- Pendientes.
- Pagados.

### Botones rapidos

- Emp. Ingreso: corrige empresa/cuenta de ingreso si hubo error.
- Emp. Salida: asigna la empresa/cuenta que atendera la salida.
- Modalidad: cambia Manual/Automatico en operaciones pendientes seleccionadas.
- Pagar: atiende operaciones pendientes.
- Derivar: envia operaciones a otra ruta bancaria.
- Directo: aplica flujo directo.
- Reiniciar: revierte operaciones no cerradas.

### Modalidad por fila

La columna Modalidad permite corregir una operacion puntual si se cargo con modalidad equivocada.

Imagen sugerida:

- tabla SafetyPay con columna Modalidad y boton Modalidad.

## 5. Retenidos SafetyPay

### Para que sirve

Muestra ingresos que SafetyPay aun no libero.

### Que debe hacer el usuario

1. Revisar operaciones retenidas.
2. Validar en banco/SafetyPay que el dinero ya fue liberado.
3. Seleccionar filas liberadas.
4. Presionar Confirmar.

Resultado esperado:

- baja Retencion Recaudacion;
- sube Caja Actual;
- la fila sale de Retenidos.

Imagen sugerida:

- tab Retenidos SafetyPay.

## 6. Movimientos

### Para que sirve

Muestra movimientos confirmados de la caja SafetyPay.

Regla:

- ingresos retenidos pendientes no aparecen como ingresos normales;
- aparecen como ingreso cuando se confirma la retencion.

Imagen sugerida:

- mini tabla o tab Movimientos SafetyPay.

## 7. Modales Operativos

### Mover Saldo

Permite mover dinero de SafetyPay hacia otra caja.

Uso esperado:

- se usa cuando el dinero ya esta disponible en caja.

### Ingreso y Salidas

Permite registrar movimientos manuales.

### Operacion Efectivizacion

Permite crear una operacion manual SafetyPay.

Regla:

- debe respetar la caja principal configurada para recaudacion SafetyPay.

Imagen sugerida:

- modales SafetyPay.

## 8. Cierre Y Reportes

### Cierre

Cierra movimientos confirmados.

No cierra:

- retenidos pendientes.

### Descargar

Genera reporte del periodo actual o historico.

Imagen sugerida:

- cierre SafetyPay con retenidos pendientes.

## Reglas Importantes

- SafetyPay procesa solo filas pagadas cuando existe columna Estado.
- Modalidad es informativa y puede corregirse.
- SafetyPay retiene ingresos.
- No existe Pago Deuda en SafetyPay.
- No existe boton PD en SafetyPay.
- No confirmar retenciones hasta que el dinero este liberado.
