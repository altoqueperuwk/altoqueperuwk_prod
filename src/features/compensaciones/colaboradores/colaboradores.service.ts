import { supabase } from "@/lib/supabase";
import type {
    AsignacionFormValues,
    CatalogItem,
    Colaborador,
    ColaboradorAsignacion,
    ColaboradorCuentaPago,
    ColaboradorFilters,
    ColaboradorFormValues,
    ColaboradoresResult,
    CuentaPagoFormValues,
    UsuarioElegible,
} from "./colaboradores.types";

type JsonRecord = Record<string, unknown>;

const recordValue = (value: unknown): JsonRecord => (value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {});
const arrayValue = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.map(recordValue) : []);
const numberValue = (value: unknown) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const nullableNumber = (value: unknown) => (value === null || value === undefined ? null : numberValue(value));
const nullableString = (value: unknown) => (value === null || value === undefined || value === "" ? null : String(value));
const stringValue = (value: unknown) => String(value ?? "");

const rpc = async <T>(name: string, params: JsonRecord): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data as T;
};

const mapAsignacion = (value: unknown): ColaboradorAsignacion => {
    const row = recordValue(value);
    return {
        id: numberValue(row.id),
        idCargo: numberValue(row.id_cargo),
        cargoNombre: stringValue(row.cargo_nombre),
        idSucursal: numberValue(row.id_sucursal),
        sucursalNombre: stringValue(row.sucursal_nombre),
        idJornada: numberValue(row.id_jornada),
        jornadaNombre: stringValue(row.jornada_nombre),
        idPlan: numberValue(row.id_plan),
        planNombre: stringValue(row.plan_nombre),
        fechaInicio: stringValue(row.fecha_inicio),
        fechaFin: nullableString(row.fecha_fin),
        modalidad: stringValue(row.modalidad),
        observacion: nullableString(row.observacion),
        esVigente: Boolean(row.es_vigente),
        estadoNombre: stringValue(row.estado_nombre),
    };
};

const mapColaborador = (value: unknown): Colaborador => {
    const row = recordValue(value);
    return {
        id: numberValue(row.id),
        idUsuario: nullableNumber(row.id_usuario),
        usuarioNombre: stringValue(row.usuario_nombre),
        usuarioUsername: stringValue(row.usuario_username),
        tipoDocumento: stringValue(row.tipo_documento),
        numeroDocumento: stringValue(row.numero_documento),
        nombres: stringValue(row.nombres),
        apellidoPaterno: stringValue(row.apellido_paterno),
        apellidoMaterno: stringValue(row.apellido_materno),
        nombreCompleto: stringValue(row.nombre_completo),
        email: stringValue(row.email),
        celular: stringValue(row.celular),
        codigoHuellero: stringValue(row.codigo_huellero),
        fechaIngreso: stringValue(row.fecha_ingreso),
        fechaCese: nullableString(row.fecha_cese),
        motivoCese: stringValue(row.motivo_cese),
        idEstado: numberValue(row.id_estado),
        estadoNombre: stringValue(row.estado_nombre),
        asignacion: row.asignacion ? mapAsignacion(row.asignacion) : null,
    };
};

const mapCuenta = (value: unknown): ColaboradorCuentaPago => {
    const row = recordValue(value);
    return {
        id: numberValue(row.id),
        idBanco: numberValue(row.id_banco),
        bancoNombre: stringValue(row.banco_nombre),
        tipoCuenta: stringValue(row.tipo_cuenta),
        moneda: stringValue(row.moneda),
        numeroCuenta: stringValue(row.numero_cuenta),
        numeroCci: nullableString(row.numero_cci),
        titular: stringValue(row.titular),
        esPrincipal: Boolean(row.es_principal),
        fechaInicio: stringValue(row.fecha_inicio),
        fechaFin: nullableString(row.fecha_fin),
        idEstado: numberValue(row.id_estado),
        estadoNombre: stringValue(row.estado_nombre),
    };
};

const mapCatalog = (value: unknown): CatalogItem => {
    const row = recordValue(value);
    return {
        id: numberValue(row.id),
        nombre: stringValue(row.nombre),
        codigo: stringValue(row.codigo),
        idEstado: numberValue(row.id_estado),
    };
};

export const colaboradoresService = {
    async getEligibleUsers(idColaborador?: number): Promise<UsuarioElegible[]> {
        const data = await rpc<unknown[]>("f_get_tb_compensacion_usuario_elegible", {
            p_busqueda: null,
            p_id_colaborador: idColaborador || null,
        });
        return arrayValue(data).map((row) => ({
            id: numberValue(row.id),
            username: stringValue(row.username),
            nombre: stringValue(row.nombre),
            email: stringValue(row.email),
            idRol: numberValue(row.id_rol),
            rolNombre: stringValue(row.rol_nombre),
            idSucursal: nullableNumber(row.id_sucursal),
            sucursalNombre: stringValue(row.sucursal_nombre),
            estadoNombre: stringValue(row.estado_nombre),
            idColaborador: nullableNumber(row.id_colaborador),
        }));
    },

    async getList(filters: ColaboradorFilters): Promise<ColaboradoresResult> {
        const data = recordValue(
            await rpc<unknown>("f_get_tb_compensacion_colaborador", {
                p_busqueda: filters.search?.trim() || null,
                p_fecha_referencia: null,
                p_id: null,
                p_id_cargo: filters.idCargo || null,
                p_id_estado: filters.idEstado || null,
                p_id_sucursal: filters.idSucursal || null,
                p_pagina: filters.page,
                p_tamano_pagina: filters.pageSize,
            }),
        );

        return {
            items: arrayValue(data.items).map(mapColaborador),
            total: numberValue(data.total),
            page: numberValue(data.pagina) || filters.page,
            pageSize: numberValue(data.tamano_pagina) || filters.pageSize,
            totalPages: numberValue(data.total_paginas),
        };
    },

    async getCatalogs() {
        const [cargos, jornadas, planes] = await Promise.all([
            rpc<unknown[]>("f_get_tb_compensacion_cargo", { p_busqueda: null, p_id: null, p_id_estado: null }),
            rpc<unknown[]>("f_get_tb_compensacion_jornada", { p_busqueda: null, p_id: null, p_id_estado: null }),
            rpc<unknown[]>("f_get_tb_compensacion_plan", { p_busqueda: null, p_id: null, p_id_estado: null }),
        ]);
        return {
            cargos: arrayValue(cargos).map(mapCatalog),
            jornadas: arrayValue(jornadas).map(mapCatalog),
            planes: arrayValue(planes).map(mapCatalog),
        };
    },

    async create(values: ColaboradorFormValues) {
        const nombreCompleto = [values.nombres, values.apellidoPaterno, values.apellidoMaterno].filter(Boolean).join(" ");
        return rpc<JsonRecord>("f_post_tb_compensacion_colaborador", {
            p_apellido_materno: values.apellidoMaterno || null,
            p_apellido_paterno: values.apellidoPaterno || null,
            p_celular: values.celular || null,
            p_codigo_huellero: values.codigoHuellero || null,
            p_email: values.email || null,
            p_fecha_ingreso: values.fechaIngreso,
            p_id_cargo: values.idCargo,
            p_id_estado: values.idEstado || null,
            p_id_jornada: values.idJornada,
            p_id_plan: values.idPlan,
            p_id_sucursal: values.idSucursal,
            p_id_usuario: values.idUsuario,
            p_modalidad: values.modalidad,
            p_nombre_completo: nombreCompleto,
            p_nombres: values.nombres,
            p_numero_documento: values.numeroDocumento,
            p_tipo_documento: values.tipoDocumento,
        });
    },

    async update(id: number, values: ColaboradorFormValues) {
        const nombreCompleto = [values.nombres, values.apellidoPaterno, values.apellidoMaterno].filter(Boolean).join(" ");
        return rpc<JsonRecord>("f_patch_tb_compensacion_colaborador", {
            p_apellido_materno: values.apellidoMaterno,
            p_apellido_paterno: values.apellidoPaterno,
            p_celular: values.celular,
            p_codigo_huellero: values.codigoHuellero,
            p_email: values.email,
            p_fecha_cese: values.fechaCese || null,
            p_fecha_ingreso: values.fechaIngreso,
            p_id: id,
            p_id_estado: values.idEstado,
            p_id_usuario: values.idUsuario,
            p_motivo_cese: values.motivoCese,
            p_nombre_completo: nombreCompleto,
            p_nombres: values.nombres,
            p_numero_documento: values.numeroDocumento,
            p_tipo_documento: values.tipoDocumento,
        });
    },

    async updateStatus(id: number, idEstado: number) {
        return rpc<JsonRecord>("f_patch_tb_compensacion_colaborador", {
            p_apellido_materno: null,
            p_apellido_paterno: null,
            p_celular: null,
            p_codigo_huellero: null,
            p_email: null,
            p_fecha_cese: null,
            p_fecha_ingreso: null,
            p_id: id,
            p_id_estado: idEstado,
            p_id_usuario: null,
            p_motivo_cese: null,
            p_nombre_completo: null,
            p_nombres: null,
            p_numero_documento: null,
            p_tipo_documento: null,
        });
    },

    async getAssignments(idColaborador: number): Promise<ColaboradorAsignacion[]> {
        const data = await rpc<unknown[]>("f_get_tb_compensacion_asignacion", {
            p_fecha_referencia: null,
            p_id: null,
            p_id_colaborador: idColaborador,
        });
        return arrayValue(data).map(mapAsignacion);
    },

    async saveAssignment(idColaborador: number, values: AsignacionFormValues) {
        return rpc<JsonRecord>("f_post_tb_compensacion_asignacion_cambio", {
            p_fecha_inicio: values.fechaInicio,
            p_id_cargo: values.idCargo,
            p_id_colaborador: idColaborador,
            p_id_estado: values.idEstado || null,
            p_id_jornada: values.idJornada,
            p_id_plan: values.idPlan,
            p_id_sucursal: values.idSucursal,
            p_modalidad: values.modalidad,
            p_observacion: values.observacion || null,
        });
    },

    async getAccounts(idColaborador: number): Promise<ColaboradorCuentaPago[]> {
        const data = await rpc<unknown[]>("f_get_tb_compensacion_cuenta_pago", {
            p_id: null,
            p_id_colaborador: idColaborador,
            p_incluir_datos_completos: false,
            p_solo_vigentes: false,
        });
        return arrayValue(data).map(mapCuenta);
    },

    async saveAccount(idColaborador: number, values: CuentaPagoFormValues, id?: number) {
        if (id) {
            return rpc<JsonRecord>("f_patch_tb_compensacion_cuenta_pago", {
                p_es_principal: values.esPrincipal,
                p_fecha_fin: values.fechaFin || null,
                p_fecha_inicio: values.fechaInicio,
                p_id: id,
                p_id_banco: values.idBanco,
                p_id_estado: values.idEstado,
                p_moneda: values.moneda,
                p_numero_cci: values.numeroCci.includes("*") ? null : values.numeroCci,
                p_numero_cuenta: values.numeroCuenta.includes("*") ? null : values.numeroCuenta,
                p_tipo_cuenta: values.tipoCuenta,
                p_titular: values.titular,
            });
        }

        return rpc<JsonRecord>("f_post_tb_compensacion_cuenta_pago", {
            p_es_principal: values.esPrincipal,
            p_fecha_inicio: values.fechaInicio,
            p_id_banco: values.idBanco,
            p_id_colaborador: idColaborador,
            p_id_estado: values.idEstado || null,
            p_moneda: values.moneda,
            p_numero_cci: values.numeroCci || null,
            p_numero_cuenta: values.numeroCuenta,
            p_tipo_cuenta: values.tipoCuenta,
            p_titular: values.titular,
        });
    },
};
