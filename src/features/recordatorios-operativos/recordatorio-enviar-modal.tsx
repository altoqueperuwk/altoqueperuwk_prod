import { useEffect, useState } from "react";
import { Check, MessageNotificationCircle, X } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { useOperationalReminders } from "@/providers/operational-reminders-provider";
import { useToast } from "@/providers/toast-provider";
import { recordatoriosOperativosService } from "./recordatorios-operativos.service";
import type { RecordatorioContexto, RecordatorioNivel } from "./recordatorios-operativos.types";

const LEVELS: Array<{ id: RecordatorioNivel; label: string; color: "brand" | "warning" | "error"; message: string }> = [
    { id: 1, label: "Recordatorio", color: "brand", message: "Tienes una operación pendiente. Por favor, revísala y completa su cierre." },
    { id: 2, label: "Importante", color: "warning", message: "Esta operación continúa pendiente y requiere que regularices su cierre a la brevedad." },
    { id: 3, label: "Urgente", color: "error", message: "Alerta urgente: debes atender y cerrar esta operación pendiente de inmediato." },
];

interface RecordatorioEnviarModalProps {
    idOperacion: number;
}

export const RecordatorioEnviarModal = ({ idOperacion }: RecordatorioEnviarModalProps) => {
    const { addToast } = useToast();
    const { refresh } = useOperationalReminders();
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [contexto, setContexto] = useState<RecordatorioContexto | null>(null);
    const [nivel, setNivel] = useState<RecordatorioNivel>(1);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setIsLoading(true);
        recordatoriosOperativosService.getContexto(idOperacion)
            .then((value) => !cancelled && setContexto(value))
            .catch((error: unknown) => {
                if (!cancelled) addToast("error", error instanceof Error ? error.message : "No se pudo validar la operación");
            })
            .finally(() => !cancelled && setIsLoading(false));
        return () => { cancelled = true; };
    }, [addToast, idOperacion, isOpen]);

    const handleClose = () => {
        setIsOpen(false);
        setContexto(null);
        setNivel(1);
    };

    const handleSend = async () => {
        setIsSending(true);
        try {
            await recordatoriosOperativosService.enviar(idOperacion, nivel);
            addToast("success", `Aviso enviado a ${contexto?.usuarioDestinatario ?? "la persona responsable"}`);
            await refresh();
            handleClose();
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No se pudo enviar el aviso");
        } finally {
            setIsSending(false);
        }
    };

    const selectedLevel = LEVELS.find((item) => item.id === nivel)!;

    return (
        <>
            <Button
                size="sm"
                color="secondary"
                iconLeading={MessageNotificationCircle}
                aria-label="Enviar aviso al responsable"
                title="Enviar aviso al responsable"
                onClick={() => setIsOpen(true)}
            />
            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]" onClick={handleClose} />
                        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.15 }} className="relative z-10 w-full max-w-lg rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            <div className="atk-modal-head flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-primary">Enviar aviso de operación pendiente</h2>
                                    <p className="mt-1 text-sm text-tertiary">El aviso permanecerá activo hasta que la operación sea cerrada.</p>
                                </div>
                                <Button size="xs" color="tertiary" iconLeading={X} aria-label="Cerrar" onClick={handleClose} />
                            </div>

                            {isLoading ? (
                                <div className="flex h-40 items-center justify-center text-sm text-tertiary">Validando operación...</div>
                            ) : contexto ? (
                                <div className="mt-5 flex flex-col gap-5">
                                    <div className="grid grid-cols-2 gap-3 rounded-lg bg-secondary p-4 text-sm">
                                        <div><p className="text-tertiary">Responsable</p><p className="font-medium text-primary">{contexto.usuarioDestinatario}</p></div>
                                        <div><p className="text-tertiary">Operación</p><p className="font-medium text-primary">{contexto.codigoOperacion}</p></div>
                                        <div><p className="text-tertiary">Servicio</p><p className="font-medium text-primary">{contexto.servicio.replaceAll("_", " ")}</p></div>
                                        <div><p className="text-tertiary">Estado</p><p className="font-medium text-warning-primary">{contexto.estado}</p></div>
                                    </div>

                                    <div>
                                        <p className="mb-2 text-sm font-medium text-secondary">Nivel de alerta</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {LEVELS.map((item) => (
                                                <Button key={item.id} size="sm" color={nivel === item.id ? "primary" : "secondary"} onClick={() => setNivel(item.id)}>{item.label}</Button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-secondary p-4">
                                        <div className="mb-2 flex items-center justify-between gap-3">
                                            <p className="text-sm font-medium text-primary">Mensaje predeterminado</p>
                                            <Badge size="sm" color={selectedLevel.color}>{selectedLevel.label}</Badge>
                                        </div>
                                        <p className="text-sm text-secondary">{selectedLevel.message}</p>
                                    </div>

                                    {contexto.recordatorioActivo && <p className="text-xs text-warning-primary">Ya existe un aviso activo. Este envío actualizará su nivel y quedará registrado en el historial.</p>}
                                </div>
                            ) : null}

                            <div className="mt-6 flex justify-end gap-3">
                                <Button size="sm" color="secondary" onClick={handleClose}>Cancelar</Button>
                                <Button size="sm" color="primary" iconLeading={Check} isLoading={isSending} isDisabled={!contexto?.estaPendiente || !contexto.idUsuarioDestinatario} onClick={handleSend}>Enviar aviso</Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};
