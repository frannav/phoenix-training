# Attempt 2 — Ticket 28: Iniciar Sesiones desde Rutinas y Planes (reparación de la revisión)

- **Ticket:** `.scratch/gym-training-mvp/issues/28-iniciar-sesiones-rutinas-planes.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `f3ab2d798ab12a8f14057f02ad8275723fd54918`
- **Branch:** `feature/ticket-28`
- **Commit de la reparación:** `cd2378a` — «fix(sesiones): «Iniciar» desde Rutina y Entrenamiento pendiente abre la Sesión (ticket 28)»
- **Estado:** succeeded (la revisión definitiva la conserva el coordinador)

## Qué se reparó

El intento 1 dejó el contrato de dominio completo en la API, pero la interfaz
no exponía el inicio desde un Origen de sesión. La evidencia de revisión
bloqueante pedía, sin ampliar el alcance del ticket, que «Iniciar» desde una
Rutina o un Entrenamiento planificado pendiente creara y abriera la pantalla de
la Sesión, y que ante una Sesión activa existente las entradas condujeran a
ella. Se repararon los tres hallazgos:

1. **`front/src/features/sessions/api/sessions-api.ts`** ya no expone solo
   `startFreeSession`: añade `SessionStartInput` (unión discriminada `libre |
   rutina | plan`, espejo exacto del `startSessionSchema` del router) y
   `startSession(input)` que hace `POST /api/sessions`. `startFreeSession` pasa
   a delegar en `startSession({ origin: "libre" })` sin cambiar su contrato.
2. **Detalle de Rutina** (`RoutineDetailPage.tsx`): nueva tarjeta «Iniciar una
   Sesión» con el botón «Iniciar» solo para Rutinas disponibles (una Rutina
   archivada no se ofrece para usos nuevos, coherente con la spec). Envía
   `{ origin: "rutina", routineId }` y abre la Sesión creada.
3. **Detalle de Plan activo** (`PlanDetailPage.tsx` + `PlanEditor.tsx`): cada
   Entrenamiento planificado pendiente con identidad persistida ofrece el botón
   «Iniciar» junto a «Omitir este día»; envía
   `{ origin: "plan", planId, trainingId }` y abre la Sesión creada. Un día
   omitido o realizado no ofrece el botón. Las entradas añadidas sin guardar
   (sin identidad de servidor) tampoco lo ofrecen.

Comportamiento compartido en un contrato público pequeño de la funcionalidad
Sesiones: **`use-start-session.ts`** (`front/src/features/sessions/api/`).
El hook incorpora la respuesta canónica a la caché de la Sesión activa
(`activeSessionQueryKey`) y navega a `/sesion/:id`; si el servidor responde el
conflicto recuperable `409 ACTIVE_SESSION_EXISTS` con el identificador, lee la
Sesión activa (lectura directa, sin depender de la frescura de la caché), la
incorpora y conduce a ella en lugar de crear otra. Cualquier otro error queda
visible en la página con el mensaje del servidor (autoridad del servidor) sin
navegar.

Sin expansión de alcance: no se tocó el dominio ni la API (todo el contrato ya
existía del intento 1), ni el dashboard (ticket 30), ni el Historial o la
corrección de Sesiones finalizadas. `HomePage` conserva su mutación inline
preexistente (mismo comportamiento, cubierto por sus propios tests); adoptar el
hook allí sería una limpieza ajena a este ticket.

## Evidencia TDD por seam (rojo → verde)

Seams aprobados: la **API HTTP integrada** contra SQLite temporal con las
migraciones de producción ya cubría las reglas de dominio (intento 1, sin
cambios en este intento) y el **seam de componentes React Testing Library
existente** para las interacciones de entrada y la navegación. No se inventó
ningún seam de producción nuevo; solo se extendieron los archivos de tests de
componentes existentes (`RoutinesPage.test.tsx`, `PlansPages.test.tsx`).

### Slice 1 — «Iniciar» desde una Rutina (rojo → verde)

4 tests escritos primero y rojos (el botón «Iniciar» no existía; 3 fallaron, el
negativo de archivada pasaba por construcción):

- «una Rutina disponible ofrece Iniciar y abre la Sesión creada desde ella»:
  el POST recibe `{ origin: "rutina", routineId }` y la navegación llega a
  `/sesion/:id` (ruta destino que muestra el identificador).
- «si ya existe una Sesión activa, Iniciar conduce a ella sin crear otra»:
  `409 ACTIVE_SESSION_EXISTS` con `sessionId` → lectura de la activa →
  navegación a la existente.
- «una Rutina archivada no ofrece Iniciar para usos nuevos».
- «un fallo al iniciar muestra el error del servidor sin navegar».

Verde con `startSession` en `sessions-api.ts`, el hook `useStartSession` y la
tarjeta de inicio en `RoutineDetailPage` (misma pasada).

### Slice 2 — «Iniciar» desde un Entrenamiento planificado (rojo → verde)

4 tests escritos primero y rojos (3 fallaron; el negativo de omitido pasaba por
construcción):

- «un Entrenamiento pendiente ofrece Iniciar y abre la Sesión creada desde él»:
  el POST recibe `{ origin: "plan", planId, trainingId }` y la navegación llega
  a `/sesion/:id`.
- «si ya existe una Sesión activa, Iniciar conduce a ella sin crear otra»
  (mismo flujo de conflicto recuperable).
- «un día omitido no ofrece Iniciar».
- «un fallo al iniciar muestra el error del servidor sin navegar» (`409
  TRANSITION_IMPOSSIBLE`).

Verde con `onRequestStart`/`startPending` en `PlanEditor` (botón por
Entrenamiento pendiente con identidad persistida) y el cableado en
`PlanDetailPage` (misma pasada). Hallazgo de tipos en la pasada verde: el
estrechamiento de `training.id` no sobrevive dentro del manejador `onClick`;
se captura en una constante `startTrainingId` en el cuerpo del callback de
`map` (mismo patrón de estrechamiento const que ya usan `onRequestOmit`).

## Verificaciones enfocadas

- `bun run typecheck`: 0 errores (back y front, `tsc --noEmit`).
- `bun run --cwd front test`: **128 pass / 0 fail** (14 archivos; +8 tests
  nuevos de interfaz).
- `bun run --cwd front test src/features/routines/pages/RoutinesPage.test.tsx
  src/features/plans/pages/PlansPages.test.tsx
  src/features/sessions/pages/ActiveSessionPage.test.tsx`: **59 pass / 0 fail**.
- `bun test back/test/sessions.test.ts back/test/plans.test.ts`: **117 pass /
  0 fail** (sin cambios de dominio; los tests del intento 1 siguen verdes).
- `bun run --cwd front build`: build de producción correcto.
- No se reclamó el resultado de la suite raíz (`bun run test`): el coordinador
  conserva la validación completa.

## Self-review (skill `$code-review`)

El runtime de Pi no expone la herramienta de sub-agentes (`Agent`) que el skill
usa para lanzar los dos ejes en paralelo — misma limitación que en el intento 1.
Ambos ejes se realizaron como auto-revisión sobre el diff autoral
(`git diff 6dec892..cd2378a` + el fichero nuevo del hook); el coordinador
conserva la revisión definitiva.

### Estándares

- Vocabulario del dominio en español (`CONTEXT.md`): Origen de sesión, Rutina
  archivada («no se ofrece para usos nuevos»), Entrenamiento planificado
  pendiente, Sesión activa única, Sesión libre, Día omitido/realizado.
- Arquitectura de frontend de la spec: TanStack Query como única caché — la
  mutación incorpora la respuesta canónica en `activeSessionQueryKey`;
  contrato público pequeño entre funcionalidades (`startSession` +
  `useStartSession`); el servidor sigue siendo la autoridad (mensaje de error
  del `ApiRequestError`); botones con texto, sección con `aria-labelledby`,
  estados por texto e icono, no solo color.
- Errores: la interfaz trata `ACTIVE_SESSION_EXISTS` como conflicto recuperable
  con ruta a la Sesión existente, y muestra cualquier otro error sin navegar.
- Olores (juicios, no violaciones): **Duplicated Code** leve — el ternario de
  formato del mensaje de error de inicio se repite en `RoutineDetailPage` y
  `PlanDetailPage` (5 líneas); se dejó así por simplicidad. La lógica inline de
  `HomePage` para el mismo flujo es preexistente y queda fuera del alcance del
  ticket. No hay nombres misteriosos, clumps de datos nuevos (la tupla
  `{id, day, plannedDate}` ya viajaba en `onRequestOmit`), switches repetidos
  ni generalidad especulativa (`SessionStartInput` es el espejo del esquema Zod
  del router).

### Espec

Hallazgos bloqueantes resueltos uno a uno:

1. «RoutineDetailPage.tsx renderiza solo el editor/aviso y no tiene acción de
   inicio» → resuelto: tarjeta «Iniciar» (Rutinas disponibles) que crea la
   Sesión y abre `/sesion/:id`.
2. «PlanDetailPage.tsx renderiza el editor/acciones del Plan activo sin acción
   de inicio del Entrenamiento pendiente» → resuelto: botón «Iniciar» por
   Entrenamiento pendiente dentro del editor del Plan activo.
3. «sessions-api.ts expone solo startFreeSession» → resuelto: `startSession`
   con la unión discriminada del contrato `libre | rutina | plan`.

Items del ticket cubiertos por la interfaz: item 1 («Iniciar» crea la Sesión y
abre su pantalla, salvo que ya exista otra activa) e item 9 (las entradas desde
Rutinas y Planes conducen a la Sesión activa existente). Los items 2–8 y 10 son
reglas de dominio ya cubiertas por la API integrada del intento 1 (copia e
independencia, fechas por separado, unicidad por Entrenamiento, conservación
de la intención original, aislamiento por Cuenta) y no se duplicaron en el
frontend, conforme a la decisión de testing de la spec.

Sin scope creep: no hay endpoints nuevos, ni cambios de dominio, ni
modificaciones del dashboard, Historial o corrección de Sesiones.

## Archivos de autor (paths)

```
front/src/features/sessions/api/sessions-api.ts          SessionStartInput y startSession; startFreeSession delega
front/src/features/sessions/api/use-start-session.ts     hook compartido: abre la Sesión creada o conduce a la activa
front/src/features/routines/pages/RoutineDetailPage.tsx  tarjeta «Iniciar» para Rutinas disponibles
front/src/features/routines/pages/RoutinesPage.module.css  estilos de la tarjeta de inicio
front/src/features/routines/pages/RoutinesPage.test.tsx   4 tests nuevos (seam de componentes existente)
front/src/features/plans/pages/PlanDetailPage.tsx        cableado onRequestStart/startPending y error de inicio
front/src/features/plans/components/PlanEditor.tsx       botón «Iniciar» por Entrenamiento pendiente persistido
front/src/features/plans/components/PlanEditor.module.css  estilos de las acciones del Entrenamiento pendiente
front/src/features/plans/pages/PlansPages.test.tsx       4 tests nuevos (seam de componentes existente)
.scratch/gym-training-mvp/orchestration/28/attempt-2.md  este informe
```

## Lo que queda

- Revisión definitiva del coordinador (los dos ejes del skill `$code-review`
  no pueden lanzarse en sub-agentes en el runtime de Pi).
- Suite completa raíz (`bun run test`) del coordinador.
- Limpieza opcional fuera de alcance: que `HomePage` adopte `useStartSession`
  para unificar el flujo de inicio en un solo lugar.
