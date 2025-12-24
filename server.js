const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();

const PORT = process.env.PORT || 3000;

// Token: podés setearlo por env ADMIN_TOKEN
// Ej Windows: set ADMIN_TOKEN=TU_TOKEN && node server.js
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "CAMBIAME_ESTE_TOKEN";

const PUBLIC_DIR = path.join(__dirname, "public");
const SITE_PATH = path.join(PUBLIC_DIR, "site.json");
const PRODUCTS_PATH = path.join(PUBLIC_DIR, "products.json");

app.use(express.json({ limit: "2mb" }));

// static
app.use(express.static(PUBLIC_DIR, {
  extensions: ["html"],
  etag: false,
  lastModified: false,
  setHeaders(res){
    res.setHeader("Cache-Control", "no-store");
  }
}));

function ensureJsonFile(filePath, defaultObj){
  if(!fs.existsSync(filePath)){
    fs.writeFileSync(filePath, JSON.stringify(defaultObj, null, 2), "utf8");
  }
}

ensureJsonFile(SITE_PATH, {
  area: "Quilmes",
  about: "Café de especialidad · pastelería · sandwiches.",
  hours: { sunday: "Cerrado", saturday: "09:00–21:00", weekdays: "08:00–20:00" },
  promo: { text: "Promo: 2x1 en espresso de 08:00 a 10:00", ctaHref: "", ctaText: "Reservar por WhatsApp", enabled: true },
  logoUrl: "",
  payments: ["Efectivo","Débito","Crédito","Mercado Pago"],
  addressFull: "San Martín 780, Quilmes, Provincia de Buenos Aires.",
  addressShort: "San Martín 780, Quilmes (B1878)",
  businessName: "Voltri Café de Especialidad",
  instagramUrl: "https://www.instagram.com/",
  mapsEmbedUrl: "",
  whatsappE164: "5491100000000",
  businessShort: "Voltri",
  mapsSearchUrl: "https://www.google.com/maps/search/?api=1&query=San+Martin+780,+Quilmes"
});

ensureJsonFile(PRODUCTS_PATH, { categories: [] });

function auth(req, res, next){
  const h = req.headers["authorization"] || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1].trim() : "";
  if(!token) return res.status(401).send("Missing Bearer token");
  if(token !== ADMIN_TOKEN) return res.status(403).send("Invalid token");
  return next();
}

function writePrettyJson(filePath, body, res){
  try{
    fs.writeFileSync(filePath, JSON.stringify(body, null, 2), "utf8");
    return res.status(200).send("OK");
  }catch(e){
    return res.status(500).send("Write error: " + e.message);
  }
}

app.put("/api/site", auth, (req, res) => {
  const body = req.body;
  if(!body || typeof body !== "object") return res.status(400).send("Body must be JSON object");
  return writePrettyJson(SITE_PATH, body, res);
});

app.put("/api/products", auth, (req, res) => {
  const body = req.body;
  if(!body || typeof body !== "object") return res.status(400).send("Body must be JSON object");
  return writePrettyJson(PRODUCTS_PATH, body, res);
});

// fallback (si no encuentra ruta, sirve index)
app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
  console.log("ADMIN_TOKEN =", ADMIN_TOKEN === "CAMBIAME_ESTE_TOKEN" ? "(default - change it!)" : "(set)");
});
