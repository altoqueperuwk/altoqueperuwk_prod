import { type BusinessUser, isAdministrator, useOptionalAuth } from "@/providers/auth-provider";

export { advisorRoutes, advisorRouteAllowed } from "./atc-route-policy";

export const isCompensacionAdvisor = (user: BusinessUser | null | undefined) => Number(user?.id_rol) === 4 && user?.flag_super_admin !== true;
export const isCompensacionStoreManager = (user: BusinessUser | null | undefined) => Number(user?.id_rol) === 3 && user?.flag_super_admin !== true;
export const isCompensacionFacturacion = (user: BusinessUser | null | undefined) => Number(user?.id_rol) === 5 && user?.flag_super_admin !== true;
export const isCompensacionPagos = (user: BusinessUser | null | undefined) => Number(user?.id_rol) === 2 && user?.flag_super_admin !== true;
export const isCompensacionMarketing = (user: BusinessUser | null | undefined) => Number(user?.id_rol) === 6 && user?.flag_super_admin !== true;
export const advisorCanRegisterBonus = (code?: string) => ["PROPUESTA_INNOVACION", "TIKTOK_LIVE"].includes(code?.toUpperCase() ?? "");

export const useCompensacionPerfil = () => {
    const auth = useOptionalAuth();
    return {
        isAdvisor: isCompensacionAdvisor(auth?.businessUser),
        isStoreManager: isCompensacionStoreManager(auth?.businessUser),
        isFacturacion: isCompensacionFacturacion(auth?.businessUser),
        isPagos: isCompensacionPagos(auth?.businessUser),
        isMarketing: isCompensacionMarketing(auth?.businessUser),
        isAdministrator: isAdministrator(auth?.businessUser),
        isResolving: Boolean(auth && (auth.isBusinessUserLoading ?? !auth.businessUser)),
        userId: Number(auth?.businessUser?.id ?? 0),
    };
};
