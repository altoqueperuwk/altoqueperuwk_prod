# 19. Operaciones Frontend: Formularios Inline

## Estado vigente

La implementacion actual ya no usa titulos con empresa ni tabs rapidos de cuenta en el encabezado de cada card.

Orden actual:

1. `Mover Saldo`
2. `Ingreso y Salidas`
3. `Operacion Efectivizacion`

Los tres formularios usan componentes base Untitled UI:

- `Input`
- `NativeSelect`
- `Button`
- `ButtonGroup`
- `InlineFormCard`

### Mover Saldo vigente

Campos:

- `Empresa`: bloqueado con la empresa activa.
- `Cuenta`: dropdown con las cuentas de la empresa activa.
- `Empresa Destino`: dropdown con placeholder `Seleccionar`.
- `Cuenta Destino`: dropdown con placeholder `Seleccionar`, filtrado por empresa destino.
- `Monto a Depositar`.

Reglas:

- La cuenta origen debe tener caja operativa.
- La empresa/cuenta destino se lista desde cuentas bancarias activas.
- Para ejecutar la transferencia, la cuenta destino debe tener caja operativa configurada.
- Si la cuenta destino no tiene caja operativa, la UI muestra error y no ejecuta RPC.

### Ingreso y Salidas vigente

Campos:

- `Empresa`: bloqueado con la empresa activa.
- `Cuenta`: dropdown con las cuentas de la empresa activa.
- `Movimiento`: segmentado `Ingreso` / `Salida`.
- `Monto`.
- `Concepto`.

Reglas:

- `Concepto` es obligatorio.
- La cuenta seleccionada debe tener caja operativa.
- Estos movimientos se diferencian de Excel, Pago Deuda y Transferencia Interna.

### Operacion Efectivizacion vigente

Campos:

- `Empresa`: bloqueado con la empresa activa.
- `Cuenta`: bloqueado con la cuenta principal disponible de la empresa activa.
- `Codigo Operacion`.
- `DNI`.
- `Monto`.
- `Comunidad`.

Reglas:

- Registra una operacion manual de efectivizacion.
- Usa el codigo de servicio correspondiente a la ruta bancaria.
- Crea la operacion como `Pendiente`.
- La atencion posterior ocurre desde el tab `Efectivizacion`.

### Nota sobre el contenido historico

Las secciones antiguas de este documento pueden mencionar `Mover Saldo: [Empresa]`, tabs rapidos de cuenta o empresa en titulo. Eso queda reemplazado por esta seccion vigente.

## Objetivo

Congelar los tres formularios inline del bloque medio de `efectivizacion-bancaria`, tomando como contrato visual `Webpage.png` y como fuente funcional el frontend actual de `src/features/operaciones/`.

Estos formularios no son popups principales. Viven dentro de la pantalla operativa.

## Orden exacto

1. `Mover Saldo: [Empresa]`
2. `Ingreso y Salidas: [Empresa]`
3. `Operación Efectivización: [Empresa]`

## Reglas generales

- usan cards estándar de `Untitled UI`;
- respetan el tema actual del sistema compacto;
- usan `Framer Motion` solo para entradas suaves y cambios de estado;
- la empresa activa del contexto llena o condiciona parte de los campos;
- la ruta actual gobierna qué banco/cuenta aplica.

## 1. Mover Saldo: [Empresa]

### Layout exacto

Encabezado:

- título `Mover Saldo: [Empresa]`
- tabs rápidos de banco/cuenta en la parte superior derecha del bloque

Campos:

- `Empresa`
- `Cuenta`
- `Monto a Depositar`

Botones:

- `Guardar`
- `Cancelar`

### Semántica funcional

Fuente de comportamiento:

- `src/features/operaciones/components/contable/operacion-caja-shell-forms.tsx`

Contrato:

- mueve saldo entre cajas operativas;
- trabaja sobre empresa/cuenta del contexto de ruta;
- la selección de cuenta debe obedecer la empresa activa;
- los tabs superiores del bloque muestran el banco/cuenta disponible para esa empresa en la ruta.

## 2. Ingreso y Salidas: [Empresa]

### Layout exacto

Encabezado:

- título `Ingreso y Salidas: [Empresa]`
- tabs rápidos de banco/cuenta arriba a la derecha

Campos:

- `Movimiento`
  - control segmentado:
    - `Ingreso`
    - `Salida`
- `Monto`
- `Concepto`

Botones:

- `Guardar`
- `Cancelar`

### Semántica funcional

Fuente de comportamiento:

- `src/features/operaciones/components/contable/operacion-caja-shell-forms.tsx`

Contrato:

- registra movimientos manuales de caja;
- no pertenece a efecto Excel ni a registro manual de operación;
- `Movimiento` define el signo funcional del movimiento;
- `Concepto` es obligatorio para trazabilidad manual;
- la empresa y cuenta siguen el contexto de la empresa activa y la ruta actual.

## 3. Operación Efectivización: [Empresa]

### Layout exacto

Encabezado:

- título `Operación Efectivización: [Empresa]`
- tab rápido de banco/cuenta en la parte superior derecha del bloque

Campos:

- `Codigo Operacion`
- `DNI`
- `Monto`
- `Comunidad`

Botones:

- `Guardar`
- `Cancelar`

### Semántica funcional

Fuentes de comportamiento:

- `src/features/operaciones/components/contable/operacion-registrar-inline.tsx`
- `src/features/operaciones/components/modal-operacion.tsx`

Contrato:

- registra una operación manual de efectivización;
- la empresa visible viene del contexto activo;
- el ingreso queda amarrado a la caja primaria de ingreso de la ruta;
- la parte oculta de cálculo y resolución no se redocumenta visualmente, pero sí debe respetar el backend compacto.

## Relación con ruta y empresa activa

### Parte gobernada por ruta

- banco de ingreso;
- caja primaria de ingreso;
- cuentas válidas de la ruta;
- disponibilidad de Excel y operativa bancaria.

### Parte gobernada por empresa activa

- nombre visible en títulos de bloque;
- conjunto de cuenta/banco disponible para tabs del formulario;
- contexto operativo usado en acciones del bloque.

### Parte resuelta automáticamente

- valores que el backend derive desde la ruta;
- cuenta de ingreso primaria;
- validaciones de empresa/cuenta permitidas para la ruta.

## Qué no debe copiar otra IA

- no convertir estos formularios en modales separados;
- no reutilizar el layout pesado del frontend viejo;
- no reconstruir componentes base personalizados;
- no mover este bloque debajo del datatable ni mezclarlo con el Excel.

## Regla para otra IA

Otra IA debe implementar:

- exactamente estos tres formularios;
- con este orden;
- con esta distribución de campos;
- usando `Untitled UI` puro;
- y tomando del frontend viejo solo la lógica funcional ya validada.
