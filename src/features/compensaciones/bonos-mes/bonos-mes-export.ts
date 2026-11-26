import type { ReporteMesExportado } from "./bonos-mes.types";

const celda = (value: string | number) => {
    const raw = String(value);
    // Evita que una hoja de cálculo interprete texto como fórmula.
    const seguro = /^[=+\-@]/.test(raw) && Number.isNaN(Number(raw)) ? `'${raw}` : raw;
    return /[",\n;]/.test(seguro) ? `"${seguro.replaceAll('"', '""')}"` : seguro;
};

/** CSV del reporte confirmado: una fila por colaborador, listo para cruzar con el legacy. */
export const reporteACsv = (reporte: ReporteMesExportado) => {
    const cabecera = ["Documento", "Colaborador", "Cargo", "Sede", "Bonos", "Comisiones", "Penalidades", "Total a reportar"];
    const filas = reporte.colaboradores.map((fila) => [
        fila.documento,
        fila.nombre,
        fila.cargo,
        fila.sucursal,
        fila.totalBonos.toFixed(2),
        fila.totalComisiones.toFixed(2),
        fila.totalDescuentos.toFixed(2),
        fila.totalNeto.toFixed(2),
    ]);
    const total = [
        "",
        "TOTAL",
        "",
        "",
        ...[reporte.totales.totalBonos, reporte.totales.totalComisiones, reporte.totales.totalDescuentos, reporte.totales.totalNeto].map((value) =>
            value.toFixed(2),
        ),
    ];
    return [cabecera, ...filas, total].map((fila) => fila.map(celda).join(",")).join("\r\n");
};
