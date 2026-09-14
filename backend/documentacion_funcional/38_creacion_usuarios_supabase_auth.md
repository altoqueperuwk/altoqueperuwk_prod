# 38. Creacion de usuarios con Supabase Auth

## Objetivo

Definir el flujo correcto para crear usuarios desde el modulo administrativo
del frontend y registrar automaticamente su identidad en Supabase Auth y su
perfil operativo en `public.tb_usuario`.

Los usuarios se administraran desde `/sistema/usuario`. El frontend debe
iniciar el proceso y un backend seguro debe ejecutar la operacion privilegiada
contra Auth, enviando una invitacion al correo valido del nuevo usuario.

## Alcance

Este documento cubre:

- creacion de usuarios internos desde `/sistema/usuario`;
- autenticacion mediante Supabase Auth;
- perfil, rol, estado y sede en `public.tb_usuario`;
- autorizacion del administrador que ejecuta la accion;
- consistencia entre `auth.users` y `public.tb_usuario`;
- actualizacion futura de correo, contraseña, estado y rol.

No cubre:

- registro publico de clientes o usuarios externos;
- recuperacion de contraseña;
- invitaciones masivas;
- configuracion visual del panel de Supabase;
- asignacion automatica de permisos de menu, salvo que se agregue como fase
  posterior.

## 1. Situacion actual

### 1.1 Dos fuentes de identidad

El sistema utiliza actualmente dos registros diferentes:

| Registro | Proposito | Identificador |
| --- | --- | --- |
| `auth.users` | Login, sesiones, tokens y credenciales | UUID de Supabase |
| `public.tb_usuario` | Nombre, rol, estado, sede y permisos del negocio | `bigint` autogenerado |

El screenshot del panel Authentication muestra los UUID de `auth.users`.
Actualmente `tb_usuario` no tiene una columna que guarde ese UUID. La relacion
se resuelve indirectamente por `email`, lo cual es fragil si el correo cambia o
si existen registros incompletos.

### 1.2 Creacion actual desde frontend

El formulario de [`usuario-popup.tsx`](../../src/features/sistema/usuario/usuario-popup.tsx)
valida los campos y llama a `usuarioService.create`.

`usuarioService.create` ejecuta:

```text
supabase.rpc('f_post_tb_usuario', parametros)
```

La RPC `f_post_tb_usuario` inserta solamente en `public.tb_usuario`. No llama a
Supabase Auth ni crea una fila en `auth.users`.

### 1.3 Login actual

El login utiliza:

```text
supabase.auth.signInWithPassword({ email, password })
```

Despues de autenticarse, el frontend busca el perfil de negocio mediante
`f_get_tb_usuario` filtrando por email.

Por lo tanto, un usuario creado solo en `tb_usuario` no puede iniciar sesion,
porque no existe su identidad en `auth.users`. De forma inversa, un usuario
existente solo en Auth no tendra rol, sede ni permisos de negocio.

### 1.4 Limitaciones detectadas

- `f_post_tb_usuario` es `SECURITY DEFINER`, pero no valida que el llamante sea
  administrador.
- La RPC acepta desde el cliente `p_id_rol`, `p_id_estado` y
  `p_flag_super_admin`; esos campos no deben confiarse al frontend.
- `tb_usuario.password` almacena la contraseña en texto plano.
- `f_get_tb_usuario` incluye `password` en la respuesta.
- El popup no muestra ni envia `p_id_sucursal`, aunque el backend ya soporta
  `id_sucursal`.
- No existe un `auth_user_id` o equivalente en `tb_usuario` para enlazar ambos
  registros de forma estable.
- No se encontro una Edge Function o endpoint seguro dentro de este repositorio
  para ejecutar `auth.admin.createUser`.

## 1.5 Requerimiento funcional confirmado

El modulo `/sistema/usuario` sera el unico punto de creacion de usuarios.

Cuando el usuario que crea la cuenta no sea administrador:

- podra abrir `Nuevo Usuario`;
- el selector `Rol` mostrara solamente:
  - `Area de Pagos` (`id_rol = 2`);
  - `Jefe de Tienda` (`id_rol = 3`);
  - `Atencion al Cliente` (`id_rol = 4`);
- no se mostrara ni se aceptara `Administrador` (`id_rol = 1`);
- no podra activar `flag_super_admin`;
- el backend volvera a validar esta restriccion, aunque el frontend oculte las
  opciones.

El email ingresado debe ser real y pertenecer al usuario que recibira la
invitacion de Supabase. El administrador no debe registrar una contraseña
inicial para otra persona: el destinatario completara la activacion y definira
su propia contraseña desde el enlace recibido.

## 2. Modelo funcional objetivo

La creacion de un usuario interno debe ser una sola accion de un usuario con
permiso para gestionar usuarios:

```text
Frontend
  -> Edge Function / backend seguro
      -> valida la sesion y el rol del creador
      -> crea auth.users y envia una invitacion por correo
      -> crea public.tb_usuario
      -> devuelve resultado sin exponer secretos
```

El administrador no necesita abrir Authentication > Users ni confirmar
manualmente cada cuenta.

## 3. Responsabilidad de cada capa

### Frontend

El frontend debe:

- mostrar el formulario de usuario;
- capturar username, email, nombre, rol, estado y sede;
- validar campos obligatorios y formatos basicos;
- validar el formato del email antes de enviar;
- enviar el token de la sesion actual automaticamente;
- mostrar el resultado o el mensaje de error;
- actualizar la tabla despues de una creacion exitosa.

El frontend no debe:

- usar `service_role`;
- llamar `auth.admin.createUser`;
- llamar `auth.admin.inviteUserByEmail`;
- decidir si un usuario puede ser superadministrador;
- almacenar contraseñas en `tb_usuario` como fuente de autenticacion.

### Backend o Edge Function

El backend debe:

1. leer y validar el bearer token del usuario creador;
2. resolver el usuario de negocio asociado al email o UUID autenticado;
3. resolver el rol permitido segun el rol del creador;
4. validar rol, estado, sede y email;
5. verificar duplicados en Auth y en `tb_usuario`;
6. crear la identidad y enviar la invitacion mediante
   `supabase.auth.admin.inviteUserByEmail`;
7. crear el perfil operativo asociado;
8. eliminar la identidad de Auth si falla la creacion del perfil;
9. devolver solo datos no sensibles.

### Supabase Auth

Supabase Auth debe ser la unica fuente de verdad para:

- email de autenticacion;
- contraseña;
- confirmacion de correo;
- sesiones, refresh tokens y recuperacion de contraseña.

Para usuarios internos creados desde el modulo se utilizara una invitacion por
correo:

```ts
await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
  redirectTo: `${APP_URL}/auth/accept-invite`,
  data: {
    username,
    nombre,
  },
});
```

La invitacion crea la identidad en `auth.users` y envia un correo al usuario.
Al abrir el enlace, el frontend debe permitir establecer la contraseña usando
la sesion temporal de la invitacion:

```ts
await supabase.auth.updateUser({ password: nuevaPassword });
```

Para que la notificacion llegue correctamente, Supabase debe tener configurado
el proveedor de correo y la URL `/auth/accept-invite` debe estar incluida en
las Redirect URLs permitidas del proyecto.

No se debe utilizar este flujo desde el navegador con una llave privilegiada.
`supabaseAdmin` debe utilizar la llave `service_role` solo dentro del backend.

Para escenarios internos donde no se requiera correo, la alternativa tecnica
seria `createUser` con `email_confirm: true`, pero no es el flujo funcional
solicitado para este modulo.

### `public.tb_usuario`

Esta tabla debe conservar unicamente la informacion funcional:

- `username`;
- `nombre`;
- `email` como dato de contacto y compatibilidad;
- `id_rol`;
- `id_estado`;
- `id_sucursal`;
- `flag_super_admin`;
- referencia al UUID de Auth.

La contraseña no debe utilizarse para autorizar operaciones ni devolverse en
consultas de usuarios.

## 4. Contrato de creacion

El frontend enviara al backend un payload similar a:

```json
{
  "username": "atc_eros_giuseppe",
  "email": "atc_eros_giuseppe@atk.com",
  "nombre": "Eros Giuseppe",
  "id_rol": 4,
  "id_estado": 1,
  "id_sucursal": 3,
  "flag_super_admin": false
}
```

Respuesta exitosa sugerida:

```json
{
  "id": 123,
  "auth_user_id": "uuid-de-supabase",
  "username": "atc_eros_giuseppe",
  "email": "atc_eros_giuseppe@atk.com",
  "nombre": "Eros Giuseppe",
  "id_rol": 4,
  "id_estado": 1,
  "id_sucursal": 3,
  "invitacion_enviada": true
}
```

La respuesta nunca debe incluir la contraseña.

## 5. Autorizacion

La autorizacion tiene dos niveles distintos:

### Autenticacion

Supabase Auth determina si el email y la contraseña son validos.

### Autorizacion de negocio

El perfil de `tb_usuario` determina si la persona puede acceder a rutas,
acciones y menus. La Edge Function debe validar al administrador antes de
crear otro usuario.

La regla propuesta para crear usuarios es:

```text
Administrador o Super Admin:
  Puede crear los roles autorizados por la politica administrativa.

No administrador:
  Solo puede crear id_rol IN (2, 3, 4).
  flag_super_admin siempre debe quedar en false.
```

La regla debe ejecutarse en backend. El frontend solo puede ocultar o mostrar
el boton como ayuda visual, pero no es un mecanismo de seguridad.

No se debe permitir que un usuario no administrador cambie el payload para
crear un administrador o un superadministrador. La lista de roles del
frontend es una ayuda visual; la restriccion efectiva se ejecuta en backend.

## 6. Consistencia y errores

Auth y `public.tb_usuario` pertenecen a sistemas distintos; una transaccion
SQL de `tb_usuario` no puede revertir automaticamente una operacion de Auth.
El backend debe aplicar compensacion:

```text
1. Validar sesion, rol llamante, datos y duplicados.
2. Crear usuario en `auth.users` y enviar invitacion.
3. Insertar perfil en `public.tb_usuario`.
4. Si falla el paso 3, ejecutar `deleteUser(auth_user_id)`.
5. Si ambos pasos terminan bien, responder que la invitacion fue enviada.
```

Casos que deben producir error controlado:

- email ya existente en Auth;
- email ya existente en `tb_usuario`;
- username duplicado;
- sede inexistente o inactiva;
- rol inexistente o inactivo;
- estado inexistente;
- administrador no autorizado;
- error al crear Auth;
- error al crear el perfil.

La operacion debe ser idempotente respecto al email y username. No debe crear
un segundo perfil si la misma solicitud se reintenta.

## 7. Contrato de actualizacion

Las actualizaciones deben separarse por responsabilidad:

| Cambio | Fuente de verdad | Operacion |
| --- | --- | --- |
| Contraseña | Supabase Auth | `auth.admin.updateUserById` |
| Email de login | Supabase Auth | `auth.admin.updateUserById` |
| Username | `tb_usuario` | RPC protegida |
| Nombre | `tb_usuario` | RPC protegida |
| Rol | `tb_usuario` | RPC protegida |
| Estado | `tb_usuario` y politica de acceso | RPC protegida |
| Sede | `tb_usuario` | RPC protegida |
| Super Admin | `tb_usuario` | Solo administrador autorizado |

Al modificar email, el backend debe actualizar Auth y `tb_usuario` como una
operacion coordinada. No se debe permitir que queden correos diferentes entre
ambas fuentes.

## 8. Plan de implementacion

### Fase 1: contrato y seguridad SQL

1. Agregar una referencia estable, por ejemplo `auth_user_id uuid UNIQUE`, en
   `tb_usuario`.
2. Asociar los usuarios existentes de forma controlada mediante email.
3. Quitar `password` de las respuestas de `f_get_tb_usuario`.
4. Evitar que las RPC publicas de usuarios permitan crear o elevar privilegios
   sin validar el llamante.
5. Mantener `SECURITY DEFINER` con `search_path` controlado.
6. Actualizar los bloques finales `DROP FUNCTION` de las funciones SQL
   modificadas.

### Fase 2: backend privilegiado

1. Crear una Edge Function o endpoint `admin-create-user`.
2. Configurar `SUPABASE_SERVICE_ROLE_KEY` solamente en el entorno backend.
3. Validar el JWT del administrador.
4. Ejecutar `auth.admin.inviteUserByEmail` con el `redirectTo` configurado.
5. Crear el perfil de negocio y guardar `auth_user_id`.
6. Implementar rollback de Auth ante fallo del perfil.
7. Devolver errores funcionales sin filtrar detalles internos.

### Fase 3: frontend

1. Agregar seleccion de sede al popup.
2. Filtrar el selector de roles para usuarios no administradores.
3. Reemplazar `usuarioService.create` directo por el servicio del backend.
4. No mostrar ni solicitar contraseña inicial en `Nuevo Usuario`.
5. Crear la pantalla de aceptacion de invitacion y establecimiento de
   contraseña.
6. Mostrar confirmacion de invitacion enviada y datos no sensibles.

### Fase 4: migracion y compatibilidad

1. Identificar usuarios existentes en Auth y `tb_usuario`.
2. Resolver duplicados por email antes de activar la referencia UUID.
3. Mantener temporalmente la busqueda por email para usuarios antiguos.
4. Cambiar el login y las consultas de negocio a la referencia Auth estable.
5. Eliminar gradualmente el uso de `tb_usuario.password`.

## 9. Alternativa no recomendada

`supabase.auth.signUp()` puede ejecutarse desde el frontend, pero corresponde a
registro publico. No es adecuado para el modulo administrativo porque:

- puede crear una sesion del usuario nuevo;
- depende de la politica de confirmacion de email;
- no permite confiar en el rol enviado por el navegador;
- expone el flujo de alta a cualquier cliente si se habilita sin restricciones;
- no resuelve por si mismo la creacion coordinada de `tb_usuario`.

Solo debe utilizarse si se implementa un registro publico con rol inicial fijo
y confirmacion de correo.

## 10. Criterios de aceptacion

- Crear un usuario desde `/sistema/usuario` crea exactamente una identidad en
  `auth.users`.
- El mismo proceso crea exactamente un perfil en `public.tb_usuario`.
- El usuario puede iniciar sesion con el email y contraseña entregados.
- El perfil conserva rol, estado y sede correctos.
- El administrador no necesita intervenir en el panel de Supabase.
- Un usuario no administrador no puede crear cuentas ni elevar privilegios.
- No se almacena ni se devuelve la contraseña en `tb_usuario`.
- Un email o username duplicado se rechaza sin crear registros parciales.
- Si falla la creacion del perfil, la identidad Auth se elimina o queda marcada
  para reconciliacion controlada.
- Cambiar una contraseña desde el modulo actualiza Supabase Auth.
- Desactivar el usuario impide el acceso operativo segun la politica definida.
- Las rutas y permisos existentes continúan resolviendose desde el perfil de
  negocio.

## 11. Validacion tecnica prevista

Frontend:

```bash
npm exec tsc -- --noEmit
npm run test
npm run build
git diff --check
```

Backend y Supabase:

- probar alta exitosa;
- probar email duplicado en Auth;
- probar email duplicado en `tb_usuario`;
- probar username duplicado;
- probar administrador y no administrador;
- probar sede inactiva o inexistente;
- probar fallo simulado al insertar perfil;
- comprobar ausencia de contraseñas en respuestas RPC;
- comprobar que `service_role` no aparece en el bundle frontend.

## Decisiones fijadas

- La creacion se inicia desde el frontend, pero la operacion privilegiada se
  ejecuta en backend.
- No se crearan usuarios manualmente desde el dashboard de Supabase.
- Para usuarios internos se enviara una invitacion al email valido ingresado.
- El usuario invitado definira su propia contraseña al aceptar la invitacion.
- Supabase Auth sera la fuente de verdad de credenciales.
- `tb_usuario` sera la fuente de verdad de rol, sede, estado y permisos de
  negocio.
- El frontend no sera considerado una capa de seguridad.

## Implementacion realizada

- Backend privilegiado implementado como Edge Function `admin-user`.
- Vinculo estable implementado mediante `tb_usuario.auth_user_id`.
- Usuarios existentes vinculados por coincidencia unica de email al aplicar el
  script SQL.
- Creacion mediante invitacion y compensacion con `deleteUser` si falla el
  perfil operativo.
- Edicion coordinada de email en Auth y `tb_usuario` para usuarios vinculados.
- Roles no administrativos restringidos a los identificadores `2`, `3` y `4`.
- Sucursal obligatoria y validada tanto en frontend como en backend.
- Filtros por rol y sucursal, y columna Sucursal, agregados al listado.
- Para Jefe de Tienda, el modal fija el rol Atención al Cliente y la sucursal
  propia; el listado consulta solo usuarios de ese rol y sede. La Edge Function
  y las RPC protegidas repiten esta validación.
- Jefe de Tienda puede abrir `/sistema/permiso-usuario` y asignar los menús
  activos a usuarios de Atención al Cliente de su sucursal. La asignación
  individual y masiva se valida en las RPC con la identidad autenticada.

### Publicacion requerida

Despues de ejecutar `01.core_catalogos_permisos.sql`, publicar la funcion y
configurar la URL publica del frontend:

```bash
supabase secrets set APP_URL=https://dominio-del-frontend
supabase functions deploy admin-user
```

En Authentication > URL Configuration se debe agregar:

```text
https://dominio-del-frontend/auth/accept-invite
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son provistas por Supabase a la
Edge Function y nunca deben agregarse a variables `VITE_*`.

## 12. Addendum funcional confirmado

Este addendum precisa el flujo solicitado para la implementacion:

- `/sistema/usuario` sera el unico modulo para crear usuarios.
- Cualquier usuario no administrador que tenga permiso para gestionar usuarios
  podra abrir `Nuevo Usuario`.
- Para un creador no administrador, el selector de roles solo mostrara:
  `Area de Pagos` (`id_rol = 2`), `Jefe de Tienda` (`id_rol = 3`) y
  `Atencion al Cliente` (`id_rol = 4`).
- `Administrador` y `flag_super_admin` no estaran disponibles para ese
  creador y el backend rechazara cualquier intento de enviarlos manualmente.
- El formulario solicitara un email valido, pero no una contraseña inicial.
- El backend utilizara `auth.admin.inviteUserByEmail` para que Supabase envie
  la notificacion al correo ingresado.
- El destinatario aceptara la invitacion y definira su propia contraseña.
- El backend creara en la misma operacion el perfil de `public.tb_usuario`,
  incluyendo rol, estado, sede y la referencia al UUID de Auth.

## 13. Mejoras funcionales del modulo `/sistema/usuario`

### 13.1 Busqueda por rol y sucursal

La barra de filtros actual permite buscar por nombre y estado. Se debe ampliar
para incluir:

| Filtro | Parametro RPC | Fuente |
| --- | --- | --- |
| Nombre | `p_nombre` | Entrada de texto |
| Rol | `p_id_rol` | `tb_rol` activo |
| Sucursal | `p_id_sucursal` | `tb_sucursal` activa |
| Estado | `p_id_estado` | `tb_estado` activo |

`f_get_tb_usuario` ya soporta `p_id_rol` y `p_id_sucursal`. La implementacion
frontend debe agregarlos al estado de filtros y enviarlos en
`usuarioService.getList`.

El boton `Buscar` debe consultar aplicando todos los filtros seleccionados.
`Limpiar` debe restablecer nombre, rol, sucursal y estado a sus valores
iniciales.

### 13.2 Sucursal visible en el datatable

La tabla de usuarios debe agregar la columna:

```text
Sucursal
```

El valor se mostrara desde `nombre_sucursal`, devuelto por
`f_get_tb_usuario`. Si el perfil no tiene sede asignada, se mostrara `-` y la
creacion de nuevos usuarios debera impedir ese caso cuando la sede sea
obligatoria para el rol.

### 13.3 Sucursal en Nuevo Usuario y Editar Usuario

El popup debe incluir un selector obligatorio:

```text
Sucursal *
```

El selector debe listar solamente sucursales activas y enviar
`p_id_sucursal` al backend tanto en la creacion como en la edicion.

En modo `Nuevo Usuario`:

- la sucursal debe seleccionarse antes de guardar;
- no se debe enviar `NULL` por defecto;
- el backend debe validar que la sucursal exista y este activa.

En modo `Editar Usuario`:

- debe mostrarse la sucursal actual;
- debe permitir cambiarla si el creador tiene autorizacion;
- el cambio debe quedar registrado en el historial de `tb_usuario`.

### 13.4 Reglas combinadas con el rol del creador

Para un creador no administrador:

- los roles disponibles continuan limitados a `Area de Pagos` (`2`), `Jefe de
  Tienda` (`3`) y `Atencion al Cliente` (`4`);
- la sucursal seleccionada debe ser validada por backend;
- no puede crear `Administrador` ni activar `flag_super_admin`.

La interfaz puede filtrar visualmente los roles y sucursales, pero el backend
debe repetir todas las validaciones.

### 13.5 Cambios frontend previstos

Se deben ajustar:

- `usuario-page.tsx`: estado de filtros para rol y sucursal;
- `usuario-popup.tsx`: selector de sucursal y carga de sucursales activas;
- `usuario-table.tsx`: columna `Sucursal`;
- `usuario.service.ts`: tipado y envio de `p_id_rol` y `p_id_sucursal`;
- la fuente de catalogos o `sucursalService` para obtener sucursales activas.

### 13.6 Criterios de aceptacion adicionales

- Filtrar por rol devuelve solo usuarios del rol seleccionado.
- Filtrar por sucursal devuelve solo usuarios de la sucursal seleccionada.
- Combinar nombre, rol, sucursal y estado aplica todos los criterios.
- La tabla muestra la sucursal correcta de cada usuario.
- `Nuevo Usuario` exige seleccionar una sucursal.
- `Editar Usuario` precarga y permite actualizar la sucursal autorizada.
- Un payload manual con una sucursal inexistente o inactiva es rechazado.
- Un usuario no administrador no puede usar filtros o payloads para elevar sus
  privilegios.
