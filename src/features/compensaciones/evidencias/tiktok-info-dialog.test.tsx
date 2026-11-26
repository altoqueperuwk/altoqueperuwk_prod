import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CaptacionInfoDialog } from "../atenciones/captacion-info-dialog";

const perfil = vi.hoisted(() => ({ isAdvisor: false, isStoreManager: false, isAdministrator: false }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => perfil }));
afterEach(cleanup);

it.each([
    ["ATC", true, false, false, "S/ 0.70"],
    ["Jefe", false, true, false, "S/ 0.30"],
    ["Admin", false, false, true, "Según configuración vigente del beneficiario"],
] as const)("la ayuda LIVE informa la tarifa del perfil %s", (_role, advisor, manager, admin, amount) => {
    Object.assign(perfil, { isAdvisor: advisor, isStoreManager: manager, isAdministrator: admin });
    render(<CaptacionInfoDialog tiktok onClose={() => undefined} />);
    expect(screen.getByText(amount)).toBeVisible();
    if (manager) expect(screen.getByText(/solo a los clientes que tú registras/)).toBeVisible();
});
