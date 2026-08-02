# Elegir la arquitectura del frontend React

Type: grilling
Status: resolved
Triage: ready-for-human
Blocked by: 04, 05, 07, 09, 11, 13

## Question

¿Qué estructura mínima de rutas, estado de interfaz, datos remotos, formularios, gráficas y componentes compartidos permite implementar los prototipos validados en `front/` sin introducir complejidad innecesaria?

## Answer

El frontend es una aplicación **React + TypeScript creada con Vite**. Usa React Router para rutas, TanStack Query para datos remotos, React Hook Form con Zod para formularios, Recharts únicamente para las gráficas del dashboard y CSS Modules con un pequeño fichero de variables globales. No se añade framework de componentes, SSR, Redux, Zustand, PWA ni soporte offline.

### Rutas

Las rutas públicas son `/entrar`, `/registro`, `/verificar`, `/recuperar` y `/restablecer`. Tras autenticar, un único `AppShell` implementa la navegación del ticket 05:

| Ruta | Área |
| --- | --- |
| `/` | Inicio y dashboard. |
| `/planes`, `/planes/nuevo`, `/planes/:planId` | Listado, creación y detalle o edición de Planes. |
| `/rutinas`, `/rutinas/nueva`, `/rutinas/:rutinaId` | Listado, creación y detalle o edición de Rutinas. |
| `/historial`, `/historial/:sesionId` | Sesiones finalizadas y su detalle o corrección. |
| `/ejercicios` | Catálogo, personalizados y RM registrados. |
| `/cuenta` | Credenciales, sesiones y eliminación de Cuenta. |
| `/sesion/:sesionId` | Sesión activa a pantalla completa según el ticket 04. |

No existe una ruta principal «Sesiones». El acceso persistente a la Sesión activa se monta una vez en `AppShell`; al entrar en su pantalla conserva la cabecera y los controles propios y oculta navegación que compita con el registro.

### Estructura

`front/src` se organiza por funcionalidad, no por tipo técnico global:

```text
src/
  app/          router, providers y AppShell
  features/     auth, dashboard, plans, routines, sessions,
                history, exercises y account
  shared/       cliente HTTP, componentes básicos, estilos y utilidades puras
```

Cada funcionalidad contiene sus páginas, componentes, esquemas de formulario, llamadas API y claves de consulta. No se crean repositorios, servicios genéricos, modelos duplicados ni un directorio global para cada clase de fichero. Una funcionalidad usa otra mediante un componente o contrato público pequeño, no importando sus detalles internos.

### Estado y datos

TanStack Query es la única caché de datos del servidor. Las claves parten del recurso y sus filtros; tras una mutación se escribe la respuesta canónica y se invalidan de forma amplia las vistas afectadas —Inicio, Plan, Historial o Sesión activa— porque el volumen del MVP es pequeño.

El estado efímero permanece en el componente o formulario. Los filtros compartibles usan la URL. React Context se limita a providers técnicos; no mantiene copias de Rutinas, Planes, Cuenta ni Sesión. Así se evita sincronizar un store global con la API.

Un cliente `fetch` compartido añade JSON y credenciales, interpreta el error común del ticket 13 y no conoce recursos concretos. Cada funcionalidad define funciones pequeñas para sus endpoints. Vite redirige `/api` al backend durante desarrollo y producción sirve ambos bajo el mismo sitio.

### Formularios y guardado

React Hook Form mantiene borradores y Zod ofrece feedback inmediato; el servidor sigue siendo la autoridad. Rutinas y Planes envían su documento completo al guardar. La Sesión conserva entradas parciales por fila y solo muta la API cuando una acción produce una Serie válida, mostrando «Guardando», «Guardado» o «Error al guardar».

Un conflicto `409` detiene nuevas mutaciones, recupera el documento vigente y avisa que la Sesión cambió en otra pestaña; no implementa fusión. Las acciones destructivas usan un único componente de diálogo de confirmación.

### Componentes y gráficas

Solo se comparten primitivas que ya aparecen en varias áreas: botones, campos, diálogo, estado vacío, indicador de guardado, `AppShell`, navegación móvil, barra lateral, acceso a Sesión activa y envoltorios accesibles de gráfica. Los componentes propios de Planes, Rutinas o Sesiones permanecen dentro de su funcionalidad.

Recharts representa las barras y líneas decididas en el ticket 07. Cada gráfica recibe datos ya agregados por la API y se acompaña de unidad, último valor y resumen textual; no realiza cálculos de dominio en el navegador.

Vitest y Testing Library cubren utilidades, formularios y componentes con comportamiento. Los contratos y reglas del dominio se prueban principalmente en el backend; no se incorpora un segundo sistema de pruebas end-to-end hasta que exista un flujo implementado que lo justifique.
