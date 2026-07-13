# 22. Operaciones Frontend: Contratos por Tab

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

- representa la atencion operativa de solicitudes originadas por POS;
- convive visualmente con las otras bandejas;
- pertenece a la variante `asistida` dentro del modulo frontend `features/operaciones/efectivizacion/`.

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
