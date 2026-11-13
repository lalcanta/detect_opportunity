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

  it("ne plante pas sur un lien tel: mal encodé", () => {
    const r = analyzeSeoHtml('<a href="tel:%E0%A4%A">x</a>', ctx);
    assert.equal(r.hasTelLink, true);
  });

  it("ignore un JSON-LD invalide et lit le bloc valide suivant", () => {
    const html = '<script type="application/ld+json">{oups</script><script type="application/ld+json">{"@type":"LocalBusiness"}</script>';
    assert.equal(analyzeSeoHtml(html, ctx).hasLocalBusinessSchema, true);
  });

  it("décode les entités HTML du titre", () => {
    const r = analyzeSeoHtml("<title>Plombier &amp; Fils &#39;Lyon&#39;</title>", ctx);
    assert.equal(r.title, "Plombier & Fils 'Lyon'");
    assert.equal(r.cityInTitleOrH1, true);
  });

  it("décode &amp; en dernier : &amp;lt; reste &lt;", () => {
    assert.equal(analyzeSeoHtml("<title>a &amp;lt; b</title>", ctx).title, "a &lt; b");
  });

  it("prend le premier H1 et retire ses balises", () => {
    const r = analyzeSeoHtml("<h1>Plombier <span>à <b>Lyon</b></span></h1><h1>Autre</h1>", ctx);
    assert.equal(r.h1, "Plombier à Lyon");
  });

  it("dédoublonne les téléphones écrits de deux façons", () => {
    const r = analyzeSeoHtml('<a href="tel:+33478000000">04 78 00 00 00</a>', ctx);
    assert.equal(r.phones.length, 1);
    assert.equal(r.phones[0], "+33478000000");
    assert.equal(r.phoneMatchesListing, true);
  });

  it("lit une description entre apostrophes, attributs inversés", () => {
    const r = analyzeSeoHtml("<meta content='Dépannage 24h' name='description'>", ctx);
    assert.equal(r.metaDescription, "Dépannage 24h");
  });
});

describe("analyzeSeoHtml — métier : catégorie Maps, terme recherché, racines", () => {
  const plomberie = { activity: "Entreprise de plomberie", city: "Lyon", listingPhone: null };
  it("« Entreprise de plomberie » reconnaît « Plombier » (racine d'un mot significatif)", () => {
    assert.equal(analyzeSeoHtml("<title>Plombier à Lyon</title>", plomberie).activityInTitleOrH1, true);
  });
  it("terme recherché (sans la ville) reconnu même si la catégorie diffère", () => {
    const r = analyzeSeoHtml("<h1>Chauffagiste Lyon</h1>", { activity: "Entreprise de chauffage", city: "Lyon", listingPhone: null, searchTerm: "chauffagiste" });
    assert.equal(r.activityInTitleOrH1, true);
  });
  it("sans accents ni casse : « ÉLECTRICITÉ générale » reconnaît « électricien »", () => {
    const r = analyzeSeoHtml("<title>Votre électricien</title>", { activity: "ÉLECTRICITÉ générale", city: "Lyon", listingPhone: null });
    assert.equal(r.activityInTitleOrH1, true);
  });
  it("mot générique de la catégorie (« Entreprise ») ne suffit pas", () => {
    const r = analyzeSeoHtml("<title>Entreprise Dupont</title>", plomberie);
    assert.equal(r.activityInTitleOrH1, false);
  });
  it("la ville présente dans le terme recherché ne vaut pas métier", () => {
    const r = analyzeSeoHtml("<title>Dupont, Toulouse</title>", { activity: "Entreprise de plomberie", city: "Toulouse", listingPhone: null, searchTerm: "plombier Toulouse" });
    assert.equal(r.activityInTitleOrH1, false);
    assert.equal(r.cityInTitleOrH1, true);
  });
  it("métier réellement absent : toujours absent", () => {
    assert.equal(analyzeSeoHtml("<title>Dupont & fils, Lyon</title>", plomberie).activityInTitleOrH1, false);
  });
});
