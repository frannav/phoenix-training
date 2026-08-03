# Attempt 2 — Ticket 21: Crear y reutilizar Rutinas (reparación)

- **Ticket:** `.scratch/gym-training-mvp/issues/21-crear-reutilizar-rutinas.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `4686e8c35f15d893fdbca5d054a6754be50e7a6`
- **Branch:** `feature/ticket-21`
- **Commit:** `99b8fa8` — «Reparar la concurrencia optimista de la sustitución de Rutinas (ticket 21)»
- **Outcome:** succeeded

## Evidencia de la revisión (bloqueante)

La revisión citaba `back/src/routines/routines.ts:314-408`: la sustitución
leía la revisión **fuera de la transacción** y la actualización final
filtraba **solo por identificador**. Dos PUT concurrentes con la misma
revisión podían pasar la comprobación previa; la última transacción borraba
y reinsertaba los hijos, sobrescribiendo la primera sin conflicto
(ticket línea 13/17, spec.md líneas 241 y 253-254: revisión entera,
sustitución con la revisión leída, `409` para revisión obsoleta, sin mezclar
ni duplicar hijos).

### Hallazgo de fondo: las transacciones asíncronas no son atómicas

Durante el diagnóstico se verificó empíricamente que en este stack
(drizzle 0.44.7 + bun-sqlite) un callback **asíncrono** en
`database.transaction` no proporciona atomicidad: el driver bun-sqlite
ejecuta `BEGIN`, llama al callback, y como el callback devuelve una promesa,
ejecuta `COMMIT` inmediatamente — el `BEGIN`/`COMMIT` envuelve solo el
prefijo síncrono hasta el primer `await`. La sonda mostró `inTransaction:
false` justo después de la primera sentencia y ausencia de rollback ante un
fallo posterior (la primera escritura persistió). Por tanto el código
original no tenía ninguna protección real de concurrencia.

## Reproducción (rojo)

Sonda local sobre el caso de uso (`replaceRoutine` con dos llamadas
concurrentes y la misma revisión, misma cuenta y misma Rutina recién creada):

```
Antes (código original):   outcomes: ok ok
                           final: revision 2 | name: "Edición B" | exercises: [f951…, f951…]
```

Ambas escrituras devolvieron `ok` y el estado final quedó **corrompido**: el
nombre de la segunda sobrescribió a la primera y el mismo Ejercicio apareció
**duplicado** en los hijos (mezcla de las dos ediciones). Es exactamente el
fallo citado por la revisión.

## Arreglo (verde)

`back/src/routines/routines.ts` — `replaceRoutine` reescrita:

1. La validación del agregado se mantiene antes de la escritura (depende del
   catálogo y de la entrada, no de la revisión).
2. La transacción es **síncrona y atómica**: lee la cabecera dentro de la
   transacción (`not-found` y revisión obsoleta se deciden ahí), hace un
   **compare-and-swap** sobre la cabecera — `UPDATE ... WHERE id AND
   revision = esperada` — y solo después de ganar el CAS borra y reinserta
   los hijos conservando identidades. La escritura perdedora lee la revisión
   ya incrementada y devuelve `409 STALE_REVISION`.
3. **Rollback en conflicto**: la rama de conflicto no escribe ningún hijo
   (el CAS falla antes), así que no hay nada que deshacer; cualquier fallo de
   escritura posterior revierte toda la transacción por el mecanismo nativo
   de bun-sqlite (verificado: lanzar dentro de la transacción síncrona
   revierte las sentencias previas).
4. El callback debe seguir siendo síncrono: se documenta en un comentario
   que el driver cierra la transacción en el primer `await`.

La sonda anterior, con el mismo escenario, ahora produce:

```
Después (arreglo):   outcomes: ok stale(stale-revision)
                     final: revision 2 | name: "Edición A" | exercises: [dc3f…] | series: [{carga 70, repeticiones 8}]
```

Una ganadora, una con conflicto, un único hijo, sin mezcla ni duplicación.

## Regresión en el seam HTTP aprobado

`back/test/routines.test.ts` — nuevo test en «editar Rutinas con concurrencia
optimista»: «dos escrituras concurrentes con la misma revisión no se
sobrescriben: una gana y la otra recibe conflicto». Lanza dos PUT con la
misma revisión vía `Promise.all` y comprueba: exactamente un `200` y un
`409 STALE_REVISION`, y que el estado final (revisión `2`, nombre, hijos y
Series) coincide exactamente con la edición ganadora.

Nota de seam honesta: en este harness en memoria las peticiones HTTP se
serializan (la segunda llega al caso de uso con la revisión ya incrementada
en todas las ejecuciones, incluso con cargas grandes), así que el test HTTP
fija el contrato y pasa también con el código original; el rojo se demostró
en el caso de uso (sonda anterior), que es el mismo código que la revisión
citó. La regresión queda como garantía de que el contrato no se rompa.

## Comprobaciones

- `rtk bun run typecheck` — back y front: 0 errores.
- `rtk bun run --cwd back test test/routines.test.ts` — **19 pass / 0 fail**
  (18 originales + 1 regresión), estable en 3 ejecuciones consecutivas.
- `rtk bun run --cwd front test -- src/features/routines` — **6 pass / 0 fail**.
- Suite completa: pertenece al coordinador (`rtk bun run test`).

## Autorevisión (code-review)

El skill code-review requiere subagentes paralelos; como worker sin la
herramienta Agent, ambas pasadas se aplicaron manualmente sobre
`git diff 4686e8c...HEAD` (solo dos ficheros, +123/−35).

### Estándares

- Sin estándares de código documentados más allá de las convenciones ya
  presentes (comentarios en español, mismos patrones Drizzle).
- Olores (siempre juicio): el re-selecto `fresh` en la rama defensiva del
  CAS duplica levemente la consulta de la cabecera — aceptado como rama
  rara y legible; el CAS en sí no es generalidad especulativa porque la
  propia revisión lo exige.
- `outcome` se inicializa con `not-found` como valor por defecto seguro y
  todas las rutas del callback lo fijan antes de devolver.

### Spec

- Ticket 13/17 y spec.md 241, 253-254: resueltos (CAS atómico, 409 sin
  mezclar ni sobrescribir, sin duplicar hijos).
- Comportamiento preservado: mismos códigos y mensajes de error, misma
  validación del agregado, misma conservación de identidades de hijos,
  mismo documento canónico devuelto.
- Único cambio observable de borde: una petición con revisión obsoleta **y**
  agregado inválido a la vez responde ahora `400` (validación primero) en
  lugar de `409`. No está fijado por ningún test y ningún cliente legítimo
  combina ambos; se documenta como decisión deliberada para no reintroducir
  la lectura de revisión previa a la transacción que la revisión bloqueó.

## Ficheros

- `back/src/routines/routines.ts` — CAS atómico en transacción síncrona.
- `back/test/routines.test.ts` — regresión HTTP de escrituras concurrentes.

## Pendiente

- Suite completa y aprobación del coordinador.
