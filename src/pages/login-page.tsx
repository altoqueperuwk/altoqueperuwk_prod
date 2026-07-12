import { type FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Lock01, Mail01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { useAuth } from "@/providers/auth-provider";

export function LoginPage() {
    const navigate = useNavigate();
    const { signIn, isAuthenticated, isLoading: authLoading } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [shouldRedirect, setShouldRedirect] = useState(false);

    useEffect(() => {
        if (isAuthenticated && !authLoading) {
            setShouldRedirect(true);
        }
    }, [isAuthenticated, authLoading]);

    if (shouldRedirect) {
        return <Navigate to="/" replace />;
    }

    if (authLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-primary">
                <div className="flex flex-col items-center gap-3">
                    <svg className="size-8 animate-spin text-brand-solid" viewBox="0 0 20 20" fill="none">
                        <circle className="stroke-current opacity-30" cx="10" cy="10" r="8" fill="none" strokeWidth="2" />
                        <circle className="origin-center animate-spin stroke-current" cx="10" cy="10" r="8" fill="none" strokeWidth="2" strokeDasharray="12.5 50" strokeLinecap="round" />
                    </svg>
                    <span className="text-sm text-tertiary">Verificando sesión...</span>
                </div>
            </div>
        );
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        const result = await signIn(email, password);

        if (result.error) {
            setError(result.error);
            setIsLoading(false);
        } else {
            navigate("/", { replace: true });
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-primary px-4">
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="w-full max-w-sm"
            >
                <div className="flex flex-col gap-8 rounded-xl border border-secondary bg-primary p-8">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <h1 className="text-display-sm font-semibold text-primary">Al Toque Peru</h1>
                            <div className="h-5 w-1 rounded-full bg-brand-solid" />
                        </div>
                        <p className="text-sm text-tertiary">Sistema de Gestión Operativa</p>
                    </div>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                        <Input
                            label="Email"
                            placeholder="tu@email.com"
                            icon={Mail01}
                            isRequired
                            value={email}
                            onChange={setEmail}
                        />
                        <Input
                            label="Contraseña"
                            placeholder="Tu contraseña"
                            icon={Lock01}
                            isRequired
                            type="password"
                            value={password}
                            onChange={setPassword}
                        />

                        {error && (
                            <div className="rounded-lg border border-error_subtle bg-error-primary px-3 py-2">
                                <p className="text-sm text-error-primary">{error}</p>
                            </div>
                        )}

                        <Button
                            type="submit"
                            size="md"
                            isLoading={isLoading}
                            showTextWhileLoading
                            className="w-full"
                        >
                            Iniciar sesión
                        </Button>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}
