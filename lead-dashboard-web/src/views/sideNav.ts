/**
 * Menu latéral commun au pipeline et à l'administration : entrées regroupées en accordéons, réductible en barre
 * d'icônes (choix retenu dans le navigateur, le même pour les deux pages), et tiroir sur mobile. Rendu côté serveur ;
 * le script ne fait que plier, déplier et retenir.
 */
import { esc, icon, type IconName } from "./layout";

export type NavBadgeTone = "info" | "warn" | "danger" | "ok";

export interface SideNavItem {
  href: string;
  icon: IconName;
  label: string;
  badge?: { text: string; tone: NavBadgeTone; pulse?: boolean };
  /** Entrée de la page affichée. */
  active?: boolean;
  /** Filtre plutôt que page : sélection affichée en plus léger. */
  filter?: boolean;
}

export interface SideNavGroup {
  id: string;
  label: string;
  icon: IconName;
  items: SideNavItem[];
}

const TONES: Record<NavBadgeTone, string> = {
  info: "bg-cyan-500",
  warn: "bg-amber-500",
  danger: "bg-rose-500",
  ok: "bg-emerald-500",
};

/** Libellés des entrées actives (barre mobile). */
export function activeNavLabel(groups: SideNavGroup[], fallback: string): string {
  const labels = groups.flatMap((g) => g.items.filter((i) => i.active).map((i) => i.label));
  return labels.length ? labels.join(" · ") : fallback;
}

function itemHtml(item: SideNavItem): string {
  const on = Boolean(item.active);
  const b = item.badge;
  const look = on
    ? item.filter
      ? { row: "bg-indigo-50 text-indigo-800", icon: "text-indigo-500" }
      : { row: "bg-zinc-900 text-white", icon: "text-indigo-300" }
    : { row: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900", icon: "text-zinc-400 group-hover:text-zinc-600" };
  return `<a href="${esc(item.href)}" title="${esc(item.label)}"${on ? ' aria-current="page"' : ""}
     class="sn-item group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors ${
       look.row
     }">
    <span class="relative shrink-0">${icon(item.icon, `w-4 h-4 ${look.icon}`)}${
      b ? `<span class="sn-dot absolute -top-1 -right-1 w-2 h-2 rounded-full ring-2 ring-white ${TONES[b.tone]}"></span>` : ""
    }</span>
    <span class="sn-label min-w-0 flex-1 truncate">${esc(item.label)}</span>
    ${b ? `<span class="sn-label shrink-0 px-1.5 py-0.5 rounded-full text-[10px] leading-none font-extrabold text-white ${TONES[b.tone]}${b.pulse ? " animate-pulse" : ""}">${esc(b.text)}</span>` : ""}
  </a>`;
}

function groupHtml(group: SideNavGroup): string {
  const hasActive = group.items.some((i) => i.active);
  const panelId = `sn-panel-${group.id}`;
  const alert = group.items.find((i) => i.badge && i.badge.tone !== "ok")?.badge;
  return `<div class="sn-group" data-group="${esc(group.id)}"${hasActive ? ' data-active="1"' : ""}>
    <button type="button" class="sn-group-head w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-extrabold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors"
      aria-expanded="${hasActive ? "true" : "false"}" aria-controls="${panelId}">
      ${icon(group.icon, "w-3.5 h-3.5 shrink-0 text-zinc-400")}
      <span class="flex-1 text-left truncate">${esc(group.label)}</span>
      ${alert ? `<span class="sn-head-dot w-1.5 h-1.5 rounded-full ${TONES[alert.tone]}"></span>` : ""}
      ${icon("chevron-down", "sn-chevron w-3.5 h-3.5 shrink-0 text-zinc-400 transition-transform")}
    </button>
    <div id="${panelId}" class="sn-panel space-y-0.5 pt-0.5 pb-1.5"${hasActive ? "" : " hidden"}>
      ${group.items.map(itemHtml).join("")}
    </div>
  </div>`;
}

/** Feuille de style du menu (états réduit et tiroir mobile, indépendants de Tailwind). */
const STYLE = `<style>
  #sn-nav { width: 252px; transition: width .18s ease, transform .2s ease; }
  #sn-nav .sn-dot { display: none; }
  #sn-nav .sn-group-head[aria-expanded="true"] .sn-chevron { transform: rotate(180deg); }
  #sn-nav .sn-group-head[aria-expanded="true"] .sn-head-dot { display: none; }
  @media (min-width: 768px) {
    .sn-collapsed #sn-nav { width: 60px; }
    .sn-collapsed #sn-nav .sn-label,
    .sn-collapsed #sn-nav .sn-group-head,
    .sn-collapsed #sn-nav .sn-title { display: none; }
    .sn-collapsed #sn-nav .sn-panel { display: block !important; border-top: 1px solid #e4e4e7; padding-top: 6px; margin-top: 2px; }
    .sn-collapsed #sn-nav .sn-group:first-of-type .sn-panel { border-top: 0; }
    .sn-collapsed #sn-nav .sn-item { justify-content: center; padding-left: 0; padding-right: 0; }
    .sn-collapsed #sn-nav .sn-dot { display: block; }
    .sn-collapsed #sn-nav .sn-toggle-icon { transform: scaleX(-1); }
    .sn-collapsed #sn-nav .sn-head { justify-content: center; }
  }
  @media (max-width: 767px) {
    #sn-nav { position: fixed; top: 0; bottom: 0; left: 0; z-index: 50; height: 100vh !important; transform: translateX(-100%); box-shadow: 0 10px 40px rgba(0,0,0,.18); }
    .sn-drawer-open #sn-nav { transform: translateX(0); }
    .sn-drawer-open #sn-backdrop { display: block; }
    #sn-nav .sn-collapse-btn { display: none; }
  }
</style>`;

/** Restaure l'état retenu (menu réduit, groupes ouverts) juste après le menu, avant le contenu : pas de saut. */
const INIT = `<script>
(function () {
  var shell = document.getElementById('sn-shell');
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  if (load('nav.collapsed') === '1') shell.classList.add('sn-collapsed');
  var open = null;
  try { open = JSON.parse(load(shell.dataset.openKey) || 'null'); } catch (e) { open = null; }
  if (!Array.isArray(open)) return;
  shell.querySelectorAll('.sn-group').forEach(function (g) {
    // Le groupe de la page affichée reste ouvert ; les autres suivent le dernier choix.
    var on = g.dataset.active === '1' || open.indexOf(g.dataset.group) !== -1;
    g.querySelector('.sn-group-head').setAttribute('aria-expanded', on ? 'true' : 'false');
    var panel = g.querySelector('.sn-panel');
    if (on) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
  });
})();
</script>`;

/** Pliage, réduction et tiroir mobile. */
const SCRIPT = `<script>
(function () {
  var shell = document.getElementById('sn-shell');
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var groups = shell.querySelectorAll('.sn-group');
  function setOpen(g, on) {
    var head = g.querySelector('.sn-group-head'), panel = g.querySelector('.sn-panel');
    head.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
  }
  groups.forEach(function (g) {
    g.querySelector('.sn-group-head').addEventListener('click', function () {
      setOpen(g, this.getAttribute('aria-expanded') !== 'true');
      var ids = [];
      groups.forEach(function (x) { if (x.querySelector('.sn-group-head').getAttribute('aria-expanded') === 'true') ids.push(x.dataset.group); });
      save(shell.dataset.openKey, JSON.stringify(ids));
    });
  });
  var btn = document.getElementById('sn-collapse');
  function syncBtn() {
    var c = shell.classList.contains('sn-collapsed');
    btn.setAttribute('aria-pressed', c ? 'true' : 'false');
    btn.title = c ? 'Déplier le menu' : 'Réduire le menu';
  }
  syncBtn();
  btn.addEventListener('click', function () {
    shell.classList.toggle('sn-collapsed');
    save('nav.collapsed', shell.classList.contains('sn-collapsed') ? '1' : '0');
    syncBtn();
  });
  function drawer(on) {
    shell.classList.toggle('sn-drawer-open', on);
    document.getElementById('sn-menu-btn').setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  document.getElementById('sn-menu-btn').addEventListener('click', function () { drawer(true); });
  document.getElementById('sn-drawer-close').addEventListener('click', function () { drawer(false); });
  document.getElementById('sn-backdrop').addEventListener('click', function () { drawer(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') drawer(false); });
})();
</script>`;

export interface SideNavShellOptions {
  /** Titre en tête du menu (« Pipeline », « Administration »). */
  title: string;
  /** Clé des groupes ouverts retenus, propre à chaque page. */
  storageKey: string;
  groups: SideNavGroup[];
  /** Lien en pied de menu (vers l'autre espace). */
  footer?: { href: string; label: string; icon: IconName };
  /** Contenu de la page. */
  content: string;
}

/**
 * Coquille d'une page : menu latéral + contenu. `#sn-shell` porte les états `sn-collapsed` (menu réduit) et
 * `sn-drawer-open` (tiroir mobile ouvert).
 */
export function sideNavShell(o: SideNavShellOptions): string {
  return `${STYLE}
<div id="sn-shell" class="flex items-start" data-open-key="nav.open.${esc(o.storageKey)}">
  <aside id="sn-nav" class="shrink-0 bg-white border-r border-zinc-200/80 md:sticky md:top-[49px] md:h-[calc(100vh-49px)] flex flex-col" aria-label="Menu ${esc(o.title)}">
    <div class="sn-head flex items-center justify-between gap-2 px-3 pt-3 pb-2">
      <span class="sn-title text-[11px] font-extrabold uppercase tracking-wider text-zinc-400">${esc(o.title)}</span>
      <button type="button" id="sn-collapse" class="sn-collapse-btn p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors" aria-pressed="false" title="Réduire le menu">
        ${icon("panel-left", "sn-toggle-icon w-4 h-4")}
      </button>
      <button type="button" id="sn-drawer-close" class="md:hidden p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100" title="Fermer le menu">${icon("x", "w-4 h-4")}</button>
    </div>
    <nav class="flex-1 overflow-y-auto no-scrollbar px-2 pb-3 space-y-1">
      ${o.groups.map(groupHtml).join("")}
    </nav>
    ${
      o.footer
        ? `<div class="border-t border-zinc-200/80 p-2">
      <a href="${esc(o.footer.href)}" title="${esc(o.footer.label)}" class="sn-item flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-indigo-600 transition-colors">
        ${icon(o.footer.icon, "w-4 h-4 shrink-0 text-zinc-400")}<span class="sn-label">${esc(o.footer.label)}</span>
      </a>
    </div>`
        : ""
    }
  </aside>
  ${INIT}
  <div id="sn-backdrop" class="hidden fixed inset-0 z-40 bg-zinc-950/40 md:hidden"></div>
  <div class="flex-1 min-w-0">
    <div class="md:hidden bg-white border-b border-zinc-200/80 px-4 py-2 flex items-center gap-2">
      <button type="button" id="sn-menu-btn" aria-expanded="false" aria-controls="sn-nav" class="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-zinc-300 text-sm font-bold text-zinc-800">
        ${icon("menu", "w-4 h-4")}<span>Menu</span>
      </button>
      <span class="text-sm font-semibold text-zinc-600 truncate">${esc(activeNavLabel(o.groups, o.title))}</span>
    </div>
    ${o.content}
  </div>
</div>
${SCRIPT}`;
}
