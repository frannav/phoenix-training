# 31 — Mostrar la analítica del dashboard

**What to build:** Las métricas históricas y los tres bloques analíticos restantes de Inicio, calculados directamente desde Sesiones finalizadas y RM registrados.

**Blocked by:** 20 — Mantener RM registrados; 29 — Consultar y corregir el Historial; 30 — Mostrar la acción diaria y el progreso del Plan.

**Status:** ready-for-agent

- [ ] Solo las Series completadas de Sesiones finalizadas participan en métricas; se excluyen objetivos, pendientes, omitidas, activas y eliminadas.
- [ ] Volumen suma `carga × repeticiones` para fuerza con carga; carga máxima, repeticiones, duración y RPE medio siguen las agrupaciones y exclusiones de la especificación.
- [ ] El RPE medio usa únicamente Series completadas con RPE, no pondera, se muestra con un decimal y se omite si no hay observaciones.
- [ ] La intensidad relativa usa el RM vigente de una repetición para el mismo Ejercicio, puede superar el 100 % y se muestra con un decimal; nunca se estima un 1RM.
- [ ] Las agrupaciones usan Fecha realizada y semanas de lunes a domingo; corregir fecha, resultado o estado y eliminar una Sesión cambia la siguiente lectura sin procesos derivados.
- [ ] Volumen semanal muestra el total actual, comparación porcentual con la semana anterior y barras de las últimas seis semanas en `kg·rep`.
- [ ] RM recientes muestra hasta tres marcas expresas con Ejercicio, carga, repeticiones y fecha, sin presentar resultados calculados como récords.
- [ ] Evolución permite elegir un Ejercicio y muestra carga máxima, repeticiones totales o duración total según su Forma de registro; cardio informa que no tiene analítica.
- [ ] Las gráficas reciben datos agregados desde la API e incluyen título, unidad, último valor y resumen textual; los estados sin datos orientan a una acción y no dibujan gráficas vacías.
- [ ] Las métricas se calculan al leer, sin cachés ni tablas derivadas, y las pruebas HTTP integradas cubren fórmulas, exclusiones, periodos, redondeo, correcciones y aislamiento.
- [ ] Vitest y Testing Library comprueban selector, estados vacíos y alternativas textuales sin duplicar las reglas de dominio demostradas por la API.
