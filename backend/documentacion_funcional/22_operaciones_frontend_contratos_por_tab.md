# 22. Operaciones Frontend: Contratos por Tab

> **Estado vigente 22/08/2026:** El contrato visual actual concentra las bandejas
> en `Efectivizacion TC`, `Pago Deuda TC` y `Movimientos`; no se deben interpretar
> las secciones antiguas de este documento como una prohibicion de la vista unificada.
> Las bandejas antiguas siguen disponibles desde el selector secundario.

### Contrato vigente

| Vista | Fuentes | Identificacion principal |
|---|---|---|
| Efectivizacion TC | Efectivizacion, Derivados y POS | columna `Flujo` |
| Pago Deuda TC | Pago Deuda | pasos visuales y estado |
| Movimientos | `tb_operacion_caja` | origen y tipo de movimiento |

Las acciones de comision especial, comision extra, Directo, Confirmar Pago Deuda,
Derivar, Reiniciar y Eliminar Excel se habilitan solo cuando el flujo y estado de
la fila lo permiten. Las acciones recurrentes no se muestran en la vista unificada.

## Objetivo

Definir cada bandeja del bloque inferior como contrato funcional y visual cerrado, tomando `Webpage-2.png` como fuente principal.

## 1. Efectivizacion

### Filtros visibles

- `DNI`
- quick filters:
  - `Todos`
  - `Pendientes`
  - `Rechazados`
  - `Pagados`

### Acciones visibles

- `Empresa`
- `Reiniciar`
- `Pagar`
- `Derivar`
- `Reasignar`

### Semantica

- bandeja operativa principal de efectivizacion bancaria;
- responde al contexto de empresa activa;
- puede incluir acciones masivas e individuales segun el diseno final del datatable.

### Visibilidad

- individual por usuario cuando el flujo asi lo defina;
- compartida por ruta en los casos ya cerrados como derivaciones atendidas.

## 2. Pago Deuda

### Filtros visibles

- `DNI`
- quick filters:
  - `Todos`
  - `Solicitado`

### Acciones visibles

- `Transferencia`
- `Reiniciar`

### Semantica

- bandeja de solicitudes y atencion operativa de pago deuda;
- no replica la complejidad completa de efectivizacion bancaria;
- se apoya en el backend compacto de pago deuda.

## 3. Derivados

### Filtros visibles

- `DNI`
- quick filters:
  - `Todos`
  - `Pendientes`
  - `Rechazados`
  - `Pagados`

### Acciones visibles

- `Reiniciar`
- `Pagar`
- `Derivar`

### Semantica

- muestra operaciones derivadas entre rutas bancarias;
- usa visibilidad por ruta destino;
- no duplica la operacion, solo cambia la responsabilidad operativa final.

## 4. POS

Este contrato corresponde al tab `POS` dentro de una ruta bancaria. No describe la pantalla `/operaciones/pos`.

### Filtros visibles

- `DNI`
- quick filters:
  - `Todos`
  - `Solicitado`
  - `Rechazados`
  - `Pagados`

### Acciones visibles

- `Reiniciar`
- `Pagar`
- `Derivar`

### Semantica

- representa la atencion operativa bancaria de solicitudes originadas por `/operaciones/pos`;
- convive visualmente con las otras bandejas;
- la salida real se decide aqui y puede impactar la caja del banco destino.

### Pantalla asistida relacionada

`/operaciones/pos`:

- registra solicitudes sin caja propia;
- exige banco/empresa/cuenta destino;
- no ejecuta `Pagar`;
- no crea movimientos.

## 5. Movimientos

### Filtros visibles

- `DNI`
- quick filters:
  - `Todos`
  - `Efectivizacion`
  - `Pago Deuda`
  - `Otros`

### Acciones visibles

- no se definen acciones operativas de derivacion, reasignacion ni pago en esta fase

### Semantica

- muestra movimientos de caja y/u operativos relacionados;
- separa tipos de movimientos por origen funcional.

## 6. Retenidos

### Filtros visibles

- `DNI`
- `Fecha Desde`
- `Fecha Hasta`

### Acciones visibles

- `Confirmar`

### Semantica

- muestra operaciones retenidas;
- permite confirmar la transicion operativa definida por backend.

## Reglas comunes a todas las bandejas

- la empresa activa sigue afectando el universo visible;
- el tab seleccionado define filtros, acciones y columnas;
- el datatable no desaparece cuando no hay data;
- deben existir estados vacios consistentes;
- la UI usa `Untitled UI` puro y `Framer Motion`.

## Columnas del datatable

La definicion exacta de columnas debe apoyarse en el backend compacto y en la semantica real del frontend actual, pero otra IA debe asumir esta regla:

- cada tab tiene su propio set de columnas;
- no se fuerza una tabla universal con las mismas columnas para todas las bandejas;
- el contrato de columnas debe salir del servicio y la naturaleza del flujo.

## Regla para otra IA

Otra IA debe entender que:

- estos seis tabs ya estan funcionalmente cerrados;
- no puede inventar nuevos filtros;
- no puede mover acciones entre tabs;
- no puede fusionar `Derivados`, `POS` y `Pago Deuda` en una sola bandeja;
- `POS` no crea un tercer modulo raiz: vive dentro de `features/operaciones/efectivizacion/`.
