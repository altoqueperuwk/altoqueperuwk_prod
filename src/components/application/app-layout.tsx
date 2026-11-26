import { Suspense, createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { cx } from "@/utils/cx";
import { Header } from "./header";
import { SidebarNavigation } from "./sidebar-navigation";

interface AppLayoutProps {
    children: ReactNode;
}

const AppLayoutContext = createContext(false);

/** Preferencia del usuario en pantallas anchas, donde el menú va fijo al costado. */
const CLAVE_MENU_OCULTO = "ui-menu-oculto";
const PANTALLA_ANCHA = "(min-width: 1920px)";

const leerMenuOculto = () => {
    try {
        return localStorage.getItem(CLAVE_MENU_OCULTO) === "1";
    } catch {
        return false;
    }
};

export const AppLayout = ({ children }: AppLayoutProps) => {
    const insideLayout = useContext(AppLayoutContext);
    // Compatibilidad con las pantallas existentes: no crean otro menú/header.
    return insideLayout ? <>{children}</> : <AppShell>{children}</AppShell>;
};

const AppShell = ({ children }: AppLayoutProps) => {
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [menuOculto, setMenuOculto] = useState(leerMenuOculto);
    const alternarCajon = () => setIsMobileOpen((v) => !v);

    // El botón hamburguesa oculta el menú fijo en pantallas anchas y abre el cajón en las demás.
    const alternarMenu = () => {
        if (!window.matchMedia?.(PANTALLA_ANCHA).matches) return alternarCajon();
        const siguiente = !menuOculto;
        setMenuOculto(siguiente);
        try {
            localStorage.setItem(CLAVE_MENU_OCULTO, siguiente ? "1" : "0");
        } catch {
            // Sin almacenamiento, la preferencia dura hasta recargar.
        }
    };

    return (
        <AppLayoutContext.Provider value={true}>
            <div className="flex h-screen overflow-hidden bg-secondary">
                <SidebarNavigation isOpen={isMobileOpen} isHidden={menuOculto} onToggle={alternarCajon} />
                <div className={cx("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", !menuOculto && "min-[1920px]:ml-[280px]")}>
                    <Header onToggleMenu={alternarMenu} />
                    <main className="relative min-h-0 min-w-0 flex-1 atk-canvas overflow-y-auto bg-secondary p-4 sm:p-6">
                        <Suspense fallback={<p className="py-16 text-center text-sm text-tertiary">Cargando...</p>}>{children}</Suspense>
                    </main>
                </div>
            </div>
        </AppLayoutContext.Provider>
    );
};
