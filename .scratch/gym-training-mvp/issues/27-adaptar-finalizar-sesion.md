# 27 — Adaptar y finalizar una Sesión

**What to build:** Las acciones para ajustar una Sesión mientras ocurre, resolver sus Series pendientes y convertirla en un registro finalizado válido o eliminarla expresamente.

**Blocked by:** 26 — Registrar resultados por Serie.

**Status:** resolved

- [x] La Sesión presenta los Ejercicios en una sola columna plegable, mantiene uno desplegado y muestra progreso completado, omitido y pendiente.
- [x] Añadir una Serie crea una Serie añadida pendiente y propone como borrador los valores de la Serie anterior sin persistirlos como resultado.
- [x] Una Serie añadida puede eliminarse; si contiene un resultado, la interfaz exige confirmación.
- [x] Una Serie pendiente puede omitirse directamente; omitir o devolver a pendiente una Serie completada exige confirmación y elimina resultado y RPE.
- [x] Restaurar una Serie omitida como completada exige introducir a la vez un resultado completo.
- [x] Un Ejercicio añadido durante la Sesión puede eliminarse y exige confirmación si alguna de sus Series tiene resultado.
- [x] Finalizar solo es posible con al menos una Serie completada; si quedan pendientes, una confirmación indica cuántas pasarán a omitidas.
- [x] Tras finalizar, la Sesión queda sin Series pendientes, se muestra su resumen y deja de aparecer como activa.
- [x] Eliminar una Sesión activa exige confirmación, elimina el agregado en una transacción y devuelve al Deportista a Inicio.
- [x] Las pruebas HTTP integradas cubren todas las transiciones, pérdida confirmada de resultados, invariantes de finalización, eliminación y concurrencia optimista.

## Answer

Implementado y mergeado en `main` mediante `a3ef302` (PR #6), con la
reparación de restauración de Series y del acordeón incluida en `00085ce`.

Verificación actual: `bun run test` pasa con 210 pruebas de backend y 120 de
frontend.
