# 04. Sidebar, Rutas e Iconografia

## Sidebar

El sidebar del frontend nuevo debe:

- iniciar expandido en desktop;
- poder colapsarse cuando no se use;
- funcionar como acordeon vertical;
- persistir su estado durante la sesion;
- mostrar tooltip en modo colapsado.

## Grupo Operaciones

Es el grupo con mayor riqueza visual del menu.

Reglas:

- icono primero;
- icono base tipo tarjeta de credito `svg`;
- color oficial por banco o canal;
- estado activo claramente reforzado.

## Rutas oficiales

- `/operaciones/bcp`
- `/operaciones/bbva`
- `/operaciones/scotiabank`
- `/operaciones/banbif`
- `/operaciones/interbank`
- `/operaciones/safetypay`
- `/operaciones/pos`
- `/operaciones/viaweb`
- `/operaciones/deuda`

## Renombres aprobados

- `/operaciones/f35` pasa a `/operaciones/interbank`
- `/operaciones/pago-deuda` pasa a `/operaciones/deuda`

## Paleta oficial por ruta

- `BCP`: `#FF7900` y `#002A54`
- `BBVA`: `#004481`
- `Scotiabank`: `#EC1C24`
- `BanBif`: `#00A1E4` y `#004B87`
- `Interbank`: `#00A757` y `#0039A6`
- `SafetyPay`: `#06283D` y `#1363DF`
- `POS`: `#6A1B9A`
- `Via Web`: `#00E5FF`
- `Deuda`: `#2C3E50`

## Regla de tema

Para modo claro y oscuro:

- se replica el sistema de tema del proyecto;
- el sidebar usa los tokens globales;
- el icono mantiene el color oficial;
- si falta contraste, se resuelve con borde, contorno o sombra sutil, no cambiando el color oficial.

## Registro central recomendado

El frontend debe tener un registro central para:

- ruta
- label
- iconKey
- iconVariant
- color principal
- color secundario
- tooltip

No se debe repetir esta logica pagina por pagina.
