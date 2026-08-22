# Operación de Recaudación Bancaria por Cortes y Abonos

## 1. Objetivo

Este documento describe el funcionamiento operativo de los bancos y proveedores de recaudación que trabajan mediante horarios de corte y plazos de abono.

El objetivo es complementar el sistema actual con una lógica que permita:

- Identificar a qué lote pertenece cada pago.
- Determinar cuándo se cierra el lote.
- Calcular la fecha estimada de abono.
- Diferenciar un pago recaudado de un saldo realmente disponible.
- Gestionar pagos realizados fuera del horario de atención.
- Considerar fines de semana, feriados y posibles retrasos bancarios.

Este documento no define una implementación técnica específica ni reemplaza la confirmación contractual de cada entidad financiera.

---

## 2. Entidades y reglas operativas

| Entidad | Hora de corte | Plazo estimado de abono |
|---|---:|---:|
| Scotiabank | 9:00 p. m. | 1 día hábil |
| BanBif | 9:00 p. m. | 1 día hábil |
| SafetyPay | 12:00 a. m. | 2 días hábiles |
| BCP | 12:00 a. m. | 1 día hábil |

Las reglas anteriores se utilizarán como parámetros operativos del sistema.

La fecha real de abono debe validarse posteriormente contra el movimiento bancario o archivo de conciliación correspondiente.

---

## 3. Conceptos principales

### 3.1 Pago recaudado

Es el pago realizado por el cliente mediante código de pago, código de recaudación o medio equivalente.

El pago puede aparecer inmediatamente en el reporte de recaudación, aunque todavía no forme parte del saldo disponible de la cuenta bancaria.

### 3.2 Hora de corte

Es la hora utilizada para cerrar y agrupar los pagos de una ventana de recaudación.

El corte determina a qué lote pertenece una operación, pero no garantiza que el dinero se encuentre disponible exactamente a esa hora.

### 3.3 Lote de recaudación

Es el conjunto de pagos recibidos dentro de una misma ventana operativa.

Cada lote debe tener como mínimo:

- Entidad financiera.
- Fecha y hora de inicio.
- Fecha y hora de cierre.
- Cantidad de operaciones.
- Monto total recaudado.
- Fecha estimada de abono.
- Fecha real de abono.
- Estado del lote.

### 3.4 Fecha estimada de abono

Es la fecha calculada aplicando el plazo de liquidación correspondiente después del cierre del lote.

Esta fecha es referencial y no reemplaza la confirmación bancaria.

### 3.5 Saldo disponible

Es el dinero que ya fue acreditado por la entidad financiera y que puede ser utilizado por la empresa.

Un pago no debe incrementar el saldo disponible únicamente por haber sido recaudado o incluido en un lote cerrado.

---

## 4. Diferencia entre atención operativa y recaudación bancaria

El horario de trabajo del personal no necesariamente coincide con el horario de recaudación.

Por ejemplo:

- El personal trabaja hasta las 6:00 p. m.
- Los clientes pueden seguir pagando hasta las 8:59 p. m.
- El banco cierra el lote a las 9:00 p. m.
- El personal puede revisar esos pagos al siguiente día.
- El banco continuará con su proceso de liquidación independientemente de que ya no haya personal atendiendo.

Por lo tanto, el sistema debe registrar automáticamente las operaciones realizadas fuera del horario de atención.

---

## 5. Operación de Scotiabank

### 5.1 Regla

- Hora de corte: 9:00 p. m.
- Plazo estimado de abono: 1 día hábil después del cierre del lote.

### 5.2 Ventana operativa

Un lote puede comprender, por ejemplo:

- Inicio: 29/07/2026 a las 9:00:00 p. m.
- Fin: 30/07/2026 a las 8:59:59 p. m.
- Cierre: 30/07/2026 a las 9:00 p. m.

Las operaciones realizadas dentro de esa ventana pertenecen al mismo lote.

### 5.3 Ejemplo

Un cliente paga el 29/07/2026 a las 9:05 p. m.

Ese pago ocurre después del corte del 29 de julio, por lo que debe incluirse en el lote que cierra el 30/07/2026 a las 9:00 p. m.

Durante el 30 de julio otros clientes pueden seguir pagando:

- 9:00 a. m.
- 3:00 p. m.
- 5:50 p. m.
- 7:30 p. m.
- 8:59 p. m.

Todos estos pagos pertenecen al mismo lote.

El lote se cierra a las 9:00 p. m. del 30 de julio.

La fecha estimada de abono sería el siguiente día hábil, siempre que no exista feriado, observación o retraso bancario.

### 5.4 Pago posterior al corte

Un pago realizado el 30/07/2026 a las 9:05 p. m. ya no pertenece al lote cerrado ese día.

Debe formar parte del lote que cerrará el 31/07/2026 a las 9:00 p. m.

---

## 6. Operación de BanBif

### 6.1 Regla

- Hora de corte: 9:00 p. m.
- Plazo estimado de abono: 1 día hábil después del cierre del lote.

### 6.2 Comportamiento esperado

BanBif utilizará una lógica equivalente a Scotiabank:

- Pagos realizados antes del corte: lote del mismo día.
- Pagos realizados después del corte: lote del día siguiente.
- El abono se estima para el siguiente día hábil.

### 6.3 Ejemplo antes del corte

Pago:

- Fecha: viernes 31/07/2026.
- Hora: 4:00 p. m.

El pago pertenece al lote que cierra el viernes a las 9:00 p. m.

La fecha estimada de abono sería el lunes siguiente, porque sábado y domingo no son días hábiles.

### 6.4 Ejemplo después del corte

Pago:

- Fecha: viernes 31/07/2026.
- Hora: 10:00 p. m.

El pago pertenece al siguiente lote.

El sistema debe considerar si los lotes se cierran todos los días calendario o únicamente en días hábiles. Esta regla debe mantenerse como parámetro configurable hasta confirmar el comportamiento real del banco.

---

## 7. Operación de BCP

### 7.1 Regla

- Hora de corte: 12:00 a. m.
- Plazo estimado de abono: 1 día hábil.

### 7.2 Ventana operativa

El lote corresponde generalmente al día calendario completo.

Ejemplo:

- Inicio: 30/07/2026 a las 12:00 a. m.
- Fin: 30/07/2026 a las 11:59:59 p. m.
- Cierre: 31/07/2026 a las 12:00 a. m.

### 7.3 Ejemplo

Un cliente paga el 30/07/2026 a las 10:00 p. m.

El pago pertenece al lote que cierra al iniciar el 31/07/2026.

La fecha estimada de abono sería el siguiente día hábil definido por la operación bancaria.

### 7.4 Pago exactamente a medianoche

Un pago registrado exactamente a las 12:00 a. m. debe considerarse como parte del nuevo día operativo.

Por consistencia técnica, se recomienda utilizar intervalos con inicio inclusivo y fin exclusivo.

Ejemplo:

- Lote anterior: desde 30/07/2026 00:00:00 hasta antes de 31/07/2026 00:00:00.
- Nuevo lote: desde 31/07/2026 00:00:00 hasta antes de 01/08/2026 00:00:00.

---

## 8. Operación de SafetyPay

### 8.1 Regla

- Hora de corte: 12:00 a. m.
- Plazo estimado de abono: 2 días hábiles.

### 8.2 Ejemplo entre semana

Pago:

- Fecha: lunes 03/08/2026.
- Hora: 2:00 p. m.

El pago pertenece al lote que cierra al iniciar el martes 04/08/2026.

La fecha estimada de abono sería dos días hábiles después del cierre, según la definición contractual del proveedor.

### 8.3 Ejemplo cercano al fin de semana

Pago:

- Fecha: jueves 30/07/2026.
- Hora: 3:00 p. m.
- Cierre del lote: viernes 31/07/2026 a las 12:00 a. m.

Al considerar dos días hábiles:

- Primer día hábil: viernes 31/07/2026.
- Segundo día hábil: lunes 03/08/2026.

La fecha estimada de abono sería el lunes 03/08/2026.

### 8.4 Ejemplo viernes por la noche

Pago:

- Fecha: viernes 31/07/2026.
- Hora: 11:00 p. m.
- Cierre: sábado 01/08/2026 a las 12:00 a. m.

Los dos días hábiles siguientes serían lunes y martes.

La fecha estimada de abono sería el martes 04/08/2026.

---

## 9. Comparación de una misma operación

Supongamos que un cliente paga el jueves 30/07/2026 a las 10:00 p. m.

| Entidad | Lote o corte aplicable | Fecha estimada de abono |
|---|---|---|
| Scotiabank | Corte del 31/07 a las 9:00 p. m. | Siguiente día hábil |
| BanBif | Corte del 31/07 a las 9:00 p. m. | Siguiente día hábil |
| BCP | Corte del 31/07 a las 12:00 a. m. | 1 día hábil |
| SafetyPay | Corte del 31/07 a las 12:00 a. m. | 2 días hábiles |

La misma fecha y hora de pago puede generar fechas estimadas de abono diferentes según la entidad financiera.

---

## 10. Estados funcionales recomendados

### REGISTRADO

La operación fue recibida por el sistema.

### PENDIENTE_DE_CORTE

El pago fue registrado, pero todavía pertenece a un lote abierto.

### LOTE_CERRADO

La hora de corte fue alcanzada y el lote ya no debe recibir nuevas operaciones.

### PENDIENTE_DE_ABONO

El lote cerró, pero el movimiento todavía no aparece acreditado en la cuenta bancaria.

### ABONADO

El banco registró el crédito correspondiente en la cuenta.

### CONCILIADO

El abono bancario fue comparado satisfactoriamente contra el lote y sus operaciones.

### OBSERVADO

Existe una diferencia de importe, cantidad de operaciones, fecha, referencia o cualquier otra inconsistencia.

### REVERSADO

La operación o el abono fue anulado, devuelto o revertido.

---

## 11. Reglas funcionales para el sistema

### 11.1 No incrementar el saldo al registrar el pago

Un pago recaudado debe incrementar el total pendiente de liquidación, pero no el saldo disponible.

### 11.2 No incrementar el saldo al cerrar el lote

El cierre del lote confirma que la ventana terminó, pero no que el banco ya realizó el abono.

### 11.3 Incrementar el saldo al confirmar el abono

El saldo disponible solo debe actualizarse cuando exista evidencia del movimiento bancario o de la conciliación correspondiente.

### 11.4 Separar montos

El sistema debe distinguir como mínimo:

- Total recaudado.
- Total pendiente de corte.
- Total en lotes cerrados.
- Total pendiente de abono.
- Total abonado.
- Total conciliado.
- Saldo bancario disponible.
- Saldo proyectado.

### 11.5 Saldo proyectado

El saldo proyectado puede calcularse como:

> Saldo disponible + recaudación pendiente de abono

Este valor es informativo y no representa dinero inmediatamente utilizable.

---

## 12. Días hábiles

El cálculo de la fecha estimada de abono debe considerar:

- Sábados.
- Domingos.
- Feriados nacionales.
- Feriados bancarios.
- Días no laborables que afecten la liquidación.
- Excepciones particulares de cada entidad.

Se recomienda mantener un calendario de días hábiles administrable.

No debe asumirse que sumar un día hábil equivale a sumar 24 horas.

---

## 13. Casos especiales

### 13.1 Pago después del corte

Debe pasar automáticamente al siguiente lote.

### 13.2 Pago durante un fin de semana

Puede ser registrado normalmente, pero su fecha estimada de abono dependerá de si la entidad procesa lotes durante el fin de semana.

### 13.3 Pago en feriado

El pago puede aparecer en el reporte, pero su liquidación puede trasladarse al siguiente día hábil.

### 13.4 Abono parcial

Si el monto abonado es menor que el total del lote, el sistema debe marcarlo como observado y no conciliarlo automáticamente.

### 13.5 Abono consolidado

El banco puede generar un solo movimiento por el total del lote.

La conciliación debe relacionar ese movimiento consolidado con todas las operaciones incluidas.

### 13.6 Abonos divididos

El banco puede realizar más de un abono para un mismo lote.

El sistema debe permitir conciliaciones parciales hasta completar el total esperado.

### 13.7 Retraso bancario

Si la fecha estimada de abono ya venció y el dinero no aparece, el lote debe mantenerse pendiente y marcarse con una alerta de retraso.

### 13.8 Reverso

Si una operación previamente registrada es revertida, el sistema debe conservar la trazabilidad y ajustar los totales correspondientes.

---

## 14. Ejemplo funcional completo

Entidad: Scotiabank.

Reglas:

- Corte: 9:00 p. m.
- Abono: 1 día hábil.

Operaciones:

| Fecha y hora | Monto |
|---|---:|
| 29/07/2026 9:05 p. m. | S/ 500 |
| 30/07/2026 10:00 a. m. | S/ 1,000 |
| 30/07/2026 5:45 p. m. | S/ 750 |
| 30/07/2026 7:30 p. m. | S/ 300 |
| 30/07/2026 8:59 p. m. | S/ 450 |

Total del lote:

> S/ 3,000

Comportamiento esperado:

1. Cada pago se registra como recaudado.
2. Todos pertenecen al lote que cierra el 30/07/2026 a las 9:00 p. m.
3. Antes del corte, permanecen pendientes de corte.
4. A las 9:00 p. m., el lote cambia a cerrado.
5. Las operaciones quedan pendientes de abono.
6. La fecha estimada de abono será el siguiente día hábil.
7. El saldo disponible no cambia hasta confirmar el movimiento bancario.
8. Cuando el banco abone S/ 3,000, el lote puede marcarse como abonado.
9. Después de validar el monto y las operaciones, el lote queda conciliado.

---

## 15. Ejemplo de pago posterior al cierre

Después de cerrar el lote anterior, un cliente paga:

- Fecha: 30/07/2026.
- Hora: 9:05 p. m.
- Monto: S/ 200.

Este pago no debe agregarse al lote de S/ 3,000.

Debe iniciar o asociarse al lote siguiente:

- Inicio: 30/07/2026 a las 9:00 p. m.
- Cierre: 31/07/2026 a las 9:00 p. m.
- Fecha estimada de abono: siguiente día hábil después del cierre.

---

## 16. Consideraciones para complementar el sistema actual

Antes de implementar la nueva funcionalidad, se debe identificar en el sistema existente:

- Dónde se registra actualmente la fecha y hora del pago.
- Cómo se identifica la entidad financiera.
- Si ya existe un estado de operación.
- Si existe una tabla o entidad equivalente a lote.
- Cómo se calcula actualmente el saldo de cada caja o cuenta.
- Cómo se importan los movimientos bancarios.
- Si existe conciliación automática o manual.
- Cómo se manejan los feriados.
- Si una operación puede cambiar de estado.
- Si se conserva historial de cambios.
- Si se soportan abonos consolidados y parciales.

La nueva funcionalidad debe complementar estas estructuras sin duplicar información ni modificar el saldo disponible antes de la confirmación bancaria.

---

## 17. Validaciones pendientes con cada entidad

Para asegurar que las reglas utilizadas coincidan con la operación real, se debe solicitar o confirmar:

- Hora exacta del corte.
- Tratamiento de operaciones realizadas exactamente a la hora de corte.
- Si existen cortes durante sábados, domingos y feriados.
- Desde qué momento se cuentan los días hábiles de abono.
- Hora aproximada del abono.
- Si el abono es consolidado o individual.
- Cantidad de abonos diarios.
- Identificador del lote en el estado de cuenta.
- Tratamiento de reversos.
- Tratamiento de diferencias.
- Plazo máximo de regularización.
- Disponibilidad de archivos, API o reportes de conciliación.

---

## 18. Conclusión

El sistema debe tratar la recaudación, el cierre del lote y el abono bancario como eventos independientes.

La hora de corte permite organizar los pagos y determinar a qué lote pertenecen.

El plazo de abono permite calcular una fecha estimada, pero el saldo disponible solo debe actualizarse cuando se confirme que el banco realizó efectivamente el abono.

Las reglas iniciales son:

- Scotiabank: corte 9:00 p. m. y abono en 1 día hábil.
- BanBif: corte 9:00 p. m. y abono en 1 día hábil.
- SafetyPay: corte 12:00 a. m. y abono en 2 días hábiles.
- BCP: corte 12:00 a. m. y abono en 1 día hábil.

Toda la lógica debe mantenerse parametrizable para permitir cambios futuros y diferencias contractuales entre cuentas, bancos o proveedores.
# Estado vigente 22/08/2026

Este documento describe el modelo historico de cortes y abonos. En la operacion
actual, los cortes configurables no deciden la retencion de las cuentas especiales.
La fuente de verdad es la funcion hardcodeada documentada en
[`backend/CONTEXTO_GENERAL_BACKEND.md`](../CONTEXTO_GENERAL_BACKEND.md): Scotiabank
y BanBif usan 21:00, BCP usa 00:00, siempre con `fecha_deposito_cliente` en hora de
Lima. No existe liberacion automatica; las funciones de job son seguras y no
liberan fondos. Mantener este documento como referencia conceptual de abonos, no
como contrato actual de retenciones.
