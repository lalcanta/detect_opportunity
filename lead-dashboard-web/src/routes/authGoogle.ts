import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import type { AppEnv } from "../types";
import { ensureAuthSchema, requireUser, SESSION_COOKIE } from "../auth";
import { exchangeGoogleCode, getGoogleAuthUrl } from "../services/googleCalendar";
import { loginPage } from "../views/login";

export const authGoogleRoutes = new Hono<AppEnv>();

/**
 * GET /auth/google/login
 * Connexion à l'application via Google OAuth 2.0 (vérifie la Whitelist d'emails au retour).
 */
authGoogleRoutes.get("/auth/google/login", async (c) => {
  await ensureAuthSchema(c.env.DB);
  const clientId = c.env.GOOGLE_CLIENT_ID || "";
  if (!clientId) {
    return c.html(
      loginPage(
        "Google OAuth n'est pas encore configuré (GOOGLE_CLIENT_ID manquant). Connectez-vous avec votre Email et Mot de passe ou activez votre lien d'invitation.",
      ),
      400,
    );
  }
  const origin = new URL(c.req.url).origin;
  const redirectUri = `${origin}/auth/google/callback`;
  const stateObj = {
    mode: "login",
    rand: Math.random().toString(36).substring(2),
    created: Date.now(),
  };
  const state = btoa(JSON.stringify(stateObj));
  const authUrl = getGoogleAuthUrl(c.env, state, redirectUri);
  return c.redirect(authUrl);
});

/**
 * GET /auth/google
 * Redirige l'utilisateur connecté vers l'écran d'autorisation Google OAuth 2.0 (Google Calendar).
 */
authGoogleRoutes.get("/auth/google", requireUser("closer"), async (c) => {
  const user = c.get("user");
  const origin = new URL(c.req.url).origin;
  const redirectUri = `${origin}/auth/google/callback`;

  // Construction d'un state sécurisé liant l'utilisateur
  const stateObj = {
    mode: "calendar",
    userId: user.id,
    rand: Math.random().toString(36).substring(2),
    created: Date.now(),
  };
  const state = btoa(JSON.stringify(stateObj));

  const authUrl = getGoogleAuthUrl(c.env, state, redirectUri);
  return c.redirect(authUrl);
});

/**
 * GET /auth/google/callback
 * Réception du code OAuth retourné par Google :
 * - Mode "login" : vérifie que l'email Google est dans la Whitelist active (`users.email`) et ouvre la session.
 * - Mode "calendar" : rattache Google Calendar à l'utilisateur déjà connecté.
 */
authGoogleRoutes.get("/auth/google/callback", async (c) => {
  await ensureAuthSchema(c.env.DB);
  const query = c.req.query();
  const origin = new URL(c.req.url).origin;
  const redirectUri = `${origin}/auth/google/callback`;

  if (query.error) {
    console.error("Google OAuth error:", query.error);
    return c.redirect(`${origin}/?view=kanban&google_error=${encodeURIComponent(query.error)}`);
  }

  const code = query.code;
  const stateStr = query.state;
  if (!code || !stateStr) {
    return c.redirect(`${origin}/login`);
  }

  let parsedState: { mode?: string; userId?: string };
  try {
    parsedState = JSON.parse(atob(stateStr));
  } catch {
    return c.redirect(`${origin}/login`);
  }

  try {
    const { accessToken, refreshToken, expiryTime, email } = await exchangeGoogleCode(
      code,
      c.env,
      redirectUri,
    );

    if (parsedState.mode === "login") {
      if (!email) {
        return c.html(loginPage("Impossible de récupérer votre adresse email depuis Google."), 401);
      }
      const normalizedEmail = email.trim().toLowerCase();
      const whitelistedUser = await c.env.DB.prepare(
        "SELECT id, access_token, is_active FROM users WHERE LOWER(email) = ? OR LOWER(google_email) = ?",
      )
        .bind(normalizedEmail, normalizedEmail)
        .first<{ id: string; access_token: string; is_active: number }>();

      if (!whitelistedUser || !whitelistedUser.is_active) {
        return c.html(
          loginPage(
            `Accès refusé : l'adresse ${normalizedEmail} ne figure pas dans la liste blanche (Whitelist) des utilisateurs autorisés.`,
          ),
          403,
        );
      }

      // Mise à jour simultanée des jetons Google Agenda + ouverture de la session
      await c.env.DB.prepare(
        `UPDATE users
         SET google_access_token = ?1,
             google_refresh_token = COALESCE(?2, google_refresh_token),
             google_token_expiry = ?3,
             google_email = ?4
         WHERE id = ?5`,
      )
        .bind(accessToken, refreshToken || null, expiryTime, normalizedEmail, whitelistedUser.id)
        .run();

      setCookie(c, SESSION_COOKIE, whitelistedUser.access_token, {
        httpOnly: true,
        secure: new URL(c.req.url).protocol === "https:",
        sameSite: "Lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });

      return c.redirect("/");
    }

    // Mode "calendar" (utilisateur déjà connecté)
    const userId = parsedState.userId;
    if (!userId) {
      return c.redirect(`${origin}/?view=kanban&google_error=invalid_state`);
    }

    await c.env.DB.prepare(
      `UPDATE users
       SET google_access_token = ?1,
           google_refresh_token = COALESCE(?2, google_refresh_token),
           google_token_expiry = ?3,
           google_email = ?4
       WHERE id = ?5`,
    )
      .bind(accessToken, refreshToken || null, expiryTime, email, userId)
      .run();

    return c.redirect(`${origin}/?view=kanban&google=connected`);
  } catch (err) {
    console.error("Erreur exchangeGoogleCode:", err);
    if (parsedState.mode === "login") {
      return c.html(loginPage(`Erreur d'authentification Google : ${(err as Error).message}`), 500);
    }
    return c.redirect(
      `${origin}/?view=kanban&google_error=${encodeURIComponent((err as Error).message)}`,
    );
  }
});

/**
 * GET /api/closer/google-status
 * Retourne le statut de connexion Google Calendar du closer courant.
 */
authGoogleRoutes.get("/api/closer/google-status", requireUser("closer"), async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare(
    "SELECT google_email, google_refresh_token FROM users WHERE id = ?",
  )
    .bind(user.id)
    .first<{ google_email: string | null; google_refresh_token: string | null }>();

  const isConnected = !!(row && row.google_refresh_token);
  return c.json({
    connected: isConnected,
    email: isConnected ? row?.google_email || null : null,
  });
});

/**
 * POST /api/closer/google-disconnect
 * Déconnecte Google Calendar pour le closer courant.
 */
authGoogleRoutes.post("/api/closer/google-disconnect", requireUser("closer"), async (c) => {
  const user = c.get("user");
  await c.env.DB.prepare(
    `UPDATE users
     SET google_access_token = NULL,
         google_refresh_token = NULL,
         google_token_expiry = NULL,
         google_email = NULL
     WHERE id = ?`,
  )
    .bind(user.id)
    .run();

  return c.json({ ok: true, connected: false });
});
