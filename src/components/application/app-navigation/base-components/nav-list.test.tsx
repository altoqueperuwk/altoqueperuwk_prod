import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NavList } from "./nav-list";

afterEach(cleanup);
it("muestra iconos solo en el nivel principal, no en subopciones ni grupos anidados", () => {
    const Icon = () => <svg data-testid="menu-icon" />;
    const view = render(
        <NavList
            activeUrl="/llamadas"
            items={[
                { label: "Inicio", href: "/", icon: Icon },
                {
                    label: "Atención y gestión comercial",
                    icon: Icon,
                    items: [
                        { label: "Llamadas", href: "/llamadas", icon: Icon },
                        { label: "Referidos", href: "/referidos", icon: Icon },
                        { label: "Más opciones", icon: Icon, items: [{ label: "Historial", href: "/historial", icon: Icon }] },
                    ],
                },
            ]}
        />,
    );
    expect(screen.getAllByTestId("menu-icon")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Inicio" }).querySelector("svg")).not.toBeNull();
    for (const name of ["Llamadas", "Referidos", "Historial"]) {
        const link = screen.getByRole("link", { name });
        expect(link.querySelector("svg")).toBeNull();
        expect(link.style.getPropertyValue("--nav-accent")).toBe("");
        expect(link.querySelector("span[aria-hidden='true']")).toBeNull();
    }
    expect(screen.getByRole("link", { name: "Llamadas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Llamadas")).toHaveClass("text-sm", "font-semibold");
    expect(view.container.querySelectorAll("summary [data-testid='menu-icon']")).toHaveLength(1);
});
it("muestra secciones como encabezados no interactivos y conserva el enlace activo", () => {
    render(
        <NavList
            activeUrl="/asistencia"
            items={[
                { label: "Personal y desempeño", sectionHeading: true },
                { label: "Asistencia", href: "/asistencia" },
            ]}
        />,
    );
    expect(screen.getByRole("heading", { name: "Personal y desempeño" })).toHaveClass("text-sm", "font-semibold", "text-secondary");
    expect(screen.getByRole("heading", { name: "Personal y desempeño" })).not.toHaveClass("uppercase", "tracking-wider");
    expect(screen.queryByRole("link", { name: "Personal y desempeño" })).toBeNull();
    expect(screen.getByRole("link", { name: "Asistencia" })).toHaveAttribute("aria-current", "page");
});
it("abre los grupos ante una ruta activa de tercer nivel", () => {
    const view = render(
        <NavList
            activeUrl="/bonos/uno"
            items={[{ label: "Compensaciones", items: [{ label: "Otros bonos", items: [{ label: "Puntualidad", href: "/bonos/uno" }] }] }]}
        />,
    );
    expect(screen.getByRole("link", { name: "Puntualidad" })).toHaveAttribute("aria-current", "page");
    expect([...view.container.querySelectorAll("details")].every((details) => details.open)).toBe(true);
});
