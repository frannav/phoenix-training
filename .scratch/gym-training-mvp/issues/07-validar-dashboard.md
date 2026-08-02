# Validar el dashboard minimalista y la visualización del progreso

Type: prototype
Status: resolved
Triage: ready-for-human
Blocked by: 05, 06

## Question

¿Qué jerarquía visual, gráficas y niveles de detalle presentan los cinco bloques acordados sin saturar el dashboard, y cómo se adaptan de móvil a escritorio?

## Answer

Se valida la variante **A: Recorrido vertical**. Inicio prioriza una sola decisión —continuar la Sesión activa o iniciar el próximo Entrenamiento planificado— y presenta después el Plan, el volumen, los RM recientes y la evolución de un Ejercicio, sin añadir configuraciones ni métricas nuevas.

### Jerarquía y contenido

1. **Entrenamiento actual**: si existe una Sesión activa, muestra nombre, progreso y «Continuar»; en otro caso muestra el próximo Entrenamiento planificado pendiente y «Iniciar». Si no existe ninguno, ofrece iniciar una Sesión libre.
2. **Plan activo**: nombre, semana actual, realizados, omitidos y dos barras simples para avance y cumplimiento según el ticket 06. No incluye calendario ni edición; enlaza al detalle del Plan.
3. **Volumen semanal**: total actual en `kg·rep`, comparación porcentual con la semana anterior y barras de las últimas seis semanas. Solo usa Series de fuerza con carga y no mezcla otras Formas de registro.
4. **RM recientes**: hasta tres RM registrados expresamente por el Deportista, con Ejercicio, carga, repeticiones y fecha. No presenta resultados calculados como récords.
5. **Evolución de un Ejercicio**: selector de Ejercicio y una única serie temporal. Muestra carga máxima para fuerza con carga, repeticiones totales para repeticiones sin carga y duración total para tiempo por serie; cardio continuo indica que no dispone de analítica en el MVP.

Cada bloque ofrece un enlace a su área de detalle. Los estados vacíos explican qué dato falta y conducen a la acción que puede generarlo; no se dibujan gráficas vacías. Las gráficas incluyen siempre título, unidad, valor textual y resumen, de modo que el color o la forma no sean la única vía de lectura.

### Adaptación

En móvil todos los bloques forman una sola columna en ese orden. La acción del entrenamiento ocupa el primer tramo visible y el acceso persistente a una Sesión activa definido en los tickets 04 y 05 mantiene su posición sobre la navegación inferior.

En escritorio el entrenamiento y el Plan comparten la primera fila; volumen y RM recientes forman la segunda; la evolución ocupa el ancho disponible debajo. El contenido, el orden conceptual y las métricas no cambian entre anchuras.

La decisión se comprobó en el navegador de Orca mediante tres prototipos desechables: recorrido vertical, panel de control y Plan con cronología. La primera opción conserva mejor la prioridad diaria y evita la densidad de un panel analítico. Fuente primaria: [`dashboard-prototype.html`](../prototypes/dashboard-prototype.html) (`?variant=A`, `B` o `C`).
