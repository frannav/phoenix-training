# 34 — Integrar el dashboard en Inicio

**What to build:** La interfaz responsive de los cinco bloques de Inicio consumiendo el
contrato de `GET /api/dashboard`.

**Blocked by:** 33 — Componer el contrato API del dashboard.

**Status:** ready-for-agent

**Owns:** cliente HTTP del dashboard, `HomePage`, estilos, gráficas y pruebas de
Vitest/Testing Library. No duplica reglas de cálculo del backend.

- [ ] Si existe una Sesión activa, el primer bloque muestra nombre, progreso y “Continuar”.
- [ ] Sin Sesión activa, el primer bloque muestra el próximo Entrenamiento planificado pendiente y “Iniciar”; sin ninguno ofrece iniciar una Sesión libre.
- [ ] El bloque de Plan activo muestra nombre, semana actual, realizados, omitidos y enlaces a su detalle, con barras de avance y cumplimiento.
- [ ] Volumen semanal muestra total, comparación con la semana anterior y las últimas seis semanas en `kg·rep`.
- [ ] RM recientes muestra hasta tres marcas expresas con Ejercicio, carga, repeticiones y fecha.
- [ ] Evolución permite elegir un Ejercicio y muestra la métrica propia de su Forma de registro; cardio informa que no dispone de analítica.
- [ ] En móvil los bloques forman un recorrido vertical; en escritorio entrenamiento y Plan comparten la primera fila y el resto conserva la jerarquía acordada.
- [ ] Gráficas, estados vacíos, errores y acciones incluyen texto, unidad e indicadores accesibles además del color; no se dibujan gráficas sin datos.
- [ ] Vitest y Testing Library cubren selector, estados vacíos, acciones, alternativas textuales y presentación responsive sin duplicar las reglas de dominio.
