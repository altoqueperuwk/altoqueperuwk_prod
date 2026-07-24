# Manual Operativo: /operaciones/bbva

## Objetivo

Este manual explica como trabajar en la ruta `/operaciones/bbva`. BBVA permite cargar archivo bancario, atender efectivizacion, resolver Pago Deuda, revisar derivados/POS, controlar movimientos, cerrar caja y descargar reportes.

No se considera el boton `Configuracion`.

## 1. Ingreso A La Ruta

### Que ve el usuario

Al abrir `/operaciones/bbva`, se visualizan:

- botones superiores de cierre, historial, editar y descargar;
- empresas configuradas para BBVA;
- cuentas de la empresa si existen varias;
- KPIs de caja;
- modales operativos;
- carga Excel;
- tabs de trabajo.

### Para que sirve

Permite trabajar el ciclo operativo completo de BBVA.

### Pasos

1. Entrar a `/operaciones/bbva`.
2. Seleccionar empresa.
3. Seleccionar cuenta si aparece mas de una.
4. Validar KPIs antes de operar.

Imagen sugerida:

- pantalla principal BBVA.

## 2. Empresa, Cuenta Y KPIs

### Empresa activa

La empresa activa define sobre que caja se trabajara.

### Cuenta activa

Cuando una empresa tiene mas de una cuenta, la cuenta seleccionada define la caja exacta.

### KPIs

- Caja Inicial: saldo de apertura.
- Caja Actual: saldo disponible.
- Caja Recaudacion: recaudacion del ciclo.
- Ingresos: ingresos confirmados no comerciales cuando corresponda.
- Salidas: dinero enviado.
- Gastos Operacionales: costos aplicados.
- Ganancias: utilidad generada.
- Pendiente a Depositar: operaciones aun pendientes.
- Total Efectivizacion: cantidad operativa de efectivizaciones.
- Total Pago Deuda: cantidad de solicitudes Pago Deuda.

Imagen sugerida:

- KPIs de BBVA.

## 3. Modales Operativos

### Mover Saldo

Mueve dinero desde BBVA hacia otra empresa/cuenta.

Pasos:

1. Elegir empresa destino.
2. Elegir cuenta destino.
3. Ingresar monto.
4. Guardar.

Resultado esperado:

- sale dinero de la caja activa;
- entra dinero a la caja destino.

Imagen sugerida:

- modal Mover Saldo.

### Ingreso y Salidas

Registra un ingreso o salida manual.

Uso:

- Ingreso: dinero que entra manualmente.
- Salida: dinero que sale manualmente.
- Concepto: explica el motivo.

Imagen sugerida:

- modal Ingreso y Salidas.

### Operacion Efectivizacion

Crea una operacion manual cuando no se cargo por Excel.

Campos:

- Codigo Operacion.
- DNI.
- Monto.
- Comunidad.

Imagen sugerida:

- modal Operacion Efectivizacion.

## 4. Carga Excel

### Que ve el usuario

- selector de empresa;
- panel para arrastrar o seleccionar archivo;
- estado del archivo;
- contadores Procesados, Omitidos y Errores;
- botones Procesar y Cancelar.

### Para que sirve

Carga operaciones desde el archivo BBVA y las deja disponibles en Efectivizacion.

### Pasos

1. Seleccionar empresa.
2. Adjuntar archivo.
3. Presionar Procesar.
4. Revisar resultados.

Imagen sugerida:

- carga BBVA con archivo seleccionado.

## 5. Efectivizacion

### Filtros

- Cod. Operacion.
- DNI.
- Todos.
- Pendientes.
- Pagados.

### Botones rapidos

- Emp. Ingreso: corrige empresa/cuenta de ingreso.
- Emp. Salida: cambia empresa/cuenta de salida.
- Pagar: atiende operaciones pendientes y genera salida.
- Derivar: envia operaciones a otra ruta.
- Directo: aplica flujo directo.
- Reiniciar: revierte operaciones pagadas no cerradas.

### Acciones por fila

- PD: enlaza devoluciones de Pago Deuda.
- Com. Especial.
- Com. Extra.
- Directo.
- Visualizar.

Resultado esperado:

- operaciones pendientes pasan a pagadas;
- los KPIs se actualizan;
- los movimientos quedan registrados.

Imagen sugerida:

- tabla Efectivizacion BBVA.

## 6. Pago Deuda En BBVA

### Para que sirve

Atiende solicitudes Pago Deuda asignadas a BBVA.

### Estados

- Solicitado: pendiente de transferencia.
- Transferido: salida realizada.
- Devuelto: devolucion enlazada desde Efectivizacion.
- Finalizado: solicitud cerrada desde `/operaciones/pagodeuda`.

### Acciones

- Emp. Salida: corregir caja de salida antes de transferir.
- Transferencia: confirmar salida al cliente.
- Reiniciar: volver de Transferido a Solicitado si se cometio un error.

### Flujo

1. La solicitud se crea en `/operaciones/pagodeuda`.
2. BBVA realiza Transferencia.
3. El retorno se enlaza con PD desde Efectivizacion.
4. Atencion finaliza la solicitud.

Imagen sugerida:

- tab Pago Deuda BBVA.

## 7. Derivados Y POS

### Derivados

Operaciones enviadas desde otra ruta a BBVA.

Acciones:

- Emp. Salida.
- Pagar.
- Derivar.
- Reiniciar.

### POS

Solicitudes POS asignadas a BBVA.

Imagen sugerida:

- tabs Derivados y POS.

## 8. Movimientos

Muestra los movimientos de caja de BBVA.

Sirve para:

- revisar ingresos;
- revisar salidas;
- validar movimientos manuales;
- confirmar el detalle antes del cierre.

Imagen sugerida:

- tabla o mini tabla Movimientos.

## 9. Cierre Y Descarga

### Cierre

Cierra la caja activa y congela los movimientos confirmados.

### Historial

Permite revisar cierres anteriores.

### Descargar

Genera reporte del dia o del cierre historico.

Imagen sugerida:

- cierre y descarga BBVA.

## Reglas Importantes

- No pagar sin saldo suficiente.
- No reiniciar operaciones cerradas.
- Pago Deuda se finaliza desde `/operaciones/pagodeuda`, no desde el banco.
- El match de devolucion se hace con el boton PD en Efectivizacion.
