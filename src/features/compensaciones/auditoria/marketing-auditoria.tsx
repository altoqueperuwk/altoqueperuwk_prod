import { useCallback, useState } from "react";
import { Edit03, LinkExternal01, Trash01 } from "@untitledui/icons";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { useAlert } from "@/components/shared/alert-center";
import { alertaContrapartida } from "../marketing/alerta-temprana-contrapartida";
import { motivoAlerta } from "../marketing/alerta-validacion-dialog";
import { MarketingDeleteDialog } from "../marketing/marketing-delete-dialog";
import { emptyCapture, limaInput } from "../marketing/marketing-form-state";
import { type MarketingCaso, type MarketingPanel, marketingService } from "../marketing/marketing.service";
import { formatoMonto } from "../shared/compensacion-formato";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { type AuditoriaFila, type AuditoriaRango, mensajeError, todasLasPaginas, unir, useAuditoriaFilas } from "./auditoria-datos";
import { AuditoriaForm, type AuditoriaTipo, type AuditoriaValores } from "./auditoria-form";
import { AuditoriaScreen } from "./auditoria-screen";

const TIPO = "ALERTA_TEMPRANA" as const;
const conversacion = { id: "conversacion", label: "Conversación" };
const comun = { colaborador: true, dniOpcional: true, operacion: "opcional" as const };
const tipos: AuditoriaTipo[] = [
    { id: "ERROR_DATOS", label: "Error de Datos", ...comun, campos: [conversacion] },
    {
        id: "CHAT_SIN_RESPUESTA",
        label: "Chat sin Respuesta",
        ...comun,
        campos: [conversacion, { id: "desde", label: "Sin respuesta desde", type: "datetime-local" }],
    },
];

const nota = (row: MarketingCaso) => {
    const link = alertaContrapartida(row);
    return unir(
        row.validacion === "APROBADO"
            ? "Validado por el Jefe"
            : row.validacion === "RECHAZADO"
              ? "No conforme"
              : row.estado === "PENDIENTE"
                ? "Por validar"
                : "",
        link?.penalidadCodigo && `Penalidad del asesor${link.penalidadMonto != null ? ` ${formatoMonto(link.penalidadMonto)}` : `: ${link.penalidadNombre}`}`,
        row.resultado,
    );
};

/** Marketing: registra alertas tempranas; valida el Jefe de Tienda y aprueba el Administrador. */
export const MarketingAuditoria = () => {
    const notify = useAlert();
    const [panel, setPanel] = useState<MarketingPanel | null>(null);
    const cargar = useCallback(
        (rango: AuditoriaRango) =>
            todasLasPaginas(async (page) => {
                const result = await marketingService.list(TIPO, rango.mes, "", "", page, 100);
                setPanel(result);
                return { items: result.items, totalPages: result.total_paginas };
            }),
        [],
    );
    const datos = useAuditoriaFilas(cargar);
    const [editando, setEditando] = useState<MarketingCaso | null>(null);
    const [eliminar, setEliminar] = useState<MarketingCaso | null>(null);
    const [eliminando, setEliminando] = useState(false);
    const puedeRegistrar = Boolean(panel && (panel.puede_registrar ?? !panel.es_admin));

    const guardar = async (valores: AuditoriaValores, clave: string) => {
        if (valores.dni && !valores.operaciones.length) throw new Error("Adjunta la operación del DNI o deja el DNI vacío.");
        const desde = valores.tipo === "CHAT_SIN_RESPUESTA" ? new Date(`${valores.campos.desde}-05:00`) : null;
        if (desde && Number.isNaN(desde.getTime())) throw new Error("Indica una fecha y hora válidas.");
        await marketingService.save(
            TIPO,
            {
                ...emptyCapture(),
                ...(editando?.captura ?? {}),
                titulo: editando?.titulo || motivoAlerta(valores.tipo),
                descripcion: valores.notas.trim(),
                fecha: valores.fecha,
                dni: valores.dni,
                operacion_id: String(valores.operaciones[0]?.raw ?? ""),
                responsable_id: String(valores.colaborador ?? ""),
                motivo_tipo: valores.tipo,
                conversacion: valores.campos.conversacion.trim(),
                desde: desde?.toISOString() ?? "",
            },
            clave,
            true,
            editando?.id ?? null,
        );
        return "Registro enviado a revisión";
    };
    const confirmarEliminar = async () => {
        if (!eliminar || eliminando) return;
        setEliminando(true);
        try {
            await marketingService.remove(eliminar.id);
            if (editando?.id === eliminar.id) setEditando(null);
            setEliminar(null);
            notify("success", "Registro eliminado");
            datos.recargar();
        } catch (cause) {
            notify("error", mensajeError(cause));
        } finally {
            setEliminando(false);
        }
    };

    const accion = (label: string, icon: typeof Edit03, onClick: () => void) => (
        <ButtonUtility size="xs" color="tertiary" icon={icon} tooltip={label} aria-label={label} className={compensationTableActionClass} onClick={onClick} />
    );
    const filas: AuditoriaFila[] = datos.items.map((row) => ({
        id: `B:${row.id}`,
        tipo: "BONO",
        concepto: `Alerta Temprana · ${motivoAlerta(row.captura?.motivo_tipo ?? "")}`,
        descripcion: row.descripcion,
        referencia: unir(
            row.captura?.conversacion && `Conversación ${row.captura.conversacion}`,
            row.captura?.dni && `Cliente ${row.captura.dni}`,
            row.operacion && `Op. ${row.operacion}`,
        ),
        colaborador: row.responsable,
        registradoPor: row.usuario,
        fecha: row.fecha,
        monto: row.estado === "APROBADO" || row.estado === "LIQUIDADO" ? row.importe : null,
        estado: row.estado,
        nota: nota(row),
        acciones: (
            <>
                {puedeRegistrar && row.puede_editar && (
                    <>
                        {accion("Editar registro", Edit03, () => setEditando(row))}
                        {accion("Eliminar registro", Trash01, () => setEliminar(row))}
                    </>
                )}
                {row.evidencia && accion("Abrir evidencia", LinkExternal01, () => window.open(String(row.evidencia), "_blank", "noopener,noreferrer"))}
            </>
        ),
    }));

    const captura = editando?.captura;
    return (
        <AuditoriaScreen
            filas={filas}
            cargando={datos.cargando}
            error={datos.error}
            mes={datos.mes}
            onMes={datos.setMes}
            tituloFormulario={editando ? "Editar Auditoria" : undefined}
            formulario={
                puedeRegistrar ? (
                    <AuditoriaForm
                        key={editando?.id ?? "nuevo"}
                        tipos={tipos}
                        colaboradores={panel?.responsables.map((c) => ({ id: c.id, label: `${c.nombre} · ${c.sede}` }))}
                        inicial={
                            editando && captura
                                ? {
                                      tipo: captura.motivo_tipo,
                                      colaborador: Number(captura.responsable_id) || null,
                                      dni: captura.dni ?? "",
                                      campos: { conversacion: captura.conversacion ?? "", desde: limaInput(captura.desde ?? "") },
                                      operaciones: captura.operacion_id
                                          ? [
                                                {
                                                    key: captura.operacion_id,
                                                    codigo: editando.operacion ?? captura.operacion_id,
                                                    raw: Number(captura.operacion_id),
                                                },
                                            ]
                                          : [],
                                      notas: editando.descripcion,
                                      fecha: captura.fecha || editando.fecha.slice(0, 10),
                                  }
                                : undefined
                        }
                        buscarOperaciones={async (dni) =>
                            (await marketingService.operations(dni)).items.map((op) => ({
                                key: String(op.id),
                                codigo: op.codigo || String(op.id),
                                detalle: unir(op.cliente, op.estado),
                                monto: Number(op.monto),
                                fecha: op.fecha_pago,
                                raw: op.id,
                            }))
                        }
                        onGuardar={guardar}
                        onGuardado={() => {
                            setEditando(null);
                            datos.recargar();
                        }}
                        onCancelar={() => setEditando(null)}
                    />
                ) : undefined
            }
        >
            {eliminar && (
                <MarketingDeleteDialog record={eliminar} saving={eliminando} onClose={() => setEliminar(null)} onConfirm={() => void confirmarEliminar()} />
            )}
        </AuditoriaScreen>
    );
};
