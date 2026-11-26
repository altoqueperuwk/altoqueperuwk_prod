import { useEffect, useState } from "react";
import { AlertMessage, withAlertProvider } from "@/components/shared/alert-center";
import { useAtkBrand } from "@/hooks/use-atk-brand";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { ClientesNuevosPage } from "./clientes-nuevos-page";
import { pagosRegistroNuevoService } from "./pagos-registro-nuevo.service";
import { PagosRegistroValidacionPage } from "./pagos-registro-validacion-page";

/** El Jefe Superior de Pagos valida; el resto de Pagos conserva su Registro Nuevo. */
const PagosRegistroNuevo = () => {
    const [validador, setValidador] = useState<boolean | null>(null);
    useEffect(() => {
        let active = true;
        pagosRegistroNuevoService
            .esValidador()
            .then((value) => active && setValidador(value))
            .catch(() => active && setValidador(false));
        return () => {
            active = false;
        };
    }, []);
    if (validador === null) return null;
    return validador ? <PagosRegistroValidacionPage /> : <ClientesNuevosPage />;
};

/**
 * Registro Nuevo es la pantalla vigente para los perfiles autorizados.
 * La pantalla de atenciones legacy fue retirada: las rutas autorizadas usan
 * ClientesNuevosPage y los perfiles sin permiso quedan bloqueados por el guard.
 */
export const AtencionesPage = withAlertProvider(() => {
    useAtkBrand();
    const { isAdvisor, isStoreManager, isPagos, isAdministrator, isResolving } = useCompensacionPerfil();
    if (isResolving) return null;
    if (isPagos) return <PagosRegistroNuevo />;
    if (isAdvisor || isStoreManager || isAdministrator) return <ClientesNuevosPage readOnly={isAdministrator} />;
    return <AlertMessage tone="notice">Registro Nuevo no está habilitado para este perfil.</AlertMessage>;
});
