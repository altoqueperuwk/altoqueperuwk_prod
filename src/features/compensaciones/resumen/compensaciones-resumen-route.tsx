import { useSearchParams } from "react-router";
import { AppLayout } from "@/components/application/app-layout";
import { AdminDashboardPage } from "../administracion/admin-dashboard-page";
import { CentroTrabajoPage } from "../centro-trabajo/centro-trabajo-page";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { CompensacionesResumenPage } from "./compensaciones-resumen-page";

/** Ambas vistas pasan por el mismo guard y permiso exacto de /resumen. */
export const CompensacionesResumenRoute = () => {
    const [params] = useSearchParams();
    const profile = useCompensacionPerfil();
    if (profile.isResolving)
        return (
            <AppLayout>
                <p role="status">Verificando acceso…</p>
            </AppLayout>
        );
    if (params.get("vista") === "centro") return <CentroTrabajoPage />;
    return profile.isAdministrator ? <AdminDashboardPage /> : <CompensacionesResumenPage />;
};
