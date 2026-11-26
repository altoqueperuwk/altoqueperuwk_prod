import { useCallback, useEffect, useRef, useState } from "react";
import { Eye } from "@untitledui/icons";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { EvidenciaDetailModal } from "../evidencias/evidencia-detail-modal";
import { evidenciasService } from "../evidencias/evidencias.service";
import type { EvidenciaEvento, LlamadaContexto } from "../evidencias/evidencias.types";
import { LlamadaActions } from "../evidencias/llamada-actions";
import { tarjetaOperacionesService } from "../evidencias/tarjeta-operaciones.service";
import { tarjetasEvidenceService } from "../evidencias/tarjetas-evidence.service";
import { IncidenciaDetailModal } from "../incidencias/incidencia-detail-modal";
import type { IncidenciaEvento } from "../incidencias/incidencias.types";
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

/** Uniforme e Indisciplina se consultan en Indisciplina Colaborador, no aquí. */
export const otrasOpcionesAtc = ["ATC_UNIFORME", "ATC_INDISCIPLINA"] as const;
const tipos: AuditoriaTipo[] = [
    {
        id: "SEGURIDAD_TARJETA",
        label: "Seguridad Tarjeta",
        nombreCliente: true,
        operacion: "opcional",
        imagen: true,
        notasOpcionales: true,
        campos: [{ id: "tarjeta", label: "Tarjeta (4 últimos)", digitos: 4 }],
    },
];

type Origen = { bono: EvidenciaEvento } | { penalidad: IncidenciaEvento };
const cargar = async (rango: AuditoriaRango): Promise<Origen[]> => {
    const [bonos, penalidades] = await Promise.all([bonosDelMes(rango, { category: "TARJETA_TERCERO" }), penalidadesDelMes(rango, otrasOpcionesAtc)]);
    return [...bonos.map((bono) => ({ bono })), ...penalidades.map((penalidad) => ({ penalidad }))];
};

/** ATC: registra Seguridad Tarjeta y consulta sus penalidades de auditoría. */
export const AtcAuditoria = () => {
    const actorId = useActorColaborador();
    const datos = useAuditoriaFilas(useCallback(cargar, []));
    const [contexto, setContexto] = useState<LlamadaContexto | null>(null);
    const [contextoError, setContextoError] = useState("");
    const [bono, setBono] = useState<EvidenciaEvento | null>(null);
    const [penalidad, setPenalidad] = useState<IncidenciaEvento | null>(null);
    // La imagen se sube antes de registrar: se conserva para reintentar y se quita al cancelar.
    const subida = useRef<Awaited<ReturnType<typeof tarjetasEvidenceService.uploadCardEvidence>> | null>(null);
    const [imagenSubida, setImagenSubida] = useState(false);

    useEffect(() => {
        let active = true;
        evidenciasService
            .getCardContext()
            .then((result) => {
                if (active) setContexto(result);
            })
            .catch((cause) => {
                if (active) setContextoError(mensajeError(cause, "No se pudieron verificar los permisos."));
            });
        return () => {
            active = false;
        };
    }, []);

    const bloqueado =
        contextoError ||
        (contexto && !contexto.puedeRegistrar ? "No tienes permiso para registrar tarjetas." : "") ||
        (contexto && !contexto.idColaborador ? "Tu usuario no tiene un colaborador activo asociado." : "");

    const guardar = async (valores: AuditoriaValores, clave: string) => {
        const base = [
            valores.dni,
            valores.cliente?.nombre ?? valores.nombre.trim(),
            valores.fecha,
            valores.notas.trim(),
            valores.campos.tarjeta,
            clave,
        ] as const;
        const codigo = (valores.operaciones[0]?.raw as string | undefined) || null;
        if (valores.archivo) {
            if (!subida.current) {
                subida.current = await tarjetasEvidenceService.uploadCardEvidence(valores.archivo);
                setImagenSubida(true);
            }
            await evidenciasService.registerCardFile(...base, subida.current, codigo);
        } else {
            await evidenciasService.registerCard(...base, "", codigo);
        }
        subida.current = null;
        setImagenSubida(false);
        return "Tarjeta guardada. Pendiente de aprobación.";
    };
    const cancelar = async () => {
        if (subida.current) await tarjetasEvidenceService.removeCardEvidence(subida.current.path);
        subida.current = null;
        setImagenSubida(false);
    };

    const filas: AuditoriaFila[] = datos.items.map((origen) => {
        if ("penalidad" in origen)
            return filaPenalidad(
                origen.penalidad,
                <ButtonUtility
                    size="xs"
                    color="tertiary"
                    icon={Eye}
                    tooltip="Ver detalle de incidencia"
                    className={compensationTableActionClass}
                    onClick={() => setPenalidad(origen.penalidad)}
                />,
            );
        const e = origen.bono;
        return {
            id: `B:${e.id}`,
            tipo: "BONO",
            concepto: e.tipoNombre ?? "Seguridad Tarjeta",
            descripcion: e.descripcion,
            referencia: unir(
                e.datos.cliente_documento ? `Cliente ${String(e.datos.cliente_documento)}` : "",
                String(e.datos.cliente_nombre ?? ""),
                e.datos.tarjeta_ultimos4 ? `•••• ${String(e.datos.tarjeta_ultimos4)}` : "",
            ),
            colaborador: e.beneficiarioNombre ?? e.usuarioRegistraNombre,
            registradoPor: e.usuarioRegistraNombre,
            fecha: e.fechaEvento,
            monto: e.importeAprobado,
            estado: e.estado,
            acciones: <LlamadaActions compact iconOnly item={e} contexto={contexto} onChanged={datos.recargar} onDetail={() => setBono(e)} />,
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
                    bloqueado={bloqueado}
                    archivoBloqueado={imagenSubida}
                    buscarOperaciones={async (dni) =>
                        (await tarjetaOperacionesService.deCliente(dni)).map((op) => ({
                            key: `${op.flujo}:${op.id}`,
                            codigo: op.codigo ?? (op.flujo === "PAGO_DEUDA" ? "Pago de deuda" : "Efectivización"),
                            detalle: `${op.flujo === "PAGO_DEUDA" ? "Pago de deuda" : "Efectivización"} · ${op.estado}`,
                            monto: op.monto,
                            fecha: op.fecha,
                            raw: op.referencia,
                        }))
                    }
                    onGuardar={guardar}
                    onGuardado={datos.recargar}
                    onCancelar={cancelar}
                />
            }
        >
            <EvidenciaDetailModal
                item={bono}
                readOnly
                llamadaContexto={contexto}
                onClose={() => setBono(null)}
                onChanged={() => {
                    setBono(null);
                    datos.recargar();
                }}
            />
            <IncidenciaDetailModal
                item={penalidad}
                actorCollaboratorId={actorId}
                onClose={() => setPenalidad(null)}
                onChanged={() => {
                    setPenalidad(null);
                    datos.recargar();
                }}
            />
        </AuditoriaScreen>
    );
};
