# Definir las métricas y sus reglas de cálculo

Type: grilling
Status: resolved
Triage: ready-for-human
Blocked by: 01, 02

## Question

¿Cuáles son las fórmulas, inclusiones, exclusiones y agrupaciones exactas para volumen, carga máxima, repeticiones, duración, RPE medio, RM registrado, 1RM estimado, intensidad relativa, progreso semanal y cumplimiento del Plan?

## Answer

Todas las métricas se calculan únicamente con Series completadas de Sesiones finalizadas. No cuentan objetivos, Series pendientes u omitidas, Sesiones activas ni Sesiones eliminadas. Corregir una Sesión recalcula todas las métricas afectadas; cambiar su Fecha realizada la mueve al periodo correspondiente. Las semanas van de lunes a domingo y las agrupaciones temporales usan la Fecha realizada.

### Métricas por Forma de registro

| Métrica | Regla |
| --- | --- |
| Volumen | Para fuerza con carga, suma de `carga × repeticiones` en kilogramos por repetición. No se calcula para las demás Formas de registro. |
| Carga máxima | Mayor carga completada para un Ejercicio de fuerza con carga. |
| Repeticiones | Suma de repeticiones completadas, separada por Ejercicio, tanto con carga como sin carga. |
| Duración | Suma de segundos completados para Ejercicios de tiempo por serie. La duración de cardio continuo se conserva en el registro, pero no genera analítica en el MVP. |
| RPE medio | Media aritmética de las Series completadas que tengan RPE, sin ponderación. Se calcula con precisión completa y se muestra con un decimal. Si ninguna Serie tiene RPE, no se muestra. |

Las métricas pueden agruparse por Sesión, Ejercicio, semana o intervalo de fechas. Si un Ejercicio aparece varias veces en una Sesión, sus Series se agregan bajo el mismo Ejercicio. Las Sesiones libres y las iniciadas directamente desde una Rutina cuentan en la analítica general, pero no en el progreso de un Plan.

### RM registrado e intensidad relativa

Un RM registrado es una marca introducida expresamente por el Deportista para un Ejercicio, una carga, un número de repeticiones y una fecha. No se crea ni se actualiza automáticamente a partir de una Serie. Para cada número de repeticiones, el vigente en una fecha es el registro más reciente en esa fecha o antes; puede editarse o eliminarse y las métricas dependientes se recalculan.

La intensidad relativa solo se calcula para una Serie de fuerza con carga cuando existe un RM registrado vigente de una repetición para el mismo Ejercicio: `carga de la Serie / carga del RM × 100`. Puede superar el 100 % y se muestra con un decimal. Si no existe ese registro, la intensidad no se muestra.

El **1RM estimado queda fuera del MVP**. No se usa Epley ni ninguna otra fórmula de estimación.

### Progreso del Plan

Cada Entrenamiento planificado está pendiente, realizado u omitido. Las proporciones se calculan tanto para cada semana del Plan como para el Plan completo:

- **Avance:** `(realizados + omitidos) / total de Entrenamientos planificados × 100`.
- **Cumplimiento:** `realizados / total de Entrenamientos planificados × 100`.

Un Entrenamiento planificado cuenta como realizado solo cuando su Sesión está finalizada. Eliminar esa Sesión lo devuelve a pendiente y recalcula ambas proporciones. Los porcentajes se calculan con precisión completa y se muestran redondeados al entero más próximo.
