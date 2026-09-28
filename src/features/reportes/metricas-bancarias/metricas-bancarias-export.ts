import ExcelJS from "exceljs";
import type { MetricasCliente, MetricasComision, MetricasComunidad, MetricasOperacionPendiente } from "./metricas-bancarias.types";

interface MetricasExportKpi {
    indicador: string;
    valor: string | number;
}

interface MetricasExportInput {
    banco: string;
    empresa: string;
    fechaDesde: string;
    fechaHasta: string;
    kpis: MetricasExportKpi[];
    commissions: MetricasComision[];
    communities: MetricasComunidad[];
    clients: MetricasCliente[];
    pendingOperations: MetricasOperacionPendiente[];
}

const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
};

export const exportMetricasBancarias = async (input: MetricasExportInput) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Altoque Peru WK";
    workbook.created = new Date();

    const addSheet = (name: string, columns: Array<{ header: string; key: string; width: number }>, rows: Record<string, string | number | null>[]) => {
        const sheet = workbook.addWorksheet(name);
        sheet.columns = columns;
        sheet.addRows(rows);
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6941C6" } };
        sheet.getRow(1).alignment = { vertical: "middle" };
        sheet.eachRow((row, rowIndex) => {
            if (rowIndex > 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowIndex % 2 === 0 ? "FFF7F7F8" : "FFFFFFFF" } };
            row.eachCell((cell) => { cell.border = { bottom: { style: "thin", color: { argb: "FFD0D5DD" } } }; });
        });
        return sheet;
    };

    addSheet("Resumen", [
        { header: "Banco", key: "banco", width: 18 },
        { header: "Empresa", key: "empresa", width: 32 },
        { header: "Desde", key: "desde", width: 14 },
        { header: "Hasta", key: "hasta", width: 14 },
        { header: "Indicador", key: "indicador", width: 28 },
        { header: "Valor", key: "valor", width: 20 },
    ], input.kpis.map((item) => ({ banco: input.banco, empresa: input.empresa, desde: input.fechaDesde, hasta: input.fechaHasta, ...item })));

    addSheet("Comisiones", [
        { header: "Porcentaje", key: "porcentaje", width: 14 }, { header: "Operaciones", key: "operaciones", width: 14 },
        { header: "Recaudacion", key: "recaudacion", width: 18 }, { header: "Comision", key: "comision", width: 18 },
        { header: "Gasto Operacional", key: "gastos", width: 20 }, { header: "Ganancia", key: "ganancias", width: 18 }, { header: "Salida", key: "salida", width: 18 },
    ], input.commissions.map((row) => ({ porcentaje: row.porcentaje / 100, operaciones: row.operaciones, recaudacion: row.recaudacion, comision: row.comision, gastos: row.gastosOperacionales, ganancias: row.ganancias, salida: row.salida })));

    addSheet("Comunidades", [
        { header: "Comunidad", key: "comunidad", width: 24 }, { header: "Operaciones", key: "operaciones", width: 14 },
        { header: "Recaudacion", key: "recaudacion", width: 18 }, { header: "Comision", key: "comision", width: 18 },
        { header: "Gasto Operacional", key: "gastos", width: 20 }, { header: "Ganancia", key: "ganancias", width: 18 },
        { header: "Salida", key: "salida", width: 18 }, { header: "Clientes Nuevos", key: "clientes", width: 16 }, { header: "Pendientes", key: "pendientes", width: 14 },
    ], input.communities.map((row) => ({ comunidad: row.comunidad, operaciones: row.operaciones, recaudacion: row.recaudacion, comision: row.comision, gastos: row.gastosOperacionales, ganancias: row.ganancias, salida: row.salida, clientes: row.clientesNuevos, pendientes: row.operacionesPendientes })));

    addSheet("Top clientes", [
        { header: "DNI", key: "dni", width: 16 }, { header: "Nombre Completo", key: "nombre", width: 36 }, { header: "Comunidad", key: "comunidad", width: 24 },
        { header: "Operaciones", key: "operaciones", width: 14 }, { header: "Pendientes", key: "pendientes", width: 14 }, { header: "Recaudacion", key: "recaudacion", width: 18 },
        { header: "Comision", key: "comision", width: 18 }, { header: "Gasto Operacional", key: "gastos", width: 20 }, { header: "Ganancia", key: "ganancias", width: 18 }, { header: "Salida", key: "salida", width: 18 },
    ], input.clients.map((row) => ({ dni: row.dni, nombre: row.nombreCompleto, comunidad: row.comunidad, operaciones: row.operaciones, pendientes: row.operacionesPendientes, recaudacion: row.recaudacion, comision: row.comision, gastos: row.gastosOperacionales, ganancias: row.ganancias, salida: row.salida })));

    addSheet("Pendientes", [
        { header: "Codigo", key: "codigo", width: 18 }, { header: "DNI", key: "dni", width: 16 }, { header: "Cliente", key: "cliente", width: 36 },
        { header: "Comunidad", key: "comunidad", width: 24 }, { header: "Banco", key: "banco", width: 16 }, { header: "Empresa", key: "empresa", width: 30 },
        { header: "Cuenta", key: "cuenta", width: 20 }, { header: "Fecha", key: "fecha", width: 22 }, { header: "Recaudacion", key: "recaudacion", width: 18 },
        { header: "Transferencia", key: "transferencia", width: 18 }, { header: "Estado actual", key: "estado", width: 18 },
    ], input.pendingOperations.map((row) => ({ codigo: row.codigoOperacion, dni: row.dni, cliente: row.nombreCompleto, comunidad: row.comunidad, banco: row.ruta.toUpperCase(), empresa: row.empresa, cuenta: row.cuenta, fecha: row.fecha, recaudacion: row.recaudacion, transferencia: row.transferencia, estado: row.estado })));

    for (const sheet of workbook.worksheets) {
        sheet.eachRow((row, rowIndex) => row.eachCell((cell, columnIndex) => {
            const key = sheet.columns[columnIndex - 1]?.key;
            if (rowIndex > 1 && ["recaudacion", "comision", "gastos", "ganancias", "salida", "transferencia"].includes(String(key))) cell.numFmt = '"S/ "#,##0.00';
            if (rowIndex > 1 && key === "porcentaje") cell.numFmt = "0.00%";
        }));
    }

    const output = await workbook.xlsx.writeBuffer();
    const fileName = `metricas-bancarias-${input.banco.toLowerCase()}-${input.fechaDesde}-${input.fechaHasta}.xlsx`;
    downloadBlob(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
};
