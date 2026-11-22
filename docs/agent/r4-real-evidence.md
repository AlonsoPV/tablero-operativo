# AT-16 / AT-20 reales — evidencia requerida (no ejecutar aún)

Estas pruebas **no se corren** en este incremento. Listado para un entorno autorizado.

Leyenda: **REAL NOT TESTED**.

## AT-16 · Informe de sesión real

| Evidencia | Dato a recoger | Criterio |
| --- | --- | --- |
| Informe PDF | Archivo generado de **una** sesión R4 cerrada | Pasa `validateGuideReportForPdf`; no hay secciones inventadas |
| Trazabilidad | `sessionId`, `finalizedAt`, participantes, canal (`voice`/`link`) | Mismos IDs en UI, PDF y log |
| Procedencia | Hallazgos con `evidenceLabel` (`verified` / `said` / `hypothesis` / `recommendation`) | Cada hallazgo cita tool o “reportado en entrevista” |
| Permisos | Dueño lee; otro usuario autenticado no | 403/oculto; sin PDF |
| Idempotencia | Doble `end` / doble export | Un `reportId`; segundo cierre `duplicate=true` |
| Errores | Timeout, revoke a mitad, confirmación pública | Registro de `lastError.code`; informe no marcado listo si la sesión no cerró |
| No audio | Si retención = none | No hay blob/archivo de audio en storage |

No invocar `finalizeGuideInterview` de Guía como atajo del piloto R4 hasta impacto aprobado. El harness sintético ya cubre el contrato (`evaluateAt16Evidence`).

## AT-20 · Paridad real de canales

Corpus mínimo (mismo texto / misma propuesta esperada):

1. `Que tengo pendiente?`
2. `Cuales estan vencidas?`
3. `Prepara un seguimiento por WhatsApp para el responsable`
4. `Crea una accion para cerrar el POD manana`
5. `Crea una accion al objetivo` (aclarar)
6. Confirmación protegida (botón / UI autenticada)
7. Confirmación por liga pública (debe denegar)

| Canal | Cómo | Paridad |
| --- | --- | --- |
| Web copiloto | Sesión autenticada | Familia + propuesta de `interpretSharedIntent` |
| WhatsApp **real** | Graph **no** en este worktree | Pendiente de cablear capa compartida al router; hoy CHANNEL_GAP de producción |
| Voz Retell R4 | Agente independiente | Misma familia; confirmaciones no por utterance pública |
| OpenAI Realtime | Corrida **separada**, mismo oráculo | Comparación; no fallback |

Registrar por caso: intención, propuesta, permiso, aprobación (sí/no), resultado, error.

## Fuera de alcance de esta preparación

- Llamadas a Retell, OpenAI, Meta Graph.
- Crear usuarios o resetear contraseñas.
- Migraciones / RLS.
- GO R4 / GO QA.
