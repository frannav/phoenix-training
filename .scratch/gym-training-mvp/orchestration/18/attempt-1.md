# Attempt 1 — Ticket 18: Explorar el catálogo revisado de Ejercicios

- **Ticket:** `.scratch/gym-training-mvp/issues/18-explorar-catalogo-revisado-ejercicios.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `43cd144bf7630d44db7007d4ae42ee5bf448ece7`
- **Branch:** `main`
- **Commit:** `8b4bedb`
- **Outcome:** succeeded

## Resumen

El catálogo pasa a ser un snapshot local y versionado del commit auditado de
`hasaneyldrm/exercises-dataset` con manifiesto de checksum y revisión, carga
versionada reproducible, identidad interna opaca, búsqueda/filtros/paginación
por cursor en la API y una pantalla Ejercicios que explora, filtra, selecciona
y muestra la procedencia de catálogo con un placeholder común. Las
actualizaciones generan un diff revisable (altas, cambios compatibles,
retiradas, formas incompatibles) y la retirada conserva identidad y fila.

## Seams aprobados y evidencia red → verde

Se trabajó en rebanadas verticales (un test rojo → implementación mínima →
verde) en cada seam aprobado:

### Seam A — Carga versionada y manifiesto (backend, sin HTTP)

1. **Rojo:** test "la carga publica únicamente los Ejercicios revisados en
   español" (falló por usar el API `.where(col, "eq", val)` de Drizzle y por
   el conteo inicial 0). Verde tras corregir la consulta: 11 filas con nombre,
   instrucciones es, Forma de registro válida y manifiesto persistido con
   commit/checksum/revisión.
2. **Rojo:** test "la carga es idempotente y rechaza un snapshot alterado"
   — una segunda carga devuelve `{added:0,...}` y un texto alterado falla por
   checksum. Verde.
3. **Rojo:** test "el contenido no revisado del snapshot no aparece en el
   producto" — un registro upstream sin entrada de revisión no se publica
   (checksum recalculado en el fixture). Verde.

### Seam B — API HTTP integrada (SQLite migrada + sesión)

4. **Rojo:** "sin sesión la consulta devuelve 401". Verde con el manejador
   autenticado.
5. **Rojo:** "lista el catálogo con identidad opaca y procedencia de
   catálogo" — IDs hex de 32, `provenance: "catalogo"`, campos españoles.
   Verde.
6. **Rojo:** "ninguna respuesta traduce ni expone contenido upstream" — el
   nombre inglés «barbell bench press», `upstream_id` y los IDs de 4 dígitos
   no aparecen en el cuerpo. Verde.
7. **Rojo:** "busca por nombre ignorando mayúsculas y acentos" — `q=flexion`
   encuentra «Flexión con toque de pecho» mediante la columna normalizada.
   Verde.
8. **Rojo:** "filtra por Forma de registro y por categoría". Verde.
9. **Rojo:** "valida la entrada y aplica el límite máximo de 50" —
   `limit=51` y `recordingMode` inválido → 400. Verde.
10. **Rojo:** "pagina mediante cursor opaco sin solapamientos y con identidad
    estable" — páginas de 4, sin duplicados, cursor opaco base64url. Verde.
11. **Rojo:** "el catálogo compartido se lee igual desde Cuentas distintas"
    — dos Cuentas verificadas ven los mismos IDs (compartido, no privado).
    Verde.
12. **Rojo:** "expone la taxonomía de categorías para los filtros"
    (`/api/exercises/categories`, 401 anónimo). Verde.

### Seam C — Actualización con diff revisable y conservación de identidad

13. **Rojo:** "el diff distingue altas, cambios compatibles, retiradas y
    formas incompatibles" — fixture «siguiente revisión» con alta (9999),
    cambio de nombre (3216), retirada ausente (3666) e incompatible (0858).
    Verde.
14. **Rojo:** "aplicar la actualización conserva identidades y retira sin
    eliminar" — el cambio compatible conserva el id interno; la retirada
    conserva fila con `available=false`; la forma incompatible retira la
    anterior y publica identidad nueva. Verde.
15. **Rojo:** "los Ejercicios retirados ya no aparecen en el listado de la
    API". Verde.
16. **Rojo:** "una Forma de registro distinta nunca se aplica sobre una
    identidad publicada" — ningún `changed` contiene `recordingMode`. Verde.
17. **Rojo:** "el manifiesto de producción pasa los invariantes de la carga".
    Verde.

### Seam D — Interfaz observable (Vitest + Testing Library)

18. **Rojo:** "muestra el catálogo con procedencia y un placeholder común sin
    imágenes" — falló por lectura síncrona antes de resolver la query; verde
    con `findByText`. Sin `<img>` en el DOM.
19. **Rojo:** "selecciona un Ejercicio y muestra sus instrucciones". Verde.
20. **Rojo:** "busca por nombre y la petición incluye el texto". Verde.
21. **Rojo:** "filtra por Forma de registro y por categoría" (params en la
    URL). Verde.
22. **Rojo:** "carga más Ejercicios con el cursor opaco". Verde.
23. **Rojo:** "muestra un estado vacío y permite limpiar los filtros". Verde.
24. **Rojo:** "informa cuando el catálogo no se puede cargar". Verde.

## Archivos de autor (paths)

```
back/catalog/manifest.json          Manifiesto: commit auditado, checksum, revisión
back/catalog/snapshot.json          Subconjunto revisado de 11 registros upstream reales
back/catalog/review.json            Revisión local: nombre es, Forma de registro, taxonomía
back/drizzle/0003_reflective_millenium_guard.sql   Migración exercise + catalog_manifest
back/drizzle/meta/0003_snapshot.json
back/drizzle/meta/_journal.json     Reajustado (una generación fallida dejó un hueco)
back/src/catalog/types.ts
back/src/catalog/normalize-search-text.ts
back/src/catalog/catalog-diff.ts    planCatalogUpdate / applyCatalogUpdate
back/src/catalog/load-catalog.ts    verificación, invariantes, carga idempotente
back/src/catalog/run-load.ts        script db:load
back/src/db/schema.ts               tablas exercise y catalog_manifest
back/src/exercises/list-exercises.ts
back/src/app.ts                     GET /api/exercises y /api/exercises/categories
back/test/catalog.test.ts           17 pruebas HTTP integradas
back/package.json                   script db:load
package.json                        script db:load raíz
front/src/features/exercises/api/exercises-api.ts
front/src/features/exercises/pages/ExercisesPage.tsx
front/src/features/exercises/pages/ExercisesPage.module.css
front/src/features/exercises/pages/ExercisesPage.test.tsx
front/src/shared/ui/ExercisePlaceholder.tsx
front/src/shared/ui/ExercisePlaceholder.module.css
.scratch/gym-training-mvp/issues/18-explorar-catalogo-revisado-ejercicios.md
.scratch/gym-training-mvp/orchestration/18/attempt-1.md
```

No se tocó `.agents/skills/orchestrate-tickets/SKILL.md` (modificación del
coordinador preservada sin stage).

## Comprobaciones enfocadas

- `bun run --cwd back typecheck` y `bun run --cwd front typecheck`: limpios.
- `bun test` en `back/test/catalog.test.ts`: 17/17.
- `vitest run src/features/exercises`: 7/7.
- `DATABASE_PATH=/tmp/... bun run db:load`: carga 11 altas sobre SQLite real.
- Smoke real: migración + carga + arranque + registro + 403 en cuenta pendiente.

## Resultado final de la suite completa

- `bun run typecheck`: 0 errores (back y front).
- `bun run test`: backend **45 pass / 0 fail** (482 asserts), frontend **53 pass**
  (9 archivos).
- `bun run build`: build de producción correcto.

## Self-review (ambos ejes)

El runtime de Pi no dispone de tool de sub-agentes en paralelo, por lo que no
fue posible lanzar los dos agentes del skill `code-review`; ambos ejes se
realizaron como auto-revisión y el coordinador conserva la revisión
definitiva.

### Estándares

- Convenciones del repo respetadas: vocabulario del dominio (Ejercicio del
  catálogo, Forma de registro, Ejercicio no disponible), formato de error
  `{error:{code,message}}`, Drizzle como única capa, casos de uso sin
  repositorios genéricos, CSS Modules, tests por seams públicos.
- Duplicación detectada y corregida: el bloque `auth.api.getSession` + 401 se
  extrajo a `authenticatedUserId`.
- `run-load.ts` dejó de migrar para mantener responsabilidad única con
  `db:migrate`.
- Sin olores graves: nombres claros, sin Message Chains, sin Speculative
  Generality, sin Feature Envy. `recordingMode`/`nameNormalized` son columnas
  justificadas por la búsqueda española y la inmutabilidad de la Forma de
  registro.

### Espec

- Cada checkbox del ticket se cubre con código y prueba (ver seams).
- Sin scope creep: los Ejercicios personalizados se preparan en esquema y
  consulta (`account_id` nulo o propio) pero no se implementan (tickets 13-16);
  el endpoint de categorías es la taxonomía de filtro mínima de la espec.
- La retirada conserva identidad y fila; no existen aún tablas que referencien
  Ejercicios (Rutinas/Planes/Sesiones), por lo que «no romper referencias» se
  demuestra conservando la fila y el id.

## Pendiente / observaciones

- Los JPG/GIF del origen siguen excluidos (placeholder común); añadir medios
  con licencia propia queda como migración futura, tal y como decide el ticket 09.
- El snapshot vendado incluye 11 registros reales del commit auditado
  `7455efae41b330c265e7cd4b78dfa848e7ce5ebd` (subconjunto revisado); ampliar la
  revisión es una actualización ordinaria con su diff.
- La revisión humana del diff de actualización (proceso), no automatizada; el
  diff se genera y aplica explícitamente.
