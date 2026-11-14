import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isScheduleDue, scheduleDecision } from "../worker";

const sched = (over: Record<string, unknown> = {}) => ({
  id: 1,
  label: "Plombiers Lyon",
  time_of_day: "08:30",
  days_of_week: "1,2,3,4,5",
  query: "plombier",
  city: "Lyon",
  last_run_at: null as string | null,
  ...over,
});

// 2026-11-12 est un jeudi ; en novembre Paris est en UTC+1 (CET).
describe("isScheduleDue (heure de Paris)", () => {
  it("08:30 prévu, 09:00 à Paris : dû", () => {
    assert.equal(isScheduleDue(sched(), new Date("2026-11-12T08:00:00Z")), true);
  });
  it("avant l'heure prévue : pas dû", () => {
    assert.equal(scheduleDecision(sched(), new Date("2026-11-12T07:00:00Z")), "too_early"); // 08:00 Paris
  });
  it("23:00 à Paris : fenêtre de 2 h dépassée, pas dû", () => {
    assert.equal(scheduleDecision(sched(), new Date("2026-11-12T22:00:00Z")), "window_missed");
  });
  it("bornes de la fenêtre : 10:29 dû, 10:30 sauté", () => {
    assert.equal(isScheduleDue(sched(), new Date("2026-11-12T09:29:00Z")), true);
    assert.equal(isScheduleDue(sched(), new Date("2026-11-12T09:30:00Z")), false);
  });
  it("déjà lancé aujourd'hui : pas dû", () => {
    assert.equal(isScheduleDue(sched({ last_run_at: "2026-11-12T07:31:00.000Z" }), new Date("2026-11-12T08:00:00Z")), false);
  });
  it("lancé hier : dû", () => {
    assert.equal(isScheduleDue(sched({ last_run_at: "2026-11-11T07:31:00.000Z" }), new Date("2026-11-12T08:00:00Z")), true);
  });
  it("un lancement à 00:30 Paris (23:30 UTC la veille) compte pour le jour de Paris", () => {
    const s = sched({ time_of_day: "00:10", last_run_at: "2026-11-11T23:30:00.000Z" });
    assert.equal(scheduleDecision(s, new Date("2026-11-12T00:40:00Z")), "already_ran"); // 01:40 Paris, même jour
  });
  it("lit aussi l'ancien format D1 sans fuseau (UTC)", () => {
    assert.equal(isScheduleDue(sched({ last_run_at: "2026-11-12 07:31:00" }), new Date("2026-11-12T08:00:00Z")), false);
  });
  it("jour non coché : pas dû (samedi 14/11)", () => {
    assert.equal(scheduleDecision(sched(), new Date("2026-11-14T08:00:00Z")), "wrong_day");
  });
  it("le jour s'évalue à Paris : dimanche 23:30 UTC est déjà lundi", () => {
    const s = sched({ time_of_day: "00:10" });
    assert.equal(isScheduleDue(s, new Date("2026-11-15T23:30:00Z")), true); // lundi 16 à 00:30 Paris
  });
  it("« * » = tous les jours, dimanche compris", () => {
    assert.equal(isScheduleDue(sched({ days_of_week: "*" }), new Date("2026-11-15T08:00:00Z")), true);
    assert.equal(isScheduleDue(sched({ days_of_week: "7" }), new Date("2026-11-15T08:00:00Z")), true);
  });
  it("changement d'heure de fin octobre : 08:30 reste 08:30 à Paris", () => {
    // Samedi 24/10 (CEST, UTC+2) : 08:30 Paris = 06:30Z. Lundi 26/10 (CET, UTC+1) : 08:30 Paris = 07:30Z.
    const s = sched({ days_of_week: "*" });
    assert.equal(isScheduleDue(s, new Date("2026-10-24T06:30:00Z")), true);
    assert.equal(scheduleDecision(s, new Date("2026-10-24T05:30:00Z")), "too_early");
    assert.equal(isScheduleDue(s, new Date("2026-10-26T07:30:00Z")), true);
    assert.equal(scheduleDecision(s, new Date("2026-10-26T06:30:00Z")), "too_early"); // 07:30 Paris
    assert.equal(scheduleDecision(s, new Date("2026-10-26T09:30:00Z")), "window_missed"); // 10:30 Paris
  });
});
