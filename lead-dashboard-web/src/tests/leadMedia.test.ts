/** Photos des prospects copiées dans R2 : sources, réécriture de la démo, téléchargement borné et copie. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { copyLeadMedia, fetchImage, getOrCopyMedia, mediaSources, rewriteMediaUrls, MEDIA_MAX_BYTES } from "../services/leadMedia";

const AUDIT = {
  site_images: ["https://plombier.test/img/a.jpg?w=800&h=600", "http://plombier.test/img/b.png", "data:image/png;base64,xx", 42],
  logoUrl: "https://plombier.test/logo.svg",
};

/** Bucket R2 minimal en mémoire. */
function memoryBucket() {
  const store = new Map<string, { body: ArrayBuffer; contentType?: string; source?: string }>();
  const bucket = {
    store,
    async get(key: string) {
      const o = store.get(key);
      return o ? { arrayBuffer: async () => o.body, httpMetadata: { contentType: o.contentType } } : null;
    },
    async head(key: string) {
      const o = store.get(key);
      return o ? { customMetadata: { source: o.source } } : null;
    },
    async put(key: string, body: ArrayBuffer, opts: { httpMetadata?: { contentType?: string }; customMetadata?: { source?: string } }) {
      store.set(key, { body, contentType: opts.httpMetadata?.contentType, source: opts.customMetadata?.source });
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
  return bucket as typeof bucket & R2Bucket;
}

const imageFetch = (calls: string[] = [], type = "image/jpeg", size = 10): typeof fetch =>
  (async (url: string) => {
    calls.push(String(url));
    return new Response(new Uint8Array(size), { status: 200, headers: { "content-type": type } });
  }) as unknown as typeof fetch;

describe("photos des prospects", () => {
  it("ne retient que les photos et le logo distants", () => {
    assert.deepEqual(mediaSources(AUDIT), [
      { key: "0", url: AUDIT.site_images[0] },
      { key: "1", url: AUDIT.site_images[1] },
      { key: "logo", url: AUDIT.logoUrl },
    ]);
    assert.deepEqual(mediaSources({ logoUrl: "data:image/png;base64,xx" }), []);
    assert.deepEqual(mediaSources(null), []);
  });

  it("réécrit les liens bruts et échappés de la démo", () => {
    const html = `<img src="https://plombier.test/img/a.jpg?w=800&amp;h=600"><img src='http://plombier.test/img/b.png'><img src="https://plombier.test/logo.svg">`;
    const out = rewriteMediaUrls(html, "abcd1234", mediaSources(AUDIT));
    assert.equal(out, `<img src="/demos/abcd1234/media/0"><img src='/demos/abcd1234/media/1'><img src="/demos/abcd1234/media/logo">`);
  });

  it("refuse ce qui n'est pas une image ou dépasse la taille maximale", async () => {
    assert.equal(await fetchImage("https://x.test/a", imageFetch([], "text/html")), null);
    assert.equal(await fetchImage("https://x.test/a", imageFetch([], "image/png", MEDIA_MAX_BYTES + 1)), null);
    const ok = await fetchImage("https://x.test/a", imageFetch([], "image/png; charset=binary"));
    assert.equal(ok?.contentType, "image/png");
  });

  it("copie une seule fois, puis recopie si l'image change d'adresse", async () => {
    const bucket = memoryBucket();
    const calls: string[] = [];
    assert.equal(await copyLeadMedia(bucket, "abcd1234", AUDIT, imageFetch(calls)), 3);
    assert.equal(await copyLeadMedia(bucket, "abcd1234", AUDIT, imageFetch(calls)), 0);
    assert.equal(calls.length, 3);
    const moved = { ...AUDIT, logoUrl: "https://plombier.test/logo-2024.svg" };
    assert.equal(await copyLeadMedia(bucket, "abcd1234", moved, imageFetch(calls)), 1);
    assert.equal(bucket.store.get("leads/abcd1234/logo")?.source, moved.logoUrl);
  });

  it("sert la copie sans retélécharger", async () => {
    const bucket = memoryBucket();
    const calls: string[] = [];
    const src = mediaSources(AUDIT)[0]!;
    await getOrCopyMedia(bucket, "abcd1234", src, imageFetch(calls));
    const again = await getOrCopyMedia(bucket, "abcd1234", src, imageFetch(calls));
    assert.equal(calls.length, 1);
    assert.equal(again?.contentType, "image/jpeg");
  });
});
