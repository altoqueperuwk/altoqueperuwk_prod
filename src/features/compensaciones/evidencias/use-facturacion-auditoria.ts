import { useEffect, useRef, useState } from "react";
import { useAlert } from "@/components/shared/alert-center";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { useCompensacionRequestScope } from "../shared/use-compensacion-request-scope";
import { desdeReporte, nuevo } from "./facturacion-auditoria-constantes";
import {
    type FacturacionContexto,
    type FacturacionFiltros,
    type FacturacionListado,
    type FacturacionOperacion,
    type FacturacionRegistro,
    type FacturacionReporte,
    facturacionError,
    facturacionFechasMes,
    facturacionMesLima,
    facturacionAuditoriaService as service,
} from "./facturacion-auditoria.service";

/** Datos y acciones de Auditoría de Pagos; la pantalla solo dibuja. */
export const useFacturacionAuditoria = () => {
    const { userId } = useCompensacionPerfil();
    const notify = useAlert();
    const beginRequest = useCompensacionRequestScope();
    const [context, setContext] = useState<FacturacionContexto | null>(null);
    const [contextError, setContextError] = useState("");
    const [mes, setMes] = useState(facturacionMesLima);
    const [filters, setFilters] = useState<FacturacionFiltros>(() => ({
        ...facturacionFechasMes(facturacionMesLima()),
        estado: "",
        dni: "",
        pagina: 1,
        tamano: 20,
    }));
    const [query, setQuery] = useState(filters);
    useEffect(() => {
        if (!filters.desde || !filters.hasta || filters.hasta < filters.desde) return;
        if (filters.dni === query.dni && filters.estado === query.estado && filters.desde === query.desde && filters.hasta === query.hasta) return;
        const timer = setTimeout(() => setQuery({ ...filters, pagina: 1, tamano: query.tamano }), 350);
        return () => clearTimeout(timer);
    }, [filters, query]);
    const [result, setResult] = useState<FacturacionListado | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refresh, setRefresh] = useState(0);
    const [form, setForm] = useState(nuevo);
    const [editing, setEditing] = useState<FacturacionReporte | null>(null);
    const [ops, setOps] = useState<FacturacionOperacion[]>([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const [busy, setBusy] = useState(false);
    const [comment, setComment] = useState("");
    const lock = useRef(false);
    const searchVersion = useRef(0);
    const key = useRef<{ payload: string; key: string } | null>(null);
    useEffect(() => {
        let active = true;
        service
            .contexto()
            .then((ctx) => {
                if (active) setContext(ctx);
            })
            .catch((cause) => {
                if (active) setContextError(facturacionError(cause));
            });
        return () => {
            active = false;
            searchVersion.current++;
        };
    }, []);
    useEffect(() => {
        if (!context) return;
        let active = true;
        setLoading(true);
        setError("");
        service
            .listar(query)
            .then((data) => {
                if (active) setResult(data);
            })
            .catch((cause) => {
                if (active) {
                    setError(facturacionError(cause));
                    setResult(null);
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [context, query, refresh]);
    const clear = () => {
        searchVersion.current++;
        setSearching(false);
        setSearched(false);
        setOps([]);
        setForm(nuevo());
        setEditing(null);
        setComment("");
        key.current = null;
    };
    const change = (patch: Partial<FacturacionRegistro>) => {
        if (patch.dni !== undefined || patch.tipo !== undefined) {
            searchVersion.current++;
            setSearching(false);
            setSearched(false);
            setOps([]);
            patch.operacion = null;
        }
        setForm((value) => ({ ...value, ...patch }));
    };
    const search = async () => {
        const version = ++searchVersion.current;
        setSearching(true);
        setSearched(false);
        setOps([]);
        try {
            const items = await service.operaciones(form.dni);
            if (version === searchVersion.current) {
                setOps(items);
                setSearched(true);
            }
        } catch (cause) {
            if (version === searchVersion.current) notify("error", facturacionError(cause));
        } finally {
            if (version === searchVersion.current) setSearching(false);
        }
    };
    /** Ejecuta una acción con bloqueo único; avisa el resultado y recarga el listado. */
    const run = async (action: () => Promise<unknown>, okMessage: string) => {
        lock.current = true;
        setBusy(true);
        const isCurrent = beginRequest();
        try {
            await action();
            if (!isCurrent()) return;
            notify("success", okMessage);
            clear();
            setRefresh((v) => v + 1);
        } catch (cause) {
            if (isCurrent()) notify("error", facturacionError(cause));
        } finally {
            if (isCurrent()) {
                lock.current = false;
                setBusy(false);
            }
        }
    };
    const save = async () => {
        if (lock.current) return;
        const payload = JSON.stringify(form);
        if (!key.current || key.current.payload !== payload) key.current = { payload, key: crypto.randomUUID() };
        const clave = form.id ? undefined : key.current.key;
        await run(() => service.guardar({ ...form, clave }), form.id ? "Reporte actualizado." : "Reporte enviado a Gerencia.");
    };
    const resolve = async (decision: "APROBADO" | "RECHAZADO") => {
        if (!editing || !context?.es_admin || lock.current) return;
        if (
            Number(editing.id_usuario_registra) === userId ||
            (context.id_colaborador != null &&
                [editing.id_colaborador_beneficiario, editing.id_colaborador_responsable].some((id) => Number(id) === context.id_colaborador))
        ) {
            notify("notice", "Este reporte requiere otro revisor porque participas en el expediente.");
            return;
        }
        await run(
            () => service.resolver(editing.id, decision, comment, editing.fecha_actualizacion),
            decision === "APROBADO" ? "Reporte aprobado." : "Reporte rechazado.",
        );
    };
    const reopen = async () => {
        if (!editing?.fecha_actualizacion || !context?.es_admin || lock.current) return;
        const version = editing.fecha_actualizacion;
        await run(() => service.reabrir(editing.id, version, comment), "Reporte devuelto a revisión.");
    };
    const annul = async () => {
        if (!editing || context?.es_admin || lock.current) return;
        if (comment.trim().length < 10) {
            notify("validation", "Explica el motivo de la anulación con al menos 10 caracteres.");
            return;
        }
        await run(() => service.anular(editing.id, comment), "Reporte anulado.");
    };
    const open = (r: FacturacionReporte) => {
        clear();
        setEditing(r);
        setForm(desdeReporte(r));
        if (r.datos.operacion) setOps([r.datos.operacion]);
    };
    const limpiarFiltros = () => {
        const month = facturacionMesLima();
        const next = { ...facturacionFechasMes(month), dni: "", estado: "", pagina: 1, tamano: query.tamano };
        setMes(month);
        setFilters(next);
        setQuery(next);
    };
    const actualizar = () => {
        setQuery({ ...filters, pagina: 1, tamano: query.tamano });
        setRefresh((v) => v + 1);
    };
    return {
        context,
        contextError,
        mes,
        setMes,
        filters,
        setFilters,
        query,
        setQuery,
        result,
        loading,
        error,
        form,
        editing,
        ops,
        searching,
        searched,
        busy,
        comment,
        setComment,
        clear,
        change,
        search,
        save,
        resolve,
        reopen,
        annul,
        open,
        limpiarFiltros,
        actualizar,
    };
};
export type FacturacionAuditoriaControl = ReturnType<typeof useFacturacionAuditoria>;
