# R4 Pilot · plan de aprovisionamiento controlado

**R4 NO-GO. GO QA NO-GO.**  
Este documento **no** crea recursos remotos, **no** carga secretos, **no** activa LIVE y **no** cambia `connect=false`.

Fecha de verificación: 2026-11-22. Worktree: `r4/voz-ligas-local` (sin `.vercel` link).

## Hallazgos de verificación (solo lectura)

| Recurso | Resultado | Evidencia |
| --- | --- | --- |
| Proyecto Vercel `r4-pilot` | **No existe** (404 / search vacío) | Team `alonsopvs-projects` (`team_XqlNlHmLeFd6rTue4pIpjERz`). Proyectos Scrumban visibles: `tablero-operativo`, `tool-scrumban` |
| Agente Retell `scrumban-r4-pilot` | **No verificado / no provisionado** | Sin llamada a Retell (prohibida). No hay ID en el repo. **REAL NOT TESTED** |
| Adaptador `connect` | **`connect_blocked` / `connect: false`** | `resolveRetellR4LiveGate` + test `connect_blocked` PASS |
| Flags LIVE / secretos | Ausentes en este plan | No se tocaron |

## Costos conocidos (públicos; no cotización contractual)

| Concepto | Referencia pública (nov 2026) | Notas |
| --- | --- | --- |
| Uso de agente de voz Retell (ejemplo publicado) | ~**$0.11 / min** (infra + LLM ejemplo + TTS; sin telephony en web call) | [retellai.com/pricing](https://www.retellai.com/pricing). El plan del workspace puede diferir |
| Web call | Sin cargo de telephony de Retell | Misma pool de concurrencia que phone |
| Sesión piloto máx. 15 min | Orden de magnitud **≤ ~$1.65** a $0.11/min | **Acordar tope USD por escrito** antes de cualquier call |
| Proyecto Vercel `r4-pilot` | Preview/hobby en el plan del team | Sin promote a Production; costo = consumo del plan Vercel existente |
| Supabase / migraciones | **$0 en este plan** | No se provisionan DB ni RLS |

No inventar descuentos ni precios de contrato.

## Recursos a aprovisionar (requieren autorización)

### 1. Proyecto Vercel independiente `r4-pilot`

**Por qué no reutilizar `tablero-operativo`:** los secretos LIVE no deben vivir junto a QA A/B, DEV, PROD ni Preview R3.

| Paso | Detalle | ¿Hecho? |
| --- | --- | --- |
| Crear proyecto | Nombre exacto `r4-pilot` en team `alonsopvs-projects` | **NO** — requiere autorización |
| Git | **No** conectar `main` de producción; opción A: sin repo hasta GO connect; opción B: rama `r4/voz-ligas-local` solo como preview sin Production | Pendiente decisión Release |
| Production | **Deshabilitar promote / no asignar dominio prod** | Obligatoriedad de aislamiento |
| Env targets | Solo Preview (o un Custom Environment `r4-pilot` **dentro** de este proyecto nuevo, no de `tablero-operativo`) | — |
| Link local | `vercel link` al nuevo proyecto **después** de crearlo | No ahora |

**Permisos:** owner/member del team Vercel + Release Manager.

### 2. Agente Retell `scrumban-r4-pilot`

| Paso | Detalle | ¿Hecho? |
| --- | --- | --- |
| Create agent | Nombre visible `scrumban-r4-pilot` | **NO** |
| Guardar `agent_id` | → futuro `RETELL_R4_AGENT_ID` | — |
| Comparar IDs | Debe ser **≠** `RETELL_GUIDE_AGENT_ID` y **≠** `RETELL_AGENT_ID` | Gate local ya rechaza igualdad |
| Tools / webhook | **Vacío** en la primera sesión (sin `/api/guide-retell-tool`, sin Graph) | — |
| LLM / voz | Defaults de cuenta; sin Knowledge Base add-on salvo autorización | — |

**Permisos:** acceso a la cuenta Retell del producto + Voice Architect.  
**Disponibilidad actual:** no comprobada por API (prohibido). Asumir **inexistente** hasta captura en dashboard.

### 3. Controles Retell a verificar al crear el agente

Configurar bajo **Security & fallback → Data Storage Settings** (docs Retell):

| Control | Valor propuesto para piloto mínimo | Evidencia |
| --- | --- | --- |
| `data_storage_setting` | **Basic Attributes Only** (sin recordings ni transcripts almacenados) | Screenshot del agente R4 |
| `data_storage_retention_days` | **1** (o el mínimo acordado; default proveedor = forever) | Mismo screenshot |
| Live transcript en SDK | **Off** en la primera sesión | No pasar `transcript: true` |
| Webhook Guía | **No** apuntar al webhook de Guía | Lista de webhooks del agente |
| Opt-in signed URLs | Opcional | — |

`AGENT_VOICE_R4_RETAIN_AUDIO` **no** sustituye estos controles.

### 4. Secretos server-side (nombres solo; **no cargar**)

Solo en el proyecto Vercel `r4-pilot`, target Preview/Custom — **nunca** en `tablero-operativo` Production/Preview R3:

| Nombre | Tipo | Valor ahora |
| --- | --- | --- |
| `RETELL_R4_API_KEY` | Secret | **No cargar** |
| `RETELL_R4_AGENT_ID` | Plain (id, no es key) | **No cargar** |
| `AGENT_VOICE_R4` | Flag | Ausente / off |
| `AGENT_VOICE_R4_LIVE_OK` | Flag | Ausente / off |
| `VITE_AGENT_VOICE_R4` | Cliente | Solo lab local; no LIVE |

Prohibido: `VITE_RETELL*`, reutilizar `RETELL_API_KEY` / `RETELL_GUIDE_AGENT_ID` de Guía.

## Adaptador: confirmación

```text
gate → connect: false, code: connect_blocked
```

Incluso con flag + LIVE_OK + secretos R4 presentes, el código **no** llama a Retell. Cambiar eso exige un incremento de código **posterior** y autorización explícita (fuera de este plan).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Crear `r4-pilot` enlazado a Production de Scrumban | Proyecto nuevo; no promote; no dominio prod |
| Crear agente reusando Guía | Nombre + ID distintos; gate `guide_agent_reuse_denied` |
| Retención forever por default en Retell | Forzar Basic Attributes Only + retention 1 día al crear |
| Cargar secretos en `tablero-operativo` | Solo proyecto `r4-pilot` |
| Activar LIVE “para probar” | Flags off; `connect=false` |
| Costo abierto | Tope USD escrito + corte a 15 min |

## Acciones exactas que requieren autorización (parar aquí)

No ejecutar automáticamente. Marcar **GO** por fila:

| # | Acción | Quién | Costo / impacto | Estado |
| --- | --- | --- | --- | --- |
| A1 | Crear proyecto Vercel `r4-pilot` (sin Production / sin promote) | Release + owner Vercel | Plan Vercel del team | **WAITING AUTH** |
| A2 | Decidir: sin git vs preview de `r4/voz-ligas-local` | Release | Riesgo de deploy accidental | **WAITING AUTH** |
| A3 | Crear agente Retell `scrumban-r4-pilot` + storage Basic Attributes Only + retention 1d | Voice + Seguridad | ~$0 crear; uso solo al llamar | **WAITING AUTH** |
| A4 | Emitir / rotar `RETELL_R4_API_KEY` (no la de Guía) | Seguridad | Acceso a cuenta Retell | **WAITING AUTH** |
| A5 | Acordar tope USD de la sesión ≤15 min | Producto / Operador | ~$0.11/min publicado | **WAITING AUTH** |
| A6 | Cargar secretos **solo** en `r4-pilot` (sin LIVE) | Seguridad + Release | Exposición de keys | **WAITING AUTH** — no en este paso |
| A7 | Encender `AGENT_VOICE_R4` / `LIVE_OK` | Release | Habilita gate “ready”, **no** connect | **WAITING AUTH** — fase posterior |
| A8 | Incremento de código que permita `connect=true` | Ingeniería + Release | Primera red a Retell | **WAITING AUTH** — fase posterior |
| A9 | Ejecutar sesión supervisada | Voice + observador | Facturación Retell | **WAITING AUTH** — fase posterior |

**Siguiente paso permitido tras A1–A5:** solo aprovisionar recursos (Vercel + agente + política de storage).  
**No** iniciar A6–A9 sin nuevo mandato.

## Qué no se hizo en este turno

- Crear proyecto Vercel
- Crear agente Retell
- Cargar secretos / flags LIVE
- Push, merge, deploy
- Llamadas a Retell
- Cambios a Guía, WhatsApp Graph, R1–R3, QA A/B, DEV, PROD
