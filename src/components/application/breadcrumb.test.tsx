import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import { afterEach, expect, it } from "vitest";
import { Breadcrumb } from "./breadcrumb";

const NavigationFixture = () => {
    const navigate = useNavigate();
    return (
        <>
            <button onClick={() => navigate("/operaciones/bcp")}>Salir de Compensaciones</button>
            <Breadcrumb />
        </>
    );
};

afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("atk-brand");
});

it("muestra la etiqueta vigente y activa la identidad en Compensaciones", () => {
    render(
        <MemoryRouter initialEntries={["/compensaciones/incidencias"]}>
            <NavigationFixture />
        </MemoryRouter>,
    );

    expect(screen.getByText("Incidencias del equipo")).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("atk-brand");
});

it("retira la identidad al navegar fuera de Compensaciones", async () => {
    render(
        <MemoryRouter initialEntries={["/compensaciones/llamadas"]}>
            <NavigationFixture />
        </MemoryRouter>,
    );

    expect(document.documentElement).toHaveClass("atk-brand");
    fireEvent.click(screen.getByRole("button", { name: "Salir de Compensaciones" }));
    await waitFor(() => expect(document.documentElement).not.toHaveClass("atk-brand"));
});
