# Documentacion Funcional Vigente

Este directorio conserva la documentacion funcional cerrada y vigente del
proyecto. Los planes, analisis temporales y documentos de recuperacion que ya
cumplieron su objetivo fueron retirados. Los cambios nuevos deben documentarse
en archivos nuevos y agregarse a este indice cuando corresponda.

## Lectura recomendada

1. `36_mapa_funcional_vigente_2026-09.md`: mapa general de rutas, frontend,
   backend, reportes, cierres y reglas vigentes.
2. `01_sistema_tablas_core_y_patron_crud.md`: tablas core y patron comun de
   administracion.
3. `02_operaciones_vision_general.md`: alcance general del modulo Operaciones.
4. `03_operaciones_efectivizacion_bancaria.md`: efectivizacion bancaria.
5. `04_operaciones_efectivizacion_asistida.md`: POS y Link Pago.
6. `05_operaciones_pago_deuda.md`: Pago Deuda y sus estados.
7. `28_operaciones_flujo_negocio_actual.md`: flujo funcional actual.
8. `29_operaciones_frontend_interaccion_actual.md`: comportamiento actual de
   bandejas, acciones y filtros.
9. `30_operaciones_pruebas_retenciones_y_cierres.md`: validaciones operativas
   y casos de retencion/cierre.
10. `32_operaciones_descarga_reportes.md`: reportes Excel/PDF y rangos.
11. `33_manual_global_operaciones_pago_deuda_safetypay.md`: guia operativa de
    Pago Deuda y SafetyPay.
12. `34_cajas_operativas_modal_y_cierre.md`: caja, cierre y reapertura.
13. `38_creacion_usuarios_supabase_auth.md`: creacion de usuarios,
    invitaciones por correo, roles, sucursales y autenticacion.
14. `39_sistema_compensaciones_bonos_penalidades.md`: levantamiento de
    ESQUEMA 9, reutilizacion de evidencia operativa y plan para un sistema
    separado de compensaciones, bonos y penalidades.
15. `40_metricas_kpi_operaciones_bancarias.md`: propuesta para un dashboard de
    métricas históricas y comparativas de rutas bancarias, basado en los KPIs
    existentes y en las referencias visuales recibidas.
16. `41_propuesta_dashboard_historicos_estadisticas_bancarias.md`: definición
    funcional de la nueva pantalla de métricas, sus KPI, filtros, gráficos,
    contratos de consulta, entregas y criterios de aceptación.

17. `42_metricas_servicios_operativos.md`: alcance funcional de las vistas de
    Pago Deuda, POS y Link Pago dentro de Metricas Bancarias.
18. `43_especificacion_tecnica_metricas_servicios_operativos.md`: contrato
    tecnico, funciones analiticas nuevas, seguridad, pruebas e integracion
    frontend para esos servicios.

## Fuentes tecnicas

- Backend: `../CONTEXTO_GENERAL_BACKEND.md`
- Indice SQL: `../backend_implementacion/00.indice_backend_implementacion.md`
- Frontend: `../../src/CONTEXTO_GENERAL_FRONTEND.md`

Los archivos SQL y el codigo fuente son la autoridad para contratos,
permisos, parametros y comportamiento ejecutable. Esta documentacion explica
el uso y el mapa funcional, pero no reemplaza la implementacion.
