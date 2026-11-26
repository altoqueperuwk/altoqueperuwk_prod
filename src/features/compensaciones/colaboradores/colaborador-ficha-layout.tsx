import type { ReactNode } from "react";
import { CompensacionPanel } from "../shared/compensacion-panel";

interface ColaboradorFichaLayoutProps {
    personal: { usuario: ReactNode; nombre: ReactNode; tipoDocumento?: ReactNode; documento: ReactNode; fechaIngreso: ReactNode; estado?: ReactNode };
    laboral: { cargo: ReactNode; sede: ReactNode; modalidad: ReactNode };
    cese?: ReactNode;
    avisos?: ReactNode;
}

/** Estructura del editor de colaboradores; la ficha de consulta tiene su propia cuadrícula. */
export const ColaboradorFichaLayout = ({ personal, laboral, cese, avisos }: ColaboradorFichaLayoutProps) => (
    <div className="grid min-h-0 min-w-0 flex-1 shrink! grid-cols-1 items-start gap-3 overflow-y-auto p-3 md:grid-cols-2 [&_label]:whitespace-nowrap [&>div]:min-w-0 [&>section]:flex [&>section]:min-w-0 [&>section]:flex-col [&>section]:self-stretch [&>section>div:last-child]:flex-1">
        <div className="md:col-span-2">
            <CompensacionPanel title="Usuario y Datos Personales">
                <div className="grid gap-2 sm:grid-cols-12">
                    <div className="sm:col-span-5">{personal.usuario}</div>
                    <div className="sm:col-span-7">{personal.nombre}</div>
                    {personal.tipoDocumento && <div className="sm:col-span-2">{personal.tipoDocumento}</div>}
                    <div className="sm:col-span-3">{personal.documento}</div>
                    <div className="sm:col-span-4">{personal.fechaIngreso}</div>
                    {personal.estado && <div className="sm:col-span-3">{personal.estado}</div>}
                </div>
            </CompensacionPanel>
        </div>
        <CompensacionPanel title="Datos Laborales">
            <div className="grid gap-2 sm:grid-cols-2">
                {laboral.cargo}
                {laboral.sede}
                {laboral.modalidad}
            </div>
        </CompensacionPanel>
        {avisos && <div className="md:col-span-2">{avisos}</div>}
        {cese && (
            <div className="md:col-span-2">
                <CompensacionPanel title="Cese Laboral">{cese}</CompensacionPanel>
            </div>
        )}
    </div>
);
