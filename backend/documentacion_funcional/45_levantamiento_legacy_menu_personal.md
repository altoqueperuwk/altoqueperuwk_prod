# Levantamiento del legacy — menú Personal

## 1. Objetivo y alcance

Este documento mapea la evidencia visual recibida del grupo **Personal** del sistema legacy:

1. Asistencia.
2. Sueldos.
3. Colaboradores.
4. Calificaciones.

El análisis distingue entre:

- **Observado:** aparece explícitamente en las capturas.
- **Inferido:** interpretación probable que debe comprobarse mediante interacción, exportaciones o solicitudes de red.
- **Pendiente:** dato que no puede determinarse con las imágenes disponibles.

No se toma el diseño visual ni un cálculo aparente como regla definitiva. Las fórmulas y transiciones deben confirmarse con casos reales y con la política aprobada.

## 2. Resumen ejecutivo

Las cuatro opciones del menú Personal sí forman parte del dominio requerido y no deben descartarse. Las imágenes confirman varias decisiones del levantamiento inicial:

- El legacy diferencia al **colaborador laboral** del usuario técnico del sistema.
- La asistencia se importa desde un Excel del huellero y admite correcciones sujetas a aprobación.
- El sueldo combina asistencia, tardanzas, penalidades, horas extra y comisiones.
- El periodo mensual posee al menos un estado visible (`Mes abierto`) y acciones masivas de pago.
- Las calificaciones tienen validación configurable, aprobación individual y un valor monetario.
- El historial, la aprobación y la conservación de resultados mensuales son requisitos centrales, no accesorios.

También aparecen diferencias que deben resolverse antes de replicar fórmulas, especialmente el cálculo visible de minutos de tardanza y la separación del pago en componentes.

## 3. Mapa general del menú Personal

| Opción | Propósito observado | Clasificación | Prioridad de migración |
|---|---|---|---:|
| Asistencia | Importar marcaciones, consolidar jornadas y resolver solicitudes de corrección | Núcleo y fuente del cálculo | 1 |
| Sueldos | Calcular, consultar, descargar y pagar importes mensuales | Núcleo de liquidación | 1 |
| Colaboradores | Mantener ficha laboral, compensación, jornada, cuenta y vínculo con usuario | Maestro laboral | 1 |
| Calificaciones | Validar, aprobar y monetizar evaluaciones de atención | Evidencia y comisión | 2 |

## 4. Asistencia

### 4.1 Hechos observados

La pantalla se denomina **Control de Asistencia** y se describe como un resumen local del Excel de marcajes de toda la empresa.

En el encabezado se observa:

- botón `Actualizar datos`;
- fecha y hora de última actualización;
- archivo local identificado por nombre;
- ejemplo observado: `Total Punches(20260901-20260917).xlsx`;
- fecha/hora de importación;
- horario base visible: `09:00 a 18:00`;
- tolerancia visible: `5 min`.

Existen dos pestañas:

- `Resumen`;
- `Historial (114)`.

### 4.2 Solicitudes pendientes de asistencia

Se observa una bandeja titulada `Solicitudes pendientes de asistencia (3)` con selección múltiple.

Columnas observadas:

| Columna | Contenido visible |
|---|---|
| Fecha | Día que se desea corregir |
| Persona | Nombre y documento |
| Solicitado por | Usuario/persona que originó la solicitud |
| Actual | Entrada y salida actualmente reconocidas |
| Cambio pedido | Nueva entrada/salida y, posiblemente, clasificación solicitada |
| Motivo | Texto o código como `DM` o `JUSTIFICADO` |
| Acciones | Aprobar o rechazar |

Acciones observadas:

- aprobar individualmente;
- rechazar individualmente;
- aprobar seleccionadas;
- eliminar seleccionadas.

La presencia de `Eliminar seleccionadas` debe analizarse. En el sistema nuevo, una solicitud con efecto laboral no debería desaparecer sin auditoría; conviene anularla conservando autor, fecha y motivo.

### 4.3 Indicadores observados

| KPI | Valor de la captura | Significado mostrado |
|---|---:|---|
| Integrantes detectados | 24 | 360 jornadas agrupadas |
| Tardanzas | 33 | Primer marcaje luego de la tolerancia |
| Faltas de salida | 0 | Solo se encontró entrada |
| Faltas de entrada | 10 | Solo se encontró salida |
| Días completos | 321 | Entrada y salida detectadas |

La suma `321 + 10 + 0 = 331` no alcanza las 360 jornadas agrupadas. Existen 29 jornadas con otra clasificación o sin marcación que no se explican en los KPI visibles. Debe identificarse si corresponden a faltas completas, descansos, jornadas futuras, observaciones u otra categoría.

### 4.4 Tabla de asistencia por día

Se observa una tabla `Asistencia por día (360)` con filtros para:

- mes;
- nombre o DNI;
- área;
- personal;
- fecha;
- carga de Excel.

Columnas observadas:

| Columna | Ejemplo/semántica |
|---|---|
| Fecha | 17/09/2026 |
| Persona | Nombre y documento |
| Entrada | 09:22 |
| Estado entrada | Tarde / A tiempo |
| Salida | 18:00 |
| Estado salida | A tiempo |
| Tardanza | 22 min |
| Minutos extra | 0 min |
| Estado del día | Completo |
| Acción | Editar |

### 4.5 Regla de tardanza que debe confirmarse

La pantalla muestra horario base 09:00 y tolerancia de 5 minutos. Sin embargo:

- una entrada 09:04 aparece `A tiempo` con 0 minutos;
- una entrada 09:09 aparece `Tarde` con 9 minutos;
- una entrada 09:22 aparece `Tarde` con 22 minutos.

Esto sugiere que la tolerancia decide si se activa la tardanza, pero, una vez excedida, el legacy contabiliza todos los minutos desde las 09:00 y no solo el exceso posterior a las 09:05.

Esta conducta difiere de una posible interpretación anterior donde 09:09 produciría 4 minutos penalizables. Debe probarse específicamente con 09:05, 09:06 y 09:09 y obtener el resultado monetario antes de fijar la fórmula del nuevo sistema.

### 4.6 Modelo funcional necesario

El módulo nuevo debe separar:

1. archivo y carga del huellero;
2. fila/marcación original;
3. jornada diaria interpretada;
4. horario esperado;
5. incidencia o anomalía;
6. solicitud de corrección;
7. decisión de aprobación/rechazo;
8. resultado usado por la liquidación.

La edición de una jornada no debe modificar ni eliminar las marcaciones originales del archivo.

### 4.7 Evidencia pendiente

- modal y resultado de `Subir Excel`;
- estructura real del archivo;
- contenido de `Historial`;
- formulario `Editar`;
- creación de una solicitud de corrección;
- significado de motivos como `DM`;
- tratamiento de días sin ninguna marcación;
- cálculo de minutos extra;
- horarios distintos, part time, descansos y turnos especiales;
- comportamiento de `Actualizar datos`;
- solicitudes de red de carga, aprobación, rechazo y edición.

## 5. Sueldos

### 5.1 Hechos observados

La pantalla se denomina **Sueldos** y declara explícitamente una separación en dos pagos:

1. sueldo relacionado con asistencia, tardanzas y horas extra;
2. comisiones relacionadas con bonos, calificaciones, referidos y otras variables.

Se observa:

- selector de mes;
- texto `Mes visible: septiembre de 2026`;
- estado `Mes abierto`;
- bloque `Pagos estimados de septiembre de 2026`.

El término **estimados** indica que los importes del mes abierto probablemente son recalculables y no representan aún un cierre inmutable.

### 5.2 Filtros y acciones

Filtros observados:

- nombre o DNI;
- área;
- personal;
- formato de descarga, con `PDF` visible.

Acciones observadas:

- Descargar;
- `Pagar todos los pendientes (25)`;
- `Borrar mes`;
- Actualizar;
- Ver detalle por trabajador.

`Pagar todos los pendientes` y `Borrar mes` son acciones de alto impacto. En la migración deben exigir confirmación, permisos específicos, idempotencia y auditoría. Borrar un periodo con pagos o aprobaciones no debe convertirse en eliminación física.

### 5.3 Tabla observada

| Columna | Significado preliminar |
|---|---|
| Persona | Nombre y documento |
| Cargo | Puesto y jornada/horario |
| Días pagables | Días considerados para sueldo |
| Tardanzas | Cantidad de días/eventos tardíos |
| Penalidades | Importe acumulado |
| Min extra | Horas/minutos adicionales |
| Sueldo | Componente base/devengado |
| Comisiones | Bonos y variables acumuladas |
| Total | Suma neta visible |
| Pago | Estado y tipo/orden de pago |
| Acción | Ver detalle |

Estados o etiquetas observadas:

- `Sueldo pendiente`;
- `Primer sueldo`.

No se debe asumir todavía que `Primer sueldo` significa primera quincena, primer pago del trabajador o pago de sueldo separado de comisiones.

### 5.4 Relaciones numéricas observables

En las filas visibles se cumple aparentemente:

```text
Total = Sueldo + Comisiones
```

Ejemplo: `S/ 1,209.29 + S/ 144.44 = S/ 1,353.73`.

Las penalidades podrían estar ya descontadas dentro de `Sueldo` o aplicarse en el detalle; la tabla no permite afirmarlo. Tampoco puede inferirse la tarifa de horas extra ni la fórmula de días pagables.

### 5.5 Modelo funcional necesario

- periodo mensual y estado;
- cálculo o versión de cálculo;
- liquidación por colaborador;
- componente de sueldo;
- componente de comisiones/bonos;
- penalidades y horas extra desglosadas;
- órdenes o eventos de pago separados;
- detalle explicable por concepto y evidencia;
- cierre y ajustes posteriores.

El total no debe guardarse sin su desglose reproducible. Cada línea debe indicar regla, cantidad/base, tarifa, importe, evidencia y versión aplicada.

### 5.6 Evidencia pendiente

- pantalla `Ver detalle` de un trabajador;
- contenido de `Primer sueldo` y posibles segundo pago/comisiones;
- flujo de pago individual y masivo;
- fórmula de días pagables;
- tratamiento de horas extra;
- estado después de pagar;
- confirmación y efecto de `Borrar mes`;
- PDF u otros formatos descargables;
- comportamiento de meses cerrados;
- cálculo al presionar `Actualizar`;
- solicitudes de red y respuesta completa del listado/detalle.

## 6. Colaboradores

### 6.1 Hechos observados

La pantalla **Colaboradores** se describe como ficha laboral, compensación, jornada y cuentas de depósito por colaborador. El listado observado contiene 24 colaboradores.

Filtros y acciones generales:

- búsqueda por nombre o DNI;
- filtro de área;
- filtro de estado (`Activos` visible);
- filtro de personal;
- Crear usuario;
- Actualizar.

La etiqueta `Crear usuario` requiere validación: podría crear simultáneamente un colaborador laboral y una cuenta del sistema, lo que sería un acoplamiento que conviene separar en el nuevo diseño.

### 6.2 Información contenida en cada ficha

#### Identidad

- nombres y apellidos;
- documento;
- iniciales/avatar;
- cargo y/o área resumidos.

#### Información laboral

- cargo;
- área;
- sede actual;
- usuario del sistema relacionado.

#### Compensación

- sueldo mensual;
- penalidad por minuto tarde;
- bono de puntualidad.

#### Jornada

- tipo de jornada: tiempo completo o part time;
- horario/modalidad part time visible.

#### Cuenta de depósito

- cantidad de cuentas;
- banco;
- número de cuenta visible.

#### Acciones laborales

- registrar renuncia;
- inactivar;
- ver/editar;
- menú adicional de tres puntos.

### 6.3 Hallazgos funcionales

La pantalla confirma que `tb_usuario` no es suficiente como entidad de colaborador. Un colaborador tiene información laboral y económica con vigencia propia, además de una relación opcional con el usuario técnico.

También se observa una regla especial en la ficha de Jefe de Sede:

- cantidad de personal puntual del mes;
- mínimo requerido de 20 días;
- importe por persona, mostrado como S/ 50.00 c/u;
- indicador de si incluye bono de personal puntual.

Esto parece corresponder al bono de liderazgo, pero contradice el importe preliminar de S/ 30 por subordinado descrito en las reglas anteriores. Debe confirmarse si el legacy usa S/ 50, si es configurable o si la pantalla corresponde a otra versión de la política.

### 6.4 Riesgos y decisiones de migración

- No usar DNI como clave primaria interna.
- No guardar el número de cuenta completo sin controles de acceso y enmascaramiento.
- Separar estado del colaborador, estado de usuario y vigencia de asignación.
- Una renuncia no debe borrar liquidaciones ni evidencias históricas.
- Cambios de sueldo, puesto, sede, jornada y tarifa deben tener fecha de vigencia.
- La cuenta usada en un pago cerrado debe quedar congelada o referenciada históricamente.
- Las reglas no deben residir únicamente como columnas editables del colaborador si necesitan versionado por puesto o periodo.

### 6.5 Modelo funcional necesario

- persona/colaborador;
- vínculo opcional con `tb_usuario`;
- asignación laboral con vigencia;
- cargo y área;
- sede y modalidad;
- jornada/horario;
- plan o regla de compensación;
- excepciones individuales versionadas;
- cuentas de depósito protegidas;
- renuncia/inactivación con fecha y motivo;
- historial de cambios.

### 6.6 Evidencia pendiente

- formulario Crear usuario;
- formulario Ver/Editar;
- menú de tres puntos;
- registro de renuncia;
- manejo de más de una cuenta;
- enmascaramiento y permisos sobre cuentas;
- catálogos de cargos, áreas, sedes y jornadas;
- historial de cambios de sueldo/cargo/sede;
- regla completa del bono por personal puntual;
- posibilidad de separar colaborador y usuario de acceso.

## 7. Calificaciones

### 7.1 Hechos observados

La pantalla **Calificaciones** se describe como calificaciones de un formulario conectadas por asesor y sede.

KPI observados:

| KPI | Valor visible |
|---|---:|
| Calificaciones visibles | 1164 |
| Pendientes de aprobación | 237 |
| Aprobadas | 907 |
| Ganancia aprobada | S/ 1,814.00 |

La relación `907 × S/ 2.00 = S/ 1,814.00` coincide exactamente con la ganancia aprobada visible.

### 7.2 Configuración de validez

La pantalla permite elegir qué respuestas deben estar completas para que una calificación de 4 o 5 estrellas pague S/ 2.00.

Opciones observadas:

- DNI obligatorio: activado;
- comentario obligatorio: desactivado;
- asesor obligatorio: desactivado;
- Guardar configuración.

Esta configuración afecta dinero y, por tanto, debe versionarse por vigencia. Cambiarla no debe recalcular silenciosamente calificaciones ya aprobadas o periodos cerrados.

### 7.3 Analítica observada

- ranking por calificaciones aprobadas y asesor;
- gráfico de distribución de estrellas;
- conteos visibles de 1 a 5 estrellas;
- predominio de respuestas de 5 estrellas.

El ranking muestra cantidad, no necesariamente personas únicas ni porcentaje de aprobación. Debe comprobarse cómo evita respuestas repetidas o manipuladas.

### 7.4 Tabla de calificaciones

Filtros observados:

- asesor, DNI o comentario;
- equipo;
- estrellas;
- estado;
- rango (`Todo tiempo` visible);
- mes;
- Actualizar.

Columnas observadas:

| Columna | Contenido |
|---|---|
| Fecha | Fecha y hora de respuesta |
| Asesor | Nombre e identificador/hoja |
| Sede | Sede atribuida |
| Estrellas | Valor de 1 a 5 |
| DNI | Documento informado |
| Comentario | Texto de respuesta |
| Estado | Pendiente u otro estado |
| Ganancia | S/ 0.00 mientras está pendiente |
| Acciones | Editar, aprobar, rechazar |

### 7.5 Reglas preliminares confirmadas visualmente

- Solo 4 o 5 estrellas pueden pagar el concepto mostrado.
- El importe unitario visible es S/ 2.00.
- La ganancia se reconoce después de aprobar, no solo por recibir la respuesta.
- Existen condiciones configurables de validez.
- La calificación se atribuye a asesor y sede.

Todavía no se observa la relación con una operación elegible. La política preliminar exige que la atención corresponda a efectivizaciones generales de 1%/2% o pago de deuda y excluya tasas preferenciales/comunidades. La pantalla podría estar pagando únicamente por estrellas sin verificar esas condiciones; esto debe analizarse antes de replicarlo.

### 7.6 Riesgos y controles necesarios

- respuestas duplicadas por DNI, operación o enlace;
- autocalificación o identidad falsa;
- edición del asesor antes de aprobar;
- cambios de configuración retroactivos;
- aprobación por el mismo beneficiario;
- DNI inexistente o sin operación elegible;
- múltiples calificaciones sobre una misma atención;
- rechazo sin motivo;
- exposición innecesaria de documentos y comentarios.

### 7.7 Modelo funcional necesario

- respuesta original e identificador externo;
- fecha, estrellas, comentario y DNI informado;
- asesor/sede atribuidos y forma de atribución;
- operación/cliente/atención relacionada cuando exista;
- resultado de validación y reglas aplicadas;
- estado de revisión;
- aprobador/rechazador, fecha y motivo;
- importe congelado al aprobar;
- referencia a la liquidación donde fue pagada.

### 7.8 Evidencia pendiente

- origen y estructura del formulario;
- vínculo o código usado para identificar al asesor;
- pantalla Editar;
- confirmación de Aprobar/Rechazar;
- motivo de rechazo;
- reglas de duplicidad y antifraude;
- vínculo con cliente y operación;
- efecto de cambiar la configuración;
- tratamiento de una aprobación en un mes cerrado;
- solicitudes de red del listado, configuración y aprobación.

## 8. Relaciones entre las cuatro pantallas

```text
Colaborador + asignación + jornada
                 ↓
       Excel del huellero
                 ↓
 Asistencia diaria y correcciones aprobadas
                 ↓
 Sueldo devengado + tardanzas + horas extra
                 ↓
          Liquidación mensual

Formulario de calificación
                 ↓
 Validación + aprobación + importe unitario
                 ↓
      Comisiones de la liquidación
```

La liquidación debe usar snapshots o referencias inmutables. Si luego cambia el sueldo del colaborador, la tolerancia o los requisitos de una calificación, un periodo cerrado no debe alterarse.

## 9. Entidades preliminares derivadas de las imágenes

Los nombres son conceptuales; todavía no constituyen nombres definitivos de tablas.

| Entidad | Responsabilidad |
|---|---|
| Colaborador | Identidad laboral independiente del usuario técnico |
| Asignación laboral | Cargo, área, sede, modalidad y vigencia |
| Jornada/horario | Horas esperadas, tolerancia y calendario aplicable |
| Cuenta de depósito | Cuenta protegida y vigencia por colaborador |
| Carga de asistencia | Archivo, hash, periodo, estado y resumen |
| Marcación importada | Dato original del huellero |
| Asistencia diaria | Interpretación de marcaciones y anomalías |
| Solicitud de corrección | Cambio pedido, motivo, solicitante y estado |
| Calificación | Respuesta original y atribución |
| Regla de validez | Requisitos versionados de aprobación/pago |
| Revisión de calificación | Decisión, aprobador, motivo e importe |
| Periodo de liquidación | Mes y ciclo de estados |
| Liquidación de colaborador | Resumen de sueldo, comisiones y total |
| Detalle de liquidación | Conceptos con regla, evidencia e importe |
| Pago de liquidación | Componente, estado, fecha y responsable |

## 10. Discrepancias y preguntas abiertas prioritarias

| Tema | Evidencia legacy | Definición previa | Acción requerida |
|---|---|---|---|
| Minutos de tardanza | 09:09 muestra 9 minutos con tolerancia de 5 | Podría interpretarse como 4 minutos después de tolerancia | Probar horas límite y revisar detalle monetario |
| Bono de liderazgo | Ficha de Jefe muestra S/ 50 por personal puntual | Documento preliminar indica S/ 30 por subordinado | Revisar configuración y política vigente |
| Calificación pagable | Pantalla indica 4–5 estrellas y S/ 2 | Además exige operación elegible y exclusiones | Verificar si legacy enlaza operación o aplica una regla incompleta |
| Dos pagos | Sueldos declara separación en dos pagos | Se había modelado una liquidación mensual general | Determinar si son dos órdenes de pago dentro de una liquidación |
| Primer sueldo | Badge visible en todas las filas mostradas | No estaba definido | Abrir detalle y ejecutar/observar flujo de pago |
| Borrar mes | Acción disponible en mes abierto | Los periodos deben conservar trazabilidad | Confirmar si elimina, reinicia cálculo o anula el periodo |
| Cuenta bancaria | Número completo visible en la ficha | Requiere protección de datos | Revisar permisos y aplicar enmascaramiento en el nuevo sistema |

## 11. Orden recomendado para continuar el levantamiento

1. Abrir `Ver detalle` en Sueldos para obtener la fórmula completa.
2. Abrir `Editar` en Asistencia y revisar una solicitud pendiente.
3. Abrir `Historial` de Asistencia.
4. Revisar `Ver/Editar` de Colaboradores y sus catálogos.
5. Abrir una calificación y observar aprobación/rechazo.
6. Capturar los diálogos de acciones masivas y destructivas.
7. Descargar un PDF de Sueldos y compararlo con pantalla.
8. Capturar `Fetch/XHR` sanitizado de listados y detalles.

Con estas evidencias será posible convertir este mapa visual en contratos de datos y reglas verificadas para la especificación técnica.
