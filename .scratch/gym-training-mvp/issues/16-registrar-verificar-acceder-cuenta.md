# 16 — Registrar, verificar y acceder a una Cuenta

**What to build:** El flujo completo para que un Deportista cree una Cuenta, verifique su correo, inicie sesión y cierre la sesión actual sin revelar la existencia de otras Cuentas.

**Blocked by:** 15 — Establecer la base ejecutable.

**Status:** resolved

- [x] El registro público solicita únicamente correo y contraseña, normaliza el correo para identidad y exige una contraseña de 8 a 128 caracteres.
- [x] Registrar una dirección nueva crea una Cuenta pendiente de verificación y solicita a un adaptador de correo el envío de un enlace de un solo uso válido durante una hora.
- [x] La respuesta pública no permite distinguir entre un correo nuevo y uno ya registrado.
- [x] Una Cuenta pendiente puede solicitar otro enlace; el nuevo invalida todos los anteriores y un enlace vencido, usado o sustituido no verifica la Cuenta.
- [x] Una Cuenta pendiente no puede iniciar sesión ni acceder a datos de entrenamiento; al verificar el correo pasa definitivamente a verificada.
- [x] Una Cuenta verificada puede iniciar sesión con correo y contraseña, mantener sesiones en varios dispositivos y recibir únicamente una cookie segura.
- [x] Cerrar sesión revoca la sesión actual y devuelve al Deportista a la entrada sin afectar a otras sesiones de la Cuenta.
- [x] Las pantallas de registro, verificación y entrada muestran errores junto a los campos y no dependen únicamente del color para comunicar estados.
- [x] Las pruebas HTTP integradas cubren registro, reenvío, expiración, uso único, acceso permitido y denegado usando SQLite migrada y un adaptador de correo controlable.

## Answer

Implementado en `1a8d12d` («Registrar, verificar y acceder a una Cuenta en el backend»). El flujo de registro, verificación, entrada y cierre de sesión está conectado con el adaptador de correo controlable, sesiones seguras y aislamiento entre Cuentas.

La verificación actual sobre `main` pasa el typecheck, el build y la suite completa: 130 pruebas backend y 80 frontend.
