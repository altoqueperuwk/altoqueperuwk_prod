import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface BusinessUser {
    id: string;
    email: string;
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
    isAuthenticated: boolean;
    isLoading: boolean;
    signIn: (email: string, password: string) => Promise<{ error?: string }>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
    const [isLoading, setIsLoading] = useState(true);

    const fetchBusinessUser = useCallback(async (sessionUser: User) => {
        try {
            const { data, error } = await supabase.rpc("f_get_tb_usuario", {
                p_email: sessionUser.email,
            });
            if (error) throw error;
            if (data && Array.isArray(data) && data.length > 0) {
                setBusinessUser(data[0] as BusinessUser);
            }
        } catch {
            setBusinessUser(null);
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
            }
            setIsLoading(false);
        }).catch(() => {
            if (mounted) {
                setUser(null);
                setSession(null);
                setIsLoading(false);
            }
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, currentSession) => {
            if (!mounted) return;
            setSession(currentSession);
            setUser(currentSession?.user ?? null);
            if (currentSession?.user) {
                fetchBusinessUser(currentSession.user);
            } else {
                setBusinessUser(null);
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
        () => ({ user, session, businessUser, isAuthenticated, isLoading, signIn, signOut }),
        [user, session, businessUser, isAuthenticated, isLoading, signIn, signOut],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
