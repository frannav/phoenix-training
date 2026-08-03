# Attempt 2 — Ticket 26: Registrar resultados por Serie (reparación)

- **Ticket:** `.scratch/gym-training-mvp/issues/26-registrar-resultados-serie.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `27344b565ce98533f2609d8145f2a7ff9e6dea3e`
- **Branch:** `feature/ticket-26`
- **Repair commit:** `842f6c1`
- **Blocking Spec finding resuelto:** especificación línea 202 — «Añadir una
  Serie propone como borrador los valores de la Serie anterior».

## Hallazgo del revisor y resolución

La especificación (sección *Experiencia de la Sesión activa*) exige que
«Añadir una Serie propone como borrador los valores de la Serie anterior», y
la historia 42 repite la intención: «reutilizar como borrador los valores de
la anterior, para adaptar el entrenamiento con pocos toques».

El intento 1 había diferido esta conducta al ticket 27 y creaba la Serie nueva
con `goal: null` y `result: null`:

- `front/src/features/sessions/pages/ActiveSessionPage.tsx` (líneas 284–289):
  `{ status: "pendiente", goal: null, result: null }`.
- `ActiveSessionPage.test.tsx` (líneas 715–751): afirmaba exactamente lo
  contrario — `expect(payload.series[1]).toEqual({ status: "pendiente", goal:
  null, result: null })`.

**Resolución.** La Serie nueva nace **pendiente** con los valores de la Serie
anterior como **Objetivos** (`goal`), y el mecanismo existente «los Objetivos
inicializan los campos de resultado sin completar automáticamente la Serie»
convierte esos Objetivos en el borrador visible del formulario. De una Serie
anterior **completada** se proponen sus valores realmente realizados
(Resultado); de una **pendiente u omitida**, sus Objetivos; sin Serie anterior
(el botón existe también en una aparición vacía), `goal: null` como antes.

Elección de modelado: una Serie pendiente no puede portar Resultado ni RPE
(regla de dominio del backend: «Una Serie pendiente u omitida no admite
Resultado de serie»), así que los valores copiados solo pueden expresarse como
Objetivos. El RPE no se copia: es la percepción de esfuerzo de cada Serie y no
tiene lugar en una Serie pendiente; preñarlo exigiría sembrar el borrador al
margen del modelo persistido (fuera de alcance).

## TDD por seam (interfaz observable)

Seam pre-acordado y ya usado en el intento 1: Vitest + Testing Library sobre el
contrato HTTP simulado en el límite de la funcionalidad (`ActiveSessionPage`).
El backend ya valida y persiste Objetivos en Series nuevas pendientes (cubierto
por la suite de API del intento 1), por lo que la reparación es solo de
frontend.

1. **Rojo.** El test existente se corrigió a la conducta esperada (payload con
   `goal` propuesto + relleno observable del formulario) y se añadió un segundo
   test de copia de Objetivos de una anterior pendiente. Ambos fallaron con la
   implementación vigente (`goal: null`): `2 failed | 14 passed`.
2. **Verde.** Implementación mínima en `addSeries`: se propone como `goal` el
   Resultado de la Serie anterior si está completada, sus Objetivos si no, o
   `null` sin anterior. `16/16 passed`.

## Verificaciones enfocadas

- `bun run typecheck`: **0 errores** (back y front, `--filter '*'`).
- `bun run --cwd front test -- src/features/sessions/pages/ActiveSessionPage.test.tsx`:
  **16/16 pass** (15 previos + 1 nuevo; el modificado pasó a verificar la
  conducta nueva).
- `bun run --cwd front test`: **91 pass / 0 fail** (13 archivos; 90 previos +
  1 nuevo). Sin regresiones en AppShell, Inicio ni el resto de la funcionalidad.
- `bun run test` (suite raíz) es propiedad del coordinador: no se ejecutó.

## Self-review (skill `$code-review`)

El runtime de Pi no expone la herramienta de sub-agentes (`Agent`) que el skill
usa para lanzar los dos ejes en paralelo — misma limitación que en el intento 1.
Ambos ejes se realizaron como auto-revisión sobre el diff autoral
(`git diff 842f6c1^ 842f6c1`); el coordinador conserva la revisión definitiva.

### Estándares

- Vocabulario del dominio en español, comentario que cita la regla de la
  especificación; `as const` para el estado literal; sin abstracciones nuevas.
- Pruebas en el seam acordado, con payload canónico exacto y comportamiento
  observable (campos del formulario rellenados), coherente con el estilo del
  archivo.
- *Duplicated Code* (juicio): los dos tests nuevos repiten el esqueleto
  `stubFetch`/`putBodies` — precedente del propio archivo; extraer un helper
  sería refactor fuera de alcance.
- Sin nombres oscuros, especulación ni clumps: `proposedGoal` es un valor
  tipado único (`SeriesMagnitudes | null`).

### Espec

- Requisito de la línea 202 (Experiencia de la Sesión activa) y de la historia
  42: implementado y verificado por dos tests (completada → Resultado; pendiente
  → Objetivos), con relleno observable del borrador sin completar la Serie.
- Regla «los Objetivos inicializan los campos sin completar»: intacta; la Serie
  nueva sigue pendiente y el payload envía `result: null`.
- Sin scope creep: sin cambios de backend, sin eliminación ni finalización
  (ticket 27), sin copia de RPE (decisión documentada arriba).

## Archivos de autor (paths)

```
front/src/features/sessions/pages/ActiveSessionPage.tsx       addSeries propone los valores de la anterior
front/src/features/sessions/pages/ActiveSessionPage.test.tsx  test corregido + caso nuevo de copia
.scratch/gym-training-mvp/orchestration/26/attempt-2.md       este reporte
```

## Pendiente / observaciones

- El ticket sigue `ready-for-agent` en el tracker: el coordinador conserva la
  revisión definitiva y el cierre del ticket.
- Queda diferido al ticket 27 (ya estaba previsto en el intento 1): eliminación
  de Series añadidas con confirmación (usa `added`), confirmación al omitir o
  devolver a pendiente una completada, y finalización con invariantes. La copia
  de borrador al añadir Series —que el ticket 27 anunciaba— queda resuelta aquí
  porque la línea 202 de la especificación la exige en este ticket.
