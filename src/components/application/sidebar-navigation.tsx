import { useEffect, useMemo, useState } from "react";
import type { FC } from "react";
import {
    Activity,
    AlertCircle,
    Bank,
    BarChart03,
    Briefcase02,
    Building07,
    Circle,
    CoinsStacked01,
    CreditCard01,
    File07,
    Hash02,
    Key01,
    LayoutGrid01,
    Link01,
    LogOut01,
    Menu03,
    MessageNotificationCircle,
    Moon01,
    Phone01,
    Settings01,
    Shield01,
    Sliders03,
    Star01,
    Sun,
    User01,
    UserSquare,
    Users03,
    XClose,
} from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useLocation, useNavigate } from "react-router";
import { NavList } from "@/components/application/app-navigation/base-components/nav-list";
import type { NavItemType } from "@/components/application/app-navigation/config";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { AtkWordmark } from "@/components/foundations/logo/atk-wordmark";
import {
    advisorRouteAllowed,
    isCompensacionAdvisor,
    isCompensacionFacturacion,
    isCompensacionMarketing,
    isCompensacionPagos,
    isCompensacionStoreManager,
} from "@/features/compensaciones/shared/compensacion-perfil";
import {
    administracionConceptMenus,
    atcConceptMenus,
    compensacionesMenuLabel,
    facturacionConceptMenus,
    jefaturaConceptMenus,
    marketingConceptMenus,
    pagosConceptMenus,
    sharedCompensacionesMenus,
} from "@/features/compensaciones/shared/compensaciones-navigation";
import { isAdministrator, useAuth } from "@/providers/auth-provider";
import { useOperationalReminders } from "@/providers/operational-reminders-provider";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useTheme } from "@/providers/theme-provider";
import { cx } from "@/utils/cx";

const iconMap: Record<string, FC<{ className?: string }>> = {
    star: Star01,
    phone: Phone01,
    settings: Settings01,
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
    activity: Activity,
    "alert-circle": AlertCircle,
    "bar-chart": BarChart03,
    "file-text": File07,
    circle: Circle,
    shield: Shield01,
    building: Building07,
    users: Users03,
    user: User01,
    menu: Menu03,
    key: Key01,
    "user-square": UserSquare,
    hash: Hash02,
    bank: Bank,
    briefcase: Briefcase02,
    sliders: Sliders03,
    link: Link01,
    "coins-stacked": CoinsStacked01,
};

const resolveIcon = (iconName: string): FC<{ className?: string }> => {
    if (!iconName) return LayoutGrid01;
    const key = iconName.toLowerCase();
    return iconMap[key] || LayoutGrid01;
};

const compensacionesSectionIcons: Partial<Record<string, FC<{ className?: string }>>> = {
    General: LayoutGrid01,
    Registro: Briefcase02,
    Auditoría: Shield01,
    Control: Sliders03,
};

const withCompensacionesSectionIcons = (groups: NavItemType[]) =>
    groups.map((group) => {
        const icon = compensacionesSectionIcons[group.label];
        return icon && group.items?.length ? { ...group, icon } : group;
    });

const resolveNavLabel = (label: string, href?: string | null) => {
    if (href === "/operaciones/deuda") return "Pago Deuda";
    return label;
};

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

    const [activeUrl, setActiveUrl] = useState(location.pathname + location.search);

    useEffect(() => {
        setActiveUrl(location.pathname + location.search);
    }, [location.pathname, location.search]);

    const menuItems: NavItemType[] = useMemo(() => {
        const groups: NavItemType[] = (navegacion?.menus ?? []).flatMap((group) => {
            const children = (group.children ?? []).filter(
                (child) =>
                    child.ruta !== "/atencion/mi-enlace-qr" &&
                    (child.ruta !== "/compensaciones/mis-bonos-descuentos" ||
                        isCompensacionAdvisor(businessUser) ||
                        isCompensacionStoreManager(businessUser) ||
                        isCompensacionFacturacion(businessUser)),
            );
            const items: NavItemType[] =
                children.map((child) => ({
                    label: compensacionesMenuLabel(resolveNavLabel(child.nombre as string, child.ruta as string | null), child.ruta as string | null),
                    href: child.ruta || "#",
                    icon: resolveIcon((child.icono as string) || ""),
                })) || [];

            const isReportsGroup =
                String(group.nombre ?? "")
                    .trim()
                    .toLowerCase() === "reportes";
            if (
                isReportsGroup &&
                !isCompensacionFacturacion(businessUser) &&
                !isCompensacionPagos(businessUser) &&
                !isCompensacionMarketing(businessUser) &&
                !items.some((item) => item.href === "/reportes/metricas-bancarias")
            ) {
                items.push({
                    label: "Métricas Bancarias",
                    href: "/reportes/metricas-bancarias",
                    icon: BarChart03,
                });
            }

            return [
                {
                    label: group.nombre as string,
                    icon: resolveIcon((group.icono as string) || ""),
                    items,
                },
            ];
        });
        if (isAdministrator(businessUser)) return withCompensacionesSectionIcons(administracionConceptMenus(groups));
        if (isCompensacionPagos(businessUser)) return withCompensacionesSectionIcons(pagosConceptMenus(groups));
        if (isCompensacionMarketing(businessUser)) return withCompensacionesSectionIcons(marketingConceptMenus(groups));
        if (isCompensacionFacturacion(businessUser)) return withCompensacionesSectionIcons(facturacionConceptMenus(groups));
        if (isCompensacionStoreManager(businessUser)) return withCompensacionesSectionIcons(jefaturaConceptMenus(groups));
        if (isCompensacionAdvisor(businessUser)) {
            const personal = groups
                .map((group) => ({ ...group, items: group.items?.filter((item) => advisorRouteAllowed(item.href ?? "")) }))
                .filter((group) => group.items?.length);
            return withCompensacionesSectionIcons(atcConceptMenus(personal));
        }
        return withCompensacionesSectionIcons(sharedCompensacionesMenus(groups));
    }, [navegacion, businessUser]);

    if (isLoading && !navegacion) {
        return (
            <aside
                className="fixed inset-y-0 left-0 z-40 hidden h-full flex-col border-r border-secondary bg-primary min-[1920px]:flex"
                style={{ width: SIDEBAR_WIDTH }}
            >
                <div className="flex flex-1 items-center justify-center">
                    <svg className="size-6 animate-spin text-fg-quaternary" viewBox="0 0 20 20" fill="none">
                        <circle className="stroke-current opacity-30" cx="10" cy="10" r="8" fill="none" strokeWidth="2" />
                        <circle
                            className="origin-center animate-spin stroke-current"
                            cx="10"
                            cy="10"
                            r="8"
                            fill="none"
                            strokeWidth="2"
                            strokeDasharray="12.5 50"
                            strokeLinecap="round"
                        />
                    </svg>
                </div>
            </aside>
        );
    }

    const sidebarContent = (
        <div className="atk-sidebar-scroll flex h-full flex-col justify-between overflow-auto">
            <div className="flex flex-col gap-5 px-4 min-[1920px]:px-5">
                <button
                    onClick={() => {
                        navigate("/");
                        onToggle();
                    }}
                    className="flex w-fit items-center gap-2"
                >
                    <AtkWordmark />
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
                        onClick={() => {
                            navigate("/bandeja");
                            onToggle();
                        }}
                    >
                        <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                            <span>Bandeja</span>
                            {resumen.activos > 0 && (
                                <Badge size="sm" color={resumen.nivel3 > 0 ? "error" : "warning"}>
                                    {resumen.activos > 99 ? "99+" : resumen.activos}
                                </Badge>
                            )}
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
                    <div className={cx("flex size-9 shrink-0 items-center justify-center rounded-full", "bg-brand-solid text-white")}>
                        <span className="text-sm font-semibold uppercase">{(businessUser?.nombre as string)?.charAt(0) || user?.email?.charAt(0) || "U"}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-primary">{(businessUser?.rol_nombre as string) || "—"}</p>
                        <p className="truncate text-xs text-tertiary">{(businessUser?.username as string) || user?.email || "—"}</p>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <>
            {/* Desktop sidebar — always visible on lg+ */}
            <aside
                className="fixed inset-y-0 left-0 z-40 hidden h-full flex-col border-r border-secondary bg-primary pt-4 min-[1920px]:flex min-[1920px]:pt-5"
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
                                <Button size="sm" color="tertiary" iconLeading={XClose} aria-label="Cerrar menu" onClick={onToggle} />
                            </div>
                            {sidebarContent}
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};
