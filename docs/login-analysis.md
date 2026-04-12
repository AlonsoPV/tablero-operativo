# Análisis técnico: login y bootstrap de autenticación

Documento orientado a **depurar** y **revisar logs** del flujo de acceso. Complementa [auth-flows.md](./auth-flows.md) con detalle de estados y mensajes de consola en desarrollo.

## Arquitectura en dos capas

| Capa | Origen | Qué representa |
|------|--------|----------------|
| **Sesión** | Supabase Auth (`supabase.auth`) | Usuario autenticado, tokens, `user.id` |
| **Perfil (ficha)** | Tabla `public.usuarios` vía `usuariosService.getByAuthId` | Rol, área, `activo`, datos del tablero |

La UI **no debe** tratar “no cargó la ficha” como “no hay sesión”, salvo que se haya forzado cierre de sesión (p. ej. token inválido).

## Estados expuestos por `AuthContext`

### Sesión (`sessionStatus`)

- `loading`: aún se resuelve sesión (listener o `getSession()`).
- `authenticated`: hay sesión válida (`session` + `user`).
- `signed_out`: no hay sesión (o se cerró).

### Perfil (`profileStatus`)

Solo tiene sentido cuando `sessionStatus === 'authenticated'`.

- `idle`: sin carga de perfil (p. ej. sin sesión).
- `loading`: se está pidiendo la ficha a Supabase.
- `loaded`: ficha cargada y usuario activo en negocio (listo para app).
- `no_profile`: sesión OK pero no existe fila en `usuarios` (o null).
- `inactive`: ficha existe pero `activo === false`.
- `timeout`: la petición de perfil superó el tiempo máximo (`AUTH_PROFILE_TIMEOUT`).
- `network_error`: error de red u otro fallo al cargar perfil (no timeout).

### Flags útiles

- `authLoading` / `isLoading` (alias): `true` **solo** mientras `sessionStatus === 'loading'`.
- `authResolved`: `true` cuando la sesión ya dejó de estar en `loading`.
- `isAuthenticated`: `sessionStatus === 'authenticated'`.
- `isReady`: sesión autenticada **y** perfil `loaded` (y lógica de negocio coherente).

### Estado combinado (`status`)

Valor derivado para atajos: `loading`, `signed_out`, `authenticated`, `profile_timeout`, `profile_network_error`, `no_profile`, `user_inactive`.

## Flujo esperado del bootstrap (orden)

1. Montaje del `AuthProvider`: `onAuthStateChange` + fallback opcional con `getSession()` si el evento inicial tardara.
2. Resolver sesión (listener o `getSession`).
3. Sin sesión → `signed_out`, salir de loader de sesión, redirigir a login en rutas protegidas.
4. Con sesión → `authenticated` + `profileStatus: loading` → cargar `getByAuthId(user.id)`.
5. Resultado del perfil → `loaded`, `no_profile`, `inactive`, `timeout` o `network_error`.

## Pantallas relevantes

### `LoginPage`

- Mientras `authLoading`: loader “Comprobando tu sesión…”.
- Con sesión y perfil cargando: “Cargando tu perfil…”.
- Tras `signIn` + `refetch('SIGNED_IN')`: si `canEnterApp`, navega al dashboard.

### `ProtectedRoute`

- Loader de **sesión** solo si `authLoading` o `sessionStatus === 'loading'`.
- Sin sesión → login (salvo error de red al validar sesión: pantalla con Reintentar).
- Con sesión y perfil en `loading` → loader “Cargando tu perfil…”.
- Perfil `timeout` / `network_error` → mensaje claro + **Reintentar** (`refetch`).
- `no_profile` / `inactive` → pantalla específica + opción volver al login.

## Logs en desarrollo (`import.meta.env.DEV`)

Prefijo: `[auth]`.

| Mensaje aproximado | Significado |
|--------------------|-------------|
| `bootstrap start` | Arranca un ciclo de bootstrap (incluye `runId`). |
| `initial bootstrap already in flight, reusing promise` | Se evitó un segundo bootstrap inicial duplicado. |
| `auth event` | Evento de Supabase (p. ej. `INITIAL_SESSION`). |
| `loading session with getSession()` | Fallback manual a `getSession()`. |
| `auth session resolved` | Sesión válida; siguiente paso es perfil. |
| `loading profile` | Comienza `getByAuthId`. |
| `profile timeout` | Venció el `Promise.race` del perfil (`AUTH_PROFILE_TIMEOUT`). |
| `profile network error` | Error distinto al timeout al cargar perfil. |
| `profile loaded` | Perfil OK. |
| `no session` | No hay sesión tras resolver. |
| `invalid refresh token → clearing session` | Token de refresco inválido; se limpia sesión y storage. |
| `bootstrap resolved` | Estado final aplicado (incluye `sessionStatus`, `profileStatus`). |
| `stale bootstrap ignored` | Una ejecución vieja terminó tarde; no se aplica al estado actual. |
| `fallback bootstrap: initial auth event did not arrive` | Se usó el fallback con `getSession()`. |
| `fallback skipped: bootstrap already in flight` | El fallback no duplicó trabajo. |

En `ProtectedRoute` (solo dev): `[auth] redirecting to login` cuando la ruta va hacia login sin sesión.

## Constantes de tiempo (referencia)

Definidas en `src/features/auth/context/AuthContext.tsx`:

- Resolución de sesión con `getSession()` en fallback: límite ~20 s (`AUTH_SESSION_TIMEOUT` interno).
- Carga de perfil: límite ~15 s antes de `AUTH_PROFILE_TIMEOUT`.
- Fallback si no llega el evento inicial del listener: ~1,5 s antes de intentar `getSession()`.

## Errores en `error` (tipo `AuthError`)

| `type` | Cuándo suele aparecer |
|--------|------------------------|
| `session_expired` | Refresh token inválido; se fuerza limpieza y re-login. |
| `timeout` | Timeout explícito al cargar perfil. |
| `network` | Red / servicio al validar sesión o al cargar perfil. |
| `no_profile` | Sesión OK, sin ficha en tablero. |
| `user_inactive` | Ficha con `activo === false`. |

## Qué mirar cuando “se queda cargando”

1. **¿Sigue en “Comprobando tu sesión”?**  
   Revisar si `sessionStatus` sigue en `loading` (red, `getSession` colgado, o evento inicial no disparado).

2. **¿Pasa a “Cargando tu perfil” y no avanza?**  
   Revisar latencia o errores de `usuarios` / RLS / red; tras el límite debería pasar a `timeout` o `network_error`, no quedar infinito.

3. **`stale bootstrap ignored`**  
   Normal si hubo carrera; el estado final lo fija la ejecución más reciente (`runId`).

4. **Refresh token**  
   Buscar `invalid refresh token` en mensajes; el flujo debe terminar en login con mensaje de sesión expirada.

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `src/features/auth/context/AuthContext.tsx` | Bootstrap, sesión, perfil, logs. |
| `src/features/auth/types/auth.types.ts` | Tipos `sessionStatus`, `profileStatus`, `AuthState`. |
| `src/components/auth/ProtectedRoute.tsx` | Loader, redirección, errores de perfil. |
| `src/features/auth/pages/LoginPage.tsx` | Submit, `refetch` tras login. |
| `src/services/auth.service.ts` | `signIn`, `getSession`, `signOut`. |
| `src/services/usuarios.service.ts` | Carga de ficha (`getByAuthId`). |
