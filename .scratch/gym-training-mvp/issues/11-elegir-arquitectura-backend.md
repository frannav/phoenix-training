# Elegir la arquitectura del backend, persistencia y autenticación

Type: grilling
Status: resolved
Triage: ready-for-human
Blocked by: 01, 02, 10

## Question

¿Qué combinación mínima de servidor Bun, base de datos, acceso a datos, migraciones, validación y autenticación satisface el dominio multiusuario, mantiene aislamiento por Cuenta y sigue siendo sencilla de operar?

## Answer

El backend del MVP usa **Bun + Hono + Zod + SQLite + Drizzle + Better Auth + `bun:test`**. Se prioriza una aplicación monolítica pequeña, ejecutada como un único proceso de larga duración, sin colas, caché distribuida, Redis, microservicios ni capas de abstracción anticipadas.

### HTTP y validación

Hono define las rutas y middleware sobre las primitivas web de Bun. Zod valida parámetros, query y cuerpos en el límite HTTP. Las reglas que dependen del estado del dominio se comprueban dentro del caso de uso, no solo en los esquemas de entrada. Los errores usan un formato JSON único; el contrato concreto se define en el ticket 13.

### Persistencia y migraciones

SQLite es la base de datos del MVP y vive en un archivo sobre volumen persistente. Drizzle es la única capa de acceso y Drizzle Kit es el único dueño del historial de migraciones, incluidas las tablas generadas para Better Auth. En producción se habilitan claves foráneas, modo WAL y un tiempo de espera ante bloqueos.

La aplicación ejecuta una sola instancia con acceso al archivo. Las migraciones se aplican antes de arrancar una nueva versión y nunca desde varias réplicas concurrentes. El despliegue deberá proporcionar volumen persistente y copia de seguridad del archivo; escalar horizontalmente exigirá migrar antes a una base de datos servidor, pero esa migración queda fuera del MVP.

Cada escritura completa del dominio se ejecuta en una transacción. No se introducen repositorios genéricos: los módulos consultan Drizzle mediante funciones específicas para sus casos de uso.

### Autenticación y aislamiento

Better Auth usa correo y contraseña, su adaptador Drizzle y sesiones almacenadas en SQLite mediante cookie segura. No se añaden JWT, sesiones stateless, Redis ni caché de sesión en cookie. Verificación, recuperación y eliminación de Cuenta se concretan en el ticket 12.

Todas las entidades privadas pertenecen a una Cuenta mediante una clave obligatoria. Cada consulta y mutación del dominio filtra por la Cuenta de la sesión autenticada; las relaciones y restricciones únicas incluyen esa propiedad cuando corresponda. Los tests de integración deben demostrar que una Cuenta no puede leer, modificar ni enlazar datos de otra.

Frontend y API se sirven bajo el mismo sitio, con la API en `/api`, para mantener simples las cookies y evitar CORS en producción. `bun:test` prueba casos de uso, rutas Hono y persistencia contra una base SQLite temporal con las migraciones reales.
