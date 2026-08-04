# Attempt 2 — Ticket 29: Consultar y corregir el Historial

- **Ticket:** `.scratch/gym-training-mvp/issues/29-consultar-corregir-historial.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `06dbb630c50d795fdb986d3b01ed8831ff519f25`
- **Branch:** `main` (sobre el intento 1: `7d46dc1` + `d218d95`)
- **Commit:** `04d4ed62178f3e6ee5b159e9b13914eb367764ad` — «fix(sesiones): conflicto que carga la versión vigente y Fecha realizada solo en Historial (ticket 29)»
- **Estado:** succeeded (la revisión definitiva la conserva el coordinador)

## Resolución de los hallazgos bloqueantes

Revisión previa del coordinador sobre el intento 1; dos hallazgos, ambos en el
eje especificación, sin comandos de validación fallidos.

### Hallazgo 1 — El conflicto carga la versión vigente sin fusionar cambios (ticket línea 17)

**Evidencia:** PUT y DELETE respondían `409` solo con `{ error: { code:
"REVISION_CONFLICT", message } }`; la versión canónica vigente no se cargaba ni
se incluía en la respuesta del conflicto, aunque la spec exige «Un `409`
detiene las mutaciones, carga la versión actual e informa del conflicto; no se
mezclan cambios» (spec «API y concurrencia») y el ticket: «Un conflicto carga
la versión vigente sin fusionar cambios».

**Corrección (comportamiento HTTP mínimo dentro de alcance):**

- `back/src/sessions/sessions.ts`: los resultados `revision-conflict` de
  `replaceSession` y `deleteSession` llevan ahora la representación canónica
  (`session?: SessionDocument`). La transacción no escribió nada en el
  conflicto; la versión vigente se lee con `loadSessionAggregate` al salir de
  ella (mismo patrón de lectura que el resto del módulo). Si la Sesión
  desaparece en la ventana de lectura (carrera de borrado concurrente) la
  respuesta conserva el `409` genérico sin `session`, comportamiento previo.
- `back/src/sessions/sessions-router.ts`: `PUT /api/sessions/:id` y
  `DELETE /api/sessions/:id` incluyen `error.session` (documento canónico con
  revisión vigente) en el `409 REVISION_CONFLICT`, siguiendo el precedente de
  `error.sessionId` de `ACTIVE_SESSION_EXISTS`. El payload obsoleto nunca se
  aplica: el CAS de la cabecera ya abandonaba la sustitución antes de tocar
  los hijos.

**Cobertura de regresión (seam HTTP, `back/test/sessions.test.ts`):**

- Corrección finalizada con revisión obsoleta: el `409` expone
  `error.session` con el id, revisión, Fecha realizada y Series vigentes; la
  corrección obsoleta (fecha `2025-03-08`) no se aplica.
- Eliminación finalizada con revisión obsoleta: el `409` expone
  `error.session` finalizado con la revisión vigente; nada se elimina.
- Sustitución y eliminación de Sesión activa con revisión obsoleta: el `409`
  expone `error.session` con la revisión vigente.

### Hallazgo 2 — `datePerformed` se admitía y persistía en Sesiones activas

**Evidencia:** el PUT de corrección aceptaba `datePerformed` para cualquier
Sesión, aunque el ticket 29 limita la corrección de la Fecha realizada a las
Sesiones finalizadas del Historial.

**Corrección (guarda mínima):** en `replaceSession`, la sustitución de una
Sesión activa que envíe `datePerformed` responde `400 VALIDATION_ERROR` con
`fields.datePerformed` («La Fecha realizada solo puede corregirse en Sesiones
finalizadas.») sin persistir nada. La corrección de Sesiones finalizadas sigue
admitiendo la Fecha realizada (tests previos 2739/2779 intactos). La guarda es
dependiente de estado y vive en el caso de uso, como exige la spec
(Zod valida forma en el límite HTTP; las reglas de estado en el caso de uso).

**Cobertura de regresión:** test nuevo «una Sesión activa no admite la
corrección de la Fecha realizada: solo el Historial la corrige (ticket 29)» —
rechazo 400 con campo, Fecha realizada y revisión intactas, y sustitución
activa sin `datePerformed` que sigue funcionando (200).

## Evidencia TDD por slice (rojo → verde)

Seam único aprobado: **API HTTP integrada contra SQLite temporal con las
migraciones de producción** (`back/test/sessions.test.ts`). No se añadió
ningún seam nuevo; no hizo falta preguntar al coordinador.

### Slice 1 — Conflicto que carga la versión vigente (rojo → verde)

4 tests extendidos primero con las aserciones nuevas (4 rojos: `error.session`
era `undefined` en el `409`):

- `conflicto recuperable entre escrituras > una revisión obsoleta devuelve 409
  sin duplicar Ejercicios y permite reintentar` → verde al adjuntar la
  representación canónica al conflicto del PUT de Sesión activa.
- `eliminar una Sesión activa > una revisión obsoleta responde 409 y conserva
  la Sesión` → verde para el DELETE de Sesión activa.
- `corregir una Sesión finalizada > una revisión obsoleta responde 409 sin
  mezclar cambios y la versión vigente se conserva` → verde: el conflicto
  expone la versión canónica y la corrección obsoleta no se aplica.
- `eliminar una Sesión finalizada > una revisión obsoleta responde 409 y
  conserva la Sesión finalizada` → verde para el DELETE del Historial.

### Slice 2 — Fecha realizada solo en el Historial (rojo → verde)

1 test nuevo primero (rojo: el PUT de Sesión activa con `datePerformed`
respondía 200):

- `una Sesión activa no admite la corrección de la Fecha realizada: solo el
  Historial la corrige (ticket 29)` → verde al añadir la guarda en
  `replaceSession`.

## Comprobaciones

- `bunx tsc --noEmit` en `back/`: **0 errores** (incluye `src` y `test`).
- `bun run typecheck` (raíz, back + front): **0 errores**.
- `bun test back/test/sessions.test.ts`: **86 pass / 0 fail** (85 previos + 1
  nuevo; los 4 tests de conflicto se extendieron sin añadir casos).
- Suite completa del backend (señal; la validación definitiva la conserva el
  coordinador): `bun test` en `back/` → **258 pass / 0 fail** (257 previos + 1
  nuevo).

## Autorevisión (dos ejes; el coordinador conserva la revisión definitiva)

El skill `code-review` lanza dos subagentes `general-purpose` en paralelo;
este runtime de trabajador no expone la herramienta `Agent`, así que se hizo
una autorevisión manual de dos ejes. Limitación reportada: sin subagentes
paralelos no hay aislamiento de contexto entre ejes (misma limitación que el
intento 1).

### Ejes estándar

Sigue las convenciones documentadas (spec «Arquitectura del backend» y «API y
concurrencia»): reglas dependientes de estado en el caso de uso, transacciones
por escritura, filtrado por Cuenta en toda consulta, error canónico
`{ error: { code, message, fields? } }` con el contexto extra del conflicto
(`error.session`) incrustado igual que `error.sessionId` en
`ACTIVE_SESSION_EXISTS`. Sin olores nuevos: la duplicación del bloque
`revision-conflict` entre PUT y DELETE es mínima y consistente con el patrón
preexistente del router (mismo `case` en finalize); la guarda de `datePerformed`
no introduce abstracción especulativa. El cast `outcome as ReplaceSessionOutcome`
documenta por qué el CFA no observa el cierre de la transacción.

### Ejes especificación

Ambos hallazgos quedan resueltos en el seam HTTP con su cobertura de
regresión, sin ampliar el alcance del ticket: ningún endpoint, campo del
documento canónico ni transición nuevos; solo el payload del conflicto y la
guarda de Fecha realizada. La rúbrica del ticket «Un conflicto carga la versión
vigente sin fusionar cambios» queda demostrada de extremo a extremo (409 con
representación canónica + payload obsoleto sin aplicar), y la corrección de
Fecha realizada queda confinada al Historial.

## Archivos tocados por esta reparación

- `back/src/sessions/sessions.ts` — resultados de conflicto con representación
  canónica; guarda de Fecha realizada para Sesiones activas.
- `back/src/sessions/sessions-router.ts` — `error.session` en los `409`
  de PUT y DELETE.
- `back/test/sessions.test.ts` — 4 tests de conflicto extendidos + 1 test
  nuevo de la guarda de Fecha realizada.
- `.scratch/gym-training-mvp/orchestration/29/attempt-2.md` — este reporte.

## Lo que queda

- Confirmaciones de interfaz y frontend del Historial: siguen siendo de un
  ticket de interfaz con su seam aprobado (contrato HTTP ya soporta el
  conflicto con la versión vigente: `error.session`).
- La revisión definitiva del coordinador (ejes estándar y especificación) y la
  suite completa del repositorio.
