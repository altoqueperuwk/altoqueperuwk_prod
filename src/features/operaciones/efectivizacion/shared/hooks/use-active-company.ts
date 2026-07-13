import { useEffect, useMemo, useState } from "react";
import type { RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

export const useActiveCompany = (cajas: RutaOperacionCaja[]) => {
    const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);

    const companies = useMemo(() => {
        const map = new Map<number, RutaOperacionCaja>();
        cajas.forEach((caja) => {
            if (!map.has(caja.id_empresa)) map.set(caja.id_empresa, caja);
        });
        return Array.from(map.values());
    }, [cajas]);

    useEffect(() => {
        if (!companies.length) {
            setActiveCompanyId(null);
            return;
        }

        if (!activeCompanyId || !companies.some((company) => company.id_empresa === activeCompanyId)) {
            setActiveCompanyId(companies[0].id_empresa);
        }
    }, [activeCompanyId, companies]);

    const activeCompany = companies.find((company) => company.id_empresa === activeCompanyId) ?? null;
    const activeCompanyCajas = activeCompanyId
        ? cajas.filter((caja) => caja.id_empresa === activeCompanyId)
        : [];

    return {
        activeCompany,
        activeCompanyCajas,
        activeCompanyId,
        companies,
        setActiveCompanyId,
    };
};
