# Investigar el ecosistema Bun para el backend del MVP

Type: research
Status: resolved
Triage: ready-for-agent

## Question

¿Qué opciones actuales y mantenidas ofrece el ecosistema Bun para servidor HTTP, validación, persistencia y migraciones, sesiones de autenticación con correo y contraseña, pruebas y despliegue, según documentación y código de fuentes primarias?

## Context

- Restricción acordada: backend sencillo sobre Bun en `back/`.
- Hallazgos: [Ecosistema Bun viable para el backend del MVP](../research/bun-backend-ecosystem.md).

## Answer

El ecosistema actual permite dos conjuntos pequeños de producción: Hono + Zod o Elysia + validación integrada, ambos con PostgreSQL, Drizzle, Better Auth y `bun:test`. Better Auth cubre sesiones, correo/contraseña, verificación y recuperación, pero requiere proveedor de correo; SQLite solo simplifica si se acepta una instancia con volumen persistente. Drizzle encaja bien, aunque su driver Bun SQL actual debe evaluarse con cautela por estar documentado sobre la línea RC. Hechos, restricciones y preguntas abiertas: [Ecosistema Bun viable para el backend del MVP](../research/bun-backend-ecosystem.md).
