# Definir el ciclo de vida y la propiedad de una Cuenta

Type: grilling
Status: resolved
Triage: ready-for-human
Blocked by: 11

## Question

¿Cuáles son los estados y reglas exactos para registro, verificación de correo, inicio y cierre de sesión, recuperación de contraseña y eliminación de Cuenta y datos privados?

## Answer

Una Cuenta tiene dos estados persistidos: **pendiente de verificación** y **verificada**. No existen perfiles públicos, invitaciones, roles, aprobación manual, suspensión ni borrado diferido en el MVP.

### Registro y verificación

El registro es público y solicita únicamente correo y contraseña. El correo se normaliza para identidad y debe ser único; la contraseña debe tener entre 8 y 128 caracteres. La respuesta pública no revela si un correo ya existe.

Registrar una dirección nueva crea una Cuenta pendiente de verificación y envía un enlace de un solo uso válido durante una hora. Mientras siga pendiente solo puede verificar el correo o solicitar otro enlace; no puede acceder a datos de entrenamiento. Solicitar un enlace nuevo invalida los anteriores. Las Cuentas pendientes no se eliminan automáticamente en el MVP.

Al abrir un enlace válido, la Cuenta pasa definitivamente a verificada y puede iniciar sesión. Un enlace vencido, usado o sustituido conduce a solicitar otro sin exponer detalles adicionales.

### Sesiones de Cuenta

Solo una Cuenta verificada puede iniciar sesión con correo y contraseña. Puede mantener sesiones en varios dispositivos; Better Auth las guarda en SQLite y el navegador recibe únicamente su cookie segura.

«Cerrar sesión» revoca la sesión actual. Cuenta ofrece además «Cerrar todas las sesiones», que revoca todas las sesiones de esa Cuenta, incluida la actual. Cambiar o restablecer la contraseña también revoca todas las sesiones existentes. No se usan JWT, proveedores sociales ni autenticación multifactor.

### Recuperación de contraseña

La solicitud de recuperación siempre devuelve la misma respuesta pública. Si corresponde a una Cuenta verificada, envía un enlace de un solo uso válido durante una hora; solicitar otro invalida los anteriores. El enlace permite establecer una contraseña válida nueva y después obliga a iniciar sesión otra vez.

Una Cuenta pendiente de verificación recibe un enlace de verificación nuevo en lugar de entrar en un segundo flujo de recuperación. El envío de correo se conecta mediante un adaptador a un único proveedor transaccional; elegir el proveedor concreto pertenece al despliegue, no al dominio.

### Propiedad y eliminación

La Cuenta es propietaria de sus Rutinas, Planes, Sesiones, Ejercicios personalizados y RM registrados. Los Ejercicios del catálogo son compartidos y no se eliminan con ella. Todas las lecturas, relaciones y escrituras privadas se autorizan con la Cuenta de la sesión, como exige el ticket 11.

Eliminar la Cuenta exige volver a introducir la contraseña y confirmar una advertencia explícita. Una única transacción elimina definitivamente sus datos privados, sesiones y credenciales; después borra la cookie local. No hay periodo de gracia, restauración ni conservación de analítica anonimizada en el MVP. La retención de copias de seguridad se documentará como política operativa antes del despliegue.

Cambiar el correo de acceso queda fuera del MVP. La Cuenta puede cambiar su contraseña desde Cuenta aportando la contraseña actual; el resultado aplica la misma revocación total de sesiones que una recuperación.
