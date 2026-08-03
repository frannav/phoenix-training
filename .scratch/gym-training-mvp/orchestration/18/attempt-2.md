# Attempt 2 — Ticket 18: Explorar el catálogo revisado de Ejercicios (reparación)

- **Ticket:** `.scratch/gym-training-mvp/issues/18-explorar-catalogo-revisado-ejercicios.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `43cd144bf7630d44db7007d4ae42ee5bf448ece7`
- **Branch:** `main`
- **Base (intento previo):** `0837e7e` / `0662b9e`
- **Outcome:** succeeded

## Contexto

El intento 1 (`attempt-1.md`) implementó el catálogo compartido y versionado.
El revisor bloqueó la integración por la representación del cursor en
`back/src/app.ts` (líneas 61-83):

1. **Ocultamiento roto:** `encodeOpaqueCursor` devolvía
   `Base64(JSON.stringify({offset}))`; descifrar la cadena revelaba
   directamente el desplazamiento interno, por lo que el cursor no era opaco.
2. **Entrada inválida silenciosa:** `decodeOpaqueCursor` trataba cualquier
   cursor malformado o desconocido como `offset 0` y respondía 200; el
   contrato de la API reserva `400` para entrada inválida y el ticket exige
   un cursor opaco.

## Resolución de cada hallazgo (TDD rojo → verde)

Se usó el skill `$tdd` en el seam aprobado (API HTTP integrada contra SQLite
temporal con migraciones de producción, sesión de Cuenta verificada) en una
rebanada vertical: tres tests rojos → una implementación mínima → verde.

### Rojo (3 tests nuevos en `back/test/catalog.test.ts`)

1. **`el cursor opaco no expone el desplazamiento interno`** — pide una
   página con `limit=4`, decodifica `nextCursor` y comprueba que el texto no
   contiene una clave `offset` ni es un entero plano. Falló contra la
   implementación anterior (`{"offset":4}` visible).
2. **`rechaza un cursor manipulado con 400`** — altera el primer carácter de
   un cursor real y espera `400` con el error canónico
   `{error:{code:"VALIDATION_ERROR",message:"La petición no es válida."}}`.
   Falló (la anterior devolvía 200).
3. **`rechaza un cursor malformado con 400`** — `cursor=no-es-un-cursor`
   (alfabeto válido, longitud insuficiente) y `cursor=` (vacío) → `400`.
   Falló (la anterior devolvía 200).

Los 17 tests previos del catálogo seguían verdes (rojo aislado en la rebanada).

### Verde — cursor opaco sin estado (`back/src/http/opaque-cursor.ts`)

- **Formato:** `base64url(iv(12) + texto cifrado + etiqueta GCM(16))` con
  AES-256-GCM; el texto plano es `JSON.stringify({offset})`. El desplazamiento
  ya no es recuperable por el cliente: decodificar el cursor produce bytes de
  cifrado, no la posición.
- **Clave:** `opaqueCursorKey(secret)` deriva 32 bytes con SHA-256 del secreto
  de la aplicación (`authConfig.secret` → `BETTER_AUTH_SECRET` en producción)
  bajo un prefijo de dominio (`phoenix-training:opaque-cursor:v1:`); sin
  secreto (tests) usa una clave aleatoria por proceso. Sin estado: no hay
  tablas ni memoria compartida; los cursores sobreviven reinicios cuando hay
  secreto configurado.
- **Rechazo con 400 canónico:** `decodeOpaqueCursor` devuelve `0` sin cursor,
  `null` para cursor inválido/manipulado/indescifrable o desplazamiento no
  entero ≥ 0; el manejador responde `400 VALIDATION_ERROR` (mismo código y
  mensaje que el resto de validación del endpoint).
- **Sin expansión de alcance:** la paginación por desplazamiento, el orden
  estable (`name, id`), los filtros (`q`, `recordingMode`, `category`), el
  límite máximo de 50, las identidades opacas y la procedencia no cambian; el
  frontend ya trata el cursor como cadena opaca y no requiere cambios.

`back/src/app.ts` elimina las funciones locales y delega en el módulo; la
clave se calcula una vez por instancia en `createApp`.

### Verificación enfocada

- `bun run --cwd back typecheck`: 0 errores.
- `bun test back/test/catalog.test.ts`: **20/20 pass** (17 previos + 3 nuevos).

## Resultado final de la suite completa

- `bun run typecheck`: 0 errores (back y front).
- `bun run test`: backend **48 pass / 0 fail** (542 asserts, 4 archivos);
  frontend **53 pass** (9 archivos).
- `bun run build`: build de producción correcto.

## Self-review (skill `$code-review`)

El runtime de Pi no expone herramienta de sub-agentes (no hay `Agent`), por lo
que no fue posible lanzar los dos agentes en paralelo del skill
`code-review`; ambos ejes se realizaron como auto-revisión sobre el diff
autoral (`back/src/http/opaque-cursor.ts`, `back/src/app.ts`,
`back/test/catalog.test.ts`) y el coordinador conserva la revisión definitiva.

### Estándares

- Convenciones del repo respetadas: vocabulario del dominio en español,
  formato de error `{error:{code,message}}` con `400` para entrada inválida
  (spec: «Se reserva 400 para entrada inválida»), `node:crypto` como ya usa
  el repo (`verification-tokens.ts`, `load-catalog.ts`), sin acceso a BD
  nuevo, lógica de cursor centralizada en un módulo (sin Shotgun Surgery).
- Olores del baseline: sin Mysterious Name (nombres reveladores), sin
  Duplicated Code (la validación de `offset` vive una sola vez), sin
  Speculative Generality (sin caducidad, sin ligar filtros al cursor, sin
  estado en BD; el fallback por proceso es necesario para instancias sin
  secreto). Constantes `CURSOR_IV_BYTES`/`CURSOR_TAG_BYTES` evitan números
  mágicos.

### Espec

- Hallazgo 1 resuelto: el cursor ya no expone el desplazamiento (AES-256-GCM).
- Hallazgo 2 resuelto: cursor inválido o manipulado → `400 VALIDATION_ERROR`.
- Evidencia HTTP integrada sin internals: los 3 tests operan sobre la
  respuesta pública (`nextCursor` y el parámetro `cursor`), no importan
  funciones internas.
- Comportamiento intacto: paginación sin solapamientos, filtros, máximo 50 e
  identidades estables cubiertos por los tests previos que siguen verdes;
  catálogo compartido legible desde Cuentas distintas sin hacerse privado.
- Sin scope creep: no se tocó el frontend ni se añadieron endpoints,
  parámetros o estado nuevo.

## Archivos de autor (paths)

```
back/src/http/opaque-cursor.ts   Nuevo: cifrado AES-256-GCM del cursor, clave derivada
back/src/app.ts                  Usa el módulo y rechaza cursores inválidos con 400
back/test/catalog.test.ts        3 tests HTTP nuevos (opacidad, manipulado, malformado)
.scratch/gym-training-mvp/orchestration/18/attempt-2.md
```

No se tocó `.agents/skills/orchestrate-tickets/SKILL.md` (modificación previa
del coordinador, sin stage).

## Pendiente / observaciones

- Un cursor emitido antes de un reinicio con `BETTER_AUTH_SECRET` ausente
  quedaría inválido (clave aleatoria por proceso); con secreto configurado
  (producción) los cursores sobreviven. Comportamiento documentado en el
  módulo.
- La paginación del Historial (ticket 47) podrá reutilizar el mismo módulo.
