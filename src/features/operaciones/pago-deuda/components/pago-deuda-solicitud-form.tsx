import { useEffect, useMemo, useState } from "react";
import { Save01, XClose } from "@untitledui/icons";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { bancoService } from "@/services/banco.service";
import { comunidadService } from "@/services/comunidad.service";
import { reglasEfectivizacionService } from "@/services/reglas-efectivizacion.service";
import { InlineFormCard } from "@/features/operaciones/efectivizacion/shared/components/inline-form-card";
import { pagoDeudaService } from "@/features/operaciones/pago-deuda/services/pago-deuda.service";
import { useClienteLookup } from "@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup";
import {
    DocumentoInputGroup,
    cleanDocumento,
    getDocumentoValidationMessage,
    type TipoDocumentoOperacion,
} from "@/features/operaciones/efectivizacion/shared/components/documento-input-group";
import { sanitizeAmountInput } from "@/features/operaciones/efectivizacion/shared/utils/amount-input";

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

interface ReglaPagoDeudaItem {
    id: number;
    id_banco: number;
    id_comunidad: number | null;
    codigo_servicio_nombre: string;
    comision_servicio: number;
}

type CommissionMode = "preferencial" | "ultimo_dia";

const formatPercentValue = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(Number(value))) return "";
    return `${Number(value).toLocaleString("es-PE", { maximumFractionDigits: 4 })} %`;
};

const allowedBankNames = new Set(["BCP", "BBVA", "INTERBANK", "BANBIF", "SCOTIABANK"]);

const sanitizeWhatsapp = (value: string) => value.replace(/\D/g, "").slice(0, 9);

export const PagoDeudaSolicitudForm = ({ onSaved }: PagoDeudaSolicitudFormProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [tipoDocumento, setTipoDocumento] = useState<TipoDocumentoOperacion>(1);
    const [dni, setDni] = useState("");
    const [nombre, setNombre] = useState("");
    const [whatsapp, setWhatsapp] = useState("");
    const [monto, setMonto] = useState("");
    const [comunidadId, setComunidadId] = useState("");
    const [comunidades, setComunidades] = useState<CatalogItem[]>([]);
    const [bancoId, setBancoId] = useState("");
    const [bancos, setBancos] = useState<BancoItem[]>([]);
    const [reglas, setReglas] = useState<ReglaPagoDeudaItem[]>([]);
    const [commissionMode, setCommissionMode] = useState<CommissionMode>("preferencial");
    const [manualCommission, setManualCommission] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [clienteId, setClienteId] = useState<number | null>(null);

    const { result: clienteLookup, isLoading: isClienteLoading } = useClienteLookup(dni, tipoDocumento);

    const selectedBanco = useMemo(() => bancos.find((item) => String(item.id) === bancoId) ?? null, [bancoId, bancos]);
    const selectedCommunity = useMemo(
        () => comunidades.find((item) => String(item.id) === comunidadId) ?? null,
        [comunidadId, comunidades],
    );
    const selectedRegla = useMemo(() => {
        if (!selectedBanco) return null;

        const bankRules = reglas.filter((item) => item.id_banco === selectedBanco.id);
        return (
            bankRules.find((item) => selectedCommunity && item.id_comunidad === selectedCommunity.id) ??
            bankRules[0] ??
            null
        );
    }, [reglas, selectedBanco, selectedCommunity]);
    const bancosPermitidos = useMemo(
        () => bancos.filter((item) => allowedBankNames.has(item.nombre.trim().toUpperCase())),
        [bancos],
    );
    const amount = Number(monto.replace(",", "."));
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
            setWhatsapp(clienteLookup.celular[0] ?? "");
            if (clienteLookup.id_comunidad) {
                setComunidadId(String(clienteLookup.id_comunidad));
            }
        } else if (!getDocumentoValidationMessage(dni, tipoDocumento)) {
            setClienteId(null);
        }
    }, [clienteLookup, dni, tipoDocumento]);

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
                const firstAllowedBank = bancoItems.find((item) => allowedBankNames.has(item.nombre.trim().toUpperCase()));
                if (!bancoId && firstAllowedBank) setBancoId(String(firstAllowedBank.id));
            })
            .catch(() => addToast("error", "Error al cargar catálogos."));

        return () => {
            ignore = true;
        };
    }, [addToast, comunidadId, bancoId]);

    useEffect(() => {
        let ignore = false;

        reglasEfectivizacionService
            .getList({ p_id_estado: 1 })
            .then((rows) => {
                if (ignore) return;

                setReglas(
                    rows
                        .filter((row) => String(row.codigo_servicio_nombre ?? "").toUpperCase().includes("PAGO DEUDA"))
                        .map((row) => ({
                            id: Number(row.id),
                            id_banco: Number(row.id_banco),
                            id_comunidad: row.id_comunidad == null ? null : Number(row.id_comunidad),
                            codigo_servicio_nombre: String(row.codigo_servicio_nombre ?? ""),
                            comision_servicio: Number(row.comision_servicio ?? 0),
                        })),
                );
            })
            .catch(() => addToast("error", "Error al cargar reglas de Pago Deuda."));

        return () => {
            ignore = true;
        };
    }, [addToast]);

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

        if (!selectedRegla) {
            addToast("error", "No se encontro una regla activa para el banco seleccionado.");
            return;
        }

        if (!selectedCommunity) {
            addToast("error", "La comunidad es obligatoria.");
            return;
        }

        const cleanDni = cleanDocumento(dni, tipoDocumento);
        const documentoError = getDocumentoValidationMessage(cleanDni, tipoDocumento);

        if (documentoError) {
            addToast("error", documentoError);
            return;
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            addToast("error", "El monto debe ser mayor a cero.");
            return;
        }

        const manualCommissionValue = commissionMode === "ultimo_dia"
            ? Number(manualCommission.replace(",", "."))
            : 0;
        const manualCommissionPayload = commissionMode === "ultimo_dia" ? manualCommissionValue : null;

        if (commissionMode === "ultimo_dia" && (!Number.isFinite(manualCommissionValue) || manualCommissionValue < 0)) {
            addToast("error", "La comision debe ser mayor o igual a 0.");
            return;
        }

        setIsSaving(true);

        try {
            const result = await pagoDeudaService.postSolicitud({
                p_id_usuario: userId,
                p_tipo_documento_cliente: tipoDocumento,
                p_dni_cliente: cleanDni,
                p_nombre_cliente: nombre.trim() || null,
                p_celular_cliente: whatsapp || null,
                p_id_banco_cliente: selectedBanco.id,
                p_nombre_banco_cliente: selectedBanco.nombre,
                p_monto_deposito_cliente: amount,
                p_comision_servicio_manual: manualCommissionPayload,
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
            setTipoDocumento(1);
            setNombre("");
            setWhatsapp("");
            setMonto("");
            setCommissionMode("preferencial");
            setManualCommission("");
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
        setTipoDocumento(1);
        setNombre("");
        setWhatsapp("");
        setMonto("");
        setClienteId(null);
        setCommissionMode("preferencial");
        setManualCommission("");
    };

    return (
        <InlineFormCard title="Solicitud Pago Deuda">
            <div className="flex min-w-0 flex-col gap-3 2xl:flex-row 2xl:items-end">
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-[minmax(9ch,12rem)_minmax(0,1fr)_minmax(9ch,9rem)_minmax(10ch,12rem)_minmax(8ch,9rem)_minmax(10ch,12rem)_minmax(8ch,9rem)]">
                    <div className="flex w-full min-w-0 items-end gap-2">
                        <DocumentoInputGroup
                            isRequired
                            tipoDocumento={tipoDocumento}
                            numeroDocumento={dni}
                            onTipoDocumentoChange={setTipoDocumento}
                            onNumeroDocumentoChange={setDni}
                            className="min-w-0 flex-1"
                        />
                        {isClienteLoading && (
                            <div className="flex size-10 shrink-0 items-center justify-center">
                                <LoadingIndicator type="line-spinner" size="sm" />
                            </div>
                        )}
                    </div>
                    <Input
                        size="sm"
                        label="Nombre"
                        placeholder={clienteId ? "Cliente encontrado" : "Nombre del cliente"}
                        value={nombre}
                        onChange={setNombre}
                        className="w-full min-w-0 max-w-full"
                    />
                    <Input
                        size="sm"
                        label="Whatsapp"
                        placeholder="Número de Whatsapp"
                        value={whatsapp}
                        onChange={(value) => setWhatsapp(sanitizeWhatsapp(value))}
                        className="w-full min-w-0 max-w-full"
                    />
                    <NativeSelect
                        size="sm"
                        label="Banco Solicitado"
                        isRequired
                        value={bancoId}
                        onChange={(event) => setBancoId(event.currentTarget.value)}
                        options={bancosPermitidos.map((item) => ({ label: item.nombre, value: String(item.id) }))}
                        className="w-full min-w-0 max-w-full"
                    />
                    <Input
                        size="sm"
                        label="Monto Solicitado"
                        isRequired
                        placeholder="S/ 0.00"
                        value={monto}
                        onChange={(value) => setMonto(sanitizeAmountInput(value))}
                        className="w-full min-w-0 max-w-full"
                    />
                    <NativeSelect
                        size="sm"
                        label="Comision"
                        isRequired
                        value={commissionMode}
                        onChange={(event) => {
                            const value = event.currentTarget.value as CommissionMode;
                            setCommissionMode(value);
                            if (value === "preferencial") setManualCommission("");
                            if (value === "ultimo_dia") setManualCommission("");
                        }}
                        options={[
                            { label: "Preferencial", value: "preferencial" },
                            { label: "Último Día", value: "ultimo_dia" },
                        ]}
                        className="w-full min-w-0 max-w-full"
                    />
                    <Input
                        size="sm"
                        label="Comision %"
                        isRequired
                        placeholder="%"
                        value={commissionMode === "preferencial" ? formatPercentValue(selectedRegla?.comision_servicio) : manualCommission}
                        isDisabled={commissionMode === "preferencial"}
                        onChange={(value) => setManualCommission(sanitizeAmountInput(value))}
                        className="w-full min-w-0 max-w-full"
                    />
                </div>
                <div className="flex w-full min-w-0 shrink-0 gap-2 sm:justify-end 2xl:w-auto">
                    <Button
                        size="sm"
                        color="primary"
                        iconLeading={Save01}
                        isLoading={isSaving}
                        onClick={handleSave}
                        className="min-w-0 flex-1 2xl:flex-none"
                    >
                        Guardar
                    </Button>
                    <Button
                        size="sm"
                        color="secondary"
                        iconLeading={XClose}
                        isDisabled={isSaving}
                        onClick={handleClear}
                        className="min-w-0 flex-1 2xl:flex-none"
                    >
                        Cancelar
                    </Button>
                </div>
            </div>
        </InlineFormCard>
    );
};
