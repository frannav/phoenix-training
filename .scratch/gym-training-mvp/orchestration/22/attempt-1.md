# Intento 1 — Ticket 22: Diseñar Planes borrador

**Estado:** ✅ Completado (commit `6add71d`)
**Rama:** `feature/ticket-22` · **Punto fijo:** `27344b5`

## Resumen

Implementado el flujo completo de Planes borrador: API REST de Planes sobre
agregados completos (listar, obtener, crear, sustituir con concurrencia
optimista y eliminar con confirmación), editor React en `/planes`,
`/planes/nuevo` y `/planes/:planId`, migración Drizzle `0007`, y pruebas HTTP
integradas + de interfaz en los seams acordados. Un Entrenamiento planificado
ocupa un día de una semana y usa una Rutina mediante referencia viva o un
Entrenamiento específico independiente; «Personalizar solo este día» copia el
contenido vigente de la Rutina y lo independiza.

## Commit

- `6add71d` — «Diseñar Planes borrador con semanas y Entrenamientos
  planificados (ticket 22)»

## Rutas de autoría (20 archivos, +6958/−80)

**Backend**
- `back/drizzle/0007_silky_domino.sql` (nueva migración) y
  `back/drizzle/meta/0007_snapshot.json`, `back/drizzle/meta/_journal.json`
- `back/src/db/schema.ts` — tablas `plan`, `plan_week`, `plan_training`,
  `plan_training_exercise`, `plan_training_series_goal`
- `back/src/plans/plans.ts`, `back/src/plans/plans-router.ts` (nuevos)
- `back/src/domain/series-goals.ts` (nuevo) — límites de objetivos compartidos
- `back/src/routines/routines.ts` — usa el módulo compartido y añade
  `resolveRoutineReferences` para la referencia viva
- `back/src/app.ts` — monta `createPlansRouter`
- `back/test/plans.test.ts` (nuevo, 19 pruebas)

**Frontend**
- `front/src/features/plans/api/plans-api.ts` (nuevo)
- `front/src/features/plans/components/PlanEditor.tsx` + `.module.css` (nuevos)
- `front/src/features/plans/pages/PlansPage.tsx` (reescrito), `NewPlanPage.tsx`,
  `PlanDetailPage.tsx`, `PlansPage.module.css` (nuevos)
- `front/src/features/plans/pages/PlansPages.test.tsx` (nuevo, 5 pruebas)
- `front/src/app/App.tsx` (imports por página) y `front/src/app/App.test.tsx`
  (stubs HTTP de las rutas de Planes, que pasan de ser páginas vacías a
  funcionales)

## TDD: cortes verticales rojo → verde

Seam 1 (HTTP integrado): `back/test/plans.test.ts` escrito primero (rojo:
`Export named 'plan' not found` y rutas 404), luego esquema + migración +
`plans.ts` + `plans-router.ts` + montaje → verde (19/19).

- Crear borrador con nombre, semanas y Entrenamientos (referencia viva con
  contenido resuelto + contenido específico), 401 sin sesión, validación de
  nombre.
- Validación del agregado: ≥1 semana y ≥1 Entrenamiento, día único por semana
  (y día 0–6), Rutina propia disponible y sin contenido específico mezclado,
  Entrenamiento específico con Formas de registro y límites de dominio
  (cardio una Serie, objetivos admitidos, carga/repeticiones/duración).
- Referencia viva: cambiar la Rutina después de crear el Plan y comprobar que
  el Entrenamiento muestra el contenido vigente.
- Personalizar: copiar el contenido al específico con identidades nuevas,
  cambiar la Rutina de nuevo y comprobar la independencia.
- Sustitución: conservación de identidades (semana, Entrenamiento, Ejercicio
  específico, Serie) con reasignación del servidor para los nuevos, revisión
  incrementada, `409` con revisión obsoleta, dos PUT concurrentes con la misma
  revisión → uno gana y el otro recibe conflicto sin mezclar hijos.
- Eliminación: `{ deleted: true }`, el recurso responde 404 después, la Rutina
  y los Ejercicios referenciados siguen existiendo, guarda de no-borrador
  (`409 TRANSITION_IMPOSSIBLE`, estado preparado directamente en la BD porque
  la activación es el ticket 23), 404 para ajenos.
- Aislamiento entre Cuentas: listados disjuntos, get/put/delete ajeno → 404,
  referencia a Rutina o Ejercicio personalizado ajeno rechazada en validación.

Seam 2 (frontera de la funcionalidad Planes): `PlansPages.test.tsx` escrito
primero (rojo: módulos inexistentes), luego `plans-api.ts`, `PlanEditor` y las
tres páginas → verde (5/5).

- Listado con resumen y enlace; eliminación con diálogo `aria-modal`
  accesible: cancelar conserva y confirmar elimina.
- Creación: validación inmediata del borrador, añadir Entrenamiento a la
  semana, elegir Rutina disponible, payload POST correcto (día 0, fuente
  `rutina`, `specific: []`).
- Edición: prellenado, «Personalizar solo este día» convierte el Entrenamiento
  en contenido específico (el payload PUT no conserva las identidades de la
  Rutina) y `409` → banner de conflicto + «Cargar la versión actual» reobtiene
  el documento sin mezclar.

No se añadió ningún seam nuevo: ambos son los aprobados por el coordinador.

## Verificación

- `bun run typecheck` — back y front: código 0.
- `bun test --cwd back` — 149 pruebas en 9 archivos, 0 fallos (19 nuevas de
  Planes; las 19 de Rutinas siguen verdes tras el módulo compartido).
- `bun run --cwd front test` (Vitest; el comando `bun test --cwd front` del
  brief invoca el runner de Bun, que no soporta `vi.unstubAllGlobals` y falla
  también en los tests preexistentes) — 85 pruebas en 14 archivos, 0 fallos
  (5 nuevas de Planes).

## Revisión de dos ejes (código-revisión)

Limitación del runtime: la skill `code-review` requiere dos sub-agentes en
paralelo vía una herramienta `Agent` que esta sesión de worker no expone; la
revisión se hizo en un único contexto y la revisión definitiva la posee el
coordinador.

**Spec (ticket 22 + spec.md):** los 9 criterios de aceptación quedan cubiertos
y demostrados por pruebas en los seams: listar/crear/obtener borradores
privados; día concreto de semana con referencia viva o contenido específico;
sin Fechas previstas ni efecto sobre calendario (el esquema no tiene fechas);
personalización que deja de seguir la Rutina; editor con añadir/eliminar/
mover/reordenar/modificar (día + semana + contenido); sustitución del agregado
completo en transacción con identidades conservadas y revisión incrementada;
conflicto de revisión obsoleta con recarga sin fusión; eliminación con
confirmación que no borra Rutinas ni Ejercicios. Nota de diseño: «Personalizar
solo este día» se modela como conversión de contenido dentro del PUT del
agregado (la interfaz copia el contenido resuelto y lo envía como específico)
en lugar de un endpoint de transición; «Las transiciones se modelan como
acciones explícitas» aplica a transiciones de estado (activar/completar/omitir,
tickets 23–24), y personalizar solo cambia el tipo de contenido del día.

**Standards:** nombres y mensajes en el vocabulario de `CONTEXT.md` (Plan
borrador, Entrenamiento planificado, Entrenamiento específico, referencia
viva); contrato de error `{error:{code,message,fields}}` con 400/401/404/409;
mismos patrones que Rutinas (transacción síncrona con CAS, identidades
opacas, listados completos, middleware de Cuenta autenticada); Drizzle como
única capa; límites de objetivos extraídos a `back/src/domain/series-goals.ts`
para evitar duplicación con Rutinas. Hallazgos de autoevaluación corregidos:
re-exports muertos en `routines.ts`, `planFieldKey` y parámetro `now` sin uso,
y el listado ocultaba Planes no borrador (ahora lista todos con su estado y
solo ofrece eliminar a los borradores).

## Queda pendiente

- La activación (ticket 23) y omitir/completar/duplicar (ticket 24) consumen
  el estado `status` ya persistido; la guarda de eliminación de no-borrador
  está implementada y probada con preparación directa de estado.
- El coordinador ejecuta la validación completa del repositorio (el worker no
  exige la suite completa; back y front completos pasan igualmente).
- Revisión definitiva del coordinador con los sub-agentes de `code-review`.
