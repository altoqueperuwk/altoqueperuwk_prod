// @ts-nocheck
import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { useToast } from "@/providers/toast-provider";
import { useSessionCache } from "@/providers/session-cache-provider";
import { Select } from "@/components/base/select/select";
import { FilterBar } from "@/components/shared/filter-bar";
import { reglasEfectivizacionService } from "@/services/reglas-efectivizacion.service";
import { ReglasEfectivizacionTable } from "./reglas-efectivizacion-table";
import { ReglasEfectivizacionPopup } from "./reglas-efectivizacion-popup";
import { ReglasEfectivizacionHistoryDrawer } from "./reglas-efectivizacion-history-drawer";
import { getCoreEstadoItems } from "@/utils/estado-options";

export const ReglasEfectivizacionPage = () => {
  const { addToast } = useToast();
  const { estados, codigosServicio, comunidades } = useSessionCache();
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [filterNombre, setFilterNombre] = useState("");
  const [filterEstado, setFilterEstado] = useState<number>(0);
  const [filterIdServicio, setFilterIdServicio] = useState<number>(0);
  const [filterIdComunidad, setFilterIdComunidad] = useState<number>(0);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyItemId, setHistoryItemId] = useState<number | null>(null);

  const estadoItems = [
    { id: 0, label: "Todos" },
    ...getCoreEstadoItems(estados),
  ];
  const servicioItems = [
    { id: 0, label: "Todos" },
    ...(codigosServicio || []).map((s) => ({
      id: s.id as number,
      label: s.nombre as string,
    })),
  ];
  const comunidadItems = [
    { id: 0, label: "Todos" },
    ...(comunidades || []).map((c) => ({
      id: c.id as number,
      label: c.nombre as string,
    })),
  ];

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: Record<string, unknown> = {};
      if (filterNombre) filters.p_nombre = filterNombre;
      if (filterEstado) filters.p_id_estado = filterEstado;
      if (filterIdServicio) filters.p_id_codigo_servicio = filterIdServicio;
      if (filterIdComunidad) filters.p_id_comunidad = filterIdComunidad;
      const result = await reglasEfectivizacionService.getList(filters);
      setData(result);
      setTotalPages(Math.max(1, Math.ceil(result.length / pageSize)));
      if (page > Math.ceil(result.length / pageSize)) setPage(1);
    } catch { addToast("error", "Error al cargar los datos"); }
    finally { setIsLoading(false); }
  }, [filterNombre, filterEstado, filterIdServicio, filterIdComunidad, page, pageSize, addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSearch = () => { setPage(1); loadData(); };
  const handleClear = () => { setFilterNombre(""); setFilterEstado(0); setFilterIdServicio(0); setFilterIdComunidad(0); setPage(1); };
  const handleNew = () => { setSelectedItem(null); setIsPopupOpen(true); };
  const handleEdit = (item: Record<string, unknown>) => { setSelectedItem(item); setIsPopupOpen(true); };
  const handlePopupClose = () => { setIsPopupOpen(false); setSelectedItem(null); };
  const handlePopupSave = () => { handlePopupClose(); loadData(); };
  const handleSaveRow = async (id: number, fields: Record<string, unknown>) => {
    await reglasEfectivizacionService.update(id, fields);
    loadData();
  };
  const handleHistory = (id: number) => { setHistoryItemId(id); setIsHistoryOpen(true); };
  const handleHistoryClose = () => { setIsHistoryOpen(false); setHistoryItemId(null); };
  const handlePageSizeChange = (size: number) => { setPageSize(size); setPage(1); };
  const paginatedData = data.slice((page - 1) * pageSize, page * pageSize);

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <FilterBar title="Reglas de Efectivización" filterNombre={filterNombre} onFilterNombreChange={setFilterNombre}
          hideEstadoFilter onSearch={handleSearch} onClear={handleClear} onNew={handleNew}
          extraFilters={
            <>
              <div className="w-52">
                <Select label="Servicio" size="sm"
                  items={servicioItems}
                  selectedKey={filterIdServicio}
                  onSelectionChange={(key) => setFilterIdServicio(key !== null ? Number(key) : 0)}
                >
                  {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
              </div>
              <div className="w-52">
                <Select label="Comunidad" size="sm"
                  items={comunidadItems}
                  selectedKey={filterIdComunidad}
                  onSelectionChange={(key) => setFilterIdComunidad(key !== null ? Number(key) : 0)}
                >
                  {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
              </div>
              <div className="w-44">
                <Select label="Estado" size="sm"
                  items={estadoItems}
                  selectedKey={filterEstado}
                  onSelectionChange={(key) => setFilterEstado(key !== null ? Number(key) : 0)}
                >
                  {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
              </div>
            </>
          }
        />
        <ReglasEfectivizacionTable
          data={paginatedData}
          isLoading={isLoading}
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          estados={estados}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
          onEdit={handleEdit}
          onSaveRow={handleSaveRow}
          onHistory={handleHistory}
        />
        <ReglasEfectivizacionPopup isOpen={isPopupOpen} onClose={handlePopupClose} onSave={handlePopupSave} item={selectedItem} />
        <ReglasEfectivizacionHistoryDrawer isOpen={isHistoryOpen} onClose={handleHistoryClose} itemId={historyItemId} />
      </div>
    </AppLayout>
  );
};
