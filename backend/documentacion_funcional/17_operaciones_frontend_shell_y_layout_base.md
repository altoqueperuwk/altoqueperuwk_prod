# 17. Operaciones Frontend: Shell y Layout Base

## Objetivo

Congelar el layout exacto de `operaciones` para la nueva web compactada, usando `Untitled UI` puro como base de componentes, el tema light/dark ya aprobado del proyecto compacto y `Framer Motion` como capa transversal de UX.

Este documento aplica principalmente a `features/operaciones/efectivizacion/bancaria/` y toma como contrato visual obligatorio el bozquejo `Webpage.png`.

## Regla visual obligatoria

- usar solo componentes y patrones estandar de `Untitled UI`;
- no replicar wrappers ni personalizaciones profundas del frontend actual;
- el frontend actual de `src/features/operaciones/` se usa como fuente de comportamiento, no como fuente de estructura visual;
- mantener el tema claro/oscuro ya aprobado del sistema compacto;
- aplicar `Framer Motion` en entradas de cards, tabs, drawers, dropdowns y cambios de vista con intensidad moderada.

## Estructura visual exacta de la pantalla bancaria

Orden vertical obligatorio:

1. breadcrumb superior
2. boton superior derecho `Configuracion`
3. tabs de empresa
4. fila de acciones superiores
5. bloque KPI principal
6. tres formularios inline
7. bloque de carga Excel
8. bloque de tabs operativos + datatable

No se permite reordenar estos bloques ni convertirlos en panel lateral, wizard ni modal principal.

## Encabezado superior

### Breadcrumb

Debe seguir el patron:

- `Home > Operaciones > [Ruta]`

Ejemplo:

- `Home > Operaciones > BCP`

### Boton superior derecho

Boton unico:

- `Configuracion`

Uso:

- abre el acceso central a configuracion de la ruta actual;
- su comportamiento se documentara luego en el contrato especifico, pero visualmente siempre vive solo en la esquina superior derecha.

## Tabs de empresa

Ubicacion:

- primera fila funcional debajo del encabezado

Comportamiento:

- muestran las empresas habilitadas para la ruta actual;
- una empresa siempre esta activa;
- no existe tab `Todos` en esta nueva version;
- cambiar empresa cambia el contexto transversal de la pantalla.

Contrato visual:

- tabs horizontales, ancho por contenido, no stretching a todo el contenedor;
- estilo estandar de tabs/button tabs de `Untitled UI`;
- la empresa activa debe reflejar seleccion clara de fondo y texto;
- transicion de seleccion con `Framer Motion`.

## Fila de acciones superiores

Ubicacion:

- a la derecha del grupo superior, alineada con el bloque de empresa

Botones exactos:

- `Cierre`
- `Historial`
- `Asignar`
- `Descargar`

Semantica:

- `Cierre`: ejecuta cierre de caja de la ruta
- `Historial`: selector de cierres historicos
- `Asignar`: asignacion/configuracion de empresas-cuenta para la ruta
- `Descargar`: exportacion de reportes

Todos estos botones deben usar composicion base de `Untitled UI`.

## Bloque KPI

Ubicacion:

- debajo de la fila de tabs + acciones

Composicion visual exacta:

- grid de cards horizontales;
- primera fila:
  - `Caja Inicial`
  - `Caja Actual`
  - `Total Recaudado`
  - `Ingresos`
  - `Salidas`
  - `Gastos Operacionales`
  - `Ganancias`
- segunda fila:
  - `Pendiente a Depositar`
  - `Ingresos Retenidos`
  - `Total Efectivizacion`
  - `Total Pago Deuda`

No debe insertarse ningun KPI adicional en esta etapa.

## Tres formularios inline

Ubicacion:

- debajo del bloque KPI

Orden exacto:

1. `Mover Saldo: [Empresa]`
2. `Ingreso y Salidas: [Empresa]`
3. `Operacion Efectivizacion: [Empresa]`

Cada formulario:

- vive inline;
- no se implementa como popup principal;
- usa cards/contenedores estandar de `Untitled UI`;
- usa tabs pequenos de banco/cuenta donde el contrato lo indique.

## Bloque de carga Excel

Ubicacion:

- debajo de los tres formularios inline

Composicion:

- titulo: `Sube Un archivo Excel: [Empresa]`
- dropzone izquierda
- preview de archivo derecha
- acciones `Procesar` y `Cancelar`

El bloque es fijo, no modal.

## Bloque de tabs operativos + datatable

Ubicacion:

- ultimo gran bloque de la pantalla

Composicion:

1. tabs operativos a la izquierda
2. tabs de empresa a la derecha
3. fila de filtros y acciones contextuales
4. datatable

Tabs operativos exactos:

- `Efectivizacion`
- `Pago Deuda`
- `Derivados`
- `POS`
- `Movimientos`
- `Retenidos`

## Estructura frontend objetivo

La implementacion nueva debe organizarse asi:

- `features/operaciones/efectivizacion/pages/`
- `features/operaciones/efectivizacion/components/`
- `features/operaciones/efectivizacion/hooks/`
- `features/operaciones/efectivizacion/services/`
- `features/operaciones/efectivizacion/schemas/`
- `features/operaciones/efectivizacion/types/`

Y dentro de `efectivizacion`:

- `features/operaciones/efectivizacion/bancaria/`
- `features/operaciones/efectivizacion/asistida/`
- `features/operaciones/efectivizacion/shared/`

Y, aparte:

- `features/operaciones/pago-deuda/`

## Regla para otra IA

Otra IA debe interpretar este documento asi:

- el layout de `Webpage.png` ya esta congelado;
- no debe redisenar la composicion;
- no debe usar la arquitectura visual del frontend actual;
- si debe usar `Untitled UI` estandar, el tema del sistema compacto y `Framer Motion`;
- `efectivizacion-bancaria` y `efectivizacion-asistida` siguen existiendo como familias de negocio, pero viven dentro del mismo modulo raiz `features/operaciones/efectivizacion/`.
