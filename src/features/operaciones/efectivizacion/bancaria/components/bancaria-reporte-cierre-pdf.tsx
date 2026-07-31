import type { ReactNode } from "react";
import { formatInteger, formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";

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

interface ReporteCierreData {
    empresa?: string;
    banco?: string;
    fecha_cierre?: string;
    kpi?: Record<string, number>;
    efectivizacion?: EfectivizacionRow[];
    pago_deuda?: PagoDeudaRow[];
    pos?: PosRow[];
}

interface BancariaReporteCierrePdfProps {
    data: ReporteCierreData | null;
}

const colors = {
    navy: "#1E2A38",
    navySoft: "#2D3F52",
    gold: "#D9BE8C",
    paper: "#F4F6F9",
    line: "#E5E7EB",
    ink: "#1E2A38",
    muted: "#64748B",
    green: "#047857",
    greenBg: "#ECFDF3",
    white: "#FFFFFF",
    row: "#F8FAFC",
};

const typography = {
    family: "'Inter', sans-serif",
    tiny: 6.8,
    meta: 7.5,
    micro: 7,
    xs: 8.5,
    metaValue: 9,
    sm: 10.5,
    md: 13,
};

const numberValue = (value: number | null | undefined) => Number(value ?? 0);
const valueOrDash = (value?: string | number | null) => value === null || value === undefined || value === "" ? "-" : String(value);
const formatPercent = (value?: number | null) => `${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(numberValue(value))}%`;
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";
const formatGeneratedAt = () => new Date().toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const formatReportDate = (value?: string | null) => value ? formatDate(value) : formatDate(new Date().toISOString());

const kpiValue = (value?: number, isCount = false) => isCount ? formatInteger(value ?? 0) : formatMoney(value ?? 0);

const HeaderMeta = ({ label, value }: { label: string; value: string }) => (
    <div style={{ minWidth: 0, paddingBottom: 6 }}>
        <div style={{ color: colors.muted, display: "block", fontSize: typography.meta, textTransform: "uppercase", letterSpacing: .7, lineHeight: "14px", marginBottom: 5 }}>{label}</div>
        <div style={{ color: colors.white, display: "block", fontSize: typography.metaValue, fontWeight: 600, lineHeight: "18px", minHeight: 20, paddingBottom: 2, whiteSpace: "nowrap" }}>{value}</div>
    </div>
);

const ReportHeader = ({ data, totalRows }: { data: ReporteCierreData; totalRows: number }) => (
    <div className="cover" style={{ background: `linear-gradient(135deg, ${colors.navy} 0%, ${colors.navySoft} 100%)`, color: colors.white, borderRadius: 10, padding: "20px 22px 28px", marginBottom: 14, minHeight: 150, position: "relative", overflow: "visible", breakInside: "avoid", pageBreakInside: "avoid" }}>
        <div style={{ position: "absolute", top: 0, right: 0, width: 220, height: "100%", background: "rgba(184,146,74,.12)", borderRadius: "0 10px 10px 0", transform: "skewX(-15deg)", transformOrigin: "top right" }} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,.1)", paddingBottom: 10, marginBottom: 11 }}>
            <div style={{ fontSize: typography.md, fontWeight: 700, letterSpacing: 1, lineHeight: "18px", textTransform: "uppercase", color: colors.white }}>Altoque Perú <span style={{ color: colors.gold }}>WK</span></div>
            <div style={{ fontSize: typography.md, fontWeight: 700, letterSpacing: 1, lineHeight: "18px", color: colors.white }}>Reporte de Cierre de Caja</div>
        </div>
        <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, paddingBottom: 4 }}>
            <HeaderMeta label="Fecha de Emisión" value={formatGeneratedAt()} />
            <HeaderMeta label="Operaciones Pagadas" value={formatInteger(totalRows)} />
            <HeaderMeta label="Operaciones Pendientes" value="0" />
            <HeaderMeta label="Pendiente Transferir" value={formatMoney(data.kpi?.pendiente_depositar ?? 0)} />
        </div>
    </div>
);

const KpiTags = ({ values }: { values: string[] }) => (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
        {values.map((value, index) => (
            <span key={value} style={{ color: colors.muted, fontSize: typography.tiny, fontWeight: 500, padding: 0, border: "none", background: "none" }}>
                {value}
                {index < values.length - 1 && <span style={{ color: "#94A3B8", fontWeight: 800, marginLeft: 4 }}>·</span>}
            </span>
        ))}
    </div>
);

const KpiCard = ({ label, value, tags, tone = "neutral" }: { label: string; value?: number; tags: string[]; tone?: "neutral" | "green" | "coral" }) => {
    const valueColor = tone === "green" ? "#10B981" : tone === "coral" ? "#F0654B" : "#111827";
    return (
        <div className="kpi-card" style={{ background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 7, padding: "8px 9px", position: "relative", breakInside: "avoid", pageBreakInside: "avoid" }}>
            <div style={{ fontSize: typography.xs, color: "#374151", fontWeight: 500, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: typography.md, color: valueColor, fontWeight: 700, marginBottom: 5, fontVariantNumeric: "tabular-nums" }}>{kpiValue(value)}</div>
            <KpiTags values={tags} />
        </div>
    );
};

const CompanyHeader = ({ empresa, banco }: { empresa?: string; banco?: string }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 7px", paddingBottom: 6, borderBottom: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: typography.sm, fontWeight: 700, color: colors.ink, display: "flex", alignItems: "center", gap: 6, lineHeight: 1.2 }}>
                {empresa ?? "Empresa"}
                <span style={{ display: "inline-block", minWidth: 22, borderRadius: 6, background: colors.navy, color: colors.white, padding: "4px 7px 5px", fontSize: typography.xs, fontWeight: 700, lineHeight: "12px" }}>{banco ?? "Banco"}</span>
            </h2>
        </div>
    </div>
);

const SectionHeader = ({ title, count }: { title: string; count: number }) => (
    <div className="section-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 7px", paddingBottom: 6, borderBottom: "none", breakAfter: "avoid", pageBreakAfter: "avoid" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: typography.sm, fontWeight: 700, color: colors.ink, display: "flex", alignItems: "center", gap: 6, lineHeight: 1.2 }}>
                {title}
                <span style={{ display: "inline-block", minWidth: 20, borderRadius: 6, background: colors.navy, color: colors.white, padding: "4px 6px 5px", fontSize: typography.xs, fontWeight: 700, lineHeight: "12px", textAlign: "center" }}>{count}</span>
            </h2>
        </div>
    </div>
);

const Table = ({ headers, children, footer }: { headers: string[]; children: ReactNode; footer?: ReactNode }) => (
    <div style={{ background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 6, overflow: "visible", marginBottom: 6, boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead style={{ display: "table-header-group", background: colors.navy }}>
                <tr>{headers.map((header, index) => <th key={`${header}-${index}`} style={{ color: colors.white, fontWeight: 600, fontSize: 6.6, textTransform: "uppercase", letterSpacing: .1, padding: "5px 4px", textAlign: "left", whiteSpace: "nowrap", lineHeight: 1.15 }}>{header}</th>)}</tr>
            </thead>
            <tbody>{children}</tbody>
            {footer && <tfoot>{footer}</tfoot>}
        </table>
    </div>
);

const Cell = ({ children, numeric = false, muted = false }: { children: ReactNode; numeric?: boolean; muted?: boolean }) => (
    <td style={{ padding: "4px", borderBottom: "1px solid #F1F5F9", fontSize: typography.micro, color: muted ? "inherit" : "#334155", textAlign: "left", fontWeight: 400, fontFamily: typography.family, fontVariantNumeric: numeric ? "tabular-nums" : undefined, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{children}</td>
);

const FooterCell = ({ children, colSpan = 1 }: { children?: ReactNode; colSpan?: number }) => (
    <td colSpan={colSpan} style={{ padding: "4px", fontSize: typography.micro, fontWeight: 700, color: colors.ink, background: colors.row, borderTop: "1px solid #E2E8F0", borderBottom: "none", textAlign: "left", fontVariantNumeric: "tabular-nums" }}>{children}</td>
);

const StatusPill = ({ value }: { value?: string | null }) => (
    <span style={{ display: "inline-flex", alignItems: "center", width: "fit-content", borderRadius: 6, background: colors.greenBg, color: colors.green, padding: "1px 6px", fontSize: typography.tiny, fontWeight: 800 }}>{valueOrDash(value)}</span>
);

const DataRow = ({ children, index }: { children: ReactNode; index: number }) => (
    <tr style={{ background: index % 2 === 1 ? colors.row : colors.white, breakInside: "avoid" }}>{children}</tr>
);

export const BancariaReporteCierrePdf = ({ data }: BancariaReporteCierrePdfProps) => {
    if (!data) return null;

    const efectivizacion = data.efectivizacion ?? [];
    const pagoDeuda = data.pago_deuda ?? [];
    const pos = data.pos ?? [];
    const kpi = data.kpi ?? {};
    const hasRows = efectivizacion.length > 0 || pagoDeuda.length > 0 || pos.length > 0;
    const sum = <T,>(rows: T[], selector: (row: T) => number | null | undefined) => rows.reduce((acc, row) => acc + numberValue(selector(row)), 0);

    return (
        <div style={{ fontFamily: typography.family, background: colors.paper, color: colors.ink, fontSize: 11, lineHeight: 1.35, width: "100%", padding: 0 }}>
            <div className="report-container" style={{ maxWidth: 794, margin: "0 auto", padding: 20, background: colors.paper }}>
                <ReportHeader data={data} totalRows={efectivizacion.length + pagoDeuda.length + pos.length} />
                <CompanyHeader banco={data.banco} empresa={data.empresa} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 6 }}>
                    <KpiCard label="Caja Inicial" tags={["Efectivización", "Pago Deuda", "Movimientos"]} value={kpi.caja_inicial} />
                    <KpiCard label="Caja Actual" tags={["Efectivización", "Pago Deuda", "Movimientos"]} value={kpi.caja_actual} />
                    <KpiCard label="Caja Recaudación" tags={["Efectivización", "Pago Deuda"]} value={kpi.total_recaudado} tone="green" />
                    <KpiCard label="Ingresos" tags={["Movimientos"]} value={kpi.ingresos} tone="green" />
                    <KpiCard label="Salidas" tags={["Efectivización", "Pago Deuda", "Movimientos"]} value={kpi.salidas} tone="coral" />
                    <KpiCard label="Gastos Operacionales" tags={["Efectivización", "Pago Deuda"]} value={kpi.gastos_operacionales} tone="coral" />
                    <KpiCard label="Ganancias" tags={["Efectivización", "Pago Deuda"]} value={kpi.ganancias} tone="green" />
                    <KpiCard label="Retención Recaudación" tags={["Efectivización", "Pago Deuda"]} value={kpi.ingresos_retenidos} tone="green" />
                </div>

                {efectivizacion.length > 0 && (
                    <section>
                        <SectionHeader title="Efectivizaciones" count={efectivizacion.length} />
                        <Table headers={["Facturacion", "Operacion", "DNI", "Comunidad", "Deposito", "% Comision", "S/ Comision", "Gastos", "Ganancia", "Transferencia", "Estado", "Fecha"]} footer={<tr><FooterCell colSpan={4}>Totales</FooterCell><FooterCell>{formatMoney(sum(efectivizacion, (row) => row.deposito ?? row.monto))}</FooterCell><FooterCell /><FooterCell>{formatMoney(sum(efectivizacion, (row) => row.soles_comision ?? row.comision))}</FooterCell><FooterCell>{formatMoney(sum(efectivizacion, (row) => row.gastos))}</FooterCell><FooterCell>{formatMoney(sum(efectivizacion, (row) => row.ganancia))}</FooterCell><FooterCell>{formatMoney(sum(efectivizacion, (row) => row.transferencia))}</FooterCell><FooterCell colSpan={2} /></tr>}>
                            {efectivizacion.map((row, index) => <DataRow key={index} index={index}><Cell>{valueOrDash(row.facturacion ?? row.tipo_facturacion)}</Cell><Cell>{valueOrDash(row.operacion ?? row.codigo_operacion_deposito_cliente)}</Cell><Cell>{valueOrDash(row.dni ?? row.dni_cliente)}</Cell><Cell>{valueOrDash(row.comunidad ?? row.nombre_comunidad)}</Cell><Cell numeric>{formatMoney(row.deposito ?? row.monto)}</Cell><Cell numeric>{formatPercent(row.porcentaje_comision ?? row.comision_servicio)}</Cell><Cell numeric>{formatMoney(row.soles_comision ?? row.comision)}</Cell><Cell numeric>{formatMoney(row.gastos)}</Cell><Cell numeric>{formatMoney(row.ganancia)}</Cell><Cell numeric>{formatMoney(row.transferencia)}</Cell><Cell><StatusPill value={row.estado ?? row.nombre_estado} /></Cell><Cell>{formatDate(row.fecha ?? row.fecha_deposito_cliente ?? row.fecha_registro)}</Cell></DataRow>)}
                        </Table>
                    </section>
                )}

                {pagoDeuda.length > 0 && (
                    <section>
                        <SectionHeader title="Pago Deuda" count={pagoDeuda.length} />
                        <Table headers={["Operacion", "DNI", "Empresa", "Cuenta", "Transferencia", "Empresa", "Cuenta", "Deposito", "% Comision", "S/ Comision", "Estado", "Fecha"]} footer={<tr><FooterCell colSpan={4}>Totales</FooterCell><FooterCell>{formatMoney(sum(pagoDeuda, (row) => row.transferencia ?? row.monto_transferencia))}</FooterCell><FooterCell colSpan={2} /><FooterCell>{formatMoney(sum(pagoDeuda, (row) => row.deposito ?? row.monto_devolucion))}</FooterCell><FooterCell /><FooterCell>{formatMoney(sum(pagoDeuda, (row) => row.soles_comision))}</FooterCell><FooterCell colSpan={2} /></tr>}>
                            {pagoDeuda.map((row, index) => <DataRow key={index} index={index}><Cell>{valueOrDash(row.operacion ?? row.codigo_operacion_deposito_cliente)}</Cell><Cell>{valueOrDash(row.dni ?? row.dni_cliente)}</Cell><Cell>{valueOrDash(row.empresa_salida ?? row.nombre_empresa_salida)}</Cell><Cell>{valueOrDash(row.cuenta_salida ?? row.cuenta)}</Cell><Cell numeric>{formatMoney(row.transferencia ?? row.monto_transferencia)}</Cell><Cell>{valueOrDash(row.empresa_ingreso ?? row.nombre_empresa_ingreso)}</Cell><Cell>{valueOrDash(row.cuenta_ingreso)}</Cell><Cell numeric>{formatMoney(row.deposito ?? row.monto_devolucion)}</Cell><Cell numeric>{formatPercent(row.porcentaje_comision ?? row.comision_servicio)}</Cell><Cell numeric>{formatMoney(row.soles_comision)}</Cell><Cell><StatusPill value={row.estado ?? row.nombre_estado} /></Cell><Cell>{formatDate(row.fecha ?? row.fecha_registro)}</Cell></DataRow>)}
                        </Table>
                    </section>
                )}

                {pos.length > 0 && (
                    <section>
                        <SectionHeader title="POS" count={pos.length} />
                        <Table headers={["Operacion", "DNI", "Empresa", "Cuenta", "Deposito", "% Comision", "S/ Comision", "Transferencia", "Estado", "Fecha"]} footer={<tr><FooterCell colSpan={4}>Totales</FooterCell><FooterCell>{formatMoney(sum(pos, (row) => row.deposito))}</FooterCell><FooterCell /><FooterCell>{formatMoney(sum(pos, (row) => row.soles_comision))}</FooterCell><FooterCell>{formatMoney(sum(pos, (row) => row.transferencia))}</FooterCell><FooterCell colSpan={2} /></tr>}>
                            {pos.map((row, index) => <DataRow key={index} index={index}><Cell>{valueOrDash(row.operacion ?? row.codigo_operacion_deposito_cliente)}</Cell><Cell>{valueOrDash(row.dni ?? row.dni_cliente)}</Cell><Cell>{valueOrDash(row.empresa)}</Cell><Cell>{valueOrDash(row.cuenta)}</Cell><Cell numeric>{formatMoney(row.deposito)}</Cell><Cell numeric>{formatPercent(row.porcentaje_comision)}</Cell><Cell numeric>{formatMoney(row.soles_comision)}</Cell><Cell numeric>{formatMoney(row.transferencia)}</Cell><Cell><StatusPill value={row.estado ?? row.nombre_estado} /></Cell><Cell>{formatDate(row.fecha ?? row.fecha_registro)}</Cell></DataRow>)}
                        </Table>
                    </section>
                )}

                {!hasRows && <div style={{ border: `1px dashed ${colors.line}`, borderRadius: 8, padding: 18, textAlign: "center", color: colors.muted, fontSize: typography.xs, marginTop: 14, background: colors.white }}>Sin operaciones para este periodo.</div>}
                <footer style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #E2E8F0", paddingTop: 9, marginTop: 16, fontSize: typography.micro, color: "#94A3B8" }}><span>{data.empresa ?? "Empresa"} - Altoque Peru WK</span><span>Reporte de cierre - Confidencial</span></footer>
            </div>
        </div>
    );
};
