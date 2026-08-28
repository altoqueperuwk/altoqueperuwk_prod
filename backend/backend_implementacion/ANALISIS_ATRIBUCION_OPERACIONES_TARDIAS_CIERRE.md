# Atribucion De Operaciones Tardias A Cierres

> ESTADO: CAUSA CONFIRMADA - PENDIENTE DE IMPLEMENTACION
>
> Este documento conserva el analisis para retomarlo posteriormente. No se ha
> modificado todavia el flujo automatico de carga ni de cierre por este caso.

## Caso Detectado

Operacion:

```text
id:                         11286
codigo:                     01958600
fecha_deposito_cliente:     27/08/2026 09:26:10
fecha_registro:              28/08/2026 09:26:08
fecha_pagado:                28/08/2026 09:28:44
monto_deposito_cliente:      S/ 3,000.00
monto_transferencia_cliente: S/ 2,970.00
gasto_banco_ingreso:         S/ 6.15
gasto_banco_salida:          S/ 0.10
```

Cierre correspondiente al deposito:

```text
id:             208
id_caja:        1
fecha_apertura: 26/08/2026 18:03:28
fecha_cierre:   27/08/2026 18:01:26
```

La fecha real del deposito se encuentra dentro del cierre 208, pero la
operacion fue creada al dia siguiente, despues de que el cierre ya habia sido
ejecutado.

## Causa

`f_sync_tb_operacion_cierre_atribucion_v2` se ejecuta durante el cierre y solo
puede atribuir operaciones que ya existen en ese momento. Para el ingreso usa
`fecha_registro` desde la apertura de la caja.

`f_post_tb_operacion_proceso_excel` crea posteriormente la operacion, pero no
busca retrospectivamente un cierre mediante `fecha_deposito_cliente`. Por eso
la operacion queda con:

```text
id_caja_cierre         = NULL
id_caja_cierre_ingreso = NULL
id_caja_cierre_salida  = NULL
```

El KPI vivo interpreta entonces el deposito como parte del ciclo actual. Esto
duplica el deposito cuando el saldo inicial bancario del nuevo ciclo ya lo
incluia.

## Investigacion Confirmada

La expresion "pendiente de ayer" describe el estado operativo de la transaccion
en el banco, pero no significa que la operacion ya existiera como fila pendiente
en `tb_operacion_proceso`.

La secuencia real fue:

```text
27/08 09:26  El cliente realiza el deposito en el banco.
27/08 18:01  Se ejecuta el cierre 208.
28/08 09:26  El usuario carga el Excel y se crea la operacion 11286.
28/08 09:28  La operacion pasa a Pagado.
```

Al momento del cierre 208, la operacion 11286 todavia no existia. Por lo tanto,
el cierre no pudo marcarla como pendiente ni completar sus campos de
atribucion. El hecho de que el usuario iniciara el nuevo dia con cero
operaciones confirma que la fila fue incorporada por primera vez mediante la
carga del 28.

### Comportamiento del cierre

`f_post_tb_caja_operativa_cierre` llama a
`f_sync_tb_operacion_cierre_atribucion_v2` despues de crear el historial. Esta
funcion actualiza exclusivamente filas existentes y utiliza como limite de
entrada:

```sql
op.fecha_registro >= tb_caja_operativa.fecha_apertura
```

No puede anticipar operaciones que seran insertadas despues del cierre. El
parametro `p_fecha_cierre` se retorna como informacion, pero actualmente no se
utiliza para resolver operaciones cargadas de forma tardia.

### Comportamiento de la carga Excel

`f_post_tb_operacion_proceso_excel` conserva correctamente la fecha bancaria en
`fecha_deposito_cliente`, pero crea la fila con la fecha actual en
`fecha_registro`. El `INSERT` no incluye:

```text
id_caja_cierre_ingreso
id_caja_cierre_salida
id_caja_cierre
```

Despues del `INSERT`, la funcion tampoco consulta
`tb_caja_operativa_cierre`. La llamada posterior a
`f_post_tb_operacion_caja_desde_proceso` no corrige la atribucion; para las
rutas bancarias con KPI V2 esa funcion ya evita crear un movimiento nuevo en
`tb_operacion_caja` y retorna de manera informativa.

### Conclusion

No se trata de un doble clic, un cierre incompleto ni una operacion pendiente
que el cierre omitio. Existen dos momentos desconectados:

1. El cierre atribuye solamente operaciones que existen al momento de cerrar.
2. La carga Excel posterior no busca el cierre historico correspondiente a la
   fecha real del deposito.

Esa falta de reconciliacion retrospectiva es la causa exacta de que el deposito
del 27 apareciera en la caja viva del 28.

## Atribucion Correcta

Para el cierre 208:

```text
Caja Recaudacion:         S/ 3,000.00
Gasto bancario de ingreso: S/ 6.15
Ganancia:                  S/ 23.75
```

Para la caja viva donde se realizo el pago:

```text
Salida:                    S/ 2,970.00
Gasto bancario de salida:  S/ 0.10
```

La operacion debe conservar:

```text
id_caja_cierre_ingreso = 208
id_caja_cierre_salida  = NULL hasta cerrar el ciclo del pago
id_caja_cierre         = NULL para no forzar toda la operacion al cierre legacy
```

## Solucion Propuesta

Crear una funcion auxiliar central que se ejecute despues de insertar una
operacion. Debe buscar el cierre de la misma empresa y cuenta que contenga la
fecha real del deposito:

```sql
fecha_deposito_cliente >= fecha_apertura
AND fecha_deposito_cliente < fecha_cierre
```

Si encuentra un cierre, debe completar solamente
`id_caja_cierre_ingreso`. La salida debe seguir atribuyendose mediante la fecha
de pago y el cierre del ciclo donde se realizo la transferencia.

La funcion auxiliar debera ser utilizada por:

- carga Excel;
- carga Excel con ganancia;
- registro manual de efectivizacion;
- cualquier otro flujo que pueda registrar hoy un deposito de una fecha
  anterior.

No debe modificar snapshots historicos, caja operativa, movimientos ni
`id_caja_cierre` legacy.

## Correccion Manual De Contingencia

Para la operacion analizada se uso una actualizacion protegida por el intervalo
del cierre:

```sql
UPDATE public.tb_operacion_proceso op
SET id_caja_cierre_ingreso = cc.id
FROM public.tb_caja_operativa_cierre cc
WHERE op.id = 11286
  AND cc.id = 208
  AND op.id_caja_cierre_ingreso IS NULL
  AND op.fecha_deposito_cliente >= cc.fecha_apertura
  AND op.fecha_deposito_cliente <= cc.fecha_cierre;
```

## Validacion Futura

1. Cargar hoy una operacion depositada antes del cierre anterior.
2. Confirmar que `id_caja_cierre_ingreso` apunte al cierre historico correcto.
3. Confirmar que el deposito, gasto de ingreso y ganancia no aparezcan en la
   caja viva.
4. Pagar la operacion en el ciclo actual.
5. Confirmar que solo la transferencia y su gasto de salida afecten la caja
   viva.
6. Cerrar la caja actual y confirmar que `id_caja_cierre_salida` quede asociado
   al nuevo cierre.
7. Probar operaciones sin cierre historico aplicable: deben permanecer en la
   caja viva.
