import { cleanup, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { advisorRoutes } from "./atc-route-policy";
import { CompensacionRouteGuard } from "./compensacion-route-guard";

const cache = vi.hoisted(() => ({
    isLoading: false,
    navegacion: { rutas_permitidas: ["/compensaciones/referidos"] } as { rutas_permitidas: string[] } | null,
}));
const actor = vi.hoisted(() => ({ businessUser: { id: "24", email: "", id_rol: 1 }, isLoading: false }));
vi.mock("@/providers/auth-provider", () => ({
    useOptionalAuth: () => actor,
    isAdministrator: (user: { id_rol?: number; flag_super_admin?: boolean } | null) => Number(user?.id_rol) === 1 || user?.flag_super_admin === true,
}));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => cache }));
afterEach(() => {
    cleanup();
    actor.businessUser.id_rol = 1;
    cache.isLoading = false;
    cache.navegacion = { rutas_permitidas: ["/compensaciones/referidos"] };
});
const Location = () => {
    const location = useLocation();
    return <output>{location.pathname + location.search}</output>;
};
const open = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/403" element={<p>Acceso denegado</p>} />
                <Route
                    path="*"
                    element={
                        <CompensacionRouteGuard>
                            <p>Pantalla autorizada</p>
                            <Location />
                        </CompensacionRouteGuard>
                    }
                />
            </Routes>
        </MemoryRouter>,
    );

describe("Acceso por ruta a Compensaciones", () => {
    it.each(["evidencias", "tarjetas-erroneas", "otros-bonos/bono_puntualidad", "otros-bonos/liderazgo_subordinado"])(
        "jefatura no abre la ruta retirada %s aunque conserve permiso antiguo",
        (path) => {
            actor.businessUser.id_rol = 3;
            cache.navegacion = { rutas_permitidas: ["/compensaciones/" + path.split("?")[0]] };
            open("/compensaciones/" + path);
            expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
        },
    );
    it("Marketing exige permiso personal y bloquea gestión aunque conserve permisos antiguos", () => {
        actor.businessUser.id_rol = 6;
        try {
            for (const path of ["/compensaciones/configuracion", "/compensaciones/colaboradores", "/compensaciones/calificaciones", "/reportes/cierre-caja"]) {
                cache.navegacion = { rutas_permitidas: [path] };
                const view = open(path);
                expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
                view.unmount();
            }
            cache.navegacion = { rutas_permitidas: [] };
            const missing = open("/compensaciones/resumen");
            expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
            missing.unmount();
            cache.navegacion = { rutas_permitidas: ["/compensaciones/resumen"] };
            open("/compensaciones/resumen?vista=centro");
            expect(screen.getByText("Pantalla autorizada")).toBeInTheDocument();
        } finally {
            actor.businessUser.id_rol = 1;
        }
    });
    it("Pagos no abre una ruta administrativa aun si fue asignada y exige permiso propio", () => {
        actor.businessUser.id_rol = 2;
        try {
            cache.navegacion = { rutas_permitidas: ["/compensaciones/configuracion"] };
            const view = open("/compensaciones/configuracion");
            expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
            view.unmount();
            cache.navegacion = { rutas_permitidas: [] };
            const own = open("/compensaciones/atenciones");
            expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
            own.unmount();
            cache.navegacion = { rutas_permitidas: ["/compensaciones/atenciones"] };
            open("/compensaciones/atenciones");
            expect(screen.getByText("Pantalla autorizada")).toBeInTheDocument();
        } finally {
            actor.businessUser.id_rol = 1;
        }
    });
    it("Centro de Trabajo requiere el recurso Dashboard asignado", () => {
        actor.businessUser.id_rol = 4;
        const first = open("/compensaciones/resumen?vista=centro");
        expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
        first.unmount();
        cache.navegacion = { rutas_permitidas: ["/compensaciones/resumen"] };
        open("/compensaciones/resumen?vista=centro");
        expect(screen.getByText("Pantalla autorizada")).toBeInTheDocument();
    });
    it.each(advisorRoutes)("ATC requiere permiso exacto incluso para su opción propia: %s", (path) => {
        actor.businessUser.id_rol = 4;
        cache.navegacion = { rutas_permitidas: [] };
        const { unmount } = open(path);
        expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
        unmount();
        cache.navegacion = { rutas_permitidas: [path] };
        open(path);
        expect(screen.getByText("Pantalla autorizada")).toBeInTheDocument();
    });
    it.each([
        ["evidencias", "resumen"],
        ["otros-bonos/colaborador_mes_atenciones", "resumen"],
        ["incidencias", "auditoria-operaciones"],
        ["auditoria-activa", "auditoria-operaciones"],
        ["incidencias?concepto=uniforme", "indisciplina-colaborador"],
        ["mal-flujo-safetypay", "auditoria-operaciones"],
    ])("administración pasa de la opción retirada %s a %s", (from, to) => {
        actor.businessUser.id_rol = 1;
        cache.navegacion = { rutas_permitidas: ["/compensaciones/incidencias", "/compensaciones/" + to] };
        open("/compensaciones/" + from);
        expect(screen.getByRole("status").textContent).toBe("/compensaciones/" + to);
    });
    it("la consulta de bonos exige su permiso independiente", () => {
        actor.businessUser.id_rol = 4;
        open("/compensaciones/mis-bonos-descuentos");
        expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
        actor.businessUser.id_rol = 1;
    });
    it("Pagos redirige la ruta retirada de bonos al Dashboard en lugar de negarla", () => {
        actor.businessUser.id_rol = 2;
        cache.navegacion = { rutas_permitidas: ["/compensaciones/resumen"] };
        open("/compensaciones/mis-bonos-descuentos");
        expect(screen.getByRole("status").textContent).toBe("/compensaciones/resumen");
        actor.businessUser.id_rol = 1;
    });
    it("Marketing redirige la ruta retirada de bonos al Dashboard en lugar de negarla", () => {
        actor.businessUser.id_rol = 6;
        cache.navegacion = { rutas_permitidas: ["/compensaciones/resumen"] };
        open("/compensaciones/mis-bonos-descuentos");
        expect(screen.getByRole("status").textContent).toBe("/compensaciones/resumen");
        actor.businessUser.id_rol = 1;
    });
    it("un permiso antiguo de bonos no concede acceso al Dashboard", () => {
        actor.businessUser.id_rol = 4;
        cache.navegacion = { rutas_permitidas: ["/compensaciones/mis-bonos-descuentos"] };
        open("/compensaciones/mis-bonos-descuentos");
        expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
        actor.businessUser.id_rol = 1;
    });
    it.each([
        ["/compensaciones/mis-bonos-descuentos", "/compensaciones/resumen"],
        ["/compensaciones/atenciones?canal=LIVE", "/compensaciones/otros-bonos/tiktok_live"],
        ["/atencion/mi-enlace-qr", "/compensaciones/calificaciones"],
    ])("redirige alias ATC %s solo al destino autorizado", (from, to) => {
        actor.businessUser.id_rol = 4;
        cache.navegacion = { rutas_permitidas: [to.split("?")[0]] };
        open(from);
        expect(screen.getByRole("status").textContent).toBe(to);
    });
    it("ATC no consulta fichas de colaboradores con un permiso antiguo", () => {
        actor.businessUser.id_rol = 4;
        cache.navegacion = { rutas_permitidas: ["/compensaciones/colaboradores"] };
        open("/compensaciones/colaboradores");
        expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
    });
    it("jefatura abre Incidencias del equipo con su permiso (Paquete K)", () => {
        actor.businessUser.id_rol = 3;
        cache.navegacion = { rutas_permitidas: ["/compensaciones/incidencias"] };
        open("/compensaciones/incidencias");
        expect(screen.getByText("Pantalla autorizada")).toBeInTheDocument();
        actor.businessUser.id_rol = 1;
    });
    it("ATC no entra a Incidencias aunque conserve un permiso antiguo", () => {
        actor.businessUser.id_rol = 4;
        cache.navegacion = { rutas_permitidas: ["/compensaciones/incidencias"] };
        open("/compensaciones/incidencias");
        expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
        expect(screen.queryByText("Pantalla autorizada")).not.toBeInTheDocument();
        actor.businessUser.id_rol = 1;
    });
    it("ATC no entra a Configuración con un permiso antiguo demasiado amplio", () => {
        actor.businessUser.id_rol = 4;
        cache.navegacion = { rutas_permitidas: ["/compensaciones/configuracion"] };
        open("/compensaciones/configuracion");
        expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
        actor.businessUser.id_rol = 1;
    });
    it("permite únicamente la ruta asignada", () => {
        open("/compensaciones/referidos");
        expect(screen.getByText("Pantalla autorizada")).toBeInTheDocument();
    });
    it.each(["/compensaciones/llamadas", "/compensaciones/otros-bonos/bono_puntualidad", "/compensaciones/referidos/otra"])(
        "deniega URL directa no asignada: %s",
        (path) => {
            open(path);
            expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
            expect(screen.queryByText("Pantalla autorizada")).not.toBeInTheDocument();
        },
    );
    it("un permiso genérico no habilita los tipos de bono", () => {
        cache.navegacion = { rutas_permitidas: ["/compensaciones/otros-bonos"] };
        open("/compensaciones/otros-bonos/bono_puntualidad");
        expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
    });
    it("espera la navegación antes de montar la pantalla", () => {
        cache.isLoading = true;
        open("/compensaciones/referidos");
        expect(screen.getByRole("status")).toBeInTheDocument();
        expect(screen.queryByText("Pantalla autorizada")).not.toBeInTheDocument();
    });
    it("deniega cuando falla la carga de permisos", () => {
        cache.navegacion = null;
        open("/compensaciones/referidos");
        expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
    });
    it("redirige la entrada general a la primera pantalla permitida", () => {
        open("/compensaciones");
        expect(screen.getByText("Pantalla autorizada")).toBeInTheDocument();
    });
    it("normaliza la entrada general con barra final sin denegar un permiso válido", () => {
        actor.businessUser.id_rol = 4;
        open("/compensaciones/");
        expect(screen.getByRole("status")).toHaveTextContent("/compensaciones/referidos");
    });
    it("mantiene el comportamiento de los demás módulos", () => {
        open("/operaciones/bcp");
        expect(screen.getByText("Pantalla autorizada")).toBeInTheDocument();
    });
});
