import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { ensureTestServer, TEST_BASE_URL } from "./setupTestEnv";

const BASE_URL = process.env.TEST_APP_URL || TEST_BASE_URL;
const CLOSER_COOKIE = "lead_session=cls_d7e12e4e0eee45d8654fd44439726210";
const ADMIN_COOKIE = "lead_session=adm_9e86b81a2886a9c4de99f1eb10580218";
const SYNC_SECRET = "sync_1422c56ef4ceae76fc23637942230c3daa4b91ffdd80cb57";

describe("SUITE COMPLÈTE DE TESTS FONCTIONNELS (API, CRM & DASHBOARD LIVE SUR BASE DÉDIÉE)", () => {
  // Réinitialisation automatique de la base de test dédiée avant l'exécution de la suite
  before(async () => {
    await ensureTestServer();
  });

  // Lead partagé pour les parcours de tests
  const testLeadSyncId = "f00d" + Date.now().toString(16).slice(-12);
  let closer2Token: string | null = null;
  let closer2Id: string | null = null;

  // =========================================================================
  // SUITE 1 : SÉCURITÉ, AUTHENTIFICATION & CONTRÔLE D'ACCÈS RBAC
  // =========================================================================
  describe("1. Sécurité, Authentification & Contrôle d'Accès RBAC", () => {
    it("Initialisation : Réactiver toutes les opportunités pour le closer 1", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/users/u_closer1/opportunities`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({
          opportunities: ["website", "google_reviews", "seo_local", "ads_acquisition", "custom"],
        }),
      });
      assert.equal(res.status, 200);
    });

    it("doit refuser l'accès aux API protégées sans session valide (HTTP 401)", async () => {
      const res = await fetch(`${BASE_URL}/api/closer/google-status`);
      assert.equal(res.status, 401, "Une requête sans cookie doit renvoyer HTTP 401");
    });

    it("doit rediriger l'accès anonyme aux pages HTML vers /login (HTTP 302)", async () => {
      const res = await fetch(`${BASE_URL}/`, { redirect: "manual" });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get("Location"), "/login");
    });

    it("POST /login avec un jeton brut, même valide, doit être refusé (HTTP 401, audit 5.1)", async () => {
      const form = new URLSearchParams();
      form.set("token", "cls_d7e12e4e0eee45d8654fd44439726210");
      const res = await fetch(`${BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        redirect: "manual",
      });
      assert.equal(res.status, 401);
      assert.ok(!(res.headers.get("set-cookie") || "").includes("lead_session="), "Aucune session ne doit être ouverte");
    });

    it("POST /login avec l'email d'un compte non activé ne doit pas révéler le lien d'invitation (audit 5.2)", async () => {
      const form = new URLSearchParams();
      form.set("email", "closer1@agence.local");
      form.set("password", "peu-importe");
      const res = await fetch(`${BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        redirect: "manual",
      });
      assert.equal(res.status, 403);
      assert.ok(!(res.headers.get("Location") || "").includes("/invite/"), "Pas de redirection vers la page d'invitation");
      const html = await res.text();
      assert.ok(!html.includes("/invite/inv_"), "Le code d'invitation ne doit pas apparaître");
      assert.ok(!(res.headers.get("set-cookie") || "").includes("lead_session="));
    });

    it("Accès Closer à la vue principale / doit répondre HTTP 200", async () => {
      const res = await fetch(`${BASE_URL}/`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes("Backlog Kanban"));
    });

    it("Contrôle RBAC : Accès Closer à /admin doit être strictement interdit (HTTP 403 Forbidden)", async () => {
      const res = await fetch(`${BASE_URL}/admin`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(res.status, 403, "Un closer ne doit jamais pouvoir accéder à la console d'administration");
    });

    it("Accès Administrateur à /admin doit répondre HTTP 200", async () => {
      const res = await fetch(`${BASE_URL}/admin`, {
        headers: { Cookie: ADMIN_COOKIE },
      });
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes("Dashboard Admin") || html.includes("Vue d'ensemble"));
      assert.ok(!html.includes(': "" }'), "Aucun résidu de template literal ne doit apparaître dans la page");

      // Vérifier également l'onglet Scanner Cartographique
      const resScanner = await fetch(`${BASE_URL}/admin?tab=scanner`, {
        headers: { Cookie: ADMIN_COOKIE },
      });
      assert.equal(resScanner.status, 200);
      const scannerHtml = await resScanner.text();
      assert.ok(scannerHtml.includes("Scanner une Zone Géographique sur Carte"));
    });

    it("GET /logout doit supprimer le cookie de session et rediriger vers /login", async () => {
      const res = await fetch(`${BASE_URL}/logout`, {
        headers: { Cookie: CLOSER_COOKIE },
        redirect: "manual",
      });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get("Location"), "/login");
      const setCookie = res.headers.get("set-cookie") || "";
      assert.ok(setCookie.includes("lead_session=;"));
    });
  });

  // =========================================================================
  // SUITE 2 : INGESTION DE LEADS & SYNCHRONISATION CLOUD CRM (/api/sync)
  // =========================================================================
  describe("2. Ingestion de Leads & Synchronisation Cloud CRM (POST /api/sync)", () => {
    it("doit refuser la synchronisation sans token Bearer (HTTP 401)", async () => {
      const res = await fetch(`${BASE_URL}/api/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "12345678" }),
      });
      assert.equal(res.status, 401);
    });

    it("doit refuser un payload de synchronisation invalide (HTTP 400)", async () => {
      const res = await fetch(`${BASE_URL}/api/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SYNC_SECRET}`,
        },
        body: JSON.stringify({ id: "court" }), // ID hexadécimal trop court
      });
      assert.equal(res.status, 400);
      const json = await res.json() as { error: string };
      assert.equal(json.error, "invalid_payload");
    });

    it("doit ingérer avec succès un lead complet avec démo, flyer, audit et type de besoin (HTTP 200)", async () => {
      const payload = {
        id: testLeadSyncId,
        company_name: "Plomberie & Chauffage Test Functional",
        activity: "Plombier Chauffagiste",
        city: "Foix",
        phone: "0561000000",
        email: "contact@plomberie-test-func.fr",
        website_url: "https://plomberie-test-func.fr",
        google_rating: 4.8,
        google_reviews_count: 32,
        opportunity_type: "google_reviews",
        audit_data: {
          summary: "Audit fonctionnel OK : site vieillissant et lent",
          score: 42,
          weaknesses: ["Pas de version smartphone fluide", "Temps de réponse 4.5s"],
        },
        demo_html: `<!DOCTYPE html><html lang="fr"><head><title>Démo Plomberie Test Functional</title></head><body><h1>Démo Plomberie Test</h1></body></html>`,
        flyer_pdf_base64: Buffer.from("%PDF-1.4 mock pdf content").toString("base64"),
        battlecard_data: {
          companyName: "Plomberie & Chauffage Test Functional",
          activity: "Plombier",
          callScript: "Bonjour M. Dupont, nous avons conçu votre nouveau site...",
          objections: [{ objection: "J'ai déjà un prestataire", reply: "Notre solution est sans abonnement captif." }],
        },
        token_usage: [
          { task: "demo", model: "gemini-3.1-pro-preview", inputTokens: 500, outputTokens: 1200, thinkingTokens: 0 },
        ],
      };

      const res = await fetch(`${BASE_URL}/api/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SYNC_SECRET}`,
        },
        body: JSON.stringify(payload),
      });

      assert.equal(res.status, 200);
      const json = await res.json() as { ok: boolean; id: string };
      assert.equal(json.ok, true);
      assert.equal(json.id, testLeadSyncId);

      // Assigner immédiatement le lead de test au Closer 1 pour son pipeline de vente
      await fetch(`${BASE_URL}/api/admin/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({
          mode: "manual",
          leadId: testLeadSyncId,
          userId: "u_closer1",
        }),
      });
    });

    it("doit être idempotent : une réémission du lead met à jour les champs sans erreur", async () => {
      const updatePayload = {
        id: testLeadSyncId,
        company_name: "Plomberie & Chauffage Test Functional (Mis à Jour)",
        activity: "Chauffagiste & Pompe à Chaleur",
        city: "Foix",
        phone: "0561000001",
        opportunity_type: "google_reviews",
        demo_html: `<!DOCTYPE html><html><body>Démo V2</body></html>`,
        battlecard_data: { callScript: "Script V2" },
      };

      const res = await fetch(`${BASE_URL}/api/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SYNC_SECRET}`,
        },
        body: JSON.stringify(updatePayload),
      });

      assert.equal(res.status, 200);
      const json = await res.json() as { ok: boolean };
      assert.equal(json.ok, true);

      // Vérifier via l'API lead
      const leadRes = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(leadRes.status, 200);
      const leadData = await leadRes.json() as { ok: boolean; lead: { company_name: string; phone: string; opportunity_type: string } };
      assert.equal(leadData.lead.company_name, "Plomberie & Chauffage Test Functional (Mis à Jour)");
      assert.equal(leadData.lead.phone, "0561000001");
      assert.equal(leadData.lead.opportunity_type, "google_reviews");
    });

    it("doit accepter un lead en 'pending_generation' (mode prep) puis le faire avancer en 'demo_ready' à la génération", async () => {
      const pendingId = "beef" + Date.now().toString(16).slice(-12);
      const post = (body: Record<string, unknown>) =>
        fetch(`${BASE_URL}/api/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SYNC_SECRET}` },
          body: JSON.stringify(body),
        });

      const prep = await post({
        id: pendingId,
        company_name: "Boulangerie Prep Test",
        status: "pending_generation",
        audit_data: { loadTimeMs: 1200 },
      });
      assert.equal(prep.status, 200, "La contrainte CHECK doit autoriser pending_generation");
      assert.equal(((await prep.json()) as { status: string }).status, "pending_generation");

      const done = await post({
        id: pendingId,
        company_name: "Boulangerie Prep Test",
        audit_data: { summary: "Audit complet", score: 40, weaknesses: ["Lent"] },
        demo_html: "<!DOCTYPE html><html><body>Démo prep</body></html>",
        battlecard_data: { callScript: "Bonjour" },
      });
      assert.equal(((await done.json()) as { status: string }).status, "demo_ready");

      // Une re-préparation ne doit ni rétrograder le statut ni écraser l'audit complet
      const reprep = await post({
        id: pendingId,
        company_name: "Boulangerie Prep Test",
        status: "pending_generation",
        audit_data: { loadTimeMs: 999 },
      });
      assert.equal(((await reprep.json()) as { status: string }).status, "demo_ready");
      const leadRes = await fetch(`${BASE_URL}/api/leads/${pendingId}`, { headers: { Cookie: ADMIN_COOKIE } });
      const lead = ((await leadRes.json()) as { lead: { status: string; audit_data: string } }).lead;
      assert.equal(lead.status, "demo_ready");
      assert.equal(JSON.parse(lead.audit_data).summary, "Audit complet");
    });

    it("doit ajouter le pixel d'ouverture aux démos préparées sans pixel, sauf en aperçu interne", async () => {
      const prepDemoId = "beef00c0ffee0002";
      await fetch(`${BASE_URL}/api/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SYNC_SECRET}` },
        body: JSON.stringify({
          id: prepDemoId,
          company_name: "Démo Prep Sans Pixel",
          demo_html: "<!DOCTYPE html><html><head></head><body><h1>Démo prep</h1></body></html>",
          battlecard_data: { callScript: "Bonjour" },
        }),
      });
      const publicView = await (await fetch(`${BASE_URL}/demos/${prepDemoId}`)).text();
      assert.ok(publicView.includes(`/api/tracker/open?leadId=${prepDemoId}`), "pixel injecté pour le prospect");
      const internalView = await (await fetch(`${BASE_URL}/demos/${prepDemoId}`, { headers: { Cookie: ADMIN_COOKIE } })).text();
      assert.ok(!internalView.includes(`/api/tracker/open?leadId=${prepDemoId}`), "pas de pixel en aperçu interne");
    });

    it("doit garder un lead non qualifié hors Kanban, sans rétrograder un lead déjà qualifié", async () => {
      const sync = (body: Record<string, unknown>) =>
        fetch(`${BASE_URL}/api/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SYNC_SECRET}` },
          body: JSON.stringify(body),
        });
      const unqId = "dead00c0ffee0003";
      const r1 = await sync({ id: unqId, company_name: "Agence Sans Contact Écrit", opportunity_type: "audit_qa_trackers", status: "unqualified", audit_data: { unqualified_reasons: ["aucun contact parmi : email, formulaire de contact"] } });
      assert.equal(((await r1.json()) as { status: string }).status, "unqualified");
      const kanban = await (await fetch(`${BASE_URL}/?view=list&scope=all`, { headers: { Cookie: ADMIN_COOKIE } })).text();
      assert.ok(!kanban.includes("Agence Sans Contact Écrit"), "absent du Kanban");
      const admin = await (await fetch(`${BASE_URL}/admin?tab=pending`, { headers: { Cookie: ADMIN_COOKIE } })).text();
      assert.ok(admin.includes("Agence Sans Contact Écrit") && admin.includes("aucun contact parmi"), "listé avec sa raison dans l'admin");

      // Requalifié plus tard pour une autre opportunité : il avance
      const r2 = await sync({ id: unqId, company_name: "Agence Sans Contact Écrit", opportunity_type: "website", demo_html: "<html><body>ok</body></html>", battlecard_data: { callScript: "Bonjour" } });
      assert.equal(((await r2.json()) as { status: string }).status, "demo_ready");
      // Un nouvel essai non qualifié ne le rétrograde pas et ne change pas son opportunité
      await sync({ id: unqId, company_name: "Agence Sans Contact Écrit", opportunity_type: "audit_qa_trackers", status: "unqualified" });
      const lead = ((await (await fetch(`${BASE_URL}/api/leads/${unqId}`, { headers: { Cookie: ADMIN_COOKIE } })).json()) as { lead: { status: string; opportunity_type: string } }).lead;
      assert.equal(lead.status, "demo_ready");
      assert.equal(lead.opportunity_type, "website");
    });

    it("doit signaler un doublon de même SIREN dans l'historique et dans la vue", async () => {
      const sync = (body: Record<string, unknown>) =>
        fetch(`${BASE_URL}/api/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SYNC_SECRET}` },
          body: JSON.stringify(body),
        });
      const base = { demo_html: "<html><body>d</body></html>", battlecard_data: { callScript: "Bonjour" } };
      await sync({ id: "5afe00c0ffee0004", company_name: "Boulangerie Doublon A", audit_data: { siren: "408 531 234" }, ...base });
      const r = await sync({ id: "5afe00c0ffee0005", company_name: "Boulangerie Doublon B", audit_data: { siren: "408531234" }, ...base });
      assert.deepEqual(((await r.json()) as { duplicates: string[] }).duplicates, ["5afe00c0ffee0004"]);
      const acts = ((await (await fetch(`${BASE_URL}/api/leads/5afe00c0ffee0005/activities`, { headers: { Cookie: ADMIN_COOKIE } })).json()) as { activities: Array<{ summary: string }> }).activities;
      assert.ok(acts.some((a) => a.summary.includes("Boulangerie Doublon A")), "note de doublon dans l'historique");
      const page = await (await fetch(`${BASE_URL}/?view=list&scope=all`, { headers: { Cookie: ADMIN_COOKIE } })).text();
      assert.ok(page.includes("Doublon ?"), "badge doublon sur la carte");
    });

    it("doit enregistrer le canal principal et les contacts (lead_contacts), et ignorer les contacts invalides", async () => {
      const contactLeadId = "c0ffee00c0ffee01";
      const formUrl = "https://agence-contact-test.fr/contact";
      const sync = (body: Record<string, unknown>) =>
        fetch(`${BASE_URL}/api/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SYNC_SECRET}` },
          body: JSON.stringify(body),
        });
      const res = await sync({
        id: contactLeadId,
        company_name: "Agence Contact Test",
        opportunity_type: "audit_qa_trackers",
        primary_channel: "contact_form",
        demo_html: "<!DOCTYPE html><html><body>Rapport</body></html>",
        battlecard_data: { coldEmail: { subject: "Objet", body: "Message" } },
        contacts: [
          { kind: "contact_form", value: formUrl, source: "site", confidence: 0.9, meta: { captcha: "reCAPTCHA" }, is_primary: true },
          { kind: "fax", value: "0102030405", source: "site" },
          { kind: "contact_form", value: "javascript:alert(1)", source: "site" },
        ],
      });
      assert.equal(res.status, 200);

      const leadRes = await fetch(`${BASE_URL}/api/leads/${contactLeadId}`, { headers: { Cookie: ADMIN_COOKIE } });
      const lead = ((await leadRes.json()) as { lead: { primary_channel: string | null } }).lead;
      assert.equal(lead.primary_channel, "contact_form");

      // Une resynchronisation sans canal ne l'efface pas
      await sync({ id: contactLeadId, company_name: "Agence Contact Test", opportunity_type: "audit_qa_trackers", status: "pending_generation" });
      const again = ((await (await fetch(`${BASE_URL}/api/leads/${contactLeadId}`, { headers: { Cookie: ADMIN_COOKIE } })).json()) as {
        lead: { primary_channel: string | null };
      }).lead;
      assert.equal(again.primary_channel, "contact_form");

      // Le formulaire (et lui seul) est exposé à l'écran du closer
      const page = await (await fetch(`${BASE_URL}/?view=list&scope=all&opp=audit_qa_trackers`, { headers: { Cookie: ADMIN_COOKIE } })).text();
      assert.ok(page.includes(formUrl), "URL du formulaire attendue dans la vue");
      assert.ok(!page.includes("javascript:alert(1)"), "contact invalide ignoré");
    });
  });

  // =========================================================================
  // SUITE 3 : TRACKING TEMPS RÉEL & CONSULTATION DÉMO PUBLIQUE
  // =========================================================================
  describe("3. Tracking Temps Réel & Consultation Démo Publique", () => {
    it("GET /demos/:id doit servir le code HTML Tailwind avec en-têtes sécurisés (HTTP 200)", async () => {
      const res = await fetch(`${BASE_URL}/demos/${testLeadSyncId}`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("Cache-Control"), "no-store");
      assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow");
      const html = await res.text();
      assert.ok(html.includes("Démo V2"));
    });

    it("GET /demos/:id sur un identifiant inexistant doit renvoyer HTTP 404", async () => {
      const res = await fetch(`${BASE_URL}/demos/inexistant99999`);
      assert.equal(res.status, 404);
    });

    it("Pixel de tracking GET /api/tracker/open avec User-Agent humain doit incrémenter les vues et passer le lead en 'hot_lead'", async () => {
      const res = await fetch(`${BASE_URL}/api/tracker/open?leadId=${testLeadSyncId}`, {
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" },
      });
      assert.equal(res.status, 204);

      // Vérifier l'incrémentation dans le lead
      const leadRes = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      const data = await leadRes.json() as { lead: { demo_viewed_count: number; status: string } };
      assert.ok(data.lead.demo_viewed_count >= 1);
      assert.equal(data.lead.status, "hot_lead", "Un lead qui consulte sa démo doit devenir hot_lead");
    });

    it("Pixel de tracking avec User-Agent robot ne doit pas déclencher d'alerte de vue (immunité crawlers)", async () => {
      // Lecture du compteur avant
      const beforeRes = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      const beforeCount = ((await beforeRes.json()) as { lead: { demo_viewed_count: number } }).lead.demo_viewed_count;

      // Requête robot WhatsApp / Googlebot
      const res = await fetch(`${BASE_URL}/api/tracker/open?leadId=${testLeadSyncId}`, {
        headers: { "User-Agent": "WhatsApp/2.21.100.18 i" },
      });
      assert.equal(res.status, 204);

      // Vérifier que le compteur n'a pas bougé
      const afterRes = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      const afterCount = ((await afterRes.json()) as { lead: { demo_viewed_count: number } }).lead.demo_viewed_count;
      assert.equal(afterCount, beforeCount, "Les robots de prévisualisation WhatsApp/Slack ne doivent pas fausser les métriques");
    });

    it("GET /demos/:id par un closer connecté doit afficher un aperçu interne sans bouton d'intérêt et neutraliser le pixel", async () => {
      const res = await fetch(`${BASE_URL}/demos/${testLeadSyncId}`, { headers: { Cookie: CLOSER_COOKIE } });
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes("Aperçu interne"), "Le bandeau doit signaler l'aperçu interne");
      assert.ok(!html.includes('id="le-btn-like"'), "Le bouton d'intérêt ne doit pas être proposé au closer");
      assert.ok(html.includes(`seen_${testLeadSyncId}`), "Le pixel doit être neutralisé côté navigateur");

      const anon = await (await fetch(`${BASE_URL}/demos/${testLeadSyncId}`)).text();
      assert.ok(anon.includes('id="le-btn-like"'), "Le prospect anonyme garde le bouton d'intérêt");
    });

    it("Pixel et bouton d'intérêt avec un cookie de session interne ne doivent rien comptabiliser", async () => {
      const read = async () =>
        ((await (await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}`, { headers: { Cookie: CLOSER_COOKIE } })).json()) as {
          lead: { demo_viewed_count: number; call_notes: string | null };
        }).lead;
      const before = await read();

      const open = await fetch(`${BASE_URL}/api/tracker/open?leadId=${testLeadSyncId}`, {
        headers: { Cookie: ADMIN_COOKIE, "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15" },
      });
      assert.equal(open.status, 204);
      const interest = await fetch(`${BASE_URL}/api/tracker/interest?leadId=${testLeadSyncId}`, {
        method: "POST",
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(interest.status, 200);

      const after = await read();
      assert.equal(after.demo_viewed_count, before.demo_viewed_count, "Une ouverture interne ne doit pas compter comme vue");
      assert.equal(after.call_notes, before.call_notes, "Un clic interne ne doit pas ajouter de note « intérêt client »");
    });
  });

  // =========================================================================
  // SUITE 4 : PIPELINE COMMERCIAL CLOSER & FILTRAGE PAR BESOIN
  // =========================================================================
  describe("4. Pipeline Commercial Closer & Filtrage par Besoin", () => {
    it("GET /?view=backlog doit renvoyer la vue Kanban avec les 6 colonnes du cycle de vente", async () => {
      const res = await fetch(`${BASE_URL}/?view=backlog`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes("Leads Chauds"));
      assert.ok(html.includes("À contacter"));
      assert.ok(html.includes("Contactés"));
      assert.ok(html.includes("Relance ultérieure"));
      assert.ok(html.includes("Gagnés"));
      assert.ok(html.includes("Perdus"));
    });

    it("GET /?view=list doit renvoyer la vue Liste classique", async () => {
      const res = await fetch(`${BASE_URL}/?view=list`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes("lead-card"));
    });

    it("GET /?view=calendar doit afficher l'Agenda Interne autonome sans compte requis", async () => {
      const res = await fetch(`${BASE_URL}/?view=calendar`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes("Agenda Interne des Relances & Rappels"));
      assert.ok(html.includes("Télécharger l'Agenda (.ics)"));
    });

    it("Filtrage par portefeuille ?scope=mine et ?scope=all", async () => {
      const resMine = await fetch(`${BASE_URL}/?scope=mine&view=backlog`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(resMine.status, 200);

      const resAll = await fetch(`${BASE_URL}/?scope=all&view=backlog`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(resAll.status, 200);
    });

    it("Filtrage par opportunité ?opp=google_reviews doit isoler le besoin sélectionné", async () => {
      const res = await fetch(`${BASE_URL}/?scope=all&opp=google_reviews`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes("⭐ Avis Google"));
      assert.ok(html.includes(testLeadSyncId));
    });
  });

  // =========================================================================
  // SUITE 5 : VERROUILLAGE ANTI-COLLISION (15 MIN) & DÉTECTION DE CONFLITS
  // =========================================================================
  describe("5. Verrouillage Atomique Anti-Collision (15 min) & Conflits", () => {
    it("Préparation : Créer un second Closer via l'API Admin pour simuler la concurrence", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({ name: "Closer 2 Concurrence", quota: 100 }),
      });
      assert.equal(res.status, 200);
      const data = await res.json() as { ok: boolean; id: string; access_token: string };
      closer2Token = data.access_token;
      closer2Id = data.id;
      assert.ok(closer2Token);
    });

    it("Closer 1 verrouille le lead : doit poser un verrou de 15 minutes (HTTP 200)", async () => {
      const res = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}/lock`, {
        method: "POST",
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(res.status, 200);
      const json = await res.json() as { ok: boolean; locked_until: string };
      assert.equal(json.ok, true);
      const diffMs = new Date(json.locked_until).getTime() - Date.now();
      assert.ok(diffMs > 14 * 60 * 1000 && diffMs <= 15 * 60 * 1000);
    });

    it("Closer 2 tente de verrouiller le lead de Closer 1 : rejeté avec HTTP 403 Forbidden (cloisonnement strict)", async () => {
      const closer2Cookie = `lead_session=${closer2Token}`;
      const res = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}/lock`, {
        method: "POST",
        headers: { Cookie: closer2Cookie },
      });
      assert.equal(res.status, 403, "Un closer concurrent doit être rejeté avec HTTP 403 si le lead est attribué à un autre");
    });

    it("Admin tente de verrouiller le lead déjà verrouillé par Closer 1 : doit être rejeté avec HTTP 409 Locked", async () => {
      const res = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}/lock`, {
        method: "POST",
        headers: { Cookie: ADMIN_COOKIE },
      });
      assert.equal(res.status, 409, "Un verrou déjà actif posé par un closer doit renvoyer HTTP 409 Locked");
      const json = await res.json() as { error: string };
      assert.equal(json.error, "locked");
    });

    it("Closer 1 re-verrouille son propre lead : doit renouveler son propre verrou sans conflit", async () => {
      const res = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}/lock`, {
        method: "POST",
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(res.status, 200);
      const json = await res.json() as { ok: boolean };
      assert.equal(json.ok, true);
    });
  });

  // =========================================================================
  // SUITE 6 : CYCLE DE VENTE, RELANCES & RÈGLES D'INVIOLABILITÉ
  // =========================================================================
  describe("6. Cycle de Vente, Relances & Règles d'Inviolabilité", () => {
    it("POST /api/leads/:id/update doit enregistrer une date de relance et des notes d'échange", async () => {
      const callbackIso = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
      const res = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: CLOSER_COOKIE },
        body: JSON.stringify({
          callback_scheduled_at: callbackIso,
          call_notes: "Le client est sur un chantier, rappeler à 14h pour finaliser.",
          phone: "0561000099",
        }),
      });

      assert.equal(res.status, 200);
      const json = await res.json() as { ok: boolean; phone: string; callback_scheduled_at: string };
      assert.equal(json.ok, true);
      assert.equal(json.phone, "0561000099");
      assert.equal(json.callback_scheduled_at, callbackIso);
    });

    it("POST /api/leads/:id/status avec statut invalide doit renvoyer HTTP 400", async () => {
      const res = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: CLOSER_COOKIE },
        body: JSON.stringify({ status: "statut_fantaisiste" }),
      });
      assert.equal(res.status, 400);
    });

    it("POST /api/leads/:id/status à 'called' doit enregistrer l'appel et libérer le verrou", async () => {
      const res = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: CLOSER_COOKIE },
        body: JSON.stringify({
          status: "called",
          notes: "Premier contact très positif, démo visualisée ensemble au téléphone.",
        }),
      });
      assert.equal(res.status, 200);

      // Vérifier que le verrou est débloqué
      const leadRes = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      const data = await leadRes.json() as { lead: { status: string; locked_by: string | null } };
      assert.equal(data.lead.status, "called");
      assert.equal(data.lead.locked_by, null, "Le verrou doit être levé après soumission de l'appel");
    });

    it("POST /api/leads/:id/status à 'won' doit clôturer la vente avec succès", async () => {
      const res = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: CLOSER_COOKIE },
        body: JSON.stringify({
          status: "won",
          notes: "Vente conclue à 490€ !",
        }),
      });
      assert.equal(res.status, 200);
    });

    it("Une re-synchronisation depuis le Mac (re-scan / sync-queue / regen) ne doit PAS écraser le statut 'won'", async () => {
      const res = await fetch(`${BASE_URL}/api/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SYNC_SECRET}` },
        body: JSON.stringify({
          id: testLeadSyncId,
          company_name: "Plomberie & Chauffage Test Functional (Mis à Jour)",
          demo_html: "<!DOCTYPE html><html><body>Démo V3</body></html>",
          battlecard_data: { callScript: "Script V3" },
        }),
      });
      assert.equal(res.status, 200);
      assert.equal(((await res.json()) as { status: string }).status, "won");

      const leadRes = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}`, { headers: { Cookie: ADMIN_COOKIE } });
      const lead = ((await leadRes.json()) as { lead: { status: string } }).lead;
      assert.equal(lead.status, "won");
    });

    it("Règle d'inviolabilité Closer : un closer ne peut PAS modifier un dossier clôturé 'won' (HTTP 403 Forbidden)", async () => {
      const res = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: CLOSER_COOKIE },
        body: JSON.stringify({
          status: "demo_ready",
        }),
      });
      assert.equal(res.status, 403, "Un closer ne doit pas pouvoir rouvrir un lead déjà clôturé");
      const json = await res.json() as { error: string };
      assert.equal(json.error, "forbidden");
    });

    it("Privilège Administrateur : seul l'administrateur peut modifier ou réactiver un dossier clôturé (HTTP 200)", async () => {
      const res = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({
          status: "callback_scheduled",
          notes: "Réactivation exceptionnelle par l'administrateur.",
        }),
      });
      assert.equal(res.status, 200);
      const json = await res.json() as { ok: boolean };
      assert.equal(json.ok, true);
    });
  });

  // =========================================================================
  // SUITE 7 : EXPORT STANDARD ICALENDAR RFC 5545 (UNITAIRE & GLOBAL)
  // =========================================================================
  describe("7. Standard iCalendar RFC 5545 (Unitaire & Global)", () => {
    it("GET /api/leads/:id/calendar.ics doit générer un fichier .ics valide (durée 30 min, alarme 10 min)", async () => {
      const res = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}/calendar.ics`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(res.status, 200);
      assert.ok(res.headers.get("Content-Type")?.includes("text/calendar"));

      const ics = await res.text();
      assert.ok(ics.includes("BEGIN:VCALENDAR"));
      assert.ok(ics.includes("VERSION:2.0"));
      assert.ok(ics.includes("BEGIN:VEVENT"));
      assert.ok(ics.includes(`UID:${testLeadSyncId}@leadengine.local`));
      assert.ok(ics.includes("TRIGGER:-PT10M"), "Alarme 10 minutes avant requise");
      assert.ok(ics.includes("END:VEVENT"));
      assert.ok(ics.includes("END:VCALENDAR"));
    });

    it("GET /api/closer/calendar.ics doit renvoyer le flux iCalendar de toutes les relances de l'équipe", async () => {
      const res = await fetch(`${BASE_URL}/api/closer/calendar.ics`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(res.status, 200);
      assert.ok(res.headers.get("Content-Disposition")?.includes("agenda-relances.ics"));
      const ics = await res.text();
      assert.ok(ics.includes("BEGIN:VCALENDAR"));
      assert.ok(ics.includes("END:VCALENDAR"));
    });

    it("GET /api/leads/:id/calendar.ics sur un lead SANS relance programmée doit renvoyer HTTP 404", async () => {
      // Effacer la relance sur le lead
      await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({ callback_scheduled_at: null }),
      });

      const res = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}/calendar.ics`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(res.status, 404);
      const text = await res.text();
      assert.ok(text.includes("Aucun rappel programmé"));
    });
  });

  // =========================================================================
  // SUITE 8 : INTÉGRATION GOOGLE AGENDA & OAUTH 2.0
  // =========================================================================
  describe("8. Intégration Google Agenda & OAuth 2.0", () => {
    it("GET /auth/google doit rediriger (HTTP 302) vers accounts.google.com avec scopes calendar.events et offline", async () => {
      const res = await fetch(`${BASE_URL}/auth/google`, {
        headers: { Cookie: CLOSER_COOKIE },
        redirect: "manual",
      });
      assert.equal(res.status, 302);
      const location = res.headers.get("Location") || "";
      assert.ok(location.startsWith("https://accounts.google.com/o/oauth2/v2/auth"));
      assert.ok(location.includes("calendar.events"));
      assert.ok(location.includes("access_type=offline"));
      assert.ok(location.includes("state="));
    });

    it("GET /api/closer/google-status doit renvoyer le statut de connexion", async () => {
      const res = await fetch(`${BASE_URL}/api/closer/google-status`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(res.status, 200);
      const json = await res.json() as { connected: boolean };
      assert.equal(typeof json.connected, "boolean");
    });
  });

  // =========================================================================
  // SUITE 9 : SCANNER, FILE DE JOBS & WORKER DISTANT
  // =========================================================================
  describe("9. Scanner, File de Jobs & Worker Distant", () => {
    let createdScanJobId: number | null = null;

    it("POST /api/admin/scans doit créer un job avec coordonnées, rayon, opportunité et filtre web", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/scans`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({
          query: "serrurier, vitrier",
          city: "Toulouse",
          limit: 5,
          lat: 43.604,
          lng: 1.444,
          radius_km: 10,
          opportunity_type: "seo_local",
          website_filter: "has_website",
        }),
      });

      assert.equal(res.status, 200);
      const json = await res.json() as { ok: boolean; id: number };
      assert.equal(json.ok, true);
      assert.ok(typeof json.id === "number");
      createdScanJobId = json.id;
    });

    it("POST /api/admin/scans doit refuser un filtre de site contraire à l'opportunité et une opportunité inconnue", async () => {
      const create = (body: Record<string, unknown>) =>
        fetch(`${BASE_URL}/api/admin/scans`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
          body: JSON.stringify({ query: "agence web", city: "Lyon", limit: 2, ...body }),
        });
      const incompatible = await create({ opportunity_type: "audit_qa_trackers", website_filter: "no_website" });
      assert.equal(incompatible.status, 400);
      assert.equal(((await incompatible.json()) as { error: string }).error, "website_filter_incompatible");
      const unknown = await create({ opportunity_type: "inconnue" });
      assert.equal(unknown.status, 400);
    });

    it("GET /api/admin/scans doit lister le job nouvellement créé avec ses métadonnées", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/scans`, {
        headers: { Cookie: ADMIN_COOKIE },
      });
      assert.equal(res.status, 200);
      const scans = await res.json() as Array<{ id: number; opportunity_type?: string; website_filter?: string; query: string }>;
      const found = scans.find((s) => s.id === createdScanJobId);
      assert.ok(found);
      assert.equal(found?.opportunity_type, "seo_local");
      assert.equal(found?.website_filter, "has_website");
    });

    it("POST /api/worker/jobs/:id/progress doit permettre de remonter la progression en direct", async () => {
      if (!createdScanJobId) return;

      const res = await fetch(`${BASE_URL}/api/worker/jobs/${createdScanJobId}/progress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SYNC_SECRET}`,
        },
        body: JSON.stringify({
          status: "running",
          processed: 2,
          total: 5,
          message: "Étape 2/2 : 2/5 qualifiés traités",
        }),
      });

      assert.equal(res.status, 200);
      const json = await res.json() as { cancel: boolean };
      assert.equal(typeof json.cancel, "boolean");
    });

    it("POST /api/admin/scans/:id/cancel doit annuler le job immédiatement", async () => {
      if (!createdScanJobId) return;

      const res = await fetch(`${BASE_URL}/api/admin/scans/${createdScanJobId}/cancel`, {
        method: "POST",
        headers: { Cookie: ADMIN_COOKIE },
      });
      assert.equal(res.status, 200);

      // Vérifier que le worker reçoit cancel: true lors du prochain ping
      const progressRes = await fetch(`${BASE_URL}/api/worker/jobs/${createdScanJobId}/progress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SYNC_SECRET}`,
        },
        body: JSON.stringify({ status: "running" }),
      });
      const data = await progressRes.json() as { cancel: boolean };
      assert.equal(data.cancel, true, "Le worker doit être averti de l'annulation immédiate");
    });
  });

  // =========================================================================
  // SUITE 10 : GESTION D'ÉQUIPE & ATTRIBUTION DES LEADS
  // =========================================================================
  describe("10. Gestion d'Équipe & Attribution des Leads", () => {
    it("POST /api/admin/users/:id/toggle doit pouvoir désactiver puis réactiver un closer", async () => {
      if (!closer2Id) return;

      const res = await fetch(`${BASE_URL}/api/admin/users/${closer2Id}/toggle`, {
        method: "POST",
        headers: { Cookie: ADMIN_COOKIE },
      });
      assert.equal(res.status, 200);

      // Réactivation
      const resReactivate = await fetch(`${BASE_URL}/api/admin/users/${closer2Id}/toggle`, {
        method: "POST",
        headers: { Cookie: ADMIN_COOKIE },
      });
      assert.equal(resReactivate.status, 200);
    });

    it("POST /api/admin/assign en mode 'manual' doit assigner le lead à un closer spécifique", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({
          mode: "manual",
          leadId: testLeadSyncId,
          userId: "u_closer1",
        }),
      });
      assert.equal(res.status, 200);

      // Vérification
      const leadRes = await fetch(`${BASE_URL}/api/leads/${testLeadSyncId}`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      const data = await leadRes.json() as { lead: { assigned_to: string } };
      assert.equal(data.lead.assigned_to, "u_closer1");
    });

    it("POST /api/admin/assign en mode 'round_robin' doit fonctionner sans erreur", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({ mode: "round_robin" }),
      });
      assert.equal(res.status, 200);
      const json = await res.json() as { ok: boolean; assigned: number };
      assert.equal(json.ok, true);
      assert.equal(typeof json.assigned, "number");
    });
  });

  // =========================================================================
  // SUITE 11 : CONFIGURATION DES MODÈLES IA & CATALOGUE
  // =========================================================================
  describe("11. Configuration des Modèles IA & Synchronisation Catalogue", () => {
    it("GET /api/admin/models doit renvoyer les réglages et le catalogue des modèles", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/models`, {
        headers: { Cookie: ADMIN_COOKIE },
      });
      assert.equal(res.status, 200);
      const json = await res.json() as { ok: boolean; settings: unknown[]; available: unknown[] };
      assert.equal(json.ok, true);
      assert.ok(Array.isArray(json.settings));
      assert.ok(Array.isArray(json.available));
    });

    it("POST /api/admin/models doit sauvegarder les choix de modèles et les budgets thinking", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({
          settings: [
            { action_type: "demo", provider: "anthropic", model: "claude-5-sonnet", thinking_budget: 0 },
            { action_type: "audit", provider: "gemini", model: "gemini-3.8-flash", thinking_budget: 0 },
            { action_type: "battlecard", provider: "gemini", model: "gemini-3.1-pro-preview", thinking_budget: 2048 },
          ],
        }),
      });
      assert.equal(res.status, 200);
      const json = await res.json() as { ok: boolean };
      assert.equal(json.ok, true);
    });

    it("POST /api/admin/models/refresh doit actualiser le catalogue des modèles en cache", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/models/refresh`, {
        method: "POST",
        headers: { Cookie: ADMIN_COOKIE },
      });
      assert.equal(res.status, 200);
      const json = await res.json() as { ok: boolean; count: number };
      assert.equal(json.ok, true);
      assert.ok(json.count > 0);
    });
  });

  // =========================================================================
  // SUITE 12 : CLOISONNEMENT STRICT DES CLOSERS & GESTION DES OPPORTUNITÉS
  // =========================================================================
  describe("12. Cloisonnement Strict des Closers & Gestion Granulaire des Opportunités", () => {
    const restrictedLeadId = "beef" + Date.now().toString(16).slice(-12);

    it("Création d'un lead 'google_reviews' assigné au closer 1", async () => {
      const res = await fetch(`${BASE_URL}/api/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SYNC_SECRET}`,
        },
        body: JSON.stringify({
          id: restrictedLeadId,
          company_name: "Restaurant Le Gourmet Test",
          activity: "Restaurant",
          city: "Foix",
          phone: "0561000099",
          opportunity_type: "google_reviews",
          demo_html: `<!DOCTYPE html><html><body>Démo Restaurant</body></html>`,
          battlecard_data: { callScript: "Script Restaurant" },
        }),
      });
      assert.equal(res.status, 200);

      const resAssign = await fetch(`${BASE_URL}/api/admin/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({
          mode: "manual",
          leadId: restrictedLeadId,
          userId: "u_closer1",
        }),
      });
      assert.equal(resAssign.status, 200);
    });

    it("L'Admin restreint les opportunités du closer 1 à ['website'] uniquement", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/users/u_closer1/opportunities`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({ opportunities: ["website"] }),
      });
      assert.equal(res.status, 200);
      const json = await res.json() as { ok: boolean; allowed_opportunities: string[] };
      assert.equal(json.ok, true);
      assert.deepEqual(json.allowed_opportunities, ["website"]);
    });

    it("Le Closer 1 tente de lire le lead 'google_reviews' assigné -> HTTP 403 Forbidden", async () => {
      const res = await fetch(`${BASE_URL}/api/leads/${restrictedLeadId}`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(res.status, 403, "Le closer ne doit pas pouvoir accéder à un lead d'une opportunité désactivée pour lui");
    });

    it("Le Closer 1 tente de verrouiller le lead 'google_reviews' -> HTTP 403 Forbidden", async () => {
      const res = await fetch(`${BASE_URL}/api/leads/${restrictedLeadId}/lock`, {
        method: "POST",
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(res.status, 403, "Le closer ne doit pas pouvoir verrouiller un lead d'une opportunité désactivée pour lui");
    });

    it("Sur l'accueil Closer /, le lead désactivé ne doit pas apparaître et le filtre 'Avis Google' doit être masqué", async () => {
      const res = await fetch(`${BASE_URL}/`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(res.status, 200);
      const html = await res.text();

      // Ne doit pas voir le restaurant d'avis google
      assert.ok(!html.includes("Restaurant Le Gourmet Test"), "Le lead avec opportunité non autorisée ne doit pas apparaître");
      // La barre de filtre de ce closer ne doit pas proposer Avis Google
      assert.ok(!html.includes("opp=google_reviews"), "Le badge de filtre pour opportunité non autorisée ne doit pas apparaître");
      // Mais doit proposer Site Web
      assert.ok(html.includes("opp=website"));
    });

    it("L'Admin réactive ['website', 'google_reviews', 'seo_local', 'ads_acquisition', 'custom'] pour le closer 1", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/users/u_closer1/opportunities`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({
          opportunities: ["website", "google_reviews", "seo_local", "ads_acquisition", "custom"],
        }),
      });
      assert.equal(res.status, 200);
      const json = await res.json() as { ok: boolean; allowed_opportunities: string[] };
      assert.equal(json.ok, true);
      assert.equal(json.allowed_opportunities.length, 5);
    });

    it("Après réactivation, le Closer 1 peut immédiatement accéder et verrouiller son lead 'google_reviews'", async () => {
      const resGet = await fetch(`${BASE_URL}/api/leads/${restrictedLeadId}`, {
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(resGet.status, 200);

      const resLock = await fetch(`${BASE_URL}/api/leads/${restrictedLeadId}/lock`, {
        method: "POST",
        headers: { Cookie: CLOSER_COOKIE },
      });
      assert.equal(resLock.status, 200);
      const lockJson = await resLock.json() as { ok: boolean };
      assert.equal(lockJson.ok, true);
    });

    it("POST /api/admin/users avec des opportunités personnalisées crée bien le closer avec ce périmètre", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({
          name: "Closer Spécialiste SEO",
          quota: 80,
          opportunities: ["seo_local", "ads_acquisition"],
        }),
      });
      assert.equal(res.status, 200);
      const json = await res.json() as { ok: boolean; access_token: string; user_id: string };
      assert.equal(json.ok, true);
      assert.ok(json.access_token && json.access_token.length >= 32);

      // Vérification dans l'onglet admin team
      const resTeam = await fetch(`${BASE_URL}/admin?tab=team`, {
        headers: { Cookie: ADMIN_COOKIE },
      });
      const html = await resTeam.text();
      assert.ok(html.includes("Closer Spécialiste SEO"));
    });
  });

  describe("13. Templating Email & Envoi sous Contrôle Humain (aucun envoi automatique)", () => {
    const qaLeadId = "a11d" + Date.now().toString(16).slice(-12);

    it("Préparation : lead 'audit_qa_trackers' avec traceurs, stack et brouillon IA, assigné au closer 1", async () => {
      await fetch(`${BASE_URL}/api/admin/users/u_closer1/opportunities`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({ opportunities: ["website", "audit_qa_trackers", "google_reviews", "seo_local", "ads_acquisition", "custom"] }),
      });
      const res = await fetch(`${BASE_URL}/api/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SYNC_SECRET}` },
        body: JSON.stringify({
          id: qaLeadId,
          company_name: "Agence Pixel Test",
          activity: "Agence web",
          city: "Toulouse",
          website_url: "https://www.pixel-test.fr/",
          opportunity_type: "audit_qa_trackers",
          audit_data: {
            score: 40,
            summary: "Traceurs avant consentement",
            weaknesses: ["GA4 avant CMP"],
            recommendations: [],
            trackers_found: ["Google Analytics (GA4)", "Meta Pixel"],
            stack: ["Webflow", "GSAP"],
            key_people: ["Florian Test"],
          },
          demo_html: `<!DOCTYPE html><html><body>Rapport</body></html>`,
          battlecard_data: { callScript: "-", objections: [], whatsappText: "", coldEmail: { subject: "Sujet IA", body: "Corps IA" } },
        }),
      });
      assert.equal(res.status, 200);
      const resAssign = await fetch(`${BASE_URL}/api/admin/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({ mode: "manual", leadId: qaLeadId, userId: "u_closer1" }),
      });
      assert.equal(resAssign.status, 200);
    });

    it("La vue closer embarque le composer : modèles, variables du lead, avertissement 'Aucun envoi automatique'", async () => {
      const res = await fetch(`${BASE_URL}/?view=list&opp=audit_qa_trackers`, { headers: { Cookie: CLOSER_COOKIE } });
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes("Aucun envoi automatique"));
      assert.ok(html.includes('id="sp_tpl_select"'));
      assert.ok(html.includes('id="sp_mark_sent"'));
      assert.ok(html.includes("qa_trackers_first"), "Le registre de modèles doit être injecté");
      assert.ok(html.includes("pixel-test.fr"), "Le domaine doit être pré-calculé dans les variables");
      assert.ok(html.includes("Hello Florian"), "La salutation personnalisée doit être pré-calculée");
    });

    it("POST /email-sent sans destinataire valide -> HTTP 400", async () => {
      const res = await fetch(`${BASE_URL}/api/leads/${qaLeadId}/email-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: CLOSER_COOKIE },
        body: JSON.stringify({ to: "pas-un-email", subject: "Test" }),
      });
      assert.equal(res.status, 400);
    });

    it("POST /email-sent sans session -> HTTP 401", async () => {
      const res = await fetch(`${BASE_URL}/api/leads/${qaLeadId}/email-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "dev@pixel-test.fr", subject: "Test" }),
      });
      assert.equal(res.status, 401);
    });

    it("POST /email-sent historise l'envoi manuel dans les notes et renseigne l'email du lead", async () => {
      const res = await fetch(`${BASE_URL}/api/leads/${qaLeadId}/email-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: CLOSER_COOKIE },
        body: JSON.stringify({ to: "dev@pixel-test.fr", subject: "[Dev QA] Test", body: "...", template_id: "qa_trackers_first" }),
      });
      assert.equal(res.status, 200);
      const json = await res.json() as { ok: boolean; call_notes: string };
      assert.ok(json.call_notes.includes("Email envoyé"));
      assert.ok(json.call_notes.includes("dev@pixel-test.fr"));
      assert.ok(json.call_notes.includes("qa_trackers_first"));

      const resLead = await fetch(`${BASE_URL}/api/leads/${qaLeadId}`, { headers: { Cookie: CLOSER_COOKIE } });
      const lead = await resLead.json() as { email?: string; lead?: { email?: string } };
      assert.equal((lead.lead ?? lead).email, "dev@pixel-test.fr");
    });

    it("L'historique garde l'email complet, accepte une réponse collée et refuse un contenu vide", async () => {
      const body = "Bonjour,\nVoici le rapport complet.\nCordialement";
      await fetch(`${BASE_URL}/api/leads/${qaLeadId}/email-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: CLOSER_COOKIE },
        body: JSON.stringify({ to: "dev@pixel-test.fr", subject: "Objet historique", body }),
      });
      const reply = await fetch(`${BASE_URL}/api/leads/${qaLeadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: CLOSER_COOKIE },
        body: JSON.stringify({ kind: "reply_received", channel: "email", from: "dev@pixel-test.fr", text: "Merci, on regarde ça demain." }),
      });
      assert.equal(reply.status, 200);

      const empty = await fetch(`${BASE_URL}/api/leads/${qaLeadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: CLOSER_COOKIE },
        body: JSON.stringify({ kind: "reply_received", text: "   " }),
      });
      assert.equal(empty.status, 400);
      const forged = await fetch(`${BASE_URL}/api/leads/${qaLeadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: CLOSER_COOKIE },
        body: JSON.stringify({ kind: "email_sent", text: "faux envoi" }),
      });
      assert.equal(forged.status, 400, "un email envoyé ne se déclare que via /email-sent");

      const list = await fetch(`${BASE_URL}/api/leads/${qaLeadId}/activities`, { headers: { Cookie: CLOSER_COOKIE } });
      assert.equal(list.status, 200);
      const { activities } = (await list.json()) as {
        activities: Array<{ kind: string; summary: string; user_name: string | null; content: { body?: string; subject?: string; text?: string } | null }>;
      };
      const sent = activities.find((a) => a.kind === "email_sent" && a.content?.subject === "Objet historique");
      assert.ok(sent, "email envoyé présent dans l'historique");
      assert.equal(sent!.content?.body, body, "corps complet conservé");
      assert.ok(sent!.user_name, "auteur renseigné");
      assert.equal(activities[0]!.kind, "reply_received", "plus récent en premier");
      assert.equal(activities[0]!.content?.text, "Merci, on regarde ça demain.");
    });

    it("Une issue d'appel est historisée avec sa note et le changement d'étape", async () => {
      const res = await fetch(`${BASE_URL}/api/leads/${qaLeadId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: CLOSER_COOKIE },
        body: JSON.stringify({ status: "callback_scheduled", outcome: { label: "Messagerie", note: "rappeler le CTO" } }),
      });
      assert.equal(res.status, 200);
      const list = await fetch(`${BASE_URL}/api/leads/${qaLeadId}/activities`, { headers: { Cookie: CLOSER_COOKIE } });
      const { activities } = (await list.json()) as { activities: Array<{ kind: string; summary: string; content: { note?: string; to?: string } | null }> };
      assert.equal(activities[0]!.kind, "call_outcome");
      assert.equal(activities[0]!.summary, "Issue : Messagerie");
      assert.equal(activities[0]!.content?.note, "rappeler le CTO");
      assert.equal(activities[0]!.content?.to, "callback_scheduled");
    });

    it("L'admin règle les canaux traités par un closer (au moins un, canaux connus seulement)", async () => {
      const set = (channels: unknown[]) =>
        fetch(`${BASE_URL}/api/admin/users/u_closer1/channels`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
          body: JSON.stringify({ channels }),
        });
      assert.equal((await set([])).status, 400);
      const r = await set(["phone", "fax", "phone"]);
      assert.equal(r.status, 200);
      assert.deepEqual(((await r.json()) as { allowed_channels: string[] }).allowed_channels, ["phone"]);
      const denied = await fetch(`${BASE_URL}/api/admin/users/u_closer1/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: CLOSER_COOKIE },
        body: JSON.stringify({ channels: ["email"] }),
      });
      assert.equal(denied.status, 403);
      assert.equal((await set(["phone", "email", "contact_form"])).status, 200);
    });

    it("Un closer ne peut pas historiser un envoi sur un lead d'une opportunité désactivée -> HTTP 403", async () => {
      await fetch(`${BASE_URL}/api/admin/users/u_closer1/opportunities`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({ opportunities: ["website"] }),
      });
      const res = await fetch(`${BASE_URL}/api/leads/${qaLeadId}/email-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: CLOSER_COOKIE },
        body: JSON.stringify({ to: "dev@pixel-test.fr", subject: "Test" }),
      });
      assert.equal(res.status, 403);
      await fetch(`${BASE_URL}/api/admin/users/u_closer1/opportunities`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ADMIN_COOKIE },
        body: JSON.stringify({ opportunities: ["website", "audit_qa_trackers", "google_reviews", "seo_local", "ads_acquisition", "custom"] }),
      });
    });
  });
});
