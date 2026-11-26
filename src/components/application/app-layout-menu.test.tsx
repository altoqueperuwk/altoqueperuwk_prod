import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppLayout } from "./app-layout";

vi.mock("./header", () => ({
    Header: ({ onToggleMenu }: { onToggleMenu: () => void }) => <button onClick={onToggleMenu}>Hamburguesa</button>,
}));
vi.mock("./sidebar-navigation", () => ({
    SidebarNavigation: ({ isOpen, isHidden }: { isOpen: boolean; isHidden: boolean }) => (
        <aside data-cajon={String(isOpen)} data-oculto={String(isHidden)} />
    ),
}));

const pantalla = (ancha: boolean) => vi.stubGlobal("matchMedia", () => ({ matches: ancha }));
const menu = () => screen.getByRole("complementary");
const pulsar = () => fireEvent.click(screen.getByRole("button", { name: "Hamburguesa" }));

beforeEach(() => localStorage.clear());
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

it("oculta y vuelve a mostrar el menú fijo en pantallas anchas, y recuerda la elección", () => {
    pantalla(true);
    render(<AppLayout>Contenido</AppLayout>);
    pulsar();
    expect(menu()).toHaveAttribute("data-oculto", "true");
    expect(menu()).toHaveAttribute("data-cajon", "false");

    cleanup();
    render(<AppLayout>Contenido</AppLayout>);
    expect(menu()).toHaveAttribute("data-oculto", "true");
    pulsar();
    expect(menu()).toHaveAttribute("data-oculto", "false");
});

it("en pantallas menores abre el cajón sin cambiar la preferencia", () => {
    pantalla(false);
    render(<AppLayout>Contenido</AppLayout>);
    pulsar();
    expect(menu()).toHaveAttribute("data-cajon", "true");
    expect(menu()).toHaveAttribute("data-oculto", "false");
    expect(localStorage.getItem("ui-menu-oculto")).toBeNull();
});
