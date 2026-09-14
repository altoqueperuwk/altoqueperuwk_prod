import { type FormEvent, useEffect, useState } from "react";
import { Lock01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { Navigate, useNavigate } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { supabase } from "@/lib/supabase";

export function AcceptInvitePage() {
    const navigate = useNavigate();
    const [hasSession, setHasSession] = useState<boolean | null>(null);
    const [password, setPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        void supabase.auth.getSession().then(({ data }) => setHasSession(Boolean(data.session)));
    }, []);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError("");
        if (password.length < 8) {
            setError("La contrasena debe tener al menos 8 caracteres");
            return;
        }
        if (password !== confirmation) {
            setError("Las contrasenas no coinciden");
            return;
        }

        setIsSaving(true);
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) {
            setError(updateError.message);
            setIsSaving(false);
            return;
        }
        await supabase.auth.signOut();
        setCompleted(true);
    };

    if (completed) return <Navigate to="/login" replace />;

    return (
        <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="w-full max-w-sm">
                <div className="flex flex-col gap-6 rounded-xl border border-secondary bg-primary p-8">
                    <div>
                        <h1 className="text-xl font-semibold text-primary">Activar cuenta</h1>
                        <p className="mt-1 text-sm text-tertiary">Define la contrasena que usaras para ingresar.</p>
                    </div>
                    {hasSession === false ? (
                        <div className="flex flex-col gap-4">
                            <p className="text-sm text-error-primary">La invitacion es invalida o ha vencido.</p>
                            <Button color="secondary" onClick={() => navigate("/login")}>
                                Ir al login
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <Input label="Nueva contrasena" type="password" icon={Lock01} isRequired value={password} onChange={setPassword} />
                            <Input label="Confirmar contrasena" type="password" icon={Lock01} isRequired value={confirmation} onChange={setConfirmation} />
                            {error && <p className="text-sm text-error-primary">{error}</p>}
                            <Button type="submit" isLoading={isSaving} isDisabled={hasSession !== true}>
                                Activar cuenta
                            </Button>
                        </form>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
