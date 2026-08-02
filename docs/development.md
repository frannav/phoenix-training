# Desarrollo local

Phoenix Training se ejecuta como dos procesos durante el desarrollo: Vite sirve el frontend en el puerto `5173` y redirige `/api` al backend Hono en el puerto `3000`. Ambos se consumen como un único origen lógico y no necesitan CORS.

## Requisitos

- Bun 1.3 o posterior.

## Primera ejecución

Desde la raíz del repositorio:

```sh
bun install
bun run db:migrate
bun run dev
```

La aplicación queda disponible en `http://localhost:5173` y la comprobación del backend en `http://localhost:3000/api/health`.

También se pueden iniciar los procesos por separado:

```sh
bun run dev:back
bun run dev:front
```

`PORT`, `FRONTEND_PORT` y `API_PROXY_TARGET` permiten usar otros puertos durante el desarrollo. Si cambia `PORT`, `API_PROXY_TARGET` debe apuntar al nuevo backend.

El backend usa `back/data/phoenix-training.sqlite` si no se define `DATABASE_PATH`. La conexión activa claves foráneas, WAL y una espera de cinco segundos ante bloqueos. El esquema se modifica únicamente mediante las migraciones de Drizzle:

```sh
bun run db:generate
bun run db:migrate
```

La autenticación sirve bajo `/api/auth` con Better Auth. `BETTER_AUTH_SECRET` fija la clave de firma de sesiones y enlaces (sin ella se genera una nueva en cada arranque y las sesiones no sobreviven al reinicio). `APP_BASE_URL` define el origen público de la aplicación —origen de los enlaces de verificación y de la redirección tras verificar— y `API_BASE_URL` el origen directo de la API cuando difiere del de la aplicación; en desarrollo los enlaces apuntan al frontend, que redirige `/api` al backend.

## Verificación

```sh
bun run typecheck
bun run test
bun run build
```

Los tests del backend crean una SQLite temporal y aplican las migraciones de producción antes de hacer peticiones HTTP. Los del frontend renderizan la aplicación en JSDOM y recorren sus destinos mediante enlaces accesibles.

## Producción bajo el mismo sitio

Primero se construye el frontend y se migran los datos; después se inicia una única instancia del backend:

```sh
bun run build
DATABASE_PATH=/var/lib/phoenix-training/app.sqlite bun run db:migrate
NODE_ENV=production DATABASE_PATH=/var/lib/phoenix-training/app.sqlite bun run start
```

En producción, Hono sirve los archivos de `front/dist`, conserva el fallback de React Router y responde la API bajo `/api` desde el mismo sitio. Se puede cambiar el directorio estático mediante `FRONTEND_ROOT` y el puerto mediante `PORT`.
