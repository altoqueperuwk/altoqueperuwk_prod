import { useEffect, useState } from "react";
import { SlideoutMenu } from "@/components/application/slideout-menus/slideout-menu";
import { Button } from "@/components/base/buttons/button";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type {
    CajaOperativaCierre,
    RutaOperacionCaja,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";

interface BancariaHistoryDrawerProps {
    activeCompany: RutaOperacionCaja | null;
    activeCajaIds?: number[];
    isOpen: boolean;
    onClose: () => void;
}

export const BancariaHistoryDrawer = ({ activeCajaIds = [], activeCompany, isOpen, onClose }: BancariaHistoryDrawerProps) => {
    const [items, setItems] = useState<CajaOperativaCierre[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !activeCompany) return;

        let ignore = false;
        setIsLoading(true);
        setError(null);

        const uniqueCajaIds = Array.from(new Set(activeCajaIds.filter(Boolean)));
        const requests = uniqueCajaIds.length
            ? uniqueCajaIds.map((idCaja) => operacionesRpcService.getCajaCierres({ p_id_caja: idCaja }))
            : [operacionesRpcService.getCajaCierres({ p_id_empresa: activeCompany.id_empresa })];

        Promise.all(requests)
            .then((results) => {
                const merged = results
                    .flat()
                    .sort((a, b) => new Date(b.fecha_cierre).getTime() - new Date(a.fecha_cierre).getTime());

                if (!ignore) setItems(merged);
            })
            .catch((err) => {
                if (!ignore) setError(err instanceof Error ? err.message : "Error al cargar historial.");
            })
            .finally(() => {
                if (!ignore) setIsLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [activeCajaIds, activeCompany, isOpen]);

    return (
        <SlideoutMenu isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
            {({ close }) => (
                <>
                    <SlideoutMenu.Header onClose={close}>
                        <div className="pr-8">
                            <h2 className="text-lg font-semibold text-primary">Historial</h2>
                            <p className="mt-1 text-sm text-tertiary">
                                {activeCompany?.nombre_empresa ?? "Empresa"}
                            </p>
                        </div>
                    </SlideoutMenu.Header>

                    <SlideoutMenu.Content>
                        {isLoading && <p className="text-sm text-tertiary">Cargando cierres...</p>}
                        {error && <p className="text-sm text-error-primary">{error}</p>}

                        {!isLoading && !items.length && (
                            <div className="rounded-lg border border-secondary bg-primary p-4 text-sm text-tertiary">
                                Sin cierres registrados para esta empresa.
                            </div>
                        )}

                        <div className="flex flex-col gap-3">
                            {items.map((item) => (
                                <article key={item.id} className="rounded-lg border border-secondary bg-primary p-4 shadow-xs">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-primary">{item.nombre_banco}</p>
                                            <p className="text-xs text-tertiary">
                                                {new Date(item.fecha_cierre).toLocaleString("es-PE")}
                                            </p>
                                        </div>
                                        <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-tertiary">
                                            {item.nombre_estado}
                                        </span>
                                    </div>
                                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <dt className="text-xs text-tertiary">Saldo cierre</dt>
                                            <dd className="font-semibold text-primary">{formatMoney(item.saldo_actual)}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs text-tertiary">Recaudado</dt>
                                            <dd className="font-semibold text-primary">{formatMoney(item.total_recaudado)}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs text-tertiary">Ganancia</dt>
                                            <dd className="font-semibold text-primary">{formatMoney(item.ganancia)}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs text-tertiary">Operaciones</dt>
                                            <dd className="font-semibold text-primary">{item.operaciones}</dd>
                                        </div>
                                    </dl>
                                </article>
                            ))}
                        </div>
                    </SlideoutMenu.Content>

                    <SlideoutMenu.Footer>
                        <Button color="secondary" className="w-full" onClick={close}>
                            Cerrar
                        </Button>
                    </SlideoutMenu.Footer>
                </>
            )}
        </SlideoutMenu>
    );
};
