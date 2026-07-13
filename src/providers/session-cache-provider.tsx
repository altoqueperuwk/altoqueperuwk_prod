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

const loadGlobalCatalogs = async (): Promise<GlobalCatalogData> => {
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
        globalCatalogData = {
            estados: estadosResult.data ?? null,
            comunidades: comunidadesResult.data ?? null,
            bancos: bancosResult.data ?? null,
            empresas: empresasResult.data ?? null,
            empresasCuentasBancarias: cuentasResult.data ?? null,
            codigosServicio: codigosResult.data ?? null,
        };

        return globalCatalogData;
    }).finally(() => {
        globalCatalogRequest = null;
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

    useEffect(() => {
        if (!businessUserId) {
            return;
        }

        let cancelled = false;

        const loadSessionData = async () => {
            setIsLoading(true);

            try {
                const [navResult, catalogs] = await Promise.all([
                    supabase.rpc("f_get_tb_navegacion_x_usuario", { p_id_usuario: businessUserId }),
                    loadGlobalCatalogs(),
                ]);

                if (cancelled) return;

                setNavegacion(navResult.data as NavegacionData ?? { menus: [], rutas_permitidas: [], nombres_permitidos: [], usuario: null });
                setEstados(catalogs.estados);
                setComunidades(catalogs.comunidades);
                setBancos(catalogs.bancos);
                setEmpresas(catalogs.empresas);
                setEmpresasCuentasBancarias(catalogs.empresasCuentasBancarias);
                setCodigosServicio(catalogs.codigosServicio);
            } catch {
                if (!cancelled) {
                    setNavegacion(null);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        loadSessionData();

        return () => {
            cancelled = true;
        };
    }, [businessUserId]);

    const value = useMemo<SessionCacheContextType>(
        () => ({
            navegacion,
            estados,
            comunidades,
            bancos,
            empresas,
            empresasCuentasBancarias,
            codigosServicio,
            isLoading,
        }),
        [navegacion, estados, comunidades, bancos, empresas, empresasCuentasBancarias, codigosServicio, isLoading],
    );

    return <SessionCacheContext.Provider value={value}>{children}</SessionCacheContext.Provider>;
};
