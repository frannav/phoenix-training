# Attempt 1 — Ticket 28: Iniciar Sesiones desde Rutinas y Planes

- **Ticket:** `.scratch/gym-training-mvp/issues/28-iniciar-sesiones-rutinas-planes.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `f3ab2d798ab12a8f14057f02ad8275723fd54918`
- **Branch:** `feature/ticket-28`
- **Commit:** `22b9dfe` — «feat(sesiones): iniciar Sesiones desde Rutinas y Entrenamientos planificados (ticket 28)»
- **Outcome:** succeeded

## Qué se construyó

Iniciar una Sesión desde una Rutina o desde un Entrenamiento planificado
pendiente, conservando el Origen de sesión, copiando los objetivos vigentes en
el instante del inicio (intención original, nunca sincronizada después) y
guardando la Fecha prevista por separado de la Fecha realizada. El Plan pasa a
saber cuándo un día quedó realizado y cuándo una Sesión activa lo bloquea para
completarlo.

**Backend** (`back/src/sessions/`, `back/src/plans/`):

- `POST /api/sessions` acepta ahora `{ origin: "libre" }`, `{ origin: "rutina",
  routineId }` y `{ origin: "plan", planId, trainingId }` (unión discriminada
  con Zod en el límite HTTP). Inicia desde la Rutina o el Entrenamiento
  pendiente copiando Ejercicios y Objetivos como Series previstas
  (`added: false`, pendientes, sin resultado ni RPE), y devuelve 409
  `ACTIVE_SESSION_EXISTS` con el identificador de la Sesión existente si ya hay
  una activa.
- El documento canónico de Sesión se amplía: `origin` (`libre | rutina |
  plan`), `routineId`, `planTrainingId`, `plannedDate` (Fecha prevista del
  origen «plan», conservada por separado de `datePerformed`) y `added` por
  aparición de Ejercicio.
- Reglas de origen: Rutina ajena/inexistente → 404; Rutina archivada → 400
  (uso nuevo); Plan no activo o Entrenamiento no pendiente → 409
  `TRANSITION_IMPOSSIBLE`; Plan/Entrenamiento ajeno o inexistente → 404;
  un Entrenamiento pendiente inicia aunque su Fecha prevista sea pasada o
  futura.
- Conservación de la intención original en `replaceSession`: una Serie prevista
  (`added: false`) no puede eliminarse — se resuelve omitiéndola — y un
  Ejercicio del origen no puede eliminarse de la Sesión; las Series y
  Ejercicios añadidos conservan las reglas del ticket 27. Nueva columna
  `added` en `training_session_exercise` para distinguir origen de añadido.
- `finalizeSession`: al finalizar, el Entrenamiento planificado de origen pasa
  a `realizado` (solo desde pendiente). Un día realizado queda cerrado ante las
  ediciones del Plan activo (mismo tratamiento que un día omitido, sin
  «Devolver a pendiente») y no se convierte en omitido al completar el Plan.
- `completePlan`: devuelve conflicto (409 `TRANSITION_IMPOSSIBLE`) mientras
  exista una Sesión activa originada en un Entrenamiento del Plan; eliminar esa
  Sesión activa desbloquea el Plan y el día permanece pendiente.
- Unicidad «cada Entrenamiento origina como máximo una Sesión finalizada»:
  respaldada por el índice parcial único
  `training_session_one_finalized_per_training_idx` (status `finalizada`) y por
  el estado `realizado` del Entrenamiento.
- Editar un Plan activo con Sesiones originadas: la clave foránea
  `training_session.plan_training_id` pasa a `ON DELETE SET NULL` y
  `replacePlan` restablece la referencia de las Sesiones cuyo Entrenamiento la
  edición conserva; si el día desaparece, la Sesión conserva su Origen y Fecha
  prevista como hecho histórico sin referencia viva.
- Migración de producción `back/drizzle/0010_public_morgan_stark.sql` generada
  con Drizzle Kit (journal y snapshot actualizados): columnas `planned_date`,
  `routine_id`, `plan_training_id` en `training_session`, columna `added` en
  `training_session_exercise` e índice parcial de unicidad por Entrenamiento.
  Nota: Drizzle Kit no emite `ON DELETE SET NULL` en el `ALTER TABLE ADD
  COLUMN` de SQLite; el SQL generado se ajustó a mano para coincidir con el
  snapshot (el snapshot ya registra `set null`).

**Frontend** (solo compatibilidad de contrato y corrección de presentación, sin
seam nuevo de pruebas de interfaz):

- Tipos del documento de Sesión y Plan actualizados (`origin`, fechas,
  `added`, estado `realizado`), `sessionTitle` por origen.
- «Eliminar ejercicio» solo para apariciones añadidas (`added: true`): el
  servidor rechaza ahora eliminar un Ejercicio del origen, así que la interfaz
  oculta el botón en lugar de fallar.
- Un día `realizado` se presenta cerrado en el editor de un Plan activo (etiqueta
  «Realizado», sin «Devolver a pendiente») y como «Realizado» en el calendario
  cerrado de un Plan completado.

## Evidencia TDD por seam (rojo → verde)

Seam aprobado: **API HTTP integrada contra SQLite temporal con las migraciones
de producción** (`back/test/sessions.test.ts` y `back/test/plans.test.ts`). No
se añadió ningún seam nuevo; las pruebas de interfaz existentes solo se
actualizaron para el nuevo contrato (campos `added`/fechas) y para reflejar que
el botón de eliminar Ejercicio ya no aparece en Ejercicios del origen.

### Slice 1 — Iniciar desde una Rutina (rojo → verde)

5 tests escritos primero y rojos (la ruta rechazaba `origin: "rutina"` con 400):
copia de Ejercicios y Objetivos como previstas con origen y Fecha realizada;
independencia tras editar la Rutina; rechazo de Rutina archivada (uso nuevo);
routing a la Sesión activa existente (409 con identificador); Rutina ajena o
inexistente (404). Verde con `startSession` + unión discriminada del router
(misma pasada: el test existente «rechaza un origen todavía no disponible» se
reformuló a «iniciar exige los datos del origen elegido», porque los tres
orígenes ya existen).

### Slice 2 — Iniciar desde un Entrenamiento planificado (rojo → verde)

8 tests rojos primero (404): copia desde referencia viva de Rutina con Fecha
prevista pasada y Fecha realizada separada; copia desde Entrenamiento específico
con Fecha prevista futura; independencia tras editar el Plan y la Rutina;
Entrenamiento no pendiente (409); Plan no activo borrador y completado (409);
Entrenamiento de otro Plan / desconocido / de otra Cuenta (404); la Sesión
desde una Rutina no cambia el estado de ningún día del Plan; routing a la
Sesión activa existente. Verde con `resolvePlanTrainingStartContent` en
`plans.ts` y las reglas de estado en `startSession`.

### Slice 3 — Conservación, finalización, unicidad y bloqueo del Plan (rojo → verde)

- Conservación (3 tests): Serie prevista no eliminable (400 con
  `exercises[i].series`) y sí omitible; Ejercicio del origen no eliminable
  (400 con `exercises`); Series y Ejercicios añadidos siguen eliminables
  (reglas del ticket 27). Verde con los checks de `replaceSession` sobre
  `added`.
- Finalización y unicidad (3 tests en `sessions.test.ts`): finalizar marca el
  Entrenamiento `realizado` conservando la Fecha prevista; un Entrenamiento no
  origina una segunda Sesión (409); completar el Plan con una Sesión activa
  originada devuelve conflicto y eliminar la Sesión lo desbloquea. Verde con la
  transición en `finalizeSession` y la guarda en `completePlan`.
- Plan (3 tests en `plans.test.ts`): completar bloqueado con Sesión activa
  originada (409 exacto) y desbloqueado al eliminar la Sesión; día realizado
  cerrado ante las ediciones del Plan activo y conservado al renombrar; completar
  un Plan conserva los días realizados y convierte los pendientes en omitidos.
  Verde con `validateActivePlanEdit` y `replacePlan` ampliados a `realizado`.

### Slice 4 — Vínculo de origen y edición del Plan (rojo → verde)

2 tests: editar un Plan conservando el Entrenamiento no rompe el vínculo de la
Sesión activa (tras finalizar, el día pasa a realizado); editar un Plan
eliminando el día de una Sesión activa conserva la Sesión como origen histórico
(`planTrainingId` nulo, `plannedDate` intacto, finalización correcta). Rojos por
`FOREIGN KEY constraint failed` al borrar los hijos en `replacePlan` (la Sesión
referenciaba el Entrenamiento); verdes con `ON DELETE SET NULL` + restablecimiento
de referencias conservadas en `replacePlan`.

## Verificaciones enfocadas

- `bun run typecheck`: 0 errores (back y front, `tsc --noEmit`).
- `bun test back/test/sessions.test.ts back/test/plans.test.ts`: **117 pass /
  0 fail** (56 + 5 en sessions… en total 62 sesiones + 53 planes, 2 archivos).
- `bun run --cwd back test`: **234 pass / 0 fail** (3825 asserts, 9 archivos).
- `bun run --cwd front test` (vitest): **120 pass / 0 fail** (14 archivos).
- `bun run --cwd front build`: build de producción correcto.
- No se reclamó el resultado de la suite raíz (`bun run test`): el coordinador
  conserva la validación completa.

## Self-review (skill `$code-review`)

El runtime de Pi no expone la herramienta de sub-agentes (`Agent`) que el skill
`$code-review` usa para lanzar los dos ejes en paralelo — misma limitación que
en los intentos previos. Ambos ejes se realizaron como auto-revisión sobre el
diff autoral; el coordinador conserva la revisión definitiva.

### Estándares

- Vocabulario del dominio en español (`CONTEXT.md`): Origen de sesión, Fecha
  prevista/realizada, Entrenamiento planificado, Serie prevista/añadida, día
  realizado, Plan activo/completado, Cuenta, Deportista.
- Error canónico `{error:{code,message,fields?}}`; `400` entrada inválida
  (incluida Rutina archivada como uso nuevo, campo `routineId`), `401` sin
  sesión, `404` inexistente o ajeno (Rutina, Plan, Entrenamiento), `409`
  revisión obsoleta o transición imposible (`TRANSITION_IMPOSSIBLE`,
  `ACTIVE_SESSION_EXISTS` con `sessionId`). Zod valida en el límite HTTP
  (unión discriminada); las reglas dependientes de estado viven en el caso de
  uso; cada transición usa una transacción con CAS de revisión; toda consulta y
  mutación filtra por la Cuenta autenticada.
- Unicidad respaldada en la base de datos por índices parciales (Sesión activa
  por Cuenta y una finalizada por Entrenamiento), coherente con el patrón del
  repositorio.
- Hallazgos corregidos durante la auto-revisión: (1) la migración generada por
  Drizzle Kit no emite `ON DELETE SET NULL` en `ALTER TABLE ADD COLUMN` — se
  ajustó el SQL a mano para coincidir con el snapshot; (2) un `children` sin
  uso en `startSession` — retirado; (3) construcción de un objeto `exercise`
  falso para el contenido específico — sustituida por un tipo contenido lean
  que solo transporta `exerciseId` y objetivos; (4) `toInput`/`replacePlan`
  necesitan `revision` explícita en los tests nuevos — corregido; (5) los
  fixtures de interfaz necesitan `added` y las fechas nuevas — actualizados;
  (6) el botón «Eliminar ejercicio» se oculta para Ejercicios del origen para
  no fallar contra el nuevo rechazo del servidor.
- Nota sobre transacciones asíncronas: el driver `bun-sqlite` cierra la
  transacción en el primer `await` del callback (verificado empíricamente), por
  lo que `startSession` sigue el patrón ya establecido de `startFreeSession`:
  las invariantes (Sesión activa única, una finalizada por Entrenamiento) están
  respaldadas por los índices parciales, no solo por la transacción.

### Espec

Requisitos del ticket cubiertos uno a uno por la API: «Iniciar» desde Rutina o
Entrenamiento pendiente crea la Sesión (y conduce a la existente si hay una
activa, 409 con identificador); la Sesión conserva el Origen y copia los
objetivos vigentes sin volver a sincronizar; editar la Rutina o el Plan después
de iniciar no modifica los Objetivos ni Resultados de la Sesión; un pendiente
inicia aunque su Fecha prevista sea pasada o futura y la Fecha realizada se
guarda por separado; cada Entrenamiento origina como máximo una Sesión
finalizada y pasa a realizado solo al finalizar; las Series previstas y los
Ejercicios del origen no se eliminan individualmente y se resuelven por omisión,
mientras los añadidos mantienen las reglas del ticket 27; una Sesión desde una
Rutina no cambia el estado de ningún día del Plan; completar un Plan devuelve
conflicto con una Sesión activa originada y eliminar la Sesión desbloquea el
Plan manteniendo el día pendiente; pruebas HTTP integradas de copia e
independencia, fechas, origen, unicidad por Entrenamiento, finalización y
aislamiento entre Cuentas.

Sin scope creep: no se implementó el dashboard (ticket 30), ni la corrección de
Sesiones finalizadas (ticket 48), ni el Historial paginado (ticket 47), ni la
eliminación de Sesiones finalizadas (ticket 49). Dos decisiones de dominio
anotadas: (a) si una edición elimina el Entrenamiento de una Sesión activa, la
Sesión conserva `origin: "plan"` y su Fecha prevista como hecho histórico y la
referencia se libera (`ON DELETE SET NULL`) — no se reatribuye el origen; (b) si
un Entrenamiento pendiente con Sesión activa se mueve de semana en una edición,
la Sesión conserva su `plannedDate` original y no reenlaza al Entrenamiento
movido (hecho histórico). Un día realizado no puede devolverse a pendiente
(transición inexistente, coherente con la spec).

## Archivos de autor (paths)

```
back/drizzle/0010_public_morgan_stark.sql        migración: fechas/orígenes de Sesión, added, índice de unicidad
back/drizzle/meta/0010_snapshot.json             snapshot de la migración
back/drizzle/meta/_journal.json                  journal actualizado
back/src/db/schema.ts                            columnas y FK ON DELETE SET NULL de training_session, added en la aparición
back/src/sessions/sessions.ts                    SessionOrigin, documento ampliado, startSession, conservación, finalize → realizado
back/src/sessions/sessions-router.ts             unión discriminada de inicio y mapeo de errores
back/src/plans/plans.ts                          PlanTrainingStatus "realizado", resolvePlanTrainingStartContent, completePlan guardado, edición cerrada, reenlace
back/src/plans/plans-router.ts                   error de completar con Sesión activa originada
back/test/sessions.test.ts                       18 tests nuevos + 1 reformulado (62 en total)
back/test/plans.test.ts                          6 tests nuevos (53 en total)
front/src/features/sessions/api/sessions-api.ts  tipos y sessionTitle por origen
front/src/features/sessions/pages/ActiveSessionPage.tsx    «Eliminar ejercicio» solo para añadidos
front/src/features/sessions/pages/ActiveSessionPage.test.tsx   fixtures y occurrenceDoc con added
front/src/features/plans/api/plans-api.ts        PlanTrainingStatus con "realizado"
front/src/features/plans/components/PlanEditor.tsx           día realizado cerrado, sin devolver a pendiente
front/src/features/plans/pages/PlanDetailPage.tsx            etiqueta Realizado en calendario cerrado
front/src/app/AppShell.test.tsx                  fixture con las fechas nuevas
front/src/features/dashboard/pages/HomePage.test.tsx         fixture con las fechas nuevas
.scratch/gym-training-mvp/orchestration/28/attempt-1.md
```

## Lo que queda

- **Interacción de interfaz del ticket (seam nuevo, no aprobado):** los botones
  «Iniciar» desde el detalle de una Rutina y desde un Entrenamiento planificado
  pendiente (que abren la pantalla de la Sesión), y la cabecera de la Sesión
  mostrando el nombre del origen. No se añadió el seam de pruebas de interfaz
  sin aprobación del coordinador; el backend ya expone todo el contrato
  necesario (`origin`, `routineId`, `planTrainingId`, `plannedDate`).
- Suite completa raíz (`bun run test`) del coordinador.
- Revisión definitiva del coordinador (los dos ejes del skill `$code-review` no
  pueden lanzarse en sub-agentes en el runtime de Pi).
- Tickets siguientes: 30 (acción diaria y progreso del Plan, consumirá el
  estado `realizado`), 47/48 (Historial y corrección de Sesiones finalizadas),
  49 (eliminar Sesión finalizada devolverá su Entrenamiento a pendiente).
