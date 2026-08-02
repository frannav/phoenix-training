# 24 — Omitir, completar y duplicar Planes

**What to build:** Las acciones explícitas con las que un Deportista resuelve días pendientes, cierra un Plan activo y reutiliza cualquier Plan como un nuevo borrador.

**Blocked by:** 23 — Activar y adaptar un Plan.

**Status:** ready-for-agent

- [ ] Un Entrenamiento planificado pendiente puede marcarse como omitido mediante una acción explícita y confirmación.
- [ ] Un Entrenamiento omitido puede volver a pendiente mientras el Plan siga activo y entonces recuperar sus posibilidades de edición.
- [ ] Completar un Plan es una acción explícita que convierte atómicamente todos sus Entrenamientos pendientes en omitidos.
- [ ] Un Plan completado cierra estructura y calendario, no puede reactivarse y no permite devolver días omitidos a pendientes desde la interfaz del Plan.
- [ ] La interfaz distingue claramente Planes borrador, activos y completados y no ofrece transiciones inexistentes como pausar, cancelar o archivar.
- [ ] Cualquier Plan puede duplicarse como borrador sin fechas, estados ni Sesiones, conservando referencias a Rutinas y copiando independientemente los Entrenamientos específicos.
- [ ] Completar, omitir, restaurar o duplicar aplica una única transacción y devuelve el estado canónico sin cambios parciales.
- [ ] Las acciones respetan propiedad y revisión; un recurso ajeno parece inexistente y una transición obsoleta devuelve conflicto.
- [ ] Las pruebas HTTP integradas cubren cada transición, el cierre de pendientes, la imposibilidad de reactivar y la semántica exacta de duplicación.
