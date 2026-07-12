// @ts-nocheck
import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { useToast } from "@/providers/toast-provider";
import { Edit03, ClockRewind } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { FilterBar } from "@/components/shared/filter-bar";
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { estadoService } from "@/services/estado.service";
import { EstadoPopup } from "./estado-popup";
import { EstadoHistoryDrawer } from "./estado-history-drawer";

export const EstadoPage = () => {
  const { addToast } = useToast();

  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);

  const [filterNombre, setFilterNombre] = useState("");

  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyItemId, setHistoryItemId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: Record<string, unknown> = {};
      if (filterNombre) filters.p_nombre = filterNombre;
      const result = await estadoService.getList(filters);
      setData(result);
      setTotalPages(Math.max(1, Math.ceil(result.length / pageSize)));
      if (page > Math.ceil(result.length / pageSize)) setPage(1);
    } catch {
      addToast("error", "Error al cargar los datos");
    } finally {
      setIsLoading(false);
    }
  }, [filterNombre, page, pageSize, addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSearch = () => { setPage(1); loadData(); };
  const handleClear = () => { setFilterNombre(""); setPage(1); };
  const handleNew = () => { setSelectedItem(null); setIsPopupOpen(true); };
  const handleEdit = (item: Record<string, unknown>) => { setSelectedItem(item); setIsPopupOpen(true); };
  const handlePopupClose = () => { setIsPopupOpen(false); setSelectedItem(null); };
  const handlePopupSave = () => { handlePopupClose(); loadData(); };
  const handleHistory = (id: number) => { setHistoryItemId(id); setIsHistoryOpen(true); };
  const handleHistoryClose = () => { setIsHistoryOpen(false); setHistoryItemId(null); };
  const handlePageSizeChange = (size: number) => { setPageSize(size); setPage(1); };

  const paginatedData = data.slice((page - 1) * pageSize, page * pageSize);

  const columns: ColumnDef[] = [
    { key: "nombre", header: "Nombre" },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <FilterBar
          title="Estados"
          filterNombre={filterNombre}
          onFilterNombreChange={setFilterNombre}
          hideEstadoFilter
          onSearch={handleSearch}
          onClear={handleClear}
          onNew={handleNew}
        />
        <DataTable
          columns={columns}
          data={paginatedData}
          isLoading={isLoading}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
          emptyMessage="No hay estados"
          emptyDescription="No se encontraron estados registrados."
          renderActions={(row) => (
            <>
              <Button size="xs" color="tertiary" iconLeading={Edit03} onClick={() => handleEdit(row)} />
              <Button size="xs" color="tertiary" iconLeading={ClockRewind} onClick={() => handleHistory(row.id as number)} />
            </>
          )}
        />
        <EstadoPopup isOpen={isPopupOpen} onClose={handlePopupClose} onSave={handlePopupSave} item={selectedItem} />
        <EstadoHistoryDrawer isOpen={isHistoryOpen} onClose={handleHistoryClose} itemId={historyItemId} />
      </div>
    </AppLayout>
  );
};
