import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw01 } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { colaboradoresService } from "./colaboradores.service";
import type { Colaborador, ColaboradorAsignacion } from "./colaboradores.types";

interface ColaboradorFichaPopupProps {
    isOpen: boolean;
    onClose: () => void;
    colaborador: Colaborador | null;
    fechaReferencia?: string;
}
const humanize = (value: string) =>
    value
        .toLocaleLowerCase("es-PE")
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));
const dateFormatter = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const formatDate = (value: string | null) => (value ? dateFormatter.format(new Date(value.slice(0, 10) + "T12:00:00Z")) : "—");
const FichaDato = ({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) => (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
        <dt className="text-xs text-tertiary">{label}</dt>
        <dd className="mt-1 text-sm font-medium break-words text-primary">{children || <span className="font-normal text-tertiary">—</span>}</dd>
    </div>
);

export const ColaboradorFichaPopup = ({ isOpen, onClose, colaborador }: ColaboradorFichaPopupProps) => {
    const notify = useAlert();
    const { isResolving } = useCompensacionPerfil();
    const [assignments, setAssignments] = useState<ColaboradorAsignacion[]>([]);
    const [loadError, setLoadError] = useState("");
    const requestVersion = useRef(0);
    const assignmentId = colaborador?.asignacion?.id;
    const loadDetails = useCallback(async () => {
        if (!colaborador || !isOpen || isResolving) return;
        const version = ++requestVersion.current;
        setLoadError("");
        setAssignments([]);
        try {
            const rows = await colaboradoresService.getAssignments(colaborador.id);
            if (version !== requestVersion.current) return;
            setAssignments(rows);
        } catch (error) {
            if (version !== requestVersion.current) return;
            const message = error instanceof Error ? error.message : "No fue posible cargar la ficha del colaborador";
            setLoadError(message);
            notify("error", message);
        }
    }, [notify, colaborador?.id, isOpen, isResolving]);
    useEffect(() => {
        if (isOpen && colaborador) void loadDetails();
        else setAssignments([]);
        return () => {
            requestVersion.current++;
        };
    }, [isOpen, loadDetails]);
    if (!colaborador) return null;
    const selected = assignments.find((row) => row.id === assignmentId) ?? colaborador.asignacion;
    return (
        <AnimatePresence>
            {isOpen && (
                <CompensacionSurface title="Ficha del Colaborador" onClose={onClose}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 10 }}
                        transition={{ duration: 0.18 }}
                        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden! rounded-xl bg-primary shadow-xl ring-1 ring-secondary"
                    >
                        <CompensacionDialogHeader title="Ficha del Colaborador" onClose={onClose} />
                        <div className="min-h-0 flex-1 shrink! space-y-6 overflow-y-auto p-4 sm:p-6">
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
                                <FichaDato label="Usuario del Sistema">{colaborador.usuarioNombre || colaborador.nombreCompleto}</FichaDato>
                                <FichaDato label="Nombre Completo">{colaborador.nombreCompleto}</FichaDato>
                                <FichaDato label="Documento">{[colaborador.tipoDocumento, colaborador.numeroDocumento].filter(Boolean).join(" ")}</FichaDato>
                                <FichaDato label="Estado">
                                    <CompensacionEstado dominio="personal" valor={colaborador.estadoNombre} />
                                </FichaDato>
                                <FichaDato label="Cargo">{selected?.cargoNombre || "Sin asignación"}</FichaDato>
                                <FichaDato label="Sede">{selected?.sucursalNombre || "Sin sede"}</FichaDato>
                                <FichaDato label="Modalidad">{selected?.modalidad ? humanize(selected.modalidad) : "—"}</FichaDato>
                                <FichaDato label="Fecha de Ingreso">{formatDate(colaborador.fechaIngreso)}</FichaDato>
                                <FichaDato label="Fecha de Cese">{formatDate(colaborador.fechaCese)}</FichaDato>
                                <FichaDato label="Motivo de Cese" wide>
                                    {colaborador.motivoCese || "—"}
                                </FichaDato>
                            </dl>
                            {loadError && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <AlertMessage tone="error">{loadError}</AlertMessage>
                                    <Button size="sm" color="primary" iconLeading={RefreshCw01} onClick={() => void loadDetails()}>
                                        Reintentar
                                    </Button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </CompensacionSurface>
            )}
        </AnimatePresence>
    );
};
