import { Badge } from "@/components/base/badges/badges";
import { OperationTable } from "@/features/operaciones/efectivizacion/shared/components/operation-table";
import { CompactBadgeLine, CompactMoneyCell } from "@/features/operaciones/efectivizacion/shared/components/compact-table-primitives";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import type { OperacionProceso, OperacionRuta } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { ArrowNarrowRight } from "@untitledui/icons";

const value = (row: OperacionProceso, key: string) => String((row as unknown as Record<string, unknown>)[key] ?? "-");
const dateCell = (row: OperacionProceso) => {
    const date = row.fecha_registro ? new Date(row.fecha_registro) : null;
    return date ? (
        <div className="leading-5">
            <div>{date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</div>
            <div className="text-xs text-tertiary">{date.toLocaleDateString("es-PE")}</div>
        </div>
    ) : "-";
};

const isPaidRow = (row: OperacionProceso, paymentMode = false) => {
    if (paymentMode) return String((row as unknown as Record<string, unknown>).seguimiento_estado ?? "").toUpperCase() === "PAGADO";
    return String(row.nombre_estado ?? "").toUpperCase() === "PAGADO";
};

const formatAttentionTime = (row: OperacionProceso, now: number, paymentMode = false) => {
    const startedAt = new Date(row.fecha_registro).getTime();
    if (!Number.isFinite(startedAt)) return { label: "00:00:00", color: "success" as const };

    const paidAt = row.fecha_pagado ? new Date(row.fecha_pagado).getTime() : NaN;
    const endAt = isPaidRow(row, paymentMode) && Number.isFinite(paidAt) ? paidAt : now;
    const elapsedSeconds = Math.max(0, Math.floor((endAt - startedAt) / 1000));
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;
    const label = [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
    const color = elapsedSeconds >= 7200 ? "error" : elapsedSeconds >= 3600 ? "warning" : "success";

    return { label, color } as const;
};

const AttentionTimeCell = ({ row, now, paymentMode = false }: { row: OperacionProceso; now: number; paymentMode?: boolean }) => {
    const time = formatAttentionTime(row, now, paymentMode);
    return <Badge type="color" size="sm" color={time.color}>{time.label}</Badge>;
};

const statusCell = (row: OperacionProceso) => (
    <CompactBadgeLine color={String(row.nombre_estado ?? "").toUpperCase() === "PAGADO" ? "success" : "brand"}>
        {row.nombre_estado ?? "-"}
    </CompactBadgeLine>
);

const commissionCell = (row: OperacionProceso) => (
    <CompactMoneyCell
        value={row.resultado_comision_servicio}
        secondary={row.comision_servicio != null ? <CompactBadgeLine>{`${row.comision_servicio}%`}</CompactBadgeLine> : undefined}
    />
);

const accountCell = (row: OperacionProceso) => (
    <div className="flex flex-wrap gap-1">
        <CompactBadgeLine color="brand">{row.nombre_empresa_salida ?? row.nombre_empresa_ingreso ?? "-"}</CompactBadgeLine>
        <CompactBadgeLine>{row.nombre_banco_empresa_cuenta_salida ?? row.nombre_banco_empresa_cuenta_ingreso ?? "-"}</CompactBadgeLine>
    </div>
);

interface SeguimientoOperationTableProps {
    data: OperacionProceso[];
    isLoading: boolean;
    now?: number;
    tab: "Efectivizacion" | "Derivados" | "POS";
    pagination?: {
        page: number;
        totalPages: number;
        pageSize: number;
        onPageChange: (page: number) => void;
        onPageSizeChange: (pageSize: number) => void;
    };
}

export const SeguimientoOperationTable = ({ data, isLoading, now = Date.now(), tab, pagination }: SeguimientoOperationTableProps) => {
    const columns = tab === "POS" ? [
        { key: "nombre_banco_cliente", label: "Entidad Tarjeta", render: (row: OperacionProceso) => <CompactBadgeLine>{row.nombre_banco_cliente ?? "-"}</CompactBadgeLine> },
        { key: "dni_cliente", label: "DNI" },
        { key: "nombre_cliente", label: "Nombre" },
        { key: "nombre_comunidad", label: "Comunidad" },
        { key: "monto_deposito_cliente", label: "Monto", render: (row: OperacionProceso) => formatMoney(row.monto_deposito_cliente) },
        { key: "resultado_comision_servicio", label: "Comision", render: commissionCell },
        { key: "nombre_empresa_salida", label: "Empresa Cuenta", render: accountCell },
        { key: "monto_transferencia_cliente", label: "Transferencia", render: (row: OperacionProceso) => formatMoney(row.monto_transferencia_cliente) },
        { key: "nombre_estado", label: "Estado", render: statusCell },
        { key: "fecha_registro", label: "Fecha Hora", render: dateCell },
        { key: "tiempo_atencion", label: "Tiempo Atencion", render: (row: OperacionProceso) => <AttentionTimeCell row={row} now={now} /> },
    ] : [
        { key: "tipo_facturacion", label: "Facturacion", render: (row: OperacionProceso) => <CompactBadgeLine>{row.tipo_facturacion ?? "-"}</CompactBadgeLine> },
        ...(tab === "Derivados" ? [{ key: "ruta_origen", label: "Derivo", render: (row: OperacionProceso) => getRutaLabel((row.ruta_origen ?? "") as OperacionRuta) }] : []),
        { key: "codigo_operacion_deposito_cliente", label: "Cod. Op.", render: (row: OperacionProceso) => <div>{value(row, "codigo_operacion_deposito_cliente")} {Boolean((row as unknown as Record<string, unknown>).seguimiento_derivada) && <div className="text-xs text-tertiary">Derivada</div>}</div> },
        { key: "dni_cliente", label: "DNI" },
        { key: "nombre_comunidad", label: "Comunidad" },
        { key: "nombre_banco_cliente", label: "Cuenta Cliente", render: (row: OperacionProceso) => row.nombre_banco_cliente ?? "-" },
        { key: "monto_deposito_cliente", label: "Monto", render: (row: OperacionProceso) => formatMoney(row.monto_deposito_cliente) },
        { key: "resultado_comision_servicio", label: "Comision", render: commissionCell },
        { key: "monto_transferencia_cliente", label: "Transferencia", render: (row: OperacionProceso) => formatMoney(Number((row as unknown as Record<string, unknown>).seguimiento_transferencia ?? row.monto_transferencia_cliente ?? 0)) },
        { key: "nombre_estado", label: "Estado", render: statusCell },
        { key: "fecha_registro", label: "Fecha Hora", render: dateCell },
    ];

    return <OperationTable columns={columns} data={data} emptyText="Sin operaciones para este seguimiento." isLoading={isLoading} serverPagination={pagination} />;
};

const paymentValue = (row: OperacionProceso, key: string) => String((row as unknown as Record<string, unknown>)[key] ?? "-");

const paymentSteps = (row: OperacionProceso) => {
    const state = String((row as unknown as Record<string, unknown>).seguimiento_estado ?? "").toUpperCase();
    const completed = state === "PAGADO" ? 4 : state === "PENDIENTE COMISION" ? 3 : state === "PENDIENTE DEVOLUCION" ? 2 : 1;
    const definitions = ["Solicitud", "Banco", "Retorno / Retorno directo", "Comisión Pago Deuda"];
    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4].map((step) => (
                <span key={step} title={`${step}. ${definitions[step - 1]}`} className={`flex size-5 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-inset ${step <= completed ? "bg-success-solid text-white ring-transparent" : "bg-primary text-tertiary ring-secondary"}`}>
                    {step <= completed ? "✓" : step}
                </span>
            ))}
        </div>
    );
};

export const SeguimientoPagoDeudaTable = ({ data, isLoading, now = Date.now(), pagination }: { data: OperacionProceso[]; isLoading: boolean; now?: number; pagination?: { page: number; totalPages: number; pageSize: number; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void } }) => (
    <OperationTable
        data={data}
        isLoading={isLoading}
        emptyText="Sin solicitudes para este seguimiento."
        columns={[
            { key: "pasos", label: "Pasos", render: paymentSteps },
            { key: "dni_cliente", label: "DNI" },
            { key: "nombre_cliente", label: "Cliente" },
            { key: "nombre_banco_cliente", label: "Banco Solicitado" },
            { key: "monto_deposito_cliente", label: "Monto Solicitado", render: (row: OperacionProceso) => formatMoney(row.monto_deposito_cliente) },
            { key: "resultado_comision_servicio", label: "Comision", render: commissionCell },
            { key: "monto_devuelto", label: "Monto Devuelto", render: (row: OperacionProceso) => formatMoney(row.monto_devuelto) },
            { key: "cuenta_comision", label: "Cuenta Comision", render: (row: OperacionProceso) => <div className="flex flex-wrap gap-1"><CompactBadgeLine color="brand">{paymentValue(row, "nombre_empresa_ingreso")}</CompactBadgeLine><CompactBadgeLine>{paymentValue(row, "nombre_banco_empresa_cuenta_ingreso")}</CompactBadgeLine></div> },
            { key: "seguimiento_estado", label: "Estado", render: (row: OperacionProceso) => <div className="flex flex-wrap gap-1"><CompactBadgeLine color={paymentValue(row, "seguimiento_estado") === "Pagado" ? "success" : "brand"}>{paymentValue(row, "seguimiento_estado")}</CompactBadgeLine>{Boolean((row as unknown as Record<string, unknown>).flag_cerrada_caja) && <CompactBadgeLine color="slate">Cerrada</CompactBadgeLine>}</div> },
            { key: "fecha_registro", label: "Fecha Hora", render: dateCell },
            { key: "tiempo_atencion", label: "Tiempo Atencion", render: (row: OperacionProceso) => <AttentionTimeCell row={row} now={now} paymentMode /> },
        ]}
        serverPagination={pagination}
    />
);

const unifiedValue = (row: OperacionProceso, key: string) => {
    const raw = (row as unknown as Record<string, unknown>)[key];
    return raw === null || raw === undefined || String(raw).trim() === "" ? "-" : String(raw);
};

const unifiedAmount = (row: OperacionProceso, key: string) => {
    const raw = (row as unknown as Record<string, unknown>)[key];
    return raw === null || raw === undefined || raw === "" ? null : Number(raw);
};

const unifiedMoney = (row: OperacionProceso, key: string) => {
    const raw = unifiedAmount(row, key);
    return raw === null || !Number.isFinite(raw) ? "-" : formatMoney(raw);
};

type UnifiedBadgeColor = "gray" | "brand" | "error" | "warning" | "success" | "slate" | "sky" | "blue" | "indigo" | "purple" | "pink" | "orange";

const unifiedBadge = (text: string, color: UnifiedBadgeColor = "brand") => (
    <CompactBadgeLine color={color}>{text}</CompactBadgeLine>
);

const flowBadgeColors: Record<string, UnifiedBadgeColor> = {
    Efectivizacion: "brand",
    Derivados: "orange",
    POS: "blue",
    "Pago Deuda": "success",
};

const unifiedFlowCell = (row: OperacionProceso) => {
    const flow = unifiedValue(row, "seguimiento_flujo");
    const displayFlow = flow === "Derivados" ? "Efectivizacion" : flow;
    return (
        <CompactBadgeLine color={flowBadgeColors[displayFlow] ?? "gray"}>{displayFlow}</CompactBadgeLine>
    );
};

const unifiedDerivoCell = (row: OperacionProceso) => {
    const route = unifiedValue(row, "seguimiento_derivo");
    if (route === "-") return "-";

    const routeLabel = getRutaLabel(route as OperacionRuta);
    return (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span>{routeLabel}</span>
            <ArrowNarrowRight aria-hidden="true" className="size-4 text-fg-brand-secondary" />
        </span>
    );
};

const unifiedCommissionCell = (row: OperacionProceso) => {
    const importe = unifiedMoney(row, "seguimiento_comision_importe");
    const porcentaje = unifiedValue(row, "seguimiento_comision_porcentaje");

    return <div className="flex flex-wrap items-center gap-1">
        <span>{importe}</span>
        {porcentaje !== "-" && unifiedBadge(`${porcentaje}%`)}
    </div>;
};

const unifiedTransferCell = (row: OperacionProceso) => {
    const flow = unifiedValue(row, "seguimiento_flujo");
    const steps = unifiedAmount(row, "seguimiento_pasos");

    if (flow === "Pago Deuda" && (steps === null || steps < 2)) return "-";

    return unifiedMoney(row, "seguimiento_transferencia");
};

const unifiedReturnCell = (row: OperacionProceso) => {
    const flow = unifiedValue(row, "seguimiento_flujo");
    const steps = unifiedAmount(row, "seguimiento_pasos");

    if (flow !== "Pago Deuda" || steps === null || steps < 3) return "-";

    return unifiedMoney(row, "seguimiento_monto_devolucion");
};

const unifiedStepsCell = (row: OperacionProceso) => {
    const flow = unifiedValue(row, "seguimiento_flujo");
    const steps = unifiedAmount(row, "seguimiento_pasos");
    const definitions = ["Solicitud", "Banco", "Retorno / Retorno directo", "Comisión Pago Deuda"];

    if (flow !== "Pago Deuda" || steps === null || !Number.isFinite(steps)) return "-";

    return <div className="flex items-center gap-1">
        {[1, 2, 3, 4].map((step) => (
            <span
                key={step}
                title={`${step}. ${definitions[step - 1]}`}
                className={`flex size-5 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-inset ${step <= steps ? "bg-success-solid text-white ring-transparent" : "bg-primary text-tertiary ring-secondary"}`}
            >
                {step <= steps ? "✓" : step}
            </span>
        ))}
    </div>;
};

const unifiedStatusCell = (row: OperacionProceso) => {
    const status = unifiedValue(row, "seguimiento_estado");
    return <div className="flex flex-wrap gap-1"><CompactBadgeLine color="error">{status}</CompactBadgeLine>{Boolean((row as unknown as Record<string, unknown>).flag_cerrada_caja) && <CompactBadgeLine color="slate">Cerrada</CompactBadgeLine>}</div>;
};

export const SeguimientoUnifiedTable = ({
    data,
    isLoading,
    now = Date.now(),
    pagination,
}: {
    data: OperacionProceso[];
    isLoading: boolean;
    now?: number;
    pagination?: { page: number; totalPages: number; pageSize: number; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void };
}) => (
    <OperationTable
        data={data}
        isLoading={isLoading}
        emptyText="Sin operaciones para este seguimiento."
        columns={[
            { key: "seguimiento_tiempo_atencion_segundos", label: "Tiempo Atención", render: (row: OperacionProceso) => <AttentionTimeCell row={row} now={now} /> },
            { key: "fecha_registro", label: "Fecha Hora", render: dateCell, headerClassName: "hidden sm:table-cell", cellClassName: "hidden sm:table-cell" },
            { key: "seguimiento_derivo", label: "Derivo", render: unifiedDerivoCell, headerClassName: "hidden sm:table-cell", cellClassName: "hidden sm:table-cell" },
            { key: "seguimiento_empresa_cuenta_cuenta", label: "Banco", render: (row: OperacionProceso) => unifiedValue(row, "seguimiento_empresa_cuenta_cuenta") },
            { key: "seguimiento_flujo", label: "Flujo", render: unifiedFlowCell },
            { key: "seguimiento_pasos", label: "Pasos", render: unifiedStepsCell, headerClassName: "hidden sm:table-cell", cellClassName: "hidden sm:table-cell" },
            { key: "seguimiento_codigo_operacion", label: "Cod. Operación", render: (row: OperacionProceso) => unifiedValue(row, "seguimiento_codigo_operacion"), headerClassName: "hidden sm:table-cell", cellClassName: "hidden sm:table-cell" },
            { key: "dni_cliente", label: "DNI", render: (row: OperacionProceso) => unifiedValue(row, "dni_cliente") },
            { key: "nombre_comunidad", label: "Comunidad", render: (row: OperacionProceso) => unifiedValue(row, "nombre_comunidad"), headerClassName: "hidden sm:table-cell", cellClassName: "hidden sm:table-cell" },
            { key: "seguimiento_monto", label: "Monto", render: (row: OperacionProceso) => unifiedMoney(row, "seguimiento_monto") },
            { key: "seguimiento_comision_importe", label: "Comisión", render: unifiedCommissionCell },
            { key: "seguimiento_transferencia", label: "Transferencia", render: unifiedTransferCell },
            { key: "seguimiento_monto_devolucion", label: "Devolución", render: unifiedReturnCell, headerClassName: "hidden sm:table-cell", cellClassName: "hidden sm:table-cell" },
            { key: "seguimiento_estado", label: "Estado", render: unifiedStatusCell, headerClassName: "hidden sm:table-cell", cellClassName: "hidden sm:table-cell" },
        ]}
        serverPagination={pagination}
    />
);

export interface SeguimientoKpiGridProps {
    items: { label: string; value: string; valueClassName?: string }[];
    isLoading: boolean;
}

export const SeguimientoKpiGrid = ({ items, isLoading }: SeguimientoKpiGridProps) => (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${items.length <= 3 ? "xl:grid-cols-3" : "xl:grid-cols-5"}`}>
        {items.map((item) => (
            <div key={item.label} className="min-h-24 rounded-lg border border-secondary bg-primary p-4 shadow-xs">
                <p className="text-xs font-medium text-tertiary">{item.label}</p>
                {isLoading ? <div className="mt-3 h-7 w-24 animate-pulse rounded bg-secondary" /> : <p className={`mt-2 truncate text-xl font-semibold ${item.valueClassName ?? "text-primary"}`}>{item.value}</p>}
            </div>
        ))}
    </div>
);
