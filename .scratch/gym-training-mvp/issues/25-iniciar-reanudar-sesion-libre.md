# 25 — Iniciar y reanudar una Sesión libre

**What to build:** El primer flujo de entrenamiento real: comenzar una Sesión sin origen, mantener una única Sesión activa y volver a ella desde cualquier área después de recargar o cerrar el navegador.

**Blocked by:** 19 — Gestionar Ejercicios personalizados.

**Status:** resolved

- [x] “Iniciar Sesión libre” crea atómicamente una Sesión activa sin origen y abre su pantalla completa sin confirmación intermedia.
- [x] La pantalla vacía abre inmediatamente el selector combinado de Ejercicios disponibles para añadir el primero.
- [x] Cada Cuenta puede tener una sola Sesión activa; un segundo intento devuelve conflicto con la identidad de la existente y la interfaz la abre.
- [x] La Sesión activa contiene una revisión entera y todas sus entidades privadas pertenecen a la Cuenta autenticada.
- [x] `GET /api/sessions/active` devuelve todo el estado confirmado o una ausencia inequívoca, sin aceptar identificadores de Cuenta del cliente.
- [x] Recargar o cerrar el navegador y volver a entrar recupera la Sesión activa y el último Ejercicio confirmado utilizado.
- [x] El AppShell muestra en móvil y escritorio un acceso persistente con nombre, progreso y “Continuar”; la pantalla de Sesión oculta navegación competidora.
- [x] La cabecera propia muestra Origen de sesión libre y el estado de guardado, aunque todavía no existan resultados.
- [x] Las pruebas HTTP integradas cubren unicidad transaccional, reanudación, conflicto recuperable y aislamiento entre dos Cuentas.

## Answer

Implementado en `877ca04` con reporte de intento en `2e9a15f`. El backend añade el agregado de Sesión libre con unicidad transaccional por Cuenta, `GET /api/sessions/active`, sustitución con revisión y aislamiento; el frontend añade la pantalla completa, selector combinado, reanudación, cabecera de guardado y acceso persistente en AppShell e Inicio. La validación coordinadora pasa `bun run typecheck`, `bun run test` y `bun run build`; el seam focalizado pasa 13/13 pruebas HTTP.

## Comments

- Gate coordinadora: `APPROVED`, Standards y Spec sin hallazgos bloqueantes, 0 reparaciones.
