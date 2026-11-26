import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, SearchLg, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { AlertMessage } from "@/components/shared/alert-center";
import { type ColumnDef } from "@/components/shared/data-table";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionDialogFooter } from "../shared/compensacion-dialog-chrome";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { incidenciasService } from "./incidencias.service";
import type { OperacionCliente } from "./incidencias.types";

const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const message = (cause: unknown) =>
    cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudieron cargar las operaciones";

/** Pop-up con casillas: operaciones recientes del cliente (efectivización y pago de deuda) para sustentar la incidencia. */
export const OperacionesAdjuntarDialog = ({
    document,
    selected,
    onClose,
    onConfirm,
}: {
    document: string;
    selected: OperacionCliente[];
    onClose: () => void;
    onConfirm: (items: OperacionCliente[]) => void;
}) => {
    const [items, setItems] = useState<OperacionCliente[]>([]);
    const [client, setClient] = useState<string | null>(null);
    const [checked, setChecked] = useState<Map<number, OperacionCliente>>(() => new Map(selected.map((item) => [item.id, item])));
    const [code, setCode] = useState("");
    const [query, setQuery] = useState("");
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState("");
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(20);
    const request = useRef(0);

    const load = useCallback(async () => {
        const current = ++request.current;
        setBusy(true);
        setError("");
        try {
            const result = await incidenciasService.getClientOperations(document, query);
            if (current !== request.current) return;
            setItems(result.items);
            setClient(result.cliente);
            setPage(1);
        } catch (cause) {
            if (current === request.current) {
                setItems([]);
                setError(message(cause));
            }
        } finally {
            if (current === request.current) setBusy(false);
        }
    }, [document, query]);
    useEffect(() => {
        void load();
        return () => {
            ++request.current;
        };
    }, [load]);

    const toggle = (item: OperacionCliente, on: boolean) =>
        setChecked((previous) => {
            const next = new Map(previous);
            if (on) next.set(item.id, item);
            else next.delete(item.id);
            return next;
        });
    const columns: ColumnDef[] = [
        {
            key: "seleccion",
            header: "",
            render: (_value, row) => {
                const item = items.find((entry) => entry.id === Number(row.id));
                return item ? (
                    <Checkbox
                        aria-label={`Seleccionar operación ${item.codigo || item.id}`}
                        isSelected={checked.has(item.id)}
                        onChange={(on) => toggle(item, on)}
                    />
                ) : null;
            },
        },
        { key: "tipo", header: "Tipo" },
        { key: "codigo", header: "Operación", render: (value) => <span className="whitespace-nowrap tabular-nums">{String(value || "—")}</span> },
        {
            key: "monto",
            header: "Monto efectivizado",
            align: "right",
            render: (value) =>
                value === null || value === undefined ? (
                    "—"
                ) : (
                    <span className="whitespace-nowrap text-secondary tabular-nums">{money.format(Number(value))}</span>
                ),
        },
        { key: "fecha", header: "Fecha", render: (value) => <CompensacionFechaCell value={value} /> },
    ];
    return (
        <CompensacionSurface title="Adjuntar Operación" onClose={onClose}>
            <div className="flex w-full flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title={<>Adjuntar Operación</>} onClose={onClose}>
                    <p className="text-xs text-tertiary">
                        DNI: {document}
                        {client ? ` · ${client}` : ""}. Efectivización y Pago de Deuda más recientes del cliente.
                    </p>
                </CompensacionDialogHeader>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 [&_table]:min-w-[32rem]">
                    {error && <AlertMessage tone="error">{error}</AlertMessage>}
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="w-full sm:w-56">
                            <Input label="" aria-label="Código de operación" size="sm" placeholder="Código de operación" value={code} onChange={setCode} />
                        </div>
                        <Button size="sm" color="secondary" iconLeading={SearchLg} isDisabled={busy} onClick={() => setQuery(code.trim())}>
                            Buscar
                        </Button>
                        <Button
                            size="sm"
                            color="secondary"
                            iconLeading={XClose}
                            isDisabled={busy}
                            onClick={() => {
                                setCode("");
                                if (query) setQuery("");
                                else void load();
                            }}
                        >
                            Limpiar
                        </Button>
                    </div>
                    <DataTable
                        density="compact"
                        columns={columns}
                        data={items.slice((page - 1) * size, page * size) as unknown as Record<string, unknown>[]}
                        isLoading={busy}
                        page={page}
                        totalPages={Math.max(1, Math.ceil(items.length / size))}
                        pageSize={size}
                        onPageChange={setPage}
                        onPageSizeChange={(next) => {
                            setSize(next);
                            setPage(1);
                        }}
                        emptyMessage={error ? "Consulta no disponible" : "Sin operaciones para este cliente"}
                        emptyDescription="Revisa el DNI o el código de operación."
                        toolbar={<p className="text-xs text-secondary">{checked.size} seleccionada(s). Adjuntar no modifica la operación.</p>}
                    />
                </div>
                <CompensacionDialogFooter>
                    <Button size="sm" color="secondary" iconLeading={XClose} onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button size="sm" iconLeading={CheckCircle} onClick={() => onConfirm([...checked.values()])}>
                        Adjuntar selección
                    </Button>
                </CompensacionDialogFooter>
            </div>
        </CompensacionSurface>
    );
};
