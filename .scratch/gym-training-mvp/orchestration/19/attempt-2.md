# Attempt 2 — Ticket 19: Gestionar Ejercicios personalizados (reparación)

- **Ticket:** `.scratch/gym-training-mvp/issues/19-gestionar-ejercicios-personalizados.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `9feb11d0b7d46d9a430cc304c505ef4b1a7b4ea7`
- **Branch:** `main`
- **Repair commit:** `484a3883ac42390cc7a8ba9be3ab8e015b834026` — «Reparar el ciclo de vida del formulario de Ejercicios (ticket 19)»
- **Outcome:** succeeded

## Bloqueo de revisión a resolver

La revisión del coordinador encontró un fallo de especificación en el
ciclo de vida del formulario:

> Spec failure in `front/src/features/exercises/components/ExerciseForm.tsx:62-71`:
> `useForm` recibe `defaultValues` solo en el montaje inicial, pero
> `front/src/features/exercises/pages/ExercisesPage.tsx` puede cambiar
> `formState` de un Ejercicio a otro reutilizando la misma instancia de
> `ExerciseForm`. Si el usuario pulsa Editar en B mientras está abierto el
> formulario de A (o un borrador de creación), el formulario conserva los
> valores previos y puede guardar el contenido de A dentro de B.

Acción exigida: añadir un test de interfaz observable en el seam público
que abra un formulario de edición, cambie a otro objetivo sin desmontar y
verifique que los campos/payload se reinician al nuevo objetivo; arreglar
el ciclo de vida (p. ej. remount con `key` o reset explícito) sin ampliar
el alcance del ticket.

## Archivos de autor de esta reparación

```
front/src/features/exercises/pages/ExercisesPage.tsx      keyed remount del ExerciseForm
front/src/features/exercises/pages/ExercisesPage.test.tsx test de interfaz nuevo (reinicio al cambiar de destino)
```

## Evidencia TDD (rojo → verde)

### Rojo — test de interfaz en el seam público de /ejercicios

Test añadido: «cambiar de Ejercicio en edición reinicia el formulario al
nuevo destino». Abre la edición de A (verifica prellenado), pulsa Editar
sobre B **sin desmontar el formulario** y espera que los campos se
reinicien a los de B; después guarda un cambio y comprueba que el payload
apunta al id de B con los valores de B.

Resultado rojo con la implementación vigente (12/13 en
`ExercisesPage.test.tsx`):

```
❯ src/features/exercises/pages/ExercisesPage.test.tsx:447:45
    await waitFor(() =>
      expect(form.getByLabelText("Nombre")).toHaveValue("Zancadas búlgaras"))
Test Files  1 failed (1)
     Tests  1 failed | 12 passed (13)
```

El formulario seguía mostrando «Peso muerto rumano» (los valores de A)
después de cambiar el objetivo de edición a B: el fallo se reproduce por
comportamiento observable, no por inspección interna.

### Verde — remount con `key` del destino

`ExercisesPage.tsx` fuerza un remount del formulario cuando cambia el
objetivo:

```tsx
<ExerciseForm
  key={formState.mode === "edit" ? formState.exercise.id : "nueva"}
  ...
```

La clave es la identidad opaca del Ejercicio en edición o `"nueva"` para
el borrador de creación, de modo que `useForm` vuelve a leer
`defaultValues` del nuevo objetivo y el estado efímero (`serverError`,
borradores parciales) se descarta. No se tocó `ExerciseForm.tsx` ni se
amplió el alcance del ticket.

Resultado verde: `ExercisesPage.test.tsx` 13/13 (incluido el test nuevo),
`front typecheck` limpio.

## Verificaciones enfocadas

- `bun run --cwd front test ExercisesPage.test.tsx`: **13/13 pass**.
- `bun run --cwd front typecheck`: 0 errores.

## Resultado final de la suite completa

- `bun run typecheck`: 0 errores (back y front).
- `bun run test`: backend **68 pass / 0 fail** (827 asserts, 5 archivos);
  frontend **59 pass** (9 archivos).
- `bun run build`: build de producción correcto.

## Self-review (skill $code-review)

El runtime de Pi no expone la herramienta de sub-agentes (`Agent`) que el
skill `$code-review` usa para lanzar los dos ejes en paralelo — misma
limitación que en los intentos previos. Ambos ejes se realizaron como
auto-revisión sobre el diff autoral; el coordinador conserva la revisión
definitiva.

### Estándares

- El `key` es el patrón canónico de React para reiniciar el ciclo de vida
  de un componente; el valor usa la identidad opaca del Ejercicio y el
  literal `"nueva"` para creación, coherente con la convención existente
  de `fieldPrefix` en `ExerciseForm` (`ejercicio-nueva` / `ejercicio-${id}`).
- El test sigue las convenciones del archivo: nombre en español con
  vocabulario del dominio, `stubCustomFlows` para el contrato HTTP en el
  límite de la funcionalidad, `userEvent`, `within` y `waitFor`; aserciones
  observables (campos visibles y payload de la petición), no
  implementación interna.
- El test re-consulta los campos después del cambio de objetivo en lugar de
  conservar referencias a nodos, correcto porque el remount sustituye los
  nodos del DOM.
- Olores del baseline: sin Duplicated Code, sin Mysterious Name, sin
  Feature Envy, sin Speculative Generality, sin Message Chains. El stub
  `onUpdate` es un doble de prueba compartido con el resto de tests.

### Espec

- El hallazgo bloqueante se resuelve punto por punto: (1) test de interfaz
  observable que abre una edición, cambia a otro objetivo sin desmontar y
  verifica el reinicio de campos (nombre, instrucciones, categoría) y del
  payload (id de B, nombre nuevo visible en el listado); (2) arreglo del
  ciclo de vida mediante remount con `key`; (3) sin ampliar el alcance del
  ticket — una línea de producción y su test.
- No se modificó el backend ni los contratos ya validados en el intento 1;
  la suite completa confirma que la reparación no regresa nada.

## Resolución de los hallazgos bloqueantes

| Hallazgo | Resolución |
| --- | --- |
| Spec failure: `useForm` conserva `defaultValues` del montaje inicial al cambiar el objetivo de edición sin desmontar `ExerciseForm` | Corregido con remount por `key` (identidad del destino o `"nueva"`), verificado por un test de interfaz rojo→verde en el seam público |

## Pendiente / observaciones

- El ticket sigue `ready-for-agent` en el tracker: el coordinador conserva
  la revisión definitiva y el cierre del ticket.
- El `key` cubre también el paso de creación a edición (clave `"nueva"` →
  id) y de un destino a otro; la creación posterior guarda el borrador
  correcto porque la clave cambia al abrir cualquier edición.
