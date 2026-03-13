# Tablero Operativo

Boilerplate de tablero operativo web: React, Vite, TypeScript, TailwindCSS, shadcn/ui, React Query, Zustand y Supabase.

## Requisitos

- Node.js 18+
- npm (o pnpm/yarn)

## Instalación

```bash
npm install
```

## Variables de entorno

Copia el archivo de ejemplo y completa con tus credenciales de Supabase:

```bash
cp .env.example .env
```

Edita `.env` y define:

- `VITE_SUPABASE_URL`: URL de tu proyecto Supabase
- `VITE_SUPABASE_ANON_KEY`: Clave anónima (pública) de Supabase

Puedes obtener estos valores en [Supabase Dashboard](https://app.supabase.com) → tu proyecto → Settings → API.

## Desarrollo

```bash
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173). La app se recarga al guardar cambios.

## Scripts

| Comando      | Descripción              |
| ------------ | ------------------------ |
| `npm run dev`    | Servidor de desarrollo   |
| `npm run build`  | Build de producción      |
| `npm run preview`| Vista previa del build   |
| `npm run lint`   | Ejecutar ESLint          |

## Estructura del proyecto

```
src/
├── components/    # UI, layout y compartidos
├── pages/        # Páginas (dashboard, auth, settings)
├── features/     # Módulos por dominio (operations, metrics, users)
├── hooks/        # Hooks reutilizables
├── lib/          # Supabase, utils
├── store/        # Estado global (Zustand)
├── services/     # Llamadas a API
├── types/        # Tipos TypeScript
├── constants/    # Constantes y rutas
├── styles/       # Estilos globales
├── providers/    # React Query y otros providers
└── routes/       # Configuración de React Router
```

## Deploy en Vercel

1. Conecta el repositorio en [Vercel](https://vercel.com).
2. Añade las variables de entorno `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en el proyecto.
3. El build usa por defecto `npm run build` y el directorio de salida `dist`.

La configuración está en `vercel.json` (SPA: todas las rutas reescriben a `index.html`).

## Stack

- **Frontend:** React 18, Vite, TypeScript
- **UI:** TailwindCSS, shadcn/ui
- **Estado y datos:** TanStack Query (React Query), Zustand
- **Backend:** Supabase (Auth, Postgres, Storage)
- **Deploy:** Vercel

## Licencia

Privado / Uso interno.
