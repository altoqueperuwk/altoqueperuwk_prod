# 33. Manual Global: Operaciones Bancarias, SafetyPay y Pago Deuda

> **Actualizacion 22/08/2026:** Este manual contiene pasos historicos de usuario.
> Para el comportamiento vigente, leer primero
> [`backend/CONTEXTO_GENERAL_BACKEND.md`](../CONTEXTO_GENERAL_BACKEND.md) y
> [`src/CONTEXTO_GENERAL_FRONTEND.md`](../../src/CONTEXTO_GENERAL_FRONTEND.md).
> En particular, las retenciones ya son informativas, no se liberan automaticamente,
> se derivan sin el bloqueo antiguo y las bandejas principales son `Efectivizacion TC`
> y `Pago Deuda TC`.

## Objetivo

Este manual resume, en una sola guia, como debe trabajar el usuario en:

- `/operaciones/bcp`
- `/operaciones/bbva`
- `/operaciones/scotiabank`
- `/operaciones/banbif`
- `/operaciones/interbank`
- `/operaciones/safetypay`
- `/operaciones/pagodeuda`

La idea es que este documento sirva como base para crear luego un manual HTML visual. Por eso cada bloque indica que ve el usuario, para que sirve y que imagen conviene capturar.

## Conceptos Base

### Empresa Activa

La empresa activa es la empresa/caja sobre la que el usuario esta trabajando.

Para que sirve:

- filtra KPIs;
- filtra bandejas;
- define la caja que se usara para movimientos;
- define que cuenta se cerrara al hacer cierre de caja.

Imagen sugerida:

- selector superior de empresas;
- empresa seleccionada en morado;
- KPIs debajo.

### Cuenta Activa

Cuando una empresa tiene mas de una cuenta operativa, aparece un selector de cuenta junto al selector de empresa.

Para que sirve:

- define la caja exacta de trabajo;
- recarga KPIs, carga Excel, movimientos y cierre;
- evita mezclar caja bancaria con billeteras digitales.

Regla:

- YAPE y PLIN solo se usan como cajas de movimientos.
- YAPE y PLIN no participan en carga Excel, efectivizacion, pago deuda, derivados ni POS.

Imagen sugerida:

- empresa con tabs de cuenta, por ejemplo `INTERBANK | PLIN`.

### KPIs

Los KPIs muestran el estado financiero de la caja activa.

KPIs principales:

- Caja Inicial.
- Caja Actual.
- Caja Recaudacion.
- Ingresos.
- Salidas.
- Gastos Operacionales.
- Ganancias.
- Pendiente a Depositar.
- Retencion Recaudacion o Ingresos Retenidos.
- Total Efectivizacion.
- Total Pago Deuda.

Regla:

- los ingresos retenidos no aumentan caja actual hasta que se confirmen;
- las salidas si descuentan caja cuando se ejecutan;
- el cierre congela movimientos confirmados, pero no libera retenciones pendientes.

Imagen sugerida:

- bloque de KPIs con la cuenta activa seleccionada.

## Rutas Bancarias Con Pago Deuda

Aplica a:

- `/operaciones/bcp`
- `/operaciones/bbva`
- `/operaciones/scotiabank`
- `/operaciones/banbif`
- `/operaciones/interbank`

Estas rutas trabajan con:

- carga de archivo bancario;
- efectivizacion;
- pago deuda;
- derivados;
- POS;
- movimientos;
- cierre de caja;
- descarga de reportes.

Scotiabank y Banbif tambien trabajan con retenciones.

## Flujo General En Banco

### 1. Seleccionar Empresa y Cuenta

Que ve el usuario:

- tabs de empresas configuradas para la ruta;
- tabs de cuenta si la empresa tiene mas de una caja;
- KPIs de la caja seleccionada.

Para que sirve:

- define el contexto completo de trabajo;
- todo lo que se cargue, pague, derive o cierre se aplica sobre esa caja.

Imagen sugerida:

- selector de empresa/cuenta y KPIs.

### 2. Cargar Archivo

Que ve el usuario:

- selector de empresa;
- zona para seleccionar o arrastrar archivo;
- estado del archivo;
- contadores de Procesados, Omitidos y Errores;
- botones Procesar y Cancelar.

Para que sirve:

- cargar operaciones desde el archivo descargado del banco;
- crear operaciones pendientes de efectivizacion;
- detectar duplicados u operaciones omitidas.

Regla de omitidos:

- se compara DNI, codigo de operacion, servicio y fecha de deposito;
- existe una ventana de validacion de 7 dias porque algunos bancos reutilizan codigos despues de mas tiempo.

Imagen sugerida:

- bloque de carga sin archivo;
- archivo seleccionado;
- resultado procesado.

### 3. Revisar Efectivizacion

Que ve el usuario:

- tab `Efectivizacion`;
- filtros rapidos `Todos`, `Pendientes`, `Pagados`;
- tabla con operaciones cargadas;
- botones de accion rapida.

Para que sirve:

- atender operaciones pendientes;
- corregir empresa de ingreso o salida;
- pagar;
- derivar;
- enviar directo;
- reiniciar operaciones no cerradas.

Columnas principales:

- Facturacion.
- Cod. Op.
- DNI.
- Comunidad.
- Cuenta Cliente.
- Monto.
- Comision.
- Transferencia.
- Estado.
- Hora.
- Acciones.

Imagen sugerida:

- tabla de efectivizacion con operaciones pendientes.

### 4. Botones Rapidos En Efectivizacion

#### Emp. Ingreso

Corrige la empresa/cuenta de ingreso cuando la carga se hizo sobre una empresa equivocada.

Reglas:

- no debe listar la misma empresa/cuenta activa;
- no debe permitir enviar a YAPE o PLIN;
- se usa para corregir la trazabilidad del ingreso.

Imagen sugerida:

- popup `Emp. Ingreso`.

#### Emp. Salida

Cambia la empresa/cuenta que hara la salida de dinero al cliente.

Reglas:

- se usa cuando otra caja tiene saldo disponible;
- no debe listar la misma empresa/cuenta activa;
- no debe permitir enviar a YAPE o PLIN;
- al pagar, la salida impacta la caja seleccionada.

Imagen sugerida:

- popup `Emp. Salida`.

#### Pagar

Cambia operaciones pendientes a pagadas.

Que hace:

- genera movimiento de salida;
- descuenta caja actual;
- actualiza KPIs;
- valida saldo disponible antes de ejecutar.

Regla:

- si no hay saldo suficiente, la operacion no debe cambiar de estado.

Imagen sugerida:

- seleccionar filas y boton `Pagar`.

#### Derivar

Envia operaciones a otra ruta bancaria para que otra caja las atienda.

Que hace:

- marca la operacion como derivada;
- cambia ruta destino;
- permite que aparezca en el tab `Derivados` de la ruta destino.

Imagen sugerida:

- popup de derivacion.

#### Directo

Marca la operacion como flujo directo a caja.

Que hace:

- evita el flujo normal de salida;
- registra el tratamiento directo segun configuracion;
- se usa en casuisticas especiales autorizadas.

Imagen sugerida:

- boton rapido `Directo` y opcion `Directo` del menu acciones.

#### Reiniciar

Devuelve una operacion pagada a pendiente cuando aun no esta cerrada en caja.

Que hace:

- revierte movimientos abiertos;
- elimina el impacto financiero vivo;
- actualiza caja y KPIs;
- deja la operacion nuevamente pendiente.

Regla:

- no se puede reiniciar si el movimiento ya fue cerrado en caja.

Imagen sugerida:

- seleccion de filas y boton `Reiniciar`.

### 5. Menu Acciones De La Fila

Que ve el usuario:

- boton de tres puntos en la columna `Acciones`.

Opciones:

- `Com. Especial`: ajustar comision especial.
- `Com. Extra`: agregar comision adicional.
- `Directo`: ejecutar flujo directo.
- `Visualizar`: revisar detalle de la operacion.

Regla:

- la opcion `PD Directo` no se usa en el flujo actual.
- SafetyPay no muestra boton `PD`.

Imagen sugerida:

- menu acciones abierto.

## Pago Deuda En Bancos

Aplica a:

- `/operaciones/bcp`
- `/operaciones/bbva`
- `/operaciones/scotiabank`
- `/operaciones/banbif`
- `/operaciones/interbank`

### Que Ve El Usuario

En el tab `Pago Deuda` el usuario ve solicitudes que requieren salida de dinero.

Columnas principales:

- Pasos.
- Codigo.
- DNI.
- Cliente.
- Empresa Cuenta de salida.
- Monto Transferencia.
- Empresa Cuenta de ingreso.
- Monto Devolucion.
- Estado.
- Fecha.

Imagen sugerida:

- tab Pago Deuda con una solicitud.

### Estados Visuales

Los estados visuales ayudan al usuario a entender el avance:

- `Solicitado`: paso 1, aun no se hizo transferencia.
- `Transferido`: paso 2, ya se hizo salida al cliente.
- `Devuelto`: paso 3, ya se hizo match con una efectivizacion de retorno.
- `Finalizado`: paso 4, atencion al cliente cerro el ciclo.

Importante:

- estas etiquetas son una mascara visual del flujo;
- no reemplazan la logica interna de estados.

### Acciones En Banco

#### Transferencia

Se usa cuando la solicitud esta en `Solicitado`.

Que hace:

- genera la salida al cliente;
- cambia visualmente a `Transferido`;
- actualiza caja y KPIs.

Imagen sugerida:

- boton `Transferencia` activo.

#### Emp. Salida

Permite corregir la empresa/cuenta que hara la transferencia.

Regla:

- se usa antes de transferir;
- si la operacion ya esta finalizada, empresa/cuenta quedan bloqueadas.

Imagen sugerida:

- popup de empresa salida en Pago Deuda.

#### Reiniciar

Devuelve una solicitud transferida al paso anterior cuando se eligio mal la empresa/cuenta de salida.

Uso esperado:

- del paso 2 vuelve al paso 1;
- permite corregir antes de continuar el ciclo.

Regla:

- no debe usarse para operaciones finalizadas.

Imagen sugerida:

- boton `Reiniciar` en tab Pago Deuda.

### Match Con Efectivizacion

El match no se hace desde el tab Pago Deuda.

Flujo correcto:

1. El cliente o banco genera la devolucion.
2. La devolucion aparece en el tab `Efectivizacion`.
3. En la fila compatible aparece el boton `PD`.
4. El usuario presiona `PD`.
5. Se abre el modal `Match Pago Deuda`.
6. El usuario selecciona la solicitud compatible y guarda.
7. Pago Deuda cambia visualmente a `Devuelto`.

Regla:

- puede haber devoluciones parciales;
- puede haber devoluciones desde bancos distintos;
- el match se guia por coincidencias de DNI, fecha y monto.

Imagen sugerida:

- boton `PD` en Efectivizacion;
- modal Match Pago Deuda con tabla y checkbox.

## Ruta Global `/operaciones/pagodeuda`

Esta ruta la usa el area que registra y finaliza solicitudes de Pago Deuda.

### 1. Registrar Solicitud

Que ve el usuario:

- formulario o tabla de solicitudes;
- datos de cliente;
- monto;
- empresa/cuenta de salida e ingreso segun flujo.

Para que sirve:

- crear la solicitud que luego sera atendida desde una ruta bancaria.

Imagen sugerida:

- pantalla principal de `/operaciones/pagodeuda`.

### 2. Esperar Transferencia Bancaria

La transferencia se realiza desde el tab `Pago Deuda` del banco correspondiente.

Resultado esperado:

- la solicitud pasa de `Solicitado` a `Transferido`;
- en `/operaciones/pagodeuda` se visualiza el avance.

Imagen sugerida:

- solicitud en paso 2.

### 3. Esperar Devolucion

La devolucion se enlaza desde `Efectivizacion` usando el boton `PD`.

Resultado esperado:

- la solicitud pasa a `Devuelto`;
- el area de atencion ya puede revisar si corresponde finalizar.

Imagen sugerida:

- solicitud en paso 3.

### 4. Finalizar

Cuando el ciclo esta validado, el usuario de atencion finaliza la solicitud.

Resultado esperado:

- la solicitud pasa a `Finalizado`;
- los pasos deben actualizarse sin hacer F5;
- empresa y cuenta quedan bloqueadas.

Imagen sugerida:

- boton de finalizar y solicitud finalizada.

## Retenciones

Aplica a:

- `/operaciones/scotiabank`
- `/operaciones/banbif`
- `/operaciones/safetypay`

### Que Significa Retener

Retener significa que el ingreso existe comercialmente, pero el dinero aun no esta disponible en la cuenta bancaria.

Reglas:

- el ingreso retenido no aumenta caja actual;
- el ingreso retenido no aparece como ingreso normal en movimientos;
- se muestra en el KPI de retencion;
- se confirma manualmente cuando el banco libera el dinero.

Imagen sugerida:

- tab `Retenidos` con operaciones pendientes de confirmar.

### Confirmar Retencion

Que hace:

- libera el ingreso retenido;
- aumenta caja actual;
- baja el KPI de retencion;
- saca la fila del tab `Retenidos`.

Regla:

- confirmar retencion no significa pagar la operacion;
- solo significa que el dinero retenido ya ingreso a la caja.

Imagen sugerida:

- seleccionar retenidos y boton `Confirmar`.

## SafetyPay

Ruta:

- `/operaciones/safetypay`

SafetyPay es una ruta especial de recaudacion.

### Diferencia Frente A Bancos

SafetyPay no trabaja como un banco normal de salida.

En SafetyPay:

- se carga recaudacion;
- se procesa solo lo pagado;
- se registra modalidad `Manual` o `Automatico`;
- los ingresos se retienen;
- luego el usuario confirma retenciones o mueve saldo segun corresponda.

Tabs visibles:

- `Efectivizacion`.
- `Movimientos`.
- `Retenidos`.

No se muestran:

- Pago Deuda.
- Derivados.
- POS.

Imagen sugerida:

- pantalla `/operaciones/safetypay` con tabs visibles.

### Carga Excel SafetyPay

Que ve el usuario:

- selector de empresa;
- selector de modalidad `Automatico` o `Manual`;
- panel de carga;
- contadores de Procesados, Omitidos y Errores.

Regla de archivo:

- si existe columna `Estado`, solo se procesan filas `Pagado`;
- filas `Pendiente` se omiten;
- si no existe columna `Estado` o viene vacia, se entiende que todo esta pagado.

Modalidad:

- `Automatico`: cliente interactuo directamente con SafetyPay.
- `Manual`: cliente pidio un codigo SafetyPay por atencion o confianza.

Imagen sugerida:

- tabs de empresa y modalidad;
- archivo procesado con omitidos.

### Efectivizacion SafetyPay

Columnas especiales:

- `Modalidad` despues de `Facturacion`.
- No se muestra boton `PD`.
- No se muestra dropdown de cuenta cliente debajo del DNI.

Accion especial:

- boton rapido `Modalidad` permite cambiar modalidad en lote.

Regla:

- solo operaciones pendientes cambian modalidad en lote;
- la modalidad tambien puede cambiarse desde la columna de la fila.

Imagen sugerida:

- tabla SafetyPay con columna Modalidad.

### Retenidos SafetyPay

SafetyPay retiene ingresos igual que Scotiabank/Banbif.

Uso:

- el usuario confirma manualmente cuando SafetyPay libera el dinero;
- hasta confirmar, el ingreso no aumenta caja actual.

Imagen sugerida:

- tab Retenidos en SafetyPay.

## Movimientos

Los movimientos muestran el impacto financiero de la caja activa.

Tipos:

- `INGRESO`.
- `SALIDA`.

Origenes frecuentes:

- Efectivizacion.
- Pago Deuda.
- Transferencia Interna.
- Otros.

Regla:

- movimientos retenidos pendientes no se muestran como ingresos normales;
- YAPE y PLIN solo trabajan desde movimientos;
- el mini datatable de movimientos muestra Origen, Movimiento, Monto y Fecha.

Imagen sugerida:

- mini datatable de movimientos;
- tab movimientos cuando aplique.

## Modales Operativos

### Mover Saldo

Permite mover dinero entre cajas.

Que hace:

- crea una salida en la caja origen;
- crea un ingreso en la caja destino;
- actualiza KPIs de ambas cajas.

Reglas:

- valida saldo disponible;
- puede mover hacia YAPE o PLIN porque es movimiento interno de caja;
- no debe listar como destino la misma caja activa, salvo que la empresa tenga otra cuenta distinta.

Imagen sugerida:

- modal Mover Saldo con empresa/cuenta actual en badges.

### Ingreso y Salidas

Permite registrar movimientos manuales de caja.

Uso:

- ingreso manual;
- salida manual;
- concepto o detalle del movimiento.

Regla:

- si se elige salida, valida saldo disponible.

Imagen sugerida:

- modal Ingreso y Salidas con switch Ingreso/Salida.

### Operacion Efectivizacion

Permite crear una operacion manual de efectivizacion cuando no viene de Excel.

Uso:

- codigo de operacion;
- DNI;
- monto;
- comunidad.

Regla:

- no se muestra cuando la cuenta activa es YAPE o PLIN;
- para SafetyPay debe respetar la caja principal de recaudacion.

Imagen sugerida:

- modal Operacion Efectivizacion.

## Cierre De Caja

El cierre congela el ciclo operativo de la caja activa.

Que cierra:

- ingresos confirmados;
- salidas confirmadas;
- gastos confirmados;
- ganancias confirmadas;
- operaciones pagadas cerrables.

Que no cierra:

- ingresos retenidos pendientes.

Resultado esperado:

- el historial muestra el cierre;
- la caja viva inicia nuevo ciclo;
- los retenidos pendientes siguen disponibles para confirmar despues.

Imagen sugerida:

- boton Cierre;
- selector de historial;
- KPI historico.

## Descarga De Reportes

El boton `Descargar` permite generar reporte del periodo actual o historico.

Incluye:

- KPIs;
- efectivizaciones pagadas;
- pago deuda;
- movimientos;
- retenciones cuando aplique.

Regla:

- el reporte usa la caja/cuenta activa;
- si se esta viendo un cierre historico, descarga ese cierre.

Imagen sugerida:

- boton Descargar;
- PDF generado.

## Resumen Por Ruta

### `/operaciones/bcp`

Incluye:

- carga Excel;
- efectivizacion;
- pago deuda;
- derivados;
- POS;
- movimientos;
- cierre;
- reportes.

No incluye:

- retenciones.

### `/operaciones/bbva`

Incluye el mismo flujo base que BCP.

No incluye:

- retenciones.

### `/operaciones/scotiabank`

Incluye:

- flujo bancario base;
- pago deuda;
- retenciones;
- mismo dia y dia siguiente.

Regla:

- los ingresos quedan retenidos hasta confirmacion manual.

### `/operaciones/banbif`

Incluye:

- flujo bancario base;
- pago deuda;
- retenciones;
- mismo dia y dia siguiente.

Regla:

- se comporta como Scotiabank en retenciones y tipo de deposito.

### `/operaciones/interbank`

Incluye:

- flujo bancario base;
- pago deuda;
- derivados;
- POS;
- movimientos;
- cierre.

Consideracion:

- puede compartir cajas de salida con SafetyPay;
- si una empresa tiene PLIN, PLIN solo se usa como caja de movimientos.

### `/operaciones/safetypay`

Incluye:

- carga Excel SafetyPay;
- modalidad Manual/Automatico;
- efectivizacion;
- movimientos;
- retenciones;
- cierre;
- reportes.

No incluye:

- pago deuda;
- derivados;
- POS;
- boton PD.

### `/operaciones/pagodeuda`

Incluye:

- registro de solicitud;
- seguimiento por pasos;
- finalizacion;
- bloqueo de empresa/cuenta cuando esta finalizado.

Depende de:

- tabs Pago Deuda de bancos para transferencia;
- boton PD de Efectivizacion para match de devolucion.

## Flujo Completo De Pago Deuda

1. Atencion registra la solicitud en `/operaciones/pagodeuda`.
2. El usuario bancario entra al banco correspondiente.
3. En tab `Pago Deuda`, revisa la solicitud en estado `Solicitado`.
4. Si corresponde, ajusta `Emp. Salida`.
5. Ejecuta `Transferencia`.
6. La solicitud queda `Transferido`.
7. El retorno aparece en `Efectivizacion`.
8. El usuario presiona `PD` en la fila compatible.
9. Selecciona la solicitud en el modal Match Pago Deuda.
10. La solicitud queda `Devuelto`.
11. Atencion entra a `/operaciones/pagodeuda`.
12. Finaliza la solicitud.
13. La solicitud queda `Finalizado`.

Imagen sugerida:

- una captura por cada estado: Solicitado, Transferido, Devuelto y Finalizado.

## Reglas De Seguridad Operativa

- No pagar si la caja no tiene saldo suficiente.
- No reiniciar operaciones cerradas en caja.
- No usar YAPE/PLIN para efectivizacion comercial.
- No confirmar retencion si el dinero aun no fue liberado por el banco.
- No hacer match de Pago Deuda desde el tab Pago Deuda; el match se hace desde Efectivizacion con el boton `PD`.
- Cambiar empresa o cuenta recarga todo porque cambia la caja activa.

## Checklist Para Crear El HTML

- Crear portada del manual global.
- Crear indice por ruta.
- Crear bloque visual por accion.
- Cada bloque debe tener:
  - titulo;
  - que ve el usuario;
  - para que sirve;
  - pasos;
  - resultado esperado;
  - imagen sugerida.
- Agregar pop-up o lupa para imagenes.
- Separar secciones por ruta y por flujo.
- Mantener textos cortos para usuario final.
