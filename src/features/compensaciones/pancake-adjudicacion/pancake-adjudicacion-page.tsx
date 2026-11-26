import { useState } from "react";
import { Save01 } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { useAlert } from "@/components/shared/alert-center";
import { CompensacionFiltros } from "../shared/compensacion-filtros";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { PancakeAdjudicacionPanel } from "./pancake-adjudicacion-panel";
import { type PancakeMapeo, pancakeAdjudicacionService as service } from "./pancake-adjudicacion.service";

/** Punto de integración para Estadísticas (Administración). No crea ruta ni permisos. */
export function PancakeAdjudicacionPage() {
    const notify = useAlert();

    const [month, setMonth] = useState(() => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date()).slice(0, 7));
    const [paginas, setPaginas] = useState("");
    const [pagina, setPagina] = useState("");
    const [identidades, setIdentidades] = useState("");
    const [mapeo, setMapeo] = useState<PancakeMapeo>({ formato: "JSON", raiz: "", conversacion: "", usuario: "", fecha: "", efectiva: "", valor_efectiva: "" });

    const [busy, setBusy] = useState(false);
    const [invalidIdentities, setInvalidIdentities] = useState(false);
    const [generation, setGeneration] = useState(0);
    const lista = paginas
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    const mes = `${month}-01`;
    const guardar = async () => {
        let values: unknown;
        try {
            values = JSON.parse(identidades);
        } catch {
            setInvalidIdentities(true);
            notify("validation", "Ingresa una lista JSON válida de identidades verificadas.");
            return;
        }
        if (!Array.isArray(values)) {
            setInvalidIdentities(true);
            notify("validation", "Las identidades deben ser una lista JSON revisada.");
            return;
        }
        setInvalidIdentities(false);
        setBusy(true);

        try {
            await service.configurar(mes, lista, values);
            notify("success", "Fuente configurada. Importa los archivos originales de todas las páginas.");
            setGeneration((v) => v + 1);
        } catch (e) {
            notify("error", e instanceof Error ? e.message : "No se pudo configurar.");
        } finally {
            setBusy(false);
        }
    };
    return (
        <AppLayout>
            <div className="min-w-0 space-y-4">
                <CompensacionHeading section="evidencias" title="Colaborador del Mes" />
                <CompensacionFiltros>
                    <div className="flex flex-wrap items-end gap-3">
                        <MonthPicker
                            hideLabel
                            label="Periodo"
                            value={month}
                            allowAllMonths={false}
                            onChange={(v) => {
                                setMonth(v);

                                setGeneration((n) => n + 1);
                            }}
                        />
                        <div className="w-full sm:w-64">
                            <Input size="sm" label="Página del Archivo" value={pagina} onChange={setPagina} placeholder="ID original configurado" />
                        </div>
                    </div>
                </CompensacionFiltros>
                <details className="rounded-2xl border border-secondary bg-secondary">
                    <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-tertiary">Configurar Fuente Pancake</summary>
                    <div className="space-y-4 rounded-xl border-t border-secondary bg-primary p-4">
                        <Input size="sm" label="Páginas Incluidas" value={paginas} onChange={setPaginas} placeholder="IDs originales separados por comas" />
                        <TextArea
                            label="Identidades Verificadas"
                            size="sm"
                            rows={3}
                            isInvalid={invalidIdentities}
                            value={identidades}
                            onChange={(value) => {
                                setIdentidades(value);
                                setInvalidIdentities(false);
                            }}
                            placeholder={'[{"pagina":"ID real","usuario_externo":"ID asesor real","id_colaborador":0} (reemplaza con el vínculo verificado)]'}
                            hint="No vincules por nombre. Usa el ID estable del asesor y la ficha ATC correcta. La configuración queda fija tras importar."
                        />
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Select
                                label="Formato"
                                size="sm"
                                selectedKey={mapeo.formato ?? "JSON"}
                                items={[
                                    { id: "JSON", label: "JSON" },
                                    { id: "CSV", label: "CSV" },
                                ]}
                                onSelectionChange={(k) => setMapeo((m) => ({ ...m, formato: k === "CSV" ? "CSV" : "JSON" }))}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Select
                                label="Separador CSV"
                                size="sm"
                                selectedKey={mapeo.separador ?? ","}
                                items={[
                                    { id: ",", label: "Coma" },
                                    { id: ";", label: "Punto y coma" },
                                    { id: "\t", label: "Tabulador" },
                                ]}
                                onSelectionChange={(k) => setMapeo((m) => ({ ...m, separador: k === ";" ? ";" : k === "\t" ? "\t" : "," }))}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Input size="sm" label="Propiedad Raíz JSON" value={mapeo.raiz} onChange={(raiz) => setMapeo((m) => ({ ...m, raiz }))} />
                            {(
                                [
                                    ["conversacion", "Campo Conversación"],
                                    ["usuario", "Campo Asesor"],
                                    ["fecha", "Campo Fecha Efectiva"],
                                    ["efectiva", "Campo Estado"],
                                    ["valor_efectiva", "Valor Atención Efectiva"],
                                ] as const
                            ).map(([key, label]) => (
                                <Input size="sm" key={key} label={label} value={mapeo[key]} onChange={(value) => setMapeo((m) => ({ ...m, [key]: value }))} />
                            ))}
                        </div>
                        <div className="flex justify-end">
                            <Button
                                size="sm"
                                color="primary"
                                iconLeading={Save01}
                                isDisabled={busy || lista.length === 0 || !identidades.trim()}
                                onClick={guardar}
                            >
                                Guardar
                            </Button>
                        </div>
                    </div>
                </details>
                <PancakeAdjudicacionPanel key={`${mes}:${pagina}:${generation}`} mes={mes} pagina={pagina} mapeo={mapeo} />
            </div>
        </AppLayout>
    );
}
