# Enviardián · backlog consolidado R0–R1

## R1 · estado de historias trabajadas · 2026-11-19

Desarrollo aislado en `r1/agente-confiable`. Ninguna historia se declara liberada. «Local» = runtime real con Supabase en memoria; falta JWT/RLS y datos reales autorizados.

| Historia | Estado | Evidencia R1 | Siguiente gate |
| --- | --- | --- | --- |
| FV-01 | ISV | Catálogo tipado de fuentes y dominios no disponibles | Contrastar con el esquema efectivo exportado en QA |
| FV-02 | IV local | Contrato único; responsable y filtro por persona; escenarios 1–3 y 6 | Mismos IDs con JWT por rol (AT-01–04, AT-19) |
| FV-03 | P | Normalización OKR y escenario 4 | Decidir gate de Dirección sin módulo `okrs` en catálogo; cotejo con RPC por rol |
| FV-04 | ISV | `asOf`, fuentes y limitaciones en cada resultado | Mostrar corte en UI web y validar con datos reales |
| ID-01 | ISV | Actor canónico; descarte de autoridad inyectada | Sesiones JWT QA y vínculos WhatsApp/voz reales |
| ID-02 | P | Matriz por operación con pruebas pareadas | Paridad RLS/JWT (bloqueada por R0) |
| ID-05 | ISV | Auditoría por turno sin PII | Aplicar migración `20261119120000` en QA y verificar RLS de inserción |
| CV-01 | IV local | Intención determinista; no operativo → LLM | Corpus de frases reales por canal |
| CV-02 | P | Contexto por actor/canal/sesión, TTL 30 min, rehidratación en voz | Persistencia compartida para web/WhatsApp en serverless |
| CV-03 | IV local | Homónimos y «la más urgente» con aclaración ante empate | Homónimos reales en QA |
| CV-04 | IV local | Cuatro estados distintos; turno LLM vacío → mensaje explícito | Fallos reales Gemini/Retell en QA |
| CV-05 | ISV | Orquestador y tres adaptadores detrás de flag | Activar en QA con R0 cerrado; comparar canales con el mismo oráculo |
| AC-01, AC-02, AC-03, AC-05, CM-02 (preparación) | Contratos y simulador | Propuesta tipada, idempotencia, concurrencia, revalidación y auditoría simuladas | R2: ejecución real sólo con autorización |

## Gate de cierre R0 · 2026-11-19

| Historias existentes | Evidencia vigente | Estado de aceptación |
| --- | --- | --- |
| ID-02, CV-04, QA-01, QA-02 | Matriz y SQL pasan localmente, incluyendo escalamiento y rollback que conserva permisos. | GO local; aceptación remota bloqueada por JWT y snapshot de staging. |
| WA-02, WA-03, QA-03 | 17 casos webhook/worker; P0001 simulado mantiene review, entrada única y un aviso de fallo. Laboratorio SQL verifica atomicidad. | GO local; falta circuito remoto con BD QA y transporte simulado. |
| WA-04 | Rechazo 401 de función y credenciales válidas cubiertos localmente; el POST histórico sigue sin cuerpo/ejecución atribuible. | NO-GO remoto. Excepción histórica sólo después de reproducción en staging y aceptación expresa. |
| AC-02, AC-05 | Los dos botones históricos pedían done; hoy no se observa cierre/checkpoints ni recibos; la respuesta entregada era un aviso de fallo. | Conciliación parcial confirmada; conservar review sin reintentos hasta tratamiento aprobado. |
| QA-06 | Suite completa 682/682; build Vercel y cuatro bundles; recuperación SQL local. | GO local; NO-GO de liberación por staging, esquema efectivo y conciliación remota. |

La reparación de clock.ts cierra cinco regresiones reproducidas de la suite completa; no altera criterios de negocio ni amplía funcionalidades. R1 y GAP-01–05 no se iniciaron. Las cifras 469/480 y contradicciones de pruebas registradas más abajo pertenecen al historial, no al resultado actual.


## Validación controlada · recursos aún no autorizados

La base local de 480 pruebas está aprobada. El recorrido adicional webhook → cola → worker → Inbox → respuesta → entrega pasa con proveedores simulados (suite de 16 casos). No hay staging creado ni sesiones JWT reales de QA ejecutadas. El rollback vigente sólo verifica la base de seguridad; no restaura privilegios legacy. El 401 histórico y los dos P0001 continúan abiertos por evidencia causal inaccesible mediante REST. Véanse la [propuesta de recursos](release-plan.md), los [casos de aceptación](acceptance-tests.md) y los [límites de recuperación](risks-and-dependencies.md).

## Aceptación de la corrección coordinada

La matriz Dirección fue aprobada por producto el 2026-11-18. Las expectativas se actualizaron después de cambiar código y preparar las políticas SQL. Se mantuvieron controles negativos y se agregaron regresiones.

| Historias | Estado más reciente | Evidencia y siguiente gate |
| --- | --- | --- |
| ID-02, CV-04, QA-01, QA-02 | Aprobadas localmente para el alcance corregido | Dirección consulta sin privilegio automático; revalidación de escritura; RLS local, grants explícitos y protección de perfil. Faltan JWT y esquema completo de staging. |
| WA-02, WA-03, QA-03 | Regresiones locales aprobadas | Entrada única antes del router, reintento tras fallo de Inbox, comandos/botones y métricas por etapa. Los nueve casos históricos no fueron alterados. |
| AC-02, AC-05 | Parcial, autorización local contrastada | SQL decide edición y verificación y se vuelve a consultar al ejecutar. Staging y efectos autorizados pendientes. |
| WA-04 | Continúa abierta | El 401 de función se reproduce localmente; falta atribuir el POST histórico. Se conserva el rechazo seguro del dispatcher. |
| QA-06 | Preparada para revisión | 480 pruebas pasan, build y Edge bundles pasan. Migración reaplicable y rollback probado en PostgreSQL local. Sin autorización ni ejecución de despliegue. |

Los P0001 originales y la validación autenticada en staging bloquean la liberación. Los criterios e IDs originales de las 45 historias y GAP-01–05 se mantienen debajo.

## Resultados de aceptación · ciclo 2

Fecha 2026-11-18. Base `4827181` con cambios locales pendientes de promoción. No se declara ninguna historia liberada. Los siguientes resultados complementan, sin reemplazar, los criterios originales de las tablas.

| Historias | Aceptación C2 | Evidencia y bloqueo |
| --- | --- | --- |
| WA-01 | Parcial en producción, local aprobada | Cola real y pruebas firmadas con mocks. Sin nueva entrega real autorizada ni firma válida contra revisión Edge verificada. |
| WA-02, WA-03 | Parcial; correcciones locales probadas | 48/50 mensajes completados, dos review P0001, 39 entradas correlacionadas por ID. Falta revisar nueve correlaciones y entrega. |
| WA-04 | Bloqueada en producción; autenticación validada localmente | Seis pruebas contra código Edge. Se elimina fail-open y se agrega marca de capa en rechazo. Falta registro exacto del 401 del cron y piloto autorizado. |
| FV-02, FV-03 | Cotejo de lectura parcial | Totales Kanban coincidentes en ocho comparaciones; OKR de dos roles coincide con RPC; otros dos denegados. Sin JWT de usuarios QA ni oráculo de IDs completo. |
| CV-02, CV-04 | Local aprobado para regresiones de R0 | Borrador abierto con source antiguo/nuevo y propagación de error de envío. Falta conversación real correlacionada. |
| ID-01, ID-02, ID-03, QA-02 | Bloqueadas para aceptación integral | Tres fixtures sintéticos adicionales de scope Analista; dos pruebas de moduleAccess fallan por Dirección fuera de OKRS. Sin sesiones de QA autorizadas ni políticas desplegadas exportadas. |
| AC-01, AC-02, AC-03, AC-05, EM-01, CM-01, CM-02 | Evidencia local previa y regresión cubierta, E2E pendiente | Suites de operaciones y borradores pasan dentro de la ejecución ampliada. Sin cambios productivos ni envíos reales. |
| QA-01, QA-03, QA-04, QA-06 | Parcial | 469 passed / 2 failed, build Vercel local exitoso, versión base con deploy success, métricas de cola y propuesta rollback. Hay bloqueos de liberación. |
| FV-01, FV-04, FV-05, ID-04, ID-05, CV-01, CV-03, CV-05, AC-04, KB-01, KB-02, KB-03, KB-04, KB-05, VO-01, VO-02, VO-03, VO-04, VO-05, VO-06, WA-05, QA-05 | Conservan el estado de la auditoría | Sin nuevos recorridos de aceptación completos en C2. Se mantienen los casos, evidencias y dependencias de las tablas originales. |
| GAP-01 a GAP-05 | Sin iniciar | Fuera del alcance de estabilización R0. |

Los nombres, prioridades y criterios de las 45 historias provienen del [Plan de Consolidación](https://app.notion.com/p/41c7f5fdb8aa8028af96fd05c96914b2). Las cinco brechas conservan la referencia al [benchmark RIMEXA](https://app.notion.com/p/41c7f5fdb8aa816b8de6feb9dba377de). Se leyeron las exportaciones Markdown facilitadas por el usuario.

IV = implementada y validada en el alcance del AS-IS; ISV = implementada sin validar; P = parcial; F = fallando; NI = no implementada en el alcance auditado. Estado, brecha, dependencia, días-persona y release recomendado son valoración R0. Responsables por asignar. Fecha de auditoría 2026-11-18; las versiones liberadas quedan por verificar. Una dependencia ya implementada puede satisfacer el alcance mínimo R0 con evidencia local; la historia de consolidación cierra la paridad posterior. Los rangos AT son inclusivos. Ver [inventario](architecture-as-is.md) y [pruebas](acceptance-tests.md).

## E1 · Fuente de verdad

| ID · Funcionalidad | Estado / prioridad | Evidencia | Brecha | Dependencias | Días | Criterio original | Casos AT | Release |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FV-01 · Catálogo de fuentes y entidades | P / P0 | catalog.ts; assistantBoardReads.ts | Inventariar fuentes, campos y dueños por módulo | ID-02 | 3–5 | Tablas, campos, relaciones y responsables | 19 | R1 |
| FV-02 · Consultas Kanban | IV / P0 | assistantOpsRuntime.ts; actionQueryContract.test.ts | Igualdad de IDs, totales y paginación entre canales | ID-02 | 3–5 | Acciones propias, asignadas, creadas, vencidas y por equipo | 01–04 | R1 |
| FV-03 · Consultas OKRs | P / P0 | assistantBoardReads.ts; buildOkrAssistantContext.test.ts | Cotejar objetivos, KRs y avances con UI por rol | FV-01, ID-02 | 3–5 | Objetivos, KRs, avances e iniciativas | 05 | R1 |
| FV-04 · Consistencia y trazabilidad | P / P0 | guideRetellTool.ts; tryFactualAssistantReply.ts | Evidencia y fecha de corte visibles por turno | FV-01, QA-03 | 5–8 | Datos reales, alcance y fecha de actualización | 05, 16, 19 | R1 |
| FV-05 · Analítica operativa | P / P1 | assistantBoardReads.ts; assistantBriefing.ts | Tendencias y señalización de riesgos reproducibles | FV-02, FV-04 | 5–8 | Bloqueos, atrasos, tendencias y riesgos | 05, 17 | R2 |

## E2 · Identidad y permisos

| ID · Funcionalidad | Estado / prioridad | Evidencia | Brecha | Dependencias | Días | Criterio original | Casos AT | Release |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ID-01 · Identificación | P / P0 | assistantAuth.ts; guide_sessions; user_channel_identities | Definir alcance por organización/proyecto y actor canónico | — | 3–5 | Sesión, usuario y organización | 03, 13, 19 | R1 |
| ID-02 · Matriz de permisos | P / P0 | assistantBoardReads.ts; assistant_ops; Inbox RLS | Comparar RLS con credencial privilegiada por módulo y rol | ID-01 | 5–8 | Roles, RLS y alcance por operación | 03, 13, 19 | R1 |
| ID-03 · Identificación por canal | P / P0 | guide-retell-tool.ts; whatsappEdgeRuntime.test.ts | Probar identidad ambigua, revocación y mismo actor por canal | ID-01, WA-01 | 3–5 | Vinculación segura de WhatsApp y voz | 03, 12, 13 | R1 |
| ID-04 · Acceso por liga | P / P1 | guideUserLinks.test.ts; guide-link-report.test.ts | Validar TTL, revocación, consentimiento y aprobación autenticada | ID-01, ID-02 | 3–5 | Sesiones temporales con expiración y permisos | 13 | R4 |
| ID-05 · Auditoría de acceso | P / P0 | assistant_op_log; guide_sessions.consult_log | Correlacionar accesos y cambios con actor y alcance | ID-01, QA-03 | 3–5 | Registro de consultas y modificaciones | 16, 19 | R1 |

## E3 · Motor conversacional

| ID · Funcionalidad | Estado / prioridad | Evidencia | Brecha | Dependencias | Días | Criterio original | Casos AT | Release |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CV-01 · Comandos | IV / P0 | operationalInterpret.test.ts; whatsappInboundWorker.test.ts | Probar paridad de comandos deterministas | FV-02 | 2–4 | Comandos simples sin LLM cuando sea viable | 01–05, 12 | R1 |
| CV-02 · Contexto | P / P0 | actionQueryContract.ts; mergeArgs.ts; whatsappAssistant.test.ts | Persistir consulta activa y cambios de alcance | FV-02, ID-02 | 5–8 | Pronombres, seguimientos y cambio de alcance | 01–04, 11 | R1 |
| CV-03 · Resolución de personas | P / P0 | search_people en assistantBoardReads.ts; assistantOpsRuntime.ts | Desambiguar homónimos y confirmar el ID elegido | ID-01, FV-01 | 3–5 | Desambiguación de nombres | 03, 09, 10 | R1 |
| CV-04 · Gestión de errores | P / P0 | guideToolResult.ts; geminiToolLoop.ts; worker Edge | Probar timeout y fallo por etapa, evitar éxitos falsos | QA-03 | 3–5 | No inventar datos ni ocultar fallos | 11, 12, 14 | R0 |
| CV-05 · Orquestación omnicanal | P / P0 | dispatchCopilotTool; Gemini; Retell; router Edge | Contrato canónico y adaptadores con política explícita | CV-02, ID-02, QA-01 | 8–12 | Servicios y reglas compartidos | 01–05, 20 | R3 |

## E4 · Acciones

| ID · Funcionalidad | Estado / prioridad | Evidencia | Brecha | Dependencias | Días | Criterio original | Casos AT | Release |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AC-01 · Crear acciones | IV / P0 | assistantOpsRuntime.ts; assistant_pending_ops; AssistantProposalCard.tsx | Validar edición y aprobación de extremo a extremo | ID-02, AC-05 | 3–5 | Borrador, responsable, fecha y confirmación | 06 | R2 |
| AC-02 · Actualizar estados | P / P0 | assistantOpsRuntime.ts; whatsapp_apply_action | Probar transiciones Hecho/Verificado con actores diferentes | ID-02, AC-05 | 3–5 | Hecho distinto de Verificado | 07, 12 | R2 |
| AC-03 · Bloqueos y seguimiento | IV / P0 | whatsappInboundWorker.test.ts; whatsappEdgeRuntime.test.ts | Paridad del motivo de bloqueo y del registro de avance | AC-02 | 3–5 | Registrar motivos y avances | 08 | R2 |
| AC-04 · Acciones múltiples | P / P1 | guideWork.ts; reportViewModel.ts; workspaceDraftVoice.ts | Aprobar subconjunto de acuerdos y evitar duplicados al reintentar | AC-01, AC-05 | 5–8 | Propuestas desde acuerdos sin duplicados | 06, 16, 20 | R2 |
| AC-05 · Evidencia | P / P0 | assistant_op_log; whatsapp_action_receipts; assistantPending.ts | Comprobar evidencia y efecto único ante concurrencia | ID-05, QA-03 | 3–5 | Confirmación y registro de operación | 06–10 | R2 |

## E5 · Conocimiento

| ID · Funcionalidad | Estado / prioridad | Evidencia | Brecha | Dependencias | Días | Criterio original | Casos AT | Release |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| KB-01 · Glosario | IV / P1 | operationalDictionary.ts; operationalInterpret.test.ts | Publicar y verificar la misma versión en todos los canales | KB-05 | 2–4 | Términos de Scrumban, Kanban y OKRs | 16, 21 | R3 |
| KB-02 · Documentos | NI / P1 | operationalSemantics; docs/prompts | Ingestión, versiones y metadatos administrables | KB-05, ID-02 | 8–12 | Ingesta, versiones y metadatos | 21 | R3 |
| KB-03 · Recuperación contextual | NI / P1 | assistantBoardReads.ts; consult_log para datos vivos | Recuperar conocimiento autorizado con referencia al origen | KB-02, KB-04 | 5–8 | Respuesta con referencia al origen | 21 | R3 |
| KB-04 · Gobierno documental | NI / P1 | operationalDictionary.ts versionado en Git | Revisión, publicación y retiro documental | KB-02, ID-02 | 5–8 | Revisión, publicación y retiro | 21 | R3 |
| KB-05 · Separación de fuentes | P / P0 | assistantBoardReads.ts; operationalDictionary.ts; assistantPrompts.ts | Etiquetar procedencia y resolver conflictos con datos vivos | FV-01 | 2–4 | Datos vivos vs. conocimiento metodológico | 05, 21 | R1 |

## E6 · Voz

| ID · Funcionalidad | Estado / prioridad | Evidencia | Brecha | Dependencias | Días | Criterio original | Casos AT | Release |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VO-01 · Voz a texto | ISV / P1 | assistant-transcribe.ts; useSpeechRecognition.ts | Revisión y fallback real por navegador | QA-04 | 3–5 | Transcripción revisable | 14 | R4 |
| VO-02 · Texto a voz | ISV / P1 | assistant-audio.ts; elevenLabsTtsClient.ts | Reproducción, interrupción y error de audio en navegador | QA-04 | 2–4 | Lectura de respuestas | 14 | R4 |
| VO-03 · Voz a voz | P / P1 | useRetellGuideCall.ts; guide-retell-web-call.ts; retell-voice-latency-baseline.md | Validar modelo publicado, tools, primer audio y turnos | CV-05, QA-04 | 5–8 | Conversación de baja latencia | 14, 20 | R4 |
| VO-04 · Voz por liga | P / P1 | GuideVoiceInvitePage.tsx; guide_user_links | Probar recorrido público y revocación | ID-04, VO-03 | 3–5 | Sesión compartible segura | 13, 14 | R4 |
| VO-05 · Reporte de sesión | IV / P1 | finalizeGuideInterview.ts; guideInterviewReport.test.ts; guideReportSanitize.test.ts | Validar finalización única y procedencia con llamada real | ID-05, VO-03 | 3–5 | Transcripción, hallazgos y acuerdos | 14, 16 | R4 |
| VO-06 · Recuperación | P / P1 | useRetellGuideCall.ts; guideSessionClock.test.ts; guideToolResult.ts | Probar interrupción, reconexión y recuperación de contexto | VO-03, CV-04 | 5–8 | Interrupciones, errores y reconexión | 14 | R4 |

## E7 · Comunicaciones

| ID · Funcionalidad | Estado / prioridad | Evidencia | Brecha | Dependencias | Días | Criterio original | Casos AT | Release |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WA-01 · Webhook entrante | IV / P0 | whatsapp-webhook/index.ts; whatsappIngress.test.ts; logs 503→200 | Verificar versión, configuración y replay firmado | — | 1–3 | Corregir 503 y validar eventos | 12, 15 | R0 |
| WA-02 · Worker y colas | P / P0 | whatsapp_inbound_jobs; schedule_whatsapp_inbound_worker.sql; whatsappInboundWorker.test.ts | Medir drenado, reintentos y efecto único | WA-01, QA-03 | 3–5 | Autenticación, reintentos e idempotencia | 12, 15 | R0 |
| WA-03 · WhatsApp bidireccional | P / P0 | whatsapp-assistant.ts; whatsappEdgeRuntime.test.ts; whatsappAssistant.test.ts | Correlacionar versión, Inbox, respuesta y entrega | WA-02, CV-04 | 3–5 | Consultas y comandos con respuesta | 01, 05, 11, 12 | R0 |
| WA-04 · Botones y recordatorios | P / P0 | whatsapp-followup-dispatcher/index.ts; whatsapp_followup_jobs; whatsappInboundWorker.test.ts | Aislar el 401 y validar recordatorios/botones | WA-02, AC-03 | 3–5 | Respuestas rápidas y estados | 08, 12, 15 | R0 |
| WA-05 · Paridad de flujos | P / P1 | whatsapp-assistant.ts en lectura; RPCs de botones | Definir y demostrar paridad por permiso, con aprobación | WA-03, CV-05, CM-02 | 5–8 | Mismas operaciones que en chat web | 01–12, 20 | R3 |
| EM-01 · Correo operativo | P / P1 | assistantOpsRuntime.ts; assistantCommunicationFlow.test.ts; assistant_person_email | Ruta Kanban, edición y aprobación con destinatario autorizado | CM-02, CV-03 | 5–8 | Borrador, revisión, aprobación y envío | 10 | R2 |
| CM-01 · Envíos desde canales | P / P1 | workspaceDraftVoice.ts; assistantCommunicationDrafts.ts; guide-queue-workspace-draft.ts | Misma resolución y borrador; voz real en R4 | EM-01, CM-02, AC-05 | 5–8 | Solicitar comunicaciones desde texto o voz | 09, 10, 20 | R2 |
| CM-02 · Control de envíos | P / P0 | assistantPending.ts; assistant_pending_ops; workspaceDraftVoice.test.ts | Auditoría, revalidación de dueño y destino y efecto único | ID-02, AC-05, QA-03 | 5–8 | Destinatarios, deduplicación y auditoría | 09–11, 13 | R2 |

## E8 · Calidad y gobierno

| ID · Funcionalidad | Estado / prioridad | Evidencia | Brecha | Dependencias | Días | Criterio original | Casos AT | Release |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-01 · Pruebas de contratos | IV / P0 | 68 suites R0; actionQueryContract.test.ts; enviardianAuditScenarios.test.ts | Matriz reproducible de contratos por canal | — | 2–4 | Interfaces y servicios compartidos | 01–16 | R0 |
| QA-02 · Pruebas de permisos | P / P0 | assistantAuth.test.ts; guide-link-report.test.ts; whatsappEdgeRuntime.test.ts | Pruebas pareadas JWT/service role y límites de proyectos | ID-01, ID-02 | 5–8 | Aislamiento entre usuarios y organizaciones | 03, 13, 19 | R1 |
| QA-03 · Observabilidad | P / P0 | WHATSAPP_REPLY_SENT; assistant_op_log; guideToolResult.ts | Correlación y latencia por etapa con códigos de error | WA-01, ID-01 | 5–8 | Trazabilidad extremo a extremo | 12, 14–16, 22 | R0 |
| QA-04 · Evaluación del agente | P / P0 | enviardianAuditScenarios.test.ts; retell-voice-latency-baseline.md | Golden set y métricas repetibles; evaluación cruzada en R5 | QA-01, QA-03, FV-04 | 5–8 | Exactitud, ejecución y latencia | 01–16, 20 | R1 |
| QA-05 · Costos | P / P1 | gemini-chat.ts; usageMetadata | Atribuir costo por canal, modelo y periodo | QA-03 | 3–5 | Consumo por canal y modelo | 22 | R5 |
| QA-06 · Releases | P / P0 | vercel.json; bundle-api.mjs; runbooks Retell y WhatsApp | Gates de versión y rollback en R0; piloto progresivo en R5 | QA-01, QA-03 | 3–5 | Pilotos, monitoreo y rollback | 12, 15, 22 | R0 |

## Brechas RIMEXA

Estas extensiones se vinculan con las historias base, que por sí solas no cubren el resultado completo del benchmark.

| ID · Funcionalidad | Estado / prioridad | Evidencia y brecha | Dependencias | Días | Criterio original | Caso | Release |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GAP-01 · Recomendaciones proactivas y accionables | P / P1 | GuideReportBody.tsx y guideWork.ts aportan recomendaciones de sesión. Falta motor determinista, deduplicación, vigencia y rastro de decisiones. | FV-05, AC-04, AC-05 | 8–12 | Una acción vencida, una pendiente de verificación y una reprogramada reiteradamente generan recomendaciones pertinentes sin duplicados; el usuario puede aceptar o descartar y auditar el resultado. | AT-17 | R3 |
| GAP-02 · Reportes recurrentes creados por conversación | NI / P1 | guide-report.ts, cron y calendario son reutilizables. No se identificó programación conversacional con borrador, zona horaria, edición/pausa e historial. | FV-04, CM-02, QA-03 | 8–13 | El reporte se crea tras aprobación, aparece en una vista de programados, respeta permisos y genera evidencia de cada ejecución. | AT-18 | R3 |
| GAP-03 · Widgets y tableros generados desde lenguaje natural | NI / P1 | get_dashboard_summary y get_module_data consultan datos; no se identificó creación conversacional de widgets persistentes. | FV-04, ID-02, CV-05 | 8–13 | Widget creado desde una pregunta, se actualiza con datos reales, respeta el rol y puede editarse/eliminarse. | AT-23 | R5 |
| GAP-04 · Simulador WhatsApp y trazabilidad de respuestas | P / P1 (QA prioritario) | whatsappInboundWorker.test.ts y whatsappEdgeRuntime.test.ts simulan eventos. Falta superficie de inspección por rol, fuente, identidad, intención, filtros y errores. | QA-01, QA-02, QA-03, WA-02 | 5–8 | Pruebas reproducibles de «Mis acciones», «Las que asigné», «¿Cuáles tiene Jorge?» y «Realizada / En proceso / Bloqueada» sin enviar mensajes reales ni vulnerar permisos. | AT-24 | R3 |
| GAP-05 · Consola de administración y observabilidad de IA | P / P2 | Ajustes WhatsApp e Inbox más logs distribuidos; falta consola transversal de salud, prompts, herramientas, modelos, fallos y costos. | QA-03, QA-05, QA-06 | 8–13 | Administrador detecta fallos 503/401, identifica etapa afectada y consulta métricas sin exponer secretos ni datos fuera de su alcance. | AT-22 | R5 |

El benchmark evalúa una demo y una propuesta comercial. Los estados de la tabla corresponden al repositorio de Scrumban.
