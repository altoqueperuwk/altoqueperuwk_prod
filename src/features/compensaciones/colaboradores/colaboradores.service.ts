import { supabase } from "@/lib/supabase";
import type {
    AsignacionFormValues,
    CatalogItem,
    Colaborador,
    ColaboradorAsignacion,
    ColaboradorFicha,
    ColaboradorFilters,
    ColaboradorFormValues,
    ColaboradoresResult,
    UsuarioElegible,
} from "./colaboradores.types";

type JsonRecord = Record<string, unknown>;

const recordValue = (value: unknown): JsonRecord => (value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {});
const arrayValue = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.map(recordValue) : []);
const numberValue = (value: unknown) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const nullableNumber = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};
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
        ficha: mapFicha(row),
    };
};

const mapFicha = (row: JsonRecord): ColaboradorFicha => {
    const permissions = recordValue(row.permisos_accion);
    return {
        permisos: {
            puedeVerFicha: permissions.puede_ver_ficha === true,
            puedeEditarFicha: permissions.puede_editar_ficha === true,
        },
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
        return arrayValue(data)
            .filter((row) => {
                const linked = nullableNumber(row.id_colaborador);
                return idColaborador ? linked === idColaborador : linked === null;
            })
            .map((row) => ({
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
            await rpc<unknown>("f_get_tb_compensacion_colaborador_ficha", {
                p_busqueda: filters.search?.trim() || null,
                p_fecha_referencia: filters.fechaReferencia || null,
                p_id: null,
                p_id_cargo: filters.idCargo || null,
                p_id_estado: filters.idEstado || null,
                p_id_sucursal: filters.idSucursal || null,
                p_pagina: filters.page,
                p_tamano_pagina: filters.pageSize,
            }),
        );

        if (!Array.isArray(data.items) || nullableNumber(data.total) === null || nullableNumber(data.total_paginas) === null)
            throw new Error("La consulta de fichas está incompleta. Reintenta la carga.");
        if (data.version_contrato !== "B2_01") throw new Error("La consulta de fichas requiere el contrato B2_01 del backend de compensaciones.");

        return {
            resumen: ["colaboradores", "activos", "inactivos", "sedes"].every((key) => nullableNumber(recordValue(data.resumen)[key]) !== null)
                ? {
                      colaboradores: numberValue(recordValue(data.resumen).colaboradores),
                      activos: numberValue(recordValue(data.resumen).activos),
                      inactivos: numberValue(recordValue(data.resumen).inactivos),
                      sedes: numberValue(recordValue(data.resumen).sedes),
                  }
                : null,
            versionContrato: "B2_01",
            fechaReferencia: stringValue(data.fecha_referencia),
            puedeCrear: recordValue(data.permisos_accion).puede_crear === true,
            items: arrayValue(data.items).map(mapColaborador),
            total: numberValue(data.total),
            page: numberValue(data.pagina) || filters.page,
            pageSize: numberValue(data.tamano_pagina) || filters.pageSize,
            totalPages: numberValue(data.total_paginas),
        };
    },

    async getAdminCatalogs() {
        const data = recordValue(await rpc<unknown>("f_get_compensacion_personal_catalogos", {}));
        if (!["cargos", "planes", "sedes"].every((key) => Array.isArray(data[key])))
            throw new Error("No se recibieron los catálogos completos de personal (SQL95).");
        return {
            cargos: arrayValue(data.cargos).map(mapCatalog),
            planes: arrayValue(data.planes).map(mapCatalog),
            sedes: arrayValue(data.sedes).map(mapCatalog),
        };
    },

    async getCatalogs() {
        const [cargos, planes] = await Promise.all([
            rpc<unknown[]>("f_get_tb_compensacion_cargo", { p_busqueda: null, p_id: null, p_id_estado: null }),
            rpc<unknown[]>("f_get_tb_compensacion_plan", { p_busqueda: null, p_id: null, p_id_estado: null }),
        ]);
        return {
            cargos: arrayValue(cargos).map(mapCatalog),
            planes: arrayValue(planes).map(mapCatalog),
        };
    },

    async create(values: ColaboradorFormValues) {
        const nombreCompleto = values.nombreCompleto.trim().replace(/\s+/g, " ");
        const datos = {
            p_apellido_materno: null,
            p_apellido_paterno: null,
            p_celular: null,
            p_codigo_huellero: values.numeroDocumento.trim(),
            p_email: null,
            p_fecha_ingreso: values.fechaIngreso,
            p_id_cargo: values.idCargo,
            p_id_estado: values.idEstado || null,
            p_id_plan: values.idPlan,
            p_id_sucursal: values.idSucursal,
            p_id_usuario: values.idUsuario,
            p_modalidad: values.modalidad,
            p_nombre_completo: nombreCompleto,
            p_nombres: nombreCompleto,
            p_numero_documento: values.numeroDocumento.trim(),
            p_tipo_documento: values.tipoDocumento,
        };
        return rpc<JsonRecord>("f_post_tb_compensacion_colaborador", datos);
    },

    async update(id: number, values: ColaboradorFormValues) {
        const nombreCompleto = values.nombreCompleto.trim().replace(/\s+/g, " ");
        const datos = {
            ...(values.idCargo && values.idSucursal && values.idPlan
                ? {
                      p_id_cargo: values.idCargo,
                      p_id_sucursal: values.idSucursal,
                      p_id_plan: values.idPlan,
                      p_modalidad: values.modalidad,
                  }
                : {}),
            // NULL conserva información histórica que ya no se edita en este formulario.
            p_apellido_materno: null,
            p_apellido_paterno: null,
            p_celular: null,
            p_codigo_huellero: values.numeroDocumento.trim(),
            p_email: null,
            p_fecha_cese: values.fechaCese || null,
            p_fecha_ingreso: values.fechaIngreso,
            p_id: id,
            p_id_estado: values.idEstado,
            p_id_usuario: null, // El vínculo con tb_usuario es inmutable al editar.
            p_motivo_cese: values.motivoCese,
            p_nombre_completo: nombreCompleto,
            p_nombres: null,
            p_numero_documento: values.numeroDocumento.trim(),
            p_tipo_documento: values.tipoDocumento,
        };
        return values.idCargo
            ? rpc<JsonRecord>("f_post_compensacion_colaborador_ficha", {
                  p_id: id,
                  p_datos: datos,
              })
            : rpc<JsonRecord>("f_patch_tb_compensacion_colaborador", datos);
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
            p_id_plan: values.idPlan,
            p_id_sucursal: values.idSucursal,
            p_modalidad: values.modalidad,
            p_observacion: values.observacion || null,
        });
    },
};
