import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { bancoService } from "@/services/banco.service";
import { codigoServicioService } from "@/services/codigo-servicio.service";
import { comunidadService } from "@/services/comunidad.service";
import { estadoService } from "@/services/estado.service";
import { InlineFormCard } from "@/features/operaciones/efectivizacion/shared/components/inline-form-card";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { OperacionRuta, RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";

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
}

const getServicioNeedle = (ruta: OperacionRuta) => (ruta === "pos" ? "POS" : "LINK");

const isDigitalWallet = (item: BancoDestino) => {
    const name = String(item.nombre ?? "").trim().toUpperCase();
    return name === "YAPE" || name === "PLIN";
};

export const AsistidaSolicitudForm = ({ activeCompany, onSaved, ruta }: AsistidaSolicitudFormProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [codigoOperacion, setCodigoOperacion] = useState("");
    const [dni, setDni] = useState("");
    const [monto, setMonto] = useState("");
    const [comunidadId, setComunidadId] = useState("");
    const [comunidades, setComunidades] = useState<CatalogItem[]>([]);
    const [servicio, setServicio] = useState<CatalogItem | null>(null);
    const [estadoSolicitado, setEstadoSolicitado] = useState<CatalogItem | null>(null);
    const [bancosDestino, setBancosDestino] = useState<BancoDestino[]>([]);
    const [bancoDestinoId, setBancoDestinoId] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const selectedCommunity = useMemo(
        () => comunidades.find((item) => String(item.id) === comunidadId) ?? null,
        [comunidadId, comunidades],
    );
    const selectedBancoDestino = useMemo(
        () => bancosDestino.find((item) => String(item.id) === bancoDestinoId) ?? null,
        [bancoDestinoId, bancosDestino],
    );
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;
    const routeLabel = getRutaLabel(ruta);

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

                if (!comunidadId && comunidadItems[0]) setComunidadId(String(comunidadItems[0].id));
            })
            .catch(() => addToast("error", "Error al cargar catalogos de solicitud."));

        return () => {
            ignore = true;
        };
    }, [addToast, comunidadId, ruta]);

    useEffect(() => {
        if (ruta !== "pos") {
            setBancosDestino([]);
            setBancoDestinoId("");
            return;
        }

        let ignore = false;

        bancoService
            .getList({ p_id_estado: 1 })
            .then((rows) => {
                if (ignore) return;
                const items = rows
                    .map((row) => ({
                        id: Number(row.id),
                        nombre: String(row.nombre ?? ""),
                    }))
                    .filter((item) => !isDigitalWallet(item));
                setBancosDestino(items);
                setBancoDestinoId("");
            })
            .catch(() => addToast("error", "Error al cargar bancos destino para POS."));

        return () => {
            ignore = true;
        };
    }, [addToast, ruta]);

    const handleSave = async () => {
        const amount = Number(monto.replace(",", "."));

        if (!servicio) {
            addToast("error", `No se encontro el servicio ${routeLabel}.`);
            return;
        }

        if (!estadoSolicitado) {
            addToast("error", "No se encontro el estado Solicitado.");
            return;
        }

        if (!selectedCommunity) {
            addToast("error", "La comunidad es obligatoria.");
            return;
        }

        if (ruta === "pos" && !selectedBancoDestino) {
            addToast("error", "Selecciona el banco destino para POS.");
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
            const now = new Date().toISOString();
            const result = await operacionesRpcService.postOperacionAsistida({
                p_ruta: ruta,
                p_id_codigo_servicio: servicio.id,
                p_nombre_codigo_servicio: servicio.nombre,
                p_tipo_servicio: routeLabel.toUpperCase(),
                p_id_comunidad: selectedCommunity.id,
                p_nombre_comunidad: selectedCommunity.nombre,
                p_dni_cliente: dni.trim(),
                p_monto_deposito_cliente: amount,
                p_codigo_operacion_deposito_cliente: codigoOperacion.trim() || null,
                p_id_estado: estadoSolicitado.id,
                p_nombre_estado: estadoSolicitado.nombre,
                p_id_usuario: userId,
                p_nombre_usuario: userName,
                p_id_usuario_gestor: userId,
                p_nombre_usuario_gestor: userName,
                p_id_usuario_solicitud: userId,
                p_nombre_usuario_solicitud: userName,
                p_id_banco_destino: ruta === "pos" ? selectedBancoDestino?.id : null,
                p_fecha_registro: now,
            });

            if (result && "error" in result) {
                throw new Error(String((result as Record<string, unknown>).error));
            }

            setCodigoOperacion("");
            setDni("");
            setMonto("");
            setBancoDestinoId("");
            onSaved();
            addToast("success", "Solicitud registrada correctamente.");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al registrar la solicitud.";
            addToast("error", message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <InlineFormCard title={`Solicitud ${routeLabel}${activeCompany ? `: ${activeCompany.nombre_empresa}` : ""}`}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Input size="sm" label="Codigo Operacion" placeholder="Opcional" value={codigoOperacion} onChange={setCodigoOperacion} />
                <Input size="sm" label="DNI" placeholder="Documento" value={dni} onChange={setDni} />
                <Input size="sm" label="Monto" placeholder="S/ 0.00" value={monto} onChange={setMonto} />
                <NativeSelect
                    size="sm"
                    label="Comunidad"
                    value={comunidadId}
                    onChange={(event) => setComunidadId(event.currentTarget.value)}
                    options={comunidades.map((item) => ({ label: item.nombre, value: String(item.id) }))}
                />
                {ruta === "pos" && (
                    <NativeSelect
                        size="sm"
                        label="Banco destino"
                        value={bancoDestinoId}
                        onChange={(event) => setBancoDestinoId(event.currentTarget.value)}
                        options={[
                            { label: "Seleccionar banco destino", value: "", disabled: true },
                            ...bancosDestino.map((item) => ({
                                label: item.nombre,
                                value: String(item.id),
                            })),
                        ]}
                        className="md:col-span-4"
                    />
                )}
                <div className="flex justify-end gap-2 md:col-span-4">
                    <Button
                        size="sm"
                        color="secondary"
                        isDisabled={isSaving}
                        onClick={() => {
                            setCodigoOperacion("");
                            setDni("");
                            setMonto("");
                            setBancoDestinoId("");
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
