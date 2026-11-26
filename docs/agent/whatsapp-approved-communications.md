# WhatsApp: comunicaciones aprobadas y asignación de tareas

Fecha: 2026-11-25. Estado: candidato local, apagado por defecto. No desplegado, sin migraciones aplicadas ni envíos reales durante este trabajo.

## Comportamiento y componentes reutilizados

- Se conserva el orquestador, `assistant_pending_ops`, el adaptador de códigos/botones, los ejecutores R2 y las reglas de autorización existentes. No se incorpora otro bot, modelo, mailer o integración WhatsApp.
- Tareas para otro responsable: resolución del usuario activo y alcance permitido; vista previa; confirmación del código vigente; ejecutor/RPC existentes y verificación del registro. Se corrigió el residuo «para Carlos» en título/descripción cuando es una cláusula separada. Se conserva el nombre cuando forma parte del trabajo.
- Una tarea confirmada no se vuelve a presentar como lista para crear. La revisión lee la operación vinculada; una modificación prepara una actualización del mismo ID. Las tarjetas previas se cancelan antes de reemplazar un borrador. Un contexto histórico sin vínculo no se declara ejecutado ni pendiente por inferencia.
- WhatsApp saliente: se reutiliza `executeWhatsappWrite` y el transporte Meta actual. Revalidación de contacto, ventana de 24 horas, contenido íntegro, hash, permisos y registro único `guide-comm:<operación>`. No se habilitan plantillas pagadas como alternativa automática.
- Correo: se reutiliza `notify_user_email` y `send-notification-email`. La cuenta remitente es la ya configurada de Scrumban (`GOOGLE_GMAIL_FROM` o `NOTIFICATION_EMAIL_FROM`), no el Gmail personal del usuario. Reply-To es el correo confirmado de acceso del emisor. Destinatario: correo de acceso registrado del usuario activo, revalidado en API y Edge Function. No se habilitan destinatarios externos arbitrarios.
- La llamada interna del servidor al mailer exige su credencial service_role, que nunca se entrega al teléfono ni al modelo. Esa ruta solo acepta el ID de una operación `notify_user_email` ya reservada, del canal/sesión de WhatsApp vinculados. El cuerpo y el destinatario se reconstruyen desde la operación, ignorando cualquier sustitución en el request. No se generan JWT de usuario ni se relaja `verify_jwt`.
- El remitente debe seguir activo, vinculado, autorizado para IA WhatsApp y habilitado por su rol/capacidades vigentes. Se conserva la compuerta R2 de base de datos y coincidencia del proyecto. La allowlist agrega restricciones y nunca concede permisos a Dirección ni a roles de consulta.
- Una solicitud del modelo o un «sí» genérico no ejecuta envíos. Se requiere código o botón vinculado a propuesta/versión. El runtime vuelve a calcular la versión sobre el payload inmediatamente antes de reservarlo mediante CAS.
- Los mensajes largos se presentan íntegros como texto con código; no se recortan a 1024 caracteres para incluir botones. El contenido aprobable desde WhatsApp se limita a 1400 caracteres; un mensaje mayor requiere revisión, nunca se envía recortado.
- `accepted` significa aceptación del proveedor. WhatsApp `delivered`/`read` solo se presentan si hay evidencia de Meta. El proveedor actual de correo no acredita entrega en buzón; solo aceptación.

## Configuración propuesta, aún NO aplicada

Mantener R2 limitado al piloto, WhatsApp global OFF, dispatcher recurrente OFF, R3 OFF y GEMINI_MODEL intacto.

La activación requiere estas variables nuevas, apagadas/denegadas si faltan:

| Variable | Propuesta de prueba |
| --- | --- |
| WHATSAPP_COMMUNICATIONS_ENABLED | 0 inicialmente; 1 solo durante la prueba autorizada |
| WHATSAPP_COMMUNICATIONS_SENDERS | Solo UUID de Alonso Perez, piloto actual |
| WHATSAPP_COMMUNICATIONS_RECIPIENTS | Solo UUID de Alonso Perez |
| WHATSAPP_COMMUNICATIONS_CHANNELS | whatsapp,email; se puede autorizar cada canal por separado |

Aplicar las cuatro en Vercel y en la configuración Edge de Supabase para correo. No cambiar usuarios, RLS, roles o catálogos. Se usan los secretos existentes; si Meta no está configurado en Vercel, se requiere autorizar la incorporación de sus credenciales existentes allí, sin compartirlas en chat ni rotarlas. Verificar solamente presencia de `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, configuración Supabase y los secretos Gmail ya utilizados por el mailer.

La migración `20261125230000_whatsapp_approved_email_attempts.sql` solo amplía los estados permitidos en la tabla de auditoría existente `notification_email_logs` con `queued` y `unknown`. No crea tablas, funciones SECURITY DEFINER, grants ni políticas. El intento usa como PK el UUID de la operación: la unicidad impide un segundo envío incluso si se restablece el estado de la propuesta. Los clientes autenticados mantienen solo SELECT en esta tabla. No se modifica el payload aprobado para registrar el intento, porque su trigger exige inmutabilidad.

## Evidencia y límites de validación

Pruebas ejecutan código real del mailer Edge, transporte y confirmación compartida con base/adaptadores/proveedores sintéticos; no emulan RLS PostgreSQL. Casos: gate OFF; usuario/destinatario/canal fuera de lista; identidad desvinculada y rol de consulta; borrador distinto de payload; versión antigua; intento de aprobación del modelo; envío WhatsApp simulado con número/cuerpo exactos e idempotencia; mailer con MIME exacto, Reply-To correcto y rechazo de overrides; reserva concurrente; timeout incierto sin reenvío; preview largo íntegro; asignación y persistencia para otro responsable tras confirmación; revocación de aprobación anterior.

No se han acreditado envío ni entrega reales de este candidato, ni ejecución de la migración en PostgreSQL. Los resultados y SHA de la revisión aislada se adjuntan al terminar.

## Aceptación productiva que requiere autorización

1. Publicar únicamente el SHA revisado en Vercel y las Edge Functions `send-notification-email` y `whatsapp-webhook`; aplicar la migración de estados de auditoría. Primero mantener la nueva compuerta OFF y comprobar lecturas y envíos salientes existentes.
2. Confirmar la cuenta remitente de Scrumban y la disponibilidad de sus credenciales actuales. No conectar Gmail personal ni agregar proveedores de pago.
3. Manteniendo presupuesto adicional de USD 0, verificar en Meta la cuota gratuita disponible antes de activar la prueba. La ventana de 24 horas por sí sola no acredita gratuidad: la documentación técnica vigente desde 2026-10-01 contempla cobro después de los primeros 1000 mensajes de servicio mensuales. Fuente primaria: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing#free-tier-of-monthly-service-messages . No se acepta gasto adicional ni se cambia este límite automáticamente.
4. Autorizar una prueba de un WhatsApp y un correo al usuario Alonso Perez (`alpeva96@gmail.com`), contenido «Prueba controlada de envío desde WhatsApp de Scrumban», asunto de correo «Prueba controlada de Scrumban». El usuario aún debe revisar y confirmar cada código desde su teléfono; identificar un destinatario solo preparó la prueba, no autorizó el envío.
5. Para acreditar creación real para terceros falta indicar un responsable distinto de Alonso, presentar la tarea exacta y obtener la confirmación explícita del piloto. No se crea ninguna acción productiva a partir de esta documentación. `emx_52276` permanece excluida.
6. Registrar operación, versión, correlación/ID proveedor y resultado real; comprobar persistencia en Kanban y separar aceptación de entrega. Desactivar la nueva compuerta tras la prueba hasta aprobar su uso continuo.

## Rollback

Desactivar `WHATSAPP_COMMUNICATIONS_ENABLED` en ambos entornos antes de revertir código. Restaurar la versión previa de las dos Edge Functions y el deployment Vercel aprobado previamente. Conservar filas e ID únicos de auditoría y los estados SQL aditivos para no eliminar evidencia ni permitir reenvíos. No restaurar privilegios de Dirección, modificar RLS, borrar registros ni reenviar operaciones inciertas. Los cambios de voz pendientes quedan fuera de este candidato.
