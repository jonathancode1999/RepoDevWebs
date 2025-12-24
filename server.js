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

// ====== Auth middleware ======
function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return res.status(500).send("Missing ADMIN_TOKEN env var");
  const auth = (req.headers.authorization || "").trim();
  if (auth !== `Bearer ${ADMIN_TOKEN}`) return res.status(401).send("Unauthorized");
  return next();
}

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
  if (typeof obj.businessName !== "string") return "Invalid schema: businessName";
  if (typeof obj.tagline !== "string") return "Invalid schema: tagline";
  if (typeof obj.heroTitle !== "string") return "Invalid schema: heroTitle";
  if (typeof obj.heroSubtitle !== "string") return "Invalid schema: heroSubtitle";

  if (!obj.contact || typeof obj.contact !== "object") return "Invalid schema: contact";
  if (typeof obj.contact.whatsappNumber !== "string") return "Invalid schema: contact.whatsappNumber";
  if (typeof obj.contact.phoneDisplay !== "string") return "Invalid schema: contact.phoneDisplay";
  if (typeof obj.contact.instagramUrl !== "string") return "Invalid schema: contact.instagramUrl";

  if (!obj.location || typeof obj.location !== "object") return "Invalid schema: location";
  if (typeof obj.location.addressLine !== "string") return "Invalid schema: location.addressLine";
  if (typeof obj.location.mapsEmbedUrl !== "string") return "Invalid schema: location.mapsEmbedUrl";
  if (typeof obj.location.mapsLinkUrl !== "string") return "Invalid schema: location.mapsLinkUrl";

  if (!obj.hours || typeof obj.hours !== "object") return "Invalid schema: hours";
  if (typeof obj.hours.summary !== "string") return "Invalid schema: hours.summary";
  if (!Array.isArray(obj.hours.lines)) return "Invalid schema: hours.lines[]";
  if (!obj.hours.schedule || typeof obj.hours.schedule !== "object") return "Invalid schema: hours.schedule";

  if (typeof obj.paymentsLine !== "string") return "Invalid schema: paymentsLine";
  if (typeof obj.priceRangeLine !== "string") return "Invalid schema: priceRangeLine";

  if (!obj.promo || typeof obj.promo !== "object") return "Invalid schema: promo";
  if (typeof obj.promo.enabled !== "boolean") return "Invalid schema: promo.enabled (boolean)";

  if (!obj.featured || typeof obj.featured !== "object") return "Invalid schema: featured";
  if (typeof obj.featured.title !== "string") return "Invalid schema: featured.title";
  if (typeof obj.featured.text !== "string") return "Invalid schema: featured.text";

  if (!obj.menu || typeof obj.menu !== "object") return "Invalid schema: menu";
  if (typeof obj.menu.note !== "string") return "Invalid schema: menu.note";

  if (!obj.howToOrder || typeof obj.howToOrder !== "object") return "Invalid schema: howToOrder";
  if (!Array.isArray(obj.howToOrder.steps)) return "Invalid schema: howToOrder.steps[]";

  if (!obj.faq || typeof obj.faq !== "object") return "Invalid schema: faq";
  if (!Array.isArray(obj.faq.items)) return "Invalid schema: faq.items[]";

  if (!obj.footer || typeof obj.footer !== "object") return "Invalid schema: footer";
  if (typeof obj.footer.extra !== "string") return "Invalid schema: footer.extra";

  return "";
}

// Seed from local file (first deploy)

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
    if (!obj) return res.status(404).send("Not found");
    res.json(obj);
  } catch (e) {
    console.error(e);
    res.status(500).send("DB error");
  }
});

// API: update products
app.put("/api/products", requireAdmin, async (req, res) => {
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


// API: update site (protected)
app.put("/api/site", requireAdmin, async (req, res) => {
  try {
    const obj = req.body;
    const err = validateSiteSchema(obj);
    if (err) return res.status(400).send(err);
    await upsertSiteToDb(obj);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
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