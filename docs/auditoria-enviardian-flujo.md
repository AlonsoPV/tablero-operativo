# Auditoría Enviardián — flujo, causas raíz y remediación

Fecha de remediación en repo: 2026-11-17.  
Política vigente: **piloto full-write** en ligas (`interview_full_read` puede encolar, confirmar y enviar como dueño). Riesgo documentado abajo.

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

## Riesgos de seguridad (piloto full-write)

- Quien tenga la URL activa actúa con alcance de escritura/envío del dueño.
- Mitigaciones: TTL de liga, revocación, `GUIDE_INTERVIEW_FULL_READ=0` para restringir, no exponer service_role al cliente, no desactivar RLS.
- Confirm de comunicaciones valida `canSendCommunication` cuando `guideAccessMode` está presente.

## Configuración externa pendiente

- Dashboard Retell: URLs, schema `queue_workspace_draft`, timeouts, prompt “no afirmar éxito si success=false”.
- Vercel env: `RETELL_API_KEY`, `GUIDE_RETELL_TOOL_SECRET`, WhatsApp/Gmail del dueño.
- Publish Retell solo con `GUIDE_RETELL_PUBLISH_OK=1` y autorización explícita.
- Deploy producción: no sin OK.

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
        workspaceDraftFinalize, guideUserLinks, guideWork, workspaceDraftVoice
```

No se ejecutaron envíos reales ni creación productiva de acciones/iniciativas.
