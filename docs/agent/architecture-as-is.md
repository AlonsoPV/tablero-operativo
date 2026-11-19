# Enviardián · arquitectura actual R0–R1

## R1 · inventario focalizado E1/E2/E3 · 2026-11-19

Rama local `r1/agente-confiable` sobre `r0/estabilizacion` (R0 commiteado tal como estaba en el árbol, sin cambios). Sin push, merge, despliegue ni migraciones remotas. Las correcciones R0 y el rediseño UX de entrada (`feat/assistant-entry-ux`) quedan en ramas separadas.

**Hallazgos de la auditoría antes de cambiar código.**

- La lógica de consulta ya estaba concentrada en `get_my_actions` (alcances, filtros, `canUseWideActionScope`, truncado) y `get_okr_progress` (gate de módulo + RPC `okr_dashboard`). No había un contrato de resultado común: cada canal interpretaba `CopilotToolResult` a su modo, sin distinguir vacío, sin permiso, parcial y error.
- `summarizeAction` no exponía el responsable, por lo que «¿quién tiene…?» no era respondible con datos. No existía filtro por persona: filtrar después del recorte a 12 filas daba totales falsos.
- El contexto (`active_query`) sólo se persistía en voz (`consult_log`); chat y WhatsApp dependían del historial del LLM.
- `gemini-chat` devolvía 502 cuando el loop agotaba rondas de herramientas sin texto final.
- `assistant_op_log` sólo admite resultados de escritura; las consultas no quedaban auditadas.
- **Discrepancia abierta:** el gate de módulo de `get_okr_progress` exige el módulo `okrs` en el rol de catálogo también para Dirección. La decisión R0 dice que Dirección consulta OKRs. No se amplió el permiso; se documenta y se prueba el comportamiento vigente.

| Historia | Estado al iniciar R1 | Estado tras R1 (local) | Evidencia |
| --- | --- | --- | --- |
| FV-01 Catálogo de fuentes | P | ISV · catálogo tipado de fuentes, campos, dueño, herramienta y política | `api/_shared/query/sourceCatalog.ts`; prueba de catálogo |
| FV-02 Consultas Kanban | IV local | IV local · contrato único, responsable y filtro por persona autorizado | `query/kanbanQuery.ts`; escenarios 1–3, 6; persona resuelta |
| FV-03 Consultas OKRs | P | P · normalizado y probado; discrepancia de gate Dirección abierta | `query/okrQuery.ts`; escenario 4; caso Dirección sin módulo |
| FV-04 Consistencia y trazabilidad | P | ISV · `asOf`, `sources` y limitaciones por resultado; «Corte HH:MM» en respuesta | `query/contracts.ts`; prueba de consistencia entre canales |
| ID-01 Identificación | P | ISV · actor canónico desde sesión verificada; límite = proyecto | `query/resolveActor.ts`; `stripAuthorityFields` |
| ID-02 Matriz de permisos | P | P · matriz por operación y rol con pruebas pareadas; RLS/JWT sin validar | `query/authorizeQuery.ts` + tests; remoto NO-GO (R0) |
| ID-05 Auditoría de acceso | P | ISV · una entrada por turno sin texto ni PII; requiere migración local no aplicada | `query/queryAudit.ts`; `20261119120000_assistant_op_log_read_audit.sql` |
| CV-01 Comandos | IV | IV local · intención determinista antes del LLM | `orchestrator/intent.ts` (reutiliza `interpretOperationalMessage`) |
| CV-02 Contexto | P | P · contexto por actor/canal/sesión con TTL 30 min; en memoria por instancia, voz rehidrata desde `consult_log` | `orchestrator/sessionContext.ts`; escenario 2; prueba de expiración y cold start |
| CV-03 Resolución de personas | P | IV local · homónimos → aclaración; «la más urgente» con regla explícita y empate → aclaración | `orchestrator/resolveEntity.ts`; escenario 3; caso Jorge |
| CV-04 Gestión de errores | P | IV local · empty/forbidden/partial/error distintos; turno LLM vacío → 200 con mensaje explícito | `orchestrator/respond.ts`; `gemini-chat.ts`; prueba de fuente caída |
| CV-05 Orquestación omnicanal | P | ISV · orquestador único y adaptadores web/WhatsApp/voz detrás de `AGENT_ORCHESTRATOR_R1=1` | `orchestrator/runAgentTurn.ts`, `channelAdapters.ts`; consistencia entre canales |

IV = implementada y validada · ISV = implementada sin validar en entorno real · P = parcial. «Local» significa probado con el runtime real sobre Supabase en memoria, sin RLS ni JWT.

## Cierre técnico solicitado · estado vigente al 2026-11-19

**R0 no está cerrado ni autorizado para producción.** No se reinició la auditoría. Las secciones posteriores conservan el historial; esta sección y el gate vigente de release-plan prevalecen sobre cifras o fallos de ciclos anteriores.

- Suite completa actual: **682/682 en 111 archivos**. Build Vercel, TypeScript y los cuatro bundles Edge pasan. Se mantiene la arquitectura y las tres correcciones anteriores.
- Se encontró una discrepancia adicional del reloj compartido: un override runtime vacío caía al valor demo embebido por Vite. Reproducción: cinco fallos en futureDateValidation/actionGamification. Se corrigió la precedencia en clock.ts; las expectativas existentes no cambiaron. Tres regresiones nuevas cubren fecha demo, desactivación e invalidación.
- El harness real del webhook/worker pasa **17 casos**, incluido P0001 con una sola entrada, un aviso de fallo y ninguna repetición de la mutación. PostgreSQL local confirma rollback atómico de checkpoints/acción/seguimiento/recibos ante un P0001 sintético. Esto no atribuye la causa histórica.
- Lectura productiva del 2026-11-18 23:03:39 UTC: los dos jobs originales siguen review/provider_request, un intento y effect_started=true. Ambos botones solicitan done sobre una acción corporativa. Las acciones siguen En_Ejecucion y Pendiente, respectivamente, sin completed_at y con 0/4 checkpoints completados; no hay recibos por acción ni por evento. Ambos emisores corresponden al responsable actual.
- Comprobación por GET del 2026-11-19 14:38:34 UTC: las dos salidas entregadas son exactamente el aviso de que no se pudo completar ni confirmar el resultado. **No son confirmaciones exitosas de cierre.** No se imprime contenido, teléfono, identidad ni credencial.
- Las nueve omisiones históricas permanecen sin entrada Inbox, con recibo externo y una salida delivered por job. No hubo backfill, reenvío ni edición.
- No existe un staging identificado/autorizado ni sesiones JWT QA. El aislamiento sigue siendo por proyecto; no se inventó una columna tenant ni un rol administrativo para Gerencia.

El estado efectivo de owners/ACL/RLS y la sentencia histórica P0001 no se pueden extraer mediante el acceso REST disponible. net._http_response devuelve 406/PGRST106. El diagnóstico SQL de lectura fue ampliado para exportar también los predicados nuevos, triggers y ACL de tablas. Véanse [riesgos](risks-and-dependencies.md) y [aceptación](acceptance-tests.md).


## Validación controlada · recursos aún no autorizados

La base local de 480 pruebas está aprobada. El recorrido adicional webhook → cola → worker → Inbox → respuesta → entrega pasa con proveedores simulados (suite de 16 casos). No hay staging creado ni sesiones JWT reales de QA ejecutadas. El rollback vigente sólo verifica la base de seguridad; no restaura privilegios legacy. El 401 histórico y los dos P0001 continúan abiertos por evidencia causal inaccesible mediante REST. Véanse la [propuesta de recursos](release-plan.md), los [casos de aceptación](acceptance-tests.md) y los [límites de recuperación](risks-and-dependencies.md).

## Corrección coordinada preparada · 2026-11-18

Este apartado es el estado más reciente del repositorio local y complementa el historial C2 que sigue. Base Git `4827181` más diff de R0 pendiente de revisión. No se ha promovido código, ejecutado migraciones remotas ni enviado comunicaciones.

| Superficie | Comportamiento local preparado |
| --- | --- |
| Dirección · navegación | Consulta Kanban/OKRs según módulos y alcance, usa el asistente ejecutivo y conserva perfil propio. El rol solo no habilita administración, catálogos, Academia administrativa, Inbox ni settings de WhatsApp. Asignar un módulo administrativo no convierte el rol en administrador. |
| Autenticación del asistente | `requireAssistantAuth` admite Dirección activa de Comercial para consultas. Conserva los filtros de otros perfiles e inactividad. WhatsApp consulta una capacidad SQL de lectura separada de la gestión. |
| Acciones | Propuesta y ejecución de update/verify/Hecho consultan los predicados SQL existentes y revalidan en confirmación. El responsable conserva su operación de cierre. Dirección deja de ser un bypass de edición, verificación y controles del formulario. |
| SQL/RLS | Migración `20261118150000_direction_executive_scope.sql` retira Dirección de privilegios globales y separa lectura OKR/consulta de gestión. Mantiene asignaciones administrativas independientes y reglas por relación. Guardas restrictivas cubren políticas históricas de configuración; se protege la autoedición de identidad/rol/área/activación. |
| Inbox | La entrada se registra antes de deduplicación de recibos y de cualquier salida del router. ID Meta único mantiene una sola fila lógica. Los routers enriquecen metadata de flujo sin insertar otra entrada. Fallo al guardar la entrada detiene la respuesta y admite reintento. |
| Trazabilidad | Claim registra `queue_ms` y `claimed_at`; finalización registra `processing_ms`; Graph registra `provider_duration_ms`, aceptación e ID. Los eventos de entrega conservan ID de respuesta, job y timestamp del proveedor. Son métricas preparadas, aún sin baseline desplegado. |

**Evidencia local actual.** 480 pruebas pasaron en 72 archivos; compilación Vercel y bundles de ambas Edge Functions pasan. PostgreSQL local PGlite verificó el estado previo, migración aplicada dos veces, RLS con rol SQL authenticated, concesiones explícitas, bloqueos de autoescalamiento, rollback y reaplicación. Este laboratorio usa claims sintéticos y un esquema reducido, con funciones/políticas extraídas del repositorio. Faltan las sesiones JWT de staging y el esquema completo desplegado.

Las nueve entradas históricas se reconstruyeron con corte `2026-11-18T16:48:57.744785Z`: todas tienen recibo y salida correlacionada entregada, sin fila entrante. El mecanismo de salida anticipada se reprodujo con Hola y queda cubierto localmente por texto, comandos, botones, listas, duplicados y reintentos. La corrección no hace backfill ni reenvía esos mensajes históricos.

El POST 401 histórico y los dos P0001 originales continúan abiertos. Sus evidencias y requisitos de cierre están en [riesgos](risks-and-dependencies.md). El cierre de R0 sigue bloqueado hasta resolverlos y completar staging.

## Ciclo 2 · evidencia del 18 de noviembre de 2026

Base de código `4827181` más correcciones locales sin publicar. El estado público Vercel del commit base es `success`; la revisión exacta de Edge y la URL realmente consumida por el webhook siguen sin certificar. Ventana de esta ejecución aproximadamente 12:31–12:40 CDMX. Se usó acceso de servicio de solo lectura, con filtro al proyecto `xhpasmjzuwifmjhrsumb`, sin mostrar contenido de mensajes ni credenciales. Los ensayos del runtime con datos existentes bloquearon peticiones de escritura, salvo `okr_dashboard`, que es una consulta RPC. Ese cotejo ocurrió antes de recibir la restricción adicional de usar únicamente la cuenta de referencia en futuras pruebas.

| Evidencia C2 | Resultado | Límite de interpretación |
| --- | --- | --- |
| Cola, 200 trabajos recientes | 149 estados completados, 49 mensajes completados y 2 mensajes en review con `database_P0001` | Muestra reciente; sin tasa de éxito global ni causa exacta del P0001. |
| Inbox, 200 registros recientes | 108 entradas entregadas, 70 salidas automation entregadas, 20 leídas, 1 enviada y 1 fallida | Confirma persistencia y estados existentes. La atribución de cada respuesta al turno aún requiere traza. |
| Correlación de 50 mensajes de cola | 48 done, 2 review; 39 de los 48 done tienen entrada Inbox por coincidencia exacta de event_key/meta_message_id | Los 9 sin coincidencia requieren investigación de filtros/versiones y logs; no se certifica pérdida sin esa revisión. |
| Encolado a última actualización, n=48 done | p50 39.606 s, p95 517.747 s, máximo 575.017 s | Incluye espera y posibles reintentos. Es una muestra histórica, sin separación de LLM o entrega. |
| Seguimientos, 31 jobs | 14 sent, 3 failed, 12 canceled, 2 pending | La causa del 401 histórico requiere la ejecución de cron y respuesta HTTP correspondientes. |
| Sondas GET sin credenciales | Dispatcher 405 en 322 ms; webhook 403 en 333 ms | Llegan al runtime. GET de verificación sin token debe rechazarse. Sin POST al dispatcher ni mensajes nuevos. |
| Cotejo Kanban privilegiado | 8 pares de consultas de responsable/creador en 4 roles: totales coincidentes tras corregir el oráculo | Coincidencia de totales; la igualdad de IDs del conjunto corregido no se repitió. No valida RLS con JWT de usuario. |
| OKRs privilegiados | Dirección y super_admin obtienen 10 objetivos y 29 KRs, coincidentes con RPC. Líder y Analista reciben denegación del runtime en la muestra | La referencia RPC bajo service role ve datos más amplios. Falta comparar con sesiones y visibilidad real de los usuarios. |

La primera referencia Kanban omitía `Hoy` y `Retraso`. Se corrigió para usar los cinco estados abiertos que define el runtime; las discrepancias iniciales no se clasifican como defectos del producto. Tiempo observado del par consulta+referencia Kanban 214–979 ms; OKR+referencia 362–958 ms. Estas cifras no miden una respuesta generativa completa.

Se reprodujeron tres defectos locales y se corrigieron con prueba antes/después: dispatcher fail-open sin credenciales, persistencia de respuesta AI con source incompatible con el esquema de Inbox y excepción de envío AI absorbida por el handler. Ver [riesgos y cambios](risks-and-dependencies.md). La suite ampliada concluyó con **469 pruebas pasadas y 2 fallidas en 71 archivos**. Los dos fallos son discrepancias preexistentes de permisos Dirección/Comercial en `moduleAccess.test.ts`. La suite de permisos está fuera del alcance de los 433 casos de la auditoría inicial. Las funciones de permisos no cambiaron en C2.

**Estado de R0 al terminar C2: bloqueado para liberar.** Pendientes la decisión de política de permisos, prueba RLS con cuentas QA, diagnóstico del 401 histórico, dos review P0001, nueve correlaciones de Inbox y recorrido autorizado hasta entrega.

Auditoría del 18 de noviembre de 2026, base Git `4827181` (main local). Se revisaron código, migraciones, suites y evidencia histórica de producción aportada en el chat. La ejecución R0 de Vitest pasó **433 pruebas en 68 archivos**. El alcance fue `api/_shared`, `api/whatsapp-webhook.test.ts`, las suites de ingreso/worker/routing y prompts de `src/lib`, y `ai-support`, `guide` y `whatsapp-inbox` en `src/features`. Son pruebas locales con servicios simulados. GitHub reportó despliegue exitoso de Vercel para el commit auditado. La revisión efectiva por alias, Edge y Retell, así como la ejecución con proveedores, quedan por verificar. [Despliegue Vercel de 4827181](https://vercel.com/alonsopvs-projects/tablero-operativo/4KH68ShB5GH3NWeSwjynLQr15MZM)

**Estados.** IV = implementada y validada en el alcance indicado. ISV = implementada sin validar el recorrido indicado. P = parcial. F = fallando con evidencia reproducida o histórica identificada. NI = no implementada en la superficie auditada.

| Capacidad | Estado | Evidencia, alcance y límite |
| --- | --- | --- |
| Mis acciones, vencidas, asignadas, detalle, equipo y verificaciones | IV en pruebas locales | `assistantOpsRuntime.ts`, `actionQueryContract.ts`, `actionQuery/mergeArgs.ts`, `operationalAliases.ts`. El contrato distingue responsable, creador, alcance y filtros. La igualdad de resultados entre canales queda por medir. |
| OKRs, KPIs y módulos | P | `assistantBoardReads.ts` expone progreso OKR, dashboard, KPIs, brechas, tickets, equipo, informes y otros módulos mediante `get_module_data` y `search_board`. Cobertura por adaptador y permiso. Falta cotejo de cifras y paginación con la UI para todos los roles. |
| Exactitud, fuentes y explicación | P | `tryFactualAssistantReply.ts`, resultados estructurados del copiloto, `guide_sessions.consult_log` y hechos del informe. Falta contrato común de filtros, timestamp y procedencia visibles en cada respuesta. |
| Chat escrito | IV local | `AiAssistPage.tsx` → `/api/gemini-chat` y `/api/assistant-ops`. `geminiToolLoop.test.ts`, `assistantOpsRuntime.test.ts`. El cliente también arma contexto y puede responder por la ruta factual. |
| Contexto consecutivo | P | Retell persiste `active_query` en `consult_log`; chat tiene historial y contexto estructurado; WhatsApp usa `whatsapp_messages` y `whatsapp_flow_sessions`. El caso «Todas» tiene cobertura lógica, con paridad y voz real pendientes. |
| Identidad, roles y permisos | P | `assistantAuth.ts`, actor de Guía desde `guide_sessions`, identidad WhatsApp en `user_channel_identities`. Uso de credenciales privilegiadas en servidor con guardas por rol; falta verificar paridad de visibilidad con RLS aplicada a JWT. |
| Resolución de personas | IV local en casos cubiertos | `search_people`, resolución de destinatario y `findUsuarioByWa`. Pruebas de número mexicano, cuenta inactiva y vínculo ambiguo. Pendientes homónimos y reasignación en matriz multicanal. |
| Crear, actualizar, comentar, verificar y seguir acciones | P | `assistantOpsRuntime.ts` gestiona operaciones y propuestas; WhatsApp usa RPC `whatsapp_apply_action` y `whatsapp_apply_team`. Botones y bloqueo con motivo cubiertos localmente. El alcance de escritura depende del canal y modo. |
| Glosario operativo | IV local | `operationalSemantics/operationalDictionary.ts`, `operationalInterpret.ts`, pruebas de semántica, aliases Edge. Falta comprobar versión publicada del prompt de Retell. |
| Base documental administrable con recuperación y citas | NI | Se localizaron glosario, prompts y lecturas estructuradas. Sin evidencia de ingestión documental, indexación con permisos, actualización o citas para Enviardián. |
| Voz a texto | ISV | `useSpeechRecognition.ts`, captura de navegador; `/api/assistant-media` + `assistant-transcribe.ts` como vía servidor. Validar permisos, acento y fallback en navegadores. |
| Texto a voz | ISV | `assistant-audio.ts`, `elevenLabsTtsClient.ts`, síntesis nativa como fallback. Validar reproducción, interrupción y latencia. |
| Voz a voz y Retell | P | `useRetellGuideCall.ts`, `guide-retell.ts`, web call, herramienta firmada, eventos de fin y analítica. Contratos y finalización cubiertos; prompt, tools, modelo/STT/TTS y duración efectiva requieren prueba con configuración externa. |
| Sesiones por liga | P | `GuideVoiceInvitePage.tsx`, `guide-user-link.ts`, `guide-report.ts`, `guide_user_links`, `guide_sessions`; validación y consentimiento con grant. Handler público de informe exige login para confirmar/cancelar; revisar variante `interview_full_read`, propuestas permitidas, revocación durante llamada y alcance efectivo. |
| OpenAI | P | Hay adaptador compatible con OpenAI en Edge (`lovableGateway.ts` y variantes inlined de AI chat/report/insights). El recorrido principal escrito y WhatsApp usa Gemini. El modelo publicado en Retell y el uso real de OpenAI en Enviardián quedan sin verificar. |
| WhatsApp bidireccional | P | Meta → `whatsapp-webhook` → `whatsapp_inbound_jobs` → cron worker → `whatsapp_messages`/Graph. Suite valida texto, botones rápidos, listas, deduplicación, seguridad y reintentos. En producción se observó encolado y worker HTTP 200; quedan aceptación y entrega de la respuesta correlacionadas. |
| Borradores WhatsApp y correo | P | `assistantCommunicationDrafts.ts`, `workspaceDraftVoice.ts`, `assistant-ops.ts`, `assistant_pending_ops`, `assistant_person_email`. Existen edición y aprobación; correo operativo por flujo de Kanban y Gmail como integración distinta. Envío/estado del proveedor y paridad de edición pendientes. |
| Recordatorios y automatizaciones | P | `whatsapp-followup-dispatcher`, cron SQL, jobs de seguimientos y `calendarReminders.service.ts`. Hay 401 histórico sin causa exacta. Reportes programables por conversación carecen de flujo identificado. |
| Reportes y recomendaciones | P | `finalizeGuideInterview.ts`, `guideReportSanitize.ts`, `GuideReportBody.tsx`, PDF e histórico. Las recomendaciones del informe existen; detección proactiva sostenida, priorización y seguimiento de beneficio por validar o construir. |
| Administración del agente | P | Configuración WhatsApp e Inbox, Vercel/Supabase/Retell y eventos por subsistema. Sin evidencia de consola transversal de evaluaciones, latencia, costo, incidentes y versiones. |
| Bloqueo de consulta por borrador de Google | F histórico, corrección IV local | El handler devolvía la propuesta antes de procesar el turno. `094824f` separa consulta y aprobación; su despliegue falló por TS2339. `4827181` corrige el build y Vercel reporta despliegue exitoso. Falta confirmar qué versión usa el webhook y probar una consulta real con el borrador abierto. |

Rutas y pruebas citadas se encuentran bajo [API](../../api), [Edge Functions](../../supabase/functions) y [AI Support](../../src/features/ai-support). Para cron y cola, ver [auditoría histórica](../whatsapp-bidirectional-audit-2026-11-17.md) y [guía de diagnóstico](../whatsapp-entrada-validacion.md).

## Límites y dependencias de ejecución

| Canal | Orquestador, identidad y estado |
| --- | --- |
| Chat | Gemini y `geminiToolLoop`; auth Supabase y actor; historial de la app y argumentos; herramientas y propuestas compartidas. |
| Voz autenticada | Retell controla turnos y audio; API Guía resuelve actor desde sesión; herramientas y reporte usan logs de consulta. Dictado/TTS en UI constituyen otra experiencia. |
| Liga | Se valida token y consentimiento; el grant abre web call; los IDs de actor se resuelven en servidor. El informe final usa sesión y operaciones asociadas. Revisar alcance efectivo y rutas de aprobación con JWT del dueño. |
| WhatsApp | Firma sobre cuerpo crudo, match WABA/teléfono, cola y worker separado. Identidad por teléfono activo; comandos deterministas primero, consultas abiertas vía `/api/whatsapp-assistant` y Gemini. Historial por teléfono y usuario; modo de consulta con herramientas de lectura. |

**Persistencia.** `guide_sessions`, `guide_user_links`, `consult_log` y `executive_report` guardan sesiones y evidencias de voz. `assistant_pending_ops` y `assistant_op_log` registran propuestas y operaciones. `whatsapp_inbound_jobs`, recibos de mutación, `external_inbound_messages`, `whatsapp_messages` y `whatsapp_flow_sessions` soportan la conversación y el procesamiento. El ID de proveedor y los eventos de entrega complementan al resultado local.

**Seguridad.** Revisar migraciones [assistant ops](../../supabase/migrations/20261103210000_assistant_ops.sql), [ligas](../../supabase/migrations/20261108120000_guide_user_links.sql), [Inbox](../../supabase/migrations/20261103150000_whatsapp_inbox.sql) y [cola durable](../../supabase/migrations/20261117180000_whatsapp_durable_inbound.sql). Inbox usa políticas de operadores; la cola y recibos revocan acceso directo a roles de cliente. RLS activa en un esquema no prueba filtrado equivalente cuando se ejecuta como service role. El aislamiento observado se apoya en proyecto y permisos, sin un contrato `organization_id` universal.

**Duplicidades.** Chat factual, Retell y WhatsApp resuelven intención/contexto por vías distintas; existen copias/adaptaciones del enrutador WhatsApp en `src/lib` y Edge. Las consultas comunes pasan por el runtime, pero WhatsApp implementa rutas propias y escribe por RPC. Voz prepara borradores con una envoltura propia y comparte la persistencia/aprobación con web. El callback Vercel y el candidato Supabase requieren una topología documentada para que no se auditen ni configuren como si ambos fueran el callback activo.

**Errores y rastreo.** Retell emite resultados tipados y tiempos de herramienta; Gemini registra herramientas y uso; WhatsApp registra recepción, claim, envío y fallo. La evidencia está distribuida en Vercel, Edge, Cron, Meta, Retell y la BD. Falta un correlativo común que conecte turno, herramienta, propuesta, proveedor y resultado.
