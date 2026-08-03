# Intento 2 — ticket 23: Gestionar el ciclo de vida completo de un Plan (reparación)

**Estado:** completado (outcome `succeeded`). Coordinador: ejecuta la validación definitiva.

**Fixed point:** `96b34c6e7077e0ef70160aab358d002f54719ad1`

**Informe del intento 1:** `attempt-1.md` (mismo directorio). Este intento repara los tres hallazgos bloqueantes de la revisión sin ampliar el alcance del ticket.

**Commit de esta reparación (rama `feature/ticket-23`):** `f48f0a0` — fix(planes): acciones con revisión, referencias archivadas conservadas y Fechas previstas pendientes (ticket 23).

## Hallazgos bloqueantes y su resolución

### Hallazgo 1 — acciones del ciclo de vida sin revisión (spec «API y concurrencia»)

**Evidencia:** «Todas las sustituciones y acciones respetan propiedad y revisión; … una revisión obsoleta … usa el error común con estado `409`». Los endpoints `POST /plans/:planId/activate`, `/complete`, `/duplicate` y `POST /plans/:planId/trainings/:trainingId/omit` y `/restore` no aceptaban ni comprobaban la revisión del cliente.

**Reparación (backend):**
- `back/src/plans/plans-router.ts`: contrato nuevo por acción — `activate` exige `{ revision, startDate }`, `complete`/`omit`/`restore` exigen `{ revision }` (schema estricto `planActionRevisionSchema`) y `duplicate` exige `{ revision, name? }`. Sin revisión → `400 VALIDATION_ERROR` con `fields.revision`. Cada acción mapea `stale-revision` → `409 STALE_REVISION` con el mensaje común.
- `back/src/plans/plans.ts`: cada mutación recibe `revision` y la comprueba **dentro de su transacción** contra la cabecera vigente (`current.revision !== revision` → `stale-revision`), después de propiedad y transición posible y antes de escribir. Nuevos outcomes `stale-revision` en `PlanActivateOutcome`, `PlanCompleteOutcome`, `PlanTrainingTransitionOutcome` y `PlanDuplicateOutcome`.
- Orden deliberado de comprobaciones: propiedad (404) → transición imposible (409) → revisión obsoleta (409). Así una reactivación de un Plan ya activo sigue respondiendo `TRANSITION_IMPOSSIBLE` aunque la revisión enviada sea antigua, y una revisión obsoleta nunca mezcla ni persiste cambios.

**Reparación (frontend):** `front/src/features/plans/api/plans-api.ts` y sus llamadores (`PlanDetailPage.tsx`, `PlansPage.tsx`) envían la revisión leída del Plan en cada acción (`activatePlan(id, revision, startDate)`, `completePlan(id, revision)`, `omitTraining(planId, trainingId, revision)`, `restoreTraining(...)`, `duplicatePlan(id, revision, name?)`).

**Pruebas HTTP nuevas (seam aprobado `back/test/plans.test.ts`):** describe `acciones del ciclo de vida con revisión` — activar/completar/omitir/devolver/duplicar con revisión obsoleta → `409 STALE_REVISION` sin cambios parciales (el Plan conserva estado, revisión, Fechas y estado de Entrenamientos); acciones sin `revision` → `400` con `fields.revision`. Todos los helpers y llamadas existentes de acciones se actualizaron para enviar la revisión vigente (los asserts de transición imposible y 404 se conservan).

### Hallazgo 2 — `replacePlan` revalidaba las Rutinas archivadas como usos nuevos (spec «Rutinas y semántica temporal»)

**Evidencia:** «Las referencias vivas a Rutinas muestran y utilizan su contenido actual, incluso después de activar el Plan». `validatePlanInput` rechazaba *cualquier* Rutina archivada, así que un Plan activo que conserva una referencia ya establecida a una Rutina archivada no podía ni renombrarse ni editar otro día pendiente.

**Reparación (backend):**
- `validatePlanInput` acepta `existingPlanId` opcional. Al editar, carga los Entrenamientos `rutina` vigentes del Plan y construye el conjunto de referencias ya establecidas `trainingId:routineId`. Una Rutina archivada se permite solo cuando la referencia coincide exactamente (mismo Entrenamiento, misma Rutina); cualquier uso nuevo — Entrenamiento nuevo, identidad desconocida o cambio de Rutina a una archivada — sigue rechazado con `400` en `weeks[..].trainings[..].routineId` («La Rutina no está disponible para usos nuevos.»).
- `replacePlan` pasa `existingPlanId: planId`. `createPlan` sigue rechazando siempre las archivadas (sin `existingPlanId`).

**Pruebas HTTP nuevas:** describe `editar un Plan con una Rutina archivada` — (1) un Plan activo que conserva la referencia archivada puede renombrarse y editar otro día pendiente, y la referencia viva sigue resolviendo el contenido actual de la Rutina archivada (`archived: true`); (2) añadir un Entrenamiento nuevo con la Rutina archivada o cambiar la referencia de un día existente a la archivada → `400` sin cambios parciales; (3) un borrador conserva la referencia archivada al editarse.

### Hallazgo 3 — las Fechas previstas pendientes no se presentaban en el editor activo (ticket: «Un Plan activo y sus Fechas previstas se presentan en móvil y escritorio sin confundirlas con Fechas realizadas»)

**Evidencia:** las tarjetas de Entrenamientos *pendientes* de un Plan activo en `PlanEditor.tsx` omitían su `plannedDate` (solo lo mostraban los días omitidos/cerrados).

**Reparación (frontend):** `PlanEditor.tsx` renderiza cada día pendiente de un Plan activo como `Prevista · {fecha}` (estilo `pendingDate` en `PlanEditor.module.css`, mismo lenguaje que la vista de calendario cerrado). Nunca se usa el término «Realizada».

**Pruebas frontend nuevas (seam aprobado `PlansPages.test.tsx`):** test «un día pendiente de un Plan activo muestra su Fecha prevista como "Prevista"» — renderiza el editor del Plan activo y verifica `Prevista · 4 ago` presente y `Realizada` ausente.

## Alcance respetado

- **Excepción documentada (no es hallazgo):** la guarda de completar contra una Sesión activa originada en un Entrenamiento planificado queda diferida al ticket 28; no se añadió ningún enlace Sesión → Entrenamiento planificado (el comentario en `completePlan` se conserva).
- Sin endpoints nuevos, sin pausar/cancelar/archivar, sin cambios de esquema ni migración: la reparación es contrato + validación + UI, sin tocar la base de datos.

## TDD: evidencia por seam (rojo → verde)

Seams aprobados por el coordinador: `back/test/plans.test.ts` (HTTP integrado) y `front/src/features/plans/pages/PlansPages.test.tsx` (+ componentes de Planes). No se añadió ningún seam nuevo.

### Slice 1 — acciones con revisión (backend)
Rojo: 24 fallos al actualizar helpers/call-sites y añadir el describe de revisión (los endpoints ignoraban `revision`; `duplicate` y las transiciones sin cuerpo fallaban por validación). Verde: `activatePlan`/`transitionTrainingStatus`/`completePlan`/`duplicatePlan` con chequeo atómico de revisión + router con schemas estrictos y mapeo `STALE_REVISION`. `bun test back/test/plans.test.ts` → 44 pass.

### Slice 2 — referencias archivadas establecidas (backend)
Rojo: 3 tests del describe «editar un Plan con una Rutina archivada» (renombrar activo con Rutina archivada → 400; uso nuevo → rechazo; borrador → 400). Verde: `existingPlanId` en `validatePlanInput` + `replacePlan`. Mismo archivo → 44 pass.

### Slice 3 — Fecha prevista pendiente en la interfaz (frontend)
Rojo: test «un día pendiente de un Plan activo muestra su Fecha prevista como "Prevista"» fallaba (el texto no se renderizaba). Verde: `pendingDate` en `PlanEditor.tsx` + CSS. Verde del resto: los stubs de acciones se actualizaron para recibir el cuerpo con `revision` y los asserts de activación/duplicación verifican la revisión enviada. `bun run --cwd front test -- src/features/plans/pages/PlansPages.test.tsx` → 13 pass.

## Verificación

- `bun run typecheck` (raíz): back y front, 0 errores.
- `bun test back/test/`: 187 pass / 0 fail (incluye los 44 de Planes).
- `bun run --cwd front test`: 14 archivos / 105 tests, 0 fail.
- `bun run build` (producción): Vite compila correctamente.
- No se corrió la suite completa adicional por contrato: la validación definitiva la posee el coordinador.

## Autorevisión (lente de code-review, dos ejes)

**Limitación del runtime:** el skill `code-review` exige dos sub-agentes paralelos vía una herramienta `Agent` que este runtime de Pi no expone al trabajador (misma limitación que en el intento 1). No se pudieron lanzar sub-agentes; la revisión definitiva la posee el coordinador. Apliqué la misma lente de dos ejes manualmente.

### Eje Estándares
- Convenciones seguidas: vocabulario de dominio en español (revisión, Fecha prevista, usos nuevos); error común con `400`/`404`/`409`; transiciones como acciones explícitas; una transacción por escritura con comprobación atómica; identidades opacas; mensajes de error existentes reutilizados (`staleRevisionMessage`).
- Juicios menores (sin violación dura): el chequeo `current.revision !== revision` aparece en 4 mutaciones (una línea por transacción; extraerlo no aporta); el router repite el mapeo `stale-revision → 409` en 5 endpoints (mismo patrón preexistente que `transition-impossible`, aceptable por tamaño); el campo `revision` del schema se define tres veces (podría compartirse una constante Zod, tamaño trivial).

### Eje Spec
- Hallazgo 1 resuelto: contratos de acción con revisión obligatoria, `409 STALE_REVISION` atómico en las 5 acciones, pruebas HTTP enfocadas y llamadores del frontend actualizados con la revisión leída.
- Hallazgo 2 resuelto: `replacePlan` conserva las referencias archivadas ya establecidas (activo y borrador) y rechaza solo los usos nuevos, con cobertura HTTP de ambos casos y de la ausencia de cambios parciales.
- Hallazgo 3 resuelto: la interfaz activa presenta cada Fecha prevista pendiente como «Prevista» (móvil y escritorio comparten el editor), con prueba frontend enfocada.
- Excepción de alcance respetada: sin guarda de Sesión del ticket 28 ni enlaces Sesión → Entrenamiento planificado.
- Sin alcance extra: no se añadieron endpoints, transiciones ni cambios de esquema fuera del contrato.

## Archivos autoproducidos (paths de esta reparación)

- `back/src/plans/plans-router.ts` — schemas de acción con `revision`, mapeo `STALE_REVISION`.
- `back/src/plans/plans.ts` — revisiones en las 5 mutaciones, `existingPlanId` en `validatePlanInput`, outcomes `stale-revision`.
- `back/test/plans.test.ts` — helpers con revisión + call-sites + describes «acciones del ciclo de vida con revisión» y «editar un Plan con una Rutina archivada».
- `front/src/features/plans/api/plans-api.ts` — acciones con parámetro `revision`.
- `front/src/features/plans/pages/PlanDetailPage.tsx`, `front/src/features/plans/pages/PlansPage.tsx` — llamadores con la revisión del Plan.
- `front/src/features/plans/components/PlanEditor.tsx`, `front/src/features/plans/components/PlanEditor.module.css` — Fecha prevista pendiente como «Prevista».
- `front/src/features/plans/pages/PlansPages.test.tsx` — stubs con `revision` en el cuerpo, asserts de activación/duplicación y test de «Prevista».
- Este informe: `.scratch/gym-training-mvp/orchestration/23/attempt-2.md`.

## Lo que queda

- La revisión definitiva del coordinador (dos ejes) y la validación de la suite completa.
- Guarda de Sesión activa originada en un Entrenamiento planificado al completar un Plan (ticket 28) y el enlace Sesión → Entrenamiento planificado.
