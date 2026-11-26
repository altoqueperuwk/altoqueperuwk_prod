import { useEffect, useState } from "react";
import { CheckCircle, Clock, Coins01, Eye } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { AlertMessage, useAlert, withAlertProvider } from "@/components/shared/alert-center";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { AdminAuditoriaNavigation } from "../shared/admin-auditoria-navigation";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { EvidenciaDetailModal } from "./evidencia-detail-modal";
import { evidenciasService } from "./evidencias.service";
import type { EvidenciaEvento, EvidenciasResult } from "./evidencias.types";
import { pagosDeteccionesColumnas, pagosDeteccionesFilas } from "./pagos-detecciones-columns";
import { PagosDeteccionesFiltrosBar, pagosDeteccionesFiltrosIniciales } from "./pagos-detecciones-filtros";
import { PagosDeteccionesForm, pagosDeteccionesError } from "./pagos-detecciones-form";
import type { PagosDeteccionTipo } from "./pagos-detecciones.service";

export const PagosDeteccionesPage = withAlertProvider(({ tipo }: { tipo: PagosDeteccionTipo }) => {
    const { userId, isResolving } = useCompensacionPerfil();
    return isResolving ? (
        <AppLayout>
            <p role="status">Verificando acceso…</p>
        </AppLayout>
    ) : (
        <PagosDeteccionesContent key={`${userId}:${tipo}`} tipo={tipo} />
    );
});
const PagosDeteccionesContent = ({ tipo }: { tipo: PagosDeteccionTipo }) => {
    const { isAdministrator } = useCompensacionPerfil();
    const title = tipo === "REPORTE_ABANDONO" ? "Abandono Comercial" : "Error en Registro Manual o Código";
    const notify = useAlert();
    const [draft, setDraft] = useState(pagosDeteccionesFiltrosIniciales),
        [filters, setFilters] = useState(draft);
    const [page, setPage] = useState(1),
        [size, setSize] = useState(20),
        [refresh, setRefresh] = useState(0);
    const [result, setResult] = useState<EvidenciasResult | null>(null),
        [loading, setLoading] = useState(true),
        [listError, setListError] = useState("");
    const [selected, setSelected] = useState<EvidenciaEvento | null>(null);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setResult(null);
        setListError("");
        void evidenciasService
            .getTypes()
            .then(async (types) => {
                const type = types.find((item) => item.codigo === tipo);
                if (!type) throw new Error("El concepto no está disponible para tu perfil");
                return evidenciasService.getList({ ...filters, typeId: type.id, page, pageSize: size });
            })
            .then((value) => {
                if (active) setResult(value);
            })
            .catch((cause) => {
                if (active) setListError(pagosDeteccionesError(cause));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [tipo, filters, page, size, refresh]);
    const metrics = [
        { label: "Pendientes", value: result?.resumen.pendientes, icon: Clock, color: "text-warning-primary" },
        { label: "Aprobados", value: result?.resumen.aprobados, icon: CheckCircle, color: "text-success-primary" },
        { label: "Monto aprobado", value: result ? `S/ ${result.resumen.importeAprobado.toFixed(2)}` : null, icon: Coins01, color: "text-success-primary" },
    ];
    return (
        <AppLayout>
            <div className="min-w-0 space-y-4">
                <CompensacionHeading section="evidencias" title={title} />
                <AdminAuditoriaNavigation />
                <div className="grid gap-4 sm:grid-cols-3">
                    {metrics.map(({ label, value, icon: Icon, color }) => (
                        <CompensacionPanel key={label} title={label} trailing={<Icon aria-hidden="true" className={`size-5 ${color}`} />}>
                            <p className={`text-xl font-semibold ${color}`}>{loading || listError ? "—" : (value ?? 0)}</p>
                        </CompensacionPanel>
                    ))}
                </div>
                {!isAdministrator && (
                    <PagosDeteccionesForm
                        tipo={tipo}
                        onSaved={() => {
                            setRefresh((value) => value + 1);
                            notify("success", "Reporte registrado. Pendiente de revisión independiente.");
                        }}
                    />
                )}
                {listError && <AlertMessage tone="error">{listError}</AlertMessage>}
                <DataTable
                    density="compact"
                    columns={pagosDeteccionesColumnas(tipo)}
                    data={pagosDeteccionesFilas(result?.items ?? [])}
                    page={page}
                    totalPages={result?.totalPages ?? 1}
                    pageSize={size}
                    isLoading={loading}
                    onPageChange={setPage}
                    onPageSizeChange={(value) => {
                        setSize(value);
                        setPage(1);
                    }}
                    toolbar={
                        <PagosDeteccionesFiltrosBar
                            draft={draft}
                            onDraft={setDraft}
                            onClear={() => {
                                const value = pagosDeteccionesFiltrosIniciales();
                                setDraft(value);
                                setFilters(value);
                                setPage(1);
                            }}
                            onApply={() => {
                                setFilters({ ...draft });
                                setPage(1);
                                setRefresh((value) => value + 1);
                            }}
                        />
                    }
                    renderActions={(row) => (
                        <ButtonUtility
                            size="xs"
                            color="tertiary"
                            icon={Eye}
                            tooltip="Consultar reporte y revisión"
                            className={compensationTableActionClass}
                            onClick={() => setSelected(result?.items.find((item) => item.id === row.id) ?? null)}
                        />
                    )}
                />
                <EvidenciaDetailModal
                    item={selected}
                    onClose={() => setSelected(null)}
                    onChanged={() => {
                        setSelected(null);
                        setRefresh((value) => value + 1);
                    }}
                    readOnly={!isAdministrator}
                />
            </div>
        </AppLayout>
    );
};
