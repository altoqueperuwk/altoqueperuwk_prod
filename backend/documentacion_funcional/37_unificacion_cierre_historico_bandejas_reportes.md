# Unificación de bandejas y reportes históricos de cierre

## Estado

Documento de análisis, planificación y seguimiento de implementación. Levanta
el comportamiento de las bandejas bancarias y de las descargas Excel/PDF, y
registra la solución aplicada para unificar la lógica histórica.

## Implementación aplicada

La descarga histórica dejó de depender de f_get_reporte_cierre para obtener
las colecciones de operaciones. Ahora ejecuta en paralelo las mismas fuentes
del datatable:

- f_get_tb_operacion_bandeja_unificada.
- f_get_tb_pago_deuda_bandeja.
- f_get_tb_operacion_caja.
- f_get_tb_ruta_operacion_kpi_cierre_operaciones_v2 para KPI.
- f_get_tb_ruta_operacion_gastos_salida_v2 para conciliar Saldo Banco.
- f_get_tb_ruta_operacion_ganancias_efectivizacion_v2 en las cuentas con
  ganancia especial.

La respuesta se normaliza antes de generar archivos y se clasifica con la
misma función compartida que utiliza el datatable para distinguir:

- Efectivización.
- Derivados atendidos.
- Derivados enviados.
- POS.

Pago Deuda usa exactamente las filas BANCO devueltas por su bandeja histórica,
incluyendo la información agregada de retornos. Los movimientos se agrupan por
operación con el mismo algoritmo del datatable. Excel y PDF consumen las mismas
colecciones normalizadas.

Se mantuvo f_get_reporte_cierre para compatibilidad y para la descarga viva sin
cierre. Las descargas históricas de las rutas bancarias y de
/reportes/cierre-caja utilizan el nuevo ensamblado compartido.

Retenciones continúa fuera de Excel/PDF. Las personalizaciones financieras se
conservan mediante KPI V2, ganancia especial y la regla de Saldo Banco por
empresa, banco y cuenta.

Validación de producción realizada para Scotiabank, empresa 5, cuenta 33, caja
32 y fecha 05/09/2026:

- Las tres RPC operativas respondieron correctamente.
- El cierre identificado fue 366.
- KPI histórico devolvió una fila.
- Gastos bancarios de salida: S/ 38.25.
- Ganancia especial: S/ 5,701.56.
- La llamada monolítica a f_get_reporte_cierre excedió el statement timeout,
  lo cual confirma la necesidad de reemplazarla en la descarga histórica.

Validación técnica de la implementación:

- Pruebas nuevas de clasificación, agrupación y ensamblado: 3 aprobadas.
- npm exec tsc -- --noEmit: aprobado.
- npm run build: aprobado.
- git diff --check: aprobado.
- La suite global conserva una falla previa en action-rules.test.ts, caso
  "Emp. Salida" para Derivados; el archivo y la regla no fueron modificados por
  esta implementación.

## Objetivo

La consulta histórica de /reportes/cierre-caja y sus archivos Excel/PDF deben
mostrar el mismo conjunto de operaciones y las mismas reglas que las bandejas:

- /operaciones/bcp
- /operaciones/bbva
- /operaciones/scotiabank
- /operaciones/banbif
- /operaciones/interbank

Debe conservarse:

- Efectivización, derivados atendidos, derivados enviados, POS y Pago Deuda.
- Atribución separada de ingreso, salida y comisión.
- Operaciones pendientes congeladas por cierre.
- Flujo completo Pago Deuda: SOLICITUD, BANCO, RETORNO/RETORNO_DIRECTO y comisión.
- Reglas especiales de BCP, Scotiabank, BanBif y SafetyPay para retenciones.
- Fechas operativas en zona horaria America/Lima.
- Compatibilidad con id_caja_cierre legado.

## 1. Consulta actual de las rutas bancarias

El hook operativo selecciona la función según el tab:

| Bandeja | Función | Fuente | Contenido |
| --- | --- | --- | --- |
| Efectivización TC | f_get_tb_operacion_bandeja_unificada | tb_operacion_proceso | Efectivización, derivados y POS |
| Pago Deuda TC | f_get_tb_pago_deuda_bandeja | tb_operacion_proceso | Filas BANCO y datos relacionados |
| Movimientos | f_get_tb_operacion_caja | tb_operacion_caja | Movimientos financieros |

Archivos:

- src/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-bandeja.ts
- src/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service.ts

Para Scotiabank, el contexto histórico probado fue:

    ruta: scotiabank
    empresa: 5
    cuenta bancaria: 33
    caja: 32
    fecha: 2026-09-05
    desde: 2026-09-05T00:00:00-05:00
    hasta: 2026-09-05T23:59:59-05:00

Las llamadas fueron:

    f_get_tb_operacion_bandeja_unificada(
      p_tab = UNIFICADO,
      p_ruta = scotiabank,
      p_id_empresa = 5,
      p_id_empresa_cuenta_bancaria = 33,
      p_filtro_estado = Todos,
      p_fecha_caja_cierre_desde = desde,
      p_fecha_caja_cierre_hasta = hasta
    )

    f_get_tb_pago_deuda_bandeja(
      p_ruta = scotiabank,
      p_id_empresa_salida = 5,
      p_id_empresa_cuenta_salida = 33,
      p_fecha_caja_cierre_desde = desde,
      p_fecha_caja_cierre_hasta = hasta
    )

    f_get_tb_operacion_caja(
      p_id_caja = 32,
      p_fecha_caja_cierre_desde = desde,
      p_fecha_caja_cierre_hasta = hasta
    )

## 2. Consulta actual de /reportes/cierre-caja

El flujo de la página global es:

    f_get_tb_reporte_cierre_caja_fechas
      -> f_get_tb_reporte_cierre_caja_bandeja
      -> filtrar ruta, empresa y cierre
      -> f_get_reporte_cierre por cada caja/cierre
      -> buildCierreExcel o buildCierrePdf

Archivos:

- src/features/reportes/reporte-cierre-caja-operational-page.tsx
- src/features/reportes/services/reporte-cierre-caja.service.ts
- backend/backend_implementacion/14.reportes_cierre_caja.sql

Las funciones de fechas y bandeja solo sirven para seleccionar cierres. No
devuelven el detalle de operaciones. El detalle se obtiene con
f_get_reporte_cierre.

La página contiene un datatable embebido que reutiliza el componente operativo,
pero la descarga sigue otro camino:

    Datatable:
      useBancariaBandeja
        -> f_get_tb_operacion_bandeja_unificada
        -> f_get_tb_pago_deuda_bandeja
        -> f_get_tb_operacion_caja

    Excel/PDF:
      f_get_reporte_cierre
        -> consultas propias por sección
        -> generador local de archivo

Por ello, actualmente no existe equivalencia total entre el datatable y el
archivo descargado.

## 3. Qué hace actualmente f_get_reporte_cierre

Está definido en:

- backend/backend_implementacion/05.ruta_operacion_y_cajas.sql

Firma vigente:

    f_get_reporte_cierre(
      p_id_caja,
      p_id_empresa,
      p_ruta,
      p_id_caja_cierre,
      p_fecha_cierre
    )

Primero obtiene la caja, ruta, empresa y banco. Luego resuelve el cierre por
ID o por caja y fecha Lima, construye el rango diario y obtiene KPI mediante
f_get_tb_ruta_operacion_kpi_cierre_operaciones_v2.

### 3.1 Efectivización

Este bloque sí llama a f_get_tb_operacion_bandeja_unificada con el contexto de
la caja y el rango histórico.

Después:

- Excluye derivados recibidos del conjunto principal.
- Separa derivados atendidos y enviados.
- Marca derivados enviados con derivada_congelada.
- Calcula gastos y ganancias usando movimientos relacionados.
- Separa pagadas y pendientes.

La fuente inicial coincide con la bandeja unificada, pero el postprocesamiento
del reporte está implementado por separado.

### 3.2 Derivados

El reporte consulta directamente tb_operacion_proceso con:

- tipo_servicio = EFECTIVIZACION.
- flag_derivado = true.
- ruta_destino igual a la ruta consultada.
- filtros de empresa y cuenta.
- coincidencia con id_caja_cierre, id_caja_cierre_ingreso o
  id_caja_cierre_salida.

Luego separa pagados y pendientes. Esta consulta no reutiliza todo el contrato
de f_get_tb_operacion_bandeja_unificada y puede diferir en empresa origen,
empresa destino, clasificación y estados.

### 3.3 Pago Deuda

El reporte no llama a f_get_tb_pago_deuda_bandeja. Reconstruye directamente el
flujo desde tb_operacion_proceso y tb_operacion_caja:

    SOLICITUD
      -> BANCO
      -> RETORNO / RETORNO_DIRECTO
      -> PAGO_DEUDA_COMISION

Puede incluir:

- ID y código de la solicitud raíz.
- ID y código de BANCO.
- IDs y códigos de retornos.
- Movimiento de comisión.
- Paso actual.
- Cierre de ingreso de la solicitud.
- Cierre de salida de BANCO.
- Cierre del retorno o de la comisión.
- Registros pagados y pendientes.

La bandeja f_get_tb_pago_deuda_bandeja devuelve principalmente filas BANCO,
enriquece solicitud y retorno, y filtra por la atribución de cierre de esa
operación. El reporte, en cambio, puede incluir un grupo porque el cierre está
en la raíz, banco, retorno o comisión.

### 3.4 POS

El reporte consulta directamente operaciones con:

- ruta_origen = pos.
- ruta_destino igual a la ruta bancaria.
- filtros de empresa y cuenta de salida.
- coincidencia con el cierre.

Después separa pagados y pendientes.

### 3.5 Movimientos

El reporte consulta directamente tb_operacion_caja y considera:

- PAGO_DEUDA_COMISION.
- OTROS.
- TRANSFERENCIA_INTERNA.
- GASTO_OPERACIONAL_CIERRE.

La bandeja utiliza f_get_tb_operacion_caja. La tabla es la misma, pero los
predicados y el postprocesamiento no están centralizados. En la descarga desde
la ruta bancaria existe además un fallback hacia f_get_tb_operacion_caja si el
reporte no devuelve movimientos.

### 3.6 Retenciones

f_get_reporte_cierre consulta directamente operaciones con flag_retenido=true.
La función especializada se encuentra en:

- backend/backend_implementacion/10.retenciones_scotiabank_banbif.sql
- f_get_tb_operacion_retencion_bandeja

Aplica a bcp, scotiabank, banbif y safetypay. Esta función tiene una regla
adicional: una operación pagada sin id_caja_cierre puede pertenecer al cierre
si su fecha cae dentro de la apertura y cierre de una caja compatible por ruta,
empresa y cuenta.

El bloque de f_get_reporte_cierre no reutiliza completamente esa regla
temporal. Esto puede provocar diferencias para retenciones pagadas sin ID de
cierre materializado.

Retenciones no se muestran en Excel/PDF por la decisión funcional vigente,
aunque el backend aún devuelve sus arreglos por compatibilidad.

## 4. Comparación de contratos

| Tema | Bandejas | f_get_reporte_cierre |
| --- | --- | --- |
| Efectivización | RPC unificada | RPC unificada + transformación propia |
| Derivados | Incluidos en RPC unificada | Consulta directa separada |
| POS | Incluido en RPC unificada | Consulta directa separada |
| Pago Deuda | Principalmente BANCO | Reconstrucción completa del flujo |
| Movimientos | f_get_tb_operacion_caja | Consulta directa a tb_operacion_caja |
| Retenciones | Contrato especializado | Consulta directa con flag_retenido |
| Pendientes históricos | Según contrato de bandeja | Pendientes atribuidos al cierre |
| KPI | KPI vivo o histórico | KPI histórico V2 |

## 5. Diferencias detectadas

1. Hay dos implementaciones para derivados y POS.
2. Pago Deuda utiliza contratos distintos en bandeja y reporte.
3. La lógica temporal de retención no está centralizada.
4. Movimientos tiene distintos filtros y fallback.
5. El datatable y la descarga clasifican el flujo en lugares diferentes.
6. Excel y PDF no consumen exactamente las mismas secciones.
7. El Excel global actual agrega Efectivización, derivados, Pago Deuda y POS;
   no agrega Movimientos.
8. El PDF oficial sí renderiza Movimientos.
9. Retenciones se excluye de ambos archivos por definición funcional.

## 6. Diseño objetivo

Centralizar primero el contexto de cierre:

    ContextoCierre
      id_caja
      id_caja_cierre
      fecha_cierre_desde
      fecha_cierre_hasta
      ruta
      id_empresa
      id_empresa_cuenta_bancaria
      filtro_estado
      codigo_operacion
      dni_cliente

Luego normalizar la salida:

    {
      contexto: {},
      efectivizacion: [],
      derivados_atendidos: [],
      derivados_enviados: [],
      pago_deuda: [],
      pos: [],
      movimientos: [],
      retenciones: [],
      kpi: {}
    }

Cada fila debe conservar, cuando aplique:

- ID de operación y flujo.
- Empresa y cuenta mostradas.
- Empresa/cuenta origen y destino.
- id_caja_cierre legado.
- id_caja_cierre_ingreso.
- id_caja_cierre_salida.
- fecha_caja_cierre.
- Estado, fecha y datos comerciales.

Excel, PDF y datatable deben consumir esta salida sin volver a inferir
pertenencia, flujo, empresa o cuenta.

## 7. Plan de trabajo

### Fase 0: decisiones funcionales

1. Confirmar que el histórico incluye pendientes congeladas por cierre.
2. Confirmar que Retenciones continúa fuera de Excel/PDF.
3. Confirmar que Movimientos debe aparecer en el Excel global.
4. Confirmar la deduplicación de Pago Deuda.
5. Definir si se acepta fallback temporal para pagadas sin ID de cierre.

### Fase 1: matriz de contratos

1. Documentar firmas y parámetros de todas las RPC involucradas.
2. Comparar predicados de cierre, estados, empresas, cuentas y rutas.
3. Crear casos para operación viva, histórica pagada y pendiente congelada.
4. Crear casos para cierre por ingreso, salida, comisión y movimiento.
5. Identificar la fuente de verdad de cada campo mostrado.

### Fase 2: contexto y pertenencia al cierre

1. Centralizar resolución de caja, ruta, empresa y cuenta.
2. Centralizar el rango diario America/Lima.
3. Centralizar coincidencia por id_caja_cierre legado, ingreso y salida.
4. Incorporar cierres de tb_operacion_caja y relaciones Pago Deuda.
5. Mantener compatibilidad con datos históricos incompletos.

### Fase 3: Efectivización, derivados y POS

1. Usar el contrato unificado como fuente común.
2. Clasificar en backend Efectivización, derivados atendidos, derivados
   enviados y POS.
3. Resolver empresa/cuenta mostrada según la trazabilidad:
   destino para derivados atendidos y enviados, y cuenta operativa para POS.
4. Eliminar consultas duplicadas para derivados y POS.
5. Validar que cada operación aparezca una sola vez.

### Fase 4: Pago Deuda

1. Formalizar una respuesta histórica única.
2. Reutilizar la misma reconstrucción en bandeja histórica y reporte.
3. Devolver solicitud, banco, retorno y comisión relacionados.
4. Aplicar la misma regla de atribución a raíz, banco, retorno y comisión.
5. Conservar IDs, códigos, paso actual y montos.
6. Probar cajas diferentes para ingreso, salida y comisión.

### Fase 5: Retenciones

1. Decidir formalmente la inclusión temporal de pagadas sin ID de cierre.
2. Reutilizar esa regla en el contrato histórico común.
3. Mantener Retenciones fuera de Excel/PDF.
4. Probar BCP, Scotiabank, BanBif y SafetyPay.

### Fase 6: Movimientos

1. Usar f_get_tb_operacion_caja como contrato único.
2. Definir el conjunto final de tipos de movimiento.
3. Aplicar los mismos filtros en datatable, Excel y PDF.
4. Eliminar el fallback cuando el contrato común esté validado.

### Fase 7: Excel y PDF

1. Consumir la respuesta normalizada.
2. Agregar Movimientos al Excel global si se confirma en Fase 0.
3. Mantener Retenciones fuera de la presentación.
4. Mantener secciones de Efectivización, derivados atendidos, derivados
   enviados, Pago Deuda, POS y Movimientos.
5. Mostrar - para valores históricos NULL.
6. Validar que totales y cantidades coincidan entre web, Excel y PDF.

### Fase 8: despliegue controlado

1. Modificar primero las funciones SQL fuente del dominio.
2. Respetar en cada SQL el orden tabla, funciones y DROP final de funciones
   afectadas.
3. No realizar backfill masivo de cierres históricos.
4. Desplegar contratos compatibles con el frontend actual.
5. Actualizar frontend después de validar respuestas SQL.
6. Ejecutar pruebas antes de publicar.

## 8. Criterios de aceptación

- Una operación histórica aparece igual en bandeja, Excel y PDF.
- No hay duplicados entre Efectivización y derivados.
- Derivados atendidos y enviados tienen la misma clasificación en los tres
  canales.
- POS aparece solo en POS.
- Pago Deuda muestra el flujo completo una sola vez.
- Ingreso, salida y comisión quedan en sus cierres respectivos.
- Pendientes congeladas aparecen en el histórico y no en la bandeja viva.
- Retenciones mantienen sus reglas especiales y no se muestran en los archivos.
- Movimientos tienen el mismo conjunto en datatable, Excel y PDF.
- Valores históricos NULL se muestran como -.
- KPI y totales no cambian por la sola normalización de consultas.

## 9. Pruebas mínimas

1. Comparar las tres consultas operativas de Scotiabank del 05/09/2026 con
   f_get_reporte_cierre.
2. Comparar f_get_reporte_cierre con Excel y PDF.
3. Probar Efectivización, derivado atendido, derivado enviado y POS.
4. Probar Pago Deuda en SOLICITUD, BANCO, RETORNO y comisión.
5. Probar atribuciones de ingreso, salida y comisión en cajas diferentes.
6. Probar una operación pendiente congelada.
7. Probar retención pagada sin ID de cierre dentro del rango temporal.
8. Probar fechas alrededor de medianoche en America/Lima.
9. Confirmar que POS, LinkPago y rutas no afectadas no cambian.

Validación técnica:

    npm run test
    npm exec tsc -- --noEmit
    npm run build
    git diff --check

## 10. Decisiones pendientes del orquestador

- Función SQL nueva o ampliación de las RPC existentes.
- Mantener f_get_reporte_cierre como fachada o reemplazarlo por contratos de
  dominio.
- Incluir Movimientos en el Excel global.
- Aplicar inclusión temporal de retenciones pagadas sin ID.
- Mostrar pendientes congeladas en todas las bandejas históricas o solo en Pago
  Deuda.
- Conservar los nombres JSON actuales para no romper consumidores existentes.

## Archivos de referencia

- backend/backend_implementacion/04.pago_deuda.sql
- backend/backend_implementacion/05.ruta_operacion_y_cajas.sql
- backend/backend_implementacion/10.retenciones_scotiabank_banbif.sql
- backend/backend_implementacion/14.reportes_cierre_caja.sql
- src/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-bandeja.ts
- src/features/operaciones/efectivizacion/bancaria/pages/bancaria-page.tsx
- src/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service.ts
- src/features/reportes/reporte-cierre-caja-operational-page.tsx
- src/features/reportes/services/reporte-cierre-caja.service.ts
- src/features/reportes/services/reporte-cierre-caja-download.tsx
- src/features/operaciones/efectivizacion/bancaria/components/bancaria-reporte-cierre-pdf-oficial.tsx
