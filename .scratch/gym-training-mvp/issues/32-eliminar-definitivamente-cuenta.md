# 32 — Eliminar definitivamente una Cuenta

**What to build:** La eliminación irreversible y transaccional de la Cuenta autenticada, sus credenciales, sesiones y todos sus datos privados.

**Blocked by:** 17 — Recuperar credenciales y controlar sesiones; 20 — Mantener RM registrados; 23 — Gestionar el ciclo de vida completo de un Plan; 29 — Consultar y corregir el Historial.

**Status:** resolved

**Parallelizable with:** 30 — Preparar la acción diaria y el progreso del Plan; 31 — Preparar la analítica del dashboard; 33 — Componer el contrato API del dashboard.

**Owns:** Cuenta, autenticación, persistencia de datos privados y la pantalla de Cuenta.
No modifica `back/src/dashboard/**`, `HomePage.tsx` ni el contrato de `GET /api/dashboard`.

- [x] La acción está disponible en Cuenta, exige volver a introducir la contraseña y presenta una advertencia explícita que debe confirmarse.
- [x] Una contraseña incorrecta o una confirmación ausente no elimina ni modifica ningún dato.
- [x] Una única transacción elimina credenciales, sesiones, Rutinas, Planes, Sesiones, Ejercicios personalizados y RM registrados de la Cuenta.
- [x] Los Ejercicios compartidos del catálogo y los datos privados de otras Cuentas permanecen intactos.
- [x] Un fallo en cualquier parte revierte la transacción completa y conserva la Cuenta utilizable.
- [x] Tras completar la eliminación se revocan todas las sesiones, se elimina la cookie local y cualquier acceso posterior exige registrar otra Cuenta.
- [x] No existe periodo de gracia, restauración, borrado diferido ni conservación de analítica anonimizada dentro del MVP.
- [x] La interfaz comunica el carácter irreversible mediante texto y no depende únicamente del color; evita dobles envíos mientras la operación está en curso.
- [x] Las pruebas HTTP integradas crean datos de todos los agregados privados, eliminan la Cuenta y demuestran su ausencia, el rollback ante error y la preservación de otras Cuentas y del catálogo.

## Answer

Implementado y aprobado en la rama `feature/ticket-32`. La eliminación transaccional de la Cuenta cubre credenciales, sesiones y datos privados, con rollback, aislamiento y la pantalla de confirmación irreversible.

Commits: `131c6e9`, `5392a2d`, `f907d65`, `14b0735` (una reparación).

Verificación: typechecks backend y frontend; suites completas con 265 pruebas backend y 135 frontend; `git diff --check`. Standards y Spec: PASS.
