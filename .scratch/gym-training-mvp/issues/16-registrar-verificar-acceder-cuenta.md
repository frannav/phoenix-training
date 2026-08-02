# 16 — Registrar, verificar y acceder a una Cuenta

**What to build:** El flujo completo para que un Deportista cree una Cuenta, verifique su correo, inicie sesión y cierre la sesión actual sin revelar la existencia de otras Cuentas.

**Blocked by:** 15 — Establecer la base ejecutable.

**Status:** ready-for-agent

- [ ] El registro público solicita únicamente correo y contraseña, normaliza el correo para identidad y exige una contraseña de 8 a 128 caracteres.
- [ ] Registrar una dirección nueva crea una Cuenta pendiente de verificación y solicita a un adaptador de correo el envío de un enlace de un solo uso válido durante una hora.
- [ ] La respuesta pública no permite distinguir entre un correo nuevo y uno ya registrado.
- [ ] Una Cuenta pendiente puede solicitar otro enlace; el nuevo invalida todos los anteriores y un enlace vencido, usado o sustituido no verifica la Cuenta.
- [ ] Una Cuenta pendiente no puede iniciar sesión ni acceder a datos de entrenamiento; al verificar el correo pasa definitivamente a verificada.
- [ ] Una Cuenta verificada puede iniciar sesión con correo y contraseña, mantener sesiones en varios dispositivos y recibir únicamente una cookie segura.
- [ ] Cerrar sesión revoca la sesión actual y devuelve al Deportista a la entrada sin afectar a otras sesiones de la Cuenta.
- [ ] Las pantallas de registro, verificación y entrada muestran errores junto a los campos y no dependen únicamente del color para comunicar estados.
- [ ] Las pruebas HTTP integradas cubren registro, reenvío, expiración, uso único, acceso permitido y denegado usando SQLite migrada y un adaptador de correo controlable.
