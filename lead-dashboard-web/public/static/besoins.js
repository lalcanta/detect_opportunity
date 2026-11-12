/*
 * Onglet admin « Besoins » : liste, fiche, graphe du workflow de collecte et édition des besoins.
 * Données : GET /api/admin/opportunities ; validation en direct : POST /api/admin/opportunities/validate ;
 * enregistrement : POST /api/admin/opportunities. Catalogue des briques : <script id="needs-catalog">.
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
  var DEFAULT_PITCH = { phone: "llm_phone_battlecard", email: "llm_cold_email", contact_form: "llm_cold_email" };

  var state = {
    items: [],
    selectedId: null,
    mode: "view", // view | edit | create
    draft: null,
    baseVersion: 0,
    errors: [],
    saving: false,
    message: null,
    node: null,
    history: null,
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
    return '<span class="inline-block ' + (cls || "w-4 h-4") + '">' + (C.icons[name] || "") + "</span>";
  }
  function channelLabel(id) {
    var c = C.channels.find(function (x) { return x.id === id; });
    return c ? c.label : id;
  }
  function moduleEntry(id) {
    return C.modules.find(function (x) { return x.id === id; }) || { label: id, description: "" };
  }
  function pitchEntry(id) {
    return C.pitch.find(function (x) { return x.id === id; }) || { label: id, description: "" };
  }
  function current() {
    if (state.mode !== "view" && state.draft) return state.draft;
    var it = state.items.find(function (x) { return x.def.id === state.selectedId; });
    return it ? it.def : null;
  }
  function currentItem() {
    return state.items.find(function (x) { return x.def.id === state.selectedId; }) || null;
  }
  function list(arr) {
    if (arr.length <= 1) return arr.join("");
    return arr.slice(0, -1).join(", ") + " ou " + arr[arr.length - 1];
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

  /** Prérequis d'un besoin, en phrases simples, avec l'étape où ils sont vérifiés. */
  function requirementLines(def) {
    var out = [];
    var w = C.website[def.requirements.website];
    out.push({ text: w.label, detail: w.description, stage: "Filtre Maps" });
    var allOf = def.requirements.contacts.allOf || [];
    var anyOf = def.requirements.contacts.anyOf || [];
    allOf.forEach(function (c) {
      out.push({ text: channelLabel(c) + " obligatoire", detail: "", stage: c === "phone" ? "Filtre Maps" : "Après inspection du site" });
    });
    if (anyOf.length) {
      var onlyPhone = anyOf.every(function (c) { return c === "phone"; });
      out.push({
        text: "Au moins un contact parmi : " + anyOf.map(channelLabel).join(", ").toLowerCase(),
        detail: "",
        stage: onlyPhone ? "Filtre Maps" : "Après inspection du site",
      });
    }
    return out;
  }
  function summaryLine(def) {
    var parts = [C.website[def.requirements.website].label];
    var allOf = def.requirements.contacts.allOf || [];
    var anyOf = def.requirements.contacts.anyOf || [];
    if (allOf.length) parts.push(allOf.map(channelLabel).join(" + "));
    if (anyOf.length) parts.push(list(anyOf.map(channelLabel)));
    return parts.join(" · ");
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
  function scheduleValidation() {
    clearTimeout(validateTimer);
    validateTimer = setTimeout(function () {
      var sent = JSON.stringify(state.draft);
      fetch("/api/admin/opportunities/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition: state.draft }),
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
      body: JSON.stringify({ definition: state.draft, version: version }),
    })
      .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        state.saving = false;
        if (res.body && res.body.ok) {
          var id = state.draft.id;
          state.mode = "view";
          state.draft = null;
          state.errors = [];
          state.history = null;
          state.node = null;
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

  function startEdit() {
    var it = currentItem();
    if (!it) return;
    state.mode = "edit";
    state.draft = clone(it.def);
    state.baseVersion = it.version;
    state.errors = [];
    state.message = null;
    if (!state.node) state.node = "identity";
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
          proof: { kind: "demo_web", generator: "llm_demo", focus: "showcase", interestCta: "Ce site me plaît, on en discute" },
          pitch: { phone: "llm_phone_battlecard" },
          flyer: false,
          commercial: { businessModel: "one_shot", pitchFocus: "" },
        };
    if (from) {
      base.id = (from.id + "_copie").slice(0, 41);
      base.label = from.label + " (copie)";
      base.status = "draft";
    }
    state.mode = "create";
    state.draft = base;
    state.baseVersion = 0;
    state.errors = [];
    state.message = null;
    state.node = "identity";
    render();
    scheduleValidation();
  }
  function cancelEdit() {
    if (state.mode === "create" && !state.selectedId && state.items.length) state.selectedId = state.items[0].def.id;
    state.mode = "view";
    state.node = null;
    state.draft = null;
    state.errors = [];
    render();
  }
  function changed() {
    renderGraph();
    renderPrereq();
    scheduleValidation();
  }

  /* ---------- graphe ---------- */

  var NW = 176, NH = 92, GX = 34, PAD = 18;
  var LANE1 = 46, LANE2 = 214;

  function graphModel(def) {
    var forbidden = def.requirements.website === "forbidden";
    var allOf = def.requirements.contacts.allOf || [];
    var anyOf = def.requirements.contacts.anyOf || [];
    var needsInspection = allOf.concat(anyOf).some(function (c) { return c !== "phone"; });
    var phoneReq = allOf.indexOf("phone") >= 0;
    var filterLines = [C.website[def.requirements.website].label];
    if (phoneReq) filterLines.push("Téléphone obligatoire");
    else if (anyOf.length && anyOf.every(function (c) { return c === "phone"; })) filterLines.push("Téléphone obligatoire");
    else filterLines.push("Pas de contact exigé ici");
    var qualLines = [];
    allOf.filter(function (c) { return c !== "phone"; }).forEach(function (c) { qualLines.push(channelLabel(c) + " obligatoire"); });
    if (anyOf.length && !anyOf.every(function (c) { return c === "phone"; })) qualLines.push("Au moins : " + list(anyOf.map(channelLabel)).toLowerCase());
    var proofLines =
      def.proof.kind === "demo_web"
        ? [C.proof.demo_web.label, "Angle : " + (C.focus[def.proof.focus] ? C.focus[def.proof.focus].label : def.proof.focus)]
        : [C.proof.audit_report.label, "Sans modèle de langage"];
    if (def.flyer) proofLines.push("Flyer PDF joint");

    var nodes = [
      { id: "maps", col: 0, lane: 1, icon: "search", title: "Recherche Maps", lines: ["Requête et zone du scan", "Fiches Google Maps"], group: "collect" },
      { id: "filter", col: 1, lane: 1, icon: "sliders", title: "Filtre Maps", lines: filterLines, group: "collect" },
      {
        id: "inspect", col: 2, lane: 1, icon: "eye", title: "Inspection du site",
        lines: forbidden ? ["Ignorée : prospects sans site"] : [def.scanModules.length + " vérification" + (def.scanModules.length > 1 ? "s" : ""), def.scanModules.slice(0, 2).map(function (m) { return moduleEntry(m).label; }).join(", ")],
        off: forbidden, group: "collect",
      },
      {
        id: "qualify", col: 3, lane: 1, icon: "check-circle", title: "Qualification finale",
        lines: needsInspection ? qualLines : ["Rien de plus à vérifier", "Décidé dès le filtre Maps"],
        off: !needsInspection, group: "qualify",
      },
      {
        id: "channel", col: 4, lane: 1, icon: "arrow-right", title: "Canal principal",
        lines: def.channels.map(function (c, i) { return (i + 1) + ". " + channelLabel(c); }), group: "qualify",
      },
      { id: "proof", col: 4, lane: 2, icon: def.proof.kind === "demo_web" ? "sparkles" : "file-text", title: "Preuve", lines: proofLines, group: "produce" },
    ];
    var msgs = def.channels.map(function (c, i) {
      return {
        id: "pitch_" + c, col: 3, lane: 2, stackIndex: i, stackSize: def.channels.length,
        icon: c === "phone" ? "phone" : c === "email" ? "mail" : "message",
        title: channelLabel(c), lines: [def.pitch[c] ? pitchEntry(def.pitch[c]).label : "Aucun message"], group: "produce", small: true, section: "pitch",
      };
    });
    nodes = nodes.concat(msgs);
    nodes.push({ id: "crm", col: 2, lane: 2, icon: "inbox", title: "Synchro CRM", lines: ["Lead « démo prête »", "Suivi des ouvertures"], group: "deliver" });
    nodes.push({
      id: "closer", col: 1, lane: 2, icon: "user", title: "Closer",
      lines: ["Attribué si le besoin et", "le canal lui sont ouverts"], group: "deliver",
    });

    // Ligne de collecte : arêtes estompées vers les étapes ignorées, et le flux réel passe par-dessus.
    var chain = ["maps", "filter", "inspect", "qualify", "channel"];
    var offIds = {};
    nodes.forEach(function (n) { if (n.off) offIds[n.id] = true; });
    var edges = [];
    for (var k = 0; k < chain.length - 1; k++) {
      if (offIds[chain[k]] || offIds[chain[k + 1]]) edges.push([chain[k], chain[k + 1], "off"]);
    }
    var active = chain.filter(function (id) { return !offIds[id]; });
    for (var a2 = 0; a2 < active.length - 1; a2++) {
      var adjacent = chain.indexOf(active[a2 + 1]) - chain.indexOf(active[a2]) === 1;
      edges.push([active[a2], active[a2 + 1], adjacent ? "" : "skip"]);
    }
    edges.push(["channel", "proof"]);
    msgs.forEach(function (m) { edges.push(["proof", m.id]); edges.push([m.id, "crm"]); });
    if (!msgs.length) edges.push(["proof", "crm"]);
    edges.push(["crm", "closer"]);
    return { nodes: nodes, edges: edges };
  }

  function layout(nodes) {
    nodes.forEach(function (n) {
      n.x = PAD + n.col * (NW + GX);
      if (n.small) {
        var h = 58, gap = 10;
        var total = n.stackSize * h + (n.stackSize - 1) * gap;
        n.h = h;
        n.y = LANE2 + NH / 2 - total / 2 + n.stackIndex * (h + gap);
      } else {
        n.h = NH;
        n.y = n.lane === 1 ? LANE1 : LANE2;
      }
      n.w = NW;
    });
  }

  var GROUP_COLOR = { collect: "#6366f1", qualify: "#d97706", produce: "#059669", deliver: "#0891b2" };

  function edgePath(a, b) {
    var ax, ay, bx, by;
    if (a.lane === b.lane) {
      var rightward = b.x > a.x;
      ax = rightward ? a.x + a.w : a.x;
      bx = rightward ? b.x : b.x + b.w;
      ay = a.y + a.h / 2;
      by = b.y + b.h / 2;
      var dx = (bx - ax) / 2;
      return "M" + ax + "," + ay + " C" + (ax + dx) + "," + ay + " " + (bx - dx) + "," + by + " " + bx + "," + by;
    }
    // Passage de la ligne de collecte à la ligne de production (même colonne) : vers le bas.
    ax = a.x + a.w / 2;
    ay = a.y + a.h;
    bx = b.x + b.w / 2;
    by = b.y;
    return "M" + ax + "," + ay + " C" + ax + "," + (ay + 40) + " " + bx + "," + (by - 40) + " " + bx + "," + by;
  }
  function skipPath(a, b) {
    var ax = a.x + a.w / 2, ay = a.y, bx = b.x + b.w / 2, by = b.y;
    return "M" + ax + "," + ay + " C" + ax + "," + (ay - 34) + " " + bx + "," + (by - 34) + " " + bx + "," + by;
  }

  function graphSvg(def) {
    var m = graphModel(def);
    layout(m.nodes);
    var byId = {};
    m.nodes.forEach(function (n) { byId[n.id] = n; });
    var W = PAD * 2 + 5 * NW + 4 * GX;
    var H = LANE2 + NH + 28;
    var s = [];
    s.push('<svg viewBox="0 0 ' + W + " " + H + '" width="100%" style="min-width:760px;max-width:' + W + 'px" class="block mx-auto" role="img" aria-label="Workflow de collecte du besoin ' + esc(def.label) + '">');
    s.push(
      "<defs>" +
        '<marker id="nd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a1a1aa"/></marker>' +
        '<marker id="nd-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6366f1"/></marker>' +
        '<filter id="nd-shadow" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#18181b" flood-opacity=".08"/></filter>' +
        "</defs>",
    );
    s.push('<text x="' + PAD + '" y="24" class="nd-lane">Collecte et qualification</text>');
    s.push('<text x="' + PAD + '" y="' + (LANE2 - 18) + '" class="nd-lane">Production et remise au closer</text>');

    m.edges.forEach(function (e) {
      var a = byId[e[0]], b = byId[e[1]];
      if (!a || !b) return;
      var skip = e[2] === "skip";
      var off = e[2] === "off";
      var d = skip ? skipPath(a, b) : edgePath(a, b);
      var sel = state.node && (state.node === a.id || state.node === b.id || state.node === (a.section || a.id) || state.node === (b.section || b.id));
      s.push(
        '<path d="' + d + '" fill="none" class="' + (off ? "nd-edge-off" : sel ? "nd-edge nd-edge-sel" : "nd-edge") + '" marker-end="url(#' + (sel && !off ? "nd-arrow-on" : "nd-arrow") + ')"/>',
      );
    });

    m.nodes.forEach(function (n) {
      var section = n.section || n.id;
      var selected = state.node === section || state.node === n.id;
      var color = GROUP_COLOR[n.group];
      s.push(
        '<g class="nd-node' + (n.off ? " nd-off" : "") + (selected ? " nd-sel" : "") + '" data-node="' + section + '" tabindex="0" role="button" aria-label="' + esc(n.title + " : " + n.lines.join(", ")) + '">',
      );
      s.push('<rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="14" class="nd-box" filter="url(#nd-shadow)"/>');
      s.push('<rect x="' + n.x + '" y="' + (n.y + 12) + '" width="3" height="' + (n.h - 24) + '" rx="1.5" fill="' + (n.off ? "#d4d4d8" : color) + '"/>');
      s.push(
        '<foreignObject x="' + (n.x + 12) + '" y="' + (n.y + 8) + '" width="' + (n.w - 20) + '" height="' + (n.h - 14) + '">' +
          '<div xmlns="http://www.w3.org/1999/xhtml" class="nd-body">' +
          '<div class="nd-title"><span class="nd-icon" style="color:' + (n.off ? "#a1a1aa" : color) + '">' + (C.icons[n.icon] || "") + "</span><span>" + esc(n.title) + "</span></div>" +
          n.lines.slice(0, n.small ? 1 : 3).map(function (l) { return '<div class="nd-line" title="' + esc(l) + '">' + esc(l) + "</div>"; }).join("") +
          "</div></foreignObject>",
      );
      s.push("</g>");
    });
    s.push("</svg>");
    return s.join("");
  }

  /* ---------- détails d'une étape (lecture) ---------- */

  function nodeDetails(def, node) {
    var forbidden = def.requirements.website === "forbidden";
    switch (node) {
      case "maps":
        return detail("Recherche Maps", "Le scan interroge Google Maps avec la requête et la zone choisies au lancement, puis lit chaque fiche (nom, téléphone, site, note, avis).", []);
      case "filter":
        return detail("Filtre Maps", "Premier tri, avant toute visite du site : seuls le téléphone et la présence d'un site sont connus à ce stade.", requirementLines(def).filter(function (r) { return r.stage === "Filtre Maps"; }).map(function (r) { return r.text + (r.detail ? " : " + r.detail.toLowerCase() : ""); }));
      case "inspect":
        if (forbidden) return detail("Inspection du site", "Ignorée : ce besoin ne retient que des prospects sans site.", []);
        return detail("Inspection du site", "Vérifications lancées sur le site du prospect, dans un navigateur sans historique.", def.scanModules.map(function (m) { var e = moduleEntry(m); return "<b>" + esc(e.label) + "</b> : " + esc(e.description); }), true);
      case "qualify":
        var later = requirementLines(def).filter(function (r) { return r.stage !== "Filtre Maps"; });
        return detail("Qualification finale", later.length ? "Après l'inspection, le lead est rejeté s'il manque :" : "Aucun contact écrit n'est exigé : la décision est prise dès le filtre Maps.", later.map(function (r) { return r.text; }));
      case "channel":
        return detail("Canal principal", "Le premier canal disponible, dans cet ordre, devient le canal du premier contact.", def.channels.map(function (c, i) { return (i + 1) + ". " + channelLabel(c); }));
      case "proof":
        var p = def.proof.kind === "demo_web"
          ? [C.proof.demo_web.description, "Angle : " + C.focus[def.proof.focus].label + " (" + C.focus[def.proof.focus].description.toLowerCase() + ")", "Bouton d'intérêt : « " + def.proof.interestCta + " »"]
          : [C.proof.audit_report.description, "Bouton d'intérêt : « " + def.proof.interestCta + " »"];
        if (def.flyer) p.push("Flyer PDF avec QR code vers les avis Google");
        return detail("Preuve envoyée au prospect", "", p);
      case "pitch":
        return detail("Message par canal", "Le message produit est celui du canal principal du lead.", def.channels.map(function (c) { var e = pitchEntry(def.pitch[c]); return "<b>" + esc(channelLabel(c)) + "</b> : " + esc(e.label) + " (" + esc(e.description.toLowerCase()) + ")"; }), true);
      case "crm":
        return detail("Synchro CRM", "Le lead complet (démo ou rapport, et message) part dans le CRM au statut « démo prête ». Une ouverture de la démo le fait passer en lead chaud.", []);
      case "closer":
        return detail("Closer", "Le lead est attribué à un closer à qui ce besoin et ce canal sont ouverts (onglet Équipe).", []);
      default:
        return "";
    }
  }
  function detail(title, intro, items, html) {
    return (
      '<div class="space-y-2"><h4 class="text-sm font-bold text-zinc-900">' + esc(title) + "</h4>" +
      (intro ? '<p class="text-xs text-zinc-600 leading-relaxed max-w-prose">' + esc(intro) + "</p>" : "") +
      (items.length ? '<ul class="text-xs text-zinc-700 space-y-1.5">' + items.map(function (i) { return '<li class="flex gap-2"><span class="mt-1.5 w-1 h-1 rounded-full bg-zinc-400 shrink-0"></span><span>' + (html ? i : esc(i)) + "</span></li>"; }).join("") + "</ul>" : "") +
      "</div>"
    );
  }

  /* ---------- formulaire d'édition ---------- */

  var SECTIONS = [
    { id: "identity", title: "Identité", nodes: ["identity"] },
    { id: "filter", title: "Prérequis du prospect", nodes: ["maps", "filter", "qualify"] },
    { id: "inspect", title: "Inspection du site", nodes: ["inspect"] },
    { id: "channel", title: "Canaux de contact", nodes: ["channel"] },
    { id: "proof", title: "Preuve", nodes: ["proof"] },
    { id: "pitch", title: "Messages", nodes: ["pitch", "crm", "closer"] },
    { id: "commercial", title: "Angle commercial", nodes: [] },
  ];
  function sectionFor(node) {
    var s = SECTIONS.find(function (x) { return x.id === node || x.nodes.indexOf(node) >= 0; });
    return s ? s.id : "identity";
  }

  var inputCls = "w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500";
  var labelCls = "block text-xs font-semibold text-zinc-700 mb-1";

  function radio(name, value, checked, label, desc, disabled) {
    return (
      '<label class="flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ' + (checked ? "border-indigo-300 bg-indigo-50/60" : "border-zinc-200 hover:bg-zinc-50") + (disabled ? " opacity-50 pointer-events-none" : "") + '">' +
      '<input type="radio" name="' + name + '" value="' + value + '"' + (checked ? " checked" : "") + (disabled ? " disabled" : "") + ' class="mt-0.5 text-indigo-600 focus:ring-indigo-500">' +
      '<span><span class="block text-sm font-semibold text-zinc-900">' + esc(label) + "</span>" + (desc ? '<span class="block text-xs text-zinc-500">' + esc(desc) + "</span>" : "") + "</span></label>"
    );
  }

  function sectionBody(id, d) {
    var forbidden = d.requirements.website === "forbidden";
    if (id === "identity") {
      return (
        '<div class="grid sm:grid-cols-2 gap-3">' +
        '<div class="sm:col-span-2"><label class="' + labelCls + '" for="nd-label">Nom du besoin</label><input id="nd-label" data-f="label" class="' + inputCls + '" value="' + esc(d.label) + '" placeholder="Ex. Refonte de site"></div>' +
        '<div><label class="' + labelCls + '" for="nd-id">Identifiant technique</label><input id="nd-id" data-f="id" class="' + inputCls + ' font-mono" value="' + esc(d.id) + '"' + (state.mode === "create" ? "" : " disabled") + ' placeholder="refonte_site"><span class="block text-[11px] text-zinc-500 mt-1">' + (state.mode === "create" ? "Stocké sur chaque lead ; non modifiable ensuite." : "Non modifiable : les leads existants le portent.") + "</span></div>" +
        '<div><label class="' + labelCls + '" for="nd-status">Statut</label><select id="nd-status" data-f="status" class="' + inputCls + '">' +
        Object.keys(C.status).map(function (k) { return '<option value="' + k + '"' + (d.status === k ? " selected" : "") + ">" + esc(C.status[k].label + " : " + C.status[k].description) + "</option>"; }).join("") +
        "</select></div>" +
        '<div><label class="' + labelCls + '" for="nd-badge">Texte du badge</label><input id="nd-badge" data-f="badge.text" class="' + inputCls + '" value="' + esc(d.badge.text) + '" placeholder="Refonte"></div>' +
        '<div><span class="' + labelCls + '">Couleur du badge</span><div class="flex flex-wrap gap-1.5">' +
        Object.keys(TONES).map(function (t) {
          return '<button type="button" data-tone="' + t + '" class="px-2.5 py-1 rounded-full border text-xs font-semibold ' + TONES[t].chip + (d.badge.tone === t ? " ring-2 ring-offset-1 ring-indigo-500" : "") + '">' + esc(C.tones[t].label) + "</button>";
        }).join("") +
        "</div></div>" +
        '<div class="sm:col-span-2"><span class="' + labelCls + '">Icône</span><div class="flex flex-wrap gap-1.5">' +
        C.needIcons.map(function (n) {
          return '<button type="button" data-icon="' + n + '" title="' + n + '" class="w-9 h-9 p-2 rounded-lg border ' + (d.icon === n ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50") + '">' + (C.icons[n] || "") + "</button>";
        }).join("") +
        "</div></div></div>"
      );
    }
    if (id === "filter") {
      var allOf = d.requirements.contacts.allOf || [];
      var anyOf = d.requirements.contacts.anyOf || [];
      return (
        '<div class="space-y-4"><div><span class="' + labelCls + '">Site du prospect</span><div class="grid sm:grid-cols-3 gap-2">' +
        ["optional", "required", "forbidden"].map(function (k) { return radio("nd-website", k, d.requirements.website === k, C.website[k].label, C.website[k].description); }).join("") +
        "</div></div>" +
        '<div><span class="' + labelCls + '">Contacts exigés</span><p class="text-[11px] text-zinc-500 mb-2">« Obligatoire » : le lead est rejeté sans ce contact. « Au moins un » : il en faut un parmi ceux marqués ainsi. Seuls les canaux utilisés sont proposés.</p>' +
        '<div class="divide-y divide-zinc-100 border border-zinc-200 rounded-xl">' +
        C.channels.map(function (c) {
          var used = d.channels.indexOf(c.id) >= 0;
          var v = allOf.indexOf(c.id) >= 0 ? "all" : anyOf.indexOf(c.id) >= 0 ? "any" : "none";
          var blocked = forbidden && c.id !== "phone";
          return (
            '<div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5' + (used ? "" : " opacity-50") + '"><span class="text-sm font-medium text-zinc-800">' + esc(c.label) + (used ? "" : ' <span class="text-[11px] text-zinc-500 font-normal">(canal non utilisé)</span>') + (blocked ? ' <span class="text-[11px] text-zinc-500 font-normal">(introuvable sans site)</span>' : "") + "</span>" +
            '<div class="inline-flex rounded-lg border border-zinc-200 overflow-hidden text-xs font-semibold">' +
            [["none", "Non exigé"], ["all", "Obligatoire"], ["any", "Au moins un"]].map(function (o) {
              var dis = !used || (blocked && o[0] !== "none");
              return '<button type="button" data-contact="' + c.id + '" data-v="' + o[0] + '"' + (dis ? " disabled" : "") + ' class="px-2.5 py-1.5 ' + (v === o[0] ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50") + (dis ? " cursor-not-allowed" : "") + '">' + o[1] + "</button>";
            }).join("") +
            "</div></div>"
          );
        }).join("") +
        "</div></div></div>"
      );
    }
    if (id === "inspect") {
      if (forbidden) return '<p class="text-sm text-zinc-600">Pas d\'inspection : ce besoin ne retient que des prospects sans site. Les vérifications choisies restent enregistrées mais ne sont pas lancées.</p>';
      return (
        '<div class="grid sm:grid-cols-2 gap-2">' +
        C.modules.map(function (m) {
          var on = d.scanModules.indexOf(m.id) >= 0;
          return (
            '<label class="flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer ' + (on ? "border-indigo-300 bg-indigo-50/60" : "border-zinc-200 hover:bg-zinc-50") + '"><input type="checkbox" data-module="' + m.id + '"' + (on ? " checked" : "") + ' class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">' +
            '<span><span class="block text-sm font-semibold text-zinc-900">' + esc(m.label) + '</span><span class="block text-xs text-zinc-500">' + esc(m.description) + "</span></span></label>"
          );
        }).join("") +
        "</div>"
      );
    }
    if (id === "channel") {
      var order = d.channels.concat(C.channels.map(function (c) { return c.id; }).filter(function (c) { return d.channels.indexOf(c) < 0; }));
      return (
        '<p class="text-[11px] text-zinc-500 mb-2">Le premier canal disponible pour un prospect devient son canal principal. Chaque canal utilisé reçoit un message (section Messages).</p>' +
        '<ol class="space-y-2">' +
        order.map(function (cid) {
          var used = d.channels.indexOf(cid) >= 0;
          var idx = d.channels.indexOf(cid);
          var c = C.channels.find(function (x) { return x.id === cid; });
          return (
            '<li class="flex items-center gap-3 p-2.5 rounded-xl border ' + (used ? "border-zinc-200 bg-white" : "border-dashed border-zinc-200 bg-zinc-50") + '">' +
            '<span class="w-6 text-center text-sm font-bold ' + (used ? "text-zinc-900" : "text-zinc-300") + '">' + (used ? idx + 1 : "") + "</span>" +
            '<label class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"><input type="checkbox" data-channel="' + cid + '"' + (used ? " checked" : "") + ' class="rounded text-indigo-600 focus:ring-indigo-500"><span class="min-w-0"><span class="block text-sm font-semibold text-zinc-900">' + esc(c.label) + '</span><span class="block text-xs text-zinc-500 truncate">' + esc(c.description) + "</span></span></label>" +
            (used
              ? '<span class="flex gap-1"><button type="button" data-move="' + cid + '" data-dir="-1"' + (idx === 0 ? " disabled" : "") + ' class="w-8 h-8 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30" aria-label="Monter">↑</button><button type="button" data-move="' + cid + '" data-dir="1"' + (idx === d.channels.length - 1 ? " disabled" : "") + ' class="w-8 h-8 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30" aria-label="Descendre">↓</button></span>'
              : "") +
            "</li>"
          );
        }).join("") +
        "</ol>"
      );
    }
    if (id === "proof") {
      var demo = d.proof.kind === "demo_web";
      var auditOk = d.requirements.website === "required";
      return (
        '<div class="space-y-4"><div class="grid sm:grid-cols-2 gap-2">' +
        radio("nd-proof", "demo_web", demo, C.proof.demo_web.label, C.proof.demo_web.description) +
        radio("nd-proof", "audit_report", !demo, C.proof.audit_report.label, auditOk ? C.proof.audit_report.description : "Exige « Site exigé » dans les prérequis.", !auditOk && demo) +
        "</div>" +
        (demo
          ? '<div><span class="' + labelCls + '">Angle de la démo</span><div class="grid sm:grid-cols-2 gap-2">' + Object.keys(C.focus).map(function (k) { return radio("nd-focus", k, d.proof.focus === k, C.focus[k].label, C.focus[k].description); }).join("") + "</div></div>"
          : "") +
        '<div><label class="' + labelCls + '" for="nd-cta">Bouton d\'intérêt montré au prospect</label><input id="nd-cta" data-f="proof.interestCta" class="' + inputCls + '" value="' + esc(d.proof.interestCta) + '"></div>' +
        '<label class="flex items-center gap-2 text-sm text-zinc-800"><input type="checkbox" data-f-bool="flyer"' + (d.flyer ? " checked" : "") + ' class="rounded text-indigo-600 focus:ring-indigo-500"> Joindre le flyer PDF (QR code vers les avis Google)</label></div>'
      );
    }
    if (id === "pitch") {
      if (!d.channels.length) return '<p class="text-sm text-zinc-600">Choisissez d\'abord au moins un canal.</p>';
      return (
        '<div class="space-y-3">' +
        d.channels.map(function (cid) {
          var kind = cid === "phone" ? "phone_battlecard" : "cold_email";
          var options = C.pitch.filter(function (p) { return p.kind === kind && (p.id !== "tracker_cold_email" || d.proof.kind === "audit_report"); });
          return (
            '<div><span class="' + labelCls + '">' + esc(channelLabel(cid)) + '</span><div class="grid sm:grid-cols-2 gap-2">' +
            options.map(function (p) { return radio("nd-pitch-" + cid, p.id, d.pitch[cid] === p.id, p.label, p.description); }).join("") +
            "</div></div>"
          );
        }).join("") +
        "</div>"
      );
    }
    if (id === "commercial") {
      return (
        '<div class="space-y-3"><div><span class="' + labelCls + '">Modèle commercial</span><div class="grid sm:grid-cols-3 gap-2">' +
        Object.keys(C.businessModel).map(function (k) { return radio("nd-bm", k, d.commercial.businessModel === k, C.businessModel[k].label, C.businessModel[k].description); }).join("") +
        "</div></div>" +
        '<div><label class="' + labelCls + '" for="nd-focusc">Angle commercial (repris dans la consigne du message)</label><textarea id="nd-focusc" data-f="commercial.pitchFocus" rows="2" class="' + inputCls + '">' + esc(d.commercial.pitchFocus) + "</textarea></div></div>"
      );
    }
    return "";
  }

  function setPath(obj, path, value) {
    var parts = path.split(".");
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
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

  function toggleChannel(d, cid, on) {
    if (on && d.channels.indexOf(cid) < 0) {
      d.channels.push(cid);
      if (!d.pitch[cid]) d.pitch[cid] = DEFAULT_PITCH[cid];
      if (cid === "email" && d.scanModules.indexOf("contacts_legal") < 0) d.scanModules.push("contacts_legal");
      if (cid === "contact_form" && d.scanModules.indexOf("contact_form") < 0) d.scanModules.push("contact_form");
    }
    if (!on) {
      d.channels = d.channels.filter(function (c) { return c !== cid; });
      delete d.pitch[cid];
      setContact(d, cid, "none");
    }
  }

  /* ---------- rendu ---------- */

  function render() {
    var def = current();
    root.innerHTML =
      '<div class="grid lg:grid-cols-[17rem_minmax(0,1fr)] gap-5 items-start">' +
      '<aside class="space-y-3">' +
      '<div class="flex items-center justify-between"><h2 class="text-sm font-bold text-zinc-900">Besoins</h2>' +
      '<button type="button" data-act="new" class="text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg px-3 py-1.5">Nouveau besoin</button></div>' +
      '<div id="nd-list" class="space-y-2"></div></aside>' +
      '<div class="min-w-0 space-y-4">' +
      (def
        ? '<div id="nd-header" class="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5"></div>' +
          '<div id="nd-errors"></div>' +
          '<div class="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-4 min-w-0"><div class="flex flex-wrap items-center justify-between gap-2 mb-2"><h3 class="text-sm font-bold text-zinc-900">Workflow de collecte</h3><span class="text-[11px] text-zinc-500">Cliquez une étape pour ' + (state.mode === "view" ? "la détailler" : "la régler") + "</span></div>" +
          '<div id="nd-graph" class="overflow-x-auto -mx-1 px-1"></div></div>' +
          '<div class="grid xl:grid-cols-[18rem_minmax(0,1fr)] gap-4 items-start">' +
          '<div id="nd-prereq" class="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-4"></div>' +
          '<div id="nd-panel" class="min-w-0"></div></div>'
        : '<div class="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-8 text-sm text-zinc-500">Aucun besoin. Créez-en un.</div>') +
      "</div></div>";
    renderList();
    if (def) {
      renderHeader();
      renderErrors();
      renderGraph();
      renderPrereq();
      renderPanel();
    }
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
        : '<button type="button" data-act="save"' + (state.errors.length || state.saving ? " disabled" : "") + ' class="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white rounded-lg px-3 py-2">' + (state.saving ? "Enregistrement…" : state.mode === "create" ? "Créer le besoin" : "Enregistrer") + "</button>" +
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

  function renderGraph() {
    var el = document.getElementById("nd-graph");
    if (el) el.innerHTML = graphSvg(current());
  }

  function renderPrereq() {
    var el = document.getElementById("nd-prereq");
    if (!el) return;
    var d = current();
    var lines = requirementLines(d);
    el.innerHTML =
      '<h3 class="text-sm font-bold text-zinc-900 mb-3">Ce que ce besoin exige</h3><ul class="space-y-2.5">' +
      lines.map(function (l) {
        return '<li class="text-xs"><span class="block font-semibold text-zinc-900">' + esc(l.text) + '</span><span class="block text-zinc-500">Vérifié : ' + esc(l.stage.toLowerCase()) + "</span></li>";
      }).join("") +
      "</ul>" +
      '<div class="mt-4 pt-3 border-t border-zinc-100 text-xs text-zinc-600 space-y-1">' +
      "<p><b class=\"text-zinc-900\">Premier contact :</b> " + esc(d.channels.map(channelLabel).join(", puis ") || "aucun canal") + "</p>" +
      "<p><b class=\"text-zinc-900\">Preuve :</b> " + esc(d.proof.kind === "demo_web" ? C.proof.demo_web.label + " (" + C.focus[d.proof.focus].label.toLowerCase() + ")" : C.proof.audit_report.label) + "</p>" +
      "<p><b class=\"text-zinc-900\">Modèle :</b> " + esc(C.businessModel[d.commercial.businessModel].label) + "</p>" +
      (d.commercial.pitchFocus ? '<p class="text-zinc-500">' + esc(d.commercial.pitchFocus) + "</p>" : "") +
      "</div>";
  }

  function renderPanel() {
    var el = document.getElementById("nd-panel");
    if (!el) return;
    var d = current();
    if (state.mode === "view") {
      el.innerHTML =
        '<div class="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5">' +
        ((state.node && nodeDetails(d, state.node)) || '<p class="text-xs text-zinc-500">Cliquez une étape du workflow pour voir ce qu\'elle fait pour ce besoin.</p>') +
        "</div>";
      return;
    }
    var open = state.node ? sectionFor(state.node) : null;
    el.innerHTML =
      '<div class="space-y-3">' +
      SECTIONS.map(function (s) {
        var isOpen = s.id === open;
        return (
          '<div class="bg-white rounded-2xl border ' + (isOpen ? "border-indigo-200 shadow-sm" : "border-zinc-200/80") + '" data-section="' + s.id + '">' +
          '<button type="button" data-open="' + s.id + '" class="w-full flex items-center justify-between px-5 py-3.5 text-left" aria-expanded="' + isOpen + '"><span class="text-sm font-bold text-zinc-900">' + esc(s.title) + '</span><span class="text-zinc-400 text-xs">' + (isOpen ? "Masquer" : "Afficher") + "</span></button>" +
          (isOpen ? '<div class="px-5 pb-5">' + sectionBody(s.id, d) + "</div>" : "") +
          "</div>"
        );
      }).join("") +
      "</div>";
  }

  function rerenderEditor() {
    renderHeader();
    renderGraph();
    renderPrereq();
    renderPanel();
    scheduleValidation();
  }

  /* ---------- événements ---------- */

  root.addEventListener("click", function (e) {
    var t = e.target.closest("button, [data-node]");
    if (!t || !root.contains(t)) return;
    var d = state.draft;

    if (t.dataset.select) {
      if (state.mode !== "view" && !confirm("Abandonner les modifications en cours ?")) return;
      state.mode = "view";
      state.draft = null;
      state.errors = [];
      state.history = null;
      state.message = null;
      state.node = null;
      state.selectedId = t.dataset.select;
      render();
      return;
    }
    if (t.dataset.node) {
      state.node = state.node === t.dataset.node && state.mode === "view" ? null : t.dataset.node;
      renderGraph();
      renderPanel();
      var panel = document.getElementById("nd-panel");
      if (panel && state.node && window.innerWidth < 1280) panel.scrollIntoView({ behavior: "smooth", block: "start" });
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
      state.mode = "edit";
      state.draft = clone(h.definition);
      state.draft.id = it.def.id;
      state.baseVersion = it.version;
      state.history = null;
      state.message = { tone: "ok", text: "Version " + h.version + " chargée : vérifiez puis enregistrez pour la rétablir." };
      render();
      scheduleValidation();
      return;
    }
    if (t.dataset.open) {
      var sec = SECTIONS.find(function (s) { return s.id === t.dataset.open; });
      var wasOpen = !!state.node && sectionFor(state.node) === sec.id;
      state.node = wasOpen ? null : sec.id;
      renderPanel();
      renderGraph();
      return;
    }
    if (!d) return;
    if (t.dataset.tone) {
      d.badge.tone = t.dataset.tone;
      rerenderEditor();
      renderList();
      return;
    }
    if (t.dataset.icon) {
      d.icon = t.dataset.icon;
      rerenderEditor();
      return;
    }
    if (t.dataset.contact) {
      setContact(d, t.dataset.contact, t.dataset.v);
      rerenderEditor();
      return;
    }
    if (t.dataset.move) {
      var i = d.channels.indexOf(t.dataset.move);
      var j = i + Number(t.dataset.dir);
      if (i < 0 || j < 0 || j >= d.channels.length) return;
      var tmp = d.channels[i];
      d.channels[i] = d.channels[j];
      d.channels[j] = tmp;
      rerenderEditor();
    }
  });

  root.addEventListener("keydown", function (e) {
    var g = e.target.closest && e.target.closest("[data-node]");
    if (g && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      g.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  });

  root.addEventListener("input", function (e) {
    var t = e.target;
    var d = state.draft;
    if (!d || !t.dataset || !t.dataset.f) return;
    var v = t.value;
    setPath(d, t.dataset.f, v);
    if (t.dataset.f === "label" && state.mode === "create" && !d._idTouched) {
      d.id = slug(v);
      var idInput = document.getElementById("nd-id");
      if (idInput) idInput.value = d.id;
    }
    if (t.dataset.f === "id") d._idTouched = true;
    renderHeader();
    renderGraph();
    renderPrereq();
    scheduleValidation();
  });

  root.addEventListener("change", function (e) {
    var t = e.target;
    var d = state.draft;
    if (!d) return;
    if (t.dataset && t.dataset.f) {
      // Champs texte : déjà pris en compte à la saisie (événement input). Redessiner l'éditeur ici remplacerait
      // le champ ou le bouton que l'utilisateur est en train de viser.
      if (t.tagName !== "SELECT") return;
      setPath(d, t.dataset.f, t.value);
      rerenderEditor();
      return;
    }
    if (t.dataset && t.dataset.fBool) {
      d[t.dataset.fBool] = t.checked;
      rerenderEditor();
      return;
    }
    if (t.dataset && t.dataset.module) {
      if (t.checked && d.scanModules.indexOf(t.dataset.module) < 0) d.scanModules.push(t.dataset.module);
      if (!t.checked) d.scanModules = d.scanModules.filter(function (m) { return m !== t.dataset.module; });
      rerenderEditor();
      return;
    }
    if (t.dataset && t.dataset.channel) {
      toggleChannel(d, t.dataset.channel, t.checked);
      rerenderEditor();
      return;
    }
    if (t.name === "nd-website") {
      d.requirements.website = t.value;
      if (t.value === "forbidden") {
        // Sans site, l'email et le formulaire sont introuvables : ces canaux sont retirés.
        ["email", "contact_form"].forEach(function (c) { toggleChannel(d, c, false); });
        if (d.channels.indexOf("phone") < 0) toggleChannel(d, "phone", true);
      }
      if (t.value !== "required" && d.proof.kind === "audit_report") {
        d.proof = { kind: "demo_web", generator: "llm_demo", focus: "showcase", interestCta: d.proof.interestCta };
        Object.keys(d.pitch).forEach(function (c) { if (d.pitch[c] === "tracker_cold_email") d.pitch[c] = "llm_cold_email"; });
      }
    } else if (t.name === "nd-proof") {
      d.proof = t.value === "demo_web"
        ? { kind: "demo_web", generator: "llm_demo", focus: d.proof.focus || "showcase", interestCta: d.proof.interestCta }
        : { kind: "audit_report", generator: "tracker_report", interestCta: d.proof.interestCta };
      if (t.value === "demo_web") Object.keys(d.pitch).forEach(function (c) { if (d.pitch[c] === "tracker_cold_email") d.pitch[c] = "llm_cold_email"; });
    } else if (t.name === "nd-focus") {
      d.proof.focus = t.value;
    } else if (t.name && t.name.indexOf("nd-pitch-") === 0) {
      d.pitch[t.name.slice("nd-pitch-".length)] = t.value;
    } else if (t.name === "nd-bm") {
      d.commercial.businessModel = t.value;
    } else {
      return;
    }
    rerenderEditor();
  });

  window.addEventListener("beforeunload", function (e) {
    if (state.mode !== "view") {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /* ---------- styles du graphe ---------- */

  var style = document.createElement("style");
  style.textContent =
    ".nd-lane{font:600 11px 'Plus Jakarta Sans',system-ui,sans-serif;fill:#71717a}" +
    ".nd-edge{stroke:#a1a1aa;stroke-width:1.6;stroke-dasharray:5 5;animation:nd-flow 1.2s linear infinite}" +
    ".nd-edge-sel{stroke:#6366f1;stroke-width:2}" +
    ".nd-edge-off{stroke:#e4e4e7;stroke-width:1.4;stroke-dasharray:3 5}" +
    "@keyframes nd-flow{to{stroke-dashoffset:-20}}" +
    ".nd-node{cursor:pointer;outline:none}" +
    ".nd-box{fill:#fff;stroke:#e4e4e7;stroke-width:1;transition:stroke .2s,fill .2s}" +
    ".nd-node:hover .nd-box{stroke:#a1a1aa}" +
    ".nd-node:focus-visible .nd-box,.nd-sel .nd-box{stroke:#6366f1;stroke-width:2;fill:#fafaff}" +
    ".nd-off .nd-box{fill:#fafafa;stroke-dasharray:4 4}" +
    ".nd-off .nd-body{opacity:.55}" +
    ".nd-body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;height:100%;overflow:hidden}" +
    ".nd-title{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:#18181b;margin-bottom:3px;line-height:1.2}" +
    ".nd-icon{width:15px;height:15px;flex:none;display:inline-block}" +
    ".nd-line{font-size:11px;color:#52525b;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    "@media (prefers-reduced-motion:reduce){.nd-edge{animation:none}}";
  document.head.appendChild(style);

  load(new URLSearchParams(location.search).get("need"));
})();
