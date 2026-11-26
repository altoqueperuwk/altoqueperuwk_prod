import { Save01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { MarketingRecoveryOperations } from "./marketing-recovery-operations";
import type { MarketingOperacion, MarketingPanel, MarketingTipo } from "./marketing.service";

export const redesSociales = [
    { id: "TIKTOK", label: "TikTok" },
    { id: "INSTAGRAM", label: "Instagram" },
    { id: "FACEBOOK", label: "Facebook" },
    { id: "YOUTUBE", label: "YouTube" },
    { id: "OTRO", label: "Otro" },
];

export interface MarketingCaptureFormProps {
    type: MarketingTipo;
    alert: boolean;
    data: MarketingPanel;
    form: Record<string, string>;
    editId: number | null;
    attempted: boolean;
    saving: boolean;
    operations: MarketingOperacion[];
    lookupBusy: boolean;
    hideDraft?: boolean;
    set: (key: string, value: string) => void;
    onOperationSelect: (id: number | null) => void;
    onLookup: () => void;
    onSubmit: (send: boolean) => void;
    onCancel: () => void;
}

export const MarketingCaptureForm = ({
    type,
    alert,
    data,
    form,
    editId,
    attempted,
    saving,
    operations,
    lookupBusy,
    hideDraft,
    set,
    onOperationSelect,
    onLookup,
    onSubmit,
    onCancel,
}: MarketingCaptureFormProps) => (
    <CompensacionPanel title={editId ? "Editar Registro" : alert ? "Registrar Alerta" : type === "VIDEO_VIRAL" ? "Registrar Video" : "Registrar Recuperación"}>
        <div className="flex flex-wrap items-end gap-3 [&_label]:whitespace-nowrap">
            {alert && (
                <>
                    <div className="w-64 max-w-full">
                        <Select
                            label="Asesor"
                            placeholder="Seleccionar asesor"
                            size="sm"
                            selectedKey={form.responsable_id ? Number(form.responsable_id) : null}
                            onSelectionChange={(v) => set("responsable_id", String(v ?? ""))}
                            items={data.responsables.map((c) => ({ id: c.id, label: `${c.nombre} · ${c.sede}` }))}
                        >
                            {(item) => <Select.Item {...item} />}
                        </Select>
                    </div>
                    <div className="w-52">
                        <Select
                            label="Motivo"
                            size="sm"
                            selectedKey={form.motivo_tipo}
                            onSelectionChange={(v) => set("motivo_tipo", String(v))}
                            items={[
                                { id: "ERROR_DATOS", label: "Error de Datos" },
                                { id: "CHAT_SIN_RESPUESTA", label: "Chat sin Respuesta" },
                            ]}
                        >
                            {(item) => <Select.Item {...item} />}
                        </Select>
                    </div>
                    <div className="w-56">
                        <Input label="Conversación" size="sm" value={form.conversacion} onChange={(v) => set("conversacion", v)} maxLength={250} />
                    </div>
                    {form.motivo_tipo === "CHAT_SIN_RESPUESTA" && (
                        <div className="w-56">
                            <Input label="Sin Respuesta Desde" type="datetime-local" size="sm" value={form.desde} onChange={(v) => set("desde", v)} />
                        </div>
                    )}
                </>
            )}
            {(alert || type === "RECUPERACION_CLIENTE") && (
                <>
                    <div className="w-36 shrink-0">
                        <Input
                            label={alert ? "DNI (opcional)" : "DNI"}
                            size="sm"
                            value={form.dni}
                            onChange={(v) => set("dni", v.replace(/\D/g, "").slice(0, 8))}
                            maxLength={8}
                            inputMode="numeric"
                            placeholder="8 dígitos"
                        />
                    </div>
                    <Button size="sm" color="secondary" isDisabled={lookupBusy || form.dni.length !== 8} onClick={onLookup}>
                        Operaciones
                    </Button>
                    {alert && (
                        <div className="min-w-64 flex-1">
                            <Select
                                label="Operación (opcional)"
                                placeholder="Seleccionar operación"
                                size="sm"
                                selectedKey={form.operacion_id ? Number(form.operacion_id) : null}
                                onSelectionChange={(v) => onOperationSelect(v == null ? null : Number(v))}
                                items={operations.map((o) => ({
                                    id: o.id,
                                    label: `${o.codigo || o.id} · ${o.cliente} · S/ ${Number(o.monto).toFixed(2)}`,
                                }))}
                            >
                                {(item) => <Select.Item {...item} />}
                            </Select>
                        </div>
                    )}
                    {!alert && operations.length > 0 && (
                        <MarketingRecoveryOperations operations={operations} selected={form.operacion_id} onSelect={onOperationSelect} />
                    )}
                </>
            )}
            <div className="min-w-48 flex-1">
                <Input
                    label="Título"
                    size="sm"
                    value={form.titulo}
                    onChange={(v) => set("titulo", v)}
                    maxLength={250}
                    isRequired
                    isInvalid={attempted && !form.titulo.trim()}
                />
            </div>
            {type === "VIDEO_VIRAL" && (
                <>
                    <div className="w-44">
                        <Select
                            label="Red Social"
                            size="sm"
                            selectedKey={form.red_social}
                            onSelectionChange={(v) => set("red_social", String(v))}
                            items={redesSociales}
                        >
                            {(item) => <Select.Item {...item} />}
                        </Select>
                    </div>
                    <div className="min-w-56 flex-1">
                        <Input label="Publicación" size="sm" value={form.publicacion} onChange={(v) => set("publicacion", v)} placeholder="https://…" />
                    </div>
                    {["vistas", "likes", "comentarios"].map((k) => (
                        <div key={k} className="w-28">
                            <Input
                                label={k === "vistas" ? "Vistas" : k === "likes" ? "Reacciones" : "Comentarios"}
                                size="sm"
                                type="number"
                                value={form[k]}
                                onChange={(v) => set(k, v)}
                            />
                        </div>
                    ))}
                </>
            )}
            <div className="min-w-56 flex-1">
                <CompensacionNoteField label="Descripción" value={form.descripcion} onChange={(v) => set("descripcion", v)} isRequired />
            </div>
            <div className="w-40 shrink-0">
                <CompensacionDatePicker label="Fecha" value={form.fecha} onChange={(v) => set("fecha", v)} />
            </div>
            <div className="ml-auto flex max-w-full flex-wrap justify-end gap-2">
                {!hideDraft && (
                    <Button size="sm" color="secondary" iconLeading={Save01} isDisabled={saving} onClick={() => onSubmit(false)}>
                        Borrador
                    </Button>
                )}
                <Button size="sm" color="primary" iconLeading={Save01} isDisabled={saving} onClick={() => onSubmit(true)}>
                    Guardar
                </Button>
                <Button size="sm" color="secondary" iconLeading={XClose} isDisabled={saving} onClick={onCancel}>
                    Cancelar
                </Button>
            </div>
        </div>
    </CompensacionPanel>
);
