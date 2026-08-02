# 23 — Activar y adaptar un Plan

**What to build:** La activación atómica de un Plan sobre el calendario y la edición controlada de lo que todavía está pendiente mientras sea el único Plan activo.

**Blocked by:** 22 — Diseñar Planes borrador.

**Status:** ready-for-agent

- [ ] Activar un Plan exige elegir el lunes de su primera semana y calcula todas las Fechas previstas sin cambiar su estructura.
- [ ] La activación convierte atómicamente todos los Entrenamientos planificados en pendientes y el Plan en activo.
- [ ] Una Cuenta puede tener como máximo un Plan activo; intentar activar otro devuelve un conflicto de transición sin cambios parciales.
- [ ] Un Plan activo permite cambiar su nombre y añadir, eliminar, mover o cambiar el contenido de Entrenamientos planificados pendientes.
- [ ] Ninguna edición desplaza automáticamente el resto del calendario ni modifica días que ya no estén pendientes.
- [ ] Las referencias vivas a Rutinas muestran y utilizan su contenido actual, incluso después de activar el Plan.
- [ ] Un Plan activo y sus Fechas previstas se presentan en móvil y escritorio sin confundirlas con Fechas realizadas.
- [ ] Todas las sustituciones respetan la revisión del agregado y una transición imposible usa el error común con estado `409`.
- [ ] Las pruebas HTTP integradas cubren cálculo de fechas, activación única, edición permitida y prohibida, transacción e aislamiento entre Cuentas.
