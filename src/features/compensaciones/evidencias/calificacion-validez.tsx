import { useRef, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { useAlert } from "@/components/shared/alert-center";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { evidenciasService } from "./evidencias.service";
import type { CalificacionPolitica } from "./evidencias.types";

export const CalificacionValidez = ({
    politica,
    puedeConfigurar,
    onSave,
}: {
    politica: CalificacionPolitica;
    puedeConfigurar: boolean;
    onSave: () => void;
}) => {
    const [values, setValues] = useState(politica);
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const notify = useAlert();
    const save = async () => {
        if (lock.current || !puedeConfigurar) return;
        lock.current = true;
        setBusy(true);
        try {
            await evidenciasService.saveRatingPolicy(values);
            notify("success", "Requisitos guardados para nuevas calificaciones.");
            onSave();
        } catch (error) {
            notify("error", error && typeof error === "object" && "message" in error ? String(error.message) : "No se pudieron guardar los requisitos");
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    return (
        <CompensacionPanel title="Atención Calificada">
            <p className="text-xs text-tertiary">Pagan 4 o 5 estrellas.</p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
                {(
                    [
                        ["dni_obligatorio", "DNI obligatorio"],
                        ["comentario_obligatorio", "Comentario obligatorio"],
                        ["asesor_obligatorio", "Asesor obligatorio"],
                    ] as const
                ).map(([key, label]) => (
                    <Checkbox
                        key={key}
                        label={label}
                        isSelected={values[key]}
                        isDisabled={busy || !puedeConfigurar}
                        onChange={(value) => setValues((current) => ({ ...current, [key]: value }))}
                    />
                ))}
            </div>
            {puedeConfigurar && (
                <Button
                    size="sm"
                    className="mt-4"
                    aria-label="Guardar requisitos"
                    isDisabled={JSON.stringify(values) === JSON.stringify(politica)}
                    isLoading={busy}
                    onClick={() => void save()}
                >
                    Guardar
                </Button>
            )}
        </CompensacionPanel>
    );
};
