import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { EvidenciaPopup } from "./evidencia-popup";
import type { EvidenciaTipo } from "./evidencias.types";

const mocks = vi.hoisted(() => ({
    manager: false,
    billing: false,
    create: vi.fn(),
    send: vi.fn(),
    registerInnovation: vi.fn(),
    searchTiktokOperations: vi.fn(),
    uploadTiktokEvidence: vi.fn(),
}));
vi.mock("./evidencias.service", () => ({ evidenciasService: mocks }));
vi.mock("../shared/compensacion-perfil", () => ({
    useCompensacionPerfil: () => ({
        isAdvisor: !mocks.manager && !mocks.billing,
        isStoreManager: mocks.manager,
        isFacturacion: mocks.billing,
        userId: 7,
        isResolving: false,
    }),
    advisorCanRegisterBonus: (code: string) => ["PROPUESTA_INNOVACION", "TIKTOK_LIVE"].includes(code),
}));

vi.mock("@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup", () => ({ useClienteLookup: () => ({ result: null, isLoading: false }) }));
afterEach(() => {
    cleanup();
    vi.resetAllMocks();
    mocks.manager = false;
    mocks.billing = false;
});
const type = { id: 1, codigo: "PROPUESTA_INNOVACION", nombre: "Idea", categoria: "OTRO", requiereBeneficiario: true } as EvidenciaTipo;
it.each(["Jefatura", "Facturación"])("%s guarda su innovación con captura atómica y atribución propia", async (profile) => {
    mocks.manager = profile === "Jefatura";
    mocks.billing = profile === "Facturación";
    mocks.registerInnovation.mockResolvedValue(5);
    render(
        <EvidenciaPopup
            isOpen
            inline
            onClose={vi.fn()}
            onSave={vi.fn()}
            types={[type]}
            collaborators={[
                { id: 22, idUsuario: 9, nombreCompleto: "Miembro del equipo", numeroDocumento: "99990002" },
                { id: 15, idUsuario: 7, nombreCompleto: "Jefe propio", numeroDocumento: "99990001" },
            ]}
        />,
    );
    await screen.findByRole("textbox", { name: /^Título/ });
    expect(screen.queryByRole("button", { name: /Usuario/ })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: /^Título/ }), { target: { value: "Propuesta propia" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Descripción/ }), { target: { value: "Descripción propia" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.registerInnovation).toHaveBeenCalledOnce());
    expect(mocks.registerInnovation.mock.calls[0][0].idBeneficiario).toBe(15);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
});
it.each(["Borrador", "Guardar"])("exige título y descripción sin espacios vacíos al %s", async (action) => {
    render(
        <EvidenciaPopup
            isOpen
            inline
            onClose={vi.fn()}
            onSave={vi.fn()}
            types={[type]}
            collaborators={[{ id: 15, nombreCompleto: "ATC propio", numeroDocumento: "99990001" }]}
        />,
    );
    const title = screen.getByRole("textbox", { name: /^Título/ });
    const description = screen.getByRole("textbox", { name: /^Descripción/ });
    expect(title).toBeRequired();
    expect(description).toBeRequired();
    fireEvent.change(title, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: action }));
    expect(alertSpy).toHaveBeenLastCalledWith("validation", "El título de la propuesta es obligatorio y la descripción de la propuesta es obligatoria.");
    fireEvent.change(title, { target: { value: "Propuesta válida" } });
    fireEvent.change(description, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: action }));
    expect(alertSpy).toHaveBeenLastCalledWith("validation", "La descripción de la propuesta es obligatoria.");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
});
it("atribuye una propuesta a la ficha propia y evita doble envío", async () => {
    mocks.registerInnovation.mockResolvedValue(5);
    render(
        <EvidenciaPopup
            isOpen
            inline
            onClose={vi.fn()}
            onSave={vi.fn()}
            types={[type]}
            collaborators={[{ id: 15, nombreCompleto: "ATC propio", numeroDocumento: "99990001" }]}
        />,
    );
    await screen.findByRole("textbox", { name: /^Título/ });
    expect(screen.queryByRole("button", { name: /Usuario/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Colaborador que recibe/ })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: /^Título/ }), { target: { value: "Propuesta QA" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Descripción/ }), { target: { value: "Descripción QA" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.registerInnovation).toHaveBeenCalledOnce());
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.registerInnovation.mock.calls[0][0].idBeneficiario).toBe(15);
});
it("TikTok vincula una operación pagada por DNI y código y requiere evidencia", async () => {
    mocks.create.mockResolvedValue(5);
    mocks.send.mockResolvedValue({});
    const image = new File(["captura"], "tiktok.png", { type: "image/png" });
    const attachment = {
        tipo: "IMAGEN_TIKTOK",
        bucket: "compensaciones-tiktok-live",
        path: "user/uuid.png",
        nombre: image.name,
        mime_type: image.type,
        size: image.size,
    };
    mocks.uploadTiktokEvidence.mockResolvedValue(attachment);
    mocks.searchTiktokOperations.mockResolvedValue({
        items: [
            {
                id: 81,
                codigo: "OP-81",
                id_cliente: 62,
                dni: "99990001",
                cliente: "Cliente nuevo",
                servicio: "EFECTIVIZACION",
                monto: 2500,
                fecha_deposito: "2026-10-05T10:00:00Z",
                estado: "PAGADO",
                elegible: true,
                motivo: null,
            },
        ],
    });
    render(
        <EvidenciaPopup
            isOpen
            inline
            onClose={vi.fn()}
            onSave={vi.fn()}
            types={[{ ...type, codigo: "TIKTOK_LIVE", requiereCliente: true, requiereOperacion: true }]}
            collaborators={[{ id: 15, nombreCompleto: "ATC propio", numeroDocumento: "99990001" }]}
        />,
    );
    expect(screen.queryByRole("textbox", { name: /Fecha y hora/ })).toBeNull();
    expect(screen.queryByText("Cliente relacionado")).toBeNull();
    expect(screen.queryByText(/Beneficiario:/)).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "99990001" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Operación/ }), { target: { value: "OP-81" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar operación pagada" }));
    await waitFor(() => expect(mocks.searchTiktokOperations).toHaveBeenCalledWith("OP-81", "99990001"));
    expect(screen.getByText(/OP-81 · EFECTIVIZACION/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Usar esta operación" }));
    fireEvent.change(screen.getByLabelText("Adjuntar imagen de TikTok Live"), { target: { files: [image] } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar esta operación" }));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledWith(5));
    expect(mocks.uploadTiktokEvidence).toHaveBeenCalledWith(image);
    const values = mocks.create.mock.calls[0][0];
    expect(values.operacionId).toBe(81);
    expect(values.clienteId).toBe(62);
    expect(mocks.create.mock.calls[0][1]).toEqual(attachment);
});
it("rechaza una operación que el servidor identifica fuera de los siete días", async () => {
    mocks.searchTiktokOperations.mockResolvedValue({
        items: [
            {
                id: 82,
                codigo: "OP-82",
                id_cliente: 62,
                dni: "99990001",
                cliente: "Cliente nuevo",
                servicio: "EFECTIVIZACION",
                monto: 2500,
                fecha_deposito: "2025-01-10T10:00:00Z",
                estado: "PAGADO",
                elegible: false,
                motivo: "Fuera del plazo de siete días",
            },
        ],
    });
    render(
        <EvidenciaPopup
            isOpen
            inline
            onClose={vi.fn()}
            onSave={vi.fn()}
            types={[{ ...type, codigo: "TIKTOK_LIVE", requiereCliente: true, requiereOperacion: true }]}
            collaborators={[{ id: 15, nombreCompleto: "ATC propio", numeroDocumento: "99990001" }]}
        />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "99990001" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Operación/ }), { target: { value: "OP-82" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar operación pagada" }));
    await waitFor(() => expect(mocks.searchTiktokOperations).toHaveBeenCalled());
    expect(await screen.findByText(/fuera del plazo/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Usar esta operación" })).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Registrar esta operación" })).toHaveProperty("disabled", true);
});
it("exige adjuntar la captura aunque la operación esté verificada", async () => {
    mocks.searchTiktokOperations.mockResolvedValue({
        items: [
            {
                id: 83,
                codigo: "OP-83",
                id_cliente: 62,
                dni: "99990001",
                cliente: "Cliente nuevo",
                servicio: "EFECTIVIZACION",
                monto: 2500,
                fecha_deposito: "2026-10-05T10:00:00Z",
                estado: "PAGADO",
                elegible: true,
                motivo: null,
            },
        ],
    });
    render(
        <EvidenciaPopup
            isOpen
            inline
            onClose={vi.fn()}
            onSave={vi.fn()}
            types={[{ ...type, codigo: "TIKTOK_LIVE", requiereCliente: true, requiereOperacion: true }]}
            collaborators={[{ id: 15, nombreCompleto: "ATC propio", numeroDocumento: "99990001" }]}
        />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "99990001" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Operación/ }), { target: { value: "OP-83" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar operación pagada" }));
    await waitFor(() => expect(mocks.searchTiktokOperations).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Usar esta operación" }));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Registrar esta operación" })).toHaveProperty("disabled", true);
});
it("permite buscar solo por código y completa el DNI al seleccionar la operación", async () => {
    mocks.searchTiktokOperations.mockResolvedValue({
        items: [
            {
                id: 84,
                codigo: "OP-84",
                id_cliente: 63,
                dni: "88880002",
                cliente: "Cliente por código",
                servicio: "PAGO_DEUDA",
                monto: 700,
                fecha_deposito: "2026-10-06T10:00:00Z",
                estado: "PAGADO",
                elegible: true,
                motivo: null,
            },
        ],
    });
    render(
        <EvidenciaPopup
            isOpen
            inline
            onClose={vi.fn()}
            onSave={vi.fn()}
            types={[{ ...type, codigo: "TIKTOK_LIVE", requiereCliente: true, requiereOperacion: true }]}
            collaborators={[{ id: 15, nombreCompleto: "ATC propio", numeroDocumento: "99990001" }]}
        />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: /Operación/ }), { target: { value: "OP-84" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar operación pagada" }));
    await waitFor(() => expect(mocks.searchTiktokOperations).toHaveBeenCalledWith("OP-84", ""));
    expect(screen.getByText("Cliente por código")).toBeTruthy();
    expect(screen.getByText("DNI 88880002")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Usar esta operación" }));
    expect((screen.getByRole("textbox", { name: /Nro\. Documento/ }) as HTMLInputElement).value).toBe("88880002");
});
it("permite buscar solo por DNI y muestra las operaciones pagadas de ese cliente", async () => {
    mocks.searchTiktokOperations.mockResolvedValue({
        items: [
            {
                id: 85,
                codigo: "OP-85",
                id_cliente: 64,
                dni: "77770003",
                cliente: "Cliente por DNI",
                servicio: "EFECTIVIZACION",
                monto: 900,
                fecha_deposito: "2026-10-07T10:00:00Z",
                estado: "PAGADO",
                elegible: true,
                motivo: null,
            },
        ],
    });
    render(
        <EvidenciaPopup
            isOpen
            inline
            onClose={vi.fn()}
            onSave={vi.fn()}
            types={[{ ...type, codigo: "TIKTOK_LIVE", requiereCliente: true, requiereOperacion: true }]}
            collaborators={[{ id: 15, nombreCompleto: "ATC propio", numeroDocumento: "99990001" }]}
        />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "77770003" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar operación pagada" }));
    await waitFor(() => expect(mocks.searchTiktokOperations).toHaveBeenCalledWith("", "77770003"));
    expect(screen.getByText(/OP-85 · EFECTIVIZACION/)).toBeTruthy();
});
it("no registra un premio automático desde un formulario genérico", () => {
    render(
        <EvidenciaPopup
            isOpen
            inline
            onClose={vi.fn()}
            onSave={vi.fn()}
            types={[{ ...type, codigo: "COLABORADOR_MES_ATENCIONES" }]}
            collaborators={[{ id: 15, nombreCompleto: "ATC propio", numeroDocumento: "99990001" }]}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("error", expect.stringMatching(/verificar/));
});
