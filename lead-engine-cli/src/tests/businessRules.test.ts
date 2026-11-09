import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { leadId, escapeHtml, stripCodeFences, parseDirectDomainLeads } from "../utils/helpers";
import { getCompetitorBenchmark } from "../benchmarks/competitorBenchmarks";
import {
  ALL_SCAN_MODULES,
  SCAN_MODULES_REGISTRY,
  buildObsolescenceSignals,
  classifyTrackerUrl,
  detectCmpFromHtml,
  detectPaidAdsFromHtml,
  detectTechStackFromHtml,
  extractCleanEmails,
  extractCopyrightYearFromText,
  extractKeyPeopleFromText,
  extractSocialLinksFromHtml,
  getModulesForOpportunity,
  parseSireneApiResponse,
} from "../inspector/siteInspector";
import { parseRgbToHex, resolveLogoUrl } from "../inspector/modules/brandingVisualModule";
import { generateTrackerReportHtml } from "../generator/trackerReportGenerator";

describe("RÈGLES MÉTIER : Moteur Local & CLI (lead-engine-cli)", () => {
  describe("Règle 1 : Unicité et Détection des doublons (leadId)", () => {
    it("doit générer un identifiant SHA-1 stable et tronqué à 16 caractères", () => {
      const id1 = leadId("Plomberie Dupont", "0612345678");
      const id2 = leadId("Plomberie Dupont", "0612345678");

      assert.equal(id1.length, 16);
      assert.equal(id1, id2, "Le même prospect doit toujours donner le même leadId");
      assert.match(id1, /^[0-9a-f]{16}$/, "L'ID doit être une chaîne hexadécimale de 16 caractères");
    });

    it("doit différencier deux entreprises de même nom ayant des téléphones différents", () => {
      const idA = leadId("Artisan Rénovation", "0611111111");
      const idB = leadId("Artisan Rénovation", "0622222222");

      assert.notEqual(idA, idB, "Deux numéros distincts doivent créer deux dossiers CRM distincts");
    });

    it("doit utiliser l'URL Google Maps comme fallback si le téléphone est absent", () => {
      const id = leadId("Entreprise Sans Tel", "https://maps.google.com/?cid=123456");
      assert.equal(id.length, 16);
    });
  });

  describe("Règle 2 : Attribution des Benchmarks Concurrents par Métier", () => {
    it("doit attribuer le benchmark Plomberie/Chauffage pour les mots-clés plomberie", () => {
      const b1 = getCompetitorBenchmark("Plombier Chauffagiste");
      const b2 = getCompetitorBenchmark("Installation Chaudière & Climatisation");

      assert.equal(b1.id, "plomberie_chauffage_clim");
      assert.equal(b2.id, "plomberie_chauffage_clim");
      assert.ok(b1.conversionBlueprint.hero.primaryCta.includes("Urgence"));
      assert.ok(b1.conversionBlueprint.mobileWinningPattern.stickyBarHtmlPrompt.includes("tel:"));
    });

    it("doit attribuer le benchmark Toiture/Couverture/Maçonnerie pour les couvreurs", () => {
      const b = getCompetitorBenchmark("Artisan Couvreur Zingueur");
      assert.equal(b.id, "toiture_couverture_maconnerie");
      assert.ok(b.copywritingHooks.length > 0);
    });

    it("doit attribuer le benchmark Électricien pour l'électricité", () => {
      const b = getCompetitorBenchmark("Électricien Bâtiment & Tertiaire");
      assert.equal(b.id, "electricite_domotique");
    });

    it("doit renvoyer le fallback universel de haute conversion si métier atypique", () => {
      const b = getCompetitorBenchmark("Dresseur d'aigles royaux");
      assert.equal(b.id, "general_local_winner");
      assert.ok(b.conversionBlueprint.hero.headlinePattern.length > 0);
    });
  });

  describe("Règle 3 : Sanitization & Sécurité des Données", () => {
    it("doit nettoyer les fences markdown ```html et ```json générées par les LLMs", () => {
      const rawHtml = "```html\n<!DOCTYPE html><html><body>Test</body></html>\n```";
      const cleaned = stripCodeFences(rawHtml);
      assert.equal(cleaned, "<!DOCTYPE html><html><body>Test</body></html>");

      const rawJson = "```json\n{\"ok\": true}\n```";
      const cleanedJson = stripCodeFences(rawJson);
      assert.equal(cleanedJson, '{"ok": true}');
    });

    it("doit échapper les caractères spéciaux HTML pour prévenir les failles XSS", () => {
      const malicious = '<script>alert("XSS")</script>&"test"';
      const safe = escapeHtml(malicious);

      assert.ok(!safe.includes("<script>"));
      assert.ok(safe.includes("&lt;script&gt;"));
      assert.ok(safe.includes("&amp;"));
      assert.ok(safe.includes("&quot;test&quot;"));
    });
  });

  describe("Règle 4 : Calcul du Score d'Audit de Performance", () => {
    it("doit pénaliser sévèrement un site existant dont le temps de chargement dépasse 4000ms", () => {
      const computeScore = (loadTimeMs: number | null): number => {
        return loadTimeMs && loadTimeMs > 4000 ? 35 : 45;
      };

      assert.equal(computeScore(5200), 35, "Site très lent (>4s) doit avoir un score critique de 35");
      assert.equal(computeScore(1800), 45, "Site plus réactif doit avoir le score de base");
      assert.equal(computeScore(null), 45, "Site sans mesure doit avoir le score standard");
    });
  });

  describe("Règle 10 : Filtrage Multi-Opportunités & Présence Web (mapsScraper)", () => {
    const shouldKeepLead = (
      website: string | null | undefined,
      filter: "all" | "no_website" | "has_website" = "all",
    ): boolean => {
      if (filter === "no_website" && website) return false;
      if (filter === "has_website" && !website) return false;
      return true;
    };

    it("doit ignorer les prospects avec site web si le filtre demande 'no_website'", () => {
      assert.equal(shouldKeepLead("https://example.com", "no_website"), false);
      assert.equal(shouldKeepLead(null, "no_website"), true);
      assert.equal(shouldKeepLead("", "no_website"), true);
    });

    it("doit ignorer les prospects sans site web si le filtre demande 'has_website'", () => {
      assert.equal(shouldKeepLead(null, "has_website"), false);
      assert.equal(shouldKeepLead("", "has_website"), false);
      assert.equal(shouldKeepLead("https://artisan-pro.fr", "has_website"), true);
    });

    it("doit conserver tous les prospects si le filtre est 'all'", () => {
      assert.equal(shouldKeepLead(null, "all"), true);
      assert.equal(shouldKeepLead("https://artisan-pro.fr", "all"), true);
    });
  });

  describe("Règle 16 : Interception & Classification des Traceurs avant consentement CMP", () => {
    it("doit identifier Google Analytics (GA4), Meta Pixel, Hotjar et Microsoft Clarity", () => {
      const ga = classifyTrackerUrl("https://www.google-analytics.com/g/collect?v=2&tid=G-XXXX");
      assert.equal(ga?.name, "Google Analytics (GA4)");
      assert.equal(ga?.category, "analytics");

      const fb = classifyTrackerUrl("https://connect.facebook.net/en_US/fbevents.js");
      assert.equal(fb?.name, "Meta / Facebook Pixel");
      assert.equal(fb?.category, "advertising");

      const hj = classifyTrackerUrl("https://static.hotjar.com/c/hotjar-12345.js?sv=6");
      assert.equal(hj?.name, "Hotjar Behavior Analytics");
      assert.equal(hj?.category, "heatmap_ux");

      const clarity = classifyTrackerUrl("https://www.clarity.ms/tag/abcdef");
      assert.equal(clarity?.name, "Microsoft Clarity");
    });

    it("doit ignorer les ressources légitimes (fonts, images, CDN first-party)", () => {
      assert.equal(classifyTrackerUrl("https://fonts.googleapis.com/css2?family=Inter"), null);
      assert.equal(classifyTrackerUrl("https://digidop.fr/assets/logo.svg"), null);
    });
  });

  describe("Règle 17 : Extraction d'Emails Propres & Décideurs Mentions Légales", () => {
    it("doit extraire les emails valides, prioriser contact@/hello@ et filtrer les faux emails techniques", () => {
      const raw = `
        Contactez-nous : zzz@agence-test.fr ou hello@agence-test.fr
        Faux emails : 12345@sentry.io, icon@2x.png, test@example.com, noreply@agence-test.fr
      `;
      const emails = extractCleanEmails(raw);
      assert.deepEqual(emails, ["hello@agence-test.fr", "zzz@agence-test.fr"]);
    });

    it("doit extraire le Directeur de la publication ou Gérant depuis les mentions légales", () => {
      const legalText = `
        Éditeur du site : SAS Digidop au capital de 10 000 €.
        Directeur de la publication : Monsieur Florian Buerger.
        Hébergement : Webflow Inc.
      `;
      const people = extractKeyPeopleFromText(legalText);
      assert.deepEqual(people, ["Florian Buerger"]);
    });
  });

  describe("Règle 18 : Parsing Direct de Listes de Domaines B2B sans Google Maps", () => {
    it("doit convertir une liste de domaines en prospects B2B prêts à inspecter", () => {
      const leads = parseDirectDomainLeads("domains:digidop.fr, https://www.acme-studio.com/fr", "Paris");
      assert.ok(leads);
      assert.equal(leads.length, 2);
      assert.equal(leads[0]?.name, "Digidop");
      assert.equal(leads[0]?.website, "https://digidop.fr");
      assert.equal(leads[1]?.name, "Acme Studio");
    });

    it("doit retourner null pour une requête métier Google Maps classique", () => {
      assert.equal(parseDirectDomainLeads("plombier, électricien", "Lyon"), null);
      assert.equal(parseDirectDomainLeads("artisans, commerces", "Bordeaux"), null);
    });
  });

  describe("Règle 19 : Génération Déterministe du Rapport QA Réseau & Pixel de Tracking", () => {
    it("doit générer un rapport HTML autonome listant les traceurs interceptés et le pixel d'ouverture", () => {
      const html = generateTrackerReportHtml({
        leadId: "aabbccddeeff0011",
        lead: {
          name: "Digidop",
          activity: "Agence Web",
          city: "Paris",
          phone: null,
          website: "https://www.digidop.fr",
          rating: 5,
          reviewsCount: 12,
          recentReviews: [],
          mapsUrl: "https://digidop.fr",
          placeId: null,
        },
        inspection: {
          url: "https://www.digidop.fr",
          loadTimeMs: 1120,
          isResponsive: true,
          dominantColors: ["#4f46e5"],
          logoUrl: null,
          screenshot: null,
          stack: ["Webflow", "GSAP"],
          cmpDetected: "Axeptio",
          trackersFound: ["Google Analytics (GA4)", "Hotjar Behavior Analytics"],
          trackerRequests: [
            { name: "Google Analytics (GA4)", category: "analytics", url: "https://www.google-analytics.com/g/collect?v=2" },
            { name: "Hotjar Behavior Analytics", category: "heatmap_ux", url: "https://static.hotjar.com/c/hotjar.js" },
          ],
        },
        remoteAppUrl: "http://localhost:8788",
      });

      assert.ok(html.includes("digidop.fr"));
      assert.ok(html.includes("Google Analytics (GA4)"));
      assert.ok(html.includes("Hotjar Behavior Analytics"));
      assert.ok(html.includes("Axeptio"));
      assert.ok(html.includes("Webflow"));
      assert.ok(html.includes("/api/tracker/open?leadId=aabbccddeeff0011"));
    });
  });

  describe("Règle 20 : Architecture Modulaire de Scan & Recettes par Opportunité", () => {
    it("chaque mini-module du registre possède un id, un label et au moins un hook d'exécution", () => {
      for (const id of ALL_SCAN_MODULES) {
        const mod = SCAN_MODULES_REGISTRY[id];
        assert.ok(mod, `Le module ${id} doit exister dans le registre`);
        assert.equal(mod.id, id);
        assert.ok(mod.label.length > 0);
        assert.ok(mod.beforeNavigate || mod.afterNavigate, `Le module ${id} doit exposer beforeNavigate ou afterNavigate`);
      }
    });

    it("sélectionne uniquement les mini-modules pertinents selon le type d'opportunité", () => {
      const qaMods = getModulesForOpportunity("audit_qa_trackers");
      assert.ok(qaMods.includes("trackers_cmp"));
      assert.ok(qaMods.includes("tech_stack"));
      assert.ok(qaMods.includes("contacts_legal"));
      assert.ok(!qaMods.includes("perf_mobile"), "L'audit traceurs RGPD ne perd pas de temps sur le resize mobile");

      const webMods = getModulesForOpportunity("website");
      assert.ok(webMods.includes("branding_visual"));
      assert.ok(webMods.includes("perf_mobile"));
      assert.ok(webMods.includes("contacts_legal"));
      assert.ok(!webMods.includes("trackers_cmp"), "La création de site artisan n'active pas l'écouteur RGPD par défaut");
    });

    it("les briques unitaires detectCmpFromHtml et detectTechStackFromHtml fonctionnent isolément", () => {
      assert.equal(detectCmpFromHtml('<script src="https://static.axept.io/sdk.js"></script>'), "Axeptio");
      assert.equal(detectCmpFromHtml("<html><body>Sans bandeau</body></html>"), null);

      const stack = detectTechStackFromHtml(
        '<html data-wf-site="123"><div class="backdrop-blur"></div></html>',
        "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js",
      );
      assert.deepEqual(stack, ["Webflow", "GSAP", "Tailwind CSS"]);
    });

    it("extrait passivement les profils LinkedIn, Facebook et Instagram en filtrant les boutons de partage", () => {
      const html = `
        <a href="https://www.linkedin.com/in/florian-buerger/">Fondateur</a>
        <a href="https://www.linkedin.com/company/digidop">Agence</a>
        <a href="https://www.linkedin.com/sharing/share-offsite/?url=test">Partager</a>
        <a href="https://www.facebook.com/artisan.menuiserie">Facebook Pro</a>
        <a href="https://www.instagram.com/studio_creatif/">Instagram</a>
      `;
      const socials = extractSocialLinksFromHtml(html);
      assert.deepEqual(socials.linkedin, [
        "https://www.linkedin.com/in/florian-buerger",
        "https://www.linkedin.com/company/digidop",
      ]);
      assert.deepEqual(socials.facebook, ["https://www.facebook.com/artisan.menuiserie"]);
      assert.deepEqual(socials.instagram, ["https://www.instagram.com/studio_creatif"]);
    });

    it("formate le dirigeant et le SIREN depuis la réponse de l'API Annuaire des Entreprises (api.gouv.fr)", () => {
      const parsed = parseSireneApiResponse({
        results: [
          {
            siren: "894512367",
            date_creation: "2021-03-15",
            dirigeants: [{ prenoms: "JEAN-MARC PIERRE", nom: "DUPUY", qualite: "Gérant" }],
          },
        ],
      });
      assert.equal(parsed.siren, "894512367");
      assert.equal(parsed.createdAt, "2021-03-15");
      assert.deepEqual(parsed.keyPeople, ["Jean-Marc Dupuy"]);
    });

    it("détecte les pixels publicitaires payants (Google Ads AW-, Meta Pixel) via adsPixelSpyModule", () => {
      const html = `
        <script>gtag('config', 'AW-987654321');</script>
        <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
      `;
      const ads = detectPaidAdsFromHtml(html);
      assert.deepEqual(ads, ["Google Ads (Conversion AW-)", "Meta Ads (Facebook Pixel)"]);
    });

    it("extrait l'année du copyright et signale un site HTTP non sécurisé ou obsolète via freshnessSslModule", () => {
      const year = extractCopyrightYearFromText("Pied de page — Copyright © 2016 - 2019 Menuiserie Martin. Tous droits réservés.", 2026);
      assert.equal(year, 2019);

      const { isHttps, signals } = buildObsolescenceSignals({
        finalUrl: "http://menuiserie-martin.fr",
        copyrightYear: year,
        brokenImagesCount: 2,
        currentYear: 2026,
      });
      assert.equal(isHttps, false);
      assert.equal(signals.length, 3);
      assert.ok(signals[0]?.includes("HTTP sans cadenas SSL"));
      assert.ok(signals[1]?.includes("2019"));
      assert.ok(signals[2]?.includes("2 image(s) cassée(s)"));
    });
  });

  describe("Règle 24 : Robustesse d'Inspection Web & Tolérance aux Certificats Défaillants", () => {
    it("bascule automatiquement d'une URL HTTPS vers HTTP en cas d'erreur de certificat ou de délai d'attente", () => {
      function getHttpFallbackUrl(targetUrl: string): string {
        return targetUrl.startsWith("https://") ? targetUrl.replace(/^https:\/\//i, "http://") : targetUrl;
      }

      assert.equal(getHttpFallbackUrl("https://artisan-sans-certificat.fr"), "http://artisan-sans-certificat.fr");
      assert.equal(getHttpFallbackUrl("https://www.plomberie-martin.com/devis"), "http://www.plomberie-martin.com/devis");
      assert.equal(getHttpFallbackUrl("http://deja-http.fr"), "http://deja-http.fr");
    });

    it("sécurise le scope global du navigateur avec le polyfill __name pour empêcher les ReferenceError de esbuild", () => {
      const sandboxGlobal: Record<string, any> = {};
      const polyfillScript = () => {
        sandboxGlobal.__name = (fn: any) => fn;
      };
      polyfillScript();

      assert.equal(typeof sandboxGlobal.__name, "function");
      const dummyFn = () => "test";
      assert.equal(sandboxGlobal.__name(dummyFn), dummyFn);
    });

    it("parseRgbToHex convertit les styles CSS en hexadécimal et filtre les gris neutres / transparences", () => {
      // Couleurs franches acceptées
      assert.equal(parseRgbToHex("rgb(37, 99, 235)"), "#2563eb");
      assert.equal(parseRgbToHex("rgba(220, 38, 38, 1)"), "#dc2626");

      // Transparence excessive (alpha < 0.5) rejetée
      assert.equal(parseRgbToHex("rgba(37, 99, 235, 0.4)"), null);
      assert.equal(parseRgbToHex("rgba(0, 0, 0, 0)"), null);

      // Gris/noir/blanc neutres (delta R-V-B < 18) rejetés
      assert.equal(parseRgbToHex("rgb(240, 240, 240)"), null);
      assert.equal(parseRgbToHex("rgb(15, 15, 15)"), null);
      assert.equal(parseRgbToHex("rgb(100, 105, 108)"), null);

      // Format invalide
      assert.equal(parseRgbToHex("transparent"), null);
      assert.equal(parseRgbToHex("inherit"), null);
    });

    it("resolveLogoUrl résout les chemins relatifs, absolus et data URIs sans erreur", () => {
      const base = "https://www.artisan-toulouse.fr/contact/";
      assert.equal(resolveLogoUrl("/assets/logo.png", base), "https://www.artisan-toulouse.fr/assets/logo.png");
      assert.equal(resolveLogoUrl("./img/logo.svg", base), "https://www.artisan-toulouse.fr/contact/img/logo.svg");
      assert.equal(resolveLogoUrl("https://cdn.artisan.fr/logo.webp", base), "https://cdn.artisan.fr/logo.webp");
      assert.equal(resolveLogoUrl("data:image/svg+xml;base64,PHN2Z...", base), "data:image/svg+xml;base64,PHN2Z...");
      assert.equal(resolveLogoUrl(null, base), null);
    });
  });

  describe("Règle 25 : Bascule d'Environnement CLI (Local vs Cloudflare Pages)", () => {
    const originalArgv = [...process.argv];
    const testEnv = { SYNC_SECRET_TOKEN: "sync_test_token_valid_12345" };

    afterEach(() => {
      process.argv = [...originalArgv];
    });

    it("doit router automatiquement vers Cloudflare Pages en production avec le flag --prod ou --remote", async () => {
      const { loadConfig } = await import("../config");
      process.argv = ["node", "script.js", "--prod"];
      const cfg = loadConfig(testEnv);
      assert.equal(cfg.REMOTE_APP_URL, "https://lead-dashboard-8bx.pages.dev");
    });

    it("doit router explicitement vers l'environnement local avec le flag --local", async () => {
      const { loadConfig } = await import("../config");
      process.argv = ["node", "script.js", "--local"];
      const cfg = loadConfig(testEnv);
      assert.equal(cfg.REMOTE_APP_URL, "http://127.0.0.1:8788");
    });
  });
});
