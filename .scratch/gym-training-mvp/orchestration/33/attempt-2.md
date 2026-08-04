# Reporte del intento 2 — ticket 33 «Componer el contrato API del dashboard»

**Estado:** reparado (listo para la revisión definitiva del coordinador).
**Commit de la reparación:** `7fe16d0` — `fix(dashboard): evolución sin analítica pedida por exerciseId como ausencia explícita (ticket 33)`.
**Fixed point:** `43b4ca065c17d12e9ecffe7ddeb65428e18f42c8`.
**Base del intento 1:** `6ad20c3` (implementación) + `6db9502` (reporte del intento 1).

## Rutas autoradas en este intento

- `back/src/dashboard/dashboard-router.ts` (modificado): `evolution.current` es `null` cuando el
  Ejercicio pedido por `?exerciseId=` (o el elegido por defecto) no está entre las opciones del
  selector `evolution.options`; la evolución solo se lee para un Ejercicio que sea opción.
- `back/test/dashboard-api.test.ts` (modificado): prueba de regresión en el seam aprobado
  (API HTTP integrada contra SQLite temporal con las migraciones de producción).
- `.scratch/gym-training-mvp/orchestration/33/attempt-2.md` (este reporte).

Ningún otro archivo cambió: la rama partía limpia y el commit de la reparación solo contiene las
dos rutas de código y este reporte.

## Hallazgo bloqueante y su resolución

### Un Ejercicio propio sin Series completadas pedido por `?exerciseId=` producía `current: { points: [] }`

**Evidencia del bloqueo (revisión del coordinador, eje Spec):** en `dashboard-router.ts:104-111`
el intento 1 llamaba a `exerciseEvolution` para cualquier `selectedId` presente (`requestedId ??
options[0]?.id ?? null`). El modelo del ticket 31 devuelve el documento de evolución para
cualquier Ejercicio propio —incluso sin Series completadas—, así que un Ejercicio propio sin
analítica pedido expresamente por `?exerciseId=` producía `current: { points: [] }`. Requisito:
spec.md:229 «no se dibujan gráficas vacías» y criterio del ticket «Los estados sin Plan, sin
Sesiones o sin datos analíticos se expresan como ausencia explícita y no como gráficas vacías»:
la ausencia de analítica para un Ejercicio propio debe ser `current: null`, igual que para un
Ejercicio ajeno o inexistente.

**Resolución aplicada (lo que pidió la revisión):** la composición de la ruta devuelve `current:
null` cuando el identificador pedido está fuera de `evolution.options`. El selector solo contiene
Ejercicios con al menos una Serie completada en una Sesión finalizada de la Cuenta autenticada,
de modo que la guarda cubre de una vez los tres casos de ausencia: Ejercicio propio sin Series
completadas (el defecto), Ejercicio ajeno o inexistente (fuera del selector por el filtrado por
Cuenta) y ausencia total sin opciones (`selectedId` nulo). El modelo `exerciseEvolution` no cambia
—sigue devolviendo el documento para un Ejercicio propio—, pero la ruta ya no lo consulta para
identificadores fuera del selector. Se conservan las semánticas existentes: el cardio continuo con
Series completadas sigue siendo opción y recibe su modelo sin analítica (`metric: null`, `points:
[]`), y sin `?exerciseId=` se sigue mostrando la opción más reciente.

**Prueba de regresión añadida:** «un Ejercicio propio sin Series completadas pedido por exerciseId
es ausencia explícita» — una Sesión finalizada de «Sentadilla» (fuerza) crea la única opción del
selector; pidiendo `?exerciseId=` de «Dominada» (repeticiones sin carga, creada sin Sesiones)
asevera `evolution.current` `null` y que la opción pedida no aparece en el selector; y sin
`exerciseId` el bloque sigue mostrando la opción más reciente (Sentadilla). El resto de las 12
pruebas del intento 1 no cambió y sigue verde: composición completa, prioridades, autenticación,
estados vacíos, correcciones recientes, aislamiento y selector (incluidos ajeno/inexistente y
cardio).

## TDD por rebanadas verticales en el seam aprobado

Seam aprobado y reutilizado: `back/test/dashboard-api.test.ts` (API HTTP integrada; los datos se
preparan por la API —registro, verificación, Ejercicios, Sesiones finalizadas— y la lectura se
comprueba llamando a `GET /api/dashboard` con la cookie de sesión). No se pidió ningún seam nuevo.

1. **Rojo (base del intento 1):** la prueba de regresión falla sobre `6ad20c3` —
   `expect(received).toBeNull()` recibía `{ exerciseId, name: "Dominada", recordingMode:
   "repeticiones_sin_carga", metric: "repeticiones_totales", points: [] }`. 1 fallo / 12 verdes.
2. **Verde (reparación):** la misma prueba pasa tras la guarda sobre `evolution.options`;
   las 13 pruebas del archivo pasan sin cambiar ninguna expectativa previa.

## Verificaciones

- `bun run typecheck` — PASS (back y front, código 0).
- `bun test back/test/dashboard-api.test.ts` — 13 pruebas, 0 fallos (12 previas + 1 de regresión).
- `bun test` en `back/` — 324 pruebas, 0 fallos (323 previas + 1 de regresión).
- La validación completa (front incluido) pertenece al coordinador.

## Autorevisión (skill code-review)

**Limitación del runtime:** el skill `code-review` lanza dos sub-agentes en paralelo mediante una
herramienta `Agent`; este runtime no la expone (misma limitación que en el intento 1). La revisión
de ambos ejes se hizo manualmente en el mismo contexto, sobre el diff `6db9502..HEAD` (la
reparación). El coordinador mantiene la revisión definitiva.

### Eje Standards

Fuentes: «Arquitectura del backend» y «API y concurrencia» de la spec, `docs/agents/domain.md`.
- La composición sigue sin reinterpretar reglas de dominio: la ruta solo decide *si* leer el
  modelo, y la pertenencia al selector es la forma canónica de «tiene analítica» ya definida por
  `evolutionOptions` (no se duplica la consulta ni el filtrado por Cuenta).
- Sin olores nuevos: la guarda es un predicado único y autoexplicativo (`isSelectable`), sin
  duplicación de lógica de opciones y sin abstracción especulativa. El comentario en la ruta
  documenta el invariante «sin gráficas vacías» y la excepción del cardio.
- El JSDoc del contrato `DashboardResponse.evolution.current` («ausencia explícita cuando no hay
  datos analíticos») ya describía esta semántica; la reparación alinea el código con el contrato.

### Eje Spec

- Hallazgo resuelto: spec.md:229 exige que no se dibujen gráficas vacías; el ticket exige que los
  estados sin datos analíticos se expresen como ausencia explícita. Un Ejercicio propio sin Series
  completadas pedido por `?exerciseId=` ahora responde `current: null` — la misma forma que un
  Ejercicio ajeno o inexistente y que la ausencia total, sin forma intermedia `{ points: [] }`.
- Semánticas conservadas: el cardio continuo con analítica pendiente sigue siendo opción del
  selector con su modelo sin analítica (`metric: null`), el comportamiento por defecto (opción más
  reciente) no cambia y las demás pruebas HTTP del intento 1 pasan intactas.
- Sin alcance excedido: no se tocó el frontend, no se cambió el modelo `exerciseEvolution` ni los
  modelos de 30/31, y no se añadió ningún seam nuevo.

## Lo que queda

- El coordinador resuelve el ticket 33 con su revisión definitiva; el ticket 34 integra la interfaz
  consumiendo este contrato.
