# 08. Reportes: Contrato Futuro y Estado Actual

## Estado actual (implementado)

La descarga de reportes de cierre de caja (PDF y Excel) ya esta implementada como feature funcional dentro de `operaciones`. Ver documentacion detallada en:

- `32_operaciones_descarga_reportes.md`

Esta feature cubre:

- Descarga de KPI + Efectivizaciones Pagadas + Pago Deuda + Movimientos OTRO + Retenciones.
- Datos alineados con los tabs de la web (mismas tablas, mismas columnas).
- Modo Hoy (datos en vivo) y modo Historico (cierre congelado).
- Exportacion Excel con 4 sheets independientes.
- Componente `BancariaReporteCierrePdf` para impresion directa.

La funcion SQL `f_get_reporte_cierre` fue reescrita para usar las mismas fuentes que los tabs operativos: `tb_operacion_proceso` para Efectivizacion, Pago Deuda y Retenciones; `tb_operacion_caja` solo para Movimientos OTRO.

## Objetivo futuro

`reportes` concentrara las consultas consolidadas y descargas del sistema en una sola vista.

## Alcance esperado

Este dominio debe cubrir:

- exportaciones;
- cruces entre operaciones y cajas;
- cruces entre solicitudes y resultados;
- consolidaciones por rango de fecha;
- consolidaciones por empresa, cuenta, ruta o estado;
- vistas listas para descargar.

## Relacion con otros dominios

`reportes` depende de:

- `sistema` para catalogos y relaciones;
- `operaciones` para transacciones;
- `seguimientos` para estados operativos;
- `dashboard` para impactos financieros materializados.

## Estructura frontend sugerida

- `features/reportes/pages/`
- `features/reportes/components/`
- `features/reportes/hooks/`
- `features/reportes/services/`
- `features/reportes/schemas/`

## Regla documental

Debe quedar claro desde ahora que `reportes`:

- existe como dominio propio;
- no debe terminar repartido entre modulos aislados;
- y su UX futura debe centrarse en una sola vista consolidada de consulta y descarga.
