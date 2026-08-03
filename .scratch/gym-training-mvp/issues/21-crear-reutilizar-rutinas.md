# 21 — Crear y reutilizar Rutinas

**What to build:** El flujo completo para que un Deportista organice Ejercicios y Objetivos de serie en Rutinas reutilizables y las retire de usos nuevos sin romper referencias.

**Blocked by:** 19 — Gestionar Ejercicios personalizados.

**Status:** resolved

- [x] Una Cuenta puede listar, crear y obtener Rutinas privadas con nombre, Ejercicios ordenados, Series previstas y Objetivos de serie opcionales.
- [x] Cada Ejercicio de la Rutina respeta la Forma de registro publicada y la cardinalidad de Series correspondiente, incluido cardio continuo con una Serie por aparición.
- [x] Carga, repeticiones y duración pueden omitirse de manera independiente como objetivos y, cuando existen, cumplen sus límites de dominio.
- [x] La edición sustituye el agregado completo, conserva los identificadores de hijos existentes y asigna identidad a los nuevos.
- [x] Rutinas incluyen una revisión entera; una edición con revisión obsoleta devuelve conflicto y no mezcla ni sobrescribe cambios.
- [x] Archivar retira una Rutina de usos nuevos y restaurar la recupera con la misma identidad y contenido.
- [x] Los Ejercicios no disponibles siguen apareciendo dentro de una Rutina existente, pero no pueden seleccionarse para nuevos usos.
- [x] Los listados se devuelven completos y la interfaz permite crear, ordenar, editar, archivar y restaurar con confirmaciones accesibles.
- [x] Las pruebas HTTP integradas cubren validación del agregado, concurrencia optimista, archivo y aislamiento entre Cuentas.

## Answer

Implementado en `3424b28` y reparado en `99b8fa8`. El agregado de Rutinas, su API REST, migración Drizzle, editor React, archivo/restauración, validación por Forma de registro, aislamiento por Cuenta y concurrencia optimista quedaron completados.

Verificación actual sobre `main`: `bun run typecheck`, `bun run test` (130 pruebas backend y 80 frontend), y `bun run build` pasan correctamente. La reparación añade la protección CAS atómica para que una revisión obsoleta reciba `409` sin mezclar ni sobrescribir hijos.
