# 06. Untitled UI Setup y Forma de Trabajo

## Objetivo

Definir como debe adoptarse el sistema visual actual basado en `Untitled UI` para que la siguiente implementacion salga limpia, compacta, consistente y visualmente alineada con el producto que ya funciona hoy.

## Regla principal

El frontend nuevo debe tomar como base visual el sistema actual de `Untitled UI` ya adaptado en este proyecto.

No se debe intentar reconstruir el producto con otra libreria visual distinta, ni levantar una capa temporal con componentes genericos para "luego migrar".

La implementacion visual real debe nacer desde el primer commit sobre esta referencia actual.

## Base visual aprobada

La referencia oficial para la nueva implementacion es:

- el sistema actual de componentes basado en `Untitled UI`;
- los patrones visuales ya refinados dentro del frontend actual;
- los tokens y decisiones de dark/light ya estabilizadas;
- la experiencia actual de filtros, datatables, popups, badges y sidebars.

Regla explicita:

- no usar el dark mode negro profundo por defecto de `Untitled UI` si contradice la experiencia visual actual;
- el dark/light mode refinado de este proyecto tiene prioridad sobre cualquier default externo.

## Regla de consumo de Untitled UI

La siguiente implementacion debe trabajar `Untitled UI` mediante su mecanismo oficial de instalacion y generacion de componentes, priorizando `CLI` y documentacion oficial.

No se recomienda clonar todo el repositorio de `Untitled UI` como base del proyecto nuevo.

Regla practica:

- usar el `CLI` oficial para instalar o generar solo lo necesario;
- usar el repositorio, docs o ejemplos solo como referencia visual;
- no arrastrar al proyecto carpetas completas de demos, docs o playgrounds;
- no convertir el repo de `Untitled UI` en dependencia estructural del producto.

## Regla de migracion visual

La siguiente IA debe:

- reutilizar el enfoque visual actual;
- limpiar la logica incrustada en frontend;
- compactar estructura, hooks y servicios;
- usar `CLI` oficial de `Untitled UI` cuando necesite montar piezas nuevas;
- instalar y aplicar `Framer Motion` desde el inicio del frontend nuevo;
- mantener la calidad visual que ya tiene el proyecto actual.

La siguiente IA no debe:

- construir una UI nueva generica sin respetar la referencia actual;
- mezclar dos sistemas de componentes en paralelo.

## Regla transversal de Framer Motion

`Framer Motion` forma parte obligatoria del frontend nuevo.

El objetivo no es sobreanimar, sino dar una sensacion premium moderada, fluida y limpia, tipo iPhone.

Debe aplicarse a:

- sidebar colapsable;
- cambios de pagina o vistas;
- tabs;
- cards;
- filtros;
- tablas;
- popups;
- drawers;
- dropdowns;
- cambios visibles de estado.

No debe aplicarse como ruido visual.

La experiencia esperada es:

- entradas suaves;
- microtransiciones limpias;
- continuidad visual entre estados;
- sin afectar la legibilidad de formularios y datatables.

## Enfoque tecnico recomendado

La migracion del frontend debe separar claramente:

- `ui/` para componentes visuales;
- `features/` para dominios;
- `hooks/` para orquestacion;
- `services/` para RPCs y acceso a Supabase;
- `schemas/` para validaciones;
- `utils/` para helpers puros.

El objetivo no es rehacer el look and feel, sino desacoplar la logica de negocio de los componentes visuales.

## Regla sobre componentes base

El proyecto nuevo debe conservar, o volver a construir de forma equivalente, estos bloques visuales:

- botones primarios, secundarios y utilitarios;
- inputs e input groups;
- selects;
- date pickers;
- dropdowns;
- datatables;
- badges;
- modales;
- tabs;
- cards KPI;
- sidebar y breadcrumb.

## Regla sobre el login

Aunque se mantenga el sistema visual de `Untitled UI`, el login no debe ser ornamental.

Debe ser:

- simple;
- sobrio;
- centrado;
- funcional;
- sin registro publico;
- sin login social;
- sin panel promocional.

La pantalla `/login` solo resuelve autenticacion. El alta de usuarios pertenece exclusivamente al modulo administrativo principal mediante popup.

## Reglas de consistencia visual

La siguiente IA debe respetar:

- dark mode actual como referencia principal;
- light mode actual como pareja oficial del dark mode;
- espaciados ya estabilizados en el producto;
- uso de badges, estados y colores ya mapeados;
- sidebar colapsable como comportamiento oficial;
- misma familia visual entre modulos core y Operaciones;
- uso transversal de `Framer Motion` con intensidad moderada.

## Fuente de verdad visual

Para construir el frontend nuevo, la referencia visual debe salir de:

- el frontend actual;
- esta documentacion funcional;
- y los patrones ya consolidados en `Operaciones`.

No debe salir de demos externas.

## Contrato de implementacion para la siguiente IA

La siguiente IA debe asumir:

- `Untitled UI` es la referencia visual oficial;
- la prioridad es limpiar y compactar la arquitectura, no rediseñar desde cero;
- los componentes deben quedar mas desacoplados de la logica;
- el login no crea usuarios ni expone `Sign up`;
- `Framer Motion` no es opcional;
- todavia no debe definirse por cuenta propia el layout final de `operaciones`;
- el resultado visual final debe verse al menos tan bien como el sistema actual.

## Checklist minimo para arrancar bien

- [ ] Usar el frontend actual como referencia visual oficial
- [ ] No introducir otra libreria visual como base
- [ ] Definir estructura limpia por `features`, `services` y `hooks`
- [ ] Mantener dark mode y tokens actuales
- [ ] Mantener tambien el light mode actual como referencia oficial
- [ ] Evitar el dark mode negro absoluto por defecto de Untitled UI
- [ ] Mantener popups, datatables y sidebar con el mismo lenguaje visual
- [ ] Instalar y usar `Framer Motion` desde el inicio
- [ ] Simplificar login y dejarlo solo como acceso
- [ ] Empezar la refactorizacion sacando logica del frontend actual

## Resumen ejecutivo

La mejor practica para tu caso es:

- mantener `Untitled UI` como base visual;
- mantener el dark/light actual como fuente de verdad visual;
- incorporar `Framer Motion` desde el inicio como capa transversal;
- refactorizar la arquitectura sin perder el look actual;
- compactar la logica incrustada en frontend;
- y dejar el proyecto preparado para conectar la nueva base de datos mas adelante.
