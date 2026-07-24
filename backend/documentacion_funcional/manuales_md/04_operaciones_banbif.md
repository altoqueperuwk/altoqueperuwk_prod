# Manual Operativo: /operaciones/banbif

## Objetivo

Este manual explica como trabajar en `/operaciones/banbif`. Banbif trabaja como banco operativo y tambien maneja retenciones, igual que Scotiabank.

No se considera el boton `Configuracion`.

## 1. Ingreso A La Ruta

### Que ve el usuario

- selector de empresa;
- selector de cuenta si aplica;
- KPIs;
- carga Excel;
- tabs Efectivizacion, Pago Deuda, Derivados, POS, Movimientos y Retenidos.

### Para que sirve

Permite cargar operaciones Banbif, atender pagos, confirmar retenciones y cerrar caja.

Imagen sugerida:

- pantalla principal Banbif.

## 2. Empresa, Cuenta Y KPIs

La empresa/cuenta activa es la caja sobre la que se trabaja.

KPIs importantes:

- Caja Actual.
- Salidas.
- Gastos Operacionales.
- Ganancias.
- Retencion Recaudacion o Ingresos Retenidos.

Regla:

- el dinero retenido no esta disponible hasta confirmacion manual.

Imagen sugerida:

- KPIs Banbif.

## 3. Carga Excel

### Para que sirve

Carga operaciones reportadas por Banbif.

Resultado esperado:

- aparecen en Efectivizacion;
- si corresponde retencion, aparecen tambien en Retenidos;
- no aumentan Caja Actual hasta confirmarse.

Imagen sugerida:

- carga de archivo Banbif.

## 4. Efectivizacion

### Tipo de deposito

Banbif puede usar:

- Mismo Dia.
- Dia Siguiente.

Este dato afecta comision y transferencia.

### Botones rapidos

- Emp. Ingreso: corrige empresa/cuenta de ingreso.
- Emp. Salida: cambia empresa/cuenta de salida.
- Pagar: atiende operaciones pendientes.
- Derivar: envia a otra ruta.
- Directo: flujo directo.
- Reiniciar: vuelve una operacion pagada a pendiente si no fue cerrada.

### Acciones por fila

- PD: match con Pago Deuda.
- Com. Especial.
- Com. Extra.
- Directo.
- Visualizar.

Imagen sugerida:

- tabla Efectivizacion Banbif.

## 5. Retenidos

### Que muestra

Operaciones cuyo ingreso aun esta retenido por Banbif.

### Para que sirve

Permite confirmar manualmente cuando el banco libera el dinero.

### Pasos

1. Entrar al tab Retenidos.
2. Revisar fecha y monto.
3. Seleccionar las filas liberadas por el banco.
4. Presionar Confirmar.

Resultado esperado:

- sube Caja Actual;
- baja Retencion Recaudacion;
- la fila sale de Retenidos.

Imagen sugerida:

- tab Retenidos Banbif.

## 6. Pago Deuda

Banbif puede atender solicitudes Pago Deuda.

Estados:

- Solicitado.
- Transferido.
- Devuelto.
- Finalizado.

Acciones:

- Emp. Salida.
- Transferencia.
- Reiniciar.

El retorno se enlaza desde Efectivizacion con el boton PD.

Imagen sugerida:

- Pago Deuda Banbif.

## 7. Derivados, POS Y Movimientos

### Derivados

Operaciones enviadas desde otra ruta hacia Banbif.

### POS

Operaciones POS asignadas.

### Movimientos

Permite revisar ingresos y salidas confirmados.

Regla:

- ingresos retenidos no figuran como ingresos normales hasta confirmar.

Imagen sugerida:

- Derivados, POS y Movimientos.

## 8. Cierre Y Reportes

### Cierre

Cierra solo movimientos confirmados.

No cierra:

- ingresos retenidos pendientes.

### Descargar

Genera reporte del dia o de cierres anteriores.

Imagen sugerida:

- cierre y descarga Banbif.

## Reglas Importantes

- Banbif trabaja retenciones.
- Retenidos deben confirmarse solo cuando el banco libero el dinero.
- No pagar sin saldo suficiente.
- No reiniciar si ya hubo cierre.
