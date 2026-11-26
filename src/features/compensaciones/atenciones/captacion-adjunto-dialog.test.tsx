import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AlertProvider } from "@/components/shared/alert-center";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CaptacionAdjuntoDialog } from "./captacion-adjunto-dialog";

vi.mock("@/components/application/file-upload/file-upload-base", () => ({
    FileUpload: {
        DropZone: ({ onDropFiles }: { onDropFiles: (files: File[]) => void }) => (
            <input type="file" aria-label="Captura" onChange={(event) => onDropFiles(Array.from(event.target.files ?? []))} />
        ),
    },
}));
afterEach(cleanup);

it.each([
    [new File(["invalid"], "documento.pdf", { type: "application/pdf" }), "Adjunta una imagen JPG, PNG o WEBP"],
    [new File([new Uint8Array(5 * 1024 * 1024 + 1)], "grande.png", { type: "image/png" }), "La captura supera los 5 MB"],
])("rechaza una captura inválida y conserva la selección previa", async (invalid, error) => {
    const initial = new File(["image"], "original.png", { type: "image/png" });
    const apply = vi.fn();
    render(
        <AlertProvider>
            <CaptacionAdjuntoDialog initial={initial} onClose={vi.fn()} onApply={apply} />
        </AlertProvider>,
    );
    fireEvent.change(screen.getByLabelText("Captura"), { target: { files: [invalid] } });
    expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent(error);
    expect(screen.getByText("original.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(apply).not.toHaveBeenCalled();
    const valid = new File(["image"], "nueva.webp", { type: "image/webp" });
    fireEvent.change(screen.getByLabelText("Captura"), { target: { files: [valid] } });
    await waitFor(() => expect(screen.queryByRole("alert", { hidden: true })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(apply).toHaveBeenCalledWith(valid);
});

it("quitar requiere aplicar el cambio y cancelar no cambia el adjunto original", () => {
    const initial = new File(["image"], "original.png", { type: "image/png" });
    const apply = vi.fn(),
        close = vi.fn();
    const view = render(<CaptacionAdjuntoDialog initial={initial} onClose={close} onApply={apply} />);
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(screen.queryByText("original.png")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(close).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
    view.unmount();
    render(<CaptacionAdjuntoDialog initial={initial} onClose={close} onApply={apply} />);
    expect(screen.getByText("original.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(apply).toHaveBeenCalledWith(null);
});
