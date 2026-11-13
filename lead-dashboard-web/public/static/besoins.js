/*
 * Onglet admin « Besoins » : liste, fiche, graphe du workflow et édition au clic.
 *
 * Le workflow d'un besoin est un graphe de nœuds qui complètent un dossier partagé (catalogue C.nodes, miroir de
 * shared/opportunities/workflow.ts). Chaque nœud déclare les clés qu'il lit et écrit : ajouter un nœud ajoute ses
 * prérequis, en retirer un retire ce qui en dépend. Les nœuds se déduisent des champs du besoin (scanModules,
 * channels, pitch, proof, flyer) et y sont réécrits : la validation du serveur reste la référence. La démo
 * complémentaire d'un bilan (nœud site_demo) suit la preuve ; elle se règle par complementDemo, pas dans le graphe.
 *
 * Données : GET /api/admin/opportunities ; validation en direct : POST /api/admin/opportunities/validate ;
 * enregistrement : POST /api/admin/opportunities. Catalogue : <script id="needs-catalog">.
 */
(function () {
  "use strict";

  var root = document.getElementById("needs-app");
  if (!root) return;
  var C = JSON.parse(document.getElementById("needs-catalog").textContent);

  var TONES = {
    blue: { chip: "bg-blue-50 text-blue-700 border-blue-200", dot: "#2563eb" },
    cyan: { chip: "bg-cyan-50 text-cyan-800 border-cyan-200", dot: "#0891b2" },
    amber: { chip: "bg-amber-50 text-amber-800 border-amber-200", dot: "#d97706" },
    emerald: { chip: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "#059669" },
    purple: { chip: "bg-purple-50 text-purple-700 border-purple-200", dot: "#7c3aed" },
    zinc: { chip: "bg-zinc-100 text-zinc-700 border-zinc-200", dot: "#71717a" },
  };
  var STATUS_CHIP = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    draft: "bg-amber-50 text-amber-800 border-amber-200",
    archived: "bg-zinc-100 text-zinc-500 border-zinc-200",
  };
  var STAGE_COLOR = {
    source: "#6366f1",
    filter: "#6366f1",
    inspect: "#0891b2",
    qualify: "#d97706",
    produce: "#059669",
    message: "#059669",
    handoff: "#7c3aed",
    channel: "#db2777",
  };
  var DEFAULT_PROOF = {
    demo_web: { kind: "demo_web", generator: "llm_demo", focus: "showcase", interestCta: "Ce site me plaît, on en discute" },
    audit_report: { kind: "audit_report", generator: "tracker_report", interestCta: "Ce rapport m'intéresse" },
    visibility_report: { kind: "visibility_report", generator: "visibility_report", interestCta: "Je veux améliorer ma visibilité, on en parle" },
    acquisition_report: { kind: "acquisition_report", generator: "acquisition_report", interestCta: "Je veux en discuter" },
  };

  var state = {
    items: [],
    selectedId: null,
    mode: "view", // view | edit | create
    draft: null,
    baseVersion: 0,
    errors: [],
    saving: false,
    message: null,
    node: null, // nœud sélectionné dans le graphe
    palette: null, // étape dont on affiche les nœuds à ajouter
    confirm: null, // { text, apply } : changement qui retire d'autres nœuds
    notice: null, // { tone, text } : ce qu'un clic a ajouté ou retiré
    history: null,
    proofStash: {},
  };

  /* ---------- utilitaires ---------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }
  function ic(name, cls) {
    return '<span class="inline-block shrink-0 ' + (cls || "w-4 h-4") + '">' + (C.icons[name] || "") + "</span>";
  }
  function find(arr, fn) {
    for (var i = 0; i < arr.length; i++) if (fn(arr[i])) return arr[i];
    return null;
  }
  function has(arr, v) {
    return arr.indexOf(v) >= 0;
  }
  function channelLabel(id) {
    var c = find(C.channels, function (x) { return x.id === id; });
    return c ? c.label : id;
  }
  function keyLabel(k) {
    return C.keys[k] ? C.keys[k].label : k;
  }
  function list(arr, word) {
    if (arr.length <= 1) return arr.join("");
    return arr.slice(0, -1).join(", ") + " " + (word || "ou") + " " + arr[arr.length - 1];
  }
  function quoted(ids) {
    return list(ids.map(function (id) { return "« " + nodeOf(id).label + " »"; }), "et");
  }
  function slug(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^([0-9])/, "b_$1")
      .slice(0, 40);
  }
  function fmtDate(s) {
    if (!s) return "";
    var d = new Date(String(s).replace(" ", "T") + (String(s).indexOf("Z") < 0 && String(s).indexOf("+") < 0 ? "Z" : ""));
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  }
  function fmtNum(n) {
    return String(n).replace(".", ",");
  }
  function current() {
    if (state.mode !== "view" && state.draft) return state.draft;
    var it = currentItem();
    return it ? it.def : null;
  }
  function currentItem() {
    return find(state.items, function (x) { return x.def.id === state.selectedId; });
  }

  /* ---------- modèle du workflow (miroir de shared/opportunities/workflow.ts) ---------- */

  var NODE = {};
  C.nodes.forEach(function (n) { NODE[n.id] = n; });
  var STAGE_INDEX = {};
  C.stages.forEach(function (s, i) { STAGE_INDEX[s.id] = i; });

  function nodeOf(id) {
    return NODE[id] || { id: id, label: id, description: "", reads: [], writes: [], stage: "inspect", binding: { kind: "fixed" }, icon: "layers" };
  }
  function isFixed(id) {
    return nodeOf(id).binding.kind === "fixed";
  }
  function channelNode(c) {
    return "channel_" + c;
  }

  function isReport(kind) {
    return has(C.reportProofs, kind);
  }
  function complementMode(d) {
    return d.complementDemo || "auto";
  }
  function complementLabel(d) {
    var m = find(C.complementDemo, function (x) { return x.id === complementMode(d); });
    return m ? m.label : complementMode(d);
  }

  /**
   * Nœuds d'un besoin : copie de workflowNodeIds (shared/opportunities/workflow.ts), à tenir identique. Les nœuds,
   * modules, générateurs et preuves « bilan » viennent du catalogue servi par needs.ts ; seul l'ordre est recopié.
   */
  function nodeIdsOf(d) {
    var ids = ["maps_search", "maps_filter"];
    C.modules.forEach(function (m) { if (has(d.scanModules, m.id)) ids.push(m.id); });
    ids.push("qualify", d.proof.kind);
    if (isReport(d.proof.kind)) ids.push("site_demo");
    if (d.flyer) ids.push("flyer");
    var gens = d.channels.map(function (c) { return d.pitch[c]; });
    C.pitch.forEach(function (p) { if (has(gens, p.id)) ids.push(p.id); });
    ids.push("crm_handoff");
    d.channels.forEach(function (c) { ids.push(channelNode(c)); });
    return ids;
  }
  function blockedKeys(website) {
    if (website === "forbidden") return ["site", "site_garanti"];
    if (website === "optional") return ["site_garanti"];
    return [];
  }
  function availKeys(ids, website) {
    var blocked = blockedKeys(website);
    var keys = {};
    ids.forEach(function (id) {
      nodeOf(id).writes.forEach(function (k) { if (!has(blocked, k)) keys[k] = true; });
    });
    return keys;
  }
  function missingOf(id, ids, website) {
    var av = availKeys(ids, website);
    return nodeOf(id).reads.filter(function (k) { return !av[k]; });
  }
  function writerOf(ids, key) {
    return find(ids, function (id) { return has(nodeOf(id).writes, key); });
  }
  function providers(key) {
    return C.nodes.filter(function (n) { return has(n.writes, key) && n.binding.kind !== "fixed"; });
  }
  /** La clé peut-elle être obtenue, au besoin en ajoutant des nœuds ? */
  function canProvide(key, ids, website, banned, seen) {
    if (availKeys(ids, website)[key]) return true;
    if (has(blockedKeys(website), key)) return false;
    return providers(key).some(function (p) {
      if (has(banned, p.id) || has(ids, p.id) || has(seen, p.id)) return false;
      var next = seen.concat([p.id]);
      return p.reads.every(function (k) { return canProvide(k, ids, website, banned, next); });
    });
  }
  /** Meilleur fournisseur d'une clé : celui qui n'exige rien de plus, puis celui qui s'appuie sur le plus de clés présentes. */
  function pickProvider(key, ids, website, banned) {
    var av = availKeys(ids, website);
    var best = null, bestScore = -1;
    providers(key).forEach(function (p) {
      if (has(banned, p.id) || has(ids, p.id)) return;
      if (!p.reads.every(function (k) { return canProvide(k, ids, website, banned, [p.id]); })) return;
      var present = p.reads.filter(function (k) { return av[k]; }).length;
      var score = (present === p.reads.length ? 100 : 0) + present;
      if (score > bestScore) { best = p.id; bestScore = score; }
    });
    return best;
  }
  /** Autre nœud du même rôle (même clé principale), utilisable à la place d'un nœud bloqué. */
  function variantsOf(id) {
    var main = nodeOf(id).writes[0];
    if (!main) return [];
    return C.nodes.filter(function (n) { return n.id !== id && n.writes[0] === main && n.binding.kind !== "fixed"; });
  }
  function usable(n, ids, website, banned) {
    return n.reads.every(function (k) { return canProvide(k, ids, website, banned, [n.id]); });
  }
  function insert(ids, id, removed) {
    // Un nœud qui écrit une clé déjà écrite remplace son auteur actuel.
    nodeOf(id).writes.forEach(function (k) {
      var w = writerOf(ids, k);
      if (w && w !== id && !isFixed(w)) {
        ids.splice(ids.indexOf(w), 1);
        removed.push(w);
      }
    });
    ids.push(id);
  }

  /**
   * Complète ou élague un ensemble de nœuds jusqu'à ce que chaque nœud trouve ses clés : ajoute les fournisseurs
   * manquants, remplace un nœud bloqué par une variante, retire sinon ce qui ne peut plus tourner.
   */
  function resolve(start, website, banned) {
    var ids = start.slice();
    var added = [], removed = [], blocked = [];
    for (var iter = 0; iter < 40; iter++) {
      var changed = false;
      for (var i = 0; i < ids.length && !changed; i++) {
        var id = ids[i];
        var miss = missingOf(id, ids, website);
        if (!miss.length) continue;
        for (var j = 0; j < miss.length && !changed; j++) {
          var p = pickProvider(miss[j], ids, website, banned);
          if (p) {
            insert(ids, p, removed);
            added.push(p);
            changed = true;
          }
        }
        if (changed) break;
        var v = find(variantsOf(id), function (n) { return !has(banned, n.id) && !has(ids, n.id) && usable(n, ids, website, banned); });
        if (v) {
          ids.splice(i, 1);
          removed.push(id);
          insert(ids, v.id, removed);
          added.push(v.id);
          changed = true;
        } else if (isFixed(id)) {
          if (!has(blocked, id)) blocked.push(id);
        } else {
          ids.splice(i, 1);
          removed.push(id);
          changed = true;
        }
      }
      if (!changed) {
        // Un message que plus aucun canal ne lit est retiré.
        var orphan = find(ids, function (id) {
          if (nodeOf(id).binding.kind !== "pitch") return false;
          var key = nodeOf(id).writes[0];
          return !ids.some(function (o) { return o !== id && has(nodeOf(o).reads, key); });
        });
        if (orphan) {
          ids.splice(ids.indexOf(orphan), 1);
          removed.push(orphan);
          changed = true;
        }
      }
      if (!changed) break;
    }
    return {
      ids: ids,
      added: added.filter(function (x, k) { return has(ids, x) && added.indexOf(x) === k; }),
      removed: removed.filter(function (x, k) { return !has(ids, x) && removed.indexOf(x) === k; }),
      blocked: blocked,
    };
  }

  /** Réécrit les champs du besoin à partir d'un ensemble de nœuds. */
  function applyIds(d, ids, website) {
    d.requirements.website = website;
    d.scanModules = C.modules.map(function (m) { return m.id; }).filter(function (m) { return has(ids, m); });
    var proofNode = find(ids, function (id) { return nodeOf(id).binding.kind === "proof"; });
    var proofKind = proofNode ? nodeOf(proofNode).binding.proof : "demo_web";
    if (d.proof.kind !== proofKind) {
      state.proofStash[d.proof.kind] = clone(d.proof);
      d.proof = clone(state.proofStash[proofKind] || DEFAULT_PROOF[proofKind]);
    }
    if (isReport(proofKind)) {
      if (!d.complementDemo) d.complementDemo = state.proofStash.complementDemo || "auto";
    } else if (d.complementDemo) {
      state.proofStash.complementDemo = d.complementDemo;
      delete d.complementDemo;
    }
    d.flyer = has(ids, "flyer");
    var chans = d.channels.filter(function (c) { return has(ids, channelNode(c)); });
    C.channels.forEach(function (c) { if (has(ids, channelNode(c.id)) && !has(chans, c.id)) chans.push(c.id); });
    d.channels = chans;
    var pitch = {};
    chans.forEach(function (c) {
      var key = c === "phone" ? "script_appel" : "message_ecrit";
      var w = writerOf(ids, key);
      if (w) pitch[c] = w;
    });
    d.pitch = pitch;
    var allOf = (d.requirements.contacts.allOf || []).filter(function (c) { return has(chans, c); });
    var anyOf = (d.requirements.contacts.anyOf || []).filter(function (c) { return has(chans, c); });
    if (!allOf.length && !anyOf.length && chans.length) allOf = [chans[0]];
    var contacts = {};
    if (allOf.length) contacts.allOf = allOf;
    if (anyOf.length) contacts.anyOf = anyOf;
    d.requirements.contacts = contacts;
  }

  function planAdd(d, id) {
    var ids = nodeIdsOf(d);
    var removed = [];
    insert(ids, id, removed);
    var res = resolve(ids, d.requirements.website, removed);
    res.removed = removed.concat(res.removed).filter(function (x, k, a) { return a.indexOf(x) === k && !has(res.ids, x); });
    res.ok = has(res.ids, id) && !res.blocked.length;
    return res;
  }
  function planRemove(d, id) {
    var ids = nodeIdsOf(d).filter(function (x) { return x !== id; });
    var res = resolve(ids, d.requirements.website, [id]);
    res.removed = [id].concat(res.removed.filter(function (x) { return x !== id; }));
    res.ok = !res.blocked.length && res.ids.some(function (x) { return nodeOf(x).binding.kind === "channel"; });
    return res;
  }
  function planReplace(d, id, by) {
    var ids = nodeIdsOf(d).filter(function (x) { return x !== id; });
    var removed = [id];
    insert(ids, by, removed);
    var res = resolve(ids, d.requirements.website, removed);
    res.removed = removed.concat(res.removed).filter(function (x, k, a) { return a.indexOf(x) === k && !has(res.ids, x); });
    res.ok = has(res.ids, by) && !res.blocked.length;
    return res;
  }
  function planWebsite(d, website) {
    var res = resolve(nodeIdsOf(d), website, []);
    res.ok = !res.blocked.length && res.ids.some(function (x) { return nodeOf(x).binding.kind === "channel"; });
    return res;
  }

  /** Raison lisible pour laquelle un nœud ne peut pas être ajouté. */
  function whyNot(d, id) {
    var website = d.requirements.website;
    var ids = nodeIdsOf(d);
    var n = nodeOf(id);
    var bad = n.reads.filter(function (k) { return !canProvide(k, ids, website, [], [id]); });
    if (!bad.length) return "";
    if (has(bad, "site")) return "introuvable sans site";
    if (has(bad, "site_garanti")) return "exige « Site exigé » au filtre Maps";
    return "manque : " + bad.map(keyLabel).join(", ").toLowerCase();
  }

  /** Applique un plan, ou demande confirmation s'il retire d'autres nœuds. */
  function commit(d, plan, website, words, skipConfirm) {
    if (!plan.ok) {
      state.notice = {
        tone: "err",
        text: plan.blocked.length
          ? "Impossible : « " + nodeOf(plan.blocked[0]).label + " » n'aurait plus ce dont il a besoin."
          : "Impossible : il faut garder au moins un canal de premier contact.",
      };
      renderAll();
      return;
    }
    var subjects = plan.subjects || [];
    var addedOthers = plan.added.filter(function (x) { return !has(subjects, x); });
    var removedOthers = plan.removed.filter(function (x) { return !has(subjects, x); });
    var apply = function () {
      applyIds(d, plan.ids, website);
      var text = words.done;
      if (addedOthers.length) text += " · ajoute aussi " + quoted(addedOthers);
      if (removedOthers.length) text += " · retire aussi " + quoted(removedOthers);
      state.notice = addedOthers.length || removedOthers.length ? { tone: "ok", text: text } : null;
      state.confirm = null;
      if (state.node && !has(plan.ids, state.node)) state.node = null;
      renderAll();
      scheduleValidation();
    };
    if (removedOthers.length && !skipConfirm) {
      state.confirm = { text: words.ask + " retire aussi " + quoted(removedOthers) + (addedOthers.length ? " et ajoute " + quoted(addedOthers) : "") + ".", apply: apply };
      state.notice = null;
      renderAll();
      return;
    }
    apply();
  }

  /* ---------- données ---------- */

  function load(selectId) {
    return fetch("/api/admin/opportunities")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.items = data.opportunities || [];
        if (selectId) state.selectedId = selectId;
        if (!state.selectedId || !currentItem()) state.selectedId = state.items.length ? state.items[0].def.id : null;
        render();
      })
      .catch(function () {
        root.innerHTML = '<div class="bg-white rounded-2xl border border-rose-200 p-6 text-sm text-rose-700">Impossible de charger les besoins. Rechargez la page.</div>';
      });
  }

  var validateTimer = null;
  function payload() {
    var d = clone(state.draft);
    delete d._idTouched;
    delete d._badgeTouched;
    return d;
  }
  function scheduleValidation() {
    clearTimeout(validateTimer);
    validateTimer = setTimeout(function () {
      var sent = JSON.stringify(state.draft);
      fetch("/api/admin/opportunities/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition: payload() }),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (JSON.stringify(state.draft) !== sent) return;
          state.errors = res.errors || [];
          renderErrors();
        })
        .catch(function () {});
    }, 250);
  }

  function save() {
    if (state.saving || state.errors.length) return;
    state.saving = true;
    renderHeader();
    var version = state.mode === "create" ? 0 : state.baseVersion;
    fetch("/api/admin/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ definition: payload(), version: version }),
    })
      .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        state.saving = false;
        if (res.body && res.body.ok) {
          var id = state.draft.id;
          resetEditing();
          state.message = { tone: "ok", text: "Besoin enregistré (version " + res.body.version + "). Le worker l'appliquera au prochain job." };
          load(id);
        } else {
          state.errors = (res.body && res.body.errors) || ["Enregistrement refusé."];
          render();
        }
      })
      .catch(function () {
        state.saving = false;
        state.errors = ["Le dashboard ne répond pas : réessayez."];
        render();
      });
  }

  /* ---------- actions ---------- */

  function resetEditing() {
    state.mode = "view";
    state.draft = null;
    state.errors = [];
    state.history = null;
    state.node = null;
    state.palette = null;
    state.confirm = null;
    state.notice = null;
    state.proofStash = {};
  }
  function startEdit() {
    var it = currentItem();
    if (!it) return;
    resetEditing();
    state.mode = "edit";
    state.draft = clone(it.def);
    state.baseVersion = it.version;
    state.message = null;
    render();
  }
  function startCreate(from) {
    var base = from
      ? clone(from)
      : {
          id: "",
          status: "draft",
          label: "",
          badge: { text: "", tone: "zinc" },
          icon: "target",
          requirements: { website: "optional", contacts: { allOf: ["phone"] } },
          channels: ["phone"],
          scanModules: ["branding_visual", "contacts_legal", "dirigeant_sirene"],
          proof: clone(DEFAULT_PROOF.demo_web),
          pitch: { phone: "llm_phone_battlecard" },
          flyer: false,
          commercial: { businessModel: "one_shot", pitchFocus: "" },
        };
    if (from) {
      base.id = (from.id + "_copie").slice(0, 41);
      base.label = from.label + " (copie)";
      base.status = "draft";
      base._badgeTouched = true;
    }
    resetEditing();
    state.mode = "create";
    state.draft = base;
    state.baseVersion = 0;
    state.message = null;
    state.node = "identity";
    render();
    scheduleValidation();
    var input = document.getElementById("nd-label");
    if (input && !from) input.focus();
  }
  function cancelEdit() {
    if (state.mode === "create" && !state.selectedId && state.items.length) state.selectedId = state.items[0].def.id;
    resetEditing();
    render();
  }

  /* ---------- graphe ---------- */

  /** Résumé d'un nœud pour sa carte, d'après les réglages du besoin. */
  function nodeSummary(d, id) {
    var n = nodeOf(id);
    switch (n.binding.kind) {
      case "module":
        return "→ " + n.writes.map(keyLabel).join(", ");
      case "channel":
        var c = n.binding.channel;
        var rank = d.channels.indexOf(c) + 1;
        var need = has(d.requirements.contacts.allOf || [], c) ? "obligatoire" : has(d.requirements.contacts.anyOf || [], c) ? "au moins un" : "si trouvé";
        return (rank === 1 ? "1er choix" : rank + "e choix") + " · " + need;
      case "pitch":
        return d.commercial.tone ? "Ton " + toneLabel(d.commercial.tone).toLowerCase() : "Ton par défaut";
      case "proof":
        if (id === "demo_web") {
          var hl = (d.proof.highlights || []).length;
          return (C.focus[d.proof.focus] ? C.focus[d.proof.focus].label : "") + (hl ? " · " + hl + " point" + (hl > 1 ? "s" : "") + " fort" + (hl > 1 ? "s" : "") : "");
        }
        return "Sans modèle de langage";
      case "site_demo":
        return complementLabel(d);
      case "flyer":
        return "QR code avis Google";
    }
    if (id === "maps_search") return "Requête et zone du scan";
    if (id === "maps_filter") {
      var parts = [C.website[d.requirements.website].label];
      var l = d.requirements.listing || {};
      if (l.minRating != null) parts.push("note ≥ " + fmtNum(l.minRating));
      if (l.maxRating != null) parts.push("note ≤ " + fmtNum(l.maxRating));
      if (l.minReviews != null) parts.push("≥ " + l.minReviews + " avis");
      if (l.maxReviews != null) parts.push("≤ " + l.maxReviews + " avis");
      return parts.join(" · ");
    }
    if (id === "qualify") {
      var req = (d.requirements.contacts.allOf || []).map(channelLabel);
      var any = d.requirements.contacts.anyOf || [];
      if (any.length) req.push(list(any.map(channelLabel)));
      return req.length ? "Exige : " + req.join(" + ").toLowerCase() : "Aucun contact exigé";
    }
    if (id === "crm_handoff") return "Statut « démo prête »";
    return "";
  }
  function toneLabel(t) {
    var x = find(C.messageTones, function (m) { return m.id === t; });
    return x ? x.label : t;
  }

  /** Nœuds reliés au nœud sélectionné (lecteurs et auteurs de ses clés). */
  function relatedTo(ids, sel) {
    var out = {};
    if (!sel || !NODE[sel]) return out;
    var n = nodeOf(sel);
    var reads = n.reads.concat(n.optionalReads || []);
    ids.forEach(function (id) {
      var o = nodeOf(id);
      if (reads.some(function (k) { return has(o.writes, k); })) out[id] = true;
      if (n.writes.some(function (k) { return has(o.reads, k) || has(o.optionalReads || [], k); })) out[id] = true;
    });
    return out;
  }

  function addableFor(d, stage, ids) {
    return C.nodes.filter(function (n) {
      if (n.stage !== stage || n.binding.kind === "fixed" || has(ids, n.id)) return false;
      if (n.binding.kind === "pitch" || n.binding.kind === "proof") return false; // remplacés depuis leur fiche
      if (n.binding.kind === "site_demo") return false; // suit le bilan, réglé dans sa fiche
      return true;
    });
  }

  function graphHtml(d) {
    var edit = state.mode !== "view";
    var ids = nodeIdsOf(d);
    var website = d.requirements.website;
    var rel = relatedTo(ids, state.node);
    var rows = C.stages.map(function (s) {
      var stageIds = ids.filter(function (id) { return nodeOf(id).stage === s.id; });
      if (s.id === "channel") stageIds = d.channels.map(channelNode);
      var addable = edit ? addableFor(d, s.id, ids) : [];
      if (!stageIds.length && !addable.length) {
        if (s.id !== "inspect") return "";
        return rowHtml(s, '<div class="text-[11px] text-zinc-400 italic py-3">' + (website === "forbidden" ? "Aucune : prospects sans site" : "Aucune vérification") + "</div>");
      }
      var cards = stageIds.map(function (id) {
        var n = nodeOf(id);
        var miss = missingOf(id, ids, website);
        var sel = state.node === id;
        var dim = state.node && NODE[state.node] && !sel && !rel[id];
        var removable = edit && !isFixed(id) && n.binding.kind !== "proof" && n.binding.kind !== "pitch" && n.binding.kind !== "site_demo";
        var color = STAGE_COLOR[n.stage];
        return (
          '<div class="nd-card' + (sel ? " nd-sel" : "") + (rel[id] ? " nd-rel" : "") + (dim ? " nd-dim" : "") + (miss.length ? " nd-miss" : "") + '" data-node="' + id + '" data-card="' + id + '" tabindex="0" role="button" aria-pressed="' + sel + '" aria-label="' + esc(n.label + " : " + nodeSummary(d, id)) + '">' +
          '<span class="nd-bar" style="background:' + color + '"></span>' +
          '<span class="nd-title"><span class="nd-icon" style="color:' + color + '">' + (C.icons[n.icon] || "") + "</span><span class=\"nd-label\">" + esc(n.label) + "</span></span>" +
          '<span class="nd-sub">' + esc(miss.length ? "Manque : " + miss.map(keyLabel).join(", ").toLowerCase() : nodeSummary(d, id)) + "</span>" +
          (removable ? '<button type="button" class="nd-x" data-remove="' + id + '" aria-label="Retirer ' + esc(n.label) + '" title="Retirer">' + (C.icons.x || "×") + "</button>" : "") +
          "</div>"
        );
      }).join("");
      if (addable.length) {
        var open = state.palette === s.id;
        cards += '<button type="button" class="nd-add' + (open ? " nd-add-open" : "") + '" data-palette="' + s.id + '" aria-expanded="' + open + '">' + (open ? "Fermer" : "+ Ajouter") + "</button>";
      }
      var row = rowHtml(s, cards);
      if (state.palette === s.id && addable.length) row += paletteHtml(d, addable);
      return row;
    }).join("");
    return '<div class="relative" id="nd-graph-inner"><svg id="nd-edges" class="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true"></svg>' + rows + "</div>";
  }
  function rowHtml(s, inner) {
    return (
      '<div class="nd-row" data-stage="' + s.id + '">' +
      '<div class="nd-stage">' + esc(s.label) + "</div>" +
      '<div class="nd-cards">' + inner + "</div></div>"
    );
  }
  function paletteHtml(d, addable) {
    return (
      '<div class="nd-palette">' +
      addable.map(function (n) {
        var why = whyNot(d, n.id);
        var plan = why ? null : planAdd(d, n.id);
        var extra = plan && plan.added.filter(function (x) { return x !== n.id; });
        var gone = plan && plan.removed;
        var hint = why || (extra && extra.length ? "Ajoute aussi " + quoted(extra) : "") + (gone && gone.length ? (extra && extra.length ? " · " : "") + "Remplace " + quoted(gone) : "");
        return (
          '<button type="button" data-add="' + n.id + '"' + (why ? " disabled" : "") + ' class="nd-pal-item">' +
          '<span class="nd-icon" style="color:' + STAGE_COLOR[n.stage] + '">' + (C.icons[n.icon] || "") + "</span>" +
          '<span class="min-w-0"><span class="block text-xs font-bold text-zinc-900">' + esc(n.label) + "</span>" +
          '<span class="block text-[11px] text-zinc-500 leading-snug">' + esc(n.description) + "</span>" +
          (hint ? '<span class="block text-[11px] mt-0.5 ' + (why ? "text-rose-600" : "text-indigo-700") + '">' + esc(hint) + "</span>" : "") +
          "</span></button>"
        );
      }).join("") +
      "</div>"
    );
  }

  /** Liaisons entre auteurs et lecteurs des clés, dessinées par-dessus la grille une fois les cartes placées. */
  function drawEdges() {
    var svg = document.getElementById("nd-edges");
    var box = document.getElementById("nd-graph-inner");
    var d = current();
    if (!svg || !box || !d) return;
    var origin = box.getBoundingClientRect();
    var pos = {};
    box.querySelectorAll("[data-card]").forEach(function (el) {
      var r = el.getBoundingClientRect();
      pos[el.dataset.card] = { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
    });
    var ids = nodeIdsOf(d);
    var sel = state.node;
    var out = [];
    ids.forEach(function (id) {
      var n = nodeOf(id);
      var b = pos[id];
      if (!b) return;
      var seen = {};
      [[n.reads, false], [n.optionalReads || [], true]].forEach(function (pair) {
        pair[0].forEach(function (k) {
          var w = writerOf(ids, k);
          if (!w || w === id || seen[w] || !pos[w]) return;
          var a = pos[w];
          var touches = sel === id || sel === w;
          var span = STAGE_INDEX[n.stage] - STAGE_INDEX[nodeOf(w).stage];
          if (pair[1] && !touches) return; // optionnelles : seulement pour le nœud sélectionné
          if (!touches && span > 2) return; // longues liaisons : seulement pour le nœud sélectionné
          if (sel && NODE[sel] && !touches && span > 1) return;
          seen[w] = true;
          var ax = a.x + a.w / 2, ay = a.y + a.h, bx = b.x + b.w / 2, by = b.y;
          if (by <= ay) return;
          var dy = Math.max(18, (by - ay) / 2);
          out.push(
            '<path d="M' + ax + "," + ay + " C" + ax + "," + (ay + dy) + " " + bx + "," + (by - dy) + " " + bx + "," + by + '" class="' +
              (touches ? "nd-edge nd-edge-sel" : "nd-edge") + (pair[1] ? " nd-edge-opt" : "") + '"/>',
          );
        });
      });
    });
    svg.setAttribute("viewBox", "0 0 " + origin.width + " " + origin.height);
    svg.innerHTML = out.join("");
  }

  /* ---------- fiche d'un nœud ---------- */

  function keyList(keys, ids, d, optional) {
    if (!keys.length) return "";
    var av = availKeys(ids, d.requirements.website);
    return keys.map(function (k) {
      var w = writerOf(ids, k);
      var ok = av[k];
      return (
        '<li class="flex items-start gap-2"><span class="mt-0.5 w-3.5 h-3.5 shrink-0 ' + (ok ? "text-emerald-600" : optional ? "text-zinc-300" : "text-rose-600") + '">' + (C.icons[ok ? "check" : optional ? "x" : "alert-circle"] || "") + "</span>" +
        "<span><b class=\"text-zinc-900\">" + esc(keyLabel(k)) + "</b>" + (w && ok ? ' <span class="text-zinc-500">· ' + esc(nodeOf(w).label) + "</span>" : !ok && !optional ? ' <span class="text-rose-700">· manquant</span>' : !ok ? ' <span class="text-zinc-400">· absent de ce besoin</span>' : "") + "</span></li>"
      );
    }).join("");
  }

  function nodePanel(d, id) {
    var n = nodeOf(id);
    var ids = nodeIdsOf(d);
    var edit = state.mode !== "view";
    var h = [];
    h.push('<div class="flex items-start gap-3"><span class="w-9 h-9 p-2 rounded-xl shrink-0" style="background:' + STAGE_COLOR[n.stage] + "1a;color:" + STAGE_COLOR[n.stage] + '">' + (C.icons[n.icon] || "") + "</span>");
    h.push('<div class="min-w-0"><h4 class="text-sm font-bold text-zinc-900">' + esc(n.label) + '</h4><p class="text-xs text-zinc-600 leading-relaxed">' + esc(n.description) + "</p></div></div>");
    var params = edit ? nodeParams(d, id) : nodeFacts(d, id);
    if (params) h.push('<div class="mt-4 space-y-4">' + params + "</div>");
    var reads = keyList(n.reads, ids, d, false);
    var opt = keyList(n.optionalReads || [], ids, d, true);
    var writes = n.writes.filter(function (k) { return !has(blockedKeys(d.requirements.website), k); });
    h.push('<div class="mt-4 pt-3 border-t border-zinc-100 grid sm:grid-cols-3 gap-4 text-xs">');
    h.push('<div><div class="nd-h">A besoin de</div><ul class="space-y-1">' + (reads || '<li class="text-zinc-500">Rien : point de départ</li>') + "</ul></div>");
    h.push('<div><div class="nd-h">Utilise s\'il existe</div><ul class="space-y-1">' + (opt || '<li class="text-zinc-500">—</li>') + "</ul></div>");
    h.push('<div><div class="nd-h">Ajoute au dossier</div><ul class="space-y-1">' + (writes.length ? writes.map(function (k) { return '<li><b class="text-zinc-900">' + esc(keyLabel(k)) + '</b> <span class="text-zinc-500">· ' + esc(C.keys[k].description) + "</span></li>"; }).join("") : '<li class="text-zinc-500">Rien : dernière étape</li>') + "</ul></div>");
    h.push("</div>");
    if (edit) {
      var variants = variantsOf(id).filter(function (v) { return v.binding.kind === n.binding.kind; });
      if (variants.length) {
        h.push('<div class="mt-4 pt-3 border-t border-zinc-100"><div class="nd-h">Remplacer par</div><div class="flex flex-wrap gap-2">' +
          variants.map(function (v) {
            var why = whyNot(d, v.id);
            return '<button type="button" data-replace="' + id + '" data-by="' + v.id + '"' + (why ? " disabled" : "") + ' class="nd-btn" title="' + esc(why || v.description) + '">' + ic(v.icon, "w-3.5 h-3.5") + " " + esc(v.label) + (why ? ' <span class="text-[10px] text-rose-600 font-normal">(' + esc(why) + ")</span>" : "") + "</button>";
          }).join("") + "</div></div>");
      }
    }
    return h.join("");
  }

  function seg(attr, value, options, current, extra) {
    return (
      '<div class="inline-flex flex-wrap rounded-lg border border-zinc-200 overflow-hidden text-xs font-semibold">' +
      options.map(function (o) {
        var on = String(current) === String(o[0]);
        return '<button type="button" ' + attr + '="' + esc(value) + '" data-v="' + esc(o[0]) + '"' + (extra || "") + ' class="px-2.5 py-1.5 border-r border-zinc-200 last:border-r-0 ' + (on ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50") + '" aria-pressed="' + on + '">' + esc(o[1]) + "</button>";
      }).join("") +
      "</div>"
    );
  }
  function field(label, html, hint) {
    return '<div><div class="nd-h">' + esc(label) + "</div>" + html + (hint ? '<p class="text-[11px] text-zinc-500 mt-1">' + esc(hint) + "</p>" : "") + "</div>";
  }
  function stepOptions(steps, none) {
    return [["", none]].concat(steps.map(function (s) { return [String(s), fmtNum(s)]; }));
  }
  function contactSeg(d, c) {
    var v = has(d.requirements.contacts.allOf || [], c) ? "all" : has(d.requirements.contacts.anyOf || [], c) ? "any" : "none";
    return seg("data-contact", c, [["all", "Obligatoire"], ["any", "Au moins un"], ["none", "Si trouvé"]], v);
  }

  function nodeParams(d, id) {
    var n = nodeOf(id);
    if (id === "maps_filter") {
      var l = d.requirements.listing || {};
      return (
        field("Site du prospect", seg("data-website", "w", [["optional", "Facultatif"], ["required", "Exigé"], ["forbidden", "Sans site"]], d.requirements.website), C.website[d.requirements.website].description) +
        '<div class="grid sm:grid-cols-2 gap-4">' +
        field("Note minimale", seg("data-listing", "minRating", stepOptions(C.listingSteps.rating, "Aucune"), l.minRating == null ? "" : l.minRating)) +
        field("Note maximale", seg("data-listing", "maxRating", stepOptions(C.listingSteps.rating, "Aucune"), l.maxRating == null ? "" : l.maxRating)) +
        field("Avis minimum", seg("data-listing", "minReviews", stepOptions(C.listingSteps.reviews, "Aucun"), l.minReviews == null ? "" : l.minReviews)) +
        field("Avis maximum", seg("data-listing", "maxReviews", [["", "Aucun"], ["0", "Sans avis"]].concat(C.listingSteps.reviews.map(function (s) { return [String(s), String(s)]; })), l.maxReviews == null ? "" : l.maxReviews), "Une fiche dont la note ou les avis sont inconnus n'est pas écartée.") +
        "</div>"
      );
    }
    if (id === "qualify") {
      if (!d.channels.length) return "";
      return field(
        "Contacts exigés",
        '<div class="space-y-2">' + d.channels.map(function (c) {
          return '<div class="flex flex-wrap items-center justify-between gap-2"><span class="text-xs font-semibold text-zinc-800">' + esc(channelLabel(c)) + "</span>" + contactSeg(d, c) + "</div>";
        }).join("") + "</div>",
        "« Obligatoire » : écarté sans ce contact. « Au moins un » : il en faut un parmi ceux marqués ainsi. « Si trouvé » : utilisé s'il existe.",
      );
    }
    if (n.binding.kind === "channel") {
      var c = n.binding.channel;
      var i = d.channels.indexOf(c);
      return (
        field("Exigé pour garder le lead", contactSeg(d, c)) +
        field(
          "Ordre de préférence",
          '<div class="flex items-center gap-2"><span class="text-xs font-bold text-zinc-900">' + (i + 1) + "e sur " + d.channels.length + "</span>" +
            '<button type="button" class="nd-btn" data-move="' + c + '" data-dir="-1"' + (i === 0 ? " disabled" : "") + ">Monter</button>" +
            '<button type="button" class="nd-btn" data-move="' + c + '" data-dir="1"' + (i === d.channels.length - 1 ? " disabled" : "") + ">Descendre</button></div>",
          "Le premier canal disponible pour un prospect devient son canal principal ; seul son message est rédigé.",
        )
      );
    }
    if (id === "demo_web") {
      var hl = d.proof.highlights || [];
      return (
        field("Angle", seg("data-set", "proof.focus", Object.keys(C.focus).map(function (k) { return [k, C.focus[k].label]; }), d.proof.focus), C.focus[d.proof.focus] ? C.focus[d.proof.focus].description : "") +
        field(
          "À mettre en avant",
          '<div class="flex flex-wrap gap-1.5">' + C.highlights.map(function (x) {
            var on = has(hl, x.id);
            return '<button type="button" data-hl="' + x.id + '" title="' + esc(x.description) + '" aria-pressed="' + on + '" class="nd-chip' + (on ? " nd-chip-on" : "") + '">' + (on ? "✓ " : "") + esc(x.label) + "</button>";
          }).join("") + "</div>",
          "Ajouté tel quel à la consigne de la démo.",
        ) +
        ctaField(d)
      );
    }
    if (id === "audit_report" || isReport(id)) return ctaField(d);
    if (id === "site_demo") return complementField(d);
    if (n.binding.kind === "pitch") {
      return (
        field("Ton des messages", seg("data-set", "commercial.tone", [["", "Par défaut"]].concat(C.messageTones.map(function (t) { return [t.id, t.label]; })), d.commercial.tone || ""), d.commercial.tone ? find(C.messageTones, function (t) { return t.id === d.commercial.tone; }).description : "Chaleureux et professionnel.") +
        field("Angle commercial (facultatif)", '<textarea id="nd-focusc" data-f="commercial.pitchFocus" rows="2" class="nd-input" placeholder="' + esc(d.label || "Repris du nom du besoin") + '">' + esc(d.commercial.pitchFocus === d.label ? "" : d.commercial.pitchFocus) + "</textarea>", "Vide : le nom du besoin sert d'angle.")
      );
    }
    if (id === "maps_search") return '<p class="text-xs text-zinc-600">La requête (métier) et la zone se choisissent au lancement du scan, dans l\'onglet Scanner.</p>';
    return "";
  }
  function complementField(d) {
    var m = find(C.complementDemo, function (x) { return x.id === complementMode(d); });
    return field(
      "Démo de site jointe au bilan",
      seg("data-set", "complementDemo", C.complementDemo.map(function (x) { return [x.id, x.label]; }), complementMode(d)),
      m ? m.description : "",
    );
  }
  function ctaField(d) {
    var presets = C.ctaPresets;
    var custom = !has(presets, d.proof.interestCta);
    return field(
      "Bouton d'intérêt montré au prospect",
      '<div class="flex flex-wrap gap-1.5">' + presets.map(function (p) {
        var on = d.proof.interestCta === p;
        return '<button type="button" data-cta="' + esc(p) + '" aria-pressed="' + on + '" class="nd-chip' + (on ? " nd-chip-on" : "") + '">' + esc(p) + "</button>";
      }).join("") +
        '<button type="button" data-cta="__custom" aria-pressed="' + custom + '" class="nd-chip' + (custom ? " nd-chip-on" : "") + '">Autre…</button></div>' +
        (custom ? '<input id="nd-cta" data-f="proof.interestCta" class="nd-input mt-2" value="' + esc(d.proof.interestCta) + '" placeholder="Texte du bouton">' : ""),
    );
  }

  /** Réglages d'un nœud en lecture seule. */
  function nodeFacts(d, id) {
    var n = nodeOf(id);
    var lines = [];
    if (id === "maps_filter" || id === "qualify" || n.binding.kind === "channel" || n.binding.kind === "proof" || n.binding.kind === "pitch") lines.push(nodeSummary(d, id));
    if (id === "demo_web") {
      (d.proof.highlights || []).forEach(function (h) { var x = find(C.highlights, function (e) { return e.id === h; }); if (x) lines.push("Met en avant : " + x.label); });
      lines.push("Bouton d'intérêt : « " + d.proof.interestCta + " »");
    }
    if (id === "audit_report" || isReport(id)) lines.push("Bouton d'intérêt : « " + d.proof.interestCta + " »");
    if (id === "site_demo") {
      lines.push("Démo jointe : " + complementLabel(d).toLowerCase());
      var cm = find(C.complementDemo, function (x) { return x.id === complementMode(d); });
      if (cm) lines.push(cm.description);
    }
    if (n.binding.kind === "pitch" && d.commercial.pitchFocus) lines.push("Angle : " + d.commercial.pitchFocus);
    if (!lines.length) return "";
    return '<ul class="text-xs text-zinc-700 space-y-1">' + lines.map(function (l) { return '<li class="flex gap-2"><span class="mt-1.5 w-1 h-1 rounded-full bg-zinc-400 shrink-0"></span><span>' + esc(l) + "</span></li>"; }).join("") + "</ul>";
  }

  /* ---------- identité ---------- */

  function identityPanel(d) {
    return (
      '<div class="space-y-4">' +
      '<div><label class="nd-h" for="nd-label">Nom du besoin</label><input id="nd-label" data-f="label" class="nd-input" value="' + esc(d.label) + '" placeholder="Ex. Menu en ligne pour restaurants"></div>' +
      field("Statut", seg("data-set", "status", Object.keys(C.status).map(function (k) { return [k, C.status[k].label]; }), d.status), C.status[d.status] ? C.status[d.status].description : "") +
      field("Couleur", '<div class="flex flex-wrap gap-1.5">' + Object.keys(TONES).map(function (t) {
        return '<button type="button" data-tone="' + t + '" aria-pressed="' + (d.badge.tone === t) + '" class="px-2.5 py-1 rounded-full border text-xs font-semibold ' + TONES[t].chip + (d.badge.tone === t ? " ring-2 ring-offset-1 ring-indigo-500" : "") + '">' + esc(C.tones[t].label) + "</button>";
      }).join("") + "</div>") +
      field("Icône", '<div class="flex flex-wrap gap-1.5">' + C.needIcons.map(function (n) {
        return '<button type="button" data-icon="' + n + '" title="' + n + '" aria-pressed="' + (d.icon === n) + '" class="w-8 h-8 p-1.5 rounded-lg border ' + (d.icon === n ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50") + '">' + (C.icons[n] || "") + "</button>";
      }).join("") + "</div>") +
      field("Modèle commercial", seg("data-set", "commercial.businessModel", Object.keys(C.businessModel).map(function (k) { return [k, C.businessModel[k].label]; }), d.commercial.businessModel)) +
      '<details class="text-xs"' + (state.mode === "create" && d._idTouched ? " open" : "") + '><summary class="cursor-pointer font-semibold text-zinc-500">Avancé : identifiant et badge</summary><div class="grid sm:grid-cols-2 gap-3 mt-2">' +
      '<div><label class="nd-h" for="nd-id">Identifiant</label><input id="nd-id" data-f="id" class="nd-input font-mono" value="' + esc(d.id) + '"' + (state.mode === "create" ? "" : " disabled") + '><span class="block text-[11px] text-zinc-500 mt-1">' + (state.mode === "create" ? "Déduit du nom ; non modifiable ensuite." : "Non modifiable : les leads le portent.") + "</span></div>" +
      '<div><label class="nd-h" for="nd-badge">Texte du badge</label><input id="nd-badge" data-f="badge.text" class="nd-input" value="' + esc(d.badge.text) + '"><span class="block text-[11px] text-zinc-500 mt-1">Repris du nom tant qu\'il n\'est pas modifié.</span></div>' +
      "</div></details></div>"
    );
  }

  /* ---------- résumé des prérequis ---------- */

  function prereqLines(d) {
    var out = [];
    var w = C.website[d.requirements.website];
    out.push([w.label, "Filtre Maps"]);
    var l = d.requirements.listing || {};
    if (l.minRating != null || l.maxRating != null) out.push(["Note " + (l.minRating != null ? "≥ " + fmtNum(l.minRating) : "") + (l.minRating != null && l.maxRating != null ? " et " : "") + (l.maxRating != null ? "≤ " + fmtNum(l.maxRating) : ""), "Filtre Maps"]);
    if (l.minReviews != null || l.maxReviews != null) out.push([(l.maxReviews === 0 ? "Aucun avis" : "Avis " + (l.minReviews != null ? "≥ " + l.minReviews : "") + (l.minReviews != null && l.maxReviews != null ? " et " : "") + (l.maxReviews != null ? "≤ " + l.maxReviews : "")), "Filtre Maps"]);
    (d.requirements.contacts.allOf || []).forEach(function (c) { out.push([channelLabel(c) + " obligatoire", c === "phone" ? "Filtre Maps" : "Qualification"]); });
    var any = d.requirements.contacts.anyOf || [];
    if (any.length) out.push(["Au moins : " + list(any.map(channelLabel)).toLowerCase(), "Qualification"]);
    return out;
  }
  function prereqHtml(d) {
    var hl = d.proof.kind === "demo_web" ? (d.proof.highlights || []).map(function (h) { var x = find(C.highlights, function (e) { return e.id === h; }); return x ? x.label : h; }) : [];
    return (
      '<h3 class="text-sm font-bold text-zinc-900 mb-3">Ce que ce besoin exige</h3><ul class="space-y-2">' +
      prereqLines(d).map(function (l) { return '<li class="text-xs"><span class="block font-semibold text-zinc-900">' + esc(l[0]) + '</span><span class="block text-zinc-500">' + esc(l[1]) + "</span></li>"; }).join("") +
      "</ul>" +
      '<div class="mt-4 pt-3 border-t border-zinc-100 text-xs text-zinc-600 space-y-1">' +
      '<p><b class="text-zinc-900">Premier contact :</b> ' + esc(d.channels.map(channelLabel).join(", puis ") || "aucun canal") + "</p>" +
      '<p><b class="text-zinc-900">Preuve :</b> ' + esc(d.proof.kind === "demo_web" ? C.proof.demo_web.label + " (" + C.focus[d.proof.focus].label.toLowerCase() + ")" : C.proof[d.proof.kind] ? C.proof[d.proof.kind].label : d.proof.kind) + "</p>" +
      (isReport(d.proof.kind) ? '<p><b class="text-zinc-900">Démo de site jointe :</b> ' + esc(complementLabel(d).toLowerCase()) + "</p>" : "") +
      (hl.length ? '<p><b class="text-zinc-900">Met en avant :</b> ' + esc(hl.join(", ").toLowerCase()) + "</p>" : "") +
      '<p><b class="text-zinc-900">Ton :</b> ' + esc(d.commercial.tone ? toneLabel(d.commercial.tone) : "par défaut") + "</p>" +
      '<p><b class="text-zinc-900">Modèle :</b> ' + esc(C.businessModel[d.commercial.businessModel].label) + "</p>" +
      "</div>"
    );
  }
  function summaryLine(def) {
    var parts = [C.website[def.requirements.website].label];
    var allOf = def.requirements.contacts.allOf || [];
    var anyOf = def.requirements.contacts.anyOf || [];
    if (allOf.length) parts.push(allOf.map(channelLabel).join(" + "));
    if (anyOf.length) parts.push(list(anyOf.map(channelLabel)));
    return parts.join(" · ");
  }

  /* ---------- rendu ---------- */

  function render() {
    var def = current();
    root.innerHTML =
      '<div class="grid lg:grid-cols-[16rem_minmax(0,1fr)] gap-5 items-start">' +
      '<aside class="space-y-3">' +
      '<div class="flex items-center justify-between"><h2 class="text-sm font-bold text-zinc-900">Besoins</h2>' +
      '<button type="button" data-act="new" class="text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg px-3 py-1.5">Nouveau besoin</button></div>' +
      '<div id="nd-list" class="space-y-2"></div></aside>' +
      '<div class="min-w-0 space-y-4">' +
      (def
        ? '<div id="nd-header" class="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5"></div>' +
          '<div id="nd-errors"></div>' +
          '<div class="grid 2xl:grid-cols-[minmax(0,1fr)_24rem] gap-4 items-start">' +
          '<div class="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-4 min-w-0">' +
          '<div class="flex flex-wrap items-center justify-between gap-2 mb-1"><h3 class="text-sm font-bold text-zinc-900">Workflow</h3><span class="text-[11px] text-zinc-500">' +
          (state.mode === "view" ? "Cliquez un nœud pour voir ce qu'il lit et ajoute au dossier" : "Cliquez un nœud pour le régler · « + Ajouter » complète une étape, ses prérequis suivent") + "</span></div>" +
          '<div id="nd-notice"></div><div id="nd-graph" class="overflow-x-auto"></div></div>' +
          '<div class="space-y-4 min-w-0"><div id="nd-panel"></div><div id="nd-prereq" class="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-4"></div></div>' +
          "</div>"
        : '<div class="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-8 text-sm text-zinc-500">Aucun besoin. Créez-en un.</div>') +
      "</div></div>";
    renderList();
    if (def) renderAll();
  }
  function renderAll() {
    renderHeader();
    renderErrors();
    renderNotice();
    renderGraph();
    renderPanel();
    renderPrereq();
  }

  function renderList() {
    var el = document.getElementById("nd-list");
    if (!el) return;
    var groups = [["active", "Actifs"], ["draft", "Brouillons"], ["archived", "Archivés"]];
    el.innerHTML = groups
      .map(function (g) {
        var items = state.items.filter(function (it) { return it.def.status === g[0]; });
        if (!items.length) return "";
        return (
          '<div class="space-y-2"><div class="text-[11px] font-semibold text-zinc-500 pt-1">' + g[1] + "</div>" +
          items.map(function (it) {
            var d = it.def;
            var sel = d.id === state.selectedId && state.mode !== "create";
            var tone = TONES[d.badge.tone] || TONES.zinc;
            return (
              '<button type="button" data-select="' + esc(d.id) + '" class="w-full text-left rounded-xl border p-3 transition-all ' + (sel ? "border-zinc-900 bg-white shadow-sm ring-1 ring-zinc-900" : "border-zinc-200 bg-white hover:border-zinc-300") + '">' +
              '<div class="flex items-start gap-2.5"><span class="w-8 h-8 p-1.5 rounded-lg shrink-0" style="background:' + tone.dot + "1a;color:" + tone.dot + '">' + (C.icons[d.icon] || "") + "</span>" +
              '<span class="min-w-0 flex-1"><span class="block text-sm font-semibold text-zinc-900 leading-snug">' + esc(d.label) + "</span>" +
              '<span class="block text-[11px] text-zinc-500 mt-0.5">' + esc(summaryLine(d)) + "</span>" +
              '<span class="block text-[11px] text-zinc-400 mt-0.5">' + it.leads + " lead" + (it.leads > 1 ? "s" : "") + "</span></span></div></button>"
            );
          }).join("") +
          "</div>"
        );
      })
      .join("");
  }

  function renderHeader() {
    var el = document.getElementById("nd-header");
    if (!el) return;
    var d = current();
    var it = currentItem();
    var tone = TONES[d.badge.tone] || TONES.zinc;
    var actions =
      state.mode === "view"
        ? '<button type="button" data-act="edit" class="text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg px-3 py-2">Modifier</button>' +
          '<button type="button" data-act="duplicate" class="text-xs font-semibold border border-zinc-200 hover:bg-zinc-50 text-zinc-800 rounded-lg px-3 py-2">Dupliquer</button>' +
          '<button type="button" data-act="history" class="text-xs font-semibold border border-zinc-200 hover:bg-zinc-50 text-zinc-800 rounded-lg px-3 py-2">Historique</button>'
        : '<button type="button" data-node="identity" class="text-xs font-semibold border ' + (state.node === "identity" ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-zinc-200 hover:bg-zinc-50 text-zinc-800") + ' rounded-lg px-3 py-2">Nom, statut, couleur</button>' +
          '<button type="button" data-act="save"' + (state.errors.length || state.saving ? " disabled" : "") + ' class="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white rounded-lg px-3 py-2">' + (state.saving ? "Enregistrement…" : state.mode === "create" ? "Créer le besoin" : "Enregistrer") + "</button>" +
          '<button type="button" data-act="cancel" class="text-xs font-semibold border border-zinc-200 hover:bg-zinc-50 text-zinc-800 rounded-lg px-3 py-2">Annuler</button>';
    el.innerHTML =
      '<div class="flex flex-wrap items-start justify-between gap-3"><div class="flex items-start gap-3 min-w-0">' +
      '<span class="w-11 h-11 p-2.5 rounded-xl shrink-0" style="background:' + tone.dot + "1a;color:" + tone.dot + '">' + (C.icons[d.icon] || "") + "</span>" +
      '<div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><h2 class="text-lg font-bold text-zinc-900 leading-tight">' + esc(d.label || "Nouveau besoin") + "</h2>" +
      '<span class="px-2 py-0.5 rounded-full border text-[11px] font-semibold ' + STATUS_CHIP[d.status] + '">' + esc(C.status[d.status] ? C.status[d.status].label : d.status) + "</span>" +
      (d.badge.text ? '<span class="px-2 py-0.5 rounded-full border text-[11px] font-semibold ' + tone.chip + '">' + esc(d.badge.text) + "</span>" : "") +
      "</div>" +
      '<p class="text-xs text-zinc-500 mt-1"><span class="font-mono">' + esc(d.id || "identifiant à définir") + "</span>" +
      (it && state.mode !== "create" ? " · version " + it.version + (it.updated_by ? ", modifiée par " + esc(it.updated_by === "code" ? "le code initial" : it.updated_by) : "") + (it.updated_at ? " le " + esc(fmtDate(it.updated_at)) : "") + " · " + it.leads + " lead" + (it.leads > 1 ? "s" : "") : "") +
      "</p>" +
      (state.mode === "edit" ? '<p class="text-xs text-amber-700 mt-1">Modification en cours : les scans suivants utiliseront la nouvelle version, les leads existants ne changent pas.</p>' : "") +
      "</div></div>" +
      '<div class="flex flex-wrap gap-2">' + actions + "</div></div>" +
      (state.message ? '<p class="mt-3 text-xs font-medium ' + (state.message.tone === "ok" ? "text-emerald-700" : "text-rose-700") + '">' + esc(state.message.text) + "</p>" : "") +
      (state.history ? historyHtml() : "");
  }

  function historyHtml() {
    if (state.history === "loading") return '<p class="mt-3 text-xs text-zinc-500">Chargement de l\'historique…</p>';
    if (!state.history.length) return '<p class="mt-3 text-xs text-zinc-500">Aucune version antérieure.</p>';
    return (
      '<div class="mt-4 border-t border-zinc-100 pt-3"><h4 class="text-xs font-bold text-zinc-900 mb-2">Versions antérieures</h4><ul class="space-y-1.5">' +
      state.history.map(function (h, i) {
        return (
          '<li class="flex flex-wrap items-center justify-between gap-2 text-xs"><span class="text-zinc-700">Version ' + h.version + " · " + esc(fmtDate(h.changed_at)) + (h.definition ? " · " + esc(h.definition.label) : "") + "</span>" +
          (h.definition ? '<button type="button" data-restore="' + i + '" class="font-semibold text-indigo-700 hover:underline">Reprendre cette version</button>' : "") +
          "</li>"
        );
      }).join("") +
      "</ul></div>"
    );
  }

  function renderErrors() {
    var el = document.getElementById("nd-errors");
    if (!el) return;
    if (state.mode === "view" || !state.errors.length) {
      el.innerHTML = "";
    } else {
      el.innerHTML =
        '<div class="bg-rose-50 border border-rose-200 rounded-2xl p-4"><p class="text-xs font-bold text-rose-800 mb-1.5">À corriger avant d\'enregistrer</p><ul class="text-xs text-rose-800 space-y-1 list-disc pl-4">' +
        state.errors.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") +
        "</ul></div>";
    }
    var btn = root.querySelector('[data-act="save"]');
    if (btn) btn.disabled = !!(state.errors.length || state.saving);
  }

  function renderNotice() {
    var el = document.getElementById("nd-notice");
    if (!el) return;
    if (state.confirm) {
      el.innerHTML =
        '<div class="my-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert"><span>' + esc(state.confirm.text) + "</span>" +
        '<span class="flex gap-2"><button type="button" data-act="confirm" class="font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-2.5 py-1">Confirmer</button><button type="button" data-act="dismiss" class="font-semibold border border-amber-300 rounded-lg px-2.5 py-1 hover:bg-amber-100">Annuler</button></span></div>';
      return;
    }
    el.innerHTML = state.notice
      ? '<div class="my-2 flex items-start justify-between gap-2 rounded-xl border px-3 py-2 text-xs ' + (state.notice.tone === "ok" ? "border-indigo-200 bg-indigo-50 text-indigo-900" : "border-rose-200 bg-rose-50 text-rose-800") + '" role="status"><span>' + esc(state.notice.text) + '</span><button type="button" data-act="dismiss" class="text-current opacity-60 hover:opacity-100" aria-label="Fermer">×</button></div>'
      : "";
  }

  var resizeObs = null;
  function renderGraph() {
    var el = document.getElementById("nd-graph");
    if (!el) return;
    el.innerHTML = graphHtml(current());
    drawEdges();
    if (window.ResizeObserver) {
      if (resizeObs) resizeObs.disconnect();
      resizeObs = new ResizeObserver(function () { drawEdges(); });
      var inner = document.getElementById("nd-graph-inner");
      if (inner) resizeObs.observe(inner);
    }
  }

  function renderPrereq() {
    var el = document.getElementById("nd-prereq");
    if (el) el.innerHTML = prereqHtml(current());
  }

  function renderPanel() {
    var el = document.getElementById("nd-panel");
    if (!el) return;
    var d = current();
    var body;
    if (state.node === "identity" && state.mode !== "view") body = '<h4 class="text-sm font-bold text-zinc-900 mb-3">Nom, statut et couleur</h4>' + identityPanel(d);
    else if (state.node && NODE[state.node] && has(nodeIdsOf(d), state.node)) body = nodePanel(d, state.node);
    else body = '<p class="text-xs text-zinc-500">' + (state.mode === "view" ? "Cliquez un nœud du workflow pour voir ce qu'il fait, ce dont il a besoin et ce qu'il ajoute au dossier du prospect." : "Cliquez un nœud pour le régler, ou « Nom, statut, couleur » pour la fiche du besoin.") + "</p>";
    el.innerHTML = '<div class="bg-white rounded-2xl border ' + (state.node ? "border-indigo-200" : "border-zinc-200/80") + ' shadow-sm p-5">' + body + "</div>";
  }

  /* ---------- événements ---------- */

  function setPath(obj, path, value) {
    var parts = path.split(".");
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    if (value === undefined) delete o[parts[parts.length - 1]];
    else o[parts[parts.length - 1]] = value;
  }
  function setContact(d, channel, v) {
    var allOf = (d.requirements.contacts.allOf || []).filter(function (c) { return c !== channel; });
    var anyOf = (d.requirements.contacts.anyOf || []).filter(function (c) { return c !== channel; });
    if (v === "all") allOf.push(channel);
    if (v === "any") anyOf.push(channel);
    var contacts = {};
    if (allOf.length) contacts.allOf = allOf;
    if (anyOf.length) contacts.anyOf = anyOf;
    d.requirements.contacts = contacts;
  }
  function changed() {
    renderAll();
    renderList();
    scheduleValidation();
  }
  function selectNode(id) {
    state.node = state.node === id ? null : id;
    state.palette = null;
    renderAll();
    var panel = document.getElementById("nd-panel");
    if (panel && state.node && window.innerWidth < 1536) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  root.addEventListener("click", function (e) {
    var t = e.target.closest("button, [data-node]");
    if (!t || !root.contains(t) || t.disabled) return;
    var d = state.draft;

    if (t.dataset.select) {
      if (state.mode !== "view" && !confirm("Abandonner les modifications en cours ?")) return;
      resetEditing();
      state.message = null;
      state.selectedId = t.dataset.select;
      render();
      return;
    }
    if (d && t.dataset.remove) {
      var plan = planRemove(d, t.dataset.remove);
      plan.subjects = [t.dataset.remove];
      var rl = nodeOf(t.dataset.remove).label;
      commit(d, plan, d.requirements.website, { ask: "Retirer « " + rl + " »", done: "« " + rl + " » retiré" });
      return;
    }
    if (t.dataset.node) {
      selectNode(t.dataset.node);
      return;
    }
    switch (t.dataset.act) {
      case "new":
        if (state.mode !== "view" && !confirm("Abandonner les modifications en cours ?")) return;
        startCreate(null);
        return;
      case "edit":
        startEdit();
        return;
      case "duplicate":
        startCreate(current());
        return;
      case "cancel":
        cancelEdit();
        return;
      case "save":
        save();
        return;
      case "confirm":
        if (state.confirm) state.confirm.apply();
        return;
      case "dismiss":
        state.confirm = null;
        state.notice = null;
        renderNotice();
        return;
      case "history":
        if (state.history) {
          state.history = null;
          renderHeader();
          return;
        }
        state.history = "loading";
        renderHeader();
        fetch("/api/admin/opportunities/" + encodeURIComponent(state.selectedId) + "/history")
          .then(function (r) { return r.json(); })
          .then(function (res) { state.history = res.history || []; renderHeader(); })
          .catch(function () { state.history = []; renderHeader(); });
        return;
    }
    if (t.dataset.restore !== undefined && Array.isArray(state.history)) {
      var h = state.history[Number(t.dataset.restore)];
      var it = currentItem();
      if (!h || !h.definition || !it) return;
      resetEditing();
      state.mode = "edit";
      state.draft = clone(h.definition);
      state.draft.id = it.def.id;
      state.baseVersion = it.version;
      state.message = { tone: "ok", text: "Version " + h.version + " chargée : vérifiez puis enregistrez pour la rétablir." };
      render();
      scheduleValidation();
      return;
    }
    if (!d) return;
    if (t.dataset.palette) {
      state.palette = state.palette === t.dataset.palette ? null : t.dataset.palette;
      renderGraph();
      return;
    }
    if (t.dataset.add) {
      var add = planAdd(d, t.dataset.add);
      add.subjects = [t.dataset.add];
      state.palette = null;
      state.node = t.dataset.add;
      commit(d, add, d.requirements.website, { ask: "", done: "« " + nodeOf(t.dataset.add).label + " » ajouté" }, true);
      return;
    }
    if (t.dataset.replace) {
      var rep = planReplace(d, t.dataset.replace, t.dataset.by);
      rep.subjects = [t.dataset.replace, t.dataset.by];
      state.node = t.dataset.by;
      commit(d, rep, d.requirements.website, { ask: "", done: "« " + nodeOf(t.dataset.by).label + " » remplace « " + nodeOf(t.dataset.replace).label + " »" }, true);
      return;
    }
    if (t.dataset.website) {
      var w = t.dataset.v;
      if (w === d.requirements.website) return;
      var pw = planWebsite(d, w);
      commit(d, pw, w, { ask: "Passer à « " + C.website[w].label + " »", done: "Site : " + C.website[w].label.toLowerCase() });
      return;
    }
    if (t.dataset.listing) {
      var l = d.requirements.listing || {};
      if (t.dataset.v === "") delete l[t.dataset.listing];
      else l[t.dataset.listing] = Number(t.dataset.v);
      if (Object.keys(l).length) d.requirements.listing = l;
      else delete d.requirements.listing;
      changed();
      return;
    }
    if (t.dataset.set) {
      setPath(d, t.dataset.set, t.dataset.v === "" ? undefined : t.dataset.v);
      changed();
      return;
    }
    if (t.dataset.hl) {
      var hl = (d.proof.highlights || []).slice();
      var at = hl.indexOf(t.dataset.hl);
      if (at >= 0) hl.splice(at, 1);
      else hl.push(t.dataset.hl);
      if (hl.length) d.proof.highlights = hl;
      else delete d.proof.highlights;
      changed();
      return;
    }
    if (t.dataset.cta) {
      if (t.dataset.cta === "__custom") {
        if (has(C.ctaPresets, d.proof.interestCta)) d.proof.interestCta = "";
      } else d.proof.interestCta = t.dataset.cta;
      changed();
      var cta = document.getElementById("nd-cta");
      if (cta) cta.focus();
      return;
    }
    if (t.dataset.tone) {
      d.badge.tone = t.dataset.tone;
      changed();
      return;
    }
    if (t.dataset.icon) {
      d.icon = t.dataset.icon;
      changed();
      return;
    }
    if (t.dataset.contact) {
      setContact(d, t.dataset.contact, t.dataset.v);
      changed();
      return;
    }
    if (t.dataset.move) {
      var i = d.channels.indexOf(t.dataset.move);
      var j = i + Number(t.dataset.dir);
      if (i < 0 || j < 0 || j >= d.channels.length) return;
      var tmp = d.channels[i];
      d.channels[i] = d.channels[j];
      d.channels[j] = tmp;
      changed();
    }
  });

  root.addEventListener("keydown", function (e) {
    var g = e.target.closest && e.target.closest("[data-node]");
    if (g && g.tagName !== "BUTTON" && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      selectNode(g.dataset.node);
    }
  });

  // Champs texte : pris en compte à la saisie, sans redessiner le formulaire (le champ garde le focus).
  root.addEventListener("input", function (e) {
    var t = e.target;
    var d = state.draft;
    if (!d || !t.dataset || !t.dataset.f) return;
    var v = t.value;
    setPath(d, t.dataset.f, v);
    if (t.dataset.f === "label") {
      if (state.mode === "create" && !d._idTouched) {
        d.id = slug(v);
        var idInput = document.getElementById("nd-id");
        if (idInput) idInput.value = d.id;
      }
      if (!d._badgeTouched) {
        d.badge.text = v;
        var b = document.getElementById("nd-badge");
        if (b) b.value = v;
      }
    }
    if (t.dataset.f === "id") d._idTouched = true;
    if (t.dataset.f === "badge.text") d._badgeTouched = true;
    if (t.dataset.f === "commercial.pitchFocus" && !v.trim()) d.commercial.pitchFocus = "";
    renderHeader();
    renderGraph();
    renderPrereq();
    scheduleValidation();
  });

  window.addEventListener("beforeunload", function (e) {
    if (state.mode !== "view") {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /* ---------- styles ---------- */

  var style = document.createElement("style");
  style.textContent =
    ".nd-row{display:grid;grid-template-columns:6.5rem minmax(0,1fr);gap:.75rem;align-items:center;padding:.6rem 0;border-top:1px dashed #f0f0f2}" +
    ".nd-row:first-child{border-top:0}" +
    ".nd-stage{font-size:11px;font-weight:600;color:#71717a;line-height:1.2}" +
    ".nd-cards{display:flex;flex-wrap:wrap;justify-content:center;gap:.6rem;position:relative;z-index:1}" +
    ".nd-card{position:relative;width:10.5rem;min-height:3.6rem;padding:.55rem .7rem .55rem .9rem;background:#fff;border:1px solid #e4e4e7;border-radius:.85rem;box-shadow:0 1px 3px rgba(24,24,27,.06);cursor:pointer;outline:none;text-align:left;transition:border-color .15s,box-shadow .15s,opacity .15s,transform .15s}" +
    ".nd-card:hover{border-color:#a1a1aa}" +
    ".nd-card:focus-visible{box-shadow:0 0 0 3px rgba(99,102,241,.35)}" +
    ".nd-sel{border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.25);background:#fafaff}" +
    ".nd-rel{border-color:#c7d2fe}" +
    ".nd-dim{opacity:.45}" +
    ".nd-miss{border-color:#fda4af;background:#fff1f2}" +
    ".nd-bar{position:absolute;left:0;top:.7rem;bottom:.7rem;width:3px;border-radius:2px}" +
    ".nd-label{min-width:0;overflow-wrap:anywhere}" +
    ".nd-title{display:flex;align-items:flex-start;gap:6px;font-size:12px;font-weight:700;color:#18181b;line-height:1.2;padding-right:.9rem}" +
    ".nd-icon{width:14px;height:14px;flex:none;display:inline-block;margin-top:1px}" +
    ".nd-sub{display:block;font-size:10.5px;color:#52525b;line-height:1.3;margin-top:3px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}" +
    ".nd-miss .nd-sub{color:#be123c}" +
    ".nd-x{position:absolute;top:.35rem;right:.35rem;width:18px;height:18px;padding:3px;border-radius:6px;color:#a1a1aa;opacity:0;transition:opacity .15s}" +
    ".nd-card:hover .nd-x,.nd-card:focus-within .nd-x,.nd-sel .nd-x{opacity:1}" +
    ".nd-x:hover{background:#fee2e2;color:#be123c}" +
    "@media (hover:none){.nd-x{opacity:1}}" +
    ".nd-add{align-self:center;min-height:3.6rem;padding:0 .9rem;border:1px dashed #c7c7cf;border-radius:.85rem;font-size:11.5px;font-weight:600;color:#4f46e5;background:#fafafa}" +
    ".nd-add:hover,.nd-add-open{border-color:#6366f1;background:#eef2ff}" +
    ".nd-palette{display:grid;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr));gap:.5rem;margin:.1rem 0 .7rem 7.25rem;padding:.6rem;border:1px solid #e0e7ff;background:#f8f9ff;border-radius:.9rem;position:relative;z-index:2}" +
    "@media (max-width:640px){.nd-palette{margin-left:0}.nd-row{grid-template-columns:1fr}.nd-stage{text-align:center}}" +
    ".nd-pal-item{display:flex;gap:.55rem;align-items:flex-start;text-align:left;padding:.55rem .6rem;border:1px solid #e4e4e7;border-radius:.7rem;background:#fff}" +
    ".nd-pal-item:hover:not(:disabled){border-color:#6366f1}" +
    ".nd-pal-item:disabled{opacity:.6;cursor:not-allowed}" +
    ".nd-pal-item .nd-icon{margin-top:2px}" +
    ".nd-edge{fill:none;stroke:#d4d4d8;stroke-width:1.4}" +
    ".nd-edge-sel{stroke:#6366f1;stroke-width:2;stroke-dasharray:5 5;animation:nd-flow 1.1s linear infinite}" +
    ".nd-edge-opt{stroke-dasharray:2 4;stroke-width:1.4;animation:none}" +
    "@keyframes nd-flow{to{stroke-dashoffset:-20}}" +
    "@media (prefers-reduced-motion:reduce){.nd-edge-sel{animation:none}.nd-card{transition:none}}" +
    ".nd-h{display:block;font-size:11px;font-weight:700;color:#3f3f46;margin-bottom:.35rem}" +
    ".nd-input{width:100%;border:1px solid #e4e4e7;border-radius:.6rem;padding:.45rem .7rem;font-size:13px;background:#fff}" +
    ".nd-input:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.2)}" +
    ".nd-input:disabled{background:#f4f4f5;color:#71717a}" +
    ".nd-chip{padding:.3rem .6rem;border:1px solid #e4e4e7;border-radius:999px;font-size:11.5px;font-weight:600;color:#3f3f46;background:#fff}" +
    ".nd-chip:hover{border-color:#a1a1aa}" +
    ".nd-chip-on{border-color:#6366f1;background:#eef2ff;color:#3730a3}" +
    ".nd-btn{display:inline-flex;align-items:center;gap:.35rem;padding:.35rem .65rem;border:1px solid #e4e4e7;border-radius:.55rem;font-size:11.5px;font-weight:600;color:#27272a;background:#fff}" +
    ".nd-btn:hover:not(:disabled){background:#f4f4f5}" +
    ".nd-btn:disabled{opacity:.45;cursor:not-allowed}";
  document.head.appendChild(style);

  load(new URLSearchParams(location.search).get("need"));
})();
