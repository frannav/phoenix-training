# 19 — Gestionar Ejercicios personalizados

**What to build:** Un flujo único de Ejercicios donde cada Deportista pueda crear y mantener movimientos privados junto al catálogo compartido sin exponerlos a otras Cuentas.

**Blocked by:** 18 — Explorar el catálogo revisado de Ejercicios.

**Status:** resolved

- [x] Una Cuenta puede crear un Ejercicio personalizado con identidad opaca, nombre, instrucciones, Forma de registro y taxonomía necesaria.
- [x] La Cuenta propietaria puede renombrar y editar los datos compatibles de su Ejercicio personalizado.
- [x] La Forma de registro deja de ser editable después de publicar o utilizar el Ejercicio; una corrección incompatible se resuelve creando otro Ejercicio.
- [x] Archivar retira el Ejercicio de usos nuevos y restaurar vuelve a ofrecerlo sin cambiar su identidad.
- [x] Los listados y selectores combinan catálogo y personalizados disponibles, marcan la procedencia y no crean flujos separados.
- [x] Un Ejercicio archivado o no disponible sigue resolviendo cualquier referencia existente.
- [x] Leer o mutar un Ejercicio personalizado ajeno responde como recurso inexistente y no permite inferir sus datos.
- [x] La edición usa respuestas canónicas y presenta validaciones y confirmaciones accesibles en móvil y escritorio.
- [x] Las pruebas HTTP integradas demuestran creación, edición, archivo, restauración, referencias conservadas y aislamiento estricto entre dos Cuentas.

## Answer

Implementado y validado en `229a0de` con la reparación `484a388`. El informe
`.scratch/gym-training-mvp/orchestration/19/attempt-2.md` confirma typecheck,
suite completa y build correctos; queda resuelto como dependencia del ticket 21.
