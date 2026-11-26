import { AdminOperacionesPage } from "../evidencias/admin-operaciones-page";
import { IncidenciasEquipoPage } from "../incidencias/incidencias-equipo-page";
import { IncidenciasPage } from "../incidencias/incidencias-page";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";

/**
 * Indisciplina Colaborador: una sola opción y ruta; el filtro de concepto vive en la tabla.
 * Administrador: las faltas de todas las sedes, con su resolución, y el registro para cualquier colaborador.
 * ATC: consulta propia con descargo. Jefe de Sede: registra Uniforme e Indisciplina de su equipo y ve las faltas de su sede.
 */
export const IndisciplinaColaboradorPage = () => {
    const { isStoreManager, isAdministrator } = useCompensacionPerfil();
    if (isAdministrator) return <AdminOperacionesPage grupo="INDISCIPLINA" />;
    return isStoreManager ? <IncidenciasEquipoPage grupo="PERSONAL" /> : <IncidenciasPage readOnly conceptFilter title="Indisciplina Colaborador" />;
};
