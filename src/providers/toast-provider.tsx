import type { ReactNode } from "react";
import { createContext, useContext, useRef, useState, useCallback, useMemo } from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration: number;
}

interface ToastContextType {
    toasts: Toast[];
    addToast: (type: ToastType, message: string, duration?: number) => void;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = (): ToastContextType => {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
};

const DEFAULT_DURATION = 4000;

let toastIdCounter = 0;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const removeToast = useCallback((id: string) => {
        const timer = timersRef.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(id);
        }
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const addToast = useCallback(
        (type: ToastType, message: string, duration = DEFAULT_DURATION) => {
            const id = `toast-${++toastIdCounter}-${Date.now()}`;
            const toast: Toast = { id, type, message, duration };
            setToasts((prev) => [...prev, toast]);
            const timer = setTimeout(() => removeToast(id), duration);
            timersRef.current.set(id, timer);
        },
        [removeToast],
    );

    const value = useMemo(() => ({ toasts, addToast, removeToast }), [toasts, addToast, removeToast]);

    return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};
