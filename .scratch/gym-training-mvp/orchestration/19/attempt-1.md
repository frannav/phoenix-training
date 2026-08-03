# Attempt 1 — Ticket 19: Gestionar Ejercicios personalizados

- **Ticket:** `.scratch/gym-training-mvp/issues/19-gestionar-ejercicios-personalizados.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `9feb11d0b7d46d9a430cc304c505ef4b1a7b4ea7`
- **Branch:** `main`
- **Commit:** `229a0de` — «Gestionar Ejercicios personalizados (ticket 19)»
- **Outcome:** succeeded

## Qué se construyó

Una Cuenta puede crear, renombrar/editar datos compatibles, archivar y
restaurar Ejercicios personalizados privados, combinados con el catálogo
compartido en un único flujo de listado y selección con procedencia marcada.

**Backend** (nuevo sub-enrutador `back/src/exercises/` montado bajo `/api`,
sustituyendo los dos endpoints inline de `app.ts` sin cambiar su
comportamiento — los tests previos del catálogo lo verifican):

- `POST /api/exercises` — crea un personalizado con identidad opaca
  (`randomBytes(16).toString("hex")`), nombre normalizado para búsqueda,
  Forma de registro y taxonomía; responde `201` con el documento canónico.
- `PUT /api/exercises/:id` — sustituye los datos compatibles (nombre,
  instrucciones, categoría, parte del cuerpo, equipamiento) y devuelve la
  respuesta canónica. Cambiar la Forma de registro devuelve `409
  RECORDING_MODE_IMMUTABLE` («La Forma de registro de un Ejercicio publicado
  o utilizado no puede cambiar.»): queda fijada al crear y la corrección
  incompatible se resuelve creando otro Ejercicio. Editar el catálogo o un
  personalizado ajeno responde `404` indistinguible de inexistente.
- `POST /api/exercises/:id/archive` y `.../restore` — transiciones explícitas
  e idempotentes (spec: «Las transiciones se modelan como acciones
  explícitas»); archivar retira de usos nuevos sin cambiar la identidad y
  restaurar vuelve a ofrecerlo.
- `GET /api/exercises/:id` — resuelve cualquier Ejercicio visible aunque esté
  archivado o retirado (`available = false`), conservando el contexto de las
  referencias existentes (spec: «continúan resolviendo cualquier Ejercicio no
  disponible»). Los personalizados ajenos responden `404`.
- `GET /api/exercises/archived` — personalizados propios archivados, para
  gestionar su restauración sin mezclarlos con los usos nuevos.
- `GET /api/exercises` y `.../categories` — semántica previa conservada
  (catálogo + personalizados disponibles, procedencia, cursor opaco, límite
  50); los ítems del listado ahora incluyen `available` para unificar el
  documento canónico.

**Frontend** (`/ejercicios`): flujo combinado con procedencia, botón «Nuevo
ejercicio» con formulario validado (React Hook Form + Zod, errores junto al
campo y con `aria-describedby`/`aria-invalid`), Forma de registro bloqueada en
edición con nota explicativa, acciones «Editar»/«Archivar» solo en
personalizados con `aria-label` por Ejercicio, confirmación de archivo
accesible (`role=dialog`, `aria-modal`, `aria-labelledby/describedby`) y
sección «Ejercicios archivados» con «Restaurar». Las mutaciones incorporan la
respuesta canónica y refrescan los listados; CSS mobile-first con columnas a
partir de 40 rem.

## Evidencia TDD por seam (rojo → verde)

Se usó el skill `$tdd` en los seams aprobados. Sin migración nueva: la tabla
`exercise` ya contenía `account_id`, `available`, taxonomía e índice parcial
de unicidad `(source, upstream_id)` que admite múltiples personalizados.

### Seam 1 — API HTTP integrada contra SQLite temporal (crear) — rojo → verde

Primer test rojo (`back/test/custom-exercises.test.ts`): 6 tests de creación
y listados fallaron con `404` (la ruta `POST /api/exercises` no existía).
Verde con `custom-exercises.ts` (casos de uso) + `exercises-router.ts`
(límite HTTP con Zod, middleware de sesión) + cableado en `app.ts`.

### Seam 1 — API HTTP integrada (editar, archivar, restaurar, aislamiento)

14 tests adicionales cubriendo: edición compatible con respuesta canónica y
reflejo en la búsqueda por nombre normalizado; `409` por cambio de Forma de
registro y verificación de que no se persiste; `404` para personalizado ajeno
(la propietaria conserva sus datos) y para el catálogo; validación de entrada
con `fields` y exigencia de al menos un dato; archivar retira del listado
pero `GET :id` sigue resolviéndolo; restaurar recupera la misma identidad;
idempotencia; listado de archivados propios sin filtrar datos ajenos;
aislamiento estricto entre dos Cuentas (lectura y mutación → `404`, mismos
nombres → identidades distintas); catálogo compartido resoluble por cualquier
Cuenta.

### Seam 2 — Listados/selectores combinados

`GET /api/exercises` combina catálogo y personalizados disponibles ordenados
por nombre con `provenance`; los archivados quedan excluidos de usos nuevos;
`/api/exercises/categories` incluye las categorías de los personalizados
propios (consultas acotadas por `account_id`).

### Seam 3 — UI observable de /ejercicios

5 tests de interfaz en `ExercisesPage.test.tsx` (Vitest + Testing Library,
contrato HTTP simulado en el límite): flujo combinado con procedencia;
creación con validaciones visibles junto al campo y payload correcto; edición
prellenada con Forma de registro deshabilitada y nota de inmutabilidad;
archivar con diálogo de confirmación (cancelar conserva, confirmar retira del
listado y lo mueve a archivados); restaurar desde la sección de archivados.
Un test previo se adaptó para desambiguar el nuevo `role=alert` de la sección
de archivados.

## Verificaciones enfocadas

- `bun run --cwd back typecheck`: 0 errores.
- `bun test back/test/custom-exercises.test.ts`: **20/20 pass**.
- `bun test back/test/custom-exercises.test.ts back/test/catalog.test.ts`: 43/43.
- `bun run --cwd front typecheck`: 0 errores; `ExercisesPage.test.tsx`: 12/12.

## Resultado final de la suite completa

- `bun run typecheck`: 0 errores (back y front).
- `bun run test`: backend **68 pass / 0 fail** (827 asserts, 5 archivos);
  frontend **58 pass** (9 archivos).
- `bun run build`: build de producción correcto.

## Self-review (skill `$code-review`)

El runtime de Pi no expone herramienta de sub-agentes (no hay `Agent`), igual
que en el intento 18, por lo que no fue posible lanzar los dos agentes en
paralelo del skill; ambos ejes se realizaron como auto-revisión sobre el diff
autoral y el coordinador conserva la revisión definitiva.

### Estándares

- Convenciones del repo: vocabulario del dominio en español
  (`CONTEXT.md`), error canónico `{error:{code,message,fields?}}` con `400`
  entrada inválida / `401` sin sesión / `404` inexistente o ajeno / `409`
  transición imposible (spec «API y concurrencia»), Zod en el límite HTTP y
  reglas dependientes de estado en el caso de uso, filtrado por Cuenta
  autenticada nunca por identificador del cliente, funciones de caso de uso
  sin repositorios genéricos.
- Hallazgos corregidos durante la auto-revisión: (1) middleware de sesión con
  patrón de ruta no se ejecutaba en sub-enrutadores montados de Hono — se
  verificó con reproducción mínima y se sustituyó por `router.use` sin patrón
  (el sub-enrutador solo recibe rutas `/exercises`); (2) duplicación de
  autenticación en 8 handlers — centralizada en el middleware; (3) handlers
  de archivar/restaurar casi idénticos — extraídos a `setAvailability`;
  (4) `findOwnCustomExercise` importado sin uso — eliminado; (5) nombre
  engañoso `categoryId` en el formulario — renombrado a `fieldPrefix`.
- Olores del baseline: sin Mysterious Name restante, sin Duplicated Code
  (la 401 y la transición viven una sola vez), sin Speculative Generality
  (el `recordingMode` aceptado en `PUT` y rechazado si cambia materializa la
  regla de inmutabilidad de forma comprobable), sin Shotgun Surgery (la
  funcionalidad vive en `back/src/exercises/` y `features/exercises/`).

### Espec

- Requisitos del ticket cubiertos uno a uno: crear (identidad opaca, nombre,
  instrucciones, Forma de registro, taxonomía); editar compatibles;
  inmutabilidad de Forma tras publicar/utilizar con corrección vía Ejercicio
  nuevo; archivar/restaurar sin cambiar identidad; listados y selectores
  combinados con procedencia sin flujos separados; referencias existentes que
  siguen resolviendo; 404 para lo ajeno sin inferir datos; respuestas
  canónicas y validaciones/confirmaciones accesibles móvil y escritorio;
  pruebas HTTP integradas con dos Cuentas.
- Sin scope creep: no se añadieron endpoints ni pantallas fuera del ticket;
  no se tocó el ticket 20 (RM registrados).
- Nota de interpretación: no existen todavía Rutinas/Planes/Sesiones que
  «utilicen» Ejercicios (tickets 21+), así que la inmutabilidad de Forma se
  demuestra desde la creación (el PUT la rechaza siempre con `409`) y la
  resolución de referencias se demuestra con `GET :id` sobre archivados y
  retirados del catálogo; el mecanismo quedará intacto cuando los tickets
  futuros añadan referencias.

## Archivos de autor (paths)

```
back/src/exercises/custom-exercises.ts      Nuevo: casos de uso y documento canónico
back/src/exercises/exercises-router.ts      Nuevo: sub-enrutador /api/exercises
back/src/app.ts                             Cablea el sub-enrutador; elimina handlers inline
back/src/exercises/list-exercises.ts        Ítems con available (documento canónico)
back/src/http/api-error.ts                  apiError admite fields
back/test/custom-exercises.test.ts          Nuevo: 20 tests HTTP integrados
front/src/features/exercises/components/ExerciseForm.tsx       Nuevo: formulario crear/editar
front/src/features/exercises/components/ExerciseForm.module.css
front/src/features/exercises/api/exercises-api.ts   create/update/archive/restore/get/archived
front/src/features/exercises/pages/ExercisesPage.tsx       Flujo combinado y gestión
front/src/features/exercises/pages/ExercisesPage.module.css
front/src/features/exercises/pages/ExercisesPage.test.tsx  5 tests de interfaz nuevos
front/src/shared/http/api-client.ts         apiPut
.scratch/gym-training-mvp/orchestration/19/attempt-1.md
```

## Pendiente / observaciones

- El ticket sigue `ready-for-agent` en el tracker: el coordinador conserva la
  revisión definitiva y el cierre del ticket.
- Cuando existan Rutinas/Planes/Sesiones (tickets 21+), el selector podrá
  reutilizar `GET /api/exercises/:id` para resolver referencias no
  disponibles y `GET /api/exercises` excluye ya los archivados de usos
  nuevos.
- La confirmación de archivo no atrapa el foco (mismo patrón que el diálogo
  «Más» del AppShell); si la revisión de accesibilidad pantalla por pantalla
  lo exige, se puede añadir foco inicial con `ref`.
