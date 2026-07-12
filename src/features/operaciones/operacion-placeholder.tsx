import { AppLayout } from "@/components/application/app-layout";
import { EmptyState } from "@/components/application/empty-state/empty-state";

interface OperacionPlaceholderProps {
    title: string;
    description?: string;
}

export const OperacionPlaceholder = ({ title, description }: OperacionPlaceholderProps) => {
    return (
        <AppLayout>
            <div className="flex flex-col gap-6">
                <h1 className="text-xl font-semibold text-primary">{title}</h1>
                <div className="flex min-h-[400px] items-center justify-center rounded-xl border border-secondary bg-primary">
                    <EmptyState>
                        <EmptyState.FeaturedIcon color="gray" />
                        <EmptyState.Content>
                            <EmptyState.Title>{title}</EmptyState.Title>
                            <EmptyState.Description>
                                {description || "Módulo en desarrollo. Disponible próximamente."}
                            </EmptyState.Description>
                        </EmptyState.Content>
                    </EmptyState>
                </div>
            </div>
        </AppLayout>
    );
};
