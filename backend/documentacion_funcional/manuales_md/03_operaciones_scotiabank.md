# Manual Operativo: /operaciones/scotiabank

## Objetivo

Este manual explica como trabajar en `/operaciones/scotiabank`. Scotiabank tiene flujo bancario normal y, ademas, trabaja con retenciones de ingresos.

No se considera el boton `Configuracion`.

## 1. Ingreso A La Ruta

### Que ve el usuario

- empresas configuradas para Scotiabank;
- cuenta activa si la empresa tiene mas de una;
- KPIs;
- carga Excel;
- tabs Efectivizacion, Pago Deuda, Derivados, POS, Movimientos y Retenidos.

### Para que sirve

Permite operar Scotiabank, pagar operaciones, controlar ingresos retenidos y cerrar caja.

Imagen sugerida:

- pantalla principal Scotiabank.

## 2. Empresa, Cuenta Y KPIs

La empresa/cuenta activa define donde se cargan operaciones y que caja se cerrara.

KPIs importantes:

- Caja Actual: saldo disponible real.
- Salidas: pagos realizados.
- Gastos Operacionales: costos del banco.
- Retencion Recaudacion o Ingresos Retenidos: dinero aun no liberado por Scotiabank.

Regla:

- el dinero retenido no aumenta caja actual hasta que se confirme manualmente.

Imagen sugerida:

- KPIs con Retencion Recaudacion.

## 3. Carga Excel

### Para que sirve

Carga las operaciones informadas por Scotiabank.

### Resultado esperado

- las operaciones aparecen en Efectivizacion;
- si la cuenta retiene, tambien aparecen en Retenidos;
- el ingreso retenido no aumenta caja actual.

Imagen sugerida:

- panel de carga Scotiabank.

## 4. Efectivizacion

### Que ve el usuario

Tabla de operaciones pendientes o pagadas.

### Tipo de deposito

Scotiabank puede trabajar:

- Mismo Dia.
- Dia Siguiente.

Cambiar este dato recalcula comision y transferencia.

### Botones rapidos

- Emp. Ingreso: corrige empresa/cuenta de ingreso.
- Emp. Salida: cambia empresa/cuenta de salida.
- Pagar: genera salida y atiende la operacion.
- Derivar: envia la operacion a otra ruta.
- Directo: aplica flujo directo.
- Reiniciar: revierte una operacion pagada no cerrada.

### Acciones por fila

- PD: enlaza devolucion de Pago Deuda.
- Com. Especial.
- Com. Extra.
- Directo.
- Visualizar.

Imagen sugerida:

- Efectivizacion Scotiabank con selector Mismo Dia/Dia Siguiente.

## 5. Retenidos

### Para que sirve

Muestra ingresos que Scotiabank aun no libero en la cuenta.

### Que ve el usuario

- operaciones retenidas;
- monto retenido;
- fecha de deposito;
- boton Confirmar.

### Confirmar retencion

Se usa cuando el usuario verifica que el banco ya libero el dinero.

Resultado esperado:

- la fila sale de Retenidos;
- baja el KPI de retencion;
- sube Caja Actual;
- el ingreso queda disponible para operar.

Imagen sugerida:

- tab Retenidos con boton Confirmar.

## 6. Pago Deuda

Scotiabank atiende Pago Deuda igual que otros bancos.

Estados:

- Solicitado.
- Transferido.
- Devuelto.
- Finalizado.

Acciones:

- Emp. Salida.
- Transferencia.
- Reiniciar.

El match de devolucion se hace desde Efectivizacion con el boton PD.

Imagen sugerida:

- tab Pago Deuda Scotiabank.

## 7. Derivados Y POS

### Derivados

Operaciones recibidas desde otra ruta.

Acciones:

- Pagar.
- Derivar.
- Emp. Salida.
- Reiniciar.

### POS

Solicitudes POS asignadas a Scotiabank.

Imagen sugerida:

- tabs Derivados y POS.

## 8. Movimientos

Muestra movimientos confirmados de caja.

Importante:

- ingresos retenidos no se muestran como ingresos normales;
- apareceran como ingreso cuando se confirme la retencion.

Imagen sugerida:

- movimientos sin ingresos retenidos pendientes.

## 9. Cierre Y Descarga

### Cierre

Congela movimientos confirmados.

No congela:

- ingresos retenidos pendientes.

### Descargar

Genera reporte del dia o cierre historico.

Imagen sugerida:

- cierre historico Scotiabank con retenciones.

## Reglas Importantes

- Retenido no significa pagado ni liberado.
- Confirmar retencion solo significa que el dinero ya entro a caja.
- No pagar sin saldo suficiente.
- No reiniciar operaciones cerradas.
- Si hay retenciones de dias anteriores, deben seguir visibles hasta confirmar.
