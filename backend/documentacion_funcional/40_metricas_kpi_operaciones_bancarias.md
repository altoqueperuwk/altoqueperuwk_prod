# Levantamiento funcional — Métricas de Operaciones Bancarias

## Estado y objetivo

Documento de alcance inicial para convertir la idea visual de `2.jpg` y `1.jpg` en una pantalla de métricas de las rutas bancarias del sistema actual. Es levantamiento funcional, no implementación: no cambia cálculos, consultas, cierres ni permisos existentes.

Las imágenes se consideran **referencias de composición visual**. Sus números, categorías y métricas pertenecen a una herramienta de mensajería/marketing y no son información real de este sistema. No se deben copiar al dashboard bancario.

Objetivo: consultar, comparar y analizar la evolución de los KPIs de bancos/cuentas —BCP, BBVA, Scotiabank, BanBif, Interbank y SafetyPay— con filtros temporales e indicadores consistentes con las bandejas, los movimientos y los cierres existentes.

## Lectura de las imágenes

La pantalla de referencia muestra:

- Un encabezado `Estadísticas` y navegación por grupos (`Interacción`, `Página`, `Usuarios`, `Etiqueta`, `Ads`).
- Tarjetas con un total destacado y comparativos de hoy, semana, semana anterior y mes.
- Gráficos de barras y líneas con tendencia de los últimos seis meses.
- Un ranking de usuarios con más actividad.
- Un gráfico de dona con distribución por etiquetas.
- Navegación inferior propia de una aplicación móvil.

Para este producto, esos elementos se traducen a **selector de banco/ruta, empresa/cuenta, tarjetas de KPI, tendencias por periodo, distribución por estado/servicio/empresa y —si se puede atribuir con precisión— actividad por usuario**. Los conceptos de páginas, anuncios, mensajes, etiquetas de CRM y nuevos clientes no forman parte del alcance bancario inicial.

## Encaje en el sistema actual

Las rutas bancarias comparten componentes, pero cada una conserva su configuración de caja, empresa y cuenta. Las rutas existentes son BCP, BBVA, Scotiabank, BanBif, Interbank y SafetyPay; POS y Link Pago son rutas asistidas con consultas KPI propias, no bancos.

Los KPIs bancarios actuales provienen principalmente de:

- `f_get_tb_ruta_operacion_kpi_operaciones_v2`: datos de operación/caja vigentes, con filtro por ruta, empresa, cuenta y caja.
- `f_get_tb_ruta_operacion_kpi_cierre_operaciones_v2`: cálculo para una caja/cierre histórico.
- `f_get_tb_ruta_operacion_kpi_safetypay`: KPI especial de SafetyPay, incluyendo empresas derivadas y total de transferencias.
- `f_get_tb_operacion_asistida_kpi`: datos de POS/Link Pago en su flujo asistido.
- `tb_operacion_proceso`: operaciones, importes, estados, empresas/cuentas de ingreso y salida y marcas de tiempo operativas.
- `tb_operacion_caja`: movimientos de caja y su fecha.
- `tb_caja_operativa_cierre`: saldo y resumen por cierre, con `kpi_snapshot`.
- `tb_ruta_operacion_kpi`: acumulado vigente por ruta.

En la vista bancaria actual ya existen KPIs como Caja Inicial, Saldo Banco, Caja Recaudación, Ingresos, Ganancias, Salidas, Gastos Operacionales y Pendiente Transferencia. SafetyPay tiene además Empresas Derivadas y Total Transferencia. POS/Link Pago expone comisiones, gastos, ganancia, salidas, total de operaciones y total pagadas.

## Brecha principal para las métricas históricas

`tb_ruta_operacion_kpi` tiene una sola fila acumulada por ruta (`UNIQUE (ruta)`). No representa por sí misma una serie diaria o mensual. `tb_caja_operativa_cierre` conserva snapshots por cierre, pero solo existe un snapshot cuando se registra un cierre.

Por tanto, una gráfica de seis meses no debe construirse tomando el acumulado vigente ni interpolando entre cierres. Se debe agregar el dato fuente por fechas operativas y utilizar los snapshots de cierre únicamente para valores que son saldos de corte. Si el volumen histórico o el rendimiento lo exige, podrá agregarse una capa materializada de métricas, cuya fuente y proceso de sincronización deberán definirse después de medir rendimiento y exactitud.

## Propuesta de navegación y filtros

### Filtros principales

- **Banco/ruta:** Todos, BCP, BBVA, Scotiabank, BanBif, Interbank y SafetyPay, limitados a las rutas autorizadas para el usuario.
- **Empresa y cuenta:** opcionales, dependientes del banco seleccionado; deben permitir comparar todas las cuentas o aislar una.
- **Periodo:** hoy, esta semana, semana anterior, este mes, últimos seis meses y rango personalizado.
- **Agrupación temporal:** por día, semana o mes, según el rango; el rango de seis meses se presenta inicialmente por mes.
- **Familia operativa:** Efectivización, Pago Deuda y Movimientos cuando aplique. POS/Link Pago se ofrece en su propio contexto o como filtro diferenciado, sin mezclarlo silenciosamente con una ruta bancaria.

Los periodos se interpretan en `America/Lima`. Para comparativos “hoy/semana/mes”, se compara el periodo seleccionado con el periodo inmediatamente anterior equivalente, no con cifras de la imagen.

### Organización visual sugerida

1. Encabezado `Métricas` y controles de filtro.
2. Tarjetas de resumen para el periodo elegido.
3. Tendencia mensual de los últimos seis meses, con selección de indicador y/o rutas comparables.
4. Desglose por banco, empresa/cuenta, servicio y estado.
5. Ranking de actividad por colaborador solo cuando el evento tenga un responsable atribuible.

La navegación por `Interacción/Página/Usuarios/Etiqueta/Ads` no se copia literalmente. Una agrupación inicial más coherente sería `Resumen`, `Operaciones`, `Finanzas` y `Actividad`, sujeta al diseño final de la pantalla.

## Catálogo inicial de métricas bancarias

Las fórmulas actuales de las tarjetas siguen siendo la fuente de verdad. La pantalla nueva debe agregarlas o desglosarlas por periodo y banco sin volver a definirlas de manera distinta.

| Métrica | Tipo | Definición funcional propuesta |
|---|---|---|
| Operaciones registradas | Conteo | Operaciones creadas en el periodo, desglosables por familia y estado. |
| Operaciones pagadas | Conteo | Operaciones que alcanzaron `Pagado` dentro del periodo/atribución seleccionada. |
| Monto de efectivizaciones | Importe | Importe de depósitos de operaciones de Efectivización, separado de los pagos de deuda y movimientos. |
| Caja Recaudación | Importe de flujo | Recaudación calculada por la lógica KPI existente para las operaciones incluidas. |
| Salidas / Transferencias | Importe de flujo | Importes realmente transferidos, no importes pendientes ni transferencias estimadas. |
| Ganancias | Importe de flujo | Ganancia calculada con las fórmulas actuales de la ruta; Scotiabank/BanBif conservan su cálculo especial. |
| Gastos Operacionales | Importe de flujo | Comisiones/gastos incluidos actualmente por la lógica KPI de la ruta. |
| Pendiente Transferencia | Saldo pendiente | Obligación pendiente al corte consultado. Debe mostrarse como saldo a una fecha, no sumarse como si fuera flujo diario en todo el periodo. |
| Saldo Banco | Saldo de corte | Saldo asociado a la cuenta/cierre en una fecha concreta. No es un flujo mensual y no se suma entre fechas. |
| Ingresos de Movimientos | Importe de flujo | Ingresos manuales/contables de `tb_operacion_caja`; se mantienen separados de la Caja Recaudación comercial. |
| Empresas Derivadas (SafetyPay) | Desglose | Empresa y cuenta de destino agrupadas, con importe real de transferencia, según la función KPI específica vigente. |
| Total Transferencia (SafetyPay) | Conteo | Operaciones pagadas con importe transferido, según la definición vigente para SafetyPay. |

No se debe presentar la suma de importes y conteos en una misma unidad. Los valores monetarios se expresan en soles y los conteos como enteros.

## Reglas temporales para construir tendencias

Una única fecha no representa todos los eventos de una operación. La consulta analítica debe fijar el campo temporal según la métrica:

| Evento analizado | Fecha de referencia propuesta |
|---|---|
| Depósito recibido / fecha comercial de efectivización | `fecha_deposito_cliente`, interpretada en `America/Lima`. |
| Operación pagada / transferencia ejecutada | `fecha_pagado` o el registro real de salida asociado; debe mantenerse la atribución histórica de cierre cuando exista. |
| Movimiento manual de caja | Fecha de registro del movimiento en `tb_operacion_caja`. |
| Saldo Banco / Caja Inicial | Snapshot del cierre (`tb_caja_operativa_cierre`) más el periodo vigente cuando corresponda. |
| Pendiente Transferencia | Estado pendiente al corte final del filtro, no suma de snapshots repetidos. |

La pantalla deberá distinguir **fecha del depósito**, **fecha de pago** y **fecha de cierre** en filtros/ayudas cuando la métrica pueda variar según esa elección. Los datos ya cerrados deben seguir la atribución histórica de caja; no se deben mover a otro día por una edición posterior del estado.

## Ranking de colaboradores y distribución

El concepto visual “Principales empleados que interactúan durante el día” puede inspirar un ranking de operaciones, pero no debe llamarse “pagos procesados por usuario” si el modelo no registra quién ejecutó cada pago.

La operación tiene campos para usuario registrador, gestor actual, reasignación, solicitud y derivación; dichos actores no son intercambiables. Para la primera versión:

- Permitir ranking de operaciones asignadas/gestionadas por `id_usuario_gestor` (con fallback documentado a registrador solo cuando falte gestor), etiquetándolo como actividad gestionada.
- No atribuir una transferencia ejecutada al gestor si no existe actor específico del pago.
- Dejar el ranking por operador de pago deshabilitado hasta confirmar un evento/auditoría con `id_usuario` y fecha de acción confiables.
- Mostrar nombre, cantidad y volumen en soles como métricas separadas; definir desempate estable y respetar permisos por sede.

El gráfico de dona puede mostrar distribución de operaciones por ruta, servicio o estado. Para SafetyPay también puede mostrar destino de empresas/cuentas derivadas. Las categorías deben ser mutuamente excluyentes y usar el mismo total base; excluir Eliminados, Retornos o Retenciones solo según la definición explícita de cada visualización y mantenerlos disponibles como filtros si hace falta.

## Seguridad y consistencia

- El backend debe filtrar rutas, empresas, cuentas y sucursales según permisos; ocultar series solo en frontend no es control de acceso.
- Toda consulta histórica y agrupación temporal utiliza `America/Lima`.
- No duplicar una operación si aparece en operación comercial y en movimiento contable. Cada KPI define su fuente de verdad.
- No sumar `Saldo Banco` ni `Pendiente Transferencia` a través de periodos como flujos.
- El dashboard es de lectura: no crea movimientos ni modifica saldos, cierres, snapshots o KPI operativos existentes.
- Las comparaciones entre bancos deben conservar el detalle de cuenta y ruta; no asumir que una misma empresa en varios bancos equivale a una única caja.

## Plan de trabajo propuesto

### Fase 1 — Contrato de métricas

- Cerrar el catálogo de tarjetas, medidas, denominadores, exclusiones y fechas de atribución.
- Determinar si “Todos los bancos” es un total agregable o solo una comparación de series.
- Precisar los tipos de gráfico y comparativos entre bancos/cuentas.
- Confirmar qué permisos permiten ver métricas por empresa, cuenta, ruta y colaborador.

### Fase 2 — Consulta histórica agregada

- Diseñar una consulta de solo lectura que componga operaciones, movimientos y snapshots de cierre sin duplicar flujos.
- Implementar filtros de rango/fecha de evento y agregaciones por día, semana, mes, ruta y cuenta.
- Validar indicadores con cierres y reportes Excel/PDF de periodos históricos conocidos.
- Medir rendimiento antes de decidir si se requiere una tabla de agregados o caché.

### Fase 3 — Dashboard

- Implementar selector de bancos, empresa/cuenta y periodo.
- Mostrar tarjetas de resumen y gráficos de tendencia/composición.
- Añadir desglose por servicio/estado y SafetyPay especializado.
- Añadir ranking de actividad gestionada solo con atribución confiable.

### Fase 4 — Validación y salida

- Comparar cifras del dashboard con KPIs vigentes y muestras de movimientos/operaciones.
- Probar rutas autorizadas, cierres históricos, fechas que cruzan medianoche y rangos sin datos.
- Verificar carga y tiempos al consultar seis meses y varios bancos.
- Confirmar que no se alteran los valores actuales de tarjetas, reportes ni cierres.

## Criterios de aceptación

- El usuario puede filtrar por banco/ruta, empresa/cuenta y periodo autorizado.
- Cada tarjeta y serie explica su unidad, fecha de referencia y fórmula/fuente.
- Las series mensuales se calculan desde eventos/snapshots apropiados y no desde el acumulado único por ruta.
- El resultado histórico coincide con cierres, operaciones y movimientos de prueba.
- No hay doble conteo entre operaciones, movimientos, derivados y Pago Deuda.
- Las comparaciones distinguen importes de flujo, saldos al corte y conteos.
- Los totales por banco y cuenta respetan las reglas de acceso y las personalizaciones vigentes.
- Consultar el dashboard no modifica datos financieros ni snapshots existentes.

## Fuera de alcance de este levantamiento

- Implementar la pantalla, RPCs, tablas de agregación o gráficos.
- Copiar valores de ejemplo de las capturas.
- Importar estadísticas de mensajería, anuncios, páginas, publicaciones, nuevos teléfonos/clientes o etiquetas de CRM.
- Crear métricas de nómina o desempeño laboral; el ranking aquí propuesto es actividad operativa, no compensación.
- Modificar las fórmulas existentes de KPI, reportes o cierres.
