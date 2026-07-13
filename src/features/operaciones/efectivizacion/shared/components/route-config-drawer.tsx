import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, CheckCircle, Settings01 } from "@untitledui/icons";
import { SlideoutMenu } from "@/components/application/slideout-menus/slideout-menu";
import { Button } from "@/components/base/buttons/button";
import type {
    CajaOperativa,
    OperacionRuta,
    RutaOperacionCaja,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";

interface RouteConfigDrawerProps {
    activeCompany: RutaOperacionCaja | null;
    cajas: RutaOperacionCaja[];
    isOpen: boolean;
    onClose: () => void;
    ruta: OperacionRuta;
}

export const RouteConfigDrawer = ({ activeCompany, cajas, isOpen, onClose, ruta }: RouteConfigDrawerProps) => {
    const [cajaDetails, setCajaDetails] = useState<CajaOperativa[]>([]);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const cajasActivas = activeCompany ? cajas.filter((caja) => caja.id_empresa === activeCompany.id_empresa) : [];
    const cajaPrincipal = cajas.find((caja) => caja.flag_caja_ingreso_principal);
    const sinCajaOperativa = cajasActivas.filter((caja) => !caja.id_caja);
    const cajaDetailsByCuenta = useMemo(
        () => new Map(cajaDetails.map((caja) => [caja.id_empresa_cuenta_bancaria, caja])),
        [cajaDetails],
    );

    useEffect(() => {
        if (!isOpen || !activeCompany) {
            setCajaDetails([]);
            setDetailError(null);
            return;
        }

        let ignore = false;
        setIsLoadingDetails(true);
        setDetailError(null);

        operacionesRpcService
            .getCajaOperativa({
                p_id_empresa: activeCompany.id_empresa,
                p_id_estado: 1,
            })
            .then((rows) => {
                if (!ignore) setCajaDetails(rows ?? []);
            })
            .catch((err) => {
                if (!ignore) setDetailError(err instanceof Error ? err.message : "No se pudo cargar el detalle de caja.");
            })
            .finally(() => {
                if (!ignore) setIsLoadingDetails(false);
            });

        return () => {
            ignore = true;
        };
    }, [activeCompany, isOpen]);

    return (
        <SlideoutMenu isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
            {({ close }) => (
                <>
                    <SlideoutMenu.Header onClose={close}>
                        <div className="pr-8">
                            <div className="flex items-center gap-2">
                                <Settings01 className="size-5 text-fg-quaternary" />
                                <h2 className="text-lg font-semibold text-primary">Configuracion</h2>
                            </div>
                            <p className="mt-1 text-sm text-tertiary">{getRutaLabel(ruta)} - Empresas y cuentas habilitadas</p>
                        </div>
                    </SlideoutMenu.Header>

                    <SlideoutMenu.Content>
                        <section className="rounded-lg border border-secondary bg-primary p-4">
                            <p className="text-sm font-semibold text-primary">Caja de ingreso principal</p>
                            {cajaPrincipal ? (
                                <div className="mt-3 flex items-start gap-3">
                                    <CheckCircle className="mt-0.5 size-5 text-success-primary" />
                                    <div>
                                        <p className="text-sm font-medium text-primary">{cajaPrincipal.nombre_empresa}</p>
                                        <p className="text-sm text-tertiary">{cajaPrincipal.nombre_banco}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-3 flex items-start gap-3 text-sm text-warning-primary">
                                    <AlertCircle className="mt-0.5 size-5 shrink-0" />
                                    <span>No hay caja principal de ingreso configurada para esta ruta.</span>
                                </div>
                            )}
                        </section>

                        {!!sinCajaOperativa.length && (
                            <section className="rounded-lg border border-warning_subtle bg-warning-primary p-4">
                                <div className="flex items-start gap-3">
                                    <AlertCircle className="mt-0.5 size-5 shrink-0 text-warning-primary" />
                                    <div>
                                        <p className="text-sm font-semibold text-warning-primary">Cuentas sin caja operativa</p>
                                        <p className="mt-1 text-sm text-warning-primary">
                                            Estas cuentas estan habilitadas para la ruta, pero no tienen caja operativa asociada.
                                        </p>
                                    </div>
                                </div>
                            </section>
                        )}

                        <section>
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold text-primary">Empresa activa</h3>
                                <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-tertiary">
                                    {cajasActivas.length} cuenta{cajasActivas.length === 1 ? "" : "s"}
                                </span>
                            </div>

                            {!activeCompany && (
                                <div className="rounded-lg border border-secondary bg-primary p-4 text-sm text-tertiary">
                                    No hay una empresa activa para esta ruta.
                                </div>
                            )}

                            <div className="flex flex-col gap-3">
                                {isLoadingDetails && (
                                    <div className="rounded-lg border border-secondary bg-primary p-4">
                                        <div className="h-5 w-32 animate-pulse rounded bg-secondary" />
                                        <div className="mt-4 grid grid-cols-2 gap-3">
                                            <div className="h-10 animate-pulse rounded bg-secondary" />
                                            <div className="h-10 animate-pulse rounded bg-secondary" />
                                        </div>
                                    </div>
                                )}

                                {detailError && (
                                    <div className="rounded-lg border border-error_subtle bg-error-primary p-4 text-sm text-error-primary">
                                        {detailError}
                                    </div>
                                )}

                                {cajasActivas.map((caja, index) => {
                                    const detail = cajaDetailsByCuenta.get(caja.id_empresa_cuenta_bancaria);

                                    return (
                                        <motion.article
                                            key={caja.id}
                                            initial={{ opacity: 0, y: 4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="rounded-lg border border-secondary bg-primary p-4 shadow-xs"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-semibold text-primary">{caja.nombre_banco}</p>
                                                    <p className="text-xs text-tertiary">Cuenta operativa {index + 1}</p>
                                                </div>
                                                <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-tertiary">
                                                    {caja.flag_caja_ingreso_principal ? "Principal" : caja.nombre_estado}
                                                </span>
                                            </div>

                                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                                <div>
                                                    <dt className="text-xs text-tertiary">Empresa</dt>
                                                    <dd className="font-semibold text-primary">{caja.nombre_empresa}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-xs text-tertiary">Caja</dt>
                                                    <dd className="font-semibold text-primary">{caja.id_caja ?? "Sin caja"}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-xs text-tertiary">Saldo Actual</dt>
                                                    <dd className="font-semibold text-primary">
                                                        {detail ? formatMoney(detail.saldo_actual) : "S/ 0.00"}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-xs text-tertiary">Recaudado</dt>
                                                    <dd className="font-semibold text-primary">
                                                        {detail ? formatMoney(detail.total_recaudado) : "S/ 0.00"}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-xs text-tertiary">Responsable</dt>
                                                    <dd className="font-semibold text-primary">{detail?.nombre_usuario ?? caja.nombre_usuario ?? "Sin asignar"}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-xs text-tertiary">Estado</dt>
                                                    <dd className="font-semibold text-primary">{detail?.nombre_estado ?? caja.nombre_estado}</dd>
                                                </div>
                                            </dl>
                                        </motion.article>
                                    );
                                })}
                            </div>
                        </section>
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
