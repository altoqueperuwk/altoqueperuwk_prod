import { useEffect, useRef } from "react";

interface Turnstile {
    render: (container: HTMLElement, options: Record<string, unknown>) => string;
    remove: (id: string) => void;
}
declare global {
    interface Window {
        turnstile?: Turnstile;
    }
}
let scriptReady: Promise<void> | undefined;
function loadScript() {
    if (window.turnstile) return Promise.resolve();
    if (!scriptReady)
        scriptReady = new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => {
                script.remove();
                scriptReady = undefined;
                reject(new Error("No se pudo cargar la verificación"));
            };
            document.head.append(script);
        });
    return scriptReady;
}
export const CalificacionCaptcha = ({ onToken, onError, attempt }: { onToken: (token: string) => void; onError: (error: string) => void; attempt: number }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        let cancelled = false;
        let widget: string | undefined;
        const key = import.meta.env.VITE_TURNSTILE_SITE_KEY;
        if (!key) {
            onError("Falta configurar la verificación de seguridad del formulario");
            return;
        }
        loadScript()
            .then(() => {
                if (cancelled || !ref.current || !window.turnstile) return;
                widget = window.turnstile.render(ref.current, {
                    sitekey: key,
                    action: "calificacion",
                    callback: onToken,
                    "expired-callback": () => onToken(""),
                    "error-callback": () => {
                        onToken("");
                        onError("Reintenta la verificación de seguridad");
                    },
                });
            })
            .catch((error) => {
                if (!cancelled) onError(error.message);
            });
        return () => {
            cancelled = true;
            if (widget !== undefined) window.turnstile?.remove(widget);
        };
    }, [onToken, onError, attempt]);
    return <div ref={ref} aria-label="Verificación de seguridad" />;
};
