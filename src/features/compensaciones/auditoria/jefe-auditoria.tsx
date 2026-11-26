import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, Eye } from "@untitledui/icons";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { AlertMessage } from "@/components/shared/alert-center";
import { PagosValidacionDialog, estadoValidacion } from "../evidencias/pagos-validacion-dialog";
import { type PagosValidacionItem, pagosValidacionService } from "../evidencias/pagos-validacion.service";
import { cazaErroresLabel } from "../incidencias/caza-errores-policy";
import { IncidenciaEquipoDetail } from "../incidencias/incidencia-equipo-detail";
import { teamIncidenceTypes } from "../incidencias/incidencia-equipo-form";
import { incidenciasService } from "../incidencias/incidencias.service";
import type { IncidenciaCatalogo, IncidenciaCreateValues, IncidenciaEvento, OperacionCliente } from "../incidencias/incidencias.types";
import { AlertaValidacionDialog, motivoAlerta } from "../marketing/alerta-validacion-dialog";
import { type MarketingAlertaPorValidar, marketingService } from "../marketing/marketing.service";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { type AuditoriaFila, type AuditoriaRango, filaPenalidad, mensajeError, todasLasPaginas, unir, useAuditoriaFilas } from "./auditoria-datos";
import { AuditoriaForm, type AuditoriaTipo, type AuditoriaValores } from "./auditoria-form";
import { AuditoriaScreen } from "./auditoria-screen";

const hallazgos = teamIncidenceTypes.flatMap((item) => (item.flow === "CAZA" ? [item] : []));
const tipos: AuditoriaTipo[] = hallazgos.map((item) => ({
    id: item.id,
    label: item.label,
    colaborador: true,
    clienteRegistrado: true,
    operacion: "opcional",
}));
const horaLima = () => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());

const cargar = (rango: AuditoriaRango) =>
    todasLasPaginas((page) =>
        incidenciasService.getTeamList({
            direction: "",
            status: "",
            search: "",
            from: rango.desde,
            to: rango.hasta,
            page,
            pageSize: 100,
            grupo: "AUDITORIA",
        }),
    );

type Respuesta = { postura?: string };
const nota = (item: IncidenciaEvento) => {
    const postura = (item.datos?.respuesta_jefe_sede as Respuesta | undefined)?.postura;
    return unir(item.direccion === "RECIBIDAS" ? "Recibida" : "Enviada", postura === "CONFORME" ? "Conforme" : postura === "DESCARGO" ? "Con descargo" : "");
};

/** Jefe de Sede: registra hallazgos, ve las auditorías de su sede y valida en la misma tabla lo de Pagos y Marketing. */
export const JefeAuditoria = () => {
    const datos = useAuditoriaFilas(useCallback(cargar, []));
    const [catalogo, setCatalogo] = useState<IncidenciaCatalogo | null>(null);
    const [catalogoError, setCatalogoError] = useState("");
    const [pagos, setPagos] = useState<PagosValidacionItem[]>([]);
    const [alertas, setAlertas] = useState<MarketingAlertaPorValidar[]>([]);
    const [detalle, setDetalle] = useState<IncidenciaEvento | null>(null);
    const [pago, setPago] = useState<PagosValidacionItem | null>(null);
    const [alerta, setAlerta] = useState<MarketingAlertaPorValidar | null>(null);
    const creado = useRef<{ clave: string; id: number } | null>(null);

    useEffect(() => {
        incidenciasService
            .getCatalog()
            .then(setCatalogo)
            .catch((cause) => setCatalogoError(mensajeError(cause, "No fue posible cargar el catálogo de incidencias")));
    }, []);
    // Sin jefatura vigente o sin registros por validar, la tabla es la de siempre.
    const cargarValidaciones = useCallback(() => {
        pagosValidacionService
            .listar()
            .then(setPagos)
            .catch(() => setPagos([]));
        marketingService
            .alertsToValidate()
            .then((result) => setAlertas(result.items))
            .catch(() => setAlertas([]));
    }, []);
    useEffect(cargarValidaciones, [cargarValidaciones]);

    const guardar = async (valores: AuditoriaValores, clave: string) => {
        const hallazgo = hallazgos.find((item) => item.id === valores.tipo);
        const evento = catalogo?.tipos.find((item) => item.codigo === "AUDITORIA_ACTIVA");
        if (!hallazgo || !valores.colaborador || !valores.cliente) throw new Error("Completa los datos del hallazgo");
        if (!evento) throw new Error("No está habilitado el tipo de evento de Auditoría Activa");
        const concepto = (await incidenciasService.getCatalog(valores.colaborador, valores.fecha)).penalidades.find((item) => item.codigo === hallazgo.code);
        if (!concepto) throw new Error("El concepto no está habilitado para esta fecha y colaborador");
        const values: IncidenciaCreateValues = {
            idTipoEvento: evento.id,
            idPenalidadTipo: concepto.id,
            idReportante: null,
            idResponsable: valores.colaborador,
            fechaEvento: `${valores.fecha}T${horaLima()}`,
            titulo: cazaErroresLabel[hallazgo.code],
            motivo: `Hallazgo: ${hallazgo.label}\nNotas: ${valores.notas.trim()}`,
            evidenciaUrl: "",
            clienteId: valores.cliente.id,
            clienteDocumento: valores.dni,
            clienteNombre: valores.cliente.nombre,
            operacionId: null,
            operaciones: valores.operaciones.map((op) => op.raw as OperacionCliente),
        };
        // Si falló el envío, el reintento no vuelve a crear el borrador.
        const id = creado.current?.clave === clave ? creado.current.id : await incidenciasService.createCazaErrores(values, hallazgo.option, clave);
        creado.current = { clave, id };
        await incidenciasService.sendCazaErrores(id, hallazgo.option);
        creado.current = null;
        return "Incidencia enviada a Administración.";
    };

    const revisar = (label: string, onClick: () => void, icon = CheckCircle) => (
        <ButtonUtility size="xs" color="tertiary" icon={icon} tooltip={label} aria-label={label} className={compensationTableActionClass} onClick={onClick} />
    );
    // Lo que espera validación se ve siempre; lo ya validado, solo en su mes.
    const visible = (fecha: string, decision: string | null) => !decision || fecha.startsWith(datos.mes);
    const filas: AuditoriaFila[] = [
        ...datos.items.map((item) => ({
            ...filaPenalidad(
                item,
                revisar("Ver detalle de incidencia", () => setDetalle(item), Eye),
            ),
            nota: nota(item),
        })),
        ...pagos
            .filter((item) => visible(item.fecha, item.decision))
            .map((item): AuditoriaFila => ({
                id: `V:${item.id}`,
                tipo: "BONO",
                concepto: item.tipoNombre,
                descripcion: item.descripcion,
                referencia: item.operacion ? `Op. ${item.operacion}` : "",
                colaborador: item.beneficiario,
                registradoPor: item.beneficiario,
                fecha: item.fecha,
                monto: null,
                estado: item.estado || "PENDIENTE",
                nota: estadoValidacion(item.decision),
                acciones: revisar(item.decision ? "Ver reporte de Pagos" : "Validar reporte de Pagos", () => setPago(item), item.decision ? Eye : CheckCircle),
            })),
        ...alertas
            .filter((item) => visible(item.fecha, item.decision))
            .map((item): AuditoriaFila => ({
                id: `A:${item.id}`,
                tipo: "BONO",
                concepto: `Alerta Temprana · ${motivoAlerta(item.motivo)}`,
                descripcion: item.descripcion,
                referencia: unir(`Conversación ${item.conversacion}`, item.operacion && `Op. ${item.operacion}`),
                colaborador: item.responsable,
                registradoPor: item.beneficiario,
                fecha: item.fecha,
                monto: null,
                estado: item.estado || "PENDIENTE",
                nota: estadoValidacion(item.decision),
                acciones: revisar(item.decision ? "Ver alerta" : "Validar alerta", () => setAlerta(item), item.decision ? Eye : CheckCircle),
            })),
    ];

    return (
        <AuditoriaScreen
            filas={filas}
            cargando={datos.cargando}
            error={datos.error}
            mes={datos.mes}
            onMes={datos.setMes}
            formulario={
                catalogoError ? (
                    <AlertMessage tone="error">{catalogoError}</AlertMessage>
                ) : (
                    <AuditoriaForm
                        tipos={tipos}
                        colaboradores={catalogo?.responsables.map((person) => ({ id: person.id, label: person.nombre }))}
                        multiple
                        buscarOperaciones={async (dni) =>
                            (await incidenciasService.getClientOperations(dni)).items.map((op) => ({
                                key: `${op.tipo}:${op.id}`,
                                codigo: op.codigo || `#${op.id}`,
                                detalle: unir(op.tipo, op.estado),
                                monto: op.monto,
                                fecha: op.fecha,
                                raw: op,
                            }))
                        }
                        onGuardar={guardar}
                        onGuardado={datos.recargar}
                    />
                )
            }
        >
            {detalle && (
                <IncidenciaEquipoDetail
                    item={detalle}
                    onClose={() => setDetalle(null)}
                    onChanged={() => {
                        setDetalle(null);
                        datos.recargar();
                    }}
                />
            )}
            {pago && <PagosValidacionDialog item={pago} onClose={() => setPago(null)} onDone={cargarValidaciones} />}
            {alerta && <AlertaValidacionDialog item={alerta} onClose={() => setAlerta(null)} onDone={cargarValidaciones} />}
        </AuditoriaScreen>
    );
};
