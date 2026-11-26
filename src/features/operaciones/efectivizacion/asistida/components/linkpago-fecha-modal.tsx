import { useEffect, useState } from "react";
import { Calendar as CalendarIcon, Check, X } from "@untitledui/icons";
import { CalendarDate, type DateValue } from "@internationalized/date";
import { Calendar } from "@/components/application/date-picker/calendar";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatDateValue, getPeruDateValue } from "@/features/operaciones/efectivizacion/shared/utils/date";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";

interface LinkPagoFechaModalProps {
    isOpen: boolean;
    operation: OperacionProceso | null;
    onClose: () => void;
    onSaved: () => void;
}

const stringToCalendarDate = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new CalendarDate(year, month, day);
};

export const LinkPagoFechaModal = ({ isOpen, operation, onClose, onSaved }: LinkPagoFechaModalProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [selectedDate, setSelectedDate] = useState(getPeruDateValue);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isOpen || !operation) return;
        const parsedDate = operation.fecha_registro ? new Date(operation.fecha_registro) : new Date();
        setSelectedDate(Number.isNaN(parsedDate.getTime()) ? getPeruDateValue() : getPeruDateValue(parsedDate));
        setIsCalendarOpen(false);
    }, [isOpen, operation]);

    const handleSave = async () => {
        if (!operation) return;
        setIsSaving(true);
        try {
            const result = await operacionesRpcService.patchOperacionAsistidaFechaDeposito({
                p_id: operation.id,
                p_fecha_deposito_cliente: selectedDate,
                p_id_usuario: businessUser?.id ? Number(businessUser.id) : null,
            });

            if (result && "error" in result) {
                throw new Error(String((result as Record<string, unknown>).error));
            }

            onClose();
            onSaved();
            addToast("success", "Fecha de registro actualizada correctamente.");
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No se pudo actualizar la fecha de registro.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDateChange = (date: DateValue) => {
        setSelectedDate(`${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`);
        setIsCalendarOpen(false);
    };

    return (
        <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Modal className="max-w-md">
                <Dialog>
                    <div className="flex flex-col gap-5 rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                        <div className="atk-modal-head">
                            <h2 className="text-lg font-semibold text-primary">Fecha de registro</h2>
                            <p className="mt-1 text-sm text-tertiary">Actualiza la fecha de registro de la operacion.</p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <Input size="sm" label="DNI" value={operation?.dni_cliente ?? ""} isDisabled />
                            <Input size="sm" label="Nombre" value={operation?.nombre_cliente ?? ""} isDisabled />
                            <Input size="sm" label="Monto Deposito" value={formatMoney(operation?.monto_deposito_cliente)} isDisabled />
                            <div className="relative">
                                <label className="text-sm font-medium text-primary">Fecha Registro</label>
                                <Button
                                    size="sm"
                                    color="secondary"
                                    iconLeading={CalendarIcon}
                                    onClick={() => setIsCalendarOpen((current) => !current)}
                                    className="mt-2 w-full justify-start"
                                >
                                    {formatDateValue(selectedDate)}
                                </Button>
                                {isCalendarOpen && (
                                    <div className="absolute bottom-full right-0 z-50 mb-2 rounded-lg border border-secondary bg-primary p-3 shadow-lg">
                                        <Calendar value={stringToCalendarDate(selectedDate)} onChange={handleDateChange}>
                                            <div />
                                        </Calendar>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button color="secondary" iconLeading={X} isDisabled={isSaving} onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button color="primary" iconLeading={Check} isLoading={isSaving} onClick={() => void handleSave()}>
                                Guardar
                            </Button>
                        </div>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
};
