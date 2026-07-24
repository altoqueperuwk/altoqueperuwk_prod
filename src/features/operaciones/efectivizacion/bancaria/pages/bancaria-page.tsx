import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import * as XLSX from "xlsx";
import { AppLayout } from "@/components/application/app-layout";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { File06, File07, Settings01 } from "@untitledui/icons";
import { cajaOperativaService } from "@/services/caja-operativa.service";
import { CuentaTabs } from "@/features/operaciones/efectivizacion/shared/components/cuenta-tabs";
import { EmpresaTabs } from "@/features/operaciones/efectivizacion/shared/components/empresa-tabs";
import { OperacionConfirmModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-confirm-modal";
import { RouteConfigDrawer } from "@/features/operaciones/efectivizacion/shared/components/route-config-drawer";
import { useActiveCompany } from "@/features/operaciones/efectivizacion/shared/hooks/use-active-company";
import { useRouteCompanies } from "@/features/operaciones/efectivizacion/shared/hooks/use-route-companies";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { CajaOperativa, OperacionRutaBancaria } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { isDigitalWalletBank } from "@/features/operaciones/efectivizacion/shared/utils/digital-wallet";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { BancariaExcelUpload } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-excel-upload";
import { BancariaInlineForms } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-inline-forms";
import { BancariaKpiGrid } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-kpi-grid";
import { BancariaOperationalTabs } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-operational-tabs";
import { BancariaReporteCierrePdf } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-reporte-cierre-pdf";
import { BancariaTopActions } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-top-actions";
import { useBancariaKpis } from "@/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-kpis";

interface BancariaPageProps {
    ruta: OperacionRutaBancaria;
}

export const BancariaPage = ({ ruta }: BancariaPageProps) => {
    const [refreshKey, setRefreshKey] = useState(0);
    const [metricsRefreshKey, setMetricsRefreshKey] = useState(0);
    const [downloadKey, setDownloadKey] = useState(0);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
    const [isHistoryDateAvailable, setIsHistoryDateAvailable] = useState(true);
    const [isEditCajaOpen, setIsEditCajaOpen] = useState(false);
    const [cajaEdit, setCajaEdit] = useState<CajaOperativa | null>(null);
    const [editSaldoInicial, setEditSaldoInicial] = useState("");
    const [editSaldoActual, setEditSaldoActual] = useState("");
    const [isSavingCaja, setIsSavingCaja] = useState(false);
    const [isDownloadOpen, setIsDownloadOpen] = useState(false);
    const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
    const [reporteData, setReporteData] = useState<Record<string, unknown> | null>(null);
    const [isLoadingReporte, setIsLoadingReporte] = useState(false);
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const routeLabel = getRutaLabel(ruta);
    const { data: cajas, error: companiesError, isLoading: isLoadingCompanies } = useRouteCompanies(ruta);
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
    const { data: kpi, error: kpiError, isLoading: isLoadingKpis } = useBancariaKpis(
        ruta,
        activeCompanyId,
        activeAccountId,
        activeCajaId,
        selectedHistoryDate,
        refreshKey + metricsRefreshKey,
    );
    const activeCajaIds = useMemo(
        () => activeCajaId ? [activeCajaId] : [],
        [activeCajaId],
    );
    const isActiveDigitalWallet = isDigitalWalletBank(activeCompanyCaja);

    const handleOpenDownload = async () => {
        const cajaId = activeCajaIds[0];
        if (!cajaId) {
            addToast("error", "La empresa activa no tiene caja operativa configurada.");
            return;
        }

        setIsDownloadOpen(true);
        setIsLoadingReporte(true);
        try {
            const data = await operacionesRpcService.getReporteCierre({
                p_id_caja: cajaId,
                p_id_empresa: activeCompanyId,
                p_ruta: ruta,
                p_fecha_cierre: selectedHistoryDate || undefined,
            });
            setReporteData(data);
        } catch {
            addToast("error", "Error al cargar los datos del reporte.");
            setIsDownloadOpen(false);
        } finally {
            setIsLoadingReporte(false);
        }
    };

    const handleDownloadExcel = () => {
        if (!reporteData) return;
        const data = reporteData as Record<string, unknown>;
        const wb = XLSX.utils.book_new();

        const addSheet = (name: string, rows: Record<string, unknown>[]) => {
            if (!rows.length) return;
            const ws = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
        };

        addSheet("Efectivizaciones", (data.efectivizacion as Record<string, unknown>[]) ?? []);
        addSheet("Pago Deuda", (data.pago_deuda as Record<string, unknown>[]) ?? []);
        addSheet("Movimientos", (data.movimientos as Record<string, unknown>[]) ?? []);
        addSheet("Retenciones", (data.retenciones as Record<string, unknown>[]) ?? []);

        XLSX.writeFile(wb, `Reporte_${activeCompanyCaja?.nombre_empresa ?? activeCompany?.nombre_empresa ?? "Caja"}_${activeCompanyCaja?.nombre_banco ?? routeLabel}.xlsx`);
        setIsDownloadOpen(false);
    };

    const getReportFileName = () => {
        const data = (reporteData ?? {}) as Record<string, unknown>;
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

    const handleDownloadPdf = () => {
        setIsDownloadOpen(false);
        const win = window.open("", "_blank");
        if (!win || !reporteData) return;
        const reportFileName = getReportFileName();

        win.document.write(`
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8">
                    <title>${reportFileName}</title>
                    <style>
                        @page { size: A4 portrait; margin: 10mm; }
                        html, body {
                            margin: 0;
                            padding: 0;
                            background: #ffffff;
                            font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                        }
                        * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
                    </style>
                </head>
                <body>
                    <div id="reporte-root"></div>
                </body>
            </html>
        `);
        win.document.close();

        const root = createRoot(win.document.getElementById("reporte-root")!);
        root.render(<BancariaReporteCierrePdf data={reporteData as never} />);

        win.focus();
        setTimeout(() => {
            win.print();
            root.unmount();
            win.close();
        }, 600);
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
            setEditSaldoActual(String(caja.saldo_actual ?? 0));
            setIsEditCajaOpen(true);
        } catch {
            addToast("error", "Error al cargar la caja operativa.");
        }
    };

    const handleSaveCaja = async () => {
        if (!cajaEdit) return;
        const inicial = Number(editSaldoInicial);
        const actual = Number(editSaldoActual);
        if (!Number.isFinite(inicial) || inicial < 0 || !Number.isFinite(actual) || actual < 0) {
            addToast("error", "Los saldos deben ser mayores o iguales a cero.");
            return;
        }

        setIsSavingCaja(true);
        try {
            await cajaOperativaService.update(cajaEdit.id, {
                p_saldo_inicial: inicial,
                p_saldo_actual: actual,
            });
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
        if (!activeCompanyCaja) {
            addToast("error", "Selecciona una empresa antes de cerrar.");
            return;
        }

        if (!activeCompanyCaja.id_caja) {
            addToast("error", "La cuenta activa no tiene caja operativa configurada.");
            return;
        }

        setIsCloseConfirmOpen(true);
    };

    const handleConfirmCloseRoute = async () => {
        setIsCloseConfirmOpen(false);
        setIsClosing(true);

        try {
            await operacionesRpcService.postCajaCierre({
                p_id_caja: activeCompanyCaja?.id_caja,
                p_id_usuario: userId,
                p_kpi_snapshot: kpi ?? null,
            });

            await operacionesRpcService.syncRutaKpiCaja(ruta, userId);
            setRefreshKey((value) => value + 1);
            addToast("success", "Cierre registrado correctamente.");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al registrar el cierre.";
            addToast("error", message);
        } finally {
            setIsClosing(false);
        }
    };

    return (
        <AppLayout>
            <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <BancariaTopActions
                        activeCajaIds={activeCajaIds}
                        activeCompany={activeCompanyCaja ?? activeCompany}
                        isClosing={isClosing}
                        selectedHistoryDate={selectedHistoryDate}
                        onEditCaja={handleOpenEditCaja}
                        onCloseRoute={handleCloseRoute}
                        onHistoryDateChange={setSelectedHistoryDate}
                        onHistoryDateAvailabilityChange={setIsHistoryDateAvailable}
                        onDownload={handleOpenDownload}
                    />
                    <Button size="sm" color="primary" iconLeading={Settings01} onClick={() => setIsConfigOpen(true)}>
                        Configuracion
                    </Button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <EmpresaTabs companies={companies} activeCompanyId={activeCompanyId} onChange={setActiveCompanyId} />
                        <CuentaTabs accounts={activeCompanyCajas} activeAccountId={activeAccountId} onChange={setActiveAccountId} />
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

                <BancariaKpiGrid isLoading={isLoadingKpis} kpi={kpi} />

                <BancariaInlineForms
                    activeCajaId={activeCajaId}
                    activeCompany={activeCompanyCaja ?? activeCompany}
                    activeCompanyCajas={activeCompanyCaja ? [activeCompanyCaja] : activeCompanyCajas}
                    historyDate={selectedHistoryDate}
                    refreshKey={refreshKey + metricsRefreshKey}
                    routeCajas={cajas}
                    showMiniMovimientos={isActiveDigitalWallet}
                    onSaved={() => setRefreshKey((value) => value + 1)}
                    ruta={ruta}
                />

                {!isActiveDigitalWallet && (
                    <BancariaExcelUpload
                        activeCompany={activeCompanyCaja ?? activeCompany}
                        activeCompanyId={activeCompanyId}
                        companies={companies}
                        companyName={companyName}
                        onCompanyChange={setActiveCompanyId}
                        onProcessed={() => setRefreshKey((value) => value + 1)}
                        ruta={ruta}
                    />
                )}

                {!isActiveDigitalWallet && (
                    <BancariaOperationalTabs
                        activeAccountId={activeAccountId}
                        activeCajaId={activeCajaId}
                        activeCompanyId={activeCompanyId}
                        activeCompanyCaja={activeCompanyCaja}
                        companies={companies}
                        downloadKey={downloadKey}
                        historyDate={selectedHistoryDate}
                        onChanged={() => setRefreshKey((value) => value + 1)}
                        onMetricsChanged={() => setMetricsRefreshKey((value) => value + 1)}
                        onCompanyChange={setActiveCompanyId}
                        refreshKey={refreshKey}
                        ruta={ruta}
                    />
                )}

                <RouteConfigDrawer
                    activeCompany={activeCompany}
                    cajas={cajas}
                    isOpen={isConfigOpen}
                    onClose={() => setIsConfigOpen(false)}
                    ruta={ruta}
                />

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
                                        value={editSaldoActual}
                                        onChange={setEditSaldoActual}
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

                <ModalOverlay isOpen={isDownloadOpen} onOpenChange={(open) => !open && setIsDownloadOpen(false)}>
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
                                        <Button size="sm" color="secondary" iconLeading={File06} isDisabled={!reporteData} onClick={handleDownloadExcel}>
                                            Excel
                                        </Button>
                                        <Button size="sm" color="secondary" iconLeading={File07} isDisabled={!reporteData} onClick={handleDownloadPdf}>
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
                    description={`Se cerrara la caja de ${activeCompanyCaja?.nombre_empresa ?? activeCompany?.nombre_empresa ?? "la empresa seleccionada"} - ${activeCompanyCaja?.nombre_banco ?? routeLabel}. Esta accion congelara movimientos y resultados del periodo.`}
                    intent="destructive"
                    isLoading={isClosing}
                    isOpen={isCloseConfirmOpen}
                    onClose={() => setIsCloseConfirmOpen(false)}
                    onConfirm={() => void handleConfirmCloseRoute()}
                    title="Confirmar cierre de caja"
                />

            </div>
        </AppLayout>
    );
};
