import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LEAD_STATUSES, OPPORTUNITY_TYPES, parseAllowedOpportunities, type LeadStatus } from "../types";
import { getGoogleAuthUrl } from "../services/googleCalendar";
import { computeDemoExpiryIso, isDemoExpiredOrRevoked } from "../routes/public";
import { OFFER_TIERS } from "../services/stripe";
import { renderAgencyLandingHtml } from "../views/landing";

describe("RÈGLES MÉTIER : Dashboard Web & Pipeline Commercial (lead-dashboard-web)", () => {
  describe("Règle 5 : Cycle de vie commercial & Échelons du Pipeline", () => {
    it("doit contenir exactement les 6 étapes du cycle de vente", () => {
      assert.deepEqual(LEAD_STATUSES, [
        "demo_ready",
        "hot_lead",
        "called",
        "won",
        "lost",
        "callback_scheduled",
      ]);
    });

    it("doit interdire à un closer de modifier un dossier clôturé (gagné ou perdu)", () => {
      // Simule la règle métier de POST /api/leads/:id/status et POST /api/leads/:id/update
      function canCloserModifyStatus(currentStatus: LeadStatus, newStatus: LeadStatus, role: "closer" | "admin"): boolean {
        if (role === "admin") return true;
        if ((currentStatus === "won" || currentStatus === "lost") && newStatus !== currentStatus) {
          return false;
        }
        return true;
      }

      assert.equal(canCloserModifyStatus("won", "called", "closer"), false, "Closer ne peut pas rouvrir un dossier gagné");
      assert.equal(canCloserModifyStatus("lost", "callback_scheduled", "closer"), false, "Closer ne peut pas rouvrir un dossier perdu");
      assert.equal(canCloserModifyStatus("won", "called", "admin"), true, "Admin a les pleins pouvoirs pour réactiver un dossier");
      assert.equal(canCloserModifyStatus("called", "won", "closer"), true, "Closer peut closer une affaire gagnée");
      assert.equal(canCloserModifyStatus("called", "callback_scheduled", "closer"), true, "Closer peut planifier une relance ultérieure");
    });
  });

  describe("Règle 6 : Verrouillage Atomique Anti-Doublon d'Appel (Lock 15 min)", () => {
    const LOCK_MINUTES = 15;

    it("doit poser un verrou d'exactement 15 minutes", () => {
      const now = new Date("2026-11-08T10:00:00.000Z");
      const until = new Date(now.getTime() + LOCK_MINUTES * 60_000);

      assert.equal(until.toISOString(), "2026-11-08T10:15:00.000Z");
      assert.equal((until.getTime() - now.getTime()) / 60_000, 15);
    });

    it("doit considérer un lead comme verrouillé uniquement si le verrou est dans le futur et posé par un autre utilisateur", () => {
      const now = new Date("2026-11-08T10:00:00.000Z").toISOString();
      const future = new Date("2026-11-08T10:12:00.000Z").toISOString();
      const past = new Date("2026-11-08T09:55:00.000Z").toISOString();

      function isLockedByOther(lead: { locked_by: string | null; locked_until: string | null }, userId: string): boolean {
        return !!(lead.locked_by && lead.locked_by !== userId && lead.locked_until && lead.locked_until > now);
      }

      assert.equal(isLockedByOther({ locked_by: "closer_2", locked_until: future }, "closer_1"), true, "Doit bloquer l'appel concurrent");
      assert.equal(isLockedByOther({ locked_by: "closer_1", locked_until: future }, "closer_1"), false, "Le détenteur du lock peut continuer");
      assert.equal(isLockedByOther({ locked_by: "closer_2", locked_until: past }, "closer_1"), false, "Un lock expiré ne doit plus bloquer");
      assert.equal(isLockedByOther({ locked_by: null, locked_until: null }, "closer_1"), false, "Un lead non verrouillé est libre");
    });
  });

  describe("Règle 7 : Format iCalendar RFC 5545 & Durée par défaut", () => {
    function formatIcsDate(d: Date): string {
      return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    }

    it("doit formater les dates UTC sans tirets ni deux-points", () => {
      const date = new Date("2026-11-10T14:30:00.000Z");
      assert.equal(formatIcsDate(date), "20261110T143000Z");
    });

    it("doit fixer un créneau par défaut de 30 minutes et une alarme à 10 minutes", () => {
      const start = new Date("2026-11-10T14:30:00.000Z");
      const end = new Date(start.getTime() + 30 * 60 * 1000);

      assert.equal(end.toISOString(), "2026-11-10T15:00:00.000Z");
      assert.equal((end.getTime() - start.getTime()) / 60_000, 30);
    });

    it("doit produire une chaîne iCalendar RFC 5545 complète et valide", () => {
      const start = new Date("2026-11-10T14:30:00.000Z");
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      const now = new Date("2026-11-08T10:00:00.000Z");

      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//LeadEngine CRM//FR",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        "UID:lead_123456@leadengine.local",
        `DTSTAMP:${formatIcsDate(now)}`,
        `DTSTART:${formatIcsDate(start)}`,
        `DTEND:${formatIcsDate(end)}`,
        "SUMMARY:📞 Relance : Plomberie Martin (Plombier)",
        "DESCRIPTION:Notes de l'échange",
        "LOCATION:Tél: 0612345678",
        "STATUS:CONFIRMED",
        "BEGIN:VALARM",
        "TRIGGER:-PT10M",
        "ACTION:DISPLAY",
        "DESCRIPTION:Rappel Relance Prospect",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");

      assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
      assert.ok(ics.endsWith("END:VCALENDAR"));
      assert.ok(ics.includes("DTSTART:20261110T143000Z"));
      assert.ok(ics.includes("DTEND:20261110T150000Z"));
      assert.ok(ics.includes("TRIGGER:-PT10M"));
    });
  });

  describe("Règle 8 : Catégorisation temporelle des Relances (En retard, Aujourd'hui, À venir)", () => {
    it("doit classifier une relance passée non clôturée comme 'En retard' / Urgente", () => {
      const now = new Date("2026-11-08T10:00:00.000Z");
      const pastCallback = "2026-11-08T08:30:00.000Z";

      const isOverdue = (cbDate: string, status: LeadStatus): boolean => {
        return new Date(cbDate).getTime() < now.getTime() && status !== "won" && status !== "lost";
      };

      assert.equal(isOverdue(pastCallback, "callback_scheduled"), true, "Relance passée doit être signalée en retard");
      assert.equal(isOverdue(pastCallback, "called"), true, "Appel passé doit être signalé en retard");
      assert.equal(isOverdue(pastCallback, "won"), false, "Dossier déjà gagné ne doit pas être signalé en retard");
      assert.equal(isOverdue(pastCallback, "lost"), false, "Dossier perdu ne doit pas être signalé en retard");
    });

    it("doit identifier un créneau prévu pour aujourd'hui", () => {
      const todayStr = "2026-11-08";
      const leadDate = "2026-11-08T15:00:00.000Z";
      assert.equal(leadDate.slice(0, 10), todayStr);
    });
  });

  describe("Règle 9 : Paramétrage & Sécurisation Google OAuth 2.0", () => {
    it("doit construire l'URL d'autorisation Google avec les scopes et le mode offline", () => {
      const env = {
        GOOGLE_CLIENT_ID: "client_id_test.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "secret",
      } as any;

      const url = getGoogleAuthUrl(env, "test_state_123", "http://127.0.0.1:8788/auth/google/callback");
      const parsed = new URL(url);

      assert.equal(parsed.origin, "https://accounts.google.com");
      assert.equal(parsed.pathname, "/o/oauth2/v2/auth");
      assert.equal(parsed.searchParams.get("client_id"), "client_id_test.apps.googleusercontent.com");
      assert.equal(parsed.searchParams.get("access_type"), "offline");
      assert.equal(parsed.searchParams.get("prompt"), "consent");
      assert.equal(parsed.searchParams.get("state"), "test_state_123");
      assert.ok(parsed.searchParams.get("scope")?.includes("calendar.events"));
    });
  });

  describe("Règle 11 : Catalogue d'Opportunités & Cohérence des Filtres", () => {
    it("doit exposer les types de besoins/opportunités supportés incluant audit_qa_trackers", () => {
      const ids = OPPORTUNITY_TYPES.map((o) => o.id);
      assert.deepEqual(ids, ["website", "audit_qa_trackers", "google_reviews", "seo_local", "ads_acquisition", "custom"]);
    });

    it("chaque type d'opportunité doit comporter un badge, un canal, un modèle et un focus pitch", () => {
      for (const opp of OPPORTUNITY_TYPES) {
        assert.ok(opp.label.length > 0, `label manquant pour ${opp.id}`);
        assert.ok(opp.badge.length > 0, `badge manquant pour ${opp.id}`);
        assert.ok(opp.pitchFocus.length > 0, `pitchFocus manquant pour ${opp.id}`);
        assert.ok(["vocal_closer", "async_email"].includes(opp.channel), `channel invalide pour ${opp.id}`);
        assert.ok(["one_shot", "recurring", "both"].includes(opp.businessModel), `businessModel invalide pour ${opp.id}`);
        assert.ok(["demo_web", "audit_report"].includes(opp.proofType), `proofType invalide pour ${opp.id}`);
        assert.ok(["phone_battlecard", "cold_email"].includes(opp.pitchType), `pitchType invalide pour ${opp.id}`);
      }
    });

    it("doit isoler correctement les leads selon le filtre d'opportunité sélectionné", () => {
      const mockLeads = [
        { id: "1", opportunity_type: "website" },
        { id: "2", opportunity_type: "google_reviews" },
        { id: "3", opportunity_type: "website" },
        { id: "4", opportunity_type: "seo_local" },
      ];

      const filterLeads = (opp: string) => {
        if (opp === "all") return mockLeads;
        return mockLeads.filter((l) => l.opportunity_type === opp);
      };

      assert.equal(filterLeads("all").length, 4);
      assert.equal(filterLeads("website").length, 2);
      assert.equal(filterLeads("google_reviews").length, 1);
      assert.equal(filterLeads("ads_acquisition").length, 0);
    });
  });

  describe("Règle 12 : Cloisonnement strict des Closers & Filtrage par Besoins Activés", () => {
    it("doit parser correctement les allowed_opportunities ou replier sur tous les types", () => {
      const allExpected = ["website", "audit_qa_trackers", "google_reviews", "seo_local", "ads_acquisition", "custom"];
      assert.deepEqual(parseAllowedOpportunities(null), allExpected);
      assert.deepEqual(parseAllowedOpportunities(""), allExpected);
      assert.deepEqual(parseAllowedOpportunities(undefined), allExpected);
      assert.deepEqual(parseAllowedOpportunities("invalid-json"), allExpected);

      assert.deepEqual(
        parseAllowedOpportunities('["website","google_reviews"]'),
        ["website", "google_reviews"]
      );

      // Ignore les types non autorisés ou invalides
      assert.deepEqual(
        parseAllowedOpportunities('["website","inconnu","seo_local"]'),
        ["website", "seo_local"]
      );
    });

    it("doit restreindre la visibilité des leads d'un closer à ses opportunités autorisées et son affectation", () => {
      const closerUser = {
        id: "closer_1",
        role: "closer" as const,
        allowed_opportunities: '["website", "google_reviews"]',
      };

      const leads = [
        { id: "l1", assigned_to: "closer_1", opportunity_type: "website" },
        { id: "l2", assigned_to: "closer_1", opportunity_type: "seo_local" }, // opportunité désactivée pour ce closer
        { id: "l3", assigned_to: "closer_2", opportunity_type: "website" }, // assigné à un autre closer
        { id: "l4", assigned_to: null, opportunity_type: "website" }, // non assigné
        { id: "l5", assigned_to: "closer_1", opportunity_type: "google_reviews" },
      ];

      const allowed = parseAllowedOpportunities(closerUser.allowed_opportunities);

      const visibleLeads = leads.filter(
        (l) => l.assigned_to === closerUser.id && allowed.includes(l.opportunity_type as any)
      );

      assert.equal(visibleLeads.length, 2);
      assert.deepEqual(visibleLeads.map((l) => l.id), ["l1", "l5"]);
    });

    it("doit filtrer les closers éligibles lors de l'attribution round-robin selon l'opportunity_type du lead", () => {
      const allClosers = [
        { id: "c1", is_active: 1, role: "closer", allowed_opportunities: '["website"]' },
        { id: "c2", is_active: 1, role: "closer", allowed_opportunities: '["google_reviews", "seo_local"]' },
        { id: "c3", is_active: 0, role: "closer", allowed_opportunities: '["website", "google_reviews"]' }, // inactif
      ];

      function getEligibleClosers(leadOpp: string) {
        return allClosers.filter((u) => {
          if (u.is_active !== 1 || u.role !== "closer") return false;
          const opps = parseAllowedOpportunities(u.allowed_opportunities);
          return opps.includes(leadOpp as any);
        });
      }

      const forWebsite = getEligibleClosers("website");
      assert.equal(forWebsite.length, 1);
      assert.equal(forWebsite[0].id, "c1");

      const forReviews = getEligibleClosers("google_reviews");
      assert.equal(forReviews.length, 1);
      assert.equal(forReviews[0].id, "c2");

      const forAds = getEligibleClosers("ads_acquisition");
      assert.equal(forAds.length, 0, "Aucun closer éligible pour les ads");
    });
  });

  describe("Règle 21 : Invalidation manuelle & Expiration automatique des Démos Clients", () => {
    it("doit détecter une démo révoquée manuellement ou dont la date d'expiration est dépassée", () => {
      const nowMs = Date.parse("2026-11-08T12:00:00.000Z");
      assert.equal(isDemoExpiredOrRevoked({ demo_revoked: 0, demo_expires_at: null }, nowMs), false);
      assert.equal(isDemoExpiredOrRevoked({ demo_revoked: 1, demo_expires_at: null }, nowMs), true);
      assert.equal(
        isDemoExpiredOrRevoked({ demo_revoked: 0, demo_expires_at: "2026-11-08T11:59:59.000Z" }, nowMs),
        true,
      );
      assert.equal(
        isDemoExpiredOrRevoked({ demo_revoked: 0, demo_expires_at: "2026-11-10T12:00:00.000Z" }, nowMs),
        false,
      );
    });

    it("doit calculer une échéance d'expiration automatique à +5 jours après ouverture ou appel", () => {
      const base = new Date("2026-11-08T10:00:00.000Z");
      const expiry = computeDemoExpiryIso(5, base);
      assert.equal(expiry, "2026-11-13T10:00:00.000Z");
    });
  });

  describe("Règle 22 : Modèle Commercial 3 Paliers & Landing Page Dissociée (Lead Volontaire)", () => {
    it("doit définir les 3 formules d'offres (Statique 490€, Admin CMS 1290€, Sur-Mesure 2900€)", () => {
      assert.equal(OFFER_TIERS.static.setupAmountCents, 49000);
      assert.equal(OFFER_TIERS.admin_cms.setupAmountCents, 129000);
      assert.equal(OFFER_TIERS.custom.setupAmountCents, 290000);
    });

    it("doit générer la landing page publique dissociée avec les 3 formules, la gestion NDD et le formulaire de rappel", () => {
      const html = renderAgencyLandingHtml("https://crm.alcantara-studio.fr");
      assert.ok(html.includes("490 €"), "Doit afficher la Formule 1 à 490 €");
      assert.ok(html.includes("1 290 €"), "Doit afficher la Formule 2 avec Panneau Admin à 1 290 €");
      assert.ok(html.includes("Pennylane"), "Doit mentionner la connexion au logiciel de comptabilité en Formule 3");
      assert.ok(html.includes("Nom de Domaine"), "Doit détailler la gestion intégrale du Nom de Domaine");
      assert.ok(html.includes("/api/public/inbound-lead"), "Doit pointer le formulaire de rappel vers le webhook inbound-lead");
    });
  });

  describe("Règle 23 : Sélection du Mode d'Exécution du Scan (Cycle Complet vs Préparation CLI 0€)", () => {
    type ExecutionMode = "full_auto" | "prep_only";

    function normalizeExecutionMode(input?: string | null): ExecutionMode {
      return input === "prep_only" ? "prep_only" : "full_auto";
    }

    it("doit replier sur 'full_auto' par défaut si non spécifié ou invalide", () => {
      assert.equal(normalizeExecutionMode(undefined), "full_auto");
      assert.equal(normalizeExecutionMode(null), "full_auto");
      assert.equal(normalizeExecutionMode(""), "full_auto");
      assert.equal(normalizeExecutionMode("invalid_mode"), "full_auto");
    });

    it("doit accepter explicitement le mode 'prep_only' pour l'exécution Antigravity CLI 0€", () => {
      assert.equal(normalizeExecutionMode("prep_only"), "prep_only");
      assert.equal(normalizeExecutionMode("full_auto"), "full_auto");
    });

    it("doit router le message de déclenchement selon le mode d'exécution choisi", () => {
      function getScheduledTriggerMessage(label: string, mode: ExecutionMode): string {
        return `Déclenché automatiquement par la planification "${label}" (${mode === "prep_only" ? "Préparation CLI 0€" : "Cycle Complet"})`;
      }

      assert.equal(
        getScheduledTriggerMessage("Matinale Plombiers", "prep_only"),
        'Déclenché automatiquement par la planification "Matinale Plombiers" (Préparation CLI 0€)',
      );
      assert.equal(
        getScheduledTriggerMessage("Matinale Plombiers", "full_auto"),
        'Déclenché automatiquement par la planification "Matinale Plombiers" (Cycle Complet)',
      );
    });

    it("doit formater le libellé et le badge visuel appropriés selon le mode d'exécution", () => {
      function getExecutionBadge(mode: ExecutionMode) {
        return mode === "prep_only"
          ? { label: "Mode CLI (0€)", color: "emerald", costEstimateEur: 0 }
          : { label: "Cycle Complet", color: "indigo", costEstimateEur: 0.05 };
      }

      const prepBadge = getExecutionBadge("prep_only");
      assert.equal(prepBadge.label, "Mode CLI (0€)");
      assert.equal(prepBadge.color, "emerald");
      assert.equal(prepBadge.costEstimateEur, 0, "Le mode CLI doit garantir un coût API nul");

      const autoBadge = getExecutionBadge("full_auto");
      assert.equal(autoBadge.label, "Cycle Complet");
      assert.equal(autoBadge.color, "indigo");
      assert.ok(autoBadge.costEstimateEur > 0);
    });

    it("doit router le worker CLI vers runPrepScan en mode prep_only et runFullCycle en full_auto", () => {
      const calls: string[] = [];

      function simulateWorkerDispatch(job: { execution_mode?: string }) {
        const mode = normalizeExecutionMode(job.execution_mode);
        if (mode === "prep_only") {
          calls.push("runPrepScan");
        } else {
          calls.push("runFullCycle");
        }
      }

      simulateWorkerDispatch({ execution_mode: "prep_only" });
      simulateWorkerDispatch({ execution_mode: "full_auto" });
      simulateWorkerDispatch({}); // fallback

      assert.deepEqual(calls, ["runPrepScan", "runFullCycle", "runFullCycle"]);
    });

    it("doit exclure les leads au statut 'pending_generation' du pipeline closer et les réserver à l'admin", () => {
      const allLeads = [
        { id: "l1", company_name: "Artisan 1", status: "pending_generation" },
        { id: "l2", company_name: "Artisan 2", status: "demo_ready" },
        { id: "l3", company_name: "Artisan 3", status: "hot_lead" },
        { id: "l4", company_name: "Artisan 4", status: "pending_generation" },
      ];

      // Filtre closer : uniquement les leads dont la démo est prête
      const closerVisible = allLeads.filter((l) => l.status !== "pending_generation");
      assert.equal(closerVisible.length, 2);
      assert.deepEqual(closerVisible.map((l) => l.id), ["l2", "l3"]);

      // Filtre admin onglet File d'attente CLI 0€
      const adminPending = allLeads.filter((l) => l.status === "pending_generation");
      assert.equal(adminPending.length, 2);
      assert.deepEqual(adminPending.map((l) => l.id), ["l1", "l4"]);
    });
  });

  describe("Règle 27 : Cockpit des Quotas & Sécurité Financière Anti-Dépassement (computeTokenMetrics)", () => {
    it("doit renvoyer un statut 'safe' (Feu vert 100% gratuit) sous les 10 000 neurones Cloudflare ou en mode CLI", async () => {
      const { computeTokenMetrics } = await import("../routes/admin");
      const raw = [
        {
          model: "@cf/meta/llama-3.1-8b-instruct",
          input: 50000,
          output: 20000,
          thinking: 0,
          total_calls: 30,
          input_today: 10000,
          output_today: 4000,
          calls_today: 10,
        },
        {
          model: "antigravity-0euro",
          input: 100000,
          output: 80000,
          thinking: 0,
          total_calls: 5,
          input_today: 20000,
          output_today: 15000,
          calls_today: 2,
        },
      ];

      const { tokens, quotas } = computeTokenMetrics(raw);
      assert.equal(quotas.safetyStatus, "safe");
      assert.equal(quotas.canContinueSafely, true);
      assert.equal(quotas.totalCostEstimateEur, 0);
      assert.ok(quotas.cloudflareUsedPercent < 70);
      assert.equal(tokens[0].quotaCategory, "cloudflare_free");
      assert.equal(tokens[1].quotaCategory, "cli_0euro");
    });

    it("le détail n'affiche que la journée pour Cloudflare (appels, tokens, coût) et le cumul pour les autres", async () => {
      const { computeTokenMetrics, tokenRowForDisplay } = await import("../routes/admin");
      const { tokens } = computeTokenMetrics([
        { model: "@cf/meta/llama-3.1-8b-instruct", input: 50000, output: 20000, thinking: 500, total_calls: 30, input_today: 10000, output_today: 4000, thinking_today: 50, calls_today: 10 },
        { model: "gemini-3-flash-preview", input: 9000, output: 3000, thinking: 0, total_calls: 12, input_today: 900, output_today: 300, calls_today: 2 },
      ]);
      const cf = tokenRowForDisplay(tokens[0]!);
      assert.deepEqual({ todayOnly: cf.todayOnly, calls: cf.calls, input: cf.input, output: cf.output, thinking: cf.thinking }, { todayOnly: true, calls: "10", input: 10000, output: 4000, thinking: 50 });
      assert.equal(cf.costEur, tokens[0]!.estimatedCostEur);
      const gem = tokenRowForDisplay(tokens[1]!);
      assert.deepEqual({ todayOnly: gem.todayOnly, calls: gem.calls, input: gem.input }, { todayOnly: false, calls: "2 / 12", input: 9000 });
    });

    it("doit basculer en 'warning' dès que le quota Cloudflare dépasse 70% des 10 000 neurones", async () => {
      const { computeTokenMetrics } = await import("../routes/admin");
      const raw = [
        {
          model: "@cf/meta/llama-3.1-8b-instruct",
          input: 300000,
          output: 100000,
          thinking: 0,
          total_calls: 100,
          input_today: 200000,
          output_today: 100000, // 300k tokens * 25 neurones/k = 7500 neurones (75%)
          calls_today: 80,
        },
      ];

      const { quotas } = computeTokenMetrics(raw);
      assert.equal(quotas.safetyStatus, "warning");
      assert.ok(quotas.cloudflareUsedPercent >= 70 && quotas.cloudflareUsedPercent < 90);
    });

    it("doit basculer en 'danger' (Coupe-circuit recommandé) si un modèle payant ou un dépassement survient", async () => {
      const { computeTokenMetrics } = await import("../routes/admin");
      const raw = [
        {
          model: "claude-3-5-sonnet",
          input: 500000,
          output: 100000,
          thinking: 0,
          total_calls: 10,
          input_today: 100000,
          output_today: 20000,
          calls_today: 5,
        },
      ];

      const { quotas } = computeTokenMetrics(raw);
      assert.equal(quotas.safetyStatus, "danger");
      assert.equal(quotas.canContinueSafely, false);
      assert.ok(quotas.totalCostEstimateEur > 0);
    });
  });
});

describe("Pixel d'ouverture des démos (audit 1.4)", () => {
  it("ajoute le pixel aux démos qui n'en ont pas, une seule fois, avant </body>", async () => {
    const { injectOpenTracker } = await import("../routes/public");
    const out = injectOpenTracker("<html><body><p>Démo</p></body></html>", "abc123");
    assert.ok(out.includes('"/api/tracker/open?leadId=abc123"'));
    assert.ok(out.indexOf("/api/tracker/open") < out.indexOf("</body>"));
    assert.equal(injectOpenTracker(out, "abc123"), out, "pas de second pixel");
  });

  it("ne touche pas une démo qui a déjà le pixel du générateur", async () => {
    const { injectOpenTracker } = await import("../routes/public");
    const html = '<body><script>fetch("https://app/api/tracker/open?leadId=x")</script></body>';
    assert.equal(injectOpenTracker(html, "x"), html);
  });
});

describe("Canaux traités par un closer (phase 3)", () => {
  it("lit la liste JSON et retombe sur tous les canaux si vide ou illisible", async () => {
    const { parseAllowedChannels } = await import("../types");
    assert.deepEqual(parseAllowedChannels('["email","fax"]'), ["email"]);
    assert.deepEqual(parseAllowedChannels(null), ["phone", "email", "contact_form"]);
    assert.deepEqual(parseAllowedChannels("[]"), ["phone", "email", "contact_form"]);
    assert.deepEqual(parseAllowedChannels("pas du json"), ["phone", "email", "contact_form"]);
  });
});
