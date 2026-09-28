import { useEffect, useMemo, useState } from "react";
import { Check, X } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { getCoreEstadoItems } from "@/utils/estado-options";
import { colaboradoresService } from "./colaboradores.service";
import type { CatalogItem, Colaborador, ColaboradorCuentaPago, CuentaPagoFormValues } from "./colaboradores.types";

interface CuentaPagoPopupProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    colaborador: Colaborador;
    cuenta: ColaboradorCuentaPago | null;
    bancos: CatalogItem[];
}

const limaToday = () => {
    const parts = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "America/Lima", year: "numeric" }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
};

export const CuentaPagoPopup = ({ isOpen, onClose, onSave, colaborador, cuenta, bancos }: CuentaPagoPopupProps) => {
    const { estados } = useSessionCache();
    const { addToast } = useToast();
    const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);
    const activoId = Number(estadoItems.find((state) => state.label.toLocaleLowerCase("es-PE") === "activo")?.id ?? 0);
    const [form, setForm] = useState<CuentaPagoFormValues>({
        idBanco: 0,
        tipoCuenta: "AHORROS",
        numeroCuenta: "",
        numeroCci: "",
        titular: "",
        moneda: "PEN",
        esPrincipal: true,
        fechaInicio: limaToday(),
        fechaFin: "",
        idEstado: 0,
    });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setForm({
            idBanco: cuenta?.idBanco ?? 0,
            tipoCuenta: cuenta?.tipoCuenta ?? "AHORROS",
            numeroCuenta: cuenta?.numeroCuenta ?? "",
            numeroCci: cuenta?.numeroCci ?? "",
            titular: cuenta?.titular ?? colaborador.nombreCompleto,
            moneda: cuenta?.moneda ?? "PEN",
            esPrincipal: cuenta?.esPrincipal ?? true,
            fechaInicio: cuenta?.fechaInicio ?? limaToday(),
            fechaFin: cuenta?.fechaFin ?? "",
            idEstado: cuenta?.idEstado ?? activoId,
        });
    }, [activoId, colaborador.nombreCompleto, cuenta, isOpen]);

    const setValue = <K extends keyof CuentaPagoFormValues>(key: K, value: CuentaPagoFormValues[K]) => setForm((state) => ({ ...state, [key]: value }));

    const handleSave = async () => {
        if (!form.idBanco || !form.numeroCuenta.trim() || !form.titular.trim() || !form.fechaInicio)
            return addToast("error", "Banco, cuenta, titular y fecha de inicio son obligatorios");
        if (form.fechaFin && form.fechaFin < form.fechaInicio) return addToast("error", "La fecha fin no puede ser anterior al inicio");
        setIsSaving(true);
        try {
            await colaboradoresService.saveAccount(colaborador.id, form, cuenta?.id);
            addToast("success", cuenta ? "Cuenta actualizada correctamente" : "Cuenta registrada correctamente");
            onSave();
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No fue posible guardar la cuenta");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 bg-overlay/70"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="relative z-10 w-full max-w-xl rounded-xl bg-primary p-6 shadow-xl"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold text-primary">{cuenta ? "Editar cuenta de pago" : "Nueva cuenta de pago"}</h2>
                                <p className="mt-1 text-sm text-tertiary">{colaborador.nombreCompleto}</p>
                            </div>
                            <Button size="xs" color="tertiary" iconLeading={X} aria-label="Cerrar" onClick={onClose} />
                        </div>
                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                            <Select
                                label="Banco"
                                size="sm"
                                isRequired
                                items={bancos.map((bank) => ({ id: bank.id, label: bank.nombre }))}
                                selectedKey={form.idBanco}
                                onSelectionChange={(key) => key !== null && setValue("idBanco", Number(key))}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Select
                                label="Tipo de cuenta"
                                size="sm"
                                items={[
                                    { id: "AHORROS", label: "Ahorros" },
                                    { id: "CORRIENTE", label: "Corriente" },
                                ]}
                                selectedKey={form.tipoCuenta}
                                onSelectionChange={(key) => key !== null && setValue("tipoCuenta", String(key))}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Input
                                label="Número de cuenta"
                                size="sm"
                                isRequired
                                value={form.numeroCuenta}
                                onChange={(value) => setValue("numeroCuenta", value)}
                            />
                            <Input label="CCI" size="sm" value={form.numeroCci} onChange={(value) => setValue("numeroCci", value)} />
                            <Input label="Titular" size="sm" isRequired value={form.titular} onChange={(value) => setValue("titular", value)} />
                            <Select
                                label="Moneda"
                                size="sm"
                                items={[
                                    { id: "PEN", label: "Soles (PEN)" },
                                    { id: "USD", label: "Dólares (USD)" },
                                ]}
                                selectedKey={form.moneda}
                                onSelectionChange={(key) => key !== null && setValue("moneda", String(key))}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Input
                                label="Inicio de vigencia"
                                size="sm"
                                type="date"
                                isRequired
                                value={form.fechaInicio}
                                onChange={(value) => setValue("fechaInicio", value)}
                            />
                            {cuenta && (
                                <Input label="Fin de vigencia" size="sm" type="date" value={form.fechaFin} onChange={(value) => setValue("fechaFin", value)} />
                            )}
                            <div className="sm:col-span-2">
                                <Checkbox
                                    label="Cuenta principal para depósitos"
                                    isSelected={form.esPrincipal}
                                    onChange={(value) => setValue("esPrincipal", value)}
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <Button size="sm" color="secondary" onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={() => void handleSave()}>
                                Guardar cuenta
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
