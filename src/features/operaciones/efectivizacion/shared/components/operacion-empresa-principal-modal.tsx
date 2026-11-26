import { useCallback, useEffect, useMemo, useState } from "react";
import { Save01 } from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Toggle } from "@/components/base/toggle/toggle";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { OperacionRutaBancaria, RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";

interface OperacionEmpresaPrincipalModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved?: () => void;
    ruta: OperacionRutaBancaria;
}

interface EmpresaPrincipalRow {
    idEmpresa: number;
    nombreEmpresa: string;
    idRutaOperacionCaja: number;
    isPrincipal: boolean;
}

const groupByEmpresa = (associations: RutaOperacionCaja[]) => {
    const grouped = new Map<number, RutaOperacionCaja[]>();

    associations
        .filter((association) => Number(association.id_estado) === 1)
        .forEach((association) => {
            const current = grouped.get(Number(association.id_empresa)) ?? [];
            current.push(association);
            grouped.set(Number(association.id_empresa), current);
        });

    return Array.from(grouped.values())
        .map((companyAssociations) => {
            const representative = [...companyAssociations]
                .sort((left, right) => {
                    if (left.flag_caja_ingreso_principal !== right.flag_caja_ingreso_principal) {
                        return left.flag_caja_ingreso_principal ? -1 : 1;
                    }
                    return Number(left.id) - Number(right.id);
                })[0];

            return {
                idEmpresa: Number(representative.id_empresa),
                nombreEmpresa: representative.nombre_empresa,
                idRutaOperacionCaja: Number(representative.id),
                isPrincipal: Boolean(companyAssociations.some((association) => association.flag_caja_ingreso_principal)),
            } satisfies EmpresaPrincipalRow;
        })
        .sort((left, right) => left.nombreEmpresa.localeCompare(right.nombreEmpresa, "es"));
};

export const OperacionEmpresaPrincipalModal = ({ isOpen, onClose, onSaved, ruta }: OperacionEmpresaPrincipalModalProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [rows, setRows] = useState<EmpresaPrincipalRow[]>([]);
    const [draftPrincipalCompanyId, setDraftPrincipalCompanyId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [savingCompanyId, setSavingCompanyId] = useState<number | null>(null);

    const loadRows = useCallback(async () => {
        setIsLoading(true);
        try {
            const associations = await operacionesRpcService.getRutaCajas(ruta);
            const nextRows = groupByEmpresa(associations ?? []);
            const persistedPrincipal = nextRows.find((row) => row.isPrincipal)?.idEmpresa ?? null;
            setRows(nextRows);
            setDraftPrincipalCompanyId(persistedPrincipal ?? nextRows[0]?.idEmpresa ?? null);
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No se pudieron cargar las empresas principales.");
            setRows([]);
            setDraftPrincipalCompanyId(null);
        } finally {
            setIsLoading(false);
        }
    }, [addToast, ruta]);

    useEffect(() => {
        if (!isOpen) return;
        void loadRows();
    }, [isOpen, loadRows]);

    const persistedPrincipalCompanyId = useMemo(
        () => rows.find((row) => row.isPrincipal)?.idEmpresa ?? null,
        [rows],
    );

    const handleToggle = (companyId: number, isSelected: boolean) => {
        if (!isSelected && draftPrincipalCompanyId === companyId) {
            addToast("error", "Debe existir una empresa principal activa para la ruta.");
            return;
        }

        if (isSelected) setDraftPrincipalCompanyId(companyId);
    };

    const handleSave = async (row: EmpresaPrincipalRow) => {
        if (draftPrincipalCompanyId !== row.idEmpresa) {
            addToast("error", "Activa esta empresa antes de guardar el cambio.");
            return;
        }

        if (persistedPrincipalCompanyId === row.idEmpresa) {
            return;
        }

        setSavingCompanyId(row.idEmpresa);
        try {
            await operacionesRpcService.patchRutaOperacionCajaPrincipal({
                p_id_ruta_operacion_caja: row.idRutaOperacionCaja,
                p_id_usuario: businessUser?.id ? Number(businessUser.id) : null,
            });
            addToast("success", `${row.nombreEmpresa} ahora es la empresa principal de ${getRutaLabel(ruta)}.`);
            await loadRows();
            onSaved?.();
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No se pudo guardar la empresa principal.");
        } finally {
            setSavingCompanyId(null);
        }
    };

    return (
        <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable>
            <Modal className="w-full max-w-2xl">
                <Dialog>
                    <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                        <div className="atk-modal-head flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold text-primary">Empresa Principal</h2>
                                <p className="mt-1 text-sm text-tertiary">
                                    Selecciona la empresa principal para la ruta {getRutaLabel(ruta)}.
                                </p>
                            </div>
                            <Button size="sm" color="tertiary" onClick={onClose}>Cerrar</Button>
                        </div>

                        <div className="mt-5 overflow-hidden rounded-lg border border-secondary">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[520px] text-left text-sm">
                                    <thead className="border-b border-secondary bg-secondary text-xs font-semibold uppercase tracking-wide text-tertiary">
                                        <tr>
                                            <th className="px-4 py-3">Empresa</th>
                                            <th className="px-4 py-3 text-center">Principal</th>
                                            <th className="px-4 py-3 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-secondary">
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-10 text-center text-tertiary">Cargando empresas...</td>
                                            </tr>
                                        ) : rows.length === 0 ? (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-10 text-center text-tertiary">No hay empresas asociadas a esta ruta.</td>
                                            </tr>
                                        ) : rows.map((row) => {
                                            const isSaving = savingCompanyId === row.idEmpresa;
                                            const hasChanges = draftPrincipalCompanyId !== persistedPrincipalCompanyId;
                                            return (
                                                <tr key={row.idEmpresa} className="transition duration-100 ease-linear hover:bg-primary_hover">
                                                    <td className="px-4 py-3 font-medium text-primary">{row.nombreEmpresa}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex justify-center">
                                                            <Toggle
                                                                aria-label={`Empresa principal ${row.nombreEmpresa}`}
                                                                isSelected={draftPrincipalCompanyId === row.idEmpresa}
                                                                isDisabled={isSaving || isLoading}
                                                                onChange={(isSelected) => handleToggle(row.idEmpresa, isSelected)}
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex justify-end gap-2">
                                                            <Button
                                                                size="xs"
                                                                color={hasChanges && draftPrincipalCompanyId === row.idEmpresa ? "primary" : "tertiary"}
                                                                iconLeading={Save01}
                                                                aria-label={`Guardar empresa principal ${row.nombreEmpresa}`}
                                                                title="Guardar empresa principal"
                                                                isDisabled={!hasChanges || draftPrincipalCompanyId !== row.idEmpresa || isSaving}
                                                                isLoading={isSaving}
                                                                onClick={() => void handleSave(row)}
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="mt-4 rounded-lg border border-secondary bg-secondary px-4 py-3 text-xs text-tertiary">
                            Solo una empresa activa puede ser principal por ruta, ejemplo: /operaciones/bcp solo puede tener una empresa principal activa, si se activa otra empresa, la anterior dejará de ser principal. En esta empresa principal llegaran las solicitudes de POS y Pagos de Deuda.
                        </div>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
};
