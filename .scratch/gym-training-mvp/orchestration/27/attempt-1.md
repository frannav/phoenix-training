# Attempt 1 — Ticket 27: Adaptar y finalizar una Sesión

- **Ticket:** `.scratch/gym-training-mvp/issues/27-adaptar-finalizar-sesion.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `96b34c6e7077e0ef70160aab358d002f54719ad1`
- **Branch:** `feature/ticket-27`
- **Commit:** `1ed8a29` — «Adaptar y finalizar una Sesión activa (ticket 27)»
- **Outcome:** succeeded

## Qué se construyó

Las acciones para ajustar una Sesión mientras ocurre — añadir, eliminar y
transicionar Series y Ejercicios — y convertirla en un registro finalizado
válido o eliminarla expresamente, con confirmación de pérdida de resultados en
la interfaz, invariantes de finalización y concurrencia optimista.

**Backend** (extiende `back/src/sessions/`):

- `POST /api/sessions/:id/finalize` con `{ revision }`: acción explícita en una
  transacción. Exige al menos una Serie completada (400 en caso contrario),
  convierte todas las Series pendientes en omitidas conservando sus Objetivos
  (nunca un valor libre del PUT), pasa el estado a `finalizada`, incrementa la
  revisión y libera la unicidad de la Sesión activa de la Cuenta. Una revisión
  obsoleta responde 409 `REVISION_CONFLICT` sin tocar hijos; una Sesión ya
  finalizada responde 409 `SESSION_NOT_ACTIVE`.
- `DELETE /api/sessions/:id?revision=N`: elimina el agregado en una transacción
  (apariciones y Series en cascada por clave foránea) y deja libre la Sesión
  activa para una nueva. Revisión obsoleta 409, Sesión finalizada 409, ajena o
  inexistente 404.
- El `status` del documento canónico se amplía a `"activa" | "finalizada"`.
- Las transiciones y eliminaciones de Series/Ejercicios añadidos ya las
  soportaba el PUT de sustitución del agregado (ticket 26): pasarlas a
  `omitida`/`pendiente` elimina resultado y RPE por la validación de estado; la
  confirmación de pérdida es responsabilidad de la interfaz.

**Frontend** (funcionalidad `features/sessions`):

- `sessions-api.ts`: `finalizeSession`, `deleteSession`, `sessionSeriesSummary`
  y `SessionStatus` ampliado. `series-draft.ts`: `draftFromMagnitudes`.
- `SeriesRow`: las filas completadas ganan «Omitir» y «Volver a pendiente»
  (confirman en la página y eliminan resultado y RPE); las Series añadidas
  ganan «Eliminar» en los tres estados (la confirmación solo cuando hay
  resultado); una Serie prevista (`added: false`) no ofrece eliminación.
- `ActiveSessionPage`: «Añadir serie» crea la Serie pendiente con `goal: null`
  y siembra el borrador en el navegador con los valores de la anterior (se
  pierde al recargar: borrador del formulario, no persistido); «Eliminar
  ejercicio» con confirmación si alguna Serie tiene resultado y reapertura del
  selector al quedarse vacía; barra fija inferior con «Finalizar» (inhabilitada
  sin Series completadas, diálogo con el número de pendientes que pasarán a
  omitidas) y «Eliminar sesión» (diálogo y vuelta a Inicio); tras finalizar se
  muestra el resumen con la Sesión sin pendientes y ya no activa (invalida
  `activeSessionQueryKey` para Inicio y el acceso persistente del AppShell);
  diálogo único `role="dialog"` para todas las confirmaciones destructivas con
  el patrón inline ya usado en Planes (la spec aspira a un componente común,
  pero el repositorio todavía no lo ha extraído).

## Evidencia TDD por seam (rojo → verde)

### Seam 1 — API HTTP integrada contra SQLite temporal (back) — rojo → verde

6 tests de finalizar escritos primero y rojos (la ruta no existía: 404). Verde
con `finalizeSession` + ruta. La ruta `DELETE` se implementó en la misma edición
del router (misma pasada de verde); sus 5 tests se escribieron a continuación y
pasaron al primer intento, demostrando el contrato sobre la implementación ya
presente (desviación menor de TDD, anotada).

Luego 6 tests de transiciones y eliminación de Series/Ejercicios añadidos,
verdes directamente con el PUT existente (el servidor ya rechazaba resultado en
Series no completadas y permitía soltar hijos del agregado).

Cobertura del seam (43 tests en `sessions.test.ts`): finalizar con pendientes
(→ omitidas conservando objetivos, resultados intactos, `finalizada`, no activa,
nueva Sesión posible); finalizar sin completadas (400); finalizar con revisión
obsoleta (409 sin cambio); finalizar una finalizada (409); finalizar ajena
(404); finalizar sin revisión (400); eliminar Sesión activa en transacción
(200, 404 posterior, activa nula, nueva Sesión posible); eliminar con revisión
obsoleta (409 y conservación); eliminar una finalizada (409); eliminar ajena
(404); eliminar sin revisión (400); eliminar Serie añadida pendiente; eliminar
Serie añadida con resultado (la confirmación es de interfaz); completada →
omitida (resultado y RPE eliminados, objetivos conservados); completada →
pendiente (resultado y RPE eliminados); eliminar Ejercicio añadido con sus
Series; eliminar Ejercicio con resultados. Concurrencia optimista cubierta en
PUT (previo), finalizar y eliminar.

### Seam 2 — Interfaz observable (front) — rojo → verde

2 tests actualizados primero (los de «Añadir serie» del ticket 26 esperaban los
valores de la anterior persistidos como Objetivos): rojos; verde al sembrar el
borrador sin persistir (`goal: null`).

Luego 14 tests nuevos (30 en total en `ActiveSessionPage.test.tsx`): omitir una
completada con diálogo (cancelar no pierde; confirmar elimina resultado y RPE);
volver a pendiente una completada con diálogo; eliminar Serie añadida pendiente
sin confirmación; eliminar Serie añadida completada con diálogo; Serie prevista
sin «Eliminar»; restaurar una omitida exige un resultado completo para
completarla (error de campo sin guardar, luego completado); eliminar Ejercicio
sin resultados (directo, reapertura del selector); eliminar Ejercicio con
resultados (diálogo y cancelación); acordeón de una columna (uno desplegado a
la vez, progreso completadas/omitidas/pendientes); Finalizar inhabilitado sin
completadas; Finalizar con pendientes (diálogo con el número y resumen final);
Finalizar sin pendientes (sin diálogo); eliminar Sesión activa (diálogo,
`DELETE ?revision=N` y navegación a Inicio); conflicto al finalizar (carga la
vigente). Algunas primeras pasadas rojas corrigieron defectos del propio test
(afirmaciones de forma, texto con coma decimal, texto duplicado en el resumen) y
una del componente (el título de cabecera siempre decía «Sesión activa»).

## Verificaciones enfocadas

- `bun run typecheck`: 0 errores (back y front).
- `bun run --cwd back test -- test/sessions.test.ts`: **43 pass / 0 fail** (566
  asserts; 26 previos + 17 nuevos).
- `bun run --cwd back test`: **179 pass / 0 fail** (2795 asserts, 9 archivos).
- `bun run --cwd front test -- src/features/sessions/pages/ActiveSessionPage.test.tsx`:
  **30/30 pass**.
- `bun run --cwd front test`: **111 pass** (14 archivos; 81 previos + 30 nuevos).
- `bun run build`: build de producción correcto.
- No se reclamó el resultado de la suite completa del coordinador: la suite
  raíz (`bun run test`) es propiedad del coordinador.

## Self-review (skill `$code-review`)

El runtime de Pi no expone la herramienta de sub-agentes (`Agent`) que el skill
`$code-review` usa para lanzar los dos ejes en paralelo — misma limitación que
en los intentos previos. Ambos ejes se realizaron como auto-revisión sobre el
diff autoral; el coordinador conserva la revisión definitiva.

### Estándares

- Vocabulario del dominio en español (`CONTEXT.md`): Serie añadida/prevista,
  Resultado y RPE de serie, Objetivos de serie, Sesión activa/finalizada,
  Ejercicio añadido, Origen de sesión, Deportista, Cuenta.
- Error canónico `{error:{code,message,fields?}}`; `400` entrada inválida,
  `401` sin sesión, `404` inexistente o ajeno, `409` revisión obsoleta o
  transición imposible (`REVISION_CONFLICT`, `SESSION_NOT_ACTIVE`). Zod valida
  en el límite HTTP (incluida la revisión de la query del DELETE); las reglas
  dependientes de estado viven en el caso de uso; cada transición usa una
  transacción síncrona con CAS de revisión; toda consulta y mutación filtra por
  la Cuenta autenticada.
- Documento canónico con revisión entera y `status` ampliado; el frontend envía
  la revisión leída en finalizar y eliminar.
- Hallazgos corregidos durante la auto-revisión: (1) el `delete().run()` de
  Drizzle devuelve `void` (no `changes`) — el borrado por identificador es
  correcto porque la revisión ya se comprobó en la misma transacción síncrona;
  (2) `countSeriesByStatus` quedó importado sin uso en la página al mover el
  resumen al módulo de API — retirado; (3) tras eliminar el último Ejercicio el
  selector no se reabría y la Sesión quedaba sin salida — `setPickerOpen`
  reabre cuando la Sesión queda vacía; (4) el bloque de recarga tras conflicto
  del `persist` duplicaba `reloadCurrentSession` — unificado; (5) CSS sin
  clases huérfanas (verificación usadas/definidas).
- Duplicación pequeña y documentada (patrón del repositorio, sin capas
  genéricas): el diálogo de confirmación es inline como en Planes; los límites
  y la validación viven en módulos puros por lado (`series-draft.ts`).

### Espec

- Requisitos del ticket cubiertos uno a uno: acordeón de una columna que
  mantiene uno desplegado y muestra progreso; «Añadir serie» con borrador de la
  anterior sin persistir; eliminación de Serie añadida con confirmación si hay
  resultado; omitir pendiente directo y omitir/devolver a pendiente una
  completada con confirmación y pérdida de resultado y RPE; restaurar una
  omitida como completada exige un resultado completo; eliminación de Ejercicio
  añadido con confirmación si hay resultados; finalizar solo con ≥1 Serie
  completada y confirmación con el número de pendientes; tras finalizar, sin
  pendientes, resumen y deja de aparecer como activa; eliminar Sesión activa con
  confirmación, en transacción y vuelta a Inicio; pruebas HTTP integradas de
  todas las transiciones, pérdida confirmada, invariantes, eliminación y
  concurrencia optimista.
- Sin scope creep: no hay corrección de Sesiones finalizadas (ticket 48), ni
  Historial (ticket 47), ni orígenes de Rutina/Plan (ticket 28). Dos decisiones
  acotadas y anotadas: la confirmación de pérdida de resultados es de la
  interfaz (el servidor permite la eliminación de Series añadidas con
  resultado, como pide el contrato); la regla «una Serie prevista no se elimina
  individualmente» no es observable hoy porque ninguna Sesión libre puede
  contener Series previstas (todas nacen con `added=true`) — se implementará y
  probará con los orígenes del ticket 28; la interfaz ya respeta el flag
  `added` (una prevista no ofrece «Eliminar»).
- Nota de interpretación: «mantiene uno desplegado» se lee como que el acordeón
  mantiene el Ejercicio abierto durante el registro (un solo desplegado a la
  vez, conservado tras cada guardado y al reanudar), coherente con lo aceptado
  en el ticket 26; permitir plegarlo por completo no se consideró una pérdida
  de la invariante.

## Archivos de autor (paths)

```
back/src/sessions/sessions.ts               SessionStatus, finalizeSession, deleteActiveSession
back/src/sessions/sessions-router.ts        POST /finalize y DELETE /:id con revisión
back/test/sessions.test.ts                  17 tests HTTP nuevos (43 en total)
front/src/features/sessions/api/sessions-api.ts   finalizeSession, deleteSession, resumen, status
front/src/features/sessions/series-draft.ts       draftFromMagnitudes
front/src/features/sessions/components/SeriesRow.tsx      Acciones de Series (3 estados)
front/src/features/sessions/components/SeriesRow.module.css
front/src/features/sessions/pages/ActiveSessionPage.tsx   Borrador, confirmaciones, finalizar, eliminar
front/src/features/sessions/pages/ActiveSessionPage.module.css
front/src/features/sessions/pages/ActiveSessionPage.test.tsx  14 tests nuevos (30 en total)
.scratch/gym-training-mvp/orchestration/27/attempt-1.md
```

## Lo que queda

- Suite completa raíz (`bun run test`) del coordinador.
- Revisión definitiva del coordinador (los dos ejes del skill `$code-review`
  no pueden lanzarse en sub-agentes en el runtime de Pi).
- Ticket 28 (orígenes de Sesión): copia de Objetivos previstos, Series
  previstas y la regla de conservación «una Serie prevista no se elimina
  individualmente», que con los orígenes pasará a ser observable en la API.
- Ticket 47/48: Historial paginado y corrección de Sesiones finalizadas
  (la lectura `GET /api/sessions/:id` ya devuelve finalizadas).
