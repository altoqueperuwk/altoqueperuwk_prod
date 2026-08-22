# Contexto General Backend

## Vigencia

Esta guia describe el backend vigente al 22/08/2026. Es la referencia de
continuidad para una nueva sesion. Si un documento antiguo contradice esta
guia, prevalece el SQL actual y este documento.

## Arquitectura

| Archivo | Responsabilidad |
| --- | --- |
| `01.core_catalogos_permisos.sql` | estados, roles, usuarios, permisos, sucursales y comunidades |
| `02.core_clientes_servicios_empresas_reglas.sql` | clientes, bancos, empresas, cuentas y reglas de efectivizacion |
| `03.operacion_proceso_y_excel.sql` | operaciones, Excel/TXT, calculos, derivaciones, retencion y pago |
| `04.pago_deuda.sql` | solicitudes, pasos, transferencia, devolucion, match y comision |
| `05.ruta_operacion_y_cajas.sql` | rutas, cajas, movimientos, KPI y cierres |
| `07.respuesta_consultas_selects.sql` | consultas diagnosticas y validaciones manuales |
| `10.retenciones_scotiabank_banbif.sql` | bandeja, badges y consultas de retenciones |
| `11.operaciones_asistidas_pos_linkpago.sql` | POS, Link Pago y POS sin envio |
| `12.recaudacion_cortes_abonos.sql` | cortes, lotes y compatibilidad de abonos |
| `14.reportes_cierre_caja.sql` | reportes Excel/PDF de cierre |

Los scripts de limpieza y backfill se ejecutan solo en despliegues o
reconciliaciones controladas.

## Fuente de verdad operativa

La operacion comercial vive en `public.tb_operacion_proceso`:

```text
tb_operacion_proceso
  -> tb_operacion_caja
  -> tb_caja_operativa
  -> tb_ruta_operacion_kpi
  -> tb_caja_operativa_cierre
```

- `tb_operacion_proceso`: estado, cliente, empresa, cuenta, fechas, importes,
  comisiones, ruta y flags.
- `tb_operacion_caja`: movimiento trazable de ingreso o salida.
- `tb_caja_operativa`: saldo vivo y acumulados.
- `tb_ruta_operacion_kpi`: acumulados y contadores de ruta.
- `tb_caja_operativa_cierre`: snapshot historico.

No se debe eliminar `tb_operacion_caja` para operaciones de efectivizacion:
es la trazabilidad de ingreso/salida y la base de reversas, cierre y auditoria.
La carga Excel difiere la sincronizacion de KPI, pero mantiene los movimientos.

## Efectivizacion

`f_post_tb_operacion_proceso` registra manualmente y congela los resultados.
`f_post_tb_operacion_proceso_excel` y
`f_post_tb_operacion_proceso_excel_ganancia`:

1. Resuelven empresa, banco y cuenta de ingreso.
2. Crean el registro de carga.
3. Normalizan DNI, monto a dos decimales, fecha y hora.
4. Validan duplicidad antes de crear cliente, calcular comisiones o registrar
   caja.
5. Omiten filas repetidas y conservan contadores y detalle.
6. Calculan comisiones, insertan la operacion y registran el movimiento.
7. Difieren KPI durante la carga y sincronizan al finalizar.

La duplicidad usa servicio + codigo normalizado + monto a dos decimales +
ventana de siete dias, incluyendo historicos y eliminados. El indice es
`idx_tb_operacion_proceso_excel_duplicidad`.

El parser BCP de ancho fijo extrae el codigo de la seccion definida por el
formato, por ejemplo `00391250`, y conserva la hora real de Lima. El backend
guarda el timestamp con zona.

El pago individual y por lote valida saldo antes de cambiar a `PAGADO`. El
lote suma transferencias por caja y rechaza todo el lote si alguna caja no
soporta el total.

La salida descuenta de caja el monto de transferencia y registra el gasto
bancario separado. El gasto no se descuenta al registrar el deposito.

## Retencion hardcodeada vigente

La decision automatica ya no depende de reglas genericas, `flag_retencion`,
`fuera_horario`, fecha de carga ni configuracion dinamica. La funcion central
es `f_get_tb_operacion_retencion_hardcodeada`.

| Empresa | Cuenta | Banco | Corte |
| --- | ---: | ---: | ---: |
| Capital Nova S.A. | 33 | Scotiabank (3) | 21:00 Lima |
| A Cuenta WK S.A. | 16 | BanBif (4) | 21:00 Lima |
| Academia WK S.A. | 7 | Scotiabank (3) | 21:00 Lima |
| Capital Nova S.A. | 4 | BCP (2) | 00:00 Lima |
| Fluxopay S.A. | 5 | BCP (2) | 00:00 Lima |

Para Scotiabank y BanBif, desde las 21:00 hasta antes de las 21:00 del siguiente
ciclo queda retenido; antes de las 21:00 impacta normalmente. Para las cuentas
BCP, la ventana es el dia calendario local: el dia actual queda retenido y el
dia anterior puede impactar. La unica fecha decisiva es
`fecha_deposito_cliente` en `America/Lima`.

Las demas combinaciones no quedan retenidas por esta regla aunque tengan una
regla de abono antigua. `f_get_tb_recaudacion_cuenta_flag_retenida` mantiene
su firma por compatibilidad, pero devuelve verdadero solo para estas cuentas.

No hay liberacion automatica. Los jobs de compatibilidad no liberan fondos.
Una operacion retenida puede derivarse y continuar su atencion; no debe existir
un bloqueo generico por estar retenida.

`flag_retenido` y `flag_fuera_horario` son excluyentes cuando se usan. La
columna Fuera de Horario se oculta en las bandejas bancarias, pero los campos
permanecen para compatibilidad y auditoria.

## KPI y ganancias

Los KPI normales usan `f_get_tb_ruta_operacion_kpi`,
`f_sync_tb_ruta_operacion_kpi_caja` y
`f_sync_tb_ruta_operacion_kpi_operacion`.

Para Scotiabank y BanBif, el frontend reemplaza solo Ganancias con
`f_get_tb_ruta_operacion_ganancias_efectivizacion`. Esta lectura:

- acepta solo esas dos rutas;
- filtra Efectivizacion y estado `PAGADO`;
- incluye Mismo Dia y Dia Siguiente;
- usa `fecha_deposito_cliente` en Lima como clave del grupo;
- excluye una operacion Dia Siguiente pendiente;
- no escribe cajas, movimientos ni KPI materializados.

La formula conservada es:

```text
monto_deposito_cliente
- monto_transferencia_cliente
- resultado_comision_banco_ingreso
- resultado_comision_banco_salida
```

El ITF usa bloques completos:

```text
FLOOR(monto / 1000) * 0.05
```

## Caja y cierre

`f_post_tb_operacion_caja` mantiene la proteccion de saldo con lock de caja.
La seccion critica valida saldo, registra movimiento y aplica el saldo. La
sincronizacion de KPI no debe reemplazar esta proteccion. Directo Caja usa
deltas netos para evitar balances intermedios negativos.

La caja inicial es un movimiento administrativo y no cuenta como ingreso
comercial. La conciliacion aplica la diferencia contra el saldo que muestra la
banca.

Al cerrar:

- el snapshot conserva los KPI del ciclo;
- la caja viva siguiente inicia en cero;
- no se crea gasto artificial de cierre;
- operaciones finalizadas quedan congeladas;
- operaciones abiertas permanecen en Hoy;
- una pendiente heredada al pagarse afecta solo Salidas, Gastos, Caja Actual y
  el movimiento vivo;
- no se modifica la ganancia del cierre anterior.

Estados abiertos: Efectivizacion/POS/Derivados usan `PENDIENTE` o
`RECHAZADO`; Pago Deuda usa `SOLICITADO` o `PROCESADO`.

## Pago Deuda

`04.pago_deuda.sql` maneja:

```text
SOLICITUD -> BANCO/transferencia -> devolucion o match -> comision
```

La salida valida saldo de la caja configurada. El match se busca en la ventana
operativa de 24 horas. En bancos, Pago Deuda TC es la bandeja consolidada; el
contrato principal continua siendo `f_get_tb_pago_deuda_bandeja`.

## POS, Link Pago y derivaciones

POS normal crea solicitud con `f_post_tb_operacion_asistida`. POS Sin Envio
usa `f_post_tb_operacion_asistida_pos_sin_envio`: crea directamente
`PAGADO`, sin destino, comisiones, transferencia ni movimiento de caja.
Link Pago conserva su flujo asistido.

La derivacion puede ser interna o externa. El origen queda congelado
visualmente y el destino conserva el monto para atenderlo. Si comparten ruta,
el origen se identifica por empresa y cuenta, no solo por ruta.

## Funciones clave

### Operaciones y Excel

`f_post_tb_operacion_proceso`,
`f_post_tb_operacion_proceso_excel`,
`f_post_tb_operacion_proceso_excel_ganancia`,
`f_get_tb_operacion_retencion_hardcodeada`,
`f_patch_tb_operacion_proceso_retencion`,
`f_patch_tb_operacion_proceso_derivacion`,
`f_patch_tb_operacion_proceso_pagado`,
`f_patch_tb_operacion_proceso_pagado_lote`,
`f_patch_tb_operacion_proceso_directo_caja_lote` y
`f_patch_tb_operacion_proceso_reanudar`.

### Caja y KPI

`f_get_tb_ruta_operacion_kpi`,
`f_get_tb_ruta_operacion_ganancias_efectivizacion`,
`f_sync_tb_ruta_operacion_kpi_caja`,
`f_sync_tb_ruta_operacion_kpi_operacion`,
`f_post_tb_operacion_caja`,
`f_post_tb_operacion_caja_desde_proceso`,
`f_apply_tb_operacion_caja_delta`, cierre, reapertura, conciliacion y
consulta de movimientos.

### Recaudacion

`f_get_tb_recaudacion_cuenta_flag_retenida`,
`f_get_tb_recaudacion_fecha_liberacion` y funciones de jobs/compatibilidad.

## Concurrencia y despliegue

La carga Excel mantiene el lock advisory de duplicidad y difiere KPI. Los locks
de caja siguen siendo obligatorios para proteger el saldo. No se deben eliminar
sin pruebas concurrentes. `REVISION_TB_OPERACION_PROCESO.md` y
`PLAN_OPTIMIZACION_LOCKS.md` son analisis/plan y no deben asumirse como
implementacion completa.

Al modificar SQL se debe mantener al final el generador DROP FUNCTION solo con
las funciones realmente tocadas. Validaciones:

```bash
npm exec tsc -- --noEmit
npm run build
git diff --check
```
