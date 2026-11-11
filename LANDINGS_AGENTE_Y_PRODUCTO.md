# SCRUMBAN — Spec de réplica: `/agente` y `/producto`

Documento de referencia para replicar contenido, narrativa, diseño visual y componentes de las landings comerciales actuales.

- Rutas: `/agente` (Enviardián) · `/producto` (Scrumban)
- Fecha de captura: Nov 2026
- Fuente de verdad en código: `src/pages/agent/*`, `src/pages/product/*`, `src/styles/agent-journey.css`

---

## 1. Principios compartidos

### Posicionamiento

| Landing | Producto | Público | Promesa |
|---|---|---|---|
| `/agente` | Enviardián (IA sobre Scrumban) | CEO / DG / dirección | Consultar, asignar y seguir por voz, chat y WhatsApp |
| `/producto` | Scrumban (plataforma) | CEO / DG / operaciones / líderes de área | Estrategia → objetivos → acciones → seguimiento → verificación |

### Reglas de negocio (no inventar)

- Estados reales de acción: **Pendiente · Hoy · En ejecución · Bloqueado · Retraso · Hecho · Verificado**
- **Hecho ≠ Verificado** (verificar solo quien tiene permiso)
- Confirmación antes de crear / enviar / agendar
- WhatsApp: aviso **autorizado**, no automatización inventada
- Datos de demo siempre etiquetados **«Ejemplo · demostración»**
- No inventar % de mejora de clientes ni capacidades inexistentes

### Escenarios de demostración (no mezclar IDs)

| Landing | Acción spine | Cast |
|---|---|---|
| `/agente` | **AC-1038** · Cierre de inventario | Carlos Reyes (Operaciones) |
| `/producto` | **AC-1042** · Validar propuesta con Finanzas | Laura Cruz (Comercial) → Ana Martínez (Finanzas) |

---

## 2. Sistema visual compartido (Aura / dark journey)

Ambas landings usan el mismo “campo” visual.

### Shell de página

```
home-particle-page
├── agent-guide-line--left / --right   (líneas verticales fijas, md+)
└── home-particle-journey / home-video-journey
    ├── home-*-journey__field          (sticky 100svh, video de fondo)
    │   └── HeroVideoBackdrop
    └── home-*-journey__content
        ├── Hero (home-hero-stage)
        ├── StoryRail
        ├── main.home-post.home-post--studio.home-post--tight.home-post--story
        │   └── secciones .home-post__section (surface transparent)
        └── footer oscuro
```

### Tokens visuales

| Token | Valor / comportamiento |
|---|---|
| Fondo fallback | `#0c0c0c` |
| Video | CloudFront `AGENT_BACKDROP_VIDEO` en `HeroVideoBackdrop.tsx` |
| Velo video | Gradiente negro 0.72 → 0.42 → 0.68 |
| Tipografía | `font-sans`, títulos `font-semibold tracking-tight` |
| Texto sobre video | `text-white`, leads `text-white/70–80` |
| CTA primario | Pill blanco `bg-white text-black rounded-full` |
| CTA outline | `border-white/25 bg-transparent text-white` |
| Superficie demo | `.liquid-glass` (blur 4px + borde gradiente vía `::before`) |
| Chips | `.agent-chip` / `.agent-chip--active` |
| Contenedor | `LandingShell` (`max-w-7xl`) · producto demos usan `wide` (`max-w-[90rem]`) |
| Guías | 1px `rgba(255,255,255,0.1)` a ±40rem del centro |
| CSS | `src/styles/agent-journey.css` (importado en `src/main.tsx`) |

### Liquid-glass (réplica)

- Fondo: `rgba(255,255,255,0.01)` + `backdrop-filter: blur(4px)`
- Inset highlight: `box-shadow: inset 0 1px 1px rgba(255,255,255,0.1)`
- Borde simulado: máscara con gradiente blanco 45% → 0% → 45%
- Color hijo: blanco

### Componentes UI compartidos (`src/pages/product/ProductUI.tsx`)

| Componente | Uso |
|---|---|
| `LandingShell` | Contenedor max-width |
| `LandingSection` | Sección + spacing + `surface="transparent"` + `className="home-post__section"` |
| `Logo` / `Logo light` | Marca SB |
| `Eyebrow` + `StatusToken` | Semáforo + label uppercase |
| `SectionTitle` / `SectionLead` | Con prop `dark` → blanco |
| `PrimaryCTA` | Abre `DemoRequestDialog` (default «Solicitar demostración») |
| `SecondaryCTA` | Link ancla / outline |
| `CtaTrustRow` | 3 bullets bajo CTA |
| `DemoRequestProvider` + `DemoRequestDialog` | Formulario demo → `POST /api/demo-request` |

### Story rail (patrón)

- Observa secciones con `IntersectionObserver` (`rootMargin: -28% 0px -48% 0px`)
- Progress line + cards `liquid-glass`
- **No usar `scrollIntoView`** (rompe scroll de página); solo scroll horizontal del rail
- Motion: `motion/react` (stagger + ping en activo)

---

## 3. Landing `/agente` — Enviardián

### Archivos

```
src/pages/agent/
├── AgentLandingPage.tsx
├── AgentHero.tsx
├── AgentStoryRail.tsx
├── AgentDemos.tsx          # EnviardianDemo, InstructionDemo, TeamWhatsAppDemo
├── AgentSections.tsx       # Verificación, Asistente, Integraciones, Cierre
├── HeroVideoBackdrop.tsx
├── AgentSeoHead.tsx
├── agentStory.ts
└── agentSeo.ts
```

### SEO

- Title: `SCRUMBAN | Tu operación, bajo control.`
- Description: Consulta, asigna y da seguimiento por voz, chat y WhatsApp…
- Path: `/agente`

### Orden de página

1. Nav fija transparente
2. Hero `#inicio`
3. Story rail (7 pasos)
4. Visibilidad `#visibilidad`
5. Acción `#accion`
6. WhatsApp `#whatsapp`
7. Verificación `#verificacion`
8. Asistente `#asistente`
9. Integraciones `#integraciones`
10. Cierre `#demostracion`
11. Footer (Producto · Login)

### Nav

`Visibilidad · Acción · WhatsApp · Asistente · Producto` + CTA **Solicitar demostración**

### Story rail

| Step | Verb | Object | Href |
|---|---|---|---|
| 01 | Consulta | Tu operación | `#inicio` |
| 02 | Atiende | Lo urgente | `#visibilidad` |
| 03 | Decide | Un compromiso | `#accion` |
| 04 | Sigue | Por WhatsApp | `#whatsapp` |
| 05 | Verifica | El cumplimiento | `#verificacion` |
| 06 | Conserva | Cada acuerdo | `#asistente` |
| 07 | Prepara | El siguiente paso | `#integraciones` |

### Copy por sección

#### Hero `#inicio`

- Eyebrow: **Visibilidad para dirigir**
- H1: **Tu operación, bajo control.**
- Lead: Consulta tu empresa, asigna compromisos y da seguimiento a tu equipo por voz, chat y WhatsApp.
- CTA: **Solicitar demostración** (solo primario)
- Demo: dispositivo de “llamada” / entrevista con línea rotativa del story (`interviewLines`)

#### Visibilidad `#visibilidad` — «02 · Atiende»

- Título: **Lo que necesitas saber, en una conversación.**
- Lead: Enviardián conecta OKRs, operación y compromisos, y prioriza lo que requiere intervención.
- Demo liquid-glass:
  - Consulta: *¿Qué objetivos están atrasados y qué compromisos requieren atención?*
  - Hallazgo: Bloqueo en inventarios / AC-1038 / Requiere apoyo
  - Dimensiones: OKR · BAU · KPI · Vencidos · Bloqueos · Por verificar

#### Acción `#accion` — «03 · Decide»

- Título: **De una instrucción a un compromiso claro.**
- Lead: Lenguaje natural, propuesta editable y confirmación antes de crear.
- Flujo visual: Instrucción → **Propone** → Propuesta (responsable, fecha viernes CDMX, prioridad Alta, evidencia)
- Interacción: Confirmar / Cancelar (estado local; no escribe backend)

#### WhatsApp `#whatsapp` — «04 · Sigue»

- Título: **El seguimiento sucede donde trabaja tu equipo.**
- Lead: Aviso autorizado, reportes, apoyo y evidencia por WhatsApp. El tablero refleja el cambio.
- Demo: mock WhatsApp (verde `#075e54`) + panel «En Scrumban»
- Respuestas: En proceso · Requiero apoyo · Realizada · (+ evidencia)
- Nota: Hecho no es verificado; aviso solo cuando se solicita

#### Verificación `#verificacion` — «05 · Verifica»

- Título: **No solo sabes qué se reportó. Sabes qué se cumplió.**
- Lead: Evidencias, historial y validación autorizada. Hecho no cierra el cumplimiento.
- Chips: Reportada como Hecho ↔ Verificada por quien tiene permiso
- Historial del story + botón Verificar

#### Asistente `#asistente` — «06 · Conserva»

- Título: **Habla de tu empresa. Conserva cada acuerdo.**
- Tabs/chips: chat · pdf · compartir
- Contenido: chat del story, resumen de sesión, nota de compartir WhatsApp (si permiso)

#### Integraciones `#integraciones` — «07 · Prepara»

- Título: **De la conversación a tener el siguiente paso listo.**
- Gmail draft + Calendar proposal (no envía / no crea sin confirmar)
- Datos: Jorge Mendoza · seguimiento AC-1038 · viernes 10:00–10:30 CDMX

#### Cierre `#demostracion`

- Título: **Más claridad para decidir. Más seguimiento para ejecutar.**
- CTAs: Solicitar demostración · Probar Enviardián (`#visibilidad`)
- Trust: Demo con tu operación · Sin compromiso · Datos de ejemplo, no los tuyos

### Datos del story (`agentStory.ts`)

- Acción: AC-1038 · Cierre de inventario / Revisar diferencias de inventario
- Owner: Carlos Reyes · Operaciones
- Bloqueo: Requiere apoyo
- Evidencia: diferencias-inventario.pdf
- Instrucción: Asigna a Carlos… viernes 09:00, prioridad alta, evidencia documentada
- Label demo: `Ejemplo · demostración`

---

## 4. Landing `/producto` — Scrumban

### Archivos

```
src/pages/product/
├── ProductLandingPage.tsx
├── ProductHero.tsx
├── ProductStoryRail.tsx
├── ProductSections.tsx     # Coordinación, Mejora, Cierre
├── ProductDemos.tsx        # Ejecución, Visibilidad, Seguimiento, Colab, Enviardián
├── ProductUI.tsx
├── ProductVisual.tsx
├── StatusToken.tsx
├── productStory.ts
├── landingSeo.ts
├── LandingSeoHead.tsx
├── DemoRequestContext.tsx
├── DemoRequestDialog.tsx
└── …
```

Comparte `HeroVideoBackdrop` y CSS de journey con `/agente`.

### SEO

- Title: `SCRUMBAN | Plataforma de ejecución empresarial`
- Description: Conecta objetivos, equipos y compromisos…
- Path: `/producto`

### Orden de página

1. Nav fija transparente
2. Hero `#inicio`
3. Story rail (8 pasos)
4. Coordinación `#coordinacion`
5. Ejecución `#ejecucion`
6. Visibilidad `#visibilidad`
7. Seguimiento `#seguimiento`
8. Colaboración `#colaboracion`
9. Mejora `#mejora`
10. Enviardián `#enviardian`
11. Cierre `#cierre`
12. Footer (Enviardián · Login)

### Nav

`Coordinación · Ejecución · Visibilidad · Enviardián · Enviardián(link)` + CTA **Solicitar demostración**

### Story rail

| Step | Verb | Object | Href |
|---|---|---|---|
| 01 | Conecta | Estrategia | `#inicio` |
| 02 | Coordina | Áreas | `#coordinacion` |
| 03 | Ejecuta | Compromisos | `#ejecucion` |
| 04 | Ve | Riesgos | `#visibilidad` |
| 05 | Sigue | Retrasos | `#seguimiento` |
| 06 | Habla | Con contexto | `#colaboracion` |
| 07 | Mejora | Decisiones | `#mejora` |
| 08 | Consulta | Enviardián | `#enviardian` |

### Copy por sección

#### Hero `#inicio`

- Eyebrow: **Plataforma de ejecución empresarial**
- H1: **Convierte la estrategia en resultados.**
- Lead: Conecta objetivos, equipos y compromisos en un sistema que permite ejecutar, dar seguimiento y medir avances.
- CTA: **Solicitar demostración** (sin CTA secundario)
- Demo liquid-glass compacta: cadena  
  **Objetivo (OBJ-07) → Iniciativa (INI-12) → Acción (AC-1042) → Responsable (Ana Martínez)**

#### Coordinación `#coordinacion`

- Título: **Todos saben qué hacer, quién responde y qué sigue.**
- Lead: Conecta áreas, responsables y solicitudes en un mismo flujo de trabajo.
- Demo: flujo interactivo  
  Área solicitante (Laura/Comercial) → Área responsable (Ana/Finanzas) → Compromiso AC-1042 → Estado Bloqueado
- Panel lateral: pasos Solicitud · Responsable · Compromiso · Estado

#### Ejecución `#ejecucion`

- Título: **De los planes a compromisos con seguimiento.**
- Lead: Cada prioridad se traduce en acciones con responsables, fechas y criterios de cumplimiento.
- Demo: Kanban oscuro (columnas reales visibles en demo: Pendiente · En ejecución · Bloqueado · Retraso · Hecho · Verificado)
- Interacciones: **Avanzar** AC-1042 (Pendiente→Ejecución→Bloqueado→Hecho), DnD, crear acción local, detalle modal
- Nota UI: Hecho ≠ Verificado
- Cards soporte: AC-1055 (Hecho), AC-1031 (Verificado), AC-1060 (Retraso)

#### Visibilidad `#visibilidad`

- Título: **Lo que no avanza también debe ser visible.**
- Lead: Consulta objetivos, indicadores, retrasos y bloqueos desde una misma visión de gestión.
- Demo: panel «Atención esta semana»
  - Destacado: **Bloqueo AC-1042** (intervención primero)
  - Secundarios: Objetivo en riesgo · Compromiso vencido · Por verificar
  - Detalle consultable + continuidad del caso

#### Seguimiento `#seguimiento`

- Título: **Detecta retrasos antes de que escalen.**
- Lead: Identifica compromisos detenidos y facilita que los responsables reporten avances.
- Etapas interactivas:  
  Compromiso próximo a vencer → Sin actualización → Atención requerida → Responsable identificado
- CTA demo: Consultar compromiso (muestra timeline)
- Sin promesa de WhatsApp automático aquí

#### Colaboración `#colaboracion`

- Título: **Cada solicitud tiene contexto, responsable y respuesta.**
- Lead: Menos información dispersa. Más claridad para coordinar el trabajo.
- Layout: ficha del compromiso (quién solicitó/responde/necesita/acuerdo/pendiente) + hilo de mensajes revelado paso a paso
- Evidencia ejemplo: `condiciones-propuesta.pdf`

#### Mejora `#mejora`

- Título: **No solo gestiones actividades. Mejora cómo opera tu empresa.**
- Lead: Convierte la información de ejecución en seguimiento, aprendizaje y mejores decisiones.
- Cadena interactiva: Indicador → Brecha → Acción correctiva → Seguimiento
- Capacidades listadas (OKRs, indicadores/gaps, reportes, planes) — no tarjetas de módulos sueltos
- ICO 89% / meta 92% = **ejemplo de demo**

#### Enviardián `#enviardian`

- Título: **Tu información también está disponible en una conversación.**
- Lead: Consulta objetivos, acciones y bloqueos; prepara nuevas acciones por voz o texto.
- Flujo visual: Pregunta → Consulta → Respuesta → Propuesta (confirmar en demo)
- CTA: **Conocer Enviardián** → `/agente`
- Prompts ejemplo: objetivos en riesgo · acciones bloqueadas de Ana · preparar acción Legal

#### Cierre `#cierre`

- Título: **Tu estrategia necesita ejecución. Tu ejecución necesita seguimiento.**
- Sub: Conecta objetivos, responsables y resultados en una misma plataforma.
- CTAs: Solicitar demostración · Explorar Scrumban (`#ejecucion`)
- Disclaimer: indicadores de demos son ejemplos, no resultados de clientes

### Datos del story (`productStory.ts`)

- Objetivo: OBJ-07 · Mejorar cumplimiento operativo del trimestre (68% en riesgo)
- Iniciativa: INI-12 · Acelerar validaciones Comercial ↔ Finanzas
- Acción: AC-1042 · Validar propuesta con Finanzas · Alta · Hoy 18:00 · Bloqueado
- Solicitante: Laura Cruz · Comercial
- Responsable: Ana Martínez · Finanzas
- Bloqueo: Dependencia con Legal
- Label: `Ejemplo · demostración`

---

## 5. Mapa de componentes por landing

### `/agente`

| Sección | Componente | Demo principal |
|---|---|---|
| Hero | `AgentHero` | InterviewDevice / llamada |
| Rail | `AgentStoryRail` | 7 steps |
| Visibilidad | `EnviardianDemo` | Hallazgo + dimensiones |
| Acción | `InstructionDemo` | Instrucción → propuesta |
| WhatsApp | `TeamWhatsAppDemo` | Chat WA + estado tablero |
| Verificación | `AgentControlSection` | Hecho ↔ Verificado |
| Asistente | `AgentAssistantSection` | Chat / PDF / compartir |
| Integraciones | `AgentIntegrationsSection` | Gmail + Calendar |
| Cierre | `AgentCloseSection` | liquid-glass CTA |

### `/producto`

| Sección | Componente | Demo principal |
|---|---|---|
| Hero | `ProductHero` | Cadena Objetivo→…→Responsable |
| Rail | `ProductStoryRail` | 8 steps |
| Coordinación | `CoordinationSection` | Flujo entre áreas |
| Ejecución | `ProductInAction` | Kanban + avanzar |
| Visibilidad | `DashboardDemo` | Atención semanal |
| Seguimiento | `FollowUpDemo` | Etapas + timeline |
| Colaboración | `CollaborationDemo` | Ficha + hilo |
| Mejora | `ContinuousImprovementSection` | Indicador→Seguimiento |
| Enviardián | `EnviardianBridgeDemo` | Pregunta→Propuesta |
| Cierre | `CloseSection` | liquid-glass CTA |

---

## 6. Interacciones a preservar

### Agente

1. Rotación de línea de entrevista en hero (salvo `prefers-reduced-motion`)
2. Confirmación de propuesta de acción (pending/confirmed/cancelled)
3. Respuestas WhatsApp + reflejo en panel Scrumban
4. Toggle Hecho / Verificado
5. Tabs asistente
6. Drafts Gmail/Calendar solo como propuesta

### Producto

1. Coordinación: anterior/siguiente nodo del flujo
2. Kanban: avanzar AC-1042, drag & drop, alta local, modal detalle
3. Visibilidad: seleccionar ítem de atención + detalle
4. Seguimiento: etapas + consultar historial
5. Colaboración: revelar mensajes
6. Mejora: pasos de decisión
7. Enviardián: secuencia timed pregunta→consulta→respuesta→propuesta + confirmar

Todas las interacciones son **locales** (memoria React). No escriben Supabase.

---

## 7. CTA y formularios

- Primario global: abre `DemoRequestDialog`
- Endpoint: `POST /api/demo-request` (fallback mailto `demo@scrumban.mx`)
- Campos: nombre, email, empresa, tamaño de equipo, necesidad
- Copy dialog: «Solicitar demo» / contacto &lt; 24 h

Enlaces cruzados:

- Agente → `/producto`
- Producto → `/agente`

---

## 8. Responsive

| Breakpoint | Comportamiento |
|---|---|
| Desktop | Composiciones split, demos amplias (`wide` en producto), guías visibles |
| Tablet | Ocultar guías ≤1024px; evitar paneles demasiado comprimidos |
| Mobile | Una escena por vez; rails con scroll horizontal controlado; Kanban scroll-x; CTAs full-width en menú |

Densidad actual de producto: demos **compactas** (padding `p-3/3.5`, tipografía `text-xs/sm`) para agilidad visual.

---

## 9. Checklist de réplica

### Visual

- [ ] `home-particle-page` + video sticky + velo
- [ ] Guías verticales md+
- [ ] Nav transparente, logo light, CTA pill blanco
- [ ] Hero tipografía blanca + text-shadow
- [ ] Secciones `transparent` + `home-post__section`
- [ ] Demos en `.liquid-glass`
- [ ] Chips `.agent-chip`
- [ ] Story rail con observer (sin scrollIntoView de página)
- [ ] Footer oscuro

### Contenido

- [ ] Copy de títulos/leads exactos por sección
- [ ] Story data coherente (AC-1038 vs AC-1042)
- [ ] Badge «Ejemplo · demostración»
- [ ] Hecho ≠ Verificado
- [ ] CTAs Solicitar demostración + links cruzados

### Funcional

- [ ] Demo request dialog
- [ ] Interacciones locales listadas en §6
- [ ] SEO head + JSON-LD por sección
- [ ] No inventar capacidades / métricas de clientes

---

## 10. Diferencias clave entre landings

| Aspecto | `/agente` | `/producto` |
|---|---|---|
| Protagonista | Conversación / voz / WhatsApp | Tablero / coordinación / OKR |
| Historia | AC-1038 inventario | AC-1042 Comercial-Finanzas |
| Rail | 7 pasos | 8 pasos |
| Hero demo | Dispositivo llamada | Cadena estrategia→acción |
| Kanban | No (propuesta de acción) | Sí (estados reales) |
| WhatsApp mock | Sí | No (solo puente a agente) |
| Cierre secundario | Probar Enviardián | Explorar Scrumban |

---

## 11. Referencias de código

| Qué | Dónde |
|---|---|
| CSS journey / glass | `src/styles/agent-journey.css` |
| Video backdrop | `src/pages/agent/HeroVideoBackdrop.tsx` |
| Story agente | `src/pages/agent/agentStory.ts` |
| Story producto | `src/pages/product/productStory.ts` |
| UI kit landings | `src/pages/product/ProductUI.tsx` |
| Rutas | `src/routes/index.tsx` (`/agente`, `/producto`) |
| Import CSS | `src/main.tsx` |

---

*Fin del spec. Usar este documento como contrato de contenido + diseño al reconstruir o portar las landings.*
