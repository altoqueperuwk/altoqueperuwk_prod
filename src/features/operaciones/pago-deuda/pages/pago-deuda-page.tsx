import { useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { PagoDeudaBoard } from "@/features/operaciones/pago-deuda/components/pago-deuda-board";
import { PagoDeudaSolicitudForm } from "@/features/operaciones/pago-deuda/components/pago-deuda-solicitud-form";

export const PagoDeudaPage = () => {
    const [refreshKey, setRefreshKey] = useState(0);

    return (
        <AppLayout>
            <div className="flex flex-col gap-5">
                <PagoDeudaSolicitudForm onSaved={() => setRefreshKey((value) => value + 1)} />
                <PagoDeudaBoard refreshKey={refreshKey} />
            </div>
        </AppLayout>
    );
};
