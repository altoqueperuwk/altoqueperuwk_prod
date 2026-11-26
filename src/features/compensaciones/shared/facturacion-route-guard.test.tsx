import { cleanup, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import type { BusinessUser } from "@/providers/auth-provider";
import { CompensacionRouteGuard } from "./compensacion-route-guard";

const state = vi.hoisted(() => ({
    actor: { businessUser: null as BusinessUser | null },
    cache: { isLoading: false, navegacion: null as { rutas_permitidas: string[] } | null },
}));
vi.mock("@/providers/auth-provider", () => ({
    useOptionalAuth: () => state.actor,
    isAdministrator: (user: BusinessUser | null) => Number(user?.id_rol) === 1 || user?.flag_super_admin === true,
}));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => state.cache }));

const ProtectedPage = () => {
    const { pathname } = useLocation();
    return (
        <CompensacionRouteGuard>
            <p>Pantalla autorizada: {pathname}</p>
        </CompensacionRouteGuard>
    );
};
const open = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/403" element={<p>Acceso denegado</p>} />
                <Route path="*" element={<ProtectedPage />} />
            </Routes>
        </MemoryRouter>,
    );

beforeEach(() => {
    state.actor.businessUser = { id: "30", email: "", id_rol: 5 };
    state.cache.isLoading = false;
    state.cache.navegacion = { rutas_permitidas: [] };
});
afterEach(cleanup);

describe("Facturación: autorización efectiva de rutas", () => {
    it.each(["resumen", "referidos", "auditoria-operaciones", "indisciplina-colaborador", "otros-bonos/propuesta_innovacion"])(
        "requiere permiso del servidor incluso para %s",
        (route) => {
            open(`/compensaciones/${route}`);
            expect(screen.getByText("Acceso denegado")).toBeVisible();
            expect(screen.queryByText(/Pantalla autorizada/)).toBeNull();
        },
    );

    it("Evidencias queda denegada aunque el servidor la asigne", () => {
        state.cache.navegacion = { rutas_permitidas: ["/compensaciones/evidencias"] };
        open("/compensaciones/evidencias");
        expect(screen.getByText("Acceso denegado")).toBeVisible();
    });

    it("Mis Bonos y Penalidades redirige al Dashboard", () => {
        state.cache.navegacion = { rutas_permitidas: ["/compensaciones/resumen", "/compensaciones/mis-bonos-descuentos"] };
        open("/compensaciones/mis-bonos-descuentos");
        expect(screen.getByText("Pantalla autorizada: /compensaciones/resumen")).toBeVisible();
    });

    it.each(["resumen", "referidos", "auditoria-operaciones", "indisciplina-colaborador", "otros-bonos/propuesta_innovacion"])(
        "abre la pantalla asignada %s",
        (route) => {
            const path = `/compensaciones/${route}`;
            state.cache.navegacion = { rutas_permitidas: [path] };
            open(path);
            expect(screen.getByText(`Pantalla autorizada: ${path}`)).toBeVisible();
        },
    );

    it.each(["configuracion", "liquidaciones", "cierres", "reportes", "otros-bonos/colaborador_mes_atenciones"])(
        "rechaza permisos administrativos antiguos: %s",
        (route) => {
            const path = `/compensaciones/${route}`;
            state.cache.navegacion = { rutas_permitidas: [path] };
            open(path);
            expect(screen.getByText("Acceso denegado")).toBeVisible();
        },
    );

    it.each(["incidencias", "colaboradores"])("las rutas retiradas %s se deniegan aunque el servidor las asigne", (route) => {
        state.cache.navegacion = { rutas_permitidas: [`/compensaciones/${route}`] };
        open(`/compensaciones/${route}`);
        expect(screen.getByText("Acceso denegado")).toBeVisible();
    });

    it("Auditoría Activa redirige a Auditoría Operaciones", () => {
        state.cache.navegacion = { rutas_permitidas: ["/compensaciones/auditoria-operaciones"] };
        open("/compensaciones/auditoria-activa");
        expect(screen.getByText("Pantalla autorizada: /compensaciones/auditoria-operaciones")).toBeVisible();
    });

    it("normaliza la barra final y no concede descendientes", () => {
        state.cache.navegacion = { rutas_permitidas: ["/compensaciones/auditoria-operaciones"] };
        open("/compensaciones/auditoria-operaciones/?estado=PENDIENTE");
        expect(screen.getByText("Pantalla autorizada: /compensaciones/auditoria-operaciones/")).toBeVisible();
        cleanup();
        open("/compensaciones/auditoria-operaciones/ajena");
        expect(screen.getByText("Acceso denegado")).toBeVisible();
    });

    it("filtra permisos retirados antes de elegir la ruta de entrada general", () => {
        state.cache.navegacion = { rutas_permitidas: ["/compensaciones/configuracion", "/compensaciones/resumen", "/compensaciones/auditoria-operaciones"] };
        open("/compensaciones");
        expect(screen.getByText("Pantalla autorizada: /compensaciones/resumen")).toBeVisible();
    });

    it("deniega la entrada general si únicamente quedan permisos retirados", () => {
        state.cache.navegacion = { rutas_permitidas: ["/compensaciones/configuracion"] };
        open("/compensaciones");
        expect(screen.getByText("Acceso denegado")).toBeVisible();
    });

    it.each(["perfil", "navegación"])("no monta información de sede mientras se resuelve %s", (pending) => {
        state.cache.navegacion = { rutas_permitidas: ["/compensaciones/resumen"] };
        if (pending === "perfil") state.actor.businessUser = null;
        else state.cache.isLoading = true;
        open("/compensaciones/resumen");
        expect(screen.getByRole("status")).toHaveTextContent("Verificando acceso");
        expect(screen.queryByText(/Pantalla autorizada/)).toBeNull();
    });

    it("deniega cuando no se pudieron cargar los permisos", () => {
        state.cache.navegacion = null;
        open("/compensaciones/resumen");
        expect(screen.getByText("Acceso denegado")).toBeVisible();
    });

    it("el rol 5 con excepción superadministrativa conserva su permiso de configuración", () => {
        state.actor.businessUser!.flag_super_admin = true;
        state.cache.navegacion = { rutas_permitidas: ["/compensaciones/configuracion"] };
        open("/compensaciones/configuracion");
        expect(screen.getByText("Pantalla autorizada: /compensaciones/configuracion")).toBeVisible();
    });

    it("ATC sigue sin entrar a supervisión aunque reciba el mismo permiso", () => {
        state.actor.businessUser!.id_rol = 4;
        state.cache.navegacion = { rutas_permitidas: ["/compensaciones/auditoria-activa"] };
        open("/compensaciones/auditoria-activa");
        expect(screen.getByText("Acceso denegado")).toBeVisible();
    });
});
