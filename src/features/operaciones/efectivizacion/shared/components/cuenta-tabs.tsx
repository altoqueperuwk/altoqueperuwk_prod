import { motion } from "motion/react";
import { Tabs } from "@/components/application/tabs/tabs";
import type { RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

interface CuentaTabsProps {
    accounts: RutaOperacionCaja[];
    activeAccountId: number | null;
    onChange: (id: number) => void;
}

export const CuentaTabs = ({ accounts, activeAccountId, onChange }: CuentaTabsProps) => {
    if (accounts.length <= 1) return null;

    return (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Tabs
                selectedKey={String(activeAccountId ?? accounts[0].id_empresa_cuenta_bancaria)}
                onSelectionChange={(key) => onChange(Number(key))}
            >
                <Tabs.List type="button-border" size="sm" aria-label="Cuentas de empresa">
                    {accounts.map((account) => (
                        <Tabs.Item
                            id={String(account.id_empresa_cuenta_bancaria)}
                            key={account.id_empresa_cuenta_bancaria}
                            className={({ isSelected }) =>
                                isSelected
                                    ? "bg-brand-solid text-primary_on-brand shadow-xs-skeuomorphic ring-1 ring-transparent ring-inset hover:bg-brand-solid_hover hover:text-primary_on-brand"
                                    : ""
                            }
                        >
                            {account.nombre_banco}
                        </Tabs.Item>
                    ))}
                </Tabs.List>
            </Tabs>
        </motion.div>
    );
};
