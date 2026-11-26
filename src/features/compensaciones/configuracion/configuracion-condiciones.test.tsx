import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ConfiguracionCondiciones } from "./configuracion-condiciones";
import type { PenalidadTipo, PlanVersion, Regla } from "./configuracion.types";

const version = { id: 1 } as PlanVersion;
const rule = { idPlanVersion: 1, estado: "ACTIVO", configuracion: { vistas_minimas: 10000, reacciones_minimas: 500, comentarios_minimos: 5 } };
const penalty = (codigo: string, montoReferencia: number, montoBono: number | null = null) =>
    ({ idPlanVersion: 1, estado: "ACTIVO", codigo, montoReferencia, montoBono }) as PenalidadTipo;
afterEach(cleanup);

describe("Condiciones de cálculo", () => {
    it("toma los valores configurados y no ofrece campos para editarlos", () => {
        render(
            <ConfiguracionCondiciones
                version={version}
                rules={[rule as unknown as Regla]}
                penalties={[penalty("PAG_X_ERROR_PAGO_CRITICO", 40), penalty("ATC_ERROR_DATOS", 2, 1)]}
            />,
        );
        expect(screen.getByText("10,000 vistas, 500 reacciones y 5 comentarios")).toBeTruthy();
        expect(screen.getByText("Mínimo S/ 40.00")).toBeTruthy();
        expect(screen.getByText("S/ 1.00")).toBeTruthy();
        expect(screen.queryByRole("spinbutton")).toBeNull();
    });
    it("no inventa valores cuando faltan o están desactivados", () => {
        render(<ConfiguracionCondiciones version={version} rules={[{ ...rule, estado: "INACTIVO" } as unknown as Regla]} penalties={[]} />);
        expect(screen.getAllByText("Sin configurar")).toHaveLength(3);
    });
});
