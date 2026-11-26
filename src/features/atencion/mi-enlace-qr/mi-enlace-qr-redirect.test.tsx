import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it } from "vitest";
import { MiEnlaceQrPage } from "./mi-enlace-qr-page";

afterEach(cleanup);
it("redirige el acceso anterior a Calificaciones sin montar otra pantalla ni generar un enlace", async () => {
    render(
        <MemoryRouter initialEntries={["/atencion/mi-enlace-qr"]}>
            <Routes>
                <Route path="/atencion/mi-enlace-qr" element={<MiEnlaceQrPage />} />
                <Route path="/compensaciones/calificaciones" element={<h1>Atención Calificada</h1>} />
            </Routes>
        </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Atención Calificada" })).toBeTruthy();
});
