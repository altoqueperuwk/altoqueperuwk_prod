import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { CompensacionDialogHeader } from "./compensacion-dialog-chrome";
import { CompensacionSurface } from "./compensacion-surface";

export interface CompensacionInfoDialogProps {
    title: string;
    resumen: { concepto: string; tipo: { label: string; tone?: StatusTone }; monto?: string; observacion: string }[];
    pasos: string[];
    nota?: string;
    onClose: () => void;
}

/** Ayuda de lectura; no consulta ni modifica información del trabajador. */
export const CompensacionInfoDialog = ({ title, resumen, pasos, nota, onClose }: CompensacionInfoDialogProps) => (
    <CompensacionSurface title={title} onClose={onClose}>
        <div className="mx-auto flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-secondary bg-primary text-sm font-normal text-secondary shadow-xl">
            <CompensacionDialogHeader title={title} onClose={onClose} />
            <div className="space-y-5 p-4">
                <section aria-label="Qué se paga" className="space-y-2">
                    <h3 className="text-xs font-medium text-tertiary">Qué se paga</h3>
                    <div className="space-y-3">
                        {resumen.map((item, index) => (
                            <dl key={`${item.concepto}-${index}`} className="divide-y divide-secondary rounded-lg border border-secondary text-sm font-normal">
                                <div className="flex items-start justify-between gap-4 px-3 py-2.5">
                                    <dt className="shrink-0 text-tertiary">Concepto</dt>
                                    <dd className="min-w-0 text-right text-primary">{item.concepto}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-4 px-3 py-2.5">
                                    <dt className="text-tertiary">Tipo</dt>
                                    <dd className="min-w-0 [&>span]:text-sm">
                                        <StatusBadge tone={item.tipo.tone}>{item.tipo.label}</StatusBadge>
                                    </dd>
                                </div>
                                {item.monto && (
                                    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
                                        <dt className="shrink-0 text-tertiary">Monto</dt>
                                        <dd className="min-w-0 text-right text-primary tabular-nums">{item.monto}</dd>
                                    </div>
                                )}
                                <div className="flex items-start justify-between gap-4 px-3 py-2.5">
                                    <dt className="shrink-0 text-tertiary">Observación</dt>
                                    <dd className="min-w-0 text-right">{item.observacion}</dd>
                                </div>
                            </dl>
                        ))}
                    </div>
                </section>
                <section aria-label="Cómo funciona" className="space-y-2">
                    <h3 className="text-xs font-medium text-tertiary">Cómo funciona</h3>
                    <ol className="space-y-2.5">
                        {pasos.map((paso, index) => (
                            <li key={`${paso}-${index}`} className="flex items-start gap-3">
                                <span
                                    aria-hidden="true"
                                    className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs text-tertiary tabular-nums"
                                >
                                    {index + 1}
                                </span>
                                <span className="leading-5">{paso}</span>
                            </li>
                        ))}
                    </ol>
                </section>
                {nota && <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-tertiary">{nota}</p>}
            </div>
        </div>
    </CompensacionSurface>
);
