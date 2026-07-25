import { useEffect, useMemo, useState } from "react";
import { Check, X } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { bancoService } from "@/services/banco.service";
import { comunidadService } from "@/services/comunidad.service";
import { InlineFormCard } from "@/features/operaciones/efectivizacion/shared/components/inline-form-card";
import { pagoDeudaService } from "@/features/operaciones/pago-deuda/services/pago-deuda.service";
import { useClienteLookup } from "@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup";

interface PagoDeudaSolicitudFormProps {
    onSaved: () => void;
}

interface BancoItem {
    id: number;
    nombre: string;
}

interface CatalogItem {
    id: number;
    nombre: string;
}

export const PagoDeudaSolicitudForm = ({ onSaved }: PagoDeudaSolicitudFormProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [dni, setDni] = useState("");
    const [nombre, setNombre] = useState("");
    const [monto, setMonto] = useState("");
    const [comunidadId, setComunidadId] = useState("");
    const [comunidades, setComunidades] = useState<CatalogItem[]>([]);
    const [bancoId, setBancoId] = useState("");
    const [bancos, setBancos] = useState<BancoItem[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [clienteId, setClienteId] = useState<number | null>(null);

    const { result: clienteLookup, isLoading: isClienteLoading } = useClienteLookup(dni);

    const selectedBanco = useMemo(() => bancos.find((item) => String(item.id) === bancoId) ?? null, [bancoId, bancos]);
    const selectedCommunity = useMemo(
        () => comunidades.find((item) => String(item.id) === comunidadId) ?? null,
        [comunidadId, comunidades],
    );
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;

    useEffect(() => {
        if (!dni.trim()) {
            setClienteId(null);
            return;
        }
        if (clienteLookup) {
            setClienteId(clienteLookup.id);
            setNombre(clienteLookup.nombre);
            if (clienteLookup.id_comunidad && !comunidadId) {
                setComunidadId(String(clienteLookup.id_comunidad));
            }
        } else if (dni.replace(/\D/g, "").length >= 8) {
            setClienteId(null);
        }
    }, [clienteLookup, dni, comunidadId]);

    useEffect(() => {
        let ignore = false;

        Promise.all([
            comunidadService.getList({ p_id_estado: 1 }),
            bancoService.getList({ p_id_estado: 1 }),
        ])
            .then(([comunidadRows, bancoRows]) => {
                if (ignore) return;

                const comunidadItems = comunidadRows.map((row) => ({
                    id: Number(row.id),
                    nombre: String(row.nombre ?? ""),
                }));
                const bancoItems = bancoRows.map((row) => ({
                    id: Number(row.id),
                    nombre: String(row.nombre ?? ""),
                }));

                setComunidades(comunidadItems);
                setBancos(bancoItems);

                if (!comunidadId && comunidadItems[0]) setComunidadId(String(comunidadItems[0].id));
                if (!bancoId && bancoItems[0]) setBancoId(String(bancoItems[0].id));
            })
            .catch(() => addToast("error", "Error al cargar catálogos."));

        return () => {
            ignore = true;
        };
    }, [addToast, comunidadId, bancoId]);

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

        if (!selectedCommunity) {
            addToast("error", "La comunidad es obligatoria.");
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
                p_id_comunidad: selectedCommunity.id,
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

    const handleClear = () => {
        setDni("");
        setNombre("");
        setMonto("");
        setClienteId(null);
    };

    return (
        <InlineFormCard title="Solicitud Pago Deuda">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <div className="flex flex-col gap-1">
                    <Input size="sm" label="DNI" placeholder="Documento" value={dni} onChange={setDni} />
                    {isClienteLoading && <span className="text-xs text-tertiary">Buscando...</span>}
                </div>
                <Input
                    size="sm"
                    label="Nombre"
                    placeholder={clienteId ? "Cliente encontrado" : "Nombre del cliente"}
                    value={nombre}
                    onChange={setNombre}
                    isDisabled={!!clienteId}
                />
                <NativeSelect
                    size="sm"
                    label="Comunidad"
                    value={comunidadId}
                    onChange={(event) => setComunidadId(event.currentTarget.value)}
                    options={comunidades.map((item) => ({ label: item.nombre, value: String(item.id) }))}
                />
                <NativeSelect
                    size="sm"
                    label="Banco Transferir"
                    value={bancoId}
                    onChange={(event) => setBancoId(event.currentTarget.value)}
                    options={bancos.map((item) => ({ label: item.nombre, value: String(item.id) }))}
                />
                <Input size="sm" label="Monto" placeholder="S/ 0.00" value={monto} onChange={setMonto} />
                <div className="flex gap-2 md:col-span-2">
                    <Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={handleSave} className="flex-1">
                        Guardar
                    </Button>
                    <Button size="sm" color="secondary" iconLeading={X} isDisabled={isSaving} onClick={handleClear} className="flex-1">
                        Cancelar
                    </Button>
                </div>
            </div>
        </InlineFormCard>
    );
};
