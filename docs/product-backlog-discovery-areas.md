# Product Backlog Basado en Discovery por Areas

## Enfoque

El discovery muestra que la empresa no tiene principalmente un problema de esfuerzo, sino de visibilidad, seguimiento, ownership y cierre. El backlog debe implementar el tablero primero como sistema de control operativo: cada pendiente relevante debe tener responsable, fecha limite, prioridad, area, estado, dependencia y evidencia.

Recomendacion de implementacion: iniciar con Finanzas como piloto de alto impacto, porque tiene dolores claros, KPIs concretos y un caso real de urgencia relacionado con PODs, cobranza y evidencias. RH y Sistemas deben incorporarse en paralelo con solicitudes, proyectos, dependencias y adopcion.

## Objetivos del Producto

| Objetivo | Resultado esperado | Indicador de exito |
| --- | --- | --- |
| Centralizar pendientes operativos | Todo pendiente relevante vive en el tablero. | % acciones registradas en tablero vs. seguimiento externo |
| Clarificar ownership | Cada accion tiene responsable de cumplimiento y area involucrada. | % acciones sin responsable claro |
| Reducir retrasos invisibles | El tablero alerta vencimientos, bloqueos y dependencias. | Acciones vencidas y bloqueadas por area |
| Instalar SLA y escalamiento | Cada proceso critico tiene regla de tiempo y escalamiento. | % acciones dentro de SLA |
| Conectar tareas con KPIs | Las acciones impactan indicadores por area. | % acciones vinculadas a KPI o brecha |
| Mejorar adopcion | Las juntas operan desde el tablero, no desde Excel/WhatsApp. | Uso semanal: acciones creadas, movidas y cerradas |

## Epicas

| ID | Epica | Problema que resuelve | Area principal | Prioridad |
| --- | --- | --- | --- | --- |
| EP-01 | Control operativo basico | Acciones abiertas sin claridad de responsable, fecha, prioridad o estado. | Transversal | Critica |
| EP-02 | Finanzas piloto | PODs, cobranza, viaticos y evidencias sin trazabilidad suficiente. | Finanzas | Critica |
| EP-03 | SLAs y escalamiento | La operacion se entera tarde y escala de forma informal. | Transversal | Alta |
| EP-04 | Dependencias entre areas | Cuando una accion cruza areas se diluye la responsabilidad. | Transversal | Alta |
| EP-05 | Indicadores por area | El tablero debe medir operacion, no solo listar pendientes. | Finanzas, RH, Sistemas | Alta |
| EP-06 | RH operativo | Solicitudes, vacantes, capacitacion y clima sin seguimiento visible. | RH | Media |
| EP-07 | Sistemas como habilitador | Proyectos, issues, prioridades y alcance sin definicion consistente. | Sistemas | Media |
| EP-08 | Adopcion y gobierno | Riesgo de que el tablero se vuelva otro Excel si no hay ritual. | Direccion / Lideres | Alta |

## Product Backlog Priorizado

| ID | Epica | Historia de usuario / Item | Valor esperado | Prioridad | Story points | Area | Sprint objetivo | Estado | Criterios de aceptacion | Dependencias | KPI relacionado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PB-001 | EP-01 | Como direccion, quiero ver todas las acciones abiertas por estado, prioridad, area y responsable, para saber que esta pendiente y quien debe cerrarlo. | Visibilidad basica de control operativo. | Critica | 5 | Transversal | Sprint 1 | Backlog | El tablero muestra acciones abiertas, vencidas, bloqueadas y terminadas; permite filtrar por estado, prioridad, area y responsable. | Catalogos minimos de areas, prioridades y estados. | Acciones abiertas / vencidas |
| PB-002 | EP-01 | Como lider de area, quiero que cada accion tenga responsable de cumplimiento, fecha limite y prioridad obligatoria, para evitar pendientes sin dueno. | Mayor accountability. | Critica | 3 | Transversal | Sprint 1 | Backlog | No se puede crear una accion operativa sin responsable, fecha limite, prioridad y area. | Definir campos obligatorios. | % acciones sin responsable |
| PB-003 | EP-02 | Como finanzas, quiero registrar y dar seguimiento a PODs locales y foraneas con fecha compromiso, para controlar recuperacion de evidencias. | Menos PODs vencidas y mejor cobranza. | Critica | 5 | Finanzas | Sprint 1 | Backlog | Una accion POD distingue local/foranea, calcula vencimiento esperado y muestra estatus. | Definir regla POD local 3 dias y foranea 7 dias. | % PODs en tiempo |
| PB-004 | EP-02 | Como finanzas, quiero ver PODs vencidas por cliente, ruta u operador, para detectar donde se acumulan rechazos o retrasos. | Priorizacion de recuperacion de evidencia. | Alta | 5 | Finanzas | Sprint 1 | Backlog | Existe vista o filtro de PODs vencidas por cliente/ruta/operador y responsable. | Datos minimos de cliente/ruta/operador. | PODs vencidas por cliente |
| PB-005 | EP-02 | Como finanzas, quiero registrar monto pendiente de cobranza y vincularlo a acciones, para dar seguimiento a impacto financiero. | Cobranza conectada con accion operativa. | Alta | 5 | Finanzas | Sprint 1 | Backlog | Una accion puede incluir monto pendiente y cliente; el tablero permite ver total abierto. | Definir formato de monto y cliente. | Monto pendiente de cobranza / DSO |
| PB-006 | EP-03 | Como responsable, quiero que el tablero marque acciones que vencen hoy o ya vencieron, para actuar antes de que escalen. | Menos sorpresas operativas. | Alta | 3 | Transversal | Sprint 2 | Backlog | Las acciones muestran semaforo: en tiempo, vence hoy, vencida 1 dia, vencida 2+ dias. | Fecha limite obligatoria. | Acciones vencidas |
| PB-007 | EP-03 | Como direccion, quiero reglas de escalamiento por vencimiento, para que los bloqueos suban al nivel correcto. | Escalamiento formal y trazable. | Alta | 5 | Transversal | Sprint 2 | Backlog | Vence hoy asigna alerta al responsable; vencido 1 dia al lider de area; vencido 2+ dias a direccion/comite. | Definir lider por area. | % acciones escaladas a tiempo |
| PB-008 | EP-04 | Como lider operativo, quiero marcar dependencias entre areas, para que los retrasos no queden ocultos. | Claridad de bloqueos cruzados. | Alta | 5 | Transversal | Sprint 2 | Backlog | Una accion puede indicar area dependiente, responsable del bloqueo y fecha objetivo de desbloqueo. | Catalogo de areas y usuarios. | Acciones bloqueadas por area |
| PB-009 | EP-04 | Como finanzas, quiero registrar cuando una evidencia depende de Operaciones, para que el ownership no se diluya. | Menos friccion entre Finanzas y Operaciones. | Alta | 3 | Finanzas / Operaciones | Sprint 2 | Backlog | La accion muestra responsable de cumplimiento y area requerida para desbloquear evidencia. | Definir flujo Finanzas-Operaciones. | PODs bloqueadas por Operaciones |
| PB-010 | EP-02 | Como finanzas, quiero dar seguimiento a viaticos pendientes de comprobar, para reducir gastos sin trazabilidad. | Control de comprobaciones. | Alta | 5 | Finanzas | Sprint 2 | Backlog | Se pueden registrar viaticos pendientes, responsable, fecha limite, monto y evidencia esperada. | Definir datos minimos de viaticos. | Viaticos pendientes de comprobar |
| PB-011 | EP-02 | Como auditor financiero, quiero marcar evidencias rechazadas por cliente, ruta u operador, para identificar causas recurrentes. | Aprendizaje sobre errores repetidos. | Media | 5 | Finanzas | Sprint 3 | Backlog | Las evidencias pueden quedar como aceptadas/rechazadas con motivo y comentario. | Catalogo de motivos de rechazo. | Evidencias rechazadas |
| PB-012 | EP-06 | Como RH, quiero registrar solicitudes internas con responsable, fecha limite y estatus, para evitar seguimiento informal. | Trazabilidad de solicitudes RH. | Media | 3 | RH | Sprint 3 | Backlog | RH puede crear solicitudes con tipo, solicitante, responsable, fecha y estado. | Definir tipos de solicitud RH. | Solicitudes abiertas y vencidas |
| PB-013 | EP-06 | Como RH, quiero visualizar vacantes por estatus, para medir cobertura y cuellos de botella. | Mejor seguimiento de reclutamiento. | Media | 5 | RH | Sprint 3 | Backlog | Una vacante puede pasar por estados definidos y mostrar dias abierta. | Catalogo de estatus de vacante. | Vacantes abiertas / tiempo de cobertura |
| PB-014 | EP-06 | Como RH, quiero dar seguimiento a capacitaciones programadas vs completadas, para mejorar adopcion y cumplimiento. | Capacitacion verificable. | Media | 3 | RH | Sprint 4 | Backlog | Se registran capacitaciones con fecha, participantes, estatus y evidencia de cierre. | Definir calendario y responsables. | % capacitaciones completadas |
| PB-015 | EP-07 | Como Sistemas, quiero registrar solicitudes con alcance, prioridad y area solicitante, para evitar trabajo ambiguo o fuera de alcance. | Mejor intake de proyectos/issues. | Media | 5 | Sistemas | Sprint 3 | Backlog | Una solicitud de Sistemas requiere problema, alcance, prioridad, area solicitante y criterio de aceptacion. | Definir tipos: proyecto, issue, soporte, mejora. | Solicitudes fuera de alcance |
| PB-016 | EP-07 | Como Sistemas, quiero ver issues/incidentes abiertos por severidad y tiempo de resolucion, para priorizar correctamente. | Mejor gestion de soporte. | Media | 5 | Sistemas | Sprint 4 | Backlog | Issues muestran severidad, responsable, fecha limite y tiempo abierto. | Definir severidades y SLA. | Tiempo promedio de resolucion |
| PB-017 | EP-05 | Como direccion, quiero un maximo de 5 KPIs por area, para mantener foco ejecutivo. | Medicion simple y accionable. | Alta | 3 | Direccion | Sprint 4 | Backlog | Finanzas, RH y Sistemas tienen hasta 5 KPIs activos cada uno, con definicion y responsable. | Aprobacion de direccion y lideres. | KPIs activos por area |
| PB-018 | EP-05 | Como lider de area, quiero vincular cada accion a un KPI o brecha, para entender que resultado busca mover. | Acciones conectadas a impacto. | Alta | 5 | Transversal | Sprint 4 | Backlog | Al crear una accion estrategica se puede seleccionar KPI/brecha asociada. | Catalogo de KPIs y brechas. | % acciones vinculadas a KPI |
| PB-019 | EP-08 | Como Scrum Master, quiero operar juntas semanales desde el tablero, para sustituir seguimiento por Excel y WhatsApp. | Ritual operativo consistente. | Alta | 2 | Transversal | Sprint 1 | Backlog | Existe agenda semanal: revisar vencidas, bloqueadas, prioridades y cierres. | Respaldo de direccion. | Uso semanal del tablero |
| PB-020 | EP-08 | Como direccion, quiero declarar el tablero como fuente oficial de seguimiento, para que lo que no este registrado no sea prioridad formal. | Adopcion organizacional. | Critica | 1 | Direccion | Sprint 1 | Backlog | Direccion comunica regla de uso y lideres de area la aplican en juntas. | Decision directiva. | % acciones creadas en tablero |
| PB-021 | EP-08 | Como lider de area, quiero cerrar o redefinir acciones viejas o mal definidas, para limpiar ruido operativo. | Backlog sano y confiable. | Media | 3 | Transversal | Sprint 2 | Backlog | Acciones sin responsable, fecha o criterio de cierre se depuran o se reescriben. | Revision por area. | Acciones obsoletas cerradas |
| PB-022 | EP-03 | Como direccion, quiero revisar semanalmente bloqueos por area, para resolver dependencias antes de que afecten clientes. | Mejor respuesta transversal. | Alta | 3 | Transversal | Sprint 2 | Backlog | La junta semanal muestra top bloqueos por area, responsable y antiguedad. | Uso consistente de estado Bloqueado. | Bloqueos abiertos por area |
| PB-023 | EP-02 | Como finanzas, quiero registrar gastos auditados y pendientes de auditoria, para dar visibilidad a control financiero. | Mayor trazabilidad de gastos. | Media | 5 | Finanzas | Sprint 4 | Backlog | El tablero muestra % gastos auditados y pendientes con responsable. | Definir criterios de auditoria. | % gastos auditados |
| PB-024 | EP-06 | Como RH, quiero registrar quejas o sugerencias abiertas, para dar seguimiento a clima laboral. | Mejor visibilidad de temas humanos. | Baja | 3 | RH | Sprint 5 | Backlog | Cada queja/sugerencia tiene estado, responsable y fecha objetivo de respuesta. | Definir confidencialidad y permisos. | Quejas/sugerencias abiertas |
| PB-025 | EP-07 | Como Sistemas, quiero medir adopcion del tablero por area, para saber donde se necesita soporte o capacitacion. | Mejor implementacion cultural. | Media | 3 | Sistemas / Direccion | Sprint 5 | Backlog | Se reportan acciones creadas, actualizadas y cerradas por area semanalmente. | Auditoria de actividad. | Uso del tablero por area |

## Sprint 1 Propuesto: Control Operativo Basico

Objetivo: que todo pendiente relevante de Finanzas, RH y Sistemas viva en el tablero con responsable, fecha, prioridad, area, estado y evidencia esperada.

| ID | Item | Motivo de inclusion | Puntos |
| --- | --- | --- | --- |
| PB-020 | Tablero como fuente oficial de seguimiento | Sin decision directiva, la adopcion queda debil. | 1 |
| PB-001 | Vista de acciones por estado, prioridad, area y responsable | Crea visibilidad inmediata. | 5 |
| PB-002 | Campos obligatorios minimos | Evita acciones sin dueno o fecha. | 3 |
| PB-003 | Seguimiento de PODs local/foranea | Piloto de Finanzas con impacto claro. | 5 |
| PB-004 | PODs vencidas por cliente/ruta/operador | Permite priorizar recuperacion de evidencias. | 5 |
| PB-005 | Cobranza vinculada a acciones | Conecta pendiente operativo con impacto financiero. | 5 |
| PB-019 | Junta semanal desde tablero | Instala ritual desde el inicio. | 2 |

Total sugerido: 26 puntos. Si la capacidad del equipo es menor, dejar PB-005 para Sprint 2.

## KPIs Iniciales Por Area

### Finanzas

| KPI | Definicion inicial | Uso en tablero |
| --- | --- | --- |
| % PODs recuperadas en tiempo | PODs cerradas dentro de SLA / PODs totales. | Medir cumplimiento de evidencia. |
| PODs vencidas por cliente | PODs fuera de SLA agrupadas por cliente. | Priorizar clientes con riesgo. |
| DSO | Dias promedio de cobranza. | Conectar cobranza con evidencia pendiente. |
| Viaticos pendientes de comprobar | Monto o numero de comprobaciones abiertas. | Controlar gastos sin soporte. |
| Evidencias rechazadas | Evidencias rechazadas por cliente/ruta/operador. | Identificar causas recurrentes. |

### RH

| KPI | Definicion inicial | Uso en tablero |
| --- | --- | --- |
| Vacantes abiertas por estatus | Vacantes en proceso por etapa. | Gestionar reclutamiento. |
| Tiempo promedio de cobertura | Dias desde apertura hasta contratacion. | Medir velocidad de reclutamiento. |
| Rotacion semanal/mensual | Bajas del periodo / plantilla. | Identificar riesgo de talento. |
| Solicitudes abiertas y vencidas | Solicitudes RH no cerradas o fuera de fecha. | Controlar servicio interno. |
| Capacitaciones completadas | Completadas / programadas. | Medir adopcion y cumplimiento. |

### Sistemas

| KPI | Definicion inicial | Uso en tablero |
| --- | --- | --- |
| Proyectos abiertos por estatus | Proyectos activos agrupados por estado. | Priorizar portafolio. |
| Issues/incidentes abiertos | Tickets activos por severidad. | Controlar soporte. |
| Acciones bloqueadas por dependencia externa | Acciones detenidas por otra area. | Gestionar cuellos de botella. |
| Tiempo promedio de resolucion | Dias desde apertura hasta cierre. | Medir respuesta. |
| Solicitudes fuera de alcance | Solicitudes rechazadas o redefinidas por alcance. | Mejorar intake y definicion. |

## Reglas Minimas de SLA y Escalamiento

| Proceso | SLA inicial | Escalamiento |
| --- | --- | --- |
| POD local | 3 dias | Vence hoy: responsable; vencido 1 dia: lider de area; vencido 2+ dias: direccion/comite. |
| POD foranea | 7 dias | Vence hoy: responsable; vencido 1 dia: lider de area; vencido 2+ dias: direccion/comite. |
| Solicitudes RH | Por tipo de solicitud | Misma regla base, ajustada por criticidad. |
| Issues Sistemas | Por severidad | Critico escala el mismo dia; menor sigue regla base. |
| Dependencias entre areas | Fecha objetivo por bloqueo | Responsable del bloqueo debe actualizar avance antes de la junta semanal. |

## Decisiones Requeridas de Direccion

| Decision | Impacto si se aprueba |
| --- | --- |
| Confirmar que el tablero sera fuente oficial de seguimiento. | Evita duplicidad con Excel y WhatsApp. |
| Respaldar que las juntas se hagan desde el tablero. | Convierte el tablero en ritual operativo. |
| Nombrar lider responsable por area. | Aclara accountability y escalamiento. |
| Aprobar SLA iniciales y reglas de escalamiento. | Permite anticipar riesgos y reducir sorpresas. |
| Aceptar que lo que no este en tablero no sera prioridad formal. | Refuerza adopcion y disciplina operativa. |

## Definition of Ready Para Este Backlog

Un item esta listo para sprint cuando:

| Criterio | Cumple |
| --- | --- |
| Tiene area responsable. |  |
| Tiene responsable de cumplimiento o rol responsable. |  |
| Tiene fecha limite o regla de SLA. |  |
| Tiene prioridad definida. |  |
| Tiene criterio de cierre verificable. |  |
| Tiene KPI, brecha o razon de negocio asociada. |  |
| Sus dependencias estan identificadas. |  |

## Definition of Done Para Este Backlog

Un item se considera terminado cuando:

| Criterio | Cumple |
| --- | --- |
| La accion, vista, regla o proceso esta disponible en el tablero. |  |
| Los usuarios responsables pueden usarlo sin depender de Excel externo. |  |
| El item fue validado por el lider del area correspondiente. |  |
| Existen criterios de cierre y evidencia cuando aplique. |  |
| Los datos pueden filtrarse por area, estado, prioridad y responsable. |  |
| El Product Owner acepta el resultado. |  |

## Roadmap 30-60-90 Dias

| Horizonte | Foco | Entregables |
| --- | --- | --- |
| 30 dias | Control operativo | Acciones reales cargadas, Finanzas piloto, campos minimos, filtros, juntas desde tablero. |
| 60 dias | SLA y escalamiento | Semaforos, reglas de vencimiento, bloqueos por area, dependencias cruzadas, revision semanal. |
| 90 dias | KPIs y adopcion | Maximo 5 KPIs por area, acciones vinculadas a KPIs, medicion de uso, gobierno operativo. |
