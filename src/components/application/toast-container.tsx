import { X } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "@/providers/toast-provider";
import { cx } from "@/utils/cx";

type ToastType = "success" | "error" | "info";

const borderColorMap: Record<ToastType, string> = {
    success: "border-l-fg-success-secondary",
    error: "border-l-fg-error-secondary",
    info: "border-l-fg-brand-secondary",
};

export function ToastContainer() {
    const { toasts, removeToast } = useToast();

    return (
        <div className="pointer-events-none fixed right-4 bottom-4 z-[9999] flex flex-col-reverse gap-2">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, x: 80, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 80, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className={cx(
                            "pointer-events-auto flex items-start gap-3 rounded-lg bg-primary-solid p-4 shadow-lg border-l-4",
                            borderColorMap[toast.type],
                        )}
                    >
                        <p className="min-w-0 flex-1 text-sm text-white">{toast.message}</p>
                        <button
                            type="button"
                            onClick={() => removeToast(toast.id)}
                            className="shrink-0 cursor-pointer rounded p-0.5 text-white/60 transition duration-100 ease-linear hover:text-white"
                        >
                            <X className="size-4" />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
