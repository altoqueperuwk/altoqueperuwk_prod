---
name: crear-usuario-sql
description: Genera un script SQL listo para crear un usuario de Atencion al Cliente a partir unicamente de su nombre y sede.
---

# Crear Usuario SQL

Usa esta skill cuando el usuario solicite crear un usuario y entregue `nombre` y `sede`.

## Contrato de entrada

- Requerir unicamente `nombre` y `sede`.
- Si falta uno de esos dos datos, pedir solo el dato faltante.
- No pedir rol, estado, correo, username ni contrasena: se aplican las convenciones del sistema.
- Interpretar sedes como aliases. Por ejemplo, `lince` corresponde a `Sede Lince`.

## Convenciones del sistema

Generar un usuario activo de Atencion al Cliente:

- `id_rol = 4`.
- `id_estado = 1`.
- `flag_super_admin = false`.
- `username = atc_<slug_nombre>`.
- `email = atc_<slug_nombre>@atk.com`.
- `password = atc<slug_nombre><ano_actual>`.
- `nombre` conserva el valor entregado por el usuario, con espacios exteriores removidos.
- `id_sucursal` se resuelve desde `public.tb_sucursal` comparando sin distinguir mayusculas el nombre de sede, con o sin el prefijo `Sede`.

El slug debe estar en minusculas, sin tildes ni caracteres especiales, y reemplazar grupos de espacios por `_`. Para nombres de varias palabras, conservar cada palabra separada por `_`.

## Salida obligatoria

Entregar unicamente un script SQL ejecutable en DataGrip, sin ejecutar cambios en la base de datos. El script debe:

1. Abrir una transaccion.
2. Resolver la sede activa y fallar si no existe.
3. Rechazar username o email duplicados antes del `INSERT`.
4. Insertar en `public.tb_usuario` incluyendo `id_sucursal`.
5. Mostrar con `RAISE NOTICE` el usuario creado, su sede y el ID generado.
6. Cerrar la transaccion.

Usar literales SQL escapados correctamente para los valores recibidos. No usar concatenacion para ejecutar SQL dinamico. No modificar `tb_sucursal`, roles, estados ni funciones existentes.

La contrasena debe seguir el patron actual de la aplicacion, que almacena el valor directamente en `tb_usuario`; mostrarla explicitamente en el script para que el responsable pueda entregarla al usuario.

## Plantilla de salida

Adaptar los valores antes de entregar el script:

```sql
BEGIN;

DO $$
DECLARE
    v_nombre text := '<NOMBRE_ESCAPADO>';
    v_sede text := '<SEDE_ESCAPADA>';
    v_username text := 'atc_<SLUG>';
    v_password text := 'atc<SLUG><ANO>';
    v_email text := 'atc_<SLUG>@atk.com';
    v_id_sucursal bigint;
    v_id_usuario bigint;
BEGIN
    SELECT s.id
    INTO v_id_sucursal
    FROM public.tb_sucursal s
    WHERE s.id_estado = 1
      AND lower(trim(regexp_replace(s.nombre, '^sede[[:space:]]+', '', 'i'))) = lower(trim(v_sede))
    ORDER BY s.id
    LIMIT 1;

    IF v_id_sucursal IS NULL THEN
        RAISE EXCEPTION 'No existe una sede activa para: %', v_sede;
    END IF;

    IF EXISTS (SELECT 1 FROM public.tb_usuario WHERE username = v_username)
       OR EXISTS (SELECT 1 FROM public.tb_usuario WHERE email = v_email) THEN
        RAISE EXCEPTION 'Ya existe un usuario con username % o email %.', v_username, v_email;
    END IF;

    INSERT INTO public.tb_usuario (
        username,
        password,
        email,
        nombre,
        flag_super_admin,
        id_rol,
        id_estado,
        id_sucursal
    )
    VALUES (
        v_username,
        v_password,
        v_email,
        v_nombre,
        false,
        4,
        1,
        v_id_sucursal
    )
    RETURNING id INTO v_id_usuario;

    RAISE NOTICE 'Usuario creado: id=%, username=%, sede=%',
        v_id_usuario, v_username, v_id_sucursal;
END;
$$;

COMMIT;
```

No agregues campos opcionales ni ejecutes el script automaticamente.
