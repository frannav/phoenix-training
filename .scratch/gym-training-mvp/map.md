# Especificar el MVP de entrenamiento personal

Label: wayfinder:map
Status: resolved

## Destination

Una especificación funcional, de experiencia y técnica del MVP lista para convertirse en un plan de implementación, con un frontend React en `front/` y un backend Bun en `back/`.

## Notes

- Dominio y vocabulario: [`CONTEXT.md`](../../CONTEXT.md).
- Cada sesión que trabaje el mapa debe usar `wayfinder`, `grilling` y `domain-modeling`; los tickets visuales usan `prototype` y los de investigación usan `research`.
- El mapa decide y especifica; la implementación queda fuera de esta iniciativa.
- El producto es privado y multiusuario para Deportistas que entrenan por su cuenta. La interfaz es web mobile-first, también usable en escritorio, solo en español y kilogramos.
- El frontend acordado es React con Vite. El backend es un monolito Bun con Hono, Zod, SQLite, Drizzle, Better Auth y `bun:test`, desplegado inicialmente como una sola instancia.
- El núcleo incluye Rutinas reutilizables, Planes de varias semanas, una sola activación simultánea, entrenamientos específicos del Plan, Sesiones libres, objetivos opcionales y resultados reales por serie, RPE por serie, corrección y eliminación de sesiones.
- Las Formas de registro son fuerza con carga, repeticiones sin carga, tiempo por serie y cardio continuo. En el MVP, cardio solo conserva duración y no produce analítica propia.
- El catálogo combina ejercicios comunes procedentes de `hasaneyldrm/exercises-dataset` con Ejercicios personalizados privados.
- El dashboard acordado muestra sesión activa o próxima, progreso del Plan, volumen semanal, récords recientes y evolución histórica de un Ejercicio.

## Decisions so far

<!-- Las decisiones resueltas se enlazan aquí; el detalle vive únicamente en el ticket correspondiente. -->

- [Investigar el dataset de ejercicios y sus assets](issues/08-investigar-dataset-ejercicios.md) — Los datos son reutilizables bajo MIT, pero los JPG/GIF requieren una licencia propia; el catálogo debe importarse como un snapshot versionado con identidad interna.
- [Investigar el ecosistema Bun para el backend del MVP](issues/10-investigar-backend-bun.md) — Hono y Elysia son las rutas viables; PostgreSQL, Drizzle, Better Auth y `bun:test` forman la base de comparación, mientras SQLite impone operación monoinstancia.
- [Definir la semántica temporal de Rutinas, Planes y Sesiones](issues/01-definir-semantica-temporal.md) — Los Planes mantienen referencias vivas a Rutinas, las personalizaciones se independizan y cada Sesión guarda objetivos y resultados editables sin sincronización ni versionado posterior.
- [Definir el contrato de registro de cada Forma de registro](issues/02-definir-contrato-registro.md) — Las Series son pendientes, completadas u omitidas; cada Forma de registro tiene valores y cardinalidad explícitos, y las altas, correcciones y eliminaciones preservan resultados atómicos.
- [Definir el ciclo de vida completo de un Plan de entrenamiento](issues/03-definir-ciclo-plan.md) — Los Planes pasan de borrador a activo y completado, fijan sus fechas al activarse y admiten cambios solo sobre Entrenamientos planificados pendientes.
- [Definir las métricas y sus reglas de cálculo](issues/06-definir-metricas.md) — Las Sesiones finalizadas producen agregados explícitos por Forma de registro y progreso del Plan; el MVP conserva RM reales y excluye cualquier 1RM estimado.
- [Elegir la arquitectura del backend, persistencia y autenticación](issues/11-elegir-arquitectura-backend.md) — El MVP usa un monolito Bun con Hono, Zod, SQLite, Drizzle y Better Auth en una única instancia con volumen persistente.
- [Validar la experiencia móvil de una Sesión activa](issues/04-validar-sesion-movil.md) — La Sesión usa una sola columna con Ejercicios plegables, registro compacto por Serie, guardado visible y finalización fija con confirmación de pendientes.
- [Validar la arquitectura de información del producto](issues/05-validar-arquitectura-informacion.md) — Inicio, Planes, Rutinas e Historial son destinos directos en móvil; Ejercicios y Cuenta viven en Más, el escritorio muestra todas las áreas y la Sesión activa permanece accesible globalmente.
- [Validar el dashboard minimalista y la visualización del progreso](issues/07-validar-dashboard.md) — Inicio usa un recorrido vertical que prioriza el entrenamiento actual y resume después Plan, volumen semanal, RM recientes y evolución de un Ejercicio con gráficas simples y accesibles.
- [Decidir la estrategia de integración del catálogo de Ejercicios](issues/09-decidir-integracion-catalogo.md) — El catálogo es un snapshot revisado, sin medios ni sincronización automática; usa identidad interna, nombres españoles y Formas de registro locales, y conserva como no disponibles los Ejercicios ya referenciados.
- [Definir el ciclo de vida y la propiedad de una Cuenta](issues/12-definir-ciclo-cuenta.md) — La Cuenta pasa de pendiente de verificación a verificada, usa sesiones de Better Auth y permite recuperación, cierre y eliminación definitiva de todos sus datos privados mediante reglas pequeñas y explícitas.
- [Definir el contrato API y la estrategia de guardado](issues/13-definir-contrato-api.md) — La API REST intercambia agregados completos con revisión optimista; cada escritura es transaccional, las entradas parciales viven en el navegador y las métricas se calculan al leer sin procesos derivados.
- [Elegir la arquitectura del frontend React](issues/14-elegir-arquitectura-frontend.md) — El frontend Vite se organiza por funcionalidad y usa React Router, TanStack Query, React Hook Form, Zod, Recharts y CSS Modules sin store global, SSR, PWA ni capas genéricas.
- [Recuperar credenciales y controlar sesiones](issues/17-recuperar-credenciales-controlar-sesiones.md) — La recuperación usa respuesta indistinguible, tokens de un solo uso y reenvío de verificación para Cuentas pendientes; los cambios de contraseña y el cierre total revocan todas las sesiones.
- [Gestionar Ejercicios personalizados](issues/19-gestionar-ejercicios-personalizados.md) — Los Ejercicios personalizados son privados por Cuenta, editables solo mientras su Forma de registro sea compatible y combinados con el catálogo compartido en listados y selectores; archivar conserva las referencias existentes.
- [Establecer la base ejecutable](issues/15-establecer-base-ejecutable.md) — Implementado en `ff62336`; la base Bun/Hono, SQLite/Drizzle, React/Vite, AppShell, rutas iniciales y seams de prueba están disponibles para los flujos posteriores.
- [Registrar, verificar y acceder a una Cuenta](issues/16-registrar-verificar-acceder-cuenta.md) — Implementado en `1a8d12d`; el flujo de Cuenta cubre registro, verificación, entrada y cierre de sesión con aislamiento entre Cuentas.
- [Explorar el catálogo revisado de Ejercicios](issues/18-explorar-catalogo-revisado-ejercicios.md) — Implementado en `0837e7e`; el catálogo local versionado ofrece búsqueda, filtros, paginación opaca y actualizaciones con identidades estables.
- [Mantener RM registrados](issues/20-mantener-rm-registrados.md) — Implementado en `92e8302` y reparado en `bd134b3`; los RM cubren vigencia temporal, edición, eliminación y aislamiento por Cuenta sin estimaciones.
- [Crear y reutilizar Rutinas](issues/21-crear-reutilizar-rutinas.md) — Implementado en `3424b28` y reparado en `99b8fa8`; el agregado de Rutina incluye sustitución con revisión optimista atómica, archivo/restauración, API, UI y aislamiento por Cuenta.
- [Diseñar Planes borrador](issues/22-disenar-planes-borrador.md) — Implementado en `b360628` (merge de `6add71d`); los Planes de varias semanas incluyen referencias vivas a Rutinas, personalización independiente, editor React, sustitución con revisión optimista, eliminación protegida y aislamiento por Cuenta.
- [Iniciar y reanudar una Sesión libre](issues/25-iniciar-reanudar-sesion-libre.md) — Una Cuenta mantiene como máximo una Sesión activa; el agregado se reanuda desde la API con revisión y último Ejercicio confirmado, mientras Inicio y AppShell ofrecen acceso persistente y la pantalla completa oculta navegación competidora.
- [Registrar resultados por Serie](issues/26-registrar-resultados-serie.md) — Implementado en `33a1b03` (merge de `bf2efef`) y reparado en `842f6c1`; las Sesiones activas registran estados, objetivos, resultados y RPE con validación atómica, guardado inmediato, conflictos de revisión e interfaz compacta.
- [Consultar y corregir el Historial](issues/29-consultar-corregir-historial.md) — Implementado en `7d46dc1`, reparado en `04d4ed6`; el Historial permite listar, consultar, corregir y eliminar Sesiones finalizadas con paginación opaca, invariantes de Series, conflictos que cargan la versión vigente y transiciones correctas de Planes.

## Deferred to implementation planning

- El texto final de estados vacíos y errores y la revisión de accesibilidad pantalla por pantalla; deben respetar las reglas funcionales ya decididas en los prototipos.
- Límites de rendimiento adicionales a la paginación acordada; se introducirán solo a partir de medidas sobre la implementación.
- Proveedor de despliegue, observabilidad, copias de seguridad y recuperación para la instancia Bun con volumen SQLite.
- Desglose de implementación y cobertura de pruebas por ticket; las arquitecturas frontend y backend ya fijan sus herramientas y responsabilidades.

## Out of scope

- PWA, aplicación nativa, uso offline y sincronización local-first.
- Temporizadores de ejecución o descanso.
- Series de aproximación, superseries, circuitos, dropsets y otros bloques avanzados.
- Distancia, ritmo o analítica de cardio más allá de registrar su duración.
- Nutrición, peso o medidas corporales, coaching, funciones sociales, retos, notificaciones push, wearables y pagos.
- Internacionalización, interfaz en otros idiomas y cargas en libras.
