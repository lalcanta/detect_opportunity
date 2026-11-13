import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeSeoHtml } from "../inspector/modules/seoOnPageModule";

const ctx = { activity: "Plombier", city: "Lyon", listingPhone: "04 78 00 00 00" };

describe("analyzeSeoHtml", () => {
  it("repère métier et ville dans le titre, sans tenir compte de la casse ni des accents", () => {
    const r = analyzeSeoHtml("<html><head><title>PLOMBIER à Lyon 3 – Dupont</title></head><body></body></html>", ctx);
    assert.equal(r.title, "PLOMBIER à Lyon 3 – Dupont");
    assert.equal(r.activityInTitleOrH1, true);
    assert.equal(r.cityInTitleOrH1, true);
    const accents = analyzeSeoHtml("<h1>Électricien à Orléans</h1>", { activity: "electricien", city: "Orleans", listingPhone: null });
    assert.equal(accents.h1, "Électricien à Orléans");
    assert.equal(accents.activityInTitleOrH1, true);
    assert.equal(accents.cityInTitleOrH1, true);
  });

  it("lit la description, et détecte le schéma LocalBusiness (type simple, liste, sous-type)", () => {
    const meta = analyzeSeoHtml('<meta name="description" content="Dépannage rapide">', ctx);
    assert.equal(meta.metaDescription, "Dépannage rapide");
    const plumber = analyzeSeoHtml('<script type="application/ld+json">{"@context":"https://schema.org","@type":"Plumber","name":"Dupont"}</script>', ctx);
    assert.equal(plumber.hasLocalBusinessSchema, true);
    const list = analyzeSeoHtml('<script type="application/ld+json">{"@graph":[{"@type":["LocalBusiness"]}]}</script>', ctx);
    assert.equal(list.hasLocalBusinessSchema, true);
    const other = analyzeSeoHtml('<script type="application/ld+json">{"@type":"WebSite"}</script>', ctx);
    assert.equal(other.hasLocalBusinessSchema, false);
  });

  it("compare le lien tel: à la fiche sur les 9 derniers chiffres", () => {
    const r = analyzeSeoHtml('<a href="tel:+33478000000">Appeler</a>', ctx);
    assert.equal(r.hasTelLink, true);
    assert.equal(r.phoneMatchesListing, true);
    const other = analyzeSeoHtml('<a href="tel:+33478111111">Appeler</a>', ctx);
    assert.equal(other.phoneMatchesListing, false);
  });

  it("page vide : tout est null ou faux", () => {
    const r = analyzeSeoHtml("<html><body></body></html>", ctx);
    assert.deepEqual(r, {
      title: null,
      metaDescription: null,
      h1: null,
      hasLocalBusinessSchema: false,
      phones: [],
      hasTelLink: false,
      activityInTitleOrH1: false,
      cityInTitleOrH1: false,
      phoneMatchesListing: null,
    });
  });

  it("phoneMatchesListing est null sans téléphone sur la fiche", () => {
    const r = analyzeSeoHtml('<a href="tel:0478000000">x</a>', { ...ctx, listingPhone: null });
    assert.equal(r.phoneMatchesListing, null);
  });
});
