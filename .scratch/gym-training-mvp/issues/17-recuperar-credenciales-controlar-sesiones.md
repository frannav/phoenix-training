# 17 — Recuperar credenciales y controlar sesiones

**What to build:** Las herramientas de seguridad para recuperar o cambiar la contraseña y revocar una o todas las sesiones de Cuenta desde la interfaz privada.

**Blocked by:** 16 — Registrar, verificar y acceder a una Cuenta.

**Status:** ready-for-agent

- [ ] Solicitar una recuperación devuelve siempre la misma respuesta pública, exista o no una Cuenta verificada para el correo indicado.
- [ ] Una Cuenta verificada recibe un enlace de recuperación de un solo uso válido durante una hora; solicitar otro invalida los anteriores.
- [ ] Una Cuenta pendiente recibe un nuevo enlace de verificación en lugar de entrar en un flujo de recuperación distinto.
- [ ] Un enlace de recuperación válido permite establecer una contraseña de 8 a 128 caracteres y obliga después a iniciar sesión de nuevo.
- [ ] Cambiar la contraseña desde Cuenta exige la contraseña actual y revoca todas las sesiones existentes, incluida la actual.
- [ ] “Cerrar todas las sesiones” revoca todas las sesiones de la Cuenta, incluida la que ejecuta la acción, mientras que “Cerrar sesión” continúa revocando solo la actual.
- [ ] Los enlaces vencidos, usados o sustituidos no cambian credenciales y conducen a una recuperación segura sin exponer detalles internos.
- [ ] Las pantallas de recuperación, restablecimiento y Cuenta ofrecen confirmaciones y feedback accesible para cada resultado.
- [ ] Las pruebas HTTP integradas demuestran revocación entre varios clientes autenticados y que ninguna operación afecta a otra Cuenta.
