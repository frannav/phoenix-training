# 33 — Componer el contrato API del dashboard

**What to build:** La lectura REST única que reúne los cinco bloques de Inicio a partir
de los modelos de lectura preparados en los tickets 30 y 31.

**Blocked by:** 30 — Preparar la acción diaria y el progreso del Plan; 31 — Preparar la analítica del dashboard.

**Status:** resolved

**Owns:** la ruta, el esquema de respuesta, la autenticación y las pruebas HTTP de
`GET /api/dashboard`. No implementa métricas ni componentes visuales.

- [x] `GET /api/dashboard` devuelve en una sola lectura los bloques de entrenamiento actual, Plan activo, volumen semanal, RM recientes y evolución.
- [x] La respuesta compone sin reinterpretar las reglas de los modelos de lectura de los tickets 30 y 31.
- [x] La ruta exige una Cuenta verificada y los datos de otra Cuenta se comportan como inexistentes.
- [x] El contrato conserva las referencias opacas necesarias para continuar, iniciar, abrir el Plan o elegir un Ejercicio.
- [x] Los estados sin Plan, sin Sesiones o sin datos analíticos se expresan como ausencia explícita y no como gráficas vacías.
- [x] Las pruebas HTTP cubren la composición completa, prioridades de acción, estados vacíos, correcciones recientes, aislamiento y la forma estable de la respuesta.

## Answer

Implementado y aprobado en `feature/ticket-33`. `GET /api/dashboard` compone los cinco bloques de Inicio, aplica autenticación y aislamiento por Cuenta, conserva referencias opacas y expresa la ausencia de datos analíticos sin gráficas vacías.

Commits: `6ad20c3` (implementación) y `7fe16d0` (reparación Spec). Reportes: `.scratch/gym-training-mvp/orchestration/33/attempt-1.md` y `attempt-2.md`.

Verificación: `bun run typecheck`, `bun test back/test/dashboard-api.test.ts` (13 pruebas), suite completa (`324` backend y `135` frontend) y `bun run build`; todo PASS. Standards y Spec: PASS. Reparaciones: 1.
