import { useEffect, useMemo, useState } from "react";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { OperacionCargaExcelRollback } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

interface BancariaExcelRollbackModalProps {
    activeAccountId: number | null;
    activeCompanyId: number | null;
    isOpen: boolean;
    isProcessing: boolean;
    ruta: string;
    onClose: () => void;
    onProcess: (idCargaExcel: number) => Promise<void>;
}

const formatDateTime = (value: string | null | undefined) => {
    if (!value) return "-";

    return new Date(value).toLocaleString("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

export const BancariaExcelRollbackModal = ({
    activeAccountId,
    activeCompanyId,
    isOpen,
    isProcessing,
    ruta,
    onClose,
    onProcess,
}: BancariaExcelRollbackModalProps) => {
    const [rows, setRows] = useState<OperacionCargaExcelRollback[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const selectedRow = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId]);

    useEffect(() => {
        if (!isOpen) {
            setRows([]);
            setSelectedId(null);
            return;
        }

        let ignore = false;
        setIsLoading(true);
        setError(null);

        operacionesRpcService
            .getOperacionCargaExcelRollback({
                p_ruta: ruta,
                p_id_empresa: activeCompanyId,
                p_id_empresa_cuenta_bancaria: activeAccountId,
            })
            .then((data) => {
                if (ignore) return;
                setRows(data);
                setSelectedId(null);
            })
            .catch((err) => {
                if (ignore) return;
                setRows([]);
                setError(err instanceof Error ? err.message : "No se pudieron cargar las cargas Excel.");
            })
            .finally(() => {
                if (!ignore) setIsLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [activeAccountId, activeCompanyId, isOpen, ruta]);

    const handleProcess = async () => {
        if (!selectedRow || !selectedRow.disponible) return;
        await onProcess(selectedRow.id);
    };

    return (
        <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Modal className="max-w-5xl">
                <Dialog>
                    <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                        <div className="atk-modal-head">
                            <h2 className="text-lg font-semibold text-primary">Eliminar carga Excel</h2>
                            <p className="mt-1 text-sm text-tertiary">
                                Selecciona una carga para revertirla completamente. Solo se puede eliminar si todo sigue Pendiente.
                            </p>
                        </div>

                        <div className="mt-5 overflow-hidden rounded-lg border border-secondary">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[880px] divide-y divide-secondary">
                                    <thead className="bg-secondary">
                                        <tr>
                                            <th className="w-10 px-3 py-2 text-left text-xs font-semibold text-tertiary"> </th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-tertiary">Nombre Excel</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-tertiary">Fecha Carga</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-tertiary">Empresa</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-tertiary">Total Operaciones</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-tertiary">Disponible</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-tertiary">Detalle</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-secondary bg-primary">
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-10 text-center text-sm text-tertiary">
                                                    Cargando cargas Excel...
                                                </td>
                                            </tr>
                                        ) : error ? (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-10 text-center text-sm text-error-primary">
                                                    {error}
                                                </td>
                                            </tr>
                                        ) : rows.length ? (
                                            rows.map((row) => (
                                                <tr key={row.id} className={selectedId === row.id ? "bg-secondary" : undefined}>
                                                    <td className="px-3 py-3 align-middle">
                                                        <Checkbox
                                                            aria-label={`Seleccionar carga ${row.nombre_excel}`}
                                                            isDisabled={!row.disponible || isProcessing}
                                                            isSelected={selectedId === row.id}
                                                            onChange={() => setSelectedId((current) => (current === row.id ? null : row.id))}
                                                        />
                                                    </td>
                                                    <td className="max-w-64 truncate px-3 py-3 text-sm font-medium text-primary">{row.nombre_excel}</td>
                                                    <td className="px-3 py-3 text-sm text-secondary">{formatDateTime(row.fecha_carga)}</td>
                                                    <td className="px-3 py-3 text-sm text-secondary">{row.empresa || "-"}</td>
                                                    <td className="px-3 py-3 text-sm tabular-nums text-secondary">{row.total_operaciones}</td>
                                                    <td className="px-3 py-3 text-sm">
                                                        <span className={row.disponible ? "text-success-primary" : "text-error-primary"}>
                                                            {row.disponible ? "Si" : "No"}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 text-sm text-tertiary">{row.detalle}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-10 text-center text-sm text-tertiary">
                                                    No hay cargas Excel para eliminar en esta cuenta.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <Button color="secondary" isDisabled={isProcessing} onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button isDisabled={!selectedRow?.disponible || isLoading} isLoading={isProcessing} onClick={() => void handleProcess()}>
                                Procesar
                            </Button>
                        </div>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
};
