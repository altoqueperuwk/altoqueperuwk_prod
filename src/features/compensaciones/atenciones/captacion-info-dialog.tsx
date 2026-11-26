import { CompensacionInfoDialog } from "../shared/compensacion-info-dialog";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";

/** Fuentes: contexto-actual/01-reglas-y-flujos.md, Captación y comisiones;
 * estándar-ui/00-contexto-maestro.md, piloto aprobado. No fija la tarifa del servidor. */
export const CaptacionInfoDialog = ({ tiktok, onClose }: { tiktok: boolean; onClose: () => void }) => {
    const { isStoreManager, isAdvisor, isAdministrator } = useCompensacionPerfil();
    // Fuentes: contexto-actual/01 y plan-trabajo/01-jefe-de-tienda-y-atc,
    // TikTok sin cuota adicional: Jefe S/0.30 por cliente propio; ATC S/0.70.
    const monto = tiktok ? (isStoreManager ? "S/ 0.30" : isAdvisor ? "S/ 0.70" : "Según configuración vigente del beneficiario") : "S/ 0.70";
    return (
        <CompensacionInfoDialog
            title={tiktok ? "Información de TikTok Live" : "Información de Registro Nuevo"}
            resumen={[
                {
                    concepto: tiktok ? "TIKTOK LIVE" : "Registro Nuevo y Efectivización",
                    tipo: { label: tiktok ? "Bono LIVE (+)" : "Bono (+)", tone: "success" },
                    monto,
                    observacion: tiktok
                        ? "El cliente se registra y opera dentro de los primeros 7 días. Adjuntas la captura del live."
                        : "El cliente es nuevo y opera dentro de los primeros 7 días.",
                },
            ]}
            pasos={[
                tiktok
                    ? "Registras al cliente y adjuntas su captura de TikTok Live."
                    : "Registras al cliente nuevo. Las altas de ATC en Clientes o Pago Deuda aparecen aquí solas.",
                "El cliente opera y paga dentro de sus primeros 7 días.",
                "Administración revisa y aprueba la comisión.",
            ]}
            nota={
                tiktok && isStoreManager
                    ? "La comisión corresponde solo a los clientes que tú registras. Administración decide su aprobación."
                    : tiktok && isAdministrator
                      ? "La tarifa corresponde al perfil del beneficiario. Cada concepto conserva su propia aprobación."
                      : "Cada opción conserva su propia comisión y aprobación."
            }
            onClose={onClose}
        />
    );
};
