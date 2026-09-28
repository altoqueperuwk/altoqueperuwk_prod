import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import type { FC } from "react";
import {
    LayoutGrid01,
    Settings01,
    CreditCard01,
    Sun,
    Moon01,
    LogOut01,
    Circle,
    Shield01,
    Building07,
    Users03,
    User01,
    Menu03,
    Key01,
    UserSquare,
    Hash02,
    Bank,
    Briefcase02,
    Sliders03,
    Activity,
    AlertCircle,
    BarChart03,
    File07,
    Link01,
    CoinsStacked01,
    XClose,
    MessageNotificationCircle,
} from "@untitledui/icons";
import { UntitledLogoMinimal } from "@/components/foundations/logo/untitledui-logo-minimal";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";
import { useTheme } from "@/providers/theme-provider";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useAuth } from "@/providers/auth-provider";
import type { NavItemType } from "@/components/application/app-navigation/config";
import { NavList } from "@/components/application/app-navigation/base-components/nav-list";
import { Badge } from "@/components/base/badges/badges";
import { useOperationalReminders } from "@/providers/operational-reminders-provider";

const iconMap: Record<string, FC<{ className?: string }>> = {
    "settings": Settings01,
    "credit-card": CreditCard01,
    "credit-card-bcp": Bank,
    "credit-card-bbva": Bank,
    "credit-card-scotiabank": Bank,
    "credit-card-banbif": Bank,
    "credit-card-interbank": Bank,
    "credit-card-safetypay": Bank,
    "credit-card-pos": CreditCard01,
    "credit-card-linkpago": Link01,
    "credit-card-deuda": CreditCard01,
    "activity": Activity,
    "alert-circle": AlertCircle,
    "bar-chart": BarChart03,
    "file-text": File07,
    "circle": Circle,
    "shield": Shield01,
    "building": Building07,
    "users": Users03,
    "user": User01,
    "menu": Menu03,
    "key": Key01,
    "user-square": UserSquare,
    "hash": Hash02,
    "bank": Bank,
    "briefcase": Briefcase02,
    "sliders": Sliders03,
    "link": Link01,
    "coins-stacked": CoinsStacked01,
};

const resolveIcon = (iconName: string): FC<{ className?: string }> => {
    if (!iconName) return LayoutGrid01;
    const key = iconName.toLowerCase();
    return iconMap[key] || LayoutGrid01;
};

const resolveNavLabel = (label: string, href?: string | null) => {
    if (href === "/operaciones/deuda") return "Pago Deuda";
    return label;
};

const operationAccentByRoute: Record<string, string> = {
    "/operaciones/bcp": "#FF7900",
    "/operaciones/bbva": "#004481",
    "/operaciones/scotiabank": "#EC1C24",
    "/operaciones/banbif": "#00A1E4",
    "/operaciones/interbank": "#00A757",
    "/operaciones/safetypay": "#1363DF",
    "/operaciones/pos": "#6A1B9A",
    "/operaciones/linkpago": "#00E5FF",
    "/operaciones/deuda": "#2C3E50",
    "/operaciones/pago-deuda": "#2C3E50",
    "/operaciones/pagodeuda": "#2C3E50",
};

const resolveNavAccent = (href?: string | null) => href ? operationAccentByRoute[href] : undefined;

const SIDEBAR_WIDTH = 280;

interface SidebarNavigationProps {
    isOpen: boolean;
    onToggle: () => void;
}

export const SidebarNavigation = ({ isOpen, onToggle }: SidebarNavigationProps) => {
    const location = useLocation();
    const { theme, setTheme } = useTheme();
    const { navegacion, isLoading } = useSessionCache();
    const { signOut, user, businessUser } = useAuth();
    const navigate = useNavigate();
    const { resumen } = useOperationalReminders();

    const [activeUrl, setActiveUrl] = useState(location.pathname);

    useEffect(() => {
        setActiveUrl(location.pathname);
    }, [location.pathname]);

    const menuItems: NavItemType[] = useMemo(() => {
        if (!navegacion?.menus) return [];
        return navegacion.menus.map((group) => {
            const items = group.children?.map((child) => ({
                label: resolveNavLabel(child.nombre as string, child.ruta as string | null),
                href: child.ruta || "#",
                icon: resolveIcon(child.icono as string || ""),
                accentColor: resolveNavAccent(child.ruta as string | null),
            })) || [];

            const isReportsGroup = String(group.nombre ?? "").trim().toLowerCase() === "reportes";
            if (isReportsGroup && !items.some((item) => item.href === "/reportes/metricas-bancarias")) {
                items.push({
                    label: "Métricas Bancarias",
                    href: "/reportes/metricas-bancarias",
                    icon: BarChart03,
                    accentColor: undefined,
                });
            }

            return {
                label: group.nombre as string,
                icon: resolveIcon(group.icono as string || ""),
                items,
            };
        });
    }, [navegacion]);

    if (isLoading && !navegacion) {
        return (
            <aside
                className="hidden min-[1920px]:flex fixed inset-y-0 left-0 z-40 h-full flex-col border-r border-secondary bg-primary"
                style={{ width: SIDEBAR_WIDTH }}
            >
                <div className="flex flex-1 items-center justify-center">
                    <svg className="size-6 animate-spin text-fg-quaternary" viewBox="0 0 20 20" fill="none">
                        <circle className="stroke-current opacity-30" cx="10" cy="10" r="8" fill="none" strokeWidth="2" />
                        <circle className="origin-center animate-spin stroke-current" cx="10" cy="10" r="8" fill="none" strokeWidth="2" strokeDasharray="12.5 50" strokeLinecap="round" />
                    </svg>
                </div>
            </aside>
        );
    }

    const sidebarContent = (
        <div className="flex h-full flex-col justify-between overflow-auto">
            <div className="flex flex-col gap-5 px-4 min-[1920px]:px-5">
                <button
                    onClick={() => { navigate("/"); onToggle(); }}
                    className="flex w-fit items-center gap-2"
                >
                    <UntitledLogoMinimal className="size-6" />
                    <span className="text-sm font-semibold text-primary">
                        Al Toque Peru
                    </span>
                </button>
            </div>

            <NavList activeUrl={activeUrl} items={menuItems} />

            <div className="mt-auto flex flex-col gap-3 px-4 py-4 min-[1920px]:py-5">
                <div className="flex flex-col gap-1">
                    <Button
                        size="sm"
                        color="tertiary"
                        className="w-full justify-start"
                        iconLeading={MessageNotificationCircle}
                        onClick={() => { navigate("/bandeja"); onToggle(); }}
                    >
                        <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                            <span>Bandeja</span>
                            {resumen.activos > 0 && <Badge size="sm" color={resumen.nivel3 > 0 ? "error" : "warning"}>{resumen.activos > 99 ? "99+" : resumen.activos}</Badge>}
                        </span>
                    </Button>
                    <Button
                        size="sm"
                        color="tertiary"
                        className="w-full justify-start"
                        iconLeading={theme === "dark" ? Sun : Moon01}
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    >
                        {theme === "dark" ? "Light mode" : "Dark mode"}
                    </Button>
                    <Button
                        size="sm"
                        color="tertiary"
                        className="w-full justify-start"
                        iconLeading={LogOut01}
                        onClick={async () => {
                            await signOut();
                            navigate("/login");
                        }}
                    >
                        Cerrar sesión
                    </Button>
                </div>

                <div className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-secondary ring-inset">
                    <div
                        className={cx(
                            "flex size-9 shrink-0 items-center justify-center rounded-full",
                            "bg-brand-solid text-white",
                        )}
                    >
                        <span className="text-sm font-semibold uppercase">
                            {(businessUser?.nombre as string)?.charAt(0) || user?.email?.charAt(0) || "U"}
                        </span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-primary">
                            {(businessUser?.rol_nombre as string) || "—"}
                        </p>
                        <p className="truncate text-xs text-tertiary">
                            {(businessUser?.username as string) || user?.email || "—"}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <>
            {/* Desktop sidebar — always visible on lg+ */}
            <aside
                className="hidden min-[1920px]:flex fixed inset-y-0 left-0 z-40 h-full flex-col border-r border-secondary bg-primary pt-4 min-[1920px]:pt-5"
                style={{ width: SIDEBAR_WIDTH }}
            >
                {sidebarContent}
            </aside>

            {/* Mobile overlay */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 z-30 bg-black/50 min-[1920px]:hidden"
                            onClick={onToggle}
                        />
                        <motion.aside
                            initial={{ x: -SIDEBAR_WIDTH }}
                            animate={{ x: 0 }}
                            exit={{ x: -SIDEBAR_WIDTH }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-y-0 left-0 z-40 flex h-full flex-col border-r border-secondary bg-primary pt-4 min-[1920px]:hidden"
                            style={{ width: SIDEBAR_WIDTH }}
                        >
                            <div className="flex justify-end px-4 pb-2 min-[1920px]:hidden">
                                <Button
                                    size="sm"
                                    color="tertiary"
                                    iconLeading={XClose}
                                    aria-label="Cerrar menu"
                                    onClick={onToggle}
                                />
                            </div>
                            {sidebarContent}
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};
