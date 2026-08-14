import { useEffect, useRef, useState } from "react";

const REFRESH_DEBOUNCE_MS = 500;

export const useWindowFocusRefresh = () => {
    const [refreshKey, setRefreshKey] = useState(0);
    const lastRefreshAt = useRef(0);

    useEffect(() => {
        const requestRefresh = () => {
            if (document.visibilityState !== "visible") return;

            const now = Date.now();
            if (now - lastRefreshAt.current < REFRESH_DEBOUNCE_MS) return;

            lastRefreshAt.current = now;
            setRefreshKey((current) => current + 1);
        };

        window.addEventListener("focus", requestRefresh);
        document.addEventListener("visibilitychange", requestRefresh);

        return () => {
            window.removeEventListener("focus", requestRefresh);
            document.removeEventListener("visibilitychange", requestRefresh);
        };
    }, []);

    return refreshKey;
};
