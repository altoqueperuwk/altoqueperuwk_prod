import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { type ComunidadesCalificacion, configuracionService } from "./configuracion.service";

const errorText = (cause: unknown, fallback: string) => (cause && typeof cause === "object" && "message" in cause ? String(cause.message) : fallback);

/** Comunidades cuya efectivización paga la Atención Calificada de ATC y Jefatura. Pago Deuda siempre cuenta. */
export const ConfiguracionComunidadesCalificacion = () => {
    const notify = useAlert();
    const [data, setData] = useState<ComunidadesCalificacion | null>(null);
    const [selected, setSelected] = useState<number[]>([]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const request = useRef(0);
    const mounted = useRef(false);
    const lock = useRef(false);
    const load = useCallback(async () => {
        if (!mounted.current) return;
        const current = ++request.current;
        setError("");
        try {
            const value = await configuracionService.getRatingCommunities();
            if (!mounted.current || current !== request.current) return;
            setData(value);
            setSelected(value.comunidades.filter((item) => item.elegible).map((item) => item.id));
        } catch (cause) {
            if (mounted.current && current === request.current) setError(errorText(cause, "No se pudieron cargar las comunidades."));
        }
    }, []);
    useEffect(() => {
        mounted.current = true;
        void load();
        return () => {
            mounted.current = false;
            request.current++;
        };
    }, [load]);
    const save = async () => {
        if (lock.current || !data) return;
        lock.current = true;
        setBusy(true);
        try {
            const value = await configuracionService.saveRatingCommunities(selected);
            if (!mounted.current) return;
            setData(value);
            setSelected(value.comunidades.filter((item) => item.elegible).map((item) => item.id));
            notify("success", "Comunidades elegibles guardadas para nuevas aprobaciones.");
        } catch (cause) {
            if (mounted.current) notify("error", errorText(cause, "No se pudieron guardar las comunidades."));
        } finally {
            lock.current = false;
            if (mounted.current) setBusy(false);
        }
    };
    if (error)
        return (
            <section className="rounded-xl border border-secondary bg-primary p-4">
                <AlertMessage tone="error">{error}</AlertMessage>
                <Button className="mt-3" size="sm" color="primary" iconLeading={RefreshCw01} onClick={() => void load()}>
                    Reintentar comunidades
                </Button>
            </section>
        );
    if (!data)
        return (
            <p role="status" className="text-sm text-tertiary">
                Cargando comunidades…
            </p>
        );
    const initial = data.comunidades.filter((item) => item.elegible).map((item) => item.id);
    const changed = !data.configurado || JSON.stringify([...selected].sort((a, b) => a - b)) !== JSON.stringify([...initial].sort((a, b) => a - b));
    return (
        <CompensacionPanel title="Comunidades con Comisión General">
            <p className="text-xs text-tertiary">Pagan con comisión general (1% o 2%). Pago Deuda siempre cuenta.</p>
            {!data.configurado && <AlertMessage tone="notice">Sin lista guardada: hoy no se restringe por comunidad.</AlertMessage>}
            {data.configurado && selected.length === 0 && (
                <AlertMessage tone="error">Sin comunidades marcadas, ninguna efectivizacion con comunidad pagará.</AlertMessage>
            )}
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
                {data.comunidades.map((item) => (
                    <Checkbox
                        key={item.id}
                        label={item.nombre}
                        isSelected={selected.includes(item.id)}
                        isDisabled={busy}
                        onChange={(value) => setSelected((current) => (value ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id)))}
                    />
                ))}
                {!data.comunidades.length && <p className="text-sm text-tertiary">No hay comunidades activas.</p>}
            </div>
            <Button size="sm" className="mt-4" aria-label="Guardar comunidades" isDisabled={!changed} isLoading={busy} onClick={() => void save()}>
                Guardar
            </Button>
        </CompensacionPanel>
    );
};
