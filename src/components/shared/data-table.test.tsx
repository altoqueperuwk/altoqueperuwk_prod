import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "./data-table";

vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));
vi.mock("@/providers/toast-provider", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/components/base/select/select", () => ({ Select: () => <span>20 por página</span> }));
vi.mock("@/components/base/buttons/button", () => ({
    Button: ({
        children,
        onClick,
        isDisabled,
        "aria-label": label,
    }: {
        children: ReactNode;
        onClick?: () => void;
        isDisabled: boolean;
        "aria-label": string;
    }) => (
        <button aria-label={label} disabled={isDisabled} onClick={onClick}>
            {children}
        </button>
    ),
}));

afterEach(cleanup);
describe("DataTable: scroll y paginación", () => {
    it("mantiene la cabecera libre por defecto y fija solo la tabla que lo solicita", () => {
        const props = {
            columns: [{ key: "importe", header: "Importe", align: "right" as const }],
            data: [{ id: 1, importe: 25 }],
            isLoading: false,
            page: 1,
            totalPages: 1,
            pageSize: 20,
            onPageChange: vi.fn(),
            onPageSizeChange: vi.fn(),
        };
        const view = render(<DataTable {...props} />);
        expect(screen.getByRole("columnheader").closest("thead")).not.toHaveClass("sticky");
        expect(screen.getByRole("region")).not.toHaveStyle({ maxHeight: "60vh" });
        view.rerender(<DataTable {...props} stickyHeader maxBodyHeight="60vh" minColumnWidth={140} />);
        expect(screen.getByRole("columnheader").closest("thead")).toHaveClass("sticky", "top-0");
        expect(screen.getByRole("region")).toHaveStyle({ maxHeight: "60vh" });
        expect(screen.getByRole("cell")).toHaveClass("text-right");
        expect(screen.getByRole("columnheader")).toHaveClass("text-right");
        expect(screen.getByRole("columnheader")).toHaveStyle({ minWidth: "140px" });
        expect(screen.getByRole("table")).not.toHaveClass("table-fixed");
    });
    it("permite un mini listado sin controles de paginacion y conserva las filas", () => {
        render(
            <DataTable
                columns={[{ key: "nombre", header: "Banco" }]}
                data={[{ id: 1, nombre: "Scotiabank" }]}
                isLoading={false}
                page={1}
                totalPages={1}
                pageSize={20}
                onPageChange={vi.fn()}
                onPageSizeChange={vi.fn()}
                density="compact"
                hidePagination
            />,
        );
        expect(screen.getByText("Scotiabank")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Página siguiente" })).toBeNull();
        expect(screen.queryByText("20 por página")).toBeNull();
    });
    it("permite cabecera de selección y ajuste de párrafos sin cambiar el modo por defecto", () => {
        render(
            <DataTable
                columns={[{ key: "persona", header: <span>Selección y persona</span> }]}
                data={[{ id: 1, persona: "Nombre largo que debe poder ocupar varias líneas" }]}
                wrapText
                isLoading={false}
                page={1}
                totalPages={1}
                pageSize={20}
                onPageChange={vi.fn()}
                onPageSizeChange={vi.fn()}
            />,
        );
        expect(screen.getByRole("table").className).toContain("table-fixed");
        expect(screen.getByRole("cell").className).toContain("whitespace-normal");
        expect(screen.getByRole("columnheader").textContent).toBe("Selección y persona");
    });
    it("muestra los resultados nuevos al reemplazar varias filas por un filtro", async () => {
        const props = {
            columns: [{ key: "nombre", header: "Persona" }],
            page: 1,
            totalPages: 1,
            pageSize: 20,
            isLoading: false,
            onPageChange: vi.fn(),
            onPageSizeChange: vi.fn(),
        };
        const view = render(
            <DataTable
                {...props}
                data={[
                    { id: 1, nombre: "Anterior A" },
                    { id: 2, nombre: "Anterior B" },
                    { id: 3, nombre: "Anterior C" },
                ]}
            />,
        );
        view.rerender(<DataTable {...props} data={[{ id: 2, nombre: "Resultado filtrado B" }]} />);
        expect(await screen.findByText("Resultado filtrado B")).toBeTruthy();
        view.rerender(
            <DataTable
                {...props}
                data={[
                    { id: 4, nombre: "Nuevo resultado D" },
                    { id: 5, nombre: "Nuevo resultado E" },
                ]}
            />,
        );
        expect(await screen.findByText("Nuevo resultado D")).toBeTruthy();
        expect(await screen.findByText("Nuevo resultado E")).toBeTruthy();
    });
    it("expone una región de scroll accesible y controles con nombre", () => {
        const change = vi.fn();
        render(
            <DataTable
                columns={[{ key: "nombre", header: "Persona" }]}
                data={[{ id: 99, nombre: "Persona ficticia" }]}
                isLoading={false}
                page={1}
                totalPages={2}
                pageSize={20}
                onPageChange={change}
                onPageSizeChange={() => {}}
            />,
        );
        expect(screen.getByRole("region").getAttribute("tabindex")).toBe("0");
        expect(screen.queryByText("99")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
        expect(change).toHaveBeenCalledWith(2);
        expect((screen.getByRole("button", { name: "Página anterior" }) as HTMLButtonElement).disabled).toBe(true);
    });
    it("no permite cambiar de página mientras carga", () => {
        render(
            <DataTable
                columns={[{ key: "nombre", header: "Persona" }]}
                data={[]}
                isLoading
                page={2}
                totalPages={3}
                pageSize={20}
                onPageChange={() => {}}
                onPageSizeChange={() => {}}
            />,
        );
        expect(screen.getByRole("region").getAttribute("aria-busy")).toBe("true");
        for (const label of ["Página siguiente", "Página anterior"])
            expect((screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(true);
    });
});
