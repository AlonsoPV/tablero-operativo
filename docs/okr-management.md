# Gestión de OKRs

El módulo `/okrs` reutiliza `okrs` y `okr_key_results`. Su estructura es
**Objetivo → KRs → Iniciativas**. El alcance Empresa representa la organización
de esta instalación; Equipo utiliza el catálogo existente de áreas y sus líderes.
No introduce empresas independientes ni aislamiento multitenant.

## Uso

1. Crear un objetivo, elegir empresa o equipo, asignar un responsable activo y
   definir inicio y fin. Todo objetivo, sin importar su ámbito, tiene responsable.
2. Agregar KRs con línea base, meta, unidad y un usuario activo como dueño.
3. Registrar mediciones y notas. Cada registro conserva valor, autor y fecha.
4. Vincular acciones existentes del kanban corporativo o del equipo como iniciativas.
   También se puede abrir el formulario existente para crear una acción y luego
   seleccionarla al regresar al selector. Desvincular no elimina la acción.
5. Abrir una iniciativa para trabajar en su kanban. La ficha de la acción incluye
   un enlace de regreso al objetivo y KR correspondiente.

Los objetivos se distinguen por ámbito, equipo y fechas. Hay filtros de búsqueda,
equipo, estado y solapamiento de periodos. Inicio y fin son inclusivos, con la fecha
actual del calendario de Ciudad de México. Archivar conserva el historial y bloquea
nuevas mediciones e iniciativas; habilitarlo de nuevo restablece el seguimiento.
Los periodos programados/finalizados siguen permitiendo registrar mediciones para
planeación y cierre; el archivo es el bloqueo explícito.

## Cálculo

- KR: `(actual − línea base) / (meta − línea base) × 100`, limitado a 0–100.
  Funciona con metas crecientes o decrecientes y admite valores negativos.
- Objetivo: promedio simple de sus KRs; un objetivo sin KRs muestra 0%.
- Iniciativas: acciones cerradas / acciones vinculadas, con pesos iguales. Tres
  iniciativas representan 33.3% cada una. Usa el estado de cierre del catálogo
  existente. No modifica las mediciones del KR.
- Si alguna acción no es visible para el usuario, se indica que falta acceso y
  no se presenta un porcentaje parcial de ejecución como si fuese completo.

El OKR operativo preexistente mantiene sus cálculos automáticos y no acepta
mediciones manuales. Sus KRs heredados pueden carecer de dueño; los nuevos KRs
exigen un usuario activo. Los vínculos antiguos `acciones_diarias.okr_impactado`
se conservan; deben asociarse explícitamente al KR apropiado, porque antes solo
indicaban el objetivo. No se asignan automáticamente a un KR arbitrario.

## Permisos

- Administradores de catálogos y Dirección administran objetivos de empresa.
- Los líderes administran objetivos de sus equipos.
- El dueño puede registrar mediciones y gestionar iniciativas de su KR.
- Los usuarios activos ven objetivos de empresa; los de equipo se restringen a
  sus miembros, líderes, administradores, el responsable del objetivo y los
  dueños de los KRs correspondientes.
- Vincular una acción respeta su RLS original y exige el mismo equipo cuando el
  objetivo es de equipo. Una acción puede contribuir a distintos KRs, pero no
  vincularse dos veces al mismo KR.

## Base de datos y publicación

Aplicar `supabase/migrations/20260924120000_okr_management.sql` y después
`supabase/migrations/20260925120000_okr_objective_owner.sql` al entorno elegido
antes de publicar el frontend. Los objetivos existentes quedan sin responsable
hasta que se editen; al guardarlos se exige uno. La migración es transaccional y no elimina datos.
Añade campos de ámbito, responsables, relaciones de iniciativas, historial, RPCs,
políticas RLS y el módulo configurable `okrs` en el catálogo de permisos.

La migración no ha sido aplicada a un proyecto remoto por el agente. El archivo
también admite instalaciones que no ejecutaron la migración opcional de OKR
operativo: añade `title`, `start_date`, `end_date` y crea `okr_key_results` cuando
faltan. Se puede volver a ejecutar completo sin eliminar objetivos, KRs o mediciones.
Si aparece `column "start_date" does not exist` al ejecutar una versión anterior,
usar el archivo actualizado completo, no únicamente un fragmento.

## Segunda revisión de experiencia de uso

- Resumen de objetivos activos y programados; KRs en curso.
- Filtros avanzados plegables y limpieza de filtros; resultados también plegables.
- Crear un objetivo abre directamente la captura de su primer KR.
- Selector de iniciativas con búsqueda y tarjetas de texto completo.
- Vista previa del porcentaje al registrar una medición; historial en hora CDMX.
- Controles táctiles, formularios adaptables y botones de guardado visibles en móvil.
- Se bloquea el cierre del diálogo mientras se guarda para evitar perder el resultado.
- El formulario de acciones corporativas solo se carga al abrirlo, evitando consultas
  y trabajo de inicialización innecesarios al entrar al módulo.

Revisión visual local con datos de prueba aislados (sin escribir en Supabase);
la validación de permisos y persistencia se realiza por separado en PostgreSQL.

## Reporteo en dashboard

El dashboard separa **OKRs** y **BAU (Business as usual)**. BAU conserva los
indicadores operativos existentes. OKRs incluye filtros por periodo, estado,
empresa/equipo y responsable, detalle de resultados y exportación CSV del alcance
seleccionado. Los filtros se conservan al cambiar de pestaña.

Aplicar también `supabase/migrations/20260928120000_okr_reporting_history.sql`
después de las dos migraciones anteriores. Cada nueva medición conserva la línea
base, meta, unidad, responsable y periodo vigentes. El historial registra cambios
de configuración y permite consultar la evolución de cada KR, con paginación.
Los registros antiguos sin referencia histórica se muestran sin inventar porcentajes.
Los periodos finalizados muestran la última medición disponible; no son cierres
congelados. Los KRs automáticos mantienen su cálculo actual.

## Pruebas

### Revisión visual de dashboard y gestión

El reporte incluye un panorama de KRs logrados, en avance y sin avance medido,
y una gráfica compartida con el historial de gestión. Permite seleccionar KR,
consultar todo el historial o los últimos 30/90 días respecto a la última
medición, alternar porcentaje histórico/valor medido y seleccionar puntos con
ratón o teclado. Los registros antiguos sin meta se abren como valores medidos.
Si cambia la unidad, los valores se presentan individualmente sin unir unidades
incompatibles. El encabezado del historial permanece visible al desplazarse.

Validación local con servicios simulados en memoria, autorizada por el usuario
porque las rutas reales de localhost:5173 requieren una sesión: escritorio de
1280 px y móvil de 390 px; creación de objetivo y KR, campos obligatorios,
registro de medición y actualización del porcentaje, navegación al objetivo,
gráfica interactiva, registros antiguos, historial vacío y búsqueda de iniciativas
sin resultados. No se escribieron datos reales ni se validó una sesión remota.

- `npm run build`.
- `npm test`: incluye `src/features/okrs/model.test.ts`.
- `scripts/test-okr-database.mjs`: prueba la migración en PostgreSQL aislado mediante
  PGlite y tablas mínimas representativas del esquema existente. No usa credenciales
  ni datos remotos. Instalar `@electric-sql/pglite` en una carpeta temporal y apuntar
  `OKR_PGLITE_PATH` a su `dist/index.js`; ejecutar `node scripts/test-okr-database.mjs`.
  Comprueba permisos, aislamiento entre equipos, fechas, mediciones, archivo,
  vínculos duplicados, acciones ajenas, reasignación de dueño y cierre de acciones.
  Ejecutar también con `--legacy` para probar desde el esquema original sin fechas
  ni tabla de KRs. Ambos casos vuelven a aplicar la migración sobre datos existentes.

La prueba aislada no sustituye una validación autenticada en el Supabase de destino
después de aplicar la migración.
