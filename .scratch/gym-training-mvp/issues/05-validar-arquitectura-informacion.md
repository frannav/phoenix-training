# Validar la arquitectura de información del producto

Type: prototype
Status: resolved
Triage: ready-for-human
Blocked by: 03, 04

## Question

¿Cómo deben organizarse dashboard, Rutinas, Planes, Sesiones, historial, Ejercicios y Cuenta para que la navegación sea limpia en móvil y completa en escritorio, manteniendo siempre accesible una Sesión activa?

## Answer

Se valida la variante **A: Cinco destinos**. La arquitectura usa nombres de dominio explícitos para que las áreas frecuentes estén a un toque y evita introducir agrupaciones ambiguas como «Planificar», «Progreso» o «Biblioteca».

### Navegación móvil

La barra inferior contiene cinco destinos:

1. **Inicio**: dashboard y punto de entrada al entrenamiento próximo.
2. **Planes**: Plan activo, Planes borrador y Planes completados.
3. **Rutinas**: listado, creación y edición de Rutinas.
4. **Historial**: Sesiones finalizadas, con acceso a su detalle y corrección.
5. **Más**: hoja con **Ejercicios** y **Cuenta**, las dos áreas de uso menos frecuente. La cabecera puede ofrecer además un acceso directo a Cuenta mediante el avatar.

No existe un destino principal llamado «Sesiones». Una Sesión activa se abre desde su acceso persistente; las Sesiones finalizadas viven en Historial. Una Sesión nueva comienza desde un Entrenamiento planificado, una Rutina o la acción de iniciar una Sesión libre en Inicio. Si ya existe una Sesión activa, estas entradas conducen a ella según el ticket 04.

### Navegación de escritorio

El escritorio conserva la misma arquitectura, pero hace visibles todos los destinos en una barra lateral:

- **General**: Inicio.
- **Organizar**: Planes y Rutinas.
- **Entrenamiento**: Historial y Ejercicios.
- **Cuenta**: anclada al final de la barra.

La adaptación entre móvil y escritorio cambia la presentación, no la ubicación conceptual ni los nombres de las áreas.

### Sesión activa persistente

Cuando existe una Sesión activa, todas las pantallas muestran un acceso persistente con su nombre, progreso y acción «Continuar». En móvil aparece acoplado sobre la barra inferior; en escritorio, como franja visible sobre el contenido. Este acceso no sustituye el indicador de guardado ni los controles internos de la pantalla de Sesión definidos en el ticket 04.

La decisión se validó comparando tres prototipos desechables en móvil y escritorio. La variante A fue elegida por ofrecer la estructura más directa para el MVP: destinos frecuentes visibles, profundidad mínima y correspondencia clara entre ambas anchuras.
