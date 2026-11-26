import { Fragment, type ReactElement, type ReactNode, StrictMode, useCallback } from "react";
import { type RenderOptions, render as baseRender } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import { AlertProvider } from "@/components/shared/alert-center";
import type { AlertTone } from "@/components/shared/validation-alert";
import { ToastProvider } from "@/providers/toast-provider";

/** Observa la API nueva y ejecuta el centro real; no sustituye su presentación por un toast. */
const observedAlerts = vi.hoisted(() => ({ notify: vi.fn() }));
export const alertSpy = observedAlerts.notify;

vi.mock("@/components/shared/alert-center", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/components/shared/alert-center")>();
    return {
        ...actual,
        useAlert: () => {
            const notify = actual.useAlert();
            return useCallback(
                (tone: AlertTone, text: string | null) => {
                    alertSpy(tone, text);
                    notify(tone, text);
                },
                [notify],
            );
        },
    };
});

beforeEach(() => alertSpy.mockClear());

/** Los formularios aislados necesitan el mismo proveedor que sus páginas; se conserva en rerender. */
export const renderWithAlerts = (ui: ReactElement, options?: RenderOptions) => {
    const Wrapper = options?.wrapper ?? Fragment;
    return baseRender(ui, {
        ...options,
        reactStrictMode: options?.reactStrictMode ?? ui.type === StrictMode,
        wrapper: ({ children }: { children: ReactNode }) => (
            <ToastProvider>
                <AlertProvider>
                    <Wrapper>{children}</Wrapper>
                </AlertProvider>
            </ToastProvider>
        ),
    });
};
