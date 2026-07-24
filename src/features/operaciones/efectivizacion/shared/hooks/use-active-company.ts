import { useEffect, useMemo, useState } from "react";
import type { RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

export const useActiveCompany = (cajas: RutaOperacionCaja[], resetKey?: string | number) => {
    const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);
    const [activeAccountId, setActiveAccountId] = useState<number | null>(null);

    useEffect(() => {
        setActiveCompanyId(null);
        setActiveAccountId(null);
    }, [resetKey]);

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

    const activeCompany = useMemo(
        () => companies.find((company) => company.id_empresa === activeCompanyId) ?? null,
        [activeCompanyId, companies],
    );
    const activeCompanyCajas = useMemo(
        () => activeCompanyId ? cajas.filter((caja) => caja.id_empresa === activeCompanyId) : [],
        [activeCompanyId, cajas],
    );
    const activeCompanyCaja = useMemo(
        () => activeCompanyCajas.find((caja) => caja.id_empresa_cuenta_bancaria === activeAccountId) ?? activeCompanyCajas[0] ?? null,
        [activeAccountId, activeCompanyCajas],
    );
    const activeCajaId = activeCompanyCaja?.id_caja ?? null;

    useEffect(() => {
        if (!activeCompanyCajas.length) {
            setActiveAccountId(null);
            return;
        }

        if (!activeAccountId || !activeCompanyCajas.some((caja) => caja.id_empresa_cuenta_bancaria === activeAccountId)) {
            setActiveAccountId(activeCompanyCajas[0].id_empresa_cuenta_bancaria);
        }
    }, [activeAccountId, activeCompanyCajas]);

    return {
        activeAccountId,
        activeCajaId,
        activeCompany,
        activeCompanyCaja,
        activeCompanyCajas,
        activeCompanyId,
        companies,
        setActiveAccountId,
        setActiveCompanyId,
    };
};
