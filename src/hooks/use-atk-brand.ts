import { useEffect } from "react";

/** Activa la identidad Al Toque Perú WK en las pantallas que la solicitan. */
export const useAtkBrand = (active = true) => {
    useEffect(() => {
        const root = document.documentElement;
        if (active) root.classList.add("atk-brand");
        else root.classList.remove("atk-brand");
        return () => {
            if (active) root.classList.remove("atk-brand");
        };
    }, [active]);
};
