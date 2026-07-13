# 21. Operaciones Frontend: Tabs y Bandejas Operativas

## Objetivo

Congelar el bloque inferior de bandejas operativas y datatable usando `Webpage-2.png` como contrato visual principal.

## Estructura exacta del bloque

Orden obligatorio:

1. tabs operativos a la izquierda
2. tabs de empresa a la derecha
3. fila de filtros y acciones contextuales
4. datatable

## Tabs operativos exactos

- `Efectivizacion`
- `Pago Deuda`
- `Derivados`
- `POS`
- `Movimientos`
- `Retenidos`

Estos tabs:

- no se estiran a todo el ancho;
- usan patron estandar de `Untitled UI`;
- cambian la semantica completa de la bandeja;
- animan transicion con `Framer Motion`.

## Tabs de empresa

Ubicacion:

- alineados a la derecha del mismo renglon del tab operativo

Semantica:

- muestran el contexto de empresa disponible en la ruta;
- una empresa siempre esta activa;
- su cambio afecta la bandeja, filtros dependientes y acciones disponibles.

## Contenedor de filtros y acciones

Cada tab usa:

- un solo contenedor de filtros;
- acciones a la derecha;
- misma estructura visual general, pero distinto contenido segun la bandeja.

No se debe crear un layout distinto por cada tab fuera de este patron.

## Datatable

El datatable:

- ocupa todo el ancho del bloque;
- cambia columnas y acciones segun el tab;
- mantiene una sola semantica de tabla operativa por vista.

El diseno debe usar patrones de tabla de `Untitled UI`, no el datatable personalizado del sistema actual.

## Regla de comportamiento

- cambiar tab cambia la bandeja;
- cambiar empresa cambia el universo visible dentro de la bandeja;
- filtros y acciones se recomponen por tab;
- la empresa activa sigue siendo un contexto transversal.

## Relacion con los modulos frontend

### `features/operaciones/efectivizacion/`

Este modulo concentra:

- shell principal de la ruta bancaria;
- KPI;
- formularios;
- Excel;
- tabs operativos;
- datatables;
- variantes bancarias y asistidas.

Dentro de este modulo:

- `Efectivizacion`, `Derivados`, `Movimientos` y `Retenidos` pertenecen al flujo bancario principal;
- `POS` pertenece a la variante asistida, pero convive en el mismo ecosistema tecnico de `efectivizacion`.

### `features/operaciones/pago-deuda/`

Este modulo conserva su propia semantica de bandeja para `Pago Deuda`, aunque visualmente reutilice el mismo patron de tabs, toolbar y tabla.

## Regla visual

- tabs estandar de `Untitled UI`;
- toolbar compacta;
- tablas base de `Untitled UI`;
- motion solo en cambios de tab, carga de filtros y aparicion de filas.

## Que no debe hacer otra IA

- no convertir cada tab en una pagina separada si el contrato visual exige convivencia en una sola pantalla;
- no mover los tabs de empresa a otra seccion;
- no inventar filtros globales comunes si el bozquejo define bandejas distintas;
- no usar el datatable personalizado actual como patron obligatorio;
- no separar `POS` en un tercer modulo raiz independiente del frontend.

## Regla para otra IA

Otra IA debe implementar este bloque como:

- un sistema de bandejas dentro de una misma pantalla;
- con tabs operativos + tabs de empresa;
- con filtros y acciones contextuales;
- con tabla estandar de `Untitled UI`;
- y con 2 modulos raiz reales en frontend: `efectivizacion` y `pago-deuda`.
