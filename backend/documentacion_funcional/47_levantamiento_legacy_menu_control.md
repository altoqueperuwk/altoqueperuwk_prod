# Levantamiento del legacy — menú Control

## 1. Objetivo y alcance

Este documento mapea la evidencia visual disponible del grupo **Control** del sistema legacy:

1. Reportes de penalidad.
2. Auditoría de pagos.
3. Cierre mensual.
4. Archivo mensual.
5. Alertas.

Se recibieron capturas de Reportes de penalidad, Auditoría de pagos y Cierre mensual. Archivo mensual solo se conoce como una pantalla que permite subir JSON o Excel, sin claridad sobre su propósito. Alertas no se levantará como módulo operativo independiente porque el sistema actual ya cubre ese seguimiento mediante **Seguimiento de Operaciones**.

El análisis distingue:

- **Observado:** visible directamente en las capturas.
- **Inferido:** interpretación probable que requiere validación.
- **Pendiente:** no puede determinarse todavía.

## 2. Descarte semántico actualizado

| Opción legacy | Decisión | Destino propuesto | Estado |
|---|---|---|---|
| Reportes de penalidad | Migrar como núcleo | Incidencias cruzadas entre sedes con revisión y penalidad | Pantalla observada |
| Auditoría de pagos | Migrar como núcleo especializado o subtipo de incidencia | Bono al detector y descuento al responsable en una sola aprobación | Pantalla observada |
| Cierre mensual | Migrar como núcleo | Pre-cierre, validación, snapshot, cierre y exportación | Pantalla observada |
| Archivo mensual | No diseñar todavía | Posible importación/migración de históricos o restauración de periodos | Pendiente de propósito, formato y resultado |
| Alertas | No replicar como seguimiento operativo | Reutilizar Seguimiento de Operaciones; conservar solo avisos de compensación | Cubierto parcialmente por sistema actual |

## 3. Reportes de penalidad

### 3.1 Propósito observado

La pantalla se denomina **Reportes de penalidad** y declara:

> Cruce entre sedes para reportar errores de Atención al cliente y que la sede responsable apruebe o rechace.

Esto confirma un flujo entre sedes con separación entre quien reporta y quien toma la decisión sobre el colaborador afectado.

### 3.2 KPI observados

| KPI | Valor visible | Significado mostrado |
|---|---:|---|
| Recibidos pendientes | 0 | Esperando decisión |
| Enviados pendientes | 0 | Bloqueados hasta respuesta |
| Aprobados | 0 | Penalidades aceptadas |
| Rechazados | 0 | Con motivo de rechazo |

La expresión `Bloqueados hasta respuesta` indica que la sede reportante no debería poder modificar el reporte una vez enviado, salvo retiro o anulación formal si el flujo lo permite.

### 3.3 Pestañas observadas

- Recibidos.
- Enviados.
- Nuevo reporte.
- Historial.

Este diseño representa cuatro vistas de una misma entidad de incidencia. En el sistema nuevo conviene usar una bandeja común con filtros y permisos, manteniendo accesos rápidos equivalentes si ayudan a la operación.

### 3.4 Bandeja de recibidos

Filtros observados:

- cliente, DNI o trabajador;
- mes;
- sede, con `Lince` visible;
- estado;
- trabajador;
- rango de tiempo.

Columnas observadas:

| Columna | Significado preliminar |
|---|---|
| Cliente | Cliente relacionado con el error |
| Trabajador | Colaborador sujeto a penalidad |
| Penalidad | Tipo o importe aplicable |
| Motivo enviado | Descripción del incidente |
| Enviado por | Reportante y posiblemente sede de origen |
| Estado | Pendiente, aprobado o rechazado |
| Fecha | Fecha del reporte o evento |

La captura no contiene filas, por lo que todavía no se observan acciones, importes, evidencias ni formato de aprobación/rechazo.

### 3.5 Flujo funcional preliminar

```text
Sede A detecta error asociado a colaborador de Sede B
        ↓
Sede A crea y envía reporte
        ↓
Reporte queda bloqueado para el emisor
        ↓
Responsable de Sede B revisa evidencia
        ├── Aprueba → se genera penalidad aceptada
        └── Rechaza → conserva motivo y no genera descuento
        ↓
Resultado queda en historial y, si corresponde, en liquidación
```

### 3.6 Controles necesarios

- impedir que emisor, afectado y aprobador sean la misma persona cuando exista conflicto de interés;
- identificar sede origen y sede responsable con vigencia a la fecha del evento;
- conservar cliente, operación y conversación relacionados;
- exigir motivo y evidencia según el tipo de error;
- exigir motivo al rechazar o anular;
- permitir observación/descargo dentro del plazo definido;
- impedir doble penalidad por el mismo error;
- congelar regla e importe cuando se aprueba;
- no insertar descuentos en cajas operativas;
- permitir ajuste trazable si el periodo ya fue cerrado.

### 3.7 Evidencia pendiente

- formulario `Nuevo reporte`;
- catálogo de penalidades y tipos de error;
- importe visible antes/después de aprobar;
- adjuntos o referencias permitidas;
- acciones en Recibidos y Enviados;
- motivo de rechazo;
- posibilidad de retirar un reporte enviado;
- contenido del Historial;
- relación con cliente, operación y Pancake;
- solicitudes Fetch/XHR del alta y decisión.

## 4. Auditoría de pagos

### 4.1 Propósito observado

La pantalla **Auditoría de pagos** indica:

> Los errores reportados por Pagos requieren la aprobación de la jefa de sede del asesor.

Esto confirma la incidencia cruzada descrita en la política preliminar: Pagos detecta un error de Atención al Cliente y la jefatura de la sede del asesor decide.

### 4.2 KPI y regla monetaria observados

| KPI/regla | Valor | Significado |
|---|---:|---|
| Pendientes | 0 | Esperando decisión de sede |
| Aprobadas | 0 | Aplicadas al cierre |
| Regla al aprobar | S/ 1.00 | Bono para quien reportó |
| Descuento | S/ 2.00 | Según tipo de error |

Una aprobación genera dos efectos relacionados:

1. bono de S/ 1.00 para el colaborador de Pagos que reportó;
2. descuento de S/ 2.00 para el asesor responsable.

Ambas líneas deben originarse en la misma incidencia aprobada y generarse de forma atómica para evitar que exista el bono sin penalidad o viceversa.

### 4.3 Bandeja observada

Filtros:

- asesor, motivo o reportante;
- mes.

Columnas:

| Columna | Contenido esperado |
|---|---|
| Asesor | Persona presuntamente responsable |
| Error reportado | Tipo/motivo del error |
| Enviado por | Detector/reportante del área de Pagos |
| Jefa responsable | Aprobadora de la sede del asesor |
| Estado | Pendiente, aprobado o rechazado |
| Fecha | Fecha del evento/reporte |

La captura está vacía y no muestra acciones. Se debe verificar si la aprobación se realiza en esta tabla, en Reportes de penalidad o mediante una alerta.

### 4.4 Relación con Reportes de penalidad

Semánticamente, Auditoría de pagos puede modelarse como un subtipo especializado de incidencia, no necesariamente como una entidad separada:

```text
Incidencia: ERROR_DETECTADO_POR_PAGOS
Emisor: colaborador de Pagos
Afectado: asesor de Atención al Cliente
Aprobador: jefatura de sede del asesor
Efecto positivo: + S/ 1.00 al emisor
Efecto negativo: - S/ 2.00 al afectado
```

La interfaz puede conservar una bandeja dedicada porque el caso tiene responsables y efectos particulares, aunque comparta tablas, auditoría y motor de aprobación con otros reportes.

### 4.5 Controles necesarios

- una incidencia no puede pagarse/reportarse dos veces;
- el detector no puede aprobar su propio bono;
- la jefa aprobadora debe corresponder a la sede vigente del asesor en la fecha del evento;
- debe existir evidencia de error y, cuando sea posible, referencia a operación/cliente;
- bono y descuento deben usar la misma decisión y versión de regla;
- el rechazo debe cancelar ambos efectos;
- una reversa posterior debe crear ajustes compensatorios en ambas liquidaciones;
- los importes deben permanecer separados de comisiones bancarias y cajas.

### 4.6 Evidencia pendiente

- formulario utilizado por Pagos para reportar;
- tipos de error y posible variación del descuento;
- acciones de aprobación/rechazo;
- motivo y evidencia requeridos;
- tratamiento si detector y asesor pertenecen a la misma sede;
- momento exacto en que se incorpora al cierre;
- reglas ante duplicidad con Reportes de penalidad;
- solicitudes Fetch/XHR.

## 5. Cierre mensual

### 5.1 Propósito observado

La pantalla **Cierre mensual** declara:

> Congela el mes, revisa pendientes y guarda una foto final para pagos y auditoría.

Esto confirma que el cierre debe persistir un snapshot y no depender de recalcular datos vivos posteriormente.

Acciones generales observadas:

- seleccionar mes a cerrar;
- Actualizar;
- Descargar PDF;
- Cerrar mes.

### 5.2 KPI observados

Para septiembre de 2026:

| KPI | Valor | Observación |
|---|---:|---|
| Estado | Abierto | Periodo aún modificable/no cerrado |
| Sueldos | S/ 22,892.69 | 25 colaboradores |
| Comisiones | S/ 459.20 | Registros validados |
| Referidos | S/ 342.60 | Referidos validados |
| Total general | S/ 23,351.89 | Subtítulo: sueldos + comisiones + referidos |

### 5.3 Inconsistencia o solapamiento numérico

Los valores visibles cumplen:

```text
S/ 22,892.69 + S/ 459.20 = S/ 23,351.89
```

El Total general no suma nuevamente los S/ 342.60 de Referidos. Por tanto, una de estas hipótesis debe ser cierta:

1. Referidos está incluido dentro de Comisiones y se muestra como desglose informativo;
2. el total general o su subtítulo tiene un error;
3. Comisiones contiene un subtotal distinto al sugerido por la etiqueta.

No se debe implementar `sueldos + comisiones + referidos` hasta revisar el PDF y el detalle de comisiones. De sumarse las tres cifras literalmente, el resultado sería S/ 23,694.49, que no coincide con la pantalla.

### 5.4 Pendientes que bloquean el cierre

| Pendiente | Cantidad observada |
|---|---:|
| Registros pendientes | 246 |
| Referidos pendientes | 0 |
| Solicitudes de asistencia | 3 |
| Sueldos sin marcar pagados | 25 |
| Comisiones sin marcar pagadas | 22 |

La pantalla muestra el mensaje:

> Cierre bloqueado. Primero marca todos los sueldos pagados y luego todas las comisiones pagadas.

Esto confirma una secuencia del legacy:

```text
Resolver/revisar pendientes
        ↓
Marcar sueldos pagados
        ↓
Marcar comisiones pagadas
        ↓
Cerrar y congelar el mes
```

### 5.5 Diferencia con el flujo preliminar objetivo

La documentación inicial proponía cerrar/aprobar la liquidación y luego emitir la orden de pago. El legacy exige marcar pagos antes de cerrar el mes.

Esta diferencia es de alto impacto. Debe decidirse si el nuevo sistema tendrá:

- **cierre de cálculo:** congela lo aprobado y permite emitir pagos;
- **cierre financiero:** confirma que todos los componentes fueron pagados;

o si conservará un solo cierre posterior al pago como el legacy. Separar ambos hitos suele ofrecer mayor trazabilidad y evita que importes sigan cambiando mientras se realizan pagos, pero requiere validación de Gerencia/Finanzas.

### 5.6 Resumen de dinero

Valores observados:

| Concepto | Valor |
|---|---:|
| Bonos incluidos | S/ 4,084.20 |
| Descuentos y penalidades | S/ 2,258.50 |
| Total a pagar | S/ 23,351.89 |

La palabra `incluidos` sugiere que Bonos y Descuentos son componentes informativos ya incorporados en Sueldos/Total, no importes que deban sumarse o restarse nuevamente.

### 5.7 Detalle congelable del mes

Columnas observadas:

| Columna | Semántica preliminar |
|---|---|
| Colaborador | Nombre y documento |
| Cargo | Puesto vigente |
| Sueldo | Importe de sueldo mostrado para cierre |
| Bono | Desglose informativo de bonos incluidos |
| Descuentos | Desglose informativo de penalidades incluidas |
| Comisión | Componente variable aún separado |
| Referidos | Subcomponente de comisiones o desglose independiente |
| Estado pagos | Sueldo pendiente/pagado y comisiones pendientes/pagadas |

En los ejemplos visibles, el campo Sueldo del cierre coincide con el Total de la pantalla Sueldos para algunos colaboradores, mientras Bono y Descuentos vuelven a mostrarse en columnas separadas. Esto refuerza la hipótesis de que dichas columnas son desgloses incluidos y no sumandos adicionales.

También se observa que sueldo y comisiones poseen estados de pago independientes. Un colaborador puede tener sueldo pendiente y comisiones pagadas.

### 5.8 Requisitos para el snapshot

Al cerrar, se debe conservar como mínimo:

- periodo y zona horaria;
- estado y versión del cálculo;
- colaborador, cargo, sede y jornada congelados;
- sueldo base/devengado;
- bonos y descuentos incluidos;
- comisiones y referidos, sin doble conteo;
- total final;
- estados y eventos de pago de cada componente;
- reglas y evidencias de cada línea;
- pendientes resueltos o excepciones autorizadas;
- usuario, fecha y motivo de cierre;
- aprobaciones requeridas;
- PDF/exportación asociada o hash del archivo;
- ajustes posteriores sin modificar el snapshot original.

### 5.9 Riesgos y controles

- doble conteo de Referidos dentro de Comisiones;
- total almacenado sin fórmula/desglose verificable;
- marcar como pagado sin referencia o comprobante;
- cerrar con registros pendientes no clasificados;
- recalcular un periodo mientras se están ejecutando pagos;
- cambio de reglas después del cierre;
- PDF distinto al snapshot persistido;
- reapertura o eliminación del cierre sin auditoría;
- mezcla entre fecha de pago y fecha de cierre.

### 5.10 Evidencia pendiente

- PDF descargado antes y después del cierre;
- detalle de Comisiones y relación con Referidos;
- significado de `Registros pendientes`;
- acción para marcar sueldo/comisión pagados;
- comprobante o referencia de pago;
- confirmación y resultado de Cerrar mes;
- estado de un mes cerrado;
- posibilidad y permisos de reapertura;
- ajustes posteriores;
- solicitudes Fetch/XHR de resumen, pago y cierre.

## 6. Archivo mensual

La opción queda **pendiente**. Solo se conoce que permite subir un archivo JSON o Excel. No se debe implementar una carga equivalente sin conocer:

- propósito funcional;
- estructura y origen de los archivos;
- si importa datos crudos, cálculos o snapshots cerrados;
- si crea, reemplaza o reconcilia periodos;
- validaciones y manejo de duplicados;
- permisos;
- posibilidad de revertir;
- relación con Cierre mensual y reportes históricos.

Hipótesis posibles, todavía no confirmadas:

1. migración de periodos históricos;
2. restauración de un snapshot mensual;
3. importación de conceptos externos;
4. archivo documental sin procesamiento;
5. conciliación con una planilla externa.

Importar JSON o Excel con resultados monetarios es una operación de alto riesgo. Debe existir esquema versionado, vista previa, validación, hash, idempotencia, auditoría y rollback antes de habilitarla.

## 7. Alertas

Las alertas operativas del legacy no se replicarán como un módulo separado porque el sistema actual ya posee **Seguimiento de Operaciones**.

La separación propuesta es:

| Tipo de alerta | Sistema responsable |
|---|---|
| Estado, demora, incidencia o seguimiento de una operación bancaria | Seguimiento de Operaciones actual |
| Aprobación pendiente de asistencia, llamada, calificación o penalidad | Módulo de Compensaciones |
| Periodo con pendientes que impiden cierre | Módulo de Compensaciones |
| Error técnico o integración fallida | Observabilidad/administración técnica |

No es necesario copiar la pantalla Alertas del legacy. Sí se requieren indicadores o bandejas de pendientes dentro de cada flujo de compensación y, opcionalmente, un centro transversal de tareas administrativas.

## 8. Patrón común de control

Las pantallas observadas muestran tres niveles relacionados:

```text
Evidencia o incidencia
        ↓
Revisión por responsable independiente
        ↓
Líneas económicas aprobadas
        ↓
Pre-cierre con pendientes y estados de pago
        ↓
Snapshot mensual inmutable
```

Reportes de penalidad y Auditoría de pagos deberían compartir un motor de incidencias, revisiones y ajustes. Cierre mensual consume únicamente resultados aprobados y debe poder explicar cada total hasta su evidencia original.

## 9. Entidades preliminares derivadas

| Entidad conceptual | Responsabilidad |
|---|---|
| Incidencia laboral | Error/reporte entre personas y sedes |
| Parte de incidencia | Emisor, afectado, aprobador, cliente y operación relacionados |
| Evidencia de incidencia | Motivo, adjunto, conversación o referencia operativa |
| Revisión | Aprobación/rechazo, responsable, fecha y motivo |
| Efecto económico | Bono y/o penalidad generados por la decisión |
| Periodo de liquidación | Estado de cálculo, aprobación, pago y cierre |
| Snapshot de cierre | Resultado inmutable por periodo y colaborador |
| Evento de pago | Componente pagado, fecha, referencia y responsable |
| Ajuste posterior | Corrección trazable de un periodo cerrado |
| Importación mensual | Solo si Archivo mensual demuestra un propósito válido |

## 10. Discrepancias y decisiones prioritarias

| Tema | Evidencia legacy | Definición previa/objetivo | Acción requerida |
|---|---|---|---|
| Momento del cierre | Exige sueldos y comisiones pagados | Se propuso cerrar antes de emitir orden de pago | Definir cierre de cálculo y cierre financiero, o conservar flujo legacy |
| Referidos en total | Total = Sueldos + Comisiones | Subtítulo dice Sueldos + Comisiones + Referidos | Revisar detalle y PDF para evitar doble conteo |
| Bonos/descuentos | Se muestran como `incluidos` | Detalle económico separado | Confirmar si son desglose del sueldo neto |
| Incidencia de Pagos | +S/1 y -S/2 en una aprobación | Coincide con política preliminar | Implementar efectos atómicos y reversa conjunta |
| Alertas | Legacy tiene módulo propio | Sistema actual ya tiene seguimiento | Reutilizar seguimiento operativo y crear solo tareas de compensación |
| Archivo mensual | Sube JSON/Excel sin propósito claro | No definido | Mantener fuera del alcance hasta obtener pantalla/archivo |

## 11. Orden recomendado para continuar

1. Descargar el PDF de Cierre mensual y compararlo con los KPI/detalle.
2. Abrir un mes ya cerrado para observar snapshot, pagos y posibles acciones.
3. Mostrar el formulario `Nuevo reporte` de Reportes de penalidad.
4. Mostrar una incidencia aprobada o histórica con sus efectos económicos.
5. Capturar cómo se marcan sueldo y comisiones como pagados.
6. Capturar solicitudes Fetch/XHR sanitizadas de resumen, detalle y cierre.
7. Mantener Archivo mensual pendiente hasta contar con una muestra anonimizada.

Con estas evidencias se podrá definir el ciclo real de liquidación/cierre y decidir si el nuevo sistema necesita uno o dos hitos de cierre.
