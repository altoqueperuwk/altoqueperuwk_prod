// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { cajaOperativaService } from "@/services/caja-operativa.service";
import { Edit03, Route, Settings01 } from "@untitledui/icons";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { CajaOperativaPopup } from "./caja-operativa-popup";
import { CajaOperativaRutaModal } from "./caja-operativa-ruta-modal";

const matchesText = (row: Record<string, unknown>, text: string) => {
    const needle = text.trim().toLowerCase();
    if (!needle) return true;

    return [row.nombre_empresa, row.nombre_banco, row.nombre_estado, row.rutas_asociadas]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
};

export const CajaOperativaPage = () => {
    const { addToast } = useToast();
    const { bancos, empresas } = useSessionCache();
    const [data, setData] = useState<Record<string, unknown>[]>([]);
    const [allCajaItems, setAllCajaItems] = useState<Record<string, unknown>[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [filterNombre, setFilterNombre] = useState("");
    const [filterEstado, setFilterEstado] = useState(0);
    const [filterEmpresa, setFilterEmpresa] = useState(0);
    const [filterBanco, setFilterBanco] = useState(0);
    const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);
    const [rutaItem, setRutaItem] = useState<Record<string, unknown> | null>(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [isRutaModalOpen, setIsRutaModalOpen] = useState(false);

    const empresaItems = useMemo(
        () => [{ id: 0, label: "Todas" }, ...(empresas || []).map((e) => ({ id: e.id as number, label: e.nombre as string }))],
        [empresas],
    );

    const bancoItems = useMemo(
        () => [{ id: 0, label: "Todos" }, ...(bancos || []).map((b) => ({ id: b.id as number, label: b.nombre as string }))],
        [bancos],
    );

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await cajaOperativaService.getList({});
            const withRutas = await Promise.all(
                result.map(async (row) => {
                    const rutas = await cajaOperativaService.getRutas({
                        p_id_empresa: row.id_empresa,
                        p_id_empresa_cuenta_bancaria: row.id_empresa_cuenta_bancaria,
                    });
                    const labels = rutas.map((ruta) => {
                        const label = getRutaLabel(ruta.ruta as never);
                        return ruta.flag_caja_ingreso_principal ? `${label} principal` : label;
                    });

                    return {
                        ...row,
                        rutas_count: rutas.length,
                        rutas_asociadas: labels.join(", "),
                    };
                }),
            );

            setAllCajaItems(withRutas);

            const filtered = withRutas.filter((row) => {
                const byBanco = !filterBanco || Number(row.id_banco) === filterBanco;
                const byEmpresa = !filterEmpresa || Number(row.id_empresa) === filterEmpresa;
                const byEstado = !filterEstado || Number(row.id_estado) === filterEstado;
                return byBanco && byEmpresa && byEstado && matchesText(row, filterNombre);
            });

            setData(filtered);
            setTotalPages(Math.max(1, Math.ceil(filtered.length / pageSize)));
            if (page > Math.ceil(filtered.length / pageSize)) setPage(1);
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "Error al cargar cajas operativas");
        } finally {
            setIsLoading(false);
        }
    }, [addToast, filterBanco, filterEmpresa, filterEstado, filterNombre, page, pageSize]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleClear = () => {
        setFilterNombre("");
        setFilterEstado(0);
        setFilterEmpresa(0);
        setFilterBanco(0);
        setPage(1);
    };

    const handleNew = () => {
        setSelectedItem(null);
        setIsPopupOpen(true);
    };

    const handleEdit = (item: Record<string, unknown>) => {
        setSelectedItem(item);
        setIsPopupOpen(true);
    };

    const handleRutas = (item: Record<string, unknown>) => {
        setRutaItem(item);
        setIsRutaModalOpen(true);
    };

    const handlePopupSave = () => {
        setIsPopupOpen(false);
        setSelectedItem(null);
        loadData();
    };

    const handleSaveEstado = async (rowId: number, newIdEstado: number) => {
        await cajaOperativaService.update(rowId, { p_id_estado: newIdEstado });
        loadData();
    };

    const paginatedData = data.slice((page - 1) * pageSize, page * pageSize);

    const columns: ColumnDef[] = [
        { key: "nombre_empresa", header: "Empresa" },
        { key: "nombre_banco", header: "Banco / Cuenta bancaria" },
        { key: "saldo_inicial", header: "Saldo Inicial", render: (value) => formatMoney(Number(value ?? 0)) },
        { key: "saldo_actual", header: "Saldo Actual", render: (value) => formatMoney(Number(value ?? 0)) },
        {
            key: "rutas_asociadas",
            header: "Rutas Asociadas",
            render: (value, row) => (
                <Button size="xs" color="link-color" iconLeading={Route} onClick={() => handleRutas(row)}>
                    {value ? String(value) : "Configurar"}
                </Button>
            ),
        },
        {
            key: "fecha_apertura",
            header: "Fecha Apertura",
            render: (value) => (value ? new Date(String(value)).toLocaleDateString("es-PE") : "-"),
        },
    ];

    return (
        <AppLayout>
            <div className="flex flex-col gap-6">
                <FilterBar
                    title="Caja Operativa"
                    filterNombre={filterNombre}
                    onFilterNombreChange={setFilterNombre}
                    filterEstado={filterEstado}
                    onFilterEstadoChange={setFilterEstado}
                    onSearch={() => {
                        setPage(1);
                        loadData();
                    }}
                    onClear={handleClear}
                    onNew={handleNew}
                    extraFilters={
                        <>
                            <div className="w-52">
                                <Select
                                    label="Empresa"
                                    placeholder="Todas"
                                    size="sm"
                                    items={empresaItems}
                                    selectedKey={filterEmpresa}
                                    onSelectionChange={(key) => setFilterEmpresa(key !== null ? Number(key) : 0)}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                            </div>
                            <div className="w-44">
                                <Select
                                    label="Banco"
                                    placeholder="Todos"
                                    size="sm"
                                    items={bancoItems}
                                    selectedKey={filterBanco}
                                    onSelectionChange={(key) => setFilterBanco(key !== null ? Number(key) : 0)}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                            </div>
                        </>
                    }
                />

                <DataTable
                    columns={columns}
                    data={paginatedData}
                    isLoading={isLoading}
                    page={page}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                        setPageSize(size);
                        setPage(1);
                    }}
                    inlineEstado={{
                        idEstadoKey: "id_estado",
                        onSave: handleSaveEstado,
                    }}
                    emptyMessage="No se encontraron cajas operativas"
                    emptyDescription="Cree una caja inicial para preparar pruebas de Operaciones."
                    renderActions={(row) => (
                        <>
                            <Button size="xs" color="tertiary" iconLeading={Edit03} onClick={() => handleEdit(row)} />
                            <Button size="xs" color="tertiary" iconLeading={Settings01} onClick={() => handleRutas(row)} />
                        </>
                    )}
                />

                <CajaOperativaPopup
                    existingItems={allCajaItems}
                    isOpen={isPopupOpen}
                    item={selectedItem}
                    onClose={() => {
                        setIsPopupOpen(false);
                        setSelectedItem(null);
                    }}
                    onSave={handlePopupSave}
                />
                <CajaOperativaRutaModal
                    isOpen={isRutaModalOpen}
                    caja={rutaItem}
                    onClose={() => {
                        setIsRutaModalOpen(false);
                        setRutaItem(null);
                    }}
                    onSave={() => {
                        setIsRutaModalOpen(false);
                        setRutaItem(null);
                        loadData();
                    }}
                />
            </div>
        </AppLayout>
    );
};
