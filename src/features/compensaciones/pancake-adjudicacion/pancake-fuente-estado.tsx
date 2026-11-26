import { useEffect, useState } from "react";
import { AlertMessage } from "@/components/shared/alert-center";
import { supabase } from "@/lib/supabase";

export function PancakeFuenteEstado({ mes }: { mes: string }) {
    const [estado, setEstado] = useState("");
    useEffect(() => {
        let active = true;
        setEstado("");
        void supabase.rpc("f_get_compensacion_pancake_estado", { p_mes: `${mes}-01` }).then(
            ({ data, error }) => {
                if (active) setEstado(error ? "ERROR" : `${String(data?.estado ?? "ERROR")}${data?.fuente === "CHATS_DNI" ? ":CHATS" : ""}`);
            },
            () => {
                if (active) setEstado("ERROR");
            },
        );
        return () => {
            active = false;
        };
    }, [mes]);
    if (estado === "SIN_FUENTE")
        return <AlertMessage tone="notice">{"Faltan datos auténticos de atenciones; el premio sigue pendiente y no se cuenta como cero."}</AlertMessage>;
    if (estado === "EN_REVISION:CHATS")
        return <AlertMessage tone="notice">{"Los chats del periodo aún no están certificados; el premio por atenciones sigue pendiente."}</AlertMessage>;
    if (estado === "EN_REVISION")
        return <AlertMessage tone="notice">{"Falta certificar la cobertura del periodo; el premio por atenciones sigue pendiente."}</AlertMessage>;
    if (estado === "ERROR") return <AlertMessage tone="error">{"No se pudo consultar el estado de Pancake; actualiza para reintentar."}</AlertMessage>;
    return null;
}
