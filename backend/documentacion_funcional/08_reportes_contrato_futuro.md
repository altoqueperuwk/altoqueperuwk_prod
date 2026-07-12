# 08. Reportes: Contrato Futuro

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
