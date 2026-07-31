// @ts-nocheck
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { ChevronLeft, ChevronRight, Edit03, Check, ClockRewind } from "@untitledui/icons";
import { getCoreEstadoItems } from "@/utils/estado-options";

interface SucursalTableProps {
  data: Record<string, unknown>[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  estados: Record<string, unknown>[] | null;
  onPageChange: (page: number) => void;
  onEdit: (item: Record<string, unknown>) => void;
  onSaveEstado: (id: number, idEstado: number) => void;
  onHistory: (id: number) => void;
}

export const SucursalTable = ({
  data,
  isLoading,
  page,
  totalPages,
  estados,
  onPageChange,
  onEdit,
  onSaveEstado,
  onHistory,
}: SucursalTableProps) => {
  const [editingRows, setEditingRows] = useState<Record<number, number>>({});

  const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);

  const getEstadoNombre = (idEstado: unknown) => {
    if (idEstado == null) return "-";
    const estado = (estados || []).find((e) => e.id === idEstado);
    return (estado?.nombre as string) ?? "-";
  };

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
          <EmptyState.Title>No hay sucursales</EmptyState.Title>
          <EmptyState.Description>
            No se encontraron sucursales registradas.
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
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Dirección</th>
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Celular</th>
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Email</th>
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Estado</th>
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {data.map((row) => {
              const rowId = row.id as number;
              const currentIdEstado = editingRows[rowId] ?? (row.id_estado as number);

              return (
                <tr key={rowId} className="transition duration-100 ease-linear hover:bg-primary_hover">
                  <td className="px-4 py-3 text-primary">{rowId ?? "-"}</td>
                  <td className="px-4 py-3 text-primary">{(row.nombre as string) ?? "-"}</td>
                  <td className="px-4 py-3 text-primary">{(row.direccion as string) ?? "-"}</td>
                  <td className="px-4 py-3 text-primary">{(row.celular as string) ?? "-"}</td>
                  <td className="px-4 py-3 text-primary">{(row.email as string) ?? "-"}</td>
                  <td className="px-4 py-3">
                    <Select
                      size="sm"
                      placeholder={getEstadoNombre(row.id_estado)}
                      items={estadoItems}
                      selectedKey={currentIdEstado}
                      onSelectionChange={(key) =>
                        setEditingRows((prev) => ({ ...prev, [rowId]: key as number }))
                      }
                    >
                      {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                  </td>
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
                        iconLeading={Check}
                        isDisabled={!editingRows[rowId]}
                        onClick={() => {
                          if (editingRows[rowId]) {
                            onSaveEstado(rowId, editingRows[rowId]);
                            setEditingRows((prev) => {
                              const next = { ...prev };
                              delete next[rowId];
                              return next;
                            });
                          }
                        }}
                      />
                      <Button
                        size="xs"
                        color="tertiary"
                        iconLeading={ClockRewind}
                        onClick={() => onHistory(rowId)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
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
