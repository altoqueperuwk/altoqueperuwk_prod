import { beforeEach, describe, expect, it, vi } from "vitest";
import { colaboradoresService } from "./colaboradores.service";
import type { ColaboradorFormValues } from "./colaboradores.types";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: rpcMock } }));

const filters = { search: "  asesor  ", idCargo: 3, idSucursal: 2, page: 2, pageSize: 20 };
const response = (item: Record<string, unknown> = {}, patch: Record<string, unknown> = {}) => ({
    version_contrato: "B2_01",
    fecha_referencia: "2026-10-03",
    permisos_accion: { puede_crear: true },
    items: [{ id: "7", nombre_completo: "Asesor de prueba", id_usuario: "9", ...item }],
    total: "21",
    pagina: 2,
    tamano_pagina: 20,
    total_paginas: 2,
    ...patch,
});
const resolve = (data: unknown) => rpcMock.mockResolvedValue({ data, error: null });

describe("colaboradores: contrato de ficha B2_01", () => {
    beforeEach(() => rpcMock.mockReset());

    it("solo ofrece usuarios sin ficha al crear y conserva solo el vínculo propio al editar", async () => {
        resolve([
            { id: 1, nombre: "Libre", id_colaborador: null },
            { id: 2, nombre: "Asociado", id_colaborador: 7 },
            { id: 3, nombre: "Otro", id_colaborador: 8 },
        ]);
        expect((await colaboradoresService.getEligibleUsers()).map((user) => user.id)).toEqual([1]);
        expect((await colaboradoresService.getEligibleUsers(7)).map((user) => user.id)).toEqual([2]);
    });
    it("lee KPI completos del servidor y mantiene ausencia como desconocida", async () => {
        resolve(response({}, { resumen: { colaboradores: "31", activos: "29", inactivos: "2", sedes: "4" } }));
        expect((await colaboradoresService.getList(filters)).resumen).toEqual({ colaboradores: 31, activos: 29, inactivos: 2, sedes: 4 });
        resolve(response());
        expect((await colaboradoresService.getList(filters)).resumen).toBeNull();
    });
    it("usa SQL95 para los catálogos administrativos sin consultas de sucursal separadas", async () => {
        resolve({
            cargos: [{ id: "3", nombre: "Jefe", codigo: "JEFE_TIENDA", id_estado: "1" }],
            planes: [],
            sedes: [{ id: "2", nombre: "Centro" }],
        });
        expect(await colaboradoresService.getAdminCatalogs()).toMatchObject({
            cargos: [{ id: 3, codigo: "JEFE_TIENDA", idEstado: 1 }],
            sedes: [{ id: 2, nombre: "Centro" }],
        });
        expect(rpcMock).toHaveBeenCalledExactlyOnceWith("f_get_compensacion_personal_catalogos", {});
    });

    it("consume la nueva RPC con filtros, referencia y paginación", async () => {
        resolve(response());
        const result = await colaboradoresService.getList({ ...filters, fechaReferencia: "2026-09-30" });
        expect(rpcMock).toHaveBeenCalledExactlyOnceWith("f_get_tb_compensacion_colaborador_ficha", {
            p_busqueda: "asesor",
            p_fecha_referencia: "2026-09-30",
            p_id: null,
            p_id_cargo: 3,
            p_id_estado: null,
            p_id_sucursal: 2,
            p_pagina: 2,
            p_tamano_pagina: 20,
        });
        expect(result).toMatchObject({ versionContrato: "B2_01", fechaReferencia: "2026-10-03", puedeCrear: true, total: 21, page: 2, totalPages: 2 });
        expect(result.items[0]).toMatchObject({ id: 7, idUsuario: 9 });
    });

    it.each([undefined, false, "false"])("no concede permisos con %s", async (permission) => {
        resolve(response({ permisos_accion: { puede_editar_ficha: permission } }, { permisos_accion: { puede_crear: permission } }));
        const result = await colaboradoresService.getList(filters);
        expect(result.puedeCrear).toBe(false);
        expect(result.items[0].ficha?.permisos).toMatchObject({ puedeEditarFicha: false });
    });

    it("conserva vacío sin inventar asignaciones, matriz ni cuentas", async () => {
        resolve(response({}, { items: [], total: 0, total_paginas: 0 }));
        expect(await colaboradoresService.getList(filters)).toMatchObject({ items: [], total: 0, totalPages: 0 });
    });

    it("rechaza otro contrato sin recurrir a la consulta anterior", async () => {
        resolve(response({}, { version_contrato: undefined }));
        await expect(colaboradoresService.getList(filters)).rejects.toThrow("B2_01");
        expect(rpcMock).toHaveBeenCalledTimes(1);
    });

    it("propaga errores del backend", async () => {
        const error = { code: "P0001", message: "Sin acceso" };
        rpcMock.mockResolvedValue({ data: null, error });
        await expect(colaboradoresService.getList(filters)).rejects.toBe(error);
    });

    const simpleForm: ColaboradorFormValues = {
        idUsuario: 9,
        tipoDocumento: "DNI",
        numeroDocumento: " 12345678 ",
        nombreCompleto: " María  Del Carmen Rojas ",
        fechaIngreso: "2026-10-01",
        fechaCese: "",
        motivoCese: "",
        idEstado: 1,
        idCargo: 1,
        idSucursal: 1,
        idPlan: 1,
        modalidad: "PRESENCIAL",
    };
    it("envía un nombre completo y usa el DNI como identificador de asistencia", async () => {
        resolve({ id: 7 });
        await colaboradoresService.create(simpleForm);
        expect(rpcMock).toHaveBeenCalledWith(
            "f_post_tb_compensacion_colaborador",
            expect.objectContaining({
                p_nombre_completo: "María Del Carmen Rojas",
                p_nombres: "María Del Carmen Rojas",
                p_numero_documento: "12345678",
                p_codigo_huellero: "12345678",
                p_email: null,
                p_celular: null,
                p_apellido_paterno: null,
                p_apellido_materno: null,
            }),
        );
    });
    it("edita el nombre visible sin borrar datos históricos ocultos", async () => {
        resolve({ id: 7 });
        await colaboradoresService.update(7, simpleForm);
        expect(rpcMock).toHaveBeenCalledWith(
            "f_post_compensacion_colaborador_ficha",
            expect.objectContaining({
                p_id: 7,
                p_datos: expect.objectContaining({
                    p_id: 7,
                    p_id_usuario: null,
                    p_nombre_completo: "María Del Carmen Rojas",
                    p_nombres: null,
                    p_apellido_paterno: null,
                    p_apellido_materno: null,
                    p_email: null,
                    p_celular: null,
                    p_codigo_huellero: "12345678",
                }),
            }),
        );
    });
    it("envía la asignación sin jornada ni importes en una sola RPC", async () => {
        resolve({ id: 7 });
        await colaboradoresService.update(7, simpleForm);
        const datos = rpcMock.mock.calls[0][1].p_datos as Record<string, unknown>;
        expect(datos).toMatchObject({ p_id_cargo: 1, p_id_sucursal: 1, p_id_plan: 1 });
        expect(datos).not.toHaveProperty("p_id_jornada");
        expect(datos).not.toHaveProperty("cuentas");
        expect(rpcMock.mock.calls[0][1]).not.toHaveProperty("p_importes");
    });
});
