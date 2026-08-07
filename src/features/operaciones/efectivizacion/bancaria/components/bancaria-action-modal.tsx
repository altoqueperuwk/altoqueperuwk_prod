import { useEffect, useState } from "react";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { usuarioService } from "@/services/usuario.service";
import { bancariaRouteKeys, getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import type { OperacionRuta, RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

type ActionType = "Derivar" | "Emp. Ingreso" | "Emp. Salida" | "Reasignar" | "Transferencia" | "Modalidad";

export interface BancariaBankDestination {
    id: number;
    nombre: string;
    ruta: string;
}

interface UserOption {
    id: number;
    nombre: string;
}

interface BancariaActionModalProps {
    action: ActionType | null;
    companies: RutaOperacionCaja[];
    currentRuta: OperacionRuta;
    bankDestinations?: BancariaBankDestination[];
    deriveByBank?: boolean;
    isOpen: boolean;
    isSaving: boolean;
    onClose: () => void;
    onSubmit: (value: string, label: string) => void;
    selectedCount: number;
}

export const BancariaActionModal = ({
    action,
    companies,
    currentRuta,
    bankDestinations = [],
    deriveByBank = false,
    isOpen,
    isSaving,
    onClose,
    onSubmit,
    selectedCount,
}: BancariaActionModalProps) => {
    const [value, setValue] = useState("");
    const [users, setUsers] = useState<UserOption[]>([]);

    useEffect(() => {
        if (!isOpen) return;

        if (action === "Derivar") {
            if (deriveByBank) {
                setValue(bankDestinations[0] ? String(bankDestinations[0].id) : "");
            } else {
                const firstRoute = bancariaRouteKeys.find((route) => route !== currentRuta);
                setValue(firstRoute ?? "");
            }
            return;
        }

        if (action === "Emp. Ingreso" || action === "Emp. Salida" || action === "Transferencia") {
            setValue(companies[0] ? String(companies[0].id) : "");
            return;
        }

        if (action === "Modalidad") {
            setValue("Automatico");
            return;
        }

        if (action === "Reasignar") {
            let ignore = false;
            usuarioService.getList({ p_id_estado: 1 }).then((rows) => {
                if (ignore) return;
                const options = rows.map((row) => ({
                    id: Number(row.id),
                    nombre: String(row.nombre ?? row.username ?? ""),
                }));
                setUsers(options);
                setValue(options[0] ? String(options[0].id) : "");
            });

            return () => {
                ignore = true;
            };
        }
    }, [action, bankDestinations, companies, currentRuta, deriveByBank, isOpen]);

    const options =
        action === "Derivar" && deriveByBank
            ? bankDestinations.map((bank) => ({ label: `${bank.nombre} - ${getRutaLabel(bank.ruta as OperacionRuta)}`, value: String(bank.id) }))
        : action === "Derivar"
            ? bancariaRouteKeys
                  .filter((route) => route !== currentRuta)
                  .map((route) => ({ label: getRutaLabel(route), value: route }))
            : action === "Emp. Ingreso" || action === "Emp. Salida" || action === "Transferencia"
              ? companies.map((company) => ({
                    label: `${company.nombre_empresa} - ${company.nombre_banco}`,
                    value: String(company.id),
                }))
              : action === "Modalidad"
                ? [
                    { label: "Automatico", value: "Automatico" },
                    { label: "Manual", value: "Manual" },
                ]
              : users.map((user) => ({ label: user.nombre, value: String(user.id) }));

    return (
        <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Modal className="max-w-md">
                <Dialog>
                    <div className="w-full rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                        <div>
                            <h2 className="text-lg font-semibold text-primary">{action}</h2>
                            <p className="mt-1 text-sm text-tertiary">
                                {selectedCount} operacion(es) seleccionada(s)
                            </p>
                        </div>

                        <div className="mt-5">
                            <NativeSelect
                                size="sm"
                                label={
                                    action === "Derivar"
                                        ? deriveByBank ? "Banco destino" : "Ruta destino"
                                        : action === "Emp. Ingreso" || action === "Emp. Salida" || action === "Transferencia"
                                          ? "Empresa y cuenta"
                                          : action === "Modalidad"
                                            ? "Modalidad"
                                            : "Usuario gestor"
                                }
                                value={value}
                                onChange={(event) => setValue(event.currentTarget.value)}
                                options={options}
                            />
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <Button color="secondary" isDisabled={isSaving} onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button
                                isDisabled={!value}
                                isLoading={isSaving}
                                onClick={() => onSubmit(value, options.find((option) => option.value === value)?.label ?? "")}
                            >
                                Aplicar
                            </Button>
                        </div>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
};
