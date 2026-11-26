import { AdminOperacionesPage } from "../evidencias/admin-operaciones-page";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { IncidenciasEquipoPage } from "./incidencias-equipo-page";
import { IncidenciasPage } from "./incidencias-page";

/**
 * Penalidad Escalonada Bonos. Administración registra y resuelve los Errores en Cuadro; los demás solo consultan y presentan descargo.
 * Jefe de Sede ve su sede; Pagos consulta las propias y presenta su descargo.
 */
export const PenalidadEscalonadaBonosPage = () => {
    const { isPagos, isAdministrator } = useCompensacionPerfil();
    if (isAdministrator) return <AdminOperacionesPage grupo="ESCALONADA" />;
    return isPagos ? <IncidenciasPage readOnly fixedList="ESCALONADA" title="Penalidad Escalonada Bonos" /> : <IncidenciasEquipoPage grupo="ESCALONADA" />;
};
