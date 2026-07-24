import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Tabs } from "@/components/application/tabs/tabs";
import type { RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

interface EmpresaTabsProps {
    companies: RutaOperacionCaja[];
    activeCompanyId: number | null;
    badges?: Record<number, number>;
    rightContent?: ReactNode;
    onChange: (id: number) => void;
}

export const EmpresaTabs = ({ companies, activeCompanyId, badges = {}, rightContent, onChange }: EmpresaTabsProps) => {
    if (!companies.length) {
        return (
            <div className="rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-tertiary">
                Sin empresas configuradas para esta ruta
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <Tabs selectedKey={String(activeCompanyId ?? companies[0].id_empresa)} onSelectionChange={(key) => onChange(Number(key))}>
                    <Tabs.List type="button-border" size="sm" aria-label="Empresas de ruta">
                        {companies.map((company) => (
                            <Tabs.Item
                                id={String(company.id_empresa)}
                                key={company.id_empresa}
                                badge={badges[company.id_empresa] || undefined}
                                className={({ isSelected }) =>
                                    isSelected
                                        ? "bg-brand-solid text-primary_on-brand shadow-xs-skeuomorphic ring-1 ring-transparent ring-inset hover:bg-brand-solid_hover hover:text-primary_on-brand"
                                        : ""
                                }
                            >
                                {company.nombre_empresa}
                            </Tabs.Item>
                        ))}
                    </Tabs.List>
                </Tabs>
                {rightContent ? <div className="shrink-0 lg:ml-auto">{rightContent}</div> : null}
            </div>
        </motion.div>
    );
};
