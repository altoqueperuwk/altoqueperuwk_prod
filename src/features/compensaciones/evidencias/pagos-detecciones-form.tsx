import { useEffect, useRef, useState } from "react";
import { Save01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AlertMessage } from "@/components/shared/alert-center";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { type PagosDeteccionTipo, type PagosOperacion, pagosDeteccionesService } from "./pagos-detecciones.service";

export const pagosDeteccionesError = (cause: unknown) =>
    cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo completar la solicitud";

export const pagosDeteccionTipos: { id: PagosDeteccionTipo; label: string }[] = [
    { id: "REPORTE_ABANDONO", label: "Reporte de Abandono" },
    { id: "DETECCION_ERROR_MANUAL", label: "Error en Datos Manuales o Códigos" },
];
const localDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

interface Props {
    /** Fija el concepto; sin él se elige dentro del formulario. */
    tipo?: PagosDeteccionTipo;
    onSaved: () => void;
}

/** Mismos campos que las demás auditorías: concepto, DNI, operación, notas y fecha. */
export const PagosDeteccionesForm = ({ tipo: fixed, onSaved }: Props) => {
    const [chosen, setChosen] = useState<PagosDeteccionTipo | null>(null);
    const tipo = fixed ?? chosen;
    const [dni, setDni] = useState(""),
        [operaciones, setOperaciones] = useState<PagosOperacion[]>([]),
        [operacion, setOperacion] = useState<number | null>(null),
        [notas, setNotas] = useState(""),
        [fecha, setFecha] = useState(localDate());
    const [saving, setSaving] = useState(false),
        [error, setError] = useState("");
    const key = useRef(crypto.randomUUID()),
        payload = useRef(""),
        lock = useRef(false);

    useEffect(() => {
        let active = true;
        setOperaciones([]);
        setOperacion(null);
        setError("");
        if (tipo && dni.length === 8) {
            pagosDeteccionesService
                .operaciones(dni, tipo)
                .then((rows) => {
                    if (active) setOperaciones(rows);
                })
                .catch((cause) => {
                    if (active) setError(pagosDeteccionesError(cause));
                });
        }
        return () => {
            active = false;
        };
    }, [dni, tipo]);

    const reset = () => {
        setChosen(null);
        setDni("");
        setNotas("");
        setFecha(localDate());
        setError("");
        key.current = crypto.randomUUID();
        payload.current = "";
    };
    const canSave = !!tipo && dni.length === 8 && notas.trim().length >= 5 && !!fecha;
    const save = async () => {
        if (lock.current || !tipo || !canSave) return;
        lock.current = true;
        setSaving(true);
        setError("");
        try {
            const datos = { motivo: notas.trim(), dni, fecha };
            const nextPayload = JSON.stringify([tipo, operacion, datos]);
            if (payload.current && payload.current !== nextPayload) key.current = crypto.randomUUID();
            payload.current = nextPayload;
            await pagosDeteccionesService.guardar(tipo, operacion, datos, key.current);
            reset();
            onSaved();
        } catch (cause) {
            setError(pagosDeteccionesError(cause));
        } finally {
            lock.current = false;
            setSaving(false);
        }
    };
    return (
        <CompensacionPanel title="Registrar Auditoria">
            <div className="flex flex-wrap items-end gap-3 [&_label]:whitespace-nowrap">
                {!fixed && (
                    <div className="w-full sm:w-72">
                        <Select
                            label="Tipo de incidencia"
                            placeholder="Seleccionar tipo"
                            size="sm"
                            isRequired
                            isDisabled={saving}
                            items={pagosDeteccionTipos}
                            selectedKey={chosen}
                            onSelectionChange={(value) => setChosen(value ? (String(value) as PagosDeteccionTipo) : null)}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                    </div>
                )}
                <div className="w-full sm:w-36">
                    <Input
                        size="sm"
                        label="DNI del Cliente"
                        placeholder="8 dígitos"
                        isRequired
                        value={dni}
                        maxLength={8}
                        inputMode="numeric"
                        isDisabled={saving}
                        onChange={(value) => setDni(value.replace(/\D/g, "").slice(0, 8))}
                    />
                </div>
                <div className="w-full min-w-0 sm:min-w-56 sm:flex-1">
                    <Select
                        size="sm"
                        label="Operación (opcional)"
                        placeholder={operaciones.length ? "Seleccionar" : "Sin operaciones"}
                        items={operaciones.map((op) => ({ id: op.id, label: `${op.codigo} · ${op.cliente} · ${op.estado}` }))}
                        selectedKey={operacion}
                        onSelectionChange={(id) => setOperacion(id == null ? null : Number(id))}
                        isDisabled={saving || !operaciones.length}
                    >
                        {(item) => <Select.Item {...item} />}
                    </Select>
                </div>
                <div className="w-full min-w-0 sm:min-w-52 sm:flex-1">
                    <CompensacionNoteField label="Notas" placeholder="Qué pasó" value={notas} onChange={setNotas} isDisabled={saving} isRequired />
                </div>
                <div className="w-full sm:w-40 sm:shrink-0">
                    <CompensacionDatePicker label="Fecha" isRequired isDisabled={saving} value={fecha} onChange={setFecha} />
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                    <Button size="sm" color="primary" iconLeading={Save01} isLoading={saving} isDisabled={saving || !canSave} onClick={() => void save()}>
                        Guardar
                    </Button>
                    <Button size="sm" color="secondary" iconLeading={XClose} isDisabled={saving} onClick={reset}>
                        Cancelar
                    </Button>
                </div>
            </div>
            {error && (
                <div className="mt-3">
                    <AlertMessage tone="validation">{error}</AlertMessage>
                </div>
            )}
        </CompensacionPanel>
    );
};
