import { type FC, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, AlertTriangle, CheckCircle, InfoCircle, Lightbulb02, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";

export type AlertTone = "error" | "validation" | "notice" | "success" | "info";

/** El encabezado se une al mensaje ("Listo, tarjeta guardada."): la primera letra baja con CSS para no alterar el texto. */
const joinsLower = (text: string) => /^\p{Lu}\p{Ll}/u.test(text);

const TONES: Record<
    AlertTone,
    { title: string; icon: FC<{ className?: string }>; iconClass: string; barClass: string; duration: number; role: "alert" | "status" }
> = {
    error: { title: "Error", icon: AlertCircle, iconClass: "text-fg-error-secondary", barClass: "bg-error-solid", duration: 8000, role: "alert" },
    validation: {
        title: "Revisa los datos",
        icon: AlertTriangle,
        iconClass: "text-fg-brand-secondary",
        barClass: "bg-brand-solid",
        duration: 8000,
        role: "alert",
    },
    notice: { title: "Aviso", icon: InfoCircle, iconClass: "text-utility-blue-500", barClass: "bg-utility-blue-500", duration: 6000, role: "status" },
    success: { title: "Listo", icon: CheckCircle, iconClass: "text-fg-success-secondary", barClass: "bg-success-solid", duration: 3000, role: "status" },
    info: { title: "Dato", icon: Lightbulb02, iconClass: "text-fg-quaternary", barClass: "bg-fg-quaternary", duration: 5000, role: "status" },
};

/**
 * Aviso abajo al centro, de una sola línea (hasta ~150 caracteres) y con barra de autocierre visible. Cada tipo trae su
 * encabezado ("Listo, ", "Revisa los datos, "…) que se une al mensaje, icono, color y duración; `duration` solo se pasa si el aviso necesita otro valor.
 */
export const ValidationAlert = ({
    items,
    onClose,
    duration,
    tone = "validation",
    open = items.length > 0,
}: {
    items: string[];
    onClose: () => void;
    duration?: number;
    tone?: AlertTone;
    /** Por defecto se muestra cuando hay elementos; úsalo para avisos que solo llevan título. */
    open?: boolean;
}) => {
    const config = TONES[tone];
    const message =
        items.length <= 1
            ? (items[0] ?? "")
            : `${items
                  .map((item) => item.trim().replace(/[.;]+$/, ""))
                  .filter(Boolean)
                  .join(", ")}.`;
    const Icon = config.icon;
    const ms = duration ?? config.duration;
    const closeRef = useRef(onClose);
    useEffect(() => {
        closeRef.current = onClose;
    }, [onClose]);
    useEffect(() => {
        if (!open) return;
        const timer = setTimeout(() => closeRef.current(), ms);
        return () => clearTimeout(timer);
    }, [open, items.join("|"), ms]);

    if (typeof document === "undefined") return null;
    return createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[9999] flex justify-center px-4">
            <AnimatePresence>
                {open && (
                    <motion.div
                        key="validation-alert"
                        role={config.role}
                        initial={{ opacity: 0, y: 16, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        className="pointer-events-auto relative w-fit max-w-[min(1100px,100%)] overflow-hidden rounded-xl border border-secondary bg-primary py-3 pr-9 pl-3.5 shadow-lg"
                    >
                        <div className="flex items-start gap-2.5">
                            <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${config.iconClass}`} />
                            <p className="min-w-0 flex-1 text-sm leading-5 text-secondary">
                                <span className="font-semibold text-primary">{config.title}</span>
                                {message && (
                                    <>
                                        <span>{", "}</span>
                                        <span className={joinsLower(message) ? "inline-block first-letter:lowercase" : undefined}>{message}</span>
                                    </>
                                )}
                            </p>
                        </div>
                        <button
                            type="button"
                            aria-label="Cerrar aviso"
                            onClick={onClose}
                            className="absolute top-2.5 right-2.5 cursor-pointer rounded p-0.5 text-fg-quaternary transition duration-100 ease-linear hover:text-fg-quaternary_hover"
                        >
                            <XClose aria-hidden="true" className="size-4" />
                        </button>
                        <motion.div
                            key={items.join("|")}
                            aria-hidden="true"
                            className={`absolute bottom-0 left-0 h-[3px] ${config.barClass}`}
                            initial={{ width: "100%" }}
                            animate={{ width: "0%" }}
                            transition={{ duration: ms / 1000, ease: "linear" }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>,
        document.body,
    );
};
