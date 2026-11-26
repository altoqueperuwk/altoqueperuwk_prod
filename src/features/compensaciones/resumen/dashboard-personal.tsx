import { LayoutGrid01 } from "@untitledui/icons";
import { useSearchParams } from "react-router";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { BonosDescuentosContent } from "../bonos-descuentos/bonos-descuentos-page";
import { compensationWorkspaceHref } from "../shared/compensacion-destinos";

export const DashboardPersonal = () => {
    const [params] = useSearchParams();
    return (
        <AppLayout>
            <div className="space-y-4">
                <BonosDescuentosContent
                    dashboard
                    conceptoUrl={params.get("concepto") ?? ""}
                    headingActions={
                        <div className="flex flex-wrap gap-2">
                            <Button href={compensationWorkspaceHref} size="sm" color="primary" iconLeading={LayoutGrid01}>
                                Centro de Trabajo
                            </Button>
                        </div>
                    }
                />
            </div>
        </AppLayout>
    );
};
