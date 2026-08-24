import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";

// Legacy: el flujo actual de descarga usa `bancaria-reporte-cierre-pdf.tsx`.
interface ReporteRow {
    id: number;
    tipo_origen?: string | null;
    tipo_movimiento?: string | null;
    monto_ingreso?: number | null;
    monto_salida?: number | null;
    monto_gasto?: number | null;
    monto_ganancia?: number | null;
    codigo_operacion?: string | null;
    dni_cliente?: string | null;
    detalle?: string | null;
    fecha_registro?: string | null;
}

interface SeccionData {
    ingresos?: ReporteRow[];
    salidas?: ReporteRow[];
    retenidos?: ReporteRow[];
}

interface ReporteData {
    empresa?: string;
    banco?: string;
    fecha_cierre?: string;
    kpi?: Record<string, number>;
    efectivizacion?: SeccionData;
    pago_deuda?: SeccionData;
    otros?: SeccionData;
}

interface BancariaReporteCierreProps {
    data: ReporteData | null;
}

const sumMonto = (rows?: ReporteRow[], field: "monto_ingreso" | "monto_salida" | "monto_gasto" = "monto_ingreso") =>
    (rows ?? []).reduce((s, r) => s + Number(r[field] ?? 0), 0);

const formatDate = (v?: string | null) => v ? new Date(v).toLocaleDateString("es-PE") : "-";

const SectionHeader = ({ title }: { title: string }) => (
    <h3 style={{ fontSize: 14, fontWeight: 700, margin: "16px 0 8px", color: "#111827", borderBottom: "2px solid #111827", paddingBottom: 4 }}>{title}</h3>
);

const SubHeader = ({ title, count, total }: { title: string; count: number; total: string }) => (
    <p style={{ fontSize: 12, fontWeight: 600, margin: "8px 0 4px" }}>{title} ({count}) — {total}</p>
);

const Table = ({ headers, rows, footer }: { headers: string[]; rows: React.ReactNode; footer?: React.ReactNode }) => (
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8, fontSize: 11 }}>
        <thead>
            <tr style={{ background: "#f3f4f6" }}>
                {headers.map((h, i) => (
                    <th key={i} style={{ padding: "4px 6px", textAlign: "left", borderBottom: "1px solid #d1d5db", fontWeight: 600 }}>{h}</th>
                ))}
            </tr>
        </thead>
        <tbody>{rows}</tbody>
        {footer && <tfoot>{footer}</tfoot>}
    </table>
);

const Cell = ({ children }: { children: React.ReactNode }) => (
    <td style={{ padding: "2px 6px", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{children}</td>
);

const FooterRow = ({ label, value, cols }: { label: string; value: string; cols: number }) => (
    <tr style={{ background: "#f9fafb", fontWeight: 600 }}>
        <td colSpan={cols - 1} style={{ padding: "4px 6px", textAlign: "right", borderTop: "2px solid #111827" }}>{label}</td>
        <td style={{ padding: "4px 6px", textAlign: "right", borderTop: "2px solid #111827" }}>{value}</td>
    </tr>
);

const renderIngresoRows = (rows?: ReporteRow[]) =>
    (rows ?? []).map((r) => (
        <tr key={r.id}>
            <Cell>{r.codigo_operacion ?? "-"}</Cell>
            <Cell>{r.dni_cliente ?? "-"}</Cell>
            <Cell>{r.detalle ?? "-"}</Cell>
            <Cell>{formatDate(r.fecha_registro)}</Cell>
            <Cell>{formatMoney(r.monto_ingreso)}</Cell>
            <Cell>{formatMoney(r.monto_gasto)}</Cell>
            {r.monto_ganancia != null && <Cell>{formatMoney(r.monto_ganancia)}</Cell>}
        </tr>
    ));

const renderSalidaRows = (rows?: ReporteRow[]) =>
    (rows ?? []).map((r) => (
        <tr key={r.id}>
            <Cell>{r.codigo_operacion ?? "-"}</Cell>
            <Cell>{r.dni_cliente ?? "-"}</Cell>
            <Cell>{r.detalle ?? "-"}</Cell>
            <Cell>{formatDate(r.fecha_registro)}</Cell>
            <Cell>{formatMoney(r.monto_salida)}</Cell>
            <Cell>{formatMoney(r.monto_gasto)}</Cell>
        </tr>
    ));

const renderRetenidoRows = (rows?: ReporteRow[]) =>
    (rows ?? []).map((r) => (
        <tr key={r.id}>
            <Cell>{r.codigo_operacion ?? "-"}</Cell>
            <Cell>{r.dni_cliente ?? "-"}</Cell>
            <Cell>{formatDate(r.fecha_registro)}</Cell>
            <Cell>{formatMoney(r.monto_ingreso)}</Cell>
            <Cell>{formatMoney(r.monto_gasto)}</Cell>
        </tr>
    ));

const renderSection = (title: string, section?: SeccionData, showGanancia?: boolean) => {
    const ingresos = section?.ingresos;
    const salidas = section?.salidas;
    const retenidos = section?.retenidos;
    if (!ingresos?.length && !salidas?.length && !retenidos?.length) return null;

    const ingresoCols = showGanancia ? 7 : 6;
    const salidaCols = 6;
    const retenidoCols = 5;

    return (
        <div>
            <SectionHeader title={title} />
            {Boolean(ingresos?.length) && (
                <>
                    <SubHeader title="Ingresos Confirmados" count={ingresos!.length} total={formatMoney(sumMonto(ingresos, "monto_ingreso"))} />
                    <Table
                        headers={["Código", "DNI", "Detalle", "Fecha", "Monto", "Gasto", ...(showGanancia ? ["Ganancia"] : [])]}
                        rows={renderIngresoRows(ingresos)}
                        footer={<FooterRow label="Total" value={formatMoney(sumMonto(ingresos, "monto_ingreso"))} cols={ingresoCols} />}
                    />
                </>
            )}
            {Boolean(salidas?.length) && (
                <>
                    <SubHeader title="Salidas" count={salidas!.length} total={formatMoney(sumMonto(salidas, "monto_salida"))} />
                    <Table
                        headers={["Código", "DNI", "Detalle", "Fecha", "Monto", "Gasto"]}
                        rows={renderSalidaRows(salidas)}
                        footer={<FooterRow label="Total" value={formatMoney(sumMonto(salidas, "monto_salida"))} cols={salidaCols} />}
                    />
                </>
            )}
            {Boolean(retenidos?.length) && (
                <>
                    <SubHeader title="Retenidos del cierre" count={retenidos!.length} total={formatMoney(sumMonto(retenidos, "monto_ingreso"))} />
                    <Table
                        headers={["Código", "DNI", "Fecha", "Monto Retenido", "Gasto"]}
                        rows={renderRetenidoRows(retenidos)}
                        footer={<FooterRow label="Total" value={formatMoney(sumMonto(retenidos, "monto_ingreso"))} cols={retenidoCols} />}
                    />
                </>
            )}
        </div>
    );
};

export const BancariaReporteCierre = ({ data }: BancariaReporteCierreProps) => {
    if (!data) return null;

    return (
        <div style={{ fontFamily: "sans-serif", color: "#111827", padding: 24, maxWidth: 800, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Reporte de Cierre</h2>
                <p style={{ margin: "4px 0", fontSize: 14 }}>{data.empresa} — {data.banco}</p>
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Cierre: {formatDate(data.fecha_cierre)}</p>
            </div>

            {data.kpi && (
                <div>
                    <SectionHeader title="KPI" />
                    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <tbody>
                            <tr>
                                {["Caja Inicial", "Caja Actual", "Caja Recaudación", "Ingresos", "Salidas", "Gastos Op.", "Ganancias", "Pendiente Transferencia"].map((label, i) => {
                                    const keys = ["caja_inicial", "caja_actual", "caja_recaudacion", "ingresos", "salidas", "gastos_operacionales", "ganancias", "pendiente_transferencia"];
                                    return (
                                        <td key={i} style={{ padding: "4px 8px", textAlign: "center", border: "1px solid #d1d5db", background: "#f9fafb" }}>
                                            <div style={{ fontSize: 10, color: "#6b7280" }}>{label}</div>
                                            <div style={{ fontWeight: 700, marginTop: 2 }}>{formatMoney(data.kpi?.[keys[i]] ?? 0)}</div>
                                        </td>
                                    );
                                })}
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            {renderSection("Efectivización", data.efectivizacion, true)}
            {renderSection("Pago Deuda", data.pago_deuda)}
            {renderSection("Otros", data.otros)}
        </div>
    );
};
