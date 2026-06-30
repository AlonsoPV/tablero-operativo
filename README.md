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

Copia el archivo de ejemplo y completa **solo** lo que corresponda a tu entorno:

```bash
cp .env.example .env
```

**Frontend (Vite):** en `.env` defínelas con prefijo `VITE_` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Dashboard → Settings → API). Esas variables se inyectan en el **build**; **no** van en Supabase Secrets.

**Vercel Serverless Functions:** el asistente `/asistente-ia` usa `/api/gemini-chat`. Configura `GEMINI_API_KEY` en **Vercel -> Project Settings -> Environment Variables**. Opcionales: `GEMINI_MODEL` (`gemini-2.5-flash-lite`), `GEMINI_MAX_TOKENS` (`700`), `GEMINI_TEMPERATURE` (`0.25`) y `GEMINI_TIMEOUT_MS` (`20000`). No uses `VITE_GEMINI_API_KEY`.

**Edge Functions:** API keys y rol de servicio del **backend Supabase** se configuran en **Supabase → Edge Functions → Secrets** (nombres **sin** `VITE_`), no en variables `VITE_*`.

**Guía detallada** (tabla frontend vs secrets vs scripts): [docs/environment-variables.md](docs/environment-variables.md).

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
2. Añade las variables **`VITE_*`** del frontend (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) en el proyecto de Vercel.
3. Añade las variables serverless del asistente Gemini en Vercel: `GEMINI_API_KEY` obligatoria, y opcionalmente `GEMINI_MODEL`, `GEMINI_MAX_TOKENS`, `GEMINI_TEMPERATURE`, `GEMINI_TIMEOUT_MS`. No llevan prefijo `VITE_`.
4. Los **secrets** de Edge Functions de Supabase se configuran en el **Dashboard de Supabase**, no como variables `VITE_*` (ver [docs/environment-variables.md](docs/environment-variables.md)).
5. El build usa por defecto `npm run build` y el directorio de salida `dist`.

Para productivo de Scrumban, usa el proyecto Supabase `xhpasmjzuwifmjhrsumb`:

```env
VITE_SUPABASE_URL=https://xhpasmjzuwifmjhrsumb.supabase.co
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_MAX_TOKENS=700
GEMINI_TEMPERATURE=0.25
GEMINI_TIMEOUT_MS=20000
```

La clave `VITE_SUPABASE_ANON_KEY` debe ser la `anon public` del proyecto productivo. La clave `GEMINI_API_KEY` se configura en Vercel sin prefijo `VITE_`.

La configuración está en `vercel.json` (SPA: todas las rutas reescriben a `index.html`, excepto `/api/*`, assets y docs).

## Stack

- **Frontend:** React 18, Vite, TypeScript
- **UI:** TailwindCSS, shadcn/ui
- **Estado y datos:** TanStack Query (React Query), Zustand
- **Backend:** Supabase (Auth, Postgres, Storage)
- **Deploy:** Vercel

## Licencia

Privado / Uso interno.
