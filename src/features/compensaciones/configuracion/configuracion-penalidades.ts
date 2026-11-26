import type { Cargo, PenalidadTipo } from "./configuracion.types";

export const perfilesPenalidad = [
    { id: "ATC", label: "Atención al Cliente", cargos: ["ATENCION_CLIENTE"] },
    { id: "JEFE", label: "Jefe de Sede", cargos: ["JEFE_TIENDA"] },
    { id: "FACTURACION", label: "Facturación", cargos: ["FACTURACION"] },
    { id: "MARKETING", label: "Diseño y Marketing", cargos: ["DISENO_MARKETING"] },
    { id: "PAGOS", label: "Pagos", cargos: ["JEFE_SUPERIOR_PAGOS", "OPERADOR_ALTA_DEMANDA", "ENCARGADO_CARTERA_MEDIA", "ASISTENTE_VIRTUAL_PAGOS"] },
];

/** Reparte las penalidades por perfil; las que no pertenecen a ninguno quedan en «Otros» para que nada se oculte. */
export const penalidadesPorPerfil = (penalties: PenalidadTipo[], cargos: Cargo[]) => {
    const codeOf = new Map(cargos.map((cargo) => [cargo.id, cargo.codigo]));
    const perfiles = perfilesPenalidad.map(({ id, label, cargos: codes }) => ({
        id,
        label,
        items: penalties.filter((item) => item.idCargo !== null && codes.includes(codeOf.get(item.idCargo) ?? "")),
    }));
    const known = new Set(perfiles.flatMap((perfil) => perfil.items.map((item) => item.id)));
    const rest = penalties.filter((item) => !known.has(item.id));
    return [...perfiles, { id: "OTROS", label: "Otros", items: rest }].filter((perfil) => perfil.items.length);
};

/** Una fila por penalidad: en Pagos la misma falta existe una vez por cargo. */
export const agruparPenalidades = (items: PenalidadTipo[], cargos: Cargo[]) => {
    const order = new Map(cargos.map((cargo) => [cargo.id, cargo.orden]));
    const rows = new Map<string, PenalidadTipo[]>();
    items.forEach((item) => rows.set(item.nombre, [...(rows.get(item.nombre) ?? []), item]));
    return [...rows.entries()]
        .sort(([a], [b]) => a.localeCompare(b, "es"))
        .map(([nombre, group]) => {
            const sorted = [...group].sort((a, b) => (order.get(a.idCargo ?? 0) ?? 0) - (order.get(b.idCargo ?? 0) ?? 0));
            return {
                nombre,
                items: sorted,
                importeComun: sorted.every((item) => item.montoReferencia === sorted[0].montoReferencia),
                descripcionComun: sorted.every((item) => item.descripcion === sorted[0].descripcion),
            };
        });
};

/** Cómo calcula el servidor las penalidades que no son un importe fijo. */
export const explicacionPenalidad = (code: string) => {
    if (code.endsWith("ERROR_CUADRO")) return "1 error: 30 %; 2: 60 %; 3 o más: 90 % de las comisiones del mes.";
    if (code.endsWith("FRAUDE_DIGITAL")) return "100 % de las comisiones del mes, con confirmación del Administrador.";
    if (code.endsWith("ERROR_PAGO_CRITICO")) return "Importe mínimo: se descuenta el monto perdido completo si es mayor.";
    return "";
};
