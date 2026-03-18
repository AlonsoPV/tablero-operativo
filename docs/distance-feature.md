# Módulo de distancias (Google Routes API)

## Resumen

El tablero incluye un módulo para calcular distancias **ida y vuelta** entre **orígenes y destinos de catálogo**, usando **Google Routes API** (Compute Routes). La API key de Google **no se expone en el frontend**: la llamada se hace desde una **Supabase Edge Function**. Si el par (origen, destino) ya está en el **catálogo de distancias** (`distance_catalog`), se devuelve el resultado **sin llamar a Google**.

## Flujo actual (reestructurado)

1. El usuario elige **origen** y **destino** en dropdowns (catálogos `distance_origins` y `distance_destinations`). La ubicación se autocompleta desde el registro.
2. El usuario pulsa **"Calcular distancia"**. El frontend envía `origin_id` y `destination_id` (UUIDs) a la Edge Function.
3. La Edge Function:
   - Lee las direcciones desde `distance_origins` y `distance_destinations`.
   - Busca en `distance_catalog` un registro activo con `(origin_id, destination_id, route_mode)`. Si existe → devuelve `km_ida`, `km_vuelta`, `km_total` (y opcionalmente duraciones) **sin llamar a Google**.
   - Si no existe: llama a Google **dos veces** (ida: origen → destino; vuelta: destino → origen), calcula `km_total = km_ida + km_vuelta`, inserta en `distance_catalog` con snapshots y devuelve el resultado.
4. El frontend muestra la tarjeta con ida, vuelta y total. El usuario puede pulsar **"Guardar solicitud"** para insertar en `distance_requests` (ruta, fecha, hora_alta, origin_id, destination_id, distance_catalog_id, km_ida, km_vuelta, km_total, created_by).
5. El historial visible es la tabla de **solicitudes** (`distance_requests`), no la tabla antigua `distance_queries`.

## Arquitectura

| Capa | Ubicación | Responsabilidad |
|------|-----------|-----------------|
| **UI** | `src/features/distance/` | DistanceDashboardPage: DistanceRequestForm (origen/destino select + ubicación readonly), DistanceResultCard (ida/vuelta/total), DistanceRequestsTable |
| **Hooks** | useOrigins, useDestinations, useCalculateRoute, useDistanceRequests, useCreateDistanceRequest | Listas de orígenes/destinos, mutación calcular ruta, lista y creación de solicitudes |
| **Servicios** | origins.service, destinations.service, distance.service | List/get orígenes y destinos; calculateRoute (Edge Function), listRequests, createRequest |
| **Backend** | `supabase/functions/calculate-distance/index.ts` | Recibe origin_id/destination_id; lee direcciones de BD; consulta distance_catalog; si no hay hit, dos llamadas a Google (ida + vuelta); inserta en distance_catalog; devuelve km_ida, km_vuelta, km_total |
| **BD** | distance_origins, distance_destinations, distance_catalog, distance_requests | Catálogos de orígenes/destinos; caché maestro de rutas por par; solicitudes del tablero (RLS por created_by) |

## Tablas (nuevas; las antiguas se mantienen)

- **distance_origins**: id, nombre, ubicacion, latitud, longitud (nullable), activo, created_at, updated_at. RLS: lectura para todos; inserción/actualización solo admins.
- **distance_destinations**: misma estructura.
- **distance_catalog**: id, origin_id, destination_id, snapshots (nombre/ubicación), km_ida, km_vuelta, km_total, meters_ida/vuelta, duracion_ida_segundos, duracion_vuelta_segundos, route_mode, api_source, activo. **UNIQUE (origin_id, destination_id, route_mode)**. RLS: SELECT para usuarios; INSERT/UPDATE desde Edge Function (service role).
- **distance_requests**: id, ruta, fecha, hora_alta, origin_id, destination_id, distance_catalog_id, km_ida, km_vuelta, km_total, created_by, created_at, updated_at. RLS: cada usuario ve/inserta las propias.

Las tablas **distance_queries** y **distance_cache** siguen existiendo; el nuevo flujo no las usa (no se eliminan en esta reestructuración para no perder historial).

## Origen = destino

**Decisión documentada:** el formulario del tablero **exige origen ≠ destino** (validación Zod con refinamiento). Si en el futuro se permite origen = destino, ida y vuelta serán iguales y total = 2 × ida; la Edge Function ya soporta ese caso (dos llamadas a Google devolverían el mismo valor).

## Geocoding futuro

Los campos `latitud` y `longitud` en `distance_origins` y `distance_destinations` están preparados para rellenar en una fase posterior (Geocoding API o Places). La Edge Function usa hoy la dirección en texto (`ubicacion`); en el futuro se puede usar coordenadas para mayor precisión si se desea.

## Configuración

### Variable de entorno (Edge Function)

En **Supabase → Project Settings → Edge Functions → Secrets** (o `supabase secrets set`):

- **`GOOGLE_MAPS_API_KEY`**: API key de Google Cloud con **Routes API** habilitada.

### Base de datos

Aplicar las migraciones en orden:

```bash
supabase db push
```

Incluye: `20260313320000_distance_catalogs_and_requests.sql` (tablas nuevas y RLS) y `20260313320001_seed_distance_origins_destinations.sql` (orígenes/destinos de ejemplo: DHL Macrocentro, Palmar, Medix).

### Google Maps Platform

Igual que antes: billing, activar Routes API (Directions / Compute Routes), API key restringida y **solo en la Edge Function**.

## API usada

- **Compute Routes** (POST `https://routes.googleapis.com/directions/v2:computeRoutes`).
- Dos llamadas por par nuevo: una ida (origen → destino), una vuelta (destino → origen).
- Waypoints con **address** (texto). Respuesta: `routes[0].distanceMeters` y `routes[0].duration`; se guardan km, metros y duración en segundos en `distance_catalog`.

## Posibles mejoras (V2)

- **CRUD de orígenes y destinos** desde la app (páginas bajo configuración), siguiendo el patrón de Áreas/Statuses.
- **Geocoding**: rellenar latitud/longitud en orígenes y destinos; opcionalmente usar coordenadas en la Edge Function.
- **Autocomplete de direcciones** (Places API) al crear/editar orígenes y destinos.
- **Modo de transporte** en el formulario (WALK, BICYCLE; el backend ya acepta `route_mode`).
