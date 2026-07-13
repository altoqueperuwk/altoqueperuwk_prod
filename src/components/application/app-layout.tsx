import { SidebarNavigation } from "./sidebar-navigation";
import { Header } from "./header";
import type { ReactNode } from "react";

interface AppLayoutProps {
    children: ReactNode;
}

const SIDEBAR_WIDTH = 280;

export const AppLayout = ({ children }: AppLayoutProps) => {
    return (
        <div className="flex h-screen overflow-hidden bg-secondary">
            <SidebarNavigation />
            <div
                className="flex flex-1 flex-col overflow-hidden"
                style={{ marginLeft: SIDEBAR_WIDTH }}
            >
                <Header />
                <main className="relative flex-1 overflow-y-auto bg-secondary p-6">
                    {children}
                </main>
            </div>
        </div>
    );
};
