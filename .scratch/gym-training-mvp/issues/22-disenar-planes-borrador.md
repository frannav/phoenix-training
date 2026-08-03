# 22 — Diseñar Planes borrador

**What to build:** Un editor de Planes borrador con semanas y Entrenamientos planificados basados en Rutinas vivas o en contenido específico independiente.

**Blocked by:** 21 — Crear y reutilizar Rutinas.

**Status:** resolved

- [x] Una Cuenta puede listar, crear y obtener Planes borrador privados con nombre, una o más semanas y al menos un Entrenamiento planificado.
- [x] Cada Entrenamiento planificado ocupa un día concreto de una semana y contiene una referencia viva a una Rutina o un Entrenamiento específico independiente.
- [x] Un borrador no tiene Fechas previstas ni afecta al calendario del Deportista.
- [x] “Personalizar solo este día” toma el contenido actual de una Rutina y lo convierte en contenido independiente que deja de seguir cambios posteriores.
- [x] El editor permite añadir, eliminar, mover, reordenar y modificar libremente los Entrenamientos planificados del borrador.
- [x] El guardado sustituye el agregado completo en una transacción, conserva identidades existentes y devuelve el documento canónico con revisión incrementada.
- [x] Una revisión obsoleta devuelve conflicto y la interfaz carga el Plan vigente sin fusionar cambios silenciosamente.
- [x] Eliminar un borrador exige confirmación y no elimina las Rutinas o Ejercicios que referencia.
- [x] Las pruebas HTTP integradas demuestran referencia viva, independencia tras personalizar, validación, eliminación y aislamiento entre Cuentas.

## Answer

Implementado en `b360628` (merge de `6add71d`). El agregado de Planes borrador,
su API REST, migración Drizzle, editor React, referencias vivas a Rutinas,
personalización independiente, concurrencia optimista, eliminación protegida y
aislamiento entre Cuentas quedaron completados.

Verificación del intento: `bun run typecheck` pasa; `bun test --cwd back`
registra 149 pruebas pasadas; y `bun run --cwd front test` registra 85 pruebas
pasadas. Las pruebas HTTP integradas cubren los nueve criterios del ticket y
las pruebas de interfaz cubren creación, edición, personalización,
eliminación y conflictos de revisión.
