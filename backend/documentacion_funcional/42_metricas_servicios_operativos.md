# Métricas de servicios operativos

## Estado y objetivo

Documento funcional para ampliar `Métricas Bancarias` con tres vistas
operativas adicionales:

- `Pago Deuda` (`/operaciones/pagodeuda`)
- `POS` (`/operaciones/pos`)
- `Link Pago` (`/operaciones/linkpago`)

La vista actual de `/reportes/metricas-bancarias` seguirá representando
**Efectivización**. Las nuevas vistas pertenecen al mismo dominio de reportes,
pero no deben mezclar sus indicadores con Efectivización ni reutilizar sus
fórmulas financieras de caja.

El objetivo es que el cliente pueda responder, por cada servicio:

- cuántas operaciones se solicitaron y cuántas llegaron a completarse;
- qué sedes concentran el mayor volumen;
- cuánto dinero se solicitó, devolvió o transfirió;
- cuánto se cobró por comisiones y cuánto quedó como ganancia;
- qué porcentaje de operaciones tuvo éxito;
- cuántos clientes nuevos atendió el servicio;
- cómo evolucionaron las operaciones y los importes por día.

Este documento es una especificación para construcción. No modifica funciones,
tablas, cierres ni cálculos operativos existentes.

## Navegación propuesta

Los accesos deben ubicarse dentro del bloque superior **Vista analítica** como
una navegación contextual del reporte. No se recomienda usar el botón
`Descarga Reporte` para esto, porque la descarga es una acción y las métricas
son una selección de contexto.

La navegación debe mostrar cuatro botones de acceso directo:

1. `Efectivización`
2. `Pago Deuda`
3. `POS`
4. `Link Pago`

El botón activo utiliza el mismo tratamiento visual primario de Untitled UI y
los otros botones utilizan el tratamiento secundario. En pantallas pequeñas
pueden convertirse en un selector horizontal desplazable.

### URLs recomendadas

Se conserva la ruta actual como entrada de Efectivización y se agregan rutas
hijas para permitir enlaces directos, favoritos y permisos independientes:

```text
/reportes/metricas-bancarias                 -> Efectivización
/reportes/metricas-bancarias/pago-deuda      -> Pago Deuda
/reportes/metricas-bancarias/pos             -> POS
/reportes/metricas-bancarias/link-pago       -> Link Pago
```

La navegación debe compartir el encabezado, los filtros de fecha, estados de
carga/error y el sistema visual. El contenido analítico de cada ruta será
específico del servicio.

## Filtros

### Filtros comunes

- `Periodo`: conserva las opciones actuales del dashboard.
- `Desde`: calendario editable.
- `Hasta`: calendario editable.
- `Sede`: todas las sedes o una sede específica.
- `Estado`: todos, pendientes/procesadas, pagadas y eliminadas cuando aplique.
  Eliminadas se excluyen por defecto.
- `Limpiar`: restablece el periodo por defecto y los filtros del servicio.

El periodo por defecto seguirá siendo `Últimos 7 días`, salvo que el producto
apruebe un cambio general. Todas las fechas se interpretan en
`America/Lima` y las consultas deben usar límites completos del día:

```text
Desde: 00:00:00 -05:00
Hasta: 23:59:59.999 -05:00
```

### Filtros específicos

#### Pago Deuda

- `Banco solicitado`: usa `nombre_banco_cliente`.
- `Sede solicitante`.
- `Estado del flujo`.
- Opcional: `Usuario solicitante`, solo si el permiso del usuario permite
  analizar el detalle por colaborador.

#### POS

- `Entidad tarjeta`: usa `nombre_banco_cliente`.
- `Banco de transferencia`: usa `nombre_banco_cliente_transferencia`.
- `POS`: usa `nombre_pos`.
- `Sede solicitante`.
- `Estado`.
- Opcional: empresa/cuenta de salida, para analizar el destino financiero.

#### Link Pago

- `Entidad tarjeta`: usa `nombre_banco_cliente`.
- `Sede solicitante`.
- `Estado`.
- Opcional: empresa/cuenta de salida.

Los filtros específicos no deben llamarse simplemente `Banco` cuando el dato
representa una entidad de tarjeta o un banco destino. El nombre visible debe
explicar el significado del campo.

## Regla de sede

La sede analítica de una operación es la sede del usuario que realizó la
solicitud:

```text
operacion.id_usuario_solicitud
  -> tb_usuario.id_sucursal
  -> tb_sucursal.nombre
```

No se debe usar como sede principal el usuario gestor, el banco destino ni la
empresa de salida. Esos campos pueden utilizarse en desglose secundarios, pero
no reemplazan a la sede solicitante.

La visualización de sedes debe respetar el alcance del usuario logueado:

- Administrador/superadministrador: todas las sedes permitidas.
- Jefe de Tienda: únicamente su sede, según el alcance vigente del sistema.
- Otros perfiles: únicamente las sedes y rutas autorizadas por permisos.

La restricción debe aplicarse en la consulta backend. Ocultar opciones solo en
frontend no es suficiente para proteger la información.

## Pago Deuda

### Fuente operativa

La fuente principal es `f_get_tb_pago_deuda` con el contrato actual:

```json
{
  "p_fecha_desde": "2026-09-17T00:00:00-05:00",
  "p_fecha_hasta": "2026-09-30T23:59:59.999-05:00",
  "p_id_usuario_consulta": 1
}
```

La fecha de filtro de esta bandeja es `fecha_registro` de la solicitud. No se
debe cambiar silenciosamente a `fecha_deposito_cliente`, porque una solicitud
puede estar pendiente antes de que exista una atención bancaria.

La fila raíz representa la solicitud de Pago Deuda. Los datos relacionados de
devolución, banco o empresa pueden estar en `pd_retorno_*` o en la operación
hija asociada.

### KPIs de Pago Deuda

| KPI | Definición | Campo/base |
|---|---|---|
| Solicitudes | Cantidad de solicitudes raíz en el periodo | `COUNT(*)`, excluyendo eliminadas |
| Solicitudes pagadas | Solicitudes con estado `Pagado` | `nombre_estado` |
| Solicitudes pendientes | Solicitudes que aún no están `Pagado` | `nombre_estado` |
| Monto solicitado | Suma del monto solicitado por los clientes | `monto_deposito_cliente` |
| Monto devuelto/atendido | Importe efectivamente devuelto según el flujo actual | `monto_devuelto`, con la misma regla de `f_get_tb_pago_deuda_kpi` |
| Comisión | Comisión cobrada en solicitudes pagadas | `resultado_comision_servicio` |
| Paso 4 completado | Solicitudes con comisión registrada | `flag_comision_registrada = true` |
| Éxito del flujo | Solicitudes en Paso 4 / solicitudes del periodo | porcentaje |
| Ticket promedio | Monto solicitado / solicitudes | importe |
| Clientes nuevos | Clientes registrados en el periodo que tienen solicitud del servicio | `tb_cliente.fecha_registro` + `id_cliente` |

La métrica de comisión debe conservar la regla vigente: solo sumar
`resultado_comision_servicio` de solicitudes pagadas. El dashboard no debe
recalcular la comisión aplicando nuevamente porcentajes o reglas históricas.

### Sedes con más pagos de deuda

El ranking principal debe agrupar por sede solicitante y permitir cambiar la
medida visual:

- solicitudes;
- solicitudes pagadas;
- monto solicitado;
- comisión;
- porcentaje de éxito del Paso 4.

Orden inicial recomendado: monto solicitado descendente; como desempate,
solicitudes pagadas, comisión y nombre de sede.

### Sedes con mayor éxito

Este bloque debe comunicar claramente que mide la finalización del flujo de
Pago Deuda. Para esta ruta, “éxito” significa **Paso 4 completado**, no solo
que la solicitud haya sido creada ni que haya pasado a `Procesado`.

```text
tasa_exito = paso_4_completado / solicitudes_del_periodo * 100
```

Debe mostrar como mínimo:

- nombre de sede;
- solicitudes;
- Paso 4 completado;
- tasa de éxito;
- monto solicitado;
- comisión acumulada.

Si una sede no tiene solicitudes, no debe aparecer en el ranking ni dividir por
cero.

### Embudo de estados

Se recomienda un embudo o barras por etapas:

1. Solicitud creada.
2. Procesada.
3. Devolución/match confirmado.
4. Comisión registrada — Paso 4.

Los conteos deben salir de la misma población de solicitudes del periodo y no
de consultas independientes que puedan mezclar rangos o duplicar operaciones.

## POS

### Fuente operativa

La fuente es `f_get_tb_operacion_asistida_bandeja` con `p_ruta = 'pos'`:

```json
{
  "p_ruta": "pos",
  "p_fecha_registro_desde": "2026-09-17T00:00:00-05:00",
  "p_fecha_registro_hasta": "2026-09-30T23:59:59.999-05:00",
  "p_id_usuario_consulta": 1
}
```

POS es una ruta asistida. No tiene caja operativa propia ni debe mezclarse con
los KPI de caja bancaria de Efectivización.

### KPIs de POS

| KPI | Definición | Campo/base |
|---|---|---|
| Operaciones | Solicitudes POS no eliminadas del periodo | `COUNT(*)` |
| Operaciones pagadas | Filas con estado `Pagado` | `nombre_estado` |
| Tasa de pago | Pagadas / operaciones | porcentaje |
| Monto procesado | Suma del depósito de cliente | `monto_deposito_cliente` |
| Comisiones | Comisión cobrada en pagadas | `resultado_comision_servicio` |
| Gastos bancarios | Gastos de banco de ingreso y salida en pagadas | `resultado_comision_banco_ingreso + resultado_comision_banco_salida` |
| Ganancia | Comisiones menos gastos bancarios | cálculo sobre las columnas anteriores |
| Salidas | Transferencia realizada en pagadas | `monto_transferencia_cliente` |
| Clientes nuevos | Clientes registrados en el periodo con operación POS | `tb_cliente.fecha_registro` + `id_cliente` |
| Ticket promedio | Monto procesado / operaciones | importe |

Las métricas financieras de POS solo consideran operaciones `Pagado`, siguiendo
la regla de `f_get_tb_operacion_asistida_kpi`. Las operaciones pendientes sí se
mantienen en conteos operativos y en el embudo.

### Desgloses de POS

- Sedes con más operaciones.
- Sedes con mayor monto procesado.
- Sedes con mayor tasa de pago.
- Entidades de tarjeta más utilizadas (`nombre_banco_cliente`).
- Bancos de transferencia más utilizados
  (`nombre_banco_cliente_transferencia`).
- POS más utilizados (`nombre_pos`).
- Empresas/cuentas destino con mayor salida.

## Link Pago

### Fuente operativa

La fuente es `f_get_tb_operacion_asistida_bandeja` con `p_ruta = 'linkpago'`:

```json
{
  "p_ruta": "linkpago",
  "p_fecha_registro_desde": "2026-09-17T00:00:00-05:00",
  "p_fecha_registro_hasta": "2026-09-30T23:59:59.999-05:00",
  "p_id_usuario_consulta": 1
}
```

Link Pago tampoco tiene caja propia. Su vista debe explicar la actividad y la
rentabilidad de la operación asistida sin presentarla como una caja bancaria.

### KPIs de Link Pago

Link Pago utiliza los mismos indicadores base de POS, adaptados a sus campos:

- operaciones;
- operaciones pagadas;
- tasa de pago;
- monto procesado;
- comisiones;
- gastos bancarios;
- ganancia;
- salidas/transferencias;
- clientes nuevos;
- ticket promedio.

No se debe mostrar `POS` como dimensión de Link Pago porque esta ruta no tiene
`nombre_pos`. El desglose principal será por sede y entidad de tarjeta.

### Desgloses de Link Pago

- Sedes con más operaciones.
- Sedes con mayor monto procesado.
- Sedes con mayor tasa de pago.
- Entidades de tarjeta más utilizadas.
- Empresas/cuentas destino con mayor salida.
- Evolución diaria de operaciones, comisiones y ganancia.

## Clientes nuevos

En las tres vistas, `Clientes nuevos` significa:

1. El `id_cliente` aparece en la operación del servicio seleccionado.
2. El cliente existe en `tb_cliente`.
3. `tb_cliente.fecha_registro` pertenece al periodo seleccionado.
4. Se cuenta una sola vez cada `id_cliente`, aunque tenga varias operaciones.

La fecha de registro del cliente no debe inferirse desde `fecha_registro` de la
operación. La fecha de la operación solo define la población operativa
consultada; la condición de “nuevo” la define `tb_cliente.fecha_registro`.

Si el cliente tiene varias operaciones o aparece en más de una sede, el KPI
global lo cuenta una vez. Para el ranking por sede, se atribuye a la sede de la
operación seleccionada y debe documentarse si un mismo cliente aparece en más
de una sede.

## Gráficos comunes

Cada vista debe tener una composición adaptada a su servicio:

### Resumen superior

Tarjetas KPI con valor, unidad, periodo y una breve explicación. No mezclar
moneda con conteo en una misma tarjeta.

### Evolución diaria

Gráfico de barras o líneas con fechas completas del rango, incluyendo días en
cero. Debe permitir visualizar subidas y bajadas:

- Pago Deuda: solicitudes, Paso 4 y comisión.
- POS/Link Pago: operaciones, pagadas, comisiones y ganancia.

### Ranking de sedes

Barras horizontales ordenadas de mayor a menor según la medida activa. Debe
mostrar cantidad, importe y porcentaje cuando corresponda.

### Distribución

Gráfico de dona o barras para una dimensión propia del servicio:

- Pago Deuda: banco solicitado, estado o sede.
- POS: entidad tarjeta, banco destino o POS.
- Link Pago: entidad tarjeta, estado o sede.

El gráfico debe usar una sola población y no mezclar operaciones pendientes con
montos financieros de operaciones pagadas sin indicarlo.

### Detalle consolidado

Tabla por sede y, cuando aplique, por banco/entidad, empresa y cuenta. Debe
priorizar filas con actividad y ordenar el importe principal de mayor a menor.
Las filas completamente en cero no se muestran si no aportan información al
periodo.

## Evidencia revisada

El archivo `backend/backend_implementacion/07.respuesta_consultas_selects.txt`
contiene respuestas de prueba para el mismo intervalo:

| Consulta | Filas observadas | Estados observados |
|---|---:|---|
| `f_get_tb_pago_deuda` | 41 | `Procesado`, `Pagado` |
| `f_get_tb_operacion_asistida_bandeja` con `pos` | 9 | `Pagado` |
| `f_get_tb_operacion_asistida_bandeja` con `linkpago` | 10 | `Pagado` |

Los campos observados permiten construir los indicadores sin crear una fuente
paralela: `id_cliente`, `id_usuario_solicitud`, fechas, estado, montos,
comisiones, gastos, empresa/cuenta, banco, ruta y flags del flujo.

Los números de esa respuesta son evidencia de estructura y no valores fijos de
la pantalla. La pantalla debe consultar el periodo seleccionado.

## Reglas de consistencia

- No mezclar Efectivización, Pago Deuda, POS y Link Pago en un mismo total.
- No contar dos veces una operación por sus filas relacionadas.
- No usar `tb_operacion_caja` para POS o Link Pago, porque no tienen caja propia.
- No sumar comisiones de operaciones pendientes como si fueran ingresos.
- No llamar “ganancia” a la comisión bruta: descontar los gastos bancarios.
- No utilizar `nombre_usuario_gestor` como sede solicitante.
- Excluir `id_estado = 10`/`Eliminado` por defecto.
- Mantener `America/Lima` en filtros, series y etiquetas.
- Mostrar estado vacío cuando no existan operaciones, sin fabricar ceros
  históricos.

## Criterios de aceptación funcional

- El usuario puede entrar directamente a las cuatro vistas desde `Vista
  analítica`.
- El botón activo identifica el servicio consultado.
- Cada vista mantiene el mismo periodo y calendario, pero presenta KPIs propios.
- Pago Deuda muestra sedes por solicitud, Paso 4 y tasa de éxito.
- POS y Link Pago muestran comisión, gastos, ganancia, salidas y tasa de pago.
- `Clientes nuevos` usa `tb_cliente.fecha_registro` y cuenta clientes únicos.
- Las series muestran cada día del rango, incluidos días sin operaciones.
- Las sedes y datos mostrados respetan el alcance del usuario logueado.
- Los números de cada tarjeta coinciden con su detalle y con la función/fuente
  documentada.
- La consulta del reporte no modifica operaciones, cajas, cierres ni estados.

## Fuera de alcance

- Modificar las funciones operativas actuales.
- Crear pagos, transferencias, cierres o movimientos desde el dashboard.
- Mezclar estas vistas con la contabilidad de Efectivización.
- Crear indicadores de productividad laboral sin una definición aprobada.
- Tomar los valores de prueba de `07.respuesta_consultas_selects.txt` como datos
  permanentes.
