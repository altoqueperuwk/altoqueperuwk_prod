Necesito complementar el sistema actual con el manejo de retenciones, cortes operativos y abonos bancarios. No se debe reemplazar lo existente, sino adaptar la lógica actual considerando las siguientes reglas y casuísticas.

## 1. Reglas generales

El sistema debe diferenciar estos momentos:

1. El cliente realiza el depósito.
2. La operación queda registrada y retenida.
3. La operación llega a su hora de corte.
4. Se calcula la fecha y hora estimada de abono.
5. El banco realiza el abono.
6. La operación puede liberarse después de confirmar el abono.

No se deben contar como días hábiles:

* Sábados.
* Domingos.
* Feriados nacionales.
* Otros días no operativos que se configuren en el calendario del sistema.

Para julio de 2026 deben considerarse como feriados nacionales el martes 28 y el miércoles 29 de julio. El lunes 27 fue día no laborable para el sector público, pero no debe tratarse automáticamente como feriado bancario sin una configuración expresa.

---

# 2. SafetyPay

## Regla operativa

* Hora de corte: 12:00 a. m.
* Plazo de abono: 2 días hábiles.
* Hora estimada de abono: 2:00 p. m. del segundo día hábil.
* SafetyPay realiza los abonos de lunes a viernes.
* Sábados, domingos y feriados no cuentan.
* La hora de corte y la hora de abono son diferentes.

## Caso 1: operación normal de lunes

Depósito del cliente:

* Lunes 03/08/2026 a las 10:00 a. m.

Procesamiento:

* La operación pertenece al lote del lunes.
* Corte: martes 04/08/2026 a las 12:00 a. m.
* Primer día hábil: martes 04/08.
* Segundo día hábil: miércoles 05/08.
* Abono estimado: miércoles 05/08/2026 a las 2:00 p. m.

## Caso 2: operación realizada al final del lunes

Depósito:

* Lunes 03/08/2026 a las 11:59:59 p. m.

Resultado:

* Sí entra en el lote del lunes.
* Corte: martes 04/08 a las 12:00 a. m.
* Abono estimado: miércoles 05/08 a las 2:00 p. m.

## Caso 3: operación posterior al corte

Depósito:

* Martes 04/08/2026 a las 12:00:01 a. m.

Resultado:

* No entra en el lote del lunes.
* Pertenece al lote del martes.
* Corte: miércoles 05/08 a las 12:00 a. m.
* Primer día hábil: miércoles 05/08.
* Segundo día hábil: jueves 06/08.
* Abono estimado: jueves 06/08 a las 2:00 p. m., siempre que ese día sea operativo.

## Caso 4: operación del jueves antes del fin de semana

Depósito:

* Jueves 30/07/2026 a las 6:00 p. m.

Procesamiento:

* Corte: viernes 31/07 a las 12:00 a. m.
* Primer día hábil: viernes 31/07.
* Sábado 01/08: no cuenta.
* Domingo 02/08: no cuenta.
* Segundo día hábil: lunes 03/08.
* Abono estimado: lunes 03/08 a las 2:00 p. m.

## Caso 5: operación del viernes

Depósito:

* Viernes 31/07/2026 a las 8:00 p. m.

Procesamiento:

* Corte: sábado 01/08 a las 12:00 a. m.
* Sábado: no hábil.
* Domingo: no hábil.
* Primer día hábil: lunes 03/08.
* Segundo día hábil: martes 04/08.
* Abono estimado: martes 04/08 a las 2:00 p. m.

## Caso 6: feriados del 28 y 29 de julio

Depósito:

* Miércoles 29/07/2026.

Consideraciones:

* Martes 28/07: feriado.
* Miércoles 29/07: feriado.
* El bloque pendiente se procesa a partir del jueves 30/07.
* Primer día hábil posterior considerado: viernes 31/07.
* Sábado y domingo no cuentan.
* Segundo día hábil: lunes 03/08.
* Abono estimado: lunes 03/08 a las 2:00 p. m.

Este caso debe manejarse mediante el calendario de días hábiles y no mediante fechas fijas en el procedimiento.

---

# 3. Scotiabank

## Regla operativa asumida

* Hora de corte: 9:00 p. m.
* Plazo de abono: 1 día hábil.
* Hora estimada de abono: 9:00 p. m. del siguiente día hábil.
* La hora del corte y la hora habitual del abono son las mismas, pero corresponden a momentos o días diferentes.
* Las operaciones posteriores a las 9:00 p. m. pasan al siguiente lote.
* Sábados, domingos y feriados no cuentan.

Ejemplo conceptual:

* El lote cierra el lunes a las 9:00 p. m.
* Su abono se espera el martes a las 9:00 p. m.
* Al mismo tiempo, el martes a las 9:00 p. m. se cierra el lote siguiente.

## Caso 1: operación antes del corte

Depósito:

* Lunes 03/08/2026 a las 5:00 p. m.

Procesamiento:

* Sí entra en el lote que cierra el lunes.
* Corte: lunes 03/08 a las 9:00 p. m.
* Siguiente día hábil: martes 04/08.
* Abono estimado: martes 04/08 a las 9:00 p. m.

## Caso 2: operación a las 8:59 p. m.

Depósito:

* Lunes 03/08/2026 a las 8:59:59 p. m.

Resultado:

* Entra en el lote del lunes.
* Corte: lunes a las 9:00 p. m.
* Abono estimado: martes a las 9:00 p. m.

## Caso 3: operación posterior al corte

Depósito:

* Lunes 03/08/2026 a las 9:00:01 p. m.

Resultado:

* No entra en el lote que acaba de cerrar.
* Pasa al lote que cierra el martes 04/08 a las 9:00 p. m.
* Su abono se estima para el miércoles 05/08 a las 9:00 p. m.

## Caso 4: operación del viernes antes del corte

Depósito:

* Viernes 31/07/2026 a las 6:00 p. m.

Procesamiento:

* Corte: viernes 31/07 a las 9:00 p. m.
* Sábado y domingo no cuentan.
* Siguiente día hábil: lunes 03/08.
* Abono estimado: lunes 03/08 a las 9:00 p. m.

## Caso 5: operación del viernes después del corte

Depósito:

* Viernes 31/07/2026 a las 10:00 p. m.

Resultado:

* No entra en el lote del viernes.
* Debe pasar al siguiente lote operativo.
* Si el banco no procesa cortes durante fines de semana, el lote cerrará el lunes 03/08 a las 9:00 p. m.
* Abono estimado: martes 04/08 a las 9:00 p. m.

Este comportamiento de los lotes de fin de semana debe ser parametrizable, porque falta confirmar si Scotiabank cierra lotes sábado y domingo o acumula las operaciones para el lunes.

## Caso 6: feriados del 28 y 29 de julio

Una operación pendiente cuyo abono correspondía al martes 28 o miércoles 29 no debe liberarse durante esos días.

Ejemplo:

* Corte original: lunes 27/07 a las 9:00 p. m.
* Martes 28/07: feriado.
* Miércoles 29/07: feriado.
* Siguiente día hábil: jueves 30/07.
* Abono estimado: jueves 30/07 a las 9:00 p. m.

---

# 4. BanBif

## Regla operativa

Por el momento se utilizará una lógica equivalente a Scotiabank:

* Corte: 9:00 p. m.
* Abono: 1 día hábil.
* Hora estimada del abono: 9:00 p. m. del siguiente día hábil.
* Operaciones posteriores al corte pasan al siguiente lote.
* Sábados, domingos y feriados no cuentan.

## Ejemplo

Depósito:

* Jueves 30/07/2026 a las 8:30 p. m.

Resultado:

* Corte: jueves a las 9:00 p. m.
* Abono estimado: viernes 31/07 a las 9:00 p. m.

Depósito:

* Jueves 30/07/2026 a las 9:05 p. m.

Resultado:

* No entra en el lote del jueves.
* Corte correspondiente: viernes 31/07 a las 9:00 p. m.
* Siguiente día hábil: lunes 03/08.
* Abono estimado: lunes 03/08 a las 9:00 p. m.

---

# 5. BCP

## Regla operativa

* Hora de corte: 12:00 a. m.
* Plazo: 1 día hábil.
* Se está considerando que la hora habitual de corte y abono es la medianoche.
* Las operaciones del día se incluyen hasta las 11:59:59 p. m.
* Una operación desde las 12:00 a. m. pertenece al nuevo día.
* Sábados, domingos y feriados no cuentan.

## Caso 1: operación normal

Depósito:

* Lunes 03/08/2026 a las 4:00 p. m.

Resultado:

* Entra en el lote del lunes.
* Corte: martes 04/08 a las 12:00 a. m.
* Abono estimado: martes 04/08 a las 12:00 a. m., de acuerdo con la configuración asumida.

## Caso 2: operación posterior a medianoche

Depósito:

* Martes 04/08/2026 a las 12:00:01 a. m.

Resultado:

* No pertenece al lote del lunes.
* Pertenece al lote del martes.
* Corte y abono estimado: miércoles 05/08 a las 12:00 a. m.

## Caso 3: fin de semana

Depósito:

* Viernes 31/07/2026 a las 8:00 p. m.

Resultado:

* Corte: sábado 01/08 a las 12:00 a. m.
* Al no procesarse el abono durante el fin de semana, debe trasladarse al siguiente día hábil.
* Abono estimado: lunes 03/08 a las 12:00 a. m. o en el primer proceso bancario del lunes.

---

# 6. Reglas de inclusión en un lote

Para cortes a las 9:00 p. m.:

* Se incluye una operación cuando su hora es anterior a las 9:00 p. m.
* Desde las 9:00 p. m. en adelante, pertenece al siguiente lote.
* Técnicamente se recomienda manejar el intervalo como inicio inclusivo y fin exclusivo.

Ejemplo:

* Lote actual: desde 02/08/2026 21:00:00 hasta antes de 03/08/2026 21:00:00.
* Una operación a las 20:59:59 entra.
* Una operación a las 21:00:00 pertenece al nuevo lote.

Para cortes a medianoche:

* Se incluyen las operaciones desde las 12:00 a. m. hasta las 11:59:59 p. m.
* Una operación exactamente a las 12:00 a. m. pertenece al nuevo día.

Ejemplo:

* Lote del lunes: desde 03/08/2026 00:00:00 hasta antes de 04/08/2026 00:00:00.
* Una operación a las 23:59:59 entra en el lote del lunes.
* Una operación a las 00:00:00 del martes pertenece al lote del martes.

---

# 7. Estados esperados

La operación debe pasar por estados equivalentes a:

* Pendiente de corte.
* Lote cerrado.
* Pendiente de abono.
* Abono estimado vencido.
* Abonado.
* Liberable.
* Conciliado.
* Observado.
* Reversado.

La llegada de la fecha y hora estimada no debe confirmar automáticamente que el dinero fue abonado.

Cuando llegue la fecha estimada:

* Si todavía no existe confirmación bancaria, debe mantenerse pendiente o pendiente de confirmación.
* Solo debe marcarse como abonado y liberable cuando se confirme el ingreso en la cuenta.

---

# 8. Configuración necesaria

Las siguientes propiedades no deben quedar escritas directamente en la lógica:

* Hora de corte.
* Cantidad de días hábiles.
* Hora estimada del abono.
* Si el día del corte cuenta o no.
* Si procesa sábados.
* Si procesa domingos.
* Si procesa feriados.
* Si el lote se genera diariamente o solo en días hábiles.
* Calendario de feriados.
* Tolerancia o margen posterior a la hora estimada.
* Reglas particulares por banco o proveedor.

Reglas iniciales:

| Entidad    |       Corte |          Plazo | Hora estimada del abono |
| ---------- | ----------: | -------------: | ----------------------: |
| SafetyPay  | 12:00 a. m. | 2 días hábiles |              2:00 p. m. |
| Scotiabank |  9:00 p. m. |    1 día hábil |              9:00 p. m. |
| BanBif     |  9:00 p. m. |    1 día hábil |              9:00 p. m. |
| BCP        | 12:00 a. m. |    1 día hábil |             12:00 a. m. |

SafetyPay es el único de estos casos donde la hora de corte y la hora estimada de abono son diferentes.

Antes de modificar código, revisa la estructura existente e identifica qué tablas, funciones, procedimientos y estados ya cubren parte de esta lógica. La solución debe complementar el sistema actual, reutilizando sus estructuras y evitando duplicar el cálculo de saldos, retenciones o conciliaciones.
