import { useCallback, useEffect, useMemo, useState } from "react";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type {
    OperacionCajaMovimiento,
    OperacionProceso,
    OperacionRutaBancaria,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

export type BancariaTab = "Efectivizacion" | "Pago Deuda" | "Derivados" | "POS" | "Movimientos" | "Retenidos";
const retentionRoutes = new Set<OperacionRutaBancaria>(["scotiabank", "banbif"]);

export const tabContracts: Record<BancariaTab, { filters: string[]; actions: string[] }> = {
    Efectivizacion: {
        filters: ["Todos", "Pendientes", "Rechazados", "Pagados"],
        actions: ["Emp. Ingreso", "Emp. Salida", "Reiniciar", "Pagar", "Directo", "Derivar", "Reasignar"],
    },
    "Pago Deuda": {
        filters: ["Todos", "Pendientes", "Procesados", "Pagados"],
        actions: ["Emp. Salida", "Transferencia", "Match", "Reiniciar", "Pagar"],
    },
    Derivados: {
        filters: ["Todos", "Pendientes", "Rechazados", "Pagados"],
        actions: ["Emp. Salida", "Reiniciar", "Pagar", "Derivar"],
    },
    POS: {
        filters: ["Todos", "Solicitado", "Rechazados", "Pagados"],
        actions: ["Reiniciar", "Pagar", "Derivar"],
    },
    Movimientos: {
        filters: ["Todos", "Efectivizacion", "Pago Deuda", "Otros"],
        actions: [],
    },
    Retenidos: {
        filters: [],
        actions: ["Confirmar"],
    },
};

const estadoByFilter: Record<string, string> = {
    Pendientes: "Pendiente",
    Rechazados: "Rechazado",
    Pagados: "Pagado",
    Solicitado: "Solicitado",
    Procesados: "Procesado",
};

const filterMovimientos = (rows: OperacionCajaMovimiento[], activeFilter: string) => {
    const visibleRows = rows.filter((row) => (row.nombre_estado ?? "").trim().toUpperCase() !== "RETENIDO");

    if (activeFilter === "Todos") return visibleRows;

    return visibleRows.filter((row) => {
        const service = (row.tipo_servicio ?? row.nombre_codigo_servicio ?? "").toUpperCase();
        const serviceFallback = (row.nombre_codigo_servicio ?? "").toUpperCase();
        const origin = (row.tipo_origen ?? "").toUpperCase();

        if (activeFilter === "Efectivizacion") {
            return service.includes("EFECTIVIZACION") || serviceFallback.includes("EFECTIVIZACION");
        }

        if (activeFilter === "Pago Deuda") {
            return (service.includes("PAGO") && service.includes("DEUDA")) || (serviceFallback.includes("PAGO") && serviceFallback.includes("DEUDA"));
        }

        if (activeFilter === "Otros") {
            const isEfectivizacion = service.includes("EFECTIVIZACION") || serviceFallback.includes("EFECTIVIZACION");
            const isPagoDeuda = (service.includes("PAGO") && service.includes("DEUDA")) || (serviceFallback.includes("PAGO") && serviceFallback.includes("DEUDA"));

            return !isEfectivizacion && !isPagoDeuda && origin !== "";
        }

        return true;
    });
};

interface UseBancariaBandejaArgs {
    activeCompanyId: number | null;
    code?: string;
    activeFilter: string;
    dateFrom?: string;
    dateTo?: string;
    dni: string;
    historyDate?: string | null;
    refreshKey?: number;
    ruta: OperacionRutaBancaria;
    tab: BancariaTab;
}

export const useBancariaBandeja = ({
    activeCompanyId,
    activeFilter,
    code = "",
    dateFrom = "",
    dateTo = "",
    dni,
    historyDate = null,
    refreshKey = 0,
    ruta,
    tab,
}: UseBancariaBandejaArgs) => {
    const [operaciones, setOperaciones] = useState<OperacionProceso[]>([]);
    const [movimientos, setMovimientos] = useState<OperacionCajaMovimiento[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [localRefreshKey, setLocalRefreshKey] = useState(0);

    const params = useMemo(() => {
        const base: Record<string, unknown> = {};

        if (dni.trim()) base.p_dni_cliente = dni.trim();
        if (code.trim()) base.p_codigo_operacion_deposito_cliente = code.trim();
        if (activeFilter !== "Todos" && estadoByFilter[activeFilter]) base.p_nombre_estado = estadoByFilter[activeFilter];
        if (historyDate) {
            base.p_fecha_caja_cierre_desde = `${historyDate}T00:00:00`;
            base.p_fecha_caja_cierre_hasta = `${historyDate}T23:59:59`;
        }

        if (tab === "Efectivizacion") {
            base.p_tipo_servicio = "EFECTIVIZACION";
            base.p_ruta_destino = ruta;
            base.p_flag_derivado = false;
            if (dateFrom) base.p_fecha_deposito_desde = `${dateFrom}T00:00:00`;
            if (dateTo) base.p_fecha_deposito_hasta = `${dateTo}T23:59:59`;
            if (activeCompanyId) base.p_id_empresa_ingreso = activeCompanyId;
        }

        if (tab === "Pago Deuda") {
            base.p_tipo_servicio = "PAGO DEUDA";
            base.p_ruta_destino = ruta;
            base.p_flag_retenido = false;
            if (activeCompanyId) base.p_id_empresa_salida = activeCompanyId;
        }

        if (tab === "Derivados") {
            base.p_ruta_destino = ruta;
            base.p_flag_derivado = true;
            base.p_flag_retenido = false;
            if (activeCompanyId) base.p_id_empresa_salida = activeCompanyId;
        }

        if (tab === "POS") {
            base.p_ruta_origen = "pos";
            base.p_ruta_destino = ruta;
            base.p_flag_retenido = false;
        }

        if (tab === "Retenidos") {
            base.p_ruta_destino = ruta;
            base.p_flag_retenido = true;
            if (dateFrom) base.p_fecha_deposito_desde = `${dateFrom}T00:00:00`;
            if (dateTo) base.p_fecha_deposito_hasta = `${dateTo}T23:59:59`;
        }

        return base;
    }, [activeCompanyId, activeFilter, code, dateFrom, dateTo, dni, historyDate, ruta, tab]);

    const retentionParams = useMemo(() => {
        const payload: Record<string, unknown> = {
            p_tab: tab,
            p_ruta: ruta,
            p_id_empresa: activeCompanyId,
            p_filtro_estado: activeFilter === "Todos" ? "Todos" : estadoByFilter[activeFilter] ?? activeFilter,
        };

        if (dni.trim()) payload.p_dni_cliente = dni.trim();
        if (code.trim()) payload.p_codigo_operacion = code.trim();
        if (dateFrom) payload.p_fecha_deposito_desde = `${dateFrom}T00:00:00`;
        if (dateTo) payload.p_fecha_deposito_hasta = `${dateTo}T23:59:59`;
        if (historyDate) {
            payload.p_fecha_caja_cierre_desde = `${historyDate}T00:00:00`;
            payload.p_fecha_caja_cierre_hasta = `${historyDate}T23:59:59`;
        }

        return payload;
    }, [activeCompanyId, activeFilter, code, dateFrom, dateTo, dni, historyDate, ruta, tab]);

    const matchesCurrentOperacionView = useCallback(
        (row: OperacionProceso) => {
            if (activeFilter !== "Todos" && estadoByFilter[activeFilter]) {
                if ((row.nombre_estado ?? "").toUpperCase() !== estadoByFilter[activeFilter].toUpperCase()) return false;
            }

            if (tab === "Efectivizacion") {
                return (
                    (row.tipo_servicio ?? "").toUpperCase() === "EFECTIVIZACION" &&
                    row.ruta_destino === ruta &&
                    row.flag_derivado === false &&
                    (!activeCompanyId || row.id_empresa_ingreso === activeCompanyId)
                );
            }

            if (tab === "Pago Deuda") {
                return (
                    (row.tipo_servicio ?? "").toUpperCase() === "PAGO DEUDA" &&
                    row.ruta_destino === ruta &&
                    row.flag_retenido === false &&
                    (!activeCompanyId || row.id_empresa_salida === activeCompanyId)
                );
            }

            if (tab === "Derivados") {
                return (
                    row.ruta_destino === ruta &&
                    row.flag_derivado === true &&
                    row.flag_retenido === false &&
                    (!activeCompanyId || row.id_empresa_salida === activeCompanyId)
                );
            }

            if (tab === "POS") {
                return row.ruta_origen === "pos" && row.ruta_destino === ruta && row.flag_retenido === false;
            }

            if (tab === "Retenidos") {
                return row.ruta_destino === ruta && row.flag_retenido === true;
            }

            return true;
        },
        [activeCompanyId, activeFilter, ruta, tab],
    );

    const replaceOperaciones = useCallback(
        (updatedRows: OperacionProceso[]) => {
            if (!updatedRows.length) return;

            const byId = new Map(updatedRows.map((row) => [row.id, row]));

            setOperaciones((current) =>
                current.flatMap((row) => {
                    const updated = byId.get(row.id);
                    if (!updated) return [row];
                    return matchesCurrentOperacionView(updated) ? [updated] : [];
                }),
            );
        },
        [matchesCurrentOperacionView],
    );

    const replaceOperacion = useCallback((updated: OperacionProceso) => replaceOperaciones([updated]), [replaceOperaciones]);

    const removeOperaciones = useCallback((ids: number[]) => {
        if (!ids.length) return;
        const idSet = new Set(ids);
        setOperaciones((current) => current.filter((row) => !idSet.has(row.id)));
    }, []);

    const refreshBandeja = useCallback(() => {
        setLocalRefreshKey((value) => value + 1);
    }, []);

    useEffect(() => {
        let ignore = false;

        setIsLoading(true);
        setError(null);

        const request = tab === "Movimientos"
            ? operacionesRpcService.getMovimientos({
                  p_id_empresa: activeCompanyId,
                  p_dni_cliente: dni.trim() || undefined,
                  p_fecha_caja_cierre_desde: historyDate ? `${historyDate}T00:00:00` : undefined,
                  p_fecha_caja_cierre_hasta: historyDate ? `${historyDate}T23:59:59` : undefined,
              })
            : retentionRoutes.has(ruta)
              ? operacionesRpcService.getOperacionesRetencionBandeja(retentionParams)
              : operacionesRpcService.getOperaciones(params);

        request
            .then((result) => {
                if (ignore) return;
                if (tab === "Movimientos") {
                    setMovimientos(filterMovimientos((result ?? []) as OperacionCajaMovimiento[], activeFilter));
                    setOperaciones([]);
                } else {
                    setOperaciones((result ?? []) as OperacionProceso[]);
                    setMovimientos([]);
                }
            })
            .catch((err) => {
                if (!ignore) setError(err instanceof Error ? err.message : "No se pudo cargar la bandeja.");
            })
            .finally(() => {
                if (!ignore) setIsLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [activeCompanyId, activeFilter, dateFrom, dateTo, dni, historyDate, localRefreshKey, params, refreshKey, retentionParams, ruta, tab]);

    return {
        error,
        isLoading,
        movimientos,
        operaciones,
        refreshBandeja,
        removeOperaciones,
        replaceOperacion,
        replaceOperaciones,
    };
};
