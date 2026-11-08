# lead-engine-cli

Moteur local (Mac) : scraping Google Maps → audit → démo Tailwind → flyer PDF → battlecard → push vers `lead-dashboard-web`.

## Installation
```bash
npm install            # installe aussi Chromium pour Playwright
cp .env.example .env   # renseigner les clés Gemini, REMOTE_APP_URL, SYNC_SECRET_TOKEN
npm run typecheck
```

## Mode Headless (nocturne)
```bash
npm run scan -- --query "plombier" --city "Lyon" --limit 20
```
Si un captcha apparaît, la fiche est abandonnée : relancez en mode CDP.

## Mode CDP (visible, captcha manuel)
1. Fermez complètement Chrome (Cmd+Q), puis lancez-le avec le port de débogage et un profil dédié (obligatoire depuis Chrome 136) :
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-cdp-profile"
```
2. Vérifiez : `curl http://localhost:9222/json/version`
3. Lancez :
```bash
npm run scan -- --query "électricien" --city "Marseille" --limit 10 --cdp
```
En cas de captcha, résolvez-le dans la fenêtre : le script reprend automatiquement (5 min max).

## Test sans cloud
`--dry-run` écrit `demo.html`, `flyer.pdf` et `lead.json` dans `./output/<id>/` (aucune suppression de fichier n'est jamais effectuée).

## Notes
- Les sélecteurs Google Maps (`.hfpxzc`, `.DUwDvf`, `.jftiEf`…) changent périodiquement : à ajuster dans `src/collector/mapsScraper.ts`.
- Routeur LLM : cooldown de 60 s par (clé, modèle) sur 429/503, round-robin entre les 2 clés, fallback Pro → Flash.
