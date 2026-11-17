# Auditoría Enviardián — flujo, causas raíz y remediación

Fecha de remediación en repo: 2026-11-17 (aprobaciones + silencios + consultas operativas).  
Política vigente: **liga pública = solo lectura**. Encolar durante la llamada sigue permitido según `access_mode`; **aprobar / editar / descartar / enviar** requiere sesión autenticada del dueño en la app. El piloto full-write de confirm desde la URL pública queda **retirado**.

## Diagrama real

```text
Retell call
  → custom function (firma Retell)
  → /api/guide-retell-tool | /api/guide-queue-workspace-draft
  → guide_sessions (session_id, access_mode, usuario_id)
  → gate access_mode (read / propose / interview_full_read)
  → servicio (dispatchCopilotTool | mutateVoiceWorkspaceDraft)
  → assistant_pending_ops / Scrumban
  → respuesta tipada { success, error.code, result }
  → consult_log (async)
  → call_analyzed webhook → finalizeGuideInterview
  → executive_report enviardian-informe-v3
  → UI (hallazgos + technical_attention + communications)
  → approve/confirm → execute (Gmail / WhatsApp / create_action)
```

## Contratos de herramientas

Éxito:

```json
{
  "success": true,
  "operation_id": "…",
  "status": "draft_registered",
  "entity_type": "whatsapp",
  "entity_id": "…",
  "message": "…",
  "result": "…"
}
```

Error:

```json
{
  "success": false,
  "operation_id": null,
  "status": "error",
  "error": {
    "code": "VALIDATION_FAILED",
    "retryable": false,
    "user_message": "…"
  },
  "result": "…"
}
```

Códigos: `AUTHENTICATION_FAILED`, `PERMISSION_DENIED`, `SESSION_NOT_FOUND`, `VALIDATION_FAILED`, `ORGANIZATION_CONTEXT_MISSING`, `DATABASE_ERROR`, `PROVIDER_ERROR`, `TIMEOUT`, `RESPONSE_FORMAT_ERROR`, `CHANNEL_UNSPECIFIED`, `TOOL_NOT_FOUND`, `UNKNOWN_ERROR`.

Implementación: [`api/_shared/guideToolResult.ts`](../api/_shared/guideToolResult.ts).

## Tabla de hallazgos

| Módulo | Error detectado | Causa raíz | Evidencia | Corrección aplicada | Archivo | Prueba | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Informe | Hallazgos con `get_okr_progress:…` | `verifiedFactsFromLog` prefijaba tool | Código L402+ y UI | Humanizar líneas; strip prefijos; metrics aparte | `guideRetellTool.ts`, `enviardianReportDocument.ts` | `guideRetellTool.test`, `enviardianReportDocument.test` | CORREGIDO Y VERIFICADO |
| Informe | Errores técnicos como recomendaciones | LLM + transcript sin categoría | Brief + pipeline | `technical_attention` + sanitize + prompt | `guideReportSanitize.ts`, `finalizeGuideInterview.ts`, `GuideReportBody.tsx` | `guideReportSanitize.test`, escenarios 6/9 | CORREGIDO Y VERIFICADO |
| Informe | Estado `undefined` | Enum laxo | Schema v3 | Enum `confirmed\|proposal\|pending` | `enviardianReportDocument.ts` | test commitments | CORREGIDO Y VERIFICADO |
| Informe | Counts libres del LLM | counts no recalculados siempre | Schema | Recalcular desde entidades | `normalizeReportDocument` | escenarios 9 | CORREGIDO Y VERIFICADO |
| Tools | Respuestas ambiguas HTTP 200 | Solo `result` hablado | Handlers queue/retell | Contrato success/error | `guide-queue-workspace-draft.ts`, `guide-retell-tool.ts` | `guideToolResult.test` | CORREGIDO Y VERIFICADO |
| Auth envío | `canSendCommunication` poco cableado | Gate solo en cola | Audit | Gate en `confirmPendingOp` + `guideAccessMode` | `assistantOpsRuntime.ts`, `assistantPending.ts` | escenarios 8 | CORREGIDO PENDIENTE DE PRUEBA REAL |
| Observabilidad | Sin correlación E2E | Logs parciales | Checklist | `request_id`/`operation_id` + masking | `guideToolResult.ts` | unit | CORREGIDO Y VERIFICADO |
| Cola WA/email | Duplicados por reformulación | Solo idempotency_key | Voice prepare | Dedupe purpose+recipient+canal | `workspaceDraftVoice.ts` | workspaceDraftVoice + escenarios | CORREGIDO Y VERIFICADO |
| Acciones | Recomendaciones → session_actions | `buildSessionActions` metía recommendations | guideWork | No pasar recommendations a session_actions en format | `guideWork.ts` | escenarios 3/4 | CORREGIDO Y VERIFICADO |
| Borradores | Fuente LLM vs DB | Informe no listaba pending ops | finalize | `communication_drafts` desde DB | `finalizeGuideInterview.ts` | escenarios 5 | CORREGIDO Y VERIFICADO |
| Retell remoto | Posible drift schema/URL | Publish no automático | Checklist | Lista verificación dashboard | `retell-enviardian-checklist.md` | manual | BLOQUEADO POR CONFIGURACIÓN EXTERNA |
| Proveedores | Envío real WA/Gmail | Credenciales / ventana 24h | Ops | No probado en esta pasada | — | — | PENDIENTE |
| Aprobación E2E | Escenario 10 envío real | Requiere destinatarios autorizados | Brief | Mocks only | `enviardianAuditScenarios.test.ts` | mocks | CORREGIDO PENDIENTE DE PRUEBA REAL |
| Informe UI | Solo Descartar útil | Aprobar disabled + `disableEdit` en liga | `AssistantProposalCard` | needs_info → Completar info; liga readOnly + login CTA | `AssistantProposalCard.tsx`, `GuideVoiceInvitePage.tsx` | unit + manual | CORREGIDO PENDIENTE DE PRUEBA REAL |
| Informe UI | WA/correo como “tareas” | Sección única sin split por tool | `GuideCommunicationsSection` | Split Comunicaciones / Tablero / Historial | `pendingOpTaxonomy.ts`, `GuideReportBody.tsx` | `pendingOpTaxonomy.test`, `reportViewModel.test` | CORREGIDO Y VERIFICADO |
| Informe UI | Contador inflado | Sumaba decisiones/compromisos narrativos | `reportViewModel` | Contador solo `assistant_pending_ops` accionables | `reportViewModel.ts` | `reportViewModel.test` | CORREGIDO Y VERIFICADO |
| Auth liga | Confirm sin JWT | Piloto full-write | `guide-link-report` | `confirm_pending`/`cancel_pending` → 403 `LOGIN_REQUIRED` | `guide-link-report.ts` | API unit/manual | CORREGIDO PENDIENTE DE PRUEBA REAL |
| Ops | Descarte sin motivo | Update sin actor/razón | `cancelPendingOp` | `error_message` prefijado + log | `assistantOpsRuntime.ts` | unit | CORREGIDO Y VERIFICADO |
| Voz | Silencio post-tool | Timeout 3s / spoken vacío | `guide-retell-tool` | Spoken garantizado; timeout write 8s; mensaje recuperable | `guideToolResult.ts`, `guideRetellTool.ts`, `guide-retell-tool.ts` | `guideToolResult.test` | CORREGIDO PENDIENTE DE PRUEBA REAL |
| Preview | JSON/tools en body | Body crudo | preview | `sanitizeRecipientFacingText` | `pendingOpTaxonomy.ts`, `actionLifecycle.ts` | `pendingOpTaxonomy.test` | CORREGIDO Y VERIFICADO |
| Consultas voz | «53 abiertas en rojo» corporativo + follow-up «Todas» | Tool choice a dashboard (~48); `get_my_actions` sin total/rojo; sin `active_query` | Prompt + runtime + gate | Contrato `scope`/`visual`/`total`; `board_red`; `active_query`+merge; **gate** dashboard/team→`get_my_actions` en follow-up personal (`rewrote_from`); «Todas» no abre board | `actionQueryContract.ts`, `guide-retell-tool.ts`, `catalog.ts`, `enviardian-voz.md` | matriz A–J + gate en `actionQueryContract.test` | VERIFICADO UNITARIO; pendiente voz real / publish Retell |
| Semántica | Glosarios/intents dispersos por canal | Sin SSOT; create no distinguía Kanban vs iniciativa | Prompt + código | Diccionario `ops-dict-2026-11-17-mvp` + `interpretOperationalMessage`; chat/voz/WA aliases | `operationalSemantics/`, `operationalInterpret.ts` | `operationalInterpret.test` | VERIFICADO UNITARIO; pendiente publish Retell |

## Riesgos de seguridad (liga pública)

- La URL activa **no** confirma ni envía; solo consulta informe y lista ops.
- Escritura/envío: historial autenticado del dueño + `canSendCommunication` / JWT.
- Mitigaciones: TTL de liga, revocación, no exponer service_role al cliente, no desactivar RLS.

## Configuración externa pendiente

- Dashboard Retell: URLs, schema `queue_workspace_draft`, timeouts, prompt “no afirmar éxito si success=false” **y hablar siempre `result`**.
- Vercel env: `RETELL_API_KEY`, `GUIDE_RETELL_TOOL_SECRET`, WhatsApp/Gmail del dueño; opcional `GUIDE_RETELL_TOOL_WRITE_TIMEOUT_MS`.
- Publish Retell solo con `GUIDE_RETELL_PUBLISH_OK=1` y autorización explícita.
- Deploy producción: no sin OK.
- E2E voz real (secuencia OKR→tarea→WA→email→cancel→fin): pendiente en staging.
- Consultas operativas: validar en llamada real «¿cuántas tengo en rojo?» → «Todas» sin reabrir dashboard; publish prompt `enviardian-voz-2026-11-17-queries` solo con OK.

## Migraciones

Sin migración nueva en esta pasada. Dependencias ya existentes: consult_log, access_mode, whatsapp pending ops, append_guide_consult_log.

## Monitoreo recomendado

- Tasa `success=false` por `error_code` y tool.
- p95 `duration_ms` de `guide-retell-tool` vs timeout.
- Conteos `technical_attention` por sesión.
- Duplicados de `assistant_pending_ops` por session_id+tool+purpose.

## Pruebas ejecutadas (automatizadas)

```text
vitest: guideToolResult, guideReportSanitize, guideRetellTool,
        enviardianAuditScenarios, enviardianReportDocument,
        workspaceDraftFinalize, guideUserLinks, guideWork, workspaceDraftVoice,
        actionQueryContract, operationalInterpret
```

No se ejecutaron envíos reales ni creación productiva de acciones/iniciativas.
