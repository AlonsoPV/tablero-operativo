# Enviardián · incidentes, riesgos y dependencias

## QA local R1/R2 · hallazgos · 2026-11-19

Rama local `qa/supabase-local` (base `2303bb9`), Supabase local en WSL2 con dos instancias aisladas y cuentas sintéticas. Detalle y evidencia en `qa-r1-r2.md`. Ningún hallazgo se corrigió en esta sesión.

| ID | Hallazgo | Severidad | Tratamiento |
| --- | --- | --- | --- |
| QA-R1-01 | `capabilityFingerprint()` (`api/_shared/query/actorCapabilities.ts`) concatena todas las capacidades verdaderas. Para Super Admin mide 212 caracteres y para Área OKRS 170, y el CHECK `char_length(capability_fingerprint) <= 128` de `agent_session_context` (`20261119140000`) rechaza el upsert con un 400 silencioso. `get()` devuelve null si no hay fila y no usa la memoria de respaldo. Efecto: esos perfiles pierden el formato persistido («modo reporte») y las referencias («esa acción»). Dirección (80) y Líder (30) no se ven afectados | Alta. Bloquea R1 | Propuesta, no aplicada: guardar un hash (sha256 hex, 64 caracteres) en lugar de la lista, o ampliar el CHECK. Repetir F4 y R2-A2 de `run-api-matrix.mjs` |
| QA-R1-02 | En la web, `runConversationTurn` (`AiAssistPage.tsx`) resuelve en el cliente muchas preguntas reconocidas sin llamar a `/api/gemini-chat` e ignora `responseFormat`. Interpreta «modo reporte» y «automático» como nombres de persona | Alta para formatos R1 | Enviar las directivas y el formato elegido al servidor, o aplicarlos también en el camino del cliente. Por API los formatos y las directivas funcionan |
| QA-R1-03 | A 390 px la opción «Análisis» del selector queda recortada en el borde derecho; se puede pulsar | Baja (cosmético) | Ajuste de CSS (envolver o desplazar) |
| QA-R2-01 | `executionMode.ts` sólo reconoce referencias `*.supabase.co`; contra Supabase local el modo `qa` del servidor queda desactivado | Media para liberar R2 | La puerta en BD y la RPC sí se validaron con JWT reales (JWT-01 a JWT-16). La confirmación HTTP con el ejecutor `qa` necesita un entorno QA reconocido, o una excepción local explícita y revisada |
| QA-DB-01 | `get_operational_okr_dashboard` (`20260820120000`, línea 334) usa `accion_evidencias.created_at`, pero la columna es `uploaded_at` (error 42703) | Media, fuera del alcance R1/R2 | Determinar si es una deriva del esquema o un defecto previo del tablero, comparando con DEV en sólo lectura |
| R2-15 | El historial de migraciones no se aplica limpio desde cero: super_admin asignado a un UUID real fijo (`20260313190000`), `ALTER TABLE auth.users` sin ser dueño (`20260601170000`), cambio de tipo de retorno de `try_set_accion_hecho` (`20260625161411`) y `cron.schedule` hacia DEV/PROD (`20260629201032`, `20261103121000`, `20261104140000`) | Media | `scripts/qa/local/prepare-instance.mjs` parchea sólo la copia de cada instancia y verifica que cada parche aplica exactamente una vez. Las migraciones originales no cambian |
| QA-ENV-01 | Supabase local escucha en `0.0.0.0` dentro de la red NAT de WSL | Baja | Sólo datos sintéticos. Detener las instancias al terminar |

## Integración R1 y R2 local · riesgos y dependencias · 2026-11-19

**Dependencias verificadas (sólo lectura).** Las 49 funciones de las migraciones de noviembre coinciden entre local, DEV y PROD. `135000` y su rollback son idénticos en R1 y en el hotfix. La fusión de R1 con el hotfix no tuvo conflictos y `136000` convive con A, que se prueba en ambos runners. No se encontró ninguna incompatibilidad de seguridad.

| ID | Riesgo | Severidad | Tratamiento |
| --- | --- | --- | --- |
| R2-01 | Los copilotos actuales siguen ejecutando por su ruta vigente mientras `COPILOT_R2_GATE` esté apagado | Media | **Mitigado en código (rama `r2/qa-consolidacion`):** con el flag, `create_action`, `update_action`, `add_action_comment`, `update_checklist_item`, `mark_action_done` y `verify_action` pasan por la puerta R2 en el mismo `confirmPendingOp`. El flag está apagado por defecto y nunca se enciende en producción; validar en QA antes de cualquier sustitución. Las comunicaciones del copiloto no cambian de ruta |
| R2-02 | Las pruebas R2 son simuladas: Supabase en memoria y RPC en JS con las mismas reglas | Alta para liberar | La RPC SQL se prueba aparte en PGlite (20 checks). Falta aplicarla en QA y ejecutar `scripts/qa/run-jwt-suite.mjs` con JWT reales |
| R2-03 | El trigger de estados reserva `causa_raiz` a la edición general | — | **Resuelto:** el agente nunca escribe `causa_raiz`, ni con edición general. La causa reportada queda como comentario `bloqueo_reportado` («Causa reportada: …»), separada de una causa raíz validada |
| R2-04 | `request_key` es permanente para operaciones confirmadas | Baja | Repetir exactamente la misma creación (mismo título, responsable y fecha) se rechaza como duplicado; el aviso se deduplica por día. Las claves de propuestas canceladas o vencidas se liberan |
| R2-05 | `can_edit_accion_general_as` se invoca con el JWT del usuario en la propuesta; R0 sólo concedió explícitamente a `service_role` | Media | Si `authenticated` no tiene EXECUTE en un entorno, la propuesta se niega (falla cerrada). Verificar el ACL en QA |
| R2-06 | `confirmPendingOp` registra `conflict` y después `error` en el mismo conflicto | Baja | Comportamiento previo, sin cambios; documentado en la prueba |
| R2-07 | El ejecutor `rpc` con proveedores reales | — | **Retirado.** Lo sustituye el ejecutor `qa` (JWT del usuario, avisos sólo en `qa_outbox`), alcanzable únicamente en modo `qa` |
| R2-08 | Dirección con privilegio explícito de administrador puede ejecutar en SQL, mientras la matriz TS la clasifica por perfil | Baja | Coherente con «Super Admin acumulativo»; Dirección sin privilegio queda negada en ambas capas |
| R2-09 | Ruta directa: un usuario podía fijar su propia operación en `executing` por PostgREST (política update-own) y llamar la RPC sin pasar por `confirmPendingOp` | Alta | **Corregido en `20261120120000`:** puerta en BD `agent_execution_allowed()` (cerrada salvo seed QA), reserva sólo por `agent_claim_pending_op` con `claimed_at`, trigger que impide a clientes fijar `executing` en operaciones `agent_*` o escribir `claimed_at`, y `claimed_at` limpio al volver a `pending`. Límite residual: con la puerta abierta (QA), quien llame directamente claim + RPC sigue sujeto a las mismas reglas SQL (dueño, rol, responsable o edición general, CAS, Verificado) |
| R2-10 | Área OKRS con base Analista podía confirmar su propia operación (`confirm: own`) aunque no podía proponerla; afectaba a un cambio de rol entre propuesta y confirmación | Media | **Corregido:** `R2_PHASE_MATRIX.okrs_area.confirm = 'role'`; la confirmación sigue la misma base que la propuesta. Cubierto en `copilotR2Gate.test.ts` |
| R2-11 | La Guía (`persistGuideWork`) insertaba acciones, checkpoints e iniciativas fuera de la puerta R2 | Cerrada | `persistGuideWork` ya no escribe. Si no hay duplicado abierto, devuelve error y no llama a `insert`. Crear trabajo sigue requiriendo la confirmación de R2 |
| R2-12 | `tipo_comentario='bloqueo_reportado'` no está en `COMMENT_TYPE_OPTIONS` | Baja | Compatibilidad: la UI muestra el comentario sin etiqueta, como uno normal, y la exportación lo marca «Sin clasificar». La edición desde la UI sólo cambia el contenido y conserva el tipo. Añadir la etiqueta es un cambio de UI pendiente de decisión |
| R2-13 | El modo `qa` se activa con variables del servidor en un despliegue de QA (preview permitido, producción no) | Media | Cuatro condiciones en servidor + puerta en BD + comprobación de `agent_execution_environment()` contra la referencia configurada. Activarlo requiere autorización expresa |

**Integración.** Para reflejar Supabase, el runner R1 ahora lee `auth.role()` del claim JWT; antes usaba `current_user`, lo que dentro de funciones definer devolvía el dueño. En un worktree limpio, vitest necesita variables Supabase ficticias.

## R1 complemento · diagnóstico de sólo lectura en DEV y PROD · 2026-11-19

Consultas SELECT por MCP en DEV (`tgiuevzlyptzlfgxsfhj`) y PROD (`xhpasmjzuwifmjhrsumb`). No se modificaron datos, permisos, usuarios ni migraciones. No se registran teléfonos, correos ni mensajes.

| ID | Riesgo | Evidencia | Severidad | Tratamiento propuesto (local, sin aplicar) |
| --- | --- | --- | --- | --- |
| RD-01 | Cualquier usuario autenticado puede darse `rol='super_admin'`, reactivarse o cambiar su `user_id` | En DEV y PROD, `authenticated` y `anon` tienen UPDATE sobre `usuarios`; la política `usuarios_update_own_or_admin` permite editar la fila propia y no hay trigger que proteja `rol` ni `activo` | Crítica | P0: `20261119135000_guard_usuarios_privileges.sql`. Sólo Super Admin, admin de app, DG o Sistemas, activos, cambian `rol`, `activo`, `id` o `user_id`; revoca UPDATE de `anon`. En PROD sólo pierde esa capacidad «Kanban» (Dirección, RH, no administrador). |
| RD-02 | Los inactivos con cuenta de auth vigente siguen leyendo datos | PROD: dos inactivos (G. Puga, segunda cuenta con rol y catálogo super_admin; Hector, Líder) con cuenta sin ban y sin acceso desde octubre. `get_my_usuario_id` no filtra `activo`; 55 políticas SELECT permisivas en unas 47 tablas lo ignoran; no hay políticas restrictivas | Alta | Banear las dos cuentas en Auth (operación manual autorizada) y aplicar RC-05: `20261119150000_inactive_users_rls.sql`. |
| RD-03 | El rol de catálogo `super_admin` está repartido más allá de la administración | PROD: 9 de los 10 miembros del área OKRS lo tienen, incluidos 4 Líderes y un usuario de Dirección. DEV: 7 titulares, dos con rol Operativo | Alta | Revisar por usuario (matriz en `release-plan.md`). Si sólo necesitan OKRs o WhatsApp, cambiarlo por un rol con `okrs_admin` o `whatsapp_*`. En Dirección contradice «no ampliar permisos de Dirección». |
| RD-04 | La UI y el agente (TS) no reconocían el `super_admin` de catálogo que SQL sí cuenta | `resolveAccessCapabilities` sólo leía el rol y `app_role` | Media | Corregido localmente: `catalogSuperAdmin` en `permissions.ts`, `actorCapabilities.ts`, `assistantAuth.ts` y `useAccessCapabilities.ts`, más dos perfiles de paridad. |
| RD-05 | En PROD, `can_manage_catalogs` aún incluye Dirección | Definición remota previa a R0 | Media | Se cierra con R0 (`20261118150000`). P0 no usa `can_manage_catalogs`. |
| RD-06 | El historial de migraciones no refleja el esquema real | La última versión registrada es DEV `20260819234939` y PROD `20260821055806`, pero existen objetos de noviembre aplicados a mano | Media | Reconciliar el historial antes de aplicar P0, RC-05, R0 o A con la CLI. |
| RD-07 | Hay cuentas de auth sin fila en `usuarios` | PROD: dos cuentas, sin acceso en 60 días; con las políticas actuales leen lo que permiten las reglas sin `activo` | Baja | RC-05 las bloquea (no hay fila activa). Confirmar que no son cuentas de servicio antes de aplicarlo. |

**Confirmado sin cambios.** `user_roles` y las tablas de catálogo están protegidas por `is_super_admin` y `can_manage_catalogs`. Super Admin conserva todos sus permisos por cualquiera de sus tres vías (rol, `app_role`, catálogo). Dirección conserva la lectura ejecutiva: la suite comprueba que, tras RC-05 y B, lee todos los OKRs y no escribe.

## R1 complemento · riesgos residuales y dependencias · 2026-11-19

| ID | Riesgo | Severidad | Tratamiento |
| --- | --- | --- | --- |
| RC-01 | Al aplicar B, los miembros del área OKRS pierden la administración de OKRs y WhatsApp que heredaban | Alta | B no se aplica hasta ejecutar la auditoría, aprobar la matriz y asignar los módulos. Rollback: `legacy_okrs_area_grants()` vuelve a true. |
| RC-02 | RH (`can_manage_org_hierarchy`) y los administradores siguen pudiendo asignar el área OKRS. La pertenencia a RH se identifica por nombre | Media | Sin cambio: es una función de administración vigente. Lo prueba la suite SQL. Decidir si RH debe asignar áreas funcionales. |
| RC-03 | Sin registro histórico de quién asignó el área OKRS: miembros actuales pudieron autoasignarse antes de A | Media | La auditoría separa la pertenencia relacional de la de texto. Revisar cada miembro antes de asignarle módulos. |
| RC-04 | WhatsApp, voz y el agente usan `service_role`; aplican las capacidades en la aplicación, no por RLS | Media | `loadAgentCapabilities` lee cada turno los datos del servidor; ante un error cae a capacidades sólo por rol, nunca más amplias. |
| RC-05 | La regla SQL vigente de lectura de `acciones_diarias` deja a un inactivo no Analista leer acciones | Media | Confirmado en PROD (RD-02). Propuesta local: `20261119150000_inactive_users_rls.sql`, con políticas restrictivas de SELECT en las tablas operativas (detalle en `release-plan.md`). |
| RC-06 | Un Super Admin sin fila en `usuarios` no obtiene capacidades SQL de WhatsApp | Baja | Las rutas existentes ya exigían fila activa. Documentado. |
| RC-07 | Si no existe exactamente un área «OKRS», `system_key` queda vacío y nadie hereda acceso | Baja | La auditoría lista las filas; con más de una, decidir a mano antes de A. |
| RC-08 | La rehidratación del contexto sólo conserva referencias que el usuario puede releer (máx. 12) | Baja | Por diseño: preferir perder contexto a mostrar datos ya no autorizados. |
| RC-09 | `get_action_details` sobre acciones ajenas sigue restringido para Analistas del área OKRS | Baja | No se amplió. Ven las acciones en listas y agregados; el detalle de una acción ajena queda pendiente de decisión. |

**Dependencias R0.** El complemento usa `is_current_user_direction`, `can_manage_catalogs` y la guarda Dirección de `20261118150000`. Hasta que R0 supere sus validaciones remotas no se integra ni se aplica. El runner R0 sigue aprobado tras el complemento.

**Riesgos R1 anteriores resueltos localmente:** el gate de OKR de Dirección (ahora `readAllOkrs`) y el contexto en memoria por instancia (ahora `agent_session_context`). Ambos requieren aplicar la migración A en QA.

## R1 · riesgos y dependencias nuevos · 2026-11-19

| Riesgo o dependencia | Severidad | Tratamiento |
| --- | --- | --- |
| R1 depende de la matriz Dirección de R0 (migración `20261118150000`, `permissions.ts`, `assistantAuth.ts`) | Alta | R1 está ramificado sobre `r0/estabilizacion`. No se integra hasta cerrar R0; si R0 cambia, rebase y repetir la suite. |
| Paridad RLS/JWT sin probar | Alta | La suite usa el runtime real sin RLS. Ejecutar AT-19 en QA con las diez cuentas propuestas antes de activar el flag. |
| Gate de módulo OKR niega a Dirección sin módulo `okrs` en su rol de catálogo | Media | No se amplió permiso. Requiere decisión de producto: asignar el módulo por catálogo o ajustar el gate con revisión de seguridad. |
| Contexto en memoria por instancia (serverless) | Media | Correcto por turno; puede perderse entre instancias en web/WhatsApp. Voz rehidrata desde `consult_log`. Persistencia compartida antes de activar. |
| Auditoría de consultas requiere migración no aplicada | Media | Sin la migración, el insert falla y se registra sólo el código de error, sin bloquear la respuesta. Aplicar sólo en QA y después con autorización. |
| WhatsApp y voz usan cliente `service_role` | Media | Comportamiento existente. La matriz añade una guarda previa, no sustituye la RLS. No se expone `service_role` al cliente. |
| Divergencia entre el orquestador y el LLM del canal | Media | Ambos usan `dispatchCopilotTool`. Las intenciones no reconocidas siguen por el LLM; medir qué fracción atiende cada ruta en QA. |
| Cambio de respuesta ante turno LLM vacío (502 → 200 con mensaje) | Baja | Aplica sin flag en esta rama. El cliente recibe `degraded: true`; revisar el manejo en UI antes de integrar. |

Sin cambios en producción, proveedores, Retell, migraciones remotas ni envíos. R1 no alteró los incidentes R0 abiertos (401, dos P0001, nueve correlaciones).

## Conciliación final y dependencias externas · 2026-11-19

### Dos P0001: hechos confirmados y límites

Lectura GET de filas y recibos al 2026-11-18 23:03:39 UTC; clasificación sin imprimir textos al 2026-11-19 14:38:34 UTC:

| Job | Solicitud del botón | Estado actual de la acción observada | Efectos confirmados |
| --- | --- | --- | --- |
| b5188f3f-020e-4f6e-b21f-df3fd053993e | action/done | En_Ejecucion; updated_at anterior al job; completed_at NULL; 0/4 checkpoints completados. | Una entrada Inbox, un recibo externo y una salida delivered que coincide exactamente con el aviso de fallo, sin confirmación de cierre. Cero recibos de mutación por evento y por acción. |
| 2e1aa063-aad8-42cc-8b74-b79cb3147afd | action/done | Pendiente; updated_at anterior al job; completed_at NULL; 0/4 checkpoints completados. | Mismos efectos de mensajería y ausencia de recibos de mutación. |

Ambos conservan review/provider_request/database_P0001, attempts=1 y effect_started=true. El parser existente identifica la solicitud; no demuestra la ruta exacta de la versión histórica. El responsable actual coincide con el emisor vinculado. La ausencia de cierre observado no demuestra que nunca hubiera otro efecto o una reversión histórica. El aviso entregado **no es un falso éxito**.

El wrapper conserva sólo database_ + código y la cola no guarda sentencia/DETAIL/HINT originales. P0001 puede proceder de distintos RAISE, triggers o RPC; no se atribuye una causa a partir del código. El laboratorio añadido demuestra atomicidad ante un P0001 sintético, no la sentencia original.

**Tratamiento propuesto, no autorizado ni ejecutado:**

1. Conservar sin cambios jobs, payloads, entradas, respuestas y estados Meta mientras se recupera evidencia y se valida QA. No reintentar ni confirmar done artificialmente.
2. Buscar error/statement/contexto original y snapshot en consola SQL/logs de sólo lectura. Clasificar efectos por tabla, incluso sesiones/result requests/seguimientos, antes de cerrar atribución.
3. Si no hay evidencia histórica recuperable, presentar excepción explícita: la intención de cierre no se considera satisfecha; el aviso de error ya fue entregado y no se reenvía. Aceptar el riesgo sólo tras pasar QA y comprobar que no quedan efectos no conciliados.
4. Una eventual resolución productiva requiere aprobación separada: transacción CAS sobre los dos IDs, todavía review/attempts=1/effect_started=true, snapshot de evidencia y anotación auditable en metadata. Proponer status failed + stage reconciled_no_replay, conservando database_P0001, event_key, payload original y effect_started. **Nunca done ni pending.** Esto es una propuesta, no un script ejecutado.
5. Antes de esa transacción comprobar de nuevo pendientes por emisor y cron: retirar review puede desbloquear trabajos posteriores automáticamente. En la lectura referida había cero pendientes posteriores para cada emisor; no se presume que siga siendo cierto. La anotación incluirá aprobador, fecha, resultado observado y hashes; rollback no reencola ni reenvía.

### 401 histórico: recuperación y excepción posible

Mecanismos utilizados: logs/SQL aportados por el operador, código/config/cron del repo, sonda GET histórica con execution ID (405) y consulta REST GET a net._http_response. Esta última sigue 406/PGRST106: el esquema no está expuesto. No hay herramienta Supabase/gestión de logs conectada ni acceso SQL directo autorizado disponible en esta sesión. No se cambió exposición de esquemas, gateway, secretos o cron y no se ejecutó un POST al dispatcher productivo.

La sonda GET sólo prueba que ese GET alcanzó la función. verify_jwt=false en el repositorio no demuestra el valor del despliegue histórico. **Gateway, credencial del cron y rechazo interno siguen sin atribución definitiva.**

Acceso preciso pendiente: operador con consola SQL existente ejecuta supabase/scripts/audit_agent_r0_readonly.sql y exporta exclusivamente resultados; logs de POST 401 de whatsapp-followup-dispatcher del 2026-11-17/18 con request/execution ID, revisión Edge y resultado pg_net correlacionado. Para P0001, ventanas y IDs de la tabla de recuperación inferior. El script ahora cubre predicados nuevos, owners, ACL, CREATE, triggers y políticas administrativas/Storage. No exportar cron.command, Vault, tokens ni cuerpos de mensajes.

Si la búsqueda autorizada demuestra que expiró la retención, documentarlo. Después reproducir en QA las credenciales válidas, ausencia/mismatch y rechazo Gateway controlado; adjuntar clasificación y hash/revisión. Sólo entonces solicitar excepción de **atribución histórica**, no declarar causa conocida ni eximir autenticación funcional. Aún no se ha aprobado esa excepción ni realizado reproducción en staging.

Las nueve omisiones históricas continúan documentadas, sin backfill ni reenvíos. Ni ellas ni los dos avisos P0001 justifican un replay.


## Validación controlada · estado vigente

El desarrollo local está aprobado. La prueba adicional integral webhook/worker/Inbox/respuesta/entrega pasó dentro de 16 tests con proveedores simulados. El rollback anterior que restauraba autorizaciones legacy se retiró: ahora sólo verifica la base de seguridad aprobada y no cambia definiciones, ACL ni search_path. La reversión de aplicación requiere artefactos compatibles con esa base.

Se detectaron tres migraciones con cron y destinos productivos. El plan de QA las excluye y exige revisar hooks externos antes de importar el esquema. La propuesta contiene dos proyectos Supabase, diez cuentas sintéticas, runner local, ventana de 48 h y estimación de costo; los recursos no se han creado. Véase [propuesta de recursos](release-plan.md).

### Recuperación de logs pendiente por acceso técnico

La lectura REST más reciente a net._http_response sigue respondiendo 406/PGRST106. Los jobs originales continúan review/provider_request/database_P0001, attempts=1 y effect_started=true. Los metadatos no contienen la sentencia ni el mensaje PostgreSQL original. No se modificó el esquema net ni se ejecutó un POST al dispatcher.

El operador puede ejecutar [el diagnóstico SQL de sólo lectura](../../supabase/scripts/audit_agent_r0_readonly.sql) desde una sesión de consola ya autorizada y exportar únicamente los campos de resultado. Para logs Edge:

| Incidente | Filtro de recuperación | Evidencia mínima |
| --- | --- | --- |
| Dispatcher 401 | Función whatsapp-followup-dispatcher, POST, status 401; revisar desde 2026-11-17 y correlacionar con cron | Timestamp, execution/request ID, revisión de función y error/código de respuesta si el registro existe. |
| Job 2e1aa063-aad8-42cc-8b74-b79cb3147afd | whatsapp-webhook, 2026-11-18 16:17–16:21 UTC (10:17–10:21 CDMX) y búsqueda por ID | Error PostgreSQL, contexto/statement o RPC y ejecución correlacionada. |
| Job b5188f3f-020e-4f6e-b21f-df3fd053993e | whatsapp-webhook, 2026-11-18 06:00–06:04 UTC (00:00–00:04 CDMX) y búsqueda por ID | Misma evidencia, sin reenviar ni cambiar el estado. |

Las invocaciones Edge no conservan por defecto cuerpos de solicitud/respuesta y sólo registran parte de los encabezados. Buscar errores y logs personalizados cuando existan, además del net response retenido. Si no se conserva esa evidencia, registrar el límite de recuperación y mantener el incidente causal abierto; no reconstruir una causa como hecho. La retención depende del plan, que no se ha verificado. [Logs Edge](https://supabase.com/docs/guides/functions/logging), [retención por plan](https://supabase.com/pricing)

Las nueve correlaciones históricas permanecen documentadas en la sección correspondiente. No se ejecutó backfill ni reenvío.

## Revisión final de preparación · 2026-11-18

Se repitieron las 480 regresiones focalizadas, todas aprobadas. Una auditoría adversarial adicional reprodujo influencia de una tabla temporal `user_roles` sobre un helper SECURITY DEFINER del laboratorio. La migración ahora fija `pg_catalog, public, pg_temp` tanto en los predicados nuevos como en sus dependencias de autorización. Se verificó que la tabla temporal ya no cambia el resultado. El preflight rechaza CREATE de anon/authenticated en public y propietarios de funciones que esos roles puedan asumir.

Se añadió la validación de Dirección inactiva con app_role admin: requiere perfil activo y no puede reactivarse por autoedición. La detección para políticas restrictivas también cubre Dirección asignada por catálogo, incluso con otro rol primario. Los intentos de autoasignar Super Admin se rechazan. Son correcciones locales con prueba negativa previa y positiva posterior; no se aplicaron a producción.

El rollback se sustituyó por una comprobación de sólo lectura que conserva íntegramente funciones, ACL, políticas y guards aprobados. La reversión de aplicación usa un artefacto de seguridad compatible; si no está disponible se prepara una corrección hacia adelante.

Lectura final de los dos jobs originales: ambos siguen review/provider_request, database_P0001, attempts=1 y effect_started=true. El acceso a metadatos net._http_response mediante REST devolvió HTTP 406/PGRST106: el esquema net no está expuesto. Por tanto el 401 histórico requiere el registro de lectura desde SQL/logs del operador; no se realizó un POST al dispatcher ni se expuso el esquema.

**Decisión vigente: GO para pruebas locales; staging preparado pendiente de autorización de recursos/cuentas; NO-GO para producción.** Persisten el diagnóstico causal de 401/P0001 y la validación JWT con esquema completo y cuentas sintéticas en staging.

## Corrección coordinada · decisiones y riesgos vigentes

El criterio de producto está aprobado: Dirección consulta Kanban y OKRs del proyecto autorizado, sin autoridad administrativa por su rol. Se implementó localmente la separación de lectura y gestión, con predicados SQL por acción en propuesta y ejecución. Las pruebas contradictorias se actualizaron después de preparar las funciones y guardas correspondientes. Las expectativas negativas se conservaron o ampliaron.

### Cambios revisables

- `permissions.ts` / `moduleAccess.ts`, formulario de acciones y controles administrativos de retos: retiran accesos implícitos de Dirección a administración, edición global e Inbox/configuración. La pertenencia OKRS o un grant administrativo independiente siguen siendo autorizaciones explícitas distintas.
- `assistantAuth.ts`: permite consultas de Dirección activa. `assistantOpsRuntime.ts`: consulta los predicados existentes de edición/verificación y los revalida antes de ejecutar.
- [Migración](../../supabase/migrations/20261118150000_direction_executive_scope.sql): separa lectura ejecutiva OKR, consulta AI, privilegio de acción, catálogos, jerarquía, retos, gamificación y administración de equipo. Las políticas restrictivas impiden que políticas permisivas antiguas vuelvan a conceder escrituras de configuración. Un trigger impide usar el perfil propio para autoasignarse rol/área/identidad/activación.
- [Rollback](../../supabase/scripts/rollback_direction_executive_scope.sql): verifica en modo de sólo lectura la base de seguridad; no restaura predicados previos ni retira guards. Se comprobó igualdad de definiciones y ACL antes/después.
- `whatsapp-webhook/index.ts`: guarda entrada antes de los routers, enriquece metadata de la misma fila e impide responder si falló la persistencia. Conserva las tres correcciones anteriores y añade tiempos por etapa.
- [Pruebas SQL](../../scripts/test-agent-permissions-database.mjs), [validador JWT](../../scripts/test-agent-rls.mjs) y [diagnóstico de lectura](../../supabase/scripts/audit_agent_r0_readonly.sql) preparados.

### Nueve correlaciones históricas

Se reconstruyeron 50 mensajes usando corte `2026-11-18T16:48:57.744785Z`: 48 done, dos review y nueve done sin fila entrante. Los nueve tienen recibo de entrada y exactamente una salida correlacionada entregada. Siete son texto y dos interactivos. Sus IDs:

```text
33af94d3-3875-411f-b2da-c708c09974fe
505844ac-882b-4720-b661-06a361078215
2553c560-4a72-448b-b026-71fef821cf63
29fea5c4-7ae4-4120-b286-fd90e5b334b6
a84c5a22-67a1-4245-8995-2c385285e4ab
c98fc4b1-6f99-47d9-b18c-586f74f94627
df9f2d8e-1230-4460-a366-762c25505e50
218dd520-8603-44ed-8505-78aaddb55ee0
fba43c97-3820-43e3-b007-5bf5a85e625a
```

**Causa reproducida en código.** El router llamaba a `handleInboundCommand` antes de guardar la entrada del usuario; un resultado true terminaba el turno anticipadamente. Hola reprodujo respuesta sin fila Inbox. La persistencia temprana corrigió ese caso y las regresiones de comandos, respuesta rápida y listas. No se leyó el texto histórico para atribuir la ruta concreta de cada uno de los nueve mensajes. Sus recibos tampoco tienen `worker_job_id`; comprobar versión efectiva frente al código local.

La reparación local no hace backfill y no reenvía mensajes. Reconstruir entradas históricas requiere revisión/autorización y reutilizar sus IDs originales.

### Incidentes que permanecen abiertos

| Incidente | Evidencia confirmada | Falta para cerrar |
| --- | --- | --- |
| 401 dispatcher | Handler local distingue el rechazo; su fail-open fue retirado. GET remoto llegó al runtime con 405. | POST original, execution/request ID, definición activa del cron y respuesta. Ejecutar sólo el diagnóstico de lectura. No probar POST anónimo sobre la versión publicada. |
| P0001 original · `2e1aa063-aad8-42cc-8b74-b79cb3147afd` | Review/provider_request, un intento, effect_started=true, entrada Inbox y salida entregada. Cero recibos de acción/equipo. | Mensaje, contexto y sentencia PostgreSQL del log del evento; versión Edge/SQL. No se deduce fallo de entrega ni autorización de reintento a partir de SQLSTATE. |
| P0001 original · `b5188f3f-020e-4f6e-b21f-df3fd053993e` | Mismo patrón: review/provider_request, un intento, entrada y salida entregada, sin recibos de mutación. | Mismas evidencias; reconciliar resultado antes de cualquier reintento. |
| Otro review observado en la muestra posterior | `aa92d43a-afdc-4ce5-85da-6d6a5921cd3c`, P0001, interactivo, entrada y salida entregada | Seguimiento separado; no modifica la muestra histórica de 50 ni reemplaza los dos incidentes originales. |
| Staging y organizaciones | Laboratorio PGlite pasa. No hay proyecto QA y sesiones JWT autorizados disponibles en esta ejecución. | Proveer/crear staging con aprobación, aplicar esquema completo y ejecutar validador. Dos proyectos validan el límite organizacional actual. |

### Latencia

Los 39.606 s de p50 y 517.747 s de p95 anteriores son encolado a última actualización y no pueden descomponerse retrospectivamente sin los logs de claim. Una muestra posterior de diez salidas correlacionadas tiene `delivered_at-sent_at` p50 1171 ms y p95 213946 ms; hay mezcla de timestamp del servidor y eventos Meta, además de tamaño pequeño.

El código preparado produce `queue_ms` desde creación hasta claim, `processing_ms` desde claim a finalización, `provider_duration_ms` para la petición Graph y `provider_event_at` para entrega. El ID de job y el ID Meta permiten medir cada tramo. Las métricas históricas son evidencia de diagnóstico; un SLO nuevo necesita baseline con la misma revisión desplegada.

### Condiciones antes de promover

Revisar funciones y ACL reales, probar el esquema completo con JWT en staging, diagnosticar 401/P0001, acordar reconciliación del historial y aprobar un destinatario de prueba. La decisión actual sigue siendo bloquear el cierre productivo de R0. No se ha iniciado R1 ni GAP.

## Ciclo 2 · correcciones, bloqueos y rollback

Cambios exclusivamente locales, basados en `4827181`. Se conservaron los cambios ajenos preexistentes en routing y migración de correo. No hubo despliegue, rotación de secretos, alta de usuarios, mutación de datos productivos ni envío nuevo.

| Incidente local | Reproducción antes | Corrección | Después / rollback |
| --- | --- | --- | --- |
| Dispatcher sin credenciales válidas acepta continuar si falta su secreto | 1 de 6 pruebas falla: espera 401 y obtiene 500 tras intentar inicializar BD | Retirar la rama allow por secreto ausente. Preservar credenciales existentes de dispatcher, anon y service role que ya acepte el contrato. Añadir evento `WHATSAPP_DISPATCHER_AUTH_REJECTED` y cabecera `x-whatsapp-auth-layer=edge_function`. | 6/6 pasan. Los tres rechazos ocurren antes de acceder a jobs. Usar una versión compatible que conserve el rechazo seguro; revisar la credencial del cron antes de cambiar código. |
| Respuesta AI persiste source fuera del CHECK de Inbox del repo | La prueba de replyAi obtiene `source=ai`; la migración admite contact/operator/automation | Guardar `automation` y conservar identificación AI en payload. Ajustar filtro de contexto para borradores heredados en ambas fuentes. | Prueba de persistencia y dos casos de historial pasan. La reversión debe conservar source válido y compatibilidad con historial. El esquema remoto debe verificarse antes de promoción. |
| Error de envío AI queda absorbido | El stub de Graph lanza timeout y replyAi resuelve como éxito | Emitir traza sin contenido y relanzar error para el protocolo durable existente | Prueba de propagación pasa. El worker conserva incertidumbre/review y evita reenviar a ciegas. Mantener propagación de errores en cualquier artefacto de reversión. |

Los cambios se encuentran en `supabase/functions/whatsapp-followup-dispatcher/index.ts`, `supabase/functions/whatsapp-webhook/index.ts` y `api/whatsapp-assistant.ts`. Pruebas en `whatsappDispatcher.test.ts`, `whatsappEdgeRuntime.test.ts`, `whatsappAssistant.test.ts` y fixtures de scope en `assistantOpsRuntime.test.ts`. Una prueba local de autorización invoca el handler Edge con adaptadores simulados; el control negativo demuestra que no toca jobs. Las credenciales válidas comprueban que atraviesan la guarda; sus adaptadores detienen el acceso y no envían.

**401 histórico todavía sin causa exacta.** GET sin credenciales devuelve 405 con execution ID `eb855033-fa3b-4917-bcce-c336650cd777`: el runtime es accesible. Un POST anónimo al dispatcher publicado podría activar seguimientos por la rama allow detectada, por lo que no se usó para diagnosticar. Se requiere la respuesta del cron, su request ID y el log del momento. La cabecera nueva permite atribuir futuros rechazos del código corregido, tras despliegue autorizado.

**Contrato heredado de credenciales.** El dispatcher también acepta la clave pública anon/publishable y service role, además del secreto de cron. La corrección conserva esas alternativas para no romper llamadas existentes; una clave pública no demuestra identidad de un usuario ni confidencialidad de un scheduler. Antes de promover se debe aprobar si se migra el cron a secreto dedicado y luego se retira el acceso por clave pública. Esta decisión y la revisión de los callers forman parte del cierre seguro de WA-04.

**Nuevos bloqueos.** Dos jobs en revisión `2e1aa063-aad8-42cc-8b74-b79cb3147afd` y `b5188f3f-020e-4f6e-b21f-df3fd053993e` tienen `stage=provider_request`, `database_P0001`. Ese SQLSTATE tiene múltiples causas posibles. No se cambió su estado ni se presume que un reenvío sea seguro. Hay nueve mensajes done sin entrada encontrada por ID exacto en el cotejo de 50 jobs; necesitan revisión con logs y esquema efectivo. Las lecturas se limitaron a metadatos. La revisión automática rechazó una consulta que incluía payload innecesario y se ejecutó una versión reducida sin ese campo.

## Auditoría de permisos y multiempresa

Se identificaron perfiles reales Dirección, super_admin, Líder y Analista en lecturas limitadas; `user_roles.app_role` constituye una autoridad adicional y las asignaciones de módulos/áreas afectan al acceso. Una cuenta de referencia fue proporcionada por el operador. Su UUID debe distinguirse entre `auth.users.id` y `usuarios.id` antes de cualquier piloto. No se asignó ni modificó una identidad.

| Superficie | Política o código inspeccionado | Hallazgo / verificación pendiente |
| --- | --- | --- |
| Kanban | `20260701123000_stabilize_action_read_for_responsible_comments.sql` | Sustituye políticas anteriores: Analista ve responsable, creador y menciones/asignaciones en comentarios; otros roles autenticados tienen lectura amplia. El helper de detalle del asistente restringe Analista a responsable salvo override. Falta paridad por operación con JWT. |
| Mutación Kanban | `20260616120000_analyst_kanban_readonly_role.sql` | Excluye Analista de mutaciones y usa relaciones/administración para update. Requiere comparar catálogo remoto y guards de service role. |
| OKRs | `20260924120000_okr_management.sql` y cambios posteriores de iniciativas | Reglas con `okr_can_view`, funciones y relaciones. El servicio privilegiado puede consultar más que el JWT; no certifica aislamiento de usuario. |
| Inbox | `20261103220000_ai_whatsapp_okrs_scope.sql` | SELECT por `can_use_ai_whatsapp()` o dueño. Comprobar función efectiva y módulos del actor. |
| Propuestas | `20261103210000_assistant_ops.sql` y migraciones posteriores de edición | Políticas de dueño y payload protegido. RLS desplegada y aprobación concurrente deben probarse con JWT. |
| Cola / recibos | `20261117180000_whatsapp_durable_inbound.sql` | RLS y revocación a anon/authenticated; escrituras por worker privilegiado y RPCs. |
| Dirección fuera de OKRS | `permissions.ts` vs `moduleAccess.test.ts` | Código permite OKR/AI a Dirección; dos pruebas esperan denegación para área Comercial. Ambos archivos están sin modificar. Requiere decisión de producto; no se cambian permisos para hacer pasar pruebas. |
| Organización | Migraciones y actor existentes | Sin contrato universal organization_id/tenant_id/empresa_id en migraciones auditadas. El límite documentado es proyecto. No se certifica multiempresa en una sola BD. |

Para verificar el catálogo realmente desplegado, el operador puede facilitar una exportación de solo lectura de esta consulta, que contiene definiciones de política y nombres de tablas:

```sql
select p.tablename, p.policyname, p.permissive, p.roles,
       p.cmd, p.qual, p.with_check
from pg_policies p
where p.schemaname = 'public'
  and p.tablename in (
    'usuarios', 'user_roles', 'acciones_diarias', 'accion_comentarios',
    'okrs', 'okr_key_results', 'okr_initiatives',
    'assistant_pending_ops', 'assistant_op_log',
    'whatsapp_messages', 'whatsapp_inbound_jobs'
  )
order by p.tablename, p.policyname;
```

## Propuesta de configuración QA · pendiente de aprobación

El operador confirmó que `xhpasmjzuwifmjhrsumb` no está identificado como entorno aislado. En R0 se trata como producción. No hay evidencia disponible de un staging operativo ni de cuentas de prueba autorizadas. La CLI Supabase y Docker no estaban disponibles en PATH en esta ejecución. Esa ausencia local no prueba que no exista un staging remoto.

**Propuesta.** El operador puede identificar un staging existente con URL, revisión de migraciones y responsable. Si no existe, aprobar la creación de un proyecto QA A con esquema migrado y datos sintéticos. Para probar aislamiento entre organizaciones bajo el modelo actual, se necesita un segundo proyecto QA B; dentro de QA A se validan roles, áreas y ownership. No se deben clonar mensajes, tokens, correos ni datos reales. Ningún proyecto se creó durante C2.

| Actor sintético | Proyecto / área | Rol propuesto | Datos y resultado esperado |
| --- | --- | --- | --- |
| QA-admin-A | QA A / OKRS | super_admin | Consulta y aprueba datos de A. Desconoce credenciales de B. |
| QA-dir-A | QA A / Comercial | Direccion | Alcance amplio interno. Acceso OKR/AI pendiente de decisión explícita. |
| QA-lider-A | QA A / Equipo A | Líder | Consultas autorizadas; módulos asignados expresamente. |
| QA-analista-A | QA A / Equipo A | Analista | Acción propia, creada para otro y mencionada; comprobar diferencias entre consulta general/detalle y RLS. |
| QA-par-A | QA A / Equipo B | Analista | Acción ajena y borrador privado para pruebas negativas. |
| QA-inactivo-A | QA A / Equipo A | Inactivo | Bloqueo antes de herramientas y proveedores. |
| QA-admin-B | QA B / OKRS | super_admin | Datos de B visibles sólo en su proyecto. |
| QA-anónimo | Sin sesión | anon | Sin cola, recibos ni propuestas privadas; verificación pública de webhook sólo por contrato. |

Fixtures de UUID se ejecutan sólo en tests locales: actor `00000000-0000-0000-0000-000000000001`, par `...0002`, dueño externo sintético `...0003`. Las tres verificaciones de scope son tests de función; la etiqueta externa del fixture no demuestra aislamiento de proyectos. El paquete de datos a sembrar en QA contendrá acciones propia, creada, ajena, vencida, bloqueada, hecha y verificada; un comentario con mención; un OKR y KR con cifras conocidas; dos propuestas privadas; eventos firmados de texto/botón/lista/duplicado y errores Graph 429/502. Se reutilizan los fixtures y el harness existentes.

Antes de ejecutar pruebas reales, aprobar proyectos, módulos por cuenta, JWT de prueba, matriz de expectativas, dataset y procedimiento de limpieza reversible. Mantener transportes sustituidos en el proceso de test y sin cron productivo. Para la fase con proveedor se requiere aprobación del destinatario, remitente y ventana de envío. Para R0 no se han aprobado destinatarios y no se ejecutaron envíos.

## Incidentes críticos

| Incidente | Causa o hecho confirmado | Pendiente de comprobar | Evidencia de cierre |
| --- | --- | --- | --- |
| 503 del callback público | En ejecución histórica `5e2b2399-fbe3-4422-b842-d48d9d08d626` respondió `webhook_not_configured`. Faltaba el nombre `WHATSAPP_APP_SECRET` según revisión del operador. Tras agregarlo se observó HTTP 200 y `stage=persisted`. El fallo era anterior a firma/persistencia. | Vigencia de app, callback y entorno efectivo; fixture válido en la versión desplegada. | POST firmado produce 200 y mensaje en cola; firma inválida se rechaza. |
| 401 de seguimientos | Código histórico observado en un POST. Sonda GET sin credenciales llegó al runtime y devolvió 405; repo declara `verify_jwt=false`. La función puede emitir `401 unauthorized` y acepta solicitudes cuando falta el secreto esperado. | Cuerpo/código del POST histórico y definición de cron en producción. Mismatch de Vault, cron alternativo o rechazo histórico de Gateway siguen como hipótesis. El 403 del worker no prueba el origen de este 401. | Identificar capa, cron y credencial válida; probar 401 en llamada inválida y ejecución autorizada sin ampliar acceso. |
| Worker 403, mensajes fuera de Inbox | Se observaron filas `message/pending/persisted` y worker 403. En Vault el nombre estaba en mayúsculas. Tras corregirlo a `whatsapp_dispatcher_secret` se observó 200. El callback escribe a cola y el worker lleva el mensaje a Inbox. | Correlación por ID de cola y registro Inbox. 200 del worker puede significar cero reclamos o procesamiento con un fallo registrado. | Entrada correlacionada, Inbox visible y cola sin crecimiento sostenido bajo carga representativa. |
| Comandos y botones sin respuesta | Cobertura local de `Hola`, acciones y botones mediante worker y Graph simulado. El periodo sin autorización del worker explica la imposibilidad de procesar esa cola. | Efecto y respuesta por mensaje concreto, vínculo activo, versión, autorización de acción y entrega. | Caso AT-12 correlacionado más botón y estado Kanban correcto. |
| Consultas consecutivas y borrador repetido | La respuesta exigía confirmar/cancelar antes de consultar; se corrigió en `094824f`. Vercel falló con TS2339. `4827181` cambió la prueba, pasó build local incluso después del empaquetado y tiene estado Vercel exitoso en GitHub. Existe lógica de consulta activa para Retell y riesgo de divergencia por canal. | Versión efectiva consumida por el webhook y «Todas»/pronombres con datos reales autorizados en cada canal. | AT-01, AT-02 y AT-11 con evidencia de versión, resultado y permisos. |

Fuentes de producción: logs y resultados SQL facilitados por el operador en el chat, sondas de la investigación previa y [runbook WhatsApp](../whatsapp-entrada-validacion.md). Fuentes de código: [webhook](../../supabase/functions/whatsapp-webhook/index.ts), [dispatcher](../../supabase/functions/whatsapp-followup-dispatcher/index.ts), [cron](../../supabase/scripts/schedule_whatsapp_inbound_worker.sql) y [asistente](../../api/whatsapp-assistant.ts).

## Registro de riesgos

| Riesgo | Severidad | Dependencia y validación |
| --- | --- | --- |
| Rol de servicio y alcance mayor que JWT | Alta | Roles/permisos y políticas desplegadas. Comparar IDs con dos actores, rutas RLS, distintas áreas y proyectos; incluir exportación y búsqueda. ID-01, ID-02, QA-02. |
| Diferencia entre política de liga y configuración histórica | Alta | El [checklist Retell](../retell-enviardian-checklist.md) describe un piloto amplio, y la [auditoría posterior](../auditoria-enviardian-flujo.md) describe aprobación pública retirada. Verificar el modo efectivo, consentimiento, grants, alcance y revocación en staging. ID-04, VO-04. |
| Ejecución de dispatcher con secreto ausente | Alta | Inspeccionar cron, Gateway y handler. Probar rechazo ante ausencia y con credenciales incorrectas antes de ajustar autenticación en ciclo autorizado. WA-04. |
| Diferencia entre código probado y versión publicada | Alta | Vercel, Retell, Edge, migraciones y cron pueden avanzar por separado. Registrar versiones y smoke probado por release. QA-06. |
| Latencia, backlog y errores de Meta | Alta | Cron cada minuto, hasta cinco reclamos por invocación; retries y eventos de estado consumen capacidad. Medir p50/p95 de cola, claim a envío y entrega, además de pendientes/review/fallos. QA-03, WA-02. |
| Efecto duplicado tras reintento o timeout | Alta | Idempotencia, lease y reconciliación por ID de proveedor. Estados de resultado incierto requieren revisión. AC-05, CM-02. |
| Historial y logs con PII | Alta | Revisar acceso, retención y redacción de mensajes y transcripciones. Usar IDs y códigos públicos de error en evidencia compartida. ID-05, QA-03. |
| Configuración remota Retell y compatibilidad de voz | Media-alta | Revisar agente Guía, tool schemas, prompt, modos, micrófono y TTS. Mantener Retell mientras se compara alternativa con mismo corpus, latencia, costo y seguridad. VO-01–06. |
| Correo de usuario y remitente operativo | Media-alta | Resolver dirección según Kanban, verificar identidad remitente y ruta Google separada. La migración local de correo estaba fuera de Git al auditar y su estado remoto requiere verificación. EM-01. |
| Cobertura de conocimiento, costo y capacidad | Media | Definir corpus, revisión y retención documental, costo por modelo y canal, y política de fallback antes de ampliar. KB-02–05, QA-05. |

## Dependencias externas de acceso

- Supabase y Meta: revisión de configuración por nombres, cron, trazas de Edge, callback, permisos y eventos de proveedor. Registrar validez, fecha e ID de ejecución.
- Vercel: Deployments y logs de build/runtime para verificar el commit promovido y el alias real que usa `APP_URL`.
- Retell: versión del agente, herramientas y latencia de llamada. OpenAI: ruta de proveedor autorizada para piloto comparativo; las claves y los valores se mantienen fuera de la evidencia.
- Correo: destinatario y remitente de prueba, esquema de identidad y confirmación de proveedor.
- Fuentes del backlog: se usaron exportaciones suministradas. El conector Notion falló durante acceso directo; los archivos de referencia permitieron completar el mapeo.
