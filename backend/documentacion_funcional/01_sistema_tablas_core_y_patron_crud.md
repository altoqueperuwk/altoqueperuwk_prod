# 01. Sistema: Tablas Core y Patron CRUD

## Objetivo del dominio

`sistema` concentra los catalogos, maestros, permisos y configuraciones base que alimentan el resto del producto. Aqui no vive la logica transaccional de negocio; aqui vive la informacion estructural que luego consumen `operaciones`, `seguimientos`, `dashboard` y `reportes`.

## Tablas core del dominio

Este dominio cubre principalmente:

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

## Patron funcional aprobado

Todos los modulos administrativos de `sistema` deben usar el mismo patron:

- breadcrumb superior;
- barra de filtros compacta:
  - `Nombre`
  - `Estado`
  - `Buscar`
  - `Limpiar`
  - `Nuevo`
- datatable como area principal;
- paginacion por defecto de `20` filas;
- popup reutilizable para `Nuevo` y `Editar`;
- cambio de `Estado` inline desde la tabla;
- columna `Accion` con:
  - `edit`
  - `save`
  - `historial`

No se consideran KPI visibles como layout base obligatorio para `sistema`.

## Regla de interaccion

- `Nuevo`: abre popup limpio.
- `Editar`: abre popup con data precargada.
- `Visualizar`: opcional, si el modulo lo requiere.
- `Estado`: se cambia inline con dropdown y persiste via `PATCH`.
- `Save`: confirma cambios inline pendientes de la fila.
- `Historial`: abre popup o drawer con el espejo `_his` del registro.
- `Eliminar`: no aplica a tablas core; todo se resuelve con estados.

## Patron de historial aprobado

Cada tabla core de `sistema` debe tener una tabla espejo `tb_xxx_his`.

Reglas:

- solo aplica a tablas core en esta fase;
- el historial guarda snapshot completo por `INSERT` y `UPDATE`;
- no tiene `PRIMARY KEY`;
- no tiene `FOREIGN KEY`;
- conserva auditoria via snapshot:
  - `id_usuario`
  - `fecha_registro`
- el historial se consulta desde la accion `historial` del datatable.

## Tablas que requieren consideracion especial

### `tb_banco`

- mantiene equivalencias en campo `jsonb`;
- las equivalencias se editan dentro del popup del banco;
- no existe un modulo aparte solo para equivalencias.

### `tb_cliente`

- los celulares viven en campo `jsonb`;
- la edicion del listado de celulares ocurre dentro del popup;
- no se requiere tabla separada en el sistema compacto.

### `tb_empresa` y `tb_empresa_cuenta_bancaria`

- empresa y cuentas bancarias son parte del dominio `sistema`;
- la empresa tiene su propio CRUD;
- las cuentas bancarias se gestionan como subrecurso de empresa;
- ambas respetan estado, no eliminacion fisica.

### `tb_reglas_efectivizacion`

- es un modulo core, pero con formulario mas rico;
- sigue el patron `datatable + popup`;
- el popup se agrupa por bloques:
  - contexto
  - ingreso
  - servicio
  - salida

## Estructura de carpetas frontend esperada

- `features/sistema/estado/`
- `features/sistema/rol/`
- `features/sistema/sucursal/`
- `features/sistema/comunidad/`
- `features/sistema/usuario/`
- `features/sistema/permiso-menu/`
- `features/sistema/permiso-usuario/`
- `features/sistema/cliente/`
- `features/sistema/codigo-servicio/`
- `features/sistema/banco/`
- `features/sistema/empresa/`
- `features/sistema/reglas-efectivizacion/`

## Contrato con backend

Cada tabla core debe quedar con:

- `GET`
- `POST`
- `PATCH`

Reglas:

- los `GET` tambien deben usar `SECURITY DEFINER`;
- `PATCH` debe soportar cambio rapido de `id_estado`;
- `POST` y `PATCH` completos deben alimentar el popup reutilizable.
- cada tabla core debe exponer `f_get_tb_<tabla>_his`;
- el historial se alimenta internamente desde backend, no por `POST/PATCH` publicos.

## Resultado esperado para otra IA

Otra IA debe entender desde este documento que:

- `sistema` es el dominio de tablas maestras;
- su patron visual es uniforme;
- no se elimina informacion de tablas core;
- y todo lo transaccional debe quedar fuera de este dominio.
