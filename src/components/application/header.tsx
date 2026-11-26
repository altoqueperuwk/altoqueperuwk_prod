import { Menu03 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Breadcrumb } from "./breadcrumb";

interface HeaderProps {
    onToggleMenu?: () => void;
}

export const Header = ({ onToggleMenu }: HeaderProps) => {
    return (
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-secondary bg-primary px-6">
            <div className="flex items-center gap-3">
                {onToggleMenu && (
                    <Button
                        size="sm"
                        color="tertiary"
                        iconLeading={Menu03}
                        aria-label="Mostrar u ocultar menu"
                        onClick={onToggleMenu}
                    />
                )}
                <Breadcrumb />
            </div>
        </header>
    );
};
