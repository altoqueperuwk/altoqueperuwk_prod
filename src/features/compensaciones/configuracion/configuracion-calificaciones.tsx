import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { AlertMessage } from "@/components/shared/alert-center";
import { CalificacionValidez } from "../evidencias/calificacion-validez";
import { evidenciasService } from "../evidencias/evidencias.service";
import type { CalificacionPolitica } from "../evidencias/evidencias.types";

export const ConfiguracionCalificaciones = () => {
    const [policy, setPolicy] = useState<CalificacionPolitica | null>(null);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const request = useRef(0);
    const mounted = useRef(false);
    const load = useCallback(async () => {
        if (!mounted.current) return;
        const current = ++request.current;
        setError("");
        setPolicy(null);
        try {
            const types = await evidenciasService.getTypes();
            if (!mounted.current || current !== request.current) return;
            const type = types.find((item) => item.codigo === "CALIFICACION_PRESENCIAL");
            if (!type) throw new Error("No está habilitada la calificación presencial.");
            const value = type.configuracion.validez_calificacion;
            const rules = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
            setPolicy({
                dni_obligatorio: rules.dni_obligatorio !== false,
                comentario_obligatorio: rules.comentario_obligatorio === true,
                asesor_obligatorio: rules.asesor_obligatorio === true,
            });
            setRevision((current) => current + 1);
        } catch (cause) {
            if (!mounted.current || current !== request.current) return;
            setError(
                cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudieron cargar los requisitos de calificaciones.",
            );
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
    if (error)
        return (
            <section className="rounded-xl border border-secondary bg-primary p-4">
                <AlertMessage tone="error">{error}</AlertMessage>
                <Button size="sm" color="primary" iconLeading={RefreshCw01} onClick={() => void load()}>
                    Reintentar requisitos
                </Button>
            </section>
        );
    if (!policy)
        return (
            <p role="status" className="text-sm text-tertiary">
                Cargando requisitos de calificaciones…
            </p>
        );
    return <CalificacionValidez key={revision} politica={policy} puedeConfigurar onSave={() => void load()} />;
};
