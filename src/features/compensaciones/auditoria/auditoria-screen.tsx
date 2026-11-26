import { type ReactNode, useEffect, useState } from "react";
import { XClose } from "@untitledui/icons";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AlertMessage } from "@/components/shared/alert-center";
import type { ColumnDef } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { NombreCell } from "../shared/compensacion-cells";
import { CompensacionDataTable as DataTable } from "../shared/compensacion-data-table";
import { CompensacionEstado } from "../shared/compensacion-estado";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { formatoMonto } from "../shared/compensacion-formato";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { type AuditoriaFila, hoyLima } from "./auditoria-datos";

const tipoItems = [
    { id: "", label: "Todos Bonos y Penalidades" },
    { id: "BONO", label: "Bonos" },
    { id: "PENALIDAD", label: "Penalidades" },
];
const estadoItems = [
    { id: "", label: "Todos los estados" },
    { id: "PENDIENTE", label: "Pendiente" },
    { id: "APROBADO", label: "Aprobado" },
    { id: "RECHAZADO", label: "Rechazado" },
    { id: "ANULADO", label: "Anulado" },
];
/** Liquidado sigue siendo Aprobado para quien registra; en revisión sigue pendiente. */
const estadoBase = (estado: string) => (estado === "LIQUIDADO" ? "APROBADO" : estado === "EN_REVISION" ? "PENDIENTE" : estado);

const columns: ColumnDef[] = [
    {
        key: "tipo",
        header: "Tipo",
        minWidth: 90,
        render: (value) => <StatusBadge tone={value === "BONO" ? "success" : "error"}>{value === "BONO" ? "Bono" : "Penalidad"}</StatusBadge>,
    },
    {
        key: "concepto",
        header: "Detalle",
        minWidth: 220,
        render: (value, row) => (
            <div className="max-w-80 min-w-0 text-xs">
                <p className="font-medium break-words text-primary">{String(value || "—")}</p>
                {row.descripcion ? (
                    <p className="line-clamp-2 break-words text-secondary" title={String(row.descripcion)}>
                        {String(row.descripcion)}
                    </p>
                ) : null}
                {row.referencia ? <p className="break-words text-tertiary">{String(row.referencia)}</p> : null}
            </div>
        ),
    },
    { key: "colaborador", header: "Colaborador", minWidth: 130, render: (value) => <NombreCell value={value} /> },
    { key: "registradoPor", header: "Registrado por", minWidth: 130, render: (value) => <NombreCell value={value} /> },
    { key: "fecha", header: "Fecha", minWidth: 100, render: (value) => <CompensacionFechaCell value={value} /> },
    {
        key: "monto",
        header: "Monto",
        minWidth: 90,
        render: (value, row) =>
            value === null || value === undefined ? (
                <span className="text-tertiary">—</span>
            ) : (
                <span className={`whitespace-nowrap tabular-nums ${row.tipo === "PENALIDAD" ? "text-error-primary" : "text-success-primary"}`}>
                    {formatoMonto(value)}
                </span>
            ),
    },
    {
        key: "estado",
        header: "Estado",
        minWidth: 120,
        render: (value, row) => (
            <div className="space-y-1">
                <CompensacionEstado dominio="registro" valor={value === "LIQUIDADO" ? "APROBADO" : value} />
                {row.nota ? <p className="text-xs text-tertiary">{String(row.nota)}</p> : null}
            </div>
        ),
    },
];

/**
 * Auditoría Operaciones (Esquema 12): la misma pantalla para todos los perfiles que registran.
 * Mismas tarjetas, formulario, filtros y tabla; cada perfil solo aporta sus campos, filas y acciones.
 */
export const AuditoriaScreen = ({
    filas,
    cargando,
    error,
    mes,
    onMes,
    formulario,
    tituloFormulario = "Registrar Auditoria",
    children,
}: {
    filas: AuditoriaFila[];
    cargando: boolean;
    error: string;
    mes: string;
    onMes: (mes: string) => void;
    /** Sin formulario, el perfil solo consulta. */
    formulario?: ReactNode;
    tituloFormulario?: string;
    /** Ventanas de detalle y confirmación. */
    children?: ReactNode;
}) => {
    const [tipo, setTipo] = useState("");
    const [estado, setEstado] = useState("");
    const [buscar, setBuscar] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    useEffect(() => setPage(1), [tipo, estado, buscar, mes]);

    const ordenadas = [...filas].sort((a, b) => (Date.parse(b.fecha) || 0) - (Date.parse(a.fecha) || 0));
    const texto = buscar.trim().toLocaleLowerCase("es-PE");
    const filtradas = ordenadas.filter(
        (fila) =>
            (!tipo || fila.tipo === tipo) &&
            (!estado || estadoBase(fila.estado) === estado) &&
            (!texto ||
                [fila.concepto, fila.descripcion, fila.referencia, fila.colaborador, fila.registradoPor].join(" ").toLocaleLowerCase("es-PE").includes(texto)),
    );
    const totalPages = Math.max(1, Math.ceil(filtradas.length / pageSize));
    const actual = Math.min(page, totalPages);
    const aprobado = (clase: AuditoriaFila["tipo"]) =>
        filas.filter((f) => f.tipo === clase && estadoBase(f.estado) === "APROBADO").reduce((total, f) => total + (f.monto ?? 0), 0);
    const tarjetas = [
        ["Registros", filas.length],
        ["Pendientes", filas.filter((f) => estadoBase(f.estado) === "PENDIENTE").length],
        ["Bonos aprobados", formatoMonto(aprobado("BONO"))],
        ["Penalidades aprobadas", formatoMonto(aprobado("PENALIDAD"))],
    ];
    const limpiar = () => {
        setTipo("");
        setEstado("");
        setBuscar("");
        onMes(hoyLima().slice(0, 7));
    };

    return (
        <div className="min-w-0 space-y-5">
            <CompensacionHeading section="evidencias" title="Auditoría Operaciones" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {tarjetas.map(([title, value]) => (
                    <CompensacionPanel key={title} title={String(title)}>
                        <p className="text-display-xs font-semibold text-primary tabular-nums">{cargando || error ? "—" : value}</p>
                    </CompensacionPanel>
                ))}
            </div>
            {formulario && <CompensacionPanel title={tituloFormulario}>{formulario}</CompensacionPanel>}
            {error && <AlertMessage tone="error">{error}</AlertMessage>}
            <DataTable
                density="compact"
                columns={columns}
                data={filtradas.slice((actual - 1) * pageSize, actual * pageSize) as unknown as Record<string, unknown>[]}
                isLoading={cargando}
                page={actual}
                pageSize={pageSize}
                totalPages={totalPages}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                }}
                emptyMessage="Sin registros de auditoría"
                emptyDescription="Cambia el periodo o los filtros."
                renderActions={(row) => <div className="flex items-center gap-1">{row.acciones as ReactNode}</div>}
                toolbar={
                    <div className="flex flex-wrap items-end gap-2">
                        <Select
                            aria-label="Filtrar por tipo"
                            size="sm"
                            className="w-full sm:w-60"
                            items={tipoItems}
                            selectedKey={tipo}
                            onSelectionChange={(value) => setTipo(String(value ?? ""))}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                        <Input
                            aria-label="Buscar colaborador, DNI u operación"
                            placeholder="Buscar colaborador, DNI u operación"
                            size="sm"
                            className="w-full sm:w-72"
                            value={buscar}
                            onChange={setBuscar}
                        />
                        <Select
                            aria-label="Filtrar por estado"
                            size="sm"
                            className="w-full sm:w-48"
                            items={estadoItems}
                            selectedKey={estado}
                            onSelectionChange={(value) => setEstado(String(value ?? ""))}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                        <MonthPicker hideLabel label="Periodo" allowAllMonths={false} value={mes} onChange={(value) => value && onMes(value)} />
                        <Button size="sm" color="secondary" iconLeading={XClose} onClick={limpiar}>
                            Limpiar
                        </Button>
                    </div>
                }
            />
            {children}
        </div>
    );
};
