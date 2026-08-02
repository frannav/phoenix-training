# Entrenamiento de fuerza

Este contexto describe cómo una persona planifica, realiza y analiza su propio entrenamiento físico.

## Language

**Deportista**:
Persona que entrena por su cuenta y es dueña de sus rutinas y registros de entrenamiento.
_Avoid_: Usuario, cliente, entrenador

**Cuenta**:
Identidad privada mediante la que un Deportista accede a sus datos de entrenamiento.
_Avoid_: Deportista, perfil público

**Cuenta pendiente de verificación**:
Cuenta cuyo correo todavía no se ha confirmado y que aún no puede acceder a datos de entrenamiento.
_Avoid_: Cuenta activa, invitación

**Cuenta verificada**:
Cuenta cuyo correo se ha confirmado y que puede iniciar sesión para acceder a sus datos de entrenamiento.
_Avoid_: Cuenta activa, perfil

**Rutina**:
Plantilla reutilizable que define los ejercicios y objetivos previstos para un entrenamiento.
_Avoid_: Sesión, entrenamiento realizado

**Rutina archivada**:
Rutina retirada de los usos nuevos que conserva su identidad y las referencias existentes desde Planes y Sesiones.
_Avoid_: Rutina eliminada

**Sesión de entrenamiento**:
Registro de los ejercicios realizados en un entrenamiento. Puede originarse en una Rutina, en un día de un Plan de entrenamiento o comenzar sin planificación previa.
_Avoid_: Rutina, plantilla

**Sesión libre**:
Sesión de entrenamiento que comienza sin Rutina ni día de un Plan de entrenamiento como origen.
_Avoid_: Rutina, entrenamiento programado

**Sesión activa**:
Única Sesión de entrenamiento que un Deportista ha iniciado y todavía no ha finalizado.
_Avoid_: Sesión finalizada, Entrenamiento planificado

**Sesión finalizada**:
Sesión de entrenamiento que el Deportista ha dado por terminada y que forma parte de su historial.
_Avoid_: Sesión activa, Plan completado

**Origen de sesión**:
Entrenamiento planificado o Rutina desde el que comenzó una Sesión de entrenamiento; una Sesión libre carece de origen.
_Avoid_: Objetivo de serie, copia de Rutina

**Plan de entrenamiento**:
Organización de entrenamientos a lo largo de una o varias semanas. Cada día puede usar una Rutina o definir un entrenamiento específico para ese día.
_Avoid_: Rutina, calendario

**Plan borrador**:
Plan de entrenamiento todavía editable que no tiene fechas previstas ni ocupa el calendario de un Deportista.
_Avoid_: Plan activo, Plan completado

**Plan activo**:
Único Plan de entrenamiento que ocupa el calendario actual de un Deportista.
_Avoid_: Plan guardado, Plan completado

**Plan completado**:
Plan de entrenamiento que el Deportista ha marcado como terminado y conserva como histórico.
_Avoid_: Plan activo

**Entrenamiento planificado**:
Entrada de un Plan de entrenamiento asociada a una fecha prevista y compuesta por una Rutina o por ejercicios definidos específicamente para ese día.
_Avoid_: Sesión de entrenamiento, Rutina

**Entrenamiento específico**:
Contenido de un Entrenamiento planificado definido directamente para ese día e independiente de cualquier Rutina.
_Avoid_: Rutina, referencia a Rutina

**Entrenamiento omitido**:
Entrenamiento planificado que el Deportista decide no realizar y que no produce una Sesión de entrenamiento.
_Avoid_: Sesión incompleta, Serie omitida

**Fecha prevista**:
Día del calendario asignado a un Entrenamiento planificado dentro de un Plan de entrenamiento.
_Avoid_: Fecha realizada

**Fecha realizada**:
Día en el que tuvo lugar una Sesión de entrenamiento, independientemente de la Fecha prevista de su origen.
_Avoid_: Fecha prevista

**Ejercicio**:
Movimiento o actividad física cuya prescripción y ejecución se expresan mediante una Forma de registro.
_Avoid_: Serie, entrenamiento

**Ejercicio del catálogo**:
Ejercicio compartido disponible como punto de partida para todos los Deportistas.
_Avoid_: Ejercicio personalizado

**Ejercicio personalizado**:
Ejercicio privado definido por un Deportista para cubrir una actividad que no está en el catálogo.
_Avoid_: Ejercicio del catálogo

**Ejercicio no disponible**:
Ejercicio retirado de usos nuevos que conserva su identidad y todas las referencias existentes desde Rutinas, Planes y Sesiones.
_Avoid_: Ejercicio eliminado

**Forma de registro**:
Conjunto de magnitudes con las que se prescribe y registra un Ejercicio: fuerza con carga, repeticiones sin carga, tiempo por serie o cardio continuo.
_Avoid_: Tipo de ejercicio

**Objetivo de serie**:
Valores opcionales que expresan lo previsto para una serie antes de realizarla.
_Avoid_: Resultado, serie completada

**Serie**:
Unidad individual con la que se prescribe o registra un esfuerzo de un Ejercicio.
_Avoid_: Serie de aproximación, ejercicio

**Serie prevista**:
Serie definida antes de iniciar una Sesión de entrenamiento y conservada en ella como parte de la intención original.
_Avoid_: Serie añadida, Serie eliminable

**Serie añadida**:
Serie incorporada a un Ejercicio durante una Sesión de entrenamiento sin formar parte de la intención original.
_Avoid_: Serie prevista, Serie de aproximación

**Serie pendiente**:
Serie de una Sesión activa que todavía no se ha completado ni omitido.
_Avoid_: Serie incompleta, Serie omitida

**Serie completada**:
Serie realizada que contiene un Resultado de serie válido para su Forma de registro.
_Avoid_: Serie pendiente, Serie omitida

**Resultado de serie**:
Valores que dejan constancia de lo realizado realmente en una serie durante una Sesión de entrenamiento.
_Avoid_: Objetivo, prescripción

**Serie omitida**:
Serie que el Deportista decide no realizar durante una Sesión de entrenamiento.
_Avoid_: Serie completada, serie eliminada

**RPE de serie**:
Valor opcional de 1 a 10 que expresa el esfuerzo percibido al completar una serie.
_Avoid_: RPE del ejercicio, intensidad relativa

**RM registrado**:
Mejor marca real de un Ejercicio declarada por el Deportista y asociada a una fecha y un número de repeticiones.
_Avoid_: récord calculado, estimación de RM

**Intensidad relativa**:
Proporción entre la carga de una serie y el 1RM registrado vigente del mismo Ejercicio.
_Avoid_: RPE, esfuerzo percibido
