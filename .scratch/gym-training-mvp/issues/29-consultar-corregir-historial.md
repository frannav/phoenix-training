# 29 — Consultar y corregir el Historial

**What to build:** Un Historial donde el Deportista pueda revisar, corregir o eliminar Sesiones finalizadas y observar inmediatamente las consecuencias sobre su Plan.

**Blocked by:** 28 — Iniciar Sesiones desde Rutinas y Planes.

**Status:** ready-for-agent

- [ ] Historial lista Sesiones finalizadas mediante cursor opaco, límite máximo de 50 y filtros explícitos, y permite abrir su detalle.
- [ ] El detalle conserva Origen de sesión, Fecha prevista cuando exista, Fecha realizada, objetivos, resultados, RPE y procedencia de Series.
- [ ] Una corrección puede editar Objetivos, Resultados, RPE y Fecha realizada; cambiar una Serie entre completada y omitida; y añadir una Serie con resultado completo.
- [ ] Una Serie prevista nunca se elimina individualmente; una Serie añadida sí puede eliminarse con confirmación.
- [ ] Una Sesión finalizada nunca admite Series pendientes ni puede quedar sin al menos una Serie completada.
- [ ] Cada corrección sustituye el agregado completo en una transacción, respeta revisión y devuelve la representación canónica.
- [ ] Eliminar una Sesión exige confirmación y devuelve su Entrenamiento planificado a pendiente; si el Plan estaba completado, conserva ese estado y no permite iniciar otra Sesión desde el día.
- [ ] Corregir la Fecha realizada no mueve la Fecha prevista y eliminar una Sesión libre o iniciada desde Rutina no altera ningún Plan.
- [ ] Un conflicto carga la versión vigente sin fusionar cambios y un Historial ajeno se comporta como inexistente.
- [ ] Las pruebas HTTP integradas cubren todas las correcciones válidas e inválidas, eliminación, efectos en Planes activos y completados y aislamiento entre Cuentas.
