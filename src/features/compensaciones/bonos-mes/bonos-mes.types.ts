export type EstadoReporteMes = "BORRADOR" | "CONFIRMADO";
export type TipoOrigenDescuento = "ERROR_CUADRO" | "TOLERANCIA_CERO_DIGITAL";
export type TipoDescuento = "BLOQUE_30" | "BLOQUE_60" | "BLOQUE_90" | "TOTAL";

export type PeriodoBonosMes = { id: number; periodo: string; nombre: string; estadoReporte: EstadoReporteMes };

export type DescuentoMes = {
    id: number;
    tipoOrigen: TipoOrigenDescuento;
    tipo: TipoDescuento;
    porcentaje: number;
    importeBase: number;
    importeDescuento: number;
    motivo: string;
    estado: "ACTIVO" | "ANULADO";
    fechaRegistro: string;
    motivoAnulacion: string | null;
};

export type CodigoCondicionMes = "PUNTUALIDAD" | "META_AREA_15_DIAS";
export type CondicionMes = { codigoCondicion: CodigoCondicionMes; cumple: boolean; nota: string | null; fechaActualizacion: string };

export type LineaBonoMes = {
    clave: string;
    concepto: string;
    categoria: string;
    naturaleza: "INGRESO" | "DESCUENTO";
    cantidad: number;
    tarifa: number;
    importe: number;
};

export type BloqueoBonoMes = { codigo: string; mensaje: string };

export type ColaboradorBonosMes = {
    idColaborador: number;
    nombre: string;
    documento: string;
    cargo: string;
    sucursal: string;
    idSucursal: number | null;
    totalBonos: number;
    totalComisiones: number;
    totalDescuentos: number;
    totalNeto: number;
    puedeCalcular: boolean;
    bloqueos: BloqueoBonoMes[];
    descuentos: DescuentoMes[];
    condiciones: CondicionMes[];
    lineas: LineaBonoMes[];
};

export type TotalesBonosMes = { totalBonos: number; totalComisiones: number; totalDescuentos: number; totalNeto: number };

export type ListaBonosMes = {
    idPeriodo: number;
    estadoReporte: EstadoReporteMes;
    confirmadoEn: string | null;
    hashContenido: string | null;
    totalFilas: number;
    totales: TotalesBonosMes;
    filas: ColaboradorBonosMes[];
};

export type ReporteMesExportado = {
    periodo: string;
    nombrePeriodo: string;
    confirmadoEn: string;
    confirmadoPor: string | null;
    hashContenido: string;
    nota: string | null;
    totales: TotalesBonosMes;
    colaboradores: ColaboradorBonosMes[];
};

export type DescuentoValues = { tipoOrigen: TipoOrigenDescuento; tipo: TipoDescuento; motivo: string };
