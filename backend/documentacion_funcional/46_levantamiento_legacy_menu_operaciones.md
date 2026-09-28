# Levantamiento del legacy — menú Operaciones

## 1. Objetivo y alcance

Este documento mapea la evidencia visual disponible del grupo **Operaciones** del sistema legacy y determina qué capacidades deben migrarse al dominio de compensaciones.

Opciones observadas en el menú:

1. Safetypay.
2. Tarjetas comerciales.
3. Referidos.
4. Llamadas.
5. Tarjetas erróneas.
6. Todos los Registros.

Solo se recibieron pantallas de Referidos, Llamadas y Tarjetas erróneas. SafetyPay y Tarjetas comerciales no se levantarán inicialmente como pantallas nuevas porque el sistema actual ya administra esas operaciones y sus métricas. Todos los Registros se mantiene pendiente porque, según la referencia recibida, posiblemente sea un historial de ingresos.

El análisis distingue:

- **Observado:** aparece explícitamente en las capturas.
- **Inferido:** interpretación probable que requiere validación.
- **Pendiente:** no puede determinarse con la evidencia actual.

## 2. Descarte semántico actualizado

| Opción legacy | Decisión | Destino propuesto | Estado |
|---|---|---|---|
| Safetypay | No replicar como módulo de compensación | Consumir operaciones y métricas SafetyPay del sistema actual | Cubierto funcionalmente; revisar solo reglas de atribución laboral |
| Tarjetas comerciales | No replicar como módulo de compensación | Consumir POS/Link Pago y métricas actuales | Cubierto funcionalmente; revisar solo reglas de atribución laboral |
| Referidos | Migrar la capacidad económica y de atribución | Módulo/evento de referidos enlazado a cliente y operaciones reales | Pantalla observada |
| Llamadas | Migrar como evidencia de comisión | Evento o importación de llamada con aprobación | Pantalla observada |
| Tarjetas erróneas | Migrar con nombre semántico corregido | Detección de tarjeta de tercero / seguridad de tarjeta | Pantalla observada |
| Todos los Registros | No decidir todavía | Posible bandeja histórica unificada o historial de ingresos | Pendiente de pantalla y comportamiento |

No se deben duplicar en compensaciones los datatables ni KPI operativos de SafetyPay, POS o Link Pago. El módulo de compensaciones únicamente debe guardar referencias estables a las operaciones que generen un concepto laboral.

## 3. Referidos

### 3.1 Hechos observados

La pantalla se denomina **Referidos** y se describe como referidos visibles para validar según sede.

Se muestra una advertencia operativa:

> No aplica para pago de tarjeta, tarjetas comerciales ni personas con una comisión distinta de 1%.

KPI visibles:

| KPI | Valor observado | Detalle |
|---|---:|---|
| Referidos visibles | 12 | 0 pendientes de aprobación |
| Comisión validada | S/ 342.60 | 0.4% del monto efectivizado |

El porcentaje mostrado confirma visualmente una comisión de referido de 0.4% sobre una base efectivizada elegible.

### 3.2 Registro manual observado

Campos del formulario:

- nombre completo del referido, obligatorio;
- DNI, obligatorio;
- monto efectivizado, obligatorio;
- banco, obligatorio;
- notas, opcional;
- cálculo visible de monto base y comisión referida;
- acción `Guardar referido`.

La pantalla permite ingresar manualmente monto y banco. En el sistema nuevo, estos datos deberían obtenerse prioritariamente de `tb_cliente` y `tb_operacion_proceso`, evitando que una persona escriba manualmente una base económica que ya existe en operaciones. Un registro manual debería reservarse para excepción, con evidencia y aprobación.

### 3.3 Tabla y filtros

Filtros observados:

- DNI, nombre o usuario;
- equipo;
- estado;
- rango de tiempo;
- mes.

Columnas observadas:

| Columna | Contenido visible |
|---|---|
| Referido | Nombre del cliente referido |
| DNI | Documento del referido |
| Subido por | Colaborador y sede |
| Banco | Banco de la efectivización |
| Monto efectivizado | Base económica |
| Comisión referido | 0.4% calculado |
| Estado | Validado y fecha |
| Subido | Fecha y hora de registro |
| Notas | Observación opcional |
| Acciones | Agregar efectivización / Eliminar |

Los ejemplos visibles confirman la fórmula:

```text
S/ 3,900.00 × 0.4% = S/ 15.60
S/ 15,500.00 × 0.4% = S/ 62.00
S/ 7,465.18 × 0.4% = S/ 29.86, redondeado a centavos
```

### 3.4 Hallazgo crítico: múltiples efectivizaciones

La acción `Agregar efectivización` y la indicación `Historial: 2 efectivizaciones` sugieren que un mismo referido puede acumular más de una operación.

Esto entra en conflicto con la definición preliminar documentada, que proponía pagar 0.4% únicamente sobre la primera operación elegible del referido. Antes de implementar se debe confirmar:

1. si todas las operaciones al 1% generan comisión;
2. si existe una ventana temporal;
3. si solo paga la primera operación pero se conserva historial;
4. si `Agregar efectivización` reemplaza, complementa o corrige el monto existente;
5. si el total S/ 342.60 contiene una o varias operaciones por DNI.

### 3.5 Atribución y validación requeridas

El nuevo sistema debe poder demostrar:

- quién registró originalmente al referido;
- fecha/hora del registro respecto de la primera operación;
- colaborador y sede beneficiarios;
- operación o conjunto de operaciones que forman la base;
- comisión de servicio de la operación, que debe ser 1% según la advertencia;
- exclusión de Pago Tarjeta/Tarjetas comerciales;
- estado válido y no eliminado/revertido de la operación;
- ausencia de otro beneficiario previo para el mismo DNI;
- regla y versión usadas para calcular 0.4%;
- aprobación o validación y periodo donde se liquidó.

### 3.6 Riesgos observados

- monto y banco ingresados manualmente sin vínculo visible con una operación;
- eliminación de registros con impacto económico;
- duplicidad del mismo DNI entre colaboradores o sedes;
- múltiples efectivizaciones sin regla temporal visible;
- cambio posterior de comisión de la operación;
- uso del DNI como identificador principal;
- posibilidad de autoatribución sin evidencia del primer contacto.

En la migración, `Eliminar` debería convertirse en anulación auditada cuando el registro haya sido validado o usado en una liquidación.

### 3.7 Evidencia pendiente

- modal o flujo `Agregar efectivización`;
- historial de efectivizaciones de un referido;
- estados previos a `Validado`;
- proceso de aprobación/validación;
- regla exacta de primera operación frente a operaciones acumuladas;
- tratamiento de operaciones eliminadas o devueltas;
- restricción de DNI duplicado;
- vínculo real con cliente/operación;
- efecto y confirmación de `Eliminar`;
- solicitudes Fetch/XHR del listado, guardado e historial.

## 4. Llamadas

### 4.1 Hechos observados

La pantalla se denomina **Llamadas** y declara:

> Registra llamadas contestadas. Si el jefe lo aprueba, suma S/ 0.20 al colaborador.

KPI observados:

| KPI | Valor | Detalle |
|---|---:|---|
| Pendientes | 16 | Esperando revisión |
| Aprobadas | 9 | S/ 1.80 acumulado |
| Rechazadas | 0 | Con motivo |

La relación `9 × S/ 0.20 = S/ 1.80` confirma el importe unitario visible.

### 4.2 Registro manual observado

El formulario `Registrar llamada` contiene:

- DNI del cliente;
- nombre del cliente;
- acción `Guardar llamada`.

No se observan campos para identificador de llamada, número telefónico, duración, hora de inicio/fin, canal, evidencia ni notas. Probablemente el colaborador se obtiene de la sesión activa.

### 4.3 Tabla y flujo de aprobación

Filtros observados:

- DNI, cliente o usuario;
- estado;
- rango de tiempo;
- mes.

Columnas observadas:

| Columna | Contenido |
|---|---|
| Cliente | Nombre ingresado |
| DNI | Documento del cliente |
| Registrado por | Colaborador y sede |
| Fecha | Fecha/hora de registro |
| Comisión | Pendiente o importe aprobado |
| Estado | Pendiente/aprobado/rechazado |
| Acciones | Aprobar / Rechazar |

La aprobación del jefe es la condición que convierte el evento en una comisión. El rechazo indica `Con motivo` en el KPI, por lo que el motivo debería ser obligatorio y auditable.

### 4.4 Diferencia con la política objetivo

La política preliminar considera Pancake como fuente de llamadas entrantes contestadas. La pantalla observada es un registro manual con muy poca evidencia visible.

Para la migración se recomienda:

1. integrar o importar identificadores de llamada desde la fuente disponible;
2. si continúa el registro manual, exigir fecha/hora real, cliente, canal y evidencia o referencia externa;
3. impedir que el beneficiario apruebe su propio registro;
4. detectar duplicados por llamada/cliente/intervalo;
5. congelar el importe al aprobar y vincularlo con la liquidación.

### 4.5 Riesgos observados

- registro repetido del mismo cliente sin identificador de llamada;
- autodeclaración sin evidencia técnica;
- fecha de registro usada como si fuera fecha de llamada;
- aprobación masiva o individual sin motivo visible;
- datos ficticios para generar comisiones pequeñas en volumen;
- ausencia de vínculo con Pancake.

### 4.6 Evidencia pendiente

- diálogo de aprobación y rechazo;
- motivo de rechazo;
- permisos exactos del jefe;
- edición o anulación posterior;
- existencia de evidencia oculta en el detalle;
- validación contra DNI/cliente existente;
- control de duplicados;
- vínculo real con Pancake;
- solicitudes Fetch/XHR de guardar, aprobar y rechazar.

## 5. Tarjetas erróneas

### 5.1 Corrección semántica del nombre

Aunque el menú se llama **Tarjetas erróneas**, la pantalla indica:

> Registro de tarjetas de terceros detectadas. Si el jefe lo aprueba, suma S/ 10 al sueldo.

Por tanto, el concepto real no parece ser una tarjeta inválida o mal digitada. Es un evento de **detección de tarjeta de tercero** o **seguridad de tarjeta**. La migración debería usar un nombre explícito para evitar ambigüedad.

### 5.2 KPI observados

| KPI | Valor | Detalle |
|---|---:|---|
| Pendientes | 2 | Esperando revisión |
| Aprobadas | 7 | S/ 70.00 en bonos |
| Rechazadas | 0 | Con motivo |

La relación `7 × S/ 10.00 = S/ 70.00` confirma el bono unitario visible.

### 5.3 Registro observado

El formulario `Subir tarjeta de terceros` contiene:

- DNI del cliente;
- nombre del cliente;
- fecha detectada;
- tipo, con `Tarjeta de terceros` visible;
- notas opcionales para contexto, lugar de detección o evidencia;
- acción `Guardar tarjeta`.

No se observa carga de archivo, fotografía, operación relacionada, banco, últimos cuatro dígitos ni titular real de la tarjeta.

### 5.4 Tabla y estados

Filtros observados:

- DNI, cliente o usuario;
- estado;
- rango de tiempo;
- mes.

Columnas observadas:

| Columna | Contenido |
|---|---|
| Cliente | Nombre del cliente |
| DNI | Documento |
| Detectado por | Colaborador y sede |
| Fecha detectada | Fecha del evento |
| Bono | S/ 10.00 |
| Estado | Pendiente o aprobada con fecha |
| Notas | Contexto libre |
| Acciones | Aprobar / Rechazar o `Bloqueado` |

Las filas aprobadas aparecen bloqueadas, lo que sugiere que ya no pueden modificarse desde esta vista. El nuevo sistema debe conservar esa inmutabilidad, pero permitir corrección mediante anulación o ajuste trazable, no edición destructiva.

### 5.5 Diferencia con la regla preliminar

La regla inicial mencionaba identificar los últimos cuatro dígitos de tarjetas de terceros. La pantalla observada no incluye un campo específico para esos cuatro dígitos ni una evidencia adjunta.

Debe confirmarse si:

- los dígitos se escriben en Notas;
- se validan en otra pantalla;
- el jefe realiza la comprobación fuera del sistema;
- la regla vigente ya no exige registrar los cuatro dígitos.

Por seguridad, el sistema nuevo nunca debe almacenar el número completo de una tarjeta. Si se confirman los últimos cuatro dígitos como evidencia, deben guardarse únicamente esos cuatro caracteres y con acceso restringido.

### 5.6 Riesgos observados

- evidencia solo textual y opcional;
- ausencia de operación o cliente interno relacionado;
- duplicidad por el mismo cliente/tarjeta/fecha;
- aprobación sin comprobación técnica visible;
- tratamiento de datos sensibles de tarjeta en notas libres;
- imposibilidad aparente de corregir una aprobación errónea;
- confusión entre tarjeta de tercero y tarjeta con error.

### 5.7 Modelo funcional propuesto

Registrar el evento dentro del sistema general de evidencias con:

- tipo `DETECCION_TARJETA_TERCERO`;
- cliente y operación relacionados, cuando existan;
- detector y sede;
- fecha real del evento;
- últimos cuatro dígitos opcionales, solo si la política los exige;
- descripción/evidencia;
- estado de revisión;
- aprobador/rechazador, fecha y motivo;
- importe según regla versionada;
- referencia a la liquidación.

### 5.8 Evidencia pendiente

- diálogo de aprobación/rechazo;
- motivo obligatorio de rechazo;
- validación de los últimos cuatro dígitos;
- vínculo con operación o cliente;
- control de duplicados;
- forma de corregir una fila bloqueada;
- permisos y alcance por sede;
- solicitudes Fetch/XHR de alta y aprobación.

## 6. SafetyPay y Tarjetas comerciales

Estas opciones no deben replicarse dentro del nuevo módulo de compensaciones mientras la plataforma actual pueda suministrar:

- identificador de operación;
- servicio/ruta;
- cliente;
- monto;
- comisión de servicio;
- estado;
- empresa/cuenta;
- usuario registrador, gestor, pagador o derivador;
- sede atribuible;
- fechas relevantes.

El trabajo pendiente no es recrear sus métricas, sino definir qué actor laboral recibe crédito en cada regla y congelar la operación usada como evidencia del cálculo.

Si al revisar el legacy aparece un campo laboral inexistente en el sistema actual —por ejemplo campaña, referido, llamada, asesor externo o validador— se incorporará como dato de atribución o evidencia, no como duplicación completa del módulo legacy.

## 7. Todos los Registros

La opción queda expresamente **pendiente**. Existe la referencia de que podría ser un historial de ingresos, pero el nombre no permite confirmar:

- si reúne referidos, llamadas y tarjetas;
- si muestra ingresos económicos de colaboradores;
- si funciona como auditoría;
- si es un historial de clientes/operaciones;
- si permite editar o exportar.

No se diseñará una pantalla equivalente hasta observar al menos su encabezado, filtros, columnas y acciones. Si solo agrega eventos de otras pantallas, se resolverá como una bandeja unificada de evidencias y no como una entidad independiente.

## 8. Patrón común de las pantallas observadas

Las tres pantallas comparten un patrón:

```text
Colaborador registra evento
        ↓
Evento queda Pendiente
        ↓
Jefe revisa
        ├── Aprueba → genera bono/comisión
        └── Rechaza → no genera importe y conserva motivo
        ↓
Concepto aprobado se incorpora al sueldo/liquidación
```

Esto sugiere implementar un motor común de evidencias y revisiones, con tipos configurables, en lugar de crear una tabla y flujo completamente separados por cada bono.

Elementos comunes:

- beneficiario/detector;
- cliente o sujeto relacionado;
- sede;
- fecha del evento;
- tipo de evidencia;
- datos específicos del tipo;
- estado;
- revisor;
- motivo de rechazo/anulación;
- regla monetaria;
- importe;
- periodo de liquidación.

Referidos requiere además una relación de uno a muchos con operaciones efectivizadas y una regla porcentual, por lo que no puede reducirse a un evento fijo igual que Llamadas o Tarjeta de tercero.

## 9. Entidades preliminares derivadas

| Entidad conceptual | Uso |
|---|---|
| Tipo de evidencia | Define Referido, Llamada, Tarjeta de tercero y futuros conceptos |
| Evidencia laboral | Cabecera común del evento registrado |
| Revisión de evidencia | Aprobación, rechazo, anulaciones y motivos |
| Referido | Atribución única entre cliente y colaborador |
| Operación de referido | Operación elegible, base y comisión calculada |
| Fuente externa | Pancake u otro identificador verificable para llamadas |
| Regla monetaria versionada | Importe fijo o porcentaje y condiciones |
| Línea de liquidación | Resultado aprobado incorporado al periodo |

## 10. Discrepancias y preguntas prioritarias

| Tema | Evidencia legacy | Definición previa/objetivo | Acción requerida |
|---|---|---|---|
| Referido y número de operaciones | `Agregar efectivización` e historial múltiple | Primera operación elegible | Abrir historial y conciliar el KPI de S/ 342.60 |
| Base de referido | Monto y banco manuales | Operación real del sistema | Vincular con `tb_operacion_proceso` y limitar excepciones manuales |
| Comisión elegible | Advertencia exige comisión de 1% | Coincide con política preliminar | Confirmar tasa exacta y exclusiones técnicas |
| Llamada válida | Registro manual de DNI/nombre | Llamada entrante contestada vía Pancake | Buscar identificador/evidencia externa |
| Tarjeta errónea | En realidad es tarjeta de tercero | Seguridad de tarjeta | Renombrar y definir evidencia mínima |
| Últimos cuatro dígitos | No existe campo visible | Regla preliminar los menciona | Revisar detalle/aprobación y política vigente |
| Eliminación | Referidos permite eliminar | Eventos económicos deben auditarse | Confirmar efecto y reemplazar por anulación trazable |
| Todos los Registros | Sin pantalla | Posible bandeja/historial | Mantener pendiente |

## 11. Orden recomendado para continuar

1. Abrir `Agregar efectivización` y el historial de un referido.
2. Mostrar el flujo de aprobación o validación de Referidos.
3. Aprobar y rechazar una Llamada de prueba para observar diálogos y estados.
4. Abrir o corregir una Tarjeta de tercero aprobada/bloqueada.
5. Revisar una fila con notas/evidencia en Tarjetas erróneas.
6. Capturar solicitudes Fetch/XHR sanitizadas de los tres flujos.
7. Abrir Todos los Registros para decidir si se conserva como bandeja unificada.

Con estas evidencias se podrá cerrar el catálogo común de eventos, definir la atribución de Referidos y evitar módulos duplicados respecto de las operaciones actuales.
