# SCRUMBAN + ENVIARDIÁN — IMPLEMENTACIÓN SEO, GEO Y CONVERSIÓN

Actúa como consultor SEO técnico senior, estratega de posicionamiento B2B SaaS, especialista en Google Search, arquitectura de información, datos estructurados, React, Vite, Vercel y optimización de rendimiento web.

## OBJETIVO

Implementar una estrategia SEO profesional para las dos landings comerciales existentes:

1. Scrumban — plataforma de gestión y ejecución empresarial.
2. Enviardián — asistente empresarial con inteligencia artificial.

El objetivo es mejorar la indexación, relevancia temática, visibilidad orgánica y captación de prospectos empresariales en México.

No reconstruir las páginas ni alterar su diseño actual.

Conservar la narrativa comercial, los componentes interactivos y las demostraciones existentes.

## FASE 1 — AUDITORÍA TÉCNICA

Identificar en el repositorio:

- Rutas reales de ambas landings.
- Dominio público definitivo.
- Framework y sistema de routing.
- Renderizado CSR, SSR, SSG o prerender.
- Gestión actual de metadatos.
- Canonicals.
- Sitemap.
- Robots.txt.
- Open Graph.
- Twitter Cards.
- Datos estructurados.
- Estructura de encabezados.
- Enlaces internos.
- Rendimiento.
- Recursos JavaScript y CSS.
- Comportamiento de indexación.
- Rutas privadas de la aplicación.

No asumir que las landings tienen rutas específicas sin comprobarlas.

No utilizar rutas privadas como páginas comerciales.

Generar un reporte de problemas antes de aplicar cambios.

## FASE 2 — MAPA DE KEYWORDS

Separar claramente la intención de búsqueda.

### SCRUMBAN

Keyword principal propuesta:

"software de gestión empresarial"

Keywords secundarias:

- software de gestión de operaciones
- plataforma de ejecución empresarial
- seguimiento de compromisos
- gestión de equipos de trabajo
- software OKR
- gestión de tareas empresariales
- control de actividades empresariales
- seguimiento de objetivos estratégicos
- tableros de gestión empresarial

### ENVIARDIÁN

Keyword principal propuesta:

"asistente de IA para empresas"

Keywords secundarias:

- asistente empresarial con inteligencia artificial
- asistente de voz para empresas
- IA para gestión de tareas
- IA para seguimiento de compromisos
- asistente IA para operaciones
- asistente IA con WhatsApp
- consultas empresariales con IA
- inteligencia artificial para gestión empresarial

Tratar estas keywords como hipótesis iniciales.

No afirmar volúmenes de búsqueda, rankings o dificultades sin datos verificables.

Evitar keyword stuffing y canibalización.

## FASE 3 — METADATOS POR LANDING

### SCRUMBAN

SEO title:

"Scrumban | Software de Gestión y Ejecución Empresarial"

Meta description:

"Conecta objetivos, equipos y compromisos. Gestiona acciones, OKRs y operaciones con seguimiento, indicadores y responsables."

H1 visible:

"Convierte la estrategia en resultados."

### ENVIARDIÁN

SEO title:

"Enviardián | Asistente de IA para Empresas"

Meta description:

"Consulta tu operación por voz o chat, identifica bloqueos, prepara acciones y da seguimiento a tu equipo con inteligencia artificial."

H1 visible:

"Tu operación, bajo control."

Implementar metadatos específicos por ruta:

- title
- description
- canonical absoluto
- robots
- og:title
- og:description
- og:type
- og:url
- og:image
- og:image:alt
- twitter:card
- twitter:title
- twitter:description
- twitter:image
- html lang="es-MX"

Utilizar el dominio público definitivo identificado en el proyecto.

No inventar URLs.

Crear imágenes Open Graph específicas de cada producto, utilizando el branding existente.

## FASE 4 — SEO EN REACT Y VERCEL

Verificar si los metadatos se entregan en el HTML inicial.

Si las páginas dependen completamente de client-side rendering, evaluar prerender o SSG para las rutas comerciales.

Priorizar que los motores de búsqueda reciban:

- H1.
- Contenido comercial principal.
- Metadatos.
- Datos estructurados.
- Enlaces internos.

No introducir una migración completa de framework si no es necesaria.

No afectar el funcionamiento de la aplicación autenticada.

Evitar duplicación de etiquetas SEO.

Comprobar el HTML final servido en producción o preview.

## FASE 5 — SEO SEMÁNTICO

Mantener los H1 comerciales actuales.

Organizar H2 y H3 alrededor de capacidades verificadas.

### SCRUMBAN

Temas que deben quedar representados semánticamente:

- Gestión empresarial.
- Coordinación entre áreas.
- Gestión de acciones y responsables.
- Kanban.
- OKRs.
- Indicadores BAU.
- Seguimiento operativo.
- Verificación de cumplimiento.
- Comunicación y mejora continua.

### ENVIARDIÁN

Temas:

- Asistente de IA empresarial.
- Consultas de información operativa.
- Creación de propuestas de acciones.
- Seguimiento por WhatsApp.
- Asistente por voz.
- Historial e informes ejecutivos.
- Integración condicionada con Gmail.
- Integración condicionada con Calendar.
- Confirmación y control humano.

No agregar párrafos largos a la landing.

Integrar el vocabulario SEO de forma natural en:

- Encabezados secundarios.
- Descripciones breves.
- Etiquetas visibles.
- Enlaces contextuales.
- Texto alternativo.
- Contenido de apoyo útil.

No utilizar texto oculto, invisible o generado exclusivamente para buscadores.

## FASE 6 — DATOS ESTRUCTURADOS

Implementar JSON-LD válido.

### SCRUMBAN

Evaluar:

- Organization.
- WebSite.
- WebPage.
- SoftwareApplication.
- BreadcrumbList, cuando corresponda.

### ENVIARDIÁN

Evaluar:

- WebPage.
- SoftwareApplication.
- Organization como proveedor.

Relacionar ambas páginas mediante sus entidades y URLs reales.

No inventar:

- Precios.
- Ratings.
- Reviews.
- Usuarios.
- Testimonios.
- Premios.
- Ofertas.
- Datos corporativos.

Incluir únicamente propiedades respaldadas por información real.

No utilizar FAQPage esperando resultados enriquecidos que no correspondan a este tipo de sitio.

Validar la sintaxis y elegibilidad de los datos estructurados.

## FASE 7 — ARQUITECTURA E INDEXACIÓN

Generar o corregir:

- robots.txt
- sitemap.xml
- canonical tags
- enlaces internos

Indexar únicamente las rutas públicas que tengan contenido útil.

Revisar rutas como:

- /dashboard
- /okrs
- /kanban
- /kanban-equipos
- /asistente-ia
- /asistente-ia/historial

Si son rutas privadas o de aplicación autenticada, impedir su indexación mediante mecanismos adecuados.

No confiar únicamente en robots.txt para excluir páginas privadas.

No bloquear recursos necesarios para renderizar las landings.

No incluir páginas privadas en el sitemap.

Evitar canonical hacia una landing distinta.

## FASE 8 — SEO PARA MOTORES DE RESPUESTA CON IA

Optimizar la claridad de las entidades y funcionalidades.

Los motores de búsqueda y sistemas de respuesta deben poder identificar:

Qué es Scrumban.

Para quién está diseñado.

Qué problemas resuelve.

Qué funcionalidades ofrece.

Qué es Enviardián.

Cómo se integra con Scrumban.

Qué operaciones requieren confirmación.

Qué integraciones están condicionadas.

Crear una relación semántica clara entre ambas páginas.

No utilizar contenido artificial, repetitivo o inflado.

Priorizar información específica, comprobable y útil.

No prometer visibilidad garantizada en sistemas de IA.

## FASE 9 — ENLACES INTERNOS

Crear enlaces contextuales entre ambas landings.

Desde Scrumban:

"Conoce Enviardián, el asistente de IA conectado con tu operación."

Desde Enviardián:

"Descubre Scrumban, la plataforma que organiza y da seguimiento al trabajo."

Utilizar las rutas reales existentes.

Evitar enlaces rotos.

No sobrecargar el menú principal.

## FASE 10 — RENDIMIENTO Y CORE WEB VITALS

Auditar:

- LCP.
- INP.
- CLS.
- JavaScript inicial.
- Peso de imágenes.
- Fuentes.
- Animaciones.
- Lazy loading.
- Recursos externos.
- Renderizado del hero.

Optimizar:

- Imágenes AVIF/WebP.
- Dimensiones explícitas.
- Carga diferida de demostraciones secundarias.
- División de código.
- Estabilidad visual.
- Recursos críticos.
- Accesibilidad.

No aplicar lazy loading al elemento LCP principal si perjudica su carga.

No sacrificar las demostraciones comerciales para obtener puntuaciones artificiales.

Validar desktop y móvil.

## FASE 11 — SEO DE CONVERSIÓN

Conservar CTA principales:

"Solicitar demostración"

"Explorar la plataforma"

"Probar Enviardián"

Revisar:

- Destino real.
- Eventos de conversión.
- Formularios.
- Accesibilidad.
- Navegación móvil.
- Estados de carga.
- Errores.

Si existe una herramienta de analítica, reutilizarla.

No instalar múltiples herramientas redundantes.

No afirmar que una conversión fue registrada sin confirmación.

## FASE 12 — VALIDACIÓN

Comprobar:

1. Cada landing tiene un title único.
2. Cada landing tiene description única.
3. Existe un H1 principal por página.
4. Los H2 describen funcionalidades reales.
5. Los canonicals son correctos.
6. El HTML inicial es indexable.
7. Los datos estructurados son válidos.
8. El sitemap contiene solo URLs públicas.
9. Las rutas privadas están protegidas.
10. Las imágenes tienen alt útil.
11. Los enlaces internos funcionan.
12. No hay errores de hidratación.
13. No hay duplicación de metadatos.
14. Las páginas funcionan en móvil.
15. No se afectó la lógica del producto.

## ENTREGABLES

Implementar los cambios en el repositorio existente.

Entregar:

- Auditoría SEO inicial.
- Mapa de keywords por landing.
- Metadatos implementados.
- Datos estructurados.
- Sitemap y robots.
- Mejoras semánticas.
- Optimizaciones de rendimiento.
- Archivos modificados.
- Validaciones ejecutadas.
- Pendientes de configuración externa.

No desplegar automáticamente a producción.

## CRITERIO DE ÉXITO

Las dos landings deben quedar técnicamente preparadas para posicionarse en búsquedas comerciales distintas.

Scrumban debe asociarse con gestión y ejecución empresarial.

Enviardián debe asociarse con asistentes de IA para empresas.

Ambas deben comunicar claramente sus funcionalidades, compartir autoridad temática y dirigir al visitante hacia una demostración comercial.

**SEO integrado al producto y a la narrativa, sin sacrificar diseño, claridad ni conversión.**