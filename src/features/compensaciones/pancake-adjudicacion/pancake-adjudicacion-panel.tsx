import { useEffect, useRef, useState } from "react";
import { CheckCircle, Paperclip, RefreshCw01, Upload01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { TextArea } from "@/components/base/textarea/textarea";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { type ColumnDef } from "@/components/shared/data-table";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { NombreCell } from "../shared/compensacion-cells";
import { CompensacionEstado } from "../shared/compensacion-estado";
import { CompensacionPanel } from "../shared/compensacion-panel";
import {
    type CandidatoMensual,
    type CriterioMensual,
    type PancakeMapeo,
    type RankingMensual,
    pancakeAdjudicacionService as service,
} from "./pancake-adjudicacion.service";
import { PancakeAdjuntoDialog } from "./pancake-adjunto-dialog";

/** Administración: montar en Estadísticas, no en el Dashboard personal ATC.
 * La página y el mapeo proceden de una configuración revisada; nunca se adivinan.
 * SQL vuelve a comprobar rol, alcance, mes, versión y datos originales.
 */
export function PancakeAdjudicacionPanel({ mes, pagina, mapeo }: { mes: string; pagina: string; mapeo: PancakeMapeo }) {
    const notify = useAlert();

    const [criterio, setCriterio] = useState<CriterioMensual>("ATENCIONES");
    const [ranking, setRanking] = useState<RankingMensual | null>(null);
    const [justificacion, setJustificacion] = useState("");
    const [archivo, setArchivo] = useState<File | null>(null);
    const [attaching, setAttaching] = useState(false);
    const [busy, setBusy] = useState(false);

    const [error, setError] = useState("");
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(20);
    const [refresh, setRefresh] = useState(0);
    const version = useRef(0);
    useEffect(() => {
        const current = ++version.current;
        setRanking(null);
        setPage(1);
        setError("");

        setJustificacion("");
        setArchivo(null);
        setAttaching(false);
        service
            .ranking(mes, criterio)
            .then((r) => {
                if (version.current === current) setRanking(r);
            })
            .catch((e: unknown) => {
                if (version.current === current) setError(e instanceof Error ? e.message : "No se pudo consultar.");
            });
        return () => {
            ++version.current;
        };
    }, [mes, criterio, refresh]);
    const run = async (action: () => Promise<unknown>, message: string) => {
        const current = version.current;
        setBusy(true);
        setError("");

        try {
            await action();
            if (current !== version.current) return;
            const data = await service.ranking(mes, criterio);
            if (current !== version.current) return;
            setRanking(data);
            notify("success", message);
        } catch (e) {
            if (current === version.current) setError(e instanceof Error ? e.message : "No se pudo completar.");
        } finally {
            setBusy(false);
        }
    };
    const columns: ColumnDef[] = [
        { key: "nombre", header: "Colaborador", render: (value) => <NombreCell value={value} /> },
        { key: "atenciones", header: "Pancake", align: "right" },
        { key: "calificaciones", header: "Calificaciones", align: "right" },
        { key: "presenciales", header: "Presenciales", align: "right" },
        {
            key: "puntualidad",
            header: "Estado",
            render: (value) => {
                const result = value as CandidatoMensual["puntualidad"] | undefined;
                return <CompensacionEstado dominio="elegibilidad" valor={result?.estado ?? "EN_REVISION"} detalle={result?.motivo} />;
            },
        },
        { key: "puesto", header: "Posición", align: "right", render: (value) => (value === null ? "—" : String(value)) },
    ];
    return (
        <CompensacionPanel title="Colaborador del Mes" trailing={ranking && <CompensacionEstado dominio="rankingMensual" valor={ranking.estado} />}>
            <div className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                    <Button size="sm" color={criterio === "ATENCIONES" ? "primary" : "secondary"} isDisabled={busy} onClick={() => setCriterio("ATENCIONES")}>
                        Atenciones
                    </Button>
                    <Button
                        size="sm"
                        color={criterio === "CALIFICACIONES" ? "primary" : "secondary"}
                        isDisabled={busy}
                        onClick={() => setCriterio("CALIFICACIONES")}
                    >
                        Calificaciones
                    </Button>
                    <Button size="sm" color="primary" iconLeading={RefreshCw01} isDisabled={busy} onClick={() => setRefresh((r) => r + 1)}>
                        Actualizar
                    </Button>
                </div>
                <p className="text-xs text-secondary">
                    Dos bolsas independientes de S/100. La adjudicación registra el bono; el pago lo gestiona el área responsable.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="w-full min-w-0 space-y-1 sm:w-64 sm:shrink-0">
                        <Button size="sm" color="primary" iconLeading={Paperclip} isDisabled={busy} onClick={() => setAttaching(true)}>
                            Adjuntar Original{archivo ? " (1)" : ""}
                        </Button>
                        <p className="text-xs break-words text-tertiary" title={archivo?.name}>
                            {archivo?.name ?? "JSON o CSV, hasta 10 MB"}
                        </p>
                    </div>
                    <div className="min-w-0 flex-1 basis-64">
                        <TextArea
                            size="sm"
                            rows={2}
                            label="Sustento de Revisión"
                            value={justificacion}
                            onChange={setJustificacion}
                            isDisabled={busy}
                            placeholder="Verifica identidad, páginas y cobertura completa del mes."
                        />
                    </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                    <Button
                        size="sm"
                        color="secondary"
                        iconLeading={Upload01}
                        isDisabled={busy || !archivo || justificacion.trim().length < 10}
                        onClick={() =>
                            archivo &&
                            run(
                                () => service.importar(mes, pagina, archivo, mapeo, justificacion),
                                "Archivo importado. Revisa la cobertura antes de certificar.",
                            )
                        }
                    >
                        Importar
                    </Button>
                    <Button
                        size="sm"
                        color="secondary"
                        iconLeading={CheckCircle}
                        isDisabled={busy || justificacion.trim().length < 20}
                        onClick={() => run(() => service.certificar(mes, justificacion), "Fuente certificada por Administración.")}
                    >
                        Certificar
                    </Button>
                    <Button
                        size="sm"
                        color="primary"
                        iconLeading={CheckCircle}
                        isDisabled={busy || ranking?.estado !== "LISTO" || justificacion.trim().length < 10}
                        onClick={() => ranking && run(() => service.adjudicar(ranking, justificacion), "Bono adjudicado. Todavía no desembolsado.")}
                    >
                        Adjudicar
                    </Button>
                </div>
                {error && <AlertMessage tone="error">{error}</AlertMessage>}

                <p className="text-xs text-tertiary">
                    {error
                        ? "Consulta no disponible"
                        : !ranking
                          ? "Consultando ranking…"
                          : ranking.estado === "SIN_FUENTE"
                            ? "Todavía no hay datos auténticos de Pancake para este periodo."
                            : ranking?.estado === "LISTO"
                              ? "Ranking listo para revisión administrativa"
                              : ranking?.estado === "SIN_CANDIDATOS"
                                ? "Sin candidatos elegibles"
                                : "Faltan fuentes completas o elegibilidad confirmada."}
                </p>
                <DataTable
                    columns={columns}
                    data={(ranking?.candidatos ?? []).slice((page - 1) * size, page * size).map((row) => ({ ...row, id: row.id_colaborador }))}
                    isLoading={!ranking && !error}
                    page={page}
                    pageSize={size}
                    totalPages={Math.max(1, Math.ceil((ranking?.candidatos.length ?? 0) / size))}
                    onPageChange={setPage}
                    onPageSizeChange={(s) => {
                        setSize(s);
                        setPage(1);
                    }}
                    density="compact"
                />
                {attaching && (
                    <PancakeAdjuntoDialog
                        initial={archivo}
                        onClose={() => setAttaching(false)}
                        onApply={(file) => {
                            setArchivo(file);
                            setAttaching(false);
                        }}
                    />
                )}
            </div>
        </CompensacionPanel>
    );
}
