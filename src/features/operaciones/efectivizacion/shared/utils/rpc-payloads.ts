import type {
    OperacionRuta,
    RutaOperacionCaja,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import type { ExcelRow } from "@/features/operaciones/efectivizacion/shared/utils/excel-parser";

interface UserContext {
    userId: number | null;
    userName: string | null;
}

interface EstadoRef {
    id: number;
    nombre: string;
}

interface CatalogRef {
    id: number;
    nombre: string;
}

export const buildOperacionPagadoPayload = (id: number, estado: EstadoRef, user: UserContext) => ({
    p_id: id,
    p_id_estado: estado.id,
    p_nombre_estado: estado.nombre,
    p_id_usuario_gestor: user.userId,
    p_nombre_usuario_gestor: user.userName,
});

export const buildOperacionReanudarPayload = (id: number, estado: EstadoRef, user: UserContext) => ({
    p_id: id,
    p_id_estado: estado.id,
    p_nombre_estado: estado.nombre,
    p_id_usuario_gestor: user.userId,
    p_nombre_usuario_gestor: user.userName,
});

export const buildOperacionRetencionConfirmPayload = (id: number, user: UserContext) => ({
    p_id: id,
    p_id_usuario_gestor: user.userId,
    p_nombre_usuario_gestor: user.userName,
});

export const buildOperacionDerivacionPayload = (
    id: number,
    rutaOrigen: OperacionRuta,
    rutaDestino: string,
    user: UserContext,
) => ({
    p_id: id,
    p_ruta_origen: rutaOrigen,
    p_ruta_destino: rutaDestino,
    p_flag_derivado: true,
    p_fecha_derivacion: expectDateString(),
    p_id_usuario_deriva: user.userId,
    p_nombre_usuario_deriva: user.userName,
});

export const buildOperacionUsuarioPayload = (id: number, idUsuarioGestor: number, nombreUsuarioGestor: string) => ({
    p_id: id,
    p_id_usuario_gestor: idUsuarioGestor,
    p_nombre_usuario_gestor: nombreUsuarioGestor,
});

export const buildOperacionEmpresaPayload = (id: number, company: RutaOperacionCaja, user: UserContext) => ({
    p_id: id,
    p_id_empresa_ingreso: company.id_empresa,
    p_nombre_empresa_ingreso: company.nombre_empresa,
    p_id_empresa_cuenta_ingreso: company.id_empresa_cuenta_bancaria,
    p_id_banco_empresa_cuenta_ingreso: company.id_banco,
    p_nombre_banco_empresa_cuenta_ingreso: company.nombre_banco,
    p_id_empresa_salida: company.id_empresa,
    p_nombre_empresa_salida: company.nombre_empresa,
    p_id_empresa_cuenta_salida: company.id_empresa_cuenta_bancaria,
    p_id_banco_empresa_cuenta_salida: company.id_banco,
    p_nombre_banco_empresa_cuenta_salida: company.nombre_banco,
    p_id_usuario_gestor: user.userId,
    p_nombre_usuario_gestor: user.userName,
});

export const buildOperacionEmpresaIngresoPayload = (id: number, company: RutaOperacionCaja, user: UserContext) => ({
    p_id: id,
    p_id_empresa_ingreso: company.id_empresa,
    p_nombre_empresa_ingreso: company.nombre_empresa,
    p_id_empresa_cuenta_ingreso: company.id_empresa_cuenta_bancaria,
    p_id_banco_empresa_cuenta_ingreso: company.id_banco,
    p_nombre_banco_empresa_cuenta_ingreso: company.nombre_banco,
    p_id_usuario_gestor: user.userId,
    p_nombre_usuario_gestor: user.userName,
});

export const buildOperacionEmpresaSalidaPayload = (id: number, company: RutaOperacionCaja, user: UserContext) => ({
    p_id: id,
    p_id_empresa_salida: company.id_empresa,
    p_nombre_empresa_salida: company.nombre_empresa,
    p_id_empresa_cuenta_salida: company.id_empresa_cuenta_bancaria,
    p_id_banco_empresa_cuenta_salida: company.id_banco,
    p_nombre_banco_empresa_cuenta_salida: company.nombre_banco,
    p_id_banco_cliente_transferencia: company.id_banco,
    p_nombre_banco_cliente_transferencia: company.nombre_banco,
    p_id_usuario_gestor: user.userId,
    p_nombre_usuario_gestor: user.userName,
});

export const buildPagoDeudaSalidaPayload = (
    id: number,
    company: RutaOperacionCaja,
    rutaDestino: OperacionRuta,
    user: UserContext,
) => ({
    p_id_operacion: id,
    p_id_empresa_salida: company.id_empresa,
    p_id_empresa_cuenta_salida: company.id_empresa_cuenta_bancaria,
    p_id_usuario_gestor: user.userId,
    p_nombre_usuario_gestor: user.userName,
    p_ruta_destino: rutaDestino,
});

export const buildExcelPayload = ({
    activeCompany,
    rows,
    selectedCommunity,
    service,
    user,
    ruta,
}: {
    activeCompany: RutaOperacionCaja;
    rows: ExcelRow[];
    selectedCommunity: CatalogRef;
    service: CatalogRef;
    user: UserContext;
    ruta: string;
}) => ({
    p_datos_excel_json: rows,
    p_id_codigo_servicio: service.id,
    p_nombre_codigo_servicio: service.nombre,
    p_id_comunidad: selectedCommunity.id,
    p_nombre_comunidad: selectedCommunity.nombre,
    p_nombre_tipo_deposito: null,
    p_id_empresa_ingreso: activeCompany.id_empresa,
    p_nombre_empresa_ingreso: activeCompany.nombre_empresa,
    p_id_banco: activeCompany.id_banco,
    p_id_usuario: user.userId,
    p_nombre_usuario: user.userName,
    p_ruta_actual: ruta,
});

const expectDateString = () => new Date().toISOString();
