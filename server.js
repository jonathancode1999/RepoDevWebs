// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();

const PORT = process.env.PORT || 3000;

// Setealo por env para no hardcodear:
// Windows (cmd): set ADMIN_TOKEN=TU_TOKEN && node server.js
// PowerShell: $env:ADMIN_TOKEN="TU_TOKEN"; node server.js
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "CAMBIAME_ESTE_TOKEN";

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");

const SITE_JSON = path.join(PUBLIC_DIR, "site.json");
const PRODUCTS_JSON = path.join(PUBLIC_DIR, "products.json");

const SITE_SEED = path.join(ROOT, "site.seed.json");         // (si existe)
const PRODUCTS_SEED = path.join(ROOT, "products.seed.json"); // (existe en tu estructura)

// ---------- helpers ----------
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writePrettyJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function ensureFileFromSeed(targetPath, seedPath, fallbackObj) {
  if (fs.existsSync(targetPath)) return;

  try {
    if (seedPath && fs.existsSync(seedPath)) {
      const seed = readJson(seedPath);
      writePrettyJson(targetPath, seed);
      console.log("Created", path.relative(ROOT, targetPath), "from", path.relative(ROOT, seedPath));
      return;
    }
  } catch (e) {
    console.warn("Seed read error:", seedPath, e.message);
  }

  writePrettyJson(targetPath, fallbackObj);
  console.log("Created", path.relative(ROOT, targetPath), "from fallback object");
}

function auth(req, res, next) {
  const h = req.headers["authorization"] || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1].trim() : "";
  if (!token) return res.status(401).send("Missing Bearer token");
  if (token !== ADMIN_TOKEN) return res.status(403).send("Invalid token");
  return next();
}

// ---------- bootstrap (create missing json from seeds) ----------
ensureFileFromSeed(
  SITE_JSON,
  SITE_SEED,
  {
    area: "Quilmes",
    about: "Café de especialidad · pastelería · sandwiches.",
    hours: { sunday: "Cerrado", saturday: "09:00–21:00", weekdays: "08:00–20:00" },
    promo: {
      text: "Promo: 2x1 en espresso de 08:00 a 10:00",
      ctaHref: "",
      ctaText: "Reservar por WhatsApp",
      enabled: false
    },
    logoUrl: "",
    payments: ["Efectivo", "Débito", "Crédito", "Mercado Pago"],
    addressFull: "San Martín 780, Quilmes, Provincia de Buenos Aires.",
    addressShort: "San Martín 780, Quilmes (B1878)",
    businessName: "Voltri Café de Especialidad",
    businessShort: "Voltri",
    instagramUrl: "https://www.instagram.com/",
    mapsEmbedUrl: "",
    mapsSearchUrl: "https://www.google.com/maps/search/?api=1&query=San+Martin+780,+Quilmes",
    whatsappE164: "5491100000000"
  }
);

ensureFileFromSeed(
  PRODUCTS_JSON,
  PRODUCTS_SEED,
  { categories: [] }
);

// ---------- middleware ----------
app.use(express.json({ limit: "2mb" }));

// Static serving for your structure: /, /admin, /img/*, logo.jpg, etc.
app.use(
  express.static(PUBLIC_DIR, {
    etag: false,
    lastModified: false,
    setHeaders(res) {
      res.setHeader("Cache-Control", "no-store");
    },
    extensions: ["html"]
  })
);

// ---------- API ----------
app.put("/api/site", auth, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object") return res.status(400).send("Body must be JSON object");
  try {
    writePrettyJson(SITE_JSON, body);
    return res.status(200).send("OK");
  } catch (e) {
    return res.status(500).send("Write error: " + e.message);
  }
});

app.put("/api/products", auth, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object") return res.status(400).send("Body must be JSON object");
  try {
    writePrettyJson(PRODUCTS_JSON, body);
    return res.status(200).send("OK");
  } catch (e) {
    return res.status(500).send("Write error: " + e.message);
  }
});

// ---------- routes ----------
app.get("/admin", (req, res) => {
  // sirve public/admin/index.html
  res.sendFile(path.join(PUBLIC_DIR, "admin", "index.html"));
});

// Fallback: si no encontró archivo estático, devolvemos la home
// (te permite rutas tipo /#seccion, o links "bonitos" si agregás)
app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// ---------- start ----------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log("Public dir:", path.relative(ROOT, PUBLIC_DIR));
  console.log("site.json:", path.relative(ROOT, SITE_JSON));
  console.log("products.json:", path.relative(ROOT, PRODUCTS_JSON));
  console.log("ADMIN_TOKEN:", ADMIN_TOKEN === "CAMBIAME_ESTE_TOKEN" ? "(default - CHANGE IT!)" : "(set via env)");
});
