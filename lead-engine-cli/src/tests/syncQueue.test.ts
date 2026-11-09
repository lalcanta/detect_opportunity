import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildQueueBattlecard, pruneManifest } from "../syncQueue";

const APP = "https://app.test";

describe("syncQueue — assemblage battlecard (audit 1.6)", () => {
  const qaMeta = { id: "abc123", company_name: "Agence Pixel", opportunity_type: "audit_qa_trackers" };

  it("doit attendre l'agent tant qu'un lead QA n'a pas de cold email", () => {
    const res = buildQueueBattlecard(qaMeta, { auditSummary: "2 traceurs", objections: [] }, null, APP);
    assert.ok("waiting" in res);
  });

  it("doit pousser un lead QA complet sans textes prévus pour un site web", () => {
    const res = buildQueueBattlecard(
      qaMeta,
      { coldEmail: { subject: "[Dev QA] test", body: "Hello" } },
      { auditSummary: "1 traceur(s) tiers exécuté(s) avant consentement (GA4).", weaknesses: ["GA4 déclenché avant consentement CMP"] },
      APP,
    );
    assert.ok(!("waiting" in res));
    assert.equal(res.battlecard.coldEmail?.subject, "[Dev QA] test");
    assert.equal(res.battlecard.whatsappText, "");
    assert.ok(!res.battlecard.ourAdvantages?.some((a) => /barre d'appel/i.test(a)));
    assert.deepEqual(res.weaknesses, ["GA4 déclenché avant consentement CMP"], "Les constats mesurés doivent être repris");
    assert.match(res.summary, /GA4/);
  });

  it("doit garder les valeurs par défaut site web pour un lead website sans cold email", () => {
    const res = buildQueueBattlecard({ id: "w1", company_name: "Plombier Dupont" }, { openingPitch: "Bonjour" }, null, APP);
    assert.ok(!("waiting" in res));
    assert.equal(res.battlecard.callScript, "Bonjour");
    assert.match(res.battlecard.whatsappText ?? "", /https:\/\/app\.test\/demos\/w1/);
  });
});

describe("syncQueue — purge du manifeste (audit 1.7)", () => {
  it("doit retirer les leads dont le dossier n'est plus dans pending", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lead-queue-"));
    const still = path.join(root, "pending", "still");
    await mkdir(still, { recursive: true });
    const manifest = path.join(root, "pending_manifest.json");
    await writeFile(manifest, JSON.stringify([{ id: "still", dir: still }, { id: "gone", dir: path.join(root, "pending", "gone") }]));

    await pruneManifest(manifest);

    const list = JSON.parse(await readFile(manifest, "utf-8")) as { id: string }[];
    assert.deepEqual(list.map((l) => l.id), ["still"]);
  });
});
