import { useEffect, useMemo, useState } from "react";
import { CalendarDate } from "@internationalized/date";
import { ChevronDown, Download01, File06, File07 } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Calendar } from "@/components/application/date-picker/calendar";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { useToast } from "@/providers/toast-provider";
import {
    buildCierreExcel,
    buildCierrePdf,
    downloadBlob,
    downloadReportsAsZip,
    getCierreReportFileName,
} from "./services/reporte-cierre-caja-download";
import {
    getPaidTableRows,
    reporteCierreCajaService,
    type ReporteCierreCajaData,
    type ReporteCierreCajaFlow,
    type ReporteCierreCajaRow,
} from "./services/reporte-cierre-caja.service";

const banks = [
    { id: "bcp", label: "BCP" },
    { id: "bbva", label: "BBVA" },
    { id: "scotiabank", label: "Scotiabank" },
    { id: "banbif", label: "BanBif" },
    { id: "interbank", label: "Interbank" },
    { id: "safetypay", label: "SafetyPay" },
];

const flows: Array<{ id: ReporteCierreCajaFlow; label: string }> = [
    { id: "efectivizacion", label: "Efectivización" },
    { id: "pago_deuda", label: "Pago Deuda" },
    { id: "derivados", label: "Derivados" },
];

const flowHeaders: Record<ReporteCierreCajaFlow, string[]> = {
    efectivizacion: ["Facturación", "Cod. Op.", "DNI", "Comunidad", "Depósito", "Comisión %", "Comisión S/", "Transferencia", "Estado", "Fecha"],
    derivados: ["Facturación", "Derivo", "Cod. Op.", "DNI", "Comunidad", "Cuenta Cliente", "Monto", "Comisión %", "Comisión S/", "Transferencia", "Estado", "Fecha"],
    pago_deuda: ["Operación", "DNI", "Empresa Transferencia", "Cuenta Transferencia", "Monto Transferencia", "Empresa Depósito", "Cuenta Depósito", "Monto Depósito", "Comisión %", "Comisión S/", "Estado", "Fecha"],
};

const toDateKey = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new CalendarDate(year, month, day);
};

const calendarDateKey = (date: { year: number; month: number; day: number }) => `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
const normalizeBank = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
const getRowRoute = (row: ReporteCierreCajaRow) => normalizeBank(row.ruta || row.nombre_banco);

const filterButtonClass = "min-w-0 justify-center";

export const ReporteCierreCajaPage = () => {
    const { addToast } = useToast();
    const [allRows, setAllRows] = useState<ReporteCierreCajaRow[]>([]);
    const [datedRows, setDatedRows] = useState<ReporteCierreCajaRow[]>([]);
    const [dates, setDates] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedBank, setSelectedBank] = useState("bcp");
    const [selectedEmpresa, setSelectedEmpresa] = useState<number | null>(null);
    const [selectedFlow, setSelectedFlow] = useState<ReporteCierreCajaFlow>("efectivizacion");
    const [reports, setReports] = useState<ReporteCierreCajaData[]>([]);
    const [downloadKind, setDownloadKind] = useState<"pdf" | "xlsx" | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isReportsLoading, setIsReportsLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        Promise.all([
            reporteCierreCajaService.getFechas(),
            reporteCierreCajaService.getBandeja(null),
        ])
            .then(([dateRows, accountRows]) => {
                if (cancelled) return;
                setDates(Array.from(new Set(dateRows.map((row) => String(row.fecha_cierre).slice(0, 10)))).sort().reverse());
                setAllRows(accountRows);
            })
            .catch((error) => {
                if (!cancelled) addToast("error", error instanceof Error ? error.message : "No se pudo cargar Cierre de Caja.");
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => { cancelled = true; };
    }, [addToast]);

    useEffect(() => {
        let cancelled = false;
        setReports([]);
        setDatedRows([]);
        if (!selectedDate) return () => { cancelled = true; };

        setIsLoading(true);
        reporteCierreCajaService.getBandeja(selectedDate)
            .then((nextRows) => {
                if (!cancelled) setDatedRows(nextRows);
            })
            .catch((error) => {
                if (!cancelled) addToast("error", error instanceof Error ? error.message : "No se pudo cargar el cierre seleccionado.");
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => { cancelled = true; };
    }, [addToast, selectedDate]);

    const companies = useMemo(() => Array.from(
        new Map(
            allRows
                .filter((row) => selectedBank === "all" || getRowRoute(row) === selectedBank)
                .map((row) => [row.id_empresa, { id: row.id_empresa, label: row.nombre_empresa }]),
        ).values(),
    ), [allRows, selectedBank]);

    useEffect(() => {
        if (!companies.length) {
            if (selectedEmpresa !== null) setSelectedEmpresa(null);
            return;
        }
        if (!companies.some((company) => company.id === selectedEmpresa)) {
            setSelectedEmpresa(companies[0].id);
        }
    }, [companies, selectedEmpresa]);

    const visibleRows = useMemo(() => datedRows.filter((row) =>
        (selectedBank === "all" || getRowRoute(row) === selectedBank) &&
        (selectedEmpresa === null || row.id_empresa === selectedEmpresa) &&
        row.tiene_cierre,
    ), [datedRows, selectedBank, selectedEmpresa]);

    useEffect(() => {
        let cancelled = false;
        if (!selectedDate || !visibleRows.length) {
            setReports([]);
            setIsReportsLoading(false);
            return () => { cancelled = true; };
        }

        setIsReportsLoading(true);
        Promise.all(visibleRows.map((row) => reporteCierreCajaService.getReporte(row)))
            .then((nextReports) => {
                if (!cancelled) setReports(nextReports);
            })
            .catch((error) => {
                if (!cancelled) {
                    setReports([]);
                    addToast("error", error instanceof Error ? error.message : "No se pudo cargar el detalle del cierre.");
                }
            })
            .finally(() => {
                if (!cancelled) setIsReportsLoading(false);
            });
        return () => { cancelled = true; };
    }, [addToast, selectedDate, visibleRows]);

    const tableRows = useMemo(
        () => reports.flatMap((report) => getPaidTableRows(report, selectedFlow)),
        [reports, selectedFlow],
    );

    const selectedCalendarDate = selectedDate ? toDateKey(selectedDate) : null;
    const availableDates = useMemo(() => new Set(dates), [dates]);
    const highlightedDates = useMemo(() => dates.map(toDateKey), [dates]);

    const handleBankChange = (bankId: string) => {
        setSelectedBank(bankId);
        setSelectedEmpresa(null);
    };

    const handleDateChange = (date: { year: number; month: number; day: number } | null) => {
        if (!date) return;
        setSelectedDate(calendarDateKey(date));
    };

    const download = async (kind: "pdf" | "xlsx") => {
        if (!selectedDate) {
            addToast("error", "Selecciona una fecha de cierre antes de descargar.");
            return;
        }
        if (!visibleRows.length) {
            addToast("error", "No existe un cierre disponible para los filtros seleccionados.");
            return;
        }

        setDownloadKind(kind);
        try {
            const files = await Promise.all(visibleRows.map(async (row) => {
                const data = await reporteCierreCajaService.getReporte(row);
                const name = getCierreReportFileName(row, kind);
                const blob = kind === "pdf" ? await buildCierrePdf(data, name) : await buildCierreExcel(data);
                return { name, blob };
            }));

            if (files.length === 1) {
                downloadBlob(files[0].blob, files[0].name);
            } else {
                await downloadReportsAsZip(files, `cierres_de_caja_${selectedDate}_${kind}.zip`);
            }
            addToast("success", `${files.length} reporte${files.length === 1 ? "" : "s"} generado${files.length === 1 ? "" : "s"}.`);
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No se pudo generar el reporte.");
        } finally {
            setDownloadKind(null);
        }
    };

    return (
        <AppLayout>
            <div className="flex flex-col gap-5">
                <div>
                    <h1 className="text-xl font-semibold text-primary">Cierre de Caja</h1>
                    <p className="text-sm text-tertiary">Consulta las operaciones finalizadas de cada cierre.</p>
                </div>

                <div className="overflow-hidden rounded-lg border border-secondary">
                    <div className="grid items-start gap-3 border-b border-secondary p-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,0.75fr)_minmax(480px,1.45fr)_112px_304px]">
                        <div className="grid min-w-0 grid-cols-2 gap-2" aria-label="Filtrar por banco">
                                {banks.map((bank) => (
                                    <Button
                                        key={bank.id}
                                        size="sm"
                                        color={selectedBank === bank.id ? "primary" : "secondary"}
                                        className={`${filterButtonClass} w-full`}
                                        onClick={() => handleBankChange(bank.id)}
                                    >
                                        {bank.label}
                                    </Button>
                                ))}
                        </div>
                        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Filtrar por empresa">
                            {companies.map((company) => (
                                <Button
                                    key={company.id}
                                    size="sm"
                                    color={selectedEmpresa === company.id ? "primary" : "secondary"}
                                    className={`${filterButtonClass} min-h-9 w-full whitespace-normal px-2 text-center leading-5`}
                                    onClick={() => setSelectedEmpresa(company.id)}
                                >
                                    {company.label}
                                </Button>
                            ))}
                        </div>

                        <div className="flex justify-start" aria-label="Descargar cierre">
                            <Dropdown.Root>
                                <Button
                                    size="sm"
                                    color="secondary"
                                    iconLeading={Download01}
                                    iconTrailing={ChevronDown}
                                    isDisabled={!selectedDate || !visibleRows.length || downloadKind !== null}
                                    isLoading={downloadKind !== null}
                                >
                                    Descargar
                                </Button>
                                <Dropdown.Popover className="w-48">
                                    <Dropdown.Menu>
                                        <Dropdown.Item icon={File06} isDisabled={downloadKind !== null} onAction={() => void download("xlsx")}>
                                            Excel
                                        </Dropdown.Item>
                                        <Dropdown.Item icon={File07} isDisabled={downloadKind !== null} onAction={() => void download("pdf")}>
                                            PDF
                                        </Dropdown.Item>
                                    </Dropdown.Menu>
                                </Dropdown.Popover>
                            </Dropdown.Root>
                        </div>

                        <div className="rounded-lg border border-secondary bg-primary p-3 md:col-span-2 xl:col-span-1 xl:col-start-4 xl:row-span-2 xl:row-start-1">
                            <Calendar
                                value={selectedCalendarDate}
                                highlightedDates={highlightedDates}
                                onChange={handleDateChange}
                                isDateUnavailable={(date) => !availableDates.has(calendarDateKey(date))}
                            >
                                <span className="hidden" />
                            </Calendar>
                        </div>

                        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 md:col-span-2 xl:col-span-3" aria-label="Seleccionar flujo">
                                {flows.map((flow) => (
                                    <Button
                                        key={flow.id}
                                        size="sm"
                                        color={selectedFlow === flow.id ? "primary" : "secondary"}
                                        className="w-full justify-center"
                                        onClick={() => setSelectedFlow(flow.id)}
                                    >
                                        {flow.label}
                                    </Button>
                                ))}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-max text-left text-sm">
                            <thead className="border-b border-secondary bg-secondary">
                                <tr>
                                    {flowHeaders[selectedFlow].map((header) => (
                                        <th key={header} className="whitespace-nowrap px-4 py-3 text-xs font-medium uppercase text-tertiary">{header}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-secondary">
                                {isLoading || isReportsLoading ? (
                                    <tr><td colSpan={flowHeaders[selectedFlow].length} className="px-4 py-14 text-center text-tertiary">Cargando cierre...</td></tr>
                                ) : !selectedDate ? (
                                    <tr><td colSpan={flowHeaders[selectedFlow].length} className="px-4 py-14 text-center text-tertiary">Selecciona una fecha de cierre para consultar operaciones del ciclo.</td></tr>
                                ) : tableRows.length === 0 ? (
                                    <tr><td colSpan={flowHeaders[selectedFlow].length} className="px-4 py-14 text-center text-tertiary">No hay operaciones para este flujo.</td></tr>
                                ) : tableRows.map((row) => (
                                    <tr key={row.id} className="hover:bg-primary_hover">
                                        {row.values.map((value, index) => <td key={`${row.id}-${index}`} className="whitespace-nowrap px-4 py-3 text-primary">{value}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
};
