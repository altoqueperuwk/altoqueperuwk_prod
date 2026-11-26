import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompensacionDataTable } from "./compensacion-data-table";

vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));
vi.mock("@/providers/toast-provider", () => ({ useToast: () => ({ addToast: vi.fn() }) }));

afterEach(cleanup);
describe("CompensacionDataTable", () => {
    it("no crea scroll vertical interno: el único scroll vertical es el de la página o el modal", () => {
        render(
            <CompensacionDataTable
                columns={[{ key: "nombre", header: "Nombre" }]}
                data={[{ id: 1, nombre: "Ana" }]}
                isLoading={false}
                page={1}
                totalPages={1}
                pageSize={20}
                onPageChange={vi.fn()}
                onPageSizeChange={vi.fn()}
            />,
        );
        const region = screen.getByRole("region");
        expect(region).not.toHaveClass("overflow-y-auto");
        expect(region.style.maxHeight).toBe("");
    });
});
