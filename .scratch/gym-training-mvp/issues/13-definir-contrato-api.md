# Definir el contrato API y la estrategia de guardado

Type: grilling
Status: resolved
Triage: ready-for-human
Blocked by: 01, 02, 11, 12

## Question

¿Qué operaciones y límites transaccionales necesita el frontend para editar Rutinas y Planes, registrar una Sesión con guardado frecuente, reanudarla tras cerrar el navegador y recalcular el histórico sin soporte offline?

## Answer

El backend expone una API REST JSON bajo `/api` y Better Auth bajo `/api/auth`. Frontend y API comparten origen; cada petición autenticada usa la cookie de sesión y la Cuenta se obtiene exclusivamente de ella, nunca de un identificador enviado por el cliente.

### Convenciones

- Los identificadores son opacos y las fechas de dominio usan `YYYY-MM-DD`; los instantes técnicos usan ISO 8601 en UTC.
- Rutinas, Planes y Sesiones incluyen una `revision` entera. Toda sustitución envía la revisión leída y la respuesta devuelve el documento canónico con la revisión incrementada.
- Un error usa siempre `{ "error": { "code", "message", "fields?" } }`.
- Se usan `400` para entrada inválida, `401` para falta de sesión, `404` para recursos inexistentes o ajenos y `409` para revisión obsoleta o transición de estado imposible.
- No hay versionado de URL, GraphQL, WebSockets, eventos, trabajos en segundo plano ni endpoints masivos en el MVP.

### Operaciones

| Área | Contrato mínimo |
| --- | --- |
| Inicio | `GET /api/dashboard` devuelve juntos los cinco bloques decididos en el ticket 07. |
| Ejercicios | Listar y buscar los disponibles; crear, sustituir, archivar y restaurar los personalizados; listar y mantener RM registrados de un Ejercicio. |
| Rutinas | Listar, obtener, crear, sustituir el documento completo, archivar y restaurar. |
| Planes | Listar y obtener; crear y sustituir el documento completo; activar, completar, omitir un Entrenamiento planificado y devolverlo a pendiente mediante acciones explícitas. |
| Sesiones | Obtener la Sesión activa, iniciar desde un origen o libre, obtener una Sesión, sustituir su documento completo, finalizar y eliminar; listar el historial. |
| Cuenta | Leer los datos básicos, cambiar contraseña, cerrar todas las sesiones y eliminar la Cuenta; registro, verificación, entrada, salida y recuperación permanecen en Better Auth. |

Las colecciones pequeñas de Planes y Rutinas se devuelven completas. El catálogo de Ejercicios y el Historial usan cursor opaco, `limit` máximo de 50 y filtros explícitos; no exponen offsets ni consultas arbitrarias.

Las acciones que cambian un estado se modelan como `POST` sobre una acción del recurso —por ejemplo, finalizar una Sesión— y no como valores libres dentro de un `PATCH`. Crear una Sesión comprueba dentro de la misma transacción que la Cuenta no tenga otra activa; si ya existe, responde `409` con su identificador para que el frontend la abra.

### Edición y guardado

Rutinas y Planes se editan como documentos completos. Al guardar, una transacción valida el agregado, sustituye sus hijos editables y devuelve su representación canónica. Un hijo existente conserva su identificador; uno nuevo lo omite y recibe uno del servidor. Esto evita una API distinta para cada fila o reordenación.

La Sesión usa el mismo modelo. Una entrada parcial de la fila vive únicamente en el formulario del navegador. Completar, omitir, restaurar, añadir o eliminar produce un documento válido y se guarda de inmediato con `PUT /api/sessions/:id` y su `revision`. Finalizar y eliminar son acciones separadas con confirmación previa en la interfaz.

Cada guardado de Sesión sustituye en una sola transacción sus Ejercicios y Series editables, comprueba los contratos de los tickets 01 y 02 e incrementa la revisión. Si otra pestaña ya guardó, el servidor devuelve `409`; el frontend carga la versión actual y no intenta mezclar cambios. Si se pierde una respuesta, repetir con la revisión anterior produce el mismo conflicto recuperable y nunca duplica Series.

Cerrar o recargar el navegador descarta solo entradas parciales. `GET /api/sessions/active` recupera todo lo confirmado y permite reanudar la única Sesión activa.

### Transacciones y métricas

Cada creación, sustitución, transición de estado, corrección o eliminación de un agregado es una transacción SQLite. Activar o completar un Plan incluye todos sus Entrenamientos planificados afectados. Eliminar la Cuenta engloba datos de dominio y autenticación conforme al ticket 12.

El MVP no persiste cachés ni tablas derivadas de analítica. Dashboard, detalle e histórico calculan sus métricas a partir de Sesiones finalizadas en la lectura; por ello una corrección o eliminación queda reflejada al terminar su transacción sin colas ni procesos de recálculo. Si estas consultas dejan de ser suficientes, la optimización se decidirá a partir de medidas reales.
