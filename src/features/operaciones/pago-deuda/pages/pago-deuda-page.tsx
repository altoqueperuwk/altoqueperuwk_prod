import { useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { PagoDeudaBoard } from "@/features/operaciones/pago-deuda/components/pago-deuda-board";
import { PagoDeudaSolicitudForm } from "@/features/operaciones/pago-deuda/components/pago-deuda-solicitud-form";

export const PagoDeudaPage = () => {
    const [refreshKey, setRefreshKey] = useState(0);

    return (
        <AppLayout>
            <div className="flex flex-col gap-5">
                <div>
                    <p className="text-sm text-tertiary">Home &gt; Operaciones &gt; Pago Deuda</p>
                    <h1 className="mt-1 text-xl font-semibold text-primary">Pago Deuda</h1>
                </div>

                <PagoDeudaSolicitudForm onSaved={() => setRefreshKey((value) => value + 1)} />
                <PagoDeudaBoard refreshKey={refreshKey} />
            </div>
        </AppLayout>
    );
};
