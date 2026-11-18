# WhatsApp entrante en Scrumban

## Hallazgos

El callback de producción está en Supabase Edge `/functions/v1/whatsapp-webhook`. El 17 de noviembre de 2026 a las 22:23 de Ciudad de México, un GET sin token devolvió `403 forbidden` y un POST vacío sin firma devolvió `503 webhook_not_configured`. Ambos llegaron al runtime de la función. La rama de configuración rechaza el POST antes de validar la firma cuando falta el secreto de la aplicación, el ID del número o el ID de la cuenta de WhatsApp Business. Esa respuesta no identifica cuál de las tres variables falta en la versión desplegada.

Además, el worker confundía una fila de recepción ya guardada con un mensaje ya procesado. Al reintentar un fallo previo a la respuesta, la violación del índice único podía hacer que el worker saltara el mensaje y cerrara el job con éxito. El registro ahora conserva el ID del job propietario y solo ese mismo job puede retomar su procesamiento. Un duplicado legado o de otro job sigue descartándose.

La función SQL de reclamo bloqueaba nuevos mensajes del mismo remitente si existía un job en `review`. La [migración de reclamo y reintentos](../supabase/migrations/20261117182000_whatsapp_inbound_unblock_review.sql) conserva esos jobs para revisión y permite continuar con mensajes nuevos. El worker reintenta un `429` explícito de Meta solo cuando todavía no hubo otro efecto. Una falla de red, un `5xx` o un resultado de envío incierto permanece en revisión y requiere conciliación con el proveedor.

## Flujo auditado

- El GET verifica `hub.mode`, `hub.verify_token` y devuelve el `hub.challenge`. El POST valida `X-Hub-Signature-256` sobre el cuerpo recibido y comprueba WABA e ID del número. Los eventos `statuses` actualizan el historial de entrega.
- El webhook de Supabase y la ruta compatible `/api/whatsapp-webhook` de Vercel usan el mismo contrato de entrada y la misma cola durable. El POST responde `200 EVENT_RECEIVED` cuando persiste los eventos. El índice único de `event_key` deduplica entregas de Meta sin repetir la respuesta.
- El cron reclama los jobs. El worker valida una identidad WhatsApp activa y un usuario activo en el proyecto Supabase. WABA y número delimitan la cuenta de entrada. Las lecturas de «Mis acciones» y «Pendientes» se filtran por responsable y las mutaciones de recordatorios pasan por los RPC existentes que verifican asignación y propiedad. La búsqueda de acciones creadas sigue usando `created_by`.
- `Hola`, `Ayuda`, `Mis acciones`, `Pendientes` y «Consultar acciones» se resuelven en el router de comandos. Los botones de acciones y las listas conservan los IDs existentes. El motor conversacional sigue atendiendo la consulta explícita al bot según sus permisos.
- Los logs `WHATSAPP_WEBHOOK_RECEIVED`, `WHATSAPP_SIGNATURE_VALIDATED`, `WHATSAPP_MESSAGE_PARSED` y `WHATSAPP_PROCESSING_FAILED` incluyen el ID de solicitud. El ID de evento enlaza el ingreso con `WHATSAPP_USER_RESOLVED`, `WHATSAPP_COMMAND_DETECTED`, `WHATSAPP_COMMAND_EXECUTED` y `WHATSAPP_REPLY_SENT` del worker. Solo una respuesta con ID de Meta se registra como enviada por el worker. Los logs nuevos omiten teléfonos, cuerpos, tokens y firmas.

## Validación después de autorizar el despliegue

1. En el proyecto Supabase que recibe el callback, revisa los secretos `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID` (admite `WHATSAPP_BUSINESS_ACCOUNT_ID`), `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_DISPATCHER_SECRET`. Confirma que corresponden a la misma app, WABA y número de producción. Los secretos de Vercel son necesarios en esa plataforma si se usa su callback compatible.
2. Comprueba en SQL que existan los procedimientos de cola y de liberación del lease. Si faltan, aplica primero la migración `20261117180000_whatsapp_durable_inbound.sql` y luego la `20261117182000_whatsapp_inbound_unblock_review.sql`.

   ```sql
   SELECT
     to_regprocedure('public.whatsapp_enqueue_inbound(jsonb)') AS enqueue,
     to_regprocedure('public.whatsapp_claim_inbound()') AS claim,
     to_regprocedure('public.whatsapp_release_rejected_inbound_reply(uuid,uuid)') AS release_reply;
   ```

3. En Vault configura `whatsapp_inbound_url` con el callback Supabase terminado en `?worker=1` y `whatsapp_dispatcher_secret` con el mismo valor del secreto de la función. El cron reutiliza `supabase_anon_key` o `anon_key` si existe. Ejecuta el [script del cron](../supabase/scripts/schedule_whatsapp_inbound_worker.sql) y verifica que `whatsapp-inbound-worker` figure activo. El callback público que se registra en Meta es el mismo URL sin `?worker=1`.
4. Despliega solo `whatsapp-webhook` con su `index.ts` autocontenido y confirma `verify_jwt=false` en el gateway. El código valida la firma de Meta para POST entrantes y el secreto del dispatcher para el worker.
5. En Meta for Developers, abre la app de WhatsApp de producción, entra a la configuración del webhook, confirma el callback y el token de verificación, verifica la suscripción al campo `messages` y que la app esté suscrita a la WABA correcta. El GET de verificación debe devolver el challenge. Un POST sin firma debe devolver `401 invalid_signature` una vez corregidos los secretos de entrada.
6. Con un número vinculado de pruebas, manda «Hola» y «Mis acciones». Después pulsa «Consultar acciones» en una plantilla y «Realizada» en el recordatorio de una acción de prueba. Comprueba el `200 EVENT_RECEIVED` de Meta, el job correspondiente en `whatsapp_inbound_jobs`, los logs correlacionados y una sola respuesta en el teléfono. Comprueba que el botón mutante solo modifica la acción de prueba asignada a ese usuario.
7. Si el webhook ya responde `200` y el bot sigue en silencio, mira `status`, `stage`, `attempts` y `error_code` en la cola. Un job pendiente que supera el intervalo del cron apunta al worker o al horario. Si queda en `review`, concilia el resultado con Meta antes de intervenir. Una entrada `configuration` o `webhook_not_configured` identifica qué revisar antes de llegar a la cola.

```sql
SELECT jobname, active, schedule
FROM cron.job
WHERE jobname = 'whatsapp-inbound-worker';

SELECT id, kind, status, stage, attempts, error_code, created_at, updated_at
FROM public.whatsapp_inbound_jobs
ORDER BY created_at DESC
LIMIT 20;
```

## Pruebas locales

`whatsappInboundWorker.test.ts` ejecuta el entrypoint Edge empaquetado con solicitudes firmadas y clientes Supabase y Graph simulados. Cubre comandos, botones, listas, un recordatorio que invoca el RPC Kanban, destinatario no vinculado, estados, deduplicación y errores de datos y de Meta. `whatsappIngress.test.ts` cubre verificación GET, firma POST, configuración y alcance WABA/número. Las pruebas de routing verifican los comandos existentes. El entorno local no ejecuta la migración PostgreSQL ni valida la entrega a un teléfono real.
