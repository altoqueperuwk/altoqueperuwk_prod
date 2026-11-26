import { supabase } from "@/lib/supabase";
import type {
    CodigoCondicionMes,
    ColaboradorBonosMes,
    CondicionMes,
    DescuentoMes,
    DescuentoValues,
    EstadoReporteMes,
    LineaBonoMes,
    ListaBonosMes,
    PeriodoBonosMes,
    ReporteMesExportado,
    TotalesBonosMes,
} from "./bonos-mes.types";

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord => (value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {});
const list = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.map(record) : []);
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const textOrNull = (value: unknown) => (value === null || value === undefined || value === "" ? null : String(value));
const estado = (value: unknown): EstadoReporteMes => (value === "CONFIRMADO" ? "CONFIRMADO" : "BORRADOR");

const rpc = async <T>(name: string, params: JsonRecord = {}): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data as T;
};

const mapDescuento = (row: JsonRecord): DescuentoMes => ({
    id: num(row.id),
    tipoOrigen: row.tipo_origen === "TOLERANCIA_CERO_DIGITAL" ? "TOLERANCIA_CERO_DIGITAL" : "ERROR_CUADRO",
    tipo: (["BLOQUE_30", "BLOQUE_60", "BLOQUE_90", "TOTAL"].includes(text(row.tipo)) ? row.tipo : "TOTAL") as DescuentoMes["tipo"],
    porcentaje: num(row.porcentaje),
    importeBase: num(row.importe_base),
    importeDescuento: num(row.importe_descuento),
    motivo: text(row.motivo),
    estado: row.estado === "ANULADO" ? "ANULADO" : "ACTIVO",
    fechaRegistro: text(row.fecha_registro),
    motivoAnulacion: textOrNull(row.motivo_anulacion),
});

const mapCondicion = (row: JsonRecord): CondicionMes => ({
    codigoCondicion: text(row.codigo_condicion) === "META_AREA_15_DIAS" ? "META_AREA_15_DIAS" : "PUNTUALIDAD",
    cumple: row.cumple === true,
    nota: textOrNull(row.nota),
    fechaActualizacion: text(row.fecha_actualizacion),
});

const mapLinea = (row: JsonRecord): LineaBonoMes => ({
    clave: text(row.clave_origen),
    concepto: text(row.concepto_nombre),
    categoria: text(row.categoria),
    naturaleza: row.naturaleza === "DESCUENTO" ? "DESCUENTO" : "INGRESO",
    cantidad: num(row.cantidad),
    tarifa: num(row.tarifa),
    importe: num(row.importe),
});

const mapColaborador = (row: JsonRecord): ColaboradorBonosMes => {
    const idColaborador = Number(row.id_colaborador);
    if (!Number.isSafeInteger(idColaborador) || idColaborador <= 0) throw new Error("El reporte de bonos del mes recibió un colaborador inválido.");
    return {
        idColaborador,
        nombre: text(row.nombre_completo),
        documento: [text(row.tipo_documento), text(row.numero_documento)].filter(Boolean).join(" "),
        cargo: text(row.cargo),
        sucursal: text(row.sucursal),
        idSucursal: row.id_sucursal === null || row.id_sucursal === undefined ? null : num(row.id_sucursal),
        totalBonos: num(row.total_bonos),
        totalComisiones: num(row.total_comisiones),
        totalDescuentos: num(row.total_descuentos),
        totalNeto: num(row.total_neto),
        puedeCalcular: row.puede_calcular === true,
        bloqueos: list(row.bloqueos).map((item) => ({ codigo: text(item.codigo), mensaje: text(item.mensaje) })),
        descuentos: list(row.descuentos_mes).map(mapDescuento),
        condiciones: list(row.condiciones).map(mapCondicion),
        lineas: list(row.detalles).map(mapLinea),
    };
};

const mapTotales = (value: unknown): TotalesBonosMes => {
    const row = record(value);
    return {
        totalBonos: num(row.total_bonos),
        totalComisiones: num(row.total_comisiones),
        totalDescuentos: num(row.total_descuentos),
        totalNeto: num(row.total_neto),
    };
};

export const bonosMesService = {
    async getPeriodos(): Promise<PeriodoBonosMes[]> {
        const data = await rpc<unknown>("f_get_compensacion_bonos_mes_periodos");
        if (!Array.isArray(data)) throw new Error("No se recibió el catálogo de meses.");
        return list(data).map((row) => ({ id: num(row.id), periodo: text(row.periodo), nombre: text(row.nombre), estadoReporte: estado(row.estado_reporte) }));
    },
    async getLista(idPeriodo: number, busqueda: string): Promise<ListaBonosMes> {
        const row = record(
            await rpc<unknown>("f_get_compensacion_bonos_mes", {
                p_id_periodo: idPeriodo,
                p_busqueda: busqueda.trim() || null,
                p_limite: 500,
                p_desplazamiento: 0,
            }),
        );
        if (num(row.id_periodo) !== idPeriodo || !Array.isArray(row.filas)) throw new Error("La lista de bonos del mes no corresponde al mes pedido.");
        return {
            idPeriodo,
            estadoReporte: estado(row.estado_reporte),
            confirmadoEn: textOrNull(row.confirmado_en),
            hashContenido: textOrNull(row.hash_contenido),
            totalFilas: num(row.total_filas),
            totales: mapTotales(row.totales),
            filas: list(row.filas).map(mapColaborador),
        };
    },
    async getDetalle(idPeriodo: number, idColaborador: number): Promise<ColaboradorBonosMes> {
        const row = record(await rpc<unknown>("f_get_compensacion_bonos_mes_detalle", { p_id_periodo: idPeriodo, p_id_colaborador: idColaborador }));
        const item = mapColaborador(row);
        if (item.idColaborador !== idColaborador) throw new Error("El detalle recibido no corresponde al colaborador.");
        return item;
    },
    async aplicarDescuento(idPeriodo: number, idColaborador: number, values: DescuentoValues): Promise<void> {
        await rpc("f_post_compensacion_descuento_mes", {
            p_id_periodo: idPeriodo,
            p_id_colaborador: idColaborador,
            p_tipo_origen: values.tipoOrigen,
            p_tipo: values.tipo,
            p_motivo: values.motivo.trim(),
        });
    },
    async anularDescuento(idDescuento: number, motivo: string): Promise<void> {
        await rpc("f_patch_compensacion_descuento_mes_anular", { p_id_descuento: idDescuento, p_motivo: motivo.trim() });
    },
    async marcarCondicion(idPeriodo: number, idColaborador: number, codigo: CodigoCondicionMes, cumple: boolean, nota: string): Promise<void> {
        await rpc("f_post_compensacion_condicion_mes", {
            p_id_periodo: idPeriodo,
            p_id_colaborador: idColaborador,
            p_codigo_condicion: codigo,
            p_cumple: cumple,
            p_nota: nota.trim() || null,
        });
    },
    async confirmar(idPeriodo: number, nota: string, incluirBloqueados: boolean): Promise<void> {
        await rpc("f_post_compensacion_reporte_mes_confirmar", {
            p_id_periodo: idPeriodo,
            p_nota: nota.trim() || null,
            p_incluir_bloqueados: incluirBloqueados,
        });
    },
    async reabrir(idPeriodo: number, motivo: string): Promise<void> {
        await rpc("f_post_compensacion_reporte_mes_reabrir", { p_id_periodo: idPeriodo, p_motivo: motivo.trim() });
    },
    async exportar(idPeriodo: number): Promise<ReporteMesExportado> {
        const row = record(await rpc<unknown>("f_get_compensacion_reporte_mes_exportar", { p_id_periodo: idPeriodo }));
        return {
            periodo: text(row.periodo),
            nombrePeriodo: text(row.nombre_periodo),
            confirmadoEn: text(row.confirmado_en),
            confirmadoPor: textOrNull(row.confirmado_por),
            hashContenido: text(row.hash_contenido),
            nota: textOrNull(row.nota),
            totales: mapTotales(row.totales),
            colaboradores: list(row.colaboradores).map(mapColaborador),
        };
    },
};
