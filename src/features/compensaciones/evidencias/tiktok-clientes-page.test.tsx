import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ClientesNuevosPage } from "../atenciones/clientes-nuevos-page";

const mocks = vi.hoisted(() => ({ list: vi.fn(), validate: vi.fn(), register: vi.fn(), ordinary: vi.fn() }));
vi.mock("./tiktok-clientes.service", () => ({ tiktokClientesService: { list: mocks.list, validate: mocks.validate, register: mocks.register } }));
vi.mock("../atenciones/clientes-nuevos.service", () => ({ clientesNuevosService: { register: mocks.ordinary } }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));

vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ comunidades: [{ id: 1, nombre: "ATK1" }] }) }));
vi.mock("@/components/application/file-upload/file-upload-base", () => ({
    FileUpload: {
        DropZone: ({ onDropFiles, isDisabled }: { onDropFiles: (files: File[]) => void; isDisabled: boolean }) => (
            <input type="file" aria-label="Captura TikTok" disabled={isDisabled} onChange={(event) => onDropFiles(Array.from(event.target.files ?? []))} />
        ),
    },
}));
beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ items: [], total: 0, esperando: 0, habilitados: 0, bloqueados: 0, total_comision: 0 });
    mocks.validate.mockResolvedValue({ existe: false });
    mocks.register.mockResolvedValue({ id: 1, fecha_registro: "2026-10-26T15:00:00Z" });
});
afterEach(cleanup);

it("registra cliente y captura en el flujo TikTok sin exigir una operación previa", async () => {
    render(<ClientesNuevosPage tiktok />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Buscar operación pagada" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: /Nro. Documento/ }), { target: { value: "70176064" } });
    await screen.findByText(/El cliente es apto/);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Cliente TikTok QA" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText(/Revisa los datos/)).toBeInTheDocument();
    expect(screen.getByText(/Adjunta la captura de TikTok Live\./i)).toBeInTheDocument();
    expect(mocks.register).not.toHaveBeenCalled();
    const capture = new File(["qa"], "captura.png", { type: "image/png" });
    expect(screen.queryByLabelText("Captura TikTok")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Adjuntar" }));
    const attachment = within(await screen.findByRole("dialog", { name: "Adjuntar Captura TikTok Live" }));
    fireEvent.change(attachment.getByLabelText("Captura TikTok"), { target: { files: [capture] } });
    expect(attachment.getByText("captura.png")).toBeInTheDocument();
    expect(mocks.register).not.toHaveBeenCalled();
    fireEvent.click(attachment.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Adjuntar (1)" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("Cliente TikTok QA");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.register).toHaveBeenCalledWith("70176064", "Cliente TikTok QA", 1, "", 1, capture));
    expect(mocks.ordinary).not.toHaveBeenCalled();
    expect(await screen.findByText(/primera operación pagada dentro de siete días/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.any(String), 1, 20, expect.objectContaining({ documento: "" })));
    expect(screen.getByRole("heading", { name: "TikTok Live" })).toBeInTheDocument();
    expect(mocks.ordinary).not.toHaveBeenCalled();
    // Validación, adjunto y formulario completos con portales/foco React Aria bajo carga concurrente.
}, 15000);

it("una cuenta de consulta no recibe formulario ni edición de clientes", async () => {
    mocks.list.mockResolvedValue({
        items: [
            {
                id: 1,
                nombre: "CLIENTE DEMOSTRACIÓN",
                documento: "70176064",
                fecha_registro: "2026-10-26T15:00:00Z",
                vence: "2026-11-02T15:00:00Z",
                estado: "ESPERANDO_OPERACION",
                puede_editar: true,
            },
        ],
        total: 1,
        esperando: 1,
        habilitados: 0,
        bloqueados: 0,
        total_comision: 0,
    });
    render(<ClientesNuevosPage tiktok readOnly />);
    expect(await screen.findByText("Cliente Demostración")).toHaveAttribute("title", "CLIENTE DEMOSTRACIÓN");
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Editar cliente" })).toBeNull();
    expect(
        screen
            .getAllByRole("columnheader")
            .slice(0, 2)
            .map((h) => h.textContent),
    ).toEqual(["DNI", "Cliente"]);
});
