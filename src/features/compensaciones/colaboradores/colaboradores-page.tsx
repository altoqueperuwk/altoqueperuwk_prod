import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase02, Edit03, Eye, UserCheck01, Users03 } from "@untitledui/icons";
import { motion } from "motion/react";
import { AppLayout } from "@/components/application/app-layout";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { type ColumnDef, DataTable } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { sucursalService } from "@/services/sucursal.service";
import { ColaboradorDetailDrawer } from "./colaborador-detail-drawer";
import { ColaboradorPopup } from "./colaborador-popup";
import { colaboradoresService } from "./colaboradores.service";
import type { CatalogItem, Colaborador } from "./colaboradores.types";

interface AppliedFilters {
    search: string;
    idEstado: number;
    idSucursal: number;
    idCargo: number;
}

const dateFormatter = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const formatDate = (value: string | null) => (value ? dateFormatter.format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : "—");

export const ColaboradoresPage = () => {
    const { addToast } = useToast();
    const { bancos: sessionBanks } = useSessionCache();
    const [data, setData] = useState<Colaborador[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalPages, setTotalPages] = useState(1);
    const [filterNombre, setFilterNombre] = useState("");
    const [filterEstado, setFilterEstado] = useState(0);
    const [filterSucursal, setFilterSucursal] = useState(0);
    const [filterCargo, setFilterCargo] = useState(0);
    const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>({ search: "", idEstado: 0, idSucursal: 0, idCargo: 0 });
    const [cargos, setCargos] = useState<CatalogItem[]>([]);
    const [jornadas, setJornadas] = useState<CatalogItem[]>([]);
    const [planes, setPlanes] = useState<CatalogItem[]>([]);
    const [sucursales, setSucursales] = useState<CatalogItem[]>([]);
    const [selectedItem, setSelectedItem] = useState<Colaborador | null>(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [detailItem, setDetailItem] = useState<Colaborador | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const bancos = useMemo<CatalogItem[]>(
        () => (sessionBanks ?? []).map((item) => ({ id: Number(item.id), nombre: String(item.nombre ?? "") })),
        [sessionBanks],
    );

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await colaboradoresService.getList({
                search: appliedFilters.search,
                idEstado: appliedFilters.idEstado,
                idSucursal: appliedFilters.idSucursal,
                idCargo: appliedFilters.idCargo,
                page,
                pageSize,
            });
            setData(result.items);
            setTotal(result.total);
            setTotalPages(Math.max(1, result.totalPages));
        } catch (error) {
            setData([]);
            setTotal(0);
            setTotalPages(1);
            addToast("error", error instanceof Error ? error.message : "No fue posible cargar los colaboradores");
        } finally {
            setIsLoading(false);
        }
    }, [addToast, appliedFilters, page, pageSize]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        Promise.all([colaboradoresService.getCatalogs(), sucursalService.getList()])
            .then(([catalogs, branchData]) => {
                setCargos(catalogs.cargos);
                setJornadas(catalogs.jornadas);
                setPlanes(catalogs.planes);
                setSucursales(branchData.map((item) => ({ id: Number(item.id), nombre: String(item.nombre ?? "") })));
            })
            .catch((error: unknown) => addToast("error", error instanceof Error ? error.message : "No se pudieron cargar los catálogos laborales"));
    }, [addToast]);

    const handleSearch = () => {
        setPage(1);
        setAppliedFilters({ search: filterNombre, idEstado: filterEstado, idSucursal: filterSucursal, idCargo: filterCargo });
    };
    const handleClear = () => {
        setFilterNombre("");
        setFilterEstado(0);
        setFilterSucursal(0);
        setFilterCargo(0);
        setPage(1);
        setAppliedFilters({ search: "", idEstado: 0, idSucursal: 0, idCargo: 0 });
    };
    const handleNew = () => {
        setSelectedItem(null);
        setIsPopupOpen(true);
    };
    const handleEdit = (item: Colaborador) => {
        setSelectedItem(item);
        setIsPopupOpen(true);
    };
    const handleDetail = (item: Colaborador) => {
        setDetailItem(item);
        setIsDetailOpen(true);
    };
    const handleSaved = () => {
        setIsPopupOpen(false);
        setSelectedItem(null);
        void loadData();
    };
    const handleSaveStatus = async (id: number, idEstado: number) => {
        await colaboradoresService.updateStatus(id, idEstado);
        await loadData();
    };

    const rows = useMemo<Record<string, unknown>[]>(
        () =>
            data.map((item) => ({
                id: item.id,
                colaborador: item.nombreCompleto,
                documento: `${item.tipoDocumento} ${item.numeroDocumento}`,
                usuario: item.usuarioUsername || "Sin vínculo",
                usuario_nombre: item.usuarioNombre,
                cargo: item.asignacion?.cargoNombre || "Sin asignación",
                sede: item.asignacion?.sucursalNombre || "—",
                jornada: item.asignacion?.jornadaNombre || "—",
                plan: item.asignacion?.planNombre || "—",
                fecha_ingreso: item.fechaIngreso,
                codigo_huellero: item.codigoHuellero || "—",
                id_estado: item.idEstado,
            })),
        [data],
    );

    const columns: ColumnDef[] = [
        {
            key: "colaborador",
            header: "Colaborador",
            render: (value, row) => (
                <div>
                    <p className="font-medium text-primary">{String(value)}</p>
                    <p className="mt-0.5 text-xs text-tertiary">{String(row.documento)}</p>
                </div>
            ),
        },
        {
            key: "usuario",
            header: "Usuario del sistema",
            render: (value, row) => (
                <div>
                    <p className="font-medium text-primary">{String(value)}</p>
                    <p className="mt-0.5 text-xs text-tertiary">{String(row.usuario_nombre || "Sin usuario asociado")}</p>
                </div>
            ),
        },
        {
            key: "cargo",
            header: "Asignación",
            render: (value, row) => (
                <div>
                    <p className="font-medium text-primary">{String(value)}</p>
                    <p className="mt-0.5 text-xs text-tertiary">{String(row.sede)}</p>
                </div>
            ),
        },
        {
            key: "jornada",
            header: "Jornada / Plan",
            render: (value, row) => (
                <div>
                    <p className="text-secondary">{String(value)}</p>
                    <p className="mt-0.5 text-xs text-tertiary">{String(row.plan)}</p>
                </div>
            ),
        },
        { key: "codigo_huellero", header: "Cód. huellero" },
        { key: "fecha_ingreso", header: "Ingreso", render: (value) => formatDate(String(value)) },
    ];

    const activeOnPage = data.filter((item) => item.estadoNombre.toLocaleLowerCase("es-PE") === "activo").length;
    const assignedOnPage = data.filter((item) => item.asignacion !== null).length;

    return (
        <AppLayout>
            <div className="flex flex-col gap-6">
                <div>
                    <p className="text-sm font-medium text-brand-secondary">Compensaciones</p>
                    <p className="mt-1 text-sm text-tertiary">Administra la ficha laboral, asignaciones y cuentas de depósito.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    {[
                        { label: "Colaboradores encontrados", value: total, icon: Users03 },
                        { label: "Activos en esta página", value: activeOnPage, icon: UserCheck01 },
                        { label: "Con asignación vigente", value: assignedOnPage, icon: Briefcase02 },
                    ].map((metric, index) => {
                        const Icon = metric.icon;
                        return (
                            <motion.article
                                key={metric.label}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2, delay: index * 0.04 }}
                                className="flex items-center gap-4 rounded-xl border border-secondary bg-primary p-4 shadow-xs"
                            >
                                <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-fg-quaternary">
                                    <Icon className="size-5" />
                                </span>
                                <div>
                                    <p className="text-xs text-tertiary">{metric.label}</p>
                                    <p className="mt-1 text-xl font-semibold text-primary tabular-nums">{metric.value}</p>
                                </div>
                            </motion.article>
                        );
                    })}
                </div>

                <FilterBar
                    title="Colaboradores"
                    filterNombre={filterNombre}
                    onFilterNombreChange={setFilterNombre}
                    filterEstado={filterEstado}
                    onFilterEstadoChange={setFilterEstado}
                    onSearch={handleSearch}
                    onClear={handleClear}
                    onNew={handleNew}
                    extraFilters={
                        <>
                            <div className="w-52">
                                <Select
                                    label="Sede"
                                    placeholder="Todas"
                                    size="sm"
                                    items={[{ id: 0, label: "Todas" }, ...sucursales.map((item) => ({ id: item.id, label: item.nombre }))]}
                                    selectedKey={filterSucursal}
                                    onSelectionChange={(key) => setFilterSucursal(key !== null ? Number(key) : 0)}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                            </div>
                            <div className="w-52">
                                <Select
                                    label="Cargo"
                                    placeholder="Todos"
                                    size="sm"
                                    items={[{ id: 0, label: "Todos" }, ...cargos.map((item) => ({ id: item.id, label: item.nombre }))]}
                                    selectedKey={filterCargo}
                                    onSelectionChange={(key) => setFilterCargo(key !== null ? Number(key) : 0)}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                            </div>
                        </>
                    }
                />

                <DataTable
                    columns={columns}
                    data={rows}
                    isLoading={isLoading}
                    page={page}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                        setPageSize(size);
                        setPage(1);
                    }}
                    inlineEstado={{ idEstadoKey: "id_estado", onSave: handleSaveStatus }}
                    emptyMessage="No se encontraron colaboradores"
                    emptyDescription="Prueba con otros filtros o registra un nuevo colaborador."
                    renderActions={(row) => {
                        const item = data.find((candidate) => candidate.id === Number(row.id));
                        if (!item) return null;
                        return (
                            <>
                                <Button size="xs" color="tertiary" iconLeading={Eye} aria-label="Ver ficha" onClick={() => handleDetail(item)} />
                                <Button size="xs" color="tertiary" iconLeading={Edit03} aria-label="Editar colaborador" onClick={() => handleEdit(item)} />
                            </>
                        );
                    }}
                />

                <ColaboradorPopup
                    isOpen={isPopupOpen}
                    onClose={() => {
                        setIsPopupOpen(false);
                        setSelectedItem(null);
                    }}
                    onSave={handleSaved}
                    item={selectedItem}
                    cargos={cargos}
                    jornadas={jornadas}
                    planes={planes}
                    sucursales={sucursales}
                />
                <ColaboradorDetailDrawer
                    isOpen={isDetailOpen}
                    onClose={() => {
                        setIsDetailOpen(false);
                        setDetailItem(null);
                    }}
                    onDataChanged={() => void loadData()}
                    colaborador={detailItem}
                    cargos={cargos}
                    jornadas={jornadas}
                    planes={planes}
                    sucursales={sucursales}
                    bancos={bancos}
                />
            </div>
        </AppLayout>
    );
};
