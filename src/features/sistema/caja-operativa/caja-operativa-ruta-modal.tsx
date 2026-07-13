// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { Toggle } from "@/components/base/toggle/toggle";
import { useAuth } from "@/providers/auth-provider";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { cajaOperativaService } from "@/services/caja-operativa.service";
import { Check, Plus, X } from "@untitledui/icons";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";

interface CajaOperativaRutaModalProps {
    isOpen: boolean;
    caja: Record<string, unknown> | null;
    onClose: () => void;
    onSave: () => void;
}

interface RutaRow {
    key: string;
    id?: number;
    ruta: string;
    flag_caja_ingreso_principal: boolean;
    id_estado: number;
}

const rutaItems = [
    "bcp",
    "bbva",
    "scotiabank",
    "banbif",
    "interbank",
    "safetypay",
    "pos",
    "linkpago",
].map((ruta) => ({ id: ruta, label: getRutaLabel(ruta as never) }));

const getActivoId = (estadosList: { id: string | number; label: string }[]) => {
    const activo = estadosList.find((estado) => estado.label.toLowerCase() === "activo");
    return activo ? Number(activo.id) : 1;
};

let rowKeyCounter = 0;

export const CajaOperativaRutaModal = ({ isOpen, caja, onClose, onSave }: CajaOperativaRutaModalProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const { estados } = useSessionCache();
    const [rows, setRows] = useState<RutaRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const estadoItems = useMemo(
        () => (estados || []).map((estado) => ({ id: estado.id as string | number, label: estado.nombre as string })),
        [estados],
    );
    const activoId = useMemo(() => getActivoId(estadoItems), [estadoItems]);

    useEffect(() => {
        if (!isOpen || !caja) {
            setRows([]);
            return;
        }

        let ignore = false;
        setIsLoading(true);

        cajaOperativaService
            .getRutas({
                p_id_empresa: caja.id_empresa,
                p_id_empresa_cuenta_bancaria: caja.id_empresa_cuenta_bancaria,
            })
            .then((result) => {
                if (ignore) return;
                setRows(
                    result.map((row) => ({
                        key: `ruta-${row.id}`,
                        id: row.id as number,
                        ruta: row.ruta as string,
                        flag_caja_ingreso_principal: !!row.flag_caja_ingreso_principal,
                        id_estado: Number(row.id_estado ?? activoId),
                    })),
                );
            })
            .catch((err) => {
                if (!ignore) addToast("error", err instanceof Error ? err.message : "Error al cargar rutas asociadas");
            })
            .finally(() => {
                if (!ignore) setIsLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [activoId, addToast, caja, isOpen]);

    const handleAddRow = () => {
        setRows((prev) => [
            ...prev,
            {
                key: `new-${++rowKeyCounter}`,
                ruta: "",
                flag_caja_ingreso_principal: false,
                id_estado: activoId,
            },
        ]);
    };

    const handleUpdateRow = (key: string, field: keyof RutaRow, value: unknown) => {
        setRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
    };

    const handleSave = async () => {
        if (!caja) return;

        const hasInvalid = rows.some((row) => !row.ruta || !row.id_estado);
        if (hasInvalid) {
            addToast("error", "Complete ruta y estado en todas las filas");
            return;
        }

        const duplicatedRoute = rows.find((row, index) => rows.findIndex((candidate) => candidate.ruta === row.ruta) !== index);
        if (duplicatedRoute) {
            addToast("error", "No repita la misma ruta para esta caja");
            return;
        }

        setIsSaving(true);
        try {
            for (const row of rows) {
                const params: Record<string, unknown> = {
                    p_ruta: row.ruta,
                    p_id_empresa: caja.id_empresa,
                    p_id_empresa_cuenta_bancaria: caja.id_empresa_cuenta_bancaria,
                    p_flag_caja_ingreso_principal: row.flag_caja_ingreso_principal,
                    p_id_estado: row.id_estado,
                    p_id_usuario: businessUser?.id ? Number(businessUser.id) : null,
                };

                if (row.id) {
                    await cajaOperativaService.updateRuta(row.id, params);
                } else {
                    await cajaOperativaService.createRuta(params);
                }
            }

            addToast("success", "Rutas asociadas correctamente");
            onSave();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "Error al guardar rutas asociadas");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && caja && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="relative z-10 flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl bg-primary p-6 shadow-xl"
                    >
                        <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold text-primary">Rutas Asociadas</h2>
                                <p className="mt-1 text-sm text-tertiary">
                                    {String(caja.nombre_empresa ?? "")} - {String(caja.nombre_banco ?? "")}
                                </p>
                            </div>
                            <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            <div className="overflow-x-auto rounded-lg border border-secondary">
                                <table className="w-full text-left text-sm">
                                    <thead className="border-b border-secondary bg-secondary">
                                        <tr>
                                            <th className="px-3 py-3 text-xs font-medium text-tertiary uppercase tracking-wider">
                                                Ruta
                                            </th>
                                            <th className="px-3 py-3 text-xs font-medium text-tertiary uppercase tracking-wider">
                                                Caja de Ingreso Principal
                                            </th>
                                            <th className="px-3 py-3 text-xs font-medium text-tertiary uppercase tracking-wider">
                                                Estado
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-secondary">
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-12 text-center text-sm text-tertiary">
                                                    Cargando...
                                                </td>
                                            </tr>
                                        ) : rows.length === 0 ? (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-12 text-center text-sm text-tertiary">
                                                    No hay rutas asociadas.
                                                </td>
                                            </tr>
                                        ) : (
                                            rows.map((row) => (
                                                <tr key={row.key}>
                                                    <td className="px-3 py-3">
                                                        <Select
                                                            size="sm"
                                                            placeholder="Ruta"
                                                            items={rutaItems}
                                                            selectedKey={row.ruta}
                                                            onSelectionChange={(key) => {
                                                                if (key !== null) handleUpdateRow(row.key, "ruta", String(key));
                                                            }}
                                                        >
                                                            {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
                                                        </Select>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <Toggle
                                                            label={row.flag_caja_ingreso_principal ? "Principal" : "No principal"}
                                                            isSelected={row.flag_caja_ingreso_principal}
                                                            onChange={(value) =>
                                                                handleUpdateRow(row.key, "flag_caja_ingreso_principal", value)
                                                            }
                                                        />
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <Select
                                                            size="sm"
                                                            placeholder="Estado"
                                                            items={estadoItems}
                                                            selectedKey={row.id_estado}
                                                            onSelectionChange={(key) => {
                                                                if (key !== null) handleUpdateRow(row.key, "id_estado", Number(key));
                                                            }}
                                                        >
                                                            {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
                                                        </Select>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-3">
                                <Button size="sm" color="link-color" iconLeading={Plus} onClick={handleAddRow}>
                                    Agregar ruta
                                </Button>
                            </div>
                        </div>

                        <div className="mt-6 flex items-center justify-end gap-3 border-t border-secondary pt-4">
                            <Button size="sm" color="secondary" onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={handleSave}>
                                Guardar
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
