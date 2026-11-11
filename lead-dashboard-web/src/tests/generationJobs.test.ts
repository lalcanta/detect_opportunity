import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jobModeBadge } from "../views/jobMode";
import { adminPage } from "../views/admin";
import type { User } from "../types";
import type { ScanJob } from "../routes/scans";

const admin: User = { id: "u", name: "Admin", email: "a@b.c", role: "admin", phone_quota_weekly: 100, access_token: "t", is_active: 1 };

describe("mode des jobs", () => {
  it("distingue demandé, forcé par le coupe-circuit, et génération API", () => {
    assert.match(jobModeBadge({ execution_mode: "full_auto", effective_mode: null }), /Full Auto/);
    assert.match(jobModeBadge({ execution_mode: "full_auto", effective_mode: "full_auto" }), /Full Auto/);
    assert.match(jobModeBadge({ execution_mode: "full_auto", effective_mode: "prep_only" }), /forcé/);
    assert.match(jobModeBadge({ execution_mode: "prep_only", effective_mode: "prep_only" }), /CLI 0€/);
    assert.doesNotMatch(jobModeBadge({ execution_mode: "prep_only", effective_mode: "prep_only" }), /forcé/);
    assert.match(jobModeBadge({ job_type: "generate", execution_mode: "full_auto" }), /Génération API/);
  });
});

describe("file d'attente : génération via l'API", () => {
  const lead = (id: string) =>
    ({ id, company_name: `Lead ${id}`, status: "pending_generation", activity: "Couvreur", city: "Foix" }) as never;
  const job = (ids: string[], status: ScanJob["status"]): ScanJob =>
    ({ id: 9, query: "Génération API", city: "", lead_limit: ids.length, use_cdp: 0, status, job_type: "generate", lead_ids: JSON.stringify(ids), created_at: "", started_at: null, finished_at: null, processed: 0, total: 0, message: null }) as ScanJob;
  const render = (scans: ScanJob[]) =>
    adminPage({ user: admin, leads: [lead("aaa"), lead("bbb")], users: [admin], stats: { total: 0, won: 0, byStatus: [], tokens: [] } as never, scans, models: [], availableModels: [], tab: "pending" } as never);

  it("propose un bouton par lead et un bouton global", () => {
    const html = render([]);
    assert.match(html, /data-gen-id="aaa"/);
    assert.match(html, /data-gen-id="bbb"/);
    assert.match(html, /Tout générer via l'API \(2\)/);
  });

  it("n'en propose plus pour un lead déjà confié à un job en cours", () => {
    const html = render([job(["aaa"], "running")]);
    assert.doesNotMatch(html, /data-gen-id="aaa"/);
    assert.match(html, /data-gen-id="bbb"/);
    assert.match(html, /Tout générer via l'API \(1\)/);
    assert.match(html, /API en cours/);
  });

  it("un job terminé libère le lead", () => {
    assert.match(render([job(["aaa"], "done")]), /data-gen-id="aaa"/);
  });
});
