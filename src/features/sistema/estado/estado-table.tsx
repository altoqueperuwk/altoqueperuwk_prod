// @ts-nocheck
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Button } from "@/components/base/buttons/button";
import { ChevronLeft, ChevronRight, Edit03, ClockRewind } from "@untitledui/icons";

interface EstadoTableProps {
  data: Record<string, unknown>[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onEdit: (item: Record<string, unknown>) => void;
  onHistory: (id: number) => void;
}

export const EstadoTable = ({
  data,
  isLoading,
  page,
  totalPages,
  onPageChange,
  onEdit,
  onHistory,
}: EstadoTableProps) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-tertiary">Cargando...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState size="md">
        <EmptyState.Header>
          <EmptyState.FeaturedIcon color="gray" />
        </EmptyState.Header>
        <EmptyState.Content>
          <EmptyState.Title>No hay estados</EmptyState.Title>
          <EmptyState.Description>
            No se encontraron estados registrados.
          </EmptyState.Description>
        </EmptyState.Content>
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border border-secondary">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-secondary bg-secondary">
            <tr>
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">ID</th>
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Nombre</th>
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {data.map((row) => (
              <tr key={row.id as number} className="transition duration-100 ease-linear hover:bg-primary_hover">
                <td className="px-4 py-3 text-primary">{(row.id as number) ?? "-"}</td>
                <td className="px-4 py-3 text-primary">{(row.nombre as string) ?? "-"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button
                      size="xs"
                      color="tertiary"
                      iconLeading={Edit03}
                      onClick={() => onEdit(row)}
                    />
                    <Button
                      size="xs"
                      color="tertiary"
                      iconLeading={ClockRewind}
                      onClick={() => onHistory(row.id as number)}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-tertiary">
            Página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              color="secondary"
              iconLeading={ChevronLeft}
              isDisabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            />
            <Button
              size="sm"
              color="secondary"
              iconLeading={ChevronRight}
              isDisabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
