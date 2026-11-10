# SCRUMBAN — AUDITORÍA Y OPTIMIZACIÓN INTEGRAL DE DATOS, DASHBOARD Y AGENTE IA

Actúa como arquitecto senior de software, ingeniero de datos, especialista en Supabase/PostgreSQL, React, TypeScript, seguridad RLS, analítica empresarial y agentes de inteligencia artificial.

Tu misión es auditar, corregir y optimizar la consistencia, integridad, precisión y disponibilidad de toda la información operativa y estratégica de Scrumban.

## OBJETIVO PRINCIPAL

Garantizar que la información presentada en:

- https://scrumbanemx.vercel.app/dashboard
  - Tab OKR
  - Tab BAU
- https://scrumbanemx.vercel.app/okrs
- https://scrumbanemx.vercel.app/kanban
- https://scrumbanemx.vercel.app/kanban-equipos

sea consistente con los datos reales del sistema y que el agente IA pueda consultar e interpretar esa misma información, respetando los permisos del usuario.

No se permite inventar, estimar arbitrariamente, duplicar ni simular información.

No asumas que las pantallas son correctas. Compruébalo contra la base de datos y las reglas de negocio existentes.

---

# 1. AUDITORÍA DEL MODELO DE DATOS

Inspecciona la arquitectura actual:

- Tablas de Supabase.
- Relaciones y claves foráneas.
- Vistas y funciones SQL.
- Consultas del frontend.
- Servicios y hooks.
- Edge Functions.
- APIs.
- Triggers.
- Políticas RLS.
- Funciones del agente IA.
- Mecanismos de caché.
- Suscripciones Realtime.
- Filtros globales y locales.

Identifica la fuente real de cada indicador y registro.

Construye una matriz de trazabilidad:

Métrica → Fuente de datos → Filtros → Fórmula → Pantallas consumidoras → Herramienta IA.

No crees nuevas tablas o vistas si las existentes pueden reutilizarse correctamente.

---

# 2. DEFINIR UNA ÚNICA FUENTE DE VERDAD

Establece una capa centralizada de consultas y métricas.

El Dashboard, los módulos operativos y el agente IA deben utilizar definiciones compartidas.

Evita:

- Consultas duplicadas con criterios distintos.
- Cálculos independientes entre componentes.
- Estados interpretados de forma diferente.
- Filtros inconsistentes.
- Datos estáticos utilizados como resultados reales.
- Conteos generados desde subconjuntos incompletos.
- Valores predeterminados que aparenten datos reales.
- Respuestas IA basadas en información desactualizada.

Prioriza reutilizar los servicios existentes.

Si es necesario crear una capa de métricas, diseña una arquitectura sencilla, tipada, auditable y reutilizable.

---

# 3. AUDITORÍA DEL DASHBOARD — TAB OKR

Validar que toda la información estratégica coincida con el módulo de OKRs y sus relaciones reales.

Revisar:

- Objetivos activos.
- Objetivos completados.
- Objetivos sin avance.
- Resultados clave.
- Avance de KRs.
- Avance de objetivos.
- Iniciativas vinculadas.
- Acciones vinculadas a iniciativas.
- Fechas y períodos.
- Responsables.
- Riesgos.
- Desviaciones.
- Objetivos sin iniciativas.
- Iniciativas sin avance.
- KRs sin línea base.
- KRs sin metas válidas.

## Cálculos

Verificar las fórmulas reales de avance.

Considerar:

- Dirección del indicador: aumentar o disminuir.
- Línea base.
- Valor actual.
- Meta.
- Período.
- Unidad de medición.
- Casos sin información suficiente.
- Metas ya alcanzadas.
- Valores fuera de rango.

No asumir que todos los KRs progresan linealmente.

No calcular el avance estratégico únicamente por la cantidad de iniciativas o acciones completadas.

No considerar un KR alcanzado porque sus actividades estén terminadas.

Si no existe información suficiente para calcular un indicador, mostrar "Sin datos suficientes" o el estado equivalente existente.

No sustituir datos faltantes por cero cuando cero represente un valor real.

## Consistencia

El avance de un objetivo en Dashboard debe corresponder con el cálculo utilizado en /okrs, bajo el mismo usuario, período, alcance y filtros.

Si existen métricas diferentes, deben identificarse y explicarse claramente.

---

# 4. AUDITORÍA DEL DASHBOARD — TAB BAU

BAU corresponde a Business As Usual: ejecución y operación cotidiana.

Validar la consistencia con:

- Kanban general.
- Kanban por Equipos.
- Acciones corporativas.
- Actividades operativas.
- Responsables.
- Estados.
- Fechas.
- Bloqueos.
- Checkpoints.
- Evidencias.
- Historial de seguimiento.
- Pendientes de verificación.

## Indicadores

Auditar todos los indicadores existentes, incluyendo cuando corresponda:

- Total de acciones.
- Acciones abiertas.
- Acciones en ejecución.
- Acciones bloqueadas.
- Acciones vencidas.
- Acciones en Hecho.
- Acciones verificadas.
- Acciones sin actualización.
- Acciones por responsable.
- Acciones por equipo.
- Acciones por prioridad.
- Cumplimiento de fechas.
- Antigüedad de bloqueos.
- Pendientes de validación.

No agregar indicadores arbitrarios. Primero validar los existentes y después recomendar mejoras justificadas.

## Estados

Respetar el modelo real de Scrumban.

Especialmente:

Hecho NO equivale a Verificado.

Una acción marcada Hecho y pendiente de verificación debe contabilizarse según la definición correcta del indicador.

No contar una misma acción varias veces por tener:

- Múltiples comentarios.
- Varios checkpoints.
- Evidencias.
- Historial de estados.
- Relaciones con iniciativas.
- Participación en diferentes vistas.

Utilizar identificadores únicos y relaciones correctas.

## Fechas

Unificar:

- Zona horaria.
- Fecha actual.
- Criterios de vencimiento.
- Fechas de compromiso.
- Fechas de actualización.
- Fechas de cierre.

Evitar que una acción aparezca vencida en una pantalla y vigente en otra por diferencias de interpretación.

---

# 5. CONSISTENCIA ENTRE KANBAN Y KANBAN POR EQUIPOS

Investiga si ambos módulos comparten entidades o manejan registros independientes.

No asumir que representan exactamente el mismo conjunto de acciones.

Determina:

- Qué información pertenece al Kanban general.
- Qué información pertenece al Kanban por Equipos.
- Qué registros se relacionan.
- Qué registros son independientes.
- Qué filtros y permisos se aplican.
- Qué datos deben agregarse en BAU.

Establece reglas claras para evitar duplicaciones.

Si un mismo registro aparece en varias vistas, debe contabilizarse una sola vez cuando la métrica sea de acciones únicas.

Si existen entidades diferentes, mantener su identidad y reportar correctamente su origen.

No sumar totales de módulos sin comprobar si sus conjuntos son disjuntos.

---

# 6. ALCANCE Y FILTROS

Auditar filtros por:

- Usuario.
- Responsable.
- Equipo.
- Área.
- Organización.
- Período.
- Estado.
- Prioridad.
- Tipo de acción.
- Relación con OKRs.

El mismo indicador debe coincidir cuando se aplica el mismo alcance.

Ejemplo:

Si Dashboard muestra acciones vencidas del equipo, su conteo debe coincidir con el conjunto equivalente del Kanban por Equipos.

Si Dashboard muestra únicamente acciones propias, no compararlo directamente con el total organizacional.

## Regla

Toda métrica debe tener un alcance identificable.

No mezclar información individual, de equipo y organizacional en un mismo indicador sin aclararlo.

---

# 7. MATRIZ DE RECONCILIACIÓN

Crear una validación automatizada que compare los resultados de cada módulo.

Para cada indicador:

1. Identificar fuente.
2. Identificar filtros.
3. Ejecutar cálculo canónico.
4. Obtener resultado del módulo consumidor.
5. Comparar valores.
6. Registrar diferencias.
7. Identificar causa.
8. Corregir.
9. Ejecutar nuevamente la prueba.

Clasificar diferencias como:

- Error de consulta.
- Error de fórmula.
- Diferencia de filtros.
- Problema de permisos.
- Duplicación.
- Datos faltantes.
- Caché desactualizada.
- Error de zona horaria.
- Relación incorrecta.
- Diferencia legítima de alcance.

No corregir cifras manualmente para hacerlas coincidir.

Corregir la causa de origen.

---

# 8. INTEGRACIÓN INTEGRAL CON EL AGENTE IA

El agente IA de Scrumban debe poder consultar e interpretar toda la información autorizada del sistema.

Auditar:

- Herramientas existentes.
- Endpoints.
- Consultas.
- Contexto del usuario.
- Resúmenes del tablero.
- Permisos.
- Límites de resultados.
- Actualización de información.
- Relaciones entre módulos.

## Cobertura

El agente debe poder consultar, cuando existan datos y permisos:

- Dashboard OKR.
- Dashboard BAU.
- Objetivos.
- Resultados clave.
- Iniciativas.
- Kanban.
- Kanban por Equipos.
- Acciones corporativas.
- Responsables.
- Fechas.
- Checkpoints.
- Evidencias y comentarios.
- Bloqueos.
- Pendientes de verificación.
- KPIs.
- Información relevante de los demás módulos existentes.

No basta con enviar al modelo un resumen estático.

Debe poder recuperar información específica mediante herramientas seguras y consultas reales.

## Consultas esperadas

Ejemplos:

"¿Cómo vamos con nuestros OKRs?"

"¿Qué objetivos están en riesgo?"

"¿Cuántas acciones tenemos vencidas?"

"¿Qué equipo tiene más bloqueos?"

"¿Qué acciones están pendientes de verificar?"

"¿Qué iniciativas no están generando resultados?"

"¿Qué deberíamos priorizar hoy?"

"¿Por qué el Dashboard muestra ese avance?"

"¿Qué diferencia hay entre el avance operativo y el estratégico?"

El agente debe utilizar datos reales y explicar brevemente su interpretación.

No inventar causas cuando solo se dispone de correlaciones o resultados agregados.

---

# 9. HERRAMIENTAS DEL AGENTE IA

Revisar y reutilizar herramientas existentes, incluyendo si están disponibles:

- get_dashboard_summary
- get_org_chart
- get_module_data
- search_board

Verificar que permitan obtener datos suficientes y correctos.

Si existen limitaciones, optimizar las herramientas actuales antes de crear nuevas.

Implementar consultas especializadas únicamente cuando aporten precisión o eficiencia.

## Requisitos

- Consultas determinísticas para métricas.
- Cálculos realizados en backend.
- Respuestas estructuradas.
- Tipos consistentes.
- Identificadores reales.
- Filtros explícitos.
- Paginación cuando corresponda.
- Permisos por usuario.
- Manejo de errores.
- Control de latencia y costos.

No depender del LLM para calcular métricas que pueden obtenerse directamente de PostgreSQL.

El modelo debe interpretar los resultados, no inventar los cálculos.

---

# 10. CONTEXTO COMPLETO SIN SATURAR AL MODELO

El objetivo no es enviar toda la base de datos en cada conversación.

Implementar recuperación progresiva de información.

### Nivel 1 — Contexto inicial

Información mínima del usuario y su alcance autorizado.

### Nivel 2 — Contexto según intención

Consultar únicamente los módulos relacionados con la pregunta.

### Nivel 3 — Profundización

Recuperar registros específicos, relaciones, comentarios o evidencias cuando sean necesarios.

### Nivel 4 — Análisis

Entregar al modelo información estructurada y suficiente para responder.

Esto debe permitir que el agente tenga acceso potencial a todo el tablero autorizado sin cargarlo completamente en cada mensaje.

Evitar respuestas basadas en los primeros registros de una lista incompleta.

Si una consulta está paginada o truncada, el agente debe conocer esa limitación.

---

# 11. COHERENCIA ENTRE IA Y DASHBOARD

Si el usuario pregunta:

"¿Cuántas acciones vencidas tenemos?"

La respuesta debe coincidir con Dashboard BAU cuando ambos utilizan el mismo alcance y período.

Si pregunta:

"¿Cuál es el avance del objetivo comercial?"

El valor debe corresponder con el módulo OKR y Dashboard OKR.

Si pregunta:

"¿Cuántas acciones están pendientes de verificar?"

Debe utilizar exactamente el criterio real de Hecho pendiente de Verificado.

## Regla fundamental

El Dashboard y el agente IA deben consumir las mismas definiciones de métricas.

No implementar una fórmula para el frontend y otra distinta dentro del agente.

---

# 12. SEGURIDAD Y RLS

Validar:

- Identidad del usuario.
- Autorización de cada consulta.
- Políticas RLS.
- Aislamiento de datos entre organizaciones.
- Acceso por equipo.
- Permisos de módulos.
- Protección de endpoints.
- Prevención de exposición de información.
- Uso seguro de service role.
- Validación de parámetros.

El agente no debe acceder a información fuera del alcance del usuario.

No confiar en IDs enviados por el frontend sin validación.

No desactivar RLS para resolver inconsistencias.

No ampliar permisos para hacer coincidir métricas.

---

# 13. SINCRONIZACIÓN Y ACTUALIZACIÓN

Auditar el mecanismo de actualización de datos:

- React Query u otro caché.
- Invalidación de consultas.
- Realtime.
- Refetch.
- Mutaciones.
- Estados optimistas.
- Actualización posterior a cambios.
- Cambios ejecutados desde WhatsApp.
- Cambios preparados o ejecutados mediante IA.

Cuando una acción cambie de estado, las pantallas afectadas deben reflejar el cambio correctamente.

No deben quedar cifras obsoletas de forma indefinida.

Definir una política consistente de actualización.

Evitar solicitudes repetidas innecesarias.

---

# 14. CALIDAD Y TRAZABILIDAD DE DATOS

Auditar:

- Registros huérfanos.
- Relaciones rotas.
- Duplicados.
- Estados inválidos.
- Fechas inconsistentes.
- Responsables inexistentes.
- Checkpoints mal asociados.
- Iniciativas sin relación válida.
- KRs sin información necesaria.
- Datos históricos que distorsionan indicadores.

No eliminar información automáticamente.

Reportar anomalías y proponer correcciones seguras.

Registrar las transformaciones y reglas aplicadas.

---

# 15. PRUEBAS AUTOMATIZADAS

Crear o ampliar pruebas para:

1. Igualdad entre Dashboard OKR y /okrs.
2. Igualdad entre Dashboard BAU y los módulos operativos correspondientes.
3. Acciones únicas sin duplicados.
4. Separación correcta entre Kanban general y Kanban por Equipos.
5. Hecho diferente de Verificado.
6. Conteos de vencimientos.
7. Conteos de bloqueos.
8. Cálculos de avance de KRs.
9. Indicadores sin línea base.
10. Objetivos sin iniciativas.
11. Filtros por responsable.
12. Filtros por equipo.
13. Filtros por período.
14. Diferencias de zona horaria.
15. Acceso según RLS.
16. Actualización después de una mutación.
17. Respuestas IA contra consultas reales.
18. Paginación y resultados incompletos.
19. Registros históricos.
20. Ausencia de datos.

Crear pruebas de reconciliación que comparen métricas utilizando el mismo usuario, filtros y período.

No utilizar únicamente datos mock para validar la consistencia.

Para producción, ejecutar comprobaciones de solo lectura y con permisos autorizados.

---

# 16. EXPERIENCIA DE USUARIO

Optimizar la presentación de información.

Priorizar:

- Indicadores confiables.
- Alcance visible.
- Fechas y períodos claros.
- Estados consistentes.
- Diferenciación entre OKR y BAU.
- Identificación de riesgos.
- Acceso al detalle.
- Información accionable.

No saturar el Dashboard con métricas redundantes.

No añadir gráficas o tarjetas sin valor operativo.

Si un indicador no puede calcularse, mostrar una explicación clara.

La prioridad es facilitar decisiones, no aumentar la cantidad de información.

---

# 17. PLAN DE IMPLEMENTACIÓN

Trabajar por fases.

## Fase 1 — Diagnóstico

- Mapear fuentes y consultas.
- Identificar fórmulas.
- Revisar filtros.
- Detectar inconsistencias.
- Presentar hallazgos.

## Fase 2 — Fuente de verdad

- Centralizar definiciones.
- Corregir cálculos.
- Eliminar duplicidades.
- Normalizar alcances.

## Fase 3 — Dashboard

- Validar tab OKR.
- Validar tab BAU.
- Corregir discrepancias.
- Optimizar actualización.

## Fase 4 — Módulos

- Validar OKRs.
- Validar Kanban.
- Validar Kanban por Equipos.
- Corregir relaciones.

## Fase 5 — Agente IA

- Auditar herramientas.
- Ampliar cobertura autorizada.
- Reutilizar métricas canónicas.
- Optimizar recuperación de contexto.
- Validar respuestas.

## Fase 6 — Calidad

- Pruebas automatizadas.
- Reconciliación.
- Seguridad.
- Documentación.
- Checklist de despliegue.

No ejecutar migraciones destructivas.

No modificar datos de producción sin autorización.

No desplegar automáticamente.

---

# 18. ENTREGABLE FINAL

Presentar:

1. Mapa de fuentes de datos.
2. Matriz de métricas y fórmulas.
3. Inconsistencias encontradas.
4. Causas identificadas.
5. Correcciones implementadas.
6. Archivos modificados.
7. Consultas centralizadas.
8. Herramientas IA optimizadas.
9. Pruebas ejecutadas.
10. Diferencias pendientes.
11. Riesgos de seguridad.
12. Checklist de despliegue.

Incluir una tabla de reconciliación con:

- Indicador.
- Valor del Dashboard.
- Valor de la fuente canónica.
- Diferencia.
- Alcance.
- Estado de validación.

No declarar consistencia total sin evidencia de las pruebas.

---

# CRITERIO DE ÉXITO

Scrumban debe operar con una única fuente de verdad.

Dashboard OKR, Dashboard BAU, OKRs, Kanban, Kanban por Equipos y el agente IA deben mostrar o utilizar información consistente, precisa y actualizada.

Las diferencias legítimas de alcance deben estar documentadas y ser comprensibles.

Los indicadores deben calcularse con reglas compartidas.

El agente IA debe tener capacidad para consultar toda la información autorizada del tablero mediante herramientas seguras, sin inventar registros, conteos, avances o resultados.

El resultado debe ser un sistema confiable, auditable, eficiente y orientado a la toma de decisiones reales.