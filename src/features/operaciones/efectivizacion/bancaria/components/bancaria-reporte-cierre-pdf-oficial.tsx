import type { ReactNode } from "react";
import { formatInteger, formatMoney as formatCurrency } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { calcularSaldoBanco } from "@/features/operaciones/efectivizacion/bancaria/utils/saldo-banco";
import { getReporteEfectivizacionUnificada } from "@/features/operaciones/efectivizacion/bancaria/utils/reporte-efectivizacion";
import { getReporteCierreEmpresaSummary } from "@/features/reportes/services/reporte-cierre-caja-summary";
import type { SafetyPayKpi } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

interface ReportRowBase {
    operacion?: string | null;
    codigo_operacion_deposito_cliente?: string | null;
    dni?: string | null;
    dni_cliente?: string | null;
    estado?: string | null;
    nombre_estado?: string | null;
    fecha?: string | null;
    fecha_deposito_cliente?: string | null;
    fecha_registro?: string | null;
}

interface EfectivizacionRow extends ReportRowBase {
    facturacion?: string | null;
    tipo_facturacion?: string | null;
    comunidad?: string | null;
    nombre_comunidad?: string | null;
    deposito?: number | null;
    monto?: number | null;
    porcentaje_comision?: number | null;
    comision_servicio?: number | null;
    soles_comision?: number | null;
    comision?: number | null;
    gastos?: number | null;
    ganancia?: number | null;
    transferencia?: number | null;
    derivada_congelada?: boolean | null;
}

interface PagoDeudaRow extends ReportRowBase {
    empresa_salida?: string | null;
    nombre_empresa_salida?: string | null;
    cuenta_salida?: string | null;
    cuenta?: string | null;
    transferencia?: number | null;
    monto_transferencia?: number | null;
    empresa_ingreso?: string | null;
    nombre_empresa_ingreso?: string | null;
    cuenta_ingreso?: string | null;
    deposito?: number | null;
    monto_devolucion?: number | null;
    porcentaje_comision?: number | null;
    comision_servicio?: number | null;
    soles_comision?: number | null;
}

interface PosRow extends ReportRowBase {
    empresa?: string | null;
    cuenta?: string | null;
    deposito?: number | null;
    porcentaje_comision?: number | null;
    soles_comision?: number | null;
    transferencia?: number | null;
}

interface DerivadoRow extends ReportRowBase {
    facturacion?: string | null;
    tipo_facturacion?: string | null;
    derivo?: string | null;
    comunidad?: string | null;
    cuenta_cliente?: string | null;
    monto?: number | null;
    porcentaje_comision?: number | null;
    soles_comision?: number | null;
    transferencia?: number | null;
}

interface MovimientoRow {
    tipo_origen?: string | null;
    tipo_movimiento?: string | null;
    movimientos?: string[] | null;
    dni_cliente?: string | null;
    codigo_operacion?: string | null;
    nombre_empresa?: string | null;
    monto_ingreso?: number | null;
    monto_salida?: number | null;
    monto_gasto?: number | null;
    monto_ganancia?: number | null;
    tipo_facturacion?: string | null;
    nombre_banco?: string | null;
    nombre_empresa_relacionada?: string | null;
    nombre_banco_relacionada?: string | null;
    nombre_empresa_contraparte?: string | null;
    nombre_banco_contraparte?: string | null;
    fecha_registro?: string | null;
}

interface RetencionRow extends ReportRowBase {
    monto?: number | null;
    estado?: string | null;
    fecha_corte_recaudacion?: string | null;
    fecha_estimada_abono?: string | null;
    fecha_liberacion_abono?: string | null;
    flag_liberable_abono?: boolean | null;
    motivo_retencion?: string | null;
}

interface ReporteCierreData {
    ruta?: string;
    id_empresa?: number;
    id_banco?: number;
    id_empresa_cuenta_bancaria?: number;
    empresa?: string;
    banco?: string;
    fecha_cierre?: string;
    kpi?: Record<string, number>;
    efectivizacion?: EfectivizacionRow[];
    efectivizacion_pendientes?: EfectivizacionRow[];
    derivados?: DerivadoRow[];
    derivados_pendientes?: DerivadoRow[];
    pago_deuda?: PagoDeudaRow[];
    pago_deuda_pendientes?: PagoDeudaRow[];
    pos?: PosRow[];
    pos_pendientes?: PosRow[];
    movimientos?: MovimientoRow[];
    retenciones?: RetencionRow[];
    retenciones_pagadas?: RetencionRow[];
    retenciones_pendientes?: RetencionRow[];
    safetypay_kpi?: SafetyPayKpi;
}

interface BancariaReporteCierrePdfOficialProps {
    data: ReporteCierreData | null;
}

const reportStyles = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
.report-container, .report-container * { box-sizing:border-box; }
.report-container .hidden { display:none; }
.report-container {
    width:794px;
    max-width:794px;
    margin:0 auto;
    padding:20px;
    font-family:'Inter', sans-serif;
    background:#FFFFFF;
    color:#1E2A38;
    line-height:1.35;
    font-size:11px;
    -webkit-print-color-adjust:exact;
    print-color-adjust:exact;
}
.report-container .cover {
    background:linear-gradient(135deg, #1E2A38 0%, #2D3F52 100%);
    color:white;
    padding:20px 22px;
    border-radius:10px;
    margin-bottom:14px;
    position:relative;
    overflow:hidden;
}
.report-container .cover::before {
    content:'';
    position:absolute;
    top:0;
    right:0;
    width:220px;
    height:100%;
    background:rgba(184,146,74,.12);
    transform:skewX(-15deg);
}
.report-container .cover-row {
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:16px;
    position:relative;
    z-index:1;
}
.report-container .cover-row-top {
    margin-bottom:11px;
    padding-bottom:10px;
    border-bottom:1px solid rgba(255,255,255,.1);
}
.report-container .cover-brand-text {
    font-size:13px;
    font-weight:700;
    letter-spacing:1px;
    text-transform:uppercase;
    color:#fff;
}
.report-container .cover-brand-text .wk { color:#D9BE8C; }
.report-container .cover-title {
    font-size:13px;
    font-weight:700;
    letter-spacing:1px;
    color:#fff;
    white-space:nowrap;
    flex-shrink:0;
}
.report-container .cover-meta {
    display:grid;
    grid-template-columns:repeat(4, minmax(0,1fr));
    gap:10px;
    position:relative;
    z-index:1;
}
.report-container .cover-meta-item { display:flex; flex-direction:column; min-width:0; }
.report-container .cover-meta-label {
    color:#64748B;
    font-size:7.5px;
    text-transform:uppercase;
    letter-spacing:.7px;
    margin-bottom:2px;
}
.report-container .cover-meta-value {
    color:white;
    font-weight:600;
    font-size:9px;
    white-space:nowrap;
}
.report-container .section-header {
    display:flex;
    align-items:center;
    justify-content:space-between;
    margin:16px 0 7px;
    padding-bottom:6px;
    border-bottom:none;
}
.report-container .section-header-left { display:flex; align-items:center; gap:12px; }
.report-container .section-header h2 {
    margin:0;
    font-size:10.5px;
    font-weight:700;
    color:#1E2A38;
    display:flex;
    align-items:center;
    gap:6px;
    line-height:1.2;
}
.report-container .section-meta-inline {
    color:inherit;
    font-weight:600;
}
.report-container .count-badge {
    display:inline-flex;
    align-items:center;
    justify-content:center;
    min-width:16px;
    height:16px;
    max-width:none;
    background:#1E2A38;
    color:#fff;
    font-size:8.5px;
    font-weight:700;
    padding:0 5px;
    border-radius:5px;
    line-height:1;
    white-space:nowrap;
    flex-shrink:0;
}
.report-container .kpi-grid {
    display:grid;
    grid-template-columns:repeat(4,1fr);
    gap:6px;
    margin-bottom:6px;
}
.report-container .kpi-card {
    background:white;
    border-radius:7px;
    padding:8px 9px;
    border:1px solid #E5E7EB;
    position:relative;
}
.report-container .kpi-label {
    font-size:8.5px;
    color:#374151;
    font-weight:500;
    margin-bottom:4px;
}
.report-container .kpi-value {
    font-size:13px;
    font-weight:700;
    margin-bottom:5px;
    font-variant-numeric:tabular-nums;
}
.report-container .kpi-value.neutral { color:#111827; }
.report-container .kpi-value.green { color:#10B981; }
.report-container .kpi-value.coral { color:#F0654B; }
.report-container .kpi-tags { display:flex; flex-wrap:wrap; align-items:center; gap:4px; }
.report-container .safety-derived-list { display:flex; flex-direction:column; gap:3px; margin-top:5px; }
.report-container .safety-derived-item { display:flex; justify-content:space-between; gap:6px; font-size:7px; line-height:1.25; }
.report-container .safety-derived-company { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#475569; }
.report-container .safety-derived-amount { flex-shrink:0; color:#10B981; font-weight:700; font-variant-numeric:tabular-nums; }
.report-container .kpi-tag {
    color:#64748B;
    font-size:6.8px;
    font-weight:500;
    padding:0;
    border:none;
    background:none;
}
.report-container .kpi-tag:not(:last-child)::after {
    content:'·';
    margin-left:4px;
    color:#94A3B8;
    font-weight:700;
}
.report-container .table-container {
    background:white;
    border-radius:6px;
    overflow:visible;
    border:1px solid #E5E7EB;
    margin-bottom:5px;
    box-shadow:0 1px 2px rgba(16,24,40,.04);
}
.report-container table { width:100%; border-collapse:collapse; table-layout:fixed; }
.report-container thead { background:#1E2A38; }
.report-container th {
    color:white;
    font-weight:600;
    font-size:5.8px;
    text-transform:uppercase;
    letter-spacing:.1px;
    padding:5px 3px;
    text-align:left;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:clip;
}
.report-container td {
    padding:4px 3px;
    border-bottom:1px solid #F1F5F9;
    font-family:'Inter', sans-serif;
    font-size:6.4px;
    font-weight:400;
    color:#334155;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
}
.report-container td.num { text-align:left; font-variant-numeric:tabular-nums; }
.report-container td .date-time { display:inline-block; white-space:pre-line; line-height:1.25; }
.report-container td .code-cell { display:inline-block; white-space:pre-line; line-height:1.25; }
.report-container tbody tr:nth-child(even) { background:#F8FAFC; }
.report-container tbody tr:last-child td { border-bottom:none; }
.report-container .status-pill {
    display:inline;
    color:inherit;
    padding:0;
    font-size:inherit;
    font-weight:inherit;
}
.report-container .total-row { background:#F8FAFC; font-weight:700; }
.report-container .total-row td {
    color:#1E2A38;
    border-top:1px solid #E2E8F0;
    border-bottom:none;
    font-weight:700;
}
.report-container .empty-state {
    border:1px dashed #E5E7EB;
    border-radius:8px;
    padding:18px;
    text-align:center;
    color:#64748B;
    font-size:8.5px;
    margin-top:14px;
    background:white;
}
.report-container .footer {
    margin-top:16px;
    padding-top:9px;
    border-top:1px solid #E2E8F0;
    display:flex;
    justify-content:space-between;
    font-size:7px;
    color:#94A3B8;
}
@page { size:A4 portrait; margin:7mm; }
.report-container .kpi-card, .report-container .cover { break-inside:avoid; page-break-inside:avoid; }
.report-container .section-header { break-after:avoid; page-break-after:avoid; }
.report-container table { break-inside:auto; page-break-inside:auto; }
.report-container tbody { break-inside:auto; page-break-inside:auto; }
.report-container tr { break-inside:avoid; page-break-inside:avoid; }
.report-container thead { display:table-header-group; }
.report-container tfoot { display:table-footer-group; }
`;

const numberValue = (value: unknown) => Number(value ?? 0);
const formatMoney = (value: unknown) => formatCurrency(numberValue(value));
const valueOrDash = (value?: unknown) => value === null || value === undefined || value === "" ? "-" : String(value);
const formatPercent = (value?: unknown) => `${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(numberValue(value))}%`;
const formatDate = (value?: unknown) => value ? new Date(String(value)).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";
const formatDateTime = (value?: unknown) => value ? new Date(String(value)).toLocaleString("es-PE") : "-";
const formatTime = (value: Date) => value.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }).replace(/\s*a\.\s*m\./i, " a.m.").replace(/\s*p\.\s*m\./i, " p.m.");
const formatGeneratedAt = () => {
    const now = new Date();
    return `${now.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })} · ${formatTime(now)}`;
};
const kpiValue = (value?: number) => formatMoney(value ?? 0);

const HeaderMeta = ({ label, value }: { label: string; value: string }) => (
    <div className="cover-meta-item">
        <span className="cover-meta-label">{label}</span>
        <span className="cover-meta-value">{value}</span>
    </div>
);

const ReportHeader = ({ data, totalRows }: { data: ReporteCierreData; totalRows: number }) => (
    <div className="cover">
        <div className="cover-row cover-row-top">
            <div className="cover-brand-text">Altoque Perú <span className="wk">WK</span></div>
            <div className="cover-title">Reporte de Cierre de Caja</div>
        </div>
        <div className="cover-meta">
            <HeaderMeta label="Fecha de Emisión" value={formatGeneratedAt()} />
            <HeaderMeta label="Operaciones Pagadas" value={formatInteger(totalRows)} />
            <HeaderMeta label="Operaciones Pendientes" value={formatInteger(data.kpi?.operaciones_pendientes ?? 0)} />
            <HeaderMeta label="Pendiente Transferir" value={formatMoney(data.kpi?.pendiente_depositar ?? 0)} />
        </div>
    </div>
);

const KpiTags = ({ values }: { values: string[] }) => (
    <div className="kpi-tags">
        {values.map((value) => <span key={value} className="kpi-tag">{value}</span>)}
    </div>
);

const KpiCard = ({ label, value, tags, tone = "neutral" }: { label: string; value?: number; tags: string[]; tone?: "neutral" | "green" | "coral" }) => (
    <div className="kpi-card">
        <div className="kpi-label">{label}</div>
        <div className={`kpi-value ${tone}`}>{kpiValue(value)}</div>
        <KpiTags values={tags} />
    </div>
);

const KpiCountCard = ({ label, value }: { label: string; value: number }) => (
    <div className="kpi-card">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value neutral">{formatInteger(value)}</div>
    </div>
);

const SafetyPayDerivedKpiCard = ({ kpi }: { kpi: SafetyPayKpi }) => (
    <div className="kpi-card" style={{ gridColumn: "span 2" }}>
        <div className="kpi-label">Empresas Derivadas</div>
        {kpi.empresas_derivadas.length ? (
            <div className="safety-derived-list">
                {kpi.empresas_derivadas.map((item) => (
                    <div className="safety-derived-item" key={`${item.empresa}-${item.cuenta}`}>
                        <span className="safety-derived-company">{item.empresa} · {item.cuenta}</span>
                        <span className="safety-derived-amount">{formatMoney(item.monto)}</span>
                    </div>
                ))}
            </div>
        ) : <div className="kpi-value neutral">-</div>}
    </div>
);

const SectionHeader = ({ title, count, badge }: { title: string; count?: number; badge?: string }) => (
    <div className="section-header">
        <div className="section-header-left">
            <h2>
                {title}
                {badge && <span className="section-meta-inline">· {badge}</span>}
                {count !== undefined && <span className="section-meta-inline">· Total: {count}</span>}
            </h2>
        </div>
    </div>
);

const Table = ({ headers, children, footer }: { headers: string[]; children: ReactNode; footer?: ReactNode }) => (
    <div className="table-container">
        <table>
            <thead>
                <tr>{headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr>
            </thead>
            <tbody>{children}</tbody>
            {footer && <tfoot>{footer}</tfoot>}
        </table>
    </div>
);

const Cell = ({ children, numeric = false }: { children: ReactNode; numeric?: boolean }) => (
    <td className={numeric ? "num" : undefined}>{children}</td>
);

const FooterCell = ({ children, colSpan = 1, numeric = false }: { children?: ReactNode; colSpan?: number; numeric?: boolean }) => (
    <td colSpan={colSpan} className={numeric ? "num" : undefined}>{children}</td>
);

const StatusPill = ({ value }: { value?: string | null }) => <span className="status-pill">{valueOrDash(value)}</span>;
const movementOrigin = (value?: string | null) => {
    const key = String(value ?? "").trim().toUpperCase().replaceAll("_", " ");
    return ({
        "PAGO DEUDA": "Pago Deuda",
        "PAGO DEUDA COMISION": "Pago Deuda Comision",
        "EFECTIVIZACION": "Efectivizacion",
        "DIRECTO CAJA": "Directo",
        "OTROS": "Otros",
        "TRANSFERENCIA INTERNA": "Movimiento Saldo",
    } as Record<string, string>)[key] ?? valueOrDash(value);
};
const movementType = (value?: string | string[] | null) => {
    const values = Array.isArray(value) ? value : [value];
    return values
        .map((item) => String(item ?? "").trim().toLowerCase())
        .filter(Boolean)
        .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
        .join(" / ") || "-";
};
const movementRelatedCompany = (row: MovimientoRow) => {
    const origin = String(row.tipo_origen ?? "").trim().toUpperCase().replaceAll("_", " ");
    return origin === "TRANSFERENCIA INTERNA"
        ? valueOrDash(row.nombre_empresa_relacionada)
        : valueOrDash(row.nombre_empresa_contraparte ?? row.nombre_empresa);
};
const movementRelatedBank = (row: MovimientoRow) => {
    const origin = String(row.tipo_origen ?? "").trim().toUpperCase().replaceAll("_", " ");
    return origin === "TRANSFERENCIA INTERNA"
        ? valueOrDash(row.nombre_banco_relacionada)
        : valueOrDash(row.nombre_banco_contraparte ?? row.nombre_banco);
};
const movementDateTime = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    return `${date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}\n${date.toLocaleDateString("es-PE")}`;
};

export const BancariaReporteCierrePdfOficial = ({ data }: BancariaReporteCierrePdfOficialProps) => {
    if (!data) return null;

    const { efectivizacion, derivadosAtendidos, derivadosEnviados } = getReporteEfectivizacionUnificada(data);
    const { ingresos, salidas } = getReporteCierreEmpresaSummary(data);
    const pagoDeuda = [...(data.pago_deuda ?? []), ...(data.pago_deuda_pendientes ?? [])];
    const pos = [...(data.pos ?? []), ...(data.pos_pendientes ?? [])];
    const movimientos = data.movimientos ?? [];
    const kpi = data.kpi ?? {};
    const isSafetyPay = String(data.ruta ?? "").trim().toLowerCase() === "safetypay";
    const safetyPayKpi: SafetyPayKpi = data.safetypay_kpi ?? {
        caja_recaudacion: 0,
        ganancias: 0,
        salidas: 0,
        gastos_operacionales: 0,
        pendiente_transferencia: 0,
        empresas_derivadas: [],
        total_transferencia: 0,
    };
    const saldoBanco = calcularSaldoBanco(
        kpi,
        data.id_empresa,
        data.id_banco,
        data.id_empresa_cuenta_bancaria,
    );
    const totalOperations = efectivizacion.length + derivadosAtendidos.length + derivadosEnviados.length + pagoDeuda.length + pos.length;
    const totalRows = totalOperations + movimientos.length;
    const hasRows = totalRows > 0;
    const sum = <T,>(rows: T[], selector: (row: T) => number | null | undefined) => rows.reduce((acc, row) => acc + numberValue(selector(row)), 0);
    const renderEfectivizacionSection = (title: string, rows: ReturnType<typeof getReporteEfectivizacionUnificada>["efectivizacion"]) => rows.length > 0 && (
        <section>
            <SectionHeader title={title} count={rows.length} />
            <Table headers={["Facturacion", "Empresa", "Cuenta", "Cod. Op.", "DNI", "Comunidad", "Deposito", "% Comision", "S/ Comision", "Gastos", "Ganancia", "Transferencia", "Estado", "Fecha"]} footer={<tr className="total-row"><FooterCell colSpan={6}>Totales</FooterCell><FooterCell numeric>{formatMoney(sum(rows, (row) => row.deposito))}</FooterCell><FooterCell /><FooterCell numeric>{formatMoney(sum(rows, (row) => row.soles_comision))}</FooterCell><FooterCell numeric>{formatMoney(sum(rows, (row) => row.gastos))}</FooterCell><FooterCell numeric>{formatMoney(sum(rows, (row) => row.ganancia))}</FooterCell><FooterCell numeric>{formatMoney(sum(rows, (row) => row.transferencia))}</FooterCell><FooterCell colSpan={2} /></tr>}>
                {rows.map((row, index) => <tr key={index}><Cell>{valueOrDash(row.facturacion)}</Cell><Cell>{valueOrDash(row.empresa)}</Cell><Cell>{valueOrDash(row.cuenta)}</Cell><Cell><span className="code-cell">{valueOrDash(row.operacion)}</span></Cell><Cell>{valueOrDash(row.dni)}</Cell><Cell>{valueOrDash(row.comunidad)}</Cell><Cell numeric>{formatMoney(row.deposito)}</Cell><Cell numeric>{formatPercent(row.porcentaje_comision)}</Cell><Cell numeric>{formatMoney(row.soles_comision)}</Cell><Cell numeric>{formatMoney(row.gastos)}</Cell><Cell numeric>{formatMoney(row.ganancia)}</Cell><Cell numeric>{formatMoney(row.transferencia)}</Cell><Cell><StatusPill value={row.estado} /></Cell><Cell>{formatDate(row.fecha)}</Cell></tr>)}
            </Table>
        </section>
    );
    const renderCompanySummarySection = (title: string, rows: typeof ingresos) => rows.length > 0 && (
        <section>
            <SectionHeader title={title} />
            <Table headers={["Empresa", "Cuenta", "Monto"]}>
                {rows.map((row, index) => <tr key={`${title}-${index}`}><Cell>{row.empresa}</Cell><Cell>{row.cuenta}</Cell><Cell numeric>{formatMoney(row.monto)}</Cell></tr>)}
            </Table>
        </section>
    );
    const renderSafetyPayDerivedSection = isSafetyPay && safetyPayKpi.empresas_derivadas.length > 0 && (
        <section>
            <SectionHeader title="Empresas Derivadas" count={safetyPayKpi.empresas_derivadas.length} />
            <Table headers={["Empresa", "Cuenta", "Transferencia"]}>
                {safetyPayKpi.empresas_derivadas.map((row, index) => (
                    <tr key={`safetypay-derived-${index}`}>
                        <Cell>{row.empresa}</Cell>
                        <Cell>{row.cuenta}</Cell>
                        <Cell numeric>{formatMoney(row.monto)}</Cell>
                    </tr>
                ))}
            </Table>
        </section>
    );

    return (
        <>
            <style>{reportStyles}</style>
            <div className="report-container">
                <ReportHeader data={data} totalRows={totalOperations} />
                <SectionHeader title={data.empresa ?? "Empresa"} badge={data.banco ?? "Banco"} />
                {isSafetyPay && <div className="kpi-grid">
                    <KpiCard label="Caja Recaudación" tags={[]} value={safetyPayKpi.caja_recaudacion} tone="green" />
                    <KpiCard label="Ganancias" tags={[]} value={safetyPayKpi.ganancias} tone="green" />
                    <KpiCard label="Salidas" tags={[]} value={safetyPayKpi.salidas} tone="coral" />
                    <KpiCard label="Gastos Operacionales" tags={[]} value={safetyPayKpi.gastos_operacionales} tone="coral" />
                    <KpiCard label="Pendiente Transferencia" tags={[]} value={safetyPayKpi.pendiente_transferencia} />
                    <KpiCountCard label="Total Transferencia" value={safetyPayKpi.total_transferencia} />
                    <SafetyPayDerivedKpiCard kpi={safetyPayKpi} />
                </div>}
                <div className={isSafetyPay ? "hidden" : "kpi-grid"}>
                    <KpiCard label="Caja Inicial" tags={["Efectivización", "Pago Deuda", "Movimientos"]} value={kpi.caja_inicial} />
                    <KpiCard label="Saldo Banco" tags={["Saldo conciliado"]} value={saldoBanco} />
                    <KpiCard label="Caja Recaudación" tags={["Efectivización", "Pago Deuda"]} value={kpi.caja_recaudacion ?? kpi.total_recaudado} tone="green" />
                    <KpiCard label="Ingresos" tags={["Movimientos"]} value={kpi.ingresos} tone="green" />
                    <KpiCard label="Salidas" tags={["Efectivización", "Pago Deuda", "Movimientos"]} value={kpi.salidas} tone="coral" />
                    <KpiCard label="Gastos Operacionales" tags={["Efectivización", "Pago Deuda"]} value={kpi.gastos_operacionales} tone="coral" />
                    <KpiCard label="Ganancias" tags={["Efectivización", "Pago Deuda"]} value={kpi.ganancias} tone="green" />
                    <KpiCard label="Pendiente Transferencia" tags={["Efectivización", "Pago Deuda"]} value={kpi.pendiente_transferencia ?? kpi.pendiente_depositar} />
                </div>

                {renderCompanySummarySection("Ingresos por Empresas", ingresos)}
                {renderCompanySummarySection("Salidas por Empresas", salidas)}
                {renderSafetyPayDerivedSection}

                {renderEfectivizacionSection("Efectivizacion", efectivizacion)}
                {renderEfectivizacionSection("Derivados atendidos", derivadosAtendidos)}
                {renderEfectivizacionSection("Derivados enviados", derivadosEnviados)}

                {pagoDeuda.length > 0 && (
                    <section>
                        <SectionHeader title="Pago Deuda" count={pagoDeuda.length} />
                        <Table headers={["DNI", "Empresa Salida", "Cuenta Salida", "Transferencia", "Empresa Ingreso", "Cuenta Ingreso", "Deposito", "% Comision", "S/ Comision", "Fecha"]} footer={<tr className="total-row"><FooterCell colSpan={3}>Totales</FooterCell><FooterCell numeric>{formatMoney(sum(pagoDeuda, (row) => row.transferencia ?? row.monto_transferencia))}</FooterCell><FooterCell colSpan={2} /><FooterCell numeric>{formatMoney(sum(pagoDeuda, (row) => row.deposito ?? row.monto_devolucion))}</FooterCell><FooterCell colSpan={3} /> </tr>}>
                            {pagoDeuda.map((row, index) => <tr key={index}><Cell>{valueOrDash(row.dni ?? row.dni_cliente)}</Cell><Cell>{valueOrDash(row.empresa_salida ?? row.nombre_empresa_salida)}</Cell><Cell>{valueOrDash(row.cuenta_salida ?? row.cuenta)}</Cell><Cell numeric>{formatMoney(row.transferencia ?? row.monto_transferencia)}</Cell><Cell>{valueOrDash(row.empresa_ingreso ?? row.nombre_empresa_ingreso)}</Cell><Cell>{valueOrDash(row.cuenta_ingreso)}</Cell><Cell numeric>{formatMoney(row.deposito ?? row.monto_devolucion)}</Cell><Cell numeric>{formatPercent(row.porcentaje_comision ?? row.comision_servicio)}</Cell><Cell numeric>{formatMoney(row.soles_comision)}</Cell><Cell>{formatDate(row.fecha ?? row.fecha_registro)}</Cell></tr>)}
                        </Table>
                    </section>
                )}

                {pos.length > 0 && (
                    <section>
                        <SectionHeader title="POS" count={pos.length} />
                        <Table headers={["Cod. Op.", "DNI", "Deposito", "% Comision", "S/ Comision", "Empresa", "Cuenta", "Transferencia", "Estado", "Fecha"]} footer={<tr className="total-row"><FooterCell colSpan={7}>Totales</FooterCell><FooterCell numeric>{formatMoney(sum(pos, (row) => row.transferencia))}</FooterCell><FooterCell colSpan={2} /></tr>}>
                            {pos.map((row, index) => <tr key={index}><Cell>{valueOrDash(row.operacion ?? row.codigo_operacion_deposito_cliente)}</Cell><Cell>{valueOrDash(row.dni ?? row.dni_cliente)}</Cell><Cell numeric>{formatMoney(row.deposito)}</Cell><Cell numeric>{formatPercent(row.porcentaje_comision)}</Cell><Cell numeric>{formatMoney(row.soles_comision)}</Cell><Cell>{valueOrDash(row.empresa)}</Cell><Cell>{valueOrDash(row.cuenta)}</Cell><Cell numeric>{formatMoney(row.transferencia)}</Cell><Cell><StatusPill value={row.estado ?? row.nombre_estado} /></Cell><Cell>{formatDate(row.fecha ?? row.fecha_registro)}</Cell></tr>)}
                        </Table>
                    </section>
                )}

                {movimientos.length > 0 && (
                    <section>
                        <SectionHeader title="Movimientos" count={movimientos.length} />
                        <Table headers={["Origen", "Movimiento", "DNI", "Empresa", "Cuenta", "Ingreso", "Salida", "Facturacion", "Fecha"]} footer={<tr className="total-row"><FooterCell colSpan={5}>Totales</FooterCell><FooterCell numeric>{formatMoney(sum(movimientos, (row) => row.monto_ingreso))}</FooterCell><FooterCell numeric>{formatMoney(sum(movimientos, (row) => row.monto_salida))}</FooterCell><FooterCell colSpan={2} /></tr>}>
                            {movimientos.map((row, index) => <tr key={index}><Cell>{movementOrigin(row.tipo_origen)}</Cell><Cell>{movementType(row.movimientos ?? row.tipo_movimiento)}</Cell><Cell>{valueOrDash(row.dni_cliente)}</Cell><Cell>{movementRelatedCompany(row)}</Cell><Cell>{movementRelatedBank(row)}</Cell><Cell numeric>{formatMoney(row.monto_ingreso)}</Cell><Cell numeric>{formatMoney(row.monto_salida)}</Cell><Cell>{valueOrDash(row.tipo_facturacion)}</Cell><Cell>{formatDate(row.fecha_registro)}</Cell></tr>)}
                        </Table>
                    </section>
                )}

                {!hasRows && <div className="empty-state">Sin operaciones para este periodo.</div>}
                <footer className="footer"><span>{data.empresa ?? "Empresa"} - Altoque Peru WK</span><span>Reporte de cierre - Confidencial</span></footer>
            </div>
        </>
    );
};
