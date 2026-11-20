# Enviardián · pruebas de aceptación R0–R1

## Integración R1 y R2 local · pruebas ejecutadas · 2026-11-19

Cada rama corrió en su propio worktree limpio, con `npm ci` y `node_modules` propio, sin cambios ajenos. vitest se ejecuta con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` ficticios: sin `.env`, tres suites que crean el cliente al importarse no cargan.

| Suite | `integration/r1-hotfix` | `r2/agente-accionable` | `r2/qa-consolidacion` |
| --- | --- | --- | --- |
| `tsc -p tsconfig.api.json` / `tsconfig.app.json` | Aprobados | Aprobados | Aprobados |
| `npm run vercel-build` | Aprobado | Aprobado | Aprobado |
| `npx vitest run` | 756/756, 117 archivos | 778/778, 118 archivos | **797/797, 119 archivos** |
| `test-agent-permissions-database.mjs` (R0) | Aprobado | Aprobado | Aprobado |
| `test-r1-transversal-database.mjs` | **49/49**: suma `136000` tras `135000` e impide autoasignar RH por texto, RPC de áreas e inserción directa | 49/49 | 49/49 |
| `test-hotfix-usuarios-guard.mjs` | 31/31, con R0 y A leídos del árbol | 31/31 | 31/31 |
| `test-whatsapp-database.mjs` / `test-okr-database.mjs` | Aprobados | Aprobados | Aprobados |
| `test-r2-action-status-database.mjs` | — | 14/14 | **20/20** |
| `r2Acceptance.test.ts` / `copilotR2Gate.test.ts` | — | 22 / — | **29 / 12** |
| ESLint en los archivos cambiados (TS y scripts) | — | Aprobado | Aprobado |

Las validaciones de integración pedidas están cubiertas así:

- **Super Admin acumulativo, lectura transversal del área OKRS, lectura ejecutiva de Dirección y separación Inbox/configuración de WhatsApp:** runner R1, `r1Transversal.test.ts` y `capabilityParity.test.ts`.
- **Escalamiento directo e indirecto:** runner del hotfix y las dos comprobaciones nuevas del runner R1.
- **Contexto persistente, aislamiento y TTL:** `r1Transversal.test.ts` y `r1Acceptance.test.ts`.
- **Paridad SQL/TS:** fixture de 12 perfiles.
- **Idempotencia de migraciones:** cada runner aplica dos veces.

**`scripts/test-r2-action-status-database.mjs` (PGlite).** Usa las definiciones reales más recientes de los permisos de acción, de `try_set_accion_hecho`, del trigger de estados y de `assistant_pending_ops`. Las sesiones corren como `authenticated` con claims JWT simulados. Comprueba:

- La migración se niega a aplicarse sin dependencias y es idempotente.
- Puerta en BD: sin la fila del seed QA, claim y RPC responden `execution_disabled`.
- Grants: `anon` no ejecuta ninguna de las RPC; `authenticated` sí. Los clientes no escriben recibos ni leen o escriben `agent_execution_gate`. Las RPC son security definer con `search_path=public`.
- Ruta directa: un cliente no puede fijar `executing` en operaciones `agent_*` ni escribir `claimed_at`; la RPC sin claim responde `not_confirmed`, también para `mark_action_done` movido a mano.
- Claim: una sola vez, sólo pendiente, vigente y con el payload confirmado; volver a `pending` limpia `claimed_at`; herramienta ajena, `invalid_operation`.
- Un recibo por operación vuelve idempotente la repetición.
- CAS por `updated_at`.
- Vínculo con la confirmación: sólo el dueño, sólo en `executing` y sólo con los mismos parámetros.
- Verificado nunca se asigna y una acción verificada no cambia.
- Hecho con checkpoints pendientes se revierte por completo.
- Bloqueo: motivo de al menos 5 caracteres; comentario `bloqueo_reportado` «Causa reportada: …» y `causa_raiz` intacta, también para la creadora con edición general.
- Historial de bloqueos: responsable, creadora y Super Admin lo leen (incluye los reportes de WhatsApp previos y los recibos); Analista, Dirección, ajenos e inactivos no.
- `mark_action_done` (copiloto con `COPILOT_R2_GATE`) pasa por claim y RPC con recibo.
- Atomicidad ante un fallo del comentario.
- Se niega a usuarios ajenos, Analista, Dirección e inactivos (también en el claim); Super Admin acumulativo.
- RLS de recibos.
- Rollback: retira RPC, puerta, guard, `claimed_at` y recibos; conserva estados y comentarios; al reaplicar, la puerta queda cerrada.
- Seed QA: rechaza el marcador, DEV y PROD; con una referencia QA abre la puerta y crea `qa_outbox` con RLS de filas propias.

**`api/_shared/actions/r2Acceptance.test.ts` (29 escenarios, simulados).**

| Caso | Evidencia |
| --- | --- |
| Modo | `disabled` por defecto y forzado en producción; `simulated` nunca en Vercel. `qa` sólo con la referencia en la allowlist, nunca DEV/PROD (ni en la allowlist), ni producción, ni URL local. Confirmar sin ejecutor responde «ejecución no habilitada», no toca datos y registra `denied`. Un ejecutor que no corresponde al modo queda deshabilitado. `fromTool` nunca confirma |
| Puerta en BD y ruta directa | Sin la fila del seed el claim se niega sin efecto; fijar `executing` a mano y llamar la RPC responde `not_confirmed` |
| AT-06 | Responsable resuelto en servidor (desambiguación de homónimos), fecha no pasada, una sola acción con id determinista por operación |
| AT-07 | Cambio de estado con recibo. Verificado no se propone. Hecho con checkpoint pendiente deja la operación `pending` con `error_message` y el reintento cierra una vez |
| AT-08 | Motivo obligatorio. La causa reportada queda como comentario `bloqueo_reportado` y `causa_raiz` no cambia, ni para la creadora. Historial: responsable y creadora sí; Analista, Dirección y otros no |
| Ejecutor `qa` | Estado y aviso con la sesión del usuario; el aviso queda una sola vez en `qa_outbox` y nunca en proveedores. Si la BD declara otro proyecto, `CONFIGURATION_ERROR` sin efecto. Las comunicaciones del copiloto se niegan en `qa` |
| AT-09 | Exige `whatsappInbox`. Destinatario = responsable, con teléfono de su vínculo activo. Sin vínculo falla sin enviar y queda pendiente; tras vincular se envía una vez |
| AT-10 | Correo único al responsable, sin reenvío al reconfirmar. No se notifica a uno mismo. Un usuario sin permiso sobre la acción no notifica. Si el responsable cambió, no se envía |
| AT-16 | Evidencia del autor: estado, resultado, recibo y bitácora (`proposed`, `executed`); otro usuario no la lee |
| Idempotencia y concurrencia | La misma intención da la misma operación. Doble confirmación y confirmaciones concurrentes producen un solo efecto |
| Vencimiento | Pasa a `expired`, no ejecuta y libera la clave para volver a proponer |
| Cambio de rol o desactivación | Se niega con permisos recargados; la operación sigue pendiente |
| Conflicto `updated_at` | Pasa a `conflict` sin efecto y no puede reconfirmarse |
| Dirección y Analista | No proponen ni confirman, aunque la operación se inserte a mano |
| Alcance de la IA | Campos de autoridad inyectados no amplían permisos ni llegan al payload |
| Canales | Bloqueo, estado y aviso sólo producen propuesta; Verificado se niega; no se crean operaciones |

**`api/_shared/actions/copilotR2Gate.test.ts` (12 escenarios, simulados).**

| Flag | Evidencia |
| --- | --- |
| Apagado (defecto) | El flag está apagado por defecto, sólo `'1'` lo enciende y producción lo ignora. `create_action` crea con id aleatorio como hoy; `mark_action_done` confirmado desde herramienta usa `try_set_accion_hecho` sin claim ni recibo; las propuestas no llevan `request_key` |
| Encendido | Sin modo de ejecución se niega sin efecto. `create_action` usa `actionIdForOp` y no duplica al reconfirmar. La misma intención da una sola propuesta (`request_key`). `mark_action_done` pasa por claim y RPC con recibo. `fromTool` se niega. `verify_action`: el responsable no verifica, la creadora sí. Analista y Dirección no confirman. Un cambio de rol tras proponer se niega con el rol vigente (cubre R2-10). `update_action` no puede cambiar `estado`. En producción se ignora el flag |

**Matriz JWT preparada (no ejecutada): `scripts/qa/run-jwt-suite.mjs`.** Detalle y orden en `qa-r1-r2.md`. Cubre JWT-01 a JWT-16: sesiones reales, puerta en BD, ruta directa, ejecución única con recibo, bloqueo sin `causa_raiz`, historial por perfil, Analista y Dirección sin ejecución, inactivo, Super Admin acumulativo, lectura por perfil (observación), JWT de B rechazado en A, cambio de rol, concurrencia, vencimiento, Verificado y cero filas nuevas en proveedores.

**Sin ejecutar:** RLS y RPC con JWT reales en QA, proveedores reales y canales desplegados. Las pruebas simuladas no sustituyen esa validación.

## R1 complemento · P0, RC-05 y paridad super_admin · pruebas ejecutadas · 2026-11-19

Todo es local, en PGlite. El diagnóstico remoto fue de sólo lectura (ver `risks-and-dependencies.md`). Para reproducir PROD, el runner deja `get_my_usuario_id` sin filtro de `activo`, otorga UPDATE de `usuarios` a `anon` y usa el `is_current_user_super_admin` con sus tres vías.

| Suite | Cobertura nueva | Resultado |
| --- | --- | --- |
| `scripts/test-r1-transversal-database.mjs` | Antes de P0: autoescalamiento a super_admin y autorreactivación (reproduce RD-01). A se niega sin P0. P0 es idempotente y rechaza `public` con CREATE. Tras P0: rol, activo y `user_id` propios rechazados, nombre permitido, DG cambia el rol de otro, RH no es administrador, un Super Admin inactivo no se reactiva, `anon` sin UPDATE. RC-05: antes, el inactivo y la cuenta sin fila leen 3 acciones; después, 0, y los activos conservan su alcance (incluido Dirección en OKRs); 6 políticas restrictivas; rollback y reaplicación. Auditoría con titulares del catálogo super_admin e inactivos con estado de auth. Tras B, ambos perfiles de catálogo super_admin sin cambio | **47/47** |
| `scripts/test-agent-permissions-database.mjs` (R0) | Regresión | Aprobado |
| `npx vitest run` | Paridad en 12 perfiles (incluye Líder y Dirección con catálogo super_admin) | 763/763, 118 archivos |
| `tsc -p tsconfig.api.json`, build de Vite y bundle de la API | — | Aprobados |
| `tsc -p tsconfig.app.json` y `npm run vercel-build` | — | Fallan sólo por `GuidePanel.tsx(62)` (`createdWorkItems` sin usar), un cambio ajeno sin commitear; no se tocó |
| ESLint | Archivos TS del cambio | Aprobado. El runner `.mjs` tiene los mismos `no-undef` de `process` y `console` que el runner R0 |

**Desviación del plan.** El plan proponía `20261119145000` para P0, pero la migración A (`140000`) depende de P0, así que se renumeró a `20261119135000`. Además, la guarda de rol y activo pasó de A a P0: A sólo vigila que no se gane un área funcional por el campo de texto.

## R1 complemento · acceso transversal · pruebas ejecutadas · 2026-11-19

Todo es local. La base de datos es PGlite (PostgreSQL en WASM) y nunca se conecta a Supabase.

| Suite | Cobertura | Resultado |
| --- | --- | --- |
| `scripts/test-r1-transversal-database.mjs` (PGlite) | Aplica R0, la migración A (dos veces) y el script B. Paridad TS↔SQL en 10 perfiles; ACL y `search_path`; sombra con tablas temporales; RLS de `acciones_diarias`, `okrs`, Team Kanban, `whatsapp_messages`, `whatsapp_followup_settings` y `agent_session_context`; escalamiento por perfil, RPC de áreas y escritura directa; cambio de área, revocación de módulo y desactivación; auditoría en modo sólo lectura; estado tras B; reaplicar A no deshace B; rollback de B | **36/36** |
| `scripts/test-agent-permissions-database.mjs` (R0) | Regresión de la matriz Dirección | Aprobado |
| `api/_shared/query/capabilityParity.test.ts` | El mismo fixture JSON que la suite SQL | 10/10 |
| `src/features/auth/lib/accessCapabilities.test.ts` | Capacidades por perfil, Dirección en `/okrs` sin módulo, separación de rutas WhatsApp, inactivo, módulos explícitos, flag de transición, área por clave | 11/11 |
| `api/_shared/orchestrator/r1Transversal.test.ts` | Super Admin, OKRS, Dirección, Gerencia, Colaborador e Inactivo; cambio de área; revocación; edición no autorizada; aislamiento entre usuarios; inyección de permisos; consistencia web/WhatsApp/voz; autorizar antes de paginar; contexto entre instancias, TTL y huella | 15/15 |
| `r1Acceptance.test.ts` | Ajuste intencional: Dirección **sí** lee OKRs sin módulo y sigue sin escribir | Aprobado |
| `npx vitest run` sobre el commit aislado (worktree sin cambios ajenos) | — | 754/754, 117 archivos; build y ambas suites PGlite aprobadas |
| `npx vitest run` (árbol de trabajo con cambios UX ajenos sin commitear) | — | 761/761, 118 archivos |
| `tsc` api y app, `npm run vercel-build`, ESLint sobre los archivos del complemento | — | Aprobados |

**Hallazgo de prueba.** El caso «Pre-R1» confirma que la RPC original de áreas permitía autoasignarse el área OKRS. La migración A lo cierra para todos los usuarios que no son administradores ni pertenecen a RH (RC-02).

**No ejecutado:** JWT y RLS en Supabase real, el script de auditoría contra datos reales, y los canales desplegados con `AGENT_ORCHESTRATOR_R1=1`.

## R1 · suite de aceptación ejecutada · 2026-11-19

Suite: `api/_shared/orchestrator/r1Acceptance.test.ts`. Ejecuta el `dispatchCopilotTool` **real** (autorización, filtros y truncado del runtime) sobre un Supabase en memoria con el fixture sintético `testing/r1Fixture.ts`. No emula RLS: la paridad con JWT sigue pendiente de QA (R0). Reloj fijo 2026-11-19 10:00 CDMX.

| Escenario | Actor | Criterio verificable | Resultado |
| --- | --- | --- | --- |
| 1 · «¿Qué tengo pendiente hoy?» | Líder | Sólo sus 3 acciones abiertas; orden vencida → hoy → resto; 1 con fecha de hoy; una sola herramienta | Aprobado |
| 2 · «¿Cuáles están vencidas?» | Líder | Conserva `assigned_to_me`, cambia a `overdue`; sólo `a1`; no mezcla la vencida de otra persona | Aprobado |
| 3 · «¿Quién tiene la más urgente?» | Líder | Resuelve sobre el último resultado sin nueva consulta; responsable con nombre | Aprobado |
| 4 · «¿Cómo vamos con los objetivos del trimestre?» | Líder | Cifras del fixture (20 %); KR sin datos como limitación; periodo declarado | Aprobado |
| 5 · «¿Qué está poniendo en riesgo nuestros objetivos?» | Líder | Datos: 2 vencidas, 1 bloqueada, 1 de 2 objetivos bajo 40 %. Interpretación rotulada como inferencia y fuera del bloque de datos | Aprobado |
| 6 · «Muéstrame las acciones privadas de otro equipo» | Analista | `forbidden` antes de consultar; cero herramientas; sin títulos ajenos; ofrece alcance propio; auditoría `denied_precheck` | Aprobado |
| 7 · «¿Cuánto dinero estamos perdiendo por los atrasos?» | Líder | Limitación explícita; sin montos; ofrece el conteo verificable (2 vencidas) | Aprobado |
| 8 · «Crea una acción para resolver el bloqueo» | Líder / Dirección | Propuesta tipada vinculada a la bloqueada `a4`, `executionEnabled=false`, faltantes declarados, cero inserciones. Dirección: `forbidden` | Aprobado |

Casos adicionales en la misma suite: inactivo bloqueado sin consultas, Dirección con lectura de tablero (7 abiertas), Dirección sin módulo `okrs` → `forbidden` (comportamiento vigente, ver discrepancia), homónimos «Jorge» → aclaración, persona resuelta con filtro previo al recorte, expiración de contexto y aislamiento por canal, descarte de campos de autoridad, fuente caída → `error` sin cifras, mensaje no operativo → LLM, auditoría sin texto ni títulos, mismas cifras e IDs en web, WhatsApp y voz.

| Ejecución | Resultado |
| --- | --- |
| Suite completa en `r1/agente-confiable` | **718/718, 114 archivos.** Base R0 en esta rama: 661/661 (las 21 pruebas UX restantes del total 682 viven en `feat/assistant-entry-ux`). |
| Nuevas pruebas R1 | 57: aceptación 19, capa de consulta 13, matriz 14, contratos y simulador R2 9, adaptadores 2. |
| `tsc -p tsconfig.api.json` | Aprobado. |
| `npm run vercel-build` | Exit 0: TypeScript, Vite, shells y 11 bundles API. |
| ESLint sobre archivos nuevos | Aprobado. `whatsapp-assistant.ts` conserva un `prefer-const` preexistente. |

**Métricas medidas en la suite.** Exactitud factual (totales e IDs contra el fixture), autorización (denegaciones previas sin consultas), resolución de contexto, intención (intent esperado por escenario), errores (estado por fuente), herramientas usadas (lista exacta por turno) y consistencia entre canales. La latencia por etapa queda en `trace`; no se fija un SLO sin baseline remoto.

**No ejecutado:** JWT/RLS, datos reales autorizados, Gemini/Retell reales y canales con `AGENT_ORCHESTRATOR_R1=1` desplegado.

## Validación final ejecutada · 2026-11-19

| Prueba / entorno | Resultado y alcance |
| --- | --- |
| npm test, árbol local basado en 4827181 | **682 passed, 111 archivos, cero fallos**. Incluye los cambios UX locales existentes; no se incorporan a la corrección R0 por este hecho. |
| Reproducción de fecha antes/después | Cinco fallos reproducidos en dos archivos; sin cambiar expectativas. clock.ts respeta un override runtime vacío; tres pruebas nuevas y los doce casos anteriores pasan. |
| npm run vercel-build | Exit 0: TypeScript, Vite, shells y empaquetado API. |
| TypeScript después de agregar la regresión P0001 | npx tsc -b aprobado. |
| Bundles Edge | Webhook, send-action, dispatcher e Inbox empaquetados por bundle-whatsapp-dashboard.mjs. No publicados. |
| Webhook/worker | 17 casos aprobados. P0001 de done: una entrada, un job review, una llamada de mutación y un único aviso de fallo; no replay al duplicar evento/ejecutar worker otra vez. |
| PostgreSQL/WASM permisos | Migración y reaplicación, grants/denegaciones, hardening y verificación de rollback sin restaurar privilegios: aprobado. No JWT real. |
| PostgreSQL/WASM operación P0001 | Trigger sintético aborta después de actualizar checkpoint; toda la RPC revierte: acción Pendiente, checkpoint false, seguimiento pending, cero result requests y recibos. Aprobado. No reproduce la causa productiva. |
| RLS con JWT, Gateway, esquema y recuperación de staging | **No ejecutados**. Requieren entorno y cuentas autorizados. |

Evidencia de ejecución local: .tmp/r0-final-tests-complete.log, .tmp/r0-final-build-after.log, .tmp/r0-final-edge.log y .tmp/r0-final-tsc.log. Estos logs locales no contienen credenciales; los hechos y límites duraderos quedan en estos seis documentos. El diff R0 excluye las mejoras UX y la migración de correo ajena al ciclo.

Identificación local: HEAD 4827181 más diff R0 sin commit ni despliegue. SHA-256 de los archivos revisados:

| Archivo | SHA-256 |
| --- | --- |
| clock.ts | c7bc62d9249d0ae0ccf310af750cb910ac83e1250979338c07284dc4ba65fa37 |
| Migración Dirección | c4728ae38e00bdf02a022fba817b9bf64aa48487c45a957cac40c705b2d0d69f |
| Verificación rollback | 32ed8e4a576057c6b638705f777ff76cf70384af37cbadf5055fd207fe8ad4a3 |
| Webhook | ed2ab6b1781412a832dfd937c18932ab7ca5e2172a430dc159db02a2b3d91ccd |
| Dispatcher | 820cec4272b4a8b84dc1177709d90df18f336bd227079b6e10d76a31fbc9f04c |

### Ejecución QA pendiente, reutilizando el validador

scripts/test-agent-rls.mjs --plan no hace red ni crea recursos. --run exige manifest, JWT authenticated y consulta /auth/v1/user antes de comparar IDs; rechaza explícitamente xhpasmjzuwifmjhrsumb antes de hacer fetch. Se ejecutó el guard con un manifest productivo y fetch sustituido por una función que falla ante cualquier red: rechazó con Production test execution is blocked sin intentar red. **El runner actual sólo prueba lecturas/identidad**: las escrituras positivas/negativas requieren un procedimiento QA transaccional adicional sobre fixtures autorizados; no se declaran cubiertas por ese runner.

Mantener los diez actores del release-plan. Incluir dueño, creador, par ajeno, Dirección sin grant, Dirección con grant independiente, Líder/gerencia con relaciones explícitas, Analista e inactivo. Congelar primero el snapshot/expectativas y luego ejecutar con JWT reales, anon key QA y proveedores bloqueados. Probar lectura, actualización, verificación, administración denegada, autoescalamiento y rechazo del token A en B. Restaurar y comprobar fixtures tras los casos de escritura.

En QA repetir el POST 401 autorizado/no autorizado y el ciclo de WhatsApp con duplicados, P0001, fallos de persistencia y Graph, correlación y entrega sintética. Registrar commit/hash, revisión Edge, timestamp, queue_ms, processing_ms, provider_duration_ms, estado final y exactitud por caso. No ejecutar el dispatcher publicado para investigar el histórico.


## Fase controlada aprobada · preparación de staging

La base de 480 casos se mantiene aprobada. Se añadió un caso integral al harness existente, sin cambiar servicios: webhook firmado → job pendiente → worker → entrada Inbox → respuesta sent → evento Meta delivered → fila delivered. La suite de webhook/worker pasó **16 casos** y demuestra una sola llamada al transporte, una entrada lógica y finalización de mensaje y estado. Todos los proveedores fueron simulados.

El rollback vigente pasó una comparación de prosrc, proacl y proconfig antes/después: ningún predicado o grant cambió y Dirección conservó su denegación de privilegio global. El fichero ejecuta una transacción de sólo lectura. La migración y reaplicación también siguen pasando en PostgreSQL local.

### Casos con JWT reales preparados para QA

| Caso | Sesión y referencia | Resultado esperado |
| --- | --- | --- |
| QA-JWT-01 | Cada una de diez cuentas, Auth → usuarios.id y rol | Identidad validada en servidor, sin usar el service role para medir RLS del usuario. |
| QA-JWT-02 | Dirección Comercial A | Lee Kanban y OKRs autorizados, consulta al agente, no obtiene configuración/Inbox por rol. |
| QA-JWT-03 | Dirección OKRS A | Verifica el acceso concedido por pertenencia OKRS explícita, separado del rol ejecutivo. |
| QA-JWT-04 | Dirección con app_role admin A | Verifica los grants administrativos independientes y su trazabilidad. |
| QA-JWT-05 | Analista y Operativo A | IDs propios/creados/mencionados según la política de cada operación; borradores ajenos no visibles. |
| QA-JWT-06 | Líder A | Respeta membresía, equipo y catálogo de módulos de QA. |
| QA-JWT-07 | Perfil Dirección inactivo A con grant admin | Rechazo del agente; sin administración ni autoactivación del perfil. |
| QA-JWT-08 | Token A contra host/API key B y viceversa | Rechazo de Auth, sin consulta de datos. Después, cada token válido sólo ve los fixtures de su proyecto. |
| QA-JWT-09 | Repetición de consultas con propuesta pendiente | Conserva filtros, contexto y borrador, sin ejecutar comunicaciones. |
| QA-JWT-10 | Revisión de efectos con fixtures reversibles | Comprobar por relaciones y grants los positivos y negativos de actualización y verificación. Mantener el límite de transporte simulado. |

La creación y aplicación del baseline en QA están pendientes de la aprobación de recursos de [release-plan](release-plan.md). El runner JWT existente cubre identidad, lecturas y rechazos entre proyectos. Los cambios de fixtures para casos de escritura se ejecutarán sólo en QA tras aprobar el entorno y con restauración verificada. Ninguna sesión JWT de staging se ha ejecutado en esta preparación.

## Preparación final · pruebas adversariales SQL

La repetición focalizada conserva 480/480 casos aprobados. En PostgreSQL local se agregaron casos de tabla temporal que suplanta user_roles, CREATE inseguro en public, propietario de función no confiable, Dirección inactiva con grant administrativo y Dirección por catálogo con intento de autoescalamiento. El caso de tabla temporal falló antes del endurecimiento y pasó después. También pasan migración repetida, grants/denegaciones, rollback funcional y reaplicación.

El endurecimiento fija search_path con pg_temp al final y valida los privilegios del esquema y los propietarios, incluyendo membresías de roles de cliente. El test usa un laboratorio de PostgreSQL/WASM con roles SQL y claims sintéticos. La aceptación JWT y el esquema completo de Supabase siguen pendientes de staging autorizado.

## Corrección coordinada · resultado vigente

Ejecución del 2026-11-18 sobre `4827181` más cambios locales. **480 pruebas pasadas en 72 archivos** en la suite focalizada de API, AI Support, Guía, WhatsApp, permisos y actionPermissions. `npm run vercel-build` y los bundles de webhook/dispatcher terminaron correctamente. La suite original cubría menos permisos; las dos contradicciones detectadas se resolvieron después de reflejar el criterio aprobado en código y migración.

| Gate | Resultado local y límite |
| --- | --- |
| Lectura Dirección | Acceso ejecutivo fuera de OKRS, sin asignar rol administrador. Inactividad y perfiles sin módulo se rechazan. Gestión WhatsApp sigue ligada a OKRS/Super Admin explícitos. |
| Navegación | Módulos administrativos no permiten a Dirección recuperar acceso de administración; perfil propio y consultas se conservan. |
| Escritura del agente | Predicado SQL denegado impide proponer update. Confirmación vuelve a validar y no toca la acción cuando perdió autorización. |
| Inbox | Hola, Mis acciones, respuesta rápida, botón y lista producen fila entrante. Duplicados mantienen una fila y una respuesta; fallo de persistencia detiene Graph y el reintento completa una vez. |
| Métricas | El harness verifica `queue_ms`, `processing_ms` y `provider_duration_ms` ligados al mismo job. Aceptación y entrega quedan ligadas por ID de Meta. |
| RLS PostgreSQL local | Estado previo, forward dos veces, permisos de lectura, edición propia y denegación de edición ajena/catálogos/Academia/Storage. Se deniega autoasignación de rol o área OKRS. Grants independientes de admin y Super Admin se conservan. Rollback y reaplicación pasan. |
| RLS con JWT de staging | Preparada, pendiente de cuentas y proyecto autorizados. PGlite ejecuta roles SQL y claims sintéticos; la firma de un JWT y el Gateway de Supabase se validan en staging. |
| Proveedores | Simulados en todas las pruebas nuevas. No hubo envío productivo ni backfill. |

### Reproducción local de SQL

Instalar PGlite en un directorio temporal, sin modificar dependencias del proyecto. En esta ejecución se usó `@electric-sql/pglite@0.3.14`. Apuntar la variable al módulo instalado y ejecutar:

```powershell
$env:WHATSAPP_PGLITE_PATH = 'RUTA_ABSOLUTA/pglite/dist/index.js'
node scripts/test-agent-permissions-database.mjs
node scripts/test-whatsapp-database.mjs
```

El segundo script existente pasó autorización de mutaciones WhatsApp, Hecho, motivo de bloqueo, checklist de equipo, duplicados, leases, reintentos y denegación de acceso directo a cola. El laboratorio de permisos usa funciones y políticas reales extraídas de migraciones con tablas mínimas y adaptadores de identidad. Requiere repetir sobre el esquema completo de QA.

### Staging preparado

`node scripts/test-agent-rls.mjs --plan` muestra los IDs sintéticos y el contrato de manifest. Tras aprobar y provisionar QA, `--run --manifest RUTA` comprueba identidad en `/auth/v1/user` y compara los conjuntos de IDs visibles con JWT de usuario. La configuración apunta a QA A o QA B, y el proyecto productivo se rechaza explícitamente.

Para el caso entre organizaciones usar el JWT de QA A contra el host y API key de QA B con `expectedAuthHttp: 401` y verificar que no consulte tablas. Para Dirección congelar expectativas de lectura Kanban/OKR y borradores propios, sin Inbox por rol; probar separadamente la cuenta con asignación OKRS explícita y la cuenta con grant de administrador independiente. Las mutaciones se prueban primero en el laboratorio y luego, con autorización, en QA con fixtures reversibles.

## Registro ejecutado · ciclo 2

Base `4827181` con cambios locales. Fecha 2026-11-18, zona CDMX. Proveedores en pruebas locales sustituidos. Las pruebas amplias duran segundos por usar mocks; ese tiempo no representa latencia de usuario.

| Ejecución | Resultado | Evidencia |
| --- | --- | --- |
| Antes de correcciones | 433 passed / 68 archivos | Mismo comando de alcance de auditoría R0. |
| Nuevo contrato dispatcher antes | 5 passed / 1 failed | Falta de credencial válida atraviesa la guarda y alcanza inicialización de BD. |
| Nuevos casos replyAi antes | 16 passed / 2 failed en suite Edge | source incompatible y timeout absorbido reproducidos. |
| Después, alcance original ampliado con dispatcher e historial heredado | 442 passed / 69 archivos | Incluye seis casos de autenticación, dos de replyAi y variante de historial automation. |
| Después, agregando permisos y tres fixtures de scope | **469 passed / 2 failed, 71 archivos** | Fallos en moduleAccess.test.ts líneas 50 y 83. Política Dirección/Comercial inconsistente con las expectativas de tests. Los fuentes de permisos no fueron modificados. |
| Compilación | `npm run vercel-build` termina con exit 0 | TypeScript, Vite y bundle API. Sin publicar ni promover artefactos. |

Para reproducir la ejecución ampliada:

```powershell
npm test -- api/_shared api/whatsapp-webhook.test.ts src/lib/whatsappIngress.test.ts src/lib/whatsappInboundWorker.test.ts src/lib/whatsappFlowRouting.test.ts src/lib/assistantPrompts.test.ts src/features/ai-support src/features/guide src/features/whatsapp-inbox src/features/auth/lib/permissions.test.ts src/features/auth/lib/moduleAccess.test.ts
npm run vercel-build
```

### Aceptación de datos y producción observada

- AT-01/02/05 parcialmente contrastados por lecturas: ocho totales Kanban coinciden tras corregir estados del oráculo; OKR de Dirección/super_admin coincide con RPC en 10 objetivos/29 KRs, y otros dos perfiles reciben denegación del runtime. Faltan JWT y paginación/IDs de referencia completos. Los ensayos no afirmaron equivalencia RLS.
- AT-11 pasa en local para historial source ai y automation. Las preguntas normales no consultan assistant_pending_ops ni ejecutan confirmación. Falta sesión real de WhatsApp correlacionada.
- AT-12 tiene validación local de firma, encolado, worker, texto, botones/listas, duplicados, rate limit y resultado incierto. La correlación real de entrada encontró 39 de 48 mensajes done en Inbox; dos adicionales están review y nueve done requieren explicación.
- AT-15 identifica que GET dispatcher llega al runtime, con 405 y execution ID. El 401 se reproduce localmente como rechazo de la función; la atribución del POST histórico requiere log remoto. Ningún POST al dispatcher publicado se ejecutó en esta pasada.
- AT-03/13/19 están pendientes de sesiones QA y revisión de políticas efectivas. AT-06–10 tienen cobertura local parcial con adaptadores simulados. Cero efectos productivos nuevos.
- Los tiempos de lectura REST de las muestras fueron 1226 ms cola, 576 ms Inbox y 424 ms seguimientos. Son latencias de diagnóstico. En 48 trabajos done, encolado a última actualización tiene p50 39.606 s, p95 517.747 s y máximo 575.017 s. No se ha medido el p95 completo de conversación ni primer audio ni la entrega exacta de cada respuesta.

### Fixtures de aislamiento preparados

Se agregaron tres fixtures de ownership a assistantOpsRuntime.test.ts. Cubren propio, par y dueño externo sintético en la función analystCanSeeAction sin override de organización. Se reutilizan los fixtures de usuarios activos/inactivos/ambiguos de whatsappEdgeRuntime.test.ts, los borradores de whatsappAssistant.test.ts y las credenciales ficticias de whatsappDispatcher.test.ts. Los tests no crean usuarios.

La propuesta completa de QA A/QA B y el dataset está en [riesgos y dependencias](risks-and-dependencies.md). Tras aprobarla se podrán ejecutar comparaciones con JWT y políticas aplicadas, además de operaciones reversibles en QA. El origen de fuente/organización de un fixture será explícito y no se interpretará como un tenant implementado en la BD actual.

Entorno de prueba con datos sintéticos y transportes simulados. Para validar proveedores, usar un entorno de pruebas y destinatarios autorizados. Las ejecuciones contra producción que creen acciones o envíen mensajes requieren autorización explícita.

## Fixtures y oráculos

- Crear actor A con dos acciones propias, una vencida y otra abierta; una acción creada por A para B; otra de B visible para un supervisor y oculta para A; una acción cerrada y una con fecha límite del día. Fijar reloj a 12:00 en `America/Mexico_City`.
- Incluir dos personas de nombre similar, una relación inactiva y un número de WhatsApp vinculado. Definir permisos explícitos de Kanban, OKR y KPI por persona.
- Fijar total/IDs esperados por consulta, un OKR con avance conocido, un KPI con fecha de corte y una cuenta autorizada para revisar propuestas. Usar el resultado del servicio canónico y el registro de BD como oráculos.
- Capturar canal, identidad, rol, alcance normalizado, herramienta, IDs/cifras, tiempos, propósito de operación y estado final. Los logs de prueba no deben contener secretos, audio bruto ni texto de terceros.

| Caso | Pasos y resultado verificable | Canales |
| --- | --- | --- |
| AT-01 Mis acciones | «Mis acciones» → IDs de A como responsable. «Todas» conserva el alcance personal y sólo amplía el estado. | Chat, Retell, liga, WhatsApp |
| AT-02 Acciones que asigné | «¿Qué acciones asigné?» → ID creado por A para B. «¿Y las vencidas?» conserva el filtro creador y cambia vencimiento. | Todos |
| AT-03 Otro usuario | Consultar por nombre; desambiguar homónimos. Supervisor obtiene los IDs permitidos; A obtiene denegación o alcance permitido sin datos de B que estén fuera de su rol. | Todos |
| AT-04 Vencidas | Pedir vencidas por persona, confirmar zona horaria y excluir cerradas. Fecha límite del día sigue la regla aprobada y el oráculo de Kanban. | Todos |
| AT-05 OKRs y KPIs | Preguntar avance, periodo, fuente y cifra; comparar contra datos fijados. Repetir con rol sin acceso y KPI sin corte. | Todos donde el módulo esté habilitado |
| AT-06 Crear acción | Proponer acción para B con fecha; leer borrador; confirmar como titular autenticado y repetir confirmación concurrente. Una fila, una transición y una traza. | Chat y voz con aprobación según modo. Liga pública y WhatsApp de lectura comprueban la política. |
| AT-07 Actualizar acción | Proponer cambio con alcance autorizado. Editar borrador, confirmar y verificar diffs. Rechazar ID ajeno y versión desactualizada. | Chat y voz; botones de WhatsApp según su contrato; liga según modo |
| AT-08 Registrar bloqueo | Pulsar Requiero apoyo o pedir bloqueo; exigir motivo. Guardar motivo sobre el ID correcto; repetir el evento y comprobar un solo efecto. | WhatsApp y flujos de acciones habilitados en web/voz |
| AT-09 WhatsApp saliente | Seleccionar destinatario vinculado, editar texto sobre el borrador, cancelar una vez y aprobar otra como dueño. Mock Graph registra un envío y su ID; inspeccionar aceptación y evento `delivered`. | Chat, voz, liga con aprobación autenticada. Verificar política de WhatsApp para iniciar/aprobar. |
| AT-10 Correo saliente | Preparar correo operativo con responsable Kanban. Resolver dirección, editar asunto/cuerpo, confirmar. Verificar destinatario y principal remitente del flujo usado. Repetir con correo faltante y fallo del proveedor. | Chat, voz, liga y comprobación de política en WhatsApp |
| AT-11 Borrador y consulta | Con correo pendiente, preguntar dos veces por OKRs. Obtener respuesta en ambas, mantener el borrador, comprobar que un «sí» ambiguo no envíe correo. | WhatsApp y regresión equivalente en chat/voz |
| AT-12 Ingreso y entrega | Payload válido, firma incorrecta, secreto ausente, duplicado, status, cuenta no vinculada, botones y listas. Medir persistencia, claim, Inbox, aceptación Graph y entrega. Repetir con 429 y resultado incierto de proveedor. | WhatsApp |
| AT-13 Autorización de liga | Link expirado, revocado o reenviado, sesión ajena, grant inválido y confirmación pública. Validar JWT del dueño en vía autenticada y permiso revalidado tras cambio de rol. | Liga y voz |
| AT-14 Voz y errores | Medir inicio de habla, tool, primera respuesta audible, interrupción, permisos de micrófono y cierre. Simular timeout y fallo; comprobar mensaje hablado y que el informe final se guarde una vez. | Retell, liga, STT/TTS web |
| AT-15 Infra y cron | Worker autenticado/rechazado, vault y ruta correctos, cron de seguimientos autenticado, expiración de lease, idempotencia y versión desplegada. Clasificar 401 de Gateway o runtime con cuerpo/código redactado. | Supabase, Vercel y Meta en entorno de prueba |
| AT-16 Evidencia y reportes | Comparar informe con `consult_log`, separar hallazgo de recomendación y fallo técnico. Verificar PDF, ausencia de envío, procedencia y permisos. | Chat, voz y liga |
| AT-17 Recomendaciones | Sembrar una acción vencida, otra por verificar y otra reprogramada varias veces. Recalcular dos veces. Aceptar una señal, descartar otra y expirar la última; quedan rastro y efecto único, sin operación sensible sin aprobación. | Tablero y motor de señales |
| AT-18 Programación conversacional | «Cada lunes a las 8» con canal y zona explícitos. Validar borrador, aprobación, vista, edición, pausa y registro de ejecución simulada. Remover permiso antes del siguiente turno y verificar que se respete. | Chat y servicios de envío |
| AT-19 Límites de acceso y fuentes | Comparar los IDs devueltos por JWT y por cada adaptador privilegiado usando actores de distinto rol y área. Repetir con otro proyecto de prueba si se declara aislamiento organizacional; exigir autorización y corte por cada fuente. | Todos |
| AT-20 Caso integral | «Muéstrame las acciones vencidas de mi equipo, identifica las bloqueadas, prepara un seguimiento y crea las acciones que acordemos». Comparar IDs, resultado, borradores, aprobaciones, efectos únicos y evidencia entre web, WhatsApp y voz, según política de canal. | Chat, WhatsApp, voz; liga con alcance permitido |
| AT-21 Conocimiento documental | Publicar dos versiones de un documento y retirar una; comprobar referencia a versión vigente, acceso restringido y respuesta honesta al faltar evidencia. Contrastar un dato vivo con una cifra obsoleta del documento. | Todos donde se habilite conocimiento |
| AT-22 Observabilidad y costo | Inyectar errores 503/401, identificar etapa y correlación desde la consola, estimar costo por canal/modelo y verificar redacción. Probar que un rol sin acceso no vea métricas o conversaciones ajenas. | Consola y servicios |
| AT-23 Widget conversacional | Solicitar semáforo por equipo; fijarlo en tablero, cambiar dato base, editar filtros y eliminarlo. Repetir con actor sin permiso y verificar que el widget no amplíe acceso. | Tablero y chat |
| AT-24 Simulador WhatsApp | Ejecutar «Mis acciones», «Las que asigné», «¿Cuáles tiene Jorge?» y «Realizada / En proceso / Bloqueada» como actores controlados. Inspeccionar actor, filtros, fuente, respuesta y error; comprobar que Graph no fue llamado. | Simulador y fixtures WhatsApp |

**Secuencia de salida de R0.** Ejecutar suites locales, hacer replay de fixtures en entorno aislado, comprobar matriz de accesos, producir baseline por canal y presentar resultados con nivel de entorno. En WhatsApp medir cola, procesamiento y entrega por separado. En voz reportar p50/p95 de tool y primer audio con tamaño de muestra y rutas utilizadas. Los objetivos de tiempo se fijan al revisar el baseline.

**Ejecución real de esta auditoría.** 68 archivos y 433 pruebas Vitest pasaron. Incluyen contratos Retell/Guía, runtime, borradores, semántica y Edge WhatsApp con mocks. Las pruebas AT-01 a AT-16 son criterios de aceptación diseñados. La suite local cubre partes de la matriz, sin certificar sus recorridos completos con proveedores.
