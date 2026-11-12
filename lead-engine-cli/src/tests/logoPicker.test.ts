/** Choix du logo et du site d'un prospect : cas rencontrés en production (novembre 2026). */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyWebsite, ownWebsiteOrNull } from "../collector/websiteClassifier";
import {
  imageDimensions,
  isUsableLogoImage,
  pickLogoCandidate,
  scoreLogoCandidate,
  siteMatchesCompany,
  type LogoCandidate,
} from "../inspector/modules/logoPicker";

const cand = (o: Partial<LogoCandidate>): LogoCandidate => ({
  url: "https://exemple.fr/wp-content/uploads/logo.png",
  w: 180,
  h: 60,
  top: 20,
  naturalW: 360,
  naturalH: 120,
  text: "",
  href: "",
  inHeader: true,
  inFooter: false,
  strong: false,
  linksHome: false,
  isSvg: false,
  ...o,
});

describe("classifyWebsite", () => {
  it("écarte les réseaux sociaux, fautes de frappe comprises", () => {
    assert.equal(classifyWebsite("http://instagra.com/cabanau09/"), "social");
    assert.equal(classifyWebsite("https://www.facebook.com/boulangerie"), "social");
    assert.equal(classifyWebsite("https://linktr.ee/artisan"), "social");
    assert.equal(ownWebsiteOrNull("https://m.facebook.com/x"), null);
  });
  it("écarte les annuaires et plateformes", () => {
    assert.equal(classifyWebsite("https://www.sessile.fr/trouvez-votre-fleuriste/crealine-deco-bloom/"), "listing");
    assert.equal(classifyWebsite("https://www.pagesjaunes.fr/pros/123"), "listing");
  });
  it("garde les vrais sites, y compris les sites Google du prospect", () => {
    assert.equal(classifyWebsite("https://www.beaudic-ferronnerie.com/"), "own");
    assert.equal(classifyWebsite("http://l-escale-gourmande-saint-jean-du-falga.eatbu.com/"), "own");
    assert.equal(classifyWebsite("https://sites.google.com/view/menuisier"), "own");
    assert.equal(classifyWebsite("https://plombier-dupont.business.site/"), "own");
    assert.equal(classifyWebsite(""), "invalid");
  });
});

describe("scoreLogoCandidate / pickLogoCandidate", () => {
  it("écarte l'icône Instagram de l'en-tête", () => {
    const insta = cand({ url: "https://exemple.fr/img/instagram.png", w: 28, h: 28, href: "https://instagram.com/atelier" });
    assert.equal(scoreLogoCandidate(insta), null);
    assert.equal(pickLogoCandidate([insta]), null);
  });
  it("écarte une grande photo (devanture) et les images du pied de page", () => {
    assert.equal(scoreLogoCandidate(cand({ url: "https://exemple.fr/devanture.jpg", w: 1200, h: 500 })), null);
    assert.equal(scoreLogoCandidate(cand({ inFooter: true, inHeader: false, top: 2400 })), null);
  });
  it("écarte un pixel 1×1 et une image de contenu loin du haut de page", () => {
    assert.equal(scoreLogoCandidate(cand({ naturalW: 1, naturalH: 1 })), null);
    assert.equal(scoreLogoCandidate(cand({ url: "https://exemple.fr/chantier.png", inHeader: false, top: 1200 })), null);
  });
  it("préfère le logo du CMS lié à l'accueil à une icône d'en-tête", () => {
    const icon = cand({ url: "https://exemple.fr/phone.png", w: 24, h: 24 });
    const logo = cand({ url: "https://exemple.fr/uploads/marque.png", strong: true, linksHome: true });
    assert.equal(pickLogoCandidate([icon, logo])?.url, logo.url);
  });
  it("garde un logo nommé « logo » hors en-tête mais en haut de page (carrousel BG Forge)", () => {
    const c = cand({ url: "https://www.beaudic-ferronnerie.com/uploads/logo-g-beaudic.webp", inHeader: false, top: 354, w: 170, h: 99 });
    assert.ok((scoreLogoCandidate(c, "BG Forge") ?? 0) >= 20);
  });
  it("sur le site d'une autre entreprise, n'accepte qu'un logo qui porte le nom du prospect", () => {
    const other = cand({ url: "http://histoiredelivre.net/logo-atelier.png", strong: true });
    assert.equal(pickLogoCandidate([other], "Les Pléiades - Espace des Métiers d'Art", false), null);
    const own = cand({ url: "http://histoiredelivre.net/logo-pleiades.png", strong: true });
    assert.equal(pickLogoCandidate([own], "Les Pléiades - Espace des Métiers d'Art", false)?.url, own.url);
  });
});

describe("siteMatchesCompany", () => {
  it("reconnaît le site par le téléphone de la fiche, même sous une autre enseigne", () => {
    assert.ok(siteMatchesCompany("www.beaudic-ferronnerie.com", "Beaudic Ferronnerie", "BG Forge", "contact0561678121", "05 61 67 81 21"));
    assert.ok(!siteMatchesCompany("www.beaudic-ferronnerie.com", "Beaudic Ferronnerie", "BG Forge", "", "05 61 67 81 21"));
  });
  it("reconnaît le site par le nom dans le domaine ou le titre", () => {
    assert.ok(siteMatchesCompany("www.menuiserie-du-sedour.fr", "La Menuiserie du Sédour", "Terres de Fenêtre - Menuiserie du Sedour"));
    assert.ok(!siteMatchesCompany("histoiredelivre.net", "", "Les Pléiades - Espace des Métiers d'Art"));
  });
});

describe("isUsableLogoImage", () => {
  const gif1x1 = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
  it("refuse le GIF transparent 1×1 et une page HTML", () => {
    assert.deepEqual(imageDimensions(gif1x1), { w: 1, h: 1 });
    assert.equal(isUsableLogoImage(gif1x1, "image/gif"), false);
    assert.equal(isUsableLogoImage(Buffer.alloc(5000), "text/html"), false);
  });
  it("accepte une vraie image", () => {
    const png = Buffer.alloc(400);
    png.writeUInt32BE(0x89504e47, 0);
    png.writeUInt32BE(320, 16);
    png.writeUInt32BE(120, 20);
    assert.equal(isUsableLogoImage(png, "image/png"), true);
  });
});
