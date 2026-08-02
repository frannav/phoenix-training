# Validar la experiencia móvil de una Sesión activa

Type: prototype
Status: resolved
Triage: ready-for-human
Blocked by: 02

## Question

¿Qué flujo y disposición permiten iniciar, reanudar, registrar y finalizar una Sesión con el mínimo de toques, incluyendo objetivos, resultados, RPE, series omitidas y cambios sobre la marcha?

## Answer

Se valida la variante **C: Ejercicios plegables**. La Sesión activa usa una sola columna y un acordeón de Ejercicios; solo uno permanece desplegado para reducir desplazamiento y conservar el contexto de la Serie que se está registrando.

### Inicio y reanudación

- «Iniciar» desde un Entrenamiento planificado o una Rutina crea la Sesión y abre directamente su pantalla, sin paso de confirmación intermedio.
- Una Sesión libre abre la misma pantalla vacía y muestra de inmediato el selector para añadir el primer Ejercicio.
- Si ya existe una Sesión activa, cualquier acceso para entrenar conduce a ella en lugar de crear otra.
- La Sesión activa permanece accesible desde todas las pantallas mediante un indicador persistente. Al reanudarla se recupera el último estado guardado y se abre el último Ejercicio utilizado.

### Disposición

La cabecera fija muestra el nombre, el Origen de sesión y el estado de guardado. Debajo aparece un resumen con Series completadas, omitidas y pendientes. Cada Ejercicio plegado muestra su nombre y progreso; al desplegarlo presenta todas sus Series en filas compactas.

Cada fila contiene número de Serie, resultado exigido por su Forma de registro, RPE opcional, acción de completar y acción de omitir o restaurar. Los valores objetivo inicializan los campos de resultado, pero la Serie continúa pendiente hasta que el Deportista la completa expresamente. Esto permite aceptar el objetivo con un toque o modificar únicamente lo que cambió.

La acción «Finalizar» permanece fija en la parte inferior. «Añadir ejercicio» aparece al final de la lista y «Añadir serie» dentro del Ejercicio desplegado.

### Registro y cambios durante la Sesión

- Completar guarda el Resultado de serie de forma atómica. Si falta un valor obligatorio, la fila lo señala y no cambia de estado.
- El RPE se elige en la misma fila y sigue siendo opcional.
- Una Serie pendiente se omite directamente. Omitir una Serie completada exige confirmación porque elimina su resultado y RPE.
- Añadir una Serie crea una Serie añadida pendiente y propone los valores de la Serie anterior como borrador. Puede eliminarse según las reglas del ticket 02.
- Un Ejercicio añadido durante la Sesión puede eliminarse con confirmación si ya contiene resultados. Un Ejercicio procedente del origen conserva sus Series previstas; para no realizarlo se omiten sus Series.
- Las acciones completas —completar, omitir, restaurar, añadir o eliminar— se guardan inmediatamente. Una entrada parcial permanece como borrador visual y no se presenta como guardada ni como Resultado de serie.

### Finalización y feedback

La Sesión solo puede finalizar con al menos una Serie completada. Si quedan Series pendientes, una hoja de confirmación indica cuántas pasarán a omitidas. Tras confirmar, se guarda la Sesión finalizada y se muestra su resumen.

Los estados se distinguen mediante icono, texto y estilo, sin depender únicamente del color. Los errores aparecen junto al campo afectado y el indicador de cabecera diferencia «Guardando», «Guardado» y «Error al guardar», con una acción de reintento cuando corresponda.

La decisión se validó comparando tres prototipos desechables en el navegador de Orca. La variante C fue elegida por el usuario por mantener visible el progreso de todos los Ejercicios sin saturar la pantalla móvil.
