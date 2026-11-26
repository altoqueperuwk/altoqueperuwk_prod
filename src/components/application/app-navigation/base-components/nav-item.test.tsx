import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NavItemBase } from "./nav-item";

afterEach(cleanup);
it("muestra bancos con icono estándar, sin punto ni color personalizado", () => {
    const Icon = (props: React.SVGProps<SVGSVGElement>) => <svg {...props} data-testid="bank-icon" />;
    render(
        <NavItemBase type="collapsible-child" href="/operaciones/bcp" icon={Icon}>
            BCP
        </NavItemBase>,
    );
    const link = screen.getByRole("link", { name: "BCP" });
    expect(screen.getByTestId("bank-icon")).toHaveClass("text-fg-quaternary");
    expect(screen.getByTestId("bank-icon")).not.toHaveAttribute("style");
    expect(link.style.getPropertyValue("--nav-accent")).toBe("");
    expect(link.querySelector("span[aria-hidden='true']")).toBeNull();
});
it("mantiene el icono y la tipografía del sistema en los enlaces secundarios", () => {
    const Icon = () => <svg data-testid="system-icon" />;
    render(
        <NavItemBase type="collapsible-child" href="/compensaciones/asistencia" icon={Icon} current>
            Asistencia
        </NavItemBase>,
    );
    const link = screen.getByRole("link", { name: "Asistencia" });
    expect(link).toContainElement(screen.getByTestId("system-icon"));
    expect(screen.getByText("Asistencia")).toHaveClass("text-sm", "font-semibold");
    expect(link).toHaveAttribute("aria-current", "page");
});
