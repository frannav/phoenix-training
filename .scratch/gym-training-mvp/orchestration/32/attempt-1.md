# Attempt 1 — Ticket 32: Eliminar definitivamente una Cuenta

- **Ticket:** `.scratch/gym-training-mvp/issues/32-eliminar-definitivamente-cuenta.md`
- **Spec:** `.scratch/gym-training-mvp/spec.md`
- **Fixed point:** `1e87844f9ab3329108dbcccd8a476c6b24607ae7`
- **Branch:** `feature/ticket-32`
- **Commit:** `131c6e9` — «feat(cuenta): eliminar definitivamente la Cuenta con sus datos privados (ticket 32)»
- **Estado:** succeeded (la revisión definitiva la conserva el coordinador)

## Qué se construyó

El contrato HTTP de eliminación definitiva de la Cuenta, con su pantalla de
Cuenta, según los seams aprobados (API integrada en `back/test/account-deletion.test.ts` y
comportamiento de la pantalla en `front/src/features/account/pages/AccountPage.test.tsx`):

1. **`DELETE /api/account`** (backend, módulo nuevo `back/src/account/`). Exige la
   Cuenta autenticada (la sesión se obtiene del sistema de autenticación, nunca
   del cliente) y un cuerpo `{ password, confirmed }` validado con Zod `.strict()`:
   la contraseña actual debe volver a introducirse y la confirmación debe ser
   explícita (`confirmed: true`). El caso de uso `deleteAccount` abre una única
   transacción que verifica la contraseña contra las credenciales (`account`,
   proveedor `credential`, con `verifyPassword` de Better Auth) y borra en orden
   de dependencia Sesiones (Series, apariciones, Sesión), Planes (Objetivos,
   Ejercicios, Entrenamientos, semanas, Plan), Rutinas (Objetivos, Ejercicios,
   Rutina), RM registrados, Ejercicios personalizados y, por último, la fila de
   la Cuenta (cuya cascada elimina credenciales, sesiones de autenticación y
   enlaces). El orden importa: varias referencias del dominio usan
   `ON DELETE no action` (p. ej. `plan_training.routine_id`,
   `training_session.last_exercise_id`), así que apoyarse solo en la cascada
   fallaría según el orden de propagación. Tras el borrado, la respuesta expira
   la cookie local de sesión reutilizando el cierre de sesión de Better Auth
   (`clearSessionCookie`), de modo que el navegador no conserva una sesión muerta.
2. **Pantalla de Cuenta** (frontend). Nueva sección «Eliminar cuenta» que pide
   volver a introducir la contraseña y marca una casilla de confirmación tras una
   advertencia explícita por texto («Esta acción es definitiva e irreversible…
   No existe periodo de gracia, restauración ni borrado diferido»). El botón de
   confirmación queda deshabilitado sin contraseña o sin confirmación y mientras
   la operación está en curso («Eliminando…», sin dobles envíos). Un error de
   contraseña se muestra junto al campo. Al completarse, limpia la caché de la
   sesión y navega a `/entrar?estado=cuenta-eliminada`, donde la entrada explica
   que la Cuenta se eliminó y ofrece crear una Cuenta nueva. `apiDelete` del
   cliente HTTP compartido admite ahora un cuerpo opcional.

## Evidencia TDD por seam (rojo → verde)

Seams aprobados: **API HTTP integrada contra SQLite temporal con las migraciones
de producción** (`back/test/account-deletion.test.ts`, nuevo) y **tests de
comportamiento de la pantalla de Cuenta** (`AccountPage.test.tsx`, extendido). La
eliminación es una funcionalidad cohesiva de un solo slice (módulo, router,
montaje, pantalla): el rojo se escribió completo (7 pruebas de API y 6 de
interfaz) y el verde las pasó sin cambiar ninguna expectativa.

### Backend — `back/test/account-deletion.test.ts` (7 pruebas, rojo → verde)

- la acción exige una Cuenta autenticada → 401 sin cookie. **Rojo:** 404 (ruta
  inexistente) → **verde:** middleware de autenticación del router.
- una contraseña o una confirmación ausente no elimina ni modifica ningún dato:
  cuerpos `{}`, sin `confirmed`, contraseña vacía y `confirmed: false` responden
  400 `VALIDATION_ERROR`; después la sesión sigue válida y el Ejercicio
  personalizado sigue listándose. **Rojo:** 404 → **verde:** esquema `.strict()`.
- una contraseña incorrecta no elimina ni modifica ningún dato → 400
  `INVALID_PASSWORD`; sesión válida, datos intactos y la Cuenta sigue entrando.
  **Rojo:** 404 → **verde:** verificación de contraseña en el caso de uso.
- una única operación elimina credenciales, sesiones y todos los datos privados:
  crea por la API Ejercicio personalizado, RM, Rutina, Plan activo, Sesión
  finalizada y Sesión activa; borra con contraseña correcta y confirmación →
  200 `{ status: true }`; la respuesta expira la cookie (`Max-Age=0`); la sesión
  revocada ya no existe; las rutas del dominio responden 401; la entrada con las
  credenciales viejas responde 401 y el mismo correo puede registrarse de nuevo.
- la eliminación revoca también las demás sesiones de la Cuenta: dos dispositivos
  y ambas cookies quedan inválidas.
- los Ejercicios del catálogo y los datos privados de otra Cuenta permanecen
  intactos: la Cuenta B conserva su sesión, su Ejercicio personalizado, su RM y
  el catálogo listable; la Cuenta A queda eliminada.
- un fallo en cualquier parte revierte la transacción y conserva la Cuenta
  utilizable: se inyecta un fallo con un `BEFORE DELETE` trigger sobre
  `training_session` (aborta después de borrar Series y apariciones); la
  operación responde 500 y, al retirar el trigger, la Cuenta conserva sesión,
  Rutina, Plan, Historial, Ejercicio personalizado, RM y puede entrar; una
  segunda llamada con el fallo reparado completa la eliminación. La inyección de
  fallo es un mecanismo de test (SQL directo); el comportamiento se verifica por
  el seam HTTP.

### Frontend — `AccountPage.test.tsx` (5 pruebas nuevas) y `LoginPage.test.tsx` (1)

- ofrece eliminar la Cuenta tras una advertencia explícita e irreversible
  (texto «irreversible», «definitiva» y «no existe periodo de gracia»).
- exige la contraseña y la confirmación antes de permitir la eliminación (botón
  deshabilitado hasta escribir la contraseña y marcar la casilla).
- elimina la Cuenta con la contraseña y la confirmación y devuelve a la entrada;
  verifica que el cuerpo enviado es `{ password, confirmed: true }` con `DELETE`.
- una contraseña incorrecta muestra el error junto al campo y no elimina.
- evita dobles envíos mientras la operación está en curso (petición pendiente:
  «Eliminando…» deshabilitado, Cancelar deshabilitado).
- la entrada muestra la confirmación «eliminado definitivamente» y el enlace
  «Crear cuenta» al llegar con `estado=cuenta-eliminada`.

## Comprobaciones

- `bun run --filter @phoenix-training/back typecheck`: **0 errores.**
- `bun run --filter @phoenix-training/front typecheck`: **0 errores.**
- `bun test ./test/account-deletion.test.ts` (back): **7 pass / 0 fail.**
- `bunx vitest run src/features/account/pages/AccountPage.test.tsx src/features/auth/pages/LoginPage.test.tsx`: **17 pass / 0 fail** (11 previas + 6 nuevas).
- Suite completa del backend (señal; la validación definitiva la conserva el
  coordinador): `bun test` en `back/` → **265 pass / 0 fail** (258 previas + 7
  nuevas).
- Suite completa del frontend (señal): `bunx vitest run` → **134 pass / 0 fail**
  (128 previas + 6 nuevas).

## Autorevisión (dos ejes; el coordinador conserva la revisión definitiva)

El skill `code-review` lanza dos subagentes `general-purpose` en paralelo; este
runtime de trabajador no expone la herramienta `Agent`, así que se hizo una
autorevisión manual de dos ejes. Limitación reportada: sin subagentes paralelos
no hay aislamiento de contexto entre ejes.

### Eje estándar

Sigue las convenciones documentadas del repositorio (spec «Arquitectura del
backend» y «API y concurrencia»): Zod `.strict()` en el límite HTTP, reglas
dependientes de estado (verificación de contraseña) en el caso de uso, una
transacción por escritura, Drizzle como única capa de acceso, filtrado por la
Cuenta autenticada sin identificadores del cliente, error canónico
`{ error: { code, message, fields? } }` (400 `VALIDATION_ERROR`, 401
`UNAUTHORIZED`, 400 `INVALID_PASSWORD`, 500 `INTERNAL_ERROR` sin detalle), y
vocabulario del dominio en español. Se reutilizó el patrón del módulo existente:
middleware de autenticación por prefijo, inyección de dependencias del router
(`authenticatedUserId`, `clearSessionCookie`), y la duplicación deliberada y
preexistente del helper `validationError` por router. Sin olores nuevos del
baseline: `clearSessionCookie` evita que el router conozca Better Auth; el
borrado en orden de dependencia está comentado en el módulo; no hay abstracción
especulativa (el cuerpo `{ password, confirmed }` es exactamente lo que pide la
spec).

### Eje especificación

Las nueve rúbricas del ticket se cubren y prueban: la acción está en Cuenta con
contraseña y advertencia confirmable (frontend + esquema); contraseña incorrecta
o confirmación ausente no tocan ningún dato (pruebas 2 y 3); una única
transacción elimina credenciales, sesiones, Rutinas, Planes, Sesiones, Ejercicios
personalizados y RM (prueba 4 y módulo `deleteAccount`); el catálogo y los datos
de otras Cuentas permanecen (prueba 6); el fallo revierte y conserva la Cuenta
utilizable (prueba 7); se revocan todas las sesiones, se expira la cookie local y
el acceso posterior exige registrar otra Cuenta (pruebas 4 y 5); sin periodo de
gracia ni borrado diferido (no implementado, y la interfaz lo comunica); la
interfaz comunica la irreversibilidad por texto y evita dobles envíos (tests de
pantalla); las pruebas HTTP crean todos los agregados privados y demuestran
ausencia, rollback y preservación (archivo de pruebas). No se tocó
`back/src/dashboard/**`, `HomePage.tsx` ni el contrato de `GET /api/dashboard`.

## Lo que queda

- La revisión definitiva del coordinador (ejes estándar y especificación) y el
  cierre del ticket en el rastreador.
- La cookie de sesión se expira con `Max-Age=0`; no se añadió ningún periodo de
  gracia ni borrado diferido, según la spec.
