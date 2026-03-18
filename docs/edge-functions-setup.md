# Cómo usar las Edge Functions (Supabase)

## Requisitos

1. **Supabase CLI** instalado:
   ```bash
   npm install -g supabase
   ```
   O con scoop (Windows): `scoop install supabase`

2. **Proyecto vinculado**: desde la raíz del repo:
   ```bash
   supabase login
   supabase link --project-ref TU_PROJECT_REF
   ```
   El `project-ref` lo ves en Supabase → Project Settings → General → Reference ID.

---

## Desplegar la función `calculate-distance`

1. En la raíz del proyecto:
   ```bash
   supabase functions deploy calculate-distance
   ```

2. Configurar el secret de Google (solo la primera vez):
   ```bash
   supabase secrets set GOOGLE_MAPS_API_KEY=tu_api_key_de_google
   ```
   O en el Dashboard: **Project Settings** → **Edge Functions** → **Secrets** → Add `GOOGLE_MAPS_API_KEY`.

3. La app ya llama a la función con `supabase.functions.invoke('calculate-distance', { body: ... })`; el cliente envía el token de sesión automáticamente.

---

## Probar en local (opcional)

```bash
supabase functions serve calculate-distance
```

En otro terminal, con un token de sesión válido:

```bash
curl -X POST http://localhost:54321/functions/v1/calculate-distance \
  -H "Authorization: Bearer TU_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"origen_ubicacion\":\"Ciudad de México\",\"destino_ubicacion\":\"Monterrey\"}"
```

Para tener JWT de prueba: en la app, inicia sesión y en la consola del navegador ejecuta  
`(await supabase.auth.getSession()).data.session?.access_token`.

---

## Otra función: `invite-user`

Se despliega igual:

```bash
supabase functions deploy invite-user
```

Esa función usa `SUPABASE_SERVICE_ROLE_KEY` (ya disponible en el entorno de Supabase); no hace falta configurar secrets extra.
