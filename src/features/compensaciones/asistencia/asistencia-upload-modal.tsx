import { useEffect, useState } from "react";
import { CheckCircle, File05, UploadCloud02, X } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { FileUpload, getReadableFileSize } from "@/components/application/file-upload/file-upload-base";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { useToast } from "@/providers/toast-provider";
import { parseAsistenciaExcel } from "./asistencia-excel-parser";
import { asistenciaService } from "./asistencia.service";
import type { AsistenciaValidationResult } from "./asistencia.types";

interface AsistenciaUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirmed: () => void;
}

export const AsistenciaUploadModal = ({ isOpen, onClose, onConfirmed }: AsistenciaUploadModalProps) => {
    const { addToast } = useToast();
    const [file, setFile] = useState<File | null>(null);
    const [validation, setValidation] = useState<AsistenciaValidationResult | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setFile(null);
            setValidation(null);
            setIsProcessing(false);
            setIsConfirming(false);
        }
    }, [isOpen]);

    const processFile = async (selected: File) => {
        if (!/\.(xlsx|xls|csv)$/i.test(selected.name)) return addToast("error", "Selecciona un archivo XLSX, XLS o CSV");
        setFile(selected);
        setValidation(null);
        setIsProcessing(true);
        try {
            const parsed = await parseAsistenciaExcel(selected);
            const load = await asistenciaService.registerCarga(selected, parsed.hash, parsed.sheetName);
            const idCarga = Number(load.id);
            const state = String(load.estado_carga ?? "");

            if (state === "CONFIRMADA") {
                addToast("success", "Este archivo ya fue confirmado anteriormente");
                onConfirmed();
                return;
            }
            if (state === "VALIDADA") {
                const existing = (await asistenciaService.getCargas()).find((item) => item.id === idCarga);
                if (!existing) throw new Error("No se pudo recuperar la validación existente");
                setValidation({ idCarga, estadoCarga: existing.estadoCarga, fechaDesde: existing.fechaDesde, fechaHasta: existing.fechaHasta, totalFilas: existing.totalFilas, totalValidas: existing.totalValidas, totalInvalidas: existing.totalInvalidas, totalDuplicadas: existing.totalDuplicadas, errores: [] });
                return;
            }
            setValidation(await asistenciaService.validateCarga(idCarga, parsed.rows));
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No fue posible procesar el archivo");
        } finally {
            setIsProcessing(false);
        }
    };

    const confirm = async () => {
        if (!validation) return;
        setIsConfirming(true);
        try {
            await asistenciaService.confirmCarga(validation.idCarga);
            addToast("success", "Archivo confirmado y jornadas consolidadas");
            onConfirmed();
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No fue posible confirmar la carga");
        } finally {
            setIsConfirming(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]" onClick={onClose} />
                    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.18 }} className="relative z-10 w-full max-w-2xl rounded-xl bg-primary p-6 shadow-xl">
                        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-primary">Importar asistencia</h2><p className="mt-1 text-sm text-tertiary">Carga el archivo exportado por el sistema de huellero.</p></div><Button size="xs" color="tertiary" iconLeading={X} aria-label="Cerrar" onClick={onClose} /></div>

                        <div className="mt-6">
                            {!file ? (
                                <FileUpload.DropZone accept=".xlsx,.xls,.csv" allowsMultiple={false} maxSize={20 * 1024 * 1024} hint="XLSX, XLS o CSV hasta 20 MB" onDropFiles={(files) => files[0] && void processFile(files[0])} onDropUnacceptedFiles={() => addToast("error", "Formato de archivo no compatible")} onSizeLimitExceed={() => addToast("error", "El archivo supera los 20 MB")} />
                            ) : (
                                <div className="flex items-center gap-3 rounded-xl border border-secondary p-4"><span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-fg-quaternary"><File05 className="size-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-primary">{file.name}</p><p className="mt-0.5 text-xs text-tertiary">{getReadableFileSize(file.size)}</p></div>{validation && <Badge color="success">Validado</Badge>}</div>
                            )}

                            {isProcessing && <div className="mt-5 rounded-xl bg-secondary p-5 text-center"><UploadCloud02 className="mx-auto size-6 animate-pulse text-brand-secondary" /><p className="mt-2 text-sm font-medium text-primary">Leyendo y validando marcaciones...</p><p className="mt-1 text-xs text-tertiary">El archivo todavía no afecta las jornadas consolidadas.</p></div>}

                            {validation && (
                                <div className="mt-5 space-y-4">
                                    <div className="grid gap-3 sm:grid-cols-4">
                                        <div className="rounded-lg bg-secondary p-3"><p className="text-xs text-tertiary">Filas</p><p className="mt-1 text-lg font-semibold text-primary">{validation.totalFilas}</p></div>
                                        <div className="rounded-lg bg-success-secondary p-3"><p className="text-xs text-success-primary">Válidas</p><p className="mt-1 text-lg font-semibold text-success-primary">{validation.totalValidas}</p></div>
                                        <div className="rounded-lg bg-error-primary p-3"><p className="text-xs text-error-primary">Inválidas</p><p className="mt-1 text-lg font-semibold text-error-primary">{validation.totalInvalidas}</p></div>
                                        <div className="rounded-lg bg-warning-primary p-3"><p className="text-xs text-warning-primary">Duplicadas</p><p className="mt-1 text-lg font-semibold text-warning-primary">{validation.totalDuplicadas}</p></div>
                                    </div>
                                    {validation.errores.length > 0 && <div className="max-h-44 overflow-y-auto rounded-lg border border-secondary"><div className="border-b border-secondary bg-secondary px-3 py-2 text-xs font-semibold text-tertiary">Primeros errores detectados</div>{validation.errores.slice(0, 20).map((error, index) => <div key={`${error.numero_fila}-${index}`} className="flex gap-3 border-b border-secondary px-3 py-2 text-xs last:border-b-0"><span className="shrink-0 font-medium text-primary">Fila {error.numero_fila}</span><span className="text-error-primary">{error.mensaje}</span></div>)}</div>}
                                    <div className="flex items-start gap-3 rounded-lg bg-secondary p-3"><CheckCircle className="mt-0.5 size-5 shrink-0 text-brand-secondary" /><p className="text-xs text-tertiary">Al confirmar se consolidarán únicamente las marcaciones válidas. Las filas inválidas y duplicadas permanecerán como evidencia de la carga.</p></div>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 flex justify-between gap-3"><div>{file && !isProcessing && !validation && <Button size="sm" color="secondary" onClick={() => setFile(null)}>Elegir otro archivo</Button>}</div><div className="flex gap-3"><Button size="sm" color="secondary" onClick={onClose}>Cancelar</Button><Button size="sm" color="primary" isDisabled={!validation || validation.totalValidas === 0} isLoading={isConfirming} onClick={() => void confirm()}>Confirmar carga</Button></div></div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

