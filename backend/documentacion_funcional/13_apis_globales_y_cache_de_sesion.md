# 05. APIs Globales y Cache de Sesion

## Objetivo

Evitar que el frontend nuevo vuelva pesados los modulos, popups y formularios por cargar maestros una y otra vez.

## APIs globales de sesion

Estas APIs deben llamarse una sola vez y mantenerse en memoria global:

- `f_get_tb_navegacion_x_usuario`
- `f_get_tb_estado`
- `f_get_tb_comunidad`
- `f_get_tb_banco`
- `f_get_tb_empresa`
- `f_get_tb_empresa_cuenta_bancaria`
- `f_get_tb_codigo_servicio`

## Uso esperado

Estas APIs alimentan:

- menu lateral;
- rutas permitidas;
- dropdowns de estado;
- formularios de empresa;
- formularios de banco;
- cuentas bancarias;
- reglas de efectivizacion;
- operaciones;
- pago deuda;
- filtros generales.

## APIs lazy por modulo

### Sistema

- `f_get_tb_rol`
- `f_get_tb_sucursal`
- `f_get_tb_usuario`
- `f_get_tb_permiso_menu`
- `f_get_tb_permiso_usuario`

### Operaciones y Contable

- `f_get_tb_caja_operativa`
- `f_get_tb_categoria_operacion_caja`
- `f_get_tb_ruta_operacion_caja`
- `f_get_tb_asignacion_caja_operativa`

Estas no tienen que ir en el bootstrap global del login, pero si deben cachearse al primer ingreso del modulo.

## APIs que no son globales

No deben mantenerse como cache fijo de sesion:

- `f_get_tb_operacion_proceso`
- `f_get_tb_pago_deuda`
- `f_get_tb_pago_deuda_match`
- `f_get_tb_operacion_caja`
- `f_get_dashboard_kpis`
- `f_get_dashboard_global`
- `f_get_dashboard_cajas_servicios`
- `f_get_dashboard_top_ganancia`
- `f_get_dashboard_historial_fechas`
- `f_get_dashboard_bancos_cierre`
- `f_get_dashboard_top_ganancia_cierre`

Motivo:

- dependen de filtros;
- dependen de ruta;
- dependen de empresa;
- dependen de caja;
- dependen de fechas;
- y cambian mucho.

## Regla para popups

Los popups no deben volver a pedir:

- estados;
- comunidades;
- bancos;
- empresas;
- cuentas bancarias;
- codigos de servicio.

Todo eso debe salir del cache global.

## Recomendacion futura

Si luego se quiere optimizar mas, el backend idealmente deberia exponer:

- `f_get_app_session_bootstrap`
- `f_get_app_maestros_globales`

Pero mientras no existan, el set oficial de APIs globales de sesion ya esta definido arriba.
