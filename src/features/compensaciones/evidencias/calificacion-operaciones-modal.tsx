import { useEffect, useRef, useState } from "react";
import { RefreshCw01, Save01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { type ColumnDef } from "@/components/shared/data-table";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { CompensacionDialogFooter } from "../shared/compensacion-dialog-chrome";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { type CalificacionOperaciones, calificacionOperacionesService } from "./calificacion-operaciones.service";
import type { EvidenciaEvento } from "./evidencias.types";

const message = (cause: unknown) =>
    cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudieron cargar las operaciones";
export const CalificacionOperacionesModal = ({ item, onClose, onSaved }: { item: EvidenciaEvento; onClose: () => void; onSaved: () => void }) => {
    const [data, setData] = useState<CalificacionOperaciones | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [busy, setBusy] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(20);
    const lock = useRef(false);
    const contextVersion = useRef(0);
    const notify = useAlert();
    useEffect(() => {
        ++contextVersion.current;
        let active = true;
        setBusy(true);
        setError("");
        setData(null);
        setSelected(new Set());
        setPage(1);
        void calificacionOperacionesService
            .list(item.id)
            .then((result) => {
                if (!active) return;
                setData(result);
                setSelected(new Set(result.items.filter((row) => row.vinculada).map((row) => row.id)));
            })
            .catch((cause) => {
                if (active) setError(message(cause));
            })
            .finally(() => {
                if (active) setBusy(false);
            });
        return () => {
            active = false;
            ++contextVersion.current;
        };
    }, [item.id, retry]);
    const editable = data?.puede_guardar && !data.guardadas;
    const save = async () => {
        if (!editable || busy || !selected.size || lock.current) return;
        const version = contextVersion.current;
        lock.current = true;
        setSaving(true);
        setError("");
        try {
            await calificacionOperacionesService.save(item.id, [...selected], "");
            if (version !== contextVersion.current) return;
            notify("success", "Operaciones guardadas en la calificación.");
            onSaved();
        } catch (cause) {
            if (version === contextVersion.current) setError(message(cause));
        } finally {
            lock.current = false;
            setSaving(false);
        }
    };
    const columns: ColumnDef[] = [
        ...(editable
            ? [
                  {
                      key: "seleccion",
                      header: (
                          <Checkbox
                              aria-label="Seleccionar todas las operaciones"
                              isSelected={!!data?.items.length && selected.size === data.items.length}
                              isIndeterminate={selected.size > 0 && selected.size < (data?.items.length ?? 0)}
                              isDisabled={saving || !data?.items.length}
                              onChange={(checked) => setSelected(new Set(checked ? data?.items.map((row) => row.id) : []))}
                          />
                      ),
                      render: (_v: unknown, row: Record<string, unknown>) => (
                          <Checkbox
                              aria-label={`Seleccionar operación ${row.codigo || row.id}`}
                              isSelected={selected.has(Number(row.id))}
                              isDisabled={saving}
                              onChange={(checked) =>
                                  setSelected((previous) => {
                                      const next = new Set(previous);
                                      if (checked) next.add(Number(row.id));
                                      else next.delete(Number(row.id));
                                      return next;
                                  })
                              }
                          />
                      ),
                  },
              ]
            : []),
        { key: "dni", header: "DNI", render: (value) => <span className="whitespace-nowrap tabular-nums">{String(value || "—")}</span> },
        { key: "cliente", header: "Cliente" },
        { key: "servicio", header: "Servicio" },
        { key: "codigo", header: "Código" },
        { key: "fecha", header: "Fecha", render: (value) => <CompensacionFechaCell value={value} /> },
        {
            key: "monto",
            header: "Monto efectivizado",
            render: (value) => (
                <span className="font-semibold whitespace-nowrap text-success-primary tabular-nums">
                    {new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(value ?? 0))}
                </span>
            ),
        },
        {
            key: "estado",
            header: data?.guardadas ? "Estado al Vincular" : "Estado",
            render: (value, row) => (
                <CompensacionEstado dominio="operacion" valor={value} detalle={row.paso === 4 ? `${String(value)} · Paso 4` : String(value ?? "")} />
            ),
        },
    ];
    return (
        <CompensacionSurface title="Operaciones del Cliente" onClose={onClose} busy={saving}>
            <div className="flex w-full flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title={<>{data?.guardadas ? "Operaciones Vinculadas" : "Agregar Operaciones"}</>} onClose={onClose} busy={saving}>
                    <p className="text-xs text-tertiary">
                        DNI: {data?.dni ?? String(item.datos.cliente_documento ?? "—")}. Efectivización pagada y Pago Deuda con paso 4 completado.
                    </p>
                </CompensacionDialogHeader>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 [&_table]:min-w-[48rem]">
                    {error && <AlertMessage tone="error">{error}</AlertMessage>}
                    {error && !data && (
                        <Button size="sm" iconLeading={RefreshCw01} onClick={() => setRetry((n) => n + 1)}>
                            Reintentar
                        </Button>
                    )}
                    <DataTable
                        density="compact"
                        columns={columns}
                        data={(data?.items ?? []).slice((page - 1) * size, page * size) as unknown as Record<string, unknown>[]}
                        isLoading={busy}
                        page={page}
                        totalPages={Math.max(1, Math.ceil((data?.items.length ?? 0) / size))}
                        pageSize={size}
                        onPageChange={setPage}
                        onPageSizeChange={(next) => {
                            setSize(next);
                            setPage(1);
                        }}
                        emptyMessage={error ? "Consulta no disponible" : "Sin operaciones disponibles"}
                        emptyDescription="Solo se muestran operaciones del mismo DNI que cumplen las condiciones."
                        toolbar={
                            editable ? (
                                <p className="text-xs text-secondary">
                                    {selected.size} de {data?.items.length ?? 0} seleccionadas. Seleccionar todas incluye todas las páginas.
                                </p>
                            ) : undefined
                        }
                    />
                    {data?.pancake && (
                        <a className="text-xs text-brand-secondary underline" href={data.pancake} target="_blank" rel="noreferrer">
                            Abrir Conversación de Pancake
                        </a>
                    )}
                    <p className="text-xs text-tertiary">Guardar la selección no aprueba la calificación ni modifica su comisión.</p>
                </div>
                {!data?.guardadas && (
                    <CompensacionDialogFooter>
                        <Button size="sm" color="secondary" iconLeading={XClose} isDisabled={saving} onClick={onClose}>
                            Cancelar
                        </Button>
                        {data?.puede_guardar && !data.guardadas && (
                            <Button size="sm" iconLeading={Save01} isDisabled={busy || !selected.size} isLoading={saving} onClick={() => void save()}>
                                Guardar
                            </Button>
                        )}
                    </CompensacionDialogFooter>
                )}
            </div>
        </CompensacionSurface>
    );
};
