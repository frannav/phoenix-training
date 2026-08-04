# Attempt 1 — Ticket 33: Componer el contrato API del dashboard

- **Ticket:** `.scratch/gym-training-mvp/issues/33-componer-contrato-api-dashboard.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `43b4ca065c17d12e9ecffe7ddeb65428e18f42c8`
- **Branch:** `feature/ticket-33`
- **Commit:** `e54a101` — «feat(dashboard): componer GET /api/dashboard con los cinco bloques de Inicio (ticket 33)»
- **Estado:** succeeded (la revisión definitiva la conserva el coordinador)

## Qué se construyó

`GET /api/dashboard` (backend, módulo nuevo `back/src/dashboard/dashboard-router.ts`): la
lectura REST única que compone los cinco bloques de Inicio a partir de los modelos de
lectura de los tickets 30 (`readHomeState`) y 31 (`weeklyVolume`, `recentRecordedMaxes`,
`exerciseEvolution`), sin reinterpretar sus reglas:

1. **`training`** — bloque «entrenamiento actual»: la acción prioritaria `HomeAction`
   (`continuar` con `sessionId`, nombre y progreso por Series; `iniciar-plan` con `planId`
   y `trainingId` del próximo Entrenamiento pendiente; `iniciar-libre`), tal como la lee
   `readHomeState`.
2. **`activePlan`** — bloque «Plan activo»: el resumen `ActivePlanSummary` (nombre, semana
   actual, progreso por semana y completo con avance/cumplimiento) o `null` como ausencia
   explícita.
3. **`weeklyVolume`** — bloque «volumen semanal»: totales actual y anterior, comparación
   porcentual (nula sin volumen previo) y las barras de las seis semanas en `kg·rep`.
4. **`recentRecordedMaxes`** — bloque «RM recientes»: hasta tres marcas expresas como
   documento canónico, vacío cuando no hay registros.
5. **`evolution`** — bloque «Evolución»: `options` (el selector: Ejercicios con Series
   completadas en Sesiones finalizadas, ordenados del más reciente al más antiguo por su
   última aparición, con la métrica propia de su Forma de registro) y `current` (la serie
   temporal del Ejercicio pedido por `?exerciseId=` o, en su defecto, el más reciente) o
   `null` como ausencia explícita.

El modelo de selector nuevo (`evolutionOptions` en `back/src/dashboard/analytics.ts`)
reutiliza las reglas del ticket 31: solo Series completadas de Sesiones finalizadas de la
Cuenta autenticada, la misma asignación `metricByMode` (cardio continuo conserva su opción
con métrica nula para que el cliente informe de que no dispone de analítica) y el mismo
filtrado por Cuenta. La ruta exige una Cuenta autenticada (el middleware obtiene la sesión
del sistema de autenticación, nunca del cliente; Better Auth solo emite sesión a correos
verificados) y filtra por la Cuenta autenticada: los datos de otra Cuenta se comportan como
inexistentes. La consulta `?exerciseId=` se valida con Zod `.strict()` y los parámetros
desconocidos responden `400 VALIDATION_ERROR`. Los cinco bloques se leen al momento sobre
el estado vigente, sin cachés ni tablas derivadas (spec «Métricas»).

## Evidencia TDD por seam (rojo → verde)

Seam aprobado y reutilizado: **API HTTP integrada contra SQLite temporal con las
migraciones de producción** (`back/test/dashboard-api.test.ts`, nuevo). Todo el estado se
prepara por la API —registro y verificación, Ejercicios personalizados, Rutinas, Planes con
activación, Sesiones finalizadas con corrección de Fecha realizada, RM registrados— y la
lectura se comprueba sobre la misma base llamando a `GET /api/dashboard` con la cookie de
sesión. Rojo inicial: la ruta no existía y las 12 pruebas fallaban con 404. Verde: la
implementación las pasó sin cambiar ninguna expectativa (un fallo intermedio fue del propio
esquema de consulta, `exerciseId` sin `.optional()`, corregido en la ruta).

Las 12 pruebas cubren los seis criterios del ticket:

1. **Composición completa y forma estable** — «una sola lectura compone los cinco bloques
   con la forma estable»: escenario completo (Plan activo de dos semanas, cuatro Sesiones
   finalizadas de fuerza/repeticiones/cardio, RM registrado) y aserción `toEqual` del cuerpo
   entero: `training` `iniciar-plan` con las referencias opacas, `activePlan` con semana
   actual 1 y progresos, `weeklyVolume` con las seis barras exactas y comparación 100 %,
   `recentRecordedMaxes` con el documento canónico y `evolution` con `options` ordenadas y
   `current` del Ejercicio más reciente (dos puntos con `intensidadRelativaMax` 41.7 y 83.3
   frente al RM vigente).
2. **Prioridades de acción** — «una Sesión activa tiene prioridad sobre los Entrenamientos
   pendientes»: `continuar` con el nombre de la Rutina de la referencia viva y el progreso
   por Series, que avanza al completar una Serie. Las otras dos prioridades quedan fijadas
   por la composición completa (`iniciar-plan`) y el estado vacío (`iniciar-libre`).
3. **Autenticación y verificación** — «sin sesión la ruta responde 401 UNAUTHORIZED» y
   «una Cuenta sin verificar no alcanza la ruta»: la entrada de una Cuenta pendiente
   responde `EMAIL_NOT_VERIFIED` (Better Auth) y la ruta queda fuera de su alcance.
4. **Referencias opacas** — fijadas por la forma estable: `sessionId` (continuar),
   `planId`/`trainingId` (iniciar), `activePlan.id` (abrir el Plan) y
   `evolution.options[].id` + `?exerciseId=` (elegir un Ejercicio).
5. **Estados vacíos como ausencia explícita** — «sin Plan, sin Sesiones ni analítica»:
   `training` `iniciar-libre`, `activePlan` `null`, `recentRecordedMaxes` `[]`,
   `evolution` `{ options: [], current: null }` y `changePercent` nulo sin volumen previo.
   «Una consulta con parámetros desconocidos se rechaza»: 400 `VALIDATION_ERROR`.
6. **Correcciones recientes** — «corregir la Fecha realizada mueve el volumen y el punto
   de evolución entre semanas» (1000 → semana anterior y `changePercent` −100) y «corregir
   un resultado y eliminar la Sesión cambia la siguiente lectura» (volumen 1000 → 600,
   punto de evolución 100 → 120 y, al eliminar, todo vuelve a ausencia y el Ejercicio deja
   de ser opción del selector).
7. **Aislamiento** — «los datos de otra Cuenta se comportan como inexistentes»: la Cuenta B
   recibe el estado vacío pese a que la Cuenta A tiene el escenario completo.
8. **Selector de evolución** — sin `exerciseId` se muestra el más reciente; con
   `exerciseId` el elegido; un Ejercicio ajeno o inexistente se comporta como ausente
   (`current` `null` conservando las opciones propias); cardio continuo aparece como opción
   con métrica nula y sin puntos.

## Comprobaciones

- `bun run --filter @phoenix-training/back typecheck`: **0 errores.**
- `bun run --filter @phoenix-training/front typecheck`: **0 errores.**
- `bun test ./test/dashboard-api.test.ts` (back): **12 pass / 0 fail** (rojo inicial 404 → verde).
- Suite completa del backend (señal; la validación definitiva la conserva el coordinador):
  `bun test` en `back/` → **323 pass / 0 fail** (311 previas + 12 nuevas).
- Suite completa del frontend (señal): `bunx vitest run` → **135 pass / 0 fail** (sin
  cambios de frontend).

## Autorevisión (dos ejes; el coordinador conserva la revisión definitiva)

El skill `code-review` lanza dos subagentes `general-purpose` en paralelo; este runtime de
trabajador no expone la herramienta `Agent`, así que se hizo una autorevisión manual de dos
ejes. Limitación reportada: sin subagentes paralelos no hay aislamiento de contexto entre
ejes.

### Eje estándar

Sigue las convenciones documentadas del repositorio (spec «Arquitectura del backend» y
«API y concurrencia»): Zod `.strict()` en el límite HTTP (consulta), reglas dependientes de
estado en los casos de uso/modelos de lectura (la ruta solo compone, no reinterpreta),
Drizzle como única capa de acceso, filtrado por la Cuenta autenticada sin identificadores
del cliente, error canónico `{ error: { code, message } }` (401 `UNAUTHORIZED`, 400
`VALIDATION_ERROR`), métricas calculadas al leer sin cachés, y vocabulario del dominio en
español. Se reutilizaron los patrones del módulo existente: middleware de autenticación por
prefijo, inyección de dependencias del router (`authenticatedUserId`, `now`) y composición
de lecturas con `Promise.all` para las consultas independientes. El modelo nuevo
`evolutionOptions` vive en `analytics.ts` junto a la familia de evolución (reutiliza
`metricByMode`, que sigue siendo privada y no se duplica). Sin olores nuevos del baseline:
los nombres son autoexplicativos, no hay duplicación (el mapeo de métricas se reutiliza),
ni abstracción especulativa. Juicio aceptado: un Ejercicio propio sin Series completadas
solicitado explícitamente por `?exerciseId=` devuelve `current` con `points: []` (forma del
modelo del ticket 31, compuesta sin reinterpretación); la ausencia total se expresa como
`current: null` cuando no hay opciones o el Ejercicio es ajeno o inexistente.

### Eje especificación

Los seis criterios del ticket se cubren y prueban: la lectura única compone los cinco
bloques (prueba de forma estable); la composición usa directamente los modelos de 30 y 31
sin recalcular sus reglas (valores literales de avance/cumplimiento, seis barras exactas,
puntos de evolución con RPE e intensidad relativa); la ruta exige una Cuenta verificada y
aisla por Cuenta (pruebas 3 y 7); el contrato conserva las referencias opacas para
continuar, iniciar, abrir el Plan y elegir un Ejercicio (forma estable y selector); los
estados sin Plan, sin Sesiones o sin analítica son ausencia explícita (`null`/`[]`, nunca
gráficas vacías); y las pruebas HTTP cubren composición, prioridades, vacíos, correcciones,
aislamiento y forma estable. Sin alcance excedido: no se tocó el frontend, no se registró
ninguna otra ruta, no se cambiaron los modelos de 30/31 y no se añadió ningún seam nuevo.

## Lo que queda

- La revisión definitiva del coordinador (ejes estándar y especificación) y el cierre del
  ticket en el rastreador; el ticket 34 integra la interfaz consumiendo este contrato.
- El coordinador puede consultar el contrato en el commit (ramas `feature/ticket-33`) y
  validar de forma independiente el árbol de trabajo.
