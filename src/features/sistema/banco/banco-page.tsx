// @ts-nocheck
import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { useToast } from "@/providers/toast-provider";
import { Edit03, ClockRewind } from "@untitledui/icons";
import { BadgeWithDot } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { FilterBar } from "@/components/shared/filter-bar";
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { bancoService } from "@/services/banco.service";
import { BancoPopup } from "./banco-popup";
import { BancoHistoryDrawer } from "./banco-history-drawer";

export const BancoPage = () => {
  const { addToast } = useToast();
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [filterNombre, setFilterNombre] = useState("");
  const [filterEstado, setFilterEstado] = useState<number>(0);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyItemId, setHistoryItemId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: Record<string, unknown> = {};
      if (filterNombre) filters.p_nombre = filterNombre;
      if (filterEstado) filters.p_id_estado = filterEstado;
      const result = await bancoService.getList(filters);
      setData(result);
      setTotalPages(Math.max(1, Math.ceil(result.length / pageSize)));
      if (page > Math.ceil(result.length / pageSize)) setPage(1);
    } catch { addToast("error", "Error al cargar los datos"); }
    finally { setIsLoading(false); }
  }, [filterNombre, filterEstado, page, pageSize, addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSearch = () => { setPage(1); loadData(); };
  const handleClear = () => { setFilterNombre(""); setFilterEstado(0); setPage(1); };
  const handleNew = () => { setSelectedItem(null); setIsPopupOpen(true); };
  const handleEdit = (item: Record<string, unknown>) => { setSelectedItem(item); setIsPopupOpen(true); };
  const handlePopupClose = () => { setIsPopupOpen(false); setSelectedItem(null); };
  const handlePopupSave = () => { handlePopupClose(); loadData(); };
  const handleSaveEstado = async (rowId: number, newIdEstado: number) => {
    await bancoService.update(rowId, { p_id_estado: newIdEstado });
    loadData();
  };
  const handleHistory = (id: number) => { setHistoryItemId(id); setIsHistoryOpen(true); };
  const handleHistoryClose = () => { setIsHistoryOpen(false); setHistoryItemId(null); };
  const handlePageSizeChange = (size: number) => { setPageSize(size); setPage(1); };
  const paginatedData = data.slice((page - 1) * pageSize, page * pageSize);

  const columns: ColumnDef[] = [
    { key: "nombre", header: "Nombre" },
    { key: "nombre_abreviatura", header: "Abreviatura" },
    { key: "tipo", header: "Tipo" },
    { key: "nombre_equivalencia", header: "Equivalencias", render: (value: unknown) => {
      const eqs = Array.isArray(value) ? value as string[] : [];
      if (eqs.length === 0) return <span className="text-quaternary">—</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {eqs.map((eq, i) => (
            <BadgeWithDot key={i} color="brand" size="sm" type="color">{eq}</BadgeWithDot>
          ))}
        </div>
      );
    }},
    { key: "flag_permite_deposito", header: "Depósito", render: (value: unknown) => (
      <BadgeWithDot color={value ? "success" : "gray"} size="sm" type="pill-color">
        {value ? "Sí" : "No"}
      </BadgeWithDot>
    )},
  ];

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <FilterBar title="Bancos" filterNombre={filterNombre} onFilterNombreChange={setFilterNombre}
          filterEstado={filterEstado} onFilterEstadoChange={setFilterEstado}
          onSearch={handleSearch} onClear={handleClear} onNew={handleNew}
        />
        <DataTable columns={columns} data={paginatedData} isLoading={isLoading}
          page={page} totalPages={totalPages} onPageChange={setPage}
          pageSize={pageSize}           onPageSizeChange={handlePageSizeChange}
          inlineEstado={{
            idEstadoKey: "id_estado",
            onSave: handleSaveEstado,
          }}
          emptyMessage="No se encontraron bancos" emptyDescription="No hay bancos disponibles en este momento."
          renderActions={(row) => (
            <>
              <Button size="xs" color="tertiary" iconLeading={Edit03} onClick={() => handleEdit(row)} />
              <Button size="xs" color="tertiary" iconLeading={ClockRewind} onClick={() => handleHistory(row.id as number)} />
            </>
          )}
        />
        <BancoPopup isOpen={isPopupOpen} onClose={handlePopupClose} onSave={handlePopupSave} item={selectedItem} />
        <BancoHistoryDrawer isOpen={isHistoryOpen} onClose={handleHistoryClose} itemId={historyItemId} />
      </div>
    </AppLayout>
  );
};
