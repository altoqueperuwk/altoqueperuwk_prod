import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { AlertMessage } from "@/components/shared/alert-center";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { estadoVisual } from "@/features/compensaciones/shared/compensacion-estados";
import { EstrellasCell, missingAmountLabel } from "../shared/compensacion-cells";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { evidenciasService } from "./evidencias.service";
import type { EvidenciaEvento } from "./evidencias.types";
import { OperacionTrazabilidad } from "./operacion-trazabilidad";
import { tarjetasEvidenceService } from "./tarjetas-evidence.service";

const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const text = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : "");
const safeUrl = (value: unknown) => {
    try {
        const url = new URL(text(value));
        return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch {
        return "";
    }
};
const statusLabel = (value: string) => estadoVisual("aprobacion", value).label;

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="min-w-0">
        <dt className="text-xs text-tertiary">{label}</dt>
        <dd className="mt-1 text-xs break-words whitespace-pre-wrap text-primary">{children || "—"}</dd>
    </div>
);

/** Signed URLs remain scoped to this attachment and are discarded on item changes. */
const EvidenceAttachment = ({ entry, index }: { entry: unknown; index: number }) => {
    const value = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const path = text(value.path);
    const bucket = text(value.bucket);
    const privateFile = Boolean(path && ["compensaciones-tarjetas-erroneas", "compensaciones-tiktok-live"].includes(bucket));
    const [result, setResult] = useState<{ url?: string; error?: string } | null>(null);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        if (!privateFile) return;
        let active = true;
        setResult(null);
        const request =
            bucket === "compensaciones-tarjetas-erroneas" ? tarjetasEvidenceService.getCardEvidenceUrl(path) : evidenciasService.getTiktokEvidenceUrl(path);
        void request
            .then((url) => {
                if (active) setResult({ url: safeUrl(url) });
            })
            .catch(() => {
                if (active) setResult({ error: "No se pudo abrir el adjunto." });
            });
        return () => {
            active = false;
        };
    }, [bucket, path, privateFile, retry]);
    const url = privateFile ? result?.url : safeUrl(typeof entry === "string" ? entry : value.url);
    const name = text(value.nombre) || `Evidencia ${index + 1}`;
    if (url)
        return (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-secondary underline">
                {name}
            </a>
        );
    if (privateFile)
        return result?.error ? (
            <div className="flex flex-wrap items-center gap-2">
                <AlertMessage tone="error">{result.error}</AlertMessage>
                <Button size="sm" color="primary" onClick={() => setRetry((count) => count + 1)}>
                    Reintentar
                </Button>
            </div>
        ) : (
            <p role="status" className="text-xs text-tertiary">
                Cargando {name}…
            </p>
        );
    const label = (
        {
            FORMULARIO_PUBLICO: "Respuesta del cliente",
            REGISTRO_LLAMADA: "Registro de llamada",
            REGISTRO_TARJETA_TERCERO: "Registro de tarjeta de terceros",
        } as Record<string, string>
    )[text(value.tipo)];
    return <p className="text-xs text-secondary">{label || `${name} · Adjunto no disponible`}</p>;
};

/** Consultative detail; review actions belong to the caller. Card linkage keeps its existing permissions. */
export const EvidenciaCompactDetail = ({ item, onClose, onChanged }: { item: EvidenciaEvento; onClose: () => void; onChanged: () => void }) => {
    const isCard = item.categoria === "TARJETA_TERCERO";
    const isRating = item.categoria === "CALIFICACION";
    const { userId } = useCompensacionPerfil();
    const ownRecord = item.usuarioRegistraId === userId;
    const title = isCard ? "Detalle de Tarjeta Errónea" : isRating ? "Detalle de Atención Calificada" : "Detalle de Llamada";
    const document = text(
        item.datos.cliente_documento ?? item.datos.numero_documento ?? item.referencias.find((ref) => ref.tipoReferencia === "CLIENTE")?.identificadorExterno,
    );
    const references = item.referencias.filter((ref) => ["OPERACION", "PANCAKE"].includes(ref.tipoReferencia));
    const attachments = item.evidencia.filter((entry) => {
        if (typeof entry === "string") return Boolean(safeUrl(entry));
        if (!entry || typeof entry !== "object") return false;
        const value = entry as Record<string, unknown>;
        return Boolean(value.url || value.path);
    });
    return (
        <CompensacionSurface title={title} onClose={onClose}>
            <div className="relative mx-auto flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-primary shadow-xl">
                <CompensacionDialogHeader title={<>{title}</>} onClose={onClose}>
                    <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                            <CompensacionEstado dominio="registro" valor={item.estado} />
                            <CompensacionFechaCell value={item.fechaEvento} includeTime={!isCard} />
                        </div>
                    </div>
                </CompensacionDialogHeader>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="DNI">
                            <span className="whitespace-nowrap tabular-nums">{document || "—"}</span>
                        </Field>
                        <Field label="Cliente">{text(item.datos.cliente_nombre)}</Field>
                        {Boolean(item.datos.cliente_celular) && <Field label="Celular">{text(item.datos.cliente_celular)}</Field>}
                        {!ownRecord && <Field label="Colaborador">{item.beneficiarioNombre || item.usuarioRegistraNombre}</Field>}
                        <Field label="Comisión">{item.importeAprobado == null ? missingAmountLabel(item.estado) : money.format(item.importeAprobado)}</Field>
                        {isRating && (
                            <Field label="Calificación">
                                <EstrellasCell value={item.datos.estrellas} />
                            </Field>
                        )}
                    </dl>
                    {Boolean(item.titulo || item.descripcion || item.datos.comentario) && (
                        <CompensacionPanel title={isRating ? "Comentario del Cliente" : "Detalle"}>
                            {item.titulo && <p className="text-xs font-medium break-words whitespace-pre-wrap text-primary">{item.titulo}</p>}
                            {Boolean(item.descripcion || item.datos.comentario) && (
                                <p className="mt-1 text-xs break-words whitespace-pre-wrap text-secondary">{item.descripcion || text(item.datos.comentario)}</p>
                            )}
                        </CompensacionPanel>
                    )}
                    {isCard ? (
                        <OperacionTrazabilidad item={item} onChanged={onChanged} />
                    ) : (
                        references.length > 0 && (
                            <CompensacionPanel title="Referencias">
                                <div className="space-y-2 text-xs text-secondary">
                                    {references.map((ref) => (
                                        <p key={ref.id}>
                                            {ref.tipoReferencia === "OPERACION" ? (
                                                `Operación: ${text((item.datos.trazabilidad_operacion as Record<string, unknown> | undefined)?.codigo) || ref.idOperacion || ref.identificadorExterno || "—"}`
                                            ) : safeUrl(ref.identificadorExterno) ? (
                                                <a
                                                    className="text-brand-secondary underline"
                                                    href={safeUrl(ref.identificadorExterno)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    Abrir conversación de Pancake
                                                </a>
                                            ) : (
                                                "Conversación no disponible"
                                            )}
                                        </p>
                                    ))}
                                </div>
                            </CompensacionPanel>
                        )
                    )}
                    {attachments.length > 0 && (
                        <CompensacionPanel title={`Sustentos (${attachments.length})`}>
                            <div className="flex flex-col items-start gap-2">
                                {attachments.map((entry, index) => (
                                    <EvidenceAttachment key={`${JSON.stringify(entry)}:${index}`} entry={entry} index={index} />
                                ))}
                            </div>
                        </CompensacionPanel>
                    )}
                    {item.revisiones.length > 0 && (
                        <details className="rounded-xl border border-secondary p-3">
                            <summary className="cursor-pointer text-xs font-medium text-tertiary">Historial de Revisión ({item.revisiones.length})</summary>
                            <ul className="mt-3 space-y-3">
                                {item.revisiones.map((revision) => (
                                    <li key={revision.id} className="space-y-1 text-xs text-secondary">
                                        <p>
                                            {statusLabel(revision.decision)} · {revision.usuarioRevisorNombre}
                                        </p>
                                        <CompensacionFechaCell value={revision.fechaRegistro} />
                                        {revision.comentario && <p className="break-words whitespace-pre-wrap">{revision.comentario}</p>}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            </div>
        </CompensacionSurface>
    );
};
