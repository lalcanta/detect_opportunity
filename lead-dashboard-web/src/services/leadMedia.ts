/**
 * Photos et logo des prospects, copiés dans R2 au lieu d'être liés sur leur site.
 *
 * Une démo qui lie les images du prospect casse si son site change, tombe, refuse le lien direct, ou n'est qu'en
 * `http://` (bloqué sur une démo servie en `https`). Les images listées dans `audit_data` (`site_images`, `logoUrl`)
 * sont copiées dans le bucket `MEDIA` à la synchronisation, puis servies par `/demos/:id/media/:key` ; une image
 * absent du bucket est copiée au premier affichage. La route ne sert que les images listées pour ce lead : ce n'est
 * pas un proxy ouvert. Sans bucket configuré, elle redirige vers l'image d'origine.
 */

/** Taille maximale d'une image copiée. */
export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

export interface MediaSource {
  /** `0`, `1`… pour les photos, `logo` pour le logo. */
  key: string;
  url: string;
}

const isRemoteImageUrl = (u: unknown): u is string => typeof u === "string" && /^https?:\/\//i.test(u) && u.length <= 2048;

/** Images d'un lead à copier : photos du site puis logo (un logo déjà en `data:` reste dans la démo). */
export function mediaSources(auditData: unknown): MediaSource[] {
  const a = (auditData && typeof auditData === "object" ? auditData : {}) as { site_images?: unknown; logoUrl?: unknown };
  const out: MediaSource[] = [];
  if (Array.isArray(a.site_images)) {
    a.site_images.slice(0, 12).forEach((u, i) => {
      if (isRemoteImageUrl(u)) out.push({ key: String(i), url: u });
    });
  }
  if (isRemoteImageUrl(a.logoUrl)) out.push({ key: "logo", url: a.logoUrl });
  return out;
}

export const mediaPath = (leadId: string, key: string): string => `/demos/${leadId}/media/${key}`;
const objectKey = (leadId: string, key: string): string => `leads/${leadId}/${key}`;

/** Remplace dans la démo chaque lien vers une image du prospect par sa copie (brut et échappé en HTML). */
export function rewriteMediaUrls(html: string, leadId: string, sources: MediaSource[]): string {
  // Les plus longues d'abord : une URL préfixe d'une autre ne doit pas la couper.
  let out = html;
  for (const s of [...sources].sort((a, b) => b.url.length - a.url.length)) {
    const target = mediaPath(leadId, s.key);
    out = out.split(s.url).join(target);
    const escaped = s.url.replaceAll("&", "&amp;");
    if (escaped !== s.url) out = out.split(escaped).join(target);
  }
  return out;
}

export interface StoredMedia {
  body: ArrayBuffer;
  contentType: string;
}

/** Télécharge une image (type image/*, taille bornée). `null` si elle est indisponible ou n'en est pas une. */
export async function fetchImage(url: string, fetcher: typeof fetch = fetch): Promise<StoredMedia | null> {
  try {
    const res = await fetcher(url, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!contentType.startsWith("image/")) return null;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MEDIA_MAX_BYTES) return null;
    const body = await res.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > MEDIA_MAX_BYTES) return null;
    return { body, contentType };
  } catch {
    return null;
  }
}

/** Image du bucket, copiée depuis l'origine si elle n'y est pas encore. */
export async function getOrCopyMedia(bucket: R2Bucket, leadId: string, source: MediaSource, fetcher?: typeof fetch): Promise<StoredMedia | null> {
  const existing = await bucket.get(objectKey(leadId, source.key));
  if (existing) return { body: await existing.arrayBuffer(), contentType: existing.httpMetadata?.contentType ?? "application/octet-stream" };
  const fetched = await fetchImage(source.url, fetcher);
  if (!fetched) return null;
  await bucket.put(objectKey(leadId, source.key), fetched.body, {
    httpMetadata: { contentType: fetched.contentType },
    customMetadata: { source: source.url.slice(0, 1024) },
  });
  return fetched;
}

/** Copie toutes les images d'un lead absentes du bucket (à la synchronisation). Renvoie le nombre copié. */
export async function copyLeadMedia(bucket: R2Bucket, leadId: string, auditData: unknown, fetcher?: typeof fetch): Promise<number> {
  let copied = 0;
  for (const s of mediaSources(auditData)) {
    const head = await bucket.head(objectKey(leadId, s.key));
    // Une image remplacée sur le site (nouvelle URL) est recopiée.
    if (head && head.customMetadata?.source === s.url.slice(0, 1024)) continue;
    if (head) await bucket.delete(objectKey(leadId, s.key));
    if (await getOrCopyMedia(bucket, leadId, s, fetcher)) copied++;
  }
  return copied;
}
