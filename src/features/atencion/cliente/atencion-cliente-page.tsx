// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Download01, Edit03, X } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { useAuth } from "@/providers/auth-provider";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { downloadClientesTemplate, parseClientesExcel } from "./cliente-massive-parser";
import { clienteService } from "@/services/cliente.service";
import { getCoreEstadoItems } from "@/utils/estado-options";
import { ClienteWhatsappPopup } from "@/features/sistema/cliente/cliente-whatsapp-popup";

const TIPO_DOCUMENTO_OPTIONS = [
    { id: 1, label: "DNI" },
    { id: 2, label: "CE" },
];

const formatInteger = (value: unknown) => new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 }).format(Number(value ?? 0));

const getActivoId = (estadosList: { id: string | number; label: string }[]) => {
    const activo = estadosList.find((e) => e.label.toLowerCase() === "activo");
    return activo ? Number(activo.id) : 0;
};

const KpiCard = ({ label, value }: { label: string; value: unknown }) => (
    <div className="rounded-lg border border-secondary bg-primary px-4 py-3 shadow-xs">
        <p className="text-xs font-medium text-secondary">{label}</p>
        <p className="mt-1 text-xl font-semibold text-primary tabular-nums">{formatInteger(value)}</p>
    </div>
);

export const AtencionClientePage = () => {
    const { addToast } = useToast();
    const { businessUser } = useAuth();
    const { estados, comunidades } = useSessionCache();

    const [data, setData] = useState<Record<string, unknown>[]>([]);
    const [kpi, setKpi] = useState<Record<string, unknown>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const [filterDocumento, setFilterDocumento] = useState("");
    const [filterTipoDocumento, setFilterTipoDocumento] = useState<number>(0);
    const [filterComunidad, setFilterComunidad] = useState<number>(0);
    const [filterWhatsapp, setFilterWhatsapp] = useState("");
    const [filterSinNombre, setFilterSinNombre] = useState(false);
    const [filterSinWhatsapp, setFilterSinWhatsapp] = useState(false);

    const [tipoDocumento, setTipoDocumento] = useState(1);
    const [numeroDocumento, setNumeroDocumento] = useState("");
    const [nombre, setNombre] = useState("");
    const [whatsapp, setWhatsapp] = useState("");
    const [idComunidad, setIdComunidad] = useState(0);
    const [idEstado, setIdEstado] = useState(0);

    const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isBulkLoading, setIsBulkLoading] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
    const [bulkResult, setBulkResult] = useState<Record<string, unknown> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);
    const comunidadItems = useMemo(
        () => (comunidades || []).map((c) => ({ id: c.id as string | number, label: c.nombre as string })),
        [comunidades],
    );

    useEffect(() => {
        setIdEstado(getActivoId(estadoItems));
    }, [estadoItems]);

    const buildFilters = useCallback(() => {
        const filters: Record<string, unknown> = {};
        const documento = filterDocumento.replace(/\D/g, "");
        const whatsappValue = filterWhatsapp.replace(/\D/g, "");
        if (documento) filters.p_numero_documento = documento;
        if (filterTipoDocumento) filters.p_tipo_documento = filterTipoDocumento;
        if (filterComunidad) filters.p_id_comunidad = filterComunidad;
        if (whatsappValue) filters.p_celular = Number(whatsappValue);
        if (filterSinNombre) filters.p_flag_sin_nombre = true;
        if (filterSinWhatsapp) filters.p_flag_sin_celular = true;
        return filters;
    }, [filterDocumento, filterTipoDocumento, filterComunidad, filterWhatsapp, filterSinNombre, filterSinWhatsapp]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const filters = buildFilters();
            const [rows, kpiResult] = await Promise.all([
                clienteService.getList(filters),
                clienteService.getAtencionKpi(filters),
            ]);
            setData(rows);
            setKpi(kpiResult);
            setTotalPages(Math.max(1, Math.ceil(rows.length / pageSize)));
            if (page > Math.ceil(rows.length / pageSize)) setPage(1);
        } catch {
            addToast("error", "Error al cargar clientes");
        } finally {
            setIsLoading(false);
        }
    }, [buildFilters, page, pageSize, addToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleNumeroDocumentoChange = (value: string) => {
        setNumeroDocumento(value.replace(/\D/g, "").slice(0, tipoDocumento === 1 ? 8 : 9));
    };

    const handleWhatsappChange = (value: string) => {
        setWhatsapp(value.replace(/\D/g, "").slice(0, 9));
    };

    const resetForm = () => {
        setTipoDocumento(1);
        setNumeroDocumento("");
        setNombre("");
        setWhatsapp("");
        setIdComunidad(0);
        setIdEstado(getActivoId(estadoItems));
    };

    const handleCreate = async () => {
        const doc = numeroDocumento.replace(/\D/g, "");
        if (!doc) {
            addToast("error", "El numero de documento es obligatorio");
            return;
        }
        if (tipoDocumento === 1 && doc.length !== 8) {
            addToast("error", "El DNI debe tener exactamente 8 digitos");
            return;
        }
        if (tipoDocumento === 2 && doc.length !== 9) {
            addToast("error", "El CE debe tener exactamente 9 digitos");
            return;
        }
        if (!idEstado) {
            addToast("error", "El estado es obligatorio");
            return;
        }

        setIsSaving(true);
        try {
            const params: Record<string, unknown> = {
                p_tipo_documento: tipoDocumento,
                p_numero_documento: doc,
                p_nombre: nombre.trim(),
                p_celular: whatsapp ? Number(whatsapp) : null,
                p_id_estado: idEstado,
            };
            if (idComunidad) params.p_id_comunidad = idComunidad;

            await clienteService.create(params);
            addToast("success", "Cliente creado correctamente");
            resetForm();
            setPage(1);
            await loadData();
        } catch {
            addToast("error", "Error al crear cliente");
        } finally {
            setIsSaving(false);
        }
    };

    const handleClearFilters = () => {
        setFilterDocumento("");
        setFilterTipoDocumento(0);
        setFilterComunidad(0);
        setFilterWhatsapp("");
        setFilterSinNombre(false);
        setFilterSinWhatsapp(false);
        setPage(1);
    };

    const handleBulkFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        setIsBulkLoading(true);
        setBulkResult(null);
        try {
            const rows = await parseClientesExcel(file);
            if (!rows.length) throw new Error("El archivo no contiene filas para procesar.");
            if (rows.length > 10000) throw new Error("La carga no puede superar 10,000 registros.");

            const chunkSize = 1000;
            const totalChunks = Math.ceil(rows.length / chunkSize);
            const aggregate: Record<string, unknown> = {
                filas_procesadas: 0,
                filas_actualizadas: 0,
                filas_omitidas: 0,
                filas_error: 0,
                detalle: [],
            };
            setBulkProgress({ current: 0, total: totalChunks });

            for (let index = 0; index < totalChunks; index += 1) {
                const result = await clienteService.bulkCreate(
                    rows.slice(index * chunkSize, (index + 1) * chunkSize),
                    businessUser?.id ? Number(businessUser.id) : undefined,
                );
                aggregate.filas_procesadas = Number(aggregate.filas_procesadas) + Number(result.filas_procesadas ?? 0);
                aggregate.filas_actualizadas = Number(aggregate.filas_actualizadas) + Number(result.filas_actualizadas ?? 0);
                aggregate.filas_omitidas = Number(aggregate.filas_omitidas) + Number(result.filas_omitidas ?? 0);
                aggregate.filas_error = Number(aggregate.filas_error) + Number(result.filas_error ?? 0);
                aggregate.detalle = [
                    ...(Array.isArray(aggregate.detalle) ? aggregate.detalle : []),
                    ...(Array.isArray(result.detalle) ? result.detalle.map((item: Record<string, unknown>) => ({ ...item, fila: Number(item.fila ?? 0) + index * chunkSize })) : []),
                ];
                setBulkProgress({ current: index + 1, total: totalChunks });
            }

            setBulkResult(aggregate);
            addToast("success", "Carga masiva procesada");
            setPage(1);
            await loadData();
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No se pudo procesar la carga masiva");
        } finally {
            setIsBulkLoading(false);
            setBulkProgress({ current: 0, total: 0 });
        }
    };

    const paginatedData = data.slice((page - 1) * pageSize, page * pageSize);
    const comunidadesKpi = Array.isArray(kpi.comunidades) ? kpi.comunidades : [];

    const columns: ColumnDef[] = [
        { key: "tipo_documento", header: "Tipo Doc.", render: (value: unknown) => (Number(value) === 1 ? "DNI" : "CE") },
        { key: "numero_documento", header: "Nro. Documento" },
        { key: "nombre", header: "Nombre", render: (value: unknown) => value || "-" },
        { key: "celular", header: "Whatsapp", render: (value: unknown) => value ? String(value) : "-" },
        { key: "comunidad_nombre", header: "Comunidad", render: (value: unknown) => value || "-" },
        { key: "estado_nombre", header: "Estado", render: (value: unknown) => value || "-" },
    ];

    return (
        <AppLayout>
            <div className="flex flex-col gap-5">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-semibold text-primary">Clientes</h1>
                        <p className="mt-1 text-sm text-tertiary">Gestion de clientes para atencion al cliente.</p>
                    </div>
                    <Dropdown.Root>
                        <Button size="sm" color="primary" iconTrailing={ChevronDown}>
                            Carga Masiva
                        </Button>
                        <Dropdown.Popover className="w-52">
                            <Dropdown.Menu>
                                <Dropdown.Item id="descarga-formato" icon={Download01} onAction={downloadClientesTemplate}>
                                    Descarga Formato
                                </Dropdown.Item>
                                <Dropdown.Item id="carga-archivo" onAction={() => fileInputRef.current?.click()}>
                                    Carga Archivo
                                </Dropdown.Item>
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown.Root>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={handleBulkFileChange} />
                </div>

                {bulkResult && (
                    <div className="rounded-lg border border-secondary bg-primary p-4 shadow-xs">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-secondary">
                            <span>Procesados: <strong className="tabular-nums text-primary">{bulkResult.filas_procesadas ?? 0}</strong></span>
                            <span>Actualizados: <strong className="tabular-nums text-primary">{bulkResult.filas_actualizadas ?? 0}</strong></span>
                            <span>Omitidos: <strong className="tabular-nums text-primary">{bulkResult.filas_omitidas ?? 0}</strong></span>
                            <span>Errores: <strong className="tabular-nums text-primary">{bulkResult.filas_error ?? 0}</strong></span>
                        </div>
                        {Array.isArray(bulkResult.detalle) && bulkResult.detalle.length > 0 && (
                            <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-secondary bg-secondary px-3 py-2 text-xs text-secondary">
                                {bulkResult.detalle.map((item: Record<string, unknown>, index: number) => (
                                    <p key={`${String(item.fila ?? index)}-${index}`} className="py-0.5">
                                        Fila {String(item.fila ?? index + 1)}: {String(item.motivo ?? item.estado ?? "Procesada")}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {isBulkLoading && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60 backdrop-blur-[3px]" role="dialog" aria-modal="true" aria-label="Procesando carga masiva">
                        <div className="w-full max-w-sm rounded-xl border border-secondary bg-primary p-6 shadow-xl">
                            <h2 className="text-base font-semibold text-primary">Procesando carga masiva</h2>
                            <p className="mt-1 text-sm text-tertiary">Estamos validando los clientes. No cierres esta pantalla.</p>
                            <div className="mt-5 h-2 overflow-hidden rounded-full bg-secondary">
                                <div
                                    className="h-full rounded-full bg-brand-solid transition-all duration-200"
                                    style={{ width: bulkProgress.total ? `${(bulkProgress.current / bulkProgress.total) * 100}%` : "0%" }}
                                />
                            </div>
                            <p className="mt-2 text-right text-xs tabular-nums text-tertiary">
                                Lote {bulkProgress.current} de {bulkProgress.total}
                            </p>
                        </div>
                    </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                    <KpiCard label="Total Cliente" value={kpi.total_cliente} />
                    <KpiCard label="Total Sin Nombre" value={kpi.total_sin_nombre} />
                    <KpiCard label="Total Con Whatsapp" value={kpi.total_con_whatsapp} />
                    <KpiCard label="Total Sin Whatsapp" value={kpi.total_sin_whatsapp} />
                    {comunidadesKpi.map((item) => (
                        <KpiCard key={item.id_comunidad ?? item.comunidad_nombre} label={String(item.comunidad_nombre ?? "Comunidad")} value={item.total} />
                    ))}
                </div>

                <div className="rounded-lg border border-secondary bg-primary p-4 shadow-xs">
                    <h2 className="mb-3 text-sm font-semibold text-primary">Nuevo Cliente</h2>
                    <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[120px_180px_minmax(220px,1fr)_180px_180px_150px_auto]">
                        <div>
                            <Select
                                label="Tipo Doc."
                                size="sm"
                                items={TIPO_DOCUMENTO_OPTIONS}
                                selectedKey={tipoDocumento}
                                onSelectionChange={(key) => {
                                    if (key !== null) {
                                        setTipoDocumento(Number(key));
                                        setNumeroDocumento("");
                                    }
                                }}
                            >
                                {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
                            </Select>
                        </div>
                        <Input label="Nro. Documento" placeholder={tipoDocumento === 1 ? "8 digitos" : "9 digitos"} size="sm" value={numeroDocumento} onChange={handleNumeroDocumentoChange} />
                        <Input label="Nombre" placeholder="Ingrese el nombre" size="sm" value={nombre} onChange={(value) => setNombre(value.toUpperCase())} />
                        <Input label="Whatsapp" placeholder="9 digitos" size="sm" value={whatsapp} onChange={handleWhatsappChange} />
                        <Select
                            label="Comunidad"
                            placeholder="Seleccionar"
                            size="sm"
                            items={comunidadItems}
                            selectedKey={idComunidad}
                            onSelectionChange={(key) => {
                                if (key !== null) setIdComunidad(Number(key));
                            }}
                        >
                            {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
                        </Select>
                        <Select
                            label="Estado"
                            placeholder="Seleccionar"
                            size="sm"
                            items={estadoItems}
                            selectedKey={idEstado}
                            onSelectionChange={(key) => {
                                if (key !== null) setIdEstado(Number(key));
                            }}
                        >
                            {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
                        </Select>
                        <div className="flex items-end gap-2">
                            <Button size="sm" color="secondary" iconLeading={X} title="Cancelar" aria-label="Cancelar" onClick={resetForm}>Cancelar</Button>
                            <Button size="sm" color="primary" iconLeading={Check} title="Guardar" aria-label="Guardar" isLoading={isSaving} onClick={handleCreate}>Guardar</Button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3 rounded-lg border border-secondary bg-primary p-4 shadow-xs">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="w-44">
                            <Select
                                label="Tipo Doc."
                                placeholder="Todos"
                                size="sm"
                                items={[{ id: 0, label: "Todos" }, ...TIPO_DOCUMENTO_OPTIONS]}
                                selectedKey={filterTipoDocumento}
                                onSelectionChange={(key) => {
                                    if (key !== null) setFilterTipoDocumento(Number(key));
                                }}
                            >
                                {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
                            </Select>
                        </div>
                        <div className="w-44">
                            <Input label="Nro. Documento" placeholder="Buscar documento" size="sm" value={filterDocumento} onChange={(value) => setFilterDocumento(value.replace(/\D/g, "").slice(0, 9))} />
                        </div>
                        <div className="w-44">
                            <Select
                                label="Comunidad"
                                placeholder="Todas"
                                size="sm"
                                items={[{ id: 0, label: "Todas" }, ...comunidadItems]}
                                selectedKey={filterComunidad}
                                onSelectionChange={(key) => {
                                    if (key !== null) setFilterComunidad(Number(key));
                                }}
                            >
                                {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
                            </Select>
                        </div>
                        <div className="w-44">
                            <Input label="Whatsapp" placeholder="Buscar Whatsapp" size="sm" value={filterWhatsapp} onChange={(value) => setFilterWhatsapp(value.replace(/\D/g, "").slice(0, 9))} />
                        </div>
                        <Button
                            size="sm"
                            color={filterSinNombre ? "primary" : "secondary"}
                            onClick={() => {
                                setFilterSinNombre((value) => !value);
                                setPage(1);
                            }}
                        >
                            Clientes Sin Nombre
                        </Button>
                        <Button
                            size="sm"
                            color={filterSinWhatsapp ? "primary" : "secondary"}
                            onClick={() => {
                                setFilterSinWhatsapp((value) => !value);
                                setPage(1);
                            }}
                        >
                            Clientes Sin Whatsapp
                        </Button>
                        <Button size="sm" color="secondary" onClick={handleClearFilters}>Limpiar</Button>
                        <Button size="sm" color="primary" onClick={() => { setPage(1); loadData(); }}>Buscar</Button>
                    </div>
                </div>

                <DataTable
                    columns={columns}
                    data={paginatedData}
                    isLoading={isLoading}
                    page={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    pageSize={pageSize}
                    onPageSizeChange={(size) => {
                        setPageSize(size);
                        setPage(1);
                    }}
                    emptyMessage="No se encontraron clientes"
                    emptyDescription="No hay clientes para los filtros seleccionados."
                    renderActions={(row) => (
                        <Button
                            size="xs"
                            color="tertiary"
                            iconLeading={Edit03}
                            onClick={() => {
                                setSelectedItem(row);
                                setIsEditOpen(true);
                            }}
                        />
                    )}
                />

                <ClienteWhatsappPopup
                    isOpen={isEditOpen}
                    onClose={() => {
                        setIsEditOpen(false);
                        setSelectedItem(null);
                    }}
                    onSave={() => {
                        setIsEditOpen(false);
                        setSelectedItem(null);
                        loadData();
                    }}
                    item={selectedItem}
                />
            </div>
        </AppLayout>
    );
};
