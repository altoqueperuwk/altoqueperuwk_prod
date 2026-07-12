# 01. Contexto General y Objetivo

## Objetivo del proyecto

Se esta construyendo un sistema nuevo, con frontend nuevo y backend compacto, orientado principalmente al dominio de:

- Operaciones
- Efectivizacion
- Pago Deuda
- Cajas operativas
- Dashboard contable

El objetivo no es refactorizar el frontend actual, sino dejar listo un contrato nuevo para construir una interfaz nueva de forma limpia.

## Meta principal

La meta es que:

- el backend sea la unica fuente de verdad;
- el frontend no tenga logica hardcodeada;
- el menu, permisos, rutas, maestros, cajas, operaciones y reglas salgan desde backend;
- y el frontend solo orqueste experiencia visual y consumo de contrato.

## Archivo SQL final

La compilacion final de la migracion debe salir desde un unico archivo:

- `../backend_implementacion/3.ddl_tablas_funciones_compactas.sql`

Adicionalmente, existe una separacion por dominios dentro de:

- `../backend_implementacion/`

Esa carpeta sirve para:

- ubicar tablas y funciones mas rapido;
- modificar un dominio puntual;
- y trabajar sin depender de un archivo gigante.

El punto final de compilacion sigue siendo el snapshot completo.

## Dominios incluidos

- tablas core y catalogos compactados;
- operacion proceso;
- pago deuda;
- ruta operacion caja;
- asignacion caja operativa;
- caja operativa;
- cierre de caja operativa;
- categoria operacion caja;
- operacion caja.

## Lo que ya esta decidido

- no se usan funciones `PUT` como contrato final;
- el backend expone `GET`, `POST` y `PATCH`;
- toda funcion publica consumida por frontend debe usar `SECURITY DEFINER`;
- las tablas core se gestionan por estado, no por eliminacion fisica;
- los `jsonb` compactados si pueden reemplazar su contenido completo;
- las cajas son exclusivas por usuario;
- el frontend nuevo mantendra el sistema visual actual basado en `Untitled UI`;
- no se debe adoptar el dark mode negro profundo por defecto de `Untitled UI` si contradice el look actual del producto;
- el dark/light mode actual del proyecto es la fuente de verdad visual para la nueva migracion;
- `Framer Motion` sera obligatorio como capa transversal de experiencia visual premium moderada;
- el sistema lateral usara iconografia bancaria por ruta.

## Regla transversal de experiencia visual

La nueva migracion no debe reinventar el look del producto.

Debe respetar desde el inicio:

- `Untitled UI` como base visual oficial;
- el dark/light mode ya refinado en este sistema;
- fondos oscuros amigables a la vista, no negros absolutos agresivos;
- contraste moderado y consistente en tablas, cards, badges, popups y sidebars;
- compatibilidad total entre light y dark mode;
- `Framer Motion` como parte estructural de la experiencia del frontend nuevo.

La regla es explicita:

- no adoptar el dark mode por defecto de `Untitled UI` si visualmente se aleja del producto actual;
- no dejar `Framer Motion` como mejora futura opcional.

## Regla de alcance actual para Operaciones

En esta etapa todavia no se congela el layout final de `operaciones`.

La siguiente IA debe interpretar esto asi:

- si puede preparar arquitectura, base de componentes, tema, motion y estructura limpia;
- no puede inventar por cuenta propia el wireframe final de `operaciones`;
- no puede cerrar sin nueva instruccion la composicion definitiva de cards, filtros, paneles, datatables, modales o flujos internos.

La definicion visual exacta de `operaciones` se aterrizara paso a paso posteriormente.

## Regla de implementacion por fases

La siguiente IA no debe intentar construir todo el sistema en una sola pasada.

El frontend nuevo debe implementarse por fases cerradas, validables y acumulativas.

Orden obligatorio:

1. base del proyecto;
2. autenticacion;
3. layout general y navegacion;
4. paginas base del sistema;
5. catalogos core sin logica de negocio;
6. catalogos core con relaciones simples;
7. modulos operativos y contables.

La regla es simple:

- primero se construye la plataforma;
- luego los modulos administrativos;
- y solo despues se entra a Operaciones.
