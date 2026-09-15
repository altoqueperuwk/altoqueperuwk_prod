# Sistema de Compensaciones, Bonos y Penalidades — levantamiento inicial

## Estado y propósito

Este documento levanta el contenido funcional de `implementacion_esquema/ESQUEMA 9.pdf`, incorpora las respuestas de `implementacion_esquema/gemini-code-1789349311096.md` y propone cómo integrarlo como un sistema nuevo en la aplicación actual. Las respuestas se toman como definiciones funcionales de trabajo; los casos aún ambiguos y la aprobación administrativa/legal se identifican por separado. Este documento no autoriza por sí solo pagos o descuentos automáticos.

El PDF tiene siete páginas y está compuesto principalmente por láminas gráficas, sin texto seleccionable. Las reglas que siguen se transcribieron visualmente. La portada es gráfica y no añade reglas de negocio. Antes de implementar, Administración/RR. HH., las jefaturas y Contabilidad deben validar los importes, condiciones, excepciones y vigencia.

## Por qué conviene un sistema separado

El documento mezcla tres conceptos que hoy deben permanecer diferenciados:

1. **Compensación del personal:** sueldo base, bonos, comisiones internas, penalidades y liquidación por periodo.
2. **Evidencia de actividad operativa:** operaciones, clientes registrados, pagos revisados, llamadas, chats, atención presencial, incidencias y campañas.
3. **Comisiones financieras de las operaciones:** comisiones bancarias/de servicio, transferencias, gastos y ganancias que hoy pertenecen a los flujos de Operaciones y Cajas.

El sistema nuevo debe calcular el punto 1, y puede reutilizar evidencia del punto 2 cuando exista una relación fiable con el usuario, la sede, la fecha y la operación. No debe cambiar ni reutilizar como si fueran lo mismo los importes del punto 3. En particular, bonos y penalidades no deben crear movimientos de caja, cambiar saldos, modificar cierres, snapshots ni alterar las comisiones comerciales existentes.

## Reglas transcritas del PDF

Los importes y textos de esta sección son una transcripción de trabajo. Se conservan las expresiones ambiguas del original como asuntos por confirmar, en vez de asumir una interpretación ejecutable.

### 1. Atención al Cliente — sueldo base indicado: S/ 1,250

| Concepto | Tipo e importe indicado | Condición descrita |
|---|---:|---|
| Puntualidad y disciplina | Bono + S/ 50 | Ingreso 9:00 a. m., tolerancia de 5 minutos. El PDF indica que se pierde por tardanza, indisciplina o falta de uniforme detectada durante el mes. |
| Colaborador del mes — efectivizaciones | Bono + S/ 100 | Mayor número de atenciones efectivas en la bandeja mensual de Pancake. |
| Colaborador del mes — atención | Bono + S/ 100 | Mayor cantidad de calificaciones de 4–5 estrellas y mayor atención presencial, según el texto. Debe definirse si es un segundo premio o un criterio alternativo al anterior. |
| Propuesta de innovación (toda área) | Bono + S/ 50 | Propuesta aprobada e implementada. |
| Seguridad de tarjeta | Bono + S/ 10 | Identificar los últimos cuatro dígitos de tarjetas de terceros. Debe precisarse evidencia y alcance. |
| Meta de área | Bono + S/ 300 | La sede alcanza el 80% de la meta y el bono se reparte en toda la sede. Falta definir reparto y denominador de meta. |
| Registro nuevo y efectivización | Comisión + S/ 0.70 | Cliente nuevo que realiza una operación dentro de los primeros siete días. |
| Atención presencial calificada | Comisión + S/ 2 | Atención calificada con 4–5 estrellas y vinculada estrictamente a efectivizaciones con comisión general de 1%/2% o pagos de deuda; excluye tasas preferenciales y comunidades. |
| Referido | Comisión + 0.4% | Asociada a la efectivización de una persona referida. El PDF también menciona una base de 1%; confirmar base, elegibilidad y atribución. |
| Llamada / contacto | Comisión + S/ 0.20 | Llamada entrante contestada vía Pancake. |
| TikTok Live | Comisión + S/ 0.70 | Cliente registrado que opera dentro de siete días; incluye soporte/orientación sobre efectivización. |
| Tardanza | Penalidad - S/ 0.50 por minuto | Después de las 9:00 a. m. y agotada la tolerancia indicada. |
| Error de datos | Penalidad - S/ 2 | Dato incorrecto en formulario, detectado por Pagos o Jefe de Tienda. |
| Abandono de chat | Penalidad - S/ 2 | Más de 20 minutos sin respuesta o voucher/proceso pendiente de atención; precisar cuándo inicia y termina el cómputo. |
| Mal flujo CRM/Safety | Penalidad - S/ 2 | Omitir el protocolo (por ejemplo, no pedir monto o no generar código) o responder de forma genérica. |
| Conversación/proceso abandonado | Penalidad - S/ 2 | Dejar un chat, cuenta o tarjeta sin registrar la información requerida. |
| Error en registro manual o código | Penalidad - S/ 2 | DNI, nombre, celular, correo o código de comunidad incorrecto, detectado antes de la transferencia. |
| Falta de uniforme completo | Penalidad - S/ 10 por día | El texto indica además pérdida del bono mensual de asistencia/puntualidad. |
| Indisciplina recurrente activa | Penalidad - S/ 15 | Incidentes observados por cámara/auditoría (por ejemplo, uso personal del teléfono, dormir o conducta); el texto también asocia la regla a perder el bono mensual. |
| Manipulación / antifraude | Pérdida del 100% de comisiones del mes | Regla de tolerancia cero ante manipulación de conteos o registros falsos detectados por auditoría/gerencia. Definir proceso de investigación, revisión y aprobación. |

### 2. Jefes de Tienda — sueldo base indicado: S/ 1,500

La jefatura responde por disciplina, control operativo y metas de su sede; el texto la evalúa también por fallas del equipo.

| Concepto | Tipo e importe indicado | Condición descrita |
|---|---:|---|
| Puntualidad y disciplina | Bono + S/ 70 | Entrada 9:00 a. m., tolerancia de 5 minutos; se pierde por tardanza, falta de uniforme o incumplimiento de disciplina indicado en el documento. |
| Meta de sede SafetyPay | Bono + S/ 200 | Cumplir la meta mensual y el “candado calidad y cuota diaria”. El PDF indica 240 mensajes/120 respuestas para Norte/Sur y 110 mensajes/55 respuestas para Lince, con tolerancia de +/-5. Una fuga o descuido de chats anula el bono. Confirmar qué mide cada cifra. |
| Innovación extra | Bono + S/ 50 | El PDF indica que podría sumarse hasta S/ 400 con la meta de sede; composición y máximo por validar. |
| Atención/registro presencial | Bono + S/ 0.30 | Por cada atención presencial registrada en el sistema y calificada. |
| Liderazgo | Bono + S/ 30 | Por cada subordinado que obtenga el bono mensual de puntualidad y disciplina. |
| Registro nuevo y efectivización | Comisión + S/ 0.30 | Cliente nuevo que opera dentro de los primeros siete días. |
| Atención presencial calificada | Comisión + S/ 2 | Regla de 4–5 estrellas ligada a efectivizaciones generales de 1%/2% o pagos de deuda; excluye tasas preferenciales y comunidades. |
| Auditoría activa | Comisión + S/ 1 | Detectar, reportar y resolver en su equipo errores de datos, mal flujo o CRM incompleto antes de escalarlos a Pagos/Facturación. Definir evento y evitar doble pago por incidencia. |
| Llamada / contacto | Comisión + S/ 0.20 | Llamada entrante contestada vía Pancake. |
| Referido | Comisión + 0.4% | Vinculada a efectivización de la persona referida; base por confirmar. |
| TikTok Live | Comisión + S/ 0.30 | Registro y operación del cliente dentro de siete días, con cuotas indicadas en el documento. |
| Tardanza | Penalidad - S/ 0.70 por minuto | Después de la hora de ingreso aplicable. |
| Error de supervisión | Penalidad - S/ 2 | Error de un empleado que supera el filtro y es detectado por Facturación. |
| Abandono de chat solidario | Penalidad - S/ 2 | Chat sin respuesta por más de 20 minutos. |
| Queja tardía / falta de reporte | Penalidad - S/ 2 | Si Gerencia recibe quejas o reclamos antiguos que la jefatura no solucionó ni reportó oportunamente. |
| Uniforme de jefatura | Penalidad - S/ 20 por día | Falta de uniforme. |
| Error en cuadro de comisiones | Descuento del 30%, 60% o 90% | El documento no define umbrales, base exacta, responsable de graduación ni aprobador. |

### 3. Facturación — sueldo base indicado: S/ 1,500

El rol se describe como filtro final, corrección y seguridad financiera.

| Concepto | Tipo e importe indicado | Condición descrita |
|---|---:|---|
| Puntualidad y disciplina | Bono + S/ 50 | Entrada 9:00 a. m., tolerancia de 5 minutos; se pierde por tardanza o indisciplina. |
| Detección de error de pago | Bono + S/ 20 | Detectar un monto o cuenta incorrectos antes o después del pago; hace falta definir cuándo sigue siendo válido si el error ya produjo impacto. |
| Operación extra | Bono + S/ 0.20 | Operación real no registrada por tienda o Pagos. Definir quién acredita el descubrimiento y cómo se evita pagarla dos veces. |
| Innovación | Bono + S/ 50 | Propuesta aprobada e implementada. |
| Referido | Comisión + 0.4% | Base y atribución por confirmar. |
| Tardanza | Penalidad - S/ 0.70 por minuto | Según horario aplicable. |
| Error con solución | Penalidad - S/ 100 | Error operativo que Gerencia detecta y que el filtro de Facturación no detectó. |
| Error sin solución | Penalidad - S/ 200 | Omisión crítica; definir qué significa “sin solución”, evidencia y revisión. |
| Falta de uniforme | Penalidad - S/ 10 por día | El documento contempla descuentos diarios. |
| Indisciplina | Penalidad - S/ 15 | Deben definirse evento, evidencia y revisión. |
| Error en cuadro de comisiones | Descuento del 30%, 60% o 90% | Sin umbrales ni reglas completas en el PDF. |

### 4–5. Área de Pagos — estructura jerárquica y control bancario

El PDF plantea niveles y carteras diferenciadas. Las asignaciones descritas son operativas y deben poder cambiarse sin que el rol de acceso del sistema las determine automáticamente.

| Perfil descrito | Sueldo base indicado | Descripción de cartera/trabajo |
|---|---:|---|
| Jefe superior de Pagos / líder operativo de sede Lince | S/ 3,000 | Cartera principal BBVA; procesa montos de BBVA enviados a efectivizar por SafetyPay, apoya otras carteras, brinda soporte al personal y gestiona correos institucionales de la sede. |
| Operador de alta demanda | S/ 250 | Cartera directa BCP, con apoyo multibanco y flujos SafetyPay/tarjetas comerciales; monitorea flujos y coordina desvíos según demanda. |
| Encargada de cartera media (dos personas autónomas) | S/ 2,000 por persona | Atención multibanco (Interbank, Scotiabank, BanBif, etc.); asignación dinámica según demanda por la jefatura superior. |
| Asistente virtual de pagos | S/ 500 | Clientes de menor flujo, apoyo Scotiabank/BanBif; trabajo remoto, descanso los jueves y sin penalidad de tardanza por minuto según el documento. |

**Aclaración de sueldo recibida después del PDF:** la respuesta de implementación enumera S/ 2,500 y S/ 1,500 como sueldos base mensuales aplicables. Para la especificación funcional se interpretan como S/ 2,500 para Operador de alta demanda y S/ 1,500 para Asistente virtual, respectivamente. El PDF imprime S/ 250 y S/ 500; esa transcripción literal se conserva en `implementacion_esquema/ESQUEMA_9.md`, pero queda reemplazada para el cálculo por la aclaración posterior.

El PDF detalla además controles específicos por perfil:

| Perfil | Bonos y penalidades adicionales transcritos |
|---|---|
| Jefe superior | Puntualidad + S/ 150; tardanza - S/ 1.50/min; cierre diario incompleto - S/ 150; retraso de vouchers - S/ 50; cuadre perfecto + S/ 100. |
| Operador de alta demanda | Puntualidad + S/ 100; tardanza - S/ 1/min; cierre diario incompleto - S/ 100; retraso de vouchers - S/ 35; cuadre perfecto + S/ 75. |
| Cartera media | Puntualidad + S/ 75; tardanza - S/ 1/min; cierre diario incompleto - S/ 75; retraso de vouchers - S/ 25; cuadre perfecto + S/ 50. |
| Asistente virtual | Bono por cumplimiento general y disciplina sujeto a evaluación; cierre diario incompleto - S/ 75; retraso de vouchers - S/ 25; cuadre perfecto + S/ 50. No se indica penalidad por tardanza por minuto. |

La “tabla maestra de control bancario” reitera o agrega reglas para Pagos:

| Concepto | Importe/efecto transcrito | Observación |
|---|---:|---|
| Reporte/abandono de chat | + S/ 1 | Definir qué evidencia acredita un reporte válido; el nombre combina conceptos posiblemente distintos. |
| Error de dato manual/código | + S/ 1 | Parece un incentivo por detección, no una penalidad; confirmar. |
| Innovación | + S/ 50 | Aprobada e implementada. |
| Atención/registro presencial | + S/ 0.30 | Criterio de calificación por definir para Pagos. |
| Referido | + 0.4% | Base y atribución por confirmar. |
| TikTok Live | + S/ 1 | Condición completa por validar. |
| Auditoría de nuevos registros y efectivización | Comisión + S/ 0.30 | Procesamiento y validación de la operación. |
| Registro nuevo y efectivización | Comisión + S/ 0.70 | Cliente nuevo que opera dentro de los primeros siete días. |
| Error crítico de pago | Penalidad del 100%, mínimo fijo S/ 40 | El alcance de “100%”, base, escalamiento y consistencia con los otros niveles requiere definición expresa. |
| Descuadre | - S/ 5 | Diferencia entre Excel y banco. Debe distinguirse error atribuible, demora, comisión bancaria y desfase temporal. |
| Uniforme completo | - S/ 30 por día | El texto además indica pérdida de bono de asistencia. |
| Indisciplina recurrente | - S/ 40 | Definir gravedad, recurrencia, pruebas y aprobación. |
| Error en cuadro de comisiones | -30%, -60% o -90% | Umbrales y base sin especificar. |

Las páginas de Pagos contienen reglas repetidas y montos distintos a los de Atención al Cliente, Jefes y Facturación. Deben convertirse en reglas versionadas por puesto/perfil, no en una tabla única aplicada indistintamente.

### 6. Diseño y Marketing — sueldo base indicado: S/ 1,500

| Concepto | Tipo e importe indicado | Condición descrita |
|---|---:|---|
| Puntualidad y disciplina | Bono + S/ 50 | Entrada 9:00 a. m., tolerancia de 5 minutos; el PDF indica que se pierde por tardanza, indisciplina o falta de uniforme detectada durante el mes. |
| Video viral | Bono + S/ 50 | Mínimo mensual de 10,000 vistas, 500 “me gusta” y 5 comentarios reales. |
| Innovación (toda área) | Bono + S/ 50 | Propuesta aprobada e implementada. |
| Recuperación de cliente | Bono + S/ 5 por cliente | Cliente inactivo por más de 60 días que vuelve a operar gracias a campañas de marketing. |
| Cofiscalización / alerta temprana | Comisión + S/ 0.50 | Alertar en tiempo real al Jefe de Tienda sobre errores o chats abandonados/sin respuesta por más de 20 minutos; el PDF indica que se descuenta al asesor responsable. |
| Referido | Comisión + 0.4% | Base y vigencia por confirmar en las respuestas recibidas. |
| TikTok Live | Comisión + S/ 1 | Cliente registrado y operado dentro de siete días; incluye supervisión/conversión de campaña. |
| Falta de uniforme | Penalidad - S/ 10 por día | Según el texto del PDF. |
| Indisciplina | Penalidad - S/ 15 | Según el texto del PDF. |

## Definiciones funcionales recibidas

Las siguientes respuestas se incorporan desde `implementacion_esquema/gemini-code-1789349311096.md`. Junto con el catálogo vigente de roles indicado por el usuario, son la base funcional para continuar; cuando hay una diferencia de redacción se documenta el criterio de implementación adoptado.

### Personal incluido en la primera versión

El alcance de trabajadores comprende únicamente estos cuatro perfiles, correspondientes al catálogo de `tb_rol` compartido:

| ID de rol | Perfil laboral incluido |
|---:|---|
| 3 | Jefe de Tienda |
| 4 | Atención al Cliente |
| 2 | Área de Pagos |
| 5 | Facturación |

El rol **Administrador (ID 1)** será una función de administración/aprobación del sistema, no un perfil de compensación por defecto. Diseño y Marketing aparece en el PDF, pero no está entre los perfiles laborales actuales indicados, así que queda fuera de la primera versión. Sus reglas se conservan en la transcripción fuente para una eventual ampliación.

Los niveles Jefe Superior, Operador de alta demanda, Cartera Media y Asistente Virtual son asignaciones internas del Área de Pagos; no se deben confundir con roles de acceso. La configuración de compensación debe vincular a cada trabajador con su puesto operativo vigente.

### Sueldos, jornada y cambios de puesto

- Los sueldos base son mensuales brutos para jornada completa, indicada como 48 horas semanales o el régimen aplicable.
- La fórmula definida es `sueldo diario = sueldo base / 30` y `sueldo devengado = sueldo diario × (días trabajados + dominicales/descansos pagados)`.
- Si cambia el puesto o la sede a mitad de mes, el sueldo base se prorratea por tramos/días en cada asignación. Bonos y penalidades se atribuyen al puesto y sede donde ocurrió el evento.
- La escala incluida queda así: Atención al Cliente S/ 1,250; Jefe de Tienda, Facturación y Asistente virtual de Pagos S/ 1,500; Cartera media S/ 2,000 por persona; Operador de alta demanda S/ 2,500; Jefe superior de Pagos S/ 3,000. Diseño/Marketing no se incluye en esta versión.

### Meta de sede y colaborador del mes

- La meta de sede se mide por volumen mensual de operaciones efectivizadas en soles. Gerencia define la meta global; al alcanzar el 80% se activa una bolsa de S/ 300.
- La bolsa se divide equitativamente entre asesores presenciales activos de la sede que hayan trabajado al menos 15 días en el mes y no hayan incurrido en tolerancia cero.
- Los dos bonos de Colaborador del Mes de Atención al Cliente son acumulables: hasta S/ 100 por mayor número de atenciones efectivas y S/ 100 por calificaciones/atención presencial.
- Para empate en número de atenciones efectivas, desempata el menor porcentaje de chats abandonados/penalidades; si persiste, el premio se divide. Gerencia Operativa valida usando el reporte exportado directamente de Pancake.

### Referidos, fuentes de datos y conceptos operativos

- El referido se atribuye al primer asesor que registró el DNI/código antes de la efectivización. Criterio de implementación: pagar 0.4% sobre el monto de la primera operación efectivizada del referido que califique con la tasa general de 1%. Esta lectura da prioridad a la regla específica de duración (“primera operación”) frente a la frase general sobre el total mensual; las operaciones posteriores no generan otra comisión por referido.
- Pancake es la fuente prevista para chats, atenciones efectivas y tiempos de respuesta. La cuota diaria indicada es por asesor: Norte/Sur 240 mensajes y 120 respuestas; Lince 110 mensajes y 55 respuestas; tolerancia de +/-5.
- “Operación extra” es una operación real identificada en extractos bancarios o pasarela que no fue registrada por Tienda/Pagos.
- “Descuadre” es la diferencia entre los montos liquidados en la hoja de control (Excel/sistema) y los saldos efectivamente ejecutados en los bancos.
- “Error crítico” es un error en pago/facturación que causa pérdida financiera, duplicidad de transferencia o afectación legal/Sunat.
- Para cliente nuevo, se toma la primera fecha de registro en la base; la ventana es de siete días calendario, hasta 168 horas. Para cliente inactivo, se usa la última transacción efectivizada y un umbral de 60 días calendario o más.

### Descuentos escalonados y tolerancia cero

- Los descuentos de 30/60/90% se aplican solo a la bolsa total de comisiones del periodo, nunca al sueldo base: un error en el cuadro mensual equivale a 30%, dos a 60%, y tres o más a 90%.
- Aprueban estos descuentos Gerencia de Operaciones y Finanzas.
- Tolerancia cero digital comprende autocalificación de encuestas, usuarios falsos para comisiones de cliente nuevo, alteración de vouchers o falsificación de reportes. El efecto definido es anular el 100% de las comisiones del mes, sin afectar el sueldo base según la respuesta recibida.
- El colaborador dispone de 48 horas desde la notificación para pedir revisión y presentar evidencia, antes del cierre de nómina.

### Incidencias cruzadas, asistencia y métricas de calidad

- Pagos puede reportar un abandono/error de Atención al Cliente; aplicar el bono de S/ 1 al detector de Pagos y la penalidad de S/ 2 al responsable, con evidencia de Pancake/sistema y confirmación de Jefe de Tienda o Facturación. El incentivo de S/ 0.50 de Diseño/Marketing no aplica en la primera versión porque ese perfil no forma parte de la plantilla incluida. Las alertas podrán registrarse sin exponer al denunciante al usuario reportado; la auditoría autorizada conserva su identidad.
- Zona horaria oficial: `America/Lima` (UTC-5). La tolerancia termina a las 9:05:00 a. m. y la marcación tardía comienza a las 9:05:01. Criterio de cálculo: cobrar minutos completos de tardanza; el primer minuto se genera al llegar a las 9:06:00, sin redondear fracciones hacia arriba.
- El plazo de abandono de chat es de 20 minutos desde el último mensaje del cliente, con conversación activa/asignada y sin respuesta del asesor.
- Video viral se evalúa a los 30 días de publicado mediante analítica nativa de TikTok o Meta Business Suite; comentarios deben ser de cuentas reales. Esta regla queda documentada, pero fuera de la primera versión por no incluir Diseño/Marketing.
- Solo cuentan calificaciones enviadas por el enlace oficial automatizado de Pancake/WhatsApp y enlazadas al ID de cliente e ID de asesor.
- En modalidad remota no aplica tardanza fraccionada por minuto, pero sí los controles de cierre incompleto, retraso de vouchers, error crítico y descuadre. Para trabajo presencial aplican puntualidad, disciplina, uso de celular y uniforme.

### Visibilidad y cierre mensual

- Asesor: solo su propia actividad, comisiones y penalidades.
- Jefe de Tienda: métricas y comisiones de usuarios de su sede.
- Pagos/Facturación: reportes operativos transaccionales.
- Gerencia/Administración: acceso global, incluidos sueldos base y comisiones.
- El periodo cierra el último día del mes a las 23:59:59. El Jefe de Facturación y Gerencia General deben aprobar conjuntamente la liquidación antes del día 5 del mes siguiente para emitir la orden de pago.

### Criterios operativos para resolver casos límite

- Para la meta de sede, sumar los importes de operaciones de efectivización completadas (`Pagado`) durante el mes calendario y atribuibles a la sede del evento. Excluir anuladas, eliminadas, devueltas y operaciones que no sean efectivización. Si no hay asesores que cumplan los 15 días, no se distribuye la bolsa y no se traslada al mes siguiente.
- Para empate del bono por calificaciones/atención presencial, dividir el bono entre los empatados con el mayor resultado válido; cada premio se calcula por separado.
- Aplicar el prorrateo base tal como fue definido (base/30 por días trabajados más descansos pagados). Las asistencias, ausencias y asignaciones se registran con vigencia por persona; no se infieren de las operaciones.
- Para la primera versión, importar el reporte exportado de Pancake y los extractos/archivos de conciliación como evidencia controlada. La conexión por API se deja como optimización técnica, no como bloqueo del diseño funcional.

## Relación con el sistema actual

El proyecto ya tiene piezas que pueden aportar contexto o evidencia, pero no se debe asumir que cada actividad del PDF se puede medir de forma confiable con los datos actuales.

| Dato/capacidad actual | Uso potencial en el nuevo sistema | Límite conocido |
|---|---|---|
| Usuario, rol de acceso, estado y sede en `tb_usuario` | Identificar persona y sede asociadas a un cálculo; gestionar acceso. | El rol de permisos no necesariamente equivale al puesto, nivel de Pagos, modalidad o plan de compensación. No reutilizarlo como clasificación laboral sin validar. |
| Clientes en `tb_cliente` (incluye `id_usuario`, fecha de registro, estado, comunidad y datos de contacto) | Detectar registros nuevos y atribución inicial del registro. | La operación dentro de siete días debe enlazarse con el mismo cliente y el responsable/colaborador elegible. Se debe tratar con cuidado la corrección o reasignación de `id_usuario`. |
| Operaciones en `tb_operacion_proceso` | Evidencia de registro, usuario registrador/gestor, servicio, importes, estado, fecha y derivaciones; posible base para “cliente nuevo que opera”. | El usuario que registra, gestiona, deriva o paga puede ser distinto. Cada regla requiere definir qué actor recibe crédito y cómo se resuelven reintentos, anulaciones, retornos y duplicados. |
| Movimientos/cajas y cierres | Conciliar operaciones y pagos ya procesados. | No son un libro de nómina. Bonos y descuentos no deben insertarse como movimientos ni alterar KPIs, saldos o cierres. |
| Menú y permisos existentes | Restringir acceso al nuevo módulo por perfil/sede. | Permisos de navegación no sustituyen permisos para aprobar, auditar, liquidar o administrar reglas. |
| Reportes actuales de operaciones | Fuente de conciliación para reglas de actividad ligadas a operaciones. | No probaría puntualidad, uniformidad, chats, llamadas, estrellas, innovación, disciplina ni métricas de contenido por sí sola. |

En el código/documentación revisados no se identificó evidencia suficiente de un registro formal de asistencia, turnos, uniforme, calificaciones 4–5 estrellas, incidentes de CRM/chat, llamadas, propuestas de innovación, referidos atribuibles, auditorías de error ni analítica de TikTok. Se consideran **capacidades por levantar**, no ausencias definitivas: deben contrastarse con las pantallas, integraciones y fuentes externas existentes antes de diseñar tablas.

## Propuesta funcional del nuevo sistema

Nombre de trabajo: **Compensaciones y Desempeño Operativo**.

### Componentes

1. **Personal y asignaciones**: vincular usuario con puesto operativo, sede, modalidad, cartera y periodo de vigencia. Separar el puesto laboral del rol técnico de permisos.
2. **Planes y reglas versionadas**: sueldo base, bonos, comisiones internas, penalidades, umbrales, condiciones, vigencia, sede/puesto aplicable y fórmula. Ningún cambio debe recalcular silenciosamente periodos ya cerrados.
3. **Evidencias/eventos**: registrar incidencias y logros no derivados automáticamente de operaciones; guardar actor, sujeto, fecha, sede, fuente, descripción, evidencia, estado y referencias a cliente/operación cuando corresponda.
4. **Motor de cálculo por periodo**: producir conceptos preliminares reproducibles con regla aplicada, base, importe, evidencia y motivo. Debe impedir duplicados y permitir simulación antes de calcular definitivamente.
5. **Revisión y aprobación**: flujo configurable de colaborador/jefatura, auditoría o Facturación y aprobación final autorizada. La persona que genera el evento no debería aprobar unilateralmente su propia incidencia cuando haya impacto en su liquidación.
6. **Cierre de liquidación**: congelar el detalle aprobado por persona, sede, periodo y versión del plan; correcciones posteriores mediante ajuste trazable, no edición destructiva del cierre.
7. **Reportes y exportación**: resumen por colaborador/sede/puesto y detalle de conceptos, fuentes, pendientes y ajustes. Mantenerlo separado de los reportes de cierre de caja.

### Flujo de trabajo propuesto

```text
Asignar puesto/sede/plan
        ↓
Capturar o importar evidencia operativa
        ↓
Validar atribución y aprobar/rechazar evidencia
        ↓
Simular cálculo del periodo con reglas vigentes
        ↓
Revisar observaciones y aprobar liquidación
        ↓
Cerrar periodo y emitir reporte/exportación
        ↓
Registrar ajustes posteriores con auditoría
```

## Plan de implementación propuesto

### Fase 0 — Validación de política y vocabulario

- Cerrar las ambigüedades listadas en “Pendientes de cierre”, en especial la base y duración del referido y las incidencias cruzadas.
- Formalizar por puesto las cifras confirmadas, conservar la transcripción literal del PDF y la aclaración posterior de los sueldos en la configuración/versionado.
- Confirmar calendario de liquidación, responsables y permisos con la fecha de aprobación conjunta ya definida.
- Validar legal y contablemente cómo se aplican bonos, penalidades y descuentos antes de activar cálculos pagables.
- Mantener diferenciada la comisión de compensación de la comisión financiera/comercial de una operación.

**Salida:** catálogo de reglas aprobado, glosario, matriz de roles y ejemplos calculados manualmente.

### Fase 1 — Diseño de datos y permisos

- Definir entidades de puesto/asignación, plan versionado, regla, evento/evidencia, cálculo, línea de cálculo, aprobación y cierre de periodo.
- Establecer referencias opcionales y auditables a `tb_usuario`, `tb_cliente` y `tb_operacion_proceso` sin modificar la semántica financiera existente.
- Diseñar permisos independientes: colaborador, jefe de sede, auditor/Facturación, Pagos, administrador de reglas y aprobador final.
- Definir privacidad, acceso por sede, retención documental y bitácora de cambios.

**Salida:** modelo funcional y técnico revisado antes de crear/migrar tablas.

### Fase 2 — Módulo administrativo y captura de evidencias

- Construir administración de asignaciones y planes/reglas con vigencias.
- Añadir captura y revisión de asistencia/incidencias y conceptos manuales con evidencia.
- Añadir importación o integración de fuentes externas (por ejemplo, chat, llamadas o métricas sociales) solo después de confirmar disponibilidad y calidad.
- Mostrar al colaborador sus conceptos y evidencias, con mecanismo de observación según la política acordada.

### Fase 3 — Integraciones verificables con operaciones/clientes

- Implementar reglas automáticas únicamente donde se pueda probar atribución: registro de cliente, primera operación dentro de siete días, operaciones extra detectadas y errores de pago auditados.
- Definir actor elegible por regla: registrador, gestor, revisor, jefatura u otra asignación explícita.
- Excluir operaciones eliminadas/revertidas, retornos y duplicados según decisión funcional; evitar contar dos veces cargas, reasignaciones o correcciones.
- Conciliar los resultados con muestras de operaciones antes de habilitar cálculo de importes.

### Fase 4 — Simulación, aprobación y cierre

- Producir preliquidaciones explicables con desglose de cada regla y evidencia.
- Permitir comparar cálculo automático y correcciones justificadas; no borrar el rastro de la versión inicial.
- Aprobar y congelar periodos; los ajustes se registran como movimientos de liquidación separados del sistema de caja.
- Exportar reportes para revisión y pago externo; no ejecutar pagos bancarios en la primera fase.

### Fase 5 — Despliegue gradual

- Ejecutar uno o más periodos en modo paralelo/manual, comparando resultados.
- Empezar con conceptos positivos de bajo riesgo y evidencia objetiva.
- Activar penalidades solo luego de resolver política, proceso de revisión y autorización correspondiente.
- Monitorear discrepancias, reclamos, duplicados y tiempos de aprobación antes de ampliar a todas las áreas.

## Condiciones previas al despliegue productivo

No quedan preguntas funcionales abiertas que impidan diseñar el sistema. Antes de liquidar dinero en producción, se debe:

- Probar y documentar ejemplos de referidos con la regla adoptada (0.4% sobre la primera operación elegible al 1%) como parte de la aprobación de la política.
- Probar con un mes histórico que el volumen efectivizado, sede, usuario responsable y estado `Pagado` coincidan con los reportes operativos.
- Cargar/importar archivos de Pancake y conciliación con controles de duplicidad, periodo y trazabilidad.
- Configurar los cuatro perfiles actuales, sus asignaciones de Pagos, usuarios, sedes, revisores y aprobadores.
- Validar la aplicación de penalidades con los responsables administrativos/legales antes de habilitar descuentos pagables.
- Hacer un periodo paralelo de cálculo y obtener las aprobaciones del Jefe de Facturación y Gerencia General.

## Criterios de aceptación del futuro desarrollo

- Las reglas tienen versión y fecha de vigencia; el cálculo histórico conserva la regla que se aplicó.
- Cada importe calculado se puede explicar y rastrear hasta su evidencia y aprobaciones.
- El mismo evento no produce líneas duplicadas; correcciones y reversas quedan auditadas.
- La atribución separa creador, gestor, revisor y sede, sin inferirlos de forma ambigua.
- Un cierre de liquidación aprobado no cambia por actualizaciones posteriores de operaciones o reglas.
- El periodo se corta en hora Lima al último día del mes y exige las dos aprobaciones definidas antes del día 5 siguiente.
- La operación de compensaciones no crea ni altera filas de `tb_operacion_caja`, saldos, KPIs o cierres financieros.
- Las penalidades no se activan automáticamente hasta que su política, evidencia, aprobación y proceso de revisión estén definidos.
- El acceso respeta sede y funciones; los administradores autorizados pueden auditar cambios y cierres.

## Alcance de este levantamiento

En esta entrega se documentó el contenido visible del PDF, su relación con el sistema actual y una ruta de implementación. **No se modificaron código, funciones SQL, tablas ni procesos financieros.** Las reglas monetarias quedan pendientes de validación funcional antes de transformarse en configuración o cálculos ejecutables.
