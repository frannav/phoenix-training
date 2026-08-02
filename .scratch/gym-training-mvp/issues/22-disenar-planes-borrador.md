# 22 — Diseñar Planes borrador

**What to build:** Un editor de Planes borrador con semanas y Entrenamientos planificados basados en Rutinas vivas o en contenido específico independiente.

**Blocked by:** 21 — Crear y reutilizar Rutinas.

**Status:** ready-for-agent

- [ ] Una Cuenta puede listar, crear y obtener Planes borrador privados con nombre, una o más semanas y al menos un Entrenamiento planificado.
- [ ] Cada Entrenamiento planificado ocupa un día concreto de una semana y contiene una referencia viva a una Rutina o un Entrenamiento específico independiente.
- [ ] Un borrador no tiene Fechas previstas ni afecta al calendario del Deportista.
- [ ] “Personalizar solo este día” toma el contenido actual de una Rutina y lo convierte en contenido independiente que deja de seguir cambios posteriores.
- [ ] El editor permite añadir, eliminar, mover, reordenar y modificar libremente los Entrenamientos planificados del borrador.
- [ ] El guardado sustituye el agregado completo en una transacción, conserva identidades existentes y devuelve el documento canónico con revisión incrementada.
- [ ] Una revisión obsoleta devuelve conflicto y la interfaz carga el Plan vigente sin fusionar cambios silenciosamente.
- [ ] Eliminar un borrador exige confirmación y no elimina las Rutinas o Ejercicios que referencia.
- [ ] Las pruebas HTTP integradas demuestran referencia viva, independencia tras personalizar, validación, eliminación y aislamiento entre Cuentas.
