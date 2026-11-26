import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CalificacionEnlace } from "./calificacion-enlace";
import { CalificacionPublicaPage } from "./calificacion-publica-page";
import { calificacionUrl } from "./calificacion-publica.service";

const mocks = vi.hoisted(() => ({ publica: vi.fn(), asesores: vi.fn(), generar: vi.fn(), append: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("./calificacion-publica.service", async (original) => ({
    ...(await original<object>()),
    calificacionPublicaService: { publica: mocks.publica, asesores: mocks.asesores, generar: mocks.generar },
}));
vi.mock("qr-code-styling", () => ({
    default: class {
        append = mocks.append;
        download = mocks.download;
    },
}));
vi.mock("./calificacion-captcha", () => ({
    CalificacionCaptcha: ({ onToken }: { onToken: (s: string) => void }) => <button onClick={() => onToken("captcha-test")}>Verificar seguridad</button>,
}));
vi.mock("@/components/base/select/select", () => {
    const Select = ({ label, items, onSelectionChange }: { label: string; items: { id: number; label: string }[]; onSelectionChange: (s: string) => void }) => (
        <label>
            {label}
            <select aria-label={label} onChange={(e) => onSelectionChange(e.target.value)}>
                <option value="">Seleccionar</option>
                {items.map((r) => (
                    <option key={r.id} value={r.id}>
                        {r.label}
                    </option>
                ))}
            </select>
        </label>
    );
    Select.Item = () => null;
    return { Select };
});
const token = "a".repeat(64);
const context = {
    asesor: "Asesor de prueba",
    sede: "Sede Lince",
    politica: { dni_obligatorio: true, comentario_obligatorio: false, asesor_obligatorio: true },
};
const show = (path = `/calificar/${token}`) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/calificar/:token" element={<CalificacionPublicaPage />} />
            </Routes>
        </MemoryRouter>,
    );
beforeEach(() => {
    vi.clearAllMocks();
    mocks.publica.mockImplementation(async (body) => (body.action === "contexto" ? context : { recibido: true }));
    mocks.asesores.mockResolvedValue([{ id: 1, nombre: "Asesor de prueba", sede: "Lince" }]);
    mocks.generar.mockResolvedValue(token);
});
afterEach(cleanup);
describe("Calificación pública", () => {
    it("abre sin autenticación, carga asesor por token y no muestra selectores internos", async () => {
        show();
        expect(await screen.findByText(context.asesor)).toBeTruthy();
        expect(mocks.publica).toHaveBeenCalledWith({ action: "contexto", token });
        expect(screen.queryByRole("combobox")).toBeNull();
        expect(screen.queryByLabelText(/contraseña/i)).toBeNull();
    });
    it("rechaza enlaces inválidos sin llamar al servidor", async () => {
        show("/calificar/15");
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Enlace no disponible");
        expect(mocks.publica).not.toHaveBeenCalled();
    });
    it("no permite enviar sin CAPTCHA y exige estrellas y DNI", async () => {
        show();
        await screen.findByText(context.asesor);
        expect(screen.getByRole("button", { name: "Enviar calificación" })).toHaveProperty("disabled", true);
        fireEvent.click(screen.getByText("Verificar seguridad"));
        fireEvent.click(screen.getByRole("button", { name: "Enviar calificación" }));
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Selecciona las estrellas y completa los campos requeridos");
        expect(mocks.publica).toHaveBeenCalledTimes(1);
    });
    it("envía una respuesta sin IDs, fecha ni importes manipulables", async () => {
        show();
        await screen.findByText(context.asesor);
        fireEvent.click(screen.getByRole("radio", { name: "5 estrellas" }));
        fireEvent.change(screen.getByRole("textbox", { name: /^DNI/ }), { target: { value: "01234567" } });
        fireEvent.click(screen.getByText("Verificar seguridad"));
        fireEvent.click(screen.getByRole("button", { name: "Enviar calificación" }));
        await screen.findByText("Gracias por tu calificación");
        expect(mocks.publica.mock.lastCall?.[0]).toEqual({
            action: "enviar",
            token,
            clave: expect.any(String),
            estrellas: 5,
            dni: "01234567",
            comentario: "",
            captcha: "captcha-test",
        });
        expect(screen.queryByRole("button", { name: "Enviar calificación" })).toBeNull();
    });
    it("reutiliza la clave tras una falla de red sin afirmar que se guardó", async () => {
        mocks.publica.mockResolvedValueOnce(context).mockRejectedValueOnce(new Error("Sin conexión")).mockResolvedValueOnce({ recibido: true });
        show();
        await screen.findByText(context.asesor);
        fireEvent.click(screen.getByRole("radio", { name: "1 estrella" }));
        fireEvent.change(screen.getByRole("textbox", { name: /^DNI/ }), { target: { value: "01234567" } });
        fireEvent.click(screen.getByText("Verificar seguridad"));
        fireEvent.click(screen.getByRole("button", { name: "Enviar calificación" }));
        await screen.findByText("Sin conexión");
        expect(screen.queryByText("Gracias por tu calificación")).toBeNull();
        fireEvent.click(screen.getByText("Verificar seguridad"));
        fireEvent.click(screen.getByRole("button", { name: "Enviar calificación" }));
        await screen.findByText("Gracias por tu calificación");
        expect(mocks.publica.mock.calls[1][0].clave).toBe(mocks.publica.mock.calls[2][0].clave);
    });
    it("pide confirmación antes de reemplazar un QR", async () => {
        render(<CalificacionEnlace />);
        fireEvent.click(screen.getByText("Compartir enlace y QR"));
        await waitFor(() => expect(mocks.asesores).toHaveBeenCalled());
        fireEvent.click(screen.getByText("Generar nuevo enlace"));
        expect(mocks.generar).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText("Confirmar generación"));
        await waitFor(() => expect(mocks.generar).toHaveBeenCalledWith(1));
        expect(await screen.findByRole("link")).toHaveAttribute("href", expect.stringContaining(`/calificar/${token}`));
        expect(mocks.append).toHaveBeenCalledTimes(1);
    });
    it("construye una URL HTTPS sin parámetros ni IDs y rechaza hosts inseguros", () => {
        expect(calificacionUrl(token, "https://pruebas.example.com/otro")).toBe(`https://pruebas.example.com/calificar/${token}`);
        expect(() => calificacionUrl(token, "http://example.com")).toThrow(/HTTPS/);
        expect(() => calificacionUrl("15", "https://example.com")).toThrow(/inválido/);
    });
});
