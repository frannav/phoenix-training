# Definir el contrato de registro de cada Forma de registro

Type: grilling
Status: resolved
Triage: ready-for-human

## Question

¿Qué objetivos y resultados admite cada Forma de registro, qué valores son opcionales, qué estados puede tener cada Serie y qué reglas permiten registrar, omitir, añadir, corregir o eliminar datos sin producir combinaciones incoherentes?

## Answer

Cada Serie tiene exactamente uno de estos estados:

| Estado | Significado | Datos permitidos |
| --- | --- | --- |
| Pendiente | Todavía no se ha realizado ni omitido. | Puede tener Objetivos de serie; no tiene Resultado de serie ni RPE de serie. |
| Completada | Se ha realizado y tiene un resultado válido y completo. | Tiene todos los valores de resultado exigidos por su Forma de registro y puede tener RPE de serie. |
| Omitida | Se decidió no realizarla. | Conserva sus Objetivos de serie, pero no tiene Resultado de serie ni RPE de serie. |

Los Objetivos de serie no determinan el estado y son opcionales de manera independiente. Por tanto, una Serie prevista sin ningún valor objetivo sigue expresando la intención de realizar una Serie.

### Contrato por Forma de registro

| Forma de registro | Objetivos admitidos | Resultado exigido al completar | Cardinalidad por aparición del Ejercicio |
| --- | --- | --- | --- |
| Fuerza con carga | Carga y repeticiones, opcionales e independientes. | Carga y repeticiones. | Una o más Series; se pueden añadir Series. |
| Repeticiones sin carga | Repeticiones opcionales. | Repeticiones. | Una o más Series; se pueden añadir Series. |
| Tiempo por serie | Duración opcional. | Duración. | Una o más Series; se pueden añadir Series. |
| Cardio continuo | Duración opcional. | Duración. | Exactamente una Serie; no se pueden añadir más. Un segundo esfuerzo se registra añadiendo de nuevo el Ejercicio a la Sesión de entrenamiento. |

El RPE de serie es opcional en cualquier Forma de registro, pero solo puede existir en una Serie completada.

### Valores válidos

- La carga se expresa en kilogramos, admite desde `0` hasta `9999,99` y tiene como máximo dos decimales.
- Las repeticiones son un entero entre `1` y `9999`.
- La duración es un número entero de segundos entre `1` y `359999` (`99:59:59`).
- El RPE de serie admite valores de `1` a `10` en incrementos de `0,5`.

Estas reglas se aplican por igual a objetivos y resultados cuando la magnitud correspondiente está presente. Un valor inválido se rechaza; nunca se redondea, recorta ni corrige silenciosamente.

### Registro y edición

Un Resultado de serie se guarda de forma atómica: o contiene todos los valores exigidos por la Forma de registro o no se persiste. La interfaz puede conservar temporalmente una entrada parcial como borrador, pero esa entrada no convierte la Serie en completada.

Las Series previstas permanecen para conservar la intención original y no pueden eliminarse individualmente de una Sesión de entrenamiento; si no se realizan, se omiten. Una Serie añadida sobre la marcha comienza pendiente y sí puede eliminarse. Eliminar una Serie añadida que ya tenga resultado requiere confirmación.

Al finalizar una Sesión activa, todas sus Series pendientes pasan a omitidas tras confirmación. La Sesión solo puede finalizar si conserva al menos una Serie completada.

Las correcciones posteriores a la finalización admiten editar Objetivos de serie, Resultados de serie y RPE de serie; cambiar una Serie entre completada y omitida; añadir Series; y eliminar Series que hubieran sido añadidas. Una Sesión finalizada no puede quedar con Series pendientes ni sin al menos una Serie completada. Añadir una Serie a una Sesión finalizada exige aportar a la vez un resultado completo.

En una Sesión activa, pasar una Serie completada a pendiente u omitida elimina su Resultado de serie y su RPE de serie y requiere confirmación. En una Sesión finalizada solo puede pasar a omitida. Restaurar una Serie omitida como completada exige introducir un resultado completo. Toda corrección recalcula las métricas derivadas; no se conserva historial de versiones ni auditoría.
