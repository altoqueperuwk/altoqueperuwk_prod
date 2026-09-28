import { supabase } from "@/lib/supabase";
import type {
    Acceso,
    Cargo,
    Concepto,
    ConfiguracionCatalogos,
    EventoTipo,
    Jornada,
    MetaSede,
    PenalidadTipo,
    Plan,
    PlanVersion,
    Regla,
    UsuarioAcceso,
} from "./configuracion.types";

type JsonRecord = Record<string, unknown>;
const recordValue = (value: unknown): JsonRecord => (value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {});
const arrayValue = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.map(recordValue) : []);
const numberValue = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const nullableNumber = (value: unknown) => (value === null || value === undefined || value === "" ? null : numberValue(value));
const stringValue = (value: unknown) => String(value ?? "");
const rpc = async <T>(name: string, params: JsonRecord): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data as T;
};

export const configuracionService = {
    async getCatalogs(): Promise<ConfiguracionCatalogos> {
        const [states, branches] = await Promise.all([rpc<unknown[]>("f_get_tb_estado", { p_id: null }), rpc<unknown[]>("f_get_tb_sucursal", { p_id: null })]);
        return {
            estados: arrayValue(states).map((row) => ({ id: numberValue(row.id), nombre: stringValue(row.nombre) })),
            sucursales: arrayValue(branches).map((row) => ({ id: numberValue(row.id), nombre: stringValue(row.nombre) })),
        };
    },
    async getPlans(): Promise<Plan[]> {
        const data = await rpc<unknown[]>("f_get_tb_compensacion_plan", { p_busqueda: null, p_id: null, p_id_estado: null });
        return arrayValue(data).map((row) => ({
            id: numberValue(row.id),
            codigo: stringValue(row.codigo),
            nombre: stringValue(row.nombre),
            descripcion: stringValue(row.descripcion),
            idEstado: numberValue(row.id_estado),
            estado: stringValue(row.estado_nombre),
            versiones: numberValue(row.versiones),
        }));
    },
    savePlan: (id: number | null, value: JsonRecord) =>
        id
            ? rpc("f_patch_tb_compensacion_plan", {
                  p_codigo: value.codigo,
                  p_descripcion: value.descripcion || null,
                  p_id: id,
                  p_id_estado: value.idEstado,
                  p_nombre: value.nombre,
              })
            : rpc("f_post_tb_compensacion_plan", {
                  p_codigo: value.codigo,
                  p_descripcion: value.descripcion || null,
                  p_id_estado: value.idEstado || null,
                  p_nombre: value.nombre,
              }),
    async getVersions(planId?: number): Promise<PlanVersion[]> {
        const data = await rpc<unknown[]>("f_get_tb_compensacion_plan_version", {
            p_estado_version: null,
            p_fecha_referencia: null,
            p_id: null,
            p_id_plan: planId || null,
        });
        return arrayValue(data).map((row) => ({
            id: numberValue(row.id),
            idPlan: numberValue(row.id_plan),
            planNombre: stringValue(row.plan_nombre),
            numeroVersion: numberValue(row.numero_version),
            nombre: stringValue(row.nombre),
            fechaInicio: stringValue(row.fecha_inicio),
            fechaFin: stringValue(row.fecha_fin),
            estado: stringValue(row.estado_version),
            observacion: stringValue(row.observacion),
            cantidadReglas: numberValue(row.cantidad_reglas),
            esVigente: Boolean(row.es_vigente),
        }));
    },
    saveVersion: (id: number | null, value: JsonRecord) =>
        id
            ? rpc("f_patch_tb_compensacion_plan_version", {
                  p_fecha_fin: value.fechaFin || null,
                  p_fecha_inicio: value.fechaInicio,
                  p_id: id,
                  p_limpiar_fecha_fin: !value.fechaFin,
                  p_nombre: value.nombre || null,
                  p_observacion: value.observacion || null,
              })
            : rpc("f_post_tb_compensacion_plan_version", {
                  p_fecha_fin: value.fechaFin || null,
                  p_fecha_inicio: value.fechaInicio,
                  p_id_plan: value.idPlan,
                  p_nombre: value.nombre || null,
                  p_observacion: value.observacion || null,
              }),
    publishVersion: (id: number) => rpc("f_post_tb_compensacion_plan_version_publicar", { p_id: id, p_observacion: "Publicada desde Configuración" }),
    async getConcepts(): Promise<Concepto[]> {
        const data = await rpc<unknown[]>("f_get_tb_compensacion_concepto", {
            p_busqueda: null,
            p_categoria: null,
            p_id: null,
            p_id_estado: null,
            p_naturaleza: null,
        });
        return arrayValue(data).map((row) => ({
            id: numberValue(row.id),
            codigo: stringValue(row.codigo),
            nombre: stringValue(row.nombre),
            categoria: stringValue(row.categoria),
            naturaleza: stringValue(row.naturaleza),
            unidad: stringValue(row.unidad),
            requiereEvidencia: Boolean(row.requiere_evidencia),
            requiereAprobacion: Boolean(row.requiere_aprobacion),
            permiteExcepcion: Boolean(row.permite_excepcion),
            orden: numberValue(row.orden),
            idEstado: numberValue(row.id_estado),
            estado: stringValue(row.estado_nombre),
        }));
    },
    saveConcept: (id: number | null, value: JsonRecord) =>
        rpc(id ? "f_patch_tb_compensacion_concepto" : "f_post_tb_compensacion_concepto", {
            ...(id ? { p_id: id } : {}),
            p_categoria: value.categoria,
            p_codigo: value.codigo,
            p_id_estado: value.idEstado || null,
            p_naturaleza: value.naturaleza,
            p_nombre: value.nombre,
            p_orden: Number(value.orden),
            p_permite_excepcion: value.permiteExcepcion === "SI",
            p_requiere_aprobacion: value.requiereAprobacion === "SI",
            p_requiere_evidencia: value.requiereEvidencia === "SI",
            p_unidad: value.unidad,
        }),
    async getCargos(): Promise<Cargo[]> {
        const data = await rpc<unknown[]>("f_get_tb_compensacion_cargo", { p_busqueda: null, p_id: null, p_id_estado: null });
        return arrayValue(data).map((row) => ({
            id: numberValue(row.id),
            codigo: stringValue(row.codigo),
            nombre: stringValue(row.nombre),
            descripcion: stringValue(row.descripcion),
            orden: numberValue(row.orden),
            idEstado: numberValue(row.id_estado),
            estado: stringValue(row.estado_nombre),
        }));
    },
    saveCargo: (id: number | null, value: JsonRecord) =>
        rpc(id ? "f_patch_tb_compensacion_cargo" : "f_post_tb_compensacion_cargo", {
            ...(id ? { p_id: id } : {}),
            p_codigo: value.codigo,
            p_descripcion: value.descripcion || null,
            p_id_estado: value.idEstado || null,
            p_nombre: value.nombre,
            p_orden: Number(value.orden),
        }),
    async getJornadas(): Promise<Jornada[]> {
        const data = await rpc<unknown[]>("f_get_tb_compensacion_jornada", { p_busqueda: null, p_id: null, p_id_estado: null });
        return arrayValue(data).map((row) => ({
            id: numberValue(row.id),
            codigo: stringValue(row.codigo),
            nombre: stringValue(row.nombre),
            modalidad: stringValue(row.modalidad),
            horaEntrada: stringValue(row.hora_entrada).slice(0, 5),
            horaSalida: stringValue(row.hora_salida).slice(0, 5),
            minutosTolerancia: numberValue(row.minutos_tolerancia),
            minutosDescanso: numberValue(row.minutos_descanso),
            diasSemana: Array.isArray(row.dias_semana) ? row.dias_semana.map(numberValue) : [],
            cruzaMedianoche: Boolean(row.cruza_medianoche),
            idEstado: numberValue(row.id_estado),
            estado: stringValue(row.estado_nombre),
        }));
    },
    saveJornada(id: number | null, value: JsonRecord) {
        const days = String(value.diasSemana ?? "")
            .split(",")
            .map((day) => Number(day.trim()))
            .filter((day, index, values) => Number.isInteger(day) && day >= 1 && day <= 7 && values.indexOf(day) === index);
        if (!days.length) throw new Error("Ingresa al menos un día válido entre 1 y 7");
        return rpc(id ? "f_patch_tb_compensacion_jornada" : "f_post_tb_compensacion_jornada", {
            ...(id ? { p_id: id } : {}),
            p_codigo: value.codigo,
            p_cruza_medianoche: value.cruzaMedianoche === "SI",
            p_dias_semana: days,
            p_hora_entrada: value.horaEntrada,
            p_hora_salida: value.horaSalida,
            p_id_estado: value.idEstado || null,
            p_minutos_descanso: Number(value.minutosDescanso),
            p_minutos_tolerancia: Number(value.minutosTolerancia),
            p_modalidad: value.modalidad,
            p_nombre: value.nombre,
        });
    },
    async getEventTypes(): Promise<EventoTipo[]> {
        const data = await rpc<unknown[]>("f_get_tb_compensacion_evento_tipo", {
            p_busqueda: null,
            p_categoria: null,
            p_id: null,
            p_id_estado: null,
        });
        return arrayValue(data).map((row) => ({
            id: numberValue(row.id),
            codigo: stringValue(row.codigo),
            nombre: stringValue(row.nombre),
            categoria: stringValue(row.categoria),
            idConcepto: nullableNumber(row.id_concepto),
            conceptoNombre: stringValue(row.concepto_nombre),
            requiereBeneficiario: Boolean(row.requiere_beneficiario),
            requiereResponsable: Boolean(row.requiere_responsable),
            requiereCliente: Boolean(row.requiere_cliente),
            requiereOperacion: Boolean(row.requiere_operacion),
            configuracion: recordValue(row.configuracion),
            idEstado: numberValue(row.id_estado),
            estado: stringValue(row.estado_nombre),
        }));
    },
    saveEventType: (id: number | null, value: JsonRecord) =>
        rpc(id ? "f_patch_tb_compensacion_evento_tipo" : "f_post_tb_compensacion_evento_tipo", {
            ...(id ? { p_id: id, p_limpiar_concepto: !value.idConcepto } : {}),
            p_categoria: value.categoria,
            p_codigo: value.codigo,
            p_configuracion: typeof value.configuracionOriginal === "string" ? recordValue(JSON.parse(value.configuracionOriginal || "{}")) : {},
            p_id_concepto: value.idConcepto || null,
            p_id_estado: value.idEstado || null,
            p_nombre: value.nombre,
            p_requiere_beneficiario: value.requiereBeneficiario === "SI",
            p_requiere_cliente: value.requiereCliente === "SI",
            p_requiere_operacion: value.requiereOperacion === "SI",
            p_requiere_responsable: value.requiereResponsable === "SI",
        }),
    async getAccessUsers(): Promise<UsuarioAcceso[]> {
        const data = await rpc<unknown[]>("f_get_tb_compensacion_usuario_acceso", { p_busqueda: null });
        return arrayValue(data).map((row) => ({
            id: numberValue(row.id),
            nombre: stringValue(row.nombre),
            username: stringValue(row.username),
            rolNombre: stringValue(row.rol_nombre),
            idSucursal: nullableNumber(row.id_sucursal),
            sucursalNombre: stringValue(row.sucursal_nombre),
        }));
    },
    async getAccesses(): Promise<Acceso[]> {
        const data = await rpc<unknown[]>("f_get_tb_compensacion_acceso", { p_id_estado: null, p_id_usuario: null, p_recurso: null });
        return arrayValue(data).map((row) => ({
            id: numberValue(row.id),
            idUsuario: numberValue(row.id_usuario),
            usuarioNombre: stringValue(row.usuario_nombre),
            recurso: stringValue(row.recurso),
            alcance: stringValue(row.alcance),
            idSucursal: nullableNumber(row.id_sucursal),
            sucursalNombre: stringValue(row.sucursal_nombre),
            puedeConsultar: Boolean(row.puede_consultar),
            puedeRegistrar: Boolean(row.puede_registrar),
            puedeEditar: Boolean(row.puede_editar),
            puedeRevisar: Boolean(row.puede_revisar),
            puedeAprobar: Boolean(row.puede_aprobar),
            puedePagar: Boolean(row.puede_pagar),
            puedeCerrar: Boolean(row.puede_cerrar),
            puedeConfigurar: Boolean(row.puede_configurar),
            idEstado: numberValue(row.id_estado),
            estado: stringValue(row.estado_nombre),
        }));
    },
    saveAccess: (value: JsonRecord) =>
        rpc("f_put_tb_compensacion_acceso", {
            p_alcance: value.alcance,
            p_id_estado: value.idEstado || null,
            p_id_sucursal: value.alcance === "SEDE" ? value.idSucursal || null : null,
            p_id_usuario: value.idUsuario,
            p_puede_aprobar: value.puedeAprobar === "SI",
            p_puede_cerrar: value.puedeCerrar === "SI",
            p_puede_configurar: value.puedeConfigurar === "SI",
            p_puede_consultar: value.puedeConsultar === "SI",
            p_puede_editar: value.puedeEditar === "SI",
            p_puede_pagar: value.puedePagar === "SI",
            p_puede_registrar: value.puedeRegistrar === "SI",
            p_puede_revisar: value.puedeRevisar === "SI",
            p_recurso: value.recurso,
        }),
    async getRules(versionId?: number): Promise<Regla[]> {
        const data = await rpc<unknown[]>("f_get_tb_compensacion_regla", {
            p_id: null,
            p_id_cargo: null,
            p_id_concepto: null,
            p_id_estado: null,
            p_id_plan_version: versionId || null,
            p_id_sucursal: null,
        });
        return arrayValue(data).map((row) => ({
            id: numberValue(row.id),
            idPlanVersion: numberValue(row.id_plan_version),
            planNombre: stringValue(row.plan_nombre),
            numeroVersion: numberValue(row.numero_version),
            estadoVersion: stringValue(row.estado_version),
            idConcepto: numberValue(row.id_concepto),
            conceptoNombre: stringValue(row.concepto_nombre),
            categoria: stringValue(row.categoria),
            naturaleza: stringValue(row.naturaleza),
            idCargo: nullableNumber(row.id_cargo),
            cargoNombre: stringValue(row.cargo_nombre),
            idSucursal: nullableNumber(row.id_sucursal),
            sucursalNombre: stringValue(row.sucursal_nombre),
            tipoCalculo: stringValue(row.tipo_calculo),
            monto: nullableNumber(row.monto),
            porcentaje: nullableNumber(row.porcentaje),
            valorMinimo: nullableNumber(row.valor_minimo),
            valorMaximo: nullableNumber(row.valor_maximo),
            topeImporte: nullableNumber(row.tope_importe),
            prioridad: numberValue(row.prioridad),
            configuracion: recordValue(row.configuracion),
            fuenteOperacion: stringValue(recordValue(row.configuracion).fuente_operacion),
            idEstado: numberValue(row.id_estado),
            estado: stringValue(row.estado_nombre),
        }));
    },
    saveRule: (id: number | null, value: JsonRecord) => {
        let originalConfiguration: JsonRecord = {};
        if (typeof value.configuracionOriginal === "string" && value.configuracionOriginal) {
            try {
                originalConfiguration = recordValue(JSON.parse(value.configuracionOriginal));
            } catch {
                originalConfiguration = {};
            }
        }
        const source = String(value.fuenteOperacion ?? "").trim();
        const configuration = { ...originalConfiguration };
        if (source) configuration.fuente_operacion = source;
        else delete configuration.fuente_operacion;

        return rpc(id ? "f_patch_tb_compensacion_regla" : "f_post_tb_compensacion_regla", {
            ...(id ? { p_id: id, p_limpiar_cargo: !value.idCargo, p_limpiar_sucursal: !value.idSucursal } : { p_id_plan_version: value.idPlanVersion }),
            p_configuracion: configuration,
            p_id_cargo: value.idCargo || null,
            p_id_concepto: value.idConcepto,
            p_id_estado: value.idEstado || null,
            p_id_sucursal: value.idSucursal || null,
            p_monto: value.monto === "" ? null : Number(value.monto),
            p_porcentaje: value.porcentaje === "" ? null : Number(value.porcentaje),
            p_prioridad: Number(value.prioridad),
            p_tipo_calculo: value.tipoCalculo,
            p_tope_importe: value.topeImporte === "" ? null : Number(value.topeImporte),
            p_valor_maximo: value.valorMaximo === "" ? null : Number(value.valorMaximo),
            p_valor_minimo: value.valorMinimo === "" ? null : Number(value.valorMinimo),
        });
    },
    async getGoals(versionId?: number): Promise<MetaSede[]> {
        const data = await rpc<unknown[]>("f_get_tb_compensacion_meta_sede", {
            p_codigo_indicador: null,
            p_id: null,
            p_id_estado: null,
            p_id_plan_version: versionId || null,
            p_id_sucursal: null,
            p_periodo: null,
        });
        return arrayValue(data).map((row) => ({
            id: numberValue(row.id),
            idPlanVersion: numberValue(row.id_plan_version),
            planNombre: stringValue(row.plan_nombre),
            numeroVersion: numberValue(row.numero_version),
            estadoVersion: stringValue(row.estado_version),
            idSucursal: numberValue(row.id_sucursal),
            sucursalNombre: stringValue(row.sucursal_nombre),
            codigoIndicador: stringValue(row.codigo_indicador),
            periodo: stringValue(row.periodo),
            valorMeta: numberValue(row.valor_meta),
            unidad: stringValue(row.unidad),
            idEstado: numberValue(row.id_estado),
            estado: stringValue(row.estado_nombre),
        }));
    },
    saveGoal: (id: number | null, value: JsonRecord) =>
        rpc(id ? "f_patch_tb_compensacion_meta_sede" : "f_post_tb_compensacion_meta_sede", {
            ...(id ? { p_id: id } : { p_id_plan_version: value.idPlanVersion }),
            p_codigo_indicador: value.codigoIndicador,
            p_configuracion: {},
            p_id_estado: value.idEstado || null,
            p_id_sucursal: value.idSucursal,
            p_periodo: `${value.periodo}-01`,
            p_unidad: value.unidad,
            p_valor_meta: Number(value.valorMeta),
        }),
    async getPenalties(versionId?: number): Promise<PenalidadTipo[]> {
        const data = await rpc<unknown[]>("f_get_tb_compensacion_penalidad_tipo", {
            p_busqueda: null,
            p_id: null,
            p_id_cargo: null,
            p_id_estado: null,
            p_id_plan_version: versionId || null,
        });
        return arrayValue(data).map((row) => ({
            id: numberValue(row.id),
            idPlanVersion: numberValue(row.id_plan_version),
            planNombre: stringValue(row.plan_nombre),
            numeroVersion: numberValue(row.numero_version),
            estadoVersion: stringValue(row.estado_version),
            codigo: stringValue(row.codigo),
            nombre: stringValue(row.nombre),
            descripcion: stringValue(row.descripcion),
            idCargo: nullableNumber(row.id_cargo),
            cargoNombre: stringValue(row.cargo_nombre),
            idConceptoDescuento: numberValue(row.id_concepto_descuento),
            conceptoDescuentoNombre: stringValue(row.concepto_descuento_nombre),
            idConceptoBono: nullableNumber(row.id_concepto_bono_reportante),
            conceptoBonoNombre: stringValue(row.concepto_bono_reportante_nombre),
            montoReferencia: numberValue(row.monto_referencia),
            montoBono: nullableNumber(row.monto_bono_reportante),
            requiereRespuesta: Boolean(row.requiere_respuesta),
            idEstado: numberValue(row.id_estado),
            estado: stringValue(row.estado_nombre),
        }));
    },
    savePenalty: (id: number | null, value: JsonRecord) =>
        rpc(id ? "f_patch_tb_compensacion_penalidad_tipo" : "f_post_tb_compensacion_penalidad_tipo", {
            ...(id
                ? { p_id: id, p_limpiar_bono_reportante: !value.idConceptoBono, p_limpiar_cargo: !value.idCargo }
                : { p_id_plan_version: value.idPlanVersion }),
            p_codigo: value.codigo,
            p_configuracion: {},
            p_descripcion: value.descripcion || null,
            p_id_cargo: value.idCargo || null,
            p_id_concepto_bono_reportante: value.idConceptoBono || null,
            p_id_concepto_descuento: value.idConceptoDescuento,
            p_id_estado: value.idEstado || null,
            p_monto_bono_reportante: value.montoBono === "" ? null : Number(value.montoBono),
            p_monto_referencia: Number(value.montoReferencia),
            p_nombre: value.nombre,
            p_requiere_respuesta: value.requiereRespuesta === "SI",
        }),
};
