import { useCallback, useRef, useState } from "react";

export type ToastType = "success" | "error" | "info";

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration: number;
}

interface UseToastReturn {
    toasts: Toast[];
    addToast: (type: ToastType, message: string, duration?: number) => void;
    removeToast: (id: string) => void;
}

const DEFAULT_DURATION = 4000;

let toastIdCounter = 0;

export const useToast = (): UseToastReturn => {
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

    return { toasts, addToast, removeToast };
};
