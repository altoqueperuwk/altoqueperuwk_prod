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

const normalizeTime = (value: unknown, fallback: string) => {
    const text = String(value ?? "").slice(0, 5);
    return /^\d{2}:\d{2}$/.test(text) ? text : fallback;
};

const normalizeBaseCalculo = (value: unknown) => {
    const normalized = String(value ?? "").trim().toUpperCase();
    return normalized === "CORTE" || normalized === "DEPOSITO" ? normalized : "";
};

const estadoOptions = [
    { value: "1", label: "Activo" },
    { value: "2", label: "Inactivo" },
];

const baseCalculoOptions = [
    { value: "", label: "Seleccionar" },
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
    const defaults = { horaCorte: "", dias: "", horaLiberacion: "", baseCalculo: "" };
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
                    setHoraCorte(normalizeTime(current.hora_corte, defaults.horaCorte));
                    setDiasHabiles(current.dias_habiles_abono == null ? defaults.dias : String(current.dias_habiles_abono));
                    setHoraLiberacion(normalizeTime(current.hora_liberacion, defaults.horaLiberacion));
                    setBaseCalculo(normalizeBaseCalculo(current.base_calculo_abono));
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
    }, [activeCompanyCaja?.id_empresa_cuenta_bancaria, addToast, isOpen, ruta]);

    const handleSave = async () => {
        if (!activeCompanyCaja) {
            addToast("error", "Selecciona una empresa y cuenta activa.");
            return;
        }

        if (!horaCorte || !/^\d{2}:\d{2}$/.test(horaCorte)) {
            addToast("error", "La hora de corte es obligatoria y debe ser valida.");
            return;
        }

        if (!horaLiberacion || !/^\d{2}:\d{2}$/.test(horaLiberacion)) {
            addToast("error", "La hora de liberacion es obligatoria y debe ser valida.");
            return;
        }

        if (diasHabiles.trim() === "") {
            addToast("error", "Los dias habiles de abono son obligatorios.");
            return;
        }

        const dias = Number(diasHabiles);
        if (!Number.isInteger(dias) || dias < 0) {
            addToast("error", "Los dias habiles deben ser un numero valido.");
            return;
        }

        if (!baseCalculo) {
            addToast("error", "Selecciona la base de calculo del abono.");
            return;
        }

        setIsSaving(true);
        try {
            const saved = await operacionesRpcService.patchReglaAbono({
                p_ruta: ruta,
                p_id_empresa: activeCompanyCaja.id_empresa,
                p_id_empresa_cuenta_bancaria: activeCompanyCaja.id_empresa_cuenta_bancaria,
                p_hora_corte: horaCorte,
                p_dias_habiles_abono: dias,
                p_hora_liberacion: horaLiberacion,
                p_base_calculo_abono: baseCalculo,
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
                        <div className="atk-modal-head">
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
                                    placeholder="00:00"
                                    isDisabled={isLoading}
                                    onChange={setHoraCorte}
                                />
                                <Input
                                    label="Dias Habiles Abono"
                                    type="number"
                                    value={diasHabiles}
                                    placeholder="0"
                                    isDisabled={isLoading}
                                    onChange={setDiasHabiles}
                                />
                                <Input
                                    label="Hora Liberacion"
                                    type="time"
                                    value={horaLiberacion}
                                    placeholder="00:00"
                                    isDisabled={isLoading}
                                    onChange={setHoraLiberacion}
                                />
                                <NativeSelect
                                    label="Base de Calculo del Abono"
                                    options={baseCalculoOptions}
                                    value={baseCalculo}
                                    disabled={isLoading}
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
                            <Button
                                color="primary"
                                isLoading={isSaving}
                                isDisabled={!activeCompanyCaja || isLoading || !horaCorte || diasHabiles.trim() === "" || !horaLiberacion || !baseCalculo}
                                onClick={handleSave}
                            >
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
