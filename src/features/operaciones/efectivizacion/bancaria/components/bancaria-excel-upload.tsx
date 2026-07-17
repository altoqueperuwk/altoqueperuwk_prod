import { useEffect, useMemo, useState } from "react";
import { UploadCloud02 } from "@untitledui/icons";
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

interface BancariaExcelUploadProps {
    activeCompany: RutaOperacionCaja | null;
    companyName: string;
    onProcessed: () => void;
    ruta: OperacionRutaBancaria;
}

interface CatalogItem {
    id: number;
    nombre: string;
    tipo?: string;
}

export const BancariaExcelUpload = ({ activeCompany, companyName, onProcessed, ruta }: BancariaExcelUploadProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [fileName, setFileName] = useState("");
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
        setFileName("");
        setRows([]);
        setResult(null);
    }, [ruta]);

    const handleFile = async (file: File) => {
        setFileName(file.name);
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
            setRows([]);
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
        <section className="rounded-lg border border-secondary bg-primary p-4 shadow-xs">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-primary">Sube Un archivo Excel: {companyName}</h2>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
                <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-secondary bg-secondary px-4 py-6 text-center transition duration-100 hover:bg-primary_hover">
                    <UploadCloud02 className="mb-3 size-8 text-fg-quaternary" />
                    <span className="text-sm font-medium text-primary">Selecciona o arrastra un archivo</span>
                    <span className="mt-1 text-xs text-tertiary">.xlsx, .xls, .html, .htm, .txt</span>
                    <input
                        type="file"
                        accept=".xlsx,.xls,.html,.htm,.txt"
                        className="sr-only"
                        onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            if (file) void handleFile(file);
                        }}
                    />
                </label>

                <div className="flex min-h-36 flex-col justify-between rounded-lg border border-secondary bg-primary p-4">
                    <div>
                        <p className="text-xs font-medium text-tertiary">Archivo cargado</p>
                        <p className="mt-2 truncate text-sm font-semibold text-primary">{fileName || "Sin archivo seleccionado"}</p>
                        <p className="mt-1 text-xs text-tertiary">{rows.length ? `${rows.length} filas detectadas` : "Sin filas detectadas"}</p>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            size="sm"
                            color="secondary"
                            isDisabled={isProcessing || !fileName}
                            onClick={() => {
                                setFileName("");
                                setRows([]);
                                setResult(null);
                            }}
                        >
                            Cancelar
                        </Button>
                        <Button size="sm" isDisabled={!rows.length} isLoading={isProcessing} onClick={handleProcess}>
                            Procesar
                        </Button>
                    </div>
                </div>
            </div>

            {result && (
                <div className="mt-4 rounded-lg border border-secondary bg-secondary p-3 text-sm text-secondary">
                    <div className="grid gap-2 sm:grid-cols-3">
                        <span>Procesadas: {String(result.filas_procesadas ?? 0)}</span>
                        <span>Omitidas: {String(result.filas_omitidas ?? 0)}</span>
                        <span>Errores: {String(result.filas_error ?? 0)}</span>
                    </div>
                </div>
            )}
        </section>
    );
};
