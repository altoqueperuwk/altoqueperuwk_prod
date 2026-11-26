import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";

interface NavegacionItem {
    id: string;
    nombre: string;
    ruta: string | null;
    icono: string;
    orden?: number;
    children?: NavegacionItem[];
    [key: string]: unknown;
}

interface NavegacionData {
    usuario: Record<string, unknown> | null;
    menus: NavegacionItem[];
    rutas_permitidas: string[];
    nombres_permitidos: string[];
}

interface SessionCacheContextType {
    navegacion: NavegacionData | null;
    estados: Record<string, unknown>[] | null;
    comunidades: Record<string, unknown>[] | null;
    bancos: Record<string, unknown>[] | null;
    empresas: Record<string, unknown>[] | null;
    empresasCuentasBancarias: Record<string, unknown>[] | null;
    codigosServicio: Record<string, unknown>[] | null;
    isLoading: boolean;
    navigationError: string;
    reloadNavigation: () => void;
}

const SessionCacheContext = createContext<SessionCacheContextType | undefined>(undefined);

export const useSessionCache = (): SessionCacheContextType => {
    const context = useContext(SessionCacheContext);
    if (context === undefined) {
        throw new Error("useSessionCache must be used within a SessionCacheProvider");
    }
    return context;
};

interface SessionCacheProviderProps {
    children: ReactNode;
}

interface GlobalCatalogData {
    estados: Record<string, unknown>[] | null;
    comunidades: Record<string, unknown>[] | null;
    bancos: Record<string, unknown>[] | null;
    empresas: Record<string, unknown>[] | null;
    empresasCuentasBancarias: Record<string, unknown>[] | null;
    codigosServicio: Record<string, unknown>[] | null;
}

let globalCatalogData: GlobalCatalogData | null = null;
let globalCatalogRequest: Promise<GlobalCatalogData> | null = null;
let globalCatalogOwner: string | null = null;

const loadGlobalCatalogs = async (owner: string): Promise<GlobalCatalogData> => {
    if (globalCatalogOwner !== owner) {
        globalCatalogOwner = owner;
        globalCatalogData = null;
        globalCatalogRequest = null;
    }
    if (globalCatalogData) {
        return globalCatalogData;
    }

    if (globalCatalogRequest) {
        return globalCatalogRequest;
    }

    globalCatalogRequest = Promise.all([
        supabase.rpc("f_get_tb_estado"),
        supabase.rpc("f_get_tb_comunidad"),
        supabase.rpc("f_get_tb_banco"),
        supabase.rpc("f_get_tb_empresa"),
        supabase.rpc("f_get_tb_empresa_cuenta_bancaria"),
        supabase.rpc("f_get_tb_codigo_servicio"),
    ]).then(([
        estadosResult,
        comunidadesResult,
        bancosResult,
        empresasResult,
        cuentasResult,
        codigosResult,
    ]) => {
        const result = {
            estados: estadosResult.data ?? null,
            comunidades: comunidadesResult.data ?? null,
            bancos: bancosResult.data ?? null,
            empresas: empresasResult.data ?? null,
            empresasCuentasBancarias: cuentasResult.data ?? null,
            codigosServicio: codigosResult.data ?? null,
        };

        if (globalCatalogOwner === owner) globalCatalogData = result;
        return result;
    }).finally(() => {
        if (globalCatalogOwner === owner) globalCatalogRequest = null;
    });

    return globalCatalogRequest;
};

export const SessionCacheProvider = ({ children }: SessionCacheProviderProps) => {
    const { businessUser } = useAuth();
    const businessUserId = businessUser?.id;

    const [navegacion, setNavegacion] = useState<NavegacionData | null>(null);
    const [estados, setEstados] = useState<Record<string, unknown>[] | null>(null);
    const [comunidades, setComunidades] = useState<Record<string, unknown>[] | null>(null);
    const [bancos, setBancos] = useState<Record<string, unknown>[] | null>(null);
    const [empresas, setEmpresas] = useState<Record<string, unknown>[] | null>(null);
    const [empresasCuentasBancarias, setEmpresasCuentasBancarias] = useState<Record<string, unknown>[] | null>(null);
    const [codigosServicio, setCodigosServicio] = useState<Record<string, unknown>[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [navigationError, setNavigationError] = useState("");
    const [navigationRevision, setNavigationRevision] = useState(0);
    const [navigationOwner, setNavigationOwner] = useState<string | undefined>();
    const [catalogOwner, setCatalogOwner] = useState<string | undefined>();

    useEffect(() => {
        if (!businessUserId) {
            setNavegacion(null);
            setNavigationError("No se pudo verificar el perfil operativo de la sesión.");
            setEstados(null); setComunidades(null); setBancos(null);
            setEmpresas(null); setEmpresasCuentasBancarias(null); setCodigosServicio(null);
            setIsLoading(false);
            return;
        }

        let cancelled = false;
        let navigationTimer: ReturnType<typeof setTimeout> | undefined;

        const loadSessionData = async () => {
            setNavigationOwner(businessUserId);
            setIsLoading(true);
            setNavegacion(null);
            setNavigationError("");
            let settled = false;
            navigationTimer = setTimeout(() => {
                if (cancelled || settled) return;
                settled = true;
                setNavegacion(null);
                setNavigationError("La consulta de permisos está tardando demasiado. Reintenta la consulta.");
                setIsLoading(false);
            }, 20_000);

            try {
                const navResult = await supabase.rpc("f_get_tb_navegacion_x_usuario", { p_id_usuario: businessUserId });

                if (cancelled || settled) return;

                if (navResult.error) setNavigationError("No se pudieron consultar tus permisos. Reintenta la consulta.");
                setNavegacion(navResult.error ? null : navResult.data as NavegacionData ?? { menus: [], rutas_permitidas: [], nombres_permitidos: [], usuario: null });
            } catch {
                if (!cancelled && !settled) {
                    setNavegacion(null);
                    setNavigationError("No se pudieron consultar tus permisos. Reintenta la consulta.");
                }
            } finally {
                settled = true;
                clearTimeout(navigationTimer);
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        loadSessionData();

        return () => {
            cancelled = true;
            clearTimeout(navigationTimer);
        };
    }, [businessUserId, navigationRevision]);

    // Los catálogos de formularios no bloquean la autorización ni el Dashboard.
    useEffect(() => {
        setEstados(null); setComunidades(null); setBancos(null);
        setEmpresas(null); setEmpresasCuentasBancarias(null); setCodigosServicio(null);
        if (!businessUserId) return;
        let cancelled = false;
        loadGlobalCatalogs(String(businessUserId)).then((catalogs) => {
            if (cancelled) return;
            setCatalogOwner(businessUserId);
            setEstados(catalogs.estados); setComunidades(catalogs.comunidades); setBancos(catalogs.bancos);
            setEmpresas(catalogs.empresas); setEmpresasCuentasBancarias(catalogs.empresasCuentasBancarias);
            setCodigosServicio(catalogs.codigosServicio);
        }).catch(() => { /* Cada formulario conserva su estado de catálogo no disponible. */ });
        return () => { cancelled = true; };
    }, [businessUserId]);

    useEffect(() => {
        if (!businessUserId) return;
        let cancelled = false;
        let request = 0;
        const refreshNavigation = async () => {
            const current = ++request;
            try {
                const { data, error } = await supabase.rpc("f_get_tb_navegacion_x_usuario", { p_id_usuario: businessUserId });
                if (!cancelled && current === request) {
                    setNavegacion(error ? null : data as NavegacionData);
                    setNavigationError(error ? "No se pudieron actualizar tus permisos. Reintenta la consulta." : "");
                }
            } catch {
                if (!cancelled && current === request) {
                    setNavegacion(null);
                    setNavigationError("No se pudieron actualizar tus permisos. Reintenta la consulta.");
                }
            }
        };
        const onUpdated = (event: Event) => {
            const detail = (event as CustomEvent<{ idUsuario: number }>).detail;
            if (Number(detail?.idUsuario) === Number(businessUserId)) void refreshNavigation();
        };
        const onFocus = () => { void refreshNavigation(); };
        window.addEventListener("permisos-usuario-actualizados", onUpdated);
        window.addEventListener("focus", onFocus);
        return () => {
            cancelled = true;
            window.removeEventListener("permisos-usuario-actualizados", onUpdated);
            window.removeEventListener("focus", onFocus);
        };
    }, [businessUserId]);

    const value = useMemo<SessionCacheContextType>(
        () => ({
            navegacion: navigationOwner === businessUserId ? navegacion : null,
            estados: catalogOwner === businessUserId ? estados : null,
            comunidades: catalogOwner === businessUserId ? comunidades : null,
            bancos: catalogOwner === businessUserId ? bancos : null,
            empresas: catalogOwner === businessUserId ? empresas : null,
            empresasCuentasBancarias: catalogOwner === businessUserId ? empresasCuentasBancarias : null,
            codigosServicio: catalogOwner === businessUserId ? codigosServicio : null,
            isLoading: Boolean(businessUserId) && (isLoading || navigationOwner !== businessUserId),
            navigationError,
            reloadNavigation: () => setNavigationRevision((value) => value + 1),
        }),
        [navegacion, estados, comunidades, bancos, empresas, empresasCuentasBancarias, codigosServicio, isLoading, navigationError, navigationOwner, catalogOwner, businessUserId],
    );

    return <SessionCacheContext.Provider value={value}>{children}</SessionCacheContext.Provider>;
};
