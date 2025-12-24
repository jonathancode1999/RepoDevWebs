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

async function getSiteFromDb() {
  const r = await pool.query(`SELECT value FROM kv_store WHERE key='site' LIMIT 1;`);
  return r.rows?.[0]?.value ?? null;
}
async function upsertSiteToDb(obj) {
  await pool.query(
    `INSERT INTO kv_store (key, value) VALUES ('site', $1)
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

function validateSiteSchema(obj) {
  if (!obj || typeof obj !== "object") return "Body must be a JSON object";
  if (typeof obj.businessName !== "string" || !obj.businessName.trim()) return "Missing businessName";
  if (typeof obj.heroTitle !== "string") return "Missing heroTitle";
  if (typeof obj.heroSubtitle !== "string") return "Missing heroSubtitle";

  if (!obj.contact || typeof obj.contact !== "object") return "Missing contact";
  if (typeof obj.contact.whatsappNumber !== "string" || !obj.contact.whatsappNumber.trim()) return "Missing contact.whatsappNumber";
  if (typeof obj.contact.phoneDisplay !== "string") return "Missing contact.phoneDisplay";
  if (typeof obj.contact.instagramUrl !== "string") return "Missing contact.instagramUrl";

  if (!obj.location || typeof obj.location !== "object") return "Missing location";
  if (typeof obj.location.addressText !== "string") return "Missing location.addressText";
  if (typeof obj.location.mapsQuery !== "string") return "Missing location.mapsQuery";

  if (!obj.hours || typeof obj.hours !== "object") return "Missing hours";
  if (typeof obj.hours.timezone !== "string") return "Missing hours.timezone";
  if (typeof obj.hours.summary !== "string") return "Missing hours.summary";
  if (!obj.hours.schedule || typeof obj.hours.schedule !== "object") return "Missing hours.schedule";
  // minimal: allow keys 0-6 as arrays (can be empty)
  for (const k of ["0","1","2","3","4","5","6"]) {
    const v = obj.hours.schedule[k];
    if (!Array.isArray(v)) return `Invalid hours.schedule.${k}: must be array`;
    for (const rng of v) {
      if (!Array.isArray(rng) || rng.length !== 2) return `Invalid hours.schedule.${k}: each range is ["HH:mm","HH:mm"]`;
    }
  }

  if (typeof obj.payments !== "string") return "Missing payments";
  if (!Array.isArray(obj.highlights)) return "Missing highlights[]";
  if (!Array.isArray(obj.howToOrder)) return "Missing howToOrder[]";
  if (!Array.isArray(obj.faq)) return "Missing faq[]";
  if (!Array.isArray(obj.reviews)) return "Missing reviews[]";
  if (!obj.seo || typeof obj.seo !== "object") return "Missing seo";
  if (typeof obj.seo.title !== "string") return "Missing seo.title";
  if (typeof obj.seo.description !== "string") return "Missing seo.description";
  if (typeof obj.seo.themeColor !== "string") return "Missing seo.themeColor";

  // promo is optional but if present, must be object
  if (obj.promo != null) {
    if (typeof obj.promo !== "object") return "Invalid promo";
    if (typeof obj.promo.enabled !== "boolean") return "Missing promo.enabled";
    if (typeof obj.promo.label !== "string") return "Missing promo.label";
    if (typeof obj.promo.text !== "string") return "Missing promo.text";
    if (typeof obj.promo.buttonText !== "string") return "Missing promo.buttonText";
    if (typeof obj.promo.waMessage !== "string") return "Missing promo.waMessage";
  }

  return "";
}

// Seed from local files (first deploy)
async function seedIfEmpty() {
  // products
  const currentProducts = await getProductsFromDb();
  if (!currentProducts) {
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

  // site
  const currentSite = await getSiteFromDb();
  if (!currentSite) {
    const seedPath = path.join(__dirname, "site.seed.json");
    try {
      const raw = fs.readFileSync(seedPath, "utf-8");
      const obj = JSON.parse(raw);
      const err = validateSiteSchema(obj);
      if (err) throw new Error(err);
      await upsertSiteToDb(obj);
      console.log("Seeded site from site.seed.json");
    } catch (e) {
      console.warn("Could not seed site:", e?.message || e);
    }
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

// API: get site.json
app.get("/site.json", async (_req, res) => {
  try {
    const obj = await getSiteFromDb();
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.status(200).send(JSON.stringify(obj ?? {}, null, 2));
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

// API: update site
app.put("/api/site", async (req, res) => {
  try {
    if (!ADMIN_TOKEN) return res.status(500).send("Missing ADMIN_TOKEN env var");
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${ADMIN_TOKEN}`) return res.status(401).send("Unauthorized");

    const err = validateSiteSchema(req.body);
    if (err) return res.status(400).send(err);

    await upsertSiteToDb(req.body);
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
