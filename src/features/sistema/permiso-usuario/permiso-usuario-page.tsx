import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { useToast } from "@/providers/toast-provider";
import { Shield01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { usuarioService } from "@/services/usuario.service";
import { PermisoUsuarioTreePopup } from "./permiso-usuario-tree-popup";

type Usuario = Record<string, unknown>;

export const PermisoUsuarioPage = () => {
  const { addToast } = useToast();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedUser, setSelectedUser] = useState<Usuario | null>(null);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      setUsuarios(await usuarioService.getList());
    } catch { addToast("error", "Error al cargar los usuarios"); }
    finally { setIsLoading(false); }
  }, [addToast]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

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
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
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
