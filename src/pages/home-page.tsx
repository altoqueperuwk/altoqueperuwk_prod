import { AppLayout } from "@/components/application/app-layout";
import { useAuth } from "@/providers/auth-provider";
import { Navigate } from "react-router";
import { useSessionCache } from "@/providers/session-cache-provider";
import { isCompensacionAdvisor } from "@/features/compensaciones/shared/compensacion-perfil";

export function HomePage() {
    const { user, businessUser } = useAuth();
    const { navegacion, isLoading } = useSessionCache();
    const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Usuario";
    if (isCompensacionAdvisor(businessUser) && !isLoading && navegacion?.rutas_permitidas.includes("/compensaciones/resumen"))
        return <Navigate to="/compensaciones/resumen" replace />;

    return (
        <AppLayout>
            <div className="flex flex-col gap-6 p-6">
                <div className="flex flex-col gap-1">
                    <h1 className="text-display-sm font-semibold text-primary">
                        Bienvenido, {userName}
                    </h1>
                    <p className="text-md text-tertiary">
                        Panel de administración Al Toque Peru
                    </p>
                </div>

                <div className="rounded-xl border border-secondary bg-primary p-6">
                    <div className="flex flex-col gap-2">
                        <h2 className="text-lg font-semibold text-primary">Resumen</h2>
                        <p className="text-sm text-tertiary">
                            Selecciona una sección del menú para comenzar.
                        </p>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
