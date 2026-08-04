# 29 — Consultar y corregir el Historial

**What to build:** Un Historial donde el Deportista pueda revisar, corregir o eliminar Sesiones finalizadas y observar inmediatamente las consecuencias sobre su Plan.

**Blocked by:** 28 — Iniciar Sesiones desde Rutinas y Planes.

**Status:** resolved

- [x] Historial lista Sesiones finalizadas mediante cursor opaco, límite máximo de 50 y filtros explícitos, y permite abrir su detalle.
- [x] El detalle conserva Origen de sesión, Fecha prevista cuando exista, Fecha realizada, objetivos, resultados, RPE y procedencia de Series.
- [x] Una corrección puede editar Objetivos, Resultados, RPE y Fecha realizada; cambiar una Serie entre completada y omitida; y añadir una Serie con resultado completo.
- [x] Una Serie prevista nunca se elimina individualmente; una Serie añadida sí puede eliminarse con confirmación.
- [x] Una Sesión finalizada nunca admite Series pendientes ni puede quedar sin al menos una Serie completada.
- [x] Cada corrección sustituye el agregado completo en una transacción, respeta revisión y devuelve la representación canónica.
- [x] Eliminar una Sesión exige confirmación y devuelve su Entrenamiento planificado a pendiente; si el Plan estaba completado, conserva ese estado y no permite iniciar otra Sesión desde el día.
- [x] Corregir la Fecha realizada no mueve la Fecha prevista y eliminar una Sesión libre o iniciada desde Rutina no altera ningún Plan.
- [x] Un conflicto carga la versión vigente sin fusionar cambios y un Historial ajeno se comporta como inexistente.
- [x] Las pruebas HTTP integradas cubren todas las correcciones válidas e inválidas, eliminación, efectos en Planes activos y completados y aislamiento entre Cuentas.

## Answer

Implementado en `main` y validado mediante la API HTTP integrada. El Historial incorpora listado paginado con cursor opaco, límite 50, filtros y detalle; permite corregir Sesiones finalizadas con invariantes de Series, revisión optimista y respuesta canónica; y permite eliminarlas con las transiciones correctas de Planes activos y completados. Los conflictos 409 incluyen la versión canónica vigente sin aplicar el payload obsoleto y las Sesiones activas no admiten corregir `datePerformed`.

Commits: `7d46dc1`, `04d4ed6`, con sus reportes `d218d95` y `be77ccf`.

Verificación: `bun run typecheck`; `bun test back/test/sessions.test.ts` (86 pruebas); `bun run test` (258 pruebas backend y 128 frontend). Standards y Spec: PASS.
