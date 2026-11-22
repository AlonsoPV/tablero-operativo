# R4 Pilot · resultado A1–A3 (aprovisionamiento controlado)

**R4 NO-GO. GO QA NO-GO.**  
Fecha: 2026-11-22. Sin push, merge, deploy, secretos, LIVE, voz ni cambios a Guía / WhatsApp / R1–R3 / QA A/B / DEV / PROD.

## A1 — Vercel `r4-pilot` · HECHO

| Campo | Valor |
| --- | --- |
| Project name | `r4-pilot` |
| Project ID | `prj_2i5e2Fm748XrErecY42nVNxTw5aQ` |
| Team | `alonsopvs-projects` (`team_XqlNlHmLeFd6rTue4pIpjERz`) |
| Framework | `vite` |
| Git conectado | **No** |
| Deployments | **0** (`latestDeployment: null`, `live: false`) |
| Domains | **[]** |
| Env vars | **[]** (ningún secreto importado) |
| Vercel Auth (SSO) | `deploymentType: all` |
| Preview deployments | `previewDeploymentsDisabled: true` |
| Auto custom domains | `false` |

**Permisos:** autenticado como `alonsopv` / `alpeva96@gmail.com`, plan **Hobby**, team default = el anterior. Crear el proyecto no exige upgrade.

**Costo:** proyecto vacío en Hobby = **sin cargo adicional de uso** respecto al plan actual. No se generó deployment ni bandwidth. (Retell y Production siguen fuera de alcance.)

**Aislamiento:** distinto de `tablero-operativo` y `tool-scrumban`. Sin variables, dominios ni DB compartidas.

## A2 — Git `r4/voz-ligas-local` · BLOQUEADO

| Chequeo | Resultado |
| --- | --- |
| Rama local | Existe: `r4/voz-ligas-local` (ahead 20 vs `origin/main`) |
| Remoto `origin` | `https://github.com/AlonsoPV/tablero-operativo.git` |
| `git ls-remote --heads origin r4/voz-ligas-local` | **Vacío** — la rama **no existe en el remoto** |
| Vinculación al proyecto Vercel | **No realizada** (requeriría push + connect Git + riesgo de deploy) |

**Acción que requiere autorización específica:**

1. `git push -u origin r4/voz-ligas-local` (o remoto dedicado).
2. Conectar solo esa rama al proyecto `r4-pilot` (nunca `main` / `dev` / Production).
3. Confirmar que preview deployments siguen deshabilitados o que el primer deploy está explícitamente autorizado.

**No se hizo push ni `vercel link`.**

## A3 — Retell `scrumban-r4-pilot` · BLOQUEADO

| Motivo | Detalle |
| --- | --- |
| API key | Crear agente exige `Authorization` a Retell. Prohibido cargar/generar keys y reutilizar `RETELL_API_KEY` / agente de Guía |
| Dashboard | No se abrió sesión Retell ni se ejecutó create-agent |
| Agent ID | **No creado** |

### Configuración objetivo (cuando se autorice A3 con key R4 o consola)

| Setting | Valor propuesto |
| --- | --- |
| Nombre | `scrumban-r4-pilot` |
| Tools | Ninguno |
| Webhooks | Ninguno |
| Acciones externas | Ninguna |
| `data_storage_setting` | **`basic_attributes_only`** (API/docs Retell) |
| `data_storage_retention_days` | **`1`** |
| Credenciales | Key **nueva** `RETELL_R4_API_KEY` (no Guía) |

**Confirmación pendiente del operador:** ¿aceptas **Basic Attributes Only** + retención **1 día** para el agente R4?

### Limitaciones de privacidad (aunque se configure lo anterior)

- Default Retell sin config = `everything` + retención forever.
- Con Basic Attributes Only: Retell **no** guarda transcripts/recordings/logs; Get Call no los devolverá.
- Si en el futuro hay webhooks, el payload puede traer transcript/recording ~10 min; no hay webhook R4 en este paso.
- `AGENT_VOICE_R4_RETAIN_AUDIO` **no** controla Retell.
- Metadata básica del call (`call_id`, timings, status) puede conservarse internamente.

## Controles no tocados

| Control | Estado |
| --- | --- |
| `connect=false` / `connect_blocked` | Intactos |
| Flags LIVE | No activados |
| Secretos | No cargados |
| Guía / WhatsApp Graph / R1–R3 / QA A/B / DEV / PROD | Sin cambios |

## Resumen GO

| Ítem | Estado |
| --- | --- |
| A1 Vercel | **DONE** |
| A2 Git | **BLOCKED** — falta push de rama + auth de connect |
| A3 Retell | **BLOCKED** — falta key R4 o creación manual en dashboard + confirmación storage |
| R4 piloto real | **NO-GO** |
| GO QA | **NO-GO** |

**Siguiente mandato posible (no iniciado):** autorizar push de `r4/voz-ligas-local` y/o creación manual del agente Retell con Basic Attributes Only + retention 1d.
