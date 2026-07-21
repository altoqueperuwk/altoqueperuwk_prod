import { useCallback, useEffect, useMemo, useState } from "react";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type {
    OperacionCajaMovimiento,
    OperacionProceso,
    OperacionRutaBancaria,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

export type BancariaTab = "Efectivizacion" | "Pago Deuda" | "Derivados" | "POS" | "Movimientos" | "Retenidos";
const retentionRoutes = new Set<OperacionRutaBancaria>(["scotiabank", "banbif"]);

export interface MovimientoMerged {
    id: number;
    tipo_origen: string;
    movimientos: string[];
    tipo_servicio: string;
    nombre_codigo_servicio: string;
    dni_cliente: string;
    codigo_operacion: string;
    nombre_empresa: string;
    monto_ingreso: number;
    monto_salida: number;
    monto_gasto: number;
    monto_ganancia: number;
    tipo_facturacion: string;
    fecha_registro: string;
}

const mergeMovimientos = (rows: OperacionCajaMovimiento[]): MovimientoMerged[] => {
    const byProceso = new Map<number, OperacionCajaMovimiento[]>();
    const standalone: OperacionCajaMovimiento[] = [];

    for (const row of rows) {
        if (row.id_operacion_proceso != null) {
            const group = byProceso.get(row.id_operacion_proceso) ?? [];
            group.push(row);
            byProceso.set(row.id_operacion_proceso, group);
        } else {
            standalone.push(row);
        }
    }

    const merged: MovimientoMerged[] = [];

    for (const [, group] of byProceso) {
        const ingreso = group.find((r) => r.tipo_movimiento.toUpperCase() === "INGRESO");
        const salida = group.find((r) => r.tipo_movimiento.toUpperCase() === "SALIDA");
        const primary = ingreso ?? group[0];

        merged.push({
            id: primary.id,
            tipo_origen: primary.tipo_origen,
            movimientos: group.map((r) => r.tipo_movimiento),
            tipo_servicio: primary.tipo_servicio ?? primary.nombre_codigo_servicio ?? "",
            nombre_codigo_servicio: primary.nombre_codigo_servicio ?? "",
            dni_cliente: primary.dni_cliente ?? "",
            codigo_operacion: primary.codigo_operacion ?? "",
            nombre_empresa: primary.nombre_empresa,
            monto_ingreso: ingreso?.monto_ingreso ?? 0,
            monto_salida: salida?.monto_salida ?? 0,
            monto_gasto: (ingreso?.monto_gasto ?? 0) + (salida?.monto_gasto ?? 0),
            monto_ganancia: ingreso?.monto_ganancia ?? 0,
            tipo_facturacion: primary.tipo_facturacion ?? "Boleta",
            fecha_registro: primary.fecha_registro,
        });
    }

    for (const row of standalone) {
        merged.push({
            id: row.id,
            tipo_origen: row.tipo_origen,
            movimientos: [row.tipo_movimiento],
            tipo_servicio: row.tipo_servicio ?? row.nombre_codigo_servicio ?? "",
            nombre_codigo_servicio: row.nombre_codigo_servicio ?? "",
            dni_cliente: row.dni_cliente ?? "",
            codigo_operacion: row.codigo_operacion ?? "",
            nombre_empresa: row.nombre_empresa,
            monto_ingreso: row.monto_ingreso,
            monto_salida: row.monto_salida,
            monto_gasto: row.monto_gasto,
            monto_ganancia: row.monto_ganancia,
            tipo_facturacion: row.tipo_facturacion ?? "Boleta",
            fecha_registro: row.fecha_registro,
        });
    }

    return merged.sort((a, b) => b.fecha_registro.localeCompare(a.fecha_registro));
};

export const tabContracts: Record<BancariaTab, { filters: string[]; actions: string[] }> = {
    Efectivizacion: {
        filters: ["Todos", "Pendientes", "Rechazados", "Pagados"],
        actions: ["Emp. Ingreso", "Emp. Salida", "Pagar", "Derivar", "Directo", "Reiniciar"],
    },
    "Pago Deuda": {
        filters: ["Todos", "Pendientes", "Procesados", "Pagados"],
        actions: ["Emp. Salida", "Transferencia", "Reiniciar"],
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

const filterMovimientos = (rows: MovimientoMerged[], activeFilter: string) => {
    if (activeFilter === "Todos") return rows;

    return rows.filter((row) => {
        const service = row.tipo_servicio.toUpperCase();
        const serviceFallback = row.nombre_codigo_servicio.toUpperCase();

        if (activeFilter === "Efectivizacion") {
            return service.includes("EFECTIVIZACION") || serviceFallback.includes("EFECTIVIZACION");
        }

        if (activeFilter === "Pago Deuda") {
            return (service.includes("PAGO") && service.includes("DEUDA")) || (serviceFallback.includes("PAGO") && serviceFallback.includes("DEUDA"));
        }

        if (activeFilter === "Otros") {
            const isEfectivizacion = service.includes("EFECTIVIZACION") || serviceFallback.includes("EFECTIVIZACION");
            const isPagoDeuda = (service.includes("PAGO") && service.includes("DEUDA")) || (serviceFallback.includes("PAGO") && serviceFallback.includes("DEUDA"));
            return !isEfectivizacion && !isPagoDeuda;
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
    const [movimientos, setMovimientos] = useState<MovimientoMerged[]>([]);
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
                    (!activeCompanyId || row.id_empresa_salida === activeCompanyId)
                );
            }

            if (tab === "Pago Deuda") {
                return (
                    (row.tipo_servicio ?? "").toUpperCase() === "PAGO DEUDA" &&
                    row.ruta_destino === ruta &&
                    row.flag_retenido === false &&
                    (row.tipo_flujo_pago_deuda ?? "").toUpperCase() !== "RETORNO" &&
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
            : tab === "Pago Deuda"
              ? operacionesRpcService.getPagoDeudaBandeja({
                    p_ruta: ruta,
                    p_id_empresa_salida: activeCompanyId || undefined,
                    p_dni_cliente: dni.trim() || undefined,
                    p_id_estado: activeFilter !== "Todos" && estadoByFilter[activeFilter] ? estadoByFilter[activeFilter] : undefined,
                })
              : retentionRoutes.has(ruta)
                ? operacionesRpcService.getOperacionesRetencionBandeja(retentionParams)
                : operacionesRpcService.getOperaciones(params);

        request
            .then((result) => {
                if (ignore) return;
                if (tab === "Movimientos") {
                    const raw = (result ?? []) as OperacionCajaMovimiento[];
                    const visible = raw.filter((row) => (row.nombre_estado ?? "").trim().toUpperCase() !== "RETENIDO");
                    const merged = mergeMovimientos(visible);
                    setMovimientos(filterMovimientos(merged, activeFilter));
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
