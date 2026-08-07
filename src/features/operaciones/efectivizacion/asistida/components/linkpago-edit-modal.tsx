import { useEffect, useMemo, useState } from "react";
import { Check, X } from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { NativeSelect } from "@/components/base/select/select-native";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { bancoService } from "@/services/banco.service";
import { clienteService } from "@/services/cliente.service";
import { comunidadService } from "@/services/comunidad.service";
import { estadoService } from "@/services/estado.service";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import type { OperacionRuta } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { useClienteLookup } from "@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup";
import {
    DocumentoInputGroup,
    cleanDocumento,
    getDocumentoValidationMessage,
    type TipoDocumentoOperacion,
} from "@/features/operaciones/efectivizacion/shared/components/documento-input-group";
import { sanitizeAmountInput } from "@/features/operaciones/efectivizacion/shared/utils/amount-input";

interface CatalogItem {
    id: number;
    nombre: string;
    tipo?: string;
}

interface BancoDestino {
    id: number;
    nombre: string;
    tipo: string;
}

interface LinkPagoEditModalProps {
    isOpen: boolean;
    operation: OperacionProceso | null;
    ruta: OperacionRuta;
    onClose: () => void;
    onSaved: () => void;
}

const inferTipoDocumentoOperacion = (documento?: string | null): TipoDocumentoOperacion =>
    documento?.replace(/\D/g, "").length === 9 ? 2 : 1;

export const LinkPagoEditModal = ({ isOpen, operation, ruta, onClose, onSaved }: LinkPagoEditModalProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [entidadTarjetaId, setEntidadTarjetaId] = useState("");
    const [bancoDestinoId, setBancoDestinoId] = useState("");
    const [tipoDocumento, setTipoDocumento] = useState<TipoDocumentoOperacion>(1);
    const [dni, setDni] = useState("");
    const [nombre, setNombre] = useState("");
    const [comunidadId, setComunidadId] = useState("");
    const [monto, setMonto] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [comunidades, setComunidades] = useState<CatalogItem[]>([]);
    const [bancosDestino, setBancosDestino] = useState<BancoDestino[]>([]);
    const [clienteId, setClienteId] = useState<number | null>(null);
    const [originalCelulares, setOriginalCelulares] = useState<string[]>([]);

    const { result: clienteLookup, isLoading: isClienteLoading } = useClienteLookup(
        isOpen ? dni : "",
        tipoDocumento,
    );

    const entidadTarjetaList = useMemo(
        () => ruta === "linkpago"
            ? bancosDestino.filter((item) => item.id === 11 || item.id === 17)
            : bancosDestino.filter((item) => item.tipo === "Tarjeta Comercial"),
        [bancosDestino, ruta],
    );
    const legacyBancoTransferirList = useMemo(
        () => bancosDestino.filter((item) => item.tipo === "Tarjeta CrÃ©dito"),
        [bancosDestino],
    );
    const bancoTransferirList = useMemo(
        () => {
            const filtered = bancosDestino.filter((item) => {
            const tipo = item.tipo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
            return tipo.includes("CREDITO") || tipo.includes("CRÃ");
            });
            return filtered.length ? filtered : legacyBancoTransferirList;
        },
        [bancosDestino, legacyBancoTransferirList],
    );

    const selectedEntidadTarjeta = useMemo(
        () => entidadTarjetaList.find((item) => String(item.id) === entidadTarjetaId) ?? null,
        [entidadTarjetaId, entidadTarjetaList],
    );

    const selectedCommunity = useMemo(
        () => comunidades.find((item) => String(item.id) === comunidadId) ?? null,
        [comunidadId, comunidades],
    );

    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;

    useEffect(() => {
        if (!isOpen) return;

        if (operation) {
            setEntidadTarjetaId(String(operation.id_banco_cliente ?? ""));
            setBancoDestinoId(String(operation.id_banco_cliente_transferencia ?? ""));
            setTipoDocumento(inferTipoDocumentoOperacion(operation.dni_cliente));
            setDni(operation.dni_cliente ?? "");
            setNombre(operation.nombre_cliente ?? "");
            setComunidadId(String(operation.id_comunidad ?? ""));
            setMonto(String(operation.monto_deposito_cliente ?? ""));
            setClienteId(operation.id_cliente ?? null);
            setOriginalCelulares([]);
        }

        let ignore = false;

        Promise.all([
            bancoService.getList({ p_id_estado: 1 }),
            comunidadService.getList({ p_id_estado: 1 }),
        ])
            .then(([bancoRows, comunidadRows]) => {
                if (ignore) return;
                setBancosDestino(
                    bancoRows.map((row) => ({
                        id: Number(row.id),
                        nombre: String(row.nombre ?? ""),
                        tipo: String(row.tipo ?? ""),
                    })),
                );
                setComunidades(
                    comunidadRows.map((row) => ({
                        id: Number(row.id),
                        nombre: String(row.nombre ?? ""),
                    })),
                );
            })
            .catch(() => addToast("error", "Error al cargar catalogos."));

        return () => {
            ignore = true;
        };
    }, [addToast, isOpen, operation]);

    useEffect(() => {
        if (!dni.trim()) {
            setClienteId(null);
            setNombre("");
            setOriginalCelulares([]);
            return;
        }
        if (clienteLookup) {
            setClienteId(clienteLookup.id);
            setNombre(clienteLookup.nombre);
            if (clienteLookup.id_comunidad != null) {
                setComunidadId(String(clienteLookup.id_comunidad));
            }
            setOriginalCelulares(clienteLookup.celular);
        } else if (!getDocumentoValidationMessage(dni, tipoDocumento)) {
            setClienteId(null);
            setOriginalCelulares([]);
        }
    }, [clienteLookup, dni, tipoDocumento]);

    const handleSave = async () => {
        const amount = Number(monto.replace(",", "."));

        if (!selectedEntidadTarjeta) {
            addToast("error", "Selecciona la entidad tarjeta.");
            return;
        }

        if (ruta === "pos" && !bancoDestinoId) {
            addToast("error", "Selecciona el banco al que transferir.");
            return;
        }

        const cleanDni = cleanDocumento(dni, tipoDocumento);
        const documentoError = getDocumentoValidationMessage(cleanDni, tipoDocumento);

        if (documentoError) {
            addToast("error", documentoError);
            return;
        }

        if (!selectedCommunity) {
            addToast("error", "La comunidad es obligatoria.");
            return;
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            addToast("error", "El monto debe ser mayor a cero.");
            return;
        }

        setIsSaving(true);

        try {
            const targetClienteId = clienteId;

            if (targetClienteId) {
                const comunidadChanged = comunidadId !== String(operation?.id_comunidad ?? "");
                if (comunidadChanged) {
                    await clienteService.update(targetClienteId, {
                        p_id_comunidad: Number(comunidadId),
                    });
                }
            } else {
                await clienteService.create({
                    p_tipo_documento: tipoDocumento,
                    p_numero_documento: cleanDni,
                    p_nombre: nombre.trim(),
                    p_id_comunidad: Number(comunidadId),
                    p_id_estado: (await estadoService.getList({})).find((e) => String(e.nombre).toUpperCase() === "ACTIVO")?.id,
                    p_id_usuario: userId,
                });
            }

            const result = await operacionesRpcService.patchOperacionAsistida({
                p_id: operation!.id,
                p_id_banco_cliente: selectedEntidadTarjeta.id,
                p_id_banco_destino: ruta === "pos" ? Number(bancoDestinoId) : null,
                p_tipo_documento_cliente: tipoDocumento,
                p_dni_cliente: cleanDni,
                p_nombre_cliente: nombre.trim() || null,
                p_id_comunidad: selectedCommunity.id,
                p_nombre_comunidad: selectedCommunity.nombre,
                p_monto_deposito_cliente: amount,
                p_id_usuario: userId,
                p_nombre_usuario: userName,
            });

            if (result && "error" in result) {
                throw new Error(String((result as Record<string, unknown>).error));
            }

            onClose();
            onSaved();
            addToast("success", "Operacion actualizada correctamente.");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al actualizar la operacion.";
            addToast("error", message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        if (!isSaving) onClose();
    };

    return (
        <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && handleCancel()}>
            <Modal className="max-w-lg">
                <Dialog>
                    <div className="flex flex-col gap-5 rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                        <div>
                            <h2 className="text-lg font-semibold text-primary">Editar Operacion</h2>
                            <p className="mt-1 text-sm text-tertiary">Actualiza los campos necesarios para recalcular comisiones.</p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <NativeSelect
                                size="sm"
                                label="Entidad Tarjeta"
                                isRequired
                                value={entidadTarjetaId}
                                onChange={(event) => setEntidadTarjetaId(event.currentTarget.value)}
                                options={[
                                    { label: "Seleccionar", value: "", disabled: true },
                                    ...entidadTarjetaList.map((item) => ({
                                        label: item.nombre,
                                        value: String(item.id),
                                    })),
                                ]}
                                className="w-full min-w-0"
                            />
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
                                isDisabled={!!clienteId}
                                className="w-full min-w-0"
                            />
                            <Input
                                size="sm"
                                label="Comunidad"
                                value={selectedCommunity?.nombre ?? ""}
                                isDisabled
                                className="w-full min-w-0 max-w-[10ch]"
                            />
                            <Input
                                size="sm"
                                label="Monto"
                                isRequired
                                placeholder="S/ 0.00"
                                value={monto}
                                onChange={(value) => setMonto(sanitizeAmountInput(value))}
                                className="w-full min-w-0"
                            />
                            {ruta === "pos" && (
                                <NativeSelect
                                    size="sm"
                                    label="Banco Transferir"
                                    isRequired
                                    value={bancoDestinoId}
                                    onChange={(event) => setBancoDestinoId(event.currentTarget.value)}
                                    options={[
                                        { label: "Seleccionar banco", value: "", disabled: true },
                                        ...bancoTransferirList.map((item) => ({
                                            label: item.nombre,
                                            value: String(item.id),
                                        })),
                                    ]}
                                    className="w-full min-w-0"
                                />
                            )}
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button color="secondary" iconLeading={X} isDisabled={isSaving} onClick={handleCancel}>
                                Cancelar
                            </Button>
                            <Button color="primary" iconLeading={Check} isLoading={isSaving} onClick={handleSave}>
                                Guardar
                            </Button>
                        </div>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
};
