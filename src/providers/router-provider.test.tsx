import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it } from "vitest";
import { NavItemBase } from "@/components/application/app-navigation/base-components/nav-item";
import { RouteProvider } from "./router-provider";

afterEach(cleanup);
it("los enlaces reales del menú navegan mediante RouterProvider sin navegación nativa", async () => {
    render(
        <MemoryRouter initialEntries={["/inicio"]}>
            <RouteProvider>
                <NavItemBase type="collapsible-child" href="/destino">
                    Destino
                </NavItemBase>
                <Routes>
                    <Route path="/inicio" element={<h1>Inicio</h1>} />
                    <Route path="/destino" element={<h1>Pantalla destino</h1>} />
                </Routes>
            </RouteProvider>
        </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Destino" }));
    expect(await screen.findByRole("heading", { name: "Pantalla destino" })).toBeVisible();
});
