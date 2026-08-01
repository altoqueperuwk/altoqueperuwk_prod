import { useEffect, useMemo, useState } from "react";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { OperacionRutaBancaria, RecaudacionReglaAbono, RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";

interface OperacionReglasAbonoModalProps {
    activeCompanyCaja: RutaOperacionCaja | null;
    isOpen: boolean;
    onClose: () => void;
    onSaved?: () => void;
    ruta: OperacionRutaBancaria;
}

const routeDefaults: Partial<Record<OperacionRutaBancaria, { horaCorte: string; dias: string; horaLiberacion: string; baseCalculo: string }>> = {
    bcp: { horaCorte: "00:00", dias: "0", horaLiberacion: "00:00", baseCalculo: "CORTE" },
    scotiabank: { horaCorte: "21:00", dias: "1", horaLiberacion: "21:00", baseCalculo: "CORTE" },
    banbif: { horaCorte: "21:00", dias: "1", horaLiberacion: "21:00", baseCalculo: "CORTE" },
    safetypay: { horaCorte: "00:00", dias: "2", horaLiberacion: "14:00", baseCalculo: "DEPOSITO" },
};

const normalizeTime = (value: unknown, fallback: string) => {
    const text = String(value ?? "").slice(0, 5);
    return /^\d{2}:\d{2}$/.test(text) ? text : fallback;
};

const estadoOptions = [
    { value: "1", label: "Activo" },
    { value: "2", label: "Inactivo" },
];

const baseCalculoOptions = [
    { value: "DEPOSITO", label: "Deposito (dia del deposito)" },
    { value: "CORTE", label: "Corte (fecha del corte)" },
];

export const OperacionReglasAbonoModal = ({
    activeCompanyCaja,
    isOpen,
    onClose,
    onSaved,
    ruta,
}: OperacionReglasAbonoModalProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const defaults = routeDefaults[ruta] ?? { horaCorte: "00:00", dias: "1", horaLiberacion: "00:00", baseCalculo: "DEPOSITO" };
    const isBcp = ruta === "bcp";
    const [rule, setRule] = useState<RecaudacionReglaAbono | null>(null);
    const [horaCorte, setHoraCorte] = useState(defaults.horaCorte);
    const [diasHabiles, setDiasHabiles] = useState(defaults.dias);
    const [horaLiberacion, setHoraLiberacion] = useState(defaults.horaLiberacion);
    const [baseCalculo, setBaseCalculo] = useState(defaults.baseCalculo);
    const [liberacionAutomatica, setLiberacionAutomatica] = useState(false);
    const [estado, setEstado] = useState("1");
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const title = useMemo(() => {
        if (!activeCompanyCaja) return getRutaLabel(ruta);
        return `${activeCompanyCaja.nombre_empresa} - ${activeCompanyCaja.nombre_banco}`;
    }, [activeCompanyCaja, ruta]);

    useEffect(() => {
        if (!isOpen) return;

        setRule(null);
        setHoraCorte(defaults.horaCorte);
        setDiasHabiles(defaults.dias);
        setHoraLiberacion(defaults.horaLiberacion);
        setBaseCalculo(defaults.baseCalculo);
        setLiberacionAutomatica(false);
        setEstado("1");

        if (!activeCompanyCaja?.id_empresa_cuenta_bancaria) return;

        let ignore = false;
        setIsLoading(true);
        operacionesRpcService
            .getReglaAbono({
                p_ruta: ruta,
                p_id_empresa_cuenta_bancaria: activeCompanyCaja.id_empresa_cuenta_bancaria,
            })
            .then((rows) => {
                if (ignore) return;
                const current = rows?.[0] ?? null;
                setRule(current);
                if (current) {
                    setHoraCorte(isBcp ? "00:00" : normalizeTime(current.hora_corte, defaults.horaCorte));
                    setDiasHabiles(isBcp ? "0" : String(current.dias_habiles_abono ?? defaults.dias));
                    setHoraLiberacion(isBcp ? "00:00" : normalizeTime(current.hora_liberacion, defaults.horaLiberacion));
                    setBaseCalculo(isBcp ? "CORTE" : String(current.base_calculo_abono ?? defaults.baseCalculo));
                    setLiberacionAutomatica(Boolean(current.flag_liberacion_automatica));
                    setEstado(String(current.id_estado ?? 1));
                }
            })
            .catch((err) => addToast("error", err instanceof Error ? err.message : "Error al cargar regla de abono."))
            .finally(() => {
                if (!ignore) setIsLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [activeCompanyCaja?.id_empresa_cuenta_bancaria, addToast, defaults.dias, defaults.horaCorte, defaults.horaLiberacion, isBcp, isOpen, ruta]);

    const handleSave = async () => {
        if (!activeCompanyCaja) {
            addToast("error", "Selecciona una empresa y cuenta activa.");
            return;
        }

        const dias = isBcp ? 0 : Number(diasHabiles);
        if (!Number.isFinite(dias) || dias < 0) {
            addToast("error", "Los dias habiles deben ser un numero valido.");
            return;
        }

        setIsSaving(true);
        try {
            const saved = await operacionesRpcService.patchReglaAbono({
                p_ruta: ruta,
                p_id_empresa: activeCompanyCaja.id_empresa,
                p_id_empresa_cuenta_bancaria: activeCompanyCaja.id_empresa_cuenta_bancaria,
                p_hora_corte: isBcp ? "00:00" : horaCorte,
                p_dias_habiles_abono: dias,
                p_hora_liberacion: isBcp ? "00:00" : horaLiberacion,
                p_base_calculo_abono: isBcp ? "CORTE" : baseCalculo,
                p_flag_liberacion_automatica: liberacionAutomatica,
                p_id_estado: Number(estado),
                p_id_usuario: businessUser?.id ? Number(businessUser.id) : null,
            });
            setRule(saved);
            addToast("success", "Regla de abono guardada.");
            onSaved?.();
            onClose();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo guardar la regla de abono.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable>
            <Modal className="w-full max-w-xl">
                <Dialog>
                    <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                        <div className="flex flex-col gap-5">
                        <div>
                            <h2 className="text-lg font-semibold text-primary">Reglas de Abono</h2>
                            <p className="mt-1 text-sm text-tertiary">{title}</p>
                        </div>

                        {!activeCompanyCaja ? (
                            <div className="rounded-lg border border-secondary bg-secondary px-4 py-8 text-center text-sm text-tertiary">
                                Selecciona una empresa y cuenta para configurar abonos.
                            </div>
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Input
                                    label="Hora Corte"
                                    type="time"
                                    value={horaCorte}
                                    isDisabled={isLoading || isBcp}
                                    onChange={setHoraCorte}
                                />
                                <Input
                                    label="Dias Habiles Abono"
                                    type="number"
                                    min={0}
                                    value={diasHabiles}
                                    isDisabled={isLoading || isBcp}
                                    onChange={setDiasHabiles}
                                />
                                <Input
                                    label="Hora Liberacion"
                                    type="time"
                                    value={horaLiberacion}
                                    isDisabled={isLoading || isBcp}
                                    onChange={setHoraLiberacion}
                                />
                                <NativeSelect
                                    label="Base de Calculo del Abono"
                                    options={baseCalculoOptions}
                                    value={baseCalculo}
                                    disabled={isLoading || isBcp}
                                    onChange={(event) => setBaseCalculo(event.target.value)}
                                />
                                <NativeSelect
                                    label="Estado"
                                    options={estadoOptions}
                                    value={estado}
                                    disabled={isLoading}
                                    onChange={(event) => setEstado(event.target.value)}
                                />
                                <div className="sm:col-span-2">
                                    <Checkbox
                                        label="Liberacion Automatica"
                                        isSelected={liberacionAutomatica}
                                        isDisabled={isLoading}
                                        onChange={setLiberacionAutomatica}
                                    />
                                </div>
                            </div>
                        )}

                        {rule ? (
                            <div className="rounded-lg border border-secondary bg-secondary px-4 py-3 text-xs text-tertiary">
                                Regla activa actualizada por ultima vez: {rule.fecha_actualizacion ? new Date(rule.fecha_actualizacion).toLocaleString("es-PE") : "-"}
                            </div>
                        ) : null}

                        <div className="flex justify-end gap-3 border-t border-secondary pt-4">
                            <Button color="secondary" onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button color="primary" isLoading={isSaving} isDisabled={!activeCompanyCaja || isLoading} onClick={handleSave}>
                                Guardar
                            </Button>
                        </div>
                        </div>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
};
