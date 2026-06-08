# Product Backlog y Plantilla de Tablero Scrum

Esta plantilla sirve para gestionar iniciativas, brechas, acciones de mejora y entregables del tablero operativo usando practicas Agile y Scrum.

## 1. Vision del Producto

| Campo | Descripcion |
| --- | --- |
| Producto / iniciativa |  |
| Objetivo de negocio |  |
| Usuarios principales |  |
| Problema a resolver |  |
| Resultado esperado |  |
| KPI u OKR asociado |  |
| Product Owner |  |
| Scrum Master / Facilitador |  |
| Equipo de desarrollo / ejecucion |  |
| Fecha de inicio |  |
| Horizonte de roadmap |  |

## 2. Product Backlog

| ID | Epica | Historia de usuario / Item | Valor esperado | Prioridad | Story points | Responsable | Sprint objetivo | Estado | Criterios de aceptacion | Dependencias | KPI relacionado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PB-001 |  | Como [rol], quiero [necesidad], para [beneficio]. |  | Alta |  |  |  | Backlog | Dado que..., cuando..., entonces... |  |  |
| PB-002 |  | Como [rol], quiero [necesidad], para [beneficio]. |  | Media |  |  |  | Backlog | Dado que..., cuando..., entonces... |  |  |
| PB-003 |  | Como [rol], quiero [necesidad], para [beneficio]. |  | Baja |  |  |  | Backlog | Dado que..., cuando..., entonces... |  |  |

### Escala sugerida de prioridad

| Prioridad | Criterio |
| --- | --- |
| Critica | Bloquea operacion, cumplimiento, ingreso, decision ejecutiva o adopcion. |
| Alta | Genera impacto directo en KPIs, eficiencia, trazabilidad o experiencia del usuario. |
| Media | Mejora el flujo actual, reduce friccion o habilita aprendizaje. |
| Baja | Deseable, estetica, optimizacion menor o mejora futura. |

### Escala sugerida de story points

| Puntos | Complejidad esperada |
| --- | --- |
| 1 | Cambio minimo, sin dependencias relevantes. |
| 2 | Cambio pequeno con validacion sencilla. |
| 3 | Cambio moderado, requiere coordinacion o pruebas funcionales. |
| 5 | Cambio relevante con varias reglas, datos o pantallas involucradas. |
| 8 | Cambio grande; conviene dividirlo antes de llevarlo a sprint. |
| 13 | Demasiado grande o incierto; requiere discovery/refinamiento. |

## 3. Ejemplo de Backlog Inicial

| ID | Epica | Historia de usuario / Item | Valor esperado | Prioridad | Story points | Responsable | Sprint objetivo | Estado | Criterios de aceptacion | Dependencias | KPI relacionado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PB-001 | Visibilidad operativa | Como direccion, quiero ver el avance consolidado de acciones por estado, para tomar decisiones oportunas. | Mejor control ejecutivo y menor retraso en acciones criticas. | Alta | 5 | Product Owner | Sprint 1 | Backlog | Se visualizan acciones por estado, prioridad, responsable y vencimiento. | Catalogo de acciones actualizado. | Cumplimiento de acciones |
| PB-002 | Priorizacion | Como lider operativo, quiero clasificar acciones por impacto y urgencia, para enfocar al equipo en lo mas importante. | Mejor uso de capacidad del equipo. | Alta | 3 | Lider operativo | Sprint 1 | Backlog | Toda accion tiene prioridad visible y puede filtrarse por prioridad. | Catalogo de prioridades. | Acciones criticas cerradas |
| PB-003 | Seguimiento Scrum | Como Scrum Master, quiero organizar acciones por sprint, para dar seguimiento al compromiso semanal/quincenal. | Mayor disciplina de ejecucion. | Alta | 5 | Scrum Master | Sprint 1 | Backlog | Cada accion puede asignarse a un sprint y verse en tablero. | Definir calendario de sprints. | Cumplimiento sprint |
| PB-004 | Evidencia y cierre | Como responsable de accion, quiero adjuntar evidencia al cerrar una tarea, para asegurar trazabilidad. | Cierres auditables y confiables. | Media | 5 | Responsable de accion | Sprint 2 | Backlog | No se cierra una accion que requiere evidencia sin adjunto valido. | Reglas de evidencia. | Calidad de cierre |
| PB-005 | Alertas | Como responsable, quiero recibir alertas de vencimiento, para evitar retrasos. | Menos tareas vencidas. | Media | 3 | Equipo operativo | Sprint 2 | Backlog | El sistema muestra vencimientos proximos y acciones retrasadas. | Fechas compromiso completas. | Acciones vencidas |

## 4. Definition of Ready

Un item esta listo para entrar a sprint cuando cumple:

| Criterio | Si / No | Observaciones |
| --- | --- | --- |
| Tiene objetivo claro y valor esperado. |  |  |
| Tiene criterios de aceptacion verificables. |  |  |
| Tiene prioridad definida. |  |  |
| Tiene tamano estimado en story points. |  |  |
| Tiene responsable o equipo asignable. |  |  |
| Sus dependencias son conocidas. |  |  |
| Puede completarse dentro de un sprint o esta dividido. |  |  |

## 5. Definition of Done

Un item se considera terminado cuando cumple:

| Criterio | Si / No | Evidencia |
| --- | --- | --- |
| Cumple todos los criterios de aceptacion. |  |  |
| Fue probado o validado por el responsable correspondiente. |  |  |
| No deja bloqueos abiertos para otros items del sprint. |  |  |
| Cuenta con evidencia, comentario o soporte de cierre cuando aplique. |  |  |
| El KPI, tablero o reporte relacionado fue actualizado si corresponde. |  |  |
| Product Owner acepta el resultado. |  |  |

## 6. Sprint Planning

| Campo | Descripcion |
| --- | --- |
| Sprint |  |
| Fechas |  |
| Objetivo del sprint |  |
| Capacidad del equipo |  |
| Velocidad historica |  |
| Compromiso total en puntos |  |
| Riesgos principales |  |

### Items comprometidos

| ID | Item | Prioridad | Story points | Responsable | Estado inicial | Criterio principal de aceptacion |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  | Por hacer |  |

## 7. Tablero Scrum

### Columnas recomendadas

| Columna | Uso | Regla de entrada | Regla de salida |
| --- | --- | --- | --- |
| Backlog | Ideas, solicitudes y acciones aun no comprometidas. | Item capturado. | Cumple Definition of Ready y se prioriza. |
| Sprint Backlog | Trabajo comprometido para el sprint actual. | Seleccionado en Sprint Planning. | Responsable inicia ejecucion. |
| Por hacer | Trabajo listo para tomar. | Item del sprint sin iniciar. | Alguien toma responsabilidad activa. |
| En progreso | Trabajo actualmente ejecutandose. | Responsable asignado y actividad iniciada. | Resultado listo para validar. |
| En revision / Validacion | Trabajo terminado por el ejecutor y pendiente de aceptacion. | Evidencia o entregable disponible. | PO/lider acepta o solicita ajustes. |
| Bloqueado | Trabajo detenido por dependencia, decision, dato o aprobacion. | Bloqueo identificado y documentado. | Bloqueo resuelto o se cambia alcance. |
| Terminado | Trabajo aceptado y cerrado. | Cumple Definition of Done. | Se mantiene como historico del sprint. |

### Tarjeta de trabajo

| Campo | Valor |
| --- | --- |
| ID |  |
| Titulo |  |
| Historia de usuario | Como [rol], quiero [necesidad], para [beneficio]. |
| Prioridad |  |
| Story points |  |
| Responsable |  |
| Sprint |  |
| Fecha compromiso |  |
| Estado |  |
| Criterios de aceptacion |  |
| Evidencia esperada |  |
| Dependencias / bloqueos |  |
| KPI / OKR relacionado |  |
| Comentarios |  |

## 8. Ceremonias Scrum

| Ceremonia | Frecuencia | Participantes | Salida esperada |
| --- | --- | --- | --- |
| Refinamiento de backlog | Semanal | Product Owner, Scrum Master, equipo | Items claros, priorizados y estimados. |
| Sprint Planning | Inicio de sprint | Equipo Scrum | Objetivo de sprint y compromiso definido. |
| Daily Scrum | Diario o 3 veces por semana | Equipo ejecutor | Avances, bloqueos y plan inmediato. |
| Sprint Review | Fin de sprint | Equipo, usuarios clave, direccion | Entregables aceptados y feedback. |
| Retrospectiva | Fin de sprint | Equipo Scrum | Mejoras concretas para el siguiente sprint. |

## 9. Metricas de Seguimiento

| Metrica | Formula / criterio | Frecuencia |
| --- | --- | --- |
| Cumplimiento del sprint | Items terminados / items comprometidos. | Por sprint |
| Velocidad | Story points terminados por sprint. | Por sprint |
| Trabajo bloqueado | Items bloqueados / items activos. | Semanal |
| Acciones vencidas | Items fuera de fecha compromiso. | Semanal |
| Lead time | Dias desde creacion hasta terminado. | Mensual |
| Cycle time | Dias desde en progreso hasta terminado. | Mensual |
| Re-trabajo | Items devueltos desde validacion a en progreso. | Por sprint |

## 10. Rutina Operativa Recomendada

1. Capturar solicitudes, brechas o acciones en Backlog.
2. Refinar cada item hasta cumplir Definition of Ready.
3. Priorizar por valor, urgencia, riesgo y dependencia.
4. Seleccionar items para el sprint segun capacidad real.
5. Mover diariamente las tarjetas segun avance.
6. Documentar bloqueos con responsable y fecha objetivo de resolucion.
7. Validar entregables contra criterios de aceptacion.
8. Cerrar solo cuando se cumpla Definition of Done.
9. Revisar metricas al final del sprint.
10. Ajustar proceso en retrospectiva.
