import { useCallback, useEffect, useRef } from "react";

/** Una respuesta de un formulario desmontado no debe afectar la siguiente tarea/sesión. */
export const useCompensacionRequestScope = () => {
    const version = useRef(0);
    useEffect(
        () => () => {
            ++version.current;
        },
        [],
    );
    return useCallback(() => {
        const current = version.current;
        return () => current === version.current;
    }, []);
};
