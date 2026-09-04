# Cajas Operativas: Opciones De Funcionamiento

> **Estado vigente 04/09/2026:** Consultar primero
> [`36_mapa_funcional_vigente_2026-09.md`](36_mapa_funcional_vigente_2026-09.md).
> El sistema usa la opcion de nueva caja en cero
> despues del cierre. El modal permite conciliar el saldo del sistema con el saldo
> que muestra la banca; el saldo ingresado puede usar `1,000.00`, `1000` o `1,000`.
> La conciliacion registra un ajuste administrativo y deja la Caja Inicial y Caja
> Actual iguales al saldo bancario, sin convertir el ajuste en Ingreso KPI. Las
> secciones antiguas de opciones quedan como contexto; este bloque es el contrato
> vigente.

### Flujo vigente de caja

El boton `Cierre` permanece visible pero deshabilitado. El job
`f_job_cerrar_cajas_operativas_2230` ejecuta el cierre a las 22:30 hora Peru y
el tooltip del boton informa esta automatizacion.

- Cerrar caja conserva intacto el snapshot historico de saldo, salidas, gastos,
  ganancias y clasificaciones informativas.
- La nueva caja comienza en cero en todos los KPI; el usuario registra despues el
  saldo real de la banca.
- Si ya hubo operaciones en el nuevo ciclo, no se permite editar libremente el
  saldo inicial.
- Las operaciones pendientes no se congelan como historico: permanecen en Hoy para
  ser atendidas. Las operaciones finalizadas si quedan en el cierre.
- Pagar una pendiente heredada afecta la caja viva con Salida, Gasto Operacional y
  Caja Actual; no modifica la ganancia ni el cierre anterior.

## ¿Qué es el modal Cajas?

En las rutas bancarias, dentro de **Configuración > Cajas**, se puede asociar una empresa con una cuenta bancaria.

El modal muestra principalmente:

- **Saldo inicial:** monto con el que comienza la caja.
- **Saldo actual:** monto disponible después de los movimientos.
- **Estado:** caja activa o inactiva.

El saldo actual se calcula con los ingresos, salidas y gastos de las operaciones. Por eso, cambiar el saldo inicial cuando ya existen movimientos puede cambiar los KPI y los cálculos de la caja.

## Opción 1: Mantener el funcionamiento actual

Esta es la forma en la que **actualmente funciona el sistema**.

La caja continúa trabajando con el saldo del ciclo anterior. Cada operación actualiza los KPI que corresponden y el saldo actual se calcula automáticamente.

### ¿Qué significa cada KPI?

- **Caja Inicial:** monto con el que comenzó el ciclo.
- **Caja Actual:** saldo disponible para realizar nuevas operaciones.
- **Caja Recaudación:** depósitos recibidos por operaciones de recaudación.
- **Ingresos:** ingresos registrados por otros movimientos.
- **Salidas:** transferencias y pagos realizados desde la caja.
- **Gastos Operacionales:** comisiones y gastos asociados a las operaciones.
- **Ganancias:** resultado de las comisiones del servicio.
- **Retención Recaudación:** montos retenidos temporalmente y pendientes de liberación.

### Ejemplo

**Al abrir**

<table>
<tr>
<td><strong>Caja Inicial</strong><br>S/ 10,000.00</td>
<td><strong>Caja Actual</strong><br>S/ 10,000.00</td>
<td><strong>Caja Recaudación</strong><br>S/ 0.00</td>
<td><strong>Ingresos</strong><br>S/ 0.00</td>
<td><strong>Salidas</strong><br>S/ 0.00</td>
</tr>
</table>

<table>
<tr>
<td><strong>Gastos Operacionales</strong><br>S/ 0.00</td>
<td><strong>Ganancias</strong><br>S/ 0.00</td>
<td><strong>Retención Recaudación</strong><br>S/ 0.00</td>
</tr>
</table>

**Después de operaciones**

<table>
<tr>
<td><strong>Caja Inicial</strong><br>S/ 10,000.00</td>
<td><strong>Caja Actual</strong><br>S/ 11,200.00</td>
<td><strong>Caja Recaudación</strong><br>S/ 2,000.00</td>
<td><strong>Ingresos</strong><br>S/ 0.00</td>
<td><strong>Salidas</strong><br>S/ 800.00</td>
<td><strong>Gastos Operacionales</strong><br>S/ 20.00</td>
</tr>
</table>

<table>
<tr>
<td><strong>Ganancias</strong><br>S/ 18.00</td>
<td><strong>Retención Recaudación</strong><br>S/ 0.00</td>
</tr>
</table>

En este ejemplo, la caja actual refleja los ingresos y las salidas. El gasto queda visible en su KPI y se controla al momento del cierre.

### ¿Qué ocurre al cerrar?

Al cerrar la caja:

1. Los KPI del día quedan guardados en el historial.
2. La fecha cerrada queda congelada para consulta.
3. Las operaciones pagadas quedan relacionadas con ese cierre.
4. Las operaciones pendientes o retenidas continúan con sus reglas correspondientes.
5. La nueva caja continúa con el saldo disponible del ciclo anterior.

**Ejemplo del nuevo ciclo después del cierre:**

<table>
<tr>
<td><strong>Caja Inicial</strong><br>S/ 11,200.00</td>
<td><strong>Caja Actual</strong><br>S/ 11,180.00</td>
<td><strong>Caja Recaudación</strong><br>S/ 0.00</td>
<td><strong>Ingresos</strong><br>S/ 0.00</td>
<td><strong>Salidas</strong><br>S/ 0.00</td>
<td><strong>Gastos Operacionales</strong><br>S/ 0.00</td>
</tr>
</table>

La diferencia de S/ 20.00 queda registrada como un movimiento de gasto de cierre para explicar por qué el saldo actual es menor que el saldo inicial.

**Importante:** no se debe editar el saldo inicial después de registrar operaciones, salvo que se esté corrigiendo un dato autorizado.

## Opción 2: Comenzar cada día en cero

Cada nuevo día comienza con todos los KPI en `S/ 0.00`. El usuario debe ingresar el saldo inicial de cada caja antes de comenzar a trabajar.

El saldo inicial se puede editar mientras no existan operaciones ni movimientos nuevos.

### Ejemplo de corrección inmediata

<table>
<tr>
<td><strong>Caja Inicial</strong><br>S/ 0.00</td>
<td><strong>Caja Actual</strong><br>S/ 0.00</td>
<td><strong>Ingresos</strong><br>S/ 0.00</td>
<td><strong>Salidas</strong><br>S/ 0.00</td>
<td><strong>Gastos Operacionales</strong><br>S/ 0.00</td>
</tr>
</table>

El usuario registra S/ 10,000.00 y, si se equivocó, puede corregirlo antes de cargar Excel o registrar cualquier operación.

Después de la primera operación, la edición del saldo inicial queda bloqueada.

## Flujo de los días

### 1. Ayer: cierre de caja

El cierre de ayer conserva los valores finales del día y queda disponible en el historial.

<table>
<tr>
<td><strong>Caja Inicial</strong><br>S/ 10,000.00</td>
<td><strong>Caja Actual</strong><br>S/ 11,180.00</td>
<td><strong>Ingresos</strong><br>S/ 2,000.00</td>
<td><strong>Salidas</strong><br>S/ 800.00</td>
<td><strong>Gastos Operacionales</strong><br>S/ 20.00</td>
</tr>
</table>

### 2. Hoy: inicio de caja

La caja de hoy comienza completamente en cero. Antes de trabajar, el usuario registra el saldo inicial.

<table>
<tr>
<td><strong>Caja Inicial</strong><br>S/ 0.00</td>
<td><strong>Caja Actual</strong><br>S/ 0.00</td>
<td><strong>Ingresos</strong><br>S/ 0.00</td>
<td><strong>Salidas</strong><br>S/ 0.00</td>
<td><strong>Gastos Operacionales</strong><br>S/ 0.00</td>
</tr>
</table>

Después de registrar el saldo inicial:

<table>
<tr>
<td><strong>Caja Inicial</strong><br>S/ 10,000.00</td>
<td><strong>Caja Actual</strong><br>S/ 10,000.00</td>
<td><strong>Ingresos</strong><br>S/ 0.00</td>
<td><strong>Salidas</strong><br>S/ 0.00</td>
<td><strong>Gastos Operacionales</strong><br>S/ 0.00</td>
</tr>
</table>

Este es el único momento en el que se puede corregir el saldo inicial.

### 3. Hoy: cierre de caja

Al cerrar hoy, los valores del día quedan congelados en el historial.

<table>
<tr>
<td><strong>Caja Inicial</strong><br>S/ 11,180.00</td>
<td><strong>Caja Actual</strong><br>S/ 12,360.00</td>
<td><strong>Ingresos</strong><br>S/ 1,500.00</td>
<td><strong>Salidas</strong><br>S/ 300.00</td>
<td><strong>Gastos Operacionales</strong><br>S/ 20.00</td>
</tr>
</table>

El cierre histórico no debe modificarse desde la caja del día siguiente.

### 4. Mañana: nuevo inicio

Mañana vuelve a comenzar con todos los KPI en cero. El usuario debe registrar nuevamente el saldo inicial.

<table>
<tr>
<td><strong>Caja Inicial</strong><br>S/ 0.00</td>
<td><strong>Caja Actual</strong><br>S/ 0.00</td>
<td><strong>Ingresos</strong><br>S/ 0.00</td>
<td><strong>Salidas</strong><br>S/ 0.00</td>
<td><strong>Gastos Operacionales</strong><br>S/ 0.00</td>
</tr>
</table>

## Recomendación

La **Opción 2** requiere una rutina diaria clara:

- cerrar la caja al terminar el día;
- iniciar el siguiente día con todos los KPI en cero;
- registrar el saldo inicial antes de operar;
- corregirlo solo antes de cargar Excel o registrar operaciones.

La **Opción 1** se mantiene como alternativa si se necesita continuar el saldo entre días.

### Mensaje simple para los usuarios

> El saldo inicial define con cuánto dinero comienza la caja. Cuando ya existen operaciones, no se debe modificar directamente porque puede cambiar los cálculos. Para corregir una diferencia, se debe utilizar un ajuste autorizado.
