# 32. Operaciones: Descarga de Reportes de Cierre (PDF/Excel)

> **Estado vigente 22/08/2026:** PDF y Excel deben reflejar el estado de la
> bandeja seleccionada y el snapshot del cierre. Ademas de pagadas, las secciones
> operativas pueden incluir pendientes segun el contrato vigente de la consulta;
> no asumir que `nombre_estado = Pagado` es un filtro global del reporte.

### Reglas actuales de cierre

- El historico conserva operaciones finalizadas y su clasificacion informativa.
- Las operaciones pendientes se atienden en Hoy y no se deben presentar como si
  fueran nuevas operaciones del cierre anterior.
- Retenidos y Fuera de Horario no generan liberacion automatica ni modifican caja
  por el solo hecho de aparecer en el reporte.
- Para Scotiabank y BanBif, la ganancia especial se agrupa por
  `fecha_deposito_cliente` y solo considera operaciones Efectivizacion PAGADAS.

## Objetivo

Documentar la feature de descarga de reportes de cierre de caja implementada en `operaciones`. El boton "Descargar" genera un PDF o Excel identico a lo que el usuario visualiza en los tabs operativos de la web, usando las mismas fuentes de datos.

## Problema resuelto

La funcion original `f_get_reporte_cierre` consultaba exclusivamente `tb_operacion_caja` (tabla de movimientos contables) para todas las secciones. Esto producia datos distintos a los tabs de la web, que consultan `tb_operacion_proceso` (tabla de operaciones) para Efectivizacion, Pago Deuda y Retenciones.

La nueva version alinea el PDF/Excel con la web usando las mismas tablas que los tabs operativos.

---

## Funcion SQL: `f_get_reporte_cierre`

**Archivo:** `backend/backend_implementacion/05.ruta_operacion_y_cajas.sql`

### Firma

```sql
CREATE OR REPLACE FUNCTION public.f_get_reporte_cierre(
  p_id_caja bigint,
  p_id_empresa bigint DEFAULT NULL,
  p_ruta character varying DEFAULT NULL,
  p_id_caja_cierre bigint DEFAULT NULL,
  p_fecha_cierre date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
```

### Parametros

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `p_id_caja` | `bigint` | ID de la caja operativa activa |
| `p_id_empresa` | `bigint` | ID de la empresa seleccionada (filtra operaciones) |
| `p_ruta` | `varchar` | Ruta bancaria (bcp, scotiabank, etc.) |
| `p_id_caja_cierre` | `bigint` | ID directo del cierre (opcional) |
| `p_fecha_cierre` | `date` | Fecha del cierre historico (opcional; si es NULL = modo Hoy) |

### Estructura de respuesta

```json
{
  "empresa": "Capital Nova S.A.",
  "banco": "BCP",
  "fecha_cierre": "2026-07-20T...",
  "kpi": {
    "caja_inicial": 100000,
    "caja_actual": 68286.80,
    "total_recaudado": 0,
    "ingresos": 0,
    "salidas": 31680,
    "gastos_operacionales": 33.20,
    "ganancias": 0,
    "ingresos_retenidos": 32000,
    "pendiente_depositar": 0,
    "total_efectivizacion": 0,
    "total_pago_deuda": 0
  },
  "efectivizacion": [ ... ],
  "pago_deuda": [ ... ],
  "movimientos": [ ... ],
  "retenciones": [ ... ]
}
```

### Mapeo de fuentes de datos por seccion

| Seccion | Tabla | Filtro |
|---------|-------|--------|
| **kpi** (historico) | `tb_caja_operativa_cierre` | `id_caja = p_id_caja AND fecha_cierre::date = p_fecha_cierre` |
| **kpi** (hoy) | `tb_ruta_operacion_kpi` | `ruta = p_ruta` |
| **efectivizacion** | `tb_operacion_proceso` | `tipo_servicio = 'EFECTIVIZACION' AND nombre_estado = 'PAGADO'` |
| **pago_deuda** | `tb_operacion_proceso` | `tipo_servicio = 'PAGO DEUDA' AND flag_retenido = false AND tipo_flujo_pago_deuda <> 'RETORNO'` |
| **movimientos** | `tb_operacion_caja` | `tipo_origen NOT IN ('EFECTIVIZACION', 'PAGO_DEUDA*') AND nombre_estado <> 'RETENIDO'` |
| **retenciones** | `tb_operacion_proceso` | `flag_retenido = true` |

### Logica de filtrado por cierre

- **Modo Hoy (`p_fecha_cierre = NULL`)**: cada seccion filtra con `id_caja_cierre IS NULL` (operaciones vivas, no cerradas aun).
- **Modo Historico (`p_fecha_cierre` definido)**: primero se busca `v_fecha_cierre_ts` en `tb_caja_operativa_cierre`; luego cada seccion filtra con `id_caja_cierre IN (SELECT id FROM tb_caja_operativa_cierre WHERE id_caja = p_id_caja AND fecha_cierre::date = p_fecha_cierre)`.

---

## Columnas por seccion (coinciden con los DataTables de la web)

### Efectivizaciones Pagadas

Campos de `tb_operacion_proceso`:

| Columna PDF | Campo SQL |
|-------------|-----------|
| Facturacion | `tipo_facturacion` |
| Cod. Op. | `codigo_operacion_deposito_cliente` |
| DNI | `dni_cliente` |
| Comunidad | `nombre_comunidad` |
| Cuenta Cliente | `nombre_banco_cliente_transferencia` |
| Monto | `monto_deposito_cliente` |
| Comision | `resultado_comision_servicio` |
| Transferencia | `monto_transferencia_cliente` |
| Estado | `nombre_estado` |
| Hora | `fecha_deposito_cliente` |

### Pago Deuda

Campos de `tb_operacion_proceso`:

| Columna PDF | Campo SQL |
|-------------|-----------|
| Codigo | `codigo_operacion_deposito_cliente` |
| DNI | `dni_cliente` |
| Cliente | `nombre_cliente` |
| Empresa Salida | `nombre_empresa_salida` |
| Cuenta | `nombre_banco_empresa_cuenta_salida` |
| Monto Transferencia | `monto_transferencia_cliente` |
| Empresa Ingreso | `nombre_empresa_ingreso` |
| Cuenta Ingreso | `nombre_banco_empresa_cuenta_ingreso` |
| Monto Devolucion | `monto_devuelto` |
| Fecha | `fecha_registro` |

### Movimientos (OTRO)

Campos de `tb_operacion_caja`:

| Columna PDF | Campo SQL |
|-------------|-----------|
| Origen | `tipo_origen` |
| Tipo | `tipo_movimiento` |
| DNI | `dni_cliente` |
| Codigo | `codigo_operacion` |
| Ingreso | `monto_ingreso` |
| Salida | `monto_salida` |
| Gasto | `monto_gasto` |
| Ganancia | `monto_ganancia` |
| Detalle | `detalle` |
| Fecha | `fecha_registro` |

### Retenciones

Campos de `tb_operacion_proceso`:

| Columna PDF | Campo SQL |
|-------------|-----------|
| Codigo | `codigo_operacion_deposito_cliente` |
| DNI | `dni_cliente` |
| Cliente | `nombre_cliente` |
| Monto | `monto_transferencia_cliente` |
| Motivo | `motivo_retencion` |
| Retiene | `nombre_usuario_retiene` |
| Fecha Retencion | `fecha_retencion` |

---

## Componente Frontend: `BancariaReporteCierrePdf`

**Archivo:** `src/features/operaciones/efectivizacion/bancaria/components/bancaria-reporte-cierre-pdf.tsx`

Renderiza el HTML para impresion (via `window.print()`) con 5 secciones:

1. **KPI** — tabla con los 11 indicadores (Caja Inicial, Caja Actual, Caja Recaudacion, Ingresos, Salidas, Gastos Op., Ganancias, Ret. Recaudacion, Pend. Depositar, Total Efectivizacion, Total Pago Deuda).
2. **Efectivizaciones Pagadas** — tabla con 10 columnas + fila de totales (Monto, Comision, Transferencia).
3. **Pago Deuda** — tabla con 10 columnas + fila de total.
4. **Movimientos (OTRO)** — tabla con 10 columnas + fila de totales (Ingreso, Salida, Gasto, Ganancia).
5. **Retenciones** — tabla con 7 columnas + fila de total.

Cada seccion solo se renderiza si tiene datos. Si todas estan vacias, muestra "Sin operaciones para este periodo."

---

## Integracion en `bancaria-page.tsx`

### `handleOpenDownload`

```ts
const data = await operacionesRpcService.getReporteCierre({
    p_id_caja: cajaId,
    p_id_empresa: activeCompanyId,
    p_ruta: ruta,
    p_fecha_cierre: selectedHistoryDate || undefined,
});
```

### `handleDownloadExcel`

Genera un `.xlsx` con 4 sheets planos: `Efectivizaciones`, `Pago Deuda`, `Movimientos`, `Retenciones`.

### `handleDownloadPdf`

Abre ventana nueva, renderiza `<BancariaReporteCierrePdf>` con `createRoot`, ejecuta `window.print()`.

---

## Flujo completo

```
Usuario hace clic en "Descargar"
         │
         ▼
Modal con 2 botones: [Excel] [PDF]
         │
         ▼
handleOpenDownload() ──► f_get_reporte_cierre(p_id_caja, p_id_empresa, p_ruta, p_fecha_cierre)
         │
         ▼
Respuesta JSON con { kpi, efectivizacion, pago_deuda, movimientos, retenciones }
         │
    ┌────┴────┐
    ▼         ▼
  Excel      PDF
  (xlsx)     (window.print)
  4 sheets   BancariaReporteCierrePdf
```

---

## Relacion con otros componentes

| Componente | Rol |
|-----------|-----|
| `BancariaKpiGrid` | KPI cards en la web (misma fuente de datos que el PDF) |
| `BancariaOperationalTabs` | Tabs de la web (Efectivizacion, Pago Deuda, Movimientos, Retenidos) |
| `BancariaEfectivizacionTable` | DataTable de efectivizacion (mismas columnas que el PDF) |
| `BancariaHistoryDropdown` | Dropdown de historial (determina `p_fecha_cierre`) |
| `useBancariaKpis` | Hook de KPI (misma fuente: `f_get_tb_ruta_operacion_kpi` / `f_get_tb_caja_operativa_cierre`) |
| `useBancariaBandeja` | Hook de bandejas (mismos filtros que `f_get_reporte_cierre`) |

---

## Notas tecnicas

- El `ORDER BY` dentro de `jsonb_agg` debe usar nombres de columna directos (ej: `ORDER BY codigo_operacion_deposito_cliente`), NO `x->>'columna'` porque `x` es un `record`, no `jsonb`.
- El componente PDF usa inline styles para impresion (sin Tailwind, sin CSS modules).
- Los totales de efectivizacion suman `monto`, `comision` y `transferencia` por separado.
- El campo `tipo_facturacion` muestra "Boleta" o "Sin Boleta" (default: "Boleta").
- El campo `nombre_estado` en efectivizacion siempre es "Pagado" porque el filtro SQL lo garantiza.
