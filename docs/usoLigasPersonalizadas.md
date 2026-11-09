# SCRUMBAN — INTEGRACIÓN DE SELECTOR DE CHAT Y VOZ EN WHATSAPP

Actúa como arquitecto senior de software, experto en React, TypeScript, Supabase, Edge Functions, Meta WhatsApp Cloud API, Retell AI y automatización de procesos.

## OBJETIVO

Optimizar la funcionalidad existente de automatización de WhatsApp de Scrumban.

Cuando el usuario pulse «Iniciar bot», el sistema debe enviar un mensaje interactivo por WhatsApp ofreciendo dos opciones:

1. Hablar por mensaje.
2. Hablar por voz.

La primera opción debe iniciar o continuar la conversación de texto con el agente IA dentro de WhatsApp.

La segunda debe generar y enviar una liga personalizada para conversar por voz con el agente de Retell.

Ambos canales deben conservar la identidad del usuario, sus permisos y el contexto operativo disponible.

## 1. FUENTE DE VERDAD: DOCUMENTACIÓN EXISTENTE

IMPORTANTE:

El usuario proporcionará un archivo Markdown que documenta la funcionalidad de ligas personalizadas de Retell.

Antes de implementar:

1. Localiza y lee completamente ese Markdown.
2. Identifica la arquitectura actual de generación de ligas.
3. Identifica los servicios, funciones, tablas y endpoints involucrados.
4. Determina cómo se generan, almacenan, validan y consumen las ligas personalizadas.
5. Identifica cómo se relacionan las ligas con usuarios, sesiones y agentes.
6. Reutiliza la implementación existente.

No inventes endpoints, nombres de tablas ni mecanismos de autenticación que no existan.

Si la documentación está incompleta, inspecciona el repositorio y presenta los hallazgos.

No reemplaces una implementación funcional por una arquitectura nueva sin justificación.

## 2. AUDITAR LA AUTOMATIZACIÓN EXISTENTE

Localiza la funcionalidad «Iniciar bot» en el módulo de automatización de WhatsApp.

Inspecciona:

- Componentes de la interfaz.
- Configuración de automatizaciones.
- Webhooks de Meta.
- Envío de mensajes.
- Recepción de respuestas.
- Ruteo hacia el agente IA.
- Integración con Retell.
- Identidades de WhatsApp.
- Sesiones conversacionales.
- Permisos y políticas RLS.

Identifica el evento exacto que dispara «Iniciar bot».

Determina si se trata de un botón en la aplicación, una acción interactiva de WhatsApp o una automatización interna.

Respeta el comportamiento y los contratos existentes.

## 3. NUEVO FLUJO DE INICIO

Cuando se active «Iniciar bot»:

1. Identificar al usuario y la conversación correspondiente.
2. Validar permisos y estado de la integración.
3. Enviar un mensaje interactivo con dos opciones.
4. Esperar la selección del usuario.
5. Continuar por el canal seleccionado.

Mensaje propuesto:

"¡Hola! Soy tu asistente operativo de Scrumban.

Puedo ayudarte a consultar actividades, revisar prioridades, resolver bloqueos y dar seguimiento a tus objetivos.

¿Cómo prefieres conversar?"

Opciones:

- Por mensaje
- Por voz

Utilizar el formato interactivo compatible con Meta WhatsApp Cloud API.

Respetar la ventana de conversación de 24 horas y las restricciones de plantillas aprobadas.

Si la ventana está cerrada, utilizar una plantilla válida cuando corresponda. No intentar enviar mensajes interactivos incompatibles.

## 4. OPCIÓN A — HABLAR POR MENSAJE

Cuando el usuario seleccione «Por mensaje»:

1. Registrar la selección.
2. Activar o continuar el flujo conversacional de texto existente.
3. Asociar la conversación con la identidad autorizada del usuario.
4. Conservar el contexto disponible.
5. Enviar una respuesta inicial breve.

Ejemplo:

"Perfecto. Podemos continuar por aquí.

Puedes preguntarme por tus pendientes, prioridades, acciones bloqueadas u OKRs. ¿Qué necesitas revisar?"

### Reglas

- Reutilizar el agente IA actual de Scrumban.
- No crear un segundo chatbot independiente.
- Mantener las herramientas y permisos existentes.
- No reiniciar innecesariamente el historial.
- Evitar respuestas duplicadas.
- Priorizar comandos operativos sobre respuestas genéricas.
- Conservar los flujos existentes de actualización de acciones.
- No permitir que el chatbot intercepte respuestas destinadas a otros flujos operativos.

## 5. OPCIÓN B — HABLAR POR VOZ

Cuando el usuario seleccione «Por voz»:

1. Identificar al usuario autorizado.
2. Consultar la implementación existente de ligas personalizadas.
3. Generar o recuperar una liga válida según la política documentada.
4. Asociar la liga con el usuario y la sesión.
5. Enviar la liga por WhatsApp.
6. Permitir iniciar una conversación con el agente Retell.

Mensaje propuesto:

"Perfecto. Puedes hablar conmigo por voz desde este enlace:

[ENLACE PERSONALIZADO]

Al abrirlo, podrás iniciar la conversación con tu asistente operativo".

### Requisitos

- Utilizar el mecanismo existente de ligas personalizadas.
- No exponer API keys ni credenciales de Retell.
- No generar enlaces permanentes sin controles de seguridad.
- Respetar expiración y revocación según la implementación documentada.
- Validar permisos antes de iniciar la sesión.
- Evitar reutilización indebida de enlaces.
- Manejar enlaces vencidos o inválidos.
- Evitar crear múltiples sesiones innecesarias.
- Registrar el origen WhatsApp de la sesión.

Si la arquitectura existente requiere crear la sesión al abrir el enlace, conservar ese comportamiento.

No crear llamadas Retell anticipadamente si no son necesarias.

## 6. CONTINUIDAD ENTRE CANALES

WhatsApp y Retell deben compartir la identidad operativa del usuario.

Cuando existan integraciones compatibles, permitir continuidad contextual.

Ejemplo:

El usuario consulta sus acciones en WhatsApp y posteriormente abre el enlace de voz.

Retell debe poder reconocer al usuario autorizado y consultar sus acciones mediante las mismas herramientas del sistema.

### Importante

No asumir que Retell tiene acceso automático al historial de WhatsApp.

Identificar cómo se comparte actualmente el contexto.

Si no existe una capa común, proponer una integración segura y mínima.

No transferir historiales completos ni información sensible innecesaria.

La continuidad debe basarse en identidad, permisos y contexto autorizado, no en confiar únicamente en parámetros del enlace.

## 7. EXPERIENCIA DE USUARIO

Aplicar principios Lean y UX conversacional.

El usuario debe poder:

- Iniciar el bot con una sola interacción.
- Elegir entre mensaje y voz.
- Continuar por WhatsApp sin pasos adicionales.
- Abrir el enlace de voz fácilmente.
- Cambiar de modalidad cuando lo necesite.
- Retomar una conversación sin configuraciones complejas.

Evitar menús extensos, mensajes repetitivos y preguntas innecesarias.

No exigir que el usuario vuelva a identificarse si ya existe una sesión autenticada válida, pero mantener los controles de seguridad requeridos.

## 8. CAMBIO DE CANAL

Permitir que el usuario solicite:

- «Quiero hablar por voz».
- «Prefiero escribir».
- «Hablar con el bot».
- «Iniciar asistente».

Interpretar estas intenciones mediante un ruteo determinístico cuando sea posible.

No depender exclusivamente de un modelo IA para reconocer comandos sencillos.

Si el usuario cambia de voz a texto, mantener la conversación de WhatsApp disponible.

No cancelar una sesión de voz activa sin una solicitud explícita o una regla de expiración aplicable.

## 9. SEGURIDAD

Validar:

- Firma de los webhooks de Meta.
- Identidad de WhatsApp.
- Relación entre número y usuario.
- Permisos de acceso al asistente.
- Protección contra replay.
- Idempotencia de mensajes.
- Rate limiting.
- Autorización de generación de enlaces.
- Expiración de enlaces.
- Protección contra exposición de tokens.
- Políticas RLS.
- Registro seguro de sesiones.

Los parámetros enviados desde WhatsApp o desde una URL no deben considerarse prueba suficiente de identidad.

La autorización debe verificarse en el backend.

## 10. MANEJO DE ERRORES

Contemplar:

- Usuario sin identidad vinculada.
- Usuario sin permisos.
- Retell no disponible.
- Error al generar enlace.
- Enlace expirado.
- Enlace revocado.
- Doble clic en «Iniciar bot».
- Selecciones duplicadas.
- Webhook repetido.
- Ventana de WhatsApp cerrada.
- Plantilla no aprobada.
- Error de envío a Meta.
- Sesión de voz ya existente.
- Usuario que cambia de canal durante una conversación.

Mostrar mensajes breves y claros.

Nunca afirmar que un enlace fue generado o enviado si la operación falló.

## 11. OBSERVABILIDAD

Registrar eventos como:

- Inicio de bot solicitado.
- Selector enviado.
- Opción de texto seleccionada.
- Opción de voz seleccionada.
- Enlace generado.
- Enlace enviado.
- Enlace abierto, cuando exista telemetría.
- Sesión de Retell iniciada.
- Error de generación.
- Error de autorización.
- Sesión expirada.

Evitar almacenar información sensible innecesaria.

## 12. PRUEBAS OBLIGATORIAS

Validar:

1. Inicio desde la automatización.
2. Envío de las dos opciones.
3. Selección de texto.
4. Continuación del chatbot existente.
5. Selección de voz.
6. Generación de liga personalizada.
7. Apertura de liga.
8. Inicio de sesión con Retell.
9. Usuario sin permisos.
10. Enlace expirado.
11. Doble selección.
12. Webhook duplicado.
13. Cambio de canal.
14. Ventana de WhatsApp cerrada.
15. Fallo temporal de Retell.
16. Conservación de las automatizaciones existentes.
17. Compatibilidad con seguimiento de acciones y OKRs.

## 13. IMPLEMENTACIÓN

Trabaja en este orden:

FASE 1 — Auditoría del repositorio y lectura del Markdown de ligas personalizadas.

FASE 2 — Diseño del flujo de selección de canal.

FASE 3 — Integración con el chatbot existente de WhatsApp.

FASE 4 — Integración con las ligas personalizadas de Retell.

FASE 5 — Seguridad, sesiones e idempotencia.

FASE 6 — Pruebas, documentación y preparación para despliegue.

Prioriza cambios pequeños, reutilizables y compatibles.

No modificar innecesariamente otras automatizaciones.

No desplegar automáticamente a producción.

No ejecutar migraciones destructivas.

## 14. ENTREGABLE FINAL

Presenta:

1. Diagnóstico del flujo actual.
2. Arquitectura utilizada.
3. Integración con la documentación Markdown.
4. Flujo implementado.
5. Archivos modificados.
6. Migraciones necesarias.
7. Pruebas ejecutadas.
8. Riesgos pendientes.
9. Checklist de despliegue.

## CRITERIO DE ÉXITO

Cuando el usuario active «Iniciar bot», recibirá en WhatsApp dos opciones claras:

**Por mensaje:** continúa inmediatamente con el agente IA dentro de WhatsApp.

**Por voz:** recibe una liga personalizada, segura y funcional para conversar con el agente de Retell.

Ambos canales deben utilizar la identidad y los permisos correctos, reutilizar las integraciones existentes y mantener una experiencia sencilla, confiable y consistente con Scrumban.

# Guía — ligas personales (acceso sin login)

Documentación de las **ligas personalizadas** que permiten iniciar una conversación de voz con Guía **sin iniciar sesión** en What2Do. La sesión, el diario y los pilares quedan asociados al usuario dueño de la liga.

Doc general de Guía: [guia-replicacion.md](./guia-replicacion.md).  
Setup Retell: [retell-guide-setup.md](./retell-guide-setup.md).

---

## 1. Qué es una liga personal

Una URL del tipo:

```text
https://<APP_PUBLIC_URL>/guia/invitacion/<token_plano>
```

- El **token plano** solo vive en la URL (y en el portapapeles al crearla).
- En base de datos se guarda únicamente el **SHA-256** (`token_hash`).
- Quien abre la liga puede hablar con Guía por voz; el contenido se guarda en el perfil del usuario **dueño** de la liga (no del visitante anónimo).
- No requiere cuenta de Supabase Auth en el navegador del invitado.

Duración de sesión de voz: **15 minutos** (igual que Guía autenticada).

---

## 2. Flujo extremo a extremo

```text
Admin o el propio usuario
  → create-guide-user-link
  → URL /guia/invitacion/{token}

Invitado (sin login)
  → PublicGuideInvitationPage
  → validate-guide-user-link (mark_opened)
  → confirma identidad + consentimiento mic/grabación
  → /guia/invitacion/{token}/voz
  → GuideVoicePage
  → create-guide-retell-web-call { guide_token, consent: true }
  → Retell Web Call
  → guide-retell-webhook → diario / pilares del usuario dueño
```

---

## 3. Rutas

| Ruta | Componente | Auth |
| --- | --- | --- |
| `/guia/invitacion/:token` | `PublicGuideInvitationPage` | Pública |
| `/guia/invitacion/:token/voz` | `GuideVoicePage` (lee `token` de params) | Pública |

Constantes: `ROUTES.GUIA_INVITACION`, `ROUTES.GUIA_INVITACION_VOZ`.  
Registradas **fuera** del layout autenticado en `src/routes/index.tsx`.

---

## 4. Quién puede crear ligas

Edge Function: `create-guide-user-link`.

| Caso | Permiso |
| --- | --- |
| Crear **su propia** liga | Usuario autenticado activo |
| Crear liga **para otro** | Roles de negocio: `DG`, `Sistemas`, `super_admin`, `Direccion` |
| Empresa distinta | Solo `super_admin` (el resto no puede cruzar `empresa`) |

Requisito del **destinatario**:

- Usuario `activo`.
- Entendimiento en `submitted` o `approved`. Si no → `409`.

Vigencia:

- Default **30 días**.
- Rango aceptado: **1–90** días (`expires_in_days`).

Generar otra liga **no invalida** las anteriores: cada una sigue válida hasta vencimiento o revocación.

---

## 5. Dónde se crea en la UI

| Lugar | Comportamiento |
| --- | --- |
| `GuidePersonalLinkButton` | “Obtener mi liga” → crea para el usuario actual, muestra diálogo y copia al clipboard |
| Diario / voz autenticada | Mismo botón (compacto en voz) |
| `UsersPage` (directorio) | Admin puede generar liga para un usuario (`guideService.createUserLink(user.id)`) |

Cliente:

```ts
await guideService.createUserLink(usuarioId, expiresInDays?) 
// → { link, expires_at, usuario_id, user_name }
```

Implementación: `src/features/guide/services/guide.service.ts` → `functions.invoke('create-guide-user-link')` con Bearer JWT.

---

## 6. Modelo de datos (`guide_user_links`)

Migración: `20260827235701_create_guide_user_links.sql`.

| Columna | Uso |
| --- | --- |
| `usuario_id` | Dueño del espacio Guía |
| `token_hash` | SHA-256 del token (UNIQUE) |
| `status` | `active` \| `revoked` \| `replaced` \| `expired` |
| `expires_at` | Fin de vigencia |
| `opened_at` | Primera apertura (landing) |
| `last_used_at` | Último uso |
| `use_count` | Contador de llamadas iniciadas |
| `revoked_at` / `replaced_by` | Revocación / reemplazo |
| `created_by` | Quién generó la liga |

Seguridad:

- RLS ON.
- `REVOKE ALL` a `anon` y `authenticated`.
- Solo Edge Functions con **service role** leen/escriben.
- El token nunca se persiste en claro.

---

## 7. Edge Functions

Deploy (junto al resto de Guía) con **`--no-verify-jwt`**:

```bash
npm run supabase:deploy:guide:what2do
```

Incluye `create-guide-user-link` y `validate-guide-user-link`.

La validación pública **no lleva JWT**. Si el gateway exige JWT, la invitación falla con 401 antes de hashear el token.

### 7.1 `create-guide-user-link`

**Auth:** Bearer sesión.

**Body:**

```json
{ "usuario_id": "<uuid>", "expires_in_days": 30 }
```

**Proceso:**

1. Valida creador y permisos.
2. Valida destino + Entendimiento.
3. Genera token aleatorio (32 bytes → base64url).
4. Inserta `token_hash = sha256(token)`.
5. Arma URL con `APP_PUBLIC_URL` | `APP_BASE_URL` | `SITE_URL` (fallback producción).

**Respuesta:**

```json
{
  "link": "https://…/guia/invitacion/<token>",
  "expires_at": "…",
  "usuario_id": "…",
  "user_name": "…",
  "message": "Liga personal de Guía creada."
}
```

### 7.2 `validate-guide-user-link`

**Auth:** ninguna (público).

**Body:**

```json
{ "token": "<token_plano>", "mark_opened": true }
```

**Proceso:**

1. Rechaza token &lt; 32 chars.
2. Busca por `token_hash`.
3. Exige `status=active`, usuario activo, no vencida.
4. Exige Entendimiento `submitted|approved`.
5. Si `mark_opened` y aún no había `opened_at`, lo setea (+ `last_used_at`).

**OK:**

```json
{
  "valid": true,
  "user_name": "…",
  "expires_at": "…",
  "duration_minutes": 15
}
```

Errores típicos: `400` liga inválida, `410` vencida/no disponible, `409` Entendimiento incompleto.

### 7.3 Uso en la llamada: `create-guide-retell-web-call`

Desde `GuideVoicePage` con token de ruta:

```ts
guideService.createRetellWebCall(guideToken, replaceActive?)
// body: { guide_token, consent: true, replace_active? }
```

Reglas:

- `consent` debe ser `true` o → `400`.
- Resuelve perfil por hash del token (misma lógica que validate).
- Crea `guide_sessions` `provider=retell` para ese `usuario_id`.
- Metadata Retell incluye `guide_link_id`.
- Tras éxito: `use_count++`, `last_used_at=now()`.

El diario/reflexión post-llamada sigue el webhook normal; el dueño ve la entrada en `/guia/diario` cuando inicia sesión.

---

## 8. UX pública (`PublicGuideInvitationPage`)

Al cargar:

1. `validateUserLink(token, true)`.
2. Muestra nombre del dueño, duración 15 min, avisos de privacidad/alcance.
3. Checkboxes obligatorios:
   - Confirmar identidad (“soy {user_name}”).
   - Consentir micrófono, grabación y transcripción.
4. Botón opcional “Probar micrófono”.
5. “Comenzar conversación” → `/guia/invitacion/:token/voz`.

`GuideVoicePage` en modo invitación:

- No muestra “Obtener mi liga”.
- Al terminar, ofrece volver a la landing de invitación (no al diario autenticado).
- El token se reenvía a `createRetellWebCall` en el gesto de usuario (permiso mic + startCall).

---

## 9. Secrets / env

| Variable | Dónde | Uso |
| --- | --- | --- |
| `APP_PUBLIC_URL` (o `APP_BASE_URL` / `SITE_URL`) | Edge | Base de la URL de la liga |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Edge | Admin client |
| `RETELL_*` / `GUIDE_RETELL_TOOL_SECRET` | Edge | Necesarios para la llamada de voz |

Sin `APP_PUBLIC_URL` correcto, la liga apunta al fallback hardcodeado de producción.

---

## 10. Seguridad (resumen)

| Control | Detalle |
| --- | --- |
| Token | Aleatorio; solo hash en DB |
| Tabla | No accesible por Data API a clientes |
| Validación | En Edge, no en el browser |
| Consent | Obligatorio para iniciar call por liga |
| Scope | Sesión/diario del dueño; no mezcla perfiles |
| Multi-liga | Varias activas; compartir = responsabilidad del dueño |
| Empresa | Admins no-super no cruzan empresas |
| Gate | Entendimiento completado |

La liga es un **bearer**: quien la tenga puede iniciar conversaciones a nombre de ese perfil. Tratarla como secreto compartido.

---

## 11. Checklist de réplica

- [ ] Migración `guide_user_links` + revoke a anon/authenticated  
- [ ] Deploy `create-guide-user-link` + `validate-guide-user-link` con `--no-verify-jwt`  
- [ ] `APP_PUBLIC_URL` apuntando al front real  
- [ ] Rutas públicas de invitación + voz  
- [ ] Botón “Obtener mi liga” + acción admin en usuarios  
- [ ] Landing: validate + consent + mic  
- [ ] `create-guide-retell-web-call` acepta `guide_token` + `consent`  
- [ ] Probar: crear liga → abrir en incógnito → call → journal del dueño  
- [ ] Probar: sin Entendimiento → 409; liga vencida → 410; JWT gateway ON → 401  

---

## 12. Pruebas rápidas

```bash
# Crear (con JWT de admin/usuario)
# POST /functions/v1/create-guide-user-link
# { "usuario_id": "…", "expires_in_days": 30 }

# Validar (sin JWT)
# POST /functions/v1/validate-guide-user-link
# { "token": "…", "mark_opened": true }
```

SQL (solo service role / SQL editor):

```sql
select id, usuario_id, status, expires_at, opened_at, last_used_at, use_count, created_by, created_at
from public.guide_user_links
order by created_at desc
limit 20;
```

No intentes leer `token_hash` para reconstruir la URL: el token plano no es reversible.

---

## 13. Archivos clave (implementación en este repo)

| Archivo | Rol |
| --- | --- |
| `supabase/migrations/20261108120000_guide_user_links.sql` | Tabla |
| `api/_shared/guideUserLinks.ts` | Hash / create / validate |
| `api/create-guide-user-link.ts` | Crear (JWT o secret WhatsApp) |
| `api/validate-guide-user-link.ts` | Validar público |
| `api/guide-retell-web-call.ts` | Call con `guide_token` + `consent` |
| `src/features/guide/services/guide.service.ts` | Cliente |
| `src/features/guide/components/GuidePersonalLinkButton.tsx` | UI propia |
| `src/pages/guia/PublicGuideInvitationPage.tsx` | Landing |
| `src/pages/guia/GuideVoiceInvitePage.tsx` | Voz por token |
| `supabase/functions/whatsapp-webhook/index.ts` | Selector Por mensaje / Por voz |

Notas de implementación:

- El gate de Entendimiento del diseño original **no aplica** en este código (no hay tabla/estado equivalente); se valida usuario activo.
- Las APIs viven en **Vercel** (`/api/...`), no en Edge Functions `create-guide-user-link`.
- WhatsApp «Iniciar bot» / «Consulta al Bot» envía el selector interactivo; «Por voz» crea liga `source=whatsapp` (7 días) y la manda al chat.

Con esto se puede usar **ligas personalizadas de Guía** y el selector de canal WhatsApp de punta a punta.
