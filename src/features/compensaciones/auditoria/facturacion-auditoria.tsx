import { useCallback, useEffect, useRef, useState } from "react";
import { Edit03, Eye } from "@untitledui/icons";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { AlertMessage } from "@/components/shared/alert-center";
import { errores, tipos as tiposReporte } from "../evidencias/facturacion-auditoria-constantes";
import { FacturacionAuditoriaForm } from "../evidencias/facturacion-auditoria-form";
import { type FacturacionReporte, facturacionEstadoVisible, facturacionAuditoriaService as service } from "../evidencias/facturacion-auditoria.service";
import { useFacturacionAuditoria } from "../evidencias/use-facturacion-auditoria";
import { IncidenciaDetailModal } from "../incidencias/incidencia-detail-modal";
import type { IncidenciaEvento } from "../incidencias/incidencias.types";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import {
    type AuditoriaFila,
    type AuditoriaRango,
    filaPenalidad,
    penalidadesDelMes,
    todasLasPaginas,
    unir,
    useActorColaborador,
    useAuditoriaFilas,
} from "./auditoria-datos";
import { AuditoriaForm, type AuditoriaTipo, type AuditoriaValores } from "./auditoria-form";
import { AuditoriaScreen } from "./auditoria-screen";

/** Uniforme e Indisciplina se consultan en Indisciplina Colaborador, no aquí. */
export const otrasOpcionesFacturacion = ["FAC_UNIFORME", "FAC_INDISCIPLINA"] as const;
const tipos: AuditoriaTipo[] = [
    { id: "DETECCION_ERROR_PAGO", label: "Error de Pago", operacion: "requerida", campos: [{ id: "error", label: "Error detectado", opciones: errores }] },
    { id: "OPERACION_EXTRA", label: "Operación Extra", campos: [{ id: "codigo", label: "Comprobante" }] },
];

type Origen = { bono: FacturacionReporte } | { penalidad: IncidenciaEvento };
const cargar = async (rango: AuditoriaRango): Promise<Origen[]> => {
    const [bonos, penalidades] = await Promise.all([
        todasLasPaginas(async (pagina) => {
            const result = await service.listar({ desde: rango.desde, hasta: rango.hasta, estado: "", dni: "", pagina, tamano: 100 });
            return { items: result.items, totalPages: Math.ceil(result.total / 100) };
        }),
        penalidadesDelMes(rango, otrasOpcionesFacturacion),
    ]);
    return [...bonos.map((bono) => ({ bono })), ...penalidades.map((penalidad) => ({ penalidad }))];
};

/** Facturación: registra Error de Pago u Operación Extra, y consulta sus penalidades de auditoría. */
export const FacturacionAuditoria = () => {
    const actorId = useActorColaborador();
    const datos = useAuditoriaFilas(useCallback(cargar, []));
    // Permisos, detalle, edición y anulación de un reporte propio.
    const c = useFacturacionAuditoria();
    const [penalidad, setPenalidad] = useState<IncidenciaEvento | null>(null);
    const editaba = useRef(false);
    const { recargar } = datos;
    useEffect(() => {
        if (editaba.current && !c.editing) recargar();
        editaba.current = !!c.editing;
    }, [c.editing, recargar]);

    const guardar = async (valores: AuditoriaValores, clave: string) => {
        const extra = valores.tipo === "OPERACION_EXTRA";
        await service.guardar({
            tipo: extra ? "OPERACION_EXTRA" : "DETECCION_ERROR_PAGO",
            dni: valores.dni,
            codigo: extra ? valores.campos.codigo : "",
            evidencia: "",
            descripcion: valores.notas.trim(),
            error: extra ? null : (valores.campos.error as "MONTO" | "CUENTA"),
            operacion: extra ? null : ((valores.operaciones[0]?.raw as number | undefined) ?? null),
            clave,
        });
        return "Reporte enviado a Gerencia.";
    };

    const accion = (label: string, icon: typeof Eye, onClick: () => void) => (
        <ButtonUtility size="xs" color="tertiary" icon={icon} tooltip={label} aria-label={label} className={compensationTableActionClass} onClick={onClick} />
    );
    const filas: AuditoriaFila[] = datos.items.map((origen) => {
        if ("penalidad" in origen)
            return filaPenalidad(
                origen.penalidad,
                accion("Ver detalle y descargo", Eye, () => setPenalidad(origen.penalidad)),
            );
        const r = origen.bono;
        const op = "operacion_actual" in r ? r.operacion_actual : r.datos.operacion;
        return {
            id: `B:${r.id}`,
            tipo: "BONO",
            concepto: tiposReporte.find((t) => t.id === r.tipo)?.label ?? r.tipo,
            descripcion: r.descripcion,
            referencia: unir(r.datos.cliente_documento && `Cliente ${r.datos.cliente_documento}`, r.cliente, op?.codigo && `Op. ${op.codigo}`),
            colaborador: r.beneficiario,
            registradoPor: r.beneficiario,
            fecha: r.fecha_evento,
            monto: r.requiere_revision || r.importe_aprobado == null ? null : Number(r.importe_aprobado),
            estado: facturacionEstadoVisible(r),
            acciones: accion("Ver o Editar Reporte", Edit03, () => c.open(r)),
        };
    });

    return (
        <AuditoriaScreen
            filas={filas}
            cargando={datos.cargando}
            error={datos.error}
            mes={datos.mes}
            onMes={datos.setMes}
            formulario={
                c.contextError ? (
                    <AlertMessage tone="error">{c.contextError}</AlertMessage>
                ) : c.context?.puede_registrar ? (
                    <AuditoriaForm
                        tipos={tipos}
                        buscarOperaciones={async (dni) =>
                            (await service.operaciones(dni)).map((op) => ({
                                key: String(op.id),
                                codigo: op.codigo || "Sin código",
                                detalle: unir(op.servicio, op.estado),
                                monto: op.monto,
                                fecha: op.fecha_registro,
                                raw: op.id,
                            }))
                        }
                        onGuardar={guardar}
                        onGuardado={recargar}
                    />
                ) : undefined
            }
        >
            <IncidenciaDetailModal
                item={penalidad}
                actorCollaboratorId={actorId}
                onClose={() => setPenalidad(null)}
                onChanged={() => {
                    setPenalidad(null);
                    recargar();
                }}
            />
            {c.editing && (
                <CompensacionSurface title="Reporte de Facturación" busy={c.busy} onClose={c.clear}>
                    <div className="overflow-hidden rounded-xl border border-secondary bg-primary">
                        <CompensacionDialogHeader title="Reporte de Facturación" busy={c.busy} onClose={c.clear} />
                        <div className="space-y-4 p-4">
                            <FacturacionAuditoriaForm c={c} />
                        </div>
                    </div>
                </CompensacionSurface>
            )}
        </AuditoriaScreen>
    );
};
