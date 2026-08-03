# Attempt 2 — Ticket 20: Mantener RM registrados (reparación)

- **Ticket:** `.scratch/gym-training-mvp/issues/20-mantener-rm-registrados.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `fd7d1206633a34ae9d72d0e35ebefd2bf464e918`
- **Branch:** `feature/ticket-20`
- **Repair commit:** `bd134b3` — «Reparar edición de RM: no enviar exerciseId en el PUT (ticket 20)»
- **Outcome:** succeeded

## Hallazgo bloqueante y causa raíz

La revisión del intento 1 encontró que la edición real de un RM falla con 400:
`handleFormSubmit` enviaba el `RecordedMaxFormValues` completo (con
`exerciseId`) al PUT, y el esquema estricto del servidor
(`updateRecordedMaxSchema` con `.strict()`, solo carga/repeticiones/fecha)
rechaza la clave extra. El tipo `Omit<RecordedMaxFormValues, "exerciseId">`
de la mutación no lo impedía porque TypeScript no aplica excess property
checks a variables (solo a literales), así que `values` pasaba con el campo
extra y `exercises-api.ts` lo serializaba intacto. El test de interfaz usaba
`toMatchObject` en dos aserciones separadas, que no detectan claves extra, y
por eso el fallo pasó verde.

## Reparación (TDD rojo → verde)

### Rojo — el test reforzado falla con el código actual

Se sustituyeron las dos aserciones `toMatchObject` del test de edición por un
`toEqual` sobre el payload completo del PUT más una negación explícita:

```ts
expect(payloads[0]).toEqual({
  id: recordedMax.id,
  body: { load: 142.5, repetitions: 4, date: "2025-06-12" },
});
expect(payloads[0]).not.toHaveProperty("body.exerciseId");
```

Antes del arreglo: **1 fallo** — el diff del assert muestra exactamente el
campo extra: `+ "exerciseId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"` en el cuerpo
recibido. (17 pasan; el resto de la suite no se ve afectado.)

### Verde — se elimina exerciseId antes del PUT

En `RecordedMaxSection.tsx`, `handleFormSubmit` en modo edición descompone
solo los campos editables y construye un literal explícito:

```tsx
const { load, repetitions, date } = values;
await updateMutation.mutateAsync({
  id: formState.rm.id,
  values: { load, repetitions, date },
});
```

El comentario documenta el porqué: el servidor valida con esquema estricto y
la marca no puede moverse a otro Ejercicio. Ahora el literal pasa por excess
property checking de TypeScript: una regresión aquí sería un error de
compilación, no un fallo silencioso.

Tras el arreglo: **18/18 pass** en `ExercisesPage.test.tsx`.

## Archivos de autor (solo estos, en el commit de reparación)

```
front/src/features/exercises/components/RecordedMaxSection.tsx  quitar exerciseId del PUT de edición
front/src/features/exercises/pages/ExercisesPage.test.tsx       assert exacto del cuerpo del PUT
```

## Evidencia TDD

- Rojo: `bun run --cwd front test ExercisesPage.test.tsx` → 1 failed (el diff
  del assert muestra `+ "exerciseId"` en el cuerpo del PUT).
- Verde: mismo comando → 18/18 pass.

## Verificaciones enfocadas y completas

- `bun run typecheck`: 0 errores (front y back, exit 0 ambos).
- `bun run --cwd front test ExercisesPage.test.tsx`: **18/18 pass**.
- `bun run --cwd back test recorded-max.test.ts`: **30/30 pass** (368 asserts;
  el backend no cambió — el esquema estricto ya rechazaba exerciseId, lo que
  se arregló es el cliente).
- `bun run --cwd front test`: **64 pass** (9 archivos, sin regresiones).
- `bun run --cwd back test`: **98 pass** (6 archivos, sin regresiones).

## Self-review (skill $code-review)

El runtime no expone la herramienta de sub-agentes (`Agent`) que el skill usa
para los dos ejes en paralelo — misma limitación que en el intento 1. Ambos
ejes se realizaron como auto-revisión sobre el diff de la reparación
(`git diff 49d80f5..bd134b3`); el coordinador conserva la revisión definitiva.

### Estándares

- Cambio mínimo y enfocado: 2 archivos, +16/−3. Sin duplicación, sin
  Speculative Generality, nombres claros; el comentario explica el «por qué»
  (esquema estricto del servidor, inmutabilidad del Ejercicio), no el «qué».
- El arreglo mejora la seguridad de tipos: el literal `{ load, repetitions,
  date }` está sujeto a excess property checking, a diferencia de la variable
  `values` anterior que lo eludía estructuralmente.
- El test sigue el patrón ya establecido en el archivo (el test de creación
  ya usaba `toEqual` sobre el payload).

### Espec

- Criterio 2 («La Cuenta puede listar, editar y eliminar sus RM registrados
  desde el área de Ejercicios»): la edición vuelve a funcionar de extremo a
  extremo — el cuerpo del PUT coincide con el esquema estricto
  (carga/repeticiones/fecha) y ya no responde 400. ✓
- Criterio 9 (pruebas HTTP integradas): sin cambios en el backend, 30/30. ✓
- Sin scope creep: solo el cliente de edición y su test.

## Limitaciones y observaciones

- El bug era exclusivamente del cliente: el backend ya rechazaba `exerciseId`
  correctamente (cubierto por la prueba «exerciseId en el cuerpo se rechaza
  (strict, 400)»); la reparación alinea el cliente con ese contrato.
- El test reforzado usa `toEqual` sobre el payload completo y una negación
  explícita de `body.exerciseId` para fijar la regresión exacta que motivó
  este intento.
- Pendiente del coordinador: revisión definitiva y cierre del ticket en el
  tracker (sigue `ready-for-agent`).
