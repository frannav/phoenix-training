# 25 — Iniciar y reanudar una Sesión libre

**What to build:** El primer flujo de entrenamiento real: comenzar una Sesión sin origen, mantener una única Sesión activa y volver a ella desde cualquier área después de recargar o cerrar el navegador.

**Blocked by:** 19 — Gestionar Ejercicios personalizados.

**Status:** ready-for-agent

- [ ] “Iniciar Sesión libre” crea atómicamente una Sesión activa sin origen y abre su pantalla completa sin confirmación intermedia.
- [ ] La pantalla vacía abre inmediatamente el selector combinado de Ejercicios disponibles para añadir el primero.
- [ ] Cada Cuenta puede tener una sola Sesión activa; un segundo intento devuelve conflicto con la identidad de la existente y la interfaz la abre.
- [ ] La Sesión activa contiene una revisión entera y todas sus entidades privadas pertenecen a la Cuenta autenticada.
- [ ] `GET /api/sessions/active` devuelve todo el estado confirmado o una ausencia inequívoca, sin aceptar identificadores de Cuenta del cliente.
- [ ] Recargar o cerrar el navegador y volver a entrar recupera la Sesión activa y el último Ejercicio confirmado utilizado.
- [ ] El AppShell muestra en móvil y escritorio un acceso persistente con nombre, progreso y “Continuar”; la pantalla de Sesión oculta navegación competidora.
- [ ] La cabecera propia muestra Origen de sesión libre y el estado de guardado, aunque todavía no existan resultados.
- [ ] Las pruebas HTTP integradas cubren unicidad transaccional, reanudación, conflicto recuperable y aislamiento entre dos Cuentas.
