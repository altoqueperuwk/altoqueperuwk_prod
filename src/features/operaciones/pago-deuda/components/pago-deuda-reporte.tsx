import type { ReactNode } from "react";
import { Check } from "@untitledui/icons";
import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatInteger, formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";

export const pagoDeudaReportHeaders = [
    "Pasos",
    "DNI",
    "Banco Solicitado",
    "Monto Solicitado",
    "Comision",
    "Monto Devuelto",
    "Cuenta Comision",
    "Estado",
    "Fecha Hora",
] as const;

export interface PagoDeudaReportAccountConfig {
    id_empresa_cuenta_bancaria: number;
    banco_nombre: string;
    billetera_digital: string;
}

export interface PagoDeudaReportKpi {
    total_operaciones_pendientes?: number | null;
    total_operaciones_pagados?: number | null;
    monto_solicitados?: number | null;
    comisiones?: number | null;
    monto_devueltos?: number | null;
}

const reportStyles = `
.pago-deuda-report, .pago-deuda-report * { box-sizing:border-box; }
.pago-deuda-report { width:794px; padding:28px; background:#fff; color:#1e2a38; font-family:Arial,sans-serif; font-size:10px; }
.pago-deuda-report .cover { padding:22px 24px; color:#fff; background:#1e2a38; border-radius:10px; }
.pago-deuda-report .cover-top { display:flex; justify-content:space-between; gap:20px; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,.18); }
.pago-deuda-report .brand { font-size:16px; font-weight:700; letter-spacing:1px; }
.pago-deuda-report .brand span { color:#d9be8c; }
.pago-deuda-report .title { font-size:16px; font-weight:700; white-space:nowrap; }
.pago-deuda-report .meta { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:14px; }
.pago-deuda-report .meta-label { display:block; color:#a9b4c0; font-size:8px; text-transform:uppercase; letter-spacing:.7px; }
.pago-deuda-report .meta-value { display:block; margin-top:3px; color:#fff; font-weight:700; }
.pago-deuda-report h2 { margin:22px 0 8px; font-size:13px; }
.pago-deuda-report .kpi-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:6px; margin:18px 0 8px; }
.pago-deuda-report .kpi-card { padding:8px; border:1px solid #e5e7eb; border-radius:6px; background:#fff; }
.pago-deuda-report .kpi-label { color:#64748b; font-size:7px; }
.pago-deuda-report .kpi-value { margin-top:4px; color:#1e2a38; font-size:10px; font-weight:700; }
.pago-deuda-report .table-wrap { overflow:hidden; border:1px solid #e5e7eb; border-radius:7px; }
.pago-deuda-report table { width:100%; border-collapse:collapse; table-layout:fixed; }
.pago-deuda-report th { padding:8px 5px; background:#1e2a38; color:#fff; font-size:7px; text-align:left; white-space:nowrap; }
.pago-deuda-report td { padding:7px 5px; border-bottom:1px solid #eef2f6; color:#334155; font-size:8px; vertical-align:middle; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pago-deuda-report td.date-time { white-space:pre-line; line-height:1.35; }
.pago-deuda-report td.commission { white-space:pre-line; line-height:1.35; }
.pago-deuda-report tr:nth-child(even) td { background:#f8fafc; }
.pago-deuda-report .steps { display:flex; gap:3px; }
.pago-deuda-report .step { display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; border:1px solid #cbd5e1; border-radius:50%; font-size:7px; }
.pago-deuda-report .step.done { border-color:#16a34a; background:#16a34a; color:#fff; }
.pago-deuda-report .total td { background:#f8fafc; border-top:1px solid #cbd5e1; font-weight:700; }
.pago-deuda-report footer { display:flex; justify-content:space-between; margin-top:18px; padding-top:9px; border-top:1px solid #e2e8f0; color:#94a3b8; font-size:8px; }
@page { size:A4 portrait; margin:7mm; }
`;

const textValue = (value: unknown) => value == null || value === "" ? "-" : String(value);
const numberValue = (value: unknown) => Number(value ?? 0);
const dateTimeValue = (value: string | null | undefined) => value
    ? `${new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value))}\n${new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))}`
    : "-";

const isProcessed = (row: OperacionProceso) => ["PROCESADO", "PAGADO"].includes(String(row.nombre_estado ?? "").toUpperCase());
const hasReturn = (row: OperacionProceso) => Boolean(row.id_operacion_match) || numberValue(row.monto_devuelto) >= numberValue(row.monto_deposito_cliente);

export const getPagoDeudaReportSteps = (row: OperacionProceso) => [
    true,
    isProcessed(row),
    hasReturn(row) || String(row.nombre_estado ?? "").toUpperCase() === "PAGADO",
    Boolean(row.flag_comision_registrada),
];

export const getPagoDeudaReportAccount = (
    row: OperacionProceso,
    accountConfigs: Map<number, PagoDeudaReportAccountConfig> = new Map(),
) => {
    const account = accountConfigs.get(Number(row.id_empresa_cuenta_ingreso));
    const cuenta = account?.banco_nombre || row.nombre_banco_empresa_cuenta_ingreso || "";
    const billetera = account?.billetera_digital?.trim();
    return textValue(billetera ? `${cuenta} (${billetera})` : cuenta);
};

const ReportSteps = ({ row }: { row: OperacionProceso }) => (
    <div className="steps">
        {getPagoDeudaReportSteps(row).map((done, index) => (
            <span className={`step${done ? " done" : ""}`} key={index}>{done ? <Check className="size-3" /> : null}</span>
        ))}
    </div>
);

const Cell = ({ children }: { children: ReactNode }) => <td>{children}</td>;

export const PagoDeudaReportPdf = ({ rows, dateLabel, userName, accountConfigs, kpi }: { rows: OperacionProceso[]; dateLabel: string; userName: string; accountConfigs?: Map<number, PagoDeudaReportAccountConfig>; kpi?: PagoDeudaReportKpi }) => {
    const totalRequested = rows.reduce((sum, row) => sum + numberValue(row.monto_deposito_cliente), 0);
    const totalCommission = rows.reduce((sum, row) => sum + numberValue(row.resultado_comision_servicio), 0);
    const totalReturned = rows.reduce((sum, row) => sum + (hasReturn(row) ? numberValue(row.monto_deposito_cliente) : numberValue(row.monto_devuelto)), 0);

    return (
        <>
            <style>{reportStyles}</style>
            <div className="pago-deuda-report">
                <header className="cover">
                    <div className="cover-top"><div className="brand">ALTOQUE PERÚ <span>WK</span></div><div className="title">Reporte de Pago Deuda</div></div>
                    <div className="meta">
                        <div><span className="meta-label">Fecha de consulta</span><span className="meta-value">{dateLabel}</span></div>
                        <div><span className="meta-label">Usuario</span><span className="meta-value">{textValue(userName)}</span></div>
                        <div><span className="meta-label">Total operaciones</span><span className="meta-value">{rows.length}</span></div>
                    </div>
                </header>
                <div className="kpi-grid">
                    <div className="kpi-card"><div className="kpi-label">Total Operaciones Pendientes</div><div className="kpi-value">{numberValue(kpi?.total_operaciones_pendientes)}</div></div>
                    <div className="kpi-card"><div className="kpi-label">Total Operaciones Pagados</div><div className="kpi-value">{numberValue(kpi?.total_operaciones_pagados)}</div></div>
                    <div className="kpi-card"><div className="kpi-label">Monto Solicitados</div><div className="kpi-value">{formatMoney(kpi?.monto_solicitados)}</div></div>
                    <div className="kpi-card"><div className="kpi-label">Comisiones</div><div className="kpi-value">{formatMoney(kpi?.comisiones)}</div></div>
                    <div className="kpi-card"><div className="kpi-label">Monto Devueltos</div><div className="kpi-value">{formatMoney(kpi?.monto_devueltos)}</div></div>
                </div>
                <h2>Pago Deuda · Total: {rows.length}</h2>
                <div className="table-wrap">
                    <table>
                        <colgroup><col style={{ width: "14%" }} /><col style={{ width: "11%" }} /><col style={{ width: "14%" }} /><col style={{ width: "13%" }} /><col style={{ width: "13%" }} /><col style={{ width: "13%" }} /><col style={{ width: "14%" }} /><col style={{ width: "10%" }} /><col style={{ width: "13%" }} /></colgroup>
                        <thead><tr>{pagoDeudaReportHeaders.map((header) => <th key={header}>{header}</th>)}</tr></thead>
                        <tbody>
                            {rows.map((row) => <tr key={row.id}>
                                <Cell><ReportSteps row={row} /></Cell>
                                <Cell>{textValue(row.dni_cliente)}</Cell>
                                <Cell>{textValue(row.nombre_banco_cliente)}</Cell>
                                <Cell>{formatMoney(row.monto_deposito_cliente)}</Cell>
                                <td className="commission">{(() => {
                                    const extra = numberValue(row.comision_monto_extra_servicio);
                                    const commission = numberValue(row.resultado_comision_servicio);
                                    const base = Math.max(0, commission - extra);
                                    return extra > 0
                                        ? `${formatMoney(base)} (${textValue(row.comision_servicio)}%)\n(S/ ${formatInteger(extra)})`
                                        : `${formatMoney(commission)} (${textValue(row.comision_servicio)}%)`;
                                })()}</td>
                                <Cell>{formatMoney(hasReturn(row) ? row.monto_deposito_cliente : row.monto_devuelto)}</Cell>
                                <Cell>{getPagoDeudaReportAccount(row, accountConfigs)}</Cell>
                                <Cell>{textValue(row.nombre_estado)}</Cell>
                                <td className="date-time">{dateTimeValue(row.fecha_registro)}</td>
                            </tr>)}
                            <tr className="total"><td colSpan={3}>Totales</td><td>{formatMoney(totalRequested)}</td><td>{formatMoney(totalCommission)}</td><td>{formatMoney(totalReturned)}</td><td /><td /><td /></tr>
                        </tbody>
                    </table>
                </div>
                <footer><span>Altoque Peru WK · Pago Deuda</span><span>Reporte generado automáticamente</span></footer>
            </div>
        </>
    );
};
