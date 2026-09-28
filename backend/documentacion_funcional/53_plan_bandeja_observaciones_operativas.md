# Plan inicial: recordatorios de operaciones pendientes

## 1. Objetivo corregido

Agregar una bandeja personal de recordatorios para que, desde el datatable
`Operaciones Pendientes` de Métricas Bancarias, un usuario autorizado pueda
avisar al usuario que creó una operación que debe completarla o cerrarla.

El recordatorio:

- siempre se vincula a una operación pendiente concreta;
- se dirige automáticamente a `tb_operacion_proceso.id_usuario_solicitud`;
- utiliza un mensaje predeterminado;
- clasifica el mensaje en uno de tres niveles de alerta;
- no se responde ni se resuelve desde Métricas Bancarias;
- permanece activo aunque haya sido leído;
- se cierra automáticamente cuando la operación deja de estar pendiente;
- permite abrir directamente la bandeja operativa donde debe atenderse.
- se consulta desde la ruta personal `/bandeja`, accesible en el footer del
  sidebar, encima de `Light mode`.

La funcionalidad no será un chat ni un sistema independiente de incidencias.
Será un mecanismo de seguimiento para devolver la responsabilidad operativa al
usuario que originó la operación.

## 2. Flujo funcional

```text
Métricas Bancarias
  -> Operaciones Pendientes
  -> Acción "Enviar recordatorio"
  -> Selección de mensaje predeterminado
  -> Confirmación
  -> Ruta /bandeja del usuario creador
  -> Usuario abre la operación
  -> Usuario completa/cierra la operación en Operaciones
  -> El recordatorio se cierra automáticamente
```

Métricas Bancarias solo inicia y consulta el seguimiento. La corrección de la
operación se realiza exclusivamente en el módulo operativo correspondiente.

## 3. Alcance del MVP

### Incluido

- Botón de mensaje en la columna `Acciones` de cada operación pendiente.
- Destinatario automático según `id_usuario_solicitud`.
- Tres niveles de alerta, cada uno con un comentario predeterminado.
- Confirmación antes de enviar.
- Acceso `Bandeja` con icono de mensaje en el footer del sidebar, encima de
  `Light mode`.
- Badge persistente con la cantidad de operaciones pendientes notificadas.
- Ruta `/bandeja` con datatable de recordatorios activos e historial.
- Marca independiente para recordatorios nuevos o ya leídos.
- Navegación directa a la operación o bandeja correspondiente.
- Cierre automático cuando la operación deja de cumplir la regla de pendiente.
- Registro del usuario que envió el recordatorio y de las fechas de envío,
  lectura y cierre.
- Prevención de recordatorios activos duplicados.

### Fuera del MVP

- Mensajes escritos libremente.
- Respuestas o conversaciones.
- Resolver, cerrar o cambiar el estado de la operación desde Métricas.
- Resolver manualmente el recordatorio desde la bandeja de mensajes.
- Adjuntar archivos, imágenes o notas de voz.
- Envíos por correo, WhatsApp o SMS.
- Notificaciones grupales.
- Cambiar manualmente el destinatario.

## 4. Responsabilidades por módulo

### Métricas Bancarias

- Identifica una operación pendiente.
- Permite seleccionar y enviar un recordatorio predeterminado.
- Muestra si la operación ya tiene un recordatorio activo.
- Permite reenviar el recordatorio sin crear otro registro activo.
- No modifica la operación.
- No permite marcar el caso como resuelto.

### Bandeja personal del usuario

- Muestra las operaciones que el usuario creó y todavía debe atender.
- Permite leer el recordatorio.
- Permite abrir la operación en su bandeja operativa.
- Mantiene visible el recordatorio mientras la operación continúe pendiente.
- Mueve automáticamente el registro al historial cuando la operación se cierre.

### Módulo Operaciones

- Continúa siendo la única fuente para completar, pagar, atender o cerrar la
  operación.
- Determina, mediante sus reglas vigentes, cuándo una operación ya no está
  pendiente.

## 5. Lectura no significa cierre

El sistema debe separar dos estados:

1. **Lectura del recordatorio:** el usuario abrió la notificación.
2. **Cierre operativo:** la operación dejó de estar pendiente.

Abrir o leer el recordatorio puede quitar la marca de `Nuevo`, pero no debe
reducir el badge principal. El badge representa operaciones notificadas que aún
requieren trabajo.

Ejemplo:

```text
Recordatorios activos: 4
Mensajes nuevos: 1
```

Cuando el usuario lee el mensaje nuevo, el segundo contador pasa a cero, pero el
primero continúa en cuatro hasta que las operaciones sean cerradas.

## 6. Estados del recordatorio

| Estado | Significado |
|---|---|
| `PENDIENTE` | La operación sigue pendiente y el recordatorio está activo |
| `CERRADO` | La operación dejó de estar pendiente |
| `ANULADO` | El recordatorio fue invalidado por un administrador |

La lectura no forma parte del estado principal. Se registra con
`fecha_primera_lectura` y `fecha_ultima_lectura`.

El estado `CERRADO` debe asignarse automáticamente. No existirá un botón
`Resolver` en Métricas ni en la bandeja del usuario.

## 7. Niveles de alerta y mensajes predeterminados

El emisor selecciona uno de tres niveles. Cada nivel tiene un comentario fijo y
una presentación visual consistente:

| Nivel | Código | Comentario predeterminado | Presentación |
|---:|---|---|---|
| 1 | `RECORDATORIO` | Tienes una operación pendiente. Por favor, revísala y completa su cierre. | Badge informativo |
| 2 | `IMPORTANTE` | Esta operación continúa pendiente y requiere que regularices su cierre a la brevedad. | Badge warning |
| 3 | `URGENTE` | Alerta urgente: debes atender y cerrar esta operación pendiente de inmediato. | Badge error |

Recomendaciones:

- Guardar el nivel, el código y una copia del texto enviado.
- No permitir texto libre en el MVP.
- Mostrar siempre el contexto de la operación junto al mensaje.
- El nivel no cambia automáticamente por lectura. Un reenvío puede mantener o
  elevar el nivel, pero no reducirlo mientras la operación siga pendiente.
- Permitir actualizar las plantillas sin modificar registros históricos.

## 8. Destinatario

El destinatario es obligatoriamente:

```text
tb_operacion_proceso.id_usuario_solicitud
```

Reglas:

- Si la operación no tiene `id_usuario_solicitud`, no se puede enviar el
  recordatorio y se informa `La operación no tiene un usuario responsable`.
- Si el usuario está inactivo, se bloquea el envío y se informa al emisor.
- En una segunda versión podría definirse una reasignación administrativa, pero
  no debe ocurrir de manera implícita en el MVP.
- El nombre guardado en la operación es informativo; la relación se realiza por
  ID de usuario.

## 9. Prevención de duplicados y reenvíos

Debe existir como máximo un recordatorio activo por operación y destinatario.

Restricción recomendada:

```text
UNIQUE parcial (id_operacion_proceso, id_usuario_destinatario)
WHERE estado = 'PENDIENTE'
```

Si ya existe un recordatorio activo:

- no se inserta otro registro;
- se actualiza `fecha_ultimo_envio`;
- se incrementa `cantidad_envios`;
- se actualiza el mensaje predeterminado si el emisor elige otro;
- se conserva el historial de quién realizó cada envío.

La acción visible puede cambiar de `Enviar recordatorio` a
`Reenviar recordatorio` cuando corresponda.

## 10. Modelo de datos propuesto

### `tb_operacion_recordatorio`

| Campo | Uso |
|---|---|
| `id` | PK |
| `id_operacion_proceso` | Operación pendiente relacionada |
| `id_usuario_destinatario` | Usuario que creó la operación |
| `id_usuario_ultimo_emisor` | Último usuario que envió el recordatorio |
| `id_sucursal` | Sede de la operación al crear el registro |
| `servicio` | Servicio de origen |
| `nivel_alerta` | Nivel 1, 2 o 3 |
| `codigo_mensaje` | Plantilla correspondiente al nivel |
| `mensaje_snapshot` | Texto exacto enviado |
| `estado` | `PENDIENTE`, `CERRADO` o `ANULADO` |
| `cantidad_envios` | Cantidad de avisos realizados |
| `fecha_primer_envio` | Primer aviso |
| `fecha_ultimo_envio` | Aviso más reciente |
| `fecha_primera_lectura` | Primera apertura por el destinatario |
| `fecha_ultima_lectura` | Apertura más reciente |
| `fecha_cierre` | Momento en que la operación dejó de estar pendiente |
| `motivo_cierre` | Regla operativa que produjo el cierre |
| `fecha_registro` | Auditoría |
| `fecha_actualizacion` | Auditoría |

### `tb_operacion_recordatorio_envio`

Registra cada envío o reenvío sin convertirlo en una conversación.

| Campo | Uso |
|---|---|
| `id` | PK |
| `id_recordatorio` | Recordatorio relacionado |
| `id_usuario_emisor` | Actor que realizó el envío |
| `nivel_alerta` | Nivel seleccionado en ese envío |
| `codigo_mensaje` | Plantilla seleccionada |
| `mensaje_snapshot` | Texto enviado en ese momento |
| `fecha_registro` | Fecha del envío |

No se necesita una tabla de mensajes ni un hilo de conversación en el MVP.

## 11. Cuándo se cierra automáticamente

El recordatorio debe cerrarse cuando la operación deje de pertenecer al mismo
universo que alimenta `Operaciones Pendientes` en cada servicio.

La regla no debe duplicarse de forma diferente en frontend. El backend debe
centralizar una función privada equivalente a:

```text
f_private_operacion_esta_pendiente(id_operacion_proceso)
```

Esta función aplica las reglas vigentes por servicio:

- Efectivización: deja de estar pendiente según el estado comercial usado por
  su dashboard y bandeja.
- Pago Deuda: deja de estar pendiente cuando la solicitud fue atendida según la
  regla vigente del dashboard.
- POS y Link Pago: deja de estar pendiente cuando alcanza el estado operativo
  de cierre correspondiente, actualmente asociado al flujo pagado.

El cierre puede ejecutarse mediante una combinación de:

1. actualización inmediata desde las funciones que cierran operaciones;
2. conciliación idempotente al consultar el resumen o la bandeja;
3. tarea periódica de respaldo.

La recomendación es usar actualización inmediata y conservar la conciliación
como red de seguridad. No se recomienda depender únicamente de un trigger que
duplique reglas complejas de negocio.

## 12. Contratos backend propuestos

Crear un archivo nuevo:

```text
backend/backend_implementacion/36.recordatorios_operaciones_pendientes.sql
```

Funciones iniciales:

| Función | Responsabilidad |
|---|---|
| `f_post_tb_operacion_recordatorio` | Crear o reenviar un recordatorio |
| `f_get_tb_operacion_recordatorio_resumen` | Contar activos y nuevos del usuario |
| `f_get_tb_operacion_recordatorio_bandeja` | Listar activos o historial |
| `f_get_tb_operacion_recordatorio_detalle` | Obtener contexto completo de la operación |
| `f_patch_tb_operacion_recordatorio_lectura` | Registrar que el destinatario lo abrió |
| `f_private_operacion_esta_pendiente` | Evaluar la regla vigente por servicio |
| `f_private_cerrar_recordatorios_operacion` | Cerrar recordatorios al concluir la operación |
| `f_post_tb_operacion_recordatorio_reconciliar` | Corregir recordatorios desfasados de forma idempotente |
| `f_patch_tb_operacion_recordatorio_anular` | Contingencia exclusiva de administrador |

Las funciones deben obtener y validar el actor en backend. El envío solo se
permite a roles autorizados para consultar Métricas Bancarias.

## 13. Integración con el datatable

### Acción

Agregar un botón de icono de mensaje en la columna `Acciones`, con tooltip
`Enviar recordatorio`.

### Modal de confirmación

Debe mostrar:

- usuario destinatario;
- servicio;
- código de operación;
- cliente y DNI;
- sede;
- fecha y estado;
- monto principal;
- selector segmentado de nivel 1, 2 o 3;
- vista previa del comentario predeterminado;
- botones `Cancelar` y `Enviar`.

No debe mostrar campos de respuesta, resolución ni texto libre.

### Estado visual por fila

- Sin recordatorio: icono normal.
- Recordatorio activo: icono destacado y tooltip con último envío.
- Varios envíos: mostrar cantidad en el tooltip o detalle.
- Operación cerrada: ya no aparece en el datatable de pendientes.

## 14. Requisito previo para POS y Link Pago

Sus tablas pendientes actuales están agrupadas por dimensiones. No se puede
enviar un recordatorio correcto desde una fila que represente varias operaciones
y posiblemente varios usuarios.

Antes de habilitar la acción, el backend debe devolver una fila por operación:

```text
id_operacion
codigo_operacion
id_usuario_solicitud
usuario_solicitud
id_sucursal
sucursal
servicio
dni
cliente
fecha
estado
monto_deposito_cliente
monto_transferencia_cliente
recordatorio_activo
fecha_ultimo_recordatorio
```

Efectivización y Pago Deuda también deben exponer
`id_usuario_solicitud` explícitamente en sus contratos de pendientes.

## 15. Acceso y ruta Bandeja

### Ubicación en el sidebar

Agregar la opción `Bandeja` en el footer del sidebar, inmediatamente encima de
`Light mode` y `Cerrar sesión`:

```text
Bandeja                 4
Light mode
Cerrar sesión
[Usuario autenticado]
```

La opción utiliza un icono de mensaje de Untitled UI y un badge alineado a la
derecha. El badge muestra la cantidad de recordatorios activos y usa `99+` como
límite visual.

El badge no desaparece al visitar la página ni al marcar registros como leídos.
Solo disminuye cuando una operación se cierra o un administrador anula el
recordatorio.

### Ruta

```text
/bandeja
```

La ruta muestra el breadcrumb y título `Bandeja`. Debe ser accesible para todo
usuario autenticado porque cada usuario consulta únicamente sus propios
recordatorios.

### Vistas

Usar tabs de Untitled UI:

- `Pendientes`: operaciones notificadas que todavía requieren atención.
- `Historial`: operaciones cerradas o recordatorios anulados.

### Filtros

Usar el patrón `FilterBar` del proyecto con:

- nivel de alerta;
- servicio;
- rango de fechas del último aviso;
- búsqueda por código, DNI, cliente o comentario;
- acción `Limpiar`.

### Datatable transversal

Usar el componente compartido `DataTable` y su paginación estándar de
20/50/100. El datatable debe permitir identificar la operación sin importar si
proviene de Efectivización, Pago Deuda, POS o Link Pago.

Columnas propuestas:

| Columna | Contenido |
|---|---|
| `Alerta` | Badge Nivel 1, 2 o 3 con color informativo, warning o error |
| `Servicio` | Efectivización, Pago Deuda, POS o Link Pago |
| `Código` | Código o identificador visible de la operación |
| `Fecha operación` | Fecha de creación de la operación |
| `DNI` | Documento del cliente |
| `Cliente` | Nombre disponible o `Sin nombre` |
| `Sucursal` | Sede del usuario creador |
| `Entidad / canal` | Banco, POS o entidad relevante según el servicio |
| `Monto` | Monto principal de la operación |
| `Estado` | Estado operativo vigente |
| `Comentario` | Texto predeterminado enviado desde Métricas |
| `Enviado por` | Usuario que realizó el último envío |
| `Último aviso` | Fecha y hora del envío más reciente |
| `Acciones` | Abrir operación y marcar como leído |

La columna `Comentario` puede limitarse visualmente a dos líneas y mostrar el
texto completo mediante tooltip. Los nombres y códigos no deben perderse; se
permite truncado con tooltip cuando el ancho sea insuficiente.

No habrá acción para responder, resolver ni cambiar la operación desde esta
tabla.

### Componentes Untitled UI

- `NavItem` o botón terciario para `Bandeja` en el sidebar.
- Icono de mensaje de `@untitledui/icons`.
- `Badge` para contador y nivel de alerta.
- `Tabs` para Pendientes e Historial.
- `FilterBar` para filtros y búsqueda.
- `DataTable` para listado, ordenamiento y paginación.
- `Modal` para confirmar el envío desde Métricas.
- `Tooltip` para acciones, textos truncados y estados.
- `Button` con icono para abrir la operación.

## 16. Navegación hacia la operación

Cada recordatorio debe guardar o poder calcular su ruta operativa:

```text
EFECTIVIZACION -> bandeja bancaria correspondiente
PAGO_DEUDA     -> /operaciones/pago-deuda
POS            -> /operaciones/pos
LINK_PAGO      -> /operaciones/linkpago
```

La navegación debería incluir el identificador de la operación como estado o
parámetro para resaltarla al abrir la bandeja. Si la bandeja no soporta todavía
esa selección, debe agregarse como parte de la integración.

## 17. Actualización del badge

Estrategia recomendada:

1. Consultar el resumen al iniciar sesión.
2. Actualizar al recuperar el foco de la ventana.
3. Usar Supabase Realtime para invalidar el contador ante envíos o cierres.
4. Mantener polling de respaldo cada 30–60 segundos.
5. Ejecutar conciliación antes de devolver los contadores.

Realtime solo notifica que debe refrescarse la consulta; el conteo autorizado
siempre se obtiene mediante RPC.

## 18. Estructura frontend sugerida

```text
src/features/recordatorios-operativos/
  recordatorios-operativos.types.ts
  recordatorios-operativos.service.ts
  use-recordatorios-operativos.ts
  bandeja-page.tsx
  bandeja-columns.tsx
  recordatorio-detalle-modal.tsx
  recordatorio-enviar-modal.tsx
  recordatorio-action-button.tsx

src/providers/
  operational-reminders-provider.tsx
```

El provider global mantiene únicamente los contadores y su actualización. La
ruta `/bandeja` consulta el listado paginado y el detalle se carga bajo demanda.

## 19. Entregas propuestas

### Entrega 1 — Persistencia y reglas

- Crear tablas, índices y restricciones.
- Implementar catálogo de mensajes predeterminados.
- Implementar destinatario automático y prevención de duplicados.
- Centralizar la regla para saber si una operación está pendiente.

### Entrega 2 — Ruta y navegación Bandeja

- Crear provider para el contador.
- Agregar `Bandeja` encima de `Light mode` en el sidebar.
- Registrar `/bandeja` y su breadcrumb.
- Implementar tabs, filtros, datatable, paginación e historial con Untitled UI.
- Agregar navegación hacia la operación.

### Entrega 3 — Integración inicial con Pago Deuda

- Agregar `id_usuario_solicitud` a pendientes.
- Implementar la acción de envío y reenvío.
- Verificar el cierre automático al atender la solicitud.

### Entrega 4 — Resto de servicios

- Integrar Efectivización.
- Convertir pendientes de POS y Link Pago a detalle por operación.
- Integrar envío y cierre automático en ambos servicios.
- Activar Realtime con polling de respaldo.

## 20. Criterios de aceptación

1. Solo se puede enviar un recordatorio para una operación pendiente.
2. El destinatario siempre es el usuario que creó la operación.
3. El emisor solo puede elegir entre los tres niveles y sus mensajes
   predeterminados.
4. Métricas no permite cerrar ni modificar la operación.
5. Leer el recordatorio no reduce el contador de pendientes.
6. Reenviar no crea un segundo recordatorio activo.
7. Cada reenvío conserva emisor, plantilla y fecha.
8. El botón `Abrir operación` dirige a la bandeja operativa correcta.
9. Cerrar la operación cierra automáticamente el recordatorio.
10. El badge disminuye después del cierre sin requerir cerrar sesión.
11. `Bandeja` aparece encima de `Light mode` y abre `/bandeja`.
12. El datatable identifica operaciones de los cuatro servicios con columnas
    comunes y el comentario predeterminado.
13. Un usuario solo puede consultar los recordatorios que le corresponden.
14. Un usuario inactivo no puede recibir nuevos recordatorios.
15. El historial conserva operación, nivel, comentario, emisores, lecturas y fecha de
    cierre.
16. La experiencia móvil mantiene filtros y acciones utilizables; el datatable
    puede usar desplazamiento horizontal contenido cuando sus columnas no caben.

## 21. Decisiones de la primera implementación

1. Pueden enviar recordatorios los usuarios con acceso autorizado a
   `/reportes/metricas-bancarias` y los superadministradores.
2. Los tres mensajes son predeterminados y corresponden a Recordatorio,
   Importante y Urgente.
3. La conciliación reutiliza las reglas de pendiente vigentes por servicio.
4. Leer un aviso no lo cierra ni disminuye el contador de activos.
5. Un reenvío actualiza el aviso activo y conserva una fila de auditoría.
6. Un usuario inactivo no recibe avisos nuevos.
7. La anulación administrativa y los SLA quedan fuera de esta primera entrega.

## 22. Recomendación de arranque

Implementar primero una prueba vertical en Pago Deuda:

1. Un supervisor envía un mensaje predeterminado desde una solicitud pendiente.
2. El usuario creador recibe el badge y abre su bandeja.
3. El usuario navega a Pago Deuda y atiende la solicitud.
4. El recordatorio se cierra automáticamente.
5. El badge disminuye y el registro pasa al historial.

Este recorrido valida el objetivo real del módulo sin introducir conversación,
resolución manual ni cambios operativos desde Métricas Bancarias.
