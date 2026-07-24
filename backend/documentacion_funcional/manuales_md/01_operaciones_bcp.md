# Manual Operativo: /operaciones/bcp

## Objetivo

Este manual explica como trabajar en la ruta `/operaciones/bcp`. BCP se usa para cargar operaciones bancarias, atender efectivizaciones, resolver Pago Deuda, revisar derivados/POS, controlar movimientos, cerrar caja y descargar reportes.

No se considera el boton `Configuracion`.

## 1. Ingreso A La Ruta

### Que ve el usuario

Al ingresar a `/operaciones/bcp`, se visualizan:

- botones superiores de cierre, historial, editar y descargar;
- tabs de empresas;
- tabs de cuenta si la empresa tiene mas de una caja;
- KPIs de la caja activa;
- modales operativos;
- carga Excel;
- tabs de trabajo.

### Para que sirve

Permite operar todo el ciclo diario de BCP desde una sola pantalla.

### Pasos

1. Entrar a `/operaciones/bcp`.
2. Seleccionar la empresa activa.
3. Si aparece selector de cuenta, seleccionar la cuenta BCP que se usara.
4. Revisar que los KPIs correspondan a la caja correcta.

### Resultado esperado

La empresa/cuenta activa queda marcada en morado y toda la informacion se carga para esa caja.

Imagen sugerida:

- pantalla principal de BCP con empresa activa y KPIs.

## 2. Empresa, Cuenta Y KPIs

### Empresa activa

Es la empresa sobre la que se trabajara. Todo lo que se cargue, pague, derive, mueva o cierre se aplicara a esa empresa/caja.

### Cuenta activa

Si la empresa tiene mas de una cuenta, se debe elegir la cuenta correcta. La cuenta activa define la caja exacta que impactaran los movimientos.

### KPIs principales

- Caja Inicial: saldo con el que inicia el ciclo.
- Caja Actual: saldo disponible para operar.
- Caja Recaudacion: recaudacion del ciclo.
- Ingresos: ingresos confirmados que corresponden a movimientos operativos.
- Salidas: dinero enviado o retirado.
- Gastos Operacionales: comisiones y gastos.
- Ganancias: utilidad generada.
- Pendiente a Depositar: monto pendiente por atender.
- Total Efectivizacion: cantidad de operaciones de efectivizacion.
- Total Pago Deuda: cantidad de solicitudes Pago Deuda.

Imagen sugerida:

- bloque de KPIs de BCP.

## 3. Modales Operativos

### Mover Saldo

Sirve para mover dinero desde la caja activa hacia otra empresa/cuenta.

Campos:

- Empresa destino: empresa que recibira el dinero.
- Cuenta destino: cuenta de la empresa destino.
- Monto a depositar: dinero que se movera.

Botones:

- Guardar: registra salida en la caja actual e ingreso en la caja destino.
- Cancelar: cierra el modal sin cambios.

Reglas:

- no permite mover mas dinero del saldo disponible;
- no debe mostrar la misma caja activa como destino, salvo que la empresa tenga otra cuenta distinta.

Imagen sugerida:

- modal Mover Saldo.

### Ingreso y Salidas

Sirve para registrar un movimiento manual.

Campos:

- Movimiento: elegir Ingreso o Salida.
- Monto: importe del movimiento.
- Concepto: motivo del movimiento.

Botones:

- Guardar: registra el movimiento.
- Cancelar: no guarda cambios.

Regla:

- si se elige Salida, el sistema valida saldo disponible.

Imagen sugerida:

- modal Ingreso y Salidas.

### Operacion Efectivizacion

Sirve para crear manualmente una operacion que no vino por Excel.

Campos:

- Codigo Operacion.
- DNI.
- Monto.
- Comunidad.

Botones:

- Guardar: crea la operacion como pendiente.
- Cancelar: cierra sin registrar.

Imagen sugerida:

- modal Operacion Efectivizacion.

## 4. Carga Y Procesamiento De Excel

### Que ve el usuario

- tab de empresas;
- zona para seleccionar o arrastrar archivo;
- estado del archivo;
- contadores Procesados, Omitidos y Errores;
- botones Procesar y Cancelar.

### Para que sirve

Carga operaciones desde el archivo de BCP y las deja disponibles en Efectivizacion.

### Pasos

1. Seleccionar empresa activa.
2. Seleccionar o arrastrar el archivo.
3. Revisar que el archivo figure como cargado.
4. Presionar Procesar.
5. Revisar contadores.

### Contadores

- Procesados: filas que se registraron correctamente.
- Omitidos: filas que el sistema no cargo porque ya existian o no correspondian.
- Errores: filas con problemas que requieren revision.

### Resultado esperado

Las operaciones procesadas aparecen en el tab Efectivizacion como pendientes.

Imagen sugerida:

- panel de carga sin archivo;
- archivo seleccionado;
- resultado procesado.

## 5. Tab Efectivizacion

### Para que sirve

Es la bandeja principal para atender operaciones cargadas desde Excel o creadas manualmente.

### Filtros

- Cod. Operacion: busca por codigo.
- DNI: busca por documento.
- Todos: muestra pendientes y pagados visibles.
- Pendientes: muestra operaciones por atender.
- Pagados: muestra operaciones ya atendidas.

### Columnas principales

- Facturacion: tipo de comprobante.
- Cod. Op.: codigo de operacion del banco.
- DNI: documento del cliente.
- Comunidad: comunidad asignada.
- Cuenta Cliente: banco del cliente.
- Monto: importe depositado.
- Comision: comision calculada.
- Transferencia: monto a transferir al cliente.
- Estado: Pendiente o Pagado.
- Hora: hora de registro o deposito.
- Acciones: opciones por fila.

### Botones rapidos

- Emp. Ingreso: corrige la empresa/cuenta donde ingreso la operacion.
- Emp. Salida: cambia la empresa/cuenta desde donde se pagara.
- Pagar: marca la operacion como pagada y genera salida.
- Derivar: envia la operacion a otra ruta.
- Directo: atiende la operacion como flujo directo.
- Reiniciar: devuelve una operacion pagada a pendiente si aun no fue cerrada.

### Boton PD

Sirve para enlazar una operacion de efectivizacion con una solicitud de Pago Deuda cuando corresponde una devolucion.

### Menu Acciones

- Com. Especial: modifica una comision especial.
- Com. Extra: agrega una comision adicional.
- Directo: aplica flujo directo a una fila.
- Visualizar: abre el detalle de la operacion.

Imagen sugerida:

- tab Efectivizacion con filtros, botones y menu acciones.

## 6. Tab Pago Deuda

### Para que sirve

Permite atender solicitudes de Pago Deuda asignadas a BCP.

### Estados visuales

- Solicitado: aun no se transfirio al cliente.
- Transferido: ya se realizo la salida.
- Devuelto: ya se enlazo la devolucion desde Efectivizacion.
- Finalizado: atencion cerro el ciclo desde `/operaciones/pagodeuda`.

### Botones

- Emp. Salida: cambia la empresa/cuenta desde donde saldra el dinero.
- Transferencia: confirma la salida al cliente.
- Reiniciar: vuelve del paso transferido al paso solicitado si hubo error.

### Flujo

1. Atencion crea la solicitud en `/operaciones/pagodeuda`.
2. El usuario de BCP la ve como Solicitado.
3. Si corresponde, corrige Emp. Salida.
4. Presiona Transferencia.
5. La solicitud queda Transferido.
6. La devolucion se enlaza desde Efectivizacion con el boton PD.
7. Atencion finaliza desde `/operaciones/pagodeuda`.

Imagen sugerida:

- tab Pago Deuda con una solicitud en paso 1.

## 7. Tabs Derivados Y POS

### Derivados

Muestra operaciones enviadas desde otra ruta para ser atendidas en BCP.

Acciones:

- Emp. Salida: corregir la caja de salida.
- Pagar: atender la operacion.
- Derivar: reenviar a otra ruta.
- Reiniciar: volver a pendiente si no esta cerrada.

### POS

Muestra operaciones POS asignadas a BCP.

Acciones:

- Pagar.
- Derivar.
- Reiniciar cuando corresponda.

Imagen sugerida:

- tab Derivados;
- tab POS.

## 8. Movimientos

### Para que sirve

Permite revisar ingresos y salidas que impactaron la caja.

Columnas comunes:

- Origen.
- Movimiento.
- Monto.
- Fecha.

Regla:

- debe usarse para validar lo que realmente afecto la caja antes del cierre.

Imagen sugerida:

- mini tabla o tab de movimientos de BCP.

## 9. Cierre Y Reportes

### Cierre

Congela los movimientos confirmados de la caja activa.

Antes de cerrar:

1. Revisar KPIs.
2. Revisar movimientos.
3. Confirmar que no falten operaciones por atender.
4. Presionar Cierre.

### Historial

Permite consultar un cierre anterior.

### Descargar

Genera reporte del dia o del cierre historico seleccionado.

Imagen sugerida:

- botones Cierre, Historial y Descargar;
- reporte descargado.

## Reglas Importantes

- No pagar si la caja no tiene saldo suficiente.
- No reiniciar operaciones ya cerradas.
- El match de Pago Deuda se hace desde el boton PD en Efectivizacion.
- YAPE y PLIN, si aparecen como cuentas de una empresa, solo son cajas de movimientos.
