import { useCallback, useEffect, useState } from "react";
import { Bank, Briefcase02, Edit03, Plus, X } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { useToast } from "@/providers/toast-provider";
import { AsignacionPopup } from "./asignacion-popup";
import { colaboradoresService } from "./colaboradores.service";
import type { CatalogItem, Colaborador, ColaboradorAsignacion, ColaboradorCuentaPago } from "./colaboradores.types";
import { CuentaPagoPopup } from "./cuenta-pago-popup";

interface ColaboradorDetailDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onDataChanged: () => void;
    colaborador: Colaborador | null;
    cargos: CatalogItem[];
    jornadas: CatalogItem[];
    planes: CatalogItem[];
    sucursales: CatalogItem[];
    bancos: CatalogItem[];
}

const dateFormatter = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const formatDate = (value: string | null) => (value ? dateFormatter.format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : "Actualidad");
const humanize = (value: string) =>
    value
        .toLocaleLowerCase("es-PE")
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));

export const ColaboradorDetailDrawer = ({
    isOpen,
    onClose,
    onDataChanged,
    colaborador,
    cargos,
    jornadas,
    planes,
    sucursales,
    bancos,
}: ColaboradorDetailDrawerProps) => {
    const { addToast } = useToast();
    const [assignments, setAssignments] = useState<ColaboradorAsignacion[]>([]);
    const [accounts, setAccounts] = useState<ColaboradorCuentaPago[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<"asignaciones" | "cuentas">("asignaciones");
    const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
    const [isAccountOpen, setIsAccountOpen] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState<ColaboradorCuentaPago | null>(null);

    const loadDetails = useCallback(async () => {
        if (!colaborador) return;
        setIsLoading(true);
        try {
            const [assignmentData, accountData] = await Promise.all([
                colaboradoresService.getAssignments(colaborador.id),
                colaboradoresService.getAccounts(colaborador.id),
            ]);
            setAssignments(assignmentData);
            setAccounts(accountData);
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No fue posible cargar la ficha del colaborador");
        } finally {
            setIsLoading(false);
        }
    }, [addToast, colaborador]);

    useEffect(() => {
        if (isOpen && colaborador) void loadDetails();
        if (!isOpen) {
            setAssignments([]);
            setAccounts([]);
            setActiveTab("asignaciones");
        }
    }, [colaborador, isOpen, loadDetails]);

    if (!colaborador) return null;

    const activeAssignment = assignments.find((assignment) => assignment.esVigente) ?? colaborador.asignacion;
    const currentColaborador = { ...colaborador, asignacion: activeAssignment };

    const handleAssignmentSaved = () => {
        setIsAssignmentOpen(false);
        void loadDetails();
        onDataChanged();
    };
    const handleAccountSaved = () => {
        setIsAccountOpen(false);
        setSelectedAccount(null);
        void loadDetails();
    };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-50 flex justify-end">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="absolute inset-0 bg-overlay/70"
                            onClick={onClose}
                        />
                        <motion.aside
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ type: "spring", damping: 28, stiffness: 240 }}
                            className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-primary shadow-xl"
                        >
                            <div className="border-b border-secondary px-6 py-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-lg font-semibold text-primary">{colaborador.nombreCompleto}</h2>
                                        <p className="mt-1 text-sm text-tertiary">
                                            {colaborador.tipoDocumento} {colaborador.numeroDocumento} · Ingreso {formatDate(colaborador.fechaIngreso)}
                                        </p>
                                    </div>
                                    <Button size="xs" color="tertiary" iconLeading={X} aria-label="Cerrar" onClick={onClose} />
                                </div>
                                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                                    <div className="rounded-lg bg-secondary p-3">
                                        <p className="text-xs text-tertiary">Cargo actual</p>
                                        <p className="mt-1 text-sm font-medium text-primary">{activeAssignment?.cargoNombre || "Sin asignación"}</p>
                                    </div>
                                    <div className="rounded-lg bg-secondary p-3">
                                        <p className="text-xs text-tertiary">Sede</p>
                                        <p className="mt-1 text-sm font-medium text-primary">{activeAssignment?.sucursalNombre || "—"}</p>
                                    </div>
                                    <div className="rounded-lg bg-secondary p-3">
                                        <p className="text-xs text-tertiary">Plan</p>
                                        <p className="mt-1 text-sm font-medium text-primary">{activeAssignment?.planNombre || "—"}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-1 border-b border-secondary px-6 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("asignaciones")}
                                    className={`border-b-2 px-3 py-2 text-sm font-medium transition duration-100 ${activeTab === "asignaciones" ? "border-brand text-brand-secondary" : "border-transparent text-tertiary hover:text-secondary"}`}
                                >
                                    Asignaciones ({assignments.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("cuentas")}
                                    className={`border-b-2 px-3 py-2 text-sm font-medium transition duration-100 ${activeTab === "cuentas" ? "border-brand text-brand-secondary" : "border-transparent text-tertiary hover:text-secondary"}`}
                                >
                                    Cuentas de pago ({accounts.length})
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6">
                                {isLoading ? (
                                    <div className="flex h-48 items-center justify-center text-sm text-tertiary">Cargando ficha laboral...</div>
                                ) : activeTab === "asignaciones" ? (
                                    <div>
                                        <div className="mb-5 flex items-center justify-between gap-3">
                                            <div>
                                                <h3 className="text-sm font-semibold text-primary">Historial laboral</h3>
                                                <p className="mt-1 text-xs text-tertiary">Cada cambio conserva su propia vigencia.</p>
                                            </div>
                                            <Button size="sm" color="primary" iconLeading={Plus} onClick={() => setIsAssignmentOpen(true)}>
                                                Cambiar asignación
                                            </Button>
                                        </div>
                                        {assignments.length === 0 ? (
                                            <p className="rounded-lg bg-secondary p-6 text-center text-sm text-tertiary">
                                                No existen asignaciones registradas.
                                            </p>
                                        ) : (
                                            <div className="space-y-3">
                                                {assignments.map((assignment) => (
                                                    <motion.article
                                                        key={assignment.id}
                                                        initial={{ opacity: 0, y: 6 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="rounded-xl border border-secondary p-4"
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="flex items-center gap-3">
                                                                <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-fg-quaternary">
                                                                    <Briefcase02 className="size-5" />
                                                                </span>
                                                                <div>
                                                                    <p className="text-sm font-semibold text-primary">{assignment.cargoNombre}</p>
                                                                    <p className="mt-0.5 text-xs text-tertiary">
                                                                        {assignment.sucursalNombre} · {assignment.jornadaNombre}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            {assignment.esVigente && (
                                                                <Badge color="success" size="sm">
                                                                    Vigente
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <dl className="mt-4 grid gap-3 border-t border-secondary pt-4 sm:grid-cols-2">
                                                            <div>
                                                                <dt className="text-xs text-tertiary">Plan</dt>
                                                                <dd className="mt-1 text-sm font-medium text-primary">{assignment.planNombre}</dd>
                                                            </div>
                                                            <div>
                                                                <dt className="text-xs text-tertiary">Vigencia</dt>
                                                                <dd className="mt-1 text-sm text-secondary">
                                                                    {formatDate(assignment.fechaInicio)} – {formatDate(assignment.fechaFin)}
                                                                </dd>
                                                            </div>
                                                            <div>
                                                                <dt className="text-xs text-tertiary">Modalidad</dt>
                                                                <dd className="mt-1 text-sm text-secondary">{humanize(assignment.modalidad)}</dd>
                                                            </div>
                                                            {assignment.observacion && (
                                                                <div>
                                                                    <dt className="text-xs text-tertiary">Observación</dt>
                                                                    <dd className="mt-1 text-sm text-secondary">{assignment.observacion}</dd>
                                                                </div>
                                                            )}
                                                        </dl>
                                                    </motion.article>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div>
                                        <div className="mb-5 flex items-center justify-between gap-3">
                                            <div>
                                                <h3 className="text-sm font-semibold text-primary">Cuentas para depósito</h3>
                                                <p className="mt-1 text-xs text-tertiary">Los números se muestran enmascarados según permisos.</p>
                                            </div>
                                            <Button
                                                size="sm"
                                                color="primary"
                                                iconLeading={Plus}
                                                onClick={() => {
                                                    setSelectedAccount(null);
                                                    setIsAccountOpen(true);
                                                }}
                                            >
                                                Nueva cuenta
                                            </Button>
                                        </div>
                                        {accounts.length === 0 ? (
                                            <p className="rounded-lg bg-secondary p-6 text-center text-sm text-tertiary">
                                                No existen cuentas de pago registradas.
                                            </p>
                                        ) : (
                                            <div className="space-y-3">
                                                {accounts.map((account) => (
                                                    <motion.article
                                                        key={account.id}
                                                        initial={{ opacity: 0, y: 6 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="rounded-xl border border-secondary p-4"
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="flex items-center gap-3">
                                                                <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-fg-quaternary">
                                                                    <Bank className="size-5" />
                                                                </span>
                                                                <div>
                                                                    <p className="text-sm font-semibold text-primary">
                                                                        {account.bancoNombre} · {humanize(account.tipoCuenta)}
                                                                    </p>
                                                                    <p className="mt-0.5 text-xs font-medium text-secondary tabular-nums">
                                                                        {account.numeroCuenta}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {account.esPrincipal && (
                                                                    <Badge color="brand" size="sm">
                                                                        Principal
                                                                    </Badge>
                                                                )}
                                                                <Button
                                                                    size="xs"
                                                                    color="tertiary"
                                                                    iconLeading={Edit03}
                                                                    aria-label="Editar cuenta"
                                                                    onClick={() => {
                                                                        setSelectedAccount(account);
                                                                        setIsAccountOpen(true);
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-secondary pt-4 text-xs text-tertiary">
                                                            <span>Titular: {account.titular}</span>
                                                            <span>
                                                                {account.moneda} · {formatDate(account.fechaInicio)} – {formatDate(account.fechaFin)}
                                                            </span>
                                                        </div>
                                                    </motion.article>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.aside>
                    </div>
                )}
            </AnimatePresence>

            <AsignacionPopup
                isOpen={isAssignmentOpen}
                onClose={() => setIsAssignmentOpen(false)}
                onSave={handleAssignmentSaved}
                colaborador={currentColaborador}
                cargos={cargos}
                jornadas={jornadas}
                planes={planes}
                sucursales={sucursales}
            />
            <CuentaPagoPopup
                isOpen={isAccountOpen}
                onClose={() => {
                    setIsAccountOpen(false);
                    setSelectedAccount(null);
                }}
                onSave={handleAccountSaved}
                colaborador={colaborador}
                cuenta={selectedAccount}
                bancos={bancos}
            />
        </>
    );
};
