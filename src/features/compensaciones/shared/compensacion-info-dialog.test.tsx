import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AlertCircle } from "@untitledui/icons";
import { afterEach, expect, it, vi } from "vitest";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { CaptacionInfoDialog } from "../atenciones/captacion-info-dialog";
import { CompensacionInfoDialog } from "./compensacion-info-dialog";

afterEach(cleanup);

it("abre la ayuda existente y cierra con X sin consultas ni mutaciones", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    const Demo = () => {
        const [open, setOpen] = useState(false);
        return (
            <>
                <ButtonUtility icon={AlertCircle} tooltip="Información de Registro Nuevo" onClick={() => setOpen(true)} />
                {open && <CaptacionInfoDialog tiktok={false} onClose={() => setOpen(false)} />}
            </>
        );
    };
    try {
        render(<Demo />);
        fireEvent.click(screen.getByRole("button", { name: "Información de Registro Nuevo" }));
        const dialog = await screen.findByRole("dialog", { name: "Información de Registro Nuevo" });
        for (const text of ["Concepto", "Tipo", "Monto", "Observación", "S/ 0.70"]) expect(within(dialog).getByText(text)).toBeVisible();
        expect(within(dialog).getAllByRole("button", { name: "Cerrar" })).toHaveLength(1);
        expect(dialog.contains(document.activeElement)).toBe(true);
        fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(request).not.toHaveBeenCalled();
    } finally {
        request.mockRestore();
    }
});

it("Escape cierra el diálogo y no inventa un monto ausente", async () => {
    const close = vi.fn();
    render(
        <CompensacionInfoDialog
            title="Información de prueba"
            resumen={[{ concepto: "Concepto de prueba", tipo: { label: "Bono (+)", tone: "success" }, observacion: "El servidor confirma las condiciones." }]}
            pasos={["Registras el hecho.", "Administración decide."]}
            onClose={close}
        />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Información de prueba" });
    expect(within(dialog).queryByText("Monto")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    fireEvent.keyDown(document.activeElement!, { key: "Escape", code: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
});
