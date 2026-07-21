# 23. Operaciones Frontend: Mapeo Backend y RPC

## Objetivo

Traducir el backend compacto y el comportamiento validado del frontend actual a contratos concretos de frontend para la nueva implementacion de `operaciones`.

Este documento es la referencia tecnica principal para otra IA.

## Archivos backend fuente de verdad

- `backend_implementacion/03.operacion_proceso_y_excel.sql`
- `backend_implementacion/04.pago_deuda.sql`
- `backend_implementacion/05.ruta_operacion_y_cajas.sql`

## Modulos frontend raiz

La implementacion nueva debe organizarse en 2 modulos raiz:

- `src/features/operaciones/efectivizacion/`
- `src/features/operaciones/pago-deuda/`

Y dentro de `efectivizacion/` separar internamente:

- `bancaria/`
- `asistida/`
- `shared/`

## Bloques del frontend y sus fuentes backend

### KPI principal por ruta

RPC:

- `f_get_tb_ruta_operacion_kpi`

Uso:

- cards superiores de la ruta actual

### Configuracion de cajas y empresas por ruta

RPC:

- `f_get_tb_ruta_operacion_caja`
- `f_get_tb_ruta_operacion_caja_ingreso_principal`

Uso:

- tabs de empresa;
- empresa activa por ruta;
- caja primaria de ingreso;
- universo permitido de operacion por ruta.

### Detalle por caja

RPC:

- `f_get_tb_caja_operativa`

Uso:

- detalle contable por empresa/cuenta;
- soporte a formularios y vistas auxiliares.

### Registro manual de operacion

RPC compacta objetivo:

- `f_post_tb_operacion_proceso`
- `f_patch_tb_operacion_proceso_base`
- `f_patch_tb_operacion_proceso_pagado`
- `f_patch_tb_operacion_proceso_derivacion`
- `f_patch_tb_operacion_proceso_retencion`
- `f_patch_tb_operacion_proceso_reanudar`

Fuente funcional del frontend actual:

- `operacion-registrar-inline.tsx`
- `modal-operacion.tsx`

### Lectura de bandejas operativas

RPC compacta objetivo:

- `f_get_tb_operacion_proceso`

Uso:

- efectivizacion
- derivados
- lectura transversal de operaciones snapshot

Excepcion para rutas con retencion:

- `/operaciones/scotiabank`
- `/operaciones/banbif`

Estas rutas usan RPCs dedicadas para bandejas operativas:

- `f_get_tb_operacion_retencion_bandeja`
- `f_get_tb_operacion_retencion_bandeja_badges`
- `f_get_tb_operacion_retencion_empresa_badges`

Motivo:

- `Retenidos` usa `flag_retenido=true` y no depende del estado comercial.
- Una operacion retenida puede estar `Pagado` y seguir visible en `Efectivizacion`.
- Las reglas de cierre/historial no deben contaminar bancos sin retencion.

### Carga Excel

RPC compactas objetivo:

- `f_post_tb_operacion_proceso_excel`
- `f_post_tb_operacion_proceso_excel_ganancia`

Fuentes de comportamiento:

- `excel-upload-modal.tsx`
- `excel-upload-utils.ts`
- `excel-header-config.ts`

### Pago Deuda

RPC compactas objetivo:

- `f_post_tb_pago_deuda_solicitud`
- `f_patch_tb_pago_deuda_salida`
- `f_patch_tb_pago_deuda_pagado`

Fuente funcional actual:

- `src/features/operaciones/pago-deuda/`

### Descarga de reportes (PDF/Excel)

RPC:

- `f_get_reporte_cierre`

Parametros:

- `p_id_caja` — caja operativa activa
- `p_id_empresa` — empresa seleccionada (filtra operaciones)
- `p_ruta` — ruta bancaria
- `p_fecha_cierre` — fecha del cierre historico (NULL = modo Hoy)

Uso:

- boton "Descargar" en la barra superior de cada ruta bancaria
- genera PDF via `BancariaReporteCierrePdf` con 5 secciones: KPI, Efectivizaciones Pagadas, Pago Deuda, Movimientos OTRO, Retenciones
- genera Excel con 4 sheets planas
- las fuentes de datos estan alineadas con los tabs de la web: `tb_operacion_proceso` para Efectivizacion/Pago Deuda/Retenciones, `tb_operacion_caja` para Movimientos OTRO

Componentes:

- `src/features/operaciones/efectivizacion/bancaria/components/bancaria-reporte-cierre-pdf.tsx`

Ver `32_operaciones_descarga_reportes.md` para el detalle completo.

## Contextos minimos que el frontend debe manejar

### Ruta actual

Viene de la pagina actual:

- `/operaciones/bcp`
- `/operaciones/bbva`
- `/operaciones/scotiabank`
- `/operaciones/banbif`
- `/operaciones/interbank`
- `/operaciones/safetypay`
- `/operaciones/pos`
- `/operaciones/linkpago`
- `/operaciones/deuda`

### Empresa activa

Se deriva de las empresas/cajas habilitadas para la ruta.

La empresa activa afecta:

- titulo de formularios;
- bloque Excel;
- bandejas;
- universo operativo permitido en acciones.

### Usuario actual

Se usa para:

- auditoria;
- ownership operativo cuando aplique;
- acciones que el backend distinga por usuario.

## Fuente del frontend actual que si se reutiliza

Como fuente funcional y de comportamiento:

- Excel
- derivacion
- reasignacion
- retencion
- reportes
- formularios inline
- reglas de parsing y armado de payload

## Fuente del frontend actual que no se reutiliza

No copiar:

- la arquitectura pesada de `operacion-page-layout.tsx`;
- personalizaciones profundas de componentes;
- mezcla de UI, contabilidad y negocio en un solo archivo;
- wrappers custom del datatable viejo como patron obligatorio.

## Contrato de implementacion para otra IA

Otra IA debe:

- usar el backend compacto como fuente de verdad;
- usar el frontend actual solo para rescatar comportamiento ya probado;
- implementar visualmente con `Untitled UI` puro;
- aplicar `Framer Motion`;
- no inventar nuevas RPC si el backend compacto ya cubre el caso;
- mantener 2 modulos raiz: `efectivizacion` y `pago-deuda`.

## Regla final

Si hay conflicto entre:

- frontend actual
- bozquejo visual
- backend compacto

la prioridad es:

1. backend compacto
2. bozquejo visual congelado
3. comportamiento util del frontend actual

El frontend actual nunca prevalece sobre el contrato del backend compacto.
