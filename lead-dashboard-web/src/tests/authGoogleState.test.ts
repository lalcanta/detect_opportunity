import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Hono } from "hono";
import { authGoogleRoutes } from "../routes/authGoogle";
import type { AppEnv } from "../types";

/**
 * Faux D1 : toute requête réussit ; on enregistre les UPDATE de la table users et on ne connaît qu'une session
 * (jeton "tok_alice" -> utilisateur u_alice).
 */
function fakeEnv() {
  const writes: { sql: string; args: unknown[] }[] = [];
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const stmt = {
      bind: (...a: unknown[]) => ((args = a), stmt),
      run: async () => {
        if (/^\s*UPDATE users/i.test(sql)) writes.push({ sql, args });
        return { success: true, meta: { changes: 1 } };
      },
      first: async () => {
        if (/FROM users WHERE access_token/i.test(sql)) {
          return args[0] === "tok_alice"
            ? { id: "u_alice", name: "Alice", role: "closer", is_active: 1, phone_quota_weekly: 50 }
            : null;
        }
        return null;
      },
      all: async () => ({ results: [] }),
    };
    return stmt;
  };
  return { writes, env: { DB: { prepare }, GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec" } };
}

function mount() {
  const { writes, env } = fakeEnv();
  const app = new Hono<AppEnv>();
  app.route("/", authGoogleRoutes);
  const call = (path: string, cookie?: string) =>
    app.request(path, { headers: cookie ? { cookie } : {} }, env);
  return { writes, call };
}

const realFetch = globalThis.fetch;
function stubGoogle() {
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600 }));
    }
    return new Response(JSON.stringify({ email: "alice@gmail.com" }));
  }) as typeof fetch;
}
afterEach(() => {
  globalThis.fetch = realFetch;
});

const state = (o: object) => btoa(JSON.stringify(o));
const cb = (st: string) => `/auth/google/callback?code=abc&state=${encodeURIComponent(st)}`;

describe("OAuth Google : state lié à la session et à un nonce", () => {
  it("l'aller pose un cookie de nonce HttpOnly SameSite=Lax et le met dans le state", async () => {
    const { call } = mount();
    const res = await call("/auth/google", "lead_session=tok_alice");
    assert.equal(res.status, 302);
    const setCookie = res.headers.get("set-cookie") || "";
    assert.match(setCookie, /oauth_state_nonce=[0-9a-f]{32}/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Max-Age=\d+/i);
    const st = JSON.parse(atob(new URL(res.headers.get("location")!).searchParams.get("state")!));
    assert.equal(st.mode, "calendar");
    assert.equal(st.userId, undefined);
    assert.ok(setCookie.includes(`oauth_state_nonce=${st.nonce}`));
  });

  it("callback calendrier sans session : refus, aucune écriture", async () => {
    stubGoogle();
    const { call, writes } = mount();
    const res = await call(cb(state({ mode: "calendar", userId: "u_victime", nonce: "n1" })), "oauth_state_nonce=n1");
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location")!, /\/login$/);
    assert.equal(writes.length, 0);
  });

  it("le userId du state est ignoré : l'agenda va à l'utilisateur de la session", async () => {
    stubGoogle();
    const { call, writes } = mount();
    const res = await call(
      cb(state({ mode: "calendar", userId: "u_victime", nonce: "n1" })),
      "lead_session=tok_alice; oauth_state_nonce=n1",
    );
    assert.match(res.headers.get("location")!, /google=connected/);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].args[4], "u_alice");
    assert.ok(!writes.some((w) => w.args.includes("u_victime")));
  });

  it("nonce absent du cookie, absent du state ou différent : refus, aucune écriture", async () => {
    stubGoogle();
    const { call, writes } = mount();
    const cases: [object, string][] = [
      [{ mode: "calendar", nonce: "n1" }, "lead_session=tok_alice"],
      [{ mode: "calendar" }, "lead_session=tok_alice; oauth_state_nonce=n1"],
      [{ mode: "calendar", nonce: "autre" }, "lead_session=tok_alice; oauth_state_nonce=n1"],
      [{ mode: "login", nonce: "autre" }, "oauth_state_nonce=n1"],
      [{ mode: "login" }, ""],
    ];
    for (const [st, cookie] of cases) {
      const res = await call(cb(state(st)), cookie);
      assert.match(res.headers.get("location") || "", /invalid_state/, JSON.stringify(st));
    }
    assert.equal(writes.length, 0);
  });

  it("le nonce est à usage unique : le cookie est effacé au retour", async () => {
    stubGoogle();
    const { call } = mount();
    const res = await call(cb(state({ mode: "calendar", nonce: "n1" })), "lead_session=tok_alice; oauth_state_nonce=n1");
    assert.match(res.headers.get("set-cookie") || "", /oauth_state_nonce=;/);
  });
});
