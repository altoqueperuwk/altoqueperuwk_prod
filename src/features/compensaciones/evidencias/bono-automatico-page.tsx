import { useEffect, useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { AlertMessage, withAlertProvider } from "@/components/shared/alert-center";
import { type ColumnDef } from "@/components/shared/data-table";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { type BonoSeguimiento, getBonoSeguimiento } from "./bono-automatico.service";
import { evidenciasService } from "./evidencias.service";
import type { EvidenciaEvento, EvidenciaTipo } from "./evidencias.types";
import { fechaLima } from "./tarjeta-tercero-form";

const money = (value: number | null | undefined) =>
    value == null ? "—" : new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(value));
const labels: Record<string, string> = {
    SIN_ASIGNACION: "Sin asignación laboral en el mes",
    FUENTE_PENDIENTE: "Fuente mensual pendiente",
    SIN_META: "Meta de sede pendiente",
    SIN_PERIODO: "Período pendiente",
    PROVISIONAL: "Seguimiento provisional",
};

export const BonoAutomaticoPage = withAlertProvider(({ type }: { type: EvidenciaTipo }) => {
    const [month, setMonth] = useState(() => fechaLima().slice(0, 7));
    const [refresh, setRefresh] = useState(0);
    const [data, setData] = useState<BonoSeguimiento | null>(null);
    const [events, setEvents] = useState<EvidenciaEvento[]>([]);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalPages, setTotalPages] = useState(1);
    useEffect(() => {
        let active = true;
        setBusy(true);
        setError("");
        setData(null);
        setEvents([]);
        const [year, m] = month.split("-").map(Number);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
            setError("Selecciona un mes válido");
            setBusy(false);
            return;
        }
        Promise.all([
            getBonoSeguimiento(type.codigo, month),
            evidenciasService.getList({
                category: "OTRO",
                typeId: type.id,
                status: "",
                search: "",
                from: `${month}-01`,
                to: `${month}-${new Date(Date.UTC(year, m, 0)).getUTCDate()}`,
                page,
                pageSize,
            }),
        ])
            .then(([summary, history]) => {
                if (active) {
                    setData(summary);
                    setEvents(history.items);
                    setTotalPages(Math.max(1, history.totalPages ?? 1));
                }
            })
            .catch((cause) => {
                if (active) setError(cause?.message ?? "No fue posible consultar el seguimiento");
            })
            .finally(() => {
                if (active) setBusy(false);
            });
        return () => {
            active = false;
        };
    }, [month, refresh, type.codigo, type.id, page, pageSize]);
    const columns: ColumnDef[] = [
        { key: "fechaEvento", header: "Fecha", render: (value) => <CompensacionFechaCell value={value} includeTime={false} /> },
        {
            key: "estado",
            header: "Estado",
            render: (value) => <CompensacionEstado dominio="registro" valor={value} />,
        },
        {
            key: "importeAprobado",
            header: "Monto",
            render: (value, row) => (["APROBADO", "LIQUIDADO"].includes(String(row.estado)) ? money(value == null ? null : Number(value)) : "Por validar"),
        },
    ];
    const visiblePage = Math.min(page, totalPages);
    return (
        <AppLayout>
            <div className="flex min-w-0 flex-col gap-4 [&_td]:text-xs">
                <CompensacionHeading section="evidencias" title={type.nombre} />
                <div className="flex flex-wrap items-end gap-2">
                    <MonthPicker
                        hideLabel
                        label="Periodo"
                        value={month}
                        allowAllMonths={false}
                        onChange={(value) => {
                            setMonth(value);
                            setPage(1);
                        }}
                    />
                    <Button size="sm" color="primary" isLoading={busy} onClick={() => setRefresh((v) => v + 1)}>
                        Actualizar
                    </Button>
                </div>
                {error && <AlertMessage tone="error">{error}</AlertMessage>}
                {busy && <p role="status">Consultando seguimiento…</p>}
                {data && (
                    <section className="space-y-3 rounded-xl border border-secondary bg-primary p-5">
                        <h2 className="text-sm font-semibold text-primary">{labels[data.estado] ?? "Seguimiento del mes"}</h2>
                        {data.mensaje && <p className="text-sm text-tertiary">{data.mensaje}</p>}
                        {data.atenciones_validas !== undefined && (
                            <p className="text-xl font-semibold text-primary">Mis atenciones válidas: {data.atenciones_validas}</p>
                        )}
                        {data.meta && (
                            <dl className="grid gap-4 sm:grid-cols-3">
                                <div>
                                    <dt className="text-xs text-tertiary">Objetivo de la sede</dt>
                                    <dd className="mt-1 font-semibold text-primary">{money(data.meta.objetivo)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-tertiary">Monto efectivizado SafetyPay</dt>
                                    <dd className="mt-1 font-semibold text-primary">{money(data.meta.acumulado)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-tertiary">Avance</dt>
                                    <dd className="mt-1 font-semibold text-primary">
                                        {data.meta.porcentaje == null ? "—" : `${Number(data.meta.porcentaje).toFixed(2)}%`}
                                    </dd>
                                </div>
                            </dl>
                        )}
                        {data.meta && (
                            <p className="text-xs text-tertiary">
                                Fuente: operaciones SafetyPay pagadas de tu sede. {data.meta.operaciones} operaciones.
                                {data.meta.heredada ? ` Objetivo heredado de ${data.meta.periodo_origen?.slice(0, 7)}.` : ""}
                            </p>
                        )}
                        <p className="text-sm text-secondary">Mi bono provisional: {money(data.importe_provisional)}</p>
                        {(data.pendientes ?? []).map((p) => (
                            <p key={p.codigo} className="text-sm text-warning-primary">
                                {p.mensaje}
                            </p>
                        ))}
                        <p className="text-xs text-tertiary">
                            El avance no acredita un pago. La elegibilidad y el monto definitivo se confirman en Bonos del mes.
                        </p>
                    </section>
                )}
                <section aria-label="Mis resultados registrados" className="min-w-0 space-y-3">
                    <h2 className="text-sm font-semibold text-primary">Mis resultados registrados</h2>
                    <DataTable
                        density="compact"
                        wrapText
                        columns={columns}
                        data={busy || error ? [] : events.map((event) => ({ ...event }))}
                        isLoading={busy}
                        page={visiblePage}
                        pageSize={pageSize}
                        totalPages={totalPages}
                        onPageChange={setPage}
                        onPageSizeChange={(value) => {
                            setPageSize(value);
                            setPage(1);
                        }}
                        emptyMessage={error ? "Consulta no disponible" : "Sin resultados registrados para ti en este mes."}
                        emptyDescription={error ? "Vuelve a intentar la consulta." : "Los resultados aparecerán cuando estén registrados."}
                    />
                </section>
            </div>
        </AppLayout>
    );
});
