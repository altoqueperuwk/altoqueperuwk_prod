// @ts-nocheck
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { ChevronLeft, ChevronRight, Edit03, Save01, ClockRewind } from "@untitledui/icons";

interface ReglasEfectivizacionTableProps {
  data: Record<string, unknown>[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  estados: Record<string, unknown>[] | null;
  onPageChange: (page: number) => void;
  onEdit: (item: Record<string, unknown>) => void;
  onSaveRow: (id: number, fields: Record<string, unknown>) => Promise<void>;
  onHistory: (id: number) => void;
}

interface RowDraft {
  comision_servicio: string;
  comision_minima_servicio: string;
  monto_minimo_deposito_servicio: string;
  id_estado: number;
}

export const ReglasEfectivizacionTable = ({
  data,
  isLoading,
  page,
  totalPages,
  estados,
  onPageChange,
  onEdit,
  onSaveRow,
  onHistory,
}: ReglasEfectivizacionTableProps) => {
  const [editingRows, setEditingRows] = useState<Record<number, RowDraft>>({});

  const estadoItems = useMemo(
    () =>
      (estados || []).map((e) => ({
        id: e.id as string | number,
        label: e.nombre as string,
      })),
    [estados],
  );

  const getEstadoNombre = (idEstado: unknown) => {
    if (idEstado == null) return "-";
    const estado = (estados || []).find((e) => e.id === idEstado);
    return (estado?.nombre as string) ?? "-";
  };

  const getDraft = (row: Record<string, unknown>): RowDraft => {
    const rowId = row.id as number;
    return editingRows[rowId] ?? {
      comision_servicio: row.comision_servicio != null ? String(row.comision_servicio) : "",
      comision_minima_servicio: row.comision_minima_servicio != null ? String(row.comision_minima_servicio) : "",
      monto_minimo_deposito_servicio: row.monto_minimo_deposito_servicio != null ? String(row.monto_minimo_deposito_servicio) : "",
      id_estado: row.id_estado as number,
    };
  };

  const updateDraft = (rowId: number, field: keyof RowDraft, value: unknown) => {
    setEditingRows((prev) => ({
      ...prev,
      [rowId]: { ...(prev[rowId] ?? getDraft(data.find((r) => r.id === rowId) ?? {})), [field]: value },
    }));
  };

  const hasChanges = (row: Record<string, unknown>): boolean => {
    const draft = editingRows[row.id as number];
    if (!draft) return false;
    return (
      draft.comision_servicio !== (row.comision_servicio != null ? String(row.comision_servicio) : "") ||
      draft.comision_minima_servicio !== (row.comision_minima_servicio != null ? String(row.comision_minima_servicio) : "") ||
      draft.monto_minimo_deposito_servicio !== (row.monto_minimo_deposito_servicio != null ? String(row.monto_minimo_deposito_servicio) : "") ||
      draft.id_estado !== (row.id_estado as number)
    );
  };

  const handleSave = async (row: Record<string, unknown>) => {
    const rowId = row.id as number;
    const draft = editingRows[rowId];
    if (!draft) return;

    const params: Record<string, unknown> = {};

    if (draft.comision_servicio !== (row.comision_servicio != null ? String(row.comision_servicio) : "")) {
      const val = draft.comision_servicio.trim();
      params.p_comision_servicio = val === "" ? null : Number(val);
    }
    if (draft.comision_minima_servicio !== (row.comision_minima_servicio != null ? String(row.comision_minima_servicio) : "")) {
      const val = draft.comision_minima_servicio.trim();
      params.p_comision_minima_servicio = val === "" ? null : Number(val);
    }
    if (draft.monto_minimo_deposito_servicio !== (row.monto_minimo_deposito_servicio != null ? String(row.monto_minimo_deposito_servicio) : "")) {
      const val = draft.monto_minimo_deposito_servicio.trim();
      params.p_monto_minimo_deposito_servicio = val === "" ? null : Number(val);
    }
    if (draft.id_estado !== (row.id_estado as number)) {
      params.p_id_estado = draft.id_estado;
    }

    if (Object.keys(params).length === 0) return;

    await onSaveRow(rowId, params);
    setEditingRows((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
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
          <EmptyState.Title>No hay reglas de efectivización</EmptyState.Title>
          <EmptyState.Description>
            No se encontraron reglas de efectivización registradas.
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
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Servicio</th>
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Banco</th>
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Comunidad</th>
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Tipo Depósito</th>
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Comisión %</th>
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Comisión Mín. S/</th>
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Monto Mín. Dep. S/</th>
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Estado</th>
              <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {data.map((row) => {
              const rowId = row.id as number;
              const draft = getDraft(row);
              const changed = hasChanges(row);

              return (
                <tr key={rowId} className="transition duration-100 ease-linear hover:bg-primary_hover">
                  <td className="px-4 py-3 text-primary">{rowId ?? "-"}</td>
                  <td className="px-4 py-3 text-primary">{(row.codigo_servicio_nombre as string) ?? "-"}</td>
                  <td className="px-4 py-3 text-primary">{(row.banco_nombre as string) ?? "-"}</td>
                  <td className="px-4 py-3 text-primary">{(row.comunidad_nombre as string) ?? "-"}</td>
                  <td className="px-4 py-3 text-primary">{row.tipo_deposito != null ? String(row.tipo_deposito) : "-"}</td>
                  <td className="px-4 py-3 w-28">
                    <Input size="sm" type="number" placeholder="% 0.0" className="w-full"
                      value={draft.comision_servicio}
                      onChange={(v) => updateDraft(rowId, "comision_servicio", v)} />
                  </td>
                  <td className="px-4 py-3 w-36">
                    <Input size="sm" type="number" placeholder="S/ 0.00" className="w-full"
                      value={draft.comision_minima_servicio}
                      onChange={(v) => updateDraft(rowId, "comision_minima_servicio", v)} />
                  </td>
                  <td className="px-4 py-3 w-40">
                    <Input size="sm" type="number" placeholder="S/ 0.00" className="w-full"
                      value={draft.monto_minimo_deposito_servicio}
                      onChange={(v) => updateDraft(rowId, "monto_minimo_deposito_servicio", v)} />
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      size="sm"
                      placeholder={getEstadoNombre(row.id_estado)}
                      items={estadoItems}
                      selectedKey={draft.id_estado}
                      onSelectionChange={(key) => {
                        if (key !== null) updateDraft(rowId, "id_estado", Number(key));
                      }}
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
                        iconLeading={Save01}
                        isDisabled={!changed}
                        onClick={() => handleSave(row)}
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
