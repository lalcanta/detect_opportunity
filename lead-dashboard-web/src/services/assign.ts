import { opportunityIdOf } from "../../../shared/opportunities";
import { parseAllowedChannels, parseAllowedOpportunities, type OpportunityTypeId } from "../types";
import { isChannelId } from "../../../shared/opportunities";

/** Répartit les leads non assignés entre les closers actifs qualifiés (opportunité activée et canal principal traité). */
export async function assignRoundRobin(db: D1Database): Promise<number> {
  const closers = await db
    .prepare(
      `SELECT u.id, u.allowed_opportunities, u.allowed_channels, COUNT(l.id) AS n FROM users u
       LEFT JOIN leads l ON l.assigned_to = u.id AND l.status IN ('demo_ready','hot_lead','callback_scheduled')
       WHERE u.role = 'closer' AND u.is_active = 1 GROUP BY u.id, u.allowed_opportunities, u.allowed_channels`,
    )
    .all<{ id: string; allowed_opportunities: string | null; allowed_channels: string | null; n: number }>();

  if (closers.results.length === 0) return 0;

  const closerMeta = closers.results.map((c) => ({
    id: c.id,
    allowed: parseAllowedOpportunities(c.allowed_opportunities),
    channels: parseAllowedChannels(c.allowed_channels),
    load: c.n,
  }));

  const leads = await db
    .prepare("SELECT id, opportunity_type, primary_channel FROM leads WHERE assigned_to IS NULL AND status NOT IN ('pending_generation','unqualified') ORDER BY created_at")
    .all<{ id: string; opportunity_type: string | null; primary_channel: string | null }>();

  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];

  for (const lead of leads.results) {
    const oppType = opportunityIdOf(lead.opportunity_type) as OpportunityTypeId;
    // Trouver les closers qualifiés pour ce type d'opportunité précis
    // Lead antérieur à la phase 1 (sans canal) : seul le type d'opportunité compte.
    const channel = isChannelId(lead.primary_channel) ? lead.primary_channel : null;
    const eligible = closerMeta.filter((c) => c.allowed.includes(oppType) && (!channel || c.channels.includes(channel)));
    if (eligible.length === 0) continue; // Reste non assigné tant qu'aucun closer n'est activé pour ce besoin

    // Choisir le closer le moins chargé parmi les qualifiés
    eligible.sort((a, b) => a.load - b.load);
    const pick = eligible[0]!;
    pick.load += 1;
    stmts.push(db.prepare("UPDATE leads SET assigned_to = ?, assigned_at = ? WHERE id = ?").bind(pick.id, now, lead.id));
  }

  if (stmts.length) await db.batch(stmts);
  return stmts.length;
}
