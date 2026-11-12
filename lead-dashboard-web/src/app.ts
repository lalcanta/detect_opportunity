import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./types";
import { ensureAuthSchema } from "./auth";
import { loadOpportunityDefinitions } from "./services/opportunityStore";
import { publicRoutes } from "./routes/public";
import { leadRoutes } from "./routes/leads";
import { adminRoutes } from "./routes/admin";
import { pageRoutes } from "./routes/pages";
import { scanRoutes } from "./routes/scans";
import { authGoogleRoutes } from "./routes/authGoogle";
import { opportunityRoutes } from "./routes/opportunities";

export const app = new Hono<AppEnv>();

// Empêcher tout cache intempestif des pages HTML par les navigateurs ou le CDN Edge
app.use("*", async (c, next) => {
  await next();
  const ct = c.res.headers.get("Content-Type") || "";
  if (ct.includes("text/html")) {
    c.res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    c.res.headers.set("Pragma", "no-cache");
    c.res.headers.set("Expires", "0");
  }
});

// Définitions des besoins : la base fait foi (onglet admin « Besoins »), chargée dans le registre partagé.
app.use("*", async (c, next) => {
  if (c.env?.DB) {
    await ensureAuthSchema(c.env.DB);
    await loadOpportunityDefinitions(c.env.DB);
  }
  await next();
});

// Le tracker est appelé depuis la démo (potentiellement ouverte hors de ce domaine).
app.use("/api/tracker/*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));
// Le webhook de capture de leads volontaires ("Demande de rappel") est appelé depuis la landing page publique dissociée.
app.use("/api/public/*", cors({ origin: "*", allowMethods: ["POST", "OPTIONS"] }));

app.route("/", publicRoutes);
app.route("/", leadRoutes);
app.route("/", adminRoutes);
app.route("/", scanRoutes);
app.route("/", opportunityRoutes);
app.route("/", authGoogleRoutes);
app.route("/", pageRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal_error" }, 500);
});
