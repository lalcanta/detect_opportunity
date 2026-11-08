import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./types";
import { publicRoutes } from "./routes/public";
import { leadRoutes } from "./routes/leads";
import { adminRoutes } from "./routes/admin";
import { pageRoutes } from "./routes/pages";
import { scanRoutes } from "./routes/scans";
import { authGoogleRoutes } from "./routes/authGoogle";

export const app = new Hono<AppEnv>();

// Le tracker est appelé depuis la démo (potentiellement ouverte hors de ce domaine).
app.use("/api/tracker/*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));
// Le webhook de capture de leads volontaires ("Demande de rappel") est appelé depuis la landing page publique dissociée.
app.use("/api/public/*", cors({ origin: "*", allowMethods: ["POST", "OPTIONS"] }));

app.route("/", publicRoutes);
app.route("/", leadRoutes);
app.route("/", adminRoutes);
app.route("/", scanRoutes);
app.route("/", authGoogleRoutes);
app.route("/", pageRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal_error" }, 500);
});
