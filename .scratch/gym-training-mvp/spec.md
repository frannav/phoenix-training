# MVP de entrenamiento personal

Triage: ready-for-agent

## Problem Statement

Un Deportista que entrena por su cuenta necesita organizar qué va a entrenar, registrar con rapidez lo que hace realmente y entender su progreso sin depender de hojas de cálculo, notas inconexas ni aplicaciones orientadas a entrenadores o redes sociales.

Las herramientas generalistas no mantienen una separación clara entre Rutinas reutilizables, Planes con calendario, Sesiones realizadas y resultados por Serie. Esa ambigüedad hace difícil modificar la planificación sin alterar el histórico, reanudar un entrenamiento interrumpido, corregir un registro o interpretar métricas coherentes.

El producto debe resolver ese ciclo completo en una web privada, multiusuario y mobile-first. Debe ser rápida durante una Sesión activa, conservar un histórico estable, aislar estrictamente los datos de cada Cuenta y ofrecer solo la analítica necesaria para tomar la siguiente decisión de entrenamiento.

## Solution

Se construirá una aplicación web en español para Deportistas que entrenan por su cuenta. Cada Deportista podrá crear Rutinas reutilizables, organizar Planes de varias semanas, iniciar una Sesión desde un Entrenamiento planificado o una Rutina, o comenzar una Sesión libre. Durante la Sesión registrará resultados y RPE por Serie mediante una interfaz móvil compacta con guardado inmediato de cada acción válida.

La aplicación conservará por separado la intención original, el origen de la Sesión y los resultados reales. Los cambios futuros de una Rutina podrán afectar a las referencias vivas de un Plan, pero nunca reescribirán una Sesión ya iniciada. Las Sesiones finalizadas formarán el Historial, admitirán correcciones y alimentarán métricas calculadas de forma determinista.

Inicio priorizará continuar la Sesión activa o iniciar el próximo Entrenamiento planificado. A continuación mostrará el progreso del Plan, el volumen semanal, los RM registrados recientemente y la evolución histórica de un Ejercicio. El catálogo combinará Ejercicios comunes revisados con Ejercicios personalizados privados, sin redistribuir medios cuya licencia no esté confirmada.

La solución usará un frontend React mobile-first y una API REST monolítica sobre Bun. Los datos se almacenarán en SQLite y la autenticación mediante correo y contraseña mantendrá todas las entidades privadas aisladas por Cuenta.

## User Stories

1. Como Deportista, quiero registrarme con correo y contraseña, para crear una Cuenta privada.
2. Como Deportista, quiero verificar mi correo mediante un enlace de un solo uso, para activar de forma segura el acceso a mis datos.
3. Como Deportista con una Cuenta pendiente de verificación, quiero solicitar un enlace nuevo, para completar el alta si el anterior venció o se perdió.
4. Como Deportista, quiero iniciar sesión desde varios dispositivos, para consultar o registrar mi entrenamiento donde lo necesite.
5. Como Deportista, quiero cerrar solo la sesión del dispositivo actual, para mantener abiertas las demás.
6. Como Deportista, quiero cerrar todas mis sesiones, para recuperar el control de la Cuenta si un dispositivo deja de ser seguro.
7. Como Deportista, quiero recuperar mi contraseña mediante correo, para volver a acceder sin revelar públicamente si mi Cuenta existe.
8. Como Deportista, quiero cambiar mi contraseña introduciendo la actual, para actualizar mis credenciales y revocar las sesiones anteriores.
9. Como Deportista, quiero eliminar definitivamente mi Cuenta y sus datos privados tras volver a introducir mi contraseña y confirmar la acción, para ejercer control sobre mi información.
10. Como Deportista, quiero buscar Ejercicios comunes por nombre y taxonomía, para añadir rápidamente movimientos conocidos a mi entrenamiento.
11. Como Deportista, quiero ver el nombre, instrucciones y Forma de registro en español de cada Ejercicio del catálogo, para saber cómo utilizarlo y registrarlo.
12. Como Deportista, quiero distinguir un Ejercicio del catálogo de uno personalizado, para entender su procedencia.
13. Como Deportista, quiero crear un Ejercicio personalizado privado, para registrar movimientos que no estén en el catálogo.
14. Como Deportista, quiero renombrar un Ejercicio personalizado, para mantener mi biblioteca comprensible.
15. Como Deportista, quiero archivar y restaurar un Ejercicio personalizado, para retirarlo de usos nuevos sin romper mi histórico.
16. Como Deportista, quiero seguir viendo un Ejercicio que ya no esté disponible cuando figure en una Rutina, Plan o Sesión existente, para conservar el contexto histórico.
17. Como Deportista, quiero crear una Rutina con Ejercicios y Objetivos de serie, para reutilizar una estructura de entrenamiento.
18. Como Deportista, quiero editar una Rutina, para que los usos futuros y los Entrenamientos planificados que aún la referencien utilicen su contenido actual.
19. Como Deportista, quiero archivar y restaurar una Rutina, para retirarla de usos nuevos sin eliminar referencias existentes.
20. Como Deportista, quiero iniciar directamente una Sesión desde una Rutina, para entrenar sin necesitar un Plan activo.
21. Como Deportista, quiero crear un Plan borrador con nombre, semanas y Entrenamientos planificados, para preparar un ciclo antes de asignarle fechas.
22. Como Deportista, quiero usar una Rutina mediante referencia viva dentro de un Plan, para que los días correspondientes sigan su contenido actual.
23. Como Deportista, quiero personalizar solo un día del Plan, para independizar ese Entrenamiento planificado de la Rutina original.
24. Como Deportista, quiero editar o eliminar por completo un Plan borrador, para corregir la planificación antes de activarla.
25. Como Deportista, quiero activar un Plan eligiendo el lunes de su primera semana, para calcular sus Fechas previstas.
26. Como Deportista, quiero tener como máximo un Plan activo, para evitar calendarios simultáneos ambiguos.
27. Como Deportista, quiero editar el nombre y los Entrenamientos planificados pendientes de un Plan activo, para adaptar el futuro sin reescribir lo realizado.
28. Como Deportista, quiero iniciar un Entrenamiento planificado pendiente aunque su Fecha prevista sea pasada o futura, para adaptarme a lo que realmente ocurre.
29. Como Deportista, quiero marcar un Entrenamiento planificado como omitido y devolverlo a pendiente mientras el Plan siga activo, para reflejar o reconsiderar una decisión.
30. Como Deportista, quiero completar expresamente un Plan y convertir sus días pendientes en omitidos, para cerrar el ciclo de entrenamiento.
31. Como Deportista, quiero duplicar cualquier Plan como un borrador sin fechas ni resultados, para reutilizar su estructura en otro ciclo.
32. Como Deportista, quiero iniciar una Sesión desde un Entrenamiento planificado sin confirmaciones intermedias, para empezar a registrar de inmediato.
33. Como Deportista, quiero iniciar una Sesión libre y elegir enseguida su primer Ejercicio, para registrar un entrenamiento no planificado.
34. Como Deportista, quiero que cualquier intento de entrenar me lleve a mi Sesión activa existente, para no crear dos registros simultáneos.
35. Como Deportista, quiero reanudar una Sesión activa después de cerrar o recargar el navegador, para no perder las acciones ya guardadas.
36. Como Deportista, quiero ver en todo momento el nombre, origen, progreso y estado de guardado de mi Sesión activa, para entender su contexto.
37. Como Deportista, quiero ver los Ejercicios de una Sesión en un acordeón de una sola columna, para registrar cómodamente desde el móvil sin perder el progreso global.
38. Como Deportista, quiero que los Objetivos de serie inicialicen los campos de resultado, para aceptar lo previsto con un toque o modificar únicamente lo que cambió.
39. Como Deportista, quiero completar una Serie solo cuando todos los valores exigidos sean válidos, para evitar resultados parciales incoherentes.
40. Como Deportista, quiero registrar opcionalmente un RPE entre 1 y 10 en cada Serie completada, para conservar mi percepción del esfuerzo.
41. Como Deportista, quiero omitir y restaurar Series con confirmación cuando se vaya a perder un resultado, para reflejar lo ocurrido sin borrados accidentales.
42. Como Deportista, quiero añadir Series durante una Sesión y reutilizar como borrador los valores de la anterior, para adaptar el entrenamiento con pocos toques.
43. Como Deportista, quiero añadir o retirar Ejercicios durante una Sesión dentro de las reglas de conservación de la intención original, para adaptar el entrenamiento real.
44. Como Deportista, quiero finalizar una Sesión solo si contiene al menos una Serie completada y confirmar la omisión de las pendientes, para guardar un registro válido.
45. Como Deportista, quiero eliminar expresamente una Sesión activa, para abandonar un entrenamiento que no deseo conservar.
46. Como Deportista, quiero ver el resumen de una Sesión al finalizarla, para comprobar qué quedó registrado.
47. Como Deportista, quiero consultar un Historial paginado de Sesiones finalizadas, para revisar entrenamientos anteriores.
48. Como Deportista, quiero corregir objetivos, resultados, RPE, estados de Series y Fecha realizada de una Sesión finalizada, para arreglar errores sin alterar su origen.
49. Como Deportista, quiero eliminar una Sesión finalizada, para retirar un registro erróneo y recalcular automáticamente el Plan y las métricas afectadas.
50. Como Deportista, quiero registrar, editar y eliminar RM reales por Ejercicio, repeticiones y fecha, para mantener mis marcas expresas sin estimaciones automáticas.
51. Como Deportista, quiero ver el volumen de fuerza calculado como carga por repeticiones, para comparar mi trabajo entre semanas.
52. Como Deportista, quiero ver carga máxima, repeticiones, duración, RPE medio e intensidad relativa cuando correspondan, para analizar cada Forma de registro con reglas coherentes.
53. Como Deportista, quiero ver por semana y para todo el Plan tanto el avance como el cumplimiento, para distinguir los días resueltos de los realizados.
54. Como Deportista, quiero que Inicio priorice continuar mi Sesión activa, iniciar el próximo Entrenamiento planificado o comenzar una Sesión libre, para saber cuál es la acción inmediata.
55. Como Deportista, quiero ver en Inicio un resumen del Plan activo, para conocer la semana actual y su avance y cumplimiento.
56. Como Deportista, quiero comparar el volumen actual con la semana anterior y las últimas seis semanas, para reconocer tendencias recientes.
57. Como Deportista, quiero ver hasta tres RM registrados recientemente, para recordar mis marcas sin confundirlas con cálculos automáticos.
58. Como Deportista, quiero elegir un Ejercicio y ver su evolución mediante la métrica propia de su Forma de registro, para interpretar su progreso histórico.
59. Como Deportista, quiero navegar en móvil mediante Inicio, Planes, Rutinas, Historial y Más, para alcanzar las áreas frecuentes con poca profundidad.
60. Como Deportista, quiero ver todos los destinos en una barra lateral de escritorio, para aprovechar el espacio sin cambiar el modelo mental de navegación.
61. Como Deportista, quiero tener un acceso persistente a la Sesión activa desde cualquier área, para volver al registro con un toque.
62. Como Deportista, quiero entender estados, errores y gráficas mediante texto e iconos además de color, para utilizar la aplicación con independencia de mi percepción cromática.
63. Como Deportista, quiero que una edición concurrente se detecte y me muestre la versión vigente sin fusionar cambios silenciosamente, para no sobrescribir datos de otra pestaña.
64. Como Deportista, quiero que los datos de otras Cuentas se comporten como inexistentes, para mantener privado mi entrenamiento.

## Implementation Decisions

### Producto y límites

- El producto es una aplicación web privada y multiusuario para Deportistas que entrenan por su cuenta.
- La interfaz es mobile-first, también usable en escritorio, solo en español y con cargas expresadas en kilogramos.
- Cada entidad privada pertenece obligatoriamente a una Cuenta. La Cuenta autenticada se obtiene de la sesión y nunca de un identificador proporcionado por el cliente.
- Las Fechas previstas y realizadas son fechas de dominio independientes. Las semanas abarcan de lunes a domingo.
- No se mantienen versiones históricas ni auditoría de Rutinas, Planes o Sesiones. Las correcciones sustituyen el estado vigente y recalculan los valores derivados.

### Cuenta y autenticación

- Una Cuenta tiene exactamente dos estados persistidos: pendiente de verificación y verificada.
- El registro público solicita correo y contraseña. El correo se normaliza para identidad y es único; la contraseña admite entre 8 y 128 caracteres.
- Las respuestas de registro y recuperación no revelan si el correo ya existe.
- Registrar una dirección nueva crea una Cuenta pendiente y envía un enlace de un solo uso válido durante una hora. Solicitar otro enlace invalida los anteriores.
- Una Cuenta pendiente no accede a datos de entrenamiento. Puede verificar el correo o solicitar otro enlace y no se elimina automáticamente.
- Solo una Cuenta verificada inicia sesión. Se admiten varias sesiones de Cuenta almacenadas por el sistema de autenticación y representadas en el navegador mediante una cookie segura.
- Cerrar sesión revoca la sesión actual. Cerrar todas las sesiones, cambiar la contraseña o restablecerla revoca todas las sesiones existentes.
- La recuperación usa un enlace de un solo uso válido durante una hora. Para una Cuenta pendiente, la solicitud vuelve a enviar verificación en lugar de abrir un flujo distinto.
- El correo transaccional se conecta mediante un adaptador a un único proveedor que se elegirá durante el despliegue.
- Eliminar la Cuenta exige contraseña actual y confirmación explícita. Una sola transacción elimina credenciales, sesiones, Rutinas, Planes, Sesiones, Ejercicios personalizados y RM registrados. Los Ejercicios compartidos del catálogo permanecen.

### Catálogo y Ejercicios personalizados

- El catálogo es un snapshot local y versionado de un commit auditado de `hasaneyldrm/exercises-dataset`; no existe dependencia ni traducción en tiempo de ejecución.
- Un manifiesto conserva la revisión y checksum de origen. Una actualización fija otro commit, valida invariantes, revisa el diff y genera una migración reproducible.
- Solo se publican Ejercicios comunes revisados localmente con nombre e instrucciones aceptables en español, Forma de registro explícita y taxonomía mínima de búsqueda y filtro.
- El proyecto mantiene una revisión explícita que relaciona cada identificador upstream incluido con sus datos locales. El contenido no revisado no aparece en el producto.
- Los JPG y GIF del origen no se importan ni redistribuyen sin una licencia propia. El selector usa un placeholder común.
- Todos los Ejercicios usan una identidad interna opaca. Los compartidos guardan fuente, identificador upstream y revisión; los personalizados pertenecen a una Cuenta y no tienen identidad externa.
- La combinación de fuente e identificador upstream es única, pero ninguna entidad del dominio la utiliza como referencia.
- La Forma de registro de un Ejercicio no cambia después de publicarlo o utilizarlo. Una corrección incompatible crea otro Ejercicio y retira el anterior de usos nuevos.
- Los Ejercicios del catálogo no son editables por un Deportista. Los personalizados pueden crearse, renombrarse, archivarse y restaurarse únicamente desde su Cuenta propietaria.
- Un Ejercicio retirado o archivado no aparece en usos nuevos, pero sigue resolviendo todas las referencias existentes. No se reasignan ni fusionan referencias automáticamente.

### Rutinas y semántica temporal

- Una Rutina es una plantilla reutilizable compuesta por Ejercicios, orden y Objetivos de serie.
- Las Rutinas pueden crearse, editarse, archivarse y restaurarse. No se eliminan definitivamente en el MVP.
- Un Entrenamiento planificado que usa una Rutina mantiene una referencia viva y muestra su contenido actual, incluso si el Plan está completado.
- La acción “Personalizar solo este día” copia los valores actuales a un Entrenamiento específico independiente que deja de seguir la Rutina.
- Una Sesión conserva el identificador de su Origen de sesión, pero sus contenidos nunca se sincronizan con ese origen.
- Al iniciar una Sesión, los objetivos vigentes del origen se copian a ella y se vuelven independientes de cambios posteriores.

### Planes de entrenamiento

- Un Plan tiene exactamente uno de tres estados: borrador, activo o completado.
- Un borrador tiene nombre, una o más semanas y al menos un Entrenamiento planificado. Cada entrada ocupa un día de una semana y usa una Rutina o un Entrenamiento específico.
- Un borrador no tiene Fechas previstas ni afecta al calendario. Puede modificarse por completo y eliminarse con confirmación.
- Activar exige escoger el lunes de la primera semana. La transición fija atómicamente las Fechas previstas y deja todos los Entrenamientos planificados pendientes.
- Cada Deportista puede tener como máximo un Plan activo. Debe completar el actual antes de activar otro.
- En un Plan activo se pueden editar el nombre y los Entrenamientos planificados pendientes: añadir, eliminar, mover o cambiar contenido. Un día realizado no cambia y uno omitido debe volver primero a pendiente.
- Ninguna edición mueve automáticamente el resto del calendario.
- Un Entrenamiento planificado pendiente puede iniciar una Sesión aunque su Fecha prevista sea pasada o futura. Cada Entrenamiento planificado origina como máximo una Sesión finalizada.
- Un día pendiente puede marcarse como omitido con confirmación y volver a pendiente mientras el Plan esté activo.
- Las Sesiones libres o iniciadas directamente desde una Rutina no afectan al Plan.
- Completar un Plan es explícito y no se permite mientras exista una Sesión activa originada en él. La transición convierte en omitidos todos los días pendientes y cierra la estructura y calendario.
- Un Plan completado no se reactiva. Corregir o eliminar una Sesión originada en él puede cambiar métricas o devolver el día a pendiente, pero no reabre el Plan ni permite iniciar otra Sesión desde ese día.
- Duplicar cualquier Plan crea un borrador sin fechas, estados ni Sesiones. Conserva referencias a Rutinas y copia independientemente los Entrenamientos específicos.

### Sesiones de entrenamiento

- Cada Deportista puede tener una sola Sesión activa. Permanece activa hasta finalizarla o eliminarla expresamente y puede recuperarse después de cerrar el navegador.
- Una Sesión puede originarse en un Entrenamiento planificado, en una Rutina o no tener origen si es libre.
- Iniciar desde un origen crea la Sesión y abre directamente su pantalla. Una Sesión libre comienza vacía y abre el selector de Ejercicio.
- Si ya hay una Sesión activa, cualquier acción de entrenar responde con esa Sesión en vez de crear otra.
- La Sesión conserva por separado su Fecha realizada y la Fecha prevista de su Entrenamiento planificado de origen.
- Las acciones completas —completar, omitir, restaurar, añadir o eliminar— se guardan inmediatamente. Las entradas parciales solo existen como borrador del formulario del navegador.
- Finalizar requiere al menos una Serie completada. Tras confirmación, todas las Series pendientes pasan a omitidas.
- Las Sesiones finalizadas permiten corregir objetivos, resultados, RPE, Fecha realizada y estados; añadir Series con resultado completo; y eliminar Series que se hubieran añadido. Nunca pueden quedar pendientes ni sin alguna Serie completada.
- Eliminar una Sesión vinculada devuelve su Entrenamiento planificado a pendiente y recalcula el progreso. Un Plan completado conserva su estado.

### Series y Formas de registro

Cada Serie tiene exactamente uno de tres estados:

| Estado | Datos permitidos |
| --- | --- |
| Pendiente | Puede tener Objetivos de serie; no tiene Resultado de serie ni RPE. |
| Completada | Tiene todos los resultados exigidos por la Forma de registro y puede tener RPE. |
| Omitida | Conserva objetivos; no tiene resultado ni RPE. |

Los objetivos son opcionales de manera independiente y no determinan el estado. Una Serie prevista sin objetivos sigue expresando la intención de realizarla.

| Forma de registro | Objetivos admitidos | Resultado al completar | Cardinalidad |
| --- | --- | --- | --- |
| Fuerza con carga | Carga y repeticiones opcionales e independientes | Carga y repeticiones | Una o más Series; admite Series añadidas |
| Repeticiones sin carga | Repeticiones opcionales | Repeticiones | Una o más Series; admite Series añadidas |
| Tiempo por serie | Duración opcional | Duración | Una o más Series; admite Series añadidas |
| Cardio continuo | Duración opcional | Duración | Exactamente una Serie por aparición del Ejercicio |

- Un segundo esfuerzo de cardio continuo se registra añadiendo de nuevo el Ejercicio a la Sesión, no añadiendo otra Serie a la misma aparición.
- La carga admite de `0` a `9999,99` kg y como máximo dos decimales.
- Las repeticiones admiten enteros de `1` a `9999`.
- La duración admite enteros de `1` a `359999` segundos.
- El RPE es opcional en una Serie completada y admite de `1` a `10` en incrementos de `0,5`.
- Las mismas reglas se aplican a objetivos y resultados. Los valores inválidos se rechazan sin redondear, recortar ni corregir silenciosamente.
- El resultado se persiste de forma atómica y solo cuando contiene todos los campos exigidos.
- Una Serie prevista no se elimina individualmente de una Sesión; se omite. Una Serie añadida comienza pendiente y puede eliminarse, con confirmación si ya contiene resultado.
- Pasar una Serie completada a pendiente u omitida elimina resultado y RPE y exige confirmación. En una Sesión finalizada solo puede pasar a omitida.
- Restaurar una Serie omitida como completada exige un resultado completo.
- Un Ejercicio añadido durante la Sesión se puede eliminar con confirmación si contiene resultados. Un Ejercicio procedente del origen conserva sus Series previstas.

### Experiencia de la Sesión activa

- La pantalla usa una sola columna con Ejercicios plegables y mantiene uno desplegado. Al reanudar abre el último Ejercicio utilizado.
- La Sesión activa ocupa una pantalla completa con cabecera y controles propios y oculta la navegación que pueda competir con el registro.
- La cabecera fija muestra nombre, Origen de sesión y estado “Guardando”, “Guardado” o “Error al guardar”, con reintento cuando corresponda.
- Un resumen muestra Series completadas, omitidas y pendientes. Cada Ejercicio plegado muestra nombre y progreso.
- Cada fila muestra el número de Serie, campos propios de la Forma de registro, RPE, completar y omitir o restaurar.
- Los objetivos inicializan los campos de resultado sin completar automáticamente la Serie.
- Añadir una Serie propone como borrador los valores de la Serie anterior.
- “Finalizar” permanece fijo en la parte inferior; “Añadir ejercicio” cierra la lista y “Añadir serie” vive dentro del Ejercicio desplegado.
- Los errores se muestran junto al campo afectado. Icono, texto y estilo distinguen estados sin depender solo del color.

### Métricas

- Solo cuentan Series completadas de Sesiones finalizadas. Se excluyen objetivos, Series pendientes u omitidas, Sesiones activas y Sesiones eliminadas.
- Las agrupaciones temporales usan la Fecha realizada y semanas de lunes a domingo. Corregir o eliminar una Sesión recalcula los resultados de lectura afectados.
- El volumen de fuerza con carga es la suma de `carga × repeticiones`, expresada en `kg·rep`.
- La carga máxima es la mayor carga completada de un Ejercicio de fuerza con carga.
- Las repeticiones son la suma por Ejercicio para fuerza con carga y repeticiones sin carga.
- La duración es la suma de segundos de Ejercicios de tiempo por serie. Cardio continuo conserva la duración, pero no produce analítica en el MVP.
- El RPE medio es la media aritmética sin ponderación de las Series completadas con RPE. Se calcula con precisión completa y se muestra con un decimal; no se muestra sin observaciones.
- Las métricas pueden agruparse por Sesión, Ejercicio, semana o intervalo. Varias apariciones del mismo Ejercicio se agregan bajo su identidad.
- Las Sesiones libres y las iniciadas desde una Rutina cuentan en analítica general, pero no en el progreso de un Plan.
- Un RM registrado lo introduce expresamente el Deportista para un Ejercicio, carga, repeticiones y fecha. El vigente para un número de repeticiones es el más reciente en esa fecha o antes.
- La intensidad relativa solo existe para fuerza con carga cuando hay un RM vigente de una repetición: `carga de la Serie / carga del RM × 100`. Puede superar el 100 % y se muestra con un decimal.
- No se calcula ni presenta 1RM estimado.
- Para cada semana y para el Plan completo, avance es `(realizados + omitidos) / total × 100` y cumplimiento es `realizados / total × 100`. Se calculan con precisión completa y se muestran al entero más próximo.

### Inicio, navegación y presentación adaptable

- Inicio sigue un recorrido vertical con cinco bloques: entrenamiento actual, Plan activo, volumen semanal, RM recientes y evolución de un Ejercicio.
- El primer bloque muestra “Continuar” si existe una Sesión activa; si no, el próximo Entrenamiento planificado pendiente y “Iniciar”; si tampoco existe, ofrece una Sesión libre.
- El Plan activo muestra nombre, semana actual, realizados, omitidos y barras de avance y cumplimiento, con enlace a su detalle.
- Volumen semanal muestra el total actual, comparación porcentual con la semana anterior y barras de las últimas seis semanas.
- RM recientes muestra hasta tres RM registrados con Ejercicio, carga, repeticiones y fecha.
- Evolución permite elegir un Ejercicio y muestra una serie temporal: carga máxima para fuerza con carga, repeticiones totales para repeticiones sin carga o duración total para tiempo por serie. Cardio informa que no dispone de analítica.
- Los estados vacíos explican qué falta y enlazan a una acción; no se dibujan gráficas vacías. Cada gráfica incluye título, unidad, valor textual y resumen.
- En móvil, la navegación inferior contiene Inicio, Planes, Rutinas, Historial y Más. Más abre Ejercicios y Cuenta.
- En escritorio, una barra lateral muestra Inicio; Planes y Rutinas; Historial y Ejercicios; y Cuenta anclada al final.
- No hay destino principal “Sesiones”. Las finalizadas viven en Historial y la activa se abre desde un acceso persistente con nombre, progreso y “Continuar”.
- En móvil ese acceso se acopla sobre la navegación inferior; en escritorio aparece como una franja sobre el contenido.
- En escritorio, entrenamiento y Plan comparten la primera fila, volumen y RM la segunda, y evolución ocupa el ancho inferior. El contenido y orden conceptual no cambian.

### API y concurrencia

- La API es REST JSON bajo `/api`; la autenticación se sirve bajo `/api/auth`. Frontend y API comparten origen.
- Los identificadores son opacos, las fechas de dominio usan `YYYY-MM-DD` y los instantes técnicos ISO 8601 en UTC.
- Rutinas, Planes y Sesiones incluyen una revisión entera. Toda sustitución envía la revisión leída y recibe el documento canónico con la revisión incrementada.
- Los errores usan `{ "error": { "code", "message", "fields?" } }`. Se reserva `400` para entrada inválida, `401` para ausencia de sesión, `404` para recursos inexistentes o ajenos y `409` para revisión obsoleta o transición imposible.
- `GET /api/dashboard` entrega conjuntamente los cinco bloques de Inicio.
- Ejercicios permite listar y buscar disponibles; crear, sustituir, archivar y restaurar personalizados; y mantener RM registrados.
- Rutinas permite listar, obtener, crear, sustituir el documento completo, archivar y restaurar.
- Planes permite listar, obtener, crear, sustituir; activar y completar; y omitir o devolver a pendiente un Entrenamiento planificado mediante acciones explícitas.
- Sesiones permite obtener la activa mediante `GET /api/sessions/active`; iniciar desde origen o libre; obtener; sustituir el agregado completo mediante `PUT /api/sessions/:id`; finalizar y eliminar; y listar Historial.
- Cuenta permite leer datos básicos, cambiar contraseña, cerrar todas las sesiones y eliminar la Cuenta. Better Auth conserva registro, verificación, entrada, salida y recuperación.
- Planes y Rutinas se listan completos. Catálogo e Historial usan cursor opaco, límite máximo de 50 y filtros expresos.
- Las transiciones se modelan como acciones explícitas, no como valores libres dentro de una actualización parcial.
- Crear una Sesión comprueba en la misma transacción que no exista otra activa. Un conflicto devuelve `409` y el identificador de la existente.
- Rutinas, Planes y Sesiones se guardan como agregados completos. Los hijos existentes conservan identificador y los nuevos lo reciben del servidor.
- Cada acción válida de una Sesión sustituye el agregado en una transacción. Un `409` detiene las mutaciones, carga la versión actual e informa del conflicto; no se mezclan cambios.
- Repetir una escritura con una revisión anterior produce un conflicto recuperable y no duplica Series.
- Las métricas se calculan al leer; no se persisten cachés, tablas derivadas, colas ni procesos de recálculo.

### Arquitectura del backend

- El backend es un monolito pequeño sobre Bun, Hono, Zod, SQLite, Drizzle, Better Auth y `bun:test`.
- Hono define rutas y middleware. Zod valida parámetros, consultas y cuerpos en el límite HTTP; las reglas dependientes de estado se validan en el caso de uso.
- SQLite vive en un archivo sobre volumen persistente, con claves foráneas, WAL y espera ante bloqueos habilitados en producción.
- Drizzle es la única capa de acceso. Drizzle Kit es dueño de todas las migraciones, incluidas las tablas de autenticación.
- Cada escritura completa del dominio usa una transacción. Las consultas se implementan mediante funciones específicas de casos de uso, sin repositorios genéricos.
- La aplicación se ejecuta como una sola instancia. Las migraciones se aplican antes de iniciar la nueva versión y nunca desde réplicas concurrentes.
- Better Auth usa correo y contraseña, adaptador Drizzle, sesiones persistidas en SQLite y cookie segura. No se añaden JWT, Redis ni sesiones stateless.
- Cada consulta y mutación filtra por la Cuenta autenticada. Las relaciones y restricciones únicas incluyen la propiedad cuando corresponde.
- No se introducen colas, caché distribuida, microservicios ni capas genéricas anticipadas.

### Arquitectura del frontend

- El frontend usa React, TypeScript y Vite; React Router para navegación; TanStack Query para datos remotos; React Hook Form y Zod para formularios; Recharts para las gráficas acordadas; CSS Modules y un conjunto pequeño de variables globales para estilos.
- Las rutas públicas son `/entrar`, `/registro`, `/verificar`, `/recuperar` y `/restablecer`.
- Un AppShell autenticado contiene las siguientes rutas:

| Ruta | Área |
| --- | --- |
| `/` | Inicio y dashboard |
| `/planes`, `/planes/nuevo`, `/planes/:planId` | Listado, creación y detalle o edición de Planes |
| `/rutinas`, `/rutinas/nueva`, `/rutinas/:rutinaId` | Listado, creación y detalle o edición de Rutinas |
| `/historial`, `/historial/:sesionId` | Sesiones finalizadas y su detalle o corrección |
| `/ejercicios` | Catálogo, Ejercicios personalizados y RM registrados |
| `/cuenta` | Credenciales, sesiones y eliminación de Cuenta |
| `/sesion/:sesionId` | Sesión activa a pantalla completa |

- El código se organiza por funcionalidad: autenticación, dashboard, Planes, Rutinas, Sesiones, Historial, Ejercicios y Cuenta. La infraestructura compartida se limita a cliente HTTP, primitivas visuales, estilos y utilidades puras.
- Cada funcionalidad contiene sus páginas, componentes, formularios, llamadas API y claves de consulta. Las funcionalidades colaboran mediante contratos públicos pequeños.
- TanStack Query es la única caché del servidor. Una mutación incorpora la respuesta canónica e invalida ampliamente Inicio, Plan, Historial o Sesión activa según corresponda.
- El estado efímero permanece en componentes o formularios; los filtros compartibles usan la URL. React Context se limita a proveedores técnicos.
- Un cliente HTTP compartido añade JSON y credenciales e interpreta el error común, sin conocer recursos concretos.
- Durante el desarrollo, Vite redirige `/api` al backend; en producción, frontend y API se sirven bajo el mismo sitio para evitar CORS y simplificar las cookies.
- React Hook Form conserva entradas parciales y Zod ofrece feedback inmediato, pero el servidor es la autoridad.
- Un componente común resuelve las confirmaciones destructivas. Solo se comparten primitivas que aparezcan realmente en varias áreas.
- Las gráficas reciben datos agregados por la API y nunca calculan reglas de dominio en el navegador.
- No se añaden framework de componentes, SSR, Redux, Zustand, PWA ni soporte offline.

## Testing Decisions

- Los tests verifican comportamiento observable y reglas de negocio, no la estructura interna, llamadas entre funciones ni detalles de Drizzle, Hono o React.
- El seam principal es la API HTTP completa ejecutada contra una SQLite temporal con las migraciones reales. Las peticiones atraviesan rutas, autenticación, validación, casos de uso, transacciones y persistencia.
- Las pruebas de API cubren flujos completos de Cuenta, Ejercicios personalizados, Rutinas, Planes, Sesiones, Historial, RM registrados y dashboard.
- Cada regla de estado relevante se prueba desde la operación pública: unicidad de Plan y Sesión activos, revisiones obsoletas, transiciones imposibles, copia de objetivos, independencia temporal, finalización, corrección y eliminación.
- Los contratos de Series se prueban por Forma de registro y por límites válidos e inválidos. Se verifica que un resultado parcial nunca se persista ni complete una Serie.
- Las pruebas de persistencia usan las migraciones de producción y comprueban transacciones, claves foráneas y recálculo observable después de corregir o eliminar.
- El aislamiento entre Cuentas es obligatorio: una Cuenta no puede leer, modificar ni enlazar entidades privadas de otra, y la respuesta se comporta como recurso inexistente.
- La concurrencia optimista se prueba enviando revisiones obsoletas y repitiendo peticiones para demostrar que los conflictos no sobrescriben ni duplican hijos.
- Las métricas se prueban mediante Sesiones finalizadas preparadas por la API y se comprueban desde las lecturas de dashboard, Historial o detalle, incluidos periodos, redondeo, exclusiones y correcciones.
- Las integraciones externas de correo se sustituyen por un adaptador controlable que permite observar envíos, vencimiento, uso único e invalidación de enlaces sin depender de un proveedor real.
- En frontend, Vitest y Testing Library cubren formularios, componentes y utilidades con comportamiento propio: borradores parciales, errores de campos, confirmaciones, estados de guardado, conflicto `409`, navegación y presentación accesible de gráficas.
- Las pruebas de frontend simulan el contrato HTTP en el límite de la funcionalidad y no duplican las reglas de dominio ya demostradas por la API.
- No se crea inicialmente un segundo sistema end-to-end de navegador. Se reconsiderará cuando exista un flujo vertical implementado cuyo riesgo no quede cubierto por la API integrada y los tests de interfaz.
- El repositorio todavía no contiene código ni pruebas equivalentes que reutilizar; estos seams constituyen el precedente inicial del proyecto.

## Out of Scope

- PWA, aplicación nativa, soporte offline y sincronización local-first.
- Temporizadores de ejecución o descanso.
- Series de aproximación, superseries, circuitos, dropsets y otros bloques avanzados.
- Distancia, ritmo o analítica de cardio más allá de conservar su duración.
- Nutrición, peso, medidas corporales, coaching, funciones sociales, retos, notificaciones push, wearables y pagos.
- Internacionalización, interfaz en otros idiomas y cargas en libras.
- 1RM estimado y cualquier fórmula automática de récord.
- Perfiles públicos, invitaciones, roles, aprobación manual, suspensión, MFA y proveedores sociales.
- Cambio del correo de acceso.
- Estados pausado, cancelado o archivado para Planes y reactivación de un Plan completado.
- Eliminación definitiva de Rutinas o Ejercicios referenciados y fusión automática de Ejercicios.
- Redistribución de JPG o GIF del dataset sin licencia propia.
- GraphQL, WebSockets, eventos, trabajos en segundo plano y endpoints masivos.
- SSR, store global de datos, framework de componentes y microservicios.
- Escalado horizontal de SQLite y migración a una base de datos servidor.

## Further Notes

- La especificación consolida las catorce decisiones resueltas del mapa del MVP y usa el vocabulario del dominio del proyecto.
- Los prototipos validados fijan tres decisiones visuales: Sesión activa con Ejercicios plegables, navegación móvil de cinco destinos y dashboard de recorrido vertical.
- Antes de producción habrá que elegir proveedor de correo y despliegue, y definir observabilidad, copias de seguridad, recuperación y política de retención de respaldos.
- El texto final de estados vacíos y errores y la revisión de accesibilidad pantalla por pantalla se concretarán durante implementación respetando las reglas ya acordadas.
- Los límites adicionales de rendimiento se introducirán solo a partir de medidas sobre la implementación. El catálogo y el Historial ya cuentan con paginación por cursor.
- La siguiente fase debe dividir esta especificación en tickets de implementación pequeños, ordenados por dependencias y con criterios de aceptación verificables desde los seams de prueba acordados.
