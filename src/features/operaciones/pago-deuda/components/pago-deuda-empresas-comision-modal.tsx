import { useEffect, useMemo, useState } from "react";
import { Save01 } from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { NativeSelect } from "@/components/base/select/select-native";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { pagoDeudaService } from "@/features/operaciones/pago-deuda/services/pago-deuda.service";
import { cx } from "@/utils/cx";

interface PagoDeudaEmpresasComisionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
}

interface EmpresaComisionRow {
    key: string;
    id: number | null;
    idEmpresa: number;
    empresaNombre: string;
    idEmpresaCuentaBancaria: number;
    bancoNombre: string;
    billeteraDigital: string;
    flagDepositoComision: boolean;
}

const billeteraOptions = [
    { label: "Seleccionar", value: "" },
    { label: "Yape", value: "Yape" },
    { label: "Plin", value: "Plin" },
    { label: "QR", value: "QR" },
    { label: "Transferencia", value: "Transferencia" },
];

const mapRow = (row: Record<string, unknown>): EmpresaComisionRow => ({
    key: `${row.id_empresa_cuenta_bancaria}`,
    id: row.id == null ? null : Number(row.id),
    idEmpresa: Number(row.id_empresa),
    empresaNombre: String(row.empresa_nombre ?? ""),
    idEmpresaCuentaBancaria: Number(row.id_empresa_cuenta_bancaria),
    bancoNombre: String(row.banco_nombre ?? ""),
    billeteraDigital: String(row.billetera_digital ?? ""),
    flagDepositoComision: Boolean(row.flag_deposito_comision),
});

export const PagoDeudaEmpresasComisionModal = ({
    isOpen,
    onClose,
    onSaved,
}: PagoDeudaEmpresasComisionModalProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [rows, setRows] = useState<EmpresaComisionRow[]>([]);
    const [snapshots, setSnapshots] = useState<Record<string, EmpresaComisionRow>>({});
    const [savingKeys, setSavingKeys] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const userId = businessUser?.id ? Number(businessUser.id) : null;

    const hasChanges = useMemo(
        () =>
            rows.some((row) => {
                const snapshot = snapshots[row.key];
                if (!snapshot) return true;
                return (
                    row.billeteraDigital !== snapshot.billeteraDigital ||
                    row.flagDepositoComision !== snapshot.flagDepositoComision
                );
            }),
        [rows, snapshots],
    );

    const loadRows = async () => {
        setIsLoading(true);
        try {
            const result = await pagoDeudaService.getEmpresasComision({ p_id_estado: 1 });
            const mapped = (result ?? []).map(mapRow);
            setRows(mapped);
            setSnapshots(Object.fromEntries(mapped.map((row) => [row.key, { ...row }])));
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo cargar Empresas Comision.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        void loadRows();
    }, [isOpen]);

    const updateRow = (key: string, patch: Partial<EmpresaComisionRow>) => {
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    };

    const isChanged = (row: EmpresaComisionRow) => {
        const snapshot = snapshots[row.key];
        if (!snapshot) return true;
        return row.billeteraDigital !== snapshot.billeteraDigital || row.flagDepositoComision !== snapshot.flagDepositoComision;
    };

    const handleSave = async (row: EmpresaComisionRow) => {
        if (row.flagDepositoComision && !row.billeteraDigital) {
            addToast("error", "Selecciona una billetera digital.");
            return;
        }

        setSavingKeys((current) => [...current, row.key]);
        try {
            const saved = await pagoDeudaService.patchEmpresaComision({
                p_id_empresa: row.idEmpresa,
                p_id_empresa_cuenta_bancaria: row.idEmpresaCuentaBancaria,
                p_billetera_digital: row.billeteraDigital || null,
                p_flag_deposito_comision: row.flagDepositoComision,
                p_id_estado: 1,
                p_id_usuario: userId,
            });
            const mapped = mapRow(saved);
            setRows((current) => current.map((item) => (item.key === row.key ? mapped : item)));
            setSnapshots((current) => ({ ...current, [mapped.key]: { ...mapped } }));
            onSaved();
            addToast("success", "Empresa de comision actualizada.");
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo guardar la configuracion.");
        } finally {
            setSavingKeys((current) => current.filter((key) => key !== row.key));
        }
    };

    const handleClose = () => {
        if (hasChanges) {
            setRows(Object.values(snapshots));
        }
        onClose();
    };

    return (
        <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <Modal className="max-w-5xl">
                <Dialog>
                    <div className="w-full rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold text-primary">Empresas Comision</h2>
                                <p className="mt-1 text-sm text-tertiary">
                                    Define que cuentas pueden recibir el deposito de comision de Pago Deuda.
                                </p>
                            </div>
                            <Button size="sm" color="tertiary" onClick={handleClose}>
                                Cerrar
                            </Button>
                        </div>

                        <div className="mt-5 overflow-hidden rounded-lg border border-secondary">
                            <div className="max-h-[28rem] overflow-auto">
                                <table className="w-full min-w-[760px] divide-y divide-secondary">
                                    <thead className="bg-secondary">
                                        <tr>
                                            <th className="px-3 py-3 text-left text-xs font-semibold text-tertiary">Empresa</th>
                                            <th className="px-3 py-3 text-left text-xs font-semibold text-tertiary">Cuenta</th>
                                            <th className="px-3 py-3 text-left text-xs font-semibold text-tertiary">Billetera Digital</th>
                                            <th className="px-3 py-3 text-left text-xs font-semibold text-tertiary">Deposito Comision</th>
                                            <th className="w-20 px-3 py-3 text-center text-xs font-semibold text-tertiary">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-secondary bg-primary">
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan={5} className="px-4 py-10 text-center text-sm text-tertiary">
                                                    Cargando configuracion...
                                                </td>
                                            </tr>
                                        ) : rows.length ? (
                                            rows.map((row) => {
                                                const changed = isChanged(row);
                                                const isSaving = savingKeys.includes(row.key);

                                                return (
                                                    <tr key={row.key}>
                                                        <td className="px-3 py-2 text-sm font-medium text-primary">{row.empresaNombre}</td>
                                                        <td className="px-3 py-2 text-sm text-secondary">{row.bancoNombre}</td>
                                                        <td className="px-3 py-2">
                                                            <NativeSelect
                                                                aria-label="Billetera digital"
                                                                size="sm"
                                                                value={row.billeteraDigital}
                                                                onChange={(event) => updateRow(row.key, { billeteraDigital: event.currentTarget.value })}
                                                                options={billeteraOptions}
                                                                className="w-40"
                                                                selectClassName="h-8 py-1.5 pl-2 pr-7 text-xs"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <Checkbox
                                                                isSelected={row.flagDepositoComision}
                                                                onChange={(value) => updateRow(row.key, { flagDepositoComision: value })}
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2 text-center">
                                                            <Button
                                                                size="xs"
                                                                color={changed ? "primary" : "secondary"}
                                                                iconLeading={Save01}
                                                                isDisabled={!changed || isSaving}
                                                                isLoading={isSaving}
                                                                onClick={() => void handleSave(row)}
                                                                aria-label="Guardar empresa comision"
                                                                className={cx(!changed && "opacity-50")}
                                                            />
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={5} className="px-4 py-10 text-center text-sm text-tertiary">
                                                    Sin cuentas empresariales activas.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
};
