import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchLg } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AppLayout } from "@/components/application/app-layout";
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { useOperationalReminders } from "@/providers/operational-reminders-provider";
import { useToast } from "@/providers/toast-provider";
import { recordatoriosOperativosService } from "./recordatorios-operativos.service";
import type { RecordatorioItem, RecordatorioVista } from "./recordatorios-operativos.types";

const LEVEL_ITEMS = [{ id: "all", label: "Todos los niveles" }, { id: 1, label: "Recordatorio" }, { id: 2, label: "Importante" }, { id: 3, label: "Urgente" }];
const SERVICE_ITEMS = [{ id: "all", label: "Todos los servicios" }, { id: "EFECTIVIZACION", label: "Efectivización" }, { id: "PAGO_DEUDA", label: "Pago Deuda" }, { id: "POS", label: "POS" }, { id: "LINK_PAGO", label: "Link Pago" }];
const moneyFormatter = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const dateFormatter = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" });

const levelBadge = (level: number) => {
    if (level === 3) return <Badge size="sm" color="error">Urgente</Badge>;
    if (level === 2) return <Badge size="sm" color="warning">Importante</Badge>;
    return <Badge size="sm" color="brand">Recordatorio</Badge>;
};

export const BandejaPage = () => {
    const { addToast } = useToast();
    const { resumen, refresh: refreshSummary } = useOperationalReminders();
    const [vista, setVista] = useState<RecordatorioVista>("PENDIENTES");
    const [nivel, setNivel] = useState<string | number>("all");
    const [servicio, setServicio] = useState<string | number>("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [items, setItems] = useState<RecordatorioItem[]>([]);
    const [totalPages, setTotalPages] = useState(0);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await recordatoriosOperativosService.getBandeja({
                vista,
                nivel: nivel === "all" ? null : Number(nivel),
                servicio: servicio === "all" ? null : String(servicio),
                busqueda: search.trim(),
                pagina: page,
                tamanoPagina: pageSize,
            });
            setItems(result.items);
            setTotal(result.total);
            setTotalPages(result.totalPaginas);
            await refreshSummary();
        } catch (error) {
            setItems([]);
            addToast("error", error instanceof Error ? error.message : "No se pudo cargar la bandeja");
        } finally {
            setIsLoading(false);
        }
    }, [addToast, nivel, page, pageSize, refreshSummary, search, servicio, vista]);

    useEffect(() => { const timeout = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timeout); }, [load]);

    const columns = useMemo<ColumnDef[]>(() => [
        { key: "nivelAlerta", header: "Nivel", render: (value) => levelBadge(Number(value)) },
        { key: "servicio", header: "Servicio", render: (value) => String(value).replaceAll("_", " ") },
        { key: "codigoOperacion", header: "Operación" },
        { key: "dni", header: "DNI" },
        { key: "cliente", header: "Cliente" },
        { key: "sucursal", header: "Sede" },
        { key: "entidad", header: "Banco / entidad" },
        { key: "monto", header: "Monto", render: (value) => <span className="tabular-nums">{moneyFormatter.format(Number(value))}</span> },
        { key: "comentario", header: "Comentario", width: "28%", render: (value) => <span className="block min-w-64 whitespace-normal text-secondary">{String(value)}</span> },
        { key: "fechaUltimoEnvio", header: "Último aviso", render: (value) => value ? dateFormatter.format(new Date(String(value))) : "-" },
    ], []);

    return (
        <AppLayout>
            <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div><h1 className="text-display-xs font-semibold text-primary">Bandeja</h1><p className="mt-1 text-sm text-tertiary">Avisos de operaciones que requieren cierre.</p></div>
                    <div className="flex items-center gap-2"><Badge color="warning">{resumen.activos} pendientes</Badge><Badge color="error">{resumen.nivel3} urgentes</Badge></div>
                </div>

                <section className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
                    <div className="flex flex-wrap gap-3">
                        <div className="flex rounded-lg border border-secondary p-1">
                            <Button size="sm" color={vista === "PENDIENTES" ? "primary" : "tertiary"} onClick={() => { setVista("PENDIENTES"); setPage(1); }}>Pendientes</Button>
                            <Button size="sm" color={vista === "HISTORIAL" ? "primary" : "tertiary"} onClick={() => { setVista("HISTORIAL"); setPage(1); }}>Historial</Button>
                        </div>
                        <div className="min-w-64 flex-1"><Input size="sm" icon={SearchLg} placeholder="Buscar operación, DNI o cliente" value={search} onChange={(value) => { setSearch(value); setPage(1); }} /></div>
                        <div className="w-48"><Select size="sm" items={LEVEL_ITEMS} selectedKey={nivel} onSelectionChange={(key) => { if (key !== null) { setNivel(key); setPage(1); } }}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select></div>
                        <div className="w-48"><Select size="sm" items={SERVICE_ITEMS} selectedKey={servicio} onSelectionChange={(key) => { if (key !== null) { setServicio(key); setPage(1); } }}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select></div>
                    </div>
                </section>

                <section className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
                    <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-md font-semibold text-primary">{vista === "PENDIENTES" ? "Avisos pendientes" : "Historial de avisos"}</h2><span className="text-sm text-tertiary">{total} registros</span></div>
                    <DataTable
                        columns={columns}
                        data={items as unknown as Record<string, unknown>[]}
                        isLoading={isLoading}
                        page={page}
                        totalPages={totalPages}
                        pageSize={pageSize}
                        onPageChange={setPage}
                        onPageSizeChange={(value) => { setPageSize(value); setPage(1); }}
                        emptyMessage={vista === "PENDIENTES" ? "No tienes avisos pendientes" : "No hay avisos cerrados"}
                        emptyDescription={vista === "PENDIENTES" ? "Los nuevos avisos aparecerán en esta bandeja." : "Los avisos se moverán aquí cuando la operación sea cerrada."}
                    />
                </section>
            </div>
        </AppLayout>
    );
};
