import { describe, expect, it } from "vitest";
import { canDeleteAssistedOperation } from "./asistida-delete-permission";

const base = { ruta: "linkpago", estado: "Pagado", idEstado: 1, isAdministrator: false, isJefeTienda: false, canManage: false };

describe("eliminación de operaciones asistidas", () => {
    it("permite Link Pago pagado al administrador", () => {
        expect(canDeleteAssistedOperation({ ...base, isAdministrator: true })).toBe(true);
    });
    it("permite al jefe de tienda eliminar Link Pago de otro solicitante", () => {
        expect(canDeleteAssistedOperation({ ...base, isJefeTienda: true })).toBe(true);
    });
    it.each(["Pagado", "Pendiente", "Solicitado"])("niega Link Pago %s a otro perfil incluso siendo propietario", (estado) => {
        expect(canDeleteAssistedOperation({ ...base, estado, canManage: true })).toBe(false);
    });
    it("no admite una operación eliminada por nombre ni por ID", () => {
        expect(canDeleteAssistedOperation({ ...base, isAdministrator: true, estado: " ELIMINADO " })).toBe(false);
        expect(canDeleteAssistedOperation({ ...base, isJefeTienda: true, idEstado: 10 })).toBe(false);
    });
    it.each(["isAdministrator", "isJefeTienda"] as const)("permite POS pagado a %s incluso de otro solicitante", (profile) => {
        expect(canDeleteAssistedOperation({ ...base, ruta: "pos", [profile]: true })).toBe(true);
        expect(canDeleteAssistedOperation({ ...base, ruta: "pos", estado: "", idEstado: 4, [profile]: true })).toBe(true);
    });
    it("niega POS pagado a otros perfiles aunque puedan gestionar la solicitud", () => {
        expect(canDeleteAssistedOperation({ ...base, ruta: "pos", canManage: true })).toBe(false);
    });
    it("niega POS eliminado a perfiles autorizados", () => {
        expect(canDeleteAssistedOperation({ ...base, ruta: "pos", isAdministrator: true, idEstado: 10 })).toBe(false);
    });
    it("conserva POS pendiente gestionable y bloquea el ajeno", () => {
        expect(canDeleteAssistedOperation({ ...base, ruta: "pos", estado: "Pendiente", canManage: true })).toBe(true);
        expect(canDeleteAssistedOperation({ ...base, ruta: "pos", estado: "Pendiente", isJefeTienda: true })).toBe(false);
    });
});
