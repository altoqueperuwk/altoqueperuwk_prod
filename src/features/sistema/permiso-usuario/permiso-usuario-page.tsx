import { useCallback, useEffect, useState } from "react";
import { Shield01 } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { type ColumnDef, DataTable } from "@/components/shared/data-table";
import { isAdministrator, isJefeTienda, useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { usuarioService } from "@/services/usuario.service";
import { PermisoUsuarioTreePopup } from "./permiso-usuario-tree-popup";

type Usuario = Record<string, unknown>;

export const PermisoUsuarioPage = () => {
    const { addToast } = useToast();
    const { businessUser } = useAuth();
    const canManageBranchUsers = isJefeTienda(businessUser) && !isAdministrator(businessUser);
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [selectedUser, setSelectedUser] = useState<Usuario | null>(null);

    const loadUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await usuarioService.getList();
            setUsuarios(
                canManageBranchUsers
                    ? businessUser?.id_sucursal
                        ? result.filter((user) => Number(user.id_rol) === 4 && Number(user.id_sucursal) === Number(businessUser.id_sucursal))
                        : []
                    : result,
            );
        } catch {
            addToast("error", "Error al cargar los usuarios");
        } finally {
            setIsLoading(false);
        }
    }, [addToast, businessUser?.id_sucursal, canManageBranchUsers]);

    useEffect(() => {
        void loadUsers();
    }, [loadUsers]);

    const totalPages = Math.max(1, Math.ceil(usuarios.length / pageSize));
    const paginatedUsers = usuarios.slice((page - 1) * pageSize, page * pageSize);

    const columns: ColumnDef[] = [
        { key: "usuario_nombre", header: "Usuario" },
        { key: "menu_nombre", header: "Menú" },
        { key: "menu_ruta", header: "Ruta" },
    ];

    const userColumns: ColumnDef[] = [
        { key: "username", header: "DNI" },
        { key: "nombre", header: "Usuario" },
        { key: "email", header: "Email" },
        { key: "rol_nombre", header: "Rol" },
        { key: "nombre_sucursal", header: "Sucursal" },
    ];

    return (
        <AppLayout>
            <div className="flex flex-col gap-6">
                <h1 className="text-xl font-semibold text-primary">Permisos de Usuario</h1>
                <DataTable
                    columns={userColumns}
                    data={paginatedUsers}
                    isLoading={isLoading}
                    page={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    pageSize={pageSize}
                    onPageSizeChange={(size) => {
                        setPageSize(size);
                        setPage(1);
                    }}
                    emptyMessage="No hay usuarios"
                    emptyDescription="No se encontraron usuarios registrados."
                    renderActions={(row) => (
                        <Button size="sm" color="secondary" iconLeading={Shield01} onClick={() => setSelectedUser(row)}>
                            Permisos
                        </Button>
                    )}
                />
                <PermisoUsuarioTreePopup
                    isOpen={selectedUser !== null}
                    user={selectedUser}
                    onClose={() => setSelectedUser(null)}
                    onSaved={() => setSelectedUser(null)}
                />
            </div>
        </AppLayout>
    );
};
