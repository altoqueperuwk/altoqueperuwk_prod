# Levantamiento del legacy — matriz madre y Reportes

## 1. Objetivo y alcance

Este documento mapea las pantallas **Administración** y **Reportes** del grupo Sistema del legacy. Administración funciona como matriz madre de valores que alimentan sueldos, bonos, comisiones, penalidades y metas. Reportes presenta resultados financieros y métricas de productividad.

No se recibió la pantalla **Historial de cambios** porque es una visualización interna del legacy y no aporta una regla económica adicional. Esto no elimina el requisito de auditoría: el sistema nuevo debe registrar todos los cambios de configuración, aunque esa auditoría se consulte mediante historiales contextuales, detalles o reportes administrativos en lugar de copiar la pantalla legacy.

El análisis distingue:

- **Observado:** aparece directamente en las capturas.
- **Inferido:** interpretación sustentada por relaciones visibles, pendiente de confirmación.
- **Pendiente:** requiere interacción, exportación o datos de red.

## 2. Conclusión principal

Administración confirma que el cálculo no debería implementarse con importes escritos directamente en funciones SQL o componentes frontend. Se requiere una matriz versionada con niveles de configuración:

```text
Parámetros globales por concepto
        ↓
Valores predeterminados por cargo
        ↓
Metas y reglas por sede/periodo
        ↓
Excepciones individuales con vigencia
        ↓
Valor congelado al crear evento o calcular liquidación
        ↓
Snapshot inmutable al cerrar el periodo
```

El legacy declara que los meses cerrados mantienen su cierre congelado y que las penalidades ya creadas conservan el monto con el que fueron reportadas. Ambos comportamientos deben preservarse.

## 3. Administración — parámetros generales de pago

### 3.1 Propósito observado

La pantalla se denomina **Administración** y se describe como parámetros generales de pagos, bonos y metas del sistema.

El bloque `Parámetros generales de pago` indica que los valores alimentan:

- sueldos;
- reportes;
- comisiones;
- vistas del colaborador.

También declara que los meses cerrados conservan su cierre congelado.

### 3.2 Valores globales observados

| Parámetro | Valor visible | Interpretación preliminar |
|---|---:|---|
| Registro válido | S/ 0.70 | Probable comisión por cliente nuevo que opera dentro de siete días |
| Llamada aprobada | S/ 0.20 | Comisión fija por llamada aprobada |
| Calificación aprobada | S/ 2.00 | Comisión por calificación válida de 4–5 estrellas |
| Tarjeta errónea aprobada | S/ 10.00 | Bono por detección aprobada de tarjeta de tercero |

`Registro válido` debe confirmarse porque el nombre no describe por sí solo el evento. Por correspondencia con las reglas y reportes, probablemente representa `Registro nuevo y efectivización`, pero no debe renombrarse ni automatizarse sin revisar la respuesta de red o un detalle de cálculo.

### 3.3 Requisitos de modelado

Cada parámetro debe tener:

- código estable;
- nombre y descripción;
- tipo de concepto: bono, comisión o penalidad;
- forma de cálculo: monto fijo, porcentaje, por minuto, bolsa o tramo;
- moneda/unidad;
- valor;
- fecha de inicio y fin de vigencia;
- puestos/sedes/modalidades aplicables;
- condiciones y exclusiones;
- usuario y motivo del cambio;
- estado;
- versión.

Actualizar un parámetro solo debe afectar eventos futuros o cálculos no congelados según una política explícita. Nunca debe modificar silenciosamente una línea aprobada o un periodo cerrado.

## 4. Bonos de jefatura y SafetyPay

### 4.1 Valores observados

| Parámetro | Valor |
|---|---:|
| Jefe: aprobar calificación | S/ 0.30 |
| Jefe: validar operación | S/ 0.30 |
| Jefe: penalidad aprobada | S/ 1.00 |
| SafetyPay mínimo compartido | 80.00% |
| Bolsa compartida | S/ 300.00 |
| Bono jefe 100% | S/ 200.00 |

El bloque se describe como montos automáticos para jefes y reparto cuando la sede alcanza la meta.

### 4.2 Interpretación funcional

- `Jefe: aprobar calificación` parece remunerar la aprobación de calificaciones.
- `Jefe: validar operación` parece remunerar una validación operativa.
- `Jefe: penalidad aprobada` podría remunerar una incidencia detectada/aprobada, pero debe distinguirse del bono S/ 1 de Auditoría de pagos.
- `SafetyPay mínimo compartido` activa la bolsa de sede al alcanzar 80%.
- `Bolsa compartida` corresponde a S/ 300 distribuidos entre personal elegible.
- `Bono jefe 100%` corresponde a S/ 200 cuando la sede llega a la meta completa.

Las tres acciones remuneradas de jefatura requieren controles antifraude. Aprobar una actividad no debe producir automáticamente un bono si el jefe aprueba su propio evento, si la acción se revierte o si el mismo hecho se cuenta por más de una regla.

### 4.3 Preguntas pendientes

- ¿Cada aprobación genera S/ 0.30 o existen topes mensuales?
- ¿Qué estado final y qué entidad constituyen `validar operación`?
- ¿S/ 1 corresponde al jefe aprobador o al detector/reportante?
- ¿La bolsa se divide entre todos los colaboradores o solo elegibles?
- ¿La meta de 80% y la meta de 100% generan bonos acumulables?
- ¿Qué sucede si la meta cambia durante el mes?

## 5. Metas SafetyPay por sede

### 5.1 Valores observados

| Sede | Meta mensual visible |
|---|---:|
| Lince | S/ 500,000.00 |
| Sur | S/ 900,000.00 |
| Norte | S/ 900,000.00 |
| Miraflores | S/ 400,000.00 |

La pantalla indica que la meta mensual se utiliza para progreso, bono compartido y bono de jefe.

### 5.2 Decisión de diseño

Las metas no deben guardarse como cuatro columnas fijas. Deben modelarse como registros por:

- sede;
- periodo o vigencia;
- servicio/indicador, en este caso SafetyPay;
- monto meta;
- umbral de bolsa;
- umbral de bono de jefatura;
- fuente del monto ejecutado;
- versión y responsable.

Así se podrán agregar sedes, cambiar metas por mes y conservar el valor histórico usado en cada cierre.

Debe confirmarse qué monto alimenta el progreso: recaudación, transferencia, número de operaciones u otra base. La documentación previa propone volumen efectivizado pagado; la pantalla por sí sola no lo demuestra.

## 6. Tarjetas comerciales dentro de Administración

### 6.1 Valores observados

| Regla | Valor |
|---|---:|
| Comisión porcentual | 8.00% |
| Comisión mínima | S/ 30.00 |
| Monto hasta comisión mínima | S/ 375.00 |

Existe consistencia matemática:

```text
S/ 375.00 × 8% = S/ 30.00
```

### 6.2 Descarte semántico

Estas reglas corresponden a la comisión comercial/financiera de una operación de tarjeta, no a una compensación laboral. El legacy mezcla ambos dominios en Administración, pero el sistema nuevo debe separarlos:

- reglas de Tarjetas comerciales → configuración operativa de POS/Link Pago;
- bonos/comisiones del colaborador → matriz de compensaciones;
- una operación puede ser evidencia de una comisión laboral sin reutilizar el importe financiero como sueldo.

No se debe duplicar esta configuración dentro del nuevo módulo si ya existe o debe existir en las reglas operativas actuales. La matriz de compensaciones puede leer la operación resultante, no administrar el 8%, mínimo S/ 30 o umbral S/ 375.

## 7. Valores por cargo

### 7.1 Comportamiento observado

El bloque indica:

> Referencia base para nuevos cambios de cargo. Si un colaborador ya tiene sueldo editado en su ficha, se mantiene ese valor individual.

La tabla también repite la nota `No pisa sueldos personalizados`.

Esto confirma dos niveles:

1. valor predeterminado por cargo;
2. excepción individual del colaborador.

La excepción individual no debe almacenarse sin fecha de vigencia ni justificación. Para un cambio futuro debe poder volver a heredarse el valor del cargo o conservarse explícitamente la excepción.

### 7.2 Matriz observada

| Cargo | Sueldo base | Penalidad tardanza | Bono puntualidad | Bono por cuadre |
|---|---:|---:|---:|---:|
| Jefe de Pagos | S/ 3,000.00 | S/ 1.00/min | S/ 150.00 | S/ 100.00 |
| Subjefe de Pagos | S/ 2,500.00 | S/ 1.00/min | S/ 100.00 | S/ 75.00 |
| Encargado de Pagos | S/ 2,000.00 | S/ 1.00/min | S/ 100.00 | S/ 50.00 |
| Jefe de Sede | S/ 1,500.00 | S/ 0.70/min | S/ 70.00 | S/ 0.00 |
| Personal Registro | S/ 1,250.00 | S/ 0.50/min | S/ 50.00 | S/ 0.00 |
| Facturación | S/ 1,500.00 | S/ 0.70/min | S/ 50.00 | S/ 0.00 |
| Marketing | S/ 0.00 | S/ 0.00/min | S/ 0.00 | S/ 0.00 |

### 7.3 Correspondencia con el levantamiento anterior

| Cargo legacy | Perfil preliminar equivalente | Observación |
|---|---|---|
| Jefe de Pagos | Jefe superior de Pagos | Sueldo y bono de cuadre coinciden; penalidad por minuto difiere del S/ 1.50 transcrito inicialmente |
| Subjefe de Pagos | Operador de alta demanda | Sueldo aclarado de S/ 2,500 y bono puntualidad S/ 100 coinciden |
| Encargado de Pagos | Cartera media | Sueldo S/ 2,000 y bono de cuadre S/ 50 coinciden |
| Jefe de Sede | Jefe de Tienda | Sueldo, tardanza y puntualidad coinciden |
| Personal Registro | Atención al Cliente | Sueldo, tardanza y puntualidad coinciden |
| Facturación | Facturación | Sueldo, tardanza y puntualidad coinciden |
| Marketing | Diseño/Marketing | El legacy lo conserva sin valores configurados; continúa fuera de la primera versión |

La denominación real de cargos debe tomarse del legacy o del catálogo laboral vigente, no del rol técnico `tb_rol`.

### 7.4 Evidencia de excepciones individuales

Las capturas previas de Colaboradores son coherentes con esta regla:

- Jefe de Sede tiene valor predeterminado de S/ 1,500, pero se observó una ficha con S/ 1,700.
- Personal Registro tiene valor predeterminado de S/ 1,250, pero una colaboradora part time mostró S/ 625.

Esto refuerza la necesidad de manejar sueldo, jornada y excepción individual con vigencias, sin sobrescribir históricos.

### 7.5 Prioridad de resolución propuesta

Para una fecha determinada:

```text
Excepción individual vigente
        ↓ si no existe
Valor del cargo/plan vigente
        ↓ si no existe
Error de configuración que bloquea el cálculo
```

No se recomienda usar un valor global silencioso como último fallback para sueldo o penalidad. Una liquidación debe fallar de forma visible si el colaborador carece de asignación o plan aplicable.

## 8. Penalidades de Atención al Cliente

### 8.1 Comportamiento observado

El bloque declara:

> Montos usados cuando se crean nuevos reportes de penalidad. Las penalidades ya creadas conservan el monto con el que fueron reportadas.

Esta frase confirma snapshot por evento y vigencia hacia adelante. Una modificación de la matriz no altera reportes ya creados.

### 8.2 Catálogo observado

| Código | Penalidad | Monto | Descripción visible |
|---|---|---:|---|
| `ERROR_DATOS` | Error de datos | S/ 2.00 | Dato errado remanente en formulario detectado por Facturación o jefe |
| `ABANDONO_CHAT` | Abandono chat | S/ 2.00 | Chat con más de 20 minutos sin respuesta |
| `MAL_FLUJO_CMR_SAFETY` | Mal flujo CMR / Safety | S/ 2.00 | Omitir protocolo obligatorio o responder con textos genéricos |
| `PROCESO_AL_AIRE` | Dejar conversación/proceso al aire | S/ 2.00 | Chat abandonado sin registrar datos obligatorios de cuentas o tarjetas |
| `ERROR_REGISTRO_MANUAL` | Error en registro manual o código | S/ 2.00 | DNI, nombre, celular, correo o código ingresado incorrectamente |
| `FALTA_UNIFORME` | Falta de uniforme completo | S/ 10.00 | Asistencia sin polo o uniforme oficial |

### 8.3 Alcance incompleto de la matriz visible

No aparecen en la captura, entre otros:

- indisciplina recurrente;
- tolerancia cero/antifraude;
- error de supervisión del jefe;
- error con/sin solución de Facturación;
- cierre incompleto y retraso de vouchers de Pagos;
- error crítico de pago;
- descuadre;
- descuentos escalonados de 30%, 60% y 90%;
- penalidad de tardanza, que se configura por cargo.

Debe determinarse si esos conceptos se encuentran más abajo en la misma pantalla, en otra configuración o si no fueron implementados en el legacy.

### 8.4 Modelo recomendado

El catálogo no debe limitarse a código, monto y descripción. Cada penalidad requiere:

- área/cargo aplicable;
- unidad de cálculo;
- importe o porcentaje;
- base afectada: sueldo, comisiones o importe fijo;
- acumulabilidad;
- topes;
- evidencia obligatoria;
- rol aprobador;
- posibilidad y plazo de descargo;
- efectos relacionados, como pérdida del bono de puntualidad;
- fecha de vigencia y versión.

## 9. Reportes — resumen financiero

### 9.1 Propósito observado

La pantalla **Reportes** genera un PDF financiero con sueldos, comisiones, tardanzas, descuentos y total pagado del mes.

Controles observados:

- tipo de reporte, con `General financiero` visible;
- mes a consultar;
- estado del mes, con `Mes abierto` visible;
- sede del reporte;
- Descargar reporte PDF.

Totales visibles para septiembre de 2026:

| Total | Valor |
|---|---:|
| Total sueldo | S/ 18,354.89 |
| Total comisiones | S/ 3,589.10 |
| Descuentos | S/ 2,258.50 |
| Total a pagar | S/ 21,943.99 |

La aritmética visible es:

```text
S/ 18,354.89 + S/ 3,589.10 = S/ 21,943.99
```

Los descuentos no se restan nuevamente, por lo que parecen estar incluidos en el `Total sueldo` neto o en otro componente ya neteado.

### 9.2 Inconsistencia en Distribución de pagos

El gráfico muestra:

| Componente | Valor |
|---|---:|
| Sueldo neto | S/ 18,354.89 |
| Comisiones | S/ 4,637.80 |
| Descuentos | S/ 2,258.50 |

El valor de Comisiones del gráfico (`S/ 4,637.80`) no coincide con el Total comisiones del formulario (`S/ 3,589.10`). La diferencia es:

```text
S/ 4,637.80 - S/ 3,589.10 = S/ 1,048.70
```

Debe identificarse qué conceptos forman esa diferencia: bonos incluidos, referidos, registros pendientes u otra categoría. No se debe copiar el gráfico ni la fórmula hasta conciliarla con el PDF.

## 10. Reportes — KPI observados

| KPI | Valor | Detalle visible |
|---|---:|---|
| Clientes nuevos | 50 | 12 efectivizados y 38 solo registrados |
| Efectivización | 24.0% | Operaciones dentro de 7 días versus solo registros |
| Productividad | 919 | 907 calificaciones aprobadas, promedio 5.0 |
| Puntualidad | 15/31 | 33 tardanzas y 100h 07m extra |
| Asistencia | 310 | Días pagables acumulados |

`12 / 50 = 24%`, por lo que el KPI Efectivización representa conversión de clientes nuevos dentro de siete días.

El KPI Productividad merece revisión: `907 calificaciones aprobadas + 12 clientes nuevos efectivizados = 919`, coincidencia que puede ser la fórmula usada, aunque el texto visible solo menciona calificaciones.

## 11. Reportes — Registro vs operación y productividad por sede

### 11.1 Definiciones visibles

El gráfico explica:

- `Registro`: cliente nuevo que no efectivizó en siete días.
- `Operación`: cliente nuevo que sí efectivizó en siete días.

Se observan valores de 228 Solo registro y 911 Operación. Estos totales no coinciden con el KPI superior de 50 clientes nuevos, por lo que probablemente corresponden a otra población, granularidad o periodo acumulado. Debe confirmarse si cuentan registros, actividades u operaciones en lugar de clientes únicos.

### 11.2 Resumen por sede

Columnas observadas:

- sede;
- colaboradores;
- solo registro;
- operación;
- clientes nuevos;
- efectivización;
- comisiones;
- total a pagar;
- actividad.

La tabla permite inferir:

```text
Clientes nuevos = Solo registro + Operación
Efectivización = Operación / Clientes nuevos × 100
```

Ejemplos:

- Lince: `29 + 219 = 248`; `219 / 248 = 88.3%`.
- Sur: `136 + 280 = 416`; `280 / 416 = 67.3%`.
- Norte: `28 + 339 = 367`; `339 / 367 = 92.4%`.
- Miraflores: `35 + 76 = 111`; `76 / 111 = 68.5%`.

El título `Productividad por sede` representa en realidad volumen de registros/clientes y conversión, no el mismo concepto que el KPI Productividad de 919.

## 12. Reportes — productividad por colaborador

Columnas observadas:

- colaborador;
- sede;
- solo registro;
- operación;
- efectivización;
- calificaciones;
- extras;
- puntaje;
- avance.

Las filas permiten inferir las fórmulas:

```text
Efectivización = Operación / (Solo registro + Operación) × 100
Puntaje = Operación + Calificaciones + Extras
```

Ejemplos:

- Mariana: `169 + 84 + 1 = 254` puntos.
- Valeria: `76 + 86 + 3 = 165` puntos; sus 28 Solo registro no suman puntaje.
- Ivonne: `36 + 129 + 0 = 165` puntos.
- Danna: `98 + 16 + 5 = 119` puntos.

Por tanto, `Solo registro` sirve para calcular conversión, pero no aporta al puntaje visible. La definición de `Extras` permanece pendiente.

### 12.1 Decisión funcional

Estas métricas son útiles como analítica laboral, pero el puntaje no debe convertirse automáticamente en dinero salvo que exista una regla versionada que lo indique. Debe diferenciarse:

- métrica informativa;
- criterio para ranking;
- condición de un bono;
- concepto monetario liquidable.

## 13. Historial de cambios

No es necesario replicar una pantalla independiente idéntica al legacy. Sin embargo, se requiere auditoría obligatoria para:

- parámetros generales;
- valores por cargo;
- excepciones individuales;
- metas por sede;
- catálogo de penalidades;
- aprobaciones/rechazos;
- cálculos y recálculos;
- pagos;
- cierres y reaperturas;
- ajustes posteriores.

Cada registro de auditoría debe conservar entidad, identificador, valores antes/después, usuario, fecha, motivo y correlación de la acción. La consulta puede presentarse dentro de cada ficha o mediante un reporte administrativo global.

## 14. Arquitectura propuesta para la matriz madre

### 14.1 Separación de dominios

| Dominio | Configuración |
|---|---|
| Compensaciones | Bonos, comisiones laborales, penalidades, sueldos, cargos y metas |
| Operaciones comerciales | Tasas POS/Link Pago, mínimos y reglas financieras |
| Analítica laboral | KPI, conversiones, rankings y puntajes no monetarios |
| Auditoría | Versiones, cambios, aprobaciones y snapshots |

### 14.2 Componentes conceptuales

| Componente | Responsabilidad |
|---|---|
| Catálogo de conceptos | Identidad y tipo de sueldo/bono/comisión/penalidad |
| Plan de compensación | Agrupa reglas aplicables por puesto/modalidad |
| Versión de plan | Congela valores y condiciones por vigencia |
| Regla de concepto | Fórmula, unidad, monto, porcentaje, topes y condiciones |
| Meta por sede | Objetivo mensual e indicador fuente |
| Asignación laboral | Relaciona colaborador, cargo, sede, jornada y plan |
| Excepción individual | Sobrescribe una regla con vigencia y motivo |
| Evento económico | Evidencia aprobada con valor congelado |
| Línea de liquidación | Resultado reproducible del cálculo |
| Snapshot de periodo | Estado final inmutable |

### 14.3 Regla de congelamiento

Se requieren tres momentos distintos:

1. **Evento creado:** conserva el valor vigente si la política del concepto así lo define, como penalidades reportadas.
2. **Liquidación calculada/aprobada:** conserva regla, base, cantidad e importe usados.
3. **Periodo cerrado:** congela identidad laboral, totales, pagos, aprobaciones y exportaciones.

Una modificación futura genera una nueva versión; no actualiza filas históricas.

## 15. Discrepancias y preguntas prioritarias

| Tema | Evidencia legacy | Definición previa | Acción requerida |
|---|---|---|---|
| Penalidad Jefe de Pagos | S/ 1.00/min | Documento transcrito indicaba S/ 1.50/min | Confirmar política vigente |
| Bono de jefe por penalidad | S/ 1.00 | Puede coincidir con detector de Auditoría de pagos | Evitar doble bono y definir beneficiario |
| Registro válido | S/ 0.70 | Cliente nuevo que opera en siete días | Confirmar evento exacto y actor beneficiario |
| Comisión Reportes | S/ 3,589.10 vs gráfico S/ 4,637.80 | Debe existir un total único conciliable | Comparar PDF y respuesta de red |
| Productividad | KPI 919 y sede basada en registros | El término se usa para métricas distintas | Renombrar indicadores en el nuevo sistema |
| Referidos | No se distingue en Administración | Regla porcentual 0.4% | Ubicar configuración real y vigencia |
| Penalidades faltantes | Solo seis de Atención al Cliente visibles | Catálogo preliminar más amplio | Revisar resto de pantalla/configuración |
| Excepción individual | No pisa sueldos personalizados | Se requiere prorrateo por vigencia | Revisar edición y cambio de cargo a mitad de mes |

## 16. Evidencia pendiente

1. Captura completa de Administración hasta el final de la página.
2. Acción para guardar parámetros y confirmación mostrada.
3. Respuesta Fetch/XHR de lectura y guardado de la matriz, sin tokens.
4. Cambio controlado de un valor y efecto en un mes abierto.
5. Confirmación de que un mes cerrado no cambia.
6. Detalle de una excepción individual y su vigencia.
7. Catálogo completo de penalidades por área/cargo.
8. Configuración de Referidos y reglas porcentuales.
9. PDF `General financiero` del mismo mes mostrado.
10. Otros tipos disponibles en `Tipo de reporte`.
11. Definición de `Extras` y fuente de cada punto.
12. Conciliación de S/ 3,589.10 frente a S/ 4,637.80.

## 17. Orden recomendado para la especificación técnica

1. Cerrar catálogo de cargos y equivalencias laborales.
2. Definir conceptos económicos y unidades de cálculo.
3. Diseñar planes/versiones y excepciones individuales.
4. Modelar metas por sede y fuente de progreso.
5. Separar reglas comerciales de tarjetas del dominio laboral.
6. Definir snapshots de evento, liquidación y cierre.
7. Conciliar un PDF completo contra la pantalla y casos individuales.
8. Recién después diseñar tablas SQL, RPC, permisos y pantallas administrativas.

Esta matriz madre es la base de configuración del nuevo módulo, pero debe normalizarse y versionarse; copiarla como un único formulario mutable reproduciría las ambigüedades y mezclas de dominio del legacy.
