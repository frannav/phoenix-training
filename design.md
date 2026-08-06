# Phoenix Training — sistema visual

## Fuente y dirección

Este sistema toma como referencia `style.html`: una interfaz de sala de control
para entrenamiento, con una estética de videojuego de 8 bits aplicada a datos
reales. La referencia aporta tres ideas que se mantienen en toda la aplicación:

- contraste alto y composición editorial, con grandes titulares y bloques bien
  delimitados;
- tipografía sans para leer y tipografía monoespaciada para estados, metadatos y
  valores de entrenamiento;
- bordes duros, sombras desplazadas y acentos de estado en lugar de tarjetas
  suaves o decoración gratuita.

La interfaz usa el vocabulario del dominio: Deportista, Rutina, Plan de
entrenamiento, Entrenamiento planificado, Ejercicio, Serie y Sesión de
entrenamiento. No se usan términos de competición que no aportan información
para entrenar.

## Principios

1. **Una pantalla, una misión.** Cada página debe dejar claro qué se organiza,
   qué se registra o qué se revisa.
2. **La intención primero.** En Planes y Rutinas se muestra primero el nombre,
   el día, la Rutina o el Ejercicio; los detalles de series aparecen debajo.
3. **Densidad controlada.** Los formularios largos se dividen en bloques
   plegables y los campos opcionales no compiten con los obligatorios.
4. **Estado visible.** Borrador, activo, completado, archivado y pendiente se
   expresan con texto y color; el color nunca es la única señal.
5. **Acciones reversibles.** Archivar, omitir o quitar siempre se presenta como
   una acción explícita, y las acciones principales permanecen localizables.

## Tokens

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-ink` | `#000000` | Texto, bordes y navegación principal |
| `--color-ink-muted` | `#71717a` | Ayuda, metadatos y estados secundarios |
| `--color-surface` | `#ffffff` | Superficie de tarjetas y formularios |
| `--color-surface-muted` | `#f4f4f5` | Fondos alternos, filas de series y estados inactivos |
| `--color-border` | `#d4d4d8` | Separadores de baja intensidad |
| `--color-accent-soft` | `#e4e4e7` | Selección y contenedores activos |
| `--color-accent-strong` | `#000000` | Acción principal sobre fondo claro |
| `--color-danger` | `#ef4444` | Errores, archivado y acciones destructivas |
| `--color-warning` | `#eab308` | Atención y pendiente |

Las esquinas son cuadradas. Los elementos principales usan borde de 2–4 px y
una sombra negra desplazada de 3–6 px. Las sombras no simulan elevación: marcan
jerarquía y hacen que la interfaz se lea como un panel físico. El fondo general
es blanco; los grises claros quedan reservados para superficies secundarias y
contenedores activos. No se usa textura ni cuadrícula de fondo.

## Tipografía

- **Public Sans** para navegación, títulos y texto corrido.
- **Courier New** como tipografía `pixel` para etiquetas cortas, fechas,
  cantidades, indicadores de semana y pequeños estados técnicos.
- Los titulares pueden ir en mayúsculas y con tracking amplio; los textos de
  ayuda deben conservar una lectura normal.

## Composición

- En escritorio: navegación lateral oscura de ancho fijo y lienzo claro con
  contenido de hasta 72rem.
- En móvil: cabecera compacta y navegación inferior fija con cuatro destinos.
- Los títulos de página llevan un eyebrow técnico, un titular grande y una
  descripción breve. Las secciones se identifican con una barra lateral de
  color o un encabezado monoespaciado.
- Los bloques de contenido se organizan como módulos: panel de acción, lista de
  resultados, estado vacío y panel de confirmación.

## Marcadores de dominio

La referencia visual incluía `Rank: S/A/B` y `Score`. Phoenix Training no los
usa por ahora porque convierten el entrenamiento personal en una competición
artificial. Se sustituyen por información accionable:

- **Foco:** la intención de una Rutina o Plan, por ejemplo Fuerza, Volumen,
  Técnica, Acondicionamiento o Recuperación.
- **Estado:** Borrador, Activo, Completado, Archivado, Pendiente, Realizado u
  Omitido.
- **Ritmo:** sesiones realizadas, entrenamientos pendientes y continuidad del
  Plan. Es una observación del proceso, no una puntuación.
- **Volumen:** suma o evolución de la magnitud propia de la Forma de registro
  cuando exista; nunca se presenta como Score global.

## Formularios

### Ejercicios

El flujo principal pide Nombre, Forma de registro, Categoría e Instrucciones.
Parte del cuerpo y Equipamiento son metadatos opcionales dentro de un bloque
plegable. La Forma de registro queda bloqueada al editar para no romper las
Series existentes.

### Rutinas

Una Rutina empieza con su nombre y permite añadir Ejercicios uno a uno desde un
selector con búsqueda. Cada Ejercicio tiene una tarjeta compacta de Series
previstas: solo aparecen las magnitudes admitidas por su Forma de registro. La
acción `Añadir serie` queda junto a la última serie y guardar/cancelar permanece
visible al final del flujo.

### Planes

Un Plan se organiza por semanas plegables. Cada semana resume cuántos
Entrenamientos planificados contiene y permite añadir el siguiente con una sola
acción. Un día puede reutilizar una Rutina o definirse desde cero; el mismo
Ejercicio puede aparecer en varios días porque cada día representa una
prescripción independiente.

## Accesibilidad y estados

Todos los controles tienen foco visible, texto accesible y estados de error
asociados al campo. El amarillo queda reservado para atención y el rojo para
errores y acciones destructivas; el negro sostiene la jerarquía principal. Los
controles táctiles mantienen una altura cómoda incluso dentro de los formularios
densos.
