import { useEffect, useMemo, useState } from "react";
import { Check, File07, Trash01, UploadCloud02, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { codigoServicioService } from "@/services/codigo-servicio.service";
import { comunidadService } from "@/services/comunidad.service";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import {
    PartialExcelArchiveError,
    readExcelRowsFromFile,
    type ExcelRow,
} from "@/features/operaciones/efectivizacion/shared/utils/excel-parser";
import { buildExcelPayload } from "@/features/operaciones/efectivizacion/shared/utils/rpc-payloads";
import { findCodigoServicioForRuta } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import type { OperacionRutaBancaria } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { cx } from "@/utils/cx";

interface BancariaExcelUploadProps {
    activeCompany: RutaOperacionCaja | null;
    className?: string;
    companyName: string;
    onProcessed: () => void;
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
    className,
    companyName,
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
            const isZip = extension === "zip";

            if (!isHtml && !isExcel && !isTxt && !isZip) {
                throw new Error("Formato no soportado. Usa .zip, .xlsx, .xls, .html, .htm o .txt.");
            }

            const mappedRows = await readExcelRowsFromFile(file, ruta);

            if (!mappedRows.length) throw new Error("No se encontraron filas para procesar.");

            setRows(mappedRows);
            addToast("success", `Archivo cargado: ${mappedRows.length} filas.`);
        } catch (err) {
            if (err instanceof PartialExcelArchiveError) {
                setRows(err.rows);
                addToast("info", `${err.message} Se conservaron ${err.rows.length} filas validas.`);
                return;
            }

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
            const filasOmitidas = Number(response.filas_omitidas ?? 0);
            const filasProcesadas = Number(response.filas_procesadas ?? 0);

            if (filasOmitidas > 0) {
                addToast(
                    "info",
                    filasProcesadas > 0
                        ? `Excel procesado. ${filasOmitidas} operacion(es) duplicada(s) fueron omitida(s).`
                        : "No se insertaron operaciones: todas fueron identificadas como duplicadas.",
                );
            } else {
                addToast("success", "Excel procesado correctamente.");
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al procesar Excel.";
            addToast("error", message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <section className={cx("atk-card h-full rounded-lg border border-secondary bg-primary", className)} aria-label={`Carga de archivo ${companyName}`}>
            <div className="atk-strip">
                <h2 className="atk-strip-title">Carga Masiva</h2>
            </div>
            <div className="grid min-w-0 items-stretch gap-4 p-4 sm:p-5 xl:grid-cols-12">
                <div className="grid min-w-0 xl:col-span-7">
                    <label
                        className="atk-dropzone flex min-h-[185px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-6 text-center"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            event.preventDefault();
                            const file = event.dataTransfer.files?.[0];
                            if (file) void handleFile(file);
                        }}
                    >
                        <span className="atk-dropzone-icon mb-3 flex size-11 items-center justify-center rounded-full">
                            <UploadCloud02 aria-hidden="true" className="size-6" />
                        </span>
                        <span className="text-sm font-semibold text-primary">Selecciona o arrastra un archivo</span>
                        <span className="mt-1 text-[11px] text-tertiary">.zip, .xlsx, .xls, .html, .htm, .txt</span>
                        <input
                            key={`${activeCompany?.id_empresa ?? "sin-empresa"}-${fileName}`}
                            type="file"
                            accept=".zip,.xlsx,.xls,.html,.htm,.txt"
                            className="sr-only"
                            onChange={(event) => {
                                const file = event.currentTarget.files?.[0];
                                if (file) void handleFile(file);
                            }}
                        />
                    </label>
                </div>

                <div className="flex min-w-0 flex-col justify-between gap-3 xl:col-span-5">
                    <div className="atk-tile flex min-w-0 items-center justify-between gap-3 rounded-xl p-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="atk-tile-icon flex size-9 shrink-0 items-center justify-center rounded-lg">
                                <File07 aria-hidden="true" className="size-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-primary">{fileName || "Sin archivo seleccionado"}</p>
                                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-tertiary">
                                    <span>{hasFile ? formatFileSize(fileSize) : "0 KB"}</span>
                                    <span className="flex items-center gap-0.5 font-medium text-success-primary">
                                        <Check aria-hidden="true" className="size-3" />
                                        {hasFile ? "Complete" : "Pendiente"}
                                    </span>
                                    <span>{rows.length ? `${rows.length} filas detectadas` : "0 filas detectadas"}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end justify-between gap-1 self-stretch">
                            <Button
                                size="xs"
                                color="tertiary"
                                iconLeading={Trash01}
                                aria-label="Limpiar archivo"
                                isDisabled={!fileName || isProcessing}
                                onClick={resetUpload}
                            />
                            <span className="text-[11px] font-bold text-tertiary">{hasFile ? "100%" : "0%"}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        {[
                            ["Procesados", processedCount],
                            ["Omitidos", omittedCount],
                            ["Errores", errorCount],
                        ].map(([label, value]) => (
                            <div key={label} className="atk-tile rounded-lg px-2.5 py-2 text-center">
                                <p className="text-[11px] font-medium text-tertiary tabular-nums">
                                    {label}: <strong className="text-primary">{value}</strong>
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2">
                        <Button
                            size="md"
                            className="atk-upload-process"
                            iconLeading={File07}
                            isDisabled={!hasFile || isProcessing}
                            isLoading={isProcessing}
                            onClick={handleProcess}
                        >
                            Procesar
                        </Button>
                        <Button size="md" color="secondary" iconLeading={XClose} isDisabled={!fileName || isProcessing} onClick={resetUpload}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    );
};
