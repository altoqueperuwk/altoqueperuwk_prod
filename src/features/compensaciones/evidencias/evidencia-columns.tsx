import type { ColumnDef } from "@/components/shared/data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { EstrellasCell, NotasCell, PersonaCell, compensationMoney, missingAmountLabel } from "../shared/compensacion-cells";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import type { EvidenciaEvento } from "./evidencias.types";

export const evidenciaRows = (items: EvidenciaEvento[]): Record<string, unknown>[] =>
    items.map((item) => ({
        id: item.id,
        tipo: item.tipoNombre,
        colaborador: item.beneficiarioNombre ?? item.responsableNombre ?? "—",
        documento: item.beneficiarioDocumento,
        sede: item.sucursalOrigenNombre,
        fecha: item.fechaEvento,
        estado: item.estado,
        calificacionValida: item.calificacionValida,
        importe: item.importeAprobado,
        cliente: item.datos.cliente_nombre,
        clienteDni: item.datos.cliente_documento,
        tarjeta: item.datos.tarjeta_ultimos4,
        estrellas: item.datos.estrellas,
        notas: item.descripcion ?? item.titulo,
        registradoPor: item.usuarioRegistraNombre,
    }));

export const evidenciaColumns = (category: string): ColumnDef[] => {
    const client: ColumnDef = {
        key: "cliente",
        header: category === "REFERIDO" ? "Referido" : "Cliente",
        render: (value, row) => (
            <div className="max-w-56">
                <p className="font-medium break-words text-primary" title={String(value ?? "—")}>
                    {String(value ?? "—")}
                </p>
                <p className="text-xs text-tertiary">{String(row.clienteDni ?? "—")}</p>
            </div>
        ),
    };
    const person: ColumnDef = {
        key: "colaborador",
        header: category === "CALIFICACION" ? "Asesor" : "Colaborador",
        render: (value, row) => <PersonaCell name={String(value)} detail={[row.documento, row.sede].filter(Boolean).join(" · ")} />,
    };
    const date: ColumnDef = { key: "fecha", header: "Fecha", render: (value) => <CompensacionFechaCell value={value} /> };
    const notes: ColumnDef = { key: "notas", header: category === "CALIFICACION" ? "Comentario" : "Notas", render: (value) => <NotasCell value={value} /> };
    const status: ColumnDef = {
        key: "estado",
        header: "Estado",
        render: (value) => <CompensacionEstado dominio="registro" valor={value} />,
    };
    const amount: ColumnDef = {
        key: "importe",
        header: "Monto",
        render: (value, row) =>
            value === null || value === undefined ? (
                <span className="text-tertiary">{missingAmountLabel(row.estado)}</span>
            ) : (
                <span className="font-semibold whitespace-nowrap text-success-primary tabular-nums">{compensationMoney.format(Number(value))}</span>
            ),
    };
    const registrar: ColumnDef = { key: "registradoPor", header: "Registrado por", render: (value) => <NotasCell value={value} /> };
    const type: ColumnDef = { key: "tipo", header: "Concepto", render: (value) => <NotasCell value={value} /> };
    if (category === "CALIFICACION")
        return [date, person, client, { key: "estrellas", header: "Estrellas", render: (value) => <EstrellasCell value={value} /> }, notes, status, amount];
    if (category === "LLAMADA")
        return [
            { key: "clienteDni", header: "DNI", render: (value) => <span className="whitespace-nowrap tabular-nums">{String(value ?? "—")}</span> },
            { key: "cliente", header: "Cliente", render: (value) => <NotasCell value={value} /> },
            { ...registrar, render: (value, row) => <PersonaCell name={String(value ?? "—")} detail={String(row.sede ?? "")} /> },
            date,
            { ...amount, header: "Monto" },
            status,
        ];
    if (category === "TARJETA_TERCERO")
        return [
            { key: "clienteDni", header: "DNI", render: (value) => <span className="whitespace-nowrap tabular-nums">{String(value ?? "—")}</span> },
            { key: "cliente", header: "Cliente", render: (value) => <NotasCell value={value} /> },
            {
                key: "tarjeta",
                header: "Tarjeta",
                render: (value) => <span className="whitespace-nowrap tabular-nums">{value ? `•••• ${String(value)}` : "—"}</span>,
            },
            { ...registrar, header: "Registrado por", render: (value, row) => <PersonaCell name={String(value ?? "—")} detail={String(row.sede ?? "")} /> },
            { ...date, header: "Fecha" },
            amount,
            status,
            notes,
        ];
    if (category === "REFERIDO") return [client, person, date, amount, status, notes];
    return [type, person, date, registrar, notes, amount, status];
};
