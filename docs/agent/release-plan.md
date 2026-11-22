# Enviardián · releases y ejecución R0–R1

## Congelación R1 · 2026-11-20

Rama local `qa/supabase-local` sobre `f0bc1ca`. Commit de cierre **local**: sin push, merge, preview alojada, despliegue ni cambios en DEV/PROD. Evidencias `scrumban-qa/evidence/r104-*` y las anteriores (`cierre-*`, `escritorio-*`, `movil-*`) se conservan.

### Inventario del cierre QA-R1-04

Todos los archivos del commit de congelación corresponden a QA-R1-04, su registro o la preparación de la siguiente puerta. Ninguno toca migraciones remotas, R2 de producción ni R0.

| Archivo | Rol |
| --- | --- |
| `vite.config.ts`, `src/vite-env.d.ts` | Un solo origen: `AGENT_ORCHESTRATOR_R1` → `__AGENT_ORCHESTRATOR_R1__` en el cliente |
| `src/features/ai-support/conversation/runTurn.ts` | Handoff `orchestrator` en Auto cuando el flag está encendido |
| `src/features/ai-support/pages/AiAssistPage.tsx` | Pasa el flag; no llama `tryFactualAssistantReply` con orquestador activo |
| `api/gemini-chat.ts` | `runChannelTurn` en try/catch; fallo → 502, sin Gemini |
| `api/_shared/orchestrator/intent.ts` | `equipo(s)?` como término operativo para «¿Y las de mi equipo?» |
| `conversation.e2e.test.ts`, `r1Acceptance.test.ts` | Handoff Auto y secuencia pendiente → vencida → hecho → reporte → equipo |
| `docs/agent/qa-r1-r2.md`, `release-plan.md`, `risks-and-dependencies.md` | Registro, freeze, preview y GO/NO-GO |

### Registro de cierres RF / QA-R1

| ID | Alias | Estado | Evidencia |
| --- | --- | --- | --- |
| RF-01 | Formatos web (el cliente contestaba Kanban/OKR) | **Cerrado** vía QA-R1-02 + QA-R1-04 | Directivas primero; con flag, Auto también va al orquestador |
| RF-02 | Selector móvil «Análisis» recortado | **Cerrado** vía QA-R1-03 | Visible y pulsable a 320, 390 y 768 px (`r104-movil-*-selector.png`) |
| RF-03 | Preferencia de formato entre usuarios de la misma pestaña | **Cerrado en alcance R1** | `sessionStorage` de pestaña; nueva pestaña arranca en Auto con otro `conversationId`. Claves globales `assistant.*` no se rehacen en este freeze |
| RF-04 | Continuidad Auto («esa acción») | **Cerrado** vía QA-R1-04 | `lastActions` en servidor; propuesta Hecho con confirmación (`r104-escritorio-propuesta.png`) |
| QA-R1-01 | Huella de capacidades > 128 | **Cerrado** | SHA-256; F4 Super Admin / Área OKRS y R2-A2 21/21 |
| QA-R1-02 | Directivas tratadas como nombres | **Cerrado** | `parseFormatDirective` compartido |
| QA-R1-03 | Selector a 320/390/768 | **Cerrado** | Fila propia, `whitespace-nowrap` |
| QA-R1-04 | Auto local sin contexto de servidor | **Cerrado** | Este commit |

### Flags (frontend y backend)

| Flag | Dónde se lee | Efecto con `=1` | Producción |
| --- | --- | --- | --- |
| `AGENT_ORCHESTRATOR_R1` | Servidor: `isAgentOrchestratorEnabled()` (`process.env`). Cliente: Vite `define` `__AGENT_ORCHESTRATOR_R1__` desde **la misma** variable (no un segundo interruptor `VITE_*`) | Consultas operativas (incluido Auto) al orquestador | Apagado por omisión. Encenderlo exige autorización |
| `R2_EXECUTION_MODE` | Sólo servidor (`resolveR2ExecutionMode`) | `qa` o `simulated` en QA local. En Vercel / `NODE_ENV=production` / `VERCEL_ENV=production` es siempre `disabled` | **Deshabilitado** |
| `COPILOT_R2_GATE` | Servidor; ignorado en producción | Copiloto por la puerta R2 | Apagado |

R2 permanece deshabilitado fuera de QA local. `.env.qa.local` (gitignored) tiene `AGENT_ORCHESTRATOR_R1=1` y `R2_EXECUTION_MODE=simulated`. No hay ejecución remota.

### Rollback de R1

1. Quitar `AGENT_ORCHESTRATOR_R1=1` del entorno. Los tres canales vuelven al flujo previo (cliente local + Gemini).
2. No hace falta migración inversa: R1 no aplica esquema en este freeze.
3. Si una preview ya existiera: redeploy sin el flag o rollback del deployment. No restaurar privilegios SQL.

### Condiciones para habilitar R1 (ninguna ejecutada)

1. Autorización expresa del flag `AGENT_ORCHESTRATOR_R1=1` en un entorno que **no** sea DEV ni PROD.
2. Preview alojada autorizada (sección siguiente) o aceptación formal de que QA local basta para el piloto.
3. R0 sigue **NO-GO** de liberación; habilitar R1 en QA no cierra R0.
4. R2 no se enciende con R1. `R2_EXECUTION_MODE` y `COPILOT_R2_GATE` requieren autorización aparte.

### Preview alojada (no creada)

La org ya ocupa DEV y PROD: **no hay cupo Free para un tercer proyecto**. Un QA `*.supabase.co` nuevo no es cero costo. Esta puerta, si se autoriza, es **solo Preview Hobby** con R2 apagado. Detalle H-01…H-10: `qa-r1-r2.md`. Auditoría R0: `r0-prod-readonly-audit.md`.

### Checklist exacto de autorizaciones (ninguna concedida aquí)

**R0**

- [ ] Revisar y autorizar pegar `supabase/scripts/audit_r0_prod_readonly.sql` en el SQL Editor de PROD.
- [ ] Autorizar lectura de logs Edge (sin POST al dispatcher).
- [ ] Tras el export: excepción de atribución del 401 **o** causa correlacionada (no implica cambiar cron).
- [ ] Tras el export: no-replay de los dos P0001 **o** CAS productiva aparte. Nunca `done`/`pending` en esta sesión.
- [ ] Prohibir `db push` / `migration repair` hasta inventario del desfase pre-noviembre.

**Preview R1 (R2 off)**

- [ ] Autorizar un deployment **Preview** Hobby (push de rama o deploy Preview). **No** Production. **No** merge a `main`.
- [ ] Autorizar `AGENT_ORCHESTRATOR_R1=1` **solo** en entorno Preview.
- [ ] Autorizar el destino de `VITE_SUPABASE_URL` / `SUPABASE_URL` de esa Preview: DEV (lectura R1) **o** otro destino Free ya existente. **Nunca PROD.** Nunca un proyecto Micro/Pro nuevo.
- [ ] Confirmar que `R2_EXECUTION_MODE`, `COPILOT_R2_GATE`, `R2_QA_PROJECT_REFS` y la semilla de puerta **no** se activan.
- [ ] Autorizar usar `GEMINI_API_KEY` ya existente (sin clave nueva de pago).
- [ ] Autorizar ejecutar H-01…H-10 y, al terminar, el rollback (quitar el flag Preview y redesplegar).

**Explícitamente no se pide**

Crear proyecto Supabase, aplicar migraciones, encender R2, push/merge a producción, POST al dispatcher, replay P0001.

### GO/NO-GO congelado

| Release | Veredicto |
| --- | --- |
| R0 | **NO-GO** ejecutar. GO PARA PREPARAR Autorizaciones 1–3 (`r0-authorization-requests.md`). Fuera de R0: `db push`, repair, flags R1, R2 `20120000`, redeploy Edge |
| R1 | **GO funcional QA local** (`640fa52`). **NO-GO** preview hasta las autorizaciones de arriba. **NO-GO** producción |
| Formatos R1 | Igual que R1 |
| R2 | **GO** QA local con `QA_LOCAL=1`. **NO-GO** esta preview y **NO-GO** producción |

Preview R1 (cuando existan las autorizaciones): **GO** si H-01…H-10 pasan; **NO-GO** si H-08 ve efecto, si la Preview habla con PROD, o si hay costo nuevo.

Bloqueos que este freeze **no** cierra: R0 (401, P0001, RD-06), R2-15, QA-DB-01, habilitación de R2.

## Cierre QA-R1-04 y preparación de release · 2026-11-19

Rama local `qa/supabase-local` (HEAD `f0bc1ca` más el handoff Auto). Sin push, merge, preview alojada ni cambios en DEV/PROD. Evidencia `scrumban-qa/evidence/r104-*`.

| Pieza | Validado en QA (local) | Resultado |
| --- | --- | --- |
| R0 | No | Sigue fuera de esta validación |
| R1 | Sí | Auto operativo va al orquestador; `lastActions` persiste; «esa acción» / marcar hecha proponen con confirmación humana. JWT 16/16, matriz API 21/21 |
| Formatos | Sí | Directivas primero; selector visible a 320/390/768. «modo reporte» no reconsulta |
| R2 | Sí, HTTP en modo `qa` local | 7/7. No se pulsó «Aprobar y ejecutar» en visual. Ejecución deshabilitada al terminar |

| Verificación | Resultado |
| --- | --- |
| `vitest run` | 122 archivos, 889 pruebas |
| `run-jwt-suite.mjs` | 16/16 (`.qa/jwt-report-1795153264691.json`) |
| `run-api-matrix.mjs` | 21/21 (`.qa/api-matrix-1795153282529.json`) |
| `run-r2-http.mjs` | 7/7 (`.qa/r2-http-1795153287680.json`) |
| Matriz visual | Super Admin: Auto lista → vencida → propuesta Hecho con «Aprobar y ejecutar» → Reporte → equipo. Analista: sin asistente ni tablero ajeno |

### GO/NO-GO por release

| Release | Veredicto |
| --- | --- |
| R0 | NO-GO. Fuera de esta validación |
| R1 | GO en QA local. NO-GO producción: falta preview hosted autorizado |
| Formatos R1 | GO en QA local. NO-GO producción hasta el mismo preview |
| R2 | GO para seguir en QA local con `QA_LOCAL=1`. NO-GO fuera de QA y NO-GO producción |

Bloqueos que **no** se cierran aquí: QA-DB-01, R2-15, R0, preview hosted (sólo procedimiento en `qa-r1-r2.md`).

`AGENT_ORCHESTRATOR_R1` y `R2_EXECUTION_MODE` sólo viven en `.env.qa.local`.

## Correcciones QA y cierre R1 · 2026-11-19

Rama local `qa/supabase-local` sobre `4413296`. Correcciones de QA-R1-01, QA-R1-02 y QA-R1-03, modo `qa` local opt-in (`QA_LOCAL=1`) y revalidación con JWT reales. Sin push, merge, despliegue ni cambios en DEV o PROD. La evidencia previa en `scrumban-qa/evidence/` se conserva; las capturas nuevas usan prefijo `cierre-`.

| Pieza | Validado en QA (local) | Resultado |
| --- | --- | --- |
| R0 | No | Las validaciones remotas siguen abiertas |
| R1 | Sí | JWT-01 a JWT-16 16/16. Persistencia SHA-256: F4 Super Admin y Área OKRS correctas. R2-A2 identifica la acción |
| Formatos | Sí | Directivas y selector aplican en la web. Reporte muestra el resumen operativo. «Análisis» cabe a 320, 390 y 768 px |
| R2 | Sí, HTTP en modo `qa` local | Propuesta → confirmación (`/api/assistant-ops`) → autorización → ejecución → recibo: 7/7. Idempotencia y concurrencia correctas. Avisos a proveedores: 0 |

| Verificación | Resultado |
| --- | --- |
| `vitest run` | 122 archivos, 885 pruebas |
| `run-jwt-suite.mjs` | 16/16 |
| `run-api-matrix.mjs` | 21/21 |
| `run-r2-http.mjs` | 7/7 |
| Matriz visual | Selector, directivas, Reporte y Análisis correctos en escritorio y móvil. Super Admin ve «Aprobar y ejecutar» cuando la lista pasó por el orquestador |

### GO/NO-GO por release

| Release | Veredicto |
| --- | --- |
| R0 | NO-GO liberación. No forma parte de esta validación |
| R1 | GO en QA local. NO-GO producción: falta preview QA remoto y queda el residual QA-R1-04 (listas Auto en el cliente no alimentan «esa acción» en el servidor) |
| Formatos R1 | GO en QA local. NO-GO producción hasta el mismo preview remoto |
| R2 | GO para seguir en QA local con `QA_LOCAL=1`. NO-GO habilitar fuera de QA y NO-GO producción. Tras esta sesión la ejecución queda deshabilitada |

### Siguiente paso (condiciones exactas)

1. Preview QA **hosted** (`*.supabase.co` en `R2_QA_PROJECT_REFS`), nunca DEV/PROD, con `R2_EXECUTION_MODE=qa` y `AGENT_ORCHESTRATOR_R1=1`.
2. Repetir JWT-01 a JWT-16, la matriz API 21 y `run-r2-http.mjs` contra ese preview.
3. Decidir QA-R1-04: delegar también las listas Auto al orquestador, o sincronizar el contexto local.
4. QA-DB-01 (`accion_evidencias.created_at` vs `uploaded_at`) en un ticket aparte, con SELECT de sólo lectura en DEV.
5. Las seis migraciones de R2-15: no reescribir historia; proponer migraciones forward-only (abajo en riesgos) y exigir autorización antes de aplicarlas.

`AGENT_ORCHESTRATOR_R1` y `R2_EXECUTION_MODE=qa` sólo viven en `.env.qa.local` (gitignored).

## QA local sin costo R1/R2 · 2026-11-19

Rama local `qa/supabase-local`, base `integration/r1-r2-cierre` (`2303bb9`). Dos instancias de Supabase local (QA A y QA B) en WSL2 con Docker Engine, 228 migraciones aplicadas sólo en ellas y cuentas sintéticas. Sin costo, sin push, merge ni despliegue, y sin cambios en DEV ni PROD. `AGENT_ORCHESTRATOR_R1`, `R2_EXECUTION_MODE` y `COPILOT_R2_GATE` sólo se encendieron en `.env.qa.local` (ignorado por git) para el servidor QA local. Procedimiento y detalle en `qa-r1-r2.md`; hallazgos en `risks-and-dependencies.md`.

| Pieza | Validado en QA (local) | Resultado |
| --- | --- | --- |
| R0 | No en esta sesión | Las validaciones remotas siguen abiertas |
| R1 (orquestador y autorización) | Sí | JWT-01 a JWT-16 16/16. Matriz API: alcance, 403 y otro equipo correctos. Contexto de sesión roto para Super Admin y Área OKRS (QA-R1-01) |
| Formatos de respuesta | Sí | Los cuatro formatos conservan intención, referencias y cifras; Reporte muestra el resumen operativo. Las directivas y el selector fallan en el camino del cliente web (QA-R1-02); en móvil, «Análisis» queda recortada (QA-R1-03) |
| R2 (puerta, RPC, autorización) | Sí, en BD con JWT reales y por API en modo `simulated` | Propuestas sin ejecución, Verificado negado, Dirección y Área OKRS sin preparar cambios, Líder sin módulo 403, ninguna acción modificada, `qa_outbox` en 0. La confirmación HTTP con el ejecutor `qa` no se pudo validar en local (QA-R2-01) |

| Verificación | Resultado |
| --- | --- |
| `qaGuard.test.mjs` | 6 pruebas pasaron |
| `run-jwt-suite.mjs` | 16/16 |
| `run-api-matrix.mjs` | 18/21: 3 fallos del defecto QA-R1-01 y 0 fallos nuevos |
| Matriz visual (escritorio 1024 px, móvil 390 px) | 5 de 6 casos correctos en ambos anchos; las directivas fallan (QA-R1-02) |

### GO/NO-GO por release

| Release | Veredicto |
| --- | --- |
| R0 | NO-GO liberación, sin cambios. No forma parte de esta validación |
| R1 | NO-GO liberación hasta corregir QA-R1-01 y repetir F4 y R2-A2. La autorización (JWT-01 a JWT-16) queda validada en local |
| Formatos R1 | NO-GO liberación hasta corregir QA-R1-01 y QA-R1-02 y repetir la matriz visual. QA-R1-03 no bloquea |
| R2 | GO para seguir en QA con la ejecución deshabilitada. NO-GO habilitar y NO-GO liberación: falta la confirmación HTTP con el ejecutor `qa` en un entorno reconocido (QA-R2-01) y depende de R1 |

`AGENT_ORCHESTRATOR_R1` y la ejecución R2 siguen deshabilitados fuera de QA.

## Cierre verificable R1/R2 · 2026-11-19

Rama local `integration/r1-r2-cierre`. Base `r2/qa-consolidacion` (`12e2419`), que ya contiene R1, el hotfix y R2. Encima, merge `--no-ff` de `r1/formatos-respuesta` (`78efe5c`, commits `3be35cc` y `af23d69`) y el cierre de la Guía (`66f227b`). Sin push, sin merge a ramas compartidas, sin despliegue y sin migraciones en DEV o PROD. No se usaron los cambios sin commit de otros worktrees.

| Pieza | Implementado | Integrado | Validado en QA | Liberado |
| --- | --- | --- | --- | --- |
| R0 | Sí, en `r0/estabilizacion` | Sí, es ancestro de esta rama | No. Siguen abiertas las validaciones remotas | No |
| Hotfix de usuarios | Sí | Sí, vía `integration/r1-hotfix` | No en esta sesión. La aplicación previa en DEV y PROD está en `hotfix-usuarios-guard.md` | No, como parte de este cierre |
| R1 | Sí | Sí | No. Falta JWT-01 a JWT-16 | No |
| Formatos de respuesta | Sí | Sí, `78efe5c` | No. La matriz visual de `qa-r1-r2.md` no se ejecutó | No |
| R2 | Sí, puerta y ejecutor apagados por defecto | Sí, `12e2419` | No. Falta la suite JWT | No |
| Cierre de `persistGuideWork` | Sí. Ya no inserta | Sí, `66f227b` | No | No. R2 no se habilita |
| JWT-01 a JWT-16 | Scripts preparados | Sí, en esta rama | No ejecutados | No |

### Resultados locales

| Verificación | Resultado |
| --- | --- |
| `vitest run` | 120 archivos, 876 pruebas, todas pasaron |
| Regresión nombrada (orquestador, query, WhatsApp, copiloto, actions, runtime) | 22 archivos, 267 pruebas, pasaron |
| `tsc -b`, `npm run build`, `scripts/bundle-api.mjs` | Pasaron. El bundle no sobrescribió fuentes |
| SQL en PGlite | R1 transversal 49, hotfix 31, R2 action-status 20, permisos del agente, WhatsApp y OKR: pasaron. Sin conexión a un proyecto |
| `replay-migrations-local.mjs` | No está en el commit de esta rama (sigue sin seguimiento en otro worktree). No se copió ni se ejecutó |
| Docker y `supabase start` | Docker no está instalado. La CLI se resuelve con `npx supabase` 3.2.0 y no arranca sin Docker. No se creó ningún proyecto |
| JWT-01 a JWT-16 | No ejecutados. Faltan `QA_A_*`, `QA_B_*`, manifiestos y `QA_ACCOUNT_PASSWORD`. La guarda no acepta un Supabase local |

### Aislamiento de `conversationId`

Probado en `responseFormat.test.ts`: dos pestañas del mismo usuario no comparten consulta ni formato; el mismo identificador en dos usuarios no comparte contexto; a los 30 minutos el formato vuelve a Automático. Un identificador inválido usa el `requestId` y, si no hay, la sesión `web`. La clave sigue siendo usuario, canal y sesión.

### Checklist de aceptación

- [x] La rama conserva los commits de formatos y el tip de R2, sin reescribirlos.
- [x] `persistGuideWork` no llama a `insert` y, si no hay duplicado, devuelve el error de cierre.
- [x] Vitest, TypeScript, build y el SQL local de R0, R1, hotfix y R2 pasan.
- [x] `conversationId` aísla por usuario y por pestaña, y expira a los 30 minutos.
- [ ] Matriz visual del selector y del Reporte, en escritorio y móvil.
- [ ] JWT-01 a JWT-16 con proyectos QA A y B ya existentes.
- [ ] Autorización para habilitar `AGENT_ORCHESTRATOR_R1` y, después, R2.

### Riesgos abiertos

| Riesgo | Estado |
| --- | --- |
| JWT-01 a JWT-16 sin evidencia | Abierto. Bloquea la liberación de R1 y habilitar R2 |
| Reporte web y selector sin revisión visual | Abierto. La matriz está en `qa-r1-r2.md` y no está marcada |
| R0 remoto | Abierto. La liberación de R0 sigue en NO-GO |
| Guía | Cerrado como escritura directa. Crear acciones desde la Guía no existe hasta pasar por la confirmación de R2; no se añadió ese flujo |
| Réplica completa de migraciones (`replay-migrations-local.mjs`) | Abierta y fuera de esta rama. El SQL focalizado en PGlite sí pasó |

### Veredicto

| Release | Veredicto |
| --- | --- |
| R0 | NO-GO liberación. Las validaciones remotas siguen abiertas |
| R1 y formatos | GO integración local / NO-GO liberación. Falta la matriz visual y JWT-01 a JWT-16 |
| R2 | GO preparación local / NO-GO habilitar y NO-GO liberación. La Guía ya no escribe por fuera. Falta JWT-01 a JWT-16 |

## QA controlado R1/R2 y consolidación de operaciones · 2026-11-19

Rama local `r2/qa-consolidacion`, creada desde `r2/agente-accionable` (`e0eceb1`). Sólo commits locales: sin push, merge, despliegue, migración remota ni recursos creados. Todo lo nuevo está apagado por defecto. Runbook en `qa-r1-r2.md`.

| Cambio | Estado |
| --- | --- |
| Modo `qa` (allowlist de referencias, bloqueo fijo de DEV/PROD, nunca producción, sólo `process.env`) con ejecutor `qa` (JWT del usuario, avisos en `qa_outbox`) conectado en `api/assistant-ops.ts` | Implementado y probado en local |
| Puerta en BD `agent_execution_allowed()` + claim `agent_claim_pending_op` con `claimed_at` (cierra la ruta directa R2-09) | En `20261120120000`, probado en PGlite |
| Seed QA (`supabase/scripts/qa/seed_qa_environment.sql`) y scripts `provision-qa-accounts.mjs` / `run-jwt-suite.mjs` | Preparados; **no ejecutados** |
| Copiloto por la puerta R2 con `COPILOT_R2_GATE` (sin segundo motor; `verify_action` separado) | Implementado; flag apagado, ignorado en producción |
| Bloqueo por responsable: sin `causa_raiz`, comentario `bloqueo_reportado`, `agent_action_block_history` | En `20261120120000` (editada en sitio: local, sin aplicar) |
| Matriz R2: área OKRS confirma con la misma base que propone (R2-10) | Corregido |

| Release | Veredicto | Motivo |
| --- | --- | --- |
| R1 | GO integración local / NO-GO liberación | Sin cambios funcionales en esta rama; falta la matriz JWT en QA |
| R2 | GO preparación de QA / NO-GO liberación | 797 pruebas vitest, 20 checks SQL y regresiones R0/R1/hotfix/WhatsApp/OKR aprobados. Falta ejecutar `run-jwt-suite.mjs` con JWT reales en QA A/B |

**Migraciones pendientes (ninguna aplicada):** `20261119120000` (R1) en QA; `20261120120000_agent_apply_action_status.sql` corregida, sólo en QA; seed QA sólo en QA A. Nunca en DEV ni PROD.

**Autorizaciones necesarias** (ninguna se ejecutó):

1. Crear los proyectos QA A y QA B (Micro, 48 h).
2. Aplicar en QA únicamente la base del esquema y las migraciones hasta `20261120120000`, y el seed QA en A.
3. Aprovisionar las 10 cuentas sintéticas `example.invalid` con `provision-qa-accounts.mjs --apply`.
4. Configurar una preview de QA con `R2_EXECUTION_MODE=qa`, `R2_QA_PROJECT_REFS` y, para validar el copiloto, `COPILOT_R2_GATE=1`.
5. Ejecutar `run-jwt-suite.mjs` y revisar el reporte antes de cualquier decisión de liberación.

## Integración R1 y arranque controlado de R2 · 2026-11-19

Todo es local: hubo commits locales, pero ningún push, merge a `main`, despliegue ni migración remota. DEV y PROD se consultaron sólo con SELECT.

**Dependencias.** `r0/estabilizacion` (`f2fc811`) es ancestro de `r1/agente-confiable` (`f6b6e00`). El hotfix `hotfix/usuarios-guard` (`39a1292`) contiene `135000`, idéntica byte a byte a la de R1, igual que su rollback, más `136000`. Ya están aplicadas en DEV y PROD (ver `hotfix-usuarios-guard.md`). Las 49 funciones que crean las migraciones de noviembre (R0, `120000`, `135000`, `136000`, A, RC-05 y B) tienen el mismo cuerpo en local, DEV y PROD (md5 sin CR). No hay divergencias, así que no se reaplicó nada.

| Rama local | Base | Contenido | Estado |
| --- | --- | --- | --- |
| `integration/r1-hotfix` (`be11cae`) | `r1/agente-confiable` + merge `--no-ff` del hotfix | R0, R1, `135000` y `136000`. Runner R1 con `136000` y `auth.role()` por claim JWT; runner del hotfix lee R0 y A del árbol | Validada en worktree limpio |
| `r2/agente-accionable` (`91193fd`) | `integration/r1-hotfix` | R2 local: puerta de fases, `R2_EXECUTION_MODE`, RPC `agent_apply_action_status`, 4 operaciones con ejecutor simulado, intenciones de canal y aceptación | Validada en worktree limpio |

**R2 implementado (local).** Ciclo Consulta → Propuesta → Confirmación → Revalidación → Ejecución → Evidencia sobre `assistant_pending_ops` y `confirmPendingOp`, sin un segundo sistema de confirmaciones. El orden de implementación fue `create_action`, `update_status`, `register_blocker` y `notify_responsable`. La ejecución sólo ocurre con `R2_EXECUTION_MODE=simulated` y un ejecutor simulado inyectado. En Vercel y producción el modo es siempre `disabled`, y la confirmación responde «ejecución no habilitada». En canales, el orquestador sólo llega a la propuesta: web la muestra con el flag; WhatsApp y voz mantienen su flujo vigente.

| Release | Veredicto | Motivo |
| --- | --- | --- |
| R0 | NO-GO liberación | Siguen abiertas las validaciones remotas (JWT/RLS en QA, 401, P0001); su código está aplicado en DEV y PROD desde el incidente del 19-nov |
| Hotfix usuarios | GO (aplicado) | 135000 y 136000 en DEV y PROD con prueba JWT; la integración no detectó incompatibilidades |
| R1 | GO integración local / NO-GO liberación | Build y suites limpias en `integration/r1-hotfix`; falta QA con `AGENT_ORCHESTRATOR_R1` y cuentas sintéticas. El flag sigue apagado |
| R2 | GO desarrollo local / NO-GO QA y liberación | Pasan 22 escenarios simulados y 14 comprobaciones SQL en PGlite; no hay validación con JWT reales y la RPC no está aplicada en ningún entorno |

**Autorizaciones necesarias para QA de R2** (ninguna se ejecutó):

1. Aplicar `20261120120000_agent_apply_action_status.sql` en DEV o QA (rollback: `supabase/scripts/rollback_agent_apply_action_status.sql`).
2. Crear cuentas sintéticas para Responsable, Creadora, Analista, Dirección, Super Admin e Inactivo, y obtener sus JWT.
3. Activar `AGENT_ORCHESTRATOR_R1` en QA para validar las propuestas por canal.
4. ~~Ejecutar el modo simulado contra DEV~~ Sustituido por el modo `qa` sobre proyectos QA dedicados (sección superior); DEV queda excluido.
5. Decidir si los copilotos actuales migran a la puerta R2: preparado detrás de `COPILOT_R2_GATE` (sección superior, R2-01).

## R1 complemento · matriz de transición y orden · 2026-11-19

Resultado de `audit_okrs_area_legacy_grants.sql` en sólo lectura. Nadie pierde acceso SQL con B: los diez miembros del área OKRS en PROD tienen otra vía de Super Admin. Antes de la corrección de paridad (RD-04), la UI y el agente sí habrían quitado el acceso a los cuatro Líderes y a Dirección.

### PROD · miembros activos del área OKRS

Todos tienen hoy acceso efectivo a la bandeja de WhatsApp y al asistente.

| Usuario | Rol | Vía OKRS | Otra vía de administración | Uso real | Tras B | Acción propuesta |
| --- | --- | --- | --- | --- | --- | --- |
| Abraham | super_admin | relacional | rol y catálogo super_admin (también Líder) | 1 OKR, 6 KR | Sin cambio | Ninguna |
| Alonso Perez | super_admin | relacional | rol, `app_role` y catálogo super_admin | WhatsApp vinculado, 3 envíos de bandeja, 8 teléfonos vinculados | Sin cambio | Ninguna. Si deja de ser Super Admin, darle `whatsapp_inbox` y `whatsapp_identity_link` |
| anoguera | super_admin | sólo texto | rol | — | Sin cambio | Pasar el área a `usuario_areas` o quitarla del texto |
| Damaris Medrano | super_admin | relacional (área principal RH) | rol y catálogo super_admin (también Líder) | — | Sin cambio | Confirmar si necesita el área OKRS |
| Monse Rivera | super_admin | ver auditoría | rol y catálogo super_admin | — | Sin cambio | Ninguna |
| Gerardo Puga | Líder | relacional | catálogo super_admin (también Líder) | 1 OKR, 5 KR | Sin cambio | Revisar RD-03: sustituir por `okrs_admin` si no administra la plataforma |
| Irhec Vazquez | Líder | relacional | catálogo super_admin | 6 KR | Sin cambio | Revisar RD-03 |
| Luciana Costas | Líder | texto y relacional | catálogo super_admin | — | Sin cambio | Revisar RD-03 |
| Nancy Rojo | Líder | relacional | catálogo super_admin | 1 OKR, 5 KR | Sin cambio | Revisar RD-03 |
| Jorge Gonzalez | Direccion | relacional | catálogo super_admin | 7 KR | Sin cambio | Revisar RD-03: el catálogo super_admin le da escritura global, más que la lectura ejecutiva de Dirección |

**Inactivos en PROD.** Una segunda cuenta de G. Puga (rol y catálogo super_admin) y Hector (Líder). Ambas cuentas de auth siguen sin ban. Primero se banean y después se aplica RC-05; no hace falta migrar sus accesos.

### DEV

En el área OKRS están anoguera y dmorabito (super_admin) y Gerardo Puga (Operativo con catálogo super_admin). Hay 7 titulares del catálogo super_admin: alpeva96, M. Rivera, Abraham, Gerardo Puga, Jorge Gonzalez (Operativo en DEV), anoguera y dmorabito. No hay inactivos y hay 22 usuarios. Los roles difieren de PROD, así que la validación de QA debe usar perfiles sintéticos y no copiar DEV.

### Propuesta RC-05 (local, no aplicada)

`20261119150000_inactive_users_rls.sql` crea `current_usuario_is_active()` (security definer, `search_path` fijo) y la política **restrictiva** `rc05_active_users_only` de SELECT para `authenticated` en las tablas operativas que existan: acciones y sus tablas hijas, `acciones_equipo`, OKRs, KRs, iniciativas y check-ins, `whatsapp_messages`, KPIs, `gaps` y `sprints`. Al ser restrictiva se combina con AND con las permisivas: no amplía nada, sólo exige una fila activa. No cambia `get_my_usuario_id` para no alterar funciones que dependen de él. `service_role` (backend, WhatsApp, voz) no se ve afectado. Rollback: `supabase/scripts/rollback_inactive_users_rls.sql`. Pendiente: catálogos, áreas y `usuarios` siguen legibles para un inactivo; el control principal es banear la cuenta.

### Orden recomendado (cada paso requiere autorización; nada se ejecutó)

| Paso | Acción | Reversión |
| --- | --- | --- |
| 1 | P0 `20261119135000_guard_usuarios_privileges.sql` (cierra RD-01) | `supabase/scripts/rollback_guard_usuarios_privileges.sql` (no restaura el UPDATE de `anon`) |
| 2 | Banear en Auth las dos cuentas inactivas de PROD | Quitar el ban |
| 3 | RC-05 `20261119150000_inactive_users_rls.sql`, tras confirmar RD-07 | `rollback_inactive_users_rls.sql` |
| 4 | Reconciliar el historial de migraciones (RD-06) | — |
| 5 | Cerrar R0 (`20261118150000`, cierra RD-05) | Según el plan R0 |
| 6 | Migración A `20261119140000`, junto con la paridad TS de catálogo super_admin. A se niega a aplicarse sin P0 | Ver el plan de migración siguiente |
| 7 | Revisar el catálogo super_admin de los Líderes y de Dirección (RD-03) y asignar módulos explícitos | Reasignar el rol |
| 8 | Script B | `legacy_okrs_area_grants()` vuelve a true |
| 9 | `AGENT_ORCHESTRATOR_R1` en QA | Apagar el flag |

## R1 complemento · plan de migración y decisión · 2026-11-19

**GO desarrollo / NO-GO integración, aplicación remota y revocación.** El complemento está probado localmente en `r1/agente-confiable`. No se aplicó ninguna migración remota, no se ejecutó la auditoría contra datos reales y no se revocó ningún acceso.

**Usuarios potencialmente afectados.** No se conocen todavía: la lista sale del script `supabase/scripts/audit_okrs_area_legacy_grants.sql`, que se ejecuta con autorización (sólo lectura, sin teléfonos, correos ni mensajes). Grupos que identifica:

1. Miembros del área OKRS, por `usuario_areas` y por texto en `usuarios.area`. **Conservan la lectura transversal.**
2. De ellos, quienes no tienen otra vía de acceso (ni Super Admin, ni administrador de catálogo, ni módulos explícitos). **Pierden** la administración global de OKRs y WhatsApp al aplicar B.
3. Su uso real: OKRs y KRs de los que son dueños, acciones de equipo marcadas OKR, mensajes enviados como operador y teléfonos que vincularon. Sirve para decidir qué módulos conservar.
4. Las filas de área llamadas «OKRS». Si hay más de una, se decide a mano antes de A.

**Plan de migración (no ejecutado).**

| Paso | Acción | Efecto en accesos | Reversión |
| --- | --- | --- | --- |
| 0 | Cerrar R0 en QA | — | — |
| 1 | Aplicar `20261119140000_r1_transversal_access.sql` en QA, después en producción | Ninguno se revoca. Se añaden lectura transversal (área OKRS) y la lectura de OKRs de Dirección. Se cierra la autoasignación del área OKRS. | Restaurar las definiciones anteriores de las funciones y políticas; la tabla de contexto puede quedarse. |
| 2 | Ejecutar la auditoría y aprobar la matriz de usuarios | Ninguno | — |
| 3 | Crear o ajustar roles de catálogo con `okrs_admin` y `whatsapp_*`, y asignarlos a los usuarios aprobados | Concede de forma explícita lo que antes era heredado | Quitar los módulos |
| 4 | Aplicar a mano `supabase/scripts/apply_r1_revoke_legacy_okrs_area.sql` | Fin de los permisos heredados del área OKRS | Reejecutar el script con `select true` |
| 5 | Activar `AGENT_ORCHESTRATOR_R1` en QA y repetir los escenarios por perfil y canal | — | Apagar el flag |

**Impacto en R2.** La matriz por fase ya está lista: sólo proponen y confirman los perfiles con escritura. La ejecución sigue apagada (`R1_EXECUTION_ENABLED=false`). Marcar una acción como OKR y notificar por WhatsApp quedan ligados a capacidades explícitas.

## R1 · decisión · 2026-11-19

**GO desarrollo / NO-GO integración y liberación.** R1 está implementado y probado localmente, pero depende de R0, que sigue abierto (tabla siguiente). No se fusiona, despliega ni activa `AGENT_ORCHESTRATOR_R1` hasta que R0 supere sus validaciones remotas.

| Rama local | Base | Contenido | Estado |
| --- | --- | --- | --- |
| `r0/estabilizacion` | `main` | Correcciones R0 y `docs/agent` | Commit local; NO-GO hasta cerrar las validaciones remotas |
| `r1/agente-confiable` | `r0/estabilizacion` | Capa de consulta, orquestador, adaptadores con flag, contratos y simulador R2, suite y docs R1 | Commit local; GO desarrollo |
| `feat/assistant-entry-ux` | `main` | Rediseño de entrada del asistente (fuera del alcance R1) | Commit local; revisión independiente |

**Secuencia de integración propuesta**, sin ejecutar:

1. Cerrar R0 en QA: RLS/JWT, 401, dos P0001, migración efectiva y rollback.
2. Rebase de R1 sobre el R0 aprobado y repetir la suite completa y el build.
3. En QA: aplicar `20261119120000_assistant_op_log_read_audit.sql`, activar el flag y ejecutar los 8 escenarios por canal con las cuentas sintéticas, comparando cifras contra SQL.
4. Aplicar el complemento (gate de OKR de Dirección y persistencia del contexto, ya resueltos localmente) según el plan de migración de arriba.
5. Liberación con autorización expresa y reversión por flag (apagar `AGENT_ORCHESTRATOR_R1` devuelve los tres canales al flujo actual).

R2 (mutaciones reales) no empieza sin autorización; sus contratos y simulador ya están probados.

## Decisión vigente de cierre R0 · 2026-11-19

**Resultado global: NO-GO para liberar y R0 permanece abierto.** El trabajo local está validado; no sustituye las cinco validaciones remotas pendientes. Esta sección prevalece sobre tablas históricas de ciclos anteriores.

| Criterio | Estado | Evidencia | Pendiente |
| --- | --- | --- | --- |
| Suite completa | GO | 682/682, 111 archivos; cinco regresiones de reloj reproducidas y corregidas sin cambiar expectativas. | Ninguno local. |
| Build y Edge | GO | vercel-build, TypeScript y cuatro bundles aprobados. | Congelar artefacto/revisión para QA; no están desplegados. |
| Permisos locales Dirección | GO | SQL adversarial y pruebas UI/runtime, sin privilegio automático; tres correcciones anteriores conservadas. | Snapshot efectivo y JWT reales para aceptación remota. |
| RLS con JWT | NO-GO | Runner de lectura preparado y producción explícitamente excluida. | Crear QA con autorización, obtener diez sesiones sintéticas y probar también escrituras. |
| Simulación local Inbox / WhatsApp | GO | 17 casos de worker, atomicidad SQL, entrada única, errores/duplicados/reintentos y entrega simulada. | Repetir con cola/BD y Edge de staging, sin proveedores reales. |
| Dispatcher 401 | NO-GO | Rechazos/credenciales válidas probados localmente; net no accesible por REST. | Logs correlacionados o reproducción QA + excepción histórica expresamente aprobada. |
| Dos P0001 | NO-GO | Intención done identificada; las salidas fueron avisos de fallo; acciones y checkpoints no cerrados, sin recibos de mutación. | Sentencia original y conciliación completa, o tratamiento de riesgo aprobado tras QA. Sin reintentos. |
| Nueve correlaciones históricas | GO condicionado | Las nueve omisiones siguen documentadas y sin alterar; la corrección local está cubierta. | Aceptar su conservación como incidente histórico; no se solicita backfill/reenvío. |
| Migración efectiva | NO-GO | Reaplicación y seguridad pasan en PostgreSQL reducido. | Exportar owners/funciones/ACL/RLS/triggers y contrastar sobre esquema completo de QA. |
| Rollback operativo | NO-GO | El SQL de verificación conserva el piso de seguridad. | Demostrar recuperación con artefacto compatible y snapshot real de QA; no confundir el verificador de lectura con una reversión aplicada. |

### Decisiones y accesos estrictamente necesarios

1. **Autorizar creación QA**, todavía pendiente: propuesta existente de dos proyectos Micro, 48 h, diez cuentas sintéticas y fixtures, aplicación del baseline revisado y migración sólo allí, ejecución de JWT y Edge con transporte simulado y limpieza posterior. Presupuesto operativo de cómputo propuesto USD 5; estimación anterior USD 1.29/48 h sujeta a confirmar plan/cuotas/precio antes de crear. No contratar un plan nuevo ni ampliar costos sin otra decisión. No copiar los tres cron con URL productiva identificados abajo.
2. **Aportar evidencia de lectura**, no cambiar permisos productivos: export del diagnóstico SQL y logs históricos mediante consola del operador ya autorizada. Las credenciales service role REST no dan acceso al esquema net ni a las definiciones SQL del catálogo.
3. **Aceptaciones de riesgo sólo después de QA:** excepción de atribución del 401 si se acredita imposibilidad de recuperación; tratamiento P0001 no-replay y conservación de las nueve omisiones. La conciliación que cambie estado de los dos jobs requiere autorización productiva separada, snapshot/CAS y revisión de posibles trabajos desbloqueados. No se ejecutó.

No se pide autorización de producción ahora: todavía faltan los gates. Cuando estén satisfechos, presentar evidencia por caso y detenerse para autorización explícita de despliegue. Iniciar R1 exige aceptación formal del cierre R0 y aprobación separada del siguiente ciclo; no fusionar GAP ni mejoras UX en el artefacto R0 por accidente.


## Validación controlada · propuesta pendiente de creación

El desarrollo local de 480 pruebas está aprobado. Se propone una ventana de 48 horas para QA con dos proyectos aislados en la organización que aloja Scrumban, sujetos a confirmar el plan y cuotas antes de crear. Iniciar la ventana cuando el baseline de esquema y los accesos estén listos.

| Recurso propuesto | Configuración | Costo estimado |
| --- | --- | --- |
| scrumban-r0-qa-a | Supabase Micro, esquema de referencia revisado, ocho cuentas sintéticas y fixtures de A. Misma versión mayor de PostgreSQL que referencia cuando esté disponible. | USD 0.01344/h de cómputo |
| scrumban-r0-qa-b | Segundo proyecto Micro con claves independientes y dos cuentas sintéticas. Verifica rechazo de JWT de A y aislamiento por proyecto. | USD 0.01344/h de cómputo |
| Runner local | Aplicación y adaptadores existentes, validación JWT contra QA, harness del webhook/worker e interceptores Meta/LLM/correo. | Sin recurso cloud adicional |
| Proveedores | Respuestas y entregas sintéticas, sin SMTP, WABA, números Meta ni agentes Retell reales. | Sin consumo de proveedor externo |

Dos Micro durante 48 h equivalen a **USD 1.29 de cómputo bruto**, o aproximadamente USD 20/mes si permanecieran activos. Esta estimación supone una organización pagada existente, sin nueva suscripción ni consumos fuera de cuotas. Pro cuesta USD 25/mes y dispone de crédito de cómputo compartido; no se presupone crédito libre. Si fuera necesaria una organización Pro nueva, su referencia mensual para dos Micro sería USD 35 antes de extras e impuestos, y requiere otra decisión. Free puede ser alternativa si hay dos cupos disponibles, con sus límites y pausa. No se crea ni cambia plan en esta fase. [Precios Supabase](https://supabase.com/pricing), [cómputo por hora](https://supabase.com/docs/guides/platform/manage-your-usage/compute)

La autorización propuesta tiene alcance de dos Micro durante 48 h, presupuesto estimado de USD 5 de cómputo y retirada de ambos recursos sintéticos al terminar. Ese presupuesto es un límite operativo a vigilar; no se afirma que el proveedor lo imponga automáticamente. No se incluyen upgrades, dominios, PITR, Log Drains, Vercel nuevo ni consumo de IA.

### Preparación del esquema y la red de QA

No ejecutar indiscriminadamente las 223 migraciones sobre un proyecto nuevo. Se identificaron tres que programan llamadas al proyecto productivo:

- 20260629201032_daily_action_summary_cron.sql
- 20261103121000_whatsapp_followup_dispatcher_cron.sql
- 20261104140000_whatsapp_followup_dispatcher_cron_auth.sql

El baseline preferido es un export de esquema público y políticas de sólo lectura, revisado para eliminar hooks o destinos externos antes de restaurarlo en QA. Conservar las funciones Auth administradas por Supabase. Excluir datos productivos, auth.users, Vault, jobs de cron, seeds de personas reales y credenciales. Si se deriva el baseline del repo, usar una lista de migraciones revisada que excluya cron y seeds, y comparar funciones/ACL con el export de referencia.

Las claves y sesiones pertenecen exclusivamente a QA. El runner permite red a los hosts QA y sustituye Meta, correo, Retell y LLM por mocks; el flujo proveedor no requiere desplegar otro transporte. La app puede ejecutarse localmente durante R0. Una Preview de Vercel es opcional y queda fuera de esta autorización de recursos.

### Cuentas sintéticas propuestas

| Proyecto | Cuenta | Rol y caso |
| --- | --- | --- |
| A | qa-admin-a | super_admin |
| A | qa-direction-a | Dirección, Comercial, sin grants administrativos |
| A | qa-direction-okrs-a | Dirección con pertenencia OKRS explícita |
| A | qa-direction-admin-a | Dirección con app_role admin independiente |
| A | qa-analyst-a | Analista con acción propia y borrador privado |
| A | qa-peer-a | Operativo de otra área, acción y borrador ajenos |
| A | qa-leader-a | Líder y pertenencia explícita a equipo |
| A | qa-inactive-a | Dirección inactiva con grant administrativo para prueba negativa |
| B | qa-admin-b | super_admin de B |
| B | qa-analyst-b | Analista de B |

Las identidades usarán direcciones sintéticas example.invalid y alta administrativa con email_confirm=true. Obtener JWT con login de esas cuentas sólo después de aprobar su creación. Usar UUID devuelto por Auth como authUserId y distinguirlo del UUID de usuarios.id. No reutilizar sesiones ni datos de Alonso. Se revisarán hooks de Auth y correo en el baseline de QA para mantener el requisito de cero comunicaciones. [Alta administrativa Supabase](https://supabase.com/docs/reference/javascript/auth-admin-createuser)

### Rollback vigente

El archivo rollback_direction_executive_scope.sql es ahora **una verificación de sólo lectura** de la base de seguridad aprobada. No restaura funciones ni ACL antiguas, no retira RLS y no devuelve administración a Dirección. El test compara definiciones, ACL y search_path antes/después y comprueba que Dirección continúa sin privilegio global.

La reversión de aplicación debe usar un artefacto compatible con la seguridad aprobada y conservar la migración. Si no hay un artefacto compatible, se detiene la función afectada y se prepara una corrección hacia adelante; no se vuelve a la autorización legacy. Datos de Inbox y recibos se conservan.

## Gate final de preparación

GO local con 480 regresiones aprobadas y pruebas SQL adversariales. La migración incluye preflight de CREATE y ownership, protección frente a shadowing temporal e inactividad con grants administrativos. Antes de staging, exportar ACL/funciones con el diagnóstico actualizado y aprobar la creación o identificación de recursos y cuentas QA. La revisión de logs del 401 y los P0001 es de lectura y requiere acceso técnico del operador; no requiere modificar proveedores.

Producción continúa NO-GO hasta la evidencia causal de incidentes y las sesiones JWT de staging. R1 y GAP siguen pendientes. El rollback vigente conserva la base de seguridad y no restaura privilegios legacy.

## Estado tras corrección coordinada

La implementación local del criterio aprobado y la persistencia temprana de Inbox están listas para revisión. Pasan 480 pruebas focalizadas, build, bundles Edge y el laboratorio SQL con forward/reaplicación/rollback. Las tres correcciones previas del dispatcher y replyAi se conservan. R0 permanece bloqueado por evidencia de 401/P0001 y validación de staging.

El [diff de código](r0-cycle2-code.patch) contiene las modificaciones y archivos nuevos de R0 respecto de `4827181`, con las correcciones previas que siguen locales. Excluye el cambio preexistente de finales de línea del router y la migración local de correo ajena a esta corrección. Los seis documentos mantienen el historial de auditoría y el resultado vigente.

**Secuencia propuesta, pendiente de autorización de ejecución remota**

1. Revisar el diff y exportar funciones, políticas y ACL efectivos con el script diagnóstico de lectura. Acordar QA A/QA B y asignar las cuentas sintéticas.
2. Aplicar la migración preparada exclusivamente en staging. Introduce el gate de consulta usado por el nuevo código y elimina grants automáticos de Dirección. Confirmar los ACL de funciones de permiso; no depender del grant PUBLIC.
3. Publicar los adaptadores correspondientes en staging después de la migración y registrar commit, hash de funciones, revisión Edge, URL de callback y alias Vercel. El nuevo handler depende de `can_query_ai_whatsapp_for_usuario`.
4. Ejecutar tests con JWT, fixture multicanal, consulta con borrador pendiente y replay de webhook firmado. Mantener proveedores simulados hasta aprobar destinatario y remitente.
5. Adjuntar la causa del POST 401 y la sentencia/error original de los dos P0001. Reconciliar efectos antes de aprobar cualquier reintento.
6. Solicitar decisión de cierre R0 con evidencias; una eventual promoción productiva requiere autorización explícita. R1 y GAP permanecen fuera de ejecución.

**Rollback vigente.** El SQL de rollback verifica el baseline aprobado en una transacción de sólo lectura. La reversión de aplicación conserva funciones, ACL, RLS, guards y hardening. No restaura privilegios antiguos de Dirección ni reenvía el historial.

## Decisión del ciclo 2

**Recomendación: bloquear la liberación de R0.** El ciclo de corrección local avanzó con tres defectos reproducidos y corregidos, pero permanecen dos pruebas de permisos fallidas, nueve correlaciones incompletas de Inbox, dos trabajos review P0001 y el 401 histórico sin atribución final. La autorización recibida en C2 cubre estabilización controlada; posteriormente el operador confirmó que falta entorno QA y destinatario autorizado. Las siguientes acciones reales esperan aprobación de la propuesta QA.

| Paso | Estado actualizado |
| --- | --- |
| R0.1 y R0.2 | Auditoría adoptada. Permisos y configuración QA requieren resolver la discrepancia Dirección/OKRS antes de tocar reglas. |
| R0.3 | Tres correcciones locales con pruebas antes/después. Sin despliegue. Build pasa. Suite ampliada 469 passed / 2 failed. |
| R0.4 | Lecturas agregadas de producción y cotejo de consultas completados. Piloto con sesiones/transportes reales bloqueado por entorno, cuentas y destinatario pendientes. |
| R0.5 | Bloqueado. Mantener R1 y GAP-01–05 sin iniciar hasta aprobación de cierre. |

### Evidencia necesaria para autorizar R1

1. Aprobar matriz QA de roles, áreas y proyectos; proporcionar o crear staging con autorización explícita.
2. Resolver semántica de Dirección fuera de OKRS, validar las políticas efectivas con JWT y ejecutar la suite sin fallos críticos.
3. Obtener registro del POST 401 del cron con cuerpo/código y request ID; verificar la configuración activa y el contrato del dispatcher corregido.
4. Investigar los dos review P0001 y las nueve entradas sin correlación, con diagnóstico redactado y decisión de reintento individual cuando se conozca el resultado del proveedor.
5. Promover cambios sólo con autorización, registrar versión Edge y alias Vercel, y probar un turno completo y un botón con destinatario autorizado, además de rollback y regresión saliente.

La propuesta de QA y el procedimiento de rollback se encuentran en [riesgos y dependencias](risks-and-dependencies.md). La evidencia y las métricas de esta ejecución están en [aceptación](acceptance-tests.md) y [AS-IS](architecture-as-is.md).

El horizonte corresponde al [Plan de Consolidación](https://app.notion.com/p/41c7f5fdb8aa8028af96fd05c96914b2). Las semanas son orientativas. Se ajustan al aprobar dependencias y asignar responsables.

| Release | Horizonte | Entrega recomendada y evidencia de salida |
| --- | --- | --- |
| R0 · Estabilización | Semana 1 | Entregar auditoría y matriz. Con autorización posterior, estabilizar WhatsApp y dispatcher, verificar versión de Vercel, cola, Inbox, respuesta, latencia y rollback. Gate AT-11, AT-12, AT-15 y evidencia histórica revisada. |
| R1 · Agente confiable | Semanas 2–3 | Catálogo, identidad y permisos, consultas Kanban/OKR, comandos y seguimiento. Evidencia de datos reales autorizados y regresiones AT-01–05, AT-19. |
| R2 · Agente accionable | Semanas 4–5 | Acciones y bloqueos con estado verificable; borradores y transporte existente. Gates AT-06–10 y AT-16, efecto único y aprobación revalidada. Señales para recomendaciones, con aceptación completa en R3. |
| R3 · Conocimiento y WhatsApp | Semanas 6–7 | Glosario y conocimiento con referencias; paridad de WhatsApp; recomendaciones, programación conversacional y simulador sobre sistemas existentes. Gates AT-17, AT-18, AT-20, AT-21 y AT-24. |
| R4 · Voz y ligas | Semanas 8–9 | Dictado, síntesis, voz Retell, liga y reporte usando los mismos servicios. Piloto autorizado, AT-13, AT-14, AT-16 y AT-20. Comparar con OpenAI sólo en entorno de prueba y con el mismo oráculo antes de proponer cambio de proveedor. |
| R5 · Consolidación | Semanas 10–11 | Validación cruzada, widgets, consola, costos y despliegue progresivo con evidencias y reversión. Gates AT-19–24 y reejecución de casos críticos por canal. |

## Cinco prioridades

1. **Demostrar la ruta completa de WhatsApp.** Correlacionar webhook, cola, worker, Inbox y entrega. Identificar capa y causa del 401 de seguimientos. WA-01–04, QA-03.
2. **Fijar fuente de verdad y alcance.** Inventariar módulos, responsables, RLS y límites por identidad/canal. Validar mismas cifras e IDs contra Kanban, OKRs y KPIs. FV-01–04, ID-01–03, QA-02.
3. **Preservar contexto y respuestas ante fallos.** Probar «Todas», «las que asigné», homónimos y preguntas con borrador abierto. Consolidar sobre el contrato existente. CV-01–05.
4. **Cerrar el ciclo de operaciones con aprobación.** Probar acción, bloqueo, WhatsApp y correo, con edición, confirmación y evidencia de proveedor. AC-01–05, EM-01, CM-01–02.
5. **Hacer repetible la validación por canal.** Baselines, fixtures, simulador, voz/liga y versiones desplegadas. QA-01, QA-04–06, VO-01–06 y GAP-04.

## Plan de ejecución de R0

| Paso | Alcance | Evidencia requerida |
| --- | --- | --- |
| R0.1 · Auditoría | **Ejecutado.** Leer exportaciones, auditar runtime y canales, ejecutar suites locales y registrar incidentes. | Seis documentos, 45 historias y cinco GAP, 433 pruebas locales pasadas. |
| R0.2 · Revisión técnica y de producto | **Pendiente de aprobación.** Revisar alcance de canal, responsables, topología de callback, modos de liga y gate operativo. | Decisiones registradas y acceso de lectura a logs de Vercel, Retell, Meta y Supabase. |
| R0.3 · Estabilización autorizada | Reproducir 401 exacto, validar cola y versión de la corrección del borrador. Corregir causas demostradas en rama y entorno de pruebas. | Pruebas de firma, cron, versiones, contratos y ausencia de efectos duplicados. |
| R0.4 · Piloto y evidencia | Prueba integral con fixtures y destinatarios autorizados. Capturar casos AT-01, AT-08, AT-11, AT-12, AT-15, permisos y regresión saliente. | Correlación y tiempos por etapa, versión efectiva, evidencia de Inbox y respuesta. |
| R0.5 · Decisión de salida | Aceptar si pasan los P0 o registrar bloqueo y mantener la liberación pendiente. | Evidencia firmada por responsables; monitoreo, dueño de incidentes y rollback documentados. |

## Control de release

- Capturar commit, deploy Vercel, revisión de Edge, migraciones aplicadas, versión de Retell y cron activo. Mantener referencia a la versión anterior.
- Validar en local, entorno de integración, piloto y producción autorizada. Reversión por componente con configuración compatible. Preservar trabajos en cola, operaciones confirmadas y recibos; no reenviar efectos de resultado incierto durante rollback.
- Medir exactitud y latencia por tipo de consulta y canal con tamaño de muestra. Metas del plan sujetas a baseline: ≥98 % de exactitud en corpus, 100 % de datos operativos autorizados, cero accesos cruzados, 100 % de operaciones críticas confirmadas/auditadas, ≥99 % de ejecuciones exitosas en pruebas controladas y trazabilidad de solicitudes críticas.
- Caso de salida integrado: vencimientos del equipo → bloqueos → seguimiento a responsables → acciones acordadas → aprobación → efecto y evidencia. Ejecutar AT-20 reutilizando oráculos de negocio.

La conclusión de esta iteración autoriza revisar el diseño y el backlog. La liberación técnica de R0 requiere los pasos pendientes y autorización.
