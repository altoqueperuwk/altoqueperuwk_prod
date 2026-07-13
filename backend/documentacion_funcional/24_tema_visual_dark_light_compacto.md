# 24. Tema Visual Dark/Light Compacto

## Objetivo

Congelar el contrato visual del tema claro/oscuro para la web compactada, tomando como fuente de verdad el look ya aprobado del sistema actual y no el dark mode crudo por defecto de `Untitled UI`.

Este documento existe para que otra IA implemente la nueva web con:

- `Untitled UI` como base de componentes;
- el tema visual propio del producto como fuente de verdad;
- `Framer Motion` como capa transversal de experiencia;
- y sin reinterpretar colores, contraste ni superficies por cuenta propia.

## Regla principal

`Untitled UI` aporta:

- estructura;
- componentes;
- patrones de layout;
- formularios;
- tablas;
- tabs;
- drawers;
- modales.

Pero el color, contraste y sensacion visual del producto los gobierna este tema compacto.

Regla explicita:

- no usar el dark mode negro absoluto por defecto de `Untitled UI`;
- no introducir grises extremadamente oscuros que cansen la vista;
- no mezclar un segundo sistema de tokens paralelo;
- no hardcodear colores inline si el token ya existe.

## Fuente de verdad de tokens

La implementacion debe usar exclusivamente tokens de tema del proyecto:

- `bg-primary`
- `bg-secondary`
- `bg-secondary_hover`
- `border-primary`
- `border-secondary`
- `border-brand`
- `text-primary`
- `text-secondary`
- `text-tertiary`
- `text-placeholder`

No se debe forzar en `.tsx` colores tipo:

- `#161618`
- `#1E1E22`
- `#000000`

si el token correspondiente ya existe en el sistema.

## Colores de fondo

### Fondo de pagina

- token: `bg-secondary`
- uso:
  - root layout
  - fondo general de modulos
  - fondos amplios del shell autenticado

Sensacion buscada:

- oscuro amigable;
- no negro agresivo;
- suficiente separacion visual contra cards y tablas.

### Tarjetas y contenedores

- token: `bg-primary`
- uso:
  - cards KPI
  - modales
  - drawers
  - barras de filtros
  - datatables
  - secciones de formularios
  - bloques de carga Excel

Sensacion buscada:

- superficie claramente separada del fondo;
- limpia;
- sin brillo excesivo;
- coherente entre light y dark mode.

### Hover sutil

- token: `bg-secondary_hover`
- fallback permitido:
  - `hover:bg-[rgba(255,255,255,0.05)]`

Uso:

- filas
- acciones secundarias
- listas
- items de dropdown
- tabs no activos cuando aplique

## Bordes

### Bordes generales

- token: `border-secondary`

Uso:

- cards
- modales
- tablas
- toolbar de filtros
- divisores de seccion

### Bordes de inputs y selects

- token: `border-primary`

Uso:

- input
- select
- date picker
- text area
- input group

### Borde activo o focus

- token: `border-brand`

Uso:

- focus states
- input activo
- dropdown activo
- tabs activos cuando el patron lo necesite

## Texto

La implementacion debe usar las clases existentes del sistema:

- `text-primary`
- `text-secondary`
- `text-tertiary`
- `text-placeholder`

### Regla de jerarquia

- `text-primary`: titulos, contenido principal, montos visibles
- `text-secondary`: labels, subtitulos, metadatos cortos
- `text-tertiary`: ayuda visual, soporte, detalle ligero
- `text-placeholder`: placeholders y estados de entrada vacia

No se debe reconstruir la jerarquia de texto con colores ad hoc.

## Colores de concepto

### Ingreso

- color: `#5DCAA5`

### Gasto

- color: `#F09595`

### Ganancia

- color: `#63C985`

### Salida

- color: `#D08070`

### Valor cero o inactivo

- color: `#4A4A52`

### Reglas

- estos colores aplican a montos, KPI, badges de apoyo y microindicadores;
- no deben reemplazar la semantica base del tema;
- deben convivir con `text-primary` y `text-secondary`, no romperla.

## Componentes base

### DataTable

Regla:

- usar `bg-primary` como superficie;
- usar `border-secondary` o `ring-secondary` para el contenedor;
- mantener headers, filas y paginacion en el mismo lenguaje visual.

Implementacion visual esperada:

- sin fondo blanco duro en dark mode;
- sin tablas flotando sin contenedor;
- sin mezcla de sombras y bordes ajena al sistema.

### Input / Select / DatePicker

Regla:

- heredan `bg-primary` automaticamente;
- no requieren estilos inline extra si el token ya esta resuelto;
- deben usar `border-primary`;
- focus con `border-brand`.

### Botones

#### Primario

- uso de componente base con color primary;
- fondo de marca ya dark-compatible;
- reservado para accion principal del bloque.

#### Secundario

- fondo suave tipo `bg-white/5`;
- borde `border-secondary`;
- texto normal del sistema.

#### Terciario / utilitario

- prioridad visual menor;
- misma familia de borde y contraste;
- nunca competir con el boton primario.

### Badge

Regla:

- hereda `bg-primary` o superficie equivalente del tema;
- usa color de concepto solo para comunicar estado;
- no usar badges chillones fuera del mapa de color ya aprobado.

### Modal / Drawer

Regla:

- `bg-primary`
- `border border-secondary`
- contenido respirado
- overlay sobrio
- no black glass excesivamente oscuro

### Tabs

Regla:

- usar el componente base de `Untitled UI`;
- el tab activo debe verse claro sin romper el tema;
- no usar tabs que estiren toda la pantalla si el contrato visual exige ancho por contenido;
- el cambio de estado debe apoyarse en `Framer Motion`.

### Breadcrumb

Regla:

- sobrio;
- bajo contraste controlado;
- integrado al fondo de pagina;
- no debe competir visualmente con los cards ni con los botones principales.

## Patrones de layout

### Contenedor de filtros

Patron oficial:

```tsx
<div className="flex flex-wrap items-end gap-3 rounded-lg border border-secondary bg-primary p-4 shadow-sm">
  {/* inputs */}
  {/* selects */}
  {/* date pickers */}
  {/* botones */}
</div>
```

### Input de busqueda

Patron oficial:

```tsx
<input
  className="flex h-9 w-full rounded-md border border-primary bg-primary pl-8 pr-3 py-1 text-sm text-primary placeholder:text-placeholder focus:border-brand focus:outline-hidden"
/>
```

## Tema aplicado a Operaciones

En `Operaciones`, este tema debe gobernar:

- shell completo
- cards KPI
- formularios inline
- bloque Excel
- tabs de bandeja
- datatables
- popups auxiliares
- dropdown de historial
- badges de estado

Regla importante:

- aunque `Operaciones` use `Untitled UI` puro, no debe verse como el dark mode default del kit;
- debe verse como una extension natural del sistema compacto ya aprobado.

## Tema aplicado a Sistema

En `sistema`, este tema debe gobernar:

- pages CRUD
- toolbars de filtros
- datatables
- popups de nuevo/editar
- history drawers
- sidebars
- paginacion

Esto garantiza coherencia total entre `sistema` y `operaciones`.

## Regla de light mode

El light mode no es opcional ni secundario.

Debe mantenerse como pareja oficial del dark mode:

- mismo lenguaje visual;
- mismos espaciados;
- mismas superficies;
- misma jerarquia de componentes;
- sin hacks separados por modulo.

La diferencia debe estar en el tema, no en una doble implementacion visual.

## Regla de Framer Motion

`Framer Motion` debe respetar este tema, no pelearse con el.

Uso esperado:

- aparicion de cards
- transicion de tabs
- carga de filas
- dropdowns
- drawers
- modales
- sidebar colapsable

La sensacion buscada:

- fluida
- premium
- moderada
- consistente

No se busca:

- animacion decorativa excesiva;
- rebotes agresivos;
- overlays pesados;
- ruido visual en tablas o formularios.

## Lo que otra IA no debe hacer

- no adoptar el dark mode default de `Untitled UI` solo por comodidad;
- no inventar una paleta nueva;
- no hardcodear fondos negros intensos;
- no cambiar los colores de concepto ya aprobados;
- no mezclar estilos del frontend viejo con otro sistema de tokens paralelo;
- no crear componentes visuales temporales fuera del sistema de tema.

## Regla final para implementacion

La siguiente IA debe asumir:

1. `Untitled UI` es la base de componentes;
2. el tema visual real lo define este contrato;
3. el dark mode actual del producto es superior a cualquier default externo;
4. el light mode debe mantenerse alineado;
5. `Framer Motion` se aplica desde el inicio;
6. cualquier pantalla nueva debe nacer ya dentro de este sistema visual compacto.

## Checklist minimo

- [ ] Usar solo tokens del tema
- [ ] No usar negros absolutos por defecto
- [ ] Mantener `bg-primary` y `bg-secondary` como superficies base
- [ ] Mantener `border-secondary` como borde general
- [ ] Mantener `border-primary` en entradas
- [ ] Mantener `border-brand` en focus
- [ ] Respetar colores de Ingreso, Gasto, Ganancia y Salida
- [ ] Aplicar el mismo tema a `sistema` y `operaciones`
- [ ] Integrar `Framer Motion` sin romper contraste ni lectura
