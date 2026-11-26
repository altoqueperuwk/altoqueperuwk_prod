import { Navigate } from "react-router";

/** Compatibilidad con accesos guardados; el panel vive en Atención Calificada. */
export const MiEnlaceQrPage = () => <Navigate to="/compensaciones/calificaciones" replace />;
