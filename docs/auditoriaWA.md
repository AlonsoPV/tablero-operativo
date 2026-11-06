# PROMPT DEFINITIVO — OPTIMIZACIÓN DE ACCIONES, WHATSAPP Y AGENTE IA | SCRUMBAN

Actúa como arquitecto senior de software, experto en reingeniería de procesos, Lean, Supabase, PostgreSQL, Edge Functions, WhatsApp Cloud API, React, TypeScript y agentes de inteligencia artificial.

Tu misión es auditar, corregir y optimizar el flujo de gestión de iniciativas y acciones de Scrumban, garantizando una experiencia intuitiva, ágil, segura y orientada a la ejecución.

**OBJETIVO PRINCIPAL**

Conseguir que las acciones puedan notificarse, consultarse, actualizarse, completarse y escalarse desde WhatsApp y el agente IA, manteniendo una única fuente de verdad en Scrumban.

No reconstruyas funcionalidades existentes. Reutiliza la arquitectura actual y elimina duplicidades, inconsistencias y riesgos.

---

## 1. REGLAS DE NEGOCIO DEFINITIVAS

Estas reglas están aprobadas y deben respetarse.

### 1.1 Notificación de asignación

- Crear o asignar una acción NO genera automáticamente un WhatsApp.
- La notificación inicial se envía exclusivamente cuando un usuario autorizado pulsa el botón «Notificar asignación por WhatsApp».
- La acción debe estar guardada y contar con un responsable válido.
- El responsable debe tener una identidad WhatsApp activa y habilitada para recibir mensajes.
- El mensaje debe incluir el identificador público de la acción.
- Registrar fecha, emisor, destinatario, acción y resultado del envío.

### 1.2 Elegibilidad para seguimiento

**Únicamente entran al seguimiento automático las acciones notificadas manualmente por WhatsApp.**

Una acción no notificada puede existir en el tablero, pero no debe incorporarse al digest automático.

- La elegibilidad se registra de forma persistente.
- No depende únicamente de la existencia de un job.
- Si una acción cambia de responsable, se suspende su elegibilidad para el destinatario anterior.
- El nuevo responsable debe ser notificado manualmente para activar su seguimiento.
- Si una acción pasa a Hecho o Verificado, deja de aparecer en el digest de actividades activas.
- Si se reabre una acción, debe definirse si conserva una notificación válida para el responsable actual; nunca asumir elegibilidad por un envío histórico a otra persona.
- No incorporar acciones no notificadas al digest aunque estén vencidas o bloqueadas.

### 1.3 Seguimiento agrupado

- Enviar un solo resumen por responsable y ventana de seguimiento configurada.
- Incluir exclusivamente sus acciones activas y elegibles.
- Priorizar acciones vencidas, bloqueadas y próximas a vencer.
- Evitar mensajes individuales por cada actividad.
- Respetar horarios, frecuencia y límites configurados.
- No enviar mensajes repetidos por jobs duplicados o reintentos.

### 1.4 Respuestas permitidas

Conservar exactamente las tres opciones principales:

1. **Realizada**
2. **En Proceso**
3. **Necesito Apoyo**

Cada respuesta debe identificar inequívocamente la acción antes de modificar información.

---

## 2. AUDITORÍA DEL CÓDIGO EXISTENTE

Inspecciona:

- `src/lib/whatsappActionDigest.ts`
- `src/lib/whatsappFlowRouting.ts`
- `src/features/operations/components/AccionFormDialog.tsx`
- `src/features/operations/utils/accionUtils.ts`
- `src/services/whatsappIntegration.service.ts`
- `supabase/functions/whatsapp-send-action/index.ts`
- `supabase/functions/whatsapp-followup-dispatcher/index.ts`
- `supabase/functions/whatsapp-webhook/index.ts`
- `api/whatsapp-webhook.ts`
- `api/_shared/whatsappBidirectional.ts`

Revisa también las tablas, funciones SQL, triggers, políticas RLS y componentes asociados.

Identifica:
- Funcionalidades implementadas.
- Código duplicado.
- Inconsistencias entre frontend y backend.
- Riesgos de concurrencia.
- Fallos de seguridad.
- Problemas de trazabilidad.
- Diferencias entre código local y producción.

Antes de modificar, presenta un diagnóstico breve con el plan de implementación.

---

## 3. IDENTIFICADOR PÚBLICO DE ACCIONES

Actualmente se utiliza `emx_XXXXX`, calculado a partir del UUID.

Este mecanismo puede generar colisiones.

### Requerimientos

- Garantizar un identificador público único y persistente.
- Mantener compatibilidad con IDs existentes cuando sea posible.
- Establecer restricciones de unicidad en base de datos.
- Evitar depender de algoritmos duplicados en distintos archivos.
- Detectar y resolver colisiones históricas mediante una migración controlada.
- No actualizar una acción cuando el identificador sea ambiguo.
- No seleccionar arbitrariamente la primera coincidencia.
- Diseñar una ampliación del formato si se agota la capacidad de cinco dígitos.
- Mantener una estrategia de resolución para mensajes históricos que no genere asociaciones ambiguas.

**Criterio obligatorio:** ningún mensaje puede modificar una acción equivocada por una colisión de identificadores.

---

## 4. PROGRAMACIÓN DE SEGUIMIENTOS

Optimizar la arquitectura de `whatsapp_followup_jobs`.

### Comportamiento esperado

Al enviar una notificación manual aceptada por Meta:

1. Registrar el intento y su resultado.
2. Activar la elegibilidad de seguimiento de esa acción para ese responsable, conforme a la política definida.
3. Programar o actualizar el seguimiento del responsable.
4. Evitar jobs duplicados.
5. Respetar `followup_delay_minutes` y `followups_per_day`.

Al ejecutar el dispatcher:

1. Identificar responsables con seguimientos pendientes.
2. Recuperar únicamente acciones notificadas, activas y elegibles.
3. Construir un digest agrupado.
4. Validar ventana de WhatsApp y mecanismo de envío permitido.
5. Enviar una sola vez por ventana.
6. Registrar resultado.
7. Programar el siguiente seguimiento cuando corresponda.

### Protección contra errores

Implementar:
- Idempotencia.
- Claim atómico de jobs.
- Protección ante ejecución concurrente.
- Recuperación de jobs atascados.
- Reintentos limitados con backoff.
- Cancelación de trabajos obsoletos.
- Deduplicación por responsable y ventana de seguimiento.

No cancelar jobs legítimos únicamente porque compartan una etiqueta de etapa.

---

## 5. DIGEST OPERATIVO

El mensaje debe ser compacto, claro y accionable.

Ejemplo ilustrativo:

**Seguimiento de tus actividades**

🔴 `emx_00123` — Revisar inventario | Vencida

🟠 `emx_00045` — Enviar reporte comercial | Hoy

🔵 `emx_00067` — Validar indicadores | En proceso

**¿Qué deseas actualizar?**

Responde con el ID y una opción:

`emx_00123 Realizada`

`emx_00123 En Proceso`

`emx_00123 Necesito Apoyo`

También puedes utilizar los botones disponibles.

### Reglas

- No incluir acciones sin notificación manual válida.
- No incluir acciones de otros responsables.
- No truncar elementos a la mitad.
- Mostrar primero las actividades más relevantes.
- Si existen más acciones de las que caben, indicar cuántas adicionales hay.
- Permitir consultar las restantes sin generar mensajes masivos.
- Respetar los límites del formato de WhatsApp utilizado.
- Utilizar fechas y estados reales.

No es necesario llamar a Gemini para generar el digest.

---

## 6. FLUJO «REALIZADA»

Esta es una regla crítica.

**Responder Realizada NO debe completar automáticamente todos los checkpoints pendientes.**

### Secuencia obligatoria

1. Identificar la acción.
2. Validar identidad del remitente.
3. Validar permisos.
4. Consultar el estado actual.
5. Revisar checkpoints obligatorios.
6. Verificar si existe evidencia requerida.
7. Determinar si la acción puede pasar a Hecho.

### Caso A: requisitos completos

Si todos los checkpoints obligatorios están completados y se cumplen los requisitos de cierre:

- Cambiar estado a Hecho.
- Registrar fecha y usuario.
- Solicitar evidencia adicional únicamente cuando la política lo requiera.
- Notificar al verificador mediante los mecanismos autorizados.
- Confirmar el resultado por WhatsApp.
- Excluir la acción del siguiente digest activo.

**Hecho no significa Verificado.**

### Caso B: checkpoints obligatorios pendientes

No cambiar automáticamente a Hecho.

Responder, por ejemplo:

«La acción `emx_00123` tiene 2 puntos pendientes antes de marcarla como realizada:

1. Validar inventario.
2. Adjuntar reporte.

Puedes completarlos desde el tablero o enviarme la información correspondiente».

### Reglas adicionales

- No inventar evidencias.
- No marcar checkpoints como completados sin validación.
- No eliminar información existente.
- No cambiar a Verificado.
- No registrar un cierre exitoso si falló la operación.

Si existen checkpoints opcionales, aplicar la definición de cierre vigente del sistema y no tratarlos automáticamente como obligatorios.

---

## 7. FLUJO «EN PROCESO»

Cuando el usuario responde En Proceso:

1. Identificar la acción.
2. Validar permisos.
3. Consultar estado actual.
4. Registrar la actualización.
5. Cambiar a `En_Ejecucion` cuando la transición sea válida.
6. Solicitar opcionalmente un comentario o porcentaje de avance, si el modelo de datos lo permite.
7. Confirmar el resultado.

### Consideraciones

- No sobrescribir información previa.
- No reiniciar fechas.
- No eliminar evidencias.
- No modificar checkpoints automáticamente.
- No desbloquear una acción marcada como Bloqueado sin resolver la causa.
- Evitar crear registros de avance duplicados ante reintentos.

---

## 8. FLUJO «NECESITO APOYO»

**Decisión aprobada: registrar bloqueo y avisar al líder.**

Este flujo debe ser especialmente ágil y orientado a resolver problemas.

### Secuencia

1. Identificar la acción.
2. Validar remitente y permisos.
3. Solicitar una descripción breve del problema si no se proporcionó.
4. Registrar el bloqueo.
5. Cambiar estado a Bloqueado cuando corresponda.
6. Identificar al líder o responsable de escalamiento según la estructura real de Scrumban.
7. Generar una notificación al líder.
8. Confirmar al usuario que su solicitud quedó registrada.

### Mensaje al responsable

«La acción `emx_00123` quedó registrada como bloqueada.

Motivo: Falta información del proveedor.

Se notificó a tu líder para dar seguimiento».

No afirmar que el líder fue notificado si la entrega no pudo procesarse; en ese caso indicar que la notificación quedó pendiente o falló, según el resultado real.

### Notificación al líder

Ejemplo:

**Se requiere apoyo**

Acción: `emx_00123` — Revisar inventario

Responsable: Carlos

Bloqueo: Falta información del proveedor

Tiempo bloqueado: Según datos reales

Acción sugerida: Revisar y definir siguiente paso.

Incluir acceso directo al registro cuando el canal lo permita.

### Reglas de escalamiento

- Resolver al líder desde la configuración o estructura organizacional real.
- No inventar destinatarios.
- Si no hay líder configurado, registrar una incidencia de configuración y mantener el bloqueo visible.
- Evitar notificar repetidamente el mismo bloqueo sin cambios.
- Permitir agregar información al bloqueo existente.
- Registrar cuándo fue reportado y cuándo se resolvió.
- Evitar ciclos de escalamiento entre responsables.
- Respetar preferencias, permisos y políticas de notificación del líder.

El aviso al líder debe realizarse mediante el canal corporativo autorizado y disponible, utilizando WhatsApp únicamente cuando exista configuración válida y se cumplan las reglas de Meta.

---

## 9. SELECCIÓN DE ACCIONES Y RESPUESTAS

Mantener:

- Botones Realizada / En Proceso / Necesito Apoyo.
- Respuestas mediante `emx_XXXXX`.
- Selección de acción cuando existan varias.

### Mejoras

- Identificar la acción antes de modificarla.
- Asociar los botones al mensaje y contexto correspondientes.
- Utilizar sesiones de selección con expiración.
- Validar nuevamente permisos y estado antes de ejecutar.
- No permitir que botones antiguos alteren acciones reasignadas.
- No aplicar una respuesta a otra acción por utilizar el último contexto disponible.
- Solicitar aclaración cuando exista ambigüedad.

No introducir pasos de confirmación innecesarios cuando el usuario ya proporcionó un comando inequívoco y autorizado.

---

## 10. EVIDENCIAS Y CHECKPOINTS

Optimizar la recepción de:

- Texto.
- Fotografías.
- PDF.
- Archivos compatibles.
- Comentarios.
- Actualizaciones de checkpoints.

Cada evidencia debe asociarse a una acción identificada y autorizada.

### Requisitos

- Validar formatos y tamaños.
- Almacenar de forma segura.
- Registrar autor y fecha.
- Evitar archivos duplicados.
- No asociar automáticamente una evidencia a una acción ambigua.
- Validar si una evidencia satisface realmente un requisito.
- Mantener la trazabilidad de cada checkpoint.

Cuando se requiera interpretación mediante IA, tratar el resultado como una propuesta de validación y no como una autorización automática para cerrar requisitos críticos.

---

## 11. MOTOR CENTRALIZADO DE OPERACIONES

Evitar que WhatsApp, el agente IA y el tablero implementen reglas diferentes.

Crear o reutilizar una capa central de negocio.

Operaciones conceptuales:

- `resolveAction`
- `getEligibleActions`
- `validateActionTransition`
- `getPendingRequiredCheckpoints`
- `markActionDone`
- `updateActionProgress`
- `requestActionSupport`
- `registerActionEvidence`
- `notifyEscalationLeader`
- `recordActionActivity`

### Reglas

- Validaciones del lado del servidor.
- Permisos por usuario y recurso.
- Transiciones consistentes.
- Operaciones idempotentes.
- Registro de auditoría.
- Manejo transaccional cuando corresponda.

El agente IA deberá utilizar estas mismas operaciones.

Las modificaciones iniciadas por IA mantendrán confirmación humana explícita.

Los comandos directos e inequívocos de WhatsApp podrán ejecutarse conforme al protocolo autorizado.

---

## 12. SEGURIDAD

Auditar e implementar:

- Validación HMAC de webhooks Meta.
- Dedupe de IDs de mensajes entrantes.
- Protección de endpoints internos.
- Validación de identidad WhatsApp.
- Autorización por acción.
- Políticas RLS.
- Protección de secretos.
- Validación de archivos.
- Límites de solicitudes.
- Prevención de prompt injection.
- Logs seguros.

Si un webhook público requiere `verify_jwt=false`, verificar su autenticidad mediante la firma correspondiente.

Nunca confiar en un identificador de acción recibido por WhatsApp sin comprobar que pertenece al contexto autorizado del remitente.

---

## 13. MANEJO DE ERRORES Y CASOS ESPECIALES

Resolver correctamente:

- Responsable sin WhatsApp.
- Número desvinculado.
- Acción reasignada.
- Acción eliminada o archivada.
- Acción ya completada.
- Checkpoints pendientes.
- Líder no configurado.
- Ventana de WhatsApp cerrada.
- Plantilla no aprobada.
- Webhook duplicado.
- Job concurrente.
- Respuesta tardía.
- Evidencia ambigua.
- Meta temporalmente no disponible.
- Cambio simultáneo desde tablero y WhatsApp.

Las fallas deben producir estados recuperables, sin actualizaciones parciales inconsistentes.

---

## 14. EXPERIENCIA DE USUARIO

Aplicar principios Lean:

- Reducir pasos.
- Evitar preguntas innecesarias.
- Mostrar únicamente información relevante.
- Priorizar decisiones.
- Confirmar resultados de forma breve.
- Mantener consistencia entre WhatsApp y tablero.
- Evitar mensajes repetitivos.
- Facilitar la recuperación ante errores.

El usuario no debe necesitar conocer comandos técnicos complejos para utilizar el sistema.

Los IDs sirven como mecanismo de identificación, pero la interacción debe mantenerse comprensible.

---

## 15. OBSERVABILIDAD Y MÉTRICAS

Registrar:

- Acciones notificadas manualmente.
- Acciones elegibles para seguimiento.
- Digests programados y enviados.
- Mensajes aceptados, entregados y fallidos.
- Respuestas recibidas.
- Acciones marcadas Hecho.
- Intentos de cierre rechazados por checkpoints.
- Bloqueos reportados.
- Líderes notificados.
- Bloqueos resueltos.
- Errores de autorización.
- Operaciones duplicadas evitadas.

Distinguir claramente entre mensaje aceptado por Meta y mensaje realmente entregado.

---

## 16. PRUEBAS OBLIGATORIAS

Validar al menos:

1. Crear acción sin notificación automática.
2. Notificar manualmente.
3. No incluir acciones sin notificación en el digest.
4. Agrupar varias acciones notificadas.
5. Reasignar una acción.
6. Resolver correctamente IDs públicos.
7. Detectar colisiones.
8. Responder Realizada con checkpoints completos.
9. Responder Realizada con checkpoints obligatorios pendientes.
10. Verificar que Hecho no equivale a Verificado.
11. Responder En Proceso.
12. Responder Necesito Apoyo.
13. Registrar el motivo del bloqueo.
14. Notificar al líder correcto.
15. Evitar notificaciones duplicadas al líder.
16. Manejar ausencia de líder configurado.
17. Procesar webhooks repetidos.
18. Recuperar jobs fallidos.
19. Manejar ventanas de WhatsApp cerradas.
20. Validar cambios simultáneos.
21. Confirmar compatibilidad con Kanban por equipos.
22. Verificar que el agente IA utiliza las mismas reglas de negocio.

---

## 17. PLAN DE IMPLEMENTACIÓN

Trabajar incrementalmente.

**Fase 1 — Auditoría**
- Inspeccionar código y arquitectura.
- Confirmar hallazgos.
- Presentar riesgos y plan técnico.

**Fase 2 — Integridad**
- Corregir IDs públicos.
- Validar permisos.
- Centralizar transiciones.

**Fase 3 — Seguimiento**
- Registrar elegibilidad.
- Optimizar jobs.
- Implementar digest agrupado.
- Evitar duplicados.

**Fase 4 — Respuestas**
- Validar cierre mediante checkpoints.
- Optimizar En Proceso.
- Implementar bloqueo y aviso al líder.

**Fase 5 — Robustez**
- Evidencias.
- Seguridad.
- Reintentos.
- Observabilidad.

**Fase 6 — Validación**
- Pruebas automatizadas.
- Pruebas integrales.
- Documentación.
- Checklist de despliegue.
- Plan de reversión.

No desplegar automáticamente a producción.

No ejecutar migraciones destructivas.

Mantener compatibilidad con el Kanban por equipos.

---

## 18. ENTREGABLE FINAL

Presenta:

1. Diagnóstico de problemas confirmados.
2. Arquitectura optimizada.
3. Reglas de negocio implementadas.
4. Archivos modificados.
5. Migraciones requeridas.
6. Pruebas ejecutadas.
7. Resultados de seguridad.
8. Riesgos pendientes.
9. Checklist de despliegue.
10. Recomendaciones adicionales.

## CRITERIO DE ÉXITO

Un responsable recibe únicamente seguimientos de las acciones que le fueron notificadas manualmente.

Puede identificar cada actividad y responder de manera sencilla:

- **Realizada:** el sistema valida checkpoints y requisitos antes de marcar Hecho.
- **En Proceso:** registra el avance sin alterar información incorrectamente.
- **Necesito Apoyo:** registra el bloqueo y notifica al líder correspondiente.

Todas las operaciones se reflejan correctamente en Scrumban, sin duplicados, sin cierres falsos y sin modificaciones fuera de los permisos autorizados.

El resultado debe ser un sistema confiable, ágil, escalable y preparado para funcionar de manera consistente desde el tablero, WhatsApp y el agente IA.