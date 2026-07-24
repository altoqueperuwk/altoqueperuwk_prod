# Manual Operativo: /operaciones/interbank

## Objetivo

Este manual explica como trabajar en `/operaciones/interbank`. Interbank permite operar efectivizacion, Pago Deuda, derivados, POS, movimientos, cierre y reportes. Algunas empresas pueden tener cuenta Interbank y cuenta PLIN; PLIN solo se usa para movimientos.

No se considera el boton `Configuracion`.

## 1. Ingreso A La Ruta

### Que ve el usuario

- empresas configuradas para Interbank;
- selector de cuenta si una empresa tiene mas de una;
- KPIs;
- modales operativos;
- carga Excel;
- tabs de trabajo.

### Para que sirve

Permite operar caja Interbank y, cuando exista PLIN, revisar o mover dinero como caja de movimientos.

Imagen sugerida:

- pantalla Interbank con selector de cuenta.

## 2. Empresa, Cuenta Y Billeteras Digitales

### Cuenta Interbank

Cuando esta seleccionada una cuenta Interbank, se habilita el flujo completo:

- carga Excel;
- Efectivizacion;
- Pago Deuda;
- Derivados;
- POS;
- Movimientos;
- cierre.

### Cuenta PLIN

Cuando esta seleccionada PLIN:

- no se trabaja efectivizacion bancaria;
- no se carga Excel;
- no se atiende Pago Deuda;
- se usa solo para movimientos, saldos, cierre y reportes.

Imagen sugerida:

- tabs `INTERBANK | PLIN`.

## 3. KPIs

Los KPIs se calculan segun la cuenta activa.

Importante:

- si el usuario cambia de Interbank a PLIN, los KPIs cambian;
- cada cuenta representa una caja distinta.

Imagen sugerida:

- KPIs Interbank y KPIs PLIN.

## 4. Modales Operativos

### Mover Saldo

Permite mover dinero entre cajas.

Reglas:

- puede mover hacia PLIN porque es caja de movimientos;
- valida saldo disponible;
- no lista la misma caja activa como destino.

### Ingreso y Salidas

Registra movimientos manuales de ingreso o salida.

### Operacion Efectivizacion

Solo se muestra cuando la cuenta activa es Interbank, no PLIN.

Imagen sugerida:

- modales Interbank.

## 5. Carga Excel

Solo disponible cuando la cuenta activa es Interbank.

Pasos:

1. Seleccionar empresa/cuenta Interbank.
2. Adjuntar archivo.
3. Procesar.
4. Revisar procesados, omitidos y errores.

Imagen sugerida:

- carga Excel Interbank.

## 6. Efectivizacion

### Para que sirve

Atiende operaciones cargadas o manuales.

Botones:

- Emp. Ingreso.
- Emp. Salida.
- Pagar.
- Derivar.
- Directo.
- Reiniciar.

Acciones por fila:

- PD.
- Com. Especial.
- Com. Extra.
- Directo.
- Visualizar.

Imagen sugerida:

- Efectivizacion Interbank.

## 7. Pago Deuda

Interbank puede atender solicitudes Pago Deuda.

Estados:

- Solicitado.
- Transferido.
- Devuelto.
- Finalizado.

Acciones:

- Emp. Salida.
- Transferencia.
- Reiniciar.

El match se hace desde Efectivizacion con PD.

Imagen sugerida:

- Pago Deuda Interbank.

## 8. Derivados Y POS

### Derivados

Muestra operaciones enviadas a Interbank desde otra ruta.

### POS

Muestra operaciones POS asignadas.

Imagen sugerida:

- tabs Derivados y POS.

## 9. Movimientos

Disponible para Interbank y PLIN.

Sirve para:

- revisar ingresos;
- revisar salidas;
- revisar movimientos manuales;
- controlar transferencias internas.

Imagen sugerida:

- mini tabla de movimientos en PLIN;
- movimientos de cuenta Interbank.

## 10. Cierre Y Reportes

El cierre se hace por cuenta activa.

Regla:

- cerrar Interbank no cierra PLIN;
- cerrar PLIN no cierra Interbank.

Imagen sugerida:

- cierre con cuenta activa.

## Reglas Importantes

- PLIN no se usa para efectivizacion bancaria.
- PLIN no debe aparecer como destino de Emp. Ingreso o Emp. Salida.
- PLIN si puede usarse en Mover Saldo.
- Interbank puede compartir cuentas de salida con SafetyPay.
