import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { LlamadasFiltros, llamadasRango } from "./llamadas-filtros";

afterEach(cleanup);
it("separa los tres filtros y aplica documento numérico sin mostrar Actualizar ni Rango", () => {
    const onDocumento = vi.fn();
    const onNombre = vi.fn();
    const onColaborador = vi.fn();
    const onClear = vi.fn();
    render(
        <LlamadasFiltros
            documento=""
            nombre=""
            colaborador=""
            status=""
            month="2026-11"
            from="2026-11-01"
            to="2026-11-30"
            onDocumento={onDocumento}
            onNombre={onNombre}
            onColaborador={onColaborador}
            onStatus={() => undefined}
            onMonth={() => undefined}
            onFrom={() => undefined}
            onTo={() => undefined}
            onClear={onClear}
        />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Filtrar por DNI" }), { target: { value: "12x34567890" } });
    expect(onDocumento).toHaveBeenCalledWith("123456789");
    fireEvent.change(screen.getByRole("textbox", { name: "Filtrar por cliente" }), { target: { value: "Cliente" } });
    expect(onNombre).toHaveBeenCalledWith("Cliente");
    fireEvent.change(screen.getByRole("textbox", { name: "Filtrar por colaborador" }), { target: { value: "Equipo" } });
    expect(onColaborador).toHaveBeenCalledWith("Equipo");
    expect(screen.queryByRole("button", { name: "Actualizar" })).toBeNull();
    expect(screen.queryByText("Rango", { exact: true })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(onClear).toHaveBeenCalledOnce();
});
describe("Rangos de llamadas en America/Lima", () => {
    it("todo tiempo sin mes no aplica fechas; un mes incluye su último día", () => {
        expect(llamadasRango("", "ALL")).toEqual({ from: "", to: "" });
        expect(llamadasRango("2024-02", "ALL")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    });
    it("Hoy usa el día peruano aunque UTC ya sea el día siguiente", () => {
        expect(llamadasRango("", "TODAY", new Date("2026-10-20T02:00:00Z"))).toEqual({ from: "2026-10-19", to: "2026-10-19" });
    });
    it("la semana comienza el lunes y puede cruzar de mes", () => {
        expect(llamadasRango("", "WEEK", new Date("2026-11-01T18:00:00Z"))).toEqual({ from: "2026-10-26", to: "2026-11-01" });
        expect(llamadasRango("", "MONTH", new Date("2026-10-19T18:00:00Z"))).toEqual({ from: "2026-10-01", to: "2026-10-19" });
    });
    it("abre los 12 meses, permite cambiar de año y seleccionar un mes", async () => {
        const change = vi.fn();
        render(<MonthPicker value="2026-10" onChange={change} />);
        fireEvent.click(screen.getByRole("button", { name: /Mes: octubre de 2026/ }));
        expect(await screen.findByRole("dialog", { name: "Seleccionar mes del año" })).toBeVisible();
        expect(screen.getByRole("group", { name: "Meses de 2026" }).querySelectorAll("button")).toHaveLength(12);
        fireEvent.click(screen.getByRole("button", { name: "Año anterior" }));
        fireEvent.click(screen.getByRole("button", { name: "setiembre de 2025" }));
        expect(change).toHaveBeenCalledWith("2025-09");
    });
});
