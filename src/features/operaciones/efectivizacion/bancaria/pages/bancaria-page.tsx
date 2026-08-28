import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import ExcelJS from "exceljs";
import { AppLayout } from "@/components/application/app-layout";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { File06, File07 } from "@untitledui/icons";
import { cajaOperativaService } from "@/services/caja-operativa.service";
import { CuentaTabs } from "@/features/operaciones/efectivizacion/shared/components/cuenta-tabs";
import { EmpresaTabs } from "@/features/operaciones/efectivizacion/shared/components/empresa-tabs";
import { OperacionConfirmModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-confirm-modal";
import { OperacionCajasRutaModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-cajas-ruta-modal";
import { OperacionConfigDropdown } from "@/features/operaciones/efectivizacion/shared/components/operacion-config-dropdown";
import { OperacionEmpresasModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-empresas-modal";
import { OperacionEmpresaPrincipalModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-empresa-principal-modal";
import { OperacionReglasAbonoModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-reglas-abono-modal";
import { OperacionReglasEfectivizacionModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-reglas-efectivizacion-modal";
import { useActiveCompany } from "@/features/operaciones/efectivizacion/shared/hooks/use-active-company";
import { useRouteCompanies } from "@/features/operaciones/efectivizacion/shared/hooks/use-route-companies";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { CajaOperativa, OperacionRutaBancaria } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { isDigitalWalletBank } from "@/features/operaciones/efectivizacion/shared/utils/digital-wallet";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { BancariaExcelUpload } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-excel-upload";
import { BancariaInlineForms } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-inline-forms";
import { BancariaKpiGrid } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-kpi-grid";
import { BancariaOperationalTabs } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-operational-tabs";
import { BancariaReporteCierrePdfOficial } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-reporte-cierre-pdf-oficial";
import { BancariaTopActions } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-top-actions";
import { useBancariaKpis } from "@/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-kpis";
import { calcularSaldoBanco } from "@/features/operaciones/efectivizacion/bancaria/utils/saldo-banco";

interface BancariaPageProps {
    ruta: OperacionRutaBancaria;
}

const toLimaDateKey = (value: string | Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "America/Lima",
        year: "numeric",
    }).formatToParts(new Date(value));

    const year = parts.find((part) => part.type === "year")?.value ?? "";
    const month = parts.find((part) => part.type === "month")?.value ?? "";
    const day = parts.find((part) => part.type === "day")?.value ?? "";

    return `${year}-${month}-${day}`;
};

export const BancariaPage = ({ ruta }: BancariaPageProps) => {
    const [refreshKey, setRefreshKey] = useState(0);
    const [metricsRefreshKey, setMetricsRefreshKey] = useState(0);
    const [downloadKey, setDownloadKey] = useState(0);
    const [isCajasOpen, setIsCajasOpen] = useState(false);
    const [isEmpresasOpen, setIsEmpresasOpen] = useState(false);
    const [isEmpresaPrincipalOpen, setIsEmpresaPrincipalOpen] = useState(false);
    const [isReglasAbonoOpen, setIsReglasAbonoOpen] = useState(false);
    const [isReglasOpen, setIsReglasOpen] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [isReopeningClose, setIsReopeningClose] = useState(false);
    const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
    const [selectedHistoryClosureId, setSelectedHistoryClosureId] = useState<number | null>(null);
    const [isHistoryDateAvailable, setIsHistoryDateAvailable] = useState(true);
    const [isEditCajaOpen, setIsEditCajaOpen] = useState(false);
    const [cajaEdit, setCajaEdit] = useState<CajaOperativa | null>(null);
    const [editSaldoInicial, setEditSaldoInicial] = useState("");
    const [isSavingCaja, setIsSavingCaja] = useState(false);
    const [isDownloadOpen, setIsDownloadOpen] = useState(false);
    const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
    const [isReopenConfirmOpen, setIsReopenConfirmOpen] = useState(false);
    const [todayCloseDateKey, setTodayCloseDateKey] = useState<string | null>(null);
    const [reporteData, setReporteData] = useState<Record<string, unknown> | null>(null);
    const [isLoadingReporte, setIsLoadingReporte] = useState(false);
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const routeLabel = getRutaLabel(ruta);
    const workspaceRoutes = useMemo<OperacionRutaBancaria[]>(
        () => ruta === "interbank" ? ["interbank", "safetypay"] : [ruta],
        [ruta],
    );
    const { data: cajas, error: companiesError, isLoading: isLoadingCompanies } = useRouteCompanies(workspaceRoutes, refreshKey);
    const {
        activeAccountId,
        activeCajaId,
        activeCompany,
        activeCompanyCaja,
        activeCompanyCajas,
        activeCompanyId,
        companies,
        setActiveAccountId,
        setActiveCompanyId,
    } = useActiveCompany(cajas, ruta);
    const activeOperationRoute = (activeCompanyCaja?.ruta as OperacionRutaBancaria | undefined) ?? ruta;
    const orderedCompanies = useMemo(() => {
        if (ruta !== "interbank" && ruta !== "safetypay") return companies;

        const safetyPayCompanies = companies.filter((company) => String(company.nombre_empresa ?? "").trim().toUpperCase() === "SAFETYPAY");
        const otherCompanies = companies.filter((company) => String(company.nombre_empresa ?? "").trim().toUpperCase() !== "SAFETYPAY");
        return [...safetyPayCompanies, ...otherCompanies];
    }, [companies, ruta]);
    const visibleAccountTabs = useMemo(
        () => ruta === "interbank"
            ? activeCompanyCajas.filter((account) => String(account.nombre_banco ?? "").trim().toUpperCase() !== "INTERBANK")
            : activeCompanyCajas,
        [activeCompanyCajas, ruta],
    );
    const { data: kpi, error: kpiError, gananciasBadge, isLoading: isLoadingKpis } = useBancariaKpis(
        activeOperationRoute,
        activeCompanyId,
        activeAccountId,
        activeCajaId,
        selectedHistoryDate,
        refreshKey + metricsRefreshKey,
        workspaceRoutes,
    );

    useEffect(() => {
        setSelectedHistoryDate(null);
        setSelectedHistoryClosureId(null);
    }, [activeAccountId, activeCompanyId]);

    const handleHistoryClosureChange = useCallback((selection: { id: number; date: string } | null) => {
        setSelectedHistoryClosureId(selection?.id ?? null);
    }, []);

    const activeCajaIds = useMemo(
        () => activeCajaId ? [activeCajaId] : [],
        [activeCajaId],
    );
    const routeCajaIds = useMemo(
        () => Array.from(new Set(
            cajas
                .filter((caja) => workspaceRoutes.includes(caja.ruta as OperacionRutaBancaria))
                .map((caja) => caja.id_caja)
                .filter((id): id is number => id != null),
        )),
        [cajas, workspaceRoutes],
    );
    const isActiveDigitalWallet = isDigitalWalletBank(activeCompanyCaja);

    useEffect(() => {
        let ignore = false;
        const cajaId = activeCajaId;

        if (!cajaId) {
            setTodayCloseDateKey(null);
            return;
        }

        operacionesRpcService
            .getCajaCierres({ p_id_caja: cajaId })
            .then((rows) => {
                if (ignore) return;
                const todayKey = toLimaDateKey(new Date());
                const hasTodayClose = (rows ?? []).some((row) => row.fecha_cierre && toLimaDateKey(row.fecha_cierre) === todayKey);
                setTodayCloseDateKey(hasTodayClose ? todayKey : null);
            })
            .catch(() => {
                if (!ignore) setTodayCloseDateKey(null);
            });

        return () => {
            ignore = true;
        };
    }, [activeCajaId, refreshKey, metricsRefreshKey]);

    const loadReporteData = async () => {
        const cajaId = activeCajaIds[0];
        if (!cajaId) {
            addToast("error", "La empresa activa no tiene caja operativa configurada.");
            return null;
        }

        setIsLoadingReporte(true);
        try {
            const data = await operacionesRpcService.getReporteCierre({
                p_id_caja: cajaId,
                p_id_empresa: activeCompanyId,
                p_ruta: ruta,
                p_id_caja_cierre: selectedHistoryClosureId ?? undefined,
                p_fecha_cierre: selectedHistoryClosureId ? undefined : selectedHistoryDate || undefined,
            });
            const gastosBancoSalida = await operacionesRpcService.getRutaGastosSalidaV2({
                p_ruta: activeOperationRoute,
                p_id_empresa: activeCompanyCaja?.id_empresa ?? activeCompanyId,
                p_id_empresa_cuenta_bancaria: activeCompanyCaja?.id_empresa_cuenta_bancaria ?? activeAccountId,
                p_id_caja: cajaId,
                p_id_caja_cierre: selectedHistoryClosureId,
            });

            const normalizeMovementOrigin = (value: unknown) => String(value ?? "").trim().toUpperCase().replaceAll("_", " ");
            const isReportMovement = (row: Record<string, unknown>) => [
                "PAGO DEUDA COMISION",
                "OTROS",
                "TRANSFERENCIA INTERNA",
            ].includes(normalizeMovementOrigin(row.tipo_origen));
            const reportMovimientos = Array.isArray(data.movimientos)
                ? (data.movimientos as Record<string, unknown>[]).filter(isReportMovement)
                : [];

            // Keep downloads aligned with the Movimientos tab while older deployed
            // versions of the report RPC are still being recompiled.
            let movimientos = reportMovimientos;
            if (movimientos.length === 0) {
                const fallback = await operacionesRpcService.getMovimientos({
                    p_id_caja: cajaId,
                    p_fecha_caja_cierre_desde: selectedHistoryDate ? `${selectedHistoryDate}T00:00:00` : undefined,
                    p_fecha_caja_cierre_hasta: selectedHistoryDate ? `${selectedHistoryDate}T23:59:59` : undefined,
                });
                movimientos = ((fallback ?? []) as unknown as Record<string, unknown>[]).filter(isReportMovement);
            }

            const normalizedData = {
                ...data,
                id_empresa: activeCompanyCaja?.id_empresa ?? activeCompanyId,
                id_banco: activeCompanyCaja?.id_banco ?? null,
                id_empresa_cuenta_bancaria: activeCompanyCaja?.id_empresa_cuenta_bancaria ?? activeAccountId,
                kpi: {
                    ...((data.kpi ?? {}) as Record<string, unknown>),
                    gastos_banco_salida: Number(gastosBancoSalida ?? 0),
                },
                movimientos,
            };
            setReporteData(normalizedData);
            return normalizedData as Record<string, unknown>;
        } catch {
            addToast("error", "Error al cargar los datos del reporte.");
            return null;
        } finally {
            setIsLoadingReporte(false);
        }
    };

    const handleDownloadExcel = async (reportDataOverride?: Record<string, unknown> | null) => {
        const data = reportDataOverride ?? reporteData;
        if (!data) return;
        const workbook = new ExcelJS.Workbook();
        workbook.creator = "Altoque Peru WK";
        workbook.created = new Date();
        const worksheet = workbook.addWorksheet("Hoja1", {
            pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
            properties: { defaultRowHeight: 18 },
        });

        const colors = {
            navy: "1E2A38",
            navySoft: "2D3F52",
            gold: "D9BE8C",
            paper: "F4F6F9",
            line: "E5E7EB",
            row: "F8FAFC",
            white: "FFFFFF",
            ink: "1E2A38",
            muted: "64748B",
            green: "10B981",
            coral: "F0654B",
        };
        const money = (value: unknown) => Number(value ?? 0);
        const text = (value: unknown) => value === null || value === undefined || value === "" ? "-" : String(value);
        const percent = (value: unknown) => `${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(money(value))}%`;
        const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";
        const dateTime = (value: unknown) => {
            if (!value) return "-";
            const parsed = new Date(String(value));
            return `${parsed.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}\n${parsed.toLocaleDateString("es-PE")}`;
        };
        const reportFileName = getReportFileName(data).replace(/\.pdf$/i, ".xlsx");
        const kpi = (data.kpi ?? {}) as Record<string, number>;
        const saldoBanco = calcularSaldoBanco(
            kpi,
            Number(data.id_empresa ?? 0),
            Number(data.id_banco ?? 0),
            Number(data.id_empresa_cuenta_bancaria ?? 0),
        );
        const efectivizacion = ((data.efectivizacion as Record<string, unknown>[]) ?? []);
        const efectivizacionPendientes = ((data.efectivizacion_pendientes as Record<string, unknown>[]) ?? []);
        const derivados = ((data.derivados as Record<string, unknown>[]) ?? []);
        const derivadosPendientes = ((data.derivados_pendientes as Record<string, unknown>[]) ?? []);
        const pagoDeuda = ((data.pago_deuda as Record<string, unknown>[]) ?? []);
        const pagoDeudaPendientes = ((data.pago_deuda_pendientes as Record<string, unknown>[]) ?? []);
        const pos = ((data.pos as Record<string, unknown>[]) ?? []);
        const posPendientes = ((data.pos_pendientes as Record<string, unknown>[]) ?? []);
        const movimientos = ((data.movimientos as Record<string, unknown>[]) ?? []);
        const totalRows = efectivizacion.length + efectivizacionPendientes.length + derivados.length + derivadosPendientes.length + pagoDeuda.length + pagoDeudaPendientes.length + pos.length + posPendientes.length + movimientos.length;

        worksheet.columns = [
            { width: 13 }, { width: 12 }, { width: 12 }, { width: 13 },
            { width: 13 }, { width: 11 }, { width: 13 }, { width: 12 },
            { width: 12 }, { width: 14 }, { width: 11 }, { width: 11 },
        ];
        worksheet.views = [{ showGridLines: false }];

        const styleCell = (cell: ExcelJS.Cell, options: { bold?: boolean; size?: number; color?: string; bg?: string; align?: "left" | "center" | "right" } = {}) => {
            cell.font = { name: "Arial", size: options.size ?? 8, bold: options.bold ?? false, color: { argb: options.color ?? "1E2A38" } };
            cell.alignment = { horizontal: options.align ?? "left", vertical: "middle", wrapText: true };
            cell.border = {
                top: { style: "thin", color: { argb: colors.line } },
                left: { style: "thin", color: { argb: colors.line } },
                bottom: { style: "thin", color: { argb: colors.line } },
                right: { style: "thin", color: { argb: colors.line } },
            };
            if (options.bg) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: options.bg } };
        };

        const mergeAndStyle = (
            row: number,
            startCol: number,
            endCol: number,
            value: string | number,
            options: { bold?: boolean; size?: number; color?: string; bg?: string; align?: "left" | "center" | "right"; numFmt?: string } = {},
        ) => {
            worksheet.mergeCells(row, startCol, row, endCol);
            const cell = worksheet.getCell(row, startCol);
            cell.value = value;
            styleCell(cell, options);
            if (options.numFmt) cell.numFmt = options.numFmt;
            worksheet.getRow(row).height = 15;
            return cell;
        };

        const generatedAt = new Date().toLocaleString("es-PE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

        mergeAndStyle(1, 1, 12, "ALTOQUE PERU WK", { bold: true, size: 8, color: colors.white, bg: colors.navySoft });
        mergeAndStyle(2, 1, 12, "Reporte de Cierre de Caja", { bold: true, size: 8, color: colors.white, bg: colors.navySoft });
        mergeAndStyle(3, 1, 12, `Fecha: ${generatedAt}`, { bold: true, size: 8, color: colors.white, bg: colors.navySoft });
        mergeAndStyle(4, 1, 12, `Empresa: ${String(data.empresa ?? "Empresa").toUpperCase()}`, { bold: true, size: 8, color: colors.white, bg: colors.navySoft });
        mergeAndStyle(5, 1, 12, `Cuenta: ${String(data.banco ?? routeLabel).toUpperCase()}`, { bold: true, size: 8, color: colors.white, bg: colors.navySoft });

        let nextRow = 7;
        const kpiRows = [
            ["Caja Inicial", kpi.caja_inicial],
            ["Caja Actual", kpi.caja_actual],
            ["Saldo Banco", saldoBanco],
            ["Caja Recaudacion", kpi.caja_recaudacion ?? kpi.total_recaudado],
            ["Ingresos", kpi.ingresos],
            ["Salidas", kpi.salidas],
            ["Gastos Operacionales", kpi.gastos_operacionales],
            ["Ganancias", kpi.ganancias],
            ["Pendiente Transferencia", kpi.pendiente_transferencia ?? kpi.pendiente_depositar],
        ];
        kpiRows.forEach(([label, value], index) => {
            const rowIndex = nextRow + Math.floor(index / 4) * 2;
            const colIndex = (index % 4) * 3 + 1;
            mergeAndStyle(rowIndex, colIndex, colIndex + 2, String(label), { bold: true, size: 8, color: colors.white, bg: colors.navySoft });
            mergeAndStyle(rowIndex + 1, colIndex, colIndex + 2, money(value), {
                bold: true,
                size: 8,
                bg: colors.white,
                color: ["Salidas", "Gastos Operacionales"].includes(String(label)) ? colors.coral : colors.green,
                numFmt: '"S/ "#,##0.00',
            });
        });
        nextRow += 7;

        const addSection = (
            sectionTitle: string,
            headers: string[],
            rows: Array<Array<string | number>>,
            totalIndexes: number[],
        ) => {
            if (!rows.length) return;
            const sectionRow = worksheet.getRow(nextRow);
            sectionRow.height = 15;
            const sectionTitleCell = sectionRow.getCell(1);
            sectionTitleCell.value = sectionTitle;
            styleCell(sectionTitleCell, { bold: true, size: 8, color: colors.white, bg: colors.navySoft });
            const sectionCountCell = sectionRow.getCell(2);
            sectionCountCell.value = `Total: ${rows.length}`;
            styleCell(sectionCountCell, { bold: true, size: 8, color: colors.white, bg: colors.navySoft });
            nextRow += 1;

            const headerRow = worksheet.getRow(nextRow);
            headerRow.height = 15;
            headers.forEach((header, index) => {
                const cell = headerRow.getCell(index + 1);
                cell.value = header;
                styleCell(cell, { bold: true, size: 8, color: colors.white, bg: colors.navySoft });
            });
            nextRow += 1;

            rows.forEach((values, rowIndex) => {
                const row = worksheet.getRow(nextRow);
                row.height = 15;
                values.forEach((value, index) => {
                    const cell = row.getCell(index + 1);
                    cell.value = value;
                    if (typeof value === "number") cell.numFmt = '"S/ "#,##0.00';
                    styleCell(cell, { bg: rowIndex % 2 === 1 ? colors.row : colors.white });
                });
                nextRow += 1;
            });

            const totalRow = worksheet.getRow(nextRow);
            totalRow.height = 15;
            totalRow.getCell(1).value = "Totales";
            styleCell(totalRow.getCell(1), { bold: true, bg: colors.row });
            totalIndexes.forEach((index) => {
                const total = rows.reduce((acc, row) => acc + (typeof row[index] === "number" ? Number(row[index]) : 0), 0);
                const cell = totalRow.getCell(index + 1);
                cell.value = total;
                cell.numFmt = '"S/ "#,##0.00';
                styleCell(cell, { bold: true, bg: colors.row });
            });
            for (let i = 2; i <= headers.length; i += 1) {
                if (!totalIndexes.includes(i - 1)) styleCell(totalRow.getCell(i), { bg: colors.row });
            }
            nextRow += 2;
        };

        addSection(
            "Efectivizacion",
            ["Facturacion", "Cod. Op.", "DNI", "Comunidad", "Deposito", "% Comision", "S/ Comision", "Gastos", "Ganancia", "Transferencia", "Estado", "Fecha"],
            efectivizacion.map((row) => [
                text(row.facturacion ?? row.tipo_facturacion),
                `${text(row.operacion ?? row.codigo_operacion_deposito_cliente)}${row.derivada_congelada ? "\nDerivada" : ""}`,
                text(row.dni ?? row.dni_cliente),
                text(row.comunidad ?? row.nombre_comunidad),
                money(row.deposito ?? row.monto),
                percent(row.porcentaje_comision ?? row.comision_servicio),
                money(row.soles_comision ?? row.comision),
                money(row.gastos),
                money(row.ganancia),
                money(row.transferencia),
                text(row.estado ?? row.nombre_estado),
                date(row.fecha ?? row.fecha_deposito_cliente ?? row.fecha_registro),
            ]),
            [4, 6, 7, 8, 9],
        );

        addSection(
            "Efectivizacion - Pendientes",
            ["Facturacion", "Cod. Op.", "DNI", "Comunidad", "Deposito", "% Comision", "S/ Comision", "Gastos", "Ganancia", "Transferencia", "Estado", "Fecha"],
            efectivizacionPendientes.map((row) => [
                text(row.facturacion ?? row.tipo_facturacion),
                `${text(row.operacion ?? row.codigo_operacion_deposito_cliente)}${row.derivada_congelada ? "\nDerivada" : ""}`,
                text(row.dni ?? row.dni_cliente),
                text(row.comunidad ?? row.nombre_comunidad),
                money(row.deposito ?? row.monto),
                percent(row.porcentaje_comision ?? row.comision_servicio),
                money(row.soles_comision ?? row.comision),
                money(row.gastos),
                money(row.ganancia),
                money(row.transferencia),
                text(row.estado ?? row.nombre_estado),
                date(row.fecha ?? row.fecha_deposito_cliente ?? row.fecha_registro),
            ]),
            [4, 6, 7, 8, 9],
        );

        addSection(
            "Derivados",
            ["Facturacion", "Derivo", "Cod. Op.", "DNI", "Comunidad", "Cuenta Cliente", "Monto", "% Comision", "S/ Comision", "Transferencia", "Estado", "Fecha"],
            derivados.map((row) => [
                text(row.facturacion ?? row.tipo_facturacion),
                row.derivo ? getRutaLabel(String(row.derivo) as never) : "-",
                text(row.operacion ?? row.codigo_operacion_deposito_cliente),
                text(row.dni ?? row.dni_cliente),
                text(row.comunidad),
                text(row.cuenta_cliente),
                money(row.monto),
                percent(row.porcentaje_comision),
                money(row.soles_comision),
                money(row.transferencia),
                text(row.estado ?? row.nombre_estado),
                date(row.fecha ?? row.fecha_deposito_cliente ?? row.fecha_registro),
            ]),
            [9],
        );

        addSection(
            "Derivados - Pendientes",
            ["Facturacion", "Derivo", "Cod. Op.", "DNI", "Comunidad", "Cuenta Cliente", "Monto", "% Comision", "S/ Comision", "Transferencia", "Estado", "Fecha"],
            derivadosPendientes.map((row) => [
                text(row.facturacion ?? row.tipo_facturacion),
                row.derivo ? getRutaLabel(String(row.derivo) as never) : "-",
                text(row.operacion ?? row.codigo_operacion_deposito_cliente),
                text(row.dni ?? row.dni_cliente),
                text(row.comunidad),
                text(row.cuenta_cliente),
                money(row.monto),
                percent(row.porcentaje_comision),
                money(row.soles_comision),
                money(row.transferencia),
                text(row.estado ?? row.nombre_estado),
                date(row.fecha ?? row.fecha_deposito_cliente ?? row.fecha_registro),
            ]),
            [9],
        );

        addSection(
            "Pago de Deuda",
            ["Operacion", "DNI", "Empresa", "Cuenta", "Transferencia", "Empresa", "Cuenta", "Deposito", "% Comision", "S/ Comision", "Estado", "Fecha"],
            pagoDeuda.map((row) => [
                text(row.operacion ?? row.codigo_operacion_deposito_cliente),
                text(row.dni ?? row.dni_cliente),
                text(row.empresa_salida ?? row.nombre_empresa_salida),
                text(row.cuenta_salida ?? row.cuenta),
                money(row.transferencia ?? row.monto_transferencia),
                text(row.empresa_ingreso ?? row.nombre_empresa_ingreso),
                text(row.cuenta_ingreso),
                money(row.deposito ?? row.monto_devolucion),
                percent(row.porcentaje_comision ?? row.comision_servicio),
                money(row.soles_comision),
                text(row.estado ?? row.nombre_estado),
                date(row.fecha ?? row.fecha_registro),
            ]),
            [4, 7],
        );

        addSection(
            "Pago de Deuda - Pendientes",
            ["Operacion", "DNI", "Empresa", "Cuenta", "Transferencia", "Empresa", "Cuenta", "Deposito", "% Comision", "S/ Comision", "Estado", "Fecha"],
            pagoDeudaPendientes.map((row) => [
                text(row.operacion ?? row.codigo_operacion_deposito_cliente),
                text(row.dni ?? row.dni_cliente),
                text(row.empresa_salida ?? row.nombre_empresa_salida),
                text(row.cuenta_salida ?? row.cuenta),
                money(row.transferencia ?? row.monto_transferencia),
                text(row.empresa_ingreso ?? row.nombre_empresa_ingreso),
                text(row.cuenta_ingreso),
                money(row.deposito ?? row.monto_devolucion),
                percent(row.porcentaje_comision ?? row.comision_servicio),
                money(row.soles_comision),
                text(row.estado ?? row.nombre_estado),
                date(row.fecha ?? row.fecha_registro),
            ]),
            [4, 7],
        );

        addSection(
            "POS",
            ["Cod. Op.", "DNI", "Deposito", "% Comision", "S/ Comision", "Empresa", "Cuenta", "Transferencia", "Estado", "Fecha"],
            pos.map((row) => [
                text(row.operacion ?? row.codigo_operacion_deposito_cliente),
                text(row.dni ?? row.dni_cliente),
                money(row.deposito),
                percent(row.porcentaje_comision),
                money(row.soles_comision),
                text(row.empresa),
                text(row.cuenta),
                money(row.transferencia),
                text(row.estado ?? row.nombre_estado),
                date(row.fecha ?? row.fecha_registro),
            ]),
            [7],
        );

        addSection(
            "POS - Pendientes",
            ["Cod. Op.", "DNI", "Deposito", "% Comision", "S/ Comision", "Empresa", "Cuenta", "Transferencia", "Estado", "Fecha"],
            posPendientes.map((row) => [
                text(row.operacion ?? row.codigo_operacion_deposito_cliente),
                text(row.dni ?? row.dni_cliente),
                money(row.deposito),
                percent(row.porcentaje_comision),
                money(row.soles_comision),
                text(row.empresa),
                text(row.cuenta),
                money(row.transferencia),
                text(row.estado ?? row.nombre_estado),
                date(row.fecha ?? row.fecha_registro),
            ]),
            [7],
        );

        const movementOrigin = (value: unknown) => {
            const key = String(value ?? "").trim().toUpperCase().replaceAll("_", " ");
            return ({
                "PAGO DEUDA COMISION": "Pago Deuda Comision",
                "OTROS": "Otros",
                "TRANSFERENCIA INTERNA": "Movimiento Saldo",
            } as Record<string, string>)[key] ?? text(value);
        };
        const movementType = (value: unknown) => {
            const normalized = String(value ?? "").trim().toLowerCase();
            return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "-";
        };
        const movementRelatedCompany = (row: Record<string, unknown>) => {
            const origin = String(row.tipo_origen ?? "").trim().toUpperCase().replaceAll("_", " ");
            return origin === "TRANSFERENCIA INTERNA" ? text(row.nombre_empresa_relacionada) : text(row.nombre_empresa);
        };
        const movementRelatedBank = (row: Record<string, unknown>) => {
            const origin = String(row.tipo_origen ?? "").trim().toUpperCase().replaceAll("_", " ");
            return origin === "TRANSFERENCIA INTERNA" ? text(row.nombre_banco_relacionada) : text(row.nombre_banco);
        };

        addSection(
            "Movimientos",
            ["Origen", "Movimiento", "DNI", "Empresa", "Cuenta", "Ingreso", "Salida", "Facturacion", "Fecha"],
            movimientos.map((row) => [
                movementOrigin(row.tipo_origen),
                movementType(row.tipo_movimiento),
                text(row.dni_cliente),
                movementRelatedCompany(row),
                movementRelatedBank(row),
                money(row.monto_ingreso),
                money(row.monto_salida),
                text(row.tipo_facturacion),
                date(row.fecha_registro),
            ]),
            [5, 6],
        );

        if (!totalRows) {
            worksheet.mergeCells(nextRow, 1, nextRow, 12);
            const empty = worksheet.getCell(nextRow, 1);
            empty.value = "Sin operaciones para este periodo.";
            styleCell(empty, { bg: colors.white, color: colors.muted, align: "center" });
            nextRow += 1;
        }

        worksheet.mergeCells(nextRow, 1, nextRow, 12);
        const footer = worksheet.getCell(nextRow, 1);
        footer.value = `${data.empresa ?? "Empresa"} - Altoque Peru WK - Reporte de Cierre de Caja`;
        styleCell(footer, { size: 8, color: colors.muted, bg: colors.paper });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = reportFileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const getReportFileName = (reportDataOverride?: Record<string, unknown> | null) => {
        const data = (reportDataOverride ?? reporteData ?? {}) as Record<string, unknown>;
        const normalizePart = (value: unknown, fallback: string) => String(value || fallback)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "") || fallback;
        const rawDate = typeof data.fecha_cierre === "string" && data.fecha_cierre
            ? data.fecha_cierre
            : selectedHistoryDate;
        const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
            ? new Date(Number(rawDate.slice(0, 4)), Number(rawDate.slice(5, 7)) - 1, Number(rawDate.slice(8, 10)))
            : rawDate ? new Date(rawDate) : new Date();
        const datePart = [
            String(date.getDate()).padStart(2, "0"),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getFullYear()),
        ].join("");

        return `${normalizePart(data.empresa, activeCompany?.nombre_empresa ?? "empresa")}_${normalizePart(data.banco, routeLabel)}_${datePart}.pdf`;
    };

    const handleDownloadPdf = async (reportDataOverride?: Record<string, unknown> | null) => {
        const data = reportDataOverride ?? reporteData;
        if (!data) return;
        const reportFileName = getReportFileName(data);

        let host: HTMLDivElement | null = null;
        let root: ReturnType<typeof createRoot> | null = null;
        try {
            const html2pdf = (await import("html2pdf.js")).default;
            if (!document.getElementById("reporte-cierre-pdf-font")) {
                const style = document.createElement("style");
                style.id = "reporte-cierre-pdf-font";
                style.textContent = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');";
                document.head.appendChild(style);
            }

            host = document.createElement("div");
            host.style.position = "absolute";
            host.style.left = "0";
            host.style.top = "0";
            host.style.width = "794px";
            host.style.margin = "0";
            host.style.background = "#FFFFFF";
            host.style.pointerEvents = "none";
            host.style.zIndex = "-1";
            document.body.appendChild(host);

            root = createRoot(host);
            root.render(<BancariaReporteCierrePdfOficial data={data as never} />);

            await new Promise((resolve) => window.setTimeout(resolve, 350));
            if (document.fonts?.ready) await document.fonts.ready;

            const reportElement = host.querySelector(".report-container") ?? host;
            const pdfOptions = {
                margin: [0, 0, 0, 0] as [number, number, number, number],
                filename: reportFileName,
                image: { type: "jpeg" as const, quality: 0.98 },
                html2canvas: {
                    scale: 3,
                    useCORS: true,
                    backgroundColor: "#FFFFFF",
                    scrollY: 0,
                    windowWidth: 794,
                    windowHeight: Math.max(reportElement.scrollHeight, 1123),
                },
                jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
                pagebreak: { mode: ["css", "legacy"], avoid: [".cover", ".kpi-card", ".section-header"] },
            };

            await html2pdf()
                .set(pdfOptions)
                .from(reportElement as HTMLElement)
                .save();
        } catch {
            addToast("error", "No se pudo generar el PDF.");
        } finally {
            root?.unmount();
            host?.remove();
        }
    };

    const companyName = activeCompanyCaja?.nombre_empresa ?? activeCompany?.nombre_empresa ?? "Empresa";
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const selectedHistoryDateLabel = selectedHistoryDate ? selectedHistoryDate.split("-").reverse().join("/") : "";

    const handleOpenEditCaja = async () => {
        if (!activeCompanyCaja?.id_empresa || !activeCompanyCaja.id_empresa_cuenta_bancaria) {
            addToast("error", "Selecciona una empresa y cuenta antes de editar la caja.");
            return;
        }

        try {
            const cajas = await operacionesRpcService.getCajaOperativa({
                p_id_empresa: activeCompanyCaja.id_empresa,
                p_id_empresa_cuenta_bancaria: activeCompanyCaja.id_empresa_cuenta_bancaria,
                p_id_estado: 1,
            });
            const caja = cajas?.[0] ?? null;
            if (!caja) {
                addToast("error", "No se encontro una caja operativa activa para esta empresa y cuenta.");
                return;
            }
            setCajaEdit(caja);
            setEditSaldoInicial(String(caja.saldo_inicial ?? 0));
            setIsEditCajaOpen(true);
        } catch {
            addToast("error", "Error al cargar la caja operativa.");
        }
    };

    const handleSaveCaja = async () => {
        if (!cajaEdit) return;
        const inicial = Number(editSaldoInicial);
        if (!Number.isFinite(inicial) || inicial < 0) {
            addToast("error", "El saldo inicial debe ser mayor o igual a cero.");
            return;
        }

        setIsSavingCaja(true);
        try {
            if (Number(cajaEdit.saldo_inicial ?? 0) !== inicial) {
                await cajaOperativaService.patchSaldoInicial({
                    p_id_caja: cajaEdit.id,
                    p_saldo_inicial: inicial,
                    p_id_usuario: userId,
                });
            }
            await operacionesRpcService.syncRutaKpiCaja(ruta, userId);
            setRefreshKey((value) => value + 1);
            setMetricsRefreshKey((value) => value + 1);
            setIsEditCajaOpen(false);
            addToast("success", "Caja actualizada correctamente.");
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "Error al actualizar la caja.");
        } finally {
            setIsSavingCaja(false);
        }
    };

    const handleCloseRoute = () => {
        if (!routeCajaIds.length) {
            addToast("error", "La ruta no tiene cajas operativas configuradas.");
            return;
        }

        setIsCloseConfirmOpen(true);
    };

    const handleConfirmCloseRoute = async () => {
        setIsCloseConfirmOpen(false);
        setIsClosing(true);

        try {
            const result = await operacionesRpcService.postCajaCierreRuta({
                p_rutas: workspaceRoutes,
                p_id_usuario: userId,
            });
            if (result?.error) throw new Error(String(result.error));

            await Promise.all(
                workspaceRoutes.map((workspaceRoute) =>
                    operacionesRpcService.syncRutaKpiCaja(workspaceRoute, userId),
                ),
            );
            setRefreshKey((value) => value + 1);
            addToast("success", `Cierre registrado para ${result?.cajas_cerradas ?? routeCajaIds.length} cajas.`);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al registrar el cierre.";
            addToast("error", message);
        } finally {
            setIsClosing(false);
        }
    };

    const handleReopenClose = () => {
        if (!activeCompanyCaja?.id_caja) {
            addToast("error", "La cuenta activa no tiene caja operativa configurada.");
            return;
        }

        setIsReopenConfirmOpen(true);
    };

    const handleConfirmReopenClose = async () => {
        setIsReopenConfirmOpen(false);
        setIsReopeningClose(true);

        try {
            await operacionesRpcService.deleteUltimoCierreCajaDia({
                p_id_caja: activeCompanyCaja?.id_caja,
                p_id_usuario: userId,
            });

            await operacionesRpcService.syncRutaKpiCaja(ruta, userId);
            setSelectedHistoryDate(null);
            setRefreshKey((value) => value + 1);
            setMetricsRefreshKey((value) => value + 1);
            addToast("success", "Ultimo cierre reabierto correctamente.");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al reabrir el cierre.";
            addToast("error", message);
        } finally {
            setIsReopeningClose(false);
        }
    };

    const handleDownloadExcelOption = async () => {
        const data = await loadReporteData();
        if (data) await handleDownloadExcel(data);
    };

    const handleDownloadPdfOption = async () => {
        const data = await loadReporteData();
        if (data) await handleDownloadPdf(data);
    };

    return (
        <AppLayout>
            <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <BancariaTopActions
                        activeCajaIds={activeCajaIds}
                        activeCompany={activeCompanyCaja ?? activeCompany}
                        canReopenTodayClose={Boolean(activeCompanyCaja?.id_caja && selectedHistoryDate && selectedHistoryDate === todayCloseDateKey)}
                        isClosing={isClosing}
                        isReopening={isReopeningClose}
                        selectedClosureId={selectedHistoryClosureId}
                        selectedHistoryDate={selectedHistoryDate}
                        onCloseRoute={handleCloseRoute}
                        onHistoryClosureChange={handleHistoryClosureChange}
                        onHistoryDateChange={setSelectedHistoryDate}
                        onHistoryDateAvailabilityChange={setIsHistoryDateAvailable}
                        onReopenTodayClose={handleReopenClose}
                        onDownloadExcel={() => void handleDownloadExcelOption()}
                        onDownloadPdf={() => void handleDownloadPdfOption()}
                        isDownloading={isLoadingReporte}
                    />
                    <OperacionConfigDropdown
                        onOpenCajas={() => setIsCajasOpen(true)}
                        onOpenEmpresaPrincipal={() => setIsEmpresaPrincipalOpen(true)}
                        onOpenEmpresas={() => setIsEmpresasOpen(true)}
                        onOpenReglasAbono={() => setIsReglasAbonoOpen(true)}
                        onOpenReglas={() => setIsReglasOpen(true)}
                        showCajas
                        showEmpresaPrincipal
                        showEmpresas
                        showReglasAbono
                    />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <EmpresaTabs companies={orderedCompanies} activeCompanyId={activeCompanyId} onChange={setActiveCompanyId} />
                        <CuentaTabs accounts={visibleAccountTabs} activeAccountId={activeAccountId} onChange={setActiveAccountId} />
                    </div>
                    {isLoadingCompanies && <span className="text-sm text-tertiary">Cargando empresas...</span>}
                </div>

                {(companiesError || kpiError) && (
                    <div className="rounded-lg border border-error_subtle bg-error-primary px-4 py-3 text-sm text-error-primary">
                        {companiesError || kpiError}
                    </div>
                )}

                {selectedHistoryDate && !isHistoryDateAvailable && (
                    <div className="rounded-lg border border-warning_subtle bg-warning-primary px-4 py-3 text-sm text-warning-primary">
                        {activeCompany?.nombre_empresa ?? "La empresa"} no tiene cierre de caja para el {selectedHistoryDateLabel}.
                    </div>
                )}

                <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-6">
                    <div className="xl:col-span-4">
                        <BancariaKpiGrid
                            activeAccountId={activeCompanyCaja?.id_empresa_cuenta_bancaria}
                            activeBankId={activeCompanyCaja?.id_banco}
                            activeCompanyId={activeCompanyCaja?.id_empresa}
                            hasRetentionRule={activeCompanyCaja?.flag_retencion_cuenta === true}
                            gananciasBadge={gananciasBadge}
                            isLoading={isLoadingKpis}
                            kpi={kpi}
                        />
                    </div>

                    <BancariaInlineForms
                        activeCajaId={activeCajaId}
                        activeCompany={activeCompanyCaja ?? activeCompany}
                        activeCompanyCajas={activeCompanyCaja ? [activeCompanyCaja] : activeCompanyCajas}
                        historyDate={selectedHistoryDate}
                        refreshKey={refreshKey + metricsRefreshKey}
                        routeCajas={cajas}
                        showMiniMovimientos={isActiveDigitalWallet}
                        onSaved={() => setRefreshKey((value) => value + 1)}
                        ruta={activeOperationRoute}
                    />

                    {!isActiveDigitalWallet && (
                        <BancariaExcelUpload
                            className="xl:col-span-4"
                            activeCompany={activeCompanyCaja ?? activeCompany}
                            companyName={companyName}
                            onProcessed={() => setRefreshKey((value) => value + 1)}
                            ruta={activeOperationRoute}
                        />
                    )}
                </div>

                {!isActiveDigitalWallet && (
                    <BancariaOperationalTabs
                        activeAccountId={activeAccountId}
                        activeCajaId={activeCajaId}
                        activeCompanyId={activeCompanyId}
                        activeCompanyCaja={activeCompanyCaja}
                        companies={orderedCompanies}
                        hasRetentionRule={activeCompanyCaja?.flag_retencion_cuenta === true}
                        downloadKey={downloadKey}
                        historyDate={selectedHistoryDate}
                        onChanged={() => setRefreshKey((value) => value + 1)}
                        onMetricsChanged={() => setMetricsRefreshKey((value) => value + 1)}
                        onCompanyChange={setActiveCompanyId}
                        refreshKey={refreshKey}
                        ruta={activeOperationRoute}
                        queryRoutes={workspaceRoutes}
                    />
                )}

                {isReglasOpen && (
                    <OperacionReglasEfectivizacionModal
                        activeCompany={activeCompanyCaja ?? activeCompany}
                        isOpen={isReglasOpen}
                        onClose={() => setIsReglasOpen(false)}
                        onSaved={() => setRefreshKey((value) => value + 1)}
                        ruta={activeOperationRoute}
                    />
                )}

                {isReglasAbonoOpen && (
                    <OperacionReglasAbonoModal
                        activeCompanyCaja={activeCompanyCaja ?? activeCompany}
                        isOpen={isReglasAbonoOpen}
                        onClose={() => setIsReglasAbonoOpen(false)}
                        onSaved={() => setRefreshKey((value) => value + 1)}
                        ruta={activeOperationRoute}
                    />
                )}

                {isEmpresasOpen && (
                    <OperacionEmpresasModal
                        isOpen={isEmpresasOpen}
                        onClose={() => setIsEmpresasOpen(false)}
                        onSaved={() => setRefreshKey((value) => value + 1)}
                        ruta={activeOperationRoute}
                    />
                )}

                {isCajasOpen && (
                    <OperacionCajasRutaModal
                        activeCompanyId={activeCompanyId}
                        activeCajaId={activeCajaId}
                        isOpen={isCajasOpen}
                        onClose={() => setIsCajasOpen(false)}
                        onSaved={() => setRefreshKey((value) => value + 1)}
                        ruta={activeOperationRoute}
                    />
                )}

                {isEmpresaPrincipalOpen && (
                    <OperacionEmpresaPrincipalModal
                        isOpen={isEmpresaPrincipalOpen}
                        onClose={() => setIsEmpresaPrincipalOpen(false)}
                        onSaved={() => {
                            setRefreshKey((value) => value + 1);
                            setMetricsRefreshKey((value) => value + 1);
                        }}
                        ruta={activeOperationRoute}
                    />
                )}

                <ModalOverlay isOpen={isEditCajaOpen} onOpenChange={(open) => !open && setIsEditCajaOpen(false)}>
                    <Modal className="max-w-sm">
                        <Dialog>
                            <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                                <div>
                                    <h2 className="text-lg font-semibold text-primary">Editar Caja Operativa</h2>
                                    <p className="mt-1 text-sm text-tertiary">
                                        {cajaEdit ? `${cajaEdit.nombre_empresa} — ${cajaEdit.nombre_banco}` : ""}
                                    </p>
                                </div>
                                <div className="mt-5 grid gap-4">
                                    <Input
                                        size="sm"
                                        label="Saldo Inicial"
                                        type="number"
                                        value={editSaldoInicial}
                                        onChange={setEditSaldoInicial}
                                    />
                                    <Input
                                        size="sm"
                                        label="Saldo Actual"
                                        type="number"
                                        value={String(cajaEdit?.saldo_actual ?? 0)}
                                        isDisabled
                                    />
                                </div>
                                <div className="mt-6 flex justify-end gap-2">
                                    <Button color="secondary" onClick={() => setIsEditCajaOpen(false)}>Cancelar</Button>
                                    <Button isLoading={isSavingCaja} onClick={() => void handleSaveCaja()}>Guardar</Button>
                                </div>
                            </div>
                        </Dialog>
                    </Modal>
                </ModalOverlay>

                <ModalOverlay isOpen={false} onOpenChange={(open) => !open && setIsDownloadOpen(false)}>
                    <Modal className="max-w-xs">
                        <Dialog>
                            <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                                <div>
                                    <h2 className="text-lg font-semibold text-primary">Descargar Reporte</h2>
                                    <p className="mt-1 text-sm text-tertiary">
                                        {activeCompanyCaja?.nombre_empresa ?? activeCompany?.nombre_empresa ?? "Empresa"} — {activeCompanyCaja?.nombre_banco ?? routeLabel}
                                    </p>
                                    <p className="text-xs text-tertiary">
                                        {selectedHistoryDate ? `Cierre: ${selectedHistoryDateLabel}` : "Actual (sin cierre)"}
                                    </p>
                                </div>
                                {isLoadingReporte ? (
                                    <p className="mt-5 text-sm text-tertiary">Cargando datos...</p>
                                ) : (
                                    <div className="mt-5 grid grid-cols-2 gap-3">
                                        <Button size="sm" color="secondary" iconLeading={File06} isDisabled={!reporteData} onClick={() => void handleDownloadExcel()}>
                                            Excel
                                        </Button>
                                        <Button size="sm" color="secondary" iconLeading={File07} isDisabled={!reporteData} onClick={() => void handleDownloadPdf()}>
                                            PDF
                                        </Button>
                                    </div>
                                )}
                                <div className="mt-4 flex justify-end">
                                    <Button size="sm" color="tertiary" onClick={() => setIsDownloadOpen(false)}>Cancelar</Button>
                                </div>
                            </div>
                        </Dialog>
                    </Modal>
                </ModalOverlay>

                <OperacionConfirmModal
                    confirmLabel="Cerrar caja"
                    description={`Se cerraran ${routeCajaIds.length} cajas operativas de la ruta ${routeLabel}. Esta accion congelara movimientos y resultados del periodo para todas las empresas.`}
                    intent="destructive"
                    isLoading={isClosing}
                    isOpen={isCloseConfirmOpen}
                    onClose={() => setIsCloseConfirmOpen(false)}
                    onConfirm={() => void handleConfirmCloseRoute()}
                    title="Confirmar cierre de caja"
                />

                <OperacionConfirmModal
                    confirmLabel="Reabrir"
                    description="Se reabrira el ultimo cierre de hoy y la caja volvera al estado anterior al cierre."
                    intent="destructive"
                    isLoading={isReopeningClose}
                    isOpen={isReopenConfirmOpen}
                    onClose={() => setIsReopenConfirmOpen(false)}
                    onConfirm={() => void handleConfirmReopenClose()}
                    title="Reabrir ultimo cierre"
                />

            </div>
        </AppLayout>
    );
};
