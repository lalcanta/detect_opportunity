import type { Bindings, User } from "../types";

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export function getGoogleAuthUrl(env: Bindings, state: string, redirectUri: string): string {
  const clientId = env.GOOGLE_CLIENT_ID || "";
  const scopes = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(
  code: string,
  env: Bindings,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken?: string; expiryTime: number; email: string | null }> {
  const clientId = env.GOOGLE_CLIENT_ID || "";
  const clientSecret = env.GOOGLE_CLIENT_SECRET || "";

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => "");
    throw new Error(`Échec échange code Google OAuth (${tokenRes.status}) : ${errText}`);
  }

  const tokenData = (await tokenRes.json()) as GoogleTokenResponse;
  const expiryTime = Date.now() + (tokenData.expires_in || 3600) * 1000;

  // Récupération de l'email Google de l'utilisateur
  let email: string | null = null;
  try {
    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (userinfoRes.ok) {
      const info = (await userinfoRes.json()) as { email?: string };
      email = info.email || null;
    }
  } catch {}

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiryTime,
    email,
  };
}

export async function getValidGoogleAccessToken(
  db: D1Database,
  userId: string,
  env: Bindings,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT google_access_token, google_refresh_token, google_token_expiry FROM users WHERE id = ?")
    .bind(userId)
    .first<{ google_access_token: string | null; google_refresh_token: string | null; google_token_expiry: number | null }>();

  if (!row || !row.google_refresh_token) return null;

  // Si le token est encore valide pour au moins 2 minutes, on le réutilise
  const now = Date.now();
  if (row.google_access_token && row.google_token_expiry && row.google_token_expiry > now + 120_000) {
    return row.google_access_token;
  }

  // Sinon rafraîchissement automatique via le refresh_token
  const clientId = env.GOOGLE_CLIENT_ID || "";
  const clientSecret = env.GOOGLE_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: row.google_refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { access_token: string; expires_in: number };
    const newExpiry = now + (data.expires_in || 3600) * 1000;

    await db
      .prepare("UPDATE users SET google_access_token = ?, google_token_expiry = ? WHERE id = ?")
      .bind(data.access_token, newExpiry, userId)
      .run();

    return data.access_token;
  } catch {
    return null;
  }
}

export interface CalendarEventPayload {
  companyName: string;
  activity: string | null;
  phone: string | null;
  city: string | null;
  callNotes?: string | null;
  leadId: string;
  origin: string;
  existingEventId?: string | null;
}

export async function syncLeadToGoogleCalendar(
  db: D1Database,
  userId: string,
  payload: CalendarEventPayload,
  callbackDateIso: string,
  env: Bindings,
): Promise<{ ok: boolean; eventId?: string; error?: string }> {
  const token = await getValidGoogleAccessToken(db, userId, env);
  if (!token) return { ok: false, error: "google_calendar_not_connected" };

  const startDate = new Date(callbackDateIso);
  if (isNaN(startDate.getTime())) return { ok: false, error: "invalid_date" };
  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000); // 30 minutes par défaut

  const summary = `📞 Relance : ${payload.companyName} (${payload.activity || "Artisan"})`;
  const description = [
    `🏢 Entreprise : ${payload.companyName}`,
    `📞 Téléphone direct : ${payload.phone || "Non renseigné"}`,
    `📍 Ville : ${payload.city || ""}`,
    "",
    `📋 Fiche Closer CRM : ${payload.origin}/?view=kanban`,
    `🌐 Démo Tailwind créée : ${payload.origin}/demos/${payload.leadId}`,
    "",
    `📝 Notes de l'échange :`,
    payload.callNotes || "Aucune note saisie.",
  ].join("\n");

  const eventBody = {
    summary,
    description,
    location: payload.phone ? `Tél: ${payload.phone}` : (payload.city || ""),
    start: { dateTime: startDate.toISOString() },
    end: { dateTime: endDate.toISOString() },
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: 10 }],
    },
  };

  try {
    let eventId = payload.existingEventId;
    let res: Response;

    if (eventId) {
      // Tentative de mise à jour de l'événement existant
      res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      });

      if (!res.ok && res.status === 404) {
        // Si supprimé de l'agenda, on le recrée
        eventId = null;
      }
    }

    if (!eventId) {
      res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      });
    }

    if (!res!.ok) {
      const errText = await res!.text().catch(() => "");
      return { ok: false, error: `Google API error (${res!.status}) : ${errText}` };
    }

    const created = (await res!.json()) as { id: string };
    const finalEventId = created.id;

    // Mise à jour de l'ID d'événement dans la table leads
    await db
      .prepare("UPDATE leads SET google_calendar_event_id = ? WHERE id = ?")
      .bind(finalEventId, payload.leadId)
      .run();

    return { ok: true, eventId: finalEventId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
