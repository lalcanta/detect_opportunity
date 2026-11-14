// wrangler 4 refuse Node < 22 et son message est masqué quand il tourne détaché (tests fonctionnels) : on vérifie avant.
// Usage : `node scripts/require-node22.mjs && wrangler …` ; importable : `import { nodeVersionError }`.
import { fileURLToPath } from 'node:url';

/** Message d'erreur si la version de Node est inférieure à 22, sinon null. */
export function nodeVersionError(version = process.versions.node) {
  if (Number.parseInt(version.split('.')[0], 10) >= 22) return null;
  return `wrangler 4 exige Node 22 (actuel : v${version}). Faire \`nvm use\` à la racine du dépôt.`;
}

/** Arrête le processus (code 1) avec le message si Node est trop ancien. */
export function requireNode22() {
  const erreur = nodeVersionError();
  if (erreur) {
    console.error(erreur);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) requireNode22();
