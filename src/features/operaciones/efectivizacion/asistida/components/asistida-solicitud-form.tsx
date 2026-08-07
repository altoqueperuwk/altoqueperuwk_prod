import { useEffect, useMemo, useState } from "react";
import { Save01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { bancoService } from "@/services/banco.service";
import { clienteService } from "@/services/cliente.service";
import { codigoServicioService } from "@/services/codigo-servicio.service";
import { comunidadService } from "@/services/comunidad.service";
import { estadoService } from "@/services/estado.service";
import { InlineFormCard } from "@/features/operaciones/efectivizacion/shared/components/inline-form-card";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { OperacionRuta, RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { useClienteLookup } from "@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup";
import {
    DocumentoInputGroup,
    cleanDocumento,
    getDocumentoValidationMessage,
    type TipoDocumentoOperacion,
} from "@/features/operaciones/efectivizacion/shared/components/documento-input-group";
import { sanitizeAmountInput } from "@/features/operaciones/efectivizacion/shared/utils/amount-input";

interface AsistidaSolicitudFormProps {
    activeCompany: RutaOperacionCaja | null;
    onSaved: () => void;
    ruta: OperacionRuta;
}

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

const getServicioNeedle = (ruta: OperacionRuta) => (ruta === "pos" ? "POS" : "LINK");

export const AsistidaSolicitudForm = ({ activeCompany, onSaved, ruta }: AsistidaSolicitudFormProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [codigoOperacion, setCodigoOperacion] = useState("");
    const [tipoDocumento, setTipoDocumento] = useState<TipoDocumentoOperacion>(1);
    const [dni, setDni] = useState("");
    const [nombre, setNombre] = useState("");
    const [whatsapp, setWhatsapp] = useState("");
    const [monto, setMonto] = useState("");
    const [comunidadId, setComunidadId] = useState("");
    const [comunidades, setComunidades] = useState<CatalogItem[]>([]);
    const [servicio, setServicio] = useState<CatalogItem | null>(null);
    const [estadoSolicitado, setEstadoSolicitado] = useState<CatalogItem | null>(null);
    const [estadoPagado, setEstadoPagado] = useState<CatalogItem | null>(null);
    const [bancosDestino, setBancosDestino] = useState<BancoDestino[]>([]);
    const [bancoDestinoId, setBancoDestinoId] = useState("");
    const [entidadTarjetaId, setEntidadTarjetaId] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [clienteId, setClienteId] = useState<number | null>(null);
    const [originalWhatsapp, setOriginalWhatsapp] = useState("");
    const [originalComunidadId, setOriginalComunidadId] = useState("");

    const { result: clienteLookup, isLoading: isClienteLoading } = useClienteLookup(dni, tipoDocumento);

    const selectedCommunity = useMemo(
        () => comunidades.find((item) => String(item.id) === comunidadId) ?? null,
        [comunidadId, comunidades],
    );
    const entidadTarjetaList = useMemo(
        () => {
            if (ruta === "linkpago") {
                return bancosDestino.filter((item) => item.id === 11 || item.id === 17);
            }
            return bancosDestino.filter((item) => item.tipo === "Tarjeta Comercial");
        },
        [bancosDestino, ruta],
    );
    const bancoTransferirList = useMemo(
        () => bancosDestino.filter((item) => item.tipo === "Tarjeta Crédito"),
        [bancosDestino],
    );
    const selectedEntidadTarjeta = useMemo(
        () => entidadTarjetaList.find((item) => String(item.id) === entidadTarjetaId) ?? null,
        [entidadTarjetaId, entidadTarjetaList],
    );
    const selectedBancoTransferir = useMemo(
        () => bancoTransferirList.find((item) => String(item.id) === bancoDestinoId) ?? null,
        [bancoDestinoId, bancoTransferirList],
    );
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;
    const routeLabel = getRutaLabel(ruta);

    useEffect(() => {
        if (!dni.trim()) {
            setClienteId(null);
            setNombre("");
            setWhatsapp("");
            setOriginalWhatsapp("");
            setOriginalComunidadId("");
            return;
        }
        if (clienteLookup) {
            setClienteId(clienteLookup.id);
            setNombre(clienteLookup.nombre);
            setWhatsapp(clienteLookup.celular[0] ?? "");
            setOriginalWhatsapp(clienteLookup.celular[0] ?? "");
            if (clienteLookup.id_comunidad != null) {
                setComunidadId(String(clienteLookup.id_comunidad));
            }
            setOriginalComunidadId(String(clienteLookup.id_comunidad));
        } else if (!getDocumentoValidationMessage(dni, tipoDocumento)) {
            setClienteId(null);
            setOriginalWhatsapp("");
            setOriginalComunidadId("");
        }
    }, [clienteLookup, dni, comunidadId, tipoDocumento]);

    useEffect(() => {
        let ignore = false;

        Promise.all([
            comunidadService.getList({ p_id_estado: 1 }),
            codigoServicioService.getList({ p_id_estado: 1 }),
            estadoService.getList({}),
        ])
            .then(([comunidadRows, codigoRows, estadoRows]) => {
                if (ignore) return;

                const comunidadItems = comunidadRows.map((row) => ({
                    id: Number(row.id),
                    nombre: String(row.nombre ?? ""),
                }));
                const codigoItems = codigoRows.map((row) => ({
                    id: Number(row.id),
                    nombre: String(row.nombre ?? ""),
                    tipo: String(row.tipo ?? ""),
                }));
                const estadoItems = estadoRows.map((row) => ({
                    id: Number(row.id),
                    nombre: String(row.nombre ?? ""),
                }));
                const needle = getServicioNeedle(ruta);

                setComunidades(comunidadItems);
                setServicio(
                    codigoItems.find((item) => item.tipo?.toUpperCase().includes(needle)) ??
                        codigoItems.find((item) => item.nombre.toUpperCase().includes(needle)) ??
                        null,
                );
                setEstadoSolicitado(
                    estadoItems.find((item) => item.nombre.toUpperCase() === "SOLICITADO") ??
                        estadoItems.find((item) => item.nombre.toUpperCase() === "PENDIENTE") ??
                        null,
                );
                setEstadoPagado(
                    estadoItems.find((item) => item.nombre.toUpperCase() === "PAGADO") ?? null,
                );

                if (!comunidadId && comunidadItems[0]) setComunidadId(String(comunidadItems[0].id));
            })
            .catch(() => addToast("error", "Error al cargar catalogos de solicitud."));

        return () => {
            ignore = true;
        };
    }, [addToast, comunidadId, ruta]);

    useEffect(() => {
        let ignore = false;

        bancoService
            .getList({ p_id_estado: 1 })
            .then((rows) => {
                if (ignore) return;
                const items = rows.map((row) => ({
                    id: Number(row.id),
                    nombre: String(row.nombre ?? ""),
                    tipo: String(row.tipo ?? ""),
                }));
                setBancosDestino(items);
                setBancoDestinoId("");
                setEntidadTarjetaId("");
            })
            .catch(() => addToast("error", "Error al cargar bancos destino."));

        return () => {
            ignore = true;
        };
    }, [addToast, ruta]);

    const handleSaveCliente = async () => {
        const cleanDni = cleanDocumento(dni, tipoDocumento);
        if (!cleanDni) return;

        if (clienteId) {
            const whatsappChanged = whatsapp !== originalWhatsapp;
            const comunidadChanged = comunidadId !== originalComunidadId;

            if (whatsappChanged || comunidadChanged) {
                await clienteService.update(clienteId, {
                    p_celular: whatsapp ? Number(whatsapp) : null,
                    p_id_comunidad: Number(comunidadId),
                });
            }
        } else {
            await clienteService.create({
                p_tipo_documento: tipoDocumento,
                p_numero_documento: cleanDni,
                p_nombre: nombre.trim(),
                p_celular: whatsapp ? Number(whatsapp) : null,
                p_id_comunidad: Number(comunidadId),
                p_id_estado: (await estadoService.getList({})).find((e) => String(e.nombre).toUpperCase() === "ACTIVO")?.id,
                p_id_usuario: userId,
            });
        }
    };

    const handleSave = async () => {
        const amount = Number(monto.replace(",", "."));

        if (!servicio) {
            addToast("error", `No se encontro el servicio ${routeLabel}.`);
            return;
        }

        const estadoRequerido = ruta === "linkpago" ? estadoPagado : estadoSolicitado;

        if (!estadoRequerido) {
            addToast("error", `No se encontro el estado ${ruta === "linkpago" ? "Pagado" : "Solicitado"}.`);
            return;
        }

        if (!selectedCommunity) {
            addToast("error", "La comunidad es obligatoria.");
            return;
        }

        if (!selectedEntidadTarjeta) {
            addToast("error", "Selecciona la entidad tarjeta.");
            return;
        }

        if (ruta === "pos" && !selectedBancoTransferir) {
            addToast("error", "Selecciona el banco al que transferir.");
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

        setIsSaving(true);

        try {
            await handleSaveCliente();

            const now = new Date().toISOString();
            const result = await operacionesRpcService.postOperacionAsistida({
                p_ruta: ruta,
                p_id_codigo_servicio: servicio.id,
                p_nombre_codigo_servicio: servicio.nombre,
                p_tipo_servicio: routeLabel.toUpperCase(),
                p_id_comunidad: selectedCommunity.id,
                p_nombre_comunidad: selectedCommunity.nombre,
                p_tipo_documento_cliente: tipoDocumento,
                p_dni_cliente: cleanDni,
                p_nombre_cliente: nombre.trim() || null,
                p_celular_cliente: whatsapp || null,
                p_monto_deposito_cliente: amount,
                p_codigo_operacion_deposito_cliente: codigoOperacion.trim() || null,
                p_id_estado: estadoRequerido.id,
                p_nombre_estado: estadoRequerido.nombre,
                p_id_usuario: userId,
                p_nombre_usuario: userName,
                p_id_usuario_gestor: userId,
                p_nombre_usuario_gestor: userName,
                p_id_usuario_solicitud: userId,
                p_nombre_usuario_solicitud: userName,
                p_id_banco_destino: ruta === "pos" ? selectedBancoTransferir?.id : null,
                p_id_banco_cliente: (ruta === "pos" || ruta === "linkpago") ? selectedEntidadTarjeta?.id : null,
                p_fecha_registro: now,
            });

            if (result && "error" in result) {
                throw new Error(String((result as Record<string, unknown>).error));
            }

            setCodigoOperacion("");
            setDni("");
            setTipoDocumento(1);
            setNombre("");
            setWhatsapp("");
            setMonto("");
            setEntidadTarjetaId("");
            setBancoDestinoId("");
            setClienteId(null);
            setOriginalWhatsapp("");
            setOriginalComunidadId("");
            onSaved();
            addToast("success", ruta === "linkpago" ? "Operacion registrada correctamente." : "Solicitud registrada correctamente.");
        } catch (err) {
            const message = err instanceof Error ? err.message : `Error al registrar ${ruta === "linkpago" ? "la operacion" : "la solicitud"}.`;
            addToast("error", message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleClear = () => {
        setCodigoOperacion("");
        setDni("");
        setTipoDocumento(1);
        setNombre("");
        setWhatsapp("");
        setMonto("");
        setEntidadTarjetaId("");
        setBancoDestinoId("");
        setClienteId(null);
        setOriginalWhatsapp("");
        setOriginalComunidadId("");
    };

    return (
        <InlineFormCard title={`Solicitud ${routeLabel}`}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
                <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap xl:flex-nowrap xl:items-end">
                    {(ruta === "pos" || ruta === "linkpago") && (
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
                            className="w-full min-w-0 xl:w-[18ch] xl:shrink-0"
                        />
                    )}
                    <div className="flex w-full min-w-0 items-end gap-2 xl:max-w-[12rem]">
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
                        className="w-full min-w-0 flex-1"
                    />
                    <Input
                        size="sm"
                        label="Whatsapp"
                        placeholder="Número de WhatsApp"
                        value={whatsapp}
                        onChange={(value) => setWhatsapp(value.replace(/\D/g, "").slice(0, 9))}
                        className="w-full min-w-0 xl:min-w-[9ch] xl:max-w-[9rem]"
                    />
                    <Input
                        size="sm"
                        label="Comunidad"
                        value={selectedCommunity?.nombre ?? ""}
                        isDisabled
                        className="w-full max-w-[10ch] shrink-0"
                    />
                    {ruta === "pos" && (
                        <NativeSelect
                            size="sm"
                            label="Banco Transferir"
                            isRequired
                            value={bancoDestinoId}
                            onChange={(event) => setBancoDestinoId(event.currentTarget.value)}
                            options={[
                                { label: "Seleccionar", value: "", disabled: true },
                                ...bancoTransferirList.map((item) => ({
                                    label: item.nombre,
                                    value: String(item.id),
                                })),
                            ]}
                            className="w-full min-w-0 xl:w-[14ch] xl:shrink-0"
                        />
                    )}
                    <Input
                        size="sm"
                        label="Monto"
                        isRequired
                        placeholder="S/ 0.00"
                        value={monto}
                        onChange={(value) => setMonto(sanitizeAmountInput(value))}
                        className="w-full min-w-0 xl:min-w-[8ch] xl:max-w-[9rem]"
                    />
                </div>
                <div className="flex w-full min-w-0 shrink-0 gap-2 sm:justify-end xl:w-auto">
                    <Button
                        size="sm"
                        color="primary"
                        iconLeading={Save01}
                        isLoading={isSaving}
                        onClick={handleSave}
                        className="min-w-0 flex-1 xl:flex-none"
                    >
                        Guardar
                    </Button>
                    <Button
                        size="sm"
                        color="secondary"
                        iconLeading={XClose}
                        isDisabled={isSaving}
                        onClick={handleClear}
                        className="min-w-0 flex-1 xl:flex-none"
                    >
                        Cancelar
                    </Button>
                </div>
            </div>
        </InlineFormCard>
    );
};
