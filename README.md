# Sitio + Admin (Render)

## Rutas
- `/` -> sitio público (public/index.html)
- `/indexMenu.html` -> carta rápida/pedido
- `/admin/` -> admin (editar site.json y products.json)

## Endpoints
- GET `/products.json`
- PUT `/api/products` (Bearer token)
- GET `/site.json`
- PUT `/api/site` (Bearer token)

## Variables de entorno (Render)
- `DATABASE_URL` (Postgres)
- `ADMIN_TOKEN` (token secreto)

## Notas
- La primera vez se hace seed desde `products.seed.json` y `site.seed.json`.
