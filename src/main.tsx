import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import { ToastContainer } from "@/components/application/toast-container";
import { LoginPage } from "@/pages/login-page";
import { NotFound } from "@/pages/not-found";
import { ForbiddenPage } from "@/pages/forbidden-page";
import { HomePage } from "@/pages/home-page";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { RouteProvider } from "@/providers/router-provider";
import { SessionCacheProvider } from "@/providers/session-cache-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { EstadoPage } from "@/features/sistema/estado/estado-page";
import { RolPage } from "@/features/sistema/rol/rol-page";
import { SucursalPage } from "@/features/sistema/sucursal/sucursal-page";
import { ComunidadPage } from "@/features/sistema/comunidad/comunidad-page";
import { CodigoServicioPage } from "@/features/sistema/codigo-servicio/codigo-servicio-page";
import { UsuarioPage } from "@/features/sistema/usuario/usuario-page";
import { PermisoMenuPage } from "@/features/sistema/permiso-menu/permiso-menu-page";
import { PermisoUsuarioPage } from "@/features/sistema/permiso-usuario/permiso-usuario-page";
import { ClientePage } from "@/features/sistema/cliente/cliente-page";
import { BancoPage } from "@/features/sistema/banco/banco-page";
import { EmpresaPage } from "@/features/sistema/empresa/empresa-page";
import { EmpresaCuentaBancariaPage } from "@/features/sistema/empresa-cuenta-bancaria/empresa-cuenta-bancaria-page";
import { ReglasEfectivizacionPage } from "@/features/sistema/reglas-efectivizacion/reglas-efectivizacion-page";
import { OperacionPlaceholder } from "@/features/operaciones/operacion-placeholder";
import "@/styles/globals.css";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-primary">
                <div className="flex flex-col items-center gap-3">
                    <svg className="size-8 animate-spin text-brand-solid" viewBox="0 0 20 20" fill="none">
                        <circle className="stroke-current opacity-30" cx="10" cy="10" r="8" fill="none" strokeWidth="2" />
                        <circle className="origin-center animate-spin stroke-current" cx="10" cy="10" r="8" fill="none" strokeWidth="2" strokeDasharray="12.5 50" strokeLinecap="round" />
                    </svg>
                    <span className="text-sm text-tertiary">Cargando...</span>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <SessionCacheProvider>{children ?? <Outlet />}</SessionCacheProvider>;
}

function AppRoutes() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/403" element={<ForbiddenPage />} />

            <Route element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
                <Route path="/" element={<HomePage />} />
                <Route path="/sistema/estado" element={<EstadoPage />} />
                <Route path="/sistema/rol" element={<RolPage />} />
                <Route path="/sistema/sucursal" element={<SucursalPage />} />
                <Route path="/sistema/comunidad" element={<ComunidadPage />} />
                <Route path="/sistema/codigo-servicio" element={<CodigoServicioPage />} />
                <Route path="/sistema/usuario" element={<UsuarioPage />} />
                <Route path="/sistema/permiso-menu" element={<PermisoMenuPage />} />
                <Route path="/sistema/permiso-usuario" element={<PermisoUsuarioPage />} />
                <Route path="/sistema/cliente" element={<ClientePage />} />
                <Route path="/sistema/banco" element={<BancoPage />} />
                <Route path="/sistema/empresa" element={<EmpresaPage />} />
                <Route path="/sistema/reglas-efectivizacion" element={<ReglasEfectivizacionPage />} />
                <Route path="/sistema/empresa/:empresaId/cuentas" element={<EmpresaCuentaBancariaPage />} />

                <Route path="/operaciones/bcp" element={<OperacionPlaceholder title="BCP" />} />
                <Route path="/operaciones/bbva" element={<OperacionPlaceholder title="BBVA" />} />
                <Route path="/operaciones/scotiabank" element={<OperacionPlaceholder title="Scotiabank" />} />
                <Route path="/operaciones/banbif" element={<OperacionPlaceholder title="BanBif" />} />
                <Route path="/operaciones/interbank" element={<OperacionPlaceholder title="Interbank" />} />
                <Route path="/operaciones/safetypay" element={<OperacionPlaceholder title="SafetyPay" />} />
                <Route path="/operaciones/pos" element={<OperacionPlaceholder title="POS" />} />
                <Route path="/operaciones/linkpago" element={<OperacionPlaceholder title="Link Pago" />} />
                <Route path="/operaciones/pagodeuda" element={<OperacionPlaceholder title="Pago Deuda" />} />
            </Route>

            <Route path="*" element={<NotFound />} />
        </Routes>
    );
}

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ThemeProvider>
            <BrowserRouter>
                <RouteProvider>
                    <ToastProvider>
                        <AuthProvider>
                            <AppRoutes />
                            <ToastContainer />
                        </AuthProvider>
                    </ToastProvider>
                </RouteProvider>
            </BrowserRouter>
        </ThemeProvider>
    </StrictMode>,
);
