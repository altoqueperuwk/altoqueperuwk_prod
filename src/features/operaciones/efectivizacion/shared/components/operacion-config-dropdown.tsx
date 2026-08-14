import { Bank, Building07, Calendar, CheckCircle, ChevronDown, CreditCard01, Settings01, Sliders04 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";

interface OperacionConfigDropdownProps {
    onOpenCajas?: () => void;
    onOpenEmpresaPrincipal?: () => void;
    onOpenEmpresasComision?: () => void;
    onOpenEmpresas?: () => void;
    onOpenReglasAbono?: () => void;
    onOpenReglas: () => void;
    showCajas?: boolean;
    showEmpresaPrincipal?: boolean;
    showEmpresasComision?: boolean;
    showEmpresas?: boolean;
    showReglasAbono?: boolean;
}

export const OperacionConfigDropdown = ({
    onOpenCajas,
    onOpenEmpresaPrincipal,
    onOpenEmpresasComision,
    onOpenEmpresas,
    onOpenReglasAbono,
    onOpenReglas,
    showCajas = false,
    showEmpresaPrincipal = false,
    showEmpresasComision = false,
    showEmpresas = false,
    showReglasAbono = false,
}: OperacionConfigDropdownProps) => (
    <Dropdown.Root>
        <Button size="sm" color="primary" iconLeading={Settings01} iconTrailing={ChevronDown}>
            Configuracion
        </Button>
        <Dropdown.Popover className="w-64">
            <Dropdown.Menu>
                <Dropdown.Item icon={Sliders04} onAction={onOpenReglas}>
                    Reglas de Efectivizacion
                </Dropdown.Item>
                {showReglasAbono && (
                    <Dropdown.Item icon={Calendar} onAction={onOpenReglasAbono}>
                        Reglas de Abono
                    </Dropdown.Item>
                )}
                {showEmpresas && (
                    <Dropdown.Item icon={Building07} onAction={onOpenEmpresas}>
                        Empresas
                    </Dropdown.Item>
                )}
                {showEmpresasComision && (
                    <Dropdown.Item icon={CreditCard01} onAction={onOpenEmpresasComision}>
                        Empresas Comision
                    </Dropdown.Item>
                )}
                {showCajas && (
                    <Dropdown.Item icon={Bank} onAction={onOpenCajas}>
                        Cajas
                    </Dropdown.Item>
                )}
                {showEmpresaPrincipal && (
                    <Dropdown.Item icon={CheckCircle} onAction={onOpenEmpresaPrincipal}>
                        Empresa Principal
                    </Dropdown.Item>
                )}
            </Dropdown.Menu>
        </Dropdown.Popover>
    </Dropdown.Root>
);
