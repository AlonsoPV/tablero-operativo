# R4 Pilot · A2 Git prep (sin push)

**R4 NO-GO. GO QA NO-GO.**  
**Veredicto A2: BLOCKED** — el push a `origin` dispararía Preview en `tablero-operativo`. Preparación local lista; falta autorización de mitigación o aceptación del Preview.

Fecha: 2026-11-22. **Push no ejecutado.** Git no conectado a `r4-pilot`.

## Verificaciones

| Chequeo | Resultado |
| --- | --- |
| Worktree | `C:\Users\alpev\scrumban-r4`, limpio (`git status` sin cambios) |
| Rama | `r4/voz-ligas-local` |
| HEAD (candidato) | `ca56865ebcf52eb85b1d80ca719f5c29d097bdc2` (`ca56865`) |
| vs `origin/main` | **22 commits** ahead |
| `origin/main` SHA | `48271816d4cc69e6b3220e73c338c31a09e56e39` |
| Remoto `origin` | `https://github.com/AlonsoPV/tablero-operativo.git` |
| Remoto `scrumban` | `https://github.com/AlonsoPV/tool_scrumban.git` (no es destino del push R4) |
| Rama remota `r4/voz-ligas-local` | **No existe** (`ls-remote` vacío; GitHub API **404**) |
| Secretos en commits | Solo placeholders en `.env.example` (comentados). `.env` / `.env.development` **gitignored**, no en el diff |
| Guía / finalize / useRetellGuideCall | **Sin cambios** en el rango |
| Diff R4 | `api/_shared/r4/**`, `src/features/r4-lab/**`, docs R4, gate UI flag-off en `AssistantLaneChooser` / routes / constants |

### ¿El push dispara deployment automático?

| Proyecto Vercel | Git link | Efecto de `git push origin r4/voz-ligas-local` |
| --- | --- | --- |
| **`tablero-operativo`** (`prj_k71rhUH9uTFEEPWofF3NyyhcKEDn`) | **Sí** → `AlonsoPV/tablero-operativo` | **Riesgo alto:** Preview deployment automático de la nueva rama (Production sigue en `main` vía dominio `…-git-main-…`) |
| **`tool-scrumban`** | `AlonsoPV/tool_scrumban` | **Ninguno** (otro repo) |
| **`r4-pilot`** (`prj_2i5e2Fm748XrErecY42nVNxTw5aQ`) | **Ninguno** | **Ninguno** (sin Git; 0 deployments; env `[]`) |

`r4-pilot` sigue: sin Git, `live: false`, `latestDeployment: null`, domains `[]`, envs `[]`, preview deployments disabled, Vercel Auth all.

## Preparación (no ejecutar)

### SHA candidato

```text
ca56865ebcf52eb85b1d80ca719f5c29d097bdc2
```

### Comando exacto de push (cuando se autorice **y** se mitigue Preview)

```powershell
cd C:\Users\alpev\scrumban-r4
git rev-parse HEAD
# Debe imprimir: ca56865ebcf52eb85b1d80ca719f5c29d097bdc2
# Si difiere, NO pushear; revalidar.

git push -u origin r4/voz-ligas-local
```

No usar `--force`. No pushear a `main`. No `git push scrumban …` salvo mandato aparte.

### Verificar SHA remoto (post-push)

```powershell
git ls-remote --heads origin r4/voz-ligas-local
# Esperado: <sha> refs/heads/r4/voz-ligas-local
# Comparar: git rev-parse HEAD
```

### Vinculación posterior exclusiva con `r4-pilot` (fase **después** del push; no ahora)

1. En Vercel proyecto `r4-pilot` → Settings → Git → Connect `AlonsoPV/tablero-operativo`.
2. Production Branch: **dejar vacío / no usar `main`** o fijar una rama sentinela que **nunca** se pushee (evitar Production).
3. Mantener `previewDeploymentsDisabled: true` **o** Ignored Build Step hasta auth de deploy.
4. Production: **no** assign domain; **no** promote.
5. Opcional: Custom Environment `r4-pilot` con branch tracking **solo** `r4/voz-ligas-local`.

**Configuraciones que crearían deploy/Production si se hacen mal:**

- Conectar Git a `r4-pilot` **sin** `previewDeploymentsDisabled` → Preview al push.
- Production Branch = `main` o `r4/voz-ligas-local` + promote/domain → Production.
- Ignorar el link existente de `tablero-operativo` al mismo repo → Preview allí al primer push.

## Mitigaciones que requieren autorización (elegir una)

| Opción | Qué autorizar | Efecto |
| --- | --- | --- |
| **M1** | Push aceptando Preview en `tablero-operativo` | Deploy Preview R4 en proyecto de producto (flags off; riesgo de ruido/CI) |
| **M2** | Ignored Build Step en `tablero-operativo` para `r4/*` (p. ej. `git branch --show-current \| grep -q '^r4/' && exit 0 \|\| exit 1` invertido) | Evita build en Preview R4; **toca** settings del proyecto producto |
| **M3** | Repo/fork dedicado solo R4 + link solo a `r4-pilot` | Aislamiento total; más setup |
| **M4** | No push; solo bundle/artifact local | Sin remoto |

Hasta elegir M1–M4: **no pushear**.

## Veredicto

| Campo | Valor |
| --- | --- |
| A2 | **BLOCKED** |
| Motivo | Push a `origin` (`tablero-operativo` GitHub) → Preview automático en Vercel `tablero-operativo`. `r4-pilot` no se vería afectado por el push solo |
| Preparación | Completa (SHA, comando, verificación, diseño de link) |
| Push / connect / deploy | **No ejecutados** |

**R4 NO-GO. GO QA NO-GO.**
