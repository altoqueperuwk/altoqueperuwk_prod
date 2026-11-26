import { fechaLima } from "../evidencias/tarjeta-tercero-form";

export const emptyCapture = (): Record<string, string> => ({
    titulo: "",
    descripcion: "",
    fecha: fechaLima(),
    red_social: "TIKTOK",
    publicacion: "",
    vistas: "0",
    likes: "0",
    comentarios: "0",
    evidencia: "",
    dni: "",
    operacion_id: "",
    responsable_id: "",
    motivo_tipo: "ERROR_DATOS",
    conversacion: "",
    desde: "",
});
export const marketingMessage = (e: unknown) => (e && typeof e === "object" && "message" in e ? String(e.message) : "No se pudo completar la solicitud");
export const limaInput = (value: string) => {
    const instant = new Date(value);
    return Number.isNaN(instant.getTime()) ? "" : new Date(instant.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 16);
};
