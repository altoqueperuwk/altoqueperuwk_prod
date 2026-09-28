# Levantamiento del legacy de compensaciones

## 1. Objetivo

Reconstruir, mediante observación controlada del sistema legacy, la funcionalidad de sueldos, comisiones, bonos y penalidades que debe migrarse a Al Toque Perú. No se dispone del código fuente del legacy, por lo que el análisis será de caja negra: entradas visibles, acciones, respuestas, estados, cálculos, permisos, exportaciones y solicitudes de red observables desde el navegador.

La meta no es copiar la interfaz píxel por píxel. Se busca reproducir el comportamiento válido, conservar la trazabilidad histórica y adaptar la experiencia al stack y patrones actuales del proyecto.

## 2. Fuentes y prioridad

Cuando dos fuentes difieran, se registrará la discrepancia y no se resolverá silenciosamente.

| Prioridad | Fuente | Uso |
|---:|---|---|
| 1 | Política aprobada por Gerencia, Finanzas y responsables laborales | Determina qué se debe pagar, descontar y aprobar. |
| 2 | Casos reales y resultados validados del legacy | Permiten comprobar fórmulas, estados, cortes y excepciones. |
| 3 | Comportamiento observable del legacy | Define navegación, campos, flujos, validaciones, permisos y reportes existentes. |
| 4 | `39_sistema_compensaciones_bonos_penalidades.md` | Modelo funcional preliminar y reglas ya aclaradas. |
| 5 | `implementacion_esquema/ESQUEMA_9.md` | Transcripción de reglas originales; puede contener ambigüedades o importes reemplazados. |

Una conducta del legacy que contradiga una política aprobada se registra como deuda o defecto; no se migra automáticamente.

## 3. Alcance que se debe descubrir

### 3.1 Navegación y perfiles

- Nombre del módulo y rutas visibles.
- Menús, submenús, pestañas y accesos directos.
- Perfiles que pueden consultar, crear, editar, aprobar, cerrar, reabrir y exportar.
- Restricciones por sede, área, puesto, trabajador y periodo.
- Diferencias entre Administrador, Gerencia, Facturación, Pagos, Jefe de Tienda y colaborador.

### 3.2 Personal y configuración

- Cómo se registra o selecciona al trabajador.
- Relación entre usuario, empleado, rol, puesto, sede, modalidad y cartera bancaria.
- Vigencia de puesto, sede, sueldo y plan de compensación.
- Manejo de ingresos, ceses, cambios de puesto/sede y trabajo remoto.
- Catálogos configurables y valores escritos directamente en pantalla.

### 3.3 Reglas económicas

- Sueldo base y prorrateo.
- Bonos fijos, variables, individuales y por sede.
- Comisiones por operación, cliente, referido, atención o auditoría.
- Penalidades fijas, por minuto y porcentuales.
- Topes, mínimos, redondeos y orden de aplicación.
- Reglas que anulan otras reglas, como tolerancia cero o pérdida del bono de puntualidad.
- Vigencia y versionado de reglas.

### 3.4 Evidencias y operaciones

- Origen de cada concepto: registro manual, operación, cliente, asistencia, Pancake, archivo o conciliación.
- Persona que genera la evidencia y persona afectada.
- Referencias visibles a operación, DNI, cliente, sede, conversación o archivo.
- Archivos admitidos, límites, formatos y posibilidad de descarga.
- Prevención de eventos duplicados y tratamiento de correcciones.

### 3.5 Periodos, cálculo y aprobación

- Estados exactos del periodo y transiciones permitidas.
- Acción que dispara el cálculo y posibilidad de recalcular.
- Diferencia entre borrador, preliquidación, aprobado, cerrado, pagado, observado o anulado.
- Quién aprueba, en qué orden y con qué restricciones.
- Qué puede editarse después de aprobar o cerrar.
- Tratamiento de reaperturas y ajustes posteriores.

### 3.6 Reportes y exportaciones

- Resumen por trabajador, sede, área y periodo.
- Detalle de cada concepto, base, cantidad, tarifa e importe.
- Formatos Excel/PDF/CSV y columnas exactas.
- Totales, subtotales, redondeos y diferencias entre pantalla y exportación.
- Historial de cambios y usuario responsable.

## 4. Inventario inicial de pantallas a verificar

Los nombres siguientes son categorías de levantamiento, no rutas definitivas. Deben reemplazarse por los nombres reales encontrados en el legacy.

| ID | Pantalla o capacidad | Evidencia mínima | Estado |
|---|---|---|---|
| LEG-01 | Dashboard/resumen del periodo | Captura completa, filtros, KPI y resultado de un mes | Pendiente |
| LEG-02 | Trabajadores y asignaciones | Listado, formulario nuevo/editar e historial | Pendiente |
| LEG-03 | Puestos, sedes y modalidades | Catálogos, relaciones y vigencias | Pendiente |
| LEG-04 | Planes y reglas | Listado, fórmula, monto, condiciones y vigencia | Pendiente |
| LEG-05 | Asistencia y tardanzas | Excel del huellero, importación, conciliación, tolerancia y cálculo por minuto | Confirmada la fuente; pendiente obtener muestra y pantalla |
| LEG-06 | Bonos y comisiones | Alta, evidencia, aprobación y cálculo | Pendiente |
| LEG-07 | Penalidades e incidencias | Alta, descargo, revisión, aprobación y reversa | Pendiente |
| LEG-08 | Importaciones | Plantilla, validaciones, errores y resultado | Pendiente |
| LEG-09 | Preliquidación por trabajador | Desglose completo y recálculo | Pendiente |
| LEG-10 | Aprobaciones y cierre mensual | Estados, responsables, bloqueo y reapertura | Pendiente |
| LEG-11 | Reportes/exportaciones | Archivos de muestra y conciliación con pantalla | Pendiente |
| LEG-12 | Auditoría/historial | Antes/después, autor, fecha y motivo | Pendiente |

Si una capacidad no existe, se marcará como **No existe en legacy**. Esto evita confundir falta de evidencia con funcionalidad pendiente de revisar.

## 5. Ficha obligatoria por pantalla

Por cada pantalla se debe registrar:

```text
ID de levantamiento:
Nombre visible:
URL relativa:
Perfil utilizado:
Sede/área visible:
Objetivo:
Filtros:
Columnas/KPI:
Botones y acciones:
Campos del formulario:
Obligatorios y valores por defecto:
Validaciones y mensajes:
Estados iniciales y finales:
Permisos observados:
Solicitudes Fetch/XHR asociadas:
Exportaciones:
Caso probado:
Resultado esperado/observado:
Dudas o diferencias con la política:
Evidencias adjuntas:
```

Las capturas deben incluir encabezado, filtros, tabla, paginación y mensajes. Cuando haya información personal, se debe anonimizar DNI, correo, teléfono, cuenta, token y cualquier secreto.

## 6. Método de observación sin código fuente

### 6.1 Recorrido visual

1. Ingresar con cada perfil disponible.
2. Registrar menú y rutas sin ejecutar cambios irreversibles.
3. Capturar estados vacío, con datos, con error y sin permisos.
4. Abrir formularios y documentar campos, listas, dependencias y valores por defecto.
5. Probar ordenamiento, búsqueda, paginación, descarga y mensajes.

### 6.2 Análisis de red permitido

Desde las herramientas del navegador, pestaña **Network**, filtrar por `Fetch/XHR` y registrar:

- método y URL relativa;
- parámetros de consulta o cuerpo, ocultando tokens y datos personales;
- estructura de la respuesta y nombres de campos;
- códigos HTTP y mensajes de error;
- secuencia de llamadas al guardar, aprobar, calcular, cerrar o exportar.

Es preferible exportar un HAR sanitizado. Nunca se deben compartir contraseñas, cookies, tokens de sesión, encabezados `Authorization` ni secretos del entorno.

### 6.3 Pruebas controladas para inferir fórmulas

Para cada regla se necesitan al menos tres casos: cero/no aplica, caso normal y límite. Cuando corresponda, agregar caso de reversa o duplicado.

| Regla | Casos mínimos |
|---|---|
| Tardanza | 09:05:00, 09:05:59, 09:06:00 y varios minutos completos |
| Cliente nuevo | Operación dentro de 168 horas, exactamente al límite y fuera del límite |
| Prorrateo | Mes completo, ingreso a mitad de mes y cambio de puesto/sede |
| Comisión porcentual | Monto con centavos, mínimo, tasa general y tasa excluida |
| Meta de sede | 79.99%, 80% y más de 100%; con y sin asesores elegibles |
| Descuento escalonado | 0, 1, 2 y 3 errores |
| Tolerancia cero | Sin evento, evento observado, aprobado y revertido |
| Cierre | Borrador, aprobación parcial, aprobación total, cierre y ajuste posterior |

En cada prueba se registra entrada, resultado de pantalla, resultado exportado y fórmula inferida. Una fórmula se considera confirmada solo cuando reproduce los casos observados y es validada por el responsable funcional.

## 7. Mapeo preliminar hacia el sistema actual

| Necesidad | Recurso actual reutilizable | Brecha |
|---|---|---|
| Identidad y acceso | `tb_usuario`, `auth_user_id`, permisos de menú | Falta entidad laboral separada del usuario técnico. |
| Rol y sede | `tb_rol`, `tb_sucursal`, `tb_usuario.id_sucursal` | Falta puesto operativo, modalidad, cartera y vigencia histórica. |
| Cliente nuevo | `tb_cliente.fecha_registro`, `tb_cliente.id_usuario` | Debe congelarse la atribución usada en el cálculo. |
| Actividad operativa | `tb_operacion_proceso`, usuarios gestores y fechas | Falta definir actor elegible por regla y evitar duplicados/reversiones. |
| Aprobaciones | Permisos existentes | Falta flujo de aprobación por concepto y periodo. |
| Evidencias externas | No existe módulo formal | Se requiere almacenamiento de evento, archivo, fuente y hash/deduplicación. |
| Liquidación | No existe | Se requieren periodo, cálculo reproducible, detalle y cierre inmutable. |
| Auditoría | Tablas `_his` en catálogos actuales | Se requiere auditoría específica de decisiones, aprobaciones y ajustes. |

No deben reutilizarse `tb_operacion_caja`, cierres bancarios ni comisiones financieras como libro de compensaciones.

## 8. Arquitectura funcional objetivo preliminar

El diseño final dependerá del levantamiento, pero la separación mínima esperada es:

1. **Personal laboral:** persona, usuario relacionado, puesto, sede, modalidad y vigencia.
2. **Plan versionado:** reglas aplicables por puesto/sede y fechas de vigencia.
3. **Evento/evidencia:** hecho manual, importado o automático que puede originar un concepto.
4. **Periodo:** mes, estado y fechas de cálculo/aprobación/cierre.
5. **Liquidación:** resumen congelado por trabajador.
6. **Detalle de liquidación:** sueldo, bono, comisión, penalidad o ajuste con fórmula y evidencia.
7. **Aprobación y observación:** decisiones trazables por nivel.
8. **Exportación:** archivo conciliable con la liquidación cerrada.

La interfaz debería agruparse en tres espacios:

- **Configuración:** personal, puestos, planes y reglas.
- **Operación:** evidencias, incidencias, importaciones y revisión.
- **Liquidación:** simulación, aprobación, cierre, historial y reportes.

## 9. Paquete de información requerido del legacy

Para completar el levantamiento sin entregar credenciales se necesita:

1. Nombre o URL base del sistema, sin usuario ni contraseña.
2. Lista de perfiles a los que se tiene acceso.
3. Captura del menú completo y de cada pantalla relacionada con planilla, comisiones, bonos o descuentos.
4. Un video corto recorriendo un periodo cerrado y otro abierto, ocultando datos sensibles.
5. Un Excel/PDF exportado por cada reporte disponible.
6. Un HAR sanitizado de estas acciones: listar, abrir detalle, calcular, guardar borrador, aprobar, cerrar y exportar.
7. Un caso real ya validado por cada tipo de trabajador, con entradas y total esperado.
8. Catálogos visibles de estados, conceptos, puestos, sedes y tipos de incidencia.

## 10. Entregables después de observar el legacy

1. Inventario definitivo de pantallas, rutas, campos y permisos.
2. Diagramas de estados y secuencias de aprobación/cierre.
3. Catálogo de reglas con fórmulas verificadas y ejemplos.
4. Diccionario de datos observado en red/exportaciones.
5. Matriz **Legacy → Sistema nuevo → Decisión**: replicar, mejorar, reemplazar o descartar.
6. Especificación técnica de tablas, funciones RPC, permisos y componentes frontend.
7. Plan de migración de históricos, conciliación y ejecución paralela.
8. Checklist de aceptación con casos comparables entre ambos sistemas.

## 11. Criterio para iniciar construcción

No es necesario descubrir el 100% del legacy para comenzar. Puede iniciarse la base técnica cuando estén confirmados:

- identidad laboral y asignaciones;
- estados del periodo y de la liquidación;
- estructura del detalle calculado;
- permisos y aprobadores;
- al menos un reporte cerrado conciliado;
- reglas de una primera área con casos reales reproducibles.

La recomendación es iniciar con consulta, configuración y simulación. Los descuentos pagables, cierres definitivos y migración histórica deben habilitarse solo después de conciliar un periodo completo contra el legacy.

## 12. Primer levantamiento visual: menú del legacy

El detalle visual y funcional de las cuatro opciones del grupo **Personal** se documenta en `45_levantamiento_legacy_menu_personal.md`.

El detalle parcial del grupo **Operaciones** se documenta en `46_levantamiento_legacy_menu_operaciones.md`. SafetyPay y Tarjetas comerciales quedan cubiertos por los módulos operativos/métricas actuales; Todos los Registros permanece pendiente de observación.

El detalle parcial del grupo **Control** se documenta en `47_levantamiento_legacy_menu_control.md`. Archivo mensual permanece pendiente de definición y las alertas operativas no se duplicarán porque ya son atendidas por Seguimiento de Operaciones.

La matriz madre observada en **Administración** y el análisis de **Reportes** se documentan en `48_levantamiento_legacy_matriz_madre_y_reportes.md`. La pantalla independiente Historial de cambios no se replicará necesariamente, pero la auditoría técnica y funcional continúa siendo obligatoria.

### 12.1 Estructura observada

El menú visible está organizado en cuatro grupos:

| Grupo | Opciones observadas |
|---|---|
| Personal | Asistencia, Sueldos, Colaboradores, Calificaciones |
| Operaciones | Safetypay, Tarjetas comerciales, Referidos, Llamadas, Tarjetas erróneas, Todos los Registros |
| Control | Reportes de penalidad, Auditoría de pagos, Cierre mensual, Archivo mensual, Alertas |
| Sistema | Administración, Historial de cambios, Reportes |

La organización confirma que el legacy no es únicamente una calculadora de sueldos. Combina maestros de personal, fuentes operativas, control/auditoría, liquidación mensual y trazabilidad.

### 12.2 Descarte semántico

Clasificación utilizada:

- **Migrar como núcleo:** pertenece directamente al nuevo dominio de compensaciones.
- **Integrar como evidencia:** necesitamos sus datos o eventos, pero no necesariamente copiar toda la pantalla porque el sistema actual ya posee parte del flujo operativo.
- **Transversal:** configuración, auditoría o salida que debe existir, posiblemente reutilizando patrones actuales.
- **No replicar como módulo independiente:** su valor se cubre mediante otra vista o servicio; solo se conserva la capacidad útil.
- **Pendiente de observar:** el nombre no permite decidir con seguridad.

| Menú legacy | Decisión preliminar | Equivalencia en el sistema nuevo | Motivo y validación pendiente |
|---|---|---|---|
| Asistencia | Migrar como núcleo | Importación del Excel del huellero, asistencia, jornada, tardanzas, ausencias y descansos pagados | Se confirmó que la fuente es un Excel exportado por un sistema biométrico. Falta revisar formato, conciliación, turnos y correcciones. |
| Sueldos | Migrar como núcleo | Preliquidación y liquidación por trabajador/periodo | Es el centro del cálculo. Debe revelar desglose, fórmula, estados y aprobación. |
| Colaboradores | Migrar como núcleo | Personal laboral y asignaciones vigentes | No debe reducirse a `tb_usuario`; debe incluir puesto, sede, modalidad, sueldo/plan y vigencias. |
| Calificaciones | Integrar como evidencia | Métricas de atención y conceptos por calificación | Alimenta atención presencial y colaborador del mes. Confirmar fuente, escala, vínculo con cliente/asesor y antifraude. |
| Safetypay | Integrar como evidencia; no duplicar inicialmente | Operaciones/métricas SafetyPay existentes más referencias de compensación | El sistema actual ya posee flujo SafetyPay. Solo migrar atributos, asignaciones o métricas que hoy falten. Pendiente revisar la pantalla. |
| Tarjetas comerciales | Integrar como evidencia; no duplicar inicialmente | POS/Link Pago y operaciones asistidas existentes | Debe comprobarse si registra actividad laboral adicional o solo operaciones ya disponibles. |
| Referidos | Migrar como núcleo | Registro y atribución auditable de referidos | La base actual no garantiza primer asesor, vigencia ni primera operación elegible. |
| Llamadas | Integrar como evidencia | Eventos importados/integrados por asesor | Alimenta comisión por contacto. Confirmar fuente, llamadas válidas, duplicidad y estados. |
| Tarjetas erróneas | Integrar como evidencia | Incidencia de seguridad/error con responsable y detector | Puede alimentar bonos de detección y penalidades. Confirmar si son tarjetas de terceros, errores operativos o ambos. |
| Todos los Registros | No replicar como dominio independiente | Bandeja unificada de evidencias/eventos | Parece una vista agregada. Conservar filtros y trazabilidad útiles, evitando duplicar datos fuente. |
| Reportes de penalidad | Migrar como núcleo | Incidencias, descargos, aprobación y penalidades | Necesario para evidencia, responsable, detector, estado y revisión dentro de 48 horas. |
| Auditoría de pagos | Migrar/integrar como núcleo de control | Revisión de errores, descuadres y pagos | Relaciona operaciones con bonos/penalidades de Pagos y Facturación. No debe alterar cajas automáticamente. |
| Cierre mensual | Migrar como núcleo | Cálculo, doble aprobación y cierre inmutable del periodo | Debe observarse con especial cuidado: estados, bloqueos, recálculo, reapertura y responsables. |
| Archivo mensual | Migrar como consulta histórica | Periodos cerrados, exportaciones y ajustes | Debe preservar el resultado congelado, no recalcularlo con reglas actuales. |
| Alertas | Integrar como soporte | Notificaciones y pendientes accionables | El contador visible sugiere cola operativa. Confirmar tipos, destinatarios, lectura y vínculo con aprobación. |
| Administración | Transversal | Catálogos, reglas, planes, permisos y parámetros | Es candidato a contener las configuraciones no visibles como menús separados. Requiere inventario interno completo. |
| Historial de cambios | Migrar como transversal obligatorio | Auditoría de cambios y decisiones | Debe registrar autor, fecha, antes/después, motivo y entidad. Revisar alcance real y capacidad de exportación. |
| Reportes | Migrar como salida transversal | Reportes y exportaciones por periodo/persona/sede/concepto | Confirmar reportes disponibles y si coinciden con Sueldos, Archivo mensual o auditoría. |

### 12.3 Resultado del descarte

No se descarta por completo ninguna opción todavía, porque todas guardan relación semántica con compensaciones o su evidencia. Sí se evita replicar como módulos independientes:

1. **Safetypay** y **Tarjetas comerciales**, mientras sus datos puedan obtenerse de los módulos operativos actuales.
2. **Todos los Registros**, que debería convertirse en una bandeja unificada y no en una nueva fuente de datos.
3. **Alertas**, que debería ser una capacidad transversal y no el repositorio principal de incidencias.

Las pantallas prioritarias para el siguiente levantamiento son:

1. **Sueldos**, para descubrir el resultado y desglose real.
2. **Cierre mensual**, para reconstruir el ciclo de estados y aprobaciones.
3. **Colaboradores**, para identificar el modelo laboral usado por el legacy.
4. **Administración**, para encontrar reglas, tarifas, catálogos y parámetros.
5. **Reportes de penalidad**, para comprender evidencia, revisión y aplicación de descuentos.
6. **Referidos**, por ser una regla económica que no está resuelta completamente con los datos actuales.

### 12.4 Capacidades del levantamiento que no aparecen explícitas en el menú

El menú todavía no demuestra dónde se administran estas capacidades:

- puestos operativos y niveles internos del área de Pagos;
- planes y reglas versionadas con vigencia;
- cambios de sede/puesto durante el periodo;
- propuestas de innovación, uniformes e indisciplina;
- chats abandonados, cuotas de Pancake y calificaciones antifraude;
- importaciones de archivos y conciliaciones;
- flujo de observación/descargo durante 48 horas;
- doble aprobación de Facturación y Gerencia;
- ajustes posteriores al cierre;
- metas de sede y distribución de la bolsa;
- vínculo entre evidencia y operación/cliente original.

Estas capacidades pueden estar dentro de Administración, Sueldos, Alertas o Reportes de penalidad. Deben buscarse antes de concluir que no existen.

### 12.5 Siguiente evidencia requerida

Para reducir más el alcance, la próxima captura debe corresponder a **Sueldos** e incluir:

- pantalla completa antes de seleccionar un periodo;
- filtros y listas desplegables abiertos;
- un periodo con información;
- detalle de un trabajador;
- botones, acciones y estados disponibles;
- cualquier opción de cálculo, aprobación, cierre o exportación.

Después se debe repetir el recorrido con **Cierre mensual**. Con esas dos pantallas será posible determinar si Sueldos funciona como consulta, preliquidación o liquidación definitiva y evitar diseñar entidades duplicadas.

### 12.6 Fuente confirmada: Excel del sistema de huellero

Se confirmó que la asistencia del personal se obtiene cargando al legacy un archivo Excel generado por un sistema de huellero. Por tanto, el alcance correcto no es construir un reloj biométrico ni registrar la entrada manual como flujo principal. Se debe migrar el proceso de **carga, validación, conciliación y cálculo** de las marcaciones.

#### Flujo objetivo preliminar

```text
Seleccionar periodo, sede y archivo del huellero
        ↓
Validar formato y detectar si el archivo ya fue cargado
        ↓
Mostrar vista previa de empleados, fechas y marcaciones
        ↓
Conciliar código del huellero con el colaborador del sistema
        ↓
Separar filas válidas, observadas, duplicadas y no identificadas
        ↓
Confirmar importación
        ↓
Calcular asistencia diaria, tardanza y anomalías
        ↓
Revisar/corregir con motivo y aprobación
        ↓
Usar el resultado aprobado como evidencia de la liquidación
```

#### Información que debe conservar cada carga

- archivo original o referencia segura al archivo;
- nombre, tamaño, hash y fecha/hora de carga;
- periodo y sede seleccionados;
- usuario que realizó la carga;
- formato o versión detectada;
- cantidad total de filas;
- filas válidas, duplicadas, observadas y rechazadas;
- estado de la carga: borrador, validada, procesada, observada, anulada o reemplazada;
- relación entre cada fila importada y el colaborador conciliado;
- valores originales de la fila, sin sobrescribirlos después del cálculo;
- motivo, autor y fecha de cualquier corrección o anulación.

#### Validaciones mínimas de importación

1. Extensión y estructura permitida del archivo.
2. Columnas obligatorias y tipo de dato de cada columna.
3. Periodo de las marcaciones compatible con el periodo seleccionado.
4. Código del huellero asociado a un único colaborador vigente.
5. Fecha y hora interpretadas en `America/Lima`.
6. Detección de filas repetidas dentro del archivo y entre cargas.
7. Detección del mismo archivo mediante hash.
8. Marcaciones fuera de rango, incompletas o imposibles.
9. Colaboradores sin asignación, sede, horario o plan vigente.
10. Bloqueo de cargas sobre un periodo cerrado, salvo reapertura autorizada.

Una fila inválida no debe provocar la pérdida silenciosa de todo el archivo. La interfaz debe mostrar un resumen, permitir descargar el detalle de observaciones y exigir confirmación antes de procesar las filas válidas.

#### Reglas que no deben inferirse únicamente del Excel

El archivo prueba marcaciones, pero no define por sí mismo:

- horario o turno esperado del colaborador;
- tolerancia aplicable;
- descanso, feriado, vacaciones, licencia o trabajo remoto;
- permiso de ingreso tardío o salida anticipada;
- ausencia justificada;
- sede/puesto vigente del día;
- aprobación de una corrección;
- monto del bono o penalidad.

Estas condiciones deben provenir de asignaciones, calendarios, horarios y reglas versionadas. El cálculo debe conservar tanto la marcación original como la interpretación aplicada.

#### Casos especiales que se deben probar

- varias entradas y salidas durante el mismo día;
- una sola marcación sin par de salida/entrada;
- turno que cruza medianoche;
- marcación en sede distinta;
- trabajador con cambio de horario o sede durante el mes;
- descanso semanal, feriado, vacaciones o licencia;
- trabajador remoto sin penalidad por minuto;
- archivo corregido o exportado nuevamente por el huellero;
- carga repetida por otro usuario;
- corrección manual después de procesar y antes/después del cierre.

#### Evidencia requerida para cerrar este punto

Se necesita un Excel real anonimizado del huellero y capturas de la pantalla de Asistencia en estos momentos:

1. antes de cargar;
2. con el archivo seleccionado;
3. vista previa o validación;
4. resultado de carga correcta;
5. resultado con errores, si el legacy lo permite;
6. detalle mensual de un trabajador;
7. corrección o anulación de una marcación;
8. exportación final de asistencia.

Del archivo se deben identificar los encabezados exactos, hojas, formato de fecha/hora, código de empleado, sede/dispositivo y forma de representar entrada y salida. No se requiere compartir DNI, nombres completos ni otros datos personales: pueden anonimizarse conservando la estructura.
