import { useCallback, useEffect, useState } from "react";
import { ClockRewind, Edit03 } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { type ColumnDef, DataTable } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { isAdministrator, useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { rolService } from "@/services/rol.service";
import { sucursalService } from "@/services/sucursal.service";
import { usuarioService } from "@/services/usuario.service";
import { UsuarioHistoryDrawer } from "./usuario-history-drawer";
import { UsuarioPopup } from "./usuario-popup";

export const UsuarioPage = () => {
    const { addToast } = useToast();
    const { businessUser } = useAuth();
    const isJefeTienda = !isAdministrator(businessUser) && Number(businessUser?.id_rol) === 3;
    const [data, setData] = useState<Record<string, unknown>[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [pageSize, setPageSize] = useState<number>(20);
    const [filterNombre, setFilterNombre] = useState("");
    const [filterEstado, setFilterEstado] = useState<number>(0);
    const [filterRol, setFilterRol] = useState<number>(0);
    const [filterSucursal, setFilterSucursal] = useState<number>(0);
    const [roles, setRoles] = useState<Record<string, unknown>[]>([]);
    const [sucursales, setSucursales] = useState<Record<string, unknown>[]>([]);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [historyItemId, setHistoryItemId] = useState<number | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const filters: Record<string, unknown> = {};
            if (filterNombre) filters.p_nombre = filterNombre;
            if (filterEstado) filters.p_id_estado = filterEstado;
            if (isJefeTienda) {
                filters.p_id_rol = 4;
                if (businessUser?.id_sucursal) filters.p_id_sucursal = Number(businessUser.id_sucursal);
            } else {
                if (filterRol) filters.p_id_rol = filterRol;
                if (filterSucursal) filters.p_id_sucursal = filterSucursal;
            }
            const result = await usuarioService.getList(filters);
            const scopedResult = isJefeTienda
                ? businessUser?.id_sucursal
                    ? result.filter((user) => Number(user.id_rol) === 4 && Number(user.id_sucursal) === Number(businessUser.id_sucursal))
                    : []
                : result;
            setData(scopedResult);
            setTotalPages(Math.max(1, Math.ceil(scopedResult.length / pageSize)));
            if (page > Math.ceil(scopedResult.length / pageSize)) setPage(1);
        } catch {
            addToast("error", "Error al cargar los datos");
        } finally {
            setIsLoading(false);
        }
    }, [businessUser?.id_sucursal, filterNombre, filterEstado, filterRol, filterSucursal, isJefeTienda, page, pageSize, addToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);
    useEffect(() => {
        Promise.all([rolService.getList(), sucursalService.getList()])
            .then(([roleData, branchData]) => {
                setRoles(roleData.filter((role) => Number(role.id_estado) === 1));
                setSucursales(branchData.filter((branch) => Number(branch.id_estado) === 1));
            })
            .catch(() => addToast("error", "No se pudieron cargar los filtros de rol y sucursal"));
    }, [addToast]);

    const handleSearch = () => {
        setPage(1);
        loadData();
    };
    const handleClear = () => {
        setFilterNombre("");
        setFilterEstado(0);
        setFilterRol(0);
        setFilterSucursal(0);
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
    const handlePopupClose = () => {
        setIsPopupOpen(false);
        setSelectedItem(null);
    };
    const handlePopupSave = () => {
        handlePopupClose();
        loadData();
    };
    const handleSaveEstado = async (rowId: number, newIdEstado: number) => {
        const row = data.find((item) => Number(item.id) === rowId);
        if (!row) throw new Error("No se encontro el usuario a actualizar");
        await usuarioService.update(rowId, {
            p_username: String(row.username ?? ""),
            p_email: String(row.email ?? ""),
            p_nombre: String(row.nombre ?? ""),
            p_id_rol: Number(row.id_rol),
            p_id_estado: newIdEstado,
            p_id_sucursal: Number(row.id_sucursal),
            p_flag_super_admin: Boolean(row.flag_super_admin),
        });
        loadData();
    };
    const handleHistory = (id: number) => {
        setHistoryItemId(id);
        setIsHistoryOpen(true);
    };
    const handleHistoryClose = () => {
        setIsHistoryOpen(false);
        setHistoryItemId(null);
    };
    const handlePageSizeChange = (size: number) => {
        setPageSize(size);
        setPage(1);
    };
    const paginatedData = data.slice((page - 1) * pageSize, page * pageSize);

    const columns: ColumnDef[] = [
        { key: "username", header: "Usuario" },
        { key: "nombre", header: "Nombre" },
        { key: "email", header: "Email" },
        { key: "rol_nombre", header: "Rol" },
        { key: "nombre_sucursal", header: "Sucursal" },
    ];

    return (
        <AppLayout>
            <div className="flex flex-col gap-6">
                <FilterBar
                    title="Usuarios"
                    filterNombre={filterNombre}
                    onFilterNombreChange={setFilterNombre}
                    filterEstado={filterEstado}
                    onFilterEstadoChange={setFilterEstado}
                    onSearch={handleSearch}
                    onClear={handleClear}
                    onNew={handleNew}
                    extraFilters={
                        !isJefeTienda ? (
                            <>
                                <div className="w-48">
                                    <Select
                                        label="Rol"
                                        placeholder="Todos"
                                        size="sm"
                                        items={[{ id: 0, label: "Todos" }, ...roles.map((role) => ({ id: role.id as number, label: String(role.nombre) }))]}
                                        selectedKey={filterRol}
                                        onSelectionChange={(key) => setFilterRol(key !== null ? Number(key) : 0)}
                                    >
                                        {(role) => <Select.Item id={role.id}>{role.label}</Select.Item>}
                                    </Select>
                                </div>
                                <div className="w-52">
                                    <Select
                                        label="Sucursal"
                                        placeholder="Todas"
                                        size="sm"
                                        items={[
                                            { id: 0, label: "Todas" },
                                            ...sucursales.map((branch) => ({ id: branch.id as number, label: String(branch.nombre) })),
                                        ]}
                                        selectedKey={filterSucursal}
                                        onSelectionChange={(key) => setFilterSucursal(key !== null ? Number(key) : 0)}
                                    >
                                        {(branch) => <Select.Item id={branch.id}>{branch.label}</Select.Item>}
                                    </Select>
                                </div>
                            </>
                        ) : undefined
                    }
                />
                <DataTable
                    columns={columns}
                    data={paginatedData}
                    isLoading={isLoading}
                    page={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    pageSize={pageSize}
                    onPageSizeChange={handlePageSizeChange}
                    inlineEstado={{
                        idEstadoKey: "id_estado",
                        onSave: handleSaveEstado,
                    }}
                    emptyMessage="No se encontraron usuarios"
                    emptyDescription="No hay usuarios registrados con los filtros seleccionados."
                    renderActions={(row) => (
                        <>
                            <Button size="xs" color="tertiary" iconLeading={Edit03} onClick={() => handleEdit(row)} />
                            <Button size="xs" color="tertiary" iconLeading={ClockRewind} onClick={() => handleHistory(row.id as number)} />
                        </>
                    )}
                />
                <UsuarioPopup isOpen={isPopupOpen} onClose={handlePopupClose} onSave={handlePopupSave} item={selectedItem} />
                <UsuarioHistoryDrawer isOpen={isHistoryOpen} onClose={handleHistoryClose} itemId={historyItemId} />
            </div>
        </AppLayout>
    );
};
