# 15 — Establecer la base ejecutable

**What to build:** Una base mínima de la aplicación que pueda arrancarse, verificarse y recorrerse en móvil y escritorio, y que deje preparado el seam de pruebas integrado sobre el que crecerán todos los flujos del MVP.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] El frontend React con TypeScript y el backend Bun arrancan mediante comandos documentados y pueden comunicarse bajo el mismo origen lógico.
- [ ] El backend usa Hono, devuelve JSON y aplica el formato de error común ante una petición inválida o una ruta de API inexistente.
- [ ] La base SQLite se crea exclusivamente mediante las migraciones de Drizzle, con claves foráneas activas y configuración de WAL y espera ante bloqueos preparada para producción.
- [ ] El AppShell presenta la navegación adaptable acordada: cinco destinos en móvil y todos los destinos en la barra lateral de escritorio.
- [ ] Las rutas públicas y privadas acordadas existen como destinos navegables, aunque los comportamientos de negocio se incorporen en tickets posteriores.
- [ ] Durante desarrollo, las peticiones a `/api` llegan al backend sin CORS; la configuración de producción permite servir frontend y API bajo el mismo sitio.
- [ ] `bun:test` puede ejecutar una petición HTTP contra una SQLite temporal creada con las migraciones reales y verificar su respuesta observable.
- [ ] Vitest y Testing Library pueden renderizar la aplicación y comprobar un comportamiento de navegación sin depender de detalles internos.
- [ ] No se incorporan SSR, PWA, store global, framework de componentes, microservicios ni otras capas fuera de la arquitectura aprobada.
