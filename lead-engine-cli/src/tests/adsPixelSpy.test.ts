import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectPaidAdsInHtml, detectPaidAdsFromHtml } from "../inspector/modules/adsPixelSpyModule";
import { detectTagIdsInHtml } from "../inspector/modules/trackersModule";

const GADS = "Google Ads (Conversion AW-)";

describe("détection Google Ads", () => {
  it("google_conversion_id dans le HTML", () => {
    assert.ok(detectPaidAdsInHtml("<script>var google_conversion_id = 987654321;</script>").includes(GADS));
  });
  it("conversion.js de googleadservices dans le HTML", () => {
    assert.ok(detectPaidAdsInHtml('<script src="https://www.googleadservices.com/pagead/conversion.js"></script>').includes(GADS));
  });
  it("requête viewthroughconversion", () => {
    assert.ok(detectPaidAdsFromHtml("", [], ["https://googleads.g.doubleclick.net/pagead/viewthroughconversion/987654321/?x=1"]).includes(GADS));
  });
  it("requête googleadservices conversion", () => {
    assert.ok(detectPaidAdsFromHtml("", [], ["https://www.googleadservices.com/pagead/conversion/987654321/"]).includes(GADS));
  });
  it("AdSense n'est pas Google Ads", () => {
    assert.ok(!detectPaidAdsInHtml('<script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>').includes(GADS));
  });
  it("Floodlight n'est pas Google Ads", () => {
    assert.ok(!detectPaidAdsFromHtml("", [], ["https://ad.doubleclick.net/ddm/activity/src=1"]).includes(GADS));
  });
  it("google_conversion_id alimente htmlTagIds.googleAds", () => {
    assert.deepEqual(detectTagIdsInHtml("var google_conversion_id = 987654321;").googleAds, ["AW-987654321"]);
  });
});
