import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import type { Colaborador } from "./colaboradores.types";

const Field = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="min-w-0">
        <dt className="text-xs text-tertiary">{label}</dt>
        <dd className="mt-1 text-sm font-semibold break-words text-primary">{value}</dd>
    </div>
);

export const ColaboradorCard = ({ item, onDetail, onEdit }: { item: Colaborador; onDetail: () => void; onEdit: () => void }) => {
    const { isAdvisor, isResolving, isStoreManager } = useCompensacionPerfil();
    const readOnly = isAdvisor || isResolving || isStoreManager;
    const ficha = item.ficha;
    const initials = item.nombreCompleto
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase();
    return (
        <motion.article
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            aria-label={`Ficha de ${item.nombreCompleto}`}
            className="flex min-w-0 flex-col rounded-2xl border border-secondary bg-primary p-5 shadow-xs"
        >
            <header className="flex items-start gap-3 border-b border-secondary pb-4">
                <Avatar size="md" initials={initials} alt={item.nombreCompleto} />
                <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold break-words text-primary">{item.nombreCompleto}</h2>
                    <p className="mt-1 text-xs text-tertiary">
                        {item.tipoDocumento} {item.numeroDocumento}
                    </p>
                </div>
                <CompensacionEstado dominio="personal" valor={item.estadoNombre} />
            </header>
            <section className="mb-5 py-4">
                <h3 className="mb-3 text-sm font-semibold text-primary">Información laboral</h3>
                <dl className="grid gap-4 sm:grid-cols-2">
                    <Field label="Cargo" value={item.asignacion?.cargoNombre || "Sin asignación"} />
                    <Field label="Sede actual" value={item.asignacion?.sucursalNombre || "Sin sede asignada"} />
                    <Field label="Usuario del sistema" value={item.usuarioUsername || "Sin vínculo"} />
                    <Field
                        label="Ingreso"
                        value={
                            item.fechaIngreso ? (
                                <CompensacionFechaCell value={`${item.fechaIngreso.slice(0, 10)}T12:00:00-05:00`} includeTime={false} />
                            ) : (
                                "Sin fecha"
                            )
                        }
                    />
                </dl>
            </section>
            <footer className="mt-auto flex flex-wrap justify-end gap-2 border-t border-secondary pt-4">
                {ficha?.permisos.puedeVerFicha && (readOnly || !ficha.permisos.puedeEditarFicha) && (
                    <Button size="sm" color="secondary" aria-label="Ver ficha" onClick={onDetail}>
                        Ver ficha
                    </Button>
                )}
                {!readOnly && ficha?.permisos.puedeEditarFicha && (
                    <Button size="sm" color="primary" aria-label="Editar colaborador" onClick={onEdit}>
                        Ver / Editar
                    </Button>
                )}
            </footer>
        </motion.article>
    );
};
