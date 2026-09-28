# Plan de trabajo integrado — Compensaciones y Desempeño Operativo

## 1. Objetivo

Este documento convierte el levantamiento funcional del legacy en un plan de
construcción compatible con la arquitectura actual de Al Toque Perú. El objetivo
no es copiar pantalla por pantalla, sino implementar un módulo de compensaciones
auditable en el que cada opción comparta datos, estados y reglas con las demás.

La cadena funcional objetivo es:

```text
Configuración versionada
        ↓
Colaborador + asignación laboral + cuenta de pago
        ↓
Asistencia + evidencias + incidencias + operaciones atribuibles
        ↓
Preliquidación explicable
        ↓
Revisión y aprobación
        ↓
Registro de pagos
        ↓
Cierre mensual inmutable
        ↓
Reportes y auditoría
```

Este documento conserva el plan integral. La implementación backend ya inició
en los scripts `17` al `22`; las rutas y pantallas del módulo todavía no se han
construido.

## 2. Fuentes usadas

El plan consolida:

- `39_sistema_compensaciones_bonos_penalidades.md`;
- `44_levantamiento_legacy_compensaciones.md`;
- `45_levantamiento_legacy_menu_personal.md`;
- `46_levantamiento_legacy_menu_operaciones.md`;
- `47_levantamiento_legacy_menu_control.md`;
- `48_levantamiento_legacy_matriz_madre_y_reportes.md`;
- la estructura vigente de rutas, servicios, permisos y RPC del repositorio;
- las tablas actuales `tb_usuario`, `tb_rol`, `tb_sucursal`, `tb_cliente` y
  `tb_operacion_proceso`.

Cuando exista una diferencia entre una cifra visible del legacy y una regla de
negocio declarada, la cifra se conserva como evidencia, pero no se convierte en
regla productiva hasta ser conciliada.

## 3. Alcance decidido

### 3.1 Incluido

- colaboradores, cargos, sedes, jornadas y cuentas de depósito;
- parámetros y reglas monetarias con vigencia;
- excepciones individuales justificadas;
- importación de asistencia desde Excel del huellero;
- solicitudes de corrección de asistencia;
- calificaciones, llamadas, tarjetas de tercero y referidos como evidencias;
- reportes de penalidad e incidencias de auditoría de pagos;
- preliquidación mensual, desglose de sueldo, bonos, comisiones y descuentos;
- aprobaciones, estados de pago, cierre mensual y ajustes posteriores;
- reportes financieros y de productividad;
- trazabilidad de cambios y snapshots históricos.

### 3.2 Fuera de alcance o reutilizado

| Opción legacy | Decisión |
|---|---|
| Reporte de SafetyPay | No se replica. Se reutilizan las operaciones y métricas del sistema actual como fuente de evidencia. |
| Reporte de Tarjetas comerciales | No se replica. Las reglas financieras/comerciales permanecen en Operaciones y su refinamiento actual. |
| Todos los Registros | Pendiente de evidencia. Si solo agrega eventos, se resolverá con la bandeja unificada de evidencias. |
| Archivo mensual | Pendiente de conocer el formato y propósito del JSON/Excel. No bloquea el cierre mediante snapshot propio. |
| Alertas | No se duplica; el seguimiento operativo vigente sigue siendo su propietario. |
| Historial de cambios como pantalla inicial | No es prioritario, pero la auditoría sí es obligatoria desde la primera tabla. Se podrá exponer luego como vista global. |
| Pago bancario automatizado | Fuera de la primera versión. Se registra el pago realizado externamente. |

**Distinción obligatoria:** `Tarjetas comerciales` es un producto/flujo
operativo y queda fuera del módulo. `Tarjeta de tercero`, mostrada en el legacy
como `Tarjetas erróneas`, es una evidencia laboral que puede originar un bono y
sí se incluye. No deben compartir concepto, configuración ni reporte.

### 3.3 Límites de integración

- Compensaciones no insertará ni modificará movimientos de caja, saldos, KPI ni
  cierres operativos.
- Las operaciones solo se consultarán como evidencia y se congelarán mediante su
  identificador y los valores usados para calcular.
- Una modificación de una regla nunca debe recalcular un periodo cerrado.
- No se utilizará `tb_rol` como cargo laboral. Un rol controla acceso; un cargo
  controla condiciones de trabajo y compensación.
- Un colaborador podrá existir sin cuenta de acceso. Su vínculo con `tb_usuario`
  será opcional y único cuando necesite iniciar sesión.

## 4. Encaje con el sistema actual

### 4.1 Backend

El backend vigente expone funciones PostgreSQL mediante `supabase.rpc`. El nuevo
módulo debe conservar ese patrón:

- funciones `f_get_*` para consultas paginadas y detalles;
- funciones transaccionales `f_post_*`, `f_patch_*`, `f_put_*` para comandos;
- validación de `auth.uid()` y del actor de negocio dentro del backend;
- respuestas JSONB coherentes con los servicios actuales;
- tablas históricas o bitácora equivalente para cambios sensibles;
- `REVOKE` y `GRANT` explícitos para funciones con impacto económico.

La autorización no puede depender solamente de que una ruta sea visible en el
sidebar. Cada RPC de alta, aprobación, cálculo, pago y cierre debe validar actor,
permiso, sede y estado del periodo.

### 4.2 Frontend

El frontend registra rutas explícitas en `src/main.tsx` y obtiene el árbol de
navegación desde `tb_permiso_menu`. Por cada nueva opción se requiere:

1. página y componentes en `src/features/compensaciones/`;
2. servicio en `src/services/`;
3. tipos y esquemas de validación del dominio;
4. ruta explícita en `src/main.tsx`;
5. recurso hoja en `tb_permiso_menu`;
6. icono reconocido por `sidebar-navigation.tsx`;
7. permiso asignable en `tb_permiso_usuario`;
8. validación backend del mismo recurso o capacidad.

Los CRUD administrativos deben reutilizar `FilterBar`, `DataTable`, Popup e
HistoryDrawer. Las pantallas transaccionales de asistencia, evidencias,
liquidación y cierre pueden tener componentes propios, conservando los tokens
semánticos y componentes de Untitled UI React.

### 4.3 Datos existentes que se referencian

| Fuente actual | Uso en compensaciones | Tratamiento |
|---|---|---|
| `tb_usuario` | Acceso, actor que registra/revisa y vínculo opcional del colaborador | Referencia, sin convertirlo en ficha laboral |
| `tb_sucursal` | Alcance territorial, metas y asignaciones | Fuente maestra de sedes |
| `tb_cliente` | Atribución de registro y referido | Solo lectura y snapshot del dato relevante |
| `tb_operacion_proceso` | Efectivización, responsable, fechas, estado e importes | Solo lectura; excluir anuladas/eliminadas según regla aprobada |
| permisos y navegación | Visibilidad de pantallas | Se amplía con nuevas hojas; no reemplaza seguridad RPC |
| Seguimiento de operaciones | Alertas operativas | Se mantiene como módulo propietario |

## 5. Menú objetivo y opciones

Se propone un grupo de primer nivel **Compensaciones**, sin reproducir la
separación artificial Personal/Operaciones/Control/Sistema del legacy.

| Orden | Ruta propuesta | Pantalla | Responsabilidad |
|---:|---|---|---|
| 1 | `/compensaciones/resumen` | Resumen | Pendientes, periodo activo, totales y accesos rápidos según perfil |
| 2 | `/compensaciones/colaboradores` | Colaboradores | Ficha laboral, asignaciones, jornada, salario y cuentas de depósito |
| 3 | `/compensaciones/asistencia` | Asistencia | Cargas Excel, jornadas calculadas y solicitudes de corrección |
| 4 | `/compensaciones/evidencias` | Evidencias | Calificaciones, llamadas, tarjetas de tercero y referidos |
| 5 | `/compensaciones/incidencias` | Incidencias | Penalidades entre sedes y auditoría de pagos |
| 6 | `/compensaciones/liquidaciones` | Liquidaciones | Preliquidación, detalle, observaciones, aprobaciones y pagos |
| 7 | `/compensaciones/cierres` | Cierres | Validaciones, snapshot, cierre, reapertura excepcional y ajustes |
| 8 | `/compensaciones/configuracion` | Configuración | Matriz madre versionada, conceptos, cargos, metas y penalidades |
| 9 | `/compensaciones/reportes` | Reportes | Exportaciones financieras, productividad y conciliación |

La pantalla Resumen debe componerse desde los mismos contratos de consulta de
las otras opciones; no tendrá tablas paralelas ni fórmulas propias.

### 5.1 Correspondencia completa con el menú legacy

| Opción legacy | Destino objetivo | Tratamiento |
|---|---|---|
| Asistencia | Asistencia | Importación del huellero, jornadas y solicitudes |
| Sueldos | Liquidaciones | Resumen mensual, detalle y estados de pago |
| Colaboradores | Colaboradores | Ficha laboral, asignaciones y cuentas |
| Calificaciones | Evidencias / Calificaciones | Configuración de validez, revisión y bono |
| SafetyPay | Sistema operativo actual | No se replica como reporte de compensaciones |
| Tarjetas comerciales | Sistema operativo actual | No se replica como reporte de compensaciones |
| Referidos | Evidencias / Referidos | Atribución y operaciones efectivizadas elegibles |
| Llamadas | Evidencias / Llamadas | Evidencia, aprobación y bono fijo |
| Tarjetas erróneas | Evidencias / Tarjetas de tercero | Evidencia de detección y bono fijo |
| Todos los Registros | Pendiente / posible Evidencias | Solo se crea si aporta una capacidad distinta |
| Reportes de penalidad | Incidencias / Penalidades | Flujo entre sedes y efecto económico aprobado |
| Auditoría de pagos | Incidencias / Auditoría | Bono y penalidad atómicos |
| Cierre mensual | Cierres | Prevalidación y snapshot inmutable |
| Archivo mensual | Pendiente | Su formato se evaluará sin bloquear el snapshot propio |
| Alertas | Seguimiento actual | No se duplica |
| Administración | Configuración | Matriz madre normalizada y versionada |
| Historial de cambios | Historial por ficha / auditoría | Se conserva el dato; pantalla global posterior |
| Reportes | Reportes | Finanzas, productividad, conciliación y exportación |

## 6. Cómo conversan las opciones

### 6.1 Colaboradores y Configuración

- Configuración define cargos, conceptos, planes, versiones y valores por
  defecto.
- Colaboradores asigna cargo, sede, jornada y plan por un rango de vigencia.
- Una excepción individual prevalece sobre el valor del cargo solo durante su
  vigencia y debe conservar motivo y aprobador.
- Cambiar de cargo a mitad de mes genera dos tramos; no sobrescribe el tramo
  anterior.

### 6.2 Asistencia y Liquidaciones

- Cada carga Excel conserva archivo, hash, rango, usuario, fecha y resultado.
- Las marcaciones crudas no se editan.
- Las jornadas derivadas pueden corregirse mediante solicitud aprobada.
- La liquidación consume jornadas aprobadas/consolidadas para días pagables,
  tardanzas, faltas, extras y bono de puntualidad.
- Reprocesar una carga no puede duplicar jornadas ni conceptos.

### 6.3 Evidencias y Liquidaciones

- Calificación, llamada, tarjeta de tercero y referido usan una cabecera común de
  evidencia y un flujo común de revisión.
- Cada tipo guarda sus campos específicos y referencia opcional a cliente u
  operación.
- La aprobación congela la regla, base, cantidad e importe aplicable.
- El motor solo incorpora evidencias aprobadas y no consumidas por otra línea del
  mismo periodo.

### 6.4 Incidencias y Liquidaciones

- Un reporte de penalidad aprobado produce un concepto negativo para el
  responsable.
- Una auditoría de pago aprobada puede producir atómicamente un bono al reportante
  y una penalidad al responsable.
- Ambas líneas comparten un identificador de origen para evitar aprobar una mitad
  sin la otra o duplicar el efecto.
- Rechazos y anulaciones conservan motivo; no se elimina evidencia económica.

### 6.5 Liquidaciones, pagos y Cierres

- La preliquidación puede recalcularse mientras el periodo esté abierto y deja una
  versión de cálculo.
- La aprobación congela el detalle que será pagado.
- Sueldo y comisiones pueden registrar estados de pago separados si la operación
  real lo requiere.
- El cierre genera un snapshot final. Una corrección posterior se registra como
  ajuste en un periodo abierto, salvo reapertura extraordinaria autorizada.

### 6.6 Reportes

- Los reportes leen snapshots y líneas de liquidación, no recalculan reglas.
- La productividad operativa se consulta desde fuentes actuales, con definiciones
  explícitas, y se relaciona con colaborador/sede.
- Todo total agregado debe poder abrirse hasta sus líneas y evidencias.

## 7. Modelo de datos propuesto

Los nombres son de trabajo y deberán validarse al redactar los SQL.

### 7.1 Personal y configuración

| Tabla propuesta | Responsabilidad |
|---|---|
| `tb_compensacion_colaborador` | Identidad laboral y vínculo opcional único con `tb_usuario` |
| `tb_compensacion_cargo` | Catálogo de cargos separado de roles técnicos |
| `tb_compensacion_asignacion` | Cargo, sede, jornada, modalidad y plan con vigencia |
| `tb_compensacion_cuenta_pago` | Banco, tipo, cuenta/CCI enmascarable, vigencia y estado |
| `tb_compensacion_concepto` | Sueldo, bono, comisión, penalidad, descuento o informativo |
| `tb_compensacion_plan` | Agrupador de política aplicable |
| `tb_compensacion_plan_version` | Versión y vigencia inmutable al ser utilizada |
| `tb_compensacion_regla` | Monto, porcentaje, unidad, umbral, tope y condición por concepto |
| `tb_compensacion_meta_sede` | Indicador y meta por sede/periodo |
| `tb_compensacion_excepcion` | Sobrescritura individual con vigencia, motivo y aprobación |
| `tb_compensacion_acceso` | Capacidades por recurso y alcance propio, sede o global |

### 7.2 Asistencia

| Tabla propuesta | Responsabilidad |
|---|---|
| `tb_asistencia_carga` | Archivo, hash, periodo, estado y resumen de importación |
| `tb_asistencia_marcacion` | Registro crudo e inmutable del huellero |
| `tb_asistencia_jornada` | Entrada, salida, tardanza, extras y estado del día derivados |
| `tb_asistencia_solicitud` | Cambio solicitado, motivo, evidencia y decisión |

### 7.3 Evidencias e incidencias

| Tabla propuesta | Responsabilidad |
|---|---|
| `tb_compensacion_evento` | Cabecera común: tipo, beneficiario/responsable, sede, fecha y estado |
| `tb_compensacion_evento_revision` | Decisiones, motivos y secuencia de aprobación |
| `tb_compensacion_evento_referencia` | Referencia tipada a cliente, operación o fuente externa |
| `tb_compensacion_referido` | Atribución única del cliente referido |
| `tb_compensacion_referido_operacion` | Operaciones elegibles, base, tasa y comisión congeladas |
| `tb_compensacion_penalidad_tipo` | Catálogo versionado de incidencias y monto de referencia |

### 7.4 Periodos, cálculo y pago

| Tabla propuesta | Responsabilidad |
|---|---|
| `tb_compensacion_periodo` | Mes, zona horaria, estado y versión de cierre |
| `tb_compensacion_liquidacion` | Cabecera por colaborador y periodo |
| `tb_compensacion_liquidacion_tramo` | Segmento por asignación y versión de plan cuando hay cambios dentro del mes |
| `tb_compensacion_liquidacion_detalle` | Concepto, origen, regla, base, cantidad e importe |
| `tb_compensacion_aprobacion` | Etapa, actor, decisión, fecha y observación |
| `tb_compensacion_pago` | Componente pagado, monto, fecha, referencia y responsable |
| `tb_compensacion_ajuste` | Diferencia posterior ligada al periodo y línea original |
| `tb_compensacion_cierre` | Snapshot, totales, hash y responsables del cierre |

Todas las tablas económicas deben tener identificador de usuario registrador,
fechas con zona horaria, estado y auditoría. Las cuentas bancarias requieren
enmascaramiento en consultas generales y acceso restringido al valor completo.

## 8. Estados y transiciones

### 8.1 Evidencia o incidencia

```text
Borrador → Pendiente → Aprobada
                    └→ Rechazada
Aprobada → Anulada mediante acción autorizada y motivo
```

Una evidencia incorporada a una liquidación aprobada no se edita; se revierte
mediante línea compensatoria.

### 8.2 Periodo y liquidación

```text
Periodo: Abierto → En cálculo → En revisión → Aprobado → Cerrado
                                      └→ Observado → En cálculo

Liquidación: Borrador → Calculada → Observada/Aprobada → Pagada parcial/total
```

Se recomienda distinguir:

- **aprobación de cálculo**, que congela importes;
- **pago**, que registra cumplimiento financiero;
- **cierre mensual**, que congela el conjunto del mes.

Esto evita replicar sin análisis la restricción del legacy que parece exigir
marcar pagos antes de cerrar. La política final podrá exigir pagos completos o
permitir cerrar con cuentas por pagar claramente identificadas.

## 9. Seguridad y perfiles

| Capacidad | Colaborador | Jefe de sede | Facturación/Auditoría | Pagos | Administrador | Aprobador final |
|---|---:|---:|---:|---:|---:|---:|
| Ver su información | Sí | Sí | Según alcance | Según alcance | Sí | Sí |
| Ver equipo de sede | No | Sí | Según proceso | Según proceso | Sí | Sí |
| Importar asistencia | No | Configurable | Sí | No | Sí | No |
| Solicitar corrección | Sí | Sí | Sí | No | Sí | No |
| Aprobar evidencia | No propia | Sede | Según tipo | Según tipo | Sí | Configurable |
| Administrar reglas | No | No | Consulta | Consulta | Sí | Consulta/aprobación |
| Calcular liquidación | No | No | Sí | Sí | Sí | No |
| Registrar pago | No | No | No | Sí | Sí | No |
| Cerrar/reabrir | No | No | Participa | Participa | Emergencia | Sí |

La tabla representa **capacidades funcionales**, no nuevos valores fijos de
`tb_rol`. La asignación concreta se realizará con los recursos de menú y permisos
vigentes; si luego se necesitan roles adicionales, se crearán sin codificar IDs
en frontend o funciones.

Reglas obligatorias:

- impedir autoaprobación cuando exista impacto monetario;
- filtrar por sede en backend, no solo en frontend;
- separar permiso de lectura, registro, revisión, pago, cierre y configuración;
- solicitar motivo en rechazo, anulación, reapertura y ajuste;
- limitar datos bancarios y remuneraciones a perfiles autorizados.

## 10. Contratos backend por capacidad

No se debe crear una función distinta por cada tarjeta KPI. Las consultas deben
entregar modelos completos y paginados para evitar fórmulas duplicadas en React.

| Capacidad | Contratos mínimos |
|---|---|
| Colaboradores | lista/detalle, guardar ficha, asignar cargo/sede/plan, cuentas, historial |
| Configuración | matriz vigente por fecha, crear versión, validar/publicar versión, catálogos |
| Asistencia | registrar carga, validar/previsualizar, confirmar, listar jornadas, resolver solicitud |
| Evidencias | bandeja unificada, detalle, registrar, revisar, anular, asociar operación |
| Incidencias | listar por bandeja, registrar reporte, responder, aprobar auditoría atómica |
| Liquidaciones | abrir periodo, simular, calcular, obtener detalle, observar, aprobar |
| Pagos | registrar pago por componente, revertir con autorización, obtener pendientes |
| Cierres | prevalidar, cerrar transaccionalmente, consultar snapshot, reapertura excepcional |
| Reportes | resumen mensual, detalle por sede/colaborador/concepto, productividad y exportación |

Cada comando debe ser idempotente cuando pueda repetirse por reintento de red.
Las cargas, cálculos, aprobaciones y cierres deben aceptar o generar una clave de
correlación.

## 11. Organización técnica propuesta

### 11.1 SQL

Crear archivos nuevos, sin mezclar tablas de compensaciones con scripts de
Operaciones:

1. `17.compensaciones_personal_configuracion.sql`
2. `18.compensaciones_asistencia_evidencias.sql`
3. `19.compensaciones_liquidaciones_cierres_reportes.sql`
4. `20.compensaciones_seguridad_personal_funciones.sql`
5. `21.compensaciones_asignaciones_cuentas_funciones.sql`
6. `22.compensaciones_matriz_funciones.sql`
7. `23.compensaciones_metas_excepciones_penalidades_funciones.sql`
8. `24.compensaciones_periodos_funciones.sql`
9. `25.compensaciones_asistencia_importacion_funciones.sql`
10. `26.compensaciones_asistencia_correcciones_funciones.sql`

Cada archivo debe contener primero sus tablas y evoluciones, luego funciones y
permisos, y al final la consulta generadora de `DROP FUNCTION` exigida por las
convenciones del repositorio. Los scripts de tablas se mantienen separados de
los contratos RPC cuando la responsabilidad lo justifica; todo script funcional
debe conservar su bloque generador de `DROP FUNCTION`. El índice
`backend/backend_implementacion/00.indice_backend_implementacion.md` deberá
actualizarse en la misma entrega.

### 11.2 Frontend

```text
src/features/compensaciones/
  resumen/
  colaboradores/
  asistencia/
  evidencias/
  incidencias/
  liquidaciones/
  cierres/
  configuracion/
  reportes/
  components/
  hooks/
  types/

src/services/
  compensacion-colaborador.service.ts
  compensacion-configuracion.service.ts
  compensacion-asistencia.service.ts
  compensacion-evidencia.service.ts
  compensacion-liquidacion.service.ts
  compensacion-reporte.service.ts
```

No se recomienda un único `compensaciones.service.ts`: separarlo por capacidad
reduce acoplamiento y permite desplegar por etapas.

## 12. Plan de construcción por entregas

Cada entrega termina en una capacidad verificable y no solo en tablas o UI.

### Entrega 0 — Cerrar decisiones que afectan fórmulas

**Trabajo**

- acordar glosario de sueldo, bono, comisión, penalidad, descuento, referido,
  operación, sede y colaborador;
- confirmar tardanza desde hora pactada o después de tolerancia;
- decidir si el referido paga una sola operación o múltiples efectivizaciones;
- conciliar el total de comisiones observado: S/ 3,589.10 frente a S/ 4,637.80;
- definir si el cierre exige pagos completos o admite cuentas por pagar;
- evitar doble beneficio en penalidad/auditoría de pagos;
- confirmar los importes del catálogo de penalidades y sus cargos aplicables.

**Aceptación**

- ejemplos manuales firmados para al menos un colaborador de Atención al Cliente,
  Jefe de sede, Facturación y Pagos;
- fórmula y fuente de cada línea identificadas;
- las decisiones quedan versionadas, no como constantes de código.

**Verificación**

- recalcular manualmente dos meses de muestra y explicar cada diferencia con el
  legacy.

### Entrega 1 — Fundación, permisos y periodos

**Trabajo**

- crear catálogos base, periodo y estados;
- crear el grupo de menú y hojas desactivadas o restringidas;
- implementar validación reutilizable de actor, permiso y sede;
- crear pruebas SQL de acceso permitido/denegado;
- preparar feature flags o permisos para liberar pantallas gradualmente.

**Aceptación**

- un administrador ve las rutas asignadas;
- un usuario sin permiso recibe denegación tanto en router como en RPC;
- un jefe no consulta otra sede mediante llamada directa.

**Verificación**

- pruebas de navegación y RPC con administrador, jefe de sede y colaborador.

### Entrega 2 — Colaboradores y matriz madre

**Trabajo**

- implementar ficha laboral, cargos, asignaciones y cuentas;
- crear conceptos, planes, versiones, reglas, metas y excepciones;
- migrar los valores conocidos del legacy como una versión inicial en borrador;
- implementar vigencias y tramos por cambio de cargo/sede;
- mostrar historial por ficha.

**Aceptación**

- un colaborador sin usuario puede ser liquidado;
- cambiar el valor por cargo no altera una excepción individual ni meses cerrados;
- no existen asignaciones laborales solapadas inválidas;
- los datos bancarios se muestran enmascarados fuera de perfiles autorizados.

**Verificación**

- casos de alta, renuncia, cambio de cargo, traslado de sede y salario personalizado.

### Entrega 3 — Importación y control de asistencia

**Trabajo**

- definir plantilla/mapeo del Excel real del huellero;
- cargar a staging, validar y previsualizar antes de confirmar;
- deduplicar por hash y por clave de marcación;
- calcular jornadas, tardanzas, faltas y extras con jornada vigente;
- implementar solicitud, aprobación y rechazo de correcciones.

**Aceptación**

- reimportar el mismo archivo no duplica datos;
- una fila inválida informa hoja, fila y motivo;
- la corrección no modifica la marcación original;
- el resumen concilia con el número de jornadas visibles.

**Verificación**

- archivos con duplicados, DNI desconocido, turno nocturno, una sola marcación,
  vacaciones/descanso y cambio de horario.

### Entrega 4 — Bandeja común de evidencias

**Trabajo**

- implementar evento y revisión comunes;
- habilitar pestañas Calificaciones, Llamadas, Tarjetas de tercero y Referidos;
- asociar cliente/operación existente cuando aplique;
- congelar tasa/base/importe al aprobar;
- reemplazar eliminación por anulación auditada.

**Aceptación**

- no hay autoaprobación monetaria;
- la misma evidencia no se aprueba ni paga dos veces;
- el referido no acepta una operación incompatible o eliminada;
- SafetyPay y Tarjetas comerciales no generan pantallas de reporte duplicadas.

**Verificación**

- aprobar, rechazar, anular y reintentar cada tipo; probar referencia inválida y
  duplicada.

### Entrega 5 — Incidencias cruzadas y auditoría de pagos

**Trabajo**

- construir bandejas recibidos/enviados/historial;
- aplicar catálogo versionado de penalidades;
- implementar el efecto doble de auditoría en una sola transacción;
- controlar sede responsable, reportante, revisor y conflicto de interés.

**Aceptación**

- una aprobación produce exactamente las líneas económicas esperadas;
- si falla una línea, no se crea la otra;
- rechazo y anulación conservan motivo y valores originales.

**Verificación**

- pruebas concurrentes de doble aprobación y escenarios entre sedes.

### Entrega 6 — Motor de preliquidación

**Trabajo**

- calcular sueldo prorrateado, asistencia, bonos, comisiones y descuentos;
- consumir reglas por fecha efectiva y asignaciones por tramo;
- producir detalle con origen, fórmula, base, cantidad, tarifa e importe;
- soportar simulación y cálculo persistido versionado;
- detectar pendientes que impiden aprobación.

**Aceptación**

- ejecutar dos veces con la misma entrada produce el mismo resultado;
- cada sol del total se rastrea a una regla y evidencia;
- el total es suma exacta del detalle y separa sueldo, bonos, comisiones y
  descuentos;
- no se crean movimientos de caja.

**Verificación**

- golden tests con los ejemplos de Entrega 0 y comparación colaborador por
  colaborador contra el mes legacy.

### Entrega 7 — Revisión, aprobación y pagos

**Trabajo**

- implementar observaciones y recálculo controlado;
- configurar etapas de aprobación;
- registrar sueldo y comisiones pagados por separado cuando corresponda;
- soportar reversa autorizada y saldo pendiente;
- exportar archivo de apoyo al pago sin automatizar banca.

**Aceptación**

- no se paga una liquidación no aprobada;
- la suma de pagos no excede el importe aprobado salvo ajuste explícito;
- cada pago tiene referencia, fecha y responsable;
- una observación devuelve el cálculo sin borrar versiones anteriores.

**Verificación**

- pago parcial, pago total, referencia duplicada, reversa y reintento.

### Entrega 8 — Cierre mensual y ajustes

**Trabajo**

- implementar prevalidación de cierre;
- definir y aplicar la política sobre pendientes/pagos;
- generar snapshot y hash de integridad en una transacción;
- bloquear edición y recálculo del periodo cerrado;
- habilitar ajuste posterior y reapertura solo para perfil extraordinario.

**Aceptación**

- actualizar reglas u operaciones no cambia un cierre;
- cerrar dos veces es idempotente;
- una reapertura registra actor, motivo, versión anterior y nueva;
- los ajustes permanecen enlazados a la línea original.

**Verificación**

- cierre con pendientes, cierre correcto, doble clic, fallo intermedio, reapertura
  y ajuste en el siguiente periodo.

### Entrega 9 — Reportes y conciliación

**Trabajo**

- resumen financiero por periodo, sede, cargo y colaborador;
- desglose de conceptos y estados de pago;
- productividad con nombres de KPI no ambiguos;
- exportación PDF/Excel desde snapshots;
- navegación del total hacia detalle y evidencia.

**Aceptación**

- pantalla, Excel y PDF muestran los mismos totales;
- filtros no cambian la definición del indicador;
- ninguna visualización suma referidos dos veces dentro de comisiones;
- cifras de meses cerrados son estables.

**Verificación**

- conciliación automática de totales por sede, concepto, colaborador y estado de
  pago.

### Entrega 10 — Migración y salida gradual

**Trabajo**

- importar colaboradores, asignaciones, cuentas y configuración vigente;
- decidir qué históricos se migran como detalle y cuáles como snapshot;
- operar al menos un mes en paralelo sin impacto de pago;
- documentar diferencias y corregir reglas, no resultados manualmente;
- liberar por permisos y sede antes del despliegue general.

**Aceptación**

- diferencias monetarias justificadas y aprobadas;
- rollback operativo documentado;
- usuarios responsables capacitados;
- monitoreo de duplicados, pendientes, cierres y errores activo.

**Verificación**

- ensayo completo desde Excel y evidencias hasta cierre y reporte en un entorno no
  productivo.

## 13. Orden recomendado de implementación frontend/backend

Dentro de cada entrega se seguirá este orden:

1. regla funcional y casos de aceptación;
2. tabla, restricciones e índices;
3. autorización y función RPC;
4. prueba SQL del contrato;
5. servicio y tipos frontend;
6. pantalla y validaciones;
7. prueba de interacción;
8. conciliación y documentación.

No conviene construir primero todas las pantallas: produciría formularios sin
contratos estables y trasladaría reglas monetarias al navegador.

## 14. Estrategia de pruebas

### 14.1 Backend

- restricciones de unicidad y no solapamiento temporal;
- autorización por actor, sede y capacidad;
- idempotencia y concurrencia en importación, aprobación, cálculo y cierre;
- reglas por vigencia y snapshots;
- integridad de sumas y redondeo monetario;
- exclusión de operaciones anuladas, eliminadas o ya consumidas.

### 14.2 Frontend

- estados de carga, vacío y error;
- filtros, paginación y alcance por sede;
- formularios y motivos obligatorios;
- bloqueo de acciones según estado;
- importación con previsualización de errores;
- desglose desde KPI hasta evidencia.

### 14.3 Prueba paralela

La prueba decisiva será un mes completo procesado por ambos sistemas. La matriz
de conciliación debe contener por colaborador:

- asignación y días pagables;
- sueldo calculado;
- tardanzas, extras y penalidades;
- bonos, calificaciones, llamadas y tarjetas de tercero;
- referidos y operaciones asociadas;
- comisiones;
- total, pagos y pendientes;
- causa documentada de cada diferencia.

## 15. Riesgos principales y mitigación

| Riesgo | Mitigación |
|---|---|
| Copiar errores del legacy | Golden tests aprobados y fórmulas versionadas |
| Mezclar rol técnico con cargo | Entidades independientes y vínculo explícito |
| Recalcular historia al cambiar matriz | Versiones, vigencias y snapshots |
| Duplicar bonos por reintentos | Claves únicas de origen y comandos idempotentes |
| Doble conteo de comisiones/referidos | Catálogo de conceptos y una línea por origen/regla/periodo |
| Fuga de remuneraciones o cuentas | RPC por capacidad, alcance por sede y enmascaramiento |
| Penalidad sin respaldo | Evidencia, revisión, motivo y ajustes reversibles |
| Acoplar nómina con caja | Integración de solo lectura y tablas separadas |
| Excel impredecible | Staging, plantilla versionada, hash y reporte por fila |
| Cierre inconsistente | Transacción única, prevalidación, hash e idempotencia |

## 16. Definición de terminado del módulo

El módulo estará listo para producción cuando:

- las decisiones de Entrega 0 estén aprobadas;
- todos los comandos sensibles validen permisos en backend;
- cada concepto monetario sea trazable a regla, versión y evidencia;
- asistencia y evidencias no puedan duplicarse;
- un periodo cerrado sea inmutable;
- pantalla, Excel y PDF concilien;
- se complete un periodo paralelo con diferencias aceptadas;
- no exista impacto en cajas, cierres o KPI operativos actuales;
- haya procedimiento probado de ajuste, recuperación y auditoría.

## 17. Primer bloque recomendado

Para comenzar sin esperar toda la definición monetaria, el primer bloque de
construcción debe ser:

1. cerrar los siete puntos de Entrega 0;
2. diseñar `tb_compensacion_colaborador`, cargo, asignación y periodo;
3. crear el grupo de permisos y rutas todavía restringidas;
4. implementar Colaboradores y Configuración en modo no pagable;
5. obtener y perfilar dos archivos reales del huellero;
6. preparar los casos de conciliación de un mes histórico.

Este bloque crea la base compartida de todas las opciones y evita iniciar por un
reporte o una fórmula aislada que luego deba rehacerse.

## 18. Avance de implementación backend

Al 19/09/2026 ya se encuentran modelados e implementados los contratos base de:

- personal, asignaciones y cuentas de pago;
- matriz versionada, conceptos, reglas, metas, excepciones y penalidades;
- periodos mensuales;
- importación, conciliación y corrección de asistencia;
- bandeja común de evidencias con revisión maker-checker y valorización desde la
  matriz publicada.

El bloque de evidencias cubre calificaciones, llamadas y tarjetas de terceros.
Referidos ya cuenta además con atribución única y validación de la primera
operación pagada elegible, usando la tasa de la matriz publicada. Penalidades y
auditoría de pagos ya disponen de bandejas cruzadas, control de sede responsable,
conflicto de interés y congelamiento atómico de descuento y bono. El motor de
preliquidación ya permite simular y persistir versiones con sueldo, asistencia,
eventos, incidencias y ajustes, bloqueando configuraciones ambiguas. La revisión
maker-checker y los pagos ya contemplan aprobación, observación, rechazo, pagos
parciales o totales, componentes separados, reversa y bandeja de saldos para
exportación bancaria. El cierre mensual ya incorpora prevalidación, política
explícita de pagos, snapshots con huella de integridad, reapertura versionada y
ajustes posteriores con aprobación independiente. Los reportes y exportaciones
backend ya comparten una fuente canónica para periodos abiertos y snapshots para
periodos cerrados; incluyen vistas financieras, conceptos, sedes, asistencia,
productividad y pagos, además de evidencia auditable e idempotente de PDF, XLSX
y CSV. Queda como siguiente fase la compilación contra PostgreSQL, las pruebas
de integración con datos reales y la conciliación paralela con el legacy. La
validación integral backend ya dispone de diagnóstico de errores y pendientes,
control de desacoplamiento con Caja y conciliación por liquidación entre
cabecera, detalle, pagos y saldos. La ejecución contra datos reales sigue siendo
obligatoria antes de considerar terminada la migración.
