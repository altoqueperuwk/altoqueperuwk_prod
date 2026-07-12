# 07. Frontend Stack y Supabase

## Objetivo

Definir el stack tecnico base del frontend nuevo y dejar documentado el acceso al nuevo proyecto de Supabase para que otra IA o desarrollador pueda iniciar implementacion sin ambiguedad.

## Stack base aprobado

- framework: `React`
- variant: `Vite`
- sistema visual obligatorio: `Untitled UI` como referencia base
- cliente backend: `@supabase/supabase-js`
- animacion obligatoria transversal: `Framer Motion`

No se debe introducir otra libreria visual como base principal del proyecto nuevo.

Regla visual adicional:

- no adoptar el dark mode negro profundo por defecto de `Untitled UI`;
- usar como fuente de verdad el dark/light mode ya refinado en este proyecto.

## Dependencia requerida

Instalar:

```bash
npm install @supabase/supabase-js
```

## Regla de instalacion del sistema visual

Para `Untitled UI`, la siguiente IA debe priorizar el uso del `CLI` oficial y su documentacion vigente.

No debe:

- clonar el repositorio completo de `Untitled UI` como base tecnica del proyecto;
- copiar carpetas enteras de demos o docs al frontend nuevo;
- depender de ejemplos externos como si fueran componentes productivos.

Si se requiere apoyo visual:

- usar el frontend actual como referencia principal;
- usar docs o ejemplos de `Untitled UI` solo como apoyo de patron;
- instalar o generar componentes puntuales via `CLI`.

## Variables de entorno

El frontend nuevo debe trabajar con estas variables:

```env
VITE_SUPABASE_URL=https://hyckmismfektoypudzar.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_qhKJor_B0UuAQphZ44HE2Q_FcnZKa-1
```

## Cliente base de Supabase

Se recomienda crear un archivo tipo:

- `src/lib/supabase.ts`
- o `src/utils/supabase.ts`

Implementacion base:

```ts
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)
```

## Ejemplo minimo de uso

```tsx
import { useEffect, useState } from "react"
import { supabase } from "./utils/supabase"

export default function App() {
  const [todos, setTodos] = useState<any[]>([])

  useEffect(() => {
    async function getTodos() {
      const { data: todos } = await supabase.from("todos").select()

      if (todos) {
        setTodos(todos)
      }
    }

    getTodos()
  }, [])

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>{todo.name}</li>
      ))}
    </ul>
  )
}
```

## Regla de arquitectura para Supabase

Aunque el cliente base puede ser simple, el proyecto nuevo no debe dejar llamadas distribuidas sin control por toda la UI.

La recomendacion es:

- `supabase.ts` como cliente base;
- `services/` para las llamadas RPC y queries;
- `hooks/` para la orquestacion de estado;
- componentes visuales sin logica de acceso directo cuando el flujo ya sea real.

## Regla de implementacion obligatoria para UI

El frontend nuevo debe conservar el sistema visual actual basado en `Untitled UI`.

No se debe:

- levantar pantallas reales con componentes default de `React` o `Vite`;
- construir formularios finales con HTML plano como solucion definitiva;
- dejar una fase intermedia con "UI temporal" esperando una futura migracion visual.

Todo modulo real debe nacer ya sobre:

- sistema visual actual tipo `Untitled UI`
- `Tailwind`
- tema visual propio del proyecto
- `Framer Motion` como capa transversal de experiencia premium moderada

## Regla de motion para el frontend nuevo

`Framer Motion` debe instalarse y usarse desde el inicio del proyecto nuevo.

Su uso esperado es transversal en:

- sidebar;
- tabs;
- cards;
- filtros;
- datatables;
- popups;
- drawers;
- dropdowns;
- transiciones de vistas;
- cambios visibles de estado.

No debe usarse para sobrecargar la interfaz.

La sensacion buscada es:

- fluida;
- limpia;
- premium;
- amigable para lectura prolongada.

## Creacion de usuarios desde frontend

La creacion de usuarios no debe salir desde `/login`.

El `login` solo existe para autenticacion.

El alta de usuarios se debe realizar desde el modulo principal de usuarios, mediante el popup administrativo correspondiente.

### Regla funcional

No debe existir:

- registro publico;
- boton `Sign up` en `/login`;
- alta libre desde la pantalla de acceso.

Debe existir:

- `signIn` en `/login`;
- alta de usuario solo desde el modulo administrativo autenticado;
- sincronizacion del usuario de negocio con `tb_usuario`.

### Recomendacion de separacion

Separar claramente:

- usuario de autenticacion de Supabase;
- usuario de negocio de `tb_usuario`.

Aunque esten relacionados, no deben confundirse como si fueran exactamente la misma entidad interna.

### Regla de negocio para frontend nuevo

La pantalla de usuarios del nuevo frontend debe contemplar:

- alta de usuario desde popup administrativo;
- alta/sincronizacion en `tb_usuario`;
- cambio de estado inline;
- popup de nuevo/editar;
- y asignacion posterior de permisos.

## Regla final para implementacion

La siguiente IA debe asumir:

1. el frontend nuevo se crea con `React + Vite`;
2. `Untitled UI` es la referencia visual oficial desde la primera implementacion visual;
3. el dark/light actual del proyecto manda por encima de defaults externos;
4. `Framer Motion` se instala desde el inicio;
5. `Supabase` es el cliente oficial del backend;
6. las variables de entorno deben respetar el prefijo `VITE_`;
7. las llamadas reales deben abstraerse en servicios y hooks;
8. `/login` no registra usuarios;
9. el alta de usuarios se realiza solo desde el modulo principal administrativo y luego se sincroniza con `tb_usuario`;
10. ninguna pantalla final debe quedar montada con componentes genericos temporales por fuera del sistema visual actual;
11. no debe cerrarse por cuenta propia el layout final de `operaciones` hasta nueva instruccion funcional.

## Checklist minimo

- [ ] Crear proyecto `React + Vite`
- [ ] Mantener el sistema visual actual como referencia
- [ ] Mantener el dark/light actual como fuente de verdad
- [ ] Instalar `Framer Motion`
- [ ] Instalar `@supabase/supabase-js`
- [ ] Configurar `.env`
- [ ] Crear `supabase.ts`
- [ ] Definir carpeta `services/`
- [ ] Definir carpeta `hooks/`
- [ ] Definir `signIn` del login
- [ ] Quitar cualquier registro publico del login
- [ ] Definir sincronizacion de usuario de negocio con `tb_usuario`
