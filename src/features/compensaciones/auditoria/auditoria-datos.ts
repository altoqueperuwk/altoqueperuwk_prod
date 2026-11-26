import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { evidenciasService } from "../evidencias/evidencias.service";
import { type EvidenciaEvento } from "../evidencias/evidencias.types";
import { incidenciasService } from "../incidencias/incidencias.service";
import type { IncidenciaEvento } from "../incidencias/incidencias.types";

/** Una fila de la tabla de Auditoría Operaciones, igual para todos los perfiles. */
export interface AuditoriaFila {
    id: string;
    tipo: "BONO" | "PENALIDAD";
    concepto: string;
    descripcion?: string | null;
    /** Cliente, operación u otro dato corto del registro. */
    referencia?: string;
    colaborador?: string | null;
    registradoPor?: string | null;
    fecha: string;
    monto: number | null;
    estado: string;
    /** Siguiente paso o respuesta, bajo el estado. */
    nota?: string;
    acciones: ReactNode;
}
export interface AuditoriaRango {
    mes: string;
    desde: string;
    hasta: string;
}

export const mensajeError = (cause: unknown, fallback = "No se pudo completar la solicitud") =>
    cause && typeof cause === "object" && "message" in cause ? String(cause.message) : fallback;
export const hoyLima = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const rangoMes = (mes: string): AuditoriaRango => {
    const [year, month] = mes.split("-").map(Number);
    return { mes, desde: `${mes}-01`, hasta: `${mes}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}` };
};
export const unir = (...partes: (string | null | undefined | false)[]) => partes.filter(Boolean).join(" · ");

const MAX_PAGINAS = 5;
/** La tabla filtra en pantalla: se pide el mes completo (hasta 500 por origen). */
export const todasLasPaginas = async <T>(pedir: (page: number) => Promise<{ items: T[]; totalPages: number }>) => {
    const primera = await pedir(1);
    const items = [...primera.items];
    for (let page = 2; page <= Math.min(primera.totalPages, MAX_PAGINAS); page++) items.push(...(await pedir(page)).items);
    return items;
};

export const bonosDelMes = (rango: AuditoriaRango, filtro: { category?: string; typeId?: number }): Promise<EvidenciaEvento[]> =>
    todasLasPaginas((page) =>
        evidenciasService.getList({
            documentoCliente: "",
            nombreCliente: "",
            colaborador: "",
            search: "",
            category: filtro.category ?? "",
            status: "",
            typeId: filtro.typeId ?? 0,
            from: rango.desde,
            to: rango.hasta,
            page,
            pageSize: 100,
        }),
    );
export const penalidadesDelMes = (rango: AuditoriaRango, excludeCodes: readonly string[]): Promise<IncidenciaEvento[]> =>
    todasLasPaginas((page) =>
        incidenciasService.getList({
            tray: "TODOS",
            category: "",
            status: "",
            penaltyId: 0,
            search: "",
            from: rango.desde,
            to: rango.hasta,
            page,
            pageSize: 100,
            excludeCodes,
        }),
    );
export const filaPenalidad = (evento: IncidenciaEvento, acciones: ReactNode): AuditoriaFila => ({
    id: `P:${evento.id}`,
    tipo: "PENALIDAD",
    concepto: evento.penalidadNombre,
    descripcion: evento.motivo,
    referencia: unir(
        evento.clienteDocumento && `Cliente ${evento.clienteDocumento}`,
        evento.operaciones?.length ? `Op. ${evento.operaciones.map((op) => op.codigo || op.tipo).join(", ")}` : "",
    ),
    colaborador: evento.responsableNombre,
    registradoPor: evento.reportanteNombre ?? evento.usuarioRegistraNombre,
    fecha: evento.fechaEvento,
    monto: evento.importeAprobado ?? null,
    estado: evento.estado,
    acciones,
});

/** El detalle de una penalidad necesita saber qué colaborador está mirando. */
export const useActorColaborador = () => {
    const [id, setId] = useState<number | undefined>();
    useEffect(() => {
        incidenciasService
            .getCatalog()
            .then((catalog) => setId(catalog.reportantes.length === 1 ? catalog.reportantes[0].id : undefined))
            .catch(() => setId(undefined));
    }, []);
    return id;
};

/** Carga las filas del periodo elegido; `cargar` debe ser estable (useCallback). */
export const useAuditoriaFilas = <T>(cargar: (rango: AuditoriaRango) => Promise<T[]>) => {
    const [mes, setMes] = useState(() => hoyLima().slice(0, 7));
    const [items, setItems] = useState<T[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState("");
    const [version, setVersion] = useState(0);
    const pedido = useRef(0);
    useEffect(() => {
        const actual = ++pedido.current;
        setCargando(true);
        setError("");
        cargar(rangoMes(mes))
            .then((result) => {
                if (actual === pedido.current) setItems(result);
            })
            .catch((cause) => {
                if (actual !== pedido.current) return;
                setItems([]);
                setError(mensajeError(cause, "No fue posible cargar los registros"));
            })
            .finally(() => {
                if (actual === pedido.current) setCargando(false);
            });
        return () => {
            ++pedido.current;
        };
    }, [cargar, mes, version]);
    const recargar = useCallback(() => setVersion((value) => value + 1), []);
    return { mes, setMes, items, cargando, error, recargar };
};
