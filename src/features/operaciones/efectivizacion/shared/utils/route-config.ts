import type { OperacionRuta, OperacionRutaBancaria } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

export const bancariaRoutes: Record<OperacionRuta, string> = {
    bcp: "BCP",
    bbva: "BBVA",
    scotiabank: "Scotiabank",
    banbif: "BanBif",
    interbank: "Interbank",
    safetypay: "SafetyPay",
    pos: "POS",
    linkpago: "Link Pago",
};

export const bancariaRouteKeys: OperacionRutaBancaria[] = [
    "bcp",
    "bbva",
    "scotiabank",
    "banbif",
    "interbank",
    "safetypay",
];

export const getRutaLabel = (ruta: OperacionRuta) => bancariaRoutes[ruta] ?? ruta;
