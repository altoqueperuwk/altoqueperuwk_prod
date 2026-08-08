import { useClipboard } from "@/hooks/use-clipboard";
import { useToast } from "@/providers/toast-provider";
import { cx } from "@/utils/cx";

interface CopyableDniProps {
    value: string | number | null | undefined;
    className?: string;
}

export const CopyableDni = ({ className, value }: CopyableDniProps) => {
    const { copy } = useClipboard();
    const { addToast } = useToast();
    const text = value == null ? "" : String(value).trim();

    if (!text) return <span className={className}>-</span>;

    const handleCopy = async () => {
        const result = await copy(text);
        addToast(result.success ? "success" : "error", result.success ? "DNI copiado." : "No se pudo copiar el DNI.");
    };

    return (
        <button
            type="button"
            className={cx("inline-flex cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-primary", className)}
            onClick={() => void handleCopy()}
            aria-label={`Copiar DNI ${text}`}
        >
            {text}
        </button>
    );
};
