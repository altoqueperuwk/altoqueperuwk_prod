import { useEffect, useState } from "react";
import { ArrowUpRight, Clock, XClose } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { NativeSelect } from "@/components/base/select/select-native";
import { AlertMessage, withAlertProvider } from "@/components/shared/alert-center";
import { type ColumnDef } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionFiltros } from "@/features/compensaciones/shared/compensacion-filtros";
import { useSessionCache } from "@/providers/session-cache-provider";
import { compensationPath } from "../shared/compensacion-destinos";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { type AdminDashboardPanel, adminDashboardService, adminMesLima } from "./admin-dashboard.service";

export const AdminDashboardPage = withAlertProvider(() => {
    const profile = useCompensacionPerfil();
    if (profile.isResolving)
        return (
            <AppLayout>
                <p role="status">Verificando acceso…</p>
            </AppLayout>
        );
    if (!profile.isAdministrator)
        return (
            <AppLayout>
                <AlertMessage tone="notice">403 · Panel exclusivo de Administración.</AlertMessage>
            </AppLayout>
        );
    return <AdminDashboardContent key={profile.userId} />;
});

const AdminDashboardContent = () => {
    const { navegacion, isLoading: sessionLoading, navigationError } = useSessionCache();
    const [mes, setMes] = useState(adminMesLima);
    const [sede, setSede] = useState<number | null>(null);
    const [rol, setRol] = useState<number | null>(null);
    const [pagina, setPagina] = useState(1);
    const [tamano, setTamano] = useState(20);
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState<{ key: string; data?: AdminDashboardPanel; error?: string } | null>(null);
    const [catalogos, setCatalogos] = useState<AdminDashboardPanel["catalogos"]>({ sedes: [], roles: [] });
    const key = JSON.stringify([mes, sede, rol, pagina, tamano, revision]);
    const ready = !sessionLoading && !navigationError && Boolean(navegacion);
    const loading = !ready || result?.key !== key;
    const error = navigationError || (result?.key === key ? result.error : "");
    const data = ready && !loading && !error ? result?.data : undefined;

    useEffect(() => {
        if (!ready) return;
        let active = true;
        void adminDashboardService
            .listar({ mes, sede, rol, pagina, tamano })
            .then((panel) => {
                if (!active) return;
                setCatalogos(panel.catalogos);
                setResult({ key, data: panel });
            })
            .catch((cause: unknown) => {
                if (active)
                    setResult({ key, error: cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo cargar el panel." });
            });
        return () => {
            active = false;
        };
    }, [ready, mes, sede, rol, pagina, tamano, revision, key]);

    const assigned = new Set((navegacion?.rutas_permitidas ?? []).map(compensationPath));
    const actionLink = (destino: string) => destino.startsWith("/compensaciones/") && !/[\\\s]/.test(destino) && assigned.has(compensationPath(destino));
    const columns: ColumnDef[] = [
        { key: "tipo", header: "Tipo" },
        { key: "rol", header: "Rol" },
        { key: "sede", header: "Sede" },
        { key: "pendientes", header: "Pendientes", align: "right" as const },
        { key: "otro_revisor", header: "Otro Revisor" },
    ].map((column) => ({ ...column, render: (value: unknown) => <span className="text-xs">{String(value)}</span> }));
    const reset = () => {
        setMes(adminMesLima());
        setSede(null);
        setRol(null);
        setPagina(1);
        setRevision((value) => value + 1);
    };

    return (
        <AppLayout>
            <div className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                    <CompensacionHeading section="resumen" title="Dashboard" />
                    <StatusBadge>Gestión Global</StatusBadge>
                </div>
                {error && <AlertMessage tone="error">{error}</AlertMessage>}
                {loading && !error && (
                    <p role="status" className="text-sm text-tertiary">
                        {ready ? "Cargando Dashboard…" : "Verificando tus accesos…"}
                    </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                    {(
                        [
                            ["Eventos Pendientes", "eventos_pendientes"],
                            ["Otro Revisor", "otro_revisor"],
                        ] as const
                    ).map(([title, field]) => (
                        <CompensacionPanel key={field} title={title} trailing={<Clock aria-hidden="true" className="size-5 text-brand-secondary" />}>
                            <p className="text-display-xs font-semibold text-primary tabular-nums">{data?.kpis[field] ?? "—"}</p>
                            <p className="mt-1 text-xs text-tertiary">
                                {data && data.kpis[field] === null
                                    ? "Módulo sin acceso asignado"
                                    : field === "otro_revisor"
                                      ? "Casos propios que requieren revisión independiente"
                                      : "Casos por revisar en el periodo"}
                            </p>
                        </CompensacionPanel>
                    ))}
                </div>
                {data && (
                    <p className="text-xs text-tertiary">
                        Periodo: {data.periodo.mes} · {data.periodo.estado} · {data.total} {data.total === 1 ? "grupo de pendientes" : "grupos de pendientes"}
                    </p>
                )}
                <DataTable
                    density="compact"
                    columns={columns}
                    data={data?.items ?? []}
                    isLoading={loading && !error}
                    page={pagina}
                    totalPages={Math.max(1, data?.total_paginas ?? 1)}
                    pageSize={tamano}
                    onPageChange={setPagina}
                    onPageSizeChange={(value) => {
                        setTamano(value);
                        setPagina(1);
                    }}
                    emptyMessage={error ? "Consulta no disponible" : "No hay pendientes para estos filtros"}
                    emptyDescription={error ? "Actualiza para reintentar la consulta." : "El panel no tiene registros en este periodo."}
                    renderActions={(row) =>
                        actionLink(String(row.destino)) ? (
                            <ButtonUtility
                                href={String(row.destino)}
                                size="xs"
                                color="tertiary"
                                icon={ArrowUpRight}
                                tooltip="Abrir"
                                className={compensationTableActionClass}
                            />
                        ) : null
                    }
                    toolbar={
                        <CompensacionFiltros toolbar>
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="w-56 max-w-full">
                                    <NativeSelect
                                        label="Sede"
                                        hideLabel
                                        size="sm"
                                        value={sede ?? ""}
                                        options={[
                                            { value: "", label: "Todas las sedes" },
                                            ...catalogos.sedes.map((item) => ({ value: String(item.id), label: item.nombre })),
                                        ]}
                                        onChange={(event) => {
                                            setSede(event.target.value ? Number(event.target.value) : null);
                                            setPagina(1);
                                        }}
                                    />
                                </div>
                                <div className="w-56 max-w-full">
                                    <NativeSelect
                                        label="Rol"
                                        hideLabel
                                        size="sm"
                                        value={rol ?? ""}
                                        options={[
                                            { value: "", label: "Todos los roles" },
                                            ...catalogos.roles.map((item) => ({ value: String(item.id), label: item.nombre })),
                                        ]}
                                        onChange={(event) => {
                                            setRol(event.target.value ? Number(event.target.value) : null);
                                            setPagina(1);
                                        }}
                                    />
                                </div>
                                <MonthPicker
                                    hideLabel
                                    label="Periodo"
                                    value={mes}
                                    allowAllMonths={false}
                                    onChange={(value) => {
                                        setMes(value);
                                        setPagina(1);
                                    }}
                                />
                                <Button size="sm" color="secondary" iconLeading={XClose} onClick={reset}>
                                    Limpiar
                                </Button>
                            </div>
                        </CompensacionFiltros>
                    }
                />
            </div>
        </AppLayout>
    );
};
