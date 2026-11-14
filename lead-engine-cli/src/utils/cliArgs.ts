/**
 * Validation des options de ligne de commande : une option inconnue ou mal orthographiée arrête la commande
 * avant toute action (au lieu d'être ignorée en silence et de lancer un scan sur le mauvais besoin).
 */

export interface CliOptionSpec {
  /** Options sans valeur, écrites avec leurs tirets (`--cdp`, `-h`). */
  flags?: string[];
  /** Options suivies d'une valeur (`--query`, `-q`). La valeur peut elle-même commencer par un tiret. */
  values?: string[];
}

/** Options lues par `config.ts` (via `process.argv`) : valides pour toutes les commandes. */
export const CONFIG_FLAGS = ["--prod", "--remote", "--local"];

const HELP_FLAGS = ["--help", "-h"];

function normalize(name: string): string {
  return name.replace(/^-+/, "").toLowerCase().replace(/_/g, "-");
}

function editDistance(a: string, b: string): number {
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

/** Option valide la plus proche de `unknown`, ou null : même mot à `_`/`-` près, préfixe, ou distance ≤ 2. */
export function suggestOption(unknown: string, valid: string[]): string | null {
  const wanted = normalize(unknown);
  const candidates = valid.filter((v) => v.startsWith("--"));
  const same = candidates.find((v) => normalize(v) === wanted);
  if (same) return same;
  // `--opportunity_type` -> `--opportunity` : une option valide est le début de ce qui a été tapé (ou l'inverse).
  const prefixed = candidates
    .filter((v) => wanted.startsWith(`${normalize(v)}-`) || normalize(v).startsWith(`${wanted}-`))
    .sort((a, b) => b.length - a.length)[0];
  if (prefixed) return prefixed;
  let best: { name: string; dist: number } | null = null;
  for (const v of candidates) {
    const dist = editDistance(wanted, normalize(v));
    if (dist <= 2 && (!best || dist < best.dist)) best = { name: v, dist };
  }
  return best?.name ?? null;
}

/** Retourne le message d'erreur de la première option inconnue de `args`, ou null si tout est valide. */
export function findUnknownOption(args: string[], spec: CliOptionSpec): string | null {
  const values = new Set(spec.values ?? []);
  const flags = new Set([...(spec.flags ?? []), ...CONFIG_FLAGS, ...HELP_FLAGS]);
  const valid = [...values, ...flags];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--") break;
    if (!arg.startsWith("-") || arg === "-") continue;
    const name = arg.includes("=") && arg.startsWith("--") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (values.has(name)) {
      // La valeur suit l'option, même si elle commence par un tiret (`--lat -1.5`).
      if (name === arg) i++;
      continue;
    }
    if (flags.has(name)) continue;
    const hint = suggestOption(name, valid);
    return `Option inconnue : ${name}. Options valides : ${valid.join(", ")}.${hint ? ` Vouliez-vous dire ${hint} ?` : ""}`;
  }
  return null;
}

/**
 * À appeler en tout début de commande. Option inconnue : message sur stderr et code de sortie 1 ;
 * `--help` / `-h` : affiche les options valides (et `usage` s'il est fourni) et sort avec 0, sans rien lancer.
 */
export function assertKnownOptions(spec: CliOptionSpec, usage?: string, args: string[] = process.argv.slice(2)): void {
  const error = findUnknownOption(args, spec);
  if (error) {
    console.error(error);
    process.exit(1);
  }
  const values = new Set(spec.values ?? []);
  // `--help` n'est une demande d'aide que s'il n'est pas la valeur d'une autre option.
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (values.has(arg)) {
      i++;
      continue;
    }
    if (HELP_FLAGS.includes(arg)) {
      const all = [...values, ...(spec.flags ?? []), ...CONFIG_FLAGS, ...HELP_FLAGS];
      if (usage) console.log(`${usage}\n`);
      console.log(`Options valides : ${all.join(", ")}`);
      process.exit(0);
    }
  }
}
