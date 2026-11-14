import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../types";
import { ensureAuthSchema, generateRandomHex, getSessionUser, requireUser, SESSION_COOKIE } from "../auth";
import { exchangeGoogleCode, getGoogleAuthUrl } from "../services/googleCalendar";
import { loginPage } from "../views/login";

export const authGoogleRoutes = new Hono<AppEnv>();

/** Cookie portant le nonce du flux OAuth en cours ; comparé à celui du `state` au retour de Google. */
const NONCE_COOKIE = "oauth_state_nonce";
const NONCE_TTL_SECONDS = 600;

/** Génère un nonce, le pose en cookie HttpOnly de courte durée et le renvoie pour l'inclure dans le `state`. */
function issueOauthNonce(c: Context<AppEnv>): string {
  const nonce = generateRandomHex(16);
  setCookie(c, NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/auth/google",
    maxAge: NONCE_TTL_SECONDS,
  });
  return nonce;
}

/** Vrai si le nonce du `state` est celui du cookie posé à l'aller ; efface toujours le cookie (usage unique). */
function consumeOauthNonce(c: Context<AppEnv>, stateNonce: unknown): boolean {
  const cookieNonce = getCookie(c, NONCE_COOKIE);
  deleteCookie(c, NONCE_COOKIE, { path: "/auth/google" });
  return typeof stateNonce === "string" && !!cookieNonce && cookieNonce === stateNonce;
}

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
    nonce: issueOauthNonce(c),
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
  const origin = new URL(c.req.url).origin;
  const redirectUri = `${origin}/auth/google/callback`;

  // Le state ne porte pas l'utilisateur : au retour, c'est la session qui le désigne. Seul le nonce le lie au navigateur.
  const stateObj = {
    mode: "calendar",
    nonce: issueOauthNonce(c),
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
    deleteCookie(c, NONCE_COOKIE, { path: "/auth/google" });
    console.error("Google OAuth error:", query.error);
    return c.redirect(`${origin}/?view=kanban&google_error=${encodeURIComponent(query.error)}`);
  }

  const code = query.code;
  const stateStr = query.state;
  if (!code || !stateStr) {
    return c.redirect(`${origin}/login`);
  }

  let parsedState: { mode?: string; nonce?: string };
  try {
    parsedState = JSON.parse(atob(stateStr));
  } catch {
    deleteCookie(c, NONCE_COOKIE, { path: "/auth/google" });
    return c.redirect(`${origin}/login`);
  }

  // Le state doit être celui émis pour ce navigateur (nonce du cookie), sinon la requête est rejetée.
  if (!consumeOauthNonce(c, parsedState.nonce)) {
    return c.redirect(`${origin}/?view=kanban&google_error=invalid_state`);
  }

  // Mode calendrier : la session désigne l'utilisateur, jamais le state ; sans session, rien n'est écrit.
  let sessionUserId: string | null = null;
  if (parsedState.mode !== "login") {
    const sessionUser = await getSessionUser(c);
    if (!sessionUser) return c.redirect(`${origin}/login`);
    sessionUserId = sessionUser.id;
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
    const userId = sessionUserId;

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
