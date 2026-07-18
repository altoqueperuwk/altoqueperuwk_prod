import { useState } from "react";
import { SidebarNavigation } from "./sidebar-navigation";
import { Header } from "./header";
import type { ReactNode } from "react";

interface AppLayoutProps {
    children: ReactNode;
}

const SIDEBAR_WIDTH = 280;

export const AppLayout = ({ children }: AppLayoutProps) => {
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    return (
        <div className="flex h-screen overflow-hidden bg-secondary">
            <SidebarNavigation isOpen={isMobileOpen} onToggle={() => setIsMobileOpen((v) => !v)} />
            <div
                className="flex flex-1 flex-col overflow-hidden min-[1920px]:ml-[280px]"
            >
                <Header onToggleMenu={() => setIsMobileOpen((v) => !v)} />
                <main className="relative flex-1 overflow-y-auto bg-secondary p-6">
                    {children}
                </main>
            </div>
        </div>
    );
};
