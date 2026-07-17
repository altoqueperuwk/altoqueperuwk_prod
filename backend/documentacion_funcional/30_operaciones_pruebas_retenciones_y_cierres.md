# 30. Operaciones: Pruebas de Retenciones, Fechas y Cierres

## Objetivo

Definir como probar escenarios reales entre ayer y hoy para Scotiabank/Banbif, especialmente retenciones, cierres, salidas y confirmaciones manuales.

## Escenario principal

Ruta inicial:

- `/operaciones/scotiabank`

Tambien aplica a:

- `/operaciones/banbif`

## Preparacion

1. Verificar que la cuenta bancaria tenga `flag_retencion = true`.
2. Verificar que exista caja operativa para la empresa/cuenta.
3. Verificar reglas activas de efectivizacion para la ruta.
4. Cargar archivo con operaciones de deposito de ayer.

## Dia Ayer

Desde frontend, crear actividad como si fuera el dia operativo anterior:

1. Cargar Excel/TXT con operaciones de ayer.
2. Dejar algunas operaciones pendientes.
3. Marcar algunas operaciones como `Pagado`.
4. Atender derivados.
5. Atender Pago Deuda:
   - transferencia;
   - devolucion/match si corresponde.
6. Usar modales:
   - Mover Saldo;
   - Ingreso y Salidas;
   - Operacion Efectivizacion.
7. Hacer cierre de caja.

Resultado esperado de ayer:

- Las salidas pagadas quedan congeladas.
- Los gastos confirmados quedan congelados.
- Los ingresos retenidos no quedan cerrados.
- KPI historico muestra salidas/gastos/operaciones cerradas.
- `Ingresos Retenidos` historico puede mostrar el snapshot segun cierre, pero los retenidos operativos quedan abiertos para hoy.

## Script de simulacion

Archivo:

- `backend/backend_pruebas/10.simular_scotiabank_ayer.sql`

Uso:

1. Crear el escenario desde frontend hoy.
2. Ejecutar el script con `ROLLBACK` por defecto.
3. Revisar snapshots.
4. Cambiar a `COMMIT` solo si todo cuadra.

El script:

- mueve fechas comerciales a ayer;
- mueve movimientos a ayer;
- mueve cierre de caja a ayer;
- cierra movimientos de salida pagados;
- mantiene abiertos ingresos retenidos;
- recompone caja viva para hoy;
- sincroniza KPI.

## Dia Hoy

Despues de simular ayer, revisar hoy:

### Efectivizacion

Debe mostrar:

- solo operaciones pendientes vivas.

No debe mostrar:

- pagadas retenidas que ya tuvieron su salida cerrada.

### Pago Deuda

Debe estar vacio si Pago Deuda se cerro ayer.

### Derivados

Debe mostrar:

- solo derivados pendientes vivos.

### Movimientos

Debe estar vacio si hoy no se hizo ninguna accion ni confirmacion.

No debe mostrar:

- ingresos retenidos pendientes;
- salidas cerradas de ayer.

### Retenidos

Debe mostrar:

- retenciones abiertas de ayer;
- retenciones de hoy si se cargaron nuevas y aun no se confirmaron.

Debe filtrar por:

- `fecha_deposito_cliente`, no por `fecha_registro`.

### KPI hoy

Debe mostrar:

- `Ingresos = 0` si no se confirmo nada hoy.
- `Total Recaudado = 0` si no se confirmo nada hoy.
- `Salidas = 0` si no se hizo salida hoy.
- `Gastos Operacionales = 0` si no hubo movimientos confirmados hoy.
- `Ingresos Retenidos` con el monto abierto de ayer.
- `Caja Actual` sin sumar retenidos.

## Confirmacion de retencion

Al seleccionar retenidos y confirmar:

1. La fila sale del tab `Retenidos`.
2. El movimiento pasa de `RETENIDO` a confirmado.
3. El ingreso aparece en `Movimientos`.
4. `Ingresos` sube.
5. `Total Recaudado` sube.
6. `Caja Actual` sube.
7. `Ingresos Retenidos` baja.
8. KPI y badges se refrescan.

## Validaciones SQL sugeridas

### Retenidos abiertos

```sql
SELECT
  oc.id_caja,
  oc.nombre_estado,
  COUNT(*) AS total,
  SUM(oc.monto_ingreso) AS monto
FROM public.tb_operacion_caja oc
WHERE oc.tipo_movimiento = 'INGRESO'
  AND UPPER(oc.nombre_estado) = 'RETENIDO'
  AND oc.id_caja_cierre IS NULL
GROUP BY oc.id_caja, oc.nombre_estado;
```

### Movimientos abiertos no retenidos

```sql
SELECT
  oc.tipo_origen,
  oc.tipo_movimiento,
  oc.nombre_estado,
  COUNT(*) AS total
FROM public.tb_operacion_caja oc
WHERE oc.id_caja_cierre IS NULL
  AND NOT (
    UPPER(oc.tipo_movimiento) = 'INGRESO'
    AND UPPER(oc.nombre_estado) = 'RETENIDO'
  )
GROUP BY oc.tipo_origen, oc.tipo_movimiento, oc.nombre_estado;
```

### Operaciones retenidas

```sql
SELECT
  op.id,
  op.nombre_estado,
  op.flag_retenido,
  op.id_caja_cierre,
  op.fecha_deposito_cliente,
  op.fecha_caja_cierre
FROM public.tb_operacion_proceso op
WHERE op.flag_retenido = true
ORDER BY op.fecha_deposito_cliente, op.id;
```

## Reglas de seguridad de pruebas

- No ejecutar scripts de simulacion con `COMMIT` sin revisar snapshots.
- No corregir saldos manualmente si existe script de reparacion.
- Para reparar pruebas usar:
  - `backend/backend_pruebas/11.reparar_retenciones_kpi_caja.sql`
- Mantener `ROLLBACK` por defecto en scripts de prueba.

