import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "@untitledui/icons";

const HIDDEN_COMPANY_IDS = new Set([10, 14]);
const HIDDEN_COMPANY_NAMES = new Set(["F35", "SAFETYPAY"]);

export interface BancoEmpresaOption {
    id: number;
    nombre: string;
}

export interface EmpresaCuentaOption {
    id: number;
    id_empresa: number;
    empresa_nombre: string;
    id_banco: number;
    banco_nombre: string;
}

interface BancoEmpresaSelectorProps {
    label: string;
    banks: BancoEmpresaOption[];
    accounts: EmpresaCuentaOption[];
    value: string;
    selectedCompanyId: number | null;
    onBankChange: (bankId: string) => void;
    onCompanyChange: (companyId: number | null) => void;
    isRequired?: boolean;
    className?: string;
}

export const BancoEmpresaSelector = ({
    label,
    banks,
    accounts,
    value,
    selectedCompanyId,
    onBankChange,
    onCompanyChange,
    isRequired = false,
    className = "",
}: BancoEmpresaSelectorProps) => {
    const [open, setOpen] = useState(false);
    const [hoveredBankId, setHoveredBankId] = useState<number | null>(null);
    const selectedBank = banks.find((bank) => String(bank.id) === value);
    const companiesByBank = useMemo(() => {
        const grouped = new Map<number, EmpresaCuentaOption[]>();

        accounts.forEach((account) => {
            if (
                HIDDEN_COMPANY_IDS.has(account.id_empresa) ||
                HIDDEN_COMPANY_NAMES.has(account.empresa_nombre.trim().toUpperCase())
            ) {
                return;
            }

            const current = grouped.get(account.id_banco) ?? [];
            if (!current.some((item) => item.id_empresa === account.id_empresa)) current.push(account);
            grouped.set(account.id_banco, current);
        });

        grouped.forEach((items) => items.sort((a, b) => a.empresa_nombre.localeCompare(b.empresa_nombre)));
        return grouped;
    }, [accounts]);

    const handleBankChange = (bank: BancoEmpresaOption) => {
        onBankChange(String(bank.id));
        onCompanyChange(null);
        setOpen(false);
        setHoveredBankId(null);
    };

    const handleCompanyChange = (bank: BancoEmpresaOption, companyId: number) => {
        onBankChange(String(bank.id));
        onCompanyChange(companyId);
        setOpen(false);
        setHoveredBankId(null);
    };

    const selectedCompany = selectedBank
        ? companiesByBank.get(selectedBank.id)?.find((item) => item.id_empresa === selectedCompanyId)
        : null;

    return (
        <div className={`relative flex w-full min-w-0 flex-col gap-1.5 ${className}`}>
            <label className="flex min-h-5 cursor-default items-center text-sm font-medium leading-5 text-secondary">
                {label}{isRequired ? " *" : ""}
            </label>
            <button
                type="button"
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={() => setOpen((current) => !current)}
                onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-secondary bg-primary px-3 text-left text-sm leading-5 text-primary shadow-xs outline-none transition hover:border-brand focus:border-brand focus:ring-2 focus:ring-brand/20"
            >
                <span className="truncate">
                    {selectedBank?.nombre ?? "Seleccionar banco"}
                    {selectedCompany ? ` - ${selectedCompany.empresa_nombre}` : ""}
                </span>
                <ChevronDown className="size-4 shrink-0 text-tertiary" />
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-visible rounded-lg border border-secondary bg-primary p-1 shadow-lg"
                >
                    {banks.map((bank) => {
                        const companies = companiesByBank.get(bank.id) ?? [];

                        return (
                            <div
                                key={bank.id}
                                className="relative"
                                onMouseEnter={() => setHoveredBankId(bank.id)}
                                onFocus={() => setHoveredBankId(bank.id)}
                            >
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => handleBankChange(bank)}
                                    className={`flex h-9 w-full items-center justify-between rounded-md px-3 text-sm focus:outline-none ${
                                        String(bank.id) === value
                                            ? "bg-brand-primary text-primary_on-brand"
                                            : "text-primary hover:bg-brand-secondary hover:text-brand-secondary focus:bg-brand-secondary"
                                    }`}
                                >
                                    <span className="truncate">{bank.nombre}</span>
                                    {companies.length > 0 && (
                                        <ChevronRight
                                            className={`size-4 shrink-0 ${
                                                String(bank.id) === value ? "text-primary_on-brand" : "text-tertiary"
                                            }`}
                                        />
                                    )}
                                </button>

                                {hoveredBankId === bank.id && companies.length > 0 && (
                                    <div className="absolute left-[calc(100%+0.25rem)] top-0 z-50 min-w-56 rounded-lg border border-secondary bg-primary p-1 shadow-lg">
                                        {companies.map((company) => (
                                            <button
                                                key={`${company.id_empresa}-${company.id}`}
                                                type="button"
                                                role="menuitem"
                                                onClick={() => handleCompanyChange(bank, company.id_empresa)}
                                                className="flex min-h-9 w-full items-center rounded-md px-3 text-left text-sm text-primary hover:bg-brand-secondary hover:text-brand-secondary focus:bg-brand-secondary focus:outline-none"
                                            >
                                                <span className="truncate">{company.empresa_nombre}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
