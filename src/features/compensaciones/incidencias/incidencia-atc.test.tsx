import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { IncidenciaDetailModal } from "./incidencia-detail-modal";
import type { IncidenciaEvento } from "./incidencias.types";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), observe: vi.fn(), send: vi.fn(), updateDraft: vi.fn(), annul: vi.fn(), isAdvisor: true }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => ({ isAdvisor: mocks.isAdvisor, isResolving: false, userId: 24 }) }));

vi.mock("./incidencias.service", () => ({ incidenciasService: mocks }));
afterEach(() => {
    cleanup();
    vi.resetAllMocks();
    mocks.isAdvisor = true;
});
it("ATC consulta el motivo y trazabilidad sin decidir descuentos", async () => {
    const item = {
        id: 1,
        estado: "PENDIENTE",
        fechaEvento: "2026-10-17T09:00:00-05:00",
        penalidadNombre: "Reporte de prueba",
        motivo: "Motivo de prueba",
        responsableNombre: "Responsable",
        montoReferencia: 10,
        montoBonoReportante: null,
        importeAprobado: null,
        requiereRespuesta: false,
        evidencia: [],
        revisiones: [],
    } as unknown as IncidenciaEvento;
    render(<IncidenciaDetailModal item={item} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText("Motivo de prueba")).toBeTruthy();
    for (const name of ["Aprobar", "Rechazar", "Observar"]) expect(screen.queryByRole("button", { name })).toBeNull();
});
it("solo el responsable ve el descargo; el reportante no puede responder por él", () => {
    const item = {
        id: 2,
        estado: "PENDIENTE",
        fechaEvento: "2026-10-17T09:00:00-05:00",
        penalidadNombre: "Reporte",
        requiereRespuesta: true,
        responsableId: 15,
        reportanteId: 16,
        usuarioRegistraId: 30,
        evidencia: [],
        revisiones: [],
        montoReferencia: 10,
        importeAprobado: null,
    } as unknown as IncidenciaEvento;
    const view = render(<IncidenciaDetailModal item={item} actorCollaboratorId={16} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Presentar descargo" })).toBeNull();
    expect(screen.queryByLabelText("Comentario")).toBeNull();
    view.rerender(<IncidenciaDetailModal item={item} actorCollaboratorId={15} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Presentar descargo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
});
it("un borrador ajeno no ofrece envío ni anulación", () => {
    const item = {
        id: 3,
        estado: "BORRADOR",
        fechaEvento: "2026-10-17T09:00:00-05:00",
        penalidadNombre: "Borrador",
        usuarioRegistraId: 30,
        reportanteId: 16,
        responsableId: 15,
        evidencia: [],
        revisiones: [],
        montoReferencia: 10,
        importeAprobado: null,
    } as unknown as IncidenciaEvento;
    const view = render(<IncidenciaDetailModal item={item} actorCollaboratorId={15} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Enviar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Anular" })).toBeNull();
    view.rerender(<IncidenciaDetailModal item={{ ...item, usuarioRegistraId: 24 }} actorCollaboratorId={15} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Enviar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anular" })).toBeTruthy();
});
it("el reportante puede corregir un borrador observado y guardar título y motivo sin perder la evidencia anterior", async () => {
    mocks.updateDraft.mockResolvedValue({});
    const changed = vi.fn();
    const item = {
        id: 4,
        estado: "BORRADOR",
        fechaEvento: "2026-10-17T09:00:00-05:00",
        titulo: "Título previo",
        motivo: "Motivo previo",
        evidencia: [{ tipo: "ENLACE", url: "https://example.com/anterior" }],
        usuarioRegistraId: 24,
        reportanteId: 16,
        responsableId: 15,
        revisiones: [],
        montoReferencia: 10,
        importeAprobado: null,
    } as unknown as IncidenciaEvento;
    render(<IncidenciaDetailModal item={item} onClose={vi.fn()} onChanged={changed} actorCollaboratorId={16} />);
    fireEvent.click(screen.getByRole("button", { name: "Corregir" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Título/ }), { target: { value: "Título corregido" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Motivo del reporte/ }), { target: { value: "Motivo corregido" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    await waitFor(() =>
        expect(mocks.updateDraft).toHaveBeenCalledWith(4, {
            titulo: "Título corregido",
            motivo: "Motivo corregido",
            evidenciaUrl: "https://example.com/anterior",
        }),
    );
    expect(changed).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
});
it("un motivo vacío no se guarda al corregir", () => {
    const item = {
        id: 5,
        estado: "BORRADOR",
        fechaEvento: "2026-10-17T09:00:00-05:00",
        motivo: "Motivo",
        evidencia: [],
        usuarioRegistraId: 24,
        reportanteId: 16,
        responsableId: 15,
        revisiones: [],
        montoReferencia: 10,
        importeAprobado: null,
    } as unknown as IncidenciaEvento;
    render(<IncidenciaDetailModal item={item} onClose={vi.fn()} onChanged={vi.fn()} actorCollaboratorId={16} />);
    fireEvent.click(screen.getByRole("button", { name: "Corregir" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Motivo del reporte/ }), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    expect(mocks.updateDraft).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("validation", "El motivo es obligatorio.");
});
it("el revisor devuelve el reporte observado al estado borrador y requiere motivo para rechazar", async () => {
    mocks.isAdvisor = false;
    mocks.observe.mockResolvedValue({});
    const changed = vi.fn();
    const item = {
        id: 6,
        estado: "PENDIENTE",
        fechaEvento: "2026-10-17T09:00:00-05:00",
        motivo: "Motivo",
        evidencia: [],
        usuarioRegistraId: 30,
        reportanteId: 16,
        responsableId: 15,
        revisiones: [],
        montoReferencia: 10,
        importeAprobado: null,
    } as unknown as IncidenciaEvento;
    render(<IncidenciaDetailModal item={item} onClose={vi.fn()} onChanged={changed} />);
    fireEvent.click(screen.getByRole("button", { name: "Observar" }));
    fireEvent.click(screen.getByRole("button", { name: "Observar" }));
    expect(mocks.observe).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: /Comentario/ }), { target: { value: "Falta sustento verificable" } });
    const observe = screen.getByRole("button", { name: "Observar" });
    fireEvent.click(observe);
    fireEvent.click(observe);
    await waitFor(() => expect(mocks.observe).toHaveBeenCalledTimes(1));
    expect(mocks.observe).toHaveBeenCalledWith(6, "Falta sustento verificable");
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
});
it("el revisor exige comentario antes de rechazar una incidencia", async () => {
    mocks.isAdvisor = false;
    mocks.resolve.mockResolvedValue({});
    const item = {
        id: 7,
        estado: "PENDIENTE",
        fechaEvento: "2026-10-17T09:00:00-05:00",
        motivo: "Motivo",
        evidencia: [],
        usuarioRegistraId: 30,
        reportanteId: 16,
        responsableId: 15,
        revisiones: [],
        montoReferencia: 10,
        importeAprobado: null,
    } as unknown as IncidenciaEvento;
    render(<IncidenciaDetailModal item={item} onClose={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("validation", "Ingresa el comentario o motivo.");
    fireEvent.change(screen.getByRole("textbox", { name: /Comentario/ }), { target: { value: "Reporte sin sustento" } });
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith(7, "RECHAZADO", "Reporte sin sustento"));
});
