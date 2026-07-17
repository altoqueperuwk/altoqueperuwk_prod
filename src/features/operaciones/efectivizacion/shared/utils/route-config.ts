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

const bancariaRouteAliases: Record<OperacionRutaBancaria, string[]> = {
    bcp: ["bcp"],
    bbva: ["bbva"],
    scotiabank: ["scotiabank", "scotia", "scotibank"],
    banbif: ["banbif"],
    interbank: ["interbank"],
    safetypay: ["safetypay", "safety pay"],
};

const normalizeRouteText = (value: unknown) =>
    String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase();

export const findCodigoServicioForRuta = <T extends { nombre: string; tipo?: string | null }>(
    items: T[],
    ruta: OperacionRutaBancaria,
) => {
    const routeAliases = [...(bancariaRouteAliases[ruta] ?? [ruta]), getRutaLabel(ruta)].map(normalizeRouteText);
    const efectivizacionItems = items.filter((item) => String(item.tipo ?? "").toUpperCase() === "EFECTIVIZACION");
    const matchesRoute = (value: unknown) => {
        const name = normalizeRouteText(value);
        return routeAliases.some((alias) => name === alias || name.includes(alias) || alias.includes(name));
    };

    return (
        efectivizacionItems.find((item) => matchesRoute(item.nombre)) ??
        items.find((item) => matchesRoute(item.nombre)) ??
        null
    );
};
