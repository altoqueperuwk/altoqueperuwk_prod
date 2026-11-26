import type { ReactNode } from "react";
import { Badge } from "@/components/base/badges/badges";

/** Estándar de Compensaciones: verde = terminado bien, ámbar = falta algo, rojo = terminó mal, gris = dato neutro. */
export type StatusTone = "success" | "warning" | "error" | "gray";

export const StatusBadge = ({ tone = "gray", children }: { tone?: StatusTone; children: ReactNode }) => (
    <Badge type="color" size="sm" color={tone} className="font-normal whitespace-nowrap">
        {children}
    </Badge>
);
