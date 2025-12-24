import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// ====== Config ======
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || "").trim();
const DATABASE_URL = (process.env.DATABASE_URL || "").trim();

// Render/managed Postgres typically requires SSL
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

// ====== DB helpers ======
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getProductsFromDb() {
  const r = await pool.query(`SELECT value FROM kv_store WHERE key='products' LIMIT 1;`);
  return r.rows?.[0]?.value ?? null;
}

async function upsertProductsToDb(obj) {
  await pool.query(
    `INSERT INTO kv_store (key, value) VALUES ('products', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
    [obj]
  );
}

// ====== Validation ======
function validateProductsSchema(obj) {
  if (!obj || typeof obj !== "object") return "Body must be a JSON object";
  if (!Array.isArray(obj.categories)) return "Invalid schema: categories[]";
  for (const c of obj.categories) {
    if (!c || typeof c.category !== "string") return "Invalid schema: category.category";
    if (!Array.isArray(c.items)) return "Invalid schema: category.items[]";
    for (const it of c.items) {
      if (!it || typeof it.name !== "string") return "Invalid schema: item.name";
      if (typeof it.description !== "string") return "Invalid schema: item.description";
      if (typeof it.price !== "string") return "Invalid schema: item.price";
    }
  }
  return "";
}

// Seed from local file (first deploy)
async function seedIfEmpty() {
  const current = await getProductsFromDb();
  if (current) return;
  const seedPath = path.join(__dirname, "products.seed.json");
  try {
    const raw = fs.readFileSync(seedPath, "utf-8");
    const obj = JSON.parse(raw);
    const err = validateProductsSchema(obj);
    if (err) throw new Error(err);
    await upsertProductsToDb(obj);
    console.log("Seeded products from products.seed.json");
  } catch (e) {
    console.warn("Could not seed products:", e?.message || e);
  }
}

// ====== App ======
const app = express();
app.use(express.json({ limit: "512kb" }));

// serve static
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

// API: get products.json
app.get("/products.json", async (_req, res) => {
  try {
    const obj = await getProductsFromDb();
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.status(200).send(JSON.stringify(obj ?? { business: "Voltri", currency: "ARS", categories: [] }, null, 2));
  } catch (_e) {
    res.status(500).send("DB error");
  }
});

// API: update products
app.put("/api/products", async (req, res) => {
  try {
    if (!ADMIN_TOKEN) return res.status(500).send("Missing ADMIN_TOKEN env var");
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${ADMIN_TOKEN}`) return res.status(401).send("Unauthorized");

    const err = validateProductsSchema(req.body);
    if (err) return res.status(400).send(err);

    await upsertProductsToDb(req.body);
    res.status(200).send("OK");
  } catch (_e) {
    res.status(500).send("DB error");
  }
});

// Convenience route
app.get("/admin", (_req, res) => {
  res.redirect("/admin/");
});

app.listen(PORT, async () => {
  await ensureTable();
  await seedIfEmpty();
  console.log(`Server running on :${PORT}`);
});
