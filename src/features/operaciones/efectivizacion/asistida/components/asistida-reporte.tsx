import type { ReactNode } from "react";
import type { OperacionAsistidaKpi, OperacionProceso, OperacionRuta } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";

export type AsistidaReportColumnKey =
    | "entidad"
    | "dni"
    | "comunidad"
    | "monto"
    | "comision"
    | "comisionEcompany"
    | "comisionAtk"
    | "empresa"
    | "cuenta"
    | "transferencia"
    | "estado"
    | "hora";

export interface AsistidaReportColumn {
    key: AsistidaReportColumnKey;
    label: string;
    money?: boolean;
}

export interface AsistidaReportProps {
    ruta: Extract<OperacionRuta, "pos" | "linkpago">;
    rows: OperacionProceso[];
    deletedRows?: OperacionProceso[];
    date: string;
    userName: string;
    kpi?: OperacionAsistidaKpi | null;
}

export const getAsistidaReportColumns = (ruta: AsistidaReportProps["ruta"]): AsistidaReportColumn[] => ruta === "linkpago"
    ? [
        { key: "entidad", label: "Entidad Tarjeta" },
        { key: "dni", label: "DNI" },
        { key: "comunidad", label: "Comunidad" },
        { key: "monto", label: "Monto", money: true },
        { key: "comision", label: "Comision", money: true },
        { key: "comisionEcompany", label: "Comision ECompany", money: true },
        { key: "comisionAtk", label: "Comision ATK", money: true },
        { key: "transferencia", label: "Transferencia", money: true },
        { key: "estado", label: "Estado" },
        { key: "hora", label: "Hora" },
    ]
    : [
        { key: "entidad", label: "Entidad Tarjeta" },
        { key: "dni", label: "DNI" },
        { key: "comunidad", label: "Comunidad" },
        { key: "monto", label: "Monto", money: true },
        { key: "comision", label: "Comision", money: true },
        { key: "empresa", label: "Empresa" },
        { key: "cuenta", label: "Cuenta" },
        { key: "transferencia", label: "Transferencia", money: true },
        { key: "estado", label: "Estado" },
        { key: "hora", label: "Hora" },
    ];

const numberValue = (value: unknown) => Number(value ?? 0);
const textValue = (value: unknown) => value == null || value === "" ? "-" : String(value);
const isPagado = (row: OperacionProceso) => String(row.nombre_estado ?? "").trim().toUpperCase() === "PAGADO";
const dateTimeValue = (value: string | null | undefined) => value
    ? `${new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value))}\n${new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))}`
    : "-";

export const getAsistidaReportCellValue = (row: OperacionProceso, key: AsistidaReportColumnKey): string | number => {
    switch (key) {
        case "entidad": return textValue(row.nombre_banco_cliente);
        case "dni": return textValue(row.dni_cliente);
        case "comunidad": return textValue(row.nombre_comunidad);
        case "monto": return numberValue(row.monto_deposito_cliente);
        case "comision": return numberValue(row.resultado_comision_servicio);
        case "comisionEcompany": return numberValue(row.resultado_comision_banco_ingreso) + numberValue(row.resultado_comision_banco_salida);
        case "comisionAtk": return numberValue(row.resultado_comision_servicio) - numberValue(row.resultado_comision_banco_ingreso) - numberValue(row.resultado_comision_banco_salida);
        case "empresa": return textValue(row.nombre_empresa_salida);
        case "cuenta": return textValue(row.nombre_banco_empresa_cuenta_salida);
        case "transferencia": return numberValue(row.monto_transferencia_cliente ?? row.monto_deposito_cliente);
        case "estado": return isPagado(row) ? "Pagado" : "Pendiente";
        case "hora": return dateTimeValue(row.fecha_registro);
    }
};

const reportStyles = `
.asistida-report, .asistida-report * { box-sizing:border-box; }
.asistida-report { width:794px; padding:28px; background:#fff; color:#1e2a38; font-family:Arial,sans-serif; font-size:10px; }
.asistida-report .cover { padding:22px 24px; color:#fff; background:#1e2a38; border-radius:10px; }
.asistida-report .cover-top { display:flex; justify-content:space-between; gap:20px; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,.18); }
.asistida-report .brand, .asistida-report .title { font-size:16px; font-weight:700; letter-spacing:1px; white-space:nowrap; }
.asistida-report .brand span { color:#d9be8c; }
.asistida-report .meta { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:14px; }
.asistida-report .meta-label { display:block; color:#a9b4c0; font-size:8px; text-transform:uppercase; letter-spacing:.7px; }
.asistida-report .meta-value { display:block; margin-top:3px; color:#fff; font-weight:700; }
.asistida-report .kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin:18px 0 8px; }
.asistida-report .kpi-card { padding:8px; border:1px solid #e5e7eb; border-radius:6px; background:#fff; }
.asistida-report .kpi-label { color:#64748b; font-size:7px; }
.asistida-report .kpi-value { margin-top:4px; color:#1e2a38; font-size:10px; font-weight:700; }
.asistida-report h2 { margin:22px 0 8px; font-size:13px; }
.asistida-report .table-wrap { overflow:hidden; border:1px solid #e5e7eb; border-radius:7px; }
.asistida-report table { width:100%; border-collapse:collapse; table-layout:fixed; }
.asistida-report th { padding:8px 5px; background:#1e2a38; color:#fff; font-size:7px; text-align:left; white-space:nowrap; }
.asistida-report td { padding:7px 5px; border-bottom:1px solid #eef2f6; color:#334155; font-size:8px; vertical-align:middle; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.asistida-report td.date-time { white-space:pre-line; line-height:1.35; }
.asistida-report tr:nth-child(even) td { background:#f8fafc; }
.asistida-report .total td { background:#f8fafc; border-top:1px solid #cbd5e1; font-weight:700; }
.asistida-report footer { display:flex; justify-content:space-between; margin-top:18px; padding-top:9px; border-top:1px solid #e2e8f0; color:#94a3b8; font-size:8px; }
@page { size:A4 portrait; margin:7mm; }
`;

const Cell = ({ children, className = "" }: { children: ReactNode; className?: string }) => <td className={className}>{children}</td>;

export const AsistidaReportPdf = ({ ruta, rows, deletedRows = [], date, userName, kpi }: AsistidaReportProps) => {
    const columns = getAsistidaReportColumns(ruta);
    const title = ruta === "linkpago" ? "LinkPago" : "POS";
    const totalByKey = (key: AsistidaReportColumnKey) => rows.reduce((sum, row) => sum + numberValue(getAsistidaReportCellValue(row, key)), 0);

    return (
        <>
            <style>{reportStyles}</style>
            <div className="asistida-report">
                <header className="cover">
                    <div className="cover-top"><div className="brand">ALTOQUE PERÚ <span>WK</span></div><div className="title">Reporte de {title}</div></div>
                    <div className="meta">
                        <div><span className="meta-label">Fecha de consulta</span><span className="meta-value">{new Date(`${date}T00:00:00`).toLocaleDateString("es-PE")}</span></div>
                        <div><span className="meta-label">Usuario</span><span className="meta-value">{textValue(userName)}</span></div>
                        <div><span className="meta-label">Total operaciones</span><span className="meta-value">{rows.length}</span></div>
                    </div>
                </header>
                <div className="kpi-grid">
                    {[
                        ["Comisiones", kpi?.comisiones],
                        ["Gastos", kpi?.gastos],
                        ["Ganancia", kpi?.ganancia],
                        ["Salidas", kpi?.salidas],
                    ].map(([label, value]) => <div className="kpi-card" key={String(label)}><div className="kpi-label">{label}</div><div className="kpi-value">{formatMoney(Number(value ?? 0))}</div></div>)}
                </div>
                <h2>{title} · Total: {rows.length}</h2>
                <div className="table-wrap">
                    <table>
                        <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
                        <tbody>
                            {rows.map((row) => <tr key={row.id}>{columns.map((column) => {
                                const value = getAsistidaReportCellValue(row, column.key);
                                return <Cell className={column.key === "hora" ? "date-time" : ""} key={column.key}>{column.money ? formatMoney(Number(value)) : value}</Cell>;
                            })}</tr>)}
                            <tr className="total"><td colSpan={Math.max(1, columns.findIndex((column) => column.key === "monto"))}>Totales</td>{columns.map((column, index) => index >= columns.findIndex((item) => item.key === "monto") ? <Cell key={column.key}>{column.money ? formatMoney(totalByKey(column.key)) : ""}</Cell> : null)}</tr>
                        </tbody>
                    </table>
                </div>
                {deletedRows.length > 0 && (
                    <>
                        <h2>Operaciones Eliminadas · Total: {deletedRows.length}</h2>
                        <div className="table-wrap">
                            <table>
                                <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
                                <tbody>
                                    {deletedRows.map((row) => <tr key={row.id}>{columns.map((column) => {
                                        const value = column.key === "estado" ? "Eliminado" : getAsistidaReportCellValue(row, column.key);
                                        return <Cell className={column.key === "hora" ? "date-time" : ""} key={column.key}>{column.money ? formatMoney(Number(value)) : value}</Cell>;
                                    })}</tr>)}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
                <footer><span>Altoque Peru WK · {title}</span><span>Reporte generado automáticamente</span></footer>
            </div>
        </>
    );
};
