# Intento 1 — ticket 23: Gestionar el ciclo de vida completo de un Plan

**Estado:** completado (outcome `succeeded`). Coordinador: ejecuta la validación definitiva.

**Fixed point:** `96b34c6e7077e0ef70160aab358d002f54719ad1`

**Commits en `feature/ticket-23` (en orden):**
- `da1fe1c` — feat(planes): activar, adaptar, omitir, completar y duplicar Planes (ticket 23) — backend + migración + pruebas HTTP.
- `1c2585f` — feat(planes): ciclo de vida completo en la interfaz (ticket 23) — frontend.
- `9181209` — fix(planes): duplicar desde el detalle no reescribe la caché del Plan original (ticket 23).

**Ramas de trabajo:** todo el trabajo vive en `feature/ticket-23`; no hay ramas paralelas. El árbol de trabajo quedó limpio tras los commits.

## Archivos autoproducidos (paths)

**Backend**
- `back/src/db/schema.ts` — `plan.start_date`, `plan_training.planned_date` y `plan_training.status`; índice parcial `plan_single_active_idx` (una Cuenta, un Plan activo).
- `back/drizzle/0009_fair_the_hood.sql`, `back/drizzle/meta/0009_snapshot.json`, `back/drizzle/meta/_journal.json` — migración generada por Drizzle Kit.
- `back/src/domain/domain-dates.ts` — fechas de dominio `YYYY-MM-DD` en UTC: parseo, suma de días, `isMonday` y `plannedDateFor(semana, día)`.
- `back/src/plans/plans.ts` — `activatePlan`, `omitTraining`, `restoreTraining`, `completePlan`, `duplicatePlan`, validación de edición de Plan activo (`validateActivePlanEdit`), sustitución consciente del estado (fechas/estado conservados o recalculados) y documento con `startDate`/`plannedDate`/`status`.
- `back/src/plans/plans-router.ts` — endpoints explícitos `POST /plans/:planId/activate`, `/complete`, `/duplicate`, `POST /plans/:planId/trainings/:trainingId/omit` y `/restore`; mapeo del nuevo `TRANSITION_IMPOSSIBLE` de la sustitución.
- `back/test/plans.test.ts` — helpers nuevos + 4 describes nuevos (activación, edición de Plan activo, omitir/devolver/completar, duplicar).

**Frontend**
- `front/src/features/plans/api/plans-api.ts` — tipos con `startDate`/`plannedDate`/`status`, funciones `activatePlan`/`completePlan`/`omitTraining`/`restoreTraining`/`duplicatePlan`, `formatDomainDate` y `planCalendarRange`.
- `front/src/features/plans/components/ActivatePlanPanel.tsx` — selector del lunes de la primera semana con validación inmediata.
- `front/src/features/plans/components/PlanEditor.tsx` — restricciones del Plan activo (semanas fijas, días omitidos en solo lectura, omitir/devolver), y sus estilos en `PlanEditor.module.css`.
- `front/src/features/plans/pages/PlansPage.tsx` — estados distinguibles, rango de calendario, acciones por estado (Eliminar solo borrador, Duplicar cualquiera); estilos responsive en `PlansPage.module.css`.
- `front/src/features/plans/pages/PlanDetailPage.tsx` — panel de activación (borrador), editor restringido + omitir con confirmación + completar con confirmación + duplicar (activo), calendario cerrado en solo lectura (completado).
- `front/src/features/plans/pages/PlansPages.test.tsx` — stub ampliado con las acciones + 7 tests nuevos de ciclo de vida.

## TDD: evidencia por seam (rojo → verde)

Seam aprobado por el coordinador: `back/test/plans.test.ts` y `front/src/features/plans/pages/PlansPages.test.tsx`. No se añadió ningún seam nuevo (las consultas al coordinador no fueron necesarias; el alcance encajaba en los seams aprobados).

### Slice 1 — activación y Fechas previstas (backend)
Tests rojos primero: 5 tests en `describe("activar Planes en el calendario")` (cálculo `lunes + 7·semana + día`, lunes obligatorio sin cambios parciales, unicidad de Plan activo sin cambios parciales, no reactivar / aislamiento, 401). Fracasaban con 404 porque el endpoint no existía. Implementación: columnas + migración + `domain-dates.ts` + `activatePlan` (transacción síncrona, CAS del estado, respaldo del índice parcial ante carrera) + endpoint. Verde: 24 pass (los 19 previos + 5). Typecheck limpio.

### Slice 2 — edición restringida de un Plan activo (backend)
Tests rojos: 5 tests en `describe("editar un Plan activo")` (renombrar/mover pendiente/añadir entrenamiento conservando días omitidos con su Fecha prevista; modificar un día no pendiente → 409; reorganizar semanas → 409; editar completado → 409; revisión obsoleta → 409). Fracasaban con 200 (la sustitución aún permitía todo). Implementación: `validateActivePlanEdit` (semanas fijas; los días `omitido` deben permanecer byte a byte) + reescritura del rebuild con `plannedDate`/`status` (los omitidos conservan los suyos; los pendientes y nuevos se recalculan). Verde: 29 pass. Un test mío apuntaba mal (editaba el día cerrado en el payload): corregido el test, no la implementación.

### Slice 3 — omitir/devolver/completar/duplicar (backend)
Tests rojos: 7 tests en dos describes (transición explícita omitir/devolver con 409 en repeticiones y solo en Plan activo; completar convierte pendientes en omitidos, no se reactiva y libera el cupo; duplicar borrador/activo/completado como borrador sin fechas/estados, referencias vivas conservadas y copias independientes con identidades nuevas; aislamiento entre Cuentas → 404). Implementación: `transitionTrainingStatus` compartido, `completePlan` (todo en una transacción), `duplicatePlan` (copia en una sola transacción, sin re-validar los usos ya establecidos del original). Verde: 36 pass. Todo el backend: 179 pass / 0 fail.

### Slice 4 — ciclo de vida en la interfaz (frontend)
Tipos y funciones API → lista con estados/rango/acciones → panel de activación → editor restringido → detalle por estado → presentación responsive (media queries). Pruebas nuevas en `PlansPages.test.tsx`: estados distinguibles y transiciones inexistentes ausentes (Pausar/Cancelar/Archivar), duplicar desde el listado, activación con lunes obligatorio y conflicto 409 mostrado, omitir con confirmación + devolver a pendiente + completar con confirmación, editor sin «Añadir/Quitar semana» en activo, calendario cerrado en solo lectura con «Prevista» (nunca «Realizada»). El fixture `planFixture` se actualizó con `startDate: null`/`plannedDate: null`/`status: null`. Verde: 12 pass en el archivo; suite frontend completa: 104 pass / 0 fail.

## Verificación

- `bun run typecheck` (raíz): back y front, 0 errores.
- `bun test back/test/`: 179 pass / 0 fail (incluye cuenta, catálogo, ejercicios, rutinas, sesiones, RM, salud y los 36 de Planes).
- `bun run --cwd front test`: 14 archivos / 104 tests, 0 fail.
- `bun run build` (producción): Vite compila los CSS modules y el bundle correctamente.

## Autorevisión (lente de code-review, dos ejes)

**Limitación del runtime:** el skill `code-review` exige dos sub-agentes paralelos vía una herramienta `Agent` que este runtime de Pi no expone al trabajador. No se pudieron lanzar sub-agentes; la revisión definitiva la posee el coordinador. Apliqué la misma lente de dos ejes de forma manual.

### Eje Estándares (convenciones del repo + olores Fowler)
- Convenciones seguidas: vocabulario de dominio en español (Plan borrador/activo/completado, Entrenamiento planificado, Fecha prevista, pendiente/omitido); contrato de error común con `409` para transición imposible/revisión obsoleta, `404` para ajenos/inexistentes, `400` para validación; transiciones como acciones explícitas, nunca valores libres; una transacción por escritura; identidades opacas asignadas por el servidor; concurrencia optimista por revisión.
- Olores posibles (juicios, sin violación dura): `PlanTrainingTransitionOutcome` con dos razones que llevan `message` y el router que las conmuta dos veces (Repeated Switches menor, 4 casos en total); `serializeSpecificContent` basado en `JSON.stringify` para comparar días cerrados (acoplado al orden de claves, pero ambos lados construyen la misma forma). Ambos se consideran aceptables por tamaño.
- Un defecto real encontrado y corregido: duplicar desde el detalle escribía el documento del borrador copia en la caché de la *misma* `planId` del Plan original (`setQueryData(["plan", planId], …)`) → al volver atrás se vería el copia sin refetch. Corregido en `9181209`: duplicar ya no toca la caché del Plan actual.

### Eje Spec (ticket 23 + spec.md)
- Todos los criterios del ticket implementados y cubiertos por pruebas HTTP integradas: cálculo de fechas, activación única y atómica, unicidad de Plan activo, edición permitida/prohibida, referencias vivas (comportamiento preexistente conservado; la resolución es la misma para borrador y activo), omitir con confirmación, devolver a pendiente solo en activo, completar convierte pendientes en omitidos y cierra, imposibilidad de reactivar, semántica exacta de duplicación, transaccionalidad sin cambios parciales, aislamiento entre Cuentas.
- Decisiones documentadas en el código: (1) completar aún no comprueba «Sesión activa originada en el Plan» porque las Sesiones todavía no pueden originarse en Entrenamientos planificados (ticket 28); la guarda vive marcada en `completePlan`. (2) La duplicación copia las referencias establecidas del original sin re-validar «usos nuevos» (así «Cualquier Plan puede duplicarse… conservando referencias a Rutinas»), incluida una Rutina archivada; se señaló la alternativa más estricta en el código.
- Sin alcance extra: no se añadieron pausar/cancelar/archivar ni endpoints fuera del contrato de la spec.

## Lo que queda

- La revisión definitiva del coordinador (dos ejes) y la validación de la suite completa, que no corrí por contrato.
- Guarda de Sesión activa en `completePlan` cuando el origen «Entrenamiento planificado» exista (ticket 28) y el enlace Sesión → Entrenamiento planificado.
- Un test explícito de «referencia viva tras activar» (el mecanismo es idéntico al ya probado en borrador, pero no hay un caso HTTP dedicado post-activación).
