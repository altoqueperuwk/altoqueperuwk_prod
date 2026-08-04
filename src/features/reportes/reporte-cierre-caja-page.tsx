import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Select } from "@/components/base/select/select";
import { useToast } from "@/providers/toast-provider";
import { File06, File07 } from "@untitledui/icons";
import {
    buildCierreExcel,
    buildCierrePdf,
    downloadBlob,
    downloadReportsAsZip,
    getCierreReportFileName,
} from "./services/reporte-cierre-caja-download";
import {
    formatCierreDate,
    reporteCierreCajaService,
    type ReporteCierreCajaRow,
} from "./services/reporte-cierre-caja.service";

const formatDateKey = (value: string) => value.split("-").reverse().join("/");

export const ReporteCierreCajaPage = () => {
    const { addToast } = useToast();
    const [rows, setRows] = useState<ReporteCierreCajaRow[]>([]);
    const [dates, setDates] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedEmpresa, setSelectedEmpresa] = useState<number | null>(null);
    const [selectedCuenta, setSelectedCuenta] = useState<number | null>(null);
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            reporteCierreCajaService.getFechas(),
            reporteCierreCajaService.getBandeja(null),
        ])
            .then(([dateRows, accountRows]) => {
                if (cancelled) return;
                setDates(dateRows.map((row) => String(row.fecha_cierre)).sort().reverse());
                setRows(accountRows);
            })
            .catch((error) => {
                if (!cancelled) addToast("error", error instanceof Error ? error.message : "No se pudo cargar Cierre de Caja.");
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [addToast]);

    useEffect(() => {
        let cancelled = false;
        setSelectedRows(new Set());
        setIsLoading(true);
        reporteCierreCajaService.getBandeja(selectedDate)
            .then((nextRows) => {
                if (!cancelled) setRows(nextRows);
            })
            .catch((error) => {
                if (!cancelled) addToast("error", error instanceof Error ? error.message : "No se pudo cargar las cuentas.");
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [addToast, selectedDate]);

    const companies = useMemo(
        () => Array.from(new Map(rows.map((row) => [row.id_empresa, { id: row.id_empresa, label: row.nombre_empresa }])).values()),
        [rows],
    );
    const accounts = useMemo(
        () => rows
            .filter((row) => !selectedEmpresa || row.id_empresa === selectedEmpresa)
            .map((row) => ({ id: row.id_empresa_cuenta_bancaria, label: row.nombre_banco })),
        [rows, selectedEmpresa],
    );
    const visibleRows = useMemo(
        () => rows.filter((row) =>
            (!selectedEmpresa || row.id_empresa === selectedEmpresa) &&
            (!selectedCuenta || row.id_empresa_cuenta_bancaria === selectedCuenta),
        ),
        [rows, selectedCuenta, selectedEmpresa],
    );
    const selectedItems = visibleRows.filter((row) => selectedRows.has(row.id_empresa_cuenta_bancaria) && row.tiene_cierre);

    const toggleRow = (id: number, checked: boolean) => {
        setSelectedRows((current) => {
            const next = new Set(current);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const toggleAll = (checked: boolean) => {
        setSelectedRows(checked
            ? new Set(visibleRows.filter((row) => row.tiene_cierre).map((row) => row.id_empresa_cuenta_bancaria))
            : new Set());
    };

    const download = async (kind: "pdf" | "xlsx", requestedRows = selectedItems) => {
        if (!requestedRows.length) {
            addToast("error", "Selecciona al menos una cuenta con reporte disponible.");
            return;
        }

        setIsDownloading(true);
        try {
            const files = await Promise.all(requestedRows.map(async (row) => {
                const data = await reporteCierreCajaService.getReporte(row);
                const fileName = getCierreReportFileName(row, kind);
                const blob = kind === "pdf"
                    ? await buildCierrePdf(data, fileName)
                    : await buildCierreExcel(data);
                return { name: fileName, blob };
            }));

            if (files.length === 1) {
                downloadBlob(files[0].blob, files[0].name);
            } else {
                await downloadReportsAsZip(files, `cierres_de_caja_${selectedDate ?? "seleccion"}_${kind}.zip`);
            }
            addToast("success", `${files.length} reporte${files.length === 1 ? "" : "s"} generado${files.length === 1 ? "" : "s"}.`);
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No se pudo generar el reporte.");
        } finally {
            setIsDownloading(false);
        }
    };

    const selectableRows = visibleRows.filter((row) => row.tiene_cierre);
    const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedRows.has(row.id_empresa_cuenta_bancaria));
    const selectItems = [
        { id: "sin-cierre", label: "Sin Cierre de Caja" },
        ...dates.map((date) => ({ id: date, label: formatDateKey(date) })),
    ];
    const companyItems = [
        { id: "todas", label: "Todas" },
        ...companies.map((company) => ({ id: String(company.id), label: company.label })),
    ];
    const accountItems = [
        { id: "todas", label: "Todas" },
        ...accounts.map((account) => ({ id: String(account.id), label: account.label })),
    ];

    return (
        <AppLayout>
            <div className="flex flex-col gap-5">
                <div>
                    <h1 className="text-xl font-semibold text-primary">Cierre de Caja</h1>
                    <p className="text-sm text-tertiary">Consulta y descarga reportes por empresa y cuenta.</p>
                </div>

                <div className="overflow-hidden rounded-lg border border-secondary">
                    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-secondary bg-primary px-4 py-3">
                        <div className="flex min-w-0 flex-wrap items-end gap-2">
                        <Select
                            className="w-44"
                            label="Empresa"
                            items={companyItems}
                            placeholder="Todas"
                            size="sm"
                            selectedKey={selectedEmpresa ? String(selectedEmpresa) : "todas"}
                            onSelectionChange={(key) => {
                                setSelectedEmpresa(key && String(key) !== "todas" ? Number(key) : null);
                                setSelectedCuenta(null);
                            }}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                        <Select
                            className="w-40"
                            label="Cuenta"
                            items={accountItems}
                            placeholder="Todas"
                            size="sm"
                            selectedKey={selectedCuenta ? String(selectedCuenta) : "todas"}
                            onSelectionChange={(key) => setSelectedCuenta(key && String(key) !== "todas" ? Number(key) : null)}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                        <Select
                            className="w-48"
                            label="Fecha de Cierre de Caja"
                            items={selectItems}
                            placeholder="Sin Cierre de Caja"
                            size="sm"
                            selectedKey={selectedDate ?? "sin-cierre"}
                            onSelectionChange={(key) => setSelectedDate(key && String(key) !== "sin-cierre" ? String(key) : null)}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <Button size="sm" color="secondary" iconLeading={File07} isDisabled={!selectedItems.length || isDownloading} isLoading={isDownloading} onClick={() => void download("pdf")}>
                                Descargar PDF
                            </Button>
                            <Button size="sm" color="secondary" iconLeading={File06} isDisabled={!selectedItems.length || isDownloading} isLoading={isDownloading} onClick={() => void download("xlsx")}>
                                Descargar EXCEL
                            </Button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="border-b border-secondary bg-secondary">
                                <tr>
                                    <th className="w-px px-4 py-3">
                                        <Checkbox aria-label="Seleccionar cuentas con cierre" isDisabled={!selectableRows.length || isDownloading} isSelected={allSelected} onChange={toggleAll} />
                                    </th>
                                    <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Empresa</th>
                                    <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Cuenta</th>
                                    <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Fecha Cierre</th>
                                    <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Reporte PDF</th>
                                    <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Reporte Excel</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-secondary">
                                {isLoading ? (
                                    <tr><td colSpan={6} className="px-4 py-14 text-center text-tertiary">Cargando...</td></tr>
                                ) : visibleRows.length === 0 ? (
                                    <tr><td colSpan={6} className="px-4 py-14 text-center text-tertiary">No se encontraron cuentas.</td></tr>
                                ) : visibleRows.map((row) => (
                                    <tr key={row.id_empresa_cuenta_bancaria} className="hover:bg-primary_hover">
                                        <td className="px-4 py-3">
                                            <Checkbox aria-label={`Seleccionar ${row.nombre_empresa} ${row.nombre_banco}`} isDisabled={!row.tiene_cierre || isDownloading} isSelected={selectedRows.has(row.id_empresa_cuenta_bancaria)} onChange={(checked) => toggleRow(row.id_empresa_cuenta_bancaria, checked)} />
                                        </td>
                                        <td className="px-4 py-3 text-primary">{row.nombre_empresa}</td>
                                        <td className="px-4 py-3 text-primary">{row.nombre_banco}</td>
                                        <td className="px-4 py-3 text-primary">{row.tiene_cierre ? formatCierreDate(row.fecha_cierre) : ""}</td>
                                        <td className="px-4 py-3"><Button size="xs" color="tertiary" iconLeading={File07} isDisabled={!row.tiene_cierre || isDownloading} onClick={() => void download("pdf", [row])}>PDF</Button></td>
                                        <td className="px-4 py-3"><Button size="xs" color="tertiary" iconLeading={File06} isDisabled={!row.tiene_cierre || isDownloading} onClick={() => void download("xlsx", [row])}>Excel</Button></td>
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
