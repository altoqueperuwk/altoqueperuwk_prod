# 00. Orden de Lectura

## Estado vigente para nuevas sesiones

Antes de modificar Operaciones, leer estas dos fuentes maestras:

1. `../CONTEXTO_GENERAL_BACKEND.md`
2. `../../src/CONTEXTO_GENERAL_FRONTEND.md`

Luego leer `28`, `29`, `30`, `34` y `35`. Esos documentos resumen el estado
actual de retenciones, KPI, cierres, bandejas y conciliacion. Los documentos
anteriores describen decisiones de diseno, fases o contratos historicos; si hay
contradiccion, prevalece el codigo vigente y las fuentes maestras.

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
- que generan registro o solicitud operativa sin cierre propio;
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
- `32_operaciones_descarga_reportes.md`
- `33_manual_global_operaciones_pago_deuda_safetypay.md`
- `34_cajas_operativas_modal_y_cierre.md`
- `35_retenidos_informativos_y_fuera_horario.md`

Los manuales por ruta que existian en `manuales_md/` y en las carpetas de
operaciones son historicos y pueden no estar presentes en el checkout actual.
Para la guia operativa vigente usar `33_manual_global_operaciones_pago_deuda_safetypay.md`
y las dos fuentes maestras indicadas arriba.

Aqui se entiende:

- el layout exacto congelado de `Webpage.png`;
- el bloque inferior de bandejas congelado de `Webpage-2.png`;
- como implementar `Operaciones` con `Untitled UI` puro;
- que partes del frontend actual solo sirven como fuente de comportamiento;
- que RPC compactas gobiernan cada bloque del frontend nuevo;
- cual es el flujo de negocio vigente despues de retenciones, Pago Deuda, cierres y actualizacion parcial de filas;
- y que archivos frontend/backend se deben restaurar primero si se corrompe el proyecto.
- que guia funcional sirve como base para manual HTML de bancos, SafetyPay y Pago Deuda.
- que manuales operativos por ruta existen para usuarios finales.

## Fuentes maestras de continuidad

- Backend: `../CONTEXTO_GENERAL_BACKEND.md`
- Frontend: `../../src/CONTEXTO_GENERAL_FRONTEND.md`
- Analisis de locks: `../backend_implementacion/REVISION_TB_OPERACION_PROCESO.md`
- Plan de locks: `../backend_implementacion/PLAN_OPTIMIZACION_LOCKS.md`
- Plan de refresco: `../backend_implementacion/PLAN_OPTIMIZACION_REFRESH_FRONTEND.md`

## Regla de implementacion

1. leer primero los dominios `01-08`;
2. usar `10_backend_y_contrato_fuente_de_verdad.md` como puente entre negocio y SQL;
3. tomar `../backend_implementacion/00.indice_backend_implementacion.md` como mapa tecnico vigente del backend;
4. usar `../backend_implementacion/` para cambios por dominio, incluyendo `10.retenciones_scotiabank_banbif.sql` para consultas especiales de Scotiabank/Banbif;
5. respetar `14_untitledui_setup_y_forma_de_trabajo.md` como referencia visual oficial;
6. respetar `16_fases_implementacion_frontend.md` como orden obligatorio de construccion;
7. al iniciar `Operaciones`, dejar de improvisar el layout y seguir de forma obligatoria los documentos `17-23`;
8. para cambios actuales de negocio, leer siempre `28-30` porque reflejan la implementacion vigente;
9. para recuperar contexto general o reconstruir archivos criticos, leer `31_contexto_general_recuperacion_proyecto.md`.
10. para reportes y cierres, validar `32_operaciones_descarga_reportes.md` y `34_cajas_operativas_modal_y_cierre.md`.
