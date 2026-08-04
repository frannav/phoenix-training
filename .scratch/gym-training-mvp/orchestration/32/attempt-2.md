# Reporte del intento 2 — ticket 32 «Eliminar definitivamente una Cuenta»

**Estado:** reparado (listo para la revisión definitiva del coordinador).
**Commit de la reparación:** `f907d65` — `fix(cuenta): reabrir la eliminación exige volver a introducir la contraseña y confirmar (ticket 32)`.
**Fixed point:** `1e87844f9ab3329108dbcccd8a476c6b24607ae7`.
**Base del intento 1:** `131c6e9` (implementación) + `5392a2d` (reporte del intento 1).

## Rutas autoradas en este intento

- `front/src/features/account/pages/AccountPage.tsx` (modificado): al abrir el diálogo
  de eliminación y al cancelar se restablecen la contraseña y la confirmación, de modo
  que cada apertura exige volver a introducirlas.
- `front/src/features/account/pages/AccountPage.test.tsx` (modificado): prueba de
  regresión en el seam aprobado.
- `.scratch/gym-training-mvp/orchestration/32/attempt-2.md` (este reporte).

Ningún otro archivo cambió: la rama partía limpia y el commit `f907d65` solo contiene
las dos rutas de código.

## Hallazgo bloqueante y su resolución

### Cancelar y reabrir la eliminación conservaba la contraseña y la confirmación

**Evidencia del bloqueo:** en el intento 1, `AccountPage.tsx` mantenía `deletePassword`
y `deleteConfirmed` en estado local sin restablecerlos: «Cancelar» solo hacía
`setConfirmingDelete(false)` y el botón «Eliminar mi cuenta» solo abría el diálogo.
Un usuario que escribía la contraseña y marcaba la casilla, cancelaba y volvía a abrir
el diálogo encontraba la contraseña precargada y la confirmación marcada, con el botón
«Eliminar mi cuenta definitivamente» ya habilitado sin volver a introducir nada. La
rúbrica del ticket exige que la acción «exige volver a introducir la contraseña y
presenta una advertencia explícita que debe confirmarse»: cada apertura del diálogo
debe exigir una contraseña y una confirmación frescas.

**Resolución aplicada:**
- Al abrir el diálogo (clic en «Eliminar mi cuenta»): `setDeletePassword("")` y
  `setDeleteConfirmed(false)` además de limpiar los errores, de modo que cada apertura
  empieza en blanco.
- Al cancelar: se restablecen también `deletePassword`, `deleteConfirmed`,
  `deletePasswordError` y `deleteError` antes de cerrar, de modo que cancelar y reabrir
  no deja rastro de la sesión anterior.

No se toca el backend: el contrato `DELETE /api/account` ya exigía `{ password,
confirmed: true }` en cada petición; el defecto era solo de estado de la pantalla.

**Prueba de regresión añadida:** «al cancelar y reabrir, la eliminación exige volver a
introducir la contraseña y confirmar» — escribe la contraseña, marca la casilla y
comprueba el botón habilitado; pulsa «Cancelar» y comprueba que el diálogo se cierra;
reabre y asevera contraseña vacía, casilla sin marcar y botón deshabilitado.

## TDD por rebanadas verticales en el seam aprobado

Seam aprobado y reutilizado: `front/src/features/account/pages/AccountPage.test.tsx`
(tests de comportamiento de la pantalla de Cuenta con Testing Library y user-event). No
se pidió ningún seam nuevo.

1. **Rojo (verificado contra la base del intento 1, `5392a2d`):** la prueba de
   regresión, ejecutada sobre el código previo a la reparación en un worktree
   desechable, falla: tras cancelar y reabrir, el campo de contraseña conserva su
   valor («Expected the element to have value: / Received: …»). 1 fallo / 9 verdes.
2. **Verde (commit `f907d65`):** la misma prueba pasa en `feature/ticket-32`
   (10/10 en `AccountPage.test.tsx`) sin cambiar ninguna expectativa ni ninguna otra
   prueba.

## Verificaciones

- `bun run --filter @phoenix-training/front typecheck` (`tsc --noEmit`): **PASS, 0 errores.**
- `bun run --filter @phoenix-training/back typecheck`: **PASS, 0 errores** (señal; el backend no cambió en este intento).
- `bunx vitest run src/features/account/pages/AccountPage.test.tsx`: **10 pass / 0 fail** (9 previas + 1 de regresión).
- `bunx vitest run src/features/account/pages/AccountPage.test.tsx src/features/auth/pages/LoginPage.test.tsx`: **18 pass / 0 fail** (17 del intento 1 + 1 de regresión).
- La validación completa (suite back y suite front completa) pertenece al coordinador.

## Autorevisión (skill code-review)

**Limitación del runtime:** el skill `code-review` lanza dos subagentes
`general-purpose` en paralelo mediante una herramienta `Agent`; este runtime de Pi no
la expone (misma limitación que en los intentos anteriores). La revisión de ambos ejes
se hizo manualmente en el mismo contexto, sobre el diff `5392a2d..HEAD` (la
reparación). El coordinador conserva la revisión definitiva.

### Eje Standards

- El cambio sigue el estilo del archivo: resets de estado junto a los demás `set…` de
  apertura/cierre, sin nuevas abstracciones y sin duplicación (los dos resets son los
  únicos puntos que abren y cierran el diálogo).
- Sin olores nuevos del baseline: sin Speculative Generality (solo se restablecen los
  dos campos que el ticket exige reintroducir), sin Duplicated Code, nombres
  autoexplicativos.
- El contrato HTTP y el backend no se tocan; el defecto era exclusivamente de estado de
  la pantalla.

### Eje Spec

- Rúbrica 1 («exige volver a introducir la contraseña y presenta una advertencia
  explícita que debe confirmarse»): la reparación garantiza que cada apertura del
  diálogo exige contraseña y confirmación frescas; la prueba de regresión lo asevera.
- Rúbrica 2 (contraseña incorrecta o confirmación ausente no elimina ni modifica
  ningún dato): sin cambios; el backend ya lo garantizaba.
- Sin alcance excedido: no se tocó `back/src/dashboard/**`, `HomePage.tsx` ni el
  contrato de `GET /api/dashboard`; no se añadió ningún seam nuevo.

## Lo que queda

- Nada: no queda trabajo de reparación pendiente. La revisión definitiva del
  coordinador (ejes estándar y especificación) y el cierre del ticket en el rastreador.
