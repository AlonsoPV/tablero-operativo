# Integración de comunicaciones de Scrumban

## A y C · Diagnóstico y reutilización

| Funcionalidad | Implementación encontrada | Servicio reutilizado | Dependencias | Brecha y cambio |
| --- | --- | --- | --- | --- |
| Acciones corporativas y de equipo | Kanban corporativo en `acciones_diarias` y capa separada en `src/features/team-kanban/service.ts`. Las acciones tienen responsable, creador, verificadores, estado, prioridad y fecha. | Lecturas del asistente y `isCorporateOverdue`, con el criterio corporativo de CDMX. | RLS, rol de analista y alcance de sesión Guía. | El resumen implementado usa acciones corporativas del responsable. El esquema corporativo carece de un campo canónico para el asignador histórico. El Asignador del correo manual representa al actor de ese envío. |
| Correo desde Kanban | `AccionFormDialog` usa el payload de `accionNotificationEmail.ts` y la función `send-notification-email`. La función resuelve el perfil activo y usa Gmail con el buzón de notificaciones. | `notify_action_email` usa el mismo payload, plantilla y Edge Function. Ahora también se puede proponer desde Enviardián. | JWT del dueño, resultado con ID de Gmail, autorización vigente de la acción. | El correo libre y las respuestas de Gmail conservan la conexión personal. El correo del Kanban tiene plantilla fija y un responsable por acción. |
| WhatsApp desde Kanban | `whatsappIntegration.service.ts` invoca `whatsapp-send-action`. La Edge Function usa Meta Cloud API y registra envíos y seguimientos. | Transporte Graph compartido con asistentes, bandeja y dispatcher. | Identidad activa, Meta Cloud API, plantillas aprobadas y webhook. | Los borradores de texto libre requieren una ventana abierta de 24 horas. Una aceptación de Meta se presenta como aceptación. |
| WhatsApp entrante | Webhook con firmas, IDs de Meta, clasificación Ops/Agente y deduplicación de eventos. | Misma bandeja y webhook para estados y respuestas citadas. | `whatsapp_messages`, `external_inbound_messages` y contexto de Meta. | Una respuesta con referencia explícita a un mensaje del asistente se guarda en el hilo antes de los flujos de evidencias y chatbot. |
| Resumen diario por correo | Configuración administrativa única `daily_action_summary_settings/default`, modo todos/líderes/selección, horario, zona IANA y días. `daily-action-summary` usa cron existente y registra en `daily_action_summary_logs`. | Las herramientas web leen las mismas tablas y aplican cambios con RLS y comparación de configuración. El worker reserva intentos sobre la tabla existente. | `can_manage_catalogs()`, cron/vault existentes y configuración Gmail. | Se incorpora consulta de historial, activación, pausa, horario y zona globales. La reserva evita proveedores duplicados por concurrencia antes de llamar a Gmail. |
| Seguimiento WhatsApp de acciones | `whatsapp_followup_jobs` y `whatsapp-followup-dispatcher`. El seguimiento está ligado a la acción y sus checkpoints. | Dispatcher existente y transporte Graph compartido. | Cron existente, configuración de plantillas y estado de la acción. | La gestión conversacional individual de checkpoints o seguimientos sigue pendiente. |
| Chat web | `AiAssistPage` → `gemini-chat` → catálogo y runtime del copiloto. Usa `AssistantProposalCard`. | Runtime, tarjeta y `assistant_pending_ops` para preparación, aprobación y descarte. | JWT válido, permisos del asistente y RLS. | Se agrega borrador editable WhatsApp, consulta por ID y propuesta para configuración del resumen global. |
| Enviardián e informe | Herramienta autenticada de Retell y flujo `queue_workspace_draft`. El informe tiene referencias a filas por dueño y sesión. | Runtime compartido, mismo envío al aprobar desde la app, taxonomía y borradores persistidos. | Token de herramienta Retell, sesión Guía, Supabase y configuración de herramientas. | Se expone preparación estructurada de WhatsApp vencido, estado y correo de una acción. Un error produce una respuesta hablable. La experiencia TTS se debe verificar en sandbox. |

## B · Archivos y cambios

- `api/_shared/assistantCommunicationDrafts.ts`, `resolveCommunicationRecipient.ts`, `workspaceDraftVoice.ts` y `workspaceDraftFinalize.ts` preparan los borradores, resuelven contactos, limpian el contenido y registran envíos. La búsqueda de nombres conserva `searchActivePeopleByName`.
- `api/_shared/assistantOpsRuntime.ts`, `assistantPending.ts`, `api/assistant-ops.ts` y la migración `20261117130000_assistant_pending_request_key.sql` enlazan herramientas, aprobaciones, estado y claves de reintento. La reserva de una operación compara su estado, vigencia y payload.
- `src/features/ai-support` y `api/gemini-chat.ts` conectan funciones, identificador de turno y edición de destinatario y texto WhatsApp.
- `api/_shared/handlers/guide-retell-tool.ts`, `guideRetellTool.ts`, `enviardianPrompt.ts`, `scripts/publish-guia-retell-tools.mjs`, `guide-link-report.ts` y `finalizeGuideInterview.ts` incorporan las nuevas funciones al contrato de voz y al informe.
- `supabase/functions/_shared/whatsappTransport.ts` centraliza la llamada Graph. Kanban, bandeja y seguimientos conservan sus payloads de canal. El webhook correlaciona respuestas citadas de comunicaciones desde el ID de Meta.
- `api/_shared/assistantDailySummary.ts`, la función `daily-action-summary` y la migración `20261117131000_daily_action_summary_delivery_claim.sql` amplían el resumen diario existente. Una reserva por configuración, destinatario y fecha precede al envío.

## D y E · Contratos y autorización

| Operación | Entrada | Salida o restricción |
| --- | --- | --- |
| `whatsapp_prepare_send` | `recipient`, `body?`, `include_overdue?` | Propuesta con destinatario, número enmascarado, cuerpo y fecha de generación. Referencias internas en `action_ids`. Si el contacto es ambiguo o faltan datos, se devuelve el motivo en la vista previa. |
| `get_whatsapp_operation_status` | `pending_op_id` | Estado de la operación propia y del intento de Meta, con sus timestamps registrados. |
| `notify_action_email` | Referencia a una acción, prioridad y mensaje adicional opcionales | Propuesta del correo corporativo al responsable actual. La aprobación verifica de nuevo acceso y responsable. |
| `get_daily_action_summary` | `include_history?` | Configuración global y hasta quince intentos reales recientes, sin correos en la respuesta del historial. |
| `update_daily_action_summary` | `enabled?`, `send_time?`, `timezone?` | Propuesta para el mismo registro global. Aplicación condicionada a que permanezcan iguales los valores que se revisaron. |
| `POST /api/assistant-ops` | `action=edit\|confirm\|cancel`, `op_id`. La edición WhatsApp acepta `recipientName?` y `body?`. | Borrador actualizado, resultado verificable o descarte. El resultado se guarda antes de responder éxito. |

`assistant_pending_ops` conserva los estados `pending`, `executing`, `confirmed`, `cancelled`, `expired` y `conflict`. Los borradores incompletos conservan `needs_info` o `incomplete` en el payload y la vista previa. El historial de WhatsApp distingue `queued`, `accepted`, `delivered`, `read` y `failed`. En el resumen diario, `sending` reserva el intento y `unconfirmed` representa una respuesta incierta. `sent` significa que Gmail devolvió un ID.

Las aprobaciones de comunicación y configuración global exigen una sesión web autenticada. Las herramientas del modelo pueden preparar borradores. La cuenta interna consulta el vínculo WhatsApp del perfil visible para el usuario y registra el intento Meta. Retell obtiene el actor y el alcance desde la sesión Guía previamente validada. Las migraciones conservan las políticas RLS. El repo usa usuarios y permisos del proyecto Supabase y carece de una clave de organización en estas tablas de comunicaciones. El aislamiento entre organizaciones que compartan proyecto requiere un modelo adicional.

Los errores estructurados incluyen `VALIDATION_FAILED`, `PERMISSION_DENIED`, `MISSING_CONTACT`, `DATABASE_ERROR`, `CONFIGURATION_ERROR`, `PROVIDER_ERROR`, `RATE_LIMITED` y `TIMEOUT`. WhatsApp persiste un ID único de intento antes del envío. Si la conexión se pierde después de reservar, el intento queda consultable y no se repite automáticamente.

## F y G · Validación

| Funcionalidad | Kanban | Chat | Voz | Persistencia | Ejecución y evidencia |
| --- | --- | --- | --- | --- | --- |
| WhatsApp de una acción | Edge existente | Borrador libre y resumen de acciones vencidas | Resumen estructurado y captura existente | `assistant_pending_ops`, `whatsapp_messages` | Pruebas simuladas de filtros, aprobación, aceptación, reintento y timeout. |
| Correo corporativo de una acción | Plantilla existente | `notify_action_email` | `notify_action_email` con permisos de propuesta | `assistant_pending_ops` y registro de correo de la Edge Function | Pruebas de plantilla e invocación autenticada. |
| Correo libre | — | Gmail conectado | El agente pide identificar una acción para usar el correo del Kanban | `assistant_pending_ops` | Pruebas de las herramientas Gmail del chat y compatibilidad con borradores anteriores. |
| Configuración del resumen global | Ajustes existentes | Consulta, pausa, reactivación, horario y zona | — | Settings y logs del scheduler existente | Pruebas de lectura, autorización, propuesta y cambio optimista con mocks. |
| Historial postllamada | — | App autenticada | Informe Guía | Operaciones por sesión y dueño | Pruebas de captura y finalización. Falta verificar llamada y UI reales en sandbox. |

La compilación `npm run build` y el empaquetado `node scripts/bundle-api.mjs` pasaron localmente. `assistantCommunicationFlow.test.ts` recorre el runtime con Supabase y Meta simulados, incluida la confirmación repetida de una operación. Las pruebas de comunicaciones, voz y correo se ejecutaron localmente con Vitest. La suite completa conserva fallos de acceso a módulos, validación de fechas y gamificación que ya se observaron antes de los cambios correspondientes.

## H · Activación en sandbox

1. Aplicar las dos migraciones nuevas en el Supabase de pruebas. Desplegar allí `whatsapp-send-action`, `whatsapp-inbox`, `whatsapp-followup-dispatcher`, `whatsapp-webhook` y `daily-action-summary` mediante el flujo existente. Las funciones WhatsApp que importan el transporte requieren incluir el módulo compartido.
2. En la copia de Retell, actualizar la función personalizada `scrumban` según `scripts/publish-guia-retell-tools.mjs`. Definir `GUIDE_RETELL_APP_URL` con el origen HTTPS del sandbox y `RETELL_GUIDE_AGENT_ID` con el agente de pruebas. Ejecutar `node scripts/publish-guia-retell-tools.mjs` para ver el JSON del alcance local. La publicación usa `GUIDE_RETELL_PUBLISH_OK=1` con las credenciales de ese entorno. Verificar `recipient`, `body`, `include_overdue` y referencias a `pending_op_id`. Mantener las confirmaciones de envío en la app.
3. Usar las credenciales Meta y Gmail del sandbox existente. Verificar respuesta citada, estados Meta, caso de ventana cerrada y destinatario sin contacto. Para el resumen diario, comprobar la reserva ejecutando dos invocaciones concurrentes con un destinatario de prueba y revisar el historial.
4. Verificar la llamada con error recuperable, continuidad TTS, informe, aprobación con login y tarjeta en móvil. La configuración externa y los envíos reales quedan pendientes de esta validación.

## I · Cobertura pendiente

- Resolución de referencias por acción, asignador histórico, grupos, responsables múltiples y contexto conversacional compartido. Actualización automática de resúmenes de acciones y su vista de referencias.
- Correo organizacional libre, resúmenes de varias acciones por correo, edición del texto del correo corporativo y unificación del historial Gmail.
- Cambios de canal atómicos, edición conversacional persistente en chat e identificación de la operación por contexto al consultar estado.
- Configuración e historial de recordatorios por destinatario, acción o equipo, y gestión de recordatorios por voz. El scheduler actual programa un resumen global.
- Reconciliación automática de resultados inciertos, garantía de reintento seguro para envíos de correo individuales y cobertura integral de los 44 casos solicitados con servicios reales en sandbox.
