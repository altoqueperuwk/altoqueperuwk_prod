import type { ReactNode } from "react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { administracionConceptMenus } from "../shared/compensaciones-navigation";
import { AdminCentroTrabajoPage } from "./admin-centro-page";
import { getAdminDestinations } from "./admin-destinos";

const cache = vi.hoisted(() => ({ navegacion: { rutas_permitidas: [] as string[] }, isLoading: false, navigationError: "" }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => cache }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
afterEach(() => {
    cleanup();
    cache.isLoading = false;
    cache.navigationError = "";
    cache.navegacion.rutas_permitidas = [];
});
it("incluye gestion administrativa solo si el servidor asigna sus rutas", () => {
    const routes = ["/compensaciones/resumen", "/compensaciones/configuracion", "/compensaciones/bonos-mes"];
    const items = getAdminDestinations(routes);
    expect(items.filter((x) => x.group === "Control").map((x) => x.label)).toEqual(["Bonos del mes", "Configuración"]);
    expect(items.map((x) => x.label)).toEqual(expect.arrayContaining(["Dashboard", "Configuración"]));
    expect(getAdminDestinations([])).toEqual([]);
    expect(getAdminDestinations(["/compensaciones/resumen"]).some((x) => x.label === "Configuración")).toBe(false);
});
it("no ofrece las opciones retiradas aunque conserve sus permisos", () => {
    const routes = [
        "incidencias",
        "evidencias",
        "auditoria-activa",
        "tarjetas-erroneas",
        "otros-bonos/reporte_abandono",
        "otros-bonos/alerta_temprana",
        "otros-bonos/meta_sede_safetypay",
        "otros-bonos/colaborador_mes_atenciones",
    ].map((route) => "/compensaciones/" + route);
    expect(getAdminDestinations(routes)).toEqual([]);
    const menus = administracionConceptMenus([{ label: "General", items: routes.map((href) => ({ label: href, href })) }]);
    expect(menus.flatMap((x) => x.items ?? [])).toEqual([]);
});
it("ya no ofrece Control de Pagos en el menú ni en las tarjetas", () => {
    const menus = administracionConceptMenus([{ label: "General", items: [{ label: "Resumen", href: "/compensaciones/resumen" }] }]);
    const links = [...menus.flatMap((x) => x.items ?? []), ...getAdminDestinations(["/compensaciones/resumen"])].map((x) => x.href);
    expect(links.filter((href) => href?.includes("control-pagos"))).toEqual([]);
    expect(administracionConceptMenus(menus)).toEqual(menus);
});
it("ofrece las opciones compartidas con los mismos nombres que los demás perfiles", () => {
    const root = "/compensaciones/";
    const routes = [
        "otros-bonos/video_viral",
        "otros-bonos/recuperacion_cliente",
        "auditoria-operaciones",
        "auditoria-cuadre-cierre",
        "indisciplina-colaborador",
        "penalidad-escalonada-bonos",
    ].map((route) => root + route);
    const items = getAdminDestinations(routes);
    expect(items.map((x) => x.label).sort()).toEqual([
        "Auditoría Cuadre y Cierre",
        "Auditoría Operaciones",
        "Indisciplina Colaborador",
        "Penalidad Escalonada Bonos",
        "Recuperación",
        "Video Viral",
    ]);
    expect(items.filter((x) => x.group === "Auditoría")).toHaveLength(4);
    expect(items.filter((x) => x.group === "Registro").map((x) => x.label)).toEqual(["Video Viral", "Recuperación"]);
});
it("busca tareas sin mezclar bonos personales ni registrar nada", () => {
    cache.navegacion.rutas_permitidas = ["/compensaciones/resumen", "/compensaciones/reportes", "/compensaciones/configuracion"];
    render(
        <MemoryRouter>
            <AdminCentroTrabajoPage />
        </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar opción" }), { target: { value: "reportes" } });
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Reporte de Bonos/ })).toHaveAttribute("href", "/compensaciones/reportes");
});
it("un error de navegacion no muestra accesos antiguos", () => {
    cache.navegacion.rutas_permitidas = ["/compensaciones/reportes"];
    cache.navigationError = "Sin conexión";
    render(
        <MemoryRouter>
            <AdminCentroTrabajoPage />
        </MemoryRouter>,
    );
    expect(screen.queryByRole("link")).toBeNull();
});
