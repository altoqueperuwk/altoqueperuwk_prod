import { useEffect, useRef, useState } from "react";
import QRCodeStyling from "qr-code-styling";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { type CalificacionAsesor, calificacionPublicaService, calificacionUrl } from "./calificacion-publica.service";

export const CalificacionEnlace = () => {
    const notify = useAlert();

    const [open, setOpen] = useState(false);
    const [asesores, setAsesores] = useState<CalificacionAsesor[]>([]);
    const [advisor, setAdvisor] = useState(0);
    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const [confirm, setConfirm] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const qr = useRef<QRCodeStyling | null>(null);
    const generationLock = useRef(false);
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setBusy(true);
        setError("");
        calificacionPublicaService
            .asesores()
            .then((rows) => {
                if (!cancelled) {
                    setAsesores(rows);
                    if (rows.length === 1) setAdvisor(rows[0].id);
                }
            })
            .catch((cause) => {
                if (!cancelled) setError(cause.message || "No se pudieron cargar los asesores");
            })
            .finally(() => {
                if (!cancelled) setBusy(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open]);
    useEffect(() => {
        if (!url || !ref.current) return;
        const element = ref.current;
        // Contraste fijo estándar del QR; independiente del tema de la aplicación.
        qr.current = new QRCodeStyling({ width: 220, height: 220, margin: 12, data: url, type: "svg" });
        qr.current.append(element);
        return () => {
            element.replaceChildren();
            qr.current = null;
        };
    }, [url, open]);
    const generar = async () => {
        if (!advisor || generationLock.current) return;
        generationLock.current = true;
        setBusy(true);
        setError("");

        try {
            const origin = import.meta.env.VITE_CALIFICACIONES_PUBLIC_ORIGIN || window.location.origin;
            calificacionUrl("0".repeat(64), origin); // Validar configuración antes de revocar el enlace anterior.
            const token = await calificacionPublicaService.generar(advisor);
            setUrl(calificacionUrl(token, origin));
            setConfirm(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "No se pudo generar el enlace");
        } finally {
            generationLock.current = false;
            setBusy(false);
        }
    };
    return (
        <section className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="font-semibold text-primary">Enlace y QR para clientes</h2>
                    <p className="text-sm text-tertiary">El cliente califica sin iniciar sesión. La respuesta llega pendiente de revisión.</p>
                </div>
                <Button color="secondary" size="sm" onClick={() => setOpen(!open)}>
                    {open ? "Ocultar enlace y QR" : "Compartir enlace y QR"}
                </Button>
            </div>
            {open && (
                <div className="mt-4 space-y-3">
                    <Select
                        label="Asesor del enlace"
                        placeholder={busy ? "Cargando asesores…" : "Selecciona un asesor"}
                        selectedKey={advisor || null}
                        isDisabled={busy}
                        items={asesores.map((row) => ({ id: row.id, label: `${row.nombre} · ${row.sede}` }))}
                        onSelectionChange={(key) => {
                            setAdvisor(Number(key));
                            setUrl("");
                            setConfirm(false);
                        }}
                    >
                        {(row) => <Select.Item id={row.id}>{row.label}</Select.Item>}
                    </Select>
                    <p className="text-xs text-tertiary">
                        Generar reemplaza el enlace y QR anteriores del asesor. Tiene vigencia de un año. Guarda o descarga el nuevo QR; por seguridad el enlace
                        completo se muestra solo al generarlo.
                    </p>
                    {!busy && !error && asesores.length === 0 && (
                        <p className="text-sm text-tertiary">No hay asesores activos con asignación vigente dentro de tu alcance.</p>
                    )}
                    {!confirm ? (
                        <Button size="sm" isDisabled={!advisor || busy} onClick={() => setConfirm(true)}>
                            Generar nuevo enlace
                        </Button>
                    ) : (
                        <div className="flex flex-wrap items-center gap-3">
                            <p className="text-sm text-warning-primary">¿Reemplazar cualquier enlace anterior de este asesor?</p>
                            <Button size="sm" isDisabled={busy} onClick={generar} isLoading={busy}>
                                Confirmar generación
                            </Button>
                            <Button size="sm" color="secondary" isDisabled={busy} onClick={() => setConfirm(false)}>
                                Cancelar
                            </Button>
                        </div>
                    )}
                    {url && (
                        <div className="flex flex-wrap items-center gap-4">
                            <div ref={ref} aria-label="QR de calificación" />
                            <div className="min-w-0 flex-1 space-y-3">
                                <a className="block text-sm break-all text-brand-secondary" href={url} target="_blank" rel="noreferrer">
                                    {url}
                                </a>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        size="sm"
                                        color="secondary"
                                        onClick={async () => {
                                            try {
                                                await navigator.clipboard.writeText(url);
                                                notify("success", "Enlace copiado.");
                                            } catch {
                                                setError("No se pudo copiar. Copia el enlace mostrado");
                                            }
                                        }}
                                    >
                                        Copiar enlace
                                    </Button>
                                    <Button
                                        size="sm"
                                        color="secondary"
                                        onClick={async () => {
                                            try {
                                                await qr.current?.download({ name: "calificacion-asesor", extension: "png" });
                                            } catch {
                                                setError("No se pudo descargar el QR");
                                            }
                                        }}
                                    >
                                        Descargar QR
                                    </Button>
                                </div>
                                {new URL(url).hostname === "localhost" && (
                                    <p className="text-sm text-warning-primary">
                                        Este enlace es local. Para usarlo desde un celular configura el dominio público HTTPS.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {error && <AlertMessage tone="error">{error}</AlertMessage>}
                </div>
            )}
        </section>
    );
};
