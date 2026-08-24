import { useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon, Save01, XClose } from "@untitledui/icons";
import { CalendarDate, type DateValue } from "@internationalized/date";
import { Button } from "@/components/base/buttons/button";
import { Calendar } from "@/components/application/date-picker/calendar";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { Toggle } from "@/components/base/toggle/toggle";
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
import { formatDateValue, getPeruDateValue, getPeruTimestamp } from "@/features/operaciones/efectivizacion/shared/utils/date";

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
const ASISTIDA_DEFAULT_COMMUNITY_ID = 10;
const ASISTIDA_DEFAULT_COMMUNITY_NAME = "ATK1";
const usesFixedCommunity = (ruta: OperacionRuta) => ruta === "pos" || ruta === "linkpago";
const allowedBankNames = new Set(["BBVA", "BCP", "SCOTIABANK", "BANBIF", "INTERBANK"]);

const stringToCalendarDate = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new CalendarDate(year, month, day);
};

const getCurrentPeruTime = () => {
    const parts = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        hour12: false,
        minute: "2-digit",
        second: "2-digit",
        timeZone: "America/Lima",
    }).formatToParts(new Date());
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
    return `${value("hour")}:${value("minute")}:${value("second")}-05:00`;
};

export const AsistidaSolicitudForm = ({ activeCompany, onSaved, ruta }: AsistidaSolicitudFormProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [codigoOperacion, setCodigoOperacion] = useState("");
    const [numeroTarjeta, setNumeroTarjeta] = useState("");
    const [sinEnvioSolicitud, setSinEnvioSolicitud] = useState(false);
    const [tipoDocumento, setTipoDocumento] = useState<TipoDocumentoOperacion>(1);
    const [dni, setDni] = useState("");
    const [nombre, setNombre] = useState("");
    const [email, setEmail] = useState("");
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
    const [fechaDeposito, setFechaDeposito] = useState(getPeruDateValue);
    const [isFechaDepositoOpen, setIsFechaDepositoOpen] = useState(false);

    const { result: clienteLookup, isLoading: isClienteLoading } = useClienteLookup(dni, tipoDocumento);

    useEffect(() => {
        setCodigoOperacion("");
        setNumeroTarjeta("");
        setSinEnvioSolicitud(false);
        setTipoDocumento(1);
        setDni("");
        setNombre("");
        setEmail("");
        setWhatsapp("");
        setMonto("");
        setComunidadId(String(ASISTIDA_DEFAULT_COMMUNITY_ID));
        setClienteId(null);
        setOriginalWhatsapp("");
        setOriginalComunidadId(String(ASISTIDA_DEFAULT_COMMUNITY_ID));
        setFechaDeposito(getPeruDateValue());
        setIsFechaDepositoOpen(false);
        setEntidadTarjetaId("");
        setBancoDestinoId("");
        setServicio(null);
        setEstadoSolicitado(null);
        setEstadoPagado(null);
    }, [ruta]);

    const selectedCommunity = useMemo(
        () => comunidades.find((item) => String(item.id) === comunidadId) ?? null,
        [comunidadId, comunidades],
    );
    const entidadTarjetaList = useMemo(
        () => {
            if (ruta === "linkpago") {
                return bancosDestino.filter((item) => item.id === 11 || item.id === 17);
            }
            if (sinEnvioSolicitud) {
                return bancosDestino.filter(
                    (item) => item.tipo.startsWith("Tarjeta Cr") && allowedBankNames.has(item.nombre.trim().toUpperCase()),
                );
            }
            return bancosDestino.filter((item) => item.tipo === "Tarjeta Comercial");
        },
        [bancosDestino, ruta, sinEnvioSolicitud],
    );
    const bancoTransferirList = useMemo(
        () => bancosDestino.filter((item) => item.tipo === "Tarjeta Crédito" && allowedBankNames.has(item.nombre.trim().toUpperCase())),
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
    const isPosSinEnvio = ruta === "pos" && sinEnvioSolicitud;

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
            if (usesFixedCommunity(ruta)) {
                setComunidadId(String(ASISTIDA_DEFAULT_COMMUNITY_ID));
            } else if (clienteLookup.id_comunidad != null) {
                setComunidadId(String(clienteLookup.id_comunidad));
            }
            setOriginalComunidadId(
                String(usesFixedCommunity(ruta) ? ASISTIDA_DEFAULT_COMMUNITY_ID : (clienteLookup.id_comunidad ?? "")),
            );
        } else if (!getDocumentoValidationMessage(dni, tipoDocumento)) {
            setClienteId(null);
            setOriginalWhatsapp("");
            setOriginalComunidadId("");
        }
    }, [clienteLookup, dni, comunidadId, ruta, tipoDocumento]);

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

                if (usesFixedCommunity(ruta) && comunidadItems.some((item) => item.id === ASISTIDA_DEFAULT_COMMUNITY_ID)) {
                    setComunidadId(String(ASISTIDA_DEFAULT_COMMUNITY_ID));
                } else if (!comunidadId && comunidadItems[0]) {
                    setComunidadId(String(comunidadItems[0].id));
                }
            })
            .catch(() => addToast("error", "Error al cargar catalogos de solicitud."));

        return () => {
            ignore = true;
        };
    }, [addToast, comunidadId, ruta]);

    useEffect(() => {
        let ignore = false;

        bancoService.getList({ p_id_estado: 1 })
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

        const effectiveCommunityId = usesFixedCommunity(ruta) ? ASISTIDA_DEFAULT_COMMUNITY_ID : Number(comunidadId);

        if (clienteId) {
            const whatsappChanged = whatsapp !== originalWhatsapp;
            const comunidadChanged = String(effectiveCommunityId) !== originalComunidadId;

            if (whatsappChanged || comunidadChanged) {
                await clienteService.update(clienteId, {
                    p_celular: whatsapp ? Number(whatsapp) : null,
                    p_id_comunidad: effectiveCommunityId,
                });
            }
        } else {
            await clienteService.create({
                p_tipo_documento: tipoDocumento,
                p_numero_documento: cleanDni,
                p_nombre: nombre.trim(),
                p_celular: whatsapp ? Number(whatsapp) : null,
                p_id_comunidad: effectiveCommunityId,
                p_id_estado: (await estadoService.getList({})).find((e) => String(e.nombre).toUpperCase() === "ACTIVO")?.id,
                p_id_usuario: userId,
            });
        }
    };

    const handleSave = async () => {
        const amount = Number(monto.replace(",", "."));
        const effectiveCommunityId = usesFixedCommunity(ruta) ? ASISTIDA_DEFAULT_COMMUNITY_ID : Number(comunidadId);
        const effectiveCommunityName = usesFixedCommunity(ruta) ? ASISTIDA_DEFAULT_COMMUNITY_NAME : selectedCommunity?.nombre;

        if (!servicio) {
            addToast("error", `No se encontro el servicio ${routeLabel}.`);
            return;
        }

        const estadoRequerido = isPosSinEnvio ? estadoPagado : ruta === "linkpago" ? estadoPagado : estadoSolicitado;

        if (!estadoRequerido) {
            addToast("error", `No se encontro el estado ${ruta === "linkpago" ? "Pagado" : "Solicitado"}.`);
            return;
        }

        if (!effectiveCommunityName) {
            addToast("error", "La comunidad es obligatoria.");
            return;
        }

        if (!selectedEntidadTarjeta) {
            addToast("error", "Selecciona la entidad tarjeta.");
            return;
        }

        if (ruta === "pos" && !isPosSinEnvio && !selectedBancoTransferir) {
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

            const now = getPeruTimestamp();
            const result = isPosSinEnvio
                ? await operacionesRpcService.postOperacionAsistidaPosSinEnvio({
                      p_id_codigo_servicio: servicio.id,
                      p_nombre_codigo_servicio: servicio.nombre,
                      p_tipo_servicio: routeLabel.toUpperCase(),
                      p_id_comunidad: effectiveCommunityId,
                      p_nombre_comunidad: effectiveCommunityName,
                      p_tipo_documento_cliente: tipoDocumento,
                      p_dni_cliente: cleanDni,
                      p_nombre_cliente: nombre.trim() || null,
                      p_email_cliente: email.trim() || null,
                      p_celular_cliente: whatsapp || null,
                      p_monto_deposito_cliente: amount,
                      p_codigo_operacion_deposito_cliente: codigoOperacion.trim() || null,
                      p_numero_tarjeta: numeroTarjeta || null,
                      p_id_banco_cliente: selectedEntidadTarjeta?.id,
                      p_id_usuario: userId,
                      p_nombre_usuario: userName,
                      p_id_usuario_gestor: userId,
                      p_nombre_usuario_gestor: userName,
                      p_id_usuario_solicitud: userId,
                      p_nombre_usuario_solicitud: userName,
                      p_fecha_registro: `${fechaDeposito}T${getCurrentPeruTime()}`,
                  })
                : await operacionesRpcService.postOperacionAsistida({
                      p_ruta: ruta,
                      p_id_codigo_servicio: servicio.id,
                      p_nombre_codigo_servicio: servicio.nombre,
                      p_tipo_servicio: routeLabel.toUpperCase(),
                      p_id_comunidad: effectiveCommunityId,
                      p_nombre_comunidad: effectiveCommunityName,
                      p_tipo_documento_cliente: tipoDocumento,
                      p_dni_cliente: cleanDni,
                      p_nombre_cliente: nombre.trim() || null,
                      p_email_cliente: ruta === "pos" ? email.trim() || null : null,
                      p_celular_cliente: whatsapp || null,
                      p_monto_deposito_cliente: amount,
                      p_codigo_operacion_deposito_cliente: codigoOperacion.trim() || null,
                      p_numero_tarjeta: numeroTarjeta || null,
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
                      p_fecha_deposito_cliente: (ruta === "pos" || ruta === "linkpago") ? `${fechaDeposito}T${getCurrentPeruTime()}` : null,
                      p_fecha_registro: `${fechaDeposito}T${getCurrentPeruTime()}`,
                  });

            if (result && "error" in result) {
                throw new Error(String((result as Record<string, unknown>).error));
            }

            setCodigoOperacion("");
            setNumeroTarjeta("");
            setSinEnvioSolicitud(false);
            setDni("");
            setTipoDocumento(1);
            setNombre("");
            setEmail("");
            setWhatsapp("");
            setMonto("");
            setEntidadTarjetaId("");
            setBancoDestinoId("");
            setClienteId(null);
            setOriginalWhatsapp("");
            setOriginalComunidadId("");
            setFechaDeposito(getPeruDateValue());
            setIsFechaDepositoOpen(false);
            onSaved();
            addToast(
                "success",
                isPosSinEnvio
                    ? "POS registrado como pagado correctamente."
                    : ruta === "linkpago"
                      ? "Operacion registrada correctamente."
                      : "Solicitud registrada correctamente.",
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : `Error al registrar ${ruta === "linkpago" ? "la operacion" : "la solicitud"}.`;
            addToast("error", message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleClear = () => {
        setCodigoOperacion("");
        setNumeroTarjeta("");
        setSinEnvioSolicitud(false);
        setDni("");
        setTipoDocumento(1);
        setNombre("");
        setEmail("");
        setWhatsapp("");
        setMonto("");
        setEntidadTarjetaId("");
        setBancoDestinoId("");
        setClienteId(null);
        setOriginalWhatsapp("");
        setOriginalComunidadId("");
        setFechaDeposito(getPeruDateValue());
        setIsFechaDepositoOpen(false);
    };

    const handleFechaDepositoChange = (date: DateValue) => {
        setFechaDeposito(`${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`);
        setIsFechaDepositoOpen(false);
    };

    return (
        <InlineFormCard title={`Solicitud ${routeLabel}`}>
            <div className={ruta === "pos" ? "flex flex-col gap-3" : "flex flex-col gap-3 xl:flex-row xl:items-end"}>
                <div
                    className={
                        ruta === "pos"
                            ? "flex w-full min-w-0 flex-wrap items-end gap-3"
                            : "flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap xl:flex-nowrap xl:items-end"
                    }
                >
                    {ruta === "pos" && (
                        <div className="contents">
                            <Input
                                size="sm"
                                label="Cod. Operacion"
                                placeholder="Código de operación"
                                value={codigoOperacion}
                                maxLength={15}
                                onChange={(value) => setCodigoOperacion(value.slice(0, 15))}
                                className="order-1 w-full min-w-0 sm:w-[16ch]"
                            />
                            <div className="order-10 flex w-full flex-row-reverse flex-wrap items-center justify-end gap-2 sm:w-max">
                                <div className="relative flex w-[11rem] shrink-0 flex-col gap-1">
                                    <span className="text-sm font-medium text-secondary">Fecha Deposito</span>
                                    <Button
                                        size="sm"
                                        color="secondary"
                                        iconLeading={CalendarIcon}
                                        onClick={() => setIsFechaDepositoOpen((current) => !current)}
                                        className="w-full justify-start"
                                    >
                                        {formatDateValue(fechaDeposito)}
                                    </Button>
                                    {isFechaDepositoOpen && (
                                        <div className="absolute bottom-full left-0 z-50 mb-2 rounded-lg border border-secondary bg-primary p-3 shadow-lg">
                                            <Calendar value={stringToCalendarDate(fechaDeposito)} onChange={handleFechaDepositoChange}>
                                                <div />
                                            </Calendar>
                                        </div>
                                    )}
                                </div>
                                <div className="flex w-[11rem] flex-col gap-1">
                                    <span className="text-sm font-medium text-secondary">No Enviar Solicitud</span>
                                    <Toggle
                                    size="sm"
                                    label={undefined}
                                    aria-label="No Enviar Solicitud"
                                    isSelected={sinEnvioSolicitud}
                                    className="w-full justify-start"
                                    onChange={(isSelected) => {
                                        setSinEnvioSolicitud(isSelected);
                                        setEntidadTarjetaId("");
                                        setBancoDestinoId("");
                                    }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
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
                            className={ruta === "pos" ? "order-2 w-full min-w-0 xl:w-[18ch] xl:shrink-0" : "w-full min-w-0 xl:w-[18ch] xl:shrink-0"}
                        />
                    )}
                    {(ruta === "pos" || ruta === "linkpago") && (
                        <Input
                            size="sm"
                            label="Tarjeta"
                            placeholder="4 dígitos"
                            type="text"
                            inputMode="numeric"
                            maxLength={4}
                            value={numeroTarjeta}
                            onChange={(value) => setNumeroTarjeta(value.replace(/\D/g, "").slice(0, 4))}
                            className={ruta === "pos" ? "order-2 w-full min-w-0 xl:w-[10ch] xl:shrink-0" : "w-full min-w-0 xl:w-[10ch] xl:shrink-0"}
                        />
                    )}
                    <div className={ruta === "pos" ? "order-3 flex w-full min-w-0 items-end gap-2 xl:max-w-[12rem]" : "flex w-full min-w-0 items-end gap-2 xl:max-w-[12rem]"}>
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
                        className={ruta === "pos" ? "order-4 w-full min-w-0 flex-1 xl:min-w-[14ch]" : "w-full min-w-0 flex-1 xl:min-w-[14ch]"}
                    />
                    {ruta === "pos" && (
                        <Input
                            size="sm"
                            label="Email"
                            type="email"
                            placeholder="Correo del cliente"
                            value={email}
                            onChange={setEmail}
                            className="order-5 w-full min-w-0 xl:w-[15ch] xl:shrink-0"
                        />
                    )}
                    <Input
                        size="sm"
                        label="Whatsapp"
                        placeholder="Número de WhatsApp"
                        value={whatsapp}
                        onChange={(value) => setWhatsapp(value.replace(/\D/g, "").slice(0, 9))}
                        className={ruta === "pos" ? "order-6 w-full min-w-0 xl:min-w-[9ch] xl:max-w-[9rem]" : "w-full min-w-0 xl:min-w-[9ch] xl:max-w-[9rem]"}
                    />
                    <Input
                        size="sm"
                        label="Comunidad"
                        value={selectedCommunity?.nombre ?? ""}
                        isDisabled
                        className={ruta === "pos" ? "order-7 w-full max-w-[10ch] shrink-0" : "w-full max-w-[10ch] shrink-0"}
                    />
                    {ruta === "pos" && !isPosSinEnvio && (
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
                            className="order-8 w-full min-w-0 xl:w-[14ch] xl:shrink-0"
                        />
                    )}
                    <Input
                        size="sm"
                        label="Monto"
                        isRequired
                        placeholder="S/ 0.00"
                        value={monto}
                        onChange={(value) => setMonto(sanitizeAmountInput(value))}
                        className={ruta === "pos" ? "order-9 w-full min-w-0 xl:min-w-[8ch] xl:max-w-[9rem]" : "w-full min-w-0 xl:min-w-[8ch] xl:max-w-[9rem]"}
                    />
                    {ruta === "linkpago" && (
                        <div className="relative flex w-full min-w-0 flex-col gap-1 xl:w-[11rem] xl:shrink-0">
                            <span className="text-sm font-medium text-secondary">Fecha Deposito</span>
                            <Button
                                size="sm"
                                color="secondary"
                                iconLeading={CalendarIcon}
                                onClick={() => setIsFechaDepositoOpen((current) => !current)}
                                className="w-full justify-start"
                            >
                                {formatDateValue(fechaDeposito)}
                            </Button>
                            {isFechaDepositoOpen && (
                                <div className="absolute bottom-full left-0 z-50 mb-2 rounded-lg border border-secondary bg-primary p-3 shadow-lg">
                                    <Calendar value={stringToCalendarDate(fechaDeposito)} onChange={handleFechaDepositoChange}>
                                        <div />
                                    </Calendar>
                                </div>
                            )}
                        </div>
                    )}
                    {ruta === "pos" && (
                        <div className="order-12 flex w-full min-w-0 justify-end gap-2 xl:ml-auto xl:w-[calc(14ch+9rem+0.5rem)]">
                            <Button
                                size="sm"
                                color="primary"
                                iconLeading={Save01}
                                isLoading={isSaving}
                                onClick={handleSave}
                                className="min-w-0 flex-1"
                            >
                                Guardar
                            </Button>
                            <Button
                                size="sm"
                                color="secondary"
                                iconLeading={XClose}
                                isDisabled={isSaving}
                                onClick={handleClear}
                                className="min-w-0 flex-1"
                            >
                                Cancelar
                            </Button>
                        </div>
                    )}
                </div>
                {ruta !== "pos" && (
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
                )}
            </div>
        </InlineFormCard>
    );
};
