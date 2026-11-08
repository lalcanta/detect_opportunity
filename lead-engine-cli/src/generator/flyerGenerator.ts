import QRCode from "qrcode";
import type { BrowserContext } from "playwright";
import type { MapsLead } from "../types";
import { escapeHtml } from "../utils/helpers";

/** Flyer A5 prêt à imprimer : logo (ou monogramme) + QR vers le formulaire d'avis Google. */
export async function generateFlyerPdf(
  context: BrowserContext,
  lead: MapsLead,
  logoUrl: string | null,
  brandColor: string,
): Promise<Buffer> {
  const reviewUrl = lead.placeId
    ? `https://search.google.com/local/writereview?placeid=${lead.placeId}`
    : lead.mapsUrl;
  const qr = await QRCode.toDataURL(reviewUrl, { errorCorrectionLevel: "H", margin: 1, width: 640 });
  const initials = lead.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  const name = escapeHtml(lead.name);

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
  @page { size: A5; margin: 0 }
  *{box-sizing:border-box} body{margin:0;width:148mm;height:210mm;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:14mm 12mm;background:linear-gradient(180deg,#fff 0,#fff 60%,${brandColor}14 100%)}
  .bar{position:absolute;top:0;left:0;right:0;height:8mm;background:${brandColor}}
  .logo{width:34mm;height:34mm;border-radius:50%;object-fit:contain;background:#fff;border:1mm solid ${brandColor};display:flex;align-items:center;justify-content:center;font-size:42pt;font-weight:800;color:${brandColor}}
  h1{font-size:25pt;text-align:center;margin:6mm 0 2mm;line-height:1.15} p{font-size:12pt;text-align:center;margin:0;color:#444}
  .stars{font-size:24pt;color:#f5b301;letter-spacing:2mm;margin:4mm 0}
  .qr{width:68mm;height:68mm;padding:3mm;background:#fff;border:1mm solid ${brandColor};border-radius:6mm}
  .cta{font-weight:700;font-size:14pt;color:${brandColor};text-align:center} .small{font-size:9pt;color:#777}
  </style></head><body><div class="bar"></div>
  <div style="text-align:center;margin-top:6mm">
    ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="">` : `<div class="logo" style="margin:auto">${escapeHtml(initials)}</div>`}
    <h1>${name}</h1><p>Votre avis nous aide à continuer à bien faire notre métier.</p>
    <div class="stars">★★★★★</div>
  </div>
  <img class="qr" src="${qr}" alt="QR code avis Google">
  <div><div class="cta">Scannez et laissez-nous un avis Google</div><p class="small" style="margin-top:2mm">Cela ne prend que 30 secondes. Merci !</p></div>
  </body></html>`;

  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle", timeout: 20_000 }).catch(async () => {
      await page.setContent(html, { waitUntil: "load" });
    });
    return await page.pdf({ format: "A5", printBackground: true });
  } finally {
    await page.close().catch(() => undefined);
  }
}
