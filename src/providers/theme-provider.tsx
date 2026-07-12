import type { ReactNode } from "react";
import { createContext, useContext, useLayoutEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = (): ThemeContextType => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
};

interface ThemeProviderProps {
    children: ReactNode;
    darkModeClass?: string;
    defaultTheme?: Theme;
    storageKey?: string;
}

function resolveActualTheme(stored: Theme, defaultTheme: Theme): "light" | "dark" {
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const ThemeProvider = ({
    children,
    defaultTheme = "system",
    storageKey = "ui-theme",
    darkModeClass = "dark-mode",
}: ThemeProviderProps) => {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof window !== "undefined") {
            const savedTheme = localStorage.getItem(storageKey) as Theme | null;
            return savedTheme || defaultTheme;
        }
        return defaultTheme;
    });

    useLayoutEffect(() => {
        const actual = resolveActualTheme(theme, defaultTheme);
        const root = document.documentElement;
        root.classList.toggle(darkModeClass, actual === "dark");

        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = () => {
            if (theme === "system") {
                root.classList.toggle(darkModeClass, mq.matches);
            }
        };
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, [theme, darkModeClass, defaultTheme]);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        if (newTheme === "dark" || newTheme === "light") {
            localStorage.setItem(storageKey, newTheme);
        } else {
            localStorage.removeItem(storageKey);
        }
    };

    return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};
