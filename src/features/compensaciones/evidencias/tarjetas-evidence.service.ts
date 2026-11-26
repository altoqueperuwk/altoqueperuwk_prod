import { supabase } from "@/lib/supabase";

export interface CardEvidenceAttachment {
    tipo: "IMAGEN_TARJETA";
    bucket: "compensaciones-tarjetas-erroneas";
    path: string;
    nombre: string;
    mime_type: string;
    size: number;
}
const bucket = "compensaciones-tarjetas-erroneas";
export const tarjetasEvidenceService = {
    async uploadCardEvidence(file: File): Promise<CardEvidenceAttachment> {
        const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
        const extension = extensions[file.type];
        if (!extension) throw new Error("La evidencia debe ser una imagen JPG, PNG o WEBP");
        if (file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error("La imagen debe pesar hasta 5 MB");
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("Inicia sesión nuevamente para adjuntar la evidencia");
        const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        return { tipo: "IMAGEN_TARJETA", bucket, path, nombre: file.name, mime_type: file.type, size: file.size };
    },
    async removeCardEvidence(path: string) {
        const { error } = await supabase.storage.from(bucket).remove([path]);
        if (error) throw error;
    },
    async getCardEvidenceUrl(path: string) {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 15 * 60);
        if (error) throw error;
        return data.signedUrl;
    },
};
