# Plan De Optimizacion De Refresco Frontend

## Estado

**Fase 1 implementada.**

El refresco automatico por foco fue retirado del modulo bancario. Las bandejas
y badges se actualizan ahora por acciones o cambios reales de contexto,
conservando pendientes las fases de invalidacion por alcance y optimizacion de
consultas N+1.

Este documento deja marcada la propuesta para retomarla despues de atender la tarea urgente actual.

## Objetivo

Evitar que una accion en `/operaciones/bancos` refresque toda la pantalla. Cada accion debe actualizar solamente la informacion que realmente cambia.

No se modificaran funciones SQL, tablas ni contratos RPC.

## Problema Actual

La pagina utiliza estados globales como `refreshKey` y `metricsRefreshKey`. Al modificarlos, se vuelven a consultar simultaneamente:

- empresas y cajas;
- KPI;
- bandejas;
- badges;
- formularios;
- catalogos;
- movimientos.

Esto aumenta las llamadas y los renders, especialmente en Interbank/SafetyPay, donde se consultan dos rutas.

Adicionalmente, las bandejas pueden ejecutar consultas adicionales para:

- matches de Pago Deuda;
- comisiones recurrentes por cada fila;
- badges de tabs;
- badges por empresa.

## Recomendacion

Reemplazar el refresco global por una invalidacion por alcance.

### Alcances

```text
BANDEJA       Filas, estado, seleccion y paginacion
BADGES        Conteos de tabs y empresas
KPI           Caja, salidas, gastos, ganancias y retenciones
MOVIMIENTOS   Movimientos de caja
CONFIGURACION Empresas, cuentas y reglas
```

Cada accion debe indicar explicitamente los alcances que necesita refrescar.

Ejemplo conceptual:

```ts
refresh({
    bandeja: true,
    badges: true,
    kpi: true,
    movimientos: true,
});
```

## Matriz De Acciones

| Accion | Bandeja | Badges | KPI | Movimientos | Configuracion |
| --- | --- | --- | --- | --- | --- |
| Cambiar tab | Si | No | No | Solo si corresponde | No |
| Cambiar empresa o cuenta | Si | Si | Si | Si | No |
| Cambiar filtro DNI, codigo o estado | Si | No | No | No | No |
| Seleccionar checkbox | No | No | No | No | No |
| Pagar operacion | Si | Si | Si | Si | No |
| Pago masivo | Si | Si | Si | Si | No |
| Derivar operacion | Si | Si | No | No | No |
| Reiniciar operacion | Si | Si | Si | Si | No |
| Eliminar operacion | Si | Si | Si | Si | No |
| Cambiar comunidad, DNI o cuenta | Si | Si | Si | No | No |
| Cambiar comision | Si | Si | Si | No | No |
| Marcar Fuera de Horario | Si | Si | Si | No | No |
| Registrar operacion manual | Si | Si | Si | Si | No |
| Procesar Excel | Si | Si | Si | Si | No |
| Registrar Ingreso o Salida | No | No | Si | Si | No |
| Editar saldo inicial | No | No | Si | Si | No |
| Cerrar o reabrir caja | Si | Si | Si | Si | No |
| Cambiar Empresa Principal | No | No | Si | No | Si |
| Cambiar configuracion de caja | No | No | Si | No | Si |

## Reglas De Actualizacion

### Operaciones Sobre Filas

Las acciones que modifican una fila deben actualizar primero el estado local:

- `replaceRow` para una fila modificada;
- `removeRow` para una fila que ya no pertenece a la bandeja;
- `insertRow` para una operacion nueva.

Despues se deben consultar solamente los KPI, badges o movimientos necesarios para confirmar los valores reales.

### Filtros Y Navegacion

Cambiar DNI, codigo, estado, tab o pagina debe consultar unicamente la bandeja activa. No debe recargar KPI, catalogos ni configuraciones.

### Cambio De Empresa O Cuenta

Debe actualizar el contexto completo de la empresa seleccionada:

- bandeja;
- badges;
- KPI;
- movimientos.

No debe volver a cargar catalogos estaticos ni reglas que no dependan de la empresa o cuenta.

### Acciones De Caja

Registrar ingresos, salidas, editar saldo inicial, cerrar o reabrir caja debe actualizar KPI y movimientos. La bandeja solo debe actualizarse cuando la accion pueda cambiar sus filas visibles.

## Refresco Al Recuperar El Foco

El modulo bancario no ejecuta refrescos al recuperar el foco ni al cambiar entre
pestanas del navegador. No se registran listeners de `focus` o
`visibilitychange` para `/operaciones/bancos`.

Al regresar al navegador se conserva el estado actual de:

- filas visibles;
- seleccion;
- paginacion;
- filtros;
- formularios y modales abiertos.

La informacion se actualiza cuando el usuario ejecuta una accion real o cambia
el contexto de empresa, cuenta, bandeja o filtro.

## Pendientes Tecnicos Para La Implementacion

1. Crear un coordinador de refresco por alcance.
2. Reemplazar los incrementos globales de `refreshKey` por invalidaciones especificas.
3. Centralizar el refresco de foco. **No aplica al modulo bancario: se desactivo el refresco automatico por foco.**
4. Evitar listeners independientes en cada hook de badges.
5. Conservar filas sin cambios mediante reconciliacion por `id`.
6. Evitar repetir consultas de matches cuando no cambien los IDs.
7. Evitar consultas de clientes por cada fila en cada refresco.
8. Cambiar la deduplicacion de filas basada en `findIndex` por `Map`.
9. Evaluar retirar `layout` de Motion para filas que no entran o salen.
10. Medir llamadas y tiempos en DevTools antes y despues.

## Criterios De Aceptacion

- Una accion no refresca componentes que no dependen de ella.
- La seleccion, pagina y filtros se conservan.
- Las filas nuevas aparecen con la animacion actual.
- Las filas modificadas se actualizan sin desmontar toda la tabla.
- Las filas eliminadas salen de forma controlada.
- Los KPI y badges coinciden con la informacion real.
- Volver al navegador no inicia llamadas ni muestra skeletons.
- No se modifica ningun RPC ni regla de negocio.

## Punto De Reanudacion

**Retomar desde aqui para implementar el coordinador por alcance y revisar las
acciones que aun requieran refrescos combinados.**

La primera implementacion de foco ya no aplica al modulo bancario. El siguiente
paso es sustituir el `refreshKey` global por un coordinador de alcances. Despues
se debe optimizar el N+1 de comisiones recurrentes y los matches.
