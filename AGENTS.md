# AGENTS.md — Al Toque Peru

## Backend

### Regla 1 — DROP FUNCTION después de modificar SQL

Cada vez que se modifique una función SQL en `backend_implementacion/`, incluir al final del archivo:

```sql
SELECT 'DROP FUNCTION IF EXISTS ' ||
       n.nspname || '.' ||
       p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ');' AS drop_statement
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('f_xxx', 'f_yyy')
ORDER BY n.nspname, p.proname;
```

Usar `IN (...)` solo con las funciones realmente afectadas.

### Regla 2 — Resumen de cambios al actualizar .sql

Al finalizar cambios en archivos `.sql`, entregar resumen con este formato exacto:

```
[nombre_archivo1.sql](ruta/al/archivo1.sql)
- nombre_funcion_1
- nombre_funcion_2
Resumen corto informando cambios de cada función. Si hay ALTER TABLE, DROP COLUMN, DROP FUNCTION, etc., mencionarlo.

[nombre_archivo2.sql](ruta/al/archivo2.sql)
- nombre_funcion_1
Resumen corto informando cambios.
```

Ejemplo:

```
[11.operaciones_asistidas_pos_linkpago.sql](backend/backend_implementacion/11.operaciones_asistidas_pos_linkpago.sql)
- f_post_tb_operacion_asistida
Se agregó ::bigint a COALESCE(p_monto_deposito_cliente, 0) y a 0 en la llamada a f_get_tb_operacion_calculo_comision_servicio, y ::bigint a COALESCE(p_monto_deposito_cliente, 0) en la llamada a f_get_tb_operacion_calculo_comision_banco_ingreso, para corregir type mismatch numeric→bigint.
```

### Regla 3 — ALTER TABLE / DROP COLUMN

- Los cambios estructurales sobre una tabla (`ALTER TABLE`, `DROP COLUMN`) deben escribirse **debajo del script de creación de esa misma tabla**, en el mismo archivo `.sql`.
- No dispersar estos cambios en otros archivos.
- La evolución de la tabla debe quedar trazable en un solo lugar.

### Regla 4 — Orden: tabla → funciones → DROP

Al modificar tabla + funciones:
1. Actualización de la tabla en su archivo
2. Funciones actualizadas
3. Consulta `DROP FUNCTION IF EXISTS ...` al final

---

## Frontend

### Convenciones de código

- **Nombres de archivo**: kebab-case (`data-table.tsx`, `auth-provider.tsx`)
- **Imports React Aria**: prefijo `Aria*` (`import { Button as AriaButton }`)
- **Colores**: tokens semánticos (`text-primary`, `bg-primary`, `border-secondary`). **NUNCA** raw tailwind colors (`text-gray-900`)
- **Componentes visuales**: Untitled UI React (CLI-scaffolded)

### Patrón de módulos administrativos

```
features/sistema/<modulo>/
  <modulo>-page.tsx       → FilterBar + DataTable + Popup + HistoryDrawer
  <modulo>-popup.tsx      → Modal Nuevo/Editar
  <modulo>-history-drawer.tsx → Panel lateral de historial
```

### Componentes compartidos

| Componente | Ruta | Uso |
|-----------|------|-----|
| `FilterBar` | `components/shared/filter-bar.tsx` | Nombre + Estado + Buscar + Limpiar + Nuevo |
| `DataTable` | `components/shared/data-table.tsx` | Tabla con inline estado, paginación, motion |

### DataTable props clave

```tsx
<DataTable
  columns={columns}        // ColumnDef[] sin id ni estado_nombre
  data={paginatedData}
  page={page}
  totalPages={totalPages}
  pageSize={pageSize}
  onPageChange={setPage}
  onPageSizeChange={handlePageSizeChange}
  inlineEstado={{          // opcional, omite en módulo estado
    idEstadoKey: "id_estado",
    onSave: handleSaveEstado,
  }}
  renderActions={(row) => (
    <Button iconLeading={Edit03} onClick={() => handleEdit(row)} />
    <Button iconLeading={ClockRewind} onClick={() => handleHistory(row.id)} />
  )}
/>
```

### Reglas visuales

- Sidebar: fijo 280px, sin colapso, usuario/logout/tema en footer
- Header: solo breadcrumb
- Tema: script inline en `<head>` con key `ui-theme`, `useLayoutEffect` en ThemeProvider
- Motion: `motion/react`, sin `ease` strings, usar `transition={{ duration: 0.2 }}`
- Paginación: "Página X de Y", selector 20/50/100, centrada en footer de tabla
- No mostrar `id` PK como columna visible

### Stack

React 19 + Vite 8 + Tailwind CSS v4 + Untitled UI React (React Aria) + Framer Motion v12 (motion/react) + Supabase JS + React Router v7
