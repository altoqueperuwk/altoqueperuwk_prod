# 02. Backend y Contrato Fuente de Verdad

## Regla central

El backend manda. El frontend no debe:

- recalcular reglas de negocio;
- inventar rutas;
- reconstruir permisos;
- hardcodear maestros;
- ni resolver comisiones por su cuenta.

## Regla de seguridad de funciones

Todas las funciones publicas consumidas por Supabase deben declararse con:

- `SECURITY DEFINER`

Esto incluye:

- funciones `GET`;
- funciones `POST`;
- funciones `PATCH`.

No se debe asumir que solo las funciones mutadoras lo necesitan. Las funciones de lectura tambien deben llevar `SECURITY DEFINER` para evitar rebotes por permisos al consumirlas desde frontend.

## Fuente backend vigente

La fuente de verdad operativa vive separada por responsabilidad en:

- `../backend_implementacion/`

Indice de esa carpeta:

- `../backend_implementacion/00.indice_backend_implementacion.md`

Regla de uso:

- para entender o tocar un dominio puntual, usar los `.sql` separados;
- aplicar cambios por orden numerico cuando corresponda;
- `10.retenciones_scotiabank_banbif.sql` contiene solo consultas/badges de retenciones para Scotiabank y Banbif.

## Tablas core compactadas

- `tb_estado`
- `tb_rol`
- `tb_sucursal`
- `tb_comunidad`
- `tb_usuario`
- `tb_permiso_menu`
- `tb_permiso_usuario`
- `tb_cliente`
- `tb_codigo_servicio`
- `tb_banco`
- `tb_empresa`
- `tb_empresa_cuenta_bancaria`
- `tb_reglas_efectivizacion`

## Tablas operativas principales

- `tb_operacion_proceso`
- `tb_pago_deuda` o equivalente compacto del dominio
- `tb_ruta_operacion_caja`
- `tb_asignacion_caja_operativa`
- `tb_caja_operativa`
- `tb_caja_operativa_cierre`
- `tb_categoria_operacion_caja`
- `tb_operacion_caja`

## Reglas de negocio cerradas

### 1. Tablas core

- se gestionan por `id_estado`;
- no se eliminan fisicamente desde UI;
- los cambios estructurales viajan por popup con `POST` o `PATCH`.

### 2. Operacion proceso

- guarda el snapshot congelado de comisiones, bancos, empresa y cliente;
- el backend resuelve el calculo;
- el frontend solo consume el resultado.

### 3. Pago deuda

Contrato minimo aprobado:

- `f_get_tb_pago_deuda`
- `f_get_tb_pago_deuda_match`
- `f_post_tb_pago_deuda_solicitud`
- `f_patch_tb_pago_deuda_salida`
- `f_patch_tb_pago_deuda_match`
- `f_patch_tb_pago_deuda_pagado`

### 4. Caja operativa

- mantiene KPIs materializados;
- soporta movimientos manuales, transferencias, retenciones y cierres;
- no depende del frontend para recalcular saldos globales.

### 4.1 Retenciones Scotiabank/Banbif

- La marca automatica nace desde `tb_empresa_cuenta_bancaria.flag_retencion`.
- La carga Excel/TXT crea operacion retenida y movimiento `INGRESO RETENIDO`.
- El ingreso retenido no sube caja disponible ni ingresos confirmados.
- Las bandejas y badges de Scotiabank/Banbif usan RPCs separadas de `10.retenciones_scotiabank_banbif.sql`.
- Confirmar retencion libera el movimiento retenido y apaga `flag_retenido`, pero no cambia el estado comercial de la operacion.
- Los bancos sin retencion usan los GET generales sin excepciones de retencion.

### 5. Asignacion de caja

- una caja solo puede pertenecer a un usuario;
- una caja ocupada no debe aparecer disponible para otro usuario;
- al desasignarse, vuelve a quedar libre.

## Que debe entregar el backend al frontend

- navegacion por usuario;
- rutas permitidas;
- maestros globales;
- contexto de ruta operativa;
- empresas y cuentas disponibles;
- cajas asignadas;
- datatables y KPIs por demanda.
