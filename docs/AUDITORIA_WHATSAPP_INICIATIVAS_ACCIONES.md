# Auditoría — Notificaciones WhatsApp de iniciativas / acciones

> Documento de solo lectura. Fecha de auditoría: **2026-11-06**.  
> Convención de estado: **IMPLEMENTADO** · **PARCIAL** · **PLANEADO** · **PENDIENTE DE DEPLOY** · **NO VERIFICADO**.  
> Alcance: asignación manual, seguimiento agrupado de activas, IDs `emx_XXXXX` y flujos Realizada / En Proceso / Necesito Apoyo.  
> Docs hermanos: [whatsapp.md](./whatsapp.md), [bidireccional.md](./bidireccional.md), [AUDITORIA_IA_WHATSAPP.md](./AUDITORIA_IA_WHATSAPP.md).

---

## 1. Resumen ejecutivo

El protocolo de WhatsApp para **iniciativas y acciones** (`acciones_diarias`, incluyendo las etiquetadas OKR) quedó definido así:

1. **Asignación:** no se envía WhatsApp al guardar. La notificación se detona **manualmente desde el elemento** (botón WhatsApp del diálogo).
2. **Seguimiento:** a la hora configurada (`followup_delay_minutes` / `followups_per_day`) se envía **un solo mensaje por responsable**, con **todas las actividades activas**.
3. Cada ítem se identifica con el código público **`emx_XXXXX`** (mismo criterio que el tablero).
4. Cada seguimiento lleva tres respuestas: **Realizada**, **En Proceso**, **Necesito Apoyo**.
5. El tablero se actualiza **por ID** (`emx_123 Realizada` o botón + ID si hay varias activas).

Código de producto: **IMPLEMENTADO**. Edge Functions de WhatsApp: **PENDIENTE DE DEPLOY** hasta redesplegar `whatsapp-send-action`, `whatsapp-followup-dispatcher` y `whatsapp-webhook`. Entrega real a Meta: **NO VERIFICADO** en esta auditoría (requiere envío de prueba post-deploy).

---

## 2. Árbol del flujo

```text
Acción / iniciativa (AccionFormDialog)
├── Guardar / asignar responsable
│   ├── Notificación in-app / correo al responsable                         [IMPLEMENTADO]
│   └── Auto-envío WhatsApp                                                 [ELIMINADO 2026-11-06]
│
├── Botón «Notificar asignación por WhatsApp» (manual, elemento en edición)
│   └── Edge whatsapp-send-action  message_type=initial                     [IMPLEMENTADO]
│       ├── Identidad WA del responsable (user_channel_identities)
│       ├── Texto con ID público emx_XXXXX                                  [IMPLEMENTADO]
│       ├── Plantilla Meta si no hay ventana 24 h                           [IMPLEMENTADO]
│       ├── action_delivery_log + whatsapp_messages
│       └── INSERT whatsapp_followup_jobs (N = followups_per_day)           [IMPLEMENTADO]
│
├── Cron pg_cron → whatsapp-followup-dispatcher                             [IMPLEMENTADO / PENDIENTE DE DEPLOY]
│   └── Job a nivel acción (target_type=action)
│       ├── Carga TODAS las activas del responsable (no Hecho/Verificado)
│       ├── Dedup: cancela jobs hermanos del mismo usuario + stage
│       ├── 1 mensaje digest con IDs emx_XXXXX
│       └── Botones interactive:
│           ├── 1 activa  → act:<uuid>:done|progress|support
│           └── N activas → digest:done|progress|support
│
└── Inbound Meta → whatsapp-webhook (+ fallback Vercel /api/whatsapp-webhook)
    ├── emx_123 Realizada / En Proceso / Necesito Apoyo  → ops_id_update    [IMPLEMENTADO]
    ├── Botón digest + varias activas → pide ID                             [IMPLEMENTADO]
    ├── Botón act:uuid (una sola activa) → aplica directo                   [IMPLEMENTADO]
    └── Flujos:
        ├── Realizada      → Hecho + checkpoints + evidencia
        ├── En Proceso     → En_Ejecucion + evidencia
        └── Necesito Apoyo → Bloqueado + prompt de apoyo
```

---

## 3. Identidad de la acción (`emx_XXXXX`)

| Pieza | Detalle | Estado |
| --- | --- | --- |
| Algoritmo | UUID sin guiones; últimos 12 hex `% 100000`; formato `emx_` + 5 dígitos | IMPLEMENTADO |
| UI tablero | `accionIdPublico()` en `src/features/operations/utils/accionUtils.ts` | IMPLEMENTADO |
| WhatsApp | Misma función en `src/lib/whatsappActionDigest.ts` y copiada en Edge (solo suben `index.ts`) | IMPLEMENTADO |
| Parser inbound | `emx_123`, `emx-123`, `EMX_00123` → `emx_00123` | IMPLEMENTADO |
| Resolución | Se busca **entre las activas del responsable**; no se inventa UUID | IMPLEMENTADO |
| Colisión | Espacio de 100 000 códigos; si no hay match entre activas se responde que no se encontró el ID | IMPLEMENTADO |

Ejemplo: UUID `00000000-0000-4000-8000-00000000007b` → `emx_00123`.

---

## 4. Asignación — notificación manual

### 4.1 Qué cambió

| Antes | Ahora |
| --- | --- |
| Al crear o cambiar responsable, `tryAutoSendWhatsApp` invocaba `sendAction({ messageType: 'initial' })` | Ese auto-envío se eliminó de `AccionFormDialog` |
| El botón WhatsApp existía en edición | Sigue existiendo; es **el único disparador** de la notificación de asignación |

### 4.2 Contrato actual

- El diálogo debe estar **guardado** (modo edición) y tener **responsable**.
- El responsable debe tener identidad WhatsApp activa.
- El usuario que pulsa el botón debe poder usar WhatsApp (OKRS / Super Admin, misma regla `canAccessAiAssistAndWhatsApp`).
- El mensaje inicial incluye `ID: emx_XXXXX` aunque la plantilla de settings no traiga `{{id_publico}}`.
- Tras un `initial` aceptado por Graph se programan los jobs de seguimiento.

Evidencia:

- `src/features/operations/components/AccionFormDialog.tsx` — botón `Notificar asignación por WhatsApp`.
- `src/services/whatsappIntegration.service.ts` — `sendAction`.
- `supabase/functions/whatsapp-send-action/index.ts` — `id_publico` + append de ID + `scheduleCorporateFollowups`.

### 4.3 Fuera de alcance de este cambio

- Kanban por equipos (`TeamActionFormDialog`) **sigue** con auto-envío. No es iniciativa/acción corporativa.
- Follow-up **manual por checkpoint** (`chk:`) desde el checklist del diálogo se conserva como herramienta puntual.

---

## 5. Seguimiento automático — digest de activas

### 5.1 Programación

Tras cada `initial` exitoso, si `followups_per_day > 0`:

| Campo settings | Efecto |
| --- | --- |
| `followup_delay_minutes` | Minutos hasta el 1.er job (y múltiplos para repeats) |
| `followups_per_day` | Cuántos jobs a nivel acción se insertan (`0` = sin auto) |

Jobs: `whatsapp_followup_jobs` con `checkpoint_id = null`, `payload.target_type = 'action'`, `payload.reminder_stage = configured_delay | repeat_2 | …`.

### 5.2 Envío (dispatcher)

Cuando un job vence:

1. Claim `pending` → `processing`.
2. Cancela duplicados del **mismo usuario + mismo stage** (no un mensaje por acción).
3. Carga hasta 15 acciones del responsable con estado **distinto de Hecho / Verificado** (incluye Retraso, Bloqueado, Hoy, Pendiente, En_Ejecucion).
4. Si no hay activas → cancela (`no_active_actions`).
5. Si no hay ventana 24 h → difiere (`waiting_open_session`).
6. Envía **un** interactive con el digest y marca el job `sent`.

Cuerpo (límite 1024 caracteres de WhatsApp):

```text
Seguimiento de tus actividades activas:

emx_00123 Cerrar evidencia — compromiso 2026-10-28 [Hoy]
emx_00045 Revisar inventario — compromiso 2026-10-29

Responde con el ID y el estado, por ejemplo:
emx_00123 Realizada

O usa los botones: Realizada, En Proceso o Necesito Apoyo.
```

Log outbound: `message_type=checkpoint_followup`, `target_type=action_digest`, `action_ids[]`, `public_ids[]`.

Evidencia: `supabase/functions/whatsapp-followup-dispatcher/index.ts` (`buildActiveActionsDigestBody`, `cancelDuplicateUserDigestJobs`, `loadActiveActions`).

---

## 6. Botones y actualización por ID

### 6.1 Botones (títulos visibles, máx. 20 caracteres Meta)

| Título | Código | Prefijo |
| --- | --- | --- |
| Realizada | `done` | `act:<uuid>:` (1 activa) o `digest:` (N activas) |
| En Proceso | `progress` | igual |
| Necesito Apoyo | `support` | igual |

IDs de botón:

```text
act:<accion_uuid>:done|progress|support
digest:done|progress|support
chk:<checkpoint_uuid>:done|progress|support     (follow-up manual / legacy)
tchk:<team_uuid>:<index>:done|progress|support  (equipo, fuera de este alcance)
```

### 6.2 Texto libre

| Entrada | Ruta | Efecto |
| --- | --- | --- |
| `emx_123 Realizada` | `ops_id_update` | Actualiza esa acción (también si el usuario es OKRS / puede usar el agente) |
| `emx_123` solo, tras pulsar un botón | consume `status_pick_pending` | Aplica el estado elegido al ID |
| `emx_123` solo, sin botón previo | `ops_id_update` action=null | Pide Realizada / En Proceso / Necesito Apoyo |
| Botón digest con N activas | pide ID | Lista `emx_…` + título |
| Botón / keyword con 1 activa | aplica directo | No pide ID |
| Keyword sin ID ni digest reciente | digest de activas | Misma lógica que el botón agrupado |

Parser: `src/lib/whatsappActionDigest.ts` + espejo en webhook. Política de ruteo: `src/lib/whatsappFlowRouting.ts` (`ops_id_update` tiene prioridad sobre el chatbot).

### 6.3 Efectos en tablero

| Respuesta | Checkpoints | Estado acción | Segunda pierna |
| --- | --- | --- | --- |
| **Realizada** (`done`) | Todos los activos pendientes → completados | `Hecho` | Pide evidencia (`whatsapp_result_requests`) |
| **En Proceso** (`progress`) | Sin cambio | `En_Ejecucion` (salvo ya `Bloqueado`) | Pide avance / evidencia |
| **Necesito Apoyo** (`support`) | Sin cambio | `Bloqueado` | Prompt de apoyo al líder |

Hecho ≠ Verificado. Marcar Realizada no verifica.

La evidencia posterior (texto / foto / PDF / Excel) se asocia a la acción del request, no reinterpreta el ID salvo que el usuario lo escriba otra vez.

---

## 7. Diagrama de estados

```text
[Usuario pulsa WhatsApp en el elemento]
        │
        ▼
[initial + ID emx_XXXXX] ──programa──► [jobs pending]
        │
        ▼
[cron] ──digest de TODAS las activas + 3 botones──► WhatsApp
        │
        ▼
 Usuario responde
        │
        ├─ emx_ID + Realizada      → Hecho + evidencia
        ├─ emx_ID + En Proceso     → En_Ejecucion + evidencia
        ├─ emx_ID + Necesito Apoyo → Bloqueado + apoyo
        ├─ botón (1 activa)        → mismo flujo sobre esa acción
        └─ botón (N activas)       → «Indica el ID emx_123»
                │
                ▼
         Usuario envía emx_ID
                │
                ▼
         Aplica el estado elegido
```

---

## 8. Piezas de código (inventario)

| Archivo | Rol | Estado |
| --- | --- | --- |
| `src/lib/whatsappActionDigest.ts` | IDs, digest, parser `emx_` | IMPLEMENTADO + tests |
| `src/lib/whatsappFlowRouting.ts` | Ruta `ops_id_update` y botón `digest:` | IMPLEMENTADO + tests |
| `src/features/operations/components/AccionFormDialog.tsx` | Disparo manual; sin auto-envío | IMPLEMENTADO |
| `src/features/operations/utils/accionUtils.ts` | `accionIdPublico` UI | IMPLEMENTADO |
| `supabase/functions/whatsapp-send-action/index.ts` | Initial + ID + schedule jobs | IMPLEMENTADO / PENDIENTE DE DEPLOY |
| `supabase/functions/whatsapp-followup-dispatcher/index.ts` | Digest agrupado | IMPLEMENTADO / PENDIENTE DE DEPLOY |
| `supabase/functions/whatsapp-webhook/index.ts` | Inbound ID + flujos | IMPLEMENTADO / PENDIENTE DE DEPLOY |
| `api/whatsapp-webhook.ts` | Fallback Vercel del mismo protocolo | IMPLEMENTADO (git push) |
| `api/_shared/whatsappBidirectional.ts` | Parser `digest:` | IMPLEMENTADO + tests |
| `src/features/whatsapp-inbox/whatsappThreadMeta.ts` | Etiqueta de botones en bandeja | IMPLEMENTADO |

Tests ejecutados en esta entrega (2026-11-06): `whatsappActionDigest`, `whatsappFlowRouting`, `whatsappBidirectional`, `whatsappThreadMeta` — **25 passed**.

---

## 9. Configuración que afecta el flujo

Tabla `whatsapp_followup_settings` (UI `/settings/whatsapp`):

| Campo | Efecto en este flujo |
| --- | --- |
| `followup_delay_minutes` | Cuándo sale el digest |
| `followups_per_day` | Cuántos digest/día tras cada `initial` (`0` = no hay seguimiento auto) |
| `initial_text_template` | Cuerpo del mensaje de asignación (se añade `ID:` si no trae `emx_`) |
| `checkpoint_followup_template` | Solo follow-up **manual** por checkpoint |
| `commitment_close_template` | Cierre WA (botón «Cierre WA», no parte del digest) |

Ventana Meta 24 h: el digest **interactive** exige sesión abierta. Si el `initial` usó plantilla y el usuario no escribió, el job se difiere (`waiting_open_session`).

---

## 10. Hallazgos y pendientes para auditoría operativa

| ID | Hallazgo | Severidad | Estado |
| --- | --- | --- | --- |
| A1 | Edge Functions de WhatsApp no se redesplegaron en esta sesión; producción seguirá el flujo anterior hasta `supabase functions deploy` | **Alta** | PENDIENTE DE DEPLOY |
| A2 | Sin `initial` manual no hay jobs; un responsable asignado que nunca recibe el botón no entra al digest | Media | IMPLEMENTADO (diseño) |
| A3 | Kanban por equipos conserva auto-envío; no está homologado a este protocolo | Baja | FUERA DE ALCANCE |
| A4 | Código `emx_` duplicado en Edge (no importan `_shared` porque el dashboard solo sube `index.ts`) → riesgo de drift | Media | PARCIAL |
| A5 | Colisión teórica de `emx_` entre dos activas del mismo usuario: se toma la primera match | Baja | ACEPTADO |
| A6 | Cuerpo interactive truncado a 1024; más de ~10–12 activas se recortan | Media | IMPLEMENTADO (límite Meta) |
| A7 | Entrega Graph (delivered/read/failed) y prueba E2E post-cambio | Alta | NO VERIFICADO |
| A8 | Docs `whatsapp.md` / `bidireccional.md` aún describen auto-envío y follow-up por acción suelta | Media | PARCIAL (este documento es la fuente del flujo nuevo) |

---

## 11. Checklist de verificación (post-deploy)

1. [ ] Redesplegar `whatsapp-send-action`, `whatsapp-followup-dispatcher`, `whatsapp-webhook` (`--no-verify-jwt`).
2. [ ] Asignar una acción con responsable vinculado: **no** debe salir WhatsApp solo al guardar.
3. [ ] Pulsar el botón WhatsApp del elemento: debe llegar el `initial` con `ID: emx_…`.
4. [ ] Confirmar fila en `whatsapp_followup_jobs` (`target_type=action`, `checkpoint_id` null).
5. [ ] Tener ≥2 acciones activas en el mismo responsable; al vencer el delay, **un** mensaje listando ambas con `emx_`.
6. [ ] Responder `emx_XXXXX Realizada` → estado `Hecho` + pedido de evidencia.
7. [ ] Responder `emx_XXXXX En Proceso` → `En_Ejecucion`.
8. [ ] Responder `emx_XXXXX Necesito Apoyo` → `Bloqueado` + texto de apoyo.
9. [ ] Con varias activas, pulsar **Realizada** sin ID → el bot pide el `emx_`.
10. [ ] Usuario OKRS: `emx_123 Realizada` no debe ir al chatbot Gemini.

SQL útil:

```sql
-- outbound digest
select created_at, delivery_status,
       payload->>'message_type' as message_type,
       payload->>'target_type' as target_type,
       payload->'public_ids' as public_ids,
       payload->>'followup_job_id' as job_id
from public.action_delivery_log
where channel = 'whatsapp'
order by created_at desc
limit 20;

-- jobs
select status, scheduled_at, payload->>'target_type' as target_type,
       payload->>'reminder_stage' as stage, error_message
from public.whatsapp_followup_jobs
order by created_at desc
limit 20;
```

---

## 12. Principio de diseño (para el auditor)

La notificación de asignación es un **acto explícito** sobre el elemento. El seguimiento es un **pulso de portafolio** (todas las activas), no un recordatorio suelto por tarjeta. El identificador de negocio en WhatsApp es el mismo que ve el usuario en el tablero: `emx_XXXXX`. Las tres respuestas cubren cierre, avance y bloqueo; ninguna escribe el tablero sin resolver esa identidad.
