# 17 — Recuperar credenciales y controlar sesiones

**What to build:** Las herramientas de seguridad para recuperar o cambiar la contraseña y revocar una o todas las sesiones de Cuenta desde la interfaz privada.

**Blocked by:** 16 — Registrar, verificar y acceder a una Cuenta.

**Status:** resolved

- [x] Solicitar una recuperación devuelve siempre la misma respuesta pública, exista o no una Cuenta verificada para el correo indicado.
- [x] Una Cuenta verificada recibe un enlace de recuperación de un solo uso válido durante una hora; solicitar otro invalida los anteriores.
- [x] Una Cuenta pendiente recibe un nuevo enlace de verificación en lugar de entrar en un flujo de recuperación distinto.
- [x] Un enlace de recuperación válido permite establecer una contraseña de 8 a 128 caracteres y obliga después a iniciar sesión de nuevo.
- [x] Cambiar la contraseña desde Cuenta exige la contraseña actual y revoca todas las sesiones existentes, incluida la actual.
- [x] “Cerrar todas las sesiones” revoca todas las sesiones de la Cuenta, incluida la que ejecuta la acción, mientras que “Cerrar sesión” continúa revocando solo la actual.
- [x] Los enlaces vencidos, usados o sustituidos no cambian credenciales y conducen a una recuperación segura sin exponer detalles internos.
- [x] Las pantallas de recuperación, restablecimiento y Cuenta ofrecen confirmaciones y feedback accesible para cada resultado.
- [x] Las pruebas HTTP integradas demuestran revocación entre varios clientes autenticados y que ninguna operación afecta a otra Cuenta.

## Answer

El backend intercepta la solicitud de recuperación para mantener una respuesta indistinguible, reenviar verificación a Cuentas pendientes y sustituir tokens anteriores. Better Auth aplica el cambio de contraseña y el almacenamiento de credenciales; el borde revoca todas las sesiones y expira la cookie actual. La interfaz añade recuperación, restablecimiento, cambio de contraseña y cierre confirmado de todas las sesiones.

La cobertura integrada incluye tokens vencidos, usados y sustituidos, aislamiento de sesiones entre dispositivos y validación de la interfaz. La suite final pasa con 26 pruebas de backend y 44 de frontend.

## Comments

- Implementado en el commit de esta rama junto con la verificación de typecheck y build.
