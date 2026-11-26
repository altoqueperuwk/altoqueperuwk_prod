import { AlertaTempranaPage } from "./alerta-temprana-page";
import { MarketingCapturaPanel } from "./marketing-captura-panel";
import { RecuperacionPage } from "./recuperacion-page";
import { VideoViralPage } from "./video-viral-page";

/** Punto de entrada que usa otros-bonos-page: elige la pantalla por ruta; Video Viral y Recuperación ya no comparten pantalla. */
export const MarketingCapturasPage = ({ alert = false, initialRecovery = false }: { alert?: boolean; initialRecovery?: boolean }) =>
    alert ? <AlertaTempranaPage /> : initialRecovery ? <RecuperacionPage /> : <VideoViralPage />;
