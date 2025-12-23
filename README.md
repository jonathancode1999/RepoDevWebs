# Voltri (Web + Admin) para Render

## Qué incluye
- Sitio público: `/` (index.html) + `/indexMenu.html`
- Carta dinámica: `GET /products.json` (sale de Postgres)
- Admin: `/admin/` (edita y guarda products.json)
- Galería: `/img/*` (tus imágenes + `img/images.json`)
- Logo: `/logo.jpg`

## Por qué Postgres y no editar archivos
En Render, el filesystem del servicio es **efímero** por defecto (se pierde al reiniciar / redeploy).
La doc oficial lo dice: por defecto es epímero, y los discos persistentes requieren servicio pago. citeturn0search2turn0search3

Por eso guardamos `products.json` en **Render Postgres (Free)**, que sí persiste.

## Deploy en Render
1) Creá un **Postgres** (Free).
2) Creá un **Web Service** desde este repo.
3) Variables de entorno:
   - `DATABASE_URL` (te lo da Render al linkear Postgres)
   - `ADMIN_TOKEN` (token largo, 32+ chars)
4) Build Command: `npm install`
5) Start Command: `npm start`

## Rutas
- `GET /products.json`
- `PUT /api/products` (Authorization: Bearer <ADMIN_TOKEN>)
- `GET /admin/` (editor)
