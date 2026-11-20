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

## QA local sin costo · Supabase local en WSL2 · 2026-11-19

Alternativa a los proyectos remotos, sin costo. Se ejecutó en la rama local `qa/supabase-local` (base `integration/r1-r2-cierre`, `2303bb9`). No se tocó DEV ni PROD, no hubo push, merge ni despliegue.

**Entorno.** Windows 11 Home, WSL2 con Ubuntu y Docker Engine dentro de WSL (sin Docker Desktop), Supabase CLI 3.2.0 en Ubuntu. Las dos instancias juntas usan cerca de 1,5 GB de memoria.

| Instancia | `project_id` | Referencia local | API | DB |
| --- | --- | --- | --- | --- |
| QA A | `scrumban-qa-a` | `qalocala000000000000` | 54421 | 54422 |
| QA B | `scrumban-qa-b` | `qalocalb000000000000` | 54521 | 54522 |

Cada instancia tiene su propia clave de firma ES256, así que un JWT de una responde 401 en la otra. Se excluyen los servicios que QA no usa (`realtime`, `studio`, `edge-runtime`, `logflare`, `vector`, `supavisor`, `imgproxy`, `mailpit`, `postgres-meta`); `storage-api` se mantiene porque 13 migraciones lo requieren.

**Procedimiento.**

1. `node scripts/qa/local/prepare-instance.mjs` genera ambas instancias **fuera del repo** (por defecto `../scrumban-qa/instances`): `config.toml`, `seed.sql` (sólo A, con su referencia), copia parcheada de `supabase/migrations` e `instances.json`. Aborta si el destino está dentro del repo o si la copia o `config.toml` contienen las referencias de DEV o PROD.
2. Desde WSL: `bash scripts/qa/local/instance.sh <dir-instancia> start`. Sólo acepta `project_id` con prefijo `scrumban-qa-`, crea la clave de firma si falta y aplica migraciones y seed. `reset`, `status`, `env` y `stop` (`--no-backup`) completan el ciclo.
3. Exportar en la sesión: `QA_LOCAL=1`, `QA_LOCAL_PORTS=54421,54521`, `R2_QA_PROJECT_REFS`, `QA_A_*` y `QA_B_*` (con `QA_<T>_LOCAL_REF`) y `QA_ACCOUNT_PASSWORD` aleatoria sólo en memoria.
4. Aprovisionar con `provision-qa-accounts.mjs --apply` y ejecutar `run-jwt-suite.mjs`.
5. Para la matriz web: `npm run dev -- --mode qa --port 5180 --strictPort --host 127.0.0.1` con un `.env.qa.local` (ignorado por git) que apunta a QA A y enciende `AGENT_ORCHESTRATOR_R1=1`, `R2_EXECUTION_MODE=simulated` y `COPILOT_R2_GATE=1`. Después `QA_API_BASE=http://127.0.0.1:5180 node scripts/qa/run-api-matrix.mjs`.
6. Al terminar: `delete from agent_execution_gate;` en QA A y `instance.sh … stop` en ambas.

**Guarda `QA_LOCAL`.** `qaGuard.mjs` acepta un destino local sólo si `QA_LOCAL=1`, la URL es `http` a `127.0.0.1` o `localhost`, el puerto está en `QA_LOCAL_PORTS`, la referencia cumple `^qalocal[a-z0-9]{13}$` y no hay `VERCEL`, `VERCEL_ENV` ni `NODE_ENV=production`. DEV y PROD se bloquean igual que en modo remoto. Sin `QA_LOCAL` las reglas remotas no cambian (`qaGuard.test.mjs`, 6 pruebas).

**Parches de réplica (sólo en la copia de la instancia).** El historial no se aplica limpio desde cero (R2-15):

| Migración | Problema | Parche |
| --- | --- | --- |
| `20260313190000` | Asigna super_admin a un UUID real fijo | Se sustituye por `select 1` |
| `20260601170000` | `ALTER TABLE auth.users`: en local el dueño es `supabase_auth_admin` | Se elimina esa sentencia |
| `20260625161411` | Cambia el tipo de retorno de `try_set_accion_hecho` | `DROP FUNCTION IF EXISTS` previo |
| `20260629201032`, `20261103121000`, `20261104140000` | `cron.schedule` hacia URLs de DEV/PROD | Se elimina el bloque; `cron.job` queda vacío |

Resultado: 228 migraciones aplicadas en ambas instancias, `cron.job` vacío, puerta abierta sólo en QA A (`agent_execution_allowed()=true`, entorno `qalocala000000000000`) y cerrada en QA B.

**Límites de la validación local.**

- `executionMode.ts` sólo reconoce referencias `*.supabase.co`. Contra una URL local el modo `qa` del servidor queda desactivado, así que la confirmación HTTP con el ejecutor `qa` no se validó. La RPC y la puerta en BD sí se validaron con JWT reales (JWT-01 a JWT-16).
- La matriz web usó `R2_EXECUTION_MODE=simulated`: las propuestas no se ejecutan por diseño.
- Supabase local escucha en `0.0.0.0` dentro de la red NAT de WSL. Sólo hubo cuentas sintéticas.

### Resultados JWT-01 a JWT-16

16/16 correctas (`.qa/jwt-report-1795149360412.json`, no versionado). Observaciones:

- JWT-06: el historial de bloqueos lo ven responsable, creadora y Super Admin; Analista, Dirección y Dirección con OKRS no.
- JWT-07: Analista, Dirección y Dirección con OKRS reciben `not_authorized`.
- JWT-08: la cuenta inactiva sí obtiene sesión de Auth, pero no consigue claim ni ejecuta.
- JWT-10: la Analista (área Calidad) ve 0 acciones sintéticas; los demás perfiles ven 3.
- JWT-11: el JWT de B responde 401 en A (y el de A en B).
- JWT-16: 0 filas en `notification_email_logs` y `whatsapp_messages`; `qa_outbox` en 0 porque ningún caso pide aviso.

### Matriz API R1/R2 (`run-api-matrix.mjs`)

18/21 correctas, 3 defectos conocidos y 0 fallos nuevos (`.qa/api-matrix-1795150645130.json`). Los tres fallos son QA-R1-01 (ver `risks-and-dependencies.md`).

| Caso | Resultado |
| --- | --- |
| F1 Una pregunta por persona y otra agregada responden 200 con la misma intención en Auto, Directo, Reporte y Análisis | Correcto (ambas) |
| F2 Mismas referencias y misma cifra principal en los cuatro formatos | Correcto (ambas) |
| F3 `operational_summary` sólo cuando el formato resuelto es Reporte | Correcto (ambas) |
| F4 Dirección: «modo reporte» persiste en la conversación y conserva referencias | Correcto |
| F4 La misma persistencia con Super Admin y con Área OKRS | **Falla, QA-R1-01** (dos casos) |
| F5 Dirección: «automático» vuelve a Auto; otra conversación arranca en Auto | Correcto |
| F6 Analista sin alcance de asistente: 403 en los cuatro formatos, sin datos | Correcto |
| F7 Cuenta inactiva: 403 | Correcto |
| F8 «otro equipo / privadas» se limita al equipo autorizado en los cuatro formatos | Correcto |
| R2-A Super Admin: la propuesta queda con `executionEnabled=false` | Correcto |
| R2-A2 Super Admin: la propuesta identifica la acción del turno anterior | **Falla, QA-R1-01** (sin contexto de sesión) |
| R2-B Verificado se rechaza | Correcto |
| R2-C Bloqueo y aviso quedan como propuesta | Correcto |
| R2-D Dirección y Área OKRS no preparan cambios | Correcto |
| R2-E Líder sin módulo de asistente recibe 403 | Correcto |
| R2-F Ninguna acción cambia de estado ni de `updated_at` | Correcto |
| R2-G `qa_outbox` en 0 y sin operaciones ejecutadas por el canal web | Correcto |

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
| Guía | `persistGuideWork` | Cerrada (R2-11): no inserta. La creación queda en la confirmación de R2 |

Con el flag apagado el flujo es idéntico al actual (probado en `copilotR2Gate.test.ts`). No se activa en producción aunque la variable exista.

## Bloqueo reportado: compatibilidad

- El agente nunca escribe `causa_raiz`. La causa reportada es un comentario `tipo_comentario='bloqueo_reportado'` con «Causa reportada: …», distinto de una causa raíz validada.
- No hay cambio de esquema: `tipo_comentario` es texto libre (`20260731120000`).
- La UI no conoce el tipo y muestra el comentario sin etiqueta, como uno normal; la exportación lo marca «Sin clasificar»; editarlo conserva el tipo.
- Autorización sin cambios: responsable o `can_edit_accion_general_as`; Analista y Dirección siguen negados; no se concede edición general.
- `agent_action_block_history` también devuelve los «Bloqueo reportado por WhatsApp:» previos.

## Matriz manual de formatos y Reporte web

Ejecutada el 2026-11-19 contra QA A local, servidor Vite `--mode qa` con `AGENT_ORCHESTRATOR_R1=1`, en escritorio (1024 px) y móvil (390 px), con cuentas sintéticas. Capturas fuera del repo, en `scrumban-qa/evidence/` (`escritorio-0N-*.png`, `movil-0N-*.png`).

| Caso | Escritorio | Móvil |
| --- | --- | --- |
| El selector ofrece Auto, Directo, Reporte y Análisis. Auto es el valor al abrir una pestaña nueva | Correcto (`escritorio-01`) | Correcto, pero la opción «Análisis» queda recortada en el borde derecho, aunque se puede pulsar (QA-R1-03, `movil-01`) |
| La selección sobrevive a recargar la pestaña y no aparece en otra pestaña | Correcto: mismo `conversationId` al recargar; la pestaña nueva arranca en Auto con otro identificador | Correcto |
| Reporte muestra el resumen operativo existente: indicadores, prioridades, riesgos y limitaciones, sin tarjetas sueltas | Correcto con «¿Qué está poniendo en riesgo la operación?»: Resumen operativo, indicadores y limitación (`escritorio-03`); Análisis con las mismas cifras (`escritorio-04`) | Correcto (`movil-03`, `movil-04`) |
| «modo reporte» y «automático» cambian la presentación y conservan las cifras | **Falla (QA-R1-02):** la web trata la directiva como un nombre («No encontré a nadie llamado «automatico»», igual con «modo reporte»), incluso en un chat limpio (`escritorio-05`, `movil-07`). Por API sí funciona (F4/F5) | **Falla (QA-R1-02)** (`movil-05`) |
| Una pregunta de otro equipo sigue denegada en los cuatro formatos, sin datos ajenos | Correcto: se limita al alcance autorizado (`escritorio-06`) | Correcto (`movil-06`) |
| Una propuesta de escritura no se ejecuta y sigue pidiendo confirmación | Correcto: Dirección recibe «no autorizado»; Super Admin ve una propuesta sin botones de ejecución; Verificado se niega (`escritorio-06`, `escritorio-07`) | Correcto (`movil-06`) |

Observación (QA-R1-02): `runConversationTurn` en `AiAssistPage.tsx` resuelve en el cliente muchas preguntas reconocidas sin llamar a `/api/gemini-chat`, y en ese camino el selector no se aplica. El selector sólo afecta a las preguntas que llegan al servidor.

## Pendientes antes de liberar

- Corregir QA-R1-01 (huella de capacidades mayor de 128 caracteres) y QA-R1-02 (directivas y selector en el camino del cliente), y repetir la matriz API y la visual.
- Validar la confirmación HTTP con el ejecutor `qa` en un entorno que `executionMode.ts` reconozca; en local no aplica.
- `20261120120000` se aplicó limpia sobre la réplica local de 228 migraciones y JWT-01 a JWT-16 pasaron. Queda contrastarla con el esquema real de QA remoto si se usa.
- ACL de `can_edit_accion_general_as` para `authenticated` (R2-05): no se comprobó de forma explícita en esta sesión.
- Rollback: `supabase/scripts/rollback_agent_apply_action_status.sql` (conserva estados y comentarios).
