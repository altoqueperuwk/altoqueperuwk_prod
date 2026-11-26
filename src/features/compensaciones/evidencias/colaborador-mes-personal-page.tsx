import { useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { AlertMessage, withAlertProvider } from "@/components/shared/alert-center";
import { type ColumnDef } from "@/components/shared/data-table";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { atencionesService } from "../atenciones/atenciones.service";
import { EstrellasCell } from "../shared/compensacion-cells";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { usePersonalConsulta } from "../shared/use-personal-consulta";
import { evidenciasService } from "./evidencias.service";
import { fechaLima } from "./tarjeta-tercero-form";

const date = (value: unknown) => <CompensacionFechaCell value={value} />;
export const ColaboradorMesPersonalPage = withAlertProvider(() => {
    const [month, setMonth] = useState(() => fechaLima().slice(0, 7));
    const [refresh, setRefresh] = useState(0);
    return (
        <AppLayout>
            <div className="space-y-4">
                <CompensacionHeading section="evidencias" title="Bono Colaborador del mes" />
                <div className="flex flex-wrap items-end gap-2">
                    <MonthPicker hideLabel label="Periodo" value={month} allowAllMonths={false} onChange={setMonth} />
                    <Button size="sm" color="primary" onClick={() => setRefresh((v) => v + 1)}>
                        Actualizar
                    </Button>
                </div>
                <PersonalAtenciones key={`a-${month}-${refresh}`} month={month} />
                <PersonalEstrellas key={`e-${month}-${refresh}`} month={month} />
                <p className="text-xs text-tertiary">
                    Solo se muestran tus registros. Las dos modalidades requieren validación mensual de puntualidad y disciplina; estos resultados no asignan un
                    ganador ni un pago.
                </p>
            </div>
        </AppLayout>
    );
});
const PersonalAtenciones = ({ month }: { month: string }) => {
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(20);
    const { data, busy, error } = usePersonalConsulta(() => atencionesService.list(month, page, size), [month, page, size]);
    const columns: ColumnDef[] = [
        { key: "fecha_atencion", header: "Fecha", render: date },
        { key: "codigo", header: "Operación" },
        { key: "cliente", header: "Cliente" },
        { key: "servicio", header: "Servicio" },
        {
            key: "resultado",
            header: "Estado",
            render: (value) => <CompensacionEstado dominio="atribucion" valor={value} />,
        },
    ];
    return (
        <section aria-label="Atenciones efectivas" className="space-y-3 [&_td]:text-xs">
            <h2 className="text-sm font-semibold text-primary">Atenciones efectivas en Pancake</h2>
            <p className="text-xs text-tertiary">
                {busy ? "Consultando…" : error ? "Resultado no disponible" : `${data?.validas ?? 0} atenciones válidas con operación pagada`}
            </p>
            {error && <AlertMessage tone="error">{error}</AlertMessage>}
            <DataTable
                density="compact"
                wrapText
                columns={columns}
                data={
                    error
                        ? []
                        : (data?.items ?? []).map((item) => ({
                              ...item,
                              ...item.operacion_snapshot,
                              id: item.id,
                              resultado: item.estado === "LIBERADA" ? "Liberada" : item.contabiliza ? "Válida" : "Operación no pagada",
                          }))
                }
                isLoading={busy}
                page={page}
                pageSize={size}
                totalPages={Math.max(1, Math.ceil((data?.total ?? 0) / size))}
                onPageChange={setPage}
                onPageSizeChange={(v) => {
                    setSize(v);
                    setPage(1);
                }}
                emptyMessage={error ? "Consulta no disponible" : "Sin atenciones en este mes"}
            />
        </section>
    );
};
const PersonalEstrellas = ({ month }: { month: string }) => {
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(20);
    const { data, busy, error } = usePersonalConsulta(() => {
        const [y, m] = month.split("-").map(Number);
        return evidenciasService.getRatings({
            search: "",
            advisor: 0,
            stars: 0,
            status: "",
            from: `${month}-01`,
            to: `${month}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`,
            page,
            pageSize: size,
        });
    }, [month, page, size]);
    const columns: ColumnDef[] = [
        { key: "fechaEvento", header: "Fecha", render: date },
        {
            key: "estrellas",
            header: "Estrellas",
            render: (value) => (
                <span className="[&_[role=img]]:text-sm">
                    <EstrellasCell value={value} />
                </span>
            ),
        },
        { key: "dni", header: "DNI" },
        { key: "descripcion", header: "Notas" },
        {
            key: "estado",
            header: "Estado",
            render: (value) => <CompensacionEstado dominio="registro" valor={value} />,
        },
    ];
    return (
        <section aria-label="Calificaciones por estrellas" className="space-y-3 [&_td]:text-xs">
            <h2 className="text-sm font-semibold text-primary">Calificaciones por estrellas</h2>
            {error && <AlertMessage tone="error">{error}</AlertMessage>}
            <DataTable
                density="compact"
                wrapText
                columns={columns}
                data={error ? [] : (data?.items ?? []).map((item) => ({ ...item, estrellas: item.datos.estrellas, dni: item.datos.cliente_documento ?? "—" }))}
                isLoading={busy}
                page={page}
                pageSize={size}
                totalPages={Math.max(1, data?.totalPages ?? 1)}
                onPageChange={setPage}
                onPageSizeChange={(v) => {
                    setSize(v);
                    setPage(1);
                }}
                emptyMessage={error ? "Consulta no disponible" : "Sin calificaciones en este mes"}
            />
        </section>
    );
};
