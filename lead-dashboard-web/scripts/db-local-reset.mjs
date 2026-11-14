// Recrée la base D1 LOCALE lue par `npm run dev` (schema.sql puis seed.sql, jetons publics : local uniquement).
// Usage : npm run db:local:reset            (arrêter `npm run dev` avant : il garde le fichier ouvert)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const etat = '/tmp/lead-d1-state'; // même dossier que le script `dev` de package.json

// Garde-fous : ce script ne vise jamais la production.
const args = process.argv.slice(2);
if (args.length > 0 || process.env.npm_config_remote) {
  console.error('db:local:reset ne prend aucune option (jamais --remote) : il ne touche que la base locale.');
  process.exit(1);
}

const dossierD1 = join(etat, 'v3', 'd1', 'miniflare-D1DatabaseObject');
if (existsSync(dossierD1)) {
  for (const f of readdirSync(dossierD1)) rmSync(join(dossierD1, f), { force: true });
}

for (const fichier of ['schema.sql', 'seed.sql']) {
  console.log(`> ${fichier}`);
  execFileSync(
    join(racine, 'node_modules', '.bin', 'wrangler'),
    ['d1', 'execute', 'DB', '--local', '--config=wrangler.local.toml', `--persist-to=${etat}`, `--file=${fichier}`],
    { cwd: racine, stdio: 'inherit' },
  );
}
console.log(`Base locale prête dans ${etat} : lance \`npm run dev:web\` à la racine.`);
