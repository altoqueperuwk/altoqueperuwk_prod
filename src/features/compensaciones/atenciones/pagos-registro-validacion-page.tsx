import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { AlertMessage, useAlert, withAlertProvider } from "@/components/shared/alert-center";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionEstado } from "../shared/compensacion-estado";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { type PagosRegistroNuevo, pagosRegistroNuevoService } from "./pagos-registro-nuevo.service";

const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const errorText = (cause: unknown) => (cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo completar la solicitud");
const mesActual = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 7);

/**
 * Registro Nuevo del Jefe Superior de Pagos (Esquema 12): no registra; valida los registros nuevos de todos los perfiles y sedes
 * cuya primera operación se pagó dentro de los siete días. La validación genera el bono de Auditar Nuevos, que aprueba Administración.
 */
export const PagosRegistroValidacionPage = withAlertProvider(() => {
    const notify = useAlert();
    const [mes, setMes] = useState(mesActual());
    const [items, setItems] = useState<PagosRegistroNuevo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState<number | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const load = useCallback(() => {
        let active = true;
        setLoading(true);
        setError("");
        pagosRegistroNuevoService
            .listar(mes)
            .then((rows) => active && setItems(rows))
            .catch((cause) => {
                if (!active) return;
                setItems([]);
                setError(errorText(cause));
            })
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [mes]);
    useEffect(() => load(), [load]);
    useEffect(() => setPage(1), [mes]);
    const validar = async (item: PagosRegistroNuevo) => {
        if (busyId) return;
        setBusyId(item.id);
        setError("");
        try {
            await pagosRegistroNuevoService.validar(item.id);
            notify("success", "Registro validado. Pendiente de aprobación.");
            load();
        } catch (cause) {
            setError(errorText(cause));
        } finally {
            setBusyId(null);
        }
    };
    const pendientes = items.filter((item) => !item.validacion).length;
    const aprobados = items.reduce((total, item) => total + (item.validacion?.estado === "APROBADO" ? (item.validacion.importe ?? 0) : 0), 0);
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const current = Math.min(page, totalPages);
    const visibles = items.slice((current - 1) * pageSize, current * pageSize);
    return (
        <AppLayout>
            <div className="min-w-0 space-y-5">
                <CompensacionHeading section="evidencias" title="Registro Nuevo" />
                <div className="grid gap-4 sm:grid-cols-3">
                    {[
                        ["Registros elegibles", items.length],
                        ["Por validar", pendientes],
                        ["Bono aprobado", money.format(aprobados)],
                    ].map(([title, value]) => (
                        <CompensacionPanel key={title} title={String(title)}>
                            <p className="text-display-xs font-semibold text-primary tabular-nums">{loading ? "…" : value}</p>
                        </CompensacionPanel>
                    ))}
                </div>
                {error && <AlertMessage tone="error">{error}</AlertMessage>}
                <DataTable
                    density="compact"
                    columns={[
                        { key: "documento", header: "DNI" },
                        { key: "nombre", header: "Cliente" },
                        { key: "registradoPor", header: "Registrado por" },
                        { key: "sede", header: "Sede" },
                        { key: "operacion", header: "Operación" },
                        { key: "monto", header: "Monto", align: "right", render: (value) => (value == null ? "—" : money.format(Number(value))) },
                        { key: "fechaPago", header: "Fecha de pago", render: (value) => <CompensacionFechaCell value={String(value)} /> },
                        { key: "areaPagos", header: "Área de Pagos", render: (value) => (value ? String(value) : "—") },
                        {
                            key: "validacion",
                            header: "Bono Validación",
                            render: (_value, row) => {
                                const item = items.find((candidate) => candidate.id === row.id);
                                if (!item) return null;
                                return item.validacion ? (
                                    <div className="flex items-center gap-2">
                                        <CompensacionEstado dominio="registro" valor={item.validacion.estado} />
                                        {item.validacion.importe != null && <span className="tabular-nums">{money.format(item.validacion.importe)}</span>}
                                    </div>
                                ) : (
                                    <Button
                                        size="xs"
                                        color="secondary"
                                        isLoading={busyId === item.id}
                                        isDisabled={busyId !== null}
                                        onClick={() => validar(item)}
                                    >
                                        Validar
                                    </Button>
                                );
                            },
                        },
                    ]}
                    data={visibles.map((item) => ({ ...item }))}
                    isLoading={loading}
                    page={current}
                    pageSize={pageSize}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                        setPageSize(size);
                        setPage(1);
                    }}
                    emptyMessage="Sin registros nuevos elegibles en el periodo"
                    toolbar={
                        <div className="w-44">
                            <Input size="sm" label="Mes" type="month" value={mes} onChange={(value) => value && setMes(value)} />
                        </div>
                    }
                />
            </div>
        </AppLayout>
    );
});
