# SCRUMBAN — WhatsApp First Pilot (1 Número Autorizado) & Activación Production

## 1. Piloto Real WhatsApp (B6 — 1 Número Autorizado, $0 USD)

### Condiciones obligatorias previas al primer envío
1. **Aislamiento y costo $0 USD:** Usar **Meta Test Phone Number** (o único número autorizado en lista blanca Meta Sandbox) iniciando **siempre** con un mensaje entrante del usuario para abrir la ventana de servicio gratuita de 24 horas ($0 USD). Mantener `WHATSAPP_DISPATCHER_ENABLED=0` y `zeroCostOnly=true` en `whatsappProactive.ts` (dry-run).
2. **Migración R0/reconciliación aplicada antes de reactivar dispatcher:** `20261124120000_whatsapp_r0_checkpoint_p0001_and_reconciliation.sql` (resuelve `P0001` en checkpoints, reconciliación CAS, preserva `can_use_ai_whatsapp_for_usuario` y bloquea replay automático de trabajos históricos con efecto externo incierto).
3. **Permisos y R2:** Mantener `R2_EXECUTION_MODE=disabled` en Production hasta validar migración R2 (`20261120120000`) en un proyecto Supabase QA remoto aislado (nunca usar Production como QA).

### Matriz de 13 pruebas del piloto (1 único número autorizado)
| # | Escenario | Criterio de paso |
|---|---|---|
| 1 | Recepción de mensaje (`POST /api/whatsapp-webhook`) | Firma Meta HMAC válida, persistencia durable, 0 duplicados por `wamid`. |
| 2 | Identificación del usuario | Vínculo real `wa_id` ↔ `usuarios.id` + `can_use_ai_whatsapp_for_usuario = true`. |
| 3 | Consulta de acciones (*«¿Qué tengo pendiente hoy?»*, *«¿Quién tiene acciones vencidas?»*) | Datos reales autorizados, ≤900 chars, enlaces directos a SCRUMBAN. |
| 4 | Diagnóstico ejecutivo (*«¿Qué necesita mi atención?»*, *«¿Qué objetivos están en riesgo?»*) | Top 3 prioridades + riesgos sin texto genérico. |
| 5 | Consulta documental/memoria (*«¿Qué acordamos en la última reunión?»*) | Citas reales R3 bajo RLS (`0` invención si no hay documentos). |
| 6 | Nota de voz real (`OGG/Opus`, `es-MX`) | Descarga autorizada Meta HTTPS, validación magic bytes, transcripción servidor, respuesta por texto; **0** ejecuciones automáticas ante transcripción incierta. |
| 7 | Continuidad conversacional | Seguimiento de contexto entre turnos texto ↔ nota de voz. |
| 8 | Propuesta R2 (*«Crea una acción para que operaciones revise el problema del proveedor antes del viernes»*) | Muestra Acción, Responsable resuelto, Fecha exacta, Prioridad y código SHA-256 vinculado a `assistant_pending_ops`. |
| 9 | Rechazo de `"sí"` ambiguo + edición | `"sí"` suelto es rechazado; `editar <código> fecha=YYYY-MM-DD` invalida código previo y emite nuevo código. |
| 10 | Confirmación explícita + escritura verificada | `confirmar <código>` ejecuta R2 y confirma resultado sólo tras verificar escritura real en BD. |
| 11 | Rechazo de permisos insuficientes | Usuario no autorizado o fuera de área recibe denegación limpia (0 fugas). |
| 12 | Idempotencia / sin duplicados | Reenvío del mismo `wamid` o misma confirmación no duplica registros. |
| 13 | Fallos y recuperación | Ante caída de proveedor (503/timeout) responde mensaje transparente sin perder contexto ni dejar estados corruptos. |

## 2. Activación Controlada en Production (Frente A)

- **Estado real verificado (`prj_k71rhUH9uTFEEPWofF3NyyhcKEDn`):**
  - Deployment Production activo: `dpl_GuvJCGLJBxpNmpxMs56qnWAMdgi4` (`main` @ `8dab622c8c2652493ac4e87e6b778028f51d8017`, `READY`, HTTP 200 en `https://scrumbanemx.vercel.app` y `https://tablero-operativo.vercel.app`, `0` errores runtime en este deployment, Instant Rollback disponible).
  - Flags actuales: `AGENT_ORCHESTRATOR_R1=0`, `AGENT_MEMORY_R3=0`.
  - Ventana A lleva `15.63h` desde `2026-11-24T05:47Z` (cumple 24h acordadas el `2026-11-25T05:47Z`).
- **Secuencia exacta sin omitir gates:**
  1. Al completar ≥24h de Ventana A (`2026-11-25T05:47Z`) + confirmar en Supabase PROD `xhpasmjzuwifmjhrsumb` las migraciones R1 (`assistant_op_log_read_audit`, `r1_transversal_access`, `inactive_users_rls`) y `GEMINI_MODEL=gemini-2.5-flash` (evitando `gemini-3.1-flash-lite` / `3.5-flash-lite` que presentaron 503 en Preview): activar **Ventana B** (`AGENT_ORCHESTRATOR_R1=1`, `AGENT_MEMORY_R3=0`) y smoke autenticado.
  2. Tras ≥24h estables en Ventana B: activar **Ventana C** (`AGENT_MEMORY_R3=1`).
  3. Integración selectiva **Executive MVP + Lean Build**: ya aislada y desplegada en Preview en `origin/feature/executive-mvp` (`5c7e7c1f3f66ebc819c459ccad9bdca3f23650ed`, sin WhatsApp ni Voz) → promover vía PR selectivo a `main` tras Ventana B/C.
  4. **R2 (`20261120120000`):** bloqueado en Production hasta validar migración y permisos en proyecto Supabase QA remoto aislado.
