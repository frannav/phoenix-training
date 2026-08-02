# 21 — Crear y reutilizar Rutinas

**What to build:** El flujo completo para que un Deportista organice Ejercicios y Objetivos de serie en Rutinas reutilizables y las retire de usos nuevos sin romper referencias.

**Blocked by:** 19 — Gestionar Ejercicios personalizados.

**Status:** ready-for-agent

- [ ] Una Cuenta puede listar, crear y obtener Rutinas privadas con nombre, Ejercicios ordenados, Series previstas y Objetivos de serie opcionales.
- [ ] Cada Ejercicio de la Rutina respeta la Forma de registro publicada y la cardinalidad de Series correspondiente, incluido cardio continuo con una Serie por aparición.
- [ ] Carga, repeticiones y duración pueden omitirse de manera independiente como objetivos y, cuando existen, cumplen sus límites de dominio.
- [ ] La edición sustituye el agregado completo, conserva los identificadores de hijos existentes y asigna identidad a los nuevos.
- [ ] Rutinas incluyen una revisión entera; una edición con revisión obsoleta devuelve conflicto y no mezcla ni sobrescribe cambios.
- [ ] Archivar retira una Rutina de usos nuevos y restaurar la recupera con la misma identidad y contenido.
- [ ] Los Ejercicios no disponibles siguen apareciendo dentro de una Rutina existente, pero no pueden seleccionarse para nuevos usos.
- [ ] Los listados se devuelven completos y la interfaz permite crear, ordenar, editar, archivar y restaurar con confirmaciones accesibles.
- [ ] Las pruebas HTTP integradas cubren validación del agregado, concurrencia optimista, archivo y aislamiento entre Cuentas.
