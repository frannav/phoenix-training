# Intento 1 — Ticket 30: Preparar la acción diaria y el progreso del Plan

**Estado:** succeeded
**Commit de implementación:** `e84281b`
**Rama:** `feature/ticket-30` (fixed point `1e87844f9ab3329108dbcccd8a476c6b24607ae7`)

## Qué se hizo

Se implementó el modelo de lectura de los dos primeros bloques de Inicio en
`back/src/dashboard/home-read.ts`:

- **Acción prioritaria** (`HomeAction`): continuar la Sesión activa (`continuar`,
  con `sessionId`, nombre presentable según el Origen de sesión y progreso por
  Series completadas/total); si no existe, iniciar el próximo Entrenamiento
  planificado pendiente del Plan activo (`iniciar-plan`, con `planId`,
  `trainingId`, nombre de la Rutina de la referencia viva o del Plan,
  `plannedDate` y `day`); y si tampoco existe, iniciar una Sesión libre
  (`iniciar-libre`). El cliente recibe las referencias opacas para continuar o
  iniciar sin reconstruir reglas de dominio.
- **Resumen del Plan activo** (`ActivePlanSummary`): nombre, `startDate`, semana
  actual (1-based, derivada del lunes de la primera semana y acotada al
  calendario), progreso por semana y para el Plan completo. El progreso
  (`PlanProgress`) cuenta realizados, omitidos y pendientes y expone avance
  `(realizados + omitidos) / total × 100` y cumplimiento `realizados / total ×
  100` con precisión completa, más los enteros redondeados al más próximo para
  presentación.

Un Entrenamiento solo cuenta como realizado cuando su Sesión está finalizada
(estado `realizado` fijado por el caso de uso de finalización); eliminarla lo
devuelve a pendiente y ambas lecturas cambian la siguiente consulta. El modelo
lee el estado vigente en cada llamada, sin cachés ni tablas derivadas, y solo
considera entrenamientos del Plan activo (un pendiente de un Plan completado no
es iniciable y nunca se propone). No se registró `GET /api/dashboard`, no se
modificó `HomePage.tsx` ni estilos, y no se cambió el contrato de composición
que usará el ticket 33.

## Paths auteados

- `back/src/dashboard/home-read.ts` (nuevo, ~370 líneas con documentación)
- `back/test/home-read.test.ts` (nuevo, 16 pruebas)

## Evidencia TDD por seam

Seam aprobado: pruebas HTTP integradas (migraciones reales, autenticación,
rutas, casos de uso, transacciones y persistencia) para preparar el estado, y
pruebas enfocadas en `back/test` para el modelo de lectura y las reglas de
progreso. El modelo no está expuesto por HTTP en este ticket (lo compone el 33),
así que las pruebas preparan todo el estado por la API y verifican
`readHomeState` directamente, el seam público del ticket.

1. **Rojo inicial:** `back/test/home-read.test.ts` falla — el módulo no existe
   (`Cannot find module '../src/dashboard/home-read'`).
2. **Verde por rebanadas:** se implementó el módulo y se iteró hasta 16/16
   verdes. Dos fallos intermedios fueron del propio test (revisión esperada
   para omitir tras la activación y literal de punto flotante de
   `(2/3) × 100`), corregidos en el test con valores de trabajo independientes.
3. **Verificación final:** `bun run typecheck` (back y front) con código 0;
   `bun test back/test/home-read.test.ts` 16/16; `bun test back/test/` 274/0
   (suite backend completa como comprobación adicional; la validación completa
   sigue siendo del coordinador). No se ejecutó la suite de frontend.

Cobertura por criterio del ticket:

- Prioridades de acción: sin Plan ni Sesión → libre; Sesión activa gana a los
  pendientes; continuar desde libre/Rutina/Plan (nombre correcto por origen);
  siguiente pendiente por Fecha prevista con referencias; sin pendientes →
  libre aunque haya días resueltos; aislamiento entre Cuentas.
- Resumen del Plan: borrador y completado no cuentan como Plan activo; semana
  actual en el límite lunes/domingo y acotada antes/después del calendario;
  recuento por semana y completo (50/25 % y 25/0 %).
- Redondeo: precisión completa literal (33.33333333333333, 66.66666666666666) y
  enteros de presentación (33, 67, 100).
- Cambios de progreso: finalizar → realizado y la acción pasa al siguiente
  pendiente; eliminar → vuelve a pendiente y la acción vuelve al día eliminado;
  omitir cuenta en avance pero no en cumplimiento; restaurar → pendiente;
  Sesiones libres y de Rutina no alteran el Plan.

## Autorevisión (limitación del runtime)

La skill `code-review` ejecuta dos subagentes paralelos; el runtime de Pi de
este worker no expone la herramienta `Agent`, así que la revisión en paralelo no
es soportable aquí. Se hizo la revisión de dos ejes en este mismo hilo; el
coordinador posee la revisión definitiva.

- **Estándares:** sin violaciones de las convenciones del repo (comentarios y
  vocabulario en español del `CONTEXT.md`, consultas Drizzle específicas como
  `plans.ts`/`sessions.ts`, helpers de test autocontenidos). Smell baseline:
  se eliminó una duplicación menor de resolución de nombre de Rutina en un
  helper `routineName` y un parámetro sin uso; no quedan smells señalables.
  `PlanWeekSummary.order` repite el índice del array pero coincide con la forma
  de documento `PlanWeekDocument.order` ya existente del dominio.
- **Spec:** los 8 criterios de aceptación verificados por las pruebas
  anteriores. Sin scope creep: no hay ruta de dashboard, no hay cambios de
  frontend y no se tocó el contrato de composición del ticket 33.

## Pendiente

- El ticket 33 compone `GET /api/dashboard` a partir de este modelo (y del de
  analítica del 31); el ticket 34 integra la interfaz.
- El coordinador debe correr la validación completa (`bun run test` completo,
  incluida la suite de frontend) y la revisión definitiva.
