import { supabase } from "@/lib/supabase";
import { leerTarifaRegistro } from "./evidencia-tarifa";
import type { CalificacionesResult, EvidenciaEvento, EvidenciaReferencia, EvidenciaRevision } from "./evidencias.types";

type JsonRecord = Record<string, unknown>;

const recordValue = (value: unknown): JsonRecord => (value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {});
const arrayValue = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.map(recordValue) : []);
const numberValue = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const nullableNumber = (value: unknown) => (value === null || value === undefined || value === "" ? null : numberValue(value));
const nullableString = (value: unknown) => (value === null || value === undefined || value === "" ? null : String(value));

const mapReference = (value: unknown): EvidenciaReferencia => {
    const row = recordValue(value);
    return {
        id: numberValue(row.id),
        tipoReferencia: String(row.tipo_referencia ?? ""),
        idCliente: nullableNumber(row.id_cliente),
        idOperacion: nullableNumber(row.id_operacion),
        identificadorExterno: nullableString(row.identificador_externo),
    };
};

const mapRevision = (value: unknown): EvidenciaRevision => {
    const row = recordValue(value);
    return {
        id: numberValue(row.id),
        numeroPaso: numberValue(row.numero_paso),
        etapa: String(row.etapa ?? ""),
        decision: String(row.decision ?? ""),
        comentario: nullableString(row.comentario),
        usuarioRevisorNombre: String(row.usuario_revisor_nombre ?? ""),
        fechaRegistro: String(row.fecha_revision ?? row.fecha_registro ?? ""),
    };
};

const mapEvent = (value: unknown): EvidenciaEvento => {
    const row = recordValue(value);
    const datos = recordValue(row.datos);
    return {
        calificacionValida: typeof row.valida === "boolean" ? row.valida : undefined,
        fechaActualizacion: nullableString(row.fecha_actualizacion) ?? undefined,
        id: numberValue(row.id),
        idTipoEvento: numberValue(row.id_tipo_evento),
        tipoCodigo: String(row.tipo_codigo ?? ""),
        tipoNombre: String(row.tipo_nombre ?? ""),
        categoria: String(row.categoria ?? "OTRO") as EvidenciaEvento["categoria"],
        conceptoNombre: nullableString(row.concepto_nombre),
        idColaboradorBeneficiario: nullableNumber(row.id_colaborador_beneficiario),
        idColaboradorResponsable: nullableNumber(row.id_colaborador_responsable),
        beneficiarioNombre: nullableString(row.beneficiario_nombre),
        beneficiarioDocumento: nullableString(row.beneficiario_documento),
        responsableNombre: nullableString(row.responsable_nombre),
        sucursalOrigenNombre: nullableString(row.sucursal_origen_nombre),
        fechaEvento: String(row.fecha_evento ?? ""),
        periodoImputacion: String(row.periodo_imputacion ?? ""),
        titulo: nullableString(row.titulo),
        descripcion: nullableString(row.descripcion),
        datos,
        evidencia: Array.isArray(row.evidencia) ? row.evidencia : [],
        estado: String(row.estado_evento ?? "BORRADOR") as EvidenciaEvento["estado"],
        baseCalculo: nullableNumber(row.base_calculo),
        cantidad: nullableNumber(row.cantidad),
        tarifaAplicada: nullableNumber(row.tarifa_aplicada),
        tarifaRegistro: leerTarifaRegistro(row.criterios_validacion_snapshot),
        importeAprobado: nullableNumber(row.importe_aprobado),
        usuarioRegistraNombre: datos.autor_externo === true ? "Cliente · formulario público" : String(row.usuario_registra_nombre ?? ""),
        usuarioRegistraId: nullableNumber(row.id_usuario_registra),
        fechaRegistro: String(row.fecha_registro ?? ""),
        referencias: arrayValue(row.referencias).map(mapReference),
        revisiones: arrayValue(row.revisiones).map(mapRevision),
    };
};

export interface CalificacionListadoFiltros {
    documento: string;
    nombreCliente: string;
    colaborador: string;
    comentario: string;
    asesor: number;
    estrellas: number;
    estado: string;
    desde: string;
    hasta: string;
    pagina: number;
    tamanoPagina: number;
}

export const calificacionListService = {
    async getRatings(filters: CalificacionListadoFiltros): Promise<CalificacionesResult> {
        const { data: response, error } = await supabase.rpc("f_get_compensacion_calificaciones_filtradas", {
            p_busqueda: null,
            p_id_asesor: filters.asesor || null,
            p_estrellas: filters.estrellas || null,
            p_estado: filters.estado || null,
            p_desde: filters.desde || null,
            p_hasta: filters.hasta || null,
            p_pagina: filters.pagina,
            p_tamano: filters.tamanoPagina,
            p_documento_cliente: filters.documento.trim() || null,
            p_nombre_cliente: filters.nombreCliente.trim() || null,
            p_colaborador: filters.colaborador.trim() || null,
            p_comentario: filters.comentario.trim() || null,
        });
        if (error) throw error;

        const result = recordValue(response);
        const summary = recordValue(result.resumen);
        const policy = recordValue(result.politica);
        return {
            items: arrayValue(result.items).map(mapEvent),
            total: numberValue(result.total),
            totalPages: numberValue(result.total_paginas),
            pendientes: numberValue(summary.pendientes),
            aprobados: numberValue(summary.aprobados),
            noValidas: numberValue(summary.no_validas),
            importeAprobado: numberValue(summary.importe_aprobado),
            politica: {
                dni_obligatorio: policy.dni_obligatorio !== false,
                comentario_obligatorio: policy.comentario_obligatorio === true,
                asesor_obligatorio: policy.asesor_obligatorio === true,
            },
            puedeConfigurar: result.puede_configurar === true,
            puedeAdministrar: result.puede_administrar === true,
            asesores: arrayValue(result.asesores).map((row) => ({ id: numberValue(row.id), nombre: String(row.nombre ?? "Sin asesor") })),
            ranking: arrayValue(result.ranking).map((row) => ({
                id: numberValue(row.id),
                nombre: String(row.nombre ?? "Sin asesor"),
                cantidad: numberValue(row.cantidad),
            })),
            distribucion: arrayValue(result.distribucion).map((row) => ({
                estrellas: numberValue(row.estrellas),
                cantidad: numberValue(row.cantidad),
            })),
        };
    },
};
