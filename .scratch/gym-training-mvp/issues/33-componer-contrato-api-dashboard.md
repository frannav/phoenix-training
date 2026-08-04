# 33 — Componer el contrato API del dashboard

**What to build:** La lectura REST única que reúne los cinco bloques de Inicio a partir
de los modelos de lectura preparados en los tickets 30 y 31.

**Blocked by:** 30 — Preparar la acción diaria y el progreso del Plan; 31 — Preparar la analítica del dashboard.

**Status:** ready-for-agent

**Owns:** la ruta, el esquema de respuesta, la autenticación y las pruebas HTTP de
`GET /api/dashboard`. No implementa métricas ni componentes visuales.

- [ ] `GET /api/dashboard` devuelve en una sola lectura los bloques de entrenamiento actual, Plan activo, volumen semanal, RM recientes y evolución.
- [ ] La respuesta compone sin reinterpretar las reglas de los modelos de lectura de los tickets 30 y 31.
- [ ] La ruta exige una Cuenta verificada y los datos de otra Cuenta se comportan como inexistentes.
- [ ] El contrato conserva las referencias opacas necesarias para continuar, iniciar, abrir el Plan o elegir un Ejercicio.
- [ ] Los estados sin Plan, sin Sesiones o sin datos analíticos se expresan como ausencia explícita y no como gráficas vacías.
- [ ] Las pruebas HTTP cubren la composición completa, prioridades de acción, estados vacíos, correcciones recientes, aislamiento y la forma estable de la respuesta.
