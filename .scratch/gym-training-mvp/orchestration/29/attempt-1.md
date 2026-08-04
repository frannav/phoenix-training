# Attempt 1 — Ticket 29: Consultar y corregir el Historial

- **Ticket:** `.scratch/gym-training-mvp/issues/29-consultar-corregir-historial.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `06dbb630c50d795fdb986d3b01ed8831ff519f25`
- **Branch:** `main`
- **Commit:** `7d46dc1` — «feat(sesiones): Historial con corrección y eliminación de Sesiones finalizadas (ticket 29)»
- **Estado:** succeeded (la revisión definitiva la conserva el coordinador)

## Qué se construyó

El contrato del Historial completo en la API, según el seam público aprobado
(`back/test/sessions.test.ts`), sin tocar el frontend:

1. **`GET /api/sessions` — listado del Historial.** Solo Sesiones finalizadas
   de la Cuenta, ordenadas de la Fecha realizada más reciente a la más antigua
   (empate por inicio e identificador para un desplazamiento estable), con
   cursor opaco cifrado, `limit` máximo 50 (por defecto 20) y filtros
   explícitos: `origin` (`libre | rutina | plan`) y rango de Fecha realizada
   (`from`/`to`, fechas de dominio válidas). Respuesta
   `{ items: SessionHistoryItem[], nextCursor }` donde cada item resume
   Origen, Fechas y recuentos (apariciones, Series completadas y omitidas) sin
   abrir el detalle; el detalle sigue en `GET /api/sessions/:id` con el
   documento canónico completo (Origen, Fecha prevista, Fecha realizada,
   objetivos, resultados, RPE y procedencia `added` de apariciones y Series).
2. **`PUT /api/sessions/:id` — corrección.** Acepta `datePerformed` (fecha de
   dominio real) y aplica las invariantes del Historial solo cuando la Sesión
   está finalizada: ninguna Serie pendiente y al menos una Serie completada.
   La sustitución del agregado completo ya era transaccional, respetaba la
   revisión (CAS) y devolvía el documento canónico; la Fecha prevista nunca se
   mueve al corregir la Fecha realizada. Las reglas preexistentes —una Serie
   prevista nunca se elimina individualmente (se omite), una Serie añadida sí
   puede eliminarse— se verifican también para Sesiones finalizadas.
3. **`DELETE /api/sessions/:id` — eliminación.** `deleteActiveSession` pasa a
   `deleteSession`: elimina Sesiones activas (comportamiento previo intacto) y
   finalizadas. Al eliminar una Sesión finalizada vinculada a un Entrenamiento
   planificado, el día vuelve a `pendiente` solo si estaba `realizado` (guarda
   que no toca días omitidos ni Entrenamientos que cambiaron). En un Plan
   activo el día puede iniciar otra Sesión; en un Plan completado el estado se
   conserva y el inicio queda bloqueado por el estado del Plan
   (`TRANSITION_IMPOSSIBLE`). Las Sesiones libres o iniciadas desde una Rutina
   no alteran ningún Plan.

## Cambios de comportamiento sobre trabajo preexistente

- El test «una Sesión ya finalizada no puede eliminarse por este canal» (que
  esperaba `409 SESSION_NOT_ACTIVE` en DELETE) codificaba la regla que este
  ticket elimina expresamente. Se sustituyó por «una Sesión finalizada puede
  eliminarse por este canal: el Historial corrige y elimina registros (ticket
  29)». Nada más del contrato previo cambió: la corrección de la Fecha
  realizada y la extensión de DELETE son aditivas y no rompen los 62 tests
  previos.

## Evidencia TDD por seam (rojo → verde)

Seam aprobado único: **API HTTP integrada contra SQLite temporal con las
migraciones de producción** (`back/test/sessions.test.ts`). No se añadió
ningún seam nuevo; no hace falta preguntar al coordinador porque solo se
extendió el archivo aprobado.

### Slice 1 — Corrección de Sesiones finalizadas (rojo → verde)

11 tests escritos primero; 10 rojos (el de intercambio completada/omitida ya
pasaba por construcción: la transición de estados era comportamiento previo y
queda como guarda de regresión):

- corrección edita objetivos, resultados, RPE y Fecha realizada y devuelve la
  representación canónica (revisión +1). **Rojo:** `datePerformed` rechazado
  por el esquema `.strict()` → verde al añadir `datePerformed` al PUT.
- corregir la Fecha realizada no mueve la Fecha prevista del Entrenamiento de
  origen. **Rojo:** 400 por el mismo esquema → verde.
- cambiar una Serie entre completada y omitida conservando los objetivos.
- añadir una Serie con resultado completo (queda `added: true`).
- Sesión finalizada rechaza Series pendientes (400 con
  `exercises[0].series[0].status`). **Rojo:** faltaba la invariante → verde al
  añadir el chequeo por Serie.
- no puede quedar sin al menos una Serie completada (400 con `exercises`).
  **Rojo:** faltaba la invariante → verde al añadir el chequeo posterior.
- Serie prevista no puede eliminarse de una Sesión finalizada (400 con el
  mensaje «Las Series previstas no pueden eliminarse»).
- Serie añadida sí puede eliminarse de una Sesión finalizada.
- revisión obsoleta → 409 sin mezclar cambios, la versión vigente se conserva
  y con la revisión correcta la corrección se aplica.
- Fecha realizada inválida (2025-02-30) → 400.
- corregir una Sesión finalizada ajena → 404 (aislamiento entre Cuentas).

### Slice 2 — Historial (rojo → verde)

7 tests escritos primero; 7 rojos (el endpoint no existía; 404 → después 400
por el esquema al arrancar):

- lista solo Sesiones finalizadas, de más reciente a más antigua, y el detalle
  conserva objetivos, resultados, RPE y procedencia.
- aplica un límite y pagina con el cursor opaco sin repetir ni perder
  Sesiones. **Rojo inicial:** 400 en todo el listado por `origin` sin
  `.optional()` en el esquema → verde al corregirlo; luego rojo de verdad al
  faltar el endpoint.
- filtra por origen y por rango de Fecha realizada (`from`/`to`).
- Historial vacío devuelve `{ items: [], nextCursor: null }`.
- cursor manipulado, límite > 50 y filtros inválidos responden 400.
- el Historial de otra Cuenta se comporta como inexistente.

### Slice 3 — Eliminación de Sesiones finalizadas (rojo → verde)

5 tests escritos primero; 5 rojos (`not-active` bloqueaba):

- Sesión finalizada de un Plan activo → el Entrenamiento vuelve a `pendiente`,
  el Plan sigue activo, el día inicia otra Sesión y el registro sale del
  Historial. **Rojo:** 409 SESSION_NOT_ACTIVE → verde al generalizar
  `deleteSession`.
- Sesión finalizada de un Plan completado → el Plan conserva `completado`, el
  día vuelve a `pendiente` y no inicia otra Sesión (`409
  TRANSITION_IMPOSSIBLE`).
- Sesiones finalizadas libres o de Rutina → ningún Plan se altera.
- revisión obsoleta → 409 y la Sesión finalizada se conserva; con la revisión
  vigente elimina.
- eliminar una Sesión finalizada ajena → 404.

## Comprobaciones

- `bun run typecheck` (raíz, back + front): **0 errores.**
- `bun test ./test/sessions.test.ts`: **85 pass / 0 fail** (62 previos + 23
  nuevos).
- Suite completa del backend (señal, la validación definitiva la conserva el
  coordinador): `bun test` en `back/` → **257 pass / 0 fail**.

## Autorevisión (dos ejes; el coordinador conserva la revisión definitiva)

El skill `code-review` lanza dos subagentes `general-purpose` en paralelo;
este runtime de trabajador no expone la herramienta `Agent`, así que se hizo
una autorevisión manual de dos ejes. Limitación reportada: sin subagentes
paralelos no hay aislamiento de contexto entre ejes.

### Ejes estándar

Sigue las convenciones documentadas del repositorio (spec «Arquitectura del
backend» y «API y concurrencia»): Zod en el límite HTTP, reglas dependientes
de estado en el caso de uso, transacciones por escritura, filtrado por Cuenta
en toda consulta, error canónico `{ error: { code, message, fields? } }`,
patrón de cursor opaco idéntico al de Ejercicios (limit+1, `nextCursor`,
decode que rechaza manipulación con 400), vocabulario del dominio en español.
La duplicación del patrón de paginación entre routers es deliberada y
preexistente (el repo evita capas genéricas). Sin olores nuevos relevantes del
baseline: `SessionHistoryFilters` agrupa el clúster de filtros; no hay
abstracción especulativa (los tres filtros están pedidos en la spec).

### Ejes especificación

Las diez rúbricas del ticket se cubren y prueban en el seam HTTP: listado con
cursor/límite/filtros y detalle; conservación del detalle; correcciones
válidas e inválidas; reglas de Series previstas/añadidas; invariantes de
Sesión finalizada; sustitución transaccional con revisión y representación
canónica; eliminación con efectos sobre Planes activos y completados;
independencia de Fechas y de Sesiones libres/de Rutina; conflicto que no
mezcla y aislamiento entre Cuentas. No hay expansión de alcance: ningún
endpoint ni campo nuevo fuera de los pedidos.

## Lo que queda

- **Confirmaciones de interfaz** (eliminar Sesión, eliminar Serie añadida con
  resultado, cambiar completada→omitida) son responsabilidad del frontend y no
  se prueban en la API; el frontend del Historial sigue siendo el placeholder
  preexistente (`HistoryPage`/`HistoryDetailPage`), que corresponderá a un
  ticket de interfaz con su seam aprobado. El contrato HTTP ya lo soporta
  (la corrección envía el agregado completo con `datePerformed`).
- La revisión definitiva del coordinador (ejes estándar y especificación).
