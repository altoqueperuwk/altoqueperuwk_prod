import { formatInteger, formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";

interface EfectivizacionRow {
    tipo_facturacion?: string | null;
    codigo_operacion_deposito_cliente?: string | null;
    dni_cliente?: string | null;
    nombre_comunidad?: string | null;
    cuenta_cliente?: string | null;
    monto?: number | null;
    comision?: number | null;
    comision_servicio?: number | null;
    monto_minimo_deposito_servicio?: number | null;
    comision_minima_servicio?: number | null;
    comision_monto_extra_servicio?: number | null;
    ganancia?: number | null;
    transferencia?: number | null;
    nombre_estado?: string | null;
    fecha_deposito_cliente?: string | null;
    fecha_registro?: string | null;
}

interface PagoDeudaRow {
    codigo_operacion_deposito_cliente?: string | null;
    dni_cliente?: string | null;
    nombre_cliente?: string | null;
    nombre_empresa_salida?: string | null;
    cuenta?: string | null;
    monto_transferencia?: number | null;
    nombre_empresa_ingreso?: string | null;
    cuenta_ingreso?: string | null;
    monto_devolucion?: number | null;
    fecha_registro?: string | null;
}

interface MovimientoRow {
    tipo_origen?: string | null;
    tipo_movimiento?: string | null;
    dni_cliente?: string | null;
    codigo_operacion?: string | null;
    monto_ingreso?: number | null;
    monto_salida?: number | null;
    monto_gasto?: number | null;
    monto_ganancia?: number | null;
    detalle?: string | null;
    tipo_facturacion?: string | null;
    nombre_empresa?: string | null;
    fecha_registro?: string | null;
}

interface RetencionRow {
    codigo_operacion_deposito_cliente?: string | null;
    dni_cliente?: string | null;
    nombre_cliente?: string | null;
    monto?: number | null;
    motivo_retencion?: string | null;
    nombre_usuario_retiene?: string | null;
    fecha_retencion?: string | null;
    fecha_registro?: string | null;
}

interface ReporteCierreData {
    empresa?: string;
    banco?: string;
    fecha_cierre?: string;
    kpi?: Record<string, number>;
    efectivizacion?: EfectivizacionRow[];
    pago_deuda?: PagoDeudaRow[];
    movimientos?: MovimientoRow[];
    retenciones?: RetencionRow[];
}

interface BancariaReporteCierrePdfProps {
    data: ReporteCierreData | null;
}

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString("es-PE") : "-";
const formatGeneratedAt = () => new Date().toLocaleString("es-PE", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

const colors = {
    navy: "#0A2540",
    navySoft: "#12335A",
    gold: "#B8924A",
    goldSoft: "#F2E7CF",
    paper: "#F7F6F2",
    line: "#E7E3D9",
    ink: "#1C2530",
    muted: "#6B7684",
    green: "#1E7B4D",
    greenBg: "#E9F5EE",
    red: "#A63B2E",
    white: "#FFFFFF",
    row: "#FBFAF7",
};

const typography = {
    family: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    micro: 8,
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
};

const kpiValue = (value?: number, isCount = false) => isCount ? formatInteger(value ?? 0) : formatMoney(value ?? 0);

const BankIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 16, height: 16 }}>
        <path d="M3 8L12 3L21 8V19H3V8Z" stroke={colors.goldSoft} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 19V12H15V19" stroke={colors.goldSoft} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
);

const Header = ({ empresa, banco }: { empresa?: string; banco?: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${colors.line}`, paddingBottom: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: colors.navy, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <BankIcon />
            </div>
            <div>
                <div style={{ fontSize: typography.md, fontWeight: 800, color: colors.navy, letterSpacing: 0.2 }}>{(empresa ?? "Empresa").toUpperCase()}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: colors.gold }} />
                    <span style={{ fontSize: typography.micro, textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 600, color: colors.muted }}>Cuenta {banco ?? "Banco"}</span>
                </div>
            </div>
        </div>
        <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: typography.md, fontWeight: 800, color: colors.navy, letterSpacing: 0.2 }}>ALTOQUE PERU WK</div>
            <div style={{ fontSize: typography.micro, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 600, marginTop: 3 }}>
                Reporte generado <b style={{ color: colors.navy, fontWeight: 700 }}>{formatGeneratedAt()}</b>
            </div>
        </div>
    </div>
);

const KpiCard = ({ label, value, isCount = false }: { label: string; value?: number; isCount?: boolean }) => (
    <div style={{ border: `1px solid ${colors.line}`, borderRadius: 10, padding: "12px 13px", background: colors.white }}>
        <div style={{ fontSize: typography.micro, textTransform: "uppercase", letterSpacing: 0.7, color: colors.muted, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: typography.lg, fontWeight: 500, color: colors.navy, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{kpiValue(value, isCount)}</div>
    </div>
);

const Badge = ({ children }: { children: React.ReactNode }) => (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: typography.micro, textTransform: "uppercase", letterSpacing: 0.7, color: colors.navy, background: colors.goldSoft, border: `1px solid ${colors.goldSoft}`, padding: "4px 11px", borderRadius: 20, fontWeight: 700 }}>{children}</span>
);

const CommissionBadge = ({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "extra" }) => (
    <span style={{ display: "inline-flex", alignItems: "center", width: "fit-content", maxWidth: "100%", fontSize: typography.micro, color: tone === "extra" ? colors.red : colors.navy, background: tone === "extra" ? "#FDEAE7" : colors.goldSoft, padding: "2px 6px", borderRadius: 14, fontWeight: 600, lineHeight: 1.2, whiteSpace: "nowrap" }}>{children}</span>
);

const CommissionCell = ({ row }: { row: EfectivizacionRow }) => {
    const monto = Number(row.monto ?? 0);
    const minimo = Number(row.monto_minimo_deposito_servicio ?? 0);
    const comisionServicio = Number(row.comision_servicio ?? 0);
    const comisionMinima = Number(row.comision_minima_servicio ?? 0);
    const extra = Number(row.comision_monto_extra_servicio ?? 0);
    const mainLabel = monto > minimo ? `${comisionServicio}%` : formatMoney(comisionMinima);

    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
            <CommissionBadge>{mainLabel}</CommissionBadge>
            {extra > 0 && <CommissionBadge tone="extra">Extra {formatMoney(extra)}</CommissionBadge>}
        </div>
    );
};

const SectionMeta = ({ title, count, total }: { title: string; count: number; total?: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", margin: "18px 0 10px", breakInside: "avoid" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge>{title}</Badge>
            <Badge>{count} operaciones</Badge>
            {total && <Badge>{total}</Badge>}
        </div>
        <span />
    </div>
);

const StatusPill = ({ value }: { value?: string | null }) => (
    <span style={{ display: "inline-block", fontSize: typography.micro, padding: "2px 7px", borderRadius: 20, background: colors.greenBg, color: colors.green, fontWeight: 700 }}>{value ?? "Pagado"}</span>
);

const Table = ({ headers, rows, footer, compact = false }: { headers: Array<{ label: string; numeric?: boolean }>; rows: React.ReactNode; footer?: React.ReactNode; compact?: boolean }) => (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", breakInside: "auto" }}>
        <thead>
            <tr>
                {headers.map((header, index) => (
                    <th key={index} style={{ textAlign: "left", fontSize: typography.micro, textTransform: "uppercase", letterSpacing: 0.45, color: colors.white, background: colors.navy, padding: compact ? "7px 5px" : "8px", fontWeight: 700, whiteSpace: "normal", lineHeight: 1.15, borderRadius: index === 0 ? "8px 0 0 0" : index === headers.length - 1 ? "0 8px 0 0" : 0 }}>{header.label}</th>
                ))}
            </tr>
        </thead>
        <tbody>{rows}</tbody>
        {footer && <tfoot>{footer}</tfoot>}
    </table>
);

const Cell = ({ children, numeric = false, muted = false }: { children: React.ReactNode; numeric?: boolean; muted?: boolean }) => (
    <td style={{ padding: "6.5px 7px", borderBottom: `1px solid ${colors.line}`, fontSize: typography.micro, color: muted ? colors.muted : colors.ink, textAlign: "left", fontWeight: numeric ? 600 : 400, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</td>
);

const FooterCell = ({ children, colSpan = 1, numeric = false }: { children?: React.ReactNode; colSpan?: number; numeric?: boolean }) => (
    <td colSpan={colSpan} style={{ padding: "10px 8px", fontSize: typography.micro, fontWeight: 500, color: colors.navy, background: colors.goldSoft, textAlign: "left", fontVariantNumeric: "tabular-nums" }}>{children}</td>
);

export const BancariaReporteCierrePdf = ({ data }: BancariaReporteCierrePdfProps) => {
    if (!data) return null;

    const efectivizacion = data.efectivizacion ?? [];
    const pagoDeuda = data.pago_deuda ?? [];
    const movimientos = data.movimientos ?? [];
    const retenciones = data.retenciones ?? [];
    const kpi = data.kpi ?? {};

    const sumEfectMonto = efectivizacion.reduce((s, r) => s + Number(r.monto ?? 0), 0);
    const sumEfectComision = efectivizacion.reduce((s, r) => s + Number(r.comision ?? 0), 0);
    const sumEfectGanancia = efectivizacion.reduce((s, r) => s + Number(r.ganancia ?? 0), 0);
    const sumEfectTransferencia = efectivizacion.reduce((s, r) => s + Number(r.transferencia ?? 0), 0);
    const sumPagoDeuda = pagoDeuda.reduce((s, r) => s + Number(r.monto_transferencia ?? 0), 0);
    const sumMovIngreso = movimientos.reduce((s, r) => s + Number(r.monto_ingreso ?? 0), 0);
    const sumMovSalida = movimientos.reduce((s, r) => s + Number(r.monto_salida ?? 0), 0);
    const sumRetenciones = retenciones.reduce((s, r) => s + Number(r.monto ?? 0), 0);
    const hasRows = efectivizacion.length > 0 || pagoDeuda.length > 0 || movimientos.length > 0 || retenciones.length > 0;

    return (
        <div style={{ fontFamily: typography.family, background: colors.white, color: colors.ink, fontSize: typography.xs, lineHeight: 1.5, padding: 0, width: "100%" }}>
            <div style={{ width: "100%", margin: 0, background: colors.white }}>
                <Header empresa={data.empresa} banco={data.banco} />

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
                    <KpiCard label="Caja Inicial" value={kpi.caja_inicial} />
                    <KpiCard label="Caja Actual" value={kpi.caja_actual} />
                    <KpiCard label="Caja Recaudacion" value={kpi.total_recaudado} />
                    <KpiCard label="Ingresos" value={kpi.ingresos} />
                    <KpiCard label="Gastos Operacionales" value={kpi.gastos_operacionales} />
                    <KpiCard label="Ganancias" value={kpi.ganancias} />
                    <KpiCard label="Retencion Recaudacion" value={kpi.ingresos_retenidos} />
                    <KpiCard label="Salidas" value={kpi.salidas} />
                </div>

                {efectivizacion.length > 0 && (
                    <section>
                        <SectionMeta title="Efectivizaciones" count={efectivizacion.length} />
                        <Table
                            compact
                            headers={[
                                { label: "Facturacion" },
                                { label: "Cod. Op." },
                                { label: "DNI" },
                                { label: "Comunidad" },
                                { label: "Cuenta Cliente" },
                                { label: "Monto", numeric: true },
                                { label: "Comision % o S/", numeric: true },
                                { label: "Comision", numeric: true },
                                { label: "Ganancia", numeric: true },
                                { label: "Transfer.", numeric: true },
                                { label: "Estado" },
                            ]}
                            rows={efectivizacion.map((row, index) => (
                                <tr key={index} style={{ background: index % 2 === 1 ? colors.row : colors.white }}>
                                    <Cell muted={!row.tipo_facturacion}>{row.tipo_facturacion ?? "-"}</Cell>
                                    <Cell>{row.codigo_operacion_deposito_cliente ?? "-"}</Cell>
                                    <Cell>{row.dni_cliente ?? "-"}</Cell>
                                    <Cell muted={!row.nombre_comunidad}>{row.nombre_comunidad ?? "-"}</Cell>
                                    <Cell>{row.cuenta_cliente ?? "-"}</Cell>
                                    <Cell numeric>{formatMoney(row.monto)}</Cell>
                                    <Cell numeric><CommissionCell row={row} /></Cell>
                                    <Cell numeric>{formatMoney(row.comision)}</Cell>
                                    <Cell numeric>{formatMoney(row.ganancia)}</Cell>
                                    <Cell numeric>{formatMoney(row.transferencia)}</Cell>
                                    <Cell><StatusPill value={row.nombre_estado} /></Cell>
                                </tr>
                            ))}
                            footer={
                                <tr>
                                    <FooterCell colSpan={5}>Totales</FooterCell>
                                    <FooterCell numeric>{formatMoney(sumEfectMonto)}</FooterCell>
                                    <FooterCell />
                                    <FooterCell numeric>{formatMoney(sumEfectComision)}</FooterCell>
                                    <FooterCell numeric>{formatMoney(sumEfectGanancia)}</FooterCell>
                                    <FooterCell numeric>{formatMoney(sumEfectTransferencia)}</FooterCell>
                                    <FooterCell />
                                </tr>
                            }
                        />
                    </section>
                )}

                {pagoDeuda.length > 0 && (
                    <section>
                        <SectionMeta title="Pago Deuda" count={pagoDeuda.length} />
                        <Table
                            compact
                            headers={["Codigo", "DNI", "Cliente", "Empresa Salida", "Cuenta", "Transferencia", "Empresa Ingreso", "Cuenta Ing.", "Devolucion"].map((label) => ({ label, numeric: ["Transferencia", "Devolucion"].includes(label) }))}
                            rows={pagoDeuda.map((row, index) => (
                                <tr key={index} style={{ background: index % 2 === 1 ? colors.row : colors.white }}>
                                    <Cell>{row.codigo_operacion_deposito_cliente ?? "-"}</Cell>
                                    <Cell>{row.dni_cliente ?? "-"}</Cell>
                                    <Cell>{row.nombre_cliente ?? "-"}</Cell>
                                    <Cell>{row.nombre_empresa_salida ?? "-"}</Cell>
                                    <Cell>{row.cuenta ?? "-"}</Cell>
                                    <Cell numeric>{formatMoney(row.monto_transferencia)}</Cell>
                                    <Cell>{row.nombre_empresa_ingreso ?? "-"}</Cell>
                                    <Cell>{row.cuenta_ingreso ?? "-"}</Cell>
                                    <Cell numeric>{formatMoney(row.monto_devolucion)}</Cell>
                                </tr>
                            ))}
                            footer={<tr><FooterCell colSpan={5}>Totales</FooterCell><FooterCell numeric>{formatMoney(sumPagoDeuda)}</FooterCell><FooterCell colSpan={3} /></tr>}
                        />
                    </section>
                )}

                {movimientos.length > 0 && (
                    <section>
                        <SectionMeta title="Movimientos" count={movimientos.length} />
                        <Table
                            headers={["Origen", "Tipo", "DNI", "Ingreso", "Salida", "Detalle"].map((label) => ({ label, numeric: ["Ingreso", "Salida"].includes(label) }))}
                            rows={movimientos.map((row, index) => (
                                <tr key={index} style={{ background: index % 2 === 1 ? colors.row : colors.white }}>
                                    <Cell>{row.tipo_origen ?? "-"}</Cell>
                                    <Cell>{row.tipo_movimiento ?? "-"}</Cell>
                                    <Cell>{row.dni_cliente ?? "-"}</Cell>
                                    <Cell numeric>{formatMoney(row.monto_ingreso)}</Cell>
                                    <Cell numeric>{formatMoney(row.monto_salida)}</Cell>
                                    <Cell>{row.detalle ?? "-"}</Cell>
                                </tr>
                            ))}
                            footer={<tr><FooterCell colSpan={3}>Totales</FooterCell><FooterCell numeric>{formatMoney(sumMovIngreso)}</FooterCell><FooterCell numeric>{formatMoney(sumMovSalida)}</FooterCell><FooterCell /></tr>}
                        />
                    </section>
                )}

                {retenciones.length > 0 && (
                    <section>
                        <SectionMeta title="Retenciones" count={retenciones.length} total={formatMoney(sumRetenciones)} />
                        <Table
                            headers={["Codigo", "DNI", "Cliente", "Monto", "Motivo", "Retiene", "Fecha Retencion"].map((label) => ({ label, numeric: label === "Monto" }))}
                            rows={retenciones.map((row, index) => (
                                <tr key={index} style={{ background: index % 2 === 1 ? colors.row : colors.white }}>
                                    <Cell>{row.codigo_operacion_deposito_cliente ?? "-"}</Cell>
                                    <Cell>{row.dni_cliente ?? "-"}</Cell>
                                    <Cell>{row.nombre_cliente ?? "-"}</Cell>
                                    <Cell numeric>{formatMoney(row.monto)}</Cell>
                                    <Cell>{row.motivo_retencion ?? "-"}</Cell>
                                    <Cell>{row.nombre_usuario_retiene ?? "-"}</Cell>
                                    <Cell>{formatDate(row.fecha_retencion)}</Cell>
                                </tr>
                            ))}
                            footer={<tr><FooterCell colSpan={3}>Totales</FooterCell><FooterCell numeric>{formatMoney(sumRetenciones)}</FooterCell><FooterCell colSpan={3} /></tr>}
                        />
                    </section>
                )}

                {!hasRows && (
                    <div style={{ border: `1px dashed ${colors.line}`, borderRadius: 10, padding: 20, textAlign: "center", color: colors.muted, fontSize: 9, marginTop: 16 }}>
                        Sin operaciones para este periodo.
                    </div>
                )}

                <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${colors.line}`, paddingTop: 10, marginTop: 16, fontSize: 7.6, color: colors.muted }}>
                    <span>AlToque Peru WK · Plataforma de Efectivizacion</span>
                    <span>Reporte de Cierre · Confidencial</span>
                </footer>
            </div>
        </div>
    );
};
