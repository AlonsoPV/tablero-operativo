# R4 · Arquitectura del piloto controlado

Estado: **preparación**. R4 **NO-GO**. GO QA **NO-GO**. No hay proveedores reales activos.

## Decisiones adoptadas

| Decisión | Implicación |
| --- | --- |
| Agente **Retell R4 independiente** de Guía | No se reutiliza el `agentId` ni `useRetellGuideCall`. Guía sigue intacta. El piloto requiere un agente Retell **nuevo**, tools R4 y webhook propio cuando se autorice. |
| **OpenAI Realtime** es comparador experimental | Misma sesión de oráculo, en paralelo y **manual**. Nunca sustituye a Retell si este falla. |
| **Sin fallback automático** | Un error de Retell R4 queda en `denied`/`error`. No se abre OpenAI ni se reintenta con Guía. |
| Consentimiento **antes** de captura de audio | `start()` exige `consent()`. El lab UI exige micrófono + alcance. |
| Liga pública = **una sesión autorizada** | `createLinkOccupancy`: segunda conexión a la misma liga → `session_occupied`. |
| Confirmación protegida = **dueño autenticado y autorizado** | Liga pública, anónimo o sesión ajena → denegado. No hay confirmación por voz pública. |
| Retención de audio **mínima** | Por defecto `none` (el lab no guarda audio). `AGENT_VOICE_R4_RETAIN_AUDIO=1` solo marca política `configured`; este worktree **sigue sin persistir blobs**. |

Código: `api/_shared/r4/pilotPolicy.ts`, `disabledLiveAdapters.ts`, `pilotRuntime.ts`.

## Diagrama (piloto)

```
Flag UI  VITE_AGENT_VOICE_R4===1     (solo proceso local del lab)
Flag API AGENT_VOICE_R4===1          (apagado en este incremento)
        │
        ▼
Consentimiento (mic + alcance)
        │
        ▼
Occupancy de liga (1 sesión)
        │
        ├─ simulated  → orquestador local (único camino activo)
        ├─ retell_r4  → adaptador DESHABILITADO (sin claves, sin red)
        └─ openai_rt  → adaptador DESHABILITADO (comparador; no fallback)
        │
        ▼
Tools / interpretSharedIntent / informe once-finalizer
        │
        ▼
Confirmaciones protegidas (auth + owner) o deny
```

## Qué no cambia

- `GuidePanel`, `useRetellGuideCall`, `finalizeGuideInterview`
- Router productivo de WhatsApp (`whatsappFlowRouting`)
- QA A/B, DEV, PROD, migraciones, RLS

## CHANNEL_GAP

| Capa | Followup / create | Estado |
| --- | --- | --- |
| `interpretSharedIntent` (web, WhatsApp **simulado**, voz **simulada**) | Misma familia y propuesta | **SIMULATED PASS** (gap cerrado en simulación) |
| Router productivo WhatsApp | Sigue `UNKNOWN` / no-QUERY en texto libre | **Bloqueo documentado**: no se cablea hasta autorización. REAL NOT TESTED |

## Variables de staging (aún no aplicar)

| Variable | Uso | Este worktree |
| --- | --- | --- |
| `VITE_AGENT_VOICE_R4` | Lab UI | Solo proceso Vite R4, valor `1` |
| `AGENT_VOICE_R4` | Runtime servidor | **Ausente / off** |
| `AGENT_VOICE_R4_PROVIDER` | `simulated` \| `retell` \| `openai_realtime` | Reales → `real_provider_not_authorized` |
| `AGENT_VOICE_R4_RETAIN_AUDIO` | Política de retención | Ausente = no guardar audio |
| `RETELL_R4_AGENT_ID` / `RETELL_API_KEY` | Piloto real | **No leer, no definir aquí** |
| `OPENAI_API_KEY` / modelo Realtime | Comparador | **No leer, no definir aquí** |

## Riesgos de privacidad y seguridad

| Riesgo | Mitigación actual | Residual |
| --- | --- | --- |
| Audio en proveedor | Lab no captura ni envía audio real | Piloto real enviará voz a Retell/OpenAI |
| Claves en el worktree | Adaptadores disabled; tests con Proxy que fallan si se lee el secreto | Staging debe usar secretos de entorno, no git |
| Liga pública amplia permisos | Occupancy + confirmación autenticada | Grant real / RLS no se tocan aquí |
| PII en transcripción | Stub local; informe sintético | AT-16 real necesita política de `consult_log` |
| Fallback silencioso a otro vendor | `autoFallback: false` | Operador no debe “reintentar con OpenAI” sin consentimiento |

## Checklist de autorización para piloto real

No ejecutar hasta tildar **todas**. Este documento no tilda ninguna.

1. Entorno de prueba ≠ QA A/B, ≠ DEV, ≠ PROD, ≠ Preview R3.
2. Agente Retell **R4** creado (no el de Guía) y `RETELL_R4_AGENT_ID` acordado.
3. Destinatario piloto + consentimiento informado (audio, retención, proveedores).
4. TTL y revocación de liga reales; una sesión viva por liga.
5. Confirmaciones protegidas solo con login del dueño.
6. Decisión explícita de **no** fallback automático.
7. Si hay comparador OpenAI: consentimiento extra y corrida **separada**.
8. Retención de audio documentada (default: no guardar).
9. Oráculo AT-20 + evidencia AT-16 listos (ver `r4-real-evidence.md`).
10. Rollback: apagar `AGENT_VOICE_R4` / `VITE_AGENT_VOICE_R4`.
11. Impacto explícito: no interferir Guía, R1–R3, WhatsApp Graph.
