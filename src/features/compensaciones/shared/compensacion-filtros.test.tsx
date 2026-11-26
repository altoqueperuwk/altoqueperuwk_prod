import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { CompensacionFiltros } from "./compensacion-filtros";

afterEach(cleanup);
it("compone filtros concretos y permite limpiar sin agregar un botón Nuevo", () => {
    const clear = vi.fn();
    render(
        <CompensacionFiltros
            texto={<input aria-label="Buscar" placeholder="Nombre o DNI Colaborador" />}
            periodo={<MonthPicker hideLabel label="Periodo" value="2026-11" allowAllMonths={false} onChange={vi.fn()} />}
            onLimpiar={clear}
        />,
    );
    expect(screen.getByRole("heading", { name: "Filtros de Búsqueda" })).toBeVisible();
    expect(screen.getByPlaceholderText("Nombre o DNI Colaborador")).toBeVisible();
    expect(screen.getByRole("button", { name: /Periodo: noviembre de 2026/ })).toHaveTextContent(/Periodo.*nov.*2026/);
    expect(screen.queryByRole("button", { name: "Nuevo" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(clear).toHaveBeenCalledOnce();
});
it("el selector mensual no ofrece acceso a todo el historial", () => {
    const change = vi.fn();
    render(<MonthPicker hideLabel label="Periodo" value="2026-11" allowAllMonths={false} onChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: /Periodo: noviembre de 2026/ }));
    expect(screen.queryByRole("button", { name: "Todos los meses" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "octubre de 2026" }));
    expect(change).toHaveBeenCalledExactlyOnceWith("2026-10");
});
