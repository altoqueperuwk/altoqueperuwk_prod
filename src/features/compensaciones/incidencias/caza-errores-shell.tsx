import type { ReactNode } from "react";
import { CompensacionPanel } from "../shared/compensacion-panel";

export const CazaErroresShell = ({ children }: { children: ReactNode }) => (
    <section aria-label="Registrar hallazgo" className="min-w-0">
        <CompensacionPanel title="Registrar Hallazgo">{children}</CompensacionPanel>
    </section>
);
