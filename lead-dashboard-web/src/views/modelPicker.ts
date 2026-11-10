/**
 * Composant « sélecteur de modèle IA » de l'admin.
 * - Liste déroulante avec recherche : tout <select class="mod-select"> (ou marqué data-searchable) est remplacé à
 *   l'écran par un bouton qui ouvre la liste, avec un champ de recherche en tête. Le <select> d'origine reste caché
 *   et garde la valeur : les scripts existants (onchange, .value, options reconstruites) continuent de marcher.
 * - renderFallbackPicker : liste ordonnée de modèles de secours, ajoutés depuis la même liste déroulante ;
 *   la valeur envoyée reste le champ caché #fb_<cible> (« fournisseur:modèle, … »).
 * - modelPickerScript : le script navigateur, à inclure une fois dans la page, après les gestionnaires des selects.
 *   Il lit le catalogue dans la variable globale nommée (tableau d'AvailableModel).
 */
import { esc } from "./layout";

/** Modèles de secours d'une action, essayés dans l'ordre si le principal est en quota ou indisponible. */
export function renderFallbackPicker(target: string, raw?: string | null): string {
  let list: string[] = [];
  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) list = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    list = [];
  }
  // Les options sont remplies côté navigateur depuis le catalogue, sans les modèles déjà choisis.
  return `<div class="fb-picker" data-target="${esc(target)}">
    <label class="text-xs font-semibold text-zinc-700 block mb-1">Modèles de secours (facultatif, dans l'ordre) :</label>
    <input type="hidden" id="fb_${esc(target)}" value="${esc(list.join(", "))}">
    <ol id="fb_list_${esc(target)}" class="space-y-1 mb-1.5"></ol>
    <select id="fb_sel_${esc(target)}" data-searchable="1" aria-label="Ajouter un modèle de secours" class="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white"></select>
    <p class="text-[10px] text-zinc-500 mt-1">Essayés dans l'ordre si le principal est en quota, saturé ou introuvable. Aucun : repli historique sur gemini-3-flash-preview.</p>
  </div>`;
}

/** Script navigateur du composant (pas d'antislash : il est inséré dans un template literal). */
export function modelPickerScript(catalogVar: string): string {
  return `
// ---- Liste déroulante avec recherche (remplace l'affichage d'un <select>, qui reste la source de la valeur) ----
function modelMatches(q, text) {
  var t = text.toLowerCase();
  return q.toLowerCase().split(' ').filter(Boolean).every(function (w) { return t.indexOf(w) >= 0; });
}
var SS_OPEN = null;
document.addEventListener('mousedown', function (e) {
  if (SS_OPEN && !SS_OPEN.root.contains(e.target)) SS_OPEN.close(false);
});
function enhanceSelect(sel) {
  if (!sel || sel._ss) return;
  var root = document.createElement('div');
  root.className = 'relative';
  sel.parentNode.insertBefore(root, sel);
  root.appendChild(sel);
  sel.classList.add('hidden');

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
  btn.className = 'w-full flex items-center justify-between gap-2 border border-zinc-200 rounded-lg px-3 py-2 text-xs font-medium bg-white text-left hover:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-50 disabled:text-zinc-400 disabled:cursor-not-allowed';
  var label = document.createElement('span');
  label.className = 'min-w-0 truncate';
  var caret = document.createElement('span');
  caret.className = 'shrink-0 text-zinc-700 text-sm leading-none';
  caret.setAttribute('aria-hidden', 'true');
  caret.textContent = '▾';
  btn.appendChild(label);
  btn.appendChild(caret);
  root.appendChild(btn);

  var panel = document.createElement('div');
  panel.className = 'hidden absolute z-50 left-0 right-0 mt-1 min-w-[260px] bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden';
  var search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Rechercher (ex : lite, 3.1, claude)';
  search.setAttribute('aria-label', 'Rechercher un modèle');
  search.className = 'w-full border-0 border-b border-zinc-200 px-3 py-2 text-xs focus:outline-none focus:ring-0';
  var list = document.createElement('ul');
  list.setAttribute('role', 'listbox');
  list.className = 'max-h-72 overflow-y-auto py-1';
  panel.appendChild(search);
  panel.appendChild(list);
  root.appendChild(panel);

  var items = [];
  var active = -1;

  function refresh() {
    var o = sel.options[sel.selectedIndex];
    label.textContent = o ? o.textContent : '';
    label.className = 'min-w-0 truncate' + (o && !o.value ? ' text-zinc-500' : '');
    btn.disabled = sel.disabled;
  }
  function setActive(i) {
    if (!items.length) { active = -1; return; }
    active = Math.max(0, Math.min(items.length - 1, i));
    items.forEach(function (li, j) {
      li.className = 'px-3 py-1.5 text-xs cursor-pointer flex items-center gap-2 ' + (j === active ? 'bg-zinc-900 text-white' : 'text-zinc-800 hover:bg-zinc-100');
      li.setAttribute('aria-selected', j === active ? 'true' : 'false');
    });
    var el = items[active];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
  function renderList() {
    var q = search.value;
    list.innerHTML = '';
    items = [];
    var selectedPos = -1;
    function addOption(o) {
      if (!o.value || o.disabled) return false;
      if (q.trim() && !modelMatches(q, o.value + ' ' + o.textContent)) return false;
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      var check = document.createElement('span');
      check.className = 'w-3 shrink-0';
      check.textContent = o.value === sel.value ? '✓' : '';
      var txt = document.createElement('span');
      txt.className = 'min-w-0 truncate';
      txt.textContent = o.textContent;
      txt.title = o.textContent;
      li.appendChild(check);
      li.appendChild(txt);
      li.onmousedown = function (e) { e.preventDefault(); pick(o.value); };
      if (o.value === sel.value) selectedPos = items.length;
      items.push(li);
      list.appendChild(li);
      return true;
    }
    Array.prototype.forEach.call(sel.children, function (child) {
      if (child.tagName === 'OPTGROUP') {
        var head = document.createElement('li');
        head.className = 'px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400';
        head.textContent = child.label;
        list.appendChild(head);
        var any = false;
        Array.prototype.forEach.call(child.children, function (o) { if (addOption(o)) any = true; });
        if (!any) head.remove();
      } else if (child.tagName === 'OPTION') {
        addOption(child);
      }
    });
    if (!items.length) {
      var none = document.createElement('li');
      none.className = 'px-3 py-2 text-xs text-zinc-400';
      none.textContent = 'Aucun modèle ne correspond';
      list.appendChild(none);
    }
    setActive(q.trim() || selectedPos < 0 ? 0 : selectedPos);
  }
  function open() {
    if (sel.disabled) return;
    if (SS_OPEN && SS_OPEN !== api) SS_OPEN.close(false);
    SS_OPEN = api;
    search.value = '';
    panel.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
    renderList();
    search.focus();
  }
  function close(focusBtn) {
    panel.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
    if (SS_OPEN === api) SS_OPEN = null;
    if (focusBtn) btn.focus();
  }
  function pick(value) {
    close(true);
    if (sel.value === value) return;
    sel.value = value;
    refresh();
    if (sel.onchange) sel.onchange();
  }
  var api = { root: root, close: close };

  btn.onclick = function () { if (panel.classList.contains('hidden')) open(); else close(true); };
  btn.onkeydown = function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
  };
  search.oninput = renderList;
  search.onkeydown = function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      var li = items[active];
      if (li && li.onmousedown) li.onmousedown({ preventDefault: function () {} });
    } else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close(false);
  };

  // Les scripts existants changent .value puis appellent onchange, ou reconstruisent les options : on suit les deux.
  var original = sel.onchange;
  sel.onchange = function () { refresh(); if (original) return original.apply(this, arguments); };
  new MutationObserver(refresh).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  sel._ss = api;
  refresh();
}

// ---- Modèles de secours : liste ordonnée, ajoutés depuis la liste déroulante ----
var FB_PROVIDERS = { gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Claude', openrouter: 'OpenRouter', cloudflare: 'Cloudflare' };
var FB_MAX = 5;
var FB_SKIP = /tts|image|lyria|transcribe|robotics|computer-use|banana|deep-research|embedding|antigravity|imagen|veo/i;
function fbItems(target) {
  return document.getElementById('fb_' + target).value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}
function fbSetItems(target, items) {
  document.getElementById('fb_' + target).value = items.join(', ');
  renderFallbackPicker(target);
}
function fbDescribe(ref) {
  var i = ref.indexOf(':');
  var prov = i > 0 && FB_PROVIDERS[ref.slice(0, i)] ? ref.slice(0, i) : '';
  var id = prov ? ref.slice(i + 1) : ref;
  var m = ${catalogVar}.find(function (x) { return x.model_id === id && (!prov || x.provider === prov); });
  return { id: id, provider: FB_PROVIDERS[prov || (m ? m.provider : '')] || '', name: m ? m.display_name : '' };
}
function fbButton(label, title, onClick) {
  var b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.className = 'w-6 h-6 rounded-md text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900';
  b.onclick = onClick;
  return b;
}
function renderFallbackPicker(target) {
  var items = fbItems(target);
  var list = document.getElementById('fb_list_' + target);
  list.innerHTML = '';
  items.forEach(function (ref, idx) {
    var d = fbDescribe(ref);
    var li = document.createElement('li');
    li.className = 'flex items-center gap-2 border border-zinc-200 bg-zinc-50 rounded-lg pl-2 pr-1 py-1 text-xs';
    var num = document.createElement('span');
    num.className = 'font-bold text-zinc-400 w-4';
    num.textContent = String(idx + 1);
    var text = document.createElement('span');
    text.className = 'min-w-0 flex-1 truncate font-mono text-zinc-800';
    text.textContent = d.id;
    text.title = d.name || d.id;
    li.appendChild(num);
    li.appendChild(text);
    if (d.provider) {
      var prov = document.createElement('span');
      prov.className = 'text-[10px] font-semibold text-zinc-500';
      prov.textContent = d.provider;
      li.appendChild(prov);
    }
    if (idx > 0) {
      li.appendChild(fbButton('↑', 'Essayer plus tôt', function () {
        var next = items.slice();
        next.splice(idx - 1, 0, next.splice(idx, 1)[0]);
        fbSetItems(target, next);
      }));
    }
    li.appendChild(fbButton('✕', 'Retirer ' + d.id, function () {
      fbSetItems(target, items.filter(function (_, j) { return j !== idx; }));
    }));
    list.appendChild(li);
  });

  var sel = document.getElementById('fb_sel_' + target);
  var chosen = items.map(function (r) { return fbDescribe(r).id; });
  var full = items.length >= FB_MAX;
  sel.innerHTML = '';
  var placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = full ? FB_MAX + ' modèles de secours au maximum' : '+ Ajouter un modèle de secours…';
  sel.appendChild(placeholder);
  var groups = {};
  ${catalogVar}.forEach(function (m) {
    if (!FB_PROVIDERS[m.provider] || FB_SKIP.test(m.model_id) || chosen.indexOf(m.model_id) >= 0) return;
    (groups[m.provider] = groups[m.provider] || []).push(m);
  });
  Object.keys(FB_PROVIDERS).forEach(function (p) {
    if (!groups[p]) return;
    var g = document.createElement('optgroup');
    g.label = FB_PROVIDERS[p];
    groups[p].forEach(function (m) {
      var o = document.createElement('option');
      o.value = m.provider + ':' + m.model_id;
      o.textContent = m.model_id + (m.display_name && m.display_name !== m.model_id ? ' — ' + m.display_name : '');
      g.appendChild(o);
    });
    sel.appendChild(g);
  });
  sel.value = '';
  sel.disabled = full;
}
document.querySelectorAll('.fb-picker').forEach(function (box) {
  var target = box.dataset.target;
  var sel = document.getElementById('fb_sel_' + target);
  sel.onchange = function () {
    if (sel.value) fbSetItems(target, fbItems(target).concat([sel.value]));
  };
  renderFallbackPicker(target);
});

document.querySelectorAll('select.mod-select, select[data-searchable]').forEach(enhanceSelect);
`;
}
