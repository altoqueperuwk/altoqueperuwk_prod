import type { RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

const DIGITAL_WALLET_BANK_IDS = new Set([12, 13]);
const DIGITAL_WALLET_BANK_NAMES = new Set(["YAPE", "PLIN"]);

const normalizeBankName = (value: unknown) =>
    String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toUpperCase();

export const isDigitalWalletBank = (caja: Pick<RutaOperacionCaja, "id_banco" | "nombre_banco"> | null | undefined) => {
    if (!caja) return false;
    return DIGITAL_WALLET_BANK_IDS.has(Number(caja.id_banco)) || DIGITAL_WALLET_BANK_NAMES.has(normalizeBankName(caja.nombre_banco));
};
