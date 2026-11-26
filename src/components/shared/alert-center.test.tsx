import { type HTMLAttributes, type ReactNode, useEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertMessage, AlertProvider, useAlert, withAlertProvider } from "./alert-center";
import { type AlertTone, ValidationAlert } from "./validation-alert";

vi.mock("@/providers/toast-provider", () => ({ useToast: () => ({ addToast: vi.fn() }) }));

vi.mock("motion/react", () => ({
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
    motion: {
        div: ({
            initial: _initial,
            animate: _animate,
            exit: _exit,
            transition: _transition,
            ...props
        }: HTMLAttributes<HTMLDivElement> & {
            initial?: unknown;
            animate?: unknown;
            exit?: unknown;
            transition?: unknown;
        }) => <div {...props} />,
    },
}));

const Controls = () => {
    const notify = useAlert();
    return (
        <>
            <button onClick={() => notify("notice", "Hay una revisión pendiente.")}>Aviso</button>
            <button onClick={() => notify("error", "No se pudo consultar.")}>Error</button>
            <button onClick={() => notify("error", "")}>Error vacío</button>
            <button onClick={() => notify("validation", "Completa el documento.")}>Validar</button>
            <button onClick={() => notify("success", "Registro guardado.")}>Guardar</button>
            <button onClick={() => notify("info", null)}>Cerrar actual</button>
        </>
    );
};

describe("Centro de avisos", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it.each<[AlertTone, string, "alert" | "status", number]>([
        ["error", "Error", "alert", 8000],
        ["validation", "Revisa los datos", "alert", 8000],
        ["notice", "Aviso", "status", 6000],
        ["success", "Listo", "status", 3000],
        ["info", "Dato", "status", 5000],
    ])("conserva título, rol y autocierre de %s", (tone, title, role, duration) => {
        const onClose = vi.fn();
        render(<ValidationAlert tone={tone} items={["Mensaje de prueba."]} onClose={onClose} />);
        expect(screen.getByRole(role)).toHaveTextContent(title);
        act(() => vi.advanceTimersByTime(duration - 1));
        expect(onClose).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(1));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("no pierde avisos: prioriza errores y luego validaciones, sin duplicarlos", () => {
        render(
            <AlertProvider>
                <Controls />
            </AlertProvider>,
        );
        fireEvent.click(screen.getByRole("button", { name: /^Aviso$/ }));
        fireEvent.click(screen.getByRole("button", { name: "Validar" }));
        fireEvent.click(screen.getByRole("button", { name: /^Error$/ }));
        fireEvent.click(screen.getByRole("button", { name: /^Error$/ }));
        expect(screen.getByRole("alert")).toHaveTextContent("No se pudo consultar.");
        fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
        expect(screen.getByRole("alert")).toHaveTextContent("Completa el documento.");
        fireEvent.click(screen.getByRole("button", { name: "Cerrar actual" }));
        expect(screen.getByRole("status")).toHaveTextContent("Hay una revisión pendiente.");
        act(() => vi.advanceTimersByTime(6000));
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("no reinicia el temporizador al cambiar arrays y callbacks equivalentes", () => {
        const first = vi.fn(),
            latest = vi.fn();
        const view = render(<ValidationAlert tone="success" items={["Guardado."]} onClose={first} />);
        act(() => vi.advanceTimersByTime(2000));
        view.rerender(<ValidationAlert tone="success" items={["Guardado."]} onClose={latest} />);
        act(() => vi.advanceTimersByTime(1000));
        expect(first).not.toHaveBeenCalled();
        expect(latest).toHaveBeenCalledOnce();
    });

    it("presenta varios problemas como texto corrido, sin lista", () => {
        render(<ValidationAlert items={["Completa el documento", "Revisa la fecha."]} onClose={vi.fn()} />);
        expect(screen.getByRole("alert")).toHaveTextContent("Completa el documento, Revisa la fecha.");
        expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });

    it("los mensajes declarativos usan el centro de su página", () => {
        const Page = withAlertProvider(() => <AlertMessage tone="error">No se pudo consultar.</AlertMessage>);
        const view = render(<Page />);
        expect(screen.getAllByRole("alert")).toHaveLength(1);
        view.rerender(<Page />);
        fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("un formulario aislado también muestra el mismo aviso y permite cerrarlo", () => {
        render(<AlertMessage tone="validation">Revisa el documento.</AlertMessage>);
        expect(screen.getByRole("alert")).toHaveTextContent("Revisa los datos");
        fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("mantiene notify estable aunque cambie el fallback de una pantalla sin migrar", () => {
        const onRead = vi.fn();
        const Probe = ({ version }: { version: number }) => {
            const notify = useAlert();
            useEffect(() => {
                onRead();
            }, [notify]);
            return <span>{version}</span>;
        };
        const view = render(
            <AlertProvider>
                <Probe version={1} />
            </AlertProvider>,
        );
        view.rerender(
            <AlertProvider>
                <Probe version={2} />
            </AlertProvider>,
        );
        expect(onRead).toHaveBeenCalledOnce();
    });

    it("retira un error resuelto sin eliminar otros avisos pendientes", () => {
        const view = render(
            <AlertProvider>
                <AlertMessage>No se pudo consultar.</AlertMessage>
                <Controls />
            </AlertProvider>,
        );
        fireEvent.click(screen.getByRole("button", { name: /^Aviso$/ }));
        expect(screen.getByRole("alert")).toHaveTextContent("No se pudo consultar.");
        view.rerender(
            <AlertProvider>
                <Controls />
            </AlertProvider>,
        );
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Hay una revisión pendiente.");
    });

    it("usa el mensaje genérico ante un error vacío y reserva null para cerrar", () => {
        render(
            <AlertProvider>
                <Controls />
            </AlertProvider>,
        );
        fireEvent.click(screen.getByRole("button", { name: "Error vacío" }));
        expect(screen.getByRole("alert")).toHaveTextContent("No se pudo completar la solicitud.");
        fireEvent.click(screen.getByRole("button", { name: "Cerrar actual" }));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("termina avisos en punto y los retira cuando se resuelve su causa", () => {
        const view = render(
            <AlertProvider>
                <AlertMessage tone="notice">Falta revisar el registro</AlertMessage>
            </AlertProvider>,
        );
        expect(screen.getByRole("status")).toHaveTextContent("Falta revisar el registro.");
        view.rerender(
            <AlertProvider>
                <Controls />
            </AlertProvider>,
        );
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
});
