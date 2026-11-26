import { AlertCircle, CheckCircle } from "@untitledui/icons";

/** Aviso compacto con iconos Untitled UI y tokens semanticos del proyecto. */
export const InlineAlert = ({ title, description, success = false }: { title: string; description?: string; success?: boolean }) => {
    const Icon = success ? CheckCircle : AlertCircle;
    return (
        <div
            role={success ? "status" : "alert"}
            className={`flex items-start gap-3 rounded-xl border p-3 ${success ? "border-utility-green-200 bg-utility-green-50 text-success-primary" : "border-utility-yellow-200 bg-utility-yellow-50 text-warning-primary"}`}
        >
            <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0">
                <p className="text-sm font-semibold">{title}</p>
                {description && <p className="mt-1 text-xs">{description}</p>}
            </div>
        </div>
    );
};
