import { motion } from "motion/react";
import { Tabs } from "@/components/application/tabs/tabs";
import type { RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

interface EmpresaTabsProps {
    companies: RutaOperacionCaja[];
    activeCompanyId: number | null;
    onChange: (id: number) => void;
}

export const EmpresaTabs = ({ companies, activeCompanyId, onChange }: EmpresaTabsProps) => {
    if (!companies.length) {
        return (
            <div className="rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-tertiary">
                Sin empresas configuradas para esta ruta
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Tabs selectedKey={String(activeCompanyId ?? companies[0].id_empresa)} onSelectionChange={(key) => onChange(Number(key))}>
                <Tabs.List type="button-border" size="sm" aria-label="Empresas de ruta">
                    {companies.map((company) => (
                        <Tabs.Item id={String(company.id_empresa)} key={company.id_empresa}>
                            {company.nombre_empresa}
                        </Tabs.Item>
                    ))}
                </Tabs.List>
            </Tabs>
        </motion.div>
    );
};
