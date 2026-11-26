import type { CatalogItem } from "./colaboradores.types";

// Preserve an existing assignment; never pick a fictitious plan by list position.
export const planOperativoId = (plans: CatalogItem[], currentId = 0): number =>
    currentId > 0 ? currentId : (plans.find((plan) => plan.codigo === "PLAN_COMPENSACIONES_GENERAL")?.id ?? 0);
