# Manual Operativo: /operaciones/pagodeuda

## Objetivo

Este manual explica como usar `/operaciones/pagodeuda`, la ruta donde Atencion registra, revisa y finaliza solicitudes de Pago Deuda.

Pago Deuda no es una caja bancaria propia. Es un flujo de solicitud que se atiende usando las rutas bancarias.

## 1. Que Ve El Usuario

En `/operaciones/pagodeuda` se visualiza una bandeja de solicitudes con:

- pasos del flujo;
- codigo;
- DNI;
- cliente;
- empresa y cuenta de salida;
- monto de transferencia;
- empresa y cuenta de ingreso/comision;
- monto de devolucion;
- estado visual;
- fecha;
- acciones segun etapa.

Imagen sugerida:

- pantalla principal de `/operaciones/pagodeuda`.

## 2. Estados Del Flujo

Pago Deuda trabaja en cuatro momentos:

1. Solicitado.
2. Transferido.
3. Devuelto.
4. Finalizado.

### Solicitado

La solicitud fue registrada por Atencion, pero aun no se hizo transferencia al cliente.

### Transferido

El banco ya realizo la salida al cliente desde una ruta bancaria.

### Devuelto

La devolucion fue encontrada y enlazada desde Efectivizacion usando el boton PD.

### Finalizado

Atencion valido el ciclo y cerro la solicitud.

Imagen sugerida:

- una solicitud en cada estado.

## 3. Registrar Solicitud

### Para que sirve

Permite crear una solicitud para que el area bancaria realice la transferencia al cliente.

### Datos que debe revisar el usuario

- DNI.
- Cliente.
- Banco o ruta que atendera.
- Monto a transferir.
- Empresa/cuenta de salida si corresponde.
- Empresa/cuenta donde se registrara la comision.

### Resultado esperado

La solicitud queda en estado `Solicitado` y aparece en el tab Pago Deuda del banco correspondiente.

Imagen sugerida:

- formulario o fila nueva de solicitud.

## 4. Transferencia Desde Banco

### Donde ocurre

La transferencia no se confirma desde `/operaciones/pagodeuda`. Se confirma desde el tab `Pago Deuda` de la ruta bancaria, por ejemplo:

- `/operaciones/bcp`
- `/operaciones/bbva`
- `/operaciones/scotiabank`
- `/operaciones/banbif`
- `/operaciones/interbank`

### Que hace el usuario bancario

1. Entra a la ruta del banco.
2. Abre tab Pago Deuda.
3. Revisa solicitudes en Solicitado.
4. Corrige Emp. Salida si hace falta.
5. Presiona Transferencia.

### Resultado esperado

La solicitud pasa a `Transferido`.

Imagen sugerida:

- tab Pago Deuda del banco con boton Transferencia.

## 5. Devolucion Y Match Desde Efectivizacion

### Donde ocurre

El match se hace desde el tab Efectivizacion del banco donde aparecio la devolucion.

### Que hace el usuario

1. Carga o ubica la operacion de devolucion en Efectivizacion.
2. Presiona el boton `PD` en la fila compatible.
3. Revisa el modal Match Pago Deuda.
4. Selecciona la solicitud correcta.
5. Guarda.

### Resultado esperado

La solicitud pasa a `Devuelto`.

Reglas:

- puede haber devoluciones parciales;
- una solicitud puede cubrirse con mas de una devolucion;
- la devolucion puede venir desde un banco distinto al banco que transfirio;
- SafetyPay no usa boton PD.

Imagen sugerida:

- boton PD;
- modal Match Pago Deuda.

## 6. Comision

La comision de Pago Deuda se registra separada del deposito y de la devolucion.

### Que debe revisar el usuario

- Empresa de ingreso.
- Cuenta de ingreso.
- Monto o condiciones de comision.

Regla:

- cuando la solicitud esta Finalizado, empresa y cuenta quedan bloqueadas.

Imagen sugerida:

- columnas Empresa/Cuenta de ingreso o comision.

## 7. Finalizar Solicitud

### Cuando se usa

Se usa cuando:

- la transferencia fue realizada;
- la devolucion ya fue enlazada;
- la informacion fue validada por Atencion.

### Pasos

1. Entrar a `/operaciones/pagodeuda`.
2. Ubicar la solicitud en estado Devuelto.
3. Seleccionar o presionar la accion de finalizar.
4. Confirmar.

### Resultado esperado

- la solicitud queda Finalizado;
- los pasos se actualizan;
- empresa/cuenta quedan bloqueadas.

Imagen sugerida:

- solicitud finalizada.

## 8. Reiniciar

### Para que sirve

Permite volver una solicitud transferida al paso anterior cuando se eligio mal la empresa/cuenta de salida.

Uso correcto:

- del paso 2 vuelve al paso 1;
- se usa para corregir antes de que el flujo avance.

Regla:

- no se usa en solicitudes finalizadas.

Imagen sugerida:

- boton Reiniciar en solicitud transferida.

## 9. Flujo Completo Resumido

1. Atencion registra solicitud en `/operaciones/pagodeuda`.
2. Banco ve la solicitud en tab Pago Deuda como Solicitado.
3. Banco ejecuta Transferencia.
4. La solicitud queda Transferido.
5. La devolucion aparece en Efectivizacion.
6. Banco usa boton PD para enlazar devolucion.
7. La solicitud queda Devuelto.
8. Atencion finaliza.
9. La solicitud queda Finalizado.

Imagen sugerida:

- collage o secuencia de los cuatro estados.

## Reglas Importantes

- Pago Deuda no se finaliza desde el tab Pago Deuda del banco.
- El banco solo confirma transferencia y ayuda con el match de devolucion.
- El match siempre se hace desde Efectivizacion con PD.
- SafetyPay no participa en Pago Deuda.
- Si la solicitud esta Finalizado, no debe permitir cambios de empresa/cuenta.
