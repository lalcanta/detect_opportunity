# Design System & Architecture Visuelle — LeadEngine PRO & Alcantara Studio

Ce document constitue la référence du Design System appliqué à l'ensemble des interfaces du projet :
- **CRM & Pipeline Closer** ([`lead-dashboard-web/src/views/closer.ts`](file:///Users/loicalcantara/Workspace/Business/detect_opportunity/lead-dashboard-web/src/views/closer.ts))
- **Administration & Scanner** ([`lead-dashboard-web/src/views/admin.ts`](file:///Users/loicalcantara/Workspace/Business/detect_opportunity/lead-dashboard-web/src/views/admin.ts))
- **Authentification Whitelist & Invitations** ([`lead-dashboard-web/src/views/login.ts`](file:///Users/loicalcantara/Workspace/Business/detect_opportunity/lead-dashboard-web/src/views/login.ts))
- **Layout Global & Icônes SVG** ([`lead-dashboard-web/src/views/layout.ts`](file:///Users/loicalcantara/Workspace/Business/detect_opportunity/lead-dashboard-web/src/views/layout.ts))
- **Landing Page Publique Dissociée (3 Offres & Lead Volontaire)** ([`agency-landing-web/index.html`](file:///Users/loicalcantara/Workspace/Business/detect_opportunity/agency-landing-web/index.html) & [`lead-dashboard-web/src/views/landing.ts`](file:///Users/loicalcantara/Workspace/Business/detect_opportunity/lead-dashboard-web/src/views/landing.ts))

---

## 1. Moteur CSS & Typographie

- **Tailwind CSS v3 CDN** : `<script src="https://cdn.tailwindcss.com"></script>`
  - **Règle d'or de compatibilité** : Toujours utiliser les classes Tailwind v3 standard (`shadow-sm`, `shadow`, `shadow-md`, `shadow-xl`, `shadow-2xl`, `py-0.5`, `px-1.5`). Ne **jamais** utiliser de classes Tailwind v4 (`shadow-xs`, `shadow-2xs`) ni de valeurs fractionnaires non déclarées (`py-0.2`).
- **Typographie (`Google Fonts`)** :
  - **Corps & Titres (`font-sans`)** : `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` (`400`, `500`, `600`, `700`, `800`).
  - **Code, Métriques & Identifiants (`font-mono`)** : `'JetBrains Mono', monospace` (`400`, `500`, `600`).

---

## 2. Surfaces & Conteneurs

| Surface | Classes Tailwind | Usage |
|---|---|---|
| **Fond Application (Clair)** | `bg-zinc-100/80 text-zinc-900 min-h-screen antialiased` | Pipeline Closer (`/`), Administration (`/admin`) |
| **Fond Sombre (Dark Mode)** | `bg-zinc-950 text-zinc-100 min-h-screen antialiased` | Connexion (`/login`), Activation (`/invite/:code`), Landing Agence (`/landing`), Rapport QA |
| **Topbar Globale** | `bg-zinc-950 text-white sticky top-0 z-30 border-b border-zinc-800/80 shadow-sm` | Barre de navigation principale (`max-w-7xl mx-auto px-3 sm:px-6 py-2`) |
| **Sous-barre Sticky** | `bg-white border-b border-zinc-200/80 px-4 sm:px-6 py-2.5 shadow-sm sticky top-[49px] z-20` | Navigation secondaire Admin & Filtres Closer (`max-w-7xl mx-auto`) |
| **Carte Standard (Clair)** | `bg-white rounded-2xl shadow-sm border border-zinc-200/80 p-5` | Blocs KPIs, sections Admin, sections Ma Journée |
| **Carte Kanban** | `bg-white rounded-xl shadow-sm border border-zinc-200/80 p-3.5 hover:shadow-md hover:border-zinc-300` | Fiche prospect dans les colonnes Kanban |

---

## 3. Tokens Sémantiques (Statuts & Opportunités)

### Statuts du Cycle Commercial (`LeadStatus`)
- **`hot_lead` (🔥 Lead Chaud)** : `bg-rose-50 text-rose-700 border-rose-200` · Accent colonne `border-t-2 border-rose-500`
- **`demo_ready` (📥 À contacter)** : `bg-indigo-50 text-indigo-700 border-indigo-200` · Accent colonne `border-t-2 border-indigo-500`
- **`called` (📞 En cours / Appelé)** : `bg-amber-50 text-amber-800 border-amber-200` · Accent colonne `border-t-2 border-amber-500`
- **`callback_scheduled` (📅 Relance prévue)** : `bg-purple-50 text-purple-800 border-purple-200` · Accent colonne `border-t-2 border-purple-500`
- **`won` (🏆 Gagné)** : `bg-emerald-50 text-emerald-700 border-emerald-200` · Accent colonne `border-t-2 border-emerald-500`
- **`lost` (✕ Perdu)** : `bg-zinc-100 text-zinc-600 border-zinc-200` · Accent colonne `border-t-2 border-zinc-400`

### Badges d'Opportunités (`OPP_META`)
- `website` (`🌐 Site Web`) : `bg-blue-50 text-blue-700 border-blue-200`
- `audit_qa_trackers` (`🛡️ Audit QA Traceurs`) : `bg-cyan-50 text-cyan-800 border-cyan-200`
- `google_reviews` (`⭐ Avis Google`) : `bg-amber-50 text-amber-700 border-amber-200`
- `seo_local` (`📍 SEO Local`) : `bg-emerald-50 text-emerald-700 border-emerald-200`
- `ads_acquisition` (`⚡ Ads`) : `bg-purple-50 text-purple-700 border-purple-200`
- `custom` (`🎯 Sur-Mesure`) : `bg-zinc-100 text-zinc-700 border-zinc-200`

---

## 6. Composants UI Réutilisables (`lead-dashboard-web/src/views/components.ts`)

Pour éviter toute divergence entre le rendu serveur (SSR), les différentes cartes (`backlogCard`, `calendarCard`, `admin.ts`) et les mises à jour DOM côté client (Sidepanel), tous les composants partagés sont centralisés dans [`components.ts`](file:///Users/loicalcantara/Workspace/Business/detect_opportunity/lead-dashboard-web/src/views/components.ts) :

- **`getDemoAccessState(lead)`** : Source unique de vérité calculant l'état d'accès à la démo (`isRevoked`, `isExpired`, `canOpenDemo`, `canRevoke`, libellés des badges et boutons).
- **`renderCardDemoSlot(lead, variant)`** & **`renderClientDemoSlotHelperScript()`** : Rendu unifié de l'emplacement Démo (`compact` sur Kanban/Liste, `button` sur Ma Journée & Agenda) partagé entre SSR et JavaScript client (`data-card-demo-slot` + `data-demo-variant`).
- **`LEAD_COLUMNS` / `renderStatusPill(status)` / `formatStatusLabel(status)`** : Définition unique des 6 colonnes du cycle commercial et de leurs badges (utilisée à la fois dans `closer.ts` et `admin.ts`).
- **`OPP_META` / `renderOpportunityBadge(opportunityType)`** : Badge d'opportunité unifié.
- **`renderGoogleRatingBadge(rating, count)` & `renderAuditScoreBadge(score, websiteUrl)`** : Badges de signaux Google Maps et score d'audit technique.

