# WhatsApp — conexión y comunicación (guía completa)

Documentación operativa de la integración WhatsApp Cloud API en What2Do: vinculación de usuarios, envío de acciones, seguimientos con botones, respuestas entrantes, evidencia, plantillas Meta, jobs/cron y configuración UI.

> Doc hermano histórico: [whatsapp-integration-replication.md](./whatsapp-integration-replication.md) (base de réplica). Este archivo refleja el **estado actual del código** (plantillas editables, fallback 24h, dispatcher durable).

Referencias Meta:

- [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [Messages](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages)
- [Templates](https://developers.facebook.com/docs/whatsapp/message-templates)

---

## 1. Qué hace el módulo

| Capacidad | Descripción |
| --- | --- |
| Vincular usuario | Admin (`super_admin`) guarda teléfono E.164 sin `+` en `user_channel_identities` |
| Chatbot Gemini | Texto libre (OKRS / Super Admin, flag `WHATSAPP_AI_ENABLED`) → `/api/whatsapp-assistant`; propuestas se confirman con botones |
| Envío inicial | Al asignar/crear acción → mensaje al responsable (plantilla Meta o texto libre) |
| Seguimiento | Por cada checkpoint pendiente → mensaje interactivo con 3 botones |
| Cierre | Mensaje `commitment_close` al revisar compromiso |
| Respuestas | Botones o texto → actualizan checklist / estado de acción |
| Evidencia | Tras “Realizada”, pide resultado; texto/foto/PDF/Excel → comentario |
| Config | `/settings/whatsapp`: delays, plantillas de texto, preview |
| Bandeja | `/asistente-ia/seguimiento-whatsapp`: hilo unificado, respuesta manual y plantilla 24h |
| Scheduler | Tabla `whatsapp_followup_jobs` + Edge `whatsapp-followup-dispatcher` + `pg_cron` |

Regla Meta crítica: fuera de la **ventana de 24 h** (sin mensaje reciente del usuario) no se puede iniciar con texto libre; hay que usar **plantilla aprobada**.

### Disparadores de conversación (WhatsApp Manager)

Ice breakers del número (no abren sesión solos; el usuario debe tocarlos). Textos canónicos:

| Disparador | Efecto en webhook |
| --- | --- |
| `Ver actividades` | `mas_info` → listado/botones **Ops** (no Gemini) |
| `Reportar avance` | Keyword `progress` → **Ops** |
| `Necesito apoyo` | Keyword `support` → **Ops** (`Retraso`) |
| `Consulta al Bot` / `Iniciar bot` | `agent_consult` → selector interactivo **Por mensaje** / **Por voz** (OKRS/Super Admin) |
| `Por mensaje` (`aich:text`) | Continúa el agente de texto (Gemini) |
| `Por voz` (`aich:voice`) | Genera liga personal Guía y la envía por WhatsApp |

Comando opcional: `/consulta`. Keywords de canal: «quiero hablar por voz», «prefiero escribir». Tras elegir mensaje, el texto libre sigue en Agent mientras haya sesión (outbound `flow=agent` &lt; 24 h). Ligas: ver [usoLigasPersonalizadas.md](./usoLigasPersonalizadas.md).

Resiliencia del selector:

- Si Graph rechaza el interactive, se envía **texto** pidiendo responder `Por mensaje` o `Por voz`.
- Doble «Iniciar bot» en &lt; 60 s no reenvía el selector (aviso breve).
- Doble «Por voz» en &lt; 120 s reenvía la misma URL si quedó en el payload (`link`); al crear una nueva, se revocan ligas activas previas `source=whatsapp`.

---

## 2. Arquitectura

```text
React (AccionFormDialog / UserWhatsAppCard / WhatsAppSettingsPage)
  │
  ├─ RPC admin_upsert_whatsapp_identity
  ├─ app_settings key=whatsapp_followup
  └─ functions.invoke('whatsapp-send-action')
        │
        ▼
Edge whatsapp-send-action
  ├─ Graph API POST /{PHONE_NUMBER_ID}/messages
  │    ├─ type=template  (si no hay ventana 24h)
  │    └─ type=text | interactive (si hay ventana)
  ├─ action_delivery_log
  └─ INSERT whatsapp_followup_jobs (seguimientos programados)

pg_cron (* * * * *)
  └─ net.http_post → whatsapp-followup-dispatcher
        └─ envía followups pendientes + botones

Meta WhatsApp
  └─ POST webhook → whatsapp-webhook
        ├─ external_inbound_messages (raw)
        ├─ accion_checkpoints / acciones_diarias
        ├─ whatsapp_result_requests
        ├─ accion_comentarios (+ Storage evidencias)
        ├─ opcional: respuestas outbound (checkpoints / evidencia)
        └─ texto libre OKRS → APP_URL/api/whatsapp-assistant (Gemini + botones aiop)
```

### Edge Functions

| Función | `verify_jwt` | Rol |
| --- | --- | --- |
| `whatsapp-webhook` | `false` | GET verify + POST eventos Meta (+ statuses → `whatsapp_messages`) |
| `whatsapp-send-action` | `false` (auth interna) | Envío iniciado por la app |
| `whatsapp-followup-dispatcher` | `false` | Worker de jobs programados |
| `whatsapp-inbox` | `false` (auth interna + `can_manage_catalogs`) | Envío manual desde bandeja |

Deploy:

```bash
npm run supabase:deploy:whatsapp:what2do
# o:
npx supabase functions deploy whatsapp-webhook whatsapp-send-action whatsapp-followup-dispatcher whatsapp-inbox \
  --project-ref <PROJECT_REF> --no-verify-jwt --use-api
```

Config:

```toml
# supabase/config.toml
[functions.whatsapp-webhook]
verify_jwt = false

[functions.whatsapp-send-action]
verify_jwt = false

[functions.whatsapp-inbox]
verify_jwt = false
```

---

## 3. Archivos del repo

| Archivo | Rol |
| --- | --- |
| `src/services/whatsappIntegration.service.ts` | Cliente: identity + `sendAction` |
| `src/features/users/components/UserWhatsAppCard.tsx` | UI vincular teléfono |
| `src/pages/settings/WhatsAppSettingsPage.tsx` | Delays + plantillas `{{tokens}}` |
| `src/features/operations/components/AccionFormDialog.tsx` | Botones WhatsApp / Cierre / followup checklist |
| `src/services/appSettings.service.ts` | Lectura/escritura `whatsapp_followup` |
| `supabase/functions/whatsapp-send-action/index.ts` | Envío + plantilla Meta + jobs |
| `supabase/functions/whatsapp-webhook/index.ts` | Inbound + estados + evidencia + fall-through Gemini |
| `api/whatsapp-assistant.ts` | Cerebro Gemini (secreto servicio a servicio) |
| `api/_shared/whatsappAiConfirm.ts` | Parser botones `aiop:` y sí/no |
| `supabase/functions/whatsapp-followup-dispatcher/index.ts` | Procesa cola |
| `supabase/scripts/audit_whatsapp_message_flow.sql` | Auditoría SQL |
| `supabase/scripts/validate_last_5_whatsapp_outbound.sql` | Últimas 5 detonaciones + veredicto OK/ERROR (131049, sync log, identidad) |

Migraciones clave:

| Migración | Contenido |
| --- | --- |
| `20260623050000_whatsapp_channel_support.sql` | Canal `whatsapp` + RPC identity |
| `20260623053000_whatsapp_followup_settings.sql` | Settings iniciales |
| `20260705050828_whatsapp_task_templates.sql` | Plantillas de texto editables |
| `20260706165000_whatsapp_followup_jobs.sql` | Cola durable |
| `20260706171000_whatsapp_followup_dispatcher_cron.sql` | `pg_cron` cada minuto |
| `20260706173000_whatsapp_followup_jobs_optional_checkpoint.sql` | Checkpoint opcional |
| `20260708051934_update_whatsapp_action_message_template.sql` | Ajuste copy plantillas |
| `20260623130000…` / `20260706130000…` | Identidades / teléfonos duplicados |
| `20261104120000_can_use_ai_whatsapp_for_usuario.sql` | RPC chatbot: OKRS/Super Admin por `usuario_id` (solo `service_role`) |

Ruta UI settings: `ROUTES.SETTINGS_WHATSAPP` → `/settings/whatsapp`.

---

## 4. Secrets y variables

### Edge (Supabase Secrets)

| Secret | Obligatorio | Uso |
| --- | --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Sí | Bearer Graph API (System User permanente) |
| `WHATSAPP_PHONE_NUMBER_ID` | Sí | ID del número Cloud API |
| `WHATSAPP_VERIFY_TOKEN` | Sí | Token inventado para handshake GET del webhook | FALTA
| `SUPABASE_URL` | Sí | Admin client |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Admin client |
| `WHATSAPP_GRAPH_VERSION` | No | Default `v20.0` | FALTA
| `WHATSAPP_INITIAL_TEMPLATE_NAME` | No | Default `nueva_actividad_what2do` |
| `WHATSAPP_INITIAL_TEMPLATE_LANGUAGE` | No | Default `es_MX` |
| `WHATSAPP_DISPATCHER_SECRET` | Recomendado | Header `x-dispatcher-secret` del dispatcher |
| `WHATSAPP_AI_ENABLED` | No | `1` activa el AgentRouter (chatbot) para OKRS / Super Admin |
| `WHATSAPP_ASSISTANT_SECRET` | Si AI enabled | Mismo valor que en Vercel; header hacia `/api/whatsapp-assistant` |
| `APP_URL` | Si AI enabled | URL pública del tablero (`https://scrumbanemx.vercel.app`) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` / WABA | Útil | Suscripción app / plantillas (ops Meta) |

Ejemplo:

```powershell
npx supabase secrets set WHATSAPP_ACCESS_TOKEN="..." --project-ref <REF>
npx supabase secrets set WHATSAPP_PHONE_NUMBER_ID="..." --project-ref <REF>
npx supabase secrets set WHATSAPP_VERIFY_TOKEN="..." --project-ref <REF>
npx supabase secrets set WHATSAPP_DISPATCHER_SECRET="..." --project-ref <REF>
npx supabase secrets set WHATSAPP_AI_ENABLED="1" --project-ref <REF>
npx supabase secrets set WHATSAPP_ASSISTANT_SECRET="..." --project-ref <REF>
npx supabase secrets set APP_URL="https://scrumbanemx.vercel.app" --project-ref <REF>
```

### Vercel (`/api/whatsapp-assistant`)

| Variable | Uso |
| --- | --- |
| `WHATSAPP_ASSISTANT_SECRET` | Mismo valor que en Edge; header `x-whatsapp-assistant-secret` |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Ya usados por `/api/gemini-chat` |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor: RPC de acceso + `assistant_pending_ops` |
| `SUPABASE_URL` | O `VITE_SUPABASE_URL` como fallback |

No commitear secretos. Edge no necesita `GEMINI_API_KEY` si el cerebro es Vercel.

### Local `.env` (solo referencia / scripts; no `VITE_`)

Ver `.env.example`: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, verify token.

---

## 5. Conexión Meta (puesta en marcha)

1. App en Meta Developers + producto WhatsApp.  
2. WABA + número Cloud API (no mezclar con WhatsApp Business App personal).  
3. System User con token permanente:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `business_management`
4. Suscribir app al WABA:

```text
POST /{WABA_ID}/subscribed_apps
```

5. Webhook:

```text
Callback: https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-webhook
Verify token: = WHATSAPP_VERIFY_TOKEN
Suscribir campo: messages
```

6. (Recomendado) Aprobar plantilla inicial en Manager, p. ej. `nueva_actividad_what2do` / `en`, categoría Utilidad, con variables para conteo / nombre / fecha.

La prueba de “messages” en Meta solo valida el handshake. Confirmación real: escribir al número Cloud API y ver `external_inbound_messages`.

---

## 6. Modelo de datos

### Identidad de canal

`user_channel_identities` con `channel = 'whatsapp'`:

- `external_user_id` / `external_chat_id` = teléfono solo dígitos (`5255…`)
- RPC: `admin_upsert_whatsapp_identity(p_usuario_id, p_phone, p_display_name)` — solo `super_admin`
- Teléfono: 10–15 dígitos

### Logs

| Tabla | Uso |
| --- | --- |
| `action_delivery_log` | Outbound (`channel=whatsapp`, payload con `message_type`, `checkpoint_id`, ids Meta) |
| `external_inbound_messages` | Inbound raw + parseado |
| `whatsapp_result_requests` | Espera de evidencia tras “Realizada” (`waiting` \| `received` \| `expired`) |
| `whatsapp_followup_jobs` | Cola: `pending` → `processing` → `sent` \| `failed` \| `canceled` |
| `app_settings` key `whatsapp_followup` | Delays + 3 plantillas de texto |

### Constraints

Las tablas de canal deben permitir `'whatsapp'` junto a `'telegram'` en:

- `user_channel_identities`
- `action_delivery_log`
- `external_inbound_messages`

Si falta, el webhook recibe el evento pero Postgres rechaza el insert.

---

## 7. Flujo de envío (`whatsapp-send-action`)

### Auth

Valida JWT con `requireAuthUser` dentro de la función (aunque el gateway tenga `verify_jwt=false`).

### Payload

```ts
{
  accion_id: string
  usuario_id?: string          // responsable; si falta se toma de la acción
  to?: string                  // override teléfono
  message_type?: 'initial' | 'checkpoint_followup' | 'commitment_close'
  checkpoint_id?: string       // requerido en followup
  related_action_ids?: string[] // agrupa varias actividades en el mensaje inicial
}
```

Cliente:

```ts
await whatsappIntegrationService.sendAction(accionId, responsableId, {
  messageType: 'initial' | 'checkpoint_followup' | 'commitment_close',
  checkpointId,
  relatedActionIds,
})
```

### Tipos de mensaje

| `message_type` | Contenido | Cuándo |
| --- | --- | --- |
| `initial` | Resumen de actividad(es) + checklist | Asignar responsable / crear / botón WhatsApp |
| `checkpoint_followup` | Texto + botones Realizada / En proceso / Requiero apoyo | Manual por checkpoint o job automático |
| `commitment_close` | Resumen de cierre / compromiso | Botón “Cierre” en diálogo |

### Ventana 24 h + plantilla Meta

1. Busca última interacción inbound del `wa_id`.  
2. Si está dentro de 24 h → envía **texto/interactive** libre.  
3. Si no → intenta **plantilla** `WHATSAPP_INITIAL_TEMPLATE_NAME` (default `nueva_actividad_what2do`) con **2** body params: `{{1}}=ahora CDMX` (“Hoy es”), `{{2}}=nombre` (display_name / usuarios.nombre / email).  
   El botón **Más información** (tipo personalizado / quick reply) lista actividades y abre el chatbot Gemini para OKRS/Super Admin. Texto libre posterior también va al chatbot (después de evidencia y keywords operativos).  
4. Si la plantilla falla (p. ej. no existe) → fallback a texto libre (puede fallar con error 24 h de Meta).  
5. Registra en `action_delivery_log` flags `used_template`, `template_fallback`, errores.  

Error Meta `#132000` (localizable_params) = el número/orden de params del código no coincide con la plantilla aprobada.

### Plantillas de texto internas (`app_settings`)

Editables en `/settings/whatsapp` con tokens `{{...}}`:

| Key | Uso |
| --- | --- |
| `initial_text_template` | Cuerpo del mensaje inicial (session abierta) |
| `checkpoint_followup_template` | Cuerpo del followup |
| `commitment_close_template` | Cuerpo de cierre |

Tokens frecuentes: `titulo_accion`, `responsable_nombre`, `fecha_compromiso`, `checkpoint_texto`, `checklist_*`, `actividades_total`, `actividades_titulos`, `actividades_instrucciones`, etc.  
Límite práctico WhatsApp: ~4096 caracteres (con margen de seguridad en código).

### Programación de seguimientos

Tras un `initial` exitoso, si `followups_per_day > 0`:

- Inserta filas en `whatsapp_followup_jobs` por checkpoint pendiente.
- `scheduled_at` = ahora + `followup_delay_minutes` (y posibles slots del día).
- El dispatcher las envía; **no** depende solo de `EdgeRuntime.waitUntil`.

Settings:

```json
{
  "followup_delay_minutes": 5,
  "followups_per_day": 1,
  "initial_text_template": "...",
  "checkpoint_followup_template": "...",
  "commitment_close_template": "..."
}
```

Rangos UI: delay 1–240 min; followups/día 0–12.

---

## 8. Dispatcher (`whatsapp-followup-dispatcher`)

- Invocado por `pg_cron` cada minuto (`net.http_post` a la función).  
- Opcional: exige `x-dispatcher-secret` = `WHATSAPP_DISPATCHER_SECRET`.  
- Toma jobs `pending` con `scheduled_at <= now()`.  
- Si el checkpoint ya está completo → cancela.  
- Envía interactive buttons vía Graph API.  
- Actualiza job a `sent` / `failed` e incrementa `attempts`.

**Importante al clonar:** la migración de cron apunta a un `PROJECT_REF` concreto. Al replicar, edita la URL del `net.http_post` y, si usas secreto, incluye el header en el cron.

---

## 9. Webhook (`whatsapp-webhook`)

### GET (verificación)

Meta envía `hub.mode`, `hub.verify_token`, `hub.challenge`.  
Si token = `WHATSAPP_VERIFY_TOKEN` → responder el challenge en texto plano.

### POST (eventos)

1. Parsear `entry[].changes[].value.messages` / `statuses`.  
2. Guardar raw en `external_inbound_messages`.  
3. Resolver usuario por `from` / `wa_id` → `user_channel_identities`.  
4. Interpretar interacción.

### Botones (ids)

```text
act:<accion_uuid>:done|progress|support
chk:<checkpoint_uuid>:done|progress|support
tchk:<team_uuid>:<index>:done|progress|support
aiop:<pending_op_uuid>:ok|no
```

Títulos UI seguimiento: **Realizada** / **En proceso** / **Requiero apoyo**.  
Títulos UI asistente: **Confirmar** / **Cancelar**.  
Followups automáticos tras `initial` usan `act:` (nivel acción). Followup manual por checkpoint usa `chk:`. Detalle: [bidireccional.md](./bidireccional.md).

### Efectos en tablero

| Acción usuario | Efecto |
| --- | --- |
| `done` (`act:`) | Todos los checkpoints activos pendientes → acción `Hecho` + pedir evidencia |
| `done` (`chk:`) | Ese checkpoint `completado`; si no quedan pendientes → `Hecho`; si no → `En_Ejecucion` + evidencia |
| `progress` | Acción → `En_Ejecucion` (salvo ya `Bloqueado`) + pedir evidencia |
| `support` | Acción → `Retraso` + prompt de apoyo |

### Texto libre como fallback

Sinónimos reconocidos: realizada/hecho/done; en proceso/avance; requiero apoyo/ayuda/support.  
Se asocia al último delivery `checkpoint_followup` de ese `wa_id`.

### Evidencia / resultado

Tras `done`, el bot pide texto o media. El siguiente mensaje:

1. Cierra/actualiza `whatsapp_result_requests`.  
2. Descarga media Graph (`GET /{MEDIA_ID}` → URL) con el access token.  
3. Sube a Storage bucket `evidencias`.  
4. Inserta `accion_comentarios` (+ adjuntos).

Formatos: pdf, png, jpg, csv, xlsx, xls, bin.

### Chatbot Gemini — flujo independiente del Ops

Mismo número WABA, **dos routers** en `whatsapp-webhook`:

| Flujo | Quién | Qué maneja |
| --- | --- | --- |
| **Ops** | Todos | Evidencia, botones `act:`/`chk:`/`tchk:`, keywords ops, “Ver actividades” / Más información, follow-ups |
| **Agent** | OKRS / Super Admin | Solo tras **Consulta al Bot** (o `/consulta`), texto libre en sesión agent, botones `aiop:`. Precarga dashboard + OKRs + acciones propias/equipo y puede llamar herramientas de todo el tablero autorizado |

Prioridad inbound:

1. Número no vinculado → mensaje fijo.
2. Evidencia pendiente → **Ops**.
3. Botones `act:`/`chk:`/`tchk:` → **Ops** (también OKRS).
4. Botones `aiop:` → **Agent** (interacción de propuestas).
5. “Más información” / `Ver actividades` → **solo Ops** (listado/botones; **no** Gemini).
6. `Consulta al Bot` → **Agent** (invite); abre sesión ~24 h vía outbound `flow=agent`.
7. Keywords ops (`Realizada` / `Reportar avance` / `Necesito apoyo`, etc.) → **siempre Ops**, también OKRS.
8. Texto libre:
   - `can_use_ai` **y** sesión agent activa → **Agent**.
   - resto → ayuda operativa; **nunca** Gemini.
9. Si Gemini falla: reply corto; **siempre 200 a Meta**.

Payload hilo: `flow: 'ops' | 'agent'`. Política testeable: `src/lib/whatsappFlowRouting.ts`.

El cerebro vive en Vercel (`GEMINI_*`). Edge **no** necesita `GEMINI_API_KEY`. Escrituras al tablero solo tras confirmar (`assistant_pending_ops`). Inbox: `source=ai` / `flow=agent` → **Asistente**.

No commitear secretos. Flag: `WHATSAPP_AI_ENABLED`.

---

## 10. Frontend — puntos de uso

### Vincular WhatsApp

`UserWhatsAppSection` / card en ficha de usuario:

- Solo quien `canManage` (admin).  
- Guarda con `adminUpsertIdentity`.  
- Ejemplo MX: `525511981149`.

### Desde acción (`AccionFormDialog`)

- Auto-envío al asignar responsable (si hay identidad).  
- Botón **WhatsApp** → `message_type=initial`.  
- Botón **Cierre** → `commitment_close`.  
- Por checkpoint: seguimiento `checkpoint_followup`.

### Settings

`/settings/whatsapp`:

- Delay y veces/día.  
- Editores de las 3 plantillas con inserción de variables y preview.  
- Persistencia vía `appSettingsService`.

---

## 11. Contratos mínimos a preservar al clonar

```text
Usuario interno  ↔  teléfono WhatsApp normalizado
Acción           →  responsable + checkpoints
Outbound         →  action_delivery_log (message_type, checkpoint_id, wa_id)
Inbound          →  external_inbound_messages
Botón/texto      →  update checkpoint/acción
done             →  whatsapp_result_requests → comentario/evidencia
Seguimientos     →  whatsapp_followup_jobs + dispatcher
```

IDs de botón: `chk:<uuid>:<done|progress|support>` y `aiop:<uuid>:<ok|no>`.

---

## 12. Checklist de puesta en marcha

### Meta

- [ ] App + WhatsApp + WABA + número Cloud API  
- [ ] System User + token permanente + permisos  
- [ ] App suscrita al WABA  
- [ ] Webhook URL + verify token + campo `messages`  
- [ ] Plantilla `nueva_actividad_what2do` (o renombrar secret) aprobada  
- [ ] Método de pago si se envían mensajes iniciados por negocio  

### Supabase

- [ ] Migraciones aplicadas (canal, settings, jobs, cron URL corregida)  
- [ ] Secrets cargados  
- [ ] Funciones desplegadas con `--no-verify-jwt`  
- [ ] Bucket `evidencias`  
- [ ] Constraints permiten `whatsapp`  

### App

- [ ] Servicio + card de usuario + settings  
- [ ] Botones en diálogo de acción  
- [ ] Probar assign → WhatsApp → botón Realizada → evidencia  
- [ ] Chatbot (opcional): migración RPC, flag Edge, secreto igual en Vercel, `APP_URL`  

### Pruebas SQL

```sql
-- inbound
select created_at, message_type, external_user_id, payload
from public.external_inbound_messages
where channel = 'whatsapp'
order by created_at desc limit 20;

-- outbound
select created_at, delivery_status, external_chat_id, error_message, payload
from public.action_delivery_log
where channel = 'whatsapp'
order by created_at desc limit 20;

-- jobs
select status, scheduled_at, attempts, error_message, checkpoint_id
from public.whatsapp_followup_jobs
order by created_at desc limit 20;

-- evidencia pendiente
select * from public.whatsapp_result_requests
order by created_at desc limit 20;
```

---

## 13. Troubleshooting

| Síntoma | Qué revisar |
| --- | --- |
| `(#131005) Access denied` | Token, permisos, WABA vs `PHONE_NUMBER_ID` |
| `more than 24 hours` | Usuario debe escribir primero o usar plantilla Meta válida |
| Webhook “OK” en Meta pero sin inbound real | `/subscribed_apps`, número correcto, constraint canal |
| Botón no mueve tablero | `payload.button_id` = `chk:uuid:done\|progress\|support` |
| Texto no actualiza | Falta delivery previo `checkpoint_followup` |
| Sin prompt de resultado | Parser `done` + fila en `whatsapp_result_requests` |
| Jobs no salen | Cron URL, dispatcher secret, filas `pending` vencidas |
| Plantilla 132001 | Nombre/idioma no existen en el WABA; ajustar secrets |
| Chatbot no responde | `WHATSAPP_ASSISTANT_SECRET` + `APP_URL` en Edge (y en Vercel el mismo secreto); RPC `can_use_ai_whatsapp_for_usuario`; usuario OKRS/Super Admin; webhook redesplegado |
| Followups no salen | `followups_per_day=0`; jobs no insertados (migración 04130000); cron 401 (Vault `whatsapp_dispatcher_secret` ≠ Edge y/o falta `supabase_anon_key`); ventana 24 h cerrada (`waiting_open_session`) |

---

## 14. Mejoras / límites conocidos

- El cron de la migración está hardcodeado a un project-ref; hay que reescribirlo al clonar.  
- Fallback a texto tras fallo de plantilla puede seguir chocando con la regla 24 h.  
- Conviene registrar `statuses` (delivered/read/failed) además de mensajes.  
- Rotar System User token y documentar dueño en Meta Business.  
- Dashboard de salud (último inbound/outbound, jobs fallidos) aún no es producto.

---

## 15. Orden mínimo para replicar

1. Meta app + secrets + webhook verify.  
2. Migraciones canal + identity RPC.  
3. `whatsapp-send-action` + botón UI + identity card.  
4. `whatsapp-webhook` + estados + evidencia.  
5. Settings de plantillas texto.  
6. Jobs + dispatcher + cron.  
7. Plantilla Meta inicial + prueba ventana 24 h.  

Con eso queda cubierta la **conexión** (Meta ↔ Supabase ↔ usuarios) y la **comunicación** bidireccional (acciones ↔ WhatsApp ↔ tablero).
