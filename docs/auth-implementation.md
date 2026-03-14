# Implementación de autenticación

## Fuente de verdad

- **AuthContext**: única fuente de verdad. Estado: `session` (Supabase), `user` (= session?.user), `profile` (tabla usuarios), `isLoading` (solo bootstrap inicial), `isAuthenticated`, `isReady`, `error`, `logout()`, `refetch()`.
- **Supabase Auth**: persistencia en localStorage (por defecto); refresh de token automático. La app no limpia storage salvo con `signOut()`.

## Sesión inválida vs error de perfil

- **Sesión inválida**: `getSession()` devuelve sin sesión, o Supabase emite `SIGNED_OUT`. Estado: `session: null`, `user: null`, `profile: null`, `isAuthenticated: false`. Se redirige a login (solo en ese caso).
- **Error de perfil**: hay sesión Supabase válida pero perfil no existe (`no_profile`) o usuario inactivo (`user_inactive`). Estado: `session` y `user` seteados, `isAuthenticated: true`, `error` con tipo. **Nunca** se hace logout ni redirección a login por esto; se muestra pantalla específica con "Cerrar sesión".
- **Error de red**: no se pudo verificar; `isAuthenticated: false`, `error.type === 'network'`. No se asume sesión inválida; pantalla "Reintentar".

## Bootstrap inicial

1. `AuthProvider` monta con `LOADING_STATE` (`isLoading: true`).
2. Se llama `loadAuth()`: `getSession()`.
3. Solo en esta primera ejecución se mantiene `isLoading: true` hasta terminar (ref `initialCheckDoneRef`). Llamadas posteriores (p. ej. desde `onAuthStateChange`) no vuelven a poner `isLoading: true`, evitando flashes.
4. Sin sesión → `SIGNED_OUT_STATE`; con sesión → cargar perfil y actualizar estado. Error de red → estado con `error.network`.
5. Tras el primer `loadAuth()` completo, `initialCheckDoneRef.current = true`.

## Listener `onAuthStateChange`

- Una sola suscripción en `AuthProvider`.
- `SIGNED_OUT` → se setea `SIGNED_OUT_STATE` (no se llama a `loadAuth`).
- Cualquier otro evento (p. ej. `SIGNED_IN`, `TOKEN_REFRESHED`, `INITIAL_SESSION`) → se llama `loadAuth()` para actualizar sesión/perfil.

## Cierre de sesión

- **Solo** en estos casos:
  1. El usuario hace clic en "Cerrar sesión" (se llama `logout()` → `authService.signOut()`).
  2. Supabase emite `SIGNED_OUT` (p. ej. sesión invalidada en otro tab o servidor).

No se cierra sesión por: timeout manual, error temporal de perfil, error de red, cambio de ruta, refresh, ni falta temporal de datos.

## ProtectedRoute (estabilidad)

- **authLoading (isLoading)**: siempre que sea `true` se muestra solo `AuthLoader`; no se ejecuta lógica de redirección.
- **Orden de decisión**: 1) Loader si loading. 2) Error de perfil (sesión válida, no_profile/user_inactive) → pantalla con "Cerrar sesión". 3) Error de red → pantalla "Reintentar". 4) No autenticado → loader (mientras se redirige). 5) Autenticado y listo → `<Outlet />`.
- **Redirección a login**: solo cuando `!isAuthenticated` y no es error de red; y solo una vez por ciclo (ref `hasRedirectedRef`) para evitar doble navegación. Al volver a estar autenticado el ref se resetea.

## Qué se revisó y se corrigió

1. **Estado tras logout/SIGNED_OUT**: Antes se usaba un estado con `isLoading: true`, lo que dejaba el loader indefinido y no redirigía a login. Se introdujo `SIGNED_OUT_STATE` con `isLoading: false`, `isReady: true`.
2. **Error de red**: Antes cualquier fallo en `getSession()` se trataba como "no autenticado" y se redirigía a login. Ahora se distingue error de red (`network`): se muestra pantalla de reintento y no se invalida la sesión por un fallo temporal.
3. **Timers**: No existían `setTimeout`/`setInterval` ni lógica de auto-logout por tiempo en el código de auth. No se añadió ninguno.
4. **Listener**: Un único `onAuthStateChange` en `AuthProvider`; se desuscribe al desmontar.
5. **Perfil**: Error al cargar perfil (no encontrado o usuario inactivo) no dispara logout; se muestran pantallas específicas con opción de cerrar sesión.

## Logs en desarrollo

En `import.meta.env.DEV` el `AuthContext` escribe en consola:

- Inicio/fin de validación de sesión.
- Sesión encontrada o no.
- Perfil cargado o no / usuario inactivo.
- Eventos `onAuthStateChange`.
- Logout manual.

## Persistencia

Supabase client por defecto persiste la sesión en `localStorage`. No se limpia storage desde la app salvo con `signOut()`. Refresh y navegación no reinician el estado de auth; se usa el estado del contexto y, si hace falta, el listener actualiza tras refresh de token.

## Uso de `useCurrentUser` frente a `useAuth`

- **useAuth()**: sesión, perfil, loading, errores, logout, refetch. Usar para rutas protegidas, header, login.
- **useCurrentUser()**: query de React Query con el perfil (por auth id); útil donde ya se usa la query (p. ej. formularios). Tiene su propia suscripción a `onAuthStateChange` para invalidar; no reemplaza la fuente de verdad del contexto.
