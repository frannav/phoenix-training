# Definir el ciclo de vida completo de un Plan de entrenamiento

Type: grilling
Status: resolved
Triage: ready-for-human
Blocked by: 01

## Question

¿Cómo se crean, activan, calendarizan, editan, completan y duplican los Planes; y cómo se comportan los Entrenamientos planificados realizados tarde, omitidos o todavía pendientes?

## Answer

Un Plan de entrenamiento tiene exactamente uno de estos estados: **borrador**, **activo** o **completado**. No existen estados pausado, cancelado ni archivado en el MVP.

### Creación y calendario

Un Plan nuevo comienza como borrador, tiene un nombre, una o más semanas y al menos un Entrenamiento planificado. Cada entrada ocupa un día concreto de una semana y contiene una referencia viva a una Rutina o un Entrenamiento específico independiente, según la semántica definida en el ticket 01.

El borrador no tiene fechas previstas ni afecta al calendario. Puede editarse por completo y puede eliminarse con confirmación. Activarlo exige elegir el lunes de su primera semana; a partir de esa fecha se calculan todas las Fechas previstas sin modificar la estructura del Plan.

### Activación y edición

Cada Deportista puede tener un solo Plan activo. Si ya existe uno, debe completarlo antes de activar otro. La activación es atómica: fija las fechas y convierte todos sus Entrenamientos planificados en pendientes.

En un Plan activo se pueden cambiar el nombre y los Entrenamientos planificados que continúen pendientes: añadirlos, eliminarlos, moverlos a otro día o cambiar su contenido. Un Entrenamiento planificado realizado no se modifica. Uno omitido debe volver primero a pendiente para poder editarse. Ninguna edición desplaza automáticamente el resto del calendario.

### Realización y omisión

Mientras el Plan esté activo, cualquier Entrenamiento planificado pendiente puede iniciar una Sesión, aunque su Fecha prevista sea pasada o futura. La Sesión conserva esa Fecha prevista como parte de su origen y registra por separado su Fecha realizada. Solo puede existir una Sesión por Entrenamiento planificado.

Un Entrenamiento planificado pendiente puede marcarse como omitido con confirmación y puede volver a pendiente mientras el Plan siga activo. Las Sesiones libres y las iniciadas directamente desde una Rutina no cambian el estado de ningún día del Plan.

### Finalización y duplicación

Completar un Plan es una acción explícita. No se permite mientras exista una Sesión activa originada en él. La confirmación convierte todos sus Entrenamientos planificados pendientes en omitidos y cierra cualquier cambio posterior de estructura o calendario.

Un Plan completado no se reactiva. Las Sesiones finalizadas que originó sí pueden corregirse o eliminarse conforme al ticket 01; esto recalcula métricas y puede devolver un día a pendiente, pero no reabre el Plan ni permite iniciar otra Sesión desde ese día.

Cualquier Plan puede duplicarse. La copia es un borrador sin fechas, estados ni Sesiones: conserva las referencias a Rutinas y copia de forma independiente el contenido de los Entrenamientos específicos. La activación posterior genera un calendario nuevo.
