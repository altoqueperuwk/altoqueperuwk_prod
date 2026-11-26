import type { ReactNode } from "react";
import { XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { CompensacionPanel } from "./compensacion-panel";

/** Slots de presentación; cada pantalla conserva sus filtros, permisos y consulta al servidor. */
export const CompensacionFiltros = ({
    children,
    texto,
    estado,
    fechas,
    periodo,
    acciones,
    onLimpiar,
    toolbar = false,
    trailing,
}: {
    children?: ReactNode;
    texto?: ReactNode;
    estado?: ReactNode;
    fechas?: ReactNode;
    periodo?: ReactNode;
    acciones?: ReactNode;
    onLimpiar?: () => void;
    toolbar?: boolean;
    trailing?: ReactNode;
}) => (
    <CompensacionPanel title="Filtros de Búsqueda" toolbar={toolbar} trailing={trailing}>
        {children ?? (
            <div className="flex flex-wrap items-end gap-2">
                {texto}
                {estado}
                {fechas}
                {periodo}
                {onLimpiar && (
                    <Button size="sm" color="primary" iconLeading={XClose} onClick={onLimpiar}>
                        Limpiar
                    </Button>
                )}
                {acciones}
            </div>
        )}
    </CompensacionPanel>
);
