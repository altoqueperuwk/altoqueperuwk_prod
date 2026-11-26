import type { ReactNode } from "react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CentroTrabajoPage } from "./centro-trabajo-page";

const cache = vi.hoisted(() => ({ navegacion: { rutas_permitidas: [] as string[] }, isLoading: false, navigationError: "" }));
const profile = vi.hoisted(() => ({ isAdvisor: true, isStoreManager: false, isFacturacion: false, isPagos: false, isMarketing: false, isResolving: false }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => cache }));
vi.mock("../shared/compensacion-perfil", async (importOriginal) => ({ ...(await importOriginal<object>()), useCompensacionPerfil: () => profile }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));

const open = () =>
    render(
        <MemoryRouter>
            <Routes>
                <Route path="/" element={<CentroTrabajoPage />} />
                <Route path="/compensaciones/atenciones" element={<p>Registro existente</p>} />
            </Routes>
        </MemoryRouter>,
    );
beforeEach(() => {
    cache.navegacion.rutas_permitidas = ["/compensaciones/resumen", "/compensaciones/atenciones"];
    cache.isLoading = false;
    cache.navigationError = "";
    profile.isResolving = false;
    profile.isAdvisor = true;
    profile.isStoreManager = false;
    profile.isFacturacion = false;
    profile.isPagos = false;
    profile.isMarketing = false;
});
afterEach(cleanup);
describe("Centro de Trabajo ATC", () => {
    it("Marketing ofrece registros autorizados sin gestión de equipos o sueldos", () => {
        profile.isAdvisor = false;
        profile.isMarketing = true;
        cache.navegacion.rutas_permitidas = [
            "/compensaciones/resumen",
            "/compensaciones/colaboradores",
            "/compensaciones/indisciplina-colaborador",
            "/compensaciones/referidos",
        ];
        open();
        // Indisciplina es de consulta propia para Marketing; Colaboradores y Liquidaciones no son suyos.
        expect(screen.getAllByRole("link")).toHaveLength(3);
        expect(screen.getByRole("link", { name: /Dashboard/ })).toBeVisible();
        expect(screen.queryByRole("link", { name: /Asistencia/ })).toBeNull();
        expect(screen.getByRole("link", { name: /^Indisciplina Colaborador/ })).toBeVisible();
        expect(screen.queryByRole("navigation", { name: "Supervisar Equipo" })).toBeNull();
        expect(screen.getByRole("link", { name: /Referidos/ })).toBeVisible();
        expect(screen.queryByRole("link", { name: /Control de Pagos|Sueldos|Colaboradores|Liquidaciones/ })).toBeNull();
    });
    it("Marketing recibe tarjetas acordes al menú: dos campañas separadas e Indisciplina, sin Campañas única ni vistas por concepto", () => {
        profile.isAdvisor = false;
        profile.isMarketing = true;
        cache.navegacion.rutas_permitidas = [
            "/compensaciones/resumen",
            "/compensaciones/referidos",
            "/compensaciones/indisciplina-colaborador",
            "/compensaciones/incidencias?concepto=uniforme",
            "/compensaciones/otros-bonos/video_viral",
            "/compensaciones/otros-bonos/recuperacion_cliente",
            "/compensaciones/auditoria-operaciones",
            "/compensaciones/otros-bonos/tiktok_live",
            "/compensaciones/otros-bonos/propuesta_innovacion",
            "/compensaciones/mis-bonos-descuentos",
            "/compensaciones/colaboradores",
        ];
        open();
        const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
        expect(hrefs[0]).toBe("/compensaciones/resumen");
        for (const href of [
            "/compensaciones/indisciplina-colaborador",
            "/compensaciones/referidos",
            "/compensaciones/otros-bonos/tiktok_live",
            "/compensaciones/otros-bonos/video_viral",
            "/compensaciones/otros-bonos/recuperacion_cliente",
            "/compensaciones/auditoria-operaciones",
            "/compensaciones/otros-bonos/propuesta_innovacion",
        ])
            expect(
                hrefs.filter((entry) => entry === href),
                href,
            ).toHaveLength(1);
        expect(hrefs).toHaveLength(8);
        expect(hrefs.filter((href) => href?.includes("?concepto="))).toEqual([]);
        expect(screen.queryByRole("link", { name: /Puntualidad y Disciplina/ })).toBeNull();
        expect(screen.getByRole("link", { name: /^Indisciplina Colaborador/ })).toHaveTextContent("presenta tu descargo");
        expect(screen.getByRole("link", { name: /^Auditoría Operaciones/ })).toBeVisible();
        expect(screen.queryByRole("link", { name: /Mis Bonos|Colaboradores|Sueldos|Liquidaciones|Control de Pagos|Incidencias del equipo/ })).toBeNull();
        expect(screen.queryByRole("navigation", { name: "Supervisar Equipo" })).toBeNull();
    });
    it("Marketing solo recibe las tarjetas cuyas rutas concede el servidor", () => {
        profile.isAdvisor = false;
        profile.isMarketing = true;
        cache.navegacion.rutas_permitidas = [
            "/compensaciones/resumen",
            "/compensaciones/otros-bonos/video_viral",
            "/compensaciones/otros-bonos/recuperacion_cliente",
        ];
        open();
        expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
            "/compensaciones/resumen",
            "/compensaciones/otros-bonos/video_viral",
            "/compensaciones/otros-bonos/recuperacion_cliente",
        ]);
        expect(screen.queryByRole("link", { name: /Puntualidad|Incidencias|Alerta/ })).toBeNull();
    });
    it("Video Viral y Recuperación asignadas muestran sus dos tarjetas", () => {
        profile.isAdvisor = false;
        cache.navegacion.rutas_permitidas = ["/compensaciones/otros-bonos/video_viral", "/compensaciones/otros-bonos/recuperacion_cliente"];
        open();
        const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
        expect(hrefs).toContain("/compensaciones/otros-bonos/video_viral");
        expect(hrefs).toContain("/compensaciones/otros-bonos/recuperacion_cliente");
    });
    it("Pagos presenta capturas autorizadas y resultados propios, sin supervisión", () => {
        profile.isAdvisor = false;
        profile.isPagos = true;
        cache.navegacion.rutas_permitidas = [
            "/compensaciones/resumen",
            "/compensaciones/colaboradores",
            "/compensaciones/atenciones",
            "/compensaciones/auditoria-cuadre-cierre",
        ];
        open();
        expect(screen.getAllByRole("link")).toHaveLength(3);
        expect(screen.getByRole("link", { name: /Auditoría Cuadre y Cierre/ })).toBeVisible();
        expect(screen.queryByRole("link", { name: /Control de Pagos/ })).toBeNull();
        expect(screen.getByRole("link", { name: /Registro Nuevo/ })).toBeVisible();
        expect(screen.getByRole("link", { name: /Dashboard/ })).toBeVisible();
        expect(screen.queryByRole("link", { name: /Asistencia/ })).toBeNull();
        expect(screen.queryByRole("navigation", { name: "Supervisar Equipo" })).toBeNull();
    });
    it("Pagos recibe tarjetas acordes al menú, en su orden y sin vistas por concepto ni rutas retiradas", () => {
        profile.isAdvisor = false;
        profile.isPagos = true;
        cache.navegacion.rutas_permitidas = [
            "/compensaciones/resumen",
            "/compensaciones/calificaciones",
            "/compensaciones/referidos",
            "/compensaciones/atenciones",
            "/compensaciones/otros-bonos/reporte_abandono",
            "/compensaciones/otros-bonos/propuesta_innovacion",
            "/compensaciones/otros-bonos/tiktok_live",
            "/compensaciones/auditoria-activa",
            "/compensaciones/auditoria-operaciones",
            "/compensaciones/auditoria-cuadre-cierre",
            "/compensaciones/incidencias",
            "/compensaciones/incidencias?concepto=uniforme",
            "/compensaciones/mis-bonos-descuentos",
            "/compensaciones/evidencias",
        ];
        open();
        const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
        expect(hrefs[0]).toBe("/compensaciones/resumen");
        expect(hrefs).not.toContain("/compensaciones/resumen?vista=control-pagos");
        for (const href of ["/compensaciones/auditoria-operaciones", "/compensaciones/auditoria-cuadre-cierre", "/compensaciones/referidos"])
            expect(hrefs).toContain(href);
        for (const href of [
            "/compensaciones/incidencias",
            "/compensaciones/auditoria-activa",
            "/compensaciones/otros-bonos/reporte_abandono",
            "/compensaciones/calificaciones",
        ])
            expect(hrefs).not.toContain(href);
        expect(hrefs.filter((href) => href?.includes("?concepto="))).toEqual([]);
        expect(screen.queryByRole("link", { name: /Puntualidad y Disciplina|Mis Bonos|Evidencias|Uniforme|Indisciplina/ })).toBeNull();
        expect(screen.queryByRole("navigation", { name: "Supervisar Equipo" })).toBeNull();
    });
    it("Pagos no recibe Puntualidad ni Incidencias cuando el servidor no concede la ruta", () => {
        profile.isAdvisor = false;
        profile.isPagos = true;
        cache.navegacion.rutas_permitidas = ["/compensaciones/resumen", "/compensaciones/colaboradores"];
        open();
        expect(screen.queryByRole("link", { name: /Puntualidad|Incidencias/ })).toBeNull();
        expect(screen.queryByRole("link", { name: /Control de Pagos/ })).toBeNull();
    });
    it("Facturación no recibe Mi ficha ni Incidencias aunque existan permisos antiguos", () => {
        profile.isAdvisor = false;
        profile.isFacturacion = true;
        cache.navegacion.rutas_permitidas = [
            "/compensaciones/resumen",
            "/compensaciones/colaboradores",
            "/compensaciones/incidencias",
            "/compensaciones/calificaciones",
        ];
        open();
        expect(screen.queryByRole("link", { name: /Mi ficha|Incidencias/ })).toBeNull();
        expect(screen.queryByRole("navigation", { name: "Supervisar Equipo" })).toBeNull();
        expect(screen.queryByRole("link", { name: /Uniforme|Sueldos|Liderazgo|Atención Calificada/ })).toBeNull();
    });
    it("Facturación recibe solo sus opciones del menú objetivo, sin rutas retiradas ni vistas por concepto", () => {
        profile.isAdvisor = false;
        profile.isFacturacion = true;
        cache.navegacion.rutas_permitidas = [
            "/compensaciones/resumen",
            "/compensaciones/colaboradores",
            "/compensaciones/referidos",
            "/compensaciones/otros-bonos/propuesta_innovacion",
            "/compensaciones/auditoria-operaciones",
            "/compensaciones/indisciplina-colaborador",
            "/compensaciones/auditoria-activa",
            "/compensaciones/incidencias",
            "/compensaciones/incidencias?concepto=uniforme",
            "/compensaciones/mis-bonos-descuentos",
            "/compensaciones/evidencias",
        ];
        open();
        const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
        expect([...hrefs].sort()).toEqual(
            [
                "/compensaciones/resumen",
                "/compensaciones/referidos",
                "/compensaciones/otros-bonos/propuesta_innovacion",
                "/compensaciones/auditoria-operaciones",
                "/compensaciones/indisciplina-colaborador",
            ].sort(),
        );
        expect(screen.queryByRole("link", { name: /Mis Bonos|Evidencias|Incidencias del equipo|Mi ficha/ })).toBeNull();
    });
    it("Facturación abre Auditoría Operaciones solo cuando el servidor concede la ruta", () => {
        profile.isAdvisor = false;
        profile.isFacturacion = true;
        cache.navegacion.rutas_permitidas = ["/compensaciones/resumen", "/compensaciones/auditoria-operaciones"];
        const view = open();
        expect(screen.getByRole("link", { name: /Auditoría Operaciones/ })).toHaveAttribute("href", "/compensaciones/auditoria-operaciones");
        cache.navegacion.rutas_permitidas = ["/compensaciones/resumen"];
        view.rerender(
            <MemoryRouter>
                <CentroTrabajoPage />
            </MemoryRouter>,
        );
        expect(screen.queryByRole("link", { name: /Auditoría Operaciones/ })).toBeNull();
    });
    it("jefatura muestra la bandeja unificada y retira las tres capturas independientes", () => {
        profile.isAdvisor = false;
        profile.isStoreManager = true;
        cache.navegacion.rutas_permitidas = [
            "/compensaciones/resumen",
            "/compensaciones/colaboradores",
            "/compensaciones/incidencias",
            "/compensaciones/evidencias",
            "/compensaciones/tarjetas-erroneas",
            "/compensaciones/auditoria-activa",
            "/compensaciones/auditoria-operaciones",
            "/compensaciones/indisciplina-colaborador",
            "/compensaciones/penalidad-escalonada-bonos",
        ];
        open();
        expect(screen.getAllByRole("link")).toHaveLength(6);
        expect(screen.getByRole("link", { name: /Auditoría Operaciones/ })).toHaveAttribute("href", "/compensaciones/auditoria-operaciones");
        expect(screen.getByRole("link", { name: /Indisciplina Colaborador/ })).toHaveAttribute("href", "/compensaciones/indisciplina-colaborador");
        expect(screen.getByRole("link", { name: /Penalidad Escalonada Bonos/ })).toHaveAttribute("href", "/compensaciones/penalidad-escalonada-bonos");
        expect(screen.queryByRole("link", { name: /Auditoría Activa|Auditoría de Pagos/ })).toBeNull();
        expect(screen.getByRole("link", { name: /Incidencias del equipo/ })).toHaveAttribute("href", "/compensaciones/incidencias");
        for (const name of [/Mal Flujo SafetyPay/, /Conversación al Aire/, /Error en Registro o Código/])
            expect(screen.queryByRole("link", { name })).toBeNull();
        expect(screen.queryByRole("link", { name: /Uniforme|Tarjetas Erróneas/ })).toBeNull();
    });
    it("jefatura muestra las opciones autorizadas con Incidencias unificada", () => {
        profile.isAdvisor = false;
        profile.isStoreManager = true;
        cache.navegacion.rutas_permitidas = [
            "/compensaciones/resumen",
            "/compensaciones/colaboradores",
            "/compensaciones/atenciones",
            "/compensaciones/otros-bonos/tiktok_live",
            "/compensaciones/calificaciones",
            "/compensaciones/otros-bonos/meta_sede_safetypay",
            "/compensaciones/referidos",
            "/compensaciones/llamadas",
            "/compensaciones/otros-bonos/propuesta_innovacion",
            "/compensaciones/incidencias",
        ];
        open();
        expect(screen.getByText("9 opciones")).toBeVisible();
        expect(screen.getAllByRole("link")).toHaveLength(9);
        expect(
            screen
                .getAllByRole("link")
                .slice(0, 2)
                .map((link) => link.getAttribute("href")),
        ).toEqual(["/compensaciones/resumen", "/compensaciones/atenciones"]);
        // Mismos grupos y orden que el menú.
        expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(expect.arrayContaining(["General", "Registro", "Control"]));
    });
    it("jefatura tiene tarjeta de Mis Bonos y Penalidades junto al Dashboard, como en su menú", () => {
        profile.isAdvisor = false;
        profile.isStoreManager = true;
        cache.navegacion.rutas_permitidas = ["/compensaciones/mis-bonos-descuentos", "/compensaciones/resumen"];
        open();
        expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
            "/compensaciones/resumen",
            "/compensaciones/mis-bonos-descuentos",
        ]);
        expect(screen.getByRole("link", { name: /^Mis Bonos y Penalidades/ })).toBeVisible();
    });
    it("jefatura sin Incidencias del equipo no conserva rutas sueltas", () => {
        profile.isAdvisor = false;
        profile.isStoreManager = true;
        cache.navegacion.rutas_permitidas = [
            "/compensaciones/resumen",
            "/compensaciones/mal-flujo-safetypay",
            "/compensaciones/conversacion-al-aire",
            "/compensaciones/error-registro-codigo",
        ];
        open();
        expect(screen.getAllByRole("link")).toHaveLength(1);
        expect(screen.queryByRole("link", { name: /Mal Flujo SafetyPay|Conversación al Aire|Error en Registro o Código/ })).toBeNull();
        expect(screen.queryByRole("link", { name: /Incidencias del equipo/ })).toBeNull();
    });
    it("abre la página existente y excluye destinos no autorizados", () => {
        open();
        expect(screen.getAllByRole("link")).toHaveLength(2);
        expect(
            screen
                .getAllByRole("link")
                .slice(0, 2)
                .map((link) => link.getAttribute("href")),
        ).toEqual(["/compensaciones/resumen", "/compensaciones/atenciones"]);
        const panel = screen.getByRole("heading", { name: "Opciones Disponibles" }).closest("section")!;
        expect(panel).toContainElement(screen.getByRole("textbox", { name: /Buscar opción/ }));
        expect(panel).toContainElement(screen.getByRole("navigation", { name: "Opciones del Centro de Trabajo" }));
        expect(screen.queryByRole("link", { name: /Sueldos|Atención Calificada|TikTok|Incidencias/ })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("link", { name: /Registro Nuevo/ }));
        expect(screen.getByText("Registro existente")).toBeInTheDocument();
    });
    it("busca por tarea sin exigir tildes y muestra vacío", () => {
        open();
        fireEvent.change(screen.getByRole("textbox", { name: /Buscar opción/ }), { target: { value: "operacion" } });
        expect(screen.getAllByRole("link")).toHaveLength(1);
        expect(screen.getByRole("link", { name: /Registro Nuevo/ })).toBeInTheDocument();
        fireEvent.change(screen.getByRole("textbox", { name: /Buscar opción/ }), { target: { value: "inexistente" } });
        expect(screen.getByRole("status")).toHaveTextContent("No hay opciones");
    });
    it("oculta enlaces anteriores mientras carga el perfil o falla la navegación", () => {
        profile.isResolving = true;
        const view = open();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        profile.isResolving = false;
        cache.navigationError = "Error de permisos";
        view.rerender(
            <MemoryRouter>
                <CentroTrabajoPage />
            </MemoryRouter>,
        );
        expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent("Error de permisos");
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
    it("retira inmediatamente destinos cuando cambia la asignación", () => {
        const view = open();
        cache.navegacion.rutas_permitidas = [];
        view.rerender(
            <MemoryRouter>
                <CentroTrabajoPage />
            </MemoryRouter>,
        );
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("No tienes opciones asignadas");
    });
});
