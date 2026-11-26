import type { ReactNode } from "react";

/** Superficie del piloto: cabecera y contenido separados por una línea. */
export const LlamadasPanel = ({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) => (
    <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-secondary bg-primary shadow-xs">
        <div className="flex items-center justify-between gap-3 border-b border-secondary bg-secondary px-4 py-3">
            <h2 className="text-xs font-medium text-tertiary">{title}</h2>
            {trailing}
        </div>
        <div className="flex-1 p-4">{children}</div>
    </section>
);
