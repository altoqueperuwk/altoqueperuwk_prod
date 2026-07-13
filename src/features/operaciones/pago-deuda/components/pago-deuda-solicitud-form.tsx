import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { bancoService } from "@/services/banco.service";
import { InlineFormCard } from "@/features/operaciones/efectivizacion/shared/components/inline-form-card";
import { pagoDeudaService } from "@/features/operaciones/pago-deuda/services/pago-deuda.service";

interface PagoDeudaSolicitudFormProps {
    onSaved: () => void;
}

interface BancoItem {
    id: number;
    nombre: string;
}

export const PagoDeudaSolicitudForm = ({ onSaved }: PagoDeudaSolicitudFormProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [dni, setDni] = useState("");
    const [nombre, setNombre] = useState("");
    const [celular, setCelular] = useState("");
    const [monto, setMonto] = useState("");
    const [bancoId, setBancoId] = useState("");
    const [bancos, setBancos] = useState<BancoItem[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const selectedBanco = useMemo(() => bancos.find((item) => String(item.id) === bancoId) ?? null, [bancoId, bancos]);
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;

    useEffect(() => {
        let ignore = false;

        bancoService
            .getList({ p_id_estado: 1 })
            .then((rows) => {
                if (ignore) return;
                const items = rows.map((row) => ({
                    id: Number(row.id),
                    nombre: String(row.nombre ?? ""),
                }));
                setBancos(items);
                if (!bancoId && items[0]) setBancoId(String(items[0].id));
            })
            .catch(() => addToast("error", "Error al cargar bancos."));

        return () => {
            ignore = true;
        };
    }, [addToast, bancoId]);

    const handleSave = async () => {
        const amount = Number(monto.replace(",", "."));

        if (!userId) {
            addToast("error", "No se pudo resolver el usuario actual.");
            return;
        }

        if (!selectedBanco) {
            addToast("error", "Selecciona un banco.");
            return;
        }

        if (!dni.trim()) {
            addToast("error", "El DNI es obligatorio.");
            return;
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            addToast("error", "El monto debe ser mayor a cero.");
            return;
        }

        setIsSaving(true);

        try {
            const result = await pagoDeudaService.postSolicitud({
                p_id_usuario: userId,
                p_dni_cliente: dni.trim(),
                p_nombre_cliente: nombre.trim() || null,
                p_id_banco_cliente: selectedBanco.id,
                p_nombre_banco_cliente: selectedBanco.nombre,
                p_monto_deposito_cliente: amount,
                p_celular_cliente: celular.trim() || null,
                p_id_usuario_gestor: userId,
                p_nombre_usuario_gestor: userName,
                p_id_usuario_solicitud: userId,
                p_nombre_usuario_solicitud: userName,
                p_ruta_origen: "deuda",
                p_ruta_destino: "deuda",
            });

            if (result && "error" in result) {
                throw new Error(String((result as Record<string, unknown>).error));
            }

            setDni("");
            setNombre("");
            setCelular("");
            setMonto("");
            onSaved();
            addToast("success", "Solicitud de Pago Deuda registrada.");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al registrar Pago Deuda.";
            addToast("error", message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <InlineFormCard title="Solicitud Pago Deuda">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                <Input size="sm" label="DNI" placeholder="Documento" value={dni} onChange={setDni} />
                <Input size="sm" label="Cliente" placeholder="Nombre" value={nombre} onChange={setNombre} />
                <NativeSelect
                    size="sm"
                    label="Banco"
                    value={bancoId}
                    onChange={(event) => setBancoId(event.currentTarget.value)}
                    options={bancos.map((item) => ({ label: item.nombre, value: String(item.id) }))}
                />
                <Input size="sm" label="Monto" placeholder="S/ 0.00" value={monto} onChange={setMonto} />
                <Input size="sm" label="Celular" placeholder="Opcional" value={celular} onChange={setCelular} />
                <div className="flex justify-end gap-2 md:col-span-5">
                    <Button
                        size="sm"
                        color="secondary"
                        isDisabled={isSaving}
                        onClick={() => {
                            setDni("");
                            setNombre("");
                            setCelular("");
                            setMonto("");
                        }}
                    >
                        Cancelar
                    </Button>
                    <Button size="sm" isLoading={isSaving} onClick={handleSave}>
                        Guardar
                    </Button>
                </div>
            </div>
        </InlineFormCard>
    );
};
