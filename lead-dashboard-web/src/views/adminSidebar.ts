/**
 * Menu latéral de l'administration : entrées regroupées en accordéons, réductible en barre d'icônes (choix retenu
 * dans le navigateur), et tiroir sur mobile. Rendu côté serveur ; le script ne fait que plier, déplier et retenir.
 */
import { esc, icon, type IconName } from "./layout";

export type NavBadgeTone = "info" | "warn" | "danger" | "ok";

export interface AdminNavItem {
  key: string;
  icon: IconName;
  label: string;
  badge?: { text: string; tone: NavBadgeTone; pulse?: boolean };
}

export interface AdminNavGroup {
  id: string;
  label: string;
  icon: IconName;
  items: AdminNavItem[];
}

const TONES: Record<NavBadgeTone, string> = {
  info: "bg-cyan-500",
  warn: "bg-amber-500",
  danger: "bg-rose-500",
  ok: "bg-emerald-500",
};

/** Libellé de l'entrée active (barre mobile). */
export function activeNavLabel(groups: AdminNavGroup[], active: string): string {
  for (const g of groups) for (const i of g.items) if (i.key === active) return i.label;
  return "Administration";
}

function itemHtml(item: AdminNavItem, active: string): string {
  const on = item.key === active;
  const b = item.badge;
  return `<a href="/admin?tab=${esc(item.key)}" title="${esc(item.label)}"${on ? ' aria-current="page"' : ""}
     class="adm-item group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors ${
       on ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
     }">
    <span class="relative shrink-0">${icon(item.icon, `w-4 h-4 ${on ? "text-indigo-300" : "text-zinc-400 group-hover:text-zinc-600"}`)}${
      b ? `<span class="adm-dot absolute -top-1 -right-1 w-2 h-2 rounded-full ring-2 ring-white ${TONES[b.tone]}"></span>` : ""
    }</span>
    <span class="adm-label min-w-0 flex-1 truncate">${esc(item.label)}</span>
    ${b ? `<span class="adm-label shrink-0 px-1.5 py-0.5 rounded-full text-[10px] leading-none font-extrabold text-white ${TONES[b.tone]}${b.pulse ? " animate-pulse" : ""}">${esc(b.text)}</span>` : ""}
  </a>`;
}

function groupHtml(group: AdminNavGroup, active: string): string {
  const hasActive = group.items.some((i) => i.key === active);
  const panelId = `adm-panel-${group.id}`;
  const alert = group.items.find((i) => i.badge && i.badge.tone !== "ok")?.badge;
  return `<div class="adm-group" data-group="${esc(group.id)}"${hasActive ? ' data-active="1"' : ""}>
    <button type="button" class="adm-group-head w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-extrabold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors"
      aria-expanded="${hasActive ? "true" : "false"}" aria-controls="${panelId}">
      ${icon(group.icon, "w-3.5 h-3.5 shrink-0 text-zinc-400")}
      <span class="flex-1 text-left truncate">${esc(group.label)}</span>
      ${alert ? `<span class="adm-head-dot w-1.5 h-1.5 rounded-full ${TONES[alert.tone]}"></span>` : ""}
      ${icon("chevron-down", "adm-chevron w-3.5 h-3.5 shrink-0 text-zinc-400 transition-transform")}
    </button>
    <div id="${panelId}" class="adm-panel space-y-0.5 pt-0.5 pb-1.5"${hasActive ? "" : " hidden"}>
      ${group.items.map((i) => itemHtml(i, active)).join("")}
    </div>
  </div>`;
}

/** Feuille de style du menu (états réduit et tiroir mobile, indépendants de Tailwind). */
const STYLE = `<style>
  #adm-nav { width: 252px; transition: width .18s ease, transform .2s ease; }
  #adm-nav .adm-dot { display: none; }
  #adm-nav .adm-group-head[aria-expanded="true"] .adm-chevron { transform: rotate(180deg); }
  #adm-nav .adm-group-head[aria-expanded="true"] .adm-head-dot { display: none; }
  @media (min-width: 768px) {
    .adm-collapsed #adm-nav { width: 60px; }
    .adm-collapsed #adm-nav .adm-label,
    .adm-collapsed #adm-nav .adm-group-head,
    .adm-collapsed #adm-nav .adm-title { display: none; }
    .adm-collapsed #adm-nav .adm-panel { display: block !important; border-top: 1px solid #e4e4e7; padding-top: 6px; margin-top: 2px; }
    .adm-collapsed #adm-nav .adm-group:first-of-type .adm-panel { border-top: 0; }
    .adm-collapsed #adm-nav .adm-item { justify-content: center; padding-left: 0; padding-right: 0; }
    .adm-collapsed #adm-nav .adm-dot { display: block; }
    .adm-collapsed #adm-nav .adm-toggle-icon { transform: scaleX(-1); }
    .adm-collapsed #adm-nav .adm-head { justify-content: center; }
  }
  @media (max-width: 767px) {
    #adm-nav { position: fixed; top: 0; bottom: 0; left: 0; z-index: 50; height: 100vh !important; transform: translateX(-100%); box-shadow: 0 10px 40px rgba(0,0,0,.18); }
    .adm-drawer-open #adm-nav { transform: translateX(0); }
    .adm-drawer-open #adm-backdrop { display: block; }
    #adm-nav .adm-collapse-btn { display: none; }
  }
</style>`;

/** Restaure l'état retenu (menu réduit, groupes ouverts) juste après le menu, avant le contenu : pas de saut. */
const INIT = `<script>
(function () {
  var shell = document.getElementById('adm-shell');
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  if (load('adm.nav.collapsed') === '1') shell.classList.add('adm-collapsed');
  var open = null;
  try { open = JSON.parse(load('adm.nav.open') || 'null'); } catch (e) { open = null; }
  if (!Array.isArray(open)) return;
  shell.querySelectorAll('.adm-group').forEach(function (g) {
    // Le groupe de la page affichée reste ouvert ; les autres suivent le dernier choix.
    var on = g.dataset.active === '1' || open.indexOf(g.dataset.group) !== -1;
    g.querySelector('.adm-group-head').setAttribute('aria-expanded', on ? 'true' : 'false');
    var panel = g.querySelector('.adm-panel');
    if (on) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
  });
})();
</script>`;

/** Pliage, réduction et tiroir mobile. */
const SCRIPT = `<script>
(function () {
  var shell = document.getElementById('adm-shell');
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var groups = shell.querySelectorAll('.adm-group');
  function setOpen(g, on) {
    var head = g.querySelector('.adm-group-head'), panel = g.querySelector('.adm-panel');
    head.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
  }
  groups.forEach(function (g) {
    g.querySelector('.adm-group-head').addEventListener('click', function () {
      setOpen(g, this.getAttribute('aria-expanded') !== 'true');
      var ids = [];
      groups.forEach(function (x) { if (x.querySelector('.adm-group-head').getAttribute('aria-expanded') === 'true') ids.push(x.dataset.group); });
      save('adm.nav.open', JSON.stringify(ids));
    });
  });
  var btn = document.getElementById('adm-collapse');
  function syncBtn() {
    var c = shell.classList.contains('adm-collapsed');
    btn.setAttribute('aria-pressed', c ? 'true' : 'false');
    btn.title = c ? 'Déplier le menu' : 'Réduire le menu';
  }
  syncBtn();
  btn.addEventListener('click', function () {
    shell.classList.toggle('adm-collapsed');
    save('adm.nav.collapsed', shell.classList.contains('adm-collapsed') ? '1' : '0');
    syncBtn();
  });
  function drawer(on) {
    shell.classList.toggle('adm-drawer-open', on);
    document.getElementById('adm-menu-btn').setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  document.getElementById('adm-menu-btn').addEventListener('click', function () { drawer(true); });
  document.getElementById('adm-drawer-close').addEventListener('click', function () { drawer(false); });
  document.getElementById('adm-backdrop').addEventListener('click', function () { drawer(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') drawer(false); });
})();
</script>`;

/**
 * Coquille de l'administration : menu latéral + contenu. `content` est le contenu de l'onglet affiché.
 * `#adm-shell` porte les états `adm-collapsed` (menu réduit) et `adm-drawer-open` (tiroir mobile ouvert).
 */
export function adminShell(groups: AdminNavGroup[], active: string, content: string): string {
  return `${STYLE}
<div id="adm-shell" class="flex items-start">
  <aside id="adm-nav" class="shrink-0 bg-white border-r border-zinc-200/80 md:sticky md:top-[49px] md:h-[calc(100vh-49px)] flex flex-col" aria-label="Menu de l'administration">
    <div class="adm-head flex items-center justify-between gap-2 px-3 pt-3 pb-2">
      <span class="adm-title text-[11px] font-extrabold uppercase tracking-wider text-zinc-400">Administration</span>
      <button type="button" id="adm-collapse" class="adm-collapse-btn p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors" aria-pressed="false" title="Réduire le menu">
        ${icon("panel-left", "adm-toggle-icon w-4 h-4")}
      </button>
      <button type="button" id="adm-drawer-close" class="md:hidden p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100" title="Fermer le menu">${icon("x", "w-4 h-4")}</button>
    </div>
    <nav class="flex-1 overflow-y-auto no-scrollbar px-2 pb-3 space-y-1">
      ${groups.map((g) => groupHtml(g, active)).join("")}
    </nav>
    <div class="border-t border-zinc-200/80 p-2">
      <a href="/" title="Pipeline closer" class="adm-item flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-indigo-600 transition-colors">
        ${icon("external", "w-4 h-4 shrink-0 text-zinc-400")}<span class="adm-label">Pipeline closer</span>
      </a>
    </div>
  </aside>
  ${INIT}
  <div id="adm-backdrop" class="hidden fixed inset-0 z-40 bg-zinc-950/40 md:hidden"></div>
  <div class="flex-1 min-w-0">
    <div class="md:hidden bg-white border-b border-zinc-200/80 px-4 py-2 flex items-center gap-2">
      <button type="button" id="adm-menu-btn" aria-expanded="false" aria-controls="adm-nav" class="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-zinc-300 text-sm font-bold text-zinc-800">
        ${icon("menu", "w-4 h-4")}<span>Menu</span>
      </button>
      <span class="text-sm font-semibold text-zinc-600 truncate">${esc(activeNavLabel(groups, active))}</span>
    </div>
    ${content}
  </div>
</div>
${SCRIPT}`;
}
