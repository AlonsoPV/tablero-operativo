# WhatsApp — seguimiento y comunicación bidireccional

Guía enfocada en **cómo el tablero habla con WhatsApp y cómo WhatsApp actualiza el tablero**: recordatorios automáticos, botones interactivos, texto libre, evidencia y estados de acción/checklist.

Doc general de conexión Meta / deploy: [whatsapp.md](./whatsapp.md).

---

## 1. Idea general

```text
Tablero  ──envía──►  WhatsApp (inicial + seguimientos)
WhatsApp ──responde► Tablero (botones / texto / media)
Tablero  ──pide───►  evidencia / contacto de apoyo
WhatsApp ──envía──►  comentario + adjuntos
```

No es un chat libre genérico: es un **protocolo de seguimiento de acciones** ligado a `acciones_diarias` + `accion_checkpoints`.

---

## 2. Piezas involucradas

| Pieza | Rol en seguimiento |
| --- | --- |
| `whatsapp-send-action` | Envía `initial` / `checkpoint_followup` / `commitment_close`; programa jobs |
| `whatsapp_followup_jobs` | Cola durable de recordatorios |
| `whatsapp-followup-dispatcher` | Cron: envía jobs vencidos con botones |
| `whatsapp-webhook` | Interpreta respuestas y escribe en DB |
| `action_delivery_log` | Historial outbound (asocia followup ↔ checkpoint/acción) |
| `external_inbound_messages` | Historial inbound (diagnóstico + auditoría) |
| `whatsapp_result_requests` | Ventana para capturar evidencia tras respuesta |
| `app_settings.whatsapp_followup` | Delay, veces/día, plantillas de texto |

Frontend que dispara envíos:

- `AccionFormDialog` — WhatsApp, Cierre, followup por checkpoint, auto al asignar
- `/settings/whatsapp` — `followup_delay_minutes`, `followups_per_day`, templates

---

## 3. Ciclo de seguimiento (outbound)

### 3.1 Disparadores

| Origen | `message_type` | Efecto |
| --- | --- | --- |
| Asignar/crear acción o botón **WhatsApp** | `initial` | Mensaje de actividades + **programa jobs** |
| Botón por checkpoint / dispatcher | `checkpoint_followup` | Mensaje interactivo con 3 botones |
| Botón **Cierre** | `commitment_close` | Resumen de compromiso (sin botones de chk) |

Cliente:

```ts
whatsappIntegrationService.sendAction(accionId, responsableId, {
  messageType: 'initial' | 'checkpoint_followup' | 'commitment_close',
  checkpointId, // solo followup puntual
})
```

### 3.2 Cómo se programan los recordatorios

Tras un `initial` exitoso, `scheduleCheckpointReminders`:

1. Lee settings `whatsapp_followup`.
2. Cuenta checkpoints pendientes de la acción.
3. Inserta `followups_per_day` jobs (si es `0`, no programa nada).
4. Cada job:
   - `checkpoint_id: null` (seguimiento a nivel **acción**, no un chk suelto)
   - `scheduled_at = now + delay_minutes * (n)`
   - `payload.target_type = 'action'`
   - `payload.reminder_stage = configured_delay | repeat_2 | …`

Defaults: **5 minutos** de delay, **1** followup/día.

### 3.3 Dispatcher (envío automático)

`pg_cron` cada minuto → `POST .../whatsapp-followup-dispatcher`

1. Claim jobs `pending` con `scheduled_at <= now` (máx. 20; marca `processing`).
2. Dedup por acción/usuario/teléfono/stage (cancela duplicados).
3. Si la acción ya está `Hecho`/`Verificado` (o checkpoint legacy ya completo) → `canceled`.
4. Envía mensaje **interactive button**.
5. Escribe `action_delivery_log` con `message_type=checkpoint_followup`, `source=followup_job`.
6. Marca job `sent` (o `failed` + `attempts++`).

Auth **obligatoria**: header `x-dispatcher-secret` = `WHATSAPP_DISPATCHER_SECRET` (sin secreto → 401).

### 3.4 Forma del mensaje de seguimiento

**Modo acción** (jobs actuales, `checkpoint_id` null):

- Lista pendientes + instrucciones.
- Botones con id a nivel acción:

```text
act:<accion_uuid>:done
act:<accion_uuid>:progress
act:<accion_uuid>:support
```

**Modo checkpoint** (envío manual / legacy `target_type=checkpoint_legacy`):

- Plantilla `checkpoint_followup_template` con `{{titulo_accion}}`, `{{checkpoint_texto}}`.
- Botones:

```text
chk:<checkpoint_uuid>:done
chk:<checkpoint_uuid>:progress
chk:<checkpoint_uuid>:support
```

Títulos visibles (máx. corto de WhatsApp):

| Título | Código |
| --- | --- |
| Realizada | `done` |
| En proceso | `progress` |
| Requiero apoyo | `support` |

Cuerpo interactive limitado a **1024** caracteres (`fitInteractiveBody`).

---

## 4. Ciclo de respuesta (inbound / bidireccional)

```text
Usuario toca botón o escribe
        │
        ▼
Meta → whatsapp-webhook
        │
        ├─ resolveUsuarioId(wa_id) vía user_channel_identities
        ├─ parse button id  OR  normalizeReplyText
        ├─ applyActionResponse / applyCheckpointResponse
        ├─ (done|progress) → requestResultComment
        ├─ (support) → sendSupportContactPrompt
        └─ log external_inbound_messages
```

### 4.1 Resolución de usuario

El `from` / `wa_id` se busca en `user_channel_identities` (`channel=whatsapp`, `status=active`) contra `external_user_id` / `external_chat_id` (variantes de lada).

Sin identidad vinculada, el mensaje se puede loguear pero **no** actualiza el tablero de un usuario concreto.

### 4.2 Parsers

**Botones**

```text
act:<uuid>:(done|progress|support)
chk:<uuid>:(done|progress|support)
```

**Texto libre** (sinónimos, sin acentos):

| Respuesta | Palabras |
| --- | --- |
| `done` | realizada, realizado, hecho, lista, listo, done |
| `progress` | en proceso, proceso, avance, avanzando, progress |
| `support` | requiero apoyo, necesito apoyo, necesito ayuda, ayuda, apoyo, support |

El texto libre se asocia al último `action_delivery_log` de ese teléfono con `message_type=checkpoint_followup` (y `checkpoint_id` si aplica).

### 4.3 Efectos en el tablero

#### Respuesta a nivel **acción** (`act:…`)

| Código | Checkpoints | Estado acción (tablero) |
| --- | --- | --- |
| `done` | Marca **todos** los activos pendientes como completados | `Hecho` |
| `progress` | — | `En_Ejecucion` |
| `support` | — | `Bloqueado` |

Además `done` / `progress` abren captura de resultado.

#### Respuesta a nivel **checkpoint** (`chk:…`)

| Código | Checkpoint | Estado acción (tablero) |
| --- | --- | --- |
| `done` | Ese checkpoint → `completado=true` | Si no quedan pendientes → `Hecho`; si no → `En_Ejecucion` |
| `progress` | — | `En_Ejecucion` (salvo ya `Bloqueado`) |
| `support` | — | `Bloqueado` |

Team (fuera del núcleo corporate): botones `tchk:<team_uuid>:<index>:done|progress|support`.

`done` / `progress` también piden evidencia.

### 4.4 Pedido de resultado (segunda pierna bidireccional)

Tras `done` o `progress`:

1. Inserta `whatsapp_result_requests` (`status=waiting`, ~30 min de vigencia típica).
2. Envía texto al usuario:

```text
*Realizada* | *En proceso*

Responde con el numero de actividad y tu avance.

*Actividades*
1. …
…

Puedes enviar texto, foto, PDF o Excel.
```

3. El **siguiente** mensaje de ese `wa_id` (texto o media) se interpreta como evidencia:
   - media → Graph download → bucket `evidencias`
   - insert `accion_comentarios` (+ adjuntos)
   - cierra/actualiza la request (`received`)

Formatos media: pdf, png, jpg, csv, xlsx, xls.

### 4.5 Requiero apoyo

Además de poner la acción en `Bloqueado`, el webhook envía un prompt de contacto/apoyo (`sendSupportContactPrompt`) y deja `support_contact_sent` en el payload outbound del hilo.

### 4.6 Otros inbound útiles

- Botón de plantilla **personalizado** (“Más información” / “Ver actividades”): lista actividades abiertas y, si el usuario es OKRS/Super Admin, abre el chatbot Gemini. El clic llega como `type=button` (quick reply), no como URL.
- Todo inbound se guarda (idealmente) como raw para auditoría aunque no se reconozca el botón.

---

## 5. Diagrama de estados (resumen)

```text
[initial enviado]
       │
       ▼
[jobs pending] ──cron──► [followup con botones]
       │
       ▼
 Usuario: Realizada / En proceso / Requiero apoyo
       │
       ├─ done     → checkpoints/acción + pedir evidencia
       ├─ progress → En_Ejecucion + pedir evidencia
       └─ support  → Bloqueado + mensaje de apoyo
       │
       ▼
 Usuario envía texto/foto
       │
       ▼
 comentario en acción (+ storage)
```

---

## 6. Configuración que afecta el seguimiento

Tabla `whatsapp_followup_settings` (UI `/settings/whatsapp`):

| Campo | Efecto |
| --- | --- |
| `followup_delay_minutes` | Minutos hasta el 1.er job (y múltiplos para repeats) |
| `followups_per_day` | Cuántos jobs **a nivel acción** se insertan tras cada `initial` (`0` = sin auto) |
| `checkpoint_followup_template` | Texto del followup **manual** por checkpoint (`chk:`) |
| `initial_text_template` | Texto del mensaje inicial (sesión 24h abierta) |
| `commitment_close_template` | Texto del cierre |

Tras `initial`, el dispatcher envía interactive con `act:` (lista de pendientes). El followup puntual desde el diálogo de acción sigue usando `chk:`.

Nota de ventana 24h: los followups **interactive** requieren sesión abierta (el usuario debió escribir o recibir mensaje reciente). Si el `initial` usó plantilla Meta y el usuario no respondió, el followup puede fallar en Graph.

---

## 7. Tablas / campos clave para operar

### Outbound log

```sql
select created_at, delivery_status, external_chat_id,
       payload->>'message_type' as message_type,
       payload->>'checkpoint_id' as checkpoint_id,
       payload->>'source' as source,
       payload->>'followup_job_id' as job_id,
       error_message
from public.action_delivery_log
where channel = 'whatsapp'
order by created_at desc
limit 30;
```

### Jobs

```sql
select id, status, scheduled_at, attempts, checkpoint_id,
       payload->>'target_type' as target_type,
       payload->>'reminder_stage' as stage,
       error_message
from public.whatsapp_followup_jobs
order by created_at desc
limit 30;
```

Estados job: `pending` → `processing` → `sent` | `failed` | `canceled`.

### Inbound

```sql
select created_at, message_type, external_user_id,
       payload->>'kind' as kind,
       payload->>'response' as response,
       payload->>'button_id' as button_id,
       accion_id, checkpoint_id
from public.external_inbound_messages
where channel = 'whatsapp'
order by created_at desc
limit 30;
```

### Evidencia pendiente

```sql
select id, status, wa_id, accion_id, checkpoint_id, created_at, expires_at
from public.whatsapp_result_requests
where status = 'waiting'
  and expires_at > now()
order by created_at desc;
```

---

## 8. Contrato de IDs (no romper al clonar)

Mantener estos formatos; el webhook depende de ellos:

```text
chk:<checkpoint_uuid>:done|progress|support
act:<accion_uuid>:done|progress|support
tchk:<team_uuid>:<checklist_index>:done|progress|support
```

Si cambias el prefijo o el orden, las respuestas dejarán de actualizar el tablero aunque WhatsApp muestre el botón.

Delivery log del followup automático debe conservar:

```json
{
  "message_type": "checkpoint_followup",
  "checkpoint_id": null,
  "target_type": "action",
  "source": "followup_job",
  "followup_job_id": "..."
}
```

para que el texto libre encuentre contexto.

Auditoría SQL: [supabase/scripts/audit_whatsapp_bidirectional.sql](../supabase/scripts/audit_whatsapp_bidirectional.sql).

---

## 9. Prueba manual del loop completo

1. Vincular WhatsApp del responsable (`UserWhatsAppCard`).  
2. Crear/asignar acción con 2+ checkpoints.  
3. Confirmar `action_delivery_log` `initial` y jobs `pending`.  
4. Esperar delay (o adelantar `scheduled_at`) y ver job `sent` + mensaje con botones.  
5. Tocar **En proceso** → acción `En_Ejecucion` + prompt de resultado.  
6. Enviar foto/texto → comentario en la acción.  
7. Tocar **Realizada** (o texto “hecho”) → checkpoints/acción avanzan a `Hecho`.  
8. Tocar **Requiero apoyo** en otra acción → `Bloqueado`.  

---

## 10. Fallas típicas del seguimiento bidireccional

| Síntoma | Causa |
| --- | --- |
| No llegan recordatorios | `followups_per_day=0`, cron URL mala, dispatcher secret, jobs no `pending` |
| Llega followup pero botón no mueve nada | `button_id` distinto de `chk:`/`act:`; identidad no vinculada |
| Texto “realizada” no funciona | No hay delivery `checkpoint_followup` reciente para ese `wa_id` |
| Pide evidencia pero el adjunto no aparece | Token media Graph, bucket `evidencias`, request expirada |
| Followup falla con 24h | Usuario no abrió sesión; hace falta que escriba o reenviar plantilla |
| Jobs duplicados | Dispatcher dedupa por stage; revisar cancels en tabla |

---

## 11. Archivos a tocar si se replica solo este loop

1. `supabase/functions/whatsapp-send-action` — programar jobs + enviar followup manual  
2. `supabase/functions/whatsapp-followup-dispatcher` — worker  
3. `supabase/functions/whatsapp-webhook` — parsers + apply* + result requests  
4. Migraciones `whatsapp_followup_jobs` + cron  
5. Settings UI + `AccionFormDialog` botones  

Con eso se replica el **seguimiento automático** y la **comunicación bidireccional** acción ↔ WhatsApp ↔ tablero.
