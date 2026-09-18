# Especificación técnica — métricas de servicios operativos

## Propósito

Este documento traduce
`42_metricas_servicios_operativos.md` a un plan de implementación para otro
agente. El alcance cubre backend analítico y frontend de consulta para Pago
Deuda, POS y Link Pago.

La implementación debe ser aislada. No se deben cambiar las funciones cerradas
que alimentan las bandejas ni `13.dashboard_metricas_bancarias.sql`.

## Estrategia de backend

Crear un nuevo archivo, sugerido:

```text
backend/backend_implementacion/15.dashboard_metricas_servicios_operativos.sql
```

El archivo debe contener funciones nuevas de solo lectura. No se debe copiar la
lógica como un cambio destructivo en `f_get_tb_pago_deuda` ni en
`f_get_tb_operacion_asistida_bandeja`.

Las funciones existentes son fuentes de contrato y de campos, pero no deben
invocarse fila por fila desde una función analítica. La consulta analítica debe
leer `tb_operacion_proceso` y sus tablas de catálogo mediante CTEs, aplicar el
mismo alcance de permisos y devolver agregados.

## Funciones analíticas propuestas

Los nombres pueden ajustarse antes de implementar, pero deben conservar un
prefijo separado del dashboard bancario actual:

```text
f_get_dashboard_metricas_servicios_resumen
f_get_dashboard_metricas_servicios_serie
f_get_dashboard_metricas_servicios_sedes
f_get_dashboard_metricas_servicios_distribucion
f_get_dashboard_metricas_servicios_desglose
```

### Parámetros comunes

```text
p_servicio                  character varying -- pago-deuda | pos | linkpago
p_fecha_desde               timestamp with time zone
p_fecha_hasta               timestamp with time zone
p_id_usuario_consulta       bigint
p_id_sucursal               bigint DEFAULT NULL
p_id_estado                 bigint DEFAULT NULL
p_id_banco_cliente          bigint DEFAULT NULL
p_id_banco_destino          bigint DEFAULT NULL
p_id_pos                    bigint DEFAULT NULL
p_id_sede                   bigint DEFAULT NULL
```

Los parámetros que no aplican a una ruta deben ignorarse o validarse, pero no
deben producir un resultado ambiguo. Por ejemplo, `p_id_pos` solo aplica a
`pos`.

Para evitar inconsistencias entre tarjetas y gráficos, todas las funciones
deben compartir el mismo CTE base o la misma definición de población:

```text
fecha + servicio + estado + cliente + usuario solicitante + sede
+ montos + comisiones + empresa/cuenta + banco/destino
```

## Poblaciones SQL

### Pago Deuda

Población base:

```sql
tb_operacion_proceso op
WHERE op.id_operacion_padre IS NULL
  AND UPPER(COALESCE(op.tipo_flujo_pago_deuda, '')) = 'SOLICITUD'
  AND op.fecha_registro >= p_fecha_desde
  AND op.fecha_registro <= p_fecha_hasta
  AND COALESCE(op.id_estado, 0) <> 10
```

La fila raíz evita contar como solicitud la operación bancaria hija, el retorno
o una operación relacionada.

Campos normalizados mínimos:

```text
id_operacion
id_cliente
id_usuario_solicitud
id_sucursal_solicitud
nombre_sucursal_solicitud
fecha_operacion = fecha_registro
id_estado / nombre_estado
monto_solicitado = monto_deposito_cliente
monto_devuelto
resultado_comision_servicio
flag_comision_registrada
id_banco_cliente / nombre_banco_cliente
id_operacion_match
pd_retorno_monto_devolucion
```

La sede se obtiene mediante:

```sql
JOIN public.tb_usuario us ON us.id = op.id_usuario_solicitud
LEFT JOIN public.tb_sucursal s ON s.id = us.id_sucursal
```

El cálculo de `monto_devuelto` debe conservar la regla actual de
`f_get_tb_pago_deuda_kpi`:

```sql
CASE
  WHEN op.id_operacion_match IS NOT NULL
    OR COALESCE(op.monto_devuelto, 0) >= COALESCE(op.monto_deposito_cliente, 0)
  THEN COALESCE(op.monto_deposito_cliente, 0)
  ELSE COALESCE(op.monto_devuelto, 0)
END
```

### POS y Link Pago

Población base:

```sql
tb_operacion_proceso op
WHERE LOWER(COALESCE(op.ruta_origen, '')) = p_servicio
  AND COALESCE(op.id_estado, 0) <> 10
  AND op.fecha_registro >= p_fecha_desde
  AND op.fecha_registro <= p_fecha_hasta
```

Para POS, `p_servicio = 'pos'`; para Link Pago, `p_servicio = 'linkpago'`.

Campos normalizados mínimos:

```text
id_operacion
id_cliente
id_usuario_solicitud
id_sucursal_solicitud
nombre_sucursal_solicitud
fecha_operacion = fecha_registro
id_estado / nombre_estado
monto_procesado = monto_deposito_cliente
monto_salida = monto_transferencia_cliente
comision = resultado_comision_servicio
gasto_banco_ingreso = resultado_comision_banco_ingreso
gasto_banco_salida = resultado_comision_banco_salida
ganancia = comision - gasto_banco_ingreso - gasto_banco_salida
entidad_tarjeta = nombre_banco_cliente
banco_destino = nombre_banco_cliente_transferencia
pos = nombre_pos
empresa_salida / cuenta_salida
```

La fórmula debe coincidir con `f_get_tb_operacion_asistida_kpi` y las métricas
financieras solo deben sumar operaciones `Pagado`:

```sql
comisiones = SUM(comision) FILTER (WHERE nombre_estado = 'PAGADO')
gastos = SUM(gasto_banco_ingreso + gasto_banco_salida) FILTER (WHERE nombre_estado = 'PAGADO')
ganancia = SUM(comision - gasto_banco_ingreso - gasto_banco_salida) FILTER (WHERE nombre_estado = 'PAGADO')
salidas = SUM(monto_salida) FILTER (WHERE nombre_estado = 'PAGADO')
```

Para `monto_salida`, usar la misma semántica vigente: el valor de transferencia
real de la fila pagada, sin reemplazarlo por un importe pendiente.

## Alcance de seguridad

El CTE de seguridad debe resolver al usuario consultante una sola vez:

```text
id_usuario_consulta
id_sucursal_consulta
es_administrador
es_super_admin
es_jefe_tienda
```

La función debe aplicar el alcance antes de agregar. Nunca se debe agregar todo
el universo y filtrar la sede en el frontend.

Regla mínima:

- administrador/superadministrador: universo permitido por el reporte;
- jefe de tienda: operaciones solicitadas por usuarios de su sede, según la
  regla vigente de cada bandeja;
- demás perfiles: solo operaciones que el permiso de la ruta les permita ver.

La función debe ser `SECURITY DEFINER`, `STABLE` y fijar un `search_path`
seguro conforme al patrón del backend vigente. La autorización de ejecución de
las nuevas funciones debe revisarse junto con el permiso del menú de métricas.

## Contrato de salida

Se recomienda devolver `jsonb` para mantener compatibilidad con el patrón RPC
actual y permitir agregar campos sin romper el frontend.

### Resumen

```json
{
  "servicio": "pago-deuda",
  "periodo": { "desde": "2026-09-17", "hasta": "2026-09-30" },
  "actual": {
    "operaciones": 41,
    "pagadas": 33,
    "pendientes": 8,
    "sin_empresa_comision": 3,
    "montoProcesado": 600473,
    "montoAtendido": 600473,
    "comisiones": 8572.89,
    "ganancias": 8572.89,
    "clientesNuevos": 0,
    "tasaExito": 80.49,
    "ticketPromedio": 14645.68
  }
}
```

Los números del ejemplo corresponden a la forma del contrato. No deben
sembrarse como datos dummy en producción.

### Serie diaria

```json
[
  {
    "periodo": "2026-09-17",
    "operaciones": 12,
    "pagadas": 9,
    "clientesNuevos": 2,
    "montoProcesado": 45000,
    "comisiones": 620,
    "gastos": 120,
    "ganancias": 500,
    "salidas": 43800
  }
]
```

La función debe generar todos los días del rango mediante una serie de fechas,
incluyendo días sin datos con ceros. Así la gráfica no une dos fechas lejanas
como si fueran consecutivas.

### Ranking de sedes

```json
[
  {
    "idSede": 1,
    "sede": "Sede Lince",
    "operaciones": 20,
    "pagadas": 18,
    "montoProcesado": 125000,
    "comisiones": 2100,
    "ganancias": 1900,
    "tasaExito": 90
  }
]
```

### Desglose

Debe incluir una fila por la dimensión seleccionada, como mínimo:

```text
servicio
sede
estado
operaciones
pagadas
clientes_nuevos
monto_procesado
monto_atendido_o_salidas
comisiones
gastos
ganancias
tasa_exito
```

El frontend ordena el desglose al seleccionar cualquier cabecera. El orden se
aplica sobre la colección completa ya filtrada y alterna entre ascendente y
descendente; no requiere una nueva consulta RPC.

## Funciones actuales y regla de reutilización

### Pago Deuda

Se toman como fuente de campos y semántica:

- `f_get_tb_pago_deuda`;
- `f_get_tb_pago_deuda_kpi`;
- `f_get_tb_pago_deuda_match` y sus funciones de match solo para interpretar
  relación, no para duplicar operaciones.

### POS y Link Pago

Se toman como fuente de campos y semántica:

- `f_get_tb_operacion_asistida_bandeja`;
- `f_get_tb_operacion_asistida_kpi`;
- `tb_operacion_proceso` y los catálogos de empresa/cuenta/banco.

Las funciones nuevas deben documentar expresamente qué cálculo se conserva y
qué agrupación nueva se agrega. No deben modificar el contrato de estas RPC.

## Integración frontend

Se recomienda mantener la página actual como shell y separar el contenido por
servicio:

```text
src/features/reportes/metricas-bancarias/
  metricas-bancarias-page.tsx          -> shell y navegación
  metricas-bancarias.service.ts        -> Efectivización actual
  servicios/
    metricas-servicio-page.tsx         -> composición por servicio
    metricas-servicio.service.ts       -> RPC analíticas nuevas
    metricas-servicio.types.ts         -> contratos
    pago-deuda-metricas.tsx            -> paneles de Pago Deuda
    asistida-metricas.tsx              -> paneles POS/Link Pago
```

No se debe convertir la página completa en un `if` grande con métricas de las
tres rutas. El shell solo debe resolver la ruta activa, filtros comunes y
estado de carga; cada servicio decide sus paneles.

La navegación de botones debe usar React Router y conservar la URL al cambiar
de servicio. El filtro de servicio no debe enviarse como un valor ambiguo a la
función bancaria actual.

## Pruebas de backend

Crear un archivo de pruebas separado, sugerido:

```text
backend/backend_pruebas/15.validar_metricas_servicios_operativos.sql
```

Casos mínimos:

1. Pago Deuda con solicitudes `Procesado` y `Pagado`.
2. Pago Deuda con solicitudes pendientes y pagadas.
3. Pago Deuda con devolución parcial y total.
4. Dos solicitudes del mismo cliente: un solo cliente nuevo.
5. Dos usuarios de sedes distintas: ranking separado.
6. Jefe de Tienda consultando fuera de su sede.
7. POS pagado con banco destino y empresa/cuenta de salida.
8. POS pendiente: cuenta en operaciones, no en comisiones financieras.
9. Link Pago con entidad tarjeta y sin `nombre_pos`.
10. Operaciones eliminadas excluidas.
11. Rango de un solo día y rango sin operaciones.
12. Día en límite `00:00:00` y `23:59:59.999` de Lima.
13. Conciliación de resumen contra desglose y serie.

## Pruebas frontend

- Cada botón de navegación abre su URL directa.
- El botón activo corresponde a la ruta y no conserva KPIs del servicio anterior.
- Cambiar Desde/Hasta actualiza todas las tarjetas, gráficas y tablas.
- Cambiar sede actualiza rankings y detalle sin filtrar solo visualmente.
- POS muestra entidad tarjeta, banco destino y POS sin confundir sus nombres.
- Link Pago no muestra un selector de POS.
- Pago Deuda separa solicitudes pendientes y solicitudes sin empresa de comisión.
- POS y Link Pago separan operaciones totales, pagadas y pendientes; el total
  no repite las pendientes como texto secundario.
- POS y Link Pago muestran `Monto depositado frente a transferencias`, sedes
  ordenadas por ganancia y un comparativo de monto depositado por POS o entidad.
- El comparativo de depósitos se agrega por `fecha_operacion` y categoría. La
  distribución expone `pos-diario` para POS y `entidad-tarjeta-diaria` para
  Link Pago, conservando días sin movimiento como cero en el frontend.
- Los días sin operaciones aparecen como cero.
- Loading, error y estado vacío son independientes por consulta.
- Los colores de leyenda coinciden con cada serie.
- El diseño responde en escritorio y móvil sin crear scroll horizontal en los
  filtros.

## Despliegue y trazabilidad

1. Aplicar el nuevo SQL analítico después de los dominios base.
2. Verificar las firmas reales de las funciones con `pg_get_functiondef`.
3. Ejecutar el script de pruebas con un usuario administrador y un Jefe de
   Tienda.
4. Validar que no se modificaron las funciones existentes de Pago Deuda, POS,
   Link Pago ni Efectivización.
5. Conectar el frontend únicamente después de validar el contrato JSON.
6. Ejecutar `npm run build` y pruebas TypeScript.

El archivo SQL nuevo debe incluir al final su bloque de generación de
`DROP FUNCTION IF EXISTS` únicamente para las funciones nuevas afectadas.

## Criterio de terminado técnico

- Las cuatro URLs cargan el servicio correcto.
- Las tres nuevas vistas consultan backend real, sin datos dummy.
- Cada tarjeta tiene una única fuente y fórmula documentada.
- Resumen, serie, ranking y desglose concilian.
- La sede se resuelve por `id_usuario_solicitud` y respeta permisos.
- Pago Deuda calcula la tasa de éxito con solicitudes pagadas sobre el total.
- POS y Link Pago mantienen la regla de sumar finanzas solo para `Pagado`.
- No se cambian funciones operativas cerradas.
- SQL, tipos frontend y pruebas quedan documentados en sus rutas respectivas.
