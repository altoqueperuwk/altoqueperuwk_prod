import { useCallback, useEffect, useRef, useState } from "react";
import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";
import { useParams } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { AlertMessage, withAlertProvider } from "@/components/shared/alert-center";
import { CalificacionCaptcha } from "./calificacion-captcha";
import { type CalificacionContextoPublico, calificacionPublicaService } from "./calificacion-publica.service";

export const CalificacionPublicaPage = withAlertProvider(() => {
    const { token = "" } = useParams();
    const [contexto, setContexto] = useState<CalificacionContextoPublico | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [estrellas, setEstrellas] = useState(0);
    const [dni, setDni] = useState("");
    const [comentario, setComentario] = useState("");
    const [captcha, setCaptcha] = useState("");
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const submission = useRef<{ fingerprint: string; key: string } | null>(null);
    const locked = useRef(false);
    const captchaError = useCallback((message: string) => setError(message), []);
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setContexto(null);
        setError("");
        setSent(false);
        setEstrellas(0);
        setDni("");
        setComentario("");
        setCaptcha("");
        submission.current = null;
        if (!/^[a-f0-9]{64}$/.test(token)) {
            setError("Enlace no disponible.");
            setLoading(false);
            return;
        }
        calificacionPublicaService
            .publica<CalificacionContextoPublico>({ action: "contexto", token })
            .then((data) => {
                if (!cancelled) setContexto(data);
            })
            .catch((cause) => {
                if (!cancelled) setError(cause instanceof Error ? cause.message : "Enlace no disponible.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [token]);
    const enviar = async () => {
        if (!contexto || locked.current || sent) return;
        if (
            !estrellas ||
            (contexto.politica.dni_obligatorio && !dni) ||
            (dni && !/^\d{8}$/.test(dni)) ||
            (contexto.politica.comentario_obligatorio && !comentario.trim())
        ) {
            setError("Selecciona las estrellas y completa los campos requeridos.");
            return;
        }
        if (!captcha) {
            setError("Completa la verificación de seguridad");
            return;
        }
        const fingerprint = JSON.stringify([token, estrellas, dni.trim(), comentario.trim()]);
        if (submission.current?.fingerprint !== fingerprint) submission.current = { fingerprint, key: crypto.randomUUID() };
        locked.current = true;
        setSending(true);
        setError("");
        try {
            const result = await calificacionPublicaService.publica<{ recibido: boolean }>({
                action: "enviar",
                token,
                clave: submission.current.key,
                estrellas,
                dni: dni.trim(),
                comentario: comentario.trim(),
                captcha,
            });
            if (!result.recibido) throw new Error("No se pudo confirmar la recepción.");
            setSent(true);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "No se pudo enviar la calificación.");
            setCaptcha("");
            setAttempt((value) => value + 1);
        } finally {
            locked.current = false;
            setSending(false);
        }
    };
    return (
        <main className="flex min-h-dvh items-center justify-center bg-secondary p-4">
            <section className="w-full max-w-md space-y-5 rounded-2xl border border-secondary bg-primary p-6 shadow-lg">
                <header>
                    <p className="text-sm font-semibold text-brand-secondary">Al Toque Perú</p>
                    <h1 className="mt-1 text-xl font-semibold text-primary">Califica tu atención</h1>
                </header>
                {loading && (
                    <p role="status" className="text-sm text-tertiary">
                        Cargando…
                    </p>
                )}
                {sent ? (
                    <div role="status" className="space-y-2">
                        <h2 className="font-semibold text-success-primary">Gracias por tu calificación</h2>
                        <p className="text-sm text-secondary">Tu respuesta fue recibida. Puedes cerrar esta página.</p>
                    </div>
                ) : (
                    contexto && (
                        <>
                            <div className="rounded-lg bg-secondary p-3">
                                <p className="font-semibold text-primary">{contexto.asesor}</p>
                                <p className="text-sm text-tertiary">{contexto.sede}</p>
                            </div>
                            <fieldset disabled={sending} className="space-y-4">
                                <legend className="mb-2 text-sm font-medium text-secondary">¿Cómo fue tu experiencia?</legend>
                                <AriaRadioGroup
                                    aria-label="Estrellas"
                                    orientation="horizontal"
                                    value={String(estrellas)}
                                    onChange={(value) => setEstrellas(Number(value))}
                                    isDisabled={sending}
                                    className="flex justify-between gap-2"
                                >
                                    {[1, 2, 3, 4, 5].map((n) => (
                                        <AriaRadio
                                            key={n}
                                            value={String(n)}
                                            aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
                                            className="flex size-12 cursor-pointer items-center justify-center rounded-lg border border-secondary bg-primary text-xl outline-brand focus-visible:outline-2"
                                        >
                                            <span aria-hidden="true" className={n <= estrellas ? "text-warning-primary" : "text-tertiary"}>
                                                ★
                                            </span>
                                        </AriaRadio>
                                    ))}
                                </AriaRadioGroup>
                                <Input
                                    label={contexto.politica.dni_obligatorio ? "DNI" : "DNI (opcional)"}
                                    isRequired={contexto.politica.dni_obligatorio}
                                    value={dni}
                                    onChange={setDni}
                                    inputMode="numeric"
                                    maxLength={8}
                                />
                                <TextArea
                                    label={contexto.politica.comentario_obligatorio ? "Comentario" : "Comentario (opcional)"}
                                    isRequired={contexto.politica.comentario_obligatorio}
                                    value={comentario}
                                    onChange={setComentario}
                                    maxLength={1000}
                                    rows={3}
                                />
                                <CalificacionCaptcha onToken={setCaptcha} onError={captchaError} attempt={attempt} />
                                <p className="text-xs text-tertiary">Usaremos tu respuesta para evaluar la atención recibida. No necesitas crear una cuenta.</p>
                            </fieldset>
                            <Button className="w-full" onClick={enviar} isDisabled={sending || !captcha} isLoading={sending}>
                                Enviar calificación
                            </Button>
                        </>
                    )
                )}
                {error && !sent && <AlertMessage tone="error">{error}</AlertMessage>}
            </section>
        </main>
    );
});
