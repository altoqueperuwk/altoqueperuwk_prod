import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw01 } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { AlertMessage, useAlert, withAlertProvider } from "@/components/shared/alert-center";
import { isAdministrator, useAuth } from "@/providers/auth-provider";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { ConfiguracionCalificaciones } from "./configuracion-calificaciones";
import { ConfiguracionComunidadesCalificacion } from "./configuracion-comunidades-calificacion";
import { ConfiguracionCondiciones } from "./configuracion-condiciones";
import { ConfiguracionOperativa } from "./configuracion-operativa";
import { ConfiguracionPermisos } from "./configuracion-permisos";
import { configuracionService } from "./configuracion.service";
import type { Cargo, Concepto, PenalidadTipo, PlanVersion, Regla } from "./configuracion.types";

interface Parameters {
    version: PlanVersion | null;
    concepts: Concepto[];
    cargos: Cargo[];
    rules: Regla[];
    penalties: PenalidadTipo[];
}
export const selectBusinessConfiguration = (versions: PlanVersion[], planId?: number) => {
    const candidates = versions.filter((item) => item.idPlan === planId);
    return (
        candidates.filter((item) => item.estado === "BORRADOR").sort((a, b) => b.numeroVersion - a.numeroVersion || b.id - a.id)[0] ??
        candidates.filter((item) => item.estado === "PUBLICADA" && item.esVigente).sort((a, b) => b.numeroVersion - a.numeroVersion)[0] ??
        null
    );
};
export const ConfiguracionPage = withAlertProvider(() => {
    const { businessUser, isLoading, isBusinessUserLoading } = useAuth();
    if (isLoading || isBusinessUserLoading)
        return (
            <AppLayout>
                <p role="status">Verificando acceso…</p>
            </AppLayout>
        );
    if (!isAdministrator(businessUser))
        return (
            <AppLayout>
                <AlertMessage tone="notice">Solo Administración puede acceder a esta configuración.</AlertMessage>
            </AppLayout>
        );
    return <ConfiguracionAdmin key={businessUser?.id} />;
});

const ConfiguracionAdmin = () => {
    const notify = useAlert();
    const request = useRef(0);
    const mounted = useRef(false);
    const mutation = useRef(false);
    const [data, setData] = useState<Parameters>({ version: null, concepts: [], cargos: [], rules: [], penalties: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isPreparing, setIsPreparing] = useState(false);
    const [error, setError] = useState("");
    const load = useCallback(async () => {
        if (!mounted.current) return;
        const current = ++request.current;
        setIsLoading(true);
        setError("");
        try {
            const [plans, versions, concepts, cargos, rules, penalties] = await Promise.all([
                configuracionService.getPlans(),
                configuracionService.getVersions(),
                configuracionService.getConcepts(),
                configuracionService.getCargos(),
                configuracionService.getRules(),
                configuracionService.getPenalties(),
            ]);
            if (!mounted.current || current !== request.current) return;
            const plan = plans.find((item) => item.codigo === "PLAN_COMPENSACIONES_GENERAL");
            setData({ version: selectBusinessConfiguration(versions, plan?.id), concepts, cargos, rules, penalties });
        } catch (e) {
            if (mounted.current && current === request.current)
                setError(e && typeof e === "object" && "message" in e ? String(e.message) : "No se pudo cargar la configuración");
        } finally {
            if (mounted.current && current === request.current) setIsLoading(false);
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
    const prepare = async () => {
        if (mutation.current || isLoading || error) return;
        mutation.current = true;
        setIsPreparing(true);
        try {
            await configuracionService.prepareConfiguration();
            if (!mounted.current) return;
            notify("success", "Ya puedes editar los parámetros. Guarda para aplicar cambios.");
            await load();
        } catch (e) {
            if (mounted.current) notify("error", e && typeof e === "object" && "message" in e ? String(e.message) : "No se pudo habilitar la edición");
        } finally {
            mutation.current = false;
            if (mounted.current) setIsPreparing(false);
        }
    };
    return (
        <AppLayout>
            <div className="space-y-4">
                {(isLoading || error || !data.version) && <CompensacionHeading section="configuracion" title="Configuración" />}
                {isLoading && (
                    <p role="status" className="text-sm text-tertiary">
                        Cargando configuración…
                    </p>
                )}
                {error && (
                    <div className="flex flex-wrap items-center gap-2">
                        <AlertMessage tone="error">{error}</AlertMessage>
                        <Button size="sm" color="primary" iconLeading={RefreshCw01} onClick={() => void load()}>
                            Reintentar
                        </Button>
                    </div>
                )}
                {!isLoading && !error && data.version && <ConfiguracionOperativa {...data} isLoading={isPreparing} onChanged={() => void load()} />}
                {!isLoading && !error && !data.version && (
                    <p role="status" className="rounded-xl border border-secondary bg-primary p-4 text-sm text-tertiary">
                        No hay parámetros disponibles.
                    </p>
                )}
                {!isLoading && data.version?.estado !== "BORRADOR" && !error && (
                    <Button size="sm" isLoading={isPreparing} onClick={() => void prepare()}>
                        Habilitar edición
                    </Button>
                )}
                {!isLoading && !error && data.version && <ConfiguracionCondiciones version={data.version} rules={data.rules} penalties={data.penalties} />}
                <div className="grid gap-4 lg:grid-cols-2">
                    <ConfiguracionCalificaciones />
                    <ConfiguracionComunidadesCalificacion />
                </div>
                <ConfiguracionPermisos />
            </div>
        </AppLayout>
    );
};
