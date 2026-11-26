import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "../shared/test-alerts";
import { PancakeAdjudicacionPage } from "./pancake-adjudicacion-page";
import { PancakeAdjudicacionPanel } from "./pancake-adjudicacion-panel";
import type { RankingMensual } from "./pancake-adjudicacion.service";

const mocks = vi.hoisted(() => ({ ranking: vi.fn(), importar: vi.fn(), certificar: vi.fn(), adjudicar: vi.fn(), configurar: vi.fn() }));
vi.mock("./pancake-adjudicacion.service", () => ({ pancakeAdjudicacionService: mocks }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));
vi.mock("@/components/application/file-upload/file-upload-base", () => ({
    FileUploadDropZone: ({ onDropFiles }: { onDropFiles: (files: File[]) => void }) => (
        <input type="file" aria-label="Original de Pancake" onChange={(event) => onDropFiles(Array.from(event.target.files ?? []))} />
    ),
}));
const mapping = { conversacion: "id", usuario: "agent", fecha: "date", efectiva: "status", valor_efectiva: "done" };
const ranking: RankingMensual = {
    periodo: "2026-11-01",
    criterio: "ATENCIONES",
    estado: "LISTO",
    version: "version-sintetica",
    certificada: true,
    candidatos: [
        {
            id_colaborador: 1,
            nombre: "EQUIPO DEMOSTRACIÓN",
            atenciones: 12,
            calificaciones: 3,
            presenciales: 4,
            puntualidad: { estado: "CONSERVA", motivo: "Validación sintética" },
            puesto: 1,
        },
    ],
};
beforeEach(() => {
    vi.clearAllMocks();
    mocks.ranking.mockResolvedValue(ranking);
    mocks.importar.mockResolvedValue({});
    mocks.certificar.mockResolvedValue({});
    mocks.adjudicar.mockResolvedValue({});
});
afterEach(cleanup);
const panel = () => <PancakeAdjudicacionPanel mes="2026-11-01" pagina="pagina-sintetica" mapeo={mapping} />;
const chooseFile = (name: string) => {
    fireEvent.click(screen.getByRole("button", { name: /^Adjuntar Original/ }));
    const file = new File(["[]"], name, { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Original de Pancake"), { target: { files: [file] } });
    return file;
};

it("muestra preparación y elegibilidad sin confundirlas con aprobación o pago", async () => {
    render(panel());
    expect(await screen.findByText("Listo para adjudicar")).toBeVisible();
    expect(screen.getByText("Equipo Demostración")).toHaveAttribute("title", "EQUIPO DEMOSTRACIÓN");
    expect(screen.getByText("Conserva")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
    expect(screen.queryByText(/^Pagado$|^Aprobado$/)).toBeNull();
    expect(screen.getByRole("button", { name: "Adjudicar" })).toBeDisabled();
});

it("aplicar conserva el original local, cancelar descarta el cambio y solo Importar lo envía", async () => {
    render(panel());
    await screen.findByText("Listo para adjudicar");
    expect(screen.queryByLabelText("Original de Pancake")).toBeNull();
    const original = chooseFile("original-sintetico.json");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Aplicar" }));
    expect(mocks.importar).not.toHaveBeenCalled();
    chooseFile("cambio-descartado.json");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("original-sintetico.json")).toBeVisible();
    expect(screen.queryByText("cambio-descartado.json")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: /Sustento de Revisión/ }), { target: { value: "Revisión sintética de cobertura completa" } });
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    await waitFor(() =>
        expect(mocks.importar).toHaveBeenCalledExactlyOnceWith("2026-11-01", "pagina-sintetica", original, mapping, "Revisión sintética de cobertura completa"),
    );
    expect(mocks.adjudicar).not.toHaveBeenCalled();
    expect(mocks.certificar).not.toHaveBeenCalled();
});

it("conserva el requisito de ranking listo y envía su versión completa al adjudicar", async () => {
    mocks.ranking.mockResolvedValueOnce({ ...ranking, estado: "SIN_FUENTE" });
    const view = render(panel());
    await screen.findByText("Sin fuente");
    fireEvent.change(screen.getByRole("textbox", { name: /Sustento de Revisión/ }), { target: { value: "Sustento sintético para revisión" } });
    expect(screen.getByRole("button", { name: "Adjudicar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await screen.findByText("Listo para adjudicar");
    expect(screen.getByRole("button", { name: "Adjudicar" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /Sustento de Revisión/ }), { target: { value: "Sustento sintético para revisión" } });
    fireEvent.click(screen.getByRole("button", { name: "Adjudicar" }));
    await waitFor(() => expect(mocks.adjudicar).toHaveBeenCalledExactlyOnceWith(ranking, "Sustento sintético para revisión"));
    view.unmount();
});

it("descarta respuestas de un periodo anterior", async () => {
    let finish!: (value: RankingMensual) => void;
    mocks.ranking.mockReturnValueOnce(
        new Promise((resolve) => {
            finish = resolve;
        }),
    );
    mocks.ranking.mockResolvedValueOnce({ ...ranking, estado: "SIN_CANDIDATOS", candidatos: [] });
    const view = render(panel());
    view.rerender(<PancakeAdjudicacionPanel mes="2026-12-01" pagina="pagina-sintetica" mapeo={mapping} />);
    await screen.findByText("Sin candidatos");
    await act(async () => finish(ranking));
    expect(screen.queryByText("Listo para adjudicar")).toBeNull();
    expect(screen.queryByText("Equipo Demostración")).toBeNull();
});

it.each(["JSON inválido", "{}"])("informa la estructura inválida antes de configurar: %s", async (value) => {
    render(<PancakeAdjudicacionPage />);
    fireEvent.click(screen.getByText("Configurar Fuente Pancake"));
    const identities = screen.getByRole("textbox", { name: /Identidades Verificadas/ });
    expect(identities).not.toHaveAttribute("aria-invalid", "true");
    fireEvent.change(screen.getByRole("textbox", { name: /Páginas Incluidas/ }), { target: { value: "pagina-sintetica" } });
    fireEvent.change(identities, { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(alertSpy).toHaveBeenCalledWith("validation", expect.stringMatching(/lista JSON/i));
    expect(identities).toHaveAttribute("aria-invalid", "true");
    expect(mocks.configurar).not.toHaveBeenCalled();
});
