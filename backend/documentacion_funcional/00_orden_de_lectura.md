# 00. Orden de Lectura

## Objetivo

Este folder ya no se lee primero por ejes tecnicos, sino por dominios reales del producto. La idea es que otra IA entienda primero como se divide el negocio y despues consuma el soporte tecnico para implementar sin mezclar responsabilidades.

## Orden oficial por dominio

### 1. Sistema

Leer primero:

- `01_sistema_tablas_core_y_patron_crud.md`

Aqui se entiende:

- que tablas core existen;
- como se construyen los CRUD administrativos;
- que patron visual se usa;
- y que modulos pertenecen al dominio `sistema`.

### 2. Operaciones: vision general

Leer despues:

- `02_operaciones_vision_general.md`

Aqui se entiende:

- que `operaciones` no es un modulo monolitico;
- que se divide en 3 familias reales de negocio;
- que rutas pertenecen a cada familia;
- y como debe organizarse el frontend nuevo por features.

### 3. Operaciones: efectivizacion bancaria

Leer despues:

- `03_operaciones_efectivizacion_bancaria.md`

Aqui se entiende:

- que rutas si tienen caja inicial propia;
- que rutas si tienen Excel;
- y que flujos transaccionales completos viven en esta familia.

### 4. Operaciones: efectivizacion asistida

Leer despues:

- `04_operaciones_efectivizacion_asistida.md`

Aqui se entiende:

- que rutas no tienen caja propia;
- que generan solicitud o impacto configurable;
- y como conviven dentro de `operaciones` sin ser una caja autonoma.

### 5. Operaciones: pago deuda

Leer despues:

- `05_operaciones_pago_deuda.md`

Aqui se entiende:

- que `pago deuda` es una familia aparte;
- que tampoco tiene caja propia;
- y como usa una caja real configurable solo para registrar impacto final o comision.

### 6. Seguimientos

Leer despues:

- `06_seguimientos_contrato_futuro.md`

Aqui se entiende:

- que se implementara luego;
- que contratos futuros debe respetar;
- y como depende del estado operativo de las transacciones.

### 7. Dashboard

Leer despues:

- `07_dashboard_contrato_futuro.md`

Aqui se entiende:

- que dashboard significa cajas iniciales reales;
- que no es una vista de solicitudes puras;
- y que se centra en KPIs, cierres e impactos financieros materializados.

### 8. Reportes

Leer despues:

- `08_reportes_contrato_futuro.md`

Aqui se entiende:

- que consolidaciones y descargas futuras existiran;
- y que este dominio cruza operaciones, cajas, seguimientos y resultados.

## Documentos de soporte tecnico

Despues de leer los dominios, continuar con:

- `09_contexto_general_y_objetivo.md`
- `10_backend_y_contrato_fuente_de_verdad.md`
- `11_patron_crud_tablas_core_y_popups.md`
- `12_sidebar_rutas_e_iconografia.md`
- `13_apis_globales_y_cache_de_sesion.md`
- `14_untitledui_setup_y_forma_de_trabajo.md`
- `15_frontend_stack_y_supabase.md`
- `16_fases_implementacion_frontend.md`

## Capa tecnica nueva de Operaciones

Cuando la implementacion llegue a `Operaciones`, leer obligatoriamente esta segunda capa:

- `17_operaciones_frontend_shell_y_layout_base.md`
- `18_operaciones_frontend_kpis_y_bloque_superior.md`
- `19_operaciones_frontend_formularios_inline.md`
- `20_operaciones_frontend_excel_y_carga_masiva.md`
- `21_operaciones_frontend_tabs_y_bandejas_operativas.md`
- `22_operaciones_frontend_contratos_por_tab.md`
- `23_operaciones_frontend_mapeo_backend_y_rpc.md`
- `28_operaciones_flujo_negocio_actual.md`
- `29_operaciones_frontend_interaccion_actual.md`
- `30_operaciones_pruebas_retenciones_y_cierres.md`
- `31_contexto_general_recuperacion_proyecto.md`

Aqui se entiende:

- el layout exacto congelado de `Webpage.png`;
- el bloque inferior de bandejas congelado de `Webpage-2.png`;
- como implementar `Operaciones` con `Untitled UI` puro;
- que partes del frontend actual solo sirven como fuente de comportamiento;
- que RPC compactas gobiernan cada bloque del frontend nuevo;
- cual es el flujo de negocio vigente despues de retenciones, Pago Deuda, cierres y actualizacion parcial de filas;
- y que archivos frontend/backend se deben restaurar primero si se corrompe el proyecto.

## Regla de implementacion

1. leer primero los dominios `01-08`;
2. usar `10_backend_y_contrato_fuente_de_verdad.md` como puente entre negocio y SQL;
3. tomar `../backend_implementacion/3.ddl_tablas_funciones_compactas.sql` como snapshot completo del backend nuevo;
4. usar `../backend_implementacion/` para cambios puntuales por dominio;
5. respetar `14_untitledui_setup_y_forma_de_trabajo.md` como referencia visual oficial;
6. respetar `16_fases_implementacion_frontend.md` como orden obligatorio de construccion;
7. al iniciar `Operaciones`, dejar de improvisar el layout y seguir de forma obligatoria los documentos `17-23`;
8. para cambios actuales de negocio, leer siempre `28-30` porque reflejan la implementacion vigente;
9. para recuperar contexto general o reconstruir archivos criticos, leer `31_contexto_general_recuperacion_proyecto.md`.
