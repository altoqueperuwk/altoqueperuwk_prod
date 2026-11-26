import type { ReactNode } from "react";
import { cleanup, fireEvent, render as renderLegacy, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastContainer } from "@/components/application/toast-container";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ToastProvider } from "@/providers/toast-provider";
import { MiEnlaceQrAcciones } from "./mi-enlace-qr-acciones";

const mocks = vi.hoisted(() => ({ propia: vi.fn(), append: vi.fn(), download: vi.fn(), copy: vi.fn(), copyQr: vi.fn(), raw: vi.fn() }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/features/compensaciones/evidencias/calificacion-publica.service", async (original) => ({
    ...(await original<object>()),
    calificacionPublicaService: { propia: mocks.propia },
}));
vi.mock("qr-code-styling", () => ({
    default: class {
        append = mocks.append;
        download = mocks.download;
        getRawData = mocks.raw;
    },
}));
const link = { asesor: "Asesor de prueba", sede: "Sede Sur", token: "a".repeat(64), expira: "2027-10-09T12:00:00Z" };
beforeEach(() => {
    vi.clearAllMocks();
    mocks.propia.mockResolvedValue(link);
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: mocks.copy.mockResolvedValue(undefined), write: mocks.copyQr.mockResolvedValue(undefined) },
    });
    vi.stubGlobal(
        "ClipboardItem",
        class {
            constructor(public data: unknown) {}
        },
    );
    mocks.raw.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});
describe("Mi enlace y QR", () => {
    it("carga el enlace propio sin selector de asesor y deja los dos botones listos", async () => {
        render(<MiEnlaceQrAcciones />);
        await waitFor(() => expect(screen.getByRole("button", { name: "Mostrar QR" })).toBeEnabled());
        expect(mocks.propia).toHaveBeenCalledWith();
        expect(screen.queryByRole("combobox")).toBeNull();
        expect(screen.getByRole("button", { name: "Copiar enlace" })).toBeEnabled();
        expect(mocks.append).not.toHaveBeenCalled();
    });
    it("Copiar enlace solo copia y avisa, sin abrir el QR ni regenerar", async () => {
        render(<MiEnlaceQrAcciones />);
        await waitFor(() => expect(screen.getByRole("button", { name: "Copiar enlace" })).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: "Copiar enlace" }));
        await screen.findByText("Enlace copiado.");
        expect(mocks.copy).toHaveBeenCalledWith(expect.stringContaining(`/calificar/${link.token}`));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(mocks.propia).toHaveBeenCalledTimes(1);
    });
    it("Mostrar QR abre el popup con Copiar QR y Renovar QR/Enlace", async () => {
        render(<MiEnlaceQrAcciones />);
        await waitFor(() => expect(screen.getByRole("button", { name: "Mostrar QR" })).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: "Mostrar QR" }));
        expect(await screen.findByRole("dialog", { name: "QR de Calificación" })).toBeVisible();
        await waitFor(() => expect(mocks.append).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole("button", { name: "Copiar QR" }));
        await screen.findByText("QR copiado.");
        expect(mocks.raw).toHaveBeenCalledWith("png");
        expect(mocks.copyQr).toHaveBeenCalledWith([expect.objectContaining({ data: { "image/png": expect.any(Blob) } })]);
        expect(mocks.propia).toHaveBeenCalledTimes(1);
    });
    it("cancelar conserva el enlace y confirmar solicita la rotación propia sin IDs", async () => {
        render(<MiEnlaceQrAcciones />);
        await waitFor(() => expect(screen.getByRole("button", { name: "Mostrar QR" })).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: "Mostrar QR" }));
        fireEvent.click(await screen.findByRole("button", { name: "Renovar QR/Enlace" }));
        fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
        expect(mocks.propia).toHaveBeenCalledTimes(1);
        mocks.propia.mockResolvedValue({ ...link, token: "b".repeat(64) });
        fireEvent.click(screen.getByRole("button", { name: "Renovar QR/Enlace" }));
        fireEvent.click(screen.getByRole("button", { name: "Confirmar regeneración" }));
        await screen.findByText(/Nuevo enlace y QR disponibles/);
        expect(mocks.propia).toHaveBeenLastCalledWith(true);
        fireEvent.click(screen.getAllByRole("button", { name: "Cerrar QR" })[0]);
        fireEvent.click(await screen.findByRole("button", { name: "Copiar enlace" }));
        await waitFor(() => expect(mocks.copy).toHaveBeenLastCalledWith(expect.stringContaining("b".repeat(64))));
    });
    it("muestra errores de autorización sin QR falso y permite reintentar", async () => {
        mocks.propia.mockRejectedValueOnce({ message: "Solo asesores activos" });
        render(<MiEnlaceQrAcciones />);
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Solo asesores activos");
        expect(screen.queryByRole("button", { name: "Mostrar QR" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Reintentar enlace" }));
        await waitFor(() => expect(screen.getByRole("button", { name: "Mostrar QR" })).toBeEnabled());
        expect(mocks.propia).toHaveBeenCalledTimes(2);
    });
    it("conserva el toast clásico cuando se usa fuera de Compensaciones", async () => {
        renderLegacy(
            <ToastProvider>
                <MiEnlaceQrAcciones />
                <ToastContainer />
            </ToastProvider>,
        );
        await waitFor(() => expect(screen.getByRole("button", { name: "Copiar enlace" })).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: "Copiar enlace" }));
        expect(await screen.findByText("Enlace copiado")).toBeInTheDocument();
        expect(screen.queryByText("Listo")).toBeNull();
    });
});
