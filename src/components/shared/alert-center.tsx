import {
    Children,
    type ComponentType,
    type ReactNode,
    createContext,
    isValidElement,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useToast } from "@/providers/toast-provider";
import { type AlertTone, ValidationAlert } from "./validation-alert";

/** Con `null` en el texto cierra el aviso que esté a la vista. */
type Notify = (tone: AlertTone, text: string | null) => void;

const alertText = (tone: AlertTone, text: string) => {
    if (tone === "error") return text.trim() ? text : "No se pudo completar la solicitud.";
    const value = text.trim();
    return value && !/[.!?]$/.test(value) ? `${value}.` : value;
};

const AlertContext = createContext<{ notify: Notify; withdraw: (tone: AlertTone, text: string) => void } | null>(null);

/** Centro de avisos de una pantalla: todos los mensajes salen con el mismo formato de `ValidationAlert`. */
export const AlertProvider = ({ children }: { children: ReactNode }) => {
    const sequence = useRef(0);
    const [queue, setQueue] = useState<Array<{ id: number; tone: AlertTone; text: string }>>([]);
    const notify = useCallback<Notify>((tone, text) => {
        if (text === null || (!text.trim() && tone !== "error")) {
            setQueue((current) => current.slice(1));
            return;
        }
        const message = alertText(tone, text);
        const entry = { id: ++sequence.current, tone, text: message };
        const priority = (value: AlertTone) => (value === "error" ? 0 : value === "validation" ? 1 : 2);
        setQueue((current) =>
            current.some((item) => item.tone === tone && item.text === message)
                ? current
                : [...current, entry].sort((a, b) => priority(a.tone) - priority(b.tone) || a.id - b.id),
        );
    }, []);
    const alert = queue[0] ?? null;
    const items = useMemo(() => (alert ? [alert.text] : []), [alert]);
    const close = useCallback(() => setQueue((current) => current.slice(1)), []);
    const withdraw = useCallback((tone: AlertTone, text: string) => {
        const message = alertText(tone, text);
        setQueue((current) =>
            current.some((item) => item.tone === tone && item.text === message)
                ? current.filter((item) => item.tone !== tone || item.text !== message)
                : current,
        );
    }, []);
    const center = useMemo(() => ({ notify, withdraw }), [notify, withdraw]);
    return (
        <AlertContext.Provider value={center}>
            {children}
            <ValidationAlert key={alert?.id ?? "empty"} tone={alert?.tone ?? "info"} items={items} onClose={close} />
        </AlertContext.Provider>
    );
};

/** Coloca el centro dentro de cada página, también cuando se renderiza fuera del router. */
export const withAlertProvider = <Props extends object>(Component: ComponentType<Props>) => {
    const Page = (props: Props) => (
        <AlertProvider>
            <Component {...props} />
        </AlertProvider>
    );
    Page.displayName = `AlertPage(${Component.displayName || Component.name || "Page"})`;
    return Page;
};

const messageText = (children: ReactNode): string =>
    Children.toArray(children)
        .map((child) => {
            if (typeof child === "string" || typeof child === "number") return String(child);
            if (isValidElement<{ children?: ReactNode }>(child)) return messageText(child.props.children);
            return "";
        })
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

/** Lleva los estados de carga/error existentes al mismo centro sin eliminar reintentos ni validaciones. */
export const AlertMessage = ({ tone = "error", children }: { tone?: AlertTone; children: ReactNode }) => {
    const center = useContext(AlertContext);
    const text = messageText(children);
    const [dismissed, setDismissed] = useState<string | null>(null);
    const close = useCallback(() => setDismissed(text), [text]);
    const items = useMemo(() => (text ? [alertText(tone, text)] : []), [text, tone]);
    useEffect(() => {
        if (!center || !text) return;
        center.notify(tone, text);
        return () => center.withdraw(tone, text);
    }, [center, text, tone]);
    return center ? null : <ValidationAlert tone={tone} items={items} open={Boolean(text) && dismissed !== text} onClose={close} />;
};

/** Fuera de un `AlertProvider` cae al toast clásico para no romper pantallas que aún no migran. */
export const useAlert = (): Notify => {
    const notify = useContext(AlertContext)?.notify;
    let addToast: ReturnType<typeof useToast>["addToast"] | null = null;
    try {
        addToast = useToast().addToast;
    } catch {
        addToast = null;
    }
    const fallback = useCallback<Notify>(
        (tone, text) => text && addToast?.(tone === "success" ? "success" : tone === "info" || tone === "notice" ? "info" : "error", text),
        [addToast],
    );
    return notify ?? fallback;
};
