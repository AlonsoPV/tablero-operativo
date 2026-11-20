# Enviardián · QA controlado R1/R2

Guía para validar R1 y R2 con sesiones JWT reales sin tocar DEV ni PROD. Todo lo descrito está preparado en la rama local `r2/qa-consolidacion`; **nada se ha creado, aplicado ni ejecutado en ningún entorno remoto**.

## Qué protege el modo QA

| Capa | Control | Dónde |
| --- | --- | --- |
| Servidor | `R2_EXECUTION_MODE=qa` y referencia de `SUPABASE_URL` incluida en `R2_QA_PROJECT_REFS` | `api/_shared/actions/executionMode.ts` |
| Servidor | Lista de bloqueo fija: DEV `tgiuevzlyptzlfgxsfhj` y PROD `xhpasmjzuwifmjhrsumb`, aunque estén en la allowlist (la allowlist completa se invalida) | `BLOCKED_PROJECT_REFS` |
| Servidor | Nunca con `VERCEL_ENV=production` ni `NODE_ENV=production`; sólo `process.env` | `resolveR2ExecutionMode` |
| Servidor | Ejecutor `qa` sólo con modo `qa`; comprueba que `agent_execution_environment()` coincide con la referencia configurada | `gateR2Confirmation`, `createQaActionExecutor` |
| BD | `agent_execution_allowed()` cerrado salvo la fila del seed QA; claim y RPC lo exigen | `20261120120000` + `supabase/scripts/qa/seed_qa_environment.sql` |
| BD | Reserva sólo por `agent_claim_pending_op` (`claimed_at`); los clientes no pueden fijar `executing` en operaciones del agente | trigger `assistant_pending_ops_guard_agent_claim` |
| Proveedores | Avisos sólo en `qa_outbox`; las herramientas de comunicación y Google del copiloto se niegan en `qa` | `confirmPendingOp` |

## Proyectos y cuentas

Dos proyectos QA nuevos (A y B), separados de DEV y PROD. B sólo sirve para comprobar que un JWT de otro proyecto se rechaza en A.

| Cuenta (`example.invalid`) | Proyecto | Perfil |
| --- | --- | --- |
| `qa-r2-super-admin` | A | Super Admin (acumulativo) |
| `qa-r2-direccion` | A | Dirección (lectura ejecutiva) |
| `qa-r2-direccion-okrs` | A | Dirección con módulo OKRS |
| `qa-r2-okrs-area` | A | Área OKRS (base Analista) |
| `qa-r2-lider` | A | Líder, creadora de las acciones sintéticas |
| `qa-r2-responsable` | A | Responsable (Operativo) |
| `qa-r2-analista` | A | Analista |
| `qa-r2-inactivo` | A | Inactivo |
| `qa-r2-admin-b` | B | Super Admin de B |
| `qa-r2-analista-b` | B | Analista de B |

`scripts/qa/provision-qa-accounts.mjs` crea las cuentas, el rol de catálogo «QA OKRS (sintético)» y tres acciones con id fijo. Por defecto sólo imprime el plan; `--apply` escribe. Usa la service role del proyecto QA únicamente para aprovisionar; la contraseña llega por `QA_ACCOUNT_PASSWORD` y no se guarda. El manifiesto `.qa/manifest-<A|B>.json` (ignorado por git) no contiene secretos.

## Orden de ejecución (cada paso requiere autorización)

1. Crear QA A y QA B (Micro, 48 h).
2. Aplicar en ambos la base del esquema y las migraciones hasta R1 (`20261119120000` incluida), y después `20261120120000_agent_apply_action_status.sql`. Nunca en DEV ni PROD.
3. En QA A, sustituir `__QA_PROJECT_REF__` en `seed_qa_environment.sql` y ejecutarlo. El script rechaza el marcador, DEV y PROD.
4. Exportar `R2_QA_PROJECT_REFS`, `QA_A_*`, `QA_B_*` y `QA_ACCOUNT_PASSWORD`; ejecutar `node scripts/qa/provision-qa-accounts.mjs` (dry-run), revisar y repetir con `--apply`.
5. Ejecutar `node scripts/qa/run-jwt-suite.mjs`. Deja `.qa/jwt-report-<ts>.json`.
6. Para el flujo HTTP, desplegar una preview de QA con `R2_EXECUTION_MODE=qa`, `R2_QA_PROJECT_REFS`, `SUPABASE_URL` de QA A y, si se valida el copiloto, `COPILOT_R2_GATE=1`. Nunca en producción.
7. Al terminar: `delete from agent_execution_gate;` y borrar los proyectos QA.

## Matriz JWT (`run-jwt-suite.mjs`)

| ID | Comprueba |
| --- | --- |
| JWT-01 | Las cuentas activas inician sesión con JWT real de A |
| JWT-02 | La puerta en BD está abierta y declara A |
| JWT-03 | PostgREST no permite fijar `executing` ni `claimed_at`; la RPC sin claim responde `not_confirmed` |
| JWT-04 | Responsable: claim + RPC una vez; el reintento devuelve el recibo; el recibo sólo lo ve su autor |
| JWT-05 | Bloqueo por el responsable: Bloqueado, comentario `bloqueo_reportado` y `causa_raiz` intacta |
| JWT-06 | Historial: responsable, creadora y Super Admin sí; Analista, Dirección y Dirección con OKRS no |
| JWT-07 | Analista, Dirección y Dirección con OKRS no ejecutan; Área OKRS se registra |
| JWT-08 | Cuenta inactiva: sin sesión o sin claim |
| JWT-09 | Super Admin aplica sobre una acción ajena (edición general acumulativa) |
| JWT-10 | Lectura por perfil de las acciones sintéticas (observación, sin aserción) |
| JWT-11 | Un JWT de B responde 401 en A |
| JWT-12 | Cambio de rol entre propuesta y confirmación: la RPC niega con el rol vigente |
| JWT-13 | Dos claims concurrentes: uno solo; un solo recibo |
| JWT-14 | Confirmación vencida: el claim no reserva |
| JWT-15 | Verificado nunca se asigna desde el agente |
| JWT-16 | `notification_email_logs` y `whatsapp_messages` sin filas nuevas; avisos sólo en `qa_outbox` |

La service role del proyecto QA sólo restablece estados, cambia un rol en JWT-12 y cuenta filas de proveedores. Nunca sustituye a un usuario en una comprobación de permisos.

## Copiloto: inventario y puerta

`executePayload` (`api/_shared/assistantOpsRuntime.ts`) ejecuta hoy:

| Grupo | Herramientas | Con `COPILOT_R2_GATE=1` |
| --- | --- | --- |
| Acciones | `create_action`, `update_action`, `add_action_comment`, `update_checklist_item`, `mark_action_done`, `verify_action` | Puerta R2 (contratos `create_action`, `update_fields`, `add_comment`, `update_checkpoint`, `update_status` con Hecho, `verify_action`) |
| Comunicación | `notify_action_email`, `notify_user_email`, `whatsapp_prepare_send` | Sin cambios; en modo `qa` se niegan |
| Fuera de la puerta | `api/_shared/guideWork.ts` (Guía) inserta acciones directamente | Sin cambios (R2-11) |

Con el flag apagado el flujo es idéntico al actual (probado en `copilotR2Gate.test.ts`). No se activa en producción aunque la variable exista.

## Bloqueo reportado: compatibilidad

- El agente nunca escribe `causa_raiz`. La causa reportada es un comentario `tipo_comentario='bloqueo_reportado'` con «Causa reportada: …», distinto de una causa raíz validada.
- No hay cambio de esquema: `tipo_comentario` es texto libre (`20260731120000`).
- La UI no conoce el tipo y muestra el comentario sin etiqueta, como uno normal; la exportación lo marca «Sin clasificar»; editarlo conserva el tipo.
- Autorización sin cambios: responsable o `can_edit_accion_general_as`; Analista y Dirección siguen negados; no se concede edición general.
- `agent_action_block_history` también devuelve los «Bloqueo reportado por WhatsApp:» previos.

## Pendientes antes de liberar

- Revisar la compatibilidad de `20261120120000` con un export del esquema de QA (funciones y columnas reales de `assistant_pending_ops`, propietario de las funciones definer, enum `action_status`).
- Verificar en QA el ACL de `can_edit_accion_general_as` para `authenticated` (R2-05).
- Rollback: `supabase/scripts/rollback_agent_apply_action_status.sql` (conserva estados y comentarios).
