import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-provider";

type TestSession = { user: { id: string; email: string } } | null;
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn(), callback: null as null | ((event: string, session: TestSession) => void) }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc, auth: {
    getSession: mocks.session,
    onAuthStateChange: (callback: typeof mocks.callback) => { mocks.callback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; },
} } }));
const session = (id: string): TestSession => ({ user: { id, email: `${id}@example.test` } });
const pending = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const Probe = () => { const auth = useAuth(); return <>
    <output data-testid="profile">{auth.businessUser?.id ?? "Sin perfil"}</output>
    <output data-testid="busy">{String(auth.isBusinessUserLoading)}</output>
    <output data-testid="identity">{auth.user?.id}</output>
</>; };
beforeEach(() => { mocks.rpc.mockReset(); mocks.callback = null; mocks.session.mockResolvedValue({ data: { session: session("first") } }); });
afterEach(cleanup);

describe("Identidad operativa de sesión", () => {
    it("deduplica carga inicial y no borra perfil al renovar la misma sesión", async () => {
        const query = pending<{ data: { id: string }[]; error: null }>();
        mocks.rpc.mockReturnValue(query.promise);
        render(<AuthProvider><Probe /></AuthProvider>);
        await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
        await act(async () => { mocks.callback?.("INITIAL_SESSION", session("first")); });
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
        await act(async () => { query.resolve({ data: [{ id: "profile-first" }], error: null }); });
        expect(screen.getByTestId("profile")).toHaveTextContent("profile-first");
        await act(async () => { mocks.callback?.("SIGNED_IN", session("first")); mocks.callback?.("TOKEN_REFRESHED", session("first")); });
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("profile")).toHaveTextContent("profile-first");
        expect(screen.getByTestId("busy")).toHaveTextContent("false");
    });

    it("descarta un perfil atrasado después de cambiar de cuenta", async () => {
        const old = pending<{ data: { id: string }[]; error: null }>();
        mocks.rpc.mockImplementation((_name: string, params: { p_email: string }) => params.p_email === "first@example.test"
            ? old.promise : Promise.resolve({ data: [{ id: "profile-second" }], error: null }));
        render(<AuthProvider><Probe /></AuthProvider>);
        await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
        await act(async () => { mocks.callback?.("SIGNED_IN", session("second")); });
        await waitFor(() => expect(screen.getByTestId("profile")).toHaveTextContent("profile-second"));
        await act(async () => { old.resolve({ data: [{ id: "profile-first" }], error: null }); });
        expect(screen.getByTestId("profile")).toHaveTextContent("profile-second");
        expect(screen.getByTestId("identity")).toHaveTextContent("second");
    });

    it("una actualización explícita vuelve a verificar el perfil", async () => {
        mocks.rpc.mockResolvedValue({ data: [{ id: "profile-first" }], error: null });
        render(<AuthProvider><Probe /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId("profile")).toHaveTextContent("profile-first"));
        await act(async () => { mocks.callback?.("USER_UPDATED", session("first")); });
        expect(mocks.rpc).toHaveBeenCalledTimes(2);
    });
});
