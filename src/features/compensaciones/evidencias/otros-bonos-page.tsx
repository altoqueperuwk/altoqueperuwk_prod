import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { AppLayout } from "@/components/application/app-layout";
import { AlertMessage, withAlertProvider } from "@/components/shared/alert-center";
import { useOptionalAuth } from "@/providers/auth-provider";
import { MarketingCapturasPage } from "../marketing/marketing-capturas-page";
import { PancakeAdjudicacionPage } from "../pancake-adjudicacion/pancake-adjudicacion-page";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { BonoAutomaticoPage } from "./bono-automatico-page";
import { ColaboradorMesPersonalPage } from "./colaborador-mes-personal-page";
import { EvidenciasPage } from "./evidencias-page";
import { evidenciasService } from "./evidencias.service";
import type { EvidenciaTipo } from "./evidencias.types";
import { otroBonoPath, otrosBonosPath, otrosBonosTypes } from "./otros-bonos-navigation";

export const OtrosBonosPage = withAlertProvider(() => {
    const { codigo } = useParams();
    const { isAdvisor, isStoreManager, isMarketing, isAdministrator, isResolving, userId } = useCompensacionPerfil();
    if (isResolving)
        return (
            <AppLayout>
                <p role="status">Verificando acceso…</p>
            </AppLayout>
        );
    if ((isMarketing || isAdministrator) && ["VIDEO_VIRAL", "RECUPERACION_CLIENTE", "ALERTA_TEMPRANA"].includes(codigo?.toUpperCase() ?? ""))
        return (
            <MarketingCapturasPage
                key={`${userId}:${codigo}`}
                alert={codigo?.toUpperCase() === "ALERTA_TEMPRANA"}
                initialRecovery={codigo?.toUpperCase() === "RECUPERACION_CLIENTE"}
            />
        );
    if (isAdvisor && codigo?.toUpperCase() === "COLABORADOR_MES_ATENCIONES") return <ColaboradorMesPersonalPage />;
    return <OtrosBonosCatalogPage />;
});

const OtrosBonosCatalogPage = () => {
    const { isAdvisor } = useCompensacionPerfil();
    const auth = useOptionalAuth();
    const isAdmin = Number(auth?.businessUser?.id_rol) === 1 || auth?.businessUser?.flag_super_admin === true;
    const { codigo } = useParams();
    const [types, setTypes] = useState<EvidenciaTipo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        let cancelled = false;
        evidenciasService
            .getTypes()
            .then((data) => {
                if (!cancelled) setTypes(otrosBonosTypes(data));
            })
            .catch(() => {
                if (!cancelled) setError("No fue posible cargar los tipos de bonos. Actualiza la página para reintentar.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);
    const selected = types.find((type) => type.codigo.toLowerCase() === codigo?.toLowerCase());
    if (!loading && !error && selected && isAdmin && ["COLABORADOR_MES_ATENCIONES", "COLABORADOR_MES_CALIFICACIONES"].includes(selected.codigo))
        return <PancakeAdjudicacionPage />;
    if (!loading && !error && selected?.codigo === "COLABORADOR_MES_CALIFICACIONES" && !isAdmin)
        return (
            <AppLayout>
                <AlertMessage tone="notice">La selección mensual de calificaciones está disponible solo para administración.</AlertMessage>
            </AppLayout>
        );
    if (!loading && !error && selected && isAdvisor && ["META_SEDE_SAFETYPAY", "COLABORADOR_MES_ATENCIONES"].includes(selected.codigo))
        return <BonoAutomaticoPage type={selected} />;
    if (!loading && !error && codigo && selected) return <EvidenciasPage category="OTRO" fixedType={selected} />;
    return (
        <AppLayout>
            <div className="space-y-6">
                <CompensacionHeading section="evidencias" title="Otros bonos" description="Selecciona un bono para registrar y consultar sus evidencias." />
                {loading ? (
                    <p role="status">Cargando bonos…</p>
                ) : error ? (
                    <AlertMessage tone="error">{error}</AlertMessage>
                ) : codigo ? (
                    <div>
                        <AlertMessage tone="notice">Este tipo de bono no está disponible para registro.</AlertMessage>
                        <Link className="text-brand-secondary underline" to={otrosBonosPath}>
                            Ver otros bonos
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {types.map((type) => (
                            <Link
                                key={type.codigo}
                                to={otroBonoPath(type.codigo)}
                                className="rounded-xl border border-secondary bg-primary p-5 text-primary shadow-xs outline-focus-ring hover:bg-primary_hover focus-visible:outline-2"
                            >
                                <h2 className="text-md font-semibold">{type.nombre}</h2>
                                <p className="mt-2 text-sm text-tertiary">Registrar y consultar evidencias</p>
                            </Link>
                        ))}
                        {!types.length && <p>No hay bonos disponibles para registrar.</p>}
                    </div>
                )}
            </div>
        </AppLayout>
    );
};
