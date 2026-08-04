# 30 — Preparar la acción diaria y el progreso del Plan

**What to build:** El modelo de lectura de los dos primeros bloques de Inicio para que el
Deportista sepa qué hacer ahora y cómo avanza su Plan activo. La ruta HTTP y la
interfaz se integran en los tickets 33 y 34.

**Blocked by:** 23 — Gestionar el ciclo de vida completo de un Plan; 28 — Iniciar Sesiones desde Rutinas y Planes.

**Status:** ready-for-agent

**Parallelizable with:** 31 — Preparar la analítica del dashboard; 32 — Eliminar definitivamente una Cuenta.

**Owns:** el servicio/modelo de lectura del estado de Inicio y sus pruebas. No registra
`GET /api/dashboard`, no modifica `HomePage.tsx` ni sus estilos y no cambia el contrato
de composición que usará el ticket 33.

- [ ] El modelo identifica la acción prioritaria: continuar la Sesión activa; si no existe, iniciar el próximo Entrenamiento planificado pendiente; y, si tampoco existe, iniciar una Sesión libre.
- [ ] La acción prioritaria incluye el nombre, el progreso de la Sesión y la referencia necesaria para continuar o iniciar sin que el cliente tenga que reconstruir reglas de dominio.
- [ ] El resumen del Plan activo incluye nombre, semana actual, Entrenamientos realizados y omitidos y progreso por semana y Plan completo.
- [ ] Avance se calcula como `(realizados + omitidos) / total` y cumplimiento como `realizados / total`, con precisión completa antes de redondear al entero de presentación.
- [ ] Un Entrenamiento solo cuenta como realizado cuando su Sesión está finalizada; eliminarla lo devuelve a pendiente y actualiza ambos porcentajes.
- [ ] Las Sesiones libres y las iniciadas directamente desde Rutinas no alteran el progreso del Plan.
- [ ] El modelo lee el estado vigente de Planes y Sesiones en cada consulta, sin cachés ni tablas derivadas.
- [ ] Las pruebas cubren cada prioridad de acción, semanas, redondeo y cambios de progreso después de omitir, finalizar o eliminar.
