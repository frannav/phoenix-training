# 23 — Gestionar el ciclo de vida completo de un Plan

**What to build:** La activación atómica de un Plan sobre el calendario, la edición controlada de lo que todavía está pendiente y las acciones explícitas para omitir, completar y duplicar Planes sin romper su histórico.

**Blocked by:** 22 — Diseñar Planes borrador.

**Status:** ready-for-agent

**Merged issue:** 24 — Omitir, completar y duplicar Planes.

- [ ] Activar un Plan exige elegir el lunes de su primera semana y calcula todas las Fechas previstas sin cambiar su estructura.
- [ ] La activación convierte atómicamente todos los Entrenamientos planificados en pendientes y el Plan en activo.
- [ ] Una Cuenta puede tener como máximo un Plan activo; intentar activar otro devuelve un conflicto de transición sin cambios parciales.
- [ ] Un Plan activo permite cambiar su nombre y añadir, eliminar, mover o cambiar el contenido de Entrenamientos planificados pendientes.
- [ ] Ninguna edición desplaza automáticamente el resto del calendario ni modifica días que ya no estén pendientes.
- [ ] Las referencias vivas a Rutinas muestran y utilizan su contenido actual, incluso después de activar el Plan.
- [ ] Un Entrenamiento planificado pendiente puede marcarse como omitido mediante una acción explícita y confirmación.
- [ ] Un Entrenamiento omitido puede volver a pendiente mientras el Plan siga activo y entonces recuperar sus posibilidades de edición.
- [ ] Completar un Plan es una acción explícita que convierte atómicamente todos sus Entrenamientos pendientes en omitidos.
- [ ] Un Plan completado cierra estructura y calendario, no puede reactivarse y no permite devolver días omitidos a pendientes desde la interfaz del Plan.
- [ ] La interfaz distingue claramente Planes borrador, activos y completados y no ofrece transiciones inexistentes como pausar, cancelar o archivar.
- [ ] Cualquier Plan puede duplicarse como borrador sin fechas, estados ni Sesiones, conservando referencias a Rutinas y copiando independientemente los Entrenamientos específicos.
- [ ] Un Plan activo y sus Fechas previstas se presentan en móvil y escritorio sin confundirlas con Fechas realizadas.
- [ ] Activar, sustituir, omitir, devolver a pendiente, completar y duplicar aplica una única transacción y devuelve el estado canónico sin cambios parciales.
- [ ] Todas las sustituciones y acciones respetan propiedad y revisión; un recurso ajeno parece inexistente y una revisión obsoleta o transición imposible usa el error común con estado `409`.
- [ ] Las pruebas HTTP integradas cubren cálculo de fechas, activación única, edición permitida y prohibida, cada transición, el cierre de pendientes, la imposibilidad de reactivar, la semántica exacta de duplicación, transacción e aislamiento entre Cuentas.
