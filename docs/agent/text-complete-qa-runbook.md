# Scrumban — Text Complete | Runbook de Ventana QA Integrada

Validación única e integrada del asistente por texto (**R1 + R3 + Executive MVP + DEMO FIX `a078a4f` + R2 + Lean Build**, sin R0 ni R4) sobre un **Preview protegido único** conectado a un **proyecto Supabase QA dedicado y aislado** de DEV (`tgiuevzlyptzlfgxsfhj`) y PROD (`xhpasmjzuwifmjhrsumb`).

## 1. Provisión mínima del entorno Supabase QA dedicado (requiere autorización explícita)

Actualmente **no existe** un proyecto Supabase QA dedicado y autorizado. DEV (`tgiuevzlyptzlfgxsfhj`) y PROD (`xhpasmjzuwifmjhrsumb`) están bloqueados a nivel de código (`BLOCKED_PROJECT_REFS`) y SQL (`seed_qa_environment.sql`).

Pasos mínimos tras recibir autorización:
1. Crear un proyecto Supabase Free dedicado (`scrumban-qa-text`, nunca DEV/PROD) y anotar su `project_ref` de 20 caracteres.
2. Deshabilitar registro público, SMTP propio, cron jobs externos (`cron.schedule`) y no desplegar Edge Functions ni secretos de proveedores externos (WhatsApp/correo/Retell).
3. Aplicar las migraciones base + R1 + R3 + R2 (`20261120120000_agent_apply_action_status.sql`) neutralizando únicamente los `cron.schedule` productivos y el UUID fijo histórico. **No aplicar `20261118150000_direction_executive_scope.sql` (R0).**
4. Ejecutar auditoría de solo lectura `scripts/qa/sql/r2-audit.sql` (6/6 RPCs `agent_*`, `agent_execution_gate` sin grants, `agent_action_receipts` RLS solo lectura dueño, trigger guard activo).
5. Ejecutar `supabase/scripts/qa/seed_qa_environment.sql` sustituyendo `__QA_PROJECT_REF__` por el `project_ref` QA autorizado (habilita `agent_execution_gate`, crea `qa_outbox` y `qa_whatsapp_linked`).
6. Crear 4 identidades sintéticas `@example.invalid` distintas y activas: `super_admin` (Ejecutivo con escritura), `direccion` (Dirección lectura), `lider` (Líder), `operativo` (Operativo), más opcional `analista`.

## 2. Seguridad de notificaciones (`agent_notify_responsable`)

- `agent_notify_responsable` en `R2_EXECUTION_MODE=qa` utiliza `createQaActionExecutor` (`api/_shared/actions/r2Runtime.ts`), que escribe **exclusivamente en `public.qa_outbox`** y nunca invoca `send-notification-email`, WhatsApp Graph ni dispatchers.
- Las herramientas heredadas de comunicación (`notify_action_email`, `notify_user_email`, `whatsapp_prepare_send`, `gmail_*`) son rechazadas por `confirmPendingOp` en modo `qa` (`EXECUTION_DISABLED`).
- `textCompleteGuard.mjs` aborta antes de correr si detecta credenciales de proveedores reales (`WHATSAPP_ACCESS_TOKEN`, `RETELL_API_KEY`, etc.) en el entorno.
- El escenario `E13` verifica `delta === 0` en `notification_email_logs` y `whatsapp_messages`, y fila creada únicamente en `qa_outbox`.

## 3. Ventana Preview única (variables solo en `target=preview`, rama candidata)

- `VITE_SUPABASE_URL` / `SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` -> proyecto QA dedicado
- `AGENT_ORCHESTRATOR_R1=1`
- `AGENT_MEMORY_R3=1`
- `R2_EXECUTION_MODE=qa`
- `R2_QA_PROJECT_REFS=<qa_project_ref>`
- `COPILOT_R2_GATE=0` (o `1` si se evalúa gate copiloto), `R0`/`R4` ausentes/OFF, Vercel SSO activo, sin secretos WhatsApp/SMTP/Retell.

## 4. Comandos locales y ventana autorizada

```powershell
# Validación local del harness (sin red ni secretos)
npm run qa:text:test

# Preflight solo lectura (0 escrituras; requiere READY para continuar)
$env:NODE_OPTIONS = "--use-system-ca"
$env:TC_ENV_FILE = ".env.tc.qa.local"
npm run qa:text:preflight

# Ejecución integrada (Bloques A + B E1-E13 + C 1-3, limpieza automática tc-qa-*)
$env:TC_QA_AUTH = "AUTH-TEXT-COMPLETE-QA"
npm run qa:text:run -- --execute

# Rollback Preview OFF (dry-run sin --apply; real con autorización)
npm run qa:text:rollback
$env:TC_ROLLBACK_AUTH = "AUTH-TEXT-COMPLETE-ROLLBACK"
npm run qa:text:rollback -- --apply
```

## 5. Reconciliación, limpieza y rollback DB

- **Ejecución incierta (503/504/timeout):** `reconcileUncertainOp` consulta `assistant_pending_ops`, `agent_action_receipts` y `acciones_diarias` antes de reintentar; nunca repite escrituras ciegamente.
- **Limpieza:** el bloque final de `textCompleteSuite.mjs` elimina únicamente IDs rastreados (`tc-qa-<runId>-`) incluso ante fallo crítico y exige `remainingTotal === 0`.
- **Rollback DB QA:** `DELETE FROM public.agent_execution_gate;` cierra inmediatamente la puerta R2; opcionalmente `supabase/scripts/rollback_agent_apply_action_status.sql` revierte RPCs, trigger guard, `claimed_at`, gate y recibos.


## Aceptación controlada del 25 de noviembre de 2026

### Publicación autorizada y reversibilidad

- PR #14 publicado mediante squash en `17eb574fc57789d052b37244a19644069d3f08ba`.
- Fuente: `6cc47da3a3b06b39fe036d090aace342472edc5d`. Árbol fuente/publicado idéntico: `a16658f907f9d15d342d7be3b2ba3af50fe82053`.
- Main conserva protección y revisiones mediante PR. No se cambiaron secretos, migraciones ni GEMINI_MODEL.
- Production READY: `dpl_7XfPZiPsKU7MqAy9sMzdjm5wdd5y`. Lectura del alias `scrumbanemx.vercel.app` a las 19:10:05Z confirma ese despliegue.
- Rollback disponible: main anterior `475cc8de961ea2da146778b5a8851750e9f1a1c4`, despliegue READY `dpl_F63SvmnJano84z3rxYUe2totjgvW`. Reasignar únicamente el alias al despliegue previo mediante el procedimiento autorizado; no restaurar permisos SQL ni flags globales. No se ejecutó rollback.

### Evidencia real y límites

Sesión autenticada en el asistente principal: «Envíale a Gerardo un WhatsApp con la información de su día de hoy». El resultado contiene compromisos reales, vencimientos y un borrador dirigido a Gerardo; no copia la instrucción. No se pulsó confirmar, no hubo envío externo ni modificación de acciones. Captura local: `.tmp/production-contextual-whatsapp-20261125.jpg` en el checkout principal (no se publica para evitar divulgar datos operativos).

La prueba acredita preparación contextual en el asistente principal, no entrega, exactitud exhaustiva del tablero, paridad real de canales ni aceptación comercial completa. No se ejecutaron llamadas Retell, notas de voz, primera creación R2 desde un teléfono, actualizaciones reales ni resumen ejecutivo con proveedor. La sesión autenticada por sí sola no acredita esos casos.

### Corrección dirigida adicional (sin publicar en Production)

- El cliente generaba requestId nuevo en cada turno y no enviaba conversationId: el backend abría otro contexto. Ahora conserva conversationId hasta limpiar chat.
- Las rutas locales de consulta/aclaración y creación podían interceptar el mensaje antes del motor compartido. El chat principal y su variante flotante usan el mismo endpoint existente. No se añaden motores ni permisos.
- Referencias a personas en borradores reutilizan el resolvedor existente; los cambios de destinatario/canal recomponen datos autorizados y conservan propósito, versión e identidad de propuesta. Se elimina la duplicación de pendingWrite para comunicaciones.
- Las acciones seleccionadas se reconsultan mediante get_action_details del actor autenticado. Solo se aceptan UUID y se limita el lote; no se confía en contenido enviado por el navegador. El contexto de distinto fingerprint no se conserva.
- La confirmación del compositor solo persistía autorización en contexto, sin despacho. La respuesta ahora lo dice expresamente; no se afirma encolado, envío ni entrega. Vincular ese compositor con el flujo de envío existente sigue pendiente; no se crea una segunda integración.
- Regresiones A y C y cambios de destinatario/canal verificadas con fixtures en web, WhatsApp y voz. No equivalen a pruebas reales de teléfono/Retell.
- La suite inicial completa tenía una expectativa preexistente del literal «R2 deshabilitado» frente al mensaje actual «solo para revisión». Se comprobó en HEAD antes de modificarla. Se actualizó el contrato de texto, conservando la aserción draft_only_r2_off y agregando que no se guardó en Scrumban; no se habilitaron escrituras.

### Condiciones pendientes de aceptación

- Publicación de la corrección adicional mediante revisión y controles vigentes: PR separado, sin merge automático.
- Repetir A/C y cambios de canal/destinatario en chat principal y flotante desplegados; confirmar que no se solicita resolver toda la oración como nombre.
- Primera creación y actualización R2: ejecutar desde el teléfono del piloto, confirmar propuesta vinculada, verificar ID persistido en Kanban y registro de idempotencia. No simular un mensaje entrante para afirmar que fue un usuario real.
- Comunicaciones: autorización específica de destinatario y contenido antes de enviar; verificar outbox/proveedor y entrega, no solo confirmación en contexto.
- Retell/voz: verificar costo real compatible con presupuesto adicional cero antes de abrir una llamada.
- Timeout: no se incorpora el parche local que cierra habla activa tras 45s, ni expiración server-side basada solo en updated_at. Faltan señal fiable de intervención activa, preservación de contexto al reanudar, liberación de recursos y aceptación real a 150/180s sin cortar operaciones. R4 continúa congelado salvo esta seguridad.
- R1 activo; R2 solo piloto; WhatsApp global OFF; R3 OFF. Dispatcher recurrente OFF es restricción vigente, no se ha acreditado por lectura en esta sesión. No hay cambios de flags ni nuevas integraciones pagadas.
- Estado comercial: **NO-GO para OWNER ACCEPTED** mientras falte evidencia real de los casos anteriores. No se inicia R3/R4 ni se amplía piloto.
