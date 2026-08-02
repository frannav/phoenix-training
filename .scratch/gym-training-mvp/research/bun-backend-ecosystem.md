# Ecosistema Bun viable para el backend del MVP

Investigación realizada el 31 de julio de 2026. Se han usado documentación, repositorios y notas de versión oficiales. Este informe reduce el espacio de opciones; no elige la arquitectura definitiva.

## Resumen

Hay dos pilas pequeñas y coherentes para un backend Bun de producción y una tercera variante útil solo si se acepta su límite operativo:

1. **Hono + Zod + PostgreSQL + Drizzle + Better Auth + `bun:test`**: usa primitivas web estándar, tiene integraciones oficiales con Bun y Better Auth y conserva más portabilidad entre runtimes.
2. **Elysia + validación integrada (`t`) + PostgreSQL + Drizzle + Better Auth + `bun:test`**: reduce el pegamento de rutas, tipos y validación, a cambio de un mayor acoplamiento a Elysia y a su enfoque Bun-first.
3. **`Bun.serve` + Zod + SQLite nativo + Better Auth + `bun:test`**: tiene pocas dependencias, pero obliga al proyecto a construir más infraestructura HTTP propia y restringe el despliegue a una instancia con disco persistente. Es una variante de prototipo o de producción deliberadamente monoinstancia, no una sustitución transparente de PostgreSQL.

Todos los componentes anteriores están mantenidos actualmente: la versión estable publicada de Bun es 1.3.14, Hono 4.12.33 y Elysia 1.4.29; sus repositorios muestran publicaciones durante 2026 ([Bun releases](https://github.com/oven-sh/bun/releases), [Hono releases](https://github.com/honojs/hono/releases), [Elysia releases](https://github.com/elysiajs/elysia/releases)). En componentes de seguridad se debe fijar una versión estable reciente y automatizar parches: tanto Hono como Better Auth han publicado correcciones de seguridad durante 2026 ([Hono releases](https://github.com/honojs/hono/releases), [Better Auth security update](https://better-auth.com/blog/security-update-june-2026)).

## Hechos comprobados

### Runtime y servidor HTTP

- Bun ejecuta TypeScript directamente e implementa las APIs web `Request`, `Response`, `Headers` y `fetch`. Su servidor nativo `Bun.serve` incluye routing por método y parámetros desde Bun 1.2.3 ([servidor HTTP de Bun](https://bun.com/docs/runtime/http/server), [APIs web de Bun](https://bun.com/docs/runtime/web-apis)). Es suficiente para una API REST sin framework, pero la aplicación tendría que definir por sí misma composición de middleware, validación, errores, CORS y convenciones de rutas.
- Hono tiene un adaptador/plantilla oficial para Bun, trabaja con `Request`/`Response` y su misma aplicación puede ejecutarse en otros runtimes soportados. En Bun se puede exportar directamente su `fetch` handler ([Hono sobre Bun](https://hono.dev/docs/getting-started/bun), [runtimes soportados por Hono](https://hono.dev/docs)).
- Elysia está diseñado prioritariamente para Bun. Incluye routing, ciclo de vida, inferencia de tipos y validación; desde Elysia 1.2 existen adaptadores para otros runtimes, aunque el proyecto declara que Bun sigue siendo el runtime primario ([Elysia 1.2](https://elysiajs.com/blog/elysia-12), [Elysia validation](https://elysiajs.com/tutorial/getting-started/validation/)).
- La compatibilidad de Bun con Node no es total. Bun marca módulos como `async_hooks`, `worker_threads`, `node:test` y otros como parciales o ausentes; cualquier paquete pensado para Node que no tenga soporte Bun explícito necesita una prueba real en CI ([matriz de compatibilidad Node de Bun](https://bun.com/docs/runtime/nodejs-compat)). Hono y Elysia evitan esa incertidumbre en la capa HTTP porque ambos documentan Bun de forma explícita.

### Validación

- Hono trae un validador deliberadamente fino. Su documentación ofrece middleware oficial para Zod y para Standard Schema; puede validar `json`, query, parámetros, cabeceras y cookies. Para JSON, el `Content-Type` correcto es obligatorio ([validación de Hono](https://hono.dev/docs/guides/validation)).
- Zod 4 es estable, no tiene dependencias externas, infiere tipos TypeScript y puede producir JSON Schema ([documentación de Zod](https://zod.dev/)). Es la opción con integración explícita más directa para Hono mediante `@hono/zod-validator` o `@hono/standard-validator`.
- Elysia valida body, query, params, headers, cookies y respuestas con `Elysia.t`; también acepta Zod, Valibot y otras implementaciones de Standard Schema ([validación de Elysia](https://elysiajs.com/tutorial/getting-started/validation/), [Elysia 1.4 y Standard Schema](https://elysiajs.com/blog/elysia-14)). Por ello, usar `t` reduce dependencias, mientras que usar Zod aumenta la posibilidad de compartir esquemas con el frontend.

### Persistencia y migraciones

- Bun incluye un cliente SQL nativo que detecta PostgreSQL, MySQL o SQLite a partir de la URL. Para SQLite no hay pool: cada `SQL` representa una conexión y la concurrencia se gobierna mediante bloqueo del archivo; Bun recomienda WAL para mejorarla ([Bun SQL](https://bun.com/docs/runtime/sql)). `bun:sqlite` también expone directamente la base SQLite ([Bun SQLite](https://bun.com/docs/runtime/sqlite)). Ninguno de esos clientes sustituye por sí solo un historial de migraciones de la aplicación.
- Drizzle soporta PostgreSQL con `node-postgres` y `postgres.js`, ambos documentados con comandos Bun. Drizzle Kit genera migraciones SQL versionadas y las aplica con `drizzle-kit migrate`; `push` modifica el esquema directamente y la propia documentación lo presenta como una vía conveniente para iteración, no como el flujo de migraciones versionadas ([Drizzle con PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql), [Drizzle Kit](https://orm.drizzle.team/docs/kit-overview)).
- Drizzle documenta un driver para el SQL nativo de Bun, pero su guía actual instala las versiones `@rc` y aún muestra una advertencia histórica ligada a Bun 1.2.0 ([Drizzle con Bun SQL](https://orm.drizzle.team/docs/get-started/bun-sql-new)). Para una decisión conservadora hoy, el camino estable documentado con `pg` o `postgres.js` tiene menos incertidumbre que introducir simultáneamente Drizzle 1.0 RC y su driver Bun SQL.
- Kysely es una alternativa mantenida y más cercana a SQL: declara soporte para Bun y ofrece un dialecto PostgreSQL de su equipo que admite tanto Postgres.js como el SQL nativo de Bun ([repositorio Kysely](https://github.com/kysely-org/kysely), [dialecto `kysely-postgres-js`](https://github.com/kysely-org/kysely-postgres-js)). Better Auth usa Kysely internamente para sus adaptadores directos de PostgreSQL/SQLite, pero elegir Kysely para el dominio seguiría requiriendo diseñar y mantener las migraciones de las tablas de entrenamiento.
- Better Auth se integra oficialmente con Drizzle y puede generar su esquema para que las migraciones se apliquen con Drizzle Kit. Su comando `migrate` directo solo está disponible para el adaptador Kysely incorporado; con Drizzle se usa `generate` y después el migrador del ORM ([adaptador Drizzle de Better Auth](https://better-auth.com/docs/adapters/drizzle), [base de datos y migraciones de Better Auth](https://better-auth.com/docs/concepts/database)). Esto favorece usar un único dueño del historial de migraciones, no mezclar migraciones directas de Better Auth y Drizzle sobre las mismas tablas.

### Autenticación con correo y contraseña

- Better Auth es agnóstico de framework y tiene guías oficiales tanto para Hono como para Elysia/Bun. En ambos casos se monta un handler basado en `Request`/`Response`; las guías incluyen CORS con credenciales y middleware para recuperar usuario y sesión ([integración Hono](https://better-auth.com/docs/integrations/hono), [integración Elysia](https://better-auth.com/docs/integrations/elysia)).
- Ofrece correo/contraseña, verificación de correo y recuperación de contraseña. Usa `scrypt` por defecto y permite cambiar el algoritmo. La verificación y el restablecimiento requieren que la aplicación conecte un proveedor de correo transaccional: Better Auth genera el enlace/token y llama a la función de envío, pero no entrega el correo por sí mismo ([correo de Better Auth](https://better-auth.com/docs/concepts/email), [seguridad de Better Auth](https://better-auth.com/docs/reference/security)).
- Por defecto usa sesiones tradicionales respaldadas por base de datos y una cookie de sesión; la expiración predeterminada es de siete días y se renueva según `updateAge`. El cache de sesión en cookie es opcional y puede retrasar el efecto de una revocación en otros dispositivos ([gestión de sesiones](https://better-auth.com/docs/concepts/session-management)). Para este MVP no hace falta Redis ni sesiones stateless.
- Better Auth incluye protección CSRF basada en origen/Fetch Metadata, `trustedOrigins`, cookies firmadas y rate limiting. El rate limiter está habilitado en producción, pero su almacenamiento predeterminado es memoria, por lo que una aplicación con varias instancias necesita almacenamiento de rate limit compartido o en base de datos ([seguridad](https://better-auth.com/docs/reference/security), [rate limiting](https://better-auth.com/docs/concepts/rate-limit)).
- Si `front/` y `back/` están en orígenes distintos, el frontend debe enviar credenciales, el servidor debe declarar un origen exacto y CORS debe registrarse antes de las rutas de autenticación. Better Auth usa `SameSite=Lax` por defecto y recomienda subdominios antes que cookies cross-site; `SameSite=None` exige `Secure` ([cookies cross-domain con Hono](https://better-auth.com/docs/integrations/hono)).
- Lucia no es una alternativa mantenida para este proyecto: su sitio oficial indica que la librería fue deprecada en marzo de 2025 ([Lucia](https://lucia-auth.com/)).

### Pruebas

- `bun:test` ofrece API similar a Jest, descubrimiento, mocks, snapshots, reintentos, aleatorización, salida JUnit y cobertura text/LCOV integrada ([test runner de Bun](https://bun.com/docs/test), [cobertura](https://bun.com/docs/test/code-coverage)). Debe usarse en lugar de `node:test`, cuya compatibilidad en Bun es parcial.
- Hono permite probar la API sin abrir un puerto mediante `app.request`; Elysia hace lo mismo con `app.handle(new Request(...))`. Ambos patrones funcionan con `bun:test` ([tests de Hono](https://hono.dev/docs/guides/testing), [tests de Elysia](https://elysiajs.com/patterns/unit-test)). Esto cubre rutas y middleware; las migraciones y consultas requieren además tests contra la misma familia de base de datos elegida para producción.

### Restricciones de despliegue

- Bun publica una imagen Docker oficial; Docker mantiene abierta la elección de proveedor y permite fijar la versión del runtime ([guía Docker de Bun](https://bun.com/docs/guides/ecosystem/docker)). Bun también documenta despliegue directo en Railway y Render, ambos con PostgreSQL gestionado disponible ([Railway](https://bun.com/docs/guides/deployment/railway), [Render](https://bun.com/docs/guides/deployment/render)).
- El runtime Bun de Vercel Functions sigue etiquetado como beta y su sistema de archivos solo ofrece `/tmp` efímero; por tanto, no puede alojar de forma duradera una base SQLite local ([Bun en Vercel](https://vercel.com/docs/functions/runtimes/bun), [filesystem de Vercel Functions](https://vercel.com/docs/functions/runtimes)).
- En servicios de larga duración, SQLite exige montar el archivo en un volumen persistente. Esos volúmenes suelen limitar el escalado horizontal: por ejemplo, Render no permite escalar a varias instancias un servicio con disco y pierde zero-downtime deploys ([discos persistentes de Render](https://render.com/docs/disks)). PostgreSQL gestionado evita que el estado viva en el contenedor y permite cambiar el número de instancias del backend sin replicar archivos manualmente.

## Recomendaciones para la decisión posterior

Estas recomendaciones son condiciones de aceptación, no una elección final de pila:

- Evaluar solo **Hono** y **Elysia** como framework. `Bun.serve` aporta valor únicamente si se acepta construir las convenciones HTTP que ambos ya resuelven.
- Mantener **PostgreSQL + Drizzle estable** como base de comparación para producción; evaluar SQLite únicamente contra un despliegue monoinstancia con volumen, copias de seguridad y downtime aceptados explícitamente.
- Si se usa Drizzle, hacer que **Drizzle Kit sea el único aplicador de migraciones**, incluyendo el esquema generado por Better Auth.
- Usar **Better Auth estable con sesiones en base de datos**, verificación de correo obligatoria, recuperación de contraseña, `trustedOrigins` explícitos y un proveedor de correo todavía por decidir. No activar cookie cache, Redis, sesiones stateless ni plugins adicionales sin una necesidad del MVP.
- Preferir frontend y API bajo el mismo sitio registrable o detrás de un proxy común. Si siguen separados, probar cookies y CORS desde el navegador móvil antes de comprometer el despliegue.
- Ejecutar `bun:test` en Linux y un smoke test de registro, verificación, login, renovación/revocación de sesión, migraciones y consultas en CI. Fijar Bun y dependencias con `bun.lock` y usar instalaciones reproducibles mediante `bun ci` ([instalaciones reproducibles de Bun](https://bun.com/docs/pm/cli/install)).
- Desplegar inicialmente como proceso Bun de larga duración en Docker o en un servicio con soporte Bun explícito. La alternativa serverless debe justificar sus límites de filesystem, tareas de envío de correo y migraciones.

## Preguntas que siguen abiertas para el ticket de decisión

1. ¿Se prima portabilidad y familiaridad (**Hono + Zod**) o la integración Bun-first y menor pegamento (**Elysia + `t`**)?
2. ¿El coste operativo de PostgreSQL gestionado es aceptable desde el MVP, o se acepta conscientemente el límite monoinstancia de SQLite?
3. ¿Se prefiere Drizzle, con esquema declarativo y migraciones generadas, o Kysely, más cercano a SQL y al adaptador interno de Better Auth?
4. ¿Dónde se desplegarán `front/` y `back/` y compartirán el mismo sitio para cookies?
5. ¿Qué proveedor enviará los correos de verificación y recuperación?
