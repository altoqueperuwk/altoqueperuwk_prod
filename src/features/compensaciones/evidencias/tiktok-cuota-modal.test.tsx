import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { EvidenciaDetailModal } from "./evidencia-detail-modal";
import type { EvidenciaEvento } from "./evidencias.types";

const mocks = vi.hoisted(() => ({ getTiktokQuota: vi.fn(), reviewTiktokQuota: vi.fn(), resolve: vi.fn() }));
const profile = vi.hoisted(() => ({ isAdministrator: true, isAdvisor: false, isStoreManager: false, userId: 1 }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => profile }));

vi.mock("./evidencias.service", () => ({ evidenciasService: mocks }));
vi.mock("../shared/compensacion-surface", () => ({ CompensacionSurface: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const item = {
    id: 7,
    tipoCodigo: "TIKTOK_LIVE",
    tipoNombre: "TikTok Live",
    categoria: "OTRO",
    estado: "PENDIENTE",
    fechaEvento: "2026-10-29T09:00:00-05:00",
    usuarioRegistraId: 3,
    datos: { flujo: "TIKTOK_CLIENTE_NUEVO_7_DIAS" },
    importeAprobado: null,
    evidencia: [],
    revisiones: [],
    referencias: [],
    tarifaRegistro: { tipoCalculo: "POR_UNIDAD", valor: 0.3 },
} as unknown as EvidenciaEvento;
const changed = vi.fn();
beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(profile, { isAdministrator: true, isAdvisor: false, isStoreManager: false, userId: 1 });
    mocks.getTiktokQuota.mockResolvedValue({ requiereCuota: true, cuotaCumplida: null, comentario: "", fecha: null });
    mocks.reviewTiktokQuota.mockResolvedValue({});
});
afterEach(cleanup);
const open = () => render(<EvidenciaDetailModal item={item} onClose={vi.fn()} onChanged={changed} />);
const comment = (value: string) => fireEvent.change(screen.getByRole("textbox", { name: /Comentario de revisión/ }), { target: { value } });

describe("Cuota de Jefatura en el detalle TikTok", () => {
    it.each([true, false])("guarda resultado %s exclusivamente con la RPC de cuota", async (met) => {
        open();
        const save = await screen.findByRole("button", { name: "Guardar Revisión de Cuota" });
        if (met) fireEvent.click(screen.getByRole("checkbox", { name: "Cuota de Efectivizaciones Cumplida" }));
        comment("Sustento de sede revisado");
        fireEvent.click(save);
        await waitFor(() => expect(mocks.reviewTiktokQuota).toHaveBeenCalledExactlyOnceWith(7, "Sustento de sede revisado", met));
        await waitFor(() => expect(changed).toHaveBeenCalledOnce());
        expect(mocks.resolve).not.toHaveBeenCalled();
        for (const name of ["Aprobar", "Rechazar", "Observar"]) expect(screen.queryByRole("button", { name })).toBeNull();
        expect(screen.queryByLabelText("Monto base (S/)")).toBeNull();
        expect(screen.queryByRole("spinbutton")).toBeNull();
    });

    it("exige comentario y muestra el error RPC sin informar éxito", async () => {
        open();
        const save = await screen.findByRole("button", { name: "Guardar Revisión de Cuota" });
        fireEvent.click(save);
        expect(mocks.reviewTiktokQuota).not.toHaveBeenCalled();
        mocks.reviewTiktokQuota.mockRejectedValue({ message: "El periodo está cerrado" });
        comment("Sustento");
        fireEvent.click(save);
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "El periodo está cerrado"));
        expect(changed).not.toHaveBeenCalled();
        expect(alertSpy.mock.calls.some(([type]) => type === "success")).toBe(false);
    });

    it.each(["jefe", "atc", "autor", "readOnly"])('no permite autorrevisión ni revisión al perfil "%s"', async (kind) => {
        if (kind === "jefe") Object.assign(profile, { isAdministrator: false, isStoreManager: true, userId: 3 });
        if (kind === "atc") Object.assign(profile, { isAdministrator: false, isAdvisor: true, userId: 4 });
        if (kind === "autor") profile.userId = 3;
        render(<EvidenciaDetailModal item={item} readOnly={kind === "readOnly"} onClose={vi.fn()} onChanged={changed} />);
        if (profile.isAdministrator) await screen.findByText("Cuota pendiente de revisión administrativa");
        else expect(mocks.getTiktokQuota).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Guardar Revisión de Cuota" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
        expect(screen.queryByRole("checkbox")).toBeNull();
        expect(mocks.reviewTiktokQuota).not.toHaveBeenCalled();
    });

    it("no exige cuota a registros que el servidor identifica como ATC", async () => {
        mocks.getTiktokQuota.mockResolvedValue({ requiereCuota: false, cuotaCumplida: null, comentario: "", fecha: null });
        open();
        await screen.findByText("Este registro no requiere revisión de cuota de Jefatura.");
        expect(screen.queryByRole("button", { name: "Guardar Revisión de Cuota" })).toBeNull();
    });

    it("permite reintentar una consulta fallida sin habilitar controles con datos antiguos", async () => {
        mocks.getTiktokQuota.mockRejectedValueOnce(new Error("No se pudo cargar"));
        open();
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("No se pudo cargar");
        expect(screen.queryByRole("button", { name: "Guardar Revisión de Cuota" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
        await screen.findByRole("button", { name: "Guardar Revisión de Cuota" });
        expect(mocks.getTiktokQuota).toHaveBeenCalledTimes(2);
    });

    it("ignora una consulta tardía al cambiar de evidencia", async () => {
        let finish!: (value: unknown) => void;
        mocks.getTiktokQuota.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        const view = open();
        const other = { ...item, id: 8 };
        mocks.getTiktokQuota.mockResolvedValue({ requiereCuota: false, cuotaCumplida: null, comentario: "", fecha: null });
        view.rerender(<EvidenciaDetailModal item={other} onClose={vi.fn()} onChanged={changed} />);
        await screen.findByText("Este registro no requiere revisión de cuota de Jefatura.");
        finish({ requiereCuota: true, cuotaCumplida: true, comentario: "Respuesta anterior", fecha: null });
        await waitFor(() => expect(screen.queryByText("Respuesta anterior")).toBeNull());
        expect(screen.queryByRole("button", { name: "Guardar Revisión de Cuota" })).toBeNull();
    });

    it("muestra una revisión previa con comentario sin aprobar el evento", async () => {
        mocks.getTiktokQuota.mockResolvedValue({
            requiereCuota: true,
            cuotaCumplida: false,
            comentario: "Falta sustento de cumplimiento",
            fecha: "2026-10-29T15:00:00Z",
        });
        open();
        await screen.findByText("Falta sustento de cumplimiento");
        expect(screen.getByRole("checkbox")).not.toBeChecked();
        expect(screen.getByText("Cuota no confirmada como cumplida; pendiente de revisión")).toBeTruthy();
        expect(mocks.resolve).not.toHaveBeenCalled();
    });
});
