import { useCallback, useEffect, useRef, useState } from "react";
import { Building02, CheckCircle, Edit03, Eye, RefreshCw01, Users01, XCircle, XClose } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AlertMessage, useAlert, withAlertProvider } from "@/components/shared/alert-center";
import { type ColumnDef } from "@/components/shared/data-table";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { CompensacionFiltros } from "@/features/compensaciones/shared/compensacion-filtros";
import { useSessionCache } from "@/providers/session-cache-provider";
import { sucursalService } from "@/services/sucursal.service";
import { getCoreEstadoItems } from "@/utils/estado-options";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { ColaboradorCard } from "./colaborador-card";
import { ColaboradorFichaPopup } from "./colaborador-ficha-popup";
import { ColaboradorPopup } from "./colaborador-popup";
import { colaboradoresService } from "./colaboradores.service";
import type { CatalogItem, Colaborador, ColaboradoresResult } from "./colaboradores.types";

interface AppliedFilters {
    search: string;
    idEstado: number;
    idSucursal: number;
    idCargo: number;
    fechaReferencia?: string;
}

const limaToday = () => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    return ["year", "month", "day"].map((key) => parts.find((part) => part.type === key)?.value).join("-");
};
export const ColaboradoresPage = withAlertProvider(() => {
    const profile = useCompensacionPerfil();
    if (profile.isResolving)
        return (
            <AppLayout>
                <p role="status">Verificando acceso a Colaboradores…</p>
            </AppLayout>
        );
    return <ColaboradoresContent key={`${profile.userId}:${profile.isStoreManager}:${profile.isAdvisor}`} />;
});
const ColaboradoresContent = () => {
    const { isAdvisor, isStoreManager, isResolving, isAdministrator } = useCompensacionPerfil();
    const notify = useAlert();
    const { estados } = useSessionCache();
    const [data, setData] = useState<Colaborador[]>([]);
    const [resumen, setResumen] = useState<ColaboradoresResult["resumen"]>(null);
    const [loadError, setLoadError] = useState("");
    const [catalogError, setCatalogError] = useState("");
    const [catalogRevision, setCatalogRevision] = useState(0);
    const [catalogsLoading, setCatalogsLoading] = useState(true);
    const [puedeCrear, setPuedeCrear] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalPages, setTotalPages] = useState(1);
    const [filterNombre, setFilterNombre] = useState("");
    const [filterEstado, setFilterEstado] = useState(0);
    const [filterSucursal, setFilterSucursal] = useState(0);
    const [filterCargo, setFilterCargo] = useState(0);
    const [referenceDate, setReferenceDate] = useState(limaToday);
    const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>({
        search: "",
        idEstado: 0,
        idSucursal: 0,
        idCargo: 0,
        ...(!isAdvisor ? { fechaReferencia: referenceDate } : {}),
    });
    const [cargos, setCargos] = useState<CatalogItem[]>([]);
    const [planes, setPlanes] = useState<CatalogItem[]>([]);
    const [sucursales, setSucursales] = useState<CatalogItem[]>([]);
    const [selectedItem, setSelectedItem] = useState<Colaborador | null>(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [detailItem, setDetailItem] = useState<Colaborador | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const requestVersion = useRef(0);

    const loadData = useCallback(async () => {
        if (isResolving) return;
        const version = ++requestVersion.current;
        setIsLoading(true);
        setLoadError("");
        setResumen(null);
        try {
            const result = await colaboradoresService.getList({
                search: appliedFilters.search,
                idEstado: appliedFilters.idEstado,
                idSucursal: appliedFilters.idSucursal,
                idCargo: appliedFilters.idCargo,
                page,
                pageSize,
                ...(appliedFilters.fechaReferencia ? { fechaReferencia: appliedFilters.fechaReferencia } : {}),
            });
            if (version !== requestVersion.current) return;
            setData(result.items);
            setResumen(result.resumen);
            setTotalPages(Math.max(1, result.totalPages));
            setPuedeCrear(!isAdvisor && !isStoreManager && result.puedeCrear);
        } catch (error) {
            if (version !== requestVersion.current) return;
            setPuedeCrear(false);
            setData([]);
            setResumen(null);
            setLoadError(error instanceof Error ? error.message : "No fue posible cargar los colaboradores");
            setTotalPages(1);
            notify("error", error instanceof Error ? error.message : "No fue posible cargar los colaboradores");
        } finally {
            if (version === requestVersion.current) setIsLoading(false);
        }
    }, [notify, appliedFilters, page, pageSize, isAdvisor, isResolving, isStoreManager]);

    useEffect(() => {
        void loadData();
        return () => {
            requestVersion.current += 1;
        };
    }, [loadData]);

    useEffect(() => {
        if (isAdvisor || isStoreManager || isResolving) return;
        let cancelled = false;
        setCatalogsLoading(true);
        setCatalogError("");
        (isAdministrator
            ? colaboradoresService.getAdminCatalogs().then((catalogs) => [catalogs, catalogs.sedes] as const)
            : Promise.all([colaboradoresService.getCatalogs(), sucursalService.getList()])
        )
            .then(([catalogs, branchData]) => {
                if (cancelled) return;
                setCargos(catalogs.cargos);
                setPlanes(catalogs.planes);
                setSucursales(branchData.map((item) => ({ id: Number(item.id), nombre: String(item.nombre ?? "") })));
            })
            .catch((error: unknown) => {
                if (!cancelled) setCatalogError(error instanceof Error ? error.message : "No se pudieron cargar los catálogos laborales (SQL95).");
            })
            .finally(() => {
                if (!cancelled) setCatalogsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [notify, isAdvisor, isStoreManager, isResolving, isAdministrator, catalogRevision]);

    const handleClear = () => {
        const today = limaToday();
        setReferenceDate(today);
        setFilterNombre("");
        setFilterEstado(0);
        setFilterSucursal(0);
        setFilterCargo(0);
        setPage(1);
        setAppliedFilters({ search: "", idEstado: 0, idSucursal: 0, idCargo: 0, ...(!isAdvisor ? { fechaReferencia: today } : {}) });
    };
    useEffect(() => {
        if (isAdvisor || isResolving) return;
        const nextFilters: AppliedFilters = {
            search: filterNombre.trim(),
            idEstado: filterEstado,
            idSucursal: filterSucursal,
            idCargo: filterCargo,
            ...(!isAdvisor ? { fechaReferencia: referenceDate } : {}),
        };
        const same = Object.keys(nextFilters).every((key) => nextFilters[key as keyof AppliedFilters] === appliedFilters[key as keyof AppliedFilters]);
        if (same) return;
        const timer = setTimeout(() => {
            setPage(1);
            setAppliedFilters(nextFilters);
        }, 350);
        return () => clearTimeout(timer);
    }, [appliedFilters, filterCargo, filterEstado, filterNombre, filterSucursal, isAdvisor, isResolving, referenceDate]);
    const handleEdit = (item: Colaborador) => {
        if (isAdvisor || isStoreManager || isResolving || !item.ficha?.permisos.puedeEditarFicha) return;
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
    const [newFormRevision, setNewFormRevision] = useState(0);
    const columns: ColumnDef[] = [
        { key: "numeroDocumento", header: "DNI", render: (value) => <span className="whitespace-nowrap tabular-nums">{String(value)}</span> },
        {
            key: "nombreCompleto",
            header: "Colaborador",
            render: (value) => {
                const nombre = String(value || "").trim();
                return (
                    <span className="font-medium break-words text-primary" title={nombre}>
                        {nombre || "Sin nombre"}
                    </span>
                );
            },
        },
        {
            key: "cargo",
            header: "Cargo",
            render: (_, row) => {
                const asignacion = data.find((item) => item.id === Number(row.id))?.asignacion;
                return <span className="text-secondary">{asignacion?.cargoNombre || "Sin asignación"}</span>;
            },
        },
        {
            key: "sede",
            header: "Sede",
            render: (_, row) => {
                const asignacion = data.find((item) => item.id === Number(row.id))?.asignacion;
                return <span className="text-secondary">{asignacion?.sucursalNombre || "Sin sede"}</span>;
            },
        },
        {
            key: "estadoNombre",
            header: "Estado",
            render: (value) => <CompensacionEstado dominio="personal" valor={value} />,
        },
        ...(!isAdvisor
            ? [
                  {
                      key: "vigencia",
                      header: "Vigencia Laboral",
                      render: (_: unknown, row: Record<string, unknown>) => {
                          const assignment = data.find((item) => item.id === Number(row.id))?.asignacion;
                          const day = (value: string) => value.slice(0, 10).split("-").reverse().join("/");
                          return (
                              <span className="whitespace-nowrap">
                                  {assignment
                                      ? `${day(assignment.fechaInicio)} · ${assignment.fechaFin ? day(assignment.fechaFin) : "Sin fecha de fin"}`
                                      : "Sin asignación"}
                              </span>
                          );
                      },
                  },
              ]
            : []),
    ];
    return (
        <AppLayout>
            <div className="flex min-w-0 flex-col gap-4">
                <CompensacionHeading section="colaboradores" title={isAdvisor ? "Mi ficha" : "Colaboradores"} />
                {!isAdvisor && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy={isLoading}>
                        {[
                            { title: "Colaboradores", value: resumen?.colaboradores, icon: Users01, tone: "text-primary" },
                            { title: "Activos", value: resumen?.activos, icon: CheckCircle, tone: "text-success-primary" },
                            { title: "Inactivos", value: resumen?.inactivos, icon: XCircle, tone: "text-warning-primary" },
                            { title: "Sedes", value: resumen?.sedes, icon: Building02, tone: "text-brand-secondary" },
                        ].map(({ title, value, icon: Icon, tone }) => (
                            <CompensacionPanel key={title} title={title} trailing={<Icon className={`size-5 ${tone}`} />}>
                                <p className={`text-display-xs font-semibold tabular-nums ${tone}`}>{value == null ? "—" : value}</p>
                            </CompensacionPanel>
                        ))}
                    </div>
                )}
                {catalogError && (
                    <div className="flex flex-wrap items-center gap-2">
                        <AlertMessage tone="error">{catalogError}</AlertMessage>
                        <Button size="sm" color="primary" iconLeading={RefreshCw01} onClick={() => setCatalogRevision((value) => value + 1)}>
                            Reintentar Catálogos
                        </Button>
                    </div>
                )}
                {loadError && <AlertMessage tone="error">{loadError}</AlertMessage>}
                {!isAdvisor && !isResolving && puedeCrear && !catalogsLoading && !catalogError && (
                    <ColaboradorPopup
                        key={newFormRevision}
                        inline
                        isOpen
                        item={null}
                        onClose={() => setNewFormRevision((value) => value + 1)}
                        onSave={() => {
                            setNewFormRevision((value) => value + 1);
                            void loadData();
                        }}
                        cargos={cargos}
                        planes={planes}
                        sucursales={sucursales}
                    />
                )}

                {isAdvisor ? (
                    <section className="overflow-hidden rounded-2xl border border-secondary bg-primary">
                        <div aria-busy={isLoading} className="mx-auto grid w-full max-w-3xl gap-4 p-4">
                            {isLoading ? (
                                <p role="status" className="py-16 text-center text-sm text-tertiary">
                                    Cargando mi ficha…
                                </p>
                            ) : loadError ? (
                                <p className="py-16 text-center text-sm text-tertiary">Ficha no disponible.</p>
                            ) : data.length === 0 ? (
                                <p className="py-16 text-center text-sm text-tertiary">Tu ficha aún no está disponible.</p>
                            ) : (
                                data.map((item) => (
                                    <ColaboradorCard key={item.id} item={item} onDetail={() => handleDetail(item)} onEdit={() => handleEdit(item)} />
                                ))
                            )}
                        </div>
                    </section>
                ) : (
                    <>
                        <DataTable
                            columns={columns}
                            data={data as unknown as Record<string, unknown>[]}
                            density="compact"
                            isLoading={isLoading}
                            page={page}
                            totalPages={totalPages}
                            pageSize={pageSize}
                            onPageChange={setPage}
                            onPageSizeChange={(size) => {
                                setPageSize(size);
                                setPage(1);
                            }}
                            emptyMessage={loadError ? "Consulta no disponible" : "No se encontraron colaboradores"}
                            emptyDescription={
                                isStoreManager
                                    ? "Revisa la fecha y los filtros. Administración debe asignar explícitamente tu equipo; compartir sede no concede acceso."
                                    : "Prueba otra búsqueda o limpia los filtros."
                            }
                            renderActions={(row) => {
                                const item = data.find((item) => item.id === Number(row.id));
                                if (!item) return null;
                                if (!isStoreManager && !isResolving && item.ficha?.permisos.puedeEditarFicha)
                                    return (
                                        <>
                                            <ButtonUtility
                                                size="xs"
                                                color="tertiary"
                                                icon={Eye}
                                                tooltip="Ver ficha"
                                                aria-label="Ver ficha"
                                                className={compensationTableActionClass}
                                                onClick={() => handleDetail(item)}
                                            />
                                            <ButtonUtility
                                                size="xs"
                                                color="tertiary"
                                                icon={Edit03}
                                                tooltip="Editar colaborador"
                                                aria-label="Editar colaborador"
                                                className={compensationTableActionClass}
                                                onClick={() => handleEdit(item)}
                                            />
                                        </>
                                    );
                                // Paquete K: el Jefe consulta KPIs y tabla de su equipo; no ve la ficha del colaborador.
                                return !isStoreManager && item.ficha?.permisos.puedeVerFicha ? (
                                    <ButtonUtility
                                        size="xs"
                                        color="tertiary"
                                        icon={Eye}
                                        tooltip="Ver ficha"
                                        aria-label="Ver ficha"
                                        className={compensationTableActionClass}
                                        onClick={() => handleDetail(item)}
                                    />
                                ) : null;
                            }}
                            toolbar={
                                <CompensacionFiltros toolbar>
                                    <div className="flex flex-wrap items-end gap-2 [&_label]:whitespace-nowrap">
                                        <div className="w-64">
                                            <Input
                                                aria-label="Nombre o DNI Colaborador"
                                                placeholder="Nombre o DNI Colaborador"
                                                size="sm"
                                                value={filterNombre}
                                                onChange={setFilterNombre}
                                            />
                                        </div>
                                        {
                                            <div className="w-44">
                                                <CompensacionDatePicker hideLabel label="Vigente al" value={referenceDate} onChange={setReferenceDate} />
                                            </div>
                                        }
                                        <div className="w-36">
                                            <Select
                                                aria-label="Estado"
                                                size="sm"
                                                items={[{ id: 0, label: "Todos" }, ...getCoreEstadoItems(estados)]}
                                                selectedKey={filterEstado}
                                                onSelectionChange={(key) => setFilterEstado(Number(key) || 0)}
                                            >
                                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                            </Select>
                                        </div>
                                        {!isStoreManager && (
                                            <>
                                                <div className="w-44">
                                                    <Select
                                                        aria-label="Sede"
                                                        size="sm"
                                                        items={[{ id: 0, label: "Todas" }, ...sucursales.map((item) => ({ id: item.id, label: item.nombre }))]}
                                                        selectedKey={filterSucursal}
                                                        onSelectionChange={(key) => setFilterSucursal(Number(key) || 0)}
                                                    >
                                                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                    </Select>
                                                </div>
                                                <div className="w-56">
                                                    <Select
                                                        aria-label="Cargo"
                                                        size="sm"
                                                        items={[{ id: 0, label: "Todos" }, ...cargos.map((item) => ({ id: item.id, label: item.nombre }))]}
                                                        selectedKey={filterCargo}
                                                        onSelectionChange={(key) => setFilterCargo(Number(key) || 0)}
                                                    >
                                                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                    </Select>
                                                </div>
                                            </>
                                        )}
                                        <Button size="sm" color="secondary" iconLeading={XClose} isDisabled={isLoading} onClick={handleClear}>
                                            Limpiar
                                        </Button>
                                    </div>
                                </CompensacionFiltros>
                            }
                        />
                    </>
                )}

                <ColaboradorPopup
                    isOpen={isPopupOpen && selectedItem !== null && !catalogsLoading && !catalogError}
                    onClose={() => {
                        setIsPopupOpen(false);
                        setSelectedItem(null);
                    }}
                    onSave={handleSaved}
                    item={selectedItem}
                    cargos={cargos}
                    planes={planes}
                    sucursales={sucursales}
                />
                {!isStoreManager && (
                    <ColaboradorFichaPopup
                        fechaReferencia={appliedFilters.fechaReferencia}
                        isOpen={isDetailOpen}
                        onClose={() => {
                            setIsDetailOpen(false);
                            setDetailItem(null);
                        }}
                        colaborador={detailItem ? (data.find((item) => item.id === detailItem.id) ?? detailItem) : null}
                    />
                )}
            </div>
        </AppLayout>
    );
};
