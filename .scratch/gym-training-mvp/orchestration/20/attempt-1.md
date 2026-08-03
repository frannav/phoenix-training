# Attempt 1 — Ticket 20: Mantener RM registrados

- **Ticket:** `.scratch/gym-training-mvp/issues/20-mantener-rm-registrados.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `fd7d1206633a34ae9d72d0e35ebefd2bf464e918`
- **Branch:** `feature/ticket-20`
- **Commit:** `92e8302` — «Mantener RM registrados (ticket 20)»
- **Outcome:** succeeded

## Qué se construyó

Gestión completa de RM registrados: el Deportista introduce expresamente una
marca real (Ejercicio, carga, repeticiones y fecha), la lista, la edita y la
elimina desde el área de Ejercicios, y la API resuelve la vigencia por
Ejercicio, repeticiones y fecha sin cálculos automáticos de 1RM.

### Backend

- **Tabla `recorded_max`** (migración `0004_stormy_sumo.sql`): pertenece a la
  Cuenta (`account_id` con cascade), referencia al Ejercicio (catálogo o
  personalizado, con cascade) y guarda carga REAL (0–9999,99 con máx. 2
  decimales), repeticiones enteras (1–9999) y fecha de dominio `YYYY-MM-DD`.
  Índice `(account_id, exercise_id, repetitions, date)` para la vigencia y el
  listado.
- **Dominio `back/src/exercises/recorded-max.ts`**: crear (resolviendo el
  Ejercicio con `findExerciseForAccount`, que admite catálogo y personalizados
  propios aunque estén retirados), listar (une el nombre del Ejercicio y ordena
  por fecha descendente), consultar, editar (carga/repeticiones/fecha; el
  Ejercicio es inmutable), eliminar y **vigencia** (el registro más reciente de
  esa fecha o anterior; desempate determinista por `created_at` descendente).
- **Rutas** en `exercises-router.ts` (mismo módulo Ejercicios, auth obligatoria):
  `GET/POST /api/rms`, `GET /api/rms/effective` (antes de `:recordedMaxId`),
  `GET/PUT/DELETE /api/rms/:recordedMaxId`. Validación explícita por campo con
  mensajes en español; `400` entrada inválida, `401` sin sesión, `404` RM
  ajeno/inexistente o Ejercicio ajeno en vigencia, `400` + `fields.exerciseId`
  al registrar un RM para un Ejercicio ajeno/inexistente.

### Frontend

- **`RecordedMaxSection`** en el área de Ejercicios: listado con Ejercicio,
  carga, repeticiones y fecha, estado vacío, formulario de creación/edición y
  confirmación accesible antes de eliminar.
- **`RecordedMaxForm`**: validación explícita por campo (Zod + React Hook Form)
  con mensajes idénticos al servidor; el selector de Ejercicio carga todos los
  disponibles recorriendo el cursor; en edición el Ejercicio queda bloqueado con
  ayuda textual y se conserva aunque ya no esté disponible.
- **API de frontend**: `listRecordedMaxes`, `createRecordedMax`,
  `updateRecordedMax`, `deleteRecordedMax`, `listAllAvailableExercises` y
  `apiDelete` en el cliente HTTP compartido.

## Archivos de autor

```
back/drizzle/0004_stormy_sumo.sql                     migración de recorded_max
back/drizzle/meta/0004_snapshot.json                  snapshot de la migración
back/drizzle/meta/_journal.json                       journal de migraciones
back/src/db/schema.ts                                 tabla recorded_max
back/src/exercises/recorded-max.ts                    dominio de RM registrados
back/src/exercises/exercises-router.ts                rutas /rms (+ /rms/effective)
back/test/recorded-max.test.ts                        pruebas HTTP integradas (30)
front/src/shared/http/api-client.ts                   apiDelete
front/src/features/exercises/api/exercises-api.ts     tipos y funciones de RM
front/src/features/exercises/components/RecordedMaxForm.tsx
front/src/features/exercises/components/RecordedMaxForm.module.css
front/src/features/exercises/components/RecordedMaxSection.tsx
front/src/features/exercises/components/RecordedMaxSection.module.css
front/src/features/exercises/pages/ExercisesPage.tsx  sección RM + invalidación
front/src/features/exercises/pages/ExercisesPage.test.tsx  tests de interfaz (5)
```

## Evidencia TDD (rojo → verde) — rebanadas verticales

Seam del backend: API HTTP completa contra SQLite temporal con las migraciones
reales (`bun run --cwd back test recorded-max.test.ts`). Seam del frontend:
`ExercisesPage` renderizada con el contrato HTTP simulado en el límite de la
funcionalidad (`bun run --cwd front test ExercisesPage.test.tsx`).

### Rebanada 1 — registrar RM (rojo → verde)
Rojo: 8 fallos al no existir las rutas (`404`). Verde: `POST /api/rms` crea el
documento canónico (identidad opaca, `exerciseName` resuelto), valida carga
(negativa, > 9999,99, más de 2 decimales), repeticiones (no entera, 0, > 9999),
fecha (`AAAA-MM-DD` y día real del calendario) y rechaza Ejercicios
ajenos/inexistentes con `fields.exerciseId`. 9/9.

### Rebanada 2 — listar RM (verde directo sobre la rebanada 1)
Lista propios por fecha descendente con nombre de Ejercicio; conserva el nombre
aunque el Ejercicio se archive; lista vacía. 3/3.

### Rebanada 3 — consultar y editar (rojo → verde parcial)
`GET /api/rms/:id` canónico; `PUT` edita carga/repeticiones/fecha con respuesta
canónica, una sola magnitud conserva las demás, `exerciseId` en el cuerpo se
rechaza (strict, 400) y el Ejercicio no cambia, validación + al menos un dato,
inexistente → 404. 7/7.

### Rebanada 4 — eliminar (verde)
`DELETE /api/rms/:id` devuelve el documento canónico, desaparece del listado y
de la consulta; inexistente → 404. 2/2.

### Rebanada 5 — vigencia por Ejercicio, repeticiones y fecha (rojo → verde)
Rojo: un fallo por una expectativa errónea del test (fecha futura debe devolver
el último RM vigente, no null — el test pedía null). Corregida la expectativa.
Verde: el vigente es el más reciente de esa fecha o anterior; antes del primer
RM → `{ rm: null }` (ausencia normal, no error); específico por repeticiones;
dos RM de la misma fecha gana el registrado más tarde; editar la fecha mueve la
ventana de vigencia; funciona con un personalizado archivado; valida parámetros.
7/7.

### Rebanada 6 — aislamiento entre Cuentas (verde)
Otra Cuenta no puede leer/editar/eliminar un RM ajeno (404 idéntico al
inexistente); el listado y la vigencia no exponen RM ajenos (`{ rm: null }`);
no se puede registrar un RM para un personalizado ajeno (400) ni consultar su
vigencia (404). 3/3.

### Frontend (rojo → verde)
Rojo: 5 tests nuevos fallaban (la sección no existía). Verde tras implementar
`RecordedMaxSection` + `RecordedMaxForm`: listado observable (Ejercicio, carga,
repeticiones, fecha), estado vacío, creación con validación explícita en cada
campo y payload verificado (`{ exerciseId, load: 140, repetitions: 5, date }`),
edición prellenada con Ejercicio bloqueado y payload verificado, y eliminación
con diálogo de confirmación (cancelar conserva; confirmar elimina). 18/18 en
`ExercisesPage.test.tsx` (13 previos + 5 nuevos).

## Verificaciones enfocadas y completas

- `bun run --cwd back test recorded-max.test.ts`: **30/30 pass** (368 asserts).
- `bun run --cwd front test ExercisesPage.test.tsx`: **18/18 pass**.
- `bun run typecheck`: 0 errores (back y front).
- `bun run --cwd back test`: **98 pass / 0 fail** (6 archivos, sin regresiones).
- `bun run --cwd front test`: **64 pass** (9 archivos, sin regresiones).
- `bun run --cwd front build`: build de producción correcto.

## Self-review (skill $code-review)

El runtime no expone la herramienta de sub-agentes (`Agent`) que el skill usa
para los dos ejes en paralelo — misma limitación que en los intentos previos.
Ambos ejes se realizaron como auto-revisión sobre el diff autor
(`git diff fd7d120...92e8302`); el coordinador conserva la revisión definitiva.

### Estándares

- Convenciones del repo respetadas: mensajes de error en español con
  vocabulario del dominio, identificadores opacos (`randomBytes` hex), errores
  `{ error: { code, message, fields? } }`, esquemas Zod `.strict()`, respuestas
  canónicas, middleware de auth del módulo Ejercicios, reutilización de
  `findExerciseForAccount` para resolver referencias retiradas, límites de
  carga/repeticiones idénticos a los de Series del spec.
- Sin olores del baseline: sin Mysterious Name, sin Message Chains, sin Middle
  Man, sin Speculative Generality (se retiró un export de tipo sin uso). La
  tupla (Ejercicio, carga, repeticiones, fecha) se agrupa en
  `RecordedMaxInput`/`RecordedMaxFormValues` (no Data Clumps). La lógica de
  vigencia vive en una sola función de caso de uso (no Shotgun Surgery).
- Juicios deliberados: (a) los esquemas de carga/repeticiones/fecha se reflejan
  en back y front — patrón ya establecido por `ExerciseForm` (el servidor es la
  autoridad y el frontend ofrece feedback inmediato con los mismos mensajes);
  (b) `RecordedMaxForm.module.css` replica el CSS de `ExerciseForm.module.css`
  — los CSS Modules son por componente en este repo; extraer un primitivo
  compartido tocaría trabajo previo sin beneficio de comportamiento.
- El mensaje `401` reutilizado del módulo dice «…para consultar los
  Ejercicios» también para `/rms`; coherente con el módulo, aunque
  ligeramente orientado a Ejercicios.

### Espec

Criterios del ticket, punto por punto:

1. «Una Cuenta puede registrar un RM indicando Ejercicio, carga, número de
   repeticiones y fecha» — `POST /api/rms` + formulario. ✓
2. «Listar, editar y eliminar sus RM desde el área de Ejercicios» —
   `GET/PUT/DELETE` + sección «RM registrados» en `/ejercicios`. ✓
3. «Para un Ejercicio y número de repeticiones, el RM vigente en una fecha es
   el registro más reciente de esa fecha o anterior» —
   `GET /api/rms/effective` + 7 pruebas de vigencia. ✓
4. «Los RM pueden referenciar Ejercicios del catálogo o personalizados, incluso
   si después dejan de estar disponibles para usos nuevos» — creación vía
   `findExerciseForAccount` (resuelve retirados) + pruebas con personalizado
   archivado en listado y vigencia. ✓
5. «Registrar una Serie nunca crea ni actualiza automáticamente un RM» — no
   existe lógica que derive RM de Series (aún no hay Sesiones) y la creación
   solo ocurre por `POST /api/rms` expreso. ✓
6. «La aplicación no calcula ni presenta 1RM estimado ni utiliza fórmulas de
   estimación» — ninguna ruta ni cálculo deriva marcas. ✓
7. «Los RM pertenecen a la Cuenta autenticada; otra Cuenta no puede leerlos,
   modificarlos ni inferir su existencia» — 404 idéntico al inexistente,
   listado filtrado, vigencia `{ rm: null }` y 404 para Ejercicio ajeno. ✓
8. «La interfaz muestra Ejercicio, carga, repeticiones y fecha con validación
   explícita y confirmación antes de eliminar» — listado observable, errores
   por campo y diálogo de confirmación accesible. ✓
9. «Las pruebas HTTP integradas cubren vigencia por fecha y repeticiones,
   edición, eliminación y aislamiento usando SQLite migrada» — 30 pruebas
   HTTP sobre SQLite temporal con las migraciones reales. ✓

Sin scope creep: no se añadieron fórmulas, métricas ni endpoints más allá de
los acordados; el `DELETE` responde el documento canónico (200) como las demás
mutaciones del módulo.

## Limitaciones y observaciones

- La carga se persiste como SQLite REAL: suficiente para el MVP porque ningún
  cálculo usa la carga del RM (la futura intensidad relativa es una división en
  lectura) y la validación de dos decimales ocurre en el límite HTTP.
- El Ejercicio de un RM es inmutable en la edición: la marca pertenece al
  Ejercicio para el que se registró; cambiarlo sería crear otra marca. Se
  documenta en el código y en la ayuda del formulario.
- La ausencia de RM vigente responde `{ rm: null }` (200), no 404: es un
  resultado normal de la consulta de vigencia, no un recurso inexistente.
- La vigencia con dos RM de la misma fecha usa `created_at` descendente como
  desempate determinista (editar no reordena el empate); se documenta en el
  dominio.
- El selector de Ejercicio del formulario recorre la paginación por cursor del
  listado (máx. 50 por petición) para ofrecer todos los disponibles.
- Los tests de frontend simulan el contrato HTTP en el límite de la
  funcionalidad sin duplicar las reglas de dominio ya demostradas por la API,
  conforme a las decisiones de testing del spec.
- Pendiente del coordinador: revisión definitiva y cierre del ticket en el
  tracker (sigue `ready-for-agent`).
