# Reintento automático de pagos ante bloqueo

## Alcance

Complemento frontend de la mitigación de bloqueos de caja. No modifica SQL, firmas, respuestas ni reglas contables. No requiere compilar funciones en Supabase; sí publicar el frontend para que llegue a producción. No se ha hecho commit, push ni despliegue con este cambio.

RPC habilitadas explícitamente:

- `f_patch_tb_operacion_proceso_pagado`
- `f_patch_tb_operacion_proceso_pagado_lote`
- `f_patch_tb_pago_deuda_pagado`

## Política

Un intento inicial y hasta tres reintentos adicionales (cuatro llamadas como máximo). Solo se repite cuando la RPC devuelve `error.code === "55P03"`, correspondiente al conflicto con rollback de la transacción. Esperas de 750, 1500 y 3000 ms, cada una con variación aleatoria de hasta 250 ms para reducir coincidencias entre usuarios.

Se conserva la misma promesa pendiente durante los intentos y se reutilizan los parámetros originales. Al confirmar éxito se detiene inmediatamente. Si persiste el conflicto, se conserva el manejo de errores existente; no se simula una operación pagada y queda necesaria la revisión/repetición manual. El tiempo total incluye la duración de cada solicitud, no solo las esperas.

No se reintentan errores de red, excepciones, timeouts (`57014`), deadlocks (`40P01`), errores de negocio ni otras RPC. No se interpretan mensajes de texto como códigos. No extender a importadores o funciones que capturen errores y confirmen resultados parciales sin verificar primero su atomicidad.

## Archivos

- `src/lib/rpc-lock-retry.ts`: política compartida y lista de RPC habilitadas.
- `src/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service.ts`: integración con el servicio existente.
- `src/features/operaciones/pago-deuda/services/pago-deuda.service.ts`: integración con el servicio existente.
- `src/lib/rpc-lock-retry.test.ts`: pruebas con RPC simuladas y relojes controlados, sin operaciones reales ni acceso a base de datos.

## Verificación

Ejecutar `npx vitest run src/lib/rpc-lock-retry.test.ts`. No requiere `npm run build` ni llamadas a producción. La aceptación con operaciones reales sigue pendiente tras publicar el frontend.

Resultado local: 15 pruebas aprobadas, incluidos éxito tras reintentos, agotamiento con error en ambos servicios, parámetros intactos y ausencia de reintento ante errores no habilitados. No se ejecutó build ni se modificó producción.
