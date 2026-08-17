# Retenciones Informativas Y Operaciones Fuera De Horario

## Objetivo

Documentar la nueva forma de trabajar las retenciones antes de modificar el
backend y el frontend.

La retención dejará de representar un importe que el sistema liberará
automáticamente. Será una marca informativa del depósito que quedó fuera del
corte de la cuenta.

También se diferenciarán los depósitos que fueron cargados tarde, pero que en
realidad pertenecían al horario anterior. Estos se identificarán como
**Fuera de Horario** para no mezclarlos con una retención real.

## Configuración

En el modal **Reglas de Abono** se conservará únicamente:

| Campo | Uso |
|---|---|
| Hora Corte | Define hasta qué hora los depósitos pertenecen al corte del día. |

Los campos `Dias Habiles Abono`, `Hora Liberacion`, `Base de Calculo del Abono`
y `Liberacion Automatica` dejarán de participar en la operación diaria. Sus
columnas podrán conservarse temporalmente en la base de datos para no romper
funciones antiguas, pero no deben solicitarse al usuario en el nuevo flujo.

Ejemplo:

```text
Empresa: Capital Nova S.A.
Cuenta:  BCP
Hora de corte: 21:00
```

## Cómo Se Clasifica Un Depósito

La fuente de verdad será `fecha_deposito_cliente`, convertida a la zona horaria
de Lima. La fecha en que se cargó el Excel solo sirve para identificar si el
registro llegó tarde al sistema.

| Fecha del depósito | Fecha de carga | Resultado propuesto | Retención Recaudación |
|---|---|---|---:|
| Ayer 20:00 | Ayer 20:30 | Operación normal | No suma |
| Ayer 18:00 | Hoy 09:00 | Fuera de Horario | No suma |
| Ayer 22:00 | Hoy 09:00 | Retenido real | Sí suma |
| Hoy 08:00 | Hoy 09:00 | Retenido real | Sí suma |

Con una hora de corte a las 21:00:

- Un depósito de ayer a las 18:00 no debería considerarse retenido solo porque
  apareció en el Excel de hoy.
- Un depósito de ayer a las 22:00 sí pertenece al periodo posterior al corte y
  debe conservarse como retenido.
- Un depósito de hoy a las 08:00 también pertenece al periodo posterior al
  corte anterior y debe conservarse como retenido.

## Nueva Marca: Fuera De Horario

Se propone agregar a `tb_operacion_proceso`:

```text
flag_fuera_horario boolean NOT NULL DEFAULT false
```

La marca indicará que el depósito fue cargado después, aunque su fecha de
depósito corresponda al horario anterior al corte.

Para que exista trazabilidad, también se recomienda guardar:

```text
fecha_fuera_horario timestamp with time zone
id_usuario_fuera_horario bigint
motivo_fuera_horario character varying
```

El mínimo necesario para iniciar sería `flag_fuera_horario`. Los otros campos
son recomendables porque permiten saber quién hizo la clasificación y cuándo.

## Relación Con La Caja Inicial

Esta es la regla principal para cuadrar el sistema con la banca móvil.

Al comenzar la jornada, por ejemplo a las 09:00, el operador registra:

```text
Caja Inicial = saldo que muestra la banca móvil
Caja Actual  = saldo que muestra la banca móvil
```

Ese saldo puede incluir depósitos realizados antes de la hora de corte, aunque
todavía no hayan sido cargados en nuestro sistema.

### Ejemplo

```text
Hora de corte:                         21:00 del día anterior
Depósito realizado:                    18:00 del día anterior
Carga del Excel:                       09:00 del día actual
Saldo de banca móvil al iniciar:      S/ 10,000.00
Caja inicial registrada en el sistema: S/ 10,000.00
```

Cuando el depósito de S/ 1,000.00 aparece en el Excel, no debe volver a sumar
S/ 1,000.00 a la caja. Ese importe ya estaba incluido en los S/ 10,000.00 que
el operador registró desde la banca móvil.

Por eso, al marcarlo como **Fuera de Horario**:

- no aumenta `Caja Actual`;
- no aumenta `Caja Recaudación`;
- no se suma nuevamente a `Ingresos`;
- no genera un ingreso contable que duplique la banca móvil;
- queda visible en el KPI `Fuera de Horario`;
- queda disponible para trazabilidad y consulta del cierre.

La marca no significa que el depósito no exista. Significa que el depósito ya
estaba considerado en el saldo inicial informado por la banca móvil.

## Diferencia Entre Retenido Y Fuera De Horario

| Tipo | ¿Ya está en la banca móvil al iniciar? | ¿Aumenta la caja actual? | KPI |
|---|---:|---:|---|
| Retenido real | No | No | Retención Recaudación |
| Fuera de Horario | Sí | No | Fuera de Horario |
| Operación normal | Sí o corresponde al ciclo actual | Según el flujo normal | KPI operativo correspondiente |

La diferencia no está en que uno de los depósitos exista y el otro no. La
diferencia está en si el saldo fue considerado previamente al registrar la
caja inicial.

La suma informativa debe permitir explicar la conciliación:

```text
Saldo informado por banca móvil:       S/ 10,000.00
Depósitos Fuera de Horario cargados:   S/ 1,000.00
Retención real pendiente:              S/ 2,000.00
Saldo actual del sistema:              S/ 10,000.00
```

En este ejemplo, los S/ 1,000.00 fuera de horario no se agregan otra vez. Los
S/ 2,000.00 retenidos reales tampoco ingresan a la caja hasta que exista una
acción manual autorizada, según la nueva definición del negocio.

## Fuente De Verdad

La conciliación quedará separada en tres fuentes:

1. **Caja Inicial:** saldo real informado por la banca móvil al iniciar la
   jornada.
2. **Retención Recaudación:** depósitos que todavía no deben considerarse
   disponibles en la caja.
3. **Fuera de Horario:** depósitos que ya estaban incluidos en la caja inicial,
   pero fueron cargados posteriormente en el sistema.

Con esta separación, el sistema podrá explicar por qué una operación aparece
en el Excel sin volver a modificar el saldo actual.

## Uso En La Bandeja

En el tab **Efectivización** se agregará una columna:

```text
Fuera de Horario
```

La columna mostrará un switch o control equivalente. La edición deberá estar
permitida únicamente mientras la operación siga abierta y la caja del ciclo no
esté cerrada.

Al marcar una operación como Fuera de Horario:

- dejará de sumar en `Retención Recaudación`;
- no aparecerá en el tab `Retenidos` como retención real;
- continuará visible en su flujo operativo para que el usuario pueda atenderla;
- no deberá modificar por sí sola el saldo de la caja;
- conservará el depósito y el resto de sus cálculos originales.

Una operación pagada o perteneciente a un cierre histórico deberá quedar
bloqueada para cambiar esta clasificación.

## Nuevos KPI

Se propone mostrar un KPI adicional:

```text
Fuera de Horario
```

Este KPI debe mostrar el importe de las operaciones marcadas con
`flag_fuera_horario = true`.

Ejemplo:

```text
Depósitos cargados:                 S/ 10,000.00
Retención real:                     S/ 6,000.00
Fuera de Horario:                   S/ 4,000.00
Retención Recaudación:              S/ 6,000.00
```

La suma de `Retención Recaudación` no debe incluir los S/ 4,000.00 fuera de
horario. Así el KPI coincide con lo que realmente está retenido en la banca.

## Cierre De Caja

El cierre debe congelar ambos tipos de información en el ciclo que les
corresponde:

- operaciones retenidas reales;
- operaciones marcadas como Fuera de Horario;
- movimientos relacionados;
- operaciones pagadas del ciclo.

La siguiente caja debe comenzar con los KPI definidos por la nueva directriz,
sin arrastrar importes del cierre anterior.

Las operaciones fuera de horario no deben sumarse como retención en la caja
siguiente. Deben permanecer consultables en el historial del cierre donde
fueron clasificadas.

## Liberación Manual

La liberación automática debe permanecer desactivada. Los jobs pueden continuar
existiendo, pero la función invocada debe responder sin liberar fondos.

La única acción operativa futura sería **Forzar Abono**, ejecutada manualmente
por un usuario autorizado sobre una retención real.

La acción no debe estar disponible para una operación marcada como Fuera de
Horario, porque esa operación no representa una retención real pendiente de
liberación.

## Regla Recomendada

Se recomienda que el backend calcule automáticamente una candidata a Fuera de
Horario y que el usuario confirme la marca desde la bandeja.

Esto evita depender únicamente de una decisión manual y permite corregir casos
excepcionales antes de cerrar la caja.

La clasificación recomendada es mutuamente excluyente:

```text
Fuera de Horario = true  ->  Retenido real = false
Retenido real = true     ->  Fuera de Horario = false
```

Así una misma operación nunca infla los dos KPI.

## Funciones Que Se Deberán Revisar

Esta lista es para la siguiente etapa; todavía no se modifican.

### Tabla Y Datos

- `tb_operacion_proceso`: agregar la marca y, si se aprueba, los datos de
  auditoría.

### Registro Y Actualización

- `f_post_tb_operacion_proceso_excel`
- `f_post_tb_operacion_proceso`
- `f_patch_tb_operacion_proceso`
- función nueva para marcar o desmarcar Fuera de Horario de forma atómica.

### Retención Y KPI

- `f_get_tb_ruta_operacion_kpi`
- `f_sync_tb_ruta_operacion_kpi_caja`
- `f_get_tb_operacion_retencion_bandeja`
- `f_get_tb_operacion_retencion_bandeja_badges`
- `f_get_tb_operacion_retencion_empresa_badges`

### Cierre Y Reportes

- `f_post_tb_caja_operativa_cierre`
- `f_get_reporte_cierre`
- funciones que generan PDF y Excel.

### Configuración Y Liberación

- `f_patch_tb_recaudacion_regla_abono`
- `f_run_tb_recaudacion_liberar_retenciones`
- `f_patch_tb_recaudacion_confirmar_si_vencida`
- `f_patch_tb_operacion_proceso_confirmar_retencion`
- `f_patch_tb_operacion_caja_confirmar_retencion`

## Decisiones Pendientes

Antes de implementar se debe confirmar:

1. Si Fuera de Horario se detectará automáticamente, manualmente o con
   detección automática más confirmación manual.
2. Si se agregarán los campos de auditoría o solo el flag.
3. Si una operación fuera de horario seguirá visible en `Todos`, `Pendientes` y
   `Pagados`, pero no en `Retenidos`.
4. Si una operación fuera de horario podrá ser pagada normalmente sin cambiar
   su clasificación.
5. Qué ocurre si no existe una Hora Corte para la cuenta.
6. Qué perfiles podrán marcar o desmarcar Fuera de Horario.

## Validaciones Antes De Programar

- Depósito antes del corte cargado después: queda Fuera de Horario y no suma en
  Retención Recaudación.
- Depósito después del corte: queda como retención real.
- Depósito del día actual antes de la hora de trabajo: queda como retención real
  respecto al corte anterior.
- Operación pagada retenida: sigue visible en su flujo y en Retenidos hasta que
  se fuerce el abono.
- Operación fuera de horario pagada: no aparece como retención real.
- Cierre histórico: conserva la clasificación y sus importes.
- Nueva caja: comienza con los KPI en cero.
- Los jobs no liberan automáticamente ninguna operación.

## Estado Actual

En la versión actual todavía existen los campos y controles antiguos de la regla
de abono. El job de liberación tiene una salida segura para no liberar
retenciones, pero las consultas siguen usando `flag_retenido` como criterio
principal. Por eso primero debe aprobarse esta definición y luego implementarse
la nueva marca en todos los puntos de registro, consulta, KPI, cierre y reporte.
