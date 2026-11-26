import type { ReactNode } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { withAlertProvider } from "@/components/shared/alert-center";
import { useAtkBrand } from "@/hooks/use-atk-brand";
import { ClientesNuevosPage } from "../atenciones/clientes-nuevos-page";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { CalificacionesPage } from "./calificaciones-page";
import { EvidenciasContent } from "./evidencias-content";
import type { EvidenciaCategoria, EvidenciaTipo } from "./evidencias.types";
import { ReferidosPage } from "./referidos-page";

export interface EvidenciasPageProps {
    category?: EvidenciaCategoria | "";
    fixedType?: EvidenciaTipo;
    header?: ReactNode;
    /** Filtro adicional al inicio de "Filtros de Búsqueda" (solo tarjetas). */
    filterLeading?: ReactNode;
}

// Reinicia filtros, formularios y solicitudes al cambiar de tarea, incluso al volver atrás.
export const EvidenciasPage = withAlertProvider(({ category = "", fixedType, header, filterLeading }: EvidenciasPageProps) => {
    useAtkBrand();
    const profile = useCompensacionPerfil();
    const innovation = fixedType?.codigo === "PROPUESTA_INNOVACION";
    if (profile.isResolving)
        return (
            <AppLayout>
                <p role="status">Verificando acceso a {innovation ? "Innovación" : "la opción"}…</p>
            </AppLayout>
        );
    return fixedType?.codigo === "TIKTOK_LIVE" ? (
        <TiktokClientesPage />
    ) : category === "CALIFICACION" ? (
        <CalificacionesPage />
    ) : category === "REFERIDO" ? (
        <ReferidosPage />
    ) : (
        <EvidenciasContent
            key={`${category}:${fixedType?.codigo ?? ""}:${profile.userId}:${profile.isAdvisor}:${profile.isFacturacion}:${profile.isStoreManager}`}
            category={category}
            fixedType={fixedType}
            header={header}
            filterLeading={filterLeading}
        />
    );
});

const TiktokClientesPage = () => {
    const { isAdvisor, isStoreManager, isPagos, isMarketing } = useCompensacionPerfil();
    return <ClientesNuevosPage tiktok readOnly={!isAdvisor && !isStoreManager && !isPagos && !isMarketing} />;
};
