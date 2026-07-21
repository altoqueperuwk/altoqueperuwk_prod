# 33. Manual Rapido: Operaciones BCP

## Objetivo

Guia rapida para que el usuario conozca el flujo diario de trabajo en la ruta `/operaciones/bcp`.

> Captura sugerida: pantalla principal de `/operaciones/bcp`.

## Alcance

Este manual considera las funciones operativas de BCP.

No considera el boton `Configuracion`.

## 1. Ingreso A La Ruta BCP

### 1.1 Ubicacion

Ruta: `/operaciones/bcp`

### 1.2 Vista General

Aqui el usuario visualiza KPIs, seleccion de empresa, carga de archivo y bandejas operativas.

> Captura sugerida: vista completa de la ruta BCP.

## 2. Seleccion De Empresa

### 2.1 Empresas Disponibles

El usuario selecciona la empresa con la que trabajara las operaciones del dia.

> Captura sugerida: tabs de empresas.

### 2.2 Cambio De Empresa

Al cambiar de empresa, se actualizan las bandejas, KPIs y el bloque de carga.

> Captura sugerida: empresa seleccionada.

## 3. KPIs De La Ruta

### 3.1 Caja Inicial

### 3.2 Caja Actual

### 3.3 Total Recaudado

### 3.4 Ingresos

### 3.5 Salidas

### 3.6 Gastos Operacionales

### 3.7 Ganancias

### 3.8 Pendiente A Depositar

> Captura sugerida: bloque de KPIs.

## 4. Carga De Archivo

### 4.1 Seleccionar O Arrastrar Archivo

El usuario puede cargar archivos `.xlsx`, `.xls`, `.html`, `.htm` o `.txt` cuando aplique.

> Captura sugerida: zona de carga sin archivo.

### 4.2 Archivo Seleccionado

El sistema muestra el archivo cargado, estado de lectura y progreso.

> Captura sugerida: zona de carga con archivo seleccionado.

### 4.3 Procesar

Ejecuta la carga de operaciones detectadas.

### 4.4 Cancelar

Limpia el archivo seleccionado y reinicia el bloque de carga.

### 4.5 Resultado De Procesamiento

El sistema muestra:

- Procesados
- Omitidos
- Errores

> Captura sugerida: contadores despues de procesar.

## 5. Tab Efectivizacion

### 5.1 Objetivo

Gestionar operaciones de efectivizacion cargadas desde archivo o registradas manualmente.

> Captura sugerida: tab Efectivizacion.

### 5.2 Filtros Rapidos

- Todos
- Pendientes
- Rechazados
- Pagados

### 5.3 Busqueda

- Cod. Operacion
- DNI

### 5.4 Acciones Rapidas

- Emp. Ingreso
- Emp. Salida
- Pagar
- Derivar
- Directo
- Reiniciar

### 5.5 Columnas Principales

- Facturacion
- Cod. Op.
- DNI
- Comunidad
- Cuenta Empresa
- Cuenta Cliente
- Monto
- Comision
- Transferencia
- Estado
- Hora
- Acciones

### 5.6 Boton PD

Permite enlazar una devolucion compatible con Pago Deuda cuando corresponda.

> Captura sugerida: columna Estado con boton PD.

### 5.7 Menu De Acciones Por Fila

- Com. Especial
- Com. Extra
- Directo
- Visualizar

> Captura sugerida: menu de acciones por fila.

## 6. Tab Pago Deuda

### 6.1 Objetivo

Visualizar y atender solicitudes de Pago Deuda asignadas a BCP.

> Captura sugerida: tab Pago Deuda.

### 6.2 Filtros Rapidos

- Todos
- Pendientes
- Procesados
- Pagados

### 6.3 Acciones Rapidas

- Emp. Salida
- Transferencia
- Reiniciar

### 6.4 Pasos Del Flujo

1. Solicitado
2. Transferido
3. Devuelto
4. Finalizado

### 6.5 Columnas Principales

- Pasos
- Codigo
- DNI
- Cliente
- Empresa Salida
- Cuenta
- Monto Transferencia
- Empresa Ingreso
- Cuenta Ingreso
- Monto Devolucion
- Estado
- Fecha

## 7. Tab Derivados

### 7.1 Objetivo

Gestionar operaciones derivadas hacia BCP desde otras rutas.

> Captura sugerida: tab Derivados.

### 7.2 Filtros Rapidos

- Todos
- Pendientes
- Rechazados
- Pagados

### 7.3 Acciones Rapidas

- Emp. Salida
- Reiniciar
- Pagar
- Derivar

## 8. Tab POS

### 8.1 Objetivo

Atender solicitudes POS cuando correspondan a la ruta BCP.

> Captura sugerida: tab POS.

### 8.2 Filtros Rapidos

- Todos
- Solicitado
- Rechazados
- Pagados

### 8.3 Acciones Rapidas

- Reiniciar
- Pagar
- Derivar

## 9. Tab Movimientos

### 9.1 Objetivo

Consultar movimientos financieros generados por la operacion diaria.

> Captura sugerida: tab Movimientos.

### 9.2 Filtros Rapidos

- Todos
- Efectivizacion
- Pago Deuda
- Otros

### 9.3 Informacion Visible

- Origen
- Movimiento
- DNI
- Codigo
- Empresa
- Ingreso
- Salida
- Fecha

## 10. Modales Operativos

### 10.1 Mover Saldo

Permite mover saldo entre cajas/empresas.

> Captura sugerida: modal Mover Saldo.

### 10.2 Ingreso Y Salidas

Permite registrar ingresos o salidas manuales.

> Captura sugerida: modal Ingreso y Salidas.

### 10.3 Operacion Efectivizacion

Permite registrar una operacion de efectivizacion manual.

> Captura sugerida: modal Operacion Efectivizacion.

## 11. Cierre De Caja

### 11.1 Objetivo

Cerrar el ciclo operativo de la caja seleccionada.

> Captura sugerida: boton Cierre.

### 11.2 Validacion Antes Del Cierre

Revisar operaciones pendientes, movimientos y KPIs antes de cerrar.

### 11.3 Resultado Del Cierre

El sistema congela la informacion del periodo cerrado y permite consultarla desde historial.

## 12. Descarga De Reporte

### 12.1 Objetivo

Generar el reporte de cierre de la empresa seleccionada.

> Captura sugerida: boton Descargar.

### 12.2 Formatos

- PDF
- Excel

## 13. Recomendaciones De Uso Diario

### 13.1 Antes De Procesar

### 13.2 Durante La Atencion

### 13.3 Antes De Cerrar Caja

### 13.4 Despues Del Cierre
