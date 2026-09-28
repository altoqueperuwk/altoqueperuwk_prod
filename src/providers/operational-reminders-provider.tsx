import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { recordatoriosOperativosService } from "@/features/recordatorios-operativos/recordatorios-operativos.service";
import type { RecordatorioResumen } from "@/features/recordatorios-operativos/recordatorios-operativos.types";

const EMPTY_SUMMARY: RecordatorioResumen = { activos: 0, nuevos: 0, nivel1: 0, nivel2: 0, nivel3: 0 };

interface OperationalRemindersContextValue {
    resumen: RecordatorioResumen;
    isLoading: boolean;
    refresh: () => Promise<void>;
}

const OperationalRemindersContext = createContext<OperationalRemindersContextValue | undefined>(undefined);

export const useOperationalReminders = () => {
    const context = useContext(OperationalRemindersContext);
    if (!context) throw new Error("useOperationalReminders must be used within OperationalRemindersProvider");
    return context;
};

export const OperationalRemindersProvider = ({ children }: { children: ReactNode }) => {
    const [resumen, setResumen] = useState(EMPTY_SUMMARY);
    const [isLoading, setIsLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            setResumen(await recordatoriosOperativosService.getResumen());
        } catch {
            setResumen(EMPTY_SUMMARY);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
        const interval = window.setInterval(() => void refresh(), 30_000);
        const handleFocus = () => void refresh();
        window.addEventListener("focus", handleFocus);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener("focus", handleFocus);
        };
    }, [refresh]);

    const value = useMemo(() => ({ resumen, isLoading, refresh }), [isLoading, refresh, resumen]);
    return <OperationalRemindersContext.Provider value={value}>{children}</OperationalRemindersContext.Provider>;
};
