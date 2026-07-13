# 16. Fases de Implementacion Frontend

## Objetivo

Definir el orden exacto en que debe implementarse el frontend nuevo para que otra IA no improvise el roadmap ni deje piezas criticas para despues.

La implementacion debe hacerse por fases, y cada fase debe quedar utilizable antes de pasar a la siguiente.

## Regla principal

No se debe comenzar por `Operaciones`.

Primero debe quedar resuelto el esqueleto completo del producto:

- autenticacion;
- layout;
- menu;
- paginas base;
- modulos core administrativos.

Solo despues se construyen los modulos operativos.

## Fase 0. Bootstrap tecnico

### Objetivo

Dejar la base del proyecto lista para comenzar.

### Alcance obligatorio

- crear proyecto `React + Vite`;
- mantener `Tailwind` y el sistema visual actual como base;
- mantener como fuente de verdad el dark/light mode actual del producto;
- evitar el dark mode negro profundo por defecto de `Untitled UI`;
- instalar `Framer Motion`;
- instalar `@supabase/supabase-js`;
- configurar `.env`;
- crear `src/lib/supabase.ts`;
- definir estructura base de carpetas;
- definir CSS principal del proyecto;
- configurar tema base claro/oscuro;
- instalar herramientas recomendadas para la IA implementadora.

### Resultado esperado

El proyecto compila, mantiene el sistema visual actual y puede consumir Supabase.

Regla de fase:

- desde esta fase ya se debe respetar el sistema visual actual basado en `Untitled UI`;
- desde esta fase ya se debe respetar el dark/light actual del producto;
- desde esta fase `Framer Motion` ya debe estar disponible como capa transversal;
- no se debe construir una base provisional con componentes genericos para luego rehacerla.

## Fase 1. Autenticacion y sesion

### Objetivo

Dejar listo el acceso al sistema.

### Alcance obligatorio

- pagina `login`;
- flujo de inicio de sesion con Supabase;
- persistencia de sesion;
- `logout`;
- provider de autenticacion;
- guard de rutas privadas;
- carga inicial del usuario autenticado;
- carga inicial de navegacion segun permisos.

### Especificacion visual obligatoria del login

El `login` debe ser normal, sobrio y rapido de implementar.

Patron aprobado:

- pagina completa, no modal;
- un solo card o panel central;
- titulo simple del sistema;
- campo `email`;
- campo `password`;
- boton principal `Ingresar`;
- mensaje de error si falla;
- estado loading del boton mientras autentica.

No debe incluir:

- panel derecho decorativo;
- imagen promocional;
- texto tipo marketing;
- login social;
- bloque `continue with`;
- links de registro publico;
- layout dividido innecesario.

Opcional permitido:

- link `Olvide mi contrasena` solo si el flujo real ya existe en Supabase.

### Resultado esperado

Un usuario puede entrar, mantener sesion y salir sin tocar aun los modulos de negocio.

## Fase 2. Layout general y navegacion

### Objetivo

Construir el shell visual del sistema.

### Alcance obligatorio

- layout autenticado;
- header general;
- sidebar expandido;
- sidebar colapsable;
- acordeon vertical para grupos;
- tooltips en modo colapsado;
- breadcrumb reutilizable;
- soporte claro/oscuro;
- pagina `home` o `dashboard inicial` simple.

### Resultado esperado

El usuario ya puede navegar el sistema con una estructura completa y consistente.

Regla adicional:

- sidebar, cambios de vista, tabs y overlays ya deben moverse con `Framer Motion`;
- la experiencia debe sentirse fluida y premium, pero no recargada.

## Fase 3. Paginas base obligatorias

### Objetivo

Cerrar las paginas estructurales del sistema desde el inicio.

### Alcance obligatorio

- pagina `404`;
- pagina `403`;
- pagina de `cargando` o `skeleton` de modulo;
- pagina o bloque de `sin permisos`;
- pagina o bloque de `sin datos`;
- manejo base de errores de aplicacion;
- toasts globales.

### Resultado esperado

El frontend ya no deja huecos UX para estados basicos del producto.

## Fase 4. Catalogos core sin logica de negocio

### Objetivo

Implementar primero los modulos mas simples, que sirven para validar el patron oficial del frontend nuevo.

### Modulos incluidos

- `tb_estado`
- `tb_rol`
- `tb_sucursal`
- `tb_comunidad`
- `tb_codigo_servicio`

### Patron obligatorio

- breadcrumb;
- filtros compactos:
  - `Nombre`
  - `Estado`
  - `Buscar`
  - `Limpiar`
  - `Nuevo`
- datatable paginado;
- cambio de `Estado` inline;
- accion `save` inline para cambios pendientes;
- accion `historial` por fila;
- popup `Nuevo/Editar`.

### Resultado esperado

El patron visual y tecnico del CRUD ya queda probado con modulos simples, incluyendo el acceso al historial espejo de cada registro.

## Fase 5. Seguridad y usuarios

### Objetivo

Cerrar acceso, usuarios y permisos sobre la base del sistema ya establecida.

### Modulos incluidos

- `tb_usuario`
- `tb_permiso_menu`
- `tb_permiso_usuario`

### Reglas especiales

- el alta de usuarios no ocurre en `/login`;
- el alta de usuarios ocurre solo desde el modulo principal administrativo;
- luego se sincroniza el usuario de negocio en `tb_usuario`;
- permisos y navegacion deben reflejarse en la sesion actual;
- el menu debe reconstruirse desde backend.

Patron visual aprobado:

- breadcrumb;
- filtros compactos;
- datatable como centro de trabajo;
- popup para `Nuevo` y `Editar`;
- cambio de estado inline en tabla;
- accion `save` por fila;
- accion `historial` por fila;
- este mismo patron debe quedar reutilizable luego desde `Operaciones`.

### Resultado esperado

El sistema ya administra usuarios reales, permisos y navegacion dinamica.

## Fase 6. Catalogos core con relaciones de negocio simple

### Objetivo

Construir los maestros que luego alimentaran Operaciones.

### Modulos incluidos

- `tb_cliente`
- `tb_banco`
- `tb_empresa`
- `tb_empresa_cuenta_bancaria`
- `tb_reglas_efectivizacion`

### Reglas especiales

- `tb_banco` gestiona equivalencias `jsonb` dentro del popup;
- `tb_cliente` gestiona celulares `jsonb` dentro del popup;
- `tb_empresa` y `tb_empresa_cuenta_bancaria` deben quedar listas para ser llamadas luego desde Operaciones;
- `tb_reglas_efectivizacion` debe tener popup amplio por bloques;
- todas estas tablas deben exponer historial `_his` desde la misma tabla principal.

### Resultado esperado

El sistema ya tiene todos los maestros necesarios para habilitar el dominio operativo.

## Fase 7. Operaciones y dominios de negocio

### Objetivo

Recien aqui se implementa el dominio fuerte del producto.

### Modulos incluidos

- `features/operaciones/efectivizacion/`
- `features/operaciones/pago-deuda/`
- KPI por ruta
- formularios inline
- carga Excel
- tabs de bandeja
- datatables operativos
- cierres e historial de ruta

### Regla de arranque

Esta fase solo comienza cuando:

- login funciona;
- sidebar funciona;
- paginas base existen;
- modulos core ya estan operativos;
- permisos y menu dinamico ya funcionan;
- maestros alimentadores ya existen.

### Regla de implementacion ya cerrada

En esta fase ya no se debe improvisar el layout de `Operaciones`.

La siguiente IA debe leer de forma obligatoria:

- `17_operaciones_frontend_shell_y_layout_base.md`
- `18_operaciones_frontend_kpis_y_bloque_superior.md`
- `19_operaciones_frontend_formularios_inline.md`
- `20_operaciones_frontend_excel_y_carga_masiva.md`
- `21_operaciones_frontend_tabs_y_bandejas_operativas.md`
- `22_operaciones_frontend_contratos_por_tab.md`
- `23_operaciones_frontend_mapeo_backend_y_rpc.md`

Eso congela:

- el layout exacto de `Webpage.png`;
- el bloque de bandejas de `Webpage-2.png`;
- los formularios inline;
- los KPI materializados;
- el contrato de Excel;
- los tabs, filtros y acciones por bandeja;
- y el mapeo RPC del backend compacto.

### Regla visual obligatoria

`Operaciones` en la nueva web compacta debe implementarse con:

- `Untitled UI` puro como libreria base de componentes;
- el tema claro/oscuro ya aprobado del proyecto compacto;
- `Framer Motion` como capa transversal de UX;
- cero dependencia de la composicion pesada del frontend viejo.

El frontend actual de `src/features/operaciones/` solo sirve como fuente de comportamiento validado:

- parsing Excel;
- derivacion;
- reasignacion;
- retencion;
- reglas de formularios;
- reportes.

No sirve como patron obligatorio de estructura, layout ni wrappers de componentes.

Regla estructural adicional:

- `efectivizacion-bancaria` y `efectivizacion-asistida` siguen existiendo como familias de negocio;
- pero en frontend se implementan dentro del mismo modulo raiz `features/operaciones/efectivizacion/`;
- `pago-deuda` conserva modulo raiz propio.

## Set minimo de rutas que deben existir temprano

Desde fases tempranas ya deben existir rutas registradas para:

- `/login`
- `/`
- `/403`
- `*` o ruta `404`
- modulos core administrativos

Y luego, cuando toque negocio:

- `/operaciones/bcp`
- `/operaciones/bbva`
- `/operaciones/scotiabank`
- `/operaciones/banbif`
- `/operaciones/interbank`
- `/operaciones/safetypay`
- `/operaciones/pos`
- `/operaciones/linkpago`
- `/operaciones/deuda`

## Regla final para la siguiente IA

La siguiente IA debe asumir:

1. el frontend nuevo se implementa por fases;
2. no se salta directo a Operaciones;
3. primero se cierra autenticacion, layout, paginas base y modulos core;
4. se mantiene el sistema visual actual basado en `Untitled UI`;
5. el dark/light actual del proyecto prevalece sobre defaults externos;
6. `Framer Motion` se usa desde el inicio con intensidad moderada;
7. `Operaciones` ya tiene una especificacion tecnica cerrada en los documentos `17-23`;
8. no debe inventarse ni reinterpretarse el layout operativo fuera de esos contratos;
9. no debe quedar ninguna pieza estructural importante para despues.

## Checklist ejecutivo

- [ ] Fase 0 completa
- [ ] Fase 1 completa
- [ ] Fase 2 completa
- [ ] Fase 3 completa
- [ ] Fase 4 completa
- [ ] Fase 5 completa
- [ ] Fase 6 completa
- [ ] Fase 7 lista para iniciar con docs `17-23`
