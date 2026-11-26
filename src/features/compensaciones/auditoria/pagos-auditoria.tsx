import { useCallback, useState } from "react";
import { Eye, XCircle } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { EvidenciaDetailModal } from "../evidencias/evidencia-detail-modal";
import { evidenciasService } from "../evidencias/evidencias.service";
import type { EvidenciaEvento } from "../evidencias/evidencias.types";
import { pagosDeteccionTipos } from "../evidencias/pagos-detecciones-form";
import { type PagosDeteccionTipo, pagosDeteccionesService } from "../evidencias/pagos-detecciones.service";
import { IncidenciaDetailModal } from "../incidencias/incidencia-detail-modal";
import type { IncidenciaEvento } from "../incidencias/incidencias.types";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import {
    type AuditoriaFila,
    type AuditoriaRango,
    bonosDelMes,
    filaPenalidad,
    mensajeError,
    penalidadesDelMes,
    unir,
    useActorColaborador,
    useAuditoriaFilas,
} from "./auditoria-datos";
import { AuditoriaForm, type AuditoriaTipo, type AuditoriaValores } from "./auditoria-form";
import { AuditoriaScreen } from "./auditoria-screen";

/** Uniforme, Indisciplina, Descuadre y Cierre Incompleto tienen su propia opción. */
const cargos = ["JEFE_SUPERIOR_PAGOS", "OPERADOR_ALTA_DEMANDA", "ENCARGADO_CARTERA_MEDIA", "ASISTENTE_VIRTUAL_PAGOS"];
export const otrasOpcionesPagos = [
    ...cargos.flatMap((cargo) => ["UNIFORME", "INDISCIPLINA", "DESCUADRE"].map((concepto) => `PAG_${cargo}_${concepto}`)),
    ...["CARTERA", "JEFE", "OPERADOR", "VIRTUAL"].map((grupo) => `PAG_${grupo}_CIERRE_INCOMPLETO`),
];
const tipos: AuditoriaTipo[] = pagosDeteccionTipos.map((item) => ({ ...item, operacion: "opcional" }));

type Origen = { bono: EvidenciaEvento } | { penalidad: IncidenciaEvento };
const cargar = async (rango: AuditoriaRango): Promise<Origen[]> => {
    const catalogo = await evidenciasService.getTypes();
    const ids = catalogo.filter((item) => tipos.some((tipo) => tipo.id === item.codigo)).map((item) => item.id);
    const [bonos, penalidades] = await Promise.all([
        Promise.all(ids.map((typeId) => bonosDelMes(rango, { typeId }))),
        penalidadesDelMes(rango, otrasOpcionesPagos),
    ]);
    return [...bonos.flat().map((bono) => ({ bono })), ...penalidades.map((penalidad) => ({ penalidad }))];
};

/** Pagos: registra Reporte de Abandono y Error en Datos Manuales, y consulta sus penalidades de auditoría. */
export const PagosAuditoria = () => {
    const notify = useAlert();
    const actorId = useActorColaborador();
    const datos = useAuditoriaFilas(useCallback(cargar, []));
    const [bono, setBono] = useState<EvidenciaEvento | null>(null);
    const [penalidad, setPenalidad] = useState<IncidenciaEvento | null>(null);
    const [anular, setAnular] = useState<EvidenciaEvento | null>(null);
    const [motivo, setMotivo] = useState("");
    const [busy, setBusy] = useState(false);
    const [anularError, setAnularError] = useState("");

    const guardar = async (valores: AuditoriaValores, clave: string) => {
        await pagosDeteccionesService.guardar(
            valores.tipo as PagosDeteccionTipo,
            (valores.operaciones[0]?.raw as number | undefined) ?? null,
            { motivo: valores.notas.trim(), dni: valores.dni, fecha: valores.fecha },
            clave,
        );
        return "Reporte registrado. Pendiente de revisión independiente.";
    };
    const cerrarAnular = () => {
        setAnular(null);
        setMotivo("");
        setAnularError("");
    };
    const confirmarAnular = async () => {
        if (!anular || busy) return;
        setBusy(true);
        setAnularError("");
        try {
            await pagosDeteccionesService.anular(anular.id, motivo.trim());
            cerrarAnular();
            datos.recargar();
            notify("success", "Reporte anulado.");
        } catch (cause) {
            setAnularError(mensajeError(cause));
        } finally {
            setBusy(false);
        }
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
        const e = origen.bono;
        const operacion = (e.datos.operacion ?? {}) as Record<string, unknown>;
        return {
            id: `B:${e.id}`,
            tipo: "BONO",
            concepto: e.tipoNombre,
            descripcion: e.descripcion,
            referencia: unir(
                e.datos.cliente_documento ? `Cliente ${String(e.datos.cliente_documento)}` : "",
                operacion.codigo ? `Op. ${String(operacion.codigo)}` : "Sin operación",
            ),
            colaborador: e.beneficiarioNombre ?? e.usuarioRegistraNombre,
            registradoPor: e.usuarioRegistraNombre,
            fecha: e.fechaEvento,
            monto: e.importeAprobado,
            estado: e.estado,
            acciones: (
                <>
                    {accion("Consultar reporte y revisión", Eye, () => setBono(e))}
                    {e.estado === "PENDIENTE" && accion("Anular reporte", XCircle, () => setAnular(e))}
                </>
            ),
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
                <AuditoriaForm
                    tipos={tipos}
                    buscarOperaciones={async (dni, tipo) =>
                        (await pagosDeteccionesService.operaciones(dni, tipo as PagosDeteccionTipo)).map((op) => ({
                            key: String(op.id),
                            codigo: op.codigo || `#${op.id}`,
                            detalle: unir(op.cliente, op.estado),
                            monto: op.monto,
                            raw: op.id,
                        }))
                    }
                    onGuardar={guardar}
                    onGuardado={datos.recargar}
                />
            }
        >
            <EvidenciaDetailModal item={bono} readOnly onClose={() => setBono(null)} onChanged={() => setBono(null)} />
            <IncidenciaDetailModal
                item={penalidad}
                actorCollaboratorId={actorId}
                onClose={() => setPenalidad(null)}
                onChanged={() => {
                    setPenalidad(null);
                    datos.recargar();
                }}
            />
            {anular && (
                <CompensacionSurface title="Anular reporte" busy={busy} onClose={cerrarAnular}>
                    <div className="overflow-hidden rounded-xl border border-secondary bg-primary">
                        <CompensacionDialogHeader title="Anular reporte" busy={busy} onClose={cerrarAnular} />
                        <div className="space-y-4 p-4">
                            <CompensacionNoteField label="Motivo de la anulación" value={motivo} onChange={setMotivo} isDisabled={busy} isRequired />
                            {anularError && <AlertMessage tone="validation">{anularError}</AlertMessage>}
                            <Button size="sm" color="primary-destructive" isDisabled={busy || motivo.trim().length < 10} onClick={confirmarAnular}>
                                Anular reporte
                            </Button>
                        </div>
                    </div>
                </CompensacionSurface>
            )}
        </AuditoriaScreen>
    );
};
