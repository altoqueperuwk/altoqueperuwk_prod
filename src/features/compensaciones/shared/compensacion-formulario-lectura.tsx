import type { ReactNode } from "react";
import { Button } from "@/components/base/buttons/button";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "./compensacion-dialog-chrome";
import { CompensacionSurface } from "./compensacion-surface";

export interface FormularioCampo {
    label: string;
    value: ReactNode;
    /** Ocupa todo el ancho (textos largos). */
    completo?: boolean;
}
export interface FormularioSeccion {
    titulo: string;
    campos: FormularioCampo[];
}
export interface FormularioAccion {
    label: string;
    href: string;
}

/**
 * Formulario de solo lectura, igual para todos los registros de Compensaciones (bonos y penalidades):
 * etiqueta arriba y valor abajo, agrupado en secciones. No consulta nada; quien lo usa arma los datos.
 * El pie admite una acción opcional y se amplía luego con botones de decisión (modo Resolver).
 */
export const CompensacionFormularioLectura = ({
    titulo,
    etiqueta,
    secciones,
    accion,
    onClose,
}: {
    titulo: string;
    etiqueta?: ReactNode;
    secciones: FormularioSeccion[];
    accion?: FormularioAccion | null;
    onClose: () => void;
}) => (
    <CompensacionSurface title={titulo} onClose={onClose}>
        <section className="flex max-h-[calc(100dvh-3rem)] flex-col overflow-hidden rounded-2xl border border-secondary bg-primary shadow-xl">
            <CompensacionDialogHeader title={titulo} onClose={onClose}>
                {etiqueta}
            </CompensacionDialogHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
                {secciones.map((seccion) => (
                    <fieldset key={seccion.titulo} className="min-w-0">
                        <legend className="mb-2 text-xs font-semibold tracking-wide text-tertiary uppercase">{seccion.titulo}</legend>
                        <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                            {seccion.campos.map((campo) => (
                                <div key={campo.label} className={campo.completo ? "sm:col-span-2" : undefined}>
                                    <dt className="text-xs text-tertiary">{campo.label}</dt>
                                    <dd className="mt-0.5 text-sm break-words whitespace-pre-wrap text-primary">{campo.value}</dd>
                                </div>
                            ))}
                        </dl>
                    </fieldset>
                ))}
            </div>
            <CompensacionDialogFooter>
                {accion && (
                    <Button size="sm" color="secondary" href={accion.href}>
                        {accion.label}
                    </Button>
                )}
                <Button size="sm" color="primary" onClick={onClose}>
                    Cerrar
                </Button>
            </CompensacionDialogFooter>
        </section>
    </CompensacionSurface>
);
