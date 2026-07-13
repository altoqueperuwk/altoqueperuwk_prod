import { useEffect, useMemo, useState } from "react";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type {
    OperacionCajaMovimiento,
    OperacionProceso,
    OperacionRutaBancaria,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

export type BancariaTab = "Efectivizacion" | "Pago Deuda" | "Derivados" | "POS" | "Movimientos" | "Retenidos";

export const tabContracts: Record<BancariaTab, { filters: string[]; actions: string[] }> = {
    Efectivizacion: {
        filters: ["Todos", "Pendientes", "Rechazados", "Pagados"],
        actions: ["Empresa", "Reiniciar", "Pagar", "Derivar", "Reasignar"],
    },
    "Pago Deuda": {
        filters: ["Todos", "Solicitado"],
        actions: ["Transferencia", "Reiniciar"],
    },
    Derivados: {
        filters: ["Todos", "Pendientes", "Rechazados", "Pagados"],
        actions: ["Reiniciar", "Pagar", "Derivar"],
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
};

const filterMovimientos = (rows: OperacionCajaMovimiento[], activeFilter: string) => {
    if (activeFilter === "Todos") return rows;

    return rows.filter((row) => {
        const service = (row.nombre_codigo_servicio ?? "").toUpperCase();
        const origin = (row.tipo_origen ?? "").toUpperCase();

        if (activeFilter === "Efectivizacion") {
            return service.includes("EFECTIVIZACION");
        }

        if (activeFilter === "Pago Deuda") {
            return service.includes("PAGO") && service.includes("DEUDA");
        }

        if (activeFilter === "Otros") {
            return !service.includes("EFECTIVIZACION") && !(service.includes("PAGO") && service.includes("DEUDA")) && origin !== "";
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
    refreshKey?: number;
    ruta: OperacionRutaBancaria;
    tab: BancariaTab;
}

export const useBancariaBandeja = ({ activeCompanyId, activeFilter, code = "", dateFrom = "", dateTo = "", dni, refreshKey = 0, ruta, tab }: UseBancariaBandejaArgs) => {
    const [operaciones, setOperaciones] = useState<OperacionProceso[]>([]);
    const [movimientos, setMovimientos] = useState<OperacionCajaMovimiento[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const params = useMemo(() => {
        const base: Record<string, unknown> = {};

        if (dni.trim()) base.p_dni_cliente = dni.trim();
        if (code.trim()) base.p_codigo_operacion_deposito_cliente = code.trim();
        if (activeFilter !== "Todos" && estadoByFilter[activeFilter]) base.p_nombre_estado = estadoByFilter[activeFilter];

        if (tab === "Efectivizacion") {
            base.p_tipo_servicio = "EFECTIVIZACION";
            base.p_ruta_destino = ruta;
            base.p_flag_derivado = false;
            base.p_flag_retenido = false;
            if (dateFrom) base.p_fecha_deposito_desde = `${dateFrom}T00:00:00`;
            if (dateTo) base.p_fecha_deposito_hasta = `${dateTo}T23:59:59`;
            if (activeCompanyId) base.p_id_empresa_ingreso = activeCompanyId;
        }

        if (tab === "Pago Deuda") {
            base.p_tipo_servicio = "PAGO DEUDA";
            base.p_ruta_destino = ruta;
            base.p_flag_retenido = false;
            if (activeFilter === "Solicitado") base.p_nombre_estado = "Pendiente";
            if (activeCompanyId) base.p_id_empresa_salida = activeCompanyId;
        }

        if (tab === "Derivados") {
            base.p_ruta_destino = ruta;
            base.p_flag_derivado = true;
            base.p_flag_retenido = false;
        }

        if (tab === "POS") {
            base.p_ruta_origen = "pos";
            base.p_ruta_destino = ruta;
            base.p_flag_retenido = false;
        }

        if (tab === "Retenidos") {
            base.p_ruta_destino = ruta;
            base.p_flag_retenido = true;
            if (dateFrom) base.p_fecha_retencion_desde = `${dateFrom}T00:00:00`;
            if (dateTo) base.p_fecha_retencion_hasta = `${dateTo}T23:59:59`;
        }

        return base;
    }, [activeCompanyId, activeFilter, code, dateFrom, dateTo, dni, ruta, tab]);

    useEffect(() => {
        let ignore = false;

        setIsLoading(true);
        setError(null);

        const request =
            tab === "Movimientos"
                ? operacionesRpcService.getMovimientos({
                      p_id_empresa: activeCompanyId,
                      p_dni_cliente: dni.trim() || undefined,
                  })
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
    }, [activeCompanyId, activeFilter, dateFrom, dateTo, dni, params, refreshKey, tab]);

    return { error, isLoading, movimientos, operaciones };
};
