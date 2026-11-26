import { Suspense, createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { Header } from "./header";
import { SidebarNavigation } from "./sidebar-navigation";

interface AppLayoutProps {
    children: ReactNode;
}

const AppLayoutContext = createContext(false);

export const AppLayout = ({ children }: AppLayoutProps) => {
    const insideLayout = useContext(AppLayoutContext);
    // Compatibilidad con las pantallas existentes: no crean otro menú/header.
    return insideLayout ? <>{children}</> : <AppShell>{children}</AppShell>;
};

const AppShell = ({ children }: AppLayoutProps) => {
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    return (
        <AppLayoutContext.Provider value={true}>
            <div className="flex h-screen overflow-hidden bg-secondary">
                <SidebarNavigation isOpen={isMobileOpen} onToggle={() => setIsMobileOpen((v) => !v)} />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden min-[1920px]:ml-[280px]">
                    <Header onToggleMenu={() => setIsMobileOpen((v) => !v)} />
                    <main className="relative min-h-0 min-w-0 flex-1 atk-canvas overflow-y-auto bg-secondary p-4 sm:p-6">
                        <Suspense fallback={<p className="py-16 text-center text-sm text-tertiary">Cargando...</p>}>{children}</Suspense>
                    </main>
                </div>
            </div>
        </AppLayoutContext.Provider>
    );
};
