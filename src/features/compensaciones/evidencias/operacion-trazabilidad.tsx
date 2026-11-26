import { useRef, useState } from "react";
import { Link01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { supabase } from "@/lib/supabase";
import type { OperacionAtencion } from "../atenciones/atenciones.service";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import type { EvidenciaEvento } from "./evidencias.types";

export const OperacionTrazabilidad = ({ item, onChanged }: { item: EvidenciaEvento; onChanged: () => void }) => {
    const notify = useAlert();

    const { isAdvisor: isAtc, isStoreManager, isAdministrator, isResolving } = useCompensacionPerfil();
    const isAdvisor = isAtc || isStoreManager;
    const operation = item.referencias.find((ref) => ref.tipoReferencia === "OPERACION");
    const conversation = item.referencias.find((ref) => ref.tipoReferencia === "PANCAKE");
    const isRating = item.categoria === "CALIFICACION";
    const [code, setCode] = useState("");
    const [pancake, setPancake] = useState(conversation?.identificadorExterno ?? "");
    const [items, setItems] = useState<OperacionAtencion[]>([]);
    const [busy, setBusy] = useState(false);

    const [searched, setSearched] = useState(false);
    const lock = useRef(false);
    const version = useRef(0);
    const dni = String(
        item.datos.cliente_documento ??
            item.datos.numero_documento ??
            item.referencias.find((ref) => ref.tipoReferencia === "CLIENTE")?.identificadorExterno ??
            "",
    );
    const canBind = !isResolving && (isAdvisor || isAdministrator) && ["BORRADOR", "PENDIENTE"].includes(item.estado);
    const search = async () => {
        if (lock.current) return;
        const current = ++version.current;
        setBusy(true);

        setItems([]);
        setSearched(false);
        try {
            const result = await supabase.rpc("f_get_compensacion_evento_operaciones", { p_id_evento: item.id, p_codigo: code.trim() || null, p_dni: dni });
            if (result.error) throw result.error;
            if (current === version.current) {
                setItems(result.data.items);
                setSearched(true);
            }
        } catch (cause) {
            if (current === version.current)
                notify("error", cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No fue posible consultar las operaciones");
        } finally {
            if (current === version.current) setBusy(false);
        }
    };
    const bind = async (id: number) => {
        if (lock.current || !canBind) return;
        if (!/^https:\/\/\S+$/.test(pancake.trim()) || pancake.trim().length > 250) {
            notify("validation", "Ingresa el enlace HTTPS de la conversación de Pancake (hasta 250 caracteres).");
            return;
        }
        lock.current = true;
        setBusy(true);

        try {
            const result = await supabase.rpc("f_post_compensacion_evento_operacion_vincular", {
                p_id_evento: item.id,
                p_id_operacion: id,
                p_pancake: pancake.trim(),
            });
            if (result.error) throw result.error;
            onChanged();
        } catch (cause) {
            notify("error", cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No fue posible vincular la operación");
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    return (
        <section className="space-y-3 rounded-xl border border-secondary p-4">
            <h3 className="text-sm font-semibold text-primary">{isRating ? "Sustento de la Calificación" : "Operación y conversación de Pancake"}</h3>
            {isRating && (
                <p className="text-xs text-secondary">
                    {operation && conversation
                        ? item.estado === "PENDIENTE"
                            ? "Sustento completo. La calificación continúa pendiente de revisión."
                            : "Operación y conversación vinculadas. Consulta el estado y el historial de revisión."
                        : canBind
                          ? "Completa los datos de la atención para que el revisor pueda evaluarla."
                          : "El sustento está incompleto. Este estado no permite vincular una operación."}
                </p>
            )}
            <p className="text-xs text-tertiary">
                {operation
                    ? `Operación vinculada: ${String((item.datos.trazabilidad_operacion as OperacionAtencion | undefined)?.codigo ?? operation.idOperacion)}`
                    : "Sin operación vinculada"}
            </p>
            {conversation?.identificadorExterno && /^https:\/\//.test(conversation.identificadorExterno) && (
                <a className="text-xs text-brand-secondary underline" target="_blank" rel="noopener noreferrer" href={conversation.identificadorExterno}>
                    Abrir conversación de Pancake
                </a>
            )}
            {canBind && (!conversation || !operation) && (
                <>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Input size="sm" label="DNI del cliente" value={dni} isDisabled />
                        <Input
                            size="sm"
                            label="Código de operación"
                            placeholder="Opcional: filtrar por código"
                            value={code}
                            isDisabled={lock.current}
                            onChange={(v) => {
                                ++version.current;
                                setCode(v);
                                setItems([]);
                                setSearched(false);
                                setBusy(false);
                            }}
                        />
                    </div>
                    <Input
                        size="sm"
                        label="Enlace de la conversación de Pancake"
                        value={pancake}
                        maxLength={250}
                        onChange={setPancake}
                        isDisabled={lock.current}
                        placeholder="https://…"
                    />
                    <Button size="sm" color="primary" iconLeading={Link01} isLoading={busy} isDisabled={!/^\d{8}$/.test(dni)} onClick={() => void search()}>
                        Buscar operación pagada
                    </Button>
                    {searched && !items.length && (
                        <p className="text-xs text-tertiary">
                            Sin operaciones pagadas para este cliente y código.
                            {isRating ? " Verifica el DNI y el código, o vuelve a consultar cuando la operación esté pagada." : ""}
                        </p>
                    )}
                    {items
                        .filter((candidate) => !operation || operation.idOperacion === candidate.id)
                        .map((candidate) => (
                            <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-secondary p-3">
                                <div className="text-xs text-secondary">
                                    <p className="font-semibold">
                                        {candidate.codigo} · {candidate.servicio}
                                    </p>
                                    <p>
                                        {candidate.cliente} · {candidate.dni}
                                    </p>
                                </div>
                                <Button size="sm" color="secondary" isDisabled={busy} onClick={() => void bind(candidate.id)}>
                                    {isRating ? "Vincular Atención" : "Vincular"}
                                </Button>
                            </div>
                        ))}
                    <p className="text-xs text-tertiary">Vincular evidencia no aprueba el bono. Se conservan las reglas económicas de cada concepto.</p>
                </>
            )}
        </section>
    );
};
