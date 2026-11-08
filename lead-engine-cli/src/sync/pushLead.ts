import type { SyncPayload } from "../types";
import { log, sleep } from "../utils/helpers";

export async function pushLead(remoteAppUrl: string, token: string, payload: SyncPayload): Promise<void> {
  const endpoint = `${remoteAppUrl}/api/sync`;
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        log("sync", `✔ ${payload.company_name} synchronisé`);
        return;
      }
      lastErr = `HTTP ${res.status} ${await res.text().catch(() => "")}`.slice(0, 200);
      if (res.status >= 400 && res.status < 500) break; // inutile de réessayer
    } catch (err) {
      lastErr = (err as Error).message;
    }
    await sleep(1500 * attempt);
  }
  throw new Error(`Sync échouée pour ${payload.company_name} : ${lastErr}`);
}
