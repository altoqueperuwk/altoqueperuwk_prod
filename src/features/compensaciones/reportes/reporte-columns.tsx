import type { ColumnDef } from "@/components/shared/data-table";
import { NotasCell, PersonaCell, compensationDate, compensationMoney } from "../shared/compensacion-cells";
import type { ReporteColumna } from "./reportes.types";

const number = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 });
const names: Record<string, string> = {
    SUELDO: "Sueldo",
    COMISIONES: "Bonos",
    TOTAL: "Total",
    REVERSA: "Reversa",
    PAGO: "Pago",
    INGRESO: "Ingreso",
    DESCUENTO: "Penalidad",
};
export const reporteColumns = (columns: ReporteColumna[]): ColumnDef[] =>
    columns
        .filter((column) => column.key !== "colaborador_documento" || !columns.some((c) => c.key === "colaborador_nombre"))
        .map((column) => ({
            key: column.key,
            header: column.label,
            align: ["money", "percent", "number"].includes(column.kind ?? "") ? ("right" as const) : undefined,
            render: (value, row) => {
                if (column.key === "colaborador_nombre")
                    return (
                        <PersonaCell
                            name={String(value ?? "—")}
                            detail={typeof row.colaborador_documento === "string" ? row.colaborador_documento : undefined}
                        />
                    );
                if (value == null) return "—";
                if (column.kind === "date") return compensationDate(value);
                if (["money", "percent", "number"].includes(column.kind ?? "")) {
                    const amount = Number(value);
                    if (!Number.isFinite(amount)) return "—";
                    const tone =
                        column.key.includes("descuento") || amount < 0
                            ? "text-error-primary"
                            : column.key.includes("pendiente")
                              ? "text-warning-primary"
                              : column.kind === "money"
                                ? "text-success-primary"
                                : "text-secondary";
                    return (
                        <span className={`whitespace-nowrap tabular-nums ${tone}`}>
                            {column.kind === "money" ? compensationMoney.format(amount) : `${number.format(amount)}${column.kind === "percent" ? "%" : ""}`}
                        </span>
                    );
                }
                return <NotasCell value={names[String(value)] ?? String(value)} />;
            },
        }));
