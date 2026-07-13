# 25. Caja Inicial Desde Sistema Para Pruebas

## Objetivo

Definir una excepcion controlada para que la nueva web compactada permita **crear y dejar lista la caja inicial desde la rama `sistema`**, con el fin de acelerar:

- pruebas unitarias;
- pruebas funcionales de `operaciones`;
- bootstrap inicial del ambiente;
- validacion de rutas bancarias antes de terminar toda la UX operativa.

Este documento no reemplaza la regla general del producto:

- la caja operativa pertenece al dominio `operaciones`;
- pero en esta fase se habilita una entrada administrativa desde `sistema` para preparar datos base y poder probar.

## Regla visual de esta fase

La implementacion frontend de este modulo debe hacerse con:

- componentes base de `Untitled UI`;
- el mismo patron general de `sistema`:
  - page
  - table
  - popup
  - modal secundario de configuracion

Pero en esta fase aun **no** se debe forzar la adaptacion final al dark mode compacto.

Regla explicita:

- implementar primero la funcionalidad y estructura visual;
- mantener consistencia con `Untitled UI` y el patron CRUD del proyecto compacto;
- dejar el ajuste fino de dark mode para una fase posterior, cuando termine de cerrarse `operaciones`.

Esto significa:

- no bloquear la implementacion por el tema visual oscuro;
- no intentar compactar ahora el tema final de colores;
- priorizar que el modulo quede usable para pruebas.

## Regla principal

La creacion de caja inicial desde `sistema` se considera un **flujo tecnico-administrativo de bootstrap**, no la experiencia operativa final del usuario.

Por lo tanto:

- si se implementa en `sistema`, debe quedar claramente separado del CRUD comun;
- no debe mezclarse con catalogos simples como si fuera otra tabla core mas;
- no reemplaza los flujos posteriores de `Cierre`, `Historial` o `Asignar` dentro de `Operaciones`;
- sirve para dejar lista la caja operativa y poder probar rutas, KPIs, Excel y bandejas.

## Dominio backend a usar

La fuente de verdad backend para esta implementacion es:

- `backend_implementacion/05.ruta_operacion_y_cajas.sql`

Piezas principales:

- `tb_ruta_operacion_caja`
- `tb_caja_operativa`
- `tb_ruta_operacion_kpi`
- `f_get_tb_ruta_operacion_caja`
- `f_get_tb_ruta_operacion_caja_ingreso_principal`
- `f_get_tb_caja_operativa`

La caja inicial que se crea para pruebas debe ser compatible con esa semantica.

## Alcance funcional exacto

Desde `sistema`, el usuario administrador debe poder:

1. seleccionar una empresa;
2. seleccionar una cuenta bancaria de esa empresa;
3. definir el saldo inicial de la caja;
4. definir si la caja queda activa;
5. guardar la caja operativa base;
6. luego asociarla a una o varias rutas operativas segun corresponda;
7. marcar, cuando aplique, una de las asociaciones de ruta como `caja de ingreso principal`.

## Flujo correcto de creacion

### Paso 1. Crear la caja operativa

La caja operativa nace sobre la combinacion:

- `id_empresa`
- `id_empresa_cuenta_bancaria`

Con datos minimos:

- `saldo_inicial`
- `saldo_actual`
- `id_estado`
- `id_usuario`
- `fecha_apertura`

Regla:

- al crearla por primera vez, `saldo_actual` debe nacer igual a `saldo_inicial`;
- `total_recaudado`, `ingresos`, `gastos`, `ganancia`, `salida`, `operaciones` nacen en `0`;
- no se deben registrar movimientos de caja en este paso.

### Paso 2. Asociar caja a ruta

Despues de crear la caja, se debe poder asociar a una ruta mediante:

- `tb_ruta_operacion_caja`

Datos minimos:

- `ruta`
- `id_empresa`
- `id_empresa_cuenta_bancaria`
- `flag_caja_ingreso_principal`
- `id_estado`
- `id_usuario`

### Paso 3. Caja de ingreso principal

Regla de negocio ya cerrada:

- por cada ruta bancaria solo puede existir una caja de ingreso principal activa.

Entonces:

- `flag_caja_ingreso_principal = true` solo puede existir una vez por ruta;
- si una ruta no tiene caja de ingreso principal, no debe poder procesar Excel ni registro de ingreso normal en `Operaciones`;
- si una ruta tiene varias empresas/cuentas asociadas, solo una es la dueña del ingreso por defecto.

## Donde debe vivir en frontend

Esta capacidad debe vivir temporalmente dentro de `sistema`, pero como modulo tecnico-administrativo especifico.

Estructura sugerida:

- `src/features/sistema/caja-operativa/`

Archivos sugeridos:

- `caja-operativa-page.tsx`
- `caja-operativa-table.tsx`
- `caja-operativa-popup.tsx`
- `caja-operativa-ruta-modal.tsx`
- `caja-operativa-history-drawer.tsx` solo si luego decides espejo/historial

## Patron visual recomendado

Debe seguir el mismo lenguaje visual aprobado de `sistema`:

- breadcrumb
- filtros compactos
- datatable
- popup para crear/editar
- acciones inline

Pero con una salvedad:

- la asociacion de rutas puede ir en un modal secundario de configuracion, similar a como `empresa` tiene modal de cuentas bancarias.
- en esta fase el foco es la estructura y funcionalidad con `Untitled UI`, no el refinamiento final del dark mode.

## Layout funcional recomendado

### Pantalla principal

Filtros:

- Empresa
- Banco
- Estado
- Buscar
- Limpiar
- Nuevo

Tabla principal:

- Empresa
- Banco / Cuenta bancaria
- Saldo Inicial
- Saldo Actual
- Estado
- Rutas Asociadas
- Fecha Apertura
- Acciones

### Popup de caja operativa

Campos:

- Empresa
- Cuenta Bancaria
- Saldo Inicial
- Estado

Reglas:

- `Saldo Inicial` obligatorio
- `Estado` por defecto `Activo`
- `Saldo Actual` no se edita manualmente en alta; se deriva igual a `Saldo Inicial`

Contrato visual:

- popup estandar de `Untitled UI`
- grid simple de formulario
- acciones `Cancelar` y `Guardar`
- sin personalizaciones profundas heredadas del frontend viejo

### Modal de rutas asociadas

Debe permitir:

- ver rutas asociadas a esa caja;
- agregar ruta;
- activar o inactivar asociacion;
- marcar `Caja de Ingreso Principal`

Campos por fila o registro:

- Ruta
- Caja de Ingreso Principal
- Estado

Regla:

- si marcas una ruta como principal para esa caja y ya existe otra principal activa en esa ruta, el sistema debe impedirlo o exigir reemplazo controlado.

Contrato visual:

- modal o drawer secundario con tabla/lista editable
- controles base de `Untitled UI`
- mismo patron visual de `sistema`
- sin necesidad todavia de aplicar el tema dark mode final

## Contrato de pruebas

Esta pantalla existe para que puedas dejar listos datos de prueba antes de implementar por completo `Operaciones`.

Debe permitir validar al menos estos escenarios:

1. Crear caja `Hueso Cash + BCP` con saldo inicial.
2. Asociar esa caja a `/operaciones/bcp` como ingreso principal.
3. Crear otra caja `Hueso Cash + BBVA`.
4. Asociar esa caja a `/operaciones/bbva` como ingreso principal.
5. Asociar una caja a una ruta sin marcarla como principal para que solo sirva como opcion de salida.
6. Verificar que una ruta sin caja principal no puede procesar ingreso por Excel o registro normal.

## Relacion con Operaciones

Cuando `Operaciones` consulte:

- `f_get_tb_ruta_operacion_caja`
- `f_get_tb_ruta_operacion_caja_ingreso_principal`
- `f_get_tb_ruta_operacion_kpi`

debe encontrar ya creada la caja base y su asociacion por ruta.

Eso permite probar:

- KPI de ruta
- empresa activa
- formulario manual
- carga Excel
- derivaciones
- salidas por otra ruta

sin depender de que toda la UX de `Operaciones` este terminada.

## Lo que no debe hacer otra IA

- no mezclar esta pantalla con el CRUD de `empresa`;
- no tratar `caja-operativa` como un simple catalogo sin semantica;
- no permitir crear varias cajas duplicadas para la misma `empresa + cuenta bancaria`;
- no permitir multiples cajas de ingreso principal activas en una misma ruta;
- no registrar movimientos de caja al momento de crear la caja inicial;
- no reemplazar con este modulo la experiencia final normal de `Operaciones`.

## Regla final para implementacion

La siguiente IA debe asumir:

1. la caja operativa sigue perteneciendo conceptualmente a `Operaciones`;
2. pero se habilita su creacion desde `sistema` para bootstrap y pruebas;
3. primero se crea la caja operativa;
4. luego se asocia a una ruta;
5. luego se define si es caja de ingreso principal;
6. el frontend se implementa con `Untitled UI` base y patron CRUD de `sistema`;
7. el dark mode compacto final se deja para una fase posterior;
8. con eso ya quedan habilitadas las pruebas unitarias y funcionales del flujo bancario.

## Checklist minimo

- [ ] Crear caja operativa por `empresa + cuenta bancaria`
- [ ] Nacer con `saldo_actual = saldo_inicial`
- [ ] Permitir asociar rutas
- [ ] Permitir marcar una ruta como ingreso principal
- [ ] Respetar unicidad de caja principal por ruta
- [ ] Mostrar rutas asociadas en tabla
- [ ] Dejar listo el dato para que `Operaciones` consuma sin hacks
