import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ColaboradorCard } from "./colaborador-card";
import type { Colaborador } from "./colaboradores.types";

const collaborator = (): Colaborador => ({
    id: 1,
    idUsuario: 2,
    nombreCompleto: "Persona Beta",
    nombres: "Persona",
    apellidoPaterno: "Beta",
    apellidoMaterno: "",
    tipoDocumento: "DNI",
    numeroDocumento: "12345678",
    usuarioNombre: "Persona",
    usuarioUsername: "beta",
    email: "",
    celular: "",
    codigoHuellero: "",
    fechaIngreso: "2026-09-01",
    fechaCese: null,
    motivoCese: "",
    idEstado: 1,
    estadoNombre: "Activo",
    asignacion: null,
    ficha: {
        permisos: { puedeVerFicha: true, puedeEditarFicha: true },
    },
});
afterEach(cleanup);
const show = (item = collaborator()) => render(<ColaboradorCard item={item} onDetail={vi.fn()} onEdit={vi.fn()} />);

describe("Tarjeta laboral", () => {
    it("muestra solo el username del usuario vinculado", () => {
        show();
        expect(screen.getByText("beta", { exact: true })).toBeTruthy();
        expect(screen.queryByText("Persona @beta", { exact: true })).toBeNull();
    });
    it("indica cuando no hay username vinculado", () => {
        const item = collaborator();
        item.usuarioUsername = "";
        show(item);
        expect(screen.getByText("Sin vínculo")).toBeTruthy();
    });
    it("presenta solo la información laboral, sin sueldo, jornada ni cuentas", () => {
        show();
        expect(screen.getByRole("heading", { name: "Información laboral" })).toBeTruthy();
        for (const label of ["Compensación", "Jornada", "Cuentas para depósito"]) expect(screen.queryByRole("heading", { name: label })).toBeNull();
    });
    it("muestra una sola entrada a la ficha editable", () => {
        const onDetail = vi.fn(),
            onEdit = vi.fn();
        render(<ColaboradorCard item={collaborator()} onDetail={onDetail} onEdit={onEdit} />);
        expect(screen.queryByRole("button", { name: "Ver ficha" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Editar colaborador" }));
        expect(onDetail).not.toHaveBeenCalled();
        expect(onEdit).toHaveBeenCalledTimes(1);
    });
});
