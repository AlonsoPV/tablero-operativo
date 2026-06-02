# Refactor UX — Formulario de acciones

Documentación del rediseño del modal crear/editar acción (`AccionForm` + `AccionFormDialog`).

## 1. Problemas detectados en el formulario anterior

- **Longitud y planitud**: muchos campos al mismo nivel; el usuario veía todo de golpe sin jerarquía.
- **Orden invertido**: título y descripción (triada obligatoria) aparecían antes que responsable, fecha y prioridad — los datos críticos para ejecución quedaban en medio del formulario.
- **Tipo de acción roto**: un `useEffect` reseteaba `sprint` y `desbloqueo` a `operativa`; solo se mostraba RUN en la UI aunque el modelo soportara sprint, estratégica y desbloqueo.
- **KPIs sin UI**: existía `catalog_kpi_ids` en el schema y en el guardado, pero no había selector visible (solo brechas con dropdown largo).
- **Descripción intimidante**: tres textareas obligatorias (mín. 5 caracteres cada una) para cualquier acción simple.
- **Evidencia**: select tradicional poco escaneable.
- **Brechas/KPIs**: listas largas sin búsqueda.
- **Vista previa de impacto**: al final del bloque de brechas, poco visible y sin contexto de tipo/sprint/KPI.
- **Sin acordeones**: scroll excesivo en creación.

## 2. Reorganización (3 bloques acordeón)

| Bloque | Contenido |
|--------|-----------|
| **1 — Información principal** | Título, responsable de ejecutar, fecha compromiso, hora límite, prioridad |
| **2 — Impacto estratégico** | Tipo (cards), sprint (si aplica), brechas, KPIs, story points, área, vista previa de impacto |
| **3 — Evidencia y validación** | Evidencia esperada (cards desde catálogo), descripción simple o estructurada, checklist borrador y adjuntos (solo creación) |

En **creación**, los bloques 2 y 3 inician colapsados; en **edición**, abiertos. Cada bloque muestra un resumen en cabecera al colapsar.

## 3. Campos movidos

- **Arriba (bloque 1)**: responsable, fecha, hora, prioridad (antes mezclados con tipo y área).
- **Bloque 2**: tipo de acción, sprint, gaps, KPIs, story points, área.
- **Bloque 3**: evidencia esperada, descripción, checkpoints/adjuntos.

## 4. Cambios de UX

- **Tipo de acción**: `TipoAccionSegment` — cards RUN / Sprint / Estratégica (+ Desbloqueo para no analistas).
- **Sprint**: obligatorio si `tipo_accion === 'sprint'`; opcional si estratégica; oculto/no obligatorio para operativa.
- **Gaps y KPIs**: `CatalogSearchMultiSelect` (búsqueda por nombre, código/id, descripción).
- **Evidencia**: `EvidenceOptionPicker` con iconos inferidos del label del catálogo (sin hardcodear valores).
- **Descripción**: campo único por defecto; botón «Usar formato estructurado» para triada Cómo / Quiero / Para qué.
- **Vista previa**: `AccionImpactPreview` destacada (tipo, sprint, KPIs, brechas, % aporte).
- **Labels**: p. ej. «Responsable de ejecutar», «Fecha compromiso», «¿Qué evidencia comprobará que se hizo?», «Brecha que atiende», «Indicador impactado».
- **Pie del diálogo**: Cancelar + «Guardar acción» fijos; loading y errores de validación en el footer.

## 5. Validaciones mantenidas

- Responsable UUID obligatorio.
- Fecha `YYYY-MM-DD`, hora `HH:MM`.
- Evidencia esperada obligatoria (mín. 5 caracteres en texto libre / label de catálogo).
- Título máx. 70 caracteres.
- `tipo_accion === 'sprint'` → `sprint_id` obligatorio.
- `tipo_accion === 'desbloqueo'` → `responsable_bloqueo` obligatorio.
- Story points: 0 o Fibonacci (1, 2, 3, 5, 8, 13).
- Prioridad desde catálogo.
- **Descripción**: modo simple ≥ 15 caracteres; modo estructurado mantiene 5–400 por parte. El payload sigue guardándose como `descripcion_accion` triada vía `formatDescripcionTriada`.
- Creación/edición, checkpoints, adjuntos, notificaciones de responsable, permisos y sync O2C sin cambios de contrato.

## 6. Performance

- `useMemo` para ítems de búsqueda, etiquetas de KPI, props de `AccionImpactPreview` y resúmenes de bloques.
- Catálogos con `staleTime` existente en hooks; prefetch en apertura del diálogo (evidencia, áreas, gaps, KPIs, usuarios).
- Vista previa de gaps solo consulta `useAccionImpactPreview` cuando hay `gapIds`.
- Sin recálculo del preview en cada keystroke del título (solo depende de gaps, KPIs, tipo, sprint, story points).

## 7. Recomendaciones fase 2

- **Stepper opcional** para onboarding de nuevos usuarios (mismo contenido, navegación por pasos).
- **Combobox accesible** con teclado (Arrow/Enter) y `aria-activedescendant` en `CatalogSearchMultiSelect`.
- **Autocompletar responsable** con búsqueda si la lista de usuarios crece.
- **Sprint activo por defecto** al elegir tipo Sprint.
- **Validación inline** por bloque al colapsar (marcar bloque con error).
- **Persistir borrador** en `sessionStorage` para recuperar creación interrumpida.
- **Tests e2e** del flujo «acción simple en &lt; 30 s» (título + responsable + fecha + evidencia + descripción simple).

## Archivos principales

- `src/features/operations/components/AccionForm.tsx`
- `src/features/operations/components/AccionFormDialog.tsx`
- `src/features/operations/components/form/*` (nuevos componentes)
- `src/features/operations/schemas/accion.schema.ts`
- `src/features/operations/components/AccionImpactPreview.tsx`
- `src/features/operations/utils/descripcionAccionTriada.ts` (`inferDescripcionModo`)
