# Definir la semántica temporal de Rutinas, Planes y Sesiones

Type: grilling
Status: resolved
Triage: ready-for-human

## Question

¿Qué se copia y qué permanece vinculado cuando una Rutina se incorpora a un Plan, se edita una Rutina o un Plan, se inicia una Sesión y se corrige una Sesión finalizada, de modo que el histórico sea estable sin impedir cambios futuros?

## Answer

Se adopta una semántica sin versiones históricas de Rutinas ni Planes. Los vínculos y límites de independencia son:

| Relación | Semántica decidida |
| --- | --- |
| Plan → Rutina | Referencia viva. Un Entrenamiento planificado que usa una Rutina muestra y utiliza siempre su contenido actual, incluso dentro de un Plan completado. |
| Personalización de un día | La acción explícita «Personalizar solo este día» toma los valores actuales como punto de partida y convierte el contenido en un Entrenamiento específico independiente; deja de seguir la Rutina. |
| Sesión → origen | La Sesión conserva como Origen de sesión el Entrenamiento planificado, la Rutina iniciada directamente o ninguno si es una Sesión libre. El vínculo identifica el origen, pero nunca sincroniza contenidos. |
| Inicio de Sesión | Los objetivos vigentes del origen inicializan y quedan guardados en la Sesión. Desde ese momento, los objetivos y resultados de la Sesión son independientes de cambios posteriores en Rutinas o Planes. |

Tanto los Objetivos de serie como los Resultados de serie pueden corregirse después de finalizar, sin historial de versiones ni auditoría. La Fecha prevista permanece en el Entrenamiento planificado y la Fecha realizada pertenece a la Sesión; corregir una no mueve la otra.

Cada Deportista puede tener una sola Sesión activa. No caduca al cerrar el navegador: permanece activa hasta finalizarla o eliminarla expresamente. Cada Entrenamiento planificado puede originar como máximo una Sesión finalizada; una repetición adicional comienza desde la Rutina o como Sesión libre.

Eliminar la Sesión vinculada devuelve su Entrenamiento planificado a pendiente. Si el Plan ya estaba completado, conserva ese estado y solo cambian el estado del día y las métricas derivadas. Mientras un Plan siga activo, un Entrenamiento omitido puede volver a pendiente; tras completar el Plan, esa decisión queda cerrada.

Las Rutinas no se eliminan de forma permanente en el MVP: se archivan para retirarlas de usos nuevos conservando todas las referencias existentes, y pueden restaurarse.
