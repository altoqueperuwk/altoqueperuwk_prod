import { useEffect, useMemo, useState } from "react";
import { CheckCircle, File07, Trash01, UploadCloud02, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { codigoServicioService } from "@/services/codigo-servicio.service";
import { comunidadService } from "@/services/comunidad.service";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import {
    readExcelRowsFromFile,
    type ExcelRow,
} from "@/features/operaciones/efectivizacion/shared/utils/excel-parser";
import { buildExcelPayload } from "@/features/operaciones/efectivizacion/shared/utils/rpc-payloads";
import { findCodigoServicioForRuta } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import type { OperacionRutaBancaria } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { EmpresaTabs } from "@/features/operaciones/efectivizacion/shared/components/empresa-tabs";
import { cx } from "@/utils/cx";

interface BancariaExcelUploadProps {
    activeCompany: RutaOperacionCaja | null;
    activeCompanyId: number | null;
    companies: RutaOperacionCaja[];
    companyName: string;
    onProcessed: () => void;
    onCompanyChange: (id: number) => void;
    ruta: OperacionRutaBancaria;
}

interface CatalogItem {
    id: number;
    nombre: string;
    tipo?: string;
}

const formatFileSize = (bytes: number) => {
    if (!bytes) return "0 KB";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getCounterValue = (result: Record<string, unknown> | null, key: string) => Number(result?.[key] ?? 0);
export const BancariaExcelUpload = ({
    activeCompany,
    activeCompanyId,
    companies,
    companyName,
    onCompanyChange,
    onProcessed,
    ruta,
}: BancariaExcelUploadProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [fileName, setFileName] = useState("");
    const [fileSize, setFileSize] = useState(0);
    const [rows, setRows] = useState<ExcelRow[]>([]);
    const [communityId, setCommunityId] = useState("");
    const [communities, setCommunities] = useState<CatalogItem[]>([]);
    const [serviceItems, setServiceItems] = useState<CatalogItem[]>([]);
    const [result, setResult] = useState<Record<string, unknown> | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const selectedCommunity = useMemo(
        () => communities.find((item) => String(item.id) === communityId) ?? null,
        [communities, communityId],
    );
    const service = useMemo(() => findCodigoServicioForRuta(serviceItems, ruta), [serviceItems, ruta]);
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;
    const hasFile = Boolean(fileName && rows.length);
    const processedCount = getCounterValue(result, "filas_procesadas");
    const omittedCount = getCounterValue(result, "filas_omitidas");
    const errorCount = getCounterValue(result, "filas_error");

    const resetUpload = () => {
        setFileName("");
        setFileSize(0);
        setRows([]);
        setResult(null);
    };

    useEffect(() => {
        let ignore = false;

        Promise.all([
            comunidadService.getList({ p_id_estado: 1 }),
            codigoServicioService.getList({ p_id_estado: 1 }),
        ])
            .then(([communityRows, serviceRows]) => {
                if (ignore) return;

                const communityItems = communityRows.map((row) => ({
                    id: Number(row.id),
                    nombre: String(row.nombre ?? ""),
                }));
                const serviceItems = serviceRows.map((row) => ({
                    id: Number(row.id),
                    nombre: String(row.nombre ?? ""),
                    tipo: String(row.tipo ?? ""),
                }));

                setCommunities(communityItems);
                setServiceItems(serviceItems);
                if (!communityId && communityItems[0]) setCommunityId(String(communityItems[0].id));
            })
            .catch(() => addToast("error", "Error al cargar catalogos de Excel."));

        return () => {
            ignore = true;
        };
    }, [addToast, communityId]);

    useEffect(() => {
        resetUpload();
    }, [activeCompany?.id_empresa, activeCompany?.id_empresa_cuenta_bancaria, ruta]);

    const handleFile = async (file: File) => {
        setFileName(file.name);
        setFileSize(file.size);
        setResult(null);

        try {
            const extension = file.name.split(".").pop()?.toLowerCase();
            const isHtml = extension === "html" || extension === "htm";
            const isExcel = extension === "xlsx" || extension === "xls";
            const isTxt = extension === "txt";

            if (!isHtml && !isExcel && !isTxt) {
                throw new Error("Formato no soportado. Usa .xlsx, .xls, .html, .htm o .txt.");
            }

            const mappedRows = await readExcelRowsFromFile(file, ruta);

            if (!mappedRows.length) throw new Error("No se encontraron filas para procesar.");

            setRows(mappedRows);
            addToast("success", `Archivo cargado: ${mappedRows.length} filas.`);
        } catch (err) {
            setFileName("");
            setRows([]);
            setFileSize(0);
            const message = err instanceof Error ? err.message : "Error al leer el archivo.";
            addToast("error", message);
        }
    };

    const handleProcess = async () => {
        if (!activeCompany) {
            addToast("error", "Selecciona una empresa antes de procesar.");
            return;
        }

        if (!service) {
            addToast("error", `No se encontro el codigo de servicio para ${ruta}.`);
            return;
        }

        if (!selectedCommunity) {
            addToast("error", "La comunidad es obligatoria.");
            return;
        }

        if (!rows.length) {
            addToast("error", "Carga un archivo valido antes de procesar.");
            return;
        }

        setIsProcessing(true);

        try {
            const payload = buildExcelPayload({
                activeCompany,
                fileName,
                rows,
                selectedCommunity,
                service,
                user: { userId, userName },
                ruta,
            });
            const response = await operacionesRpcService.postOperacionExcel(payload);

            setResult(response);
            onProcessed();
            addToast("success", "Excel procesado correctamente.");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al procesar Excel.";
            addToast("error", message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <section className="rounded-lg border border-secondary bg-primary p-5 shadow-xs" aria-label={`Carga de archivo ${companyName}`}>
            <div className="mb-4 min-w-0">
                <div className="overflow-x-auto overflow-y-hidden pb-1">
                    <div className="inline-block min-w-max">
                        <div className="flex items-center gap-3">
                            <EmpresaTabs companies={companies} activeCompanyId={activeCompanyId} onChange={onCompanyChange} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid min-w-0 items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_fit-content(680px)]">
                <div className="grid min-w-0">
                    <label
                        className={cx(
                            "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-secondary bg-secondary px-4 py-8 text-center transition duration-100",
                            "hover:bg-primary_hover",
                        )}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            event.preventDefault();
                            const file = event.dataTransfer.files?.[0];
                            if (file) void handleFile(file);
                        }}
                    >
                        <UploadCloud02 className="mb-5 size-10 text-fg-quaternary" />
                        <span className="text-sm font-semibold text-primary">Selecciona o arrastra un archivo</span>
                        <span className="mt-2 text-xs text-tertiary">.xlsx, .xls, .html, .htm, .txt</span>
                        <input
                            key={`${activeCompany?.id_empresa ?? "sin-empresa"}-${fileName}`}
                            type="file"
                            accept=".xlsx,.xls,.html,.htm,.txt"
                            className="sr-only"
                            onChange={(event) => {
                                const file = event.currentTarget.files?.[0];
                                if (file) void handleFile(file);
                            }}
                        />
                    </label>
                </div>

                <div className="grid min-w-0 content-start gap-4 xl:min-w-[360px] xl:max-w-[680px]">
                    <div className={cx("min-w-0 rounded-xl border border-secondary bg-primary p-4 shadow-xs", !hasFile && "opacity-60")}>
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-secondary bg-secondary">
                                <File07 className="size-5 text-fg-brand-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-primary">{fileName || "Sin archivo seleccionado"}</p>
                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tertiary">
                                    <span>{hasFile ? formatFileSize(fileSize) : "0 KB"}</span>
                                    <span className="flex items-center gap-1 text-success-primary">
                                        <CheckCircle className="size-3.5" />
                                        {hasFile ? "Complete" : "Pendiente"}
                                    </span>
                                    <span>{rows.length ? `${rows.length} filas detectadas` : "0 filas detectadas"}</span>
                                </div>
                            </div>
                            <Button
                                size="xs"
                                color="tertiary"
                                iconLeading={Trash01}
                                aria-label="Limpiar archivo"
                                isDisabled={!fileName || isProcessing}
                                onClick={resetUpload}
                            />
                        </div>
                        <div className="mt-4 flex min-w-0 items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary_alt">
                                <div className={cx("h-full rounded-full bg-brand-solid transition-all", hasFile ? "w-full" : "w-0")} />
                            </div>
                            <span className="shrink-0 text-xs font-semibold text-secondary">{hasFile ? "100%" : "0%"}</span>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        {[
                            ["Procesados", processedCount],
                            ["Omitidos", omittedCount],
                            ["Errores", errorCount],
                        ].map(([label, value]) => (
                            <div key={label} className="flex min-h-10 items-center rounded-lg border border-secondary bg-secondary px-4 shadow-xs">
                                <p className="w-full text-center text-xs font-semibold text-secondary">{label}: {value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Button size="md" iconLeading={File07} isDisabled={!hasFile || isProcessing} isLoading={isProcessing} onClick={handleProcess}>
                            Procesar
                        </Button>
                        <Button size="md" iconLeading={XClose} isDisabled={!fileName || isProcessing} onClick={resetUpload}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    );
};
