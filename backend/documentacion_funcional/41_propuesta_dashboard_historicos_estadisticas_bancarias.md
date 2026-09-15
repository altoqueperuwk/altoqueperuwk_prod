# Propuesta funcional — Dashboard Histórico de Métricas Bancarias

## Estado del documento

Propuesta funcional y técnica inicial para construir una nueva pantalla de
históricos y estadísticas bancarias. Parte del levantamiento visual descrito en
`40_metricas_kpi_operaciones_bancarias.md` y lo convierte en una solución
presentable al cliente y utilizable como base de implementación.

Este documento no modifica las fórmulas vigentes de operación, caja, cierre o
reportes. La nueva pantalla será exclusivamente de consulta.

### Demo frontend disponible

Al 14/09/2026 existe una primera demostración navegable en:

```text
/reportes/metricas-bancarias
```

La demo utiliza datos locales simulados y no ejecuta consultas a Supabase. Su
objetivo es validar con el cliente la distribución visual, los filtros, KPI,
gráficos, consolidado y tratamiento especial de SafetyPay antes de implementar
el contrato analítico del backend.

### Backend analítico disponible para despliegue

El archivo `backend/backend_implementacion/13.dashboard_metricas_bancarias.sql`
implementa funciones nuevas y aisladas para resumen, serie temporal y desglose.
No modifica las funciones KPI operativas existentes. La demo continuará usando
datos simulados hasta que se implemente su servicio frontend y se despliegue el
SQL en Supabase.

## Propuesta ejecutiva

Crear una pantalla denominada **Métricas Bancarias**, ubicada inicialmente en:

```text
/reportes/metricas-bancarias
```

La pantalla permitirá responder rápidamente:

- cuánto se recaudó, transfirió, gastó y ganó en un periodo;
- cuántas operaciones fueron registradas, pagadas y siguen pendientes;
- cómo evolucionan esos valores por día, semana o mes;
- qué bancos, empresas y cuentas concentran el mayor volumen;
- cuál es el saldo al corte y cuánto queda pendiente de transferir;
- cómo se compara el periodo seleccionado con el periodo anterior equivalente;
- a qué empresas se derivaron los fondos de SafetyPay.

La propuesta combina los KPI actuales con indicadores analíticos nuevos. Los
KPI financieros existentes conservan sus fórmulas; los nuevos indicadores se
calculan como agregaciones de esos mismos hechos operativos.

## Usuarios objetivo y acceso

La audiencia principal será:

- Administrador: visión de todas las rutas, empresas y cuentas autorizadas.
- Área de Pagos: visión de las rutas bancarias que tenga asignadas.
- Jefe de Tienda: acceso solo si recibe permiso explícito y limitado a su
  alcance operativo.
- Otros roles: acceso únicamente mediante el sistema vigente de permisos.

La autorización debe aplicarse en backend. Ocultar bancos o filtros en frontend
no será suficiente para proteger información financiera.

## Estructura propuesta de la pantalla

```text
Métricas Bancarias                                      [Descargar]

[Periodo] [Comparar con] [Banco] [Empresa] [Cuenta] [Familia] [Limpiar]

Resumen del periodo
[Recaudación] [Salidas] [Ganancias] [Gastos]
[Operaciones] [Pagadas] [% pagadas] [Ticket promedio]

Situación al corte
[Saldo Banco] [Pendiente Transferencia] [Ingresos de Movimientos]

Evolución financiera
[Gráfico: Recaudación vs. Salidas por día/semana/mes]

Rentabilidad y operación
[Gráfico: Ganancias vs. Gastos] [Gráfico: operaciones por estado]

Comparativo
[Ranking por banco/empresa/cuenta] [Distribución por familia]

Detalle consolidado
[Tabla por banco, empresa y cuenta]

SafetyPay, cuando corresponda
[Empresas derivadas] [Transferencias realizadas]
```

En pantallas pequeñas los bloques se apilan. En escritorio, las tarjetas se
presentan en una cuadrícula de cuatro columnas y los gráficos en dos columnas.

## Filtros globales

Todos los componentes deben responder a los mismos filtros:

| Filtro | Comportamiento propuesto |
|---|---|
| Periodo | Hoy, ayer, esta semana, semana anterior, este mes, mes anterior, últimos 30 días, últimos 6 meses y rango personalizado. |
| Comparación | Sin comparación o periodo anterior equivalente. |
| Agrupación | Día, semana o mes; se sugiere automáticamente según la amplitud del rango. |
| Banco/ruta | Todos, BCP, BBVA, Scotiabank, BanBif, Interbank y SafetyPay, según permisos. |
| Empresa | Todas o una empresa disponible para la ruta seleccionada. |
| Cuenta | Todas o una cuenta de la empresa y banco seleccionados. |
| Familia | Todas, Efectivización, Pago Deuda, Movimientos, Directo, POS y Link Pago cuando aplique. |
| Estado | Todos, Pendiente y Pagado. Eliminado queda excluido por defecto. |

El periodo predeterminado será **este mes hasta hoy**, comparado con el mismo
número de días del mes anterior. Todas las fechas se interpretan en
`America/Lima`.

Si el usuario selecciona un único día con cierre, los datos financieros deben
coincidir con el cierre histórico de ese día. Si el día no tiene cierre, se
mostrará como periodo operativo sin cerrar.

## Nivel 1 — KPI principales para entregar al cliente

### Flujo financiero

| KPI | Unidad | Definición funcional | Comparación |
|---|---:|---|---|
| Caja Recaudación | S/ | Recaudación del periodo según la lógica KPI bancaria vigente. | Diferencia absoluta y porcentual. |
| Salidas | S/ | Transferencias y salidas reales que impactaron la caja en el periodo. | Diferencia absoluta y porcentual. |
| Ganancias | S/ | Ganancia reconocida según la fórmula vigente de cada ruta y cuenta. | Diferencia absoluta y porcentual. |
| Gastos Operacionales | S/ | Gastos/comisiones operacionales reconocidos en el periodo. | Diferencia absoluta y porcentual. |
| Ingresos de Movimientos | S/ | Ingresos registrados en Movimientos, separados de la recaudación comercial. | Diferencia absoluta y porcentual. |

Las personalizaciones de ganancia y retención de Scotiabank, BanBif y las
combinaciones empresa/cuenta vigentes deben conservarse. Las retenciones no se
convertirán artificialmente en recaudación ni ingreso.

### Volumen operativo

| KPI | Unidad | Definición funcional |
|---|---:|---|
| Operaciones registradas | Cantidad | Operaciones no eliminadas cuyo evento de registro o depósito pertenece al periodo. |
| Operaciones pagadas | Cantidad | Operaciones cuyo pago efectivo pertenece al periodo. |
| Operaciones pendientes | Cantidad | Operaciones abiertas al final del periodo consultado. |
| Tasa de pago | % | `operaciones pagadas / operaciones consideradas × 100`. El denominador se muestra en la ayuda del KPI. |
| Ticket promedio | S/ | Monto de depósito de las operaciones consideradas dividido entre su cantidad. |

Para evitar interpretaciones incorrectas, las tarjetas de cantidad no deben
mezclarse visualmente con importes monetarios.

### Situación al corte

| KPI | Unidad | Definición funcional |
|---|---:|---|
| Saldo Banco | S/ | Último saldo válido de cada cuenta al final del periodo seleccionado. |
| Pendiente Transferencia | S/ | Monto pendiente al corte final del periodo, no una suma diaria. |
| Caja Inicial | S/ | Saldo inicial del primer cierre o caja incluida en el periodo; visible en el detalle, no como tarjeta principal del consolidado. |

`Caja Actual` no se mostrará. El producto vigente ya utiliza `Saldo Banco` como
indicador de posición actual.

Cuando se consulten varios bancos/cuentas, `Saldo Banco` podrá sumarse únicamente
una vez por cuenta/caja seleccionada. No debe sumarse una instantánea por cada
día del rango.

## Nivel 2 — Estadísticas y gráficos recomendados

### 1. Recaudación frente a salidas

Gráfico principal de barras agrupadas:

- eje X: día, semana o mes;
- serie 1: Caja Recaudación;
- serie 2: Salidas;
- tooltip: periodo, importe y variación;
- interacción: al seleccionar un punto se filtra la tabla de detalle.

Este gráfico permite identificar periodos en los que la recaudación creció sin
que las transferencias se ejecutaran al mismo ritmo.

### 2. Ganancias frente a gastos operacionales

Gráfico de líneas:

- línea de Ganancias;
- línea de Gastos Operacionales;
- opción para ver el margen `Ganancias / Caja Recaudación × 100` sin alterar
  los KPI contables originales.

`Ganancias` ya descuenta las comisiones bancarias de ingreso y salida. Por ese
motivo, no se deben restar nuevamente los Gastos Operacionales para construir
otro resultado, porque produciría una doble deducción.

### 3. Operaciones por estado

Gráfico de columnas apiladas con operaciones Pagadas y Pendientes. Eliminadas y
retornos se excluyen del total principal, pero pueden habilitarse en un filtro de
auditoría.

### 4. Distribución por familia

Gráfico de dona por cantidad o monto:

- Efectivización;
- Pago Deuda;
- Movimientos;
- Directo;
- POS y Link Pago cuando se incluyan rutas asistidas.

El usuario podrá alternar entre `Cantidad de operaciones` y `Monto`. Cada
operación debe pertenecer a una sola categoría del gráfico para evitar doble
conteo. `DIRECTO_CAJA` se presentará como `Directo` y no volverá a contarse como
Efectivización.

### 5. Comparativo de bancos, empresas y cuentas

Ranking horizontal configurable por:

- Caja Recaudación;
- Salidas;
- Ganancias;
- cantidad de operaciones;
- Pendiente Transferencia al corte.

La etiqueta visible será `Banco · Empresa · Cuenta`. Se mostrarán inicialmente
los diez primeros y una opción para ver el consolidado completo.

### 6. Antigüedad de pendientes

Indicador operativo recomendado para una segunda entrega:

- mismo día;
- 1 día;
- 2 a 3 días;
- 4 días o más.

Se calculará desde la fecha de depósito hasta la fecha final del filtro. Este
gráfico ayuda a detectar acumulación y no debe usar la fecha actual cuando se
consulta un periodo histórico.

## Tabla consolidada

La parte inferior mostrará una fila por Banco, Empresa y Cuenta:

| Columna | Tipo |
|---|---|
| Banco | Texto |
| Empresa | Texto |
| Cuenta | Texto |
| Operaciones | Cantidad |
| Pagadas | Cantidad |
| Pendientes | Cantidad |
| Tasa de pago | Porcentaje |
| Caja Recaudación | Moneda |
| Salidas | Moneda |
| Gastos Operacionales | Moneda |
| Ganancias | Moneda |
| Pendiente Transferencia | Moneda al corte |
| Saldo Banco | Moneda al corte |

La tabla permitirá ordenar, buscar por empresa/cuenta y abrir un detalle de
operaciones. La fila de totales debe distinguir qué columnas son sumables y qué
columnas requieren cálculo:

- los importes de flujo se suman;
- la tasa de pago se recalcula con los totales, no se promedia;
- los saldos se toman una vez por cuenta al corte;
- el ticket promedio se recalcula con monto y cantidad consolidados.

## Tratamiento especial de SafetyPay

Al seleccionar SafetyPay se mantendrán sus indicadores especializados:

- Caja Recaudación;
- Ganancias;
- Salidas;
- Gastos Operacionales;
- Pendiente Transferencia;
- Total Transferencia;
- Empresas Derivadas.

Además, el dashboard mostrará:

- evolución del monto transferido;
- cantidad de transferencias por periodo;
- distribución por empresa/cuenta de destino;
- ticket promedio transferido;
- tabla `Empresa destino | Cuenta | Operaciones | Transferencia`.

`Total Transferencia` es una cantidad de operaciones, no un importe. Las
transferencias reales de derivados enviados deben conservar el tratamiento
especial ya implementado para SafetyPay.

## Indicadores analíticos opcionales

Estos KPI aportan valor, pero se recomienda incorporarlos después de validar la
primera versión con el cliente:

| Indicador | Fórmula o finalidad |
|---|---|
| Margen de ganancia | `Ganancias / Caja Recaudación × 100`, cuando la recaudación sea mayor que cero. |
| Tiempo promedio de atención | Promedio entre depósito y pago para operaciones con ambas fechas válidas. |
| Cumplimiento el mismo día | Porcentaje de operaciones pagadas en la misma fecha comercial del depósito. |
| Variación contra periodo anterior | Cambio absoluto y porcentual de cada medida de flujo o conteo. |
| Concentración por empresa | Participación de cada empresa en la recaudación o salidas del periodo. |
| Días sin cierre | Días/cajas operativas del rango que no poseen cierre, visible solo como control administrativo. |

Si el valor del periodo anterior es cero, la variación porcentual se mostrará
como `Sin base de comparación`, nunca como infinito.

## Reglas de fecha e histórico

Las métricas no pueden usar una sola fecha para todos los eventos:

| Métrica o evento | Fecha de atribución |
|---|---|
| Operación registrada / monto depositado | `fecha_deposito_cliente`; usar `fecha_registro` solo como respaldo documentado. |
| Operación pagada / salida comercial | `fecha_pagado` o el movimiento real asociado. |
| Movimiento de caja | `tb_operacion_caja.fecha_registro`. |
| Información cerrada | Cierre asociado mediante los campos vigentes de cierre de ingreso/salida. |
| Saldo Banco | Último snapshot o saldo válido al final del periodo. |
| Pendiente Transferencia | Estado de la obligación al final del periodo. |

Reglas obligatorias:

- convertir fechas a `America/Lima` antes de agrupar por día;
- conservar la atribución de una operación al cierre histórico correspondiente;
- no mover una salida al día del depósito cuando fue pagada posteriormente;
- no sumar snapshots diarios para obtener un saldo mensual;
- no contar dos veces una operación por aparecer también en Movimientos;
- excluir estados eliminados de los KPI comerciales;
- mantener Directo como movimiento virtual informativo sin alterar saldos o KPI.

## Comparación entre periodos

Cada KPI de flujo o conteo podrá mostrar:

```text
Valor actual
Variación absoluta
Variación porcentual
Periodo comparado
```

Ejemplos de comparación:

- hoy contra ayer;
- esta semana contra la semana anterior completa o equivalente;
- este mes hasta hoy contra los mismos días del mes anterior;
- rango personalizado contra un rango anterior de igual duración.

Los saldos de corte se comparan entre el último instante de ambos periodos. No
se les aplica una suma acumulada.

## Descarga para el cliente

La pantalla podrá ofrecer `Descargar Excel` y `Descargar PDF` respetando los
filtros activos.

### Excel

- hoja `Resumen` con filtros, KPI y comparación;
- hoja `Serie histórica` con una fila por periodo y ruta/cuenta;
- hoja `Consolidado` con la tabla por banco, empresa y cuenta;
- hoja `SafetyPay` cuando corresponda.

### PDF

- filtros y fecha de generación;
- tarjetas principales;
- gráficos visibles;
- tabla consolidada resumida;
- sección especial de SafetyPay cuando corresponda.

La descarga del dashboard será analítica y no reemplazará al reporte oficial de
cierre de caja.

## Fuente de verdad y arquitectura propuesta

Las funciones KPI actuales continúan siendo la referencia para validar las
fórmulas de las tarjetas vigentes:

- `f_get_tb_ruta_operacion_kpi_operaciones_v2`;
- `f_get_tb_ruta_operacion_kpi_cierre_operaciones_v2`;
- `f_get_tb_ruta_operacion_kpi_safetypay`;
- `f_get_tb_operacion_asistida_kpi` para POS/Link Pago.

Para las series históricas se debe consultar el hecho operativo, porque
`tb_ruta_operacion_kpi` contiene un acumulado vigente por ruta y no una serie
temporal. Las fuentes serán:

- `tb_operacion_proceso` para operaciones, depósitos, pagos, estados y
  empresas/cuentas de ingreso y salida;
- `tb_operacion_caja` para movimientos e impactos financieros;
- `tb_caja_operativa_cierre` y su `kpi_snapshot` para saldos y valores de corte.

Se propone separar el contrato de consulta en tres RPC de solo lectura:

```text
f_get_dashboard_metricas_bancarias_resumen
f_get_dashboard_metricas_bancarias_serie
f_get_dashboard_metricas_bancarias_desglose
```

Parámetros comunes propuestos:

```text
p_fecha_desde
p_fecha_hasta
p_granularidad
p_rutas[]
p_id_empresa
p_id_empresa_cuenta_bancaria
p_familias[]
p_estados[]
```

La separación permite cargar primero las tarjetas y luego los gráficos/tablas,
evitando que una consulta pesada bloquee toda la pantalla. No se recomienda
crear una tabla materializada en la primera versión: antes se debe medir el
tiempo real de consulta sobre seis y doce meses.

## Contrato mínimo esperado

### Resumen

```ts
interface DashboardMetricasValores {
    caja_recaudacion: number;
    salidas: number;
    ganancias: number;
    margen_ganancia: number;
    gastos_operacionales: number;
    ingresos_movimientos: number;
    saldo_banco: number;
    pendiente_transferencia: number;
    operaciones_registradas: number;
    operaciones_pagadas: number;
    operaciones_pendientes: number;
    tasa_pago: number;
    ticket_promedio: number;
}

interface DashboardMetricasResumen {
    periodo: { desde: string; hasta: string };
    comparacion_periodo: { desde: string; hasta: string } | null;
    actual: DashboardMetricasValores;
    anterior: DashboardMetricasValores | null;
    variacion_porcentual: Partial<Record<
        "caja_recaudacion" | "salidas" | "gastos_operacionales" |
        "ganancias" | "operaciones_registradas" | "operaciones_pagadas",
        number | null
    >> | null;
    safetypay: {
        total_transferencia: number;
        empresas_derivadas: Array<{
            empresa: string;
            cuenta: string;
            operaciones: number;
            transferencia: number;
        }>;
    };
}
```

### Serie

```ts
interface DashboardMetricaSerie {
    periodo: string;
    ruta: string;
    caja_recaudacion: number;
    salidas: number;
    ganancias: number;
    margen_ganancia: number;
    gastos_operacionales: number;
    operaciones_registradas: number;
    operaciones_pagadas: number;
}
```

### Desglose

```ts
interface DashboardMetricaDesglose {
    ruta: string;
    empresa: string;
    cuenta: string;
    operaciones: number;
    pagadas: number;
    pendientes: number;
    caja_recaudacion: number;
    salidas: number;
    gastos_operacionales: number;
    ganancias: number;
    margen_ganancia: number;
    pendiente_transferencia: number;
    saldo_banco: number;
    tasa_pago: number;
    ticket_promedio: number;
}
```

Los contratos finales deberán incluir identificadores internos de ruta, empresa
y cuenta, aunque la tabla solo muestre sus nombres.

## Estados de interfaz

- Cargando: skeleton en tarjetas, gráficos y tabla.
- Sin datos: mensaje que conserve los filtros y permita ampliar el periodo.
- Sin cierre: aviso informativo; las métricas se muestran como operación viva.
- Datos parciales: advertencia si algunas cuentas no tienen cierre en el rango.
- Error: mensaje por bloque y opción de reintentar, sin borrar filtros.
- Sin permiso: no mostrar rutas ni nombres fuera del alcance del usuario.

## Entrega recomendada por etapas

### Etapa 1 — MVP entregable

- nueva ruta y permiso de menú;
- filtros de periodo, banco, empresa y cuenta;
- KPI financieros actuales;
- conteos de operaciones, tasa de pago y ticket promedio;
- gráfico Recaudación vs. Salidas;
- gráfico Ganancias vs. Gastos;
- tabla consolidada;
- tratamiento especial de SafetyPay;
- consulta actual e histórica consistente con cierres.

### Etapa 2 — Análisis avanzado

- comparación contra periodo anterior;
- distribución por familia y estado;
- ranking de bancos/empresas/cuentas;
- antigüedad de pendientes;
- tiempo promedio de atención y cumplimiento el mismo día;
- exportación Excel/PDF del dashboard.

### Etapa 3 — Optimización

- medir consultas de 6, 12 y 24 meses;
- agregar caché o materialización solo si es necesario;
- incorporar alertas configurables;
- habilitar drill-down completo a operaciones autorizadas.

## Criterios de aceptación

- Los KPI actuales coinciden con las rutas bancarias y cierres de prueba para el
  mismo banco, empresa, cuenta y fecha.
- Una operación pagada en una fecha diferente al depósito se atribuye al evento
  correcto en cada métrica.
- Los gráficos cambian de granularidad sin alterar los totales del periodo.
- No existe doble conteo entre Efectivización, Directo, Pago Deuda y Movimientos.
- Saldo Banco y Pendiente Transferencia representan valores al corte y no sumas
  de snapshots.
- Las cuentas con retención mantienen su personalización vigente.
- SafetyPay muestra empresas destino y transferencias reales.
- Los filtros y resultados respetan los permisos del usuario.
- Los periodos usan la zona horaria `America/Lima`.
- La pantalla no modifica operaciones, cajas, saldos, cierres ni snapshots.
- Los resultados sin datos, sin cierre y con error se distinguen claramente.

## Decisiones recomendadas

- Presentar al cliente la Etapa 1 como primera versión funcional.
- Usar `este mes hasta hoy` como vista inicial.
- Mantener `Saldo Banco` y eliminar `Caja Actual` de esta nueva pantalla.
- Separar importes, conteos y saldos para evitar interpretaciones contables
  incorrectas.
- No mostrar por ahora un ranking de empleados: el modelo registra distintos
  responsables y no permite atribuir todas las acciones de pago a una sola
  persona con precisión suficiente.
- Validar primero las consultas históricas con cierres conocidos antes de diseñar
  una capa de agregados.

## Fuera de alcance

- modificar las fórmulas financieras vigentes;
- cambiar la operativa de cajas o bandejas;
- crear o cerrar cajas desde el dashboard;
- reemplazar los reportes oficiales de cierre;
- evaluar desempeño o compensaciones de trabajadores;
- reutilizar como datos reales los valores presentes en las imágenes de
  referencia.
