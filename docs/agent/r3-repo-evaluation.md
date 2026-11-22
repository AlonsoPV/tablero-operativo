# R3 · evaluación de repositorios

Etapa 1 de [githubSkills.md](../prompts/githubSkills.md). Fecha de la revisión: 2026-11-20.

Se leyeron metadatos públicos, READMEs y documentación de arquitectura. No se clonó ningún repositorio, no se ejecutó `npx`, `uv`, instaladores ni scripts ajenos, y no se añadió ninguna dependencia al proyecto.

## Alcance de la inspección local

| Línea | Commit | Qué se usó |
| --- | --- | --- |
| Checkout de esta revisión | `r1/agente-confiable` @ `f6b6e00` | Orquestador, contexto de sesión, docs `docs/agent/*` y migración local de `agent_session_context` |
| Freeze que cita el prompt | `qa/supabase-local` @ `640fa52`, más el commit documental `7d34f83` | Existen en el repo y también contienen el orquestador. No son ancestros de `f6b6e00` |

Esta etapa no mueve, fusiona ni rebasea ninguna de las dos líneas. R0 sigue NO-GO. R1 permanece congelado para QA local. R2 no se habilita.

## Memoria que ya existe

| Pieza | Qué conserva | Límite |
| --- | --- | --- |
| `agent_session_context` | Consulta activa e IDs de acciones, por dueño, canal y hash de sesión. TTL 30 min. Se invalida si cambia la huella de capacidades | Carga ≤ 16 KB. Sin títulos ni nombres en la fila persistida. Migración local, no aplicada en remoto |
| `createMemorySessionContextStore` | El mismo contrato en memoria de proceso | En serverless se pierde entre instancias |
| `guide_sessions.consult_log` | Rehidratación de la consulta activa en voz | No es memoria de acuerdos |
| Historial del LLM del canal | Turno actual | No es almacén durable ni autorizado por RLS |
| Supabase (Kanban, OKRs, usuarios) | Estado operativo | Fuente de verdad. Una memoria no puede sustituirlo |

No hay índice documental, FTS de procedimientos ni tabla de acuerdos. `AT-21` en [acceptance-tests.md](acceptance-tests.md) ya describe el criterio de conocimiento documental y sigue sin implementar.

## Repositorios localizados

### Agent Memory — [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory)

| Campo | Hecho observado |
| --- | --- |
| Licencia | Apache-2.0. El sitio del proyecto declara que no hay capa de pago retenida |
| Actividad | Repositorio público creado el 2026-02-25. Al revisar: del orden de 30 mil estrellas y cientos de issues abiertos |
| Qué es | Servidor local de memoria para agentes de programación (Claude Code, Cursor, Codex y clientes MCP). Captura sesiones con hooks, comprime, indexa y reinyecta contexto |
| Runtime | Motor `iii`, API en `127.0.0.1:3111`, visor en `3113`, WebSocket interno del motor en `49134`. Estado en disco del usuario (`%APPDATA%\agentmemory` en Windows) |
| Recuperación | BM25 sin clave. Embeddings locales o remotos solo si se configura un proveedor |
| Aislamiento | `AGENT_ID` etiqueta escrituras. `AGENTMEMORY_AGENT_SCOPE=isolated` filtra por ese id de agente. No modela organización, proyecto Supabase, rol ni RLS |
| Escritura | Los hooks registran la actividad de la sesión. Eso guarda conversaciones y entradas de herramientas salvo el filtro de secretos |

Encaja en el puesto de un desarrollador. No encaja en el asistente multicanal de Scrumban: exigiría un proceso largo junto a Vercel, una segunda identidad y una captura que el prompt prohíbe.

### OpenViking — [volcengine/OpenViking](https://github.com/volcengine/OpenViking)

| Campo | Hecho observado |
| --- | --- |
| Licencia | Servidor principal AGPL-3.0. CLI (`crates/ov_cli`) y ejemplos en Apache-2.0. El README pide autorización escrita de Volcano Engine para traducir una porción sustancial del código a otro lenguaje |
| Versión vista | Paquete PyPI `openviking` 0.5.5, Python ≥ 3.10. El quickstart recomienda Python 3.13 y `uv` |
| Qué es | Base de contexto con URI `viking://`. Une recursos (documentos), memorias y skills. Recuperación vectorial con análisis de intención y rerank opcionales |
| Dependencias de modelo | El quickstart pide un modelo de embeddings y un VLM con tool-calling. La ingesta y las respuestas consumen ese proveedor y se cobran según su tarifa |
| Multi-tenant | Un servidor, frontera `account` / `user`. Recursos compartidos dentro de la cuenta. Memorias y sesiones aisladas por usuario |
| ACL | Aplica solo a `viking://resources` y viene **desactivado**. Con el interruptor apagado no se exige la ACL. La raíz, cuando se activa, concede `user:* = manage` hasta que un directorio restrinja la herencia |
| Superficie | Servidor HTTP propio. El prompt prohíbe exponer ese índice al navegador |

Cubre documentos y memoria a la vez, que es la duplicación que el prompt pide evitar. El ACL apagado por defecto y la licencia AGPL del servidor son bloqueos para adoptarlo sin una revisión legal y un diseño de permisos nuevo. Ese diseño sería una segunda frontera, distinta de `resolveAccessCapabilities` y de las políticas RLS ya probadas en PGlite.

### Cyber Security Skills

No hay un único repositorio con ese nombre que cubra RLS, IDOR, JWT, prompt injection y retención sin incluir herramientas ofensivas. Se revisaron candidatos públicos y no se instaló ninguno.

| Repositorio | Licencia y perfil | Decisión |
| --- | --- | --- |
| [warathepj/cyber-security-skills](https://github.com/warathepj/cyber-security-skills) | MIT. Skill de auditoría OWASP Top 10 (dependencias, secretos, SAST por patrones, cabeceras). Creado el 2026-02-18, actividad pequeña | No se instala. El nombre coincide; el alcance no cubre el orquestador ni la memoria. Sirve solo como referencia de informe por severidad |
| [OWASP/secure-agent-playbook](https://github.com/OWASP/secure-agent-playbook) | Procedimientos defensivos: permisos del agente, inyección, exfiltración, MCP, AISVS | No se instala. La Etapa 1 redacta el modelo de amenazas con esas categorías, sin ejecutar el playbook ni sus scripts |
| [AS-FOSS/aegis-skills](https://github.com/AS-FOSS/aegis-skills) | Skills defensivos de código, servidor y operación, con scripts de evidencia | No se instala. El prompt prohíbe ejecutar scripts descargados |
| [SubhiSec/claude-ai-cyber-security-skills](https://github.com/SubhiSec/claude-ai-cyber-security-skills) y [Garyson26/Trident-SecOps-Skills](https://github.com/Garyson26/Trident-SecOps-Skills) | Bug bounty, recon y, en Trident, desarrollo de exploits y emulación ofensiva. Incluyen `INSTALL.sh` / `INSTALL.ps1` o instaladores de agente | Descartados. Dan capacidad ofensiva y piden ejecutar instaladores. Contradicen el entorno aislado y el mínimo privilegio |
| [yogiex/opencode-cyber-security-skills](https://github.com/yogiex/opencode-cyber-security-skills) | MIT. Mezcla auditoría con red team | Descartado por la misma razón |

No se consultó una base de CVE contra un lockfile de estos proyectos, porque no se instalaron. El riesgo de cadena de suministro que sí está demostrado es operativo: instaladores remotos, herramientas ofensivas y, en OpenViking, un servicio de red con ACL desactivada.

## Consumo estimado

Cifras de orden de magnitud para una POC local con datos sintéticos. No hay medición en este repo: no se levantó ningún servicio externo.

| Opción | CPU / RAM | Disco | Tokens y embeddings | Coste de proveedor |
| --- | --- | --- | --- | --- |
| Agent Memory | Un proceso `iii` residente más el visor. Embeddings locales descargan un modelo | Directorio de estado fuera del repo, creciente con cada hook | BM25 no llama a un modelo. Compresión LLM y embeddings remotos sí, y hay que encenderlos | Cero con BM25. Distinto de cero si se activa un proveedor |
| OpenViking | Servicio Python aparte del runtime Node. Índice vectorial y parseo de documentos | Árbol `viking://` más vectores | Cada alta y cada búsqueda con intención o rerank llama a embeddings y puede llamar a un VLM | Tarifa del proveedor de modelos desde la primera ingesta |
| Nativo en Postgres | La consulta FTS corre en la misma base local de la POC. Sin proceso nuevo | Filas de texto acotadas (memorias confirmadas y documentos autorizados) | El modelo del canal solo ve un recorte citado, con tope propuesto de 800 tokens. Sin embeddings en la POC | Cero de infraestructura nueva. El coste del turno es el que ya tiene el canal, más ese recorte |

## Cuatro alternativas

| Criterio | Solo Agent Memory | Solo OpenViking | Ambos | Nativo en Supabase |
| --- | --- | --- | --- | --- |
| Acuerdos, decisiones, preferencias y pendientes con confirmación | La captura por hooks guarda la sesión entera | Memorias por usuario, extraídas al archivar la sesión | Dos almacenes de lo mismo | Alta explícita, con estado `confirmed` |
| Procedimientos y documentos con versión y cita | Fuera de su diseño | Núcleo del producto | OpenViking | Filas versionadas y FTS en español |
| Una sola autorización (JWT, capacidades, RLS) | Identidad de agente local | `account` / `user` / ACL propia | Dos fronteras extra | Las funciones y políticas ya existentes |
| Aislamiento por proyecto Supabase | No | No coincide con el proyecto | No | El mismo límite que Kanban y OKRs |
| Flag apagado deja R1 intacto | El servidor y los hooks siguen vivos | El servicio sigue indexando | Ambos siguen vivos | Sin filas nuevas y sin llamada, el turno es el de R1 |
| Fallo del almacén | El agente de código depende del servidor local | Depende del servicio y del modelo | Dos puntos de fallo | La respuesta sigue con el tablero y declara la memoria no disponible |
| Licencia apta para seguir en este repo sin revisión legal | Apache-2.0 | AGPL-3.0 en el servidor | AGPL-3.0 | La del proyecto |
| Encaja en Vercel + Supabase sin cuenta nueva | No | No | No | Sí |

## Decisión

Se adopta la alternativa nativa. Agent Memory y OpenViking no se integran. Ningún skill de ciberseguridad se instala en el agente, en Cursor ni en el runtime del producto.

La revisión de seguridad de R3 queda en [r3-threat-model.md](r3-threat-model.md), escrita en esta etapa, y en las pruebas de [r3-acceptance-tests.md](r3-acceptance-tests.md), que todavía no se ejecutan. La forma concreta del almacén está en [r3-memory-knowledge-security-plan.md](r3-memory-knowledge-security-plan.md).

**NO-GO** para instalar estos repositorios y para cualquier validación alojada. **GO condicionado** a una POC local posterior, solo después de aprobar esa arquitectura.
