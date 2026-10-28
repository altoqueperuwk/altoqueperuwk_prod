# Una devolución para varias solicitudes de Pago Deuda

Fecha: 28/10/2026. Implementado y probado primero en desarrollo; homologación productiva posterior autorizada y ejecutada. La publicación Git se verifica con el registro de entrega indicado al final.

## Caso preparado

BanBif, A Cuenta WK S.A., empresa 7, cuenta 16. Retorno de efectivización 23543, código 875421, importe S/3,000. Operaciones BANCO 23540 por S/1,000 y 23542 por S/2,000. Se requiere un solo ingreso bancario y atribución independiente a cada solicitud.

## Modelo y backend

En `04.pago_deuda.sql` se creó `tb_pago_deuda_match_distribucion`, con referencias a retorno y deuda bancaria, monto positivo de dos decimales, usuario/fecha y unicidad retorno/deuda. Índice por deuda. RLS habilitada mediante ALTER TABLE sobre la nueva tabla; sin acceso directo para anon/authenticated. No se alteraron columnas de tablas existentes.

- `f_patch_tb_pago_deuda_match_multiple(bigint[],bigint,bigint,character varying)`: RPC nueva para 2–20 deudas bancarias de solicitudes distintas. Bloquea familias/retorno en orden estable con espera acotada de 1500 ms. Valida disponibilidad, mismo DNI, banco de salida compatible con ingreso del retorno, ventana de 24 horas, ausencia de cierre y suma de saldos pendientes exactamente igual al retorno. Rechaza duplicados y saldos inválidos.
- Se reutiliza una sola vez `f_patch_tb_pago_deuda_match` para conservar su tratamiento contable probado. Dentro de la misma transacción se redistribuye la atribución temporal del primer enlace y se registra el importe correspondiente a cada deuda. Se conserva un solo movimiento de devolución por el monto completo. Cualquier excepción revierte todo; no se ejecutan múltiples RPC financieras desde el navegador.
- Replay de la misma selección observa la relación existente y no vuelve a modificar caja; otra selección sobre un retorno ya conciliado se rechaza. Los IDs de compatibilidad de ambas deudas/padres apuntan al retorno compartido; el retorno mantiene como enlace principal la primera deuda ordenada por ID. La relación nueva conserva el detalle completo.
- `f_get_tb_pago_deuda` y `f_get_tb_pago_deuda_bandeja`: atribuyen monto de devolución y detalle de cuenta al importe distribuido, en lugar de repetir S/3,000 por cada deuda. Añaden el booleano `pd_match_multiple`; los campos anteriores se conservan. Los retornos tradicionales mantienen el fallback anterior.
- `f_get_tb_pago_deuda_tiene_cierre`: contempla el retorno compartido para proteger todas las familias si ese ingreso pertenece a un cierre. El indicador de cierre del listado global utiliza también esta guardia.

La RPC nueva permite EXECUTE a authenticated/service_role y no a PUBLIC/anon. No se cambiaron las firmas de RPC existentes ni se modificó la función de finalización: ambas deudas pueden finalizarse por separado con sus respectivas comisiones, sin generar otro ingreso de retorno.

## Frontend

- El modal admite varias casillas seleccionadas. Muestra saldo pendiente seleccionado y monto de retorno.
- Para selección múltiple, Guardar requiere igualdad exacta al centavo. El cálculo usa saldos pendientes, no montos originales ya devueltos parcialmente.
- Para selección simple, se conserva un retorno parcial que no exceda el saldo disponible y se usa la RPC tradicional.
- Para selección múltiple se llama a la RPC nueva una sola vez. Se conserva la invalidación de caché, actualización de filas, toast y refresco de métricas.
- Se agregó la RPC a la lista de reintentos acotados únicamente por 55P03. No se reintentan errores de red ni errores de negocio indiscriminadamente.
- En Pago Deuda TC, Monto Devolución utiliza el componente `PagoDeudaDevolucion`: importe atribuido y pill semántico success «Conciliado» solo para matches múltiples. El tooltip aclara que la devolución es compartida y el importe pertenece a esa operación.

Archivos principales: `bancaria-efectivizacion-table.tsx`, `bancaria-operational-tabs.tsx`, `operaciones.types.ts`, `pago-deuda.service.ts`, `match-distribution.ts`, `pago-deuda-devolucion.tsx` y `rpc-lock-retry.ts`, con pruebas asociadas.

## Validación ejecutada

- 30 pruebas frontend satisfactorias: selección simple/múltiple, suma y diferencias, decimales, duplicados, agotados, pill con importe atribuido y reintentos del servicio.
- TypeScript `--noEmit -p tsconfig.app.json` satisfactorio. Sin build de frontend.
- Pruebas integrales contra las operaciones preparadas en desarrollo, dentro de transacciones con ROLLBACK: reparto 1000/2000, dos relaciones, un único ingreso 3000, lectura por deuda y solicitud padre, repetición idempotente y finalización independiente de ambas deudas sin duplicar devolución.
- Rechazos y rollback: suma diferente, DNI distinto, banco distinto, deuda no disponible y cuenta de retorno inválida. Comprobación de huellas completas de operaciones, movimientos y cajas tras rollback, más contador de distribuciones.
- La comprobación adicional de cierre compartido del script solo se ejecuta si existe un cierre de referencia en desarrollo; no se crearon cierres de prueba. No se certifica aquí el proceso completo de cierre/reapertura ni estrés sostenido.
- DOM en la ruta local: ambas casillas seleccionables a la vez; Guardar deshabilitado con S/2,000 y habilitado al sumar S/3,000. No se pulsó Guardar en navegador ni se consumieron las operaciones preparadas. La validación visual del pill en una fila persistida queda disponible después de que el usuario confirme el match; el componente y el dato SQL fueron comprobados con pruebas.

Script y evidencia: `scripts/dev-multiple-debt-match.cjs`, `outputs/multiple-debt-match-dev-20261028/`. El script limita la conexión al proyecto de desarrollo. No ejecutar el archivo 04 completo para homologar: incluye funciones y sentencias ajenas al ajuste. La consulta generadora de DROP al final identifica las cuatro funciones afectadas; no se ejecutaron DROP FUNCTION.

## Homologación productiva autorizada

Se creó únicamente la tabla de distribución con índice/RLS y se compilaron las cuatro funciones de este ajuste en una transacción. Se verificó que los tres cuerpos productivos existentes coincidieran con la línea base de desarrollo; también se compararon cinco dependencias financieras con la versión probada. Se preservaron los argumentos, retornos SQL, OID, propietario, permisos y configuración de las funciones preexistentes. Los lectores JSON añaden únicamente el campo informativo descrito arriba.

Se verificó EXECUTE de la RPC nueva para authenticated, denegación para anon, bloqueo de SELECT directo a la tabla para authenticated y RLS activa. La entrada inválida fue rechazada bajo un savepoint, sin efectos financieros. Se notificó recarga de esquema y se releyeron las cuatro definiciones tras COMMIT.

Las bandejas actuales y el listado global del 28/10 estaban vacíos al desplegar. Para comprobar compatibilidad con datos reales se compararon además las lecturas históricas del último cierre (27/10): BCP 6 filas, Interbank 8, Scotiabank 5 y BBVA 8; las 27 filas quedaron idénticas salvo el nuevo booleano false. BanBif no devolvió filas en ese histórico. No se ejecutaron matches, pagos o cambios de estados/movimientos en producción; la tabla nueva permaneció vacía.

Evidencias: `outputs/multiple-debt-match-prod-20261028/`, con línea base, SQL aplicado, permisos, definiciones verificadas, pruebas históricas y registro del commit/push cuando se publique. Script acotado: `scripts/prod-multiple-debt-match-release.cjs`. El respaldo restaura funciones anteriores pero conserva deliberadamente la tabla/RPC nueva: no eliminar distribuciones que puedan empezar a utilizarse después del despliegue.

Alcance Git de esta entrega: el cambio acotado de tabla y cuatro funciones del archivo 04; frontend y pruebas de selección múltiple, pill, tipos, servicio y reintento; y este documento. Excluir los cambios de ganancias del 23/10, SafetyPay, planes y modificaciones ajenas del repositorio. Validar el commit aislado con pruebas y TypeScript antes de publicarlo en develop y main. Cloudflare requiere confirmar su despliegue por separado.

Quedan como ampliación de validación el estrés sostenido y el proceso completo de cierre/reapertura de un grupo; no se afirman certificados por las pruebas realizadas.
