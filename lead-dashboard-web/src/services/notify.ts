import type { Bindings } from "../types";

/** Alerte "lead chaud" via Telegram et/ou Discord (au moins un doit être configuré). */
export async function sendHotLeadAlert(env: Bindings, company: string, demoUrl: string): Promise<void> {
  const text = `🔥 Lead chaud : ${company} consulte sa démo\n${demoUrl}`;
  const jobs: Promise<unknown>[] = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    jobs.push(
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
      }),
    );
  }
  if (env.DISCORD_WEBHOOK_URL) {
    jobs.push(
      fetch(env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      }),
    );
  }
  await Promise.allSettled(jobs);
}
