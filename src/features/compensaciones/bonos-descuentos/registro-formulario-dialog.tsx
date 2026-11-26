import { useEffect, useState } from "react";
import { Badge } from "@/components/base/badges/badges";
import { CompensacionEstado } from "../shared/compensacion-estado";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionFormularioLectura, type FormularioSeccion } from "../shared/compensacion-formulario-lectura";
import { compensacionTipo } from "../shared/compensacion-tipo";
import { type Expediente, expedienteIdFromKey, seguimientoJefaturaService } from "../shared/seguimiento-jefatura.service";

const money = (value: unknown) =>
    value == null ? "Por confirmar" : new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Math.abs(Number(value)));

/**
 * Formulario de solo lectura de un bono o una penalidad de "Mis Bonos y Penalidades".
 * Es el mismo para todos: cambia la etiqueta, el signo del monto y el texto de "Qué pasa ahora".
 * Si el servidor tiene el expediente, suma el motivo completo y quién reportó.
 */
export const RegistroFormularioDialog = ({
    row,
    destino,
    onClose,
}: {
    row: Record<string, unknown>;
    destino?: { modulo: string; href?: string } | null;
    onClose: () => void;
}) => {
    const id = expedienteIdFromKey(row.id_origen ?? row.id);
    const [expediente, setExpediente] = useState<Expediente | null>(null);
    const [loading, setLoading] = useState(Boolean(id));
    useEffect(() => {
        if (!id) return;
        let active = true;
        setLoading(true);
        seguimientoJefaturaService
            .expediente(id)
            .then((value) => active && setExpediente(value))
            .catch(() => active && setExpediente(null))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [id]);

    const penalidad = compensacionTipo(row.tipo) === "PENALIDAD";
    const concepto = String(row.concepto_nombre ?? row.descripcion ?? (penalidad ? "Penalidad" : "Bono"));
    const motivo = expediente?.motivo?.trim() || String(row.descripcion ?? "").trim();
    const sinDescuento = penalidad && Number(row.importe) === 0 && /_(UNIFORME|INDISCIPLINA)$/.test(String(row.concepto_codigo ?? ""));
    const monto = sinDescuento
        ? "Sin descuento: pierde el bono de Puntualidad"
        : row.importe == null
          ? "Por confirmar"
          : `${penalidad ? "−" : "+"}${money(row.importe)}`;
    const queSigue = sinDescuento
        ? "Es la primera falta del mes: no se descuenta, pero se pierde el bono de Puntualidad."
        : row.estado_grupo === "RECHAZADO"
          ? "Este registro no se aplica: no suma ni descuenta."
          : row.estado_grupo === "APROBADO"
            ? penalidad
                ? "Este descuento se aplica en tu periodo."
                : "Este bono se suma a tu periodo."
            : "Está pendiente de revisión; el monto se confirma al aprobarse.";

    const secciones: FormularioSeccion[] = [
        {
            titulo: "Lo que se registró",
            campos: [
                { label: "Concepto", value: concepto },
                { label: "Fecha", value: row.fecha ? <CompensacionFechaCell value={String(row.fecha)} /> : "—" },
                { label: "Registrado en", value: destino?.modulo ?? "—" },
                ...(expediente?.reportante ? [{ label: "Reportado por", value: expediente.reportante }] : []),
                {
                    label: "Qué ocurrió",
                    completo: true,
                    value: loading ? <span role="status">Consultando el reporte…</span> : motivo || "Sin detalle registrado.",
                },
            ],
        },
        {
            titulo: "Resultado",
            campos: [
                {
                    label: "Estado",
                    value: row.estado_grupo ? (
                        <CompensacionEstado dominio="dashboard" valor={row.estado_grupo} />
                    ) : (
                        <CompensacionEstado dominio="seguimiento" valor={row.estado} />
                    ),
                },
                { label: penalidad ? "Descuento" : "Bono", value: monto },
                { label: "Qué pasa ahora", completo: true, value: queSigue },
            ],
        },
    ];

    return (
        <CompensacionFormularioLectura
            titulo={penalidad ? "Detalle de la penalidad" : "Detalle del bono"}
            etiqueta={
                <Badge color={penalidad ? "error" : "success"} size="sm">
                    {penalidad ? "Penalidad" : "Bono"}
                </Badge>
            }
            secciones={secciones}
            accion={destino?.href ? { label: `Ir a ${destino.modulo}`, href: destino.href } : null}
            onClose={onClose}
        />
    );
};
