import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { useToast } from "@/providers/toast-provider";
import { useActiveCompany } from "@/features/operaciones/efectivizacion/shared/hooks/use-active-company";
import { useRouteCompanies } from "@/features/operaciones/efectivizacion/shared/hooks/use-route-companies";
import { bancariaRouteKeys, getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { OperacionRutaBancaria } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { BancariaOperationalTabs } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-operational-tabs";
import { formatCierreDate, reporteCierreCajaService } from "./services/reporte-cierre-caja.service";

const visibleTabs = ["Efectivizacion", "Pago Deuda", "Derivados"] as const;
const visibleTabNames = new Set<string>(visibleTabs);
const retentionRoutes = new Set<OperacionRutaBancaria>(["bcp", "scotiabank", "banbif", "safetypay"]);

const normalizeDateKey = (value: string | null | undefined) => {
    if (!value) return null;

    const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;

    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Lima",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);

    return `${parts.find((part) => part.type === "year")?.value ?? ""}-${parts.find((part) => part.type === "month")?.value ?? ""}-${parts.find((part) => part.type === "day")?.value ?? ""}`;
};

const getHistoricalParams = (date: string) => ({
    p_fecha_caja_cierre_desde: `${date}T00:00:00`,
    p_fecha_caja_cierre_hasta: `${date}T23:59:59`,
});

const getVisibleFlowCount = (rows: Array<{ tab?: string | null; cantidad?: number | null }>) =>
    rows
        .filter((row) => visibleTabNames.has(String(row.tab ?? "")))
        .reduce((total, row) => total + Number(row.cantidad ?? 0), 0);

export const ReporteCierreCajaOperationalPage = () => {
    const { addToast } = useToast();
    const [selectedBank, setSelectedBank] = useState<OperacionRutaBancaria>("bcp");
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [dateOptions, setDateOptions] = useState<string[]>([]);
    const [isLoadingDates, setIsLoadingDates] = useState(true);
    const [bankCounts, setBankCounts] = useState<Record<string, number>>({});
    const [badgeError, setBadgeError] = useState<string | null>(null);

    const { data: routeCajas, error: companiesError, isLoading: isLoadingCompanies } = useRouteCompanies(selectedBank);
    const {
        activeCompanyId,
        companies,
        setActiveCompanyId,
    } = useActiveCompany(routeCajas, selectedBank);

    useEffect(() => {
        let ignore = false;
        setIsLoadingDates(true);

        reporteCierreCajaService
            .getFechas()
            .then((rows) => {
                if (ignore) return;
                const uniqueDates = Array.from(new Set((rows ?? []).map((row) => normalizeDateKey(row.fecha_cierre)).filter((date): date is string => Boolean(date))));
                setDateOptions(uniqueDates.sort((a, b) => b.localeCompare(a)));
            })
            .catch((error) => {
                if (!ignore) addToast("error", error instanceof Error ? error.message : "No se pudieron cargar las fechas de cierre.");
            })
            .finally(() => {
                if (!ignore) setIsLoadingDates(false);
            });

        return () => {
            ignore = true;
        };
    }, [addToast]);

    useEffect(() => {
        let ignore = false;

        if (!selectedDate) {
            setBankCounts({});
            setBadgeError(null);
            return () => {
                ignore = true;
            };
        }

        const dateParams = getHistoricalParams(selectedDate);
        setBadgeError(null);

        Promise.all(
            bancariaRouteKeys.map(async (ruta) => {
                const params = {
                    p_ruta: ruta,
                    p_id_empresa: null,
                    p_id_empresa_cuenta_bancaria: null,
                    ...dateParams,
                };
                const rows = retentionRoutes.has(ruta)
                    ? await operacionesRpcService.getOperacionRetencionBandejaBadges(params)
                    : await operacionesRpcService.getOperacionBandejaBadges(params);
                return [ruta, getVisibleFlowCount(rows ?? [])] as const;
            }),
        )
            .then((entries) => {
                if (!ignore) setBankCounts(Object.fromEntries(entries));
            })
            .catch((error) => {
                if (!ignore) {
                    setBankCounts({});
                    setBadgeError(error instanceof Error ? error.message : "No se pudieron cargar los conteos del cierre.");
                }
            });

        return () => {
            ignore = true;
        };
    }, [selectedDate]);

    const dateItems = useMemo(
        () => dateOptions.map((date) => ({ id: date, label: formatCierreDate(date) })),
        [dateOptions],
    );

    const handleBankChange = (ruta: OperacionRutaBancaria) => {
        setSelectedBank(ruta);
        setActiveCompanyId(null);
    };

    return (
        <AppLayout>
            <div className="flex flex-col gap-5">
                <div>
                    <h1 className="text-xl font-semibold text-primary">Cierre de Caja</h1>
                    <p className="text-sm text-tertiary">Consulta las operaciones finalizadas de cada cierre.</p>
                </div>

                <div className="overflow-hidden rounded-lg border border-secondary bg-primary shadow-xs">
                    <div className="border-b border-secondary p-3 sm:p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                            <p className="mb-2 text-xs font-semibold uppercase text-tertiary">Bancos</p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                                {bancariaRouteKeys.map((ruta) => (
                                    <Button
                                        key={ruta}
                                        size="sm"
                                        color={selectedBank === ruta ? "primary" : "secondary"}
                                        className="w-full justify-center"
                                        onClick={() => handleBankChange(ruta)}
                                    >
                                        <span className="truncate">{getRutaLabel(ruta)}</span>
                                        {selectedDate && bankCounts[ruta] ? (
                                            <span className="ml-1 rounded-md bg-primary px-1.5 py-0.5 text-xs font-medium text-secondary ring-1 ring-primary ring-inset">
                                                {bankCounts[ruta]}
                                            </span>
                                        ) : null}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div className="w-full shrink-0 lg:w-64">
                            <Select
                                label="Consulta Fechas de Cierre"
                                placeholder="Seleccione una fecha"
                                size="sm"
                                items={dateItems}
                                selectedKey={selectedDate ?? null}
                                isDisabled={isLoadingDates}
                                onSelectionChange={(key) => setSelectedDate(key ? String(key) : null)}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                        </div>
                    </div>

                    <div className="mt-4 border-t border-secondary pt-3">
                        <p className="mb-2 text-xs font-semibold uppercase text-tertiary">Empresas</p>
                        {isLoadingCompanies ? (
                            <p className="text-sm text-tertiary">Cargando empresas...</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {companies.map((company) => (
                                    <Button
                                        key={company.id_empresa}
                                        size="sm"
                                        color={activeCompanyId === company.id_empresa ? "primary" : "secondary"}
                                        className="max-w-full justify-center"
                                        onClick={() => setActiveCompanyId(company.id_empresa)}
                                    >
                                        <span className="truncate">{company.nombre_empresa}</span>
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                    </div>

                {(companiesError || badgeError) && (
                    <div className="rounded-lg border border-error-primary bg-error-primary/10 px-4 py-3 text-sm text-error-primary">
                        {companiesError || badgeError}
                    </div>
                )}

                <BancariaOperationalTabs
                    activeAccountId={null}
                    activeCajaId={null}
                    activeCompanyCaja={null}
                    activeCompanyId={activeCompanyId}
                    companies={companies}
                    hasRetentionRule={companies.find((company) => company.id_empresa === activeCompanyId)?.flag_retencion_cuenta === true}
                    enabled={Boolean(selectedDate)}
                    embedded
                    emptyText={selectedDate ? "Sin operaciones para este cierre." : "Selecciona una fecha de cierre para consultar operaciones."}
                    historyDate={selectedDate}
                    flowTabsAsButtons
                    hidePagination
                    presentation="plain"
                    readOnly
                    showCompanyTabs={false}
                    onCompanyChange={setActiveCompanyId}
                    ruta={selectedBank}
                    visibleTabs={["Efectivizacion", "Pago Deuda", "Derivados"]}
                />
                </div>
            </div>
        </AppLayout>
    );
};
