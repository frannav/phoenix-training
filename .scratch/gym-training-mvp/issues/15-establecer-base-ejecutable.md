# 15 — Establecer la base ejecutable

**What to build:** Una base mínima de la aplicación que pueda arrancarse, verificarse y recorrerse en móvil y escritorio, y que deje preparado el seam de pruebas integrado sobre el que crecerán todos los flujos del MVP.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] El frontend React con TypeScript y el backend Bun arrancan mediante comandos documentados y pueden comunicarse bajo el mismo origen lógico.
- [x] El backend usa Hono, devuelve JSON y aplica el formato de error común ante una petición inválida o una ruta de API inexistente.
- [x] La base SQLite se crea exclusivamente mediante las migraciones de Drizzle, con claves foráneas activas y configuración de WAL y espera ante bloqueos preparada para producción.
- [x] El AppShell presenta la navegación adaptable acordada: cinco destinos en móvil y todos los destinos en la barra lateral de escritorio.
- [x] Las rutas públicas y privadas acordadas existen como destinos navegables, aunque los comportamientos de negocio se incorporen en tickets posteriores.
- [x] Durante desarrollo, las peticiones a `/api` llegan al backend sin CORS; la configuración de producción permite servir frontend y API bajo el mismo sitio.
- [x] `bun:test` puede ejecutar una petición HTTP contra una SQLite temporal creada con las migraciones reales y verificar su respuesta observable.
- [x] Vitest y Testing Library pueden renderizar la aplicación y comprobar un comportamiento de navegación sin depender de detalles internos.
- [x] No se incorporan SSR, PWA, store global, framework de componentes, microservicios ni otras capas fuera de la arquitectura aprobada.

## Answer

Implementado en `ff62336` («Establecer base ejecutable de la aplicación»). La base Bun/Hono + SQLite/Drizzle y el frontend React/Vite quedaron conectados bajo el mismo origen lógico, con AppShell, rutas iniciales, formato de errores y seams HTTP/UI de prueba.

Verificación actual sobre `main`: `bun run typecheck`, `bun run test` (130 pruebas backend y 80 frontend), y `bun run build` pasan correctamente.
