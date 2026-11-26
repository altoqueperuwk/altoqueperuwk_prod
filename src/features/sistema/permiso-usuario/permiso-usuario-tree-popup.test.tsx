import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermisoUsuarioTreePopup } from "./permiso-usuario-tree-popup";

const mocks = vi.hoisted(() => ({ menus: vi.fn(), permissions: vi.fn(), assign: vi.fn(), toast: vi.fn(), saved: vi.fn() }));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => ({ businessUser: { id: 20 } }), isAdministrator: () => true, isJefeTienda: () => false }));
vi.mock("@/providers/session-cache-provider", () => ({
    useSessionCache: () => ({
        estados: [
            { id: 1, nombre: "Activo" },
            { id: 2, nombre: "Inactivo" },
        ],
    }),
}));
vi.mock("@/providers/toast-provider", () => ({ useToast: () => ({ addToast: mocks.toast }) }));
vi.mock("@/services/permiso-menu.service", () => ({ permisoMenuService: { getList: mocks.menus } }));
vi.mock("@/services/permiso-usuario.service", () => ({ permisoUsuarioService: { getList: mocks.permissions, assignLote: mocks.assign } }));
const rows = [
    { id: 60, nombre: "Personal", orden: 60 },
    { id: 61, nombre: "Gestión comercial", orden: 61 },
    { id: 70, nombre: "Nombre largo de tiktok", id_padre: 60, ruta: "/compensaciones/otros-bonos/tiktok_live", orden: 1 },
    { id: 71, nombre: "Llamadas", id_padre: 61, ruta: "/compensaciones/llamadas", orden: 1 },
    { id: 72, nombre: "Referidos", id_padre: 61, ruta: "/compensaciones/referidos", orden: 2 },
];
const open = () => render(<PermisoUsuarioTreePopup isOpen user={{ id: 24, nombre: "Asesor QA" }} onClose={() => {}} onSaved={mocks.saved} />);
beforeEach(() => {
    vi.clearAllMocks();
    mocks.menus.mockResolvedValue(rows);
    mocks.permissions.mockResolvedValue([{ id_permiso_menu: 72 }]);
    mocks.assign.mockResolvedValue({});
});
afterEach(cleanup);

describe("Árbol de permisos alineado al menú", () => {
    it("al administrar un asesor excluye rutas ajenas y no guarda contenedores vacíos", async () => {
        mocks.menus.mockResolvedValue([
            ...rows,
            { id: 80, nombre: "Gestión de bonos", orden: 80 },
            { id: 81, nombre: "Configuración", id_padre: 80, ruta: "/compensaciones/configuracion", orden: 1 },
            { id: 82, nombre: "Reportes", id_padre: 80, ruta: "/compensaciones/reportes", orden: 2 },
        ]);
        mocks.permissions.mockResolvedValue([{ id_permiso_menu: 72 }, { id_permiso_menu: 81 }]);
        render(<PermisoUsuarioTreePopup isOpen user={{ id: 24, id_rol: 4, nombre: "Asesor QA" }} onClose={() => {}} onSaved={mocks.saved} />);
        await screen.findByRole("checkbox", { name: "Referidos" });
        expect(screen.queryByRole("checkbox", { name: "Configuración" })).toBeNull();
        expect(screen.queryByRole("checkbox", { name: "Gestión de bonos" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Guardar Permisos" }));
        await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith(24, [72], 20));
    });
    it("muestra categorías reales, etiquetas cortas y consulta únicamente permisos activos", async () => {
        open();
        expect(await screen.findByRole("checkbox", { name: "TikTok Live" })).toBeInTheDocument();
        expect(screen.queryByRole("checkbox", { name: "Compensaciones" })).not.toBeInTheDocument();
        expect(mocks.permissions).toHaveBeenCalledWith({ p_id_usuario: 24, p_id_estado: 1 });
        expect(screen.getByRole("checkbox", { name: "Referidos" })).toBeChecked();
        expect(screen.getByRole("checkbox", { name: "Llamadas" })).not.toBeChecked();
    });
    it("selecciona un grupo y permite revocar una hoja sin guardar IDs de contenedores", async () => {
        open();
        const group = await screen.findByRole("checkbox", { name: "Gestión comercial" });
        fireEvent.click(group);
        expect(screen.getByRole("checkbox", { name: "Llamadas" })).toBeChecked();
        fireEvent.click(screen.getByRole("checkbox", { name: "Referidos" }));
        fireEvent.click(screen.getByRole("button", { name: "Guardar Permisos" }));
        await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith(24, [71], 20));
        expect(mocks.saved).toHaveBeenCalledTimes(1);
    });
    it("impide guardar si falla la carga y evita borrar accesos accidentalmente", async () => {
        mocks.menus.mockRejectedValue(new Error("Sin conexión"));
        open();
        await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("error", "No se pudieron cargar los permisos del usuario"));
        expect(screen.getByRole("button", { name: "Guardar Permisos" })).toBeDisabled();
        expect(mocks.assign).not.toHaveBeenCalled();
    });
});
