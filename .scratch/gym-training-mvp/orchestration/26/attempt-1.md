# Attempt 1 — Ticket 26: Registrar resultados por Serie

- **Ticket:** `.scratch/gym-training-mvp/issues/26-registrar-resultados-serie.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `27344b565ce98533f2609d8145f2a7ff9e6dea3e`
- **Branch:** `feature/ticket-26`
- **Commit:** `bf2efef`
- **Outcome:** succeeded

## Qué se construyó

El registro inmediato y válido de Objetivos, Resultados y RPE por Serie dentro
de la Sesión activa, para las cuatro Formas de registro, con estados exactos,
validación atómica sin corrección silenciosa y sustitución del agregado con
revisión optimista.

**Backend** (extiende el sub-enrutador `back/src/sessions/`):

- Tabla nueva `training_session_series` (migración `0007_rare_tenebrous.sql`):
  Serie como hijo de la aparición con estado (`pendiente`/`completada`/`omitida`),
  posición, objetivos (`goal_*`), resultado (`carga`, `repeticiones`, `duracion`),
  RPE, y `added` para distinguir la Serie añadida (eliminable) de la prevista
  conservada de la intención original.
- `PUT /api/sessions/:id` acepta `series` por aparición y sustituye el agregado
  completo en una **transacción síncrona y atómica** (mismo patrón reparado en
  el ticket 21): valida primero el agregado entero y solo después escribe, de
  modo que una entrada inválida nunca persiste ni incrementa la revisión. La
  cabecera usa CAS de revisión; los hijos existentes conservan su identidad y
  su `createdAt`, y las Series nuevas reciben identidad opaca con `added=true`.
- Reglas de dominio en el caso de uso (Zod valida solo forma y tipos):
  - Estado exacto: completada exige atómicamente todos los valores de su Forma
    y puede tener RPE; pendiente u omitida no admite resultado ni RPE.
  - Formas: fuerza con carga exige carga y repeticiones; repeticiones sin carga
    exige repeticiones; tiempo por serie y cardio continuo exigen duración.
  - Límites sin redondear ni corregir: carga `0–9999,99` con dos decimales,
    repeticiones enteras `1–9999`, duración entera `1–359999` s, RPE `1–10` en
    pasos de `0,5`; objetivos opcionales e independientes con los mismos límites
    y solo los campos de su Forma.
  - Cardio continuo: exactamente una Serie por aparición; un segundo esfuerzo
    se registra añadiendo de nuevo el Ejercicio (nueva aparición).
  - Los identificadores de Serie inexistentes, repetidos o de otra aparición
    responden `400` como hijo desconocido; una revisión obsoleta responde `409`
    sin duplicar Series.
- Errores con rutas de hijo legibles (`exercises[0].series[1].carga`) mediante
  `sessionFieldKey`, en el límite HTTP y en el caso de uso.

**Frontend** (funcionalidad `features/sessions`):

- Contrato API extendido (`sessions-api.ts`): `SessionSeriesDocument`,
  `SeriesInput`, recuentos `countSeriesByStatus` y progreso por aparición.
- `series-draft.ts` (módulo puro): borrador de Serie con los Objetivos
  inicializando los campos de resultado, validación inmediata por Forma y
  límites (el servidor sigue siendo la autoridad).
- `SeriesRow` (componente compacto): número de Serie, estado con icono + texto
  + estilo (○ Pendiente, ✓ Completada, ⊘ Omitida), campos propios de la Forma,
  RPE opcional, errores junto al campo afectado y acciones Completar / Omitir /
  Restaurar. Las filas completadas muestran el resultado en texto (`80 kg × 10
  rep · RPE 8,5`).
- `ActiveSessionPage`: resumen de Series de la Sesión, progreso por Ejercicio
  en el acordeón, registro por fila, «Añadir serie» dentro del Ejercicio
  desplegado (sin copia de borrador ni eliminación: ticket 27), selector que
  añade cardio continuo con su única Serie pendiente, estados de guardado con
  reintento (Guardando / Guardado / Error al guardar) y conflicto `409` que
  carga la versión vigente, descarta borradores y no fusiona ni duplica.

## Evidencia TDD por seam (rojo → verde)

### Seam 1 — API HTTP integrada contra SQLite temporal (back) — rojo → verde

13 tests nuevos en `back/test/sessions.test.ts` escritos primero: todos rojos
(`400` porque `series` era una clave desconocida del PUT estricto). Verde con
la tabla + migración, `sessions.ts` (validación y transacción síncrona) y
`sessions-router.ts` (esquemas y errores por ruta). El contrato del PUT exigió
`series` en las llamadas previas del ticket 25 (cambio esperado: el reporte de
ese ticket anunciaba «las Series llegarán como hijos de la aparición»).

Cobertura: identidad y estado de la Serie; fuerza con carga (carga +
repeticiones, RPE opcional); entrada parcial que no completa ni persiste;
repeticiones sin carga; tiempo por serie y cardio continuo (duración); límites
tabla (`-1`, `10000`, tres decimales, `0`/`10000` repeticiones, `0`/`360000`
duración, RPE `0,5`/`7,3`/`10,5` rechazados y `1`/`5,5`/`10` aceptados);
magnitud ajena a la Forma; objetivos que inicializan sin completar y con sus
límites; omitir/restaurar conservando objetivos; cardio con exactamente una
Serie y segundo esfuerzo como nueva aparición; repetición de escritura con
revisión anterior (`409` sin duplicar y reintento); Serie inexistente, repetida
o de otra aparición como hijo desconocido.

### Seam 2 — Interfaz observable (front) — rojo → verde

10 tests nuevos en `ActiveSessionPage.test.tsx` (Vitest + Testing Library
simulando el contrato HTTP) + 2 fixtures de otros archivos actualizados. La
primera pasada roja reveló tres correcciones en verde: (1) el acordeón comienza
plegado en los fixtures y los tests lo despliegan con un toque (el `lastExerciseId`
nulo evitaba colapsos tras guardar); (2) la etiqueta del RPE se consulta con su
texto completo «RPE (1-10)»; (3) tras cada guardado se conserva el Ejercicio
desplegado mientras siga en la Sesión (antes se recalculaba desde el último
utilizado y cerraba el registro en curso).

Cobertura: objetivos que inicializan los campos; completar con payload canónico
exacto y estados Guardado / Completada; entrada parcial con error junto al
campo y sin PUT; repeticiones sin carga y tiempo por serie con un solo campo;
cardio continuo con una única Serie y sin «Añadir serie»; omitir/restaurar con
payloads y objetivos de vuelta; RPE fuera de pasos señalado sin guardar;
«Añadir serie» crea una Serie pendiente nueva; añadir cardio desde el selector
crea su única Serie; conflicto entre pestañas que carga la versión vigente sin
duplicar Series.

## Verificaciones enfocadas

- `bun run typecheck`: 0 errores (back y front).
- `bun run --cwd back test -- test/sessions.test.ts`: **26/26 pass** (359
  asserts; 13 previos + 13 nuevos).
- `bun run --cwd back test`: **143 pass / 0 fail** (2201 asserts, 8 archivos).
- `bun run --cwd front test`: **90 pass** (13 archivos; 75 previos + 15 nuevos).
- `bun run --cwd front test -- src/features/sessions/pages/ActiveSessionPage.test.tsx`:
  **15/15 pass**.
- `bun run build`: build de producción correcto.
- No se reclamó el resultado de la suite completa del coordinador: la suite
  raíz (`bun run test`) es propiedad del coordinador.

## Self-review (skill `$code-review`)

El runtime de Pi no expone la herramienta de sub-agentes (`Agent`) que el skill
`$code-review` usa para lanzar los dos ejes en paralelo — misma limitación que
en los intentos previos. Ambos ejes se realizaron como auto-revisión sobre el
diff autoral; el coordinador conserva la revisión definitiva.

### Estándares

- Vocabulario del dominio en español (`CONTEXT.md`): Serie, Serie prevista /
  añadida, Objetivo de serie, Resultado de serie, RPE de serie, Forma de
  registro, Sesión activa, Ejercicio, Deportista, Cuenta.
- Error canónico `{error:{code,message,fields?}}`; `400` entrada inválida con
  rutas de hijo, `401` sin sesión, `404` inexistente o ajeno, `409` revisión
  obsoleta. Zod valida en el límite HTTP; las reglas dependientes de estado
  viven en el caso de uso; cada escritura usa una transacción síncrona con CAS
  de revisión; toda consulta y mutación filtra por la Cuenta autenticada.
- Documento canónico con revisión entera, Series resueltas y una sola lectura
  por agregado, sin consultas adicionales por fila.
- Hallazgos corregidos durante la auto-revisión: (1) `createdAt` de las Series
  existentes se reiniciaba en cada sustitución — ahora se conserva como en las
  apariciones; (2) el resumen de Series y el progreso por Ejercicio duplicaban
  el recuento por estado — extraído a `countSeriesByStatus` compartido; (3) la
  clase `detailsNote` quedó sin definir en el CSS tras reorganizar el detalle
  del Ejercicio — restaurada.
- Duplicación pequeña y documentada (patrón del repositorio, sin capas
  genéricas): los límites de dominio y el generador de claves de campo existen
  por módulo en back y front (`seriesLimitMessage`, `sessionFieldKey`,
  `series-draft.ts`), igual que en Rutinas (ticket 21). El RPE se muestra con
  coma decimal en la interfaz mientras la entrada usa punto, coherente con el
  editor de Rutinas.

### Espec

- Requisitos del ticket cubiertos uno a uno: estados exactos con datos
  permitidos por estado; exigencias de resultado por Forma; cardio con una única
  Serie y segundo esfuerzo como nueva aparición; límites sin corrección
  silenciosa (carga, repeticiones, duración, RPE en pasos de 0,5); objetivos que
  inicializan los campos sin cambiar el estado; resultado atómico con entrada
  parcial que permanece en el formulario y se pierde al recargar; sustitución
  del agregado con revisión y estados «Guardando»/«Guardado»/«Error al guardar»
  con reintento; revisión obsoleta que detiene mutaciones, recupera la vigente
  y no fusiona ni duplica; filas compactas con errores próximos al campo e
  icono + texto + color; pruebas HTTP integradas de límites, estados, Formas,
  atomicidad, repetición de peticiones y conflictos entre pestañas.
- Sin scope creep: no hay finalización ni eliminación (ticket 27), ni
  orígenes de Rutina/Plan con copia de objetivos (ticket 28). Tres decisiones
  acotadas y anotadas: «Añadir serie» mínimo (crea una Serie pendiente; la copia
  de borrador de la Serie anterior y la eliminación con confirmación son del
  ticket 27); resumen de Series y progreso por Ejercicio (primer elemento de la
  lista del ticket 27, necesarios para registrar con contexto); columna `added`
  en el esquema (distinción Serie prevista/añadida del contrato del ticket 02,
  que el ticket 27 necesitará para la eliminación; sin uso de interfaz hoy).
- Nota de interpretación: la entrada del PUT admite `result`/`goal` como objeto
  de tres magnitudes o `null` (el servidor normaliza ambos); el documento
  siempre devuelve el objeto canónico. La interfaz envía `null` para Series
  nuevas u omitidas y el objeto para las confirmadas, contrato admitido por el
  esquema.

## Archivos de autor (paths)

```
back/src/db/schema.ts                              training_session_series + comentarios
back/drizzle/0007_rare_tenebrous.sql               Migración de la tabla
back/drizzle/meta/0007_snapshot.json               Snapshot de la migración
back/drizzle/meta/_journal.json                    Registro de la migración
back/src/sessions/sessions.ts                      Series del agregado, validación y transacción
back/src/sessions/sessions-router.ts               Esquemas de Series y errores por ruta
back/test/sessions.test.ts                         13 tests HTTP nuevos + contrato actualizado
front/src/features/sessions/api/sessions-api.ts    Tipos de Serie y progreso
front/src/features/sessions/series-draft.ts        Borrador y validación pura (nuevo)
front/src/features/sessions/components/SeriesRow.tsx          Fila compacta (nuevo)
front/src/features/sessions/components/SeriesRow.module.css
front/src/features/sessions/pages/ActiveSessionPage.tsx       Registro por Serie
front/src/features/sessions/pages/ActiveSessionPage.module.css
front/src/features/sessions/pages/ActiveSessionPage.test.tsx  10 tests de interfaz nuevos
front/src/app/AppShell.test.tsx                    Fixture con series: [] (aditivo)
front/src/features/dashboard/pages/HomePage.test.tsx          Fixture con series: [] (aditivo)
.scratch/gym-training-mvp/orchestration/26/attempt-1.md
```

## Pendiente / observaciones

- El ticket sigue `ready-for-agent` en el tracker: el coordinador conserva la
  revisión definitiva y el cierre del ticket.
- El ticket 27 («Adaptar y finalizar una Sesión») construirá sobre este
  agregado: copia de borrador al añadir Series, eliminación de Series añadidas
  con confirmación (usa `added`), confirmación al omitir/devolver a pendiente
  una completada, añadir/retirar Ejercicios y finalización con invariantes.
- El ticket 28 (iniciar desde Rutina/Plan) copiará los Objetivos del origen a
  las Series previstas (`added=false`) al crear la Sesión; el PUT ya los
  conserva y valida.
- Las pruebas de interfaz simulan el contrato HTTP en el límite y no duplican
  las reglas de dominio ya demostradas por la API.
