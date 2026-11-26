import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface BusinessUser {
    id: string;
    email: string;
    id_sucursal?: number | null;
    nombre_sucursal?: string | null;
    [key: string]: unknown;
}

export const isAdministrator = (businessUser: BusinessUser | null | undefined) =>
    Number(businessUser?.id_rol ?? 0) === 1
    || String(businessUser?.rol_nombre ?? "").trim().toUpperCase() === "ADMINISTRADOR"
    || businessUser?.flag_super_admin === true;

export const isJefeTienda = (businessUser: BusinessUser | null | undefined) =>
    Number(businessUser?.id_rol ?? 0) === 3
    || String(businessUser?.rol_nombre ?? "").trim().toUpperCase() === "JEFE DE TIENDA";

interface AuthContextType {
    user: User | null;
    session: Session | null;
    businessUser: BusinessUser | null;
    isBusinessUserLoading: boolean;
    isAuthenticated: boolean;
    isLoading: boolean;
    signIn: (email: string, password: string) => Promise<{ error?: string }>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Lectura de perfil sin iniciar ni modificar la sesión. */
export const useOptionalAuth = () => useContext(AuthContext);

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [businessUser, setBusinessUser] = useState<BusinessUser | null>(null);
    const [isBusinessUserLoading, setIsBusinessUserLoading] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const profileRequest = useRef(0);
    const profileOwner = useRef<string | null>(null);

    const fetchBusinessUser = useCallback(async (sessionUser: User, force = false) => {
        // INITIAL_SESSION/getSession y SIGNED_IN al volver a la ventana pueden
        // referirse a la misma identidad. No desmontar sus formularios/filtros.
        if (!force && profileOwner.current === sessionUser.id) return;
        profileOwner.current = sessionUser.id;
        const requestId = ++profileRequest.current;
        setIsBusinessUserLoading(true);
        setBusinessUser(null);
        const timer = setTimeout(() => {
            if (profileRequest.current !== requestId) return;
            profileRequest.current += 1;
            profileOwner.current = null;
            setBusinessUser(null);
            setIsBusinessUserLoading(false);
        }, 20_000);
        try {
            const { data, error } = await supabase.rpc("f_get_tb_usuario", {
                p_email: sessionUser.email,
            });
            if (error) throw error;
            if (profileRequest.current !== requestId) return;
            if (data && Array.isArray(data) && data.length > 0) {
                setBusinessUser(data[0] as BusinessUser);
            } else profileOwner.current = null;
        } catch {
            if (profileRequest.current === requestId) {
                profileOwner.current = null;
                setBusinessUser(null);
            }
        } finally {
            clearTimeout(timer);
            if (profileRequest.current === requestId) setIsBusinessUserLoading(false);
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
            if (!mounted) return;
            setSession(currentSession);
            setUser(currentSession?.user ?? null);
            if (currentSession?.user) {
                fetchBusinessUser(currentSession.user);
            } else {
                profileRequest.current += 1;
                profileOwner.current = null;
                setBusinessUser(null);
                setIsBusinessUserLoading(false);
            }
            setIsLoading(false);
        }).catch(() => {
            if (mounted) {
                setUser(null);
                setSession(null);
                setBusinessUser(null);
                setIsBusinessUserLoading(false);
                setIsLoading(false);
            }
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, currentSession) => {
            if (!mounted) return;
            setSession(currentSession);
            setUser(currentSession?.user ?? null);
            if (currentSession?.user) {
                fetchBusinessUser(currentSession.user, event === "USER_UPDATED");
            } else {
                profileRequest.current += 1;
                profileOwner.current = null;
                setBusinessUser(null);
                setIsBusinessUserLoading(false);
            }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [fetchBusinessUser]);

    const signIn = useCallback(async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            return { error: error.message };
        }
        return {};
    }, []);

    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
        setBusinessUser(null);
    }, []);

    const isAuthenticated = !!user;

    const value = useMemo<AuthContextType>(
        () => ({ user, session, businessUser, isBusinessUserLoading, isAuthenticated, isLoading, signIn, signOut }),
        [user, session, businessUser, isBusinessUserLoading, isAuthenticated, isLoading, signIn, signOut],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
