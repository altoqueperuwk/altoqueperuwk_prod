import { CompensacionPanel } from "../shared/compensacion-panel";
import type { PenalidadTipo, PlanVersion, Regla } from "./configuracion.types";

interface Props {
    version: PlanVersion | null;
    rules: Regla[];
    penalties: PenalidadTipo[];
}

const numero = (value: unknown) => Number(value).toLocaleString("es-PE");
const importes = (values: number[]) => [...new Set(values)].map((value) => `S/ ${value.toFixed(2)}`).join(" o ");

/**
 * Condiciones que el servidor aplica al calcular. Solo lectura: las «fijas» están escritas en las funciones de la base,
 * así que cambiarlas requiere cambiar primero ese cálculo.
 */
export const ConfiguracionCondiciones = ({ version, rules, penalties }: Props) => {
    const vigente = (item: Regla | PenalidadTipo) => item.idPlanVersion === version?.id && item.estado.toUpperCase() === "ACTIVO";
    const video = rules.find((item) => vigente(item) && item.configuracion.vistas_minimas != null)?.configuracion;
    const minimos = penalties.filter((item) => vigente(item) && item.codigo.endsWith("ERROR_PAGO_CRITICO")).map((item) => item.montoReferencia);
    const reportante = penalties.filter(vigente).flatMap((item) => (item.montoBono ? [item.montoBono] : []));
    const filas = [
        { opcion: "Registro Nuevo", condicion: "Plazo para efectivizar", valor: "7 días" },
        { opcion: "Referidos", condicion: "Operación que paga", valor: "Efectivización al 1 %" },
        {
            opcion: "Video Viral",
            condicion: "Mínimos",
            valor: video
                ? `${numero(video.vistas_minimas)} vistas, ${numero(video.reacciones_minimas)} reacciones y ${numero(video.comentarios_minimos)} comentarios`
                : "Sin configurar",
        },
        { opcion: "Recuperación", condicion: "Inactividad", valor: "Más de 60 días" },
        { opcion: "Alerta Temprana", condicion: "Chat sin respuesta", valor: "Más de 20 minutos" },
        { opcion: "Error en cuadro", condicion: "Sobre comisiones del mes", valor: "30 %, 60 % y 90 %" },
        { opcion: "Error de pago crítico", condicion: "Monto perdido completo", valor: minimos.length ? `Mínimo ${importes(minimos)}` : "Sin configurar" },
        { opcion: "Reportes de penalidad (ATC)", condicion: "Bono a quien reporta", valor: reportante.length ? importes(reportante) : "Sin configurar" },
    ];
    return (
        <CompensacionPanel title="Condiciones de cálculo">
            <div className="-m-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Condiciones: tabla desplazable">
                <table className="w-full min-w-[600px] border-collapse text-left">
                    <thead className="bg-secondary">
                        <tr>
                            {["Opción", "Condición", "Valor"].map((title) => (
                                <th key={title} className="px-4 py-2 text-xs font-medium text-secondary">
                                    {title}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map((fila) => (
                            <tr key={fila.opcion} className="border-t border-secondary">
                                <td className="px-4 py-2 text-xs font-semibold text-primary">{fila.opcion}</td>
                                <td className="px-4 py-2 text-xs text-secondary">{fila.condicion}</td>
                                <td className="px-4 py-2 text-xs text-primary">{fila.valor}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </CompensacionPanel>
    );
};
