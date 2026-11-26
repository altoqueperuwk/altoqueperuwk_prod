import { useEffect, useMemo, useState } from "react";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type {
    OperacionProceso,
    OperacionRutaBancaria,
    RutaOperacionCaja,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { bancariaRouteKeys, getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { pagoDeudaService } from "@/features/operaciones/pago-deuda/services/pago-deuda.service";

type PagoDeudaAction = "Transferencia" | "Match" | "Comision";

interface PagoDeudaActionModalProps {
    action: PagoDeudaAction | null;
    isOpen: boolean;
    isSaving: boolean;
    onClose: () => void;
    onSubmit: (value: string, extraValue?: string, selectedCompany?: RutaOperacionCaja) => void;
    selectedId?: number | null;
    selectedCount: number;
}

export const PagoDeudaActionModal = ({
    action,
    isOpen,
    isSaving,
    onClose,
    onSubmit,
    selectedId,
    selectedCount,
}: PagoDeudaActionModalProps) => {
    const [routeValue, setRouteValue] = useState<OperacionRutaBancaria>("bcp");
    const [companyValue, setCompanyValue] = useState("");
    const [matchValue, setMatchValue] = useState("");
    const [amountValue, setAmountValue] = useState("");
    const [companies, setCompanies] = useState<RutaOperacionCaja[]>([]);
    const [matches, setMatches] = useState<OperacionProceso[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setCompanyValue("");
            setMatchValue("");
            setAmountValue("");
            setCompanies([]);
            setMatches([]);
            setError(null);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || action !== "Transferencia") return;

        let ignore = false;
        setError(null);
        setIsLoading(true);

        operacionesRpcService
            .getRutaCajas(routeValue)
            .then((rows) => {
                if (ignore) return;
                setCompanies(rows ?? []);
                setCompanyValue(rows?.[0] ? String(rows[0].id) : "");
            })
            .catch((err) => {
                if (!ignore) setError(err instanceof Error ? err.message : "No se pudo cargar empresas de salida.");
            })
            .finally(() => {
                if (!ignore) setIsLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [action, isOpen, routeValue]);

    useEffect(() => {
        if (!isOpen || action !== "Match" || !selectedId) return;

        let ignore = false;
        setError(null);
        setIsLoading(true);

        pagoDeudaService
            .getMatches({ p_id_operacion_pago_deuda: selectedId })
            .then((rows) => {
                if (ignore) return;
                setMatches(rows ?? []);
                setMatchValue(rows?.[0] ? String(rows[0].id) : "");
            })
            .catch((err) => {
                if (!ignore) setError(err instanceof Error ? err.message : "No se pudo cargar candidatos de match.");
            })
            .finally(() => {
                if (!ignore) setIsLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [action, isOpen, selectedId]);

    const companyOptions = companies.map((company) => ({
        label: `${company.nombre_empresa} - ${company.nombre_banco}`,
        value: String(company.id),
    }));
    const matchOptions = matches.map((item) => ({
        label: `${item.codigo_operacion_deposito_cliente ?? item.id} - ${item.dni_cliente ?? ""} - ${formatMoney(item.monto_deposito_cliente)}`,
        value: String(item.id),
    }));
    const canSubmit = useMemo(() => {
        if (isLoading || isSaving) return false;
        if (action === "Transferencia") return Boolean(companyValue);
        if (action === "Match") return Boolean(matchValue);
        if (action === "Comision") return Number(amountValue) > 0;
        return false;
    }, [action, amountValue, companyValue, isLoading, isSaving, matchValue]);

    return (
        <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Modal className="max-w-md">
                <Dialog>
                    <div className="w-full rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                        <div className="atk-modal-head">
                            <h2 className="text-lg font-semibold text-primary">{action}</h2>
                            <p className="mt-1 text-sm text-tertiary">
                                {selectedCount} solicitud(es) seleccionada(s)
                            </p>
                        </div>

                        <div className="mt-5 grid gap-4">
                            {action === "Transferencia" && (
                                <>
                                    <NativeSelect
                                        size="sm"
                                        label="Ruta destino"
                                        value={routeValue}
                                        onChange={(event) => setRouteValue(event.currentTarget.value as OperacionRutaBancaria)}
                                        options={bancariaRouteKeys.map((route) => ({ label: getRutaLabel(route), value: route }))}
                                    />
                                    <NativeSelect
                                        size="sm"
                                        label="Empresa y cuenta"
                                        value={companyValue}
                                        onChange={(event) => setCompanyValue(event.currentTarget.value)}
                                        options={companyOptions}
                                    />
                                </>
                            )}

                            {action === "Comision" && (
                                <Input
                                    size="sm"
                                    label="Monto comision"
                                    type="number"
                                    value={amountValue}
                                    onChange={setAmountValue}
                                />
                            )}

                            {action === "Match" && (
                                <NativeSelect
                                    size="sm"
                                    label="Operacion de efectivizacion"
                                    value={matchValue}
                                    onChange={(event) => setMatchValue(event.currentTarget.value)}
                                    options={matchOptions}
                                />
                            )}

                            {isLoading && <p className="text-sm text-tertiary">Cargando opciones...</p>}
                            {error && <p className="text-sm text-error-primary">{error}</p>}
                            {!isLoading && action === "Match" && !matchOptions.length && (
                                <p className="text-sm text-tertiary">Sin candidatos compatibles para esta solicitud.</p>
                            )}
                            {!isLoading && action === "Transferencia" && !companyOptions.length && (
                                <p className="text-sm text-tertiary">Sin empresas configuradas para la ruta seleccionada.</p>
                            )}
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <Button color="secondary" isDisabled={isSaving} onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button
                                isDisabled={!canSubmit}
                                isLoading={isSaving}
                                onClick={() => {
                                    if (action === "Transferencia") onSubmit(
                                        companyValue,
                                        routeValue,
                                        companies.find((company) => String(company.id) === companyValue),
                                    );
                                    if (action === "Match") onSubmit(matchValue);
                                    if (action === "Comision") onSubmit(amountValue);
                                }}
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
