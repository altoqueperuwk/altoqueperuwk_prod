# 03. Frontend Tablas Core y Popups

## Patron oficial aprobado

Para los modulos core administrativos, el patron final es:

- cabecera con breadcrumb;
- barra de filtros compacta:
  - `Nombre`
  - `Estado`
  - `Buscar`
  - `Limpiar`
  - `Nuevo`
- datatable paginado;
- columna `Estado` editable inline;
- columna `Acciones` al final con:
  - `edit`
  - `save`
  - `historial`
- popup reutilizable para `Nuevo`, `Editar` y opcionalmente `Visualizar`.

## Regla de interaccion

- `Nuevo`: abre popup.
- `Editar`: abre popup.
- `Visualizar`: puede abrir popup.
- `Estado`: se cambia desde la fila y persiste via `PATCH`.
- `Save`: confirma cambios inline pendientes.
- `Historial`: abre popup o drawer con snapshots `_his`.
- `Eliminar`: no aplica a tablas core.

## Modulos core cubiertos

- `tb_estado`
- `tb_rol`
- `tb_sucursal`
- `tb_comunidad`
- `tb_usuario`
- `tb_permiso_menu`
- `tb_permiso_usuario`
- `tb_cliente`
- `tb_codigo_servicio`
- `tb_banco`
- `tb_empresa`
- `tb_empresa_cuenta_bancaria`
- `tb_reglas_efectivizacion`

## Casos especiales

### Banco

- popup para `Nuevo/Editar`;
- equivalencias dentro del mismo popup;
- estado inline en la tabla.

### Empresa

- popup para `Nuevo/Editar Empresa`;
- la empresa es entidad padre;
- desde la fila debe existir accion `Cuentas`;
- la cuenta bancaria sigue siendo hija de la empresa;
- estado inline en empresa y cuenta.

### Cliente

- `celular` se edita como lista `jsonb`;
- no se requiere modulo separado por telefonos.

### Reglas de efectivizacion

- popup mas grande;
- formulario agrupado por bloques:
  - contexto
  - ingreso
  - servicio
  - salida

## Reglas visuales minimas

- 20 filas por defecto;
- selector de `20`, `50`, `100`;
- sin KPI obligatorios en tablas core;
- botones `Buscar`, `Limpiar` y `Nuevo` como accion primaria del modulo;
- popups livianos y reutilizables para futuros atajos desde `Operaciones`.

## Regla de historial

- cada tabla core debe tener su espejo `tb_xxx_his`;
- el historial guarda snapshot completo por alta y modificacion;
- no lleva PK ni FK;
- su lectura se hace con `f_get_tb_xxx_his`;
- el acceso visual ocurre desde la accion `historial` del datatable.
