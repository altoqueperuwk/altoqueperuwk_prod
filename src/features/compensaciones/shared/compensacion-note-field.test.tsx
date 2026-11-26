import { useState } from "react";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CompensacionNoteField } from "./compensacion-note-field";

afterEach(cleanup);
const Example = ({ initial = "", disabled = false }) => {
    const [value, setValue] = useState(initial);
    return <CompensacionNoteField value={value} onChange={setValue} isDisabled={disabled} />;
};
const overflow = (input: HTMLElement) => {
    Object.defineProperty(input, "clientWidth", { configurable: true, value: 120 });
    Object.defineProperty(input, "scrollWidth", { configurable: true, value: 240 });
};

describe("Nota compacta", () => {
    it("abre al desbordar y conserva las ediciones al volver sin reabrirse", async () => {
        render(<Example />);
        const field = screen.getByRole("textbox", { name: /Notas/ }) as HTMLInputElement;
        overflow(field);
        fireEvent.change(field, { target: { value: "Nota que supera el ancho disponible" } });
        const dialog = await screen.findByRole("dialog", { name: "Editar nota" });
        const editor = within(dialog).getByRole("textbox", { name: /Notas/ });
        fireEvent.change(editor, { target: { value: "Nota ampliada\nSegunda línea" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Volver al formulario" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(field.value).toBe("Nota ampliada Segunda línea");
        expect(field.readOnly).toBe(true); // Paragraphs are edited only in the expanded editor to preserve line breaks.
        fireEvent.click(screen.getByRole("button", { name: "Ampliar nota" }));
        expect((await screen.findByRole("dialog")).textContent).toContain("Editar nota");
        expect((screen.getByRole("textbox", { name: /Notas/ }) as HTMLTextAreaElement).value).toBe("Nota ampliada\nSegunda línea");
    });
    it("no abre automáticamente al montar una nota existente ni al escribir una corta", () => {
        render(<Example initial="Nota existente" />);
        expect(screen.queryByRole("dialog")).toBeNull();
        fireEvent.change(screen.getByRole("textbox", { name: /Notas/ }), { target: { value: "Corta" } });
        expect(screen.queryByRole("dialog")).toBeNull();
    });
    it("permite ampliar manualmente y cierra con Escape conservando el texto", async () => {
        render(<Example initial="Original" />);
        fireEvent.click(screen.getByRole("button", { name: "Ampliar nota" }));
        const dialog = await screen.findByRole("dialog");
        const editor = within(dialog).getByRole("textbox", { name: /Notas/ });
        fireEvent.change(editor, { target: { value: "Modificada" } });
        fireEvent.keyDown(editor, { key: "Escape", code: "Escape" });
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect((screen.getByRole("textbox", { name: /Notas/ }) as HTMLInputElement).value).toBe("Modificada");
    });
    it("respeta permisos y longitud máxima", () => {
        render(<Example disabled />);
        expect((screen.getByRole("textbox", { name: /Notas/ }) as HTMLInputElement).disabled).toBe(true);
        expect((screen.getByRole("textbox", { name: /Notas/ }) as HTMLInputElement).maxLength).toBe(2000);
        expect((screen.getByRole("button", { name: "Ampliar nota" }) as HTMLButtonElement).disabled).toBe(true);
    });
    it("amplía un párrafo pegado y volver no envía el formulario", async () => {
        const submit = vi.fn((event) => event.preventDefault());
        render(
            <form onSubmit={submit}>
                <Example />
            </form>,
        );
        fireEvent.paste(screen.getByRole("textbox", { name: /Notas/ }), {
            clipboardData: { getData: () => "Primera línea\nSegunda línea" },
        });
        const dialog = await screen.findByRole("dialog");
        expect((within(dialog).getByRole("textbox", { name: /Notas/ }) as HTMLTextAreaElement).value).toBe("Primera línea\nSegunda línea");
        fireEvent.click(within(dialog).getByRole("button", { name: "Volver al formulario" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(submit).not.toHaveBeenCalled();
    });
});
