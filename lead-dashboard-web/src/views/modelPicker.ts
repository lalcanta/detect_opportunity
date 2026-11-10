/**
 * Composant « sélecteur de modèle IA » de l'admin.
 * - renderModelFilter : champ de recherche posé au-dessus d'un <select id="sel_mod_<cible>"> déjà rempli ;
 *   la liste reste complète, la saisie n'affiche que les modèles correspondants.
 * - renderFallbackPicker : liste ordonnée de modèles de secours, choisis dans le catalogue avec le même filtre ;
 *   la valeur envoyée reste le champ caché #fb_<cible> (« fournisseur:modèle, … »).
 * - modelPickerScript : le script navigateur des deux, à inclure une fois dans la page.
 *   Il lit le catalogue dans la variable globale nommée (tableau d'AvailableModel).
 */
import { esc } from "./layout";

/** Champ de filtre d'un sélecteur de modèle principal. */
export function renderModelFilter(target: string): string {
  return `<input type="search" data-target="${esc(target)}" placeholder="Filtrer la liste (ex : lite, 3.5, flash)" aria-label="Filtrer les modèles" class="mod-search w-full border border-zinc-200 rounded-lg px-3 py-1.5 mb-1.5 text-xs bg-white">`;
}

/** Modèles de secours d'une action, essayés dans l'ordre si le principal est en quota ou indisponible. */
export function renderFallbackPicker(target: string, raw?: string | null): string {
  let list: string[] = [];
  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) list = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    list = [];
  }
  // La liste de modèles est remplie côté navigateur depuis le catalogue (ALL_MODELS), comme le sélecteur principal.
  return `<div class="fb-picker" data-target="${target}">
    <label class="text-xs font-semibold text-zinc-700 block mb-1">Modèles de secours (facultatif, dans l'ordre) :</label>
    <input type="hidden" id="fb_${target}" value="${esc(list.join(", "))}">
    <ol id="fb_list_${target}" class="space-y-1 mb-1.5"></ol>
    <input type="search" id="fb_search_${target}" data-target="${target}" placeholder="Filtrer la liste (ex : lite, 3.1, claude)" aria-label="Filtrer les modèles de secours" class="fb-search w-full border border-zinc-200 rounded-lg px-3 py-1.5 mb-1.5 text-xs bg-white">
    <div class="flex gap-1.5">
      <select id="fb_sel_${target}" aria-label="Modèle de secours à ajouter" class="min-w-0 flex-1 border border-zinc-200 rounded-lg px-2 py-1.5 text-xs bg-white"></select>
      <button type="button" class="fb-add shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-700" data-target="${target}">Ajouter</button>
    </div>
    <p class="text-[10px] text-zinc-500 mt-1">Essayés dans l'ordre si le principal est en quota, saturé ou introuvable. Aucun : repli historique sur gemini-3-flash-preview.</p>
  </div>`;
}

/** Script navigateur du composant (pas d'antislash : il est inséré dans un template literal). */
export function modelPickerScript(catalogVar: string): string {
  return `
// Filtre des sélecteurs de modèles : la liste reste préremplie, on n'affiche que ce qui correspond.
function modelMatches(q, text) {
  var t = text.toLowerCase();
  return q.toLowerCase().split(' ').filter(Boolean).every(function (w) { return t.indexOf(w) >= 0; });
}
function applyModelFilter(sel, q) {
  if (!sel) return;
  if (sel._fullHtml === undefined) sel._fullHtml = sel.innerHTML;
  var current = sel.value;
  var box = document.createElement('select');
  box.innerHTML = sel._fullHtml;
  if (q.trim()) {
    Array.prototype.slice.call(box.querySelectorAll('option')).forEach(function (o) {
      if (o.value !== '__custom__' && !modelMatches(q, o.value + ' ' + o.textContent)) o.remove();
    });
    Array.prototype.slice.call(box.querySelectorAll('optgroup')).forEach(function (g) {
      if (!g.querySelector('option')) g.remove();
    });
  }
  sel.innerHTML = box.innerHTML;
  var opts = Array.prototype.slice.call(sel.options);
  if (opts.some(function (o) { return o.value === current; })) {
    sel.value = current;
    return;
  }
  // Le modèle choisi ne correspond plus au filtre : on prend le premier qui correspond.
  var first = opts.find(function (o) { return o.value !== '__custom__'; });
  if (first) {
    sel.value = first.value;
    if (sel.onchange) sel.onchange();
  }
}
document.querySelectorAll('.mod-search').forEach(function (inp) {
  inp.oninput = function () { applyModelFilter(document.getElementById('sel_mod_' + inp.dataset.target), inp.value); };
});

// Modèles de secours : liste ordonnée, choisie dans le catalogue avec le même filtre.
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

  var q = document.getElementById('fb_search_' + target).value;
  var sel = document.getElementById('fb_sel_' + target);
  var chosen = items.map(function (r) { return fbDescribe(r).id; });
  var groups = {};
  ${catalogVar}.forEach(function (m) {
    if (!FB_PROVIDERS[m.provider] || FB_SKIP.test(m.model_id) || chosen.indexOf(m.model_id) >= 0) return;
    if (q.trim() && !modelMatches(q, m.model_id + ' ' + m.display_name)) return;
    (groups[m.provider] = groups[m.provider] || []).push(m);
  });
  sel.innerHTML = '';
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
  var full = items.length >= FB_MAX;
  var empty = sel.options.length === 0;
  if (empty) {
    var none = document.createElement('option');
    none.textContent = 'Aucun modèle ne correspond';
    sel.appendChild(none);
  }
  sel.disabled = full || empty;
  var add = document.querySelector('.fb-add[data-target="' + target + '"]');
  if (add) {
    add.disabled = full || empty;
    add.className = 'fb-add shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-lg ' + (full || empty ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed' : 'bg-zinc-900 text-white hover:bg-zinc-700');
    add.textContent = full ? FB_MAX + ' max' : 'Ajouter';
  }
}
document.querySelectorAll('.fb-picker').forEach(function (box) {
  var target = box.dataset.target;
  document.getElementById('fb_search_' + target).oninput = function () { renderFallbackPicker(target); };
  box.querySelector('.fb-add').onclick = function () {
    var sel = document.getElementById('fb_sel_' + target);
    if (!sel.value || sel.disabled) return;
    fbSetItems(target, fbItems(target).concat([sel.value]));
  };
  renderFallbackPicker(target);
});
`;
}
