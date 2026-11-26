import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import { AppLayout } from "@/components/application/app-layout";
import { ToastContainer } from "@/components/application/toast-container";
import { evidenciaScreens } from "@/features/compensaciones/evidencias/evidencias-navigation";
import { CompensacionRouteGuard } from "@/features/compensaciones/shared/compensacion-route-guard";
import { AcceptInvitePage } from "@/pages/accept-invite-page";
import { ForbiddenPage } from "@/pages/forbidden-page";
import { HomePage } from "@/pages/home-page";
import { LoginPage } from "@/pages/login-page";
import { NotFound } from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { OperationalRemindersProvider } from "@/providers/operational-reminders-provider";
import { RouteProvider } from "@/providers/router-provider";
import { SessionCacheProvider } from "@/providers/session-cache-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { ToastProvider } from "@/providers/toast-provider";
import "@/styles/globals.css";

// Cada pantalla se descarga solo al abrirla: el paquete inicial deja de incluir todo el sistema.
const AtencionClientePage = lazy(() => import("@/features/atencion/cliente/atencion-cliente-page").then((m) => ({ default: m.AtencionClientePage })));
const MiEnlaceQrPage = lazy(() => import("@/features/atencion/mi-enlace-qr/mi-enlace-qr-page").then((m) => ({ default: m.MiEnlaceQrPage })));
const AtencionesPage = lazy(() => import("@/features/compensaciones/atenciones/atenciones-page").then((m) => ({ default: m.AtencionesPage })));
const BonosDescuentosPage = lazy(() =>
    import("@/features/compensaciones/bonos-descuentos/bonos-descuentos-page").then((m) => ({ default: m.BonosDescuentosPage })),
);
const BonosMesPage = lazy(() => import("@/features/compensaciones/bonos-mes/bonos-mes-page").then((m) => ({ default: m.BonosMesPage })));
const ColaboradoresPage = lazy(() => import("@/features/compensaciones/colaboradores/colaboradores-page").then((m) => ({ default: m.ColaboradoresPage })));
const ConfiguracionPage = lazy(() => import("@/features/compensaciones/configuracion/configuracion-page").then((m) => ({ default: m.ConfiguracionPage })));
const CalificacionPublicaPage = lazy(() =>
    import("@/features/compensaciones/evidencias/calificacion-publica-page").then((m) => ({ default: m.CalificacionPublicaPage })),
);
const EvidenciasPage = lazy(() => import("@/features/compensaciones/evidencias/evidencias-page").then((m) => ({ default: m.EvidenciasPage })));
const FacturacionAuditoriaRoute = lazy(() =>
    import("@/features/compensaciones/evidencias/facturacion-auditoria-route").then((m) => ({ default: m.FacturacionAuditoriaRoute })),
);
const OtrosBonosPage = lazy(() => import("@/features/compensaciones/evidencias/otros-bonos-page").then((m) => ({ default: m.OtrosBonosPage })));
const AuditoriaOperacionesPage = lazy(() =>
    import("@/features/compensaciones/atc/auditoria-operaciones-page").then((m) => ({ default: m.AuditoriaOperacionesPage })),
);
const IndisciplinaColaboradorPage = lazy(() =>
    import("@/features/compensaciones/atc/indisciplina-colaborador-page").then((m) => ({ default: m.IndisciplinaColaboradorPage })),
);
const AuditoriaCuadreCierrePage = lazy(() =>
    import("@/features/compensaciones/incidencias/auditoria-cuadre-cierre-page").then((m) => ({ default: m.AuditoriaCuadreCierrePage })),
);
const PenalidadEscalonadaBonosPage = lazy(() =>
    import("@/features/compensaciones/incidencias/penalidad-escalonada-page").then((m) => ({ default: m.PenalidadEscalonadaBonosPage })),
);
const IncidenciasRoute = lazy(() => import("@/features/compensaciones/incidencias/incidencias-page").then((m) => ({ default: m.IncidenciasRoute })));
const ReportesPage = lazy(() => import("@/features/compensaciones/reportes/reportes-page").then((m) => ({ default: m.ReportesPage })));
const CompensacionesResumenRoute = lazy(() =>
    import("@/features/compensaciones/resumen/compensaciones-resumen-route").then((m) => ({ default: m.CompensacionesResumenRoute })),
);
const AsistidaPage = lazy(() => import("@/features/operaciones/efectivizacion/asistida/pages/asistida-page").then((m) => ({ default: m.AsistidaPage })));
const BancariaPage = lazy(() => import("@/features/operaciones/efectivizacion/bancaria/pages/bancaria-page").then((m) => ({ default: m.BancariaPage })));
const PagoDeudaPage = lazy(() => import("@/features/operaciones/pago-deuda/pages/pago-deuda-page").then((m) => ({ default: m.PagoDeudaPage })));
const BandejaPage = lazy(() => import("@/features/recordatorios-operativos/bandeja-page").then((m) => ({ default: m.BandejaPage })));
const MetricasBancariasPage = lazy(() =>
    import("@/features/reportes/metricas-bancarias/metricas-bancarias-page").then((m) => ({ default: m.MetricasBancariasPage })),
);
const MetricasServicioPage = lazy(() =>
    import("@/features/reportes/metricas-bancarias/servicios/metricas-servicio-page").then((m) => ({ default: m.MetricasServicioPage })),
);
const ReporteCierreCajaOperationalPage = lazy(() =>
    import("@/features/reportes/reporte-cierre-caja-operational-page").then((m) => ({ default: m.ReporteCierreCajaOperationalPage })),
);
const SeguimientoOperacionesPaginadoPage = lazy(() =>
    import("@/features/seguimientos/seguimiento-operaciones-paginado-page").then((m) => ({ default: m.SeguimientoOperacionesPaginadoPage })),
);
const BancoPage = lazy(() => import("@/features/sistema/banco/banco-page").then((m) => ({ default: m.BancoPage })));
const CajaOperativaPage = lazy(() => import("@/features/sistema/caja-operativa/caja-operativa-page").then((m) => ({ default: m.CajaOperativaPage })));
const ClientePage = lazy(() => import("@/features/sistema/cliente/cliente-page").then((m) => ({ default: m.ClientePage })));
const CodigoServicioPage = lazy(() => import("@/features/sistema/codigo-servicio/codigo-servicio-page").then((m) => ({ default: m.CodigoServicioPage })));
const ComunidadPage = lazy(() => import("@/features/sistema/comunidad/comunidad-page").then((m) => ({ default: m.ComunidadPage })));
const EmpresaCuentaBancariaPage = lazy(() =>
    import("@/features/sistema/empresa-cuenta-bancaria/empresa-cuenta-bancaria-page").then((m) => ({ default: m.EmpresaCuentaBancariaPage })),
);
const EmpresaPage = lazy(() => import("@/features/sistema/empresa/empresa-page").then((m) => ({ default: m.EmpresaPage })));
const EstadoPage = lazy(() => import("@/features/sistema/estado/estado-page").then((m) => ({ default: m.EstadoPage })));
const PermisoMenuPage = lazy(() => import("@/features/sistema/permiso-menu/permiso-menu-page").then((m) => ({ default: m.PermisoMenuPage })));
const PermisoUsuarioPage = lazy(() => import("@/features/sistema/permiso-usuario/permiso-usuario-page").then((m) => ({ default: m.PermisoUsuarioPage })));
const ReglasEfectivizacionPage = lazy(() =>
    import("@/features/sistema/reglas-efectivizacion/reglas-efectivizacion-page").then((m) => ({ default: m.ReglasEfectivizacionPage })),
);
const RolPage = lazy(() => import("@/features/sistema/rol/rol-page").then((m) => ({ default: m.RolPage })));
const SucursalPage = lazy(() => import("@/features/sistema/sucursal/sucursal-page").then((m) => ({ default: m.SucursalPage })));
const UsuarioPage = lazy(() => import("@/features/sistema/usuario/usuario-page").then((m) => ({ default: m.UsuarioPage })));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-secondary">
                <div className="flex flex-col items-center gap-3">
                    <svg className="text-brand-solid size-8 animate-spin" viewBox="0 0 20 20" fill="none">
                        <circle className="stroke-current opacity-30" cx="10" cy="10" r="8" fill="none" strokeWidth="2" />
                        <circle
                            className="origin-center animate-spin stroke-current"
                            cx="10"
                            cy="10"
                            r="8"
                            fill="none"
                            strokeWidth="2"
                            strokeDasharray="12.5 50"
                            strokeLinecap="round"
                        />
                    </svg>
                    <span className="text-sm text-tertiary">Cargando...</span>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return (
        <SessionCacheProvider>
            <OperationalRemindersProvider>
                <AppLayout>
                    <CompensacionRouteGuard>{children ?? <Outlet />}</CompensacionRouteGuard>
                </AppLayout>
            </OperationalRemindersProvider>
        </SessionCacheProvider>
    );
}

function RouteFallback() {
    return (
        <div className="flex h-screen items-center justify-center bg-secondary">
            <span className="text-sm text-tertiary">Cargando...</span>
        </div>
    );
}

function AppRoutes() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/calificar/:token" element={<CalificacionPublicaPage />} />
            <Route path="/auth/accept-invite" element={<AcceptInvitePage />} />
            <Route path="/403" element={<ForbiddenPage />} />

            <Route
                element={
                    <ProtectedRoute>
                        <Outlet />
                    </ProtectedRoute>
                }
            >
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
                <Route path="/sistema/caja-operativa" element={<CajaOperativaPage />} />
                <Route path="/sistema/empresa/:empresaId/cuentas" element={<EmpresaCuentaBancariaPage />} />

                <Route path="/atencion/cliente" element={<AtencionClientePage />} />
                <Route path="/atencion/mi-enlace-qr" element={<MiEnlaceQrPage />} />

                <Route path="/compensaciones" element={<Navigate to="/compensaciones/resumen" replace />} />
                <Route path="/compensaciones/resumen" element={<CompensacionesResumenRoute />} />
                <Route path="/compensaciones/atenciones" element={<AtencionesPage />} />
                <Route path="/compensaciones/colaboradores" element={<ColaboradoresPage />} />
                {evidenciaScreens.map((screen) => (
                    <Route
                        key={screen.path}
                        path={screen.path}
                        element={screen.category === "OTRO" ? <OtrosBonosPage /> : <EvidenciasPage category={screen.category} />}
                    />
                ))}
                <Route path="/compensaciones/otros-bonos/:codigo" element={<OtrosBonosPage />} />
                <Route path="/compensaciones/incidencias" element={<IncidenciasRoute />} />
                <Route path="/compensaciones/auditoria-operaciones" element={<AuditoriaOperacionesPage />} />
                <Route path="/compensaciones/auditoria-cuadre-cierre" element={<AuditoriaCuadreCierrePage />} />
                <Route path="/compensaciones/indisciplina-colaborador" element={<IndisciplinaColaboradorPage />} />
                <Route path="/compensaciones/penalidad-escalonada-bonos" element={<PenalidadEscalonadaBonosPage />} />
                <Route path="/compensaciones/auditoria-activa" element={<FacturacionAuditoriaRoute />} />
                <Route path="/compensaciones/mis-bonos-descuentos" element={<BonosDescuentosPage />} />
                <Route path="/compensaciones/bonos-mes" element={<BonosMesPage />} />
                <Route path="/compensaciones/configuracion" element={<ConfiguracionPage />} />
                <Route path="/compensaciones/reportes" element={<ReportesPage />} />

                <Route path="/seguimientos/operaciones" element={<SeguimientoOperacionesPaginadoPage />} />
                <Route path="/seguimientos/pago-deuda" element={<SeguimientoOperacionesPaginadoPage />} />
                <Route path="/reportes" element={<Navigate to="/reportes/cierre-caja" replace />} />
                <Route path="/reportes/cierre-caja" element={<ReporteCierreCajaOperationalPage />} />
                <Route path="/reportes/metricas-bancarias" element={<MetricasBancariasPage />} />
                <Route path="/reportes/metricas-bancarias/pago-deuda" element={<MetricasServicioPage servicio="pago-deuda" />} />
                <Route path="/reportes/metricas-bancarias/pos" element={<MetricasServicioPage servicio="pos" />} />
                <Route path="/reportes/metricas-bancarias/link-pago" element={<MetricasServicioPage servicio="linkpago" />} />
                <Route path="/bandeja" element={<BandejaPage />} />

                <Route path="/operaciones/bcp" element={<BancariaPage ruta="bcp" />} />
                <Route path="/operaciones/bbva" element={<BancariaPage ruta="bbva" />} />
                <Route path="/operaciones/scotiabank" element={<BancariaPage ruta="scotiabank" />} />
                <Route path="/operaciones/banbif" element={<BancariaPage ruta="banbif" />} />
                <Route path="/operaciones/interbank" element={<BancariaPage ruta="interbank" />} />
                <Route path="/operaciones/safetypay" element={<BancariaPage ruta="safetypay" />} />
                <Route path="/operaciones/pos" element={<AsistidaPage ruta="pos" />} />
                <Route path="/operaciones/linkpago" element={<AsistidaPage ruta="linkpago" />} />
                <Route path="/operaciones/deuda" element={<PagoDeudaPage />} />
                <Route path="/operaciones/pago-deuda" element={<PagoDeudaPage />} />
                <Route path="/operaciones/pagodeuda" element={<PagoDeudaPage />} />
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
                            <Suspense fallback={<RouteFallback />}>
                                <AppRoutes />
                            </Suspense>
                            <ToastContainer />
                        </AuthProvider>
                    </ToastProvider>
                </RouteProvider>
            </BrowserRouter>
        </ThemeProvider>
    </StrictMode>,
);
