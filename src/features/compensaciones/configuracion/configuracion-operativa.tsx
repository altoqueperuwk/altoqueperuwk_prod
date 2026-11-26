import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw01, Save01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { useAlert } from "@/components/shared/alert-center";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { type BonoComun, repartirBonos } from "./configuracion-bonos";
import { prepararCambiosParametros } from "./configuracion-parametros";
import { agruparPenalidades, explicacionPenalidad, penalidadesPorPerfil, perfilesPenalidad } from "./configuracion-penalidades";
import { type ConfigurationSection, configurationSections } from "./configuracion-section-heading";
import { configuracionService } from "./configuracion.service";
import type { Cargo, Concepto, PenalidadTipo, PlanVersion, Regla } from "./configuracion.types";

interface Props {
    version: PlanVersion | null;
    concepts: Concepto[];
    cargos: Cargo[];
    rules: Regla[];
    penalties: PenalidadTipo[];
    isLoading: boolean;
    onChanged: () => void;
}

const calculationUnits: Record<string, string> = { POR_MINUTO: "/ min", POR_HORA: "/ hora", POR_DIA: "/ día", POR_UNIDAD: "S/" };
const cargosCortos: Record<string, string> = {
    ATENCION_CLIENTE: "ATC",
    JEFE_TIENDA: "Jefe de Sede",
    FACTURACION: "Facturación",
    DISENO_MARKETING: "Marketing",
};
const cargosPagos = perfilesPenalidad.find((item) => item.id === "PAGOS")!.cargos;
const humanize = (value: string) =>
    value
        .toLocaleLowerCase("es-PE")
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));

export const ConfiguracionOperativa = ({ version, concepts, cargos, rules, penalties, isLoading, onChanged }: Props) => {
    const notify = useAlert();
    const [values, setValues] = useState<Record<string, string>>({});
    const [initialValues, setInitialValues] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);
    const saving = useRef(false);
    const session = useRef(0);
    useEffect(() => {
        saving.current = false;
        setIsSaving(false);
        return () => {
            session.current++;
        };
    }, [version?.id]);
    const [penaltyProfile, setPenaltyProfile] = useState("ATC");
    const conceptCode = useMemo(() => new Map(concepts.map((item) => [item.id, item.codigo])), [concepts]);
    const conceptName = useMemo(() => new Map(concepts.map((item) => [item.id, item.nombre])), [concepts]);
    const versionRules = useMemo(
        () => rules.filter((item) => item.idPlanVersion === version?.id && item.estado.toUpperCase() === "ACTIVO"),
        [rules, version?.id],
    );
    const versionPenalties = useMemo(
        () => penalties.filter((item) => item.idPlanVersion === version?.id && item.estado.toUpperCase() === "ACTIVO"),
        [penalties, version?.id],
    );
    const activeCargos = useMemo(() => cargos.filter((item) => item.estado.toUpperCase() === "ACTIVO"), [cargos]);
    const editable = version?.estado === "BORRADOR";
    const disabled = !editable || isLoading || isSaving;

    useEffect(() => {
        const next: Record<string, string> = {};
        versionRules.forEach((item) => {
            next[`rule-${item.id}`] = String(item.tipoCalculo === "PORCENTAJE" ? (item.porcentaje ?? "") : (item.monto ?? ""));
        });
        versionPenalties.forEach((item) => {
            next[`penalty-${item.id}`] = String(item.montoReferencia);
        });
        setValues(next);
        setInitialValues(next);
    }, [versionPenalties, versionRules]);

    const changed = (key: string) => values[key] !== initialValues[key];
    const setValue = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
    const hasChanges = Object.keys(values).some(changed);
    const ruleCode = (item: Regla) => conceptCode.get(item.idConcepto) ?? "";
    const valueInput = (key: string, label: string, unit = "S/", showLabel = true, onValue = (value: string) => setValue(key, value)) => (
        <div className="relative min-w-0">
            <Input
                label={showLabel ? label : undefined}
                aria-label={showLabel ? undefined : `${label} (${unit})`}
                size="sm"
                type="number"
                value={values[key] ?? ""}
                onChange={onValue}
                isDisabled={!editable || isSaving || isLoading}
                inputClassName={`${unit === "%" ? "pr-16" : "pl-12 pr-16"} font-semibold`}
            />
            <span
                aria-hidden="true"
                className={`pointer-events-none absolute bottom-2.5 text-xs font-medium text-tertiary ${unit === "%" ? "right-3" : "left-3"}`}
            >
                {unit === "%" ? "%" : "S/"}
            </span>
            {unit !== "S/" && unit !== "%" && (
                <span aria-hidden="true" className="pointer-events-none absolute right-3 bottom-2.5 text-xs text-tertiary">
                    {unit}
                </span>
            )}
        </div>
    );
    const renderRule = (item: Regla, label: string, showLabel = true, onValue?: (value: string) => void) => {
        if (item.tipoCalculo === "FORMULA" || item.configuracion.metodo_extra === "RECARGO_TRAMOS") {
            const config = item.configuracion;
            return (
                <div className="space-y-1 text-sm text-secondary">
                    {showLabel && <p className="font-medium text-primary">{label}</p>}
                    <p>
                        {config.metodo_extra === "RECARGO_TRAMOS"
                            ? config.limite_primer_tramo != null && config.recargo_primero != null && config.recargo_siguiente != null
                                ? `Primeros ${Number(config.limite_primer_tramo)} min: +${Number(config.recargo_primero)}%; siguientes: +${Number(config.recargo_siguiente)}%.`
                                : "Recargos por tramos según la configuración registrada."
                            : "Calculado según condiciones de la regla."}
                    </p>
                </div>
            );
        }
        const unit = item.tipoCalculo === "PORCENTAJE" ? "%" : (calculationUnits[item.tipoCalculo] ?? "S/");
        return valueInput(`rule-${item.id}`, label, unit, showLabel, onValue);
    };

    const saveAll = async () => {
        if (!editable || saving.current || isLoading) return;
        saving.current = true;
        const current = session.current;
        setIsSaving(true);
        try {
            const changes = prepararCambiosParametros(values, initialValues);
            const result = await configuracionService.saveParameters(version!.id, changes);
            if (current !== session.current) return;
            notify(
                "success",
                result.tarifas_desde
                    ? `Guardado. Tarifas desde ${new Intl.DateTimeFormat("es-PE").format(new Date(`${result.tarifas_desde}T12:00:00`))}.`
                    : "Configuración guardada correctamente",
            );
            onChanged();
        } catch (error) {
            if (current !== session.current) return;
            const message = error && typeof error === "object" && "message" in error ? String(error.message) : "No fue posible guardar la configuración";
            notify("error", message);
        } finally {
            saving.current = false;
            if (current === session.current) setIsSaving(false);
        }
    };

    const bonos = repartirBonos(
        versionRules.filter((item) => ["BONO", "COMISION"].includes(item.categoria)),
        ruleCode,
    );
    const cargosConValor = activeCargos.filter((cargo) => bonos.columnas.some((column) => column.reglas.some((item) => item.idCargo === cargo.id)));
    const nombresCortos = (lista: Cargo[]) => {
        const pagos = activeCargos.filter((cargo) => cargosPagos.includes(cargo.codigo));
        const todoPagos = pagos.length > 1 && pagos.every((cargo) => lista.includes(cargo));
        return [...new Set(lista.map((cargo) => (todoPagos && pagos.includes(cargo) ? "Pagos" : (cargosCortos[cargo.codigo] ?? cargo.nombre))))].join(" · ");
    };
    const appliesTo = (items: Regla[]) => {
        const ids = new Set(items.map((item) => item.idCargo));
        if (ids.has(null) || activeCargos.every((cargo) => ids.has(cargo.id))) return "Todos los cargos";
        return nombresCortos(activeCargos.filter((cargo) => ids.has(cargo.id)));
    };
    // Un campo comun escribe el mismo importe en todas sus reglas; cada una se guarda con su propio valor anterior.
    const setGroup = (items: Regla[]) => (value: string) =>
        setValues((current) => ({ ...current, ...Object.fromEntries(items.map((item) => [`rule-${item.id}`, value])) }));
    const bonusCard = (section: "pagos" | "bonos", title: string, items: BonoComun[]) => (
        <div id={`config-${section}`} className="min-w-0 scroll-mt-6">
            <CompensacionPanel title={title}>
                <div className="grid items-start gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {items.map(({ code, label, reglas }) => (
                        <div key={code} className="min-w-0">
                            {renderRule(reglas[0], label, true, setGroup(reglas))}
                            <p className="mt-1 text-xs text-tertiary">{appliesTo(reglas)}</p>
                        </div>
                    ))}
                    {!items.length && <p className="text-sm text-tertiary">No hay bonos con un importe común.</p>}
                </div>
            </CompensacionPanel>
        </div>
    );
    const profiles = penalidadesPorPerfil(versionPenalties, activeCargos);
    const profile = profiles.find((item) => item.id === penaltyProfile) ?? profiles[0];
    const penaltyRows = agruparPenalidades(profile?.items ?? [], activeCargos);
    const penaltyField = (items: PenalidadTipo[], label: string) =>
        items[0].montoReferencia > 0 ? (
            valueInput(`penalty-${items[0].id}`, label, "S/", false, (value) =>
                setValues((current) => ({ ...current, ...Object.fromEntries(items.map((item) => [`penalty-${item.id}`, value])) })),
            )
        ) : (
            <span className="text-sm text-tertiary">Según escala</span>
        );
    const today = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima" }).format(new Date());

    return (
        <div className="space-y-4 pb-4">
            <CompensacionHeading section="configuracion" title="Configuración" />

            <div className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de parámetros">
                {[
                    { title: "Bonos vigentes", value: versionRules.length },
                    { title: "Cargos Activos", value: activeCargos.length },
                    { title: "Penalidades vigentes", value: versionPenalties.length },
                ].map(({ title, value }) => (
                    <CompensacionPanel key={title} title={title}>
                        <p className="text-display-xs font-semibold text-primary tabular-nums">{isLoading ? "—" : value}</p>
                    </CompensacionPanel>
                ))}
            </div>

            <nav aria-label="Secciones de configuración" className="flex flex-wrap gap-2">
                {(Object.keys(configurationSections) as ConfigurationSection[]).map((section) => (
                    <a
                        key={section}
                        href={`#config-${section}`}
                        className="rounded-lg border border-secondary bg-primary px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                        {configurationSections[section]}
                    </a>
                ))}
            </nav>

            {!editable && !isLoading && (
                <div className="border-warning rounded-lg border bg-warning-secondary p-3 text-sm text-warning-primary">Solo lectura.</div>
            )}
            {isLoading && (
                <div className="flex items-center gap-2 rounded-xl border border-secondary bg-primary p-4 text-sm text-tertiary">
                    <RefreshCw01 className="size-4 animate-spin" /> Cargando configuración...
                </div>
            )}

            {bonusCard("pagos", "Bonos generales", bonos.generales)}
            {bonusCard("bonos", "Bonos de Auditoría Operaciones", bonos.auditoria)}

            <div id="config-cargos" className="min-w-0 scroll-mt-6">
                <CompensacionPanel title="Valores por cargo">
                    <div
                        className="-m-4 overflow-x-auto overscroll-x-contain outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
                        tabIndex={0}
                        role="region"
                        aria-label="Valores por cargo: tabla desplazable"
                    >
                        <table className="w-full min-w-[850px] border-collapse text-left">
                            <thead className="bg-secondary">
                                <tr>
                                    <th className="px-3 py-2 text-xs font-medium text-secondary">Cargo</th>
                                    {bonos.columnas.map((column) => (
                                        <th key={column.code} className="px-3 py-2 text-xs font-medium text-secondary">
                                            {column.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {cargosConValor.map((cargo) => (
                                    <tr key={cargo.id} className="border-t border-secondary">
                                        <td className="px-3 py-3 text-xs font-semibold whitespace-nowrap text-primary">{cargo.nombre}</td>
                                        {bonos.columnas.map((column) => {
                                            const item = column.reglas.find((rule) => rule.idCargo === cargo.id);
                                            return (
                                                <td key={column.code} className="w-48 px-3 py-2">
                                                    {item ? (
                                                        renderRule(item, `${column.label} para ${cargo.nombre}`, false)
                                                    ) : (
                                                        <span className="text-sm text-quaternary">—</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                                {!cargosConValor.length && (
                                    <tr>
                                        <td colSpan={bonos.columnas.length + 1} className="p-4 text-xs text-tertiary">
                                            No hay bonos por cargo configurados.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CompensacionPanel>
            </div>

            {bonos.otros.length > 0 && (
                <CompensacionPanel title="Otros bonos">
                    <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {bonos.otros.map((item) => (
                            <div key={item.id} className="min-w-0">
                                {renderRule(
                                    item,
                                    `${conceptName.get(item.idConcepto) ?? humanize(ruleCode(item))} · ${item.cargoNombre || "General"}${item.sucursalNombre ? ` · ${item.sucursalNombre}` : ""}`,
                                )}
                            </div>
                        ))}
                    </div>
                </CompensacionPanel>
            )}

            <div id="config-penalidades" className="min-w-0 scroll-mt-6">
                <CompensacionPanel
                    title="Penalidades"
                    trailing={
                        <Select
                            aria-label="Perfil"
                            size="sm"
                            className="w-56"
                            items={profiles.map((item) => ({ id: item.id, label: `${item.label} (${item.items.length})` }))}
                            selectedKey={profile?.id ?? null}
                            onSelectionChange={(key) => setPenaltyProfile(String(key))}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                    }
                >
                    <div
                        className="-m-4 overflow-x-auto overscroll-x-contain outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
                        tabIndex={0}
                        role="region"
                        aria-label="Penalidades: tabla desplazable"
                    >
                        <table className="w-full min-w-[850px] border-collapse text-left">
                            <thead className="bg-secondary">
                                <tr>
                                    <th className="px-3 py-2 text-xs font-medium text-secondary">Penalidad</th>
                                    <th className="px-3 py-2 text-xs font-medium text-secondary">Monto</th>
                                    <th className="px-3 py-2 text-xs font-medium text-secondary">Descripción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {penaltyRows.map((row) => {
                                    const first = row.items[0];
                                    const single = row.items.length === 1;
                                    const parcial = !single && row.items.length < new Set(profile.items.map((item) => item.idCargo)).size;
                                    const note = explicacionPenalidad(first.codigo);
                                    return (
                                        <tr key={row.nombre} className="border-t border-secondary align-top">
                                            <td className="w-64 px-3 py-3">
                                                <p className="text-xs font-semibold text-primary">{row.nombre}</p>
                                            </td>
                                            <td className="w-72 px-3 py-2">
                                                {row.importeComun ? (
                                                    <>
                                                        {penaltyField(row.items, `Monto ${row.nombre} para ${single ? first.cargoNombre : profile.label}`)}
                                                        {parcial && (
                                                            <p className="mt-1 text-xs text-tertiary">
                                                                {nombresCortos(
                                                                    activeCargos.filter((cargo) => row.items.some((item) => item.idCargo === cargo.id)),
                                                                )}
                                                            </p>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {row.items.map((item) => (
                                                            <div key={item.id}>
                                                                <p className="mb-1 text-xs text-secondary">{item.cargoNombre}</p>
                                                                {penaltyField([item], `Monto ${row.nombre} para ${item.cargoNombre}`)}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="min-w-80 px-3 py-3 text-xs text-secondary">
                                                {row.descripcionComun ? (
                                                    <p>{first.descripcion}</p>
                                                ) : (
                                                    row.items.map((item) => <p key={item.id}>{item.descripcion}</p>)
                                                )}
                                                {note && <p className="mt-1 font-medium text-primary">{note}</p>}
                                                {first.montoBono ? (
                                                    <p className="mt-1 text-tertiary">Bono por reportar: S/ {first.montoBono.toFixed(2)}</p>
                                                ) : null}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {!penaltyRows.length && (
                                    <tr>
                                        <td colSpan={3} className="p-4 text-sm text-tertiary">
                                            No hay penalidades configuradas.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CompensacionPanel>
            </div>

            <div
                className="sticky bottom-0 z-20 flex items-center justify-between gap-2 rounded-xl border border-secondary bg-primary p-3 shadow-lg sm:flex-wrap sm:gap-3 sm:p-4"
                aria-label="Guardar parámetros"
            >
                <p className={`min-w-0 text-xs sm:text-sm ${hasChanges ? "font-medium text-warning-primary" : "text-secondary"}`}>
                    {hasChanges ? "Cambios sin guardar" : "Sin cambios"} · rige desde hoy ({today})
                </p>
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        color="primary"
                        iconLeading={Save01}
                        aria-label="Guardar parámetros"
                        isLoading={isSaving}
                        isDisabled={!editable || isLoading}
                        onClick={() => void saveAll()}
                    >
                        Guardar
                    </Button>
                </div>
            </div>
        </div>
    );
};
