# 30 — Mostrar la acción diaria y el progreso del Plan

**What to build:** Los dos primeros bloques de Inicio para que el Deportista sepa qué hacer ahora y cómo avanza su Plan activo.

**Blocked by:** 24 — Omitir, completar y duplicar Planes; 28 — Iniciar Sesiones desde Rutinas y Planes.

**Status:** ready-for-agent

- [ ] `GET /api/dashboard` devuelve en una sola lectura el estado necesario para los cinco bloques de Inicio, aunque los bloques analíticos se completen en el ticket 31.
- [ ] Si existe una Sesión activa, el primer bloque muestra nombre, progreso y “Continuar”.
- [ ] Sin Sesión activa, el primer bloque muestra el próximo Entrenamiento planificado pendiente y “Iniciar”; sin ninguno ofrece iniciar una Sesión libre.
- [ ] El bloque de Plan activo muestra nombre, semana actual, Entrenamientos realizados y omitidos y enlaces a su detalle.
- [ ] Avance se calcula como `(realizados + omitidos) / total` y cumplimiento como `realizados / total`, por semana y Plan completo, y se muestra al entero más próximo.
- [ ] Un Entrenamiento solo cuenta como realizado cuando su Sesión está finalizada; eliminarla lo devuelve a pendiente y actualiza ambos porcentajes.
- [ ] Las Sesiones libres y las iniciadas directamente desde Rutinas no alteran el progreso del Plan.
- [ ] En móvil los bloques forman el inicio del recorrido vertical; en escritorio entrenamiento y Plan comparten la primera fila sin cambiar su contenido.
- [ ] Estados vacíos, barras y acciones usan texto, unidad e indicadores accesibles además del color.
- [ ] Las pruebas HTTP integradas cubren cada prioridad de acción, semanas, redondeo y cambios de progreso después de omitir, finalizar o eliminar.
